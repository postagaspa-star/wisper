# Diario di Wisper

La storia di Wisper versione per versione: cosa è cambiato, quando e perché.
Le novità più recenti sono in alto.

Il diario è iniziato il 20 ottobre 2026. Per i giorni precedenti l'ho ricostruito
da tre fonti: i commit, le versioni pubblicate su GitHub e le conversazioni di
lavoro di quei giorni. Le schermate sono state fatte il giorno stesso, durante le
prove. Mostrano sempre dati di esempio (Rossi Impianti, Batokyo, Mario Bianchi…),
mai dati veri di clienti.

| Data | Versione | In breve |
|------|----------|----------|
| 13/11/2026 | 1.4.2, server 0.15.1 | [Un rapportino inviato si cambia liberamente, gli aggiornamenti arrivano, Servizi e prodotti, la parcella pro-forma](#v1-4-2) |
| 13/11/2026 | 1.4.1 | [Un rapportino inviato si riporta da inviare da dove lo si corregge](#v1-4-1) |
| 12/11/2026 | 1.4.0, server 0.15.0 | [Servizi, indennità nei rapportini, preventivi e parcelle col modello di Manuel](#v1-4-0) |
| 12/11/2026 | 1.3.3, server 0.14.0 | [Il rapportino nel formato del riepilogo, i km scritti da soli](#v1-3-3) |
| 11/11/2026 | 1.3.2 | [Aggiungi un lavoro accanto a Salva, il rapportino del telefono su una pagina, Scegli tutti](#v1-3-2) |
| 11/11/2026 | 1.3.1 | [Il rapportino a tre colonne, il riepilogo col cliente del progetto](#v1-3-1) |
| 09/11/2026 | 1.3.0 | [Il design Fai: una casa che dice cosa fare](#v1-3-0) |
| 07/11/2026 | server 0.13.2 | [La fattura vede il conto scritto dopo in Banche](#server-0-13-2) |
| 07/11/2026 | 1.2.1, server 0.13.1 | [I rapportini di prima uniti per giorno, un rapportino per scheda](#v1-2-1) |
| 07/11/2026 | 1.2.0, server 0.13.0 | [Il rapportino diventa la giornata: più lavori, niente firma, niente Ore](#v1-2-0) |
| 04/11/2026 | 1.1.1 (computer) | [Il menu laterale resta dov'era e non ha più la barra grigia](#v1-1-1) |
| 04/11/2026 | 1.1.0, server 0.12.0 | [Si riparte da zero: progetti, funzioni tutte spegnibili, aggiornamenti annunciati dal NAS](#v1-1-0) |
| 03/11/2026 | 1.0.0 | [Il gestionale entra in uso: la sera del cambio](#v1-0-0) |
| 03/11/2026 | gestionale, server 0.11.2 | [I dati veri sono nel server sul NAS](#dati-veri) |
| 02/11/2026 | gestionale, server 0.11.2 (non pubblicata) | [Foglio, portale ed email collegati sul Google vero](#collegati) |
| 02/11/2026 | gestionale, server 0.11.1 (non pubblicata) | [Su Google si incolla un file solo, il resto lo fa il NAS](#senza-mani) |
| 02/11/2026 | gestionale (non pubblicata) | [Il computer entra col telefono, inquadrando un QR](#gestionale-qr) |
| 02/11/2026 | 0.4.0, computer 0.3.6.1 | [Un budget salvato non si divide più per mille](#budget-0-3-6-1) |
| 01/11/2026 | gestionale, fase 8 (non pubblicata) | [Integrazioni, impostazioni e controlli finali](#gestionale-fase-8) |
| 01/11/2026 | gestionale, fase 7 (non pubblicata) | [WhatsApp e comunicazioni, portale clienti](#gestionale-fase-7) |
| 31/10/2026 | gestionale, fase 6 (non pubblicata) | [Persone, mezzi e attrezzature, collaboratori esterni](#gestionale-fase-6) |
| 22/10/2026 | gestionale, fase 5 (non pubblicata) | [Documenti, ticket e assistenza](#gestionale-fase-5) |
| 22/10/2026 | gestionale, fase 4 (non pubblicata) | [Fatture, banche e scadenze](#gestionale-fase-4) |
| 22/10/2026 | gestionale, fase 3 (non pubblicata) | [Ore, timer, spese e trasferte](#gestionale-fase-3) |
| 22/10/2026 | gestionale, fase 2 (non pubblicata) | [Preventivi, attività e calendario](#gestionale-fase-2) |
| 21/10/2026 | gestionale, fase 1 (non pubblicata) | [Il nucleo del gestionale: server sul NAS, accesso per persona, Dashboard](#gestionale-fase-1) |
| 21/10/2026 | 0.4.0 | [Tutto l'ufficio anche sul telefono](#v0-4-0) |
| 20/10/2026 | solo foglio | [Il foglio trova l'email del proprietario anche senza il permesso apposta](#permesso-email) |
| 20/10/2026 | solo foglio | [L'email per collegare il computer serve anche a installare Wisper Ufficio](#installa-da-email) |
| 20/10/2026 | 0.3.6 | [Il computer si collega dal telefono; la settimana sta sopra a oggi](#v0-3-6) |
| 20/10/2026 | 0.3.5 | [Codici commessa 26ST, Elettrodinamica a tariffa fissa, budget e margine](#v0-3-5) |
| 19/10/2026 | 0.3.4 | [Il codice salvato si vede, e un codice sbagliato viene detto chiaro](#v0-3-4) |
| 17/10/2026 | 0.3.3 | [Niente indirizzo del foglio nei file pubblicati, partita IVA con lo zero, registro degli accessi](#v0-3-3) |
| 16/10/2026 | 0.3.0 → 0.3.2 | [Un solo file .exe, aggiornamenti automatici, installazione da sola](#v0-3-0) |
| 15/10/2026 | 0.2 | [Nuovo design: Oggi sul telefono, Fine mese sul computer](#design) |
| 14–15/10/2026 | 0.2.0 | [Niente più voce: rapportini a mano, il foglio come archivio, Wisper Ufficio](#v0-2-0) |
| 26/09–14/10/2026 | 0.1 | [Un rapportino confermato non si perde più](#coda) |
| 7–9/08/2026 | 0.1.0 | [Hackathon NGN Hacks: la versione a voce, senza mani](#v0-1-0) |
| marzo–giugno 2026 | prima del repository | [Le prime versioni](#prima) |

---

<a id="v1-4-2"></a>
## 13 novembre 2026 · 1.4.2 · server 0.15.1 · Un rapportino inviato si cambia liberamente, gli aggiornamenti arrivano, Servizi e prodotti, la parcella pro-forma

**Perché.** Andrea, lo stesso giorno della 1.4.1: "se tu invii un rapportino, anche dopo averlo inviato devi poterlo
modificare liberamente, e nel caso tu lo faccia poi il sistema te lo deve segnare come da Inviar. Questo perché se tu
l'hai inviato per sbaglio, devi poterlo modificare e reinviare." Il pulsante "Riporta da inviare" della 1.4.1 era un
passo in più, da cercare. Poi: "non c'è un tasto semplice e veloce nelle impostazioni per controllare se ci sono dei
nuovi aggiornamenti, e [...] da telefono non viene nemmeno la notifica di aggiornamento, e quindi i telefoni restano
fermi"; e "il tasto per segnare il rapportino "da inviare" io lo vedo, ma il pc di mio padre no, anche se è stato
aggiornato all'ultima versione": la versione nuova era scaricata, ma il programma aperto era ancora quello di prima,
e niente lo diceva chiaro. Sulle indennità: "non c'è bisogno di segnare le ore (quindi non devono essere
obbligatorie), ma se non sono inserite quando viene cliccato il bottone per inviare il rapportino deve apparire un
secondo passaggio che chiede conferma". E, col modello della parcella di Manuel: "nei servizi devono essere chiamati
Servizi e Prodotti, e non ci deve essere la distinzione tra servizi ed indennità; [...] durante la bozza della fattura
non c'è la possibilità di metterla come parcella pro-forma (che deve avere lo stesso formato di preventivo e
parcella), ed inoltre anche se viene segnato che c'è la ritenuta d'acconto il sistema non la considera; [...] non
vengono mostrati i codici dei servizi; parcella, parcella pro-forma e fattura devono avere tutte quest'impostazione".

**Cosa cambia.**

- **Un lavoro inviato si cambia come uno da inviare.** Aprendo un rapportino inviato i campi sono tutti da scrivere,
  con una riga sola in cima al lavoro: "Inviato · se lo cambi torna da inviare". Salvando, il server guarda lavoro
  per lavoro: quello cambiato torna **Da inviare**, quelli non toccati restano Inviati. Il computer lo dice ("il
  lavoro per Rossi Impianti torna da inviare") con **Invia di nuovo**; il telefono scrive "Era già inviato: adesso
  torna da inviare" sopra Invia ai clienti. Restano fermi solo i lavori fatturati o dentro una fattura. "Riporta da
  inviare" resta nel pannello e nella barra dei rapportini scelti, per chi vuole solo segnarlo.
- **Indennità senza ore.** Un lavoro con almeno un'indennità si salva anche senza ore. Quando lo si manda al cliente
  (Invia ai clienti, o Segna inviati) prima compare **Indennità senza ore**: "Nel lavoro per Mario Bianchi c'è
  un'indennità ma non sono segnate ore. Lo mando lo stesso?", con **Invia lo stesso** e Annulla.
- **Aggiornamenti sul computer.** In cima alle Impostazioni c'è la scheda **Versione**, con **Controlla
  aggiornamenti**. Quando la versione nuova è scaricata lo dice senza giri: "La 1.4.3 è scaricata, ma stai ancora
  usando la 1.4.2: riavvia per passare alla nuova", con **Riavvia adesso**; lo stesso nel riquadro giallo del menu
  laterale (un pulsante tondo quando il menu è richiuso). E se il programma resta fermo tre minuti, senza finestre
  aperte né niente da salvare, si riavvia da solo e torna alla pagina in cui era. Era questo il computer di Manuel:
  aggiornato sul disco, vecchio sullo schermo.
- **Aggiornamenti sul telefono.** La stessa scheda **Versione** in cima alle Impostazioni, con **Controlla
  aggiornamenti** e, quando c'è, **Installa la 1.4.3**. Il controllo ora si fa anche ad app chiusa, ogni sei ore;
  quando la versione è scaricata arriva la notifica "Versione nuova di Wisper" (toccarla la installa), e dopo "Wisper
  aggiornato". Se l'app resta dietro per un minuto senza un rapportino a metà, si installa da sola. La prima volta
  Android chiede, una volta sola, il permesso di installare app da Wisper.
- **Servizi e prodotti.** La voce del menu e la pagina si chiamano così, sul computer e sul telefono. L'elenco è uno
  solo: nella finestra dell'indennità non ci sono più i due gruppi "Indennità" e "Altri servizi", si sceglie **Da
  Servizi e prodotti** fra tutti, nell'ordine del listino.
- **La bozza della fattura.** Ogni riga ha il suo **Codice** e lo **Sconto %**; **Da Servizi e prodotti** aggiunge
  una riga già scritta (codice, descrizione, unità, prezzo). Accanto a Passa al programma c'è **Parcella pro-forma**
  (sul telefono sotto i conti): salva la bozza e prepara il PDF. Lo stesso pulsante è nel pannello di una fattura
  passata al programma; una fattura emessa ha in vista **Parcella in PDF** (o Fattura, o Nota di credito). Prima
  stavano tutti nel menu ⋯. "Pre-parcella" si chiama ovunque **Parcella pro-forma**.
- **La stessa veste per tutti.** Preventivo, parcella pro-forma, parcella e fattura escono dalla stessa pagina del
  modello: mittente e Spett.le, la tabella con Codice, Descrizione, Q.tà, U.M., Unit. €, Sconto, IVA e Totale €, il
  pagamento, i totali con rivalsa e ritenuta d'acconto, l'importo dovuto.
- **La ritenuta d'acconto.** La bozza decideva se c'era la ritenuta nel momento in cui nasceva, guardando il cliente
  com'era allora. Segnando dopo il cliente come sostituto d'imposta (o togliendo il segno), le sue bozze restavano
  com'erano: è il caso che non veniva considerato. Ora il server (0.15.1) porta la scelta nelle bozze del cliente e
  rifà i conti. Sul computer, i conti a schermo della bozza tengono conto dello sconto di riga.
- **Sul telefono, un servizio di prima della 1.4.0** (senza unità di misura) scelto come indennità fermava il
  pulsante giallo chiedendo l'unità, che sta in fondo alla pagina: ora prende "A corpo" o "Ore" come sul computer.

<img src="docs/diario/2026-11-13-inviato-modifica-computer.png" width="620" alt="Un lavoro inviato dentro la finestra del rapportino: i campi si scrivono, in cima la riga Inviato, se lo cambi torna da inviare"> <img src="docs/diario/2026-11-13-inviato-modifica-telefono.png" width="240" alt="Lo stesso sul telefono">

<img src="docs/diario/2026-11-13-da-rimandare-computer.png" width="620" alt="Dopo il salvataggio: il lavoro cambiato è da inviare, gli altri due restano inviati">

<img src="docs/diario/2026-11-13-indennita-senza-ore-computer.png" width="620" alt="La conferma Indennità senza ore prima dell'invio, sul computer"> <img src="docs/diario/2026-11-13-indennita-senza-ore-telefono.png" width="240" alt="La stessa conferma sul telefono">

<img src="docs/diario/2026-11-13-versione-computer.png" width="620" alt="La scheda Versione in cima alle Impostazioni e il riquadro del menu, con una versione scaricata"> <img src="docs/diario/2026-11-13-versione-telefono.png" width="240" alt="La scheda Versione sul telefono, con Installa">

<img src="docs/diario/2026-11-13-servizi-prodotti-computer.png" width="620" alt="La pagina Servizi e prodotti">

<img src="docs/diario/2026-11-13-bozza-codici-computer.png" width="620" alt="La bozza della fattura: il codice e lo sconto delle righe, Da Servizi e prodotti, Parcella pro-forma accanto a Passa al programma"> <img src="docs/diario/2026-11-13-pro-forma-telefono.png" width="240" alt="La bozza sul telefono, con Parcella pro-forma sotto i conti">

<img src="docs/diario/2026-11-13-parcella-pro-forma-pdf.png" width="240" alt="Il PDF della parcella pro-forma aperto dal telefono, con la veste del modello">

**Prove.** Server: 696 prove, con la nuova sulla ritenuta portata nelle bozze. Computer: 369 prove dei conti e
delle regole; dieci giri cliccati, quello dei rapportini con 18 passi (il lavoro inviato cambiato e tornato da
inviare, gli altri rimasti inviati; il rapportino con la sola indennità salvato senza ore e la conferma prima
dell'invio). Telefono: 463 prove; sull'emulatore, contro un server di prova: rapportino con la sola indennità
salvato, conferma all'invio, email partita, rapportino riaperto, cambiato e tornato da inviare; riga della bozza
scelta da Servizi e prodotti con lo sconto, parcella pro-forma aperta in PDF. L'aggiornamento del telefono è stato
provato dall'inizio alla fine sull'emulatore con un elenco firmato di prova: scaricata, notifica, permesso di
Android la prima volta, installata, "Wisper aggiornato", e la seconda senza chiedere niente.

**Non provato.** I telefoni veri di Manuel e Andrea e il computer di Manuel. Il caso preciso della ritenuta che ha
visto Manuel non l'ho potuto guardare sui dati veri: ho corretto quello che ho trovato (il cliente segnato dopo la
bozza).

**Da fare una volta sola.** I telefoni fermi a una versione di prima non hanno ancora il controllo ad app chiusa: la
1.4.2 va presa a mano (Menu › Impostazioni › Aspetto › Versione › Controlla, poi Installa). Alla prima installazione
da sola Android chiede il permesso "Installa app sconosciute" per Wisper: si dà una volta. Il computer di Manuel va
chiuso e riaperto una volta (o Riavvia Wisper Ufficio nel riquadro giallo): dalla 1.4.2 lo fa da solo.

**Versione:** [v1.4.2](https://github.com/postagaspa-star/wisper/releases/tag/v1.4.2) (telefono codice 20, computer
1.4.2), server 0.15.1 sul NAS.

---

<a id="v1-4-1"></a>
## 13 novembre 2026 · 1.4.1 · Un rapportino inviato si riporta da inviare da dove lo si corregge

**Perché.** Andrea: "ho notato che una volta inviati i rapportini non si possono più modificare o tirare indietro".
Si poteva, dalla 1.2.0: "Riporta da inviare". Ma stava solo nel menu ⋯ del rapportino, e chi apriva un lavoro inviato
per correggerlo trovava i campi fermi: sul computer una frase che rimandava altrove, sul telefono nemmeno quella. Una
funzione che non si trova è come se non ci fosse.

**Cosa cambia.**

- **Dentro il lavoro inviato.** Aprendo un rapportino con Modifica (computer) o toccandolo (telefono), il lavoro
  inviato dice "Già inviato al cliente. Per correggerlo riportalo da inviare: dopo va mandato di nuovo." e accanto ha
  il pulsante **Riporta da inviare**. Dopo la conferma il lavoro torna da scrivere lì dov'è: la finestra resta aperta,
  gli altri lavori non si toccano, si corregge e si salva. Il rapportino torna "da inviare" e il giallo torna su Invia
  ai clienti.
- **Nel pannello del rapportino** (computer) **Riporta da inviare** è un pulsante in vista sotto Invia ai clienti, non
  più una voce del menu ⋯; con più lavori dice quanti ("Riporta da inviare i 2 inviati").
- **Con più rapportini scelti.** Nella barra in basso del computer e in "Cosa faccio" sul telefono c'è **Riporta da
  inviare**, quando fra quelli scelti c'è almeno un lavoro inviato: tornano indietro tutti insieme.
- **Sul computer, gli altri casi.** Un lavoro segnato fatturato a mano ha il pulsante **Non ancora fatturato**; uno che
  sta in una bozza di fattura ha **Apri la bozza** (si toglie da lì). Un lavoro in una fattura emessa resta fermo: si
  corregge con una nota di credito.

<img src="docs/diario/2026-11-13-riporta-computer.png" width="620" alt="Il lavoro inviato dentro la finestra del rapportino, con la frase e il pulsante Riporta da inviare"> <img src="docs/diario/2026-11-13-riporta-telefono.png" width="240" alt="Lo stesso sul telefono">

<img src="docs/diario/2026-11-13-riporta-pannello-computer.png" width="620" alt="Il pannello di un rapportino inviato: Riporta da inviare sotto Invia ai clienti">

**Prove.** Computer: 368 prove dei conti e delle regole; il giro cliccato dei rapportini ha tre passi nuovi (il lavoro
riportato da inviare dentro la finestra, corretto e salvato; i due inviati insieme dal pannello; i tre lavori dalla
barra dei rapportini scelti), a 1024 e 1440 px, chiaro e scuro. Telefono: 460 prove; sull'emulatore, contro un server di
prova: rapportino segnato inviato, "Riporta da inviare" comparso in Cosa faccio, il lavoro aperto con la frase e il
pulsante, riportato e tornato da scrivere al suo posto. Il server non cambia (0.15.0).

**Non provato.** I telefoni veri di Manuel e Andrea.

**Versione:** [v1.4.1](https://github.com/postagaspa-star/wisper/releases/tag/v1.4.1) (telefono codice 19, computer
1.4.1), pubblicata alle 14:01; il server resta 0.15.0 e la annuncia alle app entro dieci minuti.

---

<a id="v1-4-0"></a>
## 12 novembre 2026 · 1.4.0 · server 0.15.0 · Servizi, indennità, preventivi e parcelle col modello di Manuel

**Perché.** Andrea: "Ora bisogna aggiungere anche la possibilità di aggiungere le indennità. Nei rapportini bisogna
fare in modo che come ultima cosa, a fianco dei bottoni tipo "ore extra" "Luogo" eccetera ci sia anche un bottone per
le indennità, che apra una schermata con gli stessi campi che vedi nella foto. Inoltre bisogna aggiungere anche i
servizi (che devono essere raggiungibili anche dal menù laterale) [...] (devi inserirli già tu dentro al database).
infine [...] devi anche fare in modo che i preventivi, pre-parcelle e parcelle siano così". Con tre allegati: i 35
servizi esportati da Flextaxa, la foto della scheda "Anagrafica prodotti/servizi" di Flextaxa e il "Modello parcella
WISPER" con due parcelle d'esempio e le indicazioni per l'impaginazione.

**Cosa cambia.**

- **Servizi**, una voce nuova del menu laterale subito dopo Preventivi, sul computer e sul telefono. È il listino dei
  preventivi della fase 2, ora coi campi della scheda di Flextaxa: Descrizione, Prezzo di vendita (IVA esclusa),
  Aliquota IVA e, nei Dettagli, Codice articolo, Costo di acquisto, Aliquota IVA acquisto, Tipo (servizio o prodotto),
  Unità di misura (Nr, Ore, Pz, Km, Giorni, A corpo), Fornitore, Tag per la ricerca, Immagine (JPG o PNG fino a 1 MB),
  e le Note personali che non vanno nei documenti. L'elenco ha la ricerca (codice, descrizione, tag, fornitore) e i
  segmenti Tutti, Indennità e Servizi (sul telefono Servizi e Archiviati). Lo vede chi ha Preventivi, Rapportini o
  Fatture (i prezzi solo chi vede i soldi); lo cambia chi può cambiare i preventivi. Il vecchio "Listino" dei preventivi porta qui, e "Dal listino"
  nell'editor del preventivo ora dice "Dai servizi".
- **I 35 servizi di Flextaxa** sono nel database del NAS, coi prezzi veri (lo strumento `importa-servizi.js` li legge
  dal CSV; il CSV e i prezzi non sono nel repository). Prima nel database del NAS non c'era nessun
  servizio: sono entrati tutti e 35 come nuovi, 4 sono indennità.
- **Indennità nei rapportini.** Nella parte Altro del lavoro, dopo "+ Ore extra", "+ Luogo", "+ Una nota per te" e
  "+ Strumenti usati", c'è **+ Indennità**. Apre una schermata con gli stessi campi della scheda dei servizi più la
  Quantità; in cima si sceglie il servizio (prima quelli che si chiamano "Indennità...") e i campi si riempiono da
  soli. Un lavoro può avere più indennità: ognuna è una riga che si tocca per cambiarla o toglierla. L'importo
  (quantità per prezzo) va nel conto del lavoro e nel totale, nel PDF del rapportino (una riga sotto il lavoro e una
  nel conto) e, quando si fattura, in una riga della fattura col suo codice. Chi non vede i soldi sceglie il servizio
  e il prezzo lo mette il server; un'indennità salvata tiene il suo prezzo anche se poi il servizio cambia.
- **Preventivo, pre-parcella e parcella** hanno la veste del modello di Manuel: logo a sinistra, a destra il tipo, il
  numero e "data · Valuta EUR (€)", il filetto; Mittente (con la qualifica, P.IVA e C.F., PEO, PEC, telefono e sito) e
  Spett.le su due colonne; la tabella Codice, Descrizione, Q.tà, U.M., Unit. €, Sconto, IVA, Totale € senza righe
  verticali, anche le righe a zero; in fondo a sinistra il Pagamento (modalità, scadenza, importo, beneficiario, IBAN,
  BIC) e a destra il riepilogo (Imponibile, Totale rivalsa 5% EPPI, Spese, Totale IVA, Totale documento, Ritenuta
  d'acconto, Totale ritenute, Importo dovuto); le Note intere; il piè con lo studio a sinistra e "Parcella n. 24 ·
  Pagina 1 / 1" a destra. L'"Avviso di parcella" si chiama ora **Pre-parcella** (la bozza coi numeri di Wisper, "non è
  una fattura"); la **Parcella** è la fattura emessa, col numero dato dal programma: "Parcella in PDF" nel menu della
  fattura emessa (o "Fattura in PDF", "Nota di credito in PDF").
- **Dati nuovi per i documenti**: la Qualifica dello studio (Impostazioni › Dati dello studio), BIC/SWIFT e
  Beneficiario del conto in banca (Banche e scadenze › Conti), e sul cliente "Nei documenti la commessa si chiama"
  (per EPPI "JOB": sul documento per esempio "JOB: 26ST045"; vuoto = "Commessa"). Le righe delle fatture hanno codice e sconto,
  letti anche dall'XML che torna da Flextaxa.
- **L'IVA si arrotonda come Flextaxa**, riga per riga (più quella della rivalsa), non più sul totale. Su una delle
  parcelle del modello Wisper dava un centesimo di IVA in meno di Flextaxa: ora tornano tutte e due al centesimo, sul
  server, sul computer e sul telefono (nelle prove ci sono due parcelle inventate, gli importi veri restano fuori).

**Scelte fatte senza chiedere** (dette nel messaggio ad Andrea): Servizi è il listino di prima allargato, non una cosa
nuova accanto; le indennità stanno nel lavoro e non nelle spese; la pre-parcella è l'avviso di parcella di prima con la
veste nuova; l'etichetta della commessa è del cliente; la regola dell'IVA viene dai due esempi (da confermare con un
caso: una riga sola da 126,74 € deve dare 29,27 € di IVA). Le altre decisioni sono in
`docs/gestionale/servizi.md` §4.

**Prove.** Server 695 prove; computer 368, e tutti e dieci i giri cliccati; telefono 460 (col server di prova acceso,
nessuna saltata). I 35 servizi veri sono stati importati sul NAS controllando solo i conteggi (35 attivi, 4 indennità,
accenti a posto). Nelle prove cliccate il finto ponte stampa i PDF da DevTools: con Edge 157 la stampa da riga di comando
non scriveva più il file (il programma vero stampa con WebView2 e non cambia). Le schermate sono coi dati di esempio.

<img src="docs/diario/2026-11-12-servizi-computer.png" width="620" alt="La pagina Servizi sul computer: codice, descrizione, unità, IVA e prezzo, coi segmenti Tutti, Indennità e Servizi"> <img src="docs/diario/2026-11-12-servizi-telefono.png" width="240" alt="Servizi sul telefono">

<img src="docs/diario/2026-11-12-servizio-scheda-computer.png" width="620" alt="La scheda di un servizio coi campi di Flextaxa: descrizione, prezzo di vendita, aliquota, codice, costo di acquisto, tipo, unità, fornitore, tag, immagine, note">

<img src="docs/diario/2026-11-12-indennita-rapportino-computer.png" width="620" alt="Il lavoro del rapportino con l'indennità di trasferta nella parte Altro, la pillola + Indennità per ultima e la riga nel conto"> <img src="docs/diario/2026-11-12-indennita-telefono.png" width="240" alt="La schermata dell'indennità sul telefono">

<img src="docs/diario/2026-11-12-indennita-finestra-computer.png" width="620" alt="La finestra dell'indennità: il servizio da cui parte, gli stessi campi della scheda e la quantità">

<img src="docs/diario/2026-11-12-parcella.png" width="420" alt="Una parcella d'esempio nella veste nuova: mittente e destinatario, la tabella con codice e sconto, pagamento e riepilogo con la rivalsa EPPI e la ritenuta"> <img src="docs/diario/2026-11-12-pre-parcella.png" width="420" alt="La pre-parcella con la stessa veste e la nota che non è una fattura">

<img src="docs/diario/2026-11-12-preventivo.png" width="420" alt="Il preventivo d'esempio nella veste nuova, con le sezioni, le voci facoltative e alternative e il riepilogo">

**Versione:** [v1.4.0](https://github.com/postagaspa-star/wisper/releases/tag/v1.4.0) (telefono codice 18, computer
1.4.0), pubblicata alle 21:45; server 0.15.0 sul NAS dalle 20:59 (schema 14), che la annuncia alle app dalle 21:49.

---

<a id="v1-3-3"></a>
## 12 novembre 2026 · 1.3.3 · server 0.14.0 · Il rapportino nel formato del riepilogo, i km scritti da soli

**Perché.** Andrea: "i file per la fatturazione dei rapportini, anche quelli giornalieri (quindi con un solo
rapportino) devono essere fatti secondo questo formato", col riepilogo di un mese allegato. E: "i kilometri percorsi
per un cliente. Manuel vuole che siano suggeriti in automatico". Andrea era indeciso fra la posizione del telefono
(Wisper vede che Manuel è da un cliente e riempie il campo) e i km calcolati dalla sede del cliente, che però vorrebbe
dire gestire anche gli intestatari di tutti i progetti di Elettrodinamica, che sono come dei sotto-clienti. Fra le
strade proposte ha scelto: i km **dal luogo del lavoro**, **andata e ritorno**, calcolati con la **mappa di Google
attraverso lo script del foglio**, e in alto sul PDF **il numero del rapportino**.

Perché non la posizione: per capire che Manuel è "da un cliente" servono comunque gli indirizzi di tutti i clienti;
il telefono dovrebbe poter seguire la posizione sempre (permesso "Consenti sempre", batteria); per i collaboratori
seguire gli spostamenti tocca le regole sul controllo a distanza dei lavoratori; e i km di un giorno cambiano, mentre
per il rimborso serve un numero stabile. Nei rapportini veri sul NAS 21 lavori su 22 con i km sono su un progetto, con
13 "Intestato a" diversi: per questo il luogo sta nel progetto, e gli intestatari non diventano clienti.

**Cosa cambia.**

- **Il PDF del rapportino** (anche di un giorno con un lavoro solo) è il foglio del riepilogo: in alto a destra
  "Rapportino di lavoro", il numero e "cliente · giorno · N lavori"; sotto mittente e destinatario, la tabella con
  data, numero, progetto, Intestato a, lavoro svolto, ore, km, spese e importo, il totale e il conto (con gli importi
  quando si sceglie di mandarli). Il riepilogo e il rapportino ora escono dallo stesso modello: quello che cambia in uno
  cambia anche nell'altro.
- **Dove, nel progetto.** Un campo nuovo, "Via, numero e comune", sotto Intestato a, sul computer e sul telefono.
  Scrivendo un Intestato a già usato in un altro progetto, Dove si riempie da solo col suo indirizzo. Nella scheda del
  progetto: "Via dei Mulini 4, Schio · 48 km andata e ritorno".
- **La strada la calcola il NAS.** Ogni 2 minuti guarda quali luoghi non hanno ancora i loro km (Dove dei progetti
  aperti, indirizzi delle commesse e dei clienti) e li chiede allo script del foglio, che usa la mappa di Google (gratis,
  senza chiavi). Una volta per indirizzo: la risposta si ricorda. Si parte dall'indirizzo dello studio (Impostazioni ›
  Dati dello studio); se cambia, le strade si rifanno.
- **Nel rapportino** i km di un lavoro nuovo si scrivono da soli: quelli dell'ultima volta sullo stesso progetto,
  altrimenti quelli dallo studio; senza progetto, la stessa cosa per la commessa e poi per il cliente. Sotto il campo
  tre pillole: **Ultima volta · N km**, **Dallo studio · N km** e **Senza auto**. Un numero scritto a mano o scelto
  con una pillola non si cambia più, e un rapportino già salvato non cambia mai da solo. La visita guidata del telefono
  lo dice al passo dei km.
- **Un viaggio si conta una volta.** Se nello stesso rapportino un lavoro prima ha già i km, Wisper non li riscrive da
  solo nel lavoro dopo (le pillole restano, per aggiungerli con un tocco). L'ho deciso guardando i rapportini veri: nei
  12 giorni con più lavori i km non sono mai su tutti, in 9 sono su un lavoro solo.
- **Telefono, il modulo del progetto.** Con Dove i campi sono cinque e, a tastiera aperta, Salva copriva il campo in cui
  si scriveva: ora la parte in basso si nasconde finché la tastiera è aperta, come nel rapportino.
- Nella finestra per mandare i rapportini, "con gli importi" è già scelto per chi può vedere i soldi.

<img src="docs/diario/2026-11-12-km-computer.png" width="620" alt="I km scritti da soli nel rapportino nuovo, con le pillole Ultima volta, Dallo studio e Senza auto"> <img src="docs/diario/2026-11-12-km-telefono.png" width="240" alt="Le stesse pillole sul telefono">

<img src="docs/diario/2026-11-12-progetto-dove-computer.png" width="620" alt="La scheda del progetto con Dove e i km dallo studio"> <img src="docs/diario/2026-11-12-progetto-dove-telefono.png" width="240" alt="Dove nel progetto sul telefono">

<img src="docs/diario/2026-11-12-rapportino-pdf.png" width="520" alt="Il PDF del rapportino di un giorno con due lavori, nel formato del riepilogo">

**Prove.** Server: 686 prove, 6 nuove sui km (il giro una volta per indirizzo, il Dove ripreso dall'Intestato a, lo
studio che cambia, la pausa dopo un errore dello script). Script: 93 prove, con `postinoDistanza` sul finto Google.
Computer: 358 prove dei conti e delle regole, con i 12 casi dei km condivisi col telefono e i due PDF nel formato nuovo;
i giri cliccati (rapportini a lavori, progetti, flussi, fase 6, visita); sullo schermo coi dati di esempio i km scritti
da soli, le pillole, il secondo lavoro dello stesso giorno senza km, il Dove ripreso dall'Intestato a e la scheda del
progetto, anche in tema scuro. Telefono: 447 prove con `server/prove/telefono.js`; sull'emulatore, contro un server di
prova: progetto nuovo con Dove, i km dallo studio arrivati dal giro del server, rapportino con i km scritti da soli,
corretti a mano e salvati, il lavoro dopo con "Ultima volta", tema scuro e telefono stretto (360 dp).

**Non provato.** La mappa di Google vera: finché Andrea non incolla lo script nuovo il NAS non può chiedere le strade (lo
dice nel log e riprova ogni ora; intanto i km si propongono dall'ultima volta). I telefoni veri di Manuel e Andrea.

**Pubblicata.** [Versione 1.3.3](https://github.com/postagaspa-star/wisper/releases/tag/v1.3.3) alle 15:15: telefono
codice 17, computer 1.3.3. Server 0.14.0 sul NAS dalle 15:16 (prima una copia intera dei dati); il NAS annuncia la
versione nuova dalle 15:26.

---

<a id="v1-3-2"></a>
## 11 novembre 2026 · 1.3.2 · Aggiungi un lavoro accanto a Salva, il rapportino del telefono su una pagina, Scegli tutti

**Perché.** Andrea, la sera stessa della 1.3.1: "il tasto per creare una nuova commessa dentro un rapportino deve essere
di fianco (sinistra) al tasto per chiudere il rapportino, e quindi a destra di quello per annullarlo", su tutti i
dispositivi, da mandare subito. Nella 1.3.1 l'avevo messo in fondo a sinistra della finestra, lontano da Salva. Nello
stesso messaggio: "Fai lo stesso editor a tre colonne anche sul telefono" (fra le due strade proposte ha scelto la
pagina unica). E mentre lo costruivo: "In questa stessa versione 1.3.2 devi anche fare in modo che, una volta applicati
i filtri e anche prima, si debba poter selezionare tutto". Come per il budget della 0.4.0 la versione resta 1.3.2: ho
sostituito i file della release con un numero interno nuovo (telefono codice 16, computer 1.3.2.1, che a schermo dice
1.3.2), così telefoni e computer si aggiornano da soli.

**Cosa cambia.**

- **Computer.** In basso a destra l'ordine è Annulla · **Aggiungi un lavoro** · Salva rapportino. "Copia il lavoro
  scelto" resta da solo a sinistra.
- **Telefono, il pulsante.** "Aggiungi un lavoro" sta nella barra in basso, subito a sinistra del pulsante giallo (Salva
  rapportino, o Invia ai clienti se il rapportino non è stato cambiato). È bianco col bordo scuro, come sul computer; su
  un telefono stretto la scritta va su due righe. Il tasto per annullare è la X in alto, che non cambia.
- **Telefono, il rapportino su una pagina sola.** Le tre colonne del computer, una sopra l'altra. In alto la data e la
  **fila dei lavori**: una scheda per lavoro (cliente, commessa, ore e km, importo) che scorre di lato; quella scelta è
  bianca col bordo scuro. In mezzo tutti i campi del lavoro scelto, negli stessi gruppi e nello stesso ordine del
  computer: **Per chi** (cliente, commessa e progetto, ognuno col suo Cambia), **Il lavoro** (ore e cosa hai fatto),
  **Strada e tariffa**, **Altro** (viaggio, spese con la foto dello scontrino, e le pillole per ore extra, luogo, nota,
  strumenti) e **Il conto**. In basso il conto del lavoro scelto, il totale del giorno, Aggiungi un lavoro e Salva
  rapportino. Niente più 3 passi, Avanti e "Aggiungi al rapportino": quello che si scrive va subito nella fila e nei
  totali. Salva rapportino controlla i lavori uno per uno, come il computer: sceglie il primo che ha qualcosa che manca,
  la pagina scorre fino al campo e l'avviso dice quale ("Lavoro 1: scrivi che lavoro hai fatto (anche il lavoro 2)");
  le schede con un errore hanno il bordo rosso. Un lavoro aggiunto e lasciato vuoto non si salva e non fa chiedere
  "Uscire senza salvare?". Con la tastiera aperta la parte in basso si nasconde, per lasciare posto ai campi. La
  visita guidata ha due passi in meno (i due Avanti) e scorre da sola fino alle ore, ai km e allo scontrino.
- **Scegli tutti.** Sul computer una casella nella testata della tabella dei rapportini, in fila con quelle dei
  rapportini; sul telefono la riga **Scegli tutti** sopra l'elenco. Scelgono i rapportini che si vedono: tutti quelli
  del mese senza filtri, solo quelli che passano i filtri (ricerca, Da inviare, Da fatturare, cliente) con i filtri.
  Ritoccata, toglie la scelta; con una parte scelta mostra il trattino. Sul computer, scelto qualcosa ma non tutto,
  nella barra in basso compare anche il pulsante **Scegli tutti**.

<img src="docs/diario/2026-11-11-aggiungi-lavoro-computer.png" width="620" alt="Annulla, Aggiungi un lavoro e Salva rapportino sul computer">

<img src="docs/diario/2026-11-11-pagina-unica-telefono.png" width="240" alt="Il rapportino del telefono su una pagina: la fila dei lavori, Per chi, i totali in basso"> <img src="docs/diario/2026-11-11-pagina-unica-telefono-scuro.png" width="240" alt="La stessa pagina in tema scuro, col secondo lavoro scelto"> <img src="docs/diario/2026-11-11-scegli-tutti-telefono.png" width="240" alt="Scegli tutti sopra l'elenco dei rapportini del telefono">

<img src="docs/diario/2026-11-11-scegli-tutti-computer.png" width="720" alt="La casella Scegli tutti nella testata della tabella dei rapportini sul computer">

**Prove.** Telefono: tutte le prove con `server/prove/telefono.js` più 8 nuove sulla pagina unica
(`PaginaRapportinoTest`: il lavoro nuovo già scelto, la copia nella fila, il modulo ritrovato tornando a un lavoro,
"Lascia com'era", i lavori vuoti, i controlli solo sui lavori toccati, il primo errore nell'ordine della pagina).
Sull'emulatore, contro un server di prova: rapportino con due lavori per due clienti salvato, arrivato al server e
riaperto col suo numero; la copia su disco ritrovata dopo aver chiuso l'app; togliere un lavoro; la visita guidata fino ai
Rapportini; tema scuro e telefono stretto (360 dp); Scegli tutti con e senza ricerca. Computer: 356 prove dei conti e
delle regole e i giri cliccati (rapportini a lavori, progetti, flussi, fase 6, visita); Scegli tutti cliccato con e
senza filtro. Il server non cambia.

**Non provato.** I telefoni veri di Manuel e Andrea; la foto di uno scontrino vero dalla fotocamera (l'emulatore non ne
ha una vera).

**Pubblicata.** [Versione 1.3.2](https://github.com/postagaspa-star/wisper/releases/tag/v1.3.2) alle 18:59 col solo pulsante
(telefono codice 15, computer 1.3.2; il NAS l'annuncia dalle 19:03). Alle 19:51 i file della stessa release sono stati
sostituiti con la pagina unica e Scegli tutti: telefono codice 16, computer 1.3.2.1; il NAS l'annuncia dalle 19:53.

---

<a id="v1-3-1"></a>
## 11 novembre 2026 · 1.3.1 · Il rapportino a tre colonne, il riepilogo col cliente del progetto

**Perché.** Tre richieste di Andrea dell'11 novembre:

1. nel riepilogo che si manda al cliente per fatturare i lavori del mese, "tra la colonna con il progetto/codice progetto
   e la descrizione del lavoro svolto anche il nome del cliente a cui si riferisce il progetto (non la commessa, ma
   proprio il progetto)", accorciando la data se serve;
2. "togliere il totale che viene messo alla fine di ogni pagina del foglio": deve esserci solo alla fine;
3. nel rapportino sul computer, "Aggiungi un lavoro" in basso a sinistra, vicino ai tasti che chiudono il rapportino, e
   un po' più in vista; tutti i dati da compilare nella colonna di mezzo, dai più comuni e importanti; a destra solo il
   riassunto, senza cambiarlo.

**Il riepilogo (PDF, uguale su telefono e computer).**

- Colonna nuova **Intestato a** fra Progetto e Lavoro svolto: il cliente scritto nel progetto. Senza progetto, una
  lineetta. La data è corta (05/11/26) per fare spazio.
- **Il totale una volta sola.** Il browser che fa i PDF ripeteva la riga del totale in fondo a ogni pagina: fa così con
  la riga di piede delle tabelle. Ora è una riga normale e sta solo alla fine. Vale per tutti i PDF (rapportino,
  riepilogo, preventivo); l'intestazione delle colonne invece si ripete ancora in cima a ogni pagina, ed è giusto così.

<img src="docs/diario/2026-11-11-riepilogo-pagina-1.png" width="300" alt="La prima pagina del riepilogo, senza totale in fondo"> <img src="docs/diario/2026-11-11-riepilogo-ultima-pagina.png" width="300" alt="L'ultima pagina del riepilogo, col totale una volta sola">

**Il rapportino sul computer.**

- **Tre colonne.** A sinistra i lavori del rapportino; in mezzo tutti i campi del lavoro scelto; a destra solo il
  riassunto, com'era: Il conto del lavoro scelto e Il rapportino (lavori, ore, km e totale del giorno). Chi non vede i
  soldi a destra ha solo lavori, ore e km.
- **L'ordine dei campi** viene dai rapportini veri sul NAS (contati l'11 novembre, solo i numeri). Su 37 lavori:
  cliente, ore di lavoro, cosa hai fatto e tariffa ci sono sempre; commessa e progetto in 35; i km in 21; viaggio, ore
  extra, spese, luogo, ticket, nota e strumenti in nessuno (prima della pulizia del 3 novembre: viaggio in 3 lavori su
  20, spese in 8). Quindi: **Per chi** (cliente, commessa, progetto), **Il lavoro** (ore, cosa hai fatto), **Strada e
  tariffa** (km, tariffa oraria), **Altro** (viaggio, spese e, con un tocco, ore extra, luogo, una nota per te,
  strumenti usati).
- **Aggiungi un lavoro** è in basso a sinistra, con accanto "Copia il lavoro scelto"; Annulla e Salva rapportino restano
  a destra. "Aggiungere un rapportino" l'ho letto come questo pulsante: dentro la finestra è quello che aggiunge un lavoro
  al rapportino aperto. È bianco col bordo scuro e la scritta in grassetto, quindi risalta più degli altri, ma il giallo
  resta solo su Salva rapportino: un solo pulsante giallo per schermata.
- Su uno schermo stretto (1024 pixel) le tre colonne si stringono senza spezzare i nomi.

<img src="docs/diario/2026-11-11-rapportino-tre-colonne.png" width="620" alt="Il rapportino a tre colonne">

<img src="docs/diario/2026-11-11-rapportino-tre-colonne-scuro.png" width="620" alt="Il rapportino a tre colonne nel tema scuro">

Il rapportino sul telefono non cambia: la richiesta era per il computer.

**Prove.** Computer: 356 prove dei conti e delle regole (una nuova per la colonna, la data corta e il totale) e tutti i
giri cliccati (fasi 2-8, rapportini a lavori, progetti, menu laterale, collega, porta). Telefono: tutte le prove con
`server/prove/telefono.js`. Un riepilogo di 60 lavori di esempio stampato in PDF con Edge: tre pagine, la riga del totale
solo nell'ultima. Le impronte dei PDF nella prova del logo cambiano tutte (per la riga del totale): i quattro casi con e
senza logo restano identici fra loro. Il server non cambia: resta la 0.13.2.

**Non provato.** I telefoni veri di Manuel e Andrea; il PDF stampato dal telefono (usa lo stesso modello).

**Pubblicata.** [Versione 1.3.1](https://github.com/postagaspa-star/wisper/releases/tag/v1.3.1): telefono codice 14,
computer 1.3.1, pubblicata alle 17:45 dell'11 novembre. Il NAS la annuncia dalle 17:53: telefoni e computer si aggiornano
da soli.

---

<a id="v1-3-0"></a>
## 9 novembre 2026 · 1.3.0 · Il design Fai: una casa che dice cosa fare

**Perché.** Andrea: "Mio padre ha approvato il quarto design rinnovato". Sulla tela c'erano quattro idee; Manuel ha
scelto la quarta, Fai. L'idea è una sola: si apre Wisper per fare una cosa, e quella cosa deve stare sotto il pollice.
Guida per chi costruisce in `docs/gestionale/fai.md`, prototipi in `docs/prototipo/Fai-telefono.dc.html`,
`Fai-spesa.dc.html` e `Fai-pc.dc.html`.

<img src="docs/diario/2026-11-09-fai-tel-casa-chiaro.png" width="240" alt="La casa nuova sul telefono"> <img src="docs/diario/2026-11-09-fai-tel-casa-scuro.png" width="240" alt="La casa nel tema scuro"> <img src="docs/diario/2026-11-09-fai-tel-menu.png" width="240" alt="Il menu con le icone colorate">

**Cosa cambia, su telefono e computer.**

- **La casa.** In cima, su una scheda gialla, la cosa più importante di adesso col suo pulsante. Sotto, "Cosa vuoi fare?"
  con sei azioni colorate, ognuna con una forma sua: Scrivi un rapportino, Aggiungi una spesa, Nuova commessa, Nuovo
  cliente, Prepara un preventivo, Invia un rapportino (col numero di quelli da inviare). Poi Da sistemare e, sul
  computer, In agenda. Sul computer ogni azione ha il suo tasto (R, S, N, C, P, I).
- **Fattura scaduta.** Se la cosa più importante è una fattura scaduta, la scheda gialla ha "Manda un promemoria": un
  foglio col testo già scritto, che si manda per email o WhatsApp o si cambia prima.
- **Aggiungi una spesa** in tre passi: quanto, che cosa e per quale lavoro, lo scontrino.
- **Il menu** ha voci di una parola sola, un'icona colorata per voce e i numerini.
- **L'aspetto di tutta l'app.** Carattere Plus Jakarta Sans (licenza OFL, dentro le app, nessuna richiesta a Google durante
  l'uso), fondo bianco, schede grigie senza bordo, angoli grandi, collegamenti blu, una piccola molla alla pressione, tema
  chiaro e scuro. I PDF restano col carattere di prima.

Scelte di Andrea del 9 novembre, perché la tela era di prima della 1.2.0: "Segna le ore" è diventato Nuova commessa, "Fai
firmare un rapportino" è diventato Invia un rapportino, e la settimana coi giorni che mancano e i numeri non stanno in
casa: la settimana è in cima a Rapportini, i numeri (i riquadri) in Vedi tutto. Un giorno senza rapportino compare
comunque in casa.

<img src="docs/diario/2026-11-09-fai-pc-casa-chiaro.png" width="620" alt="La casa sul computer">

<img src="docs/diario/2026-11-09-fai-tel-spesa.png" width="240" alt="Il terzo passo della spesa"> <img src="docs/diario/2026-11-09-fai-tel-promemoria-scuro.png" width="240" alt="Il foglio del promemoria"> <img src="docs/diario/2026-11-09-fai-tel-tutto.png" width="240" alt="Vedi tutto coi riquadri">

**Corretti strada facendo.** La visita guidata del telefono, di lunedì, si fermava: i rapportini di esempio erano solo
quelli della settimana in corso, e il passo "tocca la casella" restava senza niente da toccare. Ora di lunedì usa la
settimana prima, e se un elemento da toccare non c'è compare Avanti. Sul telefono "0 di 1 giorni" ora dice "0 di 1
giorno".

**Prove.** Telefono: 437 prove, tutte passate. Computer: 355 prove dei conti e delle regole e tutti i giri cliccati
(fasi 2-8, rapportini a lavori, progetti, menu laterale, visita guidata). Le regole della casa sono le stesse sui due lati,
controllate dagli stessi casi (`pc/prove/casi-casa.json`). La visita guidata del telefono l'ho percorsa tutta sull'emulatore,
fino in fondo. Ho guardato le schermate di ogni sezione, in chiaro e in scuro, contro il prototipo. Il server non cambia:
resta la 0.13.2.

**Non provato.** I telefoni veri di Manuel e Andrea.

**Pubblicata.** [Versione 1.3.0](https://github.com/postagaspa-star/wisper/releases/tag/v1.3.0): telefono codice 13,
computer 1.3.0, pubblicata alle 16:17 del 9 novembre. Il NAS la annuncia dalle 16:23: telefoni e computer si aggiornano da soli.

---

<a id="server-0-13-2"></a>
## 7 novembre 2026 · server 0.13.2 · La fattura vede il conto scritto dopo in Banche

**Perché.** Andrea: "anche se nelle Banche è stato inserito l'IBAN non si riesce a Passare al programma dalla
fatturazione". La finestra Passa al programma della W-1 diceva "Prima di passarla al programma manca: L'IBAN del conto
su cui farti pagare".

**Cosa succedeva.** Quando nasce, una bozza di fattura si segna il conto predefinito di quel momento. La W-1 è nata il 6
novembre alle 19:54, il conto con l'IBAN è stato scritto in Banche alle 20:10. La bozza era rimasta senza conto, e il
controllo guardava solo lì.

**Cosa cambia.** Una bozza senza conto usa il conto predefinito di oggi: nel controllo di cosa manca, nel prospetto,
nell'XML da completare e nella scadenza. Quando passa al programma il conto si fissa nella fattura, così se dopo si
cambia il conto predefinito le fatture già passate restano come sono. Una bozza che ha già il suo conto lo tiene. Cambia
solo il server: telefono e computer restano alla 1.2.1.

**Prove.** Una prova nuova rifà il caso del 6 novembre. Senza conti manca l'IBAN; col conto scritto dopo non manca più,
il prospetto ha l'IBAN e, passando al programma, il conto resta nella fattura. Col codice di prima la stessa prova non
passa. Passano tutte le prove del server. Sul NAS ho controllato su una copia usa e getta dei dati veri: la W-1 ora
trova il conto e non le manca niente.

**Pubblicata.** Server 0.13.2 sul NAS dalle 17:03 del 7 novembre, dopo la copia intera dei dati.

---

<a id="v1-2-1"></a>
## 7 novembre 2026 · 1.2.1, server 0.13.1 · I rapportini di prima uniti per giorno, un rapportino per scheda

**Perché.** Andrea ha guardato la 1.2.0 appena pubblicata e ha trovato tre cose. "Gli 8 rapportini dovevano essere
raggruppati con il nuovo sistema a giornate dei rapportini, non lasciati esattamente come prima." Poi: "la suddivisione
per rapportini nella sezione Rapportini fa schifo: non si capisce quando inizia un rapportino e quando finisce uno".
E ancora: "non devono poter essere selezionati i lavori singoli di un rapportino".

**I rapportini di prima, uniti per giorno.** Nella 1.2.0 ogni rapportino fatto prima era diventato un rapportino con un
lavoro solo. Così il 6 novembre di Manuel risultava fatto di cinque rapportini, invece che di uno con cinque lavori. La
migrazione 012 del server 0.13.1 li unisce. I rapportini di prima con lo stesso giorno e lo stesso autore diventano uno
solo, col numero del primo scritto quel giorno. I lavori restano in fila nell'ordine in cui erano stati scritti. I lavori
non cambiano in niente: stesso numero, stato, fattura, spese e file. Cambia solo il rapportino in cui stanno. Sul NAS il
06/11 di Manuel diventa un rapportino con 5 lavori e il 05/11 uno con 2; il 04/11 di Andrea resta da solo. Prima di
farlo il server salva una copia intera del database.

Ad Andrea ho chiesto anche cosa fare quando si crea un rapportino in un giorno che ne ha già uno: unirli da soli, o
lasciarli separati? Ha scelto "Due separati vanno bene". La 012 tocca quindi solo i rapportini fatti prima della 1.2.
Quelli fatti con la 1.2 restano come sono.

**Un rapportino, una scheda.** Sul computer l'elenco era una tabella sola, e la riga del rapportino sembrava una riga
come le altre. Ora ogni rapportino è una scheda a sé, con bordo e spazio prima della scheda dopo. In cima c'è la
testata, su fondo più scuro: casella, numero, giorno, chi l'ha scritto, lavori e clienti, stati, ore, km e totale.
Sotto ci sono i suoi lavori. Sul telefono le schede c'erano già, ma testata e lavori si somigliavano troppo. Ora la
testata ha il fondo più scuro, i lavori non hanno la casella e il loro importo è più leggero. Fra una scheda e l'altra
c'è più spazio.

**Si sceglie il rapportino intero.** La casella c'è solo sulla testata e sceglie tutto il rapportino. Un rapportino
scelto ha il bordo scuro e i lavori in giallo chiaro. La barra in fondo li conta: "1 rapportino scelto", sotto "3 lavori ·
2 clienti · 363,18 €". Da lì si va a Da inviare, Segna inviati e Segna fatturati, come prima. Nella scheda Da approvare si
approva ancora lavoro per lavoro, perché lì si decide su ogni lavoro.

**Prove.** Server: una prova nuova per la 012, con giorni di più persone, un rapportino annullato e uno fatto con la
1.2 che non si deve toccare. Le prove delle migrazioni 006, 007 e 008 controllano la regola nuova sui dati delle fasi di
prima, riga per riga. Computer: 345 prove, più il giro cliccato del rapportino a più lavori (15 passi), che ora controlla
anche che sui lavori non ci siano caselle. Telefono: 434 prove contro il server di prova, e schermate sull'emulatore in
tema chiaro e scuro.

**Pubblicata.** Il server 0.13.1 è sul NAS dalle 14:26 del 7 novembre. Prima ho fatto la copia intera dei dati. Release
**v1.2.1** su GitHub alle 15:01 (APK con la stessa firma di sempre). Il NAS la annuncia dalle 15:06: telefoni e
computer la scaricano da soli.

![Il computer: ogni rapportino è una scheda, quello scelto ha il bordo scuro](docs/diario/1-2-1/computer-rapportini-schede.png)
![Lo stesso elenco in tema scuro](docs/diario/1-2-1/computer-rapportini-schede-scuro.png)
![Il telefono: la testata più scura con la casella, il lavoro sotto senza casella](docs/diario/1-2-1/telefono-rapportini-schede.png)
![Un rapportino scelto e la barra "1 rapportino scelto"](docs/diario/1-2-1/telefono-rapportino-scelto.png)
![L'elenco del telefono in tema scuro](docs/diario/1-2-1/telefono-rapportini-scuro.png)

---

<a id="v1-2-0"></a>
## 7 novembre 2026 · 1.2.0, server 0.13.0 · Il rapportino diventa la giornata: più lavori, niente firma, niente Ore

**Perché.** Il 6 novembre Andrea e Manuel hanno fatto una riunione sul gestionale e ne è uscito un elenco di 19
modifiche. Quella più grande: "un rapportino deve essere l'insieme di più lavori dello stesso giorno", ognuno con la sua
commessa, il suo progetto, la sua descrizione, i suoi km e le sue ore. Le risposte di Andrea alle domande aperte: i
lavori possono essere anche di clienti diversi; "la firma non ha più senso, bisogna toglierla"; il codice della
commessa si cambia anche dopo; il progetto è obbligatorio solo per Elettrodinamica; le fatture restano come sono
(Wisper le prepara, le emette il programma di Manuel). Il 7 novembre è arrivata un'ultima richiesta: "le Ore vanno
tolte, non servono, metti solamente i Rapportini". L'accordo tecnico è `docs/gestionale/rapportino-lavori.md`.

**Cosa cambia.**

- **Il rapportino è la giornata.** Ha un numero solo (RAP/2026/0018) e dentro tanti lavori, uno sotto l'altro, anche
  per clienti diversi. Ogni lavoro ha il suo cliente, la sua commessa, il suo progetto, quello che si è fatto, le ore,
  i km, la tariffa e le spese. Sul computer la pagina è nuova: i lavori a sinistra, il lavoro scelto a destra, in basso
  il totale del giorno. Ci sono anche "Aggiungi un lavoro" e "Copia il lavoro scelto". Sul telefono il rapportino è una
  pagina con le schede dei lavori, e ogni lavoro si apre con i suoi passi. Un errore dice quale lavoro sistemare
  ("Lavoro 2: …") e lo apre.
- **Niente firma del cliente.** Gli stati sono tre: Da inviare → Inviato → Fatturato. I rapportini già firmati con le
  versioni di prima compaiono come Da inviare. Nei PDF vecchi la firma resta; in quelli nuovi c'è solo la riga del
  tecnico che compila. Un lavoro inviato o fatturato non si cambia: prima si riporta da inviare.
- **L'elenco è raggruppato per rapportino.** In alto c'è la riga del giorno, con il numero, quanti lavori e quanti
  clienti; sotto, i suoi lavori. La casella per scegliere è sempre visibile e non serve più "Seleziona". Scelti dei
  lavori, la barra in basso dice quanti sono, per quanti clienti e quanto fanno. Il pulsante che prima si chiamava
  Riepilogo ora si chiama "Da inviare".
- **Si invia a ogni cliente il suo.** Se i lavori scelti sono di due clienti, partono due email, e ognuno riceve solo i
  suoi lavori. Il titolo della finestra è "Invio rapportino" o "Invio rapportini". L'email del cliente è già scritta.
  L'oggetto e la frase capiscono il periodo: "Rapportino RAP/2026/0153 del 05/11/2026", "Rapportini del 5 novembre
  2026", "Rapportini della settimana dal 2 all'8 novembre 2026", "Rapportini di novembre 2026", "Rapportini da
  ottobre a novembre 2026". I casi sono gli stessi per computer e telefono (`server/prove/casi-invio.json`).
- **I documenti.** Nel rapportino e nel riepilogo c'è il codice del progetto dove prima c'era quello della commessa. Il
  codice della commessa va nel blocco del Mittente ("Commessa 26ST001"). Il riepilogo ha una riga per lavoro. Con il
  logo caricato si può togliere il nome dello studio accanto al logo (interruttore in Dati dello studio).
- **Selezionare e inviare non dipendono più da Fatturazione.** Bastano i Rapportini. "Segna fatturato" e "Prepara la
  bozza" restano sotto Fatturazione.
- **Il progetto è obbligatorio solo per Elettrodinamica.** Il programma lo riconosce dal nome del cliente, anche
  scritto "Elettro Dinamica s.r.l.". Gli altri clienti hanno "Nessun progetto".
- **Il codice della commessa si cambia a mano, anche dopo.** Wisper chiede conferma e aggiorna tutto quello che usa il
  codice: rapportini, progetti, preventivi, fatture, documenti. Il codice di prima resta come "codice precedente". Due
  commesse non possono avere lo stesso codice.
- **Gli avvisi in basso spariscono da soli dopo 3 secondi**, anche gli errori; dopo 5 quelli con Annulla.
- **Dati dello studio.** Indirizzo, CAP, comune e provincia ora stanno sotto il codice fiscale. C'è il **Codice SDI**
  (7 lettere o cifre).
- **Amministrazione.** In cima c'è "Cerca nelle impostazioni": scrivendo, trova le pagine e i campi e li evidenzia.
  Tutte le impostazioni **si salvano da sole**: i pulsanti Salva non ci sono più e compare "Salvato".
- **Niente più Ore.** Nel menu la voce si chiama solo "Rapportini", con le schede Rapportini e Da approvare. Da
  approvare serve ai rapportini scritti dai collaboratori. Non ci sono più il segmento Ore, il timer e le statistiche
  delle ore. Sulla Dashboard le "Ore della settimana" si contano dai rapportini. Le ore già salvate restano nel
  database e le app vecchie le possono ancora mandare, ma non si vedono più.

**Le domande della riunione.** "Da approvare" sono i rapportini dei collaboratori che aspettano il sì del titolare
(Amministrazione › Approvazioni). Le tre tariffe del cliente: tariffa fissa (Elettrodinamica 30 €/h), ultima tariffa
libera (si ricorda da sola) e costo orario fisso (il costo dello studio, serve per il margine). Fatture e banca: Wisper
non parla con nessuna banca e non manda niente allo SDI. Si potrebbe fare gratis con una PEC, ma per ora resta così.

**Una cosa detta com'è.** Sul telefono non ho ripercorso sull'emulatore la visita guidata dopo il taglio delle Ore,
né ho visto a schermo le ore rimaste in coda e la scomparsa degli avvisi dopo 3 secondi. Il codice della coda è lo
stesso di prima. Un timer lasciato acceso con la 1.1 non si ferma più dall'app; resta nel database e non dà fastidio.
La pagina Fattura del telefono mostra una commessa sola, mentre il PDF le ha tutte.

**Prove.** Server: le prove del rapportino a più lavori, del codice commessa, delle impostazioni dello studio e delle
fatture coi progetti, e quella che controlla che dalla Dashboard non escano più ore e timer. La fotografia della
Dashboard è stata rifatta solo dopo aver controllato che le uniche differenze fossero quelle volute. Computer: 345
prove e 14 giri cliccati (rapportino a più lavori, tutte le fasi, collegamento col QR, porta Google, menu, visita
guidata), con il testo controllato a 1024 e 1440 pixel, in tema chiaro e scuro. Telefono: 434 prove contro il server
di prova, e le schermate fatte con il carattere grande (1,3) a 360 dp. Da questa versione le prove cancellano le
cartelle temporanee che creano. Prima restavano: il 6 novembre erano 12.194 cartelle, 29 GB sul disco C.

**Pubblicata.** Il server 0.13.0 è sul NAS dalle 12:37 del 7 novembre. Prima ho fatto la copia intera dei dati. Gli 8
rapportini che c'erano sono rimasti 8 rapportini con un lavoro ciascuno, senza perdere niente: andavano uniti per
giorno, e lo fa la [1.2.1](#v1-2-1). Release **v1.2.0** su GitHub alle 12:42
(APK con la stessa firma di sempre). Il NAS la annuncia dalle 12:47: telefoni e computer con la 1.1 la scaricano da soli.

![Il rapportino sul computer: i lavori a sinistra, il lavoro scelto a destra, il totale del giorno in basso](docs/diario/1-2-0/computer-rapportino-editor.png)
![L'elenco raggruppato per rapportino, con le caselle sempre visibili](docs/diario/1-2-0/computer-rapportino-elenco.png)
![L'invio diviso per cliente, con oggetto e frase del periodo](docs/diario/1-2-0/computer-invio-rapportini.png)
![Il PDF del rapportino con più lavori](docs/diario/1-2-0/computer-pdf-rapportino.png)
![La ricerca nelle impostazioni](docs/diario/1-2-0/computer-cerca-impostazioni.png)
![Il rapportino sul telefono: tre lavori per due clienti](docs/diario/1-2-0/telefono-rapportino-pagina.png)
![L'elenco sul telefono, con le caselle e la barra dei lavori scelti](docs/diario/1-2-0/telefono-rapportini-caselle.png)
![Dati dello studio sul telefono, col Codice SDI](docs/diario/1-2-0/telefono-dati-studio.png)

---

<a id="v1-1-1"></a>
## 4 novembre 2026 · 1.1.1 (computer) · Il menu laterale resta dov'era e non ha più la barra grigia

**Perché.** Andrea ha notato due cose nel menu laterale di Wisper Ufficio: cliccando una voce il menu tornava
all'inizio, e la barra grigia per scorrerlo era brutta da vedere. Con la voce Progetti le voci del titolare sono 19, e su
uno schermo normale non ci stanno tutte: il menu scorre, quindi entrambe le cose si vedono spesso.

**Cosa cambia.**

- **Il menu resta dov'era.** A ogni cambio di pagina le voci si ridisegnano (cambiano la voce evidenziata e i
  numerini). Adesso il programma tiene il punto in cui era il menu e tiene il fuoco sulla voce cliccata. Prima il fuoco
  si perdeva, e con la tastiera si ripartiva dall'inizio. Se una pagina si apre da fuori (dalla Dashboard, da un
  collegamento) e la sua voce è nascosta, il menu scorre solo quel poco che serve per mostrarla.
- **Niente barra grigia.** Il menu scorre con la rotellina come prima, ma senza barra. Al suo posto il bordo del menu
  sfuma dove ci sono altre voci: in basso quando ce ne sono sotto, in alto quando ce ne sono sopra. Se le voci ci stanno
  tutte, non sfuma niente. La barra delle pagine, a destra, è rimasta com'era.
- Il telefono non cambia: resta 1.1.0 (codice 10) e non scarica niente.

**Una cosa detta com'è.** Con i clic simulati delle prove il salto non si riproduceva, né nella 1.0.0 né nella 1.1.0,
anche dentro il programma vero (avviato a parte, con i dati di prova). La causa più probabile è il fuoco perso quando
le voci si ridisegnano, che nel programma vero può riportare il menu in cima. Adesso sia il punto sia il fuoco vengono
tenuti di proposito. Se il salto si rivedesse, va ricontrollato sul computer di Manuel.

**Prove.** Prova nuova `pc/prove/prova-menu-laterale.js` (9 passi, con le barre di scorrimento vere): nessuna barra,
sfumature giuste in cima, a metà e in fondo, rotellina, clic in fondo e a metà senza spostamenti, Rileggi, tastiera col
fuoco che resta, voce mostrata se la pagina si apre da fuori, menu richiuso, schermo alto. Sul codice di prima la stessa
prova trova la barra (10 pixel) e il fuoco perso. Rifatte: computer 316, giro dei progetti (14 passi), visita guidata
(19), flussi principali (26). Il programma costruito, provato a parte con i dati di prova, non ha la barra e tiene
fermo il menu ai clic. Release **v1.1.1** su GitHub (APK uguale alla 1.1.0, stessa firma). Il NAS la annuncia dalle
07:06 (giro 2): i computer con la 1.1.0 la scaricano da soli.

![Il menu laterale: in cima sfuma solo sotto, in fondo (tema scuro) solo sopra; niente barra](docs/diario/1-1-1/computer-menu-laterale.png)

---

<a id="v1-1-0"></a>
## 4 novembre 2026 · 1.1.0, server 0.12.0 · Si riparte da zero: progetti, funzioni tutte spegnibili, aggiornamenti annunciati dal NAS

**Perché.** A Manuel il gestionale è piaciuto, e la sera stessa ha chiesto quattro cose: ripartire con il database
vuoto; poter spegnere ogni funzione, senza nessuna obbligatoria; un livello in più sotto le commesse, i progetti (quando
lavora per un cliente, in realtà lavora per altri sotto il suo nome); e che le app si aggiornino da sole perché è il
NAS ad avvisarle, non loro a chiedere di continuo. L'accordo è `docs/gestionale/progetti.md`.

**Cosa cambia.**

- **Database vuoto.** Sul NAS è stato tolto tutto il lavoro: clienti, commesse, rapportini, fatture, file, registro
  (559 righe). Restano gli account, i telefoni e computer collegati, le impostazioni e le numerazioni: nessuno deve
  rientrare, e la prima commessa nuova continua dall'ultimo codice già dato, così non ripete un codice dei documenti
  vecchi. Prima, una copia intera della cartella dei dati, che resta sul NAS. Lo strumento è `server/strumenti/svuota.js`:
  senza `--si` conta e basta.
- **Progetti.** Cliente → commessa → progetto → rapportino. Ogni progetto ha un codice, **Intestato a** (facoltativo
  ma sempre visibile, per tutti i clienti) e una descrizione. Nel menu laterale c'è la voce Progetti, subito sotto
  Commesse: elenco con aperti e chiusi, scheda con i suoi rapportini e le ore, Chiudi e Riapri, Togli solo se non ha
  rapportini. Nel rapportino, scelta la commessa, si sceglie il progetto (se ce n'è uno solo aperto è già scelto) o se
  ne crea uno nuovo lì dentro. Il PDF del rapportino ha la riga Progetto · Intestato a.
- **Il codice del progetto si impara.** Le prime volte si scrive a mano; dopo due o tre codici Wisper capisce la forma
  da solo e propone il successivo (ED-001, ED-002 → ED-003; riconosce anche il codice della commessa e l'anno dentro il
  codice), sempre cambiabile. Due progetti dello stesso cliente non possono avere lo stesso codice. Col database vuoto,
  il primo progetto nato insieme a una commessa nuova chiede il codice subito, non al salvataggio del rapportino.
- **Tutte le funzioni si spengono**, anche Clienti, Commesse, Ore e rapportini e Amministrazione. Quelle che dipendono
  da altre le seguono e il foglio di conferma lo dice prima ("Si spengono anche: Progetti, Collaboratori esterni");
  riaccendendo Progetti si riaccende anche Commesse. Con Amministrazione spenta al titolare resta la pagina Funzioni per
  riaccenderla; con tutto spento l'app dice "Nessuna funzione accesa". I dati restano sempre.
- **Aggiornamenti annunciati dal NAS.** Ogni 10 minuti il NAS legge l'elenco firmato delle versioni su GitHub e, quando
  cambia, lo dice alle app in silenzio: in ogni risposta (anche dalla porta Google) e su un "campanello" che l'app tiene
  aperto finché è aperta e in ufficio, e che suona appena c'è la versione nuova. Le app non controllano più da sole ogni
  ora: scaricano solo quando il NAS lo dice, con gli stessi controlli di prima (firma dell'elenco, impronta, firma
  dell'APK). Il telefono installa quando l'app è dietro da un minuto e non c'è un rapportino a metà. Un'app chiusa e
  fuori casa lo sa al primo contatto col server. Chi ha la 1.0.0 arriva alla 1.1.0 col controllo di prima, una volta.
- **Trovato strada facendo**: la risposta di Amministrazione › Sistema ha già un suo campo "versioni" (i dispositivi e
  le loro versioni), e l'annuncio lo copriva; ora no, e le app considerano annuncio solo quello col giro.

**Prove.** Server 640 (nuove: progetti, regola dei codici con 25 casi uguali per server e telefono, pulizia, avvisi):
636 passano; 4 (ricorrenze, Nascondi per 30 giorni, da approvare, Dashboard del titolare) falliscono solo fra mezzanotte
e l'una, uguali sul codice della 1.0.0: dipendono dall'ora della prova, non da questa versione;
computer 316, giro dei progetti in Edge senza finestra 14 passi su 14 (anche il primo giorno col database vuoto), gli
altri 11 giri cliccati tutti passati, `dotnet build` senza avvisi; telefono 403, anche col server di prova acceso.
Il campanello provato con l'exe vero e sull'emulatore: una versione nuova annunciata, un controllo solo. Sul NAS: server
0.12.0 acceso, migrazione 9 fatta (con la sua copia); pubblicata la release, il NAS ha letto "telefono 1.1.0 (10),
computer 1.1.0" e il campanello e le risposte del server (anche quelle di errore) la annunciano. I telefoni e i computer
con la 1.0.0 la prendono col controllo di ogni ora, l'ultima volta. Non provata: l'installazione vera di un aggiornamento
annunciato dal NAS (si vedrà con la prossima versione dopo questa).

![Wisper Ufficio: la pagina Progetti](docs/diario/1-1-0/computer-progetti.png)
![Il rapportino sul computer: commessa e progetto](docs/diario/1-1-0/computer-rapportino-progetto.png)
![Spegnere Commesse: il foglio dice cosa si spegne con lei](docs/diario/1-1-0/computer-funzioni-spegni.png)
![Sul telefono: il progetto nel rapportino](docs/diario/1-1-0/telefono-rapportino-progetto.png)
![Sul telefono: nuovo progetto col codice proposto](docs/diario/1-1-0/telefono-progetto-nuovo.png)
![Sul telefono: la scheda del progetto](docs/diario/1-1-0/telefono-progetto-scheda.png)

<a id="v1-0-0"></a>
## 3 novembre 2026 · 1.0.0 · Il gestionale entra in uso: la sera del cambio

**Perché.** Tutte e nove le fasi erano costruite, i dati veri già sul NAS, Google e il portale collegati. Restava la
sera in cui Manuel passa davvero dal foglio al server.

**Cosa è successo.**

- Il foglio di stasera confrontato coi dati copiati il giorno prima: zero differenze, nessuna copia da rifare.
- Gli account: Manuel come titolare, Andrea come secondo titolare con tutti i permessi. Le password le hanno scritte
  loro, in una finestra sul computer di Andrea.
- Telefono e computer alla **1.0.0**. Sul telefono di Manuel la versione nuova è entrata via cavo, al posto della
  0.4.0 e con la stessa firma; Manuel è entrato con email e password.
- Il ponte acceso: un dispositivo rimasto alla versione vecchia scrive nel server, attraverso lo script del foglio.
- La release [v1.0.0](https://github.com/postagaspa-star/wisper/releases/tag/v1.0.0) pubblicata: il computer si
  aggiorna da solo e la prima volta entra inquadrando col telefono il QR che mostra (Menu › Collega un computer), oppure
  con email e password.

<a id="dati-veri"></a>
## 3 novembre 2026 · gestionale, server 0.11.2 · I dati veri sono nel server sul NAS

**Perché.** Andrea: "non li puoi inserire tu i dati, prendendo quelli della versione che già usa?". Sì: il NAS prende
da solo il foglio e i file di Drive. E siccome Manuel in questi giorni non usa Wisper, la copia si è fatta subito invece
che la sera del cambio.

**Cosa cambia.**

- Prima una prova generale sul NAS, in un contenitore usa e getta che non vede i dati del server: tutto torna, poi la
  cartella della prova si cancella.
- Poi la copia vera: server fermato, i dati di prima messi da parte (non si cancellano), il foglio in Excel, i
  rapportini con le loro firme e foto, clienti, commesse, spese e impostazioni dentro il server, che si riaccende. Il
  controllo dice **Tutto torna**: ogni rapportino, ora, chilometro ed euro, per mese e per cliente, uguale al foglio.
  Ci vuole circa un minuto.
- Un solo file non è passato: la firma di una bozza della prima versione, che su Drive sta fuori dalla cartella di
  Wisper. Resta su Drive col suo collegamento.
- Il ponte resta spento: le app di oggi scrivono ancora nel foglio. La sera del cambio, prima di tutto, il server
  confronta il foglio con i suoi dati; se qualcuno ha scritto nel frattempo, la copia si rifà.
- Andrea sarà il secondo titolare, con tutti i permessi, creato subito dopo Manuel.

<a id="collegati"></a>
## 2 novembre 2026 · gestionale, server 0.11.2 · Foglio, portale ed email collegati sul Google vero

**Perché.** Andrea ha incollato lo script nuovo nel foglio vero, ha pubblicato lo script del portale e la pagina dei
clienti su Netlify. Restava da collegare tutto al server sul NAS, e da controllare che funzionasse davvero.

**Cosa cambia.**

- Il server sul NAS parla con lo script del foglio e con quello del portale. Una richiesta come quella di un'app nuova
  va dal foglio al NAS e torna in circa 5 secondi. Le app di oggi scrivono ancora nel foglio: il ponte si accende solo
  la sera del cambio.
- **Le email non partivano.** Il progetto del foglio aveva l'elenco dei permessi scritto a mano (`appsscript.json`) e
  lì mancava quello per mandare email. Tolto l'elenco, Google ricava i permessi dal codice; dopo `autorizza` e una
  nuova versione il postino risponde (100 email al giorno).
- L'indirizzo della pagina del portale sta nel `.env` del NAS (`WISPER_PORTALE_INDIRIZZO`), come gli altri indirizzi.
  All'avvio il server lo scrive nelle impostazioni se lì è vuoto: il database nuovo della sera del cambio lo ritrova
  da solo, senza che nessuno debba riscriverlo.

**Prove.** Server 630, comprese quelle nuove sull'indirizzo del portale: scritto in un database nuovo, lasciato stare
se c'è già, ignorato se non è un indirizzo https. Sul Google vero, con richieste che non cambiano niente: lo stato della
porta, il giro dal foglio al NAS e ritorno, la pagina del portale che mostra il nome dello studio arrivato dal NAS.

<a id="senza-mani"></a>
## 2 novembre 2026 · gestionale, server 0.11.1 · Su Google si incolla un file solo, il resto lo fa il NAS

**Perché.** Le istruzioni per mettere in funzione la porta Google e la sera del cambio chiedevano ad Andrea di
copiare segreti fra il NAS e le proprietà dello script, di lanciare programmi sul NAS, di scaricare il foglio in Excel
e di dare il codice di Wisper. Andrea: "non bisognava cambiare solamente Code.gs? E non si può fare tutto più
semplice?".

**Cosa cambia.**

- Lo script del foglio si incolla **in un file solo** (Code, Ponte e Porta insieme), con dentro un invito: alla prima
  chiamata del NAS lo script impara da solo il segreto, e nessuno deve più scriverlo nelle proprietà.
- Il ponte per le app vecchie (`PONTE_PORTA`) lo accende e lo spegne il NAS.
- La sera del cambio il foglio in Excel e i file di Drive li prende il NAS col segreto: niente download a mano e
  niente codice da dare.
- Ad Andrea su Google resta incollare il file, fare una nuova versione e copiare una volta l'indirizzo dello script.

**Prove.** Script 92, server 626, compreso il giro della sera del cambio contro il finto Google: il segreto imparato
dall'invito, il foglio in Excel e i 5 file arrivati dal postino, l'importazione che torna, il ponte acceso e spento.

<a id="gestionale-qr"></a>
## 2 novembre 2026 · gestionale · Il computer entra col telefono, inquadrando un QR

**Perché.** Sul gestionale un computer nuovo doveva scrivere a mano l'indirizzo dello script Google (lungo e segreto)
e poi email e password, e l'email col file di collegamento della 0.4.0 non c'era più. Andrea: "quando scarichi l'app
da pc ti appare un QR code, e da telefono al posto di inserire la mail a cui inviare un codice o roba simile appare una
telecamera dove devi inquadrare il codice qr del pc, un po' come fa WhatsApp per collegare più dispositivi". Prima la
ricerca (WhatsApp e Signal, la guida Android sui permessi, gli attacchi ai QR di accesso), poi il prototipo
(`docs/prototipo/Collega-QR.html`) e l'accordo (`docs/gestionale/collega-qr.md`).

**Cosa cambia.**

- **Sul computer** la pagina di accesso si apre sul codice, con tre passi accanto: apri Wisper sul telefono, nel menu
  tocca Collega un computer, inquadra questo codice. Il codice cambia ogni 2 minuti; dopo 5 si ferma e chiede "Mostra
  un codice nuovo". "Entra con email e password" resta, un tocco più in basso.
- **Sul telefono** la voce Collega un computer apre la fotocamera. Letto il codice, il riquadro diventa giallo e un
  foglio chiede: "Collegare questo computer? Entrerà come Manuel Gasparotto, con i tuoi stessi permessi." Toccato
  Collega, il telefono dice "UFFICIO-PC è entrato" e nello stesso momento il computer apre la Dashboard.
- **Sicurezza**: nel codice ci sono solo un numero a caso e la chiave pubblica del computer. Quello che il server manda
  al computer (la chiave d'accesso e l'indirizzo Google) è cifrato per lui: chi fotografa il codice non ottiene niente.
  Il computer lo ritira solo dalla rete dell'ufficio, e la conferma sul telefono col nome del computer ferma chi fa
  inquadrare un codice suo. Il computer collegato si scollega da Amministrazione › Dispositivi come gli altri.
- **La prima volta il computer deve essere in ufficio**, sulla rete del server: prima non sa dove sta Google. Fuori
  ufficio la pagina lo dice ("Il server dell'ufficio non risponde") e propone email e password.
- **Trovato strada facendo**: il telefono riusava connessioni che il server aveva già chiuso (il server le chiude
  dopo 5 secondi di silenzio, il telefono le controllava dopo 10), e una scrittura fatta dopo una pausa di 5-10
  secondi poteva cadere. Ora il telefono le butta dopo 4 secondi: vale per tutte le richieste, non solo per il QR.
  E siccome l'app ora chiede la fotocamera, le foto fatte con la fotocamera del telefono (scontrini, fogli firmati,
  ticket, mezzi, documenti) chiedono il permesso la prima volta invece di chiudere l'app.

**Prove.** Server 625; computer 305 (13 sul codificatore del QR, che ZXing legge in 80 codici su 80, uno per ogni
versione e maschera); giro del QR in Edge senza finestra 8 passi su 8, giro principale del computer 26 su 26; telefono
382 col server di prova acceso, nessuna saltata. Sull'emulatore la fotocamera ha letto un QR vero disegnato dalla
pagina e il computer è entrato. Non provati: una fotocamera vera davanti a uno schermo vero, la finestra di Wisper
Ufficio (la pagina è provata in Edge), Google vero.

![Wisper Ufficio: la pagina di accesso col codice](docs/diario/2026-11-02-qr-pc-codice-chiaro.png)
![Il telefono chiede conferma col nome del computer, tema scuro](docs/diario/2026-11-02-qr-tel-conferma-scuro.png)
![Il computer è entrato](docs/diario/2026-11-02-qr-pc-entrato-chiaro.png)
![Sul telefono: UFFICIO-PC è entrato](docs/diario/2026-11-02-qr-tel-entrato-chiaro.png)

<a id="budget-0-3-6-1"></a>
## 2 novembre 2026 · 0.4.0, computer 0.3.6.1 · Un budget salvato non si divide più per mille

**Perché.** Su Wisper Ufficio 0.3.6 (dentro la 0.4.0 che usa Manuel) un budget di 2.500 € aperto e salvato senza
toccarlo diventava 2,50 €: il campo veniva riempito con "2.500", e il programma rileggeva il punto come virgola. Lo
stesso per il budget calcolato da ore × prezzo e per i numeri grandi delle schede di clienti e impostazioni. Il
telefono non aveva il difetto. Andrea ha voluto la correzione "non con una nuova versione, sempre nella stessa".

**Cosa cambia.** I campi da modificare si riempiono senza il punto delle migliaia ("2500", "0,9"), e "2.500" scritto
a mano vale 2500, come sul telefono. Il programma resta la 0.3.6 a schermo e su GitHub resta la 0.4.0: dentro il
numero è 0.3.6.1, perché l'aggiornamento automatico scarica solo un numero più alto. Il codice è sul ramo
`feat/rapportini-manuali`, quello della 0.4.0.

**Prove.** Sul foglio finto: 2.500 € salvato senza toccarlo resta 2500; 100 ore × 42 €/h scrive 4200; "3.000" scritto
a mano salva 3000 e ricalcola 71,4 ore. Prove dei conti 23 e dello script 53 della 0.4.0, tutte passate. Costruiti APK
(uguale, codice 8, stessa firma) ed exe 0.3.6.1, firmato l'elenco degli aggiornamenti.

Pubblicata il 2 novembre 2026 sera nella release [v0.4.0](https://github.com/postagaspa-star/wisper/releases/tag/v0.4.0):
i computer con Wisper Ufficio si aggiornano da soli entro un'ora.

---

<a id="gestionale-fase-8"></a>
## 1 novembre 2026 · gestionale, fase 8 · Integrazioni, impostazioni e controlli finali

**Perché.** Ottava e ultima fase del gestionale (`docs/specifiche-stgm.md`, moduli 16, 17 e 18): mettere in ordine
quello che Wisper scambia col mondo fuori, le impostazioni dello studio e i controlli da fare prima della sera del
cambio, quando Manuel passerà dal foglio Google al server sul NAS. L'accordo (`docs/gestionale/fase8.md`) e il prototipo
(`docs/prototipo/Gestionale-fase8.html`) erano del 22 ottobre e davano per scontati Tailscale o un dominio a pagamento;
il 1° novembre sono stati adattati alla porta Google scelta il 31 ottobre e alla regola "tutto gratuito" (§0
dell'accordo, vale sopra al resto).

**Cosa cambia.**

- **Integrazioni**: una pagina con tutti i collegamenti (porta Google, portale, link che scade, ponte per le versioni
  vecchie, verifica della partita IVA, aggiornamenti delle app, calendario, copie fuori casa), per ognuno lo stato,
  l'ultimo controllo, cosa esce dal NAS e quanto costa: tutto 0 €. Quello che non va sta in cima, in rosso, con
  **Prova adesso**. I controlli girano da soli e tengono la storia.
- **Calendario in altre app**: gli impegni di Wisper in Google Calendar, Outlook o nel telefono (con ICSx5) da un
  indirizzo privato per persona, che si toglie quando si vuole. Il telefono lo legge in casa; leggerlo anche fuori casa
  passa dallo script del portale ed è spento di base, perché farebbe passare gli appuntamenti da Google.
- **Cerca dentro i file**: la ricerca dei documenti guarda anche dentro PDF, Word, Excel e disegni DXF e mostra il pezzo
  di testo trovato ("…la verifica dell'impianto di terra…"). Le scansioni senza testo lo dicono.
- **Importa ed esporta**: clienti e fornitori da un file CSV o Excel (anche condiviso dal telefono), con le righe
  nuove, quelle già presenti e quelle da sistemare prima di salvare; **Esporta tutto** fa uno ZIP con tutti i dati, solo
  dalla rete di casa e solo per il titolare.
- **Impostazioni**: impostazioni generali, numerazioni (il formato del codice commessa senza ricodificare niente),
  notifiche dello studio, dati dello studio col logo e una riga in fondo ai PDF (senza logo i PDF restano identici a
  prima), **Funzioni accese** per spegnere un modulo che non si usa, e ognuno sceglie i suoi riquadri della Dashboard.
- **Copie e sicurezza**: la copia può essere cifrata (con una chiave da scrivere su carta: senza chiave la copia fuori
  casa non parte, così non va mai in chiaro su Drive), ogni 30 giorni il server prova da solo la copia (integrità, righe,
  impronte dei file, impronta della copia su Drive) e ogni 90 giorni chiede di segnare un ripristino provato a mano.
  **Scollega tutti** fa uscire ogni dispositivo in una volta. Stato del sistema mostra spazio, versioni e collegamenti.
- **Lista di controllo**: 77 righe, una per ogni prova da fare prima del cambio (automatiche, a mano, sul telefono vero,
  la sera del cambio, il ritorno indietro), con chi, quando e una nota; in cima lo stato del cambio (prima del cambio,
  prova generale, cambio fatto, ritorno chiuso), che cambia solo il titolare.
- **Più veloce**: con dieci anni di dati finti realistici (131 MB) la Dashboard sul NAS risponde in circa 0,4 secondi
  (prima della fase 1,3 sul PC) ed Esporta tutto in circa 10 secondi (prima 76): le letture ripetute per ogni riga ora si
  fanno una volta sola. Prima di toccare il codice è stata salvata una fotografia di 64 risposte della Dashboard (cinque
  utenti, tre profili di dati finti, quattro date): dopo, i numeri sono identici.
- Server 0.11.0 (schema 8). Lo script del foglio ha un'azione nuova per controllare la copia su Drive.

**Ancora spento.** Restano "Da configurare" finché non si fanno i passi a mano: lo script nuovo incollato nel foglio,
lo script del portale, la pagina del portale su Netlify. La sera del cambio non è ancora stata fatta.

Prove: server 613, script del foglio e del portale 88, computer 282, pagina del portale 22, telefono 366 (anche contro il
server di prova, due giri), tutte verdi; tutte le giornate simulate; i nove giri cliccati su Wisper Ufficio, dalla fase 1
alla 8; la prova di carico sul NAS, in un contenitore a parte con dati finti, dentro tutti i limiti dell'accordo.
Rifacendo le prove sono venuti fuori e sono stati sistemati alcuni errori veri: spegnere la funzione Portale non spegneva
davvero il portale, la chiave della copia cifrata si vedeva storpiata (si sarebbe scritta sbagliata sulla carta), due
pagine nuove venivano rifiutate dal controllo delle impostazioni, chi poteva solo vedere l'amministrazione poteva
cambiare il logo. Non provati: Google e Netlify veri, i calendari aperti a mano in Outlook e in ICSx5, le finestre Salva
e Apri di Windows nel programma, un telefono vero.

<p>
<img src="docs/diario/2026-11-01-gest8-tel-integrazioni-scuro.png" width="220" alt="Telefono: Integrazioni, tema scuro, la verifica della partita IVA in errore con Prova adesso">
<img src="docs/diario/2026-11-01-gest8-tel-documenti-terra.png" width="220" alt="Telefono: la ricerca trova la parola dentro il testo di un verbale">
</p>

<img src="docs/diario/2026-11-01-gest8-pc-integrazioni.png" width="720" alt="Wisper Ufficio: Integrazioni, ogni collegamento con stato, ultimo controllo, cosa esce dal NAS e costo">

<img src="docs/diario/2026-11-01-gest8-pc-lista-controllo.png" width="720" alt="Wisper Ufficio: la Lista di controllo prima del cambio">

<a id="gestionale-fase-7"></a>
## 1 novembre 2026 · gestionale, fase 7 · WhatsApp e comunicazioni, portale clienti

**Perché.** Settima fase del gestionale (`docs/specifiche-stgm.md`, moduli 14 e 15). Lo studio scrive ai clienti tutti
i giorni (promemoria, rapportini da firmare, pagamenti) e i clienti chiedono le stesse cose al telefono: a che punto è
la richiesta, mi rimandi la fattura. L'accordo (`docs/gestionale/fase7.md`) e il prototipo
(`docs/prototipo/Gestionale-fase7.html`) erano pronti dal 22 ottobre; il 1° novembre il portale è stato ripensato per
la porta Google scelta il 31 ottobre e per la regola "tutto gratuito" (§0 dell'accordo).

**Cosa cambia.**

- **WhatsApp e comunicazioni**: Wisper prepara il messaggio (promemoria dell'appuntamento, rapportino da firmare,
  promemoria di pagamento) dai modelli, con i segnaposti riempiti; "Apri WhatsApp" apre la chat del cliente col testo
  già scritto, e al ritorno Wisper chiede "L'hai mandato?". Niente invii automatici: decide sempre la persona. Prima
  del primo messaggio si chiede se il cliente ha detto di sì a WhatsApp. **Da mandare** propone ogni giorno quello che
  c'è da scrivere; lo **Storico** tiene messaggi, email, telefonate e note per cliente, commessa e ticket. I numeri
  scritti in tutti i modi (spazi, +39, 0039, fissi, esteri) diventano il numero giusto per WhatsApp con le stesse
  regole su server, telefono e computer (17 casi in `server/prove/casi-whatsapp.json`).
- **Notifiche**: una campanella per ognuno, con le novità che lo riguardano (richieste dal portale, file dei clienti,
  preventivi accettati); sul telefono anche come notifica di sistema, se la vuole.
- **Portale clienti**: il referente del cliente entra col suo indirizzo email e un codice (o un link), e vede solo
  quello che lo studio ha pubblicato per la sua azienda: preventivi da accettare (scegliendo le voci facoltative),
  rapportini da firmare col dito, fatture, documenti e le sue richieste d'intervento, a cui può rispondere e
  allegare file. Lo studio decide per ogni cliente chi entra, cosa vede e cosa si pubblica da solo; ogni cosa
  pubblicata si toglie con un tocco. **Da guardare** raccoglie quello che arriva dai clienti; il registro degli
  accessi non si cancella. Un preventivo accettato o un rapportino firmato nel portale lo dice anche nel PDF.
- **Come arriva su internet, a 0 €**: la pagina del portale è un file fisso, senza dati dentro, da pubblicare su
  Netlify (gratis, anche per uno studio). I dati passano da uno **script Google a parte**, solo per il portale, con un
  segreto suo: così l'indirizzo dello script del foglio non finisce mai in una pagina vista dai clienti. Il NAS va a
  prendere le richieste come fa già con la porta Google: a casa non si apre niente. Scartata la pagina servita
  direttamente da Google, che ci mette sopra la fascia grigia "creata da un altro utente". Quello che si perde: dietro
  Google l'indirizzo IP del cliente non arriva, quindi né il registro né la prova della firma lo hanno (la firma
  resta valida con nome, data, ora e impronta del documento). Niente cookie: si esce chiudendo la scheda.
- Dashboard (riquadri Dal portale e Da mandare oggi), permessi (moduli Comunicazioni e Portale) e Amministrazione
  (impostazioni del portale e delle comunicazioni) sanno delle cose nuove. Server 0.10.0, non ancora sul NAS.

**Ancora spento.** Il portale resta "Non collegato" finché non si fanno i passi a mano: creare lo script Google del
portale, pubblicare la pagina su Netlify, scrivere due righe nella configurazione del NAS. WhatsApp, storico,
modelli e notifiche funzionano anche senza.

Prove: server 534, script del foglio e del portale 85, computer 251, pagina del portale 22, telefono 332 (anche contro
il server di prova, due giri), tutte verdi; tutte le giornate simulate (anche Capodanno 2027 e il 29/02/2028) e gli otto
giri cliccati su Wisper Ufficio, dalla fase 1 alla 7 più la porta Google. La pagina del portale è stata provata con
Edge senza finestra contro il server di prova vero (23 passi: accetta il preventivo, firma il rapportino, manda una
richiesta urgente con la foto, scarica il PDF, testi cattivi, link scaduto, portale spento); sul telefono, sull'emulatore,
il promemoria a un cliente con WhatsApp aperto nel browser, l'invito di un referente, il file del cliente accettato,
togli e ripubblica, le risposte nel portale. Rifacendo le prove sono venuti fuori e sono stati sistemati un difetto
vecchio (la scheda Incarichi della commessa sul computer non si apriva) e uno nuovo (una risposta nel portale rimandata
dal telefono dopo una caduta di rete poteva arrivare due volte). Non provati: Google e Netlify veri, WhatsApp vero (sul
computer avrebbe aperto il browser, sull'emulatore non c'è), la notifica di sistema ogni 15 minuti, un telefono vero.

<p>
<img src="docs/diario/2026-11-01-gest7-tel-whatsapp.png" width="220" alt="Telefono: il promemoria dell'appuntamento pronto per WhatsApp">
<img src="docs/diario/2026-11-01-gest7-tel-portale-scuro.png" width="220" alt="Telefono: Portale clienti, Da guardare, tema scuro">
</p>

<img src="docs/diario/2026-11-01-gest7-pc-da-mandare.png" width="720" alt="Wisper Ufficio: Comunicazioni, Da mandare">

<img src="docs/diario/2026-11-01-gest7-pc-cliente-portale.png" width="720" alt="Wisper Ufficio: un cliente nel portale, chi entra e cosa è pubblicato">

<img src="docs/diario/2026-11-01-gest7-portale-preventivo.png" width="720" alt="Il portale clienti: il preventivo da accettare con le voci da scegliere">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="gestionale-fase-6"></a>
## 31 ottobre 2026 · gestionale, fase 6 · Persone, mezzi e attrezzature, collaboratori esterni

**Perché.** Sesta fase del gestionale (`docs/specifiche-stgm.md`, moduli 10, 13 e 16). Lo studio deve sapere chi c'è
e chi è in ferie, quanto costa davvero un'ora di lavoro, che mezzo e che strumenti ha ognuno e se la taratura vale, e
cosa ha affidato alle imprese e ai professionisti esterni. Prima la ricerca (`docs/gestionale/ricerca-fase6.md`) e il
prototipo (`docs/prototipo/Gestionale-fase6.html`), poi il codice, sempre uguale su telefono e computer.

**Cosa cambia.**

- **Persone e risorse umane**: l'organico (anche chi non entra in Wisper), la scheda con tre livelli di dati (di
  lavoro, personali, riservati: questi solo col permesso apposta, e chi li apre resta scritto in un registro che non
  si cancella), competenze e formazione con le scadenze, visite mediche (solo il giudizio e le date), DPI consegnati
  con la firma, documenti personali. **Ferie e permessi** si chiedono anche dal telefono senza rete, col saldo dal
  cedolino e quanti giorni restano; chi approva vede le anomalie e può annullare. Le presenze del mese si ricavano da
  ore, rapportini e assenze, senza timbrature. Wisper non fa le buste paga: il programma del consulente è "Non
  collegato".
- **Il costo orario** viene dalla persona, con la sua storia: le ore e i rapportini nuovi prendono il costo del giorno
  in cui si lavora, quelli vecchi non cambiano. Oggi non cambia nessun conto, perché il costo del titolare resta vuoto.
- **Mezzi e attrezzature**: i veicoli diventano mezzi (dello studio o auto di una persona) con scadenze, km, guasti con
  la foto e costi; con un mezzo dello studio la trasferta non dà rimborso km, e il carburante segna i km del
  contachilometri. Strumenti di misura e DPI hanno la **taratura** sempre in vista: uno scaduto nel rapportino si usa
  solo confermando (e resta scritto), uno non conforme non si sceglie mai. Prestiti e restituzioni anche senza rete.
- **Collaboratori esterni**: un collaboratore è un fornitore con la scheda in più; i documenti (DURC, visura) dicono se
  è in regola. **Incarichi** per commessa a corpo o a ore, con avanzamento, lettera d'incarico dal modello, fatture
  ricevute collegate e quanto resta da fatturare e da pagare; il loro costo entra nella commessa. Chi vuole può entrare
  in Wisper col ruolo "Esterno": vede solo le sue commesse e i suoi compensi.
- Dashboard, permessi (con la colonna Esterno) e Amministrazione (impostazioni di persone, mezzi e collaboratori, tipi
  di formazione) sanno delle cose nuove. Server 0.9.0 sul NAS, ancora vuoto.

**Anche in questo giro.** La **porta Google**: telefono e computer possono arrivare al server del NAS passando dallo
script Google, senza aprire niente sul router (in casa vanno diretti al NAS); è costruita e provata solo sul Google
finto, non è accesa. Le prove ora passano in qualunque giorno, anche di sabato o a cavallo del cambio d'ora: rifacendole
così sono venuti fuori e sono stati sistemati tre difetti del server (le copie cancellate un giorno prima col cambio
d'ora, il saldo del cedolino con due righe nello stesso giorno, i dati di esempio che nel 2027 non tornavano) e uno
delle prove.

Prove: server 485, script del foglio 78, computer 230, telefono 290 (anche contro il server di prova), tutte verdi; i
sette giri cliccati su Wisper Ufficio (dalla fase 1 alla 6 e la porta Google) passano tutti. Sul telefono, contro il
server di prova: la spesa di carburante col Doblò segna i km sulla scheda del mezzo, la lettera d'incarico finisce
nell'archivio legata all'incarico, le impostazioni della taratura si salvano. Non provati: le foto vere della fotocamera
nel guasto, la firma del DPI su un telefono vero, la porta Google su quello vero.

<p>
<img src="docs/diario/2026-10-31-gest6-tel-incarico.png" width="220" alt="Telefono: la pagina dell'incarico">
<img src="docs/diario/2026-10-31-gest6-tel-strumenti-scuro.png" width="220" alt="Telefono: gli strumenti con lo stato della taratura, tema scuro">
</p>

<img src="docs/diario/2026-10-31-gest6-pc-strumento.png" width="720" alt="Wisper Ufficio: lo strumento con la taratura scaduta">

<img src="docs/diario/2026-10-31-gest6-pc-ferie-scuro.png" width="720" alt="Wisper Ufficio: ferie e permessi, tema scuro">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="gestionale-fase-5"></a>
## 22 ottobre 2026 · gestionale, fase 5 · Documenti, ticket e assistenza

**Perché.** Quinta fase del gestionale (`docs/specifiche-stgm.md`, moduli 11 e 12). Le specifiche chiedono di
collegarsi agli archivi che lo studio ha già, senza copiare i file, e di gestire guasti, verifiche e manutenzioni sugli
impianti dei clienti fino al rapportino firmato e alla fattura. Prima la ricerca (`docs/gestionale/ricerca-fase5.md`)
e il prototipo (`docs/prototipo/Gestionale-fase5.html`), poi il codice.

**Cosa cambia.**

- **Documenti**: un documento è un file sul NAS **oppure un collegamento** a OneDrive, SharePoint, Google Drive o a una
  cartella dello studio (si incolla sul computer, o arriva dal Condividi del telefono); Wisper riconosce il tipo e non
  copia niente. Revisioni (la vecchia resta da consultare), categorie, documenti da approvare, chi vede cosa, ricerca,
  "manda per email" con una copia di quello che si è mandato. I documenti di prima entrano nell'archivio con lo stesso
  indirizzo. Sfogliare OneDrive e Drive da dentro Wisper e il link per i clienti: "non collegato".
- **Scadenze documentali** con promemoria (verifiche degli impianti di terra, dichiarazioni, polizze), con le
  periodicità proposte da confermare con Manuel; lettere e contratti dai modelli, con i testi modificabili e
  l'impaginazione che resta quella dei PDF di oggi.
- **Ticket**: la richiesta d'intervento su un cliente e un impianto; la priorità nasce da due domande ("L'impianto è
  fermo?", "Per quando?") e si può cambiare. Il ticket non duplica niente: l'intervento è un'attività del calendario,
  ore e spese sono quelle della fase 3, si chiude col **rapportino di sempre** in tre passi con la firma del cliente.
  Sul telefono si apre e si chiude **anche senza rete**: ticket, foto, rapportino e firma restano in coda e partono da
  soli, una volta sola.
- **Chiudere un ticket** vuol dire scegliere come si fattura: una riga per l'intervento, con gli altri rapportini, nel
  contratto, o non si fattura (col motivo). La riga entra in Da fatturare sotto lo stesso blocco della fase 4: né il
  ticket né i suoi rapportini possono finire in due fatture. Chiudono titolare e amministrazione; il collaboratore lo
  segna risolto.
- **Contratti di assistenza** con il loro canone (che si fattura come le scadenze di pagamento) e le visite periodiche
  che fanno nascere da sole i ticket programmati; statistiche dei tempi di presa in carico e di chiusura.
- I file si caricano in byte fino a 50 MB; sotto 2 GB liberi sul NAS si fermano i documenti nuovi ma foto e firme dei
  rapportini passano sempre. Server 0.8.0 sul NAS, ancora vuoto, con la copia fatta prima delle tabelle nuove.

Prove: server 387, script del foglio 65, telefono 229, computer 193, tutte verdi; il giro senza rete (ticket nuovo,
foto, rapportino firmato, risolto) provato sull'emulatore in modalità aereo; il giro dal ticket urgente alla riga in Da
fatturare cliccato in 15 passi su Wisper Ufficio contro il server di prova. Non provati: trascinare file dal computer,
aprire davvero i collegamenti esterni, un caricamento da 50 MB su rete lenta.

<p>
<img src="docs/diario/2026-10-22-gest5-tel-ticket.png" width="220" alt="Telefono: il ticket urgente">
</p>

<img src="docs/diario/2026-10-22-gest5-pc-chiudi.png" width="720" alt="Wisper Ufficio: chiudere il ticket e scegliere come si fattura">

<img src="docs/diario/2026-10-22-gest5-pc-pianifica.png" width="720" alt="Wisper Ufficio: pianificare l'intervento nel calendario">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="gestionale-fase-4"></a>
## 22 ottobre 2026 · gestionale, fase 4 · Fatture, banche e scadenze

**Perché.** Quarta fase del gestionale (`docs/specifiche-stgm.md`, moduli 08 e 09). Andrea ha deciso il 21/10 che
Wisper **prepara** la fattura e la **emette il programma che Manuel usa già**; l'XML emesso torna in Wisper. La banca
resta uno scadenziario scritto a mano. Prima la ricerca (`docs/gestionale/ricerca-fase4.md`, fonti fiscali e struttura
della fattura elettronica) e il prototipo (`docs/prototipo/Gestionale-fase4.html`), poi il codice.

**Cosa cambia.**

- **Da fatturare**: per cliente, le cose pronte: acconti e saldi delle commesse nate dai preventivi, i rapportini del
  mese (il **fine mese di oggi resta**: "Prepara riepilogo" c'è sempre, e "Prepara la bozza" prende il posto di "Segna
  fatturati"), le spese da riaddebitare, le ore fatturabili.
- **La bozza** fa i conti del perito industriale: compenso, contributo integrativo EPPI 5% (dentro la base IVA), IVA
  22%, ritenuta 20% solo per i clienti sostituti d'imposta (sul compenso senza il contributo), spese anticipate fuori
  da IVA, bollo da 2 € sopra 77,47 € senza IVA. I conti stanno solo nel server, provati su 30 casi che telefono e
  computer ritrovano al centesimo. **Finché il commercialista non conferma le regole**, Fatturazione lo dice in cima a
  ogni pagina e i numeri hanno la pillola "Da confermare".
- **Mai due volte la stessa cosa in fattura**: ogni rapportino, acconto o spesa sta in una fattura sola, e lo
  garantisce il database stesso (provato anche con due richieste nello stesso istante). Torna libero solo scartando la
  bozza o con una nota di credito.
- **Passa al programma**: un prospetto con "Copia" su ogni campo (va bene con qualunque programma) e un XML da
  completare per i programmi che lo importano, col numero BOZZA e il nome che dice di non inviarlo. Wisper non inventa
  mai un numero di fattura; l'invio allo SDI è segnato "non collegato".
- **Il ritorno dell'XML** (anche firmato `.p7m` o in uno `.zip`, anche dal Condividi del telefono): Wisper propone a
  quale bozza appartiene (Sicura, Probabile, Diversa, Senza bozza) e niente cambia finché non si conferma riga per riga.
  Con l'XML la fattura diventa emessa col numero vero e i rapportini passano a FATTURATO. Le fatture fatte fuori da
  Wisper si collegano a quello che era da fatturare. Le fatture dei fornitori diventano pagamenti da fare.
- **Note di credito**: liberano quello che stornano; se il cliente aveva già pagato, la fattura e la Dashboard dicono
  quanto va restituito o compensato.
- **Banche e scadenze**: scadenziario per giorno con il saldo previsto (prudente: gli incassi scaduti non contano) e i
  giorni sotto soglia in rosso; incassi e pagamenti anche in parte; tributi e F24 anche ricorrenti; previsto,
  registrato e verificato in banca sempre distinti. Estratti conto e banca: "non collegato".
- Server 0.7.0 sul NAS, ancora vuoto, con la copia fatta prima delle tabelle nuove.

Trovati e corretti prima del commit: l'XML da completare, se importato per sbaglio, veniva preso per una fattura emessa
(ora si scarta con una frase chiara, e il numero BOZZA non si può scrivere neanche a mano); dopo una nota di credito su
una fattura pagata nessuno avvisava dei soldi da restituire.

Prove: server 280, script del foglio 65, telefono 206, computer 179, tutte verdi; il giro intero da fatturare → bozza →
programma → XML di ritorno → incasso in parte → nota di credito cliccato sull'emulatore e, in 13 passi, su Wisper
Ufficio contro il server di prova; conti rifatti a mano sulle schermate. Da fare prima di usarla con fatture vere:
confermare le regole col commercialista, sapere quale programma usa Manuel, controllare l'XML con lo schema ufficiale.

<p>
<img src="docs/diario/2026-10-22-gest4-tel-dafatturare.png" width="220" alt="Telefono: da fatturare per cliente">
</p>

<img src="docs/diario/2026-10-22-gest4-pc-passa.png" width="720" alt="Wisper Ufficio: passa al programma, i campi da copiare">

<img src="docs/diario/2026-10-22-gest4-pc-importa.png" width="720" alt="Wisper Ufficio: l'XML di ritorno e l'abbinamento da confermare">

<img src="docs/diario/2026-10-22-gest4-pc-fattura.png" width="720" alt="Wisper Ufficio: la fattura annullata con i soldi da restituire">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="gestionale-fase-3"></a>
## 22 ottobre 2026 · gestionale, fase 3 · Ore, timer, spese e trasferte

**Perché.** Terza fase del gestionale (`docs/specifiche-stgm.md`, moduli 06 e 07). Finora le ore esistevano solo
dentro i rapportini: il lavoro in ufficio, la progettazione e le spese fuori dal cantiere non lasciavano traccia, e il
costo vero di una commessa era più basso del vero. Prima la ricerca e il
[prototipo](https://claude.ai/artifact/DSHQpAQgBEmY2k9GtSA1j6) (`docs/prototipo/Gestionale-fase3.html`), poi il
codice, sul server, sul telefono e sul computer.

**Cosa cambia.**

- **Il rapportino non cambia**: tre passi, firma, PDF, anche senza rete. Le ore senza rapportino sono un modulo corto
  a parte (**Registra ore**): commessa tra le recenti, ore a mezz'ore oppure inizio, fine e pausa, fatturabili o no,
  straordinarie.
- **Il timer**: un tocco per partire, uno per fermare, e si apre la bozza da correggere. Uno per persona, vive sul
  server: sopravvive alla chiusura dell'app e si vede in cima alla Dashboard.
- **La settimana delle ore**: sul computer una griglia con una riga per commessa e una colonna per giorno; una casella
  si scrive solo se non si perde niente (con orari o più righe nello stesso giorno si apre il giorno). Statistiche per
  persona e per commessa: ore, fatturabili, percentuale, costo.
- **Da approvare**: ore, rapportini, spese e trasferte dei collaboratori passano da chi approva, con le cose strane in
  evidenza (13 ore in un giorno, spesa sopra i 200 €, senza scontrino, km diversi dal solito). Respingere chiede
  sempre il motivo, che arriva a chi ha scritto; dopo c'è Annulla. Per Manuel e Andrea non cambia niente: le loro
  cose sono già approvate.
- **Spese e trasferte**, voce nuova del menu: la spesa comincia dalla foto dello scontrino; **A chi va**: al cliente,
  allo studio o mia; "il documento è intestato al cliente" (anticipazione, fuori da IVA nella fattura della fase 4);
  "l'ho pagata io" (finisce tra i rimborsi). La trasferta calcola subito il rimborso km dal veicolo e dalla tabella ACI
  dell'anno; i rimborsi da fare per persona, con "Segna rimborsato".
- **Senza rete non si perde niente**: anche ore e spese, scontrino compreso, vanno nella coda su disco del telefono e
  partono da sole; il server riconosce un invio ripetuto e non fa doppioni.
- **I rapportini già scritti restano identici al centesimo**: le loro spese sono diventate righe di spese senza
  toccare il rapportino. Una prova legge un database di prima col codice della fase 2 e confronta ogni campo, il CSV e
  i soldi della Dashboard.
- **Il costo della commessa** conta anche ore registrate, spese fuori dai rapportini e trasferte; la scheda Costi ora
  scrive il costo orario davvero usato nel conto (prima scriveva quello di oggi in Amministrazione, anche se il conto
  usava quello fissato in ogni rapportino).
- Amministrazione › **Veicoli e rimborso km**; esportazioni per Excel di ore, spese, trasferte e rimborsi, e quelle
  di preventivi e attività che mancavano. Server 0.6.0 sul NAS, ancora vuoto, con la copia fatta prima delle tabelle
  nuove.

Prove: server 172, script del foglio 65, telefono 185, computer 136, tutte verdi; giri cliccati sull'emulatore (anche
in modalità aereo: spesa con scontrino e ore in coda, poi inviate da sole) e, in 14 passi, su Wisper Ufficio contro il
server di prova. Schermate coi dati di esempio. Non provati: trascinare uno scontrino nel programma del computer e le
finestre vere di Windows; il timer nella notte del cambio dell'ora (sbaglia di un'ora).

<p>
<img src="docs/diario/2026-10-22-gest3-tel-ore.png" width="220" alt="Telefono: le ore della settimana col timer">
<img src="docs/diario/2026-10-22-gest3-tel-approvare-scuro.png" width="220" alt="Telefono: da approvare, tema scuro">
<img src="docs/diario/2026-10-22-gest3-tel-trasferta.png" width="220" alt="Telefono: nuova trasferta col rimborso km">
</p>

<img src="docs/diario/2026-10-22-gest3-pc-ore.png" width="720" alt="Wisper Ufficio: la settimana delle ore">

<img src="docs/diario/2026-10-22-gest3-pc-approvare.png" width="720" alt="Wisper Ufficio: da approvare con le anomalie">

<img src="docs/diario/2026-10-22-gest3-pc-spese.png" width="720" alt="Wisper Ufficio: spese del mese, a chi vanno">

<img src="docs/diario/2026-10-22-gest3-pc-costi.png" width="720" alt="Wisper Ufficio: il costo della commessa con ore registrate e spese">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="gestionale-fase-2"></a>
## 22 ottobre 2026 · gestionale, fase 2 · Preventivi, attività e calendario

**Perché.** Seconda fase del gestionale (`docs/specifiche-stgm.md`, moduli 04 e 05). Oggi il preventivo lo fa Manuel
a parte, e quando il cliente accetta la commessa si riscrive da capo in Wisper; gli impegni stanno nella testa o nel
calendario del telefono. Prima la ricerca (`docs/gestionale/ricerca-fase2.md`) e il
[prototipo](https://claude.ai/artifact/SsMoJy36R14bq7fHYAdFEb) (`docs/prototipo/Gestionale-fase2.html`), poi il
codice, sul server, sul telefono e sul computer.

**Cosa cambia.**

- **Preventivi** (PR/2026/013, la numerazione riparte ogni anno): sezioni con subtotali, voci a corpo, a ore o a
  quantità prese dal **listino** dello studio, sconti, scadenza, condizioni e scadenze di pagamento (acconto, a fine
  progetto, saldo). Il conto (imponibile, contributo integrativo EPPI 5%, IVA 22%) lo fa solo il server, provato su
  16 casi che telefono e computer devono ritrovare al centesimo. Le aliquote stanno in Amministrazione › Fisco e
  preventivi e vanno confermate col commercialista.
- **Il preventivo dice da solo cosa chiede la legge** (DL 1/2012 art. 9, L. 124/2017): grado di complessità, voci
  senza prezzo, oneri ipotizzabili, polizza professionale, titoli. Se manca qualcosa lo segna prima dell'invio.
- **Il cliente sceglie**: voci facoltative con la casella e alternative "una di queste"; il totale si aggiorna mentre
  si segna l'accettazione.
- **Dopo l'invio i prezzi non cambiano**: per cambiarli si fa una revisione (rev. 1) e quella prima resta da
  consultare. PDF e invio per email come per i riepiloghi.
- **Accettazione in quattro modi** (firma sul telefono o sul computer, risposta per email, documento firmato, a voce),
  con il nome di chi accetta. Poi **"Crea la commessa"**: cliente, prestazioni, valori, ore e scadenze di pagamento
  passano nella commessa nuova (26ST003) senza riscrivere niente. Provato: PR/2026/012 da 4.291,35 € diventa
  4.867,80 € con la dichiarazione di rispondenza scelta, e la commessa nasce con 5 prestazioni e 3.800 € di contratto.
- **Contratti** (gli incarichi accettati) e **modelli di offerta** per ripartire da un preventivo già fatto.
- **Attività**: mie, della squadra, non assegnate; per commessa o dello studio senza commessa; priorità, scadenza,
  checklist, allegati, promemoria. Raggruppate in Oggi, Prossimi giorni, Più avanti: di un'attività che si ripete si
  vede solo la prossima volta, così l'elenco non si riempie di copie. Cambiando una ricorrenza si sceglie "solo
  questa", "da questa in poi" o "tutte".
- **Calendario** giorno, settimana e mese, con appuntamenti e sopralluoghi; sul computer anche la **pianificazione
  della settimana** per persona, con le attività non assegnate a parte.
- **La Dashboard** aggiunge attività scadute, appuntamenti di oggi, preventivi senza risposta, in scadenza, in bozza
  e accettati senza commessa; ogni riga porta dove si sistema. Il collaboratore vede solo le sue attività e niente
  preventivi.
- Il server sul NAS è aggiornato (versione 0.5.0, ancora vuoto, solo in casa); il database ha fatto da solo la copia
  prima di aggiungere le tabelle nuove.

Prove: server 131, script del foglio 65, telefono 136, computer 99 (con i 16 casi dei preventivi), tutte verdi; il giro
completo preventivo → accettazione → commessa → attività cliccato sull'emulatore e, in 13 passi, su Wisper Ufficio
contro il server di prova. Schermate coi dati di esempio. Da provare ancora sul telefono vero: i promemoria delle
attività; sul computer non è stato guardato l'avviso di Windows.

<p>
<img src="docs/diario/2026-10-22-gest2-tel-preventivo.png" width="220" alt="Telefono: la pagina del preventivo">
<img src="docs/diario/2026-10-22-gest2-tel-accetta.png" width="220" alt="Telefono: come ha accettato e cosa ha scelto">
<img src="docs/diario/2026-10-22-gest2-tel-commessa.png" width="220" alt="Telefono: la commessa nata dal preventivo">
</p>

<p>
<img src="docs/diario/2026-10-22-gest2-tel-attivita.png" width="220" alt="Telefono: le attività di oggi e dei prossimi giorni">
<img src="docs/diario/2026-10-22-gest2-tel-calendario.png" width="220" alt="Telefono: il calendario">
</p>

<img src="docs/diario/2026-10-22-gest2-pc-preventivi.png" width="720" alt="Wisper Ufficio: l'elenco dei preventivi">

<img src="docs/diario/2026-10-22-gest2-pc-editor.png" width="720" alt="Wisper Ufficio: il preventivo in bozza con cosa chiede la legge">

<img src="docs/diario/2026-10-22-gest2-pc-accetta.png" width="720" alt="Wisper Ufficio: l'accettazione con le scelte del cliente">

<img src="docs/diario/2026-10-22-gest2-pc-calendario.png" width="720" alt="Wisper Ufficio: il calendario del mese">

<img src="docs/diario/2026-10-22-gest2-pc-pianificazione.png" width="720" alt="Wisper Ufficio: la pianificazione della settimana">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="gestionale-fase-1"></a>
## 21 ottobre 2026 · gestionale, fase 1 · Il nucleo: server sul NAS, accesso per persona, Dashboard

**Perché.** Il papà ha scritto le specifiche del gestionale completo dello studio (`docs/specifiche-stgm.md`: 18
moduli, riferimento Pleya). La fase 0 ha confrontato Wisper con le specifiche
([analisi](https://claude.ai/artifact/QVfYKsoDJt79DEzeTvoxid)) e Andrea ha deciso: dati su un server nel NAS di casa,
niente iPhone per ora, ogni modulo sia sul telefono sia sul computer, codice commessa 26ST001, menu laterale anche sul
telefono. Poi: *"A me serve però che tu completi tutto il progetto nella sua interezza"*. La fase 1 è il nucleo: le
fondamenta, la Dashboard, clienti e fornitori, commesse, amministrazione. Prima la ricerca e il
[prototipo](https://claude.ai/artifact/FjmuFjBhALHkEGs2urSBEy) (`docs/prototipo/Gestionale-fase1.html`), poi il codice.

**Cosa cambia.**

- **Un server vero al posto del foglio** (`server/`, Node.js con un database SQLite, in Docker sul NAS). Parla come lo
  script del foglio, con le stesse azioni e gli stessi conti, provati sugli stessi casi. Il foglio non sparisce: dopo il
  cambio riceverà ogni notte una copia dei dati da leggere, e lo script farà da ponte per le versioni vecchie e da
  postino per le email (`apps-script/Ponte.gs`).
- **Si entra con nome e password**, una persona per volta, invece del codice uguale per tutti. Quattro ruoli
  (titolare, amministrazione, collaboratore, lettura) e permessi per modulo, decisi dal server: il collaboratore non
  riceve proprio tariffe, totali e margini, e vede solo i suoi rapportini.
- **Menu laterale** al posto della barra in basso sul telefono, e sul computer con la possibilità di richiuderlo a
  icone. Le voci seguono l'ordine delle specifiche e ci sono solo quelle che funzionano davvero.
- **La Dashboard è la pagina iniziale**: la cosa più urgente, poi Urgenti, Questa settimana, Da pianificare, e i
  numeri delle commesse; ogni riga porta dove si sistema. Sul telefono in cima resta "Il tuo giorno", la vecchia Oggi.
- **Clienti e fornitori** in un'anagrafica sola: codice fiscale, SDI, PEC, referenti, sedi e impianti, controllo della
  partita IVA sul servizio europeo, doppioni anche per partita IVA, archiviazione al posto della cancellazione.
- **Commesse per prestazioni** (sopralluogo, progetto, direzione lavori…), ognuna col suo valore e avanzamento; il
  responsabile e le persone; duplica e modelli; archivio.
- **Amministrazione** al posto delle Impostazioni: utenti, ruoli e permessi, numerazioni, il registro attività
  (chi ha cambiato cosa, da cosa a cosa), copie di sicurezza ed esportazioni per Excel, cestino.
- **Un difetto vecchio trovato e corretto**: in Wisper Ufficio fino alla 0.3.6 un budget di 2.500 € compariva nel
  modulo della commessa come "2.500" e, salvando, diventava 2,50 €. I totali dei rapportini non erano toccati; il
  passaggio dei dati segnala le commesse rovinate.
- Il server di prova è sul NAS (vuoto, raggiungibile solo in casa). Il passaggio dei dati veri si fa una sera scelta
  con Manuel, dopo la prova generale su una copia del foglio.

Prove: server 99, script del foglio 65, telefono 105, computer 51, tutte verdi; schermate vere sull'emulatore e con
Edge senza finestra, coi dati di esempio del server di prova.

<p>
<img src="docs/diario/2026-10-21-gest-tel-accesso.png" width="220" alt="Telefono: accesso con nome e password">
<img src="docs/diario/2026-10-21-gest-tel-dashboard.png" width="220" alt="Telefono: la Dashboard col tuo giorno">
<img src="docs/diario/2026-10-21-gest-tel-menu.png" width="220" alt="Telefono: il menu laterale">
</p>

<p>
<img src="docs/diario/2026-10-21-gest-tel-cliente.png" width="220" alt="Telefono: la scheda del cliente">
<img src="docs/diario/2026-10-21-gest-tel-prestazioni.png" width="220" alt="Telefono: le prestazioni della commessa">
<img src="docs/diario/2026-10-21-gest-tel-permessi.png" width="220" alt="Telefono: ruoli e permessi">
</p>

<img src="docs/diario/2026-10-21-gest-tel-scuro.png" width="220" alt="Telefono: la Dashboard del collaboratore, tema scuro">

<img src="docs/diario/2026-10-21-gest-pc-dashboard.png" width="720" alt="Wisper Ufficio: la Dashboard">

<img src="docs/diario/2026-10-21-gest-pc-prestazioni.png" width="720" alt="Wisper Ufficio: le prestazioni della commessa">

<img src="docs/diario/2026-10-21-gest-pc-cliente.png" width="720" alt="Wisper Ufficio: i referenti del cliente">

<img src="docs/diario/2026-10-21-gest-pc-permessi.png" width="720" alt="Wisper Ufficio: ruoli e permessi">

<img src="docs/diario/2026-10-21-gest-pc-registro.png" width="720" alt="Wisper Ufficio: il registro attività">

Versione: non ancora pubblicata (ramo `gestionale`).

---

<a id="v0-4-0"></a>
## 21 ottobre 2026 · 0.4.0 · Tutto l'ufficio anche sul telefono

**Perché.** Il papà ha chiesto di *"portare tutto quello che c'è sul computer anche sul telefono"*, e
*"letteralmente tutto"*. Il computer resta il posto principale: sul telefono l'ufficio serve quando è in giro,
per fatturare, guardare una commessa o mandare un PDF. Prima è stato fatto un prototipo da toccare, partendo da una
ricerca su come le app migliori di questo tipo (fatture, ore, lavori sul campo) mettono l'ufficio sul telefono. Il
prototipo è stato approvato, poi sono state costruite le schermate vere
([`docs/telefono-ufficio.md`](docs/telefono-ufficio.md), prototipo in
[`docs/prototipo/TelefonoUfficio.html`](docs/prototipo/TelefonoUfficio.html)).

**Cosa cambia.**

- **Una barra in basso con tre voci: Oggi · Rapportini · Ufficio.** Oggi non cambia; il numerino giallo su Ufficio
  dice quanti clienti ci sono da fatturare.
- **Ufficio** si apre sulla fine del mese, come Wisper Ufficio: da fatturare, da firmare, fatturato; una scheda per
  cliente con *Prepara riepilogo*; le bozze da far firmare; le commesse vicine al budget o oltre; poi Commesse,
  Clienti e Impostazioni.
- **Il riepilogo si prepara e si manda dal telefono.** L'anteprima è il PDF vero, che si apre a tutto schermo con lo
  zoom. Si sceglie se mettere gli importi e le foto degli scontrini, si cambia il messaggio, e si manda per email; in
  più *Apri il PDF* e *Condividi* (WhatsApp, Gmail…). Poi *Segna fatturati*, con *Annulla* per qualche secondo.
- **Rapportini** prende il posto del Mese: ricerca, il mese dal titolo (anche tutti i mesi), *Tutti | Da fatturare |
  Da firmare*, i filtri che arrivano da un cliente o da una commessa, e *Seleziona* per agire su più rapportini.
- **Il rapportino aperto** ha un solo pulsante giallo, la cosa da fare adesso (Invia al cliente, Segna fatturato,
  PDF), e nel menu ⋯ le stesse voci del computer, compreso *Carica il foglio firmato*.
- **Commesse**: elenco con la barra delle ore sul budget, pagina con le cinque schede del computer (Panoramica,
  Rapportini, Costi, Da fatturare, Documenti su Drive), modulo con ore, prezzo e budget collegati e il margine che si
  aggiorna mentre si scrive.
- **Clienti**: elenco, scheda con i contatti da copiare con un tocco, modifica a pagina intera.
- **Impostazioni complete**: lo studio, la tua firma (rifatta col dito o da una foto), rimborso km e costo orario, il
  campo ticket.
- **I PDF si fanno sul telefono dagli stessi modelli del computer**, copiati nell'app quando la si costruisce:
  rapportino e riepilogo escono identici.
- **Senza rete**: i cambi di stato (inviato, fatturato, in bozza) partono appena c'è rete, come i rapportini. Email,
  clienti, commesse e impostazioni vogliono la rete, e un'email non viene mai ripetuta da sola (partirebbe due volte).
- La visita guidata ha un passo in più, sull'Ufficio.

Le schermate vengono dall'emulatore, collegato al foglio finto delle prove.

<p>
<img src="docs/diario/2026-10-21-tel-ufficio.png" width="220" alt="Ufficio: la fine del mese">
<img src="docs/diario/2026-10-21-tel-invio.png" width="220" alt="Il riepilogo con l'anteprima del PDF">
<img src="docs/diario/2026-10-21-tel-fatturati.png" width="220" alt="Dopo Segna fatturati, con Annulla">
</p>

<p>
<img src="docs/diario/2026-10-21-tel-rapportini.png" width="220" alt="Rapportini: ricerca e filtri">
<img src="docs/diario/2026-10-21-tel-scelti.png" width="220" alt="Più rapportini scelti">
<img src="docs/diario/2026-10-21-tel-rapportino-firmato.png" width="220" alt="Un rapportino firmato: Invia al cliente">
</p>

<p>
<img src="docs/diario/2026-10-21-tel-pdf-rapportino.png" width="220" alt="Il PDF del rapportino fatto sul telefono">
<img src="docs/diario/2026-10-21-tel-commessa.png" width="220" alt="La pagina della commessa">
<img src="docs/diario/2026-10-21-tel-commessa-budget.png" width="220" alt="Il modulo della commessa con il budget">
</p>

<p>
<img src="docs/diario/2026-10-21-tel-cliente.png" width="220" alt="La scheda del cliente">
<img src="docs/diario/2026-10-21-tel-impostazioni.png" width="220" alt="Le impostazioni complete">
<img src="docs/diario/2026-10-21-tel-ufficio-scuro.png" width="220" alt="Ufficio nel tema scuro">
</p>

Versione: [v0.4.0](https://github.com/postagaspa-star/wisper/releases/tag/v0.4.0)

---

<a id="permesso-email"></a>
## 20 ottobre 2026 · solo foglio · L'email del proprietario, anche senza permesso

**Perché.** La prima prova vera di *Collega il computer* si è fermata con questo
errore: *"Le autorizzazioni specificate non sono sufficienti per chiamare
Session.getEffectiveUser"*. Per leggere l'email di chi possiede il foglio, Google
vuole un permesso apposta (`userinfo.email`). Quell'errore di solito vuol dire che
il progetto Apps Script ha l'elenco dei permessi scritto a mano (in
`appsscript.json`) e quel permesso manca. Lo stesso errore fermava, senza dire
niente, anche gli avvisi di sicurezza della 0.3.3 (dispositivo nuovo, troppi codici
sbagliati): con ogni probabilità dal 17 ottobre non ne è arrivato nessuno.

**Cosa cambia.**

- Se il permesso manca, lo script chiede a Drive di chi è il foglio, con il
  permesso che ha già per le foto. L'email per collegare il computer, gli avvisi
  del registro e "manda a me" usano tutti questa strada.
- Una funzione nuova, `autorizza`, da eseguire a mano nell'editor di Apps Script
  dopo aver incollato una versione nuova: Google chiede i permessi che mancano, e
  il registro di esecuzione dice se l'email del proprietario si legge e quante
  email si possono ancora mandare oggi. Non cambia niente nel foglio.
- Se nemmeno Drive risponde, il telefono dice di eseguire `autorizza`.

---

<a id="installa-da-email"></a>
## 20 ottobre 2026 · solo foglio · L'email serve anche a installare Wisper Ufficio

**Perché.** Subito dopo la 0.3.6, la domanda: *"E per installare Wisper Ufficio
come facciamo? Possiamo fare lo stesso procedimento?"*

**Cosa cambia.** L'email che arriva toccando *Collega il computer* sul telefono ora
contiene anche il link per scaricare l'ultima versione di Wisper Ufficio. Così su
un computer nuovo bastano due passi, tutti dalla stessa email:

1. si scarica il programma dal link e lo si apre: si installa da solo e mette
   l'icona sul Desktop. Se Windows avvisa che ha protetto il PC, si tocca
   "Ulteriori informazioni" e poi "Esegui comunque";
2. si apre con un doppio clic l'allegato `Collega Wisper Ufficio.wisper`, e il
   programma si collega al foglio.

Il link punta sempre all'ultima versione pubblicata, quindi l'email non va mai
aggiornata. Non serve una versione nuova delle app: cambia solo lo script del
foglio (`Code.gs`), e vale da quando viene incollato in Apps Script.

---

<a id="v0-3-6"></a>
## 20 ottobre 2026 · 0.3.6 · Il computer si collega dal telefono

**Perché.** Due richieste: *"la sezione dei rapportini della settimana deve essere
sopra a quella dei rapportini di oggi nel telefono"*, e *"nel pc mettimi
automaticamente il codice per collegare l'app al foglio"*.

Mettere il codice dentro il programma avrebbe voluto dire pubblicarlo: i file su
GitHub li può scaricare chiunque, e quello che c'è dentro un programma si può
leggere. Così il codice arriva per un'altra strada, un'email che parte solo verso
il proprietario del foglio.

**Cosa cambia.**

- **Telefono, Oggi:** la settimana ora sta sopra al rapportino di oggi.
- **Telefono, Impostazioni › Collega il computer:** il telefono chiede al foglio di
  mandare al proprietario un'email con un piccolo file, `Collega Wisper
  Ufficio.wisper`, che contiene indirizzo e codice. Anche chi conoscesse il codice
  non potrebbe farsi mandare l'email altrove.
- **Computer:** col doppio clic sul file, Wisper Ufficio si collega da solo e
  cancella il file. Se il doppio clic non funziona, c'è *Impostazioni › Usa il
  file dell'email*. Un programma già aperto si accorge del collegamento nuovo
  alla prima lettura del foglio.
- **Telefono, Tariffe:** l'elenco mostra i clienti a tariffa fissa
  (Elettrodinamica) e "gli altri clienti: libera", al posto dei vecchi gruppi.

<p>
<img src="docs/diario/2026-10-20-tel-settimana-in-cima.png" width="220" alt="Oggi: la settimana sopra al rapportino di oggi">
<img src="docs/diario/2026-10-20-tel-collega-chiedi.png" width="220" alt="Collega il computer: la domanda">
<img src="docs/diario/2026-10-20-tel-collega-mandata.png" width="220" alt="Collega il computer: email mandata">
</p>

<img src="docs/diario/2026-10-20-pc-usa-il-file.png" width="720" alt="Wisper Ufficio, Impostazioni: Usa il file dell'email">

Commit: [1fc5ecd](https://github.com/postagaspa-star/wisper/commit/1fc5ecd)

---

<a id="v0-3-5"></a>
## 20 ottobre 2026 · 0.3.5 · Codici commessa, Elettrodinamica, budget

**Perché.** La sera del 19 ottobre il papà ha lasciato su un foglio di carta le
indicazioni per i prossimi aggiornamenti. La mattina dopo le abbiamo chiarite:

- il codice della commessa è *26* perché è l'anno, *ST* fisso perché il papà
  fattura sempre come Studio Tecnico GM, poi un numero progressivo;
- i nomi scritti nel foglio erano solo esempi;
- la divisione tra "Elettrodinamica" e "privati" non deve esserci più. Il papà
  fattura a Elettrodinamica in generale, e per chi lavori Elettrodinamica non
  conta: Elettrodinamica è un cliente, con la sua tariffa fissa;
- nei riepiloghi e nella colonna COMMESSA ci va il codice;
- il rimborso al chilometro può cambiare da commessa a commessa.

Poi il budget. Il prezzo orario cambia da commessa a commessa, tranne per
Elettrodinamica, dove è fisso. Il costo orario lo scrive chi usa l'app, e
comprende già le ore di viaggio. Per Elettrodinamica serviva *"una sezione
facoltativa nel cliente dove si può inserire un costo fisso"*. Infine una
correzione sulle prime schermate: il margine stimato era uguale al budget, ma
*"il margine sono i soldi dopo i costi"*.

**Cosa cambia.**

- **Codici commessa** anno + ST + numero (26ST001, 26ST002, …). Il numero continua
  da un anno all'altro (27ST047). Il codice compare appena la commessa è creata,
  anche sul telefono senza rete: il telefono propone il numero successivo, e se
  intanto è stato preso il foglio usa il primo libero.
- **Niente più gruppi.** Elettrodinamica è un cliente a tariffa fissa (30 €/h,
  viaggio non pagato, km pagati). Tutti gli altri hanno una tariffa libera, che
  viene ricordata. Fatture, Fine mese e riepiloghi sono per cliente.
- **La colonna COMMESSA** dei rapportini contiene il codice; riepiloghi e PDF
  mostrano il codice al posto della descrizione.
- **€/km per commessa**, se una commessa ha un rimborso diverso.
- **Budget della commessa:** ore previste × prezzo orario = budget (bastano due
  dei tre numeri per avere il terzo), più il costo orario e il margine. Il prezzo
  della commessa viene proposto come tariffa nel rapportino, e resta modificabile.
  Il costo orario si prende dal cliente se ha un costo fisso, altrimenti dalla
  commessa, altrimenti dalle impostazioni. Il margine atteso è il valore meno i
  costi previsti.
- **Il foglio esistente si sistema da solo** alla prima richiesta: crea il cliente
  Elettrodinamica e ci sposta i rapportini e le commesse dei suoi vecchi clienti
  finali (le righe restano, i vecchi nomi diventano alias). Inoltre dà un codice
  26ST alle commesse vecchie e lo scrive nella colonna COMMESSA.

<p>
<img src="docs/diario/2026-10-20-tel-commessa-26st.png" width="220" alt="Telefono: commessa nuova con il codice 26ST">
<img src="docs/diario/2026-10-20-tel-elettrodinamica.png" width="220" alt="Telefono: Elettrodinamica a tariffa fissa">
<img src="docs/diario/2026-10-20-tel-riepilogo.png" width="220" alt="Telefono: riepilogo del rapportino">
</p>

<img src="docs/diario/2026-10-20-pc-commesse.png" width="720" alt="Wisper Ufficio: elenco commesse con i codici">

<img src="docs/diario/2026-10-20-pc-budget.png" width="720" alt="Wisper Ufficio: nuova commessa con il budget">

<img src="docs/diario/2026-10-20-pc-pagina-commessa.png" width="720" alt="Wisper Ufficio: pagina della commessa con budget e margine">

Commit: [21585d9](https://github.com/postagaspa-star/wisper/commit/21585d9)

---

<a id="v0-3-4"></a>
## 19 ottobre 2026 · 0.3.4 · Il codice salvato si vede

**Perché.** *"Nell'app per il pc il codice una volta inserito non rimane, oppure
dopo un cambiamento nel codice, come in quello di AppScript, poi viene
resettato."*

In realtà il codice restava salvato, ma il campo in Impostazioni era sempre vuoto,
quindi sembrava perso. E quando il codice veniva cambiato nello script, il
programma diceva "il foglio non risponde" invece di dire cosa era successo.

**Cosa cambia** (solo computer; il telefono resta alla 0.3.3).

- Il campo del codice mostra le ultime quattro lettere del codice salvato (come
  sul telefono), e la riga del collegamento lo ripete.
- Se il foglio risponde "Codice sbagliato", il programma lo dice: apre
  Impostazioni con il campo del codice già selezionato, e nella barra a sinistra
  compare "Codice da aggiornare".

<p>
<img src="docs/diario/2026-10-19-pc-codice-sbagliato.png" width="420" alt="Wisper Ufficio: il foglio non accetta il codice">
<img src="docs/diario/2026-10-19-pc-codice-salvato.png" width="420" alt="Wisper Ufficio: codice salvato">
</p>

Commit: [a51ef39](https://github.com/postagaspa-star/wisper/commit/a51ef39)

---

<a id="v0-3-3"></a>
## 17 ottobre 2026 · 0.3.3 · Sicurezza, partita IVA, registro degli accessi

**Perché.** Quel giorno si stavano raccogliendo idee per le funzioni future, con un
"consiglio" di tre esperti che le discutevano (proposte messe in pausa). Poi sono
arrivate tre cose urgenti: il problema della partita IVA; il fatto che
l'indirizzo del foglio fosse leggibile su GitHub (*"toglilo immediatamente da
GitHub, ma fai in modo che nel codice rimanga"*); e un registro per *"capire da
quale dispositivo derivano"* le richieste, e capire se ci sono state perdite di
dati.

**Cosa cambia.**

- **L'indirizzo del foglio non entra più nei file pubblicati.** Resta nel codice
  sul computer di sviluppo, in un file che non va su GitHub. Telefono e computer
  lo salvano al primo avvio, così gli aggiornamenti senza indirizzo continuano a
  funzionare. Lo script di pubblicazione si rifiuta di pubblicare se lo trova nei
  file. Le versioni 0.3.0 e 0.3.2 restano elencate su GitHub, ma senza i file da
  installare.
- **Partita IVA con lo zero.** Google Fogli trasformava in numeri i testi fatti
  solo di cifre, e così le partite IVA e i numeri fissi perdevano lo zero
  iniziale, anche quando si modificava un altro campo della riga. Ora questi
  valori vengono scritti come testo, e quelli già rovinati vengono sistemati da
  soli alla prima richiesta.
- **Registro degli accessi.** Google non fa vedere allo script l'indirizzo IP di
  chi chiama, quindi ogni telefono e ogni computer si crea un codice suo al primo
  avvio e lo manda a ogni richiesta. Ogni richiesta lascia una riga nella scheda
  *Accessi* (ora, esito, azione, dispositivo, versione dell'app); la scheda
  *Dispositivi* elenca i dispositivi visti. Il proprietario riceve un'email per
  un dispositivo mai visto, per una richiesta senza nome ma con il codice giusto,
  e dopo 5 codici sbagliati. Il codice non viene mai scritto nel registro.

Commit: [0f92bca](https://github.com/postagaspa-star/wisper/commit/0f92bca)

---

<a id="v0-3-0"></a>
## 16 ottobre 2026 · 0.3.0 → 0.3.2 · Un solo .exe che si aggiorna da solo

**Perché.** *"Io vorrei un qualcosa di più semplice sul pc, tipo un file .exe, come
su Pactum. Inoltre entrambe le applicazioni si devono auto-aggiornare, con dei
ping ogni 1h per richiedere al server eventuali aggiornamenti."*

**Cosa cambia.**

- **Wisper Ufficio è un solo file**, `WisperUfficio.exe`: niente zip, niente
  cartelle. La prima volta che lo si apre si installa da solo per l'utente,
  senza amministratore: icona in Start e sul Desktop, voce in *Impostazioni ›
  App installate* da dove si può togliere (0.3.1, mai pubblicata da sola).
- **Aggiornamenti automatici ogni ora, su tutti e due.** Le app leggono da GitHub
  l'elenco firmato delle versioni, controllano la firma con la chiave pubblica
  che hanno dentro, scaricano la versione nuova e ne controllano l'impronta prima
  di installarla. Sul computer compare "Versione X pronta" con *Riavvia*. Sul
  telefono la prima volta Android chiede il permesso, poi si aggiorna da solo,
  ma solo quando l'app non è in uso e non c'è un rapportino a metà.
- **Lo script di pubblicazione** prepara tutto e pubblica solo codice già
  salvato su GitHub, così ogni versione corrisponde esattamente al suo codice.
- **0.3.2, la sera.** Sul computer del papà il collegamento non funzionava:
  bisognava ricopiare a mano un indirizzo di 112 caratteri, e una *l* minuscola
  era stata scambiata per una *I* maiuscola. L'indirizzo è finito dentro il
  programma (poi tolto dai file pubblicati il giorno dopo, vedi 0.3.3). In
  più è arrivato *"Rifai la visita guidata"* nelle impostazioni di tutti e due,
  come richiesto: *"ci deve essere la possibilità di rifare il tutorial da capo"*.
- Lo stesso giorno Wisper è stato installato sul telefono del papà.

<p>
<img src="docs/diario/2026-10-16-tel-aggiornamento.png" width="220" alt="Telefono: aggiornamento pronto, prova sull'emulatore">
<img src="docs/diario/2026-10-16-pc-aggiornamento.png" width="420" alt="Wisper Ufficio: versione pronta, Riavvia">
</p>

*Le due schermate vengono dalle prove degli aggiornamenti, con numeri di versione
di prova.*

Commit: [85070e0](https://github.com/postagaspa-star/wisper/commit/85070e0),
[9dc84cd](https://github.com/postagaspa-star/wisper/commit/9dc84cd),
[e46f6c6](https://github.com/postagaspa-star/wisper/commit/e46f6c6),
[b25691e](https://github.com/postagaspa-star/wisper/commit/b25691e),
[525e0fc](https://github.com/postagaspa-star/wisper/commit/525e0fc),
[8f05c6d](https://github.com/postagaspa-star/wisper/commit/8f05c6d)

---

<a id="design"></a>
## 15 ottobre 2026, sera · Nuovo design

**Perché.** La prima versione a mano funzionava, ma *"ora dobbiamo però sistemare
tutto il design"*. Prima di disegnare è stata fatta una ricerca (principi di UX,
app dello stesso tipo), partendo da chi la usa: un perito che compila dal
telefono in cantiere, spesso al sole e di fretta, e che a fine mese in ufficio
deve fatturare. Dal prototipo cliccabile, approvato, si è passati alle app vere.

**Cosa cambia.**

- **Il telefono si apre su Oggi:** il rapportino di oggi è scritto? quali giorni
  della settimana mancano (tratteggiati, un tocco per scriverli)? cosa c'è da far
  firmare?
- **Un rapportino sono tre passi brevi** (per chi, ore e strada, il lavoro) e un
  riepilogo, con il totale che sale in fondo mentre si compila. L'app ricorda,
  così si conferma soltanto: clienti e commesse recenti come schede grandi,
  "Come ieri", i km dell'ultima volta, l'ultima tariffa del cliente.
- **Wisper Ufficio si apre su Fine mese:** cosa è pronto da fatturare, una scheda
  per chi paga, poi *Prepara riepilogo*, *Invia per email* e *Segna fatturati*.
- **Stessa famiglia sui due:** tema chiaro caldo (si legge al sole) e tema scuro,
  carattere Figtree, bordi al posto delle ombre, il giallo solo sull'azione
  principale.
- **Niente testi d'aiuto fissi sotto i campi:** al loro posto c'è una visita
  guidata sulle schermate vere, con dati di esempio, la prima volta.
- La guida al design è in [`docs/aspetto.md`](docs/aspetto.md), il prototipo in
  [`docs/prototipo/`](docs/prototipo/).

<p>
<img src="docs/diario/2026-10-15-design-tel-oggi.png" width="220" alt="Telefono: Oggi">
<img src="docs/diario/2026-10-15-design-tel-ore-scuro.png" width="220" alt="Telefono: ore e strada, tema scuro">
<img src="docs/diario/2026-10-15-design-tel-riepilogo.png" width="220" alt="Telefono: riepilogo">
<img src="docs/diario/2026-10-15-design-tel-visita-guidata.png" width="220" alt="Telefono: visita guidata">
</p>

<img src="docs/diario/2026-10-15-design-pc-fine-mese.png" width="720" alt="Wisper Ufficio: Fine mese">

Commit: [7c68923](https://github.com/postagaspa-star/wisper/commit/7c68923),
[4449243](https://github.com/postagaspa-star/wisper/commit/4449243),
[f3239ee](https://github.com/postagaspa-star/wisper/commit/f3239ee)

---

<a id="v0-2-0"></a>
## 14–15 ottobre 2026 · 0.2.0 · Niente più voce: rapportini a mano

**Perché.** *"Dobbiamo modificare Wisper, e renderlo veramente utile per mio
padre."* Ne abbiamo parlato con lui in una conversazione registrata, e abbiamo provato
la demo di [Pleya](https://pleya.it), un gestionale che gli piaceva. Di Pleya si
prende solo quello che serve ai rapportini: i progetti (qui *commesse*) e i
rapporti del team, ridotti a una persona sola. A questo si aggiunge quello che ha
chiesto lui, come i codici commessa e i clienti.

Sulla voce il papà è stato chiaro: *"lascia stare la voce, facciamola a mano"*.
Sulle tariffe: Elettrodinamica ha la sua tariffa fissa; per gli altri clienti
serve un campo dove scrivere la cifra, e l'app deve ricordarsi l'ultima tariffa
usata per quel cliente e riproporla.

**Cosa cambia.**

- **Via la voce,** tutta: parola di attivazione, riconoscimento, Gemini, servizio
  in ascolto, posizione. Resta quello che valeva: la coda che non perde i
  rapportini, e il foglio come unico archivio.
- **Il rapportino si scrive a mano**, in una schermata, dalla data alla firma del
  cliente. Oggi è la data proposta; scegliendo la commessa si compila il
  cliente; clienti e commesse nuovi li crea il foglio. Foto delle spese, firma
  del cliente col dito, e un rapportino firmato non si modifica più finché non
  torna in bozza.
- **Il foglio diventa il cervello:** clienti, commesse, tariffe e conti si fanno
  solo nello script, e niente risponde senza il codice. Le tariffe vengono
  "congelate" nella riga, così aggiornare il costo ACI a gennaio non riscrive
  luglio. Foto e firme vanno in una cartella Wisper su Drive.
- **Nasce Wisper Ufficio**, il programma per il computer (costruito come Pactum):
  rapportini con filtri e totali, commesse con ore rispetto al budget e margine,
  clienti, impostazioni, i PDF del rapportino e del riepilogo del mese, l'invio
  per email.
- **Un finto Google** fa girare lo script vero senza il foglio vero, per provare
  telefono e computer dall'inizio alla fine.
- Il vecchio modello vocale fuori dall'APK: da 60 MB a 11 MB.

<p>
<img src="docs/diario/2026-10-15-tel-rapportini.png" width="220" alt="Telefono 0.2: rapportini del mese">
<img src="docs/diario/2026-10-15-tel-nuovo-rapportino.png" width="220" alt="Telefono 0.2: nuovo rapportino">
<img src="docs/diario/2026-10-15-tel-firma.png" width="220" alt="Telefono 0.2: firma del cliente">
</p>

<p>
<img src="docs/diario/2026-10-15-pc-rapportini.png" width="520" alt="Wisper Ufficio 0.2: rapportini">
<img src="docs/diario/2026-10-15-pc-pdf-rapportino.png" width="260" alt="PDF del rapportino">
</p>

Commit: [3766298](https://github.com/postagaspa-star/wisper/commit/3766298),
[61d0e47](https://github.com/postagaspa-star/wisper/commit/61d0e47),
[e522fd7](https://github.com/postagaspa-star/wisper/commit/e522fd7),
[e9408a6](https://github.com/postagaspa-star/wisper/commit/e9408a6),
[6347de7](https://github.com/postagaspa-star/wisper/commit/6347de7),
[a8a547f](https://github.com/postagaspa-star/wisper/commit/a8a547f),
[8a18b80](https://github.com/postagaspa-star/wisper/commit/8a18b80)

---

<a id="coda"></a>
## 26 settembre – 14 ottobre 2026 · 0.1 · Un rapportino confermato non si perde più

**Perché.** Usando la versione a voce erano venuti fuori dei problemi: *"non parte
se lo chiami senza aprire l'app, risponde dopo un sacco di secondi e spesso non
capisce quello che gli viene detto"*. E una domanda: *"se io chiudo il telefono
mentre sta salvando, il processo di salvataggio si interrompe oppure continua in
modo autonomo? Perché secondo me dovrebbe continuare."*

**Cosa cambia.** Un rapportino confermato va prima in una coda sul telefono, ed
esce dalla coda solo quando il foglio risponde che l'ha salvato. Se manca la
rete riprova, e riparte appena la rete torna; il foglio riconosce un reinvio e
non scrive la riga due volte. Il riconoscimento vocale ripartiva da solo se si
fermava prima di aver sentito qualcosa, e ogni chiamata al modello aveva un tempo
massimo. Della versione a
voce, questa coda è la parte rimasta anche dopo.

Commit: [4bbc891](https://github.com/postagaspa-star/wisper/commit/4bbc891)

---

<a id="v0-1-0"></a>
## 7–9 agosto 2026 · 0.1.0 · Hackathon NGN Hacks: la versione a voce

**Perché.** Per l'hackathon NGN Hacks 2026, Wisper è stata rifatta come app Android
nativa, voice-first: si doveva attivare come un assistente vocale, anche a
schermo spento, e compilare il rapportino senza usare le mani. Il riconoscimento
vocale era sempre stato il punto debole del progetto. Tempo a disposizione: due
giorni.

**Cosa c'era.**

- **Parola di attivazione "Wisper"**, riconosciuta sul telefono senza internet.
  "Ehi Wisper" veniva capito male, così è bastato "Wisper".
- **Una palla di puntini** che dice di chi è il turno anche da un metro: bianca in
  attesa, gialla quando ascolta (con un microfono sopra), blu quando parla
  Wisper. Mentre si parla compare la scheda del rapportino, che si compila da
  sola.
- **Frasi naturali,** non elenchi: *"Oggi hai lavorato per Rossi con la commessa
  …, hai percorso 3 km e il lavoro è durato 4 ore, è tutto corretto?"*, e quello
  che manca detto in un'unica frase, con un solo "però".
- **Campi obbligatori:** cliente, commessa, ore, km e descrizione del lavoro, che
  l'AI riscrive da come la racconta il tecnico. La commessa si nomina con la sua
  descrizione, non con il codice: *"il tecnico non ha tutti i codici in mente"*.
- **Stato della commessa** aperta o chiusa, al posto di un "esito" che non serviva.
  Clienti e commesse nuovi creati a voce, rapportino cancellabile a voce.
- **Riconosce il cantiere dalla posizione** e lo propone ("ho visto che sei nel
  cantiere di …, è corretto?"), usando solo l'ultima posizione nota, mai un
  tracciamento continuo.
- **Il microfono non resta bloccato:** il primo giro teneva il microfono per sé e
  le altre app del telefono non sentivano più niente. Ora Wisper ascolta solo a
  schermo spento o quando è in primo piano.
- Etichette in inglese per i giudici, la voce sempre in italiano.

<p>
<img src="docs/immagini/1-riposo.png" width="220" alt="La palla bianca: in attesa">
<img src="docs/immagini/3-ascolta.png" width="220" alt="La palla gialla: ascolta">
<img src="docs/immagini/5-scheda.png" width="220" alt="La scheda del rapportino">
</p>

Commit: da [730f5dd](https://github.com/postagaspa-star/wisper/commit/730f5dd) a
[a57a536](https://github.com/postagaspa-star/wisper/commit/a57a536)

---

<a id="prima"></a>
## Marzo – giugno 2026 · Le prime versioni

Prima di questo repository Wisper era una web app installabile sul telefono, su
Firebase (marzo 2026). Si parlava, Gemini tirava fuori i dati, il rapportino
finiva nel foglio Google; c'erano già la firma del cliente e una coda per quando
manca la rete.

A fine giugno 2026 è stata progettata una versione più completa: clienti e
commesse con un codice proprio, la firma di chi compila salvata una volta nelle
impostazioni invece che a ogni rapportino, chilometri, foto degli scontrini.
Molte di queste idee sono tornate in ottobre, nella 0.2.0.
