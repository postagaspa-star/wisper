// Fase 5: contratti di assistenza e scadenze (fase5.md §3.5, §6, §8). Attivare (la commessa a corpo, le rate del
// canone, le scadenze delle visite, la disdetta), le rate in Da fatturare entro 15 giorni, il ticket programmato che
// nasce una volta sola 30 giorni prima, il rinnovo tacito di notte, la disdetta, Rinnova col canone nuovo solo sulle
// rate nuove, Chiudi. Le scadenze: fatta con la prossima (dalla fatta e dalla data, 31 gennaio + 1 mese = 28
// febbraio), le proposte DPR 462 dall'ambiente, togliere, il ticket chiuso che segna fatta la sua scadenza.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva } = require('./aiuto');
const { oggi, piuGiorni } = require('../src/utili');
const C = require('../src/conti');

let s;
let manuel;
let laura;
let marco;
let lettura;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
});
test.after(() => s.ferma());

const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const T = oggi();

test('le rate del canone e i mesi: rate anticipate, l\'ultima prende il resto, l\'ultimo giorno del mese', () => {
  assert.deepEqual(C.rateCanone('2027-01-01', '2027-12-31', 1200, 'semestrale'),
    [{ data: '2027-01-01', importo: 600, descrizione: 'Canone 1° semestre 2027' }, { data: '2027-07-01', importo: 600, descrizione: 'Canone 2° semestre 2027' }]);
  assert.deepEqual(C.rateCanone('2027-01-01', '2027-12-31', 1000, 'trimestrale').map(r => [r.descrizione, r.importo]),
    [['Canone 1° trimestre 2027', 250], ['Canone 2° trimestre 2027', 250], ['Canone 3° trimestre 2027', 250], ['Canone 4° trimestre 2027', 250]]);
  const mesi = C.rateCanone('2027-01-01', '2027-12-31', 100, 'mensile');
  assert.deepEqual([mesi.length, mesi[2].descrizione, mesi[0].importo, mesi[11].importo, Math.round(mesi.reduce((t, r) => t + r.importo, 0) * 100) / 100], [12, 'Canone di marzo 2027', 8.33, 8.37, 100]);
  assert.deepEqual(C.rateCanone('2025-11-01', '2026-10-31', 120, 'annuale'), [{ data: '2025-11-01', importo: 120, descrizione: 'Canone 2025-2026' }]);
  assert.deepEqual(C.rateCanone('2027-01-01', '2027-12-31', 500, 'nessuna'), []);
  assert.equal(C.piuMesi('2026-01-31', 1), '2026-02-28');
  assert.equal(C.piuMesi('2028-01-31', 1), '2028-02-29');
  assert.equal(C.piuMesi('2026-11-20', 6), '2027-05-20');
  assert.equal(C.piuMesi('2026-10-22', 60), '2031-10-22');
});

test('i contratti dei dati di esempio: CA/2026/002 in scadenza (la disdetta entro il 01/11), le rate, gli impianti con la prossima visita', async () => {
  const c = ok(await manuel('contratto', { id: 'CA/2026/002' })).contratto;
  assert.deepEqual([c.id, c.titolo, c.cliente, c.dal, c.al, c.rinnovo, c.disdettaEntro, c.copre, c.canone, c.fatturazioneCanone, c.tariffaExtra],
    [2, 'Manutenzione cabina MT Acme', 'Rossi Impianti Srl', '2026-01-01', '2026-12-31', 'tacito', '2026-11-01', 'visite_guasti', 1200, 'semestrale', 45]);
  assert.match(c.idCommessa, /^26ST\d{3}$/);
  assert.equal(c.commessa, 'Assistenza Manutenzione cabina MT Acme');
  assert.deepEqual(c.tempi, { urgente: { presa: 1, intervento: 4 } });
  assert.deepEqual(c.rate.map(r => [r.descrizione, r.data, r.importo, r.statoVisto]),
    [['Canone 1° semestre 2026', '2026-01-01', 600, 'Fatturata fuori da Wisper'], ['Canone 2° semestre 2026', '2026-07-01', 600, 'Fatturata fuori da Wisper']]);
  assert.deepEqual(c.impianti.map(i => [i.idSede, i.nome, i.ogniMesi, i.prossimaVisita]), [[4, 'Cabina MT Acme', 6, '2026-11-20']]);
  assert.deepEqual(c.documento, { id: c.documento.id, titolo: 'Contratto CA/2026/002 firmato' });
  for (const k of ['costoTicket', 'rende']) assert.ok(k in c, k);
  if (T >= '2026-10-02' && T <= '2026-11-01') assert.deepEqual([c.statoVisto, c.statoDettaglio.slice(0, 15)], ['In scadenza', 'disdetta entro ']);
  const commessa = ok(await manuel('anagrafiche')).commesse.find(m => m.id === c.idCommessa);
  assert.deepEqual([commessa.modoFatturazione, commessa.note], ['corpo', 'Dal contratto CA/2026/002']);
  // Il collaboratore li legge senza canone, tariffa, importi delle rate, costi; lettura senza pulsanti.
  const m = ok(await marco('contratto', { id: 2 })).contratto;
  for (const k of ['canone', 'tariffaExtra', 'costoTicket', 'rende']) assert.equal(k in m, false, k);
  assert.equal('importo' in m.rate[0], false);
  assert.equal(m.puoScrivere, false);
  assert.equal((await marco('salvaContratto', { contratto: { idCliente: 'C002', titolo: 'X', dal: T } })).permesso, false);
  assert.equal((await lettura('attivaContratto', { id: 2 })).permesso, false);
  assert.ok(ok(await lettura('contratti', {})).contratti.length >= 3);
});

