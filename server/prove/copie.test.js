// Copie di sicurezza (sul NAS, fuori casa col postino, il foglio), ripristino, migrazioni con
// la copia prima, il ponte per le versioni vecchie e /salute.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { serverDiProva, postinoFinto, cartellaNuova, SEGRETO, PNG } = require('./aiuto');
const { Wisper, SISTEMA } = require('../src/wisper');
const { Database } = require('../src/db');
const { Postino } = require('../src/postino');
const { semina } = require('../src/prova');
const { controllaCopia } = require('../strumenti/ripristina');

const RIPRISTINA = path.join(__dirname, '..', 'strumenti', 'ripristina.js');
const oggiCompatto = () => {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
};

let postino;
let s;
let manuel;
test.before(async () => {
  postino = await postinoFinto();
  s = await serverDiProva({ env: { WISPER_POSTINO_URL: postino.url, WISPER_POSTINO_SEGRETO: SEGRETO } });
  manuel = await s.come('manuel@esempio.it');
});
test.after(async () => { await s.ferma(); await postino.ferma(); });

test('/salute risponde senza accesso', async () => {
  const r = await fetch(s.url + '/salute');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, versione: require('../package.json').version, database: 'ok' });
});

test('copia adesso: il database sul NAS, compresso fuori casa, i file nuovi, e il foglio riscritto', async () => {
  const r = await manuel('salvaRapportino', { rapportino: { idLocale: 'copia-1', data: '2026-10-21', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 } });
  const foto = await manuel('caricaFile', { tipo: 'spesa', idLocale: 'copia-1', idFile: 'c1', mime: 'image/png', base64: PNG.toString('base64') });
  const c = await manuel('copiaAdesso');
  assert.equal(c.ok, true, c.errore);
  assert.equal(c.copia.locale, 'ok');
  assert.match(c.copia.fuori, /^ok/);
  assert.equal(c.copia.foglio, 'ok');
  const nome = 'wisper-' + oggiCompatto() + '.db';
  assert.equal(c.copia.file, nome);
  // Sul NAS
  const locale = path.join(s.dati, 'copie', nome);
  assert.ok(fs.existsSync(locale));
  assert.ok(controllaCopia(locale).rapportini >= 7);
  // Fuori casa: il database compresso e la foto nuova.
  const gz = path.join(postino.cartella, 'copie', 'database', nome + '.gz');
  assert.ok(fs.existsSync(gz));
  const copiaDb = path.join(cartellaNuova('gz'), 'x.db');
  fs.writeFileSync(copiaDb, zlib.gunzipSync(fs.readFileSync(gz)));
  assert.equal(controllaCopia(copiaDb).rapportini, controllaCopia(locale).rapportini);
  const fileFuori = fs.readdirSync(path.join(postino.cartella, 'copie', 'file'));
  assert.ok(fileFuori.some(f => f.startsWith(foto.file.id)), 'la foto nuova e\' andata su Drive');
  // Il foglio: le schede di oggi con le loro intestazioni.
  const rap = JSON.parse(fs.readFileSync(path.join(postino.cartella, 'foglio', 'Rapportini.json'), 'utf8'));
  assert.deepEqual(rap.intestazioni.slice(0, 4), ['ID', 'ID_LOCALE', 'DATA', 'TECNICO']);
  assert.equal(rap.intestazioni.length, 38);
  const riga = rap.righe.find(x => x[0] === r.rapportino.id);
  assert.equal(riga[rap.intestazioni.indexOf('FOTO_SPESE')], '/file/' + foto.file.id);
  assert.equal(riga[rap.intestazioni.indexOf('PAGA_VIAGGIO')], 'NO');
  const cli = JSON.parse(fs.readFileSync(path.join(postino.cartella, 'foglio', 'Clienti.json'), 'utf8'));
  assert.deepEqual(cli.intestazioni, ['ID_CLIENTE', 'RAGIONE_SOCIALE', 'ALIAS', 'GRUPPO', 'EMAIL', 'TELEFONO', 'INDIRIZZO', 'PARTITA_IVA', 'TARIFFA_FISSA',
    'COSTO_FISSO', 'ULTIMA_TARIFFA', 'PAGA_VIAGGIO', 'KM_RIMBORSATI', 'MAGG_EXTRA', 'ACCORPATO_IN', 'NOTE']);
  assert.ok(fs.existsSync(path.join(postino.cartella, 'foglio', 'Commesse.json')));
  const imp = JSON.parse(fs.readFileSync(path.join(postino.cartella, 'foglio', 'Impostazioni.json'), 'utf8'));
  assert.deepEqual(imp.intestazioni, ['CHIAVE', 'VALORE', 'A COSA SERVE']);
  assert.ok(imp.righe.some(x => x[0] === 'EURO_KM' && x[1] === 0.76));
  // E si vede tra le copie, e nel registro.
  const elenco = await manuel('copie');
  assert.equal(elenco.copie[0].id, c.copia.id);
  assert.ok(elenco.file.some(f => f.nome === nome));
  assert.equal((await manuel('registro', { tabella: 'copie' })).righe[0].dopo.locale, 'ok');
  // Una seconda copia lo stesso giorno non rimanda la stessa foto.
  const prima = postino.richieste.filter(x => x.azione === 'postinoCopia' && x.cartella === 'file').length;
  await manuel('copiaAdesso');
  assert.equal(postino.richieste.filter(x => x.azione === 'postinoCopia' && x.cartella === 'file').length, prima);
});

