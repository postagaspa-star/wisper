-- Fase 4 del gestionale (ottobre 2026): fatturazione, banche e scadenze.
-- L'accordo e' in docs/gestionale/fase4.md §4; le risposte in architettura.md §15.
-- Come nelle altre: importi in euro come numeri decimali arrotondati al centesimo, date "aaaa-mm-gg", istanti ISO col fuso.
-- Le tabelle da cui si tolgono righe hanno AUTOINCREMENT: un id tolto non torna mai a un'altra riga.
-- Dopo questo file gira 004-fatture-banche.js: le commesse con scadenze di pagamento diventano "a corpo".
--
-- Il punto piu' importante: UNA COSA SI FATTURA UNA VOLTA SOLA, e lo garantisce il database. Ogni cosa da
-- fatturare (scadenza, rapportino, spesa, ore) entra in una fattura solo da fattura_sorgenti, che ha un indice
-- unico sulle righe attive (fattura_sorgenti_una): la stessa sorgente non puo' stare in due fatture vive.

-- ------------------------------------------------------------------ impostazioni fiscali e bancarie
-- Le regole fiscali vanno confermate dal commercialista: finche' REGOLE_FISCALI_CONFERMATE e' null, ogni conto lo dice.
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('REGIME_FISCALE', '"RF01"', 'Il regime fiscale dello studio: RF01 ordinario, RF19 forfettario. Da confermare col commercialista.'),
  ('TIPO_DOCUMENTO', '"TD01"', 'Il tipo di documento delle fatture: TD01 fattura o TD06 parcella. Da chiedere al commercialista.'),
  ('RITENUTA_TIPO', '"RT01"', 'Il codice della ritenuta nella fattura elettronica (RT01: persone fisiche).'),
  ('RITENUTA_CAUSALE', '"A"', 'La causale del pagamento per la ritenuta (A: lavoro autonomo abituale, modello CU).'),
  ('EPPI_TIPO_CASSA', '"TC17"', 'Il codice della cassa previdenziale nella fattura elettronica (TC17: EPPI).'),
  ('BOLLO_SOGLIA', '77.47', 'Il bollo scatta quando la parte senza IVA della fattura supera questa cifra.'),
  ('BOLLO_IMPORTO', '2', 'L''imposta di bollo delle fatture elettroniche, in euro.'),
  ('BOLLO_RIVALSA', 'true', 'Il bollo si riaddebita al cliente (una riga senza IVA nella fattura).'),
  ('GIORNI_PAGAMENTO', '30', 'Quanti giorni ha il cliente per pagare: scadenza = data della fattura + giorni.'),
  ('PAGAMENTO_FINE_MESE', 'false', 'La scadenza va alla fine del mese (dopo i giorni di pagamento).'),
  ('MODALITA_PAGAMENTO', '"MP05"', 'Come si fa pagare lo studio: MP05 bonifico.'),
  ('PASSAGGIO_USCITE', '["prospetto","xml"]', 'Cosa si passa al programma delle fatture: il prospetto da copiare e l''XML da completare.'),
  ('SOGLIA_CASSA', '3000', 'Sotto questo saldo previsto il giorno dello scadenziario e'' rosso.'),
  ('REGOLE_FISCALI_CONFERMATE', 'null', 'Quando e chi ha confermato le regole fiscali (lo segna il titolare). Cambiare una regola toglie la conferma.'),
  ('CODICE_FISCALE', '""', 'Il codice fiscale dello studio, per le fatture.'),
  ('STUDIO_CAP', '""', 'Il CAP della sede dello studio, per le fatture.'),
  ('STUDIO_COMUNE', '""', 'Il comune della sede dello studio, per le fatture.'),
  ('STUDIO_PROVINCIA', '""', 'La provincia della sede dello studio (due lettere), per le fatture.'),
  ('ALBO', '""', 'L''albo professionale, per esempio "Periti industriali".'),
  ('ALBO_PROVINCIA', '""', 'La provincia dell''albo (due lettere).'),
  ('ALBO_NUMERO', '""', 'Il numero di iscrizione all''albo.'),
  ('ALBO_DATA', '""', 'La data di iscrizione all''albo.');

