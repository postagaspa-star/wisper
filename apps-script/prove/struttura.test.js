// La 0.3.5 sul finto Google: Elettrodinamica cliente a tariffa fissa, codici
// commessa 26ST, codice nella colonna COMMESSA. Si parte da un foglio "di prima",
// coi gruppi e i codici vecchi, e si guarda cosa ne fa aggiornaStruttura().
//   node --test "apps-script/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const { contesto, fogli, proprieta } = require('./finto-google.js');

const CODICE = 'prova';
const ss = contesto.SpreadsheetApp.getActiveSpreadsheet();

function scheda(nome, intestazioni, righe) {
  const f = ss.getSheetByName(nome) || ss.insertSheet(nome);
  f.celle = [intestazioni.slice()].concat(righe.map(r => intestazioni.map(h => (r[h] === undefined ? '' : r[h]))));
  return f;
}
function righe(nome) {
  const f = fogli.get(nome);
  const h = f.celle[0];
  return f.celle.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] === undefined ? '' : r[i]])));
}
function scrivi(azione, dati) {
  return JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify(Object.assign({ codice: CODICE, azione }, dati)) } }).testo);
}
function leggi(parametri) {
  return JSON.parse(contesto.doGet({ parameter: Object.assign({ codice: CODICE }, parametri) }).testo);
}

// ------------------------------------------------------------------ il foglio di prima

const intestazioniRapportini = fogli.get('Rapportini').celle[0].slice();
const rap = (o) => Object.assign({ TECNICO: 'Manuel Gasparotto', STATO: 'BOZZA', TARIFFA: 30, EURO_KM: 0.76, ORE_LAVORO: 4, TOTALE: 120 }, o);

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

// ------------------------------------------------------------------ la migrazione

test('alla prima richiesta il foglio si sistema da solo', () => {
  const r = leggi({});
  assert.equal(r.ok, true, r.errore);
  assert.ok(proprieta.get('STRUTTURA_0_3_5'), 'la manutenzione e\' segnata come fatta');
});

test('Elettrodinamica e\' un cliente a tariffa fissa, coi valori e l\'email del vecchio gruppo', () => {
  const e = righe('Clienti').find(c => c.RAGIONE_SOCIALE === 'Elettrodinamica');
  assert.ok(e, 'creata');
  assert.equal(e.ID_CLIENTE, 'C004', 'un codice nuovo, dopo quelli che c\'erano');
  assert.equal(e.TARIFFA_FISSA, 30);
  assert.equal(e.PAGA_VIAGGIO, 'NO');
  assert.equal(e.KM_RIMBORSATI, 'SI');
  assert.equal(e.EMAIL, 'rapportini@elettrodinamica.example');
  assert.equal(e.GRUPPO, '');
});

test('i clienti finali di Elettrodinamica non si propongono piu\', ma restano nel foglio', () => {
  const clienti = leggi({}).clienti;
  assert.deepEqual(clienti.map(c => c.nome).sort(), ['Elettrodinamica', 'Rossi Impianti Srl']);
  const nelFoglio = righe('Clienti');
  assert.equal(nelFoglio.find(c => c.ID_CLIENTE === 'C001').ACCORPATO_IN, 'C004');
  assert.equal(nelFoglio.find(c => c.ID_CLIENTE === 'C003').ACCORPATO_IN, 'C004');
  const e = clienti.find(c => c.nome === 'Elettrodinamica');
  assert.deepEqual(e.alias.sort(), ['Acme Spa', 'Batokyo']);
});

test('i loro rapportini e le loro commesse passano a Elettrodinamica', () => {
  const r = righe('Rapportini');
  ['RAP/2026/0001', 'RAP/2026/0002', 'RAP/2026/0004'].forEach(id => {
    const x = r.find(y => y.ID === id);
    assert.equal(x.ID_CLIENTE, 'C004', id);
    assert.equal(x.CLIENTE, 'Elettrodinamica', id);
  });
  assert.equal(r.find(y => y.ID === 'RAP/2026/0003').ID_CLIENTE, 'C002', 'Rossi resta Rossi');
  const m = righe('Commesse');
  assert.equal(m.find(x => x.DESCRIZIONE === 'Magazzino').ID_CLIENTE, 'C004');
  assert.equal(m.find(x => x.DESCRIZIONE === 'Linea 3').ID_CLIENTE, 'C004');
});

