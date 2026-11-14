// Nei testi delle fatture il codice del progetto al posto di quello della commessa (06/11/2026, riunione con Manuel: il
// codice della commessa va accanto al mittente nel PDF): "progetto ED-003", "progetti ED-001, ED-002". Solo se ogni
// rapportino del lavoro ha il progetto; altrimenti i testi di prima, con la commessa.
// 14/11/2026 (Andrea, col modello della parcella: nelle righe solo i Servizi): i progetti stanno in Da fatturare e nella
// causale (le Note del documento); nelle righe non ci sono piu', come non c'e' piu' niente dei rapportini.
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
  const gruppi = C.righeRapportini({ cliente: g.cliente, rapportini, spese: g.spese });
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

test('righeRapportini: coi progetti o senza, le righe sono le stesse (i progetti non stanno nelle righe)', () => {
  for (const lettera of ['A', 'B', 'C', 'D']) {
    const prima = caso(lettera).atteso.righe.map(r => r.descrizione);
    const quanti = caso(lettera).rapportini.length;
    assert.deepEqual(righeDi(caso(lettera), Array.from({ length: quanti }, (_, i) => 'ED-00' + (1 + (i % 2)))), prima, 'caso ' + lettera);
    assert.deepEqual(righeDi(caso(lettera), []), prima, 'caso ' + lettera + ' senza progetti');
  }
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
const mese = () => C.nomeMese(oggi().slice(0, 7));
const soloMese = () => C.MESI[Number(oggi().slice(5, 7)) - 1];

test('Rossi Impianti: Da fatturare e la causale col progetto, la riga col solo servizio; senza progetto la commessa', async () => {
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
  // Una fattura per un rapportino: la causale col mese e il progetto; la riga e' il servizio col mese, e basta.
  const f1 = await prepara('C002', [r1]);
  assert.equal(f1.causale, 'Prestazioni di ' + mese() + ', progetto RI-001');
  assert.equal(f1.righe[0].descrizione, 'Ore di consulenza | ' + soloMese());
  assert.deepEqual([f1.righe[0].codice, f1.righe[0].quantita, f1.righe[0].unita, f1.righe[0].prezzo], ['CON', 6, 'Ore', 45]);
  for (const r of f1.righe) assert.doesNotMatch(r.descrizione, /rapportin|RAP\/|progett|Lavoro/i, r.descrizione);
  // Due rapportini di due progetti: "progetti".
  const f2 = await prepara('C002', [r4, r2]);
  assert.equal(f2.causale, 'Prestazioni di ' + mese() + ', progetti RI-001, RI-002');
  assert.deepEqual([f2.righe[0].quantita, f2.righe[0].importo], [12, 540]);
  // Senza progetto: la commessa.
  const f3 = await prepara('C002', [r3]);
  assert.equal(f3.causale, 'Prestazioni di ' + mese() + ', commessa ' + m.id);
  assert.ok(!f3.righe[0].descrizione.includes('progett'));
});

test('Elettrodinamica: la causale coi progetti (mescolati con uno senza progetto, la commessa), la riga col solo servizio', async () => {
  const p1 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-001', descrizione: 'Quadro' })).progetto;
  const p2 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'ED-002', descrizione: 'Cabina' })).progetto;
  const base = { cliente: 'Elettrodinamica', idCommessa: '26ST001' };
  const a = await firmato(Object.assign({ idProgetto: p2.id }, base));
  const b = await firmato(Object.assign({ idProgetto: p1.id }, base));
  const c = await firmato(Object.assign({}, base));
  const d = await firmato(Object.assign({ idProgetto: p1.id }, base));
  assert.match((await voceDi('C001', a)).dettaglio, /^progetto ED-002 · 2 ore/);
  const f = await prepara('C001', [a, b]);
  assert.equal(f.causale, 'Prestazioni di ' + mese() + ', progetti ED-001, ED-002');
  assert.equal(f.righe[0].descrizione, 'Ore di consulenza | ' + soloMese());
  const g = await prepara('C001', [c, d]);
  assert.equal(g.righe[0].descrizione, 'Ore di consulenza | ' + soloMese());
  assert.equal(g.causale, 'Prestazioni di ' + mese() + ', commessa 26ST001');
});

test('la causale di più mesi: "Prestazioni di luglio e agosto 2026", a cavallo d\'anno coi due anni', () => {
  const w = s.wisper;
  assert.equal(w.elencoMesi(['2026-07']), 'luglio 2026');
  assert.equal(w.elencoMesi(['2026-07', '2026-08']), 'luglio e agosto 2026');
  assert.equal(w.elencoMesi(['2026-07', '2026-08', '2026-09']), 'luglio, agosto e settembre 2026');
  assert.equal(w.elencoMesi(['2026-12', '2027-01']), 'dicembre 2026 e gennaio 2027');
});
