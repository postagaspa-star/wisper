-- Fase 2 del gestionale (ottobre 2026): preventivi, listino, attivita' e calendario.
-- Le tabelle da cui si tolgono righe (voci, sezioni, scadenze, occorrenze, checklist) hanno AUTOINCREMENT:
-- un id tolto non torna mai a un'altra riga, cosi' un telefono che lo ricorda non tocca la riga sbagliata.
-- L'accordo e' in docs/gestionale/fase2.md §3; le risposte in architettura.md §13.
-- Come nella 001: importi in euro come numeri decimali, date "aaaa-mm-gg", istanti ISO col fuso.

-- ------------------------------------------------------------------ impostazioni nuove
-- Dati fissi che la legge vuole nel preventivo (polizza, titoli) e le aliquote. Il valore e' in JSON.
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('POLIZZA_COMPAGNIA', '""', 'La compagnia della polizza professionale: va scritta in ogni preventivo (legge 124/2017).'),
  ('POLIZZA_NUMERO', '""', 'Il numero della polizza professionale.'),
  ('POLIZZA_MASSIMALE', '""', 'Il massimale della polizza professionale, come va scritto nel preventivo.'),
  ('TITOLI', '""', 'Iscrizione al collegio, titoli e specializzazioni: vanno scritti in ogni preventivo.'),
  ('IVA', '22', 'L''IVA in percentuale. Ogni preventivo tiene quella del giorno in cui nasce.'),
  ('EPPI_INTEGRATIVO', '5', 'Il contributo integrativo EPPI in percentuale: entra nella base dell''IVA. Da confermare col commercialista.'),
  ('RITENUTA', '20', 'La ritenuta d''acconto in percentuale. Si userà con le fatture.'),
  ('PREVENTIVO_VALIDITA_GIORNI', '30', 'Per quanti giorni vale un preventivo, se non si scrive la scadenza.'),
  ('PREVENTIVO_CONDIZIONI', '"Il compenso è quello delle voci, a corpo o a ore come scritto. Sono escluse le spese non elencate. I pagamenti seguono le scadenze indicate. Il preventivo vale fino alla data di scadenza."',
    'Le condizioni che ogni preventivo nuovo propone. Si cambiano preventivo per preventivo.');

-- PR/2026/012: riparte ogni anno, per l'anno della data del preventivo. Le revisioni tengono il numero.
INSERT OR IGNORE INTO numerazioni (tipo, formato, annuale) VALUES ('preventivo', 'PR/{AAAA}/{NNN}', 1);

-- ------------------------------------------------------------------ listino
-- Le prestazioni dello studio, da prendere con un tocco. Si parte SENZA prezzi: li scrive Manuel.
CREATE TABLE listino (
  id INTEGER PRIMARY KEY,
  codice TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  modo TEXT NOT NULL DEFAULT 'corpo' CHECK (modo IN ('corpo', 'ore', 'quantita')),
  unita TEXT NOT NULL DEFAULT '',
  prezzo REAL,
  attivo INTEGER NOT NULL DEFAULT 1,
  ordine INTEGER NOT NULL DEFAULT 0
);
INSERT INTO listino (codice, nome, modo, unita, ordine) VALUES
  ('SOP', 'Sopralluogo e rilievo', 'corpo', '', 1),
  ('PRE', 'Progetto preliminare', 'corpo', '', 2),
  ('ESE', 'Progetto esecutivo', 'corpo', '', 3),
  ('DL', 'Direzione lavori', 'corpo', '', 4),
  ('DIRI', 'Dichiarazione di rispondenza (DiRi)', 'corpo', '', 5),
  ('VER', 'Verifiche periodiche', 'corpo', '', 6),
  ('COL', 'Collaudo', 'corpo', '', 7),
  ('CON', 'Ore di consulenza', 'ore', 'ore', 8);

