// I progetti e le funzioni che si spengono tutte (docs/gestionale/progetti.md, 03/11/2026), provati con Node:
// le regole dei progetti, le dipendenze delle funzioni uguali al server, la riga Progetto nel PDF, i dati di esempio.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const C = require('../ui/conti.js');
global.WisperConti = C;
const R = require('../ui/regole.js');
global.WisperRegole = R;
const RP = require('../ui/regole-progetti.js');
const Q = require('../ui/regole-fase8.js');
const D = require('../ui/documenti.js');
const E = require('../ui/esempio.js');
const A8 = require('../../server/src/azioni/amministrazione8.js');

const P = (id, idCommessa, codice, descrizione, extra) => Object.assign({ id, idCommessa, idCliente: 'C001', codice, descrizione, intestatoA: '', stato: 'APERTO', creato: '2026-11-0' + id + 'T09:00:00' }, extra || {});
const LISTA = [
  P(1, '26ST044', 'ED-001', 'Rilievo', { stato: 'CHIUSO', intestatoA: 'Batokyo Srl' }),
  P(2, '26ST044', 'ED-002', 'Quadri di zona', { intestatoA: 'Batokyo Srl' }),
  P(3, '26ST046', 'ED-003', 'Quadro QE1', { intestatoA: 'Acme Spa' }),
  P(4, '26ST046', 'ED-010', 'Quadro QE2', { intestatoA: 'acme spa' }),
  P(5, '26ST045', 'RI-1', 'Capannone', { idCliente: 'C002' }),
];

// ------------------------------------------------------------------ regole dei progetti

test('progetti: come si scrive un progetto, nel rapportino anche senza elenco', () => {
  assert.equal(RP.etichetta({ codice: 'ED-003', descrizione: 'Quadro QE1' }), 'ED-003 · Quadro QE1');
  assert.equal(RP.etichetta({ codice: 'ED-003' }), 'ED-003');
  assert.equal(RP.etichetta(null), '');
  // Il rapportino porta codice e descrizione (dal server); senza, dall'elenco.
  assert.equal(RP.delRapportino({ idProgetto: 3, progetto: 'ED-003', progettoDescrizione: 'Quadro QE1' }, []), 'ED-003 · Quadro QE1');
  assert.equal(RP.delRapportino({ idProgetto: 3 }, LISTA), 'ED-003 · Quadro QE1');
  assert.equal(RP.delRapportino({ idProgetto: null, progetto: '' }, LISTA), '');
  assert.equal(RP.delRapportino({}, LISTA), '');
  assert.equal(RP.intestatoDelRapportino({ idProgetto: 3 }, LISTA), 'Acme Spa');
  assert.equal(RP.intestatoDelRapportino({ idProgetto: 3, progettoIntestatoA: 'Altro' }, LISTA), 'Altro');
  assert.equal(RP.intestatoDelRapportino({ idProgetto: 5 }, LISTA), '');
});

test('progetti: Aperti, Chiusi, Tutti e la ricerca (codice, intestato a, descrizione, commessa, cliente)', () => {
  assert.deepEqual(RP.conta(LISTA), { aperti: 4, chiusi: 1, tutti: 5 });
  assert.deepEqual(RP.filtra(LISTA, {}).map(p => p.id), [5, 4, 3, 2], 'di base gli aperti, i più recenti prima');
  assert.deepEqual(RP.filtra(LISTA, { stato: 'CHIUSO' }).map(p => p.id), [1]);
  assert.deepEqual(RP.filtra(LISTA, { stato: 'TUTTI' }).map(p => p.id), [5, 4, 3, 2, 1]);
  assert.deepEqual(RP.filtra(LISTA, { stato: 'TUTTI', testo: 'batokyo' }).map(p => p.id), [2, 1], 'intestato a');
  assert.deepEqual(RP.filtra(LISTA, { testo: 'qe1' }).map(p => p.id), [3], 'descrizione');
  assert.deepEqual(RP.filtra(LISTA, { testo: '26st046' }).map(p => p.id), [4, 3], 'commessa');
  assert.deepEqual(RP.filtra(LISTA, { testo: 'rossi' }, p => (p.idCliente === 'C002' ? 'Rossi Impianti' : 'Elettrodinamica')).map(p => p.id), [5], 'cliente a parole');
  assert.deepEqual(RP.filtra(LISTA, { testo: 'quadro acme' }).map(p => p.id), [4, 3], 'tutte le parole');
  assert.deepEqual(RP.filtra(LISTA, { idCommessa: '26ST044', stato: 'TUTTI' }).map(p => p.id), [2, 1]);
});

