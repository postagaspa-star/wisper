-- Fase 3 del gestionale (ottobre 2026): ore senza rapportino, timer, approvazioni, spese, trasferte,
-- veicoli e rimborsi. L'accordo e' in docs/gestionale/fase3.md §3; le risposte in architettura.md §14.
-- Come nelle altre: importi in euro come numeri decimali, date "aaaa-mm-gg", istanti ISO col fuso.
-- Le righe di ore, spese e trasferte non si cancellano: "tolta" (l'istante) le toglie dagli elenchi e dai conti.
-- Dopo questo file gira 003-ore-spese.js: le spese gia' scritte nei rapportini diventano righe "spese".

-- ------------------------------------------------------------------ impostazioni nuove
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('APPROVAZIONE', '"collaboratori"', 'Chi deve far approvare ore, rapportini, spese e trasferte: collaboratori (di base), tutti o nessuno.'),
  ('ACI_ANNO', '2026', 'L''anno delle tabelle ACI dei rimborsi km dei veicoli. Dall''anno nuovo la Dashboard chiede di aggiornarle.'),
  ('INDENNITA_TRASFERTA', '""', 'L''indennità proposta per ogni giorno di trasferta, in euro. Vuota: nessuna.'),
  ('ORE_GIORNALIERE', '8', 'Le ore di una giornata normale. Più di queste 4 in un giorno è un''anomalia da guardare prima di approvare.');

-- ------------------------------------------------------------------ veicoli
-- Il veicolo e il suo rimborso al km (tabella ACI di anno_aci). Il primo nasce dall'auto delle impostazioni
-- (AUTO, EURO_KM) all'avvio del server (wisper.js, prepara): qui la tabella puo' essere ancora vuota.
-- Dalla fase 6 il modulo Mezzi ne fa la scheda completa.
CREATE TABLE veicoli (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL DEFAULT '',
  alimentazione TEXT NOT NULL DEFAULT '',
  euro_km REAL,
  anno_aci INTEGER,
  attivo INTEGER NOT NULL DEFAULT 1,
  creato TEXT,
  modificato TEXT
);

-- ------------------------------------------------------------------ ore
-- Le ore senza rapportino (ufficio, progettazione, attivita' dello studio). inizio/fine sono ore del giorno
-- ("08:30"): una fine prima dell'inizio e' del giorno dopo (lavoro a cavallo della mezzanotte), e la riga resta
-- del giorno in cui e' cominciato. "ore" = da inizio, fine e pausa, oppure scritte a mano. costo_orario e' quello
-- del giorno in cui la riga nasce: cambiare le impostazioni non riscrive il passato.
-- commessa_id vuoto = attivita' dello studio.
CREATE TABLE ore (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER NOT NULL REFERENCES utenti(id),
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
  modificato TEXT
);
CREATE INDEX ore_utente_data ON ore(utente_id, data);
CREATE INDEX ore_commessa ON ore(commessa_id);

-- Un timer acceso per persona: sopravvive al riavvio (sta qui, non in memoria). Fermarlo crea la riga "ore" in bozza.
CREATE TABLE timer (
  utente_id INTEGER PRIMARY KEY REFERENCES utenti(id),
  partito_il TEXT NOT NULL,
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  prestazione_id INTEGER,
  attivita_id INTEGER,
  descrizione TEXT NOT NULL DEFAULT '',
  fatturabile INTEGER NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------------ trasferte
-- km = quelli scritti; con andata_ritorno contano due volte. euro_km e il nome del veicolo sono congelati alla
-- nascita (o quando cambia il veicolo): aggiornare l'ACI a gennaio non riscrive le trasferte vecchie.
-- motivo = perche' si e' andati; motivo_rifiuto = perche' chi approva l'ha respinta.
CREATE TABLE trasferte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER REFERENCES utenti(id),
  dal TEXT NOT NULL DEFAULT '',
  al TEXT NOT NULL DEFAULT '',
  destinazione TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  cliente_id TEXT NOT NULL DEFAULT '',
  km REAL NOT NULL DEFAULT 0,
  andata_ritorno INTEGER NOT NULL DEFAULT 0,
  veicolo_id INTEGER REFERENCES veicoli(id),
  veicolo TEXT NOT NULL DEFAULT '',
  euro_km REAL,
  indennita REAL NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'da_approvare', 'approvata', 'respinta')),
  approvata_da INTEGER REFERENCES utenti(id),
  approvata_il TEXT NOT NULL DEFAULT '',
  motivo_rifiuto TEXT NOT NULL DEFAULT '',
  rimborsata_il TEXT NOT NULL DEFAULT '',
  tolta TEXT,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX trasferte_utente ON trasferte(utente_id, dal);
CREATE INDEX trasferte_commessa ON trasferte(commessa_id);

-- ------------------------------------------------------------------ spese
-- Una spesa per scontrino; le foto sono i file "spesa" col suo spesa_id. destinazione: cliente (va nel conto del
-- cliente), studio, personale ("Mia"). anticipazione = documento intestato al cliente (art. 15), solo per cliente.
-- Le spese di un rapportino (rapportino_id) seguono la sua approvazione; la colonna rapportini.spese resta il
-- totale delle sue spese al cliente. dal_rapportino = la riga dell'importo scritto nel passo 3 del rapportino.
CREATE TABLE spese (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utente_id INTEGER REFERENCES utenti(id),
  data TEXT NOT NULL DEFAULT '',
  importo REAL NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT 'altro' CHECK (categoria IN ('carburante', 'pedaggio', 'parcheggio', 'vitto', 'alloggio', 'treno',
    'aereo', 'taxi', 'materiale', 'altro')),
  descrizione TEXT NOT NULL DEFAULT '',
  commessa_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  cliente_id TEXT NOT NULL DEFAULT '',
  rapportino_id TEXT REFERENCES rapportini(id),
  trasferta_id INTEGER REFERENCES trasferte(id),
  destinazione TEXT NOT NULL DEFAULT 'studio' CHECK (destinazione IN ('cliente', 'studio', 'personale')),
  anticipazione INTEGER NOT NULL DEFAULT 0,
  pagata_da_me INTEGER NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'da_approvare', 'approvata', 'respinta')),
  approvata_da INTEGER REFERENCES utenti(id),
  approvata_il TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  rimborsata_il TEXT NOT NULL DEFAULT '',
  fatturata_il TEXT NOT NULL DEFAULT '',
  dal_rapportino INTEGER NOT NULL DEFAULT 0,
  id_locale TEXT UNIQUE,
  tolta TEXT,
  creato TEXT,
  modificato TEXT
);
CREATE INDEX spese_utente ON spese(utente_id, data);
CREATE INDEX spese_rapportino ON spese(rapportino_id);
CREATE INDEX spese_trasferta ON spese(trasferta_id);
CREATE INDEX spese_commessa ON spese(commessa_id);

-- ------------------------------------------------------------------ rapportini: l'approvazione
-- '' = non serve (tutti quelli di prima), da_approvare, approvato, respinto (con il motivo). Gli stati del
-- rapportino non cambiano; uno da approvare non si manda al cliente e non si fattura finche' non e' approvato.
ALTER TABLE rapportini ADD COLUMN stato_approvazione TEXT NOT NULL DEFAULT ''
  CHECK (stato_approvazione IN ('', 'da_approvare', 'approvato', 'respinto'));
ALTER TABLE rapportini ADD COLUMN approvato_da INTEGER REFERENCES utenti(id);
ALTER TABLE rapportini ADD COLUMN approvato_il TEXT NOT NULL DEFAULT '';
ALTER TABLE rapportini ADD COLUMN motivo TEXT NOT NULL DEFAULT '';

-- ------------------------------------------------------------------ file: la foto di una spesa
ALTER TABLE file ADD COLUMN spesa_id INTEGER;
CREATE INDEX file_spesa ON file(spesa_id);
