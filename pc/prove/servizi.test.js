// Prove del computer per i Servizi, le indennità e la veste nuova di parcella pro-forma e parcella (docs/gestionale/servizi.md).
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../ui/conti.js');
global.WisperConti = C;
const RS = require('../ui/regole-servizi.js');
const D = require('../ui/documenti.js');

const SERVIZI = [
  { id: 1, codice: 'SR', nome: 'Sopralluogo e rilievo', modo: 'corpo', unita: 'A corpo', prezzo: 350, attivo: true, tipo: 'servizio', tag: ['preventivi'] },
  { id: 2, codice: 'DL', nome: 'Direzione lavori', modo: 'ore', unita: 'h', prezzo: 45, attivo: true, tipo: 'servizio', tag: [] },
  { id: 3, codice: 'IND-TR', nome: 'Indennità di trasferta', modo: 'quantita', unita: 'Giorni', prezzo: 30, attivo: true, tipo: 'servizio', tag: ['trasferta'] },
  { id: 4, codice: '', nome: 'Indennita notturna', modo: 'ore', unita: 'Ore', prezzo: 12, attivo: true, tipo: 'servizio', fornitore: 'Nessuno' },
  { id: 5, codice: 'CAVO', nome: 'Cavo FG16', modo: 'quantita', unita: 'Km', prezzo: 1.2, attivo: false, tipo: 'prodotto' },
];

test('servizi: filtro per segmento e testo, conteggi, unità di prima', () => {
  // 13/11/2026 (Andrea: "non ci deve essere la distinzione tra servizi ed indennità"): le indennità stanno fra i servizi.
  assert.deepEqual(RS.filtraServizi(SERVIZI, { segmento: 'indennita' }).map(s => s.id), [1, 2, 3, 4, 5], 'il segmento di prima non filtra più');
  assert.deepEqual(RS.filtraServizi(SERVIZI, { segmento: 'servizi' }).map(s => s.id), [1, 2, 3, 4]);
  assert.deepEqual(RS.filtraServizi(SERVIZI, { segmento: 'prodotti' }).map(s => s.id), [5]);
  assert.deepEqual(RS.filtraServizi(SERVIZI, { testo: 'trasfer' }).map(s => s.id), [3], 'nei tag e nella descrizione');
  assert.deepEqual(RS.filtraServizi(SERVIZI, { testo: 'nessuno' }).map(s => s.id), [4], 'nel fornitore');
  assert.deepEqual(RS.contaServizi(SERVIZI.filter(s => s.attivo)), { tutti: 4, servizi: 4, prodotti: 0 }, 'Servizi e Prodotti ci sono sempre');
  assert.deepEqual(RS.contaServizi(SERVIZI), { tutti: 5, servizi: 4, prodotti: 1 });
  assert.equal(RS.unitaDi(SERVIZI[1]), 'Ore', 'la "h" di prima è Ore');
  assert.equal(RS.unitaDi({ modo: 'corpo' }), 'A corpo');
  assert.equal(RS.modoDaUnita('Giorni'), 'quantita');
  assert.equal(RS.modoDaUnita('A corpo'), 'corpo');
  assert.deepEqual(RS.tagDa('a, b c,, a'), ['a', 'b c']);
});

test('servizi: nella scelta un elenco solo, gli attivi per codice (le indennità non vengono prima)', () => {
  assert.deepEqual(RS.perIndennita(SERVIZI).map(s => s.id), [2, 3, 1, 4]);
});

test('servizi: il modulo vuole descrizione, unità e (coi soldi) il prezzo, anche 0', () => {
  assert.deepEqual(Object.keys(RS.erroreServizio({ nome: '', unita: '', prezzo: '' }, true)).sort(), ['nome', 'prezzo', 'unita']);
  assert.deepEqual(RS.erroreServizio({ nome: 'X', unita: 'Nr', prezzo: '0' }, true), {});
  assert.deepEqual(RS.erroreServizio({ nome: 'X', unita: 'Nr', prezzo: '' }, false), {}, 'senza soldi il prezzo non si chiede');
  assert.equal(RS.erroreServizio({ nome: 'X', unita: 'Nr', prezzo: 'abc' }, true).prezzo, 'Non è un numero');
  const v = RS.servizioPerSalvare({ id: 3, nome: ' Indennità ', unita: 'Giorni', prezzo: '30,50', prezzoAcquisto: '', tag: 'a, b', aliquotaIva: 10 }, true);
  assert.deepEqual([v.id, v.nome, v.modo, v.prezzo, v.prezzoAcquisto, v.tag, v.aliquotaIva], [3, 'Indennità', 'quantita', 30.5, null, ['a', 'b'], 10]);
  assert.ok(!('prezzo' in RS.servizioPerSalvare({ nome: 'X', unita: 'Nr', prezzo: '5' }, false)), 'senza soldi il prezzo non parte');
});