test('salvaContratto: i controlli; attiva = commessa, rate, scadenze delle visite e della disdetta', async () => {
  const no = async (x, frase) => assert.equal((await manuel('salvaContratto', { contratto: x })).errore, frase);
  await no({ titolo: 'X', dal: T }, 'Cliente: scegli il cliente');
  await no({ idCliente: 'C004', titolo: 'X' }, 'Dal: scrivi da quando vale');
  await no({ idCliente: 'C004', titolo: 'X', dal: '2027-01-01', al: '2026-12-31' }, 'Al: deve venire dopo Dal');
  await no({ idCliente: 'C004', titolo: 'X', dal: '2027-01-01', impianti: [{ idSede: 4 }] }, 'Impianto 4 non è di Batokyo Srl');
  await no({ idCliente: 'C004', titolo: 'X', dal: '2027-01-01', canone: -1 }, 'Canone: non può essere negativo');
  await no({ idCliente: 'C004', titolo: 'X', dal: '2027-01-01', impianti: [{ idSede: 7, ogniMesi: 61 }] }, 'Ogni: da 1 a 60 mesi');
  const b = ok(await laura('salvaContratto', { contratto: { idCliente: 'C004', titolo: 'Verifiche impianto di terra', dal: '2027-01-01', canone: 900,
    fatturazioneCanone: 'semestrale', impianti: [{ idSede: 7, ogniMesi: 12, primaVisita: '2027-03-15' }] } })).contratto;
  assert.deepEqual([b.numero, b.stato, b.statoVisto, b.al, b.rinnovo, b.disdettaGiorni], ['CA/2027/001', 'bozza', 'Bozza', '2027-12-31', 'tacito', 60], 'al di base: dal + 12 mesi - 1 giorno');
  const a = ok(await laura('attivaContratto', { id: b.id })).contratto;
  assert.deepEqual([a.stato, a.commessa], ['attivo', 'Assistenza Verifiche impianto di terra']);
  assert.deepEqual(a.rate.map(r => [r.descrizione, r.data, r.importo, r.stato]), [['Canone 1° semestre 2027', '2027-01-01', 450, 'prevista'], ['Canone 2° semestre 2027', '2027-07-01', 450, 'prevista']]);
  assert.deepEqual(a.impianti.map(i => i.prossimaVisita), ['2027-03-15']);
  const scad = ok(await manuel('scadenze', { idContratto: b.id, stato: 'tutte' })).scadenze;
  assert.deepEqual(scad.map(x => [x.tipo, x.data, x.azione]).sort(), [['contratto', '2027-11-01', 'promemoria'], ['manutenzione', '2027-03-15', 'ticket']]);
  assert.equal(scad.find(x => x.tipo === 'contratto').titolo, 'Disdetta del contratto CA/2027/001');
  // In attivo canone e periodo non cambiano da qui.
  assert.equal((await manuel('salvaContratto', { contratto: { id: b.id, canone: 1000 } })).errore, 'Il contratto CA/2027/001 è attivo: canone e periodo si cambiano con Rinnova');
  ok(await manuel('salvaContratto', { contratto: { id: b.id, titolo: 'Verifiche dell\'impianto di terra', note: 'Cambiato' } }));
});

