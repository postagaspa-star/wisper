// Le regole dell'interfaccia di Wisper Ufficio (fase 1), provate con Node.
//   node --test pc/prove
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../ui/conti.js');
global.WisperConti = C;
const R = require('../ui/regole.js');
global.WisperRegole = R;
const E = require('../ui/esempio.js');

const ruolo = r => E.permessiDi(r);

// ------------------------------------------------------------------ permessi

test('permessi: le voci del menu nell\'ordine delle specifiche, solo quelle del ruolo', () => {
  assert.deepEqual(R.vociMenu(ruolo('titolare')).map(v => v.nome),
    ['Dashboard', 'Clienti e fornitori', 'Commesse', 'Progetti', 'Preventivi e contratti', 'Servizi', 'Attività e calendario', 'Rapportini', 'Spese e trasferte', 'Fatturazione', 'Banche e scadenze',
      'Persone e risorse umane', 'Documenti', 'Ticket e assistenza', 'Mezzi e attrezzature', 'WhatsApp e comunicazioni', 'Portale clienti', 'Collaboratori esterni', 'Integrazioni', 'Amministrazione']);
  // 1.4.0 (servizi.md §1): Servizi subito dopo Preventivi; non è un permesso, la vede chi ha Preventivi, Rapportini o Fatture.
  // 07/11/2026: "Ore e rapportini" è diventata Rapportini (le Ore sono state tolte).
  // 03/11/2026 (progetti.md §4): Progetti subito sotto Commesse (che non si chiama più "Progetti e commesse"), a tutti e quattro.
  // Fase 8 (fase8.md §15): Integrazioni, voce 17, dopo Collaboratori esterni; la vedono titolare, amministrazione e lettura.
  // Fase 2: il collaboratore vede Attività e calendario, non i preventivi. Fase 3: Spese e trasferte, voce 7.
  // Fase 5: Documenti (in lettura) e Ticket e assistenza. Fase 6: Persone (l'organico e la sua scheda) e Mezzi, non i collaboratori esterni.
  // Fase 7: WhatsApp e comunicazioni a tutti e quattro, Portale clienti a tutti tranne il collaboratore (fase7.md §11.2).
  assert.deepEqual(R.vociMenu(ruolo('collaboratore')).map(v => v.modulo), ['dashboard', 'clienti', 'commesse', 'progetti', 'servizi', 'attivita', 'rapportini', 'spese', 'persone', 'documenti', 'ticket', 'mezzi', 'comunicazioni']);
  assert.deepEqual(R.vociMenu(ruolo('lettura')).map(v => v.modulo), ['dashboard', 'clienti', 'commesse', 'progetti', 'preventivi', 'servizi', 'attivita', 'rapportini', 'spese', 'fatturazione', 'banche', 'persone', 'documenti', 'ticket', 'mezzi', 'comunicazioni', 'portale', 'collaboratori', 'integrazioni']);
  // Fase 6: l'esterno ha il menu ridotto nel suo ordine (fase6.md §12.7), con Rapportini prima di Attività.
  const esterno = { dashboard: 1, clienti: 0, commesse: 1, progetti: 1, preventivi: 0, attivita: 2, rapportini: 2, spese: 2, fatturazione: 0, banche: 0, persone: 0, documenti: 1, ticket: 2, mezzi: 0, collaboratori: 1, amministrazione: 0, costi: 0, riservati: 0 };
  assert.deepEqual(R.vociMenu(esterno, true).map(v => v.modulo), ['dashboard', 'commesse', 'progetti', 'rapportini', 'attivita', 'spese', 'documenti', 'ticket', 'collaboratori']);
  assert.ok(!R.paginaPermessa(esterno, '#persone'));
  assert.ok(!R.paginaPermessa(esterno, '#mezzi/at/4'));
  assert.ok(R.paginaPermessa(esterno, '#collaboratori'));
  // Fase 4: Fatturazione e Banche vogliono anche il permesso dei soldi.
  assert.deepEqual(R.vociMenu({ dashboard: 1, fatturazione: 2, banche: 2, costi: 0 }).map(v => v.modulo), ['dashboard']);
  assert.ok(!R.paginaPermessa({ fatturazione: 2, costi: 0 }, '#fatturazione/fatture'));
  assert.ok(R.paginaPermessa({ banche: 1, costi: 1 }, '#banche/movimenti'));
  assert.ok(R.vociMenu(ruolo('amministrazione')).some(v => v.modulo === 'amministrazione'), 'amministrazione in lettura la vede');
  assert.deepEqual(R.vociMenu(null), []);
});

