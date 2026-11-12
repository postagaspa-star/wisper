// Fase 8: la migrazione 008 (integrazioni, amministrazione completa, controlli finali) sul database della fase 7. "Prima"
// non e' ricalcolato da questo codice: e' migrazione-008/prima.json, scritto dal server 0.10.0 sullo stesso database
// (genera-prima.js), con l'orologio fermo alle 10:00 del 22/10/2026 (fermo anche qui).
// Il requisito (fase8.md §12.5): dopo, le azioni di prima rispondono uguali campo per campo (i campi nuovi si aggiungono
// e basta), i dati dei PDF uguali (il pacchetto delle fatture per il programma), la Dashboard con le stesse voci meno i
// doppioni di §8.1, elencati qui uno per uno; le tabelle rifatte (file) hanno tutte le righe di prima; la copia
// wisper.db.prima-8; integrazioni Da configurare, lista di controllo Da fare, i file dei documenti Da leggere.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova, COLONNE_008: SOLO_008, COLONNE_009, COLONNE_011, COLONNE_014, valoreAtteso, numeriDashboardDopoLavori, numeriDashboardSenzaOre } = require('./aiuto');

// 03/11/2026: la prova arriva fino all'ultima migrazione: anche le colonne della 009 (i progetti) partono col valore di base.
const COLONNE_008 = {};
for (const g of [SOLO_008, COLONNE_009, COLONNE_011, COLONNE_014]) for (const [t, c] of Object.entries(g)) COLONNE_008[t] = Object.assign({}, COLONNE_008[t] || {}, c);
const { Database } = require('../src/db');
const { Wisper } = require('../src/wisper');
const PRIMA = require('./migrazione-008/prima.json');
const FILE = require('./migrazione-008/file.json');
const M8 = require('../src/migrazioni/008-integrazioni-controlli');

const MIGRAZIONI = path.join(__dirname, '..', 'src', 'migrazioni');
// Le tabelle dove la 008 aggiunge righe sue (in fondo): quelle di prima restano uguali.
const CON_RIGHE_NUOVE = ['impostazioni'];

let cartella;
let w;
let tabellePrima;
let colonnePrima;
let righePrima;
let contatoriPrima;

/** Il database della fase 7: le migrazioni 001-007 (con le loro .js) e poi le righe di fase7.sql, coi file su disco. */
function creaDatabaseFase7(dati) {
  const migr = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(migr, { recursive: true });
  for (const f of ['utili.js', 'documenti.js']) fs.copyFileSync(path.join(MIGRAZIONI, '..', f), path.join(dati, 'src', f));
  for (const f of fs.readdirSync(MIGRAZIONI).filter(x => /^00[1-7]-/.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(migr, f));
  const db = new Database(path.join(dati, 'wisper.db'));
  db.migra(migr);
  assert.equal(db.versione(), 7);
  db.db.exec('PRAGMA foreign_keys = OFF');
  db.db.exec('BEGIN');
  db.db.exec(fs.readFileSync(path.join(__dirname, 'migrazione-008', 'fase7.sql'), 'utf8'));
  db.db.exec('COMMIT');
  db.db.exec('PRAGMA foreign_keys = ON');
  fs.mkdirSync(path.join(dati, 'file'), { recursive: true });
  for (const id of Object.keys(FILE)) fs.writeFileSync(path.join(dati, 'file', id), Buffer.from(FILE[id], 'base64'));
  return db;
}

test.before(() => {
  require('../src/utili').spegniOrologioDiProva();
  test.mock.timers.enable({ apis: ['Date'], now: PRIMA.ora });
  cartella = cartellaNuova('migrazione-008');
  const db = creaDatabaseFase7(cartella);
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
  } else if (typeof vecchio === 'string' && vecchio.includes(', già firmato: si cambiano solo')) {
    // 07/11/2026 (niente firma): la frase della spesa bloccata dice "già inviato" invece di "già firmato".
    assert.equal(nuovo, vecchio.replace(', già firmato: si cambiano solo', ', già inviato: si cambiano solo'), dove);
  } else assert.deepEqual(nuovo, vecchio, dove);
}

const comeTitolare = fn => w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, fn);

