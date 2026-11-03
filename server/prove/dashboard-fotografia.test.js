// Fase 8 (prova di carico, T15): la Dashboard riscritta per leggere una volta sola deve dare le stesse risposte di prima.
// La fotografia (prove/dashboard-fotografia/atteso.json: le impronte SHA-256 di ogni risposta, di ogni campo e di ogni
// voce, piu' quattro risposte intere; vedi dashboard-fotografia/impronte.js) e' stata fatta col codice di PRIMA della riscrittura, coi
// comandi qui sotto (WISPER_RIFAI_FOTOGRAFIA=si), e non si rifa' per far passare la prova: un numero diverso e' un
// errore della riscrittura.
//
// Cosa contiene: le risposte intere di dashboard e dashboard {tutto}
//  - coi dati di esempio (src/prova.js, seminati quel giorno) per manuel (titolare), laura (amministrazione), marco
//    (collaboratore), lettura e luca (esterno);
//  - con un anno di dati finti (strumenti/dati-finti.js, seme fisso, fino al 31/12/2026) per il titolare,
//    l'amministrazione e un collaboratore;
// in quattro istanti fermi dell'orologio (Date finto, alle 10:00): giovedi' 22/10/2026 (il giorno dei prototipi),
// giovedi' 12/11/2026 (un giorno qualunque), lunedi' 30/11/2026 (fine mese), venerdi' 01/01/2027 (inizio anno, festa).
// Tolto prima del confronto un solo campo, numeri.spazio.liberoMb: lo spazio libero vero del disco, che cambia fra un
// giro e l'altro anche col codice di prima (due fotografie di fila sono uguali in tutto il resto). Nessun campo dipende
// dall'ora, perche' l'orologio e' fermo.
//   node --test server/prove/      (rifare la fotografia, SOLO col codice di prima: WISPER_RIFAI_FOTOGRAFIA=si)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

delete process.env.WISPER_OGGI_PROVA;   // l'orologio lo ferma questa prova, non prove-giorni
const { serverDiProva, cartellaNuova } = require('./aiuto');
const { datiFinti } = require('../strumenti/dati-finti');
const { impronta, differenza } = require('./dashboard-fotografia/impronte');

const FILE = path.join(__dirname, 'dashboard-fotografia', 'atteso.json');
const RIFAI = process.env.WISPER_RIFAI_FOTOGRAFIA === 'si';
const ISTANTI = ['2026-10-22T10:00:00', '2026-11-12T10:00:00', '2026-11-30T10:00:00', '2027-01-01T10:00:00'];
const PROVA = ['manuel@esempio.it', 'laura@esempio.it', 'marco@esempio.it', 'lettura@esempio.it', 'luca@esempio.it'];
const FINTI = ['manuel@esempio.it', 'persona1@esempio.it', 'persona2@esempio.it'];
/** I campi tolti prima del confronto (a qualunque profondita'): vedi in cima. */
const CAMPI_TOLTI = new Set(['liberoMb']);
/** Le risposte che restano intere nella fotografia (le altre solo con le impronte): manuel e lettura del 30/11. */
const INTERE = ['esempio 2026-11-30 · manuel@esempio.it', 'esempio 2026-11-30 · manuel@esempio.it · tutto',
  'esempio 2026-11-30 · lettura@esempio.it', 'esempio 2026-11-30 · lettura@esempio.it · tutto'];

function pulito(x) {
  if (Array.isArray(x)) return x.map(pulito);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) if (!CAMPI_TOLTI.has(k)) o[k] = pulito(x[k]);
    return o;
  }
  return x;
}

function ferma(istante) {
  test.mock.timers.reset();
  test.mock.timers.enable({ apis: ['Date'], now: new Date(istante).getTime() });
}

async function giro(s, emails, chiave, fuori) {
  for (const e of emails) {
    const chi = await s.come(e, 'prova');
    for (const tutto of [false, true]) {
      const r = await chi('dashboard', tutto ? { tutto: true } : {});
      assert.equal(r.ok, true, e + ' ' + JSON.stringify(r).slice(0, 200));
      fuori[chiave + ' · ' + e + (tutto ? ' · tutto' : '')] = pulito(r);
    }
  }
}

test('la Dashboard (normale e {tutto}) uguale alla fotografia fatta col codice di prima: dati di esempio e un anno di dati finti, quattro giorni', async () => {
  const ora = {};
  try {
    // I dati di esempio, seminati ogni giorno (sono scritti rispetto a "oggi").
    for (const istante of ISTANTI) {
      ferma(istante);
      const s = await serverDiProva();
      try { await giro(s, PROVA, 'esempio ' + istante.slice(0, 10), ora); } finally { await s.ferma(); }
    }
    // Un anno di dati finti, fatti una volta (seme fisso), guardati nei quattro giorni.
    ferma('2026-12-31T20:00:00');
    const dati = cartellaNuova('fotografia-finti');
    datiFinti({ anni: 1, persone: 4, dati, fine: '2026-12-31' });
    for (const istante of ISTANTI) {
      ferma(istante);
      const s = await serverDiProva({ dati, prova: false });
      try { await giro(s, FINTI, 'finti ' + istante.slice(0, 10), ora); } finally { await s.ferma(); }
    }
  } finally {
    test.mock.timers.reset();
  }
  if (RIFAI) {
    const out = { impronte: {}, intere: {} };
    for (const k of Object.keys(ora).sort()) out.impronte[k] = impronta(ora[k]);
    for (const k of INTERE) out.intere[k] = ora[k];
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(out));
    return;
  }
  const atteso = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.deepEqual(Object.keys(ora).sort(), Object.keys(atteso.impronte).sort(), 'le stesse chiamate');
  // Le quattro intere voce per voce; tutte (anche quelle) con l'impronta: se non torna, chi, che giorno e la prima differenza.
  for (const k of Object.keys(atteso.intere)) assert.deepEqual(ora[k], atteso.intere[k], k);
  const diverse = [];
  for (const k of Object.keys(atteso.impronte)) {
    const d = differenza(ora[k], atteso.impronte[k]);
    if (d) diverse.push(k + ' -> ' + d);
  }
  assert.deepEqual(diverse, [], 'risposte diverse dalla fotografia');
});