test('la copia fuori casa non riesce due volte di fila: arriva l\'avviso', async () => {
  postino.rompiSolo = 'postinoCopia';
  try {
    const a = await manuel('copiaAdesso');
    assert.match(a.copia.fuori, /^errore: .*Drive pieno/);
    assert.equal(a.copia.locale, 'ok', 'la copia sul NAS c\'e\' lo stesso');
    assert.equal(postino.richieste.filter(x => x.azione === 'postinoEmail' && x.alProprietario).length, 0, 'una volta sola: niente avviso');
    await manuel('copiaAdesso');
    const avvisi = postino.richieste.filter(x => x.azione === 'postinoEmail' && x.alProprietario);
    assert.equal(avvisi.length, 1);
    assert.equal(avvisi[0].oggetto, 'Wisper: la copia fuori casa non riesce');
  } finally {
    postino.rompiSolo = '';
  }
});

test('copia col segreto sbagliato: il postino dice di no e l\'esito lo scrive', async () => {
  const w = new Wisper({ dati: cartellaNuova('segreto'), memoria: true, postino: new Postino({ url: postino.url, segreto: 'sbagliato' }) });
  try {
    const c = await w.copiaDiSicurezza('a mano');
    assert.equal(c.locale, 'ok');
    assert.match(c.fuori, /Segreto sbagliato/);
    assert.match(c.foglio, /Segreto sbagliato/);
  } finally {
    w.chiudi();
  }
});

test('si tengono 30 giorni di copie, piu\' la prima di ogni mese per 12 mesi', () => {
  const w = new Wisper({ dati: cartellaNuova('pulizia'), memoria: true });
  try {
    fs.mkdirSync(w.cartellaCopie, { recursive: true });
    const giorno = n => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return 'wisper-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.db';
    };
    const nomi = [];
    for (let n = 0; n <= 400; n += 1) nomi.push(giorno(n));
    for (const f of nomi) fs.writeFileSync(path.join(w.cartellaCopie, f), 'x');
    fs.writeFileSync(path.join(w.cartellaCopie, 'altro.txt'), 'non si tocca');
    w.pulisciCopie();
    const restano = fs.readdirSync(w.cartellaCopie);
    for (let n = 0; n <= 30; n++) assert.ok(restano.includes(giorno(n)), 'gli ultimi 30 giorni: ' + giorno(n));
    assert.ok(!restano.includes(giorno(400)), 'oltre l\'anno no');
    const vecchie = restano.filter(f => f.startsWith('wisper-') && !nomi.slice(0, 31).includes(f));
    assert.ok(vecchie.length >= 10 && vecchie.length <= 13, 'circa una al mese: ' + vecchie.length);
    assert.ok(vecchie.every(f => /^wisper-\d{6}01\.db$/.test(f) || vecchie.filter(x => x.slice(7, 13) === f.slice(7, 13)).length === 1), 'una per mese');
    assert.ok(restano.includes('altro.txt'));
  } finally {
    w.chiudi();
  }
});