-- ------------------------------------------------------------------ preventivi
-- Un preventivo e le sue revisioni: stesso numero, revisione 0, 1, 2... Solo l'ultima e' viva, le altre SOSTITUITO.
-- "Scaduto" non si salva: e' un INVIATO con la scadenza passata. EPPI e IVA restano quelli del giorno in cui nasce.
-- I modelli (modello = 1) non hanno numero ne' cliente obbligatorio.
CREATE TABLE preventivi (
  id INTEGER PRIMARY KEY,
  numero TEXT NOT NULL DEFAULT '',
  revisione INTEGER NOT NULL DEFAULT 0,
  cliente_id TEXT NOT NULL DEFAULT '',
  sede_id INTEGER REFERENCES sedi(id),
  referente_id INTEGER,
  oggetto TEXT NOT NULL DEFAULT '',
  introduzione TEXT NOT NULL DEFAULT '',
  complessita TEXT NOT NULL DEFAULT '' CHECK (complessita IN ('', 'bassa', 'media', 'alta')),
  complessita_nota TEXT NOT NULL DEFAULT '',
  oneri_previsti TEXT NOT NULL DEFAULT '',
  condizioni TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  scadenza TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'BOZZA' CHECK (stato IN ('BOZZA', 'INVIATO', 'ACCETTATO', 'RIFIUTATO', 'SOSTITUITO')),
  sconto_percentuale REAL NOT NULL DEFAULT 0,
  sconto_euro REAL NOT NULL DEFAULT 0,
  eppi_percentuale REAL NOT NULL DEFAULT 0,
  iva_percentuale REAL NOT NULL DEFAULT 0,
  inviato_il TEXT NOT NULL DEFAULT '',
  accettato_il TEXT NOT NULL DEFAULT '',
  accettato_da TEXT NOT NULL DEFAULT '',
  accettazione_modo TEXT NOT NULL DEFAULT '' CHECK (accettazione_modo IN ('', 'firma', 'email', 'documento', 'voce')),
  firma_file_id TEXT NOT NULL DEFAULT '',
  rifiutato_il TEXT NOT NULL DEFAULT '',
  motivo_rifiuto TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '',
  modello INTEGER NOT NULL DEFAULT 0,
  note_interne TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT,
  modificato TEXT
);
CREATE UNIQUE INDEX preventivi_numero ON preventivi(numero, revisione) WHERE numero <> '';
CREATE INDEX preventivi_cliente ON preventivi(cliente_id);

CREATE TABLE preventivo_sezioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preventivo_id INTEGER NOT NULL REFERENCES preventivi(id),
  titolo TEXT NOT NULL DEFAULT '',
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX preventivo_sezioni_preventivo ON preventivo_sezioni(preventivo_id, ordine);

