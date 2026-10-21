// Il ponte verso il server sul NAS e il postino (Ponte.gs), sul finto Google.
//   node --test "apps-script/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const { contesto, fogli, proprieta, modulo, attivatori, CARTELLA_POSTA } = require('./finto-google.js');

const SEGRETO = 'segreto-di-prova-1234567890';
proprieta.set('SEGRETO_SERVER', SEGRETO);

const post = d => JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify(d) } }).testo);
const get = p => contesto.doGet({ parameter: p });
const posta = () => fs.existsSync(CARTELLA_POSTA) ? fs.readdirSync(CARTELLA_POSTA).sort() : [];
const ultimaEmail = () => fs.readFileSync(path.join(CARTELLA_POSTA, posta().slice(-1)[0], 'email.txt'), 'utf8');
const righe = nome => fogli.get(nome).celle;

test('il postino non risponde senza il segreto, ne\' col codice delle app', () => {
  assert.equal(post({ azione: 'postinoProva' }).errore, 'Segreto sbagliato');
  assert.equal(post({ azione: 'postinoProva', segreto: 'prova' }).errore, 'Segreto sbagliato');
  assert.equal(post({ azione: 'postinoProva', codice: 'prova' }).errore, 'Segreto sbagliato');
  assert.equal(post({ azione: 'postinoProva', segreto: SEGRETO }).ok, true);
});

test('il segreto non finisce nel registro degli accessi', () => {
  post({ azione: 'postinoProva', segreto: SEGRETO });
  assert.ok(!JSON.stringify(righe('Accessi')).includes(SEGRETO));
  const ultima = righe('Accessi').slice(-1)[0];
  assert.equal(ultima[2], 'postinoProva');
  assert.equal(ultima[3], 'Server Wisper (NAS)');
});

test('postinoEmail: email coi PDF dal Gmail del foglio', () => {
  const prima = posta().length;
  const r = post({ azione: 'postinoEmail', segreto: SEGRETO, a: 'rossi@example.com', cc: 'studio@example.com', rispondiA: 'studio@example.com',
    nome: 'Studio Tecnico GM', oggetto: 'Riepilogo di ottobre', messaggio: 'Buongiorno', allegati: [{ nome: 'riepilogo.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 finto').toString('base64') }] });
  assert.equal(r.ok, true);
  assert.equal(typeof r.rimaste, 'number');
  assert.equal(posta().length, prima + 1);
  const testoEmail = ultimaEmail();
  assert.match(testoEmail, /A: rossi@example\.com/);
  assert.match(testoEmail, /CC: studio@example\.com/);
  assert.match(testoEmail, /Rispondi a: studio@example\.com/);
  assert.ok(fs.existsSync(path.join(CARTELLA_POSTA, posta().slice(-1)[0], 'riepilogo.pdf')));
});

test('postinoEmail per gli avvisi va al proprietario, non a chi lo chiede', () => {
  const r = post({ azione: 'postinoEmail', segreto: SEGRETO, a: 'altro@example.com', alProprietario: true, oggetto: 'Wisper: copia non riuscita', messaggio: 'Stanotte...' });
  assert.equal(r.ok, true);
  assert.match(ultimaEmail(), /A: proprietario@example\.com/);
  assert.doesNotMatch(ultimaEmail(), /altro@example\.com/);
});

test('postinoCopia: su Drive in Wisper/Copie NAS, lo stesso nome sostituisce', () => {
  const base64 = Buffer.from('copia del database').toString('base64');
  const a = post({ azione: 'postinoCopia', segreto: SEGRETO, cartella: 'database', nome: 'wisper-20261022.db.gz', mime: 'application/gzip', base64 });
  const b = post({ azione: 'postinoCopia', segreto: SEGRETO, cartella: 'database', nome: 'wisper-20261022.db.gz', mime: 'application/gzip', base64 });
  assert.equal(a.ok, true);
  assert.notEqual(a.id, b.id);
  const radice = contesto.cartellaRadice();
  const dove = radice.getFoldersByName('Copie NAS').next().getFoldersByName('database').next();
  assert.equal(dove.getFilesByName('wisper-20261022.db.gz').hasNext(), true);
  assert.equal(contesto.DriveApp.getFileById(a.id).isTrashed(), true);
  assert.ok(Number(proprieta.get('ULTIMA_COPIA_DATABASE')) > 0);
  assert.match(post({ azione: 'postinoCopia', segreto: SEGRETO, cartella: '../altro', nome: 'x', base64 }).errore, /Cartella/);
  assert.match(post({ azione: 'postinoCopia', segreto: SEGRETO, cartella: 'file', nome: '../x', base64 }).errore, /Nome/);
});

test('postinoFoglio: mai prima del cambio', () => {
  proprieta.delete('SERVER_URL');
  const r = post({ azione: 'postinoFoglio', segreto: SEGRETO, scheda: 'Clienti', intestazioni: ['ID_CLIENTE'], righe: [['C001']] });
  assert.equal(r.ok, false);
  assert.match(r.errore, /dopo il cambio/);
});

