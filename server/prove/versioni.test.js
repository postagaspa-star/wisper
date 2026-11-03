// Gli aggiornamenti annunciati dal NAS (03/11/2026, versioni.js): l'elenco vale solo firmato; quando cambia, ogni
// risposta di /exec porta "versioni" e /campanello (aperto in attesa) si sveglia subito; dalla porta Google non aspetta;
// da internet non passa. Con una chiave di prova generata qui (quella vera sta solo in wisper-keys).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { Vedetta, leggiFirmato } = require('../src/versioni');

giornoDeiPrototipi();

const coppia = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PUBBLICA = coppia.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const altra = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });

function elenco(manifesto, chiavePrivata) {
  const testo = JSON.stringify(manifesto);
  const firma = crypto.sign('sha256', Buffer.from(testo, 'utf8'), { key: chiavePrivata || coppia.privateKey, dsaEncoding: 'der' });
  return { manifesto: testo, firma: firma.toString('base64') };
}

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let github;
let manuel;
const servito = { corpo: elenco({ android: { codice: 9, nome: '1.0.0' }, computer: { versione: '1.0.0' } }) };

test.before(async () => {
  github = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(servito.corpo)); });
  await new Promise(r => github.listen(0, '127.0.0.1', r));
  s = await serverDiProva({ ingresso: true });
  manuel = await s.come('manuel@esempio.it');
  s.wisper.vedetta = new Vedetta({ url: 'http://127.0.0.1:' + github.address().port + '/aggiornamento.json', chiavePubblica: PUBBLICA, w: s.wisper });
});
test.after(async () => { s.wisper.vedetta.ferma(); await s.ferma(); await new Promise(r => github.close(r)); });

test('l\'elenco vale solo con la firma giusta', () => {
  assert.deepEqual(leggiFirmato(elenco({ android: { codice: 10, nome: '1.1.0' } }), PUBBLICA), { android: { codice: 10, nome: '1.1.0' }, computer: null });
  assert.throws(() => leggiFirmato(elenco({ android: { codice: 10, nome: '1.1.0' } }, altra.privateKey), PUBBLICA), /firma/);
  const truccato = elenco({ android: { codice: 10, nome: '1.1.0' } });
  truccato.manifesto = truccato.manifesto.replace('10', '99');
  assert.throws(() => leggiFirmato(truccato, PUBBLICA), /firma/);
  assert.throws(() => leggiFirmato({ manifesto: '{}' }, PUBBLICA), /firma/);
});

test('prima di leggere l\'elenco nessuna risposta porta le versioni; dopo, tutte', async () => {
  assert.equal(ok(await manuel('io')).versioni, undefined);
  await s.wisper.vedetta.controlla();
  const v = ok(await manuel('io')).versioni;
  assert.deepEqual(v, { giro: 1, android: { codice: 9, nome: '1.0.0' }, computer: { versione: '1.0.0' } });
  // Anche le risposte di errore e quelle senza accesso: l'app le legge in silenzio.
  const no = await s.chiama(null, { azione: 'rapportini' });
  assert.equal(no.ok, false);
  assert.equal(no.versioni.giro, 1);
  assert.equal(s.wisper.versioniUltime.telefono, '1.0.0', 'la Dashboard sa l\'ultima versione');
  // Lo stesso elenco riletto non cambia il giro.
  await s.wisper.vedetta.controlla();
  assert.equal(s.wisper.vedetta.giro, 1);
  // Amministrazione › Sistema ha gia' il suo "versioni" (ultime e dispositivi): l'annuncio non lo copre.
  const sistema = ok(await manuel('statoSistema'));
  assert.equal(sistema.versioni.giro, undefined);
  assert.equal(sistema.versioni.ultime.telefono, '1.0.0');
  assert.ok(Array.isArray(sistema.versioni.dispositivi));
});

test('il campanello: col giro vecchio risponde subito; con quello giusto aspetta e si sveglia alla versione nuova', async () => {
  const subito = await (await fetch(s.url + '/campanello?giro=0')).json();
  assert.deepEqual([subito.ok, subito.giro, subito.versioni.android.codice], [true, 1, 9]);
  // Nessun cambio: aspetta il tempo chiesto e risponde lo stesso giro.
  const t0 = Date.now();
  const fermo = await (await fetch(s.url + '/campanello?giro=1&ms=300')).json();
  assert.equal(fermo.giro, 1);
  assert.ok(Date.now() - t0 >= 250, 'ha aspettato');
  // In attesa: arriva la versione nuova e si sveglia prima del tempo.
  const attesa = fetch(s.url + '/campanello?giro=1&ms=20000').then(r => r.json());
  await new Promise(r => setTimeout(r, 100));
  assert.equal(s.wisper.vedetta.inAttesa.size, 1);
  servito.corpo = elenco({ android: { codice: 10, nome: '1.1.0' }, computer: { versione: '1.1.0' } });
  const t1 = Date.now();
  await s.wisper.vedetta.controlla();
  const svegliato = await attesa;
  assert.ok(Date.now() - t1 < 2000, 'subito');
  assert.deepEqual([svegliato.giro, svegliato.versioni.android.codice, svegliato.versioni.computer.versione], [2, 10, '1.1.0']);
  assert.equal(ok(await manuel('io')).versioni.android.codice, 10);
  // Un elenco con la firma sbagliata non sveglia nessuno e non cambia niente.
  servito.corpo = elenco({ android: { codice: 99, nome: '9.9.9' } }, altra.privateKey);
  await assert.rejects(s.wisper.vedetta.controlla(), /firma/);
  assert.deepEqual([s.wisper.vedetta.giro, s.wisper.vedetta.versioni.android.codice], [2, 10]);
  assert.match(s.wisper.vedetta.stato().errore, /firma/);
});

test('dalla porta Google non aspetta; da internet il campanello non c\'e\'', async () => {
  const { richiestaInterna } = require('../src/http');
  const t0 = Date.now();
  const r = await richiestaInterna(s.wisper, {}, { metodo: 'GET', percorso: '/campanello', query: { giro: String(s.wisper.vedetta.giro), ms: '20000' } }, { ip: 'google', daFuori: true });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(JSON.parse(r.corpo.toString()).giro, s.wisper.vedetta.giro);
  const fuori = await fetch(s.urlIngresso + '/campanello?giro=0');
  assert.equal(fuori.status, 404);
});
