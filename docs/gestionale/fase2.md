# Fase 2: preventivi, attività e calendario (accordo e schermate)

Si aggiunge a [`architettura.md`](architettura.md) e a [`fase1-schermate.md`](fase1-schermate.md), che restano
validi. Ricerca in [`ricerca-fase2.md`](ricerca-fase2.md). Prototipo:
[`docs/prototipo/Gestionale-fase2.html`](../prototipo/Gestionale-fase2.html).

## 1. Cosa consegna la fase 2

- **04 Preventivi e contratti**: elenco, nuovo, modelli di offerta, listino delle prestazioni, accettati, scaduti,
  contratti (incarichi). Sezioni e voci a corpo, a ore o a quantità; voci facoltative e alternative; sconti;
  scadenza; revisioni; PDF; invio per email; accettazione con firma del cliente; il preventivo accettato diventa la
  commessa con le sue prestazioni, i valori e le scadenze di pagamento.
- **05 Attività e calendario**: attività personali e di squadra, non assegnate, per commessa, ricorrenti;
  appuntamenti e sopralluoghi; priorità, scadenze, promemoria, checklist, allegati; vista elenco, calendario (giorno,
  settimana, mese) e pianificazione settimanale; attività dello studio senza commessa.
- La Dashboard si arricchisce: preventivi da preparare, inviati in attesa, in scadenza, accettati non ancora diventati
  commessa; attività di oggi e dei prossimi giorni; appuntamenti e sopralluoghi.

## 2. Principi (dalla ricerca)

1. **Il preventivo rispetta la legge da solo**: complessità, voci di costo con spese, oneri e contributi, oneri
   ipotizzabili, estremi della polizza, titoli. I dati fissi stanno in Amministrazione; se mancano, il preventivo lo
   dice prima dell'invio (DL 1/2012 art. 9, L. 124/2017 c. 150-152).
2. **Si compone per sezioni**, con subtotali e voci spostabili; le voci si prendono dal listino dello studio con un
   tocco (Quoter, Tradify).
3. **Il cliente sceglie**: voci facoltative con la casella, alternative "una di queste"; i totali si aggiornano
   (QuoteValet, HubSpot).
4. **Dopo l'invio i prezzi non cambiano**: si fa una revisione e la precedente resta consultabile.
5. **Accettato → commessa in un passo**, senza riscrivere niente: cliente, prestazioni, valori, ore, acconti
   (Accelo, Factorial, Archdesk).
6. **Le attività rispondono a "cosa devo fare oggi"**: Oggi, Prossimi giorni, Senza data; assegnato e scadenza ben
   visibili (Todoist).
7. **Sul telefono il calendario è una striscia di giorni + l'elenco**, il giorno come colonna del tempo con i buchi
   liberi; la griglia della settimana sul computer (ServiceTitan; pattern dei calendari).
8. **Ricorrenze sicure**: modificando una ricorrenza si sceglie "solo questa / da questa in poi / tutte".

## 3. Dati (migrazione 002)

**Impostazioni nuove** (Amministrazione › Dati dello studio e › Impostazioni fiscali): `POLIZZA_COMPAGNIA`,
`POLIZZA_NUMERO`, `POLIZZA_MASSIMALE`, `TITOLI` (testo: iscrizione al collegio, specializzazioni), `IVA` (22),
`EPPI_INTEGRATIVO` (5: contributo integrativo dei periti industriali, nel documento fiscale, entra nella base IVA e
non nella ritenuta — **da confermare col commercialista**, si cambia nelle impostazioni), `RITENUTA` (20, si usa
dalla fase 4), `PREVENTIVO_VALIDITA_GIORNI` (30), `PREVENTIVO_CONDIZIONI` (testo predefinito delle condizioni).

**Numerazione** `preventivo`: `PR/{AAAA}/{NNN}`, riparte ogni anno. Le revisioni tengono il numero e aggiungono
`rev. N`.

Tabelle:
- `listino` (id, codice, nome, descrizione, modo `corpo`|`ore`|`quantita`, unita, prezzo, attivo, ordine). Si parte
  con le prestazioni tipiche dello studio, **senza prezzi** (li scrive Manuel): Sopralluogo e rilievo, Progetto
  preliminare, Progetto esecutivo, Direzione lavori, Dichiarazione di rispondenza (DiRi), Verifiche periodiche,
  Collaudo, Ore di consulenza (a ore).
