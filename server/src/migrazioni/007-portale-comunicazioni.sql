-- Fase 7 del gestionale (novembre 2026): portale clienti, WhatsApp e comunicazioni.
-- L'accordo e' in docs/gestionale/fase7.md §5, con le modifiche della strada Google (§0.6): niente csrf_hash, niente
-- PORTALE_INGRESSO, le colonne "ip" restano (vuote: Google non passa l'indirizzo di chi chiama).
-- Come nelle altre: importi in euro come numeri decimali arrotondati al centesimo, date "aaaa-mm-gg", istanti ISO col fuso.
-- Le tabelle da cui si tolgono righe hanno AUTOINCREMENT: un id tolto non torna mai a un'altra riga.
-- Token, codici e pre-sessioni stanno SOLO come impronta (SHA-256; il codice come HMAC-SHA256 col segreto del portale,
-- che non sta nel database: /data/portale-segreto).
-- Dopo questo file gira 007-portale-comunicazioni.js: i modelli dei messaggi, il permesso "comunicazioni" del
-- collaboratore, lo storico che parte dalle copie dei PDF mandati della fase 5.
--
-- Niente di quello che c'e' si cancella o si riscrive: le tabelle rifatte (preventivi, per il CHECK di
-- accettazione_modo; file, per il tipo "portale") si ricopiano riga per riga con tutte le colonne di prima.

-- ------------------------------------------------------------------ impostazioni nuove (valore in JSON)
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('PORTALE_ATTIVO', 'false', 'Interruttore generale del portale clienti (spento = il portale risponde solo "non attivo").'),
  ('PORTALE_INDIRIZZO', '""', 'L''indirizzo pubblico della pagina del portale (Netlify). Vuoto = non collegato.'),
  ('PORTALE_LINK_MINUTI', '10', 'Per quanti minuti valgono il link e il codice chiesti dalla pagina d''ingresso.'),
  ('PORTALE_LINK_AVVISO_ORE', '72', 'Per quante ore valgono i link negli avvisi e negli inviti.'),
  ('PORTALE_CODICE_TENTATIVI', '5', 'Quanti errori si ammettono su un codice d''accesso.'),
  ('PORTALE_SESSIONE_MINUTI', '30', 'La sessione del portale scade dopo tanti minuti senza uso.'),
  ('PORTALE_SESSIONE_ORE', '8', 'E comunque dopo tante ore.'),
  ('PORTALE_FILE_MAX_MB', '20', 'La grandezza massima di un file mandato da un cliente, in MB.'),
  ('PORTALE_FILE_GIORNO', '20', 'Quanti file al giorno puo'' mandare un referente (e 200 MB).'),
  ('PORTALE_TIPI_FILE', '["pdf","jpg","jpeg","png","heic","dwg","dxf","docx","xlsx"]', 'I tipi di file accettati dal portale: si possono solo togliere.'),
  ('PORTALE_RICHIESTE_GIORNO', '10', 'Quante richieste d''intervento al giorno puo'' mandare un referente.'),
  ('PORTALE_EMAIL_RISERVA', '20', 'Le email del giorno lasciate allo studio: gli avvisi del portale si fermano prima.'),
  ('PORTALE_EMAIL_MAX_GIORNO', '40', 'Quante email al giorno manda il portale, in tutto.'),
  ('PORTALE_AVVISI_MINUTI', '10', 'Quanti minuti si aspetta per raggruppare gli avvisi per email.'),
  ('PORTALE_ACCESSI_MESI', '12', 'Per quanti mesi si tiene il registro degli accessi del portale. Da confermare col consulente privacy.'),
  ('PORTALE_INATTIVI_MESI', '12', 'Un referente che non entra da tanti mesi: la Dashboard propone di togliergli l''accesso.'),
  ('PORTALE_INFORMATIVA', '"Questo portale è di {studio} ({indirizzo}, P. IVA {partita_iva}), titolare dei dati. Lo usiamo per mostrarti i documenti del lavoro che facciamo per {cliente}, per raccogliere accettazioni, firme e richieste. Teniamo il tuo nome, la tua email, il telefono se ce l''hai dato, le firme e un registro degli accessi (data, ora, browser) per 12 mesi. I documenti e le firme li conserviamo come le altre carte dello studio, per 10 anni. Le email e il collegamento passano da Google; la pagina è ospitata da Netlify: tutti e due possono trattare dati negli Stati Uniti. Usiamo solo la memoria del browser che serve a tenerti dentro, e si cancella chiudendo la scheda: niente statistiche, niente pubblicità. Puoi chiedere di vedere, correggere o cancellare i tuoi dati scrivendo a {email_studio}; puoi anche rivolgerti al Garante per la protezione dei dati personali."',
    'L''informativa per chi usa il portale. Da confermare col consulente privacy.'),
  ('PORTALE_INFORMATIVA_DATA', '"2026-10-22"', 'La versione dell''informativa: se cambia, al prossimo ingresso tutti la rivedono.'),
  ('SOLLECITO_DOPO_GIORNI', '7', 'Dopo quanti giorni dalla scadenza Wisper propone il promemoria di pagamento.'),
  ('SOLLECITO_SECONDO_GIORNI', '30', 'Dopo quanti giorni dal primo promemoria propone il secondo (e poi niente altro).'),
  ('PROMEMORIA_GIORNI_PRIMA', '1', 'Quanti giorni lavorativi prima di un appuntamento si propone il promemoria al cliente.'),
  ('WHATSAPP_APP', '"chiedi"', 'Quale WhatsApp apre il telefono: business, normale o chiedi.'),
  ('WHATSAPP_TESTO_MAX', '1000', 'Quanti caratteri al massimo in un messaggio WhatsApp.'),
  ('COMUNICAZIONI_CONSERVA_ANNI', '10', 'Per quanti anni si tiene lo storico delle comunicazioni. Da confermare col consulente privacy.'),
  ('NOTIFICHE_CONSERVA_GIORNI', '90', 'Dopo quanti giorni si tolgono le notifiche interne.');

-- ------------------------------------------------------------------ colonne nuove su tabelle che ci sono
-- Il cliente: portale acceso, cosa si pubblica da solo (JSON, null = le regole di base), importi nei rapportini.
ALTER TABLE soggetti ADD COLUMN portale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE soggetti ADD COLUMN portale_regole TEXT;
ALTER TABLE soggetti ADD COLUMN portale_importi INTEGER NOT NULL DEFAULT 0;

-- Il referente: l'accesso al portale, cosa puo' fare (JSON), le sue sedi (JSON, null = tutte), gli avvisi, l'informativa
-- vista, chi paga le fatture, WhatsApp (numero se diverso dal telefono, il si' con la data).
ALTER TABLE referenti ADD COLUMN portale INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referenti ADD COLUMN portale_permessi TEXT;
ALTER TABLE referenti ADD COLUMN portale_sedi TEXT;
ALTER TABLE referenti ADD COLUMN portale_invitato_il TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN portale_dal TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN portale_tolto_il TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN ultimo_accesso TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN avvisi_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE referenti ADD COLUMN informativa_il TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN informativa_versione TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN pagamenti INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referenti ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';
ALTER TABLE referenti ADD COLUMN whatsapp_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referenti ADD COLUMN whatsapp_ok_il TEXT NOT NULL DEFAULT '';
-- Due referenti della stessa azienda col portale acceso non hanno la stessa email.
CREATE UNIQUE INDEX referenti_portale_email ON referenti(soggetto_id, lower(email)) WHERE portale = 1;

-- Il rapportino firmato nel portale: come (''= sul telefono o col foglio firmato, come oggi; 'portale'), la prova, chi.
ALTER TABLE rapportini ADD COLUMN firma_modo TEXT NOT NULL DEFAULT '';
ALTER TABLE rapportini ADD COLUMN firma_prova TEXT;
ALTER TABLE rapportini ADD COLUMN firma_referente_id INTEGER;

-- Il ticket: lo vede il cliente nel portale (origine 'portale' il CHECK la accetta gia' dalla fase 5).
ALTER TABLE ticket ADD COLUMN portale_visibile INTEGER NOT NULL DEFAULT 0;

-- L'attivita': avvisa il cliente ('' | whatsapp | email) e quale referente.
ALTER TABLE attivita ADD COLUMN avvisa_cliente TEXT NOT NULL DEFAULT '' CHECK (avvisa_cliente IN ('', 'whatsapp', 'email'));
ALTER TABLE attivita ADD COLUMN avvisa_referente_id INTEGER;

-- La fattura: il motivo per non proporre promemoria di pagamento, la copia di cortesia in PDF.
ALTER TABLE fatture ADD COLUMN solleciti_no TEXT NOT NULL DEFAULT '';
ALTER TABLE fatture ADD COLUMN copia_file_id TEXT;

-- Il documento nato da un file del portale.
ALTER TABLE documenti ADD COLUMN caricamento_id INTEGER;

-- Le notifiche sul telefono (Avvisami sul telefono).
ALTER TABLE utenti ADD COLUMN notifiche_telefono INTEGER NOT NULL DEFAULT 1;

-- ------------------------------------------------------------------ preventivi: accettazione_modo accetta "portale"
-- SQLite non cambia un CHECK: la tabella si rifa'. preventivo_sezioni, preventivo_voci e scadenze_pagamento la citano
-- (senza ON DELETE): con le chiavi esterne rimandate alla fine della transazione, DROP TABLE conta i loro legami come
-- "da risolvere" e la INSERT delle stesse righe (stessi id) li risolve. Se mancasse una riga la transazione non chiude.
CREATE TEMP TABLE preventivi_prima AS SELECT * FROM preventivi;
PRAGMA defer_foreign_keys = ON;
DROP TABLE preventivi;
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
  accettazione_modo TEXT NOT NULL DEFAULT '' CHECK (accettazione_modo IN ('', 'firma', 'email', 'documento', 'voce', 'portale')),
  firma_file_id TEXT NOT NULL DEFAULT '',
  rifiutato_il TEXT NOT NULL DEFAULT '',
  motivo_rifiuto TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '',
  modello INTEGER NOT NULL DEFAULT 0,
  note_interne TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT,
  modificato TEXT,
  accettazione_prova TEXT,
  accettato_referente_id INTEGER
);
INSERT INTO preventivi (id, numero, revisione, cliente_id, sede_id, referente_id, oggetto, introduzione, complessita, complessita_nota,
    oneri_previsti, condizioni, data, scadenza, stato, sconto_percentuale, sconto_euro, eppi_percentuale, iva_percentuale, inviato_il,
    accettato_il, accettato_da, accettazione_modo, firma_file_id, rifiutato_il, motivo_rifiuto, commessa_id, modello, note_interne,
    utente_id, creato, modificato)
  SELECT id, numero, revisione, cliente_id, sede_id, referente_id, oggetto, introduzione, complessita, complessita_nota,
    oneri_previsti, condizioni, data, scadenza, stato, sconto_percentuale, sconto_euro, eppi_percentuale, iva_percentuale, inviato_il,
    accettato_il, accettato_da, accettazione_modo, firma_file_id, rifiutato_il, motivo_rifiuto, commessa_id, modello, note_interne,
    utente_id, creato, modificato FROM temp.preventivi_prima ORDER BY id;
DROP TABLE temp.preventivi_prima;
CREATE UNIQUE INDEX preventivi_numero ON preventivi(numero, revisione) WHERE numero <> '';
CREATE INDEX preventivi_cliente ON preventivi(cliente_id);

-- ------------------------------------------------------------------ file: il tipo "portale" (arrivato da un cliente)
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo', 'fattura', 'ricevuta',
    'ticket', 'caricato', 'inviato', 'guasto', 'km', 'firma_consegna', 'portale')),
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
    manutenzione_id, lettura_id, consegna_id, assegnazione_id)
  SELECT id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id, documento_id, versione_id, ticket_id, fuori_il, fuori_no, caricato_da, svuotato,
    manutenzione_id, lettura_id, consegna_id, assegnazione_id FROM file ORDER BY rowid;
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
CREATE INDEX file_lettura ON file(lettura_id);
CREATE INDEX file_consegna ON file(consegna_id);
CREATE INDEX file_assegnazione ON file(assegnazione_id);
CREATE INDEX file_caricamento ON file(caricamento_id);

