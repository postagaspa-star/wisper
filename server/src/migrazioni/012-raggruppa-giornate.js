/*
 * Migrazione 012, dopo l'SQL (07/11/2026): i rapportini fatti prima della 1.2 si uniscono per giorno e per persona.
 *
 * La 011 aveva lasciato ogni riga di prima come un rapportino con un lavoro solo (stesso numero del lavoro). Qui quelli
 * dello stesso giorno, della stessa persona (utente e nome del tecnico), diventano un rapportino solo: tiene il numero
 * del primo fatto quel giorno, i lavori vanno in fila nell'ordine in cui erano stati scritti. I lavori non cambiano:
 * stesso id, stato, fatture, spese, file; cambiano solo id_giornata e posizione. I rapportini rimasti vuoti si tolgono.
 *
 * Si toccano solo i rapportini "di prima": un lavoro solo, con lo stesso id del rapportino. Quelli fatti con la 1.2
 * (lavori <numero>-<n>) restano come sono: due rapportini nello stesso giorno, fatti apposta, restano due (scelta di
 * Andrea del 07/11).
 */
'use strict';

const { adesso } = require('../utili');

module.exports = function migrazione012(db) {
  const ora = adesso();
  const vecchi = db.righe(
    'SELECT g.id, g.data, g.tecnico, g.utente_id, g.creato, g.modificato, r.creato AS creato_lavoro ' +
    'FROM giornate g JOIN rapportini r ON r.id = g.id AND r.id_giornata = g.id ' +
    'WHERE (SELECT COUNT(*) FROM rapportini x WHERE x.id_giornata = g.id) = 1');
  const gruppi = new Map();
  for (const g of vecchi) {
    if (!g.data) continue;
    const chiave = [g.data, g.utente_id === null || g.utente_id === undefined ? '' : g.utente_id, (g.tecnico || '').trim().toLowerCase()].join('|');
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(g);
  }
  for (const gruppo of gruppi.values()) {
    if (gruppo.length < 2) continue;
    const prima = (g) => g.creato_lavoro || g.creato || '';
    gruppo.sort((a, b) => prima(a).localeCompare(prima(b)) || a.id.localeCompare(b.id));
    const capo = gruppo[0];
    gruppo.forEach((g, i) => {
      db.esegui('UPDATE rapportini SET id_giornata = ?, posizione = ? WHERE id = ?', capo.id, i + 1, g.id);
      if (g.id === capo.id) return;
      db.esegui('DELETE FROM giornate WHERE id = ?', g.id);
      db.esegui(
        'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ora, null, 'sistema', '', 'migrazione', 'rapportini', g.id, JSON.stringify({ idGiornata: g.id, posizione: 1 }),
        JSON.stringify({ idGiornata: capo.id, posizione: i + 1 }), 'migrazione 012: nel rapportino del suo giorno');
    });
    const creato = gruppo.map(g => g.creato || '').filter(Boolean).sort()[0] || capo.creato || '';
    const modificato = gruppo.map(g => g.modificato || '').filter(Boolean).sort().pop() || capo.modificato || '';
    db.esegui('UPDATE giornate SET creato = ?, modificato = ? WHERE id = ?', creato, modificato, capo.id);
  }
};
