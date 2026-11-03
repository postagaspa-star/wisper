# Ricerca per la fase 8: integrazioni, amministrazione completa e controlli finali

Appunti della ricerca fatta il 22/10/2026 prima di scrivere [`fase8.md`](fase8.md). Ogni punto ha la fonte; dove una pagina
non si apriva o non diceva una cosa è scritto **non verificato**. Le citazioni sono brevi; il resto è riassunto con parole
nostre. Dove la fase 4, 5 o 7 aveva già fatto la ricerca (Tailscale, WhatsApp, Gmail del postino, file picker di
OneDrive, programmi di fatturazione) qui c'è il rimando e solo quello che è cambiato o che mancava. Le scelte che ne
nascono sono in `fase8.md` §2-§3.

## 1. I servizi esterni: cosa servirebbe, costi, termini, rischi

### 1.1 Microsoft 365 (OneDrive, SharePoint, Outlook) con Microsoft Graph

- **Sfogliare OneDrive e SharePoint** da un'app vuol dire usare il selettore di file (File Picker v8) su Microsoft Graph:
  serve **un'applicazione registrata in Microsoft Entra** nel Microsoft 365 di Manuel e, a volte, **il consenso di un
  amministratore** la prima volta. Graph non costa niente in più dell'abbonamento. Già trovato nella fase 5:
  https://learn.microsoft.com/onedrive/developer/controls/file-pickers (vedi `ricerca-fase5.md` §3).
- **Durata delle chiavi**: un refresh token di Microsoft dura di base **90 giorni** per le app normali e **24 ore** per le
  app che girano come pagina web (SPA), dove la durata non si allunga rinnovandola: ogni giorno serve rifare l'accesso
  (di solito senza che la persona se ne accorga). https://learn.microsoft.com/en-ca/entra/identity-platform/refresh-tokens ·
  https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes
  Per Wisper vuol dire: una chiave sul NAS che legge i file di Manuel, da rinnovare, e un accesso da rifare se resta ferma.
- **Avvisi dei cambiamenti** (per sapere quando cambia un file o un appuntamento): Graph li manda solo a un indirizzo
  **pubblico, in HTTPS**; "se l'indirizzo non è pubblico, Microsoft Graph non manda gli avvisi". Risposta entro 3 secondi,
  altrimenti gli avvisi si possono perdere e non si recuperano.
  https://learn.microsoft.com/lt-lt/graph/change-notifications-delivery-webhooks
  Per Wisper: una sincronizzazione a due vie con Outlook vorrebbe un'altra porta del server su internet (o un controllo
  periodico, più lento e più pesante).
- **Calendari pubblicati (ICS) in Outlook**: un calendario aggiunto "da internet" lo legge il **server di Microsoft**, con
  i suoi tempi: di solito ogni 3-4 ore, a volte fino a 24; nel nuovo Outlook e sul web non c'è un "aggiorna adesso"
  (moderatore Microsoft Q&A, non documentazione ufficiale). Nel classico Outlook la voce "Da Internet", nel nuovo
  "Iscriviti dal Web". https://learn.microsoft.com/en-us/answers/questions/2284712/outlook-ics-calendar-sync-not-reflecting-new-event ·
  https://learn.microsoft.com/en-us/answers/questions/5956480/classic-outlook-internet-calendar-subscription-not ·
  https://support.microsoft.com/office/098ed60c-936b-41fb-83d6-7e3786437330
  Se anche il classico Outlook con un account Microsoft 365 legga il feed dal computer o dal server **non è verificato**:
  va provato. Conseguenza: un indirizzo che si apre solo dentro il tailnet **non** si può dare a Outlook di Microsoft 365.