test('permessi: livelli, pagine permesse, l\'app è di tutti', () => {
  const c = ruolo('collaboratore');
  assert.equal(R.livello(c, 'rapportini'), 2);
  assert.equal(R.livello(c, 'costi'), 0);
  assert.equal(R.livello(c, 'inventato'), 0);
  assert.equal(R.livello({ x: '2' }, 'x'), 2);
  assert.equal(R.livello({ x: 7 }, 'x'), 0);
  assert.ok(R.puo(c, 'commesse'));
  assert.ok(!R.puo(c, 'commesse', 2));
  assert.ok(!R.paginaPermessa(c, '#fatturazione'));
  assert.ok(!R.paginaPermessa(c, 'amministrazione/utenti'));
  assert.ok(R.paginaPermessa(c, '#amministrazione/app'), 'tema, visita e versione per tutti');
  assert.ok(R.paginaPermessa(c, 'commesse/26ST044'));
  assert.equal(R.moduloDi('#clienti/C001'), 'clienti');
  assert.equal(R.moduloDi(''), 'dashboard');
  assert.equal(R.primaPagina(c), 'dashboard');
  assert.equal(R.primaPagina({}), 'amministrazione/app');
  assert.deepEqual(Object.keys(R.permessiTutti()).sort(), ['amministrazione', 'attivita', 'commesse', 'progetti', 'costi', 'clienti', 'dashboard', 'fatturazione', 'banche', 'documenti', 'preventivi', 'rapportini', 'riservati', 'spese', 'ticket',
    'persone', 'mezzi', 'collaboratori', 'comunicazioni', 'portale', 'integrazioni'].sort());
});

test('permessi: il titolare da chiamare e l\'ultimo titolare che non si toglie', () => {
  const utenti = [
    { id: 1, nome: 'Manuel Gasparotto', ruolo: 'titolare', attivo: true },
    { id: 2, nome: 'Laura Bianchi', ruolo: 'amministrazione', attivo: true },
    { id: 5, nome: 'Vecchio Titolare', ruolo: 'titolare', attivo: false },
  ];
  assert.equal(R.titolareDi(utenti), 'Manuel');
  assert.equal(R.titolareDi([]), 'al titolare');
  assert.ok(R.ultimoTitolare(utenti, utenti[0]), 'l\'unico titolare attivo');
  assert.ok(!R.ultimoTitolare(utenti, utenti[1]));
  assert.ok(!R.ultimoTitolare(utenti.concat([{ id: 6, nome: 'Andrea', ruolo: 'titolare', attivo: true }]), utenti[0]), 'con due titolari si può');
});

test('permessi: cosa vedrà chi cambia ruolo, a parole', () => {
  const f = R.descriviRuolo(ruolo('collaboratore'));
  // Fase 5: il collaboratore lavora i ticket e legge i documenti.
  // Fase 7: e le sue comunicazioni (fase7.md §11.2).
  assert.match(f, /Potrà cambiare: Attività e calendario, Rapportini, Spese e trasferte, Ticket e assistenza, WhatsApp e comunicazioni\./);
  // Fase 6: l'organico e i mezzi in lettura, niente collaboratori esterni.
  assert.match(f, /Solo da leggere: Dashboard, Clienti e fornitori, Commesse, Progetti, Persone e risorse umane, Documenti, Mezzi e attrezzature\./);
  assert.match(f, /Non vedrà: Preventivi e contratti, Fatturazione, Banche e scadenze, Portale clienti, Collaboratori esterni, Integrazioni, Amministrazione\./);
  assert.match(f, /Senza importi\.$/);
  assert.match(R.descriviRuolo(ruolo('titolare')), /Vede gli importi\.$/);
});

// ------------------------------------------------------------------ date e saluti

test('saluto secondo l\'ora', () => {
  assert.equal(R.saluto(8), 'Buongiorno');
  assert.equal(R.saluto(12), 'Buongiorno');
  assert.equal(R.saluto(13), 'Buon pomeriggio');
  assert.equal(R.saluto(17), 'Buon pomeriggio');
  assert.equal(R.saluto(18), 'Buonasera');
  assert.equal(R.saluto(2), 'Buonasera');
});

test('date: il titolo della Dashboard e i giorni del registro', () => {
  const oggi = '2026-10-23';
  assert.equal(R.dataTitolo('2026-10-23', oggi), 'Venerdì 23 ottobre');
  assert.equal(R.dataTitolo('2025-12-31', oggi), 'Mercoledì 31 dicembre 2025');
  assert.equal(R.giornoRegistro('2026-10-23T16:20:00', oggi), 'Oggi');
  assert.equal(R.giornoRegistro('2026-10-22T09:00:00', oggi), 'Ieri');
  assert.equal(R.giornoRegistro('2026-10-19T11:10:00', oggi), 'lunedì 19 ottobre');
  assert.equal(R.quando('2026-10-23T16:20:00', oggi), 'oggi alle 16:20');
  assert.equal(R.quando('2026-10-22T09:05:00', oggi), 'ieri alle 9:05');
  assert.equal(R.quando('2026-10-20T11:10:00', oggi), '20 ottobre alle 11:10');
  assert.equal(R.quando('', oggi), '');
});

test('registro: le voci divise per giorno, nell\'ordine in cui arrivano', () => {
  const g = R.raggruppaPerGiorno([
    { quando: '2026-10-23T16:20:00' }, { quando: '2026-10-23T09:31:00' }, { quando: '2026-10-22T18:02:00' }, { quando: '2026-10-19T11:10:00' },
  ], '2026-10-23');
  assert.deepEqual(g.map(x => [x.giorno, x.voci.length]), [['Oggi', 2], ['Ieri', 1], ['lunedì 19 ottobre', 1]]);
});

