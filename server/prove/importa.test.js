// Il passaggio dei dati: il finto Google (lo script vero) lavora un po', le sue schede si
// esportano in .xlsx come fa Fogli, si importano, e righe, numeri RAP e totali per mese e cliente
// devono tornare al centesimo. Poi copia-drive.js copia i file contro il finto Google in HTTP.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { serverDiProva, cartellaNuova, ascolta, chiudi, PNG } = require('./aiuto');
const { scriviXlsx } = require('../strumenti/xlsx');
const { importa } = require('../strumenti/importa');
const { copiaDrive } = require('../strumenti/copia-drive');
const { Wisper } = require('../src/wisper');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const finto = require('../../apps-script/prove/finto-google.js');

const scrivi = (azione, dati) => {
  const r = JSON.parse(finto.contesto.doPost({ postData: { contents: JSON.stringify(Object.assign({ codice: 'prova', azione }, dati)) } }).testo);
  if (!r.ok) throw new Error(azione + ': ' + r.errore);
  return r;
};
const delloScript = p => JSON.parse(finto.contesto.doGet({ parameter: Object.assign({ codice: 'prova' }, p) }).testo);
const UTENTE = path.join(__dirname, '..', 'strumenti', 'utente.js');
const IMPORTA = path.join(__dirname, '..', 'strumenti', 'importa.js');

// ------------------------------------------------------------------ il foglio lavora un po'

const png = PNG.toString('base64');
const giaUsati = {};
test.before(() => {
  const c = scrivi('creaCliente', { nome: 'Zero Davanti Srl', partitaIva: '01234567890', telefono: '0445123456' }).cliente;
  // Una partita IVA diventata numero, come succedeva prima della 0.3.3.
  const f = finto.fogli.get('Clienti');
  const v = scrivi('creaCliente', { nome: 'Vecchio Numero Spa' }).cliente;
  const n = f.celle.findIndex(x => x.includes('Vecchio Numero Spa'));
  f.celle[n][f.celle[0].indexOf('PARTITA_IVA')] = 1234567890;
  f.celle[n][f.celle[0].indexOf('TELEFONO')] = 445123456;
  giaUsati.vecchio = v.id;
  scrivi('salvaRapportino', { rapportino: { idLocale: 'imp-1', data: '2026-10-12', idCliente: c.id, tariffa: 38.5, oreLavoro: 2.25, oreExtra: 0.5, km: 13, spese: 7.3, descrizione: '=SOMMA(A1)', ticket: '000123' } });
  scrivi('salvaRapportino', { rapportino: { idLocale: 'imp-2', data: '2025-12-31', idCliente: 'C002', idCommessa: '26ST002', tariffa: 42, oreLavoro: 1, km: 5 } });
  scrivi('salvaRapportino', { rapportino: { idLocale: 'imp-3', data: '2026-10-15', idCliente: 'C001', commessa: 'Commessa nata sul telefono', codiceProposto: '26ST003', oreLavoro: 4, oreViaggio: 1, km: 40 } });
  scrivi('salvaRapportino', { rapportino: { idLocale: 'imp-4', data: '2026-10-16', idCliente: 'C002', tariffa: 40, oreLavoro: 1 } });
  scrivi('stato', { ids: ['imp-4'], stato: 'ANNULLATO' });
  giaUsati.spesa = scrivi('caricaFile', { tipo: 'spesa', idLocale: 'imp-1', idFile: 's1', mime: 'image/png', base64: png }).file;
  giaUsati.spesa2 = scrivi('caricaFile', { tipo: 'spesa', idLocale: 'imp-1', idFile: 's2', mime: 'image/jpeg', base64: Buffer.from([0xFF, 0xD8, 0xFF, 1, 2, 3]).toString('base64') }).file;
  giaUsati.firma = scrivi('caricaFile', { tipo: 'firma', idLocale: 'imp-1', idFile: 'f1', mime: 'image/png', base64: png, firmatario: 'Mario Bianchi', firmatoIl: '2026-10-12T18:05:00' }).file;
  giaUsati.tecnico = scrivi('caricaFile', { tipo: 'firmaTecnico', mime: 'image/png', base64: png }).file;
  giaUsati.documento = scrivi('caricaFile', { tipo: 'documento', idCommessa: '26ST001', nome: 'Offerta.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 offerta').toString('base64') }).file;
  scrivi('stato', { ids: ['RAP/2026/0003'], stato: 'INVIATO' });
});

