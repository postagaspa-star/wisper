/*
 * La seconda meta' della migrazione 005 (fase 5, fase5.md §4.5):
 *  - rimette i contatori AUTOINCREMENT delle tabelle rifatte (attivita,
 *    attivita_checklist, fattura_sorgenti) com'erano prima: un id tolto non
 *    torna mai a un'altra riga;
 *  - le categorie dei documenti e i testi dei modelli iniziali;
 *  - ogni file "documento" non cestinato (i documenti delle commesse, anche
 *    quelli copiati da Drive) diventa un documento dell'archivio, categoria
 *    "Da classificare", con la sua rev. 0 approvata. Il file non si sposta e
 *    tiene il suo id: /file/<id> e i riferimenti di prima continuano a valere;
 *  - ogni commessa con la cartella Drive di prima riceve il collegamento
 *    "Cartella della commessa {id}" (cartella principale). La colonna
 *    commesse.cartella resta com'e', per le versioni vecchie;
 *  - i file gia' arrivati fuori casa (creati prima dell'ultima copia riuscita,
 *    come li mandava la fase 1) prendono fuori_il: la copia di adesso, un file
 *    alla volta, non li rimanda tutti la prima notte.
 * Ogni riga nuova lascia la sua riga nel registro (utente "sistema", azione
 * "migrazione"), come le migrazioni 003 e 004.
 */
'use strict';

const path = require('node:path');
const { adesso, dataIso } = require('../utili');

/** Le 16 categorie iniziali, in quest'ordine: [nome, approvazione, vede, scadenza_mesi, sistema]. */
const CATEGORIE = [
  ['Progetti e schemi', 1, 'tutti', null, 0],
  ['Dichiarazioni di conformità', 1, 'tutti', null, 0],
  ['Dichiarazioni di rispondenza', 1, 'tutti', null, 0],
  ['Verbali di verifica', 0, 'tutti', null, 0],
  ['Relazioni e collaudi', 1, 'tutti', null, 0],
  ['Certificati', 0, 'tutti', 12, 0],
  ['Contratti', 0, 'costi', null, 0],
  ['Polizze e assicurazioni', 0, 'costi', 12, 0],
  ['Corrispondenza', 0, 'tutti', null, 0],
  ['Foto', 0, 'tutti', null, 0],
  ['Manuali e schede tecniche', 0, 'tutti', null, 0],
  ['Modelli dello studio', 0, 'tutti', null, 0],
  ['Documenti dello studio', 0, 'tutti', null, 0],
  ['Mandati ai clienti', 0, 'costi', null, 1],
  ['Da classificare', 0, 'tutti', null, 1],
  ['Documenti personali', 0, 'riservati', null, 1],
];

/**
 * I testi dei modelli che si cambiano (fase5.md §5.7). Quelli delle email sono
 * i testi che le app scrivevano gia' (pc/ui/app.js, pc/ui/preventivi.js), coi
 * segnaposti al posto dei pezzi che cambiano.
 */
const TESTI = [
  ['EMAIL_RAPPORTINO_OGGETTO', 'Rapportino {rapportino} del {data}'],
  ['EMAIL_RAPPORTINO_MESSAGGIO', ''],
  ['EMAIL_RIEPILOGO_OGGETTO', 'Rapportini {periodo} · {cliente}'],
  ['EMAIL_RIEPILOGO_MESSAGGIO', ''],
  ['EMAIL_PREVENTIVO_OGGETTO', 'Preventivo {preventivo} · {oggetto}'],
  ['EMAIL_PREVENTIVO_MESSAGGIO', 'Buongiorno,\nin allegato il preventivo per {oggetto}, valido fino al {scadenza}.\n' +
    'Per accettarlo basta rispondere a questa email o rimandarlo firmato.\n\nCordiali saluti\n{tecnico}'],
  ['EMAIL_DOCUMENTO_OGGETTO', '{documento}'],
  ['EMAIL_DOCUMENTO_MESSAGGIO', 'Buongiorno,\nin allegato {documento}.\n\nCordiali saluti\n{tecnico}'],
  ['PREVENTIVO_INTRODUZIONE', ''],
  ['LETTERA_VERIFICA_TERRA', 'Gentile {cliente},\nl\'impianto di terra di {impianto} è stato verificato il {ultima_verifica}: ' +
    'la prossima verifica periodica va fatta entro il {scadenza}, come chiede il DPR 462/2001.\n' +
    'La verifica la fanno l\'ASL, l\'ARPA o un organismo abilitato: se vuole, ci occupiamo noi di prenotarla e di preparare i documenti che servono.\n\n' +
    'Cordiali saluti\n{tecnico}\n{studio}'],
  ['LETTERA_LIBERA', 'Gentile {cliente},\n\n\nCordiali saluti\n{tecnico}\n{studio}'],
  ['CONTRATTO_CONDIZIONI', 'Il contratto {contratto} vale dal {dal} al {al} per gli impianti elencati e comprende le visite periodiche indicate. ' +
    'Il lavoro fuori contratto si fattura a parte. Il canone annuo è di {canone} e si paga con le rate indicate. ' +
    'Se il rinnovo è tacito, il contratto si rinnova da solo di anno in anno finché una delle parti non lo disdice per iscritto con il preavviso indicato.'],
];

