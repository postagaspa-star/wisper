// L'ingresso da internet (README, "Internet entrance"): l'indirizzo vero di chi chiama, le strade che
// passano dalla porta dell'ingresso e il limite per indirizzo sui tentativi di accesso.
// Qui la porta dell'ingresso si chiama come farebbe Caddy (X-Forwarded-For scritto da lui); la prova
// con Caddy vero e' nel README (server/ingresso/Caddyfile.prova).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, cartellaNuova, SEGRETO, PNG } = require('./aiuto');
const { indirizzo, pubblico } = require('../src/provenienza');
const { stradaDaFuori } = require('../src/http');
const { Wisper } = require('../src/wisper');

let s;
test.before(async () => { s = await serverDiProva({ ingresso: true }); });
test.after(() => s.ferma());

/** Una richiesta come la farebbe chi chiama: dove (url), con quali intestazioni. */
async function manda(base, percorso, o) {
  o = o || {};
  const r = await fetch(base + percorso, {
    method: o.metodo || (o.corpo === undefined ? 'GET' : 'POST'),
    headers: Object.assign({}, o.corpo !== undefined && !Buffer.isBuffer(o.corpo) ? { 'Content-Type': 'text/plain;charset=utf-8' } : {}, o.intestazioni || {}),
    body: o.corpo === undefined ? undefined : Buffer.isBuffer(o.corpo) ? o.corpo : JSON.stringify(o.corpo),
  });
  const testo = await r.text();
  let json = null;
  try { json = JSON.parse(testo); } catch (e) { /* non e' JSON */ }
  return { stato: r.status, testo, json };
}
/** accedi dalla porta di casa o dall'ingresso, con un indirizzo in X-Forwarded-For. */
const accedi = (base, email, password, xff, corpoIn) => manda(base, '/exec', {
  corpo: Object.assign({ azione: 'accedi', email, password, disp: 'prove-ingresso', dispNome: 'prove', app: 'prove' }, corpoIn || {}),
  intestazioni: xff ? { 'X-Forwarded-For': xff } : {},
}).then(r => r.json);
const ultimoTentativo = () => s.wisper.db.riga('SELECT * FROM tentativi_accesso ORDER BY id DESC LIMIT 1');
const ultimoAccesso = () => s.wisper.db.riga('SELECT * FROM accessi ORDER BY id DESC LIMIT 1');