-- alternativa: le voci con lo stesso testo sono "una di queste"; scelta: la facoltativa voluta, o l'alternativa scelta.
CREATE TABLE preventivo_voci (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preventivo_id INTEGER NOT NULL REFERENCES preventivi(id),
  sezione_id INTEGER NOT NULL REFERENCES preventivo_sezioni(id),
  listino_id INTEGER,
  descrizione TEXT NOT NULL DEFAULT '',
  modo TEXT NOT NULL DEFAULT 'corpo' CHECK (modo IN ('corpo', 'ore', 'quantita')),
  quantita REAL NOT NULL DEFAULT 1,
  unita TEXT NOT NULL DEFAULT '',
  prezzo REAL,
  sconto_percentuale REAL NOT NULL DEFAULT 0,
  facoltativa INTEGER NOT NULL DEFAULT 0,
  alternativa TEXT NOT NULL DEFAULT '',
  scelta INTEGER NOT NULL DEFAULT 0,
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX preventivo_voci_sezione ON preventivo_voci(sezione_id, ordine);
CREATE INDEX preventivo_voci_preventivo ON preventivo_voci(preventivo_id);

-- Acconti e saldo: nascono nel preventivo e passano alla commessa (commessa_id). "importo" e' calcolato dal
-- server (la parte dell'imponibile). La fase 4 aggiungera' fatture e incassi.
CREATE TABLE scadenze_pagamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preventivo_id INTEGER REFERENCES preventivi(id),
  commessa_id TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'percentuale' CHECK (tipo IN ('percentuale', 'importo')),
  valore REAL,
  quando TEXT NOT NULL DEFAULT 'firma' CHECK (quando IN ('firma', 'avanzamento', 'fine', 'data')),
  data TEXT NOT NULL DEFAULT '',
  importo REAL,
  stato TEXT NOT NULL DEFAULT 'prevista',
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX scadenze_preventivo ON scadenze_pagamento(preventivo_id, ordine);
CREATE INDEX scadenze_commessa ON scadenze_pagamento(commessa_id);

-- ------------------------------------------------------------------ attivita' e calendario
-- Una serie che si ripete: la regola, da quando, fino a quando, e il modello delle occorrenze (JSON).
-- Le occorrenze sono attivita' vere (ricorrenza_id + occorrenza), create per i prossimi 90 giorni e
-- allungate ogni notte. Un'occorrenza annullata resta: e' cosi' che si "salta" senza rompere la serie.
CREATE TABLE ricorrenze (
  id INTEGER PRIMARY KEY,
  regola TEXT NOT NULL CHECK (regola IN ('giorni', 'settimane', 'mesi', 'anni')),
  ogni INTEGER NOT NULL DEFAULT 1 CHECK (ogni >= 1),
  giorni_settimana TEXT NOT NULL DEFAULT '',
  inizio TEXT NOT NULL,
  fine TEXT NOT NULL DEFAULT '',
  modello TEXT NOT NULL DEFAULT '{}',
  creata_da INTEGER,
  creato TEXT,
  modificato TEXT
);

-- Quando: "scadenza" (un giorno) oppure "inizio" e "fine" (istanti, per appuntamenti e sopralluoghi).
-- assegnata_a vuoto = non assegnata. Cliente, commessa e prestazione senza vincoli, come nei rapportini.
CREATE TABLE attivita (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titolo TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'attivita' CHECK (tipo IN ('attivita', 'appuntamento', 'sopralluogo')),
  cliente_id TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '',
  prestazione_id INTEGER,
  assegnata_a INTEGER REFERENCES utenti(id),
  creata_da INTEGER REFERENCES utenti(id),
  priorita TEXT NOT NULL DEFAULT 'normale' CHECK (priorita IN ('alta', 'normale', 'bassa')),
  stato TEXT NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare', 'in_corso', 'fatta', 'annullata')),
  scadenza TEXT NOT NULL DEFAULT '',
  inizio TEXT NOT NULL DEFAULT '',
  fine TEXT NOT NULL DEFAULT '',
  tutto_il_giorno INTEGER NOT NULL DEFAULT 0,
  luogo TEXT NOT NULL DEFAULT '',
  promemoria_minuti INTEGER,
  ricorrenza_id INTEGER REFERENCES ricorrenze(id),
  occorrenza TEXT NOT NULL DEFAULT '',
  fatta_il TEXT NOT NULL DEFAULT '',
  creato TEXT,
  modificato TEXT
);
CREATE INDEX attivita_assegnata ON attivita(assegnata_a);
CREATE INDEX attivita_scadenza ON attivita(scadenza);
CREATE INDEX attivita_inizio ON attivita(inizio);
CREATE INDEX attivita_commessa ON attivita(commessa_id);
CREATE INDEX attivita_ricorrenza ON attivita(ricorrenza_id, occorrenza);

CREATE TABLE attivita_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attivita_id INTEGER NOT NULL REFERENCES attivita(id) ON DELETE CASCADE,
  testo TEXT NOT NULL DEFAULT '',
  fatta INTEGER NOT NULL DEFAULT 0,
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX attivita_checklist_attivita ON attivita_checklist(attivita_id, ordine);

-- ------------------------------------------------------------------ file: due tipi nuovi
-- "attivita" (un allegato di un'attivita') e "preventivo" (la firma o il documento d'accettazione).
-- SQLite non cambia un CHECK: la tabella si rifa' uguale, con le due colonne nuove, e si ricopia.
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo')),
  rapportino_id TEXT REFERENCES rapportini(id),
  commessa_id TEXT,
  id_client TEXT,
  drive_url TEXT,
  creato TEXT NOT NULL,
  cestinato TEXT,
  attivita_id INTEGER,
  preventivo_id INTEGER
);
INSERT INTO file_nuova (id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato)
  SELECT id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato FROM file;
DROP TABLE file;
ALTER TABLE file_nuova RENAME TO file;
CREATE INDEX file_rapportino ON file(rapportino_id, tipo);
CREATE INDEX file_commessa ON file(commessa_id);
CREATE INDEX file_attivita ON file(attivita_id);
CREATE INDEX file_preventivo ON file(preventivo_id);