-- ------------------------------------------------------------------ colonne nuove su tabelle che ci sono
-- sostituto_imposta: null = automatico (si' con la partita IVA, no senza); 0/1 scritto a mano.
ALTER TABLE soggetti ADD COLUMN sostituto_imposta INTEGER;
ALTER TABLE soggetti ADD COLUMN pagamento_giorni INTEGER;
ALTER TABLE soggetti ADD COLUMN pagamento_fine_mese INTEGER;

-- Come si fattura la commessa: a ore (rapportini e ore), a corpo (le scadenze del contratto), misto (tutti e due).
ALTER TABLE commesse ADD COLUMN modo_fatturazione TEXT NOT NULL DEFAULT 'ore' CHECK (modo_fatturazione IN ('ore', 'corpo', 'misto'));

-- stato: prevista | fatturata (con la fattura che l'ha fatturata; null se fatturata fuori da Wisper).
ALTER TABLE scadenze_pagamento ADD COLUMN fattura_id INTEGER;

ALTER TABLE ore ADD COLUMN fatturata_il TEXT NOT NULL DEFAULT '';

-- La stessa tabella delle ricorrenze serve agli impegni ricorrenti (affitto, F24 di ogni mese).
ALTER TABLE ricorrenze ADD COLUMN per TEXT NOT NULL DEFAULT 'attivita' CHECK (per IN ('attivita', 'impegno'));

-- ------------------------------------------------------------------ conti in banca
-- iban intero (serve al prospetto); nelle schermate si mostra solo "…4521". Uno solo predefinito.
CREATE TABLE conti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL DEFAULT '',
  banca TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  predefinito INTEGER NOT NULL DEFAULT 0,
  soglia REAL,
  attivo INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  creato TEXT,
  modificato TEXT
);
CREATE UNIQUE INDEX conti_un_predefinito ON conti(predefinito) WHERE predefinito = 1;

-- Il saldo letto sull'estratto conto in quel giorno, scritto a mano: e' il punto da cui si contano i movimenti.
CREATE TABLE conto_saldi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conto_id INTEGER NOT NULL REFERENCES conti(id),
  data TEXT NOT NULL,
  saldo REAL NOT NULL,
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT
);
CREATE INDEX conto_saldi_conto ON conto_saldi(conto_id, data);

