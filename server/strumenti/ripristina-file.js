/*
 * Rimettere i file della copia fuori casa dove li vuole il database (fase 8, fase8.md §9.10, §11.4).
 *
 *   node server/strumenti/ripristina-file.js --da <cartella "file" scaricata da Drive> --dati <cartella> [--chiave-file <file>]
 *
 * La copia fuori casa tiene i file in Wisper/Copie NAS/file/ col nome "<id> <nome>" (o "<id> <nome>.cifrato" con la
 * cifratura accesa). Per ogni file del database che manca nella cartella dei dati: lo cerca per id, lo decifra se serve
 * (la chiave scritta su carta), ne controlla lo SHA-256 contro la tabella file e lo rimette al suo posto. Alla fine dice
 * quanti ha rimesso, quanti c'erano gia', quanti mancano (quelli oltre 25 MB stanno solo sul NAS: fase 5 §3.8) e quanti
 * non tornano. Non tocca il database (lo legge e basta).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('../src/db');   // tace l'avviso sperimentale di node:sqlite
const { DatabaseSync } = require('node:sqlite');
const { decifra, eCifrato } = require('../src/cifra');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/** Torna {rimessi, gia, mancano, soloNas, sbagliati: [id], senzaChiave}. */
function ripristinaFile(o) {
  const dati = path.resolve(o.dati);
  const da = path.resolve(o.da);
  if (!fs.existsSync(path.join(dati, 'wisper.db'))) throw new Error('Nella cartella dei dati non c\'è il database: prima ripristina.js');
  if (!fs.existsSync(da)) throw new Error('Non trovo la cartella dei file: ' + da);
  const db = new DatabaseSync(path.join(dati, 'wisper.db'), { readOnly: true });
  const esito = { rimessi: 0, gia: 0, mancano: 0, soloNas: 0, sbagliati: [], senzaChiave: 0 };
  try {
    // I file nella cartella scaricata, per id (la parte del nome prima dello spazio).
    const perId = new Map();
    for (const nome of fs.readdirSync(da)) {
      const id = nome.split(' ')[0];
      if (/^[A-Za-z0-9_-]{8,}$/.test(id)) perId.set(id, nome);
    }
    const righe = db.prepare('SELECT id, percorso, sha256, byte, fuori_no FROM file WHERE percorso IS NOT NULL AND svuotato IS NULL AND drive_url IS NULL').all();
    fs.mkdirSync(path.join(dati, 'file'), { recursive: true });
    for (const f of righe) {
      const dove = path.join(dati, 'file', path.basename(f.percorso));
      if (fs.existsSync(dove) && (!f.sha256 || sha(fs.readFileSync(dove)) === f.sha256)) { esito.gia++; continue; }
      const nome = perId.get(f.id);
      if (!nome) {
        esito.mancano++;
        if (f.fuori_no === 'troppo grande' || (Number(f.byte) || 0) > 25 * 1048576) esito.soloNas++;
        continue;
      }
      let b = fs.readFileSync(path.join(da, nome));
      if (eCifrato(b)) {
        if (!o.chiave) { esito.senzaChiave++; continue; }
        b = decifra(b, o.chiave);
      }
      if (f.sha256 && sha(b) !== f.sha256) { esito.sbagliati.push(f.id); continue; }
      fs.writeFileSync(dove, b);
      esito.rimessi++;
    }
  } finally {
    db.close();
  }
  return esito;
}

if (require.main === module) {
  try {
    const argv = process.argv.slice(2);
    const o = {};
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--da') o.da = argv[++i];
      else if (argv[i] === '--dati') o.dati = argv[++i];
      else if (argv[i] === '--chiave-file') o.chiave = fs.readFileSync(argv[++i], 'utf8').trim();
      else throw new Error('Non conosco "' + argv[i] + '"');
    }
    if (!o.da || !o.dati) throw new Error('Si usa: node server/strumenti/ripristina-file.js --da <cartella file scaricata da Drive> --dati <cartella> [--chiave-file <file>]');
    const r = ripristinaFile(o);
    console.log('File rimessi: ' + r.rimessi + ' · già al loro posto: ' + r.gia + ' · mancano: ' + r.mancano + (r.soloNas ? ' (di cui ' + r.soloNas + ' oltre 25 MB: stanno solo sul NAS)' : ''));
    if (r.senzaChiave) console.log('ATTENZIONE: ' + r.senzaChiave + ' file sono cifrati: rifai con --chiave-file');
    if (r.sbagliati.length) {
      console.log('NON TORNANO (lo SHA-256 è diverso): ' + r.sbagliati.join(', '));
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { ripristinaFile };
