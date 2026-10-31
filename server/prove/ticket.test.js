// Fase 5: i ticket (fase5.md §7, §9, §11.2). La matrice della priorita' (casi-ticket.json), i tempi, tutti i
// passaggi di §7.1 e i rifiuti, presa in carico / intervento / risoluzione, la pianificazione nel calendario della
// fase 2 (sovrapposizioni), il rapportino col ticket (il numero nel campo Ticket solo se vuoto, il PDF di sempre),
// il ticket e il rapportino nati senza rete, cosa vede e cosa fa il collaboratore, storico, statistiche, esportazione.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG, giornoDeiPrototipi } = require('./aiuto');
// I ticket chiusi di ottobre, la manutenzione del 20/11 e il contratto CA/2026/002 (fino al 31/12/2026) hanno date
// fisse (la storia del prototipo): queste prove le guardano dal giorno del prototipo, giovedi' 22/10/2026, qualunque
// giorno sia (anche con WISPER_OGGI_PROVA). Le altre prove girano sul giorno vero.
giornoDeiPrototipi();
const C = require('../src/conti');
const { istante, dataOraIso, oggi, piuGiorni } = require('../src/utili');
const CASI = require('./casi-ticket.json');
const Documenti = require('../../pc/ui/documenti.js');

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

const MARCO = 3;
const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const ticket = async (chi, id) => ok(await chi('ticket', { id })).ticket;

// ------------------------------------------------------------------ priorita' e tempi

test('priorità: la matrice di casi-ticket.json (nove casi e senza risposte)', () => {
  assert.equal(CASI.priorita.length, 10);
  for (const c of CASI.priorita) assert.equal(C.prioritaDa(c.impatto, c.urgenza), c.atteso, c.impatto + ' + ' + c.urgenza);
});

test('priorità: Cambia la scrive a mano e le risposte restano; senza risposte normale', async () => {
  const x = CASI.cambia;
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', titolo: 'Prova del Cambia', impatto: x.impatto, urgenza: x.urgenza, priorita: x.priorita } })).ticket;
  for (const k of Object.keys(x.atteso)) assert.deepEqual(t[k], x.atteso[k], k);
  const n = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', titolo: 'Senza risposte' } })).ticket;
  assert.deepEqual([n.priorita, n.prioritaAMano, n.prioritaNome], ['normale', false, 'Normale']);
  // Cambiare le risposte di un ticket con la priorita' scritta a mano non la tocca; tornare all'automatica si', con priorita: ''.
  assert.equal(ok(await manuel('salvaTicket', { ticket: { id: t.id, urgenza: 'quando_si_puo' } })).ticket.priorita, 'bassa');
  assert.equal(ok(await manuel('salvaTicket', { ticket: { id: t.id, urgenza: 'presto', priorita: '' } })).ticket.priorita, 'alta');
});

test('tempi: ore di calendario da TICKET_TEMPI e dai tempi del contratto', async () => {
  const w = s.wisper;
  assert.deepEqual(w.tempiTicket(null), CASI.tempi.studio);
  const contratto = ok(await manuel('salvaContratto', { contratto: { idCliente: 'C001', titolo: 'Tempi di prova', dal: '2027-01-01', tempi: { urgente: { presa: 0.5, intervento: 2 } } } })).contratto;
  for (const c of CASI.tempi.casi) {
    const e = w.entroTicket({ tipo: 'guasto', priorita: c.priorita, aperto_il: istante(new Date(c.apertoIl)), contratto_id: c.contratto ? contratto.id : null });
    assert.deepEqual({ entroPresa: dataOraIso(e.entro_presa), entroIntervento: dataOraIso(e.entro_intervento) }, c.atteso, c.apertoIl + ' ' + c.priorita);
  }
  // Un programmato: entro la fine del giorno previsto, niente presa.
  const p = w.entroTicket({ tipo: 'programmato', priorita: 'normale', aperto_il: istante(), previsto_il: '2026-11-20' });
  assert.deepEqual([p.entro_presa, dataOraIso(p.entro_intervento)], ['', '2026-11-20T23:59:59']);
});

