// Fase 4: la migrazione 004 (fatture, banche e scadenze) su un database della fase 3. La copia wisper.db.prima-4,
// i dati di prima che restano (file compresi: la tabella si rifa' per i tipi nuovi), le commesse con le scadenze di
// pagamento che diventano "a corpo" (con la riga nel registro), le impostazioni fiscali e bancarie, le tabelle nuove.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova } = require('./aiuto');
const { Database } = require('../src/db');
const { Wisper } = require('../src/wisper');

const MIGRAZIONI = path.join(__dirname, '..', 'src', 'migrazioni');

test('migrazione 004 su un database della fase 3: copia prima-4, dati e file conservati, commesse a corpo, impostazioni', () => {
  const dati = cartellaNuova('004');
  // Le migrazioni fino alla 003 (la sua parte .js vuole ../utili accanto, come in src).
  const cartella = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(cartella, { recursive: true });
  fs.copyFileSync(path.join(MIGRAZIONI, '..', 'utili.js'), path.join(dati, 'src', 'utili.js'));
  for (const f of fs.readdirSync(MIGRAZIONI).filter(x => /^00[123]-/.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(cartella, f));
  const file = path.join(dati, 'wisper.db');
  let db = new Database(file);
  db.migra(cartella);
  assert.equal(db.versione(), 3);
  db.esegui("INSERT INTO soggetti (id, nome, partita_iva) VALUES ('C001', 'Cliente con contratto', '01234567897')");
  db.esegui("INSERT INTO commesse (id, cliente_id, descrizione) VALUES ('26ST001', 'C001', 'Con le scadenze'), ('26ST002', 'C001', 'A ore')");
  db.esegui("INSERT INTO scadenze_pagamento (commessa_id, descrizione, tipo, valore, quando, importo) VALUES ('26st001', '30% alla firma', 'percentuale', 30, 'firma', 300)");
  db.esegui("INSERT INTO rapportini (id, stato) VALUES ('RAP/2026/0001', 'FIRMATO')");
  db.esegui("INSERT INTO file (id, tipo, rapportino_id, creato, spesa_id) VALUES ('f1', 'spesa', 'RAP/2026/0001', '2026-10-21T10:00:00+02:00', 7)");
  db.esegui("INSERT INTO file (id, tipo, attivita_id, creato) VALUES ('f2', 'attivita', 3, 'x')");
  db.esegui("INSERT INTO impostazioni (chiave, valore) VALUES ('BOLLO_SOGLIA', '80')");
  db.chiudi();

  const w = new Wisper({ dati });
  try {
    assert.equal(w.db.versione(), 4);
    assert.ok(fs.existsSync(file + '.prima-4'), 'la copia prima della migrazione');
    // Le commesse: a corpo quella con le scadenze di pagamento (anche scritte in minuscolo), a ore l'altra.
    assert.deepEqual(w.db.righe('SELECT id, modo_fatturazione FROM commesse ORDER BY id').map(r => [r.id, r.modo_fatturazione]), [['26ST001', 'corpo'], ['26ST002', 'ore']]);
    const reg = w.db.riga("SELECT * FROM registro WHERE tabella = 'commesse' AND id_riga = '26ST001'");
    assert.deepEqual([reg.utente, reg.azione, JSON.parse(reg.dopo).modo_fatturazione], ['sistema', 'migrazione', 'corpo']);
    assert.match(reg.nota, /^migrazione 004/);
    // I file: le righe di prima con le loro colonne (anche spesa_id e attivita_id), i tipi nuovi ammessi.
    assert.deepEqual({ ...w.db.riga("SELECT id, tipo, rapportino_id, spesa_id, fattura_id FROM file WHERE id = 'f1'") }, { id: 'f1', tipo: 'spesa', rapportino_id: 'RAP/2026/0001', spesa_id: 7, fattura_id: null });
    assert.equal(w.db.riga("SELECT attivita_id FROM file WHERE id = 'f2'").attivita_id, 3);
    w.db.esegui("INSERT INTO file (id, tipo, fattura_id, creato) VALUES ('f3', 'fattura', 1, 'x')");
    w.db.esegui("INSERT INTO file (id, tipo, ricevuta_id, creato) VALUES ('f4', 'ricevuta', 1, 'x')");
    assert.throws(() => w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('f5', 'boh', 'x')"), /CHECK/);
    // Le impostazioni nuove, senza toccare quelle gia' scritte; le regole non confermate.
    const imp = w.leggiImpostazioni();
    assert.equal(imp.BOLLO_SOGLIA, 80, 'un valore gia\' scritto non si tocca');
    assert.deepEqual([imp.REGIME_FISCALE, imp.TIPO_DOCUMENTO, imp.RITENUTA_TIPO, imp.RITENUTA_CAUSALE, imp.EPPI_TIPO_CASSA, imp.BOLLO_IMPORTO, imp.BOLLO_RIVALSA,
      imp.GIORNI_PAGAMENTO, imp.PAGAMENTO_FINE_MESE, imp.MODALITA_PAGAMENTO, imp.SOGLIA_CASSA, imp.REGOLE_FISCALI_CONFERMATE],
    ['RF01', 'TD01', 'RT01', 'A', 'TC17', 2, true, 30, false, 'MP05', 3000, null]);
    assert.deepEqual(imp.PASSAGGIO_USCITE, ['prospetto', 'xml']);
    for (const k of ['CODICE_FISCALE', 'STUDIO_CAP', 'STUDIO_COMUNE', 'STUDIO_PROVINCIA', 'ALBO', 'ALBO_PROVINCIA', 'ALBO_NUMERO', 'ALBO_DATA']) assert.equal(imp[k], '', k);
    // Le colonne nuove e le tabelle nuove.
    const colonne = t => w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
    for (const c of ['sostituto_imposta', 'pagamento_giorni', 'pagamento_fine_mese']) assert.ok(colonne('soggetti').includes(c), c);
    assert.ok(colonne('scadenze_pagamento').includes('fattura_id'));
    assert.ok(colonne('ore').includes('fatturata_il'));
    assert.ok(colonne('ricorrenze').includes('per'));
    for (const t of ['fatture', 'fattura_righe', 'fattura_sorgenti', 'fattura_scadenze', 'fatture_ricevute', 'ricevuta_scadenze', 'conti', 'conto_saldi',
      'movimenti', 'movimento_abbinamenti', 'impegni', 'letture_xml']) assert.ok(colonne(t).length > 0, t);
    // Il riferimento W- lo scrive il database; l'indice unico delle sorgenti attive c'e'.
    w.db.esegui("INSERT INTO fatture (cliente_id) VALUES ('C001')");
    assert.equal(w.db.riga('SELECT riferimento FROM fatture').riferimento, 'W-1');
    assert.ok(w.db.riga("SELECT sql FROM sqlite_master WHERE name = 'fattura_sorgenti_una'").sql.includes('WHERE attiva = 1'));
    // Un abbinamento e' di una cosa sola.
    w.db.esegui("INSERT INTO conti (nome) VALUES ('Conto')");
    w.db.esegui("INSERT INTO movimenti (conto_id, data, verso, importo) VALUES (1, '2026-10-22', 'entrata', 10)");
    assert.throws(() => w.db.esegui('INSERT INTO movimento_abbinamenti (movimento_id, fattura_id, impegno_id, importo) VALUES (1, 1, 1, 5)'), /CHECK/);
    assert.throws(() => w.db.esegui("INSERT INTO movimenti (conto_id, data, verso, importo) VALUES (1, '2026-10-22', 'entrata', 0)"), /CHECK/, 'importo piu\' di zero');
  } finally {
    w.chiudi();
  }
  db = new Database(file + '.prima-4');
  assert.equal(db.versione(), 3, 'la copia e\' com\'era prima');
  db.chiudi();
  // Riaperto: la migrazione non si rifa'.
  const w2 = new Wisper({ dati });
  assert.equal(w2.db.riga("SELECT COUNT(*) n FROM registro WHERE nota LIKE 'migrazione 004%'").n, 1);
  w2.chiudi();
});
