-- Fase 6 del gestionale (ottobre 2026): persone e risorse umane, mezzi e attrezzature, collaboratori esterni.
-- L'accordo e' in docs/gestionale/fase6.md §4; le risposte in architettura.md §17.
-- Come nelle altre: importi in euro come numeri decimali arrotondati al centesimo, date "aaaa-mm-gg", istanti ISO col fuso.
-- Le tabelle da cui si tolgono righe hanno AUTOINCREMENT: un id tolto non torna mai a un'altra riga.
-- Dopo questo file gira 006-persone-mezzi-collaboratori.js: i contatori delle tabelle rifatte, le persone dagli utenti,
-- i veicoli "auto di una persona", i permessi del ruolo esterno, i tipi di qualifica e le categorie dei documenti.
--
-- Niente di quello che c'e' si cancella o si riscrive: le tabelle rifatte (ore, scadenze, file) si ricopiano riga per
-- riga con tutte le colonne di prima, e i contatori AUTOINCREMENT restano quelli. Nessun costo si scrive: le righe di
-- ore e rapportini tengono il loro costo orario congelato.

-- ------------------------------------------------------------------ impostazioni nuove (valore in JSON)
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('FESTA_PATRONO', '""', 'Il santo patrono del comune dello studio, come "mm-gg" (vuoto = nessuno).'),
  ('PERSONE_CONSERVA_ANNI', '10', 'Dopo quanti anni dall''uscita si propone di rendere anonima la scheda di una persona. Da confermare col consulente del lavoro.'),
  ('SALDO_AVVISO_GIORNI', '60', 'Saldo di ferie non aggiornato dal cedolino da piu'' giorni: la Dashboard lo dice (solo per chi ha le ore all''anno).'),
  ('TARATURA_OGNI_MESI', '12', 'Ogni quanti mesi si propone la taratura di uno strumento nuovo.'),
  ('TARATURA_PREAVVISO_GIORNI', '30', 'Il preavviso delle scadenze di taratura e di verifica, in giorni.'),
  ('TARATURA_BLOCCO', '"avviso"', 'Con la taratura scaduta: "avviso" (si usa confermando) o "blocco" (non si sceglie).'),
  ('DURC_GIORNI', '120', 'Quanti giorni vale un DURC dalla data di emissione (proposta).'),
  ('VISURA_MESI', '6', 'L''eta'' massima proposta della visura camerale, in mesi.'),
  ('COLLAB_DOCUMENTI', '{"impresa":["durc","visura","idoneita","polizza"],"professionista":["polizza","albo"],"occasionale":[]}',
    'I documenti che servono a un collaboratore esterno per essere in regola, per tipo.'),
  ('ACCESSO_ESTERNI_GIORNI', '90', 'Dopo quanti giorni senza incarichi in corso si propone di togliere l''accesso a un esterno.'),
  ('KM_TAGLIANDO_AVVISO', '1000', 'Quanti km prima del tagliando la Dashboard avvisa.');

-- IN/2026/004 riparte ogni anno; AT003 continua (e' il codice dell'etichetta attaccata allo strumento).
INSERT OR IGNORE INTO numerazioni (tipo, formato, annuale) VALUES ('incarico', 'IN/{AAAA}/{NNN}', 1), ('attrezzatura', 'AT{NNN}', 0);

-- ------------------------------------------------------------------ colonne nuove su tabelle che ci sono
-- Un utente "esterno" fa parte di un collaboratore esterno (un fornitore, F...): solo lui ha soggetto_id.
ALTER TABLE utenti ADD COLUMN soggetto_id TEXT;

