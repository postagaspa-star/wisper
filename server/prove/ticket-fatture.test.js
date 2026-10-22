// Fase 5: da ticket a Da fatturare (fase5.md §3.4, §7.6). Finche' il ticket e' aperto i suoi rapportini non
// compaiono; chiuso "una riga per l'intervento" e' una voce sola che riserva ticket, rapportino e spesa con lo stesso
// indice unico della fase 4 (lo stesso rapportino non entra in un'altra bozza); emessa: rapportino FATTURATO e
// fatturato_il del ticket; la nota di credito libera tutto. "separati": le voci di sempre (il mese di Elettrodinamica);
// "contratto": niente, tranne le spese al cliente se i materiali non sono compresi; "no": niente, con la conferma per le spese.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG } = require('./aiuto');
const { oggi } = require('../src/utili');

let s;
let manuel;
let marco;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  marco = await s.come('marco@esempio.it');
});
test.after(() => s.ferma());

const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const vociDi = (df, id) => [].concat(...df.gruppi.filter(g => g.idCliente === id).map(g => g.voci));
const daFatturare = async id => ok(await manuel('daFatturare', id ? { idCliente: id } : {}));
const firma = (chi, id) => chi('caricaFile', { tipo: 'firma', id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'firma-' + id, firmatario: 'Il cliente' });

test('ticket risolto: i suoi rapportini e le sue spese non compaiono in Da fatturare (aspettano la chiusura)', async () => {
  const t12 = ok(await manuel('ticket', { id: 12 })).ticket;
  const rap = t12.rapportini[0].id;
  const df = await daFatturare();
  const tutte = [].concat(...df.gruppi.map(g => g.voci), df.piuAvanti);
  assert.equal(tutte.some(v => v.id === rap), false, 'il rapportino aspetta');
  assert.equal(tutte.some(v => v.tipo === 'ticket' && v.id === 'TK/2026/0012'), false, 'il ticket non e\' chiuso');
  const r = ok(await manuel('rapportini', { idTicket: 12, tutti: true })).rapportini[0];
  assert.deepEqual([r.ticketAperto, r.nonSiFattura], [true, '']);
});