test('le rate del canone vanno in Da fatturare entro 15 giorni; la riga dice contratto e commessa', async () => {
  const b = ok(await manuel('salvaContratto', { contratto: { idCliente: 'C002', titolo: 'Assistenza quadro capannone', dal: piuGiorni(T, 10), canone: 360, fatturazioneCanone: 'trimestrale' } })).contratto;
  const a = ok(await manuel('attivaContratto', { id: b.id })).contratto;
  const df = ok(await manuel('daFatturare', { idCliente: 'C002' }));
  const voci = [].concat(...df.gruppi.map(g => g.voci));
  const prima = voci.find(v => v.tipo === 'scadenza' && v.id === a.rate[0].id);
  assert.ok(prima && prima.pronta, 'la prima rata, fra 10 giorni');
  assert.equal(voci.some(v => v.id === a.rate[1].id), false, 'la seconda fra tre mesi no');
  const f = ok(await manuel('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'scadenza', id: prima.id }] })).fattura;
  assert.equal(f.righe[0].descrizione, a.rate[0].descrizione + ': Assistenza quadro capannone (contratto ' + a.numero + ', commessa ' + a.idCommessa + ')');
  assert.equal(f.righe[0].importo, 90);
  assert.equal(ok(await manuel('contratto', { id: b.id })).contratto.rate[0].statoVisto, 'In bozza ' + f.riferimento);
  ok(await manuel('scartaFattura', { id: f.id }));
});

test('le visite: il ticket programmato nasce 30 giorni prima, una volta sola; chiuderlo segna fatta la visita e nasce la prossima', async () => {
  const b = ok(await manuel('salvaContratto', { contratto: { idCliente: 'C003', titolo: 'Pulizia pannelli', dal: piuGiorni(T, -30), canone: 0, fatturazioneCanone: 'nessuna',
    impianti: [{ idSede: 8, ogniMesi: 6, primaVisita: piuGiorni(T, 20) }] } })).contratto;
  const prima = ok(await manuel('tickets', { segmento: 'programmati' })).ticket.length;
  ok(await manuel('attivaContratto', { id: b.id }));
  const prog = ok(await manuel('tickets', { segmento: 'programmati', idContratto: b.id })).ticket;
  assert.equal(prog.length, 1, 'nato all\'attivazione: la visita e\' fra 20 giorni');
  const t = prog[0];
  assert.deepEqual([t.tipo, t.origine, t.origineNome, t.previstoIl, t.titolo, t.priorita, t.stato], ['programmato', 'scadenza', 'Da una scadenza', piuGiorni(T, 20), 'Manutenzione impianto fotovoltaico 6 kW', 'normale', 'aperto']);
  assert.equal(t.entroIntervento, piuGiorni(T, 20) + 'T23:59:59');
  assert.equal(s.wisper.db.transazione(() => s.wisper.generaTicketDaScadenze()), 0, 'una volta sola');
  assert.equal(ok(await manuel('tickets', { segmento: 'programmati' })).ticket.length, prima + 1);
  const pagina = ok(await manuel('ticket', { id: t.id })).ticket;
  assert.ok(pagina.cronologia[0].testo.startsWith('Nato dalla scadenza del '));
  assert.deepEqual(pagina.proposta, { fatturazione: 'contratto', perche: 'Nel contratto ' + b.numero + ': è una visita del contratto' });
  const scad = ok(await manuel('scadenze', { idContratto: b.id, tipo: 'manutenzione' })).entro.concat(ok(await manuel('scadenze', { idContratto: b.id, tipo: 'manutenzione' })).piuAvanti);
  assert.equal(scad[0].idTicket, t.id);
  ok(await manuel('chiudiTicket', { id: t.id, fatturazione: 'contratto' }));
  const fatte = ok(await manuel('scadenze', { idContratto: b.id, tipo: 'manutenzione', stato: 'tutte' })).scadenze;
  const fatta = fatte.find(x => x.idTicket === t.id);
  assert.equal(fatta.stato, 'fatta');
  const prossima = fatte.find(x => x.id === fatta.idProssima);
  assert.equal(prossima.data, C.piuMesi(piuGiorni(T, 20), 6), 'dalla data prevista (le visite dei contratti)');
  // Una visita oltre 30 giorni non fa nascere niente.
  const lontano = ok(await manuel('salvaContratto', { contratto: { idCliente: 'C003', titolo: 'Lontano', dal: T, canone: 0, fatturazioneCanone: 'nessuna',
    impianti: [{ idSede: 8, ogniMesi: 12, primaVisita: piuGiorni(T, 40) }] } })).contratto;
  ok(await manuel('attivaContratto', { id: lontano.id }));
  assert.equal(ok(await manuel('tickets', { segmento: 'programmati', idContratto: lontano.id })).ticket.length, 0);
});

test('rinnovo tacito di notte, disdetta, Rinnova col canone nuovo solo sulle rate nuove, Chiudi', async () => {
  const w = s.wisper;
  const vecchio = ok(await manuel('salvaContratto', { contratto: { idCliente: 'C004', titolo: 'Vecchio contratto', dal: '2025-01-01', al: '2025-12-31', canone: 600, fatturazioneCanone: 'annuale' } })).contratto;
  ok(await manuel('attivaContratto', { id: vecchio.id }));
  assert.equal(w.db.transazione(() => w.rinnoviContratti()) >= 1, true);
  const rinnovato = ok(await manuel('contratto', { id: vecchio.id })).contratto;
  assert.deepEqual([rinnovato.dal, rinnovato.al], ['2026-01-01', '2026-12-31']);
  assert.deepEqual(rinnovato.rate.map(r => r.descrizione), ['Canone 2025', 'Canone 2026']);
  assert.ok(ok(await manuel('registro', { tabella: 'contratti', idRiga: String(vecchio.id) })).righe.some(r => r.nota === 'rinnovato da solo'));
  // Disdetta: finisce ad "al", la scadenza della disdetta e' fatta.
  assert.equal((await manuel('disdiciContratto', { id: vecchio.id })).errore, 'Scrivi il motivo');
  const disdetto = ok(await manuel('disdiciContratto', { id: vecchio.id, data: T, motivo: 'Il cliente cambia fornitore' })).contratto;
  assert.deepEqual([disdetto.stato, disdetto.statoVisto, disdetto.statoDettaglio], ['disdetto', 'Disdetto', 'finisce il 31/12/2026']);
  assert.equal(w.db.transazione(() => w.rinnoviContratti()), 0, 'un disdetto non si rinnova');
  // Rinnova (senza rinnovo tacito): il canone nuovo vale per le rate nuove.
  const senza = ok(await manuel('salvaContratto', { contratto: { idCliente: 'C004', titolo: 'Senza rinnovo', dal: '2026-01-01', rinnovo: 'no', canone: 1000, fatturazioneCanone: 'annuale' } })).contratto;
  ok(await manuel('attivaContratto', { id: senza.id }));
  const nuovo = ok(await manuel('rinnovaContratto', { id: senza.id, canone: 1100 })).contratto;
  assert.deepEqual([nuovo.dal, nuovo.al, nuovo.canone], ['2027-01-01', '2027-12-31', 1100]);
  assert.deepEqual(nuovo.rate.map(r => [r.descrizione, r.importo]), [['Canone 2026', 1000], ['Canone 2027', 1100]]);
  // Chiudi: con conferma; le rate future si tolgono, le scadenze si annullano.
  const chiede = await manuel('chiudiContratto', { id: senza.id });
  assert.deepEqual([chiede.ok, chiede.serveConferma], [false, true]);
  assert.match(chiede.errore, /^Chiudo il contratto CA\/2026\/\d{3} adesso: tolgo 1 rata non ancora fatturata/);
  const chiuso = ok(await manuel('chiudiContratto', { id: senza.id, conferma: true })).contratto;
  assert.deepEqual([chiuso.stato, chiuso.rate.map(r => r.descrizione)], ['chiuso', ['Canone 2026']]);
});

// ------------------------------------------------------------------ scadenze

test('scadenze: le proposte DPR 462 dall\'ambiente, fatta con la prossima (dalla fatta e dalla data), togliere', async () => {
  // L'ambiente dell'impianto propone la periodicita' (24 mesi per cantiere, medico, incendio, esplosione; se no 60).
  ok(await manuel('salvaSede', { sede: { id: 9, ambiente: 'cantiere' } }));
  const cantiere = ok(await manuel('salvaScadenza', { scadenza: { tipo: 'verifica_terra', idSede: 9, data: '2026-12-01' } })).scadenza;
  assert.deepEqual([cantiere.titolo, cantiere.ogniMesi, cantiere.preavvisoGiorni, cantiere.dallaFatta, cantiere.azione, cantiere.idCliente],
    ['Verifica impianto di terra (DPR 462)', 24, 90, true, 'promemoria', 'C001']);
  ok(await manuel('salvaSede', { sede: { id: 9, ambiente: 'ordinario' } }));
  const ordinario = ok(await manuel('salvaScadenza', { scadenza: { tipo: 'verifica_scariche', idSede: 9, data: '2026-12-01' } })).scadenza;
  assert.deepEqual([ordinario.titolo, ordinario.ogniMesi], ['Verifica protezione dalle scariche (DPR 462)', 60]);
  // Dalla fatta: la prossima conta dal giorno in cui si e' fatta.
  const fatta = ok(await manuel('faiScadenza', { id: cantiere.id, data: '2026-11-10' }));
  assert.deepEqual([fatta.scadenza.stato, fatta.scadenza.statoVisto, fatta.scadenza.fattaIl, fatta.prossima.data], ['fatta', 'Fatta', '2026-11-10', '2028-11-10']);
  assert.equal(ok(await manuel('faiScadenza', { id: cantiere.id, data: '2026-11-10' })).prossima.id, fatta.prossima.id, 'ripetuta dalla coda: niente di nuovo');
  // Dalla data prevista: 31 gennaio + 1 mese = 28 febbraio.
  const mese = ok(await manuel('salvaScadenza', { scadenza: { titolo: 'Controllo mensile', tipo: 'altro', idCliente: 'C001', data: '2027-01-31', ogniMesi: 1, dallaFatta: false } })).scadenza;
  assert.equal(ok(await manuel('faiScadenza', { id: mese.id, data: '2027-02-03' })).prossima.data, '2027-02-28');
  // I controlli.
  const no = async (x, frase) => assert.equal((await manuel('salvaScadenza', { scadenza: x })).errore, frase);
  await no({ tipo: 'altro', idCliente: 'C001', data: T }, 'Titolo: scrivi cosa scade');
  await no({ titolo: 'X', tipo: 'altro', idCliente: 'C001' }, 'Data: scrivi quando scade');
  await no({ titolo: 'X', tipo: 'altro', idCliente: 'C001', data: T, ogniMesi: 121 }, 'Ogni: da 1 a 120 mesi');
  // Togliere: "solo questa" e la serie continua; "anche le prossime" la ferma.
  const t1 = ok(await manuel('togliScadenza', { id: ordinario.id, motivo: 'Fatta da un altro' }));
  assert.equal(t1.scadenza.statoVisto, 'Annullata');
  assert.equal(t1.prossima.data, '2031-12-01');
  const t2 = ok(await manuel('togliScadenza', { id: t1.prossima.id, motivo: 'L\'impianto è stato tolto', ancheProssime: true }));
  assert.deepEqual([t2.scadenza.ogniMesi, t2.prossima], [null, null]);
  assert.equal((await manuel('togliScadenza', { id: mese.id })).errore, 'La scadenza è già fatta: non si toglie');
});

test('scadenze: divise in scadute, nel preavviso, più avanti; il calendario con da/a; chi vede cosa', async () => {
  const r = ok(await manuel('scadenze', {}));
  assert.ok(r.scadute.some(x => x.titolo === 'Verifica protezioni SPG e SPI' && x.statoVisto === 'Scaduta' && x.giorni > 0));
  assert.ok(r.piuAvanti.concat(r.entro).some(x => x.titolo === 'Verifica impianto di terra (DPR 462)' && x.cliente === 'Batokyo Srl' && x.documento === 'Verbale verifica impianto di terra 2022'));
  for (const k of ['scadute', 'entro', 'piuAvanti']) assert.equal(r.conteggi[k], r[k].length, k);
  const cal = ok(await manuel('scadenze', { da: '2026-11-01', a: '2026-11-30' }));
  assert.ok(cal.scadenze.some(x => x.titolo === 'Disdetta del contratto CA/2026/002' && x.data === '2026-11-01'));
  assert.ok(cal.scadenze.every(x => x.data >= '2026-11-01' && x.data <= '2026-11-30'));
  // Il collaboratore (documenti 1, ticket 2) le legge; scrive solo quelle dei contratti.
  assert.ok(ok(await marco('scadenze', {})).scadute.length >= 1);
  assert.equal((await marco('salvaScadenza', { scadenza: { titolo: 'X', tipo: 'altro', idCliente: 'C001', data: T } })).permesso, false);
  assert.equal((await lettura('faiScadenza', { id: r.scadute[0].id })).permesso, false);
  const csv = Buffer.from(ok(await manuel('esporta', { cosa: 'scadenze' })).base64, 'base64').toString('utf8');
  assert.equal(csv.split('\r\n')[0], '﻿Data;Titolo;Tipo;Cliente;Impianto;Ogni (mesi);Stato;Fatta il;Documento;Ticket');
  const contratti = Buffer.from(ok(await manuel('esporta', { cosa: 'contratti' })).base64, 'base64').toString('utf8');
  assert.match(contratti.split('\r\n')[0], /;Canone;/);
  assert.equal(Buffer.from(ok(await marco('esporta', { cosa: 'contratti' })).base64, 'base64').toString('utf8').split('\r\n')[0].includes('Canone'), false);
});
