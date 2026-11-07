// Fase 5: la migrazione 005 (documenti, ticket e assistenza) sul database della fase 4. "Prima" non e' ricalcolato
// da questo codice: e' migrazione-005/prima.json, scritto dal server 0.7.0 sullo stesso database (genera-prima.js).
// Il requisito (fase5.md §4.5): niente di quello che c'era cambia. Rapportini campo per campo, i conti delle fatture
// e delle commesse, il testo dei PDF di oggi; i documenti delle commesse entrano nell'archivio con gli stessi id e
// l'azione di Code.gs "documenti" risponde uguale; /file/<id> da' gli stessi byte; la cartella Drive diventa la
// cartella principale della commessa; i contatori delle tabelle rifatte restano; la copia wisper.db.prima-5.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova } = require('./aiuto');
const { Database } = require('../src/db');
const { Wisper } = require('../src/wisper');
const { uscite } = require('./migrazione-005/pdf');
const PRIMA = require('./migrazione-005/prima.json');
const FILE = require('./migrazione-005/file.json');

const MIGRAZIONI = path.join(__dirname, '..', 'src', 'migrazioni');
const COLONNE_NUOVE = {
  sedi: ['categoria', 'sede_padre_id', 'matricola', 'potenza', 'tensione', 'messa_in_servizio', 'ambiente', 'referente_id', 'dati_tecnici'],
  rapportini: ['ticket_id'], ore: ['ticket_id'], spese: ['ticket_id'], attivita: ['ticket_id'], scadenze_pagamento: ['contratto_id'], commesse: ['contratto_id'],
  file: ['documento_id', 'versione_id', 'ticket_id', 'fuori_il', 'fuori_no', 'caricato_da', 'svuotato'],
};
// Fase 6: dopo la 005 parte anche la 006, che aggiunge le sue colonne (vuote) a tabelle che c'erano gia'.
const COLONNE_006 = {
  rapportini: ['incarico_id'], ore: ['incarico_id', 'creata_da'], spese: ['veicolo_id', 'attrezzatura_id', 'incarico_id'],
  fatture_ricevute: ['incarico_id', 'veicolo_id', 'attrezzatura_id'], impegni: ['veicolo_id'], utenti: ['soggetto_id'],
  file: ['manutenzione_id', 'lettura_id', 'consegna_id', 'assegnazione_id'],
  veicoli: ['targa', 'tipo', 'proprieta', 'persona_id', 'immatricolazione', 'km', 'km_il', 'tagliando_km', 'tagliando_ultimo_km',
    'tagliando_ogni_mesi', 'note', 'dismesso_il', 'dismesso_motivo'],
};
for (const [t, c] of Object.entries(COLONNE_006)) COLONNE_NUOVE[t] = (COLONNE_NUOVE[t] || []).concat(c);
// Fase 7: e poi la 007, coi suoi valori di base.
for (const [t, c] of Object.entries(require('./aiuto').COLONNE_DOPO_007)) COLONNE_NUOVE[t] = (COLONNE_NUOVE[t] || []).concat(Object.keys(c));

let cartella;
let w;
let tabellePrima;
let righePrima;
let contatoriPrima;

