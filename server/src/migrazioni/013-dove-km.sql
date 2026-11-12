-- I km dallo studio (12/11/2026, Manuel: i km del rapportino "suggeriti in automatico"; Andrea ha scelto: dal luogo del
-- lavoro, andata e ritorno, con la mappa di Google attraverso lo script del foglio). src/km.js, docs/gestionale/km.md.
-- Non cambia niente di quello che c'e': aggiunge una colonna vuota e una tabella nuova.

-- Dove si lavora per il progetto (di solito la sede di chi e' "Intestato a"): un progetto di Elettrodinamica e' quasi
-- sempre in un posto diverso dalla sede di Elettrodinamica.
ALTER TABLE progetti ADD COLUMN dove TEXT NOT NULL DEFAULT '';

-- Le strade gia' calcolate, una volta per indirizzo: da = l'indirizzo dello studio, a = quello del lavoro (tutti e due
-- come li scrive normalizza() di src/km.js). metri: la strada in auto, solo andata; NULL se la mappa non l'ha trovato.
-- trovato_a: come la mappa ha capito l'indirizzo (per vedere se ha preso il posto giusto).
CREATE TABLE distanze (
  da TEXT NOT NULL,
  a TEXT NOT NULL,
  metri INTEGER,
  trovato_a TEXT NOT NULL DEFAULT '',
  calcolato TEXT NOT NULL,
  PRIMARY KEY (da, a)
);