-- I veicoli della fase 3 diventano i mezzi. proprieta: "persona" (l'auto di qualcuno, rimborso km come oggi) o
-- "studio" (niente rimborso km a chi guida). La migrazione li lascia tutti "persona": le trasferte non cambiano.
ALTER TABLE veicoli ADD COLUMN targa TEXT NOT NULL DEFAULT '';
ALTER TABLE veicoli ADD COLUMN tipo TEXT NOT NULL DEFAULT 'auto' CHECK (tipo IN ('auto', 'furgone', 'moto', 'altro'));
ALTER TABLE veicoli ADD COLUMN proprieta TEXT NOT NULL DEFAULT 'persona' CHECK (proprieta IN ('persona', 'studio'));
ALTER TABLE veicoli ADD COLUMN persona_id INTEGER;
ALTER TABLE veicoli ADD COLUMN immatricolazione TEXT NOT NULL DEFAULT '';
ALTER TABLE veicoli ADD COLUMN km INTEGER;
ALTER TABLE veicoli ADD COLUMN km_il TEXT NOT NULL DEFAULT '';
ALTER TABLE veicoli ADD COLUMN tagliando_km INTEGER;
ALTER TABLE veicoli ADD COLUMN tagliando_ultimo_km INTEGER;
ALTER TABLE veicoli ADD COLUMN tagliando_ogni_mesi INTEGER;
ALTER TABLE veicoli ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE veicoli ADD COLUMN dismesso_il TEXT NOT NULL DEFAULT '';
ALTER TABLE veicoli ADD COLUMN dismesso_motivo TEXT NOT NULL DEFAULT '';

-- I documenti dell'archivio legati a una persona, a un mezzo, a uno strumento o a un incarico. Un documento di un
-- collaboratore usa cliente_id col suo F... (la colonna punta a soggetti).
ALTER TABLE documenti ADD COLUMN persona_id INTEGER;
ALTER TABLE documenti ADD COLUMN veicolo_id INTEGER;
ALTER TABLE documenti ADD COLUMN attrezzatura_id INTEGER;
ALTER TABLE documenti ADD COLUMN incarico_id INTEGER;
CREATE INDEX documenti_persona ON documenti(persona_id);
CREATE INDEX documenti_veicolo ON documenti(veicolo_id);
CREATE INDEX documenti_attrezzatura ON documenti(attrezzatura_id);
CREATE INDEX documenti_incarico ON documenti(incarico_id);

-- Spese, fatture ricevute e impegni del mezzo, dello strumento o dell'incarico (il costo sta li', mai due volte).
ALTER TABLE spese ADD COLUMN veicolo_id INTEGER;
ALTER TABLE spese ADD COLUMN attrezzatura_id INTEGER;
ALTER TABLE spese ADD COLUMN incarico_id INTEGER;
CREATE INDEX spese_veicolo ON spese(veicolo_id);
CREATE INDEX spese_incarico ON spese(incarico_id);
ALTER TABLE fatture_ricevute ADD COLUMN incarico_id INTEGER;
ALTER TABLE fatture_ricevute ADD COLUMN veicolo_id INTEGER;
ALTER TABLE fatture_ricevute ADD COLUMN attrezzatura_id INTEGER;
CREATE INDEX fatture_ricevute_incarico ON fatture_ricevute(incarico_id);
ALTER TABLE impegni ADD COLUMN veicolo_id INTEGER;

-- Il rapportino di un esterno, legato al suo incarico su quella commessa.
ALTER TABLE rapportini ADD COLUMN incarico_id INTEGER;

-- ------------------------------------------------------------------ ore: utente_id facoltativo, incarico, chi l'ha scritta
-- Le ore di un collaboratore esterno senza accesso non hanno utente: allora l'incarico e' obbligatorio (CHECK).
-- SQLite non cambia un NOT NULL ne' aggiunge un CHECK: la tabella si rifa' con tutte le colonne di oggi.
CREATE TEMP TABLE contatori_prima AS SELECT name, seq FROM sqlite_sequence WHERE name IN ('ore', 'scadenze');

