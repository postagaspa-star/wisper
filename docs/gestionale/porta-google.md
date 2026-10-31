# La porta Google (contratto)

Decisione di Andrea del 31/10/2026: il NAS di casa non si raggiunge da internet e il router non si tocca. Tutto gratis e
"come funzionava prima": **lo script Google del foglio fa da porta d'ingresso**, il server sul NAS lavora dietro e va lui
a prendere il lavoro. A casa non si apre niente, nessun dominio, nessun costo. L'ingresso HTTPS di `server/ingresso/`
(Caddy, profilo `fuori`) resta com'è, spento.

Chi adatta telefono e computer legge questo file e basta. Codice: `apps-script/Porta.gs` (lo script), `server/src/porta.js`
(il collegamento del NAS), `server/src/ricordo.js` (le scritture da non rifare), prove in `apps-script/prove/porta.test.js`
e `server/prove/porta.test.js`.

## 1. Come funziona

```
 telefono / computer fuori casa                 Google (lo script del foglio)                  NAS di casa
 ------------------------------                 -----------------------------                  -----------
 1. POST {porta:1, id, token, ...}  ─────────▶  2. mette la richiesta in coda
                                                   (cache dello script) e aspetta
                                                                                  ◀────────── 3. portaPrendi: "c'è lavoro?"
                                                   la chiamata del NAS resta aperta                 (sempre aperta, giorno e notte)
                                                   fino a 45 s; arriva il lavoro:     ─────────▶ 4. il server fa la richiesta
                                                   la chiude e glielo consegna                       (stessi permessi, stesso registro)
                                                                                  ◀────────── 5. portaPrendi successiva, con la
                                                6. scrive la risposta nella cache                    risposta dentro
 8. riceve la risposta              ◀─────────  7. l'esecuzione dell'app la trova
```

- È **sempre il NAS a chiamare Google**, con il segreto `SEGRETO_SERVER` (lo stesso del postino).
- Lo script **non legge i token e non guarda i dati**: passa tutto al server, che decide come da casa.
- Se in 25 secondi la risposta non arriva, lo script risponde all'app "riprova" (`rete: true`); la richiesta ripetuta
  con lo stesso `id` non viene fatta due volte (§5).
- **In casa** le app parlano direttamente col server (`http://192.168.1.51:8400`) e Google non serve (§8).

## 2. I limiti di Google e come si rispettano

Account Google gratuito, dalla pagina ufficiale delle quote (developers.google.com/apps-script/guides/services/quotas) e
dalla documentazione di CacheService (developers.google.com/apps-script/reference/cache/cache), lette il 31/10/2026:

| Limite | Valore | Cosa fa la porta |
|---|---|---|
| Esecuzioni di `doGet`/`doPost` | nessun limite documentato | ~2.000 chiamate del NAS al giorno + 1-2 per ogni richiesta delle app |
| Esecuzioni contemporanee | **30 per utente** (lo script gira come il proprietario) | il NAS ne tiene 1 aperta (2 quando consegna una risposta lenta); ogni app che aspetta ne tiene 1 per 1-2 secondi; coda massima 40 |
| Durata di un'esecuzione | 6 minuti | la chiamata del NAS al massimo 55 s (di base 45), l'app 25 s |
| Richiesta e risposta | 50 MB | un file passa fino a circa 25 MB (in base64 sono 33 MB) |
| Proprietà dello script | 9 KB per valore, 500 KB in tutto, **50.000 letture/scritture al giorno** | la coda **non** sta lì: una sola lettura per esecuzione (`getProperties`), circa 3.000 al giorno |
| CacheService | chiave ≤ 250 caratteri, valore ≤ **100 KB**, scadenza da 1 s a **6 ore** (di base 10 minuti), **1.000 voci** al massimo (oltre restano le 900 più lontane dalla scadenza), "la scadenza è solo un suggerimento: la cache può togliere prima"; nessun limite documentato per `putAll`/`getAll` | la coda sta qui, a pezzi da 90.000 caratteri, ogni voce scade dopo 10 minuti e si toglie appena consegnata; di solito meno di 50 voci |
| UrlFetch | 20.000 al giorno | la porta non lo usa (è il NAS a chiamare) |
| Attivatori | 90 minuti al giorno | la porta non li usa |

