# Wisper — aspetto e uso

Guida comune all'app Android e al programma per il computer (Wisper Ufficio). La direzione è il **prototipo
approvato da Andrea il 15/10/2026**: la tela https://claude.ai/artifact/2Kk6nEnfHGpRfEabwjYk7G, copiata in
`docs/prototipo/` (Main = Oggi, Rapportino, Firma, Mese, Ufficio = fine mese, UfficioRapportini). Chi costruisce
apre quei file e ne riproduce misure, colori, pesi e spaziature. Quello che il prototipo non mostra si fa nello
stesso stile, seguendo questa guida.

Per chi è: un perito industriale che lavora da solo. Sul **telefono**, in cantiere o dal cliente, in piedi,
spesso alla luce del giorno, con poco tempo e a volte senza rete: deve registrare la giornata (ore, km, spese,
scontrino, firma) in meno di un minuto. Sul **computer**, in ufficio a fine mese: deve sapere quanto ha lavorato
e per chi, mandare il riepilogo da cui fa la fattura, capire se una commessa rende.

## 0. Principi (dalla ricerca, non gusti)

1. **Parti dal lavoro, non dai dati.** Il telefono si apre su **Oggi**: "il rapportino di oggi è scritto?". Il
   computer si apre su **Fine mese**: "quanto devo fatturare, e a chi?". Gli elenchi vengono dopo.
2. **I giorni che mancano si vedono.** La settimana mostra ogni giorno lavorativo, anche quelli vuoti: un buco
   salta all'occhio e si tocca per riempirlo (le app di fogli ore che mostrano solo i giorni compilati fanno
   dimenticare gli altri).
3. **Una cosa per schermata, in meno di 30 secondi.** Il rapportino è fatto di passi brevi (Per chi → Ore e
   strada → Il lavoro → Riepilogo) con la barra di avanzamento, non una pagina lunga di quattordici campi.
4. **Il sistema ricorda, la persona conferma.** Commesse recenti come schede grandi, "Come ieri", i km
   dell'ultima volta, la tariffa dell'ultima volta. Valori proposti, mai valori fissi inventati: l'unico valore
   predefinito è la data di oggi.
5. **Niente tendine e niente tastiera quando non serve.** Si sceglie toccando schede e pulsanti; le ore si
   mettono con più e meno a passi di mezz'ora e con le scelte rapide 4-6-8; la tastiera solo per il testo e per
   i km diversi dal solito.
6. **Il pollice comanda.** Un solo pulsante principale per schermata, pieno, in basso, alto 64 dp. Tocchi ≥ 48
   dp (gli stepper 52, le schede scelta 84).
7. **Leggibile al sole.** Tema chiaro di base (con molta luce si legge meglio il chiaro), testo quasi nero,
   campi e pulsanti secondari con un bordo visibile, niente ombre sotto testo e pulsanti. Il tema scuro segue
   il telefono, per la sera.
8. **Colore 60-30-10, e mai solo colore.** 60% fondo neutro, 30% schede bianche, 10% giallo Wisper solo sulle
   azioni principali e sul giorno di oggi. Lo stato si dice con una parola ("Da firmare", "Firmato",
   "Inviato", "Fatturato"); il rosso solo per ciò che il foglio ha rifiutato.
9. **Sempre chiaro cosa è al sicuro.** La rete che manca è una pillola grigia e calma ("1 rapportino parte
   appena c'è rete"), mai un errore rosso; un rapportino ancora sul telefono ha la sua icona.
10. **Niente istruzioni scritte in piccolo.** Si impara con la visita guidata dentro l'app vera (§9).
11. **Stessa famiglia di Sol.** Stesso utente, stesse abitudini: stesso carattere, forme, fondi e logica dei
    colori; cambia l'accento (giallo Wisper invece dell'arancio di Sol).

## 1. Fondamenta

### Carattere
**Figtree** (licenza SIL OFL 1.1), incluso: su Android `res/font/figtree.ttf` (file variabile, asse wght) con
licenza in `assets/licenze/figtree-OFL.txt`; sul computer `pc/ui/font/Figtree.ttf`. Niente richieste a Google
durante l'uso. Pesi 400, 500, 600, 700, 800.

