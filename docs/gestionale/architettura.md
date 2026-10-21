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
