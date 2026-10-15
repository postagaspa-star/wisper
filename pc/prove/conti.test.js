// I conti e i documenti di Wisper Ufficio, provati con Node.
//   node --test pc/prove
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const D = require('../ui/documenti.js');

// Gli stessi casi dello script e dell'app: tre programmi, un conto solo.
const casi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'prove', 'casi-calcolo.json'), 'utf8'));
for (const c of casi) {
  test('calcolo: ' + c.nome, () => {
    assert.deepEqual(C.calcola(c.rapportino, c.regole), c.atteso);
  });
}

test('numeri come li scrive una persona', () => {
  assert.equal(C.num('6,5'), 6.5);
  assert.equal(C.num('1.250,50'), 1250.5);
  assert.equal(C.numONull(''), null);
  assert.equal(C.numONull('sei'), null);
  assert.equal(C.euro(1234.5), '1.234,50 €');
  assert.equal(C.data('2026-07-05'), '05/07/2026');
  assert.equal(C.nomeMese('2026-07'), 'Luglio 2026');
});

const rapportini = [
  { id: 'RAP/2026/0001', idCliente: 'C001', cliente: 'Batokyo', gruppo: 'Elettrodinamica', idCommessa: 'P2601', commessa: 'Magazzino',
    data: '2026-07-02', stato: 'FATTURATO', oreLavoro: 8, oreExtra: 0, oreViaggio: 1, oreTotali: 9, km: 120, spese: 10,
    compensoOre: 240, rimborsoKm: 91.2, totale: 341.2, euroKm: 0.76, costoOrario: 15, descrizione: 'Collaudo quadro' },
  { id: 'RAP/2026/0002', idCliente: 'C001', cliente: 'Batokyo', gruppo: 'Elettrodinamica', idCommessa: 'P2601', commessa: 'Magazzino',
    data: '2026-07-15', stato: 'FIRMATO', oreLavoro: 6, oreExtra: 2, oreViaggio: 0, oreTotali: 8, km: 0, spese: 0,
    compensoOre: 240, rimborsoKm: 0, totale: 240, euroKm: 0.76, costoOrario: 15, descrizione: 'Programmazione PLC' },
  { id: 'RAP/2026/0003', idCliente: 'C002', cliente: 'Rossi', gruppo: 'Privato', idCommessa: '', commessa: '',
    data: '2026-08-01', stato: 'BOZZA', oreLavoro: 3, oreExtra: 0, oreViaggio: 0, oreTotali: 3, km: 20, spese: 0,
    compensoOre: 126, rimborsoKm: 15.2, totale: 141.2, euroKm: 0.76, costoOrario: null, tariffa: 42, descrizione: 'Sopralluogo' },
  { id: 'RAP/2026/0004', idCliente: 'C002', cliente: 'Rossi', data: '2026-08-02', stato: 'ANNULLATO', oreTotali: 5, totale: 100 },
];

test('filtri: mese "07" e cliente vuoto = tutto luglio', () => {
  assert.deepEqual(C.filtra(rapportini, { mese: '2026-07' }).map(r => r.id), ['RAP/2026/0001', 'RAP/2026/0002']);
});

test('filtri: per gruppo, per cliente, da fatturare, testo; gli annullati mai', () => {
  assert.equal(C.filtra(rapportini, { gruppo: 'elettrodinamica' }).length, 2);
  assert.equal(C.filtra(rapportini, { cliente: 'C002' }).length, 1);
  assert.deepEqual(C.filtra(rapportini, { stato: 'dafatturare' }).map(r => r.id), ['RAP/2026/0002']);
  assert.deepEqual(C.filtra(rapportini, { testo: 'plc' }).map(r => r.id), ['RAP/2026/0002']);
  assert.equal(C.filtra(rapportini, {}).length, 3);
});

test('totali del mese', () => {
  const t = C.totali(C.filtra(rapportini, { mese: '2026-07' }));
  assert.equal(t.n, 2);
  assert.equal(t.ore, 17);
  assert.equal(t.km, 120);
  assert.equal(t.totale, 581.2);
});

test('tariffa proposta: prima quella che ricorda il foglio, poi l\'ultimo rapportino', () => {
  assert.equal(C.tariffaProposta({ id: 'C002', ultimaTariffa: 45 }, rapportini), 45);
  assert.equal(C.tariffaProposta({ id: 'C002', ultimaTariffa: null }, rapportini), 42);
  assert.equal(C.tariffaProposta({ id: 'C009' }, rapportini), null);
});

