// Fase 7: la migrazione 007 (portale clienti, WhatsApp e comunicazioni) sul database della fase 6. "Prima" non e'
// ricalcolato da questo codice: e' migrazione-007/prima.json, scritto dal server 0.9.0 sullo stesso database
// (genera-prima.js), con l'orologio fermo alle 10:00 del 22/10/2026 (fermo anche qui).
// Il requisito (fase7.md §5.5): dopo, le azioni di prima rispondono uguali campo per campo (i campi nuovi si aggiungono e
// basta); le comunicazioni nate dai documenti inviati sono una per documento; nessuna pubblicazione esiste; nessun
// referente ha l'accesso; le tabelle rifatte (preventivi, file) hanno tutte le righe di prima; la copia wisper.db.prima-7.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova, COLONNE_007 } = require('./aiuto');
const { Database } = require('../src/db');
const { Wisper } = require('../src/wisper');
const PRIMA = require('./migrazione-007/prima.json');
const FILE = require('./migrazione-007/file.json');

const MIGRAZIONI = path.join(__dirname, '..', 'src', 'migrazioni');
// Le tabelle dove la 007 aggiunge righe sue (in fondo): quelle di prima restano uguali.
const CON_RIGHE_NUOVE = ['impostazioni', 'permessi'];

let cartella;
let w;
let tabellePrima;
let colonnePrima;
let righePrima;
let contatoriPrima;

/** Il database della fase 6: le migrazioni 001-006 (con le loro .js) e poi le righe di fase6.sql, coi file su disco. */
function creaDatabaseFase6(dati) {
  const migr = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(migr, { recursive: true });
  // Le .js delle migrazioni leggono utili.js e (la 005) documenti.js.
  for (const f of ['utili.js', 'documenti.js']) fs.copyFileSync(path.join(MIGRAZIONI, '..', f), path.join(dati, 'src', f));
  for (const f of fs.readdirSync(MIGRAZIONI).filter(x => /^00[1-6]-/.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(migr, f));
  const db = new Database(path.join(dati, 'wisper.db'));
  db.migra(migr);
  assert.equal(db.versione(), 6);
  db.db.exec('PRAGMA foreign_keys = OFF');
  db.db.exec('BEGIN');
  db.db.exec(fs.readFileSync(path.join(__dirname, 'migrazione-007', 'fase6.sql'), 'utf8'));
  db.db.exec('COMMIT');
  db.db.exec('PRAGMA foreign_keys = ON');
  fs.mkdirSync(path.join(dati, 'file'), { recursive: true });
  for (const id of Object.keys(FILE)) fs.writeFileSync(path.join(dati, 'file', id), Buffer.from(FILE[id], 'base64'));
  return db;
}

test.before(() => {
  require('../src/utili').spegniOrologioDiProva();
  test.mock.timers.enable({ apis: ['Date'], now: PRIMA.ora });
  cartella = cartellaNuova('migrazione-007');
  const db = creaDatabaseFase6(cartella);
  tabellePrima = db.righe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map(t => t.name);
  righePrima = {};
  colonnePrima = {};
  for (const t of tabellePrima) {
    righePrima[t] = db.righe('SELECT * FROM ' + t + ' ORDER BY rowid').map(r => Object.assign({}, r));
    colonnePrima[t] = db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
  }
  contatoriPrima = {};
  db.righe('SELECT name, seq FROM sqlite_sequence').forEach(s => { contatoriPrima[s.name] = s.seq; });
  db.chiudi();
  w = new Wisper({ dati: cartella });
});
test.after(() => {
  w.chiudi();
  test.mock.timers.reset();
});

/** Ogni campo di prima c'e' con lo stesso valore, anche dentro (i campi nuovi si aggiungono e basta). */
function contiene(nuovo, vecchio, dove) {
  if (Array.isArray(vecchio)) {
    assert.ok(Array.isArray(nuovo), dove);
    assert.equal(nuovo.length, vecchio.length, dove + ' (quanti)');
    vecchio.forEach((v, i) => contiene(nuovo[i], v, dove + '[' + i + ']'));
  } else if (vecchio && typeof vecchio === 'object') {
    assert.ok(nuovo && typeof nuovo === 'object', dove);
    for (const k of Object.keys(vecchio)) contiene(nuovo[k], vecchio[k], dove + ' · ' + k);
  } else assert.deepEqual(nuovo, vecchio, dove);
}

const comeTitolare = fn => w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, fn);