// ------------------------------------------------------------------ i dati di esempio

test('i dati di esempio: TK/2026/0014 urgente sulla cabina, i conteggi, l\'ordine degli aperti', async () => {
  const r = ok(await manuel('tickets', {}));
  assert.ok(r.adesso);
  const t14 = r.ticket.find(t => t.numero === 'TK/2026/0014');
  assert.ok(t14);
  assert.deepEqual([t14.priorita, t14.stato, t14.statoVisto, t14.impianto, t14.contratto, t14.cliente, t14.responsabileId, t14.puoPrendere],
    ['urgente', 'aperto', 'Aperto', 'Cabina MT Acme', 'CA/2026/002', 'Rossi Impianti Srl', null, true]);
  assert.equal(r.ticket[0].numero, 'TK/2026/0014', 'in cima l\'urgente che nessuno ha preso');
  assert.equal(t14.inRitardo, true, 'aperto da 85 minuti: la presa (1 ora) e\' scaduta');
  assert.match(t14.ritardo, /^Da prendere da \d+ minuti$/);
  for (const k of ['aperti', 'urgenti', 'nonAssegnati', 'inRitardo', 'risoltiDaChiudere', 'programmatiDaPianificare']) assert.equal(typeof r.conteggi[k], 'number', k);
  assert.ok(r.conteggi.urgenti >= 1);
  assert.ok(r.conteggi.risoltiDaChiudere >= 1, 'TK/2026/0012');
  const t13 = r.ticket.find(t => t.numero === 'TK/2026/0013');
  assert.equal(t13.statoVisto, 'In carico');
  assert.match(t13.statoDettaglio, / alle 14:30$/);
  assert.equal(t13.prossimoIntervento.inizio, oggi() + 'T14:30:00');
  const t11 = r.ticket.find(t => t.numero === 'TK/2026/0011');
  assert.deepEqual([t11.statoVisto, t11.statoDettaglio], ['In attesa', 'Aspetta il modulo di uscite dal fornitore']);
  // Il ticket per numero o per id.
  assert.equal((await ticket(manuel, 'TK/2026/0012')).id, 12);
  const t12 = await ticket(manuel, 12);
  assert.equal(t12.stato, 'risolto');
  assert.equal(t12.giallo, 'chiudi');
  assert.deepEqual(t12.proposta, { fatturazione: 'ticket', perche: 'Il contratto CA/2025/004 copre solo le visite' });
  assert.equal(t12.rapportini.length, 1);
  assert.equal(t12.rapportini[0].firmatario, 'Mario Bianchi');
  assert.equal(t12.interventoIl, '2026-10-21T09:00:00', 'l\'inizio dell\'intervento fatto');
  assert.equal(t12.foto.length, 2);
  assert.deepEqual([t12.somma.ore, t12.somma.km, t12.somma.materiale, t12.somma.importo], [2.5, 24, 18.5, 126.74]);
  assert.ok(t12.cronologia.some(e => e.testo === 'Rapportino ' + t12.rapportini[0].id + ' firmato da Mario Bianchi'));
  assert.equal(t12.cronologia[0].quando, '2026-10-20T09:15:00');
  assert.ok(t12.storico.length >= 1);
  const programmati = ok(await manuel('tickets', { segmento: 'programmati' })).ticket;
  assert.ok(programmati.some(t => t.numero === 'TK/2026/0015' && t.previstoIl === '2026-11-20' && t.origine === 'scadenza'));
  const chiusi = ok(await manuel('tickets', { segmento: 'chiusi', da: '2026-10-01', a: '2026-10-31' })).ticket;
  const t10 = chiusi.find(t => t.numero === 'TK/2026/0010');
  assert.deepEqual([t10.fatturazione, t10.fatturazioneNome, t10.statoDettaglio], ['ticket', 'Una riga', 'una riga per l\'intervento']);
  assert.ok(chiusi.some(t => t.numero === 'TK/2026/0009' && t.fatturazione === 'no'));
});