test('cruscotto della commessa: valore, costo, margine, ore sul budget', () => {
  const k = C.cruscotto({ id: 'P2601', budgetOre: 20, budgetEuro: null, inizio: '2026-07-01', finePrevista: '2026-08-31' },
    rapportini, { EURO_KM: 0.76, COSTO_ORARIO: '' }, '2026-07-31');
  assert.equal(k.ore, 17);
  assert.equal(k.livelloOre, 'attenzione');                 // 85% di 20 = 17
  assert.equal(k.valoreAtteso, 581.2);                      // niente budget in euro: quello maturato
  assert.equal(k.costo.lavoro, 255);                        // 17 h × 15 €/h di costo orario
  assert.equal(k.costo.auto, 91.2);                         // 120 km al costo ACI
  assert.equal(k.costo.spese, 10);
  assert.equal(k.costo.totale, 356.2);
  assert.equal(k.margine, 225);
  assert.equal(k.fatturato, 341.2);
  assert.equal(k.prontoDaFatturare, 240);
  assert.equal(k.inBozza, 0);
  assert.equal(k.giorniMancanti, 31);
});

test('cruscotto: senza costo orario il margine non si inventa', () => {
  const k = C.cruscotto({ id: 'X' }, [rapportini[2]].map(r => Object.assign({}, r, { idCommessa: 'X' })), { COSTO_ORARIO: '' });
  assert.equal(k.costo.lavoroNoto, false);
});

test('cruscotto: oltre il budget è sforato, e il budget in euro vince se è di più', () => {
  const k = C.cruscotto({ id: 'P2601', budgetOre: 10, budgetEuro: 5000 }, rapportini, { COSTO_ORARIO: 15 });
  assert.equal(k.livelloOre, 'sforato');
  assert.equal(k.valoreAtteso, 5000);
});

test('codice della prossima commessa, come nello script', () => {
  assert.equal(C.prossimoCodiceCommessa(['P2601', 'P2603', 'M001'], 'P', 2026), 'P2604');
  assert.equal(C.prossimoCodiceCommessa([], 'P', 2027), 'P2701');
});

test('settimane: dodici, la più vecchia prima, con le ore giuste', () => {
  const s = C.settimane(rapportini, 12, '2026-07-16');
  assert.equal(s.length, 12);
  assert.equal(s[11].inizio, '2026-07-13');
  assert.equal(s[11].ore, 8);
  assert.equal(s[10].ore, 0);
  assert.equal(s[9].ore, 9);   // 2 luglio, settimana del 29 giugno
});

const ana = {
  impostazioni: { RAGIONE_SOCIALE: 'Studio Tecnico GM', PARTITA_IVA: '01234567890', TECNICO: 'Manuel Gasparotto' },
  clienti: [{ id: 'C001', nome: 'Batokyo <script>', indirizzo: 'Via Roma 1' }],
  commesse: [{ id: 'P2601', descrizione: 'Magazzino' }],
};

test('PDF del rapportino: niente HTML dai dati, niente note interne, importi solo se chiesti', () => {
  const r = Object.assign({}, rapportini[0], { noteInterne: 'SEGRETO', cliente: 'Batokyo <script>', foto: [{ id: '1AbCdEfGhIjKlMn', url: 'x' }] });
  const html = D.rapportino(r, ana, {});
  assert.ok(html.includes('Batokyo &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('SEGRETO'));
  assert.ok(!html.includes('Compenso ore'));
  assert.ok(html.includes('counter(pages)'));
  assert.ok(D.rapportino(r, ana, { conImporti: true }).includes('Compenso ore'));
  assert.ok(D.rapportino(r, ana, { conFoto: true }).includes('/file/1AbCdEfGhIjKlMn'));
});

test('PDF del riepilogo: righe in ordine di data e totale giusto', () => {
  const lista = C.filtra(rapportini, { mese: '2026-07' });
  const html = D.riepilogo(lista, ana, { nome: 'Elettrodinamica', righe: [] }, 'Luglio 2026', { conImporti: true });
  assert.ok(html.indexOf('RAP/2026/0001') < html.indexOf('RAP/2026/0002'));
  assert.ok(html.includes('581,20 €'));
  assert.ok(html.includes('Luglio 2026'));
});
