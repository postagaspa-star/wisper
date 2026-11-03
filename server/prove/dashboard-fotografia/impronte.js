// Le impronte della fotografia della Dashboard (prove/dashboard-fotografia.test.js): per ogni risposta lo SHA-256 del
// JSON con le chiavi in ordine, quello di ogni campo e quello (12 cifre) di ogni voce, cosi' un errore dice ancora
// dove sta: "urgenti[2] diversa", "il campo numeri e' diverso", "settimana: 7 voci invece di 6".
'use strict';

const crypto = require('node:crypto');

const SEZIONI = ['urgenti', 'settimana', 'pianificare'];

/** Lo stesso valore con le chiavi degli oggetti in ordine (gli array restano nel loro ordine). */
function ordinato(x) {
  if (Array.isArray(x)) return x.map(ordinato);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = ordinato(x[k]);
    return o;
  }
  return x;
}

const sha = x => crypto.createHash('sha256').update(JSON.stringify(ordinato(x)) || 'undefined').digest('hex');

/** {h: impronta intera, campi: {campo: 12 cifre}, voci: {sezione: [12 cifre per voce]}} */
function impronta(r) {
  const campi = {};
  for (const k of Object.keys(r).sort()) if (SEZIONI.indexOf(k) < 0) campi[k] = sha(r[k]).slice(0, 12);
  const voci = {};
  for (const s of SEZIONI) voci[s] = (r[s] || []).map(v => sha(v).slice(0, 12));
  return { h: sha(r), campi, voci };
}

/** null se la risposta torna con l'impronta, se no la prima differenza in parole. */
function differenza(r, atteso) {
  if (sha(r) === atteso.h) return null;
  const ora = impronta(r);
  for (const s of SEZIONI) {
    const a = atteso.voci[s] || [];
    const b = ora.voci[s];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      if (i >= b.length) return s + ': ' + b.length + ' voci invece di ' + a.length + ' (manca la voce ' + i + ')';
      const v = r[s][i];
      return s + '[' + i + '] diversa' + (i >= a.length ? ' (in piu\': ' + b.length + ' voci invece di ' + a.length + ')' : '') + ': ' + JSON.stringify(v).slice(0, 300);
    }
  }
  const nomi = new Set(Object.keys(atteso.campi).concat(Object.keys(ora.campi)));
  for (const k of Array.from(nomi).sort()) {
    if (atteso.campi[k] !== ora.campi[k]) return 'il campo ' + k + ' e\' diverso: ' + JSON.stringify(r[k]).slice(0, 300);
  }
  return 'diversa (impronta intera)';
}

module.exports = { SEZIONI, ordinato, sha, impronta, differenza };