// ------------------------------------------------------------------ i passaggi di §7.1

test('passaggi: apri, prendi, attesa, riprendi, assegna, risolvi, riapri; i rifiuti con le frasi dell\'accordo', async () => {
  const nuovo = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', idSede: 4, titolo: 'Spia dell\'isolamento accesa', impatto: 'ridotto', urgenza: 'presto' } })).ticket;
  assert.match(nuovo.numero, /^TK\/\d{4}\/\d{4}$/);
  assert.deepEqual([nuovo.stato, nuovo.priorita, nuovo.tipo, nuovo.origine, nuovo.idContratto, nuovo.contratto], ['aperto', 'normale', 'guasto', 'telefono', 2, 'CA/2026/002'],
    'il contratto lo propone l\'impianto, tipo e origine di base');
  assert.ok(nuovo.idCommessa, 'la commessa del contratto');
  assert.equal(nuovo.cronologia[0].testo, 'Aperto da Manuel Gasparotto (telefono)');
  assert.equal(nuovo.giallo, 'prendi');
  const preso = ok(await manuel('prendiTicket', { id: nuovo.id })).ticket;
  assert.deepEqual([preso.stato, preso.responsabileId], ['in_carico', 1]);
  assert.ok(preso.presoIl);
  assert.equal(preso.giallo, 'pianifica');
  assert.equal(ok(await manuel('prendiTicket', { id: nuovo.id })).ticket.presoIl, preso.presoIl, 'ripetuto: ok senza rifare');
  assert.equal((await laura('prendiTicket', { id: nuovo.id })).errore, 'Il ticket ' + nuovo.numero + ' l\'ha già preso Manuel Gasparotto');
  assert.equal((await manuel('sospendiTicket', { id: nuovo.id })).errore, 'Scrivi il motivo');
  const attesa = ok(await manuel('sospendiTicket', { id: nuovo.id, motivo: 'Aspetta il materiale' })).ticket;
  assert.deepEqual([attesa.stato, attesa.statoVisto, attesa.statoDettaglio, attesa.giallo], ['in_attesa', 'In attesa', 'Aspetta il materiale', 'riprendi']);
  assert.equal((await manuel('chiudiTicket', { id: nuovo.id, fatturazione: 'no', motivo: 'x' })).errore, 'Il ticket è in attesa: riprendilo prima di chiuderlo');
  assert.equal(ok(await manuel('riprendiTicket', { id: nuovo.id })).ticket.stato, 'in_carico');
  const nessuno = ok(await manuel('assegnaTicket', { id: nuovo.id, responsabileId: null })).ticket;
  assert.deepEqual([nessuno.stato, nessuno.responsabileId, nessuno.presoIl], ['aperto', null, preso.presoIl], 'preso_il resta');
  const aMarco = ok(await manuel('assegnaTicket', { id: nuovo.id, responsabileId: MARCO })).ticket;
  assert.deepEqual([aMarco.stato, aMarco.responsabile], ['in_carico', 'Marco Rossato']);
  assert.ok(aMarco.cronologia.some(e => e.testo === 'Assegnato a Marco Rossato'));
  const risolto = ok(await marco('risolviTicket', { id: nuovo.id, esito: 'Rifatto il collegamento' })).ticket;
  assert.deepEqual([risolto.stato, risolto.esito], ['risolto', 'Rifatto il collegamento']);
  assert.ok(risolto.risoltoIl && risolto.interventoIl, 'la risoluzione conta come intervento se non ce n\'era');
  assert.equal(ok(await marco('risolviTicket', { id: nuovo.id })).ticket.risoltoIl, risolto.risoltoIl, 'ripetuto: ok');
  assert.equal((await marco('riapriTicket', { id: nuovo.id })).errore, 'Scrivi il motivo');
  const riaperto = ok(await marco('riapriTicket', { id: nuovo.id, motivo: 'Si è riaccesa la spia' })).ticket;
  assert.deepEqual([riaperto.stato, riaperto.risoltoIl], ['in_carico', '']);
  // Annullare: non con un rapportino legato; gli interventi ancora da fare si annullano.
  const altro = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C001', titolo: 'Da annullare', responsabileId: 1 } })).ticket;
  const pian = ok(await manuel('pianificaTicket', { id: altro.id, inizio: piuGiorni(oggi(), 9) + 'T10:00:00', conferma: true }));
  assert.equal((await manuel('annullaTicket', { id: altro.id })).errore, 'Scrivi il motivo');
  const annullato = ok(await manuel('annullaTicket', { id: altro.id, motivo: 'Aperto due volte' })).ticket;
  assert.equal(annullato.stato, 'annullato');
  assert.equal(ok(await manuel('attivita', { ticket: altro.id, stato: 'tutte' })).attivita.find(a => a.id === pian.attivita.id).stato, 'annullata');
  assert.equal((await manuel('prendiTicket', { id: altro.id })).errore, 'Il ticket ' + altro.numero + ' è annullato');
  const conRap = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', titolo: 'Con un rapportino', responsabileId: 1 } })).ticket;
  const r = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'tk-annulla-1', idTicket: conRap.id, idCliente: 'C002', data: oggi(), tariffa: 42, oreLavoro: 1 } })).rapportino;
  assert.equal((await manuel('annullaTicket', { id: conRap.id, motivo: 'x' })).errore, 'Il ticket ha il rapportino ' + r.id + ': toglilo prima dal ticket');
});

