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
