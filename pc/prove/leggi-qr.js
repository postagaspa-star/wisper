// Un lettore di codici QR scritto a parte, per le prove (pc/prove/qr.test.js e prova-flussi-collega.js): legge una
// matrice come farebbe un lettore (formato, maschera tolta, zigzag, blocchi, correzione M, testo in modalità byte) e
// trova da solo dove sono i moduli fissi, senza usare pc/ui/qr.js. Della correzione controlla che i codewords tornino
// (con la funzione di qr.js, provata a parte coi valori della norma), non corregge gli errori.
'use strict';

const Q = require('../ui/qr.js');

/** Le posizioni dei moduli fissi, ricavate qui dalla norma (non da qr.js). */
function fissi(v) {
  const n = 17 + 4 * v;
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const segna = (r, c) => { if (r >= 0 && r < n && c >= 0 && c < n) f[r][c] = true; };
  // In alto a sinistra 9x9 (quadrato, bordo, formato); in alto a destra e in basso a sinistra 8 di qua e 9 di là.
  for (let i = 0; i < 9; i++) for (let j = 0; j < 8; j++) { segna(i, j); segna(j, i); segna(i, n - 1 - j); segna(n - 1 - j, i); }
  segna(8, 8);
  for (let i = 0; i < n; i++) { segna(6, i); segna(i, 6); }
  const centri = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]][v];
  for (const a of centri) for (const b of centri) {
    // Niente quadratino dove c'è un quadrato d'angolo (sulle linee a puntini invece sì).
    if ((a < 9 && b < 9) || (a < 9 && b > n - 9) || (a > n - 9 && b < 9)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) segna(a + dr, b + dc);
  }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { segna(i, n - 11 + j); segna(n - 11 + j, i); }
  return f;
}

/** Legge una matrice come farebbe un lettore: formato, maschera tolta, zigzag, blocchi, correzione, testo. */
function leggi(righe) {
  const m = righe.map(r => [...r].map(x => x === '1'));
  const n = m.length;
  const v = (n - 17) / 4;
  const formato = [0, 1, 2, 3, 4, 5, 7, 8].map(r => m[r][8]).concat([7, 5, 4, 3, 2, 1, 0].map(c => m[8][c]));
  const bits = formato.reduce((s, b, i) => s | ((b ? 1 : 0) << i), 0);
  const seconda = [...Array(8).keys()].map(i => m[8][n - 1 - i]).concat([...Array(7).keys()].map(i => m[n - 7 + i][8])).reduce((s, b, i) => s | ((b ? 1 : 0) << i), 0);
  const maschera = ((bits ^ 0x5412) >>> 10) & 7;
  const livello = ((bits ^ 0x5412) >>> 13) & 3;
  const f = fissi(v);
  const regola = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0][maschera];
  const letti = [];
  let su = true;
  for (let c = n - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let k = 0; k < n; k++) {
      const r = su ? n - 1 - k : k;
      for (const cc of [c, c - 1]) if (!f[r][cc]) letti.push(m[r][cc] !== regola(r, cc) ? 1 : 0);
    }
    su = !su;
  }
  const cw = [];
  for (let i = 0; i + 8 <= letti.length; i += 8) cw.push(letti.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0));
  // I blocchi della correzione M, ricopiati dalla norma.
  const tabella = { 1: [10, 1, 16], 2: [16, 1, 28], 3: [26, 1, 44], 4: [18, 2, 32], 5: [24, 2, 43], 6: [16, 4, 27], 7: [18, 4, 31],
    8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44] }[v];
  const lunghezze = [];
  for (let g = 1; g < tabella.length; g += 2) for (let b = 0; b < tabella[g]; b++) lunghezze.push(tabella[g + 1]);
  const blocchi = lunghezze.map(() => ({ dati: [], corr: [] }));
  let i = 0;
  for (let k = 0; k < Math.max(...lunghezze); k++) blocchi.forEach((b, j) => { if (k < lunghezze[j]) b.dati.push(cw[i++]); });
  for (let k = 0; k < tabella[0]; k++) blocchi.forEach(b => b.corr.push(cw[i++]));
  const correzioneGiusta = blocchi.every(b => JSON.stringify(Q.correzione(b.dati, tabella[0])) === JSON.stringify(b.corr));
  const dati = [].concat(...blocchi.map(b => b.dati));
  const flusso = dati.map(b => b.toString(2).padStart(8, '0')).join('');
  const modo = parseInt(flusso.slice(0, 4), 2);
  const lb = v < 10 ? 8 : 16;
  const quanti = parseInt(flusso.slice(4, 4 + lb), 2);
  const byte = [];
  for (let k = 0; k < quanti; k++) byte.push(parseInt(flusso.slice(4 + lb + 8 * k, 12 + lb + 8 * k), 2));
  return { v, maschera, livello, formatoUguale: bits === seconda, correzioneGiusta, modo, testo: Buffer.from(byte).toString('utf8') };
}

/**
 * Dall'SVG di qr.js (o disegnato da chiunque con lo stesso schema: viewBox coi 4 moduli di silenzio, un tracciato di
 * rettangoli "M x y h w v1 h-w z") alla matrice, senza la zona di silenzio.
 */
function daSvg(svg) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!vb) throw new Error('SVG senza viewBox');
  const n = Number(vb[1]) - 8;
  const m = Array.from({ length: n }, () => new Array(n).fill('0'));
  for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let k = 0; k < Number(w); k++) m[Number(y) - 4][Number(x) - 4 + k] = '1';
  }
  return m.map(r => r.join(''));
}

module.exports = { leggi, daSvg, fissi };
