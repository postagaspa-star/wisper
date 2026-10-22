/*
 * La seconda meta' della migrazione 003, quella che l'SQL da solo non sa fare
 * bene: le spese gia' scritte nei rapportini diventano righe "spese".
 *
 * La regola (architettura.md §14.11): ogni rapportino con un importo di spese
 * diverso da zero riceve UNA riga "spese" legata a lui (dal_rapportino = 1),
 * destinazione "cliente", con lo stesso identico importo, la sua data, la sua
 * commessa e il suo cliente, la descrizione dalle note spese, approvata (prima
 * della fase 3 non serviva approvare) e fatturata se il rapportino lo e'. Le
 * foto del rapportino diventano le foto di quella riga (file.spesa_id).
 *
 * Il rapportino NON si tocca: la colonna "spese" resta quella che era, quindi
 * totali, conti, PDF e riepiloghi restano identici al centesimo (lo prova
 * server/prove/migrazione-spese.test.js). Anche gli annullati ricevono la riga,
 * cosi' un ripristino li riporta com'erano.
 *
 * La stessa funzione serve all'importazione dal foglio (strumenti/importa.js):
 * un database nuovo ha gia' tutte le migrazioni, e i rapportini arrivano dopo.
 * Rifarla non crea doppioni: salta i rapportini che hanno gia' la loro riga.
 */
'use strict';

const { testo, numero, dataIso, adesso } = require('../utili');

/**
 * @param db    il Database (db.js): esegui, riga, righe
 * @param nota  la nota per il registro
 * @return quante righe sono nate
 */
function speseDaiRapportini(db, nota) {
  const ora = adesso();
  const righe = db.righe(
    'SELECT r.* FROM rapportini r WHERE NOT EXISTS (SELECT 1 FROM spese s WHERE s.rapportino_id = r.id AND s.dal_rapportino = 1) ORDER BY r.rowid');
  let nate = 0;
  for (const r of righe) {
    const importo = numero(r.spese);
    if (importo === 0) continue;
    const fatturato = testo(r.stato).toUpperCase() === 'FATTURATO';
    const v = {
      utente_id: r.utente_id === undefined ? null : r.utente_id,
      data: dataIso(r.data) || '',
      importo,
      categoria: 'altro',
      descrizione: testo(r.note_spese) || 'Spese del rapportino',
      commessa_id: testo(r.id_commessa),
      cliente_id: testo(r.id_cliente),
      rapportino_id: r.id,
      destinazione: 'cliente',
      anticipazione: 0,
      pagata_da_me: 0,
      stato: 'approvata',
      fatturata_il: fatturato ? testo(r.fatturato_il) : '',
      dal_rapportino: 1,
      creato: testo(r.creato) || ora,
      modificato: ora,
    };
    const colonne = Object.keys(v);
    const fatto = db.esegui('INSERT INTO spese (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')', v);
    const id = Number(fatto.lastInsertRowid);
    const dopo = {};
    for (const k of colonne) if (v[k] !== null && v[k] !== '' && k !== 'modificato') dopo[k] = v[k];
    db.esegui('INSERT INTO registro (quando, utente, azione, tabella, id_riga, prima, dopo, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ora, 'sistema', 'migrazione', 'spese', String(id), null, JSON.stringify(dopo), nota);
    // Le foto del rapportino (anche quelle nel cestino: se tornano, tornano al posto giusto).
    const foto = db.righe("SELECT id FROM file WHERE rapportino_id = ? AND tipo = 'spesa' AND spesa_id IS NULL", r.id);
    for (const f of foto) {
      db.esegui('UPDATE file SET spesa_id = ? WHERE id = ?', id, f.id);
      db.esegui('INSERT INTO registro (quando, utente, azione, tabella, id_riga, prima, dopo, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ora, 'sistema', 'migrazione', 'file', f.id, JSON.stringify({ spesa_id: null }), JSON.stringify({ spesa_id: id }), nota);
    }
    nate++;
  }
  return nate;
}

/** Chiamata da db.js dopo 003-ore-spese.sql, nella stessa transazione. */
function migra(db) {
  const n = speseDaiRapportini(db, 'migrazione 003: le spese del rapportino diventano una riga di spese');
  if (n) console.log('[migrazione 003] ' + n + ' rapportini con spese: una riga di spese per ognuno');
}

module.exports = migra;
module.exports.speseDaiRapportini = speseDaiRapportini;
