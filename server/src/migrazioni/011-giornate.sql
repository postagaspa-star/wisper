-- Il rapportino con piu' lavori (06/11/2026, docs/gestionale/rapportino-lavori.md §2). Il rapportino e' la giornata:
-- data, chi l'ha scritto, il numero che si vede (RAP/2026/0153). Ogni riga di rapportini diventa un LAVORO della sua
-- giornata (con tutti i campi di oggi: cliente, commessa, progetto, ore, km, tariffa congelata, stato...), cosi' conti,
-- fatture, ore, budget, Dashboard, portale e copie continuano a lavorare riga per riga.
-- Si puo' fare sul database vero: ogni riga che c'e' diventa un rapportino con un solo lavoro (stesso numero, posizione
-- 1); niente si cancella e nessun numero cambia. La copia wisper.db.prima-11 la fa il server prima di questo file.

CREATE TABLE giornate (
  -- Il numero che si vede, dalla numerazione "rapportino" (RAP/2026/0153). I lavori nuovi hanno l'id <questo>-<n>.
  id TEXT PRIMARY KEY,
  -- Un rapportino nato sul telefono senza rete arriva col suo id: un invio ripetuto non ne fa un secondo.
  id_locale TEXT UNIQUE,
  data TEXT NOT NULL DEFAULT '',
  tecnico TEXT NOT NULL DEFAULT '',
  -- Chi l'ha scritto (un collaboratore tocca solo i suoi).
  utente_id INTEGER,
  creato TEXT NOT NULL DEFAULT '',
  modificato TEXT NOT NULL DEFAULT ''
);
CREATE INDEX giornate_data ON giornate(data);

-- Il lavoro sa di quale rapportino e', e in che posto (l'ordine nel rapportino).
ALTER TABLE rapportini ADD COLUMN id_giornata TEXT;
ALTER TABLE rapportini ADD COLUMN posizione INTEGER NOT NULL DEFAULT 1;

-- Le righe di prima: un rapportino ciascuna, col loro numero.
INSERT INTO giornate (id, id_locale, data, tecnico, utente_id, creato, modificato)
  SELECT id, id_locale, COALESCE(data, ''), COALESCE(tecnico, ''), utente_id, COALESCE(creato, ''), COALESCE(modificato, '') FROM rapportini;
UPDATE rapportini SET id_giornata = id, posizione = 1;
CREATE INDEX rapportini_giornata ON rapportini(id_giornata, posizione);
