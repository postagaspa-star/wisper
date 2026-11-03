-- Fase 8 del gestionale (novembre 2026): integrazioni, amministrazione completa e controlli finali.
-- L'accordo e' in docs/gestionale/fase8.md §12, letto con la §0 (scelta Google del 31/10: niente tailnet, la colonna di
-- §12.3 sessioni.tailnet si chiama sessioni.da_fuori).
-- Come nelle altre: date "aaaa-mm-gg", istanti ISO col fuso. Le tabelle da cui si tolgono righe hanno AUTOINCREMENT.
-- Dopo questo file gira 008-integrazioni-controlli.js: la tabella della ricerca (FTS5, solo se il SQLite del server la
-- sa fare), le righe di "integrazioni" e della lista di controllo (col registro), i file dei documenti "da leggere".
--
-- Niente di quello che c'e' si cancella o si riscrive: la tabella "file" (per il tipo "logo") si ricopia riga per riga
-- con tutte le colonne di prima, comprese quelle delle fasi 4-7.

-- ------------------------------------------------------------------ impostazioni nuove (valore in JSON)
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('STUDIO_LOGO', '""', 'Il logo dello studio (id del file): in cima ai PDF e nel portale.'),
  ('STUDIO_NOME_BREVE', '""', 'Il nome nel menu, nelle email e nel portale. Vuoto = la ragione sociale.'),
  ('STUDIO_SITO', '""', 'Il sito dello studio.'),
  ('PDF_LOGO', 'true', 'Il logo in cima ai PDF.'),
  ('PDF_PIEDE', '""', 'La riga in fondo ai PDF, per esempio l''iscrizione al collegio.'),
  ('MODULI_SPENTI', '[]', 'Le funzioni spente: portale, comunicazioni, collaboratori, mezzi, banche. I dati restano.'),
  ('NOTIFICHE_ORA', '"08:00"', 'L''ora del riepilogo del mattino ("da mandare oggi").'),
  ('SESSIONE_GIORNI', '180', 'Un dispositivo esce da solo dopo tanti giorni senza uso (da 30 a 365).'),
  ('COPIA_CIFRATA', 'false', 'La copia fuori casa parte cifrata. La chiave non e'' un''impostazione: sta solo sul NAS e su carta.'),
  ('PROVA_COPIA_GIORNI', '30', 'Ogni quanti giorni il server prova da solo l''ultima copia.'),
  ('PROVA_RIPRISTINO_GIORNI', '90', 'Dopo quanti giorni la Dashboard chiede di provare il ripristino a mano.'),
  ('ESPORTAZIONI_GIORNI', '7', 'Quanti giorni resta sul NAS il file di Esporta tutto.'),
  ('CALENDARIO_GIORNI_PRIMA', '30', 'Il calendario in altre app comincia da tanti giorni fa.'),
  ('CALENDARIO_MESI_DOPO', '12', 'E arriva a tanti mesi da oggi.'),
  ('CALENDARIO_PUBBLICO', 'false', 'Il calendario anche fuori casa, dallo script del portale (per Google Calendar e Outlook). Spento di base.'),
  ('RICERCA_FILE', 'true', 'La ricerca dei documenti guarda anche dentro i file (PDF, Word, Excel, DXF).'),
  ('RICERCA_FILE_MAX_MB', '20', 'I file piu'' grandi di cosi'' non si leggono.'),
  ('CAMBIO', '{"stato":"prima"}', 'A che punto e'' il passaggio dal foglio al server: prima, prova, fatto, chiuso.');

-- ------------------------------------------------------------------ colonne nuove su tabelle che ci sono
-- L'utente: i quattro riquadri scelti (JSON, null = quelli del ruolo), i tipi di notifica (JSON, null = tutti accesi),
-- di sera e nei festivi niente avvisi sul telefono, la password data da un altro (1) finche' la persona non la cambia,
-- e quando la password e' stata scritta l'ultima volta (per "password iniziale vecchia di piu' di 7 giorni").
ALTER TABLE utenti ADD COLUMN riquadri TEXT;
ALTER TABLE utenti ADD COLUMN notifiche_tipi TEXT;
ALTER TABLE utenti ADD COLUMN notifiche_silenzio INTEGER NOT NULL DEFAULT 1;
ALTER TABLE utenti ADD COLUMN password_iniziale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE utenti ADD COLUMN password_il TEXT NOT NULL DEFAULT '';

-- La copia: i conteggi delle tabelle principali al momento della copia (JSON), l'impronta MD5 del file mandato fuori
-- casa, se era cifrata.
ALTER TABLE copie ADD COLUMN conteggi TEXT;
ALTER TABLE copie ADD COLUMN md5 TEXT;
ALTER TABLE copie ADD COLUMN cifrata INTEGER NOT NULL DEFAULT 0;