test('migrazione 007: versione 7, la copia wisper.db.prima-7 com\'era; le tabelle di prima riga per riga uguali (le colonne nuove col valore di base)', () => {
  assert.equal(PRIMA.versione, '0.9.0');
  assert.equal(w.db.versione(), 7);
  const copia = new Database(path.join(cartella, 'wisper.db.prima-7'));
  assert.equal(copia.versione(), 6, 'la copia e\' com\'era prima');
  copia.chiudi();
  for (const t of tabellePrima.filter(x => x !== 'registro')) {
    const colonneDopo = w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
    for (const c of colonnePrima[t]) assert.ok(colonneDopo.includes(c), t + ': la colonna ' + c + ' c\'e\' ancora');
    const nuove = colonneDopo.filter(c => !colonnePrima[t].includes(c));
    let dopo = w.db.righe('SELECT * FROM ' + t + ' ORDER BY rowid').map(r => Object.assign({}, r));
    if (t === 'permessi') {
      // Il collaboratore scrive le sue comunicazioni (comunicazioni 0 -> 2, nel registro); il resto com'era.
      const d = dopo.find(r => r.ruolo === 'collaboratore' && r.modulo === 'comunicazioni');
      assert.equal(d.livello, 2);
      d.livello = righePrima.permessi.find(r => r.ruolo === 'collaboratore' && r.modulo === 'comunicazioni').livello;
      assert.ok(w.db.riga("SELECT id FROM registro WHERE tabella = 'permessi' AND id_riga = 'collaboratore.comunicazioni'"));
    }
    if (CON_RIGHE_NUOVE.includes(t)) assert.ok(dopo.length >= righePrima[t].length, t);
    else assert.equal(dopo.length, righePrima[t].length, t + ': quante righe');
    if (t === 'preventivi' || t === 'file') dopo.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const prima = t === 'preventivi' || t === 'file'
      ? righePrima[t].slice().sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)) : righePrima[t];
    dopo.slice(0, prima.length).forEach((r, i) => {
      for (const c of nuove) {
        assert.ok(COLONNE_007[t] && c in COLONNE_007[t], t + ': colonna nuova non prevista ' + c);
        assert.deepEqual(r[c], COLONNE_007[t][c], t + ' riga ' + i + ': ' + c);
        delete r[c];
      }
      assert.deepEqual(r, prima[i], t + ' riga ' + i);
    });
  }
  // I contatori AUTOINCREMENT di tutte le tabelle restano quelli di prima.
  for (const [nome, seq] of Object.entries(contatoriPrima)) {
    const ora = w.db.riga('SELECT seq FROM sqlite_sequence WHERE name = ?', nome).seq;
    if (nome === 'registro') assert.ok(ora >= seq, nome);
    else assert.equal(ora, seq, nome);
  }
  // Le chiavi esterne dopo le tabelle rifatte: nessuna voce o scadenza senza il suo preventivo.
  assert.deepEqual(w.db.righe('PRAGMA foreign_key_check'), []);
});

