/*
 * Quello che si confronta prima e dopo la migrazione 005 (fase5.md §4.5 e
 * §5.7: "i PDF di oggi non cambiano"). Lo stesso codice gira col server 0.7.0
 * (genera-prima.js) e con quello di adesso (migrazione-005.test.js):
 *  - rapportini: tutti, campo per campo, come li manda il server;
 *  - documenti: l'azione "documenti" di Code.gs per ogni commessa (cartella e file);
 *  - pdf: l'impronta (SHA-256) del testo dei PDF di oggi fatti da pc/ui/documenti.js (gli stessi di
 *    telefono e computer): ogni rapportino, il riepilogo di settembre di
 *    Elettrodinamica, ogni preventivo, il prospetto di ogni fattura, l'avviso
 *    di parcella della W-14;
 *  - conti: i conti di ogni fattura e il costo di ogni commessa.
 * Le date "di oggi" dei PDF sono fisse, cosi' il confronto non dipende dal giorno.
 */
'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const Documenti = require(path.join(__dirname, '..', '..', '..', 'pc', 'ui', 'documenti.js'));

const OGGI = '2026-10-22';

function uscite(w) {
  const rapportini = w.leggiRapportini('', '', true).sort((a, b) => (a.id < b.id ? -1 : 1));
  const commesse = w.db.righe('SELECT id FROM commesse ORDER BY id').map(m => m.id);
  const documenti = {};
  for (const id of commesse) documenti[id] = w.documentiCommessa(id);
  const ana = w.rispostaAnagrafiche({});
  const pdf = {};
  for (const r of rapportini) pdf['rapportino ' + r.id] = Documenti.rapportino(r, ana);
  const settembre = rapportini.filter(r => r.idCliente === 'C001' && r.data.slice(0, 7) === '2026-09' && r.stato !== 'ANNULLATO');
  pdf['riepilogo C001 2026-09'] = Documenti.riepilogo(settembre, ana, { nome: 'Elettrodinamica', righe: [] }, 'Settembre 2026', { conImporti: true });
  for (const p of w.db.righe('SELECT id FROM preventivi WHERE modello = 0 ORDER BY id')) {
    pdf['preventivo ' + p.id] = Documenti.preventivo(w.preventivoCompleto(w.rigaPreventivo(p.id)), ana, {});
  }
  const conti = { fatture: {}, commesse: {} };
  for (const f of w.db.righe('SELECT * FROM fatture ORDER BY id')) {
    const m = w.modelloFattura(f, { ibanIntero: true });
    m.dataProposta = OGGI;
    pdf['prospetto ' + f.riferimento] = Documenti.prospettoFattura(m, { oggi: OGGI });
    if (f.riferimento === 'W-14') pdf['avviso W-14'] = Documenti.avvisoParcella(m, { oggi: OGGI });
    conti.fatture[f.riferimento] = w.fatturaCompleta(f).conti;
  }
  for (const id of commesse) conti.commesse[id] = w.costoDellaCommessa({ id });
  // Del testo (HTML con lo stile, decine di KB ciascuno) si tiene l'impronta: se cambia anche una lettera, cambia.
  const impronte = {};
  for (const k of Object.keys(pdf)) impronte[k] = { sha256: crypto.createHash('sha256').update(pdf[k]).digest('hex'), caratteri: pdf[k].length };
  return { rapportini, documenti, pdf: impronte, conti };
}

module.exports = { uscite, OGGI };