| Ruolo | Telefono | Computer | Esempio |
|---|---|---|---|
| Titolo pagina | 30 / 800, spaziatura -0,6 | 34 / 800, -0,8 | "Buongiorno, Manuel", "Ottobre 2026" |
| Titolo scheda grande | 22 / 800, -0,3 | 24 / 800 | "Non l'hai ancora scritto" |
| Titolo sezione | 18 / 800 | 21 / 800 | "Lavoro", "Da fatturare" |
| Numero grande | 28-32 / 800, -0,5 | 30-32 / 800 | "6,5 h", "935,88 €" |
| Testo forte | 16-17 / 800 | 16 / 800 | cliente, titolo di una riga |
| Testo | 16-17 / 500, interlinea 1,45 | 15-16 / 500 | descrizione del lavoro |
| Secondario | 14-15 / 600, tenue | 14-15 / 600, tenue | commessa, ore, data |
| Etichetta | 12 / 700, maiuscolo, 0,08em | 12 / 700, maiuscolo, 0,04em | "IL RAPPORTINO DI OGGI" |
| Pulsante principale | 18 / 800 | 16 / 800 | "Scrivi il rapportino" |
| Pulsante secondario | 16 / 700 | 15-16 / 700 | "Cancella", "Vedi rapportini" |

### Colori

| Ruolo | Chiaro | Scuro |
|---|---|---|
| Fondo | `#F4F4F2` | `#121214` |
| Scheda | `#FFFFFF` | `#1C1C1F` |
| Superficie secondaria (pulsanti tondi, binario segmenti, pillola rete) | `#E7E6E2` | `#2A2A2E` |
| Bordo scheda | `#E6E5E1` | `#2C2C30` |
| Bordo campo e pulsante secondario | `#CFCEC9` | `#46464D` |
| Riga sottile dentro gli elenchi | `#EFEEEB` | `#2A2A2E` |
| Testo | `#1B1B1F` | `#F2F2F3` |
| Testo secondo | `#3F3F46` | `#D4D4D8` |
| Testo tenue | `#5F5F67` | `#A1A1AA` |
| Testo molto tenue (solo disabilitato, giorni futuri) | `#8A8A92` | `#71717A` |
| **Giallo Wisper** (pulsante principale, oggi) | `#FFC53D`, testo `#1B1B1F` | `#FFC53D`, testo `#1B1B1F` |
| Giallo premuto | `#F2B21E` | `#F2B21E` |
| Giallo tenue (voce attiva, "Da firmare") | `#FFF4D6` | `#3A2F14` |
| Testo giallo su chiaro (collegamenti, "Cambia", "manca") | `#8A5A00` | `#FFD76A` |
| Firmato | testo `#1F6A30`, fondo `#EBF7EE` | `#8CE0A4` / `#1E3326` |
| Inviato | testo `#1E4FA8`, fondo `#EAF1FD` | `#9EC1FF` / `#1C2A44` |
| Fatturato | testo `#3F3F46`, fondo `#E7E6E2` | `#D4D4D8` / `#2A2A2E` |
| Rifiutato dal foglio | pieno `#C92A2A`, tenue `#FDEEEC`, testo `#9B1C1C` | `#E03131` / `#3A1C1C` / `#FFA8A8` |
| Barra budget vicina (≥ 85%) | `#E59F00` | `#E59F00` |
| Velo della visita guidata | nero 55% | nero 65% |

Cerchi con le iniziali dei clienti: fondo tenue e iniziali scure dello stesso colore, scelto dal nome in modo
stabile fra blu `#EAF1FD`/`#1E4FA8`, verde `#EBF7EE`/`#1F6A30`, viola `#F1ECFE`/`#5532C9`, ambra
`#FBF3E3`/`#8A5A12`, ardesia `#EEF0F2`/`#343A40`, petrolio `#E6F4F4`/`#0B5E61`. Nel tema scuro fondo al 20%
del colore e iniziali chiare.

