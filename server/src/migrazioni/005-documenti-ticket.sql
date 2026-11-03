-- Fase 5 del gestionale (ottobre 2026): documenti, ticket e assistenza.
-- L'accordo e' in docs/gestionale/fase5.md §4; le risposte in architettura.md §16.
-- Come nelle altre: importi in euro come numeri decimali arrotondati al centesimo, date "aaaa-mm-gg", istanti ISO col fuso.
-- Le tabelle da cui si tolgono righe hanno AUTOINCREMENT: un id tolto non torna mai a un'altra riga.
-- Dopo questo file gira 005-documenti-ticket.js: categorie e testi dei modelli, i documenti delle commesse che entrano
-- nell'archivio con gli stessi id dei file, la cartella di ogni commessa come collegamento, i file gia' copiati fuori casa.
--
-- Niente di quello che c'e' si cancella o si riscrive: le tabelle rifatte (attivita, attivita_checklist, file,
-- fattura_sorgenti) si ricopiano riga per riga con tutte le colonne di prima, e i contatori AUTOINCREMENT restano quelli.

-- ------------------------------------------------------------------ impostazioni nuove (valore in JSON)
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('FILE_MAX_MB', '50', 'La grandezza massima di un file caricato, in MB.'),
  ('SPAZIO_AVVISO_MB', '10240', 'Sotto questo spazio libero sul disco del NAS (in MB) la Dashboard avvisa.'),
  ('SPAZIO_MINIMO_MB', '2048', 'Sotto questo spazio libero (in MB) niente documenti nuovi: foto e firme dei rapportini passano fino a 200 MB.'),
  ('COPIA_FUORI_MAX_MB', '25', 'I file piu'' grandi (in MB) non vanno nella copia fuori casa: restano solo sul NAS.'),
  ('EMAIL_ALLEGATI_MAX_MB', '15', 'La grandezza massima di un allegato di "Manda per email", in MB.'),
  ('COPIA_INVIATI', 'true', 'Tieni nell''archivio una copia dei PDF mandati per email (categoria Mandati ai clienti).'),
  ('CONDIVISIONE_INDIRIZZO', '""', 'L''indirizzo pubblico dei link per i clienti. Vuoto = non collegato.'),
  ('CONDIVISIONE_GIORNI', '14', 'Per quanti giorni vale un link per i clienti, se non si sceglie.'),
  ('PREAVVISO_GIORNI', '60', 'Il preavviso proposto delle scadenze, in giorni.'),
  ('ANTICIPO_TICKET_GIORNI', '30', 'Quanti giorni prima della scadenza nasce il ticket di una visita programmata.'),
  ('TICKET_TEMPI', '{"urgente":{"presa":1,"intervento":4},"alta":{"presa":2,"intervento":24},"normale":{"presa":8,"intervento":72},"bassa":{"presa":24,"intervento":240}}',
    'Ore di calendario dall''apertura per prendere un ticket e per intervenire, per priorita''. Da confermare con Manuel.');

-- TK/2026/0014 e CA/2026/002: ripartono ogni anno, il numero e' "il piu' alto gia' usato + 1".
INSERT OR IGNORE INTO numerazioni (tipo, formato, annuale) VALUES ('ticket', 'TK/{AAAA}/{NNNN}', 1), ('contratto', 'CA/{AAAA}/{NNN}', 1);

-- ------------------------------------------------------------------ colonne nuove su tabelle che ci sono
-- Le sedi e gli impianti del cliente (fase 1): i dati dell'impianto, tutti facoltativi.
ALTER TABLE sedi ADD COLUMN categoria TEXT NOT NULL DEFAULT '';
ALTER TABLE sedi ADD COLUMN sede_padre_id INTEGER;
ALTER TABLE sedi ADD COLUMN matricola TEXT NOT NULL DEFAULT '';
ALTER TABLE sedi ADD COLUMN potenza TEXT NOT NULL DEFAULT '';
ALTER TABLE sedi ADD COLUMN tensione TEXT NOT NULL DEFAULT '';
ALTER TABLE sedi ADD COLUMN messa_in_servizio TEXT NOT NULL DEFAULT '';
ALTER TABLE sedi ADD COLUMN ambiente TEXT NOT NULL DEFAULT '';
ALTER TABLE sedi ADD COLUMN referente_id INTEGER;
ALTER TABLE sedi ADD COLUMN dati_tecnici TEXT NOT NULL DEFAULT '';