test('salvaTicket: i controlli dicono quale campo; l\'idLocale ripetuto non fa doppioni', async () => {
  const no = async (t, frase) => assert.equal((await manuel('salvaTicket', { ticket: t })).errore, frase);
  await no({ titolo: 'X' }, 'Cliente: scegli il cliente');
  await no({ idCliente: 'C002' }, 'Titolo: scrivi in poche parole cosa succede');
  await no({ idCliente: 'C002', titolo: 'X', tipo: 'boh' }, 'Tipo: guasto, verifica, piccolo, assistenza o programmato');
  await no({ idCliente: 'C002', titolo: 'X', origine: 'piccione' }, 'Da dove arriva: telefono, email, sopralluogo o ufficio');
  await no({ idCliente: 'C002', titolo: 'X', origine: 'whatsapp' }, 'Da dove arriva: telefono, email, sopralluogo o ufficio (WhatsApp e il portale non sono ancora collegati)');
  await no({ idCliente: 'C002', titolo: 'X', origine: 'scadenza' }, 'Da dove arriva: telefono, email, sopralluogo o ufficio');
  await no({ idCliente: 'C002', titolo: 'X', idSede: 7 }, 'Impianto 7 non trovato tra quelli di Rossi Impianti Srl');
  await no({ idCliente: 'C002', titolo: 'X', idContratto: 1 }, 'Il contratto CA/2026/001 è di Batokyo Srl');
  const a = ok(await marco('salvaTicket', { ticket: { idLocale: 'tel-ticket-1', idCliente: 'C004', idSede: 6, titolo: 'Nato senza rete', numero: 'TK/2026/0090', responsabileId: MARCO } })).ticket;
  assert.equal(a.numero, 'TK/2026/0090', 'il numero proposto dal telefono, se libero');
  const b = await marco('salvaTicket', { ticket: { idLocale: 'tel-ticket-1', idCliente: 'C004', titolo: 'Nato senza rete', numero: 'TK/2026/0090' } });
  assert.deepEqual([b.ok, b.giaArrivato, b.ticket.id], [true, true, a.id]);
  const c = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C004', titolo: 'Altro', numero: 'TK/2026/0090' } })).ticket;
  assert.notEqual(c.numero, 'TK/2026/0090', 'gia\' preso: il prossimo libero');
  assert.equal(c.numero, 'TK/2026/0091', 'il piu\' alto gia\' usato + 1');
});