- **Mandare le email dalla posta di Manuel** (al posto del Gmail del postino): Exchange Online permette **10.000
  destinatari al giorno** per casella; il limite di 30 messaggi al minuto vale solo per l'invio SMTP; con Graph valgono i
  limiti di Graph (10.000 richieste ogni 10 minuti per app e casella, 4 richieste insieme). Fonti: risposte Microsoft Q&A e
  tabelle di università che riportano i limiti di Exchange Online (**pagina ufficiale non aperta**).
  https://learn.microsoft.com/en-us/answers/questions/2258712/what-is-the-maximum-number-of-emails-that-can-be-s ·
  https://learn.microsoft.com/en-us/answers/questions/1730503/when-sending-emails-using-microsoft-graph-api-what ·
  https://northcentral.teamdynamix.com/TDClient/1980/Portal/KB/ArticleDet?ID=70527
  Per mandare posta da un server senza persona davanti serve il permesso "Mail.Send" dell'applicazione, che di base vale
  per tutte le caselle dell'organizzazione se non lo si restringe (**da verificare** come si restringe nel suo tenant).

### 1.2 Google Drive e Google Calendar

- **Drive API**: gratuita entro le quote (le cifre delle quote le abbiamo trovate solo su una guida di terzi: **non
  verificato**). Le autorizzazioni (scope) di Drive sono di tre livelli: **non sensibili** (verifica semplice),
  sensibili, **riservate** (verifica riservata, e se i dati passano o restano su un server serve una **valutazione di
  sicurezza** fatta da terzi). Google consiglia `drive.file`, che vede solo i file creati dall'app o **scelti dalla
  persona col Google Picker**, ed è esente da verifica riservata e valutazione.
  https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- **App "in prova" (Testing)**: i refresh token di un'app non pubblicata **scadono dopo 7 giorni**; per toglierlo
  bisogna pubblicarla, e con scope sensibili o riservati passare la verifica di Google.
  https://developers.google.com/health/setup · https://www.unipile.com/google-oauth-refresh-token/ (fonte di terzi)