test('registro: i periodi dei filtri', () => {
  assert.deepEqual(R.periodo('oggi', '2026-10-23'), { da: '2026-10-23', a: '2026-10-23' });
  assert.deepEqual(R.periodo('7', '2026-10-23'), { da: '2026-10-17', a: '2026-10-23' });
  assert.deepEqual(R.periodo('30', '2026-10-23'), { da: '2026-09-24', a: '2026-10-23' });
  assert.deepEqual(R.periodo('', '2026-10-23'), { da: '', a: '' });
});

// ------------------------------------------------------------------ controlli dei campi

test('partita IVA: 11 cifre e la cifra di controllo', () => {
  assert.equal(R.errorePartitaIva(''), '');
  assert.equal(R.errorePartitaIva('01234567897'), '');
  assert.equal(R.errorePartitaIva('IT 0123 4567 897'), '', 'col prefisso e gli spazi');
  assert.equal(R.errorePartitaIva('0123456789'), 'La partita IVA ha 11 cifre');
  assert.equal(R.errorePartitaIva('01234567890'), 'La partita IVA non torna: controlla le cifre');
  assert.equal(R.errorePartitaIva('0123456789A'), 'La partita IVA ha solo cifre');
  assert.equal(R.errorePartitaIva('DE123456789'), '', 'quelle estere non si controllano qui');
});

test('codice fiscale, SDI, email, CAP, provincia', () => {
  assert.equal(R.erroreCodiceFiscale('BNCMRA70A01F138X'), '');
  assert.equal(R.erroreCodiceFiscale('01234567897'), '', 'le ditte: 11 cifre');
  assert.match(R.erroreCodiceFiscale('BNCMRA70'), /16 caratteri/);
  assert.equal(R.erroreSdi('M5UXCR1'), '');
  assert.equal(R.erroreSdi('M5UX'), 'Il codice SDI ha 7 caratteri');
  assert.equal(R.erroreEmail('rossi@esempio.com'), '');
  assert.match(R.erroreEmail('rossi.esempio.com'), /Manca la @/);
  assert.equal(R.erroreCap('36061'), '');
  assert.equal(R.erroreCap('3606'), 'Il CAP ha 5 cifre');
  assert.equal(R.erroreProvincia('vi'), '');
  assert.match(R.erroreProvincia('Vicenza'), /2 lettere/);
});

test('modulo cliente: errori sotto i campi, con cosa fare', () => {
  assert.deepEqual(R.validaSoggetto({ nome: 'Rossi', cliente: true }), {});
  const e = R.validaSoggetto({ nome: ' ', cliente: false, fornitore: false, partitaIva: '123', email: 'x' });
  assert.equal(e.nome, 'Scrivi il nome o la ragione sociale');
  assert.match(e.tipo, /cliente, un fornitore/);
  assert.equal(e.partitaIva, 'La partita IVA ha 11 cifre');
  assert.ok(e.email);
});

// ------------------------------------------------------------------ clienti e fornitori

const soggetti = [
  { id: 'C001', nome: 'Elettrodinamica', cliente: true, fornitore: false, citta: 'Thiene', partitaIva: '01234567897' },
  { id: 'C002', nome: 'Rossi Impianti Srl', alias: ['Rossi'], cliente: true, fornitore: true, citta: 'Bassano', partitaIva: '' },
  { id: 'C004', nome: 'Impianti Vecchi Snc', cliente: true, archiviato: true },
  { id: 'F001', nome: 'Comel Forniture', cliente: false, fornitore: true, citta: 'Vicenza', email: 'ordini@comel.esempio' },
];

test('doppioni: stesso nome (senza Srl, maiuscole, accenti), altro nome o stessa partita IVA', () => {
  assert.equal(R.trovaDoppione(soggetti, { nome: 'ROSSI IMPIANTI' }).id, 'C002');
  assert.equal(R.trovaDoppione(soggetti, { nome: 'Rossi' }).id, 'C002', 'l\'altro nome');
  assert.equal(R.trovaDoppione(soggetti, { nome: 'Elettrodinamica S.r.l.' }).id, 'C001');
  assert.equal(R.trovaDoppione(soggetti, { nome: 'Altro nome', partitaIva: 'IT01234567897' }).id, 'C001', 'stessa partita IVA');
  assert.equal(R.trovaDoppione(soggetti, { nome: 'Rossi Impianti Srl' }, 'C002'), null, 'sé stesso non è un doppione');
  assert.equal(R.trovaDoppione(soggetti, { nome: 'Bianchi' }), null);
  assert.equal(R.trovaDoppione(soggetti, { nome: 'Nuovo', partitaIva: '' }), null, 'la partita IVA vuota non fa doppione');
});