test('progetti nel rapportino: gli aperti della commessa, quello già scelto, l\'unico aperto scelto da solo', () => {
  assert.deepEqual(RP.perRapportino(LISTA, '26ST044').map(p => p.codice), ['ED-002'], 'il chiuso non si propone');
  assert.deepEqual(RP.perRapportino(LISTA, '26ST044', 1).map(p => p.codice), ['ED-001', 'ED-002'], 'ma resta se era già quello del rapportino');
  assert.deepEqual(RP.perRapportino(LISTA, '26st046').map(p => p.codice), ['ED-003', 'ED-010'], 'in ordine di codice');
  assert.deepEqual(RP.perRapportino(LISTA, ''), []);
  assert.equal(RP.sceltoDaSolo(LISTA, '26ST044').id, 2);
  assert.equal(RP.sceltoDaSolo(LISTA, '26ST046'), null, 'con due aperti si sceglie');
  assert.equal(RP.sceltoDaSolo(LISTA, '26ST099'), null);
});

test('progetti: "Intestato a" propone i nomi già usati per quel cliente, senza doppi', () => {
  assert.deepEqual(RP.intestatiDelCliente(LISTA, 'C001'), ['acme spa', 'Batokyo Srl'], 'il più recente prima, maiuscole uguali una volta');
  assert.deepEqual(RP.intestatiDelCliente(LISTA, 'C002'), []);
  assert.deepEqual(RP.intestatiDelCliente(LISTA, ''), []);
  assert.deepEqual(RP.intestatiDelCliente(LISTA, 'C001', 1), ['acme spa']);
});

test('progetti: con la funzione accesa il rapportino non si salva senza progetto (§4.6)', () => {
  const base = { accesi: true, puoCreare: true, titolare: 'Manuel' };
  assert.equal(RP.mancaProgetto(Object.assign({}, base, { accesi: false })), '', 'spenta: il campo non c\'è');
  assert.equal(RP.mancaProgetto(base), 'Scegli la commessa e il progetto');
  assert.equal(RP.mancaProgetto(Object.assign({}, base, { idCommessa: '26ST044', aperti: 1 })), 'Scegli il progetto');
  assert.equal(RP.mancaProgetto(Object.assign({}, base, { idCommessa: '26ST044', idProgetto: 2 })), '');
  assert.equal(RP.mancaProgetto(Object.assign({}, base, { commessaNuova: true, progettoNuovo: { descrizione: 'Quadro' } })), '', 'nuovo con la commessa nuova');
  assert.equal(RP.mancaProgetto(Object.assign({}, base, { commessaNuova: true, progettoNuovo: { descrizione: ' ' } })), 'Scegli il progetto');
  assert.equal(RP.mancaProgetto(Object.assign({}, base, { idCommessa: '26ST047', aperti: 0, puoCreare: false })), 'La commessa non ha progetti aperti: chiedi a Manuel di crearne uno');
  assert.equal(RP.accesa(['progetti'], 'progetti'), false);
  assert.equal(RP.accesa(undefined, 'progetti'), true);
  assert.deepEqual(RP.parolaStato({ stato: 'CHIUSO' }), { testo: 'Chiuso', colore: 'grigio' });
  assert.deepEqual(RP.parolaStato({}), { testo: 'Aperto', colore: 'verde' });
});

// ------------------------------------------------------------------ funzioni: le stesse dipendenze del server

