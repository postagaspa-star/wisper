/*
 * Wisper Ufficio: il codice QR della pagina di accesso (docs/gestionale/collega-qr.md §3), scritto a mano
 * seguendo la norma ISO/IEC 18004, senza librerie. Fa solo quello che serve al collegamento col telefono:
 *
 *  - versioni da 1 a 10 (da 21x21 a 57x57 moduli), modalità byte (UTF-8), correzione M (circa 15%);
 *  - le 8 maschere, scelta quella con la penalità più bassa (le quattro regole della norma);
 *  - zona di silenzio di 4 moduli intorno, nell'SVG;
 *  - SVG nero su bianco anche in tema scuro: i lettori leggono meglio scuro su chiaro.
 *
 * Niente di grafico oltre all'SVG: le prove (anche contro i valori noti della norma) sono in
 * pc/prove/qr.test.js; i campioni in pc/prove/qr-campioni.json li legge anche il telefono con ZXing.
 *
 *   const qr = WisperQr.codifica('wisper-collega:1:...');   // {versione, maschera, dimensione, matrice}
 *   WisperQr.svg(qr, { lato: 298 })                         // '<svg ...>'
 */
(function (radice) {
  'use strict';

  // ------------------------------------------------------------------ le tabelle della norma (correzione M)

  /**
   * Per ogni versione: i codewords di correzione di ogni blocco, poi i gruppi di blocchi
   * [quanti blocchi, codewords di dati per blocco] (norma, tabella 9, livello M).
   */
  const BLOCCHI_M = [null,
    [10, [1, 16]],
    [16, [1, 28]],
    [26, [1, 44]],
    [18, [2, 32]],
    [24, [2, 43]],
    [16, [4, 27]],
    [18, [4, 31]],
    [22, [2, 38], [2, 39]],
    [22, [3, 36], [2, 37]],
    [26, [4, 43], [1, 44]],
  ];

  /** I centri dei quadratini di allineamento (norma, allegato E). */
  const ALLINEAMENTO = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  /** I bit che avanzano in fondo, dopo l'ultimo codeword (norma, tabella 1). */
  const RESTO = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

  const VERSIONE_MASSIMA = 10;

  /** Le due cifre del livello di correzione nei bit di formato: M = 00 (L = 01, Q = 11, H = 10). */
  const LIVELLO_M = 0;

  /** Quanti codewords di dati ha una versione. */
  function codewordsDati(v) {
    return BLOCCHI_M[v].slice(1).reduce((s, g) => s + g[0] * g[1], 0);
  }

  /** Quanti byte stanno in una versione: 4 bit di modalità, 8 o 16 bit di lunghezza, poi i byte. */
  function capacita(v) {
    return Math.floor((codewordsDati(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);
  }

  const CAPACITA = [null];
  for (let v = 1; v <= VERSIONE_MASSIMA; v++) CAPACITA.push(capacita(v));

  // ------------------------------------------------------------------ Reed-Solomon in GF(256)

  // Il campo di Galois della norma: polinomio x^8 + x^4 + x^3 + x^2 + 1 (0x11D), radice 2.
  const ESP = new Array(512);
  const LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      ESP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) ESP[i] = ESP[i - 255];
  })();

  const per = (a, b) => (a === 0 || b === 0 ? 0 : ESP[LOG[a] + LOG[b]]);

  /** Il polinomio generatore di grado n: (x - 2^0)(x - 2^1)...(x - 2^(n-1)), coefficienti dal più alto, senza l'1 in testa. */
  function generatore(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const nuovo = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        nuovo[j] ^= g[j];
        nuovo[j + 1] ^= per(g[j], ESP[i]);
      }
      g = nuovo;
    }
    return g.slice(1);
  }

  /** I codewords di correzione di un blocco: il resto di dati·x^n diviso per il generatore. */
  function correzione(dati, n) {
    const g = generatore(n);
    const resto = new Array(n).fill(0);
    for (const b of dati) {
      const fattore = b ^ resto.shift();
      resto.push(0);
      for (let i = 0; i < n; i++) resto[i] ^= per(g[i], fattore);
    }
    return resto;
  }

  // ------------------------------------------------------------------ dai byte ai codewords

  /** Il testo in byte UTF-8 (anche senza TextEncoder). */
  function utf8(testo) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(String(testo)));
    return Array.from(unescape(encodeURIComponent(String(testo))), c => c.charCodeAt(0));
  }

  /** La versione più piccola in cui stanno quei byte, o 0 se non stanno nemmeno nella 10. */
  function versionePer(nByte) {
    for (let v = 1; v <= VERSIONE_MASSIMA; v++) if (nByte <= CAPACITA[v]) return v;
    return 0;
  }

  /** I codewords di dati: modalità byte, lunghezza, i byte, il terminatore, poi 236 e 17 a riempire. */
  function codewords(byte, v) {
    const bit = [];
    const metti = (valore, quanti) => { for (let i = quanti - 1; i >= 0; i--) bit.push((valore >>> i) & 1); };
    metti(0b0100, 4);
    metti(byte.length, v < 10 ? 8 : 16);
    byte.forEach(b => metti(b, 8));
    const totale = codewordsDati(v) * 8;
    metti(0, Math.min(4, totale - bit.length));
    while (bit.length % 8) bit.push(0);
    const cw = [];
    for (let i = 0; i < bit.length; i += 8) cw.push(bit.slice(i, i + 8).reduce((s, x) => (s << 1) | x, 0));
    for (let k = 0; cw.length < codewordsDati(v); k++) cw.push(k % 2 ? 0x11 : 0xEC);
    return cw;
  }

  /** I blocchi con la loro correzione, poi intrecciati: prima i dati colonna per colonna, poi la correzione. */
  function intreccia(cw, v) {
    const [nCorr, ...gruppi] = BLOCCHI_M[v];
    const blocchi = [];
    let i = 0;
    for (const [quanti, lunghi] of gruppi) {
      for (let b = 0; b < quanti; b++) {
        const dati = cw.slice(i, i + lunghi);
        i += lunghi;
        blocchi.push({ dati, corr: correzione(dati, nCorr) });
      }
    }
    const fuori = [];
    const piuLungo = Math.max(...blocchi.map(b => b.dati.length));
    for (let k = 0; k < piuLungo; k++) blocchi.forEach(b => { if (k < b.dati.length) fuori.push(b.dati[k]); });
    for (let k = 0; k < nCorr; k++) blocchi.forEach(b => fuori.push(b.corr[k]));
    return fuori;
  }

  // ------------------------------------------------------------------ bit di formato e di versione

  /** I 15 bit di formato (correzione M e maschera): BCH(15,5) col generatore 0x537, poi XOR 0x5412. */
  function bitFormato(maschera) {
    const dati = (LIVELLO_M << 3) | maschera;
    let resto = dati;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    return ((dati << 10) | (resto & 0x3FF)) ^ 0x5412;
  }

  /** I 18 bit di versione (dalla 7): BCH(18,6) col generatore 0x1F25. */
  function bitVersione(v) {
    let resto = v;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1F25);
    return (v << 12) | (resto & 0xFFF);
  }

  // ------------------------------------------------------------------ la matrice

  /**
   * Una matrice vuota coi disegni fissi (quadrati d'angolo, linee a puntini, quadratini di allineamento,
   * modulo scuro) e le zone riservate (formato, versione). m[riga][colonna]: true = scuro; fisso[r][c]: true =
   * non è un modulo dei dati.
   */
  function scheletro(v) {
    const n = 17 + 4 * v;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fisso = Array.from({ length: n }, () => new Array(n).fill(false));
    const metti = (r, c, scuro) => { m[r][c] = scuro; fisso[r][c] = true; };

    // Le linee a puntini (riga 6 e colonna 6): scure sulle posizioni pari.
    for (let i = 0; i < n; i++) { metti(6, i, i % 2 === 0); metti(i, 6, i % 2 === 0); }
    // I tre quadrati d'angolo col loro bordo chiaro (separatore).
    const angolo = (r0, c0) => {
      for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const d = Math.max(Math.abs(dr), Math.abs(dc));
        metti(r, c, d !== 2 && d !== 4);
      }
    };
    angolo(3, 3);
    angolo(3, n - 4);
    angolo(n - 4, 3);
    // I quadratini di allineamento, tranne dove toccano i quadrati d'angolo.
    const centri = ALLINEAMENTO[v];
    for (let a = 0; a < centri.length; a++) for (let b = 0; b < centri.length; b++) {
      const ultimo = centri.length - 1;
      if ((a === 0 && b === 0) || (a === 0 && b === ultimo) || (a === ultimo && b === 0)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        metti(centri[a] + dr, centri[b] + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
    // Le zone del formato (si scrivono dopo, con la maschera scelta) e il modulo sempre scuro.
    for (let i = 0; i < 9; i++) { fisso[8][i] = true; fisso[i][8] = true; }
    for (let i = 0; i < 8; i++) { fisso[8][n - 1 - i] = true; fisso[n - 1 - i][8] = true; }
    metti(n - 8, 8, true);
    // La versione (dalla 7): due blocchi 6x3, in alto a destra e in basso a sinistra.
    if (v >= 7) {
      const bits = bitVersione(v);
      for (let i = 0; i < 18; i++) {
        const scuro = ((bits >>> i) & 1) === 1;
        const a = n - 11 + (i % 3), b = Math.floor(i / 3);
        metti(b, a, scuro);
        metti(a, b, scuro);
      }
    }
    return { n, m, fisso };
  }

  /** I bit dei codewords a zigzag, dal basso a destra, due colonne alla volta, saltando la colonna 6. */
  function mettiDati(s, cw) {
    const { n, m, fisso } = s;
    const totale = cw.length * 8;
    let i = 0;
    for (let destra = n - 1; destra >= 1; destra -= 2) {
      if (destra === 6) destra = 5;
      const suPer = ((destra + 1) & 2) === 0;
      for (let k = 0; k < n; k++) {
        const r = suPer ? n - 1 - k : k;
        for (let j = 0; j < 2; j++) {
          const c = destra - j;
          if (fisso[r][c]) continue;
          // I bit che avanzano (dopo l'ultimo codeword) restano chiari, poi passano dalla maschera come gli altri.
          m[r][c] = i < totale && ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  /** Le 8 maschere della norma (r = riga, c = colonna): true = il modulo si inverte. */
  const MASCHERE = [
    (r, c) => (r + c) % 2 === 0,
    r => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  /** La matrice con quella maschera e i suoi bit di formato. */
  function conMaschera(s, maschera) {
    const { n, fisso } = s;
    const m = s.m.map((riga, r) => riga.map((x, c) => (fisso[r][c] ? x : x !== MASCHERE[maschera](r, c))));
    const bits = bitFormato(maschera);
    const bit = i => ((bits >>> i) & 1) === 1;
    // Prima copia, intorno al quadrato in alto a sinistra.
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6);
    m[8][8] = bit(7);
    m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    // Seconda copia: in alto a destra (riga 8) e in basso a sinistra (colonna 8).
    for (let i = 0; i < 8; i++) m[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[n - 15 + i][8] = bit(i);
    m[n - 8][8] = true;
    return m;
  }

  // ------------------------------------------------------------------ la penalità (norma, 7.8.3)

  /**
   * Quanto è "brutta" una matrice per un lettore: file di 5 o più uguali (3 + quelle in più), quadrati 2x2
   * uguali (3), finti quadrati d'angolo 1011101 con 4 chiari prima o dopo (40; fuori dal simbolo è la zona di
   * silenzio, chiara), e quanto lo scuro si allontana dalla metà (10 ogni 5%).
   */
  function penalita(m) {
    const n = m.length;
    let p = 0;
    const linea = (k, verticale) => Array.from({ length: n }, (_, i) => (verticale ? m[i][k] : m[k][i]));
    for (let k = 0; k < n; k++) {
      for (const verticale of [false, true]) {
        const l = linea(k, verticale);
        // Regola 1: le file.
        let fila = 1;
        for (let i = 1; i <= n; i++) {
          if (i < n && l[i] === l[i - 1]) { fila++; continue; }
          if (fila >= 5) p += 3 + (fila - 5);
          fila = 1;
        }
        // Regola 3: 1011101 con 4 chiari prima o dopo.
        const a = i => (i >= 0 && i < n ? l[i] : false);
        const chiari = (da, a2) => { for (let i = da; i < a2; i++) if (a(i)) return false; return true; };
        for (let i = -4; i < n; i++) {
          if (a(i) && !a(i + 1) && a(i + 2) && a(i + 3) && a(i + 4) && !a(i + 5) && a(i + 6) &&
            (chiari(i - 4, i) || chiari(i + 7, i + 11))) p += 40;
        }
      }
    }
    // Regola 2: i quadrati 2x2 tutti uguali.
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const x = m[r][c];
      if (m[r][c + 1] === x && m[r + 1][c] === x && m[r + 1][c + 1] === x) p += 3;
    }
    // Regola 4: quanto scuro c'è.
    let scuri = 0;
    m.forEach(riga => riga.forEach(x => { if (x) scuri++; }));
    p += Math.floor(Math.abs(scuri * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }

  // ------------------------------------------------------------------ insieme

  /**
   * Il QR di un testo: {versione, maschera, dimensione, matrice} (matrice[riga][colonna], true = scuro, senza
   * la zona di silenzio). opzioni.maschera: quella maschera invece della migliore (le prove).
   * Un testo troppo lungo per la versione 10 (213 byte) lancia un errore.
   */
  function codifica(testo, opzioni) {
    const byte = utf8(testo);
    const v = versionePer(byte.length);
    if (!v) throw new Error('Il testo è troppo lungo per il codice: ' + byte.length + ' byte, al massimo ' + CAPACITA[VERSIONE_MASSIMA]);
    const s = scheletro(v);
    mettiDati(s, intreccia(codewords(byte, v), v));
    let migliore = null;
    const scelta = opzioni && opzioni.maschera !== undefined ? [opzioni.maschera] : [0, 1, 2, 3, 4, 5, 6, 7];
    for (const k of scelta) {
      const m = conMaschera(s, k);
      const pen = scelta.length > 1 ? penalita(m) : 0;
      if (!migliore || pen < migliore.pen) migliore = { m, k, pen };
    }
    return { versione: v, maschera: migliore.k, dimensione: s.n, matrice: migliore.m };
  }

  /** La matrice come righe di "0" e "1" (i campioni per il telefono). */
  function righe(qr) {
    const m = qr.matrice || qr;
    return m.map(riga => riga.map(x => (x ? '1' : '0')).join(''));
  }

  const ZONA = 4;

  /**
   * L'SVG del QR, nero su bianco (anche in tema scuro), con 4 moduli di silenzio per lato. opzioni.lato: i pixel
   * a disposizione; il modulo è un numero intero di pixel (bordi netti), il più grande che ci sta.
   * Un solo tracciato con le file orizzontali di moduli scuri: poche centinaia di comandi.
   */
  function svg(qr, opzioni) {
    const m = qr.matrice || qr;
    const n = m.length;
    const tot = n + 2 * ZONA;
    const lato = opzioni && opzioni.lato ? Number(opzioni.lato) : tot * 4;
    const modulo = Math.max(1, Math.floor(lato / tot));
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!m[r][c]) continue;
        let fine = c;
        while (fine + 1 < n && m[r][fine + 1]) fine++;
        d += 'M' + (c + ZONA) + ' ' + (r + ZONA) + 'h' + (fine - c + 1) + 'v1h-' + (fine - c + 1) + 'z';
        c = fine;
      }
    }
    const titolo = opzioni && opzioni.titolo ? '<title>' + String(opzioni.titolo).replace(/[<>&"]/g, '') + '</title>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + modulo * tot + '" height="' + modulo * tot + '" viewBox="0 0 ' + tot + ' ' + tot +
      '" shape-rendering="crispEdges" role="img"' + (titolo ? '' : ' aria-hidden="true"') + '>' + titolo +
      '<rect width="' + tot + '" height="' + tot + '" fill="#FFFFFF"/><path fill="#000000" d="' + d + '"/></svg>';
  }

  const Qr = {
    codifica, righe, svg,
    // Per le prove: le parti, da controllare una per una coi valori della norma.
    CAPACITA, VERSIONE_MASSIMA, ZONA, correzione, generatore, bitFormato, bitVersione, penalita, codewords, intreccia, utf8, versionePer,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Qr;
  else radice.WisperQr = Qr;
})(typeof window !== 'undefined' ? window : globalThis);