-- La sessione: quando e' arrivata l'ultima volta dalla porta Google (§0.2: al posto di "tailnet").
ALTER TABLE sessioni ADD COLUMN da_fuori TEXT NOT NULL DEFAULT '';

-- ------------------------------------------------------------------ file: il tipo "logo"
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo', 'fattura', 'ricevuta',
    'ticket', 'caricato', 'inviato', 'guasto', 'km', 'firma_consegna', 'portale', 'logo')),
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
  svuotato TEXT,
  manutenzione_id INTEGER,
  lettura_id INTEGER,
  consegna_id INTEGER,
  assegnazione_id INTEGER,
  caricamento_id INTEGER
);
INSERT INTO file_nuova (id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id, documento_id, versione_id, ticket_id, fuori_il, fuori_no, caricato_da, svuotato,
    manutenzione_id, lettura_id, consegna_id, assegnazione_id, caricamento_id)
  SELECT id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id, documento_id, versione_id, ticket_id, fuori_il, fuori_no, caricato_da, svuotato,
    manutenzione_id, lettura_id, consegna_id, assegnazione_id, caricamento_id FROM file ORDER BY rowid;
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
CREATE INDEX file_manutenzione ON file(manutenzione_id);
-- La lettura dei km (fase 6): l'indice cambia nome perche' "file_lettura" ora e' la tabella della ricerca (§12.4).
CREATE INDEX file_lettura_km ON file(lettura_id);
CREATE INDEX file_consegna ON file(consegna_id);
CREATE INDEX file_assegnazione ON file(assegnazione_id);
CREATE INDEX file_caricamento ON file(caricamento_id);

-- ------------------------------------------------------------------ integrazioni (§12.4)
-- Una riga per ogni collegamento che ha un controllo vero (§4.2). Il catalogo (nomi, frasi, costi, motivi dei Non
-- collegato) sta nel codice: server/src/integrazioni/elenco.js. riuscito_il: l'ultimo controllo riuscito (un
-- collegamento diventa Collegato solo dopo il primo, §4.4).
CREATE TABLE integrazioni (
  chiave TEXT PRIMARY KEY,
  stato TEXT NOT NULL DEFAULT 'da_configurare' CHECK (stato IN ('collegato', 'da_configurare', 'errore', 'non_collegato', 'in_corso')),
  controllato_il TEXT NOT NULL DEFAULT '',
  esito TEXT NOT NULL DEFAULT '',
  millisecondi INTEGER,
  errori_di_fila INTEGER NOT NULL DEFAULT 0,
  riuscito_il TEXT NOT NULL DEFAULT '',
  account TEXT NOT NULL DEFAULT '',
  modificato TEXT
);

-- Ogni controllo fatto (tenuti 90 giorni): quando, come e' andato, quanto ci ha messo, la frase.
CREATE TABLE integrazioni_controlli (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chiave TEXT NOT NULL,
  quando TEXT NOT NULL,
  esito TEXT NOT NULL CHECK (esito IN ('ok', 'errore')),
  millisecondi INTEGER,
  testo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX integrazioni_controlli_chiave ON integrazioni_controlli(chiave, id);
CREATE INDEX integrazioni_controlli_quando ON integrazioni_controlli(quando);

-- ------------------------------------------------------------------ calendario in altre app (§5.5)
-- Un indirizzo per dispositivo; della chiave solo lo SHA-256 (si mostra una volta, alla creazione).
CREATE TABLE calendario_feed (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER NOT NULL REFERENCES utenti(id),
  nome TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  cosa TEXT NOT NULL DEFAULT '{"attivita":"mie","assenze":false,"scadenze":false}',
  dettagli INTEGER NOT NULL DEFAULT 1 CHECK (dettagli IN (0, 1)),
  pubblico INTEGER NOT NULL DEFAULT 0 CHECK (pubblico IN (0, 1)),
  creato TEXT NOT NULL,
  ultimo_uso TEXT NOT NULL DEFAULT '',
  agente TEXT NOT NULL DEFAULT '',
  letture INTEGER NOT NULL DEFAULT 0,
  revocato_il TEXT NOT NULL DEFAULT ''
);
CREATE INDEX calendario_feed_utente ON calendario_feed(utente_id);

-- ------------------------------------------------------------------ cercare dentro i file (§6)
-- La tabella FTS5 "file_testo" la crea 008-integrazioni-controlli.js (solo se il SQLite del server ha FTS5).
CREATE TABLE file_lettura (
  file_id TEXT PRIMARY KEY,
  stato TEXT NOT NULL DEFAULT 'da_leggere' CHECK (stato IN ('da_leggere', 'letto', 'in_parte', 'senza_testo', 'non_si_legge', 'troppo_grande')),
  caratteri INTEGER NOT NULL DEFAULT 0,
  pagine INTEGER,
  letto_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX file_lettura_stato ON file_lettura(stato);

-- ------------------------------------------------------------------ importa ed esporta (§7)
CREATE TABLE esportazioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER REFERENCES utenti(id),
  tipo TEXT NOT NULL DEFAULT 'tutto' CHECK (tipo IN ('tutto')),
  stato TEXT NOT NULL DEFAULT 'in_corso' CHECK (stato IN ('in_corso', 'pronta', 'errore')),
  percorso TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  righe TEXT,
  creato TEXT NOT NULL,
  scade TEXT NOT NULL DEFAULT '',
  scaricata_il TEXT NOT NULL DEFAULT '',
  errore TEXT NOT NULL DEFAULT ''
);

CREATE TABLE importazioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER REFERENCES utenti(id),
  tipo TEXT NOT NULL DEFAULT 'soggetti' CHECK (tipo IN ('soggetti')),
  nome_file TEXT NOT NULL DEFAULT '',
  righe INTEGER NOT NULL DEFAULT 0,
  nuovi INTEGER NOT NULL DEFAULT 0,
  completati INTEGER NOT NULL DEFAULT 0,
  saltati INTEGER NOT NULL DEFAULT 0,
  errori TEXT,
  ids TEXT,
  quando TEXT NOT NULL,
  archiviati_il TEXT NOT NULL DEFAULT ''
);