-- ------------------------------------------------------------------ il portale
-- I link: d'accesso (dalla pagina d'ingresso, col codice e la pre-sessione), negli avvisi, negli inviti, l'anteprima
-- dello studio. Solo impronte: token_hash = SHA-256 del token, codice_hash = HMAC del codice, pre_hash = SHA-256 di "pre".
CREATE TABLE portale_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referente_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('accesso', 'avviso', 'invito', 'anteprima')),
  token_hash TEXT NOT NULL UNIQUE,
  codice_hash TEXT,
  pre_hash TEXT,
  destinazione TEXT NOT NULL DEFAULT '',
  creato TEXT NOT NULL,
  scade TEXT NOT NULL,
  usato_il TEXT,
  annullato_il TEXT,
  tentativi INTEGER NOT NULL DEFAULT 0,
  ip TEXT NOT NULL DEFAULT '',
  anteprima_utente_id INTEGER
);
CREATE INDEX portale_link_referente ON portale_link(referente_id, tipo);

-- Le sessioni del portale (non sono le sessioni dello studio: un token del portale non apre /exec).
CREATE TABLE portale_sessioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  referente_id INTEGER NOT NULL,
  soggetto_id TEXT NOT NULL,
  creata TEXT NOT NULL,
  ultimo_uso TEXT NOT NULL,
  scade_il TEXT NOT NULL,
  chiusa_il TEXT,
  motivo_chiusura TEXT NOT NULL DEFAULT '' CHECK (motivo_chiusura IN ('', 'esci', 'scaduta', 'tolto', 'tutti', 'spento', 'email cambiata', 'azienda')),
  ip TEXT NOT NULL DEFAULT '',
  agente TEXT NOT NULL DEFAULT '',
  anteprima_utente_id INTEGER,
  -- Piu' aziende con la stessa email: dopo il codice la sessione vale solo per scegliere l'azienda o uscire.
  da_scegliere INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX portale_sessioni_referente ON portale_sessioni(referente_id, chiusa_il);