test('migrazione 008: versione 8, la copia wisper.db.prima-8 com\'era; le tabelle di prima riga per riga uguali (le colonne nuove col valore di base)', () => {
  assert.equal(PRIMA.versione, '0.10.0');
  assert.equal(w.db.versione(), 14);
  const copia = new Database(path.join(cartella, 'wisper.db.prima-8'));
  assert.equal(copia.versione(), 7, 'la copia e\' com\'era prima');
  copia.chiudi();
  for (const t of tabellePrima.filter(x => x !== 'registro')) {
    const colonneDopo = w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
    for (const c of colonnePrima[t]) assert.ok(colonneDopo.includes(c), t + ': la colonna ' + c + ' c\'e\' ancora');
    const nuove = colonneDopo.filter(c => !colonnePrima[t].includes(c));
    let dopo = w.db.righe('SELECT * FROM ' + t + ' ORDER BY rowid').map(r => Object.assign({}, r));
    // 03/11/2026: la 009 aggiunge il modulo progetti a ogni ruolo.
    if (t === 'permessi') dopo = dopo.filter(r => r.modulo !== 'progetti');
    if (CON_RIGHE_NUOVE.includes(t)) assert.ok(dopo.length >= righePrima[t].length, t);
    else assert.equal(dopo.length, righePrima[t].length, t + ': quante righe');
    const ordina = l => l.slice().sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const [d2, p2] = t === 'file' ? [ordina(dopo), ordina(righePrima[t])] : [dopo, righePrima[t]];
    d2.slice(0, p2.length).forEach((r, i) => {
      for (const c of nuove) {
        assert.ok(COLONNE_008[t] && c in COLONNE_008[t], t + ': colonna nuova non prevista ' + c);
        assert.deepEqual(r[c], valoreAtteso(COLONNE_008[t][c], r, p2), t + ' riga ' + i + ': ' + c);
        delete r[c];
      }
      assert.deepEqual(r, p2[i], t + ' riga ' + i);
    });
  }
  // I contatori AUTOINCREMENT di tutte le tabelle restano quelli di prima.
  for (const [nome, seq] of Object.entries(contatoriPrima)) {
    const ora = w.db.riga('SELECT seq FROM sqlite_sequence WHERE name = ?', nome).seq;
    if (nome === 'registro') assert.ok(ora >= seq, nome);
    else assert.equal(ora, seq, nome);
  }
  assert.deepEqual(w.db.righe('PRAGMA foreign_key_check'), []);
  for (const t of ['integrazioni', 'integrazioni_controlli', 'calendario_feed', 'file_lettura', 'esportazioni', 'importazioni', 'dashboard_nascoste', 'copie_prove', 'controlli_finali']) {
    assert.ok(w.db.riga('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?', t), 'tabella nuova ' + t);
  }
  assert.ok(w.db.riga("SELECT name FROM sqlite_master WHERE name = 'file_testo'"), 'la tabella FTS5 della ricerca');
});

