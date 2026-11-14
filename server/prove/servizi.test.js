// Servizi, indennita' e i dati del modello della parcella (1.4.0, docs/gestionale/servizi.md): il listino coi campi di
// Flextaxa, il CSV di Flextaxa, le indennita' nei lavori (conto, app vecchie, chi non vede i soldi), le righe delle
// fatture col codice e lo sconto (anche nell'XML), il modello per il PDF.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi, PNG } = require('./aiuto');
const S = require('../src/servizi');
const fatturapa = require('../src/fatturapa');
const { oggi } = require('../src/utili');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400)); return r; };

let s;
let w;
let manuel;
let marco;
test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  manuel = await s.come('manuel@esempio.it');
  marco = await s.come('marco@esempio.it');
});
test.after(() => s.ferma());

// Un CSV come quello di Flextaxa, con dati d'esempio.
const CSV = '﻿Tipo;Descrizione;Codice;Fornitore;UM;"Prezzo acquisto (senza IVA)";"Prezzo vendita (senza IVA)";Aliquota;"Prezzo vendita";Tags;Note\n' +
  'Servizio;"Indennità di trasferta | Cantiere";IND1;;Nr;"€ 0,00";"€ 250,00";22,00%;"€ 305,00";;\n' +
  'Servizio;"Consulenza tecnica ""a ore""";CON1;;Ore;"€ 20,00";"€ 1.050,50";22,00%;"€ 1.281,61";consulenza, ore;"Note; con il punto e virgola"\n' +
  'Prodotto;Termocamera;TCX;"Fornitore Esempio Srl";Pz;"€ 120,00";"€ 400,00";10,00%;"€ 440,00";;\n' +
  'Servizio;"Senza unità";SU;;;"€ 0,00";"€ 0,00";22,00%;"€ 0,00";;\n';

test('il CSV di Flextaxa: virgolette, euro all\'italiana, unità, aliquota, tag e note', () => {
  const l = S.serviziDaCsv(CSV);
  assert.equal(l.length, 4);
  assert.deepEqual(l[0], { tipo: 'servizio', nome: 'Indennità di trasferta | Cantiere', codice: 'IND1', fornitore: '', unita: 'Nr', modo: 'quantita',
    prezzoAcquisto: 0, prezzo: 250, aliquotaIva: 22, tag: [], note: '' });
  assert.deepEqual([l[1].nome, l[1].unita, l[1].modo, l[1].prezzo, l[1].tag, l[1].note], ['Consulenza tecnica "a ore"', 'Ore', 'ore', 1050.5, ['consulenza', 'ore'], 'Note; con il punto e virgola']);
  assert.deepEqual([l[2].tipo, l[2].fornitore, l[2].aliquotaIva], ['prodotto', 'Fornitore Esempio Srl', 10]);
  assert.deepEqual([l[3].unita, l[3].modo], ['A corpo', 'corpo']);
  assert.throws(() => S.serviziDaCsv('a;b\n1;2'), /Flextaxa/);
});

test('i servizi: i campi di Flextaxa in andata e ritorno, il modo dall\'unità, un servizio nuovo completo', async () => {
  const v = ok(await manuel('salvaVoceListino', { voce: { nome: 'Indennità di reperibilità', codice: 'IF1', prezzo: 500, aliquotaIva: '22,00%', unita: 'Nr',
    tipo: 'servizio', prezzoAcquisto: 0, aliquotaAcquisto: 22, fornitore: '', tag: 'notte,  Cantiere, cantiere', note: 'Solo per me' } })).voce;
  assert.deepEqual([v.nome, v.codice, v.prezzo, v.aliquotaIva, v.unita, v.modo, v.tipo, v.prezzoAcquisto, v.tag, v.note, v.immagine],
    ['Indennità di reperibilità', 'IF1', 500, 22, 'Nr', 'quantita', 'servizio', 0, ['notte', 'Cantiere'], 'Solo per me', null]);
  const ore = ok(await manuel('salvaVoceListino', { voce: { id: v.id, unita: 'Ore' } })).voce;
  assert.equal(ore.modo, 'ore');
  // Dalla 1.4.0 un servizio nuovo vuole prezzo e unita' (le app vecchie, senza aliquota, come prima).
  assert.match((await manuel('salvaVoceListino', { voce: { nome: 'X', aliquotaIva: 22, prezzo: 1 } })).errore, /^Unità di misura/);
  assert.match((await manuel('salvaVoceListino', { voce: { nome: 'X', aliquotaIva: 22, unita: 'Nr' } })).errore, /^Prezzo di vendita/);
  assert.match((await manuel('salvaVoceListino', { voce: { nome: 'X', aliquotaIva: 120, unita: 'Nr', prezzo: 1 } })).errore, /^Aliquota IVA/);
  ok(await manuel('salvaVoceListino', { voce: { nome: 'Vecchia app', modo: 'corpo' } }));
  // L'immagine: JPG o PNG fino a 1 MB, poi legata al servizio; la vede chi e' entrato.
  const img = ok(await manuel('caricaFile', { tipo: 'servizio', base64: PNG.toString('base64'), mime: 'image/png', idFile: 'serv-1', nome: 'foto.png' })).file;
  const conImg = ok(await manuel('salvaVoceListino', { voce: { id: v.id, immagine: { id: img.id } } })).voce;
  assert.deepEqual(conImg.immagine, { id: img.id, url: '/file/' + img.id });
  assert.match((await manuel('salvaVoceListino', { voce: { id: v.id, immagine: 'non-esiste' } })).errore, /^Immagine/);
  assert.match((await marco('caricaFile', { tipo: 'servizio', base64: PNG.toString('base64'), mime: 'image/png', idFile: 'serv-2' })).errore, /servizi/);
});