/** Il database della fase 4: le migrazioni 001-004 (con le loro .js) e poi le righe di fase4.sql, coi file su disco. */
function creaDatabaseFase4(dati) {
  const migr = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(migr, { recursive: true });
  fs.copyFileSync(path.join(MIGRAZIONI, '..', 'utili.js'), path.join(dati, 'src', 'utili.js'));
  for (const f of fs.readdirSync(MIGRAZIONI).filter(x => /^00[1234]-/.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(migr, f));
  const db = new Database(path.join(dati, 'wisper.db'));
  db.migra(migr);
  assert.equal(db.versione(), 4);
  db.db.exec('PRAGMA foreign_keys = OFF');
  db.db.exec('BEGIN');
  db.db.exec(fs.readFileSync(path.join(__dirname, 'migrazione-005', 'fase4.sql'), 'utf8'));
  db.db.exec('COMMIT');
  db.db.exec('PRAGMA foreign_keys = ON');
  fs.mkdirSync(path.join(dati, 'file'), { recursive: true });
  for (const id of Object.keys(FILE)) fs.writeFileSync(path.join(dati, 'file', id), Buffer.from(FILE[id], 'base64'));
  return db;
}

test.before(() => {
  cartella = cartellaNuova('migrazione-005');
  const db = creaDatabaseFase4(cartella);
  tabellePrima = db.righe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map(t => t.name);
  righePrima = {};
  for (const t of tabellePrima) righePrima[t] = db.righe('SELECT * FROM ' + t + ' ORDER BY rowid').map(r => Object.assign({}, r));
  contatoriPrima = {};
  db.righe('SELECT name, seq FROM sqlite_sequence').forEach(s => { contatoriPrima[s.name] = s.seq; });
  db.chiudi();
  w = new Wisper({ dati: cartella });
});
test.after(() => w.chiudi());

/** Ogni campo di prima c'e' con lo stesso valore, anche dentro (i campi nuovi si aggiungono e basta). */
function contiene(nuovo, vecchio, dove) {
  if (Array.isArray(vecchio)) {
    assert.ok(Array.isArray(nuovo), dove);
    assert.equal(nuovo.length, vecchio.length, dove + ' (quanti)');
    vecchio.forEach((v, i) => contiene(nuovo[i], v, dove + '[' + i + ']'));
  } else if (vecchio && typeof vecchio === 'object') {
    assert.ok(nuovo && typeof nuovo === 'object', dove);
    for (const k of Object.keys(vecchio)) contiene(nuovo[k], vecchio[k], dove + ' · ' + k);
  } else if (typeof vecchio === 'string' && vecchio.includes(', già firmato: si cambiano solo')) {
    // 07/11/2026 (niente firma): la frase della spesa bloccata dice "già inviato" invece di "già firmato".
    assert.equal(nuovo, vecchio.replace(', già firmato: si cambiano solo', ', già inviato: si cambiano solo'), dove);
  } else assert.deepEqual(nuovo, vecchio, dove);
}

const comeTitolare = fn => w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, fn);