Contrasti verificati: testo `#1B1B1F` su giallo 12:1; `#5F5F67` su bianco 6,1:1; `#8A5A00` su bianco 5,9:1.

### Forme, spazio, movimento
- Raggi: schede 20-24, pulsante principale 18, pulsanti secondari e campi 14-16, pillole 999, cerchi.
- Niente ombre su telefono e computer: le schede si staccano col bordo `#E6E5E1`. Ombra solo sotto il pannello
  di dettaglio e le finestre del computer (`-18px 0 40px rgba(20,20,22,.10)`).
- Spazi: margine della pagina 20 (telefono) e 32-40 (computer); 12-16 tra i blocchi; griglia di 4/8.
- Icone a tratto 2-2,4 px, inline, mai emoji. Il simbolo di Wisper è il quadrato nero coi puntini gialli.
- Movimento 200-350 ms con curve morbide: pagine che scorrono con dissolvenza (indietro nel verso opposto);
  il passo successivo del rapportino entra da destra; numeri del totale che contano; barre che si riempiono;
  spunta al salvataggio. Niente rimbalzi, niente feste. Tutto tolto se il sistema chiede meno animazioni
  (Android: scala animazioni a 0; computer: `prefers-reduced-motion`).

## 2. Telefono: navigazione
Niente barra in basso: **Oggi** è la casa. Da lì: il rapportino (pulsante grande, "Come ieri", un giorno della
settimana), il **Mese** (riga "Ottobre · 32,5 h · 1.227,40 €" e i giorni fatti), le **Impostazioni** (cerchio
con le iniziali in alto a destra). Indietro con il pulsante tondo in alto a sinistra e col gesto di sistema.

## 3. Oggi (casa)
Come `docs/prototipo/Main.dc.html`:
- In alto il simbolo e "Wisper"; a destra il cerchio con le iniziali di chi compila (→ Impostazioni).
- Data ("Giovedì 15 ottobre", 15/600 tenue) e "Buongiorno/Buon pomeriggio/Buonasera, {nome}" (senza nome:
  solo il saluto).
- Dalla 0.3.6 la scheda **"QUESTA SETTIMANA"** (descritta sotto) sta in cima, sopra quella del rapportino di oggi:
  lo ha chiesto lo studio, la prima cosa da vedere sono i giorni che mancano.
- **Scheda "IL RAPPORTINO DI OGGI"**:
  - non scritto: "Non l'hai ancora scritto", pulsante giallo **Scrivi il rapportino** (64 dp) e sotto la riga
    **Come ieri** con cliente · commessa · ore · km dell'ultimo rapportino (apre il rapportino già compilato
    con quei dati e la data di oggi, al passo Riepilogo). Se l'ultimo non è di ieri la riga dice il giorno:
    "Come sabato", o "Come il 2 ottobre" oltre la settimana;
  - scritto: "Fatto: {cliente} · {ore} · {totale}" con la parola di stato e la riga "Aggiungi un altro
    rapportino" (secondaria);
  - giorno festivo o weekend senza rapportino: "Oggi è sabato" e la riga "Scrivi comunque".
- **Scheda "QUESTA SETTIMANA"**: lunedì-venerdì (sabato e domenica solo se hanno un rapportino), in alto a destra
  "N di M giorni" (M = giorni lavorativi passati compreso oggi). Ogni giorno: nome breve e numero, cerchio 44:
  fatto = nero con spunta bianca e sotto le ore; mancante = cerchio tratteggiato `#B98300` con il più e sotto
  "manca" (`#8A5A00`) → tocco = nuovo rapportino di quel giorno; oggi = cerchio giallo col pallino; futuro =
  grigio vuoto. Un giorno fatto si tocca → Mese aperto su quel giorno.
- **Riga "N da far firmare"** (solo se ce ne sono): icona firma su giallo tenue, "{clienti}, {giorni}", freccia →
  Mese filtrato sulle bozze.