test('funzioni: le 19 del computer sono quelle del server (nome, richiede, cosa cambia), con le stesse catene', () => {
  assert.equal(Q.FUNZIONI.length, 19);
  assert.deepEqual(Q.FUNZIONI.map(f => f.modulo).slice().sort(), A8.FUNZIONI.map(f => f.modulo).slice().sort());
  // 07/11/2026: "Ore e rapportini" è diventata Rapportini, sul computer e sul server (le Ore sono state tolte).
  assert.deepEqual((({ nome, cosaCambia }) => ({ nome, cosaCambia }))(Q.FUNZIONI.find(f => f.modulo === 'rapportini')),
    { nome: 'Rapportini', cosaCambia: 'Sparisce dal menu di tutti; non si scrivono rapportini. I dati restano.' });
  A8.FUNZIONI.forEach(s => {
    const c = Q.FUNZIONI.find(f => f.modulo === s.modulo);
    assert.equal(c.nome, s.nome, s.modulo);
    assert.equal(c.cosaCambia, s.cosaCambia, s.modulo + ' cosa cambia');
    assert.deepEqual(c.richiede, s.richiede, s.modulo + ' richiede');
  });
  assert.deepEqual(Q.chiLaUsa('clienti'), ['commesse', 'progetti', 'preventivi', 'rapportini', 'fatturazione', 'ticket', 'comunicazioni', 'portale', 'collaboratori']);
  assert.deepEqual(Q.chiLaUsa('commesse'), ['progetti', 'collaboratori']);
  assert.deepEqual(Q.chiLaUsa('progetti'), []);
  assert.deepEqual(Q.diCosaHaBisogno('progetti'), ['clienti', 'commesse']);
  assert.deepEqual(Q.diCosaHaBisogno('dashboard'), []);
});

test('funzioni: il foglio di conferma dice quali si spengono o si accendono con lei', () => {
  const lista = Q.FUNZIONI.map(f => ({ modulo: f.modulo, nome: f.nome, accesa: true, serveA: Q.chiLaUsa(f.modulo), richiede: Q.diCosaHaBisogno(f.modulo) }));
  const commesse = lista.find(f => f.modulo === 'commesse');
  const spegni = Q.domandaCambio(commesse, false, lista);
  assert.equal(spegni.titolo, 'Spegnere Commesse?');
  assert.equal(spegni.fraseAnche, 'Si spengono anche: Progetti, Collaboratori esterni');
  assert.equal(spegni.pulsante, 'Spegni');
  assert.match(spegni.testo, /i rapportini non chiedono più la commessa/);
  // Con Collaboratori già spenta resta solo Progetti.
  lista.find(f => f.modulo === 'collaboratori').accesa = false;
  assert.equal(Q.domandaCambio(commesse, false, lista).fraseAnche, 'Si spengono anche: Progetti');
  // Accendere Progetti con Commesse e Clienti spente le riaccende.
  lista.find(f => f.modulo === 'commesse').accesa = false;
  lista.find(f => f.modulo === 'clienti').accesa = false;
  const accendi = Q.domandaCambio(lista.find(f => f.modulo === 'progetti'), true, lista);
  assert.equal(accendi.fraseAnche, 'Si accendono anche: Clienti e fornitori, Commesse');
  assert.equal(accendi.pulsante, 'Accendi');
  assert.equal(Q.domandaCambio({ modulo: 'dashboard', nome: 'Dashboard' }, true, lista).fraseAnche, '', 'niente da accendere con lei');
  assert.equal(Q.avvisoCambio('Commesse', false, [{ modulo: 'progetti', nome: 'Progetti' }, { modulo: 'collaboratori', nome: 'Collaboratori esterni' }]),
    'Commesse spenta, e anche Progetti e Collaboratori esterni: i dati restano');
  assert.equal(Q.avvisoCambio('Progetti', true, []), 'Progetti riaccesa: i dati sono come prima');
});

// ------------------------------------------------------------------ PDF del rapportino