-- ------------------------------------------------------------------ fatture emesse (e note di credito)
-- Dalla bozza in poi. riferimento = 'W-' || id (il riferimento di Wisper, mai un numero fiscale: il numero lo da'
-- il programma). chiave = partitaIvaStudio|tipoDocumento|anno|numero dopo l'emissione, contro i doppioni.
-- I parametri fiscali sono congelati alla creazione: cambiare un'impostazione non riscrive una bozza gia' fatta.
-- totale_bozza/netto_bozza: i conti della bozza, tenuti quando l'XML emesso e' diverso.
CREATE TABLE fatture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  riferimento TEXT UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'fattura' CHECK (tipo IN ('fattura', 'nota')),
  tipo_documento TEXT NOT NULL DEFAULT 'TD01',
  fattura_collegata_id INTEGER REFERENCES fatture(id),
  cliente_id TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'pronta', 'emessa', 'scartata', 'annullata')),
  data TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  numero_da TEXT NOT NULL DEFAULT '' CHECK (numero_da IN ('', 'xml', 'mano')),
  chiave TEXT UNIQUE,
  causale TEXT NOT NULL DEFAULT '',
  note_interne TEXT NOT NULL DEFAULT '',
  regime TEXT NOT NULL DEFAULT 'ordinario' CHECK (regime IN ('ordinario', 'forfettario')),
  iva_percentuale REAL NOT NULL DEFAULT 0,
  eppi_percentuale REAL NOT NULL DEFAULT 0,
  ritenuta_percentuale REAL NOT NULL DEFAULT 0,
  ritenuta_applicata INTEGER NOT NULL DEFAULT 0,
  bollo_soglia REAL NOT NULL DEFAULT 77.47,
  bollo_importo REAL NOT NULL DEFAULT 2,
  bollo_rivalsa INTEGER NOT NULL DEFAULT 1,
  compenso REAL NOT NULL DEFAULT 0,
  contributo REAL NOT NULL DEFAULT 0,
  base_iva REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  anticipazioni REAL NOT NULL DEFAULT 0,
  bollo REAL NOT NULL DEFAULT 0,
  bollo_addebitato REAL NOT NULL DEFAULT 0,
  totale REAL NOT NULL DEFAULT 0,
  ritenuta REAL NOT NULL DEFAULT 0,
  netto REAL NOT NULL DEFAULT 0,
  totale_bozza REAL,
  netto_bozza REAL,
  giorni_pagamento INTEGER,
  fine_mese INTEGER NOT NULL DEFAULT 0,
  scadenza_a_mano INTEGER NOT NULL DEFAULT 0,
  conto_id INTEGER REFERENCES conti(id),
  modalita_pagamento TEXT NOT NULL DEFAULT 'MP05',
  pronta_il TEXT NOT NULL DEFAULT '',
  pronta_da INTEGER REFERENCES utenti(id),
  emessa_il TEXT NOT NULL DEFAULT '',
  file_id TEXT,
  nome_file_sdi TEXT NOT NULL DEFAULT '',
  esito_sdi TEXT NOT NULL DEFAULT '' CHECK (esito_sdi IN ('', 'consegnata', 'non_consegnata', 'scartata')),
  esito_il TEXT NOT NULL DEFAULT '',
  avviso_inviato_il TEXT NOT NULL DEFAULT '',
  scartata_il TEXT NOT NULL DEFAULT '',
  annullata_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  regole_confermate TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT,
  modificato TEXT
);
CREATE INDEX fatture_cliente ON fatture(cliente_id);
CREATE INDEX fatture_stato ON fatture(stato, data);
CREATE INDEX fatture_collegata ON fatture(fattura_collegata_id);
CREATE INDEX fatture_nome_file ON fatture(nome_file_sdi);
-- Il riferimento di Wisper lo scrive il database: W- e il numero interno, sempre.
CREATE TRIGGER fatture_riferimento AFTER INSERT ON fatture WHEN NEW.riferimento IS NULL
BEGIN UPDATE fatture SET riferimento = 'W-' || NEW.id WHERE id = NEW.id; END;

-- origine: bozza (preparata in Wisper) | xml (letta dall'XML emesso). gruppo: le righe nate insieme dalle stesse
-- sorgenti ('' per una riga libera). tipo bollo: la mette e la toglie il server quando rifa' i conti.
CREATE TABLE fattura_righe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fattura_id INTEGER NOT NULL REFERENCES fatture(id),
  ordine INTEGER NOT NULL DEFAULT 0,
  origine TEXT NOT NULL DEFAULT 'bozza' CHECK (origine IN ('bozza', 'xml')),
  gruppo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'compenso' CHECK (tipo IN ('compenso', 'anticipazione', 'bollo')),
  descrizione TEXT NOT NULL DEFAULT '',
  quantita REAL,
  unita TEXT NOT NULL DEFAULT '',
  prezzo REAL,
  importo REAL NOT NULL DEFAULT 0,
  aliquota_iva REAL NOT NULL DEFAULT 0,
  natura TEXT NOT NULL DEFAULT '',
  soggetta_ritenuta INTEGER NOT NULL DEFAULT 0,
  tributo_cliente INTEGER NOT NULL DEFAULT 0,
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  periodo_da TEXT NOT NULL DEFAULT '',
  periodo_a TEXT NOT NULL DEFAULT '',
  importo_sorgenti REAL
);
CREATE INDEX fattura_righe_fattura ON fattura_righe(fattura_id, origine, ordine);

-- Una sorgente (scadenza, rapportino, spesa, ore) dentro una fattura. attiva = 1: riservata (bozza, pronta) o
-- fatturata (emessa). Torna libera (attiva = 0, con quando e perche') solo togliendo il suo gruppo dalla bozza,
-- scartando la bozza o con una nota di credito.
CREATE TABLE fattura_sorgenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fattura_id INTEGER NOT NULL REFERENCES fatture(id),
  gruppo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('scadenza', 'rapportino', 'spesa', 'ore')),
  sorgente_id TEXT NOT NULL,
  importo REAL,
  attiva INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0, 1)),
  creato TEXT,
  liberata_il TEXT NOT NULL DEFAULT '',
  liberata_perche TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX fattura_sorgenti_una ON fattura_sorgenti(tipo, sorgente_id) WHERE attiva = 1;