-- Il ticket di cui e' il rapportino (la colonna "ticket", testo, resta com'e': e' quella del PDF).
ALTER TABLE rapportini ADD COLUMN ticket_id INTEGER;
CREATE INDEX rapportini_ticket ON rapportini(ticket_id);
ALTER TABLE ore ADD COLUMN ticket_id INTEGER;
CREATE INDEX ore_ticket ON ore(ticket_id);
ALTER TABLE spese ADD COLUMN ticket_id INTEGER;
CREATE INDEX spese_ticket ON spese(ticket_id);
-- Le rate del canone di un contratto d'assistenza.
ALTER TABLE scadenze_pagamento ADD COLUMN contratto_id INTEGER;
-- La commessa di un contratto d'assistenza (pillola "Assistenza").
ALTER TABLE commesse ADD COLUMN contratto_id INTEGER;

-- ------------------------------------------------------------------ attivita': il tipo "intervento" e il ticket
-- SQLite non cambia un CHECK: la tabella si rifa'. attivita_checklist la cita con ON DELETE CASCADE, e con le chiavi
-- esterne accese DROP TABLE attivita toglierebbe anche le voci delle checklist: per questo prima si mette da parte la
-- checklist, poi si rifanno tutte e due, e si ricopia tutto. I contatori AUTOINCREMENT li rimette la .js.
CREATE TEMP TABLE contatori_prima AS SELECT name, seq FROM sqlite_sequence WHERE name IN ('attivita', 'attivita_checklist', 'fattura_sorgenti');
CREATE TEMP TABLE checklist_prima AS SELECT * FROM attivita_checklist;
DROP TABLE attivita_checklist;

CREATE TABLE attivita_nuova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titolo TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'attivita' CHECK (tipo IN ('attivita', 'appuntamento', 'sopralluogo', 'intervento')),
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
  modificato TEXT,
  ticket_id INTEGER
);
INSERT INTO attivita_nuova (id, titolo, descrizione, tipo, cliente_id, commessa_id, prestazione_id, assegnata_a, creata_da, priorita, stato,
    scadenza, inizio, fine, tutto_il_giorno, luogo, promemoria_minuti, ricorrenza_id, occorrenza, fatta_il, creato, modificato)
  SELECT id, titolo, descrizione, tipo, cliente_id, commessa_id, prestazione_id, assegnata_a, creata_da, priorita, stato,
    scadenza, inizio, fine, tutto_il_giorno, luogo, promemoria_minuti, ricorrenza_id, occorrenza, fatta_il, creato, modificato FROM attivita;
DROP TABLE attivita;
ALTER TABLE attivita_nuova RENAME TO attivita;
CREATE INDEX attivita_assegnata ON attivita(assegnata_a);
CREATE INDEX attivita_scadenza ON attivita(scadenza);
CREATE INDEX attivita_inizio ON attivita(inizio);
CREATE INDEX attivita_commessa ON attivita(commessa_id);
CREATE INDEX attivita_ricorrenza ON attivita(ricorrenza_id, occorrenza);
CREATE INDEX attivita_ticket ON attivita(ticket_id);

