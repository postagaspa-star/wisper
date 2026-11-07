// Fase 8 (fase8.md §0.3, §16): il calendario "anche fuori casa" da capo a fondo sul finto Google in modo portale.
// Google Calendar (qui fetch) chiede GET <script del portale>?calendario=<chiave>; lo script (PortaleClienti.gs) lo mette
// in coda, il secondo giro di porta.js del server lo prende e il router del portale lo passa a calendario.js. Risponde
// solo ai feed pubblici e solo con CALENDARIO_PUBBLICO acceso; senza, sempre "Indirizzo del calendario non valido".
//   node --test server/prove/
'use strict';

process.env.WISPER_PROGETTO = 'portale';
process.env.WISPER_PORTALE_INDIRIZZO = 'http://localhost:8790';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serverDiProva, SEGRETO, giornoDeiPrototipi, cartellaNuova } = require('./aiuto');
const { controllaIcs } = require('../src/calendario');

giornoDeiPrototipi();
process.env.WISPER_POSTA_FINTA = cartellaNuova('posta');
const finto = require('../../apps-script/prove/finto-google.js');
const SEGRETO_PORTALE = 'segreto-del-portale-per-il-calendario-di-prova';
finto.proprieta.set('SEGRETO_SERVER', SEGRETO_PORTALE);

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let google;
let script;
let s;
test.before(async () => {
  google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  await new Promise(r => google.on('listening', r));
  script = 'http://127.0.0.1:' + google.address().port + '/exec';
  process.env.WISPER_PORTALE_URL = script;
  s = await serverDiProva({ env: { SEGRETO_SERVER: SEGRETO, WISPER_PORTALE_URL: script, SEGRETO_PORTALE, WISPER_PORTA_ATTESA: '3' }, portaGoogle: true });
  for (let i = 0; i < 50 && !s.wisper.portaPortale.ultimoContatto; i++) await new Promise(r => setTimeout(r, 100));
  // La pagina del portale "risponde" (le prove non vanno su internet): il controllo del portale e' riuscito.
  s.wisper.fetchPortale = async () => ({ status: 200, text: async () => '<meta name="wisper-portale" content="1">' });
  s.wisper.db.transazione(() => s.wisper.salvaImpostazioni({ PORTALE_ATTIVO: true }));
});
test.after(async () => {
  delete process.env.WISPER_PORTALE_URL;
  if (s) await s.ferma();
  if (google) await finto.chiudiHttp(google);
});

const leggi = async chiave => {
  const r = await fetch(script + '?calendario=' + encodeURIComponent(chiave));
  return { stato: r.status, tipo: r.headers.get('content-type'), testo: await r.text() };
};

test('fuori casa: il portale Collegato, CALENDARIO_PUBBLICO acceso da chi ha Amministrazione: Modifica; il feed pubblico passa dallo script e nasce senza dettagli', async () => {
  const manuel = await s.come('manuel@esempio.it');
  // Prima il portale deve essere Collegato.
  const st = await s.wisper.controllaIntegrazione('portale');
  assert.equal(st.stato, 'collegato', st.esito);
  ok(await manuel('salvaIntegrazione', { chiave: 'calendario', impostazioni: { CALENDARIO_PUBBLICO: true } }));
  const integ = ok(await manuel('integrazioni')).integrazioni.find(v => v.chiave === 'calendariopubblico');
  assert.equal(integ.stato, 'collegato', 'acceso, segue il portale');
  // Coi dettagli serve la conferma; di base senza.
  const conDettagli = await manuel('nuovoFeed', { nome: 'Google Calendar', cosa: { attivita: 'mie' }, pubblico: true, dettagli: true });
  assert.deepEqual([conDettagli.ok, conDettagli.conferma, conDettagli.errore], [false, true, 'Titoli, luoghi e clienti passeranno dai server di Google o Microsoft']);
  const f = ok(await manuel('nuovoFeed', { nome: 'Google Calendar', cosa: { attivita: 'mie' }, pubblico: true }));
  assert.equal(f.feed.pubblico, true);
  assert.equal(f.feed.dettagli, false);
  assert.ok(f.indirizzo.startsWith(script + '?calendario='), 'l\'indirizzo dello script del portale');
  assert.equal(f.webcal, f.indirizzo.replace('http://', 'webcal://'));
  const chiave = f.indirizzo.split('?calendario=')[1];
  const r = await leggi(chiave);
  assert.equal(r.stato, 200);
  assert.match(r.tipo, /^text\/calendar/);
  assert.deepEqual(controllaIcs(r.testo), []);
  assert.doesNotMatch(r.testo, /\r\n(LOCATION|DESCRIPTION):/);
  assert.ok(s.wisper.db.riga('SELECT letture FROM calendario_feed WHERE id = ?', f.feed.id).letture >= 1);
  // Un feed di casa dallo script: niente. Una chiave sconosciuta: la stessa riga.
  const casa = ok(await manuel('nuovoFeed', { nome: 'Telefono', cosa: { attivita: 'mie' } }));
  const chiaveCasa = casa.indirizzo.match(/calendario\/(.+)\.ics$/)[1];
  assert.equal((await leggi(chiaveCasa)).testo, 'Indirizzo del calendario non valido');
  assert.equal((await leggi('A'.repeat(43))).testo, 'Indirizzo del calendario non valido');
  // Spento CALENDARIO_PUBBLICO, tutti i feed pubblici si chiudono subito.
  ok(await manuel('salvaIntegrazione', { chiave: 'calendario', impostazioni: { CALENDARIO_PUBBLICO: false } }));
  const chiuso = await leggi(chiave);
  assert.deepEqual([chiuso.testo, /^text\/plain/.test(chiuso.tipo)], ['Indirizzo del calendario non valido', true]);
});
