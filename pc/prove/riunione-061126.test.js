// Le richieste della riunione con Manuel del 06/11/2026, provate con Node: oggetto e frase dell'email che capiscono il
// periodo (casi condivisi col telefono in server/prove/casi-invio.json), l'email già scritta nel campo A, il progetto
// obbligatorio solo per Elettrodinamica (server/prove/casi-progetto-obbligatorio.json), i PDF col codice del progetto dove
// c'era la commessa e la commessa nel Mittente, il logo senza il nome accanto (PDF_NOME).
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const RI = require('../ui/regole-invio.js');
const RP = require('../ui/regole-progetti.js');
const D = require('../ui/documenti.js');

const leggiCasi = nome => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'prove', nome), 'utf8'));

// ------------------------------------------------------------------ oggetto e frase dell'email (P11)

test('invio: ogni caso di casi-invio.json, oggetto e frase uguali carattere per carattere', () => {
  const file = leggiCasi('casi-invio.json');
  assert.ok(file.casi.length >= 14, 'i casi ci sono tutti');
  file.casi.forEach(c => {
    const r = RI.periodoInvio(c.date, c.numero);
    assert.equal(r.oggetto, c.oggetto, c.nome + ' (oggetto)');
    assert.equal(r.frase, c.frase, c.nome + ' (frase)');
  });
});

test('invio: il corpo dell\'email e i casi limite', () => {
  assert.equal(RI.messaggioInvio('il rapportino del 05/11/2026', 'Manuel Gasparotto'),
    'Buongiorno,\nin allegato il rapportino del 05/11/2026.\n\nCordiali saluti\nManuel Gasparotto');
  assert.deepEqual(RI.periodoInvio([]), { oggetto: 'Rapportini', frase: 'il riepilogo dei rapportini' });
  assert.equal(RI.periodoInvio(['2026-11-05']).oggetto, 'Rapportini del 5 novembre 2026', 'una data senza numero: come un giorno solo');
  assert.equal(RI.periodoInvio(['2026-11-05'], '').oggetto, 'Rapportino del 05/11/2026', 'un rapportino senza numero');
  assert.equal(RI.periodoInvio(['2026-11-05T09:00:00', '2026-11-05']).oggetto, 'Rapportini del 5 novembre 2026', 'con l\'ora si guarda il giorno');
  assert.equal(RI.periodoInvio(['2026-11-30', '2026-11-30']).oggetto, 'Rapportini del 30 novembre 2026');
  assert.equal(RI.periodoInvio(['2026-12-11', '2026-12-08']).oggetto, 'Rapportini della settimana dall\'8 all\'11 dicembre 2026');
});

// ------------------------------------------------------------------ l'email nel campo A (P7)

test('invio: l\'email del destinatario, dal cliente, dal nome, dalla commessa; più clienti solo con la stessa email', () => {
  const clienti = { C1: { id: 'C1', nome: 'Rossi Impianti Srl', email: 'rossi@esempio.it' }, C2: { id: 'C2', nome: 'Bianchi Spa', email: '' },
    C3: { id: 'C3', nome: 'Elettrodinamica', email: 'ufficio@elettro.example' }, C4: { id: 'C4', nome: 'Verdi', email: 'Rossi@esempio.it' } };
  const commesse = { '26ST001': { id: '26ST001', idCliente: 'C3' } };
  const trova = { cliente: id => clienti[id], perNome: n => Object.values(clienti).find(c => c.nome.toLowerCase() === String(n).toLowerCase()), commessa: id => commesse[id] };
  assert.equal(RI.emailDestinatario([{ idCliente: 'C1' }], trova), 'rossi@esempio.it', 'un rapportino: il suo cliente');
  assert.equal(RI.emailDestinatario([{ idCliente: 'C2', idCommessa: '26ST001' }], trova), 'ufficio@elettro.example', 'senza email: il cliente della commessa (chi paga)');
  assert.equal(RI.emailDestinatario([{ idCliente: 'C2' }], trova), '', 'nessuna email da nessuna parte');
  assert.equal(RI.emailDestinatario([{ idCliente: '', cliente: 'rossi impianti srl' }], trova), 'rossi@esempio.it', 'senza id: dal nome');
  assert.equal(RI.emailDestinatario([{ idCliente: 'C1' }, { idCliente: 'C1' }, { cliente: 'Rossi Impianti Srl' }], trova), 'rossi@esempio.it', 'tutti dello stesso cliente');
  assert.equal(RI.emailDestinatario([{ idCliente: 'C1' }, { idCliente: 'C3' }], trova), '', 'due clienti con due email: niente');
  assert.equal(RI.emailDestinatario([{ idCliente: 'C1' }, { idCliente: 'C4' }], trova), 'rossi@esempio.it', 'due clienti, la stessa email (maiuscole a parte)');
  assert.equal(RI.emailDestinatario([{ idCliente: 'C2', idCommessa: '26ST001' }, { idCliente: 'C3' }], trova), 'ufficio@elettro.example', 'stesso chi paga');
  assert.equal(RI.emailDestinatario([], trova), '');
});