test('clienti e fornitori: chi è tutti e due sta in tutte e due le liste; gli archiviati a parte', () => {
  assert.deepEqual(R.filtraSoggetti(soggetti, { tipo: 'clienti' }).map(s => s.id), ['C001', 'C002']);
  assert.deepEqual(R.filtraSoggetti(soggetti, { tipo: 'fornitori' }).map(s => s.id), ['F001', 'C002']);
  assert.deepEqual(R.filtraSoggetti(soggetti, { tipo: 'clienti', archiviati: true }).map(s => s.id), ['C004']);
  assert.deepEqual(R.filtraSoggetti(soggetti, { tipo: 'fornitori', testo: 'comel' }).map(s => s.id), ['F001']);
  assert.deepEqual(R.filtraSoggetti(soggetti, { tipo: 'clienti', testo: 'thiene' }).map(s => s.id), ['C001'], 'cerca anche la città');
  assert.deepEqual(R.contaSoggetti(soggetti), { clienti: 2, fornitori: 2, archiviatiClienti: 1, archiviatiFornitori: 0 });
  assert.equal(R.indirizzoCompleto({ indirizzo: 'Via Nuova 3', cap: '36061', citta: 'Bassano del Grappa', provincia: 'vi' }), 'Via Nuova 3, 36061 Bassano del Grappa (VI)');
  assert.equal(R.indirizzoCompleto({}), '');
});

// ------------------------------------------------------------------ commesse e prestazioni

const commesse = [
  { id: '26ST044', idCliente: 'C001', descrizione: 'Magazzino', stato: 'APERTA', finePrevista: '2026-10-24', idResponsabile: 1 },
  { id: '26ST046', idCliente: 'C001', descrizione: 'Linea 3', stato: 'APERTA', finePrevista: '2026-10-19', idResponsabile: 3 },
  { id: '26ST047', idCliente: 'C003', descrizione: 'Fotovoltaico', stato: 'APERTA' },
  { id: '26ST041', idCliente: 'C002', descrizione: 'Terra', stato: 'SOSPESA', finePrevista: '2026-01-01' },
  { id: '26ST040', idCliente: 'C001', descrizione: 'Cabina', stato: 'CHIUSA' },
  { id: '26ST038', idCliente: 'C004', descrizione: 'Vecchio', stato: 'CHIUSA', archiviata: true },
  { id: '26ST039', idCliente: 'C003', descrizione: 'Modello', stato: 'APERTA', modello: true },
];

test('commesse: in ritardo solo le aperte oltre la fine prevista', () => {
  assert.ok(R.inRitardo(commesse[1], '2026-10-23'));
  assert.ok(!R.inRitardo(commesse[0], '2026-10-23'));
  assert.ok(!R.inRitardo(commesse[3], '2026-10-23'), 'una sospesa non è in ritardo');
  assert.ok(!R.inRitardo(commesse[2], '2026-10-23'), 'senza fine prevista');
});

test('commesse: segmenti, archivio, ritardo, senza responsabile; i modelli mai negli elenchi', () => {
  const ids = f => R.filtraCommesse(commesse, Object.assign({ oggi: '2026-10-23' }, f)).map(m => m.id);
  assert.deepEqual(ids({ stato: 'APERTA' }), ['26ST047', '26ST046', '26ST044'], 'dalla più nuova');
  assert.deepEqual(ids({ stato: 'ARCHIVIO' }), ['26ST038']);
  assert.deepEqual(ids({ stato: 'CHIUSA' }), ['26ST040'], 'le archiviate non stanno fra le chiuse');
  assert.deepEqual(ids({ stato: 'APERTA', ritardo: true }), ['26ST046']);
  assert.deepEqual(ids({ stato: 'APERTA', responsabile: 'nessuno' }), ['26ST047']);
  assert.deepEqual(ids({ stato: 'APERTA', cliente: 'C001' }), ['26ST046', '26ST044']);
  assert.deepEqual(R.filtraCommesse(commesse, { stato: 'APERTA', testo: 'elettro' }, id => (id === 'C001' ? 'Elettrodinamica' : '')).map(m => m.id), ['26ST046', '26ST044'], 'cerca nel nome del cliente');
  assert.deepEqual(R.contaCommesse(commesse, '2026-10-23'), { aperte: 3, sospese: 1, chiuse: 1, inRitardo: 1, archivio: 1 });
});

test('prestazioni: lo stato segue l\'avanzamento, a passi di 5', () => {
  assert.equal(R.statoPrestazione(0), 'da_fare');
  assert.equal(R.statoPrestazione(1), 'in_corso');
  assert.equal(R.statoPrestazione(99), 'in_corso');
  assert.equal(R.statoPrestazione(100), 'fatta');
  assert.equal(R.avanzamento(60, 10), 70, '+10%');
  assert.equal(R.avanzamento(95, 10), 100, 'mai oltre 100');
  assert.equal(R.avanzamento(0, -5), 0, 'mai sotto 0');
  assert.equal(R.avanzamento(62, 0), 60, 'arrotondato a passi di 5');
});