test('chiuso "una riga per l\'intervento": la voce, la bozza con le sorgenti del gruppo, l\'indice unico, emessa, nota di credito', async () => {
  const chiuso = ok(await manuel('chiudiTicket', { id: 12, fatturazione: 'ticket' }));
  assert.deepEqual([chiuso.ticket.stato, chiuso.ticket.fatturazione], ['chiuso', 'ticket']);
  assert.deepEqual(chiuso.daFatturare, { tipo: 'ticket', id: 'TK/2026/0012', importo: 126.74, pronta: true, perche: '', gruppo: 'ticket:TK/2026/0012' });
  assert.ok(chiuso.ticket.cronologia.some(e => e.testo === 'Chiuso: una riga per l\'intervento'));
  const rap = chiuso.ticket.rapportini[0].id;
  const voce = vociDi(await daFatturare('C003'), 'C003').find(v => v.tipo === 'ticket');
  assert.ok(voce, 'la voce del ticket');
  assert.deepEqual([voce.id, voce.titolo, voce.importo, voce.pronta, voce.aCorpo, voce.gruppo], ['TK/2026/0012', 'Inverter in errore di isolamento', 126.74, true, false, 'ticket:TK/2026/0012']);
  assert.equal(voce.data, '2026-10-21');
  assert.equal(voce.dettaglio, 'Impianto fotovoltaico 6 kW · 1 rapportino · 2 ore · 24 km · materiale 18,50 €');
  assert.deepEqual(voce.dentro.map(x => x.tipo), ['rapportino', 'spesa']);
  assert.equal(vociDi(await daFatturare('C003'), 'C003').some(v => v.id === rap), false, 'il rapportino sta dentro la voce del ticket');
  // La bozza: una riga, le sorgenti (ticket, rapportino, spesa) tutte col gruppo del ticket.
  const f = ok(await manuel('preparaFattura', { idCliente: 'C003', voci: [{ tipo: 'ticket', id: 'TK/2026/0012' }] })).fattura;
  const compensi = f.righe.filter(r => r.tipo === 'compenso');
  assert.equal(compensi.length, 1);
  assert.equal(compensi[0].descrizione, 'Intervento TK/2026/0012 del 21/10/2026: Inverter in errore di isolamento - Impianto fotovoltaico 6 kW (2 ore, 24 km, materiale e spese 18,50 €, commessa 26ST006)');
  assert.deepEqual([compensi[0].importo, f.conti.compenso, f.conti.contributo, f.conti.iva, f.conti.totale, f.conti.ritenuta], [126.74, 126.74, 6.34, 29.28, 162.36, 0]);
  assert.equal(f.causale, 'Intervento TK/2026/0012, commessa 26ST006');
  const sorgenti = s.wisper.db.righe('SELECT tipo, sorgente_id, gruppo FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1 ORDER BY id', f.id);
  assert.deepEqual(sorgenti.map(x => x.tipo), ['ticket', 'rapportino', 'spesa']);
  assert.ok(sorgenti.every(x => x.gruppo === 'ticket:TK/2026/0012'));
  // Lo stesso rapportino non entra in un'altra bozza: le frasi della fase 4, e l'indice del database.
  const altra = await manuel('preparaFattura', { idCliente: 'C003', voci: [{ tipo: 'rapportino', id: rap }] });
  assert.equal(altra.errore, rap + ' è già nella bozza ' + f.riferimento + ' per Mario Bianchi');
  assert.throws(() => s.wisper.db.esegui("INSERT INTO fattura_sorgenti (fattura_id, gruppo, tipo, sorgente_id, attiva) VALUES (?, 'x', 'rapportino', ?, 1)", f.id, rap), /UNIQUE/);
  assert.throws(() => s.wisper.db.esegui("INSERT INTO fattura_sorgenti (fattura_id, gruppo, tipo, sorgente_id, attiva) VALUES (?, 'x', 'ticket', 'TK/2026/0012', 1)", f.id), /UNIQUE/);
  // Riservato: il ticket non si riapre, non riceve rapportini.
  assert.equal((await manuel('riapriTicket', { id: 12, motivo: 'x' })).errore, 'Il ticket TK/2026/0012 è nella bozza ' + f.riferimento + ' per Mario Bianchi: toglilo prima dalla bozza');
  assert.ok(ok(await manuel('ticket', { id: 12 })).ticket.riservata === f.riferimento);
  // Emessa: il rapportino diventa FATTURATO, il ticket ha fatturato_il.
  ok(await manuel('segnaEmessa', { id: f.id, numero: '60/2026', data: '2026-10-23', conferma: true }));
  const dopo = ok(await manuel('ticket', { id: 12 })).ticket;
  assert.deepEqual([dopo.fatturatoIl, dopo.riservata, dopo.rapportini[0].stato], ['2026-10-23', '60/2026', 'FATTURATO']);
  assert.equal((await manuel('riapriTicket', { id: 12, motivo: 'x' })).errore, 'Il ticket TK/2026/0012 è nella fattura 60/2026: per cambiarlo serve una nota di credito');
  // La nota di credito che storna tutto libera tutto il gruppo.
  const nota = ok(await manuel('preparaNotaCredito', { idFattura: f.id, tutta: true, motivo: 'Errore di cliente' })).fattura;
  ok(await manuel('segnaEmessa', { id: nota.id, numero: '61/2026', data: '2026-10-24', conferma: true }));
  const libero = ok(await manuel('ticket', { id: 12 })).ticket;
  assert.deepEqual([libero.fatturatoIl, libero.riservata], ['', null]);
  assert.equal(libero.rapportini[0].stato, 'FIRMATO', 'di nuovo firmato (non era stato inviato)');
  assert.ok(vociDi(await daFatturare('C003'), 'C003').some(v => v.tipo === 'ticket' && v.id === 'TK/2026/0012'), 'torna da fatturare');
});

