-- Servizi, indennita' e il modello della parcella (12/11/2026, docs/gestionale/servizi.md).
-- Andrea: "aggiungere anche i servizi (che devono essere raggiungibili anche dal menù laterale)" coi campi
-- dell'anagrafica prodotti/servizi di Flextaxa (il programma con cui Manuel emette le fatture), "un bottone per le
-- indennità" nei lavori del rapportino, e "i preventivi, pre-parcelle e parcelle" come il modello della parcella.
-- Non cambia niente di quello che c'e': aggiunge colonne con un valore di base.

-- ------------------------------------------------------------------ servizi
-- Il listino della fase 2 diventa l'anagrafica dei servizi: i campi di Flextaxa. prezzo resta quello di vendita.
ALTER TABLE listino ADD COLUMN tipo TEXT NOT NULL DEFAULT 'servizio' CHECK (tipo IN ('servizio', 'prodotto'));
ALTER TABLE listino ADD COLUMN aliquota_iva REAL NOT NULL DEFAULT 22;
ALTER TABLE listino ADD COLUMN prezzo_acquisto REAL;
ALTER TABLE listino ADD COLUMN aliquota_acquisto REAL NOT NULL DEFAULT 22;
ALTER TABLE listino ADD COLUMN fornitore TEXT NOT NULL DEFAULT '';
-- Le parole per cercarlo, separate da virgole ("trasferta, cantiere").
ALTER TABLE listino ADD COLUMN tag TEXT NOT NULL DEFAULT '';
-- Le note per se': non vanno nei documenti.
ALTER TABLE listino ADD COLUMN note TEXT NOT NULL DEFAULT '';
-- L'id del file dell'immagine (caricata con /carica, tipo servizio).
ALTER TABLE listino ADD COLUMN immagine TEXT NOT NULL DEFAULT '';
ALTER TABLE listino ADD COLUMN modificato TEXT;

-- ------------------------------------------------------------------ indennita' dei lavori
-- Le indennita' di un lavoro, congelate come le scrive chi fa il rapportino (JSON: [{idServizio, codice, descrizione,
-- quantita, unita, prezzo, aliquotaIva, tipo, prezzoAcquisto, aliquotaAcquisto, fornitore, tag, note, immagine,
-- importo}]); importo_indennita la loro somma, gia' dentro totale.
ALTER TABLE rapportini ADD COLUMN indennita TEXT NOT NULL DEFAULT '';
ALTER TABLE rapportini ADD COLUMN importo_indennita REAL NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------ righe delle fatture
-- Il codice del servizio (IND-TR, DL) e lo sconto in percento, come le righe di Flextaxa e dell'XML
-- (CodiceArticolo, ScontoMaggiorazione).
ALTER TABLE fattura_righe ADD COLUMN codice TEXT NOT NULL DEFAULT '';
ALTER TABLE fattura_righe ADD COLUMN sconto REAL NOT NULL DEFAULT 0;

-- ------------------------------------------------------------------ dati del modello della parcella
-- Sul conto: il BIC e il beneficiario (chi incassa, diverso dal nome dello studio).
ALTER TABLE conti ADD COLUMN bic TEXT NOT NULL DEFAULT '';
ALTER TABLE conti ADD COLUMN beneficiario TEXT NOT NULL DEFAULT '';
-- Come il cliente chiama la commessa nei documenti ("JOB"); vuoto = "Commessa".
ALTER TABLE soggetti ADD COLUMN etichetta_commessa TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('STUDIO_QUALIFICA', '""', 'La qualifica sotto il nome dello studio nei documenti (per esempio Perito Industriale)');

-- ------------------------------------------------------------------ file: il tipo "servizio" (l'immagine di un servizio)
-- Come la 008 (il tipo "logo"): la tabella si rifa' identica, con un tipo in piu'.
CREATE TABLE file_nuova (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  byte INTEGER,
  sha256 TEXT,
  percorso TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('spesa', 'firma', 'firmaTecnico', 'documento', 'attivita', 'preventivo', 'fattura', 'ricevuta',
    'ticket', 'caricato', 'inviato', 'guasto', 'km', 'firma_consegna', 'portale', 'logo', 'servizio')),
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