CREATE TABLE attivita_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attivita_id INTEGER NOT NULL REFERENCES attivita(id) ON DELETE CASCADE,
  testo TEXT NOT NULL DEFAULT '',
  fatta INTEGER NOT NULL DEFAULT 0,
  ordine INTEGER NOT NULL DEFAULT 0
);
INSERT INTO attivita_checklist (id, attivita_id, testo, fatta, ordine) SELECT id, attivita_id, testo, fatta, ordine FROM checklist_prima;
CREATE INDEX attivita_checklist_attivita ON attivita_checklist(attivita_id, ordine);
DROP TABLE checklist_prima;

-- ------------------------------------------------------------------ file: tre tipi nuovi e le colonne della fase 5
-- "ticket" (foto e allegati di un ticket), "caricato" (arrivato con /carica, non ancora legato: dopo 24 ore senza
-- legame va nel cestino), "inviato" (la copia di un PDF mandato per email). documento_id e versione_id: la revisione di
-- un documento che usa questo file; fuori_il / fuori_no: la copia fuori casa (quando e' arrivata, o perche' no).
-- In piu' dell'accordo: caricato_da (chi l'ha caricato con /carica: solo lui lo lega) e svuotato (tolto per sempre dal
-- disco col cestino svuotato: la riga resta per il registro e per chi la cita).
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo', 'fattura', 'ricevuta',
    'ticket', 'caricato', 'inviato')),
  rapportino_id TEXT REFERENCES rapportini(id),
  commessa_id TEXT,
  id_client TEXT,
  drive_url TEXT,
  creato TEXT NOT NULL,
  cestinato TEXT,
  attivita_id INTEGER,
  preventivo_id INTEGER,
  spesa_id INTEGER,
  fattura_id INTEGER,
  ricevuta_id INTEGER,
  documento_id INTEGER,
  versione_id INTEGER,
  ticket_id INTEGER,
  fuori_il TEXT NOT NULL DEFAULT '',
  fuori_no TEXT NOT NULL DEFAULT '',
  caricato_da INTEGER,
  svuotato TEXT
);
INSERT INTO file_nuova (id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id)
  SELECT id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id FROM file;
DROP TABLE file;
ALTER TABLE file_nuova RENAME TO file;
CREATE INDEX file_rapportino ON file(rapportino_id, tipo);
CREATE INDEX file_commessa ON file(commessa_id);
CREATE INDEX file_attivita ON file(attivita_id);
CREATE INDEX file_preventivo ON file(preventivo_id);
CREATE INDEX file_spesa ON file(spesa_id);
CREATE INDEX file_fattura ON file(fattura_id);
CREATE INDEX file_ricevuta ON file(ricevuta_id);
CREATE INDEX file_documento ON file(documento_id);
CREATE INDEX file_ticket ON file(ticket_id);
CREATE INDEX file_fuori ON file(fuori_il, fuori_no);
CREATE INDEX file_sha ON file(sha256);

-- ------------------------------------------------------------------ fattura_sorgenti: la sorgente "ticket"
-- Lo stesso indice unico di prima (una sorgente in una sola fattura viva): solo il CHECK accetta anche "ticket".
CREATE TABLE fattura_sorgenti_nuova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fattura_id INTEGER NOT NULL REFERENCES fatture(id),
  gruppo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('scadenza', 'rapportino', 'spesa', 'ore', 'ticket')),
  sorgente_id TEXT NOT NULL,
  importo REAL,
  attiva INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1)),
  creato TEXT,
  liberata_il TEXT NOT NULL DEFAULT '',
  liberata_perche TEXT NOT NULL DEFAULT ''
);
INSERT INTO fattura_sorgenti_nuova (id, fattura_id, gruppo, tipo, sorgente_id, importo, attiva, creato, liberata_il, liberata_perche)
  SELECT id, fattura_id, gruppo, tipo, sorgente_id, importo, attiva, creato, liberata_il, liberata_perche FROM fattura_sorgenti;
DROP TABLE fattura_sorgenti;
ALTER TABLE fattura_sorgenti_nuova RENAME TO fattura_sorgenti;
CREATE UNIQUE INDEX fattura_sorgenti_una ON fattura_sorgenti(tipo, sorgente_id) WHERE attiva = 1;
CREATE INDEX fattura_sorgenti_fattura ON fattura_sorgenti(fattura_id, gruppo);

