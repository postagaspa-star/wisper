/*
 * 13/11/2026 (1.4.3): "è cambiato qualcosa?", la domanda di ogni minuto di Wisper Ufficio.
 *
 * Andrea: "il collegamento (quello che si vede in basso a sinistra sul menù, con il pallino verde) si deve aggiornare
 * ogni minuto". La risposta è un'impronta che cambia quando qualcuno scrive; non porta dati e, riuscita, non lascia
 * righe negli accessi.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { oggi } = require('../src/utili');

giornoDeiPrototipi();

let s;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

const accessi = () => s.wisper.db.riga('SELECT COUNT(*) AS n FROM accessi').n;

test('novita: la stessa impronta finché nessuno scrive, un\'altra dopo un rapportino; in lettura e in scrittura', async () => {
  const a = await manuel('novita');
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.match(a.impronta, /^[a-z0-9]+-\d+$/);
  assert.deepEqual(Object.keys(a).filter(k => k !== 'versioni').sort(), ['impronta', 'ok'], 'solo l\'impronta: nessun dato');
  // Leggere non la cambia (nemmeno con la GET, come fa il computer).
  await manuel('anagrafiche');
  await manuel('rapportini');
  assert.equal((await manuel.leggi({ azione: 'novita' })).impronta, a.impronta);
  // Un rapportino scritto dal telefono: l'impronta cambia, e resta quella finché non si scrive ancora.
  const r = await manuel('salvaRapportino', { rapportino: { idLocale: 'nov-1', data: oggi(), tecnico: 'Manuel Gasparotto',
    lavori: [{ idLocale: 'nov-1-1', idCliente: 'C002', descrizione: 'Verifica del quadro', oreLavoro: 1, tariffa: 40 }] } });
  assert.equal(r.ok, true, r.errore);
  const b = await manuel('novita');
  assert.notEqual(b.impronta, a.impronta);
  assert.equal((await manuel('novita')).impronta, b.impronta);
});

test('novita: riuscita non lascia righe negli accessi; senza accesso è rifiutata e la riga c\'è', async () => {
  const prima = accessi();
  for (let i = 0; i < 5; i += 1) assert.equal((await manuel('novita')).ok, true);
  assert.equal(accessi(), prima, 'cinque domande riuscite, nessuna riga');
  const senza = await s.chiama(null, { azione: 'novita' });
  assert.deepEqual([senza.ok, senza.accesso], [false, false]);
  assert.equal(accessi(), prima + 1, 'la domanda rifiutata resta scritta');
  // Le altre letture continuano a lasciare la loro riga.
  await manuel('io');
  assert.equal(accessi(), prima + 2);
});

test('novita: la chiede chiunque sia entrato, anche chi legge soltanto', async () => {
  for (const email of ['laura@esempio.it', 'marco@esempio.it', 'lettura@esempio.it']) {
    const r = await (await s.come(email))('novita');
    assert.equal(r.ok, true, email + ': ' + JSON.stringify(r));
  }
});
