// I conti del server: gli stessi casi dello script e dell'app (apps-script/prove/casi-calcolo.json,
// letto dal suo posto), le regole, i codici e le numerazioni.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/conti');
const { schemaFormato, formatta, controllaFormato } = require('../src/formati');
const { Wisper, SISTEMA } = require('../src/wisper');
const { cartellaNuova } = require('./aiuto');

const casi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'prove', 'casi-calcolo.json'), 'utf8'));

for (const c of casi) {
  test('calcolo: ' + c.nome, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(C.calcola(c.rapportino, c.regole))), c.atteso);
  });
}

test('il totale e\' la somma esatta dei pezzi', () => {
  for (const c of casi) {
    const r = C.calcola(c.rapportino, c.regole);
    const spese = Math.round((c.rapportino.spese || 0) * 100) / 100;
    assert.equal(Math.round((r.compensoOre + r.rimborsoKm + spese) * 100), Math.round(r.totale * 100), c.nome);
  }
});

const impostazioni = { EURO_KM: '0,76', COSTO_ORARIO: '' };

test('regole: come regoleDi() di Code.gs', () => {
  const e = C.regoleDi({ nome: 'Elettrodinamica', tariffaFissa: 30, pagaViaggio: false, kmRimborsati: true }, [], impostazioni);
  assert.deepEqual([e.tariffaFissa, e.pagaViaggio, e.kmRimborsati, e.euroKm, e.costoOrario], [30, false, true, 0.76, null]);
  const r = C.regoleDi({ nome: 'Rossi', tariffaFissa: null, pagaViaggio: null, kmRimborsati: null }, [], impostazioni);
  assert.deepEqual([r.tariffaFissa, r.pagaViaggio, r.kmRimborsati], [null, false, true]);
  assert.equal(C.regoleDi(null, [], impostazioni).tariffaFissa, null, 'un cliente nuovo');
  assert.equal(C.regoleDi({ nome: 'Rossi' }, [], impostazioni, { euroKm: 0.9 }).euroKm, 0.9, 'la commessa vince');
  const gruppi = [{ nome: 'Elettrodinamica', tariffaFissa: 30, pagaViaggio: false, kmRimborsati: true, maggExtra: 0 }];
  assert.equal(C.regoleDi({ gruppo: 'elettrodinamica' }, gruppi, impostazioni).tariffaFissa, 30, 'un cliente dei fogli vecchi');
  assert.equal(C.regoleDi({ gruppo: 'Elettrodinamica', tariffaFissa: 35 }, gruppi, impostazioni).tariffaFissa, 35, 'la scheda del cliente vince');
  assert.equal(C.regoleDi({ costoFisso: 22 }, [], { COSTO_ORARIO: 15 }, { costoOrario: 30 }).costoOrario, 22, 'il costo fisso del cliente vince');
  assert.equal(C.regoleDi({}, [], { COSTO_ORARIO: 15 }, { costoOrario: 30 }).costoOrario, 30);
  assert.equal(C.regoleDi({}, [], { COSTO_ORARIO: 15 }, null).costoOrario, 15);
});

test('codice cliente: C001, C002, senza riusare i buchi', () => {
  assert.equal(C.prossimoCodice(['C001', 'C004', 'X9'], 'C'), 'C005');
  assert.equal(C.prossimoCodice([], 'C'), 'C001');
  assert.equal(C.prossimoCodice(['C001', 'F002'], 'F'), 'F003');
});

test('partita IVA italiana: il codice di controllo', () => {
  assert.equal(C.partitaIvaItalianaValida('01234567897'), true);
  assert.equal(C.partitaIvaItalianaValida('IT 01234567897'), true);
  assert.equal(C.partitaIvaItalianaValida('01234567890'), false);
  assert.equal(C.partitaIvaItalianaValida('1234567897'), false, '10 cifre');
  assert.equal(C.partitaIvaItalianaValida('00000000000'), true);
});

test('formati: segnaposti {AAAA} {AA} {N...}', () => {
  assert.equal(formatta('{AA}ST{NNN}', 2026, 7), '26ST007');
  assert.equal(formatta('{AA}ST{NNN}', 2027, 1000), '27ST1000');
  assert.equal(formatta('RAP/{AAAA}/{NNNN}', 2026, 12), 'RAP/2026/0012');
  assert.equal(formatta('ST{AA}-{NNNN}', 2026, 1), 'ST26-0001');
  const s = schemaFormato('RAP/{AAAA}/{NNNN}');
  const m = 'RAP/2026/0007'.match(s.re);
  assert.equal(m[s.anno4], '2026');
  assert.equal(m[s.numero], '0007');
  assert.ok(schemaFormato('{AA}ST{NNN}').re.test('26st004'), 'maiuscole e minuscole non contano');
  assert.throws(() => controllaFormato('{AA}ST', false), /posto per il numero/);
  assert.throws(() => controllaFormato('ST{NNN}', true), /anno/);
  assert.throws(() => controllaFormato('{XX}{NNN}', false), /Segnaposto sconosciuto/);
  assert.equal(controllaFormato('ST{AA}-{NNNN}', true), 'ST{AA}-{NNNN}');
});

test('numerazioni: il piu\' alto gia\' usato + 1, per anno per i rapportini, di fila per le commesse', () => {
  const w = new Wisper({ dati: cartellaNuova('numeri'), memoria: true });
  try {
    w.come(SISTEMA, () => {
      // Come prossimoNumeroRapportino() di Code.gs.
      const ids = ['RAP/2026/0001', 'RAP/2026/0007', 'RAP/2025/0099', 'RAP-20260807-194006', ''];
      assert.equal(w.prossimoNumero('rapportino', ids, 2026).codice, 'RAP/2026/0008');
      assert.equal(w.prossimoNumero('rapportino', ids, 2027).codice, 'RAP/2027/0001');
      // Come prossimoCodiceCommessa() di Code.gs.
      const codici = ['M001', 'P2601', '26ST009', '25ST120', '26st004'];
      assert.equal(w.prossimoNumero('commessa', codici, 2026).codice, '26ST121');
      assert.equal(w.prossimoNumero('commessa', codici, 2027).codice, '27ST121');
      assert.equal(w.prossimoNumero('commessa', [], 2026).codice, '26ST001');
      assert.equal(w.prossimoNumero('commessa', ['26ST999'], 2026).codice, '26ST1000');
      assert.equal(w.prossimoNumero('commessa', ['P2601', 'M001'], 2026).codice, '26ST001', 'i codici vecchi non contano');
      // Cambiare formato vale per i numeri nuovi, e il contatore continua.
      w.salvaNumerazione({ tipo: 'commessa', formato: 'ST{AA}-{NNNN}' });
      assert.equal(w.prossimoNumero('commessa', ['26ST046'], 2026).codice, 'ST26-0047');
      assert.equal(w.prossimoNumero('commessa', ['26ST046', 'ST27-0047'], 2027).codice, 'ST27-0048');
      w.salvaNumerazione({ tipo: 'rapportino', formato: 'R{AA}-{NNN}' });
      assert.equal(w.prossimoNumero('rapportino', ['RAP/2026/0011'], 2026).codice, 'R26-012', 'i RAP di prima contano ancora');
      assert.equal(w.prossimoNumero('rapportino', ['RAP/2026/0011', 'R26-012'], 2027).codice, 'R27-001', 'e a gennaio riparte');
    });
  } finally {
    w.chiudi();
  }
});
