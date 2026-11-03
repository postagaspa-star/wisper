// Lo script del portale clienti (PortaleClienti.gs + Porta.gs) sul finto Google in modalita' portale
// (WISPER_PROGETTO=portale): la pagina manda le richieste, un "NAS" finto scritto qui le va a prendere con portaPrendi.
// La prova col server vero (il giro del portale e il router) sta in server/prove/portale-google.test.js.
//   node --test "apps-script/prove/*.test.js"
'use strict';

process.env.WISPER_PROGETTO = 'portale';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const finto = require('./finto-google.js');

const SEGRETO = 'segreto-del-portale-0987654321';
finto.proprieta.set('SEGRETO_SERVER', SEGRETO);

let google;
let url;
test.before(() => new Promise(r => {
  google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  google.on('listening', () => { url = 'http://127.0.0.1:' + google.address().port + '/exec'; r(); });
}));
test.after(() => finto.chiudiHttp(google));

const dormi = ms => new Promise(r => setTimeout(r, ms));

async function manda(corpo, grezzo) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: grezzo !== undefined ? grezzo : JSON.stringify(corpo) });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch (e) { j = { html: t }; }
  return { stato: r.status, cors: r.headers.get('access-control-allow-origin'), json: j };
}

const pagina = altro => manda(Object.assign({ portale: 1, v: 1, id: 'pagina-' + Math.random().toString(36).slice(2, 14), strada: 'studio', metodo: 'GET', sessione: '', pre: '',
  corpo: {}, agente: 'Chrome · Android' }, altro));

/** Il NAS finto: chiama portaPrendi di continuo e risponde con rispondi(lavoro). */
async function nasFinto(rispondi) {
  await manda({ azione: 'portaPrendi', segreto: SEGRETO, attesa: 0 });
  let acceso = true;
  const visti = [];
  const giro = (async () => {
    let pronte = [];
    while (acceso) {
      const r = (await manda({ azione: 'portaPrendi', segreto: SEGRETO, attesa: 1, risposte: pronte })).json;
      pronte = [];
      if (!r.ok) throw new Error('portaPrendi: ' + (r.errore || r.html));
      for (const l of r.lavori) {
        visti.push(l);
        pronte.push({ id: l.id, risposta: await rispondi(l) });
      }
    }
    if (pronte.length) await manda({ azione: 'portaConsegna', segreto: SEGRETO, risposte: pronte });
  })();
  return { visti, ferma: async () => { acceso = false; await giro; } };
}

function svuota() {
  for (const k of Array.from(finto.memoria.keys())) if (k.startsWith('porta:')) finto.memoria.delete(k);
}

test('i file del progetto: solo Porta.gs (identico a quello del foglio) e PortaleClienti.gs; niente foglio, niente codice', () => {
  // Il finto Google in modalita' portale carica questi due file e nessun altro.
  assert.equal(typeof finto.contesto.doPost, 'function');
  assert.equal(typeof finto.contesto.portaChiedi, 'function', 'Porta.gs caricato');
  assert.equal(typeof finto.contesto.portaleRispondi, 'function', 'PortaleClienti.gs caricato');
  assert.equal(typeof finto.contesto.preparaFoglio, 'undefined', 'Code.gs non c\'e\'');
  assert.equal(finto.proprieta.get('CODICE'), undefined, 'nessun codice delle app');
  // Le funzioni che Porta.gs usa da Code.gs e Ponte.gs sono definite nel progetto del portale.
  for (const f of ['testo', 'messaggio', 'segretoUguale', 'registraAccesso', 'cartellaRadice']) assert.equal(typeof finto.contesto[f], 'function', f);
  assert.equal(finto.contesto.FUSO, 'Europe/Rome');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'PortaleClienti.gs'), 'utf8');
  // Nessun indirizzo di uno script Google dentro (quello del foglio resta segreto e non sta da nessuna parte).
  assert.doesNotMatch(gs, /script\.google\.com\/macros\/s\//);
  assert.doesNotMatch(gs, /AKfyc/);
});

test('doGet: una riga di testo, niente dati', async () => {
  const r = await fetch(url);
  const t = await r.text();
  assert.equal(r.status, 200);
  assert.match(t, /^Portale clienti: questo indirizzo risponde solo alla pagina del portale\.$/);
});

