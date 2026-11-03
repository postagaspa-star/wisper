/*
 * La seconda meta' della migrazione 007 (fase 7, fase7.md §5.5):
 *  - i modelli dei messaggi di §9.2 (sistema = 1: si cambiano, non si tolgono), coi testi esatti dell'accordo;
 *  - i permessi nuovi di §11.2: il collaboratore ha "comunicazioni" 2 (solo le sue, lo decide il server) se prima era 0;
 *    "portale" resta 0 per lui e per l'esterno, 2 per titolare e amministrazione, 1 per lettura (gia' cosi' dalla fase 1);
 *  - lo storico parte da quello che si sa gia': ogni documento "inviato" della fase 5 (la copia di un PDF mandato per
 *    email) diventa una riga di comunicazioni (email, mandato), con l'indirizzo dalla nota "mandato a {email} il {data}",
 *    l'istante del documento, cliente, commessa e ticket del documento.
 * Nessun cliente ha il portale, nessun referente ha l'accesso, nessun "si'" a WhatsApp, nessuna pubblicazione: le
 * colonne nuove partono vuote. Il segreto del portale non sta nel database: lo crea il server al primo avvio
 * (/data/portale-segreto, permessi 600).
 * Ogni riga nuova lascia la sua riga nel registro (utente "sistema", azione "migrazione"), come le migrazioni di prima.
 */
'use strict';

const { adesso } = require('../utili');

/** I modelli iniziali (§9.2): [chiave, nome, canale, uso, oggetto, testo]. */
const MODELLI = [
  ['promemoria_appuntamento', 'Promemoria appuntamento', 'tutti', 'appuntamento', 'Promemoria: {giorno} alle {ora}',
    'Buongiorno {nome}, le ricordo l\'appuntamento di {giorno} alle {ora} presso {luogo}: {cosa}. Se non va più bene mi scriva pure. {mittente}'],
  ['intervento_fissato', 'Intervento fissato', 'tutti', 'intervento', 'Intervento fissato per {giorno}',
    'Buongiorno {nome}, l\'intervento per {cosa} è fissato per {giorno} alle {ora} presso {luogo}.\nLo trova anche nel portale: {portale}\n{mittente}'],
  ['preventivo_mandato', 'Preventivo mandato', 'tutti', 'preventivo', 'Preventivo {preventivo}',
    'Buongiorno {nome}, le ho mandato per email il preventivo {preventivo} per {oggetto}.\nLo trova anche nel portale, dove può accettarlo: {portale}\nResto a disposizione per qualsiasi domanda. {mittente}'],
  ['rapportino_da_firmare', 'Rapportino da firmare', 'tutti', 'rapportino', 'Rapportino del {data} da firmare',
    'Buongiorno {nome}, il rapportino del {data} ({lavoro}) è ancora da firmare.\nPuò firmarlo nel portale: {portale}\nAltrimenti lo firmiamo alla prossima visita. {mittente}'],
  ['promemoria_pagamento', 'Promemoria di pagamento', 'tutti', 'pagamento', 'Promemoria: fattura {fattura}',
    'Buongiorno {nome}, le scrivo per un promemoria: la fattura {fattura} del {data_fattura}, di {importo}, risultava da saldare entro il {scadenza}. Se il pagamento è già partito, non tenga conto di questo messaggio. Grazie. {mittente}'],
  ['secondo_promemoria_pagamento', 'Secondo promemoria di pagamento', 'tutti', 'pagamento', 'Fattura {fattura}',
    'Buongiorno {nome}, torno a scriverle per la fattura {fattura} del {data_fattura}, di {importo}, con scadenza il {scadenza}. Mi può dire quando è previsto il pagamento? Se è già partito, mi scusi per il disturbo. Grazie. {mittente}'],
  ['invito_portale', 'Invito al portale', 'whatsapp', 'portale', '',
    'Buongiorno {nome}, da oggi preventivi, rapportini e documenti dello studio li trova anche nel portale: {portale}\nPer entrare basta la sua email: le arriva un link. {mittente}'],
  ['libero', 'Messaggio libero', 'tutti', 'libero', '', 'Buongiorno {nome}, '],
];