test('chi fa i rapportini vede i servizi senza i soldi e non li cambia', async () => {
  const l = ok(await marco('listino', {})).listino;
  const v = l.find(x => x.codice === 'IF1');
  assert.ok(v, 'Marco (collaboratore) vede i servizi per le indennità');
  assert.equal(v.prezzo, undefined);
  assert.equal(v.prezzoAcquisto, undefined);
  assert.equal((await marco('salvaVoceListino', { voce: { id: v.id, nome: 'Altro' } })).ok, false);
});

let k = 0;
const lavoro = (l, altro) => {
  const n = ++k;
  return Object.assign({ idLocale: 'si-' + n, data: oggi(), tecnico: 'Manuel Gasparotto',
    lavori: [Object.assign({ idLocale: 'si-' + n + '-1', idCliente: 'C002', descrizione: 'Riunione', oreLavoro: 2, tariffa: 40 }, l)] }, altro || {});
};

test('le indennità nel lavoro: dal servizio, corrette a mano, il conto, le app vecchie le tengono', async () => {
  const serv = ok(await manuel('listino', {})).listino.find(x => x.codice === 'IF1');
  ok(await manuel('salvaVoceListino', { voce: { id: serv.id, unita: 'Nr' } }));
  const g = lavoro({ indennita: [{ idServizio: serv.id, descrizione: 'Indennità di reperibilità | Ottobre' }, { codice: 'X9', descrizione: 'Indennità a mano', quantita: 2, prezzo: 12.345, unita: 'Nr' }] });
  const r = ok(await manuel('salvaRapportino', { rapportino: g })).rapportino;
  const l = r.lavori[0];
  assert.deepEqual(l.indennita.map(x => [x.codice, x.descrizione, x.quantita, x.unita, x.prezzo, x.importo, x.aliquotaIva]),
    [['IF1', 'Indennità di reperibilità | Ottobre', 1, 'Nr', 500, 500, 22], ['X9', 'Indennità a mano', 2, 'Nr', 12.345, 24.69, 22]]);
  assert.equal(l.importoIndennita, 524.69);
  assert.equal(l.totale, 80 + 524.69);
  // Un'app vecchia (senza il campo) salva il lavoro: le indennita' restano.
  const vecchia = Object.assign({}, g.lavori[0], { oreLavoro: 3 });
  delete vecchia.indennita;
  const r2 = ok(await manuel('salvaRapportino', { rapportino: Object.assign({}, g, { lavori: [vecchia] }) })).rapportino;
  assert.equal(r2.lavori[0].indennita.length, 2);
  assert.equal(r2.lavori[0].totale, 120 + 524.69);
  // Il cambio del prezzo nei Servizi non riscrive il lavoro.
  ok(await manuel('salvaVoceListino', { voce: { id: serv.id, prezzo: 600 } }));
  const letto = ok(await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === l.id);
  assert.equal(letto.indennita[0].prezzo, 500);
  // Elenco vuoto: tolte.
  const r3 = ok(await manuel('salvaRapportino', { rapportino: Object.assign({}, g, { lavori: [Object.assign({}, vecchia, { indennita: [] })] }) })).rapportino;
  assert.deepEqual([r3.lavori[0].indennita, r3.lavori[0].importoIndennita, r3.lavori[0].totale], [[], 0, 120]);
  // Rifiuti: descrizione, prezzo, servizio che non c'e'.
  assert.match((await manuel('salvaRapportino', { rapportino: lavoro({ indennita: [{ prezzo: 3 }] }) })).errore, /Indennità 1: scrivi la descrizione/);
  assert.match((await manuel('salvaRapportino', { rapportino: lavoro({ indennita: [{ descrizione: 'X' }] }) })).errore, /Indennità 1: scrivi il prezzo/);
  assert.match((await manuel('salvaRapportino', { rapportino: lavoro({ indennita: [{ idServizio: 99999 }] }) })).errore, /il servizio 99999 non c'è/);
});

test('chi non vede i soldi salva un lavoro con l\'indennità: il prezzo resta quello di prima o del servizio', async () => {
  const serv = ok(await manuel('listino', {})).listino.find(x => x.codice === 'IF1');
  const g = lavoro({ idCliente: 'C001', tariffa: undefined, indennita: [{ idServizio: serv.id }] });
  const r = ok(await marco('salvaRapportino', { rapportino: g })).rapportino;
  assert.equal(r.lavori[0].indennita[0].prezzo, undefined, 'Marco non vede il prezzo');
  const riga = w.db.riga('SELECT * FROM rapportini WHERE id = ?', r.lavori[0].id);
  assert.equal(JSON.parse(riga.indennita)[0].prezzo, 600, 'il prezzo del servizio');
  assert.equal(riga.importo_indennita, 600);
  ok(await manuel('salvaVoceListino', { voce: { id: serv.id, prezzo: 700 } }));
  ok(await marco('salvaRapportino', { rapportino: Object.assign({}, g, { lavori: [Object.assign({}, g.lavori[0], { indennita: [{ idServizio: serv.id, descrizione: 'Cambiata da Marco' }] })] }) }));
  const dopo = JSON.parse(w.db.riga('SELECT indennita FROM rapportini WHERE id = ?', r.lavori[0].id).indennita)[0];
  assert.deepEqual([dopo.descrizione, dopo.prezzo], ['Cambiata da Marco', 600], 'il prezzo che aveva, non quello nuovo del servizio');
});

test('fatturando: una riga per indennità col codice, l\'importo della sorgente le comprende, l\'IVA come Flextaxa', async () => {
  const g = lavoro({ idCliente: 'C003', tariffa: 50, oreLavoro: 1, indennita: [{ codice: 'IND1', descrizione: 'Indennità di trasferta | Cantiere 23/10', quantita: 1, prezzo: 280, unita: 'Nr' }] });
  const r = ok(await manuel('salvaRapportino', { rapportino: g })).rapportino;
  const id = r.lavori[0].id;
  const voce = ok(await manuel('daFatturare', { idCliente: 'C003' })).gruppi.find(x => x.idCliente === 'C003').voci.find(v => v.id === id);
  assert.equal(voce.importo, 330);
  const f = ok(await manuel('preparaFattura', { idCliente: 'C003', raggruppa: 'rapportino', voci: [{ tipo: 'rapportino', id }] })).fattura;
  const ind = f.righe.find(x => x.codice === 'IND1');
  assert.ok(ind, JSON.stringify(f.righe));
  assert.deepEqual([ind.descrizione, ind.quantita, ind.unita, ind.prezzo, ind.importo, ind.tipo], ['Indennità di trasferta | Cantiere 23/10', 1, 'Nr', 280, 280, 'compenso']);
  assert.equal(f.conti.compenso, 330);
  // Lo sconto di una riga della bozza: 48 €/h meno 40%.
  const righe = f.righe.filter(x => x.tipo !== 'bollo').map(x => ({ id: x.id }));
  righe.push({ tipo: 'compenso', codice: 'CON', descrizione: 'Consulenza tecnica a ore', quantita: 37.5, prezzo: 48, sconto: 40, unita: 'Ore' });
  const f2 = ok(await manuel('salvaFattura', { fattura: { id: f.id, righe } })).fattura;
  // Anche la riga del rapportino ha il codice CON (il suo servizio, dal 13/11): quella aggiunta è l'altra, con lo sconto.
  const sc = f2.righe.find(x => x.codice === 'CON' && x.sconto === 40);
  assert.deepEqual([sc.sconto, sc.importo], [40, 1080]);
  assert.equal(f2.conti.iva, Math.round((Math.round(50 * 22) + Math.round(280 * 22) + Math.round(1080 * 22) + Math.round(f2.conti.contributo * 22)) ) / 100);
  // L'XML col codice e lo sconto, e il lettore li ritrova.
  const p = ok(await manuel('pacchetto', { id: f.id }));
  const riga = p.modello.righe.find(x => x.codice === 'CON' && x.sconto === 40);
  assert.deepEqual([riga.sconto, riga.prezzoUnitario, riga.prezzoTotale], [40, 48, 1080]);
  const xml = Buffer.from(p.xml.base64, 'base64').toString('utf8').replace(/>\s+</g, '><');
  assert.match(xml, /<CodiceArticolo><CodiceTipo>INTERNO<\/CodiceTipo><CodiceValore>CON<\/CodiceValore><\/CodiceArticolo><Descrizione>Consulenza/);
  assert.match(xml, /<PrezzoUnitario>48\.00<\/PrezzoUnitario><ScontoMaggiorazione><Tipo>SC<\/Tipo><Percentuale>40\.00<\/Percentuale><\/ScontoMaggiorazione><PrezzoTotale>/);
  const letta = fatturapa.leggiFatturePA([{ nome: 'prova.xml', base64: p.xml.base64 }]);
  const rl = letta.documenti[0].righe.find(x => x.codice === 'CON' && x.sconto === 40);
  assert.deepEqual([rl.codice, rl.sconto, rl.prezzoTotale], ['CON', 40, 1080]);
});

test('fatturando: le indennità uguali del mese in una riga sola, la quantità dice quante volte; col nome del listino, il mese', async () => {
  // Andrea, 14/11/2026 col modello della parcella: "la quantità non è sempre 1, cambia in base a quante volte si è fatto quel lavoro".
  const serv = ok(await manuel('salvaVoceListino', { voce: { nome: 'Gettone di presenza', codice: 'GET', prezzo: 120, aliquotaIva: 22, unita: 'Nr', tipo: 'servizio' } })).voce;
  const ids = [];
  for (const indennita of [[{ idServizio: serv.id }], [{ idServizio: serv.id }], [{ idServizio: serv.id, quantita: 2 }],
    [{ idServizio: serv.id, descrizione: 'Gettone di presenza | Seduta di esempio' }]]) {
    ids.push(ok(await manuel('salvaRapportino', { rapportino: lavoro({ idCliente: 'C004', oreLavoro: 1, indennita }) })).rapportino.lavori[0].id);
  }
  const f = ok(await manuel('preparaFattura', { idCliente: 'C004', voci: ids.map(id => ({ tipo: 'rapportino', id })) })).fattura;
  const mese = require('../src/conti').MESI[Number(oggi().slice(5, 7)) - 1];
  const sue = f.righe.filter(x => x.codice === 'GET').map(x => [x.descrizione, x.quantita, x.unita, x.prezzo, x.importo]);
  assert.deepEqual(sue, [['Gettone di presenza | ' + mese, 4, 'Nr', 120, 480], ['Gettone di presenza | Seduta di esempio', 1, 'Nr', 120, 120]]);
  // Le ore dei quattro lavori in una riga; in nessuna riga c'è qualcosa dei rapportini.
  const ore = f.righe.find(x => x.unita === 'Ore');
  assert.deepEqual([ore.quantita, ore.importo], [4, 160]);
  for (const r of f.righe) assert.doesNotMatch(r.descrizione, /rapportin|RAP\/|Riunione/i, r.descrizione);
  assert.equal(f.conti.compenso, 160 + 480 + 120);
});

test('il modello per il PDF: qualifica, telefono e sito dello studio, BIC e beneficiario del conto, l\'etichetta della commessa, le note', async () => {
  ok(await manuel('salvaImpostazioni', { valori: { STUDIO_QUALIFICA: 'Perito Industriale' } }));
  const conti = ok(await manuel('conti', {})).conti;
  ok(await manuel('salvaConto', { conto: { id: conti[0].id, bic: 'abcd it m1 xxx', beneficiario: 'Mario Esempio' } }));
  assert.match((await manuel('salvaConto', { conto: { id: conti[0].id, bic: '123' } })).errore, /^BIC/);
  ok(await manuel('aggiornaCliente', { id: 'C003', campi: { etichettaCommessa: 'JOB' } }));
  const c = ok(await manuel('anagrafiche', {})).clienti.find(x => x.id === 'C003');
  assert.equal(c.etichettaCommessa, 'JOB');
  const f = ok(await manuel('fatture', {})).fatture.find(x => x.idCliente === 'C003' && x.stato === 'bozza');
  ok(await manuel('salvaFattura', { fattura: { id: f.id, causale: 'Periodo luglio e agosto' } }));
  const m = ok(await manuel('pacchetto', { id: f.id })).modello;
  assert.equal(m.prestatore.qualifica, 'Perito Industriale');
  assert.equal(m.committente.etichettaCommessa, 'JOB');
  assert.deepEqual([m.pagamento.dettagli[0].bic, m.pagamento.dettagli[0].beneficiario], ['ABCDITM1XXX', 'Mario Esempio']);
  assert.equal(m.note, 'Periodo luglio e agosto');
});