CREATE TABLE ore_nuova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER REFERENCES utenti(id),
  data TEXT NOT NULL,
  inizio TEXT NOT NULL DEFAULT '',
  fine TEXT NOT NULL DEFAULT '',
  pausa_minuti INTEGER NOT NULL DEFAULT 0,
  ore REAL NOT NULL DEFAULT 0,
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  prestazione_id INTEGER,
  attivita_id INTEGER,
  descrizione TEXT NOT NULL DEFAULT '',
  fatturabile INTEGER NOT NULL DEFAULT 1,
  tipo TEXT NOT NULL DEFAULT 'ordinaria' CHECK (tipo IN ('ordinaria', 'straordinaria')),
  costo_orario REAL,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'da_approvare', 'approvata', 'respinta')),
  approvata_da INTEGER REFERENCES utenti(id),
  approvata_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  dal_timer INTEGER NOT NULL DEFAULT 0,
  id_locale TEXT UNIQUE,
  tolta TEXT,
  creato TEXT,
  modificato TEXT,
  fatturata_il TEXT NOT NULL DEFAULT '',
  ticket_id INTEGER,
  incarico_id INTEGER,
  creata_da INTEGER,
  CHECK (utente_id IS NOT NULL OR incarico_id IS NOT NULL)
);
INSERT INTO ore_nuova (id, utente_id, data, inizio, fine, pausa_minuti, ore, commessa_id, prestazione_id, attivita_id, descrizione, fatturabile,
    tipo, costo_orario, stato, approvata_da, approvata_il, motivo, dal_timer, id_locale, tolta, creato, modificato, fatturata_il, ticket_id)
  SELECT id, utente_id, data, inizio, fine, pausa_minuti, ore, commessa_id, prestazione_id, attivita_id, descrizione, fatturabile,
    tipo, costo_orario, stato, approvata_da, approvata_il, motivo, dal_timer, id_locale, tolta, creato, modificato, fatturata_il, ticket_id FROM ore;
DROP TABLE ore;
ALTER TABLE ore_nuova RENAME TO ore;
CREATE INDEX ore_utente_data ON ore(utente_id, data);
CREATE INDEX ore_commessa ON ore(commessa_id);
CREATE INDEX ore_ticket ON ore(ticket_id);
CREATE INDEX ore_incarico ON ore(incarico_id);

-- ------------------------------------------------------------------ scadenze: i tipi nuovi e di chi sono
-- Formazione, abilitazioni, visite mediche, contratti di lavoro, assicurazioni, bolli, revisioni, tagliandi, tarature,
-- verifiche dei DPI, DURC, visure, idoneita', iscrizioni all'albo: tutte qui (lo scadenziario e' uno). fine_mese: la
-- prossima va all'ultimo giorno del mese (la revisione del mezzo). Per i collaboratori la scadenza usa cliente_id.
CREATE TABLE scadenze_nuova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titolo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'altro' CHECK (tipo IN ('verifica_terra', 'verifica_scariche', 'verifica_protezioni', 'manutenzione',
    'documento', 'polizza', 'contratto', 'altro',
    'formazione', 'abilitazione', 'visita_medica', 'contratto_lavoro', 'assicurazione', 'bollo', 'revisione', 'tagliando',
    'taratura', 'verifica_dpi', 'durc', 'visura', 'idoneita', 'albo')),
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
  modificato TEXT,
  persona_id INTEGER,
  veicolo_id INTEGER,
  attrezzatura_id INTEGER,
  qualifica_id INTEGER,
  visita_id INTEGER,
  fine_mese INTEGER NOT NULL DEFAULT 0 CHECK (fine_mese IN (0, 1))
);
INSERT INTO scadenze_nuova (id, titolo, tipo, cliente_id, sede_id, documento_id, contratto_id, data, preavviso_giorni, ogni_mesi, dalla_fatta,
    azione, anticipo_giorni, assegnata_a, stato, fatta_il, ticket_id, documento_fatto_id, prossima_id, note, motivo, creata_da, creato, modificato)
  SELECT id, titolo, tipo, cliente_id, sede_id, documento_id, contratto_id, data, preavviso_giorni, ogni_mesi, dalla_fatta,
    azione, anticipo_giorni, assegnata_a, stato, fatta_il, ticket_id, documento_fatto_id, prossima_id, note, motivo, creata_da, creato, modificato FROM scadenze;
DROP TABLE scadenze;
ALTER TABLE scadenze_nuova RENAME TO scadenze;
CREATE INDEX scadenze_data ON scadenze(stato, data);
CREATE INDEX scadenze_sede ON scadenze(sede_id);
CREATE INDEX scadenze_contratto ON scadenze(contratto_id);
CREATE INDEX scadenze_persona ON scadenze(persona_id);
CREATE INDEX scadenze_veicolo ON scadenze(veicolo_id);
CREATE INDEX scadenze_attrezzatura ON scadenze(attrezzatura_id);

