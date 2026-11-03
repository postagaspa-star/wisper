# Fase 5: documenti, ticket e assistenza (accordo e schermate)

Si aggiunge ad [`architettura.md`](architettura.md), [`fase1-schermate.md`](fase1-schermate.md), [`fase2.md`](fase2.md),
[`fase3.md`](fase3.md) e [`fase4.md`](fase4.md), che restano validi. Ricerca e fonti in
[`ricerca-fase5.md`](ricerca-fase5.md). Prototipo: [`docs/prototipo/Gestionale-fase5.html`](../prototipo/Gestionale-fase5.html).

Chi costruisce server, app Android e Wisper Ufficio legge **solo** questo file (più l'architettura e la fase 4, da cui
dipende): se qualcosa manca o non torna, lo dice invece di inventare. Le parole delle schermate sono quelle scritte qui,
uguali su telefono e computer. La migrazione è la **005** e viene dopo la 004 della fase 4.

## 1. Cosa consegna

- **11 Documenti**: l'**archivio** con le categorie; ogni documento è un **file caricato sul NAS** oppure un
  **collegamento** a un file o a una cartella che sta già su OneDrive, SharePoint, Google Drive o nel computer dello
  studio (col tipo segnato, senza copiarlo); documenti **per cliente, per commessa, per impianto, per ticket**; le
  **revisioni** (la vecchia resta da aprire, segnata *Superata*); i documenti **da approvare**; le **scadenze
  documentali** con il preavviso (verifiche DPR 462, certificati, polizze, contratti); i **modelli** (i PDF di Wisper
  restano impaginati nel codice, i testi si cambiano; i modelli dello studio sono file dell'archivio); la **ricerca**;
  chi vede cosa; **mandare per email** un documento; il **link che scade** progettato ma **Non collegato** (§5.8).
  Sfogliare OneDrive e Google Drive da dentro Wisper: **Non collegato** (fase 8).
- **12 Ticket e assistenza**: la **richiesta d'intervento** legata a cliente e **impianto**, tipo (guasto, verifica,
  piccolo intervento, assistenza, programmato), **priorità** da due domande, responsabile, **pianificazione nel
  calendario della fase 2**, ore, materiali e spese **della fase 3**, foto, **rapportino conclusivo con la firma**
  (il rapportino di sempre, tre passi), chiusura, **passaggio a Da fatturare** della fase 4, **contratti di
  assistenza** con canone e **visite periodiche che fanno nascere i ticket da sole**, **storico dell'impianto**,
  **statistiche** (tempi di presa in carico, d'intervento e di chiusura, per cliente, impianto, tipo, persona). Da dove
  arriva un ticket: telefono, email, sopralluogo, ufficio, scadenza; WhatsApp e portale sono valori pronti per la
  fase 7, non si scelgono.
- Dashboard con le voci nuove, permessi (il collaboratore vede i ticket suoi e quelli da prendere, i documenti in
  lettura), registro di tutto, spazio sul NAS in Amministrazione.
- **Tutto su telefono e computer** (decisione 2): nessuna funzione solo da computer. Le uniche cose che il telefono non
  fa sono quelle che non può fare per natura (aprire un percorso `C:\…` del computer dello studio), e lo dice.

## 2. Principi (dalla ricerca)

1. **Non duplicare i file**: se un documento sta già su OneDrive o Drive, in Wisper c'è il **collegamento** (le
   specifiche: "privilegiare il collegamento agli archivi esistenti"). Wisper tiene titolo, categoria, cliente,
   commessa, impianto e scadenza; il file resta dov'è, coi permessi e le versioni di Microsoft o Google.
2. **La revisione vecchia non sparisce e non si confonde**: si apre, ma è segnata *Superata*; la nuova aspetta
   l'approvazione senza sostituire la valida (controllo dei documenti, ISO 9001 §7.5.3).
3. **Un ticket non è un posto nuovo dove riscrivere le cose**: l'intervento è un'attività del calendario, le ore sono
   ore, le spese sono spese, il rapportino è il rapportino; il ticket le tiene insieme (specifiche §4: "evitare
   informazioni duplicate").
4. **Il rapportino resta la strada di chi è in cantiere**: niente cambia nei tre passi; dal ticket si apre già
   compilato (come "Come ieri").
5. **Una coda in ordine di urgenza vera**, con poche parole: *Aperto*, *In carico*, *In attesa*, *Risolto*, *Chiuso*
   (Pleya: aperti, in lavorazione, risolti). La priorità nasce da **impatto e urgenza** (ITIL), detti come due
   domande: "L'impianto è fermo?" e "Per quando?".
6. **I tempi si misurano, non si stimano** (Pleya): presa in carico, intervento, chiusura.
7. **Le visite periodiche nascono da sole, da pianificare**, con un anticipo, e se ne vede la prossima (FieldPulse,
   BPM Service; la regola delle ricorrenze della fase 2).
8. **La scheda dell'impianto è il suo storico**: ticket, rapportini, documenti, verifiche e contratti in una riga del
   tempo (BPM Service, "scheda asset con storico").
9. **Una cosa si fattura una volta sola** (fase 4 §3.2): il ticket entra in *Da fatturare* con lo stesso indice unico
   delle altre sorgenti, e porta con sé i suoi rapportini, ore e spese.
10. **Quello che non è collegato si vede che non c'è** (specifiche §7): pillola **Non collegato**, mai un pulsante
    che finge di funzionare.
11. **Le scadenze normative sono proposte, non legge scritta da Wisper**: "ogni 5 anni", e il perito conferma.

## 3. Le scelte di questa fase, col perché

### 3.1 Il collegamento agli archivi esterni

Un documento ha un'**origine**:
- `file`: il file è caricato sul NAS (anche la foto fatta dal telefono). Ha le revisioni.
- `collegamento`: Wisper tiene **solo l'indirizzo** (un link `https://` di OneDrive, SharePoint, Google Drive o di un
  sito, oppure un percorso `\\server\…` o `X:\…` del computer dello studio), il **tipo** riconosciuto dall'indirizzo
  (§5.1) e se è **una cartella** o un file. Non legge il contenuto, non lo copia, non lo mette nelle copie notturne.
  Le revisioni le tiene OneDrive o Drive; in Wisper cambiare l'indirizzo resta nel registro.
- `inviato`: la copia di un PDF che Wisper ha mandato per email (§5.8), per sapere cosa è partito.

**Perché così e non l'accesso diretto a Microsoft 365 e Google Drive.** Sfogliare le cartelle da dentro Wisper chiede
un'applicazione registrata in Microsoft Entra (con il consenso, a volte di un amministratore, nel Microsoft 365 di
Manuel) e una su Google Cloud, e **chiavi che si rinnovano da tenere sul NAS** (ricerca §3). Non costa soldi (0 €:
Graph è compreso in Microsoft 365, l'API di Drive è gratuita entro le quote), ma è lavoro e rischio da fase 8. La
strada **semplice, gratuita e sicura** c'è già: il link che OneDrive e Drive danno con "Copia collegamento", che si
incolla nel computer o si manda al telefono col **Condividi di Android** ("Condividi → Wisper", come gli XML della
fase 4). Chi può aprirlo lo decide OneDrive o Drive, non Wisper. In tutte le pagine dove uno cercherebbe "Sfoglia
OneDrive" c'è la riga **Sfoglia OneDrive e Google Drive** con la pillola **Non collegato**.

**La cartella della commessa e del cliente.** Ogni commessa e ogni cliente possono avere **una** cartella principale
(un collegamento `cartella` con `principale = 1`): in cima alla scheda Documenti c'è **Apri la cartella** (OneDrive,
Drive o percorso). Il campo `commesse.cartella` di oggi (la cartella Drive delle commesse) diventa questo
collegamento con la migrazione (§4.5) e resta per le versioni vecchie.

### 3.2 Un ticket riusa calendario, ore, spese e rapportino

| Cosa serve al ticket | Dove sta davvero | Cosa aggiunge la fase 5 |
|---|---|---|
| Quando si va | un'**attività** della fase 2 (tipo nuovo `intervento`), nel calendario di tutti, con le sovrapposizioni e i promemoria di sempre | `attivita.ticket_id`; **Pianifica l'intervento** dal ticket crea l'attività già compilata |
| Chi va | `ticket.responsabile_id`; l'attività ha la sua persona (di base il responsabile) | niente |
| Ore | i **rapportini** (ore di lavoro, extra, viaggio) e le **ore registrate** della fase 3 (assistenza al telefono, preparazione in ufficio) | `rapportini.ticket_id`, `ore.ticket_id` |
| Materiali e spese | le **spese** della fase 3 (il materiale è la categoria `materiale`), anche quelle del passo 3 del rapportino | `spese.ticket_id` (quelle del rapportino lo prendono dal rapportino) |
| Foto del guasto | file del ticket, come gli allegati delle attività (`caricaFile {tipo: "ticket"}`) | tipo di file `ticket`; **Metti nell'archivio** lo fa diventare un documento |
| Firma del cliente | il **rapportino** (§3.3) | niente |
| Fattura | *Da fatturare* della fase 4 | sorgente nuova `ticket` (§3.4) |
| Cronologia | `ticket_eventi` (frasi pronte, per la pagina del ticket); ogni modifica anche nel registro | tabella nuova |

Niente agenda nuova, niente "ore del ticket" separate, niente materiali scritti due volte. Le statistiche dei ticket
sommano ore, km e spese **da lì**.

### 3.3 Il rapportino conclusivo senza cambiare i tre passi

- Sul ticket, quando il lavoro è da fare o fatto, il pulsante giallo è **Scrivi il rapportino**: apre il rapportino di
  sempre **al passo 2** (Ore e strada) con il passo 1 già scelto (cliente e commessa del ticket; senza commessa, solo
  il cliente), il **luogo** = l'indirizzo dell'impianto, e sopra la riga "{cliente} · {commessa}" una pillola grigia
  "Ticket TK/2026/0014". La descrizione resta vuota (la scrive chi ha lavorato); passo 3, riepilogo, firma e PDF
  sono quelli di oggi.