test('la forma: portale 1, strada giusta, corpo oggetto; tutto il resto "Richiesta non valida" (anche le richieste delle app del foglio)', async () => {
  svuota();
  const n = await nasFinto(l => ({ ok: true, stato: 200 }));
  const no = { ok: false, errore: 'Richiesta non valida' };
  assert.deepEqual((await manda(null, 'non e\' json')).json, no);
  assert.deepEqual((await pagina({ portale: 2 })).json, no);
  assert.deepEqual((await pagina({ strada: '../exec' })).json, no);
  assert.deepEqual((await pagina({ strada: 'preventivi/..' })).json, no);
  assert.deepEqual((await pagina({ strada: 'Exec' })).json, no);
  assert.deepEqual((await pagina({ strada: 'a/b/c/d/e' })).json, no);
  assert.deepEqual((await pagina({ corpo: [1, 2] })).json, no);
  assert.deepEqual((await pagina({ corpo: 'testo' })).json, no);
  // Una richiesta di un'app del foglio (porta: 1) qui non passa: questo script e' solo del portale.
  assert.deepEqual((await manda({ porta: 1, id: 'app-del-foglio-01', token: 'x', strada: 'exec', dati: { azione: 'io' } })).json, no);
  await n.ferma();
  assert.equal(n.visti.length, 0, 'nessuna di queste e\' arrivata al NAS');
});

test('una richiesta della pagina va in coda come lavoro "portale", il NAS la prende, la risposta (con stato) torna alla pagina, con CORS *', async () => {
  svuota();
  const n = await nasFinto(l => ({ ok: true, stato: 200, eco: { tipo: l.lavoro.tipo, strada: l.lavoro.strada, metodo: l.lavoro.metodo, sessione: l.lavoro.sessione, pre: l.lavoro.pre,
    corpo: l.lavoro.corpo, agente: l.lavoro.agente, v: l.lavoro.v, id: l.lavoro.id } }));
  const r = await pagina({ id: 'q7Kp2xRw9sLm4tVbX2', strada: 'preventivi/12/accetta', metodo: 'POST', sessione: 'token-di-sessione', pre: '',
    corpo: { scelte: { 14: true }, nome: 'Roberto Ferretti', nota: 'caffè e però' }, altro: 'si butta' });
  await n.ferma();
  assert.equal(r.stato, 200);
  assert.equal(r.cors, '*', 'Access-Control-Allow-Origin: * come Google dopo il rimbalzo');
  assert.equal(r.json.ok, true, JSON.stringify(r.json));
  assert.deepEqual(r.json.eco, { tipo: 'portale', strada: 'preventivi/12/accetta', metodo: 'POST', sessione: 'token-di-sessione', pre: '',
    corpo: { scelte: { 14: true }, nome: 'Roberto Ferretti', nota: 'caffè e però' }, agente: 'Chrome · Android', v: 1, id: 'q7Kp2xRw9sLm4tVbX2' });
  assert.equal(n.visti.length, 1);
  assert.equal(n.visti[0].id, 'q7Kp2xRw9sLm4tVbX2', 'l\'id della pagina e\' l\'id della coda (una POST ripetuta non si fa due volte)');
  assert.equal('altro' in n.visti[0].lavoro, false, 'i campi fuori dal protocollo non passano');
});

test('la stessa richiesta ripetuta (stesso id) non si rifa: la risposta gia\' arrivata torna uguale', async () => {
  svuota();
  let volte = 0;
  const n = await nasFinto(() => { volte++; return { ok: true, stato: 200, volta: volte }; });
  const a = await pagina({ id: 'stessa-richiesta-0001', strada: 'esci', metodo: 'POST' });
  await n.ferma();
  assert.equal(a.json.volta, 1);
  // Il NAS non c'e' piu' a prendere: la risposta resta quella (Porta.gs la tiene finche' non la consegna; qui gia' consegnata).
  assert.equal(volte, 1);
});