-- ------------------------------------------------------------------ file: guasti, contachilometri, firme delle consegne
-- "guasto" (foto di un guasto), "km" (foto del contachilometri), "firma_consegna" (firma di chi riceve un DPI o uno
-- strumento). Le colonne dicono a cosa sono legati.
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo', 'fattura', 'ricevuta',
    'ticket', 'caricato', 'inviato', 'guasto', 'km', 'firma_consegna')),
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
  assegnazione_id INTEGER
);
INSERT INTO file_nuova (id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id, documento_id, versione_id, ticket_id, fuori_il, fuori_no, caricato_da, svuotato)
  SELECT id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id, fattura_id, ricevuta_id, documento_id, versione_id, ticket_id, fuori_il, fuori_no, caricato_da, svuotato FROM file;
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

-- ------------------------------------------------------------------ persone
-- Chi lavora nello studio, anche chi non entra in Wisper (utente_id null). Tre livelli di dati: di lavoro, personali
-- (codice fiscale ... contatto di emergenza, contratto) e riservati (ccnl, livello, note_riservate). Li toglie il server a
-- chi non li vede (permessi.js, togliPersonali) e nel registro diventano "(riservato)".
CREATE TABLE persone (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  utente_id INTEGER UNIQUE,
  rapporto TEXT NOT NULL DEFAULT '' CHECK (rapporto IN ('', 'titolare', 'socio', 'dipendente', 'apprendista', 'tirocinante', 'autonomo', 'altro')),
  ruolo_studio TEXT NOT NULL DEFAULT '',
  mansione TEXT NOT NULL DEFAULT '',
  email_lavoro TEXT NOT NULL DEFAULT '',
  telefono_lavoro TEXT NOT NULL DEFAULT '',
  entrata_il TEXT NOT NULL DEFAULT '',
  uscita_il TEXT NOT NULL DEFAULT '',
  motivo_uscita TEXT NOT NULL DEFAULT '',
  ore_settimana REAL,
  giorni_settimana TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  contratto_tipo TEXT NOT NULL DEFAULT '' CHECK (contratto_tipo IN ('', 'indeterminato', 'determinato', 'apprendistato', 'stage', 'parasubordinato', 'partita_iva')),
  contratto_scade TEXT NOT NULL DEFAULT '',
  part_time INTEGER NOT NULL DEFAULT 0 CHECK (part_time IN (0, 1)),
  codice_fiscale TEXT NOT NULL DEFAULT '',
  nascita_data TEXT NOT NULL DEFAULT '',
  nascita_luogo TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  cap TEXT NOT NULL DEFAULT '',
  citta TEXT NOT NULL DEFAULT '',
  provincia TEXT NOT NULL DEFAULT '',
  telefono_personale TEXT NOT NULL DEFAULT '',
  email_personale TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  emergenza_nome TEXT NOT NULL DEFAULT '',
  emergenza_telefono TEXT NOT NULL DEFAULT '',
  ccnl TEXT NOT NULL DEFAULT '',
  livello TEXT NOT NULL DEFAULT '',
  note_riservate TEXT NOT NULL DEFAULT '',
  ferie_annue_ore REAL,
  permessi_annui_ore REAL,
  scadenza_contratto_id INTEGER,
  anonimizzata_il TEXT NOT NULL DEFAULT '',
  creato TEXT,
  modificato TEXT
);

-- Il costo orario con la sua storia: vale dalla data "dal" (la riga con dal piu' recente <= data del lavoro). costo_anno,
-- ore_anno e nota sono riservati (dicono lo stipendio). Non si scrive mai da solo: solo chi ha "costi" 2.
CREATE TABLE persona_costi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL REFERENCES persone(id),
  dal TEXT NOT NULL,
  costo_orario REAL NOT NULL,
  costo_anno REAL,
  ore_anno REAL,
  nota TEXT NOT NULL DEFAULT '',
  utente_id INTEGER,
  creato TEXT,
  UNIQUE (persona_id, dal)
);