-- ------------------------------------------------------------------ documenti
-- Le categorie: approvazione (le revisioni di chi non approva vanno "da approvare"), chi vede (di base, per i documenti
-- nuovi), la scadenza proposta. sistema = nata dalla migrazione: si rinomina, non si toglie.
CREATE TABLE documento_categorie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  approvazione INTEGER NOT NULL DEFAULT 0 CHECK (approvazione IN (0, 1)),
  vede TEXT NOT NULL DEFAULT 'tutti' CHECK (vede IN ('tutti', 'costi', 'riservati')),
  scadenza_mesi INTEGER,
  ordine INTEGER NOT NULL DEFAULT 0,
  attiva INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1)),
  sistema INTEGER NOT NULL DEFAULT 0 CHECK (sistema IN (0, 1))
);

-- Un documento: un file caricato sul NAS (con le revisioni), un collegamento (solo l'indirizzo: OneDrive, SharePoint,
-- Google Drive, un sito, un percorso del computer dello studio) o la copia di un PDF mandato per email.
CREATE TABLE documenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  titolo TEXT NOT NULL DEFAULT '',
  categoria_id INTEGER NOT NULL REFERENCES documento_categorie(id),
  descrizione TEXT NOT NULL DEFAULT '',
  parole TEXT NOT NULL DEFAULT '',
  riferimento TEXT NOT NULL DEFAULT '',
  data_documento TEXT NOT NULL DEFAULT '',
  cliente_id TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  sede_id INTEGER,
  ticket_id INTEGER,
  contratto_id INTEGER,
  origine TEXT NOT NULL CHECK (origine IN ('file', 'collegamento', 'inviato')),
  url TEXT NOT NULL DEFAULT '',
  collegamento_tipo TEXT NOT NULL DEFAULT '' CHECK (collegamento_tipo IN ('', 'onedrive', 'sharepoint', 'gdrive', 'percorso', 'web')),
  cartella INTEGER NOT NULL DEFAULT 0 CHECK (cartella IN (0, 1)),
  principale INTEGER NOT NULL DEFAULT 0 CHECK (principale IN (0, 1)),
  versione_valida_id INTEGER,
  vede TEXT NOT NULL DEFAULT 'tutti' CHECK (vede IN ('tutti', 'costi', 'riservati')),
  scadenza_id INTEGER,
  archiviato TEXT,
  creato_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX documenti_cliente ON documenti(cliente_id);
CREATE INDEX documenti_commessa ON documenti(commessa_id);
CREATE INDEX documenti_sede ON documenti(sede_id);
CREATE INDEX documenti_ticket ON documenti(ticket_id);
CREATE INDEX documenti_categoria ON documenti(categoria_id);
-- Una sola cartella principale per commessa e una per cliente (quella di un cliente non ha la commessa).
CREATE UNIQUE INDEX documenti_cartella_commessa ON documenti(commessa_id) WHERE principale = 1 AND commessa_id <> '' AND archiviato IS NULL;
CREATE UNIQUE INDEX documenti_cartella_cliente ON documenti(cliente_id) WHERE principale = 1 AND commessa_id = '' AND cliente_id <> '' AND archiviato IS NULL;

-- Le revisioni (solo dei file e delle copie mandate): non si cambiano mai, si aggiungono. "tolta" = una da approvare
-- o respinta tolta da chi l'ha caricata.
CREATE TABLE documento_versioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documenti(id),
  numero INTEGER NOT NULL DEFAULT 0,
  file_id TEXT NOT NULL,
  nome_file TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  nota TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'approvata' CHECK (stato IN ('da_approvare', 'approvata', 'respinta')),
  caricata_da INTEGER,
  caricata_il TEXT,
  decisa_da INTEGER,
  decisa_il TEXT NOT NULL DEFAULT '',
  motivo_rifiuto TEXT NOT NULL DEFAULT '',
  tolta TEXT
);
CREATE INDEX documento_versioni_documento ON documento_versioni(documento_id, numero);
CREATE INDEX documento_versioni_sha ON documento_versioni(sha256);