const IMP = { RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', PARTITA_IVA: '03123456786' };
const ANA = { impostazioni: IMP, clienti: [{ id: 'C001', nome: 'Elettrodinamica' }], commesse: [], progetti: LISTA };
const RAP = { id: 'RAP/2026/0007', data: '2026-11-03', stato: 'FIRMATO', idCliente: 'C001', cliente: 'Elettrodinamica', idCommessa: '26ST046', descrizione: 'Cablaggio', oreLavoro: 4, oreExtra: 0, oreViaggio: 1, km: 40, spese: 0 };
const impronta = s => crypto.createHash('sha256').update(s).digest('hex');

test('PDF del rapportino: la riga Progetto (codice e descrizione) e Intestato a; senza progetto identico a prima', () => {
  const senza = D.rapportino(RAP, ANA, {});
  assert.equal(senza.indexOf('riga-progetto'), -1, 'senza progetto né la riga né il suo stile');
  assert.equal(impronta(senza), impronta(D.rapportino(Object.assign({}, RAP, { idProgetto: null, progetto: '' }), ANA, {})));
  const con = D.rapportino(Object.assign({}, RAP, { idProgetto: 3, progetto: 'ED-003', progettoDescrizione: 'Quadro QE1', progettoIntestatoA: 'Acme Spa' }), ANA, {});
  assert.ok(con.indexOf('<div class="riga-progetto"><div class="cella"><div class="etichetta">Progetto</div><div class="valore">ED-003 · Quadro QE1</div></div>' +
    '<div class="cella"><div class="etichetta">Intestato a</div><div class="valore">Acme Spa</div></div></div>') > 0);
  assert.ok(con.indexOf('.riga-progetto {') > 0, 'lo stile c\'è solo qui');
  assert.ok(con.indexOf('<div class="riga-progetto">') > con.indexOf('<span class="cod">26ST046</span>'), 'sotto la commessa');
  // Dall'elenco (telefono senza i campi nel rapportino) e senza intestatario.
  const dallElenco = D.rapportino(Object.assign({}, RAP, { idProgetto: 5 }), ANA, {});
  assert.ok(dallElenco.indexOf('<div class="valore">RI-1 · Capannone</div>') > 0);
  assert.equal(dallElenco.indexOf('Intestato a'), -1);
  assert.ok(D.rapportino(Object.assign({}, RAP, { idProgetto: 3, progetto: '<b>X</b>' }), ANA, {}).indexOf('&lt;b&gt;X&lt;/b&gt;') > 0, 'il codice resta testo');
});

// ------------------------------------------------------------------ dati di esempio (la visita e finto-ponte --esempio)

test('esempio: tre progetti, i rapportini coi loro, il codice proposto dopo i primi due, crea, cambia, chiudi, togli', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-11-03' });
  const g = (m, p, c) => E.gestisci(dati, m, p, c);
  const ana = g('GET', '/server/anagrafiche?archiviati=1');
  assert.deepEqual(ana.progetti.map(p => p.codice + ' ' + p.stato), ['ED-003 APERTO', 'ED-002 APERTO', 'ED-001 CHIUSO']);
  assert.ok(ana.progetti.every(p => p.rapportini > 0 && p.ore > 0));
  const conProgetto = g('GET', '/server/rapportini').rapportini.filter(r => r.idProgetto);
  assert.ok(conProgetto.length >= 10);
  assert.ok(conProgetto.every(r => r.progetto && r.progettoDescrizione));
  // Come il server: la commessa, poi il cliente, poi tutti (Rossi non ha progetti: vale la forma di tutti).
  assert.equal(g('GET', '/server/codiceProgetto?idCommessa=26ST044').codice, 'ED-004', 'nella commessa del magazzino: dopo ED-002, ma ED-003 è già dello stesso cliente');
  assert.equal(g('GET', '/server/codiceProgetto?idCommessa=26ST045').codice, 'ED-004', 'Rossi: la forma di tutti');
  const pochi = E.crea({ chi: 'manuel', oggi: '2026-11-03' });
  pochi.ana.progetti = pochi.ana.progetti.slice(0, 1);
  assert.deepEqual(E.gestisci(pochi, 'GET', '/server/codiceProgetto?idCommessa=26ST045'), { ok: true, codice: '', da: '' }, 'con un progetto solo niente proposta');
  assert.equal(E.gestisci(pochi, 'POST', '/server/creaProgetto', { idCommessa: '26ST045', descrizione: 'Quadro' }).errore, 'Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo');
  const nuovo = g('POST', '/server/creaProgetto', { idCommessa: '26ST044', codiceProgetto: 'ED-004', descrizione: 'Nastro 4', intestatoA: 'Batokyo Srl' }).progetto;
  assert.equal(nuovo.codice, 'ED-004');
  assert.equal(g('POST', '/server/creaProgetto', { idCommessa: '26ST046', codiceProgetto: 'ed-004', descrizione: 'Doppio' }).errore, 'Il codice ed-004 è già di un altro progetto di questo cliente');
  assert.equal(g('POST', '/server/aggiornaProgetto', { id: nuovo.id, campi: { stato: 'CHIUSO' } }).progetto.stato, 'CHIUSO');
  assert.equal(g('POST', '/server/aggiornaProgetto', { id: 2, campi: { idCommessa: '26ST046' } }).errore, 'Il progetto ha già dei rapportini: la commessa non si cambia');
  assert.equal(g('POST', '/server/togliProgetto', { id: 2 }).errore, 'Il progetto ha dei rapportini: non si toglie, si chiude');
  assert.deepEqual(g('POST', '/server/togliProgetto', { id: nuovo.id }), { ok: true });
  // Un rapportino su una commessa nuova con un progetto nuovo: il progetto nasce sotto la commessa.
  const r = g('POST', '/server/salvaRapportino', { rapportino: { idLocale: 'U-prova', data: '2026-11-03', idCliente: 'C001', cliente: 'Elettrodinamica', idCommessa: '', commessa: 'Cabina nuova',
    descrizione: 'Sopralluogo', oreLavoro: 2, oreExtra: 0, oreViaggio: 0, km: 0, spese: 0, idProgetto: null, progettoNuovo: { idLocale: 'P-prova', codice: '', descrizione: 'Cabina MT', intestatoA: 'Acme Spa' } } }).rapportino;
  assert.equal(r.progetto, 'ED-004', 'il codice lo propone Wisper');
  assert.equal(r.progettoDescrizione, 'Cabina MT');
  assert.equal(g('GET', '/server/progetti?idCommessa=' + r.idCommessa).progetti.length, 1);
  // Il collaboratore li legge ma non li crea.
  const marco = E.crea({ chi: 'marco', oggi: '2026-11-03' });
  assert.ok(E.gestisci(marco, 'GET', '/server/progetti').progetti.length >= 3);
  assert.equal(E.gestisci(marco, 'POST', '/server/creaProgetto', { idCommessa: '26ST044', codiceProgetto: 'X', descrizione: 'Y' }).permesso, false);
});