-- Ferie, permessi e assenze. Le sanitarie (malattia, infortunio, congedo, legge104) nascono approvate e il loro tipo lo
-- vede solo chi ha "riservati" (e la persona): agli altri arrivano come "Assente". Mai il motivo: solo il periodo e il
-- numero del certificato (protocollo, riservato).
CREATE TABLE assenze (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  persona_id INTEGER NOT NULL REFERENCES persone(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ferie', 'permesso', 'malattia', 'infortunio', 'congedo', 'legge104', 'altro')),
  causale TEXT NOT NULL DEFAULT '',
  dal TEXT NOT NULL,
  al TEXT NOT NULL,
  mezza TEXT NOT NULL DEFAULT '' CHECK (mezza IN ('', 'mattina', 'pomeriggio')),
  dalle TEXT NOT NULL DEFAULT '',
  alle TEXT NOT NULL DEFAULT '',
  ore REAL NOT NULL DEFAULT 0,
  giorni REAL NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'da_approvare' CHECK (stato IN ('bozza', 'da_approvare', 'approvata', 'respinta', 'annullata')),
  nota TEXT NOT NULL DEFAULT '',
  protocollo TEXT NOT NULL DEFAULT '',
  approvata_da INTEGER,
  approvata_il TEXT NOT NULL DEFAULT '',
  motivo_rifiuto TEXT NOT NULL DEFAULT '',
  annullata_il TEXT NOT NULL DEFAULT '',
  motivo_annullo TEXT NOT NULL DEFAULT '',
  chiusura_id INTEGER,
  creata_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX assenze_persona ON assenze(persona_id, dal);
CREATE INDEX assenze_periodo ON assenze(dal, al);

-- Il residuo che il cedolino dice a una data, in ore (anche negativo): il saldo parte da qui.
CREATE TABLE assenze_saldi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL REFERENCES persone(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ferie', 'permessi')),
  data TEXT NOT NULL,
  ore REAL NOT NULL DEFAULT 0,
  nota TEXT NOT NULL DEFAULT '',
  utente_id INTEGER,
  creato TEXT
);
CREATE INDEX assenze_saldi_persona ON assenze_saldi(persona_id, tipo, data);

-- Le chiusure dello studio (Natale, agosto). Con ferie = 1 fanno nascere le ferie di chi le tiene.
CREATE TABLE chiusure (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL DEFAULT '',
  dal TEXT NOT NULL,
  al TEXT NOT NULL,
  ferie INTEGER NOT NULL DEFAULT 0 CHECK (ferie IN (0, 1)),
  creata_da INTEGER,
  creato TEXT
);

-- Competenze, abilitazioni e formazione: i tipi (proposte da confermare con l'RSPP e con Manuel) e quelle delle persone.
CREATE TABLE qualifica_tipi (
  chiave TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  gruppo TEXT NOT NULL DEFAULT 'altro' CHECK (gruppo IN ('elettrico', 'sicurezza', 'emergenza', 'altro')),
  ogni_mesi INTEGER,
  preavviso_giorni INTEGER,
  ordine INTEGER NOT NULL DEFAULT 0,
  attivo INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0, 1)),
  sistema INTEGER NOT NULL DEFAULT 0 CHECK (sistema IN (0, 1))
);
CREATE TABLE qualifiche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL REFERENCES persone(id),
  tipo TEXT NOT NULL,
  titolo TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  scade TEXT NOT NULL DEFAULT '',
  ente TEXT NOT NULL DEFAULT '',
  ore REAL,
  documento_id INTEGER,
  scadenza_id INTEGER,
  nota TEXT NOT NULL DEFAULT '',
  rinnovata_da INTEGER,
  tolta TEXT,
  creata_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX qualifiche_persona ON qualifiche(persona_id);

-- Le visite del medico competente: SOLO il giudizio e le date. Nessun campo per diagnosi o dati clinici.
CREATE TABLE visite_mediche (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL REFERENCES persone(id),
  data TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'periodica' CHECK (tipo IN ('preventiva', 'periodica', 'richiesta', 'cambio_mansione', 'rientro', 'cessazione')),
  giudizio TEXT NOT NULL DEFAULT '' CHECK (giudizio IN ('', 'idoneo', 'idoneo_prescrizioni', 'non_idoneo_temporaneo', 'non_idoneo')),
  prescrizioni TEXT NOT NULL DEFAULT '',
  valido_fino TEXT NOT NULL DEFAULT '',
  prossima TEXT NOT NULL DEFAULT '',
  medico TEXT NOT NULL DEFAULT '',
  documento_id INTEGER,
  scadenza_id INTEGER,
  creata_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX visite_persona ON visite_mediche(persona_id);

-- I DPI consegnati, con la firma di chi li riceve (un file "firma_consegna").
CREATE TABLE dpi_consegne (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  persona_id INTEGER NOT NULL REFERENCES persone(id),
  cosa TEXT NOT NULL DEFAULT '',
  taglia TEXT NOT NULL DEFAULT '',
  quantita INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  attrezzatura_id INTEGER,
  firma_file_id TEXT,
  firmata_il TEXT NOT NULL DEFAULT '',
  scade TEXT NOT NULL DEFAULT '',
  scadenza_id INTEGER,
  restituito_il TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  consegnata_da INTEGER,
  creato TEXT
);
CREATE INDEX dpi_consegne_persona ON dpi_consegne(persona_id);

-- Chi ha visto, scaricato, cambiato o esportato quale dato riservato di chi. Non si modifica e non si cancella.
CREATE TABLE accessi_riservati (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  utente_id INTEGER,
  persona_id INTEGER NOT NULL,
  cosa TEXT NOT NULL CHECK (cosa IN ('scheda', 'costo', 'documento', 'visita', 'assenza', 'esportazione')),
  riferimento TEXT NOT NULL DEFAULT '',
  azione TEXT NOT NULL CHECK (azione IN ('visto', 'scaricato', 'cambiato', 'esportato')),
  disp TEXT NOT NULL DEFAULT ''
);
CREATE INDEX accessi_riservati_persona ON accessi_riservati(persona_id, quando);
CREATE INDEX accessi_riservati_giorno ON accessi_riservati(utente_id, persona_id, cosa, quando);
CREATE TRIGGER accessi_riservati_non_si_modifica BEFORE UPDATE ON accessi_riservati
  BEGIN SELECT RAISE(ABORT, 'Il registro dei dati riservati non si modifica'); END;
CREATE TRIGGER accessi_riservati_non_si_cancella BEFORE DELETE ON accessi_riservati
  BEGIN SELECT RAISE(ABORT, 'Il registro dei dati riservati non si cancella'); END;

-- ------------------------------------------------------------------ mezzi e attrezzature
-- Un catalogo solo: strumenti di misura (con taratura), attrezzi, informatica, DPI con verifica, altro.
CREATE TABLE attrezzature (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codice TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nome TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'strumento' CHECK (categoria IN ('strumento', 'attrezzo', 'informatica', 'dpi', 'altro')),
  marca TEXT NOT NULL DEFAULT '',
  modello TEXT NOT NULL DEFAULT '',
  matricola TEXT NOT NULL DEFAULT '',
  proprieta TEXT NOT NULL DEFAULT 'studio' CHECK (proprieta IN ('studio', 'noleggio', 'persona', 'cliente')),
  acquistato_il TEXT NOT NULL DEFAULT '',
  fornitore_id TEXT NOT NULL DEFAULT '',
  posizione TEXT NOT NULL DEFAULT '',
  controllo TEXT NOT NULL DEFAULT '' CHECK (controllo IN ('', 'taratura', 'verifica')),
  controllo_ogni_mesi INTEGER,
  laboratorio_id TEXT NOT NULL DEFAULT '',
  fuori_uso TEXT NOT NULL DEFAULT '' CHECK (fuori_uso IN ('', 'non_conforme', 'guasto', 'perso')),
  fuori_uso_il TEXT NOT NULL DEFAULT '',
  fuori_uso_motivo TEXT NOT NULL DEFAULT '',
  dismesso_il TEXT NOT NULL DEFAULT '',
  dismesso_motivo TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  creato TEXT,
  modificato TEXT
);

-- Le tarature degli strumenti (e le verifiche dei DPI). esito non_conforme = lo strumento non si usa.
CREATE TABLE tarature (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attrezzatura_id INTEGER NOT NULL REFERENCES attrezzature(id),
  data TEXT NOT NULL,
  scade TEXT NOT NULL DEFAULT '',
  esito TEXT NOT NULL CHECK (esito IN ('conforme', 'regolato', 'non_conforme')),
  laboratorio_id TEXT NOT NULL DEFAULT '',
  certificato TEXT NOT NULL DEFAULT '',
  documento_id INTEGER,
  ricevuta_id INTEGER,
  nota TEXT NOT NULL DEFAULT '',
  utente_id INTEGER,
  creato TEXT
);
CREATE INDEX tarature_attrezzatura ON tarature(attrezzatura_id, data);

-- Chi ha cosa, da quando: assegnato (stabile), prestito (col rientro), laboratorio e riparazione (a un fornitore).
-- Una sola in corso per mezzo e per attrezzatura (indici unici parziali). In piu' dell'accordo: da_assegnazione_id (il
-- prestito interrompe un'assegnazione: restituito, la cosa torna a chi l'aveva) e id_locale_rientro (la restituzione
-- ripetuta dalla coda del telefono non chiude due volte).
CREATE TABLE assegnazioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  veicolo_id INTEGER,
  attrezzatura_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('assegnato', 'prestito', 'laboratorio', 'riparazione')),
  persona_id INTEGER,
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  soggetto_id TEXT NOT NULL DEFAULT '',
  dal TEXT NOT NULL,
  rientro TEXT NOT NULL DEFAULT '',
  al TEXT,
  firma_file_id TEXT,
  firmata_il TEXT NOT NULL DEFAULT '',
  nota TEXT NOT NULL DEFAULT '',
  da_assegnazione_id INTEGER,
  id_locale_rientro TEXT UNIQUE,
  da_utente_id INTEGER,
  creato TEXT,
  CHECK ((veicolo_id IS NULL) <> (attrezzatura_id IS NULL)),
  CHECK (persona_id IS NOT NULL OR commessa_id <> '' OR soggetto_id <> ''),
  CHECK (tipo NOT IN ('laboratorio', 'riparazione') OR soggetto_id <> '')
);
CREATE UNIQUE INDEX assegnazioni_una_veicolo ON assegnazioni(veicolo_id) WHERE al IS NULL AND veicolo_id IS NOT NULL;
CREATE UNIQUE INDEX assegnazioni_una_attrezzatura ON assegnazioni(attrezzatura_id) WHERE al IS NULL AND attrezzatura_id IS NOT NULL;
CREATE INDEX assegnazioni_persona ON assegnazioni(persona_id);

