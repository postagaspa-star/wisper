/*
 * Il passaggio della bozza al programma delle fatture (fase4.md §8.4).
 *
 * Wisper prepara, il programma di Manuel emette (decisione 5). Non sappiamo
 * ancora quale programma sia: per questo da un solo MODELLO della fattura
 * (fatture.js, modelloFattura) nascono una o piu' USCITE, un file per uscita in
 * questa cartella. PASSAGGIO_USCITE (impostazioni) dice quali mandare alle app,
 * che mostrano un pulsante per ognuna. Quando sapremo il programma si aggiunge
 * qui un file (un CSV, un collegamento) e nient'altro cambia.
 */
'use strict';

const USCITE = {
  prospetto: require('./prospetto'),
  xml: require('./xml'),
};

/** Le uscite accese, nell'ordine dell'impostazione (quelle sconosciute si saltano). */
function usciteAttive(impostazioni) {
  const scritte = Array.isArray(impostazioni.PASSAGGIO_USCITE) ? impostazioni.PASSAGGIO_USCITE : ['prospetto', 'xml'];
  return scritte.map(u => String(u)).filter((u, i, tutte) => USCITE[u] && tutte.indexOf(u) === i);
}

module.exports = { USCITE, usciteAttive };
