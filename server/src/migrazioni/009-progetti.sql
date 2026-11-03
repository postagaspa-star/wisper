-- I progetti (03/11/2026, chiesti da Manuel): cliente -> commessa -> progetto -> rapportino. Una commessa ha piu'
-- progetti; ogni progetto ha un codice (a mano le prime volte, poi proposto da Wisper: src/codici-progetto.js), a chi
-- e' intestato (facoltativo: per Elettrodinamica, il cliente vero per cui si lavora sotto il suo nome) e una
-- descrizione. I rapportini stanno sotto un progetto. Dopo questo file gira 009-progetti.js: i permessi del modulo.

CREATE TABLE progetti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Un progetto nato sul telefono senza rete arriva col suo id: un invio ripetuto non ne fa un secondo.
  id_locale TEXT UNIQUE,
  commessa_id TEXT NOT NULL COLLATE NOCASE REFERENCES commesse(id),
  codice TEXT NOT NULL COLLATE NOCASE,
  intestato_a TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'APERTO' CHECK (stato IN ('APERTO', 'CHIUSO')),
  -- 1 se il codice e' quello proposto da Wisper (non scritto a mano).
  codice_automatico INTEGER NOT NULL DEFAULT 0,
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT NOT NULL,
  modificato TEXT NOT NULL
);
CREATE INDEX progetti_commessa ON progetti(commessa_id);
CREATE INDEX progetti_codice ON progetti(codice);

-- Il rapportino ricorda il suo progetto: l'id e, come per la commessa, il codice (e' quello che si cerca).
ALTER TABLE rapportini ADD COLUMN id_progetto INTEGER;
ALTER TABLE rapportini ADD COLUMN progetto TEXT NOT NULL DEFAULT '';
CREATE INDEX rapportini_progetto ON rapportini(id_progetto);

-- Tutte le funzioni si spengono (03/11/2026, Manuel: "nessuna obbligatoria").
UPDATE impostazioni SET descrizione = 'Le funzioni spente (sparisce dal menu di tutti, i dati restano). Si spengono tutte.' WHERE chiave = 'MODULI_SPENTI';