-- Guasti e manutenzioni di mezzi e attrezzature. Nessun importo scritto qui: il costo e' la spesa o la fattura ricevuta.
CREATE TABLE manutenzioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  veicolo_id INTEGER,
  attrezzatura_id INTEGER,
  tipo TEXT NOT NULL DEFAULT 'guasto' CHECK (tipo IN ('guasto', 'manutenzione', 'tagliando', 'revisione', 'riparazione', 'gomme', 'altro')),
  stato TEXT NOT NULL DEFAULT 'aperta' CHECK (stato IN ('aperta', 'in_officina', 'chiusa')),
  fermo INTEGER NOT NULL DEFAULT 0 CHECK (fermo IN (0, 1)),
  data TEXT NOT NULL,
  km INTEGER,
  titolo TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  fornitore_id TEXT NOT NULL DEFAULT '',
  spesa_id INTEGER,
  ricevuta_id INTEGER,
  chiusa_il TEXT NOT NULL DEFAULT '',
  esito TEXT NOT NULL DEFAULT '',
  segnalata_da INTEGER,
  creato TEXT,
  modificato TEXT,
  CHECK ((veicolo_id IS NULL) <> (attrezzatura_id IS NULL))
);
CREATE INDEX manutenzioni_veicolo ON manutenzioni(veicolo_id);
CREATE INDEX manutenzioni_attrezzatura ON manutenzioni(attrezzatura_id);

