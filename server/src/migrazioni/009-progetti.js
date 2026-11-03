/*
 * Migrazione 009, dopo l'SQL: il modulo "progetti" nei permessi di ogni ruolo, con lo stesso livello che il ruolo ha
 * sulle commesse (anche se il titolare l'aveva cambiato). Il titolare ha sempre tutto; i ruoli che mancano li
 * completa wisper.prepara() coi valori iniziali.
 */
'use strict';

const { adesso } = require('../utili');

module.exports = function migrazione009(db) {
  const ora = adesso();
  for (const r of db.righe("SELECT ruolo, livello FROM permessi WHERE modulo = 'commesse' ORDER BY ruolo")) {
    const fatto = db.esegui('INSERT OR IGNORE INTO permessi (ruolo, modulo, livello) VALUES (?, ?, ?)', r.ruolo, 'progetti', r.livello);
    if (!fatto.changes) continue;
    db.esegui(
      'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ora, null, 'sistema', '', 'migrazione', 'permessi', r.ruolo + '.progetti', null, JSON.stringify({ livello: r.livello }),
      'migrazione 009: i progetti come le commesse');
  }
};
