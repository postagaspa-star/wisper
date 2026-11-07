// Fase 7: il portale da capo a fondo sul finto Google (fase7.md §0.1-0.2): lo script del portale (Porta.gs +
// PortaleClienti.gs, finto Google in modalita' portale), il secondo giro di porta.js del server (soloPortale, col segreto
// del portale) e il router. La pagina manda le richieste allo script come farebbe da Netlify; il server le va a prendere.
//   node --test server/prove/
'use strict';

process.env.WISPER_PROGETTO = 'portale';
process.env.WISPER_PORTALE_INDIRIZZO = 'http://localhost:8790';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serverDiProva, SEGRETO, giornoDeiPrototipi, cartellaNuova } = require('./aiuto');

giornoDeiPrototipi();
process.env.WISPER_POSTA_FINTA = cartellaNuova('posta');
const finto = require('../../apps-script/prove/finto-google.js');
const SEGRETO_PORTALE = 'segreto-del-portale-diverso-da-quello-del-foglio';
finto.proprieta.set('SEGRETO_SERVER', SEGRETO_PORTALE);

let google;
let script;
let s;
test.before(async () => {
  google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  await new Promise(r => google.on('listening', r));
  script = 'http://127.0.0.1:' + google.address().port + '/exec';
  s = await serverDiProva({ env: { SEGRETO_SERVER: SEGRETO, WISPER_PORTALE_URL: script, SEGRETO_PORTALE, WISPER_PORTA_ATTESA: '3' }, portaGoogle: true });
  // Il giro del portale si fa vivo prima della prima richiesta (come il NAS vero, sempre collegato).
  for (let i = 0; i < 50 && !s.wisper.portaPortale.ultimoContatto; i++) await new Promise(r => setTimeout(r, 100));
});
test.after(async () => {
  if (s) await s.ferma();
  if (google) await finto.chiudiHttp(google);
});

let sessione = '';
async function pagina(strada, o) {
  o = o || {};
  const r = await fetch(script, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', credentials: 'omit',
    body: JSON.stringify({ portale: 1, v: 1, id: crypto.randomBytes(12).toString('base64url'), strada, metodo: o.metodo || (o.corpo ? 'POST' : 'GET'), sessione: o.sessione === undefined ? sessione : o.sessione,
      pre: o.pre || '', corpo: o.corpo || {}, agente: 'Edge · Windows' }) });
  const t = await r.text();
  return { stato: r.status, cors: r.headers.get('access-control-allow-origin'), json: JSON.parse(t) };
}

function ultimaEmail(a) {
  const dir = path.join(s.dati, 'posta-finta', 'email');
  for (const d of fs.readdirSync(dir).sort().reverse()) {
    const t = fs.readFileSync(path.join(dir, d, 'email.txt'), 'utf8');
    if (t.startsWith('A: ' + a + '\n')) return t;
  }
  return null;
}

test('la pagina chiede allo script del portale, il giro del server porta la risposta del router: HTTP 200, JSON con stato, CORS *', async () => {
  assert.equal(s.wisper.portaPortale.soloPortale, true);
  assert.equal(s.wisper.portaPortale.stato().stato, 'attivo');
  const r = await pagina('studio', { sessione: '' });
  assert.equal(r.stato, 200);
  assert.equal(r.cors, '*');
  assert.equal(r.json.ok, true);
  assert.equal(r.json.stato, 200);
  assert.equal(r.json.studio.nome, 'Studio Tecnico GM');
  // Una strada fuori elenco: il 404 uguale del router (lo script non guarda dentro).
  assert.deepEqual((await pagina('io/../exec', { sessione: '' })).json, { ok: false, errore: 'Richiesta non valida' }, 'la forma la ferma gia\' lo script');
  assert.deepEqual((await pagina('exec', { sessione: '' })).json, { ok: false, stato: 404, errore: 'Non trovato' });
});

test('entrare via Google: entra, il codice dall\'email del postino finto, io, una lettura, esci', async () => {
  const pre = crypto.randomBytes(32).toString('base64url');
  const e = await pagina('entra', { corpo: { email: 'f.ferretti@rossi.example' }, pre, sessione: '' });
  assert.equal(e.json.ok, true);
  let email = null;
  for (let i = 0; i < 40 && !email; i++) { await new Promise(r => setTimeout(r, 100)); email = ultimaEmail('f.ferretti@rossi.example'); }
  const codice = email.match(/è (\d{6})\./)[1];
  const c = await pagina('codice', { corpo: { email: 'f.ferretti@rossi.example', codice }, pre, sessione: '' });
  assert.equal(c.json.ok, true, JSON.stringify(c.json));
  sessione = c.json.sessione;
  const io = await pagina('io');
  assert.equal(io.json.referente.nome, 'Sig. Ferretti');
  const p = await pagina('preventivi');
  assert.ok(p.json.preventivi.some(x => x.etichetta === 'PR/2026/014'));
  const reg = s.wisper.db.riga("SELECT * FROM portale_accessi WHERE azione = 'entrato' AND agente = 'Edge · Windows' ORDER BY id DESC LIMIT 1");
  assert.ok(reg, 'l\'ingresso nel registro degli accessi, col dispositivo della pagina');
  assert.equal(reg.ip, '', 'Google non passa l\'indirizzo IP');
  assert.equal((await pagina('esci', { corpo: { tutti: false } })).json.ok, true);
  assert.equal((await pagina('io')).json.stato, 401);
});

test('collegato: indirizzo scritto, giro che parla con lo script, pagina che risponde col segno del portale; due controlli falliti -> Non si raggiunge', async () => {
  const m = await s.come('manuel@esempio.it');
  const w = s.wisper;
  w.fetchPortale = async () => ({ status: 200, text: async () => '<!doctype html><meta name="wisper-portale" content="1"><title>Portale</title>' });
  const ok = await m('controllaPortale', {});
  assert.equal(ok.collegato, 'si');
  const st = (await m('portale')).stato;
  assert.deepEqual([st.collegato, st.script, st.indirizzo], ['si', 'attivo', 'http://localhost:8790']);
  assert.equal((await m('io')).interfaccia.portaleCollegato, true);
  w.fetchPortale = async () => { throw new Error('non raggiungibile'); };
  await m('controllaPortale', {});
  const due = await m('controllaPortale', {});
  assert.equal(due.collegato, 'no');
  const dash = await m('dashboard', { tutto: true });
  assert.ok(dash.urgenti.some(v => /^Il portale non si raggiunge da fuori dalle \d{1,2}:\d{2}$/.test(v.titolo)));
  assert.ok((await m('notifiche', { soloNuove: true })).notifiche.some(n => n.tipo === 'portale_irraggiungibile'));
  delete w.fetchPortale;
});
