# Fase 7: portale clienti, WhatsApp e comunicazioni (accordo e schermate)

Si aggiunge ad [`architettura.md`](architettura.md), [`fase1-schermate.md`](fase1-schermate.md), [`fase2.md`](fase2.md),
[`fase3.md`](fase3.md), [`fase4.md`](fase4.md), [`fase5.md`](fase5.md) e [`fase6.md`](fase6.md), che restano validi.
Ricerca e fonti in [`ricerca-fase7.md`](ricerca-fase7.md). Prototipo:
[`docs/prototipo/Gestionale-fase7.html`](../prototipo/Gestionale-fase7.html) (con la vista **Cliente**).

Chi costruisce server, portale web, app Android e Wisper Ufficio legge **solo** questo file (più l'architettura e le
fasi 2-6, da cui dipende): se qualcosa manca o non torna, lo dice invece di inventare. Le parole delle schermate sono
quelle scritte qui, uguali su telefono e computer. La migrazione è la **007** e viene dopo la 006 della fase 6.

**Vincolo di Andrea del 22/10/2026: tutto gratuito.** Niente dominio, niente abbonamenti: le strade A (Tailscale
Standard) e B (Cloudflare + dominio) di §3 **non valgono più**. **Il 31/10/2026 Andrea ha scelto Google come porta
d'ingresso** ([`porta-google.md`](porta-google.md)): il portale passa anche lui da Google, come scritto in **§0**, che
**vale sopra** a tutto quello che nelle sezioni successive parla di porta 8401, Tailscale, Funnel, Cloudflare, cookie,
CSRF, indirizzi IP e ingresso.

## 0. La strada Google (01/11/2026): cosa cambia in questo accordo

Tutto il resto dell'accordo (dati, viste a elenco chiuso, pubblicazioni, accettare e firmare, richieste, file, email,
WhatsApp, comunicazioni, notifiche, schermate dello studio) resta com'è. Cambia **come il cliente arriva al server** e,
di conseguenza, sessione, limiti e prove di sicurezza. Gratis, senza dominio, senza toccare il router.

### 0.1 I tre pezzi

```
 cliente (browser)
   │ 1. apre la pagina del portale: file fissi, senza dati      ──►  Netlify (gratis): https://studiogm-portale.netlify.app
   │ 2. ogni richiesta: POST JSON allo script del portale       ──►  Google: lo script del portale (progetto SUO, separato
   │                                                                  da quello del foglio), che la tiene in coda
   ▼                                                                         ▲
 il NAS di casa: un secondo giro di porta.js (soloPortale) va a prendere ─────┘ il lavoro e lo passa SOLO al router del
 portale (server/src/portale/), mai a /exec. A casa non si apre niente.
```