test('"Con gli altri rapportini": le voci di sempre (il mese di Elettrodinamica)', async () => {
  ok(await manuel('riprendiTicket', { id: 11 }));
  const r = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'tk11-rap', idTicket: 11, idCliente: 'C001', data: oggi(), descrizione: 'Aggiunta l\'uscita al PLC', oreLavoro: 2, km: 52 } })).rapportino;
  ok(await firma(manuel, r.id));
  const t = ok(await manuel('ticket', { id: 11 })).ticket;
  assert.deepEqual(t.proposta, { fatturazione: 'separati', perche: 'Elettrodinamica ha la tariffa fissa: il mese resta una riga' });
  assert.equal(vociDi(await daFatturare('C001'), 'C001').some(v => v.id === r.id), false, 'prima della chiusura no');
  ok(await manuel('chiudiTicket', { id: 11, fatturazione: 'separati' }));
  const voce = vociDi(await daFatturare('C001'), 'C001').find(v => v.id === r.id);
  assert.ok(voce, 'dopo la chiusura e\' un rapportino come gli altri');
  assert.equal(voce.gruppo, 'rapportini:C001:' + oggi().slice(0, 7));
});

test('"Nel contratto": niente da fatturare, tranne le spese al cliente quando i materiali non sono compresi', async () => {
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', idSede: 4, titolo: 'Relè di protezione da sostituire', responsabileId: 1 } })).ticket;
  assert.equal(t.idContratto, 2);
  const r = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'contr-rap', idTicket: t.id, idCliente: 'C002', idCommessa: t.idCommessa, data: oggi(), tariffa: 45, oreLavoro: 3 } })).rapportino;
  ok(await firma(manuel, r.id));
  const spesa = ok(await manuel('salvaSpesa', { spesa: { idTicket: t.id, data: oggi(), importo: 64, categoria: 'materiale', descrizione: 'Relè nuovo' } })).spesa;
  assert.equal(spesa.destinazione, 'cliente');
  assert.deepEqual(ok(await manuel('ticket', { id: t.id })).ticket.proposta, { fatturazione: 'contratto', perche: 'Nel contratto CA/2026/002: copre visite e guasti' });
  ok(await manuel('chiudiTicket', { id: t.id, fatturazione: 'contratto' }));
  const voci = vociDi(await daFatturare('C002'), 'C002');
  assert.equal(voci.some(v => v.id === r.id), false, 'il rapportino no');
  assert.ok(voci.some(v => v.tipo === 'spesa' && v.id === spesa.id), 'la spesa al cliente si (materiali non compresi)');
  const rr = ok(await manuel('rapportini', { idTicket: t.id, tutti: true })).rapportini[0];
  assert.deepEqual([rr.nonSiFattura, rr.ticketAperto], ['Nel contratto CA/2026/002', false]);
  // Con i materiali compresi la spesa resta fuori.
  ok(await manuel('salvaContratto', { contratto: { id: 2, materialiInclusi: true } }));
  assert.equal(vociDi(await daFatturare('C002'), 'C002').some(v => v.tipo === 'spesa' && v.id === spesa.id), false);
  ok(await manuel('salvaContratto', { contratto: { id: 2, materialiInclusi: false } }));
  // Chiudere "nel contratto" vuole il contratto.
  const senza = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C001', titolo: 'Senza contratto' } })).ticket;
  assert.equal((await manuel('chiudiTicket', { id: senza.id, fatturazione: 'contratto' })).errore, 'Il ticket non è legato a un contratto');
});

