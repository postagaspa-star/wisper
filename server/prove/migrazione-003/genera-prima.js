/*
 * Scrive prima.json: i numeri dei rapportini di semi.js come li dava il
 * server 0.5.0, prima della fase 3 (rapportini campo per campo, il CSV per
 * Excel, i soldi della dashboard). La prova migrazione-spese.test.js li
 * confronta con quelli del server di adesso dopo la migrazione 003.
 *
 * Si rifa' solo se cambia semi.js, col codice del server 0.5.0 (commit della
 * fase 2), per esempio:
 *   git archive edaf25f server | tar -x -C <cartella>
 *   node server/prove/migrazione-003/genera-prima.js <cartella>/server
 * (git archive legge soltanto: non cambia rami ne' indice.)
 */
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { creaDatabaseVersione2, numeri } = require('./semi');

const vecchio = process.argv[2];
if (!vecchio || !fs.existsSync(path.join(vecchio, 'src', 'wisper.js'))) {
  console.error('Si usa: node genera-prima.js <cartella del server 0.5.0>');
  process.exit(2);
}
const versione = JSON.parse(fs.readFileSync(path.join(vecchio, 'package.json'), 'utf8')).version;
if (versione !== '0.5.0') {
  console.error('Serve il server 0.5.0 (questo e\' ' + versione + ')');
  process.exit(2);
}
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prima-003-'));
creaDatabaseVersione2(cartella);
const { Wisper } = require(path.resolve(vecchio, 'src', 'wisper'));
const w = new Wisper({ dati: cartella });
if (w.db.versione() !== 2) throw new Error('il server 0.5.0 doveva lasciare il database alla versione 2');
const fuori = Object.assign({ nota: 'Fatto da genera-prima.js col server 0.5.0 sul database di semi.js. Non si cambia a mano.', versione }, numeri(w));
w.chiudi();
fs.writeFileSync(path.join(__dirname, 'prima.json'), JSON.stringify(fuori, null, 1) + '\n');
console.log('prima.json: ' + fuori.rapportini.length + ' rapportini, CSV di ' + fuori.csv.length + ' caratteri');