-- ------------------------------------------------------------------ Dashboard: le voci nascoste per 30 giorni (§8.2, 7)
CREATE TABLE dashboard_nascoste (
  utente_id INTEGER NOT NULL REFERENCES utenti(id),
  oggetto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT '',
  fino TEXT NOT NULL,
  creato TEXT NOT NULL,
  PRIMARY KEY (utente_id, oggetto)
);

-- ------------------------------------------------------------------ copie: le prove (§9.10)
CREATE TABLE copie_prove (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('automatica', 'a_mano')),
  copia TEXT NOT NULL DEFAULT '',
  da TEXT NOT NULL DEFAULT 'nas' CHECK (da IN ('nas', 'drive')),
  esito TEXT NOT NULL CHECK (esito IN ('ok', 'errore')),
  dettagli TEXT,
  utente_id INTEGER,
  con_chiave INTEGER NOT NULL DEFAULT 0 CHECK (con_chiave IN (0, 1)),
  note TEXT NOT NULL DEFAULT ''
);

-- ------------------------------------------------------------------ la lista di controllo (§11)
CREATE TABLE controlli_finali (
  chiave TEXT PRIMARY KEY,
  gruppo TEXT NOT NULL,
  ordine INTEGER NOT NULL,
  testo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('automatica', 'server', 'a_mano', 'prova_generale')),
  chi TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare', 'fatto', 'non_va', 'attesa')),
  il TEXT NOT NULL DEFAULT '',
  utente_id INTEGER,
  versione TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  documento_id INTEGER
);
CREATE INDEX controlli_finali_gruppo ON controlli_finali(ordine);

-- ------------------------------------------------------------------ indici trovati con la prova di carico (§11.5)
-- Lo stato di ogni fattura ricevuta cerca le sue note di credito (ricevuta_collegata_id): senza indice, con dieci anni
-- di ricevute, la Dashboard e lo scadenziario leggevano tutta la tabella una volta per ricevuta.
CREATE INDEX IF NOT EXISTS fatture_ricevute_collegata ON fatture_ricevute(ricevuta_collegata_id);
-- Indici PARZIALI (solo le righe di quello stato) per le richieste che cercano pochi rapportini e poche ore fra tutti:
-- le bozze da firmare, i firmati da fatturare, quelli da approvare o respinti. Parziali perche' un indice intero su
-- stato fa scegliere a SQLite l'indice anche per "approvata" (quasi tutte le righe), che diventa piu' lento della tabella.
CREATE INDEX IF NOT EXISTS rapportini_bozze ON rapportini(data) WHERE UPPER(stato) = 'BOZZA';
CREATE INDEX IF NOT EXISTS rapportini_firmati ON rapportini(data) WHERE UPPER(stato) IN ('FIRMATO', 'INVIATO');
CREATE INDEX IF NOT EXISTS rapportini_da_approvare ON rapportini(utente_id) WHERE stato_approvazione = 'da_approvare';
CREATE INDEX IF NOT EXISTS rapportini_respinti ON rapportini(utente_id, data) WHERE stato_approvazione = 'respinto';
CREATE INDEX IF NOT EXISTS ore_respinte ON ore(utente_id, data) WHERE stato = 'respinta';
CREATE INDEX IF NOT EXISTS ore_da_approvare ON ore(utente_id) WHERE stato = 'da_approvare';
