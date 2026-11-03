/*
 * Il codice del progetto (03/11/2026, Manuel): "inseribile manualmente le prime volte, poi automatizzato seguendo la
 * struttura individuata nei primi codici". Wisper guarda gli ultimi tre codici scritti (o gli ultimi due, se i tre non tornano) e, se
 * hanno tutti la stessa forma con un solo numero che cambia, propone il successivo. Nessuna regola da impostare.
 *
 * Dove guarda, in ordine: i progetti della stessa commessa, poi quelli dello stesso cliente, poi tutti. Vince il primo
 * gruppo che ha almeno due codici con una forma comune.
 *
 * Cosa riconosce, per ogni codice:
 *  - il codice della sua commessa dentro il codice (26ST001-01): diventa "la commessa", cosi' per una commessa nuova
 *    si propone 26ST002-01 (si conta dentro la commessa, da 1);
 *  - l'anno in cui il progetto e' nato, a quattro cifre (2026) o a due (26): nel codice nuovo va l'anno di oggi; si
 *    continua a contare dal piu' alto di quest'anno, o dal piu' alto in assoluto se quest'anno non ce n'e' ancora uno
 *    (se a gennaio si ricomincia da 1, basta scriverlo a mano una volta e Wisper continua da li');
 *  - le parti fisse, uguali in tutti (ED-, /, P);
 *  - un solo numero che cambia: il contatore, con gli zeri davanti se i codici li hanno (001, 002).
 * Se cambiano due numeri, o i codici hanno forme diverse, non propone niente: il codice si scrive a mano.
 *
 * Stessi casi di prova nel telefono (server/prove/casi-codici-progetto.json, portato in Kotlin): telefono e server
 * devono proporre lo stesso codice anche senza rete.
 */
'use strict';

const COMMESSA = '\u0001';
const CAMPIONI = 3;