// ------------------------------------------------------------------ pianificare nel calendario della fase 2

test('pianifica: un\'attività "intervento" del calendario, con le sovrapposizioni della fase 2', async () => {
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', idSede: 4, titolo: 'Sopralluogo per il quadro MT', responsabileId: MARCO } })).ticket;
  const T = oggi();
  const sov = await manuel('pianificaTicket', { id: t.id, inizio: T + 'T15:00:00', fine: T + 'T16:00:00' });
  assert.equal(sov.ok, false);
  assert.equal(sov.serveConferma, true);
  assert.match(sov.errore, /^Si sovrappone a: /);
  assert.ok(sov.sovrapposte.some(a => a.titolo === 'TK/2026/0013 · Navetta 2 si ferma in errore'));
  const r = ok(await manuel('pianificaTicket', { id: t.id, inizio: T + 'T15:00:00', fine: T + 'T16:00:00', conferma: true }));
  assert.deepEqual([r.attivita.tipo, r.attivita.idTicket, r.attivita.ticket, r.attivita.assegnataA, r.attivita.titolo],
    ['intervento', t.id, t.numero, MARCO, t.numero + ' · Sopralluogo per il quadro MT']);
  assert.equal(r.attivita.luogo, 'Via dell\'Artigianato 9, 36010 Zanè (VI)', 'l\'indirizzo dell\'impianto');
  assert.equal(r.ticket.stato, 'in_carico');
  assert.equal(r.ticket.prossimoIntervento.id, r.attivita.id);
  assert.match(r.ticket.cronologia.pop().testo, /^Intervento pianificato per \S+ \d+ alle 15:00 \(Marco Rossato\)$/);
  assert.ok(ok(await manuel('attivita', { ticket: t.id })).attivita.some(a => a.id === r.attivita.id), 'filtro ticket');
  assert.equal(ok(await manuel('ticket', { id: t.id })).ticket.giallo, 'rapportino', 'con l\'intervento di oggi: scrivi il rapportino');
  // Segnare fatto l'intervento fissa il momento del primo intervento.
  ok(await marco('faiAttivita', { id: r.attivita.id, fatta: true }));
  assert.equal((await ticket(manuel, t.id)).interventoIl, T + 'T15:00:00');
  // Il collaboratore pianifica solo per se'.
  assert.equal((await marco('pianificaTicket', { id: t.id, inizio: T + 'T18:00:00', assegnataA: 1 })).permesso, false);
});

// ------------------------------------------------------------------ il rapportino del ticket

