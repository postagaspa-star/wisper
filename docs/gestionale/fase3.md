# Fase 3: ore, rapportini, spese e trasferte (accordo e schermate)

Si aggiunge ad [`architettura.md`](architettura.md), [`fase1-schermate.md`](fase1-schermate.md) e
[`fase2.md`](fase2.md). Prototipo: [`docs/prototipo/Gestionale-fase3.html`](../prototipo/Gestionale-fase3.html).

## 1. Cosa consegna

- **06 Ore e rapportini** completo: oltre ai rapportini di oggi (che restano com'erano: tre passi, firma, PDF,
  stati, senza rete), la **registrazione delle ore** senza rapportino (lavoro in ufficio, progettazione, attività
  dello studio), il **timer** con avvio e arresto, inizio, fine e pause, ore **fatturabili o no**, ordinarie o
  straordinarie, collegate a commessa, prestazione e attività; il **timesheet** della settimana; l'**approvazione** del
  responsabile; le **statistiche** delle ore per persona e per commessa; l'esportazione.
- **07 Spese e trasferte**: la spesa come registrazione a sé (una per scontrino, con foto), categorie, **chi la paga e
  a chi va** (al cliente, allo studio, personale), pedaggi e parcheggi, **trasferte** con destinazione, motivo, km e
  indennità, **rimborso km** dalle tabelle ACI dell'anno, approvazione, **rimborsi** da fare, riepiloghi per persona,
  periodo e commessa; le spese da riaddebitare restano pronte per la fatturazione (fase 4).

## 2. Principi (dalla ricerca)

1. **Il rapportino resta la strada di chi è in cantiere**: niente cambia nei suoi tre passi. Le ore senza rapportino
   sono un modulo corto a parte (fonte: legge di Jakob; la 0.4.0 piace così).
2. **Il timer è il modo più semplice**: un tocco per partire, uno per fermare, e si apre la bozza da correggere; un
   timer solo per persona, che sopravvive alla chiusura dell'app e si vede in cima (WorkGuru, Nexonia, Reonic).
3. **Recenti prima**, ricerca dopo: le commesse usate di recente come schede, come nel rapportino (ClickTime).
4. **Una spesa comincia dalla foto** dello scontrino; i campi dopo, con le scelte a tocchi (Expensify).
5. **"A chi va" è una domanda chiara, non un gergo**: *Al cliente* · *Allo studio* · *Mia*; e *L'ho pagata io* sì/no.
   Le spese al cliente con il documento intestato a lui sono **anticipazioni** (art. 15: fuori da IVA, contributo e
   ritenuta); le altre al cliente entrano nel compenso (fonte: Fiscozen, spese anticipate art. 15).
6. **Approvare è veloce e motivato**: selezione di tutte con eccezioni, conferma, rifiuto sempre con un motivo che
   arriva a chi ha scritto; le anomalie (troppe ore, spesa senza foto) si vedono prima di approvare (pattern delle
   approvazioni dei fogli ore).
7. **Le ore dicono quanto rende lo studio**: fatturabili su totali, per persona e per commessa (Deltek, Accelo).
8. **Il rimborso km segue le tabelle ACI dell'anno**: a gennaio la Dashboard chiede di aggiornarlo, e le righe vecchie
   tengono il valore con cui sono nate.

## 3. Dati (migrazione 003)

Impostazioni nuove: `APPROVAZIONE` (`collaboratori` di base: servono le approvazioni solo per ore, rapportini e spese
dei collaboratori; `tutti`; `nessuno`), `ACI_ANNO` (2026), `INDENNITA_TRASFERTA` (vuoto), `ORE_GIORNALIERE` (8, per
le straordinarie e le anomalie).

Tabelle:
- `ore` (id, utente_id, data, inizio, fine, pausa_minuti, ore (calcolate da inizio/fine/pausa o scritte),
  commessa_id, prestazione_id, attivita_id, descrizione, fatturabile 0/1, tipo `ordinaria`|`straordinaria`,
  costo_orario (congelato: dalla persona dalla fase 6, prima dalle regole di oggi), stato
  `bozza`|`da_approvare`|`approvata`|`respinta`, approvata_da, approvata_il, motivo, creato, modificato)