test('nessun portale acceso, nessun accesso, nessuna pubblicazione, nessun si\' a WhatsApp; le tabelle nuove vuote', () => {
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM soggetti WHERE portale <> 0').n, 0);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM referenti WHERE portale <> 0 OR whatsapp_ok <> 0 OR pagamenti <> 0').n, 0);
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM attivita WHERE avvisa_cliente <> ''").n, 0);
  for (const t of ['portale_link', 'portale_sessioni', 'portale_accessi', 'portale_tentativi', 'portale_pubblicazioni', 'portale_caricamenti',
    'portale_da_guardare', 'notifiche']) {
    assert.equal(w.db.riga('SELECT COUNT(*) n FROM ' + t).n, 0, t + ': vuota');
  }
  const imp = w.leggiImpostazioni();
  assert.deepEqual([imp.PORTALE_ATTIVO, imp.PORTALE_INDIRIZZO, imp.PORTALE_LINK_MINUTI, imp.PORTALE_EMAIL_MAX_GIORNO, imp.WHATSAPP_APP, imp.WHATSAPP_TESTO_MAX],
    [false, '', 10, 40, 'chiedi', 1000]);
  assert.deepEqual(imp.PORTALE_TIPI_FILE, ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx']);
  assert.equal(imp.PORTALE_INGRESSO, undefined, 'PORTALE_INGRESSO non esiste (strada Google, §0.6)');
  assert.ok(String(imp.PORTALE_INFORMATIVA).indexOf('Google') > 0 && String(imp.PORTALE_INFORMATIVA).indexOf('Tailscale') < 0);
  // Nessun segreto nel database: niente csrf_hash nelle tabelle del portale.
  for (const t of ['portale_link', 'portale_sessioni']) {
    assert.ok(!w.db.righe('PRAGMA table_info(' + t + ')').some(c => c.name === 'csrf_hash'), t + ': niente csrf_hash');
  }
});

test('lo storico parte dalle copie dei PDF mandati: una comunicazione per documento "inviato", con indirizzo, cliente e commessa', () => {
  assert.ok(PRIMA.inviati.length >= 3);
  const righe = w.db.righe('SELECT * FROM comunicazioni ORDER BY id');
  assert.equal(righe.length, PRIMA.inviati.length);
  for (const d of PRIMA.inviati) {
    const c = righe.filter(x => x.documento_id === d.id);
    assert.equal(c.length, 1, 'documento ' + d.id);
    const m = d.nota.match(/^mandato a (.+?) il /);
    assert.deepEqual([c[0].canale, c[0].direzione, c[0].stato, c[0].a, c[0].cliente_id, c[0].commessa_id, c[0].ticket_id],
      ['email', 'uscita', 'mandato', m[1], d.cliente_id, d.commessa_id, d.ticket_id], 'documento ' + d.id);
    assert.ok(c[0].quando && c[0].mandato_il);
  }
  // E si legge con l'azione delle comunicazioni (per cliente).
  const r = comeTitolare(() => w.leggiComunicazioni({ idCliente: 'C002' }));
  assert.equal(r.comunicazioni.length, PRIMA.inviati.filter(d => d.cliente_id === 'C002').length);
  assert.ok(r.comunicazioni.every(c => c.canale === 'email' && c.statoVisto === 'Mandato'));
});

test('i modelli dei messaggi di §9.2 coi testi esatti', () => {
  const m = w.db.righe('SELECT * FROM modelli_messaggi ORDER BY ordine');
  assert.deepEqual(m.map(x => x.chiave), ['promemoria_appuntamento', 'intervento_fissato', 'preventivo_mandato', 'rapportino_da_firmare',
    'promemoria_pagamento', 'secondo_promemoria_pagamento', 'invito_portale', 'libero']);
  assert.ok(m.every(x => x.sistema === 1 && x.attivo === 1));
  assert.equal(m[0].testo, 'Buongiorno {nome}, le ricordo l\'appuntamento di {giorno} alle {ora} presso {luogo}: {cosa}. Se non va più bene mi scriva pure. {mittente}');
  assert.equal(m[6].canale, 'whatsapp');
});

