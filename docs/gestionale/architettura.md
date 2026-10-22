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