test('impostazioni nuove coi valori iniziali; integrazioni Da configurare; la lista di controllo Da fare (M15.2 in attesa); nel registro', () => {
  const imp = w.leggiImpostazioni();
  assert.deepEqual([imp.STUDIO_LOGO, imp.STUDIO_NOME_BREVE, imp.STUDIO_SITO, imp.PDF_LOGO, imp.PDF_PIEDE, imp.MODULI_SPENTI, imp.NOTIFICHE_ORA, imp.SESSIONE_GIORNI,
    imp.COPIA_CIFRATA, imp.PROVA_COPIA_GIORNI, imp.PROVA_RIPRISTINO_GIORNI, imp.ESPORTAZIONI_GIORNI, imp.CALENDARIO_GIORNI_PRIMA, imp.CALENDARIO_MESI_DOPO,
    imp.CALENDARIO_PUBBLICO, imp.RICERCA_FILE, imp.RICERCA_FILE_MAX_MB, imp.CAMBIO],
  ['', '', '', true, '', [], '08:00', 180, false, 30, 90, 7, 30, 12, false, true, 20, { stato: 'prima' }]);
  const integ = w.db.righe('SELECT * FROM integrazioni ORDER BY chiave');
  assert.deepEqual(integ.map(r => r.chiave).sort(), M8.CON_CONTROLLO.slice().sort());
  assert.ok(integ.every(r => r.stato === 'da_configurare' && r.errori_di_fila === 0 && r.riuscito_il === ''));
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM registro WHERE tabella = 'integrazioni' AND azione = 'migrazione' AND utente = 'sistema'").n, M8.CON_CONTROLLO.length);
  const righe = w.db.righe('SELECT * FROM controlli_finali ORDER BY ordine');
  assert.equal(righe.length, M8.RIGHE_CONTROLLI.length);
  assert.ok(righe.length >= 70);
  assert.deepEqual(righe.filter(r => r.stato !== 'da_fare').map(r => [r.chiave, r.stato]), [['M15.2', 'attesa']]);
  assert.ok(righe.every(r => ['automatica', 'server', 'a_mano', 'prova_generale'].includes(r.tipo)));
  // Le righe di §11.2 e §11.3 e il gruppo Il cambio.
  for (const k of ['M01.1', 'M01.2', 'M11.1', 'M17.1', 'M18.3', 'T01', 'T15', 'C01', 'G10', 'E15', 'R01']) assert.ok(righe.some(r => r.chiave === k), k);
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM registro WHERE tabella = 'controlli_finali' AND azione = 'migrazione'").n, righe.length);
  // Nessuna password iniziale: non si sa chi l'ha cambiata.
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM utenti WHERE password_iniziale <> 0').n, 0);
});

test('i file dei documenti di prima sono Da leggere; non quelli delle persone, non i riservati, non le revisioni tolte', () => {
  const attesi = w.db.righe('SELECT DISTINCT v.file_id FROM documento_versioni v JOIN documenti d ON d.id = v.documento_id ' +
    "WHERE v.file_id IS NOT NULL AND v.tolta IS NULL AND d.persona_id IS NULL AND d.vede <> 'riservati' ORDER BY v.file_id").map(r => r.file_id);
  const letti = w.db.righe('SELECT * FROM file_lettura ORDER BY file_id');
  assert.ok(attesi.length >= 5);
  assert.deepEqual(letti.map(r => r.file_id), attesi);
  assert.ok(letti.every(r => r.stato === 'da_leggere'));
  for (const id of PRIMA.documentiPersona) assert.ok(!letti.some(r => r.file_id === id), 'documento di una persona o riservato: ' + id);
  assert.ok(PRIMA.documentiPersona.length >= 1, 'nei dati della fase 7 ci sono documenti delle persone');
});