test('"Non si fattura": il motivo, la conferma per le spese al cliente; "una riga" senza niente da fatturare', async () => {
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', idSede: 5, titolo: 'In garanzia', responsabileId: 1 } })).ticket;
  ok(await manuel('salvaSpesa', { spesa: { idTicket: t.id, data: oggi(), importo: 18.5, categoria: 'materiale', descrizione: 'Fusibili' } }));
  assert.equal((await manuel('chiudiTicket', { id: t.id, fatturazione: 'no' })).errore, 'Scrivi perché non si fattura');
  const chiede = await manuel('chiudiTicket', { id: t.id, fatturazione: 'no', motivo: 'Garanzia' });
  assert.deepEqual([chiede.ok, chiede.serveConferma, chiede.errore], [false, true, 'Ci sono 18,50 € di spese segnate al cliente: con «Non si fattura» restano fuori dalla fattura. Chiudo lo stesso?']);
  const fatto = ok(await manuel('chiudiTicket', { id: t.id, fatturazione: 'no', motivo: 'Garanzia', conferma: true })).ticket;
  assert.deepEqual([fatto.stato, fatto.motivoNo, fatto.statoDettaglio], ['chiuso', 'Garanzia', 'non si fattura']);
  assert.equal(vociDi(await daFatturare('C002'), 'C002').some(v => v.tipo === 'spesa' && v.titolo === 'Fusibili'), false);
  const vuoto = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', titolo: 'Al telefono', responsabileId: 1 } })).ticket;
  assert.equal((await manuel('chiudiTicket', { id: vuoto.id, fatturazione: 'ticket' })).errore, 'Non c\'è niente da fatturare: scrivi un prezzo a corpo o scegli Non si fattura');
  // A corpo: la riga col prezzo, chiusa direttamente da aperto o in carico (l'assistenza al telefono).
  const corpo = ok(await manuel('chiudiTicket', { id: vuoto.id, fatturazione: 'ticket', prezzoCorpo: 50 }));
  assert.deepEqual([corpo.ticket.prezzoCorpo, corpo.daFatturare.importo], [50, 50]);
  assert.ok(corpo.ticket.risoltoIl, 'la chiusura diretta mette anche risolto_il');
  const f = ok(await manuel('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'ticket', id: vuoto.numero }] })).fattura;
  assert.match(f.righe[0].descrizione, /^Intervento TK\/\d{4}\/\d{4} del \d{2}\/\d{2}\/\d{4}: Al telefono \(a corpo\)$/);
  ok(await manuel('scartaFattura', { id: f.id }));
});

test('un rapportino da firmare: si chiude lo stesso, la voce resta in Più avanti finché non è firmato', async () => {
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C003', idSede: 8, titolo: 'Controllo stringhe', responsabileId: 1 } })).ticket;
  const r = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'piu-avanti', idTicket: t.id, idCliente: 'C003', data: oggi(), tariffa: 45, oreLavoro: 1 } })).rapportino;
  const chiuso = ok(await manuel('chiudiTicket', { id: t.id, fatturazione: 'ticket' }));
  assert.deepEqual([chiuso.daFatturare.pronta, chiuso.daFatturare.perche], [false, r.id + ' da far firmare']);
  const df = await daFatturare('C003');
  const voce = df.piuAvanti.find(v => v.id === t.numero);
  assert.deepEqual([voce.tipo, voce.pronta, voce.perche, voce.cliente], ['ticket', false, r.id + ' da far firmare', 'Mario Bianchi']);
  assert.equal((await manuel('preparaFattura', { idCliente: 'C003', voci: [{ tipo: 'ticket', id: t.numero }] })).errore, 'Il ticket ' + t.numero + ' non è ancora pronto: ' + r.id + ' da far firmare');
  ok(await firma(manuel, r.id));
  assert.ok(vociDi(await daFatturare('C003'), 'C003').some(v => v.id === t.numero && v.pronta));
});

test('fatturato fuori da Wisper (i dati di esempio: TK/2026/0010) e il permesso dei soldi', async () => {
  const t10 = ok(await manuel('ticket', { id: 10 })).ticket;
  assert.ok(t10.fatturatoIl);
  assert.equal(t10.rapportini[0].stato, 'FATTURATO');
  assert.equal((await manuel('riapriTicket', { id: 10, motivo: 'x' })).errore, 'Il ticket TK/2026/0010 è già fatturato fuori da Wisper');
  ok(await manuel('segnaFatturataFuori', { voci: [{ tipo: 'ticket', id: 'TK/2026/0010' }], annulla: true }));
  const t = ok(await manuel('ticket', { id: 10 })).ticket;
  assert.deepEqual([t.fatturatoIl, t.rapportini[0].stato], ['', 'FIRMATO']);
  assert.ok(vociDi(await daFatturare('C002'), 'C002').some(v => v.tipo === 'ticket' && v.id === 'TK/2026/0010'));
  // Il collaboratore non vede Da fatturare (fase 4) e non chiude.
  assert.equal((await marco('daFatturare', {})).permesso, false);
});