-- I link per il cliente (progettati, non collegati finche' CONDIVISIONE_INDIRIZZO e' vuoto). Il token non si salva:
-- solo il suo SHA-256.
CREATE TABLE documento_condivisioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  documento_id INTEGER NOT NULL REFERENCES documenti(id),
  versione_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  per_chi TEXT NOT NULL DEFAULT '',
  scade TEXT NOT NULL,
  revocata_il TEXT,
  aperture INTEGER NOT NULL DEFAULT 0,
  ultima_apertura TEXT,
  creata_da INTEGER,
  creata TEXT
);

-- ------------------------------------------------------------------ scadenze
-- Verifiche degli impianti, documenti che scadono, visite dei contratti, polizze, disdette: una tabella sola. Il
-- calendario le mostra senza copiarle. dalla_fatta: la prossima si conta dal giorno in cui si fa (1) o dalla data
-- prevista (0). azione "ticket": anticipo_giorni prima della data nasce un ticket programmato, una volta sola.
CREATE TABLE scadenze (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titolo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'altro' CHECK (tipo IN ('verifica_terra', 'verifica_scariche', 'verifica_protezioni', 'manutenzione',
    'documento', 'polizza', 'contratto', 'altro')),
  cliente_id TEXT NOT NULL DEFAULT '',
  sede_id INTEGER,
  documento_id INTEGER,
  contratto_id INTEGER,
  data TEXT NOT NULL,
  preavviso_giorni INTEGER NOT NULL DEFAULT 60,
  ogni_mesi INTEGER,
  dalla_fatta INTEGER NOT NULL DEFAULT 1 CHECK (dalla_fatta IN (0, 1)),
  azione TEXT NOT NULL DEFAULT 'promemoria' CHECK (azione IN ('promemoria', 'ticket')),
  anticipo_giorni INTEGER,
  assegnata_a INTEGER,
  stato TEXT NOT NULL DEFAULT 'aperta' CHECK (stato IN ('aperta', 'fatta', 'annullata')),
  fatta_il TEXT NOT NULL DEFAULT '',
  ticket_id INTEGER,
  documento_fatto_id INTEGER,
  prossima_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  creata_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX scadenze_data ON scadenze(stato, data);
CREATE INDEX scadenze_sede ON scadenze(sede_id);
CREATE INDEX scadenze_contratto ON scadenze(contratto_id);

-- ------------------------------------------------------------------ contratti d'assistenza
CREATE TABLE contratti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  cliente_id TEXT NOT NULL,
  titolo TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  preventivo_id INTEGER,
  dal TEXT NOT NULL,
  al TEXT NOT NULL,
  rinnovo TEXT NOT NULL DEFAULT 'tacito' CHECK (rinnovo IN ('tacito', 'no')),
  disdetta_giorni INTEGER NOT NULL DEFAULT 60,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'attivo', 'disdetto', 'chiuso')),
  canone REAL,
  fatturazione_canone TEXT NOT NULL DEFAULT 'annuale' CHECK (fatturazione_canone IN ('annuale', 'semestrale', 'trimestrale', 'mensile', 'nessuna')),
  copre TEXT NOT NULL DEFAULT 'visite' CHECK (copre IN ('visite', 'visite_guasti')),
  materiali_inclusi INTEGER NOT NULL DEFAULT 0 CHECK (materiali_inclusi IN (0, 1)),
  tariffa_extra REAL,
  tempi TEXT,
  documento_id INTEGER,
  disdetto_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  creato_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX contratti_cliente ON contratti(cliente_id);

