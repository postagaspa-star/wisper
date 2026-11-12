# I km del rapportino scritti da soli (12/11/2026, 1.3.3)

## Perché

Manuel vuole che i km percorsi per un cliente siano **suggeriti in automatico**. Andrea era indeciso fra due strade:

1. il telefono guarda dove va Manuel (posizione) e, se il posto ha il nome di un cliente, riempie il campo;
2. Wisper calcola i km dalla sede del cliente, ma allora servono anche i luoghi degli "intestatari" dei progetti di
   Elettrodinamica, che sono come dei sotto-clienti.

Scelte di Andrea (12/11/2026, domande a scelta, tutte sul consiglio):

- **Dal luogo del lavoro**: ogni progetto ha il suo **Dove**; commessa e cliente fanno da riserva.
- **Andata e ritorno**: i km proposti sono quelli di tutto il giro, come si scrivono oggi nei rapportini.
- **Mappa di Google, dallo script del foglio**: il servizio Maps di Apps Script, gratis e senza chiavi.

Perché non la posizione del telefono: per sapere che Manuel è "da un cliente" servono comunque le coordinate di ogni
cliente (quindi gli indirizzi, cioè la strada 2); il telefono dovrebbe avere il permesso "Consenti sempre" alla posizione
(batteria, e Android lo fa togliere spesso); per i collaboratori seguire gli spostamenti tocca l'art. 4 dello Statuto dei
lavoratori; e i km veri di un giorno cambiano (deviazioni, due clienti di fila), mentre per il rimborso serve un numero
stabile e controllabile.

Dai dati veri del NAS (11/11): 21 dei 22 lavori con km sono su un progetto, con 13 "Intestato a" diversi. Per questo il
luogo sta nel **progetto**: gli intestatari non diventano clienti, basta scrivere dove si lavora.

## Il luogo

- **Progetto › Dove** (nuovo, facoltativo, "Via, numero e comune"). Quando si scrive un "Intestato a" già usato in un altro
  progetto, Dove si riempie da solo col suo indirizzo (finché non lo si cambia a mano); anche il server, se un progetto
  nuovo arriva senza Dove, prende quello del progetto più recente con lo stesso Intestato a (`doveDiIntestato`).
- **Commessa**: il suo indirizzo o quello della sua sede.
- **Cliente**: indirizzo, CAP, comune e provincia della scheda.

## La strada (server)

- Migrazione `013-dove-km.sql` (schema 13): colonna `progetti.dove` e tabella `distanze (da, a, metri, trovato_a,
  calcolato)`, chiave = indirizzo dello studio e indirizzo di arrivo normalizzati (minuscolo, spazi singoli).
- `server/src/azioni/km.js`: il **giro** parte 20 s dopo l'avvio e poi ogni 2 minuti; chiede allo script la strada degli
  indirizzi che non l'hanno ancora, al massimo 10 per giro. **Una volta per indirizzo**: la risposta si ricorda in
  `distanze`. Un indirizzo che la mappa non trova si ricorda come non trovato (metri vuoti) e si riprova solo se lo si
  cambia. Se cambia l'indirizzo dello studio, tutte le strade si rifanno da sole.
- Partenza: **Dati dello studio** (indirizzo, CAP, comune, provincia). Senza indirizzo dello studio il giro non parte.
- Le anagrafiche (`conKmStudio`) portano a telefono e computer `kmStudio` (andata e ritorno, km interi) su progetti,
  commesse e clienti. L'esterno non riceve i km dei clienti.
- Dopo un errore dello script il giro fa una pausa: un'ora se lo script non conosce ancora `postinoDistanza`, 15 minuti
  negli altri casi. Ogni chiamata lascia una riga in Accessi sul foglio, e senza pausa uno script non aggiornato ne
  lascerebbe 720 al giorno.
- Nel log: `[km] strade calcolate: …`, oppure `[km] il giro si ferma: …` col motivo (una volta sola, quando cambia).

## Lo script (postino)

`postinoDistanza` in `apps-script/Ponte.gs` (`docs/gestionale/postino.md`): `Maps.newDirectionFinder()` in auto, lingua
e regione italiane; risponde `{ ok, trovata, metri, a }` (metri della sola andata, indirizzo trovato da Google). Le quote
del servizio Maps di Apps Script non sono pubblicate; con una strada per indirizzo, una volta sola, le richieste sono
poche decine in tutto. Finché lo script vero non ha `postinoDistanza`, il giro scrive "Azione sconosciuta" e riprova
dopo un'ora: niente si blocca e i km si propongono comunque dall'ultima volta.

Per provarlo: il finto Google (`apps-script/prove/finto-google.js`) ha un `Maps` finto con gli stessi metri del postino
finto del server (`distanzaFinta`: sempre gli stessi per la stessa coppia di indirizzi; "introvabile" non si trova).

## Cosa propone il rapportino

Regola unica in `pc/ui/regole-km.js` = `app/.../rapportino/Km.kt`, casi condivisi `pc/prove/casi-km.json`:

1. con un progetto: i km dell'**ultima volta su quel progetto**, se no i **km dallo studio** del suo Dove;
2. se il progetto non c'è, o non ha né Intestato a né Dove (è "il cliente stesso"): l'ultima volta sulla commessa
   (lavori senza progetto), i km dallo studio della commessa, poi l'ultima volta sul cliente, i km dallo studio del cliente;
3. contano solo km maggiori di zero; a parità di giorno vince il primo dell'elenco;
4. **un viaggio, una volta sola**: se un lavoro *prima* di questo nello stesso rapportino ha già i km, niente si scrive da
   solo (le pillole restano). Nei rapportini veri del NAS (12/11) con più lavori i km non sono mai su tutti: in 9 giorni
   su 12 su un lavoro solo, negli altri 3 su due (viaggi diversi). "Prima" e non "un altro": scrivere i km nel lavoro 2
   non toglie quelli scritti da soli nel lavoro 1. Caso condiviso `kmPrima` in `casi-km.json`.

Il numero si scrive da solo nel campo km di un lavoro **nuovo** finché lo si lascia com'era; se lo si cambia a mano o si
tocca una pillola, resta quello. Sotto il campo: **Ultima volta · N km**, **Dallo studio · N km** (solo se diverso) e
**Senza auto**. Un rapportino già salvato non cambia mai da solo.

## Il PDF (stessa versione)

Andrea: "i file per la fatturazione dei rapportini, anche quelli giornalieri (quindi con un solo rapportino) devono essere
fatti secondo questo formato" (il riepilogo). `rapportinoLavori` in `pc/ui/documenti.js` usa ora lo stesso foglio del
riepilogo (`foglioLavori`): in alto a destra "Rapportino di lavoro", il numero e "cliente · giorno · N lavori"; sotto,
mittente e destinatario, la tabella con Data, N°, Progetto, Intestato a, Lavoro svolto, ore, km, spese e importo, il
totale e il conto. Un lavoro di prima con la firma del cliente la mostra ancora in fondo.