- Il rapportino nasce con `idTicket` (o `idLocaleTicket` se anche il ticket è nato senza rete): il server mette
  `rapportini.ticket_id` e, **se il campo Ticket del rapportino è vuoto**, ci scrive il numero del ticket (con il
  riferimento del cliente, se c'è: "TK/2026/0014 · rif. 4471"). Il PDF di oggi mostra già la cella "Ticket" quando il
  campo è pieno (`pc/ui/documenti.js`): **nessun modello cambia**. Il campo si vede nel passo 3 anche con
  `TICKET_ATTIVO` a NO quando è pieno, come oggi.
- Dopo **Conferma firma** (o Salva senza firma), se il rapportino ha un ticket non ancora risolto, il telefono e il
  computer aprono il foglio **Il lavoro è finito?**: **Sì, è risolto** (giallo) → `risolviTicket`; "Serve un altro
  intervento" → il ticket resta *In carico* con la riga "Serve un altro intervento" nella cronologia. Senza rete tutte e
  due le cose vanno nella coda, dopo il rapportino.
- Un rapportino scritto dalla strada solita si può **legare** a un ticket dopo: nel rapportino aperto, menu ⋯ → **Lega
  a un ticket** (i ticket aperti di quel cliente). Si slega con ⋯ → **Togli dal ticket** finché il ticket non è
  riservato o fatturato.
- Più rapportini per un ticket vanno bene (due uscite); un rapportino ha **un** ticket al massimo.

### 3.4 Da ticket a Da fatturare

Alla **chiusura** il titolare o l'amministrazione sceglie **Come si fattura** (`ticket.fatturazione`):

| Valore | Sullo schermo | Cosa succede in *Da fatturare* |
|---|---|---|
| `ticket` | **Una riga per l'intervento** | una voce sola, il ticket, che porta con sé rapportini, ore e spese: importo = somma del lavoro (§7.6), oppure il **prezzo a corpo** scritto alla chiusura |
| `separati` | **Con gli altri rapportini** | il ticket non è una voce: i suoi rapportini, ore e spese diventano sorgenti normali (le regole della fase 4, compreso il mese di Elettrodinamica) |
| `contratto` | **Nel contratto** | niente da fatturare: è coperto dal canone del contratto; le spese al cliente si fatturano a parte se il contratto non comprende i materiali |
| `no` | **Non si fattura** | niente da fatturare (garanzia, cortesia): **motivo obbligatorio** |

- **Proposta** (già scelta, si cambia): ticket di un contratto che lo copre (§8.2) → `contratto`; cliente a tariffa
  fissa (Elettrodinamica) → `separati` (così il mese resta una riga); gli altri → `ticket`.
- **Finché il ticket non è chiuso**, i suoi rapportini, ore e spese **non compaiono** in *Da fatturare* (aspettano la
  decisione): così nessuno li fattura da soli mentre il ticket è aperto. La Dashboard ricorda i ticket risolti da
  chiudere.
- La voce `ticket` usa **lo stesso indice unico** della fase 4: quando entra in una bozza, `fattura_sorgenti` riceve una
  riga per il **ticket** e una per **ogni** rapportino, spesa e riga di ore dentro di lui, tutte con lo stesso
  `gruppo` (`ticket:TK/2026/0012`). Così nessuno di loro può finire in un'altra bozza, gli effetti dell'emissione
  della fase 4 (§7.2: rapportino FATTURATO, `fatturata_il` di spese e ore) valgono da soli, e una nota di credito che
  storna il gruppo li libera tutti insieme.
- I rapportini di un ticket chiuso `contratto` o `no` non sono più "da fatturare": nell'elenco dei rapportini hanno la
  pillola "Nel contratto CA/2026/002" o "Non si fattura" ed escono dal segmento *Da fatturare* e dai conteggi.

### 3.5 I contratti di assistenza

- Un contratto ha cliente, impianti coperti, periodo, rinnovo (tacito o no), preavviso di disdetta, **canone** e come
  si fattura, cosa copre (solo visite, o visite e guasti), materiali compresi o no, tariffa per il lavoro fuori
  contratto, tempi d'intervento promessi, visite periodiche per impianto.
- **Ogni contratto ha la sua commessa** (nasce quando il contratto si attiva, "Assistenza {titolo}", a corpo, oppure si
  sceglie una commessa che c'è). Perché: (1) il **canone** si fattura con le **scadenze di pagamento** della commessa,
  che la fase 4 sa già portare in *Da fatturare* (nessuna sorgente nuova per il canone); (2) ore, km e spese di tutti
  i ticket del contratto finiscono nel **costo della commessa** (fase 3): si vede se il contratto rende; (3) la
  commessa a corpo tiene fuori dalla fatturazione i rapportini delle visite (regola della fase 4). La commessa ha la
  pillola **Assistenza** negli elenchi.
- Le **visite periodiche** sono **scadenze** (§6) con `azione = ticket`: 30 giorni prima della data nasce da solo un
  ticket **programmato**, *da pianificare*. Si vede la prossima visita, non tutte.

### 3.6 Le scadenze: una tabella sola, nel calendario senza copiarle

Verifiche degli impianti, documenti che scadono, visite dei contratti, polizze: tutte in `scadenze` (§4.4), che dalla
fase 6 servirà anche a mezzi, tarature e persone. Il calendario della fase 2 **mostra** le scadenze nel loro giorno
(una riga con la bandierina, "Scadenza"), leggendole da `scadenze {da, a}`: non diventano attività, quindi non si
scrivono due volte. Quando una scadenza chiede lavoro, diventa un **ticket** (e l'intervento un'attività): una cosa
per posto.

### 3.7 I modelli: impaginazione nel codice, testi modificabili

I PDF di oggi (rapportino, riepilogo, preventivo, prospetto della fattura, avviso di parcella) restano impaginati in
`pc/ui/documenti.js`, uguali su telefono e computer: è la garanzia che escano identici e che nessuno li rompa
cambiando un'impostazione. Si cambiano i **testi**: condizioni e introduzione del preventivo (oggi in
`PREVENTIVO_CONDIZIONI`), oggetto e messaggio delle email per tipo, il testo delle **lettere** e del **contratto di
assistenza**, con i segnaposti (§5.7). Due modelli nuovi impaginati nel codice: **Lettera** e **Contratto di
assistenza**. I **modelli dello studio** (il modulo della DiCo, un verbale, una checklist in Word o PDF) sono file
dell'archivio nella categoria *Modelli dello studio*: si aprono e si scaricano, Wisper non li compila.

### 3.8 Spazio, copie e condivisione

- File fino a **50 MB** (`FILE_MAX_MB`), caricati **in byte** con `POST /carica` (§5.4), non più in base64 dentro il
  JSON (60 MB di testo in memoria per un file di 45).
- **Disco quasi pieno**: sotto 10 GB liberi la Dashboard avvisa titolare e amministrazione; sotto 2 GB il server
  **rifiuta i documenti nuovi** ma accetta ancora foto e firme dei rapportini (piccole, e servono al lavoro di ogni
  giorno) fino a 200 MB liberi. Amministrazione › **Spazio sul NAS** dice dove va lo spazio e permette al titolare di
  togliere per sempre i file nel cestino da più di 90 giorni.
- **Copie**: il database (con documenti, collegamenti, scadenze, ticket) ogni notte come oggi; i **file caricati**
  (tutte le revisioni) sul NAS e fuori casa col postino, **uno alla volta, fino a 25 MB ciascuno**
  (`COPIA_FUORI_MAX_MB`); quelli più grandi restano **solo sul NAS** e la Dashboard lo dice ("2 file troppo grandi per
  la copia fuori casa"). I **collegamenti** non si copiano: il file è su OneDrive o Drive, che hanno le loro copie.
- **Al cliente**: **Manda per email** (allegato, fino a 15 MB, dal postino come i PDF di oggi) funziona dalla fase 5. Il
  **link che scade** (14 giorni, revocabile, si vede quante volte è stato aperto) è progettato (§5.8) ma è **Non
  collegato**: per aprirlo da fuori bisogna esporre una porta del server su internet, e la decisione è di Andrea
  (domanda 3).

### 3.9 Il telefono senza rete

Come i rapportini di oggi: si legge quello che è stato letto l'ultima volta, si scrive nella coda su disco, parte
appena c'è rete.
- **Si leggono senza rete**: i ticket *in carico a me* e quelli con un intervento oggi o domani, ognuno con lo
  storico del suo impianto (le ultime 10 voci) e l'elenco dei documenti dell'impianto; i contratti di quei clienti.
  Salvati a ogni lettura riuscita, con "letto alle 16:52".
- **Si fanno senza rete** (vanno nella coda, nell'ordine): nuovo ticket (con `idLocale`, numero proposto da
  `numerazioni.prossimo` come le commesse), Prendo io, foto del ticket, rapportino col ticket e firma, Il lavoro è
  finito, ore e spese col ticket, scadenza segnata fatta.
- **Documenti senza rete**: si aprono quelli **tenuti sul telefono** (⋯ → **Tieni sul telefono**, fino a 300 MB; si
  tolgono i più vecchi) e quelli aperti di recente; gli altri dicono "Si apre quando c'è rete". Un collegamento lo
  apre OneDrive o Drive, che hanno la loro modalità senza rete.
- Pillola grigia in basso come oggi: "1 ticket e 1 rapportino partono appena c'è rete". Mai rosso per la sola rete.

## 4. Dati (migrazione 005)

`server/src/migrazioni/005-documenti-ticket.sql` + `005-documenti-ticket.js`, con la copia `wisper.db.prima-5` prima
(come le altre). Importi in euro al centesimo con `centesimi()`; date `aaaa-mm-gg`; istanti col fuso nel database e
`"2026-10-22T08:40:00"` nelle risposte (§12.1). Le tabelle da cui si tolgono righe hanno `AUTOINCREMENT`.

### 4.1 Impostazioni nuove

| Chiave | Valore iniziale | Cosa |
|---|---|---|
| `FILE_MAX_MB` | `50` | grandezza massima di un file caricato |
| `SPAZIO_AVVISO_MB` | `10240` | sotto questo spazio libero la Dashboard avvisa |
| `SPAZIO_MINIMO_MB` | `2048` | sotto, niente documenti nuovi (foto e firme dei rapportini sì fino a 200 MB) |
| `COPIA_FUORI_MAX_MB` | `25` | i file più grandi non vanno nella copia fuori casa |
| `EMAIL_ALLEGATI_MAX_MB` | `15` | allegati di **Manda per email** |
| `COPIA_INVIATI` | `true` | tieni una copia dei PDF mandati per email (§5.8) |
| `CONDIVISIONE_INDIRIZZO` | `""` | l'indirizzo pubblico dei link per i clienti; vuoto = **Non collegato** |
| `CONDIVISIONE_GIORNI` | `14` | durata proposta di un link |
| `PREAVVISO_GIORNI` | `60` | preavviso proposto delle scadenze |
| `ANTICIPO_TICKET_GIORNI` | `30` | quanti giorni prima della scadenza nasce il ticket programmato |
| `TICKET_TEMPI` | `{"urgente":{"presa":1,"intervento":4},"alta":{"presa":2,"intervento":24},"normale":{"presa":8,"intervento":72},"bassa":{"presa":24,"intervento":240}}` | ore di calendario dall'apertura (da confermare: domanda 6 a Manuel) |

### 4.2 Numerazioni nuove

`ticket` = `TK/{AAAA}/{NNNN}`, riparte ogni anno; `contratto` = `CA/{AAAA}/{NNN}`, riparte ogni anno. Come le altre:
"il più alto già usato + 1", i buchi non si riusano, `prossimo` in `anagrafiche.numerazioni` per proporlo senza rete.
I documenti non hanno numero di Wisper: hanno il loro `riferimento` (es. "DiCo 12/2026").

### 4.3 Colonne nuove su tabelle che ci sono

- `sedi` (le sedi e gli **impianti** del cliente, fase 1): `categoria` TEXT NOT NULL DEFAULT `''` (`cabina_mt`, `quadro`,
  `terra`, `scariche`, `fotovoltaico`, `automazione`, `illuminazione`, `altro`; parole: "Cabina MT", "Quadro", "Impianto
  di terra", "Protezione dalle scariche", "Fotovoltaico", "Automazione", "Illuminazione", "Altro"), `sede_padre_id`
  INTEGER (l'impianto sta in quella sede), `matricola` TEXT, `potenza` TEXT ("630 kVA", testo libero), `tensione` TEXT,
  `messa_in_servizio` TEXT (data), `ambiente` TEXT NOT NULL DEFAULT `''` (`ordinario`, `cantiere`, `medico`, `incendio`,
  `esplosione`: propone la periodicità DPR 462, §6.3), `referente_id` INTEGER (il referente sul posto), `dati_tecnici`
  TEXT (note libere). Tutte facoltative; contano solo per `tipo = impianto`.
- `rapportini`: `ticket_id` INTEGER (il ticket di cui è il rapportino). La colonna `ticket` (testo) resta com'è.
- `attivita`: `ticket_id` INTEGER; `tipo` accetta anche `intervento` (CHECK rifatto come nella 002).
- `ore`, `spese`: `ticket_id` INTEGER. Una spesa di un rapportino ha il ticket del rapportino (lo scrive il server).
- `file`: tipi nuovi `ticket` (foto e allegati del ticket), `caricato` (arrivato con `/carica`, non ancora legato:
  dopo 24 ore senza legame va nel cestino), `inviato` (copia di un PDF mandato); colonne `documento_id`,
  `versione_id`, `ticket_id`, `fuori_il` (quando è arrivato nella copia fuori casa), `fuori_no` (`''` o il motivo:
  `troppo grande`). La tabella si rifà come nella 002 e nella 004 (CHECK).
- `scadenze_pagamento`: `contratto_id` INTEGER (le rate del canone, §8.3).
- `fattura_sorgenti` (fase 4): `tipo` accetta anche `ticket` (CHECK rifatto). L'indice unico non cambia.
- `commesse`: `contratto_id` INTEGER (la commessa di un contratto: pillola **Assistenza**).
- `soggetti`: niente.

### 4.4 Tabelle nuove

**`documento_categorie`**: id · `nome` · `approvazione` 0/1 (le revisioni di chi non approva vanno *Da approvare*) ·
`vede` `tutti` | `costi` | `riservati` (di base per i documenti nuovi della categoria) · `scadenza_mesi` (proposta della
scadenza, `null` = nessuna) · `ordine` · `attiva` 0/1 · `sistema` 0/1 (nata dalla migrazione: si rinomina, non si
toglie). Iniziali, in quest'ordine (approvazione, vede):

| Nome | Approvazione | Vede | Scadenza proposta |
|---|---|---|---|
| Progetti e schemi | sì | tutti | — |
| Dichiarazioni di conformità | sì | tutti | — (non scadono) |
| Dichiarazioni di rispondenza | sì | tutti | — |
| Verbali di verifica | no | tutti | dall'impianto (§6.3) |
| Relazioni e collaudi | sì | tutti | — |
| Certificati | no | tutti | 12 mesi |
| Contratti | no | costi | fine del contratto |
| Polizze e assicurazioni | no | costi | 12 mesi |
| Corrispondenza | no | tutti | — |
| Foto | no | tutti | — |
| Manuali e schede tecniche | no | tutti | — |
| Modelli dello studio | no | tutti | — |
| Documenti dello studio | no | tutti | — |
| Mandati ai clienti | no | costi | — (sistema: le copie di §5.8) |
| Da classificare | no | tutti | — (sistema: i file arrivati dalla fase 1) |
| Documenti personali | no | riservati | — (sistema, per la fase 6: non si vede senza `riservati`) |

**`documenti`**: id INTEGER PK AUTOINCREMENT · `id_locale` TEXT UNIQUE (nato senza rete) · `titolo` · `categoria_id` ·
`descrizione` · `parole` (parole per cercarlo, testo) · `riferimento` (numero del documento: "DiCo 12/2026") ·
`data_documento` · `cliente_id` · `commessa_id` · `sede_id` (sede o impianto) · `ticket_id` · `contratto_id` · `origine`
`file` | `collegamento` | `inviato` · `url` (collegamento: link o percorso) · `collegamento_tipo` `onedrive` |
`sharepoint` | `gdrive` | `percorso` | `web` (`''` per i file) · `cartella` 0/1 · `principale` 0/1 (la cartella della
commessa o del cliente: una sola per ciascuno, indice unico parziale) · `versione_valida_id` · `vede` `tutti` | `costi` |
`riservati` · `scadenza_id` · `archiviato` (istante o null) · `creato_da`, `creato`, `modificato`.

**`documento_versioni`** (solo per `origine = file` e `inviato`): id AUTOINCREMENT · `documento_id` · `numero` (0, 1,
2...: "rev. 0") · `file_id` · `nome_file` · `mime` · `byte` · `sha256` · `nota` (cosa cambia) · `stato` `da_approvare` |
`approvata` | `respinta` · `caricata_da`, `caricata_il` · `decisa_da`, `decisa_il` · `motivo_rifiuto` · `tolta` (istante:
una da approvare o respinta tolta da chi l'ha caricata).

**`documento_condivisioni`** (i link per il cliente, §5.8): id AUTOINCREMENT · `documento_id` · `versione_id` (quella
valida quando nasce: il cliente vede quella, anche se dopo ne arriva una nuova) · `token_hash` (SHA-256 del token di 32
byte; il token non si salva) · `per_chi` (testo) · `scade` (data) · `revocata_il` · `aperture` · `ultima_apertura` ·
`creata_da`, `creata`.

**`scadenze`**: id AUTOINCREMENT · `titolo` · `tipo` `verifica_terra` | `verifica_scariche` | `verifica_protezioni` |
`manutenzione` | `documento` | `polizza` | `contratto` | `altro` · `cliente_id` · `sede_id` · `documento_id` (il documento
che la fa nascere: l'ultimo verbale) · `contratto_id` · `data` · `preavviso_giorni` · `ogni_mesi` (`null` = una volta) ·
`dalla_fatta` 0/1 (la prossima si conta dal giorno in cui si fa: 1 per le verifiche; dalla data prevista: 0 per le
visite dei contratti) · `azione` `promemoria` | `ticket` · `anticipo_giorni` (per `ticket`) · `assegnata_a` · `stato`
`aperta` | `fatta` | `annullata` · `fatta_il` · `ticket_id` (il ticket nato) · `documento_fatto_id` (il documento che la
chiude: il verbale nuovo) · `prossima_id` · `note` · `creata_da`, `creato`, `modificato`.

**`contratti`**: id AUTOINCREMENT · `numero` UNIQUE (CA/2026/002) · `cliente_id` · `titolo` · `commessa_id` ·
`preventivo_id` · `dal` · `al` · `rinnovo` `tacito` | `no` · `disdetta_giorni` (preavviso di disdetta) · `stato` `bozza` |
`attivo` | `disdetto` | `chiuso` · `canone` (all'anno) · `fatturazione_canone` `annuale` | `semestrale` | `trimestrale` |
`mensile` | `nessuna` (rate anticipate) · `copre` `visite` | `visite_guasti` · `materiali_inclusi` 0/1 · `tariffa_extra`
(€/h del lavoro fuori contratto; `null` = la tariffa del cliente) · `tempi` (JSON come `TICKET_TEMPI`, solo le voci che
cambiano; `null` = quelli dello studio) · `documento_id` (il contratto firmato) · `disdetto_il`, `motivo` · `note` ·
`creato_da`, `creato`, `modificato`.

**`contratto_impianti`**: `contratto_id` · `sede_id` · `ogni_mesi` (visite; `null` = nessuna visita programmata) ·
`prima_visita` (data) · `scadenza_id` (la scadenza delle visite di quell'impianto). Chiave (`contratto_id`, `sede_id`).

**`ticket`**: id INTEGER PK AUTOINCREMENT · `numero` UNIQUE (TK/2026/0014) · `id_locale` UNIQUE · `cliente_id` · `sede_id` ·
`commessa_id` · `contratto_id` · `titolo` · `descrizione` (cosa dice il cliente) · `tipo` `guasto` | `verifica` |
`piccolo` | `assistenza` | `programmato` · `origine` `telefono` | `email` | `sopralluogo` | `ufficio` | `scadenza` |
`whatsapp` | `portale` (gli ultimi due per la fase 7: il server li rifiuta finché non sono collegati) · `richiedente`
(chi ha chiamato, testo) · `referente_id` · `rif_cliente` (il numero del cliente: buono, ordine) · `impatto` `fermo` |
`ridotto` | `nessuno` · `urgenza` `subito` | `presto` | `quando_si_puo` · `priorita` `urgente` | `alta` | `normale` |
`bassa` · `priorita_a_mano` 0/1 · `responsabile_id` · `stato` `aperto` | `in_carico` | `in_attesa` | `risolto` | `chiuso`
| `annullato` · `aperto_il` (istante: quando è arrivata la richiesta) · `previsto_il` (data: per i programmati) ·
`entro_presa`, `entro_intervento` (istanti, §7.2) · `preso_il` · `intervento_il` · `risolto_il` · `chiuso_il` ·
`annullato_il` · `motivo` (attesa o annullo) · `esito` (cosa si è fatto, in breve) · `fatturazione` `''` | `ticket` |
`separati` | `contratto` | `no` · `prezzo_corpo` · `motivo_no` · `fatturato_il` · `scadenza_id` · `creato_da`, `creato`,
`modificato`.

**`ticket_eventi`**: id AUTOINCREMENT · `ticket_id` · `quando` · `utente_id` · `testo` (frase pronta: "Aperto da Manuel
Gasparotto (telefono)", "Preso da Marco Rossato", "Intervento pianificato per giovedì 23 alle 9:00", "Rapportino
RAP/2026/0151 firmato da Mario Bianchi", "Risolto", "Chiuso: una riga per l'intervento", "In attesa: aspetta il modulo di
uscite dal fornitore"). Non si cambia e non si cancella.

**`modelli_testi`**: `chiave` PK · `testo` · `modificato`, `modificato_da`. Chiavi iniziali in §5.7.
`PREVENTIVO_CONDIZIONI` resta un'impostazione (lo leggono le versioni di oggi): la pagina Modelli la mostra e la salva
lì.

### 4.5 Cosa fa la migrazione ai dati di oggi

- Ogni file `tipo = 'documento'` non cestinato (i documenti delle commesse, anche quelli copiati da Drive) diventa un
  `documento` (titolo = nome del file senza estensione, categoria **Da classificare**, `commessa_id` e `cliente_id`
  della commessa, `origine = file`) con la sua **rev. 0** `approvata`. Il file non si sposta e mantiene l'id (le URL di
  oggi continuano a valere).
- Ogni commessa con `cartella` piena riceve un documento `collegamento`, `cartella = 1`, `principale = 1`, titolo
  "Cartella della commessa {id}", tipo dall'indirizzo (di solito `gdrive`).
- `sedi`: le colonne nuove vuote. Le categorie della §4.4, i testi dei modelli (§5.7), le numerazioni, le impostazioni.
- Prova (`server/prove/migrazione-005.test.js`): un database della fase 4 coi documenti delle commesse e una cartella;
  dopo, `documentiCommessa` di oggi risponde uguale (stessi id e nomi) e `/file/<id>` dà gli stessi byte.

## 5. Documenti

### 5.1 Il tipo del collegamento

`tipoCollegamento(url)` in `server/src/documenti.js` (le app lo rifanno per la pillola mentre si incolla; casi in
`server/prove/casi-collegamenti.json`):

| Indirizzo | `collegamento_tipo` | Pillola | Cartella proposta se |
|---|---|---|---|
| `https://…-my.sharepoint.com/…`, `https://1drv.ms/…`, `https://onedrive.live.com/…` | `onedrive` | OneDrive | c'è `/:f:/` o `/f/` |
| `https://….sharepoint.com/…` | `sharepoint` | SharePoint | c'è `/:f:/` o `Forms/AllItems` |
| `https://drive.google.com/…`, `https://docs.google.com/…` | `gdrive` | Google Drive | c'è `/drive/folders/` |
| `\\server\…`, `X:\…`, `file:///…` | `percorso` | Cartella del computer | finisce con `\` o non ha estensione |
| altro `https://…` | `web` | Sito | mai |

Rifiutati: `"Collegamento: incolla un indirizzo che comincia con https:// o un percorso come \\server\cartella"`
(`http://`, `javascript:`, `data:`, testo che non è un indirizzo). Gli spazi in fondo si tolgono; si salva l'indirizzo
così com'è. Aprire: sul telefono un link si apre col sistema (l'app OneDrive o Drive se c'è, se no il browser); sul
computer col browser; un **percorso** sul computer si apre in Esplora file, sul telefono non si può: la pagina mostra il
percorso con **Copia** e la riga "Si apre dal computer dello studio".

### 5.2 Revisioni e approvazione

- Un documento `file` nasce con la **rev. 0**; **Carica una revisione** aggiunge la rev. successiva con la sua `nota`
  (obbligatoria dalla rev. 1: `"Scrivi cosa cambia in questa revisione"`). Le revisioni non si cambiano mai: si
  aggiunge.
- **Stato della revisione**: nasce `approvata` se la categoria non chiede approvazione **o** se la carica chi approva;
  altrimenti `da_approvare`. **Chi approva**: titolare e amministrazione con `documenti` 2 (come le ore della fase 3);
  con `APPROVAZIONE = tutti` anche il titolare manda in approvazione e può approvare le sue (fase 3 §14.17).
- **Valida** = la revisione approvata col numero più alto (`versione_valida_id`). Una revisione *Da approvare* **non
  sostituisce** la valida: chi apre il documento apre la valida, e vede la riga "rev. 3 da approvare". Senza nessuna
  approvata il documento è *Da approvare* e si apre la sua unica revisione con la pillola.
- **Superata**: ogni revisione approvata più vecchia della valida. Si apre con la pillola e, scaricandola, il nome del
  file ha in fondo `" (rev. 1, superata)"`.
- **Respingi** vuole il motivo (`"Scrivi il motivo: arriva a chi l'ha caricata"`), che arriva nella Dashboard di chi
  l'ha caricata; **Annulla** dell'avviso rimette *Da approvare*. Una revisione *Da approvare* o *Respinta* si toglie
  solo da chi l'ha caricata (va nel cestino); un'approvata mai.
- I collegamenti non hanno revisioni: cambiare l'indirizzo è un salvataggio (`salvaDocumento`), nel registro; la riga
  "Le revisioni le tiene OneDrive" (o Google Drive) sta nella pagina.

### 5.3 Chi vede

- Il modulo `documenti` dà il livello (titolare, amministrazione 2; collaboratore 1; lettura 1). In più ogni documento
  ha `vede`: `tutti`; `costi` = solo chi ha il permesso `costi` ≥ 1 (contratti col canone, copie dei preventivi
  mandati); `riservati` = solo chi ha `riservati` (fase 6). Il server **non manda** i documenti che uno non vede (né
  negli elenchi, né in `/file/<id>`: 403), e non dice che esistono (`"Documento 12 non trovato"`).
- **Il collaboratore** (documenti 1) legge l'archivio (tranne `costi` e `riservati`), apre, scarica, tiene sul
  telefono; non carica e non approva. Le sue foto vanno sui **ticket** (modulo `ticket` 2) e sui rapportini, come oggi.
  Se Andrea gli dà `documenti` 2, carica e cambia **solo i documenti creati da lui**, e le sue revisioni nelle categorie
  con approvazione vanno *Da approvare*.
- **Lettura** vede tutto (con `costi` 1), esporta, nessun pulsante per scrivere, nessun giallo.

### 5.4 Il caricamento in byte

`POST /carica?nome=<nome>&mime=<mime>&idFile=<idFile>&per=<documento|ticket>` con `Authorization: Bearer` e il file nel
corpo (`application/octet-stream`). Il server scrive su disco mentre arriva (`/data/file/<id>.scrivendo`, poi
rinomina), conta i byte, calcola lo SHA-256, e si ferma oltre `FILE_MAX_MB` (`"Il file è più grande di 50 MB: non si
carica"`, HTTP 200 con `ok:false`). Permesso: `per=documento` vuole `documenti` 2, `per=ticket` vuole `ticket` 2.
Spazio: §5.9. Risposta:

```json
{"ok": true, "file": {"id": "q8Zk…", "nome": "Schema unifilare cabina rev3.pdf", "mime": "application/pdf",
 "byte": 1830211, "sha256": "…"},
 "gia": {"idDocumento": 4, "titolo": "Schema unifilare cabina MT", "revisione": 2}}
```

`gia` c'è quando lo stesso SHA-256 è già una revisione di un documento non archiviato che chi chiede vede: l'app chiede
"Questo file c'è già: «Schema unifilare cabina MT» rev. 2. Lo carico lo stesso?". Lo stesso `idFile` ripetuto (la coda
del telefono) restituisce lo stesso file senza riscriverlo. Il file nasce `tipo = caricato` e diventa `documento` o
`ticket` quando `salvaDocumento`, `caricaVersione` o `caricaFile {tipo: "ticket", idFileCaricato}` lo legano. Le foto
dei rapportini e delle spese continuano con `caricaFile` in base64 come oggi.

### 5.5 Ricerca

`documenti {testo}` cerca, senza badare a maiuscole, accenti e spazi doppi, in: titolo, descrizione, parole, riferimento,
nome del file della revisione valida, nome del cliente, codice e descrizione della commessa, nome dell'impianto, numero
del ticket e del contratto. **Non cerca dentro i file** (Wisper non apre PDF e Word; si potrà con la fase 8). Più
parole = tutte devono esserci. Ordine: titolo che comincia con la parola, poi i più recenti.

### 5.6 "Da Wisper": quello che Wisper fa già

Filtrando per cliente, commessa o impianto, `documenti` risponde anche `daWisper`: preventivi (non sostituiti),
rapportini firmati o oltre, fatture emesse (solo con `fatturazione` 1 e `costi`), contratti di quel cliente,
commessa o impianto, come righe che **aprono la loro pagina** (il PDF lo fanno le app come oggi). Non sono copie: non
occupano spazio e non si sdoppiano.
`{"tipo": "rapportino", "id": "RAP/2026/0151", "titolo": "Rapportino RAP/2026/0151", "dettaglio": "21/10/2026 · Inverter
in errore di isolamento · firmato", "data": "2026-10-21", "pagina": "rapportino"}`.

### 5.7 Modelli e testi

`modelli {}` (documenti 1):
- **Modelli di Wisper** (impaginazione fissa, nel codice): Rapportino, Riepilogo del mese, Preventivo, Prospetto per il
  programma delle fatture, Avviso di parcella, **Lettera**, **Contratto di assistenza**. Per ognuno: i testi che si
  cambiano.
- Chiavi di `modelli_testi` iniziali: `EMAIL_RAPPORTINO_OGGETTO`, `EMAIL_RAPPORTINO_MESSAGGIO`, `EMAIL_RIEPILOGO_…`,
  `EMAIL_PREVENTIVO_…`, `EMAIL_DOCUMENTO_…` (i testi di oggi, presi dal codice delle app così come sono),
  `PREVENTIVO_INTRODUZIONE`, `LETTERA_VERIFICA_TERRA` ("Gentile {cliente}, l'impianto di terra di {impianto} è stato
  verificato il {ultima_verifica}: la prossima verifica periodica va fatta entro il {scadenza}..."),
  `LETTERA_LIBERA`, `CONTRATTO_CONDIZIONI`.
- **Segnaposti** (sempre tra graffe): `{cliente}`, `{indirizzo_cliente}`, `{referente}`, `{impianto}`,
  `{indirizzo_impianto}`, `{commessa}`, `{ticket}`, `{contratto}`, `{canone}` (solo con `costi`), `{dal}`, `{al}`,
  `{scadenza}`, `{ultima_verifica}`, `{oggi}`, `{studio}`, `{tecnico}`. Un segnaposto sconosciuto si rifiuta al
  salvataggio (`"Segnaposto sconosciuto: {cleinte}. Si possono usare {cliente}, {impianto}..."`).
- `componiModello {chiave, idCliente?, idSede?, idCommessa?, idTicket?, idContratto?, idScadenza?}` → `{"ok": true,
  "titolo": "…", "testo": "…", "mancano": ["{referente}"]}`: il testo coi segnaposti riempiti; quelli senza valore
  restano scritti e sono in `mancano` (l'app li mostra in giallo scuro da completare). Le app fanno il PDF con
  `lettera({titolo, testo, cliente, impianto}, imp)` e `contrattoAssistenza(contratto, imp)` in
  `pc/ui/documenti.js` (stesso modello per telefono e computer). **Salva nell'archivio** lo carica come documento
  (categoria Corrispondenza o Contratti).
- **I PDF di oggi non cambiano**: rapportino, riepilogo, preventivo, prospetto e avviso leggono gli stessi dati di
  prima; la prova li rifà coi dati di prova prima e dopo la migrazione e confronta il testo.

### 5.8 Mandare e condividere

- **Manda per email** (`inviaDocumento`): allegato il file della revisione valida (o di quella scelta), fino a
  `EMAIL_ALLEGATI_MAX_MB`; oltre: `"Il file è di 23 MB: per email ne passano al massimo 15"`. Per un collegamento
  manda **il collegamento** nel messaggio, e il foglio ha la riga "Il cliente lo apre solo se in OneDrive è condiviso
  anche fuori dallo studio" (OneDrive, SharePoint, Drive) o "Un percorso del computer non si può mandare" (pulsante
  spento). Parte dal postino come `inviaEmail`; nel registro; nella cronologia del documento.
- **Copia di quello che parte** (`COPIA_INVIATI`): quando Wisper manda un PDF per email (`inviaEmail` dei rapportini e
  dei riepiloghi, `inviaPreventivo`, `inviaAvviso`), il server tiene gli allegati come documento `origine = inviato`,
  categoria **Mandati ai clienti**, legato a cliente, commessa (e ticket), titolo = nome del file, con nota "mandato a
  {email} il {data}". Circa 100-300 KB per PDF.
- **Link che scade** (`condividiDocumento`): un token di 32 byte, `https://{CONDIVISIONE_INDIRIZZO}/condiviso/<token>`,
  scade dopo `CONDIVISIONE_GIORNI` (si cambia: da 1 a 90), si **revoca**, conta le aperture, mostra **solo la
  revisione** valida al momento del link. Il server lo serve su una **seconda porta** (`--porta-condivisione 8401`) che
  risponde **solo** a `/condiviso/<token>` (pagina minima col nome dello studio, il titolo e **Scarica**) e niente
  altro. Finché `CONDIVISIONE_INDIRIZZO` è vuoto: `{"ok": false, "errore": "I link per i clienti non sono collegati:
  manda il documento per email", "nonCollegato": true}` e nelle schermate la riga **Link che scade** con la pillola
  **Non collegato**. Per collegarlo serve aprire la porta 8401 da fuori (Tailscale Funnel, come Pactum): decisione di
  Andrea (domanda 3).

### 5.9 Spazio sul NAS e copie

- **Prima di ogni file**: spazio libero del disco dei dati (`fs.statfsSync`). Sotto `SPAZIO_MINIMO_MB`: `/carica`,
  `caricaVersione` e i documenti rispondono `{"ok": false, "errore": "Il disco del NAS è quasi pieno (restano 1,6 GB): il
  file non è stato caricato. Avvisa il titolare", "spazio": true}`; foto e firme dei rapportini e scontrini passano fino
  a 200 MB liberi. Sotto 200 MB nessun file.
- **Copia fuori casa**: invece di "i file arrivati dopo l'ultima copia riuscita", il server manda al postino i file con
  `fuori_il` vuoto e `fuori_no` vuoto, uno per richiesta, dai più vecchi, **per al massimo 20 minuti a notte**; ognuno
  riuscito prende `fuori_il`. Un file oltre `COPIA_FUORI_MAX_MB` prende `fuori_no = 'troppo grande'` e non si riprova.
  Un file che fallisce non ferma gli altri; l'esito `fuori` di `copie` diventa `"ok · 12 file · 3 restano per domani"`
  o `"errore: …"`. La regola "due notti di fila senza copia = email" resta, contata sul database.
- I collegamenti non si copiano. I file `caricato` mai legati vanno nel cestino dopo 24 ore.
- `spazio {}` (amministrazione 1):
  ```json
  {"ok": true, "disco": {"totaleMb": 3815000, "liberoMb": 1843200, "avvisoMb": 10240, "minimoMb": 2048},
   "file": {"mb": 2140.5, "quanti": 1873},
   "perTipo": [{"tipo": "documenti", "nome": "Documenti", "mb": 1320.2, "quanti": 412},
               {"tipo": "rapportini", "nome": "Foto e firme dei rapportini", "mb": 610.4, "quanti": 1250},
               {"tipo": "ticket", "nome": "Foto dei ticket", "mb": 120.8, "quanti": 160},
               {"tipo": "inviati", "nome": "Mandati ai clienti", "mb": 40.1, "quanti": 210},
               {"tipo": "cestino", "nome": "Cestino", "mb": 49, "quanti": 41}],
   "perAnno": [{"anno": 2026, "mb": 1980.1}],
   "piuGrandi": [{"id": "…", "nome": "Rilievo laser capannone.zip", "mb": 48.2, "documento": 31, "fuori": "troppo grande"}],
   "fuori": {"ultima": "2026-10-22T02:30:00", "daCopiare": 3, "troppoGrandi": [{"id": "…", "nome": "…", "mb": 48.2}]},
   "cestinoVecchio": {"mb": 31.5, "quanti": 22}}
  ```
- `svuotaCestino {conferma}` (**solo titolare**): toglie per sempre i file nel cestino da più di 90 giorni (dal disco del
  NAS; la copia fuori casa, se c'era, resta su Drive). Prima risposta `serveConferma`: "Tolgo per sempre 22 file
  (31,5 MB) messi nel cestino prima del 24/07: non si potranno più recuperare". Nota nel registro.

## 6. Scadenze

### 6.1 Come vivono

- **Stato visto** (parola e colore): `aperta` con la data passata → **Scaduta** (rosso tenue, "da 22 giorni"); `aperta`
  entro il preavviso → **Scade fra N giorni** (ambra; "Scade oggi", "Scade domani"); `aperta` oltre → **Prossima**
  (grigia, con la data); `fatta` → **Fatta** (verde, "il 03/10"); `annullata` → **Annullata** (grigia).
- `faiScadenza {id, data?, idDocumento?}`: `fatta`, `fatta_il` = data (oggi), `documento_fatto_id`; se `ogni_mesi`,
  nasce la **prossima** (`prossima_id`) uguale, con data = (`dalla_fatta` ? `fatta_il` : `data`) + `ogni_mesi` mesi
  (ultimo giorno del mese se il giorno non c'è). Una ripetuta uguale dalla coda risponde ok senza rifare niente.
- Caricare un documento nella categoria **Verbali di verifica** (o un altro con lo stesso impianto e una scadenza
  aperta dello stesso tipo) propone, nel foglio dopo il salvataggio, "È la verifica che chiude la scadenza del
  12/01/2027?" **Sì, segna fatta** → `faiScadenza` con quel documento.
- Chiudere (o risolvere) un ticket nato da una scadenza la segna fatta con la data della risoluzione.
- `togliScadenza {id, motivo}` → `annullata`; una ricorrente chiede "solo questa / anche le prossime" (le prossime non
  ci sono ancora: "anche le prossime" toglie `ogni_mesi`).

### 6.2 Quando una scadenza fa nascere un ticket

Ogni notte (con l'allungamento delle ricorrenze della fase 2) e al salvataggio: per ogni scadenza `aperta`, `azione =
ticket`, senza `ticket_id`, con `data − anticipo_giorni ≤ oggi`: nasce un ticket `tipo = programmato`, `origine =
scadenza`, `previsto_il = data`, titolo = titolo della scadenza ("Manutenzione cabina MT Acme"), cliente, impianto,
contratto e commessa della scadenza, responsabile = `assegnata_a` (stato `in_carico`; se vuoto, `aperto`), priorità
`normale`, `entro_intervento` = la fine del giorno `data`. Nel registro e nella cronologia: "Nato dalla scadenza del
20/11/2026". Una sola volta (`ticket_id`).

### 6.3 Le proposte (da confermare con Manuel, ricerca §4)

| Tipo | Titolo proposto | Ogni | Dalla | Preavviso | Azione |
|---|---|---|---|---|---|
| `verifica_terra` | "Verifica impianto di terra (DPR 462)" | 60 mesi; 24 se l'ambiente dell'impianto è cantiere, medico, incendio o esplosione | fatta | 90 giorni | promemoria |
| `verifica_scariche` | "Verifica protezione dalle scariche (DPR 462)" | come sopra | fatta | 90 giorni | promemoria |
| `verifica_protezioni` | "Verifica protezioni SPG e SPI" | 60 mesi | fatta | 90 giorni | promemoria |
| `manutenzione` | "Manutenzione {impianto}" (contratti) | dal contratto | data | — | ticket, 30 giorni prima |
| `documento`, `polizza` | il titolo del documento + " scade" | dalla categoria | data | 60 giorni | promemoria |
| `contratto` | "Disdetta del contratto {numero}" | — | — | 30 giorni | promemoria (nasce da solo, §8.4) |

Le verifiche DPR 462 le fanno ASL, ARPA o un organismo abilitato: per lo studio sono un **promemoria per il cliente**
(Modelli › Lettera "Verifica impianto di terra" lo prepara). La DiCo non scade e non ha scadenza.

## 7. Ticket

### 7.1 Stati e passaggi

| Da | Azione | A | Note |
|---|---|---|---|
| — | `salvaTicket` (nuovo) | `aperto`; `in_carico` se ha il responsabile | `aperto_il` di base adesso; `entro_*` calcolati |
| `aperto` | `prendiTicket`, `assegnaTicket`, `salvaTicket` col responsabile, `pianificaTicket` | `in_carico` | `preso_il` la prima volta |
| `in_carico` | `assegnaTicket {responsabileId: null}` | `aperto` | `preso_il` resta |
| `aperto`, `in_carico` | `sospendiTicket {motivo}` | `in_attesa` | motivo obbligatorio ("Aspetta il materiale") |
| `in_attesa` | `riprendiTicket` | `in_carico` (o `aperto` senza responsabile) | |
| `aperto`, `in_carico`, `in_attesa` | `risolviTicket {esito?}` | `risolto` | `risolto_il`; `esito` di base la descrizione dell'ultimo rapportino |
| `risolto` | `riapriTicket {motivo}` | `in_carico` | |
| `risolto`, `in_carico`, `aperto` | `chiudiTicket {fatturazione, …}` | `chiuso` | solo titolare e amministrazione (§11.2); da `in_carico`/`aperto` = chiusura diretta (assistenza al telefono), mette anche `risolto_il` |
| `chiuso` (non riservato, non fatturato) | `riapriTicket {motivo}` | `in_carico` | `fatturazione` torna `''` |
| `aperto`, `in_carico`, `in_attesa` | `annullaTicket {motivo}` | `annullato` | non con rapportini legati non annullati: `"Il ticket ha il rapportino RAP/2026/0151: toglilo prima dal ticket"` |

Un rapportino legato a un ticket `aperto` lo porta `in_carico` (responsabile = chi l'ha scritto, se non c'era).
**Stato visto** (parola e colore, sempre insieme): Aperto (giallo tenue), In carico (blu; con l'intervento: "In carico ·
giovedì 23 alle 9:00"), In attesa (ambra, col motivo), Risolto (verde), Chiuso (grigio; con il modo: "Chiuso · nel
contratto"), Annullato (grigio). Più la pillola **In ritardo** (rosso tenue) quando adesso è oltre `entro_intervento` e
`intervento_il` è vuoto, o oltre `entro_presa` e `preso_il` è vuoto ("Da prendere da 2 ore").

### 7.2 Priorità e tempi

Matrice (`prioritaDa(impatto, urgenza)` in `server/src/conti.js`, casi in `server/prove/casi-ticket.json`, rifatta dalle
app per mostrarla mentre si risponde):

| | Subito | Presto (entro domani) | Quando si può |
|---|---|---|---|
| **Fermo** | urgente | alta | normale |
| **Va a metà** (`ridotto`) | alta | normale | bassa |
| **Funziona** (`nessuno`) | normale | bassa | bassa |

Senza risposte: `normale`. **Cambia** la priorità a mano (`priorita_a_mano = 1`; le risposte restano). Parole: Urgente
(rosso tenue), Alta (ambra), Normale (grigia), Bassa (grigia chiara, con la parola).
**Tempi**: `entro_presa` = `aperto_il` + ore di presa; `entro_intervento` = `aperto_il` + ore d'intervento, dalla tabella
`TICKET_TEMPI` o dai `tempi` del contratto del ticket; ore di calendario (notti e domeniche contano: da confermare).
Cambiare priorità o contratto li rifà. Programmati: `entro_intervento` = fine di `previsto_il`, `entro_presa` vuoto.
**Misure**: `preso_il` (prima presa in carico), `intervento_il` = il primo fra l'inizio di un'attività del ticket segnata
fatta, la nascita del primo rapportino del ticket, la prima riga di ore del ticket, la risoluzione; `risolto_il`,
`chiuso_il`.

### 7.3 Pianificare l'intervento

`pianificaTicket {id, inizio, fine?, assegnataA?, luogo?, note?, conferma?}` crea con la logica di `salvaAttivita` (fase
2 §13.7: sovrapposizioni con `serveConferma`, promemoria, un'ora di base) un'attività `tipo = intervento`, `ticket_id`,
titolo `"{numero} · {titolo}"`, cliente, commessa, `luogo` = indirizzo dell'impianto (o della sede), persona = responsabile
(o `assegnataA`, che diventa responsabile se non c'era), `descrizione` = descrizione del ticket. Il ticket va
`in_carico`. Un ticket può avere più interventi (un'altra uscita). Spostare o togliere l'intervento si fa come per ogni
attività (anche dal calendario); la pagina del ticket mostra i suoi interventi letti da `attivita {ticket}`. Il
calendario mostra l'intervento con la pillola "Ticket" e il tocco apre il ticket.

### 7.4 Il rapportino del ticket

§3.3. In più: `salvaRapportino` accetta `idTicket` o `idLocaleTicket`; errori `"Ticket TK/2026/0099 non trovato"`, `"Il
ticket TK/2026/0012 è chiuso: riaprilo per aggiungere un rapportino"`, `"Il ticket è di Rossi Impianti Srl, il rapportino
di Batokyo"` (il cliente deve essere lo stesso). Il collaboratore lega un rapportino solo a un ticket che vede (§11.2).
`legaRapportino {idRapportino, idTicket | null}` (rapportini 2) lega o slega dopo.

### 7.5 Ore, materiali, spese, foto

- **Ore** senza rapportino (assistenza al telefono, preparazione): `salvaOre {riga: {..., idTicket}}`; il ticket propone
  la commessa del ticket.
- **Materiali e spese**: `salvaSpesa {spesa: {..., idTicket}}`; dal ticket **+ Materiale o spesa** apre la Nuova spesa
  della fase 3 con categoria `materiale`, commessa e cliente del ticket, A chi va: *Al cliente*. Le spese del passo 3 del
  rapportino del ticket sono del ticket.
- **Foto**: `caricaFile {tipo: "ticket", idTicket, base64, mime, nome, idFile}` (ticket 2) oppure col file di `/carica`
  (`idFileCaricato`). Si vedono nel ticket e nello storico dell'impianto. **Metti nell'archivio** →
  `salvaDocumento {origine: "file", idFile, idTicket, idSede, idCategoria: Foto}` (con `documenti` 2).
- La pagina del ticket mostra la **somma**: ore (rapportini + ore registrate), km, materiale e spese; con `costi` anche
  il costo (fase 3) e l'importo che andrebbe in fattura (§7.6).

### 7.6 Chiudere e fatturare

`chiudiTicket {id, fatturazione, prezzoCorpo?, motivo?, conferma?}`:
- `ticket`: serve qualcosa da fatturare (un rapportino non annullato, ore fatturabili, spese al cliente o
  `prezzoCorpo`), se no `"Non c'è niente da fatturare: scrivi un prezzo a corpo o scegli Non si fattura"`.
- `separati`: niente da controllare. `contratto`: serve `contratto_id` (`"Il ticket non è legato a un contratto"`). `no`:
  `motivo` obbligatorio (`"Scrivi perché non si fattura"`); con spese al cliente, `serveConferma`: "Ci sono 18,50 € di
  spese segnate al cliente: con «Non si fattura» restano fuori dalla fattura. Chiudo lo stesso?".
- Rapportini del ticket ancora in BOZZA: si chiude lo stesso; la voce in *Da fatturare* resta in *Più avanti* finché non
  sono firmati.

**La voce in `daFatturare`** (fase 4 §11.1), tipo nuovo `ticket`:
```json
{"tipo": "ticket", "id": "TK/2026/0012", "idCommessa": "", "data": "2026-10-21", "titolo": "Inverter in errore di isolamento",
 "dettaglio": "Impianto fotovoltaico 6 kW · 1 rapportino · 2 ore · 24 km · materiale 18,50 €", "pronta": true,
 "importo": 126.74, "aCorpo": false, "dentro": [{"tipo": "rapportino", "id": "RAP/2026/0151"}, {"tipo": "spesa", "id": 41}],
 "anticipazione": false, "gruppo": "ticket:TK/2026/0012"}
```
- **È da fatturare quando**: `stato = chiuso`, `fatturazione = ticket`, `fatturato_il` vuoto, non riservato; **pronta** se
  tutti i suoi rapportini non annullati sono FIRMATI o INVIATI e approvati (o senza approvazione), le sue ore e spese
  approvate; se no va in `piuAvanti` con `perche` ("RAP/2026/0153 da far firmare").
- **Importo** (modo lavoro): somma, per ogni rapportino non annullato, di `compenso_ore + rimborso_km`; più le spese **al
  cliente non anticipate** del ticket e dei suoi rapportini; più le ore registrate fatturabili × prezzo orario
  (`tariffa_extra` del contratto se c'è, se no `prezzoOrarioDi(cliente, commessa)`; senza prezzo: voce `senzaPrezzo`).
  Modo corpo: `prezzo_corpo`. Le **spese anticipate** (art. 15) seguono la voce come voci `spesa` col `gruppo` del
  ticket e diventano righe N1 come nella fase 4.
- **Righe** (fase 4 §5.2, testi esatti, numeri all'italiana, le parti a zero non si scrivono):
  - lavoro: `"Intervento {numero} del {gg/mm/aaaa}: {titolo} - {impianto} ({ore pagate} ore, {km} km, materiale e spese
    {x} €)"`, quantità 1, importo = somma; data = `risolto_il`; senza impianto niente `" - {impianto}"`; con una
    commessa `", commessa {id}"` prima della parentesi chiusa;
  - corpo: `"Intervento {numero} del {gg/mm/aaaa}: {titolo} - {impianto} (a corpo)"`, quantità 1, prezzo = `prezzo_corpo`;
  - anticipazioni: come la fase 4.
- **Sorgenti** (`fattura_sorgenti`, gruppo `ticket:{numero}`): una `ticket` (importo 0 nel modo lavoro, `prezzo_corpo`
  nel modo corpo), una per ogni rapportino (importo `compenso_ore + rimborso_km`, 0 nel modo corpo), spesa (importo, 0
  nel modo corpo tranne le anticipazioni) e riga di ore (ore × prezzo, 0 nel modo corpo).
- **Effetti dell'emissione** (fase 4 §7.2): quelli di rapportini, spese e ore come sempre; in più ticket → `fatturato_il`
  = data della fattura; e il contrario con una nota di credito ("stornato dalla nota di credito 3/2026").
- **Blocchi** (fase 4 §7.3): un ticket riservato o fatturato non si riapre, non cambia modo, non riceve né perde
  rapportini, ore o spese: `"Il ticket TK/2026/0012 è nella bozza W-16 per Mario Bianchi: toglilo prima dalla bozza"`
  oppure `"…è nella fattura 47/2026: per cambiarlo serve una nota di credito"`.
- Modo `separati`: le sorgenti normali della fase 4 (con la regola della commessa a corpo). Modo `contratto`: con
  `materiali_inclusi = 0` le spese al cliente del ticket compaiono in *Da fatturare* come voci `spesa` normali (le
  anticipazioni come sempre); rapportini e ore mai.
- **Caso condiviso**: in `server/prove/casi-fattura.json` si aggiunge ai `raggruppamenti`:
  ```json
  {"nome": "E. ticket TK/2026/0012 (Mario Bianchi): un rapportino e il materiale in una riga",
   "ticket": {"numero": "TK/2026/0012", "titolo": "Inverter in errore di isolamento", "impianto": "Impianto fotovoltaico 6 kW", "risolto": "2026-10-21", "fatturazione": "ticket"},
   "rapportini": [{"id": "RAP/2026/0151", "data": "2026-10-21", "oreLavoro": 2, "oreExtra": 0, "oreViaggio": 0.5, "tariffa": 45, "maggExtra": 0, "compensoOre": 90, "km": 24, "euroKm": 0.76, "rimborsoKm": 18.24}],
   "spese": [{"id": 41, "idRapportino": "RAP/2026/0151", "data": "2026-10-21", "descrizione": "Fusibili e portafusibili", "categoria": "materiale", "importo": 18.5, "anticipazione": false}],
   "atteso": {"righe": [{"tipo": "compenso", "descrizione": "Intervento TK/2026/0012 del 21/10/2026: Inverter in errore di isolamento - Impianto fotovoltaico 6 kW (2 ore, 24 km, materiale e spese 18,50 €)", "quantita": 1, "unita": "", "prezzo": 126.74, "importo": 126.74}],
     "gruppo": "ticket:TK/2026/0012", "sorgenti": 3}}
  ```
  (Mario Bianchi non paga il viaggio: 2 ore pagate. I conti di quella riga, da privato: compenso 126,74, contributo 6,34,
  IVA 29,28, totale 162,36, nessuna ritenuta.)

### 7.7 Storico dell'impianto

`storicoImpianto {idSede, pagina?}` (clienti 1 **o** ticket 1), 30 voci per pagina, dalla più recente:
```json
{"ok": true, "impianto": {"id": 4, "nome": "Cabina MT Acme", "categoria": "cabina_mt", "categoriaNome": "Cabina MT",
  "idCliente": "C002", "cliente": "Rossi Impianti Srl", "indirizzo": "Via dell'Artigianato 9, Zanè (VI)", "matricola": "",
  "potenza": "630 kVA", "tensione": "15 kV / 400 V", "messaInServizio": "2014-05-20", "ambiente": "ordinario",
  "referente": "Sig. Ferretti", "datiTecnici": "Trasformatore in resina, due scomparti MT"},
 "aperti": [{"tipo": "ticket", "id": "TK/2026/0014", "titolo": "Scatta il generale MT", "stato": "aperto", "priorita": "urgente"}],
 "scadenze": [{"id": 3, "titolo": "Verifica protezioni SPG e SPI", "data": "2026-09-30", "statoVisto": "Scaduta", "giorni": 22}],
 "contratti": [{"id": 2, "numero": "CA/2026/002", "titolo": "Manutenzione cabina MT Acme", "statoVisto": "Attivo"}],
 "voci": [
  {"tipo": "ticket", "data": "2026-10-22", "titolo": "TK/2026/0014 · Scatta il generale MT", "dettaglio": "Urgente · Aperto · telefono", "id": "TK/2026/0014"},
  {"tipo": "rapportino", "data": "2026-06-18", "titolo": "RAP/2026/0098 · Manutenzione semestrale", "dettaglio": "Manuel Gasparotto · 4 ore · firmato da R. Ferretti", "id": "RAP/2026/0098", "idTicket": "TK/2026/0006"},
  {"tipo": "documento", "data": "2026-06-18", "titolo": "Schema unifilare cabina MT rev. 2", "dettaglio": "Progetti e schemi · Valida", "id": 4},
  {"tipo": "scadenza", "data": "2026-06-18", "titolo": "Manutenzione cabina MT Acme fatta", "dettaglio": "dal ticket TK/2026/0006", "id": 2}]}
```
Voci: ticket (aperti e chiusi), rapportini (del ticket, oppure della commessa con `sede_id` = l'impianto), documenti con
`sede_id`, scadenze fatte, foto dei ticket (raggruppate: "3 foto"), contratti (nascita, rinnovo, disdetta). Il
collaboratore vede le voci delle cose che vede (i rapportini degli altri come "Rapportino di Manuel Gasparotto", senza
aprirli; i documenti `costi` no).

## 8. Contratti di assistenza

### 8.1 Vita del contratto

- `salvaContratto` crea una **bozza** (numero nuovo CA/aaaa/nnn). Da bozza a **Attivo** con `attivaContratto`, che: crea
  la commessa (se non c'è `commessa_id`: codice nuovo, cliente, descrizione "Assistenza " + titolo, `sede_id` = il primo
  impianto, responsabile = chi attiva, `modo_fatturazione = corpo`, `importo_contratto` = canone, note "Dal contratto
  CA/2026/002", `contratto_id`), crea le **rate del canone** del periodo (§8.3) e le **scadenze delle visite** (una per
  impianto con `ogni_mesi`: `tipo = manutenzione`, `azione = ticket`, `anticipo_giorni` = `ANTICIPO_TICKET_GIORNI`,
  `dalla_fatta = 0`, data = `prima_visita`).
- **Stato visto**: Bozza (grigia), Attivo (verde), In scadenza (ambra: `rinnovo = no` e mancano ≤ 60 giorni ad `al`, o
  `tacito` e manca ≤ 30 giorni all'ultimo giorno per la disdetta), Scaduto (rosso tenue: oltre `al` senza rinnovo),
  Disdetto (grigio, "finisce il 31/12"), Chiuso (grigio).
- Le visite oltre `al` non nascono, tranne con `rinnovo = tacito` e contratto non disdetto.

### 8.2 Cosa copre (la proposta alla chiusura del ticket)

- Ticket di un contratto `attivo` (o disdetto ma non ancora finito) e del periodo: `programmato` → **Nel contratto**;
  `guasto`, `piccolo`, `assistenza`, `verifica` → **Nel contratto** se `copre = visite_guasti`, se no **Una riga per
  l'intervento** con le ore registrate a `tariffa_extra`.
- Aprendo un ticket su un impianto che ha un contratto attivo, il contratto si propone da solo (riga "Nel contratto
  CA/2026/002 · copre visite e guasti" con Cambia) e i tempi del contratto valgono per quel ticket.

### 8.3 Il canone

Con `fatturazione_canone` diversa da `nessuna`, per ogni periodo (`dal`-`al`) nascono le rate come
`scadenze_pagamento` della commessa del contratto: `tipo = importo`, `quando = data`, `data` = primo giorno di ogni parte
del periodo (rate anticipate), `importo` = canone / numero di rate al centesimo (l'ultima prende il resto),
`contratto_id`, descrizione `"Canone {parte} {anno}"` ("Canone 1° semestre 2027", "Canone 2027", "Canone di marzo
2027", "Canone 2° trimestre 2027"). La fase 4 le porta in *Da fatturare* quando la data è entro 15 giorni (§5.1 della
fase 4). Riga di fattura: `"{descrizione}: {titolo del contratto} (contratto {numero}, commessa {id})"`.

### 8.4 Rinnovo e disdetta

- `rinnovo = tacito`: la notte dopo `al`, se non è disdetto, il periodo si allunga di 12 mesi (`dal` = vecchio `al` + 1
  giorno), nascono le rate nuove, nota "rinnovato da solo". Una scadenza `contratto` "Disdetta del contratto CA/2026/002"
  con data = `al` − `disdetta_giorni` e preavviso 30 giorni nasce con il contratto (e a ogni rinnovo): è la voce della
  Dashboard.
- `rinnovo = no`: `rinnovaContratto {id, al?, canone?, fatturazioneCanone?}` fa il periodo nuovo (di base 12 mesi);
  senza, dopo `al` il contratto è *Scaduto* e le visite si fermano.
- `disdiciContratto {id, data, motivo}`: Disdetto, finisce ad `al`, nessun rinnovo. `chiudiContratto {id}`: finito
  adesso (visite e rate future annullate, con conferma).
- Cambiare il canone vale per le rate nuove; quelle già nate (anche fatturate) non cambiano.

## 9. Statistiche

`statisticheTicket {da?, a?, per: "tipo"|"cliente"|"impianto"|"persona"|"mese"}` (ticket 1; di base gli ultimi 12 mesi;
il collaboratore solo i suoi):
```json
{"ok": true, "da": "2025-11-01", "a": "2026-10-31", "per": "tipo",
 "totale": {"aperti": 31, "chiusi": 27, "inCorso": 4, "presaMediaOre": 1.6, "interventoMedioOre": 19.4, "chiusuraMediaGiorni": 3.2,
   "entroITempi": 85, "ore": 96.5, "km": 1840, "costo": 2710.4, "fatturato": 4320, "nelContratto": 9},
 "righe": [{"chiave": "guasto", "nome": "Guasti", "aperti": 14, "chiusi": 12, "presaMediaOre": 0.9, "interventoMedioOre": 6.2,
   "chiusuraMediaGiorni": 1.4, "entroITempi": 92, "ore": 41, "costo": 1180, "fatturato": 1650}]}
```
Contano i ticket aperti nel periodo (non annullati). Medie solo sui ticket che hanno la misura; `entroITempi` =
percentuale con `intervento_il ≤ entro_intervento` (sui ticket che hanno un intervento). `costo` (fase 3: ore × costo
orario + km + spese) e `fatturato` (compenso delle fatture emesse coi loro gruppi) solo con `costi`. Ore di calendario,
come i tempi.

## 10. Azioni nuove

Tutte con `ok`, modulo e livello tra parentesi; quelle che scrivono vogliono una POST. Campi dei soldi nuovi da
aggiungere a `CAMPI_COSTI`: `canone`, `tariffaExtra`, `prezzoCorpo`, `importoTicket`, `fatturato`, `costoTicket`, e le
colonne `prezzo_corpo`, `tariffa_extra`. (`importo` e `costo` ci sono già.)

### 10.1 Documenti (modulo `documenti`)

- `documenti {testo?, idCategoria?, idCliente?, idCommessa?, idSede?, idTicket?, idContratto?, origine?, stato?:
  "validi"|"da_approvare"|"respinti"|"tutti", scadenza?: "entro"|"scadute", daClassificare?, archiviati?, pagina?}` (1),
  50 per pagina, i più recenti prima:
  ```json
  {"ok": true, "pagina": 1, "pagine": 1, "quanti": 9,
   "conteggi": {"daApprovare": 1, "inScadenza": 2, "scaduti": 1, "daClassificare": 3},
   "documenti": [{"id": 4, "titolo": "Schema unifilare cabina MT", "idCategoria": 1, "categoria": "Progetti e schemi",
     "origine": "file", "collegamentoTipo": "", "cartella": false, "idCliente": "C002", "cliente": "Rossi Impianti Srl",
     "idCommessa": "26ST041", "idSede": 4, "impianto": "Cabina MT Acme", "idTicket": null, "idContratto": 2,
     "riferimento": "", "dataDocumento": "2026-06-18", "revisione": 2, "statoVisto": "Valida", "daApprovare": 3,
     "nomeFile": "Schema unifilare cabina rev2.pdf", "mime": "application/pdf", "byte": 1830211, "url": "/file/…",
     "scadenza": null, "vede": "tutti", "puoScrivere": true, "modificato": "2026-10-21T17:12:00"},
    {"id": 7, "titolo": "Cartella della commessa 26ST003", "origine": "collegamento", "collegamentoTipo": "onedrive",
     "cartella": true, "principale": true, "url": "https://esempio-my.sharepoint.com/:f:/g/personal/…", "statoVisto": "Collegamento", "...": "..."}],
   "daWisper": []}
  ```
  `statoVisto`: Valida, Da approvare, Respinta, Collegamento, Archiviato. `daApprovare` = numero della revisione in
  attesa (o null). Collaboratore e altri senza `costi`/`riservati`: i documenti `vede` più alto non ci sono.
- `documento {id}` (1) → come sopra più `descrizione`, `parole`, `versioni: [{id, numero, statoVisto ("Valida" |
  "Superata" | "Da approvare" | "Respinta"), nomeFile, byte, url, nota, caricataDa, caricataIl, decisaDa, decisaIl,
  motivoRifiuto, puoTogliere}]`, `condivisioni` (solo con documenti 2), `scadenza {id, data, statoVisto, ogniMesi}`,
  `cronologia` (dal registro, frasi pronte: "rev. 3 caricata da Marco Rossato", "rev. 2 approvata da Manuel
  Gasparotto", "mandato a ufficio@rossi.esempio.it"), `puoApprovare`.
- `salvaDocumento {documento: {id?, idLocale?, titolo, idCategoria, descrizione?, parole?, riferimento?, dataDocumento?,
  idCliente?, idCommessa?, idSede?, idTicket?, idContratto?, vede?, origine?, url?, cartella?, principale?, idFile?,
  nota?, scadenza?: {data, ogniMesi?, preavvisoGiorni?, tipo?} | null}}` (2) → `{"ok": true, "documento": {...},
  "chiudeScadenza": {"id": 9, "titolo": "Verifica impianto di terra (DPR 462)", "data": "2027-01-12"} | null}`. Nuovo:
  `origine` `file` vuole `idFile` (da `/carica`: diventa la rev. 0), `collegamento` vuole `url`. Con la commessa e senza
  cliente, il cliente è quello della commessa; con l'impianto, il cliente è il suo. `vede` di base quello della categoria
  (non più "basso" della categoria per chi non è titolare). Errori: `"Titolo: scrivi di cosa si tratta"`, `"Categoria:
  scegli la categoria"`, `"Carica il file o incolla il collegamento"`, quelli di §5.1, `"La commessa 26ST003 ha già la sua
  cartella: «Cartella della commessa 26ST003»"`, `"L'impianto 4 è di Rossi Impianti Srl, non di Batokyo"`.
- `caricaVersione {id, idFile, nota}` (2) → il documento. `approvaVersione {id}`, `respingiVersione {id, motivo}`,
  `annullaDecisione {id}` (chi approva; POST) → il documento. `togliVersione {id, annulla?}` (chi l'ha caricata, solo
  da approvare o respinta). Errori: `"Scrivi cosa cambia in questa revisione"`, `"Non hai il permesso per approvare i
  documenti: chiedi al titolare"`, `"La rev. 2 è già approvata"`, `"Una revisione approvata non si toglie: carica una
  revisione nuova"`.
- `archiviaDocumento {id, archiviato?}` (2): esce dagli elenchi, si ritrova con `archiviati: true`; le scadenze aperte
  restano (con conferma "Ha una scadenza aperta il 12/01/2027: la tolgo?").
- `inviaDocumento {id, idVersione?, a, cc?, oggetto?, messaggio?}` (2, asincrona come `inviaEmail`) → `{"ok": true}`.
- `condividiDocumento {id, perChi, giorni?}` (2) → `{"ok": true, "link": "https://…/condiviso/…", "condivisione": {"id": 3,
  "perChi": "Rossi Impianti Srl, ufficio tecnico", "scade": "2026-11-05", "aperture": 0}}` oppure il `nonCollegato` di
  §5.8. Il link intero torna **solo** in questa risposta. `revocaCondivisione {id}` (2).
- `categorieDocumenti {}` (1); `salvaCategoria {categoria: {id?, nome, approvazione, vede, scadenzaMesi, attiva, ordine?}}`
  (amministrazione 2).
- `modelli {}` (1), `salvaTestoModello {chiave, testo}` (amministrazione 2), `componiModello {...}` (1) (§5.7).
- `spazio {}` (amministrazione 1), `svuotaCestino {conferma}` (amministrazione 2, solo titolare) (§5.9).
- `POST /carica` (§5.4).
- `esporta {cosa: "documenti", ...filtri}`: Titolo, Categoria, Cliente, Commessa, Impianto, Ticket, Origine (File,
  Collegamento, Mandato), Tipo di collegamento, Indirizzo, Revisione valida, Stato, Riferimento, Data del documento,
  Scadenza, Caricato da, Modificato.

### 10.2 Scadenze (modulo `documenti`, o `ticket` per quelle dei contratti)

- `scadenze {da?, a?, stato?: "aperte"|"fatte"|"tutte", tipo?, idCliente?, idSede?, idContratto?}` (documenti 1 o ticket
  1: arrivano quelle che uno vede): senza date, le aperte divise in `scadute`, `entro` (nel preavviso), `piuAvanti`; con
  `da`/`a` quelle del periodo (il calendario). Una voce: `{"id": 9, "titolo": "Verifica impianto di terra (DPR 462)",
  "tipo": "verifica_terra", "idCliente": "C004", "cliente": "Batokyo Srl", "idSede": 7, "impianto": "Impianto di terra
  stabilimento", "data": "2027-01-12", "preavvisoGiorni": 90, "ogniMesi": 60, "dallaFatta": true, "azione":
  "promemoria", "statoVisto": "Scade fra 82 giorni", "giorni": 82, "idDocumento": 11, "documento": "Verbale verifica
  impianto di terra 2022", "idTicket": null, "assegnataA": 1, "puoScrivere": true}`.
- `salvaScadenza {scadenza: {id?, titolo, tipo, idCliente?, idSede?, idDocumento?, idContratto?, data, preavvisoGiorni?,
  ogniMesi?, dallaFatta?, azione?, anticipoGiorni?, assegnataA?, note?}}` (documenti 2; per `manutenzione` di un contratto
  ticket 2). Senza `ogniMesi` e con l'impianto, le proposte di §6.3. Errori: `"Data: scrivi quando scade"`, `"Ogni: da 1
  a 120 mesi"`, `"Titolo: scrivi cosa scade"`.
- `faiScadenza {id, data?, idDocumento?}`, `togliScadenza {id, motivo, ancheProssime?}` (stessi permessi).
- `esporta {cosa: "scadenze"}`: Data, Titolo, Tipo, Cliente, Impianto, Ogni (mesi), Stato, Fatta il, Documento, Ticket.

### 10.3 Ticket (modulo `ticket`)

- `tickets {segmento?: "aperti"|"programmati"|"chiusi"|"tutti", mie?, nonAssegnati?, priorita?, tipo?, idCliente?, idSede?,
  idContratto?, testo?, da?, a?}` (1). `aperti` (di base) = aperto, in carico, in attesa, risolto, tranne i programmati con
  `previsto_il` oltre 30 giorni; `programmati` = tipo programmato non chiusi, per `previsto_il`; `chiusi` = chiusi e
  annullati del periodo (di base 90 giorni). Ordine degli aperti: urgenti non presi, in ritardo, poi per
  `entro_intervento`, poi per apertura.
  ```json
  {"ok": true, "adesso": "2026-10-22T10:05:00",
   "conteggi": {"aperti": 5, "urgenti": 1, "nonAssegnati": 1, "inRitardo": 0, "risoltiDaChiudere": 1, "programmatiDaPianificare": 1},
   "ticket": [{"id": 14, "numero": "TK/2026/0014", "titolo": "Scatta il generale MT", "tipo": "guasto", "tipoNome": "Guasto",
     "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idSede": 4, "impianto": "Cabina MT Acme", "idContratto": 2,
     "contratto": "CA/2026/002", "priorita": "urgente", "stato": "aperto", "statoVisto": "Aperto", "inRitardo": false,
     "responsabileId": null, "responsabile": "", "apertoIl": "2026-10-22T08:40:00", "entroPresa": "2026-10-22T09:40:00",
     "entroIntervento": "2026-10-22T12:40:00", "prossimoIntervento": null, "rapportini": 0, "origine": "telefono",
     "puoScrivere": true, "puoPrendere": true}]}
  ```
- `ticket {id}` (1; `id` interno o il numero) → la voce più: `descrizione`, `richiedente`, `rifCliente`, `impatto`,
  `urgenza`, `prioritaAMano`, `previstoIl`, `presoIl`, `interventoIl`, `risoltoIl`, `chiusoIl`, `motivo`, `esito`,
  `fatturazione`, `prezzoCorpo`, `motivoNo`, `fatturatoIl`, `idCommessa`, `commessa`; `interventi` (le sue attività, come
  in `attivita`); `rapportini` (`{id, data, tecnico, ore, km, stato, statoApprovazione, firmatario}`); `ore` e `spese`
  (come nella fase 3, solo le righe); `foto` (`{id, url, nome}`); `documenti` (righe come `documenti`); `somma {ore, km,
  materiale, spese, costo?, importo?}`; `proposta {fatturazione, perche}` ("Nel contratto CA/2026/002: copre visite e
  guasti"); `storico` (le ultime 5 voci dell'impianto); `cronologia` (da `ticket_eventi`); `riservata` (`"W-16"` o
  `"47/2026"` o `null`); `puoScrivere`, `puoChiudere`.
- `salvaTicket {ticket: {id?, idLocale?, numero?, idCliente, idSede?, idCommessa?, idContratto?, titolo, descrizione?, tipo?,
  origine?, richiedente?, idReferente?, rifCliente?, impatto?, urgenza?, priorita?, responsabileId?, apertoIl?, previstoIl?}}`
  (2) → `{"ok": true, "ticket": {...}}`. Nuovo: numero nuovo (quello mandato se libero, come i codici delle commesse
  nati senza rete), `tipo` di base `guasto`, `origine` di base `telefono`, contratto proposto dall'impianto (§8.2), commessa
  di base quella del contratto. Ripetuto con lo stesso `idLocale`: lo stesso ticket. Errori: `"Cliente: scegli il
  cliente"`, `"Titolo: scrivi in poche parole cosa succede"`, `"Tipo: guasto, verifica, piccolo, assistenza o
  programmato"`, `"Da dove arriva: telefono, email, sopralluogo o ufficio"` (anche per `whatsapp` e `portale`: "…non
  sono ancora collegati"), `"Impianto 9 non trovato tra quelli di Rossi Impianti Srl"`, `"Il contratto CA/2026/001 è di
  Batokyo Srl"`.
- `prendiTicket {id}`, `assegnaTicket {id, responsabileId}`, `sospendiTicket {id, motivo}`, `riprendiTicket {id}`,
  `risolviTicket {id, esito?}`, `riapriTicket {id, motivo}`, `annullaTicket {id, motivo}` (2) → il ticket. Ripetute
  uguali dalla coda: ok senza rifare. Errori: `"Il ticket TK/2026/0014 l'ha già preso Marco Rossato"` (prendi),
  `"Scrivi il motivo"`, e quelli di §7.1.
- `pianificaTicket {id, inizio, fine?, assegnataA?, luogo?, note?, conferma?}` (2, e attivita 2) → `{"ok": true, "ticket":
  {...}, "attivita": {...}}` o la risposta delle sovrapposizioni della fase 2.
- `chiudiTicket {id, fatturazione, prezzoCorpo?, motivo?, conferma?}` (2, **titolare e amministrazione**, e `costi` ≥ 1)
  (§7.6).
- `legaRapportino {idRapportino, idTicket}` (rapportini 2) (§7.4); `caricaFile {tipo: "ticket", ...}`, `togliFotoTicket
  {id, annulla?}` (2).
- `storicoImpianto {idSede, pagina?}` (clienti 1 o ticket 1) (§7.7).
- `statisticheTicket {...}` (1) (§9).
- `esporta {cosa: "ticket", ...filtri}`: Numero, Aperto il, Cliente, Impianto, Titolo, Tipo, Da dove, Priorità, Stato,
  Responsabile, Contratto, Commessa, Preso il, Primo intervento il, Risolto il, Chiuso il, Ore, Km, Spese, Come si
  fattura, Importo (solo con `costi`), Fatturato il.

### 10.4 Contratti (modulo `ticket`)

- `contratti {stato?, idCliente?, testo?}` (ticket 1) e `contratto {id}` (1): `{"id": 2, "numero": "CA/2026/002",
  "titolo": "Manutenzione cabina MT Acme", "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idCommessa": "26ST041",
  "dal": "2026-01-01", "al": "2026-12-31", "rinnovo": "tacito", "disdettaGiorni": 60, "disdettaEntro": "2026-11-01",
  "stato": "attivo", "statoVisto": "In scadenza", "canone": 1200, "fatturazioneCanone": "semestrale", "copre":
  "visite_guasti", "materialiInclusi": false, "tariffaExtra": 45, "tempi": {"urgente": {"presa": 1, "intervento": 4}},
  "impianti": [{"idSede": 4, "nome": "Cabina MT Acme", "ogniMesi": 6, "prossimaVisita": "2026-11-20", "idScadenza": 5}],
  "rate": [{"id": 31, "descrizione": "Canone 1° semestre 2026", "data": "2026-01-01", "importo": 600, "stato": "fatturata"}],
  "ticket": {"aperti": 1, "anno": 3}, "documento": {"id": 12, "titolo": "Contratto CA/2026/002 firmato"}, "puoScrivere":
  true}`. Senza `costi`: niente `canone`, `tariffaExtra`, `importo` delle rate.
- `salvaContratto {contratto: {id?, idCliente, titolo, dal, al?, rinnovo?, disdettaGiorni?, canone?, fatturazioneCanone?,
  copre?, materialiInclusi?, tariffaExtra?, tempi?, idCommessa?, idPreventivo?, idDocumento?, note?, impianti: [{idSede,
  ogniMesi?, primaVisita?}]}}` (ticket 2 **e** `costi` 2). `al` di base `dal` + 12 mesi − 1 giorno. In bozza si cambia
  tutto; attivo: titolo, note, tempi, impianti (le scadenze delle visite si rifanno dalla prossima), documento; canone e
  periodo solo con `rinnovaContratto`. Errori: `"Cliente: scegli il cliente"`, `"Dal: scrivi da quando vale"`, `"Al: deve
  venire dopo Dal"`, `"Impianto 9 non è di Rossi Impianti Srl"`, `"Canone: non può essere negativo"`, `"Ogni: da 1 a 60
  mesi"`.
- `attivaContratto {id}`, `rinnovaContratto {id, al?, canone?, fatturazioneCanone?}`, `disdiciContratto {id, data,
  motivo}`, `chiudiContratto {id, conferma?}` (stessi permessi) (§8).
- `esporta {cosa: "contratti"}`: Numero, Cliente, Titolo, Dal, Al, Rinnovo, Disdetta entro, Stato, Canone (con `costi`),
  Come si fattura il canone, Copre, Impianti, Ticket nell'anno, Commessa.

### 10.5 Cosa cambia nelle azioni che ci sono

- `anagrafiche`: `sedi` con i campi nuovi (`categoria`, `categoriaNome`, `sedePadreId`, `matricola`, `potenza`,
  `tensione`, `messaInServizio`, `ambiente`, `referenteId`, `datiTecnici`); `numerazioni` con `ticket` e `contratto`.
  `salvaSede` li accetta.
- `rapportini` e il rapportino: `idTicket`, `ticket` (numero) e, chiuso il ticket `contratto` o `no`, `nonSiFattura:
  "Nel contratto CA/2026/002"` (o "Non si fattura"); il filtro "da fatturare" li toglie. `salvaRapportino` accetta
  `idTicket`/`idLocaleTicket`.
- `attivita`: `idTicket`, `ticket` (numero) e tipo `intervento`; filtro `ticket`. `salvaAttivita` accetta `idTicket`.
- `ore`, `spese`: `idTicket`, `ticket`; filtro `ticket`. `salvaOre`, `salvaSpesa` accettano `idTicket`.
- `daFatturare`, `preparaFattura`, `confermaXml` (collegabili), `segnaFatturataFuori`: tipo `ticket` (§7.6).
- `documentiCommessa` (fase 1, versioni vecchie): uguale, letto dai documenti con `commessa_id` e origine `file`.
- `inviaEmail`, `inviaPreventivo`, `inviaAvviso`: la copia di §5.8.
- `copie`: l'esito `fuori` di §5.9.
- `io.interfaccia`: `puoApprovareDocumenti`, `puoChiudereTicket`, `condivisioneCollegata` (false finché
  `CONDIVISIONE_INDIRIZZO` è vuoto), `fileMaxMb`; `versioneServer` "0.8.0".

## 11. Dashboard, permessi, registro

### 11.1 Dashboard

- `numeri.ticket` (con ticket ≥ 1): `{"aperti": 5, "urgenti": 1, "nonAssegnati": 1, "inRitardo": 0, "interventiOggi": 1,
  "risoltiDaChiudere": 1, "programmatiDaPianificare": 1}` (per il collaboratore i suoi e i non assegnati).
- `numeri.documenti` (con documenti ≥ 1): `{"daApprovare": 1, "inScadenza": 2, "scaduti": 1, "daClassificare": 3}`.
- `numeri.contratti` (con ticket ≥ 1 e `costi`): `{"attivi": 2, "inScadenza": 1}`. `numeri.spazio` (amministrazione 1):
  `{"liberoMb": 1843200, "avviso": false}`.
- Voci nuove (frasi esatte):
  - **urgenti**: ticket urgenti non presi o in ritardo, uno per uno fino a 3 (`tipo: "ticket"`, `"TK/2026/0014 urgente:
    Scatta il generale MT"`, dettaglio `"Rossi Impianti Srl · Cabina MT Acme · aperto alle 8:40 · nessuno l'ha preso"` o
    `"… · intervento previsto entro le 12:40"`, `collegamento {pagina: "ticket", id}`); scadenze scadute (`tipo:
    "scadenza"`, `"Verifica protezioni SPG e SPI scaduta da 22 giorni"`, `"Rossi Impianti Srl · Cabina MT Acme"`,
    `collegamento {pagina: "scadenza", id}`); le proprie revisioni respinte (`"Schema unifilare cabina MT rev. 3
    respinta"`, `"Motivo: … · Manuel Gasparotto"`); disco sotto `SPAZIO_MINIMO_MB` (`tipo: "spazio"`, `"Il disco del
    NAS è quasi pieno: restano 1,6 GB"`, titolare e amministrazione).
  - **questa settimana**: interventi di oggi, uno per uno (`tipo: "intervento"`, `"Intervento di oggi alle 14:30:
    TK/2026/0013 Navetta 2 in errore"`, `"Marco Rossato · Batokyo Srl · Schio"`, `collegamento {pagina: "ticket", id}`);
    documenti da approvare (chi approva: `"1 documento da approvare"`, `"Schema unifilare cabina MT rev. 3 · Marco
    Rossato"`); ticket risolti da chiudere (titolare e amministrazione: `"TK/2026/0012 risolto: da chiudere"`, `"Mario
    Bianchi · rapportino firmato il 21/10"`); scadenze nel preavviso che cadono entro 30 giorni (`"Certificato di taratura del misuratore di terra
    scade fra 24 giorni"`); contratti in scadenza (`tipo: "contratto"`, `"CA/2026/002: la disdetta va mandata entro
    domenica 1 novembre"`, `"Rossi Impianti Srl · si rinnova da solo il 01/01/2027"`, oppure `"CA/2026/001 scade il
    28/02/2027: rinnovalo o lascialo scadere"`).
  - **da pianificare**: ticket non assegnati non urgenti (`"2 ticket da prendere"`); programmati senza intervento con
    `previsto_il` entro 30 giorni (`"Manutenzione cabina MT Acme del 20/11 da pianificare"`, `"TK/2026/0015 · Rossi
    Impianti Srl"`); scadenze fra 31 e 120 giorni, nel preavviso o no (`"Verifica impianto di terra (DPR 462): 12/01/2027"`); documenti da classificare (`"3 documenti da
    classificare"`); file troppo grandi per la copia fuori casa (`"2 file sono solo sul NAS: troppo grandi per la copia
    fuori casa"`, amministrazione); spazio sotto `SPAZIO_AVVISO_MB`.
- `collegamento.pagina` nuove: `tickets` (filtro `segmento`, `priorita`, `mie`, `nonAssegnati`), `ticket` (`id`),
  `contratti`, `contratto` (`id`), `documenti` (filtro `segmento`: `archivio` | `approvare` | `scadenze` | `modelli`,
  `idCategoria`, `daClassificare`), `documento` (`id`), `scadenza` (`id`), `impianto` (`id` della sede), `amministrazione`
  con `filtro.sezione: "spazio"`. `tipo` nuovi: `ticket`, `intervento`, `scadenza`, `documento`, `contratto`, `spazio`,
  `copia`. Unità nuove: `ticket`, `documenti`, `scadenze`.
- Il **collaboratore**: i suoi ticket urgenti e quelli urgenti da prendere, i suoi interventi di oggi, le sue revisioni
  respinte, "Schema unifilare cabina MT rev. 3: aspetta l'approvazione"; niente contratti, niente spazio, niente soldi.
- Numerino giallo nel menu: **Ticket e assistenza** = ticket aperti che nessuno ha preso (per il collaboratore: i suoi da
  fare più quelli da prendere); **Documenti** = documenti da approvare (solo per chi approva).

### 11.2 Permessi

Nessun valore nuovo nella tabella dell'architettura §3 (titolare e amministrazione 2 e 2, collaboratore `documenti` 1 e
`ticket` 2, lettura 1 e 1). Regole:
- **Collaboratore, ticket**: vede i ticket assegnati a lui, quelli **non assegnati** (li può prendere), quelli delle
  commesse dove è responsabile o tra le persone, e quelli con un suo intervento o un suo rapportino; gli altri non li
  trova (`"Ticket 9 non trovato"`). Crea ticket (assegnati a sé o a nessuno), prende, pianifica per sé, sospende,
  fotografa, scrive il rapportino, segna risolto, riapre i suoi risolti. **Non chiude** (la scelta di come fatturare è
  del titolare o dell'amministrazione: `"Il ticket lo chiude l'ufficio: tu segnalo risolto"`), non assegna ad altri, non
  annulla i ticket degli altri. Contratti: li legge senza canone; non li scrive.
- **Collaboratore, documenti**: §5.3. **Lettura**: vede ed esporta tutto, nessun pulsante per scrivere, nessun giallo.
- **Contratti** in scrittura: ticket 2 **e** `costi` 2. **Chiudere i ticket**: titolare e amministrazione (ticket 2 e
  `costi` ≥ 1). **Approvare documenti**: titolare e amministrazione con documenti 2. **Svuotare il cestino**: solo il
  titolare.
- Il menu mostra Documenti con `documenti` ≥ 1 e Ticket e assistenza con `ticket` ≥ 1.
- Prove "non deve vedere / non deve scrivere" per ogni ruolo su ogni azione nuova, compreso `/carica`, `/file/<id>` di
  un documento `costi` e `/condiviso/<token>` revocato o scaduto (HTTP 404 con la pagina "Questo link non vale più").

### 11.3 Registro

Tabelle nuove con i loro nomi (§4.4, tranne `ticket_eventi`, che è già una cronologia). Note: `"caricata la rev. 3"`,
`"rev. 2 approvata"`, `"rev. 3 respinta: {motivo}"`, `"mandato per email a {email}"`, `"copia del PDF mandato a
{email}"`, `"link per {per chi} fino al {data}"`, `"link revocato"`, `"collegamento cambiato"`, `"migrazione 005: il
documento della commessa entra nell'archivio"`, `"scadenza fatta: nasce la prossima del {data}"`, `"nato dalla scadenza
del {data}"`, `"chiuso: {modo}"`, `"rinnovato da solo"`, `"cestino svuotato: {n} file"`. Mai nel registro: il token dei
link, il contenuto dei file.

## 12. Schermate

**Parole fisse** (uguali ovunque): Ticket — **Aperto**, **In carico**, **In attesa**, **Risolto**, **Chiuso**,
**Annullato**, **In ritardo**; priorità **Urgente**, **Alta**, **Normale**, **Bassa**; tipi **Guasto**, **Verifica**,
**Piccolo intervento**, **Assistenza**, **Programmato**; da dove **Telefono**, **Email**, **Sopralluogo**, **Ufficio**,
**Da una scadenza**; come si fattura **Una riga per l'intervento**, **Con gli altri rapportini**, **Nel contratto**, **Non
si fattura**. Documenti — **Valida**, **Superata**, **Da approvare**, **Respinta**, **Da classificare**; collegamenti
**OneDrive**, **SharePoint**, **Google Drive**, **Cartella del computer**, **Sito**; **Non collegato**. Scadenze —
**Scaduta**, **Scade fra N giorni**, **Prossima**, **Fatta**. Contratti — **Bozza**, **Attivo**, **In scadenza**,
**Scaduto**, **Disdetto**. Colori sempre con la parola: rosso tenue (Urgente, In ritardo, Scaduta, Respinta, Scaduto),
ambra (Alta, In attesa, Scade fra…, In scadenza, Da classificare), giallo tenue (Aperto, Da approvare), blu (In carico),
verde (Risolto, Valida, Fatta, Attivo), grigio (il resto). **Un solo pulsante giallo per schermata**, scritto qui per
ognuna; nelle pagine con un pannello aperto (computer) il giallo della pagina diventa col bordo.

Menu: **11 Documenti** (icona del foglio) e **12 Ticket e assistenza** (icona della chiave inglese), dopo Banche e
scadenze, nell'ordine delle specifiche.

### 12.1 Ticket e assistenza: telefono

Segmenti in alto: **Aperti · Programmati · Chiusi · Contratti · Statistiche**.
- *Aperti*: pillole-filtro **Tutti · Urgenti · Miei · Da prendere**; ricerca; righe (icona del tipo in un riquadro
  colorato per la priorità, "TK/2026/0014 · Scatta il generale MT", "Rossi Impianti Srl · Cabina MT Acme", sotto "aperto
  alle 8:40 · nessuno" o "Marco Rossato · oggi alle 14:30"; a destra le pillole di priorità e di stato, e In ritardo).
  Per il collaboratore due gruppi: **In carico a te** e **Da prendere**. Giallo in basso **Nuovo ticket**.
- *Nuovo ticket* (pagina): **Per chi** (clienti recenti come schede, poi la ricerca; come il passo 1 del rapportino);
  **Quale impianto** (gli impianti e le sedi del cliente come pillole, "Nessuno in particolare", "+ Impianto nuovo");
  con un contratto la riga "Nel contratto CA/2026/002 · copre visite e guasti"; **Cosa succede** (titolo, una riga) e
  **Cosa dice il cliente** (testo); **Chi ha chiamato** (referenti come pillole o testo) e **Riferimento del cliente**
  (chiuso in "+ Riferimento del cliente"); **Da dove arriva**: Telefono · Email · Sopralluogo · Ufficio; **Che cos'è**:
  Guasto · Verifica · Piccolo intervento · Assistenza; **L'impianto è fermo?** Fermo · Va a metà · Funziona; **Per
  quando?** Subito · Entro domani · Quando si può; sotto, la priorità che esce ("Priorità: Urgente" con la pillola e
  **Cambia**) e "Da intervenire entro oggi alle 12:40"; **Chi lo segue**: Io · i colleghi · Nessuno per ora (il
  collaboratore: Io · Nessuno per ora). Giallo **Apri il ticket**. Senza rete: si apre lo stesso, col numero proposto.
- *Ticket* (pagina): in alto ⋯ (Cambia, Assegna, In attesa, Lega un rapportino, Annulla il ticket, Esporta); pillole
  priorità, stato, In ritardo; titolo 26/800; "TK/2026/0014 · aperto oggi alle 8:40 · telefono"; i passi **Aperto → In
  carico → Risolto → Chiuso**; scheda **Cliente e impianto** (cliente, impianto con freccia → storico, chi ha chiamato
  col telefono da toccare, riferimento del cliente, contratto); la riga dei tempi ("Da prendere entro le 9:40",
  "Intervento entro le 12:40"; rossa con In ritardo); **Cosa dice il cliente**; **Interventi** (righe dell'attività:
  "Giovedì 23 alle 9:00 · Marco Rossato · Zanè", e **+ Un altro intervento**); **Rapportini** (riga col numero, data, ore,
  stato, firmatario); **Ore, materiali e spese** (righe e la somma; **+ Ore** e **+ Materiale o spesa**); **Foto** (in fila,
  84, con **Fotografa** tratteggiato); **Storico dell'impianto** (le ultime 3 voci e **Vedi tutto lo storico**);
  **Cronologia** (frasi coi tempi). Il giallo dipende dallo stato: Aperto senza responsabile → **Prendo io**; In carico
  senza intervento futuro e senza rapportino → **Pianifica l'intervento**; In carico con un intervento oggi o passato →
  **Scrivi il rapportino**; con un rapportino firmato → **Segna risolto**; Risolto → **Chiudi il ticket** (titolare e
  amministrazione; il collaboratore vede "Lo chiude l'ufficio" e nessun giallo); In attesa → **Riprendi**; Chiuso e
  Annullato → nessun giallo.
- *Pianifica l'intervento* (foglio): giorno (oggi, domani, i giorni della settimana come pillole e "Altro giorno"),
  ora d'inizio con più e meno a mezz'ore, durata (1 h, 2 h, mezza giornata), chi va (pillole), luogo già scritto; le
  attività di quel giorno di quella persona sotto ("Già in calendario: Riunione di cantiere 8:30-10:00"); giallo
  **Metti in calendario**. Sovrapposizione: la frase della fase 2 e **Mettilo lo stesso**.
- *Il lavoro è finito?* (foglio dopo il rapportino): "RAP/2026/0151 firmato da Mario Bianchi"; giallo **Sì, è risolto**;
  testo **Serve un altro intervento**.
- *Chiudi il ticket* (foglio): **Come si fattura?** con le quattro scelte come schede (la proposta già scelta e la riga
  del perché: "Nel contratto CA/2026/002: copre visite e guasti"); per *Una riga per l'intervento* la somma ("2 ore · 24
  km · materiale 18,50 €", importo 24/800 con `costi`) e "A corpo" (casella che apre il prezzo); per *Non si fattura* il
  motivo; con ancora un rapportino da firmare la riga gialla "RAP/2026/0153 è da far firmare: va in fattura dopo";
  giallo **Chiudi il ticket**. Dopo: avviso "Chiuso: va in Da fatturare (126,74 €)" con Annulla (riapre).
- *Storico dell'impianto* (pagina): nome dell'impianto e la categoria in pillola, cliente e indirizzo; scheda dei dati
  (potenza, tensione, messa in servizio, matricola, ambiente con "verifica ogni 5 anni", referente, note) con **Cambia**;
  **Aperti** (ticket non chiusi); **Scadenze**; **Contratto**; poi la riga del tempo per anno (icona del tipo, titolo,
  dettaglio, data). Giallo **Nuovo ticket per questo impianto**.
- *Programmati*: due gruppi **Da pianificare** e **In calendario** (righe col giorno previsto grande a sinistra, "20
  nov", titolo, cliente · impianto, contratto); in fondo la riga "Le prossime visite nascono 30 giorni prima"; nessun
  giallo (le azioni sono nei ticket).
- *Chiusi*: ricerca, periodo (‹ mese ›), righe col modo di fatturazione in pillola ("Una riga", "Nel contratto", "Non si
  fattura", "Con i rapportini") e "In bozza W-16" / "Fattura 47/2026" (con `costi`). Nessun giallo.
- *Contratti*: righe (numero in pillola nera, titolo, cliente, "dal 01/01 al 31/12/2026 · si rinnova da solo", stato in
  pillola, canone con `costi`); giallo **Nuovo contratto** (titolare e amministrazione). *Contratto* (pagina): stato,
  periodo, rinnovo e "disdetta entro domenica 1 novembre", canone e rate (Prevista, In bozza, Fatturata) con `costi`,
  cosa copre, tempi promessi, impianti con la prossima visita, ticket dell'anno, commessa (→ pagina), documento firmato
  (→ documento); giallo secondo lo stato: Bozza → **Attiva il contratto**; In scadenza con rinnovo no → **Rinnova**;
  gli altri nessuno; ⋯: Cambia, Disdici, Chiudi, Contratto in PDF (dal modello).
- *Nuovo contratto* (pagina): cliente, titolo, impianti coperti (pillole) con "ogni" (3, 6, 12 mesi) e la prima visita,
  dal (oggi) e al (12 mesi), rinnovo Tacito · No con il preavviso di disdetta, canone e rate (Annuale · Semestrale ·
  Trimestrale · Mensile · Nessuna), copre Solo visite · Visite e guasti, materiali compresi sì/no, tariffa fuori contratto,
  tempi promessi (urgente: presa e intervento, come stepper di ore); giallo **Salva la bozza**.
- *Statistiche*: periodo (12 mesi · quest'anno · scorso anno), quattro riquadri (Aperti · Chiusi · Intervento medio
  "19 ore" · Entro i tempi "85%"), segmenti **Per tipo · Per cliente · Per impianto · Per persona**, barre orizzontali
  (ticket e tempo medio d'intervento), righe con ore, costo e fatturato (con `costi`). Nessun giallo.

### 12.2 Ticket e assistenza: computer

Stessa voce, segmenti **Aperti · Programmati · Chiusi · Contratti · Statistiche**.
- *Aperti*: quattro riquadri toccabili (Aperti · Urgenti · Da prendere · Risolti da chiudere); ricerca e pillole come sul
  telefono; tabella: Priorità, Numero, Cosa (titolo e sotto cliente · impianto), Stato, Chi, Intervento (il prossimo
  intervento o "entro le 12:40"), Aperto. Tocco = **pannello del ticket** a destra (440), con lo stesso contenuto e lo
  stesso giallo della pagina del telefono; con il pannello aperto **Nuovo ticket** diventa col bordo. Giallo
  **Nuovo ticket** (finestra a due colonne: a sinistra per chi, impianto, cosa succede, cosa dice; a destra da dove,
  che cos'è, le due domande con la priorità, chi lo segue, contratto; giallo **Apri il ticket**).
- *Pianifica l'intervento* (finestra): a sinistra il giorno scelto con le attività di tutti a colonne per persona (8-18),
  a destra giorno, ora, durata, chi va; giallo **Metti in calendario**.
- *Chiudi il ticket* (finestra): come il foglio del telefono, con a destra cosa entra nella riga di fattura (rapportini,
  ore, spese, anticipazioni a parte) e il testo della riga che nascerà.
- *Programmati*, *Chiusi*: tabelle (Previsto · Titolo · Cliente e impianto · Contratto · Stato; Chiuso il · Numero · Cosa ·
  Come si fattura · Fattura · Tempo di chiusura).
- *Contratti*: tabella (Numero, Titolo e cliente, Periodo, Rinnovo, Stato, Canone, Ticket nell'anno, Prossima visita);
  pannello del contratto a destra; giallo **Nuovo contratto** (finestra larga coi campi del telefono in due colonne).
- *Statistiche*: riquadri, barre per mese (aperti e chiusi), tabella per tipo/cliente/impianto/persona con tutte le
  colonne di §9, **Esporta** (bordo). Nessun giallo.
- *Storico dell'impianto*: pagina a due colonne (a sinistra scheda dei dati, aperti, scadenze, contratto; a destra la riga
  del tempo); giallo **Nuovo ticket per questo impianto**.

### 12.3 Documenti: telefono

Segmenti: **Archivio · Da approvare · Scadenze · Modelli** (Da approvare solo per chi approva o per chi ha revisioni in
attesa).
- *Archivio*: ricerca grande; pillole-filtro **Tutti · per cliente · per commessa · per impianto · Da classificare** (le
  tre "per" aprono un foglio di scelta e diventano la pillola gialla tenue con la × come i filtri della 0.4.0); le
  categorie in pillole scorrevoli; righe: icona dell'origine (foglio per i PDF, foto, cartella, o il riquadro col tipo
  di collegamento), titolo, "Progetti e schemi · Rossi Impianti Srl · rev. 2", a destra le pillole (Da approvare, Scade
  fra 24 giorni, OneDrive). Riga **Sfoglia OneDrive e Google Drive** con **Non collegato** in fondo all'elenco. Giallo
  **Aggiungi un documento**. Il collaboratore (documenti 1): niente giallo.
- *Aggiungi un documento* (foglio, poi pagina): due schede grandi **Carica un file** (Fotografa · Dal telefono) e
  **Collega un file o una cartella** (campo dell'indirizzo con **Incolla**; mentre si incolla la pillola del tipo e
  "Cartella" se lo è); riga **Sfoglia OneDrive e Google Drive** · **Non collegato**. Poi: titolo (proposto dal nome del
  file), categoria (pillole), **A cosa è legato** (cliente, commessa, impianto, ticket: righe con Cambia, già scelte se
  si arriva da una scheda), riferimento e data del documento (chiusi in "+ Riferimento e data"), **Scade** (No · Sì, con
  la data e "ogni"), chi lo vede (Tutti · Chi vede i prezzi; Solo il titolare per il titolare). Giallo **Salva il
  documento**. Dopo, se chiude una scadenza, il foglio di §6.1. Dal **Condividi** di Android (un link o un file mandato
  a Wisper) si arriva qui con l'indirizzo o il file già messo.
- *Documento* (pagina): pillole (Valida rev. 2 / Da approvare / OneDrive...), titolo, "categoria · data", scheda **A cosa
  è legato** (righe che aprono cliente, commessa, impianto, ticket); per un **file**: l'anteprima della prima pagina
  (immagine o PDF), **Revisioni** (righe: "rev. 3 · Da approvare · Marco Rossato, ieri · nota", "rev. 2 · Valida",
  "rev. 1 · Superata"; tocco = apri quella), **Carica una revisione** (bordo); per un **collegamento**: l'indirizzo
  accorciato con **Copia**, la riga "Le revisioni le tiene OneDrive", e per un percorso "Si apre dal computer dello
  studio"; **Scadenza** (con Segna fatta); **Condividi**: **Manda per email** e **Link che scade** · **Non collegato**;
  **Cronologia**. Giallo: rev. da approvare e chi approva → **Approva la rev. 3** (con **Respingi** col bordo accanto);
  altrimenti file → **Apri**, collegamento → **Apri in OneDrive** (o "in Google Drive", "in SharePoint", "il sito";
  percorso: nessun giallo). ⋯: Cambia, Tieni sul telefono, Scarica, Archivia, Metti nell'archivio (da un ticket).
- *Da approvare*: righe (titolo, "rev. 3 · Marco Rossato · ieri", la nota); tocco = documento; per chi ha caricato, le sue
  in attesa e le respinte col motivo. Nessun giallo (si approva nel documento).
- *Scadenze*: gruppi **Scadute**, **Nel preavviso**, **Più avanti** (righe: data grande a sinistra, titolo, "cliente ·
  impianto · ogni 5 anni", pillola); tocco = foglio della scadenza (titolo, data, ogni, documento che la fa nascere,
  **Segna fatta** giallo, **Carica il verbale e segna fatta**, **Prepara la lettera per il cliente** (dal modello),
  Rimanda, Togli). Giallo della pagina **Nuova scadenza** (titolare e chi ha documenti 2).
- *Modelli*: **Modelli di Wisper** (righe: nome, "impaginazione fissa", **Testi** →); **Modelli dello studio** (i
  documenti di quella categoria, **Apri**); giallo **Nuova lettera** (sceglie il modello, il cliente e l'impianto, mostra
  il testo coi segnaposti riempiti e quelli che mancano in giallo scuro, poi **Crea il PDF** e **Salva nell'archivio**).
  *Testi di un modello* (pagina, solo amministrazione 2): i testi uno sotto l'altro, i segnaposti come pillole da
  toccare per inserirli; **Salva** col bordo per ogni testo.

### 12.4 Documenti: computer

Stessa voce, segmenti **Archivio · Da approvare · Scadenze · Modelli**.
- *Archivio*: a sinistra (220) l'elenco delle categorie col numero e "Da classificare"; a destra ricerca, filtri come
  pillole (cliente, commessa, impianto), tabella: Titolo (con l'icona dell'origine), Categoria, Legato a (cliente ·
  commessa · impianto), Revisione, Stato, Scadenza, Modificato. Si **trascinano** file sulla tabella (si apre Aggiungi
  con il file) o un link dal browser (Aggiungi con l'indirizzo). Tocco = **pannello del documento** (440) come la pagina del
  telefono. Giallo **Aggiungi un documento** (finestra a due colonne: a sinistra il file o l'indirizzo, a destra i dati;
  giallo **Salva il documento**). Un percorso `X:\…` si apre in Esplora file.
- *Da approvare*: tabella con l'anteprima a destra; nel pannello **Approva la rev. 3** (giallo) e **Respingi**.
- *Scadenze*: tabella per data (Data, Titolo, Cliente e impianto, Ogni, Documento, Stato) con i gruppi; tocco = finestra
  della scadenza; giallo **Nuova scadenza**.
- *Modelli*: come il telefono, con l'anteprima del PDF a destra mentre si cambia un testo.
- Amministrazione › **Categorie dei documenti** (righe con approvazione, chi vede, scadenza proposta; **Nuova categoria**
  col bordo) e › **Spazio sul NAS** (riquadri: Libero · Usato da Wisper · Nel cestino · Solo sul NAS; barre per tipo; i
  file più grandi; "Copia fuori casa: ultima stanotte alle 2:30 · 3 file per domani"; **Svuota il cestino** col bordo,
  solo titolare). Le stesse due pagine ci sono nell'Amministrazione del telefono.

### 12.5 Le altre pagine

- **Cliente**: segmento nuovo **Documenti · N** (la cartella del cliente in cima con **Apri la cartella**, poi i documenti e
  "Da Wisper") e **Ticket · N**; *Sedi e impianti*: la riga dell'impianto mostra la categoria e apre lo **storico**.
- **Commessa**: la scheda **Documenti** diventa quella dell'archivio filtrato (cartella in cima, documenti, "Da Wisper":
  preventivo, rapportini firmati, fatture); pillola **Assistenza** per la commessa di un contratto, con il contratto
  linkato.
- **Calendario** (fase 2): gli interventi col segno "Ticket"; le scadenze del giorno come righe con la bandierina
  ("Scadenza: Verifica impianto di terra · Batokyo Srl"), che aprono la scadenza.
- **Rapportino**: la pillola "Ticket TK/2026/0014" (→ ticket); ⋯ **Lega a un ticket** / **Togli dal ticket**; passo 2 dal
  ticket come §3.3; dopo la firma il foglio *Il lavoro è finito?*.
- **Dashboard**: le voci di §11.1; riquadri per chi vede i ticket: Ticket aperti · Urgenti · Interventi oggi · Scadenze vicine
  (scadute più quelle nel preavviso; toccabili; sul telefono in due colonne).
- **Visita guidata**: due passi in più dopo quelli della fase 4 sul telefono, sulle schermate vere coi dati di esempio:
  Ticket, riga dell'urgente (leggi: "Le richieste" / "In cima c'è quello che va fatto prima."), e nel ticket il giallo
  (leggi: "Il pulsante giallo" / "Ti dice cosa fare adesso: prendere, pianificare, scrivere il rapportino.").

## 13. Prove di fine fase

- **Documenti**: rev. 0 → 1 → 2 con approvazione (approvata da chi approva, da approvare da chi non approva, respinta
  col motivo, Annulla), la valida che non cambia finché la nuova non è approvata, nome "superata" scaricando; `vede`
  (collaboratore senza `costi` non trova un contratto, nemmeno con `/file/<id>`: 403); caricamento in byte di un file di
  49 MB (passa) e di 51 MB (rifiutato a metà, niente resti su disco); doppione per SHA-256; `idFile` ripetuto; i casi di
  `casi-collegamenti.json` (OneDrive personale, SharePoint con `/:f:/`, Drive file e cartella, percorso UNC e lettera,
  `http://` e `javascript:` rifiutati); ricerca con accenti e più parole; migrazione 005 (documenti delle commesse con
  gli stessi id, cartella della commessa).
- **Spazio e copie**: disco "quasi pieno" finto (`WISPER_SPAZIO_FINTO_MB` solo nelle prove): documento rifiutato, foto
  del rapportino accettata; copia fuori casa con un file oltre 25 MB (`fuori_no`), un file che fallisce e gli altri che
  passano, ripresa la notte dopo; `svuotaCestino` solo titolare e solo oltre 90 giorni.
- **Scadenze**: fatta con la prossima (dalla fatta e dalla data, 31 gennaio + 1 mese = 28 febbraio); proposta DPR 462 da
  `ambiente`; ticket programmato che nasce una volta sola 30 giorni prima; chiudere il ticket segna fatta la scadenza.
- **Ticket**: tutti i passaggi di §7.1 e i rifiuti; matrice della priorità (`casi-ticket.json`, nove casi più il
  "Cambia"); tempi da `TICKET_TEMPI` e dal contratto; `preso_il`, `intervento_il`, `risolto_il`; pianificazione con la
  sovrapposizione della fase 2; rapportino col ticket (numero nel campo Ticket se vuoto, campo pieno non toccato, PDF
  con la cella Ticket); rapportino offline col ticket nato offline (`idLocaleTicket`); collaboratore (vede i suoi e i non
  assegnati, non chiude, non trova gli altri).
- **Fatturazione**: il raggruppamento E in `casi-fattura.json`; ticket aperto: i suoi rapportini non compaiono in *Da
  fatturare*; chiuso `ticket` → una voce, che riserva ticket, rapportino, spesa (indice unico: lo stesso rapportino non
  entra in un'altra bozza); emessa → rapportino FATTURATO e `fatturato_il` del ticket; nota di credito → tutto libero;
  `separati` → le voci normali (il mese di Elettrodinamica); `contratto` → niente, le spese al cliente a parte se i
  materiali non sono compresi; `no` → niente, con la conferma per le spese al cliente.
- **Contratti**: attiva (commessa, rate, scadenze delle visite), rinnovo tacito di notte, disdetta, rinnova, canone
  cambiato solo sulle rate nuove; rate in *Da fatturare* entro 15 giorni.
- **Permessi**: ogni ruolo su ogni azione nuova (§11.2), `/condiviso/` con `CONDIVISIONE_INDIRIZZO` vuoto e con token
  revocato o scaduto.
- **PDF di oggi identici** dopo la migrazione (testo di rapportino, riepilogo, preventivo, prospetto).
- **Schermate vere** su telefono e computer, chiaro e scuro, confrontate col prototipo; il flusso intero coi dati di
  prova: telefonata → Nuovo ticket urgente → Prendo io → Pianifica → (senza rete) Scrivi il rapportino, foto, firma, Sì
  è risolto → rete → Chiudi il ticket → *Da fatturare* → bozza; un documento collegato da OneDrive col Condividi del
  telefono; una revisione da approvare approvata dal computer.

## 14. Da confermare e da decidere

**Con Manuel** (le fonti in `ricerca-fase5.md` §6): periodicità delle verifiche DPR 462 e quali impianti sono a maggior
rischio; quali scadenze vuole per le cabine MT (CEI 78-17, SPG/SPI); categorie e approvazioni; cosa scrive oggi nel campo
Ticket del rapportino; come fattura gli interventi (a ore, a corpo, diritto di chiamata) e se ha già contratti con
canone; tempi d'intervento promessi e se in ore di calendario o lavorative; dove stanno i documenti (OneDrive personale o
SharePoint, cartelle per cliente o per commessa). Fino ad allora valgono i valori proposti qui, tutti modificabili.

**Domande per Andrea** (la raccomandazione per prima):
1. **Collegamento a OneDrive e Drive**: in fase 5 solo i link (incollati o col Condividi del telefono), sfogliare le
   cartelle da dentro Wisper nella fase 8. Consiglio sì: 0 € in tutti e due i casi, ma l'accesso diretto chiede app
   registrate nel Microsoft 365 di Manuel e su Google Cloud e chiavi da custodire sul NAS.
2. **Ogni contratto ha la sua commessa** (nasce da sola, pillola Assistenza): consiglio sì, perché il canone passa dalle
   scadenze di pagamento che la fase 4 sa già fatturare e il costo dei ticket dice se il contratto rende. L'alternativa
   (contratti senza commessa) chiede una sorgente nuova in *Da fatturare* per il canone.
3. **Link per i clienti**: lasciarlo **Non collegato** fino alla fase 7 (portale) e mandare i documenti per email.
   Consiglio sì. L'alternativa è aprire ora la porta 8401 con Tailscale Funnel (gratis), che risponde solo ai link: è
   comunque un pezzo di server su internet.
4. **Copia dei PDF mandati** ai clienti nell'archivio (`COPIA_INVIATI`): consiglio sì, si sa sempre cosa è partito, circa
   100-300 KB a PDF.
5. **Chi chiude i ticket**: titolare e amministrazione (il collaboratore segna risolto). Consiglio sì: la chiusura decide
   come si fattura.
6. **Copia dei file grandi**: oltre 25 MB restano solo sul NAS (lo dice la Dashboard). Se il NAS ha uno strumento di copia
   verso un servizio esterno gratuito, conviene usarlo per la cartella dei file (`/volume1/docker/Wisper-NAS/data/file`):
   è un'impostazione del NAS, da fare da Andrea.
