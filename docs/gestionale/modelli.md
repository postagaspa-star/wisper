# I modelli dei documenti e i loro codici (1.5.0, 17/11/2026)

Richiesta di Andrea del 17/11/2026:

> "Nuove modifiche: nei rapportini giornalieri (di un solo giorno con stessa data e stessa commessa, altrimenti lasciali
> così come sono) bisogna togliere la data ed il numero del rapportino dalla tabella (non dall'intestazione), e sostituirli
> con la descrizione del progetto, che andrà dopo l'intestatario del progetto.
> Inoltre censisci i modelli che Wisper può creare (un modello per i rapportini mensili, uno per i rapportini giornalieri
> con stessa commessa e data, uno per la fattura, uno per il preventivo eccetera per tutti gli altri modelli esistenti) e ad
> ognuno dai un codice, che deve apparire nei posti opportuni di Wisper, oltre ad avere anche una sua pagina dove poterli
> vedere tutti con relativi esempi, senza però poterne creare di nuovi"

Prototipo cliccabile: `docs/prototipo/Modelli.html` (computer, telefono, tema scuro). Il design è quello di Wisper
(`docs/gestionale/fai.md`): questa pagina non ne inventa uno suo.

## 1. Il rapportino giornaliero con una commessa sola

Il PDF del rapportino di un numero (`rapportinoLavori` in `pc/ui/documenti.js`) ha due tabelle:

| | Colonne | Quando |
|---|---|---|
| **RAP-01** | Progetto · Intestato a · **Descrizione progetto** · Lavoro svolto · Lavoro · Extra · Viaggio · Km · Spese · Importo | tutti i lavori hanno lo stesso giorno e la stessa commessa |
| **RAP-02** | Data · N° · Progetto · Intestato a · Lavoro svolto · … (com'era) | i lavori sono su commesse diverse (o in giorni diversi) |

- La data e il numero restano nell'intestazione ("Rapportino di lavoro", il numero, "cliente · giorno · N lavori").
- La **descrizione del progetto** è quella scritta nel progetto (`progetti.descrizione`); senza progetto o senza
  descrizione c'è un trattino.
- "Stessa commessa" vale anche quando nessun lavoro ha la commessa (tutti senza): è comunque un giorno e un posto solo.
  Uno con la commessa e uno senza sono due casi diversi: RAP-02.
- Il riepilogo di più rapportini (RAP-03) non cambia: lì la data e il numero servono a distinguere le righe.

La regola è una funzione sola, `modelloRapportino(lavori, data)` in `pc/ui/documenti.js`, portata uguale in
`rapportino/ModelliDocumenti.kt` (`ModelliDocumenti.rapportino`), con i dodici casi condivisi di
`pc/prove/casi-modelli.json` (gli spazi intorno al codice non contano, maiuscole e minuscole sì, un lavoro senza giorno
prende quello del rapportino).

## 2. Il censimento: dodici modelli

| Codice | Modello | Quando esce | Dove si crea |
|---|---|---|---|
| RAP-01 | Rapportino giornaliero, una commessa | Un rapportino con tutti i lavori sulla stessa commessa | Rapportini › Invia, oppure il PDF del rapportino |
| RAP-02 | Rapportino giornaliero, più commesse | Un rapportino con lavori su commesse diverse | Rapportini › Invia, oppure il PDF del rapportino |
| RAP-03 | Riepilogo dei rapportini del mese | Più rapportini dello stesso cliente, una riga per lavoro e i totali | Rapportini › Invia, con più rapportini scelti |
| RAP-04 | Rapportino di un lavoro, a scheda | Un lavoro solo, a riquadri invece che a tabella | Portale clienti |
| PRE-01 | Preventivo | L'offerta al cliente | Preventivi › PDF o Invia |
| PRE-02 | Incarico professionale | L'incarico da far firmare, da un preventivo accettato | Preventivi › Incarico |
| FAT-01 | Parcella pro-forma | La bozza della fattura per il cliente, senza valore fiscale | Fatture › Parcella pro-forma |
| FAT-02 | Parcella o fattura | La copia per il cliente della fattura emessa (anche la nota di credito) | Fatture › PDF della fattura emessa |
| FAT-03 | Prospetto per il programma delle fatture | I dati da copiare nel programma che emette la fattura | Fatture › Prospetto |
| LET-01 | Lettera | Una lettera al cliente da un testo già pronto | Documenti › Modelli › Nuova lettera |
| LET-02 | Lettera d'incarico al collaboratore | L'incarico a un collaboratore esterno | Collaboratori › Incarico › Lettera d'incarico |
| ASS-01 | Contratto di assistenza | Impianti, visite, tempi d'intervento e condizioni | Ticket › Assistenza › PDF del contratto |

L'elenco sta in un posto solo: `MODELLI` in `pc/ui/documenti.js` (lo stesso file che disegna i documenti, usato anche
dal telefono), ripetuto in `rapportino/ModelliDocumenti.kt` e tenuto uguale dalle prove (`pc/prove/modelli.test.js`,
`ModelliDocumentiTest`). Un modello è una **pagina con una sua impaginazione**; non sono modelli:

- i file che non sono pagine (CSV per Excel, XML della fattura, copia dei dati);
- i testi dei messaggi (email, WhatsApp): stanno in WhatsApp › Modelli e hanno le loro chiavi;
- le varianti di testo della lettera (verifica dell'impianto di terra, libera): la pagina è una, LET-01.

## 3. Come è fatto il codice

- **Famiglia di tre lettere + numero di due cifre**: `RAP`, `PRE`, `FAT`, `LET`, `ASS`. Si legge "Mod. RAP-01".
- Il numero **non cambia mai** e non si riusa: un modello nuovo prende il numero dopo, uno tolto lascia il buco. È la
  regola dei sistemi di numerazione dei documenti: il codice identifica il modulo, non la sua posizione nell'elenco.
- Il codice dice **quale impaginazione**, non quale documento: il numero del documento (RAP/2026/0031, W-21, PR/2026/018)
  resta quello di prima e sta nell'intestazione.

## 4. Dove compare

**Su ogni documento**, in fondo a ogni pagina a destra, prima del numero di pagina: `Mod. RAP-01 · Pagina 1 / 2`; nei
documenti col modello della parcella `Mod. FAT-02 · Parcella n. 24 · Pagina 1 / 1`. È la convenzione dei moduli
italiani ("Mod. …" nel piè di pagina). Lo scrive `stile()` in `documenti.js`, quindi vale per computer, telefono e
portale; nella pagina c'è anche `<meta name="wisper-modello">`, che `modelloDi(html)` rilegge. Sul telefono il piè di
pagina si stampa con la WebView di Android dalla 131 in su (come già il numero di pagina).

**Nell'app, dove un documento si prepara**:

| Posto | Computer | Telefono |
|---|---|---|
| Invio dei rapportini | sigla accanto all'allegato | "Il rapportino · Mod. RAP-01" sotto il nome del file |
| Pannello del rapportino | sigla accanto al numero; nel menu del PDF per destinatario | (il PDF si fa dall'invio) |
| Preventivo | nel menu ⋯ accanto a "PDF del preventivo" e "PDF dell'incarico"; nell'invio accanto all'allegato | nelle righe e nel menu del preventivo, su "Apri il PDF" dell'invio |
| Fattura | sul pulsante "Parcella pro-forma" e "… in PDF"; nella finestra della pro-forma; accanto a "Prospetto per il programma" | sugli stessi tre pulsanti |
| Lettera, lettera d'incarico | sigla nella testata della finestra | sopra il titolo della pagina |
| Contratto di assistenza | nel menu, accanto a "Contratto in PDF" | uguale |
| Documenti › Modelli (i testi) | sigle a destra di ogni riga | "Mod. RAP-01, Mod. RAP-02 · impaginazione fissa · 2 testi" |

Sul computer la sigla fuori dai pulsanti è un pulsantino (`W.Modelli.sigla`) che apre il modello sopra la pagina dove
si è; dentro un pulsante o una voce di menu è una scritta (`W.Modelli.nota`, `modello:` nelle voci di `apriMenu`). Sul
telefono è sempre una scritta (`nota` di `PulsanteBordo` e `VoceMenu`, `SiglaModello`): niente bersagli piccoli.

In Documenti › Modelli la riga "Avviso di parcella" si chiama ora "Parcella pro-forma" (il nome dell'elenco).

## 5. La pagina Modelli

Voce del menu **Modelli** (nome lungo "Modelli dei documenti"), subito dopo Documenti; foglio col riquadro, viola
(`#F5E8FB` · `#7E22A8`). Non è un permesso né una funzione che si spegne: la vede chi vede almeno una delle parti che
creano documenti (Rapportini, Preventivi, Fatture, Documenti, Ticket, Collaboratori); non è nel menu dell'esterno.

- **Si guarda e basta**: nessun "Nuovo", nessun campo. L'unico giallo è "Apri l'esempio in PDF", dentro il modello.
- **Computer** (`pc/ui/modelli.js`, `#modelli`): i modelli divisi per famiglia, una scheda per modello con l'esempio in
  miniatura, il codice col colore della famiglia (quello della sua voce nel menu), il nome e quando esce. Un clic apre
  la finestra del modello: l'esempio grande a sinistra, a destra Quando esce, Dove si crea (con "Vai a …") e, se ha
  testi che si cambiano, "Apri i testi del modello".
- **Telefono** (`ui/ModelliDocumenti.kt`): l'elenco per famiglia con la prima pagina dell'esempio in piccolo; la pagina
  del modello ("modelli/<codice>") con l'esempio grande (un tocco lo ingrandisce con lo zoom, tutte le pagine), Quando
  esce, Dove si crea e il giallo in basso.
- **L'esempio è il documento vero**: lo fa il modello vero in quel momento, coi dati inventati di
  `pc/ui/modelli-esempi.js` (cliente Rossi Impianti Srl, numeri e prezzi di esempio) e in cima lo studio di chi guarda
  (nome, indirizzo, logo dalle impostazioni). Così l'esempio non resta mai indietro rispetto al documento che esce.
  Sul computer sta in `anteprima.html` (lì lo stile scritto nella pagina è permesso, nell'app no); sul telefono è il PDF
  di `Stampa.esempio`, e le prime pagine in piccolo restano in `cacheDir/modelli` finché non cambiano la versione
  dell'app o i dati dello studio.

## 6. La ricerca dietro le scelte

1. **Schede con l'anteprima per riconoscere, elenco per scorrere.** Un modello si riconosce dalla forma della pagina
   più che dal nome: per questo schede con la miniatura, e non una tabella. Con dodici voci in quattro famiglie non
   serve la ricerca. ([Card view vs list view, NN/g](https://www.nngroup.com/videos/card-view-vs-list-view/),
   [Cards vs lists](https://open-design.ai/blog/cards-vs-lists/))
2. **L'identità prima, i dettagli sempre nello stesso ordine**: codice, nome, quando esce, uguali in ogni scheda.
3. **La miniatura non deve mentire**: è il documento vero in piccolo, non un disegno; e dall'elenco si va al modello e
   si torna indietro senza perdere il posto (ricerche del Baymard Institute sulle miniature).
4. **L'anteprima con dati di esempio, uguale al PDF che esce**: è così nelle gallerie di modelli dei programmi di
   fatturazione. ([Zoho Invoice, modelli PDF](https://www.zoho.com/kw/invoice/help/pdf-templates/create-template.md))
5. **Codice = tipo + numero a larghezza fissa, che non cambia mai**, scritto nel piè di pagina.
   ([Document control numbering](https://technicalwriterhq.com/documentation/document-control/document-control-numbering/))
6. **"Mod. …" in fondo alla pagina accanto al numero di pagina**: la convenzione dei moduli italiani
   ("MOD. 598 – 2001/02 Pagina 1 di 23" in una
   [lista di controllo ISO 9001](https://www.frareg.com/cms/wp-content/uploads/cklst_iso_9001_2000.pdf)).
7. **Sul telefono un tocco sulla miniatura apre il documento a tutta larghezza**, con lo zoom.

## 7. Decisioni prese costruendo

- Il codice sta anche sui documenti che vanno ai clienti (in piccolo, nel piè di pagina): serve a dire "questo è il
  Mod. FAT-01" al telefono con un cliente o col commercialista. Non c'è un'impostazione per toglierlo: se non lo si
  vuole è una riga di `stile()`. **Confermato da Andrea il 21/11/2026** ("Sì, resta"): il codice resta anche sui
  documenti per i clienti.
- RAP-04 (la scheda di un lavoro solo) è censito perché esiste ancora: lo usa il portale clienti per i rapportini di
  prima della 1.2.
- Le impronte dei PDF nelle prove cambiano solo per il codice: `pc/prove/fase8.test.js` lo dimostra togliendo il codice
  e ritrovando le impronte della 1.4.5 (tranne il rapportino giornaliero, che cambia davvero).
- Il server non cambia (resta 0.15.3): i modelli sono dell'app. In Documenti › Modelli il server chiama ancora
  "Avviso di parcella" la riga della pro-forma; le app mostrano il nome dell'elenco.
- Sul computer, aperto dalla sigla sopra un'altra finestra, il modello non mostra "Vai a …": si guarda e si torna lì.

## 8. Prove

- `pc/prove/modelli.test.js` (elenco, regola, tabella RAP-01, RAP-02 e RAP-03 invariati, codice su ogni modello, un
  esempio per modello, voce del menu) e `ModelliDocumentiTest` (elenco e regola sugli stessi casi).
- Schermate: `modelli-pagina`, `modelli-fondo`, `modello-finestra`, `modello-parcella`, `modello-da-sigla`,
  `rapportino-invio`, `fattura-pdf-modello` in `pc/prove/schermate.js`.