function annota(db, ora, tabella, id, prima, dopo, nota) {
  db.esegui(
    'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ora, null, 'sistema', '', 'migrazione', tabella, String(id), prima ? JSON.stringify(prima) : null, dopo ? JSON.stringify(dopo) : null, nota || '');
}

function inserisci(db, ora, tabella, valori, nota) {
  const colonne = Object.keys(valori);
  const r = db.esegui('INSERT INTO ' + tabella + ' (' + colonne.join(', ') + ') VALUES (' + colonne.map(c => '@' + c).join(', ') + ')', valori);
  const id = Number(r.lastInsertRowid);
  const dopo = {};
  for (const k of colonne) if (valori[k] !== null && valori[k] !== undefined && valori[k] !== '') dopo[k] = valori[k];
  annota(db, ora, tabella, id, null, dopo, nota);
  return id;
}

module.exports = function migrazione005(db) {
  const ora = adesso();
  // La funzione che riconosce il tipo del collegamento sta accanto (src/documenti.js): e' la stessa delle azioni.
  const { tipoCollegamento } = require(path.join(__dirname, '..', 'documenti'));

  // ---- i contatori di prima delle tabelle rifatte
  for (const c of db.righe('SELECT name, seq FROM temp.contatori_prima')) {
    const ora2 = db.riga('SELECT seq FROM sqlite_sequence WHERE name = ?', c.name);
    if (!ora2) db.esegui('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', c.name, c.seq);
    else if (ora2.seq < c.seq) db.esegui('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', c.seq, c.name);
  }
  db.esegui('DROP TABLE temp.contatori_prima');

  // ---- categorie e testi
  const categorie = {};
  CATEGORIE.forEach(([nome, approvazione, vede, mesi, sistema], i) => {
    categorie[nome] = inserisci(db, ora, 'documento_categorie', { nome, approvazione, vede, scadenza_mesi: mesi, ordine: i + 1, attiva: 1, sistema });
  });
  for (const [chiave, testo] of TESTI) db.esegui('INSERT OR IGNORE INTO modelli_testi (chiave, testo, modificato) VALUES (?, ?, ?)', chiave, testo, ora);

  // ---- i documenti delle commesse entrano nell'archivio, con gli stessi id dei file
  const commesse = {};
  db.righe('SELECT id, cliente_id, cartella FROM commesse').forEach(m => { commesse[String(m.id).toUpperCase()] = m; });
  const daClassificare = categorie['Da classificare'];
  let documenti = 0;
  for (const f of db.righe("SELECT * FROM file WHERE tipo = 'documento' AND cestinato IS NULL ORDER BY creato, rowid")) {
    const m = f.commessa_id ? commesse[String(f.commessa_id).toUpperCase()] : null;
    const titolo = String(f.nome || f.id).replace(/\.[A-Za-z0-9]{1,5}$/, '') || f.id;
    const nota = 'migrazione 005: il documento della commessa entra nell\'archivio';
    const idDoc = inserisci(db, ora, 'documenti', {
      titolo, categoria_id: daClassificare, cliente_id: m ? m.cliente_id || '' : '', commessa_id: m ? m.id : String(f.commessa_id || ''),
      origine: 'file', vede: 'tutti', data_documento: dataIso(f.creato) || '', creato: f.creato, modificato: f.creato,
    }, nota);
    const idVer = inserisci(db, ora, 'documento_versioni', {
      documento_id: idDoc, numero: 0, file_id: f.id, nome_file: f.nome || f.id, mime: f.mime || '', byte: f.byte, sha256: f.sha256,
      nota: '', stato: 'approvata', caricata_il: f.creato, decisa_il: f.creato,
    }, nota);
    db.esegui('UPDATE documenti SET versione_valida_id = ? WHERE id = ?', idVer, idDoc);
    db.esegui('UPDATE file SET documento_id = ?, versione_id = ? WHERE id = ?', idDoc, idVer, f.id);
    documenti++;
  }

  // ---- la cartella Drive di ogni commessa diventa la sua cartella principale
  for (const m of db.righe("SELECT id, cliente_id, cartella FROM commesse WHERE cartella <> '' ORDER BY rowid")) {
    let url = String(m.cartella).trim();
    // Il foglio poteva avere solo l'id della cartella di Drive: diventa il suo indirizzo.
    if (/^[A-Za-z0-9_-]{20,}$/.test(url)) url = 'https://drive.google.com/drive/folders/' + url;
    let tipo;
    try {
      tipo = tipoCollegamento(url);
    } catch (err) {
      // Un indirizzo che non si riconosce non diventa un collegamento: resta nella commessa com'era.
      annota(db, ora, 'commesse', m.id, null, null, 'migrazione 005: la cartella "' + url.slice(0, 120) + '" non è un indirizzo riconosciuto, resta solo nella commessa');
      continue;
    }
    inserisci(db, ora, 'documenti', {
      titolo: 'Cartella della commessa ' + m.id, categoria_id: daClassificare, cliente_id: m.cliente_id || '', commessa_id: m.id,
      origine: 'collegamento', url: tipo.url, collegamento_tipo: tipo.tipo, cartella: 1, principale: 1, vede: 'tutti', creato: ora, modificato: ora,
    }, 'migrazione 005: la cartella della commessa diventa un collegamento');
  }

  // ---- i file gia' copiati fuori casa dalla fase 1 non si rimandano
  const ultima = db.riga("SELECT quando FROM copie WHERE fuori LIKE 'ok%' ORDER BY id DESC LIMIT 1");
  if (ultima) {
    const limite = Date.parse(ultima.quando);
    for (const f of db.righe('SELECT id, creato FROM file WHERE percorso IS NOT NULL AND drive_url IS NULL')) {
      if (Date.parse(f.creato) <= limite) db.esegui('UPDATE file SET fuori_il = ? WHERE id = ?', ultima.quando, f.id);
    }
  }
  return documenti;
};

Object.defineProperties(module.exports, {
  CATEGORIE: { value: CATEGORIE },
  TESTI: { value: TESTI },
});