test('NAS spento: subito "riprova" (rete, porta spento); senza segreto: spento; il NAS lento: attesa (PORTALE_ATTESA_MS)', async () => {
  svuota();
  const r = await pagina({});
  assert.equal(r.json.ok, false);
  assert.equal(r.json.rete, true);
  assert.equal(r.json.porta, 'spento');
  // Il NAS c'e' ma non risponde: dopo PORTALE_ATTESA_MS la pagina riceve "attesa".
  finto.proprieta.set('PORTALE_ATTESA_MS', '600');
  await manda({ azione: 'portaPrendi', segreto: SEGRETO, attesa: 0 });
  const inizio = Date.now();
  const lenta = await pagina({ id: 'richiesta-lenta-0001' });
  finto.proprieta.delete('PORTALE_ATTESA_MS');
  assert.equal(lenta.json.porta, 'attesa');
  assert.equal(lenta.json.rete, true);
  assert.ok(Date.now() - inizio < 5000);
  // Mai oltre 20 secondi, anche se la proprieta' chiedesse di piu'.
  assert.equal(finto.contesto.portaleAttesa({ PORTALE_ATTESA_MS: '90000' }), 20000);
  assert.equal(finto.contesto.portaleAttesa({}), 20000);
  // Senza SEGRETO_SERVER la porta non e' collegata: "spento" subito.
  svuota();
  finto.proprieta.delete('SEGRETO_SERVER');
  const senza = await pagina({});
  finto.proprieta.set('SEGRETO_SERVER', SEGRETO);
  assert.equal(senza.json.porta, 'spento');
  await dormi(10);
});

test('il NAS col segreto sbagliato non prende niente', async () => {
  const r = (await manda({ azione: 'portaPrendi', segreto: 'sbagliato', attesa: 0 })).json;
  assert.deepEqual(r, { ok: false, errore: 'Segreto sbagliato' });
});

// ---------------------------------------------------------------- fase 8 (fase8.md §0.3): il calendario "anche fuori casa"

const CHIAVE = 'Q2hpYXZlRGlQcm92YURlbENhbGVuZGFyaW9GdW9yaUNh';
const leggiCalendario = async chiave => {
  const r = await fetch(url + '?calendario=' + encodeURIComponent(chiave));
  return { stato: r.status, tipo: r.headers.get('content-type'), testo: await r.text() };
};

test('calendario fuori casa: GET ?calendario=<chiave> va in coda come lavoro "portale" (strada calendario, GET, corpo {chiave}) e torna text/calendar', async () => {
  svuota();
  const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
  const n = await nasFinto(l => (l.lavoro.strada === 'calendario' && l.lavoro.corpo.chiave === CHIAVE ? { ok: true, stato: 200, ics } : { ok: false, stato: 404 }));
  const r = await leggiCalendario(CHIAVE);
  await n.ferma();
  assert.equal(r.stato, 200);
  assert.match(r.tipo, /^text\/calendar/);
  assert.equal(r.testo, ics);
  assert.equal(n.visti.length, 1);
  const l = n.visti[0].lavoro;
  assert.deepEqual([l.tipo, l.strada, l.metodo, l.v, l.corpo], ['portale', 'calendario', 'GET', 1, { chiave: CHIAVE }]);
  assert.equal(l.sessione, '', 'senza sessione: la chiave e\' il permesso');
});

test('calendario fuori casa: senza calendario la stessa riga di testo (chiave sconosciuta, forma sbagliata, NAS spento, risposta strana)', async () => {
  const no = 'Indirizzo del calendario non valido';
  // Il server dice di no (chiave sconosciuta, tolta, utente disattivato, troppe letture, calendario spento: tutto uguale).
  svuota();
  let n = await nasFinto(() => ({ ok: false, stato: 404, errore: no }));
  let r = await leggiCalendario(CHIAVE);
  await n.ferma();
  assert.equal(r.testo, no);
  assert.match(r.tipo, /^text\/plain/);
  // Una chiave con la forma sbagliata non arriva nemmeno al NAS.
  svuota();
  n = await nasFinto(() => ({ ok: true, stato: 200, ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' }));
  r = await leggiCalendario('corta');
  const r2 = await leggiCalendario('../exec?x=' + CHIAVE);
  await n.ferma();
  assert.equal(r.testo, no);
  assert.equal(r2.testo, no);
  assert.equal(n.visti.length, 0);
  // Una risposta che non e' un calendario non passa.
  svuota();
  n = await nasFinto(() => ({ ok: true, stato: 200, ics: '<html>no</html>' }));
  r = await leggiCalendario(CHIAVE);
  await n.ferma();
  assert.equal(r.testo, no);
  // NAS spento: subito la riga di testo.
  svuota();
  r = await leggiCalendario(CHIAVE);
  assert.equal(r.testo, no);
  // Senza il parametro, doGet risponde come prima.
  const g = await fetch(url);
  assert.match(await g.text(), /^Portale clienti: questo indirizzo risponde solo alla pagina del portale\.$/);
});