- **Il Google Picker è JavaScript per pagine web**: dentro l'app Android e in Wisper Ufficio si dovrebbe aprire una pagina
  web apposta (in Wisper Ufficio c'è WebView2). Che funzioni bene dentro una WebView di Android **non è verificato**.
- **Abbonarsi a un calendario da URL** in Google Calendar: lo legge **il server di Google**, quindi l'indirizzo deve essere
  pubblico; l'aggiornamento non si sceglie e non si forza: le guide dicono da 8 a 24 ore, "fino a 12 ore" secondo un
  centro assistenza di terzi; pagina ufficiale di Google **non trovata**.
  https://kb.wisc.edu/education/154693 · https://knowledge.cheqroom.com/helpcenter/how-often-does-google-update-its-calendar-feeds
- **Google Calendar API** (sincronizzazione a due vie): gli avvisi dei cambiamenti vanno a un **indirizzo HTTPS** che li
  riceve; i canali scadono e vanno rinnovati. https://developers.google.com/calendar/v3/push · Che `calendar.events` sia
  uno scope "sensibile" (quindi verifica) **non è verificato** su una pagina Google.
- **Google Workspace** (per avere l'accordo sul trattamento dei dati al posto del Gmail gratuito): Business Starter
  **6,80 € a utente al mese** col piano annuale, **8,10 €** col piano flessibile (tabella del centro assistenza Google,
  senza data; altre fonti dicono 5,75 € l'annuale: **da ricontrollare** sulla pagina dei prezzi).
  https://knowledge.workspace.google.com/admin/billing/compare-flexible-and-annual-fixed-term-payment-plans?hl=it ·
  https://www.punto-informatico.it/google-workspace-business-starter/ · L'accordo (DPA) di Workspace e l'assenza di un
  accordo trovato per il Gmail gratuito: `ricerca-fase7.md` §4.

### 1.3 Notifiche immediate sul telefono (Firebase Cloud Messaging)

- FCM non costa niente (descrizioni di terzi; listino Google non aperto). L'invio dal server usa l'**API HTTP v1** con
  OAuth 2.0 e una **chiave di un account di servizio** (file JSON scaricato dalla console Firebase); le vecchie API con la
  chiave del server sono state tolte. https://firebase.google.com/docs/cloud-messaging/send/v1-api?hl=ko ·
  https://www.esegece.com/products/websockets/docs/http/google-fcm.html
- Sul telefono: "FCM clients require devices running Android 7.0 or higher that also have the Google Play Store app
  installed"; l'app non deve per forza passare dal Play Store. https://firebase.google.com/docs/cloud-messaging/android/client
- Per Wisper: un progetto Google in più, una chiave sul NAS, il contenuto della notifica che passa da Google. Il controllo
  ogni 15 minuti della fase 7 non chiede niente di questo.

### 1.4 WhatsApp Business Platform

Niente di nuovo rispetto a `ricerca-fase7.md` §3: a messaggio, per l'Italia circa 0,036 $ un "utility" e 0,08 $ un
"marketing" (fonti di terzi), messaggi di servizio gratis fino a 1.000 al mese dal 1/10/2026, un webhook pubblico per i
messaggi in arrivo, modelli approvati, verifica dell'azienda. La decisione 7 resta: messaggio pronto, lo manda Manuel.

### 1.5 La banca (open banking PSD2)

- **GoCardless Bank Account Data** (l'ex Nordigen, gratis per anni per leggere i conti): **chiuso alle iscrizioni nuove**;
  chi c'era continua, i progetti nuovi no (guida aggiornata a giugno 2026 e un articolo di sviluppatori; la pagina di
  GoCardless non si è aperta: **non verificato di prima mano**).
  https://www.openbankingtracker.com/guides/free-open-banking-apis ·
  https://dev.to/johnfrandsen/gocardless-bank-account-data-alternatives-what-to-use-when-signups-are-disabled-326d
- **Enable Banking**: una modalità gratuita "ristretta" che legge **solo i conti collegati da sé**; la produzione vera è a
  contratto, con prezzi non pubblicati (a volume). Copre oltre 2.500 banche in 29 paesi; l'elenco delle banche italiane
  **non verificato**. https://docs.firefly-iii.org/tutorials/data-importer/eb/ ·
  https://www.openbankingtracker.com/guides/free-open-banking-apis
- **Il consenso si rinnova**: le norme tecniche europee (RTS sull'autenticazione forte, modificate dall'EBA nel 2022)
  hanno portato il rinnovo dell'accesso di un servizio di informazione sui conti **da 90 a 180 giorni**: ogni sei mesi
  Manuel dovrebbe rifare l'accesso con la banca. https://www.eba.europa.eu/publications-and-media/press-releases/eba-publishes-final-report-amendment-its-technical-standards ·
  https://paytechlaw.com/en/regulatory-technical-standards-rts-sca-csc/
- Per Wisper: un fornitore in più che vede tutti i movimenti del conto, un contratto, il rinnovo semestrale; e la
  decisione 6 di Andrea è "solo scadenziario". Resta **Non collegato**.

### 1.6 Lo SDI e i programmi di fatturazione

- **Aruba Fatturazione Elettronica, API**: carica XML (anche non firmati, li firma Aruba se ci sono le credenziali), cerca
  le inviate e le ricevute, legge le notifiche dello SDI. Accesso con nome e password, token di 30 minuti; limiti per IP e
  per "tier"; i servizi sono "available to Premium users or basic users connected to them by proxy". Prezzo del Premium
  **non trovato** (il piano base costa circa 29,90 € + IVA l'anno secondo una guida, forse non aggiornata).
  https://fatturazioneelettronica.aruba.it/apidoc/docs_EN.html ·
  https://www.aranzulla.it/come-funziona-la-fatturazione-elettronica-di-aruba-1121876.html
- **Fatture in Cloud (TeamSystem)**: ha un'area sviluppatori con OAuth 2.0 (anche "device code", adatto a un server senza
  schermo) e app private create dalle impostazioni dell'account. Se l'API sia compresa in ogni piano **non verificato**.
  Piani da 4 € a 51 € al mese; nella prova gratuita la fatturazione elettronica non c'è.
  https://developers.fattureincloud.it/docs/basics/authentication · https://www.fattureincloud.it/costo/ ·
  https://ottokit.com/docs/connect-fatture-in-cloud-with-ottokit/
- **Intermediari "solo API"** (Openapi, Invoicetronic, A-Cube): Openapi nel 2020 diceva 0,10 € a fattura (vecchio); oggi
  Legalinvoice GO! 19,70 € + IVA l'attivazione e 7,50 € + IVA per 50 fatture in più. Invoicetronic: API REST per mandare e
  ricevere dallo SDI, prezzi **non trovati**. https://openapi.it/en/blog/italian-sdi-connection-made-easy.html ·
  https://openapi.it/en/digital-trust/legalinvoice · https://github.com/invoicetronic/php-sdk
- Danea Easyfatt e gli altri programmi da computer: nessuna API trovata (già in `ricerca-fase4.md` §3).
- Per Wisper: la decisione 5 resta (prepara Wisper, emette il programma di Manuel). Un collegamento diretto ha senso
  **solo col programma che Manuel usa davvero** (domanda aperta dalla fase 4): con Fatture in Cloud si potrebbe creare la
  bozza nel suo programma invece di copiarla, come uscita nuova di `fase4.md` §8.4.

### 1.7 DURC, paghe, Ispettorato

- **DURC On Line**: dal 1/10/2021 si entra solo con SPID, CIE o CNS, ed è per i soggetti indicati dal DM 30/01/2015
  (amministrazioni, stazioni appaltanti, gestori di servizi pubblici e altri legittimati). Nessuna API per un privato
  trovata. https://www.segretaricomunalivighenzi.it/11-10-2021-durc-on-line-indicazioni-operative-per-laccesso-tramite-spid-cie-e-cns/11/10/2021/ ·
  https://ragusa.ance.it/2021/10/05/circolare-n-452-c-2021-inail-durc-on-line-accesso-ai-servizi-tramite-spid-cns-e-cie/?print=pdf
- **Programmi paghe** dei consulenti: nessun formato comune trovato; l'esportazione CSV della fase 6 resta la strada.
- **Comunicazione all'Ispettorato** per gli occasionali: si fa dal portale dell'Ispettorato (fase 6), nessuna API cercata
  oltre.

### 1.8 Accesso da fuori e portale

Niente di nuovo rispetto a `ricerca-fase7.md` §2.4-2.5: Tailscale gratis solo per uso non commerciale, **Standard 8 $ a
utente al mese**; Cloudflare Tunnel gratis con un dominio nuovo (circa 5-12 € l'anno), che però vede il traffico.
Una cosa in più utile al controllo dello stato: quando Tailscale Serve inoltra una richiesta dal tailnet aggiunge le
intestazioni con chi la fa (`Tailscale-User-Login`, `Tailscale-User-Name`), e sul traffico che arriva da internet con
Funnel mette `Tailscale-Funnel-Request`. https://tailscale.com/kb/1312/serve
Così il server sa, senza chiedere niente a nessuno, se una richiesta è arrivata dal tunnel e se è arrivata da internet.

## 2. Il formato ICS (iCalendar)

- **RFC 5545**: righe che finiscono con CRLF, lunghe al massimo 75 byte (si "piegano" con un CRLF e uno spazio), senza
  spezzare un carattere UTF-8 a metà; `VCALENDAR` con `VERSION:2.0` e `PRODID`; ogni `VEVENT` ha `UID` e `DTSTAMP`.
  https://icalendar.org/iCalendar-RFC-5545/3-1-content-lines.html · https://www.iana.org/assignments/icalendar/icalendar.xhtml
- **Giorni interi**: `DTSTART;VALUE=DATE:20261023` e la fine **esclusa** (`DTEND` il giorno dopo).
  https://qrkit.hexdocs.pm/qrkit/content.html (fonte di terzi; dalla RFC 5545 §3.6.1)
- **Pratiche consigliate** della RFC (§5): `TZID` con il suo `VTIMEZONE`, ora UTC per `DTSTAMP`.
  https://icalendar.org/iCalendar-RFC-5545/5-recommended-practices.html
- Proprietà del calendario della RFC 7986 (`NAME`, `REFRESH-INTERVAL`, `COLOR`) e quelle di fatto (`X-WR-CALNAME`,
  `X-PUBLISHED-TTL`) registrate o diffuse: https://www.iana.org/assignments/icalendar/icalendar.xhtml
- **Chi legge il feed e da dove**:
  - Google Calendar e Outlook di Microsoft 365: dal **loro server** (§1.1, §1.2): indirizzo pubblico, aggiornamento lento;
  - **ICSx⁵** su Android: app libera (GPL-3.0) che si abbona a un feed `webcal`/`https` **dal telefono** e mette gli
    eventi nel calendario del telefono, a sola lettura, con l'intervallo scelto. Gratis su F-Droid; sul Play Store a
    pagamento, circa 2 € secondo un forum (**prezzo non verificato**). https://f-droid.org/packages/at.bitfire.icsdroid/ ·
    https://apt.izzysoft.de/fdroid/index/apk/at.bitfire.icsdroid?repo=main ·
    https://www.computerbase.de/forum/threads/offline-android-kalender-app.2089368/
  - Con ICSx⁵ il feed può restare **dentro il tailnet** (il telefono ha Tailscale acceso): niente porte nuove, niente dati a
    Google o Microsoft.
- Google limita i feed a 30 giorni indietro e 365 avanti secondo una fonte di terzi (**non verificato**).
  https://knowledge.cheqroom.com/helpcenter/how-often-does-google-update-its-calendar-feeds

## 3. Cercare dentro i file senza dipendenze

- **Prova fatta oggi sul PC di Andrea**: Node 24.12.0, `node:sqlite` con SQLite **3.50.4**; `PRAGMA compile_options` dice
  `ENABLE_FTS3`, `ENABLE_FTS5`, `ENABLE_MATH_FUNCTIONS`. Una tabella `fts5` con `tokenize='unicode61 remove_diacritics 2'`
  trova "perché" cercando "perche". Quindi la ricerca a testo pieno c'è già, senza pacchetti npm. (Da rifare sul NAS
  con l'immagine Docker vera: stessa versione di Node.) Documentazione: https://sqlite.org/fts5.html
- FTS5 nell'amalgama di SQLite è spento di base e lo si accende in compilazione: per questo va controllato con
  `PRAGMA compile_options` all'avvio, e se manca la ricerca dentro i file si spegne da sola (stato "Errore" nella pagina
  Integrazioni) invece di rompere il server. https://sqlite.org/forum/forumpost/a9d514c14a26702d?raw
- **Formati**: DOCX, XLSX, PPTX, ODT e ODS sono archivi ZIP con XML dentro (Wisper ha già un lettore ZIP per gli xlsx,
  `server/strumenti/xlsx.js`); DXF è testo; i PDF col testo si leggono aprendo i flussi compressi con `node:zlib`, ma
  i PDF con caratteri incorporati senza tabella di conversione danno testo illeggibile e le scansioni non hanno testo
  (servirebbe l'OCR, non previsto). Valutazione nostra, non una fonte.

## 4. Lista di controllo di rilascio

Fonti per lo più di aziende che vendono servizi: buone come traccia, non come norma.
- Prima del rilascio: una **copia fresca con chi la sa ripristinare** raggiungibile; copie, ripristino e ripresa dopo un
  guasto **provati**; una decisione **va / non va** con chi decide; il rilascio fatto con lo script, annotando versione,
  chi e quando; dopo, prove "di fumo" (accesso, salute, i percorsi principali) e 24-48 ore di sorveglianza; scritto prima
  cosa fa scattare il ritorno indietro. https://attractgroup.com/blog/software-deployment-checklist/ ·
  https://playcode.io/blog/production-readiness-checklist · https://titanapps.io/blog/release-readiness-checklist ·
  https://docs-previous.pega.com/pega-express/go-live-readiness
- "Un modulo non è completo perché compare nel menu" è già nelle specifiche §7: la lista di Wisper chiede, per ogni
  modulo, salvataggio, modifica, recupero, ricerca e permessi provati davvero.

## 5. Migrazione dei dati con ritorno indietro

- **Prova generale** ("mock cutover"): il più vicino possibile al cambio vero, **con gli stessi dati, strumenti e persone**.
  https://learn.microsoft.com/dynamics365/guidance/implementation-guide/prepare-go-live-cutover-strategy
- **Decisione va / non va** presa da una persona con **criteri scritti prima** (problemi aperti accettabili, come si
  aggirano); la prova dei tempi, il confronto dei numeri della prova, il blocco delle modifiche confermato.
  https://learn.microsoft.com/dynamics365/guidance/implementation-guide/prepare-go-live-cutover-strategy ·
  https://dev.to/michaelnocito/stage-7-freeze-cutover-bridge-14ac ·
  https://keyholesoftware.com/wp-content/uploads/Data-Migration-Executive-Checklist.pdf
- **Il piano di ritorno** fa parte del piano; l'ultima copia del sistema vecchio è il punto a cui tornare. Avviso: tornare
  indietro diventa difficilissimo appena si lavora nel sistema nuovo, perché il vecchio non ha quello che è nato dopo.
  https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html ·
  https://dev.to/michaelnocito/stage-7-freeze-cutover-bridge-14ac
  Per Wisper questo problema è già in parte risolto: il server **riscrive ogni notte il foglio** (architettura §7), quindi
  il foglio resta un punto di ritorno aggiornato per rapportini, clienti e commesse.
- **Blocco delle scritture** durante il cambio: nessuna scrittura nuova nel sistema vecchio mentre si copia.
  https://docs.aws.amazon.com/prescriptive-guidance/latest/best-practices-migration-cutover/cutover-stage.html ·
  https://www.namossolutions.com/wp-content/uploads/2024/02/15-Things-Every-Cutover-Plan-Must-Consider-Going-Live-in-Style-Part-2-C-5.pdf
- Prove tecniche e prove di lavoro sono due cose: la prima misura i tempi e prova il ritorno, la seconda prova il lavoro
  vero. https://engineering.deloitte.com.au/articles/11-essential-items-for-a-cut-over

## 6. Accessibilità di base

- WCAG 2.2 (raccomandazione W3C dal 5/10/2023): nuovi criteri tra cui **2.5.8 Dimensione dei bersagli (minimo, AA)**:
  almeno 24 × 24 px CSS o abbastanza spazio intorno; **2.4.11 Focus non nascosto (AA)**; 3.3.8 Autenticazione accessibile
  (AA); 3.3.7 Inserimento ridondante (A). Il contrasto del testo 4,5:1 (1.4.3) non cambia; 4.1.1 è stato tolto.
  https://w3.org/WAI/standards-guidelines/wcag/new-in-22/ · https://dequeuniversity.com/resources/wcag-2.2
- Wisper chiede di più (tocchi ≥ 48 dp, `docs/aspetto.md`); la lista di controllo usa questi criteri come minimo
  verificabile sul computer.

## 7. Prova di carico: quanto regge SQLite

- "Generally speaking, any site that gets fewer than 100K hits/day should work fine with SQLite", ed è una stima
  prudente; un database arriva a 281 TB. https://www.sqlite.org/whentouse.html
  Uno studio di 2-5 persone fa poche migliaia di richieste al giorno: il limite vero sarà il NAS (CPU, disco) e il
  tempo delle pagine con dieci anni di dati, che si misura con la prova di carico di `fase8.md` §11.5.

## 8. Copie sul NAS

- Hyper Backup di Synology: copie con le versioni, ripristino da più momenti, pianificazione; destinazioni: cartelle del
  NAS, dischi esterni, un altro NAS, server rsync, Synology C2 (a pagamento); registro delle copie esportabile.
  https://www.synology.com/en-eu/dsm/7.2/software_spec/hyper_backup
  Come provi l'integrità di una copia e con che frequenza **non verificato** (pagina del centro assistenza non aperta).
  Per i file oltre 25 MB che restano solo sul NAS (fase 5 domanda 6) resta la strada di un'impostazione del NAS fatta da
  Andrea, fuori da Wisper.

## 9. Cosa resta da verificare con una prova vera

- Se il classico Outlook con Microsoft 365 legge un feed ICS dal computer (allora basterebbe il tailnet) o dal server.
- Il prezzo attuale di ICSx⁵ sul Play Store e se Manuel preferisce F-Droid.
- Il prezzo di Google Workspace Business Starter oggi (5,75 € o 6,80 € l'anno a utente).
- Se l'API di Fatture in Cloud (o del programma che usa Manuel) è compresa nel suo piano.
- FTS5 nell'immagine Docker del NAS (`PRAGMA compile_options` all'avvio, come scritto in `fase8.md` §6).
