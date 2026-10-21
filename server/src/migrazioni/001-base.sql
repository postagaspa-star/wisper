-- Fase 1 del gestionale (ottobre 2026): le tabelle di docs/gestionale/architettura.md §5.
-- Importi in euro come numeri decimali (arrotondati al centesimo come centesimi() di Code.gs),
-- date "aaaa-mm-gg", istanti ISO col fuso ("2026-10-21T21:30:00+02:00").

-- Chi entra. La password e' solo lo scrypt col suo sale: mai in chiaro, mai nel registro.
CREATE TABLE utenti (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ruolo TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  attivo INTEGER NOT NULL DEFAULT 1,
  creato TEXT NOT NULL,
  ultimo_accesso TEXT
);

-- Un dispositivo collegato. Del token si tiene solo lo SHA-256: chi legge il database non entra.
CREATE TABLE sessioni (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  utente_id INTEGER NOT NULL REFERENCES utenti(id),
  disp TEXT NOT NULL DEFAULT '',
  disp_nome TEXT NOT NULL DEFAULT '',
  app TEXT NOT NULL DEFAULT '',
  creata TEXT NOT NULL,
  ultimo_uso TEXT NOT NULL,
  revocata TEXT
);
CREATE INDEX sessioni_utente ON sessioni(utente_id);

-- Livelli: 0 niente, 1 lettura, 2 scrittura. Il titolare ha sempre tutto (lo decide il codice).
CREATE TABLE permessi (
  ruolo TEXT NOT NULL,
  modulo TEXT NOT NULL,
  livello INTEGER NOT NULL CHECK (livello IN (0, 1, 2)),
  PRIMARY KEY (ruolo, modulo)
);

CREATE TABLE tentativi_accesso (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  quando TEXT NOT NULL
);
CREATE INDEX tentativi_email ON tentativi_accesso(email, quando);

-- Ogni richiesta, come la scheda Accessi del foglio.
CREATE TABLE accessi (
  id INTEGER PRIMARY KEY,
  quando TEXT NOT NULL,
  esito TEXT NOT NULL,
  azione TEXT NOT NULL DEFAULT '',
  utente_id INTEGER,
  disp TEXT NOT NULL DEFAULT '',
  disp_nome TEXT NOT NULL DEFAULT '',
  app TEXT NOT NULL DEFAULT ''
);
CREATE INDEX accessi_quando ON accessi(quando);

-- Ogni modifica ai dati: prima e dopo, solo i campi cambiati. Non si tocca piu'.
CREATE TABLE registro (
  id INTEGER PRIMARY KEY,
  quando TEXT NOT NULL,
  utente_id INTEGER,
  utente TEXT NOT NULL DEFAULT '',
  disp TEXT NOT NULL DEFAULT '',
  azione TEXT NOT NULL DEFAULT '',
  tabella TEXT NOT NULL,
  id_riga TEXT NOT NULL DEFAULT '',
  prima TEXT,
  dopo TEXT,
  nota TEXT NOT NULL DEFAULT ''
);
CREATE INDEX registro_quando ON registro(quando);
CREATE INDEX registro_riga ON registro(tabella, id_riga);
CREATE TRIGGER registro_non_si_modifica BEFORE UPDATE ON registro
BEGIN SELECT RAISE(ABORT, 'Il registro non si modifica'); END;
CREATE TRIGGER registro_non_si_cancella BEFORE DELETE ON registro
BEGIN SELECT RAISE(ABORT, 'Il registro non si cancella'); END;

CREATE TABLE dispositivi (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  app TEXT NOT NULL DEFAULT '',
  primo TEXT,
  ultimo TEXT,
  utente_id INTEGER,
  note TEXT NOT NULL DEFAULT ''
);

-- Le stesse chiavi della scheda Impostazioni. Il valore e' in JSON: un numero resta numero
-- (EURO_KM 0.76), un testo resta testo (PARTITA_IVA "01234567890", con lo zero).
CREATE TABLE impostazioni (
  chiave TEXT PRIMARY KEY,
  valore TEXT NOT NULL DEFAULT '""',
  descrizione TEXT NOT NULL DEFAULT ''
);

-- commessa {AA}ST{NNN} (il numero continua tra gli anni), rapportino RAP/{AAAA}/{NNNN} (riparte ogni anno).
-- formati_precedenti: i formati usati prima, perche' "il piu' alto gia' usato" conti anche i codici vecchi.
CREATE TABLE numerazioni (
  tipo TEXT PRIMARY KEY,
  formato TEXT NOT NULL,
  ultimo INTEGER NOT NULL DEFAULT 0,
  annuale INTEGER NOT NULL DEFAULT 0,
  formati_precedenti TEXT NOT NULL DEFAULT '[]'
);