/** {codice, idCommessa, idCliente, creato, id} ordinati dal piu' vecchio. */
function ordina(progetti) {
  return progetti.slice().sort((a, b) => {
    const x = String(a.creato || ''); const y = String(b.creato || '');
    if (x !== y) return x < y ? -1 : 1;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function annoDi(p, annoDiOggi) {
  const n = Number(String(p.creato || '').slice(0, 4));
  return n >= 1900 && n <= 2999 ? n : annoDiOggi;
}

/** Pezzi del codice: {tipo: 'commessa'|'numero'|'testo', valore}. Il codice della commessa conta solo se lungo almeno 3. */
function pezzi(codice, codiceCommessa) {
  let s = String(codice || '').trim();
  const k = String(codiceCommessa || '').trim();
  if (k.length >= 3) {
    const i = s.toUpperCase().indexOf(k.toUpperCase());
    if (i >= 0) s = s.slice(0, i) + COMMESSA + s.slice(i + k.length);
  }
  const out = [];
  const re = /\u0001|\d+|[^\d\u0001]+/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[0];
    out.push({ tipo: v === COMMESSA ? 'commessa' : /^\d/.test(v) ? 'numero' : 'testo', valore: v });
  }
  return out;
}

/**
 * La forma comune di 2 o 3 codici, o null. Ogni posto: {tipo: 'testo', valore} | {tipo: 'commessa'} |
 * {tipo: 'anno4'} | {tipo: 'anno2'} | {tipo: 'fisso', valore} | {tipo: 'contatore', larghezza}.
 */
function forma(campioni, annoDiOggi) {
  if (campioni.length < 2) return null;
  const scomposti = campioni.map(p => pezzi(p.codice, p.idCommessa));
  const n = scomposti[0].length;
  if (!n || scomposti.some(s => s.length !== n)) return null;
  const posti = [];
  let contatori = 0;
  for (let i = 0; i < n; i++) {
    const tipo = scomposti[0][i].tipo;
    if (scomposti.some(s => s[i].tipo !== tipo)) return null;
    // Le parti fisse si confrontano senza badare alle maiuscole; nel codice nuovo va come nell'ultimo.
    const valori = scomposti.map(s => s[i].valore);
    if (tipo === 'testo') {
      if (valori.some(v => v.toUpperCase() !== valori[0].toUpperCase())) return null;
      posti.push({ tipo: 'testo', valore: valori[valori.length - 1] });
    } else if (tipo === 'commessa') {
      posti.push({ tipo: 'commessa' });
    } else {
      const anni = campioni.map(p => annoDi(p, annoDiOggi));
      if (valori.every((v, j) => v === String(anni[j]))) posti.push({ tipo: 'anno4' });
      else if (valori.every((v, j) => v.length === 2 && v === String(anni[j] % 100).padStart(2, '0'))) posti.push({ tipo: 'anno2' });
      else if (valori.every(v => v === valori[0])) posti.push({ tipo: 'fisso', valore: valori[0] });
      else {
        contatori++;
        const stessa = valori.every(v => v.length === valori[0].length);
        posti.push({ tipo: 'contatore', larghezza: stessa && valori.some(v => v[0] === '0') ? valori[0].length : 0 });
      }
    }
  }
  return contatori === 1 ? posti : null;
}

const scappa = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Il contatore (e l'anno) di un codice che ha la forma, o null. */
function leggi(posti, codice, codiceCommessa) {
  let re = '^';
  const gruppi = [];
  for (const p of posti) {
    if (p.tipo === 'testo' || p.tipo === 'fisso') re += scappa(p.valore);
    else if (p.tipo === 'commessa') re += scappa(String(codiceCommessa || ''));
    else {
      re += p.tipo === 'anno4' ? '(\\d{4})' : p.tipo === 'anno2' ? '(\\d{2})' : '(\\d+)';
      gruppi.push(p.tipo);
    }
  }
  const m = new RegExp(re + '$', 'i').exec(String(codice || '').trim());
  if (!m) return null;
  const o = { n: 0, anno4: null, anno2: null };
  gruppi.forEach((tipo, i) => {
    const v = Number(m[i + 1]);
    if (tipo === 'contatore') o.n = v;
    else if (o[tipo] === null) o[tipo] = v;
  });
  return o;
}

function scrivi(posti, n, codiceCommessa, anno) {
  return posti.map(p => {
    if (p.tipo === 'testo' || p.tipo === 'fisso') return p.valore;
    if (p.tipo === 'commessa') return String(codiceCommessa || '');
    if (p.tipo === 'anno4') return String(anno);
    if (p.tipo === 'anno2') return String(anno % 100).padStart(2, '0');
    return String(n).padStart(p.larghezza, '0');
  }).join('');
}

/**
 * Il codice proposto per un progetto nuovo.
 * @param progetti  tutti i progetti [{id, codice, idCommessa, idCliente, creato}]
 * @param dove      {idCommessa, idCliente, anno}: la commessa del progetto nuovo (il suo id e' il suo codice) e l'anno di oggi
 * @returns {codice, da: 'commessa'|'cliente'|'tutti'} oppure {codice: '', da: ''}
 */
function proponiCodice(progetti, dove) {
  const anno = Number(dove.anno);
  const idCommessa = String(dove.idCommessa || '');
  const idCliente = String(dove.idCliente || '');
  const tutti = ordina((progetti || []).filter(p => String(p.codice || '').trim() !== ''));
  const gruppi = [
    { da: 'commessa', elenco: tutti.filter(p => String(p.idCommessa || '').toUpperCase() === idCommessa.toUpperCase()) },
    { da: 'cliente', elenco: idCliente ? tutti.filter(p => String(p.idCliente || '') === idCliente) : [] },
    { da: 'tutti', elenco: tutti },
  ];
  for (const g of gruppi) {
    if (g.elenco.length < 2) continue;
    // Gli ultimi tre; se non hanno una forma comune, gli ultimi due (la regola e' cambiata: bastano due codici nuovi).
    const posti = forma(g.elenco.slice(-CAMPIONI), anno) || forma(g.elenco.slice(-2), anno);
    if (!posti) continue;
    const conCommessa = posti.some(p => p.tipo === 'commessa');
    // Il codice della commessa dentro il codice, ma la commessa non ha ancora il suo: niente proposta, si scrive a mano.
    if (conCommessa && !idCommessa) continue;
    const conAnno = posti.some(p => p.tipo === 'anno4' || p.tipo === 'anno2');
    // Con la commessa nel codice si conta dentro la commessa nuova; senza, nel gruppo dove si e' trovata la forma.
    const daContare = conCommessa ? gruppi[0].elenco : g.elenco;
    const letti = daContare.map(p => leggi(posti, p.codice, p.idCommessa)).filter(Boolean);
    let base = letti;
    if (conAnno) {
      const diOggi = letti.filter(l => (l.anno4 !== null ? l.anno4 === anno : l.anno2 === anno % 100));
      if (diOggi.length) base = diOggi;
    }
    let n = base.reduce((max, l) => Math.max(max, l.n), 0) + 1;
    // Mai un codice gia' dato a un progetto dello stesso cliente.
    const presi = new Set(tutti.filter(p => !idCliente || String(p.idCliente || '') === idCliente).map(p => String(p.codice).trim().toUpperCase()));
    let codice = scrivi(posti, n, idCommessa, anno);
    for (let i = 0; i < 1000 && presi.has(codice.toUpperCase()); i++) codice = scrivi(posti, ++n, idCommessa, anno);
    return { codice, da: g.da };
  }
  return { codice: '', da: '' };
}

module.exports = { proponiCodice, forma, pezzi };