test('esempio: spegnere Commesse spegne anche Progetti e Collaboratori; riaccendere Progetti riaccende Commesse', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-11-03' });
  const g = (m, p, c) => E.gestisci(dati, m, p, c);
  assert.deepEqual(g('POST', '/server/salvaFunzioni', { modulo: 'commesse', accesa: false }).anche.map(a => a.nome), ['Progetti', 'Collaboratori esterni']);
  const io = g('GET', '/server/io');
  assert.deepEqual(io.interfaccia.funzioniSpente.slice().sort(), ['collaboratori', 'commesse', 'progetti']);
  assert.equal(io.permessi.progetti, 0);
  assert.deepEqual(g('POST', '/server/salvaFunzioni', { modulo: 'progetti', accesa: true }).anche.map(a => a.nome), ['Commesse']);
  assert.deepEqual(g('GET', '/server/io').interfaccia.funzioniSpente, ['collaboratori']);
  // Amministrazione spenta: il titolare legge e cambia lo stesso le funzioni.
  g('POST', '/server/salvaFunzioni', { modulo: 'amministrazione', accesa: false });
  assert.equal(g('GET', '/server/funzioni').funzioni.find(f => f.modulo === 'amministrazione').accesa, false);
  assert.equal(g('POST', '/server/salvaFunzioni', { modulo: 'amministrazione', accesa: true }).ok, true);
  const f = g('GET', '/server/funzioni').funzioni;
  assert.equal(f.length, 19);
  assert.deepEqual(f.find(x => x.modulo === 'clienti').serveA.slice(0, 2), ['commesse', 'progetti']);
});

test('permessi: il modulo progetti dopo commesse, nei ruoli come il server (titolare e amministrazione 2, gli altri 1)', () => {
  assert.equal(R.VOCI_MENU.findIndex(v => v.modulo === 'progetti'), R.VOCI_MENU.findIndex(v => v.modulo === 'commesse') + 1);
  assert.equal(R.VOCI_MENU.find(v => v.modulo === 'progetti').nome, 'Progetti');
  assert.ok(R.RIGHE_PERMESSI.some(r => (r.modulo || r[0]) === 'progetti' || JSON.stringify(r).indexOf('progetti') >= 0), 'la riga in Ruoli e permessi');
  assert.equal(E.permessiDi('titolare').progetti, 2);
  assert.equal(E.permessiDi('amministrazione').progetti, 2);
  assert.equal(E.permessiDi('collaboratore').progetti, 1);
  assert.equal(E.permessiDi('lettura').progetti, 1);
  assert.equal(R.moduloDi('#progetti/3'), 'progetti');
  assert.deepEqual(R.destinazione({ pagina: 'progetto', id: 3 }), { hash: '#progetti/3', filtro: null });
});