Il finto Google (`apps-script/prove/finto-google.js`) ha gli stessi limiti della cache, le 30 esecuzioni contemporanee
e ogni richiesta in un'esecuzione sua, in parallelo, come Google.

**Quante esecuzioni al giorno.** Il NAS: una chiamata ogni 45 secondi quando non c'è lavoro, cioè circa 1.900 al
giorno, sempre una aperta. Ogni richiesta di un'app: la sua esecuzione più, in media, una chiamata del NAS in più
(quella che torna subito col lavoro). Con 5 persone e 300-600 richieste fuori casa al giorno: **2.500-3.100 esecuzioni
al giorno**, quasi sempre 1-3 contemporanee. La cache: il NAS guarda la coda ogni 0,3 secondi mentre aspetta, circa
290.000 letture al giorno (nessun limite documentato). Tutto si vede ogni giorno in `/salute` e in Amministrazione
(`google.oggi`, §11).

## 3. Le richieste delle app allo script

Sempre **POST** all'indirizzo dello script (quello che finisce con `/exec`), corpo JSON, `Content-Type: text/plain;
charset=utf-8` (niente preflight; lo script legge il corpo grezzo). Google risponde con un rimbalzo 302 verso
`script.googleusercontent.com`, da seguire con una GET: OkHttp e HttpClient lo fanno da soli e **non va forzato** (forzare
la POST sul rimbalzo dà 411, verificato il 07/08 col Wisper di prima). Apps Script non legge le intestazioni HTTP:
il token va nel corpo.

Campi comuni:

| Campo | Cosa |
|---|---|
| `porta` | sempre `1`: dice allo script che è un'app nuova (le versioni vecchie mandano `codice`) |
| `id` | l'id della richiesta, 8-80 caratteri `[A-Za-z0-9_-]` (§5). Facoltativo: senza, lo script ne fa uno (e una ripetizione non si riconosce) |
| `token` | il token di `accedi`, lo stesso che a casa va in `Authorization: Bearer`. Vuoto per `accedi` |
| `strada` | `exec`, `carica`, `file` o `salute` |

### `strada: "exec"` (come `POST /exec` di casa)

```json
{"porta": 1, "id": "q7Kp2xRw9sLm4tVb", "token": "4zGTu2KDEvjsiw3i1x6E...", "strada": "exec",
 "metodo": "POST", "dati": {"azione": "salvaRapportino", "rapportino": {"idLocale": "...", "...": "..."}}}
```

- `dati` = esattamente il corpo che l'app manderebbe a `POST /exec` (con `disp`, `dispNome`, `app` dove li manda oggi).
- `metodo`: `POST` (di base) o `GET`. Con `GET` il server lo tratta come `GET /exec?...` (parametri come testo; le
  azioni che scrivono rispondono "Questa azione vuole una POST"). **Si può usare `POST` per tutto**: le letture
  rispondono uguale.
- La risposta è quella di `/exec`, campo per campo (`architettura.md` §12 e seguenti), con permessi, soldi tolti, dati
  riservati tolti come da casa. Gli `url` dei file restano `"/file/<id>"`: fuori casa il file si chiede con
  `strada: "file"` e quell'id.

### `strada: "carica"` (come `POST /carica` di casa)

```json
{"porta": 1, "id": "...", "token": "...", "strada": "carica",
 "query": {"nome": "Schema quadro.pdf", "mime": "application/pdf", "idFile": "f-8d2...", "per": "documento"},
 "disp": "tel-1234", "dispNome": "Telefono di Marco", "app": "wisper-android 0.10.0",
 "base64": "JVBERi0xLjQK..."}
```

`query` = i parametri di `/carica` (`nome`, `mime`, `idFile`, `per`); `disp`, `dispNome`, `app` = le intestazioni
`X-Wisper-Disp...` di casa; `base64` = i byte del file. Risposta come `/carica`:
`{"ok": true, "file": {"id", "nome", "mime", "byte", "sha256"}}`. Lo stesso `idFile` ridà lo stesso file (come oggi).
Oltre circa 25 MB di file: `{"ok": false, "errore": "La richiesta è troppo grande per passare da Google (al massimo
26 MB): mandala quando sei in ufficio"}` (senza `rete`: riprovare uguale non serve; l'app la tiene per casa).