- **Riga del mese**: etichetta "OTTOBRE", "32,5 h · 1.227,40 €", a destra "Il mese" in giallo scuro con freccia.
- **Pillola della rete** in basso (solo quando serve): grigia, icona nuvola con freccia, "1 rapportino parte
  appena c'è rete" / "N rapportini…". Rifiuto del foglio: la pillola diventa scheda rossa tenue in cima alla
  pagina, "Il foglio non ha accettato un rapportino" + motivo + [Riprova] [Scarta]. Mai rosso per la sola rete.

## 4. Il rapportino
Come `docs/prototipo/Rapportino.dc.html`. In alto: pulsante tondo (passo 1: chiudi ×, poi: indietro) e a
destra "Passo N di 3" / "Riepilogo"; sotto la barra di avanzamento nera su `#E2E1DD`, alta 6.

**Passo 1 · Per chi?**
- Titolo "Per chi?". Pulsante data con bordo: "Oggi, giovedì 15 ottobre" e "Cambia" (giallo scuro) → foglio
  dal basso col calendario.
- "RECENTI": le 3-4 commesse aperte usate più di recente, una scheda alta 84: cerchio con le iniziali, cliente
  (17/800), commessa (15/500), codice commessa (13/600 tenue), freccia. Tocco = scelta e passo 2.
- "Altro cliente o commessa": campo di ricerca con la lente; i risultati compaiono sotto come le schede, prima
  le commesse aperte, poi i clienti. In fondo ai risultati: "+ Cliente nuovo «testo»" e, scelto un cliente,
  "Usa «testo» · 26ST047": il codice della commessa nuova si vede subito, anche senza rete. Cliente nuovo: un
  tocco su "Cliente nuovo «testo»", con la tariffa libera (dalla 0.3.5 non ci sono più i gruppi).

**Passo 2 · Ore e strada** (sopra: "{cliente} · {commessa}" tenue)
- Scheda **Lavoro**: titolo a sinistra, a destra stepper (cerchi 52 `#E7E6E2` con − e +, valore 28/800 largo
  76) a passi di mezz'ora; sotto le scelte rapide **4 h, 6 h, 8 h** (pillole alte 46, scelta = nera con testo
  bianco).
- Scheda **Viaggio**: titolo e sotto "pagato" / "non pagato" (13/600 tenue), stepper.
- **+ Ore extra**: pulsante tratteggiato che apre la scheda Extra con il suo stepper (già aperta se il
  rapportino ha ore extra).
- Scheda **Chilometri**: valore in un campo con bordo (tocco = tastiera numerica); sotto le pillole "Ultima
  volta · {km} km" (ultimi km di quella commessa, altrimenti di quel cliente; nascosta se non ce ne
  sono) e "Senza auto" (0).
- Riga **Tariffa**: cliente a tariffa fissa (Elettrodinamica) = "Tariffa fissa {cliente}" e il valore in un riquadro grigio, senza
  frase sotto; tariffa
  libera = "Tariffa oraria", sotto "l'ultima usata per {cliente}" o "prima volta per questo cliente", e il
  valore toccabile (tastiera numerica). Se manca, il pulsante Avanti la chiede con un errore sotto la riga.
- **Barra in basso** (passi 2 e 3): "Totale" e l'importo 24/800 che conta quando cambia; a destra **Avanti**
  (172 × 60, giallo). Senza ore Avanti è grigio e al tocco mostra "Mancano le ore" sotto la scheda Lavoro.

