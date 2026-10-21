/*
 * Rimettere il database com'era in una copia (accordo §7).
 *
 *   docker compose stop wisper
 *   node server/strumenti/ripristina.js <copia> [--dati <cartella>]
 *   docker compose start wisper
 *
 * <copia>: una copia notturna (/data/copie/wisper-aaaammgg.db), quella fuori
 * casa scaricata da Drive (wisper-aaaammgg.db.gz) o i suoi pezzi rimessi
 * insieme. Prima di toccare qualcosa la copia si controlla (integrita' e
 * tabelle); il database di adesso non si cancella: diventa
 * wisper.db.prima-del-ripristino-<quando>.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

require('../src/db');   // tace l'avviso sperimentale di node:sqlite
const { DatabaseSync } = require('node:sqlite');

function controllaCopia(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrita = db.prepare('PRAGMA integrity_check').get();
    if (!integrita || Object.values(integrita)[0] !== 'ok') throw new Error('La copia è rovinata (integrity_check: ' + JSON.stringify(integrita) + ')');
    const tabelle = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name);
    for (const t of ['rapportini', 'soggetti', 'commesse', 'utenti']) {
      if (tabelle.indexOf(t) < 0) throw new Error('Nella copia manca la tabella ' + t + ': è davvero una copia di Wisper?');
    }
    const conta = t => db.prepare('SELECT COUNT(*) n FROM ' + t).get().n;
    return { rapportini: conta('rapportini'), soggetti: conta('soggetti'), commesse: conta('commesse'), utenti: conta('utenti'), versione: db.prepare('PRAGMA user_version').get().user_version };
  } finally {
    db.close();
  }
}

function ripristina(copia, dati) {
  if (!copia || !fs.existsSync(copia)) throw new Error('Non trovo la copia: ' + copia);
  fs.mkdirSync(dati, { recursive: true });
  let sorgente = copia;
  let temporaneo = null;
  if (/\.gz$/i.test(copia)) {
    temporaneo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-ripristino-')), 'copia.db');
    fs.writeFileSync(temporaneo, zlib.gunzipSync(fs.readFileSync(copia)));
    sorgente = temporaneo;
  }
  try {
    const conti = controllaCopia(sorgente);
    const db = path.join(dati, 'wisper.db');
    let messoDaParte = null;
    if (fs.existsSync(db)) {
      const quando = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      messoDaParte = db + '.prima-del-ripristino-' + quando;
      fs.renameSync(db, messoDaParte);
      // Il diario WAL va con il suo database: insieme sono la versione di prima, intera.
      for (const s of ['-wal', '-shm']) if (fs.existsSync(db + s)) fs.renameSync(db + s, messoDaParte + s);
    }
    fs.copyFileSync(sorgente, db);
    return Object.assign({ database: db, messoDaParte }, conti);
  } finally {
    if (temporaneo) fs.rmSync(path.dirname(temporaneo), { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const argv = process.argv.slice(2);
    let copia = null;
    let dati = process.env.WISPER_DATI || '/data';
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--dati') dati = argv[++i];
      else if (!copia) copia = argv[i];
      else throw new Error('Non conosco "' + argv[i] + '"');
    }
    if (!copia) throw new Error('Si usa: node server/strumenti/ripristina.js <copia> [--dati <cartella>] (col server fermo)');
    const r = ripristina(path.resolve(copia), path.resolve(dati));
    console.log('Ripristinato da ' + copia + ': ' + r.rapportini + ' rapportini, ' + r.soggetti + ' clienti e fornitori, ' + r.commesse + ' commesse, ' + r.utenti + ' utenti.');
    if (r.messoDaParte) console.log('Il database di prima è in ' + r.messoDaParte + ' (non si cancella da solo).');
    console.log('Ora riavvia il server (docker compose start wisper).');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { ripristina, controllaCopia };