- `preventivi` (id interno, numero `PR/2026/012`, revisione 0…, cliente_id, sede_id, referente_id, oggetto,
  introduzione, complessita `bassa`|`media`|`alta`, complessita_nota, oneri_previsti (testo), condizioni, data,
  scadenza, stato `BOZZA`|`INVIATO`|`ACCETTATO`|`RIFIUTATO`|`SOSTITUITO`, sconto_percentuale, sconto_euro,
  eppi_percentuale e iva_percentuale (congelati alla creazione, come le tariffe dei rapportini), inviato_il,
  accettato_il, accettato_da, accettazione_modo `firma`|`email`|`documento`|`voce`, firma_file_id,
  rifiutato_il, motivo_rifiuto, commessa_id, modello 0/1, note_interne, utente_id, creato, modificato). **Scaduto** non
  è uno stato salvato: è un INVIATO con la scadenza passata.
- `preventivo_sezioni` (id, preventivo_id, titolo, ordine)
- `preventivo_voci` (id, preventivo_id, sezione_id, listino_id, descrizione, modo, quantita, unita, prezzo,
  sconto_percentuale, facoltativa 0/1, alternativa (testo: le voci con lo stesso testo sono "una di queste"), scelta
  0/1, ordine)
- `scadenze_pagamento` (id, preventivo_id, commessa_id, descrizione, tipo `percentuale`|`importo`, valore, quando
  `firma`|`avanzamento`|`fine`|`data`, data, importo (calcolato), stato `prevista`; la fase 4 aggiunge fatture e
  incassi)
- `attivita` (id, titolo, descrizione, tipo `attivita`|`appuntamento`|`sopralluogo`, cliente_id, commessa_id,
  prestazione_id, assegnata_a (utente, vuoto = non assegnata), creata_da, priorita `alta`|`normale`|`bassa`, stato
  `da_fare`|`in_corso`|`fatta`|`annullata`, scadenza (data), inizio e fine (istanti, per appuntamenti e
  sopralluoghi), tutto_il_giorno, luogo, promemoria_minuti, ricorrenza_id, occorrenza (data), fatta_il, creato,
  modificato)