**Passo 3 · Il lavoro** (sopra: "{cliente} · {ore} · {km}")
- "Cosa hai fatto": area di testo grande (17/500).
- "Spese": senza scontrini un riquadro tratteggiato alto 96 **Fotografa lo scontrino** (fotocamera); "Dalla
  galleria" e "Spesa senza scontrino" come pillole sotto. Con scontrini: le miniature in fila (84, con la × per
  toglierle), "+ Un altro scontrino" e "Dalla galleria"; sotto due campi, "Di cosa" e "Importo" (il totale
  delle spese del giorno: sul foglio c'è una colonna sola, come prima).
- "Note per te" chiusa in una riga "+ Una nota per te" (non va sul PDF; lo dice il titolo del campo, "Nota per
  te, non va al cliente").

**Riepilogo**
- Data in alto, titolo "Riepilogo". Scheda con tre righe (cliente e commessa; ore e km; lavoro e spese), ognuna
  con **Cambia** che riporta al suo passo (poi Avanti torna qui).
- Scheda del conto: "Ore · 6,5 h × 30 €", "Km · 96 × 0,76 €", "Spese", e **Totale** 32/800.
- In basso **Fai firmare al cliente** (giallo, 64) e sotto, come testo, **Salva senza firma**. Salvare porta a
  Oggi con la spunta che compare sulla scheda del giorno.

**Riaprire un rapportino**: si apre sul Riepilogo, con la parola di stato in alto e i quattro passi
Da firmare → Firmato → Inviato → Fatturato (come nel pannello del computer). Firmato o oltre: niente "Cambia", il
conto e la firma (immagine e "{nome} · {data ora}"), e in basso **Aggiungi uno scontrino** e il testo
**Riporta in bozza** (foglio di conferma: "La firma del cliente viene tolta: ha firmato il rapportino
com'era"). Menu ⋯ in alto: "Elimina" (solo bozze).

## 5. Firma
Come `docs/prototipo/Firma.dc.html`, tema chiaro anche quando il telefono è scuro (il cliente firma su un
foglio bianco). Sopra "{cliente} · {data}", titolo "Firma del cliente", scheda col lavoro e "ore di lavoro ·
ore di viaggio · km" (**mai i soldi**: il telefono è in mano al cliente). Campo "Nome di chi firma". Riquadro
bianco alto 300 col bordo, linea della firma e, sotto, "Firmando confermi lavoro e ore del rapportino" (è una
conferma, non un'istruzione). In basso **Cancella** (bordo) e **Conferma firma** (giallo, con spunta); Conferma
è attivo solo con nome e almeno un tratto. Dopo: Oggi, con la spunta.

## 6. Mese
Come `docs/prototipo/Mese.dc.html`. Pulsante tondo indietro (→ Oggi); a destra mese prima / dopo. Titolo
"Ottobre 2026". Tre riquadri: Ore, Km, Totale. Poi i rapportini **raggruppati per cliente** (Elettrodinamica è
un cliente come gli altri): intestazione in maiuscolo con il totale del
cliente, e una scheda con le righe: giorno (22/800) e giorno della settimana, cliente o lavoro (16/800) e
"ore · commessa" (le ore prima: il nome della commessa può essere lungo), importo e UNA parola di stato ("Da firmare", "Firmato", "Inviato", "Fatturato"); l'icona
della nuvola accanto al titolo se è ancora sul telefono, il bordo rosso se il foglio l'ha rifiutato. In basso
**Nuovo rapportino** (giallo, 64) su una sfumatura del fondo. Mese senza rapportini: una riga calma "Nessun
rapportino a settembre".

## 7. Le altre schermate del telefono
- **Impostazioni**: schede bianche a gruppi, voci con titolo, valore attuale e freccia (si modificano in un
  foglio dal basso):
  - *Tu*: Nome di chi compila (vuoto = quello del foglio).
  - *Il foglio*: Collegamento (stato col pallino verde/rosso, ultima lettura, "Aggiorna" o "Riprova" se c'è
    un errore), Indirizzo, Codice.
  - *Tariffe*: la tariffa del cliente (fissa o libera), viaggio, km; rimborso km con l'auto. Solo da leggere
    (si cambiano da Wisper Ufficio): righe senza freccia, nessuna frase d'aiuto.
  - *App*: Tema (automatico, chiaro, scuro), **Rifai la visita guidata** ("Da capo, coi dati di esempio": riparte dal primo passo), Versione, Licenze.
- **Versione** (in fondo alle Impostazioni): "Versione 0.3.0" e sotto "Si aggiorna da sola", "La 0.4.0 è
  pronta" o l'esito dell'ultimo controllo; a destra **Controlla** o **Installa**. In Oggi, solo se il telefono
  ha chiesto un tocco per installare, una riga col simbolo: "Versione nuova di Wisper · La X è pronta: tocca
  per installarla". Di solito non si vede niente: si installa da sola ad app chiusa.
- **Primo avvio / collegamento**: il simbolo grande, "Collega Wisper al tuo foglio", campi Indirizzo e Codice
  grandi, pulsante giallo "Collega". Collegato: parte la visita guidata.
- **Stati**: senza rete tutto resta consultabile coi dati dell'ultima lettura, più la pillola grigia; errore
  del foglio = frase chiara nella scheda interessata con "Riprova"; caricamento = segnaposto che pulsano piano,
  niente rotelle infinite.
- **Foglio del calendario** (cambio data): dal basso, mese con i giorni grandi, i giorni con rapportino segnati
  da un pallino.

## 8. Computer
Come `docs/prototipo/Ufficio.dc.html` e `UfficioRapportini.dc.html`. Barra laterale bianca larga 248 col
simbolo, "Wisper / Ufficio" e le voci **Fine mese**, **Rapportini**, **Commesse**, **Clienti**,
**Impostazioni** (voce attiva su giallo tenue, 800); in fondo lo stato del foglio ("Foglio letto alle 16:52"
con spunta verde, oppure "Foglio non raggiunto · Riprova").

- **Fine mese** (casa): titolo col mese e ‹ ›, sotto "N rapportini · ore · km"; "Nuovo rapportino" con bordo.
  Tre riquadri: **Da fatturare** (firmati e inviati non fatturati), **Da far firmare** (bozze), **Fatturato**.
  Sezione **Da fatturare**, una scheda per chi paga: cerchio con iniziali, nome, "N rapportini di {clienti} ·
  ore · km", totale 30/800, **Vedi rapportini** (bordo) e **Prepara riepilogo** (giallo). Dopo l'invio la
  scheda dice "Riepilogo inviato a {email}" con la spunta verde e il pulsante diventa **Segna fatturati**;
  dopo, "Fatturato oggi" e la scheda esce dalla sezione la volta successiva. Sezioni **Da far firmare** (righe)
  e **Commesse da guardare** (commesse oltre l'85% delle ore a budget o oltre la fine prevista: codice, nome,
  "Vicina al budget"/"Oltre il budget"/"Scaduta", barra, "ore di budget · margine"). Niente da fatturare: una
  riga calma con la spunta.
- **Finestra Prepara riepilogo**: a sinistra l'anteprima della pagina, a destra "Riepilogo di {mese}", "{chi} ·
  {totale}", campo **A** (email del cliente), caselle "Con gli importi" (spuntata) e "Con le foto
  degli scontrini", "Cambia il messaggio" (apre Oggetto, Copia anche a, Messaggio, già scritti), pulsanti
  **Annulla**, **Solo il PDF**, **Invia per email** (giallo), e il testo "Segna come inviato senza email".
  "Mandane una copia a me" nel menu ⋯ della finestra. La stessa finestra fa **Invia al cliente** per un
  rapportino solo: va all'email del cliente (senza, a quella di chi paga) e "Con gli importi" parte tolta.
- **Rapportini**: titolo e **Nuovo rapportino** (giallo); ricerca, mese, segmenti **Tutti | Da fatturare | Da
  firmare**. Niente tendine per cliente o commessa: quando si arriva da "Vedi rapportini", da un cliente o da
  una commessa il filtro compare come pillola gialla tenue con la × per toglierlo. Rapportini raggruppati per chi paga: intestazione con nome, "N rapportini · ore · km", totale e
  **Prepara riepilogo**; tabella con Data, N°, Commessa (con cliente o codice sotto), Lavoro svolto, Ore, Km,
  Spese, Totale (numeri a destra, cifre allineate), Stato (una parola). Riga scelta su giallo chiarissimo
  `#FFF8E5`. In fondo il totale di quello che si vede. Selezione multipla con la casella a inizio riga (compare
  passando sopra la riga) e la barra "N scelti · totale · PDF riepilogo · Segna inviati · Segna fatturati".
- **Pannello del rapportino** (a destra, 440): numero e stato, ×; i quattro passi; cliente, commessa e data;
  il lavoro in un riquadro grigio; Ore, Km, Spese; il conto col totale 28/800; la firma se c'è; scontrini in
  miniatura. In basso **PDF**, **⋯** (Modifica, Carica foglio firmato, Riporta in bozza, Elimina, Segna
  inviato senza email, Non ancora fatturato) e UN pulsante giallo che dipende dallo stato: Bozza → **Modifica**,
  Firmato → **Invia al cliente**, Inviato → **Segna fatturato**, Fatturato → **PDF** (e niente altro pieno).
- **Modulo del rapportino sul computer**: la stessa sequenza del telefono in una finestra larga a due colonne
  (a sinistra Per chi con le recenti e la ricerca, Ore e strada con gli stepper; a destra Il lavoro, spese,
  e il conto che si aggiorna), un solo **Salva** giallo in basso.
- **Commesse**: segmenti **Aperte | Sospese | Chiuse | Tutte** con il numero, e "mostra anche le N nascoste"
  quando il filtro nasconde qualcosa; righe con codice (pillola nera col testo giallo), nome e cliente, stato,
  ore sul budget con la barra, costo, valore atteso, margine; pallino rosso oltre il budget. **Commessa
  aperta**: codice, nome, stato, cliente · cantiere · date; Sospendi / Chiudi / Riapri e **Modifica**; schede
  Panoramica (tre riquadri valore-costo-margine, barra fatturazione, ore sul budget e tempo, settimane),
  Rapportini, Costi, Da fatturare, Documenti — come oggi, nello stile nuovo.
- **Clienti**: ricerca; righe con cerchio, nome, tariffa ("30 €/h fissa" o "libera"), ultima tariffa usata,
  email, commesse aperte, ore e totale del mese; finestra di modifica con tariffa fissa (vuota = libera),
  ultima tariffa, viaggio e km come segmenti "Sì | No".
- **Impostazioni**: schede per Il foglio (indirizzo già scritto nel programma, come nell'app: basta il codice; con un indirizzo sbagliato il messaggio lo dice), Lo studio (intestazione dei PDF), La tua firma,
  Rimborso km e costi, L'app (tema
  Automatico | Chiaro | Scuro, **Visita guidata · Rifai la visita guidata** (anche prima di collegare il foglio: usa i dati di esempio), licenze, versione). Ogni scheda ha il suo **Salva** con il
  bordo: il giallo c'è solo su **Collega** quando il foglio non è ancora collegato. Le frasi che prima stavano
  fisse sotto i campi diventano la conferma dopo il salvataggio ("Vale per i rapportini nuovi: quelli già
  scritti tengono il rimborso con cui sono nati").
- **Avvisi**: in basso al centro, scuri, 3,5 s; gli errori restano finché non si chiudono, con cosa fare.
- **Versione nuova**: si scarica da sola; quando è pronta, sopra lo stato del foglio nella barra laterale
  compare un riquadro giallo tenue "Versione X pronta · Parte alla prossima apertura, o subito:" con
  **Riavvia Wisper Ufficio**. In Impostazioni › L'app la riga "Versione X" dice "Si aggiorna da solo ·
  controllato alle HH:MM" con **Cerca aggiornamenti**.

## 9. Visita guidata (al posto delle istruzioni scritte)
Sulle **schermate vere**, con **dati di esempio** (stesse pagine e stesso codice, sorgente dati finta in
memoria: niente letture né scritture sul foglio, niente coda). Una pillola "Esempio" nel fumetto, accanto a
"2 di 9", ricorda che i dati non sono veri (in alto copriva i pulsanti della pagina). Velo scuro con un buco arrotondato attorno all'elemento, anello giallo che pulsa piano; il buco
scivola e si ridimensiona da un elemento al successivo. Fumetto vicino al buco: "2 di 9", titolo corto
(18/800), UNA frase (16/500); **Indietro** sempre, **Avanti** solo nei passi da leggere; **Salta la visita**
sempre in alto a destra. Nei passi da fare si va avanti solo facendo l'azione vera sull'elemento illuminato;
una mano (anello vuoto che pulsa, nell'angolo in basso a destra dell'elemento: al centro copriva la scritta)
mostra il tocco finché non lo si fa.
Tocco fuori dal buco: il fumetto fa un piccolo scatto. Parte da sola al primo collegamento (e una volta dopo
questo aggiornamento), si riapre da Impostazioni.

Telefono:
1. Oggi, scheda del rapportino (leggi): "Il tuo giorno" / "Qui vedi subito se il rapportino di oggi è scritto."
2. **Scrivi il rapportino** (fai: tocca).
3. Passo 1, scheda di Batokyo (fai: tocca): "Per chi" / "I clienti di questi giorni sono già qui."
4. Passo 2, scelta rapida **6 h** (fai: tocca): "Le ore" / "Tocca 6 h, poi aggiusta con più e meno."
5. Passo 2, **Ultima volta · 96 km** (fai: tocca): "I chilometri" / "Wisper ricorda i km dell'ultima volta."
6. Passo 2, totale in basso (leggi): "Il conto" / "Il totale si aggiorna mentre scrivi."
7. **Avanti** (fai): "Il lavoro" / "Tocca Avanti per scrivere cosa hai fatto." Poi passo 3, riquadro dello
   scontrino (leggi): "Gli scontrini" / "Fotografa lo scontrino subito, o aggiungilo dopo." La descrizione
   dell'esempio è già scritta (sotto il velo non si può scrivere, e senza descrizione Avanti si ferma).
8. **Avanti** (fai): "Il riepilogo" / "Tocca Avanti per vedere tutto prima di salvare." Riepilogo, **Fai
   firmare al cliente** (leggi): "La firma" / "Il cliente firma col dito sul tuo telefono."
9. Oggi, giorno "manca" (leggi): "I giorni che mancano" / "Un giorno senza rapportino si vede subito: toccalo
   per scriverlo."
10. Fine: il velo si dissolve, "Ecco fatto" / "Adesso Wisper lavora con i tuoi rapportini veri." [Inizia].

Computer (8 passi più la fine): Fine mese, riquadro Da fatturare (leggi) → scheda di Elettrodinamica,
**Prepara riepilogo** (fai) → nella finestra **Invia per email** (fai; è un esempio, non parte niente) →
**Segna fatturati** (fai) → **Rapportini** nella barra laterale (fai) → segmento **Da firmare** (fai) → una
riga (fai) → pannello, pulsante giallo (leggi: "Il pulsante giallo è sempre la cosa da fare adesso") → "Ecco
fatto" / "Adesso Wisper Ufficio lavora con i tuoi rapportini veri." [Inizia]. Esc durante la visita non chiude
le finestre: si esce solo con "Salta la visita". Parte da sola la prima volta che il foglio risponde; si
rifà da Impostazioni › L'app.

## 10. Testi
- Vietate le frasi d'aiuto fisse in piccolo ("Facoltativa", "Pasti, pedaggi, materiale pagato da te", "Non
  finiscono sul PDF del cliente", "Calcolato sul telefono: il foglio lo conferma", "Prima salvo il
  rapportino", "Si numera da solo"…). Restano: etichette brevi, numeri, errori chiari con cosa fare,
  conferme, una riga negli elenchi vuoti, la frase di conferma della firma.
- Italiano semplice, frasi corte, niente punti esclamativi, niente gergo ("sincronizzazione", "coda",
  "script" non compaiono: si dice "foglio", "parte appena c'è rete").

## 11. PDF
Restano i due documenti di oggi (rapportino e riepilogo), con il carattere Figtree, i grigi di questa guida e
il simbolo di Wisper piccolo nel piè di pagina accanto a "Pagina X / Y". Niente giallo pieno sul PDF (si stampa
in bianco e nero).

## 12. Cosa NON cambia
Logica e garanzie: il foglio è l'unico posto dei conti e dei dati; la coda su disco e l'invio quando torna la
rete; il codice cifrato sul computer; tariffe fissate nella riga; firmato = bloccato finché non torna in
bozza; nessuno stato torna indietro per errore; test esistenti; accessibilità (lettore schermo, tocchi ≥ 48 dp,
contrasti 4,5:1 / 3:1).
