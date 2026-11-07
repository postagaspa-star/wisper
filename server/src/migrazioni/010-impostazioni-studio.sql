-- 06/11/2026: due impostazioni nuove dei Dati dello studio e il registro dei salvataggi automatici.
-- Si puo' fare sul database vero (schema 9, con gli account): aggiunge due righe alle impostazioni (se non ci sono gia')
-- e una tabella vuota; niente di quello che c'e' si cambia o si cancella.

-- ------------------------------------------------------------------ impostazioni nuove (valore in JSON)
-- STUDIO_SDI: il codice destinatario SDI dello studio (7 lettere o cifre, vuoto = non scritto), per ricevere le fatture.
-- PDF_NOME: il nome dello studio accanto al logo in cima ai PDF (di base si').
INSERT OR IGNORE INTO impostazioni (chiave, valore, descrizione) VALUES
  ('STUDIO_SDI', '""', 'Codice SDI dello studio, per ricevere le fatture'),
  ('PDF_NOME', 'true', 'Nome dello studio accanto al logo nei PDF');

-- ------------------------------------------------------------------ registro: i salvataggi automatici
-- Le app salvano le impostazioni da sole mentre si scrive (una chiave alla volta, anche ogni secondo). I salvataggi di
-- fila della stessa impostazione, della stessa persona dallo stesso dispositivo, a meno di 2 minuti uno dall'altro,
-- diventano UNA riga del registro: prima = il valore di prima del primo salvataggio, dopo = l'ultimo. Il registro non si
-- modifica (trigger registro_non_si_modifica): la riga aspetta qui finche' la serie e' finita (un'altra impostazione, 2
-- minuti fermi, qualcuno che apre il registro, il server che si spegne o riparte) e poi va nel registro con l'ora
-- dell'ultimo salvataggio. Una serie che torna al valore di partenza non lascia righe: alla fine non e' cambiato niente.
CREATE TABLE registro_in_attesa (
  -- "<id utente>|<dispositivo>|<tabella>|<riga>"
  chiave TEXT PRIMARY KEY,
  -- L'ultimo salvataggio, in millisecondi (per i 2 minuti) e come istante (quello che va nel registro).
  ultimo_ms INTEGER NOT NULL,
  quando TEXT NOT NULL,
  volte INTEGER NOT NULL DEFAULT 1,
  utente_id INTEGER,
  utente TEXT NOT NULL DEFAULT '',
  disp TEXT NOT NULL DEFAULT '',
  azione TEXT NOT NULL DEFAULT '',
  tabella TEXT NOT NULL,
  id_riga TEXT NOT NULL DEFAULT '',
  prima TEXT,
  dopo TEXT
);
