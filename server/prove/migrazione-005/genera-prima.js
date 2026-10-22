/*
 * Scrive i dati "di prima" della migrazione 005 col server 0.7.0 (la fase 4):
 *  - fase4.sql: il database dei dati di esempio della fase 4 (senza registro,
 *    accessi e sessioni), con in piu' i documenti delle commesse caricati come
 *    li caricavano le app (caricaFile tipo documento), la cartella Drive di due
 *    commesse (un indirizzo e un id nudo) e una che non e' un indirizzo, un
 *    documento nel cestino, una copia fuori casa riuscita prima dell'ultimo file;
 *  - file.json: i byte dei file (piccoli: firme, scontrini, PDF finti);
 *  - prima.json: quello che il server 0.7.0 rispondeva su quel database
 *    (rapportini campo per campo, i documenti delle commesse, i conti delle
 *    fatture e il costo delle commesse) e il testo dei PDF di oggi (rapportini,
 *    riepilogo, preventivi, prospetti delle fatture, avviso di parcella), fatti
 *    con pc/ui/documenti.js come li fanno telefono e computer.
 * migrazione-005.test.js apre fase4.sql col server di adesso (che fa la 005) e
 * controlla che tutto sia identico. Non si cambiano a mano.
 *
 * Si rifa' solo col codice del server 0.7.0 (commit della fase 4), per esempio:
 *   git archive 958ae9b server | tar -x -C <cartella>
 *   node server/prove/migrazione-005/genera-prima.js <cartella>/server
 * (git archive legge soltanto: non cambia rami ne' indice.) Solo dati inventati.
 */
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vecchio = process.argv[2];
if (!vecchio || !fs.existsSync(path.join(vecchio, 'src', 'wisper.js'))) {
  console.error('Si usa: node genera-prima.js <cartella del server 0.7.0>');
  process.exit(2);
}
const versione = JSON.parse(fs.readFileSync(path.join(vecchio, 'package.json'), 'utf8')).version;
if (versione !== '0.7.0') {
  console.error('Serve il server 0.7.0 (questo e\' ' + versione + ')');
  process.exit(2);
}
const { Wisper } = require(path.resolve(vecchio, 'src', 'wisper'));
const { semina } = require(path.resolve(vecchio, 'src', 'prova'));
const { Postino } = require(path.resolve(vecchio, 'src', 'postino'));
const { istante } = require(path.resolve(vecchio, 'src', 'utili'));
const { uscite } = require('./pdf');

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prima-005-'));
const w = new Wisper({ dati: cartella, postino: new Postino({ cartella: path.join(cartella, 'posta') }) });
if (w.db.versione() !== 4) throw new Error('il server 0.7.0 doveva lasciare il database alla versione 4');
semina(w);
const titolare = w.titolare();
const come = fn => w.come({ utente: titolare, permessi: w.permessiDi('titolare'), app: 'prova', dispNome: 'genera-prima' }, () => w.db.transazione(fn));
const pdf = testo => Buffer.from('%PDF-1.4\n% ' + testo + '\n%%EOF\n').toString('base64');

come(() => {
  const doc = (idCommessa, nome, idFile) => w.caricaFile({ tipo: 'documento', idCommessa, nome, mime: 'application/pdf', base64: pdf(nome), idFile });
  doc('26ST001', 'Offerta.pdf', 'doc-1');
  doc('26ST001', 'Schema quadro linea 1.pdf', 'doc-2');
  doc('26ST002', 'Verbale di collaudo.pdf', 'doc-3');
  const cestino = doc('26ST002', 'Bozza da buttare.pdf', 'doc-4');
  w.db.esegui('UPDATE file SET cestinato = ? WHERE id = ?', istante(new Date(Date.now() - 3600000)), cestino.id);
  w.db.esegui("UPDATE commesse SET cartella = 'https://drive.google.com/drive/folders/1CartellaEsempio26ST001' WHERE id = '26ST001'");
  w.db.esegui("UPDATE commesse SET cartella = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123' WHERE id = '26ST002'");
  w.db.esegui("UPDATE commesse SET cartella = 'chiedere a Manuel dove sta' WHERE id = '26ST003'");
});
// Una copia fuori casa riuscita adesso: i file di prima sono gia' su Drive; poi arriva un documento nuovo.
const copia = istante(new Date(Date.now() + 1000));
w.db.esegui("INSERT INTO copie (quando, file, byte, locale, fuori, foglio, nota) VALUES (?, 'wisper-prima.db', 1, 'ok', 'ok · 3 file', 'ok', 'notturna')", copia);
come(() => {
  const f = w.caricaFile({ tipo: 'documento', idCommessa: '26ST002', nome: 'Arrivato dopo la copia.pdf', mime: 'application/pdf', base64: pdf('dopo'), idFile: 'doc-5' });
  w.db.esegui('UPDATE file SET creato = ? WHERE id = ?', istante(new Date(Date.now() + 3600000)), f.id);
});

// ---------------------------------------------------------------- prima.json: cosa rispondeva il server 0.7.0
const prima = w.come({ utente: titolare, permessi: w.permessiDi('titolare') }, () => uscite(w));
prima.nota = 'Fatto da genera-prima.js col server 0.7.0 sul database di fase4.sql. Non si cambia a mano.';
prima.versione = versione;

// ---------------------------------------------------------------- fase4.sql e file.json
const SALTATE = ['registro', 'accessi', 'sessioni', 'tentativi_accesso', 'sqlite_sequence'];
const valore = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL')
  : typeof v === 'bigint' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const righe = ['-- Il database dei dati di esempio della fase 4 (server 0.7.0, schema 4), scritto da genera-prima.js. Non si cambia a mano.'];
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
fs.writeFileSync(path.join(__dirname, 'fase4.sql'), righe.join('\n') + '\n');
const file = {};
for (const f of w.db.righe('SELECT id, percorso FROM file WHERE percorso IS NOT NULL ORDER BY id')) {
  const p = path.join(cartella, 'file', f.percorso);
  if (fs.existsSync(p)) file[f.id] = fs.readFileSync(p).toString('base64');
}
fs.writeFileSync(path.join(__dirname, 'file.json'), JSON.stringify(file, null, 1) + '\n');
fs.writeFileSync(path.join(__dirname, 'prima.json'), JSON.stringify(prima, null, 1) + '\n');
w.chiudi();
console.log('fase4.sql: ' + tabelle.length + ' tabelle; file.json: ' + Object.keys(file).length + ' file; prima.json: ' + prima.rapportini.length + ' rapportini, ' +
  Object.keys(prima.pdf).length + ' PDF');