/** Le schede del finto Google in un .xlsx, come File > Scarica > Microsoft Excel. */
function esporta(cartella) {
  const schede = Array.from(finto.fogli.values()).map(f => ({ nome: f.getName(), righe: f.celle }));
  const p = path.join(cartella, 'foglio.xlsx');
  fs.writeFileSync(p, scriviXlsx(schede));
  return p;
}

function servi(contesto) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let corpo = '';
    req.on('data', p => { corpo += p; });
    req.on('end', () => {
      const out = req.method === 'GET' ? contesto.doGet({ parameter: Object.fromEntries(url.searchParams) }) : contesto.doPost({ postData: { contents: corpo } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(out.testo);
    });
  });
}

function totali(rapportini) {
  const t = {};
  for (const r of rapportini) {
    for (const k of ['mese ' + r.data.slice(0, 7), 'cliente ' + r.idCliente]) {
      const x = t[k] = t[k] || { n: 0, ore: 0, km: 0, euro: 0 };
      x.n++;
      x.ore += Math.round(r.oreTotali * 100);
      x.km += Math.round(r.km * 100);
      x.euro += Math.round(r.totale * 100);
    }
  }
  return t;
}

let dati;
let s;
let manuel;

test('importa: tutto torna, e il controllo lo scrive', async () => {
  dati = cartellaNuova('importa');
  const r = importa({ foglio: esporta(dati), dati });
  assert.equal(r.ok, true, JSON.stringify(r.errori));
  assert.equal(r.errori.length, 0);
  const html = fs.readFileSync(r.controllo, 'utf8');
  assert.match(html, /Tutto torna/);
  assert.match(html, /RAP\/2026\/0001/);
  assert.match(html, new RegExp(giaUsati.spesa.id));
  // Il titolare dal NAS, con la password da "tastiera".
  const u = spawnSync(process.execPath, [UTENTE, '--titolare', 'Manuel Gasparotto', 'manuel@esempio.it', '--dati', dati], { input: 'password-di-prova\npassword-di-prova\n', encoding: 'utf8' });
  assert.equal(u.status, 0, u.stderr);
  assert.match(u.stdout, /Creato Manuel Gasparotto \(titolare/);
  const doppio = spawnSync(process.execPath, [UTENTE, '--titolare', 'Altro', 'manuel@esempio.it', '--dati', dati], { input: 'x\nx\n', encoding: 'utf8' });
  assert.notEqual(doppio.status, 0);
  assert.match(doppio.stderr, /C'è già un utente/);
  const corta = spawnSync(process.execPath, [UTENTE, '--ruolo', 'lettura', 'Commercialista', 'conti@esempio.it', '--dati', dati], { input: 'corta\ncorta\n', encoding: 'utf8' });
  assert.match(corta.stderr, /almeno 8 caratteri/);
  s = await serverDiProva({ dati, prova: false });
  manuel = await s.come('manuel@esempio.it', 'password-di-prova');
});

test('importa: righe, numeri RAP, conti e totali per mese e cliente al centesimo', async () => {
  const miei = (await manuel('rapportini', { tutti: true })).rapportini;
  const suoi = delloScript({ azione: 'rapportini', tutti: '1' }).rapportini;
  assert.deepEqual(miei.map(r => r.id).sort(), suoi.map(r => r.id).sort());
  assert.deepEqual(totali(miei), totali(suoi));
  const campi = ['idLocale', 'data', 'tecnico', 'idCliente', 'cliente', 'gruppo', 'idCommessa', 'commessa', 'ticket', 'descrizione', 'oreLavoro', 'oreExtra',
    'oreViaggio', 'oreTotali', 'km', 'spese', 'noteSpese', 'tariffa', 'pagaViaggio', 'kmRimborsati', 'euroKm', 'maggExtra', 'compensoOre', 'rimborsoKm',
    'totale', 'costoOrario', 'firmatario', 'firmatoIl', 'stato', 'inviatoIl', 'fatturatoIl', 'creato', 'modificato'];
  for (const r of suoi) {
    const m = miei.find(x => x.id === r.id);
    for (const k of campi) assert.deepEqual(m[k], r[k], r.id + ' ' + k);
    assert.deepEqual(m.foto.map(f => f.id), r.foto.map(f => f.id), r.id + ' foto: gli stessi id di Drive');
    assert.equal(m.firma ? m.firma.id : null, r.firma ? r.firma.id : null, r.id + ' firma');
  }
  // Gli annullati non si mandano, come oggi.
  assert.equal((await manuel('rapportini')).rapportini.length, delloScript({ azione: 'rapportini' }).rapportini.length);
});

test('importa: clienti, commesse e impostazioni come li dava lo script', async () => {
  const mia = await manuel('anagrafiche');
  const sua = delloScript({});
  const campi = ['id', 'nome', 'alias', 'gruppo', 'email', 'telefono', 'indirizzo', 'partitaIva', 'tariffaFissa', 'costoFisso', 'ultimaTariffa', 'pagaViaggio', 'kmRimborsati', 'maggExtra', 'note'];
  assert.deepEqual(mia.clienti.map(c => c.id), sua.clienti.map(c => c.id));
  for (const c of sua.clienti) for (const k of campi) assert.deepEqual(mia.clienti.find(x => x.id === c.id)[k], c[k], c.id + ' ' + k);
  const vecchio = mia.clienti.find(x => x.id === giaUsati.vecchio);
  assert.equal(vecchio.partitaIva, '01234567890', 'gli zeri tornano');
  assert.equal(vecchio.telefono, '0445123456');
  const campiM = ['id', 'idCliente', 'descrizione', 'stato', 'indirizzo', 'budgetOre', 'budgetEuro', 'prezzoOrario', 'costoOrario', 'euroKm', 'inizio', 'finePrevista', 'cartella', 'codicePrecedente', 'note'];
  for (const m of sua.commesse) for (const k of campiM) assert.deepEqual(mia.commesse.find(x => x.id === m.id)[k], m[k], m.id + ' ' + k);
  for (const k of Object.keys(sua.impostazioni)) {
    if (k === 'FIRMA_TECNICO') assert.equal(mia.impostazioni[k], '/file/' + giaUsati.tecnico.id, 'stesso id, indirizzo nuovo');
    else assert.deepEqual(mia.impostazioni[k], sua.impostazioni[k], k);
  }
  // Il prossimo codice continua dal foglio.
  assert.equal(mia.numerazioni.find(n => n.tipo === 'commessa').prossimo, '26ST004');
  // Il registro sa che i dati vengono dal foglio, e gli accessi di prima ci sono.
  assert.equal((await manuel('registro', { tabella: 'importazione' })).righe.length, 1);
  assert.ok((await manuel('accessi', { esito: 'ok' })).quante > 0);
});

test('importa: dopo, il server lavora sui dati importati con le stesse regole', async () => {
  const r = await manuel('salvaRapportino', { rapportino: { idLocale: 'imp-1', data: '2026-10-12', idCliente: 'C003', tariffa: 99, oreLavoro: 1 } });
  assert.equal(r.ok, false, 'firmato sul foglio, firmato qui');
  const nuovo = await manuel('salvaRapportino', { rapportino: { idLocale: 'dopo-1', data: '2026-10-21', idCliente: 'C002', idCommessa: '26ST002', tariffa: 42, oreLavoro: 1 } });
  assert.equal(nuovo.ok, true, nuovo.errore);
  const ultimoDelFoglio = Math.max(...delloScript({ azione: 'rapportini', tutti: '1' }).rapportini.filter(x => x.id.startsWith('RAP/2026/')).map(x => Number(x.id.slice(-4))));
  assert.equal(nuovo.rapportino.id, 'RAP/2026/' + String(ultimoDelFoglio + 1).padStart(4, '0'));
  // I file non sono ancora copiati: si dice cosa fare.
  assert.match((await manuel('file', { id: giaUsati.spesa.id })).errore, /copia-drive/);
});

test('copia-drive: copia i file citati dal finto Google (solo letture) e aggiunge i documenti', async () => {
  const server = servi(finto.contesto);
  const url = await ascolta(server);
  try {
    const prima = (finto.fogli.get('Rapportini').celle || []).length;
    const r = await copiaDrive({ da: url + '/exec', dati, codice: 'prova' });
    assert.deepEqual(r.falliti, []);
    assert.equal(r.copiati, 5, 'due foto, una firma, la firma del tecnico e il documento');
    assert.equal((finto.fogli.get('Rapportini').celle || []).length, prima, 'sul foglio non si scrive niente');
    const bin = await manuel.file(giaUsati.spesa.id);
    assert.equal(bin.status, 200);
    assert.deepEqual(Buffer.from(await bin.arrayBuffer()), PNG);
    assert.equal(bin.headers.get('content-type'), 'image/png');
    const doc = await manuel.leggi({ azione: 'documenti', idCommessa: '26ST001' });
    assert.equal(doc.documenti[0].id, giaUsati.documento.id);
    assert.equal(doc.documenti[0].nome, 'Offerta.pdf');
    const ancora = await copiaDrive({ da: url + '/exec', dati, codice: 'prova' });
    assert.equal(ancora.copiati, 0, 'rilanciarla non ricopia');
    const sbagliato = await copiaDrive({ da: url + '/exec', dati: cartellaNuova('codice'), codice: 'sbagliato' }).catch(e => e);
    assert.match(String(sbagliato.message), /Codice sbagliato/);
  } finally {
    await chiudi(server);
    await s.ferma();
  }
});

test('copia-drive prima e importa --file dopo: i file arrivano gia\' copiati', async () => {
  const server = servi(finto.contesto);
  const url = await ascolta(server);
  try {
    const cartella = cartellaNuova('prima');
    const r = await copiaDrive({ da: url + '/exec', dati: cartella, codice: 'prova' });
    assert.deepEqual(r.falliti, []);
    assert.equal(r.copiati, 5);
    assert.ok(fs.existsSync(path.join(cartella, 'file', 'indice-drive.json')));
    const imp = importa({ foglio: esporta(cartella), dati: cartella, file: path.join(cartella, 'file') });
    assert.equal(imp.ok, true, JSON.stringify(imp.errori));
    const w = new Wisper({ dati: cartella });
    try {
      const file = w.db.righe('SELECT * FROM file');
      assert.equal(file.length, 5);
      assert.ok(file.every(f => f.percorso && f.sha256), 'tutti copiati');
      assert.equal(file.find(f => f.id === giaUsati.documento.id).commessa_id, '26ST001');
      assert.equal(file.find(f => f.id === giaUsati.spesa2.id).mime, 'image/jpeg');
    } finally {
      w.chiudi();
    }
  } finally {
    await chiudi(server);
  }
});

test('importa: se qualcosa non torna esce con errore e non lascia il database', () => {
  // Un numero RAP su due righe.
  const cartella = cartellaNuova('rotto');
  const f = finto.fogli.get('Rapportini');
  const copia = f.celle.map(r => r.slice());
  copia.push(copia[1].slice());
  const p = path.join(cartella, 'doppio.xlsx');
  fs.writeFileSync(p, scriviXlsx([{ nome: 'Rapportini', righe: copia }, { nome: 'Clienti', righe: finto.fogli.get('Clienti').celle }, { nome: 'Commesse', righe: finto.fogli.get('Commesse').celle }]));
  const r = spawnSync(process.execPath, [IMPORTA, '--foglio', p, '--dati', cartella], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /RAP\/2026\/0001 è su due righe/);
  assert.equal(fs.existsSync(path.join(cartella, 'wisper.db')), false);
  assert.match(fs.readFileSync(path.join(cartella, 'controllo.html'), 'utf8'), /Non torna/);
  // Un totale che non torna (qui: un difetto finto nella rilettura, un centesimo perso).
  const altra = cartellaNuova('centesimo');
  const vero = Wisper.prototype.leggiRapportini;
  Wisper.prototype.leggiRapportini = function () {
    const out = vero.apply(this, arguments);
    if (out[0]) out[0].totale = Math.round(out[0].totale * 100 - 1) / 100;
    return out;
  };
  try {
    const x = importa({ foglio: esporta(altra), dati: altra });
    assert.equal(x.ok, false);
    assert.ok(x.errori.some(e => /^Non torna mese/.test(e)), JSON.stringify(x.errori));
    assert.equal(fs.existsSync(path.join(altra, 'wisper.db')), false);
  } finally {
    Wisper.prototype.leggiRapportini = vero;
  }
  // Una cartella con gia' un database non si tocca.
  assert.throws(() => importa({ foglio: p, dati }), /c'è già un database/);
});
