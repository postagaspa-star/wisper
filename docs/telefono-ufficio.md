# Wisper 0.4.0: l'ufficio sul telefono

Tutto quello che fa Wisper Ufficio, anche sul telefono, per quando Manuel è fuori. Il computer resta il posto
principale; sul telefono l'ufficio è una sezione accanto al lavoro di campo, che non cambia.

**Il riferimento è il prototipo approvato da Andrea il 21/10/2026**:
[`docs/prototipo/TelefonoUfficio.html`](prototipo/TelefonoUfficio.html) (pubblicato anche come
https://claude.ai/artifact/1iwJtdXJtXoDhFnropeeus). Si apre in un browser: chi costruisce ne riproduce disposizione,
testi, misure e comportamenti. Colori, caratteri e forme sono quelli di `docs/aspetto.md` e di `ui/Tema.kt`
(`W.colori`, `W.testi`); i componenti comuni sono in `ui/Componenti.kt`. Il comportamento di ogni funzione è
quello di Wisper Ufficio: `pc/ui/app.js` (pagine), `pc/ui/conti.js` (conti), `pc/ui/documenti.js` (PDF),
`apps-script/Code.gs` (le azioni del foglio).

## Navigazione (ui/Navigazione.kt, MainActivity.kt)

Barra in basso con tre voci, sempre con l'etichetta: **Oggi · Rapportini · Ufficio**. Ogni sezione ha la sua pila
di pagine; toccare la sezione già aperta torna alla sua prima pagina. Il numerino giallo su Ufficio è il numero di
clienti con qualcosa da fatturare nel mese corrente. La barra si nasconde nelle pagine "compito" (moduli, invio)
e nelle schermate a tutto schermo che esistono già (rapportino a passi, firma, collegamento).

Rotte (stringhe, come prima):

| Rotta | Schermata | File |
|---|---|---|
| sezione OGGI | `SchermataOggi` (com'era; "Il mese" → sezione Rapportini; riga "Fine mese" → Ufficio) | ui/Oggi.kt |
| sezione RAPPORTINI | `SchermataRapportini` (prende il posto di Mese) | ui/Rapportini.kt |
| sezione UFFICIO | `SchermataUfficio` (fine mese) | ui/Ufficio.kt |
| `invio/cliente/<idCliente>/<aaaa-mm>` | prepara il riepilogo del mese di un cliente | ui/Invio.kt |
| `invio/rapportino/<idLocale>` | invia un rapportino solo al cliente | ui/Invio.kt |
| `invio/scelti/<idLocale>,<idLocale>…` | riepilogo dei rapportini scelti | ui/Invio.kt |
| `commesse` · `commessa/<id>` · `commessa-modifica/<id>` · `commessa-nuova` · `commessa-nuova/<idCliente>` | commesse | ui/Commesse.kt |
| `clienti` · `cliente/<id>` · `cliente-modifica/<id>` · `cliente-nuovo` | clienti | ui/Clienti.kt |
| `impostazioni` | impostazioni complete | ui/Impostazioni.kt |

Il rapportino aperto resta `SchermataRapportino` (ui/Rapportino.kt), a tutto schermo: per i rapportini firmati,
inviati o fatturati il riepilogo ha UN pulsante giallo secondo lo stato (Firmato → Invia al cliente, Inviato →
Segna fatturato, Fatturato → PDF del rapportino; la bozza resta com'è, Fai firmare al cliente) e il menu ⋯ con le
voci del computer stato per stato (vedi prototipo, `menuRapportino`).

`Navigatore` (ui/Navigazione.kt) è quello che le schermate ricevono: `vai(rotta)`, `indietro()`,
`sezione(Sezione, filtro)`, `apriRapportino(idLocale)`, `nuovoRapportino(giorno, idCliente, idCommessa)`.
`FiltroRapportini(mese: YearMonth?, quali: Quali, idCliente: String?, idCommessa: String?)` è il filtro della
sezione Rapportini (mese null = tutti i mesi).

## Dati (Dati.kt, Archivio.kt, DatiEsempio.kt, rapportino/*)

Le schermate chiedono tutto a `Dati`. Oltre a quello che c'era:

- Modelli completi come sul foglio: `Cliente` (email, telefono, indirizzo, partitaIva, alias, tariffaFissa,
  ultimaTariffa, costoFisso, pagaViaggio, kmRimborsati, maggExtra, note), `Commessa` (cliente, descrizione, stato,
  indirizzo, budgetOre, budgetEuro, prezzoOrario, costoOrario, euroKm, inizio, finePrevista, cartella, note),
  `Rapportino` con inviatoIl e fatturatoIl, le impostazioni del foglio (mappa CHIAVE → valore).
- `storico`: tutti i rapportini del foglio, non solo gli ultimi mesi (il cruscotto delle commesse e "restano da
  fatturare dei mesi prima" li vogliono tutti), con la coda sopra come per `viste`.
- `cambiaStato(idLocali, stato)`: INVIATO, FATTURATO, BOZZA (Riporta in bozza: toglie la firma), passa dalla coda
  come gli altri, quindi funziona anche senza rete. Mai un passo indietro per errore: le regole sono quelle del
  computer (`Segna inviati` salta i fatturati, ecc.).
- In diretta, con la rete, e con un risultato da mostrare: `salvaCliente`, `salvaCommessa`, `salvaImpostazioni`,
  `documenti(idCommessa)`, `caricaDocumento`, `caricaFirmaTecnico`, `caricaFoglioFirmato`, `inviaEmail`
  (mai ripetuta in automatico: due tentativi = due email), `file(id)` per le immagini dei PDF.
- `rapportino/Conti.kt`: `budgetDi`, `cruscotto`, `settimane`, chi paga, intestatario e periodo del riepilogo,
  portati da `pc/ui/conti.js` con le stesse prove di `pc/prove/conti.test.js`.

## PDF (rapportino/Stampa.kt)

Gli stessi due documenti del computer, dagli stessi modelli: `pc/ui/documenti.js` e `pc/ui/conti.js` vengono copiati
negli asset dell'app dalla build (una sola sorgente), con `pc/ui/font/Figtree.ttf`. Una WebView nascosta li
carica, chiama `rapportino(...)` o `riepilogo(...)` coi dati in JSON come li dà il foglio, e stampa in PDF
(A4, margini dal CSS). Le immagini `/file/<id>` (firme, scontrini, la firma del tecnico) arrivano da `Dati.file`.
Il file va in `cacheDir/pdf/<nome>.pdf` con i nomi del computer. Aprire = intent VIEW, condividere = Sharesheet
di Android, tutti e due tramite FileProvider.

## Chi tocca cosa (lavoro in parallelo)

Ognuno modifica solo i suoi file. Se serve qualcosa in un file di un altro, lo dice invece di modificarlo.
Compilare con `JAVA_HOME='C:\Program Files\Android\Android Studio\jbr' ./gradlew -q :app:compileDebugKotlin`
(prove: `:app:testDebugUnitTest`). Altri compilano nello stesso momento: se Gradle aspetta un lucchetto o va in
timeout, aspettare un minuto e riprovare. Mai `clean`, mai cancellare `build/`, niente emulatore (lo usa chi
coordina alla fine).

## Testi

Italiano semplice, frasi corte, niente punti esclamativi, niente frasi d'aiuto fisse sotto i campi (docs/aspetto.md
§10). Stati con la parola ("Da firmare", "Firmato", "Inviato", "Fatturato"; commesse "Aperta", "Sospesa",
"Chiusa"). Conferme come fogli dal basso, con il numero ("Segnare 3 rapportini come fatturati?"); dopo
un'azione reversibile un avviso con **Annulla**. Errori: cosa è successo e cosa fare.
