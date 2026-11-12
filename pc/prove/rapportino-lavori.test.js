// Il rapportino con più lavori (docs/gestionale/rapportino-lavori.md, 06/11/2026), provato con Node: come si raggruppano i
// lavori, le parole degli stati, la divisione per destinatario all'invio con oggetto e frase (casi in
// pc/prove/casi-rapportino-lavori.json), il PDF del rapportino con lavori:[...] e il riepilogo con una riga per lavoro.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const RL = require('../ui/regole-lavori.js');
const RI = require('../ui/regole-invio.js');
const D = require('../ui/documenti.js');

const casi = JSON.parse(fs.readFileSync(path.join(__dirname, 'casi-rapportino-lavori.json'), 'utf8'));

test('raggruppa: ogni caso di casi-rapportino-lavori.json', () => {
  casi.raggruppa.forEach(c => {
    const g = RL.raggruppa(c.lavori);
    assert.deepEqual(g.map(x => ({ id: x.id, data: x.data, lavori: x.lavori.map(l => l.id) })), c.rapportini, c.nome);
  });
  assert.deepEqual(RL.raggruppa([]), []);
  assert.deepEqual(RL.raggruppa(null), []);
});

test('stati: le parole (il FIRMATO di prima è Da inviare) e il riassunto del rapportino', () => {
  casi.stati.forEach(c => {
    const lavori = c.stati.map(stato => ({ stato }));
    assert.equal(RL.riassuntoStati(lavori), c.riassunto);
    assert.deepEqual(c.stati.map(RL.parolaStato), c.parole);
  });
  assert.equal(RL.statoVisto('FIRMATO'), 'BOZZA');
  assert.equal(RL.statoVisto(''), 'BOZZA');
  assert.equal(RL.daInviare({ stato: 'FIRMATO' }), true);
  assert.equal(RL.daInviare({ stato: 'INVIATO' }), false);
  assert.equal(RL.daFatturare({ stato: 'BOZZA' }), true, 'dal 06/11/2026 si fattura anche da inviare');
  assert.equal(RL.daFatturare({ stato: 'FATTURATO' }), false);
  assert.equal(RL.fermo({ stato: 'INVIATO' }), true);
  assert.equal(RL.fermo({ stato: 'BOZZA', fattura: { id: 3 } }), true, 'in una fattura non si cambia');
  assert.equal(RL.fermo({ stato: 'FIRMATO' }), false, 'il FIRMATO di prima si cambia');
});

test('lavori e clienti a parole', () => {
  casi.lavoriEClienti.forEach(c => assert.equal(RL.lavoriEClienti(c.clienti.map(idCliente => ({ idCliente }))), c.testo));
});

test('invio: un\'email per destinatario, solo coi suoi lavori; oggetto e frase da casi-invio.json', () => {
  casi.destinatari.forEach(c => {
    const gruppi = RL.perDestinatario(c.lavori);
    assert.equal(gruppi.length, c.email.length, c.nome);
    gruppi.forEach((g, i) => {
      const atteso = c.email[i];
      assert.equal(g.chiave, atteso.chiave, c.nome);
      assert.deepEqual(g.lavori.map(l => l.id), atteso.lavori, c.nome + ': solo i suoi lavori');
      const p = RL.oggettoInvio(g.lavori, RI.periodoInvio);
      assert.equal(p.oggetto, atteso.oggetto, c.nome + ' (oggetto)');
      assert.equal(p.frase, atteso.frase, c.nome + ' (frase)');
    });
    // Nessun lavoro in due email, nessuno perso.
    const tutti = gruppi.flatMap(g => g.lavori.map(l => l.id)).sort();
    assert.deepEqual(tutti, c.lavori.map(l => l.id).sort());
  });
  // Con la chiave di chi paga (quella dell'app).
  const g = RL.perDestinatario([{ id: 'a', idCliente: 'C1' }, { id: 'b', idCliente: 'C2' }], l => (l.idCliente === 'C2' ? 'c:C1' : 'c:' + l.idCliente));
  assert.equal(g.length, 1);
  assert.equal(RL.unRapportino([{ idGiornata: 'X' }, { idGiornata: 'X' }]), 'X');
  assert.equal(RL.unRapportino([{ idGiornata: 'X' }, { idGiornata: 'Y' }]), '');
});

test('la casella del rapportino: tutti, alcuni, nessuno', () => {
  const lavori = [{ id: 'a' }, { id: 'b' }];
  assert.equal(RL.casellaRapportino(lavori, new Set(['a', 'b', 'z']), l => l.id), 'tutti');
  assert.equal(RL.casellaRapportino(lavori, new Set(['b']), l => l.id), 'alcuni');
  assert.equal(RL.casellaRapportino(lavori, new Set(), l => l.id), 'nessuno');
});

// ------------------------------------------------------------------ i PDF