test('le azioni di prima rispondono uguali campo per campo, coi dati dei PDF delle fatture (il pacchetto per il programma)', () => {
  const ora = comeTitolare(() => ({
    rapportini: w.leggiRapportini('', '', true).sort((a, b) => (a.id < b.id ? -1 : 1)),
    preventivi: w.db.righe('SELECT id FROM preventivi ORDER BY id').map(p => w.preventivoCompleto(p.id)),
    ticket: w.db.righe('SELECT id FROM ticket ORDER BY id').map(t => w.ticketCompleto(w.rigaTicket(t.id))),
    fatture: w.db.righe('SELECT id FROM fatture ORDER BY id').map(f => w.fatturaCompleta(w.rigaFattura(f.id))),
    pacchetti: w.db.righe("SELECT id FROM fatture WHERE tipo = 'fattura' ORDER BY id").map(f => { try { return { id: f.id, pacchetto: w.pacchetto({ id: f.id }) }; } catch (e) { return { id: f.id, errore: e.message }; } }),
    documenti: w.db.righe('SELECT id FROM documenti ORDER BY id').map(d => w.documentoCompleto(w.rigaDocumento(d.id))),
    attivita: w.leggiAttivita({}),
    anagrafiche: w.rispostaAnagrafiche({}),
    comunicazioni: w.leggiComunicazioni({}),
    dashboard: w.dashboard({ tutto: true }),
  }));
  contiene(ora.rapportini, PRIMA.rapportini, 'rapportini');
  contiene(ora.preventivi, PRIMA.preventivi, 'preventivi');
  contiene(ora.ticket, PRIMA.ticket, 'ticket');
  contiene(ora.fatture, PRIMA.fatture, 'fatture');
  contiene(ora.pacchetti, PRIMA.pacchetti, 'pacchetti delle fatture');
  // La cronologia dei documenti viene dal registro, che fase7.sql non porta (come le altre prove delle migrazioni).
  contiene(ora.documenti, PRIMA.documenti.map(d => { const x = Object.assign({}, d); delete x.cronologia; return x; }), 'documenti');
  contiene(ora.attivita, PRIMA.attivita, 'attivita');
  contiene(ora.anagrafiche, PRIMA.anagrafiche, 'anagrafiche');
  contiene(ora.comunicazioni, PRIMA.comunicazioni, 'comunicazioni');
  // 06/11/2026: coi soli cambi voluti del rapportino senza firma (le bozze Da inviare e da fatturare: aiuto.js).
  // 07/11/2026: e coi soli cambi voluti delle Ore tolte (le ore registrate non sono piu' da approvare: aiuto.js).
  const numeri = comeTitolare(() => numeriDashboardSenzaOre(numeriDashboardDopoLavori(PRIMA.dashboard.numeri, w), w));
  delete numeri.spazio;
  contiene(ora.dashboard.numeri, numeri, 'numeri della Dashboard');
  // I campi nuovi: la riga calma della lettura del file (da leggere) nella pagina del documento.
  assert.ok(ora.documenti.some(d => d.lettura && d.lettura.stato === 'da_leggere'));
});