1. **La pagina del portale** (`portale/` nella radice del repository): `index.html`, `portale.css`, `portale.js`,
   `documenti.js` (copiato da `pc/ui/documenti.js` quando si prepara), il carattere Figtree, `_headers` (le intestazioni
   di §0.4 per Netlify) e `config.js` con l'indirizzo dello script del portale. `config.js` **non sta nel repository**
   (c'è `config.esempio.js`): lo scrive `node strumenti/prepara-portale.js --script <indirizzo> --uscita <cartella>`,
   che mette nella cartella tutta la pagina pronta. Andrea la pubblica su **Netlify** (piano gratuito, che permette l'uso
   commerciale; lui lo usa già): trascina la cartella su app.netlify.com/drop, nome del sito per esempio
   `studiogm-portale`. Quell'indirizzo va in `PORTALE_INDIRIZZO`. Netlify consegna solo file fissi: i dati non passano
   da lì. Perché non una pagina servita dallo script stesso (HtmlService): Google ci mette sopra la fascia grigia "Questa
   applicazione è stata creata da un altro utente, non da Google" e la chiude in una cornice dove scaricare e stampare
   funzionano male; per i clienti dello studio non va.
2. **Lo script del portale**: un **progetto Apps Script nuovo**, dello stesso account Google dello studio, con due file:
   `Porta.gs` (identico a quello del foglio) e `PortaleClienti.gs`. Pubblicato come app web, "Esegui come: io", "Chi ha
   accesso: chiunque". Proprietà dello script: `SEGRETO_SERVER` = un segreto **nuovo**, diverso da quello del foglio
   (sul NAS si chiama `SEGRETO_PORTALE`). Non ha bisogno di fogli né di Gmail; Drive solo per i file oltre 2 MB, come la
   porta. Il suo indirizzo è pubblico per forza (sta nella pagina) e da solo non apre niente: risponde solo al protocollo
   di §0.2 e passa tutto al server. **L'indirizzo dello script del foglio resta segreto come sempre** e non compare mai
   nella pagina, nelle email o nei messaggi: è il motivo per cui lo script del portale è un progetto a parte.
3. **Il NAS**: nel `.env` `WISPER_PORTALE_URL` (l'indirizzo dello script del portale, quello che finisce con `/exec`) e
   `SEGRETO_PORTALE`. `avvio.js` accende un secondo `PortaGoogle` con `soloPortale: true`: prende i lavori solo da lì,
   accetta solo `tipo: "portale"` e li passa a `w.portale.richiesta(lavoro)` (il router di §6.1). Il giro di sempre
   (quello del foglio) rifiuta `tipo: "portale"` (`Richiesta non valida`). **Nessuna porta nuova**: niente 8401, niente
   contenitore d'ingresso, niente righe in `docker-compose.yml` oltre alle due variabili. `--porta-portale <n>` esiste
   **solo con `--prova`** (fuori da `--prova` il server si rifiuta di partire): un ascolto HTTP locale che parla il
   protocollo di §0.2 come lo script, per provare la pagina sul PC senza Google.

Il finto Google fa anche lo script del portale: `WISPER_PROGETTO=portale node apps-script/prove/finto-google.js 8766`
carica `Porta.gs` e `PortaleClienti.gs` (niente foglio, niente dati di esempio) e risponde con
`Access-Control-Allow-Origin: *` come Google dopo il rimbalzo su `script.googleusercontent.com`.

### 0.2 Il protocollo fra la pagina e lo script

Sempre **POST** all'indirizzo dello script, corpo JSON come testo (`fetch` con un corpo stringa: `Content-Type:
text/plain`, nessuna domanda preliminare del browser), `redirect: "follow"`, `credentials: "omit"`. Google rimbalza su
`script.googleusercontent.com`, che risponde con `Access-Control-Allow-Origin: *`.

```json
{"portale": 1, "v": 1, "id": "q7Kp2xRw9sLm4tVbX2", "strada": "preventivi/12/accetta", "metodo": "POST",
 "sessione": "4zGTu2KD…", "pre": "", "corpo": {"scelte": {"14": true}, "nome": "Roberto Ferretti", "…": "…"},
 "agente": "Chrome · Android"}
```

| Campo | Cosa |
|---|---|
| `portale`, `v` | sempre `1`; `v` è la versione del protocollo: diversa da quella del server → `{"ok": false, "stato": 426, "errore": "Il portale è stato aggiornato: ricarica la pagina", "ricarica": true}` |
| `id` | 16-80 caratteri `[A-Za-z0-9_-]`, nuovo per ogni operazione e **lo stesso quando la pagina riprova la stessa** (porta-google.md §5): una POST ripetuta non si fa due volte |
| `strada` | il percorso di §6.1 senza `/portale/api/`: `entra`, `codice`, `link`, `link-nuovo`, `esci`, `informativa`, `azienda`, `io`, `casa`, `preventivi`, `preventivi/12`, `preventivi/12/accetta`, `scarica/<chiave>`, `immagine/<chiave>`, `carica`, … più due nuove: `studio` (pubblica, §0.3) e `condiviso/<token>` / `condiviso/<token>/scarica` (i link della fase 5, che diventano pagine del portale). Forma: `^[a-z-]+(/[A-Za-z0-9_.-]{1,200}){0,3}$`, niente `..` |
| `metodo` | `GET` per le letture, `POST` per i cambi, come §6.1. Strada o metodo fuori elenco → `{"ok": false, "stato": 404, "errore": "Non trovato"}`, sempre uguale |
| `sessione` | il token della sessione (§0.4), `""` prima di entrare |
| `pre` | la pre-sessione (§0.4), solo con `entra` e `codice` |
| `corpo` | il corpo JSON di §7 (oggetto; `{}` per le letture). Limiti di §6.4 sul testo del corpo: 64 KB, 300 KB per `accetta` e `firma`, `carica` a parte |
| `agente` | "Chrome · Android", "Edge · Windows" (la pagina lo ricava da `navigator.userAgent`, al massimo 40 caratteri): è quello che finisce nel registro come dispositivo |

**La risposta** è il JSON di §7 con in più **`stato`**, il codice HTTP che §7 dava (200, 400, 401, 403, 404, 409, 413,
426, 429, 503): lo script risponde sempre HTTP 200. Lo script controlla solo la forma (portale 1, strada con la forma
giusta, corpo oggetto, grandezza fino a 36 milioni di caratteri) e non guarda dentro: decide tutto il server. Le
risposte "riprova" della porta (porta-google.md §4: `rete: true`, `porta: spento | attesa | occupato`) arrivano così
come sono: la pagina dice "Il portale non risponde adesso: riprova fra qualche minuto" con il telefono dello studio
(dall'ultima `studio` letta, tenuta in `localStorage`). Lo script aspetta il server **al massimo 20 secondi**
(`PORTALE_ATTESA_MS`), la pagina 45.

**File.** Il cliente manda un file con `strada: "carica"`, `corpo: {"nome": "Schema quadro QG2.pdf", "per": "documento",
"base64": "…"}` (20 MB di file sono 27 MB in base64: passano dalla porta); i controlli sono quelli di §6.7 sui byte
decodificati. `scarica/<chiave>` e `immagine/<chiave>` rispondono `{"ok": true, "stato": 200, "nome", "mime", "byte",
"base64"}` (le regole di §7.8 restano: chiave di 10 minuti, solo con la stessa sessione, file ancora vedibile); la
pagina fa un `Blob`: scaricare = un collegamento con `download`, immagine = `blob:` nell'`img`. Oltre 25 MB un file non
passa da Google (`stato: 413`, "Il file è troppo grande per scaricarlo dal portale: chiedilo allo studio").

### 0.3 La strada `studio`

`GET studio` (senza sessione) → `{"ok": true, "stato": 200, "studio": {"nome": "Studio Tecnico GM", "telefono": "0445
000100", "email": "ufficio@studiogm.example", "indirizzo": "…", "partitaIva": "…"}, "attivo": true}`: quello che la
pagina d'ingresso e il piè di pagina mostrano (sono già pubblici sui documenti dello studio). Con il portale spento
`attivo: false` e la pagina mostra "Il portale di Studio Tecnico GM non è attivo" col telefono.

### 0.4 Sessione e sicurezza senza cookie

- **Niente cookie.** Lo script non può metterne e la pagina sta su un altro indirizzo. La **sessione** è un token di 32
  byte che il server dà con `codice`, `link` e `azienda` (`"sessione": "…"` nella risposta) e che la pagina tiene in
  `sessionStorage` (si perde chiudendo la scheda, come il cookie di sessione di prima) e manda in `sessione` a ogni
  richiesta. La **pre-sessione** è un valore casuale di 32 byte che la pagina crea, tiene in `sessionStorage` e manda in
  `pre` con `entra` e con `codice`: il codice vale solo con la stessa pre-sessione (ASVS 6.6.2, come il cookie di prima).
  Nel database solo lo SHA-256 di tutti e due. Durate, uscita, **Esci da tutti i dispositivi**, chiusure (§3.4, §6.3)
  restano uguali.
- **CSRF non c'è da difendere**: nessuna credenziale parte da sola dal browser (il token lo mette la pagina, a mano). Cade
  tutto il pezzo CSRF di §6.3: niente `csrf` in `io`, niente `csrf_hash` in `portale_sessioni`, niente `Sec-Fetch-Site`.
- **L'indirizzo IP non c'è**: Google non lo passa allo script. Le colonne `ip` restano vuote; nella **prova**
  dell'accettazione e della firma (§3.8, §3.9) al posto dell'IP c'è `"via": "google"` con `agente`, ora, impronta,
  nome, firma, email. Il cliente in **Il mio accesso** vede quando e con che dispositivo (niente "da"); lo studio vede
  lo stesso. È un limite detto: la firma elettronica semplice resta valida, con una prova in meno.
- **Limiti** (§6.4): quelli "per IP" diventano **uno per tutto il portale**: al massimo **60 richieste di link all'ora**
  in tutto (oltre: la stessa risposta di sempre, nessuna email, riga `bloccato`) e **1.500 letture ogni 5 minuti** in
  tutto. Quelli per email, referente e sessione restano.
- **Il link**: `{PORTALE_INDIRIZZO}/#/entra/<token>` (e `#/condiviso/<token>`). La parte dopo `#` non arriva a Netlify e
  non finisce nei registri di nessuno; la pagina la toglie dall'indirizzo appena letta. Aprire la pagina non consuma
  niente: solo la strada `link`, mandata dal pulsante **Entra nel portale** (Safe Links resta innocuo).
- **Intestazioni** (§6.2) sulla pagina, in `portale/_headers`:
  `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
  data: blob:; font-src 'self'; connect-src https://script.google.com https://script.googleusercontent.com; form-action
  'none'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'`, più `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=(),
  payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, e `Cache-Control: no-cache` per `index.html` e
  `config.js`. Nessuno script in linea; `textContent` sempre (§7.10).
- **Modello delle minacce** (§4), righe che cambiano: **1** sul NAS non c'è niente su internet; lo script del portale
  risponde solo a §0.2 (strada fuori elenco → 404 uguale), e lo script del foglio non è nominato da nessuna parte;
  **2** e **3** limite generale al posto di quello per IP; **8** niente cookie, quindi niente CSRF; `frame-ancestors`
  sulla pagina; **13** chi ruba l'account Google dello studio o l'account Netlify: verifica in due passi su tutti e due
  (Netlify potrebbe cambiare la pagina e leggere i codici: per questo valgono 10 minuti e accettare e firmare mandano
  un'email di conferma); **14** HTTPS fino a Netlify e fino a Google; Google vede le richieste che passano (le tiene
  nella cache dello script il tempo della consegna, come la porta); **18** lo script del portale ha la sua coda, ma le
  esecuzioni contemporanee (30) sono **per account**: se un giorno il portale avesse tanto traffico da rallentare i
  telefoni dello studio fuori casa, lo script del portale si sposta su un account Google suo, gratis (nota per Andrea,
  non serve ora).

### 0.5 Se il NAS è spento, collegato o no

- Con il NAS spento la pagina c'è comunque (Netlify) e lo script risponde subito `spento`: la pagina mostra "Il portale
  non risponde adesso. Riprova fra qualche minuto o chiama lo studio allo 0445 000100". Sostituisce il primo punto di
  §3.18.
- **Collegato** vuol dire: `PORTALE_INDIRIZZO` scritto **e** il giro del portale che parla con lo script (ultimo
  contatto entro 2 minuti). `controllaPortale` (e il controllo di ogni ora di §3.18) guarda tutte e due le cose: il giro
  e una GET di `PORTALE_INDIRIZZO` che risponde 200 con dentro `<meta name="wisper-portale" content="1">`. Due controlli
  falliti di fila → Dashboard "Il portale non si raggiunge da fuori dalle 14:00" ed email, come §3.18.
- `portale {}` (§10.1): `stato` = `{"attivo", "indirizzo", "collegato": "si" | "no" | "non_collegato", "controllatoIl",
  "script": "attivo" | "non risponde" | "non collegato", "emailRimaste"}` (niente `ingresso`). Nelle schermate dello studio
  la riga dello stato dice "Portale **Collegato** · studiogm-portale.netlify.app"; **Non collegato** con "Il portale non è
  ancora su internet: Amministrazione › Impostazioni › Portale clienti"; in quella scheda, sotto l'indirizzo, la riga
  **Script del portale** con **Attivo** / **Non risponde** / **Non collegato** ("mancano WISPER_PORTALE_URL e
  SEGRETO_PORTALE sul NAS").
- Il battito `postinoBattito` di §10.4 **non serve**: `controlloMattina()` di `Ponte.gs` guarda già l'ultima chiamata del
  NAS alla porta (`porta:nas`). Il server interno non è su internet già oggi.

### 0.6 Le altre sezioni, punto per punto

- **§3.1, §3.2, §6.5, §6.6**: sostituite da §0.1-0.5. `PORTALE_INGRESSO` non esiste. Domande 1 e 2 di §14: decise
  (Google). Costi della fase: **0 €**.
- **§3.4**: valgono i link, il codice, le durate e i limiti per email; cookie e pre-sessione come §0.4.
- **§3.7**: "Scarica il PDF" scarica il file in base64 (§0.2); "Stampa o salva in PDF" resta.
- **§3.19 e §9.8**: i fornitori sono **Google** (lo script del portale porta le richieste; il postino manda le email) e
  **Netlify** (consegna la pagina e vede l'indirizzo di chi la apre, non i dati). Nel riassunto di **Prima di entrare**
  la frase sui fornitori diventa "Le email e il collegamento passano da Google; la pagina è ospitata da Netlify: tutti e
  due possono trattare dati negli Stati Uniti." e quella sul registro "un registro degli accessi (data, ora, browser)";
  quella sui cookie "Usiamo solo la memoria del browser che serve a tenerti dentro, e si cancella chiudendo la scheda:
  niente statistiche, niente pubblicità."
- **§5**: in `portale_link` e `portale_sessioni` niente `csrf_hash`; `pre_hash` è lo SHA-256 di `pre`; `ip` resta
  (vuoto). Le impostazioni di §5.1 senza `PORTALE_INGRESSO`. `CONDIVISIONE_INDIRIZZO` vuoto → i link condivisi della fase 5
  sono `{PORTALE_INDIRIZZO}/#/condiviso/<token>`; la seconda porta `--porta-condivisione` resta com'è (per le prove).
- **§6.1**: la mappa fissa è di strade (§0.2), non di percorsi HTTP; le pagine statiche di §6.1 e §7.10 sono in `portale/`
  con le rotte dopo `#` (`#/preventivi/12`).
- **§6.2, §6.3**: §0.4. **§6.4**: §0.4. **§6.7**: uguale, sui byte decodificati dal base64.
- **§7**: ogni risposta ha `stato`; `codice`, `link` e `azienda` restituiscono anche `"sessione"`; `io` senza `csrf`;
  `accessi` senza `da`; `anteprimaPortale` restituisce `{PORTALE_INDIRIZZO}/#/entra/<token>`.
- **§10.4**: niente `postinoBattito`; `io` in più `portaleCollegato` come §0.5.
- **§13.2**, le prove di sicurezza che cambiano: **1** contro il router del portale (e contro `--porta-portale` in prova):
  strade fuori elenco, `exec`, `io` dello studio, `../`, `%2e`, metodi sbagliati → 404 tutti uguali; il giro del foglio
  rifiuta i lavori `portale` e il giro del portale rifiuta tutto il resto; `--porta-portale` senza `--prova` non parte;
  **5** senza "limiti per IP" ma col limite generale; **6** il token di sessione al posto del cookie (nuovo a ogni
  ingresso, chiuso sul server, pre-sessione diversa → codice rifiutato); **7** diventa: un token di un altro referente
  o di una sessione chiusa → 401; **8** il file `portale/_headers` ha le intestazioni di §0.4 (prova che lo legge) e
  nessuna risorsa esterna nelle pagine; **12** (Andrea, col telefono in 4G): la pagina si apre, si entra con l'email, e
  nella pagina e nei suoi file non c'è l'indirizzo dello script del foglio; **13** ZAP, facoltativa, contro la pagina
  di prova.
- **§14**: per Andrea restano da fare a mano, quando vuole accendere il portale: il progetto Apps Script del portale (due
  file da incollare e "Nuova versione"), il segreto, le due variabili nel `.env` del NAS, la pagina su Netlify, la
  verifica in due passi sugli account Google e Netlify, la prova da fuori casa. Fino ad allora il portale è **Non
  collegato** e tutto il resto della fase 7 funziona.

Il portale è **il primo pezzo di Wisper su internet**. Per questo la sicurezza viene prima di tutto il resto: §3.1-3.6,
il modello delle minacce (§4), le strade del portale (§6) e le prove di sicurezza (§13.2) valgono più delle comodità.

## 1. Cosa consegna

- **15 Portale clienti**: una **pagina web** dello studio (i clienti non installano niente) servita dal server del NAS
  su una **porta sua** (8401) e su **un indirizzo suo**, raggiungibile da internet **solo lei** (§3.1). Ci entrano i
  **referenti** dei clienti (fase 1) a cui lo studio dà l'accesso, **senza password**: un link e un codice per email,
  che valgono 10 minuti (§3.4). Ognuno vede **solo quello che lo studio ha pubblicato per la sua azienda** (e per le
  sue sedi), con un elenco chiuso di campi (§3.5): **preventivi** da guardare e **accettare con la firma** (con le voci
  facoltative e le alternative da scegliere, entra nella stessa accettazione della fase 2), **contratti**, **documenti**
  (la condivisione della fase 5 diventa vera), **rapportini** da guardare e da **firmare a distanza** (§3.9),
  **fatture** emesse da guardare, **richieste d'intervento** da aprire e seguire (i ticket della fase 5 con "da dove
  arriva: portale"), **file da mandare allo studio** (§3.11), **avvisi per email** con le quote del postino (§3.12), il
  **registro dei suoi accessi**. Per lo studio: chi ha l'accesso e cosa vede, cosa si pubblica da solo, cosa è
  pubblicato e se il cliente l'ha visto, cosa è arrivato dal portale, il registro degli accessi, l'anteprima "come lo
  vede il cliente", l'interruttore per **spegnere il portale subito**.
- **14 WhatsApp e comunicazioni**: lo **storico per cliente e per commessa** di email, messaggi WhatsApp preparati,
  telefonate annotate, messaggi del portale; i **modelli di messaggio** con i segnaposti; **Da mandare** (i messaggi che
  Wisper prepara e Manuel manda: promemoria degli appuntamenti, rapportini da firmare, promemoria di pagamento); il
  **messaggio pronto** che si apre nel WhatsApp di Manuel e **lo manda lui** (decisione 7, §3.13); le **notifiche
  interne** con le conferme (§3.16). WhatsApp Business API, ore e spese via messaggio e assistente: **Non collegato**,
  col motivo e i numeri (§3.17).
- **Dashboard** con le voci nuove (richieste dal portale, preventivi accettati e rapportini firmati nel portale,
  messaggi da mandare oggi, file caricati dai clienti), **permessi**, **registro** di tutto.
- **Tutto su telefono e computer** (decisione 2) per la parte dello studio; il portale è una pagina web sola, fatta per
  il telefono e per il computer del cliente.

## 2. Principi (dalla ricerca)

1. **Su internet va solo il portale.** Il server interno (`/exec`, `/file`, `/carica`, `/ponte`) non si raggiunge dal
   portale e non va su internet; il portale ha una porta e un indirizzo suoi e risponde a un **elenco chiuso** di strade
   (§6.1). Quello che non è nell'elenco non esiste (404 uguale per tutto).
2. **I clienti non sono utenti di Wisper.** Hanno tabelle, sessioni e codice a parte: un cliente non può chiamare
   un'azione dello studio nemmeno per errore (§3.3).
3. **Niente password da ricordare**, come Jobber e Housecall Pro: un link e un codice per email, monouso, che valgono
   10 minuti (ASVS 5.0 6.5.5, NIST 800-63B). Il link si consuma **solo col pulsante** (i filtri delle email aziendali
   aprono i link in anticipo: Microsoft Safe Links).
4. **Il cliente vede solo quello che lo studio ha pubblicato** (Pleya: "documenti che scegli"; ServiceTitan: file "per
   il cliente"), della sua azienda e delle sue sedi, con un **elenco chiuso di campi** per ogni cosa: mai costi,
   margini, note interne, nomi dei collaboratori, cronologia interna, bozze.
5. **Parole sue per il cliente** (Zendesk, Jira): Ricevuta, Presa in carico, Intervento fissato, Risolta; Da accettare,
   Accettato; Da firmare, Firmato; Pagata, Da pagare.
6. **Accettare e firmare lascia la prova** (Housecall Pro): nome, firma col dito o col mouse, casella delle condizioni,
   ora, indirizzo IP, impronta del documento visto, email di conferma al cliente. È una firma elettronica semplice
   (CAD art. 20 c. 1-bis): vale, e il giudice la valuta.
7. **Il portale non è l'unica strada.** Preventivi e rapportini continuano a partire per email col PDF; si accetta
   ancora per email o a voce (fase 2). Se il NAS è spento il lavoro non si ferma (§3.18).
8. **WhatsApp lo manda Manuel** (decisione 7): Wisper prepara il testo e apre WhatsApp, niente invii automatici
   (condizioni di WhatsApp); si scrive su WhatsApp solo a chi ha detto di sì (regole di WhatsApp Business).
9. **Le email del portale non rubano quelle dello studio**: il Gmail del postino ne manda 100 al giorno; il portale ha un
   tetto e lascia una riserva (§3.12).
10. **Promemoria di pagamento con garbo e solo a chi paga** (Garante, recupero crediti): mai ad altri referenti, mai in
    gruppi, mai minacce; dopo il secondo promemoria Wisper non propone altro.
11. **Quello che non è collegato si vede che non c'è** (specifiche §7): pillola **Non collegato**, mai un pulsante che
    finge di funzionare.
12. **Si paga solo quello che si dice prima**: Tailscale gratis è solo per uso non commerciale; i costi veri e
    l'alternativa sono in §3.2.

## 3. Le scelte di questa fase, col perché

### 3.1 Come si espone il portale senza esporre il resto

```
 internet ──► ingresso del portale ──► wisper:8401  (solo le strade di §6.1)
              (contenitore suo, Funnel                │ stesso processo, stesso database,
               solo qui, indirizzo suo)               │ codice del portale separato
 studio e telefoni ──► tailnet / casa ──► wisper:8400 (/exec, /file, /carica, /ponte: come oggi)
```

- **Due ascolti nello stesso server.** `avvio.js` apre la porta di oggi (8400, interna) e la **porta del portale**
  (`--porta-portale 8401`: è la porta che la fase 5 aveva riservato ai link per i clienti, `--porta-condivisione`
  resta come altro nome). Sulla 8401 risponde **solo** il router del portale (§6.1); sulla 8400 il router del portale non
  c'è. Le due porte non si scambiano richieste.
- **Codice separato.** Il portale sta in `server/src/portale/` (ascolto, sessioni, viste, dati) e nelle pagine statiche
  `server/portale/`. **Non importa** il dispatcher delle azioni (`richieste.js`, `azioni/`) né `permessi.js`: chiama
  per nome un elenco corto di funzioni condivise (i conti di `conti.js`, il cuore di `accettaPreventivo`, della firma
  del rapportino, di `salvaTicket`, del caricamento dei file, il postino). Una prova (`prove/portale-confini.test.js`)
  legge gli `require` dei file del portale e fallisce se ne compare uno fuori dall'elenco.
- **La 8401 non si pubblica sul NAS.** Nel `docker-compose.yml` la porta del portale **non** va in `ports:` (solo
  `expose`): la raggiunge soltanto il contenitore d'ingresso, dentro la rete del progetto. Così le intestazioni con l'IP
  che mette l'ingresso (§6.5) sono credibili, e nessuno in casa entra nel portale saltando l'ingresso.
- **Un ingresso solo per il portale.** Un contenitore suo (`wisper-portale-ingresso`, profilo `portale`) con un nome
  suo: con Tailscale è un **secondo nodo** (`TS_HOSTNAME=studio-gm`, cartella di stato sua) → `https://studio-gm.<tailnet>.ts.net`,
  con **Funnel solo lì**, gestore `/` → `http://wisper:8401`. Funnel vale per host e porta, non per percorso: per questo
  il portale ha un nodo suo invece di un percorso sul nodo del server. L'alternativa con Cloudflare è in §6.6.
- **Il server interno resta fuori da internet.** Oggi `server/tailscale-serve.json` ha `AllowFunnel` su tutto il server:
  **va tolto** (resta Serve, cioè solo dentro il tailnet) prima di accendere il portale. Telefoni e computer dello studio
  fuori casa entrano dal tailnet con l'app Tailscale, come previsto. Due cose dell'architettura volevano il server
  raggiungibile da Google:
  - il **controllo delle 7:00** (architettura §7) diventa al contrario: il server manda **ogni ora** `postinoBattito` al
    postino (§10.4), e `controlloMattina()` avvisa se l'ultimo battito ha più di 3 ore, invece di chiamare `/salute`.
    Così non serve aprire niente;
  - il **ponte** delle versioni vecchie (architettura §9) serve solo nelle settimane del cambio: in quei giorni il nodo
    del server apre la porta **8443** con Funnel e **due sole strade**, `/ponte` e `/salute` (file
    `tailscale-serve-cambio.json`, §6.6), e la si richiude dopo. Il server accetta `/ponte` e `/ponte/` allo stesso modo
    (Tailscale toglie il prefisso del percorso). Domanda 2.
- **Spegnere subito.** Amministrazione › Impostazioni › Portale clienti › **Spegni il portale adesso** (`spegniPortale`,
  §10.1): `PORTALE_ATTIVO = false`, tutte le sessioni chiuse, tutti i link non usati annullati; da quel momento la 8401
  risponde solo con la pagina "Il portale di Studio Tecnico GM non è attivo" (e `/condiviso/` con "Questo link non vale
  più"). Serve se succede qualcosa di strano; fermare anche il contenitore d'ingresso è un passo in più per Andrea.

### 3.2 Tailscale gratis non si può usare per lo studio: i costi e l'alternativa

**Il piano gratuito di Tailscale (Personal) è "only suitable for non-commercial use"** (pricing FAQ). Wisper è il
gestionale di uno studio: è uso commerciale, e lo è già il server interno raggiunto da fuori (decisione 1), non solo il
portale. Le strade oneste:

| | Costo | Indirizzo del portale | Chi vede il traffico | Copre anche i telefoni dello studio fuori casa? |
|---|---|---|---|---|
| **A. Tailscale Standard, un posto** (tailnet nuovo dello studio, tutti i dispositivi entrano con lo stesso account dello studio; i dispositivi non si pagano) | **8 $ al mese**, circa 90 € l'anno | `https://studio-gm.<tailnet>.ts.net` | nessuno: il TLS finisce nel NAS | sì |
| **B. Cloudflare Tunnel** (gratis) **+ un dominio nuovo solo per il portale** (es. `studiogm-clienti.it`; **non** stgm.eu, i cui DNS non si toccano) | il dominio: circa **5-12 € l'anno** | `https://portale.studiogm-clienti.it` | Cloudflare (il TLS finisce da loro: è un fornitore che tratta i dati, da mettere nell'informativa) | no: per il server interno serve un'altra strada (Cloudflare Access, gratis fino a 50 utenti ma il pannello può chiedere la carta; o Tailscale A) |
| C. Tailscale Personal | 0 € | come A | nessuno | sì, ma **non è permesso** per uno studio |

- **Consiglio A**: un solo conto per tutto Wisper, il TLS resta nel NAS, il `docker-compose.yml` è già fatto così, e
  rende in regola anche l'accesso da fuori della decisione 1. Un tailnet **nuovo, dello studio** tiene fuori Pactum
  (uso di famiglia, che resta sul piano gratuito). Domanda 1.
- Il portale è costruito **senza dipendere dall'ingresso**: la 8401 e le sue regole sono le stesse con A o con B; cambia
  solo il contenitore d'ingresso (§6.6) e `PORTALE_INGRESSO`, che dice al server quale intestazione porta l'IP.
- Funnel è ancora in **beta** e ha limiti di banda senza numeri pubblicati: le pagine del portale sono leggere e i file
  al massimo 20 MB (§3.11); per lo studio basta. Se un giorno non bastasse, B è la strada.
- **Finché Andrea non sceglie, il portale è Non collegato**: `PORTALE_INDIRIZZO` vuoto, nelle schermate la pillola
  **Non collegato**, `invitaReferente` e `pubblica` rispondono `nonCollegato` (§10.1). Tutto il resto della fase 7
  (comunicazioni, WhatsApp, modelli, notifiche) funziona senza portale.

### 3.3 I clienti non sono utenti di Wisper

L'architettura (§3) prevedeva un ruolo `cliente` tra gli utenti. **Non nasce.** Chi entra nel portale è un **referente**
(tabella `referenti` della fase 1) con l'accesso al portale acceso, e la sua sessione sta in `portale_sessioni`, non in
`sessioni`. Perché:
- un token del portale **non è** un token Bearer: anche se finisse sulla 8400, l'accesso di §12.1 non lo conosce
  (`accesso:false`); e la 8400 non è raggiungibile da internet comunque;
- i permessi del cliente non sono "moduli a livelli" ma **cosa vede di suo** (§3.5-3.6): metterli nella tabella dei
  permessi dello studio vorrebbe dire filtrare ogni azione interna per un ruolo in più, e sbagliarne una basterebbe;
- un referente esiste già (nome, ruolo, email, telefono): non si scrive due volte.

Un cliente privato (Mario Bianchi) non ha referenti: **Invita** crea il referente da lui (nome e email del cliente,
ruolo "Cliente privato").

### 3.4 Come entra il cliente: link e codice per email, niente password

| | Password | Link per email | Codice per email |
|---|---|---|---|
| Da ricordare | sì, e serve comunque il recupero per email | niente | niente |
| Se lo legge sul telefono ed entra dal computer | sì | entra sul telefono | sì: scrive il codice sul computer |
| Filtri delle email aziendali (Safe Links) | non c'entrano | consumano un link "a un clic" | non c'entrano |
| Rischi | password riusate da altri siti, tentativi a raffica | email inoltrata | tentativi sul codice |

**Scelta: un'email sola con un link e un codice**, tutti e due monouso, validi `PORTALE_LINK_MINUTI` (10):
- **Entra** (pagina d'ingresso): il cliente scrive l'email → la risposta è **sempre la stessa**, "Se {email} è tra gli
  indirizzi abilitati, ti è arrivata un'email con un link e un codice. Valgono 10 minuti." (nessuno scopre chi ha
  l'accesso), e arriva **dopo lo stesso tempo** (il server risponde subito e manda l'email dopo).
- **Il codice** (6 cifre) vale **solo nel browser che l'ha chiesto**: la richiesta lascia un cookie di pre-sessione
  (`__Host-wisper_pre`) e il codice si controlla insieme a lui (ASVS 6.6.2). Massimo `PORTALE_CODICE_TENTATIVI` (5)
  errori, poi il codice non vale più.
- **Il link** (`/portale/entra/<token>`, 32 byte casuali) apre una pagina con **Entra nel portale**: solo la POST del
  pulsante consuma il token. Così Safe Links e simili, che fanno una GET, non lo bruciano. La pagina toglie il token
  dall'indirizzo appena caricata (`history.replaceState`).
- **Link nelle email di avviso e negli inviti**: monouso, validi `PORTALE_LINK_AVVISO_ORE` (72: un'email del venerdì sera
  vale ancora il lunedì), portano dritti alla cosa (il preventivo, il rapportino). Scaduto o già usato: la pagina dice
  "Questo link non vale più" con **Mandami un link nuovo**, che manda un link di 10 minuti **alla stessa email** senza
  scrivere niente (come Housecall Pro).
- **Detto con onestà**: per NIST un'email non è un'autenticazione di livello AAL2; chi legge la casella di un referente
  entra come lui. È il compromesso che usano i programmi per installatori, ed è adatto qui perché nel portale ci sono i
  documenti del cliente stesso, non si paga niente e non si vede niente dello studio. Le cose che contano (accettare,
  firmare) lasciano la prova (§3.8) e un'email di conferma, così un abuso si scopre. Ai referenti si consiglia
  un'email personale, non `ufficio@` condivisa (se la casella è condivisa, il referente si chiama "Ufficio tecnico
  Rossi").
- **Sessione**: cookie `__Host-wisper_portale` (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, niente `Domain`); `Lax`
  e non `Strict` perché chi arriva da un'email (anche passando da Safe Links) deve trovarsi dentro; i cambi passano da
  POST con il token CSRF (§6.3). Scade dopo `PORTALE_SESSIONE_MINUTI` (30) senza uso e comunque dopo
  `PORTALE_SESSIONE_ORE` (8). Identificativo nuovo a ogni ingresso, chiusa sul server all'uscita; **Esci da tutti i
  dispositivi** nel suo accesso.
- **Limiti** (§6.4): per referente 5 richieste di link all'ora e 10 al giorno; per IP 20 all'ora; 10 codici sbagliati
  all'ora per referente fermano gli ingressi per un'ora; il portale non manda più di `PORTALE_EMAIL_MAX_GIORNO` (40)
  email al giorno in tutto.

### 3.5 Cosa vede: solo quello che è pubblicato, con un elenco chiuso di campi

- **Pubblicare** = una riga in `portale_pubblicazioni` (cliente, tipo, cosa, da quando, chi). Le righe nascono **da sole**
  quando succede qualcosa, secondo le **regole del cliente** (§8.1: preventivi quando partono, rapportini quando sono
  firmati...), oppure **a mano** (Pubblica nel portale). **Togli dal portale** la chiude subito.
- Una cosa si vede se **tutte** queste sono vere, controllate in **una funzione sola** (`vedibile()` in
  `portale/dati.js`), per ogni richiesta, anche per i file: c'è una pubblicazione aperta; è **del cliente della
  sessione** (il server lo ricontrolla sull'oggetto, non si fida della pubblicazione); è in uno stato che si può
  mostrare (§8.1); il referente ha il permesso di quel tipo (§3.6); la sede è tra le sue (§3.6). Se no la risposta è
  **404 "Non trovato"**, uguale a una cosa che non esiste.
- **Ogni risposta del portale è costruita da una vista** (`portale/viste.js`) che **copia solo i campi del suo elenco**
  (§7), mai togliendo campi da un oggetto interno. Una prova confronta le chiavi di ogni risposta con l'elenco
  (§13.2): un campo nuovo in una tabella non arriva al cliente finché qualcuno non lo aggiunge alla vista.
- **Mai al cliente**: costi, costo orario, margini, budget, tariffe interne, note interne e "note per te", chi ha
  scritto o cambiato una cosa nello studio, la cronologia interna dei ticket, priorità e responsabile, stati interni
  (BOZZA, INVIATO, FATTURATO...), riferimenti interni delle bozze di fattura (W-15), bozze di qualunque cosa, documenti
  `riservati` o legati a una persona, cose di altri clienti. I **nomi delle persone dello studio** compaiono solo dove
  stanno già nel documento consegnato al cliente (il tecnico nel rapportino firmato); nelle richieste e nei messaggi lo
  studio è "Studio Tecnico GM".

### 3.6 Più sedi, più referenti, più aziende

- **Cosa può fare un referente** (`referenti.portale_permessi`), per tipo, livello 0 niente, 1 vede, 2 vede e agisce:
  `preventivi` (2 = accetta; i contratti seguono i preventivi con 1), `rapportini` (2 = firma), `fatture` (solo 0 o 1),
  `documenti` (2 = manda file), `richieste` (2 = apre richieste e scrive messaggi). Di base all'invito: tutto a 2 tranne
  **fatture a 0** (le fatture si danno a chi le paga: Anna Rossi sì, il tecnico no); per un cliente privato fatture a 1.
- **Le sue sedi** (`referenti.portale_sedi`): `null` = tutte; una lista di sedi o impianti = vede le cose legate a
  quelle **più quelle senza sede** (un preventivo senza sede lo vedono tutti i referenti dell'azienda). Giulia Neri di
  Batokyo vede solo il magazzino di Schio; le richieste le apre solo su quelle sedi.
- **Due referenti della stessa azienda** vedono le stesse cose pubblicate (filtrate come sopra); i messaggi di una
  richiesta li vedono tutti i referenti che vedono la richiesta, ognuno col suo nome.
- **La stessa email in due aziende** (un consulente che segue due clienti dello studio): dopo l'ingresso la pagina
  **Per quale azienda?**; la sessione vale per un referente alla volta; **Cambia azienda** (nel suo accesso) non chiede
  un'altra email (l'email è già provata) e resta nel registro.
- Due referenti **della stessa azienda** non possono avere la stessa email col portale acceso (errore all'invito).

### 3.7 I documenti come pagine e come PDF

Il server non fa PDF (Node senza dipendenze: i PDF li fanno le app con `pc/ui/documenti.js`). Il portale fa così:
- ogni cosa si mostra come **pagina** del portale, dai campi della vista (§7);
- **Scarica il PDF** scarica il PDF **che è partito per email** quando c'è (la copia della fase 5, `COPIA_INVIATI`: è il
  documento vero mandato al cliente) o il PDF allegato alla pubblicazione (la copia di cortesia di una fattura, §8.2);
- altrimenti **Stampa o salva in PDF**: la pagina carica **lo stesso `documenti.js` delle app** (copiato nelle pagine
  del portale alla build, come negli asset di Android) e lo stampa da un `iframe` nascosto con
  `sandbox="allow-same-origin allow-modals"` (senza script). Il cliente sceglie "Salva come PDF". Stesso modello delle
  app, quindi stesso documento. `documenti.js` riceve solo i campi della vista.
- `documenti.js` cambia in due punti (lo fa chi costruisce il portale, con le prove dei PDF di oggi che restano
  identici): sotto la firma di un rapportino firmato nel portale "Firmato nel portale da {nome} · {gg/mm/aaaa hh:mm}";
  sul preventivo accettato nel portale "Accettato nel portale da {nome} il {gg/mm/aaaa} alle {hh:mm}" con la firma e le
  voci non scelte in grigio con "non inclusa" (come Jobber).

### 3.8 Accettare un preventivo nel portale

- Si accetta se: è pubblicato, è **INVIATO e non scaduto** (`scaduto: false`), il referente ha `preventivi` 2. Un
  preventivo scaduto si guarda e basta: "Scaduto il 06/10/2026" con **Chiedi un aggiornamento** (manda una domanda allo
  studio). Come Tradify, niente accettazioni di cose scadute.
- **Le scelte**: le voci facoltative con la casella **La voglio**; i gruppi di alternative con le scelte **Una di
  queste** più **Nessuna di queste** (la fase 2 permette un gruppo senza scelta). Partono come le ha messe lo studio
  (`scelta`). Il totale si aggiorna chiedendo al server (`/anteprima`, §7.3): i conti li fa solo lui, il portale non ha
  una sua copia di `contiPreventivo`.
- **Accetta il preventivo** apre la pagina della firma: le scelte e il totale riassunti, **Nome e cognome di chi
  accetta** (già scritto il nome del referente, si cambia), la casella **Ho letto le condizioni e accetto il preventivo
  PR/2026/012 rev. 1**, il riquadro della firma (dito o mouse), **Firma e accetta** (giallo). Firma disegnata anche sul
  computer, come il rapportino: una firma vera, la stessa sul PDF (domanda 7).
- Il server chiama **il cuore di `accettaPreventivo`** della fase 2 con `modo: "portale"` (nuovo), `nome`, `scelte`,
  `firma` (salvata come file `preventivo`) e la **prova** (`accettazione_prova`): referente e sua email, IP, browser,
  istante, **impronta SHA-256** del preventivo come l'ha visto (voci, scelte, conti, condizioni, scadenze, in JSON
  ordinato), la versione (`modificato`) che il portale aveva caricato. Se nel frattempo il preventivo è cambiato:
  `"Il preventivo è stato aggiornato: guarda la versione nuova"` e non si accetta.
- Dopo: email di **conferma al referente** ("Hai accettato il preventivo PR/2026/012 rev. 1 il 22/10/2026 alle 10:07",
  totale, link al portale), voce in Dashboard e **Da guardare** ("accettato nel portale, manca la commessa", con **Crea
  la commessa**), notifica a titolare, amministrazione e a chi l'ha scritto.
- **Non mi interessa** (testo, non pulsante pieno): motivo facoltativo → `rifiutaPreventivo` con motivo "Dal portale
  (Sig. Ferretti): …". **Ho una domanda** → messaggio allo studio (comunicazione in entrata, Da guardare).
- Revisioni: il cliente vede **solo la revisione in corso**. Quando parte una revisione nuova, la pubblicazione della
  vecchia si chiude (motivo `sostituito`) e nasce quella della nuova.

### 3.9 Firmare un rapportino a distanza: cosa vuol dire "approvare"

Il rapportino ha già la **firma del cliente sul telefono del tecnico** (fase 1). Le specifiche chiedono "approvazione
dei rapportini" nel portale. Scelta: **nel portale approvare un rapportino vuol dire firmarlo a distanza**, e serve
solo per quelli **rimasti da firmare** (salvati senza firma: oggi si accumulano, la Dashboard dice "3 rapportini da far
firmare da più di una settimana").
- Si pubblica da firmare **a mano** (rapportino in bozza › ⋯ › **Fallo firmare nel portale**) o con la regola
  `rapportiniDaFirmare` (spenta di base). Il cliente vede il rapportino come sul PDF e **Firma il rapportino** →
  pagina della firma come quella del telefono (nome di chi firma, riquadro, "Firmando confermi lavoro e ore del
  rapportino", **Conferma firma**).
- Il server usa **lo stesso cuore di `caricaFile {tipo: "firma"}`** (firma, firmatario, `firmato_il`, stato FIRMATO)
  con `firma_modo = "portale"` e la prova (`firma_prova`, come §3.8). Se il rapportino è cambiato dopo che il cliente
  l'ha aperto (`modificato` diverso): `"Il rapportino è cambiato: guardalo di nuovo prima di firmare"`.
- I rapportini **già firmati** si pubblicano per **consultarli** (regola `rapportiniFirmati`, accesa di base): nessuna
  seconda approvazione. Se il cliente non è d'accordo: **Segnala un problema** (un messaggio allo studio, voce in
  Dashboard): lo stato non cambia.
- Gli **importi** si vedono solo se lo studio l'ha scelto per quel cliente (`soggetti.portale_importi`, spento di base),
  come "Con gli importi" di Invia al cliente.
- Riportare in bozza un rapportino firmato nel portale toglie la firma come oggi; la pubblicazione torna "da firmare"
  solo se lo studio la ripubblica.
- Un'approvazione mensile delle ore da parte dell'ufficio del cliente (prima di fatturare) **non** c'è: da chiedere a
  Manuel se qualche cliente la vuole (§14).

### 3.10 Le richieste d'intervento (ticket) dal portale

- Per il cliente il ticket si chiama **richiesta d'intervento** ("ticket" è gergo). **Nuova richiesta**: impianto o sede
  (le sue), **Cosa succede** (titolo corto), **Racconta** (descrizione), le due domande della fase 5 con parole sue
  (**L'impianto è fermo?** Sì, è fermo · Va a metà · Funziona; **Per quando?** Subito · Entro domani · Quando si può),
  **Vostro riferimento** (chiuso in una riga), foto e file (§3.11), **Manda la richiesta**.
- Nasce con il cuore di `salvaTicket`: `origine = "portale"` (la fase 5 la teneva pronta e rifiutata), `richiedente` =
  nome del referente, `referente_id`, cliente della sessione, `impatto` e `urgenza` dalle risposte, priorità dalla
  matrice, nessun responsabile, stato `aperto`, `portale_visibile = 1`. Massimo `PORTALE_RICHIESTE_GIORNO` (10) al giorno
  per referente. Con **fermo** e **subito** la pagina di conferma mostra anche il telefono dello studio ("Se è urgente
  chiama anche lo 0445 000100").
- **Cosa vede il cliente** delle richieste: quelle aperte dal portale, più quelle che lo studio mostra (ticket ›
  **Mostra nel portale**, o la regola `richieste: "tutte"`). Gli stati con parole sue: `aperto` → **Ricevuta**;
  `in_carico` → **Presa in carico**, e con un intervento in calendario **Intervento fissato** con "giovedì 23 ottobre alle
  9:00"; `in_attesa` → **In attesa**; `risolto` → **Risolta**; `chiuso` → **Chiusa**; `annullato` → **Annullata**. La
  **linea del tempo** si ricava dai campi del ticket (aperto, preso, interventi, risolto, chiuso), mai da
  `ticket_eventi`; il motivo dell'attesa (interno) non si vede.
- **Messaggi**: il cliente scrive allo studio dentro la richiesta; lo studio risponde con **Rispondi nel portale**
  (`rispondiNelPortale`, §10.1), che è una cosa diversa dalla cronologia interna (come Jira: nota interna e risposta al
  cliente separate). Al cliente arriva un avviso per email. Le risposte firmano "Studio Tecnico GM".
- Su una richiesta **Risolta** il cliente ha **Non è risolto**: apre il messaggio già cominciato ("Il problema c'è
  ancora: "); lo studio decide se riaprire (`riapriTicket`). Il cliente non cambia mai lo stato da solo.

### 3.11 I file del cliente, senza antivirus

Nel NAS non c'è un antivirus collegato a Wisper. Per questo i file che arrivano dal portale si trattano come
sconosciuti:
- **Solo questi tipi** (`PORTALE_TIPI_FILE`): PDF, JPG/JPEG, PNG, HEIC (foto del telefono), DWG e DXF (disegni), DOCX e
  XLSX. **Mai**: ZIP e altri archivi, eseguibili, SVG, HTML, file di Office con le macro (DOCM, XLSM), e qualunque cosa
  non sia nell'elenco. Il server controlla **l'estensione e i primi byte** (§6.7), non il tipo che dice il browser.
  DOCX e XLSX sono archivi: il server ne legge solo l'indice e li rifiuta se contengono `vbaProject.bin` o se
  scompattati supererebbero 200 MB o 100 volte la loro grandezza.
- **Limiti**: `PORTALE_FILE_MAX_MB` (20) a file; `PORTALE_FILE_GIORNO` (20) file e 200 MB al giorno per referente; 1 GB
  al mese per cliente; sotto lo spazio minimo della fase 5 niente (`"Lo spazio per i file è finito: chiama lo studio"`).
- **Dove vanno**: in `portale_caricamenti`, stato **Da guardare**, file `tipo = 'portale'` con un id casuale (il nome
  del cliente resta solo come testo). Lo studio li trova in Portale clienti › Da guardare e decide: **Accetta e
  archivia** (diventa un documento della fase 5, nella categoria scelta, legato a cliente, commessa, impianto) o
  **Rifiuta** col motivo (il cliente vede "Non accettato" e il motivo; il file si toglie dal disco dopo 30 giorni). Le
  foto mandate con una richiesta stanno nel ticket subito, con la pillola **Dal cliente**.
- **Come si aprono nello studio**: sempre **scaricati** (`Content-Disposition: attachment`, `nosniff`, tipo
  dall'elenco), mai mostrati dentro Wisper come pagine; le immagini sì, come immagini. Il primo apri di un file non
  immagine chiede conferma: "Arriva dal portale di Rossi Impianti Srl: aprilo solo se te lo aspettavi" (**Apri** /
  **Annulla**).
- **Antivirus gratuito, da Andrea**: Synology **Antivirus Essential** (motore ClamAV, gratuito secondo fonti di terzi,
  scansioni pianificate di una cartella, 1 GB di RAM) può controllare ogni notte `.../dati/file/` dove stanno i file
  `portale`. È un'impostazione del NAS, fuori da Wisper; ClamAV in Docker vorrebbe 3-4 GB di RAM (troppo). Domanda 8.
- Le immagini **non si ricodificano** (OWASP lo consiglia; senza librerie Node non si può): è un limite detto.

### 3.12 Le email del portale e la quota del postino

- Il Gmail del postino manda **100 destinatari al giorno** (1.500 con Workspace). Il postino risponde già `rimaste`; il
  server tiene l'ultimo valore e il giorno.
- **Ordine di importanza**: 1) link e codici d'accesso; 2) conferme (preventivo accettato, rapportino firmato); 3)
  avvisi di novità; 4) inviti. Le 1 e 2 partono se `rimaste > 10`; le 3 e 4 se `rimaste > PORTALE_EMAIL_RISERVA` (20).
  Il resto della quota è dello studio (rapportini, riepiloghi, preventivi).
- Quota finita: la pagina d'ingresso dice a **tutti** (così non svela niente) "Adesso non riusciamo a mandare l'email:
  riprova domani o chiama lo studio allo 0445 000100"; gli avvisi aspettano le 8:00 del giorno dopo, in un'email sola
  per referente; Dashboard "Le email del portale sono ferme fino a domani".
- **Avvisi raggruppati**: dopo una pubblicazione il server aspetta `PORTALE_AVVISI_MINUTI` (10) e manda **un'email per
  referente** con tutte le novità; al massimo 3 avvisi al giorno per referente (poi uno solo il giorno dopo). Il referente
  li spegne in **Il mio accesso** (`avvisi_email`); link e conferme partono comunque.
- **Cosa c'è in un'email**: il minimo. Mai importi, contenuti, nomi di impianti o descrizioni: solo che c'è qualcosa e il
  numero ("Preventivo PR/2026/012 rev. 1 da guardare"). `rispondiA` = l'email dello studio (`EMAIL`), così le risposte
  arrivano a Manuel. I testi esatti sono in §9.6.

### 3.13 WhatsApp come vuole la decisione 7: messaggio pronto, lo manda Manuel

- Wisper prepara il testo dal modello (§9.2) e **apre WhatsApp con il messaggio già scritto**; **lo manda Manuel**.
  Niente invii automatici, niente programmi che premono "invia": le condizioni di WhatsApp vietano i messaggi
  automatici e di massa.
- **Telefono**: `Intent(ACTION_VIEW, "https://wa.me/<numero>?text=<testo>")`, col pacchetto scelto in
  `WHATSAPP_APP` (`business` = `com.whatsapp.w4b`, `normale` = `com.whatsapp`, `chiedi` = il sistema chiede la prima volta
  e ricorda); nel manifest i due pacchetti in `<queries>` (Android 11). Se nessuna delle due c'è: "WhatsApp non c'è su
  questo telefono" con **Copia il testo**.
- **Computer**: apre `https://wa.me/...` nel browser del sistema (WhatsApp Web, o l'app se prende il link), mai dentro
  la WebView. `whatsapp://send` non è documentato: non si usa.
- **Al ritorno nell'app** (telefono: la schermata torna in primo piano; computer: la finestra torna attiva) il foglio
  **L'hai mandato?** con **Sì, l'ho mandato** (giallo) e **Non ancora**: Wisper non può sapere se è partito. Il testo che
  resta nello storico è quello **preparato** (etichetta "Testo preparato": se Manuel lo cambia in WhatsApp, Wisper non
  lo sa).
- **Si scrive su WhatsApp solo a chi ha detto di sì** (regole di WhatsApp Business): `referenti.whatsapp_ok`. Se non è
  segnato, prima di aprire WhatsApp il foglio "Giulia Neri ha detto che si può scriverle su WhatsApp?" con **Sì, me
  l'ha detto** (giallo: lo segna con la data) e **Manda un'email** (bordo). **Non vuole più WhatsApp** (nella riga del
  referente) lo toglie.
- **Consiglio**: WhatsApp **Business** (gratis) sul numero di lavoro di Manuel, perché le condizioni dell'app normale
  sono pensate per l'uso personale. Da confermare con Manuel (§14).
- **Il numero**: `referenti.whatsapp` se scritto, se no il telefono del referente, se no quello del cliente, ridotto a
  cifre internazionali con le regole di §9.3 (casi condivisi `server/prove/casi-whatsapp.json`, rifatti in Kotlin e in
  `pc/ui/regole-comunicazioni.js`). Prima di aprire WhatsApp il foglio mostra **nome e numero** ("Sig. Ferretti · +39 333
  000 1122"): un numero sbagliato si vede prima. Un fisso (comincia con 0) ha la riga "Sembra un numero fisso: WhatsApp
  potrebbe non esserci".
- **Nel messaggio mai un link d'accesso**: un link con un token in una chat sarebbe una chiave lasciata in giro (e
  WhatsApp apre i link per l'anteprima). Il messaggio porta solo **l'indirizzo del portale** (`{portale}`) e il numero
  della cosa. Niente allegati (wa.me non li porta): il documento è nel portale o nell'email.
- Testo al massimo `WHATSAPP_TESTO_MAX` (1.000 caratteri): oltre, il modello non si salva per WhatsApp.

### 3.14 Promemoria degli appuntamenti: preparati, non automatici

**Scelta: preparati da Wisper, mandati da Manuel** (WhatsApp o email con un tocco), non email automatiche. Perché: (1) è
la decisione 7; (2) uno studio di una o due persone sposta gli appuntamenti al telefono e non sempre aggiorna il
calendario subito: un promemoria automatico sbagliato fa più danno di uno non mandato; (3) i clienti di Manuel
rispondono su WhatsApp; (4) non consuma la quota delle email. Le email automatiche le manda solo il portale (accessi,
conferme, avvisi), e solo a chi ha l'accesso.
- Un'attività `appuntamento`, `sopralluogo` o `intervento` con un cliente ha **Avvisa il cliente** (`attivita.avvisa_cliente`
  `''` | `whatsapp` | `email`, e `avvisa_referente_id`). Di base: `whatsapp` se il referente (o il cliente) ha detto sì a
  WhatsApp, se no `email` se c'è un'email, se no niente. È solo una proposta: non parte niente da solo.
- `PROMEMORIA_GIORNI_PRIMA` (1) giorni lavorativi prima, dalle 8:00, il promemoria compare in **Da mandare › Oggi** (un
  appuntamento di lunedì: il venerdì). Se l'attività si sposta o si annulla, la proposta cambia o sparisce (le proposte
  si calcolano, non si salvano: §9.5). Non mandato entro l'ora dell'appuntamento: esce da Da mandare (nessuna riga nello
  storico).
- **Intervento fissato**: dopo `pianificaTicket` o il salvataggio di un appuntamento con un cliente, l'avviso in basso
  "Intervento fissato per giovedì 23" ha **Avvisa il cliente**, che apre il messaggio con il modello
  `intervento_fissato`. Non parte niente da solo.

### 3.15 Promemoria di pagamento, con cura

- **Quando Wisper lo propone**: fattura emessa (non nota di credito) con residuo > 0, scaduta da almeno
  `SOLLECITO_DOPO_GIORNI` (7) → **Promemoria di pagamento**; se dopo `SOLLECITO_SECONDO_GIORNI` (30) dal primo mandato è
  ancora da pagare → **Secondo promemoria di pagamento**. **Dopo il secondo, niente altro**: il sollecito formale (PEC,
  interessi di mora del D.Lgs. 231/2002, 40 € di costi di recupero) è una decisione di Manuel col commercialista, fuori da
  Wisper.
- **A chi**: al referente segnato **Paga le fatture** (`referenti.pagamenti`) o, se non c'è, all'email del cliente (o
  alla PEC, per email). **Mai** ad altri referenti, mai in gruppi, mai a parenti o colleghi (Garante, recupero crediti).
  WhatsApp solo al referente dei pagamenti con il sì a WhatsApp; altrimenti email.
- **Il tono** (testi in §9.2): un promemoria, non una richiesta di soldi; "se il pagamento è già partito, non tenga
  conto di questo messaggio"; niente minacce, niente interessi, niente scadenze nuove inventate.
- **Prima di prepararlo** il foglio mostra "Ultimo movimento segnato in Banche e scadenze: 15/10/2026": l'incasso si segna
  a mano (decisione 6) e un promemoria per una fattura già pagata è la cosa più sgradevole che si possa mandare.
- **Non sollecitare questa fattura** (motivo: "pagherà a fine mese, d'accordo al telefono") toglie la proposta per
  sempre (`fatture.solleciti_no`).
- Li vede e li prepara solo chi ha `fatturazione` 2 e `costi` ≥ 1.

### 3.16 Notifiche interne e conferme

- **Notifiche** (tabella `notifiche`): frasi pronte per una persona dello studio, nate dal server (elenco e frasi in
  §9.7): una richiesta nuova dal portale, un preventivo accettato o rifiutato o una domanda, un rapportino firmato nel
  portale, un messaggio del cliente in una richiesta, un file caricato, un'attività o un ticket assegnati a te, i
  messaggi da mandare oggi (alle 8:00, a chi deve mandarli).
- **Dove si vedono**: la campanella in alto (telefono, accanto al cerchio con le iniziali) e nel menu laterale del
  computer, col numero delle nuove; la pagina Comunicazioni › Notifiche. **Sul telefono** il controllo periodico (WorkManager,
  ogni 15 minuti con la rete) mostra una notifica di Android per le nuove, se la persona lo vuole (**Avvisami sul
  telefono**, acceso di base). Niente servizi di notifica esterni (Firebase): un quarto d'ora di ritardo va bene per
  uno studio, e non servono chiavi né un progetto Google in più (fase 8 se servirà).
- **Conferme**: **Visto dal cliente il …** sulle cose pubblicate (la prima apertura nel portale), **L'hai mandato?** per
  WhatsApp, lo stato delle email (**Mandato** / **Errore** col motivo del postino) nello storico.
- Le notifiche si tolgono dopo `NOTIFICHE_CONSERVA_GIORNI` (90); lo storico e il registro restano.

### 3.17 Cosa resta Non collegato, col motivo e i numeri

| Cosa | Perché non ora | Costo se si volesse |
|---|---|---|
| **WhatsApp Business API** (invii dal server, risposte che entrano in Wisper) | decisione 7; vuole un numero sulla piattaforma Meta, la verifica dell'azienda, modelli approvati per scrivere fuori dalla finestra di 24 ore e **un webhook raggiungibile da internet** (un'altra porta aperta) | a messaggio: per l'Italia circa 0,036 $ un "utility" (promemoria), 0,08 $ un "marketing"; i messaggi di servizio gratis fino a 1.000 al mese (prezzi da fonti di terzi, listino Meta da ricontrollare). 150 promemoria al mese ≈ 5-6 $ |
| **Ore e spese via messaggio** | con WhatsApp serve l'API sopra; con Telegram si potrebbe gratis (bot ufficiale, il NAS chiede i messaggi senza aprire porte) ma è una seconda app, un bot che scrive nei dati e un testo libero da capire; l'app Android lo fa già in meno di un minuto, anche senza rete | WhatsApp come sopra; Telegram 0 € |
| **Assistente intelligente** (domande sul gestionale) | i dati dei clienti andrebbero a un fornitore americano (trasferimento fuori UE, accordo, informativa); un modello sul NAS è gratis ma troppo lento (NormaAI su CPU va in timeout) | Claude Haiku 5.5: 0,10 $ per milione di token in entrata, 0,50 $ in uscita; una domanda con 20.000 token di dati ≈ 0,002 $, 500 domande al mese ≈ 1-1,5 $ |

Nelle schermate: Comunicazioni › Da mandare, in fondo, le righe **WhatsApp Business · Non collegato**, **Ore e spese via
messaggio · Non collegato**, **Assistente operativo · Non collegato**; in Amministrazione › Impostazioni › Comunicazioni le
stesse con una frase sul perché.

### 3.18 Se il NAS è spento

- **Il portale non risponde**: senza il nodo acceso non c'è niente dall'altra parte, e il browser mostra il suo errore di
  collegamento (cosa mostri Funnel di preciso non è documentato). Non si può mettere una pagina "torniamo subito" senza un
  altro posto su internet: non la facciamo.
- **Il lavoro non si ferma**: preventivi e rapportini partono **per email col PDF** come oggi (il portale li aggiunge,
  non li sostituisce); si accetta ancora per email o a voce (`accettaPreventivo` modo `email` o `voce`); le richieste
  arrivano per telefono. Le email del portale non promettono che sia sempre acceso.
- **Si sa subito**: il server controlla **ogni ora** il suo indirizzo pubblico (`GET {PORTALE_INDIRIZZO}/portale/salute`,
  che passa davvero da internet); due controlli falliti di fila → Dashboard (titolare e amministrazione) "Il portale non
  si raggiunge da fuori dalle 14:00" e un'email a `EMAIL_AVVISI` (una al giorno). Se è spento tutto il NAS, avvisa il
  battito del postino (§3.1).
- **Dopo**: gli avvisi rimasti partono; i link di 72 ore scaduti si rinnovano con un tocco (§3.4).
- Server acceso ma database fermo: le pagine dicono "Il portale non risponde adesso. Riprova fra qualche minuto o chiama
  lo studio allo 0445 000100" (HTTP 503).

### 3.19 Privacy: informativa, consenso, conservazione

Proposte da **confermare con un consulente privacy** (§14):
- **Ruoli**: lo studio è titolare; i fornitori che toccano i dati del portale sono Tailscale (o Cloudflare con la strada
  B: vede il traffico in chiaro) e Google (il postino manda le email: email del referente e numero dei documenti).
  Tutti e due portano i dati negli Stati Uniti (Data Privacy Framework). **Per il Gmail gratuito un accordo sul
  trattamento dei dati non l'abbiamo trovato**: vale già per il postino di oggi; Workspace ce l'ha (fase 8, o domanda al
  consulente).
- **Base giuridica**: per i referenti delle aziende l'interesse legittimo dello studio a lavorare col cliente (art. 6.1.f,
  con un bilanciamento scritto dal consulente); per i clienti privati il contratto (art. 6.1.b).
- **Informativa** (art. 13, o 14 se l'email l'ha data l'azienda): al **primo ingresso** la pagina **Prima di entrare**
  con il riassunto e **Leggi l'informativa completa**, e **Ho letto, entra**: è una **presa visione**, non un consenso.
  Il testo sta in `PORTALE_INFORMATIVA` (si cambia in Amministrazione); cambiando `PORTALE_INFORMATIVA_DATA` tutti la
  rivedono al prossimo ingresso. Sempre raggiungibile dal piè di pagina. Testo iniziale in §9.8.
- **Consenso**: non serve per il portale (servizio del contratto), né per i cookie (solo tecnici: linee guida del Garante
  del 10/06/2021, nessun banner), né per le email di servizio. Il portale non usa niente di esterno: niente caratteri di
  Google, niente statistiche, niente pixel. Il "sì" a WhatsApp (§3.13) è una regola di WhatsApp, non un consenso GDPR.
- **Conservazione** (proposte): preventivi, accettazioni, firme, rapportini, documenti e corrispondenza come le carte
  dello studio, **10 anni** (art. 2220 c.c.: anche le copie delle lettere spedite); **registro degli accessi** del
  portale `PORTALE_ACCESSI_MESI` (12 mesi); sessioni e link tolti 30 giorni dopo la fine; file rifiutati 30 giorni;
  `portale_tentativi` 24 ore; notifiche 90 giorni; le comunicazioni `COMUNICAZIONI_CONSERVA_ANNI` (10). Un referente a cui
  si toglie l'accesso resta nell'anagrafica (è un contatto del cliente).
- **Diritti**: il referente vede **i suoi accessi** nel portale; per il resto scrive allo studio (l'informativa dice come).
  Valutazione d'impatto (DPIA): secondo noi non serve (pochi interessati, nessun dato particolare); da confermare.
- **Se succede qualcosa**: **Spegni il portale adesso** (§3.1), poi il registro degli accessi dice chi ha visto cosa;
  la notifica al Garante entro 72 ore (art. 33) la decide il titolare col consulente.

### 3.20 Il telefono senza rete

Come i rapportini di oggi: si legge l'ultima lettura, si scrive nella coda su disco, parte appena c'è rete.
- **Si leggono senza rete**: Da mandare (con i testi già composti), lo storico degli ultimi 30 giorni, i modelli, le
  notifiche, la parte del portale dell'ultima lettura (da guardare, clienti, pubblicati).
- **Si fanno senza rete** (nella coda, con `idLocale`): segnare un messaggio preparato o mandato, **Non mandare**, una
  telefonata o una nota, **Pubblica nel portale**, **Togli dal portale**, **Rispondi nel portale**, accettare o rifiutare
  un file. Aprire WhatsApp senza rete è possibile (il messaggio parte quando WhatsApp trova la rete).
- **Vogliono la rete**: **Invita un referente** e **Manda l'email** (partono subito dal postino), **Vedi come lo vede il
  cliente**. Senza rete il pulsante c'è e il tocco dice "Serve la rete: l'invito parte da qui appena c'è".
- Pillola grigia in basso come oggi: "2 messaggi e 1 risposta partono appena c'è rete".

## 4. Modello delle minacce

Chi può attaccare il portale, cosa cerca, come, e come lo impediamo. Ogni riga ha la sua prova in §13.2.

| # | Chi | Cosa cerca, come | Come lo impediamo |
|---|---|---|---|
| 1 | **Chiunque su internet** (programmi che girano gli indirizzi; il nome del portale è nei registri pubblici dei certificati) | provare `/exec`, `/file/…`, `/ponte`, `/carica`, pagine di amministrazione, falle note di programmi diffusi | la 8401 risponde solo all'elenco di §6.1, 404 uguale per tutto il resto (anche per i metodi); la 8400 non è dietro l'ingresso e non è su internet (§3.1); niente versione nelle risposte, niente `X-Powered-By`; Node senza dipendenze; limiti di grandezza e di tempo delle richieste (§6.4) |
| 2 | **Chi prova a indovinare** | scoprire quali email hanno l'accesso; indovinare token, codici, sessioni | stessa risposta e stesso tempo per ogni email; token di 32 byte e sessioni di 32 byte salvati solo come SHA-256; codice di 6 cifre legato al browser, 5 errori e basta, 10 errori all'ora fermano il referente; limiti per IP |
| 3 | **Chi vuole bloccare le email dello studio** | chiedere migliaia di link per finire la quota di Gmail (e fermare rapportini e riepiloghi) | limiti per email e per IP; tetto di 40 email al giorno del portale; riserva di 20 per lo studio; Dashboard quando il portale è fermo per la quota (§3.12) |
| 4 | **Un referente vero, curioso** | aprire le cose di un altro cliente cambiando un numero nell'indirizzo; vedere più del suo permesso o delle sue sedi | ogni lettura e ogni file passano da `vedibile()` (§3.5): cliente della sessione ricontrollato sull'oggetto, pubblicazione, stato, permesso, sedi; 404 uguale a "non esiste"; viste con un elenco chiuso di campi |
| 5 | **Un ex referente** (ha cambiato lavoro) o una sessione dimenticata su un PC | entrare dopo | **Togli l'accesso** chiude sessioni e link subito; sessioni di 30 minuti / 8 ore; Dashboard propone di togliere l'accesso a chi non entra da 12 mesi; l'email cambiata chiude le sessioni |
| 6 | **Chi legge o inoltra un'email** (casella condivisa, inoltro) | entrare col link | link monouso; 10 minuti (72 ore negli avvisi); vale solo per il referente di quell'email; accettare e firmare lasciano la prova e un'email di conferma; consiglio di email personali |
| 7 | **I filtri delle email aziendali** | aprono il link prima della persona e lo bruciano | la GET non consuma niente: solo la POST del pulsante **Entra nel portale** (§3.4) |
| 8 | **Un altro sito** (CSRF, clickjacking) | far accettare un preventivo a un cliente già dentro; mettere il portale in una cornice | cookie `SameSite=Lax`; token CSRF in ogni POST; `Sec-Fetch-Site`/`Origin` controllati; `frame-ancestors 'none'` e `X-Frame-Options: DENY` (§6.2-6.3) |
| 9 | **Un file cattivo** | un virus per il PC dello studio, un file che esegue codice nel browser (SVG, HTML), un archivio che esplode, il disco pieno | elenco chiuso con primi byte; niente archivi, SVG, HTML, macro; sempre scaricati, `nosniff`; limiti a file, al giorno, al mese e spazio minimo; stato **Da guardare** (§3.11) |
| 10 | **Un testo cattivo** | codice nei messaggi, nei titoli, nei nomi dei file | il portale scrive con `textContent`; `documenti.js` usa `esc()`; CSP `script-src 'self'` senza script in linea (§6.2) |
| 11 | **Un errore dello studio** | pubblicare al cliente sbagliato, un documento interno | il server rifiuta una pubblicazione se la cosa non è di quel cliente, se è una bozza, se il documento è `riservati` o di una persona; il foglio di conferma dice il nome del cliente; **Togli dal portale** subito; **Vedi come lo vede il cliente**; registro |
| 12 | **Un difetto nel codice del portale** | leggere dati che non deve | codice separato che non importa le azioni interne (prova sui confini, §3.1); viste a elenco chiuso con prova sulle chiavi; limite detto: portale e server sono lo stesso processo, un difetto grave nel processo vedrebbe tutto il database |
| 13 | **Chi ruba l'account Tailscale (o Cloudflare)** | cambiare dove punta il portale, aprire il server interno | verifica in due passi sull'account dello studio; chiave del contenitore con scadenza e tag; immagine `tailscale/tailscale` con la versione scritta (non `latest`); Andrea guarda la console una volta al mese |
| 14 | **Chi ascolta la rete** (Wi-Fi pubblico) | leggere o cambiare le pagine | solo HTTPS (Funnel è solo TLS), HSTS; con Tailscale nessuno in mezzo decifra (con Cloudflare sì, ed è scritto nell'informativa) |
| 15 | **Chi usa lo stesso PC dopo** | trovare il portale aperto, link nella cronologia | sessione breve, **Esci**, `Cache-Control: no-store`, token tolto dall'indirizzo dopo l'arrivo, `Referrer-Policy: no-referrer` |
| 16 | **Un cliente che nega** | "non ho mai accettato" | prova di §3.8: nome, firma, casella, ora, IP, browser, impronta del documento, email di conferma; nel registro |
| 17 | **WhatsApp** | messaggio a uno sconosciuto per un numero sbagliato; un link d'accesso in una chat | numero ripulito e mostrato con il nome prima di aprire; sì a WhatsApp; mai token nei messaggi (§3.13) |
| 18 | **Troppo traffico** (anche solo per errore) | rendere il portale lento o bloccato | pagine leggere, file al massimo 20 MB, limiti per IP; il portale non è l'unica strada (§3.18) |

## 5. Dati (migrazione 007)

`server/src/migrazioni/007-portale-comunicazioni.sql` + `007-portale-comunicazioni.js`, con la copia `wisper.db.prima-7`
prima (come le altre). Date `aaaa-mm-gg`; istanti col fuso nel database e `"2026-10-22T10:07:00"` nelle risposte
(§12.1). Le tabelle da cui si tolgono righe hanno `AUTOINCREMENT`. Le tabelle che si rifanno (per un CHECK) si rifanno
**con tutte le colonne di oggi**, comprese quelle delle fasi 4, 5 e 6. Token, codici e cookie stanno **solo come
impronta** (SHA-256; il codice come HMAC-SHA256 con `PORTALE_SEGRETO`, §6.3).

### 5.1 Impostazioni nuove

| Chiave | Valore iniziale | Cosa |
|---|---|---|
| `PORTALE_ATTIVO` | `false` | interruttore generale del portale (spento = la 8401 risponde solo "non attivo") |
| `PORTALE_INDIRIZZO` | `""` | indirizzo pubblico, es. `https://studio-gm.<tailnet>.ts.net`; vuoto = **Non collegato** |
| `PORTALE_INGRESSO` | `"tailscale"` | `tailscale` o `cloudflare`: da quale intestazione leggere l'IP (§6.5) |
| `PORTALE_LINK_MINUTI` | `10` | validità di link e codice chiesti dalla pagina d'ingresso |
| `PORTALE_LINK_AVVISO_ORE` | `72` | validità dei link negli avvisi e negli inviti |
| `PORTALE_CODICE_TENTATIVI` | `5` | errori ammessi su un codice |
| `PORTALE_SESSIONE_MINUTI` | `30` | la sessione scade dopo tanti minuti senza uso |
| `PORTALE_SESSIONE_ORE` | `8` | e comunque dopo tante ore |
| `PORTALE_FILE_MAX_MB` | `20` | grandezza massima di un file dal cliente |
| `PORTALE_FILE_GIORNO` | `20` | file al giorno per referente (e 200 MB) |
| `PORTALE_TIPI_FILE` | `["pdf","jpg","jpeg","png","heic","dwg","dxf","docx","xlsx"]` | tipi accettati; si può solo togliere: il server non accetta tipi fuori da questo elenco |
| `PORTALE_RICHIESTE_GIORNO` | `10` | richieste d'intervento al giorno per referente |
| `PORTALE_EMAIL_RISERVA` | `20` | email lasciate allo studio (§3.12) |
| `PORTALE_EMAIL_MAX_GIORNO` | `40` | email del portale al giorno, in tutto |
| `PORTALE_AVVISI_MINUTI` | `10` | attesa per raggruppare gli avvisi |
| `PORTALE_ACCESSI_MESI` | `12` | conservazione del registro degli accessi del portale (da confermare) |
| `PORTALE_INATTIVI_MESI` | `12` | referente che non entra da tanto → proposta di togliere l'accesso |
| `PORTALE_INFORMATIVA` | il testo di §9.8 | informativa per chi usa il portale (da confermare col consulente) |
| `PORTALE_INFORMATIVA_DATA` | `"2026-10-22"` | versione dell'informativa: se cambia, al prossimo ingresso si rivede |
| `SOLLECITO_DOPO_GIORNI` | `7` | promemoria di pagamento proposto dopo la scadenza |
| `SOLLECITO_SECONDO_GIORNI` | `30` | secondo promemoria dopo il primo |
| `PROMEMORIA_GIORNI_PRIMA` | `1` | promemoria degli appuntamenti, giorni lavorativi prima |
| `WHATSAPP_APP` | `"chiedi"` | `business`, `normale` o `chiedi` (§3.13) |
| `WHATSAPP_TESTO_MAX` | `1000` | caratteri di un messaggio WhatsApp |
| `COMUNICAZIONI_CONSERVA_ANNI` | `10` | conservazione dello storico (da confermare) |
| `NOTIFICHE_CONSERVA_GIORNI` | `90` | notifiche interne |

`CONDIVISIONE_INDIRIZZO` della fase 5 resta: se è vuoto, i link `/condiviso/` usano `PORTALE_INDIRIZZO`.
`PORTALE_SEGRETO` **non** è un'impostazione: sono 32 byte casuali creati al primo avvio in `/data/portale-segreto`
(permessi 600), mai nel database, nel foglio o nel registro. Se si perde se ne fa uno nuovo: i link aperti non valgono
più e i codici in corso nemmeno.

### 5.2 Numerazioni nuove

Nessuna. Le richieste dal portale prendono il numero dei ticket (`TK/{AAAA}/{NNNN}`).

### 5.3 Colonne nuove su tabelle che ci sono

- `soggetti`: `portale` INTEGER NOT NULL DEFAULT 0 (portale acceso per questo cliente) · `portale_regole` TEXT JSON
  (cosa si pubblica da solo, §8.1; `null` = le regole di base) · `portale_importi` INTEGER NOT NULL DEFAULT 0 (importi
  nei rapportini).
- `referenti`: `portale` INTEGER NOT NULL DEFAULT 0 · `portale_permessi` TEXT JSON (di base
  `{"preventivi":2,"rapportini":2,"fatture":0,"documenti":2,"richieste":2}`) · `portale_sedi` TEXT JSON (`null` = tutte) ·
  `portale_invitato_il`, `portale_dal` (primo ingresso), `portale_tolto_il` · `ultimo_accesso` · `avvisi_email` INTEGER
  NOT NULL DEFAULT 1 · `informativa_il` (istante) e `informativa_versione` (la data vista) · `pagamenti` INTEGER NOT NULL
  DEFAULT 0 (paga le fatture) · `whatsapp` TEXT (numero, se diverso dal telefono) · `whatsapp_ok` INTEGER NOT NULL
  DEFAULT 0 · `whatsapp_ok_il`. Indice unico parziale su (`soggetto_id`, email in minuscolo) `WHERE portale = 1`.
- `preventivi`: `accettazione_modo` accetta `portale` (CHECK rifatto se c'è) · `accettazione_prova` TEXT JSON ·
  `accettato_referente_id` INTEGER.
- `rapportini`: `firma_modo` TEXT NOT NULL DEFAULT `''` (`''` = sul telefono o col foglio firmato, come oggi; `portale`)
  · `firma_prova` TEXT JSON · `firma_referente_id` INTEGER.
- `ticket`: `origine` accetta `portale`, ma solo dal portale (`whatsapp` resta rifiutato: "WhatsApp non è collegato") ·
  `portale_visibile` INTEGER NOT NULL DEFAULT 0.
- `attivita`: `avvisa_cliente` TEXT NOT NULL DEFAULT `''` (`''`, `whatsapp`, `email`) · `avvisa_referente_id` INTEGER.
- `fatture`: `solleciti_no` TEXT NOT NULL DEFAULT `''` (il motivo per non proporre promemoria) · `copia_file_id` TEXT (la
  copia di cortesia in PDF, dal programma di Manuel).
- `documenti`: `caricamento_id` INTEGER (nato da un file del portale).
- `file`: tipo nuovo `portale` (arrivato dal portale; CHECK rifatto come nelle 002, 004, 005, 006) · colonna
  `caricamento_id` INTEGER.
- `utenti`: `notifiche_telefono` INTEGER NOT NULL DEFAULT 1.

### 5.4 Tabelle nuove

**`portale_link`**: id AUTOINCREMENT · `referente_id` NOT NULL · `tipo` (`accesso` | `avviso` | `invito` | `anteprima`) ·
`token_hash` TEXT UNIQUE (SHA-256 del token) · `codice_hash` (solo `accesso`: HMAC del codice) · `pre_hash` (SHA-256 del
cookie di pre-sessione, solo `accesso`) · `destinazione` (es. `preventivi/12`; `''` = la casa) · `creato` · `scade` ·
`usato_il` · `annullato_il` · `tentativi` INTEGER DEFAULT 0 · `ip` · `anteprima_utente_id` (solo `anteprima`).

**`portale_sessioni`**: id AUTOINCREMENT · `token_hash` UNIQUE · `csrf_hash` · `referente_id` · `soggetto_id` · `creata` ·
`ultimo_uso` · `scade_il` (assoluta) · `chiusa_il` · `motivo_chiusura` (`esci` | `scaduta` | `tolto` | `tutti` | `spento`
| `email cambiata` | `azienda`) · `ip` · `agente` (breve: "Chrome · Android") · `anteprima_utente_id` (anteprima dello
studio: sola lettura).

**`portale_accessi`**: id AUTOINCREMENT · `quando` · `referente_id` (vuoto se l'email non è conosciuta) · `soggetto_id` ·
`sessione_id` · `azione` (`link_chiesto` | `entrato` | `codice_sbagliato` | `link_scaduto` | `bloccato` | `visto` |
`scaricato` | `accettato` | `rifiutato` | `domanda` | `firmato` | `segnalato` | `caricato` | `richiesta` | `messaggio` |
`uscito` | `scaduta` | `negato` | `azienda`) · `oggetto` (`preventivo:12`, il nome del file) · `esito` (`ok` | `no`) ·
`ip` · `agente`. Non si modifica e non si cancella da nessuna azione (due trigger, come il registro); le righe più
vecchie di `PORTALE_ACCESSI_MESI` si tolgono di notte, con un'eccezione nel trigger solo per quella pulizia.

**`portale_tentativi`**: `chiave` (`email:<sha256 dell'email>` | `ip:<ip>` | `codice:<referente>`) · `quando` · `tipo`.
Si svuota delle righe oltre 24 ore. Nessuna email in chiaro di chi non ha l'accesso.

**`portale_pubblicazioni`**: id INTEGER PK AUTOINCREMENT (è **l'id con cui il portale chiama ogni cosa**, §7) ·
`soggetto_id` · `tipo` (`preventivo` | `contratto` | `rapportino` | `fattura` | `documento` | `ticket`) · `rif` TEXT (id
interno: `preventivi.id`, `contratti.id`, `rapportini.id`, `fatture.id`, `documenti.id`, `ticket.id`) · `versione_id`
(documento: la revisione valida alla pubblicazione; una revisione nuova approvata la sostituisce da sola) · `sede_id`
(copiato dall'oggetto, per il filtro delle sedi) · `da_firmare` 0/1 (rapportino) · `file_id` (il PDF da scaricare: la
copia mandata o la copia di cortesia) · `origine` (`regola` | `mano`) · `pubblicata_da` (utente; vuoto = regola) ·
`pubblicata_il` · `tolta_il` · `tolta_da` · `motivo_tolta` (`mano` | `sostituito` | `annullato` | `portale spento`) ·
`visto_il` · `visto_da` (referente) · `avvisato_il`. Indice unico parziale (`soggetto_id`, `tipo`, `rif`) `WHERE
tolta_il IS NULL`.

**`portale_caricamenti`**: id AUTOINCREMENT · `file_id` · `soggetto_id` · `referente_id` · `per` (`documento` |
`richiesta` | `messaggio`) · `ticket_id` · `titolo` · `nota` · `sede_id` · `nome_originale` · `estensione` · `byte` ·
`stato` (`da_guardare` | `accettato` | `rifiutato`) · `deciso_da` · `deciso_il` · `motivo` · `documento_id` · `creato`.

**`portale_da_guardare`**: id AUTOINCREMENT · `tipo` (`richiesta` | `accettato` | `rifiutato` | `domanda` | `firmato` |
`segnalato` | `caricamento` | `messaggio`) · `rif` (id interno della cosa) · `soggetto_id` · `referente_id` · `titolo` ·
`dettaglio` · `creato` · `visto_il` · `visto_da`. Si chiude da sola quando la cosa è fatta (§10.1) o con **Visto**.

**`comunicazioni`**: id AUTOINCREMENT · `id_locale` UNIQUE · `quando` · `canale` (`email` | `whatsapp` | `portale` |
`telefonata` | `nota`) · `direzione` (`uscita` | `entrata`) · `tipo` (la chiave del modello, oppure `rapportino`,
`riepilogo`, `preventivo`, `documento`, `avviso_parcella`, `invito_portale`, `avviso_portale`, `conferma_portale`,
`messaggio`, `domanda`, `segnalazione`, `libero`) · `modello` · `proposta` (la chiave della proposta di Da mandare,
§9.5; indice) · `cliente_id` · `referente_id` · `commessa_id` · `ticket_id` · `preventivo_id` · `rapportino_id` ·
`fattura_id` · `attivita_id` · `documento_id` · `a` (email o numero) · `oggetto` · `testo` · `allegati` JSON
(`[{nome, byte}]`) · `stato` (`preparato` | `mandato` | `non_mandato` | `errore` | `ricevuto`) · `mandato_il` · `errore`
· `motivo` (per `non_mandato`) · `pubblica` 0/1 (canale `portale`: la vede il cliente) · `letto_il` (entrata: quando lo
studio l'ha vista) · `utente_id` (chi; vuoto = il portale o il server) · `creato`, `modificato`.

**`modelli_messaggi`**: `chiave` PK · `nome` · `canale` (`whatsapp` | `email` | `tutti`) · `uso` (`appuntamento` |
`intervento` | `preventivo` | `rapportino` | `pagamento` | `portale` | `libero`: dice quali segnaposti si possono usare)
· `oggetto` (email) · `testo` · `attivo` 0/1 · `sistema` 0/1 (nato dalla migrazione: si cambia, non si toglie) ·
`ordine` · `modificato`, `modificato_da`. Righe iniziali in §9.2.

**`notifiche`**: id AUTOINCREMENT · `utente_id` · `tipo` · `titolo` · `dettaglio` · `collegamento` TEXT JSON (come la
Dashboard) · `creata` · `letta_il` · `telefono_il` (quando il telefono l'ha mostrata).

### 5.5 Cosa fa la migrazione ai dati di oggi

- Le colonne nuove vuote: **nessun cliente ha il portale**, nessun referente ha l'accesso, nessun "sì" a WhatsApp,
  nessuna attività di oggi ha l'avviso al cliente (le attività **nuove** lo prendono di base, §3.14).
- I modelli di §9.2, le impostazioni, i permessi nuovi (§11.2), il file `/data/portale-segreto`.
- Ogni documento `origine = inviato` della fase 5 (le copie dei PDF mandati) diventa anche una riga di `comunicazioni`
  (`canale = email`, `stato = mandato`, `a` e data dalla nota "mandato a {email} il {data}", cliente, commessa, ticket del
  documento): lo storico parte con quello che si sa già.
- Le tabelle `file` (tipo `portale`), `ticket` e `preventivi` (CHECK) si rifanno con tutte le righe.
- Prova (`server/prove/migrazione-007.test.js`): un database della fase 6 con rapportini, preventivi, ticket, fatture e
  documenti inviati; dopo, le azioni di prima rispondono uguali campo per campo, le comunicazioni nate dai documenti
  inviati sono una per documento, nessuna pubblicazione esiste, nessun referente ha l'accesso.

## 6. Il portale: le strade e le regole della porta 8401

### 6.1 L'elenco chiuso delle strade

Il router (`portale/ascolto.js`) ha una **mappa fissa** metodo + forma del percorso → gestore. Quello che non è qui
risponde **404** con la pagina minima "Pagina non trovata" (stesse intestazioni, nessun nome del server), per ogni metodo
(anche HEAD e OPTIONS). Niente CORS: nessuna intestazione `Access-Control-*`. I percorsi si confrontano **prima** di
leggere il corpo; `..`, `%2e`, `//`, barre rovesciate e caratteri di controllo nel percorso → 404.

| Metodo | Percorso | Cosa |
|---|---|---|
| GET | `/` | 302 a `/portale/` |
| GET | `/portale/salute` | `{"ok":true}` (niente versione, niente database: serve al controllo di §3.18) |
| GET | `/portale/` e `/portale/<pagina>` con `<pagina>` tra `entra`, `preventivi`, `rapportini`, `documenti`, `fatture`, `richieste`, `accesso`, `informativa`, `azienda`, più un `/<id>` facoltativo (cifre, o il token per `entra`) | la pagina `index.html` (sempre la stessa, senza dati) |
| GET | `/portale/static/<nome>` con `<nome>` in un elenco fisso: `portale.js`, `portale.css`, `documenti.js`, `Figtree.ttf`, `marchio.svg`, `icona.png` | i file della pagina, dalla mappa (mai un percorso costruito col nome) |
| POST | `/portale/api/entra`, `/codice`, `/link`, `/link-nuovo`, `/esci`, `/informativa`, `/azienda` | entrare e uscire (§7.1) |
| GET | `/portale/api/io`, `/casa`, `/preventivi`, `/preventivi/<id>`, `/rapportini`, `/rapportini/<id>`, `/documenti`, `/fatture`, `/fatture/<id>`, `/richieste`, `/richieste/<id>`, `/accessi` | letture (§7.2-7.9) |
| GET | `/portale/api/scarica/<chiave>`, `/portale/api/immagine/<chiave>` | file con la chiave che scade (§7.8) |
| POST | `/portale/api/preventivi/<id>/anteprima`, `/accetta`, `/rifiuta`, `/domanda` | §7.3 |
| POST | `/portale/api/rapportini/<id>/firma`, `/segnala` | §7.4 |
| POST | `/portale/api/carica` (byte), `/portale/api/documenti`, `/portale/api/richieste`, `/portale/api/richieste/<id>/messaggio`, `/portale/api/avvisi` | §7.5, 7.7, 7.9 |
| GET | `/condiviso/<token>`, `/condiviso/<token>/scarica` | il link che scade della fase 5 (fase5.md §5.8), ora vero |

`<id>` è sempre un **id di `portale_pubblicazioni`** (cifre, al massimo 10). `<chiave>` è base64url con un punto (§7.8).

### 6.2 Intestazioni su ogni risposta della 8401

```
Strict-Transport-Security: max-age=63072000
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  font-src 'self'; connect-src 'self'; form-action 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cache-Control: no-store            (tutto tranne /portale/static/: lì "public, max-age=3600")
```
- Nessun `Server`, nessun `X-Powered-By`.
- `style-src 'unsafe-inline'` serve solo a `documenti.js` (stili in linea dei PDF) nell'`iframe` della stampa; gli
  **script** restano solo `'self'`, senza script in linea né `eval`. `frame-src 'self'` per quell'`iframe` (`srcdoc`).
- HSTS senza `includeSubDomains` e senza `preload`: il dominio `ts.net` non è nostro.
- La foto dal telefono si sceglie con `<input type="file" accept="image/*" capture>`: non serve il permesso della
  fotocamera.

### 6.3 Cookie, sessione, CSRF

- **Pre-sessione** (`__Host-wisper_pre`, `Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=900`): nasce con
  `/api/entra`, lega il codice a quel browser.
- **Sessione** (`__Host-wisper_portale`, `Secure; HttpOnly; SameSite=Lax; Path=/`, senza `Max-Age`: se ne va quando si
  chiude il browser): 32 byte casuali; nel database solo lo SHA-256. Ogni richiesta valida aggiorna `ultimo_uso`; oltre
  `PORTALE_SESSIONE_MINUTI` senza uso o oltre `scade_il` → 401 `{"ok":false,"errore":"La sessione è scaduta: entra di
  nuovo","accesso":false}` e la pagina torna a **Entra** ricordando dove voleva andare.
- **CSRF**: `/api/io` restituisce `csrf` (32 byte, nel database lo SHA-256); ogni POST con la sessione porta
  `X-Wisper-Csrf`. In più ogni POST deve avere `Sec-Fetch-Site: same-origin` oppure, se manca, `Origin` uguale a
  `PORTALE_INDIRIZZO`; `Origin: null` o diverso → 403 `{"ok":false,"errore":"Richiesta rifiutata"}`. Vale anche per le
  POST senza sessione (`entra`, `codice`, `link`).
- `PORTALE_SEGRETO` firma le chiavi dei file (§7.8) e fa l'HMAC dei codici: il database rubato da solo non basta per
  provare i codici fuori linea.
- **Anteprima dello studio**: sessione con `anteprima_utente_id`; ogni POST che cambia qualcosa → 403 `{"ok":false,
  "errore":"È un'anteprima: qui non si accetta e non si firma"}`; le letture non segnano **visto** e non vanno nel
  registro del cliente (vanno nel registro dello studio).

### 6.4 Limiti

| Cosa | Limite | Risposta |
|---|---|---|
| Corpo JSON | 64 KB (300 KB per `accetta` e `firma`, che portano l'immagine della firma) | 413 `"Troppo grande"` |
| `/api/carica` | `PORTALE_FILE_MAX_MB`, letto a pezzi e fermato appena supera | 413 `"Il file è più grande di 20 MB: non si carica"` |
| Tempi | intestazioni 10 s, richiesta intera 30 s (5 minuti per `/api/carica`), al massimo 50 collegamenti aperti | il collegamento si chiude |
| Richieste di link | per referente 5 all'ora e 10 al giorno; per IP 20 all'ora | la risposta resta **la stessa** di sempre (nessuna email parte); riga `bloccato` nel registro |
| Codici | 5 errori su un codice; 10 errori all'ora per referente | 429 `"Troppi tentativi: riprova fra un'ora o chiama lo studio"` |
| Letture | 300 richieste ogni 5 minuti per sessione; 600 per IP | 429 `"Troppe richieste: aspetta un minuto"` |
| Richieste d'intervento | `PORTALE_RICHIESTE_GIORNO` per referente | `"Oggi hai già mandato 10 richieste: per altre chiama lo studio"` |
| File | `PORTALE_FILE_GIORNO` e 200 MB al giorno per referente, 1 GB al mese per cliente | `"Oggi hai già mandato 20 file: per altri scrivi allo studio"` |

### 6.5 L'IP e il registro degli accessi del cliente

- **IP**: con `PORTALE_INGRESSO = tailscale` dall'intestazione `X-Forwarded-For` (Tailscale la sostituisce, non
  l'accoda); se manca `Tailscale-Funnel-Request: ?1` la richiesta viene dal tailnet (lo studio che prova). Con
  `cloudflare` da `CF-Connecting-IP`. Ci si fida perché la 8401 la raggiunge solo l'ingresso (§3.1).
- Ogni ingresso, uscita, lettura di una cosa (`visto`, una volta per sessione e cosa), scaricamento, azione, errore di
  accesso scrive `portale_accessi` (§5.4). **Mai** token, codici, cookie, email di chi non ha l'accesso, contenuto dei
  file, immagini delle firme.
- Il cliente vede i suoi ultimi 20 accessi (§7.9) senza IP (§0.4: dietro Google l'IP non arriva); lo studio li vede per cliente e
  referente (§10.1) con l'IP intero.
- I log del contenitore non scrivono i percorsi `/portale/entra/<token>` e `/condiviso/<token>` interi (scrivono
  `/portale/entra/…`).

### 6.6 L'ingresso: Tailscale (strada A) o Cloudflare (strada B)

Nel `docker-compose.yml` (lo scrive chi costruisce il server; i valori veri li mette Andrea nel `.env`):
- servizio `wisper`: in più `expose: ["8401"]` e `--porta-portale 8401`; **niente** `8401` in `ports:`. In casa la 8400
  diventa `127.0.0.1:8400:8400` quando telefoni e computer entrano dal tailnet (come dice già il commento di oggi);
- **strada A**, servizio `wisper-portale-ingresso` (profilo `portale`): immagine `tailscale/tailscale` con la versione
  scritta (mai `latest`), `TS_AUTHKEY: ${TS_AUTHKEY_PORTALE}` (chiave con tag `tag:portale` e scadenza), `TS_HOSTNAME:
  studio-gm`, `TS_STATE_DIR` su un volume suo (`portale-ingresso-stato`), `TS_USERSPACE: "true"`, `TS_SERVE_CONFIG` che
  punta a `portale-serve.json` dentro una **cartella** montata:
  ```json
  {"TCP": {"443": {"HTTPS": true}},
   "Web": {"${TS_CERT_DOMAIN}:443": {"Handlers": {"/": {"Proxy": "http://wisper:8401"}}}},
   "AllowFunnel": {"${TS_CERT_DOMAIN}:443": true}}
  ```
- il nodo del server (`wisper-tailscale`, profilo `fuori`) **perde `AllowFunnel`** in `tailscale-serve.json` (resta Serve
  sulla 443, solo tailnet). Per le settimane del ponte, `tailscale-serve-cambio.json` aggiunge la porta 8443 con Funnel e
  due gestori, `/ponte` → `http://wisper:8400/ponte` e `/salute` → `http://wisper:8400/salute` (da provare davvero:
  Tailscale toglie il prefisso); finito il cambio si torna al file normale;
- **strada B**, servizio `wisper-portale-ingresso` con l'immagine `cloudflare/cloudflared` (versione scritta) e il tunnel
  creato da riga di comando, con le regole in `portale-cloudflared.yml`:
  ```yaml
  ingress:
    - hostname: portale.<dominio nuovo>
      path: ^/(portale|condiviso)(/|$)
      service: http://wisper:8401
    - hostname: portale.<dominio nuovo>
      path: ^/$
      service: http://wisper:8401
    - service: http_status:404
  ```
  e `PORTALE_INGRESSO = cloudflare`.
- In tutte e due: `PORTALE_INDIRIZZO` = l'indirizzo vero, scritto da Andrea in Amministrazione › Impostazioni › Portale
  clienti; salvandolo il server prova subito `/portale/salute` da fuori e mostra **Collegato** o **Non si raggiunge**.

### 6.7 I file del cliente: il controllo

`POST /portale/api/carica?nome=<nome>&per=<documento|richiesta|messaggio>` con il file nel corpo
(`application/octet-stream`), la sessione, il CSRF e `documenti` 2 (per `documento`) o `richieste` 2 (per `richiesta` e
`messaggio`). Il server scrive su disco mentre arriva (`/data/file/<id>.scrivendo`, poi rinomina), conta i byte, fa lo
SHA-256, e poi controlla:

| Estensione (l'ultima del nome: `.pdf.exe` guarda `exe`) | Primi byte richiesti | Tipo salvato |
|---|---|---|
| `pdf` | `%PDF-` | `application/pdf` |
| `jpg`, `jpeg` | `FF D8 FF` | `image/jpeg` |
| `png` | `89 50 4E 47 0D 0A 1A 0A` | `image/png` |
| `heic` | dal byte 4 `ftyp` e poi `heic`, `heix`, `mif1` o `msf1` | `image/heic` |
| `dwg` | `AC10` (es. `AC1032`) | `application/acad` |
| `dxf` | testo senza byte 0 nei primi 4 KB che contiene `SECTION` | `image/vnd.dxf` |
| `docx` | `PK 03 04`, e nell'indice `[Content_Types].xml` e `word/document.xml`, **senza** `vbaProject.bin` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xlsx` | `PK 03 04`, e nell'indice `[Content_Types].xml` e `xl/workbook.xml`, **senza** `vbaProject.bin` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

- Per DOCX e XLSX il server legge **solo l'indice centrale** dello ZIP (senza scompattare): più di 2.000 voci, somma delle
  grandezze scompattate oltre 200 MB o oltre 100 volte il file → rifiutato.
- Rifiuto: il file si toglie subito e la risposta è `{"ok": false, "errore": "Questo tipo di file non si può caricare: PDF,
  foto, DWG, DXF, Word o Excel"}` (oppure `"Il file non è quello che dice il nome: non si carica"` quando i byte non
  tornano).
- Il nome del cliente si pulisce (niente percorsi né caratteri di controllo, al massimo 120 caratteri) e resta solo
  testo; il file ha un id casuale di 28 caratteri.
- Risposta: `{"ok": true, "caricamento": {"id": 9, "nome": "Schema quadro QG2.pdf", "byte": 1258291}}`. Un caricamento non
  legato a un documento, una richiesta o un messaggio entro 2 ore va nel cestino.
- Lo stesso controllo vale per gli allegati che lo studio manda con **Rispondi nel portale** (§10.1).

## 7. Il portale: le risposte, campo per campo

JSON in UTF-8. Le risposte del portale usano i **codici HTTP** (è un pezzo nuovo, non deve parlare come lo script): 200
con `{"ok": true, ...}`; 400 dati sbagliati, 401 senza sessione (`"accesso": false`), 403 CSRF o anteprima, 404 non
trovato, 409 la cosa è cambiata (`"cambiato": true`), 413 troppo grande, 429 troppi tentativi, 503 portale spento
(`"spento": true`) o server in difficoltà; sempre con `{"ok": false, "errore": "frase da mostrare"}`. Date
`"2026-10-22"`, istanti `"2026-10-22T10:07:00"` (ora italiana), importi in euro come numeri. **Ogni oggetto ha solo i
campi scritti qui** (§3.5): chi aggiunge un campo lo aggiunge a questo file e alla vista.

### 7.1 Entrare e uscire

`POST /portale/api/entra {"email": "f.ferretti@rossi.example", "destinazione": "preventivi/12"}` → sempre (anche per
un'email sconosciuta, un referente senza accesso o tolto, un limite superato):
```json
{"ok": true, "frase": "Se f.ferretti@rossi.example è tra gli indirizzi abilitati, ti è arrivata un'email con un link e un codice. Valgono 10 minuti."}
```
più il cookie di pre-sessione. Il server risponde **prima** di cercare l'email e di parlare col postino. Errori: 400
`"Scrivi un'email intera, per esempio nome@azienda.it"`; quota finita (per tutti, §3.12) `{"ok": false, "errore":
"Adesso non riusciamo a mandare l'email: riprova domani o chiama lo studio allo 0445 000100", "quota": true}`; portale
spento 503.

`POST /portale/api/codice {"email": "f.ferretti@rossi.example", "codice": "482913"}` (con la pre-sessione) →
```json
{"ok": true, "destinazione": "preventivi/12", "informativa": false}
```
e il cookie della sessione. `informativa: true` = va mostrata **Prima di entrare** (§12.5). Con più aziende:
`{"ok": true, "scegli": [{"n": 1, "azienda": "Rossi Impianti Srl"}, {"n": 2, "azienda": "Edilnord Srl"}]}` (la sessione
nasce dopo `/azienda`). Errori: 401 `"Il codice non è giusto o non vale più: chiedi un'email nuova"` (uguale per codice
sbagliato, scaduto, usato, altro browser, email sconosciuta), 429 `"Troppi tentativi: riprova fra un'ora o chiama lo
studio"`.

`POST /portale/api/link {"token": "…"}` → come `codice` (il link non chiede la pre-sessione: si può aprire su un altro
dispositivo). Errore 401 `{"ok": false, "errore": "Questo link non vale più", "nuovo": true}`: `nuovo` è vero quando il
link era di un referente che ha ancora l'accesso (scaduto o già usato); allora la pagina mostra **Mandami un link nuovo**.

`POST /portale/api/link-nuovo {"token": "…"}` → `{"ok": true, "frase": "Ti abbiamo mandato un link nuovo a
f•••••••@rossi.example"}` (link di 10 minuti alla stessa email, stessi limiti di `entra`).

`POST /portale/api/azienda {"n": 2}` → `{"ok": true, "destinazione": ""}`: completa l'ingresso con più aziende, oppure,
da dentro, **Cambia azienda** (chiude la sessione di prima con `motivo_chiusura = azienda` e ne apre una per l'altro
referente con la stessa email; riga `azienda` nel registro).

`POST /portale/api/informativa {}` → `{"ok": true}` (scrive `informativa_il` e `informativa_versione`).
`POST /portale/api/esci {"tutti": false}` → `{"ok": true}`; con `"tutti": true` chiude tutte le sessioni di quel
referente.

### 7.2 Chi sono, la casa

`GET /portale/api/io` →
```json
{"ok": true, "csrf": "Zt3m…",
 "studio": {"nome": "Studio Tecnico GM", "telefono": "0445 000100", "email": "ufficio@studiogm.example",
            "indirizzo": "Via dell'Esempio 1, 36016 Thiene (VI)", "partitaIva": "02345678901"},
 "referente": {"nome": "Sig. Ferretti", "email": "f.ferretti@rossi.example", "avvisiEmail": true},
 "azienda": "Rossi Impianti Srl",
 "aziende": [],
 "puo": {"preventivi": 2, "rapportini": 2, "fatture": 1, "documenti": 2, "richieste": 2},
 "sedi": [{"id": 3, "nome": "Capannone di Thiene", "tipo": "sede"}, {"id": 4, "nome": "Cabina MT di Zanè", "tipo": "impianto"}],
 "informativa": {"daLeggere": false, "data": "2026-10-22"},
 "sessione": {"scadeSenzaUso": "2026-10-22T10:37:00", "scadeComunque": "2026-10-22T18:05:00", "anteprima": false},
 "tipiFile": ["pdf", "jpg", "jpeg", "png", "heic", "dwg", "dxf", "docx", "xlsx"], "fileMaxMb": 20}
```
`aziende` ha le altre aziende della stessa email (vuoto se una sola). `studio` viene dalle impostazioni (`RAGIONE_SOCIALE`,
`TELEFONO`, `EMAIL`, `INDIRIZZO`, `PARTITA_IVA`). Le sedi sono quelle del referente (tutte se `portale_sedi` è vuoto),
non archiviate.

`GET /portale/api/casa` →
```json
{"ok": true,
 "daFare": [
  {"tipo": "preventivo", "id": 12, "titolo": "Preventivo PR/2026/012 rev. 1", "dettaglio": "Da accettare · scade il 28/10/2026"},
  {"tipo": "rapportino", "id": 15, "titolo": "Rapportino del 21/10/2026", "dettaglio": "Da firmare · Capannone di Thiene"}],
 "novita": [
  {"tipo": "richiesta", "id": 21, "titolo": "Richiesta TK/2026/0014", "dettaglio": "Intervento fissato · giovedì 23 ottobre alle 9:00", "quando": "2026-10-21T16:40:00"},
  {"tipo": "documento", "id": 9, "titolo": "Schema unifilare cabina MT rev. 2", "dettaglio": "Progetti e schemi", "quando": "2026-10-20T11:02:00"}],
 "conteggi": {"preventivi": 3, "rapportini": 3, "documenti": 3, "fatture": 2, "richieste": 2}}
```
`daFare` = preventivi da accettare (se `preventivi` 2) e rapportini da firmare (se `rapportini` 2); `novita` = le
pubblicazioni degli ultimi 30 giorni non ancora viste da questo referente e i cambi delle richieste, al massimo 10.

### 7.3 Preventivi e contratti

`GET /portale/api/preventivi` →
```json
{"ok": true,
 "preventivi": [
  {"id": 12, "etichetta": "PR/2026/012 rev. 1", "oggetto": "Adeguamento impianto elettrico capannone", "data": "2026-10-15",
   "scadenza": "2026-10-28", "stato": "da_accettare", "statoVisto": "Da accettare", "totale": 4291.35, "nuovo": false},
  {"id": 7, "etichetta": "PR/2026/007", "oggetto": "Quadro di cantiere", "data": "2026-09-06", "scadenza": "2026-10-06",
   "stato": "scaduto", "statoVisto": "Scaduto", "totale": 1830.5, "nuovo": false}],
 "contratti": [
  {"id": 8, "numero": "CA/2026/002", "titolo": "Manutenzione cabina MT di Zanè", "dal": "2026-01-01", "al": "2026-12-31",
   "statoVisto": "Attivo"}]}
```
`stato`: `da_accettare` (INVIATO non scaduto), `scaduto` (INVIATO scaduto), `accettato`, `rifiutato` (parola **Non
accettato**). Contratti: **Attivo**, **Disdetto** (con "fino al …"), **Chiuso**. `nuovo` = non ancora visto da lui.

`GET /portale/api/preventivi/12` →
```json
{"ok": true, "preventivo": {
  "id": 12, "etichetta": "PR/2026/012 rev. 1", "numero": "PR/2026/012", "revisione": 1,
  "oggetto": "Adeguamento impianto elettrico capannone", "data": "2026-10-15", "scadenza": "2026-10-28",
  "stato": "da_accettare", "statoVisto": "Da accettare", "versione": "2026-10-15T10:00:00",
  "introduzione": "Come concordato al sopralluogo, ecco la proposta per l'adeguamento dell'impianto elettrico del capannone.",
  "complessita": "media", "oneriPrevisti": "Pratiche presso il distributore di energia e il Comune, a carico del cliente",
  "condizioni": "Il compenso è quello delle voci, a corpo o a ore come scritto. …",
  "studio": {"titoli": "Perito industriale, iscritto all'albo di Vicenza", "polizza": "Compagnia Esempio · polizza 123456 · massimale 1.000.000 €"},
  "sezioni": [
   {"titolo": "Cantiere", "subtotale": 1100, "voci": [
     {"id": 13, "descrizione": "Direzione lavori", "modo": "ore", "quantita": 16, "unita": "ore", "prezzo": 45,
      "scontoPercentuale": 0, "importo": 720, "facoltativa": false, "alternativa": "", "scelta": false},
     {"id": 14, "descrizione": "Dichiarazione di rispondenza", "modo": "corpo", "quantita": 1, "unita": "", "prezzo": 450,
      "scontoPercentuale": 0, "importo": 450, "facoltativa": true, "alternativa": "", "scelta": false},
     {"id": 15, "descrizione": "Collaudo con strumenti propri", "modo": "corpo", "quantita": 1, "unita": "", "prezzo": 380,
      "scontoPercentuale": 0, "importo": 380, "facoltativa": false, "alternativa": "collaudo", "scelta": true},
     {"id": 16, "descrizione": "Collaudo con laboratorio esterno", "modo": "corpo", "quantita": 1, "unita": "", "prezzo": 620,
      "scontoPercentuale": 0, "importo": 620, "facoltativa": false, "alternativa": "collaudo", "scelta": false}]}],
  "scontoPercentuale": 0, "scontoEuro": 0,
  "conti": {"sommaVoci": 3350, "scontoDaPercentuale": 0, "scontoEuro": 0, "imponibile": 3350, "eppiPercentuale": 5,
            "contributo": 167.5, "baseIva": 3517.5, "ivaPercentuale": 22, "iva": 773.85, "totale": 4291.35},
  "scadenzePagamento": [{"descrizione": "30% alla firma", "importo": 1005}, {"descrizione": "40% a fine progetto", "importo": 1340},
                        {"descrizione": "Saldo a fine lavori", "importo": 1005}],
  "accettazione": null, "puoAccettare": true,
  "pdf": {"chiave": "eyJz…Q.k3J…", "nome": "PR-2026-012 rev1 Rossi Impianti Srl.pdf"}}}
```
- Dalla fase 2 arrivano **solo** questi campi. Mai: `noteInterne`, `idUtente`, `mancano`, `senzaPrezzo`, `modificabile`,
  `revisioni`, `idCommessa`, `complessitaNota`, `creato`, gli id interni di cliente, sede e referente.
- `pdf` è la copia mandata per email (o `null`: allora la pagina fa **Stampa o salva in PDF**, §3.7). `studio` porta
  quello che la legge chiede nel preventivo (titoli, polizza: impostazioni `TITOLI`, `POLIZZA_*`).
- Accettato: `"accettazione": {"il": "2026-10-22T10:07:00", "da": "Roberto Ferretti", "modo": "portale", "firma":
  {"chiave": "…"}}` (la firma si mostra con `/immagine/`); per gli altri modi della fase 2 `modo` è `firma`, `email`,
  `documento`, `voce` e `firma` c'è solo se c'era.
- `puoAccettare` = `stato` `da_accettare`, `preventivi` 2, non anteprima.

`POST /portale/api/preventivi/12/anteprima {"scelte": {"14": true, "15": false, "16": true}}` →
`{"ok": true, "conti": {"sommaVoci": 4040, "imponibile": 4040, "contributo": 202, "baseIva": 4242, "iva": 933.24, "totale":
5175.24, "…": "…"}, "scadenzePagamento": [{"descrizione": "30% alla firma", "importo": 1212}, …]}` (con `contiPreventivo`
della fase 2; le chiavi di `scelte` sono gli id delle voci facoltative e delle alternative di quel preventivo, gli altri si
ignorano). Errore: `"Di «collaudo» se ne sceglie una sola"`.

`POST /portale/api/preventivi/12/accetta {"scelte": {...}, "nome": "Roberto Ferretti", "firma": "data:image/png;base64,…",
"letto": true, "versione": "2026-10-15T10:00:00"}` → `{"ok": true, "preventivo": {…stato accettato…}}`. La firma: PNG fino
a 250 KB, almeno 30 punti di tratto (il portale li conta; il server controlla che l'immagine non sia vuota). Errori: 400
`"Scrivi il nome e cognome di chi accetta"`, `"Manca la firma"`, `"Spunta «Ho letto le condizioni»"`, `"Di «collaudo» se
ne sceglie una sola"`; 409 `"Il preventivo è stato aggiornato: guarda la versione nuova"` (`cambiato: true`); 400
`"Il preventivo è scaduto il 28/10/2026: chiedi allo studio di rinnovarlo"`, `"È già accettato"`; 403 `"Non puoi accettare
i preventivi: chiedi allo studio"`. Ripetuta uguale (rete che cade) → ok senza rifare niente.

`POST /portale/api/preventivi/12/rifiuta {"motivo": "Abbiamo scelto un'altra soluzione"}` → `{"ok": true, "preventivo":
{…"stato": "rifiutato", "statoVisto": "Non accettato"…}}` (motivo facoltativo, al massimo 500 caratteri).
`POST /portale/api/preventivi/12/domanda {"testo": "Il collaudo esterno comprende la relazione?"}` → `{"ok": true}`
(comunicazione in entrata, Da guardare, notifica; al massimo 2.000 caratteri).

### 7.4 Rapportini

`GET /portale/api/rapportini` → `{"ok": true, "rapportini": [{"id": 15, "numero": "RAP/2026/0153", "data":
"2026-10-21", "luogo": "Capannone di Thiene", "lavoro": "Ricerca guasto sul quadro QG2, sostituito il differenziale della
linea 4", "statoVisto": "Da firmare", "daFirmare": true, "nuovo": true}]}` (i più recenti prima).

`GET /portale/api/rapportini/15` →
```json
{"ok": true, "rapportino": {
  "id": 15, "numero": "RAP/2026/0153", "data": "2026-10-21", "luogo": "Capannone di Thiene", "commessa": "26ST046 · Quadri del capannone",
  "tecnico": "Manuel Gasparotto", "lavoro": "Ricerca guasto sul quadro QG2, sostituito il differenziale della linea 4",
  "oreLavoro": 3, "oreExtra": 0, "oreViaggio": 0.5, "km": 24, "ticket": "TK/2026/0016",
  "statoVisto": "Da firmare", "daFirmare": true, "versione": "2026-10-21T17:12:00",
  "firma": null, "firmatario": "", "firmatoIl": "", "firmaModo": "",
  "importi": null, "puoFirmare": true}}
```
- `importi` c'è solo con `soggetti.portale_importi = 1`: `{"tariffa": 45, "compensoOre": 135, "km": 24, "euroKm": 0.76,
  "rimborsoKm": 18.24, "spese": 0, "totale": 153.24}` (gli stessi del PDF "Con gli importi").
- Firmato: `firma` `{"chiave": "…"}`, `firmatario`, `firmatoIl`, `firmaModo` (`""` sul telefono, `"portale"`).
- `statoVisto`: **Da firmare** (BOZZA pubblicata da firmare) o **Firmato** (FIRMATO, INVIATO, FATTURATO: al cliente non si
  dice se è fatturato).
- Mai: note per te, costo orario, utente, `idLocale`, foto degli scontrini, stato interno, approvazioni della fase 3.

`POST /portale/api/rapportini/15/firma {"nome": "Roberto Ferretti", "firma": "data:image/png;base64,…", "versione":
"2026-10-21T17:12:00"}` → `{"ok": true, "rapportino": {…"statoVisto": "Firmato"…}}`. Errori: `"Scrivi il nome di chi
firma"`, `"Manca la firma"`, 409 `"Il rapportino è cambiato: guardalo di nuovo prima di firmare"`, `"È già firmato"`, 403
`"Non puoi firmare i rapportini: chiedi allo studio"`.
`POST /portale/api/rapportini/15/segnala {"testo": "Le ore di viaggio erano un'ora"}` → `{"ok": true}`.

### 7.5 Documenti e file mandati

`GET /portale/api/documenti` →
```json
{"ok": true,
 "documenti": [
  {"id": 9, "titolo": "Schema unifilare cabina MT", "categoria": "Progetti e schemi", "data": "2026-06-18", "revisione": "rev. 2",
   "nomeFile": "Schema unifilare cabina rev2.pdf", "byte": 1830211, "luogo": "Cabina MT di Zanè", "nuovo": true,
   "file": {"chiave": "…"}}],
 "tuoi": [
  {"id": 31, "titolo": "Schema quadro QG2", "nomeFile": "Schema quadro QG2.pdf", "byte": 1258291, "inviatoIl": "2026-10-22T09:20:00",
   "statoVisto": "Ricevuto", "motivo": ""}]}
```
`tuoi` = i file mandati da **questa azienda** (anche dagli altri referenti) con **Ricevuto** (da guardare), **Accettato**,
**Non accettato** (con `motivo`). Un collegamento della fase 5 (OneDrive) non si pubblica: il server lo rifiuta
(`"Un collegamento a OneDrive non va nel portale: carica il file o condividilo da OneDrive"`).

`POST /portale/api/documenti {"caricamento": 31, "titolo": "Schema quadro QG2", "idSede": 3, "nota": "Versione aggiornata
dal nostro ufficio"}` → `{"ok": true, "tuo": {…}}` (dopo `/carica`, §6.7). Errori: `"Scrivi di cosa si tratta"`,
`"Il file non c'è più: caricalo di nuovo"`.

### 7.6 Fatture

`GET /portale/api/fatture` → `{"ok": true, "fatture": [{"id": 18, "numero": "45/2026", "tipo": "Fattura", "data":
"2026-10-10", "totale": 2069.12, "daPagare": 1765.12, "statoVisto": "Da pagare", "dettaglioStato": "entro il 09/11/2026",
"nuovo": false}]}`.

`GET /portale/api/fatture/18` →
```json
{"ok": true, "fattura": {
  "id": 18, "numero": "45/2026", "tipo": "Fattura", "data": "2026-10-10", "causale": "40% a fine progetto, commessa 26ST003",
  "righe": [{"descrizione": "40% a fine progetto: adeguamento impianto elettrico capannone", "quantita": 1, "importo": 1520},
            {"descrizione": "Pratica di connessione al distributore (spesa anticipata)", "quantita": 1, "importo": 120},
            {"descrizione": "Imposta di bollo", "quantita": 1, "importo": 2}],
  "conti": {"compenso": 1520, "contributo": 76, "iva": 351.12, "anticipazioni": 120, "bollo": 2, "totale": 2069.12,
            "ritenuta": 304, "netto": 1765.12},
  "scadenze": [{"data": "2026-11-09", "importo": 1765.12, "pagata": false}],
  "daPagare": 1765.12, "statoVisto": "Da pagare", "dettaglioStato": "entro il 09/11/2026",
  "pagamento": {"iban": "IT60X0542811101000000654321", "intestatario": "Studio Tecnico GM", "causale": "Fattura 45/2026"},
  "xml": {"chiave": "…", "nome": "IT02345678901_00045.xml.p7m"}, "copia": null}}
```
- Solo le fatture **emesse** e le **note di credito** emesse (fase 4: `emessa`, `annullata`), mai bozze, pronte, scartate,
  il riferimento W-n, gli incassi uno per uno, il conto interno.
- `statoVisto` per il cliente, con garbo: **Pagata** (verde); **Da pagare** con "entro il …" (blu); **Scadenza passata**
  con "il 10/10/2026" (ambra, mai rosso); **Pagata in parte** con "restano 765,12 €" (ambra); **Annullata** (grigio);
  **Nota di credito** (grigio). `pagamento` c'è solo se resta da pagare e la fattura ha il conto (IBAN dello studio).
- `copia` = la copia di cortesia in PDF se lo studio l'ha allegata (§8.2). La pagina dice sotto i file: "Copia di
  cortesia: la fattura valida è quella del Sistema di Interscambio".

### 7.7 Richieste d'intervento

`GET /portale/api/richieste` → `{"ok": true, "richieste": [{"id": 23, "numero": "TK/2026/0016", "titolo": "Scatta il
differenziale del quadro QG2", "luogo": "Capannone di Thiene", "apertaIl": "2026-10-22T09:12:00", "statoVisto":
"Ricevuta", "dettaglioStato": "", "nuovo": false}]}`.

`GET /portale/api/richieste/21` →
```json
{"ok": true, "richiesta": {
  "id": 21, "numero": "TK/2026/0014", "titolo": "Scatta il generale MT", "descrizione": "", "luogo": "Cabina MT di Zanè",
  "apertaIl": "2026-10-20T08:40:00", "statoVisto": "Intervento fissato", "dettaglioStato": "giovedì 23 ottobre alle 9:00",
  "risposte": {"fermo": "Sì, è fermo", "quando": "Subito"}, "rifCliente": "4471", "apertaDa": "Telefono",
  "tempo": [
   {"quando": "2026-10-20T08:40:00", "testo": "Ricevuta"},
   {"quando": "2026-10-20T09:05:00", "testo": "Presa in carico"},
   {"quando": "2026-10-21T16:40:00", "testo": "Intervento fissato per giovedì 23 ottobre alle 9:00"}],
  "messaggi": [
   {"quando": "2026-10-21T16:42:00", "da": "Studio Tecnico GM", "testo": "Veniamo giovedì alle 9 con il misuratore.", "file": []},
   {"quando": "2026-10-22T08:15:00", "da": "Sig. Ferretti", "testo": "Va bene, vi aspetta il custode al cancello nord.", "file": []}],
  "rapportini": [], "puoScrivere": true, "puoDireNonRisolto": false}}
```
- `descrizione` c'è per le richieste aperte dal portale (è il testo del cliente); per quelle aperte dallo studio è `""`.
- `apertaDa`: **Portale**, **Telefono**, **Email**, **Sopralluogo**, **Ufficio**, **Da una scadenza** (le parole della fase
  5). `risposte` solo se il ticket ha `impatto` e `urgenza` (con le parole del portale).
- `tempo` si ricava da `aperto_il`, `preso_il`, gli interventi in calendario (solo giorno e ora), `risolto_il`,
  `chiuso_il`, `annullato_il`. **Mai** `ticket_eventi`, responsabile, priorità, motivo dell'attesa, fatturazione,
  contratto, costi.
- `messaggi`: le comunicazioni `canale = portale`, `pubblica = 1`, di questo ticket. `da`: "Studio Tecnico GM" per lo
  studio, il nome del referente per i clienti. `file`: `[{"nome", "byte", "chiave"}]`.
- `rapportini`: quelli del ticket **pubblicati** (`{"id", "numero", "data", "statoVisto"}`).
- `puoDireNonRisolto` = stato Risolta e `richieste` 2.

`POST /portale/api/richieste {"idSede": 3, "titolo": "Scatta il differenziale del quadro QG2", "descrizione": "Da stamattina
alle 8 scatta ogni dieci minuti, la linea 4 è ferma.", "impatto": "fermo", "urgenza": "subito", "rifCliente": "",
"caricamenti": [32]}` → `{"ok": true, "richiesta": {…}, "telefono": "0445 000100"}` (`telefono` solo con `fermo` +
`subito`). `impatto`: `fermo` | `ridotto` | `nessuno`; `urgenza`: `subito` | `presto` | `quando_si_puo` (fase 5). Errori:
`"Scrivi in poche parole cosa succede"`, `"Scegli l'impianto o la sede"` (se il referente ha più di una sede), `"Oggi hai
già mandato 10 richieste: per altre chiama lo studio"`.

`POST /portale/api/richieste/21/messaggio {"testo": "…", "caricamenti": []}` → `{"ok": true, "richiesta": {…}}`. Testo
fino a 2.000 caratteri. Su una richiesta Chiusa o Annullata: `"La richiesta è chiusa: per un problema nuovo apri una
richiesta nuova"`.

### 7.8 Scaricare un file: la chiave che scade

Ogni file che il portale mostra (PDF, firma, foto, XML, allegati) ha una **chiave** nella risposta, mai l'id interno:
`base64url(JSON {"s": idSessione, "f": idFile, "e": scadenza in secondi}) + "." + base64url(HMAC-SHA256 con
PORTALE_SEGRETO)`, valida **10 minuti** e **solo con la stessa sessione**. `GET /portale/api/scarica/<chiave>`: firma
giusta, non scaduta, sessione uguale e viva, e **il file deve essere ancora vedibile** (§3.5: la pubblicazione non è stata
tolta nel frattempo) → i byte con `Content-Disposition: attachment; filename*=UTF-8''<nome>`, `Content-Type` dall'elenco,
`nosniff`, `no-store`; riga `scaricato` nel registro. Altrimenti 404. `GET /portale/api/immagine/<chiave>` è uguale ma solo
per PNG e JPEG e con `inline` (le firme e le foto nelle pagine); mai per altri tipi.

### 7.9 Il mio accesso

`GET /portale/api/accessi` → `{"ok": true, "accessi": [{"quando": "2026-10-22T09:58:00", "frase": "Entrato", "dispositivo":
"Chrome · Android", "da": ""}, {"quando": "2026-10-21T17:40:00", "frase": "Ha visto il preventivo PR/2026/012 rev.
1", "dispositivo": "Edge · Windows", "da": "151.18.x.x"}]}` (gli ultimi 20 di **questo referente**).
`POST /portale/api/avvisi {"email": false}` → `{"ok": true}` (spegne o accende gli avvisi per email; link e conferme
partono comunque).

### 7.10 Le pagine statiche

`index.html` (in `server/portale/`) carica solo `static/portale.css` e `static/portale.js`; niente script in linea,
niente risorse esterne, il carattere Figtree incluso. `portale.js` legge il percorso (`/portale/preventivi/12`) e chiama
l'API; scrive i testi con `textContent` (mai `innerHTML` con dati). Con JavaScript spento la pagina dice solo "Per usare
il portale serve JavaScript acceso".

## 8. Pubblicare: cosa entra nel portale e quando

### 8.1 Le regole del cliente e gli stati che si possono mostrare

`soggetti.portale_regole` (di base `{"preventivi": true, "contratti": true, "rapportiniFirmati": true, "rapportiniDaFirmare":
false, "fatture": false, "richieste": "portale"}`). Le regole valgono **solo se il cliente ha il portale acceso**; la
pubblicazione nasce nella stessa transazione del cambio, con `origine = regola`.

| Tipo | Si pubblica da solo quando | Stati che si possono mostrare | Si chiude da sola quando |
|---|---|---|---|
| Preventivo | `preventivi`: diventa INVIATO (`inviaPreventivo`, `segnaInviato`); `file_id` = il PDF mandato | INVIATO (anche scaduto), ACCETTATO, RIFIUTATO | parte una revisione nuova (`sostituito`); `riapriPreventivo` |
| Contratto | `contratti`: `attivaContratto` (col documento firmato del contratto se c'è) | attivo, disdetto, chiuso | mai (resta da consultare) |
| Rapportino | `rapportiniFirmati`: diventa FIRMATO; `rapportiniDaFirmare`: una BOZZA salvata (pubblicata `da_firmare`) | FIRMATO, INVIATO, FATTURATO; BOZZA solo `da_firmare` | ANNULLATO (`annullato`); riportato in bozza da firmato (`annullato`) |
| Fattura | `fatture`: diventa `emessa` (`confermaXml`, `segnaEmessa`); note di credito emesse dello stesso cliente | `emessa`, `annullata` | mai |
| Documento | mai da solo: **Pubblica nel portale** (o **Condividi nel portale** dalla pagina del documento) | revisione valida approvata, non archiviato, `vede` `tutti` o `costi`, **mai** `riservati`, mai con persona, mezzo, attrezzatura o incarico, mai collegamenti | archiviato; categoria passata a `riservati` |
| Richiesta (ticket) | `richieste: "portale"`: le aperte dal portale (sempre); `"tutte"`: ogni ticket nuovo del cliente | ogni stato | `annullaTicket` di un ticket non nato dal portale |

- Il server **rifiuta** di pubblicare una cosa che non è del cliente (cliente dell'oggetto, della commessa, della sede o del
  ticket diverso), una bozza (tranne il rapportino `da_firmare`), un documento riservato o di una persona.
- Un **documento senza cliente** (es. "Condizioni generali di incarico") si può pubblicare a un cliente a mano.
- Accendere una regola **non** pubblica il passato: **Pubblica anche quelli di prima** (nella pagina del cliente) propone
  le cose degli ultimi 12 mesi di quel tipo, da scegliere.
- **Spegnere il portale di un cliente** chiude tutte le sue sessioni e lascia le pubblicazioni (riaccendendolo si ritrova
  tutto); **Togli l'accesso** a un referente non tocca le pubblicazioni.

### 8.2 A mano

- **Pubblica nel portale** (menu ⋯ della cosa, telefono e computer; portale 2 e il modulo della cosa ≥ 1): foglio con
  "Lo vedrà Rossi Impianti Srl: Sig. Ferretti, Anna Rossi" (i referenti che lo vedranno, coi loro permessi e sedi),
  per un rapportino in bozza **Da firmare nel portale** già scelto, per una fattura **Allega la copia PDF** (dal programma
  di Manuel: diventa `fatture.copia_file_id` e il `file_id` della pubblicazione), e **Pubblica** (giallo). Se nessun
  referente può vederla: la riga "Nessun referente di Rossi Impianti Srl può vedere le fatture" e **Pubblica lo stesso**.
- **Togli dal portale**: subito, senza conferma, con **Annulla** nell'avviso; nel registro.
- Nella pagina di ogni cosa pubblicata la pillola **Nel portale** con "visto il 23/10 alle 10:12" o "non ancora visto".

### 8.3 Visto e avvisi

- **Visto**: la prima volta che un referente apre la pagina della cosa (non l'elenco), `visto_il` e `visto_da`; nella
  pagina dello studio "Visto da Sig. Ferretti il 23/10 alle 10:12".
- **Avvisi per email** (§3.12): partono per le pubblicazioni di preventivi, rapportini **da firmare**, fatture,
  documenti, contratti, e per le richieste quando cambiano in **Intervento fissato** o **Risolta** e quando lo studio
  risponde. Non partono per i rapportini firmati (sarebbero troppi: si vedono nel portale) né per le cose pubblicate con
  **Pubblica anche quelli di prima**. Solo ai referenti che possono vedere la cosa e hanno `avvisi_email`.

## 9. Comunicazioni

### 9.1 Lo storico: cosa scrive una riga

| Quando | canale, direzione, tipo, stato |
|---|---|
| `inviaEmail` (rapportini e riepiloghi), `inviaPreventivo`, `inviaAvviso`, `inviaDocumento` | `email`, `uscita`, `rapportino` / `riepilogo` / `preventivo` / `avviso_parcella` / `documento`, `mandato` o `errore` (col motivo del postino) |
| `mandaEmail` (Comunicazioni, §10.2) | `email`, `uscita`, il modello, `mandato` o `errore` |
| `salvaMessaggio` WhatsApp | `whatsapp`, `uscita`, il modello, `preparato`; `segnaMandato` → `mandato` |
| **Non mandare** una proposta | `whatsapp` o `email`, `non_mandato`, `motivo` |
| Telefonata o nota (**Annota una telefonata**) | `telefonata` o `nota`, `uscita` o `entrata`, `libero`; `mandato` in uscita, `ricevuto` in entrata |
| Email del portale (invito, avviso, conferma; non i link e i codici d'accesso) | `email`, `uscita`, `invito_portale` / `avviso_portale` / `conferma_portale` |
| Messaggio del cliente nel portale (richiesta, domanda su un preventivo, segnalazione su un rapportino) | `portale`, `entrata`, `messaggio` / `domanda` / `segnalazione`, `ricevuto` |
| **Rispondi nel portale** | `portale`, `uscita`, `messaggio`, `mandato`, `pubblica = 1` |

Le righe hanno i riferimenti (cliente, referente, commessa, ticket, preventivo, rapportino, fattura, attività, documento)
che servono a trovarle **per cliente** e **per commessa**. Gli accessi al portale non sono righe di comunicazione:
`storico` li mette in mezzo come righe calme ("Sig. Ferretti ha visto il preventivo PR/2026/012 rev. 1") leggendo
`portale_pubblicazioni.visto_il` (§10.2).

### 9.2 I modelli e i segnaposti

Segnaposti (tra graffe, come la fase 5), per uso:
- sempre: `{nome}` (come si chiama chi riceve: il nome del referente, se no il nome del cliente), `{cliente}`, `{studio}`,
  `{mittente}` (nome di chi manda e studio: "Manuel Gasparotto · Studio Tecnico GM"), `{telefono_studio}`, `{oggi}`,
  `{portale}` (l'indirizzo del portale: **una riga che lo contiene sparisce** se il cliente non ha il portale acceso o il
  portale non è collegato);
- `appuntamento`, `intervento`: `{giorno}` ("giovedì 23 ottobre"), `{ora}` ("9:00"), `{cosa}` (titolo dell'attività),
  `{luogo}`, `{impianto}`, `{commessa}`, `{ticket}`;
- `preventivo`: `{preventivo}` (etichetta), `{oggetto}`, `{scadenza}`, `{totale}` (solo con `costi`);
- `rapportino`: `{data}`, `{lavoro}` (prime 80 lettere della descrizione), `{rapportino}`;
- `pagamento`: `{fattura}`, `{data_fattura}`, `{importo}` (il residuo), `{scadenza}`.

Un segnaposto sconosciuto o di un altro uso si rifiuta al salvataggio (`"Segnaposto sconosciuto: {cleinte}. Si possono
usare {nome}, {cliente}..."`). Quelli senza valore restano scritti e tornano in `mancano` (le app li mostrano in giallo
scuro da completare, come la fase 5). Righe iniziali (`sistema = 1`, tutte con testo esatto):

| Chiave | Nome | Canale | Uso | Testo (email: anche l'oggetto) |
|---|---|---|---|---|
| `promemoria_appuntamento` | Promemoria appuntamento | tutti | appuntamento | "Buongiorno {nome}, le ricordo l'appuntamento di {giorno} alle {ora} presso {luogo}: {cosa}. Se non va più bene mi scriva pure. {mittente}" · oggetto "Promemoria: {giorno} alle {ora}" |
| `intervento_fissato` | Intervento fissato | tutti | intervento | "Buongiorno {nome}, l'intervento per {cosa} è fissato per {giorno} alle {ora} presso {luogo}.\nLo trova anche nel portale: {portale}\n{mittente}" · oggetto "Intervento fissato per {giorno}" |
| `preventivo_mandato` | Preventivo mandato | tutti | preventivo | "Buongiorno {nome}, le ho mandato per email il preventivo {preventivo} per {oggetto}.\nLo trova anche nel portale, dove può accettarlo: {portale}\nResto a disposizione per qualsiasi domanda. {mittente}" · oggetto "Preventivo {preventivo}" |
| `rapportino_da_firmare` | Rapportino da firmare | tutti | rapportino | "Buongiorno {nome}, il rapportino del {data} ({lavoro}) è ancora da firmare.\nPuò firmarlo nel portale: {portale}\nAltrimenti lo firmiamo alla prossima visita. {mittente}" · oggetto "Rapportino del {data} da firmare" |
| `promemoria_pagamento` | Promemoria di pagamento | tutti | pagamento | "Buongiorno {nome}, le scrivo per un promemoria: la fattura {fattura} del {data_fattura}, di {importo}, risultava da saldare entro il {scadenza}. Se il pagamento è già partito, non tenga conto di questo messaggio. Grazie. {mittente}" · oggetto "Promemoria: fattura {fattura}" |
| `secondo_promemoria_pagamento` | Secondo promemoria di pagamento | tutti | pagamento | "Buongiorno {nome}, torno a scriverle per la fattura {fattura} del {data_fattura}, di {importo}, con scadenza il {scadenza}. Mi può dire quando è previsto il pagamento? Se è già partito, mi scusi per il disturbo. Grazie. {mittente}" · oggetto "Fattura {fattura}" |
| `invito_portale` | Invito al portale | whatsapp | portale | "Buongiorno {nome}, da oggi preventivi, rapportini e documenti dello studio li trova anche nel portale: {portale}\nPer entrare basta la sua email: le arriva un link. {mittente}" |
| `libero` | Messaggio libero | tutti | libero | "Buongiorno {nome}, " · oggetto "" |

L'invito al portale **per email** non è un modello: è l'email di §9.6, che porta il link personale.

### 9.3 Il numero per WhatsApp

`numeroWhatsapp(testo)` in `server/src/comunicazioni.js`, rifatto in Kotlin e in `pc/ui/regole-comunicazioni.js` con gli
stessi casi (`server/prove/casi-whatsapp.json`):
1. tieni solo cifre e un `+` iniziale (via spazi, punti, trattini, barre, parentesi);
2. `+` davanti → togli il `+`; `00` davanti → togli `00`;
3. se comincia con `3` e ha 9 o 10 cifre (cellulare italiano) → `39` davanti;
4. se comincia con `0` e ha da 6 a 11 cifre (fisso italiano) → `39` davanti e `fisso: true`;
5. se comincia con `39` e ha 11 o 12 cifre → così;
6. altrimenti, da 8 a 15 cifre → così (un numero estero scritto col prefisso); fuori da questi casi → `valido: false`.

Casi: `"333 000 1122"` → `393330001122`; `"+39 333-000-1122"` → `393330001122`; `"0039 3330001122"` → `393330001122`;
`"0445 000100"` → `390445000100`, `fisso: true`; `"+41 79 000 11 22"` → `41790001122`; `"123"` → non valido; `""` → non valido.
Si mostra come `+39 333 000 1122` (gruppi da 3, 3, 4 dopo il prefisso per l'Italia).

Precisazioni dell'01/11/2026, scritte in `server/prove/casi-whatsapp.json` (17 casi, valgono loro): i punti 3 e 4 valgono
solo se davanti **non** c'erano `+` o `00` (un numero col prefisso è già internazionale: `+376 312 345` resta
`376312345`); col punto 5 `fisso` è vero se dopo il 39 viene uno 0; un fisso italiano si mostra con le cifre attaccate
(`+39 0445000100`), un estero come `+41790001122`.

### 9.4 Il messaggio pronto

`https://wa.me/<numero>?text=<testo>` con il testo codificato `encodeURIComponent` (UTF-8: lettere accentate e a capo
`%0A` restano). `preparaMessaggio` (§10.2) restituisce già `link`. Il telefono lo apre con `ACTION_VIEW` e il pacchetto di
`WHATSAPP_APP`; il computer col browser del sistema. Dopo, **L'hai mandato?** (§3.13). Esempio:
`https://wa.me/393330001122?text=Buongiorno%20Sig.%20Ferretti%2C%20le%20ricordo%20l%27appuntamento%20di%20gioved%C3%AC%2023%20ottobre%20alle%209%3A00...`

### 9.5 Da mandare: come nascono le proposte

`daMandare` **calcola** le proposte a ogni lettura (non si salvano); ognuna ha una chiave stabile. Quando Manuel la usa o
la scarta, la comunicazione salvata porta `proposta` = quella chiave, e la proposta non torna più.

| Chiave | Nasce quando | Gruppo | Canale proposto | A chi |
|---|---|---|---|---|
| `attivita:<id>:<giorno>` | attività con `avvisa_cliente`, non fatta né annullata, il giorno lavorativo che è `PROMEMORIA_GIORNI_PRIMA` prima, dalle 8:00 fino all'ora dell'attività | Oggi | quello dell'attività | `avvisa_referente_id`, se no il primo referente del cliente col sì a WhatsApp (o con l'email) |
| `rapportino:<id>` | rapportino in BOZZA da più di 7 giorni, con un cliente che ha un referente con telefono o email | Proposti | WhatsApp se il referente ha il sì, se no email; se il cliente ha il portale, prima **Fallo firmare nel portale** | il referente della firma dell'ultimo rapportino di quel cliente, se no il primo |
| `fattura:<id>:1` e `fattura:<id>:2` | §3.15 (`fatturazione` 2 e `costi`) | Proposti | WhatsApp solo al referente dei pagamenti col sì, se no email | §3.15 |

- **Domani** mostra, per chi vuole guardare avanti, i promemoria del giorno lavorativo dopo (si mandano anche prima: la
  chiave resta quella).
- **Preparati, non mandati**: le comunicazioni WhatsApp `preparato` degli ultimi 7 giorni (Manuel ha detto "Non ancora"):
  si riaprono e si segnano.
- Il collaboratore vede solo le proposte delle **sue** attività e dei **suoi** rapportini; mai i pagamenti.

### 9.6 Le email del portale (testi esatti)

Mittente che si legge: `RAGIONE_SOCIALE`; `rispondiA`: `EMAIL` dello studio. Il "lei" nelle email (è lo studio che
scrive); i pulsanti del portale danno del "tu" come le app.
- **Accesso** (oggetto "Entra nel portale di {studio}"): "Buongiorno {nome},\nil codice per entrare nel portale di {studio}
  è {codice}.\nOppure apra questo link: {link}\nCodice e link valgono 10 minuti e si usano una volta.\nSe non ha chiesto
  lei di entrare, ignori questa email: senza il codice nessuno entra.\n{studio} · {telefono_studio}"
- **Invito** (oggetto "{studio}: il portale per i suoi documenti"): "Buongiorno {nome},\n{studio} le ha aperto il portale
  dove trovare preventivi, rapportini e documenti di {cliente}, e mandare richieste d'intervento.\nPer entrare apra
  questo link (vale 72 ore e si usa una volta): {link}\nLe volte successive basta la sua email: le arriva un link nuovo.\n
  {studio} · {telefono_studio}"
- **Avviso** (oggetto "{studio}: novità nel portale"): "Buongiorno {nome},\nnel portale di {studio} ci sono novità per
  {cliente}:\n{elenco, una riga per cosa: "- Preventivo PR/2026/012 rev. 1 da guardare", "- Rapportino del 21/10/2026 da
  firmare", "- Documento: Schema unifilare cabina MT", "- Fattura 45/2026", "- Richiesta TK/2026/0014: intervento
  fissato", "- Richiesta TK/2026/0014: c'è una risposta dello studio"}\nEntri da qui (il link vale 72 ore e si usa una
  volta): {link}\nPer non ricevere più questi avvisi: nel portale, Il mio accesso.\n{studio} · {telefono_studio}"
- **Conferma dell'accettazione** (oggetto "Preventivo {preventivo} accettato"): "Buongiorno {nome},\nconfermiamo che il
  {gg/mm/aaaa} alle {hh:mm} {da} ha accettato nel portale il preventivo {preventivo} ({oggetto}), per un totale di
  {totale} IVA compresa.\nLo trova nel portale con la firma: {portale}\nSe non è stato lei, ci chiami subito allo
  {telefono_studio}.\n{studio}"
- **Conferma della firma** (oggetto "Rapportino del {data} firmato"): come sopra, "ha firmato nel portale il rapportino
  {rapportino} del {data}".
- Nessuna email contiene importi tranne la conferma dell'accettazione (il totale accettato è la cosa da confermare).

### 9.7 Notifiche interne

| Tipo | Frase (titolo · dettaglio) | A chi |
|---|---|---|
| `richiesta_portale` | "Richiesta dal portale: TK/2026/0016" · "Rossi Impianti Srl · Scatta il differenziale del quadro QG2 · Urgente" | chi ha `ticket` 2 (il collaboratore solo se la commessa o l'impianto sono suoi, o se è urgente) |
| `preventivo_accettato` | "PR/2026/012 rev. 1 accettato nel portale" · "Roberto Ferretti · Rossi Impianti Srl" | titolare, amministrazione, chi ha scritto il preventivo |
| `preventivo_rifiutato` / `domanda` | "PR/2026/012 rev. 1 non accettato" / "Domanda sul preventivo PR/2026/012 rev. 1" · nome e prima riga | come sopra |
| `rapportino_firmato` | "RAP/2026/0153 firmato nel portale" · "Roberto Ferretti · 21/10" | chi l'ha scritto, titolare |
| `segnalazione` | "Rossi Impianti Srl segnala un problema su RAP/2026/0142" · prima riga | chi l'ha scritto, titolare |
| `messaggio_portale` | "Messaggio di Sig. Ferretti su TK/2026/0014" · prima riga | responsabile del ticket, se no chi ha `ticket` 2 |
| `file_portale` | "File dal portale: Schema quadro QG2.pdf" · "Rossi Impianti Srl · 1,2 MB" | titolare, amministrazione |
| `assegnato` | "Ti hanno assegnato: Sopralluogo quadri del magazzino" (o il ticket) · giorno e cliente | la persona |
| `da_mandare` | "2 messaggi da mandare oggi" · i destinatari | alle 8:00, a chi deve mandarli (le proposte sue) |
| `portale_irraggiungibile` | "Il portale non si raggiunge da fuori" · "dalle 14:00" | titolare, amministrazione |

`collegamento` come la Dashboard (§11.1). Una notifica non si manda a chi ha fatto la cosa.

### 9.8 L'informativa per chi usa il portale (testo iniziale, da confermare)

**Prima di entrare** (riassunto mostrato al primo ingresso): "Questo portale è di {studio} ({indirizzo}, P. IVA
{partita_iva}), titolare dei dati. Lo usiamo per mostrarti i documenti del lavoro che facciamo per {cliente}, per
raccogliere accettazioni, firme e richieste. Teniamo il tuo nome, la tua email, il telefono se ce l'hai dato, le firme e
un registro degli accessi (data, ora, indirizzo IP, browser) per 12 mesi. I documenti e le firme li conserviamo come le
altre carte dello studio, per 10 anni. Le email partono da Google; il collegamento passa da Tailscale: tutti e due
possono trattare dati negli Stati Uniti. Usiamo solo il cookie che serve a tenerti dentro: niente statistiche, niente
pubblicità. Puoi chiedere di vedere, correggere o cancellare i tuoi dati scrivendo a {email_studio}; puoi anche rivolgerti
al Garante per la protezione dei dati personali." Più **Leggi l'informativa completa** (il testo intero di
`PORTALE_INFORMATIVA`, scritto dal consulente) e **Ho letto, entra**. Con la strada B "Tailscale" diventa "Cloudflare,
che vede le pagine che passano".

## 10. Azioni nuove (dello studio, su `/exec`)

Tutte con `ok`, modulo e livello tra parentesi; quelle che scrivono vogliono una POST. Campi dei soldi nuovi da
aggiungere a `CAMPI_COSTI`: `importoResiduo` (nelle proposte di pagamento) e `totaleAccettato`. Le azioni del portale
rispondono `{"ok": false, "errore": "Il portale non è collegato: manca l'indirizzo", "nonCollegato": true}` finché
`PORTALE_INDIRIZZO` è vuoto, e `{"ok": false, "errore": "Il portale è spento", "spento": true}` con `PORTALE_ATTIVO` falso,
tranne le letture e `salvaPortaleCliente` (si può preparare tutto prima di accendere).

### 10.1 Portale (modulo `portale`)

- `portale {}` (1) →
  ```json
  {"ok": true,
   "stato": {"attivo": true, "indirizzo": "https://studio-gm.tail1a2b.ts.net", "collegato": "si", "controllatoIl": "2026-10-22T10:00:00",
             "ingresso": "tailscale", "emailRimaste": 71},
   "conteggi": {"daGuardare": 4, "clienti": 3, "referenti": 4, "pubblicati": 23, "accessiOggi": 3},
   "daGuardare": [
    {"id": 41, "tipo": "richiesta", "titolo": "Richiesta urgente: TK/2026/0016", "dettaglio": "Rossi Impianti Srl · Capannone di Thiene · Sig. Ferretti · alle 9:12",
     "quando": "2026-10-22T09:12:00", "collegamento": {"pagina": "ticket", "id": 16}},
    {"id": 42, "tipo": "caricamento", "titolo": "Schema quadro QG2.pdf", "dettaglio": "Rossi Impianti Srl · Sig. Ferretti · 1,2 MB",
     "quando": "2026-10-22T09:20:00", "collegamento": {"pagina": "caricamento", "id": 31}}]}
  ```
  `collegato`: `si` | `no` (non si raggiunge) | `non_collegato` (manca l'indirizzo). `daGuardare` = le righe aperte di
  `portale_da_guardare`, le più recenti prima.
- `segnaVistoPortale {id}` (2) → `{"ok": true}`. Le righe si chiudono anche da sole: `richiesta` quando il ticket è preso o
  assegnato; `accettato` quando nasce la commessa (`creaCommessaDaPreventivo`); `caricamento` quando è deciso; `messaggio`,
  `domanda`, `segnalato` quando lo studio risponde nel portale o annota una risposta; `firmato` e `rifiutato` solo con
  **Visto**.
- `portaleCliente {idCliente}` (1) →
  ```json
  {"ok": true,
   "cliente": {"id": "C002", "nome": "Rossi Impianti Srl", "portale": true, "importi": false,
               "regole": {"preventivi": true, "contratti": true, "rapportiniFirmati": true, "rapportiniDaFirmare": false, "fatture": false, "richieste": "portale"}},
   "referenti": [
    {"id": 3, "nome": "Sig. Ferretti", "ruolo": "Ufficio tecnico", "email": "f.ferretti@rossi.example", "telefono": "333 000 1122",
     "portale": true, "statoVisto": "Attivo", "permessi": {"preventivi": 2, "rapportini": 2, "fatture": 1, "documenti": 2, "richieste": 2},
     "sedi": null, "avvisiEmail": true, "ultimoAccesso": "2026-10-22T09:58:00", "invitatoIl": "2026-10-14T11:00:00",
     "pagamenti": false, "whatsappOk": true},
    {"id": 4, "nome": "Anna Rossi", "ruolo": "Amministrazione", "email": "amministrazione@rossi.example", "portale": true,
     "statoVisto": "Invitato", "permessi": {"preventivi": 1, "rapportini": 1, "fatture": 1, "documenti": 1, "richieste": 0},
     "sedi": null, "ultimoAccesso": "", "pagamenti": true, "whatsappOk": false, "…": "…"}],
   "pubblicati": [{"id": 12, "tipo": "preventivo", "rif": "5", "titolo": "Preventivo PR/2026/012 rev. 1", "pubblicataIl": "2026-10-15T10:00:00",
                   "origine": "regola", "vistoIl": "2026-10-21T17:40:00", "vistoDa": "Sig. Ferretti", "daFirmare": false}],
   "caricamenti": [{"id": 31, "titolo": "Schema quadro QG2", "nome": "Schema quadro QG2.pdf", "byte": 1258291,
                    "referente": "Sig. Ferretti", "creato": "2026-10-22T09:20:00", "stato": "da_guardare"}],
   "accessi": [{"quando": "2026-10-22T09:58:00", "referente": "Sig. Ferretti", "frase": "Entrato", "dispositivo": "Chrome · Android", "ip": ""}]}
  ```
  `statoVisto` del referente: **Attivo** (è entrato almeno una volta), **Invitato** (non ancora), **Senza accesso**,
  **Tolto**. Ogni riga di `pubblicati` porta `rif`, l'id della cosa pubblicata (testo: `"5"` per il preventivo 5,
  `"RAP/2026/0004"` per un rapportino), che con `tipo` dice cosa aprire. Le righe di `caricamenti` sono **le stesse** di
  `caricamentiPortale` (con `idCliente`, `cliente`, `ticket`, `nota`, `per`, `idSede`, `motivo`, `file {id, url}`,
  `idDocumento`; §15).
- `salvaPortaleCliente {idCliente, portale?, regole?, importi?}` (2) → come `portaleCliente`. `portale: false` chiude le
  sessioni dei suoi referenti (`motivo_chiusura = spento`) e annulla i link.
- `invitaReferente {idReferente? | idCliente?, permessi?, sedi?, manda?: true}` (2): con `idCliente` e senza
  `idReferente` (cliente privato) crea il referente dal cliente (nome, email, telefono; ruolo "Cliente privato"; fatture
  1). Accende `portale` del referente e, se serve, del cliente; con `manda` (di base) manda l'email d'invito (§9.6) con un
  link `invito` di 72 ore. → `{"ok": true, "referente": {...}, "email": "mandata"}` oppure `"email": "domani"` (quota, §3.12).
  Errori: `"Il referente non ha l'email: scrivila prima"`, `"Questa email è già di un altro referente di Rossi Impianti
  Srl"`, `"Email: manca la @ o c'è uno spazio"`, i due di sopra (non collegato, spento). Rifarlo a un referente invitato
  rimanda l'invito (il link di prima si annulla).
- `salvaAccessoReferente {idReferente, permessi?, sedi?, avvisiEmail?}` (2) → il referente. Permessi solo 0-2 (fatture
  0-1); sedi solo del suo cliente (`"La sede 9 non è di Rossi Impianti Srl"`). Vale subito anche per le sessioni aperte.
- `togliAccessoReferente {idReferente}` (2) → `{"ok": true}`: `portale = 0`, `portale_tolto_il`, sessioni chiuse
  (`tolto`), link annullati. `salvaReferente` con l'email cambiata chiude le sessioni (`email cambiata`); `togliReferente`
  di uno con l'accesso lo toglie prima.
- `pubblica {tipo, id, daFirmare?, prima?, allegato?: {nome, mime, base64}, conferma?}` (2, e il modulo della cosa ≥ 1: preventivi,
  contratti col modulo ticket, rapportini, fatturazione per le fatture, documenti, ticket) → `{"ok": true, "pubblicazione":
  {...}, "vedranno": ["Sig. Ferretti", "Anna Rossi"]}`. `allegato` solo per le fatture (PDF, la copia di cortesia, fino a
  10 MB, controllato come §6.7). Senza nessun referente che possa vederla: `{"ok": false, "serveConferma": true, "frase":
  "Nessun referente di Rossi Impianti Srl può vedere le fatture"}`. Errori: `"Rossi Impianti Srl non ha il portale
  acceso"`, `"Il preventivo PR/2026/013 è in bozza: si pubblica quando lo mandi"`, `"Il documento è riservato: non va nel
  portale"`, `"Il documento è di Batokyo Srl, non di Rossi Impianti Srl"`, `"Un collegamento a OneDrive non va nel
  portale: carica il file o condividilo da OneDrive"`, `"È già nel portale"`. Ripetuta uguale (coda) → ok.
- `togliDalPortale {id}` (2) → `{"ok": true}`; `annulla: true` la riapre (l'avviso con Annulla).
- `pubblicaPrima {idCliente, tipo}` (2) → `{"ok": true, "proposte": [...]}` (le cose degli ultimi 12 mesi da scegliere),
  poi `pubblica` con **`prima: true`** per ognuna scelta: niente avviso per email (§8.3).
- `pubblicati {idCliente?, tipo?, visto?, pagina?}` (1) → righe come in `portaleCliente.pubblicati` (con `rif`), con
  `cliente`.
- `caricamentiPortale {stato?, idCliente?}` (1) → righe come sopra con `cliente` e `ticket`.
- `accettaCaricamento {id, titolo?, idCategoria, idCommessa?, idSede?, idTicket?}` (portale 2 e documenti 2) → `{"ok": true,
  "documento": {...}}`: nasce un documento della fase 5 (`origine = file`, `caricamento_id`, cliente del caricamento,
  revisione 0 approvata se la categoria non chiede approvazione) e il caricamento diventa `accettato`. Per le foto di una
  richiesta basta `{id, soloTicket: true}` (restano foto del ticket).
- `rifiutaCaricamento {id, motivo}` (2) → `{"ok": true}`; motivo obbligatorio (`"Scrivi il motivo: lo vede il cliente"`);
  il file si toglie dal disco dopo 30 giorni.
- `accessiPortale {idCliente?, idReferente?, gruppo?, da?, a?, pagina?}` (1) → 100 per pagina, righe `{quando, cliente,
  referente, frase, oggetto, esito, ip, dispositivo}`. **`gruppo`** è il filtro delle pillole: `tutti` (o niente),
  `entrati` (entrato, uscito, ha cambiato azienda), `azioni` (visto, scaricato, accettato, rifiutato, domanda, firmato,
  segnalato, caricato, richiesta, messaggio), `errori` (codice sbagliato, link scaduto, bloccato, negato, sessione
  scaduta). Si chiama `gruppo` perché `azione` è già il nome dell'azione su `/exec`.
- `anteprimaPortale {idReferente}` (1) → `{"ok": true, "link": "https://…/portale/entra/…"}`: link `anteprima` di 5
  minuti, monouso, che apre una sessione **di sola lettura** di 30 minuti come quel referente (§6.3), con la fascia
  "Anteprima dello studio: niente di quello che fai arriva al cliente". Il link intero torna solo qui. Nel registro dello
  studio "anteprima del portale come {referente}".
- `rispondiNelPortale {idTicket, testo, allegati?: [{nome, mime, base64}]}` (ticket 2; il collaboratore sui ticket che può
  scrivere) → `{"ok": true, "messaggio": {...}}`: comunicazione `portale`, `uscita`, `pubblica = 1`; avviso per email ai
  referenti che vedono la richiesta; chiude le righe `messaggio` di quel ticket in Da guardare. Il ticket deve essere
  visibile nel portale (`"La richiesta non è nel portale: mostrala prima"`). Allegati controllati come §6.7.
- `mostraNelPortale {idTicket, visibile}` (ticket 2) → il ticket: `portale_visibile` e la pubblicazione.
- `controllaPortale {}` (1) → `{"ok": true, "collegato": "si", "ms": 412}` (il controllo di §3.18 adesso).
- `spegniPortale {conferma?}` (amministrazione 2, solo titolare e amministrazione) → prima `serveConferma` "Il portale si
  spegne per tutti i clienti: chi è dentro esce subito. Si riaccende da qui."; poi `PORTALE_ATTIVO = false`, sessioni
  chiuse (`spento`), link annullati; nel registro "portale spento da {nome}". Si riaccende con `salvaImpostazioni
  {PORTALE_ATTIVO: true}`.

### 10.2 Comunicazioni (modulo `comunicazioni`)

- `comunicazioni {idCliente?, idCommessa?, idTicket?, idPreventivo?, idRapportino?, idFattura?, canale?, stato?, testo?,
  da?, a?, pagina?, conAccessi?}` (1) → 50 per pagina, le più recenti prima:
  ```json
  {"ok": true, "pagina": 1, "pagine": 1, "quante": 3,
   "comunicazioni": [
    {"id": 57, "quando": "2026-10-21T16:42:00", "canale": "portale", "direzione": "uscita", "tipo": "messaggio", "tipoNome": "Messaggio",
     "cliente": "Rossi Impianti Srl", "referente": "Sig. Ferretti", "a": "", "oggetto": "", "testo": "Veniamo giovedì alle 9 con il misuratore.",
     "stato": "mandato", "statoVisto": "Mandato", "riferimento": {"tipo": "ticket", "id": 14, "etichetta": "TK/2026/0014"}, "chi": "Manuel Gasparotto"},
    {"id": 55, "quando": "2026-10-20T08:02:00", "canale": "whatsapp", "direzione": "uscita", "tipo": "promemoria_appuntamento",
     "tipoNome": "Promemoria appuntamento", "a": "+39 340 000 4455", "stato": "mandato", "statoVisto": "Mandato", "…": "…"}],
   "accessi": [{"quando": "2026-10-21T17:40:00", "frase": "Sig. Ferretti ha visto il preventivo PR/2026/012 rev. 1"}]}
  ```
  `accessi` solo con `conAccessi: true` e un `idCliente` (le righe calme dello storico del cliente). Il collaboratore
  riceve le sue (create da lui, o legate alle sue attività, ai ticket e ai rapportini che vede), mai i pagamenti.
- `daMandare {}` (1) →
  ```json
  {"ok": true, "oggi": [
    {"proposta": "attivita:31:2026-10-23", "tipo": "promemoria_appuntamento", "titolo": "Promemoria appuntamento",
     "dettaglio": "Domani alle 9:00 · Intervento TK/2026/0014 · Cabina MT di Zanè", "canale": "whatsapp",
     "a": {"idReferente": 3, "nome": "Sig. Ferretti", "cliente": "Rossi Impianti Srl", "numero": "393330001122",
           "numeroVisto": "+39 333 000 1122", "email": "f.ferretti@rossi.example", "whatsappOk": true, "fisso": false},
     "riferimento": {"tipo": "attivita", "id": 31}, "modello": "promemoria_appuntamento",
     "testo": "Buongiorno Sig. Ferretti, le ricordo l'appuntamento di giovedì 23 ottobre alle 9:00 presso Cabina MT di Zanè: Intervento TK/2026/0014. Se non va più bene mi scriva pure. Manuel Gasparotto · Studio Tecnico GM",
     "oggetto": "Promemoria: giovedì 23 ottobre alle 9:00", "mancano": []}],
   "domani": [], "proposti": [ "… stessa forma …" ], "preparati": [ "… comunicazioni preparate non mandate …" ]}
  ```
- `preparaMessaggio {modello, canale, idReferente?, idCliente?, idAttivita?, idTicket?, idPreventivo?, idRapportino?,
  idFattura?, idCommessa?, proposta?}` (1) → `{"ok": true, "testo": "…", "oggetto": "…", "a": {…come sopra…}, "link":
  "https://wa.me/393330001122?text=…", "mancano": ["{luogo}"], "ultimoMovimento": "2026-10-15"}` (`ultimoMovimento` solo per
  i pagamenti, §3.15). Non salva niente. Errori: `"Sig. Ferretti non ha un numero di telefono"`, `"Il numero 123 non sembra
  un numero di telefono"`, `"Modello sconosciuto: …"`.
- `salvaMessaggio {messaggio: {idLocale, canale: "whatsapp" | "telefonata" | "nota", direzione?, tipo?, modello?, proposta?,
  idReferente?, idCliente?, a?, testo, stato: "preparato" | "mandato", idAttivita?, idTicket?, idPreventivo?, idRapportino?,
  idFattura?, idCommessa?, quando?}}` (2) → `{"ok": true, "comunicazione": {...}}`. Ripetuto con lo stesso `idLocale`: la
  stessa riga. Una telefonata o una nota con `direzione: "entrata"` diventa **`ricevuto`** (statoVisto "Ricevuto"),
  qualunque `stato` arrivi; `ricevuto` senza `entrata` non si accetta. Per WhatsApp vuole il referente col sì (`"Sig. Ferretti non ha detto di sì a WhatsApp"`, `serveConferma`
  con `segnaSi: true` per segnarlo nello stesso momento). Testo oltre `WHATSAPP_TESTO_MAX`: `"Il messaggio è più lungo di
  1.000 caratteri: accorcialo"`.
- `segnaMandato {id, mandato}` (2) → la comunicazione: `true` → `mandato`, `mandato_il` adesso; `false` → resta `preparato`.
- `mandaEmail {messaggio: {idLocale, modello?, proposta?, idReferente?, idCliente?, a, cc?, oggetto, testo, riferimenti…}}`
  (2, asincrona come `inviaEmail`, solo POST) → `{"ok": true, "comunicazione": {..."stato": "mandato"}}` o `errore` col
  motivo (`rete: true` se il postino non risponde). Errori: `"Le email non sono collegate..."` come `inviaEmail`.
- `nonMandare {proposta, motivo?}` (2) → `{"ok": true}` (comunicazione `non_mandato`); con `annulla: true` la proposta torna.
- `segnaWhatsapp {idReferente, ok}` (clienti 2 o comunicazioni 2) → il referente (`whatsapp_ok`, `whatsapp_ok_il`; nel
  registro "WhatsApp: ha detto di sì" / "WhatsApp: non vuole più").
- `modelliMessaggi {}` (1) → `{"ok": true, "modelli": [{"chiave", "nome", "canale", "uso", "oggetto", "testo", "attivo",
  "sistema", "ordine"}], "segnaposti": {"sempre": ["{nome}", …], "appuntamento": [...], …}}`.
- `salvaModelloMessaggio {modello: {chiave?, nome, canale, uso, oggetto?, testo, attivo?}}` (comunicazioni 2, e
  amministrazione 2 per i modelli di sistema) → il modello. Errori: `"Nome: scrivi come si chiama"`, `"Testo: scrivi il
  messaggio"`, segnaposto sconosciuto, oltre 1.000 caratteri per WhatsApp. `togliModelloMessaggio {chiave}` (solo i non di
  sistema; quelli di sistema si spengono con `attivo: false`).
- `nonSollecitare {idFattura, motivo}` (fatturazione 2 e `costi` 1) → la fattura (`solleciti_no`); `motivo: ""` lo toglie.

### 10.3 Notifiche (ognuno le sue)

- `notifiche {soloNuove?, pagina?}` → `{"ok": true, "nuove": 2, "notifiche": [{"id", "tipo", "titolo", "dettaglio",
  "collegamento", "creata", "letta": false}]}` (30 per pagina).
- `segnaLette {ids?: [1, 2], tutte?: true}` → `{"ok": true, "nuove": 0}`.
- `salvaPreferenzeNotifiche {telefono: true}` → `{"ok": true}` (`utenti.notifiche_telefono`).
- Il telefono chiede `notifiche {soloNuove: true}` nel controllo periodico e segna `telefono_il` con
  `segnaMostrate {ids}` (per non mostrare due volte la stessa).

### 10.4 Cosa cambia nelle azioni che ci sono

- `io`: `interfaccia` ha in più `portaleCollegato` (bool), `portaleAttivo`, `whatsappApp`, `notificheNuove`,
  `whatsappTestoMax`; `versioneServer` "0.10.0".
- `anagrafiche`: `clienti` con `portale` (bool); `referenti` con `portale`, `statoPortale` (le parole di §10.1, solo con
  `portale` ≥ 1), `pagamenti`, `whatsapp`, `whatsappOk`.
- `salvaReferente`: accetta `pagamenti`, `whatsapp`, `whatsappOk`; l'email cambiata di uno con l'accesso chiude le sue
  sessioni e lo dice nella risposta (`"avviso": "L'email è cambiata: per entrare nel portale userà quella nuova"`).
- `inviaEmail`, `inviaPreventivo`, `inviaAvviso`, `inviaDocumento`, i riepiloghi: scrivono la comunicazione (§9.1);
  `inviaPreventivo` e `segnaInviato` pubblicano con la regola (col PDF mandato come `file_id`).
- `accettaPreventivo`: `modo` `portale` solo dal portale (dall'`/exec`: `"«Portale» lo mette solo il portale"`); il
  preventivo ha in più `accettazione: {modo, da, il, referente?, prova?}` (`prova` solo con preventivi 2: IP, browser,
  impronta) e `portale: {pubblicato, vistoIl, vistoDa, pubblicazione}`.
- `nuovaRevisione`, `riapriPreventivo`: chiudono la pubblicazione della vecchia (`sostituito`).
- `creaCommessaDaPreventivo`: chiude la riga `accettato` di Da guardare.
- `rapportini`, il rapportino: `firmaModo`, `firmaReferente` (nome), `portale: {pubblicato, daFirmare, vistoIl,
  pubblicazione}`;
  `salvaRapportino` su una BOZZA pubblicata `da_firmare` aggiorna `modificato` (il cliente deve rileggerla, §3.9).
  `cambiaStato` ANNULLATO o BOZZA da firmato: chiude la pubblicazione (`annullato`).
- `salvaTicket`: `origine` `portale` solo dal portale (`"Da dove arriva: «Portale» lo mette solo il portale"`); `ticket`:
  `portale: {visibile, messaggiNuovi}`, `messaggi` (la conversazione pubblica, come §7.7 ma con `chi` dello studio).
  `prendiTicket`, `assegnaTicket` chiudono la riga `richiesta` di Da guardare.
- `salvaAttivita`: `avvisaCliente` (`""` | `whatsapp` | `email`), `idReferenteAvviso`; senza, per le attività nuove, la
  regola di base di §3.14. `attivita`: i due campi.
- `fatture`, `fattura`: `sollecitiNo`, `copia` (`{id, url, nome}`), `portale: {pubblicato, vistoIl, vistoDa,
  pubblicazione}`; `allegaCopiaFattura {id, nome, mime,
  base64}` (fatturazione 2): la copia di cortesia (PDF, 10 MB), che diventa anche il `file_id` della pubblicazione.
- `documenti`, `documento`: `portale: {pubblicato, vistoIl, pubblicazione}`; `condividiDocumento` (fase 5) funziona quando c'è
  `PORTALE_INDIRIZZO` (o `CONDIVISIONE_INDIRIZZO`): il link è `{indirizzo}/condiviso/<token>`.
- `/salute` della 8400 resta com'è (per chi la chiama dal tailnet).
- `dashboard`: §11.1.
- In tutti gli oggetti `portale` qui sopra, `pubblicazione` è l'id della pubblicazione aperta (numero), `null` se non è
  nel portale: è quello che vuole `togliDalPortale {id}`.
- **Postino** (`apps-script/Ponte.gs`): azione nuova `postinoBattito {versione}` (col segreto) che segna l'ora;
  `controlloMattina()` avvisa se l'ultimo battito ha più di 3 ore (al massimo un'email ogni 12 ore, come oggi) invece di
  chiamare `/salute`. Il server manda il battito ogni ora (e all'avvio). Finché lo script non è aggiornato da Andrea,
  il controllo di oggi resta (e fallirà quando il server interno non è più su internet: va aggiornato insieme).

## 11. Dashboard, permessi, registro

### 11.1 Dashboard

- `numeri.portale` (con portale 1): `{"daGuardare": 4, "richiesteNuove": 1, "accettati": 1, "firmati": 1, "caricamenti": 2,
  "messaggi": 1, "clienti": 3, "referenti": 4, "collegato": "si"}`.
- `numeri.comunicazioni` (con comunicazioni 1): `{"daMandareOggi": 2, "preparati": 1, "proposti": 2}` (il collaboratore:
  le sue).
- Voci nuove (frasi esatte; `tipo` nuovi `portale`, `messaggio`, `pagamento`; unità nuove `messaggi`, `file`):
  - **urgenti**: richieste **urgenti** dal portale non ancora prese (`"Richiesta urgente dal portale: TK/2026/0016"`,
    `"Rossi Impianti Srl · Capannone di Thiene · Sig. Ferretti · alle 9:12"`, `collegamento {pagina: "ticket", id}`); il
    portale che non si raggiunge (`"Il portale non si raggiunge da fuori dalle 14:00"`, titolare e amministrazione,
    `collegamento {pagina: "amministrazione", filtro: {sezione: "portale"}}`).
  - **questa settimana**: **messaggi da mandare oggi** (`"2 messaggi da mandare oggi"`, `"Promemoria a Sig. Ferretti,
    promemoria a Giulia Neri"`, `collegamento {pagina: "comunicazioni", filtro: {segmento: "damandare"}}`); preventivi
    **accettati nel portale** senza commessa (`"PR/2026/012 rev. 1 accettato nel portale"`, `"Roberto Ferretti · manca la
    commessa"`, `quanto` = totale con `costi`); **rapportini firmati nel portale** degli ultimi 7 giorni (`"RAP/2026/0153
    firmato nel portale"`, `"Roberto Ferretti · 21/10"`); **messaggi dei clienti** senza risposta (`"Messaggio di Sig.
    Ferretti su TK/2026/0014"`, la prima riga); **domande e segnalazioni** (`"Domanda sul preventivo PR/2026/012 rev.
    1"`); richieste dal portale non urgenti nuove (`"Richiesta dal portale: TK/2026/0017"`); le email del portale ferme per
    la quota (`"Le email del portale sono ferme fino a domani"`, `"Google ne lascia mandare ancora 12 oggi"`).
  - **da pianificare**: **file caricati dai clienti** da guardare (`"2 file dai clienti da guardare"`, `"Schema quadro
    QG2.pdf · Rossi Impianti Srl, Foto targa inverter.jpg · Mario Bianchi"`, `collegamento {pagina: "portale", filtro:
    {segmento: "daguardare"}}`); **promemoria di pagamento** proposti (fatturazione 2 e `costi`: `"Promemoria di pagamento
    da preparare: fattura 41/2026"`, `"Mario Bianchi · scaduta da 12 giorni"`); preventivi pubblicati da più di 7 giorni
    **non ancora visti** (`"PR/2026/014 non è ancora stato visto nel portale"`, `"Batokyo Srl · pubblicato il 13/10"`);
    referenti che **non entrano** da `PORTALE_INATTIVI_MESI` (`"Sig. Ferretti non entra nel portale da 12 mesi: togli
    l'accesso?"`, amministrazione, con **Togli l'accesso**); rapportini in bozza da più di 7 giorni di clienti col portale
    (`"RAP/2026/0153 da far firmare: fallo firmare nel portale"`).
- `collegamento.pagina` nuove: `comunicazioni` (filtro `segmento`: `damandare` | `storico` | `modelli` | `notifiche`,
  `idCliente`, `idCommessa`), `portale` (filtro `segmento`: `daguardare` | `clienti` | `pubblicati` | `accessi`),
  `portaleCliente` (`id` del cliente), `caricamento` (`id`), `modello` (`chiave`).
- **Riquadri** per chi vede il portale: **Dal portale** (da guardare) e **Da mandare oggi**, toccabili; per il
  collaboratore solo **Da mandare oggi** (i suoi).
- **Numerino giallo** nel menu: **WhatsApp e comunicazioni** = da mandare oggi più preparati non mandati; **Portale
  clienti** = da guardare. La **campanella** ha il numero delle notifiche nuove.
- **Il collaboratore**: i promemoria delle sue attività, i messaggi dei clienti sui suoi ticket, i suoi rapportini firmati
  nel portale; niente pagamenti, niente file dei clienti, niente stato del portale.

### 11.2 Permessi

| | titolare | amministrazione | collaboratore | lettura | esterno |
|---|---|---|---|---|---|
| `comunicazioni` | 2 | 2 | **2** (solo le sue: le sue attività, i ticket e i rapportini che vede, quelle create da lui; mai i pagamenti) | 1 | 0 |
| `portale` | 2 | 2 | 0 | 1 | 0 |

Regole:
- **Pagamenti** (proposte, modelli `pagamento`, `nonSollecitare`): `fatturazione` 2 e `costi` ≥ 1.
- **Rispondi nel portale** e **Mostra nel portale**: `ticket` 2 sul ticket (anche il collaboratore sui suoi), senza
  bisogno di `portale`.
- **Pubblica**: `portale` 2 e il modulo della cosa ≥ 1; **accettare un file**: `portale` 2 e `documenti` 2.
- **Spegnere il portale** e le impostazioni del portale: `amministrazione` 2.
- **Lettura**: vede storico, portale, accessi; nessun pulsante per scrivere, nessun giallo; l'anteprima sì.
- **Esterno**: niente (la fase 6 rifiuta già di dargli `comunicazioni` e `portale`).
- Il menu mostra **WhatsApp e comunicazioni** con `comunicazioni` ≥ 1 e **Portale clienti** con `portale` ≥ 1.
- Prove "non deve vedere / non deve scrivere" per ogni ruolo su ogni azione nuova (§13.1).

### 11.3 Registro

Tabelle nuove con i loro nomi (§5.4, tranne `portale_accessi`, che è già un registro, e `portale_tentativi`). Note:
`"portale acceso per il cliente"`, `"portale spento per il cliente"`, `"invito al portale per {email}"`, `"accesso al
portale cambiato"`, `"accesso al portale tolto"`, `"pubblicato nel portale"`, `"tolto dal portale: {motivo}"`,
`"accettato nel portale da {nome}"`, `"rifiutato nel portale da {nome}"`, `"firmato nel portale da {nome}"`, `"richiesta
dal portale"`, `"file dal portale accettato"`, `"file dal portale rifiutato: {motivo}"`, `"risposta nel portale"`,
`"messaggio WhatsApp preparato"`, `"segnato mandato"`, `"non mandato: {motivo}"`, `"WhatsApp: ha detto di sì"`,
`"WhatsApp: non vuole più"`, `"anteprima del portale come {referente}"`, `"portale spento da {nome}"`, `"niente promemoria
di pagamento: {motivo}"`. **Mai** nel registro: token, codici, cookie, `PORTALE_SEGRETO`, il contenuto dei file, le
immagini delle firme (solo l'id del file), i testi delle email d'accesso.

## 12. Schermate

**Parole fisse** (uguali ovunque). Comunicazioni — canali **WhatsApp**, **Email**, **Portale**, **Telefonata**, **Nota**;
stati **Da mandare**, **Preparato**, **Mandato**, **Non mandato**, **Errore**, **Ricevuto**; i nomi dei modelli (§9.2);
**Ha detto sì a WhatsApp**, **WhatsApp non chiesto**; **Non collegato**. Portale (studio) — **Acceso**, **Spento**;
referenti **Attivo**, **Invitato**, **Senza accesso**, **Tolto**; **Nel portale**, **Visto il …**, **Non ancora visto**,
**Da firmare nel portale**; file **Da guardare**, **Accettato**, **Rifiutato**; collegamento **Collegato**, **Non
collegato**, **Non si raggiunge**; **Dal portale**, **Dal cliente**; **Anteprima dello studio**. Portale (cliente) —
preventivi **Da accettare**, **Accettato**, **Scaduto**, **Non accettato**; contratti **Attivo**, **Disdetto**,
**Chiuso**; rapportini **Da firmare**, **Firmato**; fatture **Pagata**, **Da pagare**, **Scadenza passata**, **Pagata in
parte**, **Annullata**, **Nota di credito**; richieste **Ricevuta**, **Presa in carico**, **Intervento fissato**, **In
attesa**, **Risolta**, **Chiusa**, **Annullata**; file **Ricevuto**, **Accettato**, **Non accettato**; **Nuovo**.

Colori sempre con la parola: verde (Accettato, Firmato, Pagata, Risolta, Attivo, Mandato, Collegato, Accettato il file),
blu (Presa in carico, Intervento fissato, Da pagare, Preparato, Invitato), giallo tenue (Da accettare, Da firmare, Da
mandare, Da guardare, Da firmare nel portale, Nuovo), ambra (Scaduto, Scadenza passata, Pagata in parte, In attesa),
rosso tenue (Errore, Rifiutato, Non si raggiunge, la richiesta Urgente nello studio), grigio (Ricevuta, Chiusa,
Annullata, Non accettato, Non mandato, Tolto, Spento, Senza accesso, Ricevuto). **Al cliente niente rosso**: anche una
scadenza passata è ambra. **Un solo pulsante giallo per schermata**, scritto qui per ognuna; nelle pagine con un pannello
aperto (computer) il giallo della pagina diventa col bordo.

Menu: **14 WhatsApp e comunicazioni** (icona del fumetto), **15 Portale clienti** (icona del globo), nell'ordine delle
specifiche (dopo Mezzi e attrezzature, prima di Collaboratori esterni). La **campanella** (icona della campana) sul
telefono accanto al cerchio con le iniziali, sul computer in fondo al menu laterale sopra il nome.

### 12.1 WhatsApp e comunicazioni: telefono

Segmenti **Da mandare · Storico · Modelli · Notifiche**.
- *Da mandare*: gruppi **Oggi**, **Domani**, **Proposti**, **Preparati, non mandati**; ogni proposta è una scheda: icona
  del canale (WhatsApp verde scuro, Email blu), nome del modello, "Sig. Ferretti · Rossi Impianti Srl", il riferimento
  ("Domani alle 9:00 · Intervento TK/2026/0014"), le prime due righe del testo; tocco = foglio **Messaggio**; sotto,
  testo **Non mandare** (avviso con Annulla). Vuoto: "Niente da mandare oggi". In fondo le righe calme **WhatsApp
  Business · Non collegato**, **Ore e spese via messaggio · Non collegato**, **Assistente operativo · Non collegato**
  (tocco = una riga che dice il perché). Giallo **Nuovo messaggio**.
- *Messaggio* (foglio, pagina intera sul telefono): **A** (nome, "Rossi Impianti Srl", numero o email; **Cambia**: gli
  altri referenti del cliente), **Canale** segmenti **WhatsApp | Email** (WhatsApp spento con "Nessun numero" se manca;
  la pillola **WhatsApp non chiesto** se non ha detto di sì), **Modello** (pillole dei modelli di quell'uso), per l'email
  **Oggetto**, **Testo** (area grande, già scritta; i segnaposti senza valore in giallo scuro: "manca il luogo"), il
  riferimento in una riga ("Intervento TK/2026/0014 · giovedì 23 ottobre alle 9:00"); per i pagamenti la riga "Ultimo
  movimento segnato in Banche e scadenze: 15/10/2026"; per un fisso "Sembra un numero fisso: WhatsApp potrebbe non
  esserci". Giallo **Apri WhatsApp** (o **Manda l'email**); testo **Copia il testo**.
- *Ha detto di sì?* (foglio, prima di aprire WhatsApp per chi non ha il sì): "Giulia Neri ha detto che si può scriverle
  su WhatsApp?" · giallo **Sì, me l'ha detto** · bordo **Manda un'email**.
- *L'hai mandato?* (foglio al ritorno): "Il messaggio a Sig. Ferretti" e il testo in piccolo · giallo **Sì, l'ho
  mandato** · bordo **Non ancora**.
- *Storico*: ricerca; pillole **Tutti · WhatsApp · Email · Portale · Telefonate**; righe per giorno: icona del canale,
  "Promemoria appuntamento · Sig. Ferretti", "Rossi Impianti Srl · 9:02", pillola di stato; le righe dell'entrata (dal
  portale) con la freccia in dentro; tocco = **Comunicazione** (pagina: canale, chi, quando, **Testo preparato** o
  **Testo**, riferimenti come righe che aprono la cosa, **Segna mandato** se preparato). Giallo **Nuovo messaggio**;
  ⋯ **Annota una telefonata**.
- *Modelli*: righe (nome, canale in pillola, prime parole); tocco = pagina del modello (nome, canale **WhatsApp · Email ·
  Tutti e due**, uso, oggetto, testo con sotto le **pillole dei segnaposti** che si toccano per metterli nel testo, il
  numero dei caratteri per WhatsApp, giallo **Salva il modello**); Giallo della lista **Nuovo modello**.
- *Notifiche*: righe (nuove in grassetto con il pallino giallo), tocco = la cosa; bordo **Segna tutte lette**; in fondo la
  riga **Avvisami sul telefono** con l'interruttore. Nessun giallo.
- Sul **telefono senza rete**: la pillola grigia in basso (§3.20).

### 12.2 WhatsApp e comunicazioni: computer

Stessa voce, stessi segmenti. *Da mandare*: due colonne (a sinistra l'elenco a gruppi, a destra il **messaggio scelto**
già aperto, con il giallo **Apri WhatsApp**: quando la colonna è aperta il giallo **Nuovo messaggio** diventa col bordo);
*Storico*: tabella (Quando, Canale, Tipo, A chi, Cliente, Riferimento, Stato) con le pillole-filtro e i filtri per
cliente e commessa come pillole con la ×; tocco = pannello (440) della comunicazione. *Modelli*: tabella e finestra del
modello a due colonne (a sinistra i campi, a destra l'anteprima con i segnaposti riempiti per un cliente di esempio).
*Notifiche*: elenco.

### 12.3 Portale clienti (lo studio): telefono

Segmenti **Da guardare · Clienti · Pubblicati · Accessi**. In cima a tutti la riga dello stato: "Portale **Collegato** ·
studio-gm.tail1a2b.ts.net" (o **Non collegato** con "Scegli come portarlo su internet: Amministrazione" o **Spento**).
- *Da guardare*: schede in ordine di tempo: **Richiesta dal portale** (rossa tenue se urgente: "TK/2026/0016 · Scatta il
  differenziale del quadro QG2", "Rossi Impianti Srl · Sig. Ferretti · alle 9:12" → apre il ticket); **Accettato nel
  portale** ("PR/2026/012 rev. 1 · Roberto Ferretti", "5.175,24 €" con `costi` → apre il preventivo); **Firmato nel
  portale**; **File dal cliente** ("Schema quadro QG2.pdf · 1,2 MB" → foglio del file); **Messaggio**; **Domanda**;
  **Segnalazione**. Ogni scheda ha il testo **Visto**. Vuoto: "Niente da guardare". Nessun giallo.
- *File dal cliente* (foglio): nome, chi e quando, grandezza, il titolo e la nota del cliente, **Scarica** (bordo; il
  primo apri chiede la conferma di §3.11); **Categoria** (pillole delle categorie dei documenti), **Commessa** e
  **Impianto** proposti; giallo **Accetta e archivia**; testo **Rifiuta** (motivo obbligatorio).
- *Clienti*: righe (cerchio, nome, "2 referenti · ultimo accesso oggi alle 9:58", pillola **Acceso** o **Spento**).
  Giallo **Apri il portale a un cliente** (sceglie il cliente, poi il foglio Invita).
- *Cliente nel portale* (pagina, anche da Clienti › scheda › Portale): titolo col nome, interruttore **Portale acceso**;
  **Chi entra** (righe dei referenti con l'accesso: nome, email, "Preventivi · Rapportini · Documenti · Richieste" o
  "Solo Magazzino automatico di Schio", pillola dello stato, ultimo accesso; tocco = foglio **Accesso di Sig. Ferretti**:
  per ognuno dei cinque tipi i segmenti **No · Vede** e il terzo che dice cosa fa: **Accetta** (preventivi), **Firma**
  (rapportini), **Manda file** (documenti), **Apre** (richieste); fatture solo **No · Vede**), **Sedi** (Tutte · Solo queste, con
  le pillole), **Avvisi per email**, **Rimanda l'invito** (bordo), testo **Togli l'accesso**, giallo **Salva**); **Cosa si
  pubblica da solo** (interruttori: Preventivi quando partono, Contratti quando si attivano, Rapportini firmati,
  Rapportini da firmare, Fatture emesse; Richieste **Solo dal portale · Tutte**; **Importi nei rapportini**), con **Pubblica
  anche quelli di prima** (bordo) sotto; **Pubblicati** (righe con "visto il …" o "non ancora visto"; tocco = la cosa; ⋯
  **Togli dal portale**); **Arrivati dal cliente** (i file); **Accessi recenti** (5 righe e **Tutti**). ⋯ della pagina:
  **Vedi come lo vede il cliente** (sceglie il referente, apre il browser), **Spegni il portale per questo cliente**.
  Giallo **Invita un referente**.
- *Invita un referente* (foglio): **Chi** (pillole dei referenti del cliente con l'email; "+ Nuovo referente"; per un
  privato già scelto lui), **Cosa può fare** (i cinque tipi coi segmenti, già messi come §3.6), **Sedi**, "L'email
  d'invito parte a f.ferretti@rossi.example" · giallo **Manda l'invito**. Non collegato: al posto del giallo la riga
  **Non collegato** e "Prima scegli come portare il portale su internet (Amministrazione)".
- *Pubblicati*: pillole **Tutti · Preventivi · Rapportini · Documenti · Fatture · Richieste** e **Non ancora visti**;
  righe (cosa, cliente, "pubblicato il …", visto). Nessun giallo.
- *Accessi*: righe (quando, "Sig. Ferretti · Rossi Impianti Srl", la frase, dispositivo e IP); pillole **Tutti · Entrati ·
  Azioni · Errori**. Nessun giallo.

### 12.4 Portale clienti (lo studio): computer

Stessa voce, stessi segmenti. *Da guardare*: elenco a sinistra e la cosa scelta a destra (il file col suo foglio come
pannello, il ticket e il preventivo come pannello con i loro gialli). *Clienti*: tabella (Cliente, Stato, Referenti,
Ultimo accesso, Pubblicati, Non visti); tocco = pagina del cliente nel portale a due colonne (a sinistra Chi entra e Cosa
si pubblica da solo, a destra Pubblicati, Arrivati e Accessi). *Pubblicati*, *Accessi*: tabelle.

### 12.5 Il portale visto dal cliente (telefono e computer)

Aspetto dello studio: in alto il **nome dello studio** (testo, 20/800) e sotto "Portale clienti" (tenue); il marchio di
Wisper non c'è (il portale è dello studio); nel piè di pagina solo i dati dello studio (nome, indirizzo, partita IVA,
telefono, email) e **Informativa sulla privacy**. Stessi colori, carattere e forme di Wisper (`aspetto.md`), stesso giallo
solo sull'azione principale; tema chiaro e scuro dal sistema (`prefers-color-scheme`). **Telefono**: in alto il nome
dello studio, a destra **Menu** (apre il cassetto con le voci); **computer**: menu a sinistra bianco largo 248 (nome dello
studio, voci, in fondo il nome del referente e **Esci**), contenuto largo al massimo 960. Voci: **Casa · Preventivi e
contratti · Rapportini · Documenti · Fatture · Richieste d'intervento · Il mio accesso** (solo quelle col permesso ≥ 1).
- *Entra*: nome dello studio grande, "Portale clienti", campo **La tua email**, giallo **Mandami il link**. Dopo:
  *Controlla la posta*: la frase di §7.1, campo **Codice** (6 cifre grandi, tastiera numerica), giallo **Entra**; testo
  **Non è arrivata? Mandala di nuovo** (attivo dopo 60 secondi) e **Usa un'altra email**.
- *Dal link* (`/portale/entra/<token>`): "Entra nel portale di Studio Tecnico GM" · giallo **Entra nel portale**. Non vale
  più: "Questo link non vale più" · giallo **Mandami un link nuovo** (se `nuovo`), se no **Torna all'ingresso**.
- *Per quale azienda?*: righe delle aziende; tocco = dentro. Nessun giallo.
- *Prima di entrare* (primo ingresso): il riassunto di §9.8, **Leggi l'informativa completa** (testo), giallo **Ho letto,
  entra**.
- *Casa*: "Buongiorno, Sig. Ferretti" e "Rossi Impianti Srl"; **Da fare** (schede: "Preventivo PR/2026/012 rev. 1 · Da
  accettare · scade il 28/10/2026", "Rapportino del 21/10/2026 · Da firmare"); **Novità** (righe); riquadri **Preventivi ·
  Rapportini · Documenti · Fatture · Richieste** con i numeri. Giallo **Nuova richiesta d'intervento** (con `richieste`
  2; se no nessun giallo).
- *Preventivi e contratti*: righe (etichetta, oggetto, data, totale, pillola di stato, **Nuovo**); sotto **Contratti**.
  Nessun giallo.
- *Preventivo*: etichetta e stato, oggetto, introduzione; le **sezioni** come schede con le voci (descrizione, "16 ore ×
  45,00 €", importo); le facoltative con la casella **La voglio** e l'importo; le alternative con la scelta **Una di
  queste** (cerchi) più **Nessuna di queste**; la scheda dei conti (Imponibile, Contributo integrativo 5%, IVA 22%,
  **Totale** grande) che si aggiorna; **Pagamenti** (le scadenze); **Condizioni**, **Complessità**, **Oneri**, **Titoli e
  polizza** chiusi in righe che si aprono; **Scarica il PDF** (o **Stampa o salva in PDF**) col bordo; testi **Ho una
  domanda** e **Non mi interessa**. Giallo **Accetta il preventivo** (da accettare e `preventivi` 2). Accettato: la scheda
  verde "Accettato il 22/10/2026 alle 10:07 da Roberto Ferretti" con la firma; scaduto: la scheda ambra "Scaduto il
  06/10/2026" e **Chiedi un aggiornamento** (bordo). Nessun giallo in quei casi.
- *Accetta il preventivo*: "PR/2026/012 rev. 1 · Totale 5.175,24 €", le scelte in righe ("Dichiarazione di rispondenza ·
  inclusa", "Collaudo con laboratorio esterno · scelto"), **Nome e cognome di chi accetta**, la casella **Ho letto le
  condizioni e accetto il preventivo PR/2026/012 rev. 1**, il riquadro bianco della firma alto 220 con la linea e
  **Cancella**, giallo **Firma e accetta**. Errori sotto il campo che manca. Dopo: pagina **Preventivo accettato** con la
  spunta, "Ti abbiamo mandato un'email di conferma", **Torna alla casa** (bordo).
- *Rapportini*: pillole delle sedi (se più di una); righe (data, lavoro, luogo, pillola). Nessun giallo.
- *Rapportino*: come il PDF: data, numero, luogo, commessa, tecnico, **Lavoro** in un riquadro grigio, **Ore** (lavoro,
  viaggio, extra), **Km**, gli importi se ci sono, la firma ("Roberto Ferretti · 21/10/2026 17:30", "Firmato nel portale"
  se lo è); **Scarica il PDF** o **Stampa o salva in PDF** (bordo); testo **Segnala un problema**. Giallo **Firma il
  rapportino** (da firmare e `rapportini` 2).
- *Firma il rapportino*: come la firma del telefono (`aspetto.md` §5, chiara anche col tema scuro): "Capannone di Thiene ·
  21/10/2026", il lavoro e "3 ore di lavoro · 0,5 di viaggio · 24 km" (mai i soldi), **Nome di chi firma**, riquadro,
  "Firmando confermi lavoro e ore del rapportino", **Cancella** (bordo), giallo **Conferma firma**.
- *Documenti*: righe (titolo, "Progetti e schemi · rev. 2 · 1,8 MB", **Nuovo**); tocco = scarica; sezione **Mandati da
  voi** con i file e la pillola. Giallo **Manda un file allo studio** (con `documenti` 2).
- *Manda un file allo studio*: il riquadro tratteggiato **Scegli il file** (sul telefono anche **Fotografa**), il nome e la
  grandezza scelti, **Di cosa si tratta**, **Per quale impianto** (pillole delle sue sedi, facoltativo), **+ Una nota**,
  giallo **Manda il file**. Tipo non ammesso: l'errore di §6.7 sotto il riquadro. Dopo: "Ricevuto: lo studio lo guarda e
  ti dice se lo archivia".
- *Fatture*: righe (numero, data, totale, pillola con "entro il …"). Nessun giallo. *Fattura*: numero e stato, le righe,
  i conti (compenso, contributo, IVA, spese anticipate, bollo, totale, ritenuta, **Da pagare**), le scadenze, **Come
  pagare** (IBAN con **Copia**, intestatario, causale), **Scarica la fattura (XML)** e **Copia PDF** (se c'è), la riga
  "Copia di cortesia: la fattura valida è quella del Sistema di Interscambio". Nessun giallo.
- *Richieste d'intervento*: pillole **Aperte · Chiuse**; righe (numero, titolo, luogo, pillola con "giovedì 23 ottobre alle
  9:00"). Giallo **Nuova richiesta**.
- *Nuova richiesta*: **Dove** (pillole delle sedi e degli impianti), **Cosa succede**, **Racconta**, **L'impianto è
  fermo?** (Sì, è fermo · Va a metà · Funziona), **Per quando?** (Subito · Entro domani · Quando si può), **Foto o file**
  (Fotografa · Scegli i file, miniature con la ×), **+ Vostro riferimento**; giallo **Manda la richiesta**. Dopo: "Richiesta
  TK/2026/0016 ricevuta" e, con fermo e subito, "Se è urgente chiama anche lo 0445 000100" con il numero toccabile.
- *Richiesta*: numero, titolo, pillola di stato, luogo, **Le tue risposte**, la **linea del tempo**, i **Messaggi** (lo
  studio a sinistra, il cliente a destra come in una chat, con l'ora), i rapportini, in basso il campo **Scrivi allo
  studio** con **Allega** e **Manda** (bordo); su Risolta il bordo **Non è risolto**. Nessun giallo.
- *Il mio accesso*: nome, email, azienda (**Cambia azienda** se ce n'è più di una), interruttore **Avvisami per email
  quando c'è qualcosa di nuovo**, **Ultimi accessi** (righe), testo **Esci da tutti i dispositivi**, **Informativa sulla
  privacy**, bordo **Esci**. Nessun giallo.
- *Anteprima dello studio*: in cima una fascia gialla tenue fissa "Anteprima dello studio: niente di quello che fai
  arriva al cliente"; i gialli ci sono ma il tocco risponde con l'avviso "È un'anteprima: qui non si accetta e non si
  firma".
- *La sessione è scaduta*: torna a *Entra* con l'avviso "La sessione è scaduta: entra di nuovo". *Portale spento*: "Il
  portale di Studio Tecnico GM non è attivo" e il telefono dello studio.
- **Avvisi** in basso al centro, scuri, 3,5 s, come Wisper. Tocchi ≥ 48 px; testo 16 px almeno; contrasti di
  `aspetto.md`; il portale si usa con la tastiera e col lettore di schermo (etichette sui campi, la firma ha
  l'alternativa testuale "Riquadro della firma: disegna col dito o col mouse").

### 12.6 Le altre pagine

- **Dashboard**: riquadri **Dal portale** e **Da mandare oggi**, le voci di §11.1; la campanella.
- **Clienti e fornitori › scheda cliente**: sezione **Portale** (stato, "2 referenti con l'accesso · ultimo accesso oggi",
  **Apri**), sezione **Comunicazioni** (le ultime 5 con le righe calme degli accessi, **Tutte**, **Scrivi** col bordo); nei
  **referenti** le icone **WhatsApp** (apre il Messaggio con il modello libero), **Email**, **Chiama**, la pillola
  **Accesso al portale** e **Ha detto sì a WhatsApp**; nel foglio del referente **Paga le fatture**, **Numero WhatsApp**
  (se diverso), **Ha detto sì a WhatsApp** / **Non vuole più WhatsApp**.
- **Commessa**: scheda nuova **Comunicazioni · N** (lo storico della commessa, **Scrivi**).
- **Preventivo**: pillola **Nel portale · visto il …**; l'accettazione nel portale con la firma, "Roberto Ferretti ·
  22/10/2026 10:07 · nel portale" e, con preventivi 2, **Prova dell'accettazione** (riga che apre IP, browser, impronta);
  dopo **Invia per email** l'avviso "Preventivo mandato" con **Manda anche un WhatsApp**; ⋯ **Pubblica nel portale** /
  **Togli dal portale**.
- **Rapportino**: pillola **Da firmare nel portale** o **Nel portale**; ⋯ **Fallo firmare nel portale**; sotto la firma
  "Firmato nel portale da Roberto Ferretti · 22/10/2026 10:15".
- **Ticket**: pillola **Dal portale** (origine), sezione **Messaggi col cliente** (la conversazione pubblica, divisa dalla
  cronologia interna), bordo **Rispondi nel portale**, interruttore **Mostra nel portale**; le foto del cliente con la
  pillola **Dal cliente**.
- **Attività** (appuntamento, sopralluogo, intervento con un cliente): riga **Avvisa il cliente** (**WhatsApp · Email ·
  No**) e il referente; dopo il salvataggio l'avviso "Intervento fissato per giovedì 23" con **Avvisa il cliente**.
- **Fattura** (emessa): pillola **Nel portale**; ⋯ **Allega la copia PDF**, **Pubblica nel portale**, **Non mandare
  promemoria**; scaduta: bordo **Prepara un promemoria di pagamento**.
- **Documento**: ⋯ **Pubblica nel portale** (al posto di "Link che scade · Non collegato" della fase 5, che diventa vero
  quando il portale è collegato: **Link che scade** resta per chi non ha l'accesso al portale).
- **Amministrazione › Impostazioni**: scheda **Portale clienti** (Indirizzo con lo stato **Collegato** / **Non si
  raggiunge** / **Non collegato** e **Prova adesso**; **Portale acceso**; durata del link e della sessione; file dal
  cliente (tipi, MB); email lasciate allo studio; **Informativa per i clienti** (**Cambia**, e "versione del 22/10/2026");
  bordo rosso tenue **Spegni il portale adesso**), scheda **Comunicazioni** (WhatsApp **Business · Normale · Chiedi**,
  promemoria degli appuntamenti "1 giorno lavorativo prima", promemoria di pagamento "dopo 7 giorni, il secondo dopo 30",
  e le righe Non collegato di §3.17 col perché), ognuna col suo **Salva** col bordo. **Ruoli e permessi** con le righe
  `comunicazioni` e `portale`. **Registro attività** col filtro **Portale**.
- **Visita guidata**: un passo in più sul telefono, sulla schermata vera coi dati di esempio: Comunicazioni › Da mandare,
  la prima scheda (leggi: "Messaggi pronti" / "Wisper li prepara, tu li mandi da WhatsApp.").

## 13. Prove di fine fase

### 13.1 Funzioni

- **Migrazione 007**: §5.5.
- **Pubblicazioni**: ogni regola di §8.1 accesa e spenta; stati che si possono mostrare e no; revisione nuova che chiude
  la vecchia; rapportino annullato che esce; documento riservato, di un altro cliente, collegamento, bozza rifiutati;
  `pubblicaPrima` senza avvisi.
- **Accettare**: anteprima uguale ai conti della fase 2 (`casi-preventivo.json` con le scelte); accettazione con firma e
  prova; versione cambiata (409); scaduto rifiutato; doppione dalla rete che cade; email di conferma; Da guardare e
  Dashboard; `creaCommessaDaPreventivo` che chiude la riga.
- **Firmare un rapportino**: da firmare → FIRMATO con `firma_modo = portale`; rapportino cambiato nel frattempo (409);
  PDF (da `documenti.js`) con "Firmato nel portale"; i PDF di oggi identici.
- **Richieste**: nuova dal portale con foto → ticket `origine = portale`, priorità dalla matrice; limiti al giorno;
  messaggi nei due versi; parole del cliente per ogni stato; nessun campo interno.
- **File**: ogni tipo ammesso passa; ognuno dei rifiutati (EXE rinominato PDF, SVG, HTML, ZIP, DOCM, XLSX con
  `vbaProject.bin`, DOCX "bomba" con l'indice gonfiato, doppia estensione) no; limiti; accetta e rifiuta; cestino dopo 2
  ore; tolto dal disco dopo 30 giorni dal rifiuto.
- **Comunicazioni**: `casi-whatsapp.json` uguali in server, Kotlin e `regole-comunicazioni.js`; segnaposti, `mancano`, la
  riga di `{portale}` che sparisce; proposte di Da mandare (giorno lavorativo prima, attività spostata o annullata,
  proposta usata o scartata che non torna); promemoria di pagamento solo al referente dei pagamenti, al massimo due,
  `nonSollecitare`; WhatsApp senza sì rifiutato e con `segnaSi`; storico nato da ogni email di Wisper; le comunicazioni del
  collaboratore.
- **Email del portale**: quota (riserva, ordine di importanza, rinvio alle 8:00 del giorno dopo), raggruppamento, al
  massimo 3 al giorno, avvisi spenti dal referente; testi senza importi (tranne la conferma).
- **Notifiche**: ogni tipo di §9.7 alla persona giusta e non a chi ha fatto la cosa; telefono che non la mostra due volte.
- **Permessi**: ogni ruolo su ogni azione nuova; il collaboratore senza `portale`, con le sue comunicazioni; lettura senza
  scritture; esterno senza niente.

### 13.2 Sicurezza (a fine fase, tutte automatiche tranne le ultime due)

1. **Strade**: con `node:http` contro la 8401 del server di prova: `/exec`, `/exec?azione=io`, `/file/<id vero>`,
   `/ponte`, `/salute`, `/carica`, `/portale/static/../src/avvio.js`, `/portale/%2e%2e/`, `/condiviso/../exec`, metodi
   PUT, DELETE, OPTIONS, HEAD → **404 tutti uguali** (stesso corpo e stesse intestazioni); la 8400 non ha nessuna strada
   `/portale/`.
2. **Confini del codice**: `prove/portale-confini.test.js` (§3.1).
3. **Viste**: per ogni risposta di §7 l'insieme delle chiavi (a ogni profondità) è **uguale** all'elenco scritto qui; con i
   dati di prova pieni di note interne, costi e nomi dello studio, nessuno di quei valori compare nel testo delle risposte.
4. **Isolamento** (IDOR): il referente di Batokyo chiede ogni id di pubblicazione di Rossi e di Bianchi, ogni chiave di
   file di un'altra sessione, ogni id fuori dalle sue sedi → 404; un referente con fatture 0 → 404 su `/fatture`; dopo
   **Togli dal portale** la chiave di un file già data → 404.
5. **Ingresso**: stessa risposta e tempo simile (differenza media sotto 50 ms su 50 prove) per email abilitata,
   sconosciuta, tolta, limitata; token e codice monouso; scaduti; codice in un altro browser rifiutato; 5 errori uccidono il
   codice; 10 all'ora fermano il referente; limiti per IP; una GET sul link **non** lo consuma; il link d'avviso porta alla
   destinazione; nessun token né codice nei log e nel registro.
6. **Sessione**: cookie con `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, senza `Domain`; identificativo nuovo a ogni
   ingresso; 30 minuti senza uso e 8 ore chiudono; **Esci** e **Esci da tutti** chiudono sul server; **Togli l'accesso**,
   email cambiata, portale spento del cliente e **Spegni il portale adesso** chiudono le sessioni aperte alla richiesta
   dopo.
7. **CSRF**: POST senza `X-Wisper-Csrf`, con un token di un'altra sessione, con `Origin` diverso o `null`, con
   `Sec-Fetch-Site: cross-site` → 403; GET che cambia qualcosa: nessuna.
8. **Intestazioni**: ogni risposta della 8401 ha quelle di §6.2 e non ha `Server`, `X-Powered-By`, `Access-Control-*`.
9. **Testi**: un titolo di richiesta `<img src=x onerror=alert(1)>`, un nome di file `"><svg onload=…>.pdf` e un messaggio
   con `</script>` arrivano allo studio e tornano al cliente come testo (il portale usa `textContent`; prova con Edge senza
   finestra che nessun `alert` parte).
10. **Anteprima**: ogni POST che cambia → 403; nessun `visto`; registro dello studio scritto.
11. **Quota**: 200 richieste di link in un'ora da 20 IP per 50 email → al massimo il tetto, riserva intatta, Dashboard.
12. **Ingresso e Funnel** (Andrea, a mano, col telefono in 4G fuori dal Wi-Fi di casa): l'indirizzo del portale apre il
    portale; `https://<nodo del server>.ts.net/exec` **non risponde** da internet; la porta 8401 non risponde
    dall'indirizzo del NAS in casa (`http://192.168.1.51:8401`); `https://studio-gm…/exec` → 404.
13. **Scansione esterna** (facoltativa, gratis): OWASP ZAP "baseline" in Docker contro il portale di prova sul PC di
    Andrea; nessun avviso alto o medio.

### 13.3 Schermate vere

Su telefono e computer per lo studio, e il portale su telefono e computer per il cliente, chiaro e scuro, confrontate col
prototipo. Il flusso intero coi dati di prova: Manuel apre il portale a Rossi e invita Sig. Ferretti → l'email del finto
postino ha il link → Ferretti entra, legge l'informativa, apre il preventivo, sceglie la DiRi e il collaudo esterno,
firma e accetta → Manuel vede **Accettato nel portale** e crea la commessa → Ferretti firma il rapportino da firmare e
apre una richiesta urgente con la foto → Marco riceve la notifica, risponde nel portale → Manuel prepara il promemoria
dell'appuntamento, apre WhatsApp (sull'emulatore: il link `wa.me` si apre nel browser), segna mandato → lo storico del
cliente ha tutto, il registro degli accessi del portale anche.

## 14. Da confermare e da decidere

**Con un consulente privacy** (fonti in `ricerca-fase7.md` §5): il testo dell'informativa (art. 13/14) e il bilanciamento
dell'interesse legittimo per i referenti; i tempi di conservazione (registro degli accessi 12 mesi, comunicazioni 10
anni); i fornitori negli Stati Uniti (Tailscale o Cloudflare, Google) e il Gmail gratuito senza accordo sul trattamento
dei dati (passare a Workspace?); se serve una valutazione d'impatto. **Col commercialista**: la copia di cortesia delle
fatture nel portale; i testi dei promemoria di pagamento e quando passare al sollecito formale. **Con Manuel**: a quali
clienti aprire il portale e a quali referenti (con email personali); chi paga le fatture per ogni cliente; se usa
WhatsApp Business sul numero di lavoro e quali clienti hanno detto di sì; il tono dei messaggi (il "lei"); se qualche
cliente vuole approvare le ore prima della fattura; il telefono dello studio da mostrare nel portale. **Con Andrea**: le
domande qui sotto, l'account dello studio con la verifica in due passi, le chiavi del contenitore d'ingresso, l'indirizzo
vero, la prova da fuori casa (§13.2, 12). Fino ad allora valgono i valori proposti qui, tutti modificabili.

**Domande per Andrea** (la raccomandazione per prima):
1. **Come portare il portale su internet**: **Tailscale Standard, un posto, in un tailnet nuovo dello studio** (consiglio:
   8 $ al mese, circa 90 € l'anno; il TLS resta nel NAS, copre anche telefoni e computer dello studio fuori casa, il
   compose è già fatto così; Pactum resta sul tuo piano gratuito). L'alternativa è **Cloudflare Tunnel + un dominio nuovo**
   solo per il portale (circa 5-12 € l'anno; Cloudflare vede il traffico; per il server interno fuori casa serve un'altra
   strada). Il piano gratuito di Tailscale non va bene: è solo per uso non commerciale, e lo studio lo è già con la fase 1.
2. **Il server interno fuori da internet** (consiglio sì): `AllowFunnel` tolto dal nodo del server, solo tailnet; il
   controllo delle 7:00 diventa il battito del server al postino; il ponte apre la porta 8443 con due sole strade solo
   nelle settimane del cambio. L'alternativa (come la fase 1) lascia `/exec` su internet, protetto da email e password.
3. **Ingresso senza password, con un link e un codice per email che valgono 10 minuti** (consiglio sì; 72 ore i link
   negli avvisi). L'alternativa è una password per referente: da ricordare, da recuperare per email comunque, esposta ai
   tentativi a raffica.
4. **"Approvare" un rapportino vuol dire firmarlo a distanza**, solo per quelli rimasti da firmare (consiglio sì: quelli
   firmati sul telefono si guardano e basta, con **Segnala un problema**). L'alternativa è un'approvazione mensile
   dell'ufficio del cliente prima della fattura: uno stato in più per tutti i rapportini.
5. **Promemoria degli appuntamenti preparati da Wisper e mandati da Manuel** (consiglio sì: decisione 7, appuntamenti
   spostati al telefono, niente quota). L'alternativa sono email automatiche il giorno prima.
6. **Promemoria di pagamento proposti, al massimo due, solo a chi paga** (consiglio sì, con l'ultimo movimento della banca
   davanti). L'alternativa è non averli in Wisper.
7. **Firma disegnata anche sul computer** (col mouse; consiglio sì: una firma vera, la stessa sul PDF, come il rapportino).
   L'alternativa è il nome scritto sul computer, come ServiceTitan.
8. **Antivirus Essential di Synology sulla cartella dei file** (consiglio sì: gratis, una scansione a notte, lo imposti tu
   sul NAS). L'alternativa è fidarsi solo dei controlli di Wisper (tipi ammessi, primi byte, "Da guardare").
9. **Cosa si pubblica da solo, di base**: preventivi, contratti e rapportini firmati sì; fatture e rapportini da firmare
   no (consiglio sì: le fatture vanno a chi paga, la firma a distanza la chiede lo studio). L'alternativa è pubblicare
   tutto a mano.
10. **Notifiche sul telefono col controllo ogni 15 minuti**, senza servizi esterni (consiglio sì). L'alternativa è
    Firebase (immediate, gratis, ma un progetto Google e una chiave sul NAS): fase 8.

**Costi**: con la strada A **8 $ al mese** (circa 90 € l'anno) per Tailscale Standard, che servono comunque per l'uso da
fuori casa della fase 1; con la strada B **5-12 € l'anno** per un dominio nuovo (Cloudflare Tunnel gratis). Tutto il resto
0 €: i link `wa.me` e WhatsApp Business app sono gratis, le email passano dal postino (quota di Gmail), le notifiche non
usano servizi esterni, Antivirus Essential è gratuito. Non collegati, coi numeri in §3.17: WhatsApp Business API (circa
0,036 $ a promemoria), assistente con un modello a pagamento (circa 1-1,5 $ al mese per 500 domande, più il problema dei
dati fuori UE).

## 15. Decisioni prese costruendo il server (01/11/2026)

Dove l'accordo taceva o non tornava, la scelta più semplice e sicura. Valgono per server, portale, telefono e computer.

**Dati e migrazione 007**
- `preventivi` si rifà per il CHECK di `accettazione_modo` (accetta `portale`) con le chiavi esterne rimandate alla fine
  della transazione (`PRAGMA defer_foreign_keys`): voci, sezioni e scadenze restano legate agli stessi id, e se ne
  mancasse uno la migrazione non chiuderebbe. `ticket` **non** si rifà: il CHECK della fase 5 accetta già `portale`.
- `/data/portale-segreto` lo crea il server al primo uso (non la migrazione, che non conosce la cartella dei dati).
- Colonne in più, solo interne (mai nelle risposte): `portale_pubblicazioni.avviso_da` e `avviso_cosa` (gli avvisi
  raggruppati e i cambi delle richieste), `senza_avviso` (Pubblica anche quelli di prima, rapportini già firmati);
  `portale_sessioni.da_scegliere` (più aziende con la stessa email); `portale_caricamenti.stato` ha anche `caricato`
  (arrivato con `carica` e non ancora legato a un documento, una richiesta o un messaggio: dopo 2 ore nel cestino) e
  la colonna `comunicazione_id`; `portale_pulizia` (l'unica eccezione del trigger del registro degli accessi).
- Lo storico che parte dalle copie dei PDF mandati: `tipo = documento`, `quando` = l'istante della copia, `a` dalla nota.
- Le attività nuove con un cliente prendono la proposta di base dell'avviso (§3.14) anche nei dati di esempio delle
  fasi di prima: quasi tutti i clienti hanno l'email, quindi Da mandare propone anche quegli appuntamenti.

**Dati di esempio** (`src/prova.js`, `seminaFase7`, aggiunti in fondo: id, numeri e conteggi di prima invariati)
- Il **PR/2026/012 rev. 1 è già accettato dalla fase 4** (commessa 26ST003, fatture 45 e W-15): il preventivo da accettare
  con la voce facoltativa e il gruppo di alternative è il **PR/2026/014** (id 7, Rossi, cabina MT); il 012 rev. 1 è
  pubblicato come Accettato.
- `PORTALE_INDIRIZZO` resta vuoto (Non collegato, come il NAS appena acceso: i link della fase 5 restano Non collegati e
  le prove di telefono e computer non cambiano); in prova `WISPER_PORTALE_INDIRIZZO` lo scrive. `PORTALE_ATTIVO` è vero.
- `TELEFONO` dello studio resta vuoto (le prove confrontano le impostazioni con `semina()` dello script): il portale
  mostra il telefono che c'è nelle impostazioni.
- La Dashboard tiene fino a **30** voci per sezione (erano 20), così le voci del portale non tolgono quelle di prima.

**Azioni dello studio**
- Vogliono il portale collegato e acceso (`nonCollegato`, `spento`) solo `invitaReferente`, `salvaAccessoReferente`,
  `pubblica` e `anteprimaPortale` (solo `nonCollegato`). Togliere (`togliAccessoReferente`, `togliDalPortale`,
  `spegniPortale`) e decidere i file dei clienti funzionano sempre.
- `accessiPortale`: il filtro delle pillole si chiama **`gruppo`** (`entrati`, `azioni`, `errori`), perché `azione` è già
  il nome dell'azione su `/exec`. Le righe hanno anche `oggetto` ed `esito`.
- `salvaReferente`: `avviso` sta in cima alla risposta (`{"ok": true, "referente": {...}, "avviso": "..."}`).
- Campi in più nelle risposte dello studio (le app li possono ignorare): `comunicazioni[]` con `idCliente`,
  `idReferente`, `idCommessa`, `allegati`, `mandatoIl`, `errore`, `motivo`, `modello`, `proposta`, `pubblica`;
  `daMandare` con `importoResiduo` nelle proposte di pagamento (campo dei soldi); `notifiche[].mostrata`;
  `io.interfaccia.notificheTelefono`; `ticket.messaggi[]` = `{id, quando, direzione, da, chi, testo, file: [{nome, byte,
  url}], letto}` e `ticket.foto[].dalCliente`; `pubblicati[]` con `rif`, `idCliente`, `cliente`, `toltaIl`, `motivoTolta`;
  `caricamentiPortale[]` con `idCliente`, `nota`, `per`, `idSede`, `motivo`, `file {id, url}`, `idDocumento`.
- `collegamento` nuovo della Dashboard e di Da guardare: oltre a quelli di §11.1, `{pagina: "rapportino", id}`.
- `spegniPortale` vuole `amministrazione` 2: coi permessi di base lo può fare solo il titolare.
- `rispondiNelPortale` del collaboratore: sui ticket "suoi" come `sospendiTicket` (responsabile lui, o nessuno e creato da lui).

**Il portale (router, §0 e §7)**
- `GET studio` ha in più **`informativa`** (il testo intero di `PORTALE_INFORMATIVA` coi dati dello studio, `{cliente}` =
  "il cliente"): serve al piè di pagina prima di entrare. `io.informativa` ha in più **`testo`** (col nome dell'azienda).
- `codice` con più aziende risponde anche `sessione`: vale **solo** per `azienda` ed `esci` finché non si sceglie (le
  altre strade: 401 "Scegli prima l'azienda"). `azienda` restituisce una sessione nuova e `informativa`.
- `condiviso/<token>` → `{studio, documento: {titolo, revisione, nomeFile, byte}}`; `condiviso/<token>/scarica` →
  `{nome, mime, byte, base64}`; non valido: 404 "Questo link non vale più".
- `entra` e `codice` vogliono `pre` (16-200 caratteri `[A-Za-z0-9_-]`): senza, 400 "Ricarica la pagina e riprova".
- Quota finita in `entra` e `link-nuovo`: `stato` 503 con `quota: true`. Portale spento: 503 `{spento: true, telefono}`.
- Un elenco di un tipo che il referente non vede (permesso 0) risponde 404, come le cose che non esistono.
- La chiave dei file porta in più l'id della pubblicazione da cui il file si vede (`p`): scaricando si ricontrolla
  che quella pubblicazione si veda ancora e che il file sia suo.
- La firma "non vuota" si controlla sui pixel veri del PNG (filtri tolti con zlib di Node): un riquadro tutto uguale è
  "Manca la firma". La prova del rapportino ha anche un'impronta (data, lavoro, ore, km).
- Le letture contano in memoria (300 ogni 5 minuti per sessione, 1.500 per tutto il portale); i link e i codici nel
  database (`portale_tentativi`, chiavi `portale`, `email:<sha256>`, `codice:<referente>`, `email_portale`).
- Le POST che cambiano qualcosa si ricordano per un giorno con l'`id` della pagina (`ricordo.js`, legate alla sessione):
  la rete che cade non rifà un'accettazione. Non si ricordano quelle che portano una sessione (entra, codice, link,
  azienda) né `carica`.
- Il controllo del portale in prova fa la GET solo verso un indirizzo di questo computer (le prove non vanno su
  internet); sul NAS ogni ora, solo se il giro del portale è configurato.

**Le sei richieste di Wisper Ufficio (01/11/2026)**
- `portale.pubblicazione`: preventivo (`preventivi`, `preventivo`), rapportino, fattura (`fatture`, `fattura`) e documento
  (`documenti`, `documento`) hanno nell'oggetto `portale` l'id della pubblicazione aperta (numero, `null` se non è nel
  portale). Prima il server lo toglieva: ora "Togli dal portale" manda `togliDalPortale {id: portale.pubblicazione}`
  senza cercarlo in `pubblicati`. `pubblicati[]` porta comunque `rif` (scritto anche in §10.1).
- `portaleCliente.caricamenti[]` = le stesse righe di `caricamentiPortale` (stessa funzione nel server): `id`, `titolo`,
  `nome`, `byte`, `referente`, `creato`, `stato`, `idCliente`, `cliente`, `ticket` (`{id, numero}` o `null`), `nota`,
  `per`, `idSede`, `motivo`, `file {id, url}`, `idDocumento`.
- Registro: `registro {tabella: "portale"}` vale per la tabella `portale` e per tutte le `portale_*`
  (`portale_pubblicazioni`, `portale_link`, `portale_caricamenti`...). Gli altri nomi restano confronti esatti.
- `pubblica {..., prima: true}` = "Pubblica anche quelli di prima" (§8.1, §8.3): la pubblicazione nasce con
  `senza_avviso`, quindi **nessuna email d'avviso** ai referenti (vale anche il nome `senzaAvviso: true`). Il resto è
  uguale (controlli, `vedranno`, Annulla). Prova in `server/prove/comunicazioni.test.js`.
- Telefonata in entrata: `salvaMessaggio` con `canale` `telefonata` o `nota` e `direzione: "entrata"` scrive **`stato:
  "ricevuto"`** (statoVisto "Ricevuto", come i messaggi del cliente di §9.1), qualunque `stato` mandi l'app (anche
  "mandato"). In uscita resta `mandato` di base; `stato: "ricevuto"` senza `entrata` → "Stato: preparato o mandato". Il
  WhatsApp resta sempre in uscita.
- `accessiPortale {gruppo}`: `gruppo` è il nome del filtro (§10.1: `tutti`, `entrati`, `azioni`, `errori`). Per chi
  avesse già usato `azione`, il server lo accetta ancora se è un gruppo o un'azione del registro del portale.