const IMP = { RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', INDIRIZZO: 'Via Roma 1, 36063 Marostica (VI)', PARTITA_IVA: '03123456786' };
const ANA = { impostazioni: IMP, clienti: [{ id: 'C001', nome: 'Elettrodinamica Srl', indirizzo: 'Via dei Quadri 4, Bassano', partitaIva: '01234567897' }, { id: 'C002', nome: 'Rossi Impianti Srl' }],
  commesse: [{ id: '26ST001', descrizione: 'Linea 3' }, { id: '26ST004', descrizione: 'Magazzino nuovo' }], progetti: [] };
const L1 = { id: 'RAP/2026/0153', idGiornata: 'RAP/2026/0153', posizione: 1, data: '2026-11-05', tecnico: 'Marco Bianchi', stato: 'BOZZA', idCliente: 'C001', cliente: 'Elettrodinamica Srl',
  idCommessa: '26ST001', idProgetto: 3, progetto: 'ED-003', progettoDescrizione: 'Quadro QE1', progettoIntestatoA: 'Batokyo Srl', descrizione: 'Cablaggio del quadro', oreLavoro: 4, oreExtra: 0, oreViaggio: 1, km: 40, spese: 0, totale: 150, compensoOre: 120, rimborsoKm: 30, tariffa: 30 };
const L3 = Object.assign({}, L1, { id: 'RAP/2026/0153-3', posizione: 3, idCommessa: '26ST004', idProgetto: null, progetto: '', progettoDescrizione: '', progettoIntestatoA: '',
  descrizione: 'Verifica dei finecorsa', oreLavoro: 2, oreViaggio: 0, oreExtra: 1, km: 0, spese: 12.5, noteSpese: 'Pranzo', totale: 102.5, compensoOre: 90, rimborsoKm: 0, noteInterne: 'NOTA SEGRETA' });

test('PDF del rapportino con lavori (12/11/2026): il foglio del riepilogo, col numero del rapportino in alto', () => {
  const html = D.rapportino({ id: 'RAP/2026/0153', data: '2026-11-05', tecnico: 'Marco Bianchi', lavori: [L3, L1] }, ANA, {});
  assert.ok(html.indexOf('<div class="etichetta">Rapportino di lavoro</div><div class="numero">RAP/2026/0153</div><div class="sotto">Elettrodinamica Srl · 05/11/2026 · 2 lavori</div>') > 0, 'in alto il numero, il cliente, il giorno e i lavori');
  assert.ok(html.indexOf('<table class="riepilogo">') > 0 && html.indexOf('<table class="lavori">') < 0, 'la tabella del riepilogo');
  assert.ok(html.indexOf('<th>Data</th><th>N°</th><th>Progetto</th><th>Intestato a</th><th>Lavoro svolto</th>') > 0, 'le colonne del riepilogo');
  const righe = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  assert.equal((righe.match(/<tr>/g) || []).length, 2, 'una riga per lavoro');
  assert.equal((righe.match(/<td class="num">RAP\/2026\/0153<\/td>/g) || []).length, 2, 'il N° è il numero del rapportino, su una riga');
  assert.ok(righe.indexOf('RAP/2026/0153-3') < 0, 'mai il numero interno del lavoro');
  assert.ok(righe.indexOf('Cablaggio del quadro') < righe.indexOf('Verifica dei finecorsa'), 'in ordine di posizione');
  assert.ok(righe.indexOf('<td>ED-003</td><td class="int">Batokyo Srl</td>') > 0, 'progetto e Intestato a nelle loro colonne');
  assert.ok(righe.indexOf('<td class="data">05/11/26</td>') > 0, 'la data corta');
  assert.ok(html.indexOf('<td colspan="5">Totale</td>') > 0, 'il totale come nel riepilogo');
  const mitt = html.slice(html.indexOf('Mittente'), html.indexOf('Spett.le'));
  assert.ok(mitt.indexOf('Commesse 26ST001, 26ST004') > 0, 'le commesse nel Mittente');
  const spett = html.slice(html.indexOf('Spett.le'), html.indexOf('<table'));
  assert.ok(spett.indexOf('Elettrodinamica Srl') > 0 && spett.indexOf('Via dei Quadri 4, Bassano') > 0 && spett.indexOf('P.IVA 01234567897') > 0, 'il destinatario');
  assert.ok(html.indexOf('Firma') < 0, 'niente firme, come nel riepilogo');
  assert.ok(html.indexOf('NOTA SEGRETA') < 0, 'le note per sé non vanno mai sul PDF');
  assert.ok(html.indexOf('Importo') < 0 && html.indexOf('150,00') < 0, 'senza importi');
  assert.ok(html.indexOf('Pranzo') > 0 && html.indexOf('12,50 €') > 0, 'le spese con la loro nota');
  assert.ok(html.indexOf('Da firmare') < 0 && html.indexOf('Firmato') < 0 && html.indexOf('Bozza') < 0);
});

test('PDF del rapportino con lavori: gli importi come nel riepilogo, la firma di prima, un lavoro solo, il rapportino di prima', () => {
  const html = D.rapportino({ id: 'RAP/2026/0153', data: '2026-11-05', lavori: [L1, L3] }, ANA, { conImporti: true });
  assert.ok(html.indexOf('<th class="n">Importo</th>') > 0);
  assert.ok(html.indexOf('<tr><td>Ore totali</td>') > 0, 'il conto del riepilogo');
  assert.ok(html.indexOf('252,50') > 0, 'il totale: 150 + 102,50');
  // Uguale al riepilogo degli stessi lavori, a parte la testa e il titolo della pagina.
  const rie = D.riepilogo([L1, L3], ANA, { nome: 'Elettrodinamica Srl', righe: ['Via dei Quadri 4, Bassano', 'P.IVA 01234567897'] }, 'Novembre 2026', { conImporti: true });
  const corpo = s => s.slice(s.indexOf('<div class="parti">'));
  assert.equal(corpo(html), corpo(rie), 'dal Mittente in giù è il riepilogo');
  const vecchio = D.rapportino({ id: 'RAP/2026/0153', data: '2026-11-05', lavori: [Object.assign({}, L1, { stato: 'FIRMATO', firma: { id: 'firmaVecchia1' }, firmatario: 'Giulia Dal Santo' })] }, ANA, {});
  assert.ok(vecchio.indexOf('/file/firmaVecchia1') > 0 && vecchio.indexOf('Firma per accettazione · Giulia Dal Santo') > 0, 'un lavoro di prima con la firma la mostra ancora');
  const uno = D.rapportino({ id: 'RAP/2026/0154', data: '2026-11-06', lavori: [L1] }, ANA, {});
  assert.ok(uno.indexOf('Elettrodinamica Srl · 06/11/2026 · 1 lavoro') > 0);
  assert.ok(uno.indexOf('Commessa 26ST001') > 0);
  // Il luogo, gli strumenti e il ticket sotto il lavoro, solo quando ci sono.
  const con = D.rapportino({ id: 'RAP/2026/0155', data: '2026-11-06', lavori: [Object.assign({}, L1, { luogo: 'Cabina 2', ticket: 'TK-7', strumenti: [{ nome: 'Multimetro 87V', matricola: '6011' }] })] }, ANA, {});
  assert.ok(con.indexOf('<div class="sotto-riga">Luogo: Cabina 2</div><div class="sotto-riga">Strumenti: Multimetro 87V matr. 6011</div><div class="sotto-riga">Ticket TK-7</div>') > 0);
  // L'indirizzo intero del cliente, come nel riepilogo (CAP, città, provincia).
  const ana2 = Object.assign({}, ANA, { clienti: [{ id: 'C001', nome: 'Elettrodinamica Srl', indirizzo: 'Via dei Quadri 4', cap: '36061', citta: 'Bassano del Grappa', provincia: 'vi' }] });
  assert.ok(D.rapportino({ id: 'RAP/2026/0154', data: '2026-11-06', lavori: [L1] }, ana2, {}).indexOf('<div>Via dei Quadri 4, 36061 Bassano del Grappa (VI)</div>') > 0);
  // Senza lavori: come prima (un lavoro solo, la barra col progetto).
  const prima = D.rapportino(L1, ANA, {});
  assert.ok(prima.indexOf('<div class="barra"><span class="cod">ED-003</span></div>') > 0);
  assert.ok(prima.indexOf('Firma per accettazione') < 0, 'anche il rapportino di prima senza firma non ha il riquadro');
  assert.ok(prima.indexOf('Bozza') < 0 && prima.indexOf('Da firmare') < 0);
});

test('PDF del riepilogo: una riga per lavoro, N° = il numero del rapportino', () => {
  const L2 = Object.assign({}, L1, { id: 'RAP/2026/0154', idGiornata: 'RAP/2026/0154', numero: 'RAP/2026/0154', data: '2026-11-06' });
  const html = D.riepilogo([L1, L3, L2], ANA, { nome: 'Elettrodinamica Srl', righe: [] }, 'novembre 2026', {});
  const righe = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  assert.equal((righe.match(/<tr>/g) || []).length, 3);
  assert.equal((righe.match(/<td class="num">RAP\/2026\/0153<\/td>/g) || []).length, 2, 'i due lavori del 153 col numero del rapportino');
  // 12/11/2026: nello stesso giorno, i lavori di un rapportino in ordine di posizione (prima uscivano al contrario).
  assert.ok(righe.indexOf('Cablaggio del quadro') < righe.indexOf('Verifica dei finecorsa'), 'il 153 in ordine di posizione');
  assert.ok(righe.indexOf('RAP/2026/0153-3') < 0, 'mai il numero interno del lavoro');
  assert.ok(html.indexOf('Elettrodinamica Srl · 3 lavori in 2 rapportini') > 0);
});
