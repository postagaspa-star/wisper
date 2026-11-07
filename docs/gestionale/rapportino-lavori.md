# Il rapportino con più lavori, senza firma (06/11/2026)

Dalla riunione di Andrea con Manuel del 06/11/2026. Scelte di Andrea in chat:

- "Un rapportino deve essere l'insieme di più lavori (che equivalgono al rapportino attuale) dello stesso giorno",
  ognuno con la sua commessa, il suo progetto, la sua descrizione, i suoi km, la sua tariffa, le sue ore.
- I lavori di uno stesso rapportino possono essere di **clienti diversi**.
- "La firma non ha più senso, bisogna toglierla."
- Il progetto è obbligatorio solo per Elettrodinamica, riconosciuta **dal nome** (`server/prove/casi-progetto-obbligatorio.json`).
- Si costruisce direttamente nell'app (niente prototipo da approvare). La tela del 06/11
  (https://claude.ai/artifact/MXdzpyGya4zMrLgJ2EjaW5) dà solo la direzione: lì alcune scritte non stavano nei loro
  contenitori, nell'app non deve succedere.

Server 0.13.0, telefono 1.2.0, computer 1.2.0 (insieme alle correzioni piccole dello stesso giorno).

## 1. Parole sullo schermo

- **Rapportino** = la giornata: data, chi l'ha scritto, numero (N° 153), i suoi lavori.
- **Lavoro** = una voce del rapportino, cioè quello che fino alla 1.1 era un rapportino intero.
- Stati, del **lavoro**: **Da inviare** → **Inviato** → **Fatturato** (più Annullato). Lo stato è del lavoro perché i
  lavori di clienti diversi partono in momenti diversi. Il rapportino mostra il riassunto ("2 da inviare · 1 inviato").
- Le parole "Da firmare", "Firmato", "Fai firmare", "Firma del cliente" non compaiono più nei rapportini. Un lavoro
  FIRMATO di prima si mostra come **Da inviare**. (Firme di preventivi, consegne di attrezzature ecc. restano.)
- Segmenti dell'elenco: **Tutti | Da inviare | Da fatturare**.

## 2. Dati (server)

- Tabella nuova **`giornate`** (il rapportino): `id` TEXT PRIMARY KEY = il numero visibile (`RAP/2026/0153`, dalla
  numerazione `rapportino` di oggi), `id_locale` UNIQUE, `data`, `tecnico`, `utente_id`, `creato`, `modificato`.
- La tabella **`rapportini`** resta e ogni riga è un **lavoro** (tutti i campi di oggi: cliente, commessa, progetto,
  ore, km, tariffa congelata, spese, stato, approvazione…), più `id_giornata` e `posizione` (ordine nel rapportino).
  Così conti, fatture (`fattura_sorgenti` tipo `rapportino`), ore, budget, progetti, Dashboard, portale e copie
  notturne continuano a lavorare riga per riga.
- Id dei lavori nuovi: `<id della giornata>-<n>` (`RAP/2026/0153-2`). Le righe che ci sono già tengono il loro id.
- Migrazione: ogni riga che c'è diventa un rapportino con un solo lavoro (`giornate.id` = id della riga,
  `posizione` 1), con copia del database prima, come le altre migrazioni. Il numero visibile non cambia.
- **Migrazione 012 (07/11/2026, server 0.13.1)**: Andrea: "gli 8 rapportini dovevano essere raggruppati con il nuovo
  sistema a giornate". I rapportini di prima (un lavoro solo, con lo stesso id del rapportino) dello stesso giorno e della
  stessa persona (utente e nome del tecnico) diventano un rapportino solo, col numero del primo scritto; i lavori in fila
  nell'ordine in cui erano stati scritti (`creato`, poi id). Cambiano solo `id_giornata` e `posizione`; i rapportini
  rimasti vuoti si tolgono; nel registro una riga per lavoro spostato. Quelli fatti con la 1.2 non si toccano: due
  rapportini nello stesso giorno, fatti apposta, restano due (scelta di Andrea: "Due separati vanno bene").
- La numerazione dei rapportini conta le `giornate` (e gli id delle righe vecchie): il prossimo numero non ripete
  mai un numero già dato.

## 3. Azioni