test('le azioni di prima rispondono uguali campo per campo: rapportini, preventivi, ticket, fatture, documenti, attivita\', anagrafiche, Dashboard', () => {
  const ora = comeTitolare(() => ({
    rapportini: w.leggiRapportini('', '', true),
    preventivi: w.db.righe('SELECT id FROM preventivi ORDER BY id').map(p => w.preventivoCompleto(p.id)),
    ticket: w.db.righe('SELECT id FROM ticket ORDER BY id').map(t => w.ticketCompleto(w.rigaTicket(t.id))),
    fatture: w.db.righe('SELECT id FROM fatture ORDER BY id').map(f => w.fatturaCompleta(w.rigaFattura(f.id))),
    documenti: w.db.righe('SELECT id FROM documenti ORDER BY id').map(d => w.documentoCompleto(w.rigaDocumento(d.id))),
    attivita: w.leggiAttivita({}),
    anagrafiche: w.rispostaAnagrafiche({}),
    dashboard: w.dashboard({}).numeri,
  }));
  assert.equal(ora.rapportini.length, PRIMA.rapportini.length);
  for (const vecchio of PRIMA.rapportini) contiene(ora.rapportini.find(r => r.id === vecchio.id), vecchio, vecchio.id);
  contiene(ora.preventivi, PRIMA.preventivi, 'preventivi');
  contiene(ora.ticket, PRIMA.ticket, 'ticket');
  contiene(ora.fatture, PRIMA.fatture, 'fatture');
  // La cronologia dei documenti viene dal registro, che fase6.sql non porta (come le altre prove delle migrazioni).
  contiene(ora.documenti, PRIMA.documenti.map(d => { const x = Object.assign({}, d); delete x.cronologia; return x; }), 'documenti');
  contiene(ora.attivita, PRIMA.attivita, 'attivita');
  const anag = Object.assign({}, PRIMA.anagrafiche);
  // Le impostazioni crescono (le nuove della 007): quelle di prima restano uguali.
  contiene(ora.anagrafiche, anag, 'anagrafiche');
  // I numeri della Dashboard: quelli di prima uguali (si aggiungono i numeri del portale e delle comunicazioni).
  // (Lo spazio sul disco dipende dal computer delle prove: non si confronta.)
  const dash = Object.assign({}, PRIMA.dashboard);
  delete dash.spazio;
  contiene(ora.dashboard, dash, 'dashboard');
  // I campi nuovi, vuoti: nessun cliente col portale, nessun referente con l'accesso.
  assert.ok(ora.anagrafiche.clienti.every(c => c.portale === false));
  assert.ok(ora.anagrafiche.referenti.every(r => r.portale === false && r.whatsappOk === false && r.pagamenti === false));
});

test('i CHECK nuovi: accettazione nel portale, file dal portale; i vecchi rifiutano ancora le cose sbagliate; il registro degli accessi non si cancella', () => {
  const p = w.db.riga("SELECT id FROM preventivi WHERE stato = 'INVIATO' LIMIT 1");
  w.db.esegui("UPDATE preventivi SET accettazione_modo = 'portale' WHERE id = ?", p.id);
  assert.throws(() => w.db.esegui("UPDATE preventivi SET accettazione_modo = 'piccione' WHERE id = ?", p.id), /CHECK/);
  w.db.esegui("UPDATE preventivi SET accettazione_modo = '' WHERE id = ?", p.id);
  w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('prova-portale', 'portale', 'x')");
  assert.throws(() => w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('prova-boh', 'boh', 'x')"), /CHECK/);
  w.db.esegui('DELETE FROM file WHERE id = ?', 'prova-portale');
  w.db.esegui("INSERT INTO portale_accessi (quando, azione) VALUES ('2026-10-22T10:00:00+02:00', 'entrato')");
  assert.throws(() => w.db.esegui('DELETE FROM portale_accessi'), /non si cancella/);
  assert.throws(() => w.db.esegui("UPDATE portale_accessi SET azione = 'uscito'"), /non si modifica/);
  // Due referenti della stessa azienda col portale acceso e la stessa email: no.
  const due = w.db.righe("SELECT id FROM referenti WHERE soggetto_id = 'C002' ORDER BY id LIMIT 2");
  w.db.esegui("UPDATE referenti SET email = 'stessa@esempio.it', portale = 1 WHERE id = ?", due[0].id);
  assert.throws(() => w.db.esegui("UPDATE referenti SET email = 'Stessa@esempio.it', portale = 1 WHERE id = ?", due[1].id), /UNIQUE/);
});

test('riaperto il server: la migrazione non si rifa\'', () => {
  const n = w.db.riga('SELECT COUNT(*) n FROM comunicazioni').n;
  w.chiudi();
  w = new Wisper({ dati: cartella });
  assert.equal(w.db.versione(), 7);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM comunicazioni').n, n);
});
