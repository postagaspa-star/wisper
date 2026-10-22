/*
 * Copia sul NAS i file che il foglio cita (foto delle spese, firme, firma del
 * tecnico, documenti delle cartelle delle commesse), con l'azione "file" dello
 * script di oggi: solo letture, gli originali restano su Drive (accordo §8).
 *
 *   node server/strumenti/copia-drive.js --da <url dello script> --dati <cartella> [--codice <codice>]
 *
 * Il codice si puo' dare anche con la variabile WISPER_CODICE, o scriverlo
 * quando lo chiede (cosi' non resta nella cronologia dei comandi).
 *
 * Due modi, a seconda di cosa c'e' nella cartella:
 *  - c'e' gia' wisper.db (dopo importa.js): copia i file del database che non
 *    sono ancora su disco, e aggiunge i documenti delle commesse;
 *  - non c'e' ancora: chiede allo script quali file cita, li mette in
 *    <dati>/file/ con un indice (indice-drive.json), e importa.js li trova da li'.
 * Si puo' rilanciare quante volte si vuole: quelli gia' copiati si saltano.
 *
 * Mai provato sul foglio vero: le prove usano il finto Google.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { testo, istante, adesso, sha256 } = require('../src/utili');

const CHI = { disp: 'wisper-copia-drive', dispNome: 'Server Wisper (copia dei file)', app: 'copia-drive' };
const ATTESA_MS = 120000;

function idDaUrl(url) {
  const m = String(url).match(/\/d\/([A-Za-z0-9_-]{10,})/) || String(url).match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

/** Una lettura dallo script, come la fa Wisper Ufficio (GET con il codice); una volta si riprova. */
async function leggi(da, codice, parametri) {
  const u = new URL(da);
  u.searchParams.set('codice', codice);
  for (const [k, v] of Object.entries(Object.assign({}, CHI, parametri))) u.searchParams.set(k, v);
  let ultimo;
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    try {
      const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(ATTESA_MS) });
      const t = await r.text();
      if (!r.ok) throw new Error('lo script ha risposto ' + r.status);
      let j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('risposta non valida (lo script è pubblicato per "Chiunque"?)'); }
      if (!j.ok) {
        const e = new Error(j.errore || 'lo script ha detto di no');
        e.definitivo = true;
        throw e;
      }
      return j;
    } catch (err) {
      ultimo = err;
      if (err.definitivo) break;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw ultimo;
}

async function scarica(da, codice, id) {
  const j = await leggi(da, codice, { azione: 'file', id });
  const f = j.file || {};
  const dati = Buffer.from(String(f.base64 || ''), 'base64');
  if (!dati.length) throw new Error('il file è vuoto');
  return { nome: testo(f.nome), mime: testo(f.mime) || 'application/octet-stream', dati };
}

/** Senza database: i file che lo script cita, per importa.js. */
async function copiaPrima(o) {
  const cartella = path.join(o.dati, 'file');
  fs.mkdirSync(cartella, { recursive: true });
  const percorsoIndice = path.join(cartella, 'indice-drive.json');
  const indice = fs.existsSync(percorsoIndice) ? JSON.parse(fs.readFileSync(percorsoIndice, 'utf8')) : { file: {} };
  const ana = await leggi(o.da, o.codice, { azione: 'anagrafiche' });
  const rap = await leggi(o.da, o.codice, { azione: 'rapportini', tutti: '1' });
  const citati = [];
  for (const r of rap.rapportini || []) {
    (r.foto || []).forEach(f => citati.push({ id: f.id, url: f.url, tipo: 'spesa', idRapportino: r.id }));
    if (r.firma && r.firma.id) citati.push({ id: r.firma.id, url: r.firma.url, tipo: 'firma', idRapportino: r.id });
  }
  const ft = idDaUrl((ana.impostazioni || {}).FIRMA_TECNICO || '');
  if (ft) citati.push({ id: ft, url: ana.impostazioni.FIRMA_TECNICO, tipo: 'firmaTecnico' });
  for (const m of (ana.commesse || []).filter(x => testo(x.cartella))) {
    const d = await leggi(o.da, o.codice, { azione: 'documenti', idCommessa: m.id });
    (d.documenti || []).forEach(x => citati.push({ id: x.id, url: x.url, tipo: 'documento', idCommessa: m.id, nome: x.nome, mime: x.mime, data: x.data }));
  }
  return copiaElenco(o, citati, async (c, f) => {
    fs.writeFileSync(path.join(cartella, c.id), f.dati);
    indice.file[c.id] = { nome: f.nome || c.nome || '', mime: f.mime || c.mime || '', tipo: c.tipo, url: c.url, idRapportino: c.idRapportino || '',
      idCommessa: c.idCommessa || '', data: c.data || '', byte: f.dati.length, sha256: sha256(f.dati) };
    fs.writeFileSync(percorsoIndice, JSON.stringify(indice, null, 1));
  }, c => fs.existsSync(path.join(cartella, c.id)));
}

