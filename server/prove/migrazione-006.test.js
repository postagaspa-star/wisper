// Fase 6: la migrazione 006 (persone, mezzi, collaboratori) sul database della fase 5. "Prima" non e' ricalcolato da
// questo codice: e' migrazione-006/prima.json, scritto dal server 0.8.0 sullo stesso database (genera-prima.js), con
// l'orologio fermo alle 10:00 del 22/10/2026 (fermo anche qui, cosi' i conti di oggi si confrontano in qualunque giorno).
// Il requisito (fase6.md §4.6): la migrazione non scrive costi; rapportini, ore e trasferte identici campo per campo; le
// parti del costo della commessa e i soldi della Dashboard uguali al centesimo; i veicoli restano "auto di una persona";
// una persona per ogni utente; un rapportino nuovo di Manuel prende lo stesso costo orario di prima; la copia
// wisper.db.prima-6.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova, COLONNE_DOPO_007: COLONNE_007, valoreAtteso, numeriDashboardDopoLavori } = require('./aiuto');
const { Database } = require('../src/db');
const { Wisper } = require('../src/wisper');
const PRIMA = require('./migrazione-006/prima.json');
const FILE = require('./migrazione-006/file.json');

const MIGRAZIONI = path.join(__dirname, '..', 'src', 'migrazioni');
// Le tabelle dove la 006 aggiunge righe sue (in fondo): quelle di prima restano uguali.
const CON_RIGHE_NUOVE = ['impostazioni', 'numerazioni', 'documento_categorie', 'modelli_testi', 'permessi'];

let cartella;
let w;
let tabellePrima;
let colonnePrima;
let righePrima;
let contatoriPrima;