test('rapportino col ticket: il numero nel campo Ticket solo se vuoto, il PDF di sempre, la firma nella cronologia', async () => {
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', idSede: 5, titolo: 'Interruttore che scalda', rifCliente: '4471' } })).ticket;
  const r = ok(await marco('salvaRapportino', { rapportino: { idLocale: 'tk-rap-1', idTicket: t.id, idCliente: 'C002', data: oggi(), descrizione: 'Serrati i morsetti', oreLavoro: 1, km: 10 } })).rapportino;
  assert.deepEqual([r.ticket, r.idTicket, r.numeroTicket, r.ticketAperto, r.nonSiFattura], [t.numero + ' · rif. 4471', t.id, t.numero, true, '']);
  const dopo = await ticket(manuel, t.id);
  assert.deepEqual([dopo.stato, dopo.responsabileId], ['in_carico', MARCO], 'il rapportino porta il ticket in carico (a chi l\'ha scritto)');
  assert.ok(dopo.interventoIl, 'la nascita del rapportino conta come intervento');
  const ana = ok(await manuel('anagrafiche'));
  assert.ok(Documenti.rapportino(r, ana).includes(t.numero + ' · rif. 4471'), 'il PDF di oggi mostra la cella Ticket');
  // Un campo Ticket gia' scritto non si tocca; risalvato senza ticket resta quello che aveva.
  const r2 = ok(await marco('salvaRapportino', { rapportino: { idLocale: 'tk-rap-2', idTicket: t.id, ticket: 'Buono 123', idCliente: 'C002', data: oggi(), oreLavoro: 2 } })).rapportino;
  assert.equal(r2.ticket, 'Buono 123');
  const r3 = ok(await marco('salvaRapportino', { rapportino: { idLocale: 'tk-rap-1', idCliente: 'C002', data: oggi(), descrizione: 'Serrati i morsetti', oreLavoro: 1.5, km: 10 } })).rapportino;
  assert.deepEqual([r3.idTicket, r3.ticket], [t.id, t.numero + ' · rif. 4471']);
  ok(await marco('caricaFile', { tipo: 'firma', id: r.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'firma-tk-rap-1', firmatario: 'Anna Rossi' }));
  const t2 = await ticket(manuel, t.id);
  assert.ok(t2.cronologia.some(e => e.testo === 'Rapportino ' + r.id + ' firmato da Anna Rossi'));
  assert.equal(t2.giallo, 'risolvi', 'col rapportino firmato: segna risolto (il titolare puo\' tutto)');
  assert.equal((await ticket(marco, t.id)).giallo, 'risolvi', 'per Marco: segna risolto');
  // Gli errori dell'accordo.
  const no = async (x, frase) => assert.equal((await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tk-rap-no-' + Math.random(), data: oggi(), tariffa: 40, oreLavoro: 1 }, x) })).errore, frase);
  await no({ idTicket: 'TK/2026/0999', idCliente: 'C002' }, 'Ticket TK/2026/0999 non trovato');
  await no({ idTicket: 10, idCliente: 'C002' }, 'Il ticket TK/2026/0010 è chiuso: riaprilo per aggiungere un rapportino');
  await no({ idTicket: t.id, idCliente: 'C001' }, 'Il ticket è di Rossi Impianti Srl, il rapportino di Elettrodinamica');
  // Legare e slegare dopo.
  const libero = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'tk-rap-lega', idCliente: 'C002', data: oggi(), tariffa: 42, oreLavoro: 1 } })).rapportino;
  const legato = ok(await manuel('legaRapportino', { idRapportino: libero.id, idTicket: t.numero })).rapportino;
  assert.deepEqual([legato.idTicket, legato.ticket], [t.id, t.numero + ' · rif. 4471']);
  const slegato = ok(await manuel('legaRapportino', { idRapportino: libero.id, idTicket: null })).rapportino;
  assert.deepEqual([slegato.idTicket, slegato.ticket], [null, ''], 'il numero scritto dal server si toglie');
  assert.ok(ok(await manuel('rapportini', { idTicket: t.id, tutti: true })).rapportini.every(x => x.idTicket === t.id), 'filtro idTicket');
});