test('le commesse coi codici vecchi prendono il codice 26ST, di fila dopo il piu\' alto', () => {
  const m = righe('Commesse');
  const mag = m.find(x => x.DESCRIZIONE === 'Magazzino');
  const qua = m.find(x => x.DESCRIZIONE === 'Quadro capannone');
  assert.equal(mag.ID_COMMESSA, '26ST011');
  assert.equal(mag.CODICE_PRECEDENTE, 'P2601');
  assert.equal(qua.ID_COMMESSA, '25ST012', 'l\'anno e\' quello di inizio');
  assert.equal(qua.CODICE_PRECEDENTE, 'M001');
  assert.equal(m.find(x => x.DESCRIZIONE === 'Linea 3').ID_COMMESSA, '26ST010', 'quella gia\' giusta non cambia');
});

test('nella colonna COMMESSA dei rapportini c\'e\' il codice, anche in quelli che avevano solo la descrizione', () => {
  const r = righe('Rapportini');
  const per = id => r.find(y => y.ID === id);
  assert.equal(per('RAP/2026/0001').ID_COMMESSA, '26ST011');
  assert.equal(per('RAP/2026/0001').COMMESSA, '26ST011');
  assert.equal(per('RAP/2026/0003').ID_COMMESSA, '25ST012');
  assert.equal(per('RAP/2026/0003').COMMESSA, '25ST012');
  assert.equal(per('RAP/2026/0004').COMMESSA, '26ST010');
});

test('telefono e computer ricevono codice e descrizione', () => {
  const r = leggi({ azione: 'rapportini', tutti: '1' }).rapportini.find(x => x.id === 'RAP/2026/0002');
  assert.equal(r.idCommessa, '26ST011');
  assert.equal(r.commessa, 'Magazzino');
});

test('rilanciarla non cambia niente', () => {
  const prima = JSON.stringify(['Clienti', 'Commesse', 'Rapportini'].map(n => fogli.get(n).celle));
  contesto.aggiornaStruttura();
  assert.equal(JSON.stringify(['Clienti', 'Commesse', 'Rapportini'].map(n => fogli.get(n).celle)), prima);
});

// ------------------------------------------------------------------ dopo

test('un rapportino rimasto in coda su un telefono vecchio finisce al posto giusto', () => {
  const r = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'coda-1', data: '2026-10-15', idCliente: 'C001', cliente: 'Batokyo', idCommessa: 'P2601', commessa: 'Magazzino', oreLavoro: 2,
  } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.cliente, 'Elettrodinamica');
  assert.equal(r.rapportino.idCommessa, '26ST011');
  assert.equal(r.rapportino.tariffa, 30, 'tariffa fissa di Elettrodinamica');
});

test('un cliente nuovo "del gruppo Elettrodinamica" da un telefono vecchio e\' Elettrodinamica', () => {
  const r = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'coda-2', data: '2026-10-16', cliente: 'Cliente Finale Nuovo', gruppo: 'Elettrodinamica', oreLavoro: 1,
  } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.cliente, 'Elettrodinamica');
  assert.equal(leggi({}).clienti.some(c => c.nome === 'Cliente Finale Nuovo'), false);
});

test('una commessa nata sul telefono prende il codice che il telefono le ha dato', () => {
  const r = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'nuova-1', data: '2026-10-17', idCliente: 'C002', commessa: 'Pompe pozzo', codiceProposto: '26ST013', tariffa: 42, oreLavoro: 1,
  } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.idCommessa, '26ST013');
  assert.equal(r.rapportino.commessa, 'Pompe pozzo');
});

test('se nel frattempo quel codice e\' stato dato a un\'altra, si prende il primo libero', () => {
  assert.equal(scrivi('creaCommessa', { idCliente: 'C002', descrizione: 'Dal computer', id: '26ST014' }).ok, true);
  const r = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'nuova-2', data: '2026-10-17', idCliente: 'C002', commessa: 'Dal telefono', codiceProposto: '26ST014', tariffa: 42, oreLavoro: 1,
  } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.idCommessa, '26ST015');
});