CREATE TABLE contratto_impianti (
  contratto_id INTEGER NOT NULL REFERENCES contratti(id),
  sede_id INTEGER NOT NULL,
  ogni_mesi INTEGER,
  prima_visita TEXT NOT NULL DEFAULT '',
  scadenza_id INTEGER,
  PRIMARY KEY (contratto_id, sede_id)
);

-- ------------------------------------------------------------------ ticket
CREATE TABLE ticket (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  id_locale TEXT UNIQUE,
  cliente_id TEXT NOT NULL,
  sede_id INTEGER,
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  contratto_id INTEGER,
  titolo TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'guasto' CHECK (tipo IN ('guasto', 'verifica', 'piccolo', 'assistenza', 'programmato')),
  origine TEXT NOT NULL DEFAULT 'telefono' CHECK (origine IN ('telefono', 'email', 'sopralluogo', 'ufficio', 'scadenza', 'whatsapp', 'portale')),
  richiedente TEXT NOT NULL DEFAULT '',
  referente_id INTEGER,
  rif_cliente TEXT NOT NULL DEFAULT '',
  impatto TEXT NOT NULL DEFAULT '' CHECK (impatto IN ('', 'fermo', 'ridotto', 'nessuno')),
  urgenza TEXT NOT NULL DEFAULT '' CHECK (urgenza IN ('', 'subito', 'presto', 'quando_si_puo')),
  priorita TEXT NOT NULL DEFAULT 'normale' CHECK (priorita IN ('urgente', 'alta', 'normale', 'bassa')),
  priorita_a_mano INTEGER NOT NULL DEFAULT 0 CHECK (priorita_a_mano IN (0, 1)),
  responsabile_id INTEGER,
  stato TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'in_carico', 'in_attesa', 'risolto', 'chiuso', 'annullato')),
  aperto_il TEXT NOT NULL,
  previsto_il TEXT NOT NULL DEFAULT '',
  entro_presa TEXT NOT NULL DEFAULT '',
  entro_intervento TEXT NOT NULL DEFAULT '',
  preso_il TEXT NOT NULL DEFAULT '',
  intervento_il TEXT NOT NULL DEFAULT '',
  risolto_il TEXT NOT NULL DEFAULT '',
  chiuso_il TEXT NOT NULL DEFAULT '',
  annullato_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  esito TEXT NOT NULL DEFAULT '',
  fatturazione TEXT NOT NULL DEFAULT '' CHECK (fatturazione IN ('', 'ticket', 'separati', 'contratto', 'no')),
  prezzo_corpo REAL,
  motivo_no TEXT NOT NULL DEFAULT '',
  fatturato_il TEXT NOT NULL DEFAULT '',
  scadenza_id INTEGER,
  creato_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX ticket_cliente ON ticket(cliente_id);
CREATE INDEX ticket_sede ON ticket(sede_id);
CREATE INDEX ticket_stato ON ticket(stato);
CREATE INDEX ticket_contratto ON ticket(contratto_id);

-- La cronologia del ticket, con frasi pronte. Non si cambia e non si cancella (come il registro).
CREATE TABLE ticket_eventi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES ticket(id),
  quando TEXT NOT NULL,
  utente_id INTEGER,
  testo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ticket_eventi_ticket ON ticket_eventi(ticket_id, id);
CREATE TRIGGER ticket_eventi_non_si_modifica BEFORE UPDATE ON ticket_eventi
  BEGIN SELECT RAISE(ABORT, 'La cronologia dei ticket non si modifica'); END;
CREATE TRIGGER ticket_eventi_non_si_cancella BEFORE DELETE ON ticket_eventi
  BEGIN SELECT RAISE(ABORT, 'La cronologia dei ticket non si cancella'); END;

-- ------------------------------------------------------------------ i testi dei modelli
CREATE TABLE modelli_testi (
  chiave TEXT PRIMARY KEY,
  testo TEXT NOT NULL DEFAULT '',
  modificato TEXT,
  modificato_da INTEGER
);