test('la copia notturna parte da sola all\'ora fissata (e se il server era spento, appena riparte)', async () => {
  const dati = cartellaNuova('notturna');
  const w = new Wisper({ dati, memoria: true, postino: new Postino({ cartella: path.join(dati, 'posta') }) });
  try {
    w.pianifica('00:00');
    for (let i = 0; i < 50 && !w.db.riga("SELECT id FROM copie WHERE nota = 'notturna'"); i++) await new Promise(r => setTimeout(r, 100));
    const c = w.db.riga("SELECT * FROM copie WHERE nota = 'notturna'");
    assert.ok(c, 'la copia c\'e\'');
    assert.equal(c.locale, 'ok');
    assert.equal(c.fuori, 'ok');
    assert.ok(fs.existsSync(path.join(dati, 'posta', 'copie', 'database', c.file + '.gz')));
    assert.equal(w.ultimaNotturna, require('../src/utili').oggi(), 'oggi non si rifa');
  } finally {
    w.chiudi();
  }
});

test('ripristino: da una copia (anche compressa), il database di prima resta da parte', () => {
  const dati = cartellaNuova('ripristino');
  let w = new Wisper({ dati });
  semina(w);
  const copia = path.join(dati, 'copia-buona.db');
  w.db.copiaIn(copia);
  w.come(SISTEMA, () => w.db.transazione(() => w.creaCliente({ nome: 'Arrivato Dopo La Copia Srl' })));
  w.chiudi();
  const r = spawnSync(process.execPath, [RIPRISTINA, copia, '--dati', dati], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Ripristinato da .*6 rapportini/);
  assert.match(r.stdout, /prima-del-ripristino/);
  w = new Wisper({ dati });
  try {
    assert.equal(w.leggiClienti().some(c => c.nome === 'Arrivato Dopo La Copia Srl'), false);
    assert.equal(w.db.riga('SELECT COUNT(*) n FROM rapportini').n, 6);
    assert.ok(fs.readdirSync(dati).some(f => /^wisper\.db\.prima-del-ripristino-\d{8}-\d{6}$/.test(f)));
  } finally {
    w.chiudi();
  }
  // Una copia compressa (come quella su Drive) in una cartella vuota.
  const gz = path.join(dati, 'copia.db.gz');
  fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(copia)));
  const altrove = cartellaNuova('ripristino-gz');
  const r2 = spawnSync(process.execPath, [RIPRISTINA, gz, '--dati', altrove], { encoding: 'utf8' });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(controllaCopia(path.join(altrove, 'wisper.db')).utenti, 4);
  // Una copia rovinata non si ripristina, e non si tocca niente.
  const rotta = path.join(dati, 'rotta.db');
  fs.writeFileSync(rotta, 'non sono un database');
  const r3 = spawnSync(process.execPath, [RIPRISTINA, rotta, '--dati', altrove], { encoding: 'utf8' });
  assert.notEqual(r3.status, 0);
  assert.equal(controllaCopia(path.join(altrove, 'wisper.db')).utenti, 4);
});