- `timer` (utente_id unico, partito_il, commessa_id, prestazione_id, attivita_id, descrizione): fermarlo crea una riga
  `ore` in bozza
- `spese` (id, utente_id, data, importo, categoria `carburante`|`pedaggio`|`parcheggio`|`vitto`|`alloggio`|`treno`|
  `aereo`|`taxi`|`materiale`|`altro`, descrizione, commessa_id, cliente_id, rapportino_id, trasferta_id,
  destinazione `cliente`|`studio`|`personale`, anticipazione 0/1 (documento intestato al cliente: art. 15),
  pagata_da_me 0/1, stato `bozza`|`da_approvare`|`approvata`|`respinta`, rimborsata_il, fatturata_il, motivo, creato,
  modificato); le foto sono i file `spesa` col suo `spesa_id`
- `trasferte` (id, utente_id, dal, al, destinazione, motivo, commessa_id, cliente_id, km, veicolo, euro_km
  (congelato), indennita, stato come le spese, rimborsata_il, creato, modificato)
- `veicoli` (id, nome, alimentazione, euro_km, anno_aci, attivo): l'auto di oggi (`AUTO`, `EURO_KM`) diventa il primo
  veicolo; dalla fase 6 il modulo Mezzi ne fa la scheda completa
- `rapportini`: colonne nuove `stato_approvazione` (vuoto, `da_approvare`, `approvato`, `respinto`), `approvato_da`,
  `approvato_il`, `motivo`. Gli stati del rapportino (BOZZA → FIRMATO → INVIATO → FATTURATO) non cambiano; un
  rapportino da approvare non si manda al cliente e non si fattura finché non è approvato.

**Le spese nel rapportino.** Le foto e l'importo che si scrivono nel passo 3 del rapportino diventano righe `spese`
legate al rapportino, con destinazione `cliente` (come oggi: vanno nel conto). La colonna `spese` del rapportino resta
il totale delle sue spese al cliente, così i conti e i PDF di oggi non cambiano e i rapportini già scritti restano
identici al centesimo. Una spesa del rapportino cambiata in *Allo studio* o *Mia* esce dal conto del cliente.

**Conti**: rimborso km della trasferta = km × euro_km (congelato), arrotondato al centesimo; rimborsi dovuti a una
persona = spese `pagata_da_me` approvate + rimborsi km + indennità, meno quelle già rimborsate. Il costo di una commessa
somma: ore dei rapportini e ore registrate × costo orario, km, spese allo studio e al cliente.

## 4. Azioni nuove

- `ore {da, a, utente?, commessa?, stato?}` (rapportini 1; il collaboratore solo le sue), `salvaOre` (rapportini 2),
  `togliOre`, `timer` (lo stato del proprio), `avviaTimer`, `fermaTimer` (→ la riga in bozza)
- `daApprovare` (chi può approvare: titolare, amministrazione, responsabile della commessa) con ore, rapportini, spese,
  trasferte in attesa e le **anomalie** (più di `ORE_GIORNALIERE` + 4 in un giorno, spesa senza foto, spesa sopra 200 €,
  km diversi dal solito per quella commessa); `approva {voci:[{tipo,id}]}`, `respingi {voci, motivo}` (motivo
  obbligatorio), con notifica nel registro e nella Dashboard di chi ha scritto
- `statisticheOre {da, a, per: 'persona'|'commessa'}` (rapportini 1; soldi solo con `costi`): ore totali, fatturabili,
  percentuale, costo
- `spese {da, a, utente?, commessa?, stato?, destinazione?}` (spese 1), `salvaSpesa` (spese 2), `togliSpesa`;
  `trasferte`, `salvaTrasferta`, `togliTrasferta`
- `rimborsi {utente?}` (spese 1): cosa va restituito a chi; `segnaRimborsato {voci}` (spese 2, solo titolare e
  amministrazione)
