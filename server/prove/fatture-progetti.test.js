// Nei testi delle fatture il codice del progetto al posto di quello della commessa (06/11/2026, riunione con Manuel: il
// codice della commessa va accanto al mittente nel PDF): "progetto ED-003", "progetti ED-001, ED-002". Solo se ogni
// rapportino del lavoro ha il progetto; altrimenti i testi di prima, con la commessa. I casi condivisi di
// casi-fattura.json (senza progetti) restano identici: qui gli stessi casi, coi progetti aggiunti.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG, giornoDeiPrototipi } = require('./aiuto');
const { oggi } = require('../src/utili');
const C = require('../src/conti');
const CASI = require('./casi-fattura.json');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const caso = lettera => JSON.parse(JSON.stringify(CASI.raggruppamenti.find(g => g.nome.indexOf(lettera + '.') === 0)));
const righeDi = (g, progetti) => {
  const rapportini = g.rapportini.map((r, i) => Object.assign(r, progetti[i] === undefined ? {} : { progetto: progetti[i] }));
  const gruppi = C.righeRapportini({ raggruppa: g.raggruppa, cliente: g.cliente, rapportini, spese: g.spese });
  return [].concat(...gruppi.map(x => x.righe)).map(r => r.descrizione);
};

test('progettiDi e testoProgetti: in ordine, senza doppioni (anche in minuscolo); null se uno solo non ha il progetto', () => {
  assert.deepEqual(C.progettiDi([{ progetto: 'ED-010' }, { progetto: 'ED-002' }, { progetto: 'ed-002' }]), ['ED-002', 'ED-010']);
  assert.equal(C.progettiDi([{ progetto: 'ED-001' }, { progetto: '' }]), null);
  assert.equal(C.progettiDi([]), null);
  assert.equal(C.testoProgetti(['ED-003']), 'progetto ED-003');
  assert.equal(C.testoProgetti(['ED-001', 'ED-002']), 'progetti ED-001, ED-002');
  assert.equal(C.testoProgetti(null), '');
});

test('righeRapportini: la riga del mese coi progetti (tutti) o come prima (anche uno solo senza)', () => {
  const a = caso('A');
  const prima = a.atteso.righe.map(r => r.descrizione);
  assert.deepEqual(righeDi(caso('A'), ['ED-002', 'ED-001', 'ED-002', 'ED-001', 'ED-001', 'ED-002']),
    ['Prestazioni professionali di settembre 2026, progetti ED-001, ED-002 (6 rapportini)'].concat(prima.slice(1)));
  assert.deepEqual(righeDi(caso('A'), ['ED-003', 'ED-003', 'ED-003', 'ED-003', 'ED-003', 'ED-003']),
    ['Prestazioni professionali di settembre 2026, progetto ED-003 (6 rapportini)'].concat(prima.slice(1)));
  assert.deepEqual(righeDi(caso('A'), ['ED-003', 'ED-003', 'ED-003', 'ED-003', 'ED-003']), prima, 'l\'ultimo senza progetto: come prima');
  // Gli straordinari (la riga a corpo) e i due €/km: stessa regola, le righe dei km e delle spese non cambiano.
  assert.deepEqual(righeDi(caso('D'), ['ED-001', 'ED-001']), ['Prestazioni professionali di ottobre 2026, progetto ED-001 (2 rapportini, 12 ore di cui 2 straordinarie)']);
  const c = caso('C');
  assert.deepEqual(righeDi(caso('C'), ['P1', 'P2']), ['Prestazioni professionali di gennaio 2027, progetti P1, P2 (2 rapportini)'].concat(c.atteso.righe.slice(1).map(r => r.descrizione)));
});

test('righeRapportini: un rapportino per riga, col suo progetto dopo la data', () => {
  const b = caso('B');
  const prima = b.atteso.righe.map(r => r.descrizione);
  assert.deepEqual(righeDi(caso('B'), ['ED-003']),
    ['Rapportino RAP/2026/0142 del 21/10/2026, progetto ED-003: Collaudo quadro (6,5 ore, 48 km, spese 8,40 €)'].concat(prima.slice(1)));
  assert.deepEqual(righeDi(caso('B'), ['']), prima);
  // Il caso condiviso non cambia (senza progetti).
  assert.deepEqual(righeDi(caso('B'), []), prima);
});

// ------------------------------------------------------------------ dal server: Da fatturare e la causale

let s;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