test('indennità: dal servizio, il controllo, l\'importo al centesimo, la riga', () => {
  const x = RS.indennitaDaServizio(SERVIZI[2]);
  assert.deepEqual([x.idServizio, x.codice, x.descrizione, x.quantita, x.unita, x.prezzo], [3, 'IND-TR', 'Indennità di trasferta', 1, 'Giorni', 30]);
  assert.equal(RS.erroreIndennita(Object.assign({}, x, { quantita: '' }), true).quantita, 'Scrivi la quantità');
  assert.equal(RS.erroreIndennita(Object.assign({}, x, { descrizione: '' }), true).descrizione, 'Scrivi la descrizione');
  const s = RS.indennitaPerSalvare(Object.assign({}, x, { quantita: '2,5', prezzo: '30,333' }), true);
  assert.equal(s.importo, 75.83);
  assert.equal(RS.rigaIndennita(s, true), 'IND-TR Indennità di trasferta · 2,5 Giorni · 75,83 €');
  assert.equal(RS.rigaIndennita(s, false), 'IND-TR Indennità di trasferta · 2,5 Giorni');
  const senza = RS.indennitaPerSalvare(Object.assign({}, x, { prezzo: 99 }), false);
  assert.equal(senza.prezzo, 99, 'senza soldi il prezzo resta quello che c\'era (lo decide il server)');
});

test('indennità: nel conto del lavoro e nei totali', () => {
  const r = { oreLavoro: 4, oreExtra: 0, oreViaggio: 0, km: 0, spese: 10, tariffa: 50, indennita: [{ quantita: 2, prezzo: 30 }, { quantita: '', prezzo: 12.345 }] };
  const conto = C.calcola(r, { tariffaFissa: null, pagaViaggio: false, kmRimborsati: false, euroKm: 0, maggExtra: 0 });
  assert.equal(conto.importoIndennita, 72.35);
  assert.equal(conto.totale, 200 + 10 + 72.35);
  const t = C.totali([Object.assign({}, r, conto), { totale: 5, importoIndennita: 3 }]);
  assert.equal(t.indennita, 75.35);
});

const MODELLO = {
  riferimento: 'W-15', tipoDocumento: 'TD06', dataProposta: '2026-10-22', data: '2026-10-24', numero: '24',
  prestatore: { denominazione: 'Studio Tecnico GM', qualifica: 'Perito industriale', partitaIva: '03123456786', codiceFiscale: '03123456786', sede: { indirizzo: 'Via Roma 1', cap: '36063', comune: 'Marostica', provincia: 'VI', nazione: 'IT' },
    email: 'studio@esempio.it', pec: 'studio@pec.esempio.it', telefono: '0424 000 000', sito: 'www.esempio.it' },
  committente: { denominazione: 'Rossi Impianti Srl', partitaIva: '04455667784', sede: { indirizzo: 'Via Nuova 3', cap: '36061', comune: 'Bassano del Grappa', provincia: 'VI', nazione: 'IT' }, etichettaCommessa: 'JOB' },
  commesse: ['26ST003'],
  righe: [
    { codice: 'DL', descrizione: 'Direzione lavori', quantita: 10, unitaMisura: 'Ore', prezzoUnitario: 45, sconto: 40, prezzoTotale: 270, aliquotaIva: 22, natura: '' },
    { codice: 'SOPR', descrizione: 'Sopralluogo (compreso)', quantita: 1, unitaMisura: 'Nr', prezzoUnitario: 0, sconto: 0, prezzoTotale: 0, aliquotaIva: 22, natura: '' },
    { codice: '', descrizione: 'Spese anticipate', quantita: 1, unitaMisura: '', prezzoUnitario: 52, sconto: 0, prezzoTotale: 52, aliquotaIva: 0, natura: 'N1' },
  ],
  cassa: { tipo: 'TC17', aliquota: 5, imponibile: 270, importo: 13.5, aliquotaIva: 22 },
  ritenuta: { tipo: 'RT01', aliquota: 20, importo: 54 },
  riepilogo: [{ aliquotaIva: 22, natura: '', imponibile: 283.5, imposta: 62.37 }, { aliquotaIva: 0, natura: 'N1', imponibile: 52, imposta: 0 }],
  totaleDocumento: 397.87, nettoAPagare: 343.87,
  pagamento: { dettagli: [{ modalita: 'MP05', scadenza: '2026-11-21', importo: 343.87, iban: 'IT60X0542811101000000123456', bic: 'BPMOIT22XXX', beneficiario: 'Studio Tecnico GM' }] },
  note: 'Prestazioni di ottobre.',
};
const testo = html => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/\s+/g, ' ');

