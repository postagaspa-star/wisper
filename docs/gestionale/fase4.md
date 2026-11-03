# Fase 4: fatturazione, banche e scadenze (accordo e schermate)

Si aggiunge ad [`architettura.md`](architettura.md), [`fase1-schermate.md`](fase1-schermate.md), [`fase2.md`](fase2.md)
e [`fase3.md`](fase3.md), che restano validi. Ricerca e fonti in [`ricerca-fase4.md`](ricerca-fase4.md). Prototipo:
[`docs/prototipo/Gestionale-fase4.html`](../prototipo/Gestionale-fase4.html).

Chi costruisce server, app Android e Wisper Ufficio legge **solo** questo file (più l'architettura): se qualcosa manca
o non torna, lo dice invece di inventare. Le parole delle schermate sono quelle scritte qui, uguali su telefono e
computer.

## 1. Cosa consegna

- **08 Fatturazione**: *Da fatturare* (scadenze di pagamento delle commesse, rapportini firmati o inviati, spese al
  cliente, ore fatturabili), la **bozza** con i conti (compenso, contributo integrativo EPPI, IVA, ritenuta, spese
  anticipate, bollo), il **passaggio al programma** di Manuel (prospetto da copiare + XML da completare), il **ritorno
  dell'XML** emesso (anche `.p7m` e `.zip`) con l'abbinamento alla bozza, gli **stati** fino a pagata, le **note di
  credito**, le **fatture ricevute** dai fornitori, le **scadenze di pagamento** delle commesse, il **riepilogo del
  fatturato**. L'invio allo SDI è segnato **Non collegato**.
- **09 Banche e scadenze**: i **conti** (nome e ultime cifre), i **movimenti** scritti a mano con la ricerca, gli
  **incassi** e i **pagamenti** anche in parte, lo **scadenziario** per data col saldo previsto e i giorni sotto soglia,
  **tributi, F24 e rate** (anche ricorrenti), la **situazione finanziaria**. Previsto, registrato e verificato in banca
  sempre distinti. Import degli estratti conto e collegamento alla banca: **Non collegato**.
- Dashboard con le voci nuove, permessi (il collaboratore non vede né Fatturazione né Banche), registro di tutto.
- La **Fatturazione di oggi** (il fine mese: una scheda per chi paga, Prepara riepilogo, Segna fatturati) non si perde:
  §13.1 dice dove va ogni pezzo.

## 2. Principi (dalla ricerca)

1. **La fattura nasce dal lavoro, non si ribatte**: tutto quello che è pronto da fatturare sta in una pagina sola,
   raggruppato per cliente; si sceglie e si prepara la bozza con un tocco (Pleya, "Da fatturare").
2. **Wisper prepara, il programma emette** (decisione 5). La bozza non è una fattura: nessun numero fiscale inventato,
   mai la parola "fattura" da sola su una bozza (si dice "bozza" o "pronta"), mai un invio allo SDI finto.
3. **Il passaggio non dipende dal programma**: un prospetto con tutti i campi nell'ordine in cui un programma li chiede
   funziona con chiunque; l'XML da completare è in più, per chi lo importa. Il ritorno è lo standard FatturaPA, che ogni
   programma esporta (ricerca §3).
4. **Una cosa si fattura una volta sola**, e lo garantisce il database, non l'interfaccia (§4.4).
5. **Le regole fiscali sono impostazioni, e finché il commercialista non le conferma si vede** su ogni conto
   (specifiche: "funzioni fiscali non validate indicate come non operative").
6. **Scaduta è un'indicazione, non uno stato**; pagata e pagata in parte arrivano da sole quando si segna l'incasso
   (AffiniPay, BillingNow, Relay).
7. **Il professionista spesso fattura all'incasso** (avviso di parcella, poi fattura entro 12 giorni dal pagamento):
   un incasso si può segnare anche su una bozza pronta, e Wisper ricorda la scadenza dei 12 giorni.
8. **Lo scadenziario risponde a "quando"**: una linea del tempo sola per incassi, pagamenti e tributi, col saldo
   previsto che si aggiorna riga per riga e i giorni sotto soglia in rosso con la parola (Pleya, Fatture in Cloud,
   guide alla previsione di cassa).
9. **Previsto, registrato, verificato in banca** sono tre cose diverse e si vedono diverse (specifiche, modulo 09).
10. **Quello che non è collegato si vede che non c'è** (specifiche §7): pillola "Non collegato", mai un pulsante che
    finge di funzionare.

## 3. Le scelte di questa fase, col perché

**3.1 Come si passa la bozza al programma senza sapere quale sia.** Il server prepara un **modello** della fattura
(§8.1: tutti i campi FatturaPA, normalizzati) e da quel modello nascono due **uscite**: il **prospetto** (PDF e testo,
campo per campo, con "Copia" su ogni campo: funziona con qualunque programma, anche ribattendo) e l'**XML da completare**
(FatturaPA FPR12 1.2.3 senza numero, per i programmi che importano bozze). Le uscite sono un elenco che il server
manda alle app (`uscite`): quando sapremo il programma se ne aggiunge una (un CSV, un collegamento) senza toccare
il resto (§8.4). Il ritorno non dipende dal programma: ogni programma esporta l'XML della fattura emessa.

**3.2 Come si evita la doppia fatturazione.** Ogni cosa da fatturare (una scadenza di pagamento, un rapportino, una
spesa, una riga di ore) entra in una fattura solo attraverso la tabella `fattura_sorgenti`, che ha un **indice unico sulle
righe attive**: la stessa sorgente non può stare in due fatture vive, nemmeno in due bozze, nemmeno se due persone
preparano insieme. Una sorgente torna libera solo quando la bozza la toglie o si scarta, o quando una **nota di credito**
la storna. In più: i rapportini e le ore di una **commessa a corpo** non compaiono in *Da fatturare* (sono già dentro il
prezzo del contratto: §5.1); un XML importato "senza bozza" propone di collegare le cose da fatturare dello stesso
cliente con gli stessi importi (§9.4), così una fattura fatta fuori da Wisper non lascia il lavoro ancora "da fatturare".

**3.3 Telefono e computer.** Ogni pagina e ogni azione c'è su tutti e due, con le stesse parole (decisione 2 di
Andrea: niente moduli ridotti sul telefono). Il computer resta il posto più comodo per la preparazione completa (passare
la bozza al programma vuol dire copiare campi, e si fa meglio con le due cose sullo stesso schermo; un conto sbagliato
costa una nota di credito e si controlla meglio in grande), ma sul telefono ci sono anche righe libere, prezzi e ordine
delle righe, note di credito, importazione di più file con l'abbinamento, riepilogo con l'esportazione, situazione
finanziaria, conti e impegni ricorrenti. Sul telefono l'ordine delle schermate mette davanti le cose da un minuto (cosa
c'è da fatturare, preparare la bozza con le righe proposte, condividere il prospetto, importare l'XML arrivato per
email, segnare l'incasso, guardare lo scadenziario); il resto sta un livello sotto (menu ⋯ o segmenti), mai con
pulsanti spenti. Nel prototipo restano quattro righe "si fa da Wisper Ufficio" (righe libere, note di credito,
riepilogo per cliente, nuovo conto): valgono come "un livello sotto", nel menu ⋯. (Nella prima stesura qui c'era una deroga con queste funzioni solo sul computer: tolta il 22/10/2026
per rispettare la decisione 2.)

**3.4 Regole non confermate.** Finché il titolare non segna in Amministrazione › Impostazioni fiscali "regole
confermate dal commercialista il …", in Fatturazione c'è una fascia fissa in cima, le righe del contributo, della
ritenuta e del bollo hanno la pillola **Da confermare**, il prospetto e l'XML portano la scritta "Conti da verificare:
regole non confermate dal commercialista" e "Passa al programma" chiede una conferma in più. Cambiare una regola
fiscale toglie la conferma.

## 4. Dati (migrazione 004)

`server/src/migrazioni/004-fatture-banche.sql`, con la copia `wisper.db.prima-4` prima (come le altre). Importi in euro,
arrotondati al centesimo con `centesimi()`; date `aaaa-mm-gg`. Le tabelle da cui si tolgono righe hanno `AUTOINCREMENT`.

### 4.1 Impostazioni nuove

Amministrazione › **Impostazioni fiscali** (salvate con `salvaImpostazioni`, valore in JSON):

| Chiave | Valore iniziale | Cosa |
|---|---|---|
| `REGIME_FISCALE` | `"RF01"` | `RF01` ordinario, `RF19` forfettario |
| `TIPO_DOCUMENTO` | `"TD01"` | `TD01` fattura o `TD06` parcella (da chiedere al commercialista) |
| `RITENUTA_TIPO` | `"RT01"` | codice della ritenuta nell'XML |
| `RITENUTA_CAUSALE` | `"A"` | causale del pagamento (modello CU) |
| `EPPI_TIPO_CASSA` | `"TC17"` | codice della cassa nell'XML (confermato dallo schema 1.2.3) |
| `BOLLO_SOGLIA` | `77.47` | il bollo scatta quando la parte senza IVA **supera** questa cifra |
| `BOLLO_IMPORTO` | `2` | |
| `BOLLO_RIVALSA` | `true` | il bollo si riaddebita al cliente (riga senza IVA) |
| `GIORNI_PAGAMENTO` | `30` | scadenza = data + giorni |
| `PAGAMENTO_FINE_MESE` | `false` | poi alla fine del mese |
| `MODALITA_PAGAMENTO` | `"MP05"` | bonifico |
| `PASSAGGIO_USCITE` | `["prospetto","xml"]` | le uscite del passaggio (§8.4) |
| `SOGLIA_CASSA` | `3000` | sotto questo saldo previsto il giorno è rosso |
| `REGOLE_FISCALI_CONFERMATE` | `null` | `{"data":"2026-11-05","commercialista":"Studio …","da":1}` quando le conferma il titolare |

Restano `IVA` (22), `EPPI_INTEGRATIVO` (5), `RITENUTA` (20) della fase 2. Amministrazione › **Dati dello studio** ha in
più: `CODICE_FISCALE`, `STUDIO_CAP`, `STUDIO_COMUNE`, `STUDIO_PROVINCIA` (`INDIRIZZO` resta via e numero), `ALBO`
(es. "Periti industriali"), `ALBO_PROVINCIA`, `ALBO_NUMERO`, `ALBO_DATA`. Il server rifiuta di salvare una regola
fiscale (le chiavi di questa tabella tranne `SOGLIA_CASSA` e `PASSAGGIO_USCITE`, più `IVA`, `EPPI_INTEGRATIVO`,
`RITENUTA`) senza mettere `REGOLE_FISCALI_CONFERMATE` a `null`, con la nota nel registro "regole cambiate: la conferma
del commercialista non vale più".

**Numerazioni** non ha le fatture: il numero lo dà il programma (lo dice una riga in Amministrazione › Numerazioni).

### 4.2 Colonne nuove su tabelle che ci sono

- `soggetti`: `sostituto_imposta` INTEGER (`null` = automatico: sì se c'è la partita IVA, no se non c'è; 0/1 scritto a
  mano, per esempio 1 per un condominio, 0 per un forfettario), `pagamento_giorni` INTEGER (`null` = impostazione),
  `pagamento_fine_mese` INTEGER (`null` = impostazione).
- `commesse`: `modo_fatturazione` TEXT NOT NULL DEFAULT `'ore'` CHECK in (`ore`, `corpo`, `misto`). La migrazione mette
  `corpo` alle commesse che hanno scadenze di pagamento, `ore` alle altre. `creaCommessaDaPreventivo` la crea `corpo`.
- `scadenze_pagamento`: `stato` vale `prevista` | `fatturata`; colonna nuova `fattura_id` INTEGER.
- `ore` (fase 3): `fatturata_il` TEXT NOT NULL DEFAULT `''`. (`spese.fatturata_il` e `rapportini.fatturato_il` ci sono
  già.)