test('migrazioni: ognuna in ordine, con la copia wisper.db.prima-<n> prima', () => {
  const dati = cartellaNuova('migrazioni');
  const cartella = path.join(dati, 'migrazioni');
  fs.mkdirSync(cartella);
  fs.copyFileSync(path.join(__dirname, '..', 'src', 'migrazioni', '001-base.sql'), path.join(cartella, '001-base.sql'));
  const file = path.join(dati, 'wisper.db');
  let db = new Database(file);
  assert.equal(db.migra(cartella), 1);
  assert.equal(db.versione(), 1);
  assert.equal(fs.existsSync(file + '.prima-1'), false, 'un database nuovo non ha niente da salvare');
  db.esegui("INSERT INTO soggetti (id, nome) VALUES ('C001', 'Prima della migrazione')");
  fs.writeFileSync(path.join(cartella, '002-prova.sql'), 'ALTER TABLE soggetti ADD COLUMN sito TEXT NOT NULL DEFAULT \'\';');
  fs.writeFileSync(path.join(cartella, '003-rotta.sql'), 'ALTER TABLE tabella_che_non_esiste ADD COLUMN x;');
  assert.throws(() => db.migra(cartella), /003-rotta\.sql/);
  assert.equal(db.versione(), 2, 'la 002 e\' fatta, la 003 no');
  assert.ok(fs.existsSync(file + '.prima-2'));
  assert.ok(fs.existsSync(file + '.prima-3'));
  db.chiudi();
  db = new Database(file + '.prima-2');
  assert.equal(db.versione(), 1);
  assert.equal(db.riga('SELECT nome FROM soggetti').nome, 'Prima della migrazione');
  db.chiudi();
});

// ------------------------------------------------------------------ il ponte

test('ponte: col segreto giusto esegue come il titolare, con le URL che le versioni vecchie capiscono', async () => {
  const f = await manuel('caricaFile', { tipo: 'firma', id: 'RAP/2026/0004', idFile: 'firma-ponte', mime: 'image/png', base64: PNG.toString('base64'), firmatario: 'P' });
  const r = await s.ponte({ azione: 'rapportini', tutti: '1', disp: 'telefono-vecchio', dispNome: 'motorola vecchio', app: 'telefono 0.4.0' });
  assert.equal(r.stato, 200);
  assert.equal(r.json.ok, true, r.json.errore);
  const rap = r.json.rapportini.find(x => x.id === 'RAP/2026/0004');
  assert.equal(rap.firma.url, 'https://drive.google.com/file/d/' + f.file.id + '/view', 'l\'id si ricava dal link come prima');
  assert.equal(typeof rap.totale, 'number', 'il titolare vede i soldi');
  const salva = await s.ponte({ azione: 'salvaRapportino', codice: 'il-codice-vecchio', dispNome: 'motorola vecchio', rapportino: { idLocale: 'dal-ponte-1', data: '2026-10-21', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 } });
  assert.equal(salva.json.ok, true, salva.json.errore);
  assert.equal(salva.json.rapportino.idUtente, 1, 'come il titolare');
  const file = await s.ponte({ azione: 'file', id: f.file.id });
  assert.equal(file.json.file.base64, PNG.toString('base64'));
  const reg = await manuel('registro', { tabella: 'rapportini', idRiga: salva.json.rapportino.id });
  assert.match(reg.righe[0].nota, /dalla versione vecchia \(ponte\)/);
  assert.equal(reg.righe[0].disp, 'motorola vecchio', 'il dispositivo e\' quello della richiesta');
  const acc = await manuel('accessi', { esito: 'ponte' });
  assert.ok(acc.righe.some(x => x.dispNome === 'motorola vecchio' && x.azione === 'rapportini'));
  assert.equal(JSON.stringify(acc).includes('il-codice-vecchio'), false, 'il codice non si scrive da nessuna parte');
});

test('ponte: col segreto sbagliato, o senza, HTTP 403', async () => {
  const a = await s.ponte({ azione: 'anagrafiche' }, 'segreto-sbagliato');
  assert.equal(a.stato, 403);
  assert.deepEqual(a.json, { ok: false, errore: 'Segreto sbagliato' });
  const b = await s.ponte({ azione: 'anagrafiche' }, '');
  assert.equal(b.stato, 403);
  const spento = await serverDiProva({ env: { SEGRETO_SERVER: '' } });
  try {
    const c = await spento.ponte({ azione: 'anagrafiche' }, 'qualunque');
    assert.equal(c.stato, 403);
    assert.match(c.json.errore, /Ponte spento/);
  } finally {
    await spento.ferma();
  }
});
