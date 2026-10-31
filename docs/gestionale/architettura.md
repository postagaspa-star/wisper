# Wisper gestionale: com'è fatto (accordo tecnico)

Accordo tra i pezzi del gestionale, deciso il 21/10/2026 dopo la fase 0
(https://claude.ai/artifact/QVfYKsoDJt79DEzeTvoxid, decisioni in CLAUDE.md). Chi costruisce un pezzo segue questo
file; se serve cambiarlo, lo dice invece di inventare. Vale per tutte le fasi; ogni fase aggiunge tabelle e azioni
nella sua sezione in fondo.

## 1. I pezzi

| Pezzo | Dove | Cosa fa |
|---|---|---|
| **Server** | `server/` (Node.js 24, nessuna dipendenza npm) | Unico posto dei dati e dei conti. Database SQLite (`node:sqlite`), HTTP con `node:http`. Gira in Docker sul NAS di casa (porta 8400), da fuori con un contenitore Tailscale accanto, come Sol e Pactum. |
| **App Android** | `app/` | Come oggi, ma parla col server invece che col foglio, con nome e password. Ogni modulo nuovo c'è anche qui (decisione 2). |
| **Wisper Ufficio** | `pc/` | Come oggi, ma parla col server. Ogni modulo nuovo c'è anche qui. |
| **Lo script del foglio** | `apps-script/Code.gs` | Dopo il cambio: **ponte** (inoltra al server le richieste delle versioni vecchie) e **postino** (email dal Gmail del foglio, copia di sicurezza su Drive, copia notturna dei dati nel foglio). |

Regola che non cambia: **i conti li fa solo il server**. Telefono e computer mostrano e propongono (anteprima del
totale mentre si compila), il server decide e salva.

## 2. Il protocollo (uguale a quello dello script)

Il server parla come `Code.gs`, così app e programma cambiano solo indirizzo e credenziali:

- `GET  /exec?azione=<azione>&...parametri` per le letture;
- `POST /exec` con corpo JSON `{"azione": "...", ...}` per tutto (letture e scritture). Il `Content-Type` può essere
  `text/plain` o `application/json`: si legge il corpo grezzo;
- `GET /file/<id>`: il file (foto, firma, documento) in binario, col suo `Content-Type`;
- `GET /salute`: `{"ok":true,"versione":"x.y.z","database":"ok"}` senza accesso (serve al controllo del NAS).

**Chi chiama.** Ogni richiesta, tranne `accedi` e `salute`, porta `Authorization: Bearer <token>`. Il token lo dà
`accedi`. I campi `disp`, `dispNome`, `app` restano come oggi (registro degli accessi).

**Risposte.** Sempre HTTP 200 con `{"ok": true, ...}` oppure `{"ok": false, "errore": "frase da mostrare"}`: le app
trattano `ok:false` come "il server ha detto di no, riprovare uguale non serve" (la coda del telefono si ferma su
quel rapportino) e un errore HTTP o di rete come "riprova". In più:
- accesso mancante, scaduto o revocato: `{"ok":false,"errore":"Accesso scaduto: entra di nuovo","accesso":false}`;
  le app tornano alla schermata di accesso senza perdere la coda;
- permesso mancante: `{"ok":false,"errore":"Non hai il permesso per ...","permesso":false}`.
Solo `/file/<id>` usa i codici HTTP (401, 403, 404).

**Stesse forme di oggi.** Le azioni che esistono in `Code.gs` rispondono con gli stessi campi e lo stesso
significato (`anagrafiche`, `rapportini`, `file`, `documenti`, `salvaRapportino`, `caricaFile`, `togliFile`, `stato`,
`creaCliente`, `aggiornaCliente`, `creaCommessa`, `aggiornaCommessa`, `statoCommessa`, `salvaImpostazioni`,
`inviaEmail`). I campi nuovi si aggiungono, non si tolgono né si rinominano. `salvaGruppo` e `collegaComputer` non ci
sono più (`errore: "Non serve più"`).

**Le URL dei file.** Nei campi `foto`, `firma`, `FIRMA_TECNICO`, documenti: `url` = `"/file/<id>"` (relativa al
server). Gli `id` dei file copiati da Drive restano **gli stessi id di Drive**, così ogni riferimento vecchio continua
a funzionare; i file nuovi hanno un id casuale di 28 caratteri `[A-Za-z0-9_-]`.

## 3. Accesso, ruoli, permessi

**Utenti.** Nome, email (per entrare), ruolo, password (scrypt di `node:crypto`, sale per utente), attivo sì/no.
Il primo titolare si crea dal NAS con `node server/strumenti/utente.js --titolare "Nome" email` (chiede la password
da tastiera, non la scrive da nessuna parte). Poi gli utenti li gestisce chi ha il permesso, da Amministrazione.

**Sessioni.** `accedi {email, password, disp, dispNome, app}` → `{token, utente, permessi}`. Il token (32 byte
casuali, base64url) si salva sul dispositivo (telefono: preferenze private; computer: DPAPI, come oggi il codice) e
nel database solo come SHA-256. Dura finché non si esce o non viene revocato (un telefono resta collegato); scade
dopo 180 giorni senza uso. 10 tentativi sbagliati in 15 minuti per la stessa email = attesa di 15 minuti (avviso nel
registro). `esci` revoca il token. Da Amministrazione si vedono e si revocano le sessioni di ognuno.

**Ruoli.** I quattro delle specifiche: `titolare`, `amministrazione`, `collaboratore`, `lettura` (più `cliente` ed
`esterno` nelle fasi 6-7). **Permessi per modulo**, tabella modificabile da chi ha `amministrazione` in scrittura.
Livelli: `0` niente, `1` lettura, `2` scrittura. Moduli: le 18 voci del menu (`dashboard`, `clienti`, `commesse`,
`preventivi`, `attivita`, `rapportini`, `spese`, `fatturazione`, `banche`, `persone`, `documenti`, `ticket`, `mezzi`,
`comunicazioni`, `portale`, `collaboratori`, `integrazioni`, `amministrazione`) più due chiavi speciali:

- `costi`: vedere tariffe, totali, costi orari, budget in euro, margini. Con `costi = 0` **il server toglie quei campi
  dalle risposte** (non li nasconde l'app): restano ore, km, descrizioni;
- `riservati`: stipendi e documenti personali (fase 6). Solo titolare, di base.

Valori iniziali:

| | titolare | amministrazione | collaboratore | lettura |
|---|---|---|---|---|
| tutti i moduli | 2 | 2 | vedi sotto | 1 |
| `amministrazione` | 2 | 1 | 0 | 0 |
| `costi` | 2 | 2 | 0 | 1 |
| `riservati` | 2 | 0 | 0 | 0 |

Collaboratore: `dashboard` 1, `clienti` 1, `commesse` 1, `rapportini` 2 (**solo i suoi**: quelli col suo
`utente_id`; vede e scrive solo quelli), `attivita` 2, `spese` 2 (solo le sue), `documenti` 1, `ticket` 2, `mezzi` 1,
gli altri 0. Il titolare ha sempre tutto e non si può togliere l'ultimo titolare attivo.

**Dove si controlla.** Ogni azione dichiara modulo e livello che le servono; il controllo sta in un punto solo del
server, prima dell'azione. Le app nascondono le voci senza permesso, ma la garanzia è il server. Ogni ruolo ha le sue
prove automatiche "non deve vedere / non deve scrivere".

## 4. Il registro

Due tabelle:
- `accessi`: ogni richiesta (quando, esito, azione, utente, dispositivo, app), come la scheda Accessi di oggi; oltre
  60.000 righe si tolgono le più vecchie una volta al giorno;
- `registro`: ogni modifica ai dati (quando, chi, dispositivo, azione, tabella, id, `prima` e `dopo` in JSON, solo i
  campi cambiati). Non si modifica e non si cancella da nessuna azione. Si legge da Amministrazione › Registro attività
  (filtri per persona, tabella, giorno, id).

Mai nel registro: password, token, il contenuto dei file.

## 5. Il database (fase 1)

SQLite in `/data/wisper.db` (WAL, `foreign_keys = ON`). Migrazioni numerate in `server/src/migrazioni/` (001, 002,
…), applicate all'avvio in una transazione, con copia `wisper.db.prima-<n>` prima di ognuna. Importi in euro come
numeri decimali, arrotondati al centesimo come oggi (`centesimi()`); date `aaaa-mm-gg`, istanti ISO con fuso.

- `utenti` (id, nome, email unica, ruolo, password_hash, attivo, creato, ultimo_accesso)
- `sessioni` (token_hash, utente_id, disp, disp_nome, app, creata, ultimo_uso, revocata)
- `permessi` (ruolo, modulo, livello)
- `tentativi_accesso` (email, quando)
- `accessi`, `registro` (sopra), `dispositivi` (id, nome, app, primo, ultimo, utente_id, note)
- `impostazioni` (chiave, valore, descrizione): le stesse chiavi di oggi (`EURO_KM`, `AUTO`, `COSTO_ORARIO`,
  `TICKET_ATTIVO`, `TECNICO`, `RAGIONE_SOCIALE`, `INDIRIZZO`, `PARTITA_IVA`, `EMAIL`, `TELEFONO`, `PEC`,
  `FIRMA_TECNICO`, `EMAIL_AVVISI`) più quelle nuove delle fasi
- `numerazioni` (tipo, formato, ultimo, annuale): `commessa` = `{AA}ST{NNN}`, numero che continua tra gli anni
  (decisione 3); `rapportino` = `RAP/{AAAA}/{NNNN}`, riparte ogni anno. Segnaposti: `{AAAA}`, `{AA}`, `{N…}` (tante
  N quante cifre minime). Il prossimo numero è sempre "il più alto già usato + 1", come oggi: i buchi non si
  riusano. Cambiare formato vale solo per i numeri nuovi
- `soggetti`: clienti e fornitori in un'anagrafica sola. `id` `C001…` (clienti) o `F001…` (fornitori, se nasce come
  fornitore); `cliente` 0/1, `fornitore` 0/1; `nome` (ragione sociale), `alias` (testo, separati da virgola),
  `gruppo` (solo fogli vecchi), `email`, `pec`, `telefono`, `partita_iva` e `codice_fiscale` (sempre testo),
  `codice_sdi`, `indirizzo`, `cap`, `citta`, `provincia`, `nazione` (di base `IT`), `tariffa_fissa`, `costo_fisso`,
  `ultima_tariffa`, `paga_viaggio`, `km_rimborsati`, `magg_extra`, `accorpato_in`, `note`, `archiviato`, `creato`,
  `modificato`. Doppioni: stesso nome o alias normalizzato, **o stessa partita IVA** (se scritta) → si restituisce
  quello che c'è (`giaEsisteva: true`), come oggi
- `referenti` (id, soggetto_id, nome, ruolo, email, telefono, note, ordine)
- `sedi` (id, soggetto_id, tipo `sede`|`impianto`, nome, indirizzo, cap, citta, provincia, note, archiviata)
- `commesse`: i campi di oggi (`id` = codice, `cliente_id`, `descrizione`, `stato` APERTA|SOSPESA|CHIUSA,
  `indirizzo`, `budget_ore`, `budget_euro`, `prezzo_orario`, `costo_orario`, `euro_km`, `inizio`, `fine_prevista`,
  `cartella` (la cartella Drive di prima), `codice_precedente`, `note`) più `sede_id`, `responsabile_id` (utente),
  `importo_contratto`, `archiviata`, `modello` (0/1: una commessa modello non compare negli elenchi normali),
  `creato`, `modificato`
- `commessa_persone` (commessa_id, utente_id): i collaboratori della commessa
- `prestazioni` (id, commessa_id, nome, descrizione, valore, avanzamento 0-100, stato `da_fare`|`in_corso`|`fatta`,
  ordine)
- `rapportini`: le colonne di oggi una per una (vedi `SCHEMA.Rapportini` in Code.gs) più `utente_id` (chi l'ha
  scritto) e `stato_prima` (per ripristinare un annullato). `id` (RAP/…) unico, `id_locale` unico
- `file` (id, nome, mime, byte, sha256, percorso sotto `/data/file/`, tipo `spesa`|`firma`|`firmaTecnico`|
  `documento`, rapportino_id, commessa_id, id_client (l'`idFile` del telefono, per non creare doppioni), drive_url
  (se copiato da Drive), creato, cestinato). Le foto di un rapportino sono i suoi file `spesa` non cestinati, in
  ordine di creazione

**Cancellare.** Nessuna azione cancella clienti, fornitori o commesse: si archiviano (`archiviato`/`archiviata`) e si
ripristinano. I rapportini si annullano (`ANNULLATO`, si ripristinano con lo stato di prima). I file vanno nel
cestino (`cestinato`), recuperabili da Amministrazione.

## 6. Le azioni nuove della fase 1

Tutte con `ok`, e con modulo/livello richiesto tra parentesi.

- `accedi`, `esci`, `io` (chi sono, ruolo, permessi, impostazioni dell'interfaccia), `cambiaPassword` (se stessi)
- `utenti` (amministrazione 1), `salvaUtente` (amministrazione 2: crea o modifica nome, email, ruolo, attivo; una
  password nuova la sceglie l'amministratore e la comunica a voce), `sessioni` / `revocaSessione` (amministrazione 2)
- `permessi` (amministrazione 1), `salvaPermessi` (amministrazione 2)
- `registro {da, a, utente, tabella, idRiga, pagina}` (amministrazione 1), `accessi {…}` (amministrazione 1)
- `numerazioni` (amministrazione 1), `salvaNumerazione` (amministrazione 2)
- `dashboard` (dashboard 1): i numeri e gli elenchi brevi per la pagina iniziale, già divisi in `urgenti`,
  `settimana`, `pianificare`, ciascuno con `{tipo, titolo, dettaglio, quanto, collegamento}` dove `collegamento` dice
  quale elenco aprire con quale filtro; i numeri economici solo con `costi`
- `anagrafiche` restituisce anche `fornitori`, `referenti`, `sedi`, `prestazioni`, `utenti` (solo nome e ruolo),
  `numerazioni`; con `archiviati: true` anche gli archiviati
- `salvaSoggetto` (clienti 2): crea o aggiorna con tutti i campi; `archiviaSoggetto` / `ripristinaSoggetto`
- `salvaReferente`, `togliReferente`, `salvaSede`, `archiviaSede` (clienti 2)
- `salvaPrestazione`, `togliPrestazione`, `ordinaPrestazioni` (commesse 2)
- `duplicaCommessa {id, comeModello}` (commesse 2): copia dati, prestazioni (avanzamento a zero) e persone, codice nuovo
- `archiviaCommessa` / `ripristinaCommessa` (commesse 2)
- `ripristinaRapportino` (rapportini 2)
- `cestino` / `ripristinaFile` (amministrazione 2)
- `esporta {cosa: rapportini|clienti|fornitori|commesse|registro, da, a}` (lettura del modulo): CSV con `;`, BOM
  UTF-8, numeri con la virgola, che Excel apre così com'è
- `copie` (amministrazione 1) e `copiaAdesso` (amministrazione 2)

## 7. Copie di sicurezza e controllo

- Ogni notte alle 02:30: `VACUUM INTO /data/copie/wisper-aaaammgg.db` (tenute 30 giorni + una al mese per 12 mesi),
  poi la copia fuori casa: il database compresso (gzip) e i file nuovi dal giorno prima vanno al **postino**, che li
  salva su Drive in `Wisper/Copie NAS/`. Esito nel registro e in `copie`.
- Ogni notte dopo la copia: i dati vanno al postino, che li riscrive nelle schede del foglio (Rapportini, Clienti,
  Commesse, Impostazioni) nello stesso formato di oggi: il foglio resta leggibile e aggiornato.
- Se la copia fuori casa non riesce due notti di fila, o se il server non ha risposto alla prova delle 7:00 (fatta
  dal postino con un attivatore di Apps Script), arriva un'email a `EMAIL_AVVISI` e al proprietario del foglio.
- Ripristino: `node server/strumenti/ripristina.js <copia>`, provato davvero a fine fase 1.

## 8. Il passaggio dei dati

`node server/strumenti/importa.js --foglio <copia.xlsx> [--file <cartella>] --dati <cartella>`:
1. legge l'esportazione del foglio (File › Scarica › Microsoft Excel) con le stesse regole di `Code.gs`
   (intestazioni riconosciute senza badare a maiuscole, spazi e trattini, altri nomi delle colonne, partite IVA e
   telefoni come testo); se il foglio è di prima della 0.3.5 applica le stesse trasformazioni di
   `aggiornaStruttura()`;
2. scrive il database nuovo (vuoto) in una transazione sola;
3. scrive il **rapporto del controllo** (`controllo.html`): righe per scheda, ogni numero RAP, totali di ore, km ed
   euro per mese e per cliente letti dal foglio e ricalcolati dal database, ogni commessa e codice, ogni file citato
   e se è stato copiato. Se una cifra non torna, esce con errore e non lascia il database.

`node server/strumenti/copia-drive.js --da <url script> --dati <cartella>`: copia sul NAS i file citati dal foglio
(foto, firme, firma del tecnico, documenti delle cartelle delle commesse) con l'azione `file` dello script di oggi
(solo lettura). Gli originali restano su Drive.

Le prove si fanno con l'esportazione del **finto Google** (`apps-script/prove/finto-google.js`), mai col foglio vero.
Col foglio vero si lavora solo il giorno della prova generale, con la copia che dà Andrea.

## 9. Il ponte e il postino (Code.gs, dopo il cambio)

Proprietà dello script nuove: `SERVER_URL`, `SEGRETO_SERVER` (lo stesso nel `.env` del NAS).
- **Ponte**: se `SERVER_URL` c'è, `doGet`/`doPost` col CODICE giusto inoltrano la richiesta così com'è a
  `POST <SERVER_URL>/ponte` con `X-Wisper-Segreto` e rispondono con la risposta del server. Il server la esegue come
  l'utente titolare, segnando nel registro "dalla versione vecchia (ponte)".
- **Postino**: azioni `postinoEmail`, `postinoCopia`, `postinoFoglio`, `postinoProva` accettate solo col
  `SEGRETO_SERVER` (mai col CODICE).

## 10. Interfacce

- **Navigazione** (decisione 4): menu laterale in tutte e due le app, nell'ordine delle specifiche, con solo le voci
  che funzionano davvero e che il ruolo può vedere. Computer: fisso, si richiude a sole icone. Telefono: a scomparsa,
  dal pulsante in alto a sinistra e dal bordo sinistro.
- **Pagina iniziale**: la Dashboard.
- Design: `docs/aspetto.md` (colori, caratteri, regole) e i prototipi della fase in `docs/prototipo/`.
- Tutto quello che un modulo fa sul computer lo fa anche sul telefono (decisione 2), con le stesse parole.

## 11. Comandi

- Server: `node server/src/avvio.js --dati <cartella> [--porta 8400] [--prova]` (`--prova` = database con i dati di
  esempio e utenti di prova, password `prova`). Prove: `node --test server/prove/`.
- Telefono contro il server di prova: `http://10.0.2.2:8400`. Computer: `http://localhost:8400`.
- NAS: cartella `/volume1/docker/Wisper-NAS`, progetto compose `wisper`, servizi `wisper` e `wisper-tailscale`.

## 12. Le risposte nuove, campo per campo

Le risposte vere del server di prova (`node server/src/avvio.js --dati <cartella> --prova`), accorciate dove un
elenco si ripete. Le azioni di oggi (`anagrafiche`, `rapportini`, `salvaRapportino`, `caricaFile`, `stato`...) danno
gli stessi campi di `Code.gs` (le prove lo controllano campo per campo contro lo script): qui ci sono solo i campi e le
azioni nuove.

### 12.1 Regole comuni

- **Chi chiama**: `Authorization: Bearer <token>` su ogni richiesta tranne `accedi` e `/salute`. `disp`, `dispNome`,
  `app` si mandano ad `accedi`; dopo il server li ricorda dalla sessione (si possono ripetere, non serve).
- **Errori**: `{"ok":false,"errore":"frase da mostrare"}`, più:
  - `"accesso":false`: `{"ok":false,"errore":"Accesso scaduto: entra di nuovo","accesso":false}` (token mancante,
    sbagliato, revocato, 180 giorni senza uso, utente disattivato);
  - `"permesso":false`: `{"ok":false,"errore":"Non hai il permesso per scrivere i rapportini: chiedi al titolare","permesso":false}`;
  - `"rete":true`: il server ha risposto ma un servizio dietro di lui no (VIES, il postino per le email): riprovare
    più tardi ha senso.
- **Date** `"2026-10-21"`; **istanti** come li dava lo script, `"2026-10-21T17:30:00"`, ora italiana senza fuso
  (nel database stanno col fuso).
- **Soldi**: senza il permesso `costi` questi campi **non ci sono** (né valori né chiavi), a qualunque profondità:
  `tariffa`, `tariffaFissa`, `costoFisso`, `ultimaTariffa`, `maggExtra`, `euroKm`, `compensoOre`, `rimborsoKm`,
  `totale`, `costoOrario`, `prezzoOrario`, `budgetEuro`, `importoContratto`, `valore`, `soldi`, le impostazioni
  `EURO_KM` e `COSTO_ORARIO` (e le stesse colonne, in minuscolo con `_`, nel prima/dopo del registro). Le app
  trattano "campo assente" come "non si vede", non come zero.
- **GET solo per leggere**: con una GET le azioni che scrivono (e `accedi`, `esci`, `cambiaPassword`, `inviaEmail`,
  `salvaUtente`, `nuovaPassword`, `copiaAdesso`) rispondono `{"ok":false,"errore":"Questa azione vuole una POST"}`.
- **File**: `url` = `"/file/<id>"`; `GET /file/<id>` con il Bearer dà i byte (401 senza accesso, 403 senza permesso,
  404 se non c'è o non è ancora stato copiato da Drive). Per le versioni vecchie (ponte) le URL diventano
  `https://drive.google.com/file/d/<id>/view`: ne ricavano l'id come prima e lo chiedono con l'azione `file`.
- **Ponte**: `POST /ponte` con `X-Wisper-Segreto` (= `SEGRETO_SERVER`), corpo = la richiesta originale senza `codice`
  (il campo `metodo` dello script si ignora). Esegue come il primo titolare attivo, nel registro con la nota "dalla
  versione vecchia (ponte)". Segreto sbagliato o assente: HTTP 403 `{"ok":false,"errore":"Segreto sbagliato"}`.
- **`/salute`**: `{"ok":true,"versione":"0.5.0","database":"ok"}` (HTTP 503 e `ok:false` se il database non risponde).

### 12.2 Accesso

`accedi {email, password, disp, dispNome, app}` (l'email senza badare a maiuscole e spazi):
```json
{"ok": true,
 "token": "4zGTu2KDEvjsiw3i1x6ENzBqe70ZpT_YGPjpBodQyro",
 "utente": {"id": 1, "nome": "Manuel Gasparotto", "email": "manuel@esempio.it", "ruolo": "titolare"},
 "permessi": {"dashboard": 2, "clienti": 2, "commesse": 2, "preventivi": 2, "attivita": 2, "rapportini": 2, "spese": 2,
   "fatturazione": 2, "banche": 2, "persone": 2, "documenti": 2, "ticket": 2, "mezzi": 2, "comunicazioni": 2,
   "portale": 2, "collaboratori": 2, "integrazioni": 2, "amministrazione": 2, "costi": 2, "riservati": 2},
 "sessione": 1}
```
Errori: `"Scrivi email e password"`, `"Email o password sbagliate"` (uguale per un'email sconosciuta),
`"Troppi tentativi: riprova fra 15 minuti"` (10 sbagliati in 15 minuti per quell'email, anche con la password giusta),
`"Il tuo accesso è stato disattivato: chiedi al titolare"` (solo con la password giusta).

`esci {}` → `{"ok": true}` (il token non vale più).

`io {}`:
```json
{"ok": true,
 "utente": {"id": 3, "nome": "Marco Collaboratore", "email": "marco@esempio.it", "ruolo": "collaboratore"},
 "permessi": {"dashboard": 1, "clienti": 1, "commesse": 1, "preventivi": 0, "attivita": 2, "rapportini": 2, "spese": 2,
   "fatturazione": 0, "banche": 0, "persone": 0, "documenti": 1, "ticket": 2, "mezzi": 1, "comunicazioni": 0,
   "portale": 0, "collaboratori": 0, "integrazioni": 0, "amministrazione": 0, "costi": 0, "riservati": 0},
 "titolare": "Manuel Gasparotto",
 "ragioneSociale": "Studio Tecnico GM",
 "interfaccia": {"ticketAttivo": false, "tecnico": "Marco Collaboratore", "soloSuoi": true, "versioneServer": "0.5.0"}}
```
`soloSuoi: true` = vede e scrive solo i rapportini suoi; `tecnico` = il nome da proporre come compilatore.

`cambiaPassword {vecchia, nuova}` → `{"ok": true}`; gli altri dispositivi di quell'utente escono, questo resta.
Errori: `"La password attuale è sbagliata"`, `"La password deve avere almeno 8 caratteri"`.

### 12.3 anagrafiche: i campi nuovi

`anagrafiche {archiviati?: true, modelli?: true}` dà, oltre a `clienti`, `commesse`, `gruppi`, `impostazioni` di oggi:
`fornitori`, `referenti`, `sedi`, `prestazioni`, `utenti`, `numerazioni`. Con `archiviati` anche clienti, fornitori,
sedi e commesse archiviati; con `modelli` anche le commesse modello. Le parti di un modulo che non si vede arrivano
vuote (`[]`).

Un cliente (e un fornitore: stessa forma) ha i campi di oggi più:
```json
{"id": "F001", "nome": "Materiale Elettrico Esempio Srl", "alias": [], "gruppo": "", "email": "ordini@materiale.example",
 "telefono": "0445 000100", "indirizzo": "Via dei Fornitori 3", "partitaIva": "01234567897", "tariffaFissa": null,
 "costoFisso": null, "ultimaTariffa": null, "pagaViaggio": null, "kmRimborsati": null, "maggExtra": null, "note": "",
 "accorpatoIn": "",
 "cliente": false, "fornitore": true, "pec": "", "codiceFiscale": "", "codiceSdi": "ABC1234", "cap": "36016",
 "citta": "Thiene", "provincia": "VI", "nazione": "IT", "archiviato": false,
 "creato": "2026-10-21T22:30:15", "modificato": "2026-10-21T22:30:15"}
```
Una commessa ha i campi di oggi più:
```json
{"id": "26ST001", "idCliente": "C001", "descrizione": "Nuovo magazzino automatico Batokyo", "stato": "APERTA",
 "sedeId": 2, "responsabileId": 1, "importoContratto": 1200, "persone": [3], "archiviata": false, "modello": false,
 "creato": "2026-10-21T22:30:15", "modificato": "2026-10-21T22:30:15"}
```
`sedeId` è una sede o un impianto del cliente; `responsabileId` e `persone` sono id di `utenti`.

```json
{"referenti":   [{"id": 1, "idSoggetto": "C001", "nome": "Giulia Bianchi", "ruolo": "Ufficio tecnico",
                  "email": "giulia.bianchi@elettrodinamica.example", "telefono": "0445 000001", "note": "", "ordine": 1}],
 "sedi":        [{"id": 2, "idSoggetto": "C001", "tipo": "impianto", "nome": "Magazzino automatico Batokyo",
                  "indirizzo": "Zona industriale", "cap": "36015", "citta": "Schio", "provincia": "VI", "note": "", "archiviata": false}],
 "prestazioni": [{"id": 2, "idCommessa": "26ST001", "nome": "Progetto esecutivo", "descrizione": "Schemi elettrici e lista materiali",
                  "valore": 600, "avanzamento": 50, "stato": "in_corso", "ordine": 2}],
 "utenti":      [{"id": 1, "nome": "Manuel Gasparotto", "ruolo": "titolare", "attivo": true}],
 "numerazioni": [{"tipo": "commessa", "formato": "{AA}ST{NNN}", "annuale": false, "ultimo": 2, "prossimo": "26ST003"},
                 {"tipo": "rapportino", "formato": "RAP/{AAAA}/{NNNN}", "annuale": true, "ultimo": 6, "prossimo": "RAP/2026/0007"}]}
```
`tipo` delle sedi: `sede` | `impianto`. `stato` delle prestazioni: `da_fare` | `in_corso` | `fatta`. `prossimo` è il
codice che il server darebbe adesso: il telefono lo usa per proporre il codice di una commessa nata senza rete.

### 12.4 Rapportini: cosa cambia

Ogni rapportino ha in più `"idUtente": 3` (chi l'ha scritto; `null` per quelli importati dal foglio) e
`"statoPrima": ""` (lo stato prima di ANNULLATO). Regole nuove, oltre a quelle di Code.gs:
- un **collaboratore** riceve solo i suoi (`rapportini`, `esporta`, `dashboard`) e tocca solo i suoi (salvare,
  stato, firme, foto, email: altrimenti `permesso:false`); il `tecnico` è sempre il suo nome; la tariffa non la
  decide lui: resta quella già scritta o la propone il server (prezzo della commessa, poi ultima tariffa del cliente,
  poi il suo ultimo rapportino). Se non c'è: `"Manca la tariffa oraria per X: chiedi al titolare di scriverla nella
  commessa o nel cliente"`;
- un rapportino con un cliente o una commessa nuovi li crea solo se chi scrive può creare clienti (`clienti` 2) o
  commesse (`commesse` 2), altrimenti `permesso:false` e non si crea niente;
- segnare **FATTURATO** vuole `fatturazione` 2;
- `rapportini` accetta anche `idCliente` e `idCommessa` come filtro;
- `ripristinaRapportino {id}` (un annullato torna allo stato di prima; firmato solo se la firma c'è ancora):
  `{"ok": true, "rapportino": {...}}`; se non è annullato: `"Il rapportino RAP/2026/0007 non è annullato"`.

### 12.5 Clienti e fornitori

`salvaSoggetto {soggetto: {id?, nome, cliente?, fornitore?, alias?, email, pec, telefono, partitaIva, codiceFiscale,
codiceSdi, indirizzo, cap, citta, provincia, nazione, note, tariffaFissa?, costoFisso?, ultimaTariffa?, pagaViaggio?,
kmRimborsati?, maggExtra?}}`: senza `id` crea (di base cliente; `C001…` se è cliente, `F001…` se nasce solo
fornitore), con `id` cambia solo i campi mandati. Le tariffe le scrive solo chi ha `costi`. Risposta:
```json
{"ok": true, "soggetto": {"giaEsisteva": false, "id": "C003", "nome": "Verdi Srl", "cliente": true, "fornitore": false,
 "codiceSdi": "ABC1234", "cap": "36016", "citta": "Thiene", "provincia": "VI", "nazione": "IT"}}
```
(`soggetto` ha tutti i campi di un cliente in `anagrafiche`.) Un nuovo con lo stesso nome o soprannome (senza badare
a maiuscole, spazi e punti) o la stessa partita IVA di uno che c'è: torna quello (`giaEsisteva: true`, nessun dato
cambiato), che diventa anche cliente o fornitore se arrivava come tale. Controlli, con errori che cominciano col nome
del campo: `"Nome: scrivi il nome o la ragione sociale"`, `"Partita IVA: deve avere 11 cifre"`, `"Partita IVA: il
numero non torna, controlla le cifre"`, `"Partita IVA: è già di Rossi Impianti Srl (C002)"` (in modifica), `"Codice
fiscale: deve avere 16 caratteri (o 11 cifre per una società)"`, `"Codice SDI: deve avere 7 lettere o cifre"`, `"CAP:
deve avere 5 cifre"`, `"Email: manca la @ o c'è uno spazio"`, `"PEC: manca la @ o c'è uno spazio"`, `"Scegli se è un
cliente, un fornitore o tutti e due"`. Partita IVA e CAP si controllano così solo con `nazione` IT (vuota = IT). Il
server scrive SDI, provincia e nazione in maiuscolo e la partita IVA italiana senza spazi né "IT". `creaCliente` e
`aggiornaCliente` restano come oggi, senza questi controlli (un telefono vecchio non deve vedersi rifiutare un
rapportino), ma anche `creaCliente` riconosce il doppione per partita IVA.

`archiviaSoggetto {id}` / `ripristinaSoggetto {id}` → `{"ok": true, "soggetto": {...}}`.

`controllaPartitaIva {partitaIva, nazione?}` (clienti 1):
```json
{"ok": true, "valida": true, "partitaIva": "01234567897", "nazione": "IT", "nome": "MATERIALE ELETTRICO ESEMPIO S.R.L.",
 "indirizzo": "VIA DEI FORNITORI 3", "cap": "36016", "citta": "THIENE", "provincia": "VI"}
```
Partita IVA che non esiste: `valida: false`, nome e indirizzo vuoti. Cifra di controllo sbagliata: errore subito,
senza chiamare l'Europa. VIES che non risponde (8 secondi):
`{"ok":false,"errore":"Il servizio europeo non risponde: riprova più tardi","rete":true}`. L'indirizzo è spezzato
quando l'ultima riga è "CAP CITTÀ PROV"; altrimenti tutto in `indirizzo`. L'indirizzo del servizio si cambia con
`WISPER_VIES_URL` (solo per le prove).

`salvaReferente {referente: {id?, idSoggetto, nome, ruolo, email, telefono, note, ordine?}}` →
`{"ok": true, "referente": {"id": 4, "idSoggetto": "C002", "nome": "Anna Rossi", "ruolo": "Acquisti", "email": "",
"telefono": "0445 000004", "note": "", "ordine": 2}}`. `togliReferente {id}` → `{"ok": true}`.

`salvaSede {sede: {id?, idSoggetto, tipo, nome, indirizzo, cap, citta, provincia, note, archiviata?}}` →
`{"ok": true, "sede": {"id": 4, "idSoggetto": "C002", "tipo": "impianto", "nome": "Cabina MT", "indirizzo": "",
"cap": "36016", "citta": "Thiene", "provincia": "VI", "note": "", "archiviata": false}}`.
`archiviaSede {id, archiviata?}` (di base archivia; `archiviata: false` ripristina) → `{"ok": true, "sede": {...}}`.

### 12.6 Commesse e prestazioni

`creaCommessa` e `aggiornaCommessa` accettano anche `sedeId`, `responsabileId`, `persone: [id utenti]` (l'elenco
intero) e `importoContratto` (solo con `costi`); rispondono come oggi, con i campi nuovi.

`salvaPrestazione {prestazione: {id?, idCommessa, nome, descrizione, valore, avanzamento, stato?, ordine?}}` →
`{"ok": true, "prestazione": {"id": 7, "idCommessa": "26ST002", "nome": "Collaudo", "descrizione": "", "valore": 400,
"avanzamento": 50, "stato": "in_corso", "ordine": 4}}`. Senza `stato` lo stato segue l'avanzamento (0 da fare, 1-99 in
corso, 100 fatta); `stato: "fatta"` senza avanzamento lo porta a 100. Errori: `"Avanzamento: da 0 a 100"`, `"Nome:
scrivi il nome della prestazione"`. `valore` lo scrive solo chi ha `costi`.
`togliPrestazione {id}` → `{"ok": true}`.
`ordinaPrestazioni {idCommessa, ids: [3, 2, 1]}` (dal primo all'ultimo) → `{"ok": true, "prestazioni": [...]}`.

`duplicaCommessa {id, comeModello?, idCliente?}` → `{"ok": true, "commessa": {"id": "26ST003", "descrizione": "Nuovo
magazzino automatico Batokyo (copia)", "inizio": "2026-10-21", "finePrevista": "", "persone": [3], "modello": false}}`
(con tutti i campi di una commessa): codice nuovo, stessi dati, prestazioni ad avanzamento 0, stesse persone. Da un
modello (o con `comeModello`) la descrizione resta quella; `idCliente` per farla per un altro cliente.
`archiviaCommessa {id}` / `ripristinaCommessa {id}` → `{"ok": true, "commessa": {...}}`.

### 12.7 Dashboard

`dashboard {per?: "titolare"|"collaboratore"}` (di base decide il ruolo; un collaboratore ha sempre la sua):
```json
{"ok": true, "per": "titolare", "oggi": "2026-10-21",
 "numeri": {
   "commesse": {"aperte": 3, "sospese": 0, "chiuse": 0, "inRitardo": 0},
   "rapportini": {"daFirmare": 5, "daMandare": 0, "daFatturare": 1, "oreSettimana": 1, "oreMese": 35},
   "giorniSenzaRapportino": ["2026-10-14", "2026-10-15", "2026-10-19", "2026-10-20"],
   "soldi": {"daFatturare": 357.46, "daFatturareMesiPrima": 0, "inBozza": 1005.52, "fatturatoMese": 252.96, "clientiDaFatturare": 1}},
 "urgenti": [
   {"tipo": "rapportini", "gravita": "urgente", "titolo": "3 rapportini da far firmare da più di una settimana",
    "dettaglio": "Il più vecchio è del 08/10", "quanto": 3, "unita": "rapportini",
    "collegamento": {"pagina": "rapportini", "filtro": {"stato": "BOZZA", "a": "2026-10-14"}}}],
 "settimana": [
   {"tipo": "fatturazione", "gravita": "soldi", "titolo": "Da fatturare questo mese", "dettaglio": "1 rapportino firmato o mandato",
    "quanto": 357.46, "unita": "euro", "collegamento": {"pagina": "fatturazione", "filtro": {"mese": "2026-10"}}}],
 "pianificare": [
   {"tipo": "commessa", "gravita": "info", "titolo": "26ST002: manca il responsabile, la fine prevista",
    "dettaglio": "Quadro elettrico capannone · Rossi Impianti Srl", "quanto": null, "unita": null,
    "collegamento": {"pagina": "commessa", "id": "26ST002"}}]}
```
- `gravita`: `urgente` | `attenzione` | `soldi` | `info`; ogni sezione è già in quest'ordine (al massimo 20 voci).
  La "cosa più urgente" è `urgenti[0]`.
- `quanto` + `unita` (`euro`, `ore`, `giorni`, `rapportini`, `prestazioni`): il numero a destra, o `null`.
- `collegamento.pagina`: `dashboard`, `clienti`, `cliente`, `commesse`, `commessa`, `rapportini`, `fatturazione`,
  `amministrazione`; `id` per una pagina singola; `filtro` per l'elenco (`stato`, `a`, `mese`,
  `sezione: "prestazioni"`, `senzaRapportino: true`).
- `giorniSenzaRapportino`: i giorni lavorativi (lunedì-venerdì) delle ultime due settimane, oggi escluso.
- Le voci di oggi: commesse in ritardo, ore oltre il budget, rapportini da far firmare da più di 7 giorni, giorni
  senza rapportino dell'ultima settimana, da fatturare dei mesi scorsi (urgenti); commesse che finiscono entro 7
  giorni, budget all'85%, rapportini firmati da mandare, da far firmare, da fatturare del mese (questa settimana);
  commesse senza responsabile, fine prevista o budget, prestazioni da cominciare, clienti con commesse aperte senza
  SDI e PEC (da pianificare).
- **Collaboratore**: niente `soldi` né voci di soldi; rapportini e giorni senza rapportino sono i suoi; le commesse
  sono quelle dove è responsabile o tra le persone. Per gli altri i giorni senza rapportino sono quelli dello studio.

### 12.8 Utenti e dispositivi

`utenti {}` (amministrazione 1) → `{"ok": true, "utenti": [{"id": 2, "nome": "Laura Amministrazione", "email":
"laura@esempio.it", "ruolo": "amministrazione", "attivo": true, "creato": "2026-10-21T22:30:14", "ultimoAccesso": "",
"dispositivi": 0}]}` (`dispositivi` = sessioni attive).

`salvaUtente {utente: {id?, nome, email, ruolo?, attivo?, password?}}` (amministrazione 2):
```json
{"ok": true,
 "utente": {"id": 5, "nome": "Giorgio Nuovo", "email": "giorgio@esempio.it", "ruolo": "collaboratore", "attivo": true,
            "creato": "2026-10-21T22:30:15", "ultimoAccesso": "", "dispositivi": 0},
 "passwordIniziale": "G843-AMT3-44EV"}
```
Un utente nuovo senza `password` ne riceve una: 12 caratteri senza 0/O/1/I/L, in tre gruppi; **i trattini fanno parte
della password**. Torna solo in questa risposta, mai nel registro. Ruolo di base `collaboratore`. Password nuova o
`attivo: false`: i suoi dispositivi escono. Errori: `"Nome: scrivi il nome"`, `"Email: c'è già un utente con questa
email"`, `"Ruolo: titolare, amministrazione, collaboratore o lettura"`, `"Non si può togliere l'ultimo titolare
attivo: prima nominane un altro"`; solo un titolare nomina o cambia un titolare (`permesso:false`).

`nuovaPassword {idUtente}` (amministrazione 2) → `{"ok": true, "passwordIniziale": "NRXF-MEWD-47K4"}` (i suoi
dispositivi escono).

`sessioni {idUtente?}` (amministrazione 2) → `{"ok": true, "sessioni": [{"id": 1, "idUtente": 1, "utente": "Manuel
Gasparotto", "disp": "a1b2", "dispNome": "motorola edge 60", "app": "telefono 0.5.0", "creata": "2026-10-21T22:30:15",
"ultimoUso": "2026-10-21T22:30:15", "questa": false}]}` (`questa`: è il dispositivo che sta chiedendo).
`revocaSessione {id}` → `{"ok": true}`.

### 12.9 Permessi

`permessi {}` (amministrazione 1):
```json
{"ok": true, "ruoli": ["titolare", "amministrazione", "collaboratore", "lettura"],
 "moduli": ["dashboard", "clienti", "commesse", "preventivi", "attivita", "rapportini", "spese", "fatturazione", "banche",
            "persone", "documenti", "ticket", "mezzi", "comunicazioni", "portale", "collaboratori", "integrazioni", "amministrazione"],
 "speciali": ["costi", "riservati"],
 "permessi": {"titolare": {"dashboard": 2, "clienti": 2},
              "collaboratore": {"dashboard": 1, "rapportini": 2, "costi": 0}}}
```
(ogni ruolo ha tutte e 20 le chiavi.) `salvaPermessi {permessi: {"collaboratore": {"costi": 1}}}` (amministrazione 2):
solo i livelli mandati; vale subito, anche per chi è già dentro; risponde come `permessi`. Il titolare non si cambia
(`"Il titolare ha sempre tutto: i suoi permessi non si cambiano"`); chi non è titolare non dà a un ruolo più di quello
che ha lui (`permesso:false`).

### 12.10 Registro e accessi

`registro {da?, a?, utente?, tabella?, idRiga?, pagina?}` (amministrazione 1), 100 per pagina, i più recenti prima:
```json
{"ok": true, "pagina": 1, "pagine": 1, "quante": 2,
 "righe": [{"id": 18, "quando": "2026-10-21T22:30:15", "idUtente": 1, "utente": "Manuel Gasparotto", "disp": "motorola edge 60",
            "azione": "salvaRapportino", "tabella": "soggetti", "idRiga": "C002",
            "prima": {"ultima_tariffa": null}, "dopo": {"ultima_tariffa": 42}, "nota": ""}]}
```
`prima`/`dopo` hanno solo i campi cambiati, coi nomi delle colonne del database (`ultima_tariffa`, `partita_iva`...);
una riga nuova ha `prima: null`, una tolta `dopo: null`; le password sono `"(cambiata)"`. `tabella`: `soggetti`,
`referenti`, `sedi`, `commesse`, `commessa_persone`, `prestazioni`, `rapportini`, `file`, `impostazioni`, `utenti`,
`sessioni`, `permessi` (con `idRiga` "ruolo.modulo"), `numerazioni`, `copie`, `tentativi_accesso`, `importazione`.
`nota`: per esempio "dalla versione vecchia (ponte)", "tolto", "accesso fermato per 15 minuti: troppe password
sbagliate". `utente` = id dell'utente; `da`/`a` = giorni.

`accessi {da?, a?, utente?, esito?, pagina?}` (amministrazione 1) → stessa paginazione, righe
`{"id": 21, "quando": "2026-10-21T22:30:15", "esito": "ok", "azione": "registro", "idUtente": 1, "utente": "Manuel
Gasparotto", "disp": "a1b2", "dispNome": "motorola edge 60", "app": "telefono 0.5.0"}`. `esito`: `ok`, `errore`,
`permesso negato`, `accesso negato`, `password sbagliata`, `bloccato`, `ponte`, `segreto sbagliato`, `rifiutato`,
`richiesta non valida`.

### 12.11 Numerazioni

`numerazioni {}` (amministrazione 1) → `{"ok": true, "numerazioni": [...come in anagrafiche...]}`.
`salvaNumerazione {tipo, formato, annuale?}` (amministrazione 2) → `{"ok": true, "numerazione": {"tipo": "commessa",
"formato": "ST{AA}-{NNNN}", "annuale": false, "ultimo": 3, "prossimo": "ST26-0004"}}`. Segnaposti `{AAAA}`, `{AA}`,
`{N…}` (tante N quante cifre minime); un formato annuale deve avere l'anno. Vale solo per i numeri nuovi, e il numero
continua dal più alto già usato, contando anche i codici del formato di prima. Errori: `"Il formato deve avere un solo
posto per il numero, per esempio {NNN}"`, `"Una numerazione che riparte ogni anno deve avere l'anno nel formato:
{AAAA} o {AA}"`, `"Segnaposto sconosciuto: {X}. Si possono usare {AAAA}, {AA} e {N}, {NN}, {NNN}..."`.

### 12.12 Cestino

`cestino {}` (amministrazione 2) → `{"ok": true, "file": [{"id": "D04yLN6e265kAflzujHc6Pa8OL2Q", "nome": "RAP-2026-0007
spesa q.png", "mime": "image/png", "byte": 70, "tipo": "spesa", "idRapportino": "RAP/2026/0007", "idCommessa": "",
"url": "/file/D04yLN6e265kAflzujHc6Pa8OL2Q", "copiato": true, "creato": "2026-10-21T22:30:15", "cestinato":
"2026-10-21T22:30:15"}]}`. `ripristinaFile {id}` → `{"ok": true, "file": {...stessa forma, "cestinato": ""}}`: una
foto torna tra le foto del suo rapportino.

### 12.13 Esportazione per Excel

`esporta {cosa, da?, a?, idCliente?, idCommessa?, tutti?, archiviati?, utente?, tabella?}` con `cosa` = `rapportini`
(rapportini 1), `clienti` / `fornitori` (clienti 1), `commesse` (commesse 1), `registro` (amministrazione 1):
```json
{"ok": true, "nome": "wisper-clienti-2026-10-21.csv", "mime": "text/csv;charset=utf-8", "righe": 4, "base64": "77u/Q29kaWNl..."}
```
Il file: BOM UTF-8, `;` tra le colonne, `\r\n` tra le righe, numeri con la virgola (`357,46`), date `21/10/2026`,
istanti `21/10/2026 17:30`, sì/no `Sì`/`No`, prima riga con le intestazioni in italiano; una cella che comincia con
`= + - @` prende un apostrofo davanti (Excel non la calcola). Le colonne dei soldi solo con `costi`; un collaboratore
esporta solo i suoi rapportini. Le app salvano o condividono il file così com'è.

### 12.14 Copie di sicurezza

`copiaAdesso {}` (amministrazione 2) → `{"ok": true, "copia": {"id": 1, "quando": "2026-10-21T22:30:15", "file":
"wisper-20261021.db", "byte": 221184, "locale": "ok", "fuori": "ok · 1 file", "foglio": "ok", "nota": "a mano"}}`.
`locale` (la copia sul NAS), `fuori` (database compresso e file nuovi su Drive), `foglio` (le schede riscritte)
valgono `"ok"`, `"errore: ..."` o `"postino non collegato"`. Una copia già in corso: `"Una copia è già in corso:
aspetta un minuto e guarda l'elenco"`.

`copie {}` (amministrazione 1):
```json
{"ok": true,
 "copie": [{"id": 1, "quando": "2026-10-21T02:30:00", "file": "wisper-20261021.db", "byte": 221184, "locale": "ok",
            "fuori": "ok · 1 file", "foglio": "ok", "nota": "notturna"}],
 "file": [{"nome": "wisper-20261021.db", "byte": 221184, "quando": "2026-10-21T02:30:00"}],
 "oraCopia": "02:30", "prossima": "2026-10-22T02:30:00", "postino": "lo script del foglio"}
```
`copie` = le ultime 60 (`nota`: `notturna` o `a mano`); `file` = le copie che ci sono sul NAS; `postino`:
`lo script del foglio`, `finto (su disco)` o `non configurato`; `prossima` è vuota col server di prova.

### 12.15 Note per chi legge il database

Piccole aggiunte alle tabelle della §5, perché servivano: `numerazioni.formati_precedenti` (i formati di prima, per
continuare il numero), `sessioni.id`, la tabella `copie`, la tabella `gruppi` (solo i fogli di prima della 0.3.5, per
fare gli stessi conti di `regoleDi`). Le foto di un rapportino non hanno una colonna: sono i suoi file `spesa` non
cestinati; la colonna `firma` ha l'id del file della firma. Le impostazioni tengono il valore in JSON (un numero resta
numero, una partita IVA resta testo). Il registro non si modifica né si cancella (lo impediscono due trigger).

## 13. Fase 2: le risposte, campo per campo

Preventivi, listino, attività e calendario (accordo in [`fase2.md`](fase2.md)). Valgono le regole comuni della §12.1:
`ok`, `permesso:false`, date `"2026-10-21"`, istanti `"2026-10-21T14:30:00"` (ora italiana, senza fuso), e **senza
`costi` i campi dei soldi non ci sono** (né valori né chiavi). Campi dei soldi nuovi: `prezzo`, `importo`,
`subtotale`, `sommaVoci`, `scontoPercentuale`, `scontoEuro`, `scontoDaPercentuale`, `imponibile`, `contributo`,
`baseIva`, `iva`, `restoScadenze`, `conti` (tutto l'oggetto), `preventiviInAttesa`, più quelli di prima (`totale`,
`valore`, `importoContratto`...). Nel registro le colonne `prezzo`, `importo`, `sconto_percentuale`, `sconto_euro`,
`valore`.

Gli esempi sono le risposte vere del server di prova (`node server/src/avvio.js --prova ...`, 22/10/2026), accorciate
dove un elenco si ripete; i dati di esempio hanno le date contate da oggi, quindi giorni e numeri cambiano col
giorno in cui lo si accende. Le azioni che scrivono vogliono una POST (§12.1).

### 13.1 Impostazioni e numerazione nuove

`anagrafiche.impostazioni` ha in più: `POLIZZA_COMPAGNIA`, `POLIZZA_NUMERO`, `POLIZZA_MASSIMALE` (testi),
`TITOLI` (testo), `IVA` (22), `EPPI_INTEGRATIVO` (5), `RITENUTA` (20, si usa dalla fase 4),
`PREVENTIVO_VALIDITA_GIORNI` (30), `PREVENTIVO_CONDIZIONI` (testo). Si salvano con `salvaImpostazioni` come le altre.
`numerazioni` ha in più `{"tipo": "preventivo", "formato": "PR/{AAAA}/{NNN}", "annuale": true, "ultimo": 13,
"prossimo": "PR/2026/014"}` (riparte ogni anno, per l'anno della data del preventivo).

### 13.2 Listino

`listino {tutte?: true}` (preventivi 1; `tutte` = anche quelle archiviate):
```json
{"ok": true, "listino": [
  {"id": 1, "codice": "SOP", "nome": "Sopralluogo e rilievo", "descrizione": "", "modo": "corpo", "unita": "",
   "prezzo": 350, "attivo": true, "ordine": 1},
  {"id": 8, "codice": "CON", "nome": "Ore di consulenza", "descrizione": "", "modo": "ore", "unita": "ore",
   "prezzo": null, "attivo": true, "ordine": 8}]}
```
`modo`: `corpo` | `ore` | `quantita`. `prezzo: null` = senza prezzo (si mostra in giallo scuro). Si parte con le 8
prestazioni tipiche senza prezzo.
`salvaVoceListino {voce: {id?, codice, nome, descrizione, modo, unita, prezzo, ordine?}}` (preventivi 2; `prezzo`
lo scrive solo chi ha `costi`) → `{"ok": true, "voce": {...}}`. Errori: `"Nome: scrivi il nome della prestazione"`,
`"Modo: corpo, ore o quantita"`, `"Prezzo: non può essere negativo"`.
`archiviaVoceListino {id, archiviata?}` (di base archivia; `archiviata: false` la rimette) → `{"ok": true, "voce": {...}}`.

### 13.3 Preventivi: l'elenco

`preventivi {stato?, cliente?, testo?, anno?, sostituiti?, modelli?}` (preventivi 1). `stato`: `BOZZA` | `INVIATO`
(solo quelli non scaduti) | `SCADUTO` | `ACCETTATO` | `RIFIUTATO` | `SOSTITUITO` | `MODELLO`; senza `stato` tutti
tranne le revisioni vecchie (`sostituiti: true` per averle) e i modelli (`modelli: true` per averli insieme agli
altri). `cliente` = id del cliente, `testo` cerca in numero, oggetto e nome del cliente, `anno` = anno della data.
I più recenti prima.
```json
{"ok": true, "oggi": "2026-10-22", "preventivi": [
  {"id": 4, "numero": "PR/2026/012", "revisione": 1, "etichetta": "PR/2026/012 rev. 1", "idCliente": "C002",
   "cliente": "Rossi Impianti Srl", "oggetto": "Adeguamento impianto elettrico capannone", "data": "2026-10-15",
   "scadenza": "2026-10-28", "stato": "INVIATO", "statoVisto": "INVIATO", "scaduto": false, "giorniAllaScadenza": 6,
   "inviatoIl": "2026-10-15T10:00:00", "accettatoIl": "", "idCommessa": "", "modello": false, "senzaPrezzo": 0,
   "imponibile": 3350, "totale": 4291.35, "modificato": "2026-10-15T10:00:00"},
  {"id": 1, "numero": "PR/2026/007", "revisione": 0, "etichetta": "PR/2026/007", "statoVisto": "SCADUTO", "stato": "INVIATO",
   "scaduto": true, "giorniAllaScadenza": -16, "...": "..."}]}
```
- `id` è il numero interno (si usa in tutte le azioni); `numero` + `revisione` sono quelli da mostrare;
  `etichetta` è già pronta (`"PR/2026/012"` per la revisione 0, `"Modello"` per un modello).
- `stato` è quello salvato: `BOZZA` | `INVIATO` | `ACCETTATO` | `RIFIUTATO` | `SOSTITUITO`. **`statoVisto`** è quello
  da mostrare: uguale, ma `SCADUTO` per un INVIATO con la scadenza passata (`scaduto: true`). Colori: Bozza grigia,
  Inviato blu, Accettato verde, Scaduto ambra, Rifiutato rosso tenue, Sostituito grigio.
- `giorniAllaScadenza`: giorni da oggi alla scadenza (negativo se passata), `null` senza scadenza.
- `senzaPrezzo`: quante voci non hanno prezzo (anche senza `costi`).

### 13.4 Preventivi: la pagina

`preventivo {id}` (preventivi 1; `id` interno, oppure il numero `"PR/2026/012"` = l'ultima revisione):
```json
{"ok": true, "preventivo": {
  "id": 4, "numero": "PR/2026/012", "revisione": 1, "etichetta": "PR/2026/012 rev. 1", "idCliente": "C002",
  "cliente": "Rossi Impianti Srl", "oggetto": "Adeguamento impianto elettrico capannone", "data": "2026-10-15",
  "scadenza": "2026-10-28", "stato": "INVIATO", "statoVisto": "INVIATO", "scaduto": false, "giorniAllaScadenza": 6,
  "inviatoIl": "2026-10-15T10:00:00", "accettatoIl": "", "idCommessa": "", "modello": false, "senzaPrezzo": 0,
  "imponibile": 3350, "totale": 4291.35, "modificato": "2026-10-15T10:00:00",
  "idSede": 3, "idReferente": 3,
  "introduzione": "Come concordato al sopralluogo, ecco la proposta per l'adeguamento dell'impianto elettrico del capannone.",
  "complessita": "media", "complessitaNota": "",
  "oneriPrevisti": "Pratiche presso il distributore di energia e il Comune, a carico del cliente",
  "condizioni": "Il compenso è quello delle voci, a corpo o a ore come scritto. Sono escluse le spese non elencate. I pagamenti seguono le scadenze indicate. Il preventivo vale fino alla data di scadenza.",
  "scontoPercentuale": 0, "scontoEuro": 0, "eppiPercentuale": 5, "ivaPercentuale": 22,
  "accettatoDa": "", "accettazioneModo": "", "firma": null, "rifiutatoIl": "", "motivoRifiuto": "",
  "noteInterne": "", "idUtente": 1, "creato": "2026-10-15T09:12:00", "modificabile": false,
  "sezioni": [
    {"id": 7, "titolo": "Progettazione", "ordine": 1, "voci": ["..."], "subtotale": 2250},
    {"id": 8, "titolo": "Cantiere", "ordine": 2, "voci": [
      {"id": 13, "idSezione": 8, "idListino": 4, "descrizione": "Direzione lavori", "modo": "ore", "quantita": 16,
       "unita": "ore", "prezzo": 45, "scontoPercentuale": 0, "facoltativa": false, "alternativa": "", "scelta": false,
       "ordine": 1, "importo": 720, "conta": true},
      {"id": 14, "idSezione": 8, "idListino": 5, "descrizione": "Dichiarazione di rispondenza", "modo": "corpo",
       "quantita": 1, "unita": "", "prezzo": 450, "scontoPercentuale": 0, "facoltativa": true, "alternativa": "",
       "scelta": false, "ordine": 2, "importo": 450, "conta": false},
      {"id": 15, "idSezione": 8, "idListino": 7, "descrizione": "Collaudo con strumenti propri", "modo": "corpo",
       "quantita": 1, "unita": "", "prezzo": 380, "scontoPercentuale": 0, "facoltativa": false,
       "alternativa": "collaudo", "scelta": true, "ordine": 3, "importo": 380, "conta": true},
      {"id": 16, "idSezione": 8, "idListino": null, "descrizione": "Collaudo con laboratorio esterno", "modo": "corpo",
       "quantita": 1, "unita": "", "prezzo": 620, "scontoPercentuale": 0, "facoltativa": false,
       "alternativa": "collaudo", "scelta": false, "ordine": 4, "importo": 620, "conta": false}],
     "subtotale": 1100}],
  "scadenzePagamento": [
    {"id": 7, "descrizione": "30% alla firma", "tipo": "percentuale", "valore": 30, "quando": "firma", "data": "",
     "importo": 1005, "stato": "prevista", "ordine": 1, "idCommessa": ""},
    {"id": 8, "descrizione": "40% a fine progetto", "tipo": "percentuale", "valore": 40, "quando": "avanzamento",
     "data": "", "importo": 1340, "stato": "prevista", "ordine": 2, "idCommessa": ""},
    {"id": 9, "descrizione": "Saldo a fine lavori", "tipo": "percentuale", "valore": 30, "quando": "fine", "data": "",
     "importo": 1005, "stato": "prevista", "ordine": 3, "idCommessa": ""}],
  "conti": {"sommaVoci": 3350, "scontoDaPercentuale": 0, "scontoEuro": 0, "imponibile": 3350, "eppiPercentuale": 5,
    "contributo": 167.5, "baseIva": 3517.5, "ivaPercentuale": 22, "iva": 773.85, "totale": 4291.35, "oreVoci": 16,
    "senzaPrezzo": 0, "restoScadenze": 0},
  "revisioni": [
    {"id": 3, "revisione": 0, "etichetta": "PR/2026/012", "stato": "SOSTITUITO", "data": "2026-10-12", "totale": 3689.28},
    {"id": 4, "revisione": 1, "etichetta": "PR/2026/012 rev. 1", "stato": "INVIATO", "data": "2026-10-15", "totale": 4291.35}],
  "mancano": []}}
```
Una bozza con qualcosa da sistemare (PR/2026/013 dei dati di esempio):
`"mancano": [{"campo": "prezzi", "testo": "1 voce è senza prezzo: la legge vuole il compenso di ogni prestazione"},
{"campo": "complessita", "testo": "Il grado di complessità dell'incarico: bassa, media o alta"}, {"campo": "oneri",
"testo": "Gli oneri ipotizzabili, dall'incarico alla fine dei lavori"}]`; per la polizza e i titoli le frasi sono
`"Gli estremi della polizza professionale: scrivili in Amministrazione › Dati dello studio"` e `"Titoli e
specializzazioni: scrivili in Amministrazione › Dati dello studio"`.
- `importo` di una voce = quantità × prezzo × (1 − sconto voce), al centesimo; `conta` = entra nei conti (le voci
  normali sempre; le facoltative se `scelta`; di un gruppo di `alternativa` uguale solo quella `scelta`).
  `subtotale` di una sezione = le sue voci che contano.
- `modificabile`: `true` solo in BOZZA (e per i modelli); negli altri stati le voci non si cambiano.
- `importo` di una scadenza: `percentuale` = imponibile × valore / 100; `importo` = valore. Sempre la parte
  **imponibile** (senza contributo e IVA). `restoScadenze` = imponibile − somma delle scadenze (0 = coprono tutto).
- `revisioni`: tutte le revisioni dello stesso numero, dalla prima (c'è anche questa).
- `mancano`: ciò che la legge chiede e manca, `campo` tra `cliente`, `oggetto`, `voci`, `prezzi`, `complessita`,
  `oneri`, `polizza`, `titoli`; vuoto = a posto. Le frasi sono pronte da mostrare.
- `firma`: `{"id": "...", "url": "/file/..."}` (la firma o il documento d'accettazione) o `null`.

**I conti** sono quelli di `server/src/conti.js` → `contiPreventivo(preventivo)`, con i casi in
`server/prove/casi-preventivo.json` (telefono e computer li rifanno per l'anteprima e passano gli stessi casi):
`sommaVoci` = somma degli importi delle voci che contano; `scontoDaPercentuale` = sommaVoci × sconto% / 100;
`imponibile` = sommaVoci − scontoDaPercentuale − scontoEuro; `contributo` = imponibile × EPPI / 100; `baseIva` =
imponibile + contributo; `iva` = baseIva × IVA / 100; `totale` = baseIva + iva. **Ogni pezzo arrotondato al
centesimo prima di sommare**, con `centesimi(n) = Math.round(n * 100) / 100` (lo stesso di Conti.kt).

### 13.5 Preventivi: le azioni

Tutte (preventivi 2) rispondono `{"ok": true, "preventivo": {...come in preventivo}}` se non è scritto altro.

`salvaPreventivo {preventivo: {id?, idCliente, idSede?, idReferente?, oggetto, introduzione?, complessita?,
complessitaNota?, oneriPrevisti?, condizioni?, data?, scadenza?, scontoPercentuale?, scontoEuro?, noteInterne?,
modello?, sezioni?: [{id?, titolo, voci: [{id?, idListino?, descrizione, modo, quantita, unita?, prezzo?,
scontoPercentuale?, facoltativa?, alternativa?, scelta?}]}], scadenzePagamento?: [{id?, descrizione?, tipo, valore,
quando, data?}]}}`:
- senza `id` crea una BOZZA col numero nuovo (`PR/aaaa/nnn`), data di oggi, scadenza = data +
  `PREVENTIVO_VALIDITA_GIORNI`, condizioni = `PREVENTIVO_CONDIZIONI`, e **EPPI e IVA congelati** dalle impostazioni
  di adesso. `modello: true` crea un modello (senza numero, senza cliente obbligatorio);
- con `id` cambia solo i campi mandati; **`sezioni` e `scadenzePagamento`, se ci sono, sono l'elenco intero** (nell'ordine
  in cui arrivano: quelle senza `id` si creano, quelle che mancano si tolgono). Solo in BOZZA;
- una voce col `idListino` e senza `prezzo` prende il prezzo del listino; di un gruppo di alternative ne resta scelta
  una sola (la prima scelta, o la prima del gruppo se nessuna lo è);
- prezzi e sconti li scrive solo chi ha `costi` (chi non li vede, salvando, lascia quelli che c'erano).
Errori: `"Cliente: scegli il cliente"`, `"Oggetto: scrivi di cosa si tratta"`, `"Voce: scrivi la descrizione"`,
`"Modo: corpo, ore o quantita"`, `"Quantità: non può essere negativa"`, `"Sconto: da 0 a 100"`, `"Sconto: è più
grande del totale delle voci"`, `"Scadenza: deve venire dopo la data del preventivo"`, `"Complessità: bassa, media o
alta"`, e negli altri stati `"Il preventivo PR/2026/012 è già stato inviato: per cambiarlo fai una nuova revisione"`
(o `"...è già accettato"`, `"...è stato rifiutato: per riproporlo usa Riapri"`, `"...è stato sostituito da una
revisione più nuova"`).

`duplicaPreventivo {id, comeModello?, idCliente?}` → una BOZZA nuova (numero nuovo, data di oggi, EPPI e IVA di
adesso) con le stesse sezioni, voci e scadenze; `comeModello: true` fa un modello. Da un modello nasce il preventivo
vero ("Da un modello"): con `idCliente` per il cliente.

`nuovaRevisione {id}` (da INVIATO, anche scaduto, o RIFIUTATO) → la revisione nuova in BOZZA: stesso numero,
`revisione` + 1, stessi contenuti e stessi EPPI e IVA, data di oggi e scadenza nuova; la vecchia diventa SOSTITUITO e
resta da consultare. Errori: `"È ancora in bozza: cambiala direttamente"`, `"È già accettato: non si fanno revisioni"`.

`inviaPreventivo {id, a, cc?, oggetto?, messaggio?, allegati: [{nome, mime, base64}], aMe?, conferma?}` (asincrona,
solo POST): come `inviaEmail` (il PDF lo fa l'app e lo manda in `allegati`), poi segna INVIATO (`inviatoIl`). Da BOZZA
o INVIATO (rimandarlo non cambia `inviatoIl`). Con `aMe: true` va solo a chi scrive e non cambia niente.
`segnaInviato {id, conferma?}`: segna INVIATO senza email.
Se `mancano` non è vuoto la risposta è (vera, sul PR/2026/013) `{"ok": false, "errore": "Prima di inviarlo manca: i
prezzi, il grado di complessità, gli oneri ipotizzabili", "mancano": [...come in preventivo...], "serveConferma":
true}` e non parte niente: con `conferma: true` si invia lo stesso. (Il controllo vale per una BOZZA; rimandare un
INVIATO non lo rifà.)
Altri errori: `"Manca l'indirizzo del cliente"`, `"È un modello: prima fai un preventivo da questo modello"`, `"La
scadenza è già passata: cambiala prima di inviarlo"`, `"Le email non sono collegate..."` (come `inviaEmail`, con
`rete: true` se il postino non risponde).

`accettaPreventivo {id, modo, nome, scelte?: {"8": true, "9": false, "10": true}, firma?: {base64, mime, idFile}}`
(da INVIATO, anche scaduto): `modo` = `firma` | `email` | `documento` | `voce`; `nome` = chi ha accettato; `scelte` =
per ogni voce facoltativa o alternativa (id della voce) se il cliente la vuole; `firma` = l'immagine della firma (modo
`firma`, obbligatoria) o il documento firmato (modo `documento`, facoltativo), salvato come file di tipo
`preventivo`. Diventa ACCETTATO con `accettatoIl`, `accettatoDa`, `accettazioneModo`, `firma`; i conti e le scadenze
si rifanno con le scelte (sul PR/2026/012 con la DiRi e il collaudo esterno: `"conti": {"sommaVoci": 4040,
"imponibile": 4040, "contributo": 202, "baseIva": 4242, "iva": 933.24, "totale": 5175.24, ...}`, scadenze 1212, 1616,
1212). Un gruppo di alternative può restare senza scelta (il cliente non ne vuole nessuna); due scelte no. Ripetuta
uguale (stesso `nome` e `modo`: la coda del telefono) risponde ok senza rifare niente. Errori: `"Nome:
scrivi chi ha accettato"`, `"Come ha accettato? firma, email, documento o voce"`, `"Per la firma serve il tratto del
cliente"`, `"Di «collaudo» se ne sceglie una sola"`, `"Il preventivo PR/2026/013 non è ancora stato inviato"`.

`rifiutaPreventivo {id, motivo?}` (da INVIATO) → RIFIUTATO con `rifiutatoIl` e `motivoRifiuto`.
`riapriPreventivo {id}` (da RIFIUTATO) → come `nuovaRevisione`: torna la revisione nuova in BOZZA.

`creaCommessaDaPreventivo {id}` (commesse 2, e preventivi 1), da ACCETTATO, **una volta sola**:
```json
{"ok": true,
 "commessa": {"id": "26ST003", "idCliente": "C002", "descrizione": "Adeguamento impianto elettrico capannone",
   "stato": "APERTA", "indirizzo": "Via delle Prove 5, Thiene", "budgetOre": 16, "budgetEuro": null, "prezzoOrario": 45,
   "costoOrario": null, "euroKm": null, "inizio": "2026-10-22", "finePrevista": "", "cartella": "", "codicePrecedente": "",
   "note": "Dal preventivo PR/2026/012 rev. 1", "sedeId": 3, "responsabileId": 1, "importoContratto": 4040,
   "persone": [], "archiviata": false, "modello": false, "creato": "2026-10-22T00:21:37", "modificato": "2026-10-22T00:21:37"},
 "prestazioni": [
   {"id": 7, "idCommessa": "26ST003", "nome": "Sopralluogo e rilievo", "descrizione": "Progettazione", "valore": 350,
    "avanzamento": 0, "stato": "da_fare", "ordine": 1},
   {"id": 11, "idCommessa": "26ST003", "nome": "Collaudo con laboratorio esterno", "descrizione": "Cantiere",
    "valore": 620, "avanzamento": 0, "stato": "da_fare", "ordine": 5}],
 "preventivo": {"id": 4, "idCommessa": "26ST003", "scadenzePagamento": [{"id": 7, "importo": 1212, "idCommessa": "26ST003", "...": "..."}], "...": "..."}}
```
(`commessa` ha tutti i campi di una commessa di `anagrafiche`.) Codice nuovo 26ST…, cliente, sede (e l'indirizzo
della sede), descrizione = oggetto, note = "Dal preventivo …", importo del contratto = imponibile, responsabile = chi
la crea, nessuna persona; prestazioni = le voci che contano (nome =
descrizione della voce, descrizione = titolo della sezione, valore = importo della voce, con gli sconti sul totale
divisi in proporzione così che la somma sia l'importo del contratto); ore previste = somma delle voci a ore; prezzo
orario = quello delle voci a ore se è uno solo (dopo lo sconto della voce), altrimenti vuoto; le scadenze di pagamento
passano alla commessa (`idCommessa`). Errori: `"Il preventivo PR/2026/010 è già diventato la commessa 26ST002"`,
`"Il preventivo PR/2026/012 non è accettato"`.

### 13.6 Attività: l'elenco

`attivita {da?, a?, assegnata?, mie?, nonAssegnate?, commessa?, cliente?, stato?}` (attivita 1):
- senza `da`/`a`: le attività aperte (da fare e in corso) di ogni giorno, comprese le scadute e quelle senza data:
  è la vista **Oggi · Prossimi giorni · Senza data**;
- con `da` e/o `a` (giorni): quelle del periodo in qualunque stato tranne annullate (il calendario); niente senza data;
- `stato`: `aperte` (di base senza date) | `da_fare` | `in_corso` | `fatta` | `annullata` | `tutte`;
- `assegnata` = id utente; `mie: true` = assegnate a me; `nonAssegnate: true` = senza nessuno;
- un **collaboratore** riceve solo le sue (assegnate a lui o create da lui), le non assegnate e quelle delle commesse
  dove è responsabile o tra le persone.
```json
{"ok": true, "oggi": "2026-10-22", "attivita": [
  {"id": 3, "titolo": "Sopralluogo quadri del magazzino Batokyo", "descrizione": "", "tipo": "sopralluogo",
   "idCliente": "C001", "cliente": "Elettrodinamica", "idCommessa": "26ST001", "commessa": "Nuovo magazzino automatico Batokyo",
   "idPrestazione": null, "assegnataA": 3, "assegnata": "Marco Collaboratore", "creataDa": 1, "priorita": "normale",
   "stato": "da_fare", "scadenza": "", "inizio": "2026-10-22T14:30:00", "fine": "2026-10-22T16:00:00",
   "tuttoIlGiorno": false, "luogo": "Zona industriale, Schio", "promemoriaMinuti": 60, "idRicorrenza": null,
   "occorrenza": "", "ricorrenza": null, "fattaIl": "", "giorno": "2026-10-22", "gruppo": "oggi", "checklist": [],
   "allegati": [], "puoScrivere": true, "creato": "2026-10-22T00:20:37", "modificato": "2026-10-22T00:20:37"},
  {"id": 5, "titolo": "Rinnovo polizza professionale", "descrizione": "", "tipo": "attivita", "idCliente": "",
   "cliente": "", "idCommessa": "", "commessa": "", "idPrestazione": null, "assegnataA": 1,
   "assegnata": "Manuel Gasparotto", "creataDa": 1, "priorita": "normale", "stato": "da_fare",
   "scadenza": "2026-10-28", "inizio": "", "fine": "", "tuttoIlGiorno": false, "luogo": "", "promemoriaMinuti": 1440,
   "idRicorrenza": 1, "occorrenza": "2026-10-28",
   "ricorrenza": {"regola": "anni", "ogni": 1, "giorniSettimana": [], "inizio": "2026-10-28", "fine": ""},
   "fattaIl": "", "giorno": "2026-10-28", "gruppo": "prossimi", "checklist": [], "allegati": [],
   "puoScrivere": true, "creato": "2026-10-22T00:20:37", "modificato": "2026-10-22T00:20:37"}]}
```
Una voce della checklist: `{"id": 1, "testo": "Controllare le sezioni dei cavi", "fatta": true, "ordine": 1}`; un
allegato: `{"id": "D04yLN6e265kAflzujHc6Pa8OL2Q", "nome": "foto.png", "mime": "image/png", "url":
"/file/D04yLN6e265kAflzujHc6Pa8OL2Q"}`. L'ordine dell'elenco: per giorno (le senza data in fondo), poi ora, poi
priorità.
- `tipo`: `attivita` | `appuntamento` | `sopralluogo`; `priorita`: `alta` | `normale` | `bassa`; `stato`: `da_fare` |
  `in_corso` | `fatta` | `annullata`.
- Quando: `scadenza` (un giorno) **oppure** `inizio` e `fine` (istanti; con `tuttoIlGiorno: true` conta solo il
  giorno). `giorno` = il giorno dell'attività (quello di `inizio`, se no la `scadenza`; `""` senza data).
- `gruppo`: `scadute` (aperta e `giorno` passato) | `oggi` | `prossimi` | `senzaData` | `fatte` | `annullate`.
- `ricorrenza`: `null` se non si ripete. `regola`: `giorni` | `settimane` | `mesi` | `anni`; `ogni` = ogni quanti;
  `giorniSettimana` = per le settimane, 1 lunedì … 7 domenica (vuoto = lo stesso giorno della prima); `fine` = ultimo
  giorno (vuoto = per sempre). Le occorrenze ci sono già per i prossimi 90 giorni (ogni notte si allungano): ognuna è
  un'attività vera, con `occorrenza` = il suo giorno nella serie.
- `promemoriaMinuti`: quanti minuti prima avvisare (`null` = niente). Gli avvisi li fanno le app (il server li
  tiene e basta); per le attività con la sola scadenza il riferimento sono le 9:00 di quel giorno.
- `puoScrivere`: se chi chiede può cambiarla (un collaboratore solo le sue).

### 13.7 Attività: le azioni

Tutte (attivita 2) rispondono `{"ok": true, "attivita": {...come sopra}}` se non è scritto altro. Un collaboratore
cambia solo le sue (assegnate a lui o create da lui) e assegna solo a sé o a nessuno (`permesso:false`).

`salvaAttivita {attivita: {id?, titolo, descrizione?, tipo?, idCliente?, idCommessa?, idPrestazione?, assegnataA?,
priorita?, stato?, scadenza?, inizio?, fine?, tuttoIlGiorno?, luogo?, promemoriaMinuti?, checklist?: [{id?, testo,
fatta?}], ricorrenza?: {regola, ogni?, giorniSettimana?, fine?} | null}, perRicorrenza?, conferma?}`:
- senza `id` crea (di base `tipo` attivita, `priorita` normale, `stato` da_fare, `assegnataA` vuoto = non assegnata);
  con `id` cambia solo i campi mandati. `checklist`, se c'è, è l'elenco intero. Con la commessa e senza cliente, il
  cliente è quello della commessa. Un appuntamento senza `fine` dura un'ora;
- con `ricorrenza` nasce la serie: questa è la prima occorrenza (serve una data) e la risposta ha in più
  `"occorrenze"` = quante ce ne sono adesso nella serie. Vera: `{"titolo": "Controllo estintori", "scadenza":
  "2026-11-03", "ricorrenza": {"regola": "settimane", "ogni": 2, "giorniSettimana": [2]}}` →
  `"occorrenze": 6, "attivita": {"idRicorrenza": 3, "occorrenza": "2026-11-03", "ricorrenza": {"regola": "settimane",
  "ogni": 2, "giorniSettimana": [2], "inizio": "2026-11-03", "fine": ""}, ...}`;
- su un'occorrenza, `perRicorrenza`: `questa` (di base: solo lei) | `future` (lei e le seguenti: da lì nasce una serie
  nuova) | `tutte` (tutta la serie). Titolo, persona, priorità, luogo, ora e durata si riportano sulle altre
  occorrenze aperte; se cambiano il giorno o la regola, le occorrenze aperte da lì in poi si rifanno. Le fatte non si
  toccano mai. La checklist cambia su questa e sulle occorrenze che nasceranno. `ricorrenza: null` con `future` o
  `tutte` = non si ripete più (le occorrenze aperte seguenti si tolgono). Con `future` su un'occorrenza che non è la
  prima, la risposta ha `idRicorrenza` nuovo (la serie di prima finisce il giorno prima) e `occorrenze` della serie
  nuova. Le occorrenze rifatte hanno id nuovi: un id tolto non torna mai a un'altra attività;
- **sovrapposizioni**: un'attività con `inizio` e `fine` (non tutto il giorno) che si accavalla con un'altra aperta
  della stessa persona non si salva (vera): `{"ok": false, "errore": "Si sovrappone a: Riunione di cantiere Batokyo
  (8:30-10:00)", "sovrapposte": [{"id": 8, "titolo": "Riunione di cantiere Batokyo", "inizio": "2026-10-24T08:30:00",
  "fine": "2026-10-24T10:00:00", "assegnataA": 1, "assegnata": "Manuel Gasparotto"}], "serveConferma": true}`.
  Si richiede uguale con `conferma: true` per salvarla lo stesso. Toccarsi (una finisce alle 10:30, l'altra comincia
  alle 10:30) non è sovrapporsi; una fatta o annullata non conta. Su una ricorrenza si guarda solo l'occorrenza che
  si sta salvando.
Errori: `"Titolo: scrivi cosa c'è da fare"`, `"Tipo: attivita, appuntamento o sopralluogo"`, `"Priorità: alta,
normale o bassa"`, `"Inizio: scrivi quando comincia"` (appuntamento o sopralluogo senza inizio), `"Fine: deve venire
dopo l'inizio"`, `"Per ripetere un'attività serve la data"`, `"Ripeti: giorni, settimane, mesi o anni"`, `"Persona
N non trovata"`, `"Commessa X non trovata"`.

`faiAttivita {id, fatta}` → `fatta: true` = fatta (`fattaIl`), `false` = di nuovo da fare (anche da annullata).
`togliAttivita {id, perRicorrenza?}` → annullata (non si cancella). Su un'occorrenza `questa` (di base) = **salta solo
questa** (la serie continua); `future` = la serie finisce qui (lei e le seguenti annullate); `tutte` = tutta la serie
(tranne le fatte). Risponde anche `"tolte": 3`.
`spuntaChecklist {id, fatta}` (`id` della voce della checklist) → l'attività.
Allegati: `caricaFile {tipo: "attivita", idAttivita, base64, mime, nome, idFile}` (attivita 2) →
`{"ok": true, "file": {"id": "...", "url": "/file/...", "nome": "polizza.pdf"}}`; `togliAllegato {id}` (id del file:
va nel cestino) → l'attività. `GET /file/<id>` come gli altri file (chi vede l'attività).

### 13.8 Dashboard: cosa si aggiunge

- `numeri.preventivi` (solo con preventivi ≥ 1 e non nella vista del collaboratore): `{"bozze": 1, "inviati": 1,
  "scaduti": 1, "inScadenza": 1, "senzaRisposta": 1, "accettatiSenzaCommessa": 0}`; con `costi` anche
  `numeri.soldi.preventiviInAttesa` (totale degli inviati non scaduti: `4291.35`).
- `numeri.attivita`: `{"scadute": 2, "oggi": 2, "settimana": 6, "nonAssegnate": 2, "appuntamentiOggi": 1}` (per il
  collaboratore le sue: `{"scadute": 0, "oggi": 1, "settimana": 1, "nonAssegnate": 0, "appuntamentiOggi": 1}`).
- `agenda`: `{"oggi": [...], "settimana": [...]}`, le attività aperte di oggi e dei 7 giorni dopo, in ordine di ora:
  `{"id": 3, "tipo": "sopralluogo", "titolo": "Sopralluogo quadri del magazzino Batokyo", "giorno": "2026-10-22",
  "inizio": "2026-10-22T14:30:00", "fine": "2026-10-22T16:00:00", "tuttoIlGiorno": false, "assegnataA": 3,
  "assegnata": "Marco Collaboratore", "idCommessa": "26ST001", "luogo": "Zona industriale, Schio", "priorita":
  "normale", "stato": "da_fare"}`.
- Le voci nuove (vere):
```json
{"urgenti": [
  {"tipo": "attivita", "gravita": "urgente", "titolo": "Chiamare Rossi per il collaudo è scaduta",
   "dettaglio": "26ST002 · era per ieri · Manuel Gasparotto", "quanto": 1, "unita": "giorni",
   "collegamento": {"pagina": "attivita", "id": 1}},
  {"tipo": "preventivo", "gravita": "attenzione", "titolo": "PR/2026/007: nessuna risposta da 45 giorni",
   "dettaglio": "Quadro di cantiere · Rossi Impianti Srl · scaduto il 06/10", "quanto": 45, "unita": "giorni",
   "collegamento": {"pagina": "preventivo", "id": 1}}],
 "settimana": [
  {"tipo": "sopralluogo", "gravita": "attenzione", "titolo": "Sopralluogo quadri del magazzino Batokyo oggi alle 14:30",
   "dettaglio": "Marco Collaboratore · Zona industriale, Schio", "quanto": null, "unita": null,
   "collegamento": {"pagina": "calendario", "filtro": {"giorno": "2026-10-22"}}},
  {"tipo": "preventivo", "gravita": "attenzione", "titolo": "PR/2026/012 rev. 1 scade fra 6 giorni",
   "dettaglio": "Rossi Impianti Srl · inviato il 15/10", "quanto": 4291.35, "unita": "euro",
   "collegamento": {"pagina": "preventivo", "id": 4}},
  {"tipo": "attivita", "gravita": "info", "titolo": "1 attività da fare oggi", "dettaglio": "Mandare lo schema unifilare a Elettrodinamica",
   "quanto": 1, "unita": "attivita", "collegamento": {"pagina": "attivita", "filtro": {"gruppo": "oggi"}}},
  {"tipo": "attivita", "gravita": "info", "titolo": "6 attività nei prossimi 7 giorni",
   "dettaglio": "Aggiornare lo schema del quadro di linea 2, Riunione di cantiere Batokyo, Completare il preventivo PR/2026/013",
   "quanto": 6, "unita": "attivita", "collegamento": {"pagina": "calendario", "filtro": {"giorno": "2026-10-23"}}}],
 "pianificare": [
  {"tipo": "attivita", "gravita": "info", "titolo": "2 attività non assegnate",
   "dettaglio": "Completare il preventivo PR/2026/013, Riordinare i cataloghi in ufficio", "quanto": 2, "unita": "attivita",
   "collegamento": {"pagina": "attivita", "filtro": {"nonAssegnate": true}}},
  {"tipo": "preventivo", "gravita": "info", "titolo": "1 preventivo in bozza", "dettaglio": "PR/2026/013 Verifica periodica impianto di terra",
   "quanto": 1, "unita": "preventivi", "collegamento": {"pagina": "preventivi", "filtro": {"stato": "BOZZA"}}}]}
```
  `tipo` delle voci nuove: `attivita`, `appuntamento`, `sopralluogo`, `preventivo`. Un accettato senza commessa:
  `"PR/2026/012 rev. 1: accettato, manca la commessa"` (settimana, `collegamento` alla pagina del preventivo).
- Voci nuove: **urgenti** = attività scadute (una per una fino a 3, poi una voce sola) e preventivi inviati da più di 15
  giorni senza risposta; **settimana** = appuntamenti e sopralluoghi di oggi (uno per uno), "N attività da fare oggi",
  "N attività nei prossimi 7 giorni", preventivi in scadenza entro 7 giorni (`quanto` = totale in euro, solo con
  `costi`), accettati senza commessa; **da pianificare** = preventivi in bozza, attività non assegnate.
- `collegamento.pagina` nuove: `preventivi` (filtro `stato`), `preventivo` (`id` interno), `attivita` (`id`, oppure
  filtro `gruppo` / `nonAssegnate: true`), `calendario` (filtro `giorno`). Unità nuove: `attivita`, `preventivi`.
- Collaboratore: le sue attività (assegnate a lui); niente preventivi.

### 13.9 Esportazione

`esporta {cosa: "preventivi", ...filtri di preventivi}` (preventivi 1) e `esporta {cosa: "attivita", ...filtri di
attivita}` (attivita 1): stesso CSV della §12.13. Colonne dei preventivi: Numero, Revisione, Data, Scadenza, Stato,
Codice cliente, Cliente, Oggetto, Complessità, Imponibile, Contributo integrativo, IVA, Totale (questi quattro solo
con `costi`), Inviato il, Accettato il, Accettato da, Come, Commessa, Rifiutato il, Motivo. Delle attività: Giorno,
Titolo, Tipo, Stato, Priorità, Scadenza, Inizio, Fine, Assegnata a, Cliente, Commessa, Luogo, Si ripete, Checklist
(fatte/totali), Fatta il, Descrizione. Un collaboratore esporta le attività che vede. Senza `stato` le attività
esportate sono le aperte, come l'elenco: `stato: "tutte"` per averle tutte.

### 13.10 Note per chi legge il database

Tabelle nuove (migrazione `002-preventivi-attivita.sql`, con la copia `wisper.db.prima-2` prima): `listino`,
`preventivi`, `preventivo_sezioni`, `preventivo_voci`, `scadenze_pagamento`, `ricorrenze`, `attivita`,
`attivita_checklist`; `file` ha due tipi nuovi (`attivita`, `preventivo`) e le colonne `attivita_id` e
`preventivo_id` (nel `cestino` i file hanno in più `idAttivita` e `idPreventivo`). In più dell'accordo: `ricorrenze.inizio`
(il primo giorno della serie), `ricorrenze.creata_da`, `creato` e `modificato`; le tabelle da cui si tolgono righe hanno
`AUTOINCREMENT`. Nel registro le tabelle nuove si chiamano come qui sopra; le righe tolte hanno la nota `"tolta"` (o
`"tolta: la ricorrenza è cambiata"`, `"tolta: la serie non si ripete più"`, `"tolta: la serie finisce prima"`).
L'allungamento delle ricorrenze gira nella pianificazione delle copie: all'avvio del server e ogni notte dopo
mezzanotte (`[ricorrenze] N occorrenze nuove` nel log).

## 14. Fase 3: le risposte, campo per campo

Ore senza rapportino, timer, approvazioni, spese, trasferte, veicoli e rimborsi (accordo in [`fase3.md`](fase3.md),
migrazione `003-ore-spese`, server 0.6.0). Valgono le regole comuni della §12.1: `ok`, `permesso:false`, date
`"2026-10-21"`, istanti `"2026-10-21T14:30:00"` (ora italiana, senza fuso), le azioni che scrivono vogliono una POST.
Gli esempi sono le risposte vere del server di prova (`node server/src/avvio.js --prova ...`, 22/10/2026), accorciate
dove un elenco si ripete: i dati di esempio hanno i giorni contati da oggi (gli ultimi giorni feriali), quindi date e
numeri cambiano col giorno in cui lo si accende.

### 14.1 Regole comuni della fase 3

- **Moduli.** Ore, timer, statistiche e l'approvazione di ore e rapportini sono del modulo `rapportini` (voce 6, Ore e
  rapportini): leggere 1, scrivere 2. Spese, trasferte, rimborsi, riepiloghi e veicoli sono del modulo `spese` (voce 7):
  leggere 1, scrivere 2. `salvaVeicolo` vuole `amministrazione` 2; `costoCommessa` vuole `commesse` 1.
- **Chi vede.** Un **collaboratore** vede e scrive solo le sue ore, il suo timer, le sue spese, trasferte e rimborsi
  (anche nelle statistiche, nei riepiloghi e nelle esportazioni): il filtro `utente` per lui non conta. Le cose degli
  altri non le trova (`"Ore 12 non trovate"`, `"Spesa 6 non trovata"`: non si dice che esistono). **Lettura** vede tutto
  e non scrive. **Titolare e amministrazione** vedono tutto e scrivono anche per gli altri (`idUtente`).
- **Chi approva**: titolare e amministrazione, col modulo in scrittura (ore e rapportini: `rapportini` 2; spese e
  trasferte: `spese` 2). Il collaboratore non approva mai, nemmeno se e' responsabile della commessa (vedi §14.17).
- **Stati** di ore, spese e trasferte: `bozza` | `da_approvare` | `approvata` | `respinta`. Dei rapportini
  (`statoApprovazione`, accanto agli stati di sempre): `""` (non serve) | `da_approvare` | `approvato` | `respinto`.
- **Impostazione `APPROVAZIONE`**: `collaboratori` (di base: servono le approvazioni solo per le cose scritte da un
  collaboratore), `tutti`, `nessuno`. Quello che non ha bisogno di approvazione nasce gia' approvato
  (`stato: "approvata"`, `approvataDa: null`).
- **Lo stato dopo un salvataggio** (ore, spese, trasferte): con `bozza: true` resta in bozza; una riga nuova, o che era
  in bozza, o che chi l'ha scritta cambia davvero (o rimanda dopo un rifiuto), va **da approvare** (o approvata, se per
  quella persona non serve); se la cambia chi approva, lo stato resta quello che era. Quando lo stato cambia,
  `approvataDa`, `approvataIl` e `motivoRifiuto` si svuotano (restano nel registro).
- **Chi ha deciso**: `approvataDa` (id), `approvataDaNome`, `approvataIl` sono chi ha approvato **o respinto** e quando;
  `motivoRifiuto` e' il motivo del rifiuto (vuoto se non e' respinta).
- **Togliere** (ore, spese, trasferte): non si cancella niente. `togli... {id}` mette `tolta` (l'istante) e la riga
  esce dagli elenchi e dai conti; `togli... {id, annulla: true}` la rimette (l'Annulla dell'avviso).
- **Cosa si puo' cambiare.** Ogni riga ha `puoScrivere` (permesso e niente blocco) e `bloccata` (la frase pronta da
  mostrare, o `""`). Le spese hanno anche `soloCampi`: `null`, oppure `["categoria", "descrizione", "pagataDaMe"]`
  quando sono di un rapportino gia' firmato (si cambia solo quello).
- **Soldi.** Senza il permesso `costi` non ci sono (§12.1) anche: `costo` (ore x costo orario), `costoOrario` delle ore,
  `costoCommessa` (tutto l'oggetto), `costoOreRegistrate`. **I soldi della persona invece si vedono sempre**, anche senza
  `costi`, perche' sono suoi: l'`importo` delle spese, l'`euroKm`, il `rimborsoKm` e il `totale` delle trasferte,
  l'`euroKm` dei veicoli, il `totale` e gli `importo` dei rimborsi, i totali dei riepiloghi delle spese. Il server li
  tiene solo dentro questi oggetti (spesa, trasferta, veicolo, rimborso, riepilogo): `importo` di un preventivo, `totale`
  di un rapportino e `euroKm` di un rapportino o di una commessa restano campi dei costi come prima. (L'euro al km del
  veicolo e' la tabella ACI, pubblica, e decide il rimborso della persona: si vede.) La Dashboard del collaboratore
  resta senza soldi e senza "€" (§12.7).
- **`io`** ha in piu' in `interfaccia`: `"puoApprovare": false` (mostra il segmento Da approvare),
  `"puoSegnareRimborsi": false` (il pulsante Segna rimborsato), `"approvazione": "collaboratori"`,
  `"oreGiornaliere": 8`; e `versioneServer` e' `"0.6.0"` (anche in `/salute`).

### 14.2 Impostazioni nuove

`anagrafiche.impostazioni` ha in piu': `APPROVAZIONE` (`"collaboratori"`), `ACI_ANNO` (`2026`, l'anno delle tabelle ACI
dei veicoli), `INDENNITA_TRASFERTA` (`""`: l'indennita' proposta **per ogni giorno** di trasferta, in euro; vuota =
nessuna), `ORE_GIORNALIERE` (`8`: oltre 4 ore in piu' in un giorno e' un'anomalia). Si salvano con `salvaImpostazioni`.
`EURO_KM` e `AUTO` restano quelle dei rapportini (il prezzo al km per il cliente): il rimborso delle trasferte segue il
veicolo (§14.9). Alla migrazione il primo veicolo nasce da `AUTO` ed `EURO_KM`; dopo, le due cose sono separate.

### 14.3 Ore: l'elenco

`ore {da?, a?, utente?, commessa?, stato?}` (rapportini 1). Di base la settimana di oggi (da lunedi' a domenica).
`commessa: "studio"` = le ore senza commessa (attivita' dello studio). `stato`: uno dei quattro o `tutte` (di base tutte,
tranne le tolte). Le righe in ordine di giorno, inizio, id.
```json
{"ok": true, "da": "2026-10-19", "a": "2026-10-25", "oreGiornaliere": 8,
 "ore": [
  {"id": 12, "idUtente": 1, "utente": "Manuel Gasparotto", "data": "2026-10-21", "inizio": "22:00", "fine": "06:00",
   "pausaMinuti": 30, "ore": 7.5, "giornoDopo": true, "idCommessa": "26ST002", "commessa": "Quadro elettrico capannone",
   "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idPrestazione": null, "prestazione": "", "idAttivita": null,
   "attivita": "", "descrizione": "Prova notturna del quadro", "fatturabile": true, "tipo": "ordinaria",
   "costoOrario": 25, "costo": 187.5, "stato": "approvata", "approvataDa": null, "approvataDaNome": "", "approvataIl": "",
   "motivoRifiuto": "", "dalTimer": false, "tolta": "", "puoScrivere": true, "bloccata": "",
   "creato": "2026-10-22T01:41:11", "modificato": "2026-10-22T01:41:11"},
  {"id": 11, "idUtente": 3, "utente": "Marco Collaboratore", "data": "2026-10-19", "inizio": "", "fine": "", "pausaMinuti": 0,
   "ore": 2, "giornoDopo": false, "idCommessa": "", "commessa": "", "descrizione": "Riordino del magazzino",
   "fatturabile": false, "costoOrario": 15, "costo": 30, "stato": "respinta", "approvataDa": 1,
   "approvataDaNome": "Manuel Gasparotto", "approvataIl": "2026-10-22T01:40:39",
   "motivoRifiuto": "Il riordino del magazzino non si segna: è dentro le ore di studio", "...": "..."}],
 "giorni": [{"data": "2026-10-19", "ore": 3, "oreRapportini": 0}, {"data": "2026-10-20", "ore": 12, "oreRapportini": 0},
            {"data": "2026-10-21", "ore": 28, "oreRapportini": 0}, "... fino a domenica"],
 "totali": {"ore": 47, "fatturabili": 38, "straordinarie": 5, "oreRapportini": 0, "daApprovare": 3}}
```
- `inizio`/`fine`: ore del giorno `"HH:MM"`, vuote se le ore sono scritte a mano. `giornoDopo: true` = la fine e' del
  giorno dopo (lavoro a cavallo della mezzanotte); la riga resta del giorno in cui e' cominciato (`data`).
- `idCommessa: ""` = attivita' dello studio (il prototipo la chiama "Studio"). `tipo`: `ordinaria` | `straordinaria`.
- `costoOrario` e' congelato alla nascita della riga (§14.4); `costo` = ore x costo orario, al centesimo, `null` se il
  costo orario non c'e'. Tutti e due solo con `costi`.
- `dalTimer`: nata fermando il timer. `tolta`: `""` (le tolte non arrivano negli elenchi).
- `giorni`: ogni giorno del periodo con le ore registrate (non respinte) e le ore dei rapportini (non annullati) della
  stessa persona o di tutti: serve alla settimana del telefono ("come Il tuo giorno") e alle colonne del timesheet.
- `totali`: delle righe non respinte; `daApprovare` = quante righe aspettano.
- **Timesheet del computer**: righe = commesse (piu' "Studio"), colonne = giorni, cella = somma delle righe di quella
  persona, commessa e giorno. Scrivere una cella: con una riga sola si cambia quella (`salvaOre` con `id` e `ore`); senza
  righe se ne crea una; con piu' righe la cella non si scrive (si apre il giorno).

### 14.4 Ore: salvaOre e togliOre

`salvaOre {riga: {id?, idUtente?, data?, inizio?, fine?, pausaMinuti?, ore?, idCommessa?, idPrestazione?, idAttivita?,
descrizione?, fatturabile?, tipo?, bozza?}}` (rapportini 2) → `{"ok": true, "riga": {...come in ore}}`. Senza `id` crea
(di base oggi, la persona che scrive), con `id` cambia solo i campi mandati.
- **Inizio e fine**: se ci sono tutti e due, le ore si calcolano (`oreDaOrari`, §14.15) e un `ore` mandato non conta.
  **La regola della mezzanotte**: una fine prima dell'inizio e' del giorno dopo (22:00-06:00 = 8 ore). Per passare alle
  ore scritte a mano si mandano `inizio: ""` e `fine: ""`. `pausaMinuti` conta solo con inizio e fine.
- **Ore a mano**: `ore` da 0 a 24 (gli stepper vanno a mezz'ore, il server accetta i decimali), due decimali.
- `fatturabile` di base: si' con una commessa, no per lo studio. `tipo` di base `ordinaria` (`straordinaria: true` vale
  come `tipo: "straordinaria"`). La prestazione deve essere della commessa (senza commessa, la commessa e' quella della
  prestazione).
- **Costo orario congelato**: alla nascita, quello di adesso per quella commessa (il costo fisso del cliente, poi quello
  della commessa, poi `COSTO_ORARIO`; dalla fase 6 quello della persona). Si rifa' solo se cambia la commessa, come i
  rapportini: cambiare impostazioni o commessa dopo non riscrive le ore gia' scritte.
- `bozza: true`: resta in bozza (anche con zero ore). Senza: la riga va a chi approva (§14.1).
- Il collaboratore scrive solo per se' (`idUtente` di un altro: `permesso:false`); una riga **approvata** non la cambia
  e non la toglie piu' (`bloccata`); chi approva la corregge e lo stato resta.
Errori: `"Ore: scrivi quante ore hai lavorato"` (zero, senza bozza), `"Ore: da 0 a 24"`, `"Scrivi l'inizio e la fine,
oppure solo le ore"`, `"Inizio: scrivi l'ora come 8:30"`, `"Fine: scrivi l'ora come 17:30"`, `"Fine: deve essere diversa
dall'inizio"`, `"Pausa: è più lunga del lavoro"`, `"Pausa: scrivi i minuti, da zero in su"`, `"Tipo: ordinaria o
straordinaria"`, `"Commessa 26ST999 non trovata"`, `"Prestazione 9 non trovata in 26ST001"`, `"Attività 9 non trovata"`,
`"Persona 9 non trovata"`, `"Sono già approvate: per cambiarle chiedi a chi approva"`, `"Le ore non cambiano persona:
toglile e scrivile per l'altra persona"`, `"Queste ore sono state tolte: rimettile prima di cambiarle"`.

`togliOre {id, annulla?}` (rapportini 2) → `{"ok": true, "riga": {..., "tolta": "2026-10-22T01:41:11"}}`; con
`annulla: true` torna `"tolta": ""`. Approvate e collaboratore: `"Sono già approvate: per toglierle chiedi a chi approva"`.

**Senza doppioni dalla coda del telefono** (aggiunto il 22/10/2026). `salvaOre` e `salvaSpesa` accettano `idLocale`
(il codice che il telefono dà alla riga quando la mette in coda, uguale a ogni nuovo tentativo). Se una riga con quell'`idLocale`
esiste già, il server non ne crea un'altra e risponde con quella (`salvaOre` aggiunge `"giaArrivata": true`). Colonna
`id_locale` (unica) nelle tabelle `ore` e `spese`.

### 14.5 Il timer

Uno per persona, nel database: sopravvive al riavvio del server e alla chiusura dell'app.

`timer {}` (rapportini 1) → il proprio:
```json
{"ok": true, "adesso": "2026-10-22T01:41:11",
 "timer": {"partitoIl": "2026-10-22T00:10:39", "idCommessa": "26ST001", "commessa": "Nuovo magazzino automatico Batokyo",
           "idPrestazione": null, "idAttivita": null, "descrizione": "Cablaggio quadro di linea 3", "fatturabile": true,
           "secondi": 5432}}
```
`timer: null` se e' spento. `adesso` e `secondi` sono del server: l'app fa scorrere il tempo da li' (l'orologio del
telefono puo' essere sbagliato).

`avviaTimer {idCommessa?, idPrestazione?, idAttivita?, descrizione?, fatturabile?}` (rapportini 2) → come `timer`. Gia'
acceso (vero): `{"ok": false, "errore": "Il timer è già acceso dalle 00:10 (26ST001): fermalo prima di avviarne un
altro", "timer": {...quello acceso}}` (l'app lo mostra invece di riprovare).

`fermaTimer {}` (rapportini 2) → la riga di ore **in bozza** dal giorno e dall'ora in cui e' partito fino ad adesso, da
correggere e mandare con `salvaOre`:
```json
{"ok": true, "timer": null,
 "riga": {"id": 14, "idUtente": 3, "data": "2026-10-22", "inizio": "00:10", "fine": "01:41", "pausaMinuti": 0, "ore": 1.52,
          "giornoDopo": false, "idCommessa": "26ST001", "descrizione": "Cablaggio quadro di linea 3", "fatturabile": true,
          "stato": "bozza", "dalTimer": true, "...": "..."}}
```
Le ore seguono la regola di inizio e fine (anche dopo mezzanotte), con inizio e fine al minuto. Fermato nello stesso
minuto: fine vuota e zero ore. **Acceso da piu' di 24 ore**: la bozza ha solo l'inizio, zero ore e in piu'
`"avviso": "Il timer era acceso da più di un giorno: scrivi tu le ore giuste"`. Spento: `"Il timer non è acceso"` (una
richiesta ripetuta dalla coda: la bozza c'e' gia', si rilegge con `ore`). Nel registro: tabella `timer`, nota
`"fermato: ore 14 in bozza"`.

### 14.6 Approvazioni

`daApprovare {}` (chi approva; gli altri `"Non hai il permesso per approvare ore, rapportini e spese: chiedi al
titolare"`, `permesso:false`):
```json
{"ok": true, "oggi": "2026-10-22", "quante": 8, "conAnomalie": 5,
 "persone": [{"idUtente": 3, "nome": "Marco Collaboratore", "quante": 8, "conAnomalie": 5, "voci": [
   {"tipo": "rapportino", "id": "RAP/2026/0006", "idUtente": 3, "data": "2026-10-16", "cosa": "Rapportino",
    "dettaglio": "RAP/2026/0006 · Verifica impianto di terra · venerdì 16", "quanto": 4.5, "unita": "ore", "km": 22, "anomalie": []},
   {"tipo": "spesa", "id": 12, "idUtente": 3, "data": "2026-10-20", "cosa": "Spesa",
    "dettaglio": "Albergo per il collaudo notturno · 26ST001 · martedì 20", "quanto": 230, "unita": "euro",
    "anomalie": [{"tipo": "sopra200", "testo": "Spesa sopra i 200 €"}]},
   {"tipo": "trasferta", "id": 2, "idUtente": 3, "data": "2026-10-20", "cosa": "Trasferta",
    "dettaglio": "Schio, passando dal fornitore a Padova · 26ST001 · martedì 20", "quanto": 136.8, "unita": "euro", "km": 180,
    "anomalie": [{"tipo": "kmDiversi", "testo": "Km diversi dal solito: 180 invece di circa 96"}]},
   {"tipo": "ore", "id": 8, "idUtente": 3, "data": "2026-10-21", "cosa": "Ore",
    "dettaglio": "26ST001 · Cablaggio quadro di linea 3 · mercoledì 21", "quanto": 8, "unita": "ore",
    "anomalie": [{"tipo": "troppeOre", "testo": "13 ore in un giorno"}]},
   {"tipo": "spesa", "id": 9, "idUtente": 3, "data": "2026-10-21", "cosa": "Spesa", "dettaglio": "Pranzo · senza commessa · mercoledì 21",
    "quanto": 16.5, "unita": "euro", "anomalie": [{"tipo": "senzaFoto", "testo": "Senza scontrino"}]}]}]}
```
- Gruppi per persona (in ordine di nome), voci per giorno (poi ore, rapportino, spesa, trasferta). `cosa` e `dettaglio`
  sono pronti da mostrare ("Ore · 26ST046 · martedì 21"); `quanto` + `unita` (`ore` | `euro`) il numero a destra; `km`
  per rapportini e trasferte. Per le trasferte `quanto` = rimborso km + indennita'.
- Ci sono le ore, le spese (non dei rapportini) e le trasferte `da_approvare`, e i rapportini con `statoApprovazione:
  "da_approvare"` non annullati. Le spese di un rapportino non si elencano a parte: si approvano col rapportino.
- **Anomalie** (`tipo` e `testo` pronto, in giallo scuro): `troppeOre` = in quel giorno la persona ha piu' di
  `ORE_GIORNALIERE` + 4 ore, contando ore registrate (mandate o approvate) e rapportini non annullati (su ogni voce di quel
  giorno: `"12,5 ore in un giorno"`); `senzaFoto` = spesa senza scontrino (`"Senza scontrino"`), rapportino con spese e
  senza foto (`"Spese senza scontrino"`); `sopra200` = spesa oltre 200 euro (`"Spesa sopra i 200 €"`, nel rapportino
  `"Una spesa sopra i 200 €"`); `kmDiversi` = rapportino o trasferta con commessa i cui km (totali) si scostano di piu' di
  un quarto, e almeno 10 km, dalla mediana degli altri km di quella commessa (servono almeno due altri valori).

`approva {voci: [{tipo, id}]}`, `respingi {voci, motivo}`, `annullaApprovazione {voci}` (chi approva il modulo della
voce; POST) → vero:
```json
{"ok": true, "fatte": 4, "voci": [{"tipo": "ore", "id": 7, "stato": "approvata"}, {"tipo": "ore", "id": 8, "stato": "approvata"},
  {"tipo": "ore", "id": 9, "stato": "approvata"}, {"tipo": "rapportino", "id": "RAP/2026/0006", "stato": "approvato"}]}
```
- `tipo`: `ore` | `rapportino` (id = il numero RAP) | `spesa` | `trasferta`. Tutto o niente (una transazione).
- Una voce gia' nello stato voluto si salta (`fatte` non la conta, `voci` la riporta): la coda del telefono puo'
  ripetere. Una approvata si puo' respingere (e viceversa) finche' non e' rimborsata, fatturata o (rapportino) mandata.
- `respingi` vuole il motivo, che arriva a chi ha scritto: e' nel registro (`azione: "respingi"`, `dopo.motivo`), nella
  riga (`motivoRifiuto`) e nella sua Dashboard (§14.13). Approvare o respingere un rapportino fa lo stesso alle sue spese.
- `annullaApprovazione` (l'Annulla dell'avviso dopo Approva o Respingi): rimette `da_approvare`.
Errori: `"Scrivi il motivo: arriva a chi l'ha scritta"`, `"Scegli cosa approvare"` (o `respingere`, `rimettere da
approvare`), `"Tipo: ore, rapportino, spesa o trasferta"`, `"Le ore del 21/10 sono ancora in bozza: chi le ha
scritte deve prima mandarle"` (o `"La spesa del 21/10 è ancora in bozza: chi l'ha scritta deve prima mandarla"`), `"La spesa 3 è nel rapportino RAP/2026/0002: si approva insieme al rapportino"`, `"La spesa
è già stata rimborsata il 22/10: non si respinge più"`, `"Il rapportino RAP/2026/0005 è già stato mandato al cliente: non
si rimette da approvare"`, `"Non hai il permesso per approvare ore e rapportini: chiedi al titolare"` (`permesso:false`,
prima di cercare la voce), `"Ore 9 non trovate"`.

### 14.7 Rapportini: cosa cambia

Ogni rapportino ha in piu' (vero, di Marco, respinto e poi corretto):
```json
{"statoApprovazione": "da_approvare", "approvatoDa": null, "approvatoIl": "", "motivoRifiuto": "",
 "righeSpese": [{"id": 1, "importo": 14.5, "categoria": "altro", "descrizione": "Pranzo", "destinazione": "cliente",
   "dalRapportino": true, "stato": "approvata", "foto": [], "...": "tutti i campi di una spesa (§14.8)"}]}
```
- **Pillola**: `statoApprovazione: "da_approvare"` → "Da approvare"; `"respinto"` → "Respinto: " + `motivoRifiuto`.
  `""` (tutti quelli di prima, e quelli di titolare e amministrazione con `APPROVAZIONE` di base) = niente pillola.
- Nasce `da_approvare` il rapportino scritto da chi deve far approvare; ci torna quando chi l'ha scritto lo cambia davvero
  (una ripetizione uguale dalla coda no) o lo rimanda dopo un rifiuto. Chi approva puo' cambiarlo senza toccare
  l'approvazione. Firmare si puo' sempre (il cliente firma in cantiere).
- **Non si manda al cliente e non si fattura finche' non e' approvato**: `stato` a `INVIATO` o `FATTURATO` e `inviaEmail`
  (non `aMe`) rispondono, prima di spedire, `"Il rapportino RAP/2026/0012 aspetta l'approvazione: si manda al cliente e si
  fattura solo dopo"` o `"Il rapportino RAP/2026/0012 è stato respinto (Le ore di viaggio mancano): correggilo e
  rimandalo in approvazione"`. La Dashboard non lo conta tra i "firmati da mandare".
- `righeSpese`: le righe di spese del rapportino (non tolte), anche quelle spostate allo studio o "Mia". `spese` resta
  **il totale di quelle al cliente** (§14.12). Le foto (`foto`) sono quelle di sempre: i file `spesa` col suo
  `rapportino_id`, cioe' gli scontrini delle sue spese al cliente.
- `rapportini` accetta anche il filtro `statoApprovazione` (`da_approvare` | `approvato` | `respinto` | `nessuno` = `""`).
- Il collaboratore continua a non vedere `tariffa`, `totale`, `euroKm`...; vede l'`importo` delle sue `righeSpese`.

### 14.8 Spese

`spese {da?, a?, utente?, commessa?, stato?, destinazione?, categoria?, idRapportino?, idTrasferta?}` (spese 1). Di base
il mese di oggi; i piu' recenti prima. Le spese di un rapportino annullato non ci sono (tornano col ripristino), tranne
chiedendo `idRapportino`.
```json
{"ok": true, "da": "2026-10-01", "a": "2026-10-31",
 "spese": [
  {"id": 6, "idUtente": 1, "utente": "Manuel Gasparotto", "data": "2026-10-20", "importo": 52, "categoria": "altro",
   "descrizione": "Diritti di segreteria del Comune", "idCommessa": "26ST002", "commessa": "Quadro elettrico capannone",
   "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idRapportino": "", "idTrasferta": null, "destinazione": "cliente",
   "anticipazione": true, "pagataDaMe": true, "stato": "approvata", "approvataDa": null, "approvataDaNome": "",
   "approvataIl": "", "motivoRifiuto": "", "rimborsataIl": "", "fatturataIl": "", "dalRapportino": false,
   "foto": [{"id": "lAhnld7qj9SelrDrp4Y5ZlC0-UtT", "url": "/file/lAhnld7qj9SelrDrp4Y5ZlC0-UtT"}], "tolta": "",
   "puoScrivere": true, "bloccata": "", "soloCampi": null, "creato": "2026-10-22T01:40:39", "modificato": "2026-10-22T01:40:39"},
  {"id": 1, "data": "2026-10-02", "importo": 14.5, "categoria": "altro", "descrizione": "Pranzo", "idCommessa": "26ST001",
   "idRapportino": "RAP/2026/0002", "destinazione": "cliente", "pagataDaMe": false, "stato": "approvata", "dalRapportino": true,
   "foto": [], "puoScrivere": true,
   "bloccata": "È nel rapportino RAP/2026/0002, già firmato: si cambiano solo categoria, descrizione e chi l'ha pagata",
   "soloCampi": ["categoria", "descrizione", "pagataDaMe"], "...": "..."}],
 "totali": {"quante": 12, "cliente": 320.8, "studio": 110.2, "personale": 12, "daRimborsare": 332.6, "senzaFoto": 4}}
```
- `categoria`: `carburante` | `pedaggio` | `parcheggio` | `vitto` | `alloggio` | `treno` | `aereo` | `taxi` | `materiale` |
  `altro`. `destinazione`: `cliente` ("Al cliente", pillola blu) | `studio` ("Allo studio", grigia) | `personale` ("Mia",
  viola). `anticipazione` (documento intestato al cliente, art. 15) solo con `cliente`. `pagataDaMe` = "L'ho pagata io":
  la paga lo studio a chi l'ha scritta (`idUtente`).
- `idRapportino` (`""` se no) e `dalRapportino` (la riga dell'importo del passo 3); `idTrasferta` (`null` se no).
- `rimborsataIl`, `fatturataIl`: `""` o l'istante. Le spese al cliente di un rapportino fatturato hanno `fatturataIl` del
  rapportino (la fase 4 non le rifattura); le altre al cliente sono quelle da riaddebitare.
- `totali` (delle righe non respinte): i tre riquadri Al cliente · Allo studio · "Mia", e `daRimborsare` = di queste,
  quelle pagate da chi le ha scritte, non "Mia", non rimborsate, mandate o approvate (il riquadro Da rimborsare somma
  anche `trasferte.totali.daRimborsare`); `senzaFoto` = quante senza scontrino.

`salvaSpesa {spesa: {id?, idUtente?, data?, importo, categoria?, descrizione?, idCommessa?, idCliente?, idRapportino?,
idTrasferta?, destinazione?, anticipazione?, pagataDaMe?, bozza?}}` (spese 2) → `{"ok": true, "spesa": {...}}` (vero, di
Marco: `"stato": "da_approvare"`, `"importo": 8.4`). Senza `id` crea (di base oggi, `altro`, `pagataDaMe: false`: l'app
lo manda sempre), con `id` cambia solo i campi mandati.
- **A chi va, di base**: al cliente se c'e' una commessa, un cliente o un rapportino; allo studio se no. `"mia"` vale
  `personale`. Con la commessa il cliente e' il suo.
- Con `idRapportino`: persona, commessa e cliente sono quelli del rapportino, e lo stato segue la sua approvazione; la
  colonna `spese` e il `totale` del rapportino si rifanno (§14.12). Con `idTrasferta`: la persona e' quella della
  trasferta, commessa e cliente di base i suoi.
- `importo` al centesimo, piu' di zero (zero solo in bozza).
- Bloccate: rimborsata, fatturata, approvata (per il collaboratore, se non e' di un rapportino); di un rapportino firmato,
  inviato o fatturato si cambiano solo `categoria`, `descrizione`, `pagataDaMe`.
Errori: `"Importo: scrivi quanto hai speso"`, `"Categoria: carburante, pedaggio, parcheggio, vitto, alloggio, treno,
aereo, taxi, materiale o altro"`, `"A chi va: cliente, studio o personale"`, `"Al cliente: scegli la commessa o il
cliente"`, `"Commessa 26ST999 non trovata"`, `"Cliente C009 non trovato"`, `"Rapportino RAP/2026/0099 non trovato"`,
`"Trasferta 9 non trovata"`, `"Il rapportino RAP/2026/0011 è già firmato: per aggiungere spese riportalo in bozza"`, la
frase di `bloccata`, `"La spesa non cambia persona: toglila e scrivila per l'altra persona"`, `permesso:false` per le
spese degli altri.

La foto dello scontrino: `caricaFile {tipo: "spesa", idSpesa, base64, mime, nome?, idFile}` (spese 2) →
`{"ok": true, "file": {"id": "M8kCHDq-MmK52LrPOKnB_9p9bUyK", "url": "/file/M8kCHDq-MmK52LrPOKnB_9p9bUyK", "nome": "spesa 13
contratto-1.png"}}` (lo stesso `idFile` non crea doppioni). Senza `idSpesa`, `caricaFile {tipo: "spesa", id | idLocale}`
resta la foto del rapportino di sempre, e va anche alla riga del passo 3. `GET /file/<id>`: chi vede la spesa (o il suo
rapportino). `togliFotoSpesa {id}` (id del file, spese 2) → `{"ok": true, "spesa": {...}}`: la foto va nel cestino
(`cestino` ha in piu' `idSpesa`).

`togliSpesa {id, annulla?}` (spese 2) → `{"ok": true, "spesa": {..., "tolta": "..."}}`. Una spesa di un rapportino tolta
esce dal suo conto; di un rapportino firmato: `"Il rapportino RAP/2026/0001 è già firmato: per togliere la spesa riportalo
in bozza"`.

### 14.9 Trasferte e veicoli

`trasferte {da?, a?, utente?, commessa?, stato?}` (spese 1): di base il mese di oggi (per il giorno di partenza).
```json
{"ok": true, "da": "2026-10-01", "a": "2026-10-31",
 "trasferte": [
  {"id": 2, "idUtente": 3, "utente": "Marco Collaboratore", "dal": "2026-10-20", "al": "2026-10-21", "giorni": 2,
   "destinazione": "Schio, passando dal fornitore a Padova", "motivo": "Collaudo notturno della linea 3",
   "idCommessa": "26ST001", "commessa": "Nuovo magazzino automatico Batokyo", "idCliente": "C001", "cliente": "Elettrodinamica",
   "km": 90, "andataRitorno": true, "kmTotali": 180, "idVeicolo": 1, "veicolo": "Volvo XC40", "euroKm": 0.76,
   "rimborsoKm": 136.8, "indennita": 0, "totale": 136.8, "stato": "da_approvare", "approvataDa": null, "approvataDaNome": "",
   "approvataIl": "", "motivoRifiuto": "", "rimborsataIl": "",
   "spese": [{"id": 12, "importo": 230, "categoria": "alloggio", "descrizione": "Albergo per il collaudo notturno", "idTrasferta": 2, "...": "..."}],
   "speseTotale": 230, "tolta": "", "puoScrivere": true, "bloccata": "", "creato": "2026-10-22T01:40:39", "modificato": "2026-10-22T01:40:39"}],
 "totali": {"quante": 2, "km": 276, "rimborsoKm": 209.76, "indennita": 0, "totale": 209.76, "daRimborsare": 209.76}}
```
- `motivo` = perche' si e' andati; il motivo del rifiuto e' `motivoRifiuto` come altrove.
- `km` = quelli scritti; `kmTotali` = x2 con `andataRitorno`. `euroKm` e `veicolo` sono **congelati** alla nascita (e
  quando si cambia veicolo): `rimborsoKm` = kmTotali x euroKm al centesimo; `totale` = rimborsoKm + indennita'.
- `spese`: le spese della trasferta (si aggiungono con `salvaSpesa {idTrasferta}`); `speseTotale` quelle non respinte.
- `totali`: delle trasferte non respinte; `daRimborsare` = non rimborsate, mandate o approvate.

`salvaTrasferta {trasferta: {id?, idUtente?, dal?, al?, destinazione, motivo?, idCommessa?, idCliente?, km?,
andataRitorno?, idVeicolo?, indennita?, bozza?}}` (spese 2) → `{"ok": true, "trasferta": {...}}` (vero: 11 km andata e
ritorno a 0,76 = `"kmTotali": 22, "rimborsoKm": 16.72`). Di base: oggi, `al` = `dal`, il primo veicolo attivo,
`indennita` = `INDENNITA_TRASFERTA` x giorni (vuota = 0). Cambiare il veicolo prende il suo euro al km di adesso; cambiare
altro tiene quello congelato. Errori: `"Destinazione: scrivi dove sei andato"`, `"Al: non può venire prima della
partenza"`, `"Km: non possono essere negativi"`, `"Veicolo 9 non trovato"`, `"Veicolo: scegli con quale veicolo, per il
rimborso al km"` (km senza veicoli), `"Indennità: non può essere negativa"`, `"Rimborsata il 22/10/2026: non si cambia"`,
`"È già approvata: per cambiarla chiedi a chi approva"` (collaboratore).
`togliTrasferta {id, annulla?}` (spese 2) → `{"ok": true, "trasferta": {...}}`; con spese ancora sue: `"La trasferta ha
1 spesa: prima toglile o spostale"`.

`veicoli {tutti?}` (spese 1; `tutti` = anche quelli non piu' in uso):
```json
{"ok": true, "aciAnno": 2026, "paginaAci": "https://www.aci.it/",
 "veicoli": [{"id": 1, "nome": "Volvo XC40", "alimentazione": "", "euroKm": 0.76, "annoAci": 2026, "attivo": true,
              "trasferte": 2, "creato": "2026-10-22T01:40:39", "modificato": "2026-10-22T01:40:39"}]}
```
`trasferte` = quante (non tolte) lo usano. `paginaAci` e' il sito dell'ACI, dove stanno le tabelle dei costi
chilometrici (Amministrazione › Veicoli e rimborso km lo apre).
`salvaVeicolo {veicolo: {id?, nome, alimentazione?, euroKm, annoAci?, attivo?}}` (amministrazione 2) → `{"ok": true,
"veicolo": {...}}` (vero: `{"id": 2, "nome": "Furgone di prova", "alimentazione": "gasolio", "euroKm": 0.5432, "annoAci":
2026, "attivo": true, "trasferte": 0, ...}`). `euroKm` fino a 4 decimali; `alimentazione` testo libero (benzina, gasolio,
ibrida, elettrica...); `annoAci` di base `ACI_ANNO`, e un anno piu' nuovo di `ACI_ANNO` lo aggiorna. Non si cancellano:
`attivo: false`. Cambiare l'euro al km **non riscrive le trasferte gia' scritte**. Errori: `"Nome: scrivi il nome del
veicolo"`, `"Euro al km: non può essere negativo"`, `"Anno ACI: scrivi l'anno delle tabelle, per esempio 2026"`.

### 14.10 Rimborsi e riepiloghi

`rimborsi {utente?}` (spese 1): cosa va restituito a chi (`rimborsiDovuti`, §14.15):
```json
{"ok": true, "totale": 150.66, "puoSegnare": true,
 "persone": [
  {"idUtente": 1, "nome": "Manuel Gasparotto", "totale": 136.36, "inAttesa": 0, "spese": 3, "trasferte": 1, "km": 96, "voci": [
    {"tipo": "spesa", "id": 4, "data": "2026-10-22", "descrizione": "Parcheggio Schio centro", "categoria": "parcheggio",
     "idCommessa": "26ST001", "importo": 3, "km": null},
    {"tipo": "trasferta", "id": 1, "data": "2026-10-21", "descrizione": "Schio, cantiere Batokyo", "categoria": "",
     "idCommessa": "26ST001", "importo": 72.96, "km": 96}]},
  {"idUtente": 3, "nome": "Marco Collaboratore", "totale": 4.5, "inAttesa": 391.7, "spese": 1, "trasferte": 0, "km": 0,
   "voci": [{"tipo": "spesa", "id": 11, "data": "2026-10-19", "descrizione": "Parcheggio Batokyo", "importo": 4.5, "...": "..."}]}]}
```
`totale` = da restituire adesso (spese pagate da lei, approvate, non "Mia", piu' trasferte approvate, non ancora
rimborsate); `inAttesa` = le stesse cose ancora da approvare (non si rimborsano finche' non sono approvate); `km` = i km
delle trasferte dovute. Il collaboratore riceve solo la sua scheda. `puoSegnare`: titolare e amministrazione.

`segnaRimborsato {voci: [{tipo: "spesa"|"trasferta", id}] | idUtente, annulla?}` (spese 2, **solo titolare e
amministrazione**; gli altri `"Non hai il permesso per segnare i rimborsi: chiedi al titolare"`) → vero `{"ok": true,
"fatte": 1, "totale": 9.8}`. Con `idUtente` = tutto quello che e' dovuto a quella persona. `annulla: true` toglie il
"rimborsato" (l'Annulla dell'avviso). Una spesa o trasferta rimborsata non si cambia piu' (`bloccata`). Errori: `"La spesa
3 non l'ha pagata chi l'ha scritta: non c'è niente da rimborsare"`, `"La spesa 7 è "Mia": non si rimborsa"`, `"La spesa 9
non è ancora approvata"`, `"Non c'è niente da rimborsare a questa persona"`, `"Scegli cosa segnare come rimborsato"`.

`riepilogoSpese {da?, a?, per: "persona"|"commessa"|"categoria", utente?, commessa?}` (spese 1; di base il mese):
```json
{"ok": true, "da": "2026-10-01", "a": "2026-10-31", "per": "persona",
 "righe": [{"chiave": 1, "nome": "Manuel Gasparotto", "quante": 6, "cliente": 77.9, "studio": 83.9, "personale": 0,
            "anticipazioni": 52, "daRimborsare": 136.36, "inAttesa": 0, "trasferte": 1, "km": 96, "rimborsoKm": 72.96,
            "indennita": 0, "totale": 234.76}],
 "totale": {"quante": 12, "cliente": 320.8, "studio": 110.2, "personale": 12, "anticipazioni": 52, "daRimborsare": 542.36,
            "inAttesa": 391.7, "trasferte": 2, "km": 276, "rimborsoKm": 209.76, "indennita": 0, "totale": 640.76}}
```
Contano le spese e le trasferte mandate o approvate (non bozze, non respinte, non tolte). `chiave`: id della persona
(`"nessuno"` senza persona), codice commessa (`""` = "Senza commessa", con `idCliente` e `nomeCliente`: `cliente` resta la somma delle spese al cliente), o la categoria (con
`nome` = "Pedaggio"...; per categoria niente trasferte). **`totale` = cliente + studio + rimborso km + indennita'** (le
"Mia" sono della persona, non dello studio). `daRimborsare` qui comprende anche quelle ancora da approvare (`inAttesa` e'
quella parte). Righe dalla piu' grande.

### 14.11 Statistiche delle ore e costo della commessa

`statisticheOre {da?, a?, per: "persona"|"commessa"}` (rapportini 1; di base il mese):
```json
{"ok": true, "da": "2026-10-01", "a": "2026-10-31", "per": "commessa",
 "righe": [{"chiave": "26ST001", "nome": "Nuovo magazzino automatico Batokyo", "ore": 52, "fatturabili": 50.5, "percentuale": 97,
            "oreRapportini": 26, "oreRegistrate": 26, "costo": 1111, "costoNoto": true, "idCliente": "C001", "cliente": "Elettrodinamica"},
           {"chiave": "", "nome": "Attività dello studio", "ore": 9, "fatturabili": 0, "percentuale": 0, "oreRapportini": 0,
            "oreRegistrate": 9, "costo": 135, "costoNoto": true, "idCliente": "", "cliente": ""}],
 "totale": {"ore": 77, "fatturabili": 66, "percentuale": 86, "oreRapportini": 34, "oreRegistrate": 43, "costo": 1633.5, "costoNoto": true}}
```
- Contano i **rapportini** non annullati e non respinti (ore = lavoro + straordinari + viaggio; fatturabili = lavoro +
  straordinari, + viaggio solo se il cliente lo paga; costo = (lavoro + straordinari) x il costo orario congelato nel
  rapportino, o quello di oggi se non c'e': il viaggio e' dentro il costo orario, come il cruscotto della fase 1) e le
  **ore registrate** mandate o approvate (fatturabili se `fatturabile`; costo = ore x costo orario congelato).
- `per: "persona"`: `chiave` = id dell'utente (i rapportini importati dal foglio, senza persona, hanno `chiave`
  `"foglio:<tecnico>"` e `nome` = il tecnico). `percentuale` = fatturabili / ore x 100, intera (`null` senza ore).
- `costo` solo con `costi`; `costoNoto: false` se manca il costo orario di qualcosa. Il collaboratore vede solo le sue.

`costoCommessa {idCommessa}` (commesse 1; un collaboratore solo per le commesse dove e' responsabile o tra le persone):
```json
{"ok": true, "idCommessa": "26ST001",
 "costoCommessa": {"lavoro": 671, "lavoroNoto": true, "auto": 291.84, "speseRapportini": 14.5, "oreRegistrate": 26,
   "costoOreRegistrate": 572, "speseFuoriRapportini": 245.9, "trasferte": 209.76, "kmTrasferte": 276,
   "soloRapportini": 977.34, "totale": 2005}}
```
Senza `costi` la risposta e' solo `{"ok": true, "idCommessa": "26ST001"}`. Le parti (`costoCommessa` in conti.js):
- `lavoro`, `auto`, `speseRapportini`, `lavoroNoto`: **esattamente il cruscotto della fase 1** (`cruscotto()` di
  `pc/ui/conti.js`, uguale in Kotlin): ore di lavoro e straordinari dei rapportini non annullati x il loro costo orario
  (quello di oggi se manca), km x il loro euro al km, la colonna spese. `soloRapportini` = la loro somma = il
  `costo.totale` della fase 1 (la prova lo confronta col cruscotto vero);
- in piu' dalla fase 3: `costoOreRegistrate` (ore registrate mandate o approvate x costo orario congelato; `oreRegistrate`
  sono le ore), `speseFuoriRapportini` (spese della commessa al cliente e allo studio non legate a un rapportino, mandate
  o approvate, piu' quelle di un rapportino spostate allo studio; le "Mia" mai), `trasferte` (rimborso km + indennita'
  delle trasferte mandate o approvate; `kmTrasferte` i km);
- `totale` = tutto. Senza ore registrate, spese fuori dai rapportini e trasferte, `totale` = `soloRapportini` al centesimo.

**Cosa cambia per il margine della fase 1.** I numeri gia' mostrati non cambiano da soli: telefono e computer li
calcolano dai rapportini e restano uguali (`soloRapportini`). Ma dalla fase 3 sono **incompleti**: non sanno delle ore
registrate, delle spese fuori dai rapportini e delle trasferte, quindi con quei dati il costo sostenuto della fase 1 e'
piu' basso del vero e il margine atteso piu' alto. Le app nuove, nella pagina della commessa, prendono il costo da
`costoCommessa`: costo sostenuto = `totale`; lavoro = `lavoro` + `costoOreRegistrate`; costo atteso = max(lavoro, costo
previsto dal budget) + `auto` + `speseRapportini` + `speseFuoriRapportini` + `trasferte`; margine atteso = valore atteso
meno costo atteso (la stessa regola della fase 1, coi pezzi nuovi). Le ore del budget della Dashboard ("ore oltre il
budget") restano quelle dei rapportini, come prima.

### 14.12 Le spese dei rapportini: la migrazione e le versioni vecchie

**La regola della migrazione** (`003-ore-spese.sql` + `003-ore-spese.js`, con la copia `wisper.db.prima-3` prima): ogni
rapportino gia' scritto con un importo di spese diverso da zero riceve **una** riga `spese` legata a lui
(`dal_rapportino` 1), con **lo stesso identico importo** (anche tre decimali, un numero scritto come testo con la virgola,
un negativo: quello che `numero()` legge), destinazione `cliente`, categoria `altro`, descrizione = le note spese (o
"Spese del rapportino"), la sua data, commessa, cliente e persona, `approvata` (prima non serviva approvare), fatturata
se il rapportino e' fatturato. Le sue foto diventano le foto della riga (anche quelle nel cestino). Anche gli annullati
ricevono la riga (un ripristino li riporta com'erano). Spese vuote, `null` o zero: nessuna riga. **Il rapportino non si
tocca**: la colonna `spese` resta quella, quindi totali, conti, PDF, riepiloghi e fine mese restano identici al centesimo.
La prova (`server/prove/migrazione-spese.test.js`) apre un database del server 0.5.0 coi casi limite, lo migra e confronta
i rapportini campo per campo, il CSV carattere per carattere e i soldi della Dashboard con quelli che il server 0.5.0 dava
sullo stesso database (`prove/migrazione-003/prima.json`, scritto col codice della fase 2). L'importazione dal foglio fa
la stessa cosa dopo aver scritto i rapportini.

**Dopo**: la colonna `spese` del rapportino e' sempre il totale delle sue righe al cliente non tolte.
- `salvaRapportino` (app nuove e **versioni vecchie dal ponte**, che mandano `spese` e le foto come oggi): la colonna e'
  quella mandata; se le righe al cliente non sommano a lei si cambia la riga del passo 3 (nasce se non c'e', si toglie
  se va a zero, torna la stessa riga se le spese tornano); la sua descrizione segue le note spese quando cambiano. Le foto
  caricate come oggi vanno al rapportino e alla riga del passo 3. Se le spese del rapportino sono divise in piu' righe e
  il nuovo totale e' piu' piccolo delle altre, non si indovina: `"Le spese di RAP/2026/0007 sono divise in più righe:
  cambiale da Spese e trasferte"` e il rapportino non si salva (la coda del telefono si ferma su quello).
- Una spesa del rapportino **spostata allo studio o "Mia"** (o tolta) esce dal conto: la colonna scende e il `totale` si
  rifa' coi pezzi congelati (`compensoOre` + `rimborsoKm` + spese, come `calcola()`); le sue foto escono dalle foto del
  rapportino (e dal PDF). Vera, sul rapportino in bozza con 0,10 di spese: `spese` 0,10 → 0, `totale` 206,50 → 206,40;
  tornata al cliente, di nuovo 0,10 e 206,50. Se a cambiarla e' chi ha scritto il rapportino e deve farlo approvare, il
  rapportino torna da approvare.
- **Da firmato in poi** (FIRMATO, INVIATO, FATTURATO) le spese del rapportino non cambiano importo, destinazione, data,
  rapportino; non si tolgono e non se ne aggiungono: si cambiano solo categoria, descrizione e chi l'ha pagata. Cosi' un
  documento firmato non cambia mai numeri. Per cambiarle si riporta il rapportino in bozza, come oggi.

### 14.13 Dashboard: cosa si aggiunge

- `numeri.ore` (con rapportini ≥ 1): `{"settimana": 43, "mese": 43, "fatturabiliMese": 34, "timerAcceso": false}` (le
  ore registrate mandate o approvate: le sue per il collaboratore, di tutti per gli altri; `timerAcceso` = il proprio).
- `numeri.approvare` (chi approva, non nella vista del collaboratore): `{"voci": 8, "conAnomalie": 5}`.
- `numeri.rimborsi` (chi segna i rimborsi, con `costi`): `{"daFare": 150.66, "persone": 3}`.
- Le voci nuove (vere; il timer e le tabelle ACI vengono dalle prove, che spostano l'orologio):
```json
{"urgenti": [
  {"tipo": "approvare", "gravita": "attenzione", "titolo": "8 cose da approvare di Marco Collaboratore",
   "dettaglio": "Ore, spese, una trasferta e un rapportino · 5 con un'anomalia", "quanto": 8, "unita": "voci",
   "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "daApprovare"}}},
  {"tipo": "respinta", "gravita": "attenzione", "titolo": "Ore del 19/10 respinte",
   "dettaglio": "Motivo: Il riordino del magazzino non si segna: è dentro le ore di studio · Manuel Gasparotto",
   "quanto": null, "unita": null, "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "ore", "giorno": "2026-10-19"}}},
  {"tipo": "timer", "gravita": "attenzione", "titolo": "Il timer è acceso da 11 ore",
   "dettaglio": "26ST001 · dalle 7:45 · fermalo e correggi le ore", "quanto": 11, "unita": "ore",
   "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "ore"}}}],
 "settimana": [
  {"tipo": "rimborsi", "gravita": "soldi", "titolo": "Rimborsi da fare",
   "dettaglio": "Laura Amministrazione 9,80 €, Manuel Gasparotto 136,36 €, Marco Collaboratore 4,50 €", "quanto": 150.66,
   "unita": "euro", "collegamento": {"pagina": "spese", "filtro": {"segmento": "rimborsi"}}},
  {"tipo": "veicoli", "gravita": "attenzione", "titolo": "Aggiorna il rimborso km con le tabelle ACI 2027",
   "dettaglio": "I rimborsi km sono ancora quelli delle tabelle 2026: le trasferte già scritte restano come sono",
   "quanto": null, "unita": null, "collegamento": {"pagina": "amministrazione", "filtro": {"sezione": "veicoli"}}}]}
```
- **urgenti**: cose da approvare (chi approva; "di <nome>" se sono di una persona sola); le proprie cose respinte col
  motivo e chi le ha respinte (una per una fino a 3, poi `"5 cose respinte da correggere"`): `"Ore del 19/10 respinte"`,
  `"RAP/2026/0012 respinto"`, `"Spesa del 21/10 respinta"`, `"Trasferta del 20/10 respinta"`; il proprio timer acceso da
  piu' di 10 ore e, per chi approva, quelli degli altri (`"Il timer di Marco Collaboratore è acceso da 11 ore"`; nel
  dettaglio `"dalle 7:45 del 21/10"` se e' partito un altro giorno).
- **settimana**: rimborsi da fare (titolare e amministrazione, con `costi`; i primi tre nomi); **dall'anno nuovo**, finche'
  un veicolo attivo o `ACI_ANNO` hanno l'anno vecchio, `"Aggiorna il rimborso km con le tabelle ACI {anno}"` (a chi ha
  `amministrazione` 2). Aggiornare l'anno del veicolo (`salvaVeicolo {annoAci}`) la fa sparire.
- `collegamento.pagina` nuova: `spese` (Spese e trasferte) con `filtro.segmento` `spese` | `trasferte` | `rimborsi` e
  `id`; `rapportini` (Ore e rapportini) con `filtro.segmento` `ore` | `rapportini` | `daApprovare` (e `giorno`, `id`,
  `stato`); `amministrazione` con `filtro.sezione: "veicoli"`. `tipo` nuovi: `approvare`, `respinta`, `timer`,
  `rimborsi`, `veicoli`. Unita' nuova: `voci`.
- Il collaboratore: le sue ore, le sue respinte e il suo timer; niente soldi, niente "€", niente cose da approvare.
- I rapportini che aspettano l'approvazione non sono tra i "firmati da mandare".

### 14.14 Esportazione

`esporta {cosa: "ore"|"spese"|"trasferte"|"rimborsi", ...i filtri dell'elenco}`: stesso CSV della §12.13, stessi periodi
di base degli elenchi (ore: la settimana; spese e trasferte: il mese; rimborsi: tutti quelli dovuti). Un collaboratore
esporta solo i suoi.
- **ore** (rapportini 1): Data, Persona, Inizio, Fine, Pausa (minuti), Ore, Codice commessa, Commessa ("Attività dello
  studio" senza commessa), Cliente, Prestazione, Attività, Descrizione, Fatturabile, Tipo, Costo orario, Costo (questi due
  solo con `costi`), Stato (Bozza, Da approvare, Approvata, Respinta), Approvata o respinta da, Il, Motivo del rifiuto, Dal
  timer.
- **spese** (spese 1): Data, Persona, Categoria, Descrizione, Importo, A chi va (Al cliente, Allo studio, Mia),
  Anticipazione, Pagata da chi l'ha scritta, Codice commessa, Commessa, Codice cliente, Cliente, Rapportino, Trasferta,
  Scontrino (Sì/No), Stato, Approvata o respinta da, Il, Motivo del rifiuto, Rimborsata il, Fatturata il.
- **trasferte** (spese 1): Dal, Al, Giorni, Persona, Destinazione, Motivo, Codice commessa, Commessa, Cliente, Veicolo,
  Km, Andata e ritorno, Km totali, Euro al km, Rimborso km, Indennità, Totale, Stato, Approvata o respinta da, Il, Motivo
  del rifiuto, Rimborsata il.
- **rimborsi** (spese 1): Persona, Tipo (Spesa, Trasferta), Data, Descrizione, Codice commessa, Km, Importo.
Importi di spese, trasferte e rimborsi ci sono anche senza `costi` (soldi della persona, §14.1).

### 14.15 I conti condivisi

In `server/src/conti.js`, coi casi in **`server/prove/casi-ore-spese.json`** (telefono e computer li rifanno per
l'anteprima e devono ritrovare gli stessi numeri e le stesse frasi):
- `oreDaOrari(inizio, fine, pausaMinuti)` → `{inizio, fine, pausaMinuti, minuti, ore, giornoDopo}`: minuti = fine − inizio
  − pausa; fine prima dell'inizio = giorno dopo (+24 ore); fine uguale all'inizio = errore; pausa ≥ durata = errore;
  `ore = Math.round(minuti / 60 * 100) / 100`; le ore si scrivono 8:30, 08:30, 08.30 o 08:30:00 e tornano 08:30.
- `rimborsoTrasferta({km, andataRitorno, euroKm, indennita})` → `{kmTotali, rimborsoKm, indennita, totale}`, ogni pezzo
  al centesimo (`centesimi(n) = Math.round(n * 100) / 100`) prima di sommare.
- `rimborsiDovuti(spese, trasferte)` → per persona (in ordine di id) `{idUtente, totale, inAttesa, spese, trasferte, km,
  voci}`.
- `costoCommessa(...)` (§14.11) e `oreDelRapportino(...)` (§14.11) restano del server: le app mostrano quello che risponde.

### 14.16 Note per chi legge il database

Tabelle nuove (migrazione `003-ore-spese.sql`): `veicoli`, `ore`, `timer`, `trasferte`, `spese`; colonne nuove
`rapportini.stato_approvazione`, `approvato_da`, `approvato_il`, `motivo`, e `file.spesa_id` (le foto di una spesa sono i
suoi file `spesa` non cestinati). In piu' dell'accordo, perche' servivano: `ore.dal_timer`, `ore.tolta`,
`spese.approvata_da`, `spese.approvata_il`, `spese.dal_rapportino` (la riga del passo 3), `spese.tolta`,
`trasferte.andata_ritorno`, `trasferte.veicolo_id` accanto a `veicolo` (il nome, congelato), `trasferte.approvata_da`,
`approvata_il`, `motivo_rifiuto` (perche' `motivo` e' il motivo della trasferta), `trasferte.tolta`, `timer.fatturabile`,
`veicoli.creato`/`modificato`. Le ore del giorno stanno come `"HH:MM"`; le tabelle da cui si tolgono righe hanno
`AUTOINCREMENT`. Le migrazioni possono avere accanto un file `.js` con lo stesso numero, che gira dopo l'SQL nella stessa
transazione (`db.js`). Nel registro le tabelle nuove si chiamano come qui sopra (piu' `timer`: nuovo, e fermato con la
nota `"fermato: ore N in bozza"`); le righe nate dalla migrazione hanno `utente: "sistema"`, `azione: "migrazione"` e la
nota `"migrazione 003: le spese del rapportino diventano una riga di spese"`. Nel prima/dopo del registro, senza
`costi`, mancano anche `importo` e `costo_orario` (come gli altri campi dei costi).

### 14.17 Decisioni prese dove l'accordo non diceva

- **Mezzanotte**: la fine prima dell'inizio e' del giorno dopo, la riga resta del giorno di inizio; fine uguale
  all'inizio e' un errore (zero o 24 ore non si indovina). Il timer acceso piu' di 24 ore non inventa le ore.
- **Chi approva**: titolare e amministrazione. Il "responsabile della commessa" dell'accordo, se collaboratore, oggi non
  approva (la richiesta di questa fase: il collaboratore non approva e non vede le cose degli altri); si potra' aprire
  dalla fase 6 (Persone).
- **Spese di un rapportino**: seguono la sua approvazione (non si approvano a parte) e, da firmato in poi, non cambiano
  i suoi numeri. Le foto di una spesa stanno nel rapportino solo finche' la spesa va al cliente.
- **"Mia" non si rimborsa**: e' una spesa della persona; si rimborsano solo quelle pagate da lei che vanno al cliente o
  allo studio. `pagataDaMe` di base no (nessun rimborso fantasma dalle righe migrate o dalle app vecchie).
- **Approvazione cambiata dopo**: con `APPROVAZIONE` a `tutti` anche il titolare manda in approvazione e puo' approvare
  le sue cose.
- **Una trasferta con spese** non si toglie finche' ha spese (niente cancellazioni a cascata).
- **Rimborsi della trasferta e veicoli senza `costi`**: si vedono (soldi della persona; l'euro al km e' la tabella ACI
  pubblica e dal rimborso si ricava comunque).
- **Indennita'**: `INDENNITA_TRASFERTA` e' per giorno; la trasferta tiene il totale.
- **Promemoria ACI**: non solo a gennaio ma da gennaio finche' non si aggiorna (se lo si dimentica, resta).
- `EURO_KM` (rapportini) e l'euro al km dei veicoli (trasferte) sono separati dopo la migrazione: cambiare il veicolo non
  cambia quanto si fattura al cliente per i km.
- La Dashboard "ore oltre il budget" e i "giorni senza rapportino" restano come nella fase 1 (contano solo i
  rapportini).

## 15. Fase 4: le risposte, campo per campo

Fatturazione, banche e scadenze (accordo in [`fase4.md`](fase4.md), ricerca in [`ricerca-fase4.md`](ricerca-fase4.md),
migrazione `004-fatture-banche`, server 0.7.0). Valgono le regole comuni della §12.1: `ok`, `permesso:false`, date
`"2026-10-22"`, istanti `"2026-10-22T07:32:11"` (ora italiana, senza fuso), le azioni che scrivono vogliono una POST.
Gli esempi sono le risposte vere del server di prova (`node server/src/avvio.js --prova ...`, 22/10/2026), accorciate
dove un elenco si ripete. Le fatture dei dati di esempio hanno **date fisse** (38/2026, 39/2026, 45/2026: sono storia
fiscale, come i rapportini della fase 1); gli impegni che si ripetono vanno sempre avanti.

### 15.1 Regole comuni della fase 4

- **Moduli.** Tutto quello che riguarda fatture, bozze, XML, note di credito, fatture ricevute, scadenze di pagamento
  delle commesse e riepilogo e' del modulo `fatturazione` (voce 8): leggere 1, scrivere 2. Conti, movimenti, incassi,
  pagamenti, scadenziario, impegni e situazione sono del modulo `banche` (voce 9): leggere 1, scrivere 2.
  `confermaRegoleFiscali` vuole `amministrazione` 2 **e** il ruolo titolare.
- **Il permesso dei soldi.** Tutte le azioni di Fatturazione e di Banche vogliono anche `costi` ≥ 1. Senza:
  `{"ok": false, "errore": "Per vedere le fatture serve anche il permesso dei soldi: chiedi al titolare", "permesso": false}`
  (per le banche: `"Per vedere banche e scadenze serve anche il permesso dei soldi: chiedi al titolare"`). Il menu mostra
  Fatturazione e Banche solo con il modulo ≥ 1 **e** `costi` ≥ 1.
- **Ruoli** (valori iniziali, nessuno nuovo): titolare e amministrazione `fatturazione` 2 e `banche` 2; lettura 1 e 1
  (vede tutto ed esporta, nessun pulsante per scrivere, nessun giallo, l'IBAN coperto); collaboratore 0 e 0 (niente voci
  nel menu, niente voci di soldi nella Dashboard, niente fattura nei rapportini).
- **Campi dei soldi nuovi** (spariscono, chiavi comprese, per chi non ha `costi`, come §12.1): `compenso`,
  `anticipazioni`, `bollo`, `bolloAddebitato`, `ritenuta`, `netto`, `incassato`, `residuo`, `parteSenzaIva`,
  `totaleBozza`, `nettoBozza`, `saldo`, `saldoPrevisto`, `entrate`, `uscite`, `daIncassare`, `daPagare`, `fatturato`,
  `fattureInBozza`, `incassiSettimana`, `pagamentiSettimana`, `saldoConti` e le colonne `base_iva`, `bollo_addebitato`,
  `totale_bozza`, `netto_bozza` (piu' quelli di prima: `totale`, `importo`, `iva`, `contributo`, `baseIva`, `conti`...).
  `scaduto` **no** (vedi §15.20): e' gia' il si'/no dei preventivi, e il "scaduto" in euro sta solo dentro
  `numeri.soldi` e nelle risposte di Fatturazione e Banche, che senza `costi` non arrivano proprio. Nel riepilogo
  delle spese (fase 3) `anticipazioni` resta un soldo della persona e si vede anche senza `costi`.
- **Le parole fisse** sono quelle di fase4.md §13; il server le manda gia' pronte dove servono (`statoVisto`,
  `etichetta`, `avvisi`, `titolo` e `dettaglio` dello scadenziario e della Dashboard).
- **Mai un numero fiscale inventato.** Una bozza ha `numero: ""` e `riferimento: "W-15"` (il riferimento di Wisper,
  `'W-' || id`, lo scrive il database). Il numero arriva dall'XML emesso o lo scrive Manuel (`segnaEmessa`).
- **Non collegato.** Invio allo SDI, collegamento alla banca e import degli estratti conto non ci sono: le risposte
  lo dicono con `"collegamento": "non_collegato"` (`conti`, `situazione`) e `"importaEstrattoConto": "non_collegato"`
  (`movimenti`). Nessuna azione finge di farli.
- `io` e `/salute` dicono `versioneServer`/`versione` `"0.7.0"`.

### 15.2 Impostazioni, clienti e commesse

`anagrafiche.impostazioni` ha in piu' (si salvano con `salvaImpostazioni`, valore in JSON): `REGIME_FISCALE` (`"RF01"`),
`TIPO_DOCUMENTO` (`"TD01"`), `RITENUTA_TIPO` (`"RT01"`), `RITENUTA_CAUSALE` (`"A"`), `EPPI_TIPO_CASSA` (`"TC17"`),
`BOLLO_SOGLIA` (`77.47`), `BOLLO_IMPORTO` (`2`), `BOLLO_RIVALSA` (`true`), `GIORNI_PAGAMENTO` (`30`),
`PAGAMENTO_FINE_MESE` (`false`), `MODALITA_PAGAMENTO` (`"MP05"`), `PASSAGGIO_USCITE` (`["prospetto","xml"]`),
`SOGLIA_CASSA` (`3000`), `REGOLE_FISCALI_CONFERMATE` (`null`, oppure `{"data": "2026-11-05", "commercialista": "Studio
di esempio", "da": 1}`), e i dati dello studio `CODICE_FISCALE`, `STUDIO_CAP`, `STUDIO_COMUNE`, `STUDIO_PROVINCIA`,
`ALBO`, `ALBO_PROVINCIA`, `ALBO_NUMERO`, `ALBO_DATA` (sempre testo). `INDIRIZZO` resta via e numero: un indirizzo
scritto tutto insieme ("Via dell'Esempio 1, 36016 Thiene (VI)") nel modello della fattura si taglia al CAP.

- **Cambiare una regola fiscale toglie la conferma**: un `salvaImpostazioni` che cambia davvero il valore di
  `REGIME_FISCALE`, `TIPO_DOCUMENTO`, `RITENUTA_TIPO`, `RITENUTA_CAUSALE`, `EPPI_TIPO_CASSA`, `BOLLO_SOGLIA`,
  `BOLLO_IMPORTO`, `BOLLO_RIVALSA`, `GIORNI_PAGAMENTO`, `PAGAMENTO_FINE_MESE`, `MODALITA_PAGAMENTO`, `IVA`,
  `EPPI_INTEGRATIVO` o `RITENUTA` rimette `REGOLE_FISCALI_CONFERMATE` a `null`, con la nota nel registro
  `"regole cambiate: la conferma del commercialista non vale più"`. Risalvare lo stesso valore no. `SOGLIA_CASSA` e
  `PASSAGGIO_USCITE` non sono regole fiscali. `REGOLE_FISCALI_CONFERMATE` non si scrive con `salvaImpostazioni`
  (`"La conferma delle regole fiscali si segna con "Segna confermate": la segna solo il titolare"`).
- `confermaRegoleFiscali {data, commercialista}` (amministrazione 2, **solo il titolare**; gli altri `permesso:false`)
  → `{"ok": true, "regoleConfermate": {"data": "2026-11-05", "commercialista": "Studio di esempio", "da": 1},
  "impostazioni": {...}}`; registro `"regole confermate dal commercialista il 05/11/2026"`. `{data: null}` la toglie
  (`"regoleConfermate": null`). Errore: `"Commercialista: scrivi chi ha controllato le regole"`.

Un **cliente** (e un fornitore) ha in piu' (`salvaSoggetto`, `aggiornaCliente`; in `anagrafiche`):
`"sostitutoImposta": null` (automatico: si' con la partita IVA, no senza; `true`/`false` scritto a mano, per esempio
`true` per un condominio, `false` per un forfettario; si manda `null` o `"automatico"` per tornare all'automatico),
`"pagamentoGiorni": null` (da 0 a 365; `null` = `GIORNI_PAGAMENTO`; errore `"Giorni di pagamento: da 0 a 365"`),
`"pagamentoFineMese": null` (`true`/`false`; `null` = `PAGAMENTO_FINE_MESE`).

Una **commessa** ha in piu' `"modoFatturazione": "ore"` | `"corpo"` | `"misto"` (`creaCommessa`, `aggiornaCommessa`
`{campi: {modoFatturazione}}`; errore `"Come si fattura: ore, corpo o misto"`). `creaCommessaDaPreventivo` la crea
`corpo`. La migrazione ha messo `corpo` alle commesse che avevano scadenze di pagamento. A **corpo**: si fatturano solo
le scadenze di pagamento del contratto (rapportini e ore sono dentro il prezzo, non compaiono in Da fatturare); a
**ore**: rapportini, ore e spese; **misto**: tutto (il contratto e le ore in piu').

Un **rapportino** ha in piu', solo per chi vede le fatture (`fatturazione` ≥ 1 e `costi`), `"fattura": null` oppure
`{"id": 15, "riferimento": "W-15", "stato": "bozza", "etichetta": "In bozza W-15"}` (emessa: `"etichetta": "Fattura
45/2026"`): e' la pillola con il collegamento. Per gli altri la chiave non c'e'.

### 15.3 Da fatturare

`daFatturare {idCliente?, idCommessa?}` (fatturazione 1):
```json
{"ok": true, "oggi": "2026-10-22", "totale": 2671.88, "clienti": 2,
 "gruppi": [
  {"idCliente": "C002", "cliente": "Rossi Impianti Srl", "sostituto": true, "mancano": [], "totale": 724.6, "voci": [
   {"tipo": "spesa", "id": 6, "idCommessa": "26ST002", "data": "2026-10-20", "titolo": "Diritti di segreteria del Comune",
    "dettaglio": "26ST002 · ricevuta intestata al cliente", "pronta": true, "importo": 52, "anticipazione": true, "gruppo": "commessa:26ST002"},
   {"tipo": "rapportino", "id": "RAP/2026/0013", "idCommessa": "26ST002", "data": "2026-10-21", "titolo": "Collaudo quadro",
    "dettaglio": "26ST002 · 6,5 ore · 48 km", "pronta": true, "importo": 316.2, "spese": [16, 17], "totaleConSpese": 324.6,
    "anticipazione": false, "gruppo": "rapportini:C002:2026-10"},
   {"tipo": "spesa", "id": 16, "idCommessa": "26ST002", "data": "2026-10-21", "titolo": "Pedaggio", "dettaglio": "26ST002 · altro",
    "idRapportino": "RAP/2026/0013", "pronta": true, "importo": 8.4, "anticipazione": false, "gruppo": "rapportini:C002:2026-10"},
   {"tipo": "spesa", "id": 17, "titolo": "Corriere per i documenti", "dettaglio": "26ST002 · ricevuta intestata al cliente",
    "idRapportino": "RAP/2026/0013", "importo": 12, "anticipazione": true, "...": "..."},
   {"tipo": "ore", "id": 10, "idCommessa": "26ST002", "data": "2026-10-19", "titolo": "Verifica impianto di terra",
    "dettaglio": "26ST002 · 3 ore × 42,00 €", "pronta": true, "importo": 126, "senzaPrezzo": false, "anticipazione": false,
    "gruppo": "ore:26ST002:2026-10"}]},
  {"idCliente": "C001", "cliente": "Elettrodinamica", "sostituto": true, "mancano": [], "totale": 1947.28, "voci": [
   {"tipo": "rapportino", "id": "RAP/2026/0007", "idCommessa": "", "data": "2026-09-03", "titolo": "Rilievo quadri del magazzino",
    "dettaglio": "6 ore · 52 km", "pronta": true, "importo": 219.52, "spese": [14], "totaleConSpese": 227.92,
    "anticipazione": false, "gruppo": "rapportini:C001:2026-09"},
   "..."]}],
 "piuAvanti": [{"tipo": "scadenza", "id": 9, "idCommessa": "26ST003", "data": "", "titolo": "Saldo a fine lavori",
   "dettaglio": "26ST003 · Adeguamento impianto elettrico capannone · PR/2026/012 rev. 1", "quando": "fine", "pronta": false,
   "importo": 1140, "anticipazione": false, "gruppo": "commessa:26ST003", "idCliente": "C002", "cliente": "Rossi Impianti Srl"}],
 "inBozza": [{"idFattura": 14, "riferimento": "W-14", "idCliente": "C003", "cliente": "Mario Bianchi", "stato": "pronta", "voci": 0, "totale": 320.25},
   {"idFattura": 15, "riferimento": "W-15", "idCliente": "C002", "cliente": "Rossi Impianti Srl", "stato": "bozza", "voci": 2, "totale": 2069.12}],
 "riepiloghi": [{"idCliente": "C001", "mese": "2026-09", "rapportini": 6, "inviatoIl": "2026-09-30T18:05:00"}],
 "raggruppa": {"C001": "mese", "C002": "rapportino"},
 "daFirmare": [{"id": "RAP/2026/0003", "idCliente": "C001", "cliente": "Elettrodinamica", "idCommessa": "26ST001",
   "data": "2026-10-08", "descrizione": "Collaudo sensori e messa in servizio nastro", "ore": 9}]}
```
- **Le sorgenti** (fase4.md §5.1): scadenze di pagamento `prevista` di una commessa non archiviata; rapportini
  `FIRMATO`/`INVIATO` con `statoApprovazione` vuoto o `approvato`, di una commessa `ore`/`misto` (o senza commessa);
  spese al cliente `approvata`, non fatturate, con un cliente (della spesa, della commessa o del rapportino); ore
  `fatturabile`, `approvata`, non fatturate, di una commessa `ore`/`misto`. Le riservate (in una bozza o pronta) e le
  fatturate non ci sono.
- **Le spese di un rapportino vanno con lui**: compaiono subito dopo di lui (con `idRapportino`), e `preparaFattura`
  le prende anche se non mandate (e scegliere una sua spesa porta il rapportino). Se il rapportino e' di una commessa a
  corpo, le sue spese compaiono da sole. Si fattura solo una spesa di un rapportino firmato o inviato.
- `importo` di un rapportino = compenso ore + rimborso km (+ le spese vecchie senza righe, §5.1); `totaleConSpese` =
  importo + le sue spese **non anticipate** (= la riga del rapportino in "una riga per rapportino"). `totale` di un
  gruppo = la somma delle voci `pronta` (ogni spesa e' una voce sua: non si conta due volte).
- `quando` e `pronta` delle scadenze: `firma` e `avanzamento` pronte; `fine` pronta se la commessa e' CHIUSA;
  `data` pronta entro 15 giorni. Le non pronte stanno in `piuAvanti` (si possono fatturare lo stesso).
- `gruppo` qui e' **il gruppo della vista** (per aprire e chiudere): `commessa:26ST003`, `rapportini:C001:2026-09`,
  `ore:26ST002:2026-10`, `spese:C002` (spese senza commessa). I gruppi delle **righe della bozza** sono altri (§15.5).
- `mancano` del cliente = quello che servira' al passaggio (§15.6), per saperlo prima. `sostituto` = ritenuta si'/no.
- `riepiloghi`: per cliente e mese, i rapportini pronti **tutti gia' mandati** (riepilogo inviato) e quando.
- `raggruppa`: come si raggruppano i rapportini di ogni cliente in `preparaFattura` (di base `mese` per i clienti a
  tariffa fissa, `rapportino` per gli altri).
- `daFirmare`: i rapportini in BOZZA (in fondo alla pagina, "Non si fatturano finché non sono firmati").
- `clienti` = quanti clienti hanno qualcosa di pronto (il numerino giallo del menu).

### 15.4 Una fattura

`fattura {id}` (fatturazione 1; `id` interno, `"W-15"`, il numero `"45/2026"`, oppure `{numero, anno}` mandati come
`numero` e `anno` senza `id`) → `{"ok": true, "fattura": {...}}`. La bozza W-15 dei dati di esempio, vera:
```json
{"id": 15, "riferimento": "W-15", "etichetta": "Bozza W-15", "tipo": "fattura", "tipoDocumento": "TD01", "idCliente": "C002",
 "cliente": "Rossi Impianti Srl", "idCommessa": "26ST003", "idFatturaCollegata": null, "stato": "bozza", "statoVisto": "Bozza",
 "pagamento": "da_incassare", "scaduta": false, "giorniScaduta": 0, "data": "2026-10-22", "numero": "", "numeroDa": "",
 "causale": "40% a fine progetto, commessa 26ST003", "noteInterne": "", "regime": "ordinario", "ivaPercentuale": 22,
 "eppiPercentuale": 5, "ritenutaPercentuale": 20, "ritenuta": true, "bolloRivalsa": true,
 "conti": {"righe": [1520, 120], "compenso": 1520, "contributo": 76, "baseIva": 1596, "iva": 351.12, "anticipazioni": 120,
   "bollo": 2, "bolloAddebitato": 2, "totale": 2069.12, "ritenuta": 304, "netto": 1765.12, "parteSenzaIva": 120},
 "totaleBozza": null, "nettoBozza": null,
 "scadenze": [{"id": 8, "data": "2026-11-21", "importo": 1765.12, "modalita": "MP05", "coperta": 0}],
 "scadenzaAMano": false, "idConto": 1, "conto": "Conto studio …3456", "incassato": 0, "residuo": 1765.12, "daEmettereEntro": "",
 "esitoSdi": "", "prontaIl": "", "emessaIl": "", "avvisoInviatoIl": "", "regoleConfermate": false,
 "creato": "2026-10-22T07:32:11", "modificato": "2026-10-22T07:32:11",
 "righe": [
  {"id": 12, "ordine": 1, "origine": "bozza", "gruppo": "scadenza:8", "tipo": "compenso",
   "descrizione": "40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)",
   "quantita": 1, "unita": "", "prezzo": 1520, "importo": 1520, "aliquotaIva": 22, "natura": "", "ritenuta": true,
   "tributoCliente": false, "idCommessa": "26ST003", "periodoDa": "", "periodoA": "", "importoSorgenti": 1520},
  {"id": 13, "ordine": 2, "origine": "bozza", "gruppo": "spesa:13", "tipo": "anticipazione",
   "descrizione": "Spesa anticipata per conto del cliente: Pratica di connessione al distributore del 14/10/2026",
   "quantita": 1, "unita": "", "prezzo": 120, "importo": 120, "aliquotaIva": 0, "natura": "N1", "ritenuta": false, "...": "..."},
  {"id": 14, "ordine": 3, "origine": "bozza", "gruppo": "", "tipo": "bollo", "descrizione": "Imposta di bollo", "quantita": 1,
   "unita": "", "prezzo": 2, "importo": 2, "aliquotaIva": 0, "natura": "N1", "importoSorgenti": null, "...": "..."}],
 "sorgenti": [
  {"tipo": "scadenza", "id": "8", "gruppo": "scadenza:8", "descrizione": "40% a fine progetto · 26ST003", "importo": 1520,
   "attiva": true, "liberataIl": "", "liberataPerche": ""},
  {"tipo": "spesa", "id": "13", "gruppo": "spesa:13", "descrizione": "Pratica di connessione al distributore · 14/10", "importo": 120, "attiva": true, "...": "..."}],
 "incassi": [], "note": [], "fatturaCollegata": null, "file": null, "nomeFileSdi": "", "esitoIl": "", "motivo": "",
 "scartataIl": "", "annullataIl": "", "puoScrivere": true, "modificabile": true, "mancano": [], "avvisi": []}
```
- `stato` (salvato): `bozza` | `pronta` | `emessa` | `scartata` | `annullata`. **`statoVisto`** (la parola da
  mostrare): `Bozza`, `Pronta` (con incassi che la coprono: `Pronta · già pagata`), `Emessa`, `Pagata in parte`,
  `Pagata`, `Scaduta`, `Annullata`, `Scartata`; una nota di credito emessa: `Nota di credito`. Colori di §13.
- `etichetta`: `"Bozza W-15"`, `"Pronta W-15"`, `"Scartata W-15"`, `"45/2026"` (emessa o annullata), `"Nota di
  credito 3/2026"`. `tipo`: `fattura` | `nota`. `tipoDocumento`: `TD01`/`TD06` (`TD04` per le note); dopo
  l'emissione quello dell'XML. `numeroDa`: `""` | `"xml"` | `"mano"`.
- **I conti** sono quelli salvati (bozza: rifatti a ogni salvataggio da `contiFattura`, §15.18; emessa: quelli
  dell'XML). `conti.righe` = gli importi delle righe **senza** quella del bollo. Le righe sono quelle che contano:
  dell'XML se c'e' (`origine: "xml"`), se no della bozza. La riga `tipo: "bollo"` la mette e la toglie il server.
- **Pagamento** (calcolato, mai salvato, fase4.md §7.1): `incassato` = somma degli abbinamenti dei movimenti non
  annullati; `residuo` = netto − netto delle note di credito emesse collegate − incassato (mai sotto zero);
  `pagamento`: `pagata` (residuo ≤ 0) | `in_parte` | `da_incassare` (`""` per le note); `scaduta` = emessa con residuo e
  la prima rata non coperta prima di oggi (le rate si coprono in ordine di data: `scadenze[].coperta` = quanto di
  quella rata e' coperto); `giorniScaduta`. Su una bozza o pronta con incassi (avviso di parcella) il residuo si conta
  sul netto della bozza; quando e' coperta `daEmettereEntro` = giorno dell'incasso che l'ha coperta + 12.
- Un incasso: `{"idMovimento": 5, "data": "2026-10-12", "importo": 500, "conto": "Conto studio …3456", "verificato": false}`.
  Una nota collegata: `{"id": 18, "numero": "3/2026", "data": "2026-10-23", "totale": 256.2, "netto": 216.2, "stato": "emessa"}`.
  `fatturaCollegata` (per una nota): `{"id": 13, "numero": "45/2026", "data": "2026-10-19", "totale": 1460.34}`, se no `null`.
  `file` (l'XML o il .p7m emesso): `{"id": "PbjKXKRrJ_asPjy68Q7EWxDgJ3s-", "url": "/file/PbjKXKRrJ_asPjy68Q7EWxDgJ3s-",
  "nome": "IT00000000000_00039.xml"}` (si scarica con `GET /file/<id>`: chi vede le fatture col permesso dei soldi).
- `righe[].gruppo`: le righe nate insieme dalle stesse sorgenti (`scadenza:8`, `spesa:31`, `rapportini:C001:2026-09`
  per il mese, `rapportino:RAP/2026/0142` per una riga per rapportino, `ore:26ST045:2026-10:42`); `""` = riga libera.
  `importoSorgenti` = quanto valeva la riga quando e' nata (la pagina mostra "era 317,88" se l'importo e' cambiato).
  `ritenuta` della riga = soggetta e cliente sostituto.
- `sorgenti`: tutte, anche le liberate (`attiva: false` con `liberataIl` e `liberataPerche`: `"tolta dalla bozza"`,
  `"bozza scartata"`, `"nota di credito 3/2026"`, `"non è nella fattura 49/2026"`).
- `regoleConfermate`: per una bozza, le regole di adesso; dopo il passaggio, quelle valide quando e' passata.
- `modificabile`: solo una bozza, per chi scrive. `mancano`: §15.6 (vuoto per un'emessa).
- `avvisi`: le righe gialle e rosse gia' scritte, `{tipo, testo}`: `emetti` ("Va emessa entro domenica 1 novembre: ha
  pagato il 20/10"), `scarto` ("Lo SDI l'ha scartata il 23/10: correggila nel programma e importa di nuovo l'XML"),
  `diversa` ("L'XML emesso è diverso dalla bozza: era 2.069,12 €, è 1.947,12 €").

`fatture {stato?, pagamento?, scadute?, tipo?, idCliente?, idCommessa?, testo?, anno?}` (fatturazione 1) →
`{"ok": true, "oggi": "...", "fatture": [...]}`: ogni voce come la fattura **senza** `righe`, `sorgenti`, `incassi`,
`note`, `file`... (le chiavi fino a `modificato`). Bozze e pronte in cima, poi le piu' recenti. `stato`: uno dei cinque
o `da_emettere` (bozze e pronte); senza, tutte **tranne le scartate**. `pagamento`: `pagata` | `in_parte` |
`da_incassare` (esatti) oppure `aperta` (emesse con residuo: la pillola "Da incassare"). `scadute: true`. `tipo`:
`fattura` | `nota`. `testo` cerca in numero, riferimento, cliente, causale. `idCommessa` trova anche le fatture con
righe di quella commessa.

### 15.5 La bozza

`preparaFattura {idCliente, voci: [{tipo, id}], raggruppa?: "mese"|"rapportino", data?}` (fatturazione 2) →
`{"ok": true, "fattura": {...§15.4}}`. Le righe di fase4.md §5.2 coi testi dell'accordo, i gruppi di §5.3, i
parametri fiscali **congelati** (regime, IVA, EPPI, ritenuta e se il cliente e' sostituto, bollo, giorni di
pagamento del cliente o delle impostazioni, fine mese, modalita', conto predefinito), la causale proposta (`"40% a fine
progetto, commessa 26ST003"`, `"Prestazioni di settembre 2026"`, `"Rapportino RAP/2026/0142"`, se no `"Prestazioni
professionali"`), la scadenza calcolata. Le sorgenti diventano riservate. Settembre di Elettrodinamica (vero):
`"righe"` = le tre del raggruppamento A con `"gruppo": "rapportini:C001:2026-09"`, `"conti"` = il caso 5, 8 sorgenti.
Errori: `"Scegli almeno una cosa da fatturare"`, `"Una fattura è per un cliente solo"`, `"Cliente C009 non trovato"`,
`"Raggruppa: mese o rapportino"`, `"Il rapportino RAP/2026/0099 non è più da fatturare"` (o la spesa, la scadenza, le
ore: cambiata nel frattempo), e **quella di §4.4** quando la sorgente e' gia' in un'altra fattura viva (vera):
`{"ok": false, "errore": "«40% a fine progetto» di 26ST003 è già nella bozza W-15 per Rossi Impianti Srl"}`
(`"RAP/2026/0007 è già nella bozza W-16 per Elettrodinamica"`, `"La spesa «Pedaggio» del 03/09 è già..."`, `"Le ore del
21/10 su 26ST002 sono già..."`; pronta: `"...è già nella fattura W-15 (già passata al programma) per..."`; emessa:
`"...è già nella fattura 45/2026"`).

`nuovaFattura {idCliente}` (fatturazione 2) → una bozza vuota (righe libere), `causale` `"Prestazioni professionali"`.

`salvaFattura {fattura: {id, data?, scadenza?, giorniPagamento?, fineMese?, idConto?, causale?, noteInterne?,
ritenuta?, tipoDocumento?, righe?: [{id?, tipo, descrizione, quantita?, unita?, prezzo?, tributoCliente?}]}}`
(fatturazione 2), solo in bozza → `{"ok": true, "fattura": {...}, "liberate": [{tipo, id, descrizione}]}`.
- `righe`, se c'e', e' **l'elenco intero nell'ordine voluto**: quelle senza `id` si creano (libere, gruppo `""`),
  quelle che mancano si tolgono. **Se manca anche solo una riga di un gruppo, si toglie tutto il gruppo** e le sue
  sorgenti tornano da fatturare (`liberate`, vero: 6 rapportini e 2 spese di settembre). La riga del bollo si ignora
  (la rifa' il server). Di una riga di un gruppo si cambiano descrizione, quantita' e prezzo; il tipo resta.
- L'importo di una riga = quantita' × prezzo (quantita' mancante = 1); una riga di un gruppo che non cambia quantita'
  e prezzo tiene la somma delle sue sorgenti.
- `scadenza` scritta a mano resta anche cambiando la data (`scadenzaAMano: true`); `scadenza: null` la fa tornare
  calcolata (data + giorni, poi a fine mese se `fineMese`). `tipoDocumento`: `TD01` o `TD06` (una nota: `TD04`).
- Errori: `"La fattura W-15 è già stata passata al programma: per cambiarla falla tornare in bozza"`, `"La fattura 45/2026
  non è una bozza: non si cambia"`, `"Riga: scrivi la descrizione"`, `"Quantità: non può essere negativa"`, `"Prezzo: non
  può essere negativo"`, `"Riga: compenso o anticipazione"`, `"Giorni di pagamento: da 0 a 365"`, `"Conto 9 non trovato"`,
  `"Tipo di documento: TD01 o TD06"`.

`scartaFattura {id, motivo?, conferma?}` (fatturazione 2): da bozza o pronta → `scartata`, le sorgenti tornano libere
(`"bozza scartata"`). Una pronta chiede prima `{"ok": false, "errore": "La W-15 è già nel programma: scartala solo se lì
non l'hai emessa", "serveConferma": true}`. Un'emessa: `"La fattura 45/2026 è già emessa: per annullarla serve una nota
di credito"`. Ripetuta su una scartata: ok.

### 15.6 Il passaggio al programma

**Cosa manca** (`mancano: [{campo, testo}]`, in fattura, pacchetto e nei gruppi di Da fatturare), nell'ordine:
`cliente` "La partita IVA o il codice fiscale del cliente" · `indirizzo` "L'indirizzo del cliente: via, CAP, città e
provincia" · `destinatario` "Il codice destinatario o la PEC del cliente" (solo con partita IVA) · `studio` "I dati dello
studio per la fattura: scrivili in Amministrazione › Dati dello studio" · `iban` "L'IBAN del conto su cui farti pagare:
scrivilo in Banche e scadenze › Conti" (con MP05) · `righe` "Almeno una riga" · `prezzi` "1 riga senza prezzo" / "{n}
righe senza prezzo" · `totale` "Il totale è zero" · `pa` "Fatture alla pubblica amministrazione: Wisper non le prepara
ancora" (codice destinatario di 6 caratteri).

`passaAlProgramma {id, conferma?}` (fatturazione 2) → `{"ok": true, "fattura": {...}, "pacchetto": {...§ sotto}}`:
da bozza a `pronta` (`prontaIl`, nota `"passata al programma"`). Con qualcosa in `mancano` non si passa, niente
conferma (vera): `{"ok": false, "errore": "Prima di passarla al programma manca: 1 riga senza prezzo; il totale è zero",
"mancano": [...]}`. Regole non confermate (vera): `{"ok": false, "errore": "Le regole delle fatture non sono ancora
confermate dal commercialista: passala lo stesso?", "serveConferma": true}`; con `conferma: true` passa e la fattura
tiene `regoleConfermate: false`. Una pronta ripetuta (la coda del telefono) risponde ok senza cambiare niente.

`pacchetto {id}` (fatturazione 1; anche per una bozza, anteprima, o un'emessa, rivedere) →
`{"ok": true, "uscite": ["prospetto", "xml"], "modello": {...}, "mancano": [], "prospetto": {...}, "xml": {...}}`.
`uscite` = le uscite accese (`PASSAGGIO_USCITE`): c'e' una chiave per ognuna, e le app mostrano un pulsante per
ognuna. Per un'emessa niente `xml` (c'e' quello vero).
- **Il modello** (fase4.md §8.1), vero per la W-15:
```json
{"riferimento": "W-15", "tipoDocumento": "TD01", "divisa": "EUR", "dataProposta": "2026-10-22", "data": "", "numero": "",
 "prestatore": {"denominazione": "Studio Tecnico GM", "partitaIva": "00000000000", "codiceFiscale": "00000000000", "regimeFiscale": "RF01",
   "albo": {"nome": "Periti industriali", "provincia": "VI", "numero": "000", "data": ""},
   "sede": {"indirizzo": "Via dell'Esempio 1", "cap": "36016", "comune": "Thiene", "provincia": "VI", "nazione": "IT"},
   "pec": "", "email": "studio@example.com"},
 "committente": {"denominazione": "Rossi Impianti Srl", "nome": "", "cognome": "", "partitaIva": "04455667784", "codiceFiscale": "",
   "sede": {"indirizzo": "Via Nuova 3", "cap": "36061", "comune": "Bassano del Grappa", "provincia": "VI", "nazione": "IT"},
   "codiceDestinatario": "0000000", "pec": "rossiimpianti@pec.esempio.it"},
 "righe": [{"numero": 1, "descrizione": "40% a fine progetto: ...", "quantita": 1, "unitaMisura": "", "prezzoUnitario": 1520,
   "prezzoTotale": 1520, "aliquotaIva": 22, "natura": "", "ritenuta": true, "periodoDa": "", "periodoA": ""}, "..."],
 "cassa": {"tipo": "TC17", "aliquota": 5, "imponibile": 1520, "importo": 76, "aliquotaIva": 22, "natura": "", "ritenuta": false},
 "ritenuta": {"tipo": "RT01", "aliquota": 20, "importo": 304, "causale": "A"},
 "bollo": {"virtuale": true, "importo": 2},
 "riepilogo": [{"aliquotaIva": 22, "natura": "", "imponibile": 1596, "imposta": 351.12, "esigibilita": "I", "riferimentoNormativo": ""},
   {"aliquotaIva": 0, "natura": "N1", "imponibile": 122, "imposta": 0, "esigibilita": "", "riferimentoNormativo": "Escluse ex art. 15 DPR 633/72"}],
 "totaleDocumento": 2069.12, "nettoAPagare": 1765.12,
 "pagamento": {"condizioni": "TP02", "dettagli": [{"modalita": "MP05", "scadenza": "2026-11-21", "importo": 1765.12,
   "iban": "IT60X0542811101000000123456", "istituto": "Banca di esempio"}]},
 "causale": ["40% a fine progetto, commessa 26ST003. Rif. Wisper W-15"], "fattureCollegate": [], "regoleConfermate": false}
```
  `data` e `numero` ci sono solo per un'emessa. Un privato (senza partita IVA): `denominazione` vuota, `nome` e
  `cognome` dal nome (l'ultima parola e' il cognome), `codiceDestinatario` `"0000000"`. Con il codice SDI: quello; con
  la sola PEC: `"0000000"` + `pec`. Forfettario: `N2.2` per compenso e contributo, `"Operazione in franchigia da IVA
  (regime forfettario)"`. Piu' rate: `"condizioni": "TP01"`. Una nota: `"fattureCollegate": [{"idDocumento": "52/2026",
  "data": "2026-10-23"}]`. **L'IBAN** e' intero solo per chi scrive le fatture (`fatturazione` 2); per gli altri
  `"IT…3456"` nel modello e nel prospetto, e nell'XML niente IBAN.
- **Il prospetto** `{"titolo": "Prospetto per il programma delle fatture", "avviso": "Conti da verificare: regole non
  confermate dal commercialista", "sezioni": [{"titolo": "Cliente", "campi": [{"etichetta": "Denominazione", "valore":
  "Rossi Impianti Srl"}, {"etichetta": "Partita IVA", "valore": "04455667784"}, ...]}, {"titolo": "Documento", "campi":
  [{"etichetta": "Tipo", "valore": "Fattura (TD01)"}, {"etichetta": "Data proposta", "valore": "22/10/2026"},
  {"etichetta": "Numero", "valore": "lo dà il programma"}, {"etichetta": "Causale", "valore": "40% a fine progetto,
  commessa 26ST003. Rif. Wisper W-15"}]}, ...], "testo": "Conti da verificare: ...\n\nRif. W-15\n\nCLIENTE\nDenominazione:
  Rossi Impianti Srl\n..."}`. Sezioni nell'ordine: Cliente, Documento, Righe, Cassa previdenziale (se c'e'), Ritenuta,
  Bollo, Riepilogo IVA, Totali, Pagamento. I campi vuoti non ci sono. Le righe: `"Riga 1 · Descrizione"`, `"Riga 1 ·
  Quantità"`, `"Riga 1 · Unità di misura"` (se c'e'), `"Riga 1 · Prezzo"`, `"Riga 1 · Totale"`, `"Riga 1 · IVA"` (`"22%"` o
  `"Senza IVA (N1, art. 15)"`), `"Riga 1 · Ritenuta"` (`"sì"`/`"no"`). Senza ritenuta: `{"etichetta": "Ritenuta", "valore":
  "no, è un privato"}` (o `"no"`); senza bollo: `"Bollo": "no"`. Una nota: `"Totale della nota"`, `"Netto stornato"`,
  `"Fattura collegata": "52/2026 del 23/10/2026"`. Importi all'italiana (`"1.520,00"`). `avviso` vuoto con le regole
  confermate. Il PDF lo fanno le app (`prospettoFattura(modello)`), con i piedi di pagina di fase4.md §8.3.
- **L'XML da completare** `{"nome": "Bozza W-15 Rossi Impianti Srl - non inviare.xml", "mime": "application/xml",
  "base64": "..."}`: FatturaPA FPR12 1.2.3 (`server/src/fatturapa.js`, `scriviFatturaPA`), `Numero` = `BOZZA`,
  `ProgressivoInvio` = `W15`, `IdTrasmittente` = IT + partita IVA dello studio, `Causale` del modello piu' (regole non
  confermate) `"Conti da verificare: regole non confermate dal commercialista"`, `AltriDatiGestionali` sulla riga 1
  (`TipoDato` `RIFWISPER`, `RiferimentoTesto` `W-15`: anche cosi' il ritorno si abbina da solo). Solo caratteri Latin-1
  (lo vuole lo schema: `€` diventa `EUR`), lunghezze dello schema. Mai il nome `IT..._....xml` dei file da trasmettere.

`tornaInBozza {id}` (fatturazione 2): da pronta a bozza (nota `"tornata in bozza"`), solo senza XML abbinato (`"La
W-15 ha già un XML abbinato: non torna in bozza"`); un'emessa: `"La fattura 45/2026 non è pronta: torna in bozza solo una
fattura passata al programma e non ancora emessa"`.

`segnaEmessa {id, numero, data?, conferma?}` (fatturazione 2): da bozza o pronta, senza XML. Prima risposta (vera):
`{"ok": false, "errore": "Il numero lo scrivi tu: deve essere quello che ha dato il tuo programma. Gli importi restano
quelli della bozza finché non importi l'XML", "serveConferma": true}`; con `conferma: true` diventa `emessa` con
`numeroDa: "mano"`, la chiave contro i doppioni e gli effetti di §15.10. Errori: `"Numero: scrivi il numero che ha dato
il programma"`, `"C'è già la fattura 45/2026"` (o `"...la nota di credito 3/2026"`).

`inviaAvviso {id, a, cc?, oggetto?, messaggio?, allegati: [{nome, mime, base64}]}` (fatturazione 2, solo POST, come
`inviaEmail` col PDF dell'avviso fatto dall'app) → `{"ok": true, "fattura": {...}}` con `avvisoInviatoIl`; non cambia
lo stato. Solo da bozza o pronta: `"L'avviso di parcella si manda prima di emettere la fattura"`; `"Manca l'indirizzo del
cliente"`; postino come `inviaEmail` (`rete: true` se non risponde).

### 15.7 Il ritorno dell'XML

`leggiXml {file: [{nome, base64}]}` (fatturazione 2, solo POST) **non cambia niente**: legge, propone e tiene i file
un'ora (`letture_xml`, cartella `<dati>/letture/`). Vero, lo zip di ottobre dei file d'esempio:
```json
{"ok": true, "idLettura": "4oJhyBms8lf-02DlMDdkHE", "scade": "2026-10-22T08:32:34",
 "documenti": [
  {"chiave": "f1.1#1", "nomeFile": "IT00000000000_00046.xml.p7m", "tipo": "emessa", "tipoDocumento": "TD01", "numero": "46/2026",
   "data": "2026-10-22", "controparte": {"nome": "Mario Bianchi", "partitaIva": "", "codiceFiscale": "BNCMRA70C12L840K", "idSoggetto": "C003"},
   "conti": {"compenso": 250, "contributo": 12.5, "iva": 57.75, "anticipazioni": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 320.25,
     "ritenuta": 0, "netto": 320.25},
   "scadenze": [{"data": "2026-11-21", "importo": 320.25}], "righe": [{"descrizione": "Sopralluogo e rilievo: Impianto fotovoltaico", "importo": 250, "natura": ""}],
   "proposta": {"azione": "abbina", "certezza": "certa", "idFattura": 14, "riferimento": "W-14", "alternative": [], "differenze": [],
     "righeMancanti": [], "collegabili": [], "libera": []},
   "avvisi": []},
  {"chiave": "f1.2#1", "nomeFile": "IT00000000000_00047.xml", "tipo": "emessa", "numero": "47/2026", "data": "2026-10-21",
   "controparte": {"nome": "Elettrodinamica", "partitaIva": "02468135799", "codiceFiscale": "", "idSoggetto": "C001"},
   "conti": {"compenso": 1393.92, "totale": 1785.62, "ritenuta": 278.78, "netto": 1506.84, "...": "..."},
   "proposta": {"azione": "senzaBozza", "certezza": "nessuna", "idFattura": null, "riferimento": "", "alternative": [], "differenze": [],
     "righeMancanti": [], "libera": [], "collegabili": [
      {"gruppo": "rapportini:C001:2026-10", "titolo": "Ottobre 2026 · 1 rapportino", "importo": 357.46,
       "voci": [{"tipo": "rapportino", "id": "RAP/2026/0002"}, {"tipo": "spesa", "id": "1"}], "spuntato": false},
      {"gruppo": "rapportini:C001:2026-09", "titolo": "Settembre 2026 · 6 rapportini", "importo": 1393.92,
       "voci": [{"tipo": "rapportino", "id": "RAP/2026/0007"}, "...", {"tipo": "spesa", "id": "15"}], "spuntato": true}]},
   "avvisi": []},
  {"chiave": "f1.3#1", "nomeFile": "IT09988776655_0A1B2.xml.p7m", "tipo": "ricevuta", "tipoDocumento": "TD01", "numero": "1301",
   "data": "2026-10-20", "controparte": {"nome": "Comel Forniture Elettriche", "partitaIva": "09988776655", "codiceFiscale": "09988776655", "idSoggetto": null},
   "conti": {"totale": 117.58, "imponibile": 96.38, "iva": 21.2, "contributo": 0, "bollo": 0, "ritenuta": 0, "netto": 117.58},
   "scadenze": [{"data": "2026-11-21", "importo": 117.58}], "righe": ["..."], "proposta": {"azione": "nuova", "categoria": "altro"}, "avvisi": [],
   "fornitoreNuovo": {"nome": "Comel Forniture Elettriche", "partitaIva": "09988776655", "codiceFiscale": "09988776655",
     "indirizzo": "Via dei Fornitori 9", "cap": "35100", "citta": "Padova", "provincia": "PD", "nazione": "IT", "pec": ""}},
  {"chiave": "f1.4#1", "nomeFile": "IT00000000000_00045.xml", "tipo": "emessa", "numero": "45/2026", "...": "...",
   "proposta": {"azione": "gia", "idFattura": 13, "riferimento": "W-13"}, "avvisi": ["Già importata il 20/10"]}],
 "scartati": [{"nomeFile": "foto.jpg", "motivo": "Non è un file di fattura: servono .xml, .p7m o .zip"},
   {"nomeFile": "vecchie.zip", "motivo": "Uno zip dentro lo zip: aprilo e carica i file che ha dentro"}]}
```
- **File accettati**: `.xml`, `.p7m`/`.xml.p7m` (busta CMS in DER o BER, anche scritta in base64, anche con il
  contenuto spezzato in piu' pezzi e la doppia firma; la firma **non si verifica**), `.zip` (anche con piu' file; niente
  zip dentro zip, voci cifrate o zip64). Al massimo **300 file** (contando le voci degli zip) e **30 MB** per volta
  (`"Troppi file: al massimo 300 per volta"`, `"File troppo grandi: al massimo 30 MB per volta"`), 10 MB per XML
  scompattato, 100 MB scompattati in tutto (contro le zip bomb). **Sicurezza**: un `<!DOCTYPE` o un `<!ENTITY` scarta il
  file (`"Il file ha parti che Wisper non legge per sicurezza (DOCTYPE): non è un XML di fattura normale"`), le entita'
  sconosciute pure; niente si esegue. Codifiche: UTF-8 (anche col BOM), UTF-16, ISO-8859-1, windows-1252. Prefissi dei
  nomi qualunque (`p:`, `ns2:`, nessuno). Serve la partita IVA dello studio (`"Scrivi prima la partita IVA dello studio in
  Amministrazione › Dati dello studio: serve a capire quali fatture sono sue"`).
- **`chiave`** del documento: `f<n>#<b>` (n = il file caricato da 1, b = il corpo da 1: un **lotto** con due
  `FatturaElettronicaBody` da' `f1#1` e `f1#2`); per le voci di uno zip `f<zip>.<voce>#<b>`.
- **`tipo`**: `emessa` (chi la emette e' lo studio), `ricevuta` (chi la riceve e' lo studio), `esito`. Scartati con la
  frase: `"Non è una fattura dello studio: né chi la emette né chi la riceve è Studio Tecnico GM"`, `"Autofattura o
  integrazione: Wisper non la gestisce"` (TD16-TD21, TD29), `"Non serve: sono i dati dell'invio, non la fattura"`
  (metadati), `"Non serve: è un messaggio dello SDI che non riguarda la consegna"`, `"Il file non è un XML leggibile: ..."`,
  `"La busta firmata (.p7m) non si legge: scarica di nuovo il file dal programma"`.
- **`conti`** (emessa) come fase4.md §9.1: `compenso` (righe senza natura), `anticipazioni` (N1 tranne il bollo),
  `bolloAddebitato` (la riga N1 "bollo" uguale a `ImportoBollo`), `contributo`, `iva`, `bollo`, `totale`
  (`ImportoTotaleDocumento` o la somma del riepilogo), `ritenuta`, `netto` (somma dei pagamenti, o totale − ritenuta).
  Una ricevuta: `{totale, imponibile, iva, contributo, bollo, ritenuta, netto}` (`imponibile` = righe senza natura e
  quelle esenti o non imponibili).
- **`proposta.azione`**: `abbina` | `senzaBozza` | `nuova` (ricevuta) | `gia` | `salta` (esito per un file che non c'e').
  **`certezza`** (emesse): `certa` (il "Rif. Wisper W-n" in causale, descrizioni o AltriDatiGestionali, di una bozza o
  pronta di quel cliente e dello stesso tipo; anche: emessa a mano con lo stesso numero e anno, l'XML le si attacca) |
  `probabile` (bozze e pronte dello stesso cliente e tipo, data dell'XML tra 3 giorni prima del passaggio e 60 dopo,
  stesso totale ±0,01: prima le pronte, poi la piu' vecchia; le altre uguali in `alternative`) | `diversa` (ci sono
  candidate ma nessuna col totale uguale: la pronta piu' recente, con `differenze` e `righeMancanti`) | `nessuna`
  (`senzaBozza`). Nella pagina: **Sicura** / **Probabile** / **Diversa** / **Senza bozza**.
- `differenze`: `[{campo, bozza, xml}]` per `totale`, `compenso`, `contributo`, `iva`, `ritenuta`, `anticipazioni`,
  `bollo`, solo quelli diversi. `righeMancanti`: le righe della bozza (non il bollo) che nell'XML non ritrovo (stesso
  importo e stesso tipo, una per una) `{idRiga, descrizione, importo, tipo, gruppo}`. `libera`: i gruppi gia' spuntati
  che tornerebbero da fatturare = **solo quelli con TUTTE le righe mancanti** (vera, la 49/2026 contro la W-15):
  `"differenze": [{"campo": "totale", "bozza": 2069.12, "xml": 1947.12}, {"campo": "anticipazioni", "bozza": 120, "xml": 0},
  {"campo": "bollo", "bozza": 2, "xml": 0}], "righeMancanti": [{"idRiga": 13, "descrizione": "Spesa anticipata per conto del
  cliente: Pratica di connessione al distributore del 14/10/2026", "importo": 120, "tipo": "anticipazione", "gruppo":
  "spesa:13"}], "libera": ["spesa:13"]`.
- `collegabili` (senza bozza, fatture): le cose libere da fatturare di quel cliente per gruppo (un mese di rapportini
  con le sue spese, una scadenza, una spesa, le ore di un mese), `{gruppo, titolo, importo (senza le anticipate),
  voci: [{tipo, id}], spuntato}`: spuntato se l'importo e' uguale al compenso dell'XML.
- `clienteNuovo` / `fornitoreNuovo`: i dati dell'XML per crearlo (`{nome, partitaIva, codiceFiscale, indirizzo, cap,
  citta, provincia, nazione, pec}`), quando non c'e' nessun soggetto con quella partita IVA o quel codice fiscale.
- **Note di credito** (TD04) emesse: `fatturaCollegata: {idFattura, numero}` (da `DatiFattureCollegate`: numero +
  anno, stesso cliente). Senza bozza: `proposta.gruppiFattura: [{gruppo, importo, sorgenti: [{tipo, id, descrizione}],
  descrizione}]`, `proposta.totale` (la nota copre tutta la fattura?) e `libera` = tutti i gruppi se totale, nessuno se
  parziale (con l'avviso `"Nota di credito parziale: scegli cosa torna da fatturare"`). Vera, la 3/2026 (sample 50):
  `"fatturaCollegata": {"idFattura": 13, "numero": "45/2026"}, "proposta": {"azione": "senzaBozza", "gruppiFattura":
  [{"gruppo": "scadenza:7", "importo": 1140, "sorgenti": [{"tipo": "scadenza", "id": "7", "descrizione": "30% alla firma ·
  26ST003"}], "descrizione": "30% alla firma · 26ST003"}], "totale": false, "libera": [], "...": "..."}`.
- **Ricevute**: `proposta: {"azione": "nuova", "categoria": "consulenze", "idSpesa": 21}` (`idSpesa`: una spesa della
  fase 3 con lo stesso importo, ±3 giorni, stesso fornitore o descrizione simile), `ricevutaCollegata` per una TD04 di un
  fornitore. Avvisi: `"Scadenza non scritta nella fattura: messa a 30 giorni"`, `"Potrebbe essere la spesa del 19/10 di
  659,78 €: collegala per non contarla due volte nei costi"`.
- **Esiti** (RC consegnata, MC non consegnata, NS scartata), veri: `{"chiave": "f1#1", "nomeFile": "IT00000000000_00045_RC_001.xml",
  "tipo": "esito", "esito": "consegnata", "nomeFileFattura": "IT00000000000_00045.xml", "data": "2026-10-19", "errori": [],
  "proposta": {"azione": "abbina", "idFattura": 13, "riferimento": "W-13", "numero": "45/2026"}, "avvisi": []}`. Si
  abbinano col `NomeFile` salvato quando si e' importato l'XML (anche di un XML della stessa lettura); NS ha `errori:
  [{codice, descrizione}]` e l'avviso `"Lo SDI ha scartato la fattura 46/2026: torna pronta, da correggere nel programma"`;
  senza fattura: `azione: "salta"`, `"Esito per un file che Wisper non ha"`.
- **Doppioni**: la chiave `partitaIvaStudio|tipo|anno|numero` (ricevute: `partitaIvaFornitore|...`) gia' importata →
  `gia` con `"Già importata il 20/10"` (e `"C'è già con importi diversi: tenuta quella di prima"`); lo stesso XML due
  volte nella stessa lettura: `"C'è due volte tra i file caricati: la prendo una volta sola"`.

`confermaXml {idLettura, scelte: [{chiave, azione, idFattura?, creaCliente?, idCliente?, idCommessa?, collega?: [{tipo,
id}], libera?: ["gruppo"...], idSpesa?, categoria?, idFornitore?, note?}]}` (fatturazione 2) →
`{"ok": true, "conteggi": {"abbinate": 1, "nuove": 1, "ricevute": 1, "note": 0, "esiti": 0, "saltate": 1}, "fatture":
[...§15.4], "ricevute": [...§15.11], "avvisi": []}`. Tutto in una transazione; **un documento senza scelta si salta**
(niente si abbina da solo, nemmeno il certa). Ordine: fatture, note di credito, ricevute, esiti. `azione`: `abbina` |
`senzaBozza` | `nuova` (ricevute; per una ricevuta ogni azione che non e' `salta` vale `nuova`) | `salta`.
- `abbina` (fattura o nota): `idFattura` (di base quella della proposta). **Vince l'XML**: numero, data, tipo documento,
  conti, righe (`origine: "xml"`, coi gruppi della bozza dove importo e tipo combaciano) e rate dell'XML; la bozza tiene
  `totaleBozza`/`nettoBozza` se i conti erano diversi. `libera`: i gruppi che tornano da fatturare, **accettati solo se
  mancano per intero** dall'XML (gli altri restano fatturati, con l'avviso `"La fattura 49/2026: il gruppo scadenza:8 è
  (almeno in parte) nell'XML: resta fatturato"`); le loro righe della bozza si tolgono, le sorgenti si liberano (`"non è
  nella fattura 49/2026"`). Il file originale (xml o p7m) diventa un file `fattura` della fattura (`file`). Registro:
  `"emessa dall'XML IT00000000000_00046.xml.p7m"`. Poi gli effetti di §15.10.
- `senzaBozza`: una fattura `emessa` coi dati dell'XML, senza sorgenti, con il cliente trovato, scelto (`idCliente`) o
  creato dall'XML (`creaCliente: true`; senza: `"La fattura 81/2026: scegli il cliente o crealo dai dati dell'XML"`),
  la commessa se scelta (`idCommessa`). `collega`: le cose da fatturare che quell'XML ha gia' fatturato (devono essere
  libere e di quel cliente), legate alla fattura come fatturate. Una nota senza bozza libera i gruppi `libera` della
  fattura collegata (§15.8).
- `nuova` (ricevuta): fornitore trovato, scelto (`idFornitore`) o creato dall'XML (codice F...), `categoria`
  (`materiale` | `consulenze` | `servizi` | `utenze` | `affitto` | `altro`), `idCommessa`, `idSpesa`, `note`.
- esito `abbina`: RC/MC scrivono `esitoSdi` (`consegnata` | `non_consegnata`) ed `esitoIl`; **NS** riporta la fattura a
  `pronta` con `esitoSdi: "scartata"`, toglie numero, chiave, file e righe dell'XML (tornano quelle della bozza), toglie
  gli effetti dell'emissione (le sorgenti restano sue), registro `"scartata dallo SDI"`. L'XML corretto, importato di
  nuovo, si riabbina (certa).
- Errori: `"La lettura è scaduta: carica di nuovo i file"` (scaduta, gia' confermata o di un'altra persona), `"La
  fattura 46/2026: scegli la bozza a cui abbinarla"`, `"... la W-15 non è più una bozza (45/2026)"`, `"... è per Rossi
  Impianti Srl: la W-14 è per un altro cliente"`, quelli di §4.4.

### 15.8 Note di credito

`preparaNotaCredito {idFattura, tutta?, righe?: [{idRiga, importo?}], motivo}` (fatturazione 2), da una fattura emessa
→ `{"ok": true, "fattura": {...la nota in bozza, "tornanoDaFatturare": [{gruppo, sorgenti: [{tipo, id, descrizione}]}]}}`.
`tutta`: tutte le righe (non il bollo, che il server rifa'); `righe`: solo quelle, con un importo piu' piccolo = storno
parziale (la riga diventa "a corpo"). La nota copia i parametri fiscali della fattura, `tipoDocumento` `TD04`,
`idFatturaCollegata`, causale `"Nota di credito per la fattura 45/2026: {motivo}"`, righe `"Storno: ..."` / `"Storno
parziale: ..."`. Vera (200 della 45/2026): `"conti": {"righe": [200], "compenso": 200, "contributo": 10, "baseIva":
210, "iva": 46.2, "anticipazioni": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 256.2, "ritenuta": 40, "netto": 216.2,
"parteSenzaIva": 0}` (il caso 12). `tornanoDaFatturare`: i gruppi che la nota storna **per intero** (ogni riga del
gruppo con lo stesso importo; con `tutta`, tutti i gruppi della fattura, anche quelli delle sorgenti collegate senza
righe proprie). Si passa al programma come una fattura. Errori: `"Motivo: scrivi perché la correggi"`, `"Si storna al
massimo quello che c'è: 1.140,00 €"` (per riga, e per tutta la fattura contando le altre note vive o emesse), `"Scegli le
righe da stornare, o tutta la fattura"`, `"La nota di credito si prepara da una fattura emessa"`.

**Quando la nota e' emessa** (XML o `segnaEmessa`): i gruppi stornati per intero (o, per una nota senza bozza, i gruppi
scelti in `libera`) tornano da fatturare con gli effetti al contrario (§15.10, nota `"stornato dalla nota di credito
4/2026"`); se le note emesse coprono tutto il totale, la fattura e' `annullata` (`annullataIl`). Una nota scartata dallo
SDI rimette le cose come prima della nota (le sorgenti tornano alla fattura, se nel frattempo non sono finite in
un'altra; la fattura non e' piu' annullata).

### 15.9 Fatturate fuori da Wisper

`segnaFatturataFuori {voci: [{tipo, id}], nota?, annulla?}` (fatturazione 2) → `{"ok": true, "fatte": 2, "voci":
[{tipo, id}]}`: per il passaggio, le cose gia' fatturate prima di Wisper (rapportino → FATTURATO, scadenza → `fatturata`
senza fattura, spesa e ore → `fatturata_il`), registro `"fatturata fuori da Wisper: {nota}"`. `annulla: true` toglie il
segno (solo alle cose segnate cosi'). Una cosa gia' in una fattura: la frase di §4.4. Una spesa di un rapportino si segna
col suo rapportino (`"La spesa 14 è del rapportino RAP/2026/0007: si segna fatturata col suo rapportino"`); un rapportino
solo se firmato o inviato.

### 15.10 Effetti dell'emissione e blocchi

**Quando una fattura diventa emessa** (XML abbinato, senza bozza con `collega`, `segnaEmessa`), nella stessa
transazione, per ogni sorgente attiva: rapportino → `FATTURATO` con `fatturatoIl` = **data della fattura** (le sue
spese al cliente la seguono); scadenza di pagamento → `stato: "fatturata"`, `fattura_id`; spesa e ore → `fatturata_il` =
data della fattura. Ogni cambio ha la sua riga nel registro con la nota `"dalla fattura 45/2026 (W-13)"`. **Il
contrario** (nota di credito che storna, scarto dello SDI): rapportino → `INVIATO` se ha la data d'invio, se no
`FIRMATO`; scadenza → `prevista`; spesa e ore → `fatturata_il` vuoto; note `"stornato dalla nota di credito 3/2026"` o
`"la fattura 45/2026 è stata scartata dallo SDI"`.

**Una cosa riservata (bozza, pronta) o fatturata (emessa) non si cambia** (§7.3), con queste frasi (vere):
- rapportino: `salvaRapportino`, `stato` BOZZA / INVIATO / ANNULLATO, foto nuove (`caricaFile spesa`), `togliFile` →
  `"Il rapportino RAP/2026/0007 è nella bozza W-16 per Elettrodinamica: toglilo prima dalla bozza"` oppure `"Il rapportino
  RAP/2026/0007 è nella fattura 52/2026: per cambiarlo serve una nota di credito"`. `stato` FATTURATO su uno riservato:
  `"Diventa fatturato da solo quando torna l'XML della fattura W-16"`. Su un rapportino non legato a niente FATTURATO
  resta possibile (quelli fatturati fuori), con la nota `"segnato fatturato a mano, senza fattura in Wisper"`; tornare
  indietro solo per questi (`"non ancora fatturato: tolto il segno a mano"`). `inviaEmail` manda lo stesso il riepilogo
  ma non segna inviati i rapportini che stanno in una fattura;
- spesa: in una bozza o fattura si cambiano solo categoria, descrizione e "l'ho pagata io" (`soloCampi`, come le spese
  di un rapportino firmato); importo, destinazione, anticipazione, cliente, data no: `"La spesa «Pedaggio» del 03/09 è
  nella bozza W-16 per Elettrodinamica: toglila prima dalla bozza"` (anche `togliSpesa`);
- ore: `salvaOre`, `togliOre` → `"Le ore del 21/10 su 26ST002 sono nella bozza W-17 per Rossi Impianti Srl: toglile prima
  dalla bozza"`; fatturate fuori: `"Fatturate fuori da Wisper il 22/10: non si cambiano"`;
- approvazioni (`approva`, `respingi`, `annullaApprovazione`): una cosa gia' in una bozza o fattura non si decide piu'
  (la frase di §4.4);
- scadenza di pagamento: cambiare importo o toglierla (anche dal preventivo) → `"La scadenza «30% alla firma» di
  26ST003 è nella fattura 45/2026: per cambiarla serve una nota di credito"`.

### 15.11 Fatture ricevute

`ricevute {stato?: da_pagare|pagate|tutte, idFornitore?, idCommessa?, testo?, anno?}` (fatturazione 1) →
`{"ok": true, "ricevute": [...]}` (le piu' recenti prima); `ricevuta {id}` → `{"ok": true, "ricevuta": {...}}`. Vera:
```json
{"id": 3, "idFornitore": "F003", "fornitore": "Ing. Paolo Verdi", "tipoDocumento": "TD01", "numero": "12", "data": "2026-10-05",
 "descrizione": "Verifica dei calcoli del quadro", "categoria": "consulenze", "idCommessa": "26ST003",
 "commessa": "Adeguamento impianto elettrico capannone", "idSpesa": null, "imponibile": 520, "iva": 114.4, "contributo": 0,
 "bollo": 0, "totale": 634.4, "ritenuta": 100, "netto": 534.4, "pagato": 534.4, "daPagare": 0, "stato": "attiva",
 "statoVisto": "Pagata", "scaduta": false, "giorniScaduta": 0,
 "scadenze": [{"id": 3, "data": "2026-10-12", "importo": 534.4, "coperta": 534.4}], "scadenzaStimata": false,
 "pagamenti": [{"idMovimento": 4, "data": "2026-10-12", "importo": 534.4, "conto": "Conto studio …3456", "verificato": true}],
 "idRicevutaCollegata": null, "origine": "mano", "file": null, "nomeFileSdi": "", "note": "", "motivo": "", "puoScrivere": true,
 "creato": "2026-10-22T07:32:11", "modificato": "2026-10-22T07:32:11"}
```
`ritenuta` = quella che lo studio trattiene e versa (F24 1040); `netto` = da pagare al fornitore; `daPagare` = netto −
pagato − netto delle note di credito del fornitore collegate. `statoVisto`: `Da pagare` | `Pagata in parte` | `Pagata` |
`Scaduta` | `Annullata` | `Nota di credito`. `scadenzaStimata`: la scadenza non era scritta (data + 30 giorni).

`salvaRicevuta {ricevuta: {id?, idFornitore, numero, data, totale, imponibile?, iva?, ritenuta?, scadenze?: [{data,
importo}], categoria?, idCommessa?, idSpesa?, descrizione?, note?}}` (fatturazione 2) → `{"ok": true, "ricevuta":
{...}}`. A mano tutto (senza scadenze: una a 30 giorni, stimata; le scadenze devono fare il netto); per quelle arrivate
dall'XML solo categoria, commessa, spesa, note e le scadenze se erano stimate. Errori: `"Fornitore: scegli il fornitore"`,
`"Numero: scrivi il numero della fattura"`, `"Totale: scrivi quanto"`, `"Ritenuta: deve essere meno del totale"`, `"Le
scadenze fanno 50,00 €: devono fare il netto da pagare, 100,00 €"`, `"C'è già la fattura 9 di Noleggi Piattaforme Prova
Snc"`, `"Le scadenze di questa fattura sono scritte nell'XML: non si cambiano"`, `"Categoria: materiale, consulenze,
servizi, utenze, affitto o altro"`.

`annullaRicevuta {id, motivo}` (fatturazione 2): non si cancella (`stato: "annullata"`). Errori: `"Motivo: scrivi perché
la annulli"`, `"Ha già dei pagamenti: annulla prima i movimenti"`.

### 15.12 Scadenze di pagamento, commessa, riepilogo

`scadenzePagamento {idCommessa?, stato?}` (fatturazione 1), vera per 26ST003:
```json
{"ok": true, "scadenze": [
  {"id": 7, "idCommessa": "26ST003", "commessa": "Adeguamento impianto elettrico capannone", "idCliente": "C002", "cliente": "Rossi Impianti Srl",
   "contratto": "PR/2026/012 rev. 1", "descrizione": "30% alla firma", "quando": "firma", "data": "", "importo": 1140, "stato": "fatturata",
   "idFattura": 13, "fattura": "45/2026", "fuoriDaWisper": false},
  {"id": 8, "descrizione": "40% a fine progetto", "quando": "avanzamento", "importo": 1520, "stato": "in_bozza", "idFattura": 15, "fattura": "W-15", "...": "..."},
  {"id": 9, "descrizione": "Saldo a fine lavori", "quando": "fine", "importo": 1140, "stato": "prevista", "idFattura": null, "fattura": "", "...": "..."}],
 "commesse": [{"idCommessa": "26ST003", "commessa": "Adeguamento impianto elettrico capannone", "idCliente": "C002", "cliente": "Rossi Impianti Srl",
   "contratto": 3800, "fatturato": 1140, "scadenze": ["...le stesse..."]}]}
```
`stato` visto: `prevista` | `in_bozza` | `fatturata` | `incassata` (la fattura e' pagata). `fuoriDaWisper`: fatturata
senza fattura in Wisper. `commesse[].fatturato` = le scadenze fatturate o incassate ("1.140,00 fatturati su 3.800,00").

`fatturazioneCommessa {id}` (fatturazione 1), vera: `{"ok": true, "idCommessa": "26ST003", "modoFatturazione": "corpo",
"contratto": 3800, "fatturato": 1140, "incassato": 0, "daFatturare": 0, "inBozza": 1520, "previsto": 1140, "scadenze":
[...come sopra...], "fatture": [...riassunti di §15.4: "Bozza W-15", "45/2026"]}`. In compenso (senza contributo e
IVA): `fatturato` = righe di compenso delle emesse con quella commessa meno le note; `incassato` = gli incassi di quelle
fatture in proporzione alla parte di questa commessa; `daFatturare` = le cose pronte della commessa; `inBozza` = righe di
compenso di bozze e pronte; `previsto` = scadenze ancora previste.

`riepilogoFatturato {anno, per: "mese"|"cliente"|"commessa"}` (fatturazione 1), vero per mese:
`{"ok": true, "anno": 2026, "per": "mese", "righe": [{"chiave": "2026-09", "nome": "settembre 2026", "fatture": 1, "compenso":
750, "contributo": 37.5, "iva": 173.25, "anticipazioni": 0, "totale": 960.75, "ritenute": 150, "incassato": 1037.76}, ...],
"totali": {"fatture": 3, "compenso": 2850, "contributo": 142.5, "iva": 658.35, "anticipazioni": 0, "totale": 3650.85,
"ritenute": 570, "incassato": 1858.01}, "fatturato": 2850, "incassato": 1858.01}`. Le emesse (e annullate) per data, meno
le note; `fatture` conta le fatture (non le note). `incassato`: i movimenti dell'anno abbinati a fatture (per mese: il
mese del movimento). Per mese ci sono tutti i mesi fino a quello di oggi; per cliente e commessa dalla piu' grande; per
commessa `chiave: ""` = `"Più commesse o nessuna"`. `fatturato` e `incassato` sono i due numeri in grande.

### 15.13 Conti e movimenti

`conti {tutti?}` (banche 1), vera: `{"ok": true, "conti": [{"id": 1, "nome": "Conto studio", "banca": "Banca di esempio",
"ultimeCifre": "3456", "predefinito": true, "soglia": null, "attivo": true, "note": "", "saldo": 8743.55, "saldoAl":
"2026-10-01", "saldoScritto": 9850, "movimentiDopo": 5, "verificatiDopo": 4, "collegamento": "non_collegato", "creato":
"...", "modificato": "...", "iban": "IT60X0542811101000000123456"}], "collegamento": "non_collegato"}`. **`iban` intero
solo a chi ha banche 2** (per gli altri la chiave non c'e'). `saldo` = l'ultimo saldo scritto + entrate − uscite dei
movimenti non annullati **dopo** quel giorno ("registrato": "dall'ultimo saldo scritto il 01/10 · 5 movimenti dopo");
senza saldo scritto si contano tutti i movimenti. `soglia: null` = `SOGLIA_CASSA`. `tutti: true` anche i conti chiusi.

`salvaConto {conto: {id?, nome, banca?, iban?, predefinito?, soglia?, attivo?, note?}}` (banche 2) → `{"ok": true,
"conto": {...}}`. Il primo conto e' il predefinito; un conto predefinito toglie il segno agli altri (uno solo, lo
garantisce anche un indice del database). Errori: `"Nome: scrivi il nome del conto"`, `"IBAN: non sembra giusto"`
(modulo 97; l'italiano di 27 caratteri), `"Soglia: non può essere negativa"`.

`aggiornaSaldo {idConto, data?, saldo}` (banche 2) → `{"ok": true, "conto": {...}}`: il saldo letto in banca. Errori:
`"Saldo: scrivi il saldo letto in banca"`, `"Data: il saldo letto in banca non può essere di un giorno che deve ancora
venire"`, `"Conto 9 non trovato"`.

`movimenti {da?, a?, idConto?, verso?, categoria?, verificato?, testo?, annullati?, pagina?}` (banche 1), 100 per
pagina, i piu' recenti prima. Vera: `{"ok": true, "pagina": 1, "pagine": 1, "quante": 5, "entrate": 820.25, "uscite":
1926.7, "daVerificare": 1, "importaEstrattoConto": "non_collegato", "movimenti": [{"id": 5, "idConto": 1, "conto": "Conto
studio …3456", "data": "2026-10-12", "verso": "entrata", "importo": 500, "descrizione": "Incasso Rossi Impianti Srl,
fattura 39/2026 (in parte)", "idSoggetto": "C002", "soggetto": "Rossi Impianti Srl", "categoria": "incasso", "verificato":
false, "verificatoIl": "", "livello": "registrato", "abbinamenti": [{"tipo": "fattura", "id": 12, "etichetta": "39/2026",
"importo": 500}], "annullato": false, "motivo": "", "puoScrivere": true, "creato": "...", "modificato": "..."}]}`.
`livello`: `registrato` | `verificato` (la parola: **Registrato** / **Verificato in banca**). `categoria`: `incasso` |
`pagamento` | `tributo` | `stipendio` | `giroconto` | `altro`. `testo` cerca in descrizione, soggetto e importo (`"500"`,
`"500,00"`). Gli annullati solo con `annullati: true`. `entrate`, `uscite`, `daVerificare` del filtro intero.

`salvaMovimento {movimento: {id?, idConto, data, verso, importo, descrizione?, idSoggetto?, categoria?, verificato?,
abbinamenti?: [{tipo: "fattura"|"ricevuta"|"impegno", id, importo}]}}` (banche 2) → `{"ok": true, "movimento": {...}}`.
`abbinamenti`, se c'e', e' l'elenco intero. Un bonifico puo' pagare piu' fatture, una fattura avere piu' incassi; una
fattura (anche bozza o pronta: avviso di parcella) si abbina a un'entrata, una ricevuta a un'uscita, un impegno al suo
verso; un impegno senza importo prende quello pagato, una proposta pagata e' confermata. Errori (veri): `"La fattura
45/2026 ha ancora da incassare 1.232,34: non puoi abbinarne 1.300,00"`, `"Hai abbinato 1.100,00 su un movimento di
1.000,00"`, `"Importo: scrivi quanto"`, `"Conto: scegli il conto"`, `"Entrata o uscita?"`, `"Una fattura si abbina a
un'entrata"`, `"Una fattura ricevuta si abbina a un'uscita"`, `"Il movimento è annullato: non si cambia"`, `"Il movimento è
abbinato: per cambiare entrata o uscita togli prima gli abbinamenti"`.

`segnaIncasso {idFattura, importo?, data?, idConto?, verificato?}` e `segnaPagamento {idRicevuta? | idImpegno?, importo?,
data?, idConto?, verificato?}` (banche 2): la strada corta, il movimento gia' abbinato (importo di base = residuo; meno
= "in parte"; conto di base il predefinito) → `{"ok": true, "movimento": {...}, "fattura": {...}}` (o `"ricevuta"`,
`"impegno"`). Descrizioni: `"Incasso Rossi Impianti Srl, fattura 45/2026 (in parte)"` (una pronta: `"..., W-14"`),
`"Pagamento Ing. Paolo Verdi, fattura 12"`, l'impegno la sua. Errori: `"La fattura 38/2026 è già pagata"`, `"Scegli cosa
hai pagato: una fattura ricevuta o un impegno"`, `"Conto: prima scrivi il conto in Banche e scadenze › Conti"`, quelli di
`salvaMovimento`.

`verificaMovimenti {ids, verificato}` (banche 2; di base `true`) → `{"ok": true, "fatte": 1, "movimenti": [...]}`, nota
`"visto sull'estratto conto"`. `annullaMovimento {id, motivo}` (banche 2) → `{"ok": true, "movimento": {...}}`: toglie i
suoi abbinamenti (la fattura torna da incassare), registro `"movimento annullato: {motivo}"`; `"Motivo: scrivi perché lo
annulli"`.

### 15.14 Scadenziario e situazione

`scadenziario {da?, a?, idConto?}` (banche 1; di base da oggi a 90 giorni), vero (accorciato):
```json
{"ok": true, "oggi": "2026-10-22", "da": "2026-10-22", "a": "2026-12-10", "saldoOggi": 8743.55, "soglia": 3000, "saldoPartenza": 8743.55,
 "scaduti": [{"tipo": "fattura", "id": 12, "data": "2026-10-10", "verso": "entrata", "titolo": "39/2026 · Rossi Impianti Srl",
   "dettaglio": "scaduto da 12 giorni · pagata in parte", "importo": 310.75, "stato": "scaduto", "proposta": false, "contaNelSaldo": false}],
 "giorni": [
  {"data": "2026-10-26", "titolo": "Lunedì 26 ottobre", "saldo": 7893.55, "sottoSoglia": false, "righe": [
    {"tipo": "impegno", "id": 2, "data": "2026-10-26", "verso": "uscita", "titolo": "Affitto ufficio", "dettaglio": "ogni mese",
     "importo": 850, "stato": "previsto", "proposta": false, "contaNelSaldo": true}]},
  {"data": "2026-11-16", "titolo": "Lunedì 16 novembre", "saldo": 4053.25, "sottoSoglia": false, "righe": [
    {"tipo": "ricevuta", "id": 1, "verso": "uscita", "titolo": "Materiale Elettrico Esempio Srl · fattura A/233", "dettaglio": "materiale", "importo": 486, "stato": "previsto", "...": "..."},
    {"tipo": "impegno", "id": 26, "verso": "uscita", "titolo": "IVA del 3° trimestre", "dettaglio": "codice 6033", "importo": 2380, "stato": "previsto", "...": "..."},
    {"tipo": "impegno", "id": 40, "verso": "uscita", "titolo": "Ritenute sui compensi pagati a ottobre", "dettaglio": "codice 1040",
     "importo": 100, "stato": "proposto", "proposta": true, "contaNelSaldo": true}]},
  {"data": "2026-11-30", "titolo": "Lunedì 30 novembre", "saldo": 1035.59, "sottoSoglia": true, "righe": ["...Secondo acconto IRPEF 3.400..."]}],
 "senzaData": {"entrate": 4410, "voci": 3}, "primoSottoSoglia": "2026-11-30", "nota": "Gli incassi scaduti non entrano nel saldo previsto"}
```
- **Righe**: entrate = rate non coperte delle fatture emesse (`tipo: "fattura"`, `stato` `previsto` o `in_parte`),
  bozze pronte (`stato: "da_emettere"`, `dettaglio: "da emettere: è nel programma"`), scadenze dei contratti con la data
  (`tipo: "scadenza"`, `dettaglio: "Dal contratto · 26ST003"`); uscite = rate non coperte delle ricevute (`tipo:
  "ricevuta"`), impegni non pagati (`tipo: "impegno"`; le proposte `stato: "proposto"`, `proposta: true`; senza importo
  `importoDaScrivere: true`, `"importo da scrivere"` nel dettaglio, non contano nel saldo). `stato`: `previsto` |
  `in_parte` | `scaduto` | `da_emettere` | `proposto`. Ogni riga ha `contaNelSaldo`.
- **Saldo prudente**: si parte dal saldo di oggi dei conti scelti; le **uscite scadute contano oggi** (`saldoPartenza`
  = saldo di oggi − uscite scadute), le **entrate scadute no**. Ogni giorno ha il saldo di fine giornata; `sottoSoglia`
  se sotto la soglia (del conto con `idConto`, se no `SOGLIA_CASSA`). `primoSottoSoglia`: il primo giorno (anche oggi,
  se `saldoPartenza` e' gia' sotto). `titolo` del giorno gia' pronto.
- `scaduti`: le righe con la data passata e non coperte, in cima (`dettaglio` `"scaduto da 12 giorni · ..."`).
  `senzaData`: le scadenze dei contratti senza data (non contano). Con `idConto` contano i movimenti di quel conto e le
  righe senza conto vanno sul predefinito.

`situazione {idConto?}` (banche 1), vera: `{"ok": true, "oggi": "2026-10-22", "saldi": [{"idConto": 1, "nome": "Conto studio
…3456", "saldo": 8743.55}], "saldoOggi": 8743.55, "soglia": 3000, "daIncassare": 1543.09, "scadutoDaIncassare": 310.75,
"daPagare30": 4690.3, "scadutoDaPagare": 0, "previsto": {"30": 5285.59, "60": 893.29, "90": -99.01}, "primoSottoSoglia":
"2026-11-30", "settimane": [{"da": "2026-10-19", "a": "2026-10-25", "entrate": 0, "uscite": 0, "saldo": 8743.55,
"sottoSoglia": false}, {"da": "2026-10-26", "a": "2026-11-01", "entrate": 0, "uscite": 1582, "saldo": 7161.55, "sottoSoglia":
false}, "...13 settimane da lunedi' a domenica..."], "fatturatoAnno": 2850, "incassatoAnno": 1858.01, "collegamento":
"non_collegato"}`. `daIncassare` = residuo delle emesse (di cui `scadutoDaIncassare`); `daPagare30` = ricevute e impegni
entro 30 giorni (di cui `scadutoDaPagare`); `previsto` = il saldo previsto prudente a 30, 60, 90 giorni; `settimane` =
entrate e uscite che contano e saldo a fine settimana; `fatturatoAnno` = compenso delle emesse − note.

### 15.15 Impegni: tributi, F24, rate e le proposte di Wisper

`impegni {da?, a?, tipo?, stato?: aperti|pagati|tutti}` (banche 1; di base gli aperti) → `{"ok": true, "impegni":
[...]}` per scadenza. Uno vero:
```json
{"id": 2, "tipo": "rata", "verso": "uscita", "descrizione": "Affitto ufficio", "codice": "", "scadenza": "2026-10-26", "importo": 850,
 "importoDaScrivere": false, "idConto": null, "conto": "", "idSoggetto": "", "soggetto": "", "idRicorrenza": 3, "occorrenza": "2026-10-26",
 "ricorrenza": {"regola": "mesi", "ogni": 1, "inizio": "2026-09-26", "fine": ""}, "ripete": "ogni mese", "origine": "mano", "periodo": "",
 "confermato": true, "proposta": false, "pagato": 0, "daPagare": 850, "stato": "aperto", "statoVisto": "Da pagare", "scaduto": false,
 "giorniScaduto": 0, "annullato": false, "motivo": "", "note": "", "puoScrivere": true, "creato": "...", "modificato": "..."}
```
`tipo`: `f24` | `tributo` | `rata` | `altro`. `stato`: `aperto` | `in_parte` | `pagato` | `annullato`; `statoVisto`: `Da
pagare` | `Pagato in parte` | `Pagato` | `Scaduto` | `Proposta` | `Annullato`. `ripete`: `"ogni mese"`, `"ogni 3 mesi"`,
`"ogni anno"`, `""`. `origine`: `mano` | `ritenute` | `bollo`; `periodo` delle proposte: `"2026-10"`, `"2026-T4"`.

`salvaImpegno {impegno: {id?, tipo, descrizione, codice?, scadenza, importo?, verso?, idConto?, idSoggetto?, note?,
ricorrenza?: {regola: "mesi"|"anni", ogni?, fine?} | null}, perRicorrenza?: "questa"|"future"|"tutte"}` (banche 2) →
`{"ok": true, "impegno": {...}, "occorrenze": 12}` (`occorrenze` quando nasce o si rifa' una serie). Le serie usano
`ricorrenze` (`per = 'impegno'`): le occorrenze ci sono per i **prossimi 12 mesi** e si allungano ogni notte. Su
un'occorrenza: `questa` (di base) cambia solo lei; `future`/`tutte` riportano **i campi cambiati** sulle occorrenze
aperte (non pagate) da li' in poi / di tutta la serie e su quelle che nasceranno; se cambiano il giorno o la regola, da
questa nasce una serie nuova (la vecchia finisce il giorno prima, le sue aperte seguenti si annullano: `"tolto: la
ricorrenza è cambiata"`); `ricorrenza: null` con `future`/`tutte` = non si ripete piu' (le aperte seguenti si
annullano). Cambiare una proposta di Wisper la conferma. Errori: `"Descrizione: scrivi cosa si paga"`, `"Scadenza:
scrivi quando"`, `"Importo: non può essere negativo"`, `"Tipo: f24, tributo, rata o altro"`, `"Ripeti: ogni N mesi o
anni"`, `"Ripeti fino al: deve venire dopo la prima scadenza"`, `"L'impegno è annullato: non si cambia"`.

`confermaImpegno {id, importo?}` (banche 2) → `{"ok": true, "impegno": {...}}` (nota `"proposta confermata"`).
`togliImpegno {id, perRicorrenza?, motivo?}` (banche 2) → `{"ok": true, "impegno": {...}, "tolti": 2}`: annullato (non
si cancella); uno con pagamenti no (`"L'impegno ha già dei pagamenti: annulla prima il movimento"`).

**Le proposte di Wisper** (`confermato: false`, pillola **Proposta**), rifatte a ogni pagamento, movimento, fattura
emessa o annullata, finche' non si confermano:
- **ritenute da versare**: per ogni mese in cui si sono pagate fatture ricevute con ritenuta, un `f24` codice `1040`,
  scadenza il 16 del mese dopo (il primo giorno lavorativo: sabato, domenica e feste nazionali, Pasquetta compresa,
  spostano), importo = le ritenute pagate (in proporzione se pagate in parte), `"Ritenute sui compensi pagati a ottobre"`;
- **bollo delle fatture elettroniche**: per trimestre, un `f24` codice `2521`-`2524`, importo = il bollo delle fatture
  emesse nel trimestre, scadenze 31/5, 30/9, 30/11 e fine febbraio dell'anno dopo spostate al primo giorno lavorativo
  (per il quarto trimestre 2026: `"2027-03-01"`), `"Bollo delle fatture del 4° trimestre (stima: controlla nel portale)"`.
Una proposta che non serve piu' si annulla da sola (`motivo: "proposta di Wisper che non serve più"`) e torna se
serve di nuovo; una tolta dalla persona (altro motivo) non torna; una confermata non si tocca piu'. Wisper **non
calcola** IVA, IRPEF e contributi: li scrive chi li sa.

### 15.16 Dashboard: cosa si aggiunge

Solo per chi vede fatture o banche (modulo ≥ 1) **e** ha `costi`, mai nella vista del collaboratore.
- `numeri.soldi` in piu' (veri): `"fattureInBozza": 2389.37, "daIncassare": 1543.09, "scaduto": 310.75, "saldoConti":
  8743.55, "incassiSettimana": 320.25, "pagamentiSettimana": 0, "saldoPrevisto30": 5285.59, "primoSottoSoglia":
  "2026-11-30"`; **`daFatturare` adesso conta tutte le sorgenti pronte** (`2671.88`), `daFatturareMesiPrima` quelle dei
  mesi scorsi e `clientiDaFatturare` i clienti con qualcosa di pronto (il numerino giallo di Fatturazione). `inBozza`
  resta quello di prima (rapportini da firmare), `fatturatoMese` anche (rapportini segnati fatturati nel mese, fase 1).
- Le voci nuove (vere):
```json
{"urgenti": [
  {"tipo": "fattura", "gravita": "urgente", "titolo": "Fattura 39/2026 scaduta da 12 giorni", "dettaglio": "Rossi Impianti Srl · restano 310,75 di 810,75",
   "quanto": 310.75, "unita": "euro", "collegamento": {"pagina": "fattura", "id": 12}},
  {"tipo": "fattura", "gravita": "urgente", "titolo": "Emetti la fattura per Mario Bianchi entro domenica 1 novembre", "dettaglio": "Ha già pagato il 20/10 · W-14",
   "quanto": 320.25, "unita": "euro", "collegamento": {"pagina": "fattura", "id": 14}},
  {"tipo": "fatturazione", "gravita": "soldi", "titolo": "Da fatturare dei mesi scorsi", "dettaglio": "8 cose pronte, dal 09/2026",
   "quanto": 1393.92, "unita": "euro", "collegamento": {"pagina": "fatturazione", "filtro": {"mese": "2026-09"}}}],
 "settimana": [
  {"tipo": "fatturazione", "gravita": "soldi", "titolo": "Da fatturare", "dettaglio": "2 clienti · Elettrodinamica, Rossi Impianti Srl",
   "quanto": 2671.88, "unita": "euro", "collegamento": {"pagina": "fatturazione"}},
  {"tipo": "fattura", "gravita": "attenzione", "titolo": "1 fattura passata al programma: manca l'XML di ritorno", "dettaglio": "W-14 · Mario Bianchi",
   "quanto": 1, "unita": "fatture", "collegamento": {"pagina": "fatture", "filtro": {"stato": "pronta"}}},
  {"tipo": "impegno", "gravita": "attenzione", "titolo": "Pagamenti entro 7 giorni", "dettaglio": "Affitto ufficio lunedì 26, Noleggi Piattaforme Prova Snc mercoledì 28",
   "quanto": 1582, "unita": "euro", "collegamento": {"pagina": "scadenziario"}}],
 "pianificare": [
  {"tipo": "fiscale", "gravita": "info", "titolo": "Regole delle fatture da confermare col commercialista",
   "dettaglio": "Contributo EPPI, ritenuta, bollo e tipo di documento: finché non sono confermate, ogni conto lo dice", "quanto": null, "unita": null,
   "collegamento": {"pagina": "amministrazione", "filtro": {"sezione": "fiscale"}}},
  {"tipo": "cassa", "gravita": "info", "titolo": "Il saldo previsto scende sotto 3.000 € il lunedì 30 novembre", "dettaglio": "Saldo di oggi 8.743,55 · guarda lo scadenziario",
   "quanto": null, "unita": null, "collegamento": {"pagina": "scadenziario", "filtro": {"giorno": "2026-11-30"}}},
  {"tipo": "impegno", "gravita": "info", "titolo": "1 proposta di Wisper da confermare", "dettaglio": "Ritenute sui compensi pagati a ottobre",
   "quanto": 1, "unita": "impegni", "collegamento": {"pagina": "impegni", "filtro": {"proposte": true}}}]}
```
- **urgenti**: fatture scadute (una per una fino a 3, poi una voce sola `"5 fatture scadute"` con `collegamento
  {pagina: "fatture", filtro: {scadute: true}}`); fatture gia' pagate da emettere entro 12 giorni; impegni scaduti non
  pagati (`"F24 di ottobre scaduto da 3 giorni"`, uno per uno fino a 3, poi `"5 pagamenti scaduti"`, `collegamento
  {pagina: "impegni", id}`); saldo previsto sotto soglia **entro 14 giorni** (`tipo: "cassa"`, `gravita: "urgente"`,
  `"Il saldo previsto scende sotto 3.000 € il lunedì 2 novembre"` o `"... già oggi"`); "Da fatturare dei mesi scorsi"
  (adesso su tutte le sorgenti, scadenze escluse). **questa settimana**: "Da fatturare" (al posto di "Da fatturare
  questo mese"), incassi attesi entro 7 giorni (`tipo: "cassa"`, `"Incassi attesi entro 7 giorni"`), pagamenti e impegni
  entro 7 giorni, pronte da piu' di 3 giorni senza XML. **da pianificare**: regole fiscali non confermate (solo titolare
  e amministrazione), saldo di un conto non aggiornato da 30 giorni (`tipo: "conto"`, `"Aggiorna il saldo di Conto studio
  …3456"`, `"L'ultimo saldo scritto è del 01/09: leggilo sull'estratto conto"`, `collegamento {pagina: "conti", id}`),
  nessun conto (`"Scrivi il conto dello studio"`: allora niente avvisi di cassa), saldo sotto soglia oltre 14 giorni,
  fatture ricevute con la scadenza stimata (`tipo: "ricevuta"`), proposte da confermare.
- `collegamento.pagina` nuove: `fatture` (filtro `stato`, `pagamento`, `scadute`), `fattura` (`id`), `ricevute`,
  `ricevuta`, `scadenziario` (filtro `giorno`), `movimenti`, `impegni` (`id`, filtro `proposte`), `conti` (`id`),
  `situazione`; `fatturazione` resta (Da fatturare, filtro `mese`). `tipo` nuovi: `fattura`, `ricevuta`, `impegno`,
  `cassa`, `conto`, `fiscale`. Unita' nuove: `fatture`, `impegni`.

### 15.17 Esportazioni

`esporta {cosa: fatture|ricevute|daFatturare|riepilogo|movimenti|scadenziario|impegni, ...i filtri dell'elenco}`
(lettura del modulo **e** `costi`; senza: la frase di §15.1, `permesso:false`): lo stesso CSV della §12.13
(`wisper-fatture-2026-10-22.csv`). Colonne:
- **fatture**: Riferimento, Numero, Data, Tipo (Fattura, Parcella, Nota di credito), Stato (lo `statoVisto`), Cliente,
  Partita IVA, Commessa, Compenso, Contributo, IVA, Spese anticipate, Bollo (quello addebitato), Totale, Ritenuta, Netto,
  Incassato, Residuo, Scadenza (la prima rata). Vera: `W-13;45/2026;19/10/2026;Fattura;Emessa;Rossi Impianti
  Srl;04455667784;26ST003;1140;57;263,34;0;0;1460,34;228;1232,34;0;1232,34;18/11/2026`;
- **ricevute**: Fornitore, Numero, Data, Tipo, Categoria, Commessa, Imponibile, IVA, Contributo, Totale, Ritenuta,
  Netto, Pagato, Da pagare, Scadenza, Stato, Note;
- **daFatturare**: Codice cliente, Cliente, Cosa (Scadenza di pagamento, Rapportino, Spesa, Ore), Codice, Commessa,
  Data, Titolo, Dettaglio, Pronta, Importo, Spesa anticipata;
- **riepilogo** (`anno`, `per`): Chiave, Nome, Fatture, Compenso, Contributo, IVA, Spese anticipate, Totale, Ritenute,
  Incassato;
- **movimenti**: Data, Conto, Entrata o uscita, Importo, Descrizione, Chi, Categoria, Verificato in banca, Abbinato a,
  Annullato, Motivo;
- **scadenziario**: Giorno, Cosa, Dettaglio, Entrata, Uscita, Saldo previsto, Stato, Sotto soglia (prima gli scaduti);
- **impegni** (di base tutti): Scadenza, Descrizione, Tipo, Codice, Importo, Pagato, Ripete, Stato, Conto, Note.

### 15.18 I conti condivisi

In `server/src/conti.js`, coi casi in **`server/prove/casi-fattura.json`** (telefono `FattureTest.kt` e computer
`pc/prove/fatture.test.js` lo leggono dal suo posto e devono ritrovare ogni numero al centesimo, `deepEqual` sui campi
di `atteso`):
- `contiFattura(f)` (fase4.md §6): `f = {regime, ivaPercentuale, eppiPercentuale, ritenutaPercentuale, ritenuta,
  bolloSoglia, bolloImporto, bolloRivalsa, righe: [{tipo: 'compenso'|'anticipazione', quantita, prezzo, importo?,
  tributoCliente?}]}` → `{righe, compenso, contributo, baseIva, iva, anticipazioni, parteSenzaIva, bollo, bolloAddebitato,
  totale, ritenuta, netto}`. Ogni pezzo al centesimo (`Math.round(n * 100) / 100`) prima di sommare; importo della riga =
  `importo` se c'e', se no quantita' × prezzo (quantita' mancante = 1, prezzo mancante = 0); una riga `tipo: "bollo"` si
  salta (la aggiunge il server). Il file ha i **16 casi del contratto** (tutti ritrovati dal codice al primo colpo e
  controllati di nuovo a mano: nessuno da correggere) e **14 casi limite** del server (17-30: importo gia' fatto contro
  quantita' × prezzo, quantita' mancante, mezzo centesimo per riga e sul contributo e sulla ritenuta, due spese anticipate
  che insieme superano la soglia, solo un tributo del cliente, un privato col bollo, la nota di credito totale, la
  fattura a zero senza righe e con una riga senza prezzo, forfettario sotto e sopra la soglia, EPPI al 2%, la riga del
  bollo che arriva e non conta).
- I **raggruppamenti** (le righe che nascono dai rapportini, `righeRapportini`) li prova solo il server: i 4 del
  contratto (A-D) tornano riga per riga, sorgenti e gruppo compresi.
- In piu', del server: `rigaScadenza`, `rigaSpesa`, `rigaOre` (i testi di §5.2), `scadenzaFattura(data, giorni,
  fineMese)`, `primoLavorativo` (le scadenze degli F24), `ibanValido` (modulo 97).

### 15.19 Note per chi legge il database

Tabelle nuove (migrazione `004-fatture-banche.sql` + `004-fatture-banche.js`, con la copia `wisper.db.prima-4`
prima): `fatture`, `fattura_righe`, `fattura_sorgenti`, `fattura_scadenze`, `fatture_ricevute`, `ricevuta_scadenze`,
`conti`, `conto_saldi`, `movimenti`, `movimento_abbinamenti`, `impegni`, `letture_xml`. Colonne nuove:
`soggetti.sostituto_imposta`, `pagamento_giorni`, `pagamento_fine_mese`; `commesse.modo_fatturazione` (CHECK `ore`,
`corpo`, `misto`); `scadenze_pagamento.fattura_id` (`stato` `prevista` | `fatturata`); `ore.fatturata_il`;
`ricorrenze.per` (`attivita` | `impegno`: l'allungamento notturno delle attivita' guarda solo le sue, quello degli
impegni le sue); `file` rifatta coi tipi `fattura` e `ricevuta` e le colonne `fattura_id`, `ricevuta_id` (tenute
`attivita_id`, `preventivo_id`, `spesa_id`). La `.js` mette `corpo` alle commesse con scadenze di pagamento e lo scrive
nel registro (`utente: "sistema"`, `azione: "migrazione"`, nota `"migrazione 004: ..."`).
- **Una cosa si fattura una volta sola, nel database**: `CREATE UNIQUE INDEX fattura_sorgenti_una ON
  fattura_sorgenti(tipo, sorgente_id) WHERE attiva = 1`. Le prove la mettono alla prova scrivendo a mano, con due
  richieste nello stesso istante e con due server sullo stesso file.
- `fatture.riferimento` lo scrive un trigger (`'W-' || id`); `fatture.chiave` (unica, NULL finche' non e' emessa) e
  `fatture_ricevute.chiave` (unica) contro i doppioni. `conti_un_predefinito`: un solo predefinito. `impegni_occorrenza`
  (una occorrenza per giorno per serie) e `impegni_proposta` (una proposta per periodo). `movimento_abbinamenti` ha il
  CHECK "uno solo fra fattura, ricevuta, impegno" e `importo > 0`; `movimenti.importo > 0`.
- In piu' dell'accordo, perche' servivano: `fattura_righe.importo_sorgenti` ("era 317,88"), `fatture_ricevute.motivo`
  (dell'annullamento). `letture_xml` non va nel registro; i file in attesa stanno in `<dati>/letture/<id>/` e si tolgono
  dopo un'ora (alla lettura, alla conferma e ogni minuto nella pianificazione del server). Gli impegni ricorrenti si
  allungano ogni notte (`[impegni] N scadenze nuove` nel log).
- Nel registro le tabelle nuove si chiamano come qui sopra (tranne `letture_xml`); le note di §12 di fase4.md
  (`"passata al programma"`, `"tornata in bozza"`, `"bozza scartata"`, `"emessa dall'XML ..."`, `"emessa: numero scritto
  a mano"`, `"dalla fattura 45/2026 (W-13)"`, `"stornato dalla nota di credito 3/2026"`, `"scartata dallo SDI"`,
  `"fatturata fuori da Wisper"`, `"regole confermate dal commercialista il ..."`, `"regole cambiate: la conferma del
  commercialista non vale più"`, `"movimento annullato: ..."`). Senza `costi`, nel prima/dopo mancano anche le colonne
  dei soldi nuove.
- **I file d'esempio** (dati inventati) sono in `server/prove/xml/` e si rifanno con `node server/prove/xml/genera.js`.

**Correzioni del 22/10/2026, dopo le prove di telefono e computer.**
- `leggiXml` scarta l'XML da completare preparato da Wisper (numero `BOZZA` o vuoto) con il motivo "È l'XML da completare
  preparato da Wisper, non una fattura emessa: importa l'XML che ti dà il programma dopo averla emessa"; `segnaEmessa`
  rifiuta il numero `BOZZA` ("Numero: BOZZA non è un numero di fattura, scrivi quello che ha dato il programma").
- Ogni fattura ha `daRestituire` (euro): quanto il cliente ha pagato in più dopo una nota di credito (incassato + note
  emesse − netto, se positivo). Finché è sopra zero la Dashboard ha la voce urgente "Fattura 52/2026: 300,00 da
  restituire o compensare" (`tipo: fattura`, collegamento alla fattura); sparisce quando l'incasso si annulla o si
  registra la restituzione.

### 15.20 Decisioni prese dove l'accordo non diceva

- **Un gruppo torna da fatturare solo se manca per intero dall'XML.** fase4.md §9.3 dice che "i gruppi di
  righeMancanti tornano da fatturare": ma un mese di rapportini e' un gruppo di tre righe, e se nell'XML ne manca una
  sola liberare tutto il gruppo farebbe fatturare due volte le ore gia' fatturate. Scelta piu' sicura per i soldi: si
  liberano (e si propongono spuntati) solo i gruppi con **tutte** le righe mancanti; gli altri restano fatturati con un
  avviso, e la parte mancante si fattura con una riga libera.
- **Note di credito**: un gruppo si libera se la nota storna **ogni** sua riga per intero (con `tutta`: tutti i gruppi).
  Una nota che copre tutto il totale annulla la fattura ma libera solo i gruppi stornati o scelti (come dice §7.1); per
  una TD04 importata senza bozza e totale si propongono tutti i gruppi gia' spuntati (si possono togliere). Una nota non
  storna piu' del totale della fattura, contando le altre note vive o emesse.
- **Lo scarto dello SDI** riporta la fattura a pronta togliendo anche numero, chiave e file dell'XML scartato (resta tra
  i file e nel registro): cosi' l'XML corretto, che di solito ha lo stesso numero, si riabbina senza sembrare un doppione.
  Una nota scartata dallo SDI rimette le sorgenti alla fattura (se nel frattempo non sono finite in un'altra).
- **Le spese di un rapportino vanno con lui** (anche scegliendone una sola); da sole solo se il rapportino e' di una
  commessa a corpo, e solo con il rapportino firmato o inviato. La regola della fase 3 che allinea le spese al loro
  rapportino non tocca piu' la data di fatturazione di una spesa che sta in una fattura sua.
- **Mandare il riepilogo** (`inviaEmail`) di rapportini che stanno in una fattura: l'email parte, ma non si segnano
  inviati (cambiare lo stato di una cosa riservata e' bloccato da §7.3).
- **"scaduto" non e' tra i campi dei soldi** (§11 lo elencava): e' gia' il si'/no dei preventivi, e toglierlo li'
  avrebbe cambiato la fase 2 per chi ha i preventivi senza i soldi. Il "scaduto" in euro sta solo dove i soldi si vedono.
- **IBAN**: intero nel modello solo per chi scrive le fatture; chi legge e basta lo vede coperto (`"IT…3456"`) e
  nell'XML non c'e'. Nelle risposte delle fatture le rate non portano l'IBAN.
- **Regole fiscali**: cambiarle toglie la conferma solo se il valore cambia davvero (risalvare lo stesso no);
  `REGOLE_FISCALI_CONFERMATE` non si scrive da Impostazioni.
- **Le proposte di Wisper** si aggiornano finche' non si confermano; **cambiare** una proposta (`salvaImpegno`) la
  conferma, cosi' l'aggiornamento automatico non riscrive quello che ha scritto una persona; una tolta dalla persona non
  torna.
- **Impegni ricorrenti**: ogni N mesi o anni (non giorni o settimane: tributi e affitti non ne hanno bisogno);
  `future`/`tutte` riportano solo i campi cambiati, non tutti quelli dell'occorrenza su cui si e' toccato.
- **`segnaFatturataFuori`** ha `annulla: true` (l'accordo non aveva un modo per correggere un segno sbagliato su spese,
  ore e scadenze).
- **Causale proposta**: conta il gruppo del compenso (un acconto con una spesa anticipata accanto resta "40% a fine
  progetto, commessa 26ST003").
- **Testi**: "1 ora" e non "1 ore"; i km nella riga del rapportino solo se rimborsati; la riga dei km del mese che non
  torna al centesimo diventa a corpo con i km nella descrizione.
- **Dati di esempio**: il PR/2026/012 rev. 1 adesso e' **accettato** (con la DiRi: 3.800 euro) ed e' il contratto della
  commessa 26ST003, come nel prototipo della fase 4: non e' piu' "inviato, scade fra 6 giorni" (le prove della fase 2
  che lo usavano provano una sua copia). Elettrodinamica e Rossi hanno partita IVA e indirizzo di fatturazione; ci sono
  Mario Bianchi (C003, privato) e due fornitori (F003 Ing. Paolo Verdi, F004 Luce e Gas Esempio Spa); 26ST002 e' "misto";
  i rapportini sono 13 (i sei di settembre di Elettrodinamica, RAP/2026/0007-0012, e il collaudo di Rossi,
  RAP/2026/0013). Le fatture W-11...W-15 hanno gli id del prototipo.
- **Non provato**: la validazione dell'XML da completare con lo schema ufficiale FPR12 1.2.3 (serve scaricare lo schema
  da fatturapa.gov.it: da fare una volta, con il permesso di Andrea, per esempio con `lxml`, che sul PC c'e'); l'ordine
  degli elementi e' controllato contenitore per contenitore contro lo schema nelle prove di `fatturapa.test.js`. Le
  regole fiscali restano da confermare col commercialista (fase4.md §15), e il programma di Manuel da sapere (§8.4).

## 16. Fase 5: le risposte, campo per campo

Documenti, ticket e assistenza (accordo in [`fase5.md`](fase5.md), ricerca in [`ricerca-fase5.md`](ricerca-fase5.md),
migrazione `005-documenti-ticket`, server 0.8.0). Valgono le regole comuni della §12.1 (`ok`, `permesso:false`, date
`"2026-10-22"`, istanti `"2026-10-22T12:55:16"` in ora italiana senza fuso, le azioni che scrivono vogliono una POST) e
quelle della §15.1 sui soldi. Gli esempi sono le risposte vere del server di prova (`node server/src/avvio.js --prova
--porta-condivisione <porta> ...`, 22/10/2026 alle 12:55), accorciate dove un elenco si ripete. Nei dati di esempio i
ticket aperti e le scadenze sono contati da adesso (la Dashboard ha sempre l'urgente di stamattina); i ticket chiusi
hanno le date del prototipo.

### 16.1 Regole comuni della fase 5

- **Moduli.** Archivio, revisioni, collegamenti, categorie, modelli e copie dei PDF mandati sono del modulo `documenti`
  (voce 11): leggere 1, scrivere 2. Ticket, interventi, storico dell'impianto, statistiche e contratti sono del modulo
  `ticket` (voce 12): leggere 1, scrivere 2. Le **scadenze** si leggono con `documenti` 1 **o** `ticket` 1 (arrivano
  quelle che uno vede); per scriverle decide la scadenza: quelle dei contratti (tipo `manutenzione` o `contratto`, o con
  `idContratto`) vogliono `ticket` 2, le altre `documenti` 2. `storicoImpianto` vuole `clienti` 1 **o** `ticket` 1.
  Senza nessuno dei due: `"Non hai il permesso per vedere le scadenze: chiedi al titolare"` (o `"... vedere gli
  impianti ..."`), `permesso:false`. `spazio` vuole `amministrazione` 1; `salvaCategoria`, `salvaTestoModello` e
  `svuotaCestino` vogliono `amministrazione` 2.
- **Ruoli**: nessun valore nuovo (architettura §3): titolare e amministrazione `documenti` 2 e `ticket` 2;
  collaboratore `documenti` 1 e `ticket` 2; lettura 1 e 1. Le regole fini (chi chiude, chi approva, cosa vede il
  collaboratore) sono in §16.19.
- **Campi dei soldi nuovi** (spariscono, chiavi comprese, per chi non ha `costi`): `canone`, `tariffaExtra`,
  `prezzoCorpo`, `importoTicket`, `costoTicket`, `rende` e le colonne `prezzo_corpo`, `tariffa_extra`; `importo`,
  `costo`, `fatturato` e `totale` c'erano già. Quindi senza `costi`: `somma` del ticket senza `costo` e `importo`, le
  rate del contratto senza `importo`, le statistiche senza `costo` e `fatturato`. Unica eccezione: `totale` delle
  statistiche dei ticket è un riassunto di conte e resta (dentro, `costo` e `fatturato` no).
- **Gli id.** `idTicket` è sempre l'**id interno** (intero) e `ticket` il **numero** (`"TK/2026/0014"`). Le azioni con
  `id`/`idTicket` di un ticket accettano anche il numero o l'`idLocale` di un ticket nato senza rete. `idContratto` è
  l'id interno (`contratto {id}` accetta anche `"CA/2026/002"`). Documenti, revisioni, scadenze, categorie e
  condivisioni hanno id interi; i file hanno id di testo come prima.
- **Le parole fisse** arrivano pronte dal server (`statoVisto`, `statoDettaglio`, `tipoNome`, `prioritaNome`,
  `origineNome`, `fatturazioneNome`, `ritardo`, `collegamentoNome`, `cronologia`, le voci della Dashboard): le app le
  mostrano come sono.
- **Non collegato**: sfogliare OneDrive e Google Drive da dentro Wisper (fase 8), WhatsApp e il portale come origine dei
  ticket (fase 7), il link che scade finché `CONDIVISIONE_INDIRIZZO` è vuoto (`nonCollegato: true`, §16.7). Nessuna
  azione finge di farli.
- **Senza rete**: `salvaTicket` e `salvaDocumento` accettano `idLocale` (ripetuti tornano lo stesso, con
  `giaArrivato: true`), `/carica` e `caricaFile` l'`idFile`, `salvaRapportino` l'`idLocaleTicket` di un ticket nato
  senza rete. Le azioni di stato ripetute uguali (prendi, sospendi con lo stesso motivo, riprendi, risolvi, annulla,
  respingi con lo stesso motivo, chiudi con lo stesso modo) tornano `ok` senza rifare niente.
- `io` e `/salute` dicono `versioneServer`/`versione` `"0.8.0"`; lo schema del database è 5.

### 16.2 Cosa cambia nelle azioni di prima

- **`io.interfaccia`** ha in più (vero, Manuel): `"puoApprovareDocumenti": true, "puoChiudereTicket": true,
  "condivisioneCollegata": false, "fileMaxMb": 50`. Per il collaboratore (Marco) i primi due sono `false`.
  `condivisioneCollegata` è `true` solo con `CONDIVISIONE_INDIRIZZO` scritto.
- **`anagrafiche.impostazioni`** ha in più (si cambiano con `salvaImpostazioni`): `FILE_MAX_MB` (50),
  `SPAZIO_AVVISO_MB` (10240), `SPAZIO_MINIMO_MB` (2048), `COPIA_FUORI_MAX_MB` (25), `EMAIL_ALLEGATI_MAX_MB` (15),
  `COPIA_INVIATI` (true), `CONDIVISIONE_INDIRIZZO` (""), `CONDIVISIONE_GIORNI` (14), `PREAVVISO_GIORNI` (60),
  `ANTICIPO_TICKET_GIORNI` (30), `TICKET_TEMPI`
  (`{"urgente":{"presa":1,"intervento":4},"alta":{"presa":2,"intervento":24},"normale":{"presa":8,"intervento":72},"bassa":{"presa":24,"intervento":240}}`,
  ore di calendario dall'apertura).
- **`anagrafiche.numerazioni`** ha in più (vero): `{"tipo": "contratto", "formato": "CA/{AAAA}/{NNN}", "annuale": true,
  "ultimo": 4, "prossimo": "CA/2026/003"}` e `{"tipo": "ticket", "formato": "TK/{AAAA}/{NNNN}", "annuale": true,
  "ultimo": 16, "prossimo": "TK/2026/0017"}`. Ripartono ogni anno: il numero è il più alto già usato in quell'anno + 1, i
  buchi non si riusano (`ultimo` è l'ultimo segnato, di qualunque anno). Il contratto prende l'anno di `dal` (uno che
  parte nel 2027 è `CA/2027/001`), il ticket quello di `apertoIl`. Si cambiano in Amministrazione › Numerazioni come le
  altre (`prossimo`).
- **Una sede o impianto** (`anagrafiche.sedi`, `salvaSede`) ha in più (vero, sede 4): `"categoria": "cabina_mt",
  "categoriaNome": "Cabina MT", "sedePadreId": null, "matricola": "TR-2014-0571", "potenza": "630 kVA", "tensione": "15 kV
  / 400 V", "messaInServizio": "2014-05-20", "ambiente": "ordinario", "referenteId": 4, "datiTecnici": "Trasformatore in
  resina, due scomparti MT"`. `categoria`: `cabina_mt`, `quadro`, `terra`, `scariche`, `fotovoltaico`, `automazione`,
  `illuminazione`, `altro` o `""` (errore `"Categoria: cabina_mt, quadro, terra, ..."`); `ambiente`: `ordinario`,
  `cantiere`, `medico`, `incendio`, `esplosione` o `""` (propone la periodicità DPR 462, §16.10; errore `"Ambiente:
  ordinario, cantiere, ..."`); `sedePadreId` e `referenteId` dello stesso cliente (`"Sede: scegli una sede dello stesso
  cliente"`, `"Referente: scegli un referente dello stesso cliente"`). Gli altri sono testo libero (la data `aaaa-mm-gg`).
- **Una commessa** ha in più `"idContratto": 2` (o `null`): il contratto di assistenza di cui è la commessa.
- **Un rapportino** ha in più `"idTicket": 17, "numeroTicket": "TK/2026/0017", "ticketAperto": true, "nonSiFattura":
  ""` (vero). **`ticket` resta il campo di testo di sempre** (quello stampato nel PDF): col ticket e il campo vuoto il
  server ci scrive `"{numero}"` o `"{numero} · rif. {rifCliente}"` (vero: `"ticket": "TK/2026/0017 · rif. Buono 88"`); se
  il tecnico ci ha scritto qualcosa, resta il suo. `nonSiFattura` è `"Nel contratto CA/2026/002"` o `"Non si fattura"`
  per un ticket chiuso così, se no `""`. `salvaRapportino {rapportino: {..., idTicket | idLocaleTicket}}` lo lega (stesso
  cliente, ticket non chiuso, che chi scrive vede). Errori: `"Ticket TK/2026/0099 non trovato"`, `"Il ticket
  TK/2026/0012 è chiuso: riaprilo per aggiungere un rapportino"`, `"Il ticket è di Rossi Impianti Srl, il rapportino di
  Batokyo Srl"`, `"Il rapportino RAP/2026/0016 è già del ticket TK/2026/0012: toglilo prima da lì"`, e i blocchi della
  fase 4 se il ticket è in una fattura. Filtro nuovo `idTicket` in `rapportini`. Un rapportino nuovo su un ticket
  `aperto` lo porta `in_carico` (responsabile chi l'ha scritto, se non c'era) e rifà `interventoIl`; la firma scrive
  nella cronologia del ticket `"Rapportino RAP/2026/0014 firmato da Mario Bianchi"`.
- **Un'attività** può essere `tipo: "intervento"` (errore nuovo: `"Tipo: attivita, appuntamento, sopralluogo o
  intervento"`) e ha in più `"idTicket": 17, "ticket": "TK/2026/0017"` (o `null` e `""`); filtro `ticket` (id o numero)
  in `attivita`; `salvaAttivita` accetta `idTicket`. Il calendario la mostra con la pillola Ticket e il tocco apre il
  ticket. Gli interventi **non** contano negli appuntamenti della Dashboard della fase 2 (hanno la voce loro, §16.18).
  Segnarla fatta o annullarla rifà `interventoIl` del ticket.
- **Ore e spese** hanno in più `idTicket` e `ticket` (numero); filtro `idTicket` (o `ticket`) in `ore` e `spese`;
  `salvaOre {riga: {..., idTicket}}` (senza commessa propone quella del ticket) e `salvaSpesa {spesa: {..., idTicket}}`.
  Le spese di un rapportino hanno il ticket del rapportino (non si sceglie). Errori: `"Il ticket TK/2026/0010 è chiuso:
  riaprilo per aggiungere ore"` (e `"... spese"`), e i blocchi della fase 4 se il ticket è in una fattura.
- **`documenti {idCommessa}`** (la chiamata delle versioni vecchie, con solo `idCommessa`) torna come prima (vero):
  `{"ok": true, "cartella": "", "documenti": [{"id": "R_ZROaLCyCRb2D7WC13w2QpcLMm8", "nome": "Foto quadro prima dei
  lavori.png", "url": "/file/R_ZROaLCyCRb2D7WC13w2QpcLMm8", "mime": "image/png", "data": "2026-10-22T12:54:47"}, ...]}`,
  letta dall'archivio (i documenti `file` di quella commessa, revisione valida). Con `archivio: true` o con **qualunque**
  filtro della fase 5 (`testo`, `idCategoria`, `idCliente`, `idSede`, `idTicket`, `idContratto`, `origine`, `stato`,
  `scadenza`, `daClassificare`, `archiviati`, `pagina`) è l'elenco nuovo di §16.4. Le app nuove mandano sempre
  `archivio: true`.
- **`caricaFile {tipo: "documento", idCommessa, ...}`** (versioni vecchie) mette il documento nell'archivio, categoria
  "Da classificare", rev. 0 approvata. **Ogni `caricaFile`** controlla ora il tipo sui primi byte (§16.3) e lo spazio sul
  disco (§16.9). Tipo nuovo `ticket` (§16.13).
- **`daFatturare`, `preparaFattura`, `confermaXml` (collegabili), `segnaFatturataFuori`**: tipo `ticket` (§16.14).
- **`inviaEmail`, `inviaPreventivo`, `inviaAvviso`**: tengono la copia del PDF (§16.7).
- **`copie`**: l'esito `fuori` è `"ok · 12 file · 3 restano per domani"` (§16.9).
- **`cestino`** non mostra più i file tolti per sempre; `ripristinaFile` di uno di loro: `"Il file X è stato tolto per
  sempre col cestino svuotato"`.
- **`/file/<id>`**: un documento che uno non vede → 403 (come un file non suo); una revisione superata si scarica col
  nome `"Schema unifilare cabina rev1 (rev. 1, superata).pdf"`; sempre con `X-Content-Type-Options: nosniff`.

### 16.3 `/carica`: un file in byte

`POST /carica?nome=<nome>&mime=<mime>&idFile=<idFile>&per=<documento|ticket>` con `Authorization: Bearer <token>` (lo
stesso di `/exec`, con le stesse intestazioni facoltative `X-Wisper-Disp`, `X-Wisper-Disp-Nome`, `X-Wisper-App` per il
registro degli accessi) e il file nel corpo così com'è (`application/octet-stream`: niente base64, niente multipart).
Risposte come `/exec`: HTTP 200 con `ok` true/false (405 solo se non è una POST). Vero:
```json
{"ok": true, "file": {"id": "qfPF3gZg4GsuwKkLsHfOlgCkaq7l", "nome": "Schema unifilare cabina rev4.pdf", "mime": "application/pdf",
 "byte": 24, "sha256": "e0f50421a8fb64cb3e34e87b0d780685790026df206a3780859875d5693850bd"}}
```
- **Come lavora**: scrive su disco mentre arriva (`<dati>/file/<id>.scrivendo`, poi rinomina), conta i byte e fa lo
  SHA-256 per strada, quindi la memoria non dipende dalla grandezza del file. Oltre `FILE_MAX_MB` smette di scrivere,
  legge e butta il resto della richiesta (chi manda riceve la risposta, non una connessione caduta) e non lascia niente
  sul disco: `{"ok": false, "errore": "Il file è più grande di 50 MB: non si carica"}`; con un `Content-Length` già più
  grande risponde subito. Interrotto: `"Il file non è arrivato tutto: riprova"`; vuoto: `"File vuoto"`.
- **Permesso**: `per=documento` (di base) vuole `documenti` 2, `per=ticket` vuole `ticket` 2. Vero, utente lettura:
  `{"ok": false, "errore": "Non hai il permesso per caricare documenti: chiedi al titolare", "permesso": false}` (per i
  ticket `"... caricare le foto dei ticket ..."`). Token scaduto: `{"ok": false, "errore": "Accesso scaduto: entra di
  nuovo", "accesso": false}`. Un altro `per`: `"Per: documento o ticket"`.
- **Il tipo** si controlla sui primi 512 byte (`riconosciTipo` e `tipoDaSalvare` in `src/documenti.js`). Programmi,
  script e pagine web (anche SVG) non passano mai, qualunque cosa dica `mime` (vero: `"Questo file non si carica: è un
  programma per Windows: i programmi non si caricano"`; poi `"... è uno script: gli script non si caricano"`, `"... è
  una pagina web: per una pagina web si incolla il collegamento"`). Un file che si dice PDF o foto deve esserlo: `"Il
  file dice di essere un PDF ma dentro non lo è: controlla di aver scelto il file giusto"`, `"Il file dice di essere una
  foto ma dentro non lo è: controlla di aver scelto il file giusto"` (vero). Gli altri tipi (DWG, ZIP, documenti Office,
  testo, XML, video) passano; `mime` salvato è quello riconosciuto quando i byte lo dicono, mai un tipo che il browser
  eseguirebbe.
- **Lo spazio** si controlla prima di cominciare (§16.9: sotto `SPAZIO_MINIMO_MB` no, con `"spazio": true`).
- **`gia`**: c'è quando lo stesso SHA-256 è già una revisione (non tolta) di un documento non archiviato che chi chiede
  vede: `"gia": {"idDocumento": 4, "titolo": "Schema unifilare cabina MT", "revisione": 2}`. Il file è arrivato lo stesso:
  l'app chiede "Questo file c'è già: «Schema unifilare cabina MT» rev. 2. Lo carico lo stesso?" e, se no, non lo lega.
- **Lo stesso `idFile`** ripetuto dalla stessa persona (la coda del telefono) torna lo stesso file senza riscriverlo
  (vero: la seconda risposta ha lo stesso `id`); il corpo si legge e si butta.
- **Il file nasce `caricato`** e non si vede da nessuna parte finché non lo lega `salvaDocumento {origine: "file",
  idFile}` (rev. 0), `caricaVersione {id, idFile}` o `caricaFile {tipo: "ticket", idTicket, idFileCaricato}`. Lo lega
  solo chi l'ha caricato (`"File X non trovato: caricalo di nuovo"`). Mai legato: nel cestino dopo 24 ore (controllo ogni
  minuto, registro `"caricato e mai legato: nel cestino dopo 24 ore"`).
- **Il base64 resta**: `caricaFile` con `base64` funziona come prima per le versioni vecchie e per foto e firme dei
  rapportini e delle spese (che restano così anche nelle app nuove).

### 16.4 L'archivio: l'elenco e un documento

`documenti {archivio: true, testo?, idCategoria?, idCliente?, idCommessa?, idSede?, idTicket?, idContratto?, origine?:
"file"|"collegamento"|"inviato", stato?: "validi"|"da_approvare"|"respinti"|"tutti", scadenza?: "entro"|"scadute",
daClassificare?, archiviati?, pagina?}` (documenti 1), 50 per pagina, i più recenti prima (con `testo`: prima i titoli
che cominciano con la prima parola). Vero:
```json
{"ok": true, "pagina": 1, "pagine": 1, "quanti": 13,
 "conteggi": {"daApprovare": 1, "inScadenza": 1, "scaduti": 0, "daClassificare": 3},
 "documenti": [
  {"id": 1, "idLocale": "", "titolo": "Schema unifilare cabina MT", "idCategoria": 1, "categoria": "Progetti e schemi", "daClassificare": false,
   "origine": "file", "collegamentoTipo": "", "collegamentoNome": "", "cartella": false, "principale": false, "url": "/file/rg9wqtHsiu1PnN2_9VSLJShE3gEb",
   "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idCommessa": "26ST005", "commessa": "Assistenza Manutenzione cabina MT Acme",
   "idSede": 4, "impianto": "Cabina MT Acme", "idTicket": null, "ticket": "", "idContratto": null, "contratto": "", "riferimento": "",
   "dataDocumento": "2026-06-18", "revisione": 2, "statoVisto": "Valida", "daApprovare": 3, "nomeFile": "Schema unifilare cabina rev2.pdf",
   "mime": "application/pdf", "byte": 99, "scadenza": null, "vede": "tutti", "archiviato": false, "puoScrivere": true,
   "creato": "2026-10-22T12:54:46", "modificato": "2026-10-22T12:54:47"},
  {"id": 9, "titolo": "Schemi elettrici archivio 2019", "idCategoria": 13, "categoria": "Documenti dello studio", "origine": "collegamento",
   "collegamentoTipo": "percorso", "collegamentoNome": "Cartella del computer", "cartella": true, "principale": false,
   "url": "\\\\SERVER-STUDIO\\Archivio\\2019\\Schemi", "revisione": null, "statoVisto": "Collegamento", "nomeFile": "", "mime": "", "byte": null, "...": "..."},
  {"id": 7, "titolo": "Certificato di taratura del misuratore di terra", "categoria": "Certificati", "riferimento": "LAT 0000/25",
   "scadenza": {"id": 6, "data": "2026-11-15", "statoVisto": "Scade fra 24 giorni", "giorni": 24, "ogniMesi": 12}, "...": "..."}],
 "daWisper": []}
```
- `statoVisto`: `Valida` (c'è una revisione approvata), `Da approvare` (nessuna approvata, una in attesa), `Respinta`
  (nessuna approvata, l'ultima respinta), `Collegamento`, `Archiviato`. `revisione` = il numero della revisione che si
  apre (la valida; senza valida l'ultima da approvare); `daApprovare` = il numero della revisione in attesa (o `null`),
  anche quando c'è una valida: la riga "rev. 3 da approvare". `url`, `nomeFile`, `mime`, `byte` sono della revisione che
  si apre; per un collegamento `url` è l'indirizzo com'è stato incollato.
- `daClassificare`: la categoria è quella di sistema "Da classificare". `cartella` e `principale` hanno senso solo per i
  collegamenti (la cartella principale di una commessa o di un cliente, una sola).
- `scadenza` (o `null`): la scadenza del documento, breve (`statoVisto` come §16.10).
- `conteggi` sono contati su tutti i documenti che uno vede (non solo la pagina, e anche col filtro `stato`):
  `daApprovare` conta, per chi approva, tutti i documenti con una revisione in attesa, per gli altri solo quelli con una
  **loro** revisione in attesa; `inScadenza` = scadenza aperta nel preavviso; `scaduti`; `daClassificare`.
- `stato`: `validi` (con una valida, o collegamenti), `da_approvare` (come il conteggio), `respinti` (con una revisione
  **mia** respinta). Errori: `"Stato: validi, da_approvare, respinti o tutti"`, `"Scadenza: entro o scadute"`,
  `"Origine: file, collegamento o inviato"`.
- **La ricerca** (`testo`): tutte le parole, senza badare a maiuscole, accenti e spazi doppi (`pulisciRicerca`), dentro
  titolo, descrizione, parole chiave, riferimento, nome del file, cliente, codice e descrizione della commessa, impianto,
  numero del ticket e del contratto. Non dentro i file.
- `daWisper` (solo con `idCliente`, `idCommessa` o `idSede`): quello che Wisper fa già, come righe che aprono la loro
  pagina, dalle più recenti: `{"tipo": "preventivo"|"rapportino"|"fattura"|"contratto", "id": ..., "titolo":
  "Rapportino RAP/2026/0014", "dettaglio": "21/10/2026 · Cambiati i fusibili ... · firmato", "data": "2026-10-21",
  "pagina": "rapportino"}`. Preventivi non sostituiti (con preventivi 1), rapportini firmati o oltre (rapportini 1; il
  collaboratore i suoi), fatture emesse o annullate (fatturazione 1 e `costi`), contratti (ticket 1). Non sono copie.
- **Chi non vede** un documento (`vede: "costi"` senza `costi`, `"riservati"` senza `riservati`) non lo trova da
  nessuna parte: né qui, né nei conteggi, né in `documento` (`"Documento 6 non trovato"`), né in `/file/<id>` (403), né
  in `gia`. Vero: Marco vede 13 documenti su 14 (manca "Contratto CA/2026/002 firmato", `vede: "costi"`).

`documento {id}` (documenti 1) → la voce più (vero, lo schema della cabina):
```json
{"ok": true, "documento": {"id": 1, "titolo": "Schema unifilare cabina MT", "...": "come nell'elenco",
 "descrizione": "", "parole": "unifilare MT cabina protezioni",
 "versioni": [
  {"id": 4, "numero": 3, "statoVisto": "Da approvare", "nomeFile": "Schema unifilare cabina rev3.pdf", "nomeDaScaricare": "Schema unifilare cabina rev3.pdf",
   "mime": "application/pdf", "byte": 99, "url": "/file/Paou4Ezp8FUVNjv9NIuWzQNeo4O9", "nota": "Aggiunto il trasformatore di riserva",
   "caricataDa": "Marco Collaboratore", "caricataIl": "2026-10-22T12:54:47", "decisaDa": "", "decisaIl": "", "motivoRifiuto": "", "puoTogliere": false},
  {"id": 3, "numero": 2, "statoVisto": "Valida", "nomeFile": "Schema unifilare cabina rev2.pdf", "nota": "Nuove protezioni SPG",
   "caricataDa": "Manuel Gasparotto", "decisaDa": "Manuel Gasparotto", "decisaIl": "2026-10-22T12:54:47", "...": "..."},
  {"id": 2, "numero": 1, "statoVisto": "Superata", "nomeFile": "Schema unifilare cabina rev1.pdf",
   "nomeDaScaricare": "Schema unifilare cabina rev1 (rev. 1, superata).pdf", "nota": "Prima emissione dopo il rilievo", "...": "..."},
  {"id": 1, "numero": 0, "statoVisto": "Superata", "...": "..."}],
 "condivisioni": [],
 "cronologia": [{"quando": "2026-10-22T12:54:46", "chi": "Manuel Gasparotto", "testo": "Aggiunto da Manuel Gasparotto"},
  {"quando": "2026-10-22T12:54:46", "chi": "Manuel Gasparotto", "testo": "rev. 0 caricata da Manuel Gasparotto"},
  "...", {"quando": "2026-10-22T12:54:47", "chi": "Marco Collaboratore", "testo": "rev. 3 caricata da Marco Collaboratore"}],
 "puoApprovare": true, "mieRespinte": []}}
```
- `versioni`: dalla più nuova, senza le tolte. `statoVisto`: `Valida`, `Superata` (approvata più vecchia della valida),
  `Da approvare`, `Respinta`. `puoTogliere`: solo chi l'ha caricata, solo da approvare o respinta, con documenti 2.
- `condivisioni` (solo con documenti 2): `{id, perChi, scade, revocata, scaduta, aperture, ultimaApertura, creata}`; il
  link intero non c'è mai (§16.7).
- `cronologia` (dal registro, frasi pronte, dalla più vecchia): `"Aggiunto da ..."`, `"Entrato nell'archivio dai
  documenti della commessa"` (migrazione), `"rev. 3 caricata da ..."`, `"rev. 2 approvata da ..."`, `"rev. 3 respinta da
  ...: {motivo}"`, `"rev. 3 di nuovo da approvare (...)"`, `"rev. 3 tolta da ..."`/`"rimessa"`, `"Cambiato da ..."`,
  `"Collegamento cambiato da ..."`, `"Archiviato da ..."`/`"Tolto dall'archivio da ..."`, `"Mandato a {email} da ..."`,
  `"Link per {per chi} fino al {gg/mm/aaaa}"`, `"Link revocato da ..."`.
- `puoApprovare`: chi approva, con una revisione in attesa, documento non archiviato. `mieRespinte`: `[{numero, motivo}]`
  delle mie revisioni respinte (il motivo arriva a chi l'ha caricata).
- Un collegamento ha in più `righe`: `["Le revisioni le tiene OneDrive"]` (OneDrive, SharePoint, Google Drive) o
  `["Si apre dal computer dello studio"]` (percorso); per un sito `[]`.

### 16.5 Scrivere un documento, i collegamenti, archiviare

`salvaDocumento {documento: {id?, idLocale?, titolo, idCategoria, descrizione?, parole?, riferimento?, dataDocumento?,
idCliente?, idCommessa?, idSede?, idTicket?, idContratto?, vede?, origine?, url?, cartella?, principale?, idFile?, nota?,
scadenza?: {data, ogniMesi?, preavvisoGiorni?, tipo?} | null}}` (documenti 2) → `{"ok": true, "documento": {...come
documento...}, "chiudeScadenza": null | {"id": 5, "titolo": "Verifica impianto di terra (DPR 462)", "data": "2027-01-12"}}`.
- **Nuovo `file`**: `idFile` è il file di `/carica` (diventa la rev. 0, approvata o da approvare come §16.6) oppure la
  **foto di un ticket** ("Metti nell'archivio": resta anche foto del ticket, e nel ticket la foto ha `idDocumento`;
  errori `"La foto è del ticket TK/2026/0012"`, `"Questa foto è già nell'archivio: «...»"`). Senza `idFile`: `"Carica il
  file o incolla il collegamento"`.
- **Nuovo `collegamento`**: con `url` (anche senza `origine`). Il server riconosce il tipo (`tipoCollegamento`, §16.21),
  propone `cartella` (si cambia mandandola) e salva l'indirizzo com'è (tolti gli spazi in fondo). Il file non si copia e
  non si legge. Vero:
  ```json
  {"ok": true, "documento": {"id": 14, "titolo": "Cartella del cliente Batokyo", "origine": "collegamento", "collegamentoTipo": "onedrive",
   "collegamentoNome": "OneDrive", "cartella": true, "principale": true, "url": "https://esempio-my.sharepoint.com/:f:/g/personal/studio/Clienti/Batokyo",
   "revisione": null, "statoVisto": "Collegamento", "versioni": [], "condivisioni": [], "righe": ["Le revisioni le tiene OneDrive"],
   "cronologia": [{"quando": "2026-10-22T12:55:16", "chi": "Manuel Gasparotto", "testo": "Aggiunto da Manuel Gasparotto"}], "...": "..."},
   "chiudeScadenza": null}
  ```
  Un indirizzo che non va (vero, con `ftp://`): la frase `Collegamento: incolla un indirizzo che comincia con https:// o
  un percorso come \\server\cartella`. Cambiare l'indirizzo è un `salvaDocumento` con `url` (registro `"collegamento
  cambiato"`).
- **`principale`**: la cartella principale di una commessa (o, senza commessa, di un cliente), una sola anche nel
  database (indici `documenti_cartella_commessa`, `documenti_cartella_cliente`). Errori: `"Solo una cartella può essere
  la cartella principale"`, `"La commessa 26ST003 ha già la sua cartella: «Cartella della commessa 26ST003»"`, `"Batokyo
  Srl ha già la sua cartella: «...»"`, `"La cartella principale è di una commessa o di un cliente: scegli a cosa è
  legata"`.
- **I legami**: con la commessa e senza cliente il cliente è quello della commessa; con l'impianto, il ticket o il
  contratto, il loro. Errori: `"L'impianto 4 è di Rossi Impianti Srl, non di Batokyo Srl"`, `"La commessa 26ST003 è di
  ..., non di ..."`, `"Il ticket TK/2026/0012 è di ..., non di ..."`, `"Il contratto CA/2026/002 è di ..., non di ..."`,
  `"Impianto 99 non trovato"`, `"Commessa X non trovata"`, `"Cliente X non trovato"`, `"Contratto 9 non trovato"`.
- **`vede`**: di base quello della categoria; chi non è titolare non lo mette più basso della categoria (il server lo
  rialza); nessuno mette un documento che non vedrebbe (`"Non hai il permesso per mettere documenti che tu non vedresti:
  chiedi al titolare"`). Errore `"Chi lo vede: tutti, costi o riservati"`.
- **Altri errori**: `"Titolo: scrivi di cosa si tratta"`, `"Categoria: scegli la categoria"`, `"Categoria: «...» non si
  usa più"` (categoria disattivata, per i documenti nuovi), `"Origine: file o collegamento"`, `"Il documento è
  archiviato: ripristinalo prima di cambiarlo"`, `"Non hai il permesso per cambiare i documenti degli altri: chiedi al
  titolare"` (collaboratore con documenti 2: solo quelli creati da lui), lo spazio (§16.9).
- **`scadenza`**: `{data, ogniMesi?, preavvisoGiorni?, tipo?}` crea o cambia la scadenza del documento (titolo
  `"{titolo} scade"`, tipo `polizza` nella categoria Polizze e assicurazioni, se no `documento`); `null` la toglie
  (annullata, motivo `"tolta dal documento"`).
- **`chiudeScadenza`**: per un documento **nuovo** `file` con l'impianto, nella categoria "Verbali di verifica" (o con
  un riferimento), la prima scadenza aperta di una verifica (terra, scariche, protezioni) dello stesso impianto: l'app
  chiede "È la verifica che chiude la scadenza del 12/01/2027?" e, se sì, chiama `faiScadenza {id, data, idDocumento}`.
- **Ripetuto con lo stesso `idLocale`**: lo stesso documento, `"giaArrivato": true`.

`archiviaDocumento {id, archiviato?: true|false, togliScadenza?}` (documenti 2) → il documento: esce dagli elenchi (si
ritrova con `archiviati: true`); `archiviato: false` lo rimette. Con una scadenza aperta, la prima risposta chiede (vero):
`{"ok": false, "errore": "Ha una scadenza aperta il 15/11/2026: la tolgo?", "serveConferma": true, "scadenza": {"id": 6,
"data": "2026-11-15", "statoVisto": "Scade fra 24 giorni", "giorni": 24, "ogniMesi": 12}}`; si richiama con
`togliScadenza: true` (la scadenza si annulla, motivo `"documento archiviato"`) o `false` (resta). Rimettere una cartella
principale controlla che la commessa non ne abbia già un'altra.

### 16.6 Revisioni e approvazione

- `caricaVersione {id, idFile, nota}` (documenti 2) → `{"ok": true, "documento": {...}}`. `nota` obbligatoria dalla
  rev. 1 (`"Scrivi cosa cambia in questa revisione"`). Solo documenti `file` (`"Un collegamento non ha revisioni: le
  tiene OneDrive"`, `"Le copie mandate ai clienti non hanno revisioni"`). Ripetuta col file già legato a quel documento:
  `ok` con `"giaArrivato": true`.
- **Stato della revisione nuova**: `approvata` se la categoria non chiede approvazione o se la carica chi approva;
  altrimenti `da_approvare`. Con `APPROVAZIONE = "tutti"` (fase 3) va in approvazione anche quella del titolare, che
  può approvarla.
- **Valida** = l'approvata non tolta col numero più alto (`versione_valida_id`, rifatta a ogni cambio). Una da approvare
  non sostituisce la valida.
- `approvaVersione {id}`, `respingiVersione {id, motivo}`, `annullaDecisione {id}` (POST; `id` = id della revisione):
  solo chi approva (titolare e amministrazione con documenti 2; gli altri `"Non hai il permesso per approvare i
  documenti: chiedi al titolare"`, `permesso:false`) → il documento. Errori: `"La rev. 2 è già approvata"`, `"Scrivi il
  motivo: arriva a chi l'ha caricata"`, `"La rev. 3 è stata tolta"`, `"Revisione 99 non trovata"`, `"Il documento è
  archiviato: ripristinalo prima di cambiarlo"`. `annullaDecisione` rimette *Da approvare* (anche un'approvata: la valida
  torna la precedente).
- `togliVersione {id, annulla?}` → il documento: solo chi l'ha caricata (`"Non hai il permesso per togliere le
  revisioni caricate da altri: chiedi al titolare"`), solo da approvare o respinta (`"Una revisione approvata non si
  toglie: carica una revisione nuova"`); il file va nel cestino; `annulla: true` la rimette.
- Il motivo del rifiuto arriva nella Dashboard di chi l'ha caricata (§16.18) e in `mieRespinte`.

### 16.7 Mandare e condividere

- `inviaDocumento {id, idVersione?, a, cc?, oggetto?, messaggio?}` (documenti 2, asincrona come `inviaEmail`) →
  `{"ok": true}`. Allegato il file della revisione che si apre (o di `idVersione`), fino a `EMAIL_ALLEGATI_MAX_MB` (`"Il
  file è di 23 MB: per email ne passano al massimo 15"`). Per un collegamento OneDrive, SharePoint, Drive o sito
  l'indirizzo va in fondo al messaggio (la riga "Il cliente lo apre solo se in OneDrive è condiviso anche fuori dallo
  studio" la mostra l'app); per un percorso: `"Un percorso del computer non si può mandare"`. Oggetto e messaggio di
  base: i testi `EMAIL_DOCUMENTO_OGGETTO`/`EMAIL_DOCUMENTO_MESSAGGIO` (§16.8) riempiti. Errori: `"Manca l'indirizzo del
  cliente"`, `"Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)"`, `"Il file non è
  sul NAS: non si può mandare"`, `"Revisione 9 non trovata"`, `"L'email non è partita: ..."` (con `"rete": true` se è
  la rete). Registro `"mandato per email a {email}"`, cronologia del documento.
- **La copia di quello che parte** (`COPIA_INVIATI`, di base sì): gli allegati di `inviaEmail` (rapportini e
  riepiloghi), `inviaPreventivo` e `inviaAvviso` diventano documenti `origine: "inviato"` nella categoria di sistema
  **Mandati ai clienti** (`vede: "costi"`), legati a cliente, commessa (e ticket), titolo = nome del file senza
  estensione, rev. 0 approvata con nota `"mandato a {email} il {gg/mm/aaaa}"`, registro `"copia del PDF mandato a
  {email}"`. Non ferma mai l'email: col disco quasi pieno la copia non si tiene (registro `"copia del PDF mandato a ...
  non tenuta: disco quasi pieno"`).
- `condividiDocumento {id, perChi, giorni?}` (documenti 2). Oggi (vero): `{"ok": false, "errore": "I link per i clienti
  non sono collegati: manda il documento per email", "nonCollegato": true}`, finché `CONDIVISIONE_INDIRIZZO` è vuoto.
  Scritto l'indirizzo (decisione di Andrea, fase5.md §14, domanda 3): `{"ok": true, "link":
  "https://<CONDIVISIONE_INDIRIZZO>/condiviso/<token>", "condivisione": {"id": 3, "perChi": "Rossi Impianti Srl, ufficio
  tecnico", "scade": "2026-11-05", "aperture": 0}}`. Il link intero torna **solo** in questa risposta (nel database c'è
  solo lo SHA-256 del token, 32 byte casuali). Vale `giorni` (da 1 a 90, di base `CONDIVISIONE_GIORNI`: `"Giorni: da 1 a
  90"`) e dà **la revisione valida al momento del link** (una revisione approvata dopo non cambia il link). Errori:
  `"Per chi: scrivi a chi lo mandi"`, `"Il documento non ha ancora una revisione valida"`, `"Un collegamento si condivide
  da OneDrive: il link per i clienti è per i file sul NAS"`. `revocaCondivisione {id}` (documenti 2, `id` della
  condivisione) → il documento.
- **La seconda porta** (`--porta-condivisione <porta>`, sul NAS 8401) risponde **solo** a `GET /condiviso/<token>`
  (pagina minima: nome dello studio, titolo, revisione, **Scarica**) e `GET /condiviso/<token>/scarica` (il file come
  allegato; conta le aperture). Tutto il resto, e un link revocato, scaduto, di un documento archiviato o con
  l'indirizzo non scritto: HTTP 404 con la pagina "Questo link non vale più". `/exec`, `/file`, `/carica` su quella porta
  non ci sono.

### 16.8 Categorie, modelli e testi

- `categorieDocumenti {}` (documenti 1) → vero: `{"ok": true, "categorie": [{"id": 1, "nome": "Progetti e schemi",
  "approvazione": true, "vede": "tutti", "scadenzaMesi": null, "ordine": 1, "attiva": true, "sistema": false,
  "documenti": 3}, ...]}`. Le 16 iniziali: con approvazione Progetti e schemi, Dichiarazioni di conformità,
  Dichiarazioni di rispondenza, Relazioni e collaudi; poi Verbali di verifica, Certificati (scadenza proposta 12 mesi),
  Contratti (`costi`), Polizze e assicurazioni (`costi`, 12 mesi), Corrispondenza, Foto, Manuali e schede tecniche,
  Modelli dello studio, Documenti dello studio; di sistema Mandati ai clienti (`costi`), Da classificare, Documenti
  personali (`riservati`). Chi non vede un livello non vede quelle categorie. `documenti` = quanti, non archiviati.
- `salvaCategoria {categoria: {id?, nome, approvazione, vede, scadenzaMesi, attiva, ordine?}}` (amministrazione 2) →
  `{"ok": true, "categoria": {...}, "categorie": [...]}`. Errori: `"Nome: scrivi il nome della categoria"`, `"Nome: c'è
  già una categoria «Foto»"`, `"Chi la vede: tutti, costi o riservati"`, `"Scadenza proposta: da 1 a 120 mesi"`, `"«Da
  classificare» serve a Wisper: si rinomina, non si toglie"`, `"Categoria 99 non trovata"`. Una categoria disattivata
  resta sui documenti che ce l'hanno.
- `modelli {}` (documenti 1), vero:
  ```json
  {"ok": true,
   "wisper": [{"chiave": "rapportino", "nome": "Rapportino", "impaginazione": "fissa", "testi": [
     {"chiave": "EMAIL_RAPPORTINO_OGGETTO", "nome": "Oggetto dell'email del rapportino", "testo": "Rapportino {rapportino} del {data}",
      "segnaposti": ["rapportino", "data"], "modificato": "2026-10-22T12:54:46", "modificatoDa": ""}, "..."]}, "..."],
   "studio": [{"id": 10, "titolo": "Modulo della dichiarazione di conformità", "categoria": "Modelli dello studio", "...": "voce di documenti"}],
   "segnaposti": ["cliente", "indirizzo_cliente", "referente", "impianto", "indirizzo_impianto", "commessa", "ticket", "contratto", "canone",
    "dal", "al", "scadenza", "ultima_verifica", "oggi", "studio", "tecnico", "rapportino", "data", "periodo", "preventivo", "oggetto", "documento"],
   "lettere": [{"chiave": "LETTERA_VERIFICA_TERRA", "nome": "Lettera \"Verifica impianto di terra\""}, {"chiave": "LETTERA_LIBERA", "nome": "Lettera libera"}]}
  ```
  I modelli di Wisper (`rapportino`, `riepilogo`, `preventivo`, `prospetto`, `avviso`, `lettera`, `contratto`) hanno
  l'impaginazione fissa nel codice (`pc/ui/documenti.js`); si cambiano solo i loro testi: `EMAIL_RAPPORTINO_OGGETTO`,
  `EMAIL_RAPPORTINO_MESSAGGIO`, `EMAIL_RIEPILOGO_OGGETTO`, `EMAIL_RIEPILOGO_MESSAGGIO`, `PREVENTIVO_INTRODUZIONE`,
  `PREVENTIVO_CONDIZIONI` (resta l'impostazione di prima), `EMAIL_PREVENTIVO_OGGETTO`, `EMAIL_PREVENTIVO_MESSAGGIO`,
  `LETTERA_VERIFICA_TERRA`, `LETTERA_LIBERA`, `EMAIL_DOCUMENTO_OGGETTO`, `EMAIL_DOCUMENTO_MESSAGGIO`,
  `CONTRATTO_CONDIZIONI`. I segnaposti dopo `tecnico` servono ai testi delle email che le app scrivevano già. Un messaggio
  vuoto = quello che le app scrivono da sole.
- `salvaTestoModello {chiave, testo}` (amministrazione 2) → come `modelli`. Errori: `"Testo sconosciuto: X"`,
  `"Segnaposto sconosciuto: {cliente_nome}. Si possono usare {cliente}, {indirizzo_cliente}, ..., {tecnico} (e nelle
  email {rapportino}, {data}, {periodo}, {preventivo}, {oggetto}, {documento})"`.
- `componiModello {chiave, idCliente?, idSede?, idCommessa?, idTicket?, idContratto?, idScadenza?}` (documenti 1): il
  testo riempito. Vero (senza `idScadenza`):
  ```json
  {"ok": true, "chiave": "LETTERA_VERIFICA_TERRA", "titolo": "Verifica periodica dell'impianto di terra",
   "testo": "Gentile Batokyo Srl,\nl'impianto di terra di Impianto di terra stabilimento è stato verificato il {ultima_verifica}: la prossima verifica periodica va fatta entro il {scadenza}, come chiede il DPR 462/2001.\n...",
   "mancano": ["{ultima_verifica}", "{scadenza}"],
   "valori": {"oggi": "22/10/2026", "studio": "Studio Tecnico GM", "tecnico": "Manuel Gasparotto", "impianto": "Impianto di terra stabilimento",
    "indirizzo_impianto": "Zona industriale, 36015 Schio (VI)", "referente": "Ufficio tecnico Batokyo", "cliente": "Batokyo Srl",
    "indirizzo_cliente": "Zona industriale 4, 36015 Schio (VI)"}}
  ```
  I segnaposti senza valore restano scritti e sono in `mancano` (l'app li mostra da completare). Gli id si completano a
  vicenda (dalla scadenza l'impianto, il cliente e il contratto; dal ticket la commessa e il contratto...). `{canone}`
  solo con `costi`. `{ultima_verifica}` = il giorno del documento della scadenza o di quella fatta prima. Il PDF lo fanno
  le app col modello `lettera` (o `contratto`, titolo `"Contratto di assistenza CA/2026/002"`).

### 16.9 Spazio sul NAS, cestino e copia fuori casa

- **Prima di ogni file**: lo spazio libero del disco dei dati (`fs.statfsSync`). Sotto `SPAZIO_MINIMO_MB` (2048) non
  passano `/carica`, `salvaDocumento` con un file, `caricaVersione` e `caricaFile {tipo: "documento"}`: `{"ok": false,
  "errore": "Il disco del NAS è quasi pieno (restano 1,6 GB): il file non è stato caricato. Avvisa il titolare", "spazio":
  true}`. Foto e firme dei rapportini, scontrini delle spese, foto dei ticket e allegati delle attività passano fino a
  **200 MB** liberi (fisso); sotto, nessun file. La copia dei PDF mandati non si tiene sotto `SPAZIO_MINIMO_MB` (l'email
  parte lo stesso).
- `spazio {}` (amministrazione 1), vero:
  ```json
  {"ok": true, "disco": {"totaleMb": 475002, "liberoMb": 34745, "avvisoMb": 10240, "minimoMb": 2048}, "file": {"mb": 0, "quanti": 36},
   "perTipo": [{"tipo": "documenti", "nome": "Documenti", "mb": 0, "quanti": 12}, {"tipo": "rapportini", "nome": "Foto e firme dei rapportini", "mb": 0, "quanti": 17},
    {"tipo": "ticket", "nome": "Foto dei ticket", "mb": 0, "quanti": 4}, {"tipo": "inviati", "nome": "Mandati ai clienti", "...": "..."},
    {"tipo": "cestino", "nome": "Cestino", "...": "..."}, {"tipo": "altri", "nome": "Altri file", "...": "..."}],
   "perAnno": [{"anno": 2026, "mb": 0}],
   "piuGrandi": [{"id": "jB34CHfakn0gFRYB34-_cHKkDXXd", "nome": "IT00000000000_00038.xml", "mb": 0, "documento": null, "fuori": "da copiare"}, "..."],
   "fuori": {"ultima": "", "daCopiare": 36, "troppoGrandi": []},
   "cestinoVecchio": {"mb": 0, "quanti": 0, "prima": "2026-07-24"}}
  ```
  (i file d'esempio sono piccoli: `mb` è arrotondato a un decimale). `altri` c'è solo se ci sono file d'altro tipo (XML
  delle fatture, allegati delle attività). `fuori` dei più grandi: `"copiato"`, `"da copiare"`, `"troppo grande"`,
  `"manca sul disco"`, `"su Drive"` (arrivati dal Drive col passaggio). `cestinoVecchio`: i file nel cestino da prima del
  giorno `prima` (90 giorni fa), quelli che `svuotaCestino` toglierebbe.
- `svuotaCestino {conferma}` (amministrazione 2 e **solo il titolare**; gli altri `"Non hai il permesso per svuotare il
  cestino (lo fa solo il titolare): chiedi al titolare"`): toglie dal disco del NAS i file nel cestino da più di 90
  giorni (la copia fuori casa, se c'è, resta). Prima risposta: `{"ok": false, "serveConferma": true, "quanti": 22, "mb":
  31.5, "errore": "Tolgo per sempre 22 file (31,5 MB) messi nel cestino prima del 24/07: non si potranno più
  recuperare"}`; con `conferma: true` → `{"ok": true, "tolti": 22, "mb": 31.5}`; niente da togliere: `{"ok": true,
  "tolti": 0, "mb": 0}` (vero). La riga del file resta, con `svuotato` (registro `"cestino svuotato: 22 file"`).
- **Copia fuori casa** (nella copia notturna, §7): manda al postino i file con `fuori_il` e `fuori_no` vuoti, **uno per
  richiesta**, dai più vecchi, per al massimo 20 minuti; ognuno riuscito prende `fuori_il`; uno oltre
  `COPIA_FUORI_MAX_MB` prende `fuori_no = 'troppo grande'` e non si riprova (la Dashboard lo dice, §16.18); uno che manca
  sul disco `'manca sul disco'`; uno che fallisce non ferma gli altri e si riprova la notte dopo. L'esito `fuori` di
  `copie`: `"ok · 12 file · 3 restano per domani"` (`"ok"` se non c'era niente; `"errore: ..."` se non è partita la copia
  del database). I file `caricato` mai legati e i collegamenti non si copiano. La regola "due notti di fila con errore =
  email" resta.

### 16.10 Scadenze

`scadenze {da?, a?, stato?: "aperte"|"fatte"|"annullate"|"tutte", tipo?, idCliente?, idSede?, idContratto?,
idDocumento?}` (documenti 1 o ticket 1: arrivano quelle che uno vede). Senza date e con le aperte (di base), divise
(vero):
```json
{"ok": true, "oggi": "2026-10-22",
 "scadute": [{"id": 7, "titolo": "Verifica protezioni SPG e SPI", "tipo": "verifica_protezioni", "tipoNome": "Verifica protezioni SPG e SPI",
   "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idSede": 4, "impianto": "Cabina MT Acme", "idContratto": null, "contratto": "",
   "data": "2026-09-30", "preavvisoGiorni": 90, "ogniMesi": 60, "dallaFatta": true, "azione": "promemoria", "anticipoGiorni": null,
   "stato": "aperta", "statoVisto": "Scaduta", "statoDettaglio": "da 22 giorni", "giorni": 22, "fattaIl": "", "motivo": "",
   "idDocumento": null, "documento": "", "idDocumentoFatto": null, "idTicket": null, "ticket": "", "idProssima": null,
   "assegnataA": null, "assegnata": "", "note": "", "puoScrivere": true, "creato": "2026-10-22T12:54:47", "modificato": "2026-10-22T12:54:47"}],
 "entro": [{"id": 4, "titolo": "Manutenzione impianto fotovoltaico 6 kW", "tipo": "manutenzione", "idSede": 8, "idContratto": 3, "contratto": "CA/2025/004",
   "data": "2026-10-28", "preavvisoGiorni": 30, "ogniMesi": 12, "dallaFatta": false, "azione": "ticket", "anticipoGiorni": 30,
   "statoVisto": "Scade fra 6 giorni", "giorni": 6, "idTicket": 16, "ticket": "TK/2026/0016", "...": "..."}, "..."],
 "piuAvanti": [{"id": 1, "titolo": "Manutenzione magazzino automatico", "data": "2026-12-01", "statoVisto": "Prossima", "statoDettaglio": "01/12/2026",
   "giorni": 40, "...": "..."}, "..."],
 "conteggi": {"scadute": 1, "entro": 5, "piuAvanti": 2}}
```
Con `da`/`a` (il calendario) o con un altro `stato`: `{"ok": true, "oggi": "2026-10-22", "da": "2026-11-01", "a":
"2026-11-30", "scadenze": [...]}`, per data. **Il calendario della fase 2 mostra le scadenze leggendo `scadenze {da,
a}`**: non sono copiate in `attivita`.
- `tipo` e `tipoNome`: `verifica_terra` "Verifica impianto di terra", `verifica_scariche` "Verifica protezione dalle
  scariche", `verifica_protezioni` "Verifica protezioni SPG e SPI", `manutenzione` "Manutenzione", `documento`
  "Documento", `polizza` "Polizza", `contratto` "Contratto", `altro` "Altro".
- `statoVisto`: `Scaduta` (`statoDettaglio` "da 22 giorni", `giorni` = da quanti), `Scade oggi`, `Scade domani`,
  `Scade fra N giorni` (nel preavviso; `giorni` = fra quanti), `Prossima` (`statoDettaglio` la data, `giorni` fra
  quanti), `Fatta` ("il 22/10", `giorni` null), `Annullata` (il motivo). Gruppi: `scadute` (prima di oggi), `entro` (nel
  preavviso), `piuAvanti`.
- Chi vede: quelle dei contratti (tipo `manutenzione`, `contratto` o con `idContratto`) chi ha `ticket` ≥ 1, le altre
  chi ha `documenti` ≥ 1; quella di un documento che uno non vede, no. `puoScrivere`: il modulo giusto a 2 e la scadenza
  aperta.

`salvaScadenza {scadenza: {id?, titolo?, tipo, idCliente?, idSede?, idDocumento?, idContratto?, data, preavvisoGiorni?,
ogniMesi?, dallaFatta?, azione?: "promemoria"|"ticket", anticipoGiorni?, assegnataA?, note?}}` → `{"ok": true,
"scadenza": {...}}`. Vero, una verifica di terra sull'impianto 9 mandando solo `tipo` e `data`: `"titolo": "Verifica
impianto di terra (DPR 462)", "idCliente": "C001", "ogniMesi": 60, "dallaFatta": true, "preavvisoGiorni": 90, "azione":
"promemoria", "statoVisto": "Prossima", "statoDettaglio": "15/02/2027", "giorni": 116`.
- **Le proposte** (quello che non si manda; fase5.md §6.3, da confermare con Manuel): `verifica_terra` e
  `verifica_scariche` ogni 60 mesi (24 se l'ambiente dell'impianto è `cantiere`, `medico`, `incendio` o `esplosione`),
  dalla fatta, preavviso 90, titolo "... (DPR 462)"; `verifica_protezioni` ogni 60 mesi, dalla fatta, preavviso 90;
  `manutenzione` la periodicità dell'impianto nel contratto, dalla data prevista, azione `ticket`, anticipo e preavviso
  `ANTICIPO_TICKET_GIORNI` (30), titolo "Manutenzione {impianto}"; `contratto` preavviso 30, titolo "Disdetta del
  contratto CA/..."; le altre preavviso `PREAVVISO_GIORNI` (60), senza ripetizione. `ogniMesi: 0` o vuoto = non si ripete.
- Il cliente viene dall'impianto o dal contratto se non c'è. Errori: `"Data: scrivi quando scade"`, `"Titolo: scrivi
  cosa scade"`, `"Ogni: da 1 a 120 mesi"`, `"Preavviso: da 0 a 365 giorni"`, `"Azione: promemoria o ticket"`, `"Tipo:
  verifica_terra, verifica_scariche, verifica_protezioni, manutenzione, documento, polizza, contratto o altro"`,
  `"Cliente: una scadenza che fa nascere un ticket vuole il cliente"`, `"Impianto 9 non trovato tra quelli di ..."`,
  `"La scadenza è già fatta: non si cambia"`, `"Persona 9 non trovata"`, il permesso (`"Non hai il permesso per
  scrivere le scadenze dei contratti: chiedi al titolare"`).
- `faiScadenza {id, data?, idDocumento?}` → `{"ok": true, "scadenza": {...}, "prossima": {...} | null}`: fatta il `data`
  (di base oggi), col documento che la chiude; se si ripete nasce la prossima, uguale, con data = (dalla fatta ? il
  giorno fatto : la data prevista) + `ogniMesi` (31 gennaio + 1 mese = 28 febbraio, `piuMesi`). Vero: la verifica SPG e
  SPI fatta oggi → `"scadenza": {"stato": "fatta", "statoVisto": "Fatta", "statoDettaglio": "il 22/10", "fattaIl":
  "2026-10-22", "idProssima": 10, ...}, "prossima": {"id": 10, "data": "2031-10-22", "statoVisto": "Prossima", ...}`. Chi
  la citava (l'impianto del contratto, il documento) ora cita la prossima. Le visite di un contratto oltre la sua fine non
  nascono (tranne col rinnovo tacito). Ripetuta: `ok` senza rifare. `"La scadenza è stata tolta: non si segna fatta"`.
- `togliScadenza {id, motivo, ancheProssime?}` → come `faiScadenza`: annullata col motivo (`"Scrivi il motivo"`); una
  ripetuta **continua** (nasce la prossima) a meno di `ancheProssime: true`. `"La scadenza è già fatta: non si toglie"`.
- **Una scadenza con `azione: "ticket"`** fa nascere un ticket programmato **una volta sola** (`idTicket`) quando `data
  − anticipoGiorni` ≤ oggi: controllato all'avvio, ogni notte e dopo ogni `salvaScadenza`, `faiScadenza`,
  `attivaContratto` e `rinnovaContratto`. Il ticket: `tipo: "programmato"`, `origine: "scadenza"`, priorità normale,
  `previstoIl` = data della scadenza, cliente, impianto, contratto e commessa del contratto, descrizione `"Visita del
  contratto CA/2026/002."`, responsabile = `assegnataA` (se no nessuno); registro `"nato dalla scadenza del 20/11/2026"`.
  Chiudere o risolvere quel ticket segna fatta la scadenza (col giorno della risoluzione) e fa nascere la prossima.

### 16.11 Ticket: l'elenco e un ticket

`tickets {segmento?: "aperti"|"programmati"|"chiusi"|"tutti", mie?, nonAssegnati?, priorita?, tipo?, idCliente?, idSede?,
idContratto?, testo?, da?, a?}` (ticket 1), vero:
```json
{"ok": true, "adesso": "2026-10-22T12:55:16", "segmento": "aperti",
 "conteggi": {"aperti": 6, "urgenti": 1, "nonAssegnati": 2, "inRitardo": 1, "risoltiDaChiudere": 1, "programmatiDaPianificare": 2},
 "ticket": [{"id": 14, "numero": "TK/2026/0014", "idLocale": "", "titolo": "Scatta il generale MT", "tipo": "guasto", "tipoNome": "Guasto",
   "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idSede": 4, "impianto": "Cabina MT Acme",
   "idCommessa": "26ST005", "commessa": "Assistenza Manutenzione cabina MT Acme", "idContratto": 2, "contratto": "CA/2026/002",
   "priorita": "urgente", "prioritaNome": "Urgente", "stato": "aperto", "statoVisto": "Aperto", "statoDettaglio": "",
   "inRitardo": true, "ritardo": "Da prendere da 26 minuti", "responsabileId": null, "responsabile": "",
   "apertoIl": "2026-10-22T11:29:46", "previstoIl": "", "entroPresa": "2026-10-22T12:29:46", "entroIntervento": "2026-10-22T15:29:46",
   "prossimoIntervento": null, "rapportini": 0, "origine": "telefono", "origineNome": "Telefono", "fatturazione": "", "fatturazioneNome": "",
   "chiusoIl": "", "puoScrivere": true, "puoPrendere": true, "fattura": null}, "..."]}
```
- **Segmenti**: `aperti` (di base) = aperto, in carico, in attesa, risolto, tranne i programmati con `previstoIl` oltre
  30 giorni; `programmati` = tipo programmato non chiusi né annullati, per `previstoIl`; `chiusi` = chiusi e annullati
  con la chiusura (o l'annullamento) fra `da` e `a` (di base gli ultimi 90 giorni), dal più recente; `tutti` (con `da` e
  `a` sull'apertura). Ordine degli aperti: i risolti in fondo; prima gli urgenti non presi, poi quelli in ritardo, poi
  per `entroIntervento`, poi per apertura. Errore `"Segmento: aperti, programmati, chiusi o tutti"`.
- `conteggi` su tutti quelli che uno vede (non sul segmento); per il collaboratore anche `miei` (vero, Marco:
  `{"aperti": 3, "urgenti": 1, "nonAssegnati": 2, "inRitardo": 1, "risoltiDaChiudere": 0, "programmatiDaPianificare": 1,
  "miei": 1}`).
- `tipo` e `tipoNome`: `guasto` Guasto, `verifica` Verifica, `piccolo` Piccolo intervento, `assistenza` Assistenza,
  `programmato` Programmato. `origine` e `origineNome`: `telefono`, `email`, `sopralluogo`, `ufficio`, `scadenza` "Da una
  scadenza" (`whatsapp` e `portale` ci sono nel database ma non si accettano, §16.12). `priorita`: `urgente`, `alta`,
  `normale`, `bassa`. `stato` e `statoVisto`: `aperto` Aperto, `in_carico` In carico, `in_attesa` In attesa, `risolto`
  Risolto, `chiuso` Chiuso, `annullato` Annullato.
- `statoDettaglio`: in carico con un intervento in arrivo `"giovedì 22 alle 8:30"`; in attesa il motivo; chiuso il modo
  (`"una riga per l'intervento"`, `"con gli altri rapportini"`, `"nel contratto"`, `"non si fattura"`); se no `""`.
- `inRitardo` e `ritardo` (finché non è risolto): oltre `entroIntervento` senza intervento `"Intervento in ritardo da 3
  ore"`, oltre `entroPresa` senza presa `"Da prendere da 26 minuti"` (minuti, ore fino a 47, poi giorni).
- `entroPresa` e `entroIntervento`: `apertoIl` + le ore di `TICKET_TEMPI` per la priorità (o dei `tempi` del contratto),
  ore di calendario; programmati: `entroPresa` `""`, `entroIntervento` la fine di `previstoIl` (`"2026-10-28T23:59:59"`).
  Cambiare priorità o contratto li rifà.
- `prossimoIntervento`: il primo intervento da fare da oggi in poi, `{id, inizio, fine, assegnataA, assegnata, luogo}`, o
  `null`. `rapportini`: quanti, non annullati. `fatturazioneNome` breve: "Una riga", "Con i rapportini", "Nel contratto",
  "Non si fattura".
- `puoScrivere`: ticket 2, ticket vivo, suo o senza responsabile. `puoPrendere`: ticket 2, aperto e senza
  responsabile. `fattura` (solo per chi vede le fatture con `costi`): `{"id": 16, "riferimento": "W-16", "stato":
  "bozza", "etichetta": "In bozza W-16"}` (emessa: `"Fattura 47/2026"`) o `null`.
- `testo` cerca (come i documenti) in numero, titolo, descrizione, cliente, impianto, richiedente, riferimento del
  cliente, commessa.

`ticket {id}` (ticket 1; `id` interno, numero o idLocale) → la voce più (vero, TK/2026/0012 prima della chiusura):
```json
{"ok": true, "ticket": {"id": 12, "numero": "TK/2026/0012", "titolo": "Inverter in errore di isolamento", "tipo": "guasto", "priorita": "normale",
 "stato": "risolto", "idContratto": 3, "contratto": "CA/2025/004", "idCommessa": "26ST006", "apertoIl": "2026-10-20T09:15:00",
 "entroPresa": "2026-10-20T17:15:00", "entroIntervento": "2026-10-23T09:15:00", "...": "come nell'elenco",
 "descrizione": "L'inverter si spegne la mattina con l'errore di isolamento e riparte a mezzogiorno.", "richiedente": "Mario Bianchi · 333 0000123",
 "idReferente": null, "rifCliente": "", "impatto": "ridotto", "urgenza": "presto", "prioritaAMano": false,
 "presoIl": "2026-10-20T09:16:00", "interventoIl": "2026-10-21T09:00:00", "risoltoIl": "2026-10-21T11:41:00", "annullatoIl": "",
 "motivo": "", "esito": "cambiati i fusibili della stringa 2, isolamento a posto", "prezzoCorpo": null, "motivoNo": "", "fatturatoIl": "",
 "idScadenza": null, "referente": null, "indirizzoImpianto": "Via Montegrappa 8, 36063 Marostica (VI)",
 "interventi": [],
 "rapportini": [{"id": "RAP/2026/0014", "data": "2026-10-21", "tecnico": "Manuel Gasparotto", "idUtente": 1, "ore": 2.5, "km": 24, "stato": "FIRMATO",
   "statoApprovazione": "", "firmatario": "Mario Bianchi", "descrizione": "Cambiati i fusibili della stringa 2, isolamento a posto", "apribile": true}],
 "ore": [],
 "spese": [{"id": 18, "data": "2026-10-21", "importo": 18.5, "categoria": "materiale", "descrizione": "Fusibili e portafusibili", "idRapportino": "RAP/2026/0014",
   "destinazione": "cliente", "stato": "approvata", "idTicket": 12, "ticket": "TK/2026/0012", "...": "come in spese (fase 3)"}],
 "foto": [{"id": "8XY1YpfVt1KpU5HXIZJ-x2CN9MrV", "url": "/file/8XY1YpfVt1KpU5HXIZJ-x2CN9MrV", "nome": "Inverter.png", "mime": "image/png", "idDocumento": null}, "..."],
 "documenti": [],
 "somma": {"ore": 2.5, "km": 24, "materiale": 18.5, "spese": 0, "costo": 66.74, "importo": 126.74},
 "proposta": {"fatturazione": "ticket", "perche": "Il contratto CA/2025/004 copre solo le visite"},
 "daFirmare": "",
 "storico": [{"tipo": "ticket", "data": "2026-10-22", "titolo": "TK/2026/0016 · Manutenzione impianto fotovoltaico 6 kW", "dettaglio": "Normale · Aperto · da una scadenza",
   "id": "TK/2026/0016", "idTicket": 16}, {"tipo": "foto", "data": "2026-10-22", "titolo": "2 foto", "dettaglio": "del ticket TK/2026/0012", "id": "TK/2026/0012", "idTicket": 12}, "..."],
 "cronologia": [{"quando": "2026-10-20T09:15:00", "chi": "Manuel Gasparotto", "testo": "Aperto da Manuel Gasparotto (telefono)"},
   {"quando": "2026-10-20T09:16:00", "chi": "Manuel Gasparotto", "testo": "Preso da Manuel Gasparotto"}, "..."],
 "riservata": null, "puoChiudere": true, "giallo": "chiudi"}}
```
- `interventi`: le sue attività non annullate, come in `attivita` (tipo `intervento`). `rapportini` brevi (`apribile`:
  il collaboratore apre solo i suoi). `ore` e `spese` come nella fase 3 (il collaboratore vede le sue; le spese dei
  rapportini sempre). `foto`: `{id, url, nome, mime, idDocumento}` (`idDocumento` se è anche nell'archivio).
  `documenti`: voci come `documenti` (con documenti 1, se no `[]`). `referente`: `{nome, telefono}` o `null`.
- `somma`: ore (rapportini + ore registrate che contano), km, materiale (spese di categoria materiale, non "Mia", non
  respinte), spese (le altre); con `costi` anche `costo` (fase 3: ore × costo orario congelato + km + spese,
  `costoTicket`) e `importo` (quello che **resta** da fatturare con "una riga per l'intervento", §16.14: 0 per un ticket
  già fatturato).
- `proposta` (§16.14): `{fatturazione, perche}`. `daFirmare`: perché la voce non è ancora pronta (`"RAP/2026/0016 da far
  firmare"`), o `""`.
- `storico`: le ultime 5 voci dell'impianto (§16.17). `cronologia`: da `ticket_eventi` (§16.22), dalla più vecchia.
- `riservata`: `"W-16"` (in una bozza o pronta) o `"47/2026"` (emessa) o `null`. `puoChiudere`: chi chiude, con il
  ticket aperto, in carico o risolto.
- **`giallo`** (il pulsante giallo, uguale su telefono e computer): `"prendi"` (aperto senza responsabile),
  `"pianifica"` (suo, senza interventi futuri né rapportini), `"rapportino"` (suo, con un intervento di oggi o passato o
  un rapportino non firmato), `"risolvi"` (suo, con un rapportino firmato), `"chiudi"` (risolto, per chi chiude),
  `"riprendi"` (in attesa, suo), `""` (niente da fare, ticket 1, o non suo).

### 16.12 Aprire e cambiare un ticket

`salvaTicket {ticket: {id?, idLocale?, numero?, idCliente, idSede?, idCommessa?, idContratto?, titolo, descrizione?,
tipo?, origine?, richiedente?, idReferente?, rifCliente?, impatto?, urgenza?, priorita?, responsabileId?, apertoIl?,
previstoIl?}}` (ticket 2) → `{"ok": true, "ticket": {...come ticket...}}`. Vero (nuovo, Manuel, senza responsabile,
impianto 5, `ridotto` + `presto`): `"numero": "TK/2026/0017", "stato": "aperto", "priorita": "normale", "entroPresa":
"2026-10-22T20:55:16", "entroIntervento": "2026-10-25T11:55:16", "proposta": {"fatturazione": "ticket", "perche":
"Nessun contratto per questo impianto"}, "giallo": "prendi"`, cronologia `"Aperto da Manuel Gasparotto (telefono)"`.
- **Nuovo**: numero = quello mandato se libero e dell'anno giusto (nato senza rete), se no il prossimo dell'anno di
  `apertoIl`; `apertoIl` di base adesso; `tipo` di base `guasto`, `origine` `telefono`; **il contratto** proposto
  dall'impianto (il contratto attivo, o disdetto non ancora finito, che lo copre quel giorno), **la commessa** di base
  quella del contratto; con `responsabileId` nasce `in_carico` (`presoIl` adesso). Ripetuto con lo stesso `idLocale`: lo
  stesso ticket, `"giaArrivato": true`.
- **Priorità**: dalle due domande (`impatto`: `fermo`|`ridotto`|`nessuno`; `urgenza`: `subito`|`presto`|`quando_si_puo`)
  con `prioritaDa` (§16.21); `priorita` mandata e diversa dalla matrice = scritta a mano (`prioritaAMano: true`, le
  risposte restano); `priorita: ""` torna automatica. Cambiarla scrive `"Priorità: Alta"` nella cronologia.
- **Cambiare**: solo un ticket vivo (`"Il ticket TK/2026/0010 è chiuso: riaprilo per cambiarlo"`); il cliente non cambia
  se il ticket ha già rapportini, ore o spese; contratto e commessa non cambiano se il ticket (o una sua cosa) è in una
  fattura.
- Errori: `"Cliente: scegli il cliente"`, `"Titolo: scrivi in poche parole cosa succede"`, `"Tipo: guasto, verifica,
  piccolo, assistenza o programmato"`, `"Da dove arriva: telefono, email, sopralluogo o ufficio"` (per `whatsapp` e
  `portale`, vero: `"Da dove arriva: telefono, email, sopralluogo o ufficio (WhatsApp e il portale non sono ancora
  collegati)"`; `scadenza` la usa solo il server), `"L'impianto è fermo? fermo, ridotto o nessuno"`, `"Per quando?
  subito, presto o quando_si_puo"`, `"Priorità: urgente, alta, normale o bassa"`, `"Impianto 9 non trovato tra quelli di
  Rossi Impianti Srl"`, `"Il contratto CA/2026/001 è di Batokyo Srl"`, `"La commessa 26ST001 è di un altro cliente"`,
  `"Chi ha chiamato: il referente 7 non è di Rossi Impianti Srl"`, `"Persona 9 non trovata"`, `"Aperto il: scrivi
  giorno e ora"`, `"Il ticket ha già rapportini, ore o spese di ...: il cliente non si cambia"`.

**I passaggi** (tutti ticket 2, `{id, ...}` → `{"ok": true, "ticket": {...}}`; ripetuti uguali: `ok` senza rifare):

| Azione | Da | A | Note ed errori |
|---|---|---|---|
| `prendiTicket {id}` | aperto | in carico | responsabile chi chiama, `presoIl` la prima volta. `"Il ticket TK/2026/0014 l'ha già preso Marco Collaboratore"` |
| `assegnaTicket {id, responsabileId}` | aperto, in carico, in attesa | in carico (`null`: aperto; in attesa resta in attesa) | il collaboratore solo a sé, o a nessuno i suoi. `"Persona 9 non trovata"` |
| `sospendiTicket {id, motivo}` | aperto, in carico | in attesa | `"Scrivi il motivo"`, `"Si mette in attesa un ticket aperto o in carico"` |
| `riprendiTicket {id}` | in attesa | in carico (aperto senza responsabile) | `"Il ticket TK/... non è in attesa"` |
| `altroIntervento {id}` | aperto, in carico, in attesa | (resta; aperto con responsabile: in carico) | cronologia "Serve un altro intervento" |
| `risolviTicket {id, esito?}` | aperto, in carico, in attesa | risolto | `esito` di base la descrizione dell'ultimo rapportino; senza responsabile lo diventa chi risolve; chiude la scadenza da cui è nato |
| `riapriTicket {id, motivo}` | risolto (suo); chiuso (solo chi chiude, non riservato né fatturato) | in carico (aperto senza responsabile) | da chiuso `fatturazione` torna `""`. `"Si riapre un ticket risolto o chiuso"`, `"Il ticket lo chiude l'ufficio: chiedi a loro di riaprirlo"` (`permesso:false`) |
| `annullaTicket {id, motivo}` | aperto, in carico, in attesa | annullato | non con rapportini non annullati: `"Il ticket ha il rapportino RAP/2026/0016: toglilo prima dal ticket"`; gli interventi da fare si annullano |
| `chiudiTicket` | aperto, in carico, risolto | chiuso | §16.14 |

Il collaboratore cambia solo i suoi ticket (assegnati a lui, o creati da lui e senza responsabile): `"Non hai il
permesso per cambiare i ticket degli altri: chiedi al titolare"` (e `"... annullare i ticket degli altri ..."`,
`"... assegnare i ticket agli altri ..."`).

### 16.13 L'intervento, il rapportino, ore, spese e foto

- **`pianificaTicket {id, inizio, fine?, assegnataA?, luogo?, note?, conferma?, promemoriaMinuti?}`** (ticket 2 **e**
  attivita 2: `"Non hai il permesso per pianificare gli interventi (serve il calendario): chiedi al titolare"`) crea con
  `salvaAttivita` (fase 2 §13.7) un'attività `tipo: "intervento"` con `idTicket`, titolo `"{numero} · {titolo}"`,
  cliente e commessa del ticket, `luogo` = indirizzo dell'impianto (o quello mandato), persona = `assegnataA`, se no il
  responsabile, se no chi chiama, `descrizione` = descrizione del ticket (più `note`), `fine` di base un'ora dopo. Il
  ticket va `in_carico` (chi va diventa responsabile se non c'era); cronologia `"Intervento pianificato per giovedì 22
  alle 7:00"`. → `{"ok": true, "ticket": {...}, "attivita": {...come attivita...}}`. Ogni chiamata è **un intervento in
  più** (un'altra uscita); spostarlo o toglierlo si fa come per ogni attività (`salvaAttivita`, anche dal calendario).
  Le sovrapposizioni sono quelle della fase 2 (vero):
  ```json
  {"ok": false, "errore": "Si sovrappone a: Sopralluogo quadri del magazzino Batokyo (14:30-16:00), TK/2026/0013 · Navetta 2 si ferma in errore (14:30-16:00)",
   "sovrapposte": [{"id": 3, "titolo": "Sopralluogo quadri del magazzino Batokyo", "inizio": "2026-10-22T14:30:00", "fine": "2026-10-22T16:00:00", "assegnataA": 3, "assegnata": "Marco Collaboratore"},
    {"id": 25, "titolo": "TK/2026/0013 · Navetta 2 si ferma in errore", "inizio": "2026-10-22T14:30:00", "fine": "2026-10-22T16:00:00", "assegnataA": 3, "assegnata": "Marco Collaboratore"}],
   "serveConferma": true}
  ```
  e si richiama con `conferma: true`. Il collaboratore pianifica solo per sé (`"... pianificare per gli altri ..."`) e
  solo i suoi ticket o quelli da prendere. Errori: `"Inizio: scrivi quando si va"`, `"Il ticket TK/... è chiuso: riaprilo
  per pianificare"`.
- **Il rapportino del ticket** è quello di sempre (§16.2). `legaRapportino {idRapportino, idTicket | null}` (rapportini
  2) lega o slega dopo → `{"ok": true, "rapportino": {...}}`. Legando, il server scrive il numero nel campo Ticket solo
  se è vuoto e il rapportino non è firmato; slegando lo toglie solo se il rapportino non è firmato e il campo è proprio
  quello scritto dal server. Errori: `"Rapportino X non trovato"`, `"Il rapportino RAP/... è annullato"`, `"... è già
  fatturato"`, `"... è già del ticket TK/...: toglilo prima da lì"`, `"Il ticket TK/... è chiuso: riaprilo per togliere il
  rapportino"`, i blocchi della fase 4.
- **Ore** senza rapportino (assistenza al telefono, preparazione) e **spese** (`materiale` con *Al cliente*):
  `salvaOre`/`salvaSpesa` con `idTicket` (§16.2).
- **Foto**: `caricaFile {tipo: "ticket", idTicket, base64, mime, nome, idFile}` oppure `{tipo: "ticket", idTicket,
  idFileCaricato}` col file di `/carica` (`per=ticket`) → `{"ok": true, "file": {"id": "...", "url": "/file/...", "nome":
  "..."}}`. Lo stesso `idFile` sullo stesso ticket: lo stesso file. Non su un ticket annullato. `togliFotoTicket {id,
  annulla?}` (ticket 2; il collaboratore sui suoi) → il ticket: la foto va nel cestino, `annulla: true` la rimette.
  "Metti nell'archivio": `salvaDocumento {origine: "file", idFile: <id della foto>, idTicket, idSede, idCategoria: <Foto>}`
  (documenti 2).
- **`interventoIl`** = il primo fra: l'inizio di un intervento segnato fatto, la nascita del primo rapportino non
  annullato, la prima riga di ore non tolta, la risoluzione. Si rifà a ogni cambio di queste cose.

### 16.14 Chiudere e fatturare

`chiudiTicket {id, fatturazione: "ticket"|"separati"|"contratto"|"no", prezzoCorpo?, motivo?, conferma?}` (ticket 2,
**titolare e amministrazione**, `costi` ≥ 1). Il collaboratore (vero): `{"ok": false, "errore": "Il ticket lo chiude
l'ufficio: tu segnalo risolto", "permesso": false}`; senza `costi`: `"Per chiudere i ticket serve anche il permesso dei
soldi: chiedi al titolare"`. Da risolto, o direttamente da aperto o in carico (assistenza al telefono: mette anche
`risoltoIl`); in attesa: `"Il ticket è in attesa: riprendilo prima di chiuderlo"`. → il ticket più `daFatturare` (vero,
TK/2026/0012):
```json
{"ok": true, "ticket": {"id": 12, "stato": "chiuso", "statoVisto": "Chiuso", "statoDettaglio": "una riga per l'intervento", "fatturazione": "ticket", "...": "..."},
 "daFatturare": {"tipo": "ticket", "id": "TK/2026/0012", "importo": 126.74, "pronta": true, "perche": "", "gruppo": "ticket:TK/2026/0012"}}
```
`daFatturare` serve all'avviso "Chiuso: va in Da fatturare (126,74 €)" ed è `null` per gli altri modi. Con un rapportino
ancora in bozza si chiude lo stesso (vero, TK/2026/0017): `"daFatturare": {"tipo": "ticket", "id": "TK/2026/0017",
"importo": 92.6, "pronta": false, "perche": "RAP/2026/0016 da far firmare", "gruppo": "ticket:TK/2026/0017"}`.
- **`ticket`** (una riga per l'intervento): serve qualcosa (un rapportino non annullato, ore fatturabili, spese al
  cliente o `prezzoCorpo`), se no `"Non c'è niente da fatturare: scrivi un prezzo a corpo o scegli Non si fattura"`.
  `prezzoCorpo` > 0 (`"Prezzo a corpo: scrivi quanto"`) = modo corpo.
- **`separati`** (con gli altri rapportini): rapportini, ore e spese del ticket diventano sorgenti normali della fase 4.
  Se la commessa è a corpo e ci sono rapportini o ore, prima: `{"ok": false, "serveConferma": true, "errore": "La
  commessa 26ST005 è a corpo: con «Con gli altri rapportini» i rapportini e le ore del ticket non vanno in fattura. Chiudo
  lo stesso?"}`.
- **`contratto`** (nel canone): serve il contratto (`"Il ticket non è legato a un contratto"`). Rapportini e ore non si
  fatturano mai; le spese al cliente sì, come voci `spesa` normali, se il contratto non comprende i materiali
  (`materialiInclusi: false`); le anticipazioni sempre.
- **`no`** (non si fattura): `motivo` obbligatorio (`"Scrivi perché non si fattura"`); con spese al cliente, prima
  (vero): `{"ok": false, "serveConferma": true, "errore": "Ci sono 6,80 € di spese segnate al cliente: con «Non si
  fattura» restano fuori dalla fattura. Chiudo lo stesso?"}`. Niente del ticket va in Da fatturare.
- `"Come si fattura: ticket, separati, contratto o no"`. Richiuso con lo stesso modo: `ok`; con un altro: `"Il ticket
  TK/... è già chiuso: riaprilo per cambiare come si fattura"`. Registro `"chiuso: una riga per l'intervento"`;
  cronologia `"Chiuso: una riga per l'intervento"`, `"Chiuso: nel contratto CA/2026/002"`, `"Chiuso: non si fattura
  (Garanzia)"`.
- **`proposta`** (la scelta già fatta nella finestra di chiusura): visita di un contratto valido → `contratto` ("Nel
  contratto CA/2026/002: è una visita del contratto"); contratto valido che copre visite e guasti → `contratto` ("Nel
  contratto CA/2026/002: copre visite e guasti"); cliente a tariffa fissa → `separati` ("Elettrodinamica ha la tariffa
  fissa: il mese resta una riga"); contratto valido che copre solo le visite → `ticket` ("Il contratto CA/2025/004 copre
  solo le visite"); contratto non valido quel giorno → `ticket` ("Il contratto CA/... non copre questo intervento"); senza
  contratto → `ticket` ("Nessun contratto per questo impianto"). Valido = attivo, o disdetto non ancora finito, e il
  giorno di apertura dentro il periodo.

**Finché un ticket non è chiuso** (aperto, in carico, in attesa, risolto) i suoi rapportini, ore e spese **non compaiono
in Da fatturare** (e non contano in `numeri.rapportini.daFatturare` della Dashboard); un ticket annullato non trattiene
niente. Così una cosa del ticket non si fattura per sbaglio prima che si scelga come.

**La voce in `daFatturare`** (tipo `ticket`, vero, Mario Bianchi):
```json
{"tipo": "ticket", "id": "TK/2026/0012", "idCommessa": "26ST006", "data": "2026-10-21", "titolo": "Inverter in errore di isolamento",
 "dettaglio": "Impianto fotovoltaico 6 kW · 1 rapportino · 2 ore · 24 km · materiale 18,50 €", "pronta": true, "importo": 126.74, "aCorpo": false,
 "dentro": [{"tipo": "rapportino", "id": "RAP/2026/0014"}, {"tipo": "spesa", "id": 18}], "spese": [], "senzaPrezzo": false,
 "anticipazione": false, "gruppo": "ticket:TK/2026/0012"}
```
- C'è quando il ticket è chiuso con `fatturazione: "ticket"`, `fatturatoIl` vuoto e non riservato. `id` = il **numero**
  del ticket (come i rapportini); `data` = giorno della risoluzione; il gruppo della vista e delle righe è lo stesso,
  `ticket:{numero}`.
- **Pronta** se i suoi rapportini non annullati sono firmati o inviati (e approvati, se serviva) e le sue ore e spese
  approvate; se no sta in `piuAvanti` con `perche` (`"RAP/2026/0016 da far firmare"`, `"RAP/... da approvare"`, `"RAP/...
  respinto"`, `"La spesa «...» del 21/10 da approvare"`, `"Le ore del 21/10 da approvare"`, vero:
  `{"tipo": "ticket", "id": "TK/2026/0017", "pronta": false, "importo": 92.6, "perche": "RAP/2026/0016 da far firmare",
  "idCliente": "C002", "cliente": "Rossi Impianti Srl", ...}`). Si sceglie solo quando è pronta (`"Il ticket TK/2026/0017
  non è ancora pronto: RAP/2026/0016 da far firmare"`).
- **Importo** (modo lavoro): per ogni rapportino non annullato `compenso ore + rimborso km` (più le spese vecchie senza
  righe), più le spese al cliente **non anticipate** del ticket e dei suoi rapportini, più le ore registrate fatturabili ×
  prezzo (la tariffa fuori contratto del contratto se c'è, se no `prezzoOrarioDi(cliente, commessa)`; senza prezzo
  quelle ore non contano e la voce ha `senzaPrezzo: true`). Modo corpo: `prezzoCorpo` (`aCorpo: true`). `dettaglio`:
  impianto · rapportini · ore pagate · km rimborsati · materiale (le spese non anticipate) · "a corpo". `dentro`: le cose
  che la riga contiene.
- **Le spese anticipate** (`spese`: i loro id) seguono la voce come voci `spesa` con `idTicket` (il **numero**),
  `anticipazione: true` e lo stesso `gruppo`; scegliere il ticket le porta, sceglierne una porta il ticket.
- **Le righe** (`righeTicket`, §16.21): `"Intervento TK/2026/0012 del 21/10/2026: Inverter in errore di isolamento -
  Impianto fotovoltaico 6 kW (2 ore, 24 km, materiale e spese 18,50 €, commessa 26ST006)"`, quantità 1, prezzo =
  importo; a corpo `"... (a corpo, commessa 26ST006)"`; senza impianto niente `" - ..."`; le parti a zero non si scrivono.
  Le anticipazioni: `"Spesa anticipata per conto del cliente: {descrizione} del {gg/mm/aaaa}"`, N1 come la fase 4.
  Causale proposta: `"Intervento TK/2026/0012, commessa 26ST006"`.
- **Senza doppioni, nel database**: il gruppo `ticket:{numero}` ha in `fattura_sorgenti` **una sorgente `ticket`**
  (`sorgente_id` = il numero; importo 0 nel modo lavoro, `prezzoCorpo` nel modo corpo) **e una per ogni cosa che ha
  dentro**: ogni rapportino (`compenso ore + rimborso km`, 0 a corpo), ogni spesa (importo, 0 a corpo tranne le
  anticipazioni), ogni riga di ore (ore × prezzo, 0 a corpo). Tutte sotto lo stesso indice unico della fase 4
  (`fattura_sorgenti_una ON fattura_sorgenti(tipo, sorgente_id) WHERE attiva = 1`): un rapportino del ticket non entra in
  un'altra fattura, nemmeno scritto a mano, finché questa è viva.
- **Effetti dell'emissione** (fase 4 §7.2): quelli di rapportini, spese e ore come sempre (FATTURATO, `fatturataIl`); il
  ticket prende `fatturatoIl` = data della fattura (cronologia `"Fatturato (...)"`); una nota di credito che lo storna lo
  toglie (`"Non più fatturato (...)"`).
- **Blocchi** (fase 4 §7.3): un ticket riservato o fatturato non si riapre, non cambia modo, contratto o commessa, non
  riceve né perde rapportini, ore o spese: `"Il ticket TK/2026/0012 è nella bozza W-16 per Mario Bianchi: toglilo prima
  dalla bozza"`, `"... è nella fattura W-16 (già passata al programma) per Mario Bianchi: toglilo prima dalla bozza"`,
  `"... è nella fattura 47/2026: per cambiarlo serve una nota di credito"`, `"Il ticket TK/2026/0010 è già fatturato
  fuori da Wisper"`; per una sua cosa la frase della fase 4 (`"RAP/2026/0014 è già nella bozza W-16 per ..."`).
- **`segnaFatturataFuori {voci: [{tipo: "ticket", id: "TK/2026/0010"}], nota?, annulla?}`**: un ticket chiuso "una riga"
  porta con sé rapportini, spese e ore che ha dentro (tutti fatturati fuori); `annulla` li toglie insieme. Errori: `"Il
  ticket TK/... non è chiuso con «Una riga per l'intervento»"`, `"... non è ancora pronto: ..."`, `"... non è segnato
  come fatturato fuori da Wisper"`.
- **XML di ritorno** (`leggiXml`/`confermaXml`): fra i `collegabili` c'è il gruppo del ticket (come i gruppi dei
  rapportini); collegarlo porta anche le sorgenti che ha dentro, senza doppioni.

### 16.15 Contratti di assistenza: elenco e scrittura

`contratti {stato?: "bozza"|"attivo"|"disdetto"|"chiuso", idCliente?, testo?}` (ticket 1) → `{"ok": true, "oggi":
"2026-10-22", "contratti": [...]}`, dal più recente; `contratto {id}` (ticket 1; id o numero) → `{"ok": true,
"contratto": {...}}` con in più `rate`, `costoTicket`, `rende`. Vero, CA/2026/002:
```json
{"ok": true, "contratto": {"id": 2, "numero": "CA/2026/002", "titolo": "Manutenzione cabina MT Acme", "idCliente": "C002", "cliente": "Rossi Impianti Srl",
 "idCommessa": "26ST005", "commessa": "Assistenza Manutenzione cabina MT Acme", "idPreventivo": null, "dal": "2026-01-01", "al": "2026-12-31",
 "rinnovo": "tacito", "disdettaGiorni": 60, "disdettaEntro": "2026-11-01", "stato": "attivo", "statoVisto": "In scadenza",
 "statoDettaglio": "disdetta entro domenica 1 novembre", "canone": 1200, "fatturazioneCanone": "semestrale", "copre": "visite_guasti",
 "materialiInclusi": false, "tariffaExtra": 45, "tempi": {"urgente": {"presa": 1, "intervento": 4}},
 "impianti": [{"idSede": 4, "nome": "Cabina MT Acme", "ogniMesi": 6, "primaVisita": "2026-11-20", "prossimaVisita": "2026-11-20", "idScadenza": 2}],
 "ticket": {"aperti": 2, "anno": 2}, "documento": {"id": 6, "titolo": "Contratto CA/2026/002 firmato"}, "disdettoIl": "", "motivo": "", "note": "",
 "puoScrivere": true, "creato": "2026-10-22T12:54:46", "modificato": "2026-10-22T12:54:47",
 "rate": [{"id": 14, "descrizione": "Canone 1° semestre 2026", "data": "2026-01-01", "importo": 600, "stato": "fatturata", "statoVisto": "Fatturata fuori da Wisper"},
  {"id": 15, "descrizione": "Canone 2° semestre 2026", "data": "2026-07-01", "importo": 600, "stato": "fatturata", "statoVisto": "Fatturata fuori da Wisper"}],
 "costoTicket": 0, "rende": {"canone": 1200, "costo": 0, "fatturatoExtra": 0, "margine": 1200, "ticket": 2}}}
```
- `statoVisto`: `Bozza`, `Attivo`, `In scadenza` (senza rinnovo a 60 giorni dalla fine: `"scade il 28/02/2027"`;
  tacito a 30 giorni dall'ultimo giorno per la disdetta: `"disdetta entro domenica 1 novembre"`), `Scaduto` (senza
  rinnovo, oltre la fine: `"finito il 31/10/2026"`), `Disdetto` (`"finisce il 31/12/2026"`), `Chiuso`. `disdettaEntro`
  = `al` − `disdettaGiorni` (solo col rinnovo tacito, se no `""`).
- `impianti`: `ogniMesi` delle visite, `primaVisita`, e la visita aperta (`prossimaVisita`, `idScadenza`). `ticket`:
  `aperti` (vivi) e `anno` (aperti quest'anno, non annullati). `documento`: il contratto firmato nell'archivio (se uno lo
  vede). `tempi`: solo le voci che cambiano `TICKET_TEMPI` (o `null`).
- `rate` (le scadenze di pagamento della commessa del contratto): `stato` `prevista` ("Prevista"), `in_bozza` ("In bozza
  W-16"), `fatturata` ("Fatturata 47/2026" o "Fatturata fuori da Wisper").
- `rende` (solo nel contratto, con `costi`): `canone` del periodo, `costo` dei suoi ticket aperti nel periodo (fase 3),
  `fatturatoExtra` (compenso delle fatture emesse coi gruppi dei suoi ticket), `margine` = canone + fatturato extra −
  costo, `ticket` = quanti nel periodo. `costoTicket` = lo stesso `costo`.
- Senza `costi` (vero, Marco): niente `canone`, `tariffaExtra`, `costoTicket`, `rende`, né `importo` delle rate;
  `puoScrivere: false`. Lettura (con `costi` 1) vede tutto, `puoScrivere: false`.

`salvaContratto {contratto: {id?, idCliente, titolo, dal, al?, rinnovo?, disdettaGiorni?, canone?, fatturazioneCanone?,
copre?, materialiInclusi?, tariffaExtra?, tempi?, idCommessa?, idPreventivo?, idDocumento?, note?, impianti?: [{idSede,
ogniMesi?, primaVisita?}]}}` (ticket 2 **e** `costi` 2; gli altri, vero: `"Non hai il permesso per scrivere i contratti
di assistenza: chiedi al titolare"`) → `{"ok": true, "contratto": {...}}`. Nuovo = **bozza** col numero dell'anno di
`dal`. Vero: `{"id": 4, "numero": "CA/2027/001", "titolo": "Assistenza quadro di linea 3", "idCliente": "C001",
"idCommessa": "", "dal": "2027-01-01", "al": "2027-12-31", "rinnovo": "tacito", "disdettaGiorni": 60, "disdettaEntro":
"2027-11-01", "stato": "bozza", "statoVisto": "Bozza", "canone": 480, "fatturazioneCanone": "semestrale", "copre":
"visite", "materialiInclusi": false, "tariffaExtra": 40, "impianti": [{"idSede": 9, "nome": "Quadro di linea 3",
"ogniMesi": 6, "primaVisita": "2027-03-01", "prossimaVisita": "", "idScadenza": null}], "rate": [], ...}`.
- Di base: `al` = `dal` + 12 mesi − 1 giorno, `rinnovo` `tacito`, `disdettaGiorni` 60, `fatturazioneCanone` `annuale`,
  `copre` `visite`. Valori: `rinnovo` `tacito`|`no`; `fatturazioneCanone` `annuale`|`semestrale`|`trimestrale`|
  `mensile`|`nessuna`; `copre` `visite`|`visite_guasti`; `tempi` per esempio `{"urgente": {"presa": 1, "intervento":
  4}}` (solo le voci che cambiano). `impianti` è l'elenco intero (ognuno del cliente; quelli che mancano si tolgono).
- **In bozza** si cambia tutto. **Attivo**: titolo, note, tempi, copre, materiali, tariffa fuori contratto, rinnovo,
  preavviso, documento e impianti (le visite si rifanno dalla prossima: un impianto nuovo prende la sua visita, uno
  tolto perde le sue, `ogniMesi` vuoto toglie le visite); canone, periodo e rate solo con `rinnovaContratto` (`"Il
  contratto CA/2026/002 è attivo: canone e periodo si cambiano con Rinnova"`).
- Errori: `"Cliente: scegli il cliente"`, `"Titolo: scrivi di che contratto si tratta"`, `"Dal: scrivi da quando
  vale"`, `"Al: deve venire dopo Dal"`, `"Rinnovo: tacito o no"`, `"Preavviso di disdetta: da 0 a 365 giorni"`,
  `"Canone: non può essere negativo"`, `"Come si fattura il canone: annuale, semestrale, trimestrale, mensile o
  nessuna"`, `"Copre: visite o visite_guasti"`, `"Tariffa fuori contratto: non può essere negativa"`, `"Impianto 9 non è
  di Rossi Impianti Srl"`, `"Ogni: da 1 a 60 mesi"`, `"Tempi: urgente, alta, normale o bassa"`, `"Tempi: le ore devono
  essere più di zero"`, `"Tempi: non si capiscono"`, `"La commessa 26ST001 è di un altro cliente"`, `"Preventivo 99 non
  trovato"`, `"Il contratto CA/2025/004 è chiuso"`, `"Il numero CA/2026/002 è già usato"`.

### 16.16 Contratti: attivare, canone, visite, rinnovo, disdetta

- `attivaContratto {id}` (ticket 2 e `costi` 2) → il contratto. Da bozza ad attivo (`"Il contratto CA/... non è in
  bozza"`; già attivo: `ok`):
  1. **la commessa**: se il contratto non ne ha una, nasce `"Assistenza {titolo}"` (un titolo che comincia già con
     "Assistenza" non si raddoppia), del cliente, `modoFatturazione: "corpo"`, inizio `dal`, fine prevista `al`,
     `importoContratto` e `budgetEuro` = canone, l'impianto = il primo del contratto, responsabile chi attiva, nota `"Dal
     contratto CA/2026/002"`, `idContratto`; con `idCommessa` scelta si lega quella;
  2. **le rate del canone** del periodo (`rateCanone`, §16.21) come scadenze di pagamento della commessa (`tipo:
     "importo"`, `quando: "data"`, `contratto_id`): la fase 4 le porta in Da fatturare come tutte le scadenze di pagamento
     (pronte 15 giorni prima della data; il `dettaglio` della voce ha il numero del contratto), con la riga `"Canone 1°
     semestre 2027: Manutenzione cabina MT Acme (contratto CA/2026/002, commessa 26ST005)"`;
  3. **le visite**: per ogni impianto con `ogniMesi`, una scadenza `tipo: "manutenzione"`, `azione: "ticket"`, titolo
     `"Manutenzione {impianto}"` (con la prima lettera minuscola: "Manutenzione cabina MT Acme"), alla `primaVisita` (se
     no `dal` + `ogniMesi`), contata dalla data prevista, anticipo e preavviso `ANTICIPO_TICKET_GIORNI`;
  4. col rinnovo tacito la scadenza **"Disdetta del contratto CA/..."** (`tipo: "contratto"`, data `disdettaEntro`,
     preavviso 30): è la voce della Dashboard;
  5. i ticket delle visite già entro l'anticipo (§16.10).
- `rinnovaContratto {id, al?, canone?, fatturazioneCanone?}` → il contratto. Solo attivo (`"Il contratto è in bozza:
  attivalo"`, `"Il contratto CA/... è disdetto"`). Il periodo nuovo parte il giorno dopo `al` (`al` nuovo di base + 12
  mesi − 1 giorno; `"Al: deve venire dopo 01/01/2027"`); il canone nuovo vale **solo per le rate nuove** (le vecchie
  restano come sono, anche in fattura); la commessa allunga la fine prevista; le visite ripartono dall'ultima prevista;
  nuova scadenza di disdetta. Registro `"rinnovato"`.
- **Rinnovo tacito, ogni notte** (e all'avvio): un contratto attivo, tacito, con `al` passato si allunga di 12 mesi come
  sopra (registro `"rinnovato da solo"`, nel log `[contratti] N rinnovati da soli`).
- `disdiciContratto {id, data?, motivo}` → il contratto: `disdetto` il `data` (di base oggi), finisce ad `al`, nessun
  rinnovo; la scadenza della disdetta si segna fatta (`"disdetta mandata"`); visite e rate del periodo restano. `"Scrivi
  il motivo"`, `"Si disdice un contratto attivo"`.
- `chiudiContratto {id, conferma?}` → il contratto: finito adesso. Prima, se ci sono rate o scadenze da togliere:
  `{"ok": false, "serveConferma": true, "errore": "Chiudo il contratto CA/2026/002 adesso: tolgo 1 rata non ancora
  fatturata e 2 scadenze (visite e disdetta). Va bene?"}`; con `conferma: true` le rate future non ancora in una fattura
  si tolgono (registro `"tolta: il contratto CA/2026/002 è chiuso"`) e le scadenze aperte si annullano (`"contratto
  chiuso"`).
- **I ticket del contratto**: aprendo un ticket su un impianto coperto il contratto si propone (§16.12); i suoi tempi
  valgono per `entroPresa`/`entroIntervento`; la proposta di chiusura dipende da `copre` (§16.14); le ore fuori contratto
  costano `tariffaExtra`; ore, km e spese dei ticket finiscono nel costo della commessa del contratto (fase 3) e in
  `rende`.

### 16.17 Storico dell'impianto e statistiche

`storicoImpianto {idSede, pagina?}` (clienti 1 o ticket 1), 30 voci per pagina, dalla più recente. Vero, Cabina MT Acme:
```json
{"ok": true,
 "impianto": {"id": 4, "tipo": "impianto", "nome": "Cabina MT Acme", "categoria": "cabina_mt", "categoriaNome": "Cabina MT", "idCliente": "C002",
  "cliente": "Rossi Impianti Srl", "indirizzo": "Via dell'Artigianato 9, 36010 Zanè (VI)", "sedePadreId": null, "matricola": "TR-2014-0571",
  "potenza": "630 kVA", "tensione": "15 kV / 400 V", "messaInServizio": "2014-05-20", "ambiente": "ordinario",
  "ambienteNome": "Ordinario: verifica ogni 5 anni", "verificaOgniMesi": 60, "idReferente": 4, "referente": "Sig. Ferretti · 0445 000201",
  "datiTecnici": "Trasformatore in resina, due scomparti MT"},
 "aperti": [{"tipo": "ticket", "id": "TK/2026/0014", "idTicket": 14, "titolo": "Scatta il generale MT", "stato": "aperto", "statoVisto": "Aperto", "priorita": "urgente"},
  {"tipo": "ticket", "id": "TK/2026/0015", "idTicket": 15, "titolo": "Manutenzione cabina MT Acme", "stato": "in_carico", "statoVisto": "In carico", "priorita": "normale"}],
 "scadenze": [{"id": 7, "titolo": "Verifica protezioni SPG e SPI", "data": "2026-09-30", "statoVisto": "Scaduta", "giorni": 22},
  {"id": 2, "titolo": "Manutenzione cabina MT Acme", "data": "2026-11-20", "statoVisto": "Scade fra 29 giorni", "giorni": 29}],
 "contratti": [{"id": 2, "numero": "CA/2026/002", "titolo": "Manutenzione cabina MT Acme", "statoVisto": "In scadenza"}],
 "pagina": 1, "pagine": 1, "quante": 6,
 "voci": [{"tipo": "ticket", "data": "2026-10-22", "titolo": "TK/2026/0014 · Scatta il generale MT", "dettaglio": "Urgente · Aperto · telefono", "id": "TK/2026/0014", "idTicket": 14},
  {"tipo": "foto", "data": "2026-10-22", "titolo": "1 foto", "dettaglio": "del ticket TK/2026/0014", "id": "TK/2026/0014", "idTicket": 14},
  {"tipo": "ticket", "data": "2026-10-21", "titolo": "TK/2026/0015 · Manutenzione cabina MT Acme", "dettaglio": "Normale · In carico · da una scadenza", "id": "TK/2026/0015", "idTicket": 15}, "..."]}
```
- **Voci**: `ticket` (aperti e chiusi, non annullati: priorità · stato, col modo se chiuso · origine), `rapportino` (dei
  ticket dell'impianto o delle commesse con quell'impianto: titolo `"RAP/2026/0014 · {descrizione}"`, dettaglio
  `"Manuel Gasparotto · 2,5 ore · firmato da Mario Bianchi"`, con `idTicket` e `ticket` se è di un ticket, `apribile`),
  `documento` (con quell'impianto, non archiviati, che uno vede: `"Progetti e schemi · Valida"`), `scadenza` (fatte:
  `"... fatta"`, `"dal ticket TK/..."` o `"scadenza del 30/09/2026"`), `foto` (dei ticket, raggruppate per ticket: `"2
  foto"`), `contratto` (nascita `"Contratto CA/... · {titolo}"`, `"dal 01/01/2026 al 31/12/2026"`; disdetta `"Contratto
  CA/... disdetto"`). `id` è quello che apre la pagina (il numero per ticket e foto, con `idTicket`).
- Il collaboratore vede le voci delle cose che vede: i rapportini degli altri come `{"tipo": "rapportino", "titolo":
  "Rapportino di Manuel Gasparotto", "dettaglio": "", "id": null, "apribile": false}`, niente ticket che non vede,
  niente documenti `costi`.
- `ambienteNome` e `verificaOgniMesi`: la periodicità proposta delle verifiche DPR 462 (5 anni, 2 per gli ambienti a
  maggior rischio), `""` e `null` senza ambiente. `referente` col telefono; qui `idReferente` come nel ticket (in
  `anagrafiche.sedi` la chiave è `referenteId`, come dice fase5.md §10.5).
- Errori: `"Impianto: scegli l'impianto"`, `"Impianto 99 non trovato"`.

`statisticheTicket {da?, a?, per?: "tipo"|"cliente"|"impianto"|"persona"|"mese"}` (ticket 1; di base `tipo` e i 12 mesi
fino alla fine del mese in corso), vero:
```json
{"ok": true, "da": "2025-11-01", "a": "2026-10-31", "per": "tipo",
 "totale": {"aperti": 8, "chiusi": 2, "inCorso": 6, "presaMediaOre": 34.1, "interventoMedioOre": 18.8, "chiusuraMediaGiorni": 1, "entroITempi": 67,
   "ore": 4.5, "km": 72, "nelContratto": 0, "costo": 125.72, "fatturato": 0},
 "righe": [{"chiave": "guasto", "nome": "Guasti", "aperti": 4, "chiusi": 1, "inCorso": 3, "presaMediaOre": 0.1, "interventoMedioOre": 28.1,
   "chiusuraMediaGiorni": 2, "entroITempi": 50, "ore": 4.5, "km": 72, "nelContratto": 0, "costo": 125.72, "fatturato": 0},
  {"chiave": "programmato", "nome": "Programmati", "aperti": 2, "chiusi": 0, "inCorso": 2, "presaMediaOre": 34.4, "interventoMedioOre": null,
   "chiusuraMediaGiorni": null, "entroITempi": null, "ore": 0, "km": 0, "nelContratto": 0, "costo": 0, "fatturato": 0}, "..."]}
```
- Contano i ticket **aperti nel periodo**, non annullati (`aperti` = quanti, `chiusi`, `inCorso` = ancora vivi). Medie a
  una cifra, solo sui ticket che hanno la misura (`null` se nessuno): `presaMediaOre` (apertura → presa),
  `interventoMedioOre` (apertura → primo intervento), `chiusuraMediaGiorni` (apertura → chiusura); `entroITempi` = % con
  `interventoIl ≤ entroIntervento` (sui ticket con un intervento). `ore` e `km` (rapportini e ore registrate),
  `nelContratto` = chiusi "nel contratto". Ore di calendario.
- `costo` e `fatturato` (compenso delle fatture emesse coi gruppi `ticket:{numero}`) solo con `costi` (Marco senza).
  `righe`: per `mese` in ordine di mese (`nome` "ottobre 2026"), gli altri dal più numeroso; `chiave` vuota = "Nessun
  impianto" o "Nessuno". `nome` per tipo: Guasti, Verifiche, Piccoli interventi, Assistenza, Programmati.
- Il collaboratore vede solo i ticket di cui è responsabile. Errore `"Per: tipo, cliente, impianto, persona o mese"`.

### 16.18 Dashboard: cosa si aggiunge

- `numeri` in più (veri, Manuel): `"ticket": {"aperti": 6, "urgenti": 1, "nonAssegnati": 2, "inRitardo": 1,
  "interventiOggi": 1, "risoltiDaChiudere": 1, "programmatiDaPianificare": 2}` (con ticket ≥ 1; per il collaboratore i
  suoi e quelli da prendere, Marco: `{"aperti": 3, "urgenti": 1, "nonAssegnati": 2, "inRitardo": 1, "interventiOggi": 1,
  "risoltiDaChiudere": 0, "programmatiDaPianificare": 1}`), `"documenti": {"daApprovare": 1, "inScadenza": 1,
  "scaduti": 0, "daClassificare": 3}` (con documenti ≥ 1: i conteggi di §16.4), `"scadenze": {"scadute": 1, "entro": 5,
  "vicine": 6}` (con documenti o ticket ≥ 1), `"contratti": {"attivi": 3, "inScadenza": 2}` (ticket ≥ 1 e `costi`, non il
  collaboratore), `"spazio": {"liberoMb": 34745, "avviso": false}` (amministrazione ≥ 1, non il collaboratore).
- Le voci nuove (vere, Manuel):
```json
{"urgenti": [
  {"tipo": "ticket", "gravita": "urgente", "titolo": "TK/2026/0014 urgente: Scatta il generale MT",
   "dettaglio": "Rossi Impianti Srl · Cabina MT Acme · aperto alle 11:29 · nessuno l'ha preso", "quanto": null, "unita": null, "collegamento": {"pagina": "ticket", "id": 14}},
  {"tipo": "scadenza", "gravita": "urgente", "titolo": "Verifica protezioni SPG e SPI scaduta da 22 giorni", "dettaglio": "Rossi Impianti Srl · Cabina MT Acme",
   "quanto": 22, "unita": "giorni", "collegamento": {"pagina": "scadenza", "id": 7}}],
 "settimana": [
  {"tipo": "intervento", "gravita": "attenzione", "titolo": "Intervento di oggi alle 14:30: TK/2026/0013 Navetta 2 si ferma in errore",
   "dettaglio": "Marco Collaboratore · Batokyo Srl · Schio", "quanto": null, "unita": null, "collegamento": {"pagina": "ticket", "id": 13}},
  {"tipo": "ticket", "gravita": "attenzione", "titolo": "TK/2026/0012 risolto: da chiudere", "dettaglio": "Mario Bianchi · rapportino firmato il 21/10",
   "quanto": null, "unita": null, "collegamento": {"pagina": "ticket", "id": 12}},
  {"tipo": "documento", "gravita": "attenzione", "titolo": "1 documento da approvare", "dettaglio": "Schema unifilare cabina MT rev. 3 · Marco Collaboratore",
   "quanto": 1, "unita": "documenti", "collegamento": {"pagina": "documenti", "filtro": {"segmento": "approvare"}}},
  {"tipo": "scadenza", "gravita": "attenzione", "titolo": "Certificato di taratura del misuratore di terra scade fra 24 giorni", "dettaglio": "",
   "quanto": 24, "unita": "giorni", "collegamento": {"pagina": "scadenza", "id": 6}},
  {"tipo": "contratto", "gravita": "attenzione", "titolo": "CA/2026/002: la disdetta va mandata entro domenica 1 novembre",
   "dettaglio": "Rossi Impianti Srl · si rinnova da solo il 01/01/2027", "quanto": null, "unita": null, "collegamento": {"pagina": "contratto", "id": 2}},
  {"tipo": "contratto", "gravita": "attenzione", "titolo": "CA/2025/004 scade il 31/10/2026: rinnovalo o lascialo scadere",
   "dettaglio": "Mario Bianchi · Controllo annuale fotovoltaico", "quanto": null, "unita": null, "collegamento": {"pagina": "contratto", "id": 3}}],
 "pianificare": [
  {"tipo": "ticket", "gravita": "info", "titolo": "Manutenzione cabina MT Acme del 20/11 da pianificare", "dettaglio": "TK/2026/0015 · Rossi Impianti Srl",
   "quanto": null, "unita": null, "collegamento": {"pagina": "ticket", "id": 15}},
  {"tipo": "documento", "gravita": "info", "titolo": "3 documenti da classificare", "dettaglio": "Arrivati senza categoria", "quanto": 3, "unita": "documenti",
   "collegamento": {"pagina": "documenti", "filtro": {"segmento": "archivio", "daClassificare": true}}},
  {"tipo": "scadenza", "gravita": "info", "titolo": "Verifica impianto di terra (DPR 462): 12/01/2027", "dettaglio": "Batokyo Srl · Impianto di terra stabilimento",
   "quanto": null, "unita": null, "collegamento": {"pagina": "scadenza", "id": 5}}]}
```
- **urgenti**: ticket urgenti non presi o in ritardo, uno per uno fino a 3 (titolo `"... urgente: ..."` o `"... in
  ritardo: ..."`; dettaglio `"... · aperto alle 11:29 · nessuno l'ha preso"` o `"... · intervento previsto entro le
  15:29"`), oltre 3 una voce sola `"5 ticket urgenti o in ritardo"` (unità `ticket`, `collegamento {pagina: "tickets",
  filtro: {segmento: "aperti", priorita: "urgente"}}`); scadenze scadute, una per una fino a 3, poi `"5 scadenze
  scadute"` (unità `scadenze`, `collegamento {pagina: "documenti", filtro: {segmento: "scadenze"}}`), senza le disdette
  (hanno la voce del contratto) e quelle già diventate ticket (hanno la voce del ticket), come in tutte le voci delle
  scadenze; le proprie revisioni respinte (`"Schema unifilare cabina MT rev. 3 respinta"`, `"Motivo:
  ... · Manuel Gasparotto"`, `collegamento {pagina: "documento", id}`); disco sotto `SPAZIO_MINIMO_MB` (`tipo: "spazio"`,
  `"Il disco del NAS è quasi pieno: restano 1,6 GB"`, `"I documenti nuovi non si caricano finché non si libera spazio"`,
  `collegamento {pagina: "amministrazione", filtro: {sezione: "spazio"}}`).
- **questa settimana**: interventi di oggi, uno per uno; ticket risolti da chiudere (solo chi chiude; oltre 3 `"5
  ticket risolti da chiudere"`, `collegamento {pagina: "tickets", filtro: {segmento: "aperti"}}`); documenti da approvare
  (chi approva); per chi non approva le sue revisioni in attesa (`"Schema unifilare cabina MT rev. 3: aspetta
  l'approvazione"`, `gravita: "info"`, `collegamento {pagina: "documento", id}`); scadenze nel preavviso che cadono entro
  30 giorni (`"... scade fra 24 giorni"`, `"... scade oggi"`, `"... scade domani"`); contratti in scadenza (tacito: `"...:
  la disdetta va mandata entro domenica 1 novembre"`; senza rinnovo: `"... scade il 31/10/2026: rinnovalo o lascialo
  scadere"`).
- **da pianificare**: ticket da prendere non urgenti e non programmati (`"2 ticket da prendere"`, dettaglio i primi tre,
  `collegamento {pagina: "tickets", filtro: {segmento: "aperti", nonAssegnati: true}}`); programmati senza intervento con
  `previstoIl` entro 30 giorni, uno per uno; scadenze fra 31 e 120 giorni (le prime 5, `"...: 12/01/2027"`); documenti da
  classificare (con documenti 2); file troppo grandi per la copia fuori casa (`tipo: "copia"`, `"2 file sono solo sul NAS:
  troppo grandi per la copia fuori casa"`, `"Oltre 25 MB"`); disco sotto `SPAZIO_AVVISO_MB` (`"Il disco del NAS si sta
  riempiendo: restano 8,4 GB"`, `"Amministrazione › Spazio sul NAS"`).
- **Il collaboratore** (vero, Marco): l'urgente da prendere, il suo intervento di oggi, `"Schema unifilare cabina MT rev.
  3: aspetta l'approvazione"`; i suoi ticket e quelli da prendere; niente scadenze tra le voci (i numeri sì), niente
  contratti, niente spazio, niente soldi.
- `collegamento.pagina` nuove: `tickets` (filtro `segmento`, `priorita`, `nonAssegnati`), `ticket` (`id`), `contratto`
  (`id`), `documenti` (filtro `segmento`: `archivio` | `approvare` | `scadenze`, e `daClassificare`), `documento` (`id`),
  `scadenza` (`id`), `amministrazione` con `filtro.sezione: "spazio"`. `tipo` nuovi: `ticket`, `intervento`, `scadenza`,
  `documento`, `contratto`, `spazio`, `copia`. Unità nuove: `ticket`, `documenti`, `scadenze`.
- **Numerino giallo** del menu: Ticket e assistenza = `numeri.ticket.nonAssegnati` (per il collaboratore anche
  `conteggi.miei` di `tickets`); Documenti = `numeri.documenti.daApprovare`, solo per chi approva
  (`io.interfaccia.puoApprovareDocumenti`).
- Di prima cambia: gli appuntamenti di oggi della fase 2 non contano gli interventi; `numeri.rapportini.daFatturare`
  non conta i rapportini trattenuti da un ticket (§16.14).

### 16.19 Permessi

Coi valori iniziali dei ruoli (provati in `prove/permessi-fase5.test.js`, ogni ruolo su ogni azione nuova):
- **Titolare**: tutto. Solo lui svuota il cestino.
- **Amministrazione** (documenti 2, ticket 2, `costi` 2, amministrazione 1): tutto tranne categorie e testi dei modelli
  (amministrazione 2) e il cestino; vede lo spazio, approva le revisioni, chiude i ticket, scrive i contratti.
- **Collaboratore** (documenti 1, ticket 2, attivita 2, rapportini 2, `costi` 0):
  - documenti in lettura (tranne `costi` e `riservati`: `/file/<id>` di un documento `costi` → 403), non carica, non
    approva, `/carica?per=documento` no; con documenti 2 (se Andrea glielo dà) carica e cambia solo i documenti creati da
    lui, e le sue revisioni nelle categorie con approvazione vanno *Da approvare*;
  - ticket: vede i suoi, quelli non assegnati, quelli delle commesse dove è responsabile o tra le persone, e quelli con
    un suo intervento o un suo rapportino (gli altri: `"Ticket 9 non trovato"`); crea (per sé o per nessuno), prende,
    pianifica per sé, sospende, riprende, fotografa (`/carica?per=ticket` sì), scrive il rapportino, risolve, riapre i
    suoi risolti, annulla i suoi; **non chiude** (`"Il ticket lo chiude l'ufficio: tu segnalo risolto"`), non assegna ad
    altri, non riapre i chiusi;
  - contratti in lettura senza soldi, non li scrive; statistiche dei suoi ticket senza costo e fatturato;
  - scadenze: le legge; scrive quelle dei contratti (ticket 2, come dice fase5.md §10.2: spostare o segnare fatta una
    visita) ma non quelle dei documenti; niente spazio, niente cestino.
- **Lettura** (tutti 1, `costi` 1, amministrazione 0): vede ed esporta tutto (anche canone e `rende`), nessuna scrittura
  (`puoScrivere` sempre `false`, `giallo` sempre `""`), `/carica` no, niente spazio.
- Fuori dai ruoli: `/condiviso/<token>` revocato o scaduto → 404 "Questo link non vale più"; il token non compare mai nel
  registro.

### 16.20 Esportazioni

`esporta {cosa: "documenti"|"scadenze"|"ticket"|"contratti", ...i filtri dell'elenco}` → il CSV della §12.13 (vero:
`"nome": "wisper-ticket-2026-10-22.csv", "righe": 9`). Serve la lettura del modulo (scadenze: documenti o ticket).
Colonne:
- **documenti** (tutte le pagine, come `archivio: true`): Titolo, Categoria, Cliente, Commessa, Impianto, Ticket, Origine
  (File, Collegamento, Mandato), Tipo di collegamento, Indirizzo (solo collegamenti), Revisione valida, Stato,
  Riferimento, Data del documento, Scadenza, Caricato da, Modificato;
- **scadenze** (di base tutte, ogni stato): Data, Titolo, Tipo, Cliente, Impianto, Ogni (mesi), Stato, Fatta il,
  Documento, Ticket;
- **ticket** (di base segmento `tutti`): Numero, Aperto il, Cliente, Impianto, Titolo, Tipo, Da dove, Priorità, Stato,
  Responsabile, Contratto, Commessa, Preso il, Primo intervento il, Risolto il, Chiuso il, Ore, Km, Spese, Come si
  fattura, Importo (solo con `costi`), Fatturato il. Vera: `TK/2026/0010;12/10/2026 08:05;Rossi Impianti Srl;Quadro
  generale capannone;Presa del quadro bruciata;Guasto;Telefono;Alta;Chiuso;Manuel Gasparotto;;;12/10/2026 08:05;13/10/2026
  16:30;13/10/2026 17:05;14/10/2026 09:00;2;48;0;Una riga per l'intervento;0;22/10/2026` (Importo = quello che resta da
  fatturare: 0 per un ticket già fatturato, §16.23);
- **contratti**: Numero, Cliente, Titolo, Dal, Al, Rinnovo (Tacito, No), Disdetta entro, Stato, Canone (solo con
  `costi`), Come si fattura il canone (Annuale, Semestrale, Trimestrale, Mensile, Nessuna), Copre (Solo visite, Visite e
  guasti), Impianti, Ticket nell'anno, Commessa.

L'errore di `cosa` ora finisce con `"..., documenti, scadenze, ticket o contratti"`.

### 16.21 Conti e casi condivisi

In `server/src/conti.js` e `server/src/documenti.js`, coi casi in `server/prove/` (telefono e computer li leggono dal loro
posto e devono ritrovare ogni risultato, `deepEqual` sui campi di `atteso`):
- `prioritaDa(impatto, urgenza)` (`MATRICE_PRIORITA`), casi in **`casi-ticket.json`**: `priorita` (le 9 caselle più
  "senza risposte" = normale), `cambia` (la priorità scritta a mano: `prioritaAMano: true`, le risposte restano),
  `tempi` (`entroPresa`/`entroIntervento` da `apertoIl` e priorità con la tabella dello studio, in ore di calendario, e il
  programmato).
- `tipoCollegamento(url)` → `{url, tipo, cartella, pillola}`, casi in **`casi-collegamenti.json`**: 18 indirizzi
  riconosciuti (OneDrive personale `*-my.sharepoint.com`, `1drv.ms`, `onedrive.live.com`; SharePoint
  `*.sharepoint.com`; Google Drive `drive.google.com`/`docs.google.com`; percorsi `\\server\...`, `X:\...`,
  `file:///...`; siti `https://`) e 6 rifiutati (`http://`, vuoto, testo, `ftp://`...) con la `frase`. `cartella` è una
  proposta (OneDrive e SharePoint `/:f:/`, Drive `/folders/`, un percorso senza estensione).
- `righeTicket({ticket, cliente, rapportini, spese, ore})` → `[{gruppo, righe, sorgenti}]`: il raggruppamento **E** di
  **`casi-fattura.json`** (TK/2026/0012, Mario Bianchi: una riga da 126,74, 3 sorgenti), provato riga per riga con A-D.
- Solo del server (prove in `ticket.test.js`, `ticket-fatture.test.js`, `contratti.test.js`): `rateCanone(dal, al,
  canone, fatturazione)` → `[{data, importo, descrizione}]` ("Canone 2026", "Canone 2025-2026" per un periodo a
  cavallo, "Canone 1° semestre 2027", "Canone 2° trimestre 2027", "Canone di marzo 2027"; l'ultima rata prende il
  resto); `rigaCanone(scadenza, contratto, commessa)`; `piuMesi(iso, n)` (31 gennaio + 1 mese = 28 febbraio);
  `costoTicket({rapportini, ore, spese, costoOrarioOggi, euroKmOggi})` → `{lavoro, auto, ore, spese, totale}`.
- In `src/documenti.js` anche `pulisciRicerca`, `riconosciTipo`, `tipoDaSalvare`, `SEGNAPOSTI`, `riempi`.

### 16.22 Note per chi legge il database

Migrazione `005-documenti-ticket.sql` + `005-documenti-ticket.js` (schema 5, copia `wisper.db.prima-5` prima, una
transazione). Nessun dato di prima cambia: `prove/migrazione-005.test.js` prende il database d'esempio della fase 4
scritto dal server 0.7.0 (`prove/migrazione-005/fase4.sql`, rifatto da `genera-prima.js`), lo migra e ritrova identici
rapportini, PDF (impronte in `pdf.js`), conti, fatture, Da fatturare e file.
- **Tabelle nuove**: `documento_categorie`, `documenti`, `documento_versioni`, `documento_condivisioni` (`token_hash` =
  SHA-256 del token, unico), `scadenze` (con `motivo` in più dell'accordo, per l'annullamento), `contratti`,
  `contratto_impianti` (chiave `contratto_id, sede_id`), `ticket`, `ticket_eventi` (la cronologia del ticket: due
  trigger impediscono di cambiarla o cancellarla; non va nel registro), `modelli_testi`.
- **Colonne nuove**: `sedi.categoria`, `sede_padre_id`, `matricola`, `potenza`, `tensione`, `messa_in_servizio`,
  `ambiente`, `referente_id`, `dati_tecnici`; `ticket_id` su `rapportini`, `ore` e `spese` (con gli indici);
  `contratto_id` su `scadenze_pagamento` e `commesse`.
- **Tabelle rifatte** (per cambiare un CHECK, coi contatori AUTOINCREMENT rimessi come prima): `attivita` (tipo
  `intervento`, colonna `ticket_id`; la checklist resta), `file` (tipi `ticket`, `caricato`, `inviato`; colonne
  `documento_id`, `versione_id`, `ticket_id`, `fuori_il`, `fuori_no`, `caricato_da`, `svuotato`), `fattura_sorgenti`
  (tipo `ticket`, **stesso indice unico** `fattura_sorgenti_una`).
- **Indici che proteggono i dati**: `documenti_cartella_commessa` e `documenti_cartella_cliente` (una cartella
  principale); `ticket.numero`, `contratti.numero`, `ticket.id_locale`, `documenti.id_locale` unici.
- **Cosa fa la `.js`**: le 16 categorie e i 12 testi dei modelli; ogni file `documento` non nel cestino diventa un
  documento in "Da classificare", rev. 0 approvata, **con lo stesso id del file** (gli indirizzi `/file/<id>` di prima
  aprono ancora), registro `"migrazione 005: il documento della commessa entra nell'archivio"`; la `cartella` di ogni
  commessa diventa un collegamento principale `"Cartella della commessa {id}"` (un id di Drive da solo diventa
  `https://drive.google.com/drive/folders/<id>`; un valore che non è un indirizzo resta solo nella commessa, con la nota
  nel registro); i file creati prima dell'ultima copia fuori casa riuscita prendono `fuori_il` (la copia nuova non
  rimanda tutto).
- **Il registro**: le tabelle nuove coi loro nomi (tranne `ticket_eventi`); note `"caricato con /carica"`, `"caricato e
  mai legato: nel cestino dopo 24 ore"`, `"caricata la rev. 3"`, `"rev. 2 approvata"`, `"rev. 3 respinta: {motivo}"`,
  `"rev. 3 di nuovo da approvare"`, `"collegamento cambiato"`, `"mandato per email a {email}"`, `"copia del PDF mandato a
  {email}"`, `"link per {per chi} fino al {data}"`, `"link revocato"`, `"scadenza fatta: nasce la prossima del {data}"`,
  `"nato dalla scadenza del {data}"`, `"legato al ticket TK/..."`, `"tolto dal ticket TK/..."`, `"chiuso: {modo}"`,
  `"il ticket TK/... è annullato"` (sugli interventi annullati), `"contratto attivato"`, `"rinnovato"`, `"rinnovato da
  solo"`, `"disdetto: {motivo}"`, `"disdetta mandata"`, `"contratto chiuso"`, `"tolta: il contratto ... è chiuso"`,
  `"cestino svuotato: {n} file"`, `"troppo grande per la copia fuori casa: resta solo sul NAS"`. Mai nel registro: il
  token dei link, il contenuto dei file. Il registro della copia fuori casa riuscita non ha una riga per file (l'esito sta
  in `copie`).
- **La cronologia del ticket** (`ticket_eventi.testo`): "Aperto da {chi} (telefono)", "Nato dalla scadenza del {data}
  (contratto CA/...)", "Preso da {chi}", "Assegnato a {chi}", "Nessuno lo segue più", "Priorità: Alta", "In attesa:
  {motivo}", "Ripreso", "Intervento pianificato per {giorno} alle {ora}", "Rapportino RAP/... scritto da {tecnico}",
  "Rapportino RAP/... firmato da {firmatario}", "Rapportino RAP/... legato al ticket", "Rapportino RAP/... tolto dal
  ticket", "Serve un altro intervento", "Risolto: {esito}", "Chiuso: {modo}", "Riaperto: {motivo}", "Annullato:
  {motivo}", "Fatturato (...)", "Non più fatturato (...)".
- **Pianificazione del server**: all'avvio e ogni notte rinnovi taciti e ticket delle scadenze (log `[contratti]`,
  `[ticket]`); ogni minuto i file di `/carica` mai legati da più di 24 ore vanno nel cestino.

**Correzioni del 22/10/2026, dopo le prove di computer e telefono.** L'elenco `ticket` porta anche `fatturatoIl`
(come la pagina del ticket), così Chiusi sa dire "fatturato fuori da Wisper". Nella Dashboard un ticket compare una
volta sola: se è già tra le urgenti (in ritardo, non preso), le sue voci in settimana e da pianificare (per esempio
"Intervento di oggi") non si ripetono. Le ore del server (`2026-10-22T13:54:00`) sono **ora italiana** (Europe/Rome) e non portano il fuso:
le app le leggono sempre come ora italiana, anche su un telefono con un altro fuso.

### 16.23 Decisioni prese dove l'accordo non diceva (o non reggeva)

- **`documenti` ha due risposte.** L'azione c'era già (Code.gs, fase 1: `{idCommessa}` → cartella e file della
  commessa). Per non rompere le versioni vecchie, con solo `idCommessa` risponde come prima (letta dall'archivio); con
  `archivio: true` o un filtro della fase 5 è l'elenco nuovo. Le app nuove mandano sempre `archivio: true`.
- **Il campo `ticket` del rapportino resta il testo di sempre** (fase5.md §10.5 diceva "`ticket` (numero)"): è stampato
  nel PDF firmato, e nei rapportini di prima c'è scritto di tutto. Trasformarlo in un numero avrebbe cambiato quello che
  il cliente ha firmato. Il numero sta in `numeroTicket`, l'id in `idTicket`; il server scrive nel campo solo se è vuoto
  e lo toglie (slegando) solo se è proprio il suo testo e il rapportino non è firmato.
- **`idTicket` è sempre l'id interno** (anche nelle voci dello storico, dove l'accordo mostrava il numero) e `ticket` il
  numero; ovunque si accetta anche il numero. Nella voce di Da fatturare `id` è il numero (come i rapportini), ed è il
  `sorgente_id` di `fattura_sorgenti`.
- **Finché il ticket non è chiuso le sue cose non vanno in Da fatturare**, qualunque modo si sceglierà poi: altrimenti un
  rapportino del ticket si potrebbe fatturare da solo prima della chiusura, e poi di nuovo con la riga del ticket (l'indice
  lo fermerebbe, ma con un errore difficile da capire). Il gruppo "una riga" mette sotto l'indice unico anche tutto quello
  che ha dentro. Un ticket annullato non trattiene niente.
- **"Con gli altri rapportini" su una commessa a corpo chiede conferma**: i rapportini di una commessa a corpo non vanno
  in fattura (fase 4), e senza avviso sparirebbero dal conto senza che nessuno l'abbia deciso.
- **`somma.importo` del ticket è quello che resta da fatturare** (0 per un ticket già fatturato o fatturato fuori),
  anche nella colonna Importo dell'esportazione: è la stessa voce di Da fatturare, così i due numeri non si contraddicono.
  Il fatturato vero sta in `statisticheTicket` (`fatturato`) e nel contratto (`rende`).
- **Lo spazio**: 200 MB fissi per tutto il lavoro sul campo (foto e firme dei rapportini, scontrini, foto dei ticket,
  allegati delle attività; l'accordo nominava solo i primi due), perché un tecnico dal cliente non deve restare bloccato
  per un archivio che si riempie. La copia dei PDF mandati non ferma mai l'email.
- **`/carica` più severo dell'accordo**: programmi, script e pagine web (anche SVG o HTML dichiarati come altro) non
  passano mai, e un tipo che il browser eseguirebbe non si salva (diventa `application/octet-stream`); `/file` manda
  `nosniff`. Un file con lo stesso SHA-256 passa lo stesso (`gia`): decide la persona. I file di `/carica` li lega solo
  chi li ha caricati.
- **Il link che scade dà la revisione valida quando è stato creato** e non segue le revisioni nuove (come dice
  l'accordo): chi l'ha ricevuto scarica quello che gli è stato mandato. Il token sta nel database solo come SHA-256.
- **Scadenze dei contratti e collaboratore**: l'accordo (§10.2) dice ticket 2, e il collaboratore ha ticket 2: può
  spostare o segnare fatta una visita (pianificazione), ma non tocca contratto, canone o rate (ticket 2 **e** `costi`
  2). Nella sua Dashboard le scadenze non hanno voci (sono dell'ufficio).
- **Le visite si contano dalla data prevista, le verifiche DPR 462 dalla fatta**: una visita fatta in ritardo non sposta
  il calendario del contratto; una verifica sì, perché la periodicità di legge parte dall'ultima verifica.
- **`togliScadenza` vuole il motivo**, e una ripetuta continua (nasce la prossima) se non si dice "anche le prossime":
  togliere per errore una verifica non deve far sparire tutte quelle dopo.
- **Chiudere un contratto toglie le rate future non ancora in fattura** (le cancella, col registro) e annulla le scadenze
  aperte, con conferma; le rate già in una bozza o fatturate restano. Le rate di un periodo nascono solo all'attivazione e
  al rinnovo, col canone di quel momento (cambiare il canone non riscrive niente).
- **La commessa del contratto**: "Assistenza {titolo}" senza raddoppiare "Assistenza", `budgetEuro` = canone, fine
  prevista = `al` (allungata a ogni rinnovo).
- **Tempi in ore di calendario** (come propone l'accordo; da confermare con Manuel): notti e domeniche contano.
- **Le origini `whatsapp` e `portale`** sono già nel CHECK del database (fase 7) ma non si accettano; `scadenza` la usa
  solo il server.
- **Statistiche**: `totale` resta anche senza `costi` (è un riassunto di conte), senza `costo` e `fatturato` dentro.
- **Categorie di sistema** (Mandati ai clienti, Da classificare, Documenti personali): si rinominano ma non si
  disattivano; Wisper le trova per nome e `sistema`.
- **`svuotaCestino` tiene la riga del file** (con `svuotato`): il registro e i documenti che lo citavano dicono che
  c'era; ripristinarlo è rifiutato.
- **La migrazione** tiene lo stesso id dei file dei documenti (gli indirizzi `/file/<id>` di prima aprono ancora) e
  segna `fuori_il` ai file già copiati, perché la copia nuova "uno alla volta" non rimandasse tutto la prima notte.
- **Dati di esempio**: Batokyo Srl (C004) e gli impianti 4-9; i contratti CA/2026/001, CA/2026/002 e CA/2025/004 attivi,
  con le commesse 26ST004-26ST006 (il prossimo codice è 26ST007) e le rate segnate fatturate fuori da Wisper come nel
  prototipo; i ticket partono da TK/2026/0009 come il prototipo (0015 e 0016 nascono dalle visite); i rapportini sono 15
  (RAP/2026/0014 di TK/2026/0012, RAP/2026/0015 di TK/2026/0010, fatturato fuori); la rev. 3 dello schema è caricata da
  Marco come nel prototipo (i dati di esempio gli danno documenti 2 per quel momento: col ruolo di base non potrebbe). Le
  prove vecchie che contavano rapportini, impianti o il prossimo codice commessa sono state portate ai numeri nuovi.
- **Non provato**: le app (telefono e computer) contro queste risposte; la seconda porta raggiunta da internet (Tailscale
  Funnel, decisione di Andrea); la copia fuori casa col postino vero (provata col postino finto); `fs.statfsSync` sul disco
  del NAS (provato su Windows: sul NAS va guardato il numero in Amministrazione › Spazio sul NAS); un caricamento vero da
  50 MB su una rete lenta (provati 49 e 51 MB in locale, anche senza `Content-Length`). Periodicità DPR 462, tempi
  d'intervento, categorie e approvazioni restano da confermare con Manuel (fase5.md §14).

## 17. Fase 6: le risposte, campo per campo

Persone e risorse umane, mezzi e attrezzature, collaboratori esterni (accordo in [`fase6.md`](fase6.md), ricerca in
[`ricerca-fase6.md`](ricerca-fase6.md), migrazione `006-persone-mezzi-collaboratori`, server 0.9.0). Valgono le regole
comuni della §12.1 (`ok`, `permesso:false`, date `"2026-10-22"`, istanti `"2026-10-22T18:46:45"` in ora italiana senza
fuso, le azioni che scrivono vogliono una POST), quelle della §15.1 sui soldi e quelle della §16.1. Gli esempi sono le
risposte vere del server di prova (`node server/src/avvio.js --prova --porta 8461 --dati <cartella nuova>`, 22/10/2026
alle 18:46), accorciate dove un elenco si ripete. I dati di esempio della fase 6 nascono attorno a oggi (le ferie di
Laura sono oggi e il prossimo giorno lavorativo, la richiesta di Marco è la settimana dopo la prossima, il DURC scade fra
7 giorni): gli esempi mostrano le date del 22/10/2026.

### 17.1 Regole comuni della fase 6

- **Moduli nuovi**: `persone` (organico, assenze, presenze, formazione, visite, uscita), `mezzi` (mezzi, attrezzature,
  tarature, manutenzioni, assegnazioni), `collaboratori` (collaboratori esterni, incarichi, compensi); la chiave speciale
  `riservati` (come `costi`). Leggere 1, scrivere 2; le eccezioni sono scritte azione per azione.
- **Ruolo nuovo `esterno`**: un utente legato a un collaboratore esterno (`utenti.soggetto_id`). Il server ha la lista
  delle sole azioni che un esterno può chiamare (`AZIONI_ESTERNO` in `richieste.js`): ogni altra risponde
  `permesso:false` **prima** di cercare qualunque cosa (§17.16).
- **Tre livelli di dati della persona** (fase6.md §3.2). Ogni oggetto con dati di una persona è segnato dal server
  (`datiPersona(o, idPersona, cosa)`); l'ultimo passaggio di **ogni** risposta (`togliDatiPersona` in `richieste.js`,
  prima di `togliCosti`) toglie, a qualunque profondità, chiavi comprese:
  - i **campi personali** (`CAMPI_PERSONALI` in `permessi.js`: `codiceFiscale`, `nascitaData`, `nascitaLuogo`,
    `indirizzo`, `cap`, `citta`, `provincia`, `telefonoPersonale`, `emailPersonale`, `iban`, `emergenzaNome`,
    `emergenzaTelefono`, `contrattoTipo`, `contrattoScade`, `motivoUscita`, `prossimaVisita`, `dpi`, `saldi`,
    `assenze`, `visite`, `causale`, `nota`, `protocollo`, `ferieAnnueOre`, `permessiAnnuiOre`) a chi non ha `persone` 2,
    tranne alla persona stessa;
  - i **campi riservati** (`CAMPI_RISERVATI`: `costoAnno`, `oreAnno`, `notaCosto`, `ccnl`, `livello`, `noteRiservate`,
    `giudizio`, `giudizioVisto`, `prescrizioni`, `validoFino`, `protocollo`, `tipoSanitario`, `documentoRiservato`) a chi
    non ha `riservati`, tranne alla persona stessa; **`costoAnno`, `oreAnno`, `notaCosto` nemmeno alla persona**;
  - `costoOrario` e `costoDal` sono campi dei **costi** (`CAMPI_COSTI`): li vede chi ha `costi`, la persona no.
  Il tipo delle assenze sanitarie (malattia, infortunio, congedo, Legge 104) arriva vero solo a chi ha `riservati` e alla
  persona: agli altri `tipoVisto: "Assente"` senza `tipo`, `causale`, `protocollo`. Le ferie e i permessi degli altri
  arrivano col tipo solo con `persone` 2 (il collaboratore e lettura: "Assente").
- **Registro di chi apre i dati riservati** (`accessi_riservati`, §17.6): ogni risposta che porta campi riservati di
  **un'altra** persona scrive una riga `visto` (una per utente, persona e cosa al giorno); scaricare un documento
  riservato di un'altra persona scrive `scaricato` (sempre); cambiare un campo riservato `cambiato`; esportare dati
  riservati `esportato`. Chi apre i suoi dati non lascia traccia. La tabella non si cambia e non si cancella (trigger).
- **Registro delle modifiche**: i campi personali e riservati hanno `"(riservato)"` al posto del valore nel prima/dopo
  (anche il tipo e la nota delle assenze, e il nome dei file caricati per una persona).
- **Mai la diagnosi**: nessun campo per malattie, sintomi o certificati medici; della visita del medico competente solo
  date, giudizio e prescrizioni (riservati); della malattia solo date e numero di protocollo (riservato).
- **Senza rete** (`idLocale` ripetuto = la stessa riga, con `giaArrivata: true`): `salvaAssenza`, `segnaKm`,
  `segnalaGuasto`, `assegna`, `restituisci` (l'`idLocale` del rientro), `salvaConsegnaDpi`; le foto con l'`idFile`.
- **Conferme** (`ok:false, serveConferma:true, errore`): salto di km grande, uscita, anonimizzazione, chiusura con le
  ferie, affidare con l'idoneità non in regola, attività per un assente.
- **Non collegato**: il programma paghe del consulente (`programmaPaghe: "non collegato"` nella scheda e nelle presenze,
  riga "Programma paghe del consulente · Non collegato" nell'esportazione), il servizio DURC online
  (`programmaDurc: "non collegato"`), la comunicazione all'Ispettorato degli occasionali
  (`comunicazioneIspettorato: "non collegato"`). Nessuna azione finge di farli.
- `io` e `/salute` dicono `versioneServer`/`versione` `"0.9.0"`; lo schema del database è 6.

### 17.2 Cosa cambia nelle azioni di prima

- **`io.interfaccia`** ha in più (vero, Marco): `"idPersona": 3, "puoApprovareAssenze": false, "vedeRiservati": false,
  "taraturaBlocco": "avviso"`. Per l'esterno (vero, Luca): `"idPersona": null, ..., "esterno": {"idSoggetto": "F006",
  "nome": "Impianti Veneti di Sartori Luca"}`. `puoApprovareAssenze` è vero per titolare e amministrazione (persone 2),
  `vedeRiservati` solo per chi ha `riservati`.
- **`anagrafiche`**: `utenti[].idPersona` (null per l'esterno) e `idSoggetto` per gli esterni; `fornitori[].collaboratore`
  (true/false); `numerazioni` con `{"tipo": "attrezzatura", "formato": "AT{NNN}", "annuale": false, "prossimo":
  "AT007"}` e `{"tipo": "incarico", "formato": "IN/{AAAA}/{NNN}", "annuale": true, "prossimo": "IN/2026/002"}`; con
  `mezzi` ≥ 1 anche `mezzi` (`[{"id": 2, "titolo": "Fiat Doblò GA123BC", "proprieta": "studio", "stato": "assegnato",
  "statoVisto": "Assegnato a Marco Rossato", "fermo": false, "mio": true}]`) e `mieiStrumenti` (le mie attrezzature con
  l'ultima taratura: `{"id": 4, "codice": "AT004", "nome": "Multimetro 87V", "matricola": "6011-2381", "controllo":
  "taratura", "fuoriUso": "", "ultimaTaratura": {"data": "2025-10-12", "scade": "2026-10-12", "esito": "conforme"},
  "taratura": {"stato": "scaduta", "parola": "Taratura scaduta da 10 giorni", "scade": "2026-10-12"}}`: il telefono
  ricalcola lo stato dalla data anche senza rete). L'esterno riceve solo le commesse dei suoi incarichi affidati o
  conclusi, i loro clienti col solo nome, le loro sedi; niente fornitori, referenti, altri utenti (§17.16).
- **`salvaUtente`**: un utente nuovo non esterno fa nascere la sua persona (stesso nome, rapporto vuoto: "Da
  completare"); il nome cambiato cambia anche la persona; il ruolo `esterno` vuole `idSoggetto` di un collaboratore
  (`"Esterno: scegli il collaboratore"`, `"Collaboratore F009 non trovato"`); un utente non passa da esterno a interno o
  viceversa.
- **`salvaRapportino`**: `strumenti: [{idAttrezzatura, confermato?}]` (l'elenco intero, §17.13); per l'esterno
  l'incarico si mette da solo (`"Non hai un incarico su 26ST002: chiedi allo studio"` se manca; cliente nuovo:
  `permesso:false`); **costo orario** come §17.4. `rapportini`/`rapportino`: `strumenti` (sempre un elenco, vuoto se non
  ce ne sono), `strumentiDaGuardare` (solo se c'è qualcosa da guardare), `idIncarico`.
- **`salvaOre`**: costo orario come §17.4; `idIncarico`; senza `idUtente` e con `idIncarico`, le ore di un collaboratore
  esterno senza accesso (collaboratori 2): costo 0. `ore`: `incarico` nelle righe e `assenza` nei giorni (`"Ferie"`,
  `"Assente"`, `""`). L'esterno scrive solo sulle commesse dei suoi incarichi.
- **`veicoli`, `salvaVeicolo`, `salvaTrasferta`**: `proprieta` (`persona` | `studio`), `targa`, `titolo`, `idPersona`,
  `fermo`, `motivoFermo`. Con un mezzo dello studio l'euro al km congelato è **0** e la trasferta ha
  `mezzoDelloStudio: true` (vero: `"euroKm": 0, "rimborsoKm": 0, "totale": 0, "mezzoDelloStudio": true`). Una trasferta
  con un mezzo fermo si salva lo stesso (è il racconto di quello che è successo). L'esterno: `veicoli` vuoto, nessuna
  trasferta.
- **`salvaSpesa`, `spese`**: `idVeicolo`, `idAttrezzatura`, `idIncarico`, `km` (una spesa `carburante` col mezzo e i km
  del contachilometri fa nascere una lettura `rifornimento`, se non va indietro). Le spese dell'esterno si legano da sole
  al suo incarico e **non vanno in `rimborsi`**.
- **`salvaRicevuta`, `ricevute`, `ricevuta`, `leggiXml`, `confermaXml`**: `idIncarico` (dello stesso fornitore, non
  annullato: la ricevuta prende la commessa dell'incarico), `idVeicolo`, `idAttrezzatura`. `leggiXml` di un fornitore con
  incarichi da fatturare propone l'incarico (`proposta.idIncarico`, `proposta.idCommessa` se è uno solo; `incarichi`
  sempre; l'avviso "È dell'incarico IN/2026/001? Restano da fatturare 720,00").
- **`scadenze`, `salvaScadenza`, `faiScadenza`, `togliScadenza`**: campi e filtri `idPersona`, `idVeicolo`,
  `idAttrezzatura`, `idSoggetto`, `gruppo` (`persone` | `mezzi` | `collaboratori`), `fineMese` (la revisione: l'ultimo
  giorno del mese), `idQualifica`, `idVisita`; i tipi nuovi (`formazione`, `abilitazione`, `visita_medica`,
  `contratto_lavoro`, `assicurazione`, `bollo`, `revisione`, `tagliando`, `taratura`, `verifica_dpi`, `durc`, `visura`,
  `idoneita`, `albo`; `polizza` c'era già). Chi le vede: quelle con una persona come i dati personali (persone 2 e la persona; gli altri non le
  trovano), quelle di mezzi e strumenti chi ha `mezzi` 1, quelle dei collaboratori chi ha `collaboratori` 1 (l'esterno
  le sue). Per scriverle serve il modulo del gruppo in scrittura; l'esterno scrive solo la scadenza di un suo documento
  (il DURC nuovo che carica).
- **`documenti`, `salvaDocumento`, `/carica`**: campi e filtri `idPersona`, `idVeicolo`, `idAttrezzatura`, `idIncarico`,
  `idSoggetto` (per i documenti dei collaboratori è il loro `F...`, nella colonna del cliente); `tipoScadenza` (`durc`,
  `visura`, ...) fa nascere la scadenza proposta (DURC 120 giorni, visura 6 mesi, gli altri 12). `/carica?per=persona`
  (persone 2; il nome del file nel registro è `"(riservato)"`), `per=mezzo` e `per=attrezzatura` (mezzi 2),
  `per=collaboratore` (collaboratori 2; l'esterno i suoi). Un documento di una persona lo vedono solo chi ha persone 2 e
  la persona; se è riservato solo chi ha `riservati` e la persona; gli altri non lo trovano (`/file/<id>` → 403).
- **`salvaAttivita`, `pianificaTicket`**: per una persona assente quel giorno (assenza approvata; un permesso a ore solo
  se si accavalla con l'orario) rispondono come le sovrapposizioni (vero):
  ```json
  {"ok": false, "errore": "Laura Bianchi è in ferie quel giorno (dal 22 al 23 ottobre)",
   "assenti": [{"idUtente": 2, "idPersona": 2, "nome": "Laura Bianchi", "dal": "2026-10-22", "al": "2026-10-23", "tipoVisto": "Ferie"}],
   "serveConferma": true}
  ```
  con `conferma: true` si salva. Un'attività con la sola scadenza (senza ora) non chiede niente.
- **`attivita`**: l'esterno vede solo le sue (assegnate a lui o create da lui), non quelle libere dello studio.
- **`daApprovare`, `approva`, `respingi`, `annullaApprovazione`**: il tipo `assenza` (§17.8); l'anomalia nuova `inAssenza`
  sulle ore ("Ore in un giorno di ferie", "... di festa", "... di chiusura dello studio").
- **`costoCommessa`** (§17.15); **`ticket {id}`**: `strumenti` e `tarataScaduta` (§17.13).
- **`componiModello`**: `idIncarico` e il modello `LETTERA_INCARICO` (collaboratore, incarico, compenso solo con `costi`,
  descrizione, dal, al, commessa).
- **`dashboard`** (§17.17), **`esporta`** (§17.19).

### 17.3 Persone: l'organico e la scheda

`persone {stato?: "attive"|"uscite"|"tutte", testo?}` (persone 1; di base le attive) → vero, Manuel (accorciato):
```json
{"ok": true, "persone": [
  {"id": 2, "nome": "Laura Bianchi", "rapporto": "dipendente", "rapportoNome": "Dipendente", "ruoloStudio": "Amministrazione",
   "telefonoLavoro": "0445 000302", "emailLavoro": "laura@esempio.it", "entrataIl": "2024-03-01", "uscitaIl": "",
   "idUtente": 2, "ruoloWisper": "amministrazione", "accessoAttivo": true,
   "assenteOggi": {"dal": "2026-10-22", "al": "2026-10-23", "tipoVisto": "Ferie"},
   "daCompletare": false, "anonimizzata": false, "scadenzeVicine": 0, "scadute": 0, "costoOrario": 22.4, "costoDal": "2026-01-01"},
  {"id": 5, "nome": "Elena Costa", "rapporto": "tirocinante", "rapportoNome": "Tirocinante", "idUtente": null, "accessoAttivo": false, "...": "..."}],
 "conteggi": {"attive": 5, "senzaAccesso": 1, "assentiOggi": 1, "daCompletare": 1}}
```
Al collaboratore la rubrica: le attive coi campi di lavoro, `assenteOggi.tipoVisto` "Assente", niente `costoOrario`,
`scadenzeVicine` e `scadute` solo nella sua riga. Lettura: come il collaboratore più `costoOrario` (costi 1).
`rapportoNome`: Titolare, Socio, Dipendente, Apprendista, Tirocinante, A partita IVA nello studio, Altro, "Da completare"
(rapporto vuoto). Errore: `"Stato: attive, uscite o tutte"`.

`persona {id?}` (persone 1; senza id la propria) → la scheda coi tre livelli. Vera per Manuel che guarda Marco
(accorciata):
```json
{"ok": true, "persona": {"id": 3, "nome": "Marco Rossato", "rapporto": "dipendente", "rapportoNome": "Dipendente",
 "ruoloStudio": "Tecnico elettrico", "mansione": "Lavori elettrici fuori tensione e in prossimità; verifiche",
 "emailLavoro": "marco@esempio.it", "telefonoLavoro": "0445 000301", "entrataIl": "2023-05-02", "uscitaIl": "",
 "oreSettimana": 40, "giorniSettimana": [1, 2, 3, 4, 5], "oreGiorno": 8, "partTime": false, "idUtente": 3,
 "ruoloWisper": "collaboratore", "accessoAttivo": true, "ultimoAccesso": "2026-10-22T18:14:49", "assenteOggi": null,
 "anonimizzata": false, "anonimizzataIl": "",
 "codiceFiscale": "RSSMRC90A01L157X", "nascitaData": "", "nascitaLuogo": "", "indirizzo": "Via dell'Esempio 22", "cap": "36016",
 "citta": "Thiene", "provincia": "VI", "telefonoPersonale": "333 0000301", "emailPersonale": "", "iban": "IT60X0542811101000000123456",
 "emergenzaNome": "Giulia Rossato", "emergenzaTelefono": "333 0000302", "contrattoTipo": "indeterminato", "contrattoScade": "",
 "motivoUscita": "", "ferieAnnueOre": 208, "permessiAnnuiOre": 72,
 "ccnl": "Studi professionali", "livello": "3", "noteRiservate": "",
 "costoOrario": 28.5, "costoDal": "2026-01-01", "costoAnno": 47025, "oreAnno": 1650, "notaCosto": "Dal prospetto del consulente di febbraio",
 "costi": [{"id": 2, "dal": "2026-01-01", "costoOrario": 28.5, "costoAnno": 47025, "oreAnno": 1650, "notaCosto": "Dal prospetto del consulente di febbraio"}],
 "mezzi": [{"tipo": "mezzo", "id": 2, "nome": "Fiat Doblò GA123BC", "come": "assegnato", "dal": "2026-10-22", "rientro": ""}],
 "attrezzature": [{"id": 4, "codice": "AT004", "nome": "Multimetro 87V", "categoria": "strumento", "come": "assegnato", "dal": "2026-10-22",
   "rientro": "", "taratura": "Taratura scaduta da 10 giorni"}],
 "qualifiche": [{"id": 2, "idPersona": 3, "tipo": "primo_soccorso", "nome": "Primo soccorso", "gruppo": "emergenza", "titolo": "Gruppo B, 12 ore",
   "data": "2023-09-20", "scade": "2026-09-20", "ente": "", "ore": null, "idDocumento": null, "idScadenza": 11, "nota": "",
   "statoVisto": "Scaduta", "statoDettaglio": "da 32 giorni", "giorni": 32, "rinnovataDa": null}],
 "visite": [{"id": 1, "idPersona": 3, "data": "2025-11-04", "tipo": "periodica", "giudizio": "idoneo_prescrizioni",
   "giudizioVisto": "Idoneo con prescrizioni", "prescrizioni": "Niente sollevamento di carichi oltre 15 kg", "validoFino": "",
   "prossima": "2026-11-04", "medico": "Medico competente di esempio", "idDocumento": null, "riga": "Visita del 04/11/2025 · prossima il 04/11/2026"}],
 "prossimaVisita": "2026-11-04",
 "dpi": [{"id": 2, "cosa": "Elmetto con visiera", "taglia": "unica", "quantita": 1, "data": "2026-10-20", "firmata": false, "daFirmare": true, "...": "..."}],
 "saldi": {"ferie": {"tenuto": true, "scritto": 104, "scrittoIl": "2026-09-30", "maturate": 0, "godute": 0, "oggi": 104, "prenotate": 40,
   "restano": 64, "oreGiorno": 8, "giorniOggi": 13, "giorniRestano": 8}, "permessi": {"tenuto": true, "scritto": 24, "...": "..."}},
 "assenze": [{"id": 1, "tipo": "ferie", "tipoVisto": "Ferie", "dal": "2026-11-02", "al": "2026-11-06", "stato": "da_approvare", "...": "..."}],
 "scadenze": [{"id": 11, "titolo": "Primo soccorso di Marco Rossato", "data": "2026-09-20", "statoVisto": "Scaduta", "gruppo": "persone", "...": "..."}],
 "documenti": [{"id": 14, "titolo": "Cedolino del mese scorso", "categoria": "Cedolini", "vede": "riservati", "idPersona": 3,
   "documentoRiservato": true, "riservato": true, "url": "/file/...", "...": "..."}],
 "puoScrivere": true, "puoCambiareContatti": true, "puoVedereRiservati": true, "puoApprovare": true, "daCompletare": [],
 "programmaPaghe": "non collegato"}}
```
- **Chi vede cosa** (provato campo per campo in `prove/persone.test.js`):
  - **Laura** (amministrazione: persone 2, costi 2, riservati 0): lavoro, personali, `costoOrario`, `costoDal`, `costi`
    (senza `costoAnno`, `oreAnno`, `notaCosto`); niente `ccnl`, `livello`, `noteRiservate`, `costoAnno`, `oreAnno`,
    `notaCosto`; nelle visite niente `giudizio`, `giudizioVisto`, `prescrizioni`, `validoFino`; il cedolino non c'è.
  - **Marco su di sé**: lavoro, personali, riservati (giudizi, CCNL, il suo cedolino), **non** `costoOrario`,
    `costoDal`, `costi`, `costoAnno`, `oreAnno`, `notaCosto`; `puoCambiareContatti: true`.
  - **Marco che apre Laura**: solo lavoro, `assenteOggi.tipoVisto` "Assente", `qualifiche: []` (le competenze degli
    altri non sono della rubrica), niente `scadenze`, `documenti: []`.
  - **Lettura**: lavoro (anche le competenze) e `costoOrario`, `costoDal`, `costi`; niente personali e riservati.
  - **Esterno**: `permesso:false`.
- `oreGiorno` = `oreSettimana` / giorni (`ORE_GIORNALIERE` × 5 se `oreSettimana` è vuoto). `daCompletare`: le frasi di
  quello che manca ("Scegli il rapporto con lo studio", "Manca il costo orario: le sue ore usano il costo dello studio"),
  solo a chi può scriverle (persone 2; il costo con costi 2). Errore: `"Persona 9 non trovata"`.

### 17.4 Scrivere la scheda, l'accesso, il costo orario

- `salvaPersona {persona: {id?, nome, rapporto?, ruoloStudio?, mansione?, telefonoLavoro?, emailLavoro?, entrataIl?,
  oreSettimana?, giorniSettimana?, codiceFiscale?, ..., ccnl?, livello?, noteRiservate?, ferieAnnueOre?,
  permessiAnnuiOre?}}` → `{ok, persona}` (la scheda). Persone 2: tutto (i riservati con `riservati` 2:
  `"Non hai il permesso per scrivere i dati riservati: chiedi al titolare"`). **La persona stessa** (anche il
  collaboratore con persone 1 e lettura) cambia solo i suoi `telefonoPersonale`, `emailPersonale`, `indirizzo`, `cap`,
  `citta`, `provincia`, `iban`, `emergenzaNome`, `emergenzaTelefono`; altro: `"Puoi cambiare solo i tuoi contatti,
  l'indirizzo, l'IBAN e il contatto di emergenza"` (`permesso:false`); la scheda di un altro:
  `"Non hai il permesso per cambiare le schede degli altri: chiedi al titolare"`. Il nome cambia anche nell'utente.
  `contrattoScade` crea, sposta o toglie la scadenza `contratto_lavoro`. Errori: `"Nome: scrivi il nome"`, `"Rapporto:
  titolare, socio, dipendente, apprendista, tirocinante, autonomo o altro"`, `"Contratto: indeterminato, determinato,
  apprendistato, stage, parasubordinato o partita_iva"`, `"Codice fiscale: deve avere 16 caratteri"`, `"CAP: deve avere 5
  cifre"`, `"IBAN: non sembra giusto"`, `"Email: manca la @ o c'è uno spazio"`, `"Ore alla settimana: da 1 a 60"`,
  `"Giorni: scegli in che giorni lavora"`, `"La scheda è stata resa anonima: non si cambia"`.
- `daiAccesso {idPersona, email, ruolo}` (amministrazione 2) → crea l'utente col nome della persona e lo lega (password
  iniziale come la fase 1: `{ok, utente, passwordIniziale}`). `"Ruolo: titolare, amministrazione, collaboratore o lettura"` (l'esterno si invita dal
  collaboratore, §17.14).
- **Costo orario della persona** (fase6.md §3.3, `costoOrarioDelLavoro` in conti.js): congelato in una riga di **ore** e
  in un **rapportino** che nasce (o che cambia commessa), alla data del lavoro: (1) esterno, o ore di un collaboratore
  esterno senza accesso → **0** (`costoNoto` resta vero: il costo è l'incarico); (2) la persona ha un costo valido quel
  giorno (la riga con `dal` più recente ≤ data) → quello; (3) altrimenti la regola di oggi (costo fisso del cliente →
  costo orario della commessa → `COSTO_ORARIO`). Il budget e il costo previsto della commessa restano `costoOrarioDi`
  (non cambiano). Le righe già scritte non si ricalcolano mai.
- `salvaCostoPersona {idPersona, dal, costoOrario? | costoAnno + oreAnno, nota?}` (persone 2 e costi 2; costo dell'anno e
  nota con `riservati` 2) → vero:
  ```json
  {"ok": true, "costi": [{"id": 3, "dal": "2026-10-22", "costoOrario": 17.05, "costoAnno": 15000, "oreAnno": 880, "notaCosto": ""}],
   "frase": "Vale per le ore e i rapportini nuovi dal 22/10/2026: quelli già scritti tengono il loro costo"}
  ```
  Senza `costoOrario` si usa `costoOrarioDaAnno` (al centesimo). Nel registro `"costo dal {data}: vale per le righe
  nuove"`; il costo dell'anno cambiato scrive `cambiato` negli accessi riservati. Errori: `"Dal: scrivi da quando vale
  il costo"`, `"Dal: c'è già un costo da quel giorno"`, `"Costo orario: scrivi il costo o il costo dell'anno e le ore"`.
- `togliCostoPersona {id}` (persone 2 e costi 2): la riga si toglie; le ore e i rapportini già scritti tengono il costo
  che avevano.

### 17.5 Formazione, visite mediche, DPI

- `qualificheTipi {}` (persone 1) → `{ok, tipi: [{chiave, nome, gruppo, ogniMesi, preavvisoGiorni, attivo, sistema}]}`
  (15 di sistema: PES, PAV, PEI, formazione generale e specifica, preposto, datore, RSPP datore, RLS, primo soccorso,
  antincendio, lavori in quota, PLE, patente, altro). `salvaQualificaTipo {tipo: {chiave?, nome, gruppo, ogniMesi,
  preavvisoGiorni, attivo}}` (amministrazione 2): `"Nome: scrivi il nome della formazione o abilitazione"`, `"Gruppo:
  elettrico, sicurezza, emergenza o altro"`, `"Ogni: da 1 a 240 mesi"`, `"C'è già un tipo «PES»"`.
- `salvaQualifica {qualifica: {id?, idPersona, tipo, titolo?, data, scade?, ente?, ore?, idFile?, nota?}, rinnova?: id}`
  (persone 2) → `{ok, qualifica}`: con `scade` (o il tipo con `ogniMesi`) nasce la scadenza (`formazione` o
  `abilitazione`, "Primo soccorso di Marco Rossato"); **Rinnova** fa la qualifica nuova, segna fatta la scadenza della
  vecchia (che resta nello storico con `rinnovataDa`). `statoVisto`: Valida ("fino al 12/02/2029"), "Scade fra N giorni",
  Scaduta ("da 32 giorni"), "Non scade". Il documento (attestato) da `/carica`: categoria Attestati e abilitazioni.
  `togliQualifica {id, annulla?}`: esce dalla scheda (annulla la rimette), la sua scadenza si toglie.
- `salvaVisita {visita: {id?, idPersona, data, tipo, giudizio?, prescrizioni?, validoFino?, prossima?, medico?, idFile?}}`
  (persone 2; `giudizio`, `prescrizioni`, `validoFino` e il documento con `riservati` 2) → `{ok, visita}`; `prossima`
  (di base un anno) fa la scadenza `visita_medica` ("Visita medica di Marco Rossato"). `giudizioVisto`: Idoneo, Idoneo con
  prescrizioni, Non idoneo per un periodo, Non idoneo. **Non c'è un campo per la diagnosi.** Errori: `"Tipo: preventiva,
  periodica, richiesta, cambio_mansione, rientro o cessazione"`, `"Giudizio: idoneo, idoneo_prescrizioni,
  non_idoneo_temporaneo o non_idoneo"`, `"Prossima: deve venire dopo la visita"`. `togliVisita {id}`.
- `dpi {idPersona?}` → vero (Marco, le sue):
  ```json
  {"ok": true, "consegne": [
    {"id": 2, "idLocale": "", "idPersona": 3, "persona": "Marco Rossato", "cosa": "Elmetto con visiera", "taglia": "unica", "quantita": 1,
     "data": "2026-10-20", "idAttrezzatura": null, "scade": "", "firmata": false, "firmataIl": "", "firma": null, "restituitoIl": "", "nota": "", "daFirmare": true},
    {"id": 1, "cosa": "Guanti isolanti classe 0", "taglia": "9", "idAttrezzatura": 5, "firmata": true, "firmataIl": "2026-10-22T18:46:19",
     "firma": {"id": "YXMF...", "url": "/file/YXMF..."}, "daFirmare": false, "...": "..."}],
   "proposte": ["Guanti isolanti", "Elmetto con visiera", "Calzature di sicurezza", "Occhiali", "Imbracatura anticaduta", "Tuta", "Otoprotettori", "Altro"]}
  ```
  Chi ha persone 2 o mezzi 2 vede tutte; gli altri solo le proprie (`"Non hai il permesso per vedere i DPI degli altri:
  chiedi al titolare"`).
- `salvaConsegnaDpi {consegna: {id?, idLocale?, idPersona, cosa, taglia?, quantita?, data?, idAttrezzatura?, scade?,
  nota?}, firma?: {base64, mime}}` (persone 2 o mezzi 2): un DPI del catalogo (`idAttrezzatura`) consegnato diventa
  assegnato alla persona. `firmaConsegna {id, base64, mime}`: la persona firma le sue (anche dopo, dal suo telefono), o chi
  consegna (`"Firma vuota: firma di nuovo"`, `"La firma deve essere un'immagine"`). `restituisciDpi {id, data?}`: un DPI
  del catalogo torna disponibile.

### 17.6 Il registro di chi apre i dati riservati

`accessiRiservati {idPersona?, da?, a?, utente?, pagina?}` (il titolare tutto; la persona i suoi; 100 per pagina) → vero
(Marco):
```json
{"ok": true, "pagina": 1, "pagine": 1, "quanti": 7, "righe": [
  {"quando": "2026-10-22T18:46:45", "idUtente": 1, "utente": "Manuel Gasparotto", "idPersona": 3, "persona": "Marco Rossato",
   "cosa": "scheda", "azione": "visto", "riferimento": "", "frase": "Ha visto i dati riservati della scheda", "disp": "cattura per il contratto"},
  {"quando": "2026-10-22T18:46:45", "cosa": "visita", "azione": "visto", "frase": "Ha visto il giudizio della visita medica", "...": "..."},
  {"quando": "2026-10-22T18:46:45", "cosa": "costo", "azione": "visto", "frase": "Ha visto il costo dell'anno", "...": "..."}]}
```
`cosa`: `scheda`, `costo`, `visita`, `assenza`, `documento`, `esportazione`; `azione`: `visto`, `scaricato`,
`cambiato`, `esportato`. Frasi: "Ha scaricato «Cedolino del mese scorso»", "Ha visto i documenti riservati" (l'elenco),
"Ha visto il tipo delle assenze", "Ha esportato i dati riservati". Un altro che chiede quelli di una persona non sua:
`"Non hai il permesso per vedere chi ha aperto i dati riservati (lo vede il titolare): chiedi al titolare"`.

### 17.7 Uscita e anonimizzazione

- `segnaUscita {idPersona, data, motivo?, conferma?}` (persone 2). Prima risposta (vera):
  ```json
  {"ok": false, "serveConferma": true, "frase": "Marco Rossato esce il 31/01/2027. Ecco cosa succede:",
   "daFare": {"accesso": "L'accesso a Wisper si disattiva alla fine del 31/01/2027",
     "daRestituire": [{"tipo": "mezzo", "id": 2, "nome": "Fiat Doblò GA123BC"}, {"tipo": "attrezzatura", "id": 4, "nome": "Multimetro 87V"},
       {"tipo": "dpi", "id": 2, "nome": "Elmetto con visiera"}],
     "assenzeFuture": 1, "attivitaFuture": 0, "ticketInCarico": 1, "attivita": [], "ticket": ["TK/2026/0013 · Navetta 2 si ferma in errore"],
     "scadenzeAperte": 3, "contattiTolti": ["telefono personale", "contatto di emergenza"]},
   "errore": "Marco Rossato esce il 31/01/2027: conferma per segnare l'uscita"}
  ```
  Con `conferma`: `{ok, persona, daRestituire}`; l'accesso si disattiva dalla fine di quel giorno (subito se è passato:
  `"L'accesso a Wisper si disattiva adesso"`, il token smette di valere), le assenze future si annullano (motivo "Uscita";
  quelle a cavallo si accorciano), le attività da dopo l'uscita e i ticket in carico restano senza nessuno (i ticket di
  nuovo aperti), le scadenze della persona si annullano, telefono personale e contatto di emergenza si tolgono subito.
  Ore, rapportini, spese restano. Nel registro `"uscita: {data}"`. Errori: `"Uscita: scrivi l'ultimo giorno"`,
  `"Uscita: non può venire prima dell'entrata"`.
- `annullaUscita {idPersona}` (persone 2): finché la data non è passata o entro 30 giorni (`"L'uscita è di più di 30
  giorni fa: non si annulla"`); l'accesso non torna da solo (si ridà con `salvaUtente`).
- `anonimizzaPersona {idPersona, conferma?}` (**solo il titolare**, con `riservati` 2; amministrazione: `permesso:false`).
  Vuole l'uscita (`"Prima segna l'uscita di Marco Rossato"`), non la propria scheda. Prima risposta: `serveConferma`,
  `frase: "Non si torna indietro"`, `siToglie` (dati personali e riservati, costi, assenze e saldi, visite, formazione,
  consegne DPI e firme, "N documenti (anche dal disco del NAS)"), `resta` (ore, rapportini anche col nome sul PDF dei
  firmati, spese e trasferte, attività, ticket), `nomeNuovo: "Persona uscita nel 2026"`. Con `conferma`: svuota i campi,
  toglie le righe e **i file dal disco** (documenti con tutte le revisioni, firme delle consegne: non nel cestino), nome
  della persona e dell'utente "Persona uscita nel {anno}", utente disattivato. Restano `accessi_riservati` (id e date) e
  il registro (che ha già `"(riservato)"` al posto dei valori). Ripetuta: `ok`. Dashboard (solo titolare): le persone
  uscite da più di `PERSONE_CONSERVA_ANNI` anni.

### 17.8 Ferie, permessi e assenze

- `assenze {da?, a?, idPersona?, stato?: "aperte"|"da_approvare"|"tutte", tipo?}` (persone 1). Senza date: le future e in
  corso più le da approvare; con le date quelle del periodo (il calendario), con `chiusure` e `festivi` del periodo. Vera
  (Marco):
  ```json
  {"ok": true, "oggi": "2026-10-22", "assenze": [
    {"id": 2, "idLocale": "", "idPersona": 2, "persona": "Laura Bianchi", "tipoVisto": "Assente", "dal": "2026-10-22", "al": "2026-10-23",
     "mezza": "", "dalle": "", "alle": "", "giorni": 2, "ore": 12, "stato": "approvata", "statoVisto": "Approvata", "approvataDa": 1,
     "approvataDaNome": "Manuel Gasparotto", "approvataIl": "2026-10-22T18:46:19", "motivoRifiuto": "", "motivoAnnullo": "",
     "chiusura": "", "idChiusura": null, "daApprovare": false, "puoScrivere": false, "puoAnnullare": false},
    {"id": 1, "idPersona": 3, "persona": "Marco Rossato", "tipo": "ferie", "tipoVisto": "Ferie", "causale": "", "dal": "2026-11-02",
     "al": "2026-11-06", "giorni": 5, "ore": 40, "stato": "da_approvare", "statoVisto": "Da approvare", "nota": "Matrimonio di mio fratello",
     "protocollo": "", "daApprovare": true, "puoScrivere": true, "puoAnnullare": true, "...": "..."}]}
  ```
  Il collaboratore riceve le sue con tutto e quelle dei colleghi come "Assente" (approvate e da approvare); chi ha
  `riservati` riceve anche `tipoSanitario: true` sulle sanitarie. `statoVisto`: Bozza, Da approvare, Approvata, Respinta,
  Annullata.
- `salvaAssenza {assenza: {id?, idLocale?, idPersona?, tipo, causale?, dal, al?, mezza?, dalle?, alle?, ore?, nota?,
  protocollo?, bozza?}}` (persone 1 per sé, 2 per gli altri) → vero:
  ```json
  {"ok": true, "assenza": {"id": 4, "idLocale": "cattura-ass-1", "idPersona": 3, "tipo": "permesso", "tipoVisto": "Permesso", "dal": "2027-02-03",
    "al": "2027-02-03", "dalle": "15:00", "alle": "18:00", "giorni": 0, "ore": 3, "stato": "da_approvare", "statoVisto": "Da approvare", "...": "..."},
   "saldi": {"ferie": {"tenuto": true, "restano": 64, "...": "..."}, "permessi": {"tenuto": true, "scritto": 24, "prenotate": 3, "restano": 21, "oreGiorno": 8}},
   "anomalie": []}
  ```
  Tipi: `ferie`, `permesso`, `altro` (con la causale) si chiedono; `malattia`, `infortunio`, `congedo`, `legge104` si
  **segnalano**: nascono approvate (non si approvano né si respingono: `"Questa assenza non si approva: è nata
  approvata"`), si annullano soltanto. Giorni e ore da `oreAssenza` (§17.20). Le altre nascono da approvare, o approvate se
  per quella persona non serve (`APPROVAZIONE` della fase 3: il titolare solo con "tutti"). `saldi` solo a chi vede i
  personali. Errori: `"Tipo: ferie, permesso, malattia, infortunio, congedo, legge104 o altro"`, `"Altro: scrivi la
  causale"`, `"Dal: scrivi il primo giorno"`, `"Al: non può venire prima di Dal"`, `"Mezza giornata: mattina o
  pomeriggio"`, `"Permesso: scrivi dalle e alle, o le ore"`, `"Alle: deve venire dopo dalle"`, `"Ore: da 0 a 24"`,
  `"In quei giorni non lavori: niente da chiedere"`, `"Il 03/11 sei già in ferie: cambia quella richiesta"` (per un altro:
  `"Il 03/11 Marco Rossato è già ..."`; due permessi in ore diverse si possono), `"È già approvata: per cambiarla chiedi a
  chi approva"`, `"L'assenza è stata annullata: chiedine una nuova"`, `"Il tipo non passa da una richiesta a una
  segnalazione: annullala e scrivine una nuova"`.
- **Accorciare** una ferie in corso: `salvaAssenza {assenza: {id, al: ieri}}` (chi approva): le ore si rifanno.
- `annullaAssenza {id, motivo?}`: la persona le sue finché non cominciano (`"L'assenza è già cominciata: per cambiarla
  chiedi a chi approva"`); chi approva sempre, col motivo per quelle degli altri (`"Scrivi il motivo: arriva a chi l'ha
  chiesta"`), **tranne una ferie in corso** (cominciata prima di oggi e non finita): `"Le ferie sono in corso: accorciale
  fino a ieri, non si annullano"` (§17.22). Nel registro `"assenza annullata: {motivo}"`.
- **Approvare** (lo schema della fase 3): `daApprovare` ha le voci `assenza` (vera):
  ```json
  {"tipo": "assenza", "id": 1, "idUtente": 3, "idPersona": 3, "data": "2026-11-02", "cosa": "Ferie",
   "dettaglio": "Da lunedì 2 a venerdì 6 novembre · 5 giorni · restano 8 giorni", "quanto": 40, "unita": "ore", "anomalie": []}
  ```
  (le persone senza accesso col nome, `idUtente: null`). `approva`, `respingi {motivo}`, `annullaApprovazione` accettano
  `{tipo: "assenza", id}` (titolare e amministrazione con persone 2). **Nessuno approva le proprie, tranne il titolare**
  (`"Le tue ferie le approva il titolare"`; nemmeno compaiono tra le sue da approvare). Una ferie approvata e cominciata non
  torna da approvare né si respinge (`"Le ferie sono già cominciate: annullale dal giorno di oggi"`); una bozza non si
  decide (`"La richiesta è ancora in bozza: chi l'ha scritta deve prima mandarla"`). Registro: `"ferie approvate"`,
  `"permesso respinto: {motivo}"`.
- **Anomalie** (in giallo scuro, nella risposta di `salvaAssenza` e nella voce): `saldoNegativo` ("Dopo questa richiesta
  restano −56 ore di ferie"), `colleghiAssenti` ("Negli stessi giorni è assente anche Laura Bianchi"), `impegni` ("Ha 1
  attività in quei giorni: Sopralluogo quadri di prova martedì 4"), `oreRegistrate` ("Ha già ore o rapportini in quei
  giorni").
- `saldi {idPersona}` (persone 1 per la propria, 2 per gli altri: `"Non hai il permesso per vedere il saldo delle ferie
  degli altri: chiedi al titolare"`) → vero:
  ```json
  {"ok": true, "idPersona": 3, "saldi": {
    "ferie": {"tenuto": true, "scritto": 104, "scrittoIl": "2026-09-30", "maturate": 0, "godute": 0, "oggi": 104, "prenotate": 40, "restano": 64,
              "oreGiorno": 8, "giorniOggi": 13, "giorniRestano": 8},
    "permessi": {"tenuto": true, "scritto": 24, "scrittoIl": "2026-09-30", "maturate": 0, "godute": 0, "oggi": 24, "prenotate": 0, "restano": 24, "oreGiorno": 8}}}
  ```
  Senza ore all'anno né saldo: `{"tenuto": false}`. `salvaSaldo {idPersona, tipo: "ferie"|"permessi", data, ore, nota?}`
  (persone 2, "Aggiorna dal cedolino") → `{ok, idPersona, saldi}`; nel registro `"saldo dal cedolino del {data}"`. Errori: `"Tipo:
  ferie o permessi"`, `"Data: scrivi a che giorno è il residuo del cedolino"`, `"Ore: scrivi il residuo del cedolino in
  ore"`.

### 17.9 Chiusure dello studio e presenze

- `chiusure {anno?}` (persone 1) → `{ok, chiusure: [{id, nome, dal, al, ferie, assenze, frase: "Studio chiuso: Natale"}]}`.
- `salvaChiusura {chiusura: {id?, nome, dal, al, ferie}, conferma?}` (persone 2). Con `ferie: true`, prima risposta vera:
  ```json
  {"ok": false, "serveConferma": true,
   "errore": "Nascono le ferie di Natale per 2 persone: Laura Bianchi 7 giorni (42 ore), Marco Rossato 7 giorni (56 ore)",
   "persone": [{"idPersona": 2, "nome": "Laura Bianchi", "giorni": 7, "ore": 42}, {"idPersona": 3, "nome": "Marco Rossato", "giorni": 7, "ore": 56}]}
  ```
  Con `conferma`: per ogni persona attiva quei giorni con le ferie tenute (`ferie_annue_ore`) nascono ferie **approvate**
  con `chiusura_id`, a pezzi contigui, saltando i giorni in cui ha già un'assenza (anche un permesso a ore). Cambiare la
  chiusura le rifà (non quelle cambiate a mano); `togliChiusura {id, conferma?}` le toglie. Senza `ferie`: solo la fascia
  "Studio chiuso". Le chiusure non sono festivi: sono assenze. Errori: `"Nome: scrivi il nome della chiusura (per esempio
  Natale)"`, `"Dal: scrivi il primo giorno"`, `"Al: non può venire prima di Dal"`.
- `presenze {mese: "2026-10", idPersona?}` (persone 1; il collaboratore solo la sua) → vera (Manuel, Laura, accorciata):
  ```json
  {"ok": true, "mese": "2026-10", "festivi": ["2026-10-04"], "chiusure": [], "persone": [
    {"idPersona": 2, "nome": "Laura Bianchi", "oreGiorno": 6, "giorni": [
      {"data": "2026-10-13", "previste": 6, "lavorate": 0, "straordinarie": 0, "assenza": {"tipoVisto": "Malattia", "ore": 6}, "manca": 0, "giorno": ""},
      {"data": "2026-10-20", "previste": 6, "lavorate": 2, "straordinarie": 0, "assenza": null, "manca": 4, "giorno": ""}],
     "totali": {"giorniLavorati": 2, "oreLavorate": 9.5, "straordinarie": 0, "ferie": 12, "permessi": 0, "malattia": {"giorni": 1, "ore": 6},
                "altreAssenze": 0, "mancano": 106}}],
   "programmaPaghe": "non collegato"}
  ```
  `giorno`: `festa`, `chiuso` o `""`. Ricavate (niente timbrature, niente posizione): `lavorate` = ore registrate (mandate
  o approvate) + ore dei rapportini non annullati; `straordinarie` = ore straordinarie + ore extra dei rapportini; `manca`
  = previste − lavorate − assenza, se positivo. Chi non ha `riservati`: le sanitarie degli altri "Assente", in
  `altreAssenze`, e `totali` senza `malattia`; chi le vede (titolare) lascia la riga `visto` negli accessi riservati.

### 17.10 Mezzi: scheda, km, guasti, manutenzioni, costi

- `mezzi {tutti?}` (mezzi 1; prima quelli che ho io; `tutti` anche i dismessi) → vero (accorciato):
  ```json
  {"ok": true, "mezzi": [
    {"id": 2, "nome": "Fiat Doblò", "targa": "GA123BC", "titolo": "Fiat Doblò GA123BC", "tipo": "furgone", "proprieta": "studio",
     "proprietaVista": "Dello studio", "idPersona": null, "statoVisto": "Assegnato a Marco Rossato", "stato": "assegnato", "motivoFermo": "",
     "chi": {"idAssegnazione": 1, "tipo": "assegnato", "idPersona": 3, "idCommessa": "", "idSoggetto": "", "nome": "Marco Rossato", "dal": "2026-10-22", "rientro": ""},
     "km": 84350, "kmIl": "2026-10-22", "kmAlTagliando": 5650,
     "prossimaScadenza": {"id": 17, "tipo": "assicurazione", "data": "2026-11-05", "statoVisto": "Scade fra 14 giorni"},
     "guastiAperti": 1, "fermo": false, "mio": false, "attivo": true, "euroKm": null},
    {"id": 1, "titolo": "Volvo XC40", "tipo": "auto", "proprieta": "persona", "proprietaVista": "Auto di Manuel Gasparotto", "idPersona": 1,
     "statoVisto": "Auto di Manuel Gasparotto", "stato": "persona", "chi": {"idPersona": 1, "nome": "Manuel Gasparotto", "tipo": "sua"}, "euroKm": 0.76, "...": "..."}],
   "conteggi": {"mezzi": 2, "fermi": 0, "guastiAperti": 1, "scadenzeVicine": 1}}
  ```
  `stato`: `fermo` (rosso: assicurazione o revisione scadute, o guasto con fermo: "Fermo: revisione scaduta"),
  `officina`, `prestito`, `assegnato`, `disponibile`, `persona` (l'auto di una persona), `dismesso`.
- `mezzo {id}` (mezzi 1) → la scheda: in più `immatricolazione`, `alimentazione`, `annoAci`, `tagliandoKm`,
  `tagliandoUltimoKm`, `tagliandoOgniMesi`, `note`, `dismessoIl`, `dismessoMotivo`, `scadenze` (assicurazione, bollo,
  revisione, tagliando: righe di `scadenze` con `idVeicolo`), `letture`, `manutenzioni`, `assegnazioni`, `documenti`,
  `trasferte` (quante), `mezzoDelloStudio`, `puoScrivere`, `puoPrendere`, `puoSegnareKm`; i costi dell'anno sono a parte
  (`costiMezzo`, con `costi`).
- `salvaMezzo {mezzo: {id?, nome, targa?, tipo?, proprieta?, idPersona?, immatricolazione?, alimentazione?, euroKm?,
  annoAci?, tagliandoKm?, tagliandoUltimoKm?, tagliandoOgniMesi?, note?, scadenze?: {assicurazione, bollo, revisione,
  tagliando}}}` (mezzi 2) → `{ok, mezzo}`. Con `studio` l'euro al km si ignora (`null`); la **revisione si propone da
  sola** (`scadenzaRevisione`: immatricolato il 05/11/2021 → 30/11/2025). Anche `salvaVeicolo` (fase 3) accetta questi
  campi. Errori: `"Nome: scrivi il nome del mezzo"`, `"Targa: lettere e cifre, senza spazi"`, `"Tipo: auto, furgone,
  moto o altro"`, `"Di chi è: persona o studio"`, `"Di chi è: scegli la persona"`, `"Euro al km: non può essere
  negativo"`, `"Tagliando: i numeri non possono essere negativi"`, `"Il mezzo è dismesso: non si cambia"`.
  `dismettiMezzo {id, motivo}` (mezzi 2): esce dagli elenchi, le trasferte restano (`"Motivo: scrivi perché lo dismetti"`).
- `segnaKm {idVeicolo, km, data?, idLocale?, idFile?, conferma?}` (mezzi 1 per le cose che ho io, 2 sempre) → vero:
  ```json
  {"ok": true, "lettura": {"id": 4, "idLocale": "cattura-km-1", "idVeicolo": 2, "data": "2026-10-22", "km": 84600, "origine": "mano",
    "idUtente": 3, "utente": "Marco Rossato", "foto": null, "nota": ""},
   "mezzo": {"id": 2, "km": 84600, "kmIl": "2026-10-22", "kmAlTagliando": 5400, "...": "..."}}
  ```
  Più basso dell'ultima lettura di un giorno uguale o prima: `"Km: l'ultima lettura era 84.350 il 22/10"`; più di 5.000
  km in meno di 7 giorni: `{"ok": false, "errore": "Sono 10.650 km in 1 giorno: è giusto?", "serveConferma": true}`. La
  foto del contachilometri: `caricaFile {tipo: "km", idLettura | idLocaleLettura, base64, mime, idFile}`. Un mezzo che
  non ho: `"Non hai il permesso per segnare i km dei mezzi che non hai: chiedi al titolare"`.
- `segnalaGuasto {guasto: {idVeicolo | idAttrezzatura, titolo, descrizione?, fermo?, km?, idLocale?}}` (mezzi 1 per le
  mie, 2 sempre) → vero: `{"ok": true, "manutenzione": {"id": 2, "idLocale": "cattura-guasto-1", "idVeicolo": 2, "tipo":
  "guasto", "stato": "aperta", "statoVisto": "Segnalato", "fermo": false, "data": "2026-10-22", "titolo": "Rumore dai
  freni", "segnalataDa": 3, "segnalataDaNome": "Marco Rossato", "foto": [], "...": "..."}}`. Con `fermo` il mezzo o lo
  strumento non si propone e non si prende. Le foto: `caricaFile {tipo: "guasto", idManutenzione | idLocaleManutenzione,
  ...}` (chi l'ha segnalato o mezzi 2; lo stesso `idFile` non fa doppioni). `"Scrivi in poche parole cosa succede"`.
- `salvaManutenzione {manutenzione: {id?, idVeicolo | idAttrezzatura, tipo, stato?, fermo?, data?, km?, titolo,
  descrizione?, idFornitore?, idSpesa?, idRicevuta?, esito?}}` (mezzi 2): tipi `guasto`, `manutenzione`, `tagliando`,
  `revisione`, `riparazione`, `gomme`, `altro`; stati `aperta`, `in_officina` (il mezzo "In officina"), `chiusa`. **Il
  costo non si scrive qui**: è la spesa (fase 3) o la fattura ricevuta (fase 4), una delle due (`"Il costo è la spesa o
  la fattura ricevuta: scegline una"`).
- `chiudiManutenzione {id, esito?, km?, data?, idSpesa?, idRicevuta?}` (mezzi 2; chi ha segnalato il suo guasto con mezzi
  1): coi km una lettura (`origine: manutenzione`); un **tagliando** aggiorna `tagliandoUltimoKm` e segna fatta la sua
  scadenza; una **revisione** segna fatta la sua (la prossima: fine mese + 24 mesi); la riparazione (o il guasto) di uno
  strumento lo porta a "Taratura non scritta" (§17.11).
- `manutenzioni {aperte?, idVeicolo?, idAttrezzatura?}` (mezzi 1) → `{ok, manutenzioni: [...]}` con `oggetto` ("Fiat
  Doblò GA123BC").
- `costiMezzo {id, anno?}` (mezzi 1 e costi 1) → vero: `{"ok": true, "idVeicolo": 2, "anno": 2026, "km": {"primo": 65920,
  "ultimo": 84600, "anno": 18680}, "voci": [], "totale": 0, "euroKm": 0}`. `voci`: Carburante, Pedaggi e parcheggi,
  Manutenzioni, Assicurazione, Bollo, Altro (`{chiave, nome, importo, quante}`): spese col mezzo, fatture ricevute col mezzo
  (imponibile + cassa + bollo, senza IVA; le note di credito sottraggono), spese e ricevute legate alle manutenzioni,
  impegni pagati col mezzo. **Una ricevuta legata a una spesa (`spesa_id`) si conta una volta.** `euroKm` solo con almeno
  1.000 km nell'anno. Senza costi: `"Non hai il permesso per vedere i costi dei mezzi (serve il permesso dei soldi): chiedi
  al titolare"`.

### 17.11 Attrezzature, strumenti e tarature

- `attrezzature {categoria?, stato?: "disponibili"|"assegnate"|"fuori"|"dismesse"|"tutte", mie?, idPersona?, testo?,
  taratura?: "scadute"|"in_scadenza"}` (mezzi 1) → vero (accorciato):
  ```json
  {"ok": true, "attrezzature": [
    {"id": 1, "codice": "AT001", "nome": "Misuratore di terra MT-500", "categoria": "strumento", "categoriaNome": "Strumenti di misura",
     "marca": "Esempio Strumenti", "modello": "MT-500", "matricola": "22-0451", "statoVisto": "Assegnato a Marco Rossato", "stato": "assegnato",
     "motivo": "", "chi": {"idAssegnazione": 2, "tipo": "assegnato", "idPersona": 3, "nome": "Marco Rossato", "...": "..."}, "rientro": "",
     "posizione": "Armadio dell'ufficio", "controllo": "taratura",
     "taratura": {"stato": "in_scadenza", "parola": "Taratura fra 24 giorni", "giorni": 24, "scade": "2026-11-15"}, "mio": false, "dismesso": false},
    {"id": 2, "codice": "AT002", "nome": "Analizzatore di rete AR-6", "statoVisto": "In taratura", "stato": "laboratorio", "rientro": "2026-10-29",
     "taratura": {"stato": "laboratorio", "parola": "In taratura", "giorni": null, "scade": "2026-10-25"}, "...": "..."}]}
  ```
  Categorie: `strumento` (Strumenti di misura), `attrezzo`, `informatica`, `dpi`, `altro`. Lo **stato visto** è uno solo:
  Fuori uso (non conforme, guasto con fermo, perso) > In taratura / In verifica / In riparazione > Taratura scaduta > In
  prestito a … > Assegnato a … > Disponibile; Dismesso esce dagli elenchi.
- `attrezzatura {id}` (mezzi 1) → la scheda: in più `proprieta`, `acquistatoIl`, `idFornitore`, `controlloOgniMesi`,
  `idLaboratorio`, `laboratorio`, `fuoriUso`, `fuoriUsoIl`, `fuoriUsoMotivo`, `tarature` (ognuna con `esitoVisto` e
  `frase`: "Tarato il 12/10/2025 da Laboratorio Tarature Nord Srl · certificato LAT 0777/24 · fino al 12/10/2026"),
  `assegnazioni`, `manutenzioni`, `documenti`, `usi` (gli interventi: `{data, idRapportino, idTicket, ticket, cliente,
  impianto, chi, statoAllora, scadeAllora, confermato}`), `usiDaControllare`, `fraseUsi`, `puoScrivere`, `puoPrendere`;
  `costi` (spese, fatture ricevute) solo con `costi`.
- `salvaAttrezzatura {attrezzatura: {id?, codice?, nome, categoria, marca?, modello?, matricola?, proprieta?,
  acquistatoIl?, idFornitore?, posizione?, controllo?, controlloOgniMesi?, idLaboratorio?, note?, ultimaTaratura?:
  {data, scade?, certificato?, idDocumento?}}}` (mezzi 2): il codice si propone (`AT007`). `ultimaTaratura.idDocumento`
  sceglie un certificato già in archivio (anche della fase 5): il documento e **la sua scadenza** diventano dello
  strumento (una sola scadenza, non due). Errori: `"Nome: scrivi cos'è"`, `"Categoria: strumento, attrezzo,
  informatica, dpi o altro"`, `"Controllo periodico: taratura, verifica o niente"`, `"Ogni: da 1 a 120 mesi"`, `"Di chi
  è: studio, noleggio, persona o cliente"`, `"Codice: AT004 c'è già (Multimetro 87V)"`. `dismettiAttrezzatura {id,
  motivo}`: chiude l'assegnazione e annulla le sue scadenze.
- `registraTaratura {taratura: {idAttrezzatura, data, esito, scade?, idLaboratorio?, certificato?, idFile?, idRicevuta?,
  nota?}, tornaA?}` (mezzi 2). Esiti `conforme`, `regolato`, `non_conforme`. Conforme o regolato: la scadenza aperta si
  segna fatta (col certificato, se c'è il file: documento categoria Certificati di taratura) e nasce la prossima alla data
  `scade` (proposta: data + mesi). Un prestito al laboratorio in corso si chiude (con `tornaA` lo strumento torna a chi
  l'aveva assegnato). **Non conforme** (vera, accorciata):
  ```json
  {"ok": true, "attrezzatura": {"statoVisto": "Fuori uso", "motivo": "Non conforme",
     "taratura": {"stato": "non_conforme", "parola": "Non conforme", "giorni": null, "scade": ""}, "...": "..."},
   "usiDaControllare": [
     {"data": "2026-10-16", "idRapportino": "RAP/2026/0006", "idTicket": null, "ticket": "", "cliente": "Rossi Impianti Srl", "impianto": "",
      "chi": "Marco Rossato", "statoAllora": "valida", "scadeAllora": "2026-11-15", "confermato": false},
     {"data": "2026-10-22", "idRapportino": "RAP/2026/0016", "...": "..."}],
   "fraseUsi": "Usato in 2 interventi dal 15/11/2025: controlla se le misure valgono"}
  ```
  Gli usi sono quelli dall'ultima taratura buona. Una taratura conforme dopo lo rimette in uso. Errori: `"Esito: conforme,
  regolato o non conforme"`, `"Scade: deve venire dopo la data della taratura"`, `"È dismesso"`, `"Pinza amperometrica
  non ha un controllo periodico: scegli taratura o verifica nella scheda"`, `"Laboratorio F009 non trovato"`.
- **Dopo una riparazione** (o un guasto chiuso) la taratura non vale più (ACCREDIA): "Taratura non scritta" finché non se
  ne registra una (lo stesso giorno conta l'ora: una riparazione chiusa dopo la taratura la annulla).
- `usiStrumento {idAttrezzatura, da?, a?}` (mezzi 1) → `{ok, idAttrezzatura, usi}`.

### 17.12 Assegnazioni e prestiti

- `assegna {idVeicolo | idAttrezzatura, tipo, idPersona? | idCommessa? | idSoggetto?, rientro?, nota?, idLocale?, firma?:
  {base64, mime}}`. Tipi `assegnato`, `prestito`, `laboratorio` (In taratura), `riparazione`. Mezzi 2: tutto; **mezzi 1
  solo "Lo prendo io"**: un prestito a sé di una cosa disponibile (senza rientro: rientra oggi). Vera (Marco):
  `{"ok": true, "attrezzatura": {"id": 3, "statoVisto": "In prestito a Marco Rossato", "stato": "prestito", "chi":
  {"idAssegnazione": 7, "tipo": "prestito", "idPersona": 3, "nome": "Marco Rossato", "dal": "2026-10-22", "rientro":
  "2026-10-22"}, "...": "..."}}`. **Una sola assegnazione in corso** per cosa (indice unico nel database): la nuova chiude
  quella di prima (lo storico resta); un prestito che interrompe un'assegnazione, restituito, torna a chi l'aveva.
  Errori: `"Non conforme: non si usa finché non è tarato di nuovo"`, `"È fuori uso: Guasto: Il display non si accende"`,
  `"È al laboratorio fino al 29/10"`, `"È fermo: revisione scaduta"`, `"È in officina fino al 30/10"`, `"È l'auto di una
  persona: non si assegna"`, `"Non è disponibile: Assegnato a Marco Rossato"` (Lo prendo io), `"Rientro: deve venire dopo
  oggi"`, `"Scegli a chi"`, `"Scegli il laboratorio o l'officina"`, `"Marco Rossato è uscito dallo studio"`, altri:
  `permesso:false` (`"... assegnare mezzi e attrezzature agli altri ..."`).
- `restituisci {idAssegnazione | idVeicolo | idAttrezzatura, idLocale?}` (mezzi 1 per le mie, 2 sempre) → la cosa; con lo
  stesso `idLocale` di nuovo: `giaArrivata: true`.
- `assegnazioni {inCorso?, inRitardo?, idPersona?, idCommessa?, idSoggetto?}` (mezzi 1) → vera:
  `{"ok": true, "assegnazioni": [{"id": 6, "idAttrezzatura": 6, "oggetto": "Imbracatura anticaduta AT006", "tipo":
  "prestito", "tipoVisto": "In prestito", "idSoggetto": "F006", "chi": "Impianti Veneti di Sartori Luca", "dal":
  "2026-10-14", "rientro": "2026-10-21", "al": "", "inCorso": true, "inRitardo": true, "firmata": false, "firma": null,
  "nota": "", "frase": ""}]}`.

### 17.13 Gli strumenti nel rapportino e nel ticket

- `salvaRapportino {rapportino: {..., strumenti: [{idAttrezzatura, confermato?}]}}`: l'elenco intero (come la checklist);
  senza la chiave `strumenti` (le versioni vecchie, il ponte) non cambia niente. **Mai un rifiuto per uno strumento** (la
  coda del telefono si fermerebbe): uno che non c'è si salta; uno non conforme, al laboratorio o scaduto non confermato si
  scrive col suo stato vero e il rapportino ha `strumentiDaGuardare`. Lo stato e la scadenza sono **quelli del giorno del
  rapportino**, congelati in `strumenti_usati` (cambiare la data in bozza li rifà). Vero:
  ```json
  {"ok": true, "rapportino": {"id": "RAP/2026/0016", "strumenti": [
    {"idAttrezzatura": 4, "codice": "AT004", "nome": "Multimetro 87V", "matricola": "6011-2381", "scadeAllora": "2026-10-12",
     "statoAllora": "scaduta", "confermato": true, "verifica": false},
    {"idAttrezzatura": 1, "codice": "AT001", "nome": "Misuratore di terra MT-500", "matricola": "22-0451", "scadeAllora": "2026-11-15",
     "statoAllora": "valida", "confermato": false, "verifica": false}], "idIncarico": null, "...": "..."}}
  ```
  `statoAllora`: `valida` (anche in scadenza), `scaduta`, `senza`, `non_conforme`, `laboratorio`. `confermato` vale solo
  per uno scaduto ("Lo uso lo stesso"). `strumentiDaGuardare`: non conformi, al laboratorio, scaduti senza conferma, e con
  `TARATURA_BLOCCO = "blocco"` anche gli scaduti confermati (il server salva lo stesso: il blocco lo fanno le app al
  momento della scelta).
- Da **firmato** in poi il rapportino non cambia (`"Il rapportino RAP/2026/0016 e' gia' firmato: riportalo in bozza per
  modificarlo"`), e quindi nemmeno i suoi strumenti.
- **Il PDF del rapportino** lo fanno telefono e computer (`pc/ui/documenti.js`, fuori dal server): il server manda in
  `strumenti` nome, matricola e `scadeAllora` per la riga "Strumenti"; i rapportini senza strumenti hanno `strumenti: []` e
  il loro PDF resta identico (provato da `migrazione-005.test.js` e `migrazione-006.test.js`).
- `ticket {id}`: `strumenti` (degli interventi del ticket: `{idRapportino, data, idAttrezzatura, codice, nome, matricola,
  scadeAllora, statoAllora, confermato, verifica}`) e `tarataScaduta` (true se uno era scaduto quel giorno).

### 17.14 Collaboratori esterni e incarichi

- `collaboratori {testo?, stato?: "attivi"|"tutti", tipo?, idoneita?}` (collaboratori 1; l'esterno solo il suo) → vero:
  `{"ok": true, "collaboratori": [{"idSoggetto": "F006", "nome": "Impianti Veneti di Sartori Luca", "tipo": "impresa",
  "tipoNome": "Impresa", "mestiere": "Impianti elettrici civili e industriali", "attivo": true, "idoneita": {"stato":
  "in_regola", "parola": "In regola", "frase": ""}, "incarichiInCorso": 1, "valutazioni": {"bene": 0, "problemi": 0,
  "male": 0}, "daFatturare": 720}]}`. `daFatturare` solo con `costi` (e all'esterno il suo).
- `collaboratore {id}` (collaboratori 1; l'esterno senza id il suo) → la scheda: dati del fornitore (partita IVA,
  telefono, email, PEC, indirizzo), `tipo`, `mestiere`, `abilitazioni`, `referenteId`, `referente`, `note`, `idoneita`
  (`{stato, parola, frase, mancano, scaduti, prossima: {"tipo": "durc", "nome": "DURC", "data": "2026-10-29", "giorni":
  7}, servono: ["durc", "visura", "idoneita", "polizza"]}`), `documenti` (con `tipoScadenza`, `scade`, `statoVisto`),
  `incarichi` (`{inCorso, conclusi, daValutare}`), `valutazioni`, `elencoIncarichi`, `accessi` (gli utenti esterni),
  `programmaDurc: "non collegato"`, `comunicazioneIspettorato` (`"non collegato"` per gli occasionali), `puoScrivere`,
  `puoAffidare`, `puoCaricareDocumenti`; `tariffa` e `compensi` (pattuito, maturato, fatturato, daFatturare, daPagare) con
  `costi` o all'esterno per il suo. **Idoneità**: In regola, Manca qualcosa ("Manca il DURC"), Documenti scaduti ("DURC
  scaduto il 12/10"); quali documenti servono per tipo è `COLLAB_DOCUMENTI` (impresa: DURC, visura, idoneità, polizza;
  professionista: polizza, albo; occasionale: niente).
- `salvaCollaboratore {collaboratore: {idSoggetto?, soggetto?: {...salvaSoggetto}, tipo, mestiere?, abilitazioni?,
  tariffa?, referenteId?, attivo?, note?}}` (collaboratori 2; la tariffa con costi 2). Senza `idSoggetto` crea il fornitore
  (fase 1, `salvaSoggetto`): **un doppione per nome o partita IVA torna quello che c'è** (anche un cliente, che diventa
  anche fornitore). Errori: `"Tipo: impresa, professionista o occasionale"`, `"Tariffa: non può essere negativa"`,
  `"Fornitore F009 non trovato"`.
- `invitaEsterno {idSoggetto, nome, email}` (amministrazione 2) → `{ok, utente, passwordIniziale}` (come
  `salvaUtente`): un utente `esterno` del collaboratore con la password iniziale (come la fase 1); più persone dello stesso collaboratore possono avere l'accesso.
  Un esterno non è una persona dello studio (niente scheda nell'organico).
- `incarichi {stato?: "aperti"|"bozze"|"conclusi"|"tutti", idSoggetto?, idCommessa?, daValutare?}` (collaboratori 1;
  l'esterno i suoi) → vero (Luca):
  ```json
  {"ok": true, "incarichi": [{"id": 1, "numero": "IN/2026/001", "idSoggetto": "F006", "collaboratore": "Impianti Veneti di Sartori Luca",
    "idCommessa": "26ST001", "commessa": "Nuovo magazzino automatico Batokyo", "idCliente": "C001", "cliente": "Elettrodinamica",
    "idPrestazione": null, "titolo": "Cablaggio quadri di linea 4 e 5", "modo": "corpo", "modoVisto": "A corpo", "stato": "affidato",
    "statoVisto": "Affidato", "avanzamento": 60, "dal": "2026-10-02", "al": "2026-11-21", "orePreviste": null, "speseComprese": true,
    "referenteId": 1, "referente": "Manuel Gasparotto", "compenso": 3200, "tariffa": null, "tetto": null,
    "conti": {"pattuito": 3200, "maturato": 1920, "fatturato": 1200, "costo": 1200, "daFatturare": 720, "daPagare": 1464,
              "oreApprovate": 0, "speseDaRiconoscere": 0}}]}
  ```
  (per lo studio anche `valutazione`, `valutazioneVista`, `daValutare`). `incarico {id}` → in più `descrizione`,
  `affidatoIl`, `conclusoIl`, `annullatoIl`, `motivo`, `valutazioneNota`, `valutataIl` (non all'esterno), `idDocumento`,
  `idoneita`, `ore`, `rapportini`, `spese`, `ricevute` (con lo stato del pagamento).
- `salvaIncarico {incarico: {id?, idSoggetto, idCommessa, idPrestazione?, titolo, descrizione?, modo, compenso?,
  tariffa?, orePreviste?, tetto?, speseComprese?, dal?, al?, referenteId?, idDocumento?}}` (collaboratori 2; i soldi con
  costi 2): nasce in **bozza** col numero `IN/{AAAA}/{NNN}`; affidato si cambiano solo titolo, descrizione, date,
  referente, documento, ore previste (`"L'incarico affidato non cambia collaboratore"`, `"... commessa"`, `"... come si
  paga"`). Errori: `"Titolo: scrivi cosa deve fare"`, `"Come si paga: corpo o ore"`, `"Compenso: scrivi quanto"`,
  `"Tariffa: scrivi quanto all'ora"`, `"Commessa: scegli la commessa"`.
- `affidaIncarico {id, conferma?}` (collaboratori 2 e costi 1): con l'idoneità non in regola chiede conferma (blocco
  morbido: `"Manca il DURC: lo affido lo stesso?"`, con `idoneita`); con `conferma` nel registro `"incarico affidato con
  l'idoneità non in regola: Manca il DURC"`. `"Si affida solo un incarico in bozza"`.
- `aggiornaAvanzamento {id, avanzamento}` (solo a corpo, affidato: `"L'avanzamento è degli incarichi a corpo: a ore
  contano le ore"`, `"Avanzamento: da 0 a 100"`), `concludiIncarico {id}` (a corpo l'avanzamento va a 100),
  `riapriIncarico {id, motivo}`, `annullaIncarico {id, motivo}` (non con fatture ricevute collegate: `"L'incarico ha la
  fattura 18/2026: scollegala prima"`; un concluso: `"Un incarico concluso non si annulla: riaprilo prima"`),
  `valutaIncarico {id, valutazione: "bene"|"problemi"|"male", nota?}` (concluso; si cambia finché si vuole).
- `compensi {idSoggetto?, anno?}` (collaboratori 1 e costi 1; l'esterno i suoi) → vero: `{"ok": true, "anno": 2026,
  "righe": [{"idSoggetto": "F006", "nome": "Impianti Veneti di Sartori Luca", "pattuito": 3200, "maturato": 1920,
  "fatturato": 1200, "daFatturare": 720, "daPagare": 1464, "incarichi": 1}], "totale": {...}}`.
- **Le fatture del collaboratore** sono le fatture ricevute della fase 4 (`idIncarico`, §17.2): il fatturato e il pagato
  dell'incarico vengono da lì; la prestazione occasionale si registra a mano come ricevuta (`tipoDocumento:
  "occasionale"`, ritenuta proposta del 20%).

### 17.15 Il costo della commessa

`costoCommessa {idCommessa}` ha in più (vero, 26ST001):
```json
{"ok": true, "idCommessa": "26ST001", "costoCommessa": {"lavoro": 671, "lavoroNoto": true, "auto": 291.84, "speseRapportini": 14.5,
  "oreRegistrate": 26, "costoOreRegistrate": 572, "speseFuoriRapportini": 245.9, "trasferte": 209.76, "kmTrasferte": 276,
  "soloRapportini": 977.34, "totale": 3205, "collaboratori": 1200, "collaboratoriPrevisto": 3200, "altreRicevute": 0}}
```
- `collaboratori` = il costo (imponibile + contributo + bollo, senza IVA) delle fatture ricevute degli incarichi non
  annullati della commessa; `collaboratoriPrevisto` = per gli stessi il più grande fra pattuito e fatturato;
  `altreRicevute` = imponibile + contributo + bollo delle ricevute attive con la commessa, **senza incarico e senza spesa**
  (quelle legate a una spesa sono già nelle spese).
- `totale` (costo sostenuto) = quello della fase 3 + `collaboratori` + `altreRicevute`. Costo atteso nelle app = quello
  della fase 3 + `collaboratoriPrevisto` + `altreRicevute`. Le ore e i rapportini degli esterni hanno costo 0: niente
  doppio conto. Tutto l'oggetto è dei soldi: senza `costi` la risposta ha solo `idCommessa`.

### 17.16 L'esterno

- **Lista delle azioni**: `io`, `esci`, `cambiaPassword`, `anagrafiche`, `dashboard`, `esporta`, `rapportini`, `file`,
  `documenti`, `salvaRapportino`, `caricaFile`, `togliFile`, `stato`, `inviaEmail`, `legaRapportino`, `ore`, `salvaOre`,
  `togliOre`, `timer`, `avviaTimer`, `fermaTimer`, `statisticheOre`, `spese`, `salvaSpesa`, `togliSpesa`,
  `togliFotoSpesa`, `trasferte`, `rimborsi`, `riepilogoSpese`, `veicoli`, `attivita`, `salvaAttivita`, `faiAttivita`,
  `togliAttivita`, `spuntaChecklist`, `togliAllegato`, `documento`, `salvaDocumento`, `caricaVersione`, `togliVersione`,
  `categorieDocumenti`, `scadenze`, `tickets`, `ticket`, `sospendiTicket`, `riprendiTicket`, `risolviTicket`,
  `altroIntervento`, `pianificaTicket`, `togliFotoTicket`, `collaboratori`, `collaboratore`, `incarichi`, `incarico`,
  `compensi`. Ogni altra (provate tutte in `prove/collaboratori.test.js`) risponde `permesso:false` prima di cercare
  qualunque cosa.
- **Dentro la lista**, ognuna filtra: le commesse dei suoi incarichi affidati o conclusi (senza budget, ore previste,
  note, cartella, contratto, persone dello studio: le chiavi restano vuote); il cliente solo col nome; i suoi rapportini,
  ore, spese (sulle commesse dei suoi incarichi, l'incarico si mette da solo, costo orario 0); le sue attività (assegnate a
  lui o create da lui); i ticket dove è responsabile o ha un intervento; i documenti suoi (categoria Documenti dei
  collaboratori col suo `F...`), quelli dei suoi incarichi e quelli `vede = tutti` delle sue commesse; le scadenze dei suoi
  documenti; la sua scheda **senza le note e le valutazioni dello studio**; i suoi incarichi e compensi (soldi suoi).
  Le cose degli altri non si trovano (`"Collaboratore F001 non trovato"`, `"Incarico 2 non trovato"`).
- `esporta`: solo `rapportini`, `ore`, `spese` (le sue). `/carica`: `per=collaboratore` (i suoi documenti) e
  `per=ticket`. Le sue spese pagate da lui non vanno nei rimborsi dello studio (sono nel maturato dell'incarico, o nella
  sua fattura). Niente trasferte, niente mezzi.
- `dashboard` (vera):
  ```json
  {"ok": true, "per": "esterno", "oggi": "2026-10-22", "numeri": {"incarichi": {"inCorso": 1}, "rapportini": {"daFirmare": 0}},
   "incarichi": [{"id": 1, "numero": "IN/2026/001", "idCommessa": "26ST001", "commessa": "Nuovo magazzino automatico Batokyo",
     "titolo": "Cablaggio quadri di linea 4 e 5", "modo": "corpo", "avanzamento": 60, "dal": "2026-10-02", "al": "2026-11-21"}],
   "urgenti": [], "settimana": [{"tipo": "collaboratore", "gravita": "attenzione", "titolo": "Il DURC scade fra 7 giorni: carica quello nuovo",
     "collegamento": {"pagina": "collaboratore", "id": "F006"}, "...": "..."}], "pianificare": [], "giallo": "rapportino"}
  ```
- `salvaPermessi` rifiuta di dare a `esterno` più di 0 su `persone`, `mezzi`, `clienti`, `preventivi`, `fatturazione`,
  `banche`, `comunicazioni`, `portale`, `integrazioni`, `amministrazione`, `costi`, `riservati`: `"Un esterno non può
  vedere i soldi, le persone e l'amministrazione dello studio"`.

### 17.17 Dashboard: cosa si aggiunge

- `numeri.persone` (persone 1; vero, Manuel): `{"attive": 5, "assentiOggi": 1, "assentiOggiNomi": ["Laura Bianchi"],
  "daApprovare": 1, "scadenzeVicine": 2, "scadute": 1}` (il collaboratore senza `daApprovare`, con le sue scadenze).
- `numeri.mezzi` (mezzi 1): `{"fermi": 0, "guastiAperti": 2, "tarateScadute": 1, "tarateInScadenza": 0,
  "prestitiInRitardo": 1, "scadenzeVicine": 4}` (il collaboratore: le cose sue).
- `numeri.collaboratori` (collaboratori 1): `{"incarichiInCorso": 1, "nonInRegola": 0, "documentiInScadenza": 1,
  "daValutare": 0}`; con `costi` anche `numeri.soldi.compensiDaFatturare` (720).
- **`assentiOggi`** (in cima alla risposta, non dentro `oggi`, che è già la data: §17.22): `[{"idPersona": 2, "nome":
  "Laura Bianchi", "tipoVisto": "Ferie", "fino": "2026-10-23"}]` ("Assente" per chi non vede il tipo).
- Voci nuove (tipi `assenza`, `persona`, `qualifica`, `visita`, `mezzo`, `strumento`, `prestito`, `guasto`,
  `collaboratore`, `incarico`; unità `persone`, `km`), con le frasi dell'accordo (vere):
  - **urgenti**: "Multimetro 87V: taratura scaduta da 10 giorni" ("Ce l'ha Marco Rossato · usato oggi in
    RAP/2026/0016"); "RAP/2026/0017 ha usato il Misuratore di terra MT-500, non conforme" ("Il 22/10: controlla se le
    misure valgono"); "Fiat Doblò GA123BC: assicurazione scaduta, non si usa"; "Imbracatura anticaduta AT006: doveva
    rientrare ieri" ("In prestito a Impianti Veneti di Sartori Luca dal 14/10"); "Primo soccorso di Marco Rossato scaduto
    da 32 giorni" (titolare, amministrazione e la persona); "DURC di Impianti Veneti di Sartori Luca scaduto il 12/10"
    ("Incarico IN/2026/004 in corso"); le ferie da approvare che cominciano entro 7 giorni; le proprie richieste respinte;
  - **questa settimana**: "Oggi è assente Laura Bianchi" ("Ferie fino a venerdì 23" o "Assente fino a venerdì 23"); "1
    richiesta di ferie da approvare" ("Marco Rossato · da lunedì 2 a venerdì 6 novembre · 5 giorni · restano 8 giorni");
    le scadenze nel preavviso entro 30 giorni ("Fiat Doblò GA123BC: assicurazione scade fra 14 giorni", "Misuratore di
    terra MT-500: taratura fra 24 giorni", "Visita medica di Marco Rossato fra 13 giorni", "DURC di Impianti Veneti di
    Sartori Luca scade fra 7 giorni"); "Fiat Doblò GA123BC: tagliando fra 700 km"; "Analizzatore di rete AR-6 rientra dal
    laboratorio giovedì 29"; "Firma la consegna: Elmetto con visiera"; "Le tue ferie dal 2 al 6 novembre aspettano
    l'approvazione";
  - **da pianificare**: "Fiat Doblò GA123BC: Spia della pressione delle gomme accesa" ("Segnalato da Marco Rossato il
    20/10"); "Pinza amperometrica: taratura non scritta"; "Impianti Veneti di Sartori Luca: 720,00 € maturati da
    fatturare" ("Aspetta la sua fattura"); "Contratto di Elena Costa finisce fra 50 giorni"; le persone senza costo con ore
    recenti, il saldo non aggiornato, le ferie arretrate, gli incarichi da valutare, gli esterni senza incarichi, le
    persone da rendere anonime (solo titolare).
- **Il collaboratore**: "Il tuo Multimetro 87V ha la taratura scaduta da 10 giorni", "Il Fiat Doblò che usi:
  assicurazione scade fra 14 giorni", "Il tuo Misuratore di terra MT-500: taratura fra 24 giorni", la sua formazione, la
  sua visita, i DPI da firmare, le sue richieste; niente soldi, niente `numeri.collaboratori`.
- **Una cosa, una voce**: una scadenza che diventa voce della fase 6 (di una persona, un mezzo, uno strumento, un
  collaboratore) non torna nella parte delle scadenze della fase 5; la voce porta alla scheda dell'oggetto
  (`collegamento.pagina`: `persona`, `mezzo`, `attrezzatura`, `collaboratore`). Pagine nuove: `persone` (filtro
  `segmento`: `organico` | `ferie` | `presenze` | `scadenze` | `costi`, `daApprovare: true`), `persona`, `mezzi`, `mezzo`,
  `attrezzatura`, `collaboratori`, `collaboratore`, `incarico`. Ogni sezione si ferma al massimo di voci di sempre.

### 17.18 Permessi

| | titolare | amministrazione | collaboratore | lettura | esterno |
|---|---|---|---|---|---|
| `persone` | 2 | 2 | 1 (era 0) | 1 | 0 |
| `mezzi` | 2 | 2 | 1 | 1 | 0 |
| `collaboratori` | 2 | 2 | 0 | 1 | 1 (solo la sua scheda) |
| `dashboard`, `commesse` | 2 | 2 | 1 | 1 | 1 (solo con un suo incarico) |
| `rapportini`, `attivita`, `spese`, `ticket` | 2 | 2 | 2 | 1 | 2 (solo i suoi) |
| `documenti` | 2 | 2 | 1 | 1 | 1 (più i suoi documenti) |
| gli altri moduli | come prima | come prima | come prima | come prima | 0 |
| `costi` | 2 | 2 | 0 | 1 | 0 |
| `riservati` | 2 | 0 | 0 | 0 | 0 |

Provati su ogni azione nuova (`prove/permessi-fase6.test.js`, letture e scritture per i cinque ruoli):
- **Titolare**: tutto; solo lui rende anonima una scheda, dà l'accesso (amministrazione 2), invita gli esterni, cambia i
  tipi di formazione.
- **Amministrazione** (persone 2, mezzi 2, collaboratori 2, costi 2, riservati 0): scrive schede (non i riservati), costi
  orari (non il costo dell'anno), formazione, visite (non il giudizio), assenze di tutti, saldi, chiusure, uscite;
  approva le assenze (non le sue); mezzi, attrezzature, tarature; collaboratori e incarichi.
- **Collaboratore** (persone 1, mezzi 1): la rubrica e la sua scheda (cambia i suoi contatti), le sue assenze (chiede,
  annulla le sue non cominciate), le sue presenze e i suoi saldi; vede mezzi e attrezzature senza costi, segna i km e
  segnala guasti **delle cose che ha**, chiude i guasti che ha segnalato, "Lo prendo io" di una cosa disponibile,
  restituisce le sue; non assegna ad altri, non registra tarature, non cambia le schede; niente collaboratori esterni.
- **Lettura** (persone 1, mezzi 1, collaboratori 1, costi 1): vede ed esporta (costi orari, costi dei mezzi, compensi),
  niente personali e riservati; chiede le sue assenze; nessun'altra scrittura.
- **Esterno**: §17.16.

### 17.19 Esportazioni

`esporta {cosa, ...}` (CSV della §12.13), cose nuove: `persone`, `qualifiche`, `assenze` (`da`, `a`, `idPersona`),
`presenze` (`mese`, `idPersona`), `mezzi`, `attrezzature`, `tarature`, `manutenzioni`, `assegnazioni`, `km`
(`idVeicolo`), `collaboratori`, `incarichi`, `compensi` (questa vuole `costi`). Le colonne dipendono da chi esporta:
- **persone**: Nome, Rapporto, Ruolo nello studio, Mansione, Telefono di lavoro, Email di lavoro, Entrata, Uscita, Ore
  alla settimana, Accesso a Wisper, Ruolo; con persone 2 anche Codice fiscale, Nato il, Nato a, Indirizzo, CAP, Città,
  Provincia, Telefono personale, Email personale, IBAN, Contatto di emergenza, Telefono di emergenza, Contratto,
  Contratto scade il; con `riservati` CCNL e Livello (riga `esportato` negli accessi riservati); con `costi` Costo orario;
- **assenze**: Persona, Tipo ("Assente" per le sanitarie a chi non ha `riservati`, e per tutte a chi non ha persone 2),
  Dal, Al, Giorni, Ore, Stato, Approvata da, Il, Motivo del rifiuto; Nota con persone 2;
- **presenze**: Data, Persona, Ore previste, Lavorate, Straordinarie, Assenza, Ore di assenza, Mancano, le righe
  "Totale" e la riga "Programma paghe del consulente;Non collegato";
- **mezzi**: Mezzo, Targa, Tipo, Di chi è, Chi ce l'ha, Km, Letti il, Tagliando fra km, Prossima scadenza, Stato;
  **attrezzature**: Codice, Nome, Categoria, Marca, Modello, Matricola, Chi ce l'ha, Posizione, Taratura, Scade, Stato;
  **tarature**: Codice, Strumento, Data, Esito, Scade, Laboratorio, Certificato; **manutenzioni**, **assegnazioni**,
  **km** con le loro colonne;
- **collaboratori**: Codice, Nome, Tipo, Mestiere, Abilitazioni, Idoneità, Incarichi in corso, (Da fatturare con
  `costi`), Valutazioni; **incarichi**: Numero, Collaboratore, Commessa, Titolo, Come, Stato, Avanzamento, Dal, Al e con
  `costi` Pattuito, Maturato, Fatturato, Da fatturare, Da pagare; **compensi**: Codice, Collaboratore, Incarichi,
  Pattuito, Maturato, Fatturato, Da fatturare, Da pagare.
L'errore di `cosa` ora finisce con `"..., persone, qualifiche, assenze, presenze, mezzi, attrezzature, tarature,
manutenzioni, assegnazioni, km, collaboratori, incarichi o compensi"`. L'esterno esporta solo `rapportini`, `ore`, `spese`.

### 17.20 Conti e casi condivisi

In `server/src/conti.js`, coi casi in `server/prove/` (telefono e computer li leggono dal loro posto e devono ritrovare
ogni risultato; prova del server in `prove/conti-fase6.test.js`):
- **`casi-persone.json`**: `festivi(anno, patrono)` (Pasquetta calcolata, il 4 ottobre dal 2026, il patrono `"mm-gg"`);
  `giorniLavorativi(dal, al, giorniSettimana, festivi)` (anche a cavallo dell'anno, coi festivi di tutti gli anni:
  `festiviTra`); `oreAssenza(assenza, persona, festivi)` → `{giorni, ore}` (e `oreAssenzaPerGiorno`, la somma è il totale);
  `saldoAssenze({annue, saldi, assenze, oggi, entrata, uscita})` → `{tenuto, scritto, scrittoIl, maturate, godute, oggi,
  prenotate, restano}`; `costoOrarioDaAnno(costoAnno, oreAnno)`. Tutti i casi dell'accordo più quelli del server
  (part time, patrono, malattia a cavallo del fine settimana, Legge 104 a ore, saldo senza cedolino, a cavallo del saldo,
  uscita a metà mese).
- **`casi-ore-spese.json`**, chiave nuova `costoOrario` (le altre restano com'erano: le prove di telefono e computer le
  leggono per nome): `costoOrarioDelLavoro({esterno, costiPersona, data, cliente, commessa, impostazioni})`.
- **`casi-mezzi.json`**: `scadenzaRevisione(immatricolazione, ultimaRevisione)`, `kmAlTagliando({tagliandoKm,
  tagliandoUltimoKm, km})`, `statoTaratura({controllo, ultima, fuoriUso, inLaboratorio}, oggi, preavviso)` → `{stato,
  parola, giorni, scade}` (o `null` senza controllo).
- **`casi-incarichi.json`**: `contiIncarico({modo, compenso, tariffa, orePreviste, tetto, avanzamento, oreApprovate,
  speseComprese, speseDaRiconoscere, ricevute})` → `{pattuito, maturato, fatturato, costo, daFatturare, daPagare}`.

### 17.21 Note per chi legge il database

Migrazione `006-persone-mezzi-collaboratori.sql` + `006-persone-mezzi-collaboratori.js` (schema 6, copia
`wisper.db.prima-6` prima, una transazione sola):
- **Tabelle nuove**: `persone`, `persona_costi`, `assenze`, `assenze_saldi`, `chiusure`, `qualifica_tipi`, `qualifiche`,
  `visite_mediche` (solo giudizio e date: nessun campo clinico), `dpi_consegne`, `accessi_riservati` (trigger: non si
  cambia, non si cancella), `attrezzature`, `tarature`, `assegnazioni` (indici unici parziali `assegnazioni_una_veicolo` e
  `assegnazioni_una_attrezzatura` su `al IS NULL`: una sola in corso), `manutenzioni` (nessun importo: `spesa_id` o
  `ricevuta_id`), `mezzo_letture`, `strumenti_usati` (lo stato della taratura di quel giorno), `collaboratori` (chiave =
  il fornitore `soggetti.id`), `incarichi`.
- **Colonne nuove** (vuote nelle righe di prima): `utenti.soggetto_id`; `veicoli` (`targa`, `tipo` di base `auto`,
  `proprieta` di base `persona`, `persona_id`, `immatricolazione`, `km`, `km_il`, `tagliando_km`,
  `tagliando_ultimo_km`, `tagliando_ogni_mesi`, `note`, `dismesso_il`, `dismesso_motivo`); `documenti` (`persona_id`,
  `veicolo_id`, `attrezzatura_id`, `incarico_id`); `spese` (`veicolo_id`, `attrezzatura_id`, `incarico_id`);
  `fatture_ricevute` (`incarico_id`, `veicolo_id`, `attrezzatura_id`); `impegni.veicolo_id`; `rapportini.incarico_id`.
- **Tabelle rifatte** con tutte le righe e i contatori AUTOINCREMENT di prima: `ore` (+ `incarico_id`, `creata_da`;
  CHECK: utente o incarico), `scadenze` (+ persona, mezzo, strumento, qualifica, visita, `fine_mese`, i tipi nuovi),
  `file` (+ `manutenzione_id`, `lettura_id`, `consegna_id`, `assegnazione_id`, i tipi `km`, `guasto`, `firma_consegna`).
- **Dati**: una persona per ogni utente non esterno (stesso nome, rapporto `titolare` per il titolare e vuoto per gli
  altri: "Da completare"); **nessun costo scritto** (le ore e i rapportini tengono il loro costo congelato; il costo del
  titolare resta vuoto); i veicoli restano "auto di una persona" senza persona (le trasferte non cambiano); i permessi del
  ruolo `esterno`; il collaboratore passa a `persone` 1 se era 0 (nel registro); 15 tipi di qualifica; le categorie
  Contratti di lavoro, Cedolini, Idoneità sanitarie (riservati), Attestati e abilitazioni, Consegne DPI, Documenti dei
  mezzi, Certificati di taratura, Documenti dei collaboratori (tutti), Lettere d'incarico (costi); il testo
  `LETTERA_INCARICO`; le numerazioni `incarico` e `attrezzatura`; le impostazioni `FESTA_PATRONO` (""),
  `PERSONE_CONSERVA_ANNI` (10), `SALDO_AVVISO_GIORNI` (60), `TARATURA_OGNI_MESI` (12), `TARATURA_PREAVVISO_GIORNI` (30),
  `TARATURA_BLOCCO` ("avviso"), `DURC_GIORNI` (120), `VISURA_MESI` (6), `COLLAB_DOCUMENTI`, `ACCESSO_ESTERNI_GIORNI`
  (90), `KM_TAGLIANDO_AVVISO` (1000). Le scadenze di taratura della fase 5 (scadenze di un documento) restano com'erano:
  scegliere quel certificato nella scheda dello strumento lega a lui la scadenza.
- **Prova** (`prove/migrazione-006.test.js`): il database della fase 5 (`migrazione-006/fase5.sql`, coi file) e quello
  che rispondeva il server 0.8.0 (`migrazione-006/prima.json`, scritto da `genera-prima.js` col codice della fase 5), con
  l'orologio fermo alle 10:00 del 22/10/2026: le tabelle di prima riga per riga (le colonne nuove vuote), i contatori,
  rapportini, ore e trasferte campo per campo, le parti del costo delle commesse e i soldi della Dashboard al centesimo,
  il costo orario di un rapportino nuovo di Manuel per ogni cliente uguale a prima, la migrazione che non si rifà.

### 17.22 Decisioni prese dove l'accordo non diceva (o non reggeva)

- **Il costo sostenuto della commessa e le fatture ricevute di prima.** fase6.md §8.6 aggiunge al totale le fatture
  ricevute della commessa senza incarico e senza spesa (`altreRicevute`), §4.6 chiede "il costo della commessa uguale al
  centesimo" dopo la migrazione: le due frasi non stanno insieme per le commesse che hanno già ricevute della fase 4 (nei
  dati di esempio 26ST002 passa da 713,60 a 1.111,96). Scelto: la regola di §8.6 vale da subito, **le parti di prima
  restano identiche al centesimo** e la differenza è tutta in `altreRicevute`, mostrata a parte ("Altre fatture
  ricevute"); la migrazione non scrive niente. Perché: è il costo vero (quelle fatture sono costi della commessa) e niente
  si perde o si riscrive. Da confermare con Andrea: se preferisce, `altreRicevute` può contare solo le ricevute registrate
  dopo l'aggiornamento.
- **Le consegne dei DPI** si leggono con persone 2 o mezzi 2 per tutti, gli altri solo le proprie (§10.1 diceva "mezzi 1
  per tutti", ma §3.2 le mette tra i dati personali: si sceglie la strada più prudente).
- **Lettura e collaboratore vedono le ferie degli altri come "Assente"** (il tipo è un dato personale, §3.2: lo vedono
  persone 2 e la persona).
- **Annullare una ferie in corso**: "chi approva annulla sempre" (§6.4) ma "una ferie in corso si accorcia, non si
  annulla" (stessa sezione). Scelto: una ferie (o un permesso, un "altro") approvata, cominciata prima di oggi e non
  finita non si annulla (`"Le ferie sono in corso: accorciale fino a ieri, non si annullano"`), perché annullarla
  cancellerebbe i giorni già goduti e il saldo sbaglierebbe; una tutta passata si annulla col motivo (un errore da
  correggere); le assenze segnalate (malattia...) si annullano sempre.
- **La chiusura salta anche i giorni con un permesso a ore** (non solo quelli con un'assenza intera): una ferie intera
  sopra un permesso conterebbe due volte le stesse ore.
- **`assentiOggi`** sta in cima alla risposta della Dashboard e non in `oggi.assenti` (§11.1): `oggi` è già la data di
  oggi (un testo) dalla fase 1, e cambiarla romperebbe le app.
- **Le valutazioni e le note dello studio sul collaboratore** non arrivano all'esterno (§8.4 gli dà "la sua scheda,
  documenti, incarichi, compensi": il giudizio è dello studio).
- **L'esterno non vede le attività libere dello studio** (il collaboratore sì, dalla fase 2): solo le sue.
- **L'esterno scrive la scadenza dei suoi documenti** (il DURC nuovo che carica fa nascere la sua scadenza), nessun'altra.
- **Le commesse dell'esterno** arrivano con le chiavi di budget, ore previste, note, cartella e contratto vuote (non tolte),
  perché le app di oggi le leggono.
- **Lo stato della taratura "al laboratorio"**: oggi conta solo il prestito aperto; per un giorno passato lo strumento era
  al laboratorio se era uscito entro quel giorno e non era ancora rientrato (il giorno del rientro conta come rientrato).
- **Riparazione e taratura lo stesso giorno**: conta l'ora (la riparazione chiusa dopo che la taratura è stata scritta la
  annulla).
- **Nei dati di esempio** il certificato di taratura della fase 5 è scelto come certificato del misuratore MT-500: una
  scadenza sola (prima erano due voci per la stessa cosa). Laura Bianchi e Marco Rossato hanno nome e cognome; i fornitori
  nuovi sono F005 (laboratorio) e F006 (Impianti Veneti), e le prove vecchie che contavano i fornitori o i rapportini sono
  state portate ai numeri nuovi.
- **Esportare le assenze** con le sanitarie vere (titolare) scrive `esportato` negli accessi riservati per ogni persona
  con una sanitaria nel periodo; vedere la malattia di un'altra persona nelle **presenze** scrive `visto`.

### 17.23 Non provato

Le app (telefono e computer) contro queste risposte, e quindi la riga "Strumenti" del PDF del rapportino e i blocchi delle
tarature al momento della scelta (sono in `pc/ui/` e `app/`, fuori da questa fase lato server); il collegamento a un
programma paghe e al servizio DURC (dichiarati "non collegato"); la comunicazione all'Ispettorato degli occasionali;
un'anonimizzazione sul disco del NAS (provata su Windows, coi file nella cartella dei dati). Da confermare: col
consulente del lavoro i tempi di conservazione (10 anni), il rateo del mese di entrata e di uscita, le colonne del
riepilogo presenze; col commercialista il costo delle fatture ricevute nella commessa (imponibile + cassa + bollo, senza
IVA); con Manuel il blocco delle tarature scadute (`TARATURA_BLOCCO`).