let n = 0;
async function firmato(dati) {
  const r = ok(await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'fp-' + (++n), data: oggi(), tecnico: 'Manuel Gasparotto', oreLavoro: 2, descrizione: 'Lavoro ' + n }, dati) }));
  ok(await manuel('caricaFile', { tipo: 'firma', id: r.rapportino.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'firma-fp-' + n, firmatario: 'Cliente' }));
  return r.rapportino.id;
}
const voceDi = async (idCliente, id) => (ok(await manuel('daFatturare', { idCliente })).gruppi.find(g => g.idCliente === idCliente) || { voci: [] }).voci.find(v => v.id === id);
const prepara = async (idCliente, ids) => ok(await manuel('preparaFattura', { idCliente, voci: ids.map(id => ({ tipo: 'rapportino', id })) })).fattura;

test('un rapportino per riga (Rossi Impianti): Da fatturare, la riga e la causale col progetto; senza progetto come prima', async () => {
  const m = ok(await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Linee nuove', modoFatturazione: 'ore' })).commessa;
  const p1 = ok(await manuel('creaProgetto', { idCommessa: m.id, codiceProgetto: 'RI-001', descrizione: 'Linea 1' })).progetto;
  const p2 = ok(await manuel('creaProgetto', { idCommessa: m.id, codiceProgetto: 'RI-002', descrizione: 'Linea 2' })).progetto;
  const base = { cliente: 'Rossi Impianti Srl', idCommessa: m.id, km: 40, oreLavoro: 6, tariffa: 45 };
  const r1 = await firmato(Object.assign({ idProgetto: p1.id }, base));
  const r2 = await firmato(Object.assign({ idProgetto: p2.id }, base));
  const r3 = await firmato(Object.assign({}, base));
  const r4 = await firmato(Object.assign({ idProgetto: p1.id }, base));
  // Da fatturare: "progetto RI-001 · 6 ore · 40 km" (il rimborso dei km c'e' se il cliente li paga).
  const v1 = await voceDi('C002', r1);
  assert.match(v1.dettaglio, /^progetto RI-001 · 6 ore/);
  assert.ok(!v1.dettaglio.includes(m.id));
  assert.match((await voceDi('C002', r3)).dettaglio, new RegExp('^' + m.id + ' · 6 ore'), 'senza progetto: la commessa, come prima');
  // Una fattura per un rapportino: causale e riga col progetto.
  const f1 = await prepara('C002', [r1]);
  assert.equal(f1.causale, 'Rapportino ' + r1 + ', progetto RI-001');
  assert.match(f1.righe[0].descrizione, new RegExp('^Ore di consulenza \\| Rapportino ' + r1.replace(/\//g, '\\/') + ' del \\d{2}/\\d{2}/\\d{4}, progetto RI-001: Lavoro'));
  // Due rapportini di due progetti: "progetti".
  const f2 = await prepara('C002', [r4, r2]);
  assert.equal(f2.causale, 'Prestazioni professionali, progetti RI-001, RI-002');
  // Senza progetto: come prima, con la commessa; mescolati: la commessa.
  const f3 = await prepara('C002', [r3]);
  assert.equal(f3.causale, 'Rapportino ' + r3 + ', commessa ' + m.id);
  assert.ok(!f3.righe[0].descrizione.includes('progett'));
});

test('il mese (Elettrodinamica): la riga e la causale coi progetti; mescolati con uno senza progetto, la commessa', async () => {
  const p1 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-001', descrizione: 'Quadro' })).progetto;
  const p2 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-002', descrizione: 'Cabina' })).progetto;
  const base = { cliente: 'Elettrodinamica', idCommessa: '26ST001' };
  const a = await firmato(Object.assign({ idProgetto: p2.id }, base));
  const b = await firmato(Object.assign({ idProgetto: p1.id }, base));
  const c = await firmato(Object.assign({}, base));
  const d = await firmato(Object.assign({ idProgetto: p1.id }, base));
  assert.match((await voceDi('C001', a)).dettaglio, /^progetto ED-002 · 2 ore/);
  const f = await prepara('C001', [a, b]);
  const mese = C.nomeMese(oggi().slice(0, 7));
  assert.equal(f.causale, 'Prestazioni di ' + mese + ', progetti ED-001, ED-002');
  assert.equal(f.righe[0].descrizione, 'Ore di consulenza | ' + mese + ', progetti ED-001, ED-002 (2 rapportini)');
  const g = await prepara('C001', [c, d]);
  assert.equal(g.righe[0].descrizione, 'Ore di consulenza | ' + mese + ' (2 rapportini)');
  assert.equal(g.causale, 'Prestazioni di ' + mese + ', commessa 26ST001');
});
