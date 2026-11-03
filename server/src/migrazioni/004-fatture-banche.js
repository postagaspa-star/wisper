/*
 * La seconda meta' della migrazione 004 (fase 4): le commesse che hanno scadenze
 * di pagamento (acconti e saldo del contratto) diventano "a corpo", le altre
 * restano "a ore" (fase4.md §4.2). Cosi' i rapportini e le ore di una commessa a
 * corpo non compaiono in Da fatturare: sono gia' dentro il prezzo del contratto.
 * Chi vuole fatturare anche le ore in piu' passa la commessa a "misto".
 *
 * Ogni commessa cambiata lascia una riga nel registro (utente "sistema",
 * azione "migrazione"), come le spese della migrazione 003.
 */
'use strict';

const { adesso } = require('../utili');

module.exports = function migrazione004(db) {
  const ora = adesso();
  const righe = db.righe(
    "SELECT id FROM commesse WHERE modo_fatturazione <> 'corpo' AND EXISTS (SELECT 1 FROM scadenze_pagamento s WHERE s.commessa_id <> '' AND UPPER(s.commessa_id) = UPPER(commesse.id)) ORDER BY rowid");
  for (const r of righe) {
    db.esegui("UPDATE commesse SET modo_fatturazione = 'corpo' WHERE id = ?", r.id);
    db.esegui(
      'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ora, null, 'sistema', '', 'migrazione', 'commesse', r.id, JSON.stringify({ modo_fatturazione: 'ore' }),
      JSON.stringify({ modo_fatturazione: 'corpo' }), 'migrazione 004: ha le scadenze di pagamento del contratto, si fattura a corpo');
  }
  return righe.length;
};