CREATE INDEX fattura_sorgenti_fattura ON fattura_sorgenti(fattura_id, gruppo);

-- Le rate: per una bozza una sola, calcolata; dopo l'emissione quelle dell'XML (DettaglioPagamento).
CREATE TABLE fattura_scadenze (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fattura_id INTEGER NOT NULL REFERENCES fatture(id),
  ordine INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '',
  importo REAL NOT NULL DEFAULT 0,
  modalita TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT ''
);
CREATE INDEX fattura_scadenze_fattura ON fattura_scadenze(fattura_id, ordine);

-- ------------------------------------------------------------------ fatture ricevute dai fornitori
-- ritenuta: quella che lo studio trattiene e versa (F24 1040); netto: quanto si paga al fornitore.
-- spesa_id: la stessa spesa gia' fotografata nella fase 3, per non contarla due volte nei costi.
CREATE TABLE fatture_ricevute (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornitore_id TEXT NOT NULL DEFAULT '',
  tipo_documento TEXT NOT NULL DEFAULT 'TD01',
  numero TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  chiave TEXT UNIQUE,
  descrizione TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'altro' CHECK (categoria IN ('materiale', 'consulenze', 'servizi', 'utenze', 'affitto', 'altro')),
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  spesa_id INTEGER,
  imponibile REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  contributo REAL NOT NULL DEFAULT 0,
  bollo REAL NOT NULL DEFAULT 0,
  totale REAL NOT NULL DEFAULT 0,
  ritenuta REAL NOT NULL DEFAULT 0,
  netto REAL NOT NULL DEFAULT 0,
  ricevuta_collegata_id INTEGER REFERENCES fatture_ricevute(id),
  stato TEXT NOT NULL DEFAULT 'attiva' CHECK (stato IN ('attiva', 'annullata')),
  origine TEXT NOT NULL DEFAULT 'mano' CHECK (origine IN ('xml', 'mano')),
  file_id TEXT,
  nome_file_sdi TEXT NOT NULL DEFAULT '',
  scadenza_stimata INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT,
  modificato TEXT
);
CREATE INDEX fatture_ricevute_fornitore ON fatture_ricevute(fornitore_id);

CREATE TABLE ricevuta_scadenze (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ricevuta_id INTEGER NOT NULL REFERENCES fatture_ricevute(id),
  ordine INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '',
  importo REAL NOT NULL DEFAULT 0,
  modalita TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ricevuta_scadenze_ricevuta ON ricevuta_scadenze(ricevuta_id, ordine);

-- ------------------------------------------------------------------ impegni: tributi, F24, rate
-- importo null = da scrivere. origine: mano | ritenute (proposta 1040) | bollo (proposta del bollo trimestrale).
-- Le proposte di Wisper nascono con confermato = 0. Nessun impegno si cancella: si annulla.
CREATE TABLE impegni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'tributo' CHECK (tipo IN ('f24', 'tributo', 'rata', 'altro')),
  verso TEXT NOT NULL DEFAULT 'uscita' CHECK (verso IN ('entrata', 'uscita')),
  descrizione TEXT NOT NULL DEFAULT '',
  codice TEXT NOT NULL DEFAULT '',
  scadenza TEXT NOT NULL DEFAULT '',
  importo REAL,
  conto_id INTEGER REFERENCES conti(id),
  soggetto_id TEXT NOT NULL DEFAULT '',
  ricorrenza_id INTEGER REFERENCES ricorrenze(id),
  occorrenza TEXT NOT NULL DEFAULT '',
  origine TEXT NOT NULL DEFAULT 'mano' CHECK (origine IN ('mano', 'ritenute', 'bollo')),
  periodo TEXT NOT NULL DEFAULT '',
  confermato INTEGER NOT NULL DEFAULT 1,
  annullato INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT,
  modificato TEXT
);
CREATE INDEX impegni_scadenza ON impegni(scadenza);
CREATE UNIQUE INDEX impegni_occorrenza ON impegni(ricorrenza_id, occorrenza) WHERE ricorrenza_id IS NOT NULL;
-- Una proposta sola per periodo (le ritenute di ottobre, il bollo del terzo trimestre).
CREATE UNIQUE INDEX impegni_proposta ON impegni(origine, periodo) WHERE origine <> 'mano';

