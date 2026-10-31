/*
 * La seconda meta' della migrazione 006 (fase 6, fase6.md §4.6):
 *  - rimette i contatori AUTOINCREMENT delle tabelle rifatte (ore, scadenze)
 *    com'erano prima: un id tolto non torna mai a un'altra riga;
 *  - ogni utente che non e' "esterno" riceve la sua persona (stesso nome,
 *    utente_id, rapporto "titolare" per i titolari, vuoto per gli altri):
 *    nessun costo, nessun saldo, nessuna ora all'anno, quindi nessun conto cambia;
 *  - i veicoli restano "auto di una persona" (le colonne nuove hanno gia' quel
 *    valore): le trasferte non cambiano di un centesimo;
 *  - i permessi del ruolo "esterno" e, per il collaboratore, persone 1 se era 0;
 *  - i tipi di qualifica (proposte da confermare con l'RSPP e con Manuel), le
 *    categorie nuove dei documenti, il testo della lettera d'incarico.
 * Ogni riga nuova lascia la sua riga nel registro (utente "sistema", azione
 * "migrazione"), come le migrazioni 003, 004 e 005.
 */
'use strict';

const { adesso } = require('../utili');

/** I tipi iniziali di competenze e formazione (fase6.md §5.3): [chiave, nome, gruppo, ogni_mesi, preavviso_giorni]. */
const QUALIFICHE = [
  ['pes', 'PES · Persona esperta (CEI 11-27)', 'elettrico', 60, 90],
  ['pav', 'PAV · Persona avvertita (CEI 11-27)', 'elettrico', 60, 90],
  ['pei', 'PEI · Lavori sotto tensione (CEI 11-27)', 'elettrico', 60, 90],
  ['formazione_generale', 'Formazione generale dei lavoratori', 'sicurezza', null, null],
  ['formazione_specifica', 'Formazione specifica dei lavoratori', 'sicurezza', 60, 90],
  ['preposto', 'Preposto', 'sicurezza', 24, 60],
  ['datore', 'Datore di lavoro (accordo 2025)', 'sicurezza', 60, 90],
  ['rspp_datore', 'Datore di lavoro che fa da RSPP', 'sicurezza', 60, 90],
  ['rls', 'Rappresentante dei lavoratori per la sicurezza', 'sicurezza', 12, 30],
  ['primo_soccorso', 'Primo soccorso', 'emergenza', 36, 60],
  ['antincendio', 'Antincendio', 'emergenza', 60, 60],
  ['quota', 'Lavori in quota e DPI anticaduta', 'sicurezza', 60, 60],
  ['ple', 'Piattaforme di lavoro elevabili', 'sicurezza', 60, 60],
  ['patente', 'Patente di guida', 'altro', null, 60],
  ['altro', 'Altro', 'altro', null, 30],
];

/** Le categorie nuove dei documenti (fase6.md §4.5): [nome, approvazione, vede, scadenza_mesi]. Tutte di sistema. */
const CATEGORIE = [
  ['Contratti di lavoro', 0, 'riservati', null],
  ['Cedolini', 0, 'riservati', null],
  ['Idoneità sanitarie', 0, 'riservati', null],
  ['Attestati e abilitazioni', 0, 'tutti', null],
  ['Consegne DPI', 0, 'tutti', null],
  ['Documenti dei mezzi', 0, 'tutti', 12],
  ['Certificati di taratura', 0, 'tutti', 12],
  ['Documenti dei collaboratori', 0, 'tutti', 12],
  ['Lettere d\'incarico', 0, 'costi', null],
];

/** I permessi del ruolo esterno (fase6.md §11.2): tutto il resto e' 0. */
const PERMESSI_ESTERNO = { dashboard: 1, commesse: 1, rapportini: 2, attivita: 2, spese: 2, ticket: 2, documenti: 1, collaboratori: 1 };
const TUTTI_I_MODULI = ['dashboard', 'clienti', 'commesse', 'preventivi', 'attivita', 'rapportini', 'spese', 'fatturazione', 'banche', 'persone',
  'documenti', 'ticket', 'mezzi', 'comunicazioni', 'portale', 'collaboratori', 'integrazioni', 'amministrazione', 'costi', 'riservati'];

const LETTERA_INCARICO = 'Gentile {collaboratore},\ncon questa lettera Le affidiamo l\'incarico {incarico} per la commessa {commessa} ({cliente}).\n\n' +
  'Cosa fare: {descrizione}\nDal {dal} al {al}.\nCompenso: {compenso}.\n\n' +
  'La preghiamo di restituirci una copia firmata per accettazione.\n\nCordiali saluti\n{studio}\n{oggi}';

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