-- Il registro degli accessi del portale: non si modifica e non si cancella, tranne la pulizia della notte delle righe
-- piu' vecchie di PORTALE_ACCESSI_MESI (la pulizia scrive "fino" in portale_pulizia, toglie e svuota, tutto in una transazione).
CREATE TABLE portale_accessi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  referente_id INTEGER,
  soggetto_id TEXT NOT NULL DEFAULT '',
  sessione_id INTEGER,
  azione TEXT NOT NULL CHECK (azione IN ('link_chiesto', 'entrato', 'codice_sbagliato', 'link_scaduto', 'bloccato', 'visto', 'scaricato',
    'accettato', 'rifiutato', 'domanda', 'firmato', 'segnalato', 'caricato', 'richiesta', 'messaggio', 'uscito', 'scaduta', 'negato', 'azienda')),
  oggetto TEXT NOT NULL DEFAULT '',
  esito TEXT NOT NULL DEFAULT 'ok' CHECK (esito IN ('ok', 'no')),
  ip TEXT NOT NULL DEFAULT '',
  agente TEXT NOT NULL DEFAULT ''
);
CREATE INDEX portale_accessi_referente ON portale_accessi(referente_id, quando);
CREATE INDEX portale_accessi_soggetto ON portale_accessi(soggetto_id, quando);
CREATE INDEX portale_accessi_quando ON portale_accessi(quando);
CREATE TABLE portale_pulizia (fino TEXT NOT NULL);
CREATE TRIGGER portale_accessi_non_si_modifica BEFORE UPDATE ON portale_accessi
  BEGIN SELECT RAISE(ABORT, 'Il registro degli accessi del portale non si modifica'); END;
