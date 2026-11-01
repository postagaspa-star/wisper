/*
 * I formati delle numerazioni (accordo §5): {AAAA} l'anno, {AA} le ultime due
 * cifre, {N...} il numero con almeno tante cifre quante N. Stanno qui da soli
 * perche' li usano sia il server sia l'importazione.
 */
'use strict';

const { testo, Rifiuto } = require('./utili');

/**
 * Da un formato ("RAP/{AAAA}/{NNNN}") l'espressione che riconosce i codici
 * scritti cosi', e dove stanno anno e numero.
 */
function schemaFormato(formato) {
  let gruppo = 0;
  const sc = { numero: 0, anno4: 0, anno2: 0 };
  const re = String(formato).replace(/\{(AAAA|AA|N+)\}|[.*+?^${}()|[\]\\/]/g, (m, p) => {
    if (!p) return '\\' + m;
    gruppo++;
    if (p === 'AAAA') { sc.anno4 = gruppo; return '(\\d{4})'; }
    if (p === 'AA') { sc.anno2 = gruppo; return '(\\d{2})'; }
    sc.numero = gruppo;
    return '(\\d+)';
  });
  sc.re = new RegExp('^' + re + '$', 'i');
  return sc;
}

/** Il codice dal formato: {AAAA} 2026, {AA} 26, {NNN} il numero con almeno tre cifre. */
function formatta(formato, anno, numero) {
  return String(formato).replace(/\{(AAAA|AA|N+)\}/g, (m, p) => {
    if (p === 'AAAA') return String(anno);
    if (p === 'AA') return String(anno % 100).padStart(2, '0');
    return String(numero).padStart(p.length, '0');
  });
}

/** Le regole di un formato nuovo: un posto per il numero, l'anno se riparte ogni anno. */
function controllaFormato(formato, annuale) {
  const f = testo(formato);
  if (!f) throw new Rifiuto('Scrivi il formato, per esempio {AA}ST{NNN}');
  const segnaposti = f.match(/\{[^}]*\}/g) || [];
  for (const s of segnaposti) {
    if (!/^\{(AAAA|AA|N+)\}$/.test(s)) {
      throw new Rifiuto('Segnaposto sconosciuto: ' + s + '. Si possono usare {AAAA}, {AA} e {N}, {NN}, {NNN}...');
    }
  }
  const numeri = segnaposti.filter(s => /^\{N+\}$/.test(s));
  if (numeri.length !== 1) throw new Rifiuto('Il formato deve avere un solo posto per il numero, per esempio {NNN}');
  if (annuale && !segnaposti.some(s => s === '{AAAA}' || s === '{AA}')) {
    throw new Rifiuto('Una numerazione che riparte ogni anno deve avere l\'anno nel formato: {AAAA} o {AA}');
  }
  if (!/^[A-Za-z0-9/_. {}-]+$/.test(f)) {
    throw new Rifiuto('Nel formato si possono usare lettere, cifre, / - _ . e i segnaposti');
  }
  return f;
}

/**
 * Fase 8 (fase8.md §9.6): il codice da formato, anno e numero. E' formatta() col nome dell'accordo: la stessa funzione
 * sta in Kotlin e in pc/ui/regole.js, con gli stessi casi (server/prove/casi-numerazioni.json), perche' il telefono
 * senza rete sa scrivere da solo il codice di una commessa nuova anche con un formato nuovo.
 */
function codiceDa(formato, anno, numero) {
  return formatta(formato, anno, numero);
}

/**
 * Il prossimo numero e il suo codice, dai codici gia' scritti: il piu' alto + 1, contando quelli col formato di adesso e
 * coi formati di prima (cambiare formato non fa ripartire il contatore); per una numerazione che riparte ogni anno solo
 * quelli dell'anno. n = {formato, precedenti: [formati], annuale, ultimo}. Come Wisper.prossimoNumero, senza database.
 */
function prossimoDa(n, codici, anno) {
  const formati = [n.formato].concat(n.precedenti || []);
  const schemi = formati.map(schemaFormato);
  let max = n.annuale ? 0 : (Number(n.ultimo) || 0);
  for (const c of codici || []) {
    const s = String(c || '').trim();
    for (const sc of schemi) {
      const m = s.match(sc.re);
      if (!m) continue;
      if (n.annuale) {
        const a = sc.anno4 ? Number(m[sc.anno4]) : sc.anno2 ? Number(m[sc.anno2]) : null;
        if (a === null) continue;
        if (sc.anno4 ? a !== anno : a !== anno % 100) continue;
      }
      max = Math.max(max, parseInt(m[sc.numero], 10));
      break;
    }
  }
  return { numero: max + 1, codice: formatta(n.formato, anno, max + 1) };
}

module.exports = { schemaFormato, formatta, controllaFormato, codiceDa, prossimoDa };