test('migrazione 005: versione 5, la copia wisper.db.prima-5 com\'era, le tabelle di prima riga per riga uguali', () => {
  // Fase 6: il server apre il database fino alla versione 6 (la 006 parte dopo la 005); la copia della 005 resta.
  assert.equal(w.db.versione(), 11);
  const copia = new Database(path.join(cartella, 'wisper.db.prima-5'));
  assert.equal(copia.versione(), 4, 'la copia e\' com\'era prima');
  copia.chiudi();
  // Il registro no: la migrazione ci scrive cosa ha fatto (e prima del dump era vuoto).
  for (const t of tabellePrima.filter(x => x !== 'registro')) {
    let dopo = w.db.righe('SELECT * FROM ' + t + ' ORDER BY rowid').map(r => Object.assign({}, r));
    // Fase 6: la 006 aggiunge le righe del ruolo esterno e da' al collaboratore l'organico come rubrica (persone 0 -> 1,
    // scritto nel registro); il resto dei permessi resta com'era.
    if (t === 'permessi') {
      // 03/11/2026: la 009 aggiunge il modulo progetti a ogni ruolo.
      dopo = dopo.filter(r => r.ruolo !== 'esterno' && r.modulo !== 'progetti');
      const prima = righePrima.permessi.find(r => r.ruolo === 'collaboratore' && r.modulo === 'persone');
      if (prima) dopo.filter(r => r.ruolo === 'collaboratore' && r.modulo === 'persone').forEach(r => { assert.equal(r.livello, Math.max(prima.livello, 1)); r.livello = prima.livello; });
      // Fase 7: la 007 da' al collaboratore le sue comunicazioni (comunicazioni 0 -> 2, scritto nel registro).
      const com = righePrima.permessi.find(r => r.ruolo === 'collaboratore' && r.modulo === 'comunicazioni');
      if (com) dopo.filter(r => r.ruolo === 'collaboratore' && r.modulo === 'comunicazioni').forEach(r => { assert.equal(r.livello, com.livello === 0 ? 2 : com.livello); r.livello = com.livello; });
    }
    // Impostazioni e numerazioni: la migrazione aggiunge le sue in fondo, quelle di prima restano uguali.
    if (['impostazioni', 'numerazioni'].includes(t)) assert.ok(dopo.length > righePrima[t].length, t);
    else assert.equal(dopo.length, righePrima[t].length, t + ': quante righe');
    dopo.slice(0, righePrima[t].length).forEach((r, i) => {
      for (const c of COLONNE_NUOVE[t] || []) delete r[c];
      assert.deepEqual(r, righePrima[t][i], t + ' riga ' + i);
    });
  }
  // Le colonne nuove partono vuote.
  assert.ok(w.db.righe('SELECT ticket_id FROM rapportini').every(r => r.ticket_id === null));
  assert.ok(w.db.righe('SELECT categoria, ambiente FROM sedi').every(r => r.categoria === '' && r.ambiente === ''));
  // I contatori AUTOINCREMENT delle tabelle rifatte (e di tutte le altre) restano quelli di prima.
  for (const [nome, seq] of Object.entries(contatoriPrima)) assert.equal(w.db.riga('SELECT seq FROM sqlite_sequence WHERE name = ?', nome).seq, seq, nome);
  // I CHECK nuovi: il tipo "intervento", i tipi di file nuovi, la sorgente "ticket"; i vecchi rifiutano ancora le cose sbagliate.
  w.db.esegui("INSERT INTO attivita (titolo, tipo) VALUES ('X', 'intervento')");
  assert.throws(() => w.db.esegui("INSERT INTO attivita (titolo, tipo) VALUES ('X', 'riunione')"), /CHECK/);
  for (const tipo of ['ticket', 'caricato', 'inviato']) w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES (?, ?, 'x')", 'prova-' + tipo, tipo);
  assert.throws(() => w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('prova-boh', 'boh', 'x')"), /CHECK/);
  assert.ok(w.db.riga("SELECT sql FROM sqlite_master WHERE name = 'fattura_sorgenti_una'").sql.includes('WHERE attiva = 1'), 'lo stesso indice unico');
  assert.ok(w.db.riga("SELECT sql FROM sqlite_master WHERE name = 'fattura_sorgenti'").sql.includes("'ticket'"));
  // Le checklist delle attivita' ci sono tutte (DROP TABLE attivita non le ha cancellate).
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM attivita_checklist').n, righePrima.attivita_checklist.length);
  assert.ok(righePrima.attivita_checklist.length > 0);
});

test('i rapportini, i conti e i PDF di oggi sono identici a quelli del server 0.7.0', () => {
  assert.equal(PRIMA.versione, '0.7.0');
  const ora = comeTitolare(() => uscite(w));
  assert.equal(ora.rapportini.length, PRIMA.rapportini.length);
  for (const vecchio of PRIMA.rapportini) {
    const nuovo = ora.rapportini.find(r => r.id === vecchio.id);
    // Tutti i campi di prima, uno per uno (quelli nuovi della fase 5 si aggiungono e basta).
    contiene(nuovo, vecchio, vecchio.id);
    assert.deepEqual([nuovo.idTicket, nuovo.numeroTicket, nuovo.nonSiFattura, nuovo.ticketAperto], [null, '', '', false]);
  }
  assert.deepEqual(Object.keys(ora.pdf).sort(), Object.keys(PRIMA.pdf).sort());
  // 06/11/2026 (il rapportino con piu' lavori, senza firma): il modello del PDF del rapportino e del riepilogo e' cambiato
  // apposta (pc/ui/documenti.js); gli altri PDF restano identici al byte.
  const cambiatiApposta = k => /^(rapportino|riepilogo) /.test(k);
  assert.ok(Object.keys(PRIMA.pdf).some(k => !cambiatiApposta(k)), 'resta qualche PDF da confrontare');
  for (const k of Object.keys(PRIMA.pdf).filter(k => !cambiatiApposta(k))) assert.deepEqual(ora.pdf[k], PRIMA.pdf[k], 'il PDF ' + k);
  // Fase 6 (fase6.md §8.6): il costo della commessa ha tre voci in piu' (collaboratori, collaboratoriPrevisto,
  // altreRicevute) e il totale (costo sostenuto) somma anche le fatture ricevute della commessa senza spesa; le parti di
  // prima restano uguali al centesimo. Il resto dei conti e' identico.
  for (const id of Object.keys(PRIMA.conti.commesse)) {
    const nuovo = ora.conti.commesse[id].costoCommessa;
    const vecchio = PRIMA.conti.commesse[id].costoCommessa;
    assert.equal(nuovo.totale, Math.round((vecchio.totale + nuovo.collaboratori + nuovo.altreRicevute) * 100) / 100, id);
    for (const k of ['collaboratori', 'collaboratoriPrevisto', 'altreRicevute']) delete nuovo[k];
    nuovo.totale = vecchio.totale;
  }
  assert.deepEqual(ora.conti, PRIMA.conti);
});

test('i documenti delle commesse entrano nell\'archivio con gli stessi id; "documenti" di Code.gs risponde uguale; /file da\' gli stessi byte', () => {
  const ora = comeTitolare(() => uscite(w));
  assert.deepEqual(ora.documenti, PRIMA.documenti);
  const vecchi = righePrima.file.filter(f => f.tipo === 'documento' && !f.cestinato);
  assert.equal(vecchi.length, 4);
  for (const f of vecchi) {
    const doc = w.db.riga('SELECT d.*, c.nome categoria FROM documenti d JOIN documento_categorie c ON c.id = d.categoria_id JOIN documento_versioni v ON v.documento_id = d.id WHERE v.file_id = ?', f.id);
    assert.ok(doc, f.nome);
    assert.deepEqual([doc.titolo, doc.categoria, doc.origine, doc.commessa_id, doc.vede], [f.nome.replace(/\.pdf$/, ''), 'Da classificare', 'file', f.commessa_id, 'tutti']);
    assert.equal(doc.cliente_id, w.db.riga('SELECT cliente_id FROM commesse WHERE id = ?', f.commessa_id).cliente_id);
    const v = w.db.riga('SELECT * FROM documento_versioni WHERE id = ?', doc.versione_valida_id);
    assert.deepEqual([v.numero, v.stato, v.file_id, v.sha256], [0, 'approvata', f.id, f.sha256]);
    const riga = w.db.riga('SELECT * FROM file WHERE id = ?', f.id);
    assert.deepEqual([riga.tipo, riga.documento_id, riga.versione_id], ['documento', doc.id, v.id], 'il file resta dov\'era, col suo id');
    assert.deepEqual(fs.readFileSync(w.percorsoFile(riga.percorso)), Buffer.from(FILE[f.id], 'base64'), 'gli stessi byte');
    assert.equal(comeTitolare(() => w.puoLeggereFile(riga)), true);
  }
  // Il documento nel cestino non entra.
  const cestinato = righePrima.file.find(f => f.tipo === 'documento' && f.cestinato);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM documento_versioni WHERE file_id = ?', cestinato.id).n, 0);
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM registro WHERE nota = 'migrazione 005: il documento della commessa entra nell''archivio' AND tabella = 'documenti'").n, 4);
  // Nell'archivio della commessa.
  const archivio = comeTitolare(() => w.leggiDocumenti({ archivio: true, idCommessa: '26ST001' }));
  assert.deepEqual(archivio.documenti.filter(d => d.origine === 'file').map(d => d.titolo).sort(), ['Offerta', 'Schema quadro linea 1']);
});

test('la cartella Drive delle commesse diventa la loro cartella principale; quella che non e\' un indirizzo resta solo nella commessa', () => {
  const cartelle = w.db.righe("SELECT * FROM documenti WHERE origine = 'collegamento' ORDER BY commessa_id");
  assert.deepEqual(cartelle.map(c => [c.commessa_id, c.titolo, c.collegamento_tipo, c.cartella, c.principale, c.url]), [
    ['26ST001', 'Cartella della commessa 26ST001', 'gdrive', 1, 1, 'https://drive.google.com/drive/folders/1CartellaEsempio26ST001'],
    ['26ST002', 'Cartella della commessa 26ST002', 'gdrive', 1, 1, 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123'],
  ]);
  assert.equal(w.db.riga("SELECT cartella FROM commesse WHERE id = '26ST003'").cartella, 'chiedere a Manuel dove sta', 'la colonna resta per le versioni vecchie');
  assert.ok(w.db.riga("SELECT * FROM registro WHERE tabella = 'commesse' AND id_riga = '26ST003' AND nota LIKE 'migrazione 005:%'"));
  assert.equal(w.db.riga("SELECT cartella FROM commesse WHERE id = '26ST001'").cartella, 'https://drive.google.com/drive/folders/1CartellaEsempio26ST001');
});

test('le categorie, i testi dei modelli, le numerazioni e le impostazioni nuove; i file gia\' copiati fuori casa non si rimandano', () => {
  // Fase 6: la 006 aggiunge in fondo le sue 9 categorie; le 16 della 005 restano com'erano, nello stesso ordine.
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM documento_categorie').n, 25);
  const categorie = w.db.righe('SELECT nome, approvazione, vede, scadenza_mesi, sistema FROM documento_categorie ORDER BY ordine').slice(0, 16);
  assert.deepEqual(categorie.filter(c => c.sistema).map(c => c.nome), ['Mandati ai clienti', 'Da classificare', 'Documenti personali']);
  assert.deepEqual(Object.assign({}, categorie.find(c => c.nome === 'Contratti')), { nome: 'Contratti', approvazione: 0, vede: 'costi', scadenza_mesi: null, sistema: 0 });
  // Fase 6: in piu' la lettera d'incarico (LETTERA_INCARICO) della 006.
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM modelli_testi").n, 13);
  const imp = w.leggiImpostazioni();
  assert.deepEqual([imp.FILE_MAX_MB, imp.SPAZIO_AVVISO_MB, imp.SPAZIO_MINIMO_MB, imp.COPIA_FUORI_MAX_MB, imp.EMAIL_ALLEGATI_MAX_MB, imp.COPIA_INVIATI,
    imp.CONDIVISIONE_INDIRIZZO, imp.CONDIVISIONE_GIORNI, imp.PREAVVISO_GIORNI, imp.ANTICIPO_TICKET_GIORNI], [50, 10240, 2048, 25, 15, true, '', 14, 60, 30]);
  assert.deepEqual(imp.TICKET_TEMPI.urgente, { presa: 1, intervento: 4 });
  assert.ok(w.db.riga("SELECT * FROM numerazioni WHERE tipo = 'ticket' AND formato = 'TK/{AAAA}/{NNNN}' AND annuale = 1"));
  assert.ok(w.db.riga("SELECT * FROM numerazioni WHERE tipo = 'contratto' AND formato = 'CA/{AAAA}/{NNN}' AND annuale = 1"));
  // La copia fuori casa: i file di prima dell'ultima copia riuscita hanno fuori_il, quello arrivato dopo no.
  const copia = righePrima.copie.filter(c => /^ok/.test(c.fuori)).pop();
  for (const f of w.db.righe('SELECT * FROM file WHERE percorso IS NOT NULL AND drive_url IS NULL')) {
    const prima = Date.parse(f.creato) <= Date.parse(copia.quando);
    assert.equal(f.fuori_il, prima ? copia.quando : '', f.nome);
  }
  assert.ok(w.fileDaCopiareFuori().some(f => f.nome === 'Arrivato dopo la copia.pdf'));
});

test('riaperto il server: la migrazione non si rifa\'', () => {
  const documenti = w.db.riga('SELECT COUNT(*) n FROM documenti').n;
  w.chiudi();
  w = new Wisper({ dati: cartella });
  assert.equal(w.db.versione(), 11);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM documenti').n, documenti);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM documento_categorie').n, 25);
});
