// Il ponte dall'altra parte: un'app vecchia chiama lo script col CODICE, lo script
// (apps-script/Ponte.gs, nel finto Google) inoltra al server vero, il server risponde
// come il titolare. Il server gira in un processo a parte: il finto UrlFetchApp e' sincrono.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { SEGRETO, cartellaNuova } = require('./aiuto');

const PONTE = path.join(__dirname, '..', '..', 'apps-script', 'Ponte.gs');
const salta = !fs.existsSync(PONTE) && 'manca apps-script/Ponte.gs';

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));

function portaLibera() {
  return new Promise(r => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

let figlio;
let finto;
let url;
test.before(async () => {
  if (salta) return;
  const porta = await portaLibera();
  url = 'http://127.0.0.1:' + porta;
  figlio = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'avvio.js'), '--dati', cartellaNuova('ponte-vero'), '--porta', String(porta), '--prova'], {
    env: Object.assign({}, process.env, { SEGRETO_SERVER: SEGRETO, WISPER_POSTINO_URL: '' }), stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((r, no) => {
    const t = setTimeout(() => no(new Error('il server non parte')), 15000);
    figlio.stdout.on('data', d => { if (/Wisper server/.test(String(d))) { clearTimeout(t); r(); } });
  });
  finto = require('../../apps-script/prove/finto-google.js');
  finto.proprieta.set('SERVER_URL', url);
  finto.proprieta.set('SEGRETO_SERVER', SEGRETO);
});
test.after(() => { if (figlio) figlio.kill(); });

const get = p => JSON.parse(finto.contesto.doGet({ parameter: Object.assign({ codice: 'prova', disp: 'telefono-vecchio', dispNome: 'telefono 0.4.0' }, p) }).testo);
const post = d => JSON.parse(finto.contesto.doPost({ postData: { contents: JSON.stringify(Object.assign({ codice: 'prova', disp: 'ufficio-vecchio', dispNome: 'ufficio 0.3.6' }, d)) } }).testo);

test('un\'app vecchia legge dal server attraverso lo script', { skip: salta }, () => {
  const a = get({});
  assert.equal(a.ok, true, a.errore);
  assert.ok(a.fornitori, 'e\' la risposta del server (ha i fornitori)');
  const r = get({ azione: 'rapportini', tutti: '1' });
  // 4 dello script, 2 di Marco, 7 della fase 4 (settembre di Elettrodinamica e il collaudo di Rossi), 2 dei ticket della fase 5.
  assert.equal(r.rapportini.length, 15);
  assert.equal(typeof r.rapportini[0].totale, 'number', 'come il titolare');
});

test('un rapportino rimasto in coda su un telefono vecchio arriva sul server', { skip: salta }, () => {
  const r = post({ azione: 'salvaRapportino', rapportino: { idLocale: 'coda-vecchia-1', data: '2026-10-21', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 } });
  assert.equal(r.ok, true, r.errore);
  // Fase 5: i due rapportini dei ticket sono RAP/2026/0014 e 0015.
  assert.equal(r.rapportino.id, 'RAP/2026/0016');
  const ripetuto = post({ azione: 'salvaRapportino', rapportino: { idLocale: 'coda-vecchia-1', data: '2026-10-21', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 } });
  assert.equal(ripetuto.rapportino.id, 'RAP/2026/0016', 'ripetuto: la stessa riga');
});

test('col codice sbagliato lo script non inoltra niente', { skip: salta }, () => {
  const r = JSON.parse(finto.contesto.doGet({ parameter: { codice: 'sbagliato', azione: 'rapportini' } }).testo);
  assert.deepEqual(r, { ok: false, errore: 'Codice sbagliato' });
});

test('se il segreto non coincide il server risponde 403 e lo script fa riprovare (errore, non ok:false)', { skip: salta }, () => {
  finto.proprieta.set('SEGRETO_SERVER', 'un-altro');
  try {
    assert.throws(() => finto.contesto.doGet({ parameter: { codice: 'prova', azione: 'rapportini' } }), /403/);
  } finally {
    finto.proprieta.set('SEGRETO_SERVER', SEGRETO);
  }
});