- `veicoli`, `salvaVeicolo` (amministrazione 2)
- `riepilogoSpese {da, a, per: 'persona'|'commessa'|'categoria'}`
- `dashboard`: voci nuove (cose da approvare per chi approva; respinte per chi ha scritto; timer acceso da più di 10
  ore; rimborsi da fare; a gennaio "Aggiorna il rimborso km con le tabelle ACI {anno}")
- `esporta {cosa: ore|spese|trasferte|rimborsi}`

## 5. Schermate

**Ore e rapportini** (voce 6), segmenti in alto: **Ore · Rapportini · Da approvare** (l'ultimo solo per chi approva).
- *Ore* — telefono: la **scheda del timer** in cima (fermo: "Avvia il timer" con la commessa scelta tra le recenti;
  acceso: il tempo che scorre in grande, la commessa, **Ferma**); sotto la settimana (giorni con le ore, come Il tuo
  giorno) e le righe del giorno scelto (commessa, ore, fatturabile o no, stato); **Registra ore** (giallo) apre il
  modulo corto: commessa (recenti come schede), durata con gli stepper a mezz'ore o inizio-fine-pausa, Fatturabile
  sì/no, Straordinarie, prestazione, attività, descrizione. Computer: il **timesheet della settimana** (righe = commesse,
  colonne = giorni, celle da scrivere, totali per riga e per giorno), il timer nella barra in alto, e **Statistiche**
  (per persona e per commessa: ore, fatturabili, percentuale, costo; barre orizzontali).
- *Rapportini*: com'è oggi, più la pillola "Da approvare" / "Respinto: motivo" dove serve.
- *Da approvare*: gruppi per persona; ogni riga con la casella, cosa (ore, rapportino, spesa, trasferta), quando,
  quanto, e l'anomalia in giallo scuro; in alto "Seleziona tutto"; in basso **Approva (N)** (giallo) e **Respingi**
  (con il motivo obbligatorio). Dopo: avviso con Annulla.

**Spese e trasferte** (voce 7, tra Ore e rapportini e Fatturazione):
- *Elenco*: il mese con ‹ ›, tre riquadri (Al cliente · Allo studio · Da rimborsare), segmenti **Spese · Trasferte ·
  Rimborsi**; righe: icona della categoria, descrizione, "commessa · data", importo, a chi va in pillola (Al cliente
  blu, Allo studio grigia, Mia viola), stato se non approvata. **Nuova spesa** giallo.
- *Nuova spesa*: telefono = prima la fotocamera (o "Senza scontrino"), poi importo grande con la tastiera numerica,
  categoria a pillole, data (oggi), commessa (recenti), **A chi va**: Al cliente · Allo studio · Mia (di base: Al
  cliente se c'è una commessa, Allo studio se no), "Il documento è intestato al cliente" (solo per Al cliente: diventa
  anticipazione), **L'ho pagata io** sì/no, descrizione. Computer = finestra con la foto a sinistra.
- *Trasferta*: dal/al, destinazione, motivo, commessa, km (con "Andata e ritorno" che raddoppia), veicolo con il suo
  €/km, indennità; il rimborso km calcolato si vede subito; le spese della trasferta si aggiungono da qui.
- *Rimborsi*: per persona, il totale da restituire e le voci; **Segna rimborsato** (titolare e amministrazione).
- *Riepiloghi*: per persona, periodo, commessa, categoria; esportazione.
- Amministrazione › **Veicoli e rimborso km**: il veicolo, il suo €/km, l'anno delle tabelle ACI; il collegamento alla
  pagina delle tabelle ACI dell'anno.

## 6. Prove di fine fase

Ore da inizio/fine/pausa e a mano; un timer per persona, che sopravvive al riavvio e crea la bozza; approvazioni con
motivo obbligatorio, Annulla, permessi (il collaboratore non approva, non vede gli altri); i rapportini già scritti
restano identici al centesimo dopo la migrazione delle spese; spesa del rapportino spostata *Allo studio* che esce dal
conto; rimborso km congelato quando cambia il €/km; rimborsi dovuti e "segna rimborsato"; statistiche; schermate vere su
telefono e computer, chiaro e scuro.