CREATE TRIGGER portale_accessi_non_si_cancella BEFORE DELETE ON portale_accessi
  WHEN NOT EXISTS (SELECT 1 FROM portale_pulizia WHERE OLD.quando < fino)
  BEGIN SELECT RAISE(ABORT, 'Il registro degli accessi del portale non si cancella'); END;

-- I tentativi (link chiesti, codici sbagliati) per i limiti: chiave "email:<sha256>", "portale" (tutto il portale),
-- "codice:<referente>", "letture", "richiesta:<referente>". Si svuota delle righe oltre 24 ore.
CREATE TABLE portale_tentativi (
  chiave TEXT NOT NULL,
  quando TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT ''
);
CREATE INDEX portale_tentativi_chiave ON portale_tentativi(chiave, tipo, quando);

-- Cosa vede il cliente: una riga per cosa pubblicata. L'id e' quello con cui il portale chiama ogni cosa.
CREATE TABLE portale_pubblicazioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  soggetto_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('preventivo', 'contratto', 'rapportino', 'fattura', 'documento', 'ticket')),
  rif TEXT NOT NULL,
  versione_id INTEGER,
  sede_id INTEGER,
  da_firmare INTEGER NOT NULL DEFAULT 0,
  file_id TEXT,
  origine TEXT NOT NULL DEFAULT 'mano' CHECK (origine IN ('regola', 'mano')),
  pubblicata_da INTEGER,
  pubblicata_il TEXT NOT NULL,
  tolta_il TEXT,
  tolta_da INTEGER,
  motivo_tolta TEXT NOT NULL DEFAULT '' CHECK (motivo_tolta IN ('', 'mano', 'sostituito', 'annullato', 'portale spento')),
  visto_il TEXT,
  visto_da INTEGER,
  avvisato_il TEXT,
  -- Gli avvisi per email (§3.12, §8.3): da quando c'e' una novita' da dire (la pubblicazione, o un cambio della richiesta)
  -- e quale ('' = la cosa pubblicata; per le richieste 'intervento fissato', 'risolta', 'risposta'); senza_avviso: pubblicata
  -- con "Pubblica anche quelli di prima" o un rapportino gia' firmato (non si avvisa).
  avviso_da TEXT,
  avviso_cosa TEXT NOT NULL DEFAULT '',
  senza_avviso INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX portale_pubblicazioni_una ON portale_pubblicazioni(soggetto_id, tipo, rif) WHERE tolta_il IS NULL;