test('indirizzi: puliti e pubblici', () => {
  assert.equal(indirizzo('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(indirizzo(' 2001:DB8::1 '), '2001:db8::1');
  assert.equal(indirizzo('[2001:db8::1]'), '2001:db8::1');
  for (const x of ['', 'qualcosa', '1.2.3', '203.0.113.9:443', undefined, null]) assert.equal(indirizzo(x), '', String(x));
  for (const x of ['203.0.113.9', '93.45.12.7', '2a00:1450:4002::1']) assert.equal(pubblico(x), true, x);
  for (const x of ['127.0.0.1', '10.1.2.3', '172.18.0.1', '172.31.255.255', '192.168.1.51', '100.101.102.103', '169.254.1.1', '0.0.0.0',
    '::1', 'fd7a:115c:a1e0::1', 'fe80::1', '']) assert.equal(pubblico(x), false, x);
  assert.equal(pubblico('172.32.0.1'), true, '172.32 non e\' della rete Docker');
});

test('porta di casa: X-Forwarded-For e un "ip" nel corpo non contano, vale la connessione', async () => {
  const r = await accedi(s.url, 'manuel@esempio.it', 'sbagliata', '203.0.113.9', { ip: '198.51.100.7' });
  assert.equal(r.errore, 'Email o password sbagliate');
  const t = ultimoTentativo();
  assert.equal(t.email, 'manuel@esempio.it');
  assert.equal(t.ip, '127.0.0.1', 'l\'indirizzo contato e\' quello della connessione, non quello dell\'intestazione');
  const a = ultimoAccesso();
  assert.deepEqual([a.azione, a.esito, a.ip, a.da_fuori], ['accedi', 'password sbagliata', '127.0.0.1', 0]);
});

test('porta dell\'ingresso: vale l\'ultimo indirizzo di X-Forwarded-For, segnato "da fuori"', async () => {
  const r = await accedi(s.urlIngresso, 'manuel@esempio.it', 'sbagliata', '198.51.100.1, 203.0.113.9', { ip: '198.51.100.7' });
  assert.equal(r.errore, 'Email o password sbagliate');
  assert.equal(ultimoTentativo().ip, '203.0.113.9');
  const a = ultimoAccesso();
  assert.deepEqual([a.ip, a.da_fuori], ['203.0.113.9', 1]);
  // Amministrazione › Accessi lo mostra.
  const manuel = await s.come('manuel@esempio.it');
  const acc = await manuel('accessi', { esito: 'password sbagliata' });
  assert.ok(acc.righe.some(x => x.ip === '203.0.113.9' && x.daFuori === true));
  assert.ok(acc.righe.some(x => x.ip === '127.0.0.1' && x.daFuori === false));
  // Senza intestazione (l'ingresso configurato male): nessun indirizzo inventato, ma resta "da fuori".
  await accedi(s.urlIngresso, 'manuel@esempio.it', 'sbagliata', '');
  assert.deepEqual([ultimoAccesso().ip, ultimoAccesso().da_fuori], ['', 1]);
  assert.equal(ultimoTentativo().ip, '');
});

test('porta dell\'ingresso: passano solo /exec, /carica, /file/<id>, /salute; il resto 404', async () => {
  const i = s.urlIngresso;
  // /salute senza versione (da casa la versione c'e').
  const salute = await manda(i, '/salute');
  assert.equal(salute.stato, 200);
  assert.deepEqual(salute.json, { ok: true, database: 'ok' });
  assert.ok((await manda(s.url, '/salute')).json.versione);
  // /exec: GET e POST rispondono come sempre.
  assert.deepEqual((await manda(i, '/exec?azione=io')).json, { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
  assert.equal((await accedi(i, 'laura@esempio.it', 'prova', '203.0.113.20')).ok, true);
  assert.equal((await manda(i, '/exec/', { corpo: { azione: 'io' } })).json.accesso, false, 'anche con la barra in fondo');
  // /file/<id> e /carica arrivano al server (che chiede l'accesso).
  assert.equal((await manda(i, '/file/qualcosa')).stato, 401);
  assert.equal((await manda(i, '/carica?nome=a.png', { corpo: PNG })).json.accesso, false);
  // Tutto il resto: 404 uguale, senza leggere niente.
  const no = [
    ['/', 'GET'], ['/', 'POST'], ['/ponte', 'POST'], ['/ponte/', 'POST'], ['/condiviso/abc', 'GET'], ['/exec', 'PUT'], ['/exec', 'DELETE'],
    ['/exec', 'OPTIONS'], ['/carica', 'GET'], ['/file/abc', 'POST'], ['/file/', 'GET'], ['/file/a/b', 'GET'], ['/file/..%2Fponte', 'GET'],
    ['/salute', 'POST'], ['/admin', 'GET'], ['/webman/index.cgi', 'GET'], ['/exec.php', 'GET'], ['/EXEC', 'GET'],
  ];
  for (const [p, m] of no) {
    const r = await manda(i, p, { metodo: m, corpo: m === 'GET' || m === 'OPTIONS' ? undefined : { azione: 'io' }, intestazioni: { 'X-Wisper-Segreto': SEGRETO } });
    assert.equal(r.stato, 404, m + ' ' + p);
    assert.equal(r.testo, 'Non trovato', m + ' ' + p);
  }
  // Il ponte da casa c'e' ancora (il segreto giusto basta).
  assert.equal((await s.ponte({ azione: 'stato' })).stato, 200);
});

test('ponte dall\'ingresso solo con WISPER_PONTE_DA_FUORI=si', async () => {
  const c = await serverDiProva({ ingresso: true, env: { WISPER_PONTE_DA_FUORI: 'si' } });
  try {
    const giusto = await manda(c.urlIngresso, '/ponte', { corpo: { azione: 'anagrafiche' }, intestazioni: { 'X-Wisper-Segreto': SEGRETO, 'X-Forwarded-For': '203.0.113.30' } });
    assert.equal(giusto.stato, 200);
    assert.equal(giusto.json.ok, true);
    const sbagliato = await manda(c.urlIngresso, '/ponte', { corpo: { azione: 'anagrafiche' }, intestazioni: { 'X-Wisper-Segreto': 'no', 'X-Forwarded-For': '203.0.113.30' } });
    assert.equal(sbagliato.stato, 403);
    const a = c.wisper.db.riga("SELECT * FROM accessi WHERE esito = 'segreto sbagliato' ORDER BY id DESC LIMIT 1");
    assert.deepEqual([a.ip, a.da_fuori], ['203.0.113.30', 1]);
    assert.equal((await manda(c.urlIngresso, '/ponte', { metodo: 'GET' })).stato, 404, 'solo POST');
  } finally {
    await c.ferma();
  }
});

test('da internet: 20 password sbagliate dallo stesso indirizzo (anche su email diverse) = 15 minuti di attesa per quell\'indirizzo', async () => {
  const ip = '203.0.113.66';
  for (let n = 0; n < 20; n++) {
    assert.equal((await accedi(s.urlIngresso, 'prova' + n + '@esempio.it', 'no', ip)).errore, 'Email o password sbagliate', 'tentativo ' + (n + 1));
  }
  const fermo = await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', ip);
  assert.deepEqual(fermo, { ok: false, errore: 'Troppi tentativi: riprova fra 15 minuti' }, 'anche con la password giusta di un\'altra persona');
  assert.equal(ultimoAccesso().esito, 'bloccato');
  assert.equal((await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', '203.0.113.67')).ok, true, 'un altro indirizzo no');
  assert.equal((await accedi(s.url, 'laura@esempio.it', 'prova', ip)).ok, true, 'da casa no (e l\'intestazione non conta)');
  const manuel = await s.come('manuel@esempio.it');
  const reg = await manuel('registro', { tabella: 'tentativi_accesso' });
  assert.ok(reg.righe.some(r => r.idRiga === ip && /fermato per 15 minuti all'indirizzo 203\.0\.113\.66/.test(r.nota)));
  // Passati i 15 minuti si rientra (qui: i tentativi si fanno "vecchi").
  s.wisper.db.esegui("UPDATE tentativi_accesso SET quando = '2026-01-01T00:00:00+01:00' WHERE ip = ?", ip);
  assert.equal((await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', ip)).ok, true);
});

test('un X-Forwarded-For finto sulla porta di casa non cambia l\'indirizzo contato', async () => {
  const ip = '203.0.113.77';
  // 25 tentativi sbagliati da casa che dicono di venire da 203.0.113.77 ...
  for (let n = 0; n < 25; n++) await accedi(s.url, 'finto' + n + '@esempio.it', 'no', ip);
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM tentativi_accesso WHERE ip = ?', ip).n, 0);
  // ... e quell'indirizzo, da internet, entra.
  assert.equal((await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', ip)).ok, true);
});

test('da internet con un indirizzo non di internet (rete Docker): il limite per indirizzo non vale, quello per email si', async () => {
  const ip = '172.18.0.1';
  for (let n = 0; n < 22; n++) await accedi(s.urlIngresso, 'docker' + n + '@esempio.it', 'no', ip);
  assert.equal((await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', ip)).ok, true, 'non ferma tutti insieme');
  for (let n = 0; n < 10; n++) await accedi(s.urlIngresso, 'lettura@esempio.it', 'no' + n, ip);
  assert.equal((await accedi(s.urlIngresso, 'lettura@esempio.it', 'prova', ip)).errore, 'Troppi tentativi: riprova fra 15 minuti');
  s.wisper.db.esegui("DELETE FROM tentativi_accesso WHERE email = 'lettura@esempio.it'");
});

test('/carica dall\'ingresso: l\'indirizzo vero nel registro degli accessi', async () => {
  const laura = await s.come('laura@esempio.it');
  const r = await manda(s.urlIngresso, '/carica?nome=foto.png&mime=image/png&idFile=ingresso-1&per=documento', {
    corpo: PNG, intestazioni: { Authorization: 'Bearer ' + laura.token, 'X-Forwarded-For': '203.0.113.88', 'Content-Type': 'application/octet-stream' },
  });
  assert.equal(r.json.ok, true, JSON.stringify(r.json));
  const a = s.wisper.db.riga("SELECT * FROM accessi WHERE azione = 'carica' ORDER BY id DESC LIMIT 1");
  assert.deepEqual([a.esito, a.ip, a.da_fuori], ['ok', '203.0.113.88', 1]);
  const f = await fetch(s.urlIngresso + '/file/' + r.json.file.id, { headers: { Authorization: 'Bearer ' + laura.token, 'X-Forwarded-For': '203.0.113.89' } });
  assert.equal(f.status, 200);
  const b = s.wisper.db.riga("SELECT * FROM accessi WHERE azione = 'file' ORDER BY id DESC LIMIT 1");
  assert.deepEqual([b.esito, b.ip, b.da_fuori], ['ok', '203.0.113.89', 1]);
});

test('le strade da fuori, una per una', () => {
  const da = (m, p, ponte) => stradaDaFuori(m, p, { ponte });
  assert.equal(da('GET', '/exec'), true);
  assert.equal(da('POST', '/exec'), true);
  assert.equal(da('HEAD', '/exec'), false);
  assert.equal(da('POST', '/carica'), true);
  assert.equal(da('GET', '/file/qfPF3gZg4GsuwKkLsHfOlgCkaq7l'), true);
  assert.equal(da('GET', '/file/' + 'a'.repeat(65)), false);
  assert.equal(da('GET', '/salute'), true);
  assert.equal(da('POST', '/ponte'), false);
  assert.equal(da('POST', '/ponte', true), true);
  assert.equal(da('GET', '/ponte', true), false);
  assert.equal(da('GET', '/'), false);
});

test('le colonne dell\'indirizzo si aggiungono a un database di prima, e riaprendo non si rifanno', () => {
  const cartella = cartellaNuova('ingresso-colonne');
  let w = new Wisper({ dati: cartella });
  // Un database "di prima": senza le colonne (come quello della 0.9.0 sul NAS).
  w.db.db.exec('DROP INDEX tentativi_ip');
  w.db.db.exec('ALTER TABLE tentativi_accesso DROP COLUMN ip');
  w.db.db.exec('ALTER TABLE accessi DROP COLUMN ip');
  w.db.db.exec('ALTER TABLE accessi DROP COLUMN da_fuori');
  w.db.esegui("INSERT INTO accessi (quando, esito) VALUES ('2026-10-01T10:00:00+02:00', 'ok')");
  w.chiudi();
  w = new Wisper({ dati: cartella });
  const colonne = t => w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
  assert.ok(colonne('accessi').includes('ip') && colonne('accessi').includes('da_fuori'));
  assert.ok(colonne('tentativi_accesso').includes('ip'));
  assert.deepEqual({ ...w.db.riga('SELECT ip, da_fuori FROM accessi') }, { ip: '', da_fuori: 0 }, 'le righe di prima: vuote');
  w.chiudi();
  w = new Wisper({ dati: cartella });
  assert.equal(w.db.righe('PRAGMA table_info(accessi)').filter(c => c.name === 'ip').length, 1);
  w.chiudi();
});

test("da internet: chi sbaglia 10 volte l'email di un altro la blocca solo dal suo indirizzo, non per tutti", async () => {
  const cattivo = '203.0.113.120';
  for (let n = 0; n < 10; n++) await accedi(s.urlIngresso, 'laura@esempio.it', 'no' + n, cattivo);
  assert.equal((await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', cattivo)).errore, 'Troppi tentativi: riprova fra 15 minuti', 'da lì è ferma');
  assert.equal((await accedi(s.urlIngresso, 'laura@esempio.it', 'prova', '203.0.113.121')).ok, true, 'Laura da un altro posto entra');
  assert.equal((await accedi(s.url, 'laura@esempio.it', 'prova')).ok, true, 'e anche da casa');
  // Da tanti indirizzi: 50 sbagliati per la stessa email la fermano per tutti.
  for (let n = 0; n < 50; n++) await accedi(s.urlIngresso, 'lettura@esempio.it', 'no', '198.51.100.' + (n + 1));
  assert.equal((await accedi(s.urlIngresso, 'lettura@esempio.it', 'prova', '198.51.100.200')).errore, 'Troppi tentativi: riprova fra 15 minuti');
  s.wisper.db.esegui("DELETE FROM tentativi_accesso WHERE email IN ('laura@esempio.it', 'lettura@esempio.it')");
});