- `file`: tipi nuovi `fattura` (l'XML o il `.p7m` di una fattura o nota emessa) e `ricevuta` (di una fattura ricevuta),
  colonne `fattura_id`, `ricevuta_id`. SQLite non cambia un CHECK: la tabella si rifà come nella 002 (se la 003 l'ha già
  rifatta, si rifà di nuovo da quella).
- `ricorrenze` (fase 2): `per` TEXT NOT NULL DEFAULT `'attivita'` (`attivita` | `impegno`): la stessa tabella serve agli
  impegni ricorrenti (§10.5), e l'allungamento notturno guarda `per`.

### 4.3 Tabelle nuove

**`fatture`** (fatture e note di credito emesse, dalla bozza in poi):
id INTEGER PK AUTOINCREMENT · `riferimento` TEXT UNIQUE (`'W-' || id`: il riferimento di Wisper, mai chiamato numero) ·
`tipo` `fattura` | `nota` · `tipo_documento` (`TD01`/`TD06` da `TIPO_DOCUMENTO`, `TD04` per le note; dopo l'emissione
quello dell'XML) · `fattura_collegata_id` (la fattura che una nota corregge) · `cliente_id` · `commessa_id` (`''` se le
righe sono di più commesse) · `stato` `bozza` | `pronta` | `emessa` | `scartata` | `annullata` · `data` (proposta finché
non è emessa, poi quella dell'XML) · `numero` (`''` finché non è emessa) · `numero_da` `''` | `xml` | `mano` · `chiave`
TEXT UNIQUE (dopo l'emissione: `partitaIvaStudio|tipoDocumento|anno|numero`, contro i doppioni) · `causale` ·
`note_interne` · congelati alla creazione: `regime`, `iva_percentuale`, `eppi_percentuale`, `ritenuta_percentuale`,
`ritenuta_applicata` (0/1, dal cliente), `bollo_soglia`, `bollo_importo`, `bollo_rivalsa` · i conti: `compenso`,
`contributo`, `base_iva`, `iva`, `anticipazioni`, `bollo`, `bollo_addebitato`, `totale`, `ritenuta`, `netto` · `totale_bozza`,
`netto_bozza` (i conti della bozza, tenuti quando l'XML è diverso) · `giorni_pagamento`, `fine_mese`, `scadenza_a_mano`
(0/1), `conto_id`, `modalita_pagamento` · `pronta_il`, `pronta_da` · `emessa_il` (quando Wisper l'ha saputo) · `file_id`
(l'XML emesso) · `nome_file_sdi` · `esito_sdi` `''` | `consegnata` | `non_consegnata` | `scartata` · `esito_il` ·
`avviso_inviato_il` · `scartata_il`, `annullata_il`, `motivo` · `regole_confermate` (la conferma valida quando è passata al
programma, o `''`) · `utente_id`, `creato`, `modificato`.

**`fattura_righe`**: id AUTOINCREMENT · `fattura_id` · `ordine` · `origine` `bozza` | `xml` · `gruppo` TEXT (le righe nate
insieme dalle stesse sorgenti, §5.3; `''` per una riga libera) · `tipo` `compenso` | `anticipazione` | `bollo` ·
`descrizione` · `quantita` · `unita` · `prezzo` · `importo` · `aliquota_iva` (22, o 0 per le righe senza IVA) · `natura`
(`''`, `N1`, `N2.2`) · `soggetta_ritenuta` (0/1) · `tributo_cliente` (0/1: un'anticipazione che è un tributo del
cliente, non conta per il bollo) · `commessa_id` · `periodo_da`, `periodo_a`.

**`fattura_sorgenti`**: id AUTOINCREMENT · `fattura_id` · `gruppo` · `tipo` `scadenza` | `rapportino` | `spesa` | `ore` ·
`sorgente_id` TEXT (l'id della riga: `RAP/2026/0142`, `8`...) · `importo` (quanto valeva quando è entrata) · `attiva`
(0/1) · `creato` · `liberata_il` · `liberata_perche` (`tolta dalla bozza`, `bozza scartata`, `nota di credito 3/2026`,
`scartata dallo SDI`...). **`CREATE UNIQUE INDEX fattura_sorgenti_una ON fattura_sorgenti(tipo, sorgente_id) WHERE
attiva = 1`**.

**`fattura_scadenze`**: id AUTOINCREMENT · `fattura_id` · `ordine` · `data` · `importo` · `modalita` · `iban`. Per una bozza
una sola, calcolata; dopo l'emissione quelle dell'XML (`DettaglioPagamento`), se ci sono.

**`fatture_ricevute`**: id AUTOINCREMENT · `fornitore_id` · `tipo_documento` · `numero` · `data` · `chiave` UNIQUE
(`partitaIvaFornitore|tipo|anno|numero`) · `descrizione` (le prime righe) · `categoria` `materiale` | `consulenze` |
`servizi` | `utenze` | `affitto` | `altro` · `commessa_id` (per i costi della commessa) · `spesa_id` (se è la stessa
spesa già fotografata, per non contarla due volte nei costi) · `imponibile`, `iva`, `contributo`, `bollo`, `totale`,
`ritenuta` (quella che lo studio trattiene e versa), `netto` (da pagare) · `ricevuta_collegata_id` (per le note di credito
dei fornitori) · `stato` `attiva` | `annullata` · `origine` `xml` | `mano` · `file_id` · `nome_file_sdi` · `scadenza_stimata`
(0/1) · `note` · `utente_id`, `creato`, `modificato`.

**`ricevuta_scadenze`**: id AUTOINCREMENT · `ricevuta_id` · `ordine` · `data` · `importo` · `modalita` · `iban`.

**`conti`**: id · `nome` ("Conto studio") · `banca` · `iban` (intero, serve al prospetto; nelle schermate si mostra solo
`…4521`, intero solo nel modulo del conto e nel prospetto) · `predefinito` (0/1, uno solo) · `soglia` (`null` =
`SOGLIA_CASSA`) · `attivo` · `note` · `creato`, `modificato`.

**`conto_saldi`**: id AUTOINCREMENT · `conto_id` · `data` · `saldo` · `utente_id` · `creato`. Il saldo letto sull'estratto
conto in quel giorno, scritto a mano: è il punto da cui si contano i movimenti.

**`movimenti`**: id AUTOINCREMENT · `conto_id` · `data` · `verso` `entrata` | `uscita` · `importo` (> 0) · `descrizione` ·
`soggetto_id` · `categoria` `incasso` | `pagamento` | `tributo` | `stipendio` | `giroconto` | `altro` · `verificato` (0/1:
visto sull'estratto conto) · `verificato_il`, `verificato_da` · `annullato` (0/1), `motivo` · `utente_id`, `creato`,
`modificato`. Nessun movimento si cancella: si annulla.

**`movimento_abbinamenti`**: id AUTOINCREMENT · `movimento_id` · `fattura_id` | `ricevuta_id` | `impegno_id` (uno solo:
CHECK) · `importo` (> 0) · `creato`. Un bonifico può pagare più fatture; una fattura può avere più incassi.

**`impegni`** (tributi, F24, rate e altre scadenze scritte a mano): id AUTOINCREMENT · `tipo` `f24` | `tributo` | `rata` |
`altro` · `verso` (di base `uscita`) · `descrizione` · `codice` (1040, 2523, 6033, E066...) · `scadenza` · `importo` (`null`
= da scrivere) · `conto_id` · `soggetto_id` · `ricorrenza_id`, `occorrenza` · `origine` `mano` | `ritenute` | `bollo` ·
`periodo` (`2026-10`, `2026-T3`) · `confermato` (0/1: le proposte di Wisper nascono 0) · `annullato`, `motivo` · `note` ·
`utente_id`, `creato`, `modificato`.

**`letture_xml`**: id (casuale, 22 caratteri) · `utente_id` · `creato` · `scade` (un'ora dopo) · `documenti` (JSON) ·
`cartella` (i file in attesa, sotto `/data/letture/`). Si svuota ogni ora; non va nel registro.

### 4.4 Una sorgente, una fattura

- `preparaFattura`, `salvaFattura` e `confermaXml` scrivono `fattura_sorgenti` dentro una transazione; se l'indice unico
  rifiuta, la risposta è `"RAP/2026/0142 è già nella bozza W-15 per Rossi Impianti Srl"` (o `"…nella fattura 45/2026"`) e
  non si salva niente.
- Una sorgente **attiva** in una fattura `bozza` o `pronta` è *riservata*: non compare in *Da fatturare* e non si
  modifica (§7.3). In una fattura `emessa` è *fatturata*.
- Si libera (`attiva = 0` con `liberata_il` e `liberata_perche`) solo: togliendo il suo gruppo dalla bozza, scartando la
  bozza, con una nota di credito emessa che la storna, con uno scarto dello SDI (resta riservata: §9.6).

## 5. Da fatturare: da dove nasce una riga

### 5.1 Le sorgenti e quando sono pronte

| Sorgente | È da fatturare quando | Importo | Non compare se |
|---|---|---|---|
| **Scadenza di pagamento** (acconto, avanzamento, saldo) | `stato = prevista`, ha una commessa non archiviata | `scadenze_pagamento.importo` (la parte di compenso) | è riservata o fatturata |
| **Rapportino** | `FIRMATO` o `INVIATO`, `stato_approvazione` vuoto o `approvato`, la commessa (se c'è) è `ore` o `misto` | `compenso_ore + rimborso_km` (le sue spese sono sorgenti a parte) | la commessa è `corpo`; è riservato |
| **Spesa** (fase 3) | `destinazione = cliente`, `stato = approvata`, `fatturata_il` vuoto, il cliente si sa (della spesa, della commessa o del rapportino) | `importo` | è riservata |
| **Ore registrate** (fase 3) | `fatturabile = 1`, `stato = approvata`, `fatturata_il` vuoto, commessa `ore` o `misto` | ore × prezzo orario (`prezzoOrarioDi(cliente, commessa)`; senza prezzo: riga senza prezzo, §8.2) | commessa `corpo`; è riservata |

- **Pronta o più avanti** (solo per le scadenze): `firma` è pronta; `avanzamento` è pronta ("a fine progetto: quando lo
  decidi tu"); `fine` è pronta se la commessa è CHIUSA, se no va in *Più avanti*; `data` è pronta se la data è entro 15
  giorni, se no *Più avanti*. Le scadenze di *Più avanti* si possono fatturare lo stesso (si sceglie anche da lì).
- Le **trasferte** (fase 3) sono costi dello studio e non vanno in fattura; i km al cliente passano dai rapportini.
- Un rapportino con `spese > 0` e nessuna riga `spese` legata (non dovrebbe succedere dopo la 003) porta le sue spese
  nel proprio importo, come spese non anticipate.
- Le sorgenti sono di **un cliente**: una fattura è per un cliente solo.

### 5.2 Le righe che nascono

Ogni sorgente (o ogni gruppo di sorgenti) diventa una o più righe; tipo `compenso` (IVA 22%, contributo, ritenuta se il
cliente è sostituto) o `anticipazione` (N1, fuori da tutto). Testi esatti (numeri all'italiana):

- **Scadenza**: `"{descrizione}: {descrizione della commessa} (commessa {id}, contratto {etichetta del preventivo})"`,
  quantità 1, prezzo = importo. Es. `"40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003,
  contratto PR/2026/012 rev. 1)"` 1.520,00. Senza preventivo: `"(commessa {id})"`.
- **Rapportini**, due modi (`raggruppa`):
  - `rapportino` (di base, tranne per i clienti a tariffa fissa): una riga per rapportino, importo = compenso ore + km +
    sue spese non anticipate: `"Rapportino {id} del {gg/mm/aaaa}: {descrizione} ({ore pagate} ore, {km} km, spese {x} €)"`
    (le parti a zero non si scrivono), quantità 1.
  - `mese` (di base per i clienti con tariffa fissa, come Elettrodinamica): per mese e cliente, **una riga di ore per
    tariffa** (`"Prestazioni professionali di {mese} {anno} ({n} rapportini)"`, quantità = ore pagate, unità `ore`,
    prezzo = tariffa), **una riga di km per €/km** (`"Rimborso chilometrico di {mese} {anno}"`, con `" ({€/km} €/km)"` in
    fondo se i €/km sono più d'uno; quantità km, unità `km`), **una riga di spese** non anticipate (`"Spese di viaggio e
    materiale di {mese} {anno}"`, quantità 1). L'importo di ogni riga è la **somma degli importi delle sorgenti** (i
    rapportini sono già arrotondati e firmati): se quantità × prezzo non torna al centesimo (straordinari maggiorati,
    arrotondamenti), la riga diventa "a corpo": quantità 1, unità vuota, prezzo = somma, e nella descrizione dopo
    `"{n} rapportini"` si aggiunge `", {ore} ore di cui {x} straordinarie"` (o `", {ore} ore"`).
  - Ore pagate = ore di lavoro + straordinarie + viaggio se il cliente paga il viaggio.
- **Spesa al cliente non anticipata** non legata a un rapportino: `"{descrizione} del {gg/mm/aaaa}"`, compenso.
- **Anticipazione** (sempre una riga per spesa): `"Spesa anticipata per conto del cliente: {descrizione} del {gg/mm/aaaa}"`,
  tipo `anticipazione`, natura N1, aliquota 0.
- **Ore registrate**: per commessa, mese e prezzo: `"Ore di lavoro su {commessa} {descrizione} di {mese} {anno}"`,
  quantità ore, unità `ore`, prezzo orario.
- **Bollo riaddebitato**: la riga `"Imposta di bollo"` tipo `bollo`, N1, 2,00: **non si scrive a mano**, la aggiunge e
  la toglie il server quando rifà i conti.

### 5.3 I gruppi

Le righe nate insieme hanno lo stesso `gruppo` (es. `rapportini:C001:2026-09`, `scadenza:8`, `spesa:31`, `ore:26ST045:2026-10:42`)
e le sorgenti lo stesso `gruppo`. **Togliere una riga che ha un gruppo toglie tutto il gruppo** (le righe e le sorgenti,
che tornano da fatturare), con conferma che dice cosa torna ("Tornano da fatturare 6 rapportini di settembre"). Si può
cambiare descrizione, quantità e prezzo di una riga di un gruppo: le sorgenti restano sue (la pagina mostra "era 317,88").

## 6. I conti della fattura

Solo nel server: `contiFattura(f)` in `server/src/conti.js`. Telefono (`rapportino/Fatture.kt`) e computer
(`pc/ui/regole-fatture.js`) la rifanno uguale per l'anteprima mentre si cambia una bozza, e passano gli stessi casi.

```
f = {regime: 'ordinario'|'forfettario', ivaPercentuale, eppiPercentuale, ritenutaPercentuale,
     ritenuta: true|false (il cliente è sostituto d'imposta), bolloSoglia, bolloImporto, bolloRivalsa: true|false,
     righe: [{tipo: 'compenso'|'anticipazione', quantita, prezzo, importo?, tributoCliente?}]}
```

Ogni pezzo **arrotondato al centesimo prima di sommare** (`centesimi(n) = Math.round(n * 100) / 100`):

1. importo di una riga = `importo` se c'è (righe raggruppate), se no quantità × prezzo (quantità mancante = 1);
2. `compenso` = somma delle righe `compenso`; `anticipazioni` = somma delle righe `anticipazione`;
3. `contributo` = compenso × EPPI / 100;
4. ordinario: `baseIva` = compenso + contributo; `iva` = baseIva × IVA / 100. Forfettario: `baseIva` = 0, `iva` = 0;
5. `parteSenzaIva` = anticipazioni che non sono tributi del cliente (forfettario: + compenso + contributo);
6. `bollo` = bolloImporto se parteSenzaIva **>** bolloSoglia, se no 0; `bolloAddebitato` = bollo se bolloRivalsa, se no 0;
7. `totale` = baseIva + iva + anticipazioni + bolloAddebitato (forfettario: compenso + contributo + anticipazioni +
   bolloAddebitato) = il **totale della fattura** (`ImportoTotaleDocumento`);
8. `ritenuta` = compenso × RITENUTA / 100 se ordinario e il cliente è sostituto, se no 0;
9. `netto` = totale − ritenuta = il **netto da incassare**.

Risposta: `{righe: [importi], compenso, contributo, baseIva, iva, anticipazioni, parteSenzaIva, bollo, bolloAddebitato,
totale, ritenuta, netto}`. La riga `bollo` di §5.2 c'è quando `bolloAddebitato > 0`; non entra tra le righe di `f` (i conti
la aggiungono da soli). Una nota di credito usa la stessa funzione con gli importi positivi.

### 6.1 I casi condivisi: `server/prove/casi-fattura.json`

Il server crea il file **così** (i valori sono fatti a mano e controllati); `server/prove/conti.test.js`,
`app/src/test/.../FattureTest.kt` e `pc/prove/fatture.test.js` lo leggono dal suo posto e devono ritrovare ogni numero
al centesimo (`deepEqual` sui campi di `atteso`). I `raggruppamenti` li prova solo il server (le righe le fa lui).

```json
{
  "nota": "I conti della fattura (docs/gestionale/fase4.md §6). Li fa il server (server/src/conti.js, contiFattura); telefono e computer li rifanno per l'anteprima e devono dare gli stessi numeri al centesimo. Importo riga = importo se c'e', se no quantita x prezzo; compenso = righe compenso; contributo = compenso x EPPI / 100; base IVA = compenso + contributo; IVA = base x IVA / 100; parte senza IVA = anticipazioni che non sono tributi del cliente; bollo se la parte senza IVA supera la soglia; totale = base + IVA + anticipazioni + bollo riaddebitato; ritenuta = compenso x ritenuta / 100 solo se il cliente e' sostituto; netto = totale - ritenuta. Ogni pezzo arrotondato al centesimo (Math.round(n * 100) / 100) prima di sommare. Forfettario: niente IVA e niente ritenuta, la parte senza IVA comprende compenso e contributo. Valori fatti a mano.",
  "base": {"regime": "ordinario", "ivaPercentuale": 22, "eppiPercentuale": 5, "ritenutaPercentuale": 20, "bolloSoglia": 77.47, "bolloImporto": 2, "bolloRivalsa": true},
  "casi": [
    {"nome": "1. acconto 30% di 26ST003 (3.800 x 30%), cliente sostituto",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 1140}]},
     "atteso": {"righe": [1140], "compenso": 1140, "contributo": 57, "baseIva": 1197, "iva": 263.34, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 1460.34, "ritenuta": 228, "netto": 1232.34}},
    {"nome": "2. 40% a fine progetto di 26ST003 con una spesa anticipata e il bollo",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 1520}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 120}]},
     "atteso": {"righe": [1520, 120], "compenso": 1520, "contributo": 76, "baseIva": 1596, "iva": 351.12, "anticipazioni": 120, "parteSenzaIva": 120, "bollo": 2, "bolloAddebitato": 2, "totale": 2069.12, "ritenuta": 304, "netto": 1765.12}},
    {"nome": "3. l'esempio della circolare EPPI 2015 (progetto 2.500)",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 2500}]},
     "atteso": {"righe": [2500], "compenso": 2500, "contributo": 125, "baseIva": 2625, "iva": 577.5, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 3202.5, "ritenuta": 500, "netto": 2702.5}},
    {"nome": "4. un privato: niente ritenuta (Mario Bianchi)",
     "fattura": {"ritenuta": false, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 600}]},
     "atteso": {"righe": [600], "compenso": 600, "contributo": 30, "baseIva": 630, "iva": 138.6, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 768.6, "ritenuta": 0, "netto": 768.6}},
    {"nome": "5. Elettrodinamica, un mese in tre righe: 38 ore a 30, 312 km a 0,76, pedaggi",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 38, "prezzo": 30}, {"tipo": "compenso", "quantita": 312, "prezzo": 0.76}, {"tipo": "compenso", "quantita": 1, "prezzo": 16.8}]},
     "atteso": {"righe": [1140, 237.12, 16.8], "compenso": 1393.92, "contributo": 69.7, "baseIva": 1463.62, "iva": 322, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 1785.62, "ritenuta": 278.78, "netto": 1506.84}},
    {"nome": "6. spesa anticipata sotto la soglia: niente bollo",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 450}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 60}]},
     "atteso": {"righe": [450, 60], "compenso": 450, "contributo": 22.5, "baseIva": 472.5, "iva": 103.95, "anticipazioni": 60, "parteSenzaIva": 60, "bollo": 0, "bolloAddebitato": 0, "totale": 636.45, "ritenuta": 90, "netto": 546.45}},
    {"nome": "7. spese anticipate di 77,47 esatti: niente bollo (deve superare)",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 100}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 77.47}]},
     "atteso": {"righe": [100, 77.47], "compenso": 100, "contributo": 5, "baseIva": 105, "iva": 23.1, "anticipazioni": 77.47, "parteSenzaIva": 77.47, "bollo": 0, "bolloAddebitato": 0, "totale": 205.57, "ritenuta": 20, "netto": 185.57}},
    {"nome": "8. spese anticipate di 77,48: bollo riaddebitato",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 100}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 77.48}]},
     "atteso": {"righe": [100, 77.48], "compenso": 100, "contributo": 5, "baseIva": 105, "iva": 23.1, "anticipazioni": 77.48, "parteSenzaIva": 77.48, "bollo": 2, "bolloAddebitato": 2, "totale": 207.58, "ritenuta": 20, "netto": 187.58}},
    {"nome": "9. bollo a carico dello studio: c'e' ma non entra nel totale",
     "fattura": {"ritenuta": true, "bolloRivalsa": false, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 100}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 77.48}]},
     "atteso": {"righe": [100, 77.48], "compenso": 100, "contributo": 5, "baseIva": 105, "iva": 23.1, "anticipazioni": 77.48, "parteSenzaIva": 77.48, "bollo": 2, "bolloAddebitato": 0, "totale": 205.58, "ritenuta": 20, "netto": 185.58}},
    {"nome": "10. solo spese anticipate, nessun compenso",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "anticipazione", "quantita": 1, "prezzo": 150}]},
     "atteso": {"righe": [150], "compenso": 0, "contributo": 0, "baseIva": 0, "iva": 0, "anticipazioni": 150, "parteSenzaIva": 150, "bollo": 2, "bolloAddebitato": 2, "totale": 152, "ritenuta": 0, "netto": 152}},
    {"nome": "11. ore con i resti: 7,5 a 42,30 e 2,5 a 38,90 (il contributo vale 20,725: mezzo centesimo in su)",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 7.5, "prezzo": 42.3}, {"tipo": "compenso", "quantita": 2.5, "prezzo": 38.9}]},
     "atteso": {"righe": [317.25, 97.25], "compenso": 414.5, "contributo": 20.73, "baseIva": 435.23, "iva": 95.75, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 530.98, "ritenuta": 82.9, "netto": 448.08}},
    {"nome": "12. nota di credito parziale: 200 di compenso stornati",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 200}]},
     "atteso": {"righe": [200], "compenso": 200, "contributo": 10, "baseIva": 210, "iva": 46.2, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 256.2, "ritenuta": 40, "netto": 216.2}},
    {"nome": "13. regime forfettario: niente IVA, niente ritenuta, bollo sul tutto",
     "fattura": {"regime": "forfettario", "ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 1000}]},
     "atteso": {"righe": [1000], "compenso": 1000, "contributo": 50, "baseIva": 0, "iva": 0, "anticipazioni": 0, "parteSenzaIva": 1050, "bollo": 2, "bolloAddebitato": 2, "totale": 1052, "ritenuta": 0, "netto": 1052}},
    {"nome": "14. quantita' con i resti: 3 a 123,45 e 2 a 61,15",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 3, "prezzo": 123.45}, {"tipo": "compenso", "quantita": 2, "prezzo": 61.15}]},
     "atteso": {"righe": [370.35, 122.3], "compenso": 492.65, "contributo": 24.63, "baseIva": 517.28, "iva": 113.8, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 631.08, "ritenuta": 98.53, "netto": 532.55}},
    {"nome": "15. un tributo del cliente non conta per il bollo (16 + 70 = 86, ma conta 70)",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "prezzo": 300}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 16, "tributoCliente": true}, {"tipo": "anticipazione", "quantita": 1, "prezzo": 70}]},
     "atteso": {"righe": [300, 16, 70], "compenso": 300, "contributo": 15, "baseIva": 315, "iva": 69.3, "anticipazioni": 86, "parteSenzaIva": 70, "bollo": 0, "bolloAddebitato": 0, "totale": 470.3, "ritenuta": 60, "netto": 410.3}},
    {"nome": "16. righe raggruppate con l'importo gia' fatto (somma dei rapportini)",
     "fattura": {"ritenuta": true, "righe": [{"tipo": "compenso", "quantita": 1, "importo": 1140}, {"tipo": "compenso", "quantita": 1, "importo": 237.12}]},
     "atteso": {"righe": [1140, 237.12], "compenso": 1377.12, "contributo": 68.86, "baseIva": 1445.98, "iva": 318.12, "anticipazioni": 0, "parteSenzaIva": 0, "bollo": 0, "bolloAddebitato": 0, "totale": 1764.1, "ritenuta": 275.42, "netto": 1488.68}}
  ],
  "raggruppamenti": [
    {"nome": "A. Elettrodinamica, settembre: una riga per il mese",
     "raggruppa": "mese", "cliente": {"id": "C001", "tariffaFissa": 30, "pagaViaggio": false},
     "rapportini": [
       {"id": "RAP/2026/0118", "data": "2026-09-03", "oreLavoro": 6, "oreExtra": 0, "oreViaggio": 1, "tariffa": 30, "maggExtra": 0, "compensoOre": 180, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52},
       {"id": "RAP/2026/0121", "data": "2026-09-08", "oreLavoro": 7, "oreExtra": 0, "oreViaggio": 1, "tariffa": 30, "maggExtra": 0, "compensoOre": 210, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52},
       {"id": "RAP/2026/0124", "data": "2026-09-11", "oreLavoro": 5, "oreExtra": 0, "oreViaggio": 1, "tariffa": 30, "maggExtra": 0, "compensoOre": 150, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52},
       {"id": "RAP/2026/0127", "data": "2026-09-16", "oreLavoro": 8, "oreExtra": 0, "oreViaggio": 0, "tariffa": 30, "maggExtra": 0, "compensoOre": 240, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52},
       {"id": "RAP/2026/0129", "data": "2026-09-21", "oreLavoro": 6, "oreExtra": 0, "oreViaggio": 0, "tariffa": 30, "maggExtra": 0, "compensoOre": 180, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52},
       {"id": "RAP/2026/0133", "data": "2026-09-24", "oreLavoro": 6, "oreExtra": 0, "oreViaggio": 0, "tariffa": 30, "maggExtra": 0, "compensoOre": 180, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52}],
     "spese": [
       {"id": 11, "idRapportino": "RAP/2026/0118", "data": "2026-09-03", "descrizione": "Pedaggio", "importo": 8.4, "anticipazione": false},
       {"id": 14, "idRapportino": "RAP/2026/0124", "data": "2026-09-11", "descrizione": "Pedaggio", "importo": 8.4, "anticipazione": false}],
     "atteso": {"righe": [
       {"tipo": "compenso", "descrizione": "Prestazioni professionali di settembre 2026 (6 rapportini)", "quantita": 38, "unita": "ore", "prezzo": 30, "importo": 1140},
       {"tipo": "compenso", "descrizione": "Rimborso chilometrico di settembre 2026", "quantita": 312, "unita": "km", "prezzo": 0.76, "importo": 237.12},
       {"tipo": "compenso", "descrizione": "Spese di viaggio e materiale di settembre 2026", "quantita": 1, "unita": "", "prezzo": 16.8, "importo": 16.8}],
       "gruppo": "rapportini:C001:2026-09", "sorgenti": 8}},
    {"nome": "B. Rossi Impianti, un rapportino in una riga e la sua spesa anticipata a parte",
     "raggruppa": "rapportino", "cliente": {"id": "C002", "tariffaFissa": null, "pagaViaggio": false},
     "rapportini": [
       {"id": "RAP/2026/0142", "data": "2026-10-21", "descrizione": "Collaudo quadro", "oreLavoro": 6.5, "oreExtra": 0, "oreViaggio": 1, "tariffa": 42, "maggExtra": 0, "compensoOre": 273, "km": 48, "euroKm": 0.76, "rimborsoKm": 36.48}],
     "spese": [
       {"id": 29, "idRapportino": "RAP/2026/0142", "data": "2026-10-21", "descrizione": "Pedaggio", "importo": 8.4, "anticipazione": false},
       {"id": 30, "idRapportino": "RAP/2026/0142", "data": "2026-10-21", "descrizione": "Corriere per i documenti", "importo": 12, "anticipazione": true}],
     "atteso": {"righe": [
       {"tipo": "compenso", "descrizione": "Rapportino RAP/2026/0142 del 21/10/2026: Collaudo quadro (6,5 ore, 48 km, spese 8,40 €)", "quantita": 1, "unita": "", "prezzo": 317.88, "importo": 317.88},
       {"tipo": "anticipazione", "descrizione": "Spesa anticipata per conto del cliente: Corriere per i documenti del 21/10/2026", "quantita": 1, "unita": "", "prezzo": 12, "importo": 12}],
       "sorgenti": 3}},
    {"nome": "C. due €/km nello stesso mese (le tabelle ACI cambiate): due righe di km",
     "raggruppa": "mese", "cliente": {"id": "C001", "tariffaFissa": 30, "pagaViaggio": false},
     "rapportini": [
       {"id": "RAP/2027/0002", "data": "2027-01-08", "oreLavoro": 6, "oreExtra": 0, "oreViaggio": 0, "tariffa": 30, "maggExtra": 0, "compensoOre": 180, "km": 52, "euroKm": 0.76, "rimborsoKm": 39.52},
       {"id": "RAP/2027/0005", "data": "2027-01-15", "oreLavoro": 6, "oreExtra": 0, "oreViaggio": 0, "tariffa": 30, "maggExtra": 0, "compensoOre": 180, "km": 52, "euroKm": 0.79, "rimborsoKm": 41.08}],
     "spese": [],
     "atteso": {"righe": [
       {"tipo": "compenso", "descrizione": "Prestazioni professionali di gennaio 2027 (2 rapportini)", "quantita": 12, "unita": "ore", "prezzo": 30, "importo": 360},
       {"tipo": "compenso", "descrizione": "Rimborso chilometrico di gennaio 2027 (0,76 €/km)", "quantita": 52, "unita": "km", "prezzo": 0.76, "importo": 39.52},
       {"tipo": "compenso", "descrizione": "Rimborso chilometrico di gennaio 2027 (0,79 €/km)", "quantita": 52, "unita": "km", "prezzo": 0.79, "importo": 41.08}],
       "sorgenti": 2}},
    {"nome": "D. straordinari maggiorati: la riga delle ore diventa a corpo",
     "raggruppa": "mese", "cliente": {"id": "C002", "tariffaFissa": null, "pagaViaggio": false},
     "rapportini": [
       {"id": "RAP/2026/0150", "data": "2026-10-26", "oreLavoro": 6, "oreExtra": 2, "oreViaggio": 0, "tariffa": 42, "maggExtra": 25, "compensoOre": 357, "km": 0, "euroKm": 0.76, "rimborsoKm": 0},
       {"id": "RAP/2026/0153", "data": "2026-10-28", "oreLavoro": 4, "oreExtra": 0, "oreViaggio": 0, "tariffa": 42, "maggExtra": 25, "compensoOre": 168, "km": 0, "euroKm": 0.76, "rimborsoKm": 0}],
     "spese": [],
     "atteso": {"righe": [
       {"tipo": "compenso", "descrizione": "Prestazioni professionali di ottobre 2026 (2 rapportini, 12 ore di cui 2 straordinarie)", "quantita": 1, "unita": "", "prezzo": 525, "importo": 525}],
       "sorgenti": 2}}
  ]
}
```

## 7. Stati e passaggi

### 7.1 Lo stato della fattura (salvato) e quello che si vede

| Da | Azione | A | Note |
|---|---|---|---|
| — | `preparaFattura`, `nuovaFattura`, `preparaNotaCredito` | `bozza` | le sorgenti diventano riservate |
| `bozza` | `salvaFattura` | `bozza` | solo in bozza; i conti si rifanno |
| `bozza` | `passaAlProgramma` | `pronta` | controlla `mancano`; regole non confermate = conferma |
| `pronta` | `tornaInBozza` | `bozza` | solo senza XML abbinato |
| `bozza`, `pronta` | `scartaFattura` | `scartata` | le sorgenti tornano libere ("bozza scartata") |
| `bozza`, `pronta` | `confermaXml` (abbina) | `emessa` | numero, data e importi dall'XML; effetti §7.2 |
| `bozza`, `pronta` | `segnaEmessa` (numero scritto a mano) | `emessa` | `numero_da = mano`; effetti §7.2 |
| `emessa` (a mano) | `confermaXml` con stesso numero e anno | `emessa` | l'XML si attacca, `numero_da = xml` |
| `emessa` | `confermaXml` di uno scarto SDI | `pronta` | effetti tolti, sorgenti restano riservate (§9.6) |
| `emessa` | nota di credito emessa che copre tutto il totale | `annullata` | le sorgenti scelte tornano libere |

**Pagamento** (calcolato, non salvato): `incassato` = somma degli abbinamenti; `residuo` = netto − note di credito emesse
collegate (il loro netto) − incassato. `pagamento` = `pagata` se residuo ≤ 0, `in_parte` se incassato > 0, se no
`da_incassare`. **Scaduta** = residuo > 0 e la prima scadenza non coperta è prima di oggi (le rate si coprono in ordine di
data); `giorniScaduta`. Su una `bozza`/`pronta` con incassi (avviso di parcella) il residuo si conta sul netto della bozza;
quando è coperta, `daEmettereEntro` = giorno dell'incasso che l'ha coperta + 12.

**`statoVisto`** (la parola da mostrare): `scartata` → **Scartata** (grigia); `annullata` → **Annullata** (grigia); `bozza`
→ **Bozza** (grigia); `pronta` → **Pronta** (blu; con incassi: "Pronta · già pagata", e la riga gialla "Va emessa entro
…"); `emessa` → **Scaduta** (rosso tenue) se scaduta, se no **Pagata** (verde) se pagata, **Pagata in parte** (ambra) se in
parte, **Emessa** (blu). Le note: **Nota di credito** (grigia) + lo stato.

### 7.2 Effetti dell'emissione (e del loro contrario)

Quando una fattura diventa `emessa`, nella stessa transazione, per ogni sorgente attiva:
- rapportino → `FATTURATO`, `fatturato_il` = data della fattura;
- scadenza di pagamento → `stato = fatturata`, `fattura_id`;
- spesa → `fatturata_il` = data della fattura; ore → `fatturata_il` = data della fattura;
- registro: una riga per ogni cambio, nota `"dalla fattura 45/2026 (W-15)"`.

Il contrario (nota di credito che storna una sorgente, scarto dello SDI): rapportino → `INVIATO` se ha `inviato_il`, se no
`FIRMATO`, `fatturato_il = ''`; scadenza → `prevista`, `fattura_id = null`; spesa e ore → `fatturata_il = ''`; nota
`"stornato dalla nota di credito 3/2026"` o `"la fattura 45/2026 è stata scartata dallo SDI"`.

### 7.3 Cosa non si può più fare a una sorgente riservata o fatturata

- Rapportino: `salvaRapportino` (contenuto), `cambiaStato` (BOZZA, INVIATO, ANNULLATO), firme, foto → `"Il rapportino
  RAP/2026/0142 è nella bozza W-15 per Rossi Impianti Srl: toglilo prima dalla bozza"` oppure `"…è nella fattura
  45/2026: per cambiarlo serve una nota di credito"`. `cambiaStato FATTURATO` su un rapportino riservato:
  `"Diventa fatturato da solo quando torna l'XML della fattura W-15"`. Su un rapportino non legato a niente resta
  possibile (serve per quelli fatturati fuori da Wisper), con la nota `"segnato fatturato a mano, senza fattura in
  Wisper"`; "Non ancora fatturato" vale solo per questi.
- Spesa: `salvaSpesa` (importo, destinazione, anticipazione, cliente), `togliSpesa`; ore: `salvaOre`, `togliOre`; scadenza:
  cambiare importo o toglierla. Stessi messaggi.

## 8. Il passaggio al programma

### 8.1 Il modello

`pacchetto {id}` (e `passaAlProgramma`) rispondono con il **modello**: la fattura con tutti i campi FatturaPA, già
calcolati. Le due uscite (prospetto e XML) e il PDF nascono solo da qui.

```json
{"riferimento": "W-15", "tipoDocumento": "TD01", "divisa": "EUR", "dataProposta": "2026-10-22", "numero": "",
 "prestatore": {"denominazione": "Studio Tecnico GM", "partitaIva": "…", "codiceFiscale": "…", "regimeFiscale": "RF01",
   "albo": {"nome": "Periti industriali", "provincia": "VI", "numero": "…", "data": "…"},
   "sede": {"indirizzo": "…", "cap": "…", "comune": "…", "provincia": "VI", "nazione": "IT"}, "pec": "…", "email": "…"},
 "committente": {"denominazione": "Rossi Impianti Srl", "nome": "", "cognome": "", "partitaIva": "04455667788",
   "codiceFiscale": "", "sede": {"indirizzo": "Via Nuova 3", "cap": "36061", "comune": "Bassano del Grappa", "provincia": "VI", "nazione": "IT"},
   "codiceDestinatario": "0000000", "pec": "rossiimpianti@pec.esempio.it"},
 "righe": [
   {"numero": 1, "descrizione": "40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)",
    "quantita": 1, "unitaMisura": "", "prezzoUnitario": 1520, "prezzoTotale": 1520, "aliquotaIva": 22, "natura": "", "ritenuta": true},
   {"numero": 2, "descrizione": "Spesa anticipata per conto del cliente: Pratica di connessione al distributore del 14/10/2026",
    "quantita": 1, "unitaMisura": "", "prezzoUnitario": 120, "prezzoTotale": 120, "aliquotaIva": 0, "natura": "N1", "ritenuta": false},
   {"numero": 3, "descrizione": "Imposta di bollo", "quantita": 1, "unitaMisura": "", "prezzoUnitario": 2, "prezzoTotale": 2,
    "aliquotaIva": 0, "natura": "N1", "ritenuta": false}],
 "cassa": {"tipo": "TC17", "aliquota": 5, "imponibile": 1520, "importo": 76, "aliquotaIva": 22, "natura": "", "ritenuta": false},
 "ritenuta": {"tipo": "RT01", "aliquota": 20, "importo": 304, "causale": "A"},
 "bollo": {"virtuale": true, "importo": 2},
 "riepilogo": [
   {"aliquotaIva": 22, "natura": "", "imponibile": 1596, "imposta": 351.12, "esigibilita": "I", "riferimentoNormativo": ""},
   {"aliquotaIva": 0, "natura": "N1", "imponibile": 122, "imposta": 0, "esigibilita": "", "riferimentoNormativo": "Escluse ex art. 15 DPR 633/72"}],
 "totaleDocumento": 2069.12, "nettoAPagare": 1765.12,
 "pagamento": {"condizioni": "TP02", "dettagli": [{"modalita": "MP05", "scadenza": "2026-11-21", "importo": 1765.12,
   "iban": "IT…4521", "istituto": "Banca di esempio"}]},
 "causale": ["40% a fine progetto, commessa 26ST003. Rif. Wisper W-15"],
 "regoleConfermate": false}
```

- `committente`: un privato (senza partita IVA) ha `nome` e `cognome` (presi dal nome: l'ultima parola è il cognome, si
  può correggere nel cliente), `codiceFiscale` e `codiceDestinatario` `"0000000"`. Con il codice SDI: quello; con la sola PEC:
  `"0000000"` + PEC.
- `riepilogo`: una voce per IVA 22% (righe compenso + contributo) e una per N1 (anticipazioni + bollo riaddebitato).
  Forfettario: `N2.2` per compenso e contributo, `riferimentoNormativo` `"Operazione in franchigia da IVA (regime
  forfettario)"` (da confermare).
- `iban` nel modello è intero; nelle schermate si mostra `…4521` tranne nella sezione Pagamento del prospetto.
- `causale` porta sempre **"Rif. Wisper W-15"**: se il programma la tiene nell'XML, il ritorno si abbina da solo (§9.3).

### 8.2 Prima di passare: cosa manca

`passaAlProgramma` e `pacchetto` danno `mancano: [{campo, testo}]`; con qualcosa in `mancano` non si passa (niente
conferma: sono campi che il programma chiederebbe comunque):
`cliente` "La partita IVA o il codice fiscale del cliente" · `indirizzo` "L'indirizzo del cliente: via, CAP, città e
provincia" · `destinatario` "Il codice destinatario o la PEC del cliente" (solo con partita IVA) · `studio` "I dati dello
studio per la fattura: scrivili in Amministrazione › Dati dello studio" (partita IVA, codice fiscale, regime, via, CAP,
comune, provincia) · `iban` "L'IBAN del conto su cui farti pagare: scrivilo in Banche e scadenze › Conti" (con MP05) ·
`righe` "Almeno una riga" · `prezzi` "{n} righe senza prezzo" · `totale` "Il totale è zero" · `pa` "Fatture alla pubblica
amministrazione: Wisper non le prepara ancora" (codice destinatario di 6 caratteri).

Regole non confermate (e nient'altro che manca): `{"ok": false, "errore": "Le regole delle fatture non sono ancora
confermate dal commercialista: passala lo stesso?", "serveConferma": true}`; con `conferma: true` passa e la fattura
tiene `regole_confermate = ''`.

### 8.3 Le due uscite

**Prospetto** (`pacchetto.prospetto`): `{titolo: "Prospetto per il programma delle fatture", sezioni: [{titolo,
campi: [{etichetta, valore}]}], testo}`. Sezioni e campi, in quest'ordine: **Cliente** (Denominazione o Nome e Cognome,
Partita IVA, Codice fiscale, Indirizzo, CAP, Comune, Provincia, Codice destinatario, PEC) · **Documento** (Tipo: "Fattura
(TD01)", Data proposta, Numero: "lo dà il programma", Causale) · **Righe** (per riga: Descrizione, Quantità, Prezzo, IVA
"22%" o "Senza IVA (N1, art. 15)", Ritenuta sì/no) · **Cassa previdenziale** (EPPI TC17, 5%, imponibile, importo, IVA
22%) · **Ritenuta** (RT01, 20%, causale A, importo) · **Bollo** (virtuale, 2,00) · **Riepilogo IVA** · **Totali** (Totale
della fattura, Netto da incassare) · **Pagamento** (Bonifico MP05, Scadenza, Importo, IBAN, Banca). `testo` = tutto in
righe "Etichetta: valore", per "Copia tutto". Il PDF lo fanno le app con `prospettoFattura(modello)` in
`pc/ui/documenti.js` (stesso modello per telefono e computer, come rapportino e preventivo): intestazione "Prospetto per
il programma delle fatture · non è una fattura", riferimento W-15, i campi, piè di pagina "Preparato da Wisper il
22/10/2026 · regole fiscali confermate dal commercialista il …" oppure "· regole fiscali NON ancora confermate dal
commercialista: conti da verificare".

**XML da completare** (`pacchetto.xml`: `{nome, mime: "application/xml", base64}`): FatturaPA FPR12, schema 1.2.3, dal
modello; `Numero` = `"BOZZA"` (non è un numero: il programma lo deve cambiare); `ProgressivoInvio` = `"W15"`;
`IdTrasmittente` = IT + partita IVA dello studio; `Causale` come sopra (più "Conti da verificare: regole non confermate dal
commercialista" se non lo sono). Nome del file: `"Bozza W-15 Rossi Impianti Srl - non inviare.xml"` (mai il formato
`IT…_….xml` dei file da trasmettere). Scritto dal server in `server/src/fatturapa.js` (lo stesso file che legge, §9).

**Avviso di parcella** (facoltativo, domanda 3): `avvisoParcella(modello)` in `documenti.js`, "Avviso di parcella", cliente,
righe, totali, netto, IBAN, piè "Documento senza valore fiscale: la fattura si emette al pagamento"; si manda con
`inviaAvviso` (§11.1). Non cambia lo stato.

### 8.4 Il punto che cambierà quando sapremo il programma

`server/src/passaggio/` ha un file per uscita (`prospetto.js`, `xml.js`) e un elenco: `PASSAGGIO_USCITE` dice quali
mandare; le app mostrano solo le uscite che arrivano in `pacchetto.uscite` (un pulsante per uscita, testi in §13). Quando
Andrea dirà il programma:
- se importa le bozze XML: si prova l'XML da completare con un file vero e si sistemano qui `Numero`, `ProgressivoInvio`
  e `Causale`;
- se è un servizio che **invia l'XML così com'è** (senza rinumerare): si aggiunge alla finestra del passaggio il campo
  "Numero della fattura", scritto da Manuel e **mai proposto da Wisper**;
- se ha un modo suo (CSV, un collegamento con chiave): una uscita nuova `passaggio/<nome>.js`, che legge lo stesso modello.
Nient'altro cambia: stati, sorgenti, ritorno.

## 9. Il ritorno dell'XML

### 9.1 Lettura (`server/src/fatturapa.js`, senza dipendenze)

- **File accettati**: `.xml`, `.p7m` (DER, o la busta intera in base64: comincia con `MII`), `.zip` (lettore minimo:
  directory centrale + `zlib.inflateRawSync`; niente zip dentro zip). Al massimo 300 file e 30 MB per volta.
- **p7m**: si percorre il DER (tag, lunghezze anche indefinite) fino a `SignedData` → `encapContentInfo` → `[0]` →
  `OCTET STRING`; se è "costruito" si concatenano i pezzi. La firma **non si verifica** (Wisper legge e basta; la
  conservazione a norma resta del programma o dell'Agenzia).
- **XML**: lettore piccolo (elementi, attributi, testo, entità, CDATA, commenti); codifica dal prologo (UTF-8 con o senza
  BOM, ISO-8859-1, windows-1252 con `TextDecoder`); si usa il **nome locale** (prefissi qualunque). Un file con più
  `FatturaElettronicaBody` dà più documenti.
- **Che documento è**: radice `FatturaElettronica` → una fattura; `RicevutaConsegna` (RC), `NotificaMancataConsegna`
  (MC), `NotificaScarto` (NS) → esiti; `MetadatiInvioFile` e il resto → ignorati ("non serve").
- **Da che parte**: cedente = studio (stessa partita IVA, senza `IT`) → **emessa**; cessionario = studio → **ricevuta**;
  nessuno dei due → `"Non è una fattura dello studio: né chi la emette né chi la riceve è Studio Tecnico GM"`.
  `TipoDocumento` TD16-TD21, TD29: `"Autofattura o integrazione: Wisper non la gestisce"`.
- **Importi letti**: `compenso` = righe senza natura (forfettario: N2.2 tranne il bollo); `anticipazioni` = righe N1 tranne
  quella del bollo (descrizione con "bollo" e importo uguale a `ImportoBollo`), che va in `bolloAddebitato`; `contributo`
  = somma di `ImportoContributoCassa`; `iva` = somma di `Imposta`; `baseIva` = imponibili del riepilogo con aliquota > 0;
  `bollo` = `ImportoBollo`; `totale` = `ImportoTotaleDocumento`, o se manca somma di imponibili e imposte del riepilogo;
  `ritenuta` = somma di `ImportoRitenuta`; `netto` = somma di `ImportoPagamento`, o se manca totale − ritenuta; scadenze
  = `DettaglioPagamento` con data.
- **Doppioni**: `chiave` uguale a una già importata → proposta `gia` ("Già importata il 20/10"); stessa chiave ma
  importi diversi → `gia` con l'avviso "C'è già con importi diversi: tenuta quella di prima".

### 9.2 Due passi: leggere, poi confermare

`leggiXml` non cambia niente: legge, propone e tiene i file per un'ora (`letture_xml`). `confermaXml` applica le scelte
(tutte insieme in una transazione; i file originali diventano `file` tipo `fattura`/`ricevuta`).

### 9.3 Abbinare una fattura emessa alla sua bozza

Per ogni emessa (fattura o nota), in quest'ordine:
1. **Cliente**: per partita IVA o codice fiscale del cessionario. Nessuno → proposta di crearlo dai dati dell'XML
   (`clienteNuovo`), o di sceglierne uno.
2. **Riferimento**: `W-<n>` trovato in `Causale`, nelle descrizioni delle righe o in `AltriDatiGestionali` → se la `W-n` è
   di quel cliente e in `bozza`/`pronta` → **certa**.
3. Altrimenti le candidate: bozze e pronte (prima le pronte, poi dalla più vecchia) dello stesso cliente e dello stesso
   tipo (fattura/nota), con la data dell'XML tra 3 giorni prima del passaggio e 60 giorni dopo.
   - una con totale uguale (±0,01) → **probabile**; più d'una → **probabile** con la più vecchia e le altre in
     `alternative`;
   - nessuna uguale ma ce n'è almeno una → **diversa**: si propone la pronta più recente con le `differenze` (totale,
     compenso, contributo, IVA, ritenuta, spese anticipate, bollo: `{campo, bozza, xml}`) e `righeMancanti`: le righe della
     bozza che non ritrovo nell'XML (stesso importo e stesso tipo, una per una), coi loro gruppi;
   - nessuna → **nessuna**: proposta `senzaBozza`.

**Cosa succede se non combacia**: con **diversa** l'utente sceglie *Abbina lo stesso* (vince l'XML: importi, scadenze e
righe dell'XML salvate come `origine = xml`; la bozza tiene `totale_bozza`/`netto_bozza`; i gruppi di `righeMancanti`
**tornano da fatturare**, già spuntati, si possono togliere) oppure *Non abbinare* (la bozza resta com'è, l'XML diventa una
fattura "senza bozza" o si salta). Niente si abbina senza conferma, nemmeno il **certa** (è solo già scelto).

### 9.4 Una fattura emessa senza bozza

`senzaBozza`: si crea una fattura `emessa` con righe e importi dell'XML (`origine = xml`), senza sorgenti (va comunque
nello scadenziario per gli incassi). Per non lasciare "da fatturare" quello che è stato fatturato fuori, la proposta ha
`collegabili`: le sorgenti libere di quel cliente, con spuntate quelle il cui importo (o la cui somma per gruppo: un mese
di rapportini, una scadenza) è uguale al compenso dell'XML; si conferma con `collega: [{tipo, id}]`, che le lega alla
fattura (attive) con gli effetti di §7.2.

### 9.5 Note di credito (TD04)

- **Preparata in Wisper**: `preparaNotaCredito {idFattura, tutta: true}` copia tutte le righe; con `righe: [{idRiga,
  importo?}]` solo quelle (importo più piccolo = storno parziale di una riga). Si passa al programma come una fattura
  (TD04, `DatiFattureCollegate` = numero e data della fattura). Le sorgenti dei gruppi delle righe stornate **per intero**
  sono quelle che torneranno libere.
- **Al ritorno** (TD04 emessa): la fattura collegata si trova da `DatiFattureCollegate` (numero + anno, stesso cliente) o
  dalla bozza della nota (§9.3). Effetti: le sorgenti scelte tornano libere (§7.2 al contrario); se la somma dei totali delle
  note copre il totale della fattura → `annullata`. Una TD04 importata senza bozza e non totale chiede nella conferma "Cosa
  torna da fatturare?" con i gruppi della fattura (nessuno spuntato).

### 9.6 Esiti dello SDI

RC (consegnata) e MC (non consegnata, ma a disposizione nell'area riservata: la fattura vale) → `esito_sdi`. **NS
(scartata)**: la fattura torna `pronta` con `esito_sdi = scartata`, gli effetti di §7.2 si tolgono, le sorgenti restano
riservate a lei; in pagina la riga rossa "Lo SDI l'ha scartata il {data}: correggila nel programma e importa di nuovo
l'XML". L'esito si abbina col `NomeFile` (salvato quando si importa l'XML); senza la fattura importata: `"Esito per un
file che Wisper non ha"` (si salta).

### 9.7 Fatture ricevute

Fornitore per partita IVA (o codice fiscale); nessuno → si crea alla conferma (fornitore nuovo, codice F…, coi dati
dell'XML). Scadenze da `DettaglioPagamento`; senza data → data + 30 giorni con `scadenza_stimata = 1` ("Scadenza non
scritta nella fattura: messa a 30 giorni"). Con `DatiRitenuta` lo studio è sostituto d'imposta: `ritenuta` salvata, netto
da pagare = totale − ritenuta, e quando si segna il pagamento nasce (o cresce) la proposta d'impegno §10.5. Una spesa
della fase 3 con stesso giorno (±3), stesso importo e stesso fornitore o descrizione simile → avviso "Potrebbe essere la
spesa del 14/10 di 21,90 €: collegala per non contarla due volte nei costi" (`idSpesa` nella scelta). TD04 di un fornitore →
`ricevuta_collegata_id`, riduce il da pagare.

## 10. Banche e scadenze

### 10.1 Conti e saldo

- Il **saldo di un conto** oggi = l'ultimo `conto_saldi` + entrate − uscite dei movimenti non annullati con data **dopo** quel
  giorno. È "registrato", non "verificato": la pagina dice "dall'ultimo saldo scritto il 01/10".
- `aggiornaSaldo` scrive il saldo letto in banca; dopo 30 giorni senza, la Dashboard lo chiede.
- Collegamento alla banca e importa estratto conto: pillola **Non collegato**, nessuna azione.

### 10.2 Movimenti e abbinamenti

- Un movimento si scrive a mano (data, conto, entrata/uscita, importo, descrizione, chi, categoria) e si può
  **abbinare** a fatture, ricevute, impegni: la somma degli abbinamenti non supera l'importo del movimento (`"Hai
  abbinato 1.300,00 su un movimento di 1.232,34"`), e su una fattura non supera il residuo (`"La fattura 45/2026 ha ancora
  da incassare 1.232,34: non puoi abbinarne 1.300,00"`).
- `segnaIncasso` e `segnaPagamento` sono la strada corta: creano il movimento già abbinato (importo proposto = residuo;
  meno del residuo = "in parte").
- **Tre livelli**, sempre con la parola: **Previsto** (una scadenza aperta: niente movimento), **Registrato** (movimento
  scritto), **Verificato in banca** (movimento con la spunta "L'ho visto sull'estratto conto").
- Annullare un movimento toglie i suoi abbinamenti (la fattura torna da incassare), con motivo.

### 10.3 Scadenziario

Righe, per data:
- **entrate**: rate di `fattura_scadenze` di fatture emesse con residuo; bozze `pronte` col loro netto (pillola "Da emettere");
  scadenze di pagamento delle commesse `prevista` con `quando = data` ("Dal contratto");
- **uscite**: `ricevuta_scadenze` con da pagare; `impegni` non pagati (anche con `importo` nullo: "importo da scrivere",
  non conta nel saldo);
- con data passata e non coperte: in cima, gruppo **Scaduti**.

**Saldo previsto** (prudente): parte dal saldo di oggi dei conti scelti; somma riga per riga dal giorno di oggi; le
**uscite scadute** contano oggi, le **entrate scadute no** (non si sa quando arriveranno: la pagina lo dice sotto il
saldo). Ogni giorno ha il suo saldo di fine giornata; sotto la soglia (del conto, o `SOGLIA_CASSA` per tutti i conti)
il giorno è rosso con la parola **Sotto soglia**. Le scadenze di pagamento delle commesse senza data stanno in un totale a
parte "Senza data" (non contano).

### 10.4 Situazione finanziaria

Saldo di oggi (per conto e totale) · Da incassare (residuo delle emesse; di cui scaduto) · Da pagare entro 30 giorni
(ricevute + impegni; di cui scaduto) · Saldo previsto fra 30, 60, 90 giorni · primo giorno sotto soglia · 13 settimane
(entrate, uscite, saldo a fine settimana) · Fatturato dell'anno (compenso delle emesse − note) · Incassato dell'anno.

### 10.5 Tributi, F24 e rate (impegni)

- Scritti a mano: tipo, descrizione, codice, scadenza, importo (anche vuoto: "da scrivere"), conto, note; **ricorrenti**
  con la regola della fase 2 (`ricorrenze.per = 'impegno'`, ogni N mesi o anni, fine facoltativa): le occorrenze si creano
  per i prossimi **12 mesi** e si allungano ogni notte; cambiare una ricorrente chiede "solo questa / da questa in poi /
  tutte" come le attività.
- **Proposte di Wisper** (`confermato = 0`, pillola "Proposta"): (1) **ritenute da versare**: per ogni mese in cui si sono
  pagate fatture ricevute con ritenuta, un impegno `f24` codice 1040, scadenza il 16 del mese dopo (il giorno dopo se è
  sabato, domenica o festivo), importo = somma delle ritenute pagate (in proporzione se pagate in parte), descrizione
  "Ritenute sui compensi pagati a {mese}"; (2) **bollo delle fatture elettroniche**: per trimestre, impegno codice
  2521-2524, importo = 2 € × fatture emesse nel trimestre con bollo, scadenze della ricerca §1 (31/5, 30/9, 30/11 e 28/2
  dell'anno dopo, spostate al primo giorno lavorativo; i rinvii sotto i 5.000 € non si propongono), descrizione "Bollo delle fatture del {n}° trimestre (stima: controlla nel
  portale)". Una proposta si conferma (`confermaImpegno`), si cambia o si toglie; si aggiorna da sola finché non è
  confermata.
- Wisper **non calcola** IVA, IRPEF e contributi: li scrive chi li sa (il commercialista).

## 11. Azioni nuove

Tutte con `ok`; modulo e livello tra parentesi. **Tutte le azioni di Fatturazione e di Banche vogliono anche `costi` ≥ 1**
(senza: `"Per vedere le fatture serve anche il permesso dei soldi: chiedi al titolare"`, `permesso:false`). Le azioni che
scrivono vogliono una POST. Campi dei soldi nuovi da aggiungere a `CAMPI_COSTI` (servono dove una risposta arriva a chi non
ha `costi`, come la commessa e la Dashboard): `compenso`, `anticipazioni`, `bollo`, `bolloAddebitato`, `ritenuta`, `netto`,
`incassato`, `residuo`, `parteSenzaIva`, `totaleBozza`, `nettoBozza`, `saldo`, `saldoPrevisto`, `entrate`, `uscite`,
`daIncassare`, `daPagare`, `fatturato`, `fattureInBozza`, `scaduto`, `incassiSettimana`, `pagamentiSettimana`, `saldoConti`,
e le colonne `base_iva`, `bollo_addebitato`, `totale_bozza`, `netto_bozza`.

### 11.1 Fatturazione

- `daFatturare {idCliente?, idCommessa?}` (fatturazione 1):
  ```json
  {"ok": true, "oggi": "2026-10-22", "totale": 4119.8, "clienti": 3,
   "gruppi": [{"idCliente": "C002", "cliente": "Rossi Impianti Srl", "sostituto": true, "mancano": [], "totale": 2125.88,
     "voci": [
       {"tipo": "scadenza", "id": 8, "idCommessa": "26ST003", "data": "", "titolo": "40% a fine progetto",
        "dettaglio": "26ST003 · Adeguamento impianto elettrico capannone · PR/2026/012 rev. 1", "quando": "avanzamento",
        "pronta": true, "importo": 1520, "anticipazione": false, "gruppo": "commessa:26ST003"},
       {"tipo": "spesa", "id": 31, "idCommessa": "26ST003", "data": "2026-10-14", "titolo": "Pratica di connessione al distributore",
        "dettaglio": "26ST003 · ricevuta intestata al cliente", "pronta": true, "importo": 120, "anticipazione": true, "gruppo": "commessa:26ST003"},
       {"tipo": "rapportino", "id": "RAP/2026/0142", "idCommessa": "26ST045", "data": "2026-10-21", "titolo": "Collaudo quadro",
        "dettaglio": "26ST045 · 6,5 ore · 48 km", "pronta": true, "importo": 309.48, "spese": [29], "totaleConSpese": 317.88,
        "anticipazione": false, "gruppo": "rapportini:C002:2026-10"},
       {"tipo": "spesa", "id": 29, "idRapportino": "RAP/2026/0142", "...": "..."},
       {"tipo": "ore", "id": 57, "idCommessa": "26ST045", "data": "2026-10-21", "titolo": "Collaudo quadro: preparazione verbali",
        "dettaglio": "26ST045 · 4 ore × 42,00 €", "pronta": true, "importo": 168, "senzaPrezzo": false, "gruppo": "ore:26ST045:2026-10"}]}],
   "piuAvanti": [{"tipo": "scadenza", "id": 9, "idCliente": "C002", "titolo": "Saldo a fine lavori", "quando": "fine", "importo": 1140, "...": "..."}],
   "inBozza": [{"idFattura": 14, "riferimento": "W-14", "idCliente": "C003", "stato": "pronta", "voci": 1, "totale": 320.25}],
   "riepiloghi": [{"idCliente": "C001", "mese": "2026-09", "rapportini": 6, "inviatoIl": "2026-09-30T18:05:00"}],
   "raggruppa": {"C001": "mese", "C002": "rapportino", "C003": "rapportino"}}
  ```
  `totale` dei gruppi = solo le voci `pronta`. `mancano` del cliente = quello che servirà al passaggio (§8.2), per
  saperlo prima. Le voci sono ordinate: scadenze, spese della commessa, rapportini per data (ognuno seguito dalle sue
  spese), ore.
- `preparaFattura {idCliente, voci: [{tipo, id}], raggruppa?: "mese"|"rapportino", data?}` (fatturazione 2) → `{"ok": true,
  "fattura": {...§11.2}}`: bozza nuova con le righe di §5.2, congelati IVA, EPPI, ritenuta (dal cliente), bollo, giorni di
  pagamento (cliente, poi impostazioni), conto predefinito. Le spese di un rapportino scelto vengono con lui anche se non
  mandate. Errori: `"Scegli almeno una cosa da fatturare"`, `"Una fattura è per un cliente solo"`, `"{x} non è più da
  fatturare"` (cambiata nel frattempo), quelli di §4.4.
- `nuovaFattura {idCliente}` (fatturazione 2): bozza vuota (righe libere).
- `fatture {stato?, pagamento?, scadute?, tipo?, idCliente?, idCommessa?, testo?, anno?}` (fatturazione 1): elenco
  (le scartate solo con `stato: "scartata"`), i più recenti prima (le bozze e le pronte in cima). `testo` cerca in numero,
  riferimento, cliente, causale. Ogni voce come §11.2 senza `righe`, `sorgenti`, `incassi`.
- `fattura {id}` (fatturazione 1; `id` interno, `"W-15"`, o `{numero, anno}`) → §11.2.
- `salvaFattura {fattura: {id, data?, scadenza?, giorniPagamento?, fineMese?, idConto?, causale?, noteInterne?,
  ritenuta?, tipoDocumento?, righe?: [{id?, gruppo?, tipo, descrizione, quantita?, unita?, prezzo?, tributoCliente?}]}}`
  (fatturazione 2), solo in `bozza`. `righe`, se c'è, è l'elenco intero nell'ordine voluto: quelle senza `id` si creano
  (libere: `gruppo` vuoto), quelle che mancano si tolgono; **se manca anche solo una riga di un gruppo, si toglie tutto il
  gruppo e le sue sorgenti tornano libere** (la risposta ha `liberate: [{tipo, id, descrizione}]`); la riga del bollo si
  ignora. `scadenza` scritta a mano resta anche cambiando la data (`scadenzaAMano: true`); `scadenza: null` la fa tornare
  calcolata. Errori: `"La fattura W-15 è già stata passata al programma: per cambiarla falla tornare in bozza"`, `"Riga:
  scrivi la descrizione"`, `"Quantità: non può essere negativa"`, `"Prezzo: non può essere negativo"`.
- `scartaFattura {id, motivo?}` (fatturazione 2): da `bozza`/`pronta`. Con la pronta: `serveConferma` "La W-15 è già nel
  programma: scartala solo se lì non l'hai emessa".
- `passaAlProgramma {id, conferma?}` (fatturazione 2) → `{"ok": true, "fattura": {...}, "pacchetto": {...§11.3}}`; errori
  §8.2.
- `pacchetto {id}` (fatturazione 1): anche per una bozza (anteprima) o un'emessa (rivedere) → §11.3.
- `tornaInBozza {id}` (fatturazione 2): da `pronta`; nota "tornata in bozza".
- `segnaEmessa {id, numero, data, conferma?}` (fatturazione 2): da `bozza`/`pronta`, senza XML. Prima risposta
  `serveConferma`: "Il numero lo scrivi tu: deve essere quello che ha dato il tuo programma. Gli importi restano quelli
  della bozza finché non importi l'XML". Errori: `"Numero: scrivi il numero che ha dato il programma"`, `"C'è già la fattura
  45/2026"`.
- `inviaAvviso {id, a, cc?, oggetto?, messaggio?, allegati: [{nome, mime, base64}]}` (fatturazione 2, solo POST): come
  `inviaEmail` col PDF dell'avviso; segna `avviso_inviato_il`.
- `leggiXml {file: [{nome, base64}]}` (fatturazione 2) → §11.4.
- `confermaXml {idLettura, scelte: [{chiave, azione: "abbina"|"senzaBozza"|"salta", idFattura?, creaCliente?, idCliente?,
  idCommessa?, collega?: [{tipo, id}], libera?: ["gruppo"...], idSpesa?, categoria?}]}` (fatturazione 2) → `{"ok": true,
  "conteggi": {"abbinate": 1, "nuove": 1, "ricevute": 1, "note": 0, "esiti": 0, "saltate": 1}, "fatture": [...],
  "ricevute": [...]}`. `libera` = i gruppi da far tornare da fatturare (righe mancanti, note di credito).
  Errori: `"La lettura è scaduta: carica di nuovo i file"`, quelli di §4.4.
- `preparaNotaCredito {idFattura, tutta?, righe?: [{idRiga, importo?}], motivo}` (fatturazione 2): da `emessa`. Errori:
  `"Motivo: scrivi perché la correggi"`, `"Si storna al massimo quello che c'è: {x}"`.
- `segnaFatturataFuori {voci: [{tipo, id}], nota?}` (fatturazione 2): per il passaggio, le cose già fatturate prima di
  Wisper (rapportino → FATTURATO, scadenza → `fatturata` senza fattura, spesa e ore → `fatturata_il`); nota nel registro
  "fatturata fuori da Wisper".
- `ricevute {stato?: "da_pagare"|"pagate"|"tutte", idFornitore?, idCommessa?, testo?, anno?}` (fatturazione 1); `ricevuta
  {id}`; `salvaRicevuta {ricevuta: {id?, idFornitore, numero, data, totale, imponibile?, iva?, ritenuta?, scadenze: [{data,
  importo}], categoria?, idCommessa?, idSpesa?, descrizione?, note?}}` (fatturazione 2: a mano tutto; per quelle da XML solo
  categoria, commessa, spesa, note, scadenze se stimate); `annullaRicevuta {id, motivo}`.
- `scadenzePagamento {idCommessa?, stato?}` (fatturazione 1): le scadenze delle commesse con `stato` visto `prevista` |
  `in_bozza` | `fatturata` | `incassata` (fattura pagata), fattura (numero o W-n), importo.
- `fatturazioneCommessa {id}` (fatturazione 1): `{contratto, fatturato, incassato, daFatturare, inBozza, previsto,
  scadenze, fatture}` per la barra della commessa.
- `riepilogoFatturato {anno, per: "mese"|"cliente"|"commessa"}` (fatturazione 1): righe `{chiave, nome, fatture, compenso,
  contributo, iva, anticipazioni, totale, ritenute, incassato}` (emesse per data, meno le note), più `totali`.
- `confermaRegoleFiscali {data, commercialista}` (amministrazione 2, **solo titolare**): scrive
  `REGOLE_FISCALI_CONFERMATE`; `{data: null}` la toglie.

### 11.2 Una fattura (risposta)

```json
{"id": 15, "riferimento": "W-15", "etichetta": "Bozza W-15", "tipo": "fattura", "tipoDocumento": "TD01",
 "idCliente": "C002", "cliente": "Rossi Impianti Srl", "idCommessa": "26ST003", "idFatturaCollegata": null,
 "stato": "bozza", "statoVisto": "Bozza", "pagamento": "da_incassare", "scaduta": false, "giorniScaduta": 0,
 "data": "2026-10-22", "numero": "", "numeroDa": "", "causale": "40% a fine progetto, commessa 26ST003",
 "noteInterne": "", "regime": "ordinario", "ivaPercentuale": 22, "eppiPercentuale": 5, "ritenutaPercentuale": 20,
 "ritenuta": true, "bolloRivalsa": true,
 "conti": {"righe": [1520, 120], "compenso": 1520, "contributo": 76, "baseIva": 1596, "iva": 351.12, "anticipazioni": 120,
   "parteSenzaIva": 120, "bollo": 2, "bolloAddebitato": 2, "totale": 2069.12, "ritenuta": 304, "netto": 1765.12},
 "totaleBozza": null, "nettoBozza": null,
 "scadenze": [{"id": 21, "data": "2026-11-21", "importo": 1765.12, "modalita": "MP05", "coperta": 0}],
 "scadenzaAMano": false, "idConto": 1, "conto": "Conto studio …4521",
 "righe": [
   {"id": 41, "ordine": 1, "origine": "bozza", "gruppo": "scadenza:8", "tipo": "compenso", "descrizione": "40% a fine progetto: …",
    "quantita": 1, "unita": "", "prezzo": 1520, "importo": 1520, "aliquotaIva": 22, "natura": "", "ritenuta": true,
    "tributoCliente": false, "idCommessa": "26ST003", "importoSorgenti": 1520},
   {"id": 42, "ordine": 2, "gruppo": "spesa:31", "tipo": "anticipazione", "natura": "N1", "importo": 120, "...": "..."},
   {"id": 43, "ordine": 3, "gruppo": "", "tipo": "bollo", "descrizione": "Imposta di bollo", "importo": 2, "natura": "N1", "...": "..."}],
 "sorgenti": [{"tipo": "scadenza", "id": "8", "gruppo": "scadenza:8", "descrizione": "40% a fine progetto · 26ST003", "importo": 1520, "attiva": true},
   {"tipo": "spesa", "id": "31", "gruppo": "spesa:31", "descrizione": "Pratica di connessione al distributore", "importo": 120, "attiva": true}],
 "incassato": 0, "residuo": 1765.12, "incassi": [], "daEmettereEntro": "",
 "note": [], "esitoSdi": "", "prontaIl": "", "emessaIl": "", "avvisoInviatoIl": "",
 "file": null, "modificabile": true, "mancano": [], "regoleConfermate": false, "puoScrivere": true,
 "creato": "2026-10-22T10:15:00", "modificato": "2026-10-22T10:15:00"}
```
`etichetta`: "Bozza W-15", "Pronta W-15", "45/2026" (emessa), "Nota di credito 3/2026". Un incasso:
`{"idMovimento": 9, "data": "2026-10-12", "importo": 500, "conto": "Conto studio …4521", "verificato": false}`. Una nota:
`{"id": 18, "numero": "3/2026", "data": "…", "totale": 256.2, "netto": 216.2, "stato": "emessa"}`. `file`: `{"id": "…", "url":
"/file/…", "nome": "IT01234567890_00045.xml.p7m"}`.

### 11.3 Il pacchetto (risposta)

`{"ok": true, "uscite": ["prospetto", "xml"], "modello": {...§8.1}, "mancano": [], "prospetto": {"titolo": "…", "sezioni":
[{"titolo": "Cliente", "campi": [{"etichetta": "Denominazione", "valore": "Rossi Impianti Srl"}]}], "testo": "…"},
"xml": {"nome": "Bozza W-15 Rossi Impianti Srl - non inviare.xml", "mime": "application/xml", "base64": "…"}}`.

### 11.4 La lettura degli XML (risposta)

```json
{"ok": true, "idLettura": "kq3V…", "documenti": [
  {"chiave": "f1#1", "nomeFile": "IT01234567890_00046.xml.p7m", "tipo": "emessa", "tipoDocumento": "TD01",
   "numero": "46/2026", "data": "2026-10-22", "controparte": {"nome": "Mario Bianchi", "partitaIva": "", "codiceFiscale": "BNCMRA…", "idSoggetto": "C003"},
   "conti": {"compenso": 250, "contributo": 12.5, "iva": 57.75, "anticipazioni": 0, "bollo": 0, "totale": 320.25, "ritenuta": 0, "netto": 320.25},
   "scadenze": [{"data": "2026-11-19", "importo": 320.25}], "righe": [{"descrizione": "Sopralluogo e rilievo", "importo": 250, "natura": ""}],
   "proposta": {"azione": "abbina", "certezza": "certa", "idFattura": 14, "riferimento": "W-14", "alternative": [],
                "differenze": [], "righeMancanti": [], "collegabili": []},
   "avvisi": []},
  {"chiave": "f2#1", "tipo": "ricevuta", "tipoDocumento": "TD01", "numero": "1287", "data": "2026-10-16",
   "controparte": {"nome": "Comel Forniture Elettriche", "partitaIva": "09988776655", "idSoggetto": "F001"},
   "conti": {"totale": 486, "imponibile": 398.36, "iva": 87.64, "ritenuta": 0, "netto": 486},
   "proposta": {"azione": "nuova"}, "avvisi": []},
  {"chiave": "f3#1", "tipo": "emessa", "numero": "45/2026", "proposta": {"azione": "gia", "idFattura": 13}, "avvisi": ["Già importata il 20/10"]},
  {"chiave": "f4#1", "tipo": "esito", "esito": "consegnata", "nomeFileFattura": "IT01234567890_00045.xml.p7m", "proposta": {"azione": "abbina", "idFattura": 13}}],
 "scartati": [{"nomeFile": "foto.jpg", "motivo": "Non è un file di fattura: servono .xml, .p7m o .zip"}]}
```
`certezza`: `certa` | `probabile` | `diversa` | `nessuna`; `azione` proposta: `abbina` | `senzaBozza` | `nuova` (ricevuta) |
`gia` | `salta`. Gli avvisi sono frasi pronte.

### 11.5 Banche e scadenze

- `conti {}` (banche 1) → `{"conti": [{"id": 1, "nome": "Conto studio", "banca": "Banca di esempio", "ultimeCifre":
  "4521", "iban": "…", "predefinito": true, "soglia": null, "attivo": true, "saldo": 8423.3, "saldoAl": "2026-10-01",
  "saldoScritto": 9850, "movimentiDopo": 4, "verificatiDopo": 3}]}`. `iban` intero arriva solo a chi ha banche 2.
- `salvaConto {conto: {id?, nome, banca?, iban?, predefinito?, soglia?, attivo?, note?}}` (banche 2). Errori: `"Nome:
  scrivi il nome del conto"`, `"IBAN: non sembra giusto"` (controllo del codice IBAN, mod 97).
- `aggiornaSaldo {idConto, data?, saldo}` (banche 2).
- `movimenti {da?, a?, idConto?, verso?, categoria?, verificato?, testo?, annullati?, pagina?}` (banche 1), 100 per pagina:
  `{"id": 9, "idConto": 1, "conto": "Conto studio …4521", "data": "2026-10-12", "verso": "entrata", "importo": 500,
  "descrizione": "Incasso Rossi Impianti Srl, fattura 39/2026 (in parte)", "idSoggetto": "C002", "soggetto": "Rossi
  Impianti Srl", "categoria": "incasso", "verificato": false, "abbinamenti": [{"tipo": "fattura", "id": 12, "etichetta":
  "39/2026", "importo": 500}], "annullato": false}`. `testo` cerca in descrizione, soggetto, importo ("500" e "500,00").
- `salvaMovimento {movimento: {id?, idConto, data, verso, importo, descrizione?, idSoggetto?, categoria?, verificato?,
  abbinamenti?: [{tipo: "fattura"|"ricevuta"|"impegno", id, importo}]}}` (banche 2). Errori §10.2, `"Importo: scrivi
  quanto"`, `"Conto: scegli il conto"`.
- `segnaIncasso {idFattura, importo?, data?, idConto?}`, `segnaPagamento {idRicevuta?|idImpegno?, importo?, data?,
  idConto?}` (banche 2) → `{"ok": true, "movimento": {...}, "fattura"|"ricevuta"|"impegno": {...}}`.
- `verificaMovimenti {ids, verificato}` (banche 2); `annullaMovimento {id, motivo}` (banche 2).
- `scadenziario {da?, a?, idConto?}` (banche 1; di base da oggi a 90 giorni):
  ```json
  {"ok": true, "oggi": "2026-10-22", "saldoOggi": 8423.3, "soglia": 3000,
   "scaduti": [{"tipo": "fattura", "id": 12, "data": "2026-10-10", "verso": "entrata", "titolo": "39/2026 · Rossi Impianti Srl",
                "dettaglio": "scaduta da 12 giorni · pagata in parte", "importo": 472.9, "stato": "scaduto", "contaNelSaldo": false}],
   "giorni": [{"data": "2026-10-26", "saldo": 7573.3, "sottoSoglia": false,
               "righe": [{"tipo": "impegno", "id": 5, "verso": "uscita", "titolo": "Affitto ufficio", "dettaglio": "ogni mese",
                          "importo": 850, "stato": "previsto", "proposta": false}]}],
   "senzaData": {"entrate": 1140, "voci": 1}, "primoSottoSoglia": "2026-11-30"}
  ```
  `stato`: `previsto` | `in_parte` | `scaduto` | `da_emettere` | `proposto`.
- `impegni {da?, a?, tipo?, stato?: "aperti"|"pagati"|"tutti"}` (banche 1); `salvaImpegno {impegno: {id?, tipo,
  descrizione, codice?, scadenza, importo?, verso?, idConto?, idSoggetto?, note?, ricorrenza?: {regola, ogni?, fine?} |
  null}, perRicorrenza?}` (banche 2); `confermaImpegno {id, importo?}`; `togliImpegno {id, perRicorrenza?}` (annullato).
- `situazione {}` (banche 1) → i numeri di §10.4: `{saldi: [{idConto, nome, saldo}], saldoOggi, daIncassare, scadutoDaIncassare,
  daPagare30, scadutoDaPagare, previsto: {"30": …, "60": …, "90": …}, primoSottoSoglia, settimane: [{da, entrate, uscite,
  saldo}], fatturatoAnno, incassatoAnno}`.
- `esporta {cosa: fatture|ricevute|daFatturare|riepilogo|movimenti|scadenziario|impegni, ...filtri}` (lettura del modulo):
  CSV come l'architettura §12.13. Colonne delle fatture: Riferimento, Numero, Data, Tipo, Stato, Cliente, Partita IVA, Commessa,
  Compenso, Contributo, IVA, Spese anticipate, Bollo, Totale, Ritenuta, Netto, Incassato, Residuo, Scadenza.

## 12. Dashboard, permessi, registro

**Dashboard** (`dashboard`, solo con fatturazione o banche ≥ 1 e `costi`):
- `numeri.soldi` in più: `fattureInBozza` (totale di bozze e pronte), `daIncassare`, `scaduto`, `incassiSettimana`,
  `pagamentiSettimana`, `saldoConti`, `saldoPrevisto30`, `primoSottoSoglia`. `daFatturare` adesso conta **tutte** le
  sorgenti pronte (non solo i rapportini); `inBozza` resta quello di prima (rapportini da firmare).
- **Urgenti**: fatture scadute (`tipo: "fattura"`, una per una fino a 3, poi una voce sola: `"Fattura 39/2026 scaduta da 12
  giorni"`, `"Rossi Impianti Srl · restano 472,90 di 972,90"`, `quanto` = residuo, `collegamento {pagina: "fattura", id}`);
  fatture già pagate da emettere (`"Emetti la fattura per Mario Bianchi entro domenica 1 novembre"`, `"Ha già pagato il
  20/10 · W-14"`); impegni scaduti non pagati; saldo previsto sotto soglia **entro 14 giorni** (`tipo: "cassa"`, `"Il
  saldo previsto scende sotto 3.000 € il {giorno}"`, `collegamento {pagina: "scadenziario", filtro: {giorno}}`); "Da
  fatturare dei mesi scorsi" resta.
- **Questa settimana**: "Da fatturare" (`"{n} clienti · Rossi Impianti Srl, Elettrodinamica, Mario Bianchi"`, al posto di "Da
  fatturare questo mese"); incassi attesi entro 7 giorni; pagamenti e impegni entro 7 giorni (`"Affitto ufficio lunedì 26,
  Verifiche Nord Snc mercoledì 28"`); pronte da più di 3 giorni senza XML (`"1 fattura passata al programma: manca l'XML
  di ritorno"`, `collegamento {pagina: "fatture", filtro: {stato: "pronta"}}`).
- **Da pianificare**: regole fiscali non confermate (solo titolare e amministrazione, `collegamento {pagina:
  "amministrazione", filtro: {sezione: "fiscale"}}`); saldo di un conto non aggiornato da 30 giorni; saldo sotto soglia
  oltre 14 giorni; fatture ricevute con la scadenza stimata; proposte d'impegno da confermare.
- `collegamento.pagina` nuove: `fatture` (filtro `stato`, `pagamento`, `scadute`), `fattura` (`id`), `ricevute`,
  `ricevuta`, `scadenziario` (filtro `giorno`), `movimenti`, `impegni`, `conti`, `situazione`; `fatturazione` resta (Da
  fatturare). `tipo` nuovi: `fattura`, `ricevuta`, `impegno`, `cassa`, `conto`, `fiscale`. Unità nuove: `fatture`.
- Il numerino giallo su Fatturazione = clienti con qualcosa di pronto da fatturare (come oggi, con le sorgenti nuove).

**Permessi** (tabella dell'architettura §3, nessun valore nuovo): titolare e amministrazione `fatturazione` 2 e `banche`
2; lettura 1 e 1 (vede tutto, esporta, nessun pulsante per scrivere, nessun giallo); collaboratore 0 e 0: **niente voci
nel menu**, niente voci di soldi nella Dashboard, nei rapportini vede "Fatturato" come oggi ma non la fattura. Il menu mostra
Fatturazione e Banche solo con il modulo ≥ 1 **e** `costi` ≥ 1. Confermare le regole fiscali: solo il titolare. Prove
"non deve vedere / non deve scrivere" per ogni ruolo su ogni azione nuova.

**Registro**: tabelle nuove con i loro nomi (§4.3, tranne `letture_xml`); note: `"passata al programma"`, `"tornata in
bozza"`, `"bozza scartata"`, `"emessa dall'XML {nomeFile}"`, `"emessa: numero scritto a mano"`, `"dalla fattura 45/2026
(W-15)"`, `"stornato dalla nota di credito 3/2026"`, `"scartata dallo SDI"`, `"fatturata fuori da Wisper"`, `"regole
confermate dal commercialista il …"`, `"regole cambiate: la conferma del commercialista non vale più"`, `"movimento
annullato: {motivo}"`.

## 13. Schermate

Parole fisse (uguali ovunque): **Da fatturare**, **Bozza**, **Pronta** ("passata al programma il …"), **Emessa**,
**Pagata in parte**, **Pagata**, **Scaduta**, **Annullata**, **Scartata**, **Nota di credito**; **Rif. W-15**; nei conti:
"Compenso", "Contributo integrativo EPPI 5%", "IVA 22%", "Spese anticipate (senza IVA)", "Marca da bollo", "Totale della
fattura", "Ritenuta 20% (la trattiene il cliente)" oppure "Ritenuta: no, è un privato", "Netto da incassare"; in Banche
**Previsto**, **Registrato**, **Verificato in banca**, **Sotto soglia**, **Proposta**, **Non collegato**. La pillola
**Da confermare** (giallo scuro) accanto a contributo, ritenuta e bollo finché le regole non sono confermate. Colori:
Bozza e Scartata grigie, Pronta ed Emessa blu, Pagata verde, Pagata in parte ambra, Scaduta e Sotto soglia rosso tenue,
sempre con la parola. Un solo pulsante giallo per schermata (scritto qui per ognuna).

### 13.1 Cosa succede alla Fatturazione di oggi

| Oggi (fine mese) | Da adesso |
|---|---|
| Titolo "Da fatturare" col mese e ‹ › | Pagina *Da fatturare* di tutto quello che è pronto, per cliente; i rapportini di un mese sono una voce ("Settembre 2026 · 6 rapportini"). Il mese si sceglie nel *Riepilogo*. |
| Scheda per chi paga col totale | Uguale (cerchio, nome, totale), con dentro le voci da spuntare |
| **Prepara riepilogo** (PDF ed email al cliente, segna inviati) | Resta, uguale, sulla voce dei rapportini del mese (pulsante col bordo); "Riepilogo inviato il 30/09" con la spunta verde |
| **Segna fatturati** (giallo) | Sostituito da **Prepara la bozza**: diventano fatturati da soli quando torna l'XML. "Segna fatturati a mano" resta nella selezione di *Ore e rapportini › Rapportini*, con conferma, per quelli fatturati fuori da Wisper |
| Riquadri Da fatturare · Da far firmare · Fatturato | Riquadri Da fatturare · In bozza · Da incassare; "Da far firmare" resta in fondo a *Da fatturare* come elenco ("Non si fatturano finché non sono firmati") |
| Commesse da guardare | Sono già nella Dashboard (budget all'85%, oltre il budget, scadute): da qui escono |
| Barra fatturazione della commessa (fatturato, pronto, in bozza dai rapportini) | Da `fatturazioneCommessa`: contratto, fatturato, incassato, da fatturare, in bozza, previsto; scheda *Da fatturare* della commessa = la stessa pagina filtrata |

### 13.2 Fatturazione: telefono

Segmenti in alto: **Da fatturare · Fatture · Ricevute · Riepilogo**. Fascia gialla tenue in cima a ogni pagina finché le
regole non sono confermate: "Regole delle fatture da confermare col commercialista" con "Apri" (porta ad Amministrazione ›
Impostazioni fiscali).
- *Da fatturare*: tre riquadri (Da fatturare · In bozza · Da incassare, toccabili); una scheda per cliente (cerchio, nome,
  totale, "{n} cose pronte", "Ritenuta sì/no", i `mancano` in giallo scuro); dentro, le voci con la casella: scadenze
  ("40% a fine progetto · 26ST003", "a fine progetto"), spese anticipate (pillola "Senza IVA"), rapportini del mese come
  una voce che si apre ("Ottobre 2026 · 1 rapportino · 317,88") con "Prepara riepilogo" col bordo, ore. Sotto le schede
  *Più avanti* (chiuso) e *In bozza* (W-14 · Mario Bianchi · Pronta). In basso, fisso, **Prepara la bozza · {totale}**
  (giallo; spento senza scelta). Scegliere una voce di un altro cliente: avviso "Una fattura è per un cliente solo: ho
  tolto le altre". Tocco lungo su una voce: "Già fatturata fuori da Wisper".
- *Bozza* (pagina): "Bozza per Rossi Impianti Srl", pillola Bozza, "Rif. W-15 · 22 ottobre"; le righe (descrizione, importo;
  tocco = foglio con "Togli dalla bozza", che dice cosa torna da fatturare); i conti (righe di §13) con il totale in grande e
  il **Netto da incassare**; "Scadenza 21/11 · bonifico su Conto studio …4521" (tocco = cambia data o scadenza); in basso
  **Passa al programma** (giallo); ⋯: Avviso di parcella per il cliente, Scarta la bozza; una riga "Righe libere e prezzi si
  cambiano da Wisper Ufficio".
- *Passa al programma* (foglio): "Cosa passi al programma" con il riassunto (cliente, righe, totale, netto, scadenza);
  pulsanti col bordo **Condividi il prospetto (PDF)**, **Condividi l'XML da completare** (solo se l'uscita c'è), **Copia i
  dati**; la riga "Invio allo SDI" con la pillola **Non collegato**; con regole non confermate la fascia gialla; giallo
  **Segna come passata al programma** (con regole non confermate: la prima volta chiede "Le regole non sono confermate:
  passala lo stesso?").
- *Fatture* (elenco): ricerca; pillole-filtro **Da emettere · Da incassare · Scadute · Tutte**; righe: numero (o "Rif. W-15"
  in grigio), cliente, data, netto, pillola di stato; le scadute col "da 12 giorni". Giallo in basso **Importa l'XML**.
- *Fattura* (pagina): stato e i passi Bozza → Pronta → Emessa → Pagata; cliente, data, scadenza; i conti; *Incassi* (data,
  importo, conto, Registrato/Verificato in banca) e "Restano {residuo}"; un giallo secondo lo stato: Bozza → **Passa al
  programma**; Pronta → **Importa l'XML emesso** (sotto: "Passata al programma il 15/10"; se già pagata, riga gialla "Va
  emessa entro domenica 1 novembre: ha pagato il 20/10"); Emessa non pagata → **Segna un incasso**; Pagata o Annullata →
  nessun giallo. ⋯: Prospetto (PDF), XML emesso, Torna in bozza (pronta), Segna emessa senza XML (pronta), Scarta (bozza,
  pronta), Avviso di parcella, e la riga "Le note di credito si preparano da Wisper Ufficio" (emessa). Riga "Invio allo SDI ·
  Non collegato".
- *Segna un incasso* (foglio): importo grande, già scritto col residuo; **Tutto** · **In parte**; data (oggi); conto (i
  conti come pillole); "L'ho visto sull'estratto conto" (casella); giallo **Segna l'incasso**. Dopo: avviso con Annulla, e lo
  stato diventa Pagata o Pagata in parte.
- *Importa l'XML*: si apre la scelta dei file del telefono (più file insieme; anche "Condividi → Wisper" da un'email,
  `.xml`, `.p7m`, `.zip`); poi la pagina *Cosa ho trovato*: una scheda per documento con cosa ha capito ("Fattura 46/2026 ·
  Mario Bianchi · 320,25") e la proposta ("È la bozza W-14" con la pillola **Sicura** / **Probabile** / **Diversa** in giallo
  scuro / **Senza bozza**; "Già importata"; "Fattura ricevuta da Comel Forniture Elettriche: la aggiungo"); per Diversa le
  differenze in due colonne (Bozza · XML) e "Tornano da fatturare: …"; per Senza bozza la domanda "Era da fatturare in
  Wisper?" con i `collegabili` (es. "Settembre 2026 · 6 rapportini · Stessi importi: 1.393,92 € di compenso. Spuntato, esce
  da Da fatturare", già spuntato); ogni scheda ha "Cambia" (Abbina lo stesso · Senza bozza · Salta); giallo in basso
  **Conferma ({n})**.
- *Ricevute*: elenco (fornitore, numero, data, da pagare, scadenza, Pagata/Da pagare/Scaduta); tocco = pagina con **Segna
  pagata** (giallo) e categoria e commessa da scegliere; giallo dell'elenco **Importa l'XML**.
- *Riepilogo*: l'anno con ‹ ›, Fatturato e Incassato in grande, i mesi in righe (mese, fatture, compenso); "Per cliente e per
  commessa, con l'esportazione, da Wisper Ufficio".

### 13.3 Fatturazione: computer

Stessa voce del menu; sotto il titolo i segmenti **Da fatturare · Fatture · Ricevute · Scadenze di pagamento ·
Riepilogo**; la fascia delle regole come sul telefono.
- *Da fatturare*: riquadri; le schede per cliente a tutta larghezza con la tabella delle voci (casella, cosa, commessa,
  data, quando, importo, "Senza IVA"); in ogni scheda "Scegli tutto" e, sui rapportini del mese, **Prepara riepilogo** (bordo)
  e il segmento "Una riga per rapportino · Una riga per il mese"; in alto a destra **Prepara la bozza ({n}) · {totale}**
  (giallo, uno solo). In fondo *Più avanti*, *In bozza*, *Da far firmare*.
- *Bozza* (editor a due colonne, come il preventivo): a sinistra le righe in tabella (descrizione, quantità, unità, prezzo,
  importo, tipo "Compenso / Spesa anticipata"; trascinabili; le righe di un gruppo con il segno del gruppo e "era 317,88"
  se cambiate; **Aggiungi una riga** libera; **Aggiungi da fatturare** apre le voci libere del cliente); a destra i conti che
  si aggiornano, data, scadenza, conto, causale, "Ritenuta: sì (Rossi è sostituto d'imposta)" con Cambia, ciò che manca;
  giallo **Passa al programma**.
- *Passa al programma* (finestra larga): a sinistra il prospetto per sezioni, ogni campo con il pulsante **Copia** (e
  "Copiato" per due secondi); a destra **Scarica il prospetto (PDF)**, **Scarica l'XML da completare**, **Copia tutto**, la
  riga "Invio allo SDI · Non collegato", la fascia delle regole; giallo **Segna come passata al programma**.
- *Fatture*: riquadri (Da emettere · Da incassare · Scadute · Incassato a ottobre); segmenti **Fatture · Note di credito**;
  ricerca e pillole-filtro come sul telefono; tabella: Stato, Numero (o "W-15" in grigio), Data, Cliente, Causale, Netto,
  Scade, Residuo (il totale sta nel pannello e nell'esportazione); selezione multipla per **Esporta**; **Nuova fattura**
  (bordo); giallo **Importa XML**. Il pannello a destra (440) della fattura, come quello del rapportino: stato, passi,
  conti, incassi, file, un giallo come sul telefono; **col pannello aperto "Importa XML" diventa col bordo** (un giallo
  solo). ⋯ anche **Prepara una nota di credito** (finestra: tutta o righe scelte con l'importo, motivo, "Tornano da
  fatturare: …").
- *Importa XML* (finestra larga): si trascinano file o una cartella (anche zip); la tabella *Cosa ho trovato* (Cosa: tipo
  e numero, cliente o fornitore, nome del file; Totale; Cosa propongo, con sotto i collegabili o le differenze affiancate e i
  gruppi che tornano da fatturare; Certezza in pillola; Cosa faccio: il pulsante che cambia la scelta); in fondo i file
  scartati; **Annulla** e giallo **Conferma ({n})**.
- *Ricevute*: tabella (fornitore con categoria e commessa sotto, numero, data, totale, ritenuta, da pagare, scade, stato);
  tocco = finestra della ricevuta (conti, categoria, commessa, **Segna pagata** giallo); **Nuova ricevuta senza XML** (bordo);
  giallo **Importa XML**.
- *Scadenze di pagamento*: per commessa, le sue scadenze (descrizione, quando, importo, stato: Prevista · In bozza · Fatturata
  45/2026 · Incassata) con la somma "1.140,00 fatturati su 3.800,00".
- *Riepilogo*: l'anno, barre per mese (fatturato e incassato), tabella per cliente e per commessa, **Esporta** (bordo).

### 13.4 Banche e scadenze: telefono

Segmenti **Scadenziario · Movimenti · Tributi · Conti**.
- *Scadenziario*: in cima tre riquadri della situazione (Nei conti oggi · Da incassare · Da pagare in 30 giorni) e la riga
  "Saldo previsto fra 30 giorni: …" (rossa se sotto soglia); poi **Scaduti** e i giorni: intestazione del giorno ("Lunedì 26
  ottobre") con il saldo di fine giornata a destra, rossa con **Sotto soglia** se serve; righe (entrata col segno +,
  uscita −, cosa, chi, pillola Previsto/Proposta/Da emettere/In parte). Tocco su una riga: foglio con **Segna incassato** o
  **Segna pagato** (giallo), importo modificabile (in parte). Sotto il primo saldo: "Gli incassi scaduti non entrano nel
  saldo previsto". Giallo della pagina: nessuno (le azioni sono nelle righe).
- *Movimenti*: ricerca; pillole **Tutti · Incassi · Pagamenti · Da verificare**; righe (data, descrizione, chi, importo con
  segno, Registrato / Verificato in banca); scheda **Importa estratto conto · Non collegato**; giallo **Nuovo movimento**
  (foglio: entrata/uscita, importo, data, conto, descrizione, chi, "Abbina a…" con le fatture o ricevute aperte di quel
  soggetto e il residuo, "L'ho visto sull'estratto conto").
- *Tributi*: righe per scadenza (descrizione, codice, importo o "da scrivere", Proposta in giallo scuro, Ripete ogni mese);
  tocco = foglio con **Segna pagato** e, per una proposta, **Conferma**; giallo **Nuovo tributo** (descrizione, codice, scadenza,
  importo, ripeti: mai, ogni mese, ogni 3 mesi, ogni anno).
- *Conti*: una scheda per conto (nome, "…4521", saldo, "dall'ultimo saldo scritto il 01/10 · 4 movimenti dopo"); riga
  **Collegamento alla banca · Non collegato**; giallo **Aggiorna il saldo** (foglio: conto, saldo letto in banca, data).
  Nuovo conto e IBAN nel menu ⋯ della pagina.

### 13.5 Banche e scadenze: computer

Segmenti **Scadenziario · Movimenti · Tributi e F24 · Conti · Situazione**.
- *Scadenziario*: tabella (Giorno, Cosa con chi e dettaglio sotto, Entrata, Uscita, Saldo previsto, Stato) con in cima il
  gruppo **Scaduti** ("gli incassi non entrano nel saldo") e poi una riga d'intestazione per giorno ("Lunedì 26 ottobre",
  a destra "saldo previsto 7.893,55 €"); i giorni sotto soglia e le loro righe su rosso tenue con **Sotto soglia**; in alto
  il conto (tutti o uno), il periodo (30 · 60 · 90 giorni) e quattro riquadri; tocco su una riga = finestra Segna
  incassato/pagato; giallo **Registra un movimento**.
- *Movimenti*: tabella con filtri (conto, periodo, entrate/uscite, da verificare), ricerca, selezione multipla con
  **Segna verificati**, **Esporta**; scheda Import estratto conto **Non collegato**; giallo **Nuovo movimento** (finestra con
  gli abbinamenti in tabella).
- *Tributi e F24*: tabella (scadenza, descrizione, codice, importo, ripete, stato) con le proposte in giallo scuro e
  **Conferma**; giallo **Nuovo tributo** (finestra con la ricorrenza).
- *Conti*: tabella dei conti con saldo, ultimo saldo scritto, soglia; **Nuovo conto** (bordo; finestra: nome, banca, IBAN
  intero, predefinito, soglia); riga Collegamento alla banca **Non collegato**; giallo **Aggiorna il saldo**.
- *Situazione*: quattro riquadri (Nei conti oggi · Da incassare con lo scaduto · Da pagare in 30 giorni · Previsto fra 30
  giorni, con "fra 60: …"), la fascia rossa "Primo giorno sotto soglia: lunedì 30 novembre", le barre del **saldo previsto a
  fine settimana** per 13 settimane (nere sopra la soglia, rosse sotto, la cifra sopra ogni barra, entrate e uscite della
  settimana al passaggio del mouse) con la linea tratteggiata della soglia; Fatturato e Incassato dell'anno. Nessun giallo.

### 13.6 Amministrazione e le altre pagine

- Amministrazione › **Impostazioni fiscali** (nuova riga nell'elenco): scheda **Regole confermate dal commercialista**
  ("Non ancora": giallo scuro; "Confermate il 05/11/2026 da Studio …": verde) con il giallo **Segna confermate** (solo
  titolare; foglio: data, nome del commercialista); schede Aliquote (IVA, contributo EPPI, ritenuta), Bollo (soglia,
  importo, "Lo riaddebito al cliente" sì/no), Documento (Fattura TD01 · Parcella TD06, regime), Pagamento (giorni, fine
  mese, modo), ognuna col suo **Salva** col bordo; dopo il salvataggio di una regola la conferma "Fatto. La conferma del
  commercialista va rifatta". **Dati dello studio** coi campi nuovi di §4.1.
- **Cliente**: "Sostituto d'imposta: Automatico · Sì · No" e "Pagamento: {giorni} giorni, fine mese sì/no" nel modulo;
  scheda **Fatture** (emesse, da incassare).
- **Commessa**: "Come si fattura: A ore · A corpo · Misto" nel modulo; la barra e la scheda *Da fatturare* di §13.1.
- **Rapportino**: pillola "In bozza W-15" o "Fattura 45/2026" (solo per chi vede le fatture), con il collegamento.
- **Dashboard**: le voci di §12; quattro riquadri in più per chi vede le fatture (Da fatturare · Da incassare · Scaduto in
  rosso · Nel conto, toccabili; sul telefono in due colonne); "La cosa più urgente" è `urgenti[0]` e non si ripete
  nell'elenco Urgenti sotto.
- Il **collaboratore** non vede Fatturazione né Banche: le voci non ci sono nel menu.

## 14. Prove di fine fase

- **Conti**: i 16 casi di `casi-fattura.json` uguali al centesimo nel server, in Kotlin e in `regole-fatture.js`; i 4
  raggruppamenti nel server.
- **Doppia fatturazione**: la stessa sorgente in due bozze (anche due richieste insieme) → la seconda rifiutata
  dall'indice; scartare libera; togliere un gruppo libera tutto il gruppo; nota di credito libera le sorgenti scelte e
  rimette rapportini, scadenze, spese e ore come prima; un XML senza bozza con `collega` toglie le sorgenti da *Da fatturare*;
  i rapportini di una commessa a corpo non compaiono mai.
- **Stati**: tutti i passaggi di §7.1 e i rifiuti (salvare una pronta, tornare in bozza un'emessa...); pagata, in parte,
  scaduta calcolate; incasso su una pronta e `daEmettereEntro`; i blocchi di §7.3 su rapportini, spese, ore, scadenze.
- **XML**: lettura di file veri di esempio in `server/prove/xml/` (dati finti): XML in UTF-8 e in ISO-8859-1, con e senza
  prefissi, p7m DER e base64 con `OCTET STRING` spezzato, zip con più file, lotto con due body, nota TD04, RC e NS, una
  ricevuta con ritenuta; abbinamento certa (Rif. W), probabile, diversa (con righe mancanti), nessuna; doppione; scarto
  dello SDI che riporta a pronta; l'**XML da completare** che lo schema 1.2.3 accetta (prova con un validatore fuori dal
  repository, una volta, scritta nel resoconto) e che rileggiamo uguale al modello.
- **Banche**: saldo da `conto_saldi` + movimenti; abbinamenti oltre il residuo rifiutati; annullare un movimento riapre la
  fattura; scadenziario con saldo prudente (entrate scadute fuori, uscite scadute dentro), giorni sotto soglia; ricorrenze
  degli impegni (12 mesi, questa/future/tutte); proposte 1040 e bollo che si aggiornano e si confermano.
- **Permessi**: collaboratore niente (menu, azioni, Dashboard, campi dei soldi nella commessa); lettura vede ed esporta ma non
  scrive; amministrazione non conferma le regole; cambiare una regola toglie la conferma.
- **Schermate vere** su telefono e computer, chiaro e scuro, confrontate col prototipo; il flusso intero con i dati di
  prova: Da fatturare → bozza → passa → importa l'XML (preparato a mano dal prospetto) → emessa → segna incasso in parte →
  pagata; una nota di credito; lo scadenziario che va sotto soglia.

## 15. Da confermare e da decidere

**Col commercialista** (elenco completo con le fonti in `ricerca-fase4.md` §5): EPPI 5% e sua base; ritenuta 20% e chi è
sostituto; bollo (soglia sulla sola parte N1, tributi esclusi, riaddebito); TD01 o TD06; fattura subito o all'incasso;
regime e periodicità dell'IVA; ritenute sulle fatture ricevute (1040). Fino ad allora vale §3.4.

**Domande per Andrea** (la raccomandazione per prima):
1. Quale programma usa Manuel per le fatture, e se esporta l'XML delle emesse (anche in zip) e se importa bozze XML.
   Serve per §8.4; fino ad allora: prospetto + XML da completare.
2. (Tolta: tutto anche sul telefono, come vuole la decisione 2; vedi §3.3.)
3. Manuel fattura subito o manda prima un avviso di parcella e fattura all'incasso? Consiglio di tenere l'avviso di
   parcella (§8.3) e l'incasso su una pronta: non costa niente se non lo usa.
4. Commesse a corpo: i rapportini non si fatturano a parte (si passa la commessa a "Misto" per fatturare le ore in più).
   Consiglio sì.
5. Il bollo lo riaddebita al cliente? Di base sì.
6. Soglia del saldo: 3.000 € e un conto solo "Conto studio" per partire?