test('prestazioni: ordine, trascinamento e totali', () => {
  const lista = [{ id: 'P3', ordine: 3, valore: 1200, avanzamento: 0 }, { id: 'P1', ordine: 1, valore: 300, avanzamento: 100 }, { id: 'P2', ordine: 2, valore: 1800, avanzamento: 60 }];
  const ordinate = R.ordinaPrestazioni(lista);
  assert.deepEqual(ordinate.map(p => p.id), ['P1', 'P2', 'P3']);
  assert.deepEqual(R.sposta(ordinate, 2, 0).map(p => p.id), ['P3', 'P1', 'P2'], 'l\'ultima in cima');
  assert.deepEqual(R.sposta(ordinate, 0, 2).map(p => p.id), ['P2', 'P3', 'P1']);
  assert.deepEqual(R.sposta(ordinate, 5, 0).map(p => p.id), ['P1', 'P2', 'P3'], 'fuori dalla lista non cambia niente');
  assert.deepEqual(ordinate.map(p => p.id), ['P1', 'P2', 'P3'], 'la lista di partenza resta com\'era');
  assert.deepEqual(R.totaliPrestazioni(lista), { totale: 3300, fatto: 1380, perc: 42 });
  assert.deepEqual(R.totaliPrestazioni([]), { totale: 0, fatto: 0, perc: 0 });
});

// ------------------------------------------------------------------ numerazioni

test('numerazioni: i pezzi del formato, avanti e indietro', () => {
  assert.deepEqual(R.pezziFormato('{AA}ST{NNN}'), [{ tipo: 'anno', cifre: 2 }, { tipo: 'testo', testo: 'ST' }, { tipo: 'numero', cifre: 3 }]);
  assert.deepEqual(R.pezziFormato('RAP/{AAAA}/{NNNN}'), [{ tipo: 'testo', testo: 'RAP/' }, { tipo: 'anno', cifre: 4 }, { tipo: 'testo', testo: '/' }, { tipo: 'numero', cifre: 4 }]);
  for (const f of ['{AA}ST{NNN}', 'RAP/{AAAA}/{NNNN}', 'ST{AA}-{NNNN}']) assert.equal(R.formatoDaPezzi(R.pezziFormato(f)), f);
  assert.equal(R.formatoDaPezzi([{ tipo: 'testo', testo: 'A{B}' }, { tipo: 'numero', cifre: 12 }]), 'AB{NNNNNNNN}', 'niente graffe nel testo, al massimo 8 cifre');
});