- `attivita_checklist` (id, attivita_id, testo, fatta, ordine)
- `ricorrenze` (id, regola `giorni`|`settimane`|`mesi`|`anni`, ogni N, giorni_settimana, fine (data o vuoto), modello
  JSON dell'attività). Le occorrenze si creano per i prossimi 90 giorni e si allungano ogni notte.
- `file`: tipo nuovo `attivita` (attivita_id) e `preventivo` (il PDF firmato o il documento di accettazione).

**I conti del preventivo** (solo nel server, con le sue prove): importo voce = quantità × prezzo × (1 − sconto voce),
arrotondato al centesimo; contano le voci non facoltative e le facoltative scelte; di ogni gruppo di alternative
conta solo quella scelta. Imponibile = somma − sconto in percentuale − sconto in euro. Contributo integrativo =
imponibile × EPPI. Base IVA = imponibile + contributo. IVA = base × IVA. Totale = base + IVA. Ogni pezzo arrotondato
al centesimo prima di sommare, come i rapportini.

## 4. Azioni nuove

Con modulo e livello richiesto; risposte con `ok`. Senza `costi` niente prezzi né totali (il server li toglie).

- `listino` (preventivi 1), `salvaVoceListino`, `archiviaVoceListino` (preventivi 2)
- `preventivi {stato?, cliente?, testo?, anno?}` (preventivi 1): elenco con totali e stato calcolato (anche
  `scaduto`)
- `preventivo {id}` (preventivi 1): tutto, con sezioni, voci, scadenze di pagamento, revisioni dello stesso numero,
  conti, e `mancano`: l'elenco di ciò che la legge chiede e manca (polizza, titoli, complessità, voci senza prezzo)
- `salvaPreventivo` (preventivi 2): crea o aggiorna testata, sezioni, voci, scadenze in una volta; solo in BOZZA
- `duplicaPreventivo {id, comeModello?}`, `nuovaRevisione {id}` (il vecchio diventa SOSTITUITO)
- `inviaPreventivo` = `inviaEmail` con il PDF, e segna INVIATO; `segnaInviato` senza email
- `accettaPreventivo {id, modo, nome, scelte:{idVoce: true|false}, firma? (come caricaFile)}`,
  `rifiutaPreventivo {id, motivo}`, `riapriPreventivo {id}` (da RIFIUTATO a BOZZA, con nuova revisione)
- `creaCommessaDaPreventivo {id}` (commesse 2): commessa nuova (codice 26ST…) con cliente, sede, descrizione =
  oggetto, importo del contratto = imponibile, prestazioni = voci contate (nome e valore), ore previste = somma delle
  voci a ore, prezzo orario = quello delle voci a ore se unico, scadenze di pagamento collegate; il preventivo tiene
  `commessa_id`. Una volta sola.
- `attivita {da, a, assegnata?, commessa?, stato?, nonAssegnate?}` (attivita 1), `salvaAttivita` (attivita 2, con
  `perRicorrenza: 'questa'|'future'|'tutte'`), `faiAttivita {id, fatta}`, `togliAttivita` (annullata),
  `spuntaChecklist`
- Il collaboratore vede le attività assegnate a lui, quelle non assegnate e quelle delle commesse in cui è tra le
  persone; scrive le sue.
- `dashboard` aggiunge le voci: preventivi in scadenza entro 7 giorni, inviati da più di 15 giorni senza risposta,
  accettati senza commessa, attività scadute (urgenti), attività e appuntamenti di oggi e della settimana.
- `esporta {cosa: preventivi|attivita}`.

## 5. Schermate

**Preventivi** (voce 4 del menu, dopo Progetti e commesse):
- *Elenco*: segmenti **Bozze · Inviati · Accettati · Scaduti · Tutti**, ricerca; righe: numero (pillola grigia) e
  revisione, oggetto, cliente, totale, stato a parola (Bozza grigia, Inviato blu, Accettato verde, Scaduto ambra,
  Rifiutato rosso tenue). **Nuovo preventivo** giallo ("Da un modello" se ce ne sono).
- *Editor* (telefono: pagina a passi Cliente → Voci → Condizioni → Riepilogo; computer: a due colonne, a sinistra le
  sezioni con le voci, a destra il riepilogo dei conti che si aggiorna e ciò che manca per la legge). Una voce: dal
  listino (ricerca) o libera; modo a corpo/ore/quantità; quantità, prezzo, sconto; casella "Facoltativa"; "Una di
  queste con…" per le alternative. Sezioni richiudibili con il subtotale.
- *Pagina del preventivo*: stato e i passi Bozza → Inviato → Accettato; il PDF; UN pulsante giallo secondo lo stato
  (Bozza → **Invia al cliente**; Inviato → **Segna accettato**; Accettato senza commessa → **Crea la commessa**;
  Accettato con commessa → **Apri la commessa**); menu ⋯: Nuova revisione, Duplica, Duplica come modello, Segna
  inviato senza email, Rifiutato, PDF.
- *Accettazione*: foglio "Come ha accettato?" (Firma qui sul telefono · Ha risposto per email · Ho il documento
  firmato · A voce); con le facoltative e le alternative da spuntare e il totale che si aggiorna; poi firma come per il
  rapportino (nome + tratto).
- *Listino* (dentro Preventivi): le prestazioni dello studio con prezzo e modo; senza prezzo in giallo scuro.
- *Contratti*: i preventivi accettati con il loro incarico (PDF dell'incarico professionale, generato dal preventivo
  accettato con le condizioni e la firma).
- Il PDF del preventivo (in `pc/ui/documenti.js`, come rapportino e riepilogo): intestazione dello studio, cliente,
  oggetto, complessità, sezioni e voci con importi, facoltative marcate, totali (imponibile, contributo integrativo
  EPPI, IVA, totale), scadenze di pagamento, oneri previsti, condizioni, validità, polizza e titoli, spazio per la
  firma.

**Attività e calendario** (voce 5):
- *Attività*: segmenti **Mie · Squadra · Non assegnate**; gruppi **Scadute** (rosso tenue) · **Oggi** ·
  **Prossimi giorni** · **Senza data**; riga: cerchio da spuntare (tocco = fatta, con Annulla), titolo, "commessa ·
  scadenza", iniziali dell'assegnato, priorità alta come pillola. **Nuova attività** giallo.
- *Modulo*: titolo, tipo (Attività · Appuntamento · Sopralluogo), quando (scadenza, oppure inizio e fine), chi
  (persone; vuoto = non assegnata), cliente/commessa/prestazione, priorità, promemoria, ripeti (mai, ogni giorno,
  settimana, mese, anno, personalizzato), checklist, note, allegati.
- *Calendario*: telefono = striscia della settimana in alto (giorni con i pallini) + l'elenco del giorno con gli orari
  e i buchi liberi; toccando il titolo si passa al mese. Computer = settimana a sette colonne con le ore, mese, giorno.
  Un appuntamento sovrapposto a un altro della stessa persona chiede conferma.
- *Pianificazione settimanale* (computer): righe = persone, colonne = giorni, a sinistra le non assegnate da
  trascinare su una persona e un giorno; sul telefono un elenco per persona.
- Sopralluogo o intervento → **Scrivi il rapportino** già compilato (cliente, commessa, data).
- Promemoria: sul telefono notifiche locali per le proprie attività e appuntamenti (anche senza aprire l'app); sul
  computer un avviso se il programma è aperto.

## 6. Prove di fine fase

Conti del preventivo (casi in `server/prove/casi-preventivo.json`, usati anche da telefono e computer per
l'anteprima); revisioni e blocco dopo l'invio; accettazione con scelte; conversione in commessa una volta sola con
prestazioni e scadenze giuste; ricorrenze (questa/future/tutte, salto di una); permessi del collaboratore sulle
attività; PDF del preventivo sul telefono e sul computer identici; schermate vere su telefono e computer.
