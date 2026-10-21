// Un foglio di prima della 0.3.5 (gruppi, clienti finali di Elettrodinamica, codici P2601 e
// M001, descrizioni nella colonna COMMESSA), come in apps-script/prove/struttura.test.js:
// l'importazione deve farne quello che ne fa aggiornaStruttura() dello script.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cartellaNuova } = require('./aiuto');
const { scriviXlsx } = require('../strumenti/xlsx');
const { importa } = require('../strumenti/importa');
const { Wisper, SISTEMA } = require('../src/wisper');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const { contesto, fogli, proprieta } = require('../../apps-script/prove/finto-google.js');

const ss = contesto.SpreadsheetApp.getActiveSpreadsheet();
function scheda(nome, intestazioni, righe) {
  const f = ss.getSheetByName(nome) || ss.insertSheet(nome);
  f.celle = [intestazioni.slice()].concat(righe.map(r => intestazioni.map(h => (r[h] === undefined ? '' : r[h]))));
}
function righe(nome) {
  const f = fogli.get(nome);
  const h = f.celle[0];
  return f.celle.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])));
}

// ------------------------------------------------------------------ lo stesso foglio di struttura.test.js

const intestazioniRapportini = fogli.get('Rapportini').celle[0].slice();
const rap = o => Object.assign({ TECNICO: 'Manuel Gasparotto', STATO: 'BOZZA', TARIFFA: 30, EURO_KM: 0.76, ORE_LAVORO: 4, TOTALE: 120 }, o);
scheda('Gruppi', ['GRUPPO', 'TARIFFA_FISSA', 'PAGA_VIAGGIO', 'KM_RIMBORSATI', 'MAGG_EXTRA', 'EMAIL', 'NOTE'], [
  { GRUPPO: 'Elettrodinamica', TARIFFA_FISSA: 30, PAGA_VIAGGIO: 'NO', KM_RIMBORSATI: 'SI', MAGG_EXTRA: 0, EMAIL: 'rapportini@elettrodinamica.example' },
  { GRUPPO: 'Privato', PAGA_VIAGGIO: 'NO', KM_RIMBORSATI: 'SI', MAGG_EXTRA: 0 },
]);
scheda('Clienti', ['ID_CLIENTE', 'RAGIONE_SOCIALE', 'ALIAS', 'GRUPPO', 'EMAIL', 'TELEFONO', 'INDIRIZZO', 'PARTITA_IVA', 'ULTIMA_TARIFFA', 'PAGA_VIAGGIO', 'KM_RIMBORSATI', 'NOTE'], [
  { ID_CLIENTE: 'C001', RAGIONE_SOCIALE: 'Batokyo', GRUPPO: 'Elettrodinamica' },
  { ID_CLIENTE: 'C002', RAGIONE_SOCIALE: 'Rossi Impianti Srl', GRUPPO: 'Privato', ULTIMA_TARIFFA: 42 },
  { ID_CLIENTE: 'C003', RAGIONE_SOCIALE: 'Acme Spa', GRUPPO: 'Elettrodinamica' },
]);
scheda('Commesse', ['ID_COMMESSA', 'ID_CLIENTE', 'DESCRIZIONE', 'STATO', 'INDIRIZZO', 'BUDGET_ORE', 'BUDGET_EURO', 'INIZIO', 'FINE_PREVISTA', 'CARTELLA', 'NOTE'], [
  { ID_COMMESSA: 'P2601', ID_CLIENTE: 'C001', DESCRIZIONE: 'Magazzino', STATO: 'APERTA', INIZIO: new Date(2026, 8, 1) },
  { ID_COMMESSA: 'M001', ID_CLIENTE: 'C002', DESCRIZIONE: 'Quadro capannone', STATO: 'APERTA', INIZIO: new Date(2025, 4, 1) },
  { ID_COMMESSA: '26ST010', ID_CLIENTE: 'C003', DESCRIZIONE: 'Linea 3', STATO: 'APERTA', INIZIO: new Date(2026, 9, 1) },
]);
scheda('Rapportini', intestazioniRapportini, [
  rap({ ID: 'RAP/2026/0001', ID_LOCALE: 'v1', DATA: new Date(2026, 8, 10), ID_CLIENTE: 'C001', CLIENTE: 'Batokyo', GRUPPO: 'Elettrodinamica', ID_COMMESSA: 'P2601', COMMESSA: 'Magazzino', STATO: 'FATTURATO' }),
  rap({ ID: 'RAP/2026/0002', ID_LOCALE: 'v2', DATA: new Date(2026, 9, 2), ID_CLIENTE: 'C001', CLIENTE: 'Batokyo', GRUPPO: 'Elettrodinamica', ID_COMMESSA: 'P2601', COMMESSA: 'Magazzino' }),
  rap({ ID: 'RAP/2026/0003', ID_LOCALE: 'v3', DATA: new Date(2026, 9, 3), ID_CLIENTE: 'C002', CLIENTE: 'Rossi Impianti Srl', GRUPPO: 'Privato', ID_COMMESSA: '', COMMESSA: 'Quadro capannone', TARIFFA: 42 }),
  rap({ ID: 'RAP/2026/0004', ID_LOCALE: 'v4', DATA: new Date(2026, 9, 4), ID_CLIENTE: 'C003', CLIENTE: 'Acme Spa', GRUPPO: 'Elettrodinamica', ID_COMMESSA: '26ST010', COMMESSA: 'Linea 3' }),
]);
proprieta.delete('STRUTTURA_0_3_5');

