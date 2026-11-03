/*
 * Rimettere il database com'era in una copia (accordo §7).
 *
 *   docker compose stop wisper
 *   node server/strumenti/ripristina.js <copia> [--dati <cartella>] [--chiave-file <file>]
 *   docker compose start wisper
 *
 * <copia>: una copia notturna (/data/copie/wisper-aaaammgg.db), quella fuori
 * casa scaricata da Drive (wisper-aaaammgg.db.gz) o i suoi pezzi rimessi
 * insieme. Prima di toccare qualcosa la copia si controlla (integrita' e
 * tabelle); il database di adesso non si cancella: diventa
 * wisper.db.prima-del-ripristino-<quando>.
 *
 * Fase 8 (fase8.md §9.8, §9.10): la copia fuori casa cifrata (wisper-aaaammgg.db.gz.cifrato, intestazione WISPERC1) si
 * riconosce da sola e chiede la chiave scritta su carta (da tastiera, o --chiave-file); con la chiave sbagliata "La
 * chiave non apre questa copia: controlla di averla scritta giusta" e niente viene toccato. Prima di ripristinare
 * stampa "Copia del 22/10/2026 · cifrata · versione dello schema 8".
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

require('../src/db');   // tace l'avviso sperimentale di node:sqlite
const { DatabaseSync } = require('node:sqlite');
const { decifra, eCifrato } = require('../src/cifra');

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

/** "Copia del 22/10/2026 · cifrata · versione dello schema 8" (la data dal nome del file). */
function descrizioneCopia(nome, cifrata, versione) {
  const m = /wisper-(\d{4})(\d{2})(\d{2})/.exec(path.basename(nome));
  return 'Copia' + (m ? ' del ' + m[3] + '/' + m[2] + '/' + m[1] : '') + (cifrata ? ' · cifrata' : '') + ' · versione dello schema ' + versione;
}

/**
 * Rimette la copia nella cartella dei dati. opzioni.chiave: la chiave scritta su carta (per le copie cifrate).
 * Torna {database, messoDaParte, descrizione, cifrata, ...conteggi}.
 */
function ripristina(copia, dati, opzioni) {
  opzioni = opzioni || {};
  if (!copia || !fs.existsSync(copia)) throw new Error('Non trovo la copia: ' + copia);
  let byte = fs.readFileSync(copia);
  const cifrata = eCifrato(byte);
  if (cifrata) {
    if (!opzioni.chiave) throw new Error('La copia è cifrata: serve la chiave scritta su carta (--chiave-file o da tastiera)');
    // Con la chiave sbagliata si ferma qui: niente e' stato toccato.
    byte = decifra(byte, opzioni.chiave);
  }
  let temporaneo = null;
  const cartellaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-ripristino-'));
  try {
    temporaneo = path.join(cartellaTmp, 'copia.db');
    fs.writeFileSync(temporaneo, byte.length > 2 && byte[0] === 0x1F && byte[1] === 0x8B ? zlib.gunzipSync(byte) : byte);
    const conti = controllaCopia(temporaneo);
    fs.mkdirSync(dati, { recursive: true });
    const db = path.join(dati, 'wisper.db');
    let messoDaParte = null;
    if (fs.existsSync(db)) {
      const quando = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      messoDaParte = db + '.prima-del-ripristino-' + quando;
      fs.renameSync(db, messoDaParte);
      // Il diario WAL va con il suo database: insieme sono la versione di prima, intera.
      for (const s of ['-wal', '-shm']) if (fs.existsSync(db + s)) fs.renameSync(db + s, messoDaParte + s);
    }
    fs.copyFileSync(temporaneo, db);
    return Object.assign({ database: db, messoDaParte, cifrata, descrizione: descrizioneCopia(copia, cifrata, conti.versione) }, conti);
  } finally {
    fs.rmSync(cartellaTmp, { recursive: true, force: true });
  }
}

/** La chiave da tastiera (senza farla vedere a chi passa: niente eco). */
function chiediChiave() {
  return new Promise((risolvi, rifiuta) => {
    if (!process.stdin.isTTY) {
      let s = '';
      process.stdin.on('data', x => { s += x; }).on('end', () => risolvi(s.trim())).on('error', rifiuta);
      return;
    }
    process.stdout.write('La copia è cifrata. Scrivi la chiave scritta su carta (8 gruppi di 4): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let s = '';
    process.stdin.on('data', function leggi(b) {
      for (const c of b.toString('utf8')) {
        if (c === '\r' || c === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', leggi);
          process.stdout.write('\n');
          return risolvi(s);
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') s = s.slice(0, -1);
        else s += c;
      }
      return undefined;
    });
  });
}

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    let copia = null;
    let dati = process.env.WISPER_DATI || '/data';
    let fileChiave = null;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--dati') dati = argv[++i];
      else if (argv[i] === '--chiave-file') fileChiave = argv[++i];
      else if (!copia) copia = argv[i];
      else throw new Error('Non conosco "' + argv[i] + '"');
    }
    if (!copia) throw new Error('Si usa: node server/strumenti/ripristina.js <copia> [--dati <cartella>] [--chiave-file <file>] (col server fermo)');
    let chiave = '';
    if (eCifrato(fs.readFileSync(path.resolve(copia)).subarray(0, 64))) chiave = fileChiave ? fs.readFileSync(fileChiave, 'utf8').trim() : await chiediChiave();
    const r = ripristina(path.resolve(copia), path.resolve(dati), { chiave });
    console.log(r.descrizione);
    console.log('Ripristinato da ' + copia + ': ' + r.rapportini + ' rapportini, ' + r.soggetti + ' clienti e fornitori, ' + r.commesse + ' commesse, ' + r.utenti + ' utenti.');
    if (r.messoDaParte) console.log('Il database di prima è in ' + r.messoDaParte + ' (non si cancella da solo).');
    console.log('Poi i file: node server/strumenti/ripristina-file.js --da <cartella file scaricata da Drive> --dati ' + dati);
    console.log('Ora riavvia il server (docker compose start wisper).');
  })().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { ripristina, controllaCopia, descrizioneCopia };
