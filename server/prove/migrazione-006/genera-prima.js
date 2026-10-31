/*
 * Scrive i dati "di prima" della migrazione 006 col server 0.8.0 (la fase 5):
 *  - fase5.sql: il database dei dati di esempio della fase 5 (senza registro, accessi e sessioni);
 *  - file.json: i byte dei file (piccoli: firme, scontrini, PDF finti);
 *  - prima.json: quello che il server 0.8.0 rispondeva su quel database: i rapportini campo per campo, le righe di ore e
 *    di trasferte, il costo di ogni commessa, i soldi della Dashboard del titolare e il costo orario che prende un
 *    rapportino nuovo di Manuel per ogni cliente.
 * L'orologio e' fermo alle 10:00 del 22/10/2026 (anche in migrazione-006.test.js), cosi' i conti che dipendono da oggi
 * (la Dashboard) si confrontano al centesimo in qualunque giorno si facciano le prove.
 * migrazione-006.test.js apre fase5.sql col server di adesso (che fa la 006) e controlla che tutto sia identico.
 * Non si cambiano a mano.
 *
 * Si rifa' solo col codice del server 0.8.0 (commit della fase 5), per esempio:
 *   git archive <commit della fase 5> server | tar -x -C <cartella>
 *   node server/prove/migrazione-006/genera-prima.js <cartella>/server
 * (git archive legge soltanto: non cambia rami ne' indice.) Solo dati inventati.
 */
'use strict';

process.env.TZ = 'Europe/Rome';

// L'orologio fermo (prima di caricare il server).
const ORA = Date.parse('2026-10-22T10:00:00+02:00');
const DataVera = Date;
class DataFerma extends DataVera {
  constructor(...a) { if (a.length) super(...a); else super(ORA); }
  static now() { return ORA; }
}
global.Date = DataFerma;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vecchio = process.argv[2];
if (!vecchio || !fs.existsSync(path.join(vecchio, 'src', 'wisper.js'))) {
  console.error('Si usa: node genera-prima.js <cartella del server 0.8.0>');
  process.exit(2);
}
const versione = JSON.parse(fs.readFileSync(path.join(vecchio, 'package.json'), 'utf8')).version;
if (versione !== '0.8.0') {
  console.error('Serve il server 0.8.0 (questo e\' ' + versione + ')');
  process.exit(2);
}
const { Wisper } = require(path.resolve(vecchio, 'src', 'wisper'));
const { semina } = require(path.resolve(vecchio, 'src', 'prova'));
const { Postino } = require(path.resolve(vecchio, 'src', 'postino'));

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prima-006-'));
const w = new Wisper({ dati: cartella, postino: new Postino({ cartella: path.join(cartella, 'posta') }) });
if (w.db.versione() !== 5) throw new Error('il server 0.8.0 doveva lasciare il database alla versione 5');
semina(w);
const titolare = w.titolare();
const come = fn => w.come({ utente: titolare, permessi: w.permessiDi('titolare'), app: 'prova', dispNome: 'genera-prima' }, fn);

// ---------------------------------------------------------------- prima.json: cosa rispondeva il server 0.8.0
const prima = come(() => {
  const commesse = w.db.righe('SELECT id FROM commesse ORDER BY id').map(m => m.id);
  const costi = {};
  for (const id of commesse) costi[id] = w.costoDellaCommessa({ idCommessa: id }).costoCommessa;
  return {
    rapportini: w.leggiRapportini('', '', true).sort((a, b) => (a.id < b.id ? -1 : 1)),
    ore: w.db.righe('SELECT * FROM ore ORDER BY id').map(r => Object.assign({}, r)),
    trasferte: w.db.righe('SELECT * FROM trasferte ORDER BY id').map(r => Object.assign({}, r)),
    veicoli: w.db.righe('SELECT * FROM veicoli ORDER BY id').map(r => Object.assign({}, r)),
    costoCommessa: costi,
    soldi: w.dashboard({}).numeri.soldi,
  };
});
prima.nota = 'Fatto da genera-prima.js col server 0.8.0 sul database di fase5.sql, con l\'orologio fermo al ' + new DataVera(ORA).toISOString() + '. Non si cambia a mano.';
prima.versione = versione;
prima.ora = ORA;

// ---------------------------------------------------------------- fase5.sql e file.json (prima dei rapportini nuovi)
const SALTATE = ['registro', 'accessi', 'sessioni', 'tentativi_accesso', 'sqlite_sequence'];
const valore = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
  : typeof v === 'bigint' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const righe = ['-- Il database dei dati di esempio della fase 5 (server 0.8.0, schema 5), scritto da genera-prima.js. Non si cambia a mano.'];
const tabelle = w.db.righe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(t => t.name).filter(t => SALTATE.indexOf(t) < 0);
for (const t of tabelle) {
  const colonne = w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
  righe.push('DELETE FROM ' + t + ';');
  for (const r of w.db.righe('SELECT * FROM ' + t + ' ORDER BY rowid')) {
    righe.push('INSERT INTO ' + t + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => valore(r[c])).join(', ') + ');');
  }
}
righe.push('DELETE FROM sqlite_sequence;');
for (const s of w.db.righe('SELECT name, seq FROM sqlite_sequence ORDER BY name')) righe.push('INSERT INTO sqlite_sequence (name, seq) VALUES (' + valore(s.name) + ', ' + s.seq + ');');
fs.writeFileSync(path.join(__dirname, 'fase5.sql'), righe.join('\n') + '\n');
const file = {};
for (const f of w.db.righe('SELECT id, percorso FROM file WHERE percorso IS NOT NULL ORDER BY id')) {
  const p = path.join(cartella, 'file', f.percorso);
  if (fs.existsSync(p)) file[f.id] = fs.readFileSync(p).toString('base64');
}

// Il costo orario di un rapportino nuovo di Manuel, cliente per cliente (dopo il dump: non entra in fase5.sql).
prima.costoOrarioNuovo = come(() => {
  const out = {};
  for (const c of w.db.righe("SELECT id FROM soggetti WHERE cliente = 1 ORDER BY id")) {
    const r = w.salvaRapportino({ idLocale: 'nuovo-' + c.id, data: '2026-10-22', tecnico: 'Manuel Gasparotto', idCliente: c.id, descrizione: 'Prova del costo orario', oreLavoro: 1, tariffa: 40 });
    out[c.id] = w.db.riga('SELECT costo_orario FROM rapportini WHERE id = ?', r.id).costo_orario;
  }
  return out;
});

fs.writeFileSync(path.join(__dirname, 'file.json'), JSON.stringify(file, null, 1) + '\n');
fs.writeFileSync(path.join(__dirname, 'prima.json'), JSON.stringify(prima, null, 1) + '\n');
w.chiudi();
console.log('fase5.sql: ' + tabelle.length + ' tabelle; file.json: ' + Object.keys(file).length + ' file; prima.json: ' + prima.rapportini.length + ' rapportini, ' +
  prima.ore.length + ' ore, ' + prima.trasferte.length + ' trasferte, ' + Object.keys(prima.costoCommessa).length + ' commesse');