CREATE INDEX portale_pubblicazioni_rif ON portale_pubblicazioni(tipo, rif);

-- I file mandati dai clienti: da guardare, poi accettati (diventano documenti) o rifiutati (col motivo).
CREATE TABLE portale_caricamenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  soggetto_id TEXT NOT NULL,
  referente_id INTEGER NOT NULL,
  per TEXT NOT NULL CHECK (per IN ('documento', 'richiesta', 'messaggio')),
  ticket_id INTEGER,
  titolo TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  sede_id INTEGER,
  nome_originale TEXT NOT NULL DEFAULT '',
  estensione TEXT NOT NULL DEFAULT '',
  byte INTEGER NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'da_guardare' CHECK (stato IN ('caricato', 'da_guardare', 'accettato', 'rifiutato')),
  deciso_da INTEGER,
  deciso_il TEXT,
  motivo TEXT NOT NULL DEFAULT '',
  documento_id INTEGER,
  comunicazione_id INTEGER,
  creato TEXT NOT NULL
);
CREATE INDEX portale_caricamenti_soggetto ON portale_caricamenti(soggetto_id, stato);

-- Cosa e' arrivato dal portale e lo studio deve guardare.
CREATE TABLE portale_da_guardare (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('richiesta', 'accettato', 'rifiutato', 'domanda', 'firmato', 'segnalato', 'caricamento', 'messaggio')),
  rif TEXT NOT NULL DEFAULT '',
  soggetto_id TEXT NOT NULL DEFAULT '',
  referente_id INTEGER,
  titolo TEXT NOT NULL DEFAULT '',
  dettaglio TEXT NOT NULL DEFAULT '',
  creato TEXT NOT NULL,
  visto_il TEXT,
  visto_da INTEGER
);
CREATE INDEX portale_da_guardare_aperte ON portale_da_guardare(visto_il, tipo, rif);