test('numerazioni: il numero col formato, il formato a parole, gli errori', () => {
  assert.equal(R.formattaNumero('{AA}ST{NNN}', 48, 2026), '26ST048');
  assert.equal(R.formattaNumero('{AA}ST{NNN}', 1047, 2027), '27ST1047', 'oltre le cifre il numero cresce');
  assert.equal(R.formattaNumero('RAP/{AAAA}/{NNNN}', 143, 2026), 'RAP/2026/0143');
  assert.equal(R.formatoAParole('{AA}ST{NNN}'), 'anno a due cifre, ST, numero di 3 cifre');
  assert.equal(R.formatoAParole('RAP/{AAAA}/{NNNN}'), 'RAP, anno a quattro cifre, numero di 4 cifre');
  assert.equal(R.erroreFormato('{AA}ST', false), 'Manca il numero');
  assert.equal(R.erroreFormato('{NNN}{NN}', false), 'Il numero va messo una volta sola');
  assert.match(R.erroreFormato('ST{NNN}', true), /serve anche l'anno/);
  assert.equal(R.erroreFormato('{AA}ST{NNN}', false), '');
});

// ------------------------------------------------------------------ dashboard

test('dashboard: ogni riga porta al suo elenco filtrato', () => {
  assert.deepEqual(R.destinazione({ pagina: 'commessa', id: '26ST044' }), { hash: '#commesse/26ST044', filtro: null });
  assert.deepEqual(R.destinazione({ pagina: 'commesse', filtro: { stato: 'APERTA', responsabile: 'nessuno' } }), { hash: '#commesse', filtro: { stato: 'APERTA', responsabile: 'nessuno' } });
  assert.deepEqual(R.destinazione({ pagina: 'cliente', id: 'C002' }), { hash: '#clienti/C002', filtro: null });
  assert.deepEqual(R.destinazione({ pagina: 'rapportino', id: 'RAP/2026/0012' }), { hash: '#rapportini', filtro: { apri: 'RAP/2026/0012' } });
  assert.deepEqual(R.destinazione({ pagina: 'fatturazione', filtro: { mese: '2026-09' } }), { hash: '#fatturazione', filtro: { mese: '2026-09' } });
  assert.deepEqual(R.destinazione({ pagina: 'chissà' }), { hash: '#dashboard', filtro: null });
  assert.equal(R.testoAzione({ pagina: 'fatturazione' }), 'Apri Da fatturare');
  // Fase 4: le pagine nuove della Dashboard.
  assert.deepEqual(R.destinazione({ pagina: 'fattura', id: 12 }), { hash: '#fatturazione/fatture', filtro: { apri: 12 } });
  assert.deepEqual(R.destinazione({ pagina: 'fatture', filtro: { stato: 'pronta' } }), { hash: '#fatturazione/fatture', filtro: { stato: 'pronta' } });
  assert.deepEqual(R.destinazione({ pagina: 'scadenziario', filtro: { giorno: '2026-11-30' } }), { hash: '#banche', filtro: { giorno: '2026-11-30' } });
  assert.deepEqual(R.destinazione({ pagina: 'impegni', filtro: { proposte: true } }), { hash: '#banche/tributi', filtro: { proposte: true } });
  assert.deepEqual(R.destinazione({ pagina: 'conti', id: 1 }), { hash: '#banche/conti', filtro: { id: 1 } });
  assert.deepEqual(R.destinazione({ pagina: 'amministrazione', filtro: { sezione: 'fiscale' } }), { hash: '#amministrazione/fiscale', filtro: null });
  assert.equal(R.testoAzione({ pagina: 'commessa' }), 'Apri la commessa');
  assert.equal(R.classeGravita('urgente'), 'ico-rosso');
  assert.equal(R.classeGravita('soldi'), 'ico-blu');
  assert.equal(R.classeGravita('qualcosa'), 'ico-grigio');
});

test('07/11/2026, niente Ore: la Dashboard toglie il timer e le ore respinte del server di prima, il resto uguale', () => {
  const timer = { tipo: 'timer', gravita: 'attenzione', titolo: 'Il timer è acceso da 12 ore', collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore' } } };
  const oreRespinte = { tipo: 'respinta', gravita: 'attenzione', titolo: 'Ore del 05/11 respinte', collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore', giorno: '2026-11-05' } } };
  const oreEsterno = { tipo: 'respinta', gravita: 'attenzione', titolo: 'Ore del 05/11 respinte', collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore' } } };
  const tante = { tipo: 'respinta', gravita: 'attenzione', titolo: '4 cose respinte da correggere', collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore', stato: 'respinta' } } };
  const rap = { tipo: 'respinta', gravita: 'attenzione', titolo: 'RAP/2026/0006 respinto', collegamento: { pagina: 'rapportini', filtro: { segmento: 'rapportini', id: 'RAP/2026/0006' } } };
  const spesa = { tipo: 'respinta', gravita: 'attenzione', titolo: 'Spesa del 04/11 respinta', collegamento: { pagina: 'spese', filtro: { segmento: 'spese', id: 3 } } };
  const gruppo = { tipo: 'approvare', titolo: 'Da sistemare', voci: [timer, rap] };
  [timer, oreRespinte, oreEsterno].forEach(v => assert.equal(R.vocePerLeOre(v), true, v.titolo));
  [tante, rap, spesa, gruppo, { tipo: 'respinta', titolo: 'senza collegamento' }].forEach(v => assert.equal(R.vocePerLeOre(v), false, v.titolo));
  const prima = { ok: true, urgenti: [timer, rap, oreRespinte, tante], settimana: [spesa, gruppo], pianificare: [], quante: { urgenti: 6, settimana: 2, pianificare: 0 }, numeri: { ore: { settimana: 12 } } };
  const d = R.dashSenzaOre(prima);
  assert.deepEqual(d.urgenti.map(v => v.titolo), ['RAP/2026/0006 respinto', '4 cose respinte da correggere']);
  assert.deepEqual(d.settimana[1].voci.map(v => v.titolo), ['RAP/2026/0006 respinto'], 'anche dentro le voci di gruppo');
  assert.deepEqual(d.quante, { urgenti: 4, settimana: 2, pianificare: 0 }, 'i numeri scendono di quante se ne tolgono');
  assert.deepEqual(d.numeri, prima.numeri);
  assert.equal(prima.urgenti.length, 4, 'la risposta del server non si tocca');
  // Il server nuovo non le manda: uguale. Senza le sezioni (server delle fasi 1-2) niente da fare.
  assert.deepEqual(R.dashSenzaOre(d), d);
  assert.deepEqual(R.dashSenzaOre({ ok: true, numeri: {} }), { ok: true, numeri: {} });
  assert.equal(R.dashSenzaOre(null), null);
  // I collegamenti di prima alle ore portano ai Rapportini: il pulsante dice "Apri i rapportini".
  assert.equal(R.testoAzione({ pagina: 'rapportini', filtro: { segmento: 'ore' } }), 'Apri i rapportini');
});

// ------------------------------------------------------------------ registro

test('registro: la frase, prima e dopo, i campi cambiati', () => {
  const v = { utente: 'Laura Bianchi', idUtente: 2, azione: 'salvaSoggetto', tabella: 'soggetti', idRiga: 'C002', nome: 'Rossi Impianti Srl', prima: { ultima_tariffa: 40 }, dopo: { ultima_tariffa: 42 } };
  assert.deepEqual(R.fraseRegistro(v), [{ testo: 'Laura', forte: true }, { testo: ' ha cambiato la tariffa di ' }, { testo: 'Rossi Impianti Srl', forte: true }]);
  assert.deepEqual(R.primaDopo(v), { prima: '40', dopo: '42' });
  const nuova = { utente: { nome: 'Manuel' }, azione: 'salvaPrestazione', tabella: 'prestazioni', nome: 'Collaudo', prima: null, dopo: { nome: 'Collaudo', valore: 700 } };
  assert.equal(R.fraseRegistro(nuova).map(p => p.testo).join(''), 'Manuel ha creato la prestazione Collaudo');
  assert.equal(R.fraseRegistro({ utente: { nome: 'Laura' }, azione: 'archiviaSoggetto', tabella: 'soggetti', nome: 'Vecchi', prima: { archiviato: false }, dopo: { archiviato: true } }).map(p => p.testo).join(''),
    'Laura ha archiviato il cliente Vecchi');
  assert.equal(R.primaDopo({ azione: 'archiviaSoggetto', prima: { archiviato: false }, dopo: { archiviato: true } }), null, 'archiviare non mostra no → sì');
  assert.deepEqual(R.campiCambiati({ stato: 'INVIATO', note: 'x' }, { stato: 'FATTURATO', note: 'x' }), [{ campo: 'stato', nome: 'Stato', prima: 'Inviato', dopo: 'Fatturato' }]);
  assert.deepEqual(R.campiCambiati({ ruolo: 'lettura' }, { ruolo: 'collaboratore' })[0].dopo, 'Collaboratore');
  const nomi = v => ({ '5': 'Giorgio Prova' })[v.idRiga];
  assert.equal(R.fraseRegistro({ utente: 'Manuel Gasparotto', tabella: 'utenti', idRiga: '5', prima: { password_hash: '(cambiata)' }, dopo: { password_hash: '(cambiata)' } }, nomi).map(p => p.testo).join(''),
    'Manuel ha cambiato la password di Giorgio Prova', 'la password: prima e dopo sono uguali, "(cambiata)"');
  assert.equal(R.fraseRegistro({ utente: 'Manuel', tabella: 'utenti', idRiga: '5', prima: { attivo: 1 }, dopo: { attivo: 0 } }, nomi).map(p => p.testo).join(''), 'Manuel ha disattivato Giorgio Prova');
  assert.equal(R.primaDopo({ tabella: 'utenti', prima: { attivo: 1 }, dopo: { attivo: 0 } }), null);
  assert.equal(R.fraseRegistro({ utente: 'Manuel', tabella: 'permessi', idRiga: 'collaboratore.fatturazione', prima: { livello: 0 }, dopo: { livello: 1 } }).map(p => p.testo).join(''),
    'Manuel ha cambiato il permesso di Collaboratore su Fatturazione');
  assert.deepEqual(R.primaDopo({ tabella: 'permessi', prima: { livello: 0 }, dopo: { livello: 1 } }), { prima: 'Niente', dopo: 'Vede' });
  assert.equal(R.fraseRegistro({ utente: 'Manuel', tabella: 'impostazioni', idRiga: 'EURO_KM', prima: { valore: 0.76 }, dopo: { valore: 0.8 } }).map(p => p.testo).join(''), 'Manuel ha cambiato il rimborso km');
  assert.deepEqual(R.primaDopo({ tabella: 'impostazioni', idRiga: 'EURO_KM', prima: { valore: 0.76 }, dopo: { valore: 0.8 } }), { prima: '0,76', dopo: '0,8' });
  assert.equal(R.fraseRegistro({ utente: 'Manuel', tabella: 'referenti', idRiga: '3', prima: { nome: 'Anna Verdi' }, dopo: null, nota: 'tolto' }).map(p => p.testo).join(''), 'Manuel ha tolto il referente Anna Verdi');
  assert.equal(R.fraseRegistro({ utente: 'Laura', tabella: 'soggetti', idRiga: 'F002', prima: { archiviato: 0, modificato: 'a' }, dopo: { archiviato: 1, modificato: 'b' } }).map(p => p.testo).join(''),
    'Laura ha archiviato il fornitore F002', 'colonne del database, il modificato non conta');
  assert.deepEqual(R.fraseRegistro({ chi: 'Marco Rossato', frase: 'ha scritto il rapportino' }), [{ testo: 'Marco', forte: true }, { testo: ' ha scritto il rapportino' }], 'la frase del server vince');
});

// ------------------------------------------------------------------ file del server

test('la firma del tecnico: indirizzo di Drive (foglio) o del server (/file/<id>)', () => {
  const D = require('../ui/documenti.js');
  assert.equal(D.idDaUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view'), '1AbCdEfGhIjKlMnOp');
  assert.equal(D.idDaUrl('/file/D04yLN6e265kAflzujHc6Pa8OL2Q'), 'D04yLN6e265kAflzujHc6Pa8OL2Q');
  assert.equal(D.idDaUrl(''), '');
  assert.equal(D.idDaUrl('/file/../segreto'), '', 'niente percorsi strani');
});

// ------------------------------------------------------------------ numeri nei campi

test('numeri nei campi: senza punto delle migliaia, così si rileggono uguali', () => {
  for (const n of [2500, 3700, 0.76, 42, 1234.5, 120000, 0]) assert.equal(C.num(R.numeroCampo(n)), n, String(n));
  assert.equal(R.numeroCampo(2500), '2500');
  assert.equal(R.numeroCampo(0.76), '0,76');
  assert.equal(R.numeroCampo(null), '');
  assert.equal(R.numeroCampo('abc'), '');
  // Il motivo: quello che si legge (C.numero) non torna indietro.
  assert.notEqual(C.num(C.numero(2500)), 2500);
});

// ------------------------------------------------------------------ password e CSV

test('password iniziale: tre gruppi di quattro, senza lettere che si confondono', () => {
  const p = R.passwordIniziale(n => Array.from({ length: n }, (x, i) => i * 7));
  assert.match(p, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(!/[IL01O]/.test(R.passwordIniziale()), 'niente I, L, O, 0, 1');
  assert.notEqual(R.passwordIniziale(), R.passwordIniziale());
});

test('CSV per Excel: BOM, punto e virgola, virgola nei numeri, virgolette', () => {
  const t = R.csv(['Nome', 'Ore', 'Note'], [['Rossi; Srl', 6.5, 'disse "ok"'], ['Bianchi', 8, '']]);
  assert.equal(t.charCodeAt(0), 0xFEFF);
  assert.equal(t.slice(1), 'Nome;Ore;Note\r\n"Rossi; Srl";6,5;"disse ""ok"""\r\nBianchi;8;\r\n');
  assert.equal(R.nomeEsportazione('registro', '2026-10-23'), 'Wisper registro 2026-10-23.csv');
});

// ------------------------------------------------------------------ il server finto della visita

test('esempio: il collaboratore vede solo i suoi rapportini, senza importi, e non scrive le anagrafiche', () => {
  const d = E.crea({ chi: 'marco', oggi: '2026-10-21' });
  const rap = E.gestisci(d, 'GET', '/server/rapportini').rapportini;
  assert.ok(rap.length > 0);
  assert.ok(rap.every(r => r.idUtente === 3), 'solo i suoi');
  assert.ok(rap.every(r => r.totale === undefined && r.tariffa === undefined), 'niente soldi');
  const no = E.gestisci(d, 'POST', '/server/salvaSoggetto', { soggetto: { nome: 'X', cliente: true } });
  assert.equal(no.ok, false);
  assert.equal(no.permesso, false);
  assert.equal(E.gestisci(d, 'GET', '/server/utenti').permesso, false, 'niente amministrazione');
  const dash = E.gestisci(d, 'GET', '/server/dashboard');
  assert.ok([].concat(dash.urgenti, dash.settimana, dash.pianificare).every(v => v.quanto === undefined && v.gravita !== 'soldi'), 'nessuna voce di soldi');
});

test('esempio: chi ha la lettura non cambia niente; il titolare non si toglie', () => {
  const l = E.crea({ chi: 'lettura', oggi: '2026-10-21' });
  assert.equal(E.gestisci(l, 'POST', '/server/stato', { ids: ['RAP/2026/0001'], stato: 'FATTURATO' }).permesso, false);
  assert.equal(E.gestisci(l, 'POST', '/server/aggiornaCommessa', { id: '26ST044', campi: { stato: 'CHIUSA' } }).permesso, false);
  const m = E.crea({ chi: 'manuel', oggi: '2026-10-21' });
  assert.equal(E.gestisci(m, 'POST', '/server/salvaUtente', { utente: { id: 1, ruolo: 'lettura' } }).ok, false, 'l\'ultimo titolare resta titolare');
  assert.equal(E.gestisci(m, 'POST', '/server/salvaPermessi', { permessi: { titolare: { clienti: 0 } } }).ok, false, 'il titolare ha sempre tutto');
  assert.equal(E.gestisci(m, 'POST', '/server/salvaPermessi', { permessi: { collaboratore: { clienti: 2 } } }).permessi.collaboratore.clienti, 2);
  assert.match(E.gestisci(m, 'POST', '/server/salvaUtente', { utente: { nome: 'Giorgio', email: 'giorgio@esempio.it' } }).passwordIniziale, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'la password iniziale la dà il server');
});

test('esempio: le scritture finiscono nel registro, con prima e dopo', () => {
  const m = E.crea({ chi: 'manuel', oggi: '2026-10-21' });
  const prima = E.gestisci(m, 'GET', '/server/registro').righe.length;
  const p = E.gestisci(m, 'POST', '/server/salvaPrestazione', { prestazione: { id: 2, idCommessa: '26ST044', avanzamento: 72 } }).prestazione;
  assert.equal(p.avanzamento, 70, 'a passi di 5');
  assert.equal(p.stato, 'in_corso');
  const voci = E.gestisci(m, 'GET', '/server/registro').righe;
  assert.equal(voci.length, prima + 1);
  assert.deepEqual([voci[0].tabella, voci[0].idRiga, voci[0].utente], ['prestazioni', '2', 'Manuel Gasparotto'], 'come il registro del server');
  assert.deepEqual([voci[0].prima, voci[0].dopo], [{ avanzamento: 60 }, { avanzamento: 70 }]);
  const doppio = E.gestisci(m, 'POST', '/server/salvaSoggetto', { soggetto: { nome: 'rossi impianti', cliente: true } });
  assert.equal(doppio.giaEsisteva, true, 'il doppione torna quello che c\'è');
  assert.equal(doppio.soggetto.id, 'C002');
});

test('costo della commessa: accanto alle ore il costo orario del conto, non quello di oggi', () => {
  // 20 ore congelate a 22 €: 440 €, anche se oggi in Amministrazione c'è 15 €.
  assert.equal(R.costoOrarioDelConto(20, 440), 22);
  // 10 ore a 15 e 10 a 29 fanno 440: 22 € di media, e 20 × 22 torna al centesimo.
  assert.equal(R.costoOrarioDelConto(7.5, 165), 22);
  // Se la media non torna al centesimo, niente numero.
  assert.equal(R.costoOrarioDelConto(3, 100), null);
  assert.equal(R.costoOrarioDelConto(0, 0), null);
});