/** Il database della fase 5: le migrazioni 001-005 (con le loro .js) e poi le righe di fase5.sql, coi file su disco. */
function creaDatabaseFase5(dati) {
  const migr = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(migr, { recursive: true });
  // Le .js delle migrazioni leggono utili.js e (la 005) documenti.js.
  for (const f of ['utili.js', 'documenti.js']) fs.copyFileSync(path.join(MIGRAZIONI, '..', f), path.join(dati, 'src', f));
  for (const f of fs.readdirSync(MIGRAZIONI).filter(x => /^00[1-5]-/.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(migr, f));
  const db = new Database(path.join(dati, 'wisper.db'));
  db.migra(migr);
  assert.equal(db.versione(), 5);
  db.db.exec('PRAGMA foreign_keys = OFF');
  db.db.exec('BEGIN');
  db.db.exec(fs.readFileSync(path.join(__dirname, 'migrazione-006', 'fase5.sql'), 'utf8'));
  db.db.exec('COMMIT');
  db.db.exec('PRAGMA foreign_keys = ON');
  fs.mkdirSync(path.join(dati, 'file'), { recursive: true });
  for (const id of Object.keys(FILE)) fs.writeFileSync(path.join(dati, 'file', id), Buffer.from(FILE[id], 'base64'));
  return db;
}

test.before(() => {
  // L'orologio qui e' Date fermo al 22/10/2026: quello di prova (WISPER_OGGI_PROVA) lo sposterebbe di nuovo.
  require('../src/utili').spegniOrologioDiProva();
  test.mock.timers.enable({ apis: ['Date'], now: PRIMA.ora });
  cartella = cartellaNuova('migrazione-006');
  const db = creaDatabaseFase5(cartella);
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

test('migrazione 006: versione 6, la copia wisper.db.prima-6 com\'era; le tabelle di prima riga per riga uguali (le colonne nuove vuote)', () => {
  assert.equal(PRIMA.versione, '0.8.0');
  assert.equal(w.db.versione(), 12);
  const copia = new Database(path.join(cartella, 'wisper.db.prima-6'));
  assert.equal(copia.versione(), 5, 'la copia e\' com\'era prima');
  copia.chiudi();
  for (const t of tabellePrima.filter(x => x !== 'registro')) {
    const colonneDopo = w.db.righe('PRAGMA table_info(' + t + ')').map(c => c.name);
    for (const c of colonnePrima[t]) assert.ok(colonneDopo.includes(c), t + ': la colonna ' + c + ' c\'e\' ancora');
    const nuove = colonneDopo.filter(c => !colonnePrima[t].includes(c));
    let dopo = w.db.righe('SELECT * FROM ' + t + ' ORDER BY rowid').map(r => Object.assign({}, r));
    if (t === 'permessi') {
      // Il ruolo esterno (righe nuove) e l'organico come rubrica per il collaboratore (persone 0 -> 1, nel registro).
      dopo = dopo.filter(r => r.ruolo !== 'esterno');
      const coll = righePrima.permessi.find(r => r.ruolo === 'collaboratore' && r.modulo === 'persone');
      if (coll) {
        const d = dopo.find(r => r.ruolo === 'collaboratore' && r.modulo === 'persone');
        assert.equal(d.livello, Math.max(coll.livello, 1));
        d.livello = coll.livello;
      }
      // Fase 7: la 007 da' al collaboratore le sue comunicazioni (comunicazioni 0 -> 2, nel registro).
      const com = righePrima.permessi.find(r => r.ruolo === 'collaboratore' && r.modulo === 'comunicazioni');
      if (com) {
        const d = dopo.find(r => r.ruolo === 'collaboratore' && r.modulo === 'comunicazioni');
        assert.equal(d.livello, com.livello === 0 ? 2 : com.livello);
        d.livello = com.livello;
      }
    }
    if (CON_RIGHE_NUOVE.includes(t)) assert.ok(dopo.length >= righePrima[t].length, t);
    else assert.equal(dopo.length, righePrima[t].length, t + ': quante righe');
    dopo.slice(0, righePrima[t].length).forEach((r, i) => {
      for (const c of nuove) {
        // Le colonne nuove partono vuote, o col valore di base che vuol dire "come prima" (i veicoli: auto di una persona).
        if (t === 'veicoli' && c === 'proprieta') assert.equal(r[c], 'persona', t + ' riga ' + i);
        else if (t === 'veicoli' && c === 'tipo') assert.equal(r[c], 'auto', t + ' riga ' + i);
        else if (t === 'scadenze' && c === 'fine_mese') assert.equal(r[c], 0, t + ' riga ' + i);
        // Fase 7: le colonne della 007, col loro valore di base (niente portale, avvisi e notifiche accesi).
        else if (COLONNE_007[t] && c in COLONNE_007[t]) assert.deepEqual(r[c], valoreAtteso(COLONNE_007[t][c], r, righePrima[t]), t + ' riga ' + i + ': ' + c);
        else assert.ok(r[c] === null || r[c] === '', t + ' riga ' + i + ': ' + c + ' = ' + JSON.stringify(r[c]));
        delete r[c];
      }
      assert.deepEqual(r, righePrima[t][i], t + ' riga ' + i);
    });
  }
  // I contatori AUTOINCREMENT delle tabelle rifatte (ore, scadenze, file) e di tutte le altre restano quelli di prima.
  // Dove la 006 aggiunge righe sue (categorie, ...) il contatore va avanti da quello di prima.
  for (const [nome, seq] of Object.entries(contatoriPrima)) {
    const ora = w.db.riga('SELECT seq FROM sqlite_sequence WHERE name = ?', nome).seq;
    if (CON_RIGHE_NUOVE.includes(nome) || nome === 'registro') assert.ok(ora >= seq, nome);
    else assert.equal(ora, seq, nome);
  }
});

test('nessun costo scritto: una persona per ogni utente (non esterno) col suo nome; nessun costo orario; il registro lo dice', () => {
  const utenti = righePrima.utenti.filter(u => u.ruolo !== 'esterno');
  const persone = w.db.righe('SELECT * FROM persone ORDER BY id');
  assert.equal(persone.length, utenti.length);
  for (const u of utenti) {
    const p = persone.find(x => x.utente_id === u.id);
    assert.ok(p, 'la persona di ' + u.nome);
    assert.deepEqual([p.nome, p.rapporto, p.ore_settimana, p.ferie_annue_ore], [u.nome, u.ruolo === 'titolare' ? 'titolare' : '', null, null]);
    assert.ok(w.db.riga('SELECT id FROM registro WHERE tabella = \'persone\' AND nota = ?', 'migrazione 006: la persona dell\'utente ' + u.id));
  }
  for (const t of ['persona_costi', 'assenze', 'assenze_saldi', 'attrezzature', 'tarature', 'assegnazioni', 'manutenzioni', 'collaboratori', 'incarichi', 'accessi_riservati']) {
    assert.equal(w.db.riga('SELECT COUNT(*) n FROM ' + t).n, 0, t + ': vuota');
  }
  // I veicoli: auto di una persona (senza persona), le trasferte coi loro euro al km.
  assert.ok(w.db.righe('SELECT * FROM veicoli').every(v => v.proprieta === 'persona' && v.persona_id === null));
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM registro WHERE tabella = 'veicoli' AND nota LIKE 'migrazione 006:%'").n, righePrima.veicoli.length);
});

test('rapportini, ore e trasferte identici a quelli del server 0.8.0, campo per campo', () => {
  const ora = comeTitolare(() => w.leggiRapportini('', '', true));
  assert.equal(ora.length, PRIMA.rapportini.length);
  for (const vecchio of PRIMA.rapportini) {
    const nuovo = ora.find(r => r.id === vecchio.id);
    contiene(nuovo, vecchio, vecchio.id);
    assert.deepEqual([nuovo.strumenti, nuovo.idIncarico], [[], null], vecchio.id + ': i campi nuovi vuoti');
  }
  const ore = w.db.righe('SELECT * FROM ore ORDER BY id').map(r => Object.assign({}, r));
  assert.equal(ore.length, PRIMA.ore.length);
  ore.forEach((r, i) => {
    assert.deepEqual([r.incarico_id, r.creata_da], [null, null]);
    delete r.incarico_id;
    delete r.creata_da;
    assert.deepEqual(r, PRIMA.ore[i], 'ore ' + r.id);
  });
  assert.deepEqual(w.db.righe('SELECT * FROM trasferte ORDER BY id').map(r => Object.assign({}, r)), PRIMA.trasferte);
});

test('il costo delle commesse: le parti di prima uguali al centesimo; il totale somma in piu\' solo le voci nuove della fase 6', () => {
  for (const [id, vecchio] of Object.entries(PRIMA.costoCommessa)) {
    const nuovo = comeTitolare(() => w.costoDellaCommessa({ idCommessa: id })).costoCommessa;
    const parti = Object.assign({}, nuovo);
    // Le voci nuove (fase6.md §8.6): nessun incarico dopo la migrazione; altreRicevute = le fatture ricevute della commessa
    // della fase 4 (senza spesa), che il costo sostenuto della fase 6 conta (decisione scritta nel contratto §17).
    assert.deepEqual([nuovo.collaboratori, nuovo.collaboratoriPrevisto], [0, 0], id);
    assert.equal(nuovo.totale, Math.round((vecchio.totale + nuovo.altreRicevute) * 100) / 100, id + ': totale');
    for (const k of ['collaboratori', 'collaboratoriPrevisto', 'altreRicevute']) delete parti[k];
    parti.totale = vecchio.totale;
    assert.deepEqual(parti, vecchio, id + ': le parti di prima');
  }
});

test('i soldi della Dashboard del titolare uguali al centesimo (con l\'orologio di prima)', () => {
  const soldi = comeTitolare(() => w.dashboard({ tutto: true })).numeri.soldi;
  // 06/11/2026 (il rapportino con piu' lavori, senza firma): i lavori Da inviare (BOZZA) si fatturano anche senza firma.
  // "Da fatturare" (e "dei mesi scorsi", e i clienti) crescono esattamente delle voci di quei lavori; il resto uguale al centesimo.
  const prima = comeTitolare(() => numeriDashboardDopoLavori({ soldi: PRIMA.soldi }, w)).soldi;
  assert.ok(prima.daFatturare > PRIMA.soldi.daFatturare, 'nel database di prova ci sono lavori Da inviare');
  contiene(soldi, prima, 'soldi');
  assert.equal(soldi.compensiDaFatturare, 0, 'la voce nuova: nessun collaboratore');
});

test('un rapportino nuovo di Manuel prende lo stesso costo orario di prima (nessun costo della persona scritto)', () => {
  for (const [cliente, costo] of Object.entries(PRIMA.costoOrarioNuovo)) {
    const r = comeTitolare(() => w.salvaRapportino({ idLocale: 'nuovo-' + cliente, data: '2026-10-22', tecnico: 'Manuel Gasparotto', idCliente: cliente, descrizione: 'Prova del costo orario', oreLavoro: 1, tariffa: 40 }));
    assert.equal(w.db.riga('SELECT costo_orario FROM rapportini WHERE id = ?', r.id).costo_orario, costo, cliente);
  }
});

test('i CHECK nuovi: ore di qualcuno (utente o incarico), una sola assegnazione in corso, il registro degli accessi che non si cancella', () => {
  assert.throws(() => w.db.esegui("INSERT INTO ore (data, ore, stato, creato, modificato) VALUES ('2026-10-22', 1, 'approvata', 'x', 'x')"), /CHECK/);
  w.db.esegui("INSERT INTO accessi_riservati (quando, utente_id, persona_id, cosa, azione) VALUES ('x', 1, 1, 'scheda', 'visto')");
  assert.throws(() => w.db.esegui('DELETE FROM accessi_riservati'), /non si/);
  // Le categorie e i testi nuovi.
  const cat = w.db.righe('SELECT nome, vede FROM documento_categorie WHERE sistema = 1').map(c => c.nome + ':' + c.vede);
  for (const c of ['Contratti di lavoro:riservati', 'Cedolini:riservati', 'Idoneità sanitarie:riservati', 'Documenti dei collaboratori:tutti']) assert.ok(cat.includes(c), c);
  assert.ok(w.db.riga("SELECT chiave FROM modelli_testi WHERE chiave = 'LETTERA_INCARICO'"));
  assert.ok(w.db.riga("SELECT * FROM numerazioni WHERE tipo = 'incarico' AND formato = 'IN/{AAAA}/{NNN}' AND annuale = 1"));
  assert.ok(w.db.riga("SELECT * FROM numerazioni WHERE tipo = 'attrezzatura' AND formato = 'AT{NNN}'"));
  const imp = w.leggiImpostazioni();
  assert.deepEqual([imp.PERSONE_CONSERVA_ANNI, imp.TARATURA_BLOCCO, imp.TARATURA_PREAVVISO_GIORNI, imp.KM_TAGLIANDO_AVVISO], [10, 'avviso', 30, 1000]);
});

test('riaperto il server: la migrazione non si rifa\'', () => {
  const persone = w.db.riga('SELECT COUNT(*) n FROM persone').n;
  w.chiudi();
  w = new Wisper({ dati: cartella });
  assert.equal(w.db.versione(), 12);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM persone').n, persone);
});
