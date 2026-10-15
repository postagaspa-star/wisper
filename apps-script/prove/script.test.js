// Le parti dello script che non toccano Google, provate con Node.
//   node --test apps-script/prove
//
// Code.gs si carica cosi' com'e' in un contesto a parte: le funzioni che usano
// SpreadsheetApp o DriveApp non si chiamano, quelle dei conti si'.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = {};
vm.createContext(script);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), script);

// Gli stessi casi li legge anche CalcoloTest.kt: telefono e foglio devono fare
// lo stesso conto, al centesimo.
const casi = JSON.parse(fs.readFileSync(path.join(__dirname, 'casi-calcolo.json'), 'utf8'));

for (const c of casi) {
  test('calcolo: ' + c.nome, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(script.calcola(c.rapportino, c.regole))), c.atteso);
  });
}

test('il totale e\' la somma esatta dei pezzi', () => {
  for (const c of casi) {
    const r = script.calcola(c.rapportino, c.regole);
    const spese = Math.round((c.rapportino.spese || 0) * 100) / 100;
    assert.equal(Math.round((r.compensoOre + r.rimborsoKm + spese) * 100), Math.round(r.totale * 100), c.nome);
  }
});

test('numero del rapportino: progressivo per anno', () => {
  const ids = ['RAP/2026/0001', 'RAP/2026/0007', 'RAP/2025/0099', 'RAP-20260807-194006', ''];
  assert.equal(script.prossimoNumeroRapportino(ids, 2026), 'RAP/2026/0008');
  assert.equal(script.prossimoNumeroRapportino(ids, 2027), 'RAP/2027/0001');
  assert.equal(script.prossimoNumeroRapportino([], 2026), 'RAP/2026/0001');
});

test('codice commessa: prefisso, anno, numero; i codici vecchi non contano', () => {
  const codici = ['M001', 'M002', 'P2601', 'P2603', 'P2512'];
  assert.equal(script.prossimoCodiceCommessa(codici, 'P', 2026), 'P2604');
  assert.equal(script.prossimoCodiceCommessa(codici, 'P', 2027), 'P2701');
  assert.equal(script.prossimoCodiceCommessa(['P2699'], 'P', 2026), 'P26100');
  assert.equal(script.prossimoCodiceCommessa([], 'c', 2026), 'C2601');
});

test('codice cliente: C001, C002, senza riusare i buchi', () => {
  assert.equal(script.prossimoCodice(['C001', 'C004', 'X9'], 'C'), 'C005');
  assert.equal(script.prossimoCodice([], 'C'), 'C001');
});

const gruppi = [
  { nome: 'Elettrodinamica', tariffaFissa: 30, pagaViaggio: false, kmRimborsati: true, maggExtra: 0 },
  { nome: 'Privato', tariffaFissa: null, pagaViaggio: false, kmRimborsati: true, maggExtra: 0 },
];
const impostazioni = { EURO_KM: '0,76', COSTO_ORARIO: '' };

test('regole: Elettrodinamica ha la tariffa fissa', () => {
  const r = script.regoleDi({ gruppo: 'elettrodinamica', pagaViaggio: null, kmRimborsati: null }, gruppi, impostazioni);
  assert.equal(r.tariffaFissa, 30);
  assert.equal(r.pagaViaggio, false);
  assert.equal(r.euroKm, 0.76);
  assert.equal(r.costoOrario, null);
});

test('regole: privato e cliente senza gruppo hanno la tariffa libera', () => {
  assert.equal(script.regoleDi({ gruppo: 'Privato' }, gruppi, impostazioni).tariffaFissa, null);
  assert.equal(script.regoleDi({ gruppo: '' }, gruppi, impostazioni).tariffaFissa, null);
  assert.equal(script.regoleDi({ gruppo: 'Inesistente' }, gruppi, impostazioni).tariffaFissa, null);
});

test('regole: la scheda del cliente vince sul gruppo', () => {
  const r = script.regoleDi({ gruppo: 'Elettrodinamica', pagaViaggio: true, kmRimborsati: false }, gruppi, impostazioni);
  assert.equal(r.pagaViaggio, true);
  assert.equal(r.kmRimborsati, false);
  assert.equal(r.tariffaFissa, 30);
});

test('date: dal foglio al formato aaaa-mm-gg', () => {
  assert.equal(script.dataIso('15/10/2026'), '2026-10-15');
  assert.equal(script.dataIso('5/7/2026'), '2026-07-05');
  assert.equal(script.dataIso('2026-10-15'), '2026-10-15');
  assert.equal(script.dataIso(''), '');
});

test('colonne: la vecchia "ORE" vale come ORE_LAVORO, e una chiave sola per colonna', () => {
  const chiavi = script.chiaviColonne('Rapportini', ['ID', 'DATA', 'Ore', 'ORE_LAVORO', 'TIMESTAMP', 'Altro']);
  assert.deepEqual(JSON.parse(JSON.stringify(chiavi)), ['id', 'data', 'oreLavoro', null, 'creato', null]);
});

test('file: id ricavato dal link di Drive', () => {
  assert.equal(script.idDaUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view'), '1AbCdEfGhIjKlMnOp');
  const f = script.fileDaCella('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view\nhttps://drive.google.com/file/d/2ZyXwVuTsRqPoNmL/view');
  assert.equal(f.length, 2);
  assert.equal(f[1].id, '2ZyXwVuTsRqPoNmL');
});

test('si/no: vuoto vuol dire "decide il gruppo"', () => {
  assert.equal(script.siNoONull('SI'), true);
  assert.equal(script.siNoONull('no'), false);
  assert.equal(script.siNoONull(''), null);
});
