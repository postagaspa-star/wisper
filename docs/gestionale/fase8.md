# Fase 8: integrazioni, amministrazione completa e controlli finali (accordo e schermate)

Si aggiunge ad [`architettura.md`](architettura.md), [`fase1-schermate.md`](fase1-schermate.md) e agli accordi delle fasi
2-7 ([`fase2.md`](fase2.md) … [`fase7.md`](fase7.md)), che restano validi. Ricerca e fonti in
[`ricerca-fase8.md`](ricerca-fase8.md). Prototipo: [`docs/prototipo/Gestionale-fase8.html`](../prototipo/Gestionale-fase8.html)
(in alto: Telefono / Computer / Tutti e due, quattro persone, chiaro e scuro; `#prova` fa la prova automatica).

È **l'ultima fase**. Chi costruisce server, app Android e Wisper Ufficio legge **solo** questo file (più l'architettura e
le fasi da cui dipende): se qualcosa manca o non torna, lo dice invece di inventare. Le parole delle schermate sono quelle
scritte qui, uguali su telefono e computer. La migrazione è la **008** e viene dopo la 007 della fase 7.

Questa fase ha tre lavori diversi, e ognuno vale da solo:
1. **Integrazioni** (modulo 17): un elenco unico di tutto quello che le fasi 1-7 hanno lasciato "Non collegato" o
   "fase 8", con costi, rischi e proposta; una pagina che dice **lo stato vero** di ogni collegamento; e il progetto
   completo delle sole integrazioni da fare adesso.
2. **Amministrazione completa** (modulo 18): solo quello che manca rispetto alle specifiche, senza rifare quello che c'è.
3. **Controlli finali** (specifiche §6-§7): la lista di controllo che dice "il gestionale è completo" modulo per modulo, e
   **il passaggio dei dati veri**: la prova generale e la sera del cambio con Manuel, col ritorno indietro.
In più la **Dashboard**: le voci di sette fasi messe insieme non stanno più in una pagina; qui le regole per combinarle.

## 0. Dopo le scelte del 31/10 e dell'01/11/2026 (vale sopra al resto di questo accordo)

Questo accordo è del 22/10. Il 31/10 Andrea ha scelto **Google come porta d'ingresso** (`porta-google.md`: le app parlano
con lo script del foglio, il NAS va a prendere il lavoro, nessuna porta aperta a casa) e vuole **tutto gratuito**;
l'01/11 il portale della fase 7 è stato costruito su **Netlify + uno script Google del portale a parte** (`fase7.md` §0).
La domanda 1 di §17 è chiusa. Tutto quello che qui sotto parla di tailnet, Tailscale, Serve, Funnel, porte 8401 e 8443,
Cloudflare, dominio o "ingresso" si legge con questa sezione; dove non torna, vale questa.

### 0.1 L'elenco (§3.1 e §3.4)

| # | Prima | Adesso |
|---|---|---|
| 4 | Accesso da fuori: tailnet, 8 $ al mese | **Fatto** con la porta Google (fase 6), **0 €**. Si accende coi passi di Andrea: `Porta.gs` nello script del foglio e `WISPER_PORTA_GOOGLE=si` nel `.env` del NAS (dall'01/11 sul NAS c'è `no`, perché lo script vero non ha ancora `Porta.gs`) |
| 5 | Portale: Funnel o Cloudflare | **Fatto** (fase 7 §0), **0 €**; si accende coi passi di Andrea di fase 7 |
| 6 | Link che scade: con l'ingresso | **Fatto** col portale (`#/condiviso/<token>`, fase 7) |
| 7 | Ponte del cambio: Funnel sulla 8443 | **Fatto** con la porta Google: proprietà `PONTE_PORTA = si` (`porta-google.md` §12), **0 €** |
| 9 | Abbonamento dal telefono, nel tailnet | in casa, diretto al NAS (§0.3) |
| 10 | Abbonamento da Google Calendar/Outlook: con l'ingresso | **Andrea** (domanda 4), **0 €**: lo stesso indirizzo "anche fuori casa" di §0.3 |

Il resto dell'elenco non cambia. **Costi di questa fase: 0 €**, comprese le risposte che prima costavano (4, 5, 7, 10).

### 0.2 I controlli (§4.2, §4.3, §8.7, §9.8, §12.3, §13.7)

- Il controllo `tailnet` diventa **`porta`**, "Accesso da fuori casa (porta Google)". Guarda, non chiede: lo stato di
  `w.porta` (porta.js) e l'ultima richiesta arrivata dalla porta (provenienza `google`): "Ultimo accesso da fuori casa:
  oggi alle 9:58, telefono di Manuel". **Collegato** = l'ultimo giro verso lo script è riuscito negli ultimi 10 minuti;
  **Da configurare** = mancano `WISPER_POSTINO_URL` o `SEGRETO_SERVER`, oppure c'è `WISPER_PORTA_GOOGLE=no` ("Spenta nel
  `.env` del NAS"); **Errore** = la regola di §4.1 (due giri di fila falliti). La colonna `sessioni.tailnet` di §12.3 si
  chiama `sessioni.da_fuori` (quando quella sessione è arrivata l'ultima volta dalla porta); niente `Tailscale-User-Login`
  in §13.7.
- `internetinterno` resta, con due motivi d'Errore: (a) una richiesta sulla 8400 con `Tailscale-Funnel-Request` o
  `X-Forwarded-For`; (b) **una richiesta arrivata sull'ingresso interno 8402** (il contenitore `wisper-ingresso` del
  22/10, che con la porta Google resta spento). Frase della voce urgente (§8.7) e della scheda di Sicurezza (§9.8): "Una
  richiesta è arrivata da internet sull'ingresso del NAS il 21/10 alle 3:12: con la porta Google l'ingresso va spento",
  collegamento ad Amministrazione › Sicurezza. AllowFunnel non si nomina più.
- `portale`: lo stato del portale di fase 7 §0.5 (`portale {}`: `attivo`, `collegato`, `controllatoIl`) al posto di
  `GET {PORTALE_INDIRIZZO}/portale/salute`. Da configurare finché mancano `WISPER_PORTALE_URL` e `SEGRETO_PORTALE`.
- §4.3, gruppo **Collegati a Wisper**: 1-3, 4 (`porta`), 5-7 (portale, link, ponte), 8, 9, 14. 4-7 stanno **Da
  configurare** finché Andrea non fa i passi; non sono più "Dipendono da una scelta".
- §9.8, "Due passaggi per entrare": da fuori casa ora si entra con la password di Wisper attraverso lo script del foglio,
  il cui indirizzo è segreto (mai in pagine, file pubblicati o GitHub) e con i limiti ai tentativi della provenienza
  `google`. Il codice sul telefono resta fuori da questa fase, ma è la prima cosa da fare se quell'indirizzo finisse in
  giro: scritto così in pagina.

### 0.3 Il calendario (§5)

- **In casa** (di base): `http://<server>/calendario/<chiave>.ics` sulla 8400, come §5.5, con l'indirizzo che nasce dallo
  schema e dall'`Host` della richiesta che crea il feed. In §5.1 e §5.6 "fuori casa si aggiorna se il tailnet è acceso"
  diventa: "si aggiorna quando il telefono è in casa; fuori casa resta l'ultima lettura".
- **Anche fuori casa** (la terza strada, domanda 4, **spenta di base**): passa dallo **script del portale**, il cui
  indirizzo è già pubblico per costruzione (quello del foglio non deve finire nei calendari).
  - `GET <script del portale>?calendario=<chiave>`: il `doGet` di `PortaleClienti.gs` mette in coda
    `{tipo: "portale", strada: "calendario", metodo: "GET", corpo: {chiave}}` (stessa coda e stessi controlli di forma);
    il router del portale lo passa a `calendario.js`, che risponde `{ok, stato, ics}`; lo script restituisce il testo
    con `MimeType.ICAL`. Apps Script non sa mandare ETag, 304, 404 o 429: senza `ics` lo script risponde il testo
    "Indirizzo del calendario non valido" (uguale per chiave sconosciuta, tolta, utente disattivato, troppe letture,
    calendario spento).
  - Risponde **solo** per i feed con `pubblico` e solo con `CALENDARIO_PUBBLICO = true`, che può accendere chi ha
    `amministrazione` 2 e solo se il portale è Collegato. 60 letture all'ora per chiave anche qui.
  - `nuovoFeed {pubblico: true}` risponde con `indirizzo` = `<WISPER_PORTALE_URL>?calendario=<chiave>` e `webcal` uguale
    con `webcal://`. L'indirizzo dello script del portale non è segreto (sta nella pagina del portale), ma resta fuori dai
    dati di prova e dalle schermate. Errore: "Il calendario fuori casa non è acceso". La casella si chiama "Anche fuori
    casa (passa da Google)" e nasce senza dettagli (§5.5).
- Le prove della strada fuori casa si fanno col finto Google in modo portale (`WISPER_PROGETTO=portale`), mai con
  quello vero. `http://10.0.2.2:<porta>/calendario/<chiave>.ics` per l'emulatore resta.

### 0.4 Il passaggio dei dati (§10, §11)

- **19:45** della sera del cambio: invece di `SERVER_URL`, Andrea mette **`PONTE_PORTA = si`** nelle proprietà dello script
  del foglio (`porta-google.md` §12). Prima deve essere accesa la porta: `Porta.gs` nello script, `WISPER_POSTINO_URL`,
  `SEGRETO_SERVER` e `WISPER_PORTA_GOOGLE=si` nel `.env`. Le versioni 0.4.0 passano dalla coda per 4 settimane. Se la
  porta non è accesa vale il ramo "Senza ingresso" di §10.5 (le 0.4.0 tengono i rapportini in coda). Il postino riscrive
  il foglio ogni notte (serve al ritorno indietro).
- Ritorno **B**, punto 3: si toglie `PONTE_PORTA` (lo script torna a lavorare sul foglio). §10.7, fine della quarta
  settimana: `PONTE_PORTA = no`.
- `M15.2` di §11.2: "Dal telefono in 4G: la pagina del portale su Netlify si apre e risponde; il NAS non ha porte aperte",
  a mano (Andrea), **in attesa** finché il portale non è acceso.

### 0.5 Domande e prove (§16, §17)

- §17: la **1** è chiusa (Google, 31/10). La **4** diventa: "**file e abbonamento in casa** (consiglio: 0 €, niente dati a
  Google o Microsoft) oppure **anche fuori casa e per Google Calendar e Outlook**, dallo script del portale (0 €; gli
  appuntamenti passano da Google, di base senza dettagli)". Le altre restano. Chi costruisce fa la raccomandazione (la
  prima) e, dove l'accordo lo prevede, lascia l'altra come impostazione: cifratura della copia costruita e **spenta**,
  funzioni accese costruite, riquadri a scelta costruiti, calendario fuori casa costruito e spento.