-- ------------------------------------------------------------------ movimenti in banca e abbinamenti
-- Scritti a mano; verificato = visto sull'estratto conto. Nessun movimento si cancella: si annulla.
CREATE TABLE movimenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conto_id INTEGER NOT NULL REFERENCES conti(id),
  data TEXT NOT NULL,
  verso TEXT NOT NULL CHECK (verso IN ('entrata', 'uscita')),
  importo REAL NOT NULL CHECK (importo > 0),
  descrizione TEXT NOT NULL DEFAULT '',
  soggetto_id TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'altro' CHECK (categoria IN ('incasso', 'pagamento', 'tributo', 'stipendio', 'giroconto', 'altro')),
  verificato INTEGER NOT NULL DEFAULT 0,
  verificato_il TEXT NOT NULL DEFAULT '',
  verificato_da INTEGER REFERENCES utenti(id),
  annullato INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT '',
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT,
  modificato TEXT
);
CREATE INDEX movimenti_conto ON movimenti(conto_id, data);

-- Un bonifico puo' pagare piu' fatture; una fattura puo' avere piu' incassi. Uno solo dei tre collegamenti.
CREATE TABLE movimento_abbinamenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movimento_id INTEGER NOT NULL REFERENCES movimenti(id),
  fattura_id INTEGER REFERENCES fatture(id),
  ricevuta_id INTEGER REFERENCES fatture_ricevute(id),
  impegno_id INTEGER REFERENCES impegni(id),
  importo REAL NOT NULL CHECK (importo > 0),
  creato TEXT,
  CHECK ((fattura_id IS NOT NULL) + (ricevuta_id IS NOT NULL) + (impegno_id IS NOT NULL) = 1)
);
CREATE INDEX movimento_abbinamenti_movimento ON movimento_abbinamenti(movimento_id);
CREATE INDEX movimento_abbinamenti_fattura ON movimento_abbinamenti(fattura_id);
CREATE INDEX movimento_abbinamenti_ricevuta ON movimento_abbinamenti(ricevuta_id);
CREATE INDEX movimento_abbinamenti_impegno ON movimento_abbinamenti(impegno_id);

-- ------------------------------------------------------------------ letture degli XML (in attesa di conferma)
-- leggiXml non cambia niente: tiene qui per un'ora quello che ha capito e i file. Non va nel registro.
CREATE TABLE letture_xml (
  id TEXT PRIMARY KEY,
  utente_id INTEGER REFERENCES utenti(id),
  creato TEXT NOT NULL,
  scade TEXT NOT NULL,
  documenti TEXT NOT NULL DEFAULT '[]',
  cartella TEXT NOT NULL DEFAULT ''
);

-- ------------------------------------------------------------------ file: due tipi nuovi
-- "fattura" (l'XML o il .p7m di una fattura o nota emessa) e "ricevuta" (di una fattura ricevuta).
-- SQLite non cambia un CHECK: la tabella si rifa' uguale (con le colonne delle fasi 2 e 3) e si ricopia.
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo', 'fattura', 'ricevuta')),
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
  ricevuta_id INTEGER
);
INSERT INTO file_nuova (id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id)
  SELECT id, nome, mime, byte, sha256, percorso, tipo, rapportino_id, commessa_id, id_client, drive_url, creato, cestinato,
    attivita_id, preventivo_id, spesa_id FROM file;
DROP TABLE file;
ALTER TABLE file_nuova RENAME TO file;
CREATE INDEX file_rapportino ON file(rapportino_id, tipo);
CREATE INDEX file_commessa ON file(commessa_id);
CREATE INDEX file_attivita ON file(attivita_id);
CREATE INDEX file_preventivo ON file(preventivo_id);
CREATE INDEX file_spesa ON file(spesa_id);
CREATE INDEX file_fattura ON file(fattura_id);
CREATE INDEX file_ricevuta ON file(ricevuta_id);