/** Con il database: i file senza copia su disco, piu' i documenti delle commesse. */
async function copiaNelDatabase(o) {
  const { Wisper, SISTEMA } = require('../src/wisper');
  const w = new Wisper({ dati: o.dati });
  try {
    const citati = w.db.righe("SELECT id, tipo, rapportino_id, commessa_id, drive_url FROM file WHERE percorso IS NULL OR percorso = '' ORDER BY rowid")
      .map(f => ({ id: f.id, tipo: f.tipo, url: f.drive_url, nuovo: false }));
    for (const m of w.db.righe("SELECT id FROM commesse WHERE cartella <> ''")) {
      const d = await leggi(o.da, o.codice, { azione: 'documenti', idCommessa: m.id });
      for (const x of d.documenti || []) {
        if (w.db.riga('SELECT id FROM file WHERE id = ?', x.id)) continue;
        citati.push({ id: x.id, url: x.url, tipo: 'documento', idCommessa: m.id, nome: x.nome, mime: x.mime, data: x.data, nuovo: true });
      }
    }
    return await copiaElenco(o, citati, async (c, f) => {
      fs.writeFileSync(w.percorsoFile(c.id), f.dati);
      w.come(SISTEMA, () => w.db.transazione(() => {
        if (c.nuovo) {
          w.inserisci('file', {
            id: c.id, nome: f.nome || c.nome || '', mime: f.mime || c.mime || '', byte: f.dati.length, sha256: sha256(f.dati), percorso: c.id,
            tipo: 'documento', commessa_id: c.idCommessa, drive_url: c.url || null, creato: c.data ? istante(new Date(c.data)) : adesso(),
          });
          // Fase 5: il documento della commessa entra nell'archivio (Da classificare), con lo stesso id del file di Drive.
          w.documentoDaFileVecchio(w.db.riga('SELECT * FROM file WHERE id = ?', c.id), c.idCommessa);
        } else {
          w.db.esegui('UPDATE file SET nome = CASE WHEN nome = \'\' THEN ? ELSE nome END, mime = CASE WHEN mime = \'\' THEN ? ELSE mime END, ' +
            'byte = ?, sha256 = ?, percorso = ? WHERE id = ?', f.nome, f.mime, f.dati.length, sha256(f.dati), c.id, c.id);
        }
      }));
    }, () => false);
  } finally {
    w.chiudi();
  }
}

async function copiaElenco(o, citati, salva, giaCopiato) {
  const esito = { copiati: 0, gia: 0, falliti: [] };
  const visti = new Set();
  for (const c of citati) {
    if (!c.id || visti.has(c.id)) continue;
    visti.add(c.id);
    if (giaCopiato(c)) { esito.gia++; continue; }
    try {
      const f = await scarica(o.da, o.codice, c.id);
      await salva(c, f);
      esito.copiati++;
      if (o.parla) process.stdout.write('.');
    } catch (err) {
      esito.falliti.push({ id: c.id, tipo: c.tipo, errore: err.message });
    }
  }
  if (o.parla && esito.copiati) process.stdout.write('\n');
  return esito;
}

async function copiaDrive(o) {
  if (!o.da || !o.dati) throw new Error('Si usa: node server/strumenti/copia-drive.js --da <url dello script> --dati <cartella> [--codice <codice>]');
  if (!o.codice) throw new Error('Manca il codice del foglio');
  fs.mkdirSync(o.dati, { recursive: true });
  return fs.existsSync(path.join(o.dati, 'wisper.db')) ? copiaNelDatabase(o) : copiaPrima(o);
}

function chiediCodice() {
  return new Promise(risolvi => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question('Codice del foglio (non si vede mentre lo scrivi): ', c => { rl.close(); process.stdout.write('\n'); risolvi(c.trim()); });
    rl._writeToOutput = s => { if (!/Codice del foglio/.test(s)) return; rl.output.write(s); };
  });
}

if (require.main === module) {
  (async () => {
    const a = { parla: true };
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--da') a.da = argv[++i];
      else if (argv[i] === '--dati') a.dati = path.resolve(argv[++i]);
      else if (argv[i] === '--codice') a.codice = argv[++i];
      else throw new Error('Non conosco "' + argv[i] + '"');
    }
    a.codice = a.codice || process.env.WISPER_CODICE || (a.da && a.dati ? await chiediCodice() : '');
    const r = await copiaDrive(a);
    console.log('Copiati ' + r.copiati + ' file, ' + r.gia + ' c\'erano già, ' + r.falliti.length + ' non riusciti.');
    r.falliti.forEach(f => console.log('  ' + f.tipo + ' ' + f.id + ': ' + f.errore));
    if (r.falliti.length) {
      console.log('Rilancia lo stesso comando per riprovare quelli non riusciti.');
      process.exit(1);
    }
  })().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { copiaDrive };