// Il foglio si esporta COSI' COM'E', prima che lo script lo sistemi.
const cartella = cartellaNuova('vecchio');
const xlsx = path.join(cartella, 'foglio-vecchio.xlsx');
fs.writeFileSync(xlsx, scriviXlsx(Array.from(fogli.values()).map(f => ({ nome: f.getName(), righe: f.celle.map(r => r.slice()) }))));
// E poi lo script fa la sua manutenzione: il riferimento.
const pronto = JSON.parse(contesto.doGet({ parameter: { codice: 'prova' } }).testo);

let w;
test.before(() => {
  const r = importa({ foglio: xlsx, dati: cartella, anno: new Date().getFullYear() });
  assert.equal(r.ok, true, JSON.stringify(r.errori));
  assert.ok(r.avvisi.some(a => /prima della 0\.3\.5/.test(a)), 'lo dice nel controllo');
  w = new Wisper({ dati: cartella });
});
test.after(() => w.chiudi());

test('lo script ha sistemato il suo foglio (riferimento)', () => {
  assert.equal(pronto.ok, true);
  assert.ok(proprieta.get('STRUTTURA_0_3_5'));
});

test('Elettrodinamica: cliente a tariffa fissa coi valori e l\'email del vecchio gruppo, codice dopo quelli che c\'erano', () => {
  const suo = righe('Clienti').find(c => c.RAGIONE_SOCIALE === 'Elettrodinamica');
  const mio = w.db.riga("SELECT * FROM soggetti WHERE nome = 'Elettrodinamica'");
  assert.equal(mio.id, suo.ID_CLIENTE);
  assert.equal(mio.id, 'C004');
  assert.equal(mio.tariffa_fissa, 30);
  assert.equal(mio.paga_viaggio, 0);
  assert.equal(mio.km_rimborsati, 1);
  assert.equal(mio.email, 'rapportini@elettrodinamica.example');
  assert.equal(mio.gruppo, '');
});

test('i clienti finali restano ma accorpati, e i loro nomi diventano soprannomi di Elettrodinamica', () => {
  for (const c of righe('Clienti')) {
    const mio = w.db.riga('SELECT * FROM soggetti WHERE id = ?', c.ID_CLIENTE);
    assert.equal(mio.accorpato_in, c.ACCORPATO_IN || '', c.ID_CLIENTE);
  }
  const clienti = w.come(SISTEMA, () => w.leggiClienti());
  assert.deepEqual(clienti.map(c => c.nome).sort(), pronto.clienti.map(c => c.nome).sort());
  assert.deepEqual(clienti.find(c => c.id === 'C004').alias.sort(), ['Acme Spa', 'Batokyo']);
});

test('le commesse coi codici vecchi hanno il codice 26ST, come le ha ricodificate lo script', () => {
  const sue = righe('Commesse');
  for (const m of sue) {
    const mia = w.db.riga('SELECT * FROM commesse WHERE descrizione = ?', m.DESCRIZIONE);
    assert.equal(mia.id, m.ID_COMMESSA, m.DESCRIZIONE);
    assert.equal(mia.codice_precedente, m.CODICE_PRECEDENTE || '', m.DESCRIZIONE);
    assert.equal(mia.cliente_id, m.ID_CLIENTE, m.DESCRIZIONE);
  }
  assert.deepEqual(sue.map(m => m.ID_COMMESSA).sort(), ['25ST012', '26ST010', '26ST011']);
});

test('i rapportini: cliente, commessa e codice nella colonna COMMESSA come dopo aggiornaStruttura()', () => {
  for (const r of righe('Rapportini')) {
    const mio = w.db.riga('SELECT * FROM rapportini WHERE id = ?', r.ID);
    assert.equal(mio.id_cliente, r.ID_CLIENTE, r.ID);
    assert.equal(mio.cliente, r.CLIENTE, r.ID);
    assert.equal(mio.gruppo, r.GRUPPO, r.ID);
    assert.equal(mio.id_commessa, r.ID_COMMESSA, r.ID);
    assert.equal(mio.commessa, r.COMMESSA, r.ID);
  }
  const letti = w.come(SISTEMA, () => w.leggiRapportini('', '', true));
  const suoi = JSON.parse(contesto.doGet({ parameter: { codice: 'prova', azione: 'rapportini', tutti: '1' } }).testo).rapportini;
  for (const r of suoi) {
    const m = letti.find(x => x.id === r.id);
    assert.deepEqual([m.idCliente, m.idCommessa, m.commessa, m.totale], [r.idCliente, r.idCommessa, r.commessa, r.totale], r.id);
  }
});

test('un rapportino rimasto in coda su un telefono vecchio, col codice P2601, trova la commessa nuova', () => {
  const r = w.come(SISTEMA, () => w.db.transazione(() => w.salvaRapportino({
    idLocale: 'coda-1', data: '2026-10-15', idCliente: 'C001', cliente: 'Batokyo', idCommessa: 'P2601', commessa: 'Magazzino', oreLavoro: 2,
  })));
  assert.equal(r.cliente, 'Elettrodinamica');
  assert.equal(r.idCommessa, '26ST011');
  assert.equal(r.tariffa, 30, 'tariffa fissa di Elettrodinamica');
  const nuovo = w.come(SISTEMA, () => w.db.transazione(() => w.salvaRapportino({
    idLocale: 'coda-2', data: '2026-10-16', cliente: 'Cliente Finale Nuovo', gruppo: 'Elettrodinamica', oreLavoro: 1,
  })));
  assert.equal(nuovo.cliente, 'Elettrodinamica');
});