test('la Dashboard: le stesse voci di prima, meno i doppioni di §8.1 elencati uno per uno (la voce che resta porta la coda dell\'altra)', () => {
  const d = comeTitolare(() => w.dashboard({ tutto: true }));
  const tutte = [].concat(d.urgenti, d.settimana, d.pianificare);
  const prima = [].concat(PRIMA.dashboard.urgenti, PRIMA.dashboard.settimana, PRIMA.dashboard.pianificare);
  // 06/11/2026 (il rapportino con piu' lavori, senza firma): spariscono apposta le voci della firma ("da far firmare",
  // "firmati da mandare"); al loro posto una voce sola, "N lavori da inviare da più di una settimana" (bozze e firmati).
  const DELLA_FIRMA = /^\d+ rapportin[oi] (da far firmare|firmat[oi] da mandare)/;
  assert.ok(prima.filter(v => DELLA_FIRMA.test(v.titolo)).length >= 2, 'nei dati della fase 7 c\'erano le voci della firma');
  assert.ok(!tutte.some(v => /firm/.test(v.titolo)), 'nessuna voce parla piu\' di firma');
  const daInviare = tutte.find(v => /^\d+ lavor[oi] da inviare da più di una settimana$/.test(v.titolo));
  assert.ok(daInviare, 'la voce nuova dei lavori da inviare');
  assert.deepEqual(daInviare.collegamento, { pagina: 'rapportini', filtro: { quali: 'inviare', a: '2026-10-15' } });
  assert.ok(daInviare.quanto >= prima.find(v => /da far firmare da più di una settimana/.test(v.titolo)).quanto);
  // 07/11/2026 (Ore tolte): le ore registrate non sono piu' fra le cose da approvare. La voce di Marco resta, col numero
  // nuovo (quello di numeri.approvare, controllato con le righe del database nella prova sopra) e senza "Ore" davanti.
  const approvarePrima = prima.find(v => v.tipo === 'approvare');
  const approvareOra = tutte.find(v => v.tipo === 'approvare');
  assert.match(approvarePrima.dettaglio, /^Ore, /, 'nei dati della fase 7 c\'erano ore da approvare');
  assert.ok(approvareOra, 'la voce delle cose da approvare');
  assert.equal(approvareOra.titolo, approvarePrima.titolo.replace(/^\d+ cose/, d.numeri.approvare.voci + ' cose'));
  assert.equal(approvareOra.quanto, d.numeri.approvare.voci);
  assert.ok(approvareOra.quanto < approvarePrima.quanto);
  assert.equal(approvareOra.dettaglio.split(' · ')[0], approvarePrima.dettaglio.split(' · ')[0].replace(/^Ore, (.)/, (x, c) => c.toUpperCase()));
  assert.deepEqual(approvareOra.collegamento, approvarePrima.collegamento);
  const sparite = prima.filter(v => !DELLA_FIRMA.test(v.titolo) && v !== approvarePrima)
    .filter(v => !tutte.some(x => x.titolo === v.titolo || (v.tipo === 'spazio' && x.tipo === 'sistema' && x.titolo === v.titolo)));
  // I doppioni di §8.1 nei dati della fase 7: [titolo della voce che sparisce, oggetto della voce che resta, coda].
  const doppioni = sparite.map(v => {
    const oggetto = v.collegamento && v.collegamento.id !== undefined ? ({ ticket: 'ticket', preventivo: 'preventivo', rapportino: 'rapportino' }[v.collegamento.pagina] || '') + ':' + v.collegamento.id : '';
    const resta = tutte.find(x => x.oggetto === oggetto || (Array.isArray(x.oggetti) && x.oggetti.includes(oggetto)) || (v.tipo === 'pagamento' && x.tipo === 'fattura' && x.titolo.indexOf('Fattura ' + /fattura (\S+)$/.exec(v.titolo)[1] + ' ') === 0));
    return { titolo: v.titolo, tipo: v.tipo, resta: resta ? resta.titolo : null, dettaglio: resta ? resta.dettaglio : '' };
  });
  // Ognuna e' un doppione vero: della fase 7 (portale o promemoria) assorbito da una voce di prima della stessa cosa.
  for (const x of doppioni) {
    assert.ok(['portale', 'pagamento'].includes(x.tipo), 'sparita una voce che non e\' un doppione: ' + x.titolo);
    assert.ok(x.resta, 'la voce che resta per ' + x.titolo);
    assert.match(x.dettaglio, / · (dal portale|da firmare nel portale|accettato nel portale|promemoria pronto)/, x.titolo);
  }
  // I doppioni attesi, uno per uno, coi dati della fase 7 alle 10:00 del 22/10 (gli altri di §8.1, accettato nel portale e
  // fallo firmare nel portale, in questi dati non ci sono: li provano portale.test.js e dashboard8.test.js).
  assert.deepEqual(doppioni.map(x => [x.titolo, x.resta, x.dettaglio.split(' · ').pop()]).sort(), [
    ['Domanda sul preventivo PR/2026/014', 'PR/2026/014 scade fra 6 giorni', 'dal portale'],
    ['Promemoria di pagamento da preparare: fattura 39/2026', 'Fattura 39/2026 scaduta da 12 giorni', 'promemoria pronto'],
  ]);
  // Nessun oggetto in due voci.
  const oggetti = tutte.map(v => v.oggetto);
  assert.equal(new Set(oggetti).size, oggetti.length);
});

test('i CHECK nuovi: il file "logo"; i vecchi rifiutano ancora le cose sbagliate', () => {
  w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('prova-logo', 'logo', 'x')");
  assert.throws(() => w.db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('prova-boh', 'boh', 'x')"), /CHECK/);
  w.db.esegui('DELETE FROM file WHERE id = ?', 'prova-logo');
  assert.throws(() => w.db.esegui("INSERT INTO integrazioni (chiave, stato) VALUES ('x', 'verde')"), /CHECK/);
  assert.throws(() => w.db.esegui("INSERT INTO controlli_finali (chiave, gruppo, ordine, testo, tipo, stato) VALUES ('X1', 'g', 1, 't', 'automatica', 'boh')"), /CHECK/);
});

test('riaperto il server: la migrazione non si rifa\'', () => {
  const n = w.db.riga('SELECT COUNT(*) n FROM controlli_finali').n;
  const r = w.db.riga('SELECT COUNT(*) n FROM registro').n;
  w.chiudi();
  w = new Wisper({ dati: cartella });
  assert.equal(w.db.versione(), 14);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM controlli_finali').n, n);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM registro').n, r);
});
