# Servizi, indennità e i documenti col modello della parcella (1.4.0, server 0.15.0)

12/11/2026. Richiesta di Andrea, con tre file: l'esportazione dei servizi dal programma delle fatture di Manuel
(Flextaxa, 35 servizi), una schermata di Flextaxa ("Anagrafica prodotti/servizi") e il "Modello parcella WISPER"
(due parcelle d'esempio rifatte nel linguaggio del riepilogo dei rapportini, più le indicazioni).

> "Ora bisogna aggiungere anche la possibilità di aggiungere le indennità. Nei rapportini bisogna fare in modo che
> come ultima cosa, a fianco dei bottoni tipo "ore extra" "Luogo" eccetera ci sia anche un bottone per le indennità,
> che apra una schermata con gli stessi campi che vedi nella foto. Inoltre bisogna aggiungere anche i servizi (che
> devono essere raggiungibili anche dal menù laterale) [...] (devi inserirli già tu dentro al database). Infine [...]
> i preventivi, pre-parcelle e parcelle siano così."

Il programma con cui Manuel emette le fatture (fase4.md §8.4, "da sapere") è **Flextaxa**.

## 1. Servizi

Il listino della fase 2 (tabella `listino`, quello che i preventivi usano già) diventa l'anagrafica dei servizi, coi
campi di Flextaxa. Un posto solo: un servizio scelto in un preventivo, in un'indennità o (dopo) in una fattura è lo
stesso. Le azioni restano `listino`, `salvaVoceListino`, `archiviaVoceListino` (le app vecchie continuano a
funzionare); i campi nuovi si aggiungono.

Un servizio (JSON):

| campo | etichetta (come Flextaxa) | note |
| --- | --- | --- |
| `nome` | Descrizione | obbligatoria |
| `prezzo` | Prezzo di vendita unitario (IVA esclusa) | obbligatorio per un servizio nuovo; null = senza prezzo (i vecchi) |
| `aliquotaIva` | Aliquota IVA | 22, 10, 5, 4, 0; di base 22 |
| `codice` | Codice articolo | IND-TR, DL... |
| `prezzoAcquisto` | Costo di acquisto unitario (IVA esclusa) | null = non scritto |
| `aliquotaAcquisto` | Aliquota IVA acquisto | di base 22 |
| `tipo` | Tipo | `servizio` (di base) o `prodotto` |
| `unita` | Unità di misura | obbligatoria: Nr, Ore, Pz, Km, Giorni, A corpo |
| `fornitore` | Fornitore | testo (si propongono i fornitori dell'anagrafica) |
| `tag` | Tag per ricerca | elenco di parole: `["trasferta"]` |
| `immagine` | Immagine | `{id, url}` o null; jpeg/jpg, al massimo 1 MB, caricata con `/carica` (tipo `servizio`) |
| `note` | Note personali (non visibili nei documenti) | testo libero |
| `modo` | (non si vede) | lo decide l'unità: Ore → `ore`, A corpo → `corpo`, le altre → `quantita` |
| `descrizione`, `attivo`, `ordine` | come prima | |

Senza il permesso dei soldi (`costi` a 0) spariscono `prezzo` e `prezzoAcquisto` (e chi li salva non li cambia).

Chi vede i servizi: chi ha in lettura Preventivi, Rapportini o Fatture (servono per le indennità). Li cambia chi ha
Preventivi in scrittura, come prima. Menu laterale: **Servizi**, subito dopo Preventivi, su telefono e computer.

L'elenco: cerca in descrizione, codice e tag; ogni riga ha codice, descrizione, prezzo per unità; gli archiviati a
parte. La scheda ha le tre parti della schermata di Flextaxa, nello stesso ordine: "Anagrafica prodotti/servizi"
(Descrizione, Prezzo di vendita, Aliquota IVA), "Dettagli" (Codice articolo, Costo di acquisto, Aliquota IVA acquisto,
Tipo, Unità di misura, Fornitore, Tag per ricerca, Immagine), "Note personali (non visibili nei documenti)".

I 35 servizi di Flextaxa vanno solo nel database del NAS (`server/strumenti/importa-servizi.js` legge il CSV di
Flextaxa): sono i prezzi veri dello studio e non entrano nel repository. Nei dati di prova ci sono servizi d'esempio.

## 2. Indennità nel lavoro

Nell'editor del rapportino, sezione Altro, dopo "+ Strumenti usati": **+ Indennità**. Apre la schermata Indennità coi
campi della scheda di un servizio, più **Quantità** (di base 1: serve per il conto e per la riga della parcella). In
cima si sceglie un servizio (prima quelli che si chiamano "Indennità..."), e i campi si riempiono; si correggono
(es. "Indennità di trasferta | Cantiere di via Roma"). Un lavoro può averne più d'una; ognuna si
tocca per cambiarla e si toglie.

Nel lavoro (salvaRapportino, per ogni lavoro): `indennita: [ { idServizio, codice, descrizione, quantita, unita,
prezzo, aliquotaIva, tipo, prezzoAcquisto, aliquotaAcquisto, fornitore, tag, note, immagine } ]`. Il server risponde
con in più `importo` per riga (`centesimi(quantita × prezzo)`) e `importoIndennita` per il lavoro (la somma). Il
`totale` del lavoro = compenso ore + rimborso km + spese + indennità. Un lavoro salvato **senza** il campo
`indennita` (app vecchie) tiene quelle che aveva. Senza `costi`: niente prezzi in risposta; salvando, il server tiene
il prezzo che l'indennità aveva (stessa posizione e stesso servizio) o quello del servizio.

Fatturando: una riga per indennità, col suo codice, quantità, unità e prezzo (soggetta a cassa, IVA e ritenuta come le
ore). Nel PDF del rapportino e del riepilogo l'indennità sta sotto il lavoro ("Indennità: IND-TR Indennità di
trasferta, 2 Giorni") e il suo importo è nell'importo del lavoro.

## 3. Preventivo, pre-parcella, parcella

Il linguaggio del riepilogo dei rapportini, come nel modello: logo a sinistra, a destra il tipo ("PREVENTIVO",
"PRE-PARCELLA", "PARCELLA"), il numero e "data · Valuta EUR (€)", il filetto scuro; Mittente e Spett.le su due colonne
senza riquadri; la tabella Codice, Descrizione, Q.tà, U.M., Unit. €, Sconto, IVA, Totale € senza righe verticali; in
fondo a sinistra Pagamento, a destra il riepilogo (Imponibile, Totale rivalsa (5% EPPI), Spese, Totale IVA, **Totale
documento**, Ritenuta d'acconto (RT01), Totale ritenute, **Importo dovuto**); poi le Note; piè di pagina con lo
studio a sinistra e "Parcella n. 24 · Pagina 1 / 1" a destra. Le righe a zero restano. Figtree, corpo 8-9 pt.

- **Pre-parcella** (prima "Avviso di parcella": è la parola di Andrea e Manuel) = la bozza o la fattura pronta, coi
  numeri di Wisper; resta scritto che non è una fattura.
- **Parcella** = la fattura emessa (numero dato da Flextaxa), coi numeri dell'XML tornato se c'è; il titolo segue il
  tipo documento (TD06 Parcella, TD01 Fattura, TD04 Nota di credito). È la copia per il cliente.
- **Preventivo**: stessa veste; restano tutte le parti che chiede la legge (oggetto, complessità, voci facoltative e
  alternative, pagamenti, oneri, polizza e titoli, condizioni, validità, firme).

Dati nuovi: `STUDIO_QUALIFICA` (sotto il nome, "Perito Industriale"); sul conto in banca `bic` e `beneficiario`
(il nome di chi incassa, diverso dal nome dello studio); sul cliente `etichettaCommessa` ("Commessa" se vuota; per
EPPI "JOB"); nelle righe delle fatture `codice` e `sconto` (percento), letti anche dall'XML tornato
(CodiceArticolo, ScontoMaggiorazione).

**Arrotondamenti**: Flextaxa arrotonda l'IVA riga per riga (e a parte quella della rivalsa); Wisper la arrotondava
sul totale, e in una delle parcelle del modello di Manuel dava un centesimo di IVA in meno di Flextaxa. Dalla 1.4.0
`contiFattura` (server, `pc/ui/regole-fatture.js`, `Fatture.kt`) fa come Flextaxa: IVA = Σ arrotonda(importo della
riga × aliquota) + arrotonda(rivalsa × aliquota). Tutte e due le parcelle del modello tornano al centesimo; nei casi
di `server/prove/casi-fattura.json` (31 e 32) ci sono due parcelle inventate dove le due regole danno un centesimo di
differenza (gli importi veri del modello non vanno nel repository).

## 4. Decisioni prese costruendo

1. **Servizi non è un permesso** e non ha un interruttore fra le Funzioni: la voce del menu si vede con Preventivi,
   Rapportini o Fatture (in lettura), sparisce solo se sono spente tutte e tre. La cambia chi ha Preventivi da
   modificare, come vuole il server. Computer: `VEDE_CON` in `pc/ui/regole.js`; nella tabella di Ruoli e permessi
   non compare.
2. **Il vecchio Listino è tolto**: `#preventivi/listino` porta a `#servizi`, il pulsante "Listino" dei Preventivi
   dice "Servizi", "Dal listino" nell'editor del preventivo dice "Dai servizi". Una voce presa da un servizio porta
   anche il codice (colonna Codice del PDF).
3. **La finestra Indennità** si apre già col primo servizio che si chiama "Indennità..." (se c'è); in cima
   "Dal servizio" con due gruppi, Indennità e Altri servizi, più "Nessuno, la scrivo io". Sul telefono "Scrivila a
   mano" c'è solo per chi vede i soldi: senza soldi il prezzo lo mette il server dal servizio.
4. **Segmenti dell'elenco**: Tutti, Indennità, Servizi e Prodotti; quelli vuoti non si mostrano.
5. **"Come ieri" sul telefono non ricopia le indennità**: si aggiungono ogni volta, per non ricopiarle senza
   accorgersene.
6. **Indennità che il telefono non conosce** (lavoro arrivato da un server di prima): l'elenco non si manda, così
   non si cancellano quelle scritte dal computer. Il server nuovo manda sempre un elenco, anche vuoto.
7. **Nei PDF dei rapportini e dei riepiloghi** l'indennità è una riga sotto il lavoro ("Indennità: IND-TR Indennità
   di trasferta, 2 Giorni") e una riga "Indennità" nel conto; senza indennità il foglio resta identico a prima.
8. **Il piè di preventivo, pre-parcella e parcella** porta la ragione sociale intera (come il modello), non il nome
   breve; a destra "Parcella n. 24 · Pagina 1 / 1" senza il simbolo di Wisper.
9. **La qualifica** si scrive in Amministrazione › Studio sotto il nome breve; **BIC/SWIFT e Beneficiario** nel
   conto in Banche e scadenze › Conti (BIC controllato: 8 o 11 lettere e numeri); **"Nei documenti la commessa si
   chiama"** nella scheda del cliente, gruppo Fatture.

## 5. Cambiamenti del 13/11/2026 (1.4.2, server 0.15.1)

Richieste di Andrea col modello della parcella di Manuel in mano. Dove dicono il contrario dei punti sopra, valgono
queste.

1. **Si chiama "Servizi e prodotti"** (menu, pagina, pulsante dei Preventivi), scritto come le altre voci
   dell'app. Nelle azioni del server e nel codice resta `servizi`.
2. **Nessuna distinzione fra servizi e indennità** (sostituisce i punti 3 e 4 del §4): l'elenco è uno. Segmenti
   Tutti, Servizi e Prodotti sul computer, Tutti e Archiviati sul telefono (il segmento Indennità non c'è più); la finestra dell'indennità ha un solo
   "Da Servizi e prodotti" con tutto il listino nel suo ordine, senza i due gruppi e senza aprirsi sul primo che si
   chiama "Indennità...". "Indennità" resta il nome della cosa che si aggiunge a un lavoro del rapportino.
3. **"Pre-parcella" diventa "Parcella pro-forma"** in ogni schermata e nel PDF (le azioni del server restano
   quelle). Nella bozza della fattura è un pulsante in vista accanto a Passa al programma (sul telefono sotto i
   conti); prima salva la bozza, poi prepara il PDF. Lo stesso nel pannello di una fattura passata al programma.
   Una fattura emessa ha in vista "Parcella in PDF" (o "Fattura", "Nota di credito", dal tipo documento).
4. **Le righe della bozza** mostrano e fanno scrivere il Codice e lo Sconto %; "Da Servizi e prodotti" aggiunge una
   riga dal listino (codice, descrizione, unità, prezzo). Computer: `W.Servizi.scegli`; telefono: nel foglio della
   riga. I conti a schermo del computer tengono conto dello sconto (`parametriDi` in `regole-fatture.js`).
5. **Ritenuta d'acconto**: `ritenuta_applicata` si fissava alla nascita della bozza da `sostitutoDi(cliente)`.
   Ora `salvaSoggetto` chiama `ritenutaNelleBozze` (`server/src/azioni/fatture.js`): se il cliente diventa
   sostituto d'imposta, o smette di esserlo, le sue bozze di fattura prendono la scelta nuova e si ricalcolano. Un
   altro cambio alla scheda non tocca le bozze; le fatture pronte o emesse non si toccano mai.
6. **Unità dei servizi di prima della 1.4.0** sul telefono: `Servizi.unitaDi` (come `unitaDi` del computer: a
   corpo senza unità = "A corpo", ore = "Ore"); un'indennità scritta a mano parte da "Nr". Prima il pulsante giallo
   chiedeva un'unità che stava in fondo alla pagina.

## 6. Cambiamenti del 13/11/2026 sera (1.4.3, server 0.15.2)

Andrea, guardando una bozza vera sul computer: "Il codice però si deve mettere automaticamente quando prepari la
bozza per la fattura! Ed il codice deve essere preso dai Servizi, che sono quelli che vanno messi nei preventivi,
parcelle e parcelle pro-forma"; "anche se c'è scritto sì alla ritenuta in basso, sopra nella ritenuta d'acconto
viene segnato zero (e comunque la ritenuta è già segnata nelle impostazioni)".

1. **Le righe che nascono dai rapportini sono servizi.** Nel modello ogni riga della parcella è un servizio: codice,
   "nome del servizio | dettaglio", quantità, unità, prezzo. Quando `preparaFattura` fa le righe
   (`righeRapportini` in `server/src/conti.js`) la riga delle ore e quella dei km prendono dal loro servizio il
   **codice**, il **nome** (davanti al dettaglio: "Ore di consulenza | ottobre 2026 (2 rapportini)") e l'**unità**
   ("Ore", "Km"). Quantità, prezzo e importo restano quelli dei rapportini: i conti non cambiano di un centesimo.
   Le righe delle spese e delle anticipazioni restano senza codice (non c'è un servizio che le descriva); le
   indennità avevano già il loro.
2. **Quale servizio** (`scegliServizio` in `server/src/servizi.js`, casi in `server/prove/codici-righe.test.js`).
   Fra i servizi attivi col codice e con l'unità giusta (Ore, Km):
   1. quello usato l'ultima volta nelle fatture di questo cliente: un codice corretto a mano nella bozza, o tornato
      nell'XML emesso, si ricorda;
   2. mai quello di un altro cliente (un codice che comincia col nome di un altro cliente), se ce ne sono altri;
   3. prima quello del cliente (il codice comincia col suo nome, o un tag è l'inizio del suo nome), poi quello col
      prezzo uguale alla tariffa o agli euro al km, poi quello col nome adatto (consulenza, prestazioni; rimborso
      chilometrico);
   4. a parità, quello usato più di recente per gli altri clienti, poi l'ordine del listino.
   Senza un servizio adatto la riga resta com'era prima (senza codice, "Prestazioni professionali di...").
3. **Una riga per rapportino**: la riga è una sola e mette insieme ore, km e spese, quindi prende il servizio delle
   ore (dei km se di ore non ce ne sono). Dividerla in una riga per servizio, come nel modello, è una scelta da fare
   con Andrea.
4. **Le bozze già fatte**: all'avvio il server (`sistemaBozze` in `fatture.js`, chiamato da `avvio.js`) mette il
   codice nelle righe di compenso delle bozze che non l'hanno, guardando l'unità (o il rapportino della riga); il
   testo scritto non si tocca, e ogni riga lo riceve una volta sola (se poi qualcuno toglie il codice apposta, non
   torna). Lo dice nel registro di avvio: "Bozze di fattura sistemate: ...".
5. **La ritenuta a zero col "sì"**. La bozza si ricorda la percentuale della ritenuta di quando è nata
   (`ritenuta_percentuale`). Con l'impostazione "Ritenuta" vuota le app mostrano 20 lo stesso, ma il server
   scriveva 0: la bozza diceva "sì" in basso e nei conti la ritenuta era zero. Ora la percentuale non è mai zero
   (`percentualeRitenuta`: l'impostazione, o 20), una bozza col "sì" e la percentuale a zero la riprende a ogni
   ricalcolo, e all'avvio il server rifà i conti delle bozze rimaste così. Le fatture pronte o emesse non si toccano.

## 7. Cambiamenti del 14/11/2026 (1.4.4, server 0.15.3): nelle righe solo i Servizi

Andrea, col modello della parcella davanti: "Per caso vedi qualche riferimento ai Rapportini? No. E cos'altro noti?
Forse che ci si basa solamente sui Servizi; e magari anche che la quantità non è sempre 1, magari cambia anche in base
a quante volte si è fatto quel lavoro, no? [...] Inoltre in fondo, nell'ultima pagina, ci sono anche delle indicazioni
da seguire". Il punto 3 del §6 ("una riga per rapportino") e i testi del punto 1 erano sbagliati: il modello è il
requisito, e nel modello ogni riga è un servizio.

1. **Un servizio per riga, per mese** (`righeRapportini` in `server/src/conti.js`, casi A-H in
   `server/prove/casi-fattura.json`). Dai rapportini scelti nascono, per ogni mese:
   - una riga delle **ore** per tariffa: codice e nome del servizio, " | " e il mese senza l'anno ("Consulenza tecnica
     a ore | luglio"), quantità = le ore del mese, unità del servizio;
   - una riga dei **km** per euro al km, allo stesso modo ("Rimborso chilometrico | Auto di esempio | luglio");
   - una riga per **indennità**: quelle uguali (codice, nome, unità e prezzo) stanno insieme e la quantità è la somma
     (tre trasferte sono una riga da 3, non tre righe da 1). Se il testo è ancora il nome del servizio com'è nel
     listino prende il mese; se chi l'ha aggiunta al lavoro ci ha scritto un dettaglio suo resta quello. Una indennità
     a zero resta in vista;
   - le spese non anticipate del mese in una riga, le anticipazioni una per spesa (come prima).
   Nelle righe non c'è più niente dei rapportini: né il numero, né il giorno, né quanti sono, né il lavoro svolto, né i
   codici dei progetti. I progetti (o la commessa) restano nella causale, cioè nelle Note del documento: "Prestazioni di
   ottobre 2026, progetti ED-001, ED-002"; con più mesi "Prestazioni di luglio e agosto 2026".
2. **"Una riga per rapportino" non c'è più**: tolta la scelta da Da fatturare, sul computer e sul telefono. Il server
   non legge più `raggruppa` (le app di prima lo mandano ancora) e `daFatturare` risponde sempre `mese`.
3. **Prezzo e sconto dal listino**. Il prezzo della riga è quello del servizio quando la tariffa dei rapportini ci
   arriva con uno sconto tondo (intero o mezzo punto) e il conto torna al centesimo: 40,00 col 25% per chi paga 30.
   Altrimenti il prezzo è la tariffa, senza sconto (45 di listino e 40 di tariffa non diventano "11,11%"). L'importo
   della riga è sempre la somma dei rapportini e non cambia.
4. **L'unità è quella del servizio** com'è nel listino. Nel listino venuto da Flextaxa i chilometri si contano a
   numero ("Nr"): un servizio a numero che si chiama rimborso chilometrico ora è riconosciuto come servizio dei km
   (`genereDiUnita`); prima la riga dei km restava senza codice.
5. **Le bozze già fatte** col modo di prima (`rifaiRigheDaiServizi` in `fatture.js`, da `sistemaBozze` all'avvio): le
   righe dei rapportini si rifanno con la regola nuova, una volta sola per bozza, con gli stessi importi e le stesse
   cose riservate. Non si toccano le righe scritte a mano, le scadenze, i ticket, e le bozze in cui qualcuno ha
   cambiato quantità o prezzi (la somma non torna più). Nel registro di avvio: "N con le righe rifatte dai Servizi".
6. **Le indicazioni in fondo al modello**, ricontrollate una per una:
   - *proseguire su altre pagine ripetendo testata, intestazioni tabella e numero di pagina*: la testata non si
     ripeteva. Ora preventivo, parcella pro-forma e parcella stanno in una tabella con la testata nell'intestazione
     (`paginaDoc` in `pc/ui/documenti.js`): chi stampa la ripete su ogni pagina. Provato con 9, 17 e 45 righe;
   - *righe intere, riepilogo unito, pagamento e note senza coprire il piè*: c'erano (`break-inside: avoid`);
   - *campi del mittente e del destinatario, etichetta Commessa/JOB, righe a zero e sconti a zero in vista, più
     scadenze, beneficiario distinto, BIC, note intere, A4 con 14 mm, Figtree, corpi 8-9/14/12 pt*: c'erano dalla 1.4.0;
   - *i conti come gli esempi, arrotondamenti compresi, e la ritenuta tolta una volta sola*: i due esempi rifatti col
     motore dei conti danno gli stessi numeri al centesimo (la prova coi numeri veri si fa fuori dal repository; nel
     repository ci sono i casi 31 e 32, inventati, con la stessa regola).
7. **Cosa resta com'era**: un ticket chiuso con "Una riga per l'intervento" fa ancora una riga sola (è una scelta della
   fase 5, e i ticket non sono in uso); le scadenze di pagamento di un contratto restano una riga per scadenza.