-- Le letture del contachilometri. In piu' dell'accordo: spesa_id e manutenzione_id (la lettura nata da un rifornimento o
-- da una manutenzione chiusa coi km).
CREATE TABLE mezzo_letture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_locale TEXT UNIQUE,
  veicolo_id INTEGER NOT NULL REFERENCES veicoli(id),
  data TEXT NOT NULL,
  km INTEGER NOT NULL,
  utente_id INTEGER,
  origine TEXT NOT NULL DEFAULT 'mano' CHECK (origine IN ('mano', 'rifornimento', 'manutenzione')),
  foto_file_id TEXT,
  nota TEXT NOT NULL DEFAULT '',
  spesa_id INTEGER,
  manutenzione_id INTEGER,
  creato TEXT
);
CREATE INDEX mezzo_letture_veicolo ON mezzo_letture(veicolo_id, data);

-- Gli strumenti usati in un rapportino (e il suo ticket), con lo stato della taratura DI QUEL GIORNO (congelato).
CREATE TABLE strumenti_usati (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attrezzatura_id INTEGER NOT NULL REFERENCES attrezzature(id),
  rapportino_id TEXT,
  ticket_id INTEGER,
  data TEXT NOT NULL,
  utente_id INTEGER,
  scade_allora TEXT NOT NULL DEFAULT '',
  stato_allora TEXT NOT NULL CHECK (stato_allora IN ('valida', 'scaduta', 'senza', 'non_conforme', 'laboratorio')),
  confermato INTEGER NOT NULL DEFAULT 0 CHECK (confermato IN (0, 1)),
  creato TEXT,
  UNIQUE (attrezzatura_id, rapportino_id)
);
CREATE INDEX strumenti_usati_rapportino ON strumenti_usati(rapportino_id);
CREATE INDEX strumenti_usati_ticket ON strumenti_usati(ticket_id);