### `strada: "file"` (come `GET /file/<id>` di casa)

```json
{"porta": 1, "id": "...", "token": "...", "strada": "file", "file": "aB3dE5fG7hI9jK1lM3nO5pQ7rS9t", "disp": "...", "dispNome": "...", "app": "..."}
```

Risposta: `{"ok": true, "nome": "Schema quadro.pdf", "mime": "application/pdf", "byte": 183244, "base64": "..."}`.
I codici HTTP di casa arrivano nel campo `stato`: `{"ok": false, "stato": 401, "accesso": false, "errore": "Accesso
scaduto: entra di nuovo"}`, `403` (`permesso: false`), `404`, `413` (file oltre 25 MB: "aprilo quando sei in ufficio").

### `strada: "salute"` (risponde lo script, senza il NAS)

`{"porta": 1, "strada": "salute"}` → `{"ok": true, "porta": "google", "server": "acceso", "ultimoContatto":
"2026-10-31T12:40:11"}`. `server: "spento"` se il NAS non si fa vivo da più di 90 secondi. Non serve il token.

### Tempi delle app verso lo script

Connessione 15 s, lettura **60 s** (lo script aspetta fino a 25 s, più l'avvio di Google, più i file grandi), scrittura
del corpo 120 s per `carica`. Le scritture **non si ripetono da sole** a livello HTTP (come oggi: `retryOnConnectionFailure(false)`):
riprova la coda, con lo stesso `id`.

## 4. Le risposte "riprova" dello script

Quando la risposta non è del server, lo script risponde (sempre HTTP 200, JSON):

| `porta` | Quando | Esempio di `errore` |
|---|---|---|
| `spento` | il NAS non si fa vivo da più di 90 s (o la porta non è collegata: manca `SEGRETO_SERVER`). Risposta **subito**, la richiesta **non** resta in coda | "Il server dello studio non risponde dalle 10:42: riprova più tardi" (+ `ultimoContatto`) |
| `attesa` | il NAS c'è ma la risposta non è arrivata in 25 s. La richiesta **resta in coda** (10 minuti) | "Il server dello studio non ha risposto in tempo: riprova fra poco" |
| `occupato` | 40 richieste già in coda, o lo script non riesce a mettere in coda | "Troppe richieste insieme: riprova fra poco" |

Tutte hanno `"ok": false, "rete": true`: **le app le trattano come un errore di rete** (oggi `ServizioNonRaggiunto` sul
telefono, `rete: true` sul computer): la coda non scarta niente e riprova più tardi, lo stesso lavoro con lo stesso
`id`. Il testo si può mostrare così com'è. Una pagina HTML invece del JSON (lo script si è fermato, una quota di Google)
o un HTTP diverso da 200 (429 = troppe esecuzioni insieme) sono anche loro "rete".

`{"ok": false, "errore": "Richiesta non valida"}` (senza `rete`): la richiesta è fatta male, riprovare non serve.

## 5. Senza doppioni

- **`id` della richiesta.** Un id nuovo e casuale per ogni operazione (per esempio 16 caratteri base64url), **lo stesso
  quando si riprova la stessa operazione** (la coda lo salva insieme all'elemento; "Riprova" dell'utente lo riusa),
  mai lo stesso per due operazioni diverse. Per le letture un id nuovo ogni volta va bene.
- Lo script: una richiesta con un `id` già in coda non si rimette in coda (l'app aspetta quella); se la risposta è già
  arrivata, la ridà subito.
- Il server: una **scrittura** (azioni che scrivono o che vogliono una POST) con un `id` già fatto, **con lo stesso
  token**, ridà la risposta di prima senza rifarla, per un giorno (`server/src/ricordo.js`, tabella `richieste_fatte`).
  Solo le risposte `ok: true`; mai `accedi` né risposte con dentro token o password (quelle si rifanno).
- **A casa** lo stesso: nel corpo di `POST /exec` il campo **`idRichiesta`** con lo stesso id. Così una scrittura partita
  a casa, rimasta senza risposta e ripetuta via Google (o il contrario) si fa una volta sola.
- Restano le difese di oggi: `idLocale` (rapportini, ore, spese, ticket), `idFile` (file).

## 6. Come il NAS va a prendere il lavoro

Tutte POST allo script con il campo `segreto` = `SEGRETO_SERVER`, mai col codice delle app.

- `portaPrendi {segreto, attesa, max, risposte, inCorso}` → `{"ok": true, "adesso", "consegnate", "scadute", "lavori":
  [{"id", "prese", "inCoda", "lavoro": {"tipo": "exec"|"carica"|"file"|"ponte", ...}}]}`. Lo script consegna prima le
  `risposte` (`[{id, risposta}]`), poi aspetta lavoro fino a `attesa` secondi (di base 45, massimo 55) guardando la
  coda ogni 0,3 s, e torna appena ne trova (al massimo `max` lavori, al massimo 40 milioni di caratteri). `inCorso` =
  gli id che il NAS ha in mano: un lavoro "preso" che non c'è si era perso (il NAS è ripartito, o la risposta di Google
  non gli è arrivata) e torna subito disponibile; senza `inCorso` torna disponibile dopo 60 s. Dato tre volte senza
  risposta, l'app riceve "riprova" invece di aspettare.
- `portaConsegna {segreto, risposte}` → `{"ok": true, "consegnate", "scadute"}`: le risposte dei lavori lenti, mandate
  appena pronte mentre una `portaPrendi` sta aspettando.
- Segreto sbagliato: `{"ok": false, "errore": "Segreto sbagliato"}` e una riga `rifiutato` nella scheda Accessi.

**Perché l'attesa lunga e non "ogni tot secondi".** Con una chiamata ogni 2 secondi di giorno servirebbero 43.000
esecuzioni al giorno e l'attesa media sarebbe di un secondo in più; con pause più lunghe di notte, una richiesta di
notte aspetterebbe la pausa e andrebbe oltre i 25 secondi dell'app. Con l'attesa lunga il lavoro arriva al NAS entro
0,3 secondi (in media 0,15), giorno e notte, con circa 1.900 chiamate al giorno e una sola esecuzione aperta: costa poco
sempre, quindi non serve distinguere giorno e notte. Il server lato NAS (`server/src/porta.js`):

- una chiamata aperta sempre; appena torna si richiama. I lavori arrivati partono subito, tutti insieme; le risposte
  pronte entro 1,5 s partono con la `portaPrendi` successiva, le altre con `portaConsegna` appena pronte;
- ogni lavoro passa allo stesso gestore di `/exec`, `/carica`, `/file/<id>` e `/ponte` (`richiestaInterna` in
  `src/http.js`): stessi permessi, stesso registro, provenienza `{ip: "google", daFuori: true}`;
- se Google non risponde (rete, pagina d'errore, 429, quote) riprova dopo 2, 4, 8... secondi fino a un minuto, senza
  fine; le risposte non consegnate restano sul NAS e ripartono (per 9 minuti; lo script dimentica le richieste dopo
  10); lo stesso lavoro ridato mentre è in corso si aspetta, non si rifà;
- strada di riserva, se un giorno Google non volesse chiamate tenute aperte: `WISPER_PORTA_ATTESA=0` e
  `WISPER_PORTA_PAUSA=3` nel `.env` = una chiamata breve ogni 3 secondi (circa 29.000 al giorno), senza cambiare codice.

## 7. I pezzi grandi

Tutto quello che passa dallo script è testo JSON con le lettere oltre l'ASCII scritte `\uXXXX` (un carattere = un byte).

- fino a 90.000 caratteri: una voce di cache;
- fino a **2 milioni** di caratteri (una foto, un PDF piccolo, una risposta lunga): a pezzi da 90.000 nella cache, scritti
  e letti in una chiamata sola (`putAll`/`getAll`), al massimo 22 voci;
- oltre: un **file temporaneo** nella cartella `Wisper/Porta (temporanei)` di Drive, **tolto appena consegnato**. Col
  servizio avanzato **Drive API** acceso (§12, gratis) si cancella per sempre; senza, va nel cestino di Drive, che Google
  svuota da solo dopo 30 giorni. La pulizia (al massimo ogni 15 minuti, dentro una `portaPrendi`) toglie i file rimasti
  indietro da più di 30 minuti e le richieste vecchie dalla coda;
- oltre circa 36 milioni di caratteri (un file di 26-27 MB) la richiesta non passa (§3); un file da scaricare oltre 25 MB
  risponde `stato: 413`.

## 8. In casa: la regola esatta (telefono e computer)

Due indirizzi nelle impostazioni di accesso: **casa** (di base `http://192.168.1.51:8400`) e **Google** (l'indirizzo
dello script). Senza indirizzo Google: solo casa, come oggi. Senza indirizzo di casa: solo Google.

1. **Quando si sceglie**: all'avvio dell'app, quando cambia la rete (Wi-Fi ↔ dati, un'altra Wi-Fi: Android
   `ConnectivityManager.NetworkCallback`, Windows `NetworkChange.NetworkAddressChanged`), quando la scelta ha più di
   5 minuti, e subito dopo un errore di rete verso casa.
2. **La prova di casa**: `GET <casa>/salute?prova=<P>&chi=<C>`, **1,5 secondi in tutto** (connessione e risposta). `P` =
   32 caratteri casuali nuovi a ogni prova; `C` = i primi 16 caratteri esadecimali (minuscoli) di SHA-256(token). Vale
   "casa" solo se: HTTP 200, `ok: true` e **`firma` = esadecimale minuscolo di HMAC-SHA256(chiave = SHA-256(token)
   scritto in esadecimale minuscolo come testo UTF-8, messaggio = `P`)**. Esempio di verifica in `server/prove/porta.test.js`
   ("la firma di casa"). Solo il server vero conosce lo SHA-256 del token: un altro apparecchio con lo stesso indirizzo su
   un'altra rete (un albergo, un cliente) non sa fare la firma, e l'app **non gli manda mai il token**. Senza token
   (prima di `accedi`) la firma non si può controllare: **`accedi` va via Google** se l'indirizzo Google c'è.
3. **Casa sceglie casa** per 5 minuti: tutte le richieste a `<casa>/exec`, `/carica`, `/file/<id>` come oggi (Bearer
   nell'intestazione), con `idRichiesta` nelle POST (§5). Ogni risposta riuscita da casa rinnova i 5 minuti.
4. **Altrimenti Google** per 5 minuti (o fino al prossimo cambio di rete).
5. **Una richiesta a casa che fallisce per rete** (connessione rifiutata, tempo scaduto, HTTP diverso da 200): la scelta
   passa subito a Google e la stessa richiesta parte via Google **con lo stesso id** (letture sempre; scritture anche,
   perché il server riconosce l'id). Una risposta JSON del server (anche `ok: false`) non è un errore di rete.
6. Le due strade danno le stesse risposte: l'interfaccia non cambia. Si può mostrare dove si è (per esempio "In ufficio"
   / "Via Google") in Impostazioni.

## 9. Se il NAS è spento

Il NAS spento (o senza internet) non chiama più Google: dopo 90 secondi lo script risponde a ogni richiesta, **subito**,
`porta: "spento"` con l'ora dell'ultimo contatto (§4). Le app lavorano già senza rete: tengono in coda rapportini, ore,
spese, foto e li mandano quando torna. Una richiesta arrivata mentre il NAS si spegneva resta in coda 10 minuti e si fa
appena torna; la ripetizione con lo stesso id riceve quella risposta. La mattina alle 7 `controlloMattina` (Ponte.gs)
manda un'email al proprietario se il NAS non si fa vivo da più di 30 minuti.

## 10. Sicurezza

- **Il canale NAS ↔ script**: HTTPS verso Google, sempre dal NAS; il segreto `SEGRETO_SERVER` nel corpo (Apps Script non
  legge le intestazioni), confrontato senza far capire quante lettere sono giuste; mai nel registro. Chi ha l'indirizzo
  dello script e il codice delle app **non** può prendere il lavoro né consegnare risposte finte. Il NAS non apre porte.
- **I token**: lo script li passa senza leggerli; li controlla il server (scaduti, revocati, utente disattivato: come da
  casa). Lo script non scrive le richieste delle app nuove nella scheda Accessi (le registra il server, con
  provenienza "google").
- **Cosa passa e resta su Google**: le richieste e le risposte (dati, token, file) stanno nella cache dello script **solo
  il tempo della consegna** (di solito 1-2 secondi), tolte appena consegnate; al massimo 10 minuti se nessuno le ritira.
  I pezzi grandi su Drive: tolti appena consegnati (per sempre col servizio Drive API; senza, nel cestino fino a 30
  giorni). Nella pagina "Esecuzioni" dell'editor restano per qualche giorno solo nome della funzione, ora e durata
  (la porta non scrive i dati nel registro di Apps Script). Google, come per Gmail e Drive, tecnicamente vede quello che
  passa dai suoi server.
- **I dati riservati della fase 6** (stipendi, documenti personali, giudizi del medico): passano da Google solo quando chi
  ha il permesso li apre fuori casa, con le stesse regole di casa (il server li toglie a chi non ha `riservati`, e chi li
  apre resta in `accessi_riservati`). Da sapere: **la copia notturna del database va già su Drive ogni notte** (postino,
  `Wisper/Copie NAS/`, compressa ma non cifrata), con dentro tutto. Se si vuole che i riservati non passino mai da
  Google, le strade sono: (a) il server li toglie a tutte le richieste che arrivano da Google (pochi cambi nel server,
  "si aprono solo in ufficio"); (b) cifrare la copia notturna prima di mandarla. Da decidere (Andrea).
- **Il codice delle versioni vecchie** resta il controllo dello script per loro (§12): chi ha indirizzo e codice ha le
  stesse possibilità di oggi, con le richieste fatte dal server come il titolare.

## 11. Limiti ai tentativi d'accesso

Apps Script non conosce l'indirizzo di chi chiama, e lo script non ne inventa uno (un campo nel corpo lo potrebbe
scrivere chiunque). Allora tutte le richieste da Google arrivano al server con l'indirizzo **`google`**, da fuori:

- 10 password sbagliate in 15 minuti per la stessa email **da Google** fermano quell'email da Google per 15 minuti; da
  casa entra lo stesso (l'indirizzo è diverso);
- 30 password sbagliate in 15 minuti **da Google, su qualunque email**, fermano per 15 minuti gli accessi nuovi da Google
  (nota nel registro: "accessi nuovi attraverso Google fermati"). Chi è già entrato continua a lavorare (il token vale
  180 giorni), da casa si entra sempre. Chi prova a indovinare, anche con l'indirizzo dello script, fa al massimo 30
  tentativi ogni 15 minuti in tutto;
- restano i 50 tentativi per email da tutti gli indirizzi insieme.

## 12. Le versioni vecchie (0.4.0, col codice)

Il giorno del cambio Andrea mette la proprietà **`PONTE_PORTA` = `si`**. Da lì, una richiesta col `codice` giusto
(GET o POST) va nella **stessa coda** come lavoro `ponte` (senza il codice, con `metodo` GET/POST come il ponte di
sempre), il server la fa come il titolare con la nota "dalla versione vecchia (ponte)", e la risposta torna all'app
(con gli url dei file come link di Drive, come oggi col ponte). Se il NAS è spento o non risponde in 25 s, lo script
**si ferma con un errore** (pagina HTML): le app vecchie lo trattano come rete e riprovano, senza scartare la coda
(leggono con 30 s di pazienza, scrivono con 90). Il codice sbagliato si ferma allo script. Ogni richiesta lascia la
riga `ponte` in Accessi, come oggi. Senza `PONTE_PORTA` il foglio risponde da sé come oggi (prima del cambio).
`SERVER_URL` (lo script che chiama il server con UrlFetch) resta per il giorno in cui il NAS fosse raggiungibile.

## 13. Tempi

Misurati in locale (finto Google + server di prova, `server/prove/porta.test.js`, "la prova a tempo reale"): **mediana
0,3-0,5 s** per una richiesta `io` via porta, contro 3 ms da casa; in coda sullo script in media 0,15 s, lavoro del
server 10-50 ms. Il resto è l'avvio delle due esecuzioni nel percorso (quella dell'app e la `portaPrendi` che porta la
risposta) e i 0,2 s con cui l'app guarda la cache. Con un avvio simulato di 0,7 s per esecuzione
(`WISPER_FINTO_RITARDO_MS=700`): **mediana 1,9 s**. Sul Google vero ci si aspetta **1,5-3 secondi** per una richiesta
normale (come il Wisper di prima, che leggeva il foglio in 1-10 s), di più per i file grandi su Drive. Da misurare sul
Google vero: `google.oggi` di `/salute` dà ogni giorno chiamate, lavori, errori, attesa in coda e tempo del server.

## 14. Proprietà dello script e variabili del NAS

Script (Impostazioni progetto › Proprietà dello script):

| Proprietà | Cosa |
|---|---|
| `SEGRETO_SERVER` | lo stesso valore del `.env` del NAS: apre la porta e il postino |
| `PONTE_PORTA` | `si` dal giorno del cambio: le versioni vecchie passano dalla coda |
| `PORTA_ATTESA_MS` | facoltativa: quanto aspetta l'esecuzione di un'app (di base 25000; più di 25000 no, le app vecchie leggono con 30 s) |

NAS (`.env`): `WISPER_POSTINO_URL` (l'indirizzo dello script, quello del postino), `SEGRETO_SERVER` (e, se diverso,
`WISPER_POSTINO_SEGRETO`, che vince), facoltative `WISPER_PORTA_ATTESA` (45), `WISPER_PORTA_PAUSA` (0),
`WISPER_PORTA_GOOGLE=no` per spegnerla. La porta parte da sola con il server quando indirizzo e segreto ci sono.

Lo stato si legge in `/salute` (da casa) e in `copie` (Amministrazione), campo `google`:
`{"stato": "attivo", "frase": "Attivo, ultimo contatto alle 10:42", "ultimoContatto": "2026-10-31T10:42:03", "oggi":
{"chiamate", "lavori", "errori", "attesaInCodaMs", "lavoroMs"}, "inCorso", "daConsegnare", "ultimoErrore"?}`. Stati:
`attivo`, `in avvio`, `non risponde` (con `ultimoErrore`), `fermo`, `spento` (`WISPER_PORTA_GOOGLE=no`), `non
collegato` (mancano indirizzo o segreto). La Dashboard di Amministrazione mostra "Collegamento a Google: " + `frase`.

## 14bis. Precisazioni dopo telefono e computer (31/10/2026)

- **Il limite dei file è uno solo: 26.000.000 byte** (circa 26 MB). Dove sopra c'è scritto "circa 25 MB" vale questo
  numero: le app rifiutano prima di mandare un file più grande, col messaggio di §3.
- **`/carica` manda sempre `idFile`** (se la pagina o la schermata non lo dà, l'app lo crea): è `idFile`, non l'`id` della
  richiesta, che impedisce di caricare due volte lo stesso file.
- **Le risposte HTTP di `/file`**: `401`, `403` e `404` sono risposte del server, non problemi di rete (non si riprova);
  solo l'assenza di risposta, i tempi scaduti e `5xx` contano come rete.
- **Il file di collegamento `.wisper`** (quello che il telefono fa mandare per email per collegare il computer) ha il formato
  `{"tipo": "wisper-collegamento", "versione": 2, "google": "<indirizzo dello script>", "casa": "http://192.168.1.51:8400"}`;
  il computer accetta anche il file della 0.4 (`url` = indirizzo dello script, il codice si butta). Il file non contiene mai
  token né codici; dopo averlo letto il computer lo cancella e tiene l'indirizzo cifrato.
- **Entrare con email e password passa sempre da Google**: a casa non c'è la firma prima di avere un token, e la password non
  va mandata in chiaro a un apparecchio che potrebbe non essere il server. Se Google non funziona, in casa si può scegliere
  "Non usare Google" (solo server di casa) sapendo che la password viaggia sulla rete di casa senza cifratura. Da migliorare
  in futuro con una chiave del server conosciuta dall'app dopo il primo accesso.

## 15. Da provare sul Google vero

- che Google tenga aperta una chiamata `portaPrendi` per 45 s senza chiuderla prima (se la chiude, `WISPER_PORTA_ATTESA`
  più bassa, o la strada di riserva del §6);
- che la cache sia vista subito da tutte le esecuzioni (la porta lo dà per scontato; nel finto Google è così);
- i tempi veri (§13) e le quote in una settimana d'uso (`google.oggi`); che Google non conti il tempo delle chiamate
  aperte in qualche limite non documentato;
- un file di 20 MB avanti e indietro, e `Drive.Files.remove` col servizio Drive API acceso;
- il rimbalzo 302 dalle app nuove e dal NAS (il postino lo segue già);
- una versione 0.4.0 vera sul telefono che passa dalla coda con `PONTE_PORTA = si`.