function annota(db, ora, tabella, id, prima, dopo, nota) {
  db.esegui(
    'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ora, null, 'sistema', '', 'migrazione', tabella, String(id), prima ? JSON.stringify(prima) : null, dopo ? JSON.stringify(dopo) : null, nota || '');
}

function inserisci(db, ora, tabella, valori, nota) {
  const colonne = Object.keys(valori);
  const r = db.esegui('INSERT INTO ' + tabella + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')', valori);
  const id = valori.chiave !== undefined ? valori.chiave : Number(r.lastInsertRowid);
  const dopo = {};
  for (const k of colonne) if (valori[k] !== null && valori[k] !== undefined && valori[k] !== '') dopo[k] = valori[k];
  annota(db, ora, tabella, id, null, dopo, nota);
  return id;
}

module.exports = function migrazione007(db) {
  const ora = adesso();

  // ---- i modelli dei messaggi (§9.2)
  MODELLI.forEach(([chiave, nome, canale, uso, oggetto, testo], i) => {
    if (db.riga('SELECT chiave FROM modelli_messaggi WHERE chiave = ?', chiave)) return;
    inserisci(db, ora, 'modelli_messaggi', { chiave, nome, canale, uso, oggetto, testo, attivo: 1, sistema: 1, ordine: i + 1, modificato: ora },
      'migrazione 007: modello di sistema');
  });

  // ---- permessi (§11.2): il collaboratore scrive le sue comunicazioni
  const coll = db.riga("SELECT livello FROM permessi WHERE ruolo = 'collaboratore' AND modulo = 'comunicazioni'");
  if (coll && coll.livello === 0) {
    db.esegui("UPDATE permessi SET livello = 2 WHERE ruolo = 'collaboratore' AND modulo = 'comunicazioni'");
    annota(db, ora, 'permessi', 'collaboratore.comunicazioni', { livello: 0 }, { livello: 2 }, 'migrazione 007: il collaboratore scrive le sue comunicazioni');
  }

  // ---- lo storico: una comunicazione per ogni copia di un PDF mandato (documenti "inviato" della fase 5)
  let storico = 0;
  const inviati = db.righe("SELECT d.*, (SELECT v.nota FROM documento_versioni v WHERE v.documento_id = d.id ORDER BY v.id LIMIT 1) AS nota_versione, " +
    "(SELECT v.nome_file FROM documento_versioni v WHERE v.documento_id = d.id ORDER BY v.id LIMIT 1) AS nome_file, " +
    "(SELECT f.byte FROM documento_versioni v JOIN file f ON f.id = v.file_id WHERE v.documento_id = d.id ORDER BY v.id LIMIT 1) AS byte " +
    "FROM documenti d WHERE d.origine = 'inviato' ORDER BY d.id");
  for (const d of inviati) {
    const m = String(d.nota_versione || '').match(/^mandato a (.+?) il (\d{2})\/(\d{2})\/(\d{4})$/);
    const a = m ? m[1] : '';
    const quando = d.creato || (m ? m[4] + '-' + m[3] + '-' + m[2] + 'T00:00:00+01:00' : ora);
    inserisci(db, ora, 'comunicazioni', {
      quando, canale: 'email', direzione: 'uscita', tipo: 'documento', cliente_id: d.cliente_id || '', commessa_id: d.commessa_id || '',
      ticket_id: d.ticket_id === undefined ? null : d.ticket_id, documento_id: d.id, a, oggetto: d.titolo || '',
      allegati: JSON.stringify(d.nome_file ? [{ nome: d.nome_file, byte: d.byte || 0 }] : []), stato: 'mandato', mandato_il: quando,
      utente_id: d.creato_da === undefined ? null : d.creato_da, creato: ora, modificato: ora,
    }, 'migrazione 007: dalla copia del PDF mandato (documento ' + d.id + ')');
    storico++;
  }
  return storico;
};

Object.defineProperties(module.exports, {
  MODELLI: { value: MODELLI },
});
