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

// ------------------------------------------------------------------ fase 4: i conti della fattura (casi-fattura.json)
//
// I casi condivisi con telefono (FattureTest.kt) e computer (pc/prove/fatture.test.js): ogni numero al centesimo.
// I raggruppamenti (le righe che nascono dai rapportini) li prova solo il server.

const CASI_FATTURA = require('./casi-fattura.json');

test('casi-fattura.json: i 16 casi del contratto e i casi limite del server', () => {
  assert.ok(CASI_FATTURA.casi.length >= 30, 'i 16 del contratto piu\' i casi limite');
  assert.deepEqual(CASI_FATTURA.casi.slice(0, 16).map(c => Number(c.nome.split('.')[0])), Array.from({ length: 16 }, (_, i) => i + 1));
  // I 4 della fase 4 (A-D) e il ticket della fase 5 (E, fase5.md §7.6).
  assert.equal(CASI_FATTURA.raggruppamenti.length, 5);
});

for (const c of CASI_FATTURA.casi) {
  test('fattura: ' + c.nome, () => {
    const r = C.contiFattura(Object.assign({}, CASI_FATTURA.base, c.fattura));
    for (const k of Object.keys(c.atteso)) assert.deepEqual(r[k], c.atteso[k], c.nome + ' · ' + k);
    // Il netto e' sempre il totale meno la ritenuta, e il totale la somma dei pezzi arrotondati.
    assert.equal(Math.round(r.netto * 100), Math.round(r.totale * 100) - Math.round(r.ritenuta * 100));
  });
}

for (const g of CASI_FATTURA.raggruppamenti) {
  test('righe dai rapportini: ' + g.nome, () => {
    // Fase 5: un ticket chiuso "una riga per l'intervento" fa la sua riga con righeTicket (stessi rapportini e spese).
    const gruppi = g.ticket ? C.righeTicket({ ticket: g.ticket, cliente: g.cliente, rapportini: g.rapportini, spese: g.spese, ore: g.ore || [] })
      : C.righeRapportini({ raggruppa: g.raggruppa, cliente: g.cliente, rapportini: g.rapportini, spese: g.spese });
    const righe = [].concat(...gruppi.map(x => x.righe)).map(r => ({ tipo: r.tipo, descrizione: r.descrizione, quantita: r.quantita, unita: r.unita, prezzo: r.prezzo, importo: r.importo }));
    assert.deepEqual(righe, g.atteso.righe);
    assert.equal(gruppi.reduce((t, x) => t + x.sorgenti.length, 0), g.atteso.sorgenti, 'le sorgenti');
    if (g.atteso.gruppo) assert.equal(gruppi[0].gruppo, g.atteso.gruppo);
    // L'importo delle righe e' la somma delle sorgenti (gia' arrotondate e firmate).
    const somma = gruppi.reduce((t, x) => t + x.sorgenti.reduce((u, s) => u + s.importo, 0), 0);
    assert.equal(Math.round(righe.reduce((t, r) => t + r.importo, 0) * 100), Math.round(somma * 100));
  });
}

test('righe: scadenza, spesa, anticipazione e ore coi testi dell\'accordo', () => {
  assert.deepEqual(C.rigaScadenza({ descrizione: '40% a fine progetto', importo: 1520 }, { id: '26ST003', descrizione: 'Adeguamento impianto elettrico capannone' }, 'PR/2026/012 rev. 1'),
    { tipo: 'compenso', descrizione: '40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)', quantita: 1,
      unita: '', prezzo: 1520, importo: 1520, idCommessa: '26ST003', periodoDa: '', periodoA: '' });
  assert.match(C.rigaScadenza({ descrizione: 'Saldo', importo: 10 }, { id: '26ST009', descrizione: 'Quadro' }, '').descrizione, /\(commessa 26ST009\)$/);
  assert.equal(C.rigaSpesa({ descrizione: 'Pratica di connessione', data: '2026-10-14', importo: 120, anticipazione: true }).descrizione,
    'Spesa anticipata per conto del cliente: Pratica di connessione del 14/10/2026');
  assert.equal(C.rigaSpesa({ descrizione: 'Pedaggio', data: '2026-10-14', importo: 8.4 }).descrizione, 'Pedaggio del 14/10/2026');
  const ore = C.rigaOre(4, { id: '26ST045', descrizione: 'Quadro capannone' }, 42, '2026-10');
  assert.deepEqual([ore.descrizione, ore.quantita, ore.unita, ore.prezzo, ore.importo], ['Ore di lavoro su 26ST045 Quadro capannone di ottobre 2026', 4, 'ore', 42, 168]);
  assert.deepEqual([C.rigaOre(2, { id: 'X', descrizione: 'Y' }, null, '2026-10').prezzo, C.rigaOre(2, { id: 'X', descrizione: 'Y' }, null, '2026-10').importo], [null, 0], 'senza prezzo');
});

test('IBAN (modulo 97), scadenza della fattura, giorni lavorativi per gli F24', () => {
  assert.equal(C.ibanValido('IT60 X054 2811 1010 0000 0123 456'), true);
  assert.equal(C.ibanValido('IT60X0542811101000000123457'), false, 'una cifra sbagliata');
  assert.equal(C.ibanValido('IT60X054281110100000012345'), false, 'italiano di 26 caratteri');
  assert.equal(C.ibanValido('DE89370400440532013000'), true, 'tedesco');
  assert.equal(C.scadenzaFattura('2026-10-22', 30, false), '2026-11-21');
  assert.equal(C.scadenzaFattura('2026-10-22', 30, true), '2026-11-30', 'fine mese');
  assert.equal(C.scadenzaFattura('2026-01-31', 30, true), '2026-03-31');
  assert.equal(C.pasqua(2026), '2026-04-05');
  assert.equal(C.pasqua(2027), '2027-03-28');
  assert.equal(C.primoLavorativo('2026-11-16'), '2026-11-16', 'lunedi\'');
  assert.equal(C.primoLavorativo('2026-05-16'), '2026-05-18', 'sabato: il lunedi\' dopo');
  assert.equal(C.primoLavorativo('2026-05-31'), '2026-06-01', 'il bollo del primo trimestre (31/5 domenica)');
  assert.equal(C.primoLavorativo('2026-04-06'), '2026-04-07', 'lunedi\' dell\'Angelo');
  assert.equal(C.primoLavorativo('2027-02-28'), '2027-03-01', 'il bollo del quarto trimestre');
  assert.equal(C.primoLavorativo('2026-08-16'), '2026-08-17');
});