// ------------------------------------------------------------------ il progetto obbligatorio solo per Elettrodinamica (P8)

test('progetti: progettoObbligatorio su ogni caso di casi-progetto-obbligatorio.json', () => {
  const file = leggiCasi('casi-progetto-obbligatorio.json');
  assert.ok(file.casi.length >= 11);
  file.casi.forEach(c => assert.equal(RP.progettoObbligatorio(c.cliente), c.obbligatorio, JSON.stringify(c.cliente)));
  assert.equal(RP.progettoObbligatorio(null), false);
  assert.equal(RP.progettoObbligatorio(undefined), false);
});

// ------------------------------------------------------------------ i PDF (P4, P12)

const IMP = { RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', INDIRIZZO: 'Via Roma 1, 36063 Marostica (VI)', PARTITA_IVA: '03123456786', EMAIL: 'studio@esempio.it' };
const ANA = imp => ({ impostazioni: imp, clienti: [{ id: 'C001', nome: 'Elettrodinamica Srl' }, { id: 'C002', nome: 'Rossi Impianti Srl' }], commesse: [], progetti: [{ id: 7, codice: 'ED-007', descrizione: 'Quadro QE7', intestatoA: 'Acme Spa' }] });
const RAP = { id: 'RAP/2026/0153', data: '2026-11-05', stato: 'FIRMATO', idCliente: 'C001', cliente: 'Elettrodinamica Srl', idCommessa: '26ST001', idProgetto: 3, progetto: 'ED-003', progettoDescrizione: 'Quadro QE1', progettoIntestatoA: 'Batokyo Srl', descrizione: 'Cablaggio', oreLavoro: 4, oreExtra: 0, oreViaggio: 1, km: 40, spese: 0, totale: 200, tariffa: 30 };
const parteMittente = html => html.slice(html.indexOf('<div class="etichetta">Mittente</div>'), html.indexOf('<div class="etichetta">Spett.le</div>'));

test('PDF del rapportino: il codice del progetto nella barra, la commessa nel Mittente', () => {
  const html = D.rapportino(RAP, ANA(IMP), {});
  assert.ok(html.indexOf('<div class="barra"><span class="cod">ED-003</span></div>') > 0, 'la barra col progetto');
  assert.ok(html.indexOf('<span class="cod">26ST001</span>') < 0, 'la commessa non è più nella barra');
  assert.ok(parteMittente(html).indexOf('<div>Commessa 26ST001</div>') > 0, 'la commessa nel Mittente');
  assert.ok(html.indexOf('ED-003 · Quadro QE1') > 0, 'la descrizione del progetto resta nella sua cella');
  assert.ok(html.indexOf('Intestato a') > 0);
  // Senza progetto: niente barra (prima diceva "Senza commessa"); senza commessa il Mittente è quello di sempre.
  const senza = D.rapportino(Object.assign({}, RAP, { idProgetto: null, progetto: '', progettoDescrizione: '', progettoIntestatoA: '' }), ANA(IMP), {});
  assert.ok(senza.indexOf('class="barra"') < 0, 'senza progetto niente barra');
  assert.ok(parteMittente(senza).indexOf('Commessa 26ST001') > 0);
  const nulla = D.rapportino(Object.assign({}, RAP, { idCommessa: '', idProgetto: null, progetto: '' }), ANA(IMP), {});
  assert.ok(nulla.indexOf('Senza commessa') < 0 && parteMittente(nulla).indexOf('Commess') < 0, 'senza commessa né progetto: niente');
  // Il progetto dall'elenco, se il rapportino porta solo l'id.
  const daElenco = D.rapportino(Object.assign({}, RAP, { idProgetto: 7, progetto: '', progettoDescrizione: '', progettoIntestatoA: '' }), ANA(IMP), {});
  assert.ok(daElenco.indexOf('<span class="cod">ED-007</span>') > 0);
});

test('PDF del riepilogo: la colonna Progetto, le commesse nel Mittente', () => {
  const lista = [RAP, Object.assign({}, RAP, { id: 'RAP/2026/0154', data: '2026-11-06', idCommessa: '26ST004', idProgetto: null, progetto: '' }),
    Object.assign({}, RAP, { id: 'RAP/2026/0155', data: '2026-11-07' })];
  const html = D.riepilogo(lista, ANA(IMP), { nome: 'Elettrodinamica Srl', righe: [] }, 'novembre 2026', { conImporti: true });
  assert.ok(html.indexOf('<th>Progetto</th>') > 0 && html.indexOf('<th>Commessa</th>') < 0, 'la colonna si chiama Progetto');
  assert.ok(html.indexOf('<td>ED-003</td>') > 0, 'il codice del progetto');
  assert.ok(html.indexOf('<td>—</td>') > 0, 'senza progetto: la lineetta');
  assert.ok(parteMittente(html).indexOf('<div>Commesse 26ST001, 26ST004</div>') > 0, 'le commesse, una volta sola');
  const una = D.riepilogo([RAP], ANA(IMP), { nome: 'Elettrodinamica Srl', righe: [] }, 'novembre 2026', {});
  assert.ok(parteMittente(una).indexOf('<div>Commessa 26ST001</div>') > 0);
  assert.equal(D.rigaCommesse([]), '');
  assert.equal(D.rigaCommesse(['26ST001', '', '26ST001']), 'Commessa 26ST001');
});

test('PDF del riepilogo (11/11/2026): "Intestato a" fra Progetto e Lavoro svolto, data corta, il totale una volta sola', () => {
  const lista = [RAP, Object.assign({}, RAP, { id: 'RAP/2026/0154', data: '2026-11-06', idProgetto: null, progetto: '', progettoIntestatoA: '' }),
    Object.assign({}, RAP, { id: 'RAP/2026/0155', data: '2026-11-07', idProgetto: 7, progetto: '', progettoDescrizione: '', progettoIntestatoA: '' })];
  const html = D.riepilogo(lista, ANA(IMP), { nome: 'Elettrodinamica Srl', righe: [] }, 'novembre 2026', { conImporti: true });
  assert.ok(html.indexOf('<th>Progetto</th><th>Intestato a</th><th>Lavoro svolto</th>') > 0, 'la colonna nuova fra le due');
  assert.ok(html.indexOf('<td>ED-003</td><td class="int">Batokyo Srl</td><td class="desc">Cablaggio</td>') > 0, 'dal rapportino');
  assert.ok(html.indexOf('<td>ED-007</td><td class="int">Acme Spa</td>') > 0, 'dall\'elenco dei progetti, se il rapportino ha solo l\'id');
  assert.ok(html.indexOf('<td>—</td><td class="int">—</td>') > 0, 'senza progetto: due lineette');
  assert.ok(html.indexOf('<td class="data">05/11/26</td>') > 0 && html.indexOf('05/11/2026</td>') < 0, 'la data corta');
  assert.ok(html.indexOf('<tfoot><tr><td colspan="5">Totale</td>') > 0, 'il totale sotto le cinque colonne di testo');
  assert.equal(html.split('<tfoot>').length, 2, 'una riga del totale');
  assert.ok(html.indexOf('tfoot { display: table-row-group; }') > 0, 'il totale non si ripete in fondo a ogni pagina stampata');
});

test('PDF col logo e PDF_NOME spento: in cima solo il logo; Mittente e piè tengono il nome', () => {
  const conNome = D.rapportino(RAP, ANA(Object.assign({}, IMP, { STUDIO_LOGO: 'logoDiProva123' })), {});
  assert.ok(conNome.indexOf('<div class="studio-logo"><img src="/file/logoDiProva123" alt=""><div class="azienda">Studio Tecnico GM</div></div>') > 0, 'di base il nome c\'è');
  ['false', false, 0, 'NO'].forEach(v => {
    const html = D.rapportino(RAP, ANA(Object.assign({}, IMP, { STUDIO_LOGO: 'logoDiProva123', PDF_NOME: v })), {});
    assert.ok(html.indexOf('<div class="studio-logo"><img src="/file/logoDiProva123" alt=""></div>') > 0, 'solo il logo con PDF_NOME ' + JSON.stringify(v));
    assert.ok(html.indexOf('<div class="azienda">') < 0);
    assert.ok(parteMittente(html).indexOf('<div class="nome">Studio Tecnico GM</div>') > 0, 'il Mittente col nome');
    assert.ok(html.indexOf('@bottom-left { content: "Studio Tecnico GM · P.IVA 03123456786"') > 0, 'il piè col nome');
  });
  // Senza logo (o col logo spento) il nome resta comunque in cima.
  const senzaLogo = D.rapportino(RAP, ANA(Object.assign({}, IMP, { PDF_NOME: false })), {});
  assert.ok(senzaLogo.indexOf('<div class="testa"><div class="azienda">Studio Tecnico GM</div>') > 0);
  const logoSpento = D.rapportino(RAP, ANA(Object.assign({}, IMP, { STUDIO_LOGO: 'logoDiProva123', PDF_LOGO: false, PDF_NOME: false })), {});
  assert.ok(logoSpento.indexOf('<div class="testa"><div class="azienda">Studio Tecnico GM</div>') > 0);
  assert.equal(D.nomeAccantoAlLogo({}), true);
  assert.equal(D.nomeAccantoAlLogo({ PDF_NOME: true }), true);
  assert.equal(D.nomeAccantoAlLogo({ PDF_NOME: 'false' }), false);
  // Prospetto e avviso di parcella: conNome false = solo il logo; l'avviso dice le commesse se il modello le porta.
  const m = { prestatore: { denominazione: 'Studio' }, committente: { denominazione: 'Rossi' }, riferimento: 'W-1', tipoDocumento: 'TD01', righe: [], riepilogo: [] };
  assert.ok(D.prospettoFattura(m, { oggi: '2026-11-06', logo: 'logoDiProva123', conNome: false }).indexOf('alt=""></div>') > 0);
  assert.ok(D.avvisoParcella(m, { logo: 'logoDiProva123', conNome: false }).indexOf('alt=""></div>') > 0);
  // 1.4.0: nella pre-parcella la commessa sta sotto lo Spett.le, come nel modello della parcella.
  assert.ok(D.avvisoParcella(Object.assign({}, m, { commesse: ['26ST001'] }), {}).indexOf('<div class="rif">Commessa: 26ST001</div>') > 0);
  assert.ok(D.avvisoParcella(m, {}).indexOf('Commess') < 0, 'senza commesse nel modello l\'avviso resta com\'era');
});
