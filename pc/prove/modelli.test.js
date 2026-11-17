// I modelli di documento e i loro codici (docs/gestionale/modelli.md, 17/11/2026), provati con Node: l'elenco e la regola
// del rapportino giornaliero coi casi condivisi col telefono (pc/prove/casi-modelli.json = rapportino/ModelliDocumenti.kt), il codice
// in fondo a ogni PDF, la tabella del rapportino di una commessa sola (senza data e numero, con la descrizione del
// progetto), un esempio per ogni modello fatto dal modello vero.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const D = require('../ui/documenti.js');
const E = require('../ui/modelli-esempi.js');
const R = require('../ui/regole.js');

const casi = JSON.parse(fs.readFileSync(path.join(__dirname, 'casi-modelli.json'), 'utf8'));
const testo = html => html.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('il censimento: dodici modelli, ognuno col suo codice (famiglia e numero), uguali ai casi condivisi', () => {
  assert.deepEqual(D.MODELLI, casi.modelli, 'lo stesso elenco del telefono');
  assert.equal(D.MODELLI.length, 12);
  const codici = D.MODELLI.map(m => m.codice);
  assert.equal(new Set(codici).size, codici.length, 'nessun codice due volte');
  codici.forEach(c => assert.match(c, /^[A-Z]{3}-\d{2}$/, c));
  // I codici dati non cambiano più: questo elenco si allunga, non si riscrive.
  assert.deepEqual(codici, ['RAP-01', 'RAP-02', 'RAP-03', 'RAP-04', 'PRE-01', 'PRE-02', 'FAT-01', 'FAT-02', 'FAT-03', 'LET-01', 'LET-02', 'ASS-01']);
  D.MODELLI.forEach(m => {
    assert.ok(m.nome && m.quando && m.dove && m.famiglia, m.codice + ': nome, quando, dove e famiglia');
    assert.ok(!/!/.test(m.nome + m.quando + m.dove), m.codice + ': niente punti esclamativi');
  });
  assert.deepEqual([...new Set(D.MODELLI.map(m => m.famiglia))], ['Rapportini', 'Preventivi', 'Fatture', 'Lettere e contratti'], 'le famiglie, nell\'ordine della pagina');
  assert.equal(D.trovaModello('FAT-01').nome, 'Parcella pro-forma');
  assert.equal(D.trovaModello('XXX-99'), null);
  assert.equal(D.siglaModello('RAP-01'), 'Mod. RAP-01');
  assert.equal(D.siglaModello(''), '');
});

test('il modello del rapportino di un giorno: ogni caso di casi-modelli.json', () => {
  casi.rapportino.forEach(c => assert.equal(D.modelloRapportino(c.lavori, c.data), c.modello, c.nome));
  assert.equal(D.modelloRapportino(null), 'RAP-01');
});