test('postinoFoglio: dopo il cambio riscrive la scheda, partite IVA e date comprese', () => {
  proprieta.set('SERVER_URL', 'http://localhost:9/');
  const r = post({ azione: 'postinoFoglio', segreto: SEGRETO, scheda: 'Clienti',
    intestazioni: ['ID_CLIENTE', 'RAGIONE_SOCIALE', 'PARTITA_IVA', 'TELEFONO', 'CREATO'],
    righe: [['C001', 'Elettrodinamica', '01234567890', '0445123456', '2026-10-22'], ['C002', 'Rossi Impianti Srl', '', '', '']] });
  assert.equal(r.ok, true);
  assert.equal(r.righe, 2);
  const celle = righe('Clienti');
  assert.deepEqual(celle[0].slice(0, 5), ['ID_CLIENTE', 'RAGIONE_SOCIALE', 'PARTITA_IVA', 'TELEFONO', 'CREATO']);
  assert.equal(celle[1][2], '01234567890');
  assert.equal(celle[1][3], '0445123456');
  assert.ok(celle[1][4] instanceof Date);
  assert.equal(celle.length, 3);
  assert.match(post({ azione: 'postinoFoglio', segreto: SEGRETO, scheda: 'Accessi', intestazioni: ['X'], righe: [] }).errore, /Scheda non valida/);
  proprieta.delete('SERVER_URL');
});

test('il ponte: con SERVER_URL la richiesta col codice va al server, senza il codice', () => {
  proprieta.set('SERVER_URL', 'https://wisper.esempio.ts.net/');
  modulo.chiamate.length = 0;
  modulo.urlFetch = (url, opzioni) => ({ codice: 200, testo: JSON.stringify({ ok: true, eco: JSON.parse(opzioni.payload), url, segreto: opzioni.headers['X-Wisper-Segreto'] }) });
  const r = post({ codice: 'prova', azione: 'salvaRapportino', rapportino: { idLocale: 'x1' }, disp: 'tel-1' });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://wisper.esempio.ts.net/ponte');
  assert.equal(r.segreto, SEGRETO);
  assert.equal(r.eco.azione, 'salvaRapportino');
  assert.equal(r.eco.metodo, 'POST');
  assert.equal(r.eco.codice, undefined);
  const g = JSON.parse(get({ codice: 'prova', azione: 'rapportini', tutti: '1' }).testo);
  assert.equal(g.eco.metodo, 'GET');
  assert.equal(g.eco.tutti, '1');
  assert.equal(g.eco._metodo, undefined);
  // Il foglio non e' stato toccato: nessun rapportino x1.
  assert.ok(!JSON.stringify(righe('Rapportini')).includes('"x1"'));
  assert.equal(righe('Accessi').slice(-1)[0][1], 'ponte');
  proprieta.delete('SERVER_URL');
});

test('il ponte: codice sbagliato non arriva al server', () => {
  proprieta.set('SERVER_URL', 'https://wisper.esempio.ts.net');
  modulo.chiamate.length = 0;
  const r = post({ codice: 'sbagliato', azione: 'anagrafiche' });
  assert.equal(r.errore, 'Codice sbagliato');
  assert.equal(modulo.chiamate.length, 0);
  proprieta.delete('SERVER_URL');
});

test('il ponte: server giu\' = errore che esce dallo script (le app riprovano, la coda non scarta)', () => {
  proprieta.set('SERVER_URL', 'https://wisper.esempio.ts.net');
  modulo.urlFetch = () => ({ codice: 502, testo: 'Bad gateway' });
  assert.throws(() => post({ codice: 'prova', azione: 'salvaRapportino', rapportino: { idLocale: 'x2' } }), /502/);
  modulo.urlFetch = () => { throw new Error('Indirizzo non raggiungibile'); };
  assert.throws(() => post({ codice: 'prova', azione: 'anagrafiche' }), /raggiungibile/);
  proprieta.delete('SERVER_URL');
});

test('senza SERVER_URL tutto come prima: il foglio risponde da se\'', () => {
  modulo.chiamate.length = 0;
  const r = post({ codice: 'prova', azione: 'anagrafiche' });
  assert.equal(r.ok, true);
  assert.ok(r.clienti.length > 0);
  assert.equal(modulo.chiamate.length, 0);
});

test('controlli del mattino: avviso se il server non risponde o la copia e\' vecchia', () => {
  contesto.installaControlli();
  contesto.installaControlli();
  assert.equal(attivatori.filter(t => t.funzione === 'controlloMattina').length, 1);
  assert.equal(attivatori[0].ora, 7);

  proprieta.set('SERVER_URL', 'https://wisper.esempio.ts.net');
  proprieta.set('ULTIMA_COPIA_DATABASE', String(Date.now()));
  modulo.urlFetch = () => ({ codice: 200, testo: JSON.stringify({ ok: true }) });
  const prima = posta().length;
  contesto.controlloMattina();
  assert.equal(posta().length, prima, 'tutto bene: nessuna email');

  modulo.urlFetch = () => ({ codice: 502, testo: '' });
  contesto.controlloMattina();
  assert.equal(posta().length, prima + 1);
  assert.match(ultimaEmail(), /non risponde bene/);
  contesto.controlloMattina();
  assert.equal(posta().length, prima + 1, 'al massimo una ogni 12 ore');
  proprieta.delete('SERVER_URL');
});