-- Solo per i fogli di prima della 0.3.5: un cliente vecchio col gruppo e senza tariffa sua.
CREATE TABLE gruppi (
  nome TEXT PRIMARY KEY,
  tariffa_fissa REAL,
  paga_viaggio INTEGER,
  km_rimborsati INTEGER,
  magg_extra REAL,
  email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

-- Clienti e fornitori in un'anagrafica sola. Partita IVA, codice fiscale e telefono sempre testo.
CREATE TABLE soggetti (
  id TEXT PRIMARY KEY,
  cliente INTEGER NOT NULL DEFAULT 1,
  fornitore INTEGER NOT NULL DEFAULT 0,
  nome TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  gruppo TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  pec TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  partita_iva TEXT NOT NULL DEFAULT '',
  codice_fiscale TEXT NOT NULL DEFAULT '',
  codice_sdi TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  cap TEXT NOT NULL DEFAULT '',
  citta TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  nazione TEXT NOT NULL DEFAULT 'IT',
  tariffa_fissa REAL,
  costo_fisso REAL,
  ultima_tariffa REAL,
  paga_viaggio INTEGER,
  km_rimborsati INTEGER,
  magg_extra REAL,
  accorpato_in TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  archiviato INTEGER NOT NULL DEFAULT 0,
  creato TEXT,
  modificato TEXT
);

CREATE TABLE referenti (
  id INTEGER PRIMARY KEY,
  soggetto_id TEXT NOT NULL REFERENCES soggetti(id),
  nome TEXT NOT NULL DEFAULT '',
  ruolo TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX referenti_soggetto ON referenti(soggetto_id);

CREATE TABLE sedi (
  id INTEGER PRIMARY KEY,
  soggetto_id TEXT NOT NULL REFERENCES soggetti(id),
  tipo TEXT NOT NULL DEFAULT 'sede' CHECK (tipo IN ('sede', 'impianto')),
  nome TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  cap TEXT NOT NULL DEFAULT '',
  citta TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  archiviata INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sedi_soggetto ON sedi(soggetto_id);

-- Il codice della commessa (26ST001) e' la chiave; maiuscole e minuscole sono lo stesso codice.
CREATE TABLE commesse (
  id TEXT PRIMARY KEY COLLATE NOCASE,
  cliente_id TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'APERTA',
  indirizzo TEXT NOT NULL DEFAULT '',
  budget_ore REAL,
  budget_euro REAL,
  prezzo_orario REAL,
  costo_orario REAL,
  euro_km REAL,
  inizio TEXT NOT NULL DEFAULT '',
  fine_prevista TEXT NOT NULL DEFAULT '',
  cartella TEXT NOT NULL DEFAULT '',
  codice_precedente TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  sede_id INTEGER REFERENCES sedi(id),
  responsabile_id INTEGER REFERENCES utenti(id),
  importo_contratto REAL,
  archiviata INTEGER NOT NULL DEFAULT 0,
  modello INTEGER NOT NULL DEFAULT 0,
  creato TEXT,
  modificato TEXT
);

CREATE TABLE commessa_persone (
  commessa_id TEXT NOT NULL REFERENCES commesse(id),
  utente_id INTEGER NOT NULL REFERENCES utenti(id),
  PRIMARY KEY (commessa_id, utente_id)
);

CREATE TABLE prestazioni (
  id INTEGER PRIMARY KEY,
  commessa_id TEXT NOT NULL REFERENCES commesse(id),
  nome TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  valore REAL,
  avanzamento INTEGER NOT NULL DEFAULT 0 CHECK (avanzamento BETWEEN 0 AND 100),
  stato TEXT NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare', 'in_corso', 'fatta')),
  ordine INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX prestazioni_commessa ON prestazioni(commessa_id, ordine);

-- Le colonne della scheda Rapportini una per una (SCHEMA.Rapportini di Code.gs).
-- Le foto sono i file "spesa" del rapportino (tabella file); "firma" e' l'id del file della firma.
-- Cliente e commessa senza vincoli: un foglio vecchio puo' avere righe che citano un codice sparito.
CREATE TABLE rapportini (
  id TEXT PRIMARY KEY,
  id_locale TEXT UNIQUE,
  data TEXT,
  tecnico TEXT NOT NULL DEFAULT '',
  id_cliente TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  gruppo TEXT NOT NULL DEFAULT '',
  id_commessa TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  commessa TEXT NOT NULL DEFAULT '',
  ticket TEXT NOT NULL DEFAULT '',
  luogo TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  ore_lavoro REAL,
  ore_extra REAL,
  ore_viaggio REAL,
  ore_totali REAL,
  km REAL,
  spese REAL,
  note_spese TEXT NOT NULL DEFAULT '',
  tariffa REAL,
  paga_viaggio INTEGER,
  km_rimborsati INTEGER,
  euro_km REAL,
  magg_extra REAL,
  compenso_ore REAL,
  rimborso_km REAL,
  totale REAL,
  costo_orario REAL,
  note_interne TEXT NOT NULL DEFAULT '',
  firma TEXT NOT NULL DEFAULT '',
  firmatario TEXT NOT NULL DEFAULT '',
  firmato_il TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'BOZZA',
  inviato_il TEXT NOT NULL DEFAULT '',
  fatturato_il TEXT NOT NULL DEFAULT '',
  creato TEXT NOT NULL DEFAULT '',
  modificato TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  stato_prima TEXT NOT NULL DEFAULT ''
);
CREATE INDEX rapportini_data ON rapportini(data);
CREATE INDEX rapportini_utente ON rapportini(utente_id);
CREATE INDEX rapportini_commessa ON rapportini(id_commessa);

-- Foto, firme, documenti: i byte stanno su disco in /data/file/<id>, qui solo chi sono.
CREATE TABLE file (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento')),
  rapportino_id TEXT REFERENCES rapportini(id),
  commessa_id TEXT,
  id_client TEXT,
  drive_url TEXT,
  creato TEXT NOT NULL,
  cestinato TEXT
);
CREATE INDEX file_rapportino ON file(rapportino_id, tipo);
CREATE INDEX file_commessa ON file(commessa_id);

-- Le copie di sicurezza: quella sul NAS e quella fuori casa (dal postino).
CREATE TABLE copie (
  id INTEGER PRIMARY KEY,
  quando TEXT NOT NULL,
  file TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  locale TEXT NOT NULL DEFAULT '',
  fuori TEXT NOT NULL DEFAULT '',
  foglio TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT ''
);