test('senza rete: il ticket nato sul telefono e il suo rapportino con idLocaleTicket; ore e spese col ticket', async () => {
  const t = ok(await marco('salvaTicket', { ticket: { idLocale: 'tel-tk-offline', idCliente: 'C001', idSede: 9, titolo: 'Sirena che non suona', responsabileId: MARCO } })).ticket;
  const r = ok(await marco('salvaRapportino', { rapportino: { idLocale: 'tel-rap-offline', idLocaleTicket: 'tel-tk-offline', idCliente: 'C001', data: oggi(), descrizione: 'Cambiata la sirena', oreLavoro: 1 } })).rapportino;
  assert.equal(r.idTicket, t.id);
  const ripetuto = ok(await marco('salvaRapportino', { rapportino: { idLocale: 'tel-rap-offline', idLocaleTicket: 'tel-tk-offline', idCliente: 'C001', data: oggi(), descrizione: 'Cambiata la sirena', oreLavoro: 1 } })).rapportino;
  assert.equal(ripetuto.id, r.id, 'la coda che ripete: lo stesso rapportino');
  const ore = ok(await marco('salvaOre', { riga: { idLocale: 'tel-ore-tk', idTicket: t.id, data: oggi(), ore: 0.5, descrizione: 'Assistenza al telefono' } })).riga;
  assert.deepEqual([ore.idTicket, ore.ticket], [t.id, t.numero]);
  const spesa = ok(await marco('salvaSpesa', { spesa: { idLocale: 'tel-spesa-tk', idTicket: t.id, data: oggi(), importo: 12.5, categoria: 'materiale', descrizione: 'Sirena', pagataDaMe: true } })).spesa;
  assert.deepEqual([spesa.idTicket, spesa.idCliente, spesa.destinazione], [t.id, 'C001', 'cliente'], 'cliente del ticket, al cliente');
  const pagina = await ticket(marco, t.id);
  assert.equal(pagina.ore.length, 1);
  assert.equal(pagina.spese.filter(x => x.idTicket === t.id).length, 1);
  assert.equal(pagina.somma.materiale, 12.5);
  assert.equal('importo' in pagina.somma, false, 'senza il permesso dei soldi niente importo');
  assert.equal('costo' in pagina.somma, false);
  // Foto del ticket in base64 e da /carica, con l'idFile che non fa doppioni.
  const f = ok(await marco('caricaFile', { tipo: 'ticket', idTicket: t.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'foto-off-1' })).file;
  assert.equal(ok(await marco('caricaFile', { tipo: 'ticket', idTicket: t.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'foto-off-1' })).file.id, f.id);
  assert.equal((await marco.file(f.id)).status, 200);
  assert.equal((await ticket(marco, t.id)).foto.length, 1);
  ok(await marco('togliFotoTicket', { id: f.id }));
  assert.equal((await ticket(marco, t.id)).foto.length, 0);
});

// ------------------------------------------------------------------ il collaboratore

test('collaboratore: vede i suoi e quelli da prendere, non gli altri; non chiude, non assegna agli altri', async () => {
  const suoi = ok(await marco('tickets', {})).ticket;
  assert.ok(suoi.some(t => t.numero === 'TK/2026/0013'), 'il suo');
  assert.ok(suoi.some(t => t.numero === 'TK/2026/0014'), 'da prendere');
  assert.equal(suoi.some(t => t.numero === 'TK/2026/0011'), false, 'di Manuel, senza commessa sua');
  assert.equal((await marco('ticket', { id: 11 })).errore, 'Ticket 11 non trovato');
  assert.equal((await marco('ticket', { id: 'TK/2026/0011' })).errore, 'Ticket TK/2026/0011 non trovato');
  assert.equal(typeof ok(await marco('tickets', {})).conteggi.miei, 'number');
  assert.equal((await marco('salvaTicket', { ticket: { idCliente: 'C002', titolo: 'Per Manuel', responsabileId: 1 } })).permesso, false);
  assert.equal((await marco('assegnaTicket', { id: 14, responsabileId: 1 })).permesso, false);
  const chiudi = await marco('chiudiTicket', { id: 13, fatturazione: 'contratto' });
  assert.deepEqual([chiudi.errore, chiudi.permesso], ['Il ticket lo chiude l\'ufficio: tu segnalo risolto', false]);
  assert.equal((await marco('annullaTicket', { id: 14, motivo: 'x' })).permesso, false, 'non annulla quelli degli altri');
  const t13 = await ticket(marco, 13);
  assert.equal(t13.puoChiudere, false);
  assert.equal('importo' in t13.somma, false);
  // Lettura: vede tutto, non scrive.
  assert.ok(ok(await lettura('tickets', {})).ticket.length >= 4);
  assert.equal((await lettura('salvaTicket', { ticket: { idCliente: 'C002', titolo: 'X' } })).permesso, false);
  assert.equal((await lettura('prendiTicket', { id: 14 })).permesso, false);
  const t12 = await ticket(lettura, 12);
  assert.deepEqual([t12.giallo, t12.puoChiudere, t12.puoScrivere], ['', false, false]);
});