- **`salvaRapportino`, forma nuova**: `{ idLocale, id?, data, tecnico?, lavori: [ { idLocale, id?, …gli stessi campi di
  un rapportino della 1.1 (idCliente/cliente, idCommessa/commessa, codiceProposto, idProgetto/progettoNuovo,
  descrizione, oreLavoro, oreExtra, oreViaggio, km, spese, noteSpese, tariffa, luogo, ticket, noteInterne,
  strumenti…) } ] }` → `{ ok, rapportino }` con `rapportino = { id, idLocale, data, tecnico, lavori: [lavoro come lo
  manda l'azione rapportini], totale }`.
  - Almeno un lavoro. Ogni lavoro ha le sue regole congelate (tariffa, €/km, viaggio, costo) come oggi.
  - Un lavoro che c'era e non è più nell'elenco viene tolto, solo se è Da inviare e non è in una fattura; altrimenti
    rifiuto "Il lavoro per X è già inviato: non si toglie" (o "…è in una fattura…").
  - Un lavoro Inviato o Fatturato non si cambia (come oggi il rapportino firmato): rifiuto con la frase di oggi.
  - Lo stesso `idLocale` (del rapportino e dei lavori) rimandato dalla coda del telefono non crea doppioni.
  - Il cambio di data del rapportino vale per tutti i suoi lavori Da inviare.
- **`salvaRapportino`, forma di prima** (senza `lavori`, dalle app 1.1 e dalle code): funziona come oggi e crea o
  aggiorna un rapportino con un solo lavoro. La risposta è quella di oggi, più `idGiornata`.
- **`rapportini`** (lettura) manda i lavori come oggi, più `idGiornata`, `posizione`, `numero` (= idGiornata). Le app
  nuove raggruppano per `idGiornata`; le app 1.1 vedono ogni lavoro come un rapportino (va bene finché si aggiornano).
- **Togliere un rapportino** (oggi "Elimina", solo bozze): toglie il rapportino e i suoi lavori se sono tutti Da inviare
  e fuori dalle fatture.
- **Stati**: Da inviare = `BOZZA` (e il `FIRMATO` di prima). `inviaEmail` e `stato INVIATO` accettano i lavori Da inviare
  (oggi vogliono FIRMATO). "Riporta da inviare" porta un Inviato a `BOZZA`. Le app 1.1 che caricano una firma e
  chiedono FIRMATO continuano a funzionare (il server lo accetta ancora), ma le app nuove non lo usano mai.
- **Da fatturare** (`fatture.js` ~217, ~254, ~389, ~1564): prende anche i lavori `BOZZA`. Sparisce la sezione "Da far
  firmare · non si fatturano finché non sono firmati"; "Segna fatturato" vale per Da inviare e Inviato.
- **Approvazione** dei collaboratori: per lavoro, come oggi.
- **Portale**: le app nuove non offrono più "Fallo firmare nel portale"; "Pubblica nel portale" resta, per lavoro.

## 4. Invio

- Si scelgono rapportini interi o singoli lavori. All'invio le app **dividono per destinatario** (chi paga del lavoro, la
  stessa regola di oggi `intestatarioRapportino` / `chiPaga`): un'email per destinatario, con **solo i suoi lavori**,
  attraverso l'`inviaEmail` di oggi (`ids` = i lavori di quel destinatario). Nessun cliente vede i lavori di un altro.
- Per ogni destinatario: campo A già scritto con la sua email; oggetto e frase da `periodoInvio` sulle date dei suoi
  lavori (`server/prove/casi-invio.json`): se i suoi lavori sono di **un solo rapportino** vale il caso "un rapportino
  solo" ("Rapportino 153 del 05/11/2026"); con più rapportini giorno/settimana/mese come nei casi.
- PDF: un solo rapportino → il PDF del rapportino con i lavori di quel destinatario (righe: progetto, commessa,
  descrizione, ore lavoro/viaggio/extra, km, spese, importi se "Con gli importi"); più rapportini → il riepilogo, una
  riga per lavoro (Data, N°, Progetto, Lavoro svolto, Ore, Km, Totale). Codice del progetto dove c'era la commessa,
  commessa nel riquadro Mittente (come le correzioni dello stesso giorno). Nessun riquadro firma per il cliente; un
  lavoro vecchio che ha una firma la mostra ancora.
- Una finestra (computer) o una pagina (telefono) **Invio rapportino / Invio rapportini** con una scheda per
  destinatario (email, oggetto, cosa parte), "Con gli importi", "Cambia il messaggio", **Invia N email** (giallo),
  "Solo i PDF", "Segna inviati senza email". Dopo l'invio i lavori di chi ha ricevuto l'email sono Inviati.

## 5. Schermate

Stile di oggi (`docs/aspetto.md`): il design "Fai" è in pausa.

**Telefono**
1. **Il rapportino** (nuovo o riaperto): titolo "Rapportino", data con "Cambia", "N lavori · per N clienti", una scheda per
   lavoro (cerchio del cliente, cliente, commessa · progetto, "Intestato a …" se c'è, descrizione su una riga, ore e km,
   importo, stato se non è Da inviare), **Aggiungi un lavoro** (tratteggiato). Barra in basso: ore e km del giorno,
   totale, **Salva rapportino** (giallo). Toccare un lavoro Da inviare lo apre; uno Inviato si apre in sola lettura.
   Dopo il salvataggio: foglio "Rapportino salvato · N lavori per N clienti" con **Invia ai clienti** e **Più tardi**.