test('un codice scritto a mano dal computer che c\'e\' gia\' si rifiuta', () => {
  const r = scrivi('creaCommessa', { idCliente: 'C002', descrizione: 'Doppione', id: '26ST011' });
  assert.equal(r.ok, false);
  assert.match(r.errore, /26ST011/);
});

test('il rimborso chilometrico della commessa vince su quello generale', () => {
  const m = scrivi('creaCommessa', { idCliente: 'C002', descrizione: 'Lontana', euroKm: 1 }).commessa;
  const r = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'km-1', data: '2026-10-18', idCliente: 'C002', idCommessa: m.id, tariffa: 40, oreLavoro: 1, km: 100,
  } });
  assert.equal(r.rapportino.euroKm, 1);
  assert.equal(r.rapportino.rimborsoKm, 100);
  const senza = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'km-2', data: '2026-10-18', idCliente: 'C002', tariffa: 40, oreLavoro: 1, km: 100,
  } });
  assert.equal(senza.rapportino.euroKm, 0.76);
});

// ------------------------------------------------------------------ prezzo e costo per commessa

test('una commessa senza prezzo prende la tariffa del suo primo rapportino', () => {
  const m = scrivi('creaCommessa', { idCliente: 'C002', descrizione: 'Senza prezzo' }).commessa;
  assert.equal(m.prezzoOrario, null);
  scrivi('salvaRapportino', { rapportino: { idLocale: 'prezzo-1', data: '2026-10-19', idCliente: 'C002', idCommessa: m.id, tariffa: 48, oreLavoro: 2 } });
  assert.equal(leggi({}).commesse.find(x => x.id === m.id).prezzoOrario, 48);
  // Dal secondo rapportino il prezzo resta quello: un giorno a prezzo diverso non lo cambia.
  scrivi('salvaRapportino', { rapportino: { idLocale: 'prezzo-2', data: '2026-10-20', idCliente: 'C002', idCommessa: m.id, tariffa: 40, oreLavoro: 2 } });
  assert.equal(leggi({}).commesse.find(x => x.id === m.id).prezzoOrario, 48);
});

test('le commesse di Elettrodinamica non prendono un prezzo: vale la tariffa fissa', () => {
  const m = scrivi('creaCommessa', { idCliente: 'C004', descrizione: 'Cantiere fisso' }).commessa;
  const r = scrivi('salvaRapportino', { rapportino: { idLocale: 'fisso-1', data: '2026-10-19', idCliente: 'C004', idCommessa: m.id, oreLavoro: 2 } });
  assert.equal(r.rapportino.tariffa, 30);
  assert.equal(leggi({}).commesse.find(x => x.id === m.id).prezzoOrario, null);
});

test('il costo orario: prima il costo fisso del cliente, poi quello della commessa, poi le impostazioni', () => {
  scrivi('salvaImpostazioni', { valori: { COSTO_ORARIO: 18 } });
  const m = scrivi('creaCommessa', { idCliente: 'C002', descrizione: 'Con costo', costoOrario: 22, prezzoOrario: 45 }).commessa;
  assert.equal(m.costoOrario, 22);
  assert.equal(m.prezzoOrario, 45);
  let r = scrivi('salvaRapportino', { rapportino: { idLocale: 'costo-1', data: '2026-10-19', idCliente: 'C002', idCommessa: m.id, tariffa: 45, oreLavoro: 1 } });
  assert.equal(r.rapportino.costoOrario, 22, 'quello della commessa');
  r = scrivi('salvaRapportino', { rapportino: { idLocale: 'costo-2', data: '2026-10-19', idCliente: 'C002', tariffa: 45, oreLavoro: 1 } });
  assert.equal(r.rapportino.costoOrario, 18, 'senza commessa: quello delle impostazioni');
  scrivi('aggiornaCliente', { id: 'C004', campi: { costoFisso: 25 } });
  const e = scrivi('creaCommessa', { idCliente: 'C004', descrizione: 'Elettro con costo', costoOrario: 40 }).commessa;
  r = scrivi('salvaRapportino', { rapportino: { idLocale: 'costo-3', data: '2026-10-19', idCliente: 'C004', idCommessa: e.id, oreLavoro: 1 } });
  assert.equal(r.rapportino.costoOrario, 25, 'il costo fisso del cliente vince');
  assert.equal(leggi({}).clienti.find(c => c.id === 'C004').costoFisso, 25);
});