-- ------------------------------------------------------------------ comunicazioni, modelli, notifiche
-- Lo storico per cliente e per commessa: email, WhatsApp preparati, telefonate annotate, messaggi del portale.
CREATE TABLE comunicazioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  quando TEXT NOT NULL,
  canale TEXT NOT NULL CHECK (canale IN ('email', 'whatsapp', 'portale', 'telefonata', 'nota')),
  direzione TEXT NOT NULL DEFAULT 'uscita' CHECK (direzione IN ('uscita', 'entrata')),
  tipo TEXT NOT NULL DEFAULT 'libero',
  modello TEXT NOT NULL DEFAULT '',
  proposta TEXT NOT NULL DEFAULT '',
  cliente_id TEXT NOT NULL DEFAULT '',
  referente_id INTEGER,
  commessa_id TEXT NOT NULL DEFAULT '',
  ticket_id INTEGER,
  preventivo_id INTEGER,
  rapportino_id TEXT NOT NULL DEFAULT '',
  fattura_id INTEGER,
  attivita_id INTEGER,
  documento_id INTEGER,
  a TEXT NOT NULL DEFAULT '',
  oggetto TEXT NOT NULL DEFAULT '',
  testo TEXT NOT NULL DEFAULT '',
  allegati TEXT NOT NULL DEFAULT '[]',
  stato TEXT NOT NULL CHECK (stato IN ('preparato', 'mandato', 'non_mandato', 'errore', 'ricevuto')),
  mandato_il TEXT NOT NULL DEFAULT '',
  errore TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  pubblica INTEGER NOT NULL DEFAULT 0,
  letto_il TEXT NOT NULL DEFAULT '',
  utente_id INTEGER,
  creato TEXT NOT NULL,
  modificato TEXT NOT NULL
);
CREATE INDEX comunicazioni_cliente ON comunicazioni(cliente_id, quando);
CREATE INDEX comunicazioni_commessa ON comunicazioni(commessa_id, quando);
CREATE INDEX comunicazioni_ticket ON comunicazioni(ticket_id, quando);
CREATE INDEX comunicazioni_proposta ON comunicazioni(proposta);
CREATE INDEX comunicazioni_quando ON comunicazioni(quando);

-- I modelli dei messaggi coi segnaposti (righe iniziali dalla .js, "sistema": si cambiano, non si tolgono).
CREATE TABLE modelli_messaggi (
  chiave TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  canale TEXT NOT NULL DEFAULT 'tutti' CHECK (canale IN ('whatsapp', 'email', 'tutti')),
  uso TEXT NOT NULL DEFAULT 'libero' CHECK (uso IN ('appuntamento', 'intervento', 'preventivo', 'rapportino', 'pagamento', 'portale', 'libero')),
  oggetto TEXT NOT NULL DEFAULT '',
  testo TEXT NOT NULL DEFAULT '',
  attivo INTEGER NOT NULL DEFAULT 1,
  sistema INTEGER NOT NULL DEFAULT 0,
  ordine INTEGER NOT NULL DEFAULT 0,
  modificato TEXT,
  modificato_da INTEGER
);

-- Le notifiche interne: frasi pronte per una persona dello studio.
CREATE TABLE notifiche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  titolo TEXT NOT NULL DEFAULT '',
  dettaglio TEXT NOT NULL DEFAULT '',
  collegamento TEXT,
  creata TEXT NOT NULL,
  letta_il TEXT,
  telefono_il TEXT
);
CREATE INDEX notifiche_utente ON notifiche(utente_id, letta_il, creata);
