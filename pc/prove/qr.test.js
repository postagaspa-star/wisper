// Il codice QR della pagina di accesso (pc/ui/qr.js, docs/gestionale/collega-qr.md §3), provato contro i valori noti
// della norma ISO/IEC 18004 (correzione Reed-Solomon, bit di formato e di versione), con un lettore scritto qui a parte
// (non usa le funzioni di qr.js per trovare i moduli) e contro i campioni fissi di pc/prove/qr-campioni.json, che il
// telefono legge con ZXing.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Q = require('../ui/qr.js');
// Il lettore scritto a parte (non usa le funzioni di qr.js per trovare i moduli): lo usa anche prova-flussi-collega.js.
const { leggi, daSvg } = require('./leggi-qr.js');
const CAMPIONI = JSON.parse(fs.readFileSync(path.join(__dirname, 'qr-campioni.json'), 'utf8'));

// ------------------------------------------------------------------ i valori della norma

test('Reed-Solomon: i 10 codewords di correzione di "HELLO WORLD" versione 1-M', () => {
  // I 16 codewords di dati di "HELLO WORLD" in modalità alfanumerica, 1-M, e la loro correzione (l'esempio classico).
  const dati = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q.correzione(dati, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('Reed-Solomon: l\'esempio "01234567" versione 1-M dell\'allegato I della norma', () => {
  const dati = [0x10, 0x20, 0x0C, 0x56, 0x61, 0x80, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11];
  assert.deepEqual(Q.correzione(dati, 10), [0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87, 0x2C, 0x55]);
  // Il generatore di grado 7 della norma (allegato A): esponenti di 2 dei coefficienti 87, 229, 146, 149, 238, 102, 21.
  const log = {};
  for (let i = 0, x = 1; i < 255; i++) { log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  assert.deepEqual(Q.generatore(7).map(c => log[c]), [87, 229, 146, 149, 238, 102, 21]);
});

test('i bit di formato della correzione M per ogni maschera (norma, allegato C)', () => {
  const attesi = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
    '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  attesi.forEach((a, k) => assert.equal(Q.bitFormato(k).toString(2).padStart(15, '0'), a, 'maschera ' + k));
});

test('i bit di versione dalla 7 alla 10 (norma, allegato D)', () => {
  assert.equal(Q.bitVersione(7), 0x07C94);
  assert.equal(Q.bitVersione(8), 0x085BC);
  assert.equal(Q.bitVersione(9), 0x09A99);
  assert.equal(Q.bitVersione(10), 0x0A4D3);
});

test('quanti byte stanno in ogni versione con la correzione M (norma, tabella 7)', () => {
  assert.deepEqual(Q.CAPACITA.slice(1), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
  assert.equal(Q.codifica('x'.repeat(213)).versione, 10);
  assert.throws(() => Q.codifica('x'.repeat(214)), /troppo lungo/);
  // Il byte conta, non il carattere: "à" sono due byte.
  assert.equal(Q.codifica('à'.repeat(7)).versione, 1);
  assert.equal(Q.codifica('à'.repeat(8)).versione, 2);
});

test('i codewords di dati: modalità byte, lunghezza, terminatore, 236 e 17 a riempire', () => {
  // "AB" in 1-M: 0100 | 00000010 | 01000001 | 01000010 | 0000, poi EC 11 EC 11 ...
  const cw = Q.codewords([0x41, 0x42], 1);
  assert.equal(cw.length, 16);
  assert.deepEqual(cw.slice(0, 4), [0x40, 0x24, 0x14, 0x20]);
  assert.deepEqual(cw.slice(4, 8), [0xEC, 0x11, 0xEC, 0x11]);
  // Dalla versione 10 la lunghezza è di 16 bit.
  assert.deepEqual(Q.codewords([0x41], 10).slice(0, 3), [0x40, 0x00, 0x14]);
});

test('ogni campione si rilegge col lettore indipendente: formato, correzione M, maschera, testo', () => {
  for (const c of CAMPIONI) {
    const r = leggi(c.matrice);
    assert.equal(r.v, c.versione, c.testo);
    assert.equal(r.livello, 0, 'correzione M (00)');
    assert.equal(r.maschera, c.maschera);
    assert.ok(r.formatoUguale, 'le due copie del formato sono uguali');
    assert.ok(r.correzioneGiusta, 'i codewords di correzione tornano, blocco per blocco');
    assert.equal(r.modo, 4, 'modalità byte (0100)');
    assert.equal(r.testo, c.testo);
  }
});

test('tutte le versioni da 1 a 10 con tutte le 8 maschere si rileggono', () => {
  for (let v = 1; v <= 10; v++) {
    for (let k = 0; k < 8; k++) {
      let t = ('v' + v + ' m' + k + ' Città ').repeat(40);
      while (Buffer.byteLength(t) > Q.CAPACITA[v] - k) t = t.slice(0, -1);
      const qr = Q.codifica(t, { maschera: k });
      assert.equal(qr.versione, v);
      const r = leggi(Q.righe(qr));
      assert.ok(r.correzioneGiusta && r.formatoUguale && r.maschera === k, 'v' + v + ' m' + k);
      assert.equal(r.testo, t);
    }
  }
});

test('i disegni fissi: quadrati d\'angolo, linee a puntini, modulo scuro, versione', () => {
  for (const c of CAMPIONI) {
    const m = c.matrice;
    const n = m.length;
    assert.equal(n, 17 + 4 * c.versione);
    const quadrato = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    for (let i = 0; i < 7; i++) {
      assert.equal(m[i].slice(0, 7), quadrato[i]);
      assert.equal(m[i].slice(n - 7), quadrato[i]);
      assert.equal(m[n - 7 + i].slice(0, 7), quadrato[i]);
    }
    // Il bordo chiaro intorno ai quadrati.
    assert.equal(m[7].slice(0, 8), '00000000');
    assert.equal(m[7].slice(n - 8), '00000000');
    assert.equal(m[n - 8].slice(0, 8), '00000000');
    for (let i = 8; i < n - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0 ? '1' : '0');
      assert.equal(m[i][6], i % 2 === 0 ? '1' : '0');
    }
    assert.equal(m[n - 8][8], '1', 'il modulo sempre scuro');
    if (c.versione >= 7) {
      const giu = [...Array(18).keys()].reduce((s, i) => s | ((m[n - 11 + (i % 3)][Math.floor(i / 3)] === '1' ? 1 : 0) << i), 0);
      const su = [...Array(18).keys()].reduce((s, i) => s | ((m[Math.floor(i / 3)][n - 11 + (i % 3)] === '1' ? 1 : 0) << i), 0);
      assert.equal(giu, Q.bitVersione(c.versione));
      assert.equal(su, Q.bitVersione(c.versione));
    }
  }
});

// ------------------------------------------------------------------ maschera e penalità

test('la penalità: file, quadrati 2x2, finti quadrati d\'angolo, quanto scuro', () => {
  // Tutto chiaro 21x21: file di 21 (3 + 16 = 19) su 42 linee, 400 quadrati 2x2, lo scuro a 0% (100 punti).
  const chiaro = Array.from({ length: 21 }, () => new Array(21).fill(false));
  assert.equal(Q.penalita(chiaro), 42 * 19 + 400 * 3 + 100);
  // Una scacchiera: niente file, niente quadrati, scuro circa al 50%.
  const scacchi = Array.from({ length: 21 }, (_, r) => Array.from({ length: 21 }, (_, c) => (r + c) % 2 === 0));
  assert.equal(Q.penalita(scacchi), 0);
  // Una riga 1011101 vicino al bordo vale 40 in più (fuori è la zona di silenzio, chiara).
  const conFinto = scacchi.map(r => r.slice());
  const riga = [1, 0, 1, 1, 1, 0, 1].map(Boolean);
  for (let c = 0; c < 7; c++) conFinto[10][c] = riga[c];
  assert.ok(Q.penalita(conFinto) >= 40);
});

test('la maschera scelta è quella con la penalità più bassa (a parità, la prima)', () => {
  for (const c of CAMPIONI) {
    const pen = [0, 1, 2, 3, 4, 5, 6, 7].map(k => Q.penalita(Q.codifica(c.testo, { maschera: k }).matrice));
    assert.equal(c.maschera, pen.indexOf(Math.min(...pen)), c.testo);
  }
});

// ------------------------------------------------------------------ i campioni per il telefono e l'SVG

test('i campioni per il telefono: almeno 6, coi nomi di 1, 15 e 32 caratteri, e qr.js li rifà uguali', () => {
  assert.ok(CAMPIONI.length >= 6);
  const nomi = CAMPIONI.filter(c => c.testo.startsWith('wisper-collega:1:')).map(c => decodeURIComponent(c.testo.split(':')[4]));
  for (const lunghezza of [1, 15, 32]) assert.ok(nomi.some(x => x.length === lunghezza), 'un nome di ' + lunghezza + ' caratteri');
  assert.ok(CAMPIONI.some(c => c.testo === 'HELLO WORLD'));
  assert.ok(CAMPIONI.some(c => c.testo.length === 1));
  for (const c of CAMPIONI) {
    const qr = Q.codifica(c.testo);
    assert.equal(qr.versione, c.versione);
    assert.equal(qr.maschera, c.maschera);
    assert.deepEqual(Q.righe(qr), c.matrice, 'la matrice non è cambiata: ' + c.testo.slice(0, 40));
  }
});

test('l\'SVG: nero su bianco fisso, 4 moduli di silenzio, modulo intero, esattamente i moduli scuri', () => {
  const c = CAMPIONI.find(x => x.versione === 7);
  const qr = Q.codifica(c.testo);
  const s = Q.svg(qr, { lato: 298 });
  const tot = qr.dimensione + 8;
  assert.match(s, new RegExp('viewBox="0 0 ' + tot + ' ' + tot + '"'));
  const lato = Number(s.match(/ width="(\d+)"/)[1]);
  assert.equal(lato % tot, 0, 'il modulo è un numero intero di pixel');
  assert.ok(lato <= 298 && lato > 298 - tot);
  assert.match(s, /fill="#FFFFFF"/);
  assert.match(s, /fill="#000000"/);
  assert.ok(!/var\(|currentColor|style=/.test(s), 'niente colori del tema e niente stile in linea (la pagina ha una CSP)');
  // Il tracciato copre i moduli scuri e solo quelli.
  assert.deepEqual(daSvg(s), c.matrice);
});