2. **Un lavoro** in 3 passi (Per chi → Ore e strada → Il lavoro), come i passi di oggi senza il Riepilogo: l'ultimo
   pulsante è **Aggiungi al rapportino** (o **Fatto** se il lavoro c'era già) e torna al rapportino. Nel passo 1, dal
   secondo lavoro in poi, in cima **Come il lavoro prima** (stesso cliente, commessa e progetto; ore, km e lavoro nuovi).
   Progetto: con Elettrodinamica obbligatorio; per gli altri "Nessun progetto" già scelto. "Togli questo lavoro" nel
   menu ⋯ del lavoro (solo Da inviare).
3. **Oggi / Dashboard**: la scheda del giorno parla del rapportino di oggi e dei suoi lavori.
4. **Rapportini**: un blocco per rapportino (N°, data, "N lavori · N clienti", riassunto degli stati, totale) con i suoi
   lavori sotto. Dal 07/11/2026 (1.2.1, Andrea: "non devono poter essere selezionati i lavori singoli"): la casella c'è
   solo sulla testata del rapportino e lo sceglie intero; la testata sta su fondo più scuro, fra un rapportino e l'altro
   c'è più spazio; scelto = bordo scuro e lavori in giallo chiaro. Barra "N rapportini scelti", sotto "N lavori · N
   clienti · €", con **Cosa faccio** (Da inviare, Segna inviati, Segna fatturati).
5. **Invio** (§4).

**Computer**
1. **Modulo del rapportino** in una finestra larga: in alto data con Cambia; a sinistra l'elenco dei lavori (schede come
   sul telefono, quella scelta evidenziata), **Aggiungi un lavoro**, **Copia il lavoro scelto**; a destra il lavoro scelto
   (Per chi con recenti e ricerca, Progetto, Ore e strada con gli stepper, tariffa, Cosa hai fatto, spese, luogo, nota,
   ticket, strumenti), "Togli questo lavoro". In basso: lavori, ore e km del giorno, **Totale del giorno**, Annulla,
   **Salva rapportino** (giallo). Gli errori dicono quale lavoro ("Lavoro 2: scegli il progetto") e lo aprono.
2. **Rapportini**: una scheda per rapportino (07/11/2026: "non si capisce quando inizia un rapportino e quando
   finisce"), le intestazioni delle colonne sopra tutte le schede. Testata della scheda su fondo più scuro con la sola
   casella, N°, data, chi l'ha scritto, lavori, clienti, stati, ore, km, totale; sotto le righe dei lavori senza casella
   (Cliente, Commessa, Progetto, Lavoro svolto, Ore, Km, Totale, Stato). Si sceglie il rapportino intero; barra "N
   rapportini scelti · N lavori · N clienti · €" con **Da inviare**, Segna inviati, Segna fatturati a mano.
3. **Pannello del rapportino** (a destra): numero, data, i lavori con il loro stato e importo, totale; pulsanti: **Invia
   ai clienti** (giallo se c'è qualcosa da inviare), Modifica, PDF, ⋯ (Riporta da inviare, Segna inviato senza email,
   Segna fatturato, Elimina). Sparisce "Carica il foglio firmato".
4. **Invio rapportini** (§4): a sinistra l'anteprima del PDF del destinatario scelto, a destra una scheda per destinatario.

**Testi che stanno nei contenitori**: niente larghezze fisse per i contenitori di testo (pulsanti, pillole, schede, celle):
i testi lunghi vanno a capo o si accorciano con i puntini mostrando tutto al tocco/al passaggio. Va provato con il nome
cliente più lungo dei dati di esempio, sul telefono a 360 dp con caratteri grandi (scala 1,3) e sul computer a 1024 e
1440 di larghezza, in tema chiaro e scuro.

## 6. Prove

- Server: forma nuova e vecchia di `salvaRapportino`, idempotenza con `idLocale`, togliere lavori (permesso e rifiutato),
  lavori bloccati, numerazione, migrazione delle righe di prima (numeri uguali, un lavoro per rapportino), Da fatturare
  con `BOZZA`, `inviaEmail` su lavori Da inviare, stessa riga vista dalle app 1.1.
- Computer: regole di raggruppamento e di divisione per destinatario con casi in `pc/prove/`, giri cliccati aggiornati
  (rapportino con 3 lavori di 2 clienti, invio diviso, elenco con caselle), schermate.
- Telefono: test di Gradle per raggruppamento, divisione per destinatario e coda (un rapportino con più lavori senza rete
  che parte una volta sola), schermate sull'emulatore.