module.exports = function migrazione006(db) {
  const ora = adesso();

  // ---- i contatori di prima delle tabelle rifatte
  for (const c of db.righe('SELECT name, seq FROM temp.contatori_prima')) {
    const ora2 = db.riga('SELECT seq FROM sqlite_sequence WHERE name = ?', c.name);
    if (!ora2) db.esegui('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', c.name, c.seq);
    else if (ora2.seq < c.seq) db.esegui('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', c.seq, c.name);
  }
  db.esegui('DROP TABLE temp.contatori_prima');

  // ---- una persona per ogni utente (non esterno): stesso nome, nessun costo, nessun saldo
  let persone = 0;
  for (const u of db.righe("SELECT id, nome, ruolo, creato FROM utenti WHERE ruolo <> 'esterno' ORDER BY id")) {
    if (db.riga('SELECT id FROM persone WHERE utente_id = ?', u.id)) continue;
    inserisci(db, ora, 'persone', {
      nome: u.nome, utente_id: u.id, rapporto: u.ruolo === 'titolare' ? 'titolare' : '', creato: ora, modificato: ora,
    }, 'migrazione 006: la persona dell\'utente ' + u.id);
    persone++;
  }

  // ---- i veicoli: "auto di una persona", senza persona (le colonne nuove l'hanno gia' di base)
  for (const v of db.righe('SELECT id FROM veicoli ORDER BY id')) {
    annota(db, ora, 'veicoli', v.id, null, { proprieta: 'persona', tipo: 'auto' }, 'migrazione 006: il veicolo diventa un mezzo, auto di una persona: le trasferte non cambiano');
  }

  // ---- permessi: il ruolo esterno; il collaboratore vede l'organico (persone 1) se prima era 0
  for (const m of TUTTI_I_MODULI) {
    const r = db.esegui('INSERT OR IGNORE INTO permessi (ruolo, modulo, livello) VALUES (?, ?, ?)', 'esterno', m, PERMESSI_ESTERNO[m] || 0);
    if (r.changes) annota(db, ora, 'permessi', 'esterno.' + m, null, { livello: PERMESSI_ESTERNO[m] || 0 }, 'migrazione 006: il ruolo esterno');
  }
  const coll = db.riga("SELECT livello FROM permessi WHERE ruolo = 'collaboratore' AND modulo = 'persone'");
  if (coll && coll.livello === 0) {
    db.esegui("UPDATE permessi SET livello = 1 WHERE ruolo = 'collaboratore' AND modulo = 'persone'");
    annota(db, ora, 'permessi', 'collaboratore.persone', { livello: 0 }, { livello: 1 }, 'migrazione 006: il collaboratore vede l\'organico come una rubrica');
  }

  // ---- tipi di qualifica, categorie dei documenti, lettera d'incarico
  QUALIFICHE.forEach(([chiave, nome, gruppo, ogni, preavviso], i) => {
    if (db.riga('SELECT chiave FROM qualifica_tipi WHERE chiave = ?', chiave)) return;
    inserisci(db, ora, 'qualifica_tipi', { chiave, nome, gruppo, ogni_mesi: ogni, preavviso_giorni: preavviso, ordine: i + 1, attivo: 1, sistema: 1 });
  });
  let ordine = (db.riga('SELECT MAX(ordine) m FROM documento_categorie').m || 0);
  for (const [nome, approvazione, vede, mesi] of CATEGORIE) {
    if (db.riga('SELECT id FROM documento_categorie WHERE nome = ? AND sistema = 1', nome)) continue;
    inserisci(db, ora, 'documento_categorie', { nome, approvazione, vede, scadenza_mesi: mesi, ordine: ++ordine, attiva: 1, sistema: 1 });
  }
  db.esegui('INSERT OR IGNORE INTO modelli_testi (chiave, testo, modificato) VALUES (?, ?, ?)', 'LETTERA_INCARICO', LETTERA_INCARICO, ora);
  return persone;
};

Object.defineProperties(module.exports, {
  QUALIFICHE: { value: QUALIFICHE },
  CATEGORIE: { value: CATEGORIE },
  PERMESSI_ESTERNO: { value: PERMESSI_ESTERNO },
  LETTERA_INCARICO: { value: LETTERA_INCARICO },
});