- §16: resta la prova con `Tailscale-Funnel-Request` sulla 8400 e se ne aggiunge una sull'ingresso 8402. "Feed pubblico
  solo sulla 8401" diventa "feed pubblico fuori casa solo dallo script del portale (finto Google) e solo con
  `CALENDARIO_PUBBLICO`; in casa, sulla 8400, un feed pubblico risponde come gli altri". "Se il classico Outlook legge un
  feed dal computer (allora basta il tailnet)" diventa "(allora l'abbonamento in casa basta anche sul computer)".

## 1. Cosa consegna

- **17 Integrazioni**:
  - l'**elenco unico** di 26 collegamenti con cosa servirebbe, costi coi numeri (e l'alternativa gratuita), rischi per i
    dati, termini di servizio e la proposta per ognuno (§3);
  - la **pagina Integrazioni** con lo stato vero di ognuno (**Collegato**, **Da configurare**, **Errore**, **Non
    collegato**, più **In corso** mentre un controllo gira) e la data dell'ultimo controllo, nata da **controlli che il
    server fa davvero** (§4), e la storia dei controlli;
  - **fatte adesso**, perché gratuite, senza porte nuove su internet e senza chiavi di altri: il **calendario in formato
    ICS** (file da scaricare e indirizzo d'abbonamento dentro il tailnet, §5), la **ricerca dentro i file** promessa dalla
    fase 5 (§6), **Esporta tutto** e **Importa clienti e fornitori** da un file (§7).
- **18 Amministrazione e impostazioni** completa (§9): **Dati dello studio** col **logo** e il piè di pagina dei PDF;
  **Impostazioni generali** con **tutte** le chiavi delle fasi 1-7 in un posto solo (oggi `APPROVAZIONE`,
  `ORE_GIORNALIERE`, `TICKET_TEMPI` e altre dieci non hanno una schermata); **Funzioni accese**; **Numerazioni** con il
  formato del codice commessa come impostazione (senza ricodificare niente); **Notifiche**; **Sicurezza** (con la copia
  fuori casa cifrata); **Aspetto**; **Copie e ripristino** col **ripristino provato**; **Stato del sistema**.
- **Controlli finali** (§10-§11): la **lista di controllo** dentro Wisper (Amministrazione › Lista di controllo), con
  righe automatiche, righe che il server controlla da solo e righe a mano; la **prova generale** del passaggio dei dati
  con la copia vera del foglio; la **sera del cambio** passo per passo, coi criteri "va / non va" e il **ritorno
  indietro**; la **prova di carico** con dieci anni di dati finti; accessibilità, tema scuro, senza rete, permessi per
  ogni ruolo, privacy.
- **Dashboard** (§8): una cosa una voce sola, ordine fisso, tetti per sezione con **Tutto quello che c'è da fare**,
  raggruppamenti, quattro riquadri per persona, numerini del menu con una regola sola.
- **Tutto su telefono e computer** (decisione 2), con le stesse parole. Le cose che si fanno sul NAS (comandi della sera del
  cambio, ripristino a mano) le fa Andrea dal computer, e Wisper ne tiene la traccia.
- **Costi ricorrenti nuovi: zero.** Quello che costa dipende dalle risposte di Andrea (§17) ed è scritto coi numeri.

## 2. Principi (dalla ricerca)

1. **Lo stato si vede ed è vero** (specifiche §7): "Collegato" solo se l'ultimo controllo vero è riuscito, con data e
   ora accanto; mai una pillola verde scritta a mano. Quello che non c'è ha **Non collegato** e una riga sul perché.
2. **Un collegamento costa anche quando è gratis**: un account in più, una chiave da custodire e rinnovare (90 giorni
   Microsoft, 7 giorni un'app Google non pubblicata), dati che escono, regole di un altro. Si collega solo quello che dà
   un vantaggio chiaro a uno studio di 2-5 persone.
3. **Nessuna porta nuova su internet in questa fase.** Gli avvisi di Microsoft Graph e di Google Calendar vogliono un
   indirizzo pubblico; il feed ICS letto da Google o Outlook di Microsoft 365 pure. Finché Andrea non sceglie l'ingresso
   (fase 7, domanda 1) su internet c'è al massimo il portale.
4. **I formati comuni prima delle API**: ICS per i calendari, CSV per Excel, FatturaPA per le fatture, il link di
   OneDrive per i documenti. Funzionano con tutti, senza chiavi, e non si rompono quando un fornitore cambia.
5. **Una copia mai ripristinata non è una copia**: il server prova da solo l'ultima copia ogni mese, Andrea la ripristina
   davvero ogni tre mesi, e Wisper lo ricorda (decisione 1: "ripristino provato").
6. **Il cambio si prova prima, uguale** (prova generale con gli stessi dati, strumenti e persone), con **criteri scritti
   prima** e una persona che decide; il **ritorno indietro** è scritto e provato; durante il cambio nel vecchio non si
   scrive (Microsoft, AWS: `ricerca-fase8.md` §5).
7. **Una lista di controllo serve se ogni riga si può verificare**: come si prova, chi, quando, esito, e la prova
   allegata (il rapporto delle prove, la schermata).
8. **La Dashboard non cresce coi moduli**: una cosa una voce, ordine fisso, al massimo 7 voci per sezione, il resto in
   una pagina sola. Quello che non è "da fare adesso" sta nella pagina del suo modulo.
9. **Le impostazioni stanno dove si cercano**: raggruppate per lavoro (non per fase), ognuna con la sua schermata.
10. **Si paga solo quello che si dice prima**, coi numeri e con l'alternativa gratuita.

## 3. L'elenco unico delle integrazioni

### 3.1 La tabella

Proposta: **Fatto** (c'è già e funziona), **Adesso** (progettata qui, si costruisce in questa fase), **Andrea** (dipende da
una sua risposta, §17), **Non collegato** (si lascia, col motivo). Le fonti dei numeri sono in `ricerca-fase8.md`.

| # | Collegamento | Da dove | Cosa servirebbe | Costo (alternativa gratuita) | Rischi per i dati | Termini | Proposta |
|---|---|---|---|---|---|---|---|
| 1 | **Postino** (script del foglio: email, copia fuori casa su Drive, foglio riscritto ogni notte, battito) | fase 1, §7; fase 7 §3.1 | c'è | 0 € (Gmail: 100 destinatari al giorno) | email, PDF e copie passano da Google; per il Gmail gratuito nessun accordo sul trattamento trovato | Google | **Fatto**: stato vero in pagina (§4.2); il Gmail gratuito resta una domanda al consulente privacy (§17, domanda 8) |
| 2 | **Verifica della partita IVA** (VIES) | fase 1, §12.5 | c'è | 0 € | parte solo la partita IVA | servizio pubblico UE | **Fatto**: controllo vero una volta al giorno con la partita IVA dello studio |
| 3 | **Aggiornamenti delle app** (release firmate su GitHub) | 0.4.0 | c'è | 0 € | niente dati: le app scaricano | GitHub | **Fatto**: in pagina chi ha una versione vecchia (§9.11) |
| 4 | **Accesso da fuori per lo studio** (tailnet) | decisione 1 | un tailnet dello studio | Tailscale Standard **8 $ al mese** (Personal gratis ma "only suitable for non-commercial use") | nessuno legge il traffico (TLS nel NAS) | Tailscale | **Andrea** (domanda aperta della fase 7) |
| 5 | **Portale su internet** | fase 7 §3.2 | ingresso Tailscale Funnel o Cloudflare Tunnel | A: compreso negli 8 $; B: dominio nuovo **5-12 € l'anno** + Cloudflare gratis | con B Cloudflare vede il traffico | Tailscale o Cloudflare | **Andrea** (stessa domanda) |
| 6 | **Link che scade** per i documenti | fase 5 §5.8 | l'ingresso del portale | come 5 | come 5 | come 5 | **Andrea** (diventa vero col portale) |
| 7 | **Ponte** per le versioni vecchie nelle settimane del cambio | architettura §9, fase 7 §3.1 | che lo script di Google raggiunga `/ponte` | come 4-5 | solo `/ponte` e `/salute` su internet, 4 settimane | come 4-5 | **Andrea**; senza ingresso c'è una strada senza ponte (§10.5) |
| 8 | **Calendario: file ICS** da scaricare | specifiche modulo 5 ("sincronizzazione con calendari esterni") | niente | 0 € | il file lo porta chi lo scarica | standard RFC 5545 | **Adesso** (§5) |
| 9 | **Calendario: abbonamento dal telefono** (ICSx⁵ legge il feed dal telefono, dentro il tailnet) | come 8 | ICSx⁵ sul telefono | **0 €** da F-Droid, circa **2 €** una volta dal Play Store (non verificato) | i dati restano tra NAS e telefono | ICSx⁵: GPL | **Adesso** (§5) |
| 10 | **Calendario: abbonamento da Google Calendar o da Outlook di Microsoft 365** | come 8 | un indirizzo **pubblico**: lo legge il server di Google o di Microsoft (ogni 3-24 ore) | come 5 | titoli, luoghi e clienti degli appuntamenti passano da Google o Microsoft (si può scegliere "senza dettagli") | Google, Microsoft | **Andrea** (domanda 4, dopo la 1) |
| 11 | **Sincronizzazione a due vie** con Google Calendar o Outlook | specifiche modulo 5 e 17 | app OAuth registrata (Google: verifica; app in prova = chiavi di 7 giorni), avvisi su un indirizzo pubblico, regole per i conflitti | 0 € | il calendario dello studio scritto anche fuori; due posti da tenere d'accordo | Google, Microsoft | **Non collegato** (§3.3) |
| 12 | **Sfogliare OneDrive e SharePoint** da dentro Wisper | fase 5 §3.1 | app in Microsoft Entra nel Microsoft 365 di Manuel, consenso di un amministratore, chiave sul NAS (90 giorni) | 0 € (i link incollati funzionano già) | una chiave sul NAS che legge i file di Manuel | Microsoft | **Andrea** (domanda 6, consiglio: non ora) |
| 13 | **Sfogliare Google Drive** | fase 5 §3.1 | progetto Google Cloud, Picker (pagina web) con `drive.file`; con accesso a tutto Drive verifica riservata e valutazione di sicurezza | 0 € (i link funzionano già) | come 12 | Google | **Andrea** (insieme alla 12) |
| 14 | **Cerca dentro i file** (PDF, Word, Excel, DXF) | fase 5 §5.5 | niente fuori: SQLite FTS5, già nel Node del server | 0 € | niente esce dal NAS | — | **Adesso** (§6) |
| 15 | **Invio allo SDI** da Wisper (intermediario) | fase 4 | contratto con un intermediario (Aruba API solo per il Premium; Openapi, Invoicetronic, A-Cube), numerazione fiscale in Wisper | Aruba base circa 30 € l'anno + Premium (prezzo non trovato); Openapi circa 0,10-0,15 € a fattura | Wisper diventerebbe il programma delle fatture: errori fiscali veri | intermediario, Agenzia delle Entrate | **Non collegato** (decisione 5) |
| 16 | **Programma delle fatture di Manuel** (creare la bozza nel suo programma invece di copiarla) | fase 4 §8.4 | sapere quale programma usa; se è Fatture in Cloud: API con OAuth, app privata | probabilmente compreso nel suo piano (non verificato) | i dati della bozza vanno al suo programma (ci andrebbero comunque) | del programma | **Andrea** (domanda aperta della fase 4) |
| 17 | **Banca**: leggere i movimenti (open banking) | fase 4 §10.1 | un fornitore autorizzato (GoCardless chiuso ai nuovi; Enable Banking gratis solo per i propri conti, poi a contratto), consenso da rifare ogni **180 giorni** | da 0 € (modalità ristretta) a un contratto | un terzo vede tutti i movimenti del conto | fornitore e banca | **Non collegato** (decisione 6) |
| 18 | **Importa l'estratto conto** (file della banca) | fase 4 §10.1 | il file CSV o CBI della banca | 0 € | niente esce | — | **Non collegato** (decisione 6: solo scadenziario; si potrà senza servizi esterni) |
| 19 | **WhatsApp Business Platform** (invii dal server, risposte in Wisper) | fase 7 §3.17 | numero sulla piattaforma Meta, verifica dell'azienda, modelli approvati, webhook pubblico | circa 0,036 $ a promemoria, 0,08 $ marketing; servizio gratis fino a 1.000 al mese | messaggi e numeri dei clienti a Meta | Meta | **Non collegato** (decisione 7) |
| 20 | **Ore e spese via messaggio** | fase 7 §3.17 | WhatsApp come 19, oppure un bot Telegram | WhatsApp come 19; Telegram 0 € | testo libero da capire che scrive nei dati | Meta, Telegram | **Non collegato** (l'app lo fa già, anche senza rete) |
| 21 | **Assistente intelligente** | fase 7 §3.17 | un modello in rete (o sul NAS, troppo lento) | circa 1-1,5 $ al mese per 500 domande | dati dei clienti fuori dall'UE | del fornitore | **Non collegato** |
| 22 | **Notifiche immediate** (Firebase Cloud Messaging) | fase 7 §3.16 | progetto Firebase, chiave dell'account di servizio sul NAS, Play Store sul telefono | 0 € | il contenuto della notifica passa da Google | Google | **Non collegato** (domanda 7: il controllo ogni 15 minuti basta) |
| 23 | **Email dalla posta Microsoft 365 di Manuel** (al posto del Gmail del postino) | nuova | app in Microsoft Entra col permesso di mandare posta (di base vale per tutte le caselle del tenant) | 0 € in più; 10.000 destinatari al giorno | una chiave sul NAS che manda posta a nome dello studio | Microsoft | **Andrea** (domanda 8, dopo il consulente) |
| 24 | **Google Workspace** (accordo sul trattamento al posto del Gmail gratuito) | fase 7 §3.19 | spostare il foglio e lo script su un account Workspace | **6,80 € a utente al mese** (annuale) o 8,10 € (flessibile) | migliora: c'è l'accordo | Google | **Andrea** (domanda 8) |
| 25 | **Programma paghe del consulente** | fase 6 §3.14 | un formato comune (non esiste) | 0 € (esporta CSV, già fatto) | — | — | **Non collegato** |
| 26 | **DURC On Line** e **comunicazione all'Ispettorato** | fase 6 | accesso con SPID/CIE/CNS, riservato ai soggetti legittimati; nessuna API per un privato | 0 € (si fa dai portali) | — | INPS/INAIL, Ispettorato | **Non collegato** |

Le tabelle ACI (fase 3) non sono un collegamento: Wisper apre la pagina dell'ACI dell'anno e il valore lo scrive la persona.

### 3.2 Cosa si fa adesso, e perché queste

Le quattro da fare adesso (8, 9, 14 e "Importazione ed esportazione dati" delle specifiche, §7) hanno tutte le stesse
proprietà: **costano 0 €**, **non aprono porte**, **non chiedono chiavi di altri**, **non mandano dati fuori dal NAS**, e
rispondono a cose che le specifiche chiedono per nome (modulo 5 "sincronizzazione con calendari esterni", modulo 11
"ricerca dei documenti", modulo 17 "importazione ed esportazione dati"). La 14 era già stata promessa dalla fase 5.
I collegamenti 1-3 ci sono già: questa fase li mette in pagina con lo stato vero.

### 3.3 Cosa resta Non collegato, col motivo

- **11 Sincronizzazione a due vie**: per sapere quando Manuel sposta un appuntamento su Outlook servono gli avvisi di
  Graph, che arrivano solo a un indirizzo pubblico; con Google, un'app che chiede il calendario va verificata (o in prova
  le chiavi durano 7 giorni). E poi due calendari che si scrivono a vicenda vogliono regole per i conflitti. Il file e
  l'abbonamento (8-10) danno l'80% del vantaggio (vedere gli impegni di Wisper nel calendario del telefono) senza niente
  di questo. **Il calendario di Wisper resta l'unico posto dove si scrive.**
- **15 SDI**, **17-18 Banca**, **19-21 WhatsApp, messaggi, assistente**: decisioni 5, 6, 7 e fase 7 §3.17, coi numeri
  aggiornati sopra. Una cosa cambiata da allora: GoCardless (la strada gratuita per leggere i conti) non accetta più
  clienti nuovi.
- **22 Firebase**: il controllo ogni 15 minuti con WorkManager funziona già, senza progetti Google né chiavi. Se un
  giorno servisse l'immediato, il messaggio di Firebase porterebbe solo "Hai 2 notifiche nuove" e il telefono le
  leggerebbe dal server: niente dati a Google. È scritto qui perché chi lo farà non debba ricominciare.
- **25-26 Paghe, DURC, Ispettorato**: non esiste un modo per un privato. Le righe **Non collegato** delle fasi 6
  restano, con questo motivo in pagina.

### 3.4 Cosa dipende dalla risposta di Andrea

- **L'ingresso da internet** (4-7, 10): la domanda della fase 7 resta **sua**. Qui solo cosa cambia con ogni risposta:
  - con **Tailscale Standard** (8 $ al mese): l'accesso da fuori della decisione 1 è in regola, il portale e il link che
    scade si accendono, il ponte del cambio passa da Funnel sulla 8443, il feed pubblico del calendario (se lo vuole)
    passa dall'ingresso del portale;
  - con **Cloudflare Tunnel + un dominio nuovo** (5-12 € l'anno): portale, link e feed pubblico passano da Cloudflare (che
    vede il traffico); per l'accesso da fuori dello studio serve comunque un'altra strada; il ponte passa dal tunnel;
  - **senza scegliere**: Wisper funziona in casa e dal tailnet personale di oggi (che per uno studio non è permesso dal
    piano gratuito), portale e link restano **Non collegato**, il cambio si fa senza ponte (§10.5).
- **12-13 OneDrive e Drive**, **16 il programma delle fatture**, **23-24 la posta**: domande 6, 8 e quella aperta della
  fase 4.

## 4. Il modulo Integrazioni

### 4.1 Le parole dello stato

| Stato | Quando | Colore (sempre con la parola) |
|---|---|---|
| **Collegato** | l'ultimo controllo vero è riuscito | verde |
| **Da configurare** | si può collegare, ma manca un passo (un indirizzo, una chiave nel `.env`, un'impostazione) | giallo tenue |
| **Errore** | gli ultimi **due** controlli di fila sono falliti (uno solo: resta Collegato, con "l'ultimo controllo non è riuscito" sotto) | rosso tenue |
| **Non collegato** | si è deciso di non collegarlo (§3.3) o non esiste un modo | grigio, bordo tratteggiato (la pillola delle fasi 4-7) |
| **In corso** | un controllo o una copia sta girando adesso | blu |

Accanto alla pillola, sempre: **"controllato oggi alle 10:00"** (o "ieri alle 2:31", "il 18/10"); per i Non collegato
niente data. Un controllo più vecchio del doppio della sua frequenza aggiunge "da allora nessun controllo" in giallo scuro.

### 4.2 I controlli veri

Il server fa i controlli da solo (pianificazione accanto alle copie, `server/src/integrazioni/`), e a richiesta con
**Prova adesso** (al massimo una volta al minuto per collegamento). Ogni controllo scrive una riga in
`integrazioni_controlli` (§12.4).

| Chiave | Collegamento | Come si controlla | Ogni quanto | Da configurare se |
|---|---|---|---|---|
| `postino` | Postino (email, copie, foglio) | `postinoProva` allo script (`{ok, quando, rimaste}`); in più il battito di ogni ora della fase 7 | 60 minuti | `WISPER_POSTINO_URL` o il segreto mancano nel `.env` |
| `vies` | Verifica della partita IVA | `controllaPartitaIva` con la partita IVA dello studio (`PARTITA_IVA`): deve tornare `valida: true` | ogni giorno alle 6:00 | `PARTITA_IVA` vuota (allora si prova con il numero di prova del servizio, se c'è; altrimenti Da configurare) |
| `copiafuori` | Copia fuori casa (Drive) | l'ultima riga di `copie`: `fuori` = `ok` nelle ultime 50 ore; una volta al mese la prova di §9.10 | a ogni copia | il postino è Da configurare |
| `tailnet` | Accesso da fuori (tailnet) | **guarda, non chiede**: l'ultima richiesta arrivata con `Tailscale-User-Login` (Serve la mette sulle richieste dal tailnet). "Ultimo accesso dal tailnet: oggi alle 9:58, telefono di Manuel" | a ogni richiesta | nessuna richiesta dal tailnet da 7 giorni (allora Da configurare: "Nessun dispositivo è entrato da fuori casa questa settimana") |
| `internetinterno` | Il server interno **non** è su internet | **guarda**: una richiesta sulla 8400 con `Tailscale-Funnel-Request: ?1` vuol dire che il server interno è raggiungibile da internet (fase 7 §3.1 chiede di togliere `AllowFunnel`) | a ogni richiesta | — (qui lo stato buono si chiama **Collegato** solo nella tabella; in pagina la riga sta in Sicurezza, §9.8) |
| `portale` | Portale su internet | `GET {PORTALE_INDIRIZZO}/portale/salute` (fase 7 §3.18) | 60 minuti | `PORTALE_INDIRIZZO` vuoto |
| `calendario` | Abbonamenti al calendario | **guarda**: l'ultima lettura di un feed (§5.5) | a ogni lettura | nessun feed creato (resta Collegato il file da scaricare: si mostra "Si scarica il file; nessun abbonamento") |
| `ricerca` | Cerca dentro i file | all'avvio `PRAGMA compile_options` contiene `ENABLE_FTS5`; poi lo stato della lettura (§6) | all'avvio e ogni notte | — (senza FTS5: **Errore** "Il database del NAS non sa cercare dentro i file: la ricerca resta sui titoli") |
| `aggiornamenti` | Aggiornamenti delle app | il server legge una volta al giorno l'elenco firmato dell'ultima release su GitHub (lo stesso delle app, solo lettura) e lo confronta con le versioni viste nelle sessioni (`app` = "telefono 0.9.0") | ogni giorno | — |

I collegamenti **Non collegato** (11, 15, 17-22, 25, 26) e quelli che dipendono da Andrea finché non risponde (4-7, 10, 12,
13, 16, 23, 24) non hanno controlli: hanno la riga col motivo e, per quelli di Andrea, "Dipende da una scelta: è nelle
domande della fase 8".

Due controlli diventano anche voci della Dashboard (§8.7): `internetinterno` (urgente) e un collegamento in **Errore**
(titolare e amministrazione).

### 4.3 La pagina

Le cinque sottopagine delle specifiche (disponibili, attive, account collegati, impostazioni, stato delle
sincronizzazioni) stanno in **una pagina con quattro segmenti** e una pagina per collegamento, per non avere cinque
elenchi quasi uguali:

- **Segmenti**: **Tutti · Collegati · Da sistemare · Non collegati**, col numero. *Da sistemare* = Errore + Da configurare
  + quelli che dipendono da Andrea. Si apre su *Da sistemare* se ce n'è almeno uno in Errore, altrimenti su *Tutti*.
- **Riga**: icona del collegamento, nome (16/800), una riga su cosa fa ("Email, copie su Drive e foglio di ogni notte"),
  la pillola dello stato e "controllato oggi alle 10:00". Raggruppate in **Collegati a Wisper** (1-3, 8, 9, 14 e il
  controllo `tailnet`), **Dipendono da una scelta** e **Non collegati**.
- **In cima** (solo se c'è): fascia rossa tenue "Il postino non risponde da 2 ore: le email e la copia di stanotte
  aspettano" con **Prova adesso**.
- **Pagina di un collegamento**: nome e pillola; "controllato oggi alle 10:00 · in 412 ms"; **Cosa fa**; **Account**
  (il nome dell'account com'è scritto da Andrea, es. "il Gmail del foglio di Wisper", "tailnet dello studio": **mai**
  chiavi, segreti, indirizzi del foglio); **Cosa esce dal NAS** (es. "Email e PDF ai clienti; la copia del database";
  "Niente"); **Costo** ("0 €" o i numeri di §3.1); **Regole del servizio** (una riga e il nome del fornitore); per chi ha
  impostazioni (calendario, ricerca, portale) le impostazioni con il loro **Salva** col bordo; **Ultimi controlli**
  (gli ultimi 20: quando, esito, tempo, frase d'errore); in fondo **Prova adesso** col bordo.
- **Non collegato**: la stessa pagina con **Perché non è collegato** (la frase di §3.3), **Cosa servirebbe**, **Costo se
  si volesse**. Nessun pulsante che finga di collegare.
- **Giallo**: nessuno nell'elenco (non c'è un'azione principale); nella pagina di un collegamento in **Errore** il giallo
  è **Prova adesso**; negli altri casi Prova adesso è col bordo.
- **Collaboratore**: la voce Integrazioni non c'è nel menu (`integrazioni` 0). **Lettura**: vede tutto, niente Prova
  adesso, niente Salva.

### 4.4 Cosa non si fa mai

- Nessuna chiave, segreto, token, indirizzo del foglio o del NAS compare in pagina, nelle risposte o nel registro: le
  pagine dicono "c'è" o "manca". I segreti stanno nel `.env` del NAS e li mette Andrea.
- Nessun collegamento si accende da solo: un'integrazione nuova parte **Da configurare** e diventa Collegato solo dopo il
  primo controllo riuscito.
- Nessuna voce del menu o della Dashboard dice "sincronizzato" se non c'è un controllo dietro.

## 5. Calendario: il file ICS e l'abbonamento

### 5.1 Le due strade (e la terza che dipende da Andrea)

| | Come | Dove si vede | Si aggiorna | Cosa serve |
|---|---|---|---|---|
| **Il file** | **Scarica il file** (`.ics`), poi lo si importa | Outlook (File › Apri ed esporta › Importa), Google Calendar sul web (Impostazioni › Importa), il calendario del telefono che lo apre | no: è una fotografia di quel momento | niente |
| **L'abbonamento** dal telefono | un indirizzo `https://<server>/calendario/<chiave>.ics` che **ICSx⁵** legge dal telefono ogni ora e mette nel calendario di Android, a sola lettura | il calendario del telefono, accanto agli impegni personali | ogni ora (lo sceglie ICSx⁵) | ICSx⁵ (0 € da F-Droid, circa 2 € dal Play Store) e il tailnet acceso fuori casa |
| *L'abbonamento da Google Calendar o Outlook di Microsoft 365* | lo stesso indirizzo, ma pubblico: lo legge il server di Google o di Microsoft | Google Calendar e Outlook ovunque | ogni 3-24 ore, non si sceglie | l'ingresso da internet (§3.4) e `CALENDARIO_PUBBLICO` (domanda 4) |

Si scrive **solo in Wisper**: chi sposta un evento nel calendario del telefono non cambia Wisper (ICSx⁵ lo rimette com'era
alla lettura dopo). La terza strada è progettata (§5.5) ma resta **Non collegato** finché Andrea non risponde.

### 5.2 Cosa c'è dentro

Chi chiede sceglie **Cosa** e **In più**:
- **Le mie cose** (di base): attività, appuntamenti, sopralluoghi e interventi **assegnati a me**. **Tutto lo studio**
  (solo con `attivita` 2 e non collaboratore, come la vista Squadra della fase 2): quelli di tutti e i non assegnati, col
  nome della persona tra parentesi.
- **Ferie e assenze** (casella): le mie (fase 6); nel feed dello studio quelle di tutti con la parola che chi chiede può
  vedere (fase 6 §6.7: per chi non vede il tipo, "Assente"); più le chiusure dello studio ("Studio chiuso").
- **Scadenze** (casella, solo con `documenti` 1): le scadenze delle fasi 5 e 6 che chi chiede vede, come eventi di un
  giorno.
- **Periodo**: da `CALENDARIO_GIORNI_PRIMA` (30) giorni fa a `CALENDARIO_MESI_DOPO` (12) mesi da oggi. Le ricorrenze oltre i
  90 giorni già scritti (fase 2) si calcolano al volo con la stessa regola, **senza scriverle** nel database.
- **Mai soldi**, nemmeno con `costi`: niente importi, tariffe, totali. Niente note interne dei ticket, niente dati
  riservati (il tipo di un'assenza sanitaria solo a chi ha `riservati`, come in fase 6).
- **Niente promemoria** (`VALARM`): l'app di Wisper avvisa già delle proprie attività (fase 2); con anche il calendario,
  il telefono suonerebbe due volte.

### 5.3 Il file, riga per riga

Regole della RFC 5545 (`ricerca-fase8.md` §2): righe con CRLF; più lunghe di 75 byte si piegano (CRLF più uno spazio)
**senza spezzare un carattere UTF-8**; nei testi la barra rovescia, il punto e virgola e la virgola prendono una barra
rovescia davanti e l'a capo diventa `\n`; UTF-8 senza BOM.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Studio Tecnico GM//Wisper//IT
CALSCALE:GREGORIAN
METHOD:PUBLISH
NAME:Wisper · Manuel Gasparotto
X-WR-CALNAME:Wisper · Manuel Gasparotto
X-WR-TIMEZONE:Europe/Rome
REFRESH-INTERVAL;VALUE=DURATION:PT1H
X-PUBLISHED-TTL:PT1H
BEGIN:VTIMEZONE
TZID:Europe/Rome
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:attivita-31-20261023@wisper
DTSTAMP:20261022T080500Z
LAST-MODIFIED:20261021T144000Z
DTSTART;TZID=Europe/Rome:20261023T090000
DTEND;TZID=Europe/Rome:20261023T110000
SUMMARY:Intervento TK/2026/0014: Scatta il generale MT
LOCATION:Cabina MT di Zanè\, Zanè (VI)
DESCRIPTION:Cliente: Rossi Impianti Srl\nCommessa: 26ST041 Assistenza cabi
 na MT\nTicket: TK/2026/0014\nSi cambia in Wisper\, non qui.
CATEGORIES:Intervento
STATUS:CONFIRMED
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
UID:attivita-44@wisper
DTSTAMP:20261022T080500Z
DTSTART;VALUE=DATE:20261024
DTEND;VALUE=DATE:20261025
SUMMARY:Da fare: Mandare lo schema unifilare a Elettrodinamica
CATEGORIES:Attività
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
```

- `UID`: `attivita-<id>@wisper` per un'attività singola, `attivita-<id della ricorrenza>-<aaaammgg>@wisper` per una volta
  di una ricorrenza (anche quelle calcolate al volo: stesso UID quando poi vengono scritte), `assenza-<id>@wisper`,
  `chiusura-<id>@wisper`, `scadenza-<id>@wisper`. Lo stesso evento ha sempre lo stesso UID: i calendari lo aggiornano
  invece di duplicarlo.
- `DTSTAMP` = l'ora in cui si fa il file (UTC); `LAST-MODIFIED` = `modificato` dell'attività (UTC).
- **Con l'ora** (appuntamenti, sopralluoghi, interventi, permessi a ore): `DTSTART`/`DTEND` con `TZID=Europe/Rome`; senza
  fine, un'ora. **Senza ora** (attività con la sola scadenza, assenze di giorni interi, chiusure, scadenze):
  `VALUE=DATE` con `DTEND` il giorno dopo (la fine è esclusa).
- `SUMMARY`: il titolo; le attività senza ora hanno **"Da fare: "** davanti, quelle fatte negli ultimi 30 giorni
  **"Fatto: "**; nel feed dello studio il nome tra parentesi ("… (Marco Rossato)"), le non assegnate "(da assegnare)";
  assenze "Ferie", "Permesso 9:00-11:00", "Assente"; scadenze "Scadenza: Verifica impianto di terra · Batokyo Srl".
- `LOCATION`: `luogo` dell'attività, se no l'indirizzo della sede o dell'impianto.
- `DESCRIPTION`: righe "Cliente: …", "Commessa: <codice> <descrizione>", "Ticket: …", "Checklist: 2 di 5", le prime
  500 lettere della descrizione, e sempre "Si cambia in Wisper, non qui."
- `STATUS`: `CONFIRMED`; un'attività **annullata** resta per 30 giorni con `STATUS:CANCELLED` (così sparisce anche dai
  calendari che l'avevano), poi esce.
- `TRANSP`: `OPAQUE` per quello che ha l'ora, `TRANSPARENT` per il resto (non occupa la giornata).
- `CATEGORIES`: Appuntamento, Sopralluogo, Intervento, Attività, Ferie, Assenza, Chiusura, Scadenza.
- **Senza dettagli** (scelta del feed, §5.5): `SUMMARY` = la sola parola (Appuntamento, Sopralluogo, Intervento,
  Attività, Assenza, Scadenza), niente `LOCATION`, niente `DESCRIPTION`.

Il file lo fa solo il server (`server/src/calendario.js`); le app lo salvano o lo condividono e basta.

### 5.4 Il file da scaricare

`esportaCalendario {cosa: "mie"|"studio", assenze?: true, scadenze?: true}` (attivita 1) →
`{"ok": true, "nome": "wisper-calendario-manuel-2026-10-22.ics", "mime": "text/calendar;charset=utf-8", "eventi": 48,
"base64": "QkVHSU46VkNBTEVOREFS..."}`. `studio` senza il permesso → `permesso:false`. Le app salvano o condividono il file
come i CSV (telefono: foglio Condividi; computer: finestra Salva). Nel registro degli accessi l'azione, senza contenuto.

### 5.5 L'indirizzo dell'abbonamento

- **Un indirizzo per dispositivo** ("Telefono di Manuel", "Outlook in ufficio"), al massimo 5 a persona, tabella
  `calendario_feed` (§12.4). La **chiave** sono 32 byte casuali in base64url; nel database solo lo SHA-256. Si mostra
  **una volta**, alla creazione; persa la chiave se ne fa una nuova.
- `GET /calendario/<chiave>.ics` sulla **porta 8400** (in casa e dal tailnet), **senza** `Authorization` (le app dei
  calendari non sanno mandarlo): la chiave è il permesso. Risposta `200 text/calendar; charset=utf-8` con `ETag` e
  `Last-Modified` (e `304` se non è cambiato niente), `Cache-Control: private, max-age=0`. Chiave sconosciuta, tolta o di
  un utente disattivato → `404` uguale per tutto. Al massimo **60 letture all'ora** per chiave (`429` oltre).
- Il contenuto si calcola **a ogni lettura coi permessi di oggi** della persona: se le tolgono un permesso, il feed perde
  quelle cose da subito.
- Ogni lettura aggiorna `ultimo_uso`, `letture` e `agente` (i primi 60 caratteri dello `User-Agent`, per mostrare
  "ICSx⁵" o "Microsoft Outlook"); nel registro degli accessi l'azione `calendario` con l'esito.
- **Pubblico** (terza strada, solo con `CALENDARIO_PUBBLICO = true`, che può accendere solo chi ha `amministrazione` 2, e
  solo se il portale è Collegato): la stessa strada si aggiunge all'**elenco chiuso** della porta 8401 della fase 7
  (§6.1), ma risponde **solo** ai feed creati con "Anche fuori dal tailnet" (colonna `pubblico`), che nascono **senza
  dettagli** e passano ai dettagli solo con una conferma: "Titoli, luoghi e clienti passeranno dai server di Google o
  Microsoft". Spegnere `CALENDARIO_PUBBLICO` o il portale chiude subito tutti i feed pubblici.
- `feedCalendario {}` (attivita 1, i propri): `{"ok": true, "feed": [{"id": 2, "nome": "Telefono di Manuel", "cosa":
  {"attivita": "mie", "assenze": true, "scadenze": false}, "dettagli": true, "pubblico": false, "creato":
  "2026-10-22T10:05:00", "ultimoUso": "2026-10-22T09:40:00", "agente": "ICSx5/2.4.3", "letture": 214}]}`.
- `nuovoFeed {nome, cosa, dettagli, pubblico?}` → `{"ok": true, "feed": {...}, "indirizzo":
  "https://wisper.<tailnet>.ts.net/calendario/Q2hp….ics", "webcal": "webcal://wisper.<tailnet>.ts.net/calendario/Q2hp….ics"}`
  (`indirizzo` e `webcal` **solo** in questa risposta). L'indirizzo nasce da schema e `Host` della richiesta che crea il
  feed (o `X-Forwarded-Host` dietro Serve): è lo stesso con cui l'app parla al server. Errori: `"Nome: scrivi un nome per
  riconoscerlo"`, `"Hai già 5 indirizzi: togline uno"`, `"Il calendario fuori dal tailnet non è acceso"`.
- `revocaFeed {id}` → `{"ok": true}`. Titolare e chi ha `amministrazione` 2 vedono e tolgono i feed di tutti in
  Amministrazione › Sicurezza (§9.8).

### 5.6 Come lo usa Manuel

- **Telefono**: Attività e calendario › Calendario › ⋯ › **Il calendario in altre app** › **Nuovo indirizzo** →
  **Crea l'indirizzo** → **Apri con ICSx⁵** (apre il `webcal://`; se ICSx⁵ non c'è, il pulsante dice "Installa ICSx⁵" e
  apre la sua pagina su F-Droid o sul Play Store). Fuori casa si aggiorna se il tailnet è acceso, come Wisper.
- **Computer**: **Scarica il file** e lo si importa in Outlook; per l'abbonamento in Outlook serve la terza strada (Outlook di
  Microsoft 365 legge i calendari dal server di Microsoft: `ricerca-fase8.md` §1.1). Se il classico Outlook legga dal
  computer è da provare (§16): se sì, basta il tailnet anche lì.
- **Prove a mano** (§16): il file importato in un Google Calendar di prova e nel classico Outlook; ICSx⁵ sull'emulatore
  contro il server di prova (`http://10.0.2.2:8400/calendario/<chiave>.ics`), con un'attività spostata e una annullata.

## 6. Cercare dentro i file

La fase 5 (§5.5) cerca su titolo, descrizione, cliente, commessa, impianto, nome del file, e diceva "si potrà con la fase
8" per il contenuto. Si fa adesso: **niente esce dal NAS** e serve solo quello che c'è già nel Node del server (SQLite
3.50.4 con FTS5, provato il 22/10: `ricerca-fase8.md` §3).

### 6.1 Cosa si legge

| Formato | Come | Note |
|---|---|---|
| **PDF** con testo | flussi `FlateDecode` aperti con `node:zlib`, operatori di testo `Tj`, `TJ`, `'`, `"` tra `BT` ed `ET`; stringhe tra parentesi ed esadecimali; tabelle `ToUnicode` semplici (`bfchar`, `bfrange`) | se il testo esce illeggibile (meno del 70% di lettere, cifre e spazi, o meno di 20 parole): **Non si legge** |
| **DOCX, DOTX** | `word/document.xml`, intestazioni e piè (`w:t`, un a capo per `w:p`) | col lettore ZIP che c'è già (`server/strumenti/xlsx.js`), spostato in `src/zip.js` |
| **XLSX** | `xl/sharedStrings.xml`, le stringhe in linea, i nomi dei fogli | |
| **PPTX** | `ppt/slides/slide*.xml` (`a:t`) | |
| **ODT, ODS, ODP** | `content.xml` | |
| **TXT, CSV, XML** | il testo (UTF-8, se no Windows-1252) | gli XML delle fatture si cercano già in Fatturazione |
| **DXF** | i valori dei codici 1 e 3 (testi `TEXT` e `MTEXT`, tolti i comandi di formato come `\P`) | utile per gli schemi |
| DOC, XLS vecchi, DWG, immagini, scansioni, ZIP | **Senza testo** | servirebbe l'OCR: non previsto |

- Si leggono i file dei **documenti** (tutte le revisioni) e i documenti nati dal portale; **non** si leggono le foto dei
  rapportini e dei ticket, né i **documenti personali riservati** della fase 6 (per sicurezza: un errore nei filtri non
  può mostrarne un pezzo). I **collegamenti** a OneDrive e Drive non si leggono (Wisper non apre quei file).
- Fino a `RICERCA_FILE_MAX_MB` (20) MB a file e 200.000 caratteri tenuti (circa 60 pagine; oltre: "letto in parte").
- **Quando**: subito dopo il caricamento, in un `worker_threads` (un file alla volta, 20 secondi al massimo a file,
  così il server non si ferma); di notte, dopo la copia, per al massimo 20 minuti, quelli **Da leggere** (dopo la
  migrazione lo sono tutti i documenti di prima).
- Spazio: con 2.000 documenti da 20 KB di testo in media, circa 40 MB in più nel database.

### 6.2 La ricerca

- `documenti {testo, dentro?: true}`: come oggi, più il testo dei file (`dentro` di base vero quando `RICERCA_FILE` è
  acceso). Le parole diventano termini FTS tra virgolette con l'asterisco (`"terra"*`): niente sintassi di FTS dalla
  persona; tutte le parole devono esserci.
- **Prima i permessi, poi l'estratto**: la ricerca FTS dà gli id dei file; da lì i documenti; si tengono **solo quelli
  che la persona vede** (`vede` della fase 5); **solo per quelli** si calcola l'estratto con `snippet()`. Un file che non
  vedi non dà nemmeno il numero dei risultati.
- Ordine: il titolo che comincia con la parola, poi gli altri del titolo (come oggi), poi quelli trovati dentro (in
  ordine di `bm25`).
- Ogni documento trovato dentro ha `trovato: {"revisione": 2, "superata": false, "estratto": "…la verifica
  dell'impianto di [terra] è stata eseguita il 12/03/2026 con…"}`; le app mostrano in grassetto quello tra parentesi
  quadre. Trovato solo in una revisione superata: "nella rev. 1 (superata)".

### 6.3 Dove si vede

- **Documenti** (telefono e computer): la ricerca di sempre; i risultati trovati dentro hanno sotto il titolo l'estratto
  (14/600, una riga, le parole in grassetto) e la pillola **Nel testo**.
- **Pagina del documento**: una riga calma "Testo letto il 21/10 · 12 pagine", oppure "Senza testo: è una scansione o un
  disegno", "Non si legge", "Letto in parte: è molto lungo", "Da leggere".
- **Integrazioni › Cerca dentro i file**: "1.240 file letti · 37 senza testo · 2 da leggere"; **Cerca anche dentro i
  file** sì/no e i MB, col loro **Salva** col bordo; **Rileggi tutto** col bordo (amministrazione 2).
- `letturaFile {idFile}` (documenti 1, se lo vede) → `{"ok": true, "stato": "letto", "caratteri": 18420, "pagine": 12,
  "letto": "2026-10-21T16:40:00"}`; `rileggiFile {idFile?}` (documenti 2; senza id tutti, amministrazione 2) → `{"ok":
  true, "daLeggere": 1240}`.

## 7. Importare ed esportare

Le specifiche del modulo 17 chiedono "importazione ed esportazione dati". L'esportazione per Excel c'è da ogni fase (CSV con
`;`, architettura §12.13). Si aggiungono due cose.

### 7.1 Esporta tutto

- **Chi**: solo il titolare (contiene tutto, anche i dati riservati che lui vede).
- **Cosa**: un file ZIP `wisper-tutto-2026-10-22.zip` con **un CSV per elenco**, negli stessi formati delle esportazioni
  che ci sono (rapportini, clienti, fornitori, referenti, sedi, commesse, prestazioni, preventivi, attivita, ore, spese,
  trasferte, rimborsi, fatture, ricevute, movimenti, impegni, documenti (l'elenco), scadenze, ticket, contratti, persone,
  assenze, mezzi, attrezzature, collaboratori, incarichi, comunicazioni, registro) e un `leggimi.txt` (quando, versione
  del server, cosa c'è in ogni file, "I file (foto, firme, documenti) non ci sono: stanno nella copia del NAS e in
  quella fuori casa").
- **Come**: si prepara in sottofondo (con dieci anni di dati, meno di 30 secondi: §11.5); `esportaTutto {}` →
  `{"ok": true, "esportazione": {"id": 4, "stato": "in_corso"}}`; quando è pronta arriva la notifica
  `esportazione_pronta` ("Il file con tutti i dati è pronto") e `esportazioni {}` → `[{"id": 4, "stato": "pronta",
  "byte": 3480112, "creato": "…", "scade": "2026-10-29T10:05:00"}]`. Si scarica con `GET /esportazione/<id>` col Bearer
  (solo chi l'ha chiesta). Resta in `/data/esportazioni/` per `ESPORTAZIONI_GIORNI` (7) giorni, poi si toglie. ZIP scritto
  senza dipendenze (`zlib.deflateRawSync` e `zlib.crc32`).
- Nel registro: "esportazione di tutti i dati" (chi, quando, quanti file e righe).

### 7.2 Importa clienti e fornitori da un file

Serve quando Manuel esporta l'elenco dei clienti dal suo programma delle fatture, o per un fornitore nuovo in blocco.
- **Chi**: `clienti` 2. **Da**: CSV (`;` o `,`, UTF-8 o Windows-1252) o XLSX; al massimo 5.000 righe e 5 MB.
- **Passo 1, il file** (telefono: dal Condividi di Android o dai file; computer: finestra Apri).
- **Passo 2, le colonne**: il server propone l'abbinamento dai nomi delle intestazioni, senza badare a maiuscole, spazi e
  punti, come Code.gs (Ragione sociale, Denominazione, Nome → nome; Partita IVA, P.IVA, PIVA → partita IVA; Codice fiscale;
  Codice destinatario, SDI; PEC; Email; Telefono; Indirizzo; CAP; Città, Comune; Provincia; Nazione; Note). Ogni colonna
  si cambia (telefono: una per volta; computer: una tendina per colonna, l'unica tendina di questa fase perché le scelte
  sono più di dieci). E poi: **Sono clienti · Sono fornitori · Lo dice una colonna**.
- **Passo 3, il controllo** (niente è ancora scritto): tre gruppi, **Nuovi · 42**, **Già in Wisper · 7** (stessa partita
  IVA o stesso nome: **si completano solo i campi che in Wisper sono vuoti**, mai uno pieno), **Da sistemare · 3** (con le
  frasi di `salvaSoggetto`: "Riga 14 · Partita IVA: il numero non torna, controlla le cifre"; si saltano).
- **Passo 4**: giallo **Importa 42 e completa 7** → avviso "Importati 42 clienti, completati 7, saltati 3". Nel registro
  ogni anagrafica con la nota "importato da clienti-fatture.csv"; una riga in `importazioni`.
- **Si torna indietro**: Amministrazione › Importa ed esporta › l'importazione › **Archivia quelli importati** (archivia
  le anagrafiche nate da quel file che non hanno ancora commesse, rapportini, preventivi o fatture; i campi completati
  restano: si vedono nel registro).
- `leggiImport {nome, base64}` (clienti 2) → `{"ok": true, "idLettura": "…", "colonne": [{"intestazione": "Ragione
  sociale", "campo": "nome", "esempi": ["Rossi Impianti Srl", "Verdi Snc"]}], "righe": 52}`; `controllaImport {idLettura,
  colonne, tipo}` → `{"ok": true, "nuovi": 42, "completati": 7, "daSistemare": [{"riga": 14, "errore": "Partita IVA: …"}],
  "anteprima": [...prime 20 righe...]}`; `importaSoggetti {idLettura, colonne, tipo}` → `{"ok": true, "importazione":
  {"id": 3, "nuovi": 42, "completati": 7, "saltati": 3}}`; `archiviaImportati {idImportazione}` (clienti 2) → `{"ok":
  true, "archiviati": 40, "restano": 2}`. La lettura vive in memoria 30 minuti.

## 8. Dashboard: tutte le fasi insieme

### 8.1 Cosa non va se si sommano le fasi così come sono

Contando le voci scritte negli accordi: la fase 1 ne ha 14 tipi, la 2 ne aggiunge 9, la 3 7, la 4 13, la 5 13, la 6 circa
27, la 7 14: **circa 97 tipi di voce**. I riquadri: 4 delle commesse (fase 1), 4 delle fatture (fase 4), 4 dei ticket
(fase 5), 4 delle persone (fase 6), 2 del portale (fase 7): **18 riquadri** per il titolare. Con i dati di esempio dei
prototipi, il titolare avrebbe oggi **10 voci urgenti, 16 questa settimana, 13 da pianificare**: tre schermate di telefono
prima di arrivare in fondo (il prototipo della fase 8 lo mostra col commutatore **Dashboard: prima**).

E ci sono **doppioni**, la stessa cosa detta da due fasi:
- il ticket urgente (fase 5) e la "Richiesta urgente dal portale" (fase 7) per lo **stesso ticket**;
- la fattura scaduta (fase 4) e il "Promemoria di pagamento da preparare" (fase 7) per la **stessa fattura**;
- il preventivo "accettato, manca la commessa" (fase 2) e "accettato nel portale" (fase 7);
- il rapportino da far firmare (fase 1) e "fallo firmare nel portale" (fase 7);
- le scadenze vicine della fase 5 e quelle di persone, mezzi e collaboratori della fase 6, e **due riquadri "Scadenze
  vicine"**;
- la taratura scaduta (fase 6, urgenti) e la stessa scadenza di taratura nelle scadenze;
- il DURC scaduto di un collaboratore con incarico (urgenti) e "idoneità non in regola" (da pianificare).

### 8.2 Le regole nuove (nel server, `dashboard.js`, un passaggio finale per tutte le fasi)

1. **Una cosa, una voce.** Ogni voce ha `oggetto` (`ticket:23`, `fattura:43`, `rapportino:RAP/2026/0153`,
   `preventivo:12`, `scadenza:51`, `collaboratore:F004`…). Se due regole fanno una voce per lo stesso oggetto resta la più
   grave; il dettaglio dell'altra si aggiunge in coda ("· dal portale", "· promemoria pronto", "· da firmare nel
   portale"). Le voci di gruppo (§8.2 punto 4) contano gli oggetti una volta sola.
2. **Ordine fisso**: per gravità (`urgente`, `attenzione`, `soldi`, `info`), poi per **tipo** nell'ordine di §8.3, poi
   per data (le cose scadute dalla più vecchia, quelle in arrivo dalla più vicina).
3. **Tetti**: si vedono al massimo **7 Urgenti, 7 Questa settimana, 5 Da pianificare**; sotto ogni sezione con di più la
   riga **Altre 6** che apre **Tutto quello che c'è da fare** (pagina nuova, §8.5). Il server dà le prime voci e `quante`
   per sezione; con `tutto: true` dà tutte le voci (senza il limite di 20 della fase 1).
4. **Raggruppare**: in una sezione, **da 3 voci della stessa famiglia** se ne fa una ("4 scadenze nei prossimi 30
   giorni", dettaglio coi primi tre nomi e "e 1 altra"; tocco = l'elenco già filtrato). Famiglie: scadenze (fasi 5 e 6
   insieme), attività, rapportini da firmare, preventivi, ticket non urgenti, fatture scadute, documenti, guasti, file dal
   portale, messaggi dei clienti, cose da approvare. **Non** si raggruppano le voci di **sistema** (§8.7), sempre per
   prime e una per una. Le regole delle fasi che già raggruppavano "fino a 3" restano uguali.
5. **Da approvare** in una voce sola per chi approva: "7 cose da approvare" con "4 ore e spese di Marco Rossato, 2 ferie,
   1 documento"; il tocco apre un foglio con le tre righe (Ore e rapportini › Da approvare, Persone › Ferie da approvare,
   Documenti › Da approvare), ognuna col suo numero.
6. **La cosa più urgente** = la prima voce di Urgenti dopo l'ordine (come la fase 1), e non si ripete sotto.
7. **Nascondi per 30 giorni**, solo per le voci `info` di **Da pianificare** (per esempio "Saldo delle ferie di Laura
   Bianchi: l'ultimo cedolino scritto è di luglio"): tocco lungo sul telefono, ⋯ sul computer. Vale per la persona; dopo
   30 giorni torna. In fondo a Tutto quello che c'è da fare: "Nascoste · 3" con **Mostrale**. Nel registro no (è una
   preferenza personale).
8. **Quattro riquadri per persona** (§8.4) al posto dei 18; ognuno si tocca come prima. Gli altri numeri restano nella
   pagina del loro modulo, dove le fasi li avevano già messi.
9. **Il tuo giorno** resta in cima sul telefono per chi scrive rapportini (fase 1).

### 8.3 L'ordine fisso dei tipi (dentro la stessa gravità)

1. **sistema** (fase 8: server interno su internet, copia non riuscita, disco quasi pieno, collegamento in Errore, prova
   di ripristino non riuscita)
2. `ticket` urgenti e `intervento` di oggi
3. `timer`
4. `mezzo` fermo, `strumento` con taratura scaduta o non conforme usato
5. `attivita` scadute, `appuntamento` e `sopralluogo` di oggi
6. `respinta` (le mie cose respinte)
7. `approvare` (con ferie e documenti, §8.2 punto 5)
8. `fattura` scadute e già pagate da emettere, `cassa` sotto soglia
9. `impegno` scaduti
10. `scadenza` (e `qualifica`, `visita`, `collaboratore` con documenti scaduti)
11. `prestito` in ritardo
12. `preventivo` senza risposta, in scadenza, accettati senza commessa
13. `rapportini` da far firmare, giorni senza rapportino
14. `fatturazione` (da fatturare), `rimborsi`
15. `commessa` in ritardo, budget, senza responsabile
16. `portale`, `messaggio`, `pagamento`
17. `assenza` (chi è assente oggi)
18. `documento`, `contratto`, `guasto`, `incarico`, `persona`, `veicoli`, `conto`, `fiscale`, `spazio`, `copia` (gli
    altri, nell'ordine in cui le fasi li hanno scritti)

Un tipo nuovo che non è in elenco va in fondo: la prova di §16 fallisce finché non lo si mette al suo posto.

### 8.4 I riquadri per ruolo

Riquadri tra cui scegliere (ognuno con la regola di permesso della sua fase): Commesse aperte, Commesse in ritardo, Da
fatturare, Da incassare, Scaduto, Nel conto, Ticket aperti, Interventi oggi, Scadenze vicine (fasi 5 e 6 insieme), Assenti
oggi, Da approvare, Tarature scadute, Dal portale, Da mandare oggi, Ore della settimana, Attività di oggi, I miei ticket,
Preventivi in attesa.

| Ruolo | I quattro di base |
|---|---|
| Titolare | Da fatturare · Scaduto · Ticket aperti · Da approvare |
| Amministrazione | Da fatturare · Da incassare · Scaduto · Scadenze vicine |
| Collaboratore | Ore della settimana · Attività di oggi · I miei ticket · Da mandare oggi |
| Lettura | Commesse aperte · Da fatturare · Da incassare · Scaduto |
| Esterno | come la fase 6 §8.4 (le sue cose) |

**Cambia i riquadri** (in fondo alla Dashboard, testo giallo scuro): foglio con l'elenco di quelli che la persona può
vedere, ne sceglie 4 (l'ordine è quello del tocco). Si salva in `utenti.riquadri`. Un riquadro che perde il permesso
sparisce e torna quello di base. Il numero in rosso solo per Scaduto, Commesse in ritardo, Tarature scadute (sopra
zero), come nelle fasi.

### 8.5 Cosa vede ogni ruolo, e la pagina Tutto quello che c'è da fare

| | Titolare | Amministrazione | Collaboratore | Lettura |
|---|---|---|---|---|
| Voci di sistema (§8.7) | sì | solo con `amministrazione` 2 | no | no |
| Soldi (fatture, cassa, rimborsi, da fatturare) | sì | sì | no (solo i suoi rimborsi: fase 3) | sì, senza azioni |
| Da approvare | sì | sì | no | no |
| Lavoro (ticket, attività, rapportini, commesse) | di tutti | di tutti | i suoi e quelli da prendere | sì, senza azioni |
| Persone e mezzi | tutto (riservati compresi) | senza riservati | le sue (formazione, strumenti, ferie) | sì, senza riservati |
| Portale e comunicazioni | sì | sì | i suoi messaggi | sì, senza azioni |
| Nascondi per 30 giorni | sì | sì | sì | sì |

La **Lettura** (il commercialista) vede solo le voci informative e di soldi, mai quelle che chiedono di fare qualcosa che
non può fare ("8 cose da approvare", "File dai clienti da guardare", voci di sistema): una voce che non si può risolvere è
rumore.

**Tutto quello che c'è da fare** (Dashboard › Altre N, e voce in fondo alla Dashboard): titolo, segmenti **Urgenti ·
Questa settimana · Da pianificare** col numero, pillole per area **Tutto · Lavoro · Soldi · Persone e mezzi · Documenti e
ticket · Clienti e portale · Sistema** (solo quelle con voci), l'elenco intero con le stesse righe della Dashboard (anche
qui una cosa una voce, ma senza tetti né raggruppamenti), in fondo **Nascoste · 3** con Mostrale. Nessun giallo.

### 8.6 I numerini del menu

Una regola sola: **il numerino conta le cose che aspettano te** (un'azione tua), mai un totale; oltre 99 "99+".
Fatturazione (clienti con qualcosa da fatturare), Ore e rapportini (da approvare, per chi approva), Ticket e assistenza (da
prendere; per il collaboratore anche i suoi da fare), Documenti (da approvare, per chi approva), Persone (richieste da
approvare), Mezzi e attrezzature (tarature scadute, mezzi fermi, prestiti in ritardo), Collaboratori esterni (con incarico
e documenti scaduti), WhatsApp e comunicazioni (da mandare oggi e preparati non mandati), Portale clienti (da guardare),
**Integrazioni** (collegamenti in Errore, solo titolare e `amministrazione` 2). Niente numerini su Dashboard, Clienti,
Commesse, Preventivi, Attività, Spese, Banche, Amministrazione: le loro cose da fare sono già nella Dashboard.

### 8.7 Le voci nuove della fase 8

- **Urgenti** (tipo `sistema`, titolare e `amministrazione` 2): "Il server interno si raggiunge da internet" ("Togli
  AllowFunnel dal nodo del server: fase 7", `collegamento {pagina: "amministrazione", filtro: {sezione: "sicurezza"}}`);
  "La copia fuori casa non riesce da 2 notti" (prima era solo email: architettura §7); "La prova automatica della copia
  non è riuscita" ("La copia del 01/11 non si apre: guarda Copie e ripristino"); "Il postino non risponde da 3 ore" (al
  posto della voce del battito); "Il disco del NAS è quasi pieno" (resta quella della fase 5, ora col tipo `sistema`).
- **Questa settimana** (titolare e `amministrazione` 2): "Errore: Verifica della partita IVA" (un collegamento in
  Errore che non ferma il lavoro, `collegamento {pagina: "integrazione", id: "vies"}`).
- **Da pianificare** (titolare e `amministrazione` 2): "Prova il ripristino di una copia: l'ultima volta è stata 92 giorni
  fa" (`PROVA_RIPRISTINO_GIORNI`, `collegamento {pagina: "amministrazione", filtro: {sezione: "copie"}}`); "2 dispositivi
  hanno una versione vecchia di Wisper" ("Telefono di Marco: 0.8.2 · ultima 0.9.0"); "3 controlli della lista prima del
  cambio da fare" (solo finché `CAMBIO.stato` è `prima` o `prova`, §10).
- `tipo` nuovi: `sistema`, `integrazione`, `ripristino`, `versione`, `controlli`. `collegamento.pagina` nuove:
  `integrazioni` (filtro `segmento`), `integrazione` (`id` = chiave), `tutto` (filtro `sezione`, `area`),
  `amministrazione` con `filtro.sezione` `sicurezza` | `copie` | `stato` | `controlli` | `impostazioni` | `notifiche`.

## 9. Amministrazione e impostazioni (modulo 18): solo quello che manca

### 9.1 Cosa c'è già e cosa manca

| Sottopagina delle specifiche | C'è già (fase) | Cosa aggiunge la fase 8 |
|---|---|---|
| Dati dello studio | intestazione dei PDF, la tua firma (1); polizza e titoli (2); dati fiscali e albo (4) | **logo** sui PDF e nel portale, nome breve, piè di pagina, sito (§9.3) |
| Utenti | utenti, password iniziale, dispositivi (1); scheda della persona (6) | niente |
| Ruoli e permessi | quattro ruoli, Niente · Vede · Modifica (1); esterno (6); comunicazioni e portale (7) | la riga Integrazioni e la nuova pagina **Funzioni accese** (§9.5) |
| Numerazioni | formato coi pezzi, vale per i numeri nuovi (1); preventivi, ticket, contratti, incarichi, attrezzature (2, 5, 6) | **il formato del codice commessa** come impostazione con l'anteprima, casi condivisi per il telefono senza rete (§9.6) |
| Tariffe e listini | tariffe e rimborsi (1), listino (2), veicoli (3) | un gruppo solo in Impostazioni generali, con i collegamenti (§9.4) |
| Impostazioni fiscali | (4) | niente |
| Modelli documentali | testi dei PDF e delle email (5), modelli dei messaggi (7) | il logo e il piè sui PDF (§9.3); una riga che porta ai due posti |
| Notifiche | campanella, Avvisami sul telefono (7) | pagina **Notifiche**: quali, sul telefono, silenzio la sera; per lo studio a chi vanno gli avvisi del server (§9.7) |
| Registro attività | (1), filtri di fase 6 e 7 | filtro **Integrazioni e sistema** |
| Sicurezza | sessioni nella pagina dell'utente (1); Spegni il portale (7) | **pagina Sicurezza** (§9.8), con la **copia fuori casa cifrata** |
| Backup ed esportazioni | Copie ed esportazioni (1), Spazio sul NAS (5), Cestino (1) | **ripristino provato**, Esporta tutto, Importa clienti e fornitori (§9.10, §7) |
| Personalizzazione | L'app: tema, visita guidata, versione (1) | pagina **Aspetto** (§9.9) |
| (impostazioni senza schermata) | molte chiavi delle fasi 3-6 | **Impostazioni generali**: tutte le chiavi in un posto (§9.4) |
| (stato del server) | `copie`, `spazio`, `/salute` | pagina **Stato del sistema** (§9.11) |
| (controlli finali) | — | pagina **Lista di controllo** (§11) |
| Più aziende | — | non ora (§9.12) |

### 9.2 La pagina Amministrazione: l'elenco

Righe con icona, titolo e una riga di stato (come fase 1 §7), in **cinque gruppi** (prima era un elenco solo che con le
fasi era arrivato a 17 righe):
- **Lo studio**: Dati dello studio ("Studio Tecnico GM · logo sui PDF"), Aspetto ("Tema automatico"), Funzioni accese ("13
  di 18 · Portale spento").
- **Persone e accessi**: Utenti ("4 attivi"), Ruoli e permessi, Sicurezza ("Tutto a posto" verde, o la prima cosa da
  sistemare in rosso tenue), Notifiche ("Avvisi del server a manuel@…").
- **Regole**: Impostazioni generali ("62 impostazioni in 11 gruppi"), Impostazioni fiscali ("Da confermare col
  commercialista" o "Confermate il 05/11"), Numerazioni ("Prossima commessa 26ST048"), Categorie dei documenti, Tipi di
  formazione, Veicoli e rimborso km.
- **Dati**: Copie e ripristino ("Stanotte alle 2:30 · provata il 01/10"), Importa ed esporta, Registro attività, Cestino,
  Spazio sul NAS.
- **Sistema**: Stato del sistema ("Server 1.0.0 · acceso da 12 giorni"), Integrazioni (porta al modulo 17), Lista di
  controllo ("41 di 58 fatti").
Senza `amministrazione` 2 ogni pagina è da leggere (fase 1). Il collaboratore non ha la voce (`amministrazione` 0), ma
ognuno ha **Tu** (cerchio con le iniziali): Cambia la password, Notifiche, Aspetto, Il calendario in altre app, Esci.

### 9.3 Dati dello studio, logo e PDF

- Campi di oggi (fasi 1, 2, 4) più: **Logo** (PNG o JPG fino a 1 MB, almeno 300 px di lato; `caricaFile` con tipo nuovo
  `logo`, salvato in `STUDIO_LOGO`; **Togli il logo**), **Nome breve** (`STUDIO_NOME_BREVE`: nel menu, nelle email, nel
  portale; vuoto = ragione sociale), **Sito** (`STUDIO_SITO`), **Riga in fondo ai PDF** (`PDF_PIEDE`, es. "Iscritto al
  Collegio dei Periti Industriali di Vicenza n. 0000"), **Logo sui PDF** sì/no (`PDF_LOGO`).
- **Anteprima**: sotto i campi, l'intestazione di un PDF com'esce (logo a sinistra, alto 14 mm, ragione sociale e
  indirizzo a destra; piè con la riga e "Pagina 1 / 2" accanto al simbolo di Wisper, come `docs/aspetto.md` §11), in
  bianco e nero (il PDF si stampa così).
- **Dove va il logo**: in cima a rapportino, riepilogo, preventivo, prospetto della fattura, avviso di parcella, lettera,
  contratto di assistenza (`pc/ui/documenti.js`, uguale su telefono e computer); nel portale accanto al nome dello studio;
  **non** nelle email (sono testo). Senza logo i PDF restano identici a oggi (prova §16).
- Il logo è un'immagine **del cliente reale**: nel repository solo un logo finto di esempio.

### 9.4 Impostazioni generali: tutte le chiavi in un posto

Una pagina con **Cerca un'impostazione** in cima e **undici schede**, ognuna col suo **Salva** col bordo (nessun giallo:
come le Impostazioni della 0.4.0). Le etichette, le unità e i limiti li manda il server (`impostazioniGenerali {}`,
§13.6), così telefono e computer dicono le stesse parole. Dopo un salvataggio, la conferma (non una frase fissa sotto il
campo): "Fatto. Vale per le cose nuove: quelle già scritte restano come sono" dove è vero (tariffe, rimborsi, approvazioni).

| Scheda | Chiavi (fase) | Oggi |
|---|---|---|
| **Lavoro e approvazioni** | `APPROVAZIONE` (3: Collaboratori · Tutti · Nessuno), `ORE_GIORNALIERE` (3), `FESTA_PATRONO` (6) | le prime due **senza schermata** |
| **Rapportini e rimborsi** | `EURO_KM`, `AUTO`, `COSTO_ORARIO` (1), `INDENNITA_TRASFERTA` (3), riga **Veicoli e rimborso km** → (3, `ACI_ANNO`) | `INDENNITA_TRASFERTA` **senza schermata** |
| **Preventivi** | `PREVENTIVO_VALIDITA_GIORNI` (2), riga **Condizioni e testi** → Documenti › Modelli (5) | validità **senza schermata** |
| **Fatture e banca** | riga **Impostazioni fiscali** → (4), `SOGLIA_CASSA` (4), riga **Conti** → Banche (4) | |
| **Documenti e file** | `FILE_MAX_MB`, `EMAIL_ALLEGATI_MAX_MB`, `COPIA_INVIATI`, `PREAVVISO_GIORNI`, `CONDIVISIONE_GIORNI` (5) | **senza schermata** |
| **Ticket e assistenza** | `TICKET_TEMPI` (5: tabella Urgente · Alta · Normale · Bassa per "presa in carico entro" e "intervento entro", in ore), `ANTICIPO_TICKET_GIORNI` (5) | **senza schermata** |
| **Persone, mezzi e collaboratori** | le chiavi della fase 6 §4.1 tranne `FESTA_PATRONO` | c'è (fase 6), si sposta qui |
| **Portale clienti** | le chiavi `PORTALE_*` della fase 7 | c'è (fase 7), si sposta qui con **Spegni il portale adesso** |
| **Comunicazioni** | `SOLLECITO_*`, `PROMEMORIA_GIORNI_PRIMA`, `WHATSAPP_APP`, `WHATSAPP_TESTO_MAX`, `COMUNICAZIONI_CONSERVA_ANNI`, `NOTIFICHE_CONSERVA_GIORNI` (7) | c'è (fase 7), si sposta qui |
| **Spazio e copie** | `SPAZIO_AVVISO_MB`, `SPAZIO_MINIMO_MB`, `COPIA_FUORI_MAX_MB` (5), `PROVA_COPIA_GIORNI`, `PROVA_RIPRISTINO_GIORNI`, `ESPORTAZIONI_GIORNI` (8); l'ora della copia (`WISPER_ORA_COPIA` del `.env`) da leggere | le prime tre **senza schermata** |
| **Calendario e ricerca** | `CALENDARIO_GIORNI_PRIMA`, `CALENDARIO_MESI_DOPO`, `RICERCA_FILE`, `RICERCA_FILE_MAX_MB` (8) | nuove |

Altrove (con una riga che porta lì): Dati dello studio (§9.3), Notifiche (`EMAIL_AVVISI`, `NOTIFICHE_ORA`, §9.7),
Sicurezza (`SESSIONE_GIORNI`, `COPIA_CIFRATA`, §9.8), Funzioni accese (`MODULI_SPENTI`), Integrazioni
(`CALENDARIO_PUBBLICO`). **Non si mostrano**: `TICKET_ATTIVO` (chiave del foglio di prima), `TECNICO` (ora è il nome di
ogni utente), `PASSAGGIO_USCITE` (lo cambia chi costruisce, fase 4 §8.4), `REGOLE_FISCALI_CONFERMATE` (si cambia con
Segna confermate), `PORTALE_INFORMATIVA_DATA` (cambia da sola), `CAMBIO` (Lista di controllo).

Controlli (con errori che cominciano con il nome): numeri dentro i limiti mandati dal server ("Ore al giorno: da 1 a
12"), `TICKET_TEMPI` con l'intervento non prima della presa in carico. Cambiare una regola fiscale fa ancora quello che dice
la fase 4 §4.1.

### 9.5 Funzioni accese

Le specifiche chiedono il "controllo delle funzioni abilitate". Uno studio che non usa una parte non deve vederla nel
menu né nella Dashboard.
- Si spengono **solo cinque** funzioni, quelle che il resto non usa: **Portale clienti**, **WhatsApp e comunicazioni**,
  **Collaboratori esterni**, **Mezzi e attrezzature**, **Banche e scadenze**. Le altre sono intrecciate (rapportini,
  commesse, fatture, persone col costo orario) e restano sempre accese: in pagina hanno la riga "Sempre accesa" senza
  interruttore.
- **Spenta** vuol dire: la voce sparisce dal menu di tutti, le sue voci dalla Dashboard e dalla campanella, le sue azioni
  rispondono `{"ok":false,"errore":"La funzione Mezzi e attrezzature è spenta: si accende in Amministrazione","spenta":
  true}`. **I dati restano** e tornano uguali quando la si riaccende. Eccezioni: segnare un incasso da una fattura scrive
  il movimento anche con Banche spenta (serve a "Pagata"); con Comunicazioni spenta la campanella apre lo stesso le
  Notifiche; spegnere il Portale fa anche quello che fa **Spegni il portale adesso** (fase 7 §3.1).
- Ogni interruttore dice cosa cambia prima di spegnere, in un foglio: "Spegnere Mezzi e attrezzature? Sparisce dal menu
  di tutti. Nei rapportini non si scelgono più gli strumenti. I dati restano." con **Spegni** (bordo rosso tenue) e
  **Annulla**.
- Solo il **titolare**. `MODULI_SPENTI` (§12.1); nel registro "funzione spenta: Mezzi e attrezzature" / "accesa". Il
  controllo sta nel punto unico dei permessi (architettura §3): per un modulo spento il livello è 0 per tutti.

### 9.6 Numerazioni e il formato del codice commessa

Resta **26ST001** (decisione 3). La pagina c'è dalla fase 1; la fase 8 la completa:
- **Elenco di tutte le numerazioni** (commessa, rapportino, preventivo, ticket, contratto, incarico, attrezzatura), ognuna
  col prossimo numero in pillola, il formato a parole e "continua" / "riparte a gennaio"; in fondo la riga "Fatture: il
  numero lo dà il programma delle fatture" (fase 4).
- **Modifica del codice commessa**, coi pezzi da toccare: **Anno** (26 · 2026 · niente), **Testo** (ST), **Ordine** (anno
  prima · testo prima), **Separatore** (niente · - · /), **Cifre del numero** (3 · 4). Anteprima grande: "La prossima
  sarà **ST26-0048**" e sotto "Le commesse di prima restano come sono: 26ST001 … 26ST047. Il numero continua da 48."
  Giallo **Salva il formato** con un foglio di conferma che ripete le due frasi. "Riparte ogni anno" per la commessa non
  c'è (decisione di Manuel del 20/10).
- Il server fa già il resto (`salvaNumerazione`, architettura §12.11: vale solo per i numeri nuovi, continua dal più
  alto anche col formato di prima, `formati_precedenti`).
- **Il telefono senza rete** propone il codice di una commessa nuova: con un formato nuovo deve saperlo scrivere da
  solo. La funzione `codiceDa(formato, anno, numero)` sta nel server, in Kotlin e in `pc/ui/regole.js` con gli stessi casi:
  **`server/prove/casi-numerazioni.json`** (12 casi: `{AA}ST{NNN}` col 47 → `26ST047`, col 1000 → `26ST1000`;
  `ST{AA}-{NNNN}` → `ST26-0048`; `{AAAA}/{NN}`; `RAP/{AAAA}/{NNNN}`; anno che cambia a gennaio; un formato col solo numero;
  due commesse di fila senza rete → 48 e 49; un formato di prima più alto del nuovo).

### 9.7 Notifiche

- **Per persona** (Tu › Notifiche e Amministrazione › Notifiche per sé): **Avvisami sul telefono** (fase 7), **Di sera e nei
  festivi niente avvisi sul telefono** (dalle 20 alle 7 e nei giorni festivi della fase 6: restano nella campanella), e un
  interruttore per tipo, raggruppati: **Lavoro** (`assegnato`, `da_mandare`), **Clienti e portale** (`richiesta_portale`,
  `messaggio_portale`, `file_portale`, `preventivo_accettato`, `preventivo_rifiutato`, `domanda`, `rapportino_firmato`,
  `segnalazione`), **Sistema** (`portale_irraggiungibile`, e i nuovi `integrazione_errore`, `copia_non_riuscita`,
  `ripristino_da_provare`), **Per te** (`esportazione_pronta`, `importazione_finita`). Si vedono solo i tipi che la persona
  può ricevere. `utenti.notifiche_tipi` (§12.3): `null` = tutti accesi.
- **Per lo studio** (solo `amministrazione` 2): **Avvisi del server a** (`EMAIL_AVVISI`, una o più email: copia non
  riuscita, server che non risponde, portale; architettura §7) con **Manda una prova** (bordo: un'email dal postino "Prova
  degli avvisi di Wisper"); **Ora del riepilogo del mattino** (`NOTIFICHE_ORA`, le 8:00 della fase 7).
- `notifichePreferenze {}` → `{"ok": true, "telefono": true, "silenzioSera": true, "tipi": {"assegnato": true, ...}}`;
  `salvaNotifichePreferenze {telefono?, silenzioSera?, tipi?}` → `{"ok": true}`. Una notifica spenta non si crea per quella
  persona (non è solo nascosta).

### 9.8 Sicurezza

Una pagina che risponde a "è tutto a posto?" con cose vere, e le azioni per sistemare.
- **In cima**, una scheda per ognuno di questi controlli, verde o rossa tenue con la parola:
  - **Il server interno non è su internet** (controllo `internetinterno`, §4.2): rosso "Una richiesta è arrivata da
    internet sulla porta interna il 21/10 alle 3:12: togli AllowFunnel dal nodo del server" con il collegamento alla
    procedura della fase 7;
  - **Copia fuori casa cifrata** (§9.8 sotto): "Sì" o "No: la copia su Drive si apre senza chiave";
  - **Accessi sbagliati negli ultimi 30 giorni**: "3, nessun blocco" o "12, 1 blocco di 15 minuti per laura@…" (dalla
    tabella `accessi`, esito `password sbagliata`/`bloccato`);
  - **Dispositivi fermi**: "2 dispositivi non si usano da più di 60 giorni" con **Scollega** per ognuno;
  - **Utenti che non entrano da 90 giorni** e sono attivi: proposta **Disattiva** (titolare);
  - **Password iniziali**: "Marco Rossato non ha ancora cambiato la password iniziale" (colonna nuova
    `utenti.password_iniziale`, vera finché la persona non la cambia).
- **Dispositivi collegati** di tutti (persona, nome del dispositivo, app e versione, ultimo uso) con **Scollega**; i feed
  del calendario di tutti con **Togli** (§5.5).
- **Un dispositivo esce da solo dopo** `SESSIONE_GIORNI` (180) giorni senza uso (architettura §3; da 30 a 365).
- In fondo, bordo rosso tenue **Scollega tutti i dispositivi** (solo titolare): tutti, compreso chi chiede, devono entrare
  di nuovo; i rapportini in coda sui telefoni restano e partono dopo l'accesso (fase 1). Foglio di conferma con la
  password del titolare. Nel registro. Serve se si perde un telefono o se qualcosa è strano.
- **Due passaggi per entrare (codice sul telefono)**: non in questa fase. Da fuori casa si entra già con due cose
  (l'account del tailnet sul dispositivo e la password di Wisper); in casa no, ma in casa c'è il Wi-Fi della famiglia.
  Scritto qui perché lo si valuti se un giorno Wisper andasse su internet senza tailnet.
- **La copia fuori casa cifrata** (domanda 2, consiglio sì). Oggi la copia del database su Drive si apre con qualunque
  SQLite: dentro ci sono anche stipendi e documenti personali (fase 6). Proposta:
  - **Accendi la cifratura** (solo titolare): il server crea una chiave di 32 byte casuali, la salva in
    `/data/copia-chiave` (permessi 600, mai nel database, nel foglio, nel registro, nelle copie) e la mostra **una volta**
    in 8 gruppi di 4 lettere e cifre senza 0/O/1/I/L ("K7QM-…") con **Copia** e **L'ho scritta su carta, in due posti** (la
    casella abilita **Fatto**). `COPIA_CIFRATA = true`.
  - Da quella notte la copia fuori casa (database e file) è `wisper-aaaammgg.db.gz.cifrato`: AES-256-GCM
    (`node:crypto`), con un'intestazione di 16 byte (`WISPERC1`, versione, nonce) e il tag alla fine. La copia sul NAS
    resta normale (è già dentro il NAS).
  - `ripristina.js` riconosce il file cifrato e chiede la chiave da tastiera (o `--chiave-file`); chiave sbagliata:
    "La chiave non apre questa copia: controlla di averla scritta giusta" e niente viene toccato.
  - **Se si perde la chiave** e si perde anche il NAS, le copie su Drive non si aprono più: per questo la chiave si
    scrive su carta in due posti, e la prova di ripristino a mano (§9.10) si fa **con la chiave scritta**, non con quella
    del NAS.
  - Spegnere la cifratura: solo titolare, con conferma; le copie già cifrate restano cifrate.
- `sicurezza {}` (amministrazione 1) → `{"ok": true, "internetInterno": {"ok": true, "ultimo": null}, "copiaCifrata":
  false, "accessiSbagliati": {"giorni": 30, "quanti": 3, "blocchi": 0}, "dispositiviFermi": [...], "utentiFermi": [...],
  "passwordIniziali": [{"idUtente": 3, "nome": "Marco Rossato"}], "sessioneGiorni": 180}`; `scollegaTutti {password}`
  (titolare) → `{"ok": true, "scollegati": 9}`; `accendiCifratura {}` (titolare) → `{"ok": true, "chiave":
  "K7QM-…"}` (**solo qui**); `spegniCifratura {conferma}` (titolare).

### 9.9 Aspetto

- **Tema**: Automatico · Chiaro · Scuro (per dispositivo, come oggi). **Menu richiuso** sul computer (si ricorda già:
  qui c'è anche l'interruttore). **Visita guidata · Rifai la visita guidata**. **Versione** e aggiornamenti (come oggi).
- Niente colori a scelta e niente caratteri diversi: il giallo e Figtree sono Wisper (`docs/aspetto.md`). La
  "personalizzazione" delle specifiche per lo studio è il logo e il piè dei PDF (§9.3).

### 9.10 Copie e ripristino provato

La pagina **Copie ed esportazioni** della fase 1 diventa **Copie e ripristino**, e l'esportazione va in **Importa ed
esporta** (§7).
- **Ultima copia** (fase 1): scudo verde "Stanotte alle 2:30", "Sul NAS e fuori casa, su Drive · il foglio è aggiornato",
  "cifrata" se lo è; **Fai una copia adesso** col bordo.
- **Prova automatica** (nuova): ogni `PROVA_COPIA_GIORNI` (30) giorni, dopo la copia della notte, il server:
  1. apre la copia del NAS **in sola lettura** in una cartella temporanea e fa `PRAGMA integrity_check`;
  2. conta le righe delle tabelle principali (rapportini, soggetti, commesse, preventivi, fatture, ore, spese, documenti,
     file, registro) e le confronta con i conteggi salvati nella riga di `copie` al momento della copia (colonna nuova
     `conteggi`);
  3. prende 20 file a caso da `/data/file` e ne rifà lo SHA-256 contro la tabella `file`;
  4. chiede al postino l'impronta della copia fuori casa (`postinoImpronta {cartella, nome}` → `{ok, byte, md5}`: Apps
     Script la calcola con `Utilities.computeDigest`) e la confronta con quella del file mandato (colonna nuova `copie.md5`).
  Esito in `copie_prove`: **Provata il 01/10: tutto torna** (verde) o **Non torna** (rosso tenue, con cosa: "la copia
  fuori casa del 01/10 è diversa da quella mandata") e una voce di sistema in Dashboard. **Prova adesso** col bordo.
- **Ripristino provato a mano** (nuovo), ogni `PROVA_RIPRISTINO_GIORNI` (90) giorni, lo fa **Andrea sul suo computer**
  (mai sul NAS vero, mai sul foglio vero): la procedura è scritta in pagina, passo per passo, e in §11.4; alla fine il
  giallo della pagina **Segna il ripristino provato** apre un foglio: quale copia (elenco), da dove (**Da Drive** · **Dal
  NAS**), **Con la chiave scritta su carta** sì/no (solo con la cifratura), i cinque controlli spuntati, note, **Salva**.
  `copie_prove` con `tipo = a_mano`. Dopo 90 giorni la voce in Da pianificare (§8.7).
- **Elenco** delle copie (fase 1) con, per ognuna, la pillola **Provata** se una prova l'ha usata.
- `provaCopia {}` (amministrazione 2) → `{"ok": true, "prova": {"id": 7, "tipo": "automatica", "copia": "wisper-20261022.db",
  "esito": "ok", "integrita": "ok", "conteggi": {"rapportini": [1532, 1532]}, "file": {"provati": 20, "giusti": 20},
  "fuori": {"md5": "giusto"}}}` (una alla volta: `"Una prova è già in corso"`); `segnaRipristino {copia, da, conChiave,
  controlli: [5 vero/falso], note}` (amministrazione 2) → `{"ok": true, "prova": {...}}`; `copie {}` ha in più
  `prove: [...]` (le ultime 12) e `prossimaProva`.
- **Strumento nuovo** `server/strumenti/ripristina-file.js --da <cartella scaricata da Drive> --dati <cartella>`: rimette
  i file della copia fuori casa (`Wisper/Copie NAS/file/`) dove li vuole il database, controlla lo SHA-256 di ognuno, dice
  quanti mancano (quelli oltre 25 MB sono solo sul NAS: fase 5 §3.8). `ripristina.js` stampa anche "Copia del
  22/10/2026 02:30 · cifrata · versione dello schema 8".

### 9.11 Stato del sistema

Una pagina per "il server sta bene?", da leggere (amministrazione 1):
- **Server**: versione, acceso da ("12 giorni"), versione dello schema ("migrazione 008"), Node, **ora del NAS**
  confrontata con quella del dispositivo (oltre 2 minuti di differenza: "L'ora del NAS è indietro di 6 minuti: i
  rapportini prendono l'ora del NAS", ambra).
- **Database**: grandezza ("86 MB"), ultimo controllo d'integrità (di notte, `PRAGMA quick_check`; una volta a settimana
  `integrity_check`), righe principali.
- **Disco**: libero e usato (la pagina Spazio sul NAS della fase 5 ha il dettaglio).
- **Lavori della notte**: copia, foglio, copia fuori casa, ricorrenze, pulizie (notifiche, accessi, portale), lettura dei
  file, controlli delle integrazioni: per ognuno l'ultimo esito e l'ora ("Ricorrenze · stanotte alle 0:05 · 14 nuove").
- **Collegamenti**: i Collegati e quelli in Errore in breve, con **Apri le Integrazioni**.
- **Dispositivi e versioni**: per ogni dispositivo app e versione, ultimo uso; "Ultima versione: telefono 0.9.0, computer
  0.9.0"; quelli indietro in ambra.
- `statoSistema {}` (amministrazione 1) → `{"ok": true, "server": {"versione": "1.0.0", "acceso": "2026-10-10T07:12:00",
  "schema": 8, "node": "24.12.0", "ora": "2026-10-22T10:05:12"}, "database": {"mb": 86, "integrita": "ok", "controllato":
  "2026-10-22T02:40:00"}, "disco": {...come spazio...}, "lavori": [{"nome": "Copia", "quando": "…", "esito": "ok", "nota":
  "…"}], "versioni": {"ultime": {"telefono": "0.9.0", "computer": "0.9.0"}, "dispositivi": [...]}}`. Il dispositivo manda la
  sua ora nella richiesta (campo `oraDispositivo`), il server risponde con la differenza.

### 9.12 Più aziende

Le specifiche dicono "eventuale gestione futura". Non si fa: se servirà, la strada più sicura per tenere separate le
informazioni è **un database per azienda** (stesso server, una cartella dati per azienda, un indirizzo o un accesso per
azienda), non una colonna "azienda" in ogni tabella. Scritto qui perché nessuno metta colonne "azienda" nel frattempo.

## 10. Il passaggio dei dati veri

### 10.1 Cosa c'è già

- `server/strumenti/importa.js --foglio <copia.xlsx> [--file <cartella>] --dati <cartella>` (architettura §8): legge
  l'esportazione del foglio con le regole di Code.gs, sistema i fogli di prima della 0.3.5, scrive **in una cartella
  nuova** (si rifiuta se c'è già un database), applica tutte le migrazioni (fino alla 008), scrive `controllo.html`
  (righe per scheda, ogni RAP, ore, km ed euro per mese e per cliente, commesse, file citati) e **se una cifra non torna
  esce con errore e non lascia il database**.
- `copia-drive.js --da <url dello script> --dati <cartella>`: copia sul NAS i file citati dal foglio con l'azione `file`
  dello script (solo lettura; gli originali restano su Drive).
- `utente.js --titolare "Nome" email` (password da tastiera).
- Ponte e postino nello script (`apps-script/Ponte.gs`, `postino.md`): con `SERVER_URL` impostato, le versioni vecchie
  passano dal server; se il server non risponde lo script lancia un errore e le app vecchie **riprovano** (un rapportino
  in coda non si perde); `postinoFoglio` riscrive le schede **solo a ponte acceso**.
- Ogni notte il server riscrive nel foglio Rapportini, Clienti, Commesse e Impostazioni (architettura §7): **il foglio
  resta un punto di ritorno aggiornato** (`ricerca-fase8.md` §5).

### 10.2 Cosa si aggiunge agli strumenti

- `importa.js --confronta --foglio <copia.xlsx> --dati <cartella con il database>`: **non scrive niente**; legge il
  foglio e lo confronta col database: rapportini (numero, data, totale, stato), clienti e commesse che sono nel foglio e
  non nel database o diversi. Esce con 0 se tutto torna, 1 se no, e scrive `confronto.html`. Serve due volte: la sera del
  cambio (per essere sicuri che nessuno abbia scritto nel foglio mentre si copiava) e prima di un ritorno indietro (per
  vedere cosa c'è nel server e non nel foglio).
- `importa.js` stampa i **tempi** di ogni passo (lettura, scrittura, controllo) e li scrive in fondo a `controllo.html`,
  per la tabella dei tempi della prova generale.
- `ripristina-file.js` (§9.10).
- Nella migrazione 008: `CAMBIO` = `{"stato": "prima"}`; la Lista di controllo ha i passi del cambio (§11.2, gruppo
  "Il cambio").

### 10.3 Prima: la prova generale (due volte)

Si fa **con la copia vera del foglio**, sul **computer di Andrea**, in una cartella **fuori da OneDrive** (il Desktop di
Andrea è sincronizzato con OneDrive: i dati veri non devono finirci), per esempio `C:\WisperProva\`. Mai sul NAS vero,
mai scrivendo nel foglio.

1. **Manuel o Andrea** apre il foglio vero › File › Scarica › Microsoft Excel (.xlsx) → `C:\WisperProva\foglio-aaaammgg.xlsx`.
2. **Andrea**: `node server/strumenti/importa.js --foglio C:\WisperProva\foglio-aaaammgg.xlsx --dati C:\WisperProva\dati1`.
   Apre `C:\WisperProva\dati1\controllo.html`: deve dire **Tutto torna**. Legge "Da sapere" (righe con il totale diverso dal
   conto rifatto: sono righe corrette a mano nel foglio; Manuel conferma che vanno bene così).
3. **Andrea**: `node server/strumenti/copia-drive.js --da <url dello script> --dati C:\WisperProva\dati1` (solo lettura dello
   script vero). Annota quanti file e quanto tempo.
4. **Andrea**: `node server/strumenti/utente.js --titolare "Prova" prova@esempio.it --dati C:\WisperProva\dati1`, poi
   `node server/src/avvio.js --dati C:\WisperProva\dati1 --porta 8499` (senza `.env`: il postino è "non configurato",
   nessuna email parte). Wisper Ufficio di prova con `--dati <cartella di prova>` contro `http://localhost:8499`.
5. **Andrea e Manuel insieme, 10 controlli** (si spuntano nella Lista di controllo del server di prova, gruppo
   "Prova generale"):
   1. il **riepilogo del mese scorso** di ogni cliente ha lo stesso totale del PDF che Manuel ha mandato;
   2. **Elettrodinamica**: ore, km e totale del mese corrente uguali alla Fine mese di Wisper Ufficio 0.3.6;
   3. **Commesse**: codici, budget, ore e margine uguali (le commesse con la barra rossa sono le stesse);
   4. l'ultimo rapportino scritto c'è, con la **firma** e le **foto** che si aprono;
   5. un rapportino di un anno fa c'è, con lo stato giusto (Fatturato);
   6. i **clienti** sono gli stessi, con partite IVA e telefoni con lo zero davanti;
   7. le **impostazioni** (rimborso km, costo orario, dati dello studio) sono quelle del foglio;
   8. la Dashboard non ha voci strane (giorni senza rapportino veri, non inventati);
   9. il PDF di un rapportino rifatto da Wisper nuovo è uguale a quello di prima;
   10. i tempi: importazione e copia dei file, in minuti.
6. Quello che non torna si corregge (nel codice, o nel foglio con Manuel) e si **rifà da capo** in una cartella nuova
   (`dati2`).
7. **Seconda prova generale**, la settimana prima del cambio, con una copia nuova e i tempi presi con l'orologio: è
   quella che dice quanto dura la sera.
8. Dopo ogni prova: **la cartella `C:\WisperProva\` si cancella** (dati veri sul computer di Andrea; il cestino si svuota).

### 10.4 Va o non va: i criteri, scritti prima

Decide **Andrea**, con l'ok di Manuel, il pomeriggio del giorno scelto. **Va** solo se tutte sono vere:
- la seconda prova generale ha detto **Tutto torna** e i 10 controlli sono spuntati;
- le prove automatiche della versione da installare passano tutte (`controlli-finali.ps1`, §11.1) e le righe "prima del
  cambio" della Lista di controllo sono **Fatte**;
- la versione nuova delle app è pubblicata (col sì di Andrea) o gli APK e l'exe sono pronti da installare a mano;
- il server sul NAS ha la versione giusta, risponde a `/salute`, ha fatto una copia di prova riuscita (locale e fuori
  casa) e la **prova di ripristino** di quella copia è riuscita;
- Code.gs col ponte e il postino è incollato e c'è la **Nuova versione** del deployment, con le proprietà pronte ma
  `SERVER_URL` **non ancora** impostato;
- Manuel ha **mandato i riepiloghi del mese** e segnato i fatturati (il mese è chiuso), e sul suo telefono la pillola
  della rete è sparita (niente rapportini in coda);
- Andrea ha **3 ore libere** (la seconda prova dice quanto serve: si prende il doppio).
Se una manca: **non va**, si sceglie un altro giorno. Il giorno consigliato: un venerdì sera dopo l'invio dei riepiloghi
del mese (il sabato resta di margine).

### 10.5 La sera del cambio, passo per passo

Tempi d'esempio (la seconda prova generale dà quelli veri). "Andrea" = sul suo computer o sul NAS via SSH; i comandi
precisi glieli si dà in chat quel giorno, con i percorsi veri.

| Ora | Chi | Cosa | Se va male |
|---|---|---|---|
| 18:00 | Manuel | Smette di scrivere in Wisper. Telefono: la pillola della rete è sparita. Wisper Ufficio chiuso. | aspetta, o si rimanda |
| 18:05 | Andrea | **La fotografia del prima**: schermate di Wisper Ufficio 0.3.6 (Fine mese del mese corrente e del mese scorso, Commesse, Clienti) in `C:\WisperCambio\prima\` (fuori da OneDrive). | — |
| 18:15 | Andrea | Foglio vero › File › Scarica › Microsoft Excel → `C:\WisperCambio\foglio-cambio.xlsx`; lo copia sul NAS in `/volume1/docker/Wisper-NAS/cambio/` (cartella che non va nel contenitore, né su GitHub). | — |
| 18:25 | Andrea | Sul NAS: `docker compose stop wisper`; sposta la cartella dei dati di prova (`dati` → `dati-prima-del-cambio`): **non si cancella**. | `docker compose start wisper` e si rimanda |
| 18:30 | Andrea | Importa in una cartella nuova (`dati`) con `importa.js` dentro il contenitore (comando con `docker compose run --rm`). | **Non torna** → STOP: ritorno A (§10.6) |
| 18:45 | Andrea | Apre `controllo.html`: **Tutto torna**, "Da sapere" uguale alla seconda prova. | diverso → STOP: ritorno A |
| 18:50 | Andrea | `copia-drive.js` per i file (i minuti li dice la prova). | file mancanti: si annotano, il server parte lo stesso (i file restano su Drive e la copia si ripete) |
| 19:30 | Andrea e Manuel | `utente.js --titolare "Manuel Gasparotto" <email>` (la password la scrive Manuel); l'utente di Andrea col ruolo deciso (domanda 3). | — |
| 19:40 | Andrea | `docker compose up -d wisper`; `/salute` risponde; nei log la migrazione 008 e "copia pianificata alle 02:30". | non parte → ritorno A |
| 19:45 | Andrea | Impostazioni dello script: `SERVER_URL` (l'indirizzo dell'ingresso del ponte se Andrea l'ha scelto, altrimenti l'indirizzo del tailnet: §10.5 sotto) e `SEGRETO_SERVER`. Da qui il foglio non si scrive più. | — |
| 19:50 | Andrea | Nuovo export del foglio e `importa.js --confronta`: **zero differenze** (nessuno ha scritto tra le 18:15 e le 19:45). | differenze → si portano a mano nel server (sono pochissime righe) e si rifà il confronto |
| 20:00 | Andrea | In Wisper (computer): **Fai una copia adesso** → locale, fuori casa e foglio **ok**; Integrazioni: Postino e VIES **Collegato**; Notifiche › Avvisi del server a: l'email di Manuel, **Manda una prova**. | copia non riuscita → si sistema il postino prima di andare avanti |
| 20:15 | Manuel e Andrea | **Prove di fumo**: Manuel entra col telefono (versione nuova) e col computer; Dashboard; la Fine mese (Fatturazione) uguale alla fotografia del prima; l'ultimo rapportino con firma e foto; un PDF di riepilogo uguale. | numeri diversi → ritorno A |
| 20:30 | Manuel | Stasera nessuna scrittura di prova nei dati veri: il primo rapportino vero lo scrive **domani**, e Andrea guarda che arrivi. | — |
| 20:30 | Andrea | Lista di controllo › Il cambio: **Cambio fatto alle 20:30** (`CAMBIO.stato = fatto`, data). | — |

**Il ponte**, secondo la risposta di Andrea sull'ingresso (domanda 1):
- **Con un ingresso** (Tailscale con Funnel sulla 8443, solo `/ponte` e `/salute`, fase 7 §3.1; o il tunnel Cloudflare):
  `SERVER_URL` = quell'indirizzo. Un telefono o un computer rimasto alla 0.4.0 continua a lavorare attraverso il ponte per
  **4 settimane**, poi il ponte si chiude.
- **Senza ingresso**: `SERVER_URL` = l'indirizzo del tailnet. Lo script **non lo raggiunge**, quindi per ogni richiesta di
  una versione vecchia lancia un errore: le app 0.4.0 **non scrivono più nel foglio** e tengono i rapportini **in coda**,
  dove non si perdono; partono quando quel dispositivo viene aggiornato (le versioni nuove vanno al server). Quella sera si
  aggiornano tutti i dispositivi di Manuel (pochi). Con `SERVER_URL` impostato il postino riscrive il foglio ogni notte
  (serve al ritorno indietro).

### 10.6 Come si torna indietro

| Quando | Ritorno | Cosa si perde |
|---|---|---|
| **A. Prima delle 19:45** (prima di `SERVER_URL`) | `docker compose stop wisper`; la cartella `dati` nuova si rinomina `dati-cambio-fallito-<data>` (non si cancella: serve a capire); si rimette `dati-prima-del-cambio`; il foglio non è mai stato toccato e le app 0.4.0 lavorano come prima. Si capisce cosa non tornava, si rifà una prova generale, si sceglie un altro giorno. | niente |
| **B. Dopo le 19:45, fino a 7 giorni** | 1. **Fai una copia adesso**: il server riscrive il foglio con Rapportini, Clienti, Commesse e Impostazioni di adesso. 2. `importa.js --confronta` con un export nuovo del foglio: deve dire zero differenze su quelle schede. 3. Si toglie `SERVER_URL` dallo script (il ponte si spegne: lo script torna a lavorare sul foglio). 4. Sui dispositivi si rimette la 0.4.0 (release su GitHub) e si ricollega il foglio col codice. 5. Il server **resta acceso e non si cancella** (copia notturna compresa): quello che non sta nel foglio (preventivi, attività, ore, spese, fatture… nati in quei giorni) aspetta lì il cambio successivo. | niente di rapportini, clienti, commesse; le cose delle fasi 2-7 nate in quei giorni restano solo nel server (non nel foglio) |
| **Dopo 7 giorni** | non si torna al foglio: si correggono i problemi nel server (con la copia della notte prima, `ripristina.js`, se servisse). | — |

**Fa scattare il ritorno**: un numero del controllo che non torna; Manuel che non riesce a scrivere o mandare un
rapportino e non si sistema in serata; il server fermo più di 4 ore in un giorno di lavoro nella prima settimana; un dato
perso. La decisione è di Andrea, con Manuel.

**Aggiornamento del 3 novembre 2026: il cambio senza mani.** Da quando lo script del foglio si incolla in un file solo
e il NAS prende da sé il foglio e i file (porta-google.md §14ter), e da quando Andrea ha chiesto niente prove a metà per
lui ("la prova la facciamo quando abbiamo tutto, con il prodotto finito"), §10.3 e §10.5 cambiano così:
- **La prova generale la faccio io, sul NAS**, in un contenitore usa e getta che vede solo la sua cartella
  (`prova-generale/<data>`, mai `./dati`): `scarica-foglio.js`, `importa.js`, `copia-drive.js --postino`. Niente
  computer di Andrea, niente OneDrive; la cartella si cancella subito dopo. Fatta il 3/11/2026: **Tutto torna**; tempi
  foglio 9 s, importazione 2 s, file 43 s. Un solo file non è passato: la firma di una bozza della prima versione, che sta
  fuori dalla cartella Wisper di Drive (resta su Drive col suo collegamento). I "Da sapere" sono rapportini dei mesi di
  prova con totale 0 nel foglio: restano com'erano.
- **I 10 controlli con Manuel** si fanno la sera del cambio, sul prodotto finito.
- **La sera**, circa mezz'ora: (1) Manuel smette di scrivere, sul telefono niente rapportini in coda; (2) copia dei dati
  sul NAS (un minuto), server coi dati veri, `ponte.js si`; (3) Manuel scrive la sua password in una finestra aperta sul
  computer di Andrea (`utente.js --titolare`), Andrea lo stesso per il suo utente (domanda 3); (4) pubblico le app del
  gestionale: telefono e computer di Manuel si aggiornano da soli; (5) Manuel entra, col telefono con email e password e
  col computer col QR; (6) i controlli sul prodotto finito. Se qualcosa non torna, il ritorno di §10.6.
- **La copia dei dati è già fatta (3/11/2026)**: Andrea ha chiesto di farla subito ("mio padre in questi giorni non lo
  sta utilizzando; se cambiasse te lo dico io"). Server fermato, `dati` messa da parte come
  `dati-prima-del-cambio-<data>` (non si cancella), il foglio scaricato in `cambio/` (fuori dal contenitore e da GitHub),
  importazione **Tutto torna**, file di Drive copiati, server riacceso: postino, porta e portale attivi. Il **ponte resta
  spento**: se Manuel scrive con la 0.4.0, scrive nel foglio. Quindi la sera, prima del passo (2): `importa.js
  --confronta` con un foglio scaricato di nuovo; zero differenze, si va avanti; altrimenti si rifà la copia (un minuto).
- **Andrea è il secondo titolare** (tutti i permessi, sua scelta del 3/11: "developer"): si crea **dopo** Manuel, perché
  `titolare()` è il primo titolare attivo (ponte, avvisi).
- **La sera del cambio è stata il 3/11/2026**: confronto zero differenze, account (Manuel id 1, Andrea id 2), app 1.0.0
  sul telefono di Manuel via cavo (stessa firma) ed entrato, `ponte.js si`, release v1.0.0 pubblicata (commit `ea11ca5`).
  Il computer di Manuel si aggiorna da solo alla prima apertura.

### 10.7 Dopo: le prime quattro settimane

- **Ogni mattina della prima settimana** (Andrea, 2 minuti): Stato del sistema e Integrazioni verdi, la copia della notte
  riuscita, nessuna voce di sistema in Dashboard; un confronto `--confronta` al terzo giorno.
- **Fine della prima settimana**: Manuel fa la prima fine mese (o il primo riepilogo) col gestionale; se torna, la
  finestra del ritorno B si chiude (Lista di controllo: **Ritorno chiuso**).
- **Fine della quarta settimana**: si chiude il ponte (via Funnel dalla 8443 o il tunnel del ponte); il foglio resta come
  copia di sola lettura riscritta ogni notte; il CODICE vecchio si cambia (le versioni vecchie non entrano più nemmeno
  per sbaglio).
- **Dopo 30 giorni**: gli export xlsx del foglio e la fotografia del prima sul computer di Andrea si cancellano
  (`C:\WisperCambio\`); sul NAS restano la cartella `dati-prima-del-cambio` (vuota di dati veri) e, per un anno, l'export
  del cambio in `/volume1/docker/Wisper-NAS/cambio/` (da decidere col consulente privacy se tenerlo).
- **Prima prova di ripristino a mano** entro un mese dal cambio (§9.10), con una copia vera presa da Drive.

## 11. La lista di controllo finale

### 11.1 Come funziona

La lista sta **dentro Wisper** (Amministrazione › Lista di controllo, tabella `controlli_finali`, righe create dalla
migrazione 008) così resta la prova di cosa è stato controllato, da chi e quando. Tre tipi di riga:

| Tipo | Chi la segna | Come |
|---|---|---|
| **Automatica** | Andrea | lancia `strumenti\controlli-finali.ps1` sul suo computer: esegue tutte le prove (`node --test server/prove/`, `node --test "pc/prove/*.test.js"`, `node --test "apps-script/prove/*.test.js"`, `:app:testDebugUnitTest`, le prove dei flussi di `pc/prove/`) e scrive `controlli-finali.html` (per ogni gruppo: prove, passate, fallite, tempo). Poi **Segna** sulla riga, e allega il rapporto (va nell'archivio, categoria nuova **Collaudo di Wisper**). |
| **Dal server** | nessuno: il server la calcola a ogni apertura della pagina | coi dati veri: copie, prove di ripristino, collegamenti, versioni dei dispositivi, sicurezza, impostazioni che mancano |
| **A mano** | chi è scritto nella riga (Andrea, Manuel) | con i **dati finti** (server `--prova`, emulatore, Edge senza finestra) o, solo nel gruppo "Prova generale", con la copia vera sul computer di Andrea; si segna **Fatto** o **Non va** con una nota, e si può allegare una schermata |

Stati: **Da fare**, **Fatto** (verde, "Andrea · 05/11"), **Non va** (rosso tenue, con la nota). Una riga automatica
**invecchia**: se dopo la data in cui è stata segnata il server ha cambiato versione, torna **Da rifare** (ambra). Le
righe dal server non si segnano: sono verdi o rosse da sole.

**Il gestionale è completo** quando tutte le righe sono Fatte (o verdi), tranne quelle che dipendono da una risposta di
Andrea, che restano **In attesa di una scelta** e non bloccano. In cima alla pagina: "41 di 58 fatti · 2 non vanno · 3 in
attesa di una scelta" e la barra.

### 11.2 Le righe, modulo per modulo

`A` = automatica, `S` = dal server, `M` = a mano coi dati finti, `G` = prova generale. Per ogni modulo vale il criterio
delle specifiche §7: **salvare, cambiare, ritrovare, cercare, permessi**, provati davvero.

| Chiave | Gruppo | Riga | Tipo |
|---|---|---|---|
| `M01.1` | 01 Dashboard | Ogni ruolo vede le sue voci e i suoi quattro riquadri (§8.5); una cosa, una voce; tetti e Tutto quello che c'è da fare | A |
| `M01.2` | 01 Dashboard | Ogni voce apre la pagina giusta già filtrata (tutte le `collegamento.pagina` delle fasi 1-8) | A |
| `M02.1` | 02 Clienti e fornitori | Nuovo, cambia, archivia e ripristina; doppione per nome e partita IVA; Controlla la partita IVA | A |
| `M02.2` | 02 Clienti e fornitori | Importa da un file CSV ed Excel: nuovi, già presenti, da sistemare; Archivia quelli importati | A + M |
| `M03.1` | 03 Commesse | Codice che continua; formato cambiato senza ricodificare; prestazioni; duplica come modello; archivia | A |
| `M03.2` | 03 Commesse | Costi e margine uguali alla 0.4.0 coi dati della prova generale | G |
| `M04.1` | 04 Preventivi | I 16 casi al centesimo in server, Kotlin e computer; revisione; accettazione; commessa una volta sola | A |
| `M05.1` | 05 Attività e calendario | Ricorrenze questa/future/tutte; sovrapposizioni; file ICS valido (righe, UID, ore, giorni interi) | A |
| `M05.2` | 05 Attività e calendario | Il file importato in Google Calendar e nel classico Outlook; ICSx⁵ sull'emulatore che si aggiorna dopo uno spostamento e un annullamento | M |
| `M06.1` | 06 Ore e rapportini | Rapportino a tre passi con firma, coda senza rete, stati che non tornano indietro, approvazioni | A |
| `M06.2` | 06 Ore e rapportini | Riepiloghi del mese scorso uguali ai PDF mandati | G |
| `M07.1` | 07 Spese e trasferte | Casi delle ore e spese; rimborsi; foto dello scontrino | A |
| `M08.1` | 08 Fatturazione | Casi delle fatture; una cosa fatturata una volta; XML di ritorno; note di credito | A |
| `M08.2` | 08 Fatturazione | Regole fiscali confermate dal commercialista | S |
| `M08.3` | 08 Fatturazione | Il prospetto passato al programma di Manuel e l'XML emesso tornato in Wisper, con una fattura vera di prova del programma | M (Manuel) |
| `M09.1` | 09 Banche e scadenze | Saldo previsto prudente, sotto soglia, impegni ricorrenti, proposte 1040 e bollo | A |
| `M10.1` | 10 Persone | Ferie e saldi, presenze, riservati solo al titolare, registro dei dati riservati | A |
| `M11.1` | 11 Documenti | Revisioni con approvazione; collegamenti OneDrive; cerca dentro i file (PDF, DOCX, XLSX, DXF); un file non visto non dà estratti | A |
| `M12.1` | 12 Ticket | Priorità, tempi, rapportino del ticket, da ticket a Da fatturare, contratti | A |
| `M13.1` | 13 Mezzi e attrezzature | Tarature (avviso e blocco), prestiti, strumenti nel rapportino | A |
| `M14.1` | 14 WhatsApp e comunicazioni | Casi di WhatsApp uguali in server, Kotlin e computer; proposte di Da mandare; notifiche alla persona giusta | A |
| `M15.1` | 15 Portale clienti | Le 13 prove di sicurezza della fase 7 §13.2 (le prime 11 automatiche) | A |
| `M15.2` | 15 Portale clienti | Dal telefono in 4G: il portale si apre, il server interno no | M (Andrea), **in attesa di una scelta** finché non c'è l'ingresso |
| `M16.1` | 16 Collaboratori esterni | L'esterno vede solo le sue cose; compensi; DURC | A |
| `M17.1` | 17 Integrazioni | Nessuna integrazione in Errore | S |
| `M17.2` | 17 Integrazioni | Ogni Non collegato ha il motivo in pagina; nessuno stato senza controllo | A |
| `M18.1` | 18 Amministrazione | Dati dello studio completi (partita IVA, codice fiscale, indirizzo, albo, polizza) | S |
| `M18.2` | 18 Amministrazione | Ogni impostazione delle fasi 1-8 ha una schermata (§9.4) o è nell'elenco di quelle nascoste | A |
| `M18.3` | 18 Amministrazione | Senza logo i PDF sono identici a prima; col logo l'intestazione è giusta in bianco e nero | A + M |

### 11.3 Trasversali

| Chiave | Gruppo | Riga | Tipo |
|---|---|---|---|
| `T01` | Permessi | **Ogni azione** del server ha modulo e livello dichiarati: una prova legge l'elenco delle azioni dal codice e fallisce se una non li ha | A |
| `T02` | Permessi | Per ognuno dei cinque ruoli (titolare, amministrazione, collaboratore, lettura, esterno) e per ogni azione: "non deve vedere / non deve scrivere" secondo la tabella dei permessi; senza `costi` nessun campo dei soldi a nessuna profondità | A |
| `T03` | Permessi | Le quattro persone di prova provano a mano telefono e computer: menu, Dashboard, una scrittura vietata per ruolo | M |
| `T04` | Senza rete | Telefono in modalità aereo: ogni cosa che le fasi dicono "si fa senza rete" va in coda e parte; ogni cosa "si legge senza rete" si legge; le altre dicono "Serve la rete" | M |
| `T05` | Tema scuro | Ogni schermata di telefono e computer in chiaro e in scuro confrontata coi prototipi delle fasi 1-8 (le schermate in `docs/diario/`) | M |
| `T06` | Accessibilità | Contrasto ≥ 4,5:1 del testo e ≥ 3:1 di bordi e icone (colori di `docs/aspetto.md`); tocchi ≥ 48 dp (Accessibility Scanner di Google, gratis); bersagli ≥ 24 px sul computer (WCAG 2.2, 2.5.8) | A + M |
| `T07` | Accessibilità | TalkBack sul telefono e Narratore su Windows nei cinque percorsi principali (rapportino con firma, nuova spesa, Dashboard, preventivo, fattura); fuoco visibile col tasto Tab; testo al 200% senza parole tagliate; meno animazioni rispettato | M |
| `T08` | Privacy | Nessun dato vero nel repository e nelle schermate (`rilascio.ps1` cerca anche email, IBAN, partite IVA che non sono quelle di esempio) | A |
| `T09` | Privacy | Informative (portale, dipendenti), tempi di conservazione, fornitori fuori UE, Gmail o Workspace: confermati col consulente privacy | M (Andrea e Manuel) |
| `T10` | Privacy | Le pulizie di conservazione girano (notifiche, accessi del portale, sessioni) | S |
| `T11` | Sicurezza | Il server interno non è su internet; copia fuori casa cifrata; nessuna password iniziale vecchia di più di 7 giorni | S |
| `T12` | Versioni | Tutti i dispositivi usati negli ultimi 30 giorni hanno l'ultima versione | S |
| `T13` | Copie | Ultima copia riuscita (locale, fuori casa, foglio) nelle ultime 26 ore; prova automatica degli ultimi 30 giorni riuscita | S |
| `T14` | Copie | Ripristino a mano negli ultimi 90 giorni (§11.4) | S (letto da `copie_prove`) |
| `T15` | Carico | Prova di carico con dieci anni di dati finti dentro i tempi di §11.5 | A + M (sul NAS: Andrea) |

Gruppo **Il cambio**: le righe di §10.4 (prima del cambio), i 10 controlli della prova generale (§10.3, tipo G), i passi
della sera (§10.5) da spuntare mentre si fanno, e **Ritorno chiuso** (§10.7).

### 11.4 Il ripristino a mano (ogni 90 giorni, Andrea)

Sul computer di Andrea, in `C:\WisperRipristino\` (fuori da OneDrive), con una copia vera presa da Drive:
1. da Drive, cartella `Wisper/Copie NAS/database/`, scarica la copia più recente (`.db.gz` o `.db.gz.cifrato`) e la
   cartella `file/`;
2. `node server/strumenti/ripristina.js <copia> --dati C:\WisperRipristino\dati` (con la cifratura chiede la **chiave scritta
   su carta**);
3. `node server/strumenti/ripristina-file.js --da <cartella file scaricata> --dati C:\WisperRipristino\dati`;
4. `node server/src/avvio.js --dati C:\WisperRipristino\dati --porta 8499` (senza `.env`: nessuna email, nessuna copia
   parte) ed entra col suo utente;
5. i cinque controlli: l'ultimo rapportino di ieri c'è; il riepilogo del mese ha lo stesso totale che sul NAS; una foto e
   un documento si aprono; il numero della prossima commessa è uguale; l'ultima riga del registro è di ieri sera;
6. in Wisper vero: Copie e ripristino › **Segna il ripristino provato**; poi `C:\WisperRipristino\` si cancella.

### 11.5 La prova di carico

`node server/strumenti/dati-finti.js --anni 10 --persone 5 --dati <cartella>` (strumento nuovo, solo dati inventati con
nomi di esempio, data di partenza fissa): circa 11.000 rapportini, 30.000 righe di ore, 8.000 spese, 1.500 commesse, 600
clienti e fornitori, 3.000 preventivi, 2.500 fatture e 2.000 ricevute, 20.000 attività, 3.000 ticket, 5.000 documenti
(file piccoli finti), 500.000 righe di registro, 60.000 di accessi. Poi `node server/prove/carico.js --server <url>`
misura (mediana e 95° percentile di 20 chiamate, utente titolare):

| Cosa | Sul PC di Andrea | Sul NAS (Andrea, con la cartella di prova, mai i dati veri) |
|---|---|---|
| `anagrafiche`, `rapportini` del mese, `commesse`, `documenti` con ricerca | < 150 ms | < 400 ms |
| `dashboard` (tutte le fasi) e `dashboard {tutto}` | < 300 ms | < 800 ms |
| `documenti {testo, dentro}` su 5.000 documenti | < 200 ms | < 500 ms |
| `esporta` rapportini di 10 anni | < 2 s | < 5 s |
| `esportaTutto` | < 15 s | < 40 s |
| copia della notte (VACUUM INTO) | < 30 s | < 2 min |
| grandezza del database | annotata (atteso sotto 600 MB) | — |
| telefono: prima lettura dopo l'accesso (emulatore, rete "4G" dell'emulatore) | < 3 s | — |

Se una riga sfora: si cerca l'indice che manca o la pagina che legge troppo, prima del cambio.

## 12. Dati (migrazione 008)

`server/src/migrazioni/008-integrazioni-controlli.sql` + `008-integrazioni-controlli.js`, con la copia
`wisper.db.prima-8` prima (come le altre). Istanti col fuso nel database, `"2026-10-22T10:05:00"` nelle risposte. Le
tabelle da cui si tolgono righe hanno `AUTOINCREMENT`. Le tabelle che si rifanno (per un CHECK) si rifanno **con tutte le
colonne di oggi**, comprese quelle delle fasi 4-7.

### 12.1 Impostazioni nuove

| Chiave | Valore iniziale | Cosa |
|---|---|---|
| `STUDIO_LOGO` | `""` | id del file del logo (tipo `logo`) |
| `STUDIO_NOME_BREVE` | `""` | nome nel menu, nelle email, nel portale (vuoto = `RAGIONE_SOCIALE`) |
| `STUDIO_SITO` | `""` | |
| `PDF_LOGO` | `true` | il logo in cima ai PDF |
| `PDF_PIEDE` | `""` | riga in fondo ai PDF |
| `MODULI_SPENTI` | `[]` | funzioni spente, tra `portale`, `comunicazioni`, `collaboratori`, `mezzi`, `banche` |
| `NOTIFICHE_ORA` | `"08:00"` | ora del riepilogo del mattino (fase 7) |
| `SESSIONE_GIORNI` | `180` | un dispositivo esce dopo tanti giorni senza uso |
| `COPIA_CIFRATA` | `false` | copia fuori casa cifrata (§9.8); la chiave **non** è un'impostazione |
| `PROVA_COPIA_GIORNI` | `30` | ogni quanto il server prova da solo l'ultima copia |
| `PROVA_RIPRISTINO_GIORNI` | `90` | dopo quanti giorni la Dashboard chiede il ripristino a mano |
| `ESPORTAZIONI_GIORNI` | `7` | quanto resta il file di Esporta tutto |
| `CALENDARIO_GIORNI_PRIMA` | `30` | |
| `CALENDARIO_MESI_DOPO` | `12` | |
| `CALENDARIO_PUBBLICO` | `false` | feed del calendario anche dall'ingresso del portale (domanda 4) |
| `RICERCA_FILE` | `true` | cerca dentro i file |
| `RICERCA_FILE_MAX_MB` | `20` | |
| `CAMBIO` | `{"stato": "prima"}` | `prima` · `prova` · `fatto` · `chiuso`, con `provaIl`, `cambioIl`, `chiusoIl` |

### 12.2 Numerazioni nuove

Nessuna.

### 12.3 Colonne nuove su tabelle che ci sono

- `utenti`: `riquadri` TEXT JSON (`null` = quelli del ruolo) · `notifiche_tipi` TEXT JSON (`null` = tutti) ·
  `notifiche_silenzio` INTEGER NOT NULL DEFAULT 1 (di sera e nei festivi niente avvisi sul telefono) · `password_iniziale`
  INTEGER NOT NULL DEFAULT 0 (1 quando la password l'ha data `salvaUtente` o `nuovaPassword`, 0 dopo `cambiaPassword`).
- `copie`: `conteggi` TEXT JSON · `md5` TEXT (del file mandato fuori casa) · `cifrata` INTEGER NOT NULL DEFAULT 0.
- `file`: tipo nuovo `logo` (CHECK rifatto come nelle 002-007).
- `sessioni`: `tailnet` TEXT (l'ultimo `Tailscale-User-Login` visto, per "ultimo accesso dal tailnet").

### 12.4 Tabelle nuove

**`integrazioni`**: `chiave` TEXT PK · `stato` (`collegato` | `da_configurare` | `errore` | `non_collegato` | `in_corso`) ·
`controllato_il` · `esito` (frase dell'ultimo controllo) · `millisecondi` · `errori_di_fila` INTEGER DEFAULT 0 · `account`
TEXT (il nome dell'account com'è scritto da Andrea; mai segreti) · `modificato`. Le righe nascono dalla migrazione per i
collegamenti con un controllo (§4.2); il catalogo (nomi, frasi, costi, motivi dei Non collegato) sta nel codice
(`server/src/integrazioni/elenco.js`) e il server lo manda alle app.

**`integrazioni_controlli`**: id AUTOINCREMENT · `chiave` · `quando` · `esito` (`ok` | `errore`) · `millisecondi` · `testo`.
Tenuti 90 giorni.

**`calendario_feed`**: id AUTOINCREMENT · `utente_id` · `nome` · `token_hash` TEXT UNIQUE (SHA-256) · `cosa` TEXT JSON
(`{"attivita": "mie"|"studio", "assenze": bool, "scadenze": bool}`) · `dettagli` 0/1 · `pubblico` 0/1 · `creato` ·
`ultimo_uso` · `agente` · `letture` INTEGER DEFAULT 0 · `revocato_il`.

**`file_testo`**: tabella virtuale `fts5(testo, file_id UNINDEXED, tokenize='unicode61 remove_diacritics 2')`.
**`file_lettura`**: `file_id` TEXT PK · `stato` (`da_leggere` | `letto` | `in_parte` | `senza_testo` | `non_si_legge` |
`troppo_grande`) · `caratteri` · `pagine` · `letto_il` · `motivo`. Un file tolto per sempre (cestino svuotato) esce da
tutte e due.

**`esportazioni`**: id AUTOINCREMENT · `utente_id` · `tipo` (`tutto`) · `stato` (`in_corso` | `pronta` | `errore`) ·
`percorso` (sotto `/data/esportazioni/`) · `byte` · `righe` TEXT JSON · `creato` · `scade` · `scaricata_il` · `errore`.

**`importazioni`**: id AUTOINCREMENT · `utente_id` · `tipo` (`soggetti`) · `nome_file` · `righe` · `nuovi` · `completati` ·
`saltati` · `errori` TEXT JSON · `ids` TEXT JSON (le anagrafiche nate) · `quando` · `archiviati_il`.

**`dashboard_nascoste`**: (`utente_id`, `oggetto`) PK · `tipo` · `fino` · `creato`.

**`copie_prove`**: id AUTOINCREMENT · `quando` · `tipo` (`automatica` | `a_mano`) · `copia` (nome del file) · `da`
(`nas` | `drive`) · `esito` (`ok` | `errore`) · `dettagli` TEXT JSON · `utente_id` · `con_chiave` 0/1 · `note`.

**`controlli_finali`**: `chiave` TEXT PK (`M01.1`, `T02`, `C05`…) · `gruppo` · `ordine` · `testo` · `tipo` (`automatica` |
`server` | `a_mano` | `prova_generale`) · `chi` (testo: "Andrea", "Manuel") · `stato` (`da_fare` | `fatto` | `non_va` |
`attesa`) · `il` · `utente_id` · `versione` (del server quando è stata segnata) · `nota` · `documento_id`. Le righe di
§11.2-§11.3 e del gruppo Il cambio nascono dalla migrazione.

### 12.5 Cosa fa la migrazione ai dati di oggi

- Le impostazioni e le tabelle nuove; le righe di `integrazioni` (tutte `da_configurare` finché il primo controllo non
  gira, pochi minuti dopo l'avvio); le righe di `controlli_finali` (tutte Da fare).
- Ogni file dei documenti (non riservati) prende una riga `file_lettura` **Da leggere**: la lettura parte di notte.
- `utenti.password_iniziale` = 0 per tutti (non si sa chi l'ha cambiata).
- La tabella `file` si rifà (tipo `logo`) con tutte le righe.
- Prova (`server/prove/migrazione-008.test.js`): un database della fase 7 con dati in ogni tabella; dopo, le azioni di
  prima rispondono uguali campo per campo, i PDF uguali, la Dashboard con le stesse voci (meno i doppioni di §8.1, che la
  prova elenca uno per uno).

## 13. Azioni nuove (su `/exec`, con modulo e livello)

Tutte con `ok`; quelle che scrivono vogliono una POST (architettura §12.1). Le forme delle risposte sono nelle sezioni
indicate.

### 13.1 Integrazioni (modulo `integrazioni`)

- `integrazioni {}` (integrazioni 1) → `{"ok": true, "integrazioni": [{"chiave": "postino", "nome": "Postino", "cosa":
  "Email, copie su Drive e foglio di ogni notte", "gruppo": "collegati", "stato": "collegato", "controllato":
  "2026-10-22T10:00:00", "millisecondi": 412, "esito": "Risponde · Google lascia mandare ancora 86 email oggi", "account":
  "il Gmail del foglio di Wisper", "esce": "Email e PDF ai clienti; la copia del database", "costo": "0 €", "regole":
  "Google", "provaAdesso": true}, {"chiave": "sdi", "nome": "Invio allo SDI", "gruppo": "noncollegati", "stato":
  "non_collegato", "perche": "Le fatture le emette il programma di Manuel: Wisper le prepara", "servirebbe": "…", "costo":
  "Aruba circa 30 € l'anno più il Premium; Openapi circa 0,10-0,15 € a fattura"}], "numeri": {"collegati": 8,
  "daSistemare": 4, "noncollegati": 11, "errori": 0}}`. `gruppo`: `collegati` | `scelta` | `noncollegati`.
- `integrazione {chiave}` (integrazioni 1) → la stessa riga più `controlli` (gli ultimi 20: `{quando, esito,
  millisecondi, testo}`) e `impostazioni` (solo per calendario, ricerca, portale: le chiavi coi valori).
- `provaIntegrazione {chiave}` (integrazioni 2) → `{"ok": true, "integrazione": {...stato nuovo...}}`; di nuovo entro un
  minuto: `"Hai appena provato: riprova fra un minuto"`; un Non collegato: `"Non è collegato: non c'è niente da provare"`.
- `salvaIntegrazione {chiave, account?, impostazioni?}` (integrazioni 2; le impostazioni che toccano internet,
  `CALENDARIO_PUBBLICO` e quelle del portale, vogliono `amministrazione` 2) → `{"ok": true, "integrazione": {...}}`.

### 13.2 Calendario (modulo `attivita`)

`esportaCalendario`, `feedCalendario`, `nuovoFeed`, `revocaFeed` (§5.4-§5.5). Strada senza Bearer: `GET
/calendario/<chiave>.ics` (porta 8400; sulla 8401 solo con `CALENDARIO_PUBBLICO` e feed pubblici).

### 13.3 Documenti (modulo `documenti`)

`documenti {testo, dentro?}` con `trovato` (§6.2), `letturaFile`, `rileggiFile` (§6.3).

### 13.4 Importa ed esporta

`esportaTutto`, `esportazioni` (titolare), `GET /esportazione/<id>` (§7.1); `leggiImport`, `controllaImport`,
`importaSoggetti`, `archiviaImportati` (clienti 2, §7.2); `importazioni {}` (clienti 1) → l'elenco con i numeri.

### 13.5 Dashboard (modulo `dashboard`)

- `dashboard {per?, tutto?}`: ogni voce ha in più `oggetto`, `famiglia`, `area` (`lavoro` | `soldi` | `persone` |
  `documenti` | `clienti` | `sistema`), `nascondibile` (true per `info` di Da pianificare); ogni sezione ha `quante`;
  `riquadri` = i quattro della persona `[{"chiave": "daFatturare", "numero": 2180.4, "unita": "euro", "rosso": false,
  "collegamento": {...}}]`; `nascoste` = quante. Con `tutto: true` nessun tetto né raggruppamento.
- `salvaRiquadri {riquadri: ["daFatturare", "scaduto", "ticketAperti", "daApprovare"]}` → `{"ok": true}` (4, tra quelli
  che la persona può vedere: `"Questo riquadro non è per il tuo ruolo"`).
- `nascondiVoce {oggetto, giorni?: 30}` → `{"ok": true}` (solo voci nascondibili); `mostraNascoste {}` → `{"ok": true}`.

### 13.6 Amministrazione (modulo `amministrazione`)

- `impostazioniGenerali {}` (amministrazione 1) → `{"ok": true, "gruppi": [{"chiave": "lavoro", "nome": "Lavoro e
  approvazioni", "voci": [{"chiave": "APPROVAZIONE", "etichetta": "Cosa va approvato", "tipo": "scelta", "scelte":
  [["collaboratori", "Le cose dei collaboratori"], ["tutti", "Tutto"], ["nessuno", "Niente"]], "valore": "collaboratori"},
  {"chiave": "ORE_GIORNALIERE", "etichetta": "Ore di lavoro al giorno", "tipo": "numero", "min": 1, "max": 12, "unita":
  "ore", "valore": 8}]}, {"chiave": "fisco", "nome": "Fatture e banca", "collegamenti": [{"nome": "Impostazioni
  fiscali", "pagina": "amministrazione", "sezione": "fiscale"}], "voci": [...]}]}`. Si salva con `salvaImpostazioni` (come
  sempre); il server controlla i limiti.
- `funzioni {}` (amministrazione 1) → `{"ok": true, "funzioni": [{"modulo": "portale", "nome": "Portale clienti",
  "accesa": false, "spegnibile": true, "cosaCambia": "…"}, {"modulo": "rapportini", "nome": "Ore e rapportini", "accesa":
  true, "spegnibile": false}]}`; `salvaFunzioni {modulo, accesa}` (**titolare**) → `{"ok": true}`.
- `notifichePreferenze`, `salvaNotifichePreferenze` (ognuno le sue, §9.7); `provaAvvisi {}` (amministrazione 2) → `{"ok":
  true, "a": ["manuel@…"]}`.
- `sicurezza`, `scollegaTutti`, `accendiCifratura`, `spegniCifratura` (§9.8).
- `provaCopia`, `segnaRipristino` (§9.10); `statoSistema` (§9.11).
- `controlliFinali {}` (amministrazione 1) → `{"ok": true, "riassunto": {"fatti": 41, "totale": 58, "nonVanno": 2,
  "attesa": 3}, "gruppi": [{"nome": "01 Dashboard", "righe": [{"chiave": "M01.1", "testo": "…", "tipo": "automatica",
  "chi": "Andrea", "stato": "fatto", "il": "2026-11-05", "utente": "Andrea Gasparotto", "versione": "1.0.0", "nota":
  "controlli-finali.html: 1.204 prove, 0 fallite", "documento": 88}]}]}`; `segnaControllo {chiave, stato: "fatto"|"non_va"|
  "da_fare", nota?, idDocumento?}` (amministrazione 2; non sulle righe `server`) → `{"ok": true, "riga": {...}}`;
  `segnaCambio {stato}` (titolare) → `{"ok": true, "cambio": {...}}`.

### 13.7 Cosa cambia nelle azioni che ci sono

- `io` ha in più `interfaccia.funzioniSpente`, `interfaccia.nomeBreve`, `interfaccia.logo` (url del file o vuoto) e
  `interfaccia.oraServer`.
- Ogni azione di un modulo spento risponde `spenta: true` (§9.5); il menu delle app nasconde le voci spente.
- `cambiaPassword` mette `password_iniziale = 0`; `salvaUtente` con password nuova e `nuovaPassword` la mettono a 1.
- `copiaAdesso` e la copia della notte salvano `conteggi`, `md5`, `cifrata`; la copia fuori casa è cifrata con
  `COPIA_CIFRATA`.
- `caricaFile` e `/carica` accettano il tipo `logo` (amministrazione 2, PNG o JPG, 1 MB: `"Il logo deve essere un PNG o un
  JPG di al massimo 1 MB"`).
- Il postino ha un'azione nuova, `postinoImpronta {cartella, nome}` → `{ok, byte, md5}` (Ponte.gs; da incollare e
  pubblicare come le altre).
- Ogni richiesta: se arriva con `Tailscale-User-Login` aggiorna `sessioni.tailnet` e il controllo `tailnet`; se arriva
  sulla 8400 con `Tailscale-Funnel-Request` scrive l'Errore di `internetinterno` e una riga nel registro (§4.2).

## 14. Permessi e registro

### 14.1 Permessi

Nessun modulo nuovo (`integrazioni` c'è dall'architettura). Valori della tabella dell'architettura §3, più queste regole:

| Cosa | Chi |
|---|---|
| Vedere Integrazioni | `integrazioni` ≥ 1 (titolare, amministrazione, lettura) |
| Prova adesso, impostazioni di un collegamento | `integrazioni` 2; quelle che toccano internet anche `amministrazione` 2 |
| Il proprio file e i propri feed del calendario | `attivita` ≥ 1 (anche il collaboratore e l'esterno, per le loro cose) |
| Feed del calendario di tutti (vedere, togliere) | `amministrazione` 2 |
| Cerca dentro i file | `documenti` ≥ 1, e solo i documenti che la persona vede |
| Esporta tutto | titolare |
| Importa clienti e fornitori | `clienti` 2 |
| Impostazioni generali, Notifiche dello studio, Numerazioni, Dati dello studio | vedere `amministrazione` 1, cambiare `amministrazione` 2 |
| Funzioni accese, Scollega tutti, cifratura della copia, Segna il cambio | titolare |
| Sicurezza, Stato del sistema, Copie e ripristino, Lista di controllo | vedere `amministrazione` 1; agire `amministrazione` 2 |
| Riquadri, notifiche e voci nascoste proprie | tutti |

**Il ruolo di Andrea** (decisione 8: "Andrea amministratore"): con i permessi di base, il ruolo `amministrazione` ha
`amministrazione` 1, quindi **non** potrebbe gestire utenti, integrazioni, copie e la lista di controllo. Due strade
(domanda 3): ruolo `amministrazione` con **Amministrazione: Modifica** dato dal titolare e **Dati riservati: Niente**
(consiglio: Andrea fa tutto il tecnico ma non vede stipendi e documenti personali), oppure un secondo **titolare**.

### 14.2 Registro

Tabelle nuove con i loro nomi (§12.4, tranne `integrazioni_controlli`, `file_testo`, `file_lettura`, `dashboard_nascoste`,
che non sono modifiche di dati). Note: `"collegamento provato a mano"`, `"impostazioni del collegamento cambiate"`,
`"indirizzo del calendario creato: {nome}"`, `"indirizzo del calendario tolto"`, `"esportazione di tutti i dati"`,
`"importato da {file}"`, `"archiviati gli importati da {file}"`, `"funzione spenta: {nome}"`, `"funzione accesa:
{nome}"`, `"scollegati tutti i dispositivi"`, `"cifratura della copia accesa"`, `"cifratura della copia spenta"`, `"prova
della copia: {esito}"`, `"ripristino provato a mano: {copia}"`, `"controllo segnato: {chiave} {stato}"`, `"cambio:
{stato}"`, `"richiesta da internet sulla porta interna"`, `"logo cambiato"`. **Mai** nel registro: la chiave della copia
cifrata, le chiavi dei feed, il contenuto dei file letti, i file di Esporta tutto.

## 15. Schermate

**Parole fisse** (uguali ovunque): **Collegato**, **Da configurare**, **Errore**, **Non collegato**, **In corso**,
**Dipende da una scelta**; "controllato oggi alle 10:00"; **Prova adesso**; **Cosa fa**, **Account**, **Cosa esce dal
NAS**, **Costo**, **Regole del servizio**, **Perché non è collegato**, **Cosa servirebbe**; calendario **Il calendario in
altre app**, **Scarica il file**, **Nuovo indirizzo**, **Con i dettagli**, **Senza dettagli**, **Mai letto**; ricerca
**Nel testo**; importazione **Nuovi**, **Già in Wisper**, **Da sistemare**; Dashboard **Altre N**, **Tutto quello che c'è
da fare**, **Nascondi per 30 giorni**, **Nascoste**, **Cambia i riquadri**; lista **Da fare**, **Fatto**, **Non va**, **Da
rifare**, **In attesa di una scelta**; copie **Provata**, **Tutto torna**, **Non torna**; funzioni **Accesa**, **Spenta**,
**Sempre accesa**. Colori sempre con la parola: verde (Collegato, Fatto, Tutto torna, Provata, Accesa), giallo tenue (Da
configurare, Da fare), rosso tenue (Errore, Non va, Non torna), ambra (Da rifare, versione vecchia), blu (In corso), grigio
tratteggiato (Non collegato), grigio (Dipende da una scelta, In attesa di una scelta, Spenta, Sempre accesa).
**Un solo pulsante giallo per schermata**, scritto qui per ognuna; nelle pagine del computer con un pannello aperto il
giallo della pagina diventa col bordo.

Menu: **17 Integrazioni** (icona della spina), **18 Amministrazione** (l'ingranaggio), dopo Collaboratori esterni, con il
numerino di §8.6.

### 15.1 Telefono

- **Dashboard**: Il tuo giorno (chi scrive rapportini), la cosa più urgente, quattro riquadri in due colonne, Urgenti ·
  Questa settimana · Da pianificare con al massimo 7 · 7 · 5 righe e **Altre N**; in fondo **Tutto quello che c'è da
  fare** e **Cambia i riquadri** (testi gialli scuri). Tocco lungo su una voce nascondibile: foglio **Nascondi per 30
  giorni**. Giallo: **Scrivi il rapportino** (dentro Il tuo giorno), o niente.
- **Tutto quello che c'è da fare**: segmenti, pillole delle aree, elenco. Nessun giallo.
- **Integrazioni**: segmenti **Tutti · Collegati · Da sistemare · Non collegati**; gruppi; righe con pillola e ora. Nessun
  giallo. **Pagina del collegamento**: come §4.3; giallo **Prova adesso** solo se in Errore.
- **Il calendario in altre app** (Attività e calendario › Calendario › ⋯, e Tu): scheda **Scarica un file** (Cosa: **Le mie
  cose · Tutto lo studio**; caselle **Ferie e assenze**, **Scadenze**; "da un mese fa a un anno da oggi"), giallo **Scarica
  il file**; scheda **Sempre aggiornato** coi feed ("Telefono di Manuel · letto oggi alle 9:40 · ICSx⁵", pillola Con i
  dettagli) e **Nuovo indirizzo** col bordo; riga calma **Google Calendar e Outlook** con **Dipende da una scelta** (tocco:
  "Li leggono i server di Google e Microsoft: serve un indirizzo su internet. Si sceglie in Amministrazione."). Foglio
  **Nuovo indirizzo**: Nome, Cosa, In più, **Con i dettagli** sì/no, giallo **Crea l'indirizzo**; dopo, nello stesso foglio:
  l'indirizzo (carattere a larghezza fissa), **Copia**, giallo **Apri con ICSx⁵**, e la conferma "Si apre da casa o col
  tailnet acceso. Non lo mostriamo più: se lo perdi, ne fai uno nuovo." Foglio di un feed: **Togli l'indirizzo** (bordo
  rosso tenue).
- **Documenti** (ricerca): risultati con l'estratto e la pillola **Nel testo**.
- **Amministrazione**: l'elenco a gruppi (§9.2). Pagine: **Dati dello studio** (campi, logo con **Scegli il logo** e
  **Togli il logo**, anteprima dell'intestazione; giallo **Salva**), **Impostazioni generali** (ricerca, schede richiudibili,
  ognuna col suo **Salva** col bordo; nessun giallo), **Funzioni accese** (righe con l'interruttore e la frase su cosa
  cambia; nessun giallo), **Numerazioni** (elenco; Modifica della commessa con i pezzi a pillole e l'anteprima grande;
  giallo **Salva il formato**), **Notifiche** (interruttori a gruppi; per lo studio le email degli avvisi e **Manda una
  prova**; **Salva** col bordo), **Sicurezza** (schede verdi o rosse, dispositivi, durata, **Scollega tutti i dispositivi**
  bordo rosso tenue; nessun giallo), **Aspetto**, **Copie e ripristino** (ultima copia, prova automatica, ripristino a mano
  coi sei passi; giallo **Segna il ripristino provato**), **Importa ed esporta** (Esporta tutto col bordo, giallo **Importa
  clienti e fornitori**; elenco delle importazioni), **Stato del sistema** (schede da leggere; nessun giallo), **Lista di
  controllo** (riassunto e barra, segmenti **Tutte · Da fare · Non vanno · Fatte**, gruppi richiudibili, righe con chiave,
  testo, tipo, chi, stato; tocco = foglio **Segna** con Fatto · Non va · Da fare, nota e **Allega**; giallo nel foglio
  **Salva**; la pagina nessun giallo).
- **Importa clienti e fornitori** (pagina a passi come il rapportino, con la barra): **Il file** → **Le colonne** (una
  colonna alla volta: intestazione, esempi, campo a pillole) → **Il controllo** (Nuovi, Già in Wisper, Da sistemare) →
  giallo **Importa 42 e completa 7**.

### 15.2 Computer

Le stesse pagine nello stile della fase 1: elenchi come tabelle (Integrazioni: Collegamento, Stato, Ultimo controllo,
Cosa esce dal NAS, Costo), la pagina del collegamento come pannello a destra (440) sull'elenco; il calendario in altre app
a due colonne (file a sinistra, abbonamenti a destra); Impostazioni generali a due colonne di schede; la Lista di
controllo come tabella (Chiave, Controllo, Tipo, Chi, Stato, Il, Nota) col pannello della riga; l'importazione in una
finestra larga a due colonne (a sinistra le colonne del file con le tendine dei campi, a destra il controllo che si
aggiorna); la Dashboard coi quattro riquadri in fila, Urgenti e Questa settimana a sinistra, Da pianificare a destra
(fase 1).

### 15.3 Visita guidata

Un passo in più sul telefono, sulla schermata vera coi dati di esempio: Dashboard, la riga **Altre N** (leggi: "Il resto"
/ "Qui ci sono le prime cose da fare: il resto è in una pagina sola."). Sul computer nessun passo nuovo.

## 16. Prove di fine fase

- **Migrazione 008**: §12.5.
- **Integrazioni**: ogni controllo di §4.2 con un servizio finto che risponde, che non risponde, che risponde male (il
  postino finto, un VIES finto con `WISPER_VIES_URL`, un GitHub finto con un indirizzo da ambiente); due errori di fila →
  Errore, uno solo no; Prova adesso una volta al minuto; nessun segreto nelle risposte (le chiavi delle risposte confrontate
  con un elenco chiuso, come le viste del portale); una richiesta con `Tailscale-Funnel-Request` sulla 8400 → Errore,
  registro, voce urgente.
- **Calendario**: file dei dati di prova con l'orologio fermo uguale a `server/prove/ics/atteso-manuel.ics`; un lettore
  minimo nella prova controlla CRLF, righe ≤ 75 byte senza caratteri spezzati, `UID` e `DTSTAMP` in ogni evento, giorni
  interi con la fine esclusa, ora legale (un appuntamento del 29/03 e uno del 25/10), testi con virgole, punti e virgola,
  a capo e accenti, nessun "€" e nessun importo; feed: chiave giusta, sbagliata, tolta, utente disattivato (404 uguali);
  permesso tolto → l'evento esce alla lettura dopo; `304` con `If-None-Match`; 61 letture in un'ora → 429; feed pubblico
  solo sulla 8401 con `CALENDARIO_PUBBLICO`; senza dettagli niente `LOCATION` e `DESCRIPTION`.
- **Ricerca nei file**: file finti in `server/prove/file-testo/` (un PDF fatto da Word, uno da LibreOffice con
  `ToUnicode`, una scansione, un DOCX, un XLSX, un DXF, un DOC vecchio): stati giusti; "perche" trova "perché"; la sintassi
  di FTS nelle parole non rompe niente (`"`, `*`, `OR`, `NEAR`); un documento che la persona non vede non dà né risultato né
  estratto (collaboratore contro un contratto); i documenti riservati non si leggono; FTS5 assente (variabile solo per le
  prove) → Errore e ricerca sui titoli.
- **Importa ed esporta**: CSV con `;` e con `,`, in UTF-8 e in Windows-1252, XLSX; doppioni per partita IVA e per nome; mai un
  campo pieno sovrascritto; errori di riga; Archivia quelli importati che salta chi ha una commessa; Esporta tutto: ZIP che
  Windows apre, un CSV per elenco uguale all'esportazione singola, niente colonne di soldi o riservati per chi non li vede
  (la prova lo chiede come titolare e come un titolare con `riservati` tolto per la prova).
- **Dashboard**: con i dati di prova di tutte le fasi, il titolare prima e dopo: nessun oggetto in due voci; i doppioni di
  §8.1 uno per uno; ordine di §8.3 (un tipo fuori elenco fa fallire la prova); tetti e `quante`; raggruppamenti da 3; voce
  Da approvare; riquadri per ruolo e Cambia i riquadri; voci nascoste che tornano dopo 30 giorni (orologio spostato);
  Lettura senza voci d'azione; numerini di §8.6.
- **Amministrazione**: ogni chiave di ogni fase o in `impostazioniGenerali` o nell'elenco delle nascoste (la prova legge le
  chiavi dalle migrazioni); limiti; funzioni spente (menu, Dashboard, azioni `spenta`, eccezioni di §9.5, dati uguali dopo
  la riaccensione); `casi-numerazioni.json` uguale in server, Kotlin e computer; logo sui PDF e PDF identici senza logo;
  notifiche spente che non nascono; scollega tutti con la coda del telefono che resta.
- **Copie**: prova automatica con una copia buona, una rovinata (byte cambiati), una con meno righe, un file con lo SHA-256
  sbagliato, un'impronta fuori casa diversa (postino finto); cifratura: copia cifrata e ripristinata con la chiave giusta,
  rifiutata con quella sbagliata senza toccare niente, intestazione `WISPERC1`; `ripristina-file.js` con file mancanti.
- **Passaggio dei dati**: `importa.js --confronta` contro il finto Google (zero differenze; un rapportino aggiunto al foglio
  dopo → una differenza); la **prova del ritorno B** coi dati finti: server con dati della fase 7, `copiaAdesso` che riscrive
  il foglio finto, export, `--confronta` uguale, 0.4.0 di prova contro il finto Google che ritrova rapportini, clienti e
  commesse.
- **Prova di carico**: §11.5.
- **Permessi**: righe T01 e T02 di §11.3.
- **Schermate vere** su telefono e computer, chiaro e scuro, confrontate col prototipo; il flusso coi dati di prova: Manuel
  apre Integrazioni (un collegamento in Errore, Prova adesso) → crea un indirizzo del calendario e lo apre con ICSx⁵
  sull'emulatore → cerca "terra" nei documenti e trova il verbale → importa un CSV di clienti → spegne Mezzi e attrezzature
  e lo riaccende → cambia i riquadri → segna un controllo della lista.
- **Da provare una volta, scritto nel resoconto**: se il classico Outlook con un account di prova legge un feed dal
  computer (allora basta il tailnet); FTS5 nell'immagine Docker del NAS (`PRAGMA compile_options` nel log d'avvio).

## 17. Da confermare e da decidere

**Col consulente privacy** (si aggiunge a fase 7 §14): il Gmail gratuito del postino o Google Workspace (o la posta
Microsoft 365 di Manuel); la copia fuori casa su Drive (cifrata o no); quanto tenere l'export del foglio del giorno del
cambio. **Con Manuel**: la sera del cambio (giorno, ora, quali dispositivi); il logo e la riga in fondo ai PDF; se vuole gli
impegni di Wisper nel calendario del telefono (ICSx⁵) o in Outlook; quali funzioni spegnere (portale finché non c'è
l'ingresso? collaboratori esterni?); i dieci controlli della prova generale insieme ad Andrea. **Con Andrea**: le domande
qui sotto, la copia del foglio per le prove generali, la prova di ripristino ogni tre mesi, i comandi sul NAS.

**Domande per Andrea** (la raccomandazione per prima):
1. **L'ingresso da internet** (la domanda aperta della fase 7, che resta tua): **Tailscale Standard, un posto, in un
   tailnet dello studio** (8 $ al mese, circa 90 € l'anno: mette in regola l'accesso da fuori della decisione 1 e accende
   portale, link che scade, ponte del cambio e, se lo vuoi, il calendario per Google e Outlook) oppure **Cloudflare Tunnel
   con un dominio nuovo** (5-12 € l'anno; Cloudflare vede il traffico; per l'accesso da fuori dello studio serve un'altra
   strada). Senza scegliere il gestionale funziona lo stesso in casa e dal tailnet, portale e link restano Non collegato e
   il cambio si fa senza ponte (§10.5).
2. **Copia fuori casa cifrata** con una chiave scritta su carta in due posti (consiglio sì: su Drive oggi c'è tutto il
   database in chiaro, stipendi compresi). L'alternativa è lasciarla com'è, fidandosi dell'account Google.
3. **Il tuo ruolo**: **Amministrazione con "Amministrazione: Modifica" e senza dati riservati** (consiglio: fai tutto il
   lavoro tecnico, non vedi stipendi e documenti personali) oppure **secondo titolare** (vedi tutto).
4. **Il calendario**: **file da scaricare e abbonamento dal telefono con ICSx⁵, solo dentro il tailnet** (consiglio: 0 € o
   circa 2 €, niente dati a Google o Microsoft) oppure **anche l'abbonamento per Google Calendar e Outlook** (serve la
   risposta 1; gli appuntamenti passano dai loro server, di base senza dettagli).
5. **Cerca dentro i file adesso** (consiglio sì: 0 €, niente esce dal NAS, la fase 5 l'aveva promesso). L'alternativa è
   lasciare la ricerca sui titoli.
6. **Sfogliare OneDrive e Google Drive da dentro Wisper**: **non ora** (consiglio: i link incollati funzionano già; servirebbe
   un'app nel Microsoft 365 di Manuel con il consenso e una chiave sul NAS che legge i suoi file) oppure **adesso**.
7. **Notifiche sul telefono**: **il controllo ogni 15 minuti** come la fase 7 (consiglio) oppure **Firebase** (immediate,
   gratis, ma un progetto Google, una chiave sul NAS e il Play Store obbligatorio).
8. **Le email di Wisper**: **restano dal Gmail del postino finché il consulente privacy non si esprime** (consiglio, 0 €)
   oppure **Google Workspace** (6,80 € a utente al mese con l'annuale, 8,10 € col flessibile: ha l'accordo sul
   trattamento) oppure **la posta Microsoft 365 di Manuel** (0 € in più, 10.000 destinatari al giorno, ma un'app col permesso
   di mandare posta nel suo Microsoft 365).
9. **La sera del cambio**: **cambio secco** dopo due prove generali, col ritorno indietro dal foglio riscritto ogni notte
   per 7 giorni (consiglio) oppure **una settimana in parallelo** (Manuel scrive due volte: più sicuro sulla carta, ma i due
   archivi si separano al primo errore).
10. **Dashboard**: **quattro riquadri a scelta per persona e voci informative nascondibili per 30 giorni** (consiglio)
    oppure riquadri fissi per ruolo e niente da nascondere.
11. **Funzioni accese**: **sì, per cinque funzioni** (consiglio: portale, comunicazioni, collaboratori, mezzi, banche)
    oppure tutte sempre accese.
12. Ancora aperta dalla fase 4: **quale programma usa Manuel per le fatture**. Se è Fatture in Cloud (o un altro con
    un'API), la bozza si potrà creare direttamente nel suo programma (uscita nuova di fase 4 §8.4); fino ad allora
    prospetto e XML da completare.

**Costi**: questa fase, così come è progettata, **0 € in più al mese**. Dipendono dalle risposte: ingresso 8 $ al mese
(Tailscale) o 5-12 € l'anno (dominio per Cloudflare); ICSx⁵ circa 2 € una volta dal Play Store (0 € da F-Droid); Google
Workspace 6,80-8,10 € a utente al mese se scelto. Non collegati, coi numeri in §3.1: SDI con un intermediario (circa
30 € l'anno più il Premium di Aruba, o 0,10-0,15 € a fattura), banca (da 0 € in modalità ristretta a un contratto),
WhatsApp Business API (circa 0,036 $ a promemoria), assistente (1-1,5 $ al mese per 500 domande).

## 18. Decisioni prese costruendo (server)

Dove l'accordo taceva si è scelta la strada più semplice e più sicura. Server 0.11.0, schema 8.

**Integrazioni (§4, §0)**
- Le 26 voci (nomi, frasi, costi, motivi) stanno in `server/src/integrazioni/elenco.js`; quelle con un controllo vero
  hanno una riga in `integrazioni` (`postino`, `vies`, `aggiornamenti`, `porta`, `portale`, `calendariofile`,
  `calendario`, `ricerca`, `copiafuori`, `internetinterno`). Le voci che dipendono da un'altra (Link, Ponte) prendono lo
  stato di quella.
- Colonna in più `integrazioni.riuscito_il` (l'ultimo controllo riuscito: "ok l'ultima volta il …").
- In prova niente va su internet: VIES e "aggiornamenti" restano **Da configurare** senza i servizi finti
  (`WISPER_VIES_URL`, `WISPER_AGGIORNAMENTI_URL`). Il controllo degli aggiornamenti legge solo il numero dell'ultima
  versione: la firma dell'elenco la controllano telefono e computer, come oggi.
- `internetinterno` (§0.2): una richiesta arrivata da internet sulla porta interna (8400 con `X-Forwarded-For` o
  `Tailscale-Funnel-Request`, o 8402) segna Errore per **7 giorni** e una riga nel registro ("richiesta da internet sulla
  porta interna"); si vede in Integrazioni e in Sicurezza.
- Due errori di fila prima di "Errore" e della notifica (`integrazione_errore` a chi riceve gli avvisi); "Prova adesso"
  una volta al minuto per collegamento.

**Calendario (§5)**
- Una ricorrenza scritta compare con tutte le sue volte nel periodo (`UID attivita-<id>-<aaaammgg>@wisper`); le cose
  annullate negli ultimi 30 giorni restano nel file come `STATUS:CANCELLED` (così il telefono le toglie), poi spariscono.
- Nel feed: le mie ferie e assenze approvate; nel feed dello studio quelle di tutti con la parola che chi chiede può
  vedere ("Assente" senza il motivo); le chiusure dello studio come giornate intere.
- L'indirizzo "in casa" del feed: `WISPER_INDIRIZZO_CASA` se c'è, se no quello con cui la richiesta è arrivata.
  Il feed "fuori casa" vuole `CALENDARIO_PUBBLICO` acceso (amministrazione 2, portale Collegato) e, se ha i dettagli,
  la conferma esplicita. Al massimo 5 feed per persona; 60 letture all'ora per feed, poi 429; chiave sconosciuta,
  tolta o di un utente disattivato: lo stesso 404.

**Ricerca dentro i file (§6)**
- Tabella `file_testo` (FTS5, `unicode61 remove_diacritics 2`) solo se SQLite ha FTS5; senza, la ricerca dentro i file
  si spegne da sola e lo dice (Integrazioni › Ricerca). La lettura gira in un worker con 20 secondi al massimo e 200.000
  caratteri; PDF (anche compressi, con ToUnicode), DOCX, XLSX, PPTX, ODF, DXF, testo. Scansioni e `.doc` vecchi:
  "senza testo" / "non si legge".
- Non si leggono: i documenti delle persone, quelli riservati, i file tolti. Un documento che compare già per titolo non
  prende anche l'estratto: `trovato` (revisione, estratto) c'è solo per quelli trovati **solo** dentro il file.
  L'estratto si calcola solo per i documenti della pagina che si manda (prova di carico).

**Copie, cifratura, ripristino (§9.8-9.10)**
- Il file cifrato: `WISPERC1` + versione (1 byte) + nonce (12 byte) = 21 byte d'intestazione, poi i dati e i 16 byte del
  tag GCM. Chiave AES = SHA-256 di `"wisper-copia-1:"` + le 32 lettere della chiave scritta (maiuscole/minuscole,
  spazi e trattini non contano). La chiave si mostra una volta sola, quando si accende; mai nel registro né nelle risposte.
- Cifratura accesa e chiave sparita dal disco: la copia fuori casa **non parte** (errore), mai in chiaro per sbaglio;
  quella sul NAS sì.
- `CAMBIO` e `COPIA_CIFRATA` si salvano solo dalle loro pagine (Segna il cambio, Sicurezza), non da Impostazioni generali.
- `ripristina.js` legge la data solo dal nome del file della copia; con la chiave sbagliata si ferma prima di toccare
  qualsiasi cosa. `ripristina-file.js` controlla lo SHA-256 di ogni file prima di rimetterlo.
- La prova automatica chiede al postino l'impronta (MD5) della copia fuori casa: serve l'azione nuova
  `postinoImpronta {cartella, nome}` in `Ponte.gs` (fuori dalla mia zona: va aggiunta, incollata e pubblicata; senza,
  la prova dice "non controllata").

**Lista di controllo (§11)**
- 77 righe (M01.1 … M18.3, T01-T15, C01-C07, G01-G10, E01-E15, R01); M15.2 parte "In attesa di una scelta". Le righe
  "A + M" sono `a_mano`; quelle che il server sa controllare (M08.2, M17.1, M18.1, T10-T14) sono verdi o rosse da sole.
  Una riga segnata a mano torna "da rifare" quando cambia la versione del server.

**Dashboard (§8)**
- Con `tutto: true` niente tetti, niente gruppi e niente voce unica "Da approvare" (sono raggruppamenti), ma sempre
  una cosa una voce. La famiglia "attività" raggruppa solo le voci di tipo `attivita`.
- Il ruolo Lettura non vede voci che chiedono di agire. Lo spazio sul disco va nell'area `sistema`. La voce del
  ripristino non provato compare solo dopo che esiste almeno una copia.
- Il riquadro "Strumenti con la taratura scaduta" porta a `{pagina: "mezzi", filtro: {segmento: "strumenti", taratura:
  "scaduta"}}` (la pagina "attrezzature" non esiste).
- La voce unica "Da approvare" porta alla pagina nuova `approvare`, con le righe per persona. Ha gravità `attenzione` e
  segue l'ordine fisso (§8.2 punto 2): con più di 7 voci rosse in Urgenti finisce in "Altre". Non la si forza più su,
  perché le urgenze rosse vengono prima per regola; il numero resta sempre in vista nel riquadro "Da approvare", che è
  tra i quattro di base del titolare.

**Funzioni spente, impostazioni, notifiche (§9)**
- `permessiDi` applica `MODULI_SPENTI` (livello 0 anche per il titolare); un'azione di una funzione spenta risponde
  `{spenta: true}` prima del controllo dei permessi. Eccezione: con Banche spenta, "Pagata" da una fattura scrive lo
  stesso il movimento (coi permessi veri della persona). Spegnere il portale da Funzioni accese fa anche "Spegni il
  portale adesso" (lo spegnimento della funzione vale come conferma).
- `salvaImpostazioni` controlla i limiti di ogni voce (errori che cominciano col nome: "Ore di lavoro al giorno: da 1 a
  12 ore"); le chiavi senza voce si salvano come prima.
- Colonne in più su `utenti`: `password_iniziale` e `password_il` (Sicurezza: chi non ha ancora cambiato la password
  iniziale). Il silenzio di sera (20-7 e festivi) lo calcola il server (`silenzioSera` in `io`, `silenzio` in
  `notifiche`); il riepilogo del mattino all'ora di `NOTIFICHE_ORA`.
- Stato del sistema: la differenza d'ora col dispositivo si misura con l'orologio vero del server (anche in prova). In
  prova `database.mb` è `null` (il database di prova sta in memoria, non c'è un file da misurare) e `versioni.ultime` è
  vuoto (niente internet in prova): telefono e computer nascondono quelle righe. Sul NAS ci sono tutte e due.
- Il logo passa solo da `caricaFile` (1 MB sta in una richiesta normale), amministrazione 2.

**Esporta tutto e import (§7)**
- Gli elenchi nuovi (referenti, sedi, prestazioni, comunicazioni) si possono esportare anche da soli (`esporta`).
- Il registro intero in un CSV solo, letto a pagine da 20.000 righe; i ticket a pezzi da 50 con le liste lette una volta
  per pezzo: con dieci anni di dati il server intanto risponde agli altri.
- L'import prova ogni riga dentro un punto di salvataggio annullato (nessuna scrittura) prima di importare davvero.
- Lo ZIP si scarica solo in casa (`GET /esportazione/<id>`). Dalla porta Google un lavoro `esportazione` riceve
  `{ok: false, stato: 403, soloInCasa: true, errore: "Il file con tutti i dati si scarica solo in casa: aprilo quando sei
  in ufficio"}`; preparare il file (`esportaTutto`) e vederne l'elenco da fuori casa si può.

**Prova di carico (§11.5, PC di Andrea, dati finti di 10 anni, 131 MB)**
- I dati finti sono realistici: ore e spese più vecchie di 60 giorni fatturate e rimborsate, fatture più vecchie di 90
  giorni incassate, ricevute più vecchie di 60 giorni pagate, preventivi più vecchi di 60 giorni con una risposta.
- Sistemato (prima giro): l'indice che mancava su `fatture_ricevute(ricevuta_collegata_id)`; i conti dei preventivi
  nella Dashboard solo per gli inviati; gli aiuti delle fatture letti una volta in `daMandare`; i documenti di
  un'esportazione in una lettura sola; l'estratto dei file solo per la pagina.
- Sistemato (secondo giro, T15): **le mappe dei nomi** (persone, clienti, commesse, numeri dei ticket, sedi, contratti)
  che ogni scheda rifaceva per ogni riga ora si fanno una volta sola dentro `conLettureRicordate` (Esporta tutto, a pezzi
  da 50 ticket, e la Dashboard): `ricordata(chiave, fn)`, svuotata a ogni scrittura, attiva solo in quei due punti; fuori
  tutto come prima. Dentro la Dashboard anche i saldi dei conti e gli incassi di tutte le fatture si leggono una volta.
  **Indici parziali** nella migrazione 008 (solo le righe di quello stato: bozze e firmati dei rapportini, da approvare
  e respinti, ore da approvare e respinte): un indice intero su `stato` faceva scegliere a SQLite l'indice anche per
  "approvata" e una lettura passava da 8 a 112 ms. La Dashboard legge dei rapportini solo le colonne che usa; la prova
  della fase 6 sul costo orario fa due letture da una riga invece di una UNION; le note di credito delle ricevute si
  leggono in una volta in `aiutiRicevute`.
- Lo stesso contenuto: `prove/esporta-tutto-uguale.test.js` su un anno di dati finti confronta ogni CSV dello ZIP, byte
  per byte, con l'esportazione singola (che passa ancora dal codice di prima), e ogni scheda di ticket, l'elenco delle
  attività e quello dei documenti con e senza la memoria. Le prove della Dashboard già scritte passano senza toccare
  nessun valore atteso.
- Misure finali (HTTP, `prove/carico.js`, 20 chiamate; il PC era carico al 60-84% per l'emulatore e Gradle del
  costruttore del telefono, quindi il 95° percentile è gonfiato): anagrafiche 69-73 ms, rapportini del mese 12-24 ms,
  documenti per titolo 64-123 ms (95° 78-149), documenti dentro i file 86-148 ms, esporta rapportini 244-313 ms,
  **Esporta tutto 8,4-11,6 s** (prima 61-83 s), copia della notte 0,7-0,8 s: dentro i tempi.
- **Dashboard, terzo giro (letture condivise fra le fasi)**. Prima di toccare il codice, la fotografia:
  `prove/dashboard-fotografia.test.js` con `prove/dashboard-fotografia/atteso.json` (64 risposte intere, 2.873 voci:
  dashboard e dashboard {tutto} per i cinque utenti di esempio e per tre utenti di un anno di dati finti, in quattro
  istanti fermi: 22/10/2026, 12/11/2026, 30/11/2026, 01/01/2027 alle 10:00). Tolto dal confronto solo
  `numeri.spazio.liberoMb` (lo spazio libero vero del disco: cambia fra due giri anche col codice di prima). La
  fotografia non si rifà per far passare la prova. Dentro la Dashboard ora si leggono una volta sola e si passano alle
  fasi: i rapportini non annullati (fase 1 e "da approvare" della fase 3), le fatture di tutti gli stati (fase 4,
  scadenziario, promemoria della fase 7, filtrate nello stesso ordine dell'indice), le ore del mese e della settimana
  (una lettura), i preventivi che possono ancora fare una voce (in bozza, inviati o scaduti, accettati senza commessa),
  oltre a mappe dei nomi, saldi e incassi del giro prima. Le 64 risposte sono uguali alla fotografia.
- **Misure dopo il terzo giro** (il PC era ancora occupato da emulatore e Gradle del costruttore del telefono): Dashboard
  in-process mediana 350-373 ms (minimo 304), via HTTP misurata da sola mediana 350 ms (minimo 321); la prova di carico
  completa, nello stesso momento, 578 / 654 ms. **Sfora ancora il limite di 300 ms sul PC** finché il PC è occupato; resta
  da misurare col PC libero e sul NAS (limite 800 ms). Il tempo che resta è sparso: i rimborsi della fase 3 (tutte le
  spese lette), l'elenco dei documenti per i conteggi della fase 5, le voci da fatturare della fase 4. Il passo dopo è
  lo stesso: leggere anche spese, documenti e ticket una volta sola, con la fotografia come rete.
- **Ultimo passo della Dashboard**: anche i ticket (fase 5 e voci da fatturare, una lettura sola con i "materiali
  compresi" del contratto) e le spese dei rimborsi (solo quelle pagate di tasca propria: le altre le scartava dopo) si
  leggono una volta. L'elenco dei documenti per i conteggi della fase 5 resta com'era (il lavoro e' nei conteggi stessi).
  La fotografia torna in tutte le 64 risposte.
- **La fotografia piccola**: `atteso.json` (160 KB invece di 1,3 MB) tiene lo SHA-256 di ogni risposta (JSON con le
  chiavi in ordine), di ogni campo e (12 cifre) di ogni voce, piu' quattro risposte intere (manuel e lettura del 30/11,
  normale e {tutto}). Se un'impronta non torna la prova dice chi, che giorno e la prima differenza ("settimana[1] diversa:
  {...}", "il campo quante e' diverso", "urgenti: 6 voci invece di 7"). La rete non e' piu' debole: un'impronta diversa
  vuol dire una risposta diversa, come prima; si perde solo il valore atteso delle risposte non intere (si vede quello di
  adesso). Fatta convertendo la fotografia intera del codice di prima, non col codice nuovo.
- **Due campi nuovi** chiesti dal costruttore del telefono: `feedCalendario` risponde anche `fuoriCasa` (vero se
  `CALENDARIO_PUBBLICO` e' acceso); le voci raggruppate della Dashboard ("4 scadenze nei prossimi 30 giorni", oggetto
  `gruppo:...`) hanno `unita: "voci"` invece di `null`, come la voce unica Da approvare. La fotografia e' stata rifatta
  dalla fotografia intera del codice di prima piu' quel solo cambiamento (26 voci di gruppo), non col codice nuovo.
- **Le misure su questo PC non sono affidabili**: nell'ultima prova anche le azioni non toccate erano 2-3 volte piu'
  lente (anagrafiche 157 ms invece di 69); in-process, dopo circa otto Dashboard di fila, le letture di SQLite diventano 4
  volte piu' lente e restano cosi', con CPU e memoria libere e l'antivirus (Bitdefender, `bdservicehost`) acceso. La misura
  che conta e' quella sul NAS (limiti dell'accordo per il NAS: 400 ms per le letture semplici, 800 ms la Dashboard, 500 ms
  la ricerca dentro i file, 5 s esporta, 40 s Esporta tutto, 2 minuti la copia).
- **Misura sul NAS (01/11/2026 sera, T15 fatta)**: `prove/carico.js --nas` in un contenitore usa e getta (`node:24-slim`,
  codice in sola lettura, dati finti di 10 anni in `/tmp` del contenitore, `--network none`, mai la cartella del server
  vero), mediana / 95°: anagrafiche 55 / 81 ms, rapportini del mese 10 / 12 ms, documenti per titolo 87 / 105 ms,
  **Dashboard 371 / 413 ms** e {tutto} 385 / 559 ms (limite 800), documenti dentro i file 109 / 123 ms, esporta rapportini
  di 10 anni 325 / 587 ms, **Esporta tutto 10,0 / 10,3 s** (limite 40), copia della notte 2,3 / 2,8 s; database 131 MB.
  Tutto dentro i limiti del NAS.