const IMP = { RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', INDIRIZZO: 'Via Roma 1, 36063 Marostica (VI)', PARTITA_IVA: '03123456786' };
const ANA = { impostazioni: IMP, clienti: [{ id: 'C001', nome: 'Elettrodinamica Srl', indirizzo: 'Via dei Quadri 4, Bassano', partitaIva: '01234567897' }],
  commesse: [{ id: '26ST001', descrizione: 'Linea 3' }, { id: '26ST004', descrizione: 'Magazzino nuovo' }], progetti: [{ id: 9, codice: 'ED-009', descrizione: 'Nastro N2', intestatoA: 'Acme Spa' }] };
const L1 = { id: 'RAP/2026/0153', idGiornata: 'RAP/2026/0153', posizione: 1, data: '2026-11-05', stato: 'BOZZA', idCliente: 'C001', cliente: 'Elettrodinamica Srl', idCommessa: '26ST001',
  idProgetto: 3, progetto: 'ED-003', progettoDescrizione: 'Quadro QE1', progettoIntestatoA: 'Batokyo Srl', descrizione: 'Cablaggio del quadro', oreLavoro: 4, oreExtra: 0, oreViaggio: 1, km: 40, spese: 0,
  totale: 150, compensoOre: 120, rimborsoKm: 30, tariffa: 30 };
const L2 = Object.assign({}, L1, { id: 'RAP/2026/0153-2', posizione: 2, idProgetto: 9, progetto: '', progettoDescrizione: '', progettoIntestatoA: '', descrizione: 'Prova del nastro', oreLavoro: 2, oreViaggio: 0, km: 0, totale: 60, compensoOre: 60, rimborsoKm: 0 });
const L3 = Object.assign({}, L1, { id: 'RAP/2026/0153-3', posizione: 3, idProgetto: null, progetto: '', progettoDescrizione: '', progettoIntestatoA: '', descrizione: 'Riunione in cantiere', oreLavoro: 1, oreViaggio: 0, km: 0, totale: 30, compensoOre: 30, rimborsoKm: 0 });

test('RAP-01 (17/11/2026): un giorno e una commessa, nella tabella niente Data e N°, la descrizione del progetto dopo Intestato a', () => {
  const html = D.rapportino({ id: 'RAP/2026/0153', data: '2026-11-05', lavori: [L2, L1, L3] }, ANA, { conImporti: true });
  assert.equal(D.modelloDi(html), 'RAP-01');
  assert.ok(html.indexOf('<th>Progetto</th><th>Intestato a</th><th>Descrizione progetto</th><th>Lavoro svolto</th>') > 0, 'le colonne nuove');
  assert.ok(html.indexOf('<th>Data</th>') < 0 && html.indexOf('<th>N°</th>') < 0, 'niente Data e N° nella tabella');
  const righe = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  assert.equal((righe.match(/<tr>/g) || []).length, 3, 'una riga per lavoro');
  assert.ok(righe.indexOf('class="data"') < 0 && righe.indexOf('class="num"') < 0 && righe.indexOf('RAP/2026/0153') < 0 && righe.indexOf('05/11/26') < 0, 'nelle righe né la data né il numero');
  assert.ok(righe.indexOf('<td>ED-003</td><td class="int">Batokyo Srl</td><td class="prog">Quadro QE1</td><td class="desc">Cablaggio del quadro') > 0, 'progetto, Intestato a, descrizione del progetto, lavoro svolto');
  assert.ok(righe.indexOf('<td>ED-009</td><td class="int">Acme Spa</td><td class="prog">Nastro N2</td>') > 0, 'la descrizione anche dall\'elenco dei progetti');
  assert.ok(righe.indexOf('<td>—</td><td class="int">—</td><td class="prog">—</td><td class="desc">Riunione in cantiere') > 0, 'senza progetto: tre trattini');
  assert.ok(righe.indexOf('Cablaggio del quadro') < righe.indexOf('Prova del nastro') && righe.indexOf('Prova del nastro') < righe.indexOf('Riunione in cantiere'), 'in ordine di posizione');
  assert.ok(html.indexOf('<td colspan="4">Totale</td>') > 0, 'il totale sotto le quattro colonne di testo');
  // In alto restano il numero e la data, come prima.
  assert.ok(html.indexOf('<div class="etichetta">Rapportino di lavoro</div><div class="numero">RAP/2026/0153</div><div class="sotto">Elettrodinamica Srl · 05/11/2026 · 3 lavori</div>') > 0, 'numero e data nell\'intestazione');
  assert.ok(html.indexOf('Commessa 26ST001') > 0, 'la commessa nel Mittente');
  assert.ok(html.indexOf('<tr><td>Ore totali</td>') > 0 && html.indexOf('240,00') > 0, 'il conto resta');
  assert.ok(html.indexOf('@bottom-right { content: url(') > 0 && html.indexOf('"  Mod. RAP-01 · Pagina " counter(page)') > 0, 'il codice in fondo alla pagina');
  // Un lavoro solo: sempre RAP-01.
  const uno = D.rapportino({ id: 'RAP/2026/0154', data: '2026-11-06', lavori: [L1] }, ANA, {});
  assert.equal(D.modelloDi(uno), 'RAP-01');
  assert.ok(uno.indexOf('<th>Descrizione progetto</th>') > 0 && uno.indexOf('<th class="n">Importo</th>') < 0);
});

test('gli altri restano com\'erano: due commesse nello stesso rapportino (RAP-02) e il riepilogo (RAP-03) tengono Data e N°', () => {
  const altra = Object.assign({}, L2, { idCommessa: '26ST004' });
  const due = D.rapportino({ id: 'RAP/2026/0153', data: '2026-11-05', lavori: [L1, altra] }, ANA, { conImporti: true });
  assert.equal(D.modelloDi(due), 'RAP-02');
  assert.ok(due.indexOf('<th>Data</th><th>N°</th><th>Progetto</th><th>Intestato a</th><th>Lavoro svolto</th>') > 0);
  assert.ok(due.indexOf('Descrizione progetto') < 0 && due.indexOf('class="prog"') < 0);
  assert.ok(due.indexOf('<td colspan="5">Totale</td>') > 0);
  assert.ok(due.indexOf('"  Mod. RAP-02 · Pagina "') > 0);
  // Il riepilogo, anche di un giorno solo e di una commessa sola, resta il riepilogo.
  const rie = D.riepilogo([L1, L2], ANA, { nome: 'Elettrodinamica Srl', righe: [] }, 'Novembre 2026', { conImporti: true });
  assert.equal(D.modelloDi(rie), 'RAP-03');
  assert.ok(rie.indexOf('<th>Data</th><th>N°</th>') > 0 && rie.indexOf('Descrizione progetto') < 0);
  // Tolto il codice, il rapportino di più commesse è il riepilogo degli stessi lavori dal Mittente in giù (come dal 12/11/2026).
  const corpo = s => s.slice(s.indexOf('<div class="parti">'));
  const rie2 = D.riepilogo([L1, altra], ANA, { nome: 'Elettrodinamica Srl', righe: ['Via dei Quadri 4, Bassano', 'P.IVA 01234567897'] }, 'Novembre 2026', { conImporti: true });
  assert.equal(corpo(due), corpo(rie2));
});

test('il codice in fondo a ogni PDF e nella pagina: ogni modello porta il suo', () => {
  const m = { prestatore: { denominazione: 'Studio' }, committente: { denominazione: 'Rossi' }, riferimento: 'W-1', tipoDocumento: 'TD06', righe: [], riepilogo: [] };
  const p = { numero: 'PR/2026/001', data: '2026-11-01', idCliente: 'C001', sezioni: [{ id: 1, titolo: '', voci: [{ id: 1, descrizione: 'Progetto', modo: 'corpo', prezzo: 100 }] }] };
  const fatti = {
    'RAP-04': D.rapportino(L1, ANA, {}),
    'PRE-01': D.preventivo(p, ANA, {}),
    'PRE-02': D.incarico(p, ANA, {}),
    'FAT-01': D.avvisoParcella(m, {}),
    'FAT-02': D.parcella(Object.assign({}, m, { numero: '24', data: '2026-11-10' }), {}),
    'FAT-03': D.prospettoFattura(m, { oggi: '2026-11-10' }),
    'LET-01': D.lettera({ titolo: 'Verifica', testo: 'Testo', cliente: 'Rossi' }, IMP),
    'LET-02': D.lettera({ titolo: 'Lettera d\'incarico', testo: 'Testo', cliente: 'Verdi', modello: 'LET-02' }, IMP),
    'ASS-01': D.contrattoAssistenza({ numero: 'CA/2026/001', dal: '2026-01-01', al: '2026-12-31', cliente: 'Rossi', titolo: 'Assistenza' }, IMP),
  };
  Object.keys(fatti).forEach(codice => {
    assert.equal(D.modelloDi(fatti[codice]), codice, codice + ' nella pagina');
    const destra = fatti[codice].slice(fatti[codice].indexOf('@bottom-right'), fatti[codice].indexOf('counter(page)'));
    assert.ok(destra.includes('Mod. ' + codice + ' · '), codice + ' in fondo alla pagina, a destra');
    assert.equal((fatti[codice].match(/Mod\. [A-Z]{3}-\d{2}/g) || []).length, 1, codice + ': scritto una volta sola');
  });
  assert.ok(fatti['FAT-02'].indexOf('content: "Mod. FAT-02 · Parcella n. 24 · Pagina "') > 0, 'prima del nome del documento');
  assert.equal(D.modelloDi('<html></html>'), '');
  assert.equal(D.modelloDi(D.lettera({ titolo: 'x', testo: 'y', cliente: 'z', modello: 'XXX-01' }, IMP)), 'LET-01', 'un codice che non è della lettera non passa');
});

test('un esempio per ogni modello, fatto dal modello vero coi dati inventati', () => {
  assert.deepEqual(E.codici(), D.MODELLI.map(m => m.codice), 'un esempio per ogni codice, nello stesso ordine');
  D.MODELLI.forEach(m => {
    const html = E.esempio(m.codice);
    assert.equal(D.modelloDi(html), m.codice, m.codice + ': l\'esempio è di quel modello');
    assert.ok(html.indexOf('Studio Tecnico Esempio') > 0, m.codice + ': senza impostazioni, lo studio di esempio');
    assert.ok(html.indexOf('undefined') < 0 && html.indexOf('NaN') < 0 && html.indexOf('[object') < 0, m.codice + ': niente buchi');
    assert.equal(E.nomeEsempio(m.codice), 'Esempio ' + m.codice + ' ' + m.nome);
  });
  assert.equal(E.esempio('XXX-99'), '');
  // Con le impostazioni dello studio, in cima c'è lo studio di chi guarda.
  const mio = E.esempio('RAP-01', IMP);
  assert.ok(mio.indexOf('Studio Tecnico GM') > 0 && mio.indexOf('Studio Tecnico Esempio') < 0);
  assert.ok(E.esempio('FAT-01', IMP).indexOf('Studio Tecnico GM') > 0);
  // Gli esempi dei tre rapportini dicono quello che devono: una commessa, due commesse, il mese.
  const t1 = testo(E.esempio('RAP-01'));
  assert.ok(t1.includes('Commessa 26ST014') && t1.includes('Descrizione progetto') && t1.includes('Quadro generale QG1') && t1.includes('414,00 €'));
  const t2 = testo(E.esempio('RAP-02'));
  assert.ok(t2.includes('Commesse 26ST014, 26ST009') && t2.includes('Data N° Progetto') && t2.includes('266,50 €'));
  const t3 = testo(E.esempio('RAP-03'));
  assert.ok(t3.includes('Riepilogo rapportini') && t3.includes('5 lavori in 4 rapportini'));
  // I conti dell'esempio della fattura tornano: 780 + 39 di cassa + 180,18 di IVA = 999,18; meno 156 di ritenuta = 843,18.
  const tf = testo(E.esempio('FAT-01'));
  assert.ok(tf.includes('780,00 €') && tf.includes('39,00 €') && tf.includes('180,18 €') && tf.includes('999,18 €') && tf.includes('843,18 €'));
  assert.equal(Math.round((780 + 39) * 22) / 100, 180.18);
  // Lo stesso esempio due volte è uguale (dati fissi), a parte la lettera che porta la data di oggi.
  ['RAP-01', 'RAP-03', 'PRE-01', 'FAT-02', 'ASS-01'].forEach(c => assert.equal(E.esempio(c), E.esempio(c), c));
});

test('la voce Modelli nel menu: si vede con uno dei moduli che fanno documenti, non è un permesso, non per gli esterni', () => {
  const voce = R.VOCI_MENU.find(v => v.modulo === 'modelli');
  assert.ok(voce, 'la voce c\'è');
  assert.equal(voce.nome, 'Modelli dei documenti');
  assert.ok(Array.isArray(R.VEDE_CON.modelli) && R.VEDE_CON.modelli.indexOf('rapportini') >= 0);
  assert.ok(!R.RIGHE_PERMESSI.some(r => r.modulo === 'modelli'), 'non è una riga dei permessi');
  // (Le Fatture si vedono solo col permesso dei soldi: fase4.md §12.)
  const solo = modulo => { const p = { costi: modulo === 'fatturazione' ? 1 : 0 }; p[modulo] = 1; return R.vociMenu(p).map(v => v.modulo); };
  ['rapportini', 'preventivi', 'fatturazione', 'documenti', 'ticket', 'collaboratori'].forEach(mod => assert.ok(solo(mod).indexOf('modelli') >= 0, 'con ' + mod));
  assert.ok(solo('clienti').indexOf('modelli') < 0, 'con i soli clienti no');
  assert.ok(R.vociMenu({}).map(v => v.modulo).indexOf('modelli') < 0, 'senza permessi no');
});