-- ------------------------------------------------------------------ collaboratori esterni
-- La scheda del collaboratore: un fornitore (soggetti, F...) con in piu' tipo, mestiere, abilitazioni, tariffa.
CREATE TABLE collaboratori (
  soggetto_id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('impresa', 'professionista', 'occasionale')),
  mestiere TEXT NOT NULL DEFAULT '',
  abilitazioni TEXT NOT NULL DEFAULT '',
  tariffa REAL,
  referente_id INTEGER,
  attivo INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  creato TEXT,
  modificato TEXT
);

-- Gli incarichi per commessa: compenso pattuito (a corpo, o ore x tariffa con un tetto), avanzamento, valutazione.
-- Il costo vero e' la fattura ricevuta collegata (fatture_ricevute.incarico_id): mai due volte.
CREATE TABLE incarichi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  soggetto_id TEXT NOT NULL,
  commessa_id TEXT NOT NULL COLLATE NOCASE,
  prestazione_id INTEGER,
  titolo TEXT NOT NULL DEFAULT '',
  descrizione TEXT NOT NULL DEFAULT '',
  modo TEXT NOT NULL DEFAULT 'corpo' CHECK (modo IN ('corpo', 'ore')),
  compenso REAL,
  tariffa REAL,
  ore_previste REAL,
  tetto REAL,
  spese_comprese INTEGER NOT NULL DEFAULT 1 CHECK (spese_comprese IN (0, 1)),
  dal TEXT NOT NULL DEFAULT '',
  al TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'affidato', 'concluso', 'annullato')),
  affidato_il TEXT NOT NULL DEFAULT '',
  concluso_il TEXT NOT NULL DEFAULT '',
  annullato_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  avanzamento INTEGER NOT NULL DEFAULT 0 CHECK (avanzamento BETWEEN 0 AND 100),
  referente_id INTEGER,
  documento_id INTEGER,
  valutazione TEXT NOT NULL DEFAULT '' CHECK (valutazione IN ('', 'bene', 'problemi', 'male')),
  valutazione_nota TEXT NOT NULL DEFAULT '',
  valutata_da INTEGER,
  valutata_il TEXT NOT NULL DEFAULT '',
  creato_da INTEGER,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX incarichi_soggetto ON incarichi(soggetto_id);
CREATE INDEX incarichi_commessa ON incarichi(commessa_id);