test('parcella: la veste del modello, numero dell\'XML, JOB, sconto, riepilogo, pagamento, note, piè', () => {
  const html = D.parcella(MODELLO, { impostazioni: { RAGIONE_SOCIALE: 'Studio Tecnico GM', PARTITA_IVA: '03123456786' } });
  const t = testo(html);
  for (const pezzo of ['Parcella N. 24 / 2026 24/10/2026 · Valuta EUR (€)', 'Mittente Studio Tecnico GM Perito industriale Via Roma 1 - 36063 Marostica (VI) - Italia',
    'P.IVA: IT03123456786 | C.F.: 03123456786', 'PEO: studio@esempio.it', 'Telefono: 0424 000 000 | Web: www.esempio.it', 'Spett.le Rossi Impianti Srl', 'JOB: 26ST003',
    'Codice Descrizione Q.tà U.M. Unit. € Sconto IVA Totale €', 'DL Direzione lavori 10,00 Ore 45,00 40,00% 22,00% 270,00', 'SOPR Sopralluogo (compreso) 1,00 Nr 0,00 0,00% 22,00% 0,00',
    'Spese anticipate 1,00 52,00 0,00% N1 52,00', 'Modalità: BONIFICO', 'Scadenza: 21/11/2026', 'Importo in scadenza: 343,87 €', 'Beneficiario: Studio Tecnico GM', 'BIC/SWIFT: BPMOIT22XXX',
    'Imponibile 270,00 €', 'Totale rivalsa (5% EPPI) 13,50 €', 'Spese 52,00 €', 'Totale IVA 62,37 €', 'Totale documento 397,87 €', 'Ritenuta d\'acconto (RT01) -54,00 €',
    'Totale ritenute -54,00 €', 'Importo dovuto 343,87 €', 'Note Prestazioni di ottobre.']) {
    assert.ok(t.includes(pezzo), 'manca: ' + pezzo);
  }
  assert.ok(html.includes('@bottom-right { content: "Parcella n. 24 · Pagina " counter(page) " / " counter(pages)'), 'il piè a destra');
  assert.ok(html.includes('@bottom-left { content: "Studio Tecnico GM · P.IVA 03123456786"'), 'il piè a sinistra');
  assert.ok(!t.includes('senza valore fiscale'));
  assert.ok(testo(D.parcella(Object.assign({}, MODELLO, { tipoDocumento: 'TD01' }), {})).includes('Fattura N. 24 / 2026'));
  assert.ok(testo(D.parcella(Object.assign({}, MODELLO, { numero: '7/2026' }), {})).includes('N. 7 / 2026'));
});

test('parcella pro-forma: stesso corpo, "Rif. W-15", la frase senza valore fiscale nelle note, Commessa di base', () => {
  const m = Object.assign({}, MODELLO, { data: '', numero: '', committente: Object.assign({}, MODELLO.committente, { etichettaCommessa: '' }) });
  const t = testo(D.avvisoParcella(m, {}));
  for (const pezzo of ['Parcella pro-forma Rif. W-15 22/10/2026 · Valuta EUR (€)', 'Commessa: 26ST003', 'Importo dovuto 343,87 €',
    'Note Prestazioni di ottobre. Documento senza valore fiscale: la fattura si emette al pagamento.']) {
    assert.ok(t.includes(pezzo), 'manca: ' + pezzo);
  }
  assert.ok(D.avvisoParcella(m, {}).includes('content: "Parcella pro-forma W-15 · Pagina "'));
});

test('rapportino e riepilogo: le indennità sotto il lavoro e nel conto', () => {
  const imp = { RAGIONE_SOCIALE: 'Studio Tecnico GM', PARTITA_IVA: '03123456786' };
  const ana = { impostazioni: imp, clienti: [{ id: 'C002', nome: 'Rossi Impianti Srl' }], commesse: [], soggetti: [{ id: 'C002', nome: 'Rossi Impianti Srl' }] };
  const r = { id: 'RAP/2026/0006', data: '2026-10-16', stato: 'BOZZA', idCliente: 'C002', cliente: 'Rossi Impianti Srl', idCommessa: '26ST002', descrizione: 'Verifica',
    oreLavoro: 4, oreExtra: 0, oreViaggio: 0, km: 0, spese: 0, tariffa: 45, compensoOre: 180, rimborsoKm: 0, importoIndennita: 60, totale: 240,
    indennita: [{ codice: 'IND-TR', descrizione: 'Indennità di trasferta', quantita: 2, unita: 'Giorni', prezzo: 30 }] };
  const html = D.riepilogo([r], ana, { nome: 'Rossi', righe: [] }, 'ottobre 2026', { conImporti: true });
  assert.ok(html.includes('<div class="sotto-riga">Indennità: IND-TR Indennità di trasferta, 2 Giorni</div>'));
  assert.ok(html.includes('<tr><td>Indennità</td><td class="n">60,00 €</td></tr>'));
  const senza = D.riepilogo([Object.assign({}, r, { indennita: [], importoIndennita: 0, totale: 180 })], ana, { nome: 'Rossi', righe: [] }, 'ottobre 2026', { conImporti: true });
  assert.ok(!senza.includes('Indennità'), 'senza indennità il foglio resta com\'era');
});