// ------------------------------------------------------------------ storico, statistiche, esportazione

test('storico dell\'impianto: la scheda, gli aperti, le scadenze, i contratti e la riga del tempo', async () => {
  const r = ok(await manuel('storicoImpianto', { idSede: 4 }));
  assert.deepEqual([r.impianto.nome, r.impianto.categoria, r.impianto.categoriaNome, r.impianto.cliente, r.impianto.potenza, r.impianto.ambienteNome, r.impianto.verificaOgniMesi],
    ['Cabina MT Acme', 'cabina_mt', 'Cabina MT', 'Rossi Impianti Srl', '630 kVA', 'Ordinario: verifica ogni 5 anni', 60]);
  assert.equal(r.impianto.referente, 'Sig. Ferretti · 0445 000201');
  assert.ok(r.aperti.some(x => x.id === 'TK/2026/0014' && x.idTicket === 14 && x.priorita === 'urgente'));
  assert.ok(r.scadenze.some(x => x.titolo === 'Verifica protezioni SPG e SPI' && x.statoVisto === 'Scaduta'));
  assert.deepEqual(r.contratti.map(c => c.numero), ['CA/2026/002']);
  for (const t of ['ticket', 'documento', 'contratto']) assert.ok(r.voci.some(v => v.tipo === t), t);
  assert.ok(r.voci.every((v, i) => i === 0 || r.voci[i - 1].data >= v.data), 'dalla piu\' recente');
  assert.equal(r.pagina, 1);
  // Il collaboratore: i documenti "costi" no (il contratto firmato).
  const m = ok(await marco('storicoImpianto', { idSede: 4 }));
  assert.equal(m.voci.some(v => v.tipo === 'documento' && /Contratto CA\/2026\/002/.test(v.titolo)), false);
  assert.ok(r.voci.some(v => v.tipo === 'documento' && /Contratto CA\/2026\/002/.test(v.titolo)));
});

test('statistiche: tempi di presa, intervento e chiusura, per tipo, cliente, impianto, persona, mese; i soldi solo con costi', async () => {
  const r = ok(await manuel('statisticheTicket', {}));
  assert.equal(r.per, 'tipo');
  assert.match(r.da, /^\d{4}-\d{2}-01$/);
  for (const k of ['aperti', 'chiusi', 'inCorso', 'presaMediaOre', 'interventoMedioOre', 'chiusuraMediaGiorni', 'entroITempi', 'ore', 'km', 'costo', 'fatturato', 'nelContratto']) assert.ok(k in r.totale, k);
  assert.ok(r.righe.some(x => x.chiave === 'guasto' && x.nome === 'Guasti'));
  for (const per of ['cliente', 'impianto', 'persona', 'mese']) assert.equal(ok(await manuel('statisticheTicket', { per })).per, per);
  const m = ok(await marco('statisticheTicket', {}));
  assert.equal('costo' in m.totale, false);
  assert.equal('fatturato' in m.totale, false);
  assert.equal((await manuel('statisticheTicket', { per: 'boh' })).errore, 'Per: tipo, cliente, impianto, persona o mese');
});

test('esporta ticket: le colonne dell\'accordo, l\'importo solo con costi', async () => {
  const r = ok(await manuel('esporta', { cosa: 'ticket' }));
  const testo = Buffer.from(r.base64, 'base64').toString('utf8');
  assert.match(testo.split('\r\n')[0], /^﻿Numero;Aperto il;Cliente;Impianto;Titolo;Tipo;Da dove;Priorità;Stato;Responsabile;Contratto;Commessa;Preso il;Primo intervento il;Risolto il;Chiuso il;Ore;Km;Spese;Come si fattura;Importo;Fatturato il$/);
  assert.ok(testo.includes('TK/2026/0014'));
  const m = ok(await marco('esporta', { cosa: 'ticket' }));
  assert.equal(Buffer.from(m.base64, 'base64').toString('utf8').split('\r\n')[0].includes('Importo'), false);
});
