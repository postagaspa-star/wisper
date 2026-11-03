// Fase 4: il ritorno dell'XML (fase4.md §9) e le fatture ricevute. Si leggono i file d'esempio di prove/xml (dati
// inventati: XML in UTF-8 e ISO-8859-1, con e senza prefissi, p7m DER e base64 spezzato, zip, lotto, nota TD04, RC
// e NS, ricevute) e quelli scritti qui sul momento. L'abbinamento: certa (Rif. Wisper), probabile (stesso totale),
// diversa (righe che mancano: vince l'XML e tornano da fatturare solo i gruppi che mancano per intero), senza bozza
// (con le cose da collegare); i doppioni, lo scarto dello SDI che riporta a pronta, le note di credito, la sicurezza.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
// Le fatture del 2026 e gli XML di ritorno (scadenze di novembre) hanno date fisse (la storia del prototipo): queste
// prove le guardano dal giorno del prototipo, giovedi' 22/10/2026, qualunque giorno sia (anche con
// WISPER_OGGI_PROVA). Le altre prove girano sul giorno vero.
giornoDeiPrototipi();
const { scriviFatturaPA } = require('../src/fatturapa');
const { oggi } = require('../src/utili');

const XML = path.join(__dirname, 'xml');
const file = nome => ({ nome, base64: fs.readFileSync(path.join(XML, nome)).toString('base64') });
const testo = (nome, sost) => {
  let x = fs.readFileSync(path.join(XML, nome), 'utf8');
  for (const [a, b] of sost || []) x = x.split(a).join(b);
  return { nome: nome.replace(/\.xml$/, '-modificato.xml'), base64: Buffer.from(x, 'utf8').toString('base64') };
};

let s;
let manuel;
let marco;
let lettura;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
});
test.after(() => s.ferma());

const db = () => s.wisper.db;
const leggi = async lista => {
  const r = await manuel('leggiXml', { file: lista });
  assert.equal(r.ok, true, r.errore);
  return r;
};
const doc = (l, numero) => l.documenti.find(d => d.numero === numero);

/** Un XML emesso scritto ora dal modello di una fattura (numero e data veri; senza "Rif. Wisper" se si chiede). */
async function xmlDa(idFattura, numero, opzioni) {
  const o = opzioni || {};
  const m = (await manuel('pacchetto', { id: idFattura })).modello;
  m.data = o.data || oggi();
  if (o.senzaRif) { m.riferimento = ''; m.causale = ['Prestazioni']; }
  m.pagamento.dettagli.forEach(x => { x.iban = 'IT60X0542811101000000123456'; });
  return { nome: 'IT00000000000_' + numero.replace(/\D/g, '').padStart(5, '0') + '.xml', base64: Buffer.from(scriviFatturaPA(m, { numero }), 'utf8').toString('base64') };
}

// ------------------------------------------------------------------ leggere: lo zip, i quattro casi, gli scartati

test('leggiXml: lo zip di ottobre, quattro documenti con la loro proposta e i due file scartati', async () => {
  const l = await leggi([file('fatture-ottobre.zip')]);
  assert.match(l.idLettura, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(l.documenti.length, 4);
  // 46/2026: la bozza W-14 di Mario Bianchi, certa ("Rif. Wisper W-14" nella causale).
  const d46 = doc(l, '46/2026');
  assert.deepEqual([d46.tipo, d46.tipoDocumento, d46.data, d46.nomeFile], ['emessa', 'TD01', '2026-10-22', 'IT00000000000_00046.xml.p7m']);
  assert.deepEqual(d46.controparte, { nome: 'Mario Bianchi', partitaIva: '', codiceFiscale: 'BNCMRA70C12L840K', idSoggetto: 'C003' });
  assert.deepEqual(d46.conti, { compenso: 250, contributo: 12.5, iva: 57.75, anticipazioni: 0, bollo: 0, bolloAddebitato: 0, totale: 320.25, ritenuta: 0, netto: 320.25 });
  assert.deepEqual(d46.scadenze, [{ data: '2026-11-21', importo: 320.25 }]);
  assert.deepEqual([d46.proposta.azione, d46.proposta.certezza, d46.proposta.idFattura, d46.proposta.riferimento], ['abbina', 'certa', 14, 'W-14']);
  // 47/2026: Elettrodinamica, nessuna bozza: senza bozza, coi rapportini di settembre da collegare (stesso compenso).
  const d47 = doc(l, '47/2026');
  assert.deepEqual([d47.proposta.azione, d47.proposta.certezza], ['senzaBozza', 'nessuna']);
  const sett = d47.proposta.collegabili.find(c => c.gruppo === 'rapportini:C001:2026-09');
  assert.deepEqual([sett.titolo, sett.importo, sett.spuntato, sett.voci.length], ['Settembre 2026 · 6 rapportini', 1393.92, true, 8]);
  assert.ok(d47.proposta.collegabili.filter(c => c !== sett).every(c => !c.spuntato), 'solo quello con lo stesso compenso');
  // La ricevuta di Comel, fornitore nuovo.
  const comel = doc(l, '1301');
  assert.deepEqual([comel.tipo, comel.proposta.azione, comel.controparte.idSoggetto, comel.fornitoreNuovo.nome], ['ricevuta', 'nuova', null, 'Comel Forniture Elettriche']);
  assert.deepEqual(comel.conti, { totale: 117.58, imponibile: 96.38, iva: 21.2, contributo: 0, bollo: 0, ritenuta: 0, netto: 117.58 });
  // 45/2026: c'e' gia' (i dati di esempio).
  const d45 = doc(l, '45/2026');
  assert.deepEqual([d45.proposta.azione, d45.proposta.idFattura], ['gia', 13]);
  assert.deepEqual(d45.avvisi, ['Già importata il 20/10']);
  assert.deepEqual(l.scartati.map(x => x.nomeFile).sort(), ['foto.jpg', 'vecchie.zip']);
  assert.ok(l.scartati.find(x => x.nomeFile === 'foto.jpg').motivo.startsWith('Non è un file di fattura'));
  assert.equal(db().riga('SELECT COUNT(*) n FROM letture_xml').n >= 1, true, 'la lettura resta un\'ora');
  assert.equal(db().riga("SELECT COUNT(*) n FROM fatture WHERE numero = '46/2026'").n, 0, 'leggere non cambia niente');
});

test('confermaXml: abbina la certa, crea la senza bozza collegando settembre, aggiunge la ricevuta, salta il doppione', async () => {
  const l = await leggi([file('fatture-ottobre.zip')]);
  const d47 = doc(l, '47/2026');
  const collega = d47.proposta.collegabili.find(c => c.spuntato).voci;
  const r = await manuel('confermaXml', { idLettura: l.idLettura, scelte: [
    { chiave: doc(l, '46/2026').chiave, azione: 'abbina', idFattura: 14 },
    { chiave: d47.chiave, azione: 'senzaBozza', collega },
    { chiave: doc(l, '1301').chiave, azione: 'nuova', categoria: 'materiale' },
    { chiave: doc(l, '45/2026').chiave, azione: 'salta' }] });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual(r.conteggi, { abbinate: 1, nuove: 1, ricevute: 1, note: 0, esiti: 0, saltate: 1 });
  const w14 = r.fatture.find(f => f.riferimento === 'W-14');
  assert.deepEqual([w14.stato, w14.numero, w14.numeroDa, w14.etichetta, w14.data, w14.statoVisto, w14.residuo], ['emessa', '46/2026', 'xml', '46/2026', '2026-10-22', 'Pagata', 0]);
  assert.equal(w14.file.nome, 'IT00000000000_00046.xml.p7m');
  assert.equal(w14.nomeFileSdi, 'IT00000000000_00046.xml.p7m');
  assert.ok(w14.righe.every(x => x.origine === 'xml'));
  // Il file com'era (il .p7m): chi vede le fatture lo scarica, il collaboratore no.
  const scaricato = await manuel.file(w14.file.id);
  assert.equal(scaricato.status, 200);
  assert.deepEqual(Buffer.from(await scaricato.arrayBuffer()), fs.readFileSync(path.join(XML, 'IT00000000000_00046.xml.p7m')));
  assert.equal((await marco.file(w14.file.id)).status, 403);
  // La 47: emessa senza bozza, coi rapportini di settembre fatturati (escono da Da fatturare).
  const f47 = r.fatture.find(f => f.numero === '47/2026');
  assert.deepEqual([f47.stato, f47.idCliente, f47.conti.totale, f47.conti.netto, f47.sorgenti.length], ['emessa', 'C001', 1785.62, 1506.84, 8]);
  const df = await manuel('daFatturare', { idCliente: 'C001' });
  assert.equal(df.gruppi[0].voci.some(v => v.gruppo === 'rapportini:C001:2026-09'), false);
  const rap = (await manuel('rapportini', { tutti: true })).rapportini.filter(x => collega.some(v => v.tipo === 'rapportino' && v.id === x.id));
  assert.ok(rap.every(x => x.stato === 'FATTURATO' && x.fatturatoIl === '2026-10-21'));
  // La ricevuta di Comel, col fornitore nuovo creato dai dati dell'XML.
  const comel = r.ricevute[0];
  assert.deepEqual([comel.fornitore, comel.numero, comel.totale, comel.daPagare, comel.categoria, comel.origine, comel.statoVisto], ['Comel Forniture Elettriche', '1301', 117.58, 117.58, 'materiale', 'xml', 'Da pagare']);
  const fornitore = (await manuel('anagrafiche')).fornitori.find(x => x.nome === 'Comel Forniture Elettriche');
  assert.deepEqual([fornitore.partitaIva, fornitore.cliente, fornitore.fornitore, fornitore.citta], ['09988776655', false, true, 'Padova']);
  // La stessa lettura non si conferma due volte.
  assert.equal((await manuel('confermaXml', { idLettura: l.idLettura, scelte: [] })).errore, 'La lettura è scaduta: carica di nuovo i file');
  // Lo stesso XML una seconda volta: un doppione.
  const ancora = await leggi([file('IT00000000000_00046.xml.p7m')]);
  assert.deepEqual([ancora.documenti[0].proposta.azione, ancora.documenti[0].proposta.idFattura], ['gia', 14]);
  assert.match(ancora.documenti[0].avvisi[0], /^Già importata il \d\d\/\d\d$/);
  const comelDiNuovo = await leggi([file('IT09988776655_0A1B2.xml.p7m')]);
  assert.equal(comelDiNuovo.documenti[0].proposta.azione, 'gia');
});

test('lo SDI scarta la 46/2026: torna pronta, gli effetti si tolgono, la riga rossa lo dice; RC della 45 consegnata', async () => {
  const l = await leggi([file('IT00000000000_00046_NS_001.xml'), file('IT00000000000_00045_RC_001.xml'), file('IT00000000000_00045_MT_001.xml')]);
  const ns = l.documenti.find(d => d.esito === 'scartata');
  const rc = l.documenti.find(d => d.esito === 'consegnata');
  assert.deepEqual([ns.tipo, ns.proposta.azione, ns.proposta.idFattura, ns.nomeFileFattura], ['esito', 'abbina', 14, 'IT00000000000_00046.xml.p7m']);
  assert.deepEqual(ns.errori, [{ codice: '00404', descrizione: 'Fattura duplicata' }]);
  assert.deepEqual([rc.proposta.azione, rc.proposta.idFattura], ['abbina', 13]);
  assert.match(l.scartati[0].motivo, /^Non serve/);
  const r = await manuel('confermaXml', { idLettura: l.idLettura, scelte: [{ chiave: ns.chiave, azione: 'abbina' }, { chiave: rc.chiave, azione: 'abbina' }] });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.conteggi.esiti, 2);
  const w14 = (await manuel('fattura', { id: 14 })).fattura;
  assert.deepEqual([w14.stato, w14.esitoSdi, w14.numero, w14.file, w14.statoVisto], ['pronta', 'scartata', '', null, 'Pronta · già pagata']);
  assert.ok(w14.avvisi.some(a => a.testo === 'Lo SDI l\'ha scartata il 23/10: correggila nel programma e importa di nuovo l\'XML'));
  assert.ok(w14.righe.every(x => x.origine === 'bozza'), 'le righe della bozza');
  assert.equal((await manuel('fattura', { id: 13 })).fattura.esitoSdi, 'consegnata');
  // Corretta nel programma: l'XML di nuovo (stesso numero) la riabbina, certa.
  const di = await leggi([file('IT00000000000_00046.xml.p7m')]);
  assert.deepEqual([di.documenti[0].proposta.azione, di.documenti[0].proposta.certezza, di.documenti[0].proposta.idFattura], ['abbina', 'certa', 14]);
  const ok = await manuel('confermaXml', { idLettura: di.idLettura, scelte: [{ chiave: di.documenti[0].chiave, azione: 'abbina', idFattura: 14 }] });
  assert.equal(ok.fatture[0].stato, 'emessa');
  // Un esito per un file che Wisper non ha.
  const ignoto = await leggi([testo('IT00000000000_00046_NS_001.xml', [['IT00000000000_00046.xml.p7m', 'IT00000000000_09999.xml']])]);
  assert.deepEqual([ignoto.documenti[0].proposta.azione, ignoto.documenti[0].avvisi], ['salta', ['Esito per un file che Wisper non ha']]);
});

test('probabile e diversa con la W-15: vince l\'XML, tornano da fatturare solo i gruppi che mancano per intero', async () => {
  // La 48/2026 (p7m in base64, con la busta spezzata) ha lo stesso totale della W-15 e nessun riferimento: probabile.
  const p = await leggi([file('IT00000000000_00048.xml.p7m')]);
  const d48 = p.documenti[0];
  assert.deepEqual([d48.proposta.azione, d48.proposta.certezza, d48.proposta.idFattura, d48.conti.totale], ['abbina', 'probabile', 15, 2069.12]);
  assert.deepEqual([d48.proposta.differenze, d48.proposta.righeMancanti], [[], []]);
  // La 49/2026 ha solo i 1.520: diversa, con le differenze e la riga della spesa che manca.
  const l = await leggi([file('IT00000000000_00049.xml')]);
  const d49 = l.documenti[0];
  assert.deepEqual([d49.proposta.azione, d49.proposta.certezza, d49.proposta.idFattura], ['abbina', 'diversa', 15]);
  assert.deepEqual(d49.proposta.differenze, [{ campo: 'totale', bozza: 2069.12, xml: 1947.12 }, { campo: 'anticipazioni', bozza: 120, xml: 0 }, { campo: 'bollo', bozza: 2, xml: 0 }]);
  assert.equal(d49.proposta.righeMancanti.length, 1);
  const mancante = d49.proposta.righeMancanti[0];
  assert.deepEqual([mancante.tipo, mancante.importo], ['anticipazione', 120]);
  assert.match(mancante.gruppo, /^spesa:\d+$/);
  assert.deepEqual(d49.proposta.libera, [mancante.gruppo], 'gia\' spuntato');
  // "Abbina lo stesso": vince l'XML, la bozza tiene i suoi conti, la spesa torna da fatturare. Il gruppo della
  // scadenza e' nell'XML: anche se lo si chiede, resta fatturato.
  const scadenza = (await manuel('fattura', { id: 15 })).fattura.sorgenti.find(x => x.tipo === 'scadenza');
  const r = await manuel('confermaXml', { idLettura: l.idLettura, scelte: [{ chiave: d49.chiave, azione: 'abbina', idFattura: 15, libera: [mancante.gruppo, scadenza.gruppo] }] });
  assert.equal(r.ok, true, r.errore);
  const f = r.fatture[0];
  assert.deepEqual([f.stato, f.numero, f.conti.totale, f.conti.netto, f.totaleBozza, f.nettoBozza], ['emessa', '49/2026', 1947.12, 1643.12, 2069.12, 1765.12]);
  assert.ok(f.avvisi.some(a => a.tipo === 'diversa'));
  assert.ok(r.avvisi.some(a => /è \(almeno in parte\) nell'XML: resta fatturato$/.test(a)));
  assert.deepEqual(f.sorgenti.filter(x => x.attiva).map(x => x.tipo), ['scadenza']);
  assert.equal(f.sorgenti.find(x => x.tipo === 'spesa').liberataPerche, 'non è nella fattura 49/2026');
  const df = await manuel('daFatturare', { idCliente: 'C002' });
  assert.ok(df.gruppi[0].voci.some(v => v.tipo === 'spesa' && v.titolo === 'Pratica di connessione al distributore'), 'la pratica torna da fatturare');
  assert.equal(db().riga('SELECT stato FROM scadenze_pagamento WHERE id = ?', Number(scadenza.id)).stato, 'fatturata');
  // Ora la 48 non ha piu' bozze: senza bozza.
  assert.equal((await leggi([file('IT00000000000_00048.xml.p7m')])).documenti[0].proposta.azione, 'senzaBozza');
});

test('probabile con le alternative; emessa a mano e poi l\'XML con lo stesso numero (si attacca)', async () => {
  const df = await manuel('daFatturare', { idCliente: 'C002' });
  const ore = df.gruppi[0].voci.filter(v => v.tipo === 'ore');
  const a = (await manuel('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'ore', id: ore[0].id }] })).fattura;
  const xml = await xmlDa(a.id, '60/2026', { senzaRif: true });
  const l = await leggi([xml]);
  assert.deepEqual([l.documenti[0].proposta.certezza, l.documenti[0].proposta.idFattura], ['probabile', a.id]);
  // Emessa a mano: l'XML con lo stesso numero e anno le si attacca (certa).
  await manuel('segnaEmessa', { id: a.id, numero: '60/2026', data: oggi(), conferma: true });
  const di = await leggi([xml]);
  assert.deepEqual([di.documenti[0].proposta.azione, di.documenti[0].proposta.certezza, di.documenti[0].proposta.idFattura], ['abbina', 'certa', a.id]);
  const r = await manuel('confermaXml', { idLettura: di.idLettura, scelte: [{ chiave: di.documenti[0].chiave, azione: 'abbina', idFattura: a.id }] });
  assert.deepEqual([r.fatture[0].numeroDa, !!r.fatture[0].file, r.fatture[0].stato], ['xml', true, 'emessa']);
});

test('note di credito al ritorno: la parziale senza bozza chiede cosa torna; la totale preparata in Wisper annulla e libera', async () => {
  // La 3/2026 (sample 50) storna 200 della 45/2026: senza bozza, parziale.
  const l = await leggi([file('IT00000000000_00050.xml')]);
  const d = l.documenti[0];
  assert.deepEqual([d.tipoDocumento, d.proposta.azione, d.proposta.totale, d.proposta.libera], ['TD04', 'senzaBozza', false, []]);
  assert.deepEqual(d.fatturaCollegata, { idFattura: 13, numero: '45/2026' });
  assert.equal(d.proposta.gruppiFattura.length, 1);
  assert.ok(d.avvisi.includes('Nota di credito parziale: scegli cosa torna da fatturare'));
  const r = await manuel('confermaXml', { idLettura: l.idLettura, scelte: [{ chiave: d.chiave, azione: 'senzaBozza' }] });
  assert.deepEqual([r.conteggi.note, r.fatture[0].tipo, r.fatture[0].etichetta, r.fatture[0].idFatturaCollegata], [1, 'nota', 'Nota di credito 3/2026', 13]);
  const f45 = (await manuel('fattura', { id: 13 })).fattura;
  assert.deepEqual([f45.stato, f45.residuo], ['emessa', Math.round((1232.34 - 216.2) * 100) / 100]);
  assert.ok(f45.sorgenti.every(x => x.attiva), 'niente torna da fatturare');
  // Una nota totale preparata in Wisper (tutto il resto): torna come XML, certa; la 45 e' annullata, il 30% torna da fatturare.
  db().esegui("UPDATE fatture SET stato = 'scartata' WHERE numero = '3/2026'");
  const nota = (await manuel('preparaNotaCredito', { idFattura: 13, tutta: true, motivo: 'Acconto rifatto' })).fattura;
  const xml = await xmlDa(nota.id, '5/2026');
  const ln = await leggi([xml]);
  assert.deepEqual([ln.documenti[0].proposta.certezza, ln.documenti[0].proposta.idFattura], ['certa', nota.id]);
  const c = await manuel('confermaXml', { idLettura: ln.idLettura, scelte: [{ chiave: ln.documenti[0].chiave, azione: 'abbina', idFattura: nota.id }] });
  assert.equal(c.ok, true, c.errore);
  assert.equal((await manuel('fattura', { id: 13 })).fattura.stato, 'annullata');
  const df = await manuel('daFatturare', { idCliente: 'C002' });
  assert.ok(df.gruppi[0].voci.some(v => v.tipo === 'scadenza' && v.titolo === '30% alla firma' && v.idCommessa === '26ST003'), 'il 30% torna da fatturare');
});

test('una fattura per un cliente che Wisper non ha: si propone di crearlo dai dati dell\'XML', async () => {
  const l = await leggi([testo('IT00000000000_00052.xml', [['BNCMRA70C12L840K', 'VRDLGU80A01L840X'], ['Mario', 'Luigi'], ['Bianchi', 'Verdi'], ['52/2026', '81/2026'], ['53/2026', '82/2026']])]);
  const d = l.documenti[0];
  assert.deepEqual([d.controparte.idSoggetto, d.proposta.azione, d.clienteNuovo.nome, d.clienteNuovo.codiceFiscale], [null, 'senzaBozza', 'Luigi Verdi', 'VRDLGU80A01L840X']);
  const no = await manuel('confermaXml', { idLettura: l.idLettura, scelte: [{ chiave: d.chiave, azione: 'senzaBozza' }] });
  assert.equal(no.errore, 'La fattura 81/2026: scegli il cliente o crealo dai dati dell\'XML');
  const l2 = await leggi([testo('IT00000000000_00052.xml', [['BNCMRA70C12L840K', 'VRDLGU80A01L840X'], ['Mario', 'Luigi'], ['Bianchi', 'Verdi'], ['52/2026', '81/2026'], ['53/2026', '82/2026']])]);
  const r = await manuel('confermaXml', { idLettura: l2.idLettura, scelte: l2.documenti.map(x => ({ chiave: x.chiave, azione: 'senzaBozza', creaCliente: true })) });
  assert.equal(r.ok, true, r.errore);
  const nuovo = (await manuel('anagrafiche')).clienti.find(c => c.nome === 'Luigi Verdi');
  assert.deepEqual([nuovo.codiceFiscale, nuovo.citta, nuovo.cliente], ['VRDLGU80A01L840X', 'Marostica', true]);
  assert.ok(r.fatture.every(f => f.idCliente === nuovo.id), 'tutte e due per lo stesso cliente, creato una volta');
});

test('lotto: due fatture in un file (due body) sono due documenti', async () => {
  const l = await leggi([file('IT00000000000_00052.xml')]);
  assert.deepEqual(l.documenti.map(d => [d.chiave, d.numero, d.conti.totale]), [['f1#1', '52/2026', 128.1], ['f1#2', '53/2026', 256.2]]);
  const r = await manuel('confermaXml', { idLettura: l.idLettura, scelte: l.documenti.map(d => ({ chiave: d.chiave, azione: 'senzaBozza' })) });
  assert.equal(r.conteggi.nuove, 2);
  assert.ok(r.fatture.every(f => f.idCliente === 'C003' && f.stato === 'emessa'));
});

test('fatture ricevute: ritenuta e scadenza stimata, la spesa gia\' fotografata, la proposta F24 1040 dopo il pagamento', async () => {
  // Una spesa della fase 3 con lo stesso importo e il nome del fornitore: l'avviso per non contarla due volte.
  const spesa = (await manuel('salvaSpesa', { spesa: { data: '2026-10-19', importo: 659.78, categoria: 'altro', descrizione: 'Consulenza Verdi calcoli', destinazione: 'studio' } })).spesa;
  const l = await leggi([file('IT01122334459_00015.xml')]);
  const d = l.documenti[0];
  assert.deepEqual([d.tipo, d.controparte.idSoggetto, d.conti.ritenuta, d.conti.netto, d.proposta.categoria, d.proposta.idSpesa], ['ricevuta', 'F003', 104, 555.78, 'consulenze', spesa.id]);
  assert.ok(d.avvisi.includes('Scadenza non scritta nella fattura: messa a 30 giorni'));
  assert.ok(d.avvisi.includes('Potrebbe essere la spesa del 19/10 di 659,78 €: collegala per non contarla due volte nei costi'));
  const r = await manuel('confermaXml', { idLettura: l.idLettura, scelte: [{ chiave: d.chiave, azione: 'nuova', idSpesa: spesa.id, idCommessa: '26ST003' }] });
  const ric = r.ricevute[0];
  assert.deepEqual([ric.scadenzaStimata, ric.scadenze[0].data, ric.scadenze[0].importo, ric.idSpesa, ric.idCommessa, ric.contributo], [true, '2026-11-17', 555.78, spesa.id, '26ST003', 20.8]);
  // Le scadenze stimate si correggono; quelle scritte nell'XML no.
  const corretta = await manuel('salvaRicevuta', { ricevuta: { id: ric.id, scadenze: [{ data: '2026-11-30', importo: 555.78 }] } });
  assert.deepEqual([corretta.ok, corretta.ricevuta.scadenzaStimata, corretta.ricevuta.scadenze[0].data], [true, false, '2026-11-30']);
  assert.equal((await manuel('salvaRicevuta', { ricevuta: { id: ric.id, scadenze: [{ data: '2026-12-01' }] } })).errore, 'Le scadenze di questa fattura sono scritte nell\'XML: non si cambiano');
  // Il pagamento: la proposta delle ritenute di ottobre cresce (100 della fattura 12 + 104).
  const pag = await manuel('segnaPagamento', { idRicevuta: ric.id, data: '2026-10-25' });
  assert.equal(pag.ok, true, pag.errore);
  assert.deepEqual([pag.ricevuta.statoVisto, pag.movimento.importo], ['Pagata', 555.78]);
  const proposta = (await manuel('impegni', {})).impegni.find(i => i.origine === 'ritenute' && i.periodo === '2026-10');
  assert.deepEqual([proposta.importo, proposta.codice, proposta.scadenza, proposta.proposta, proposta.descrizione], [204, '1040', '2026-11-16', true, 'Ritenute sui compensi pagati a ottobre']);
  // annullaRicevuta: con dei pagamenti no.
  assert.equal((await manuel('annullaRicevuta', { id: ric.id, motivo: 'doppia' })).errore, 'Ha già dei pagamenti: annulla prima i movimenti');
  // ricevute: elenco e filtri.
  assert.ok((await manuel('ricevute', { stato: 'pagate' })).ricevute.some(x => x.id === ric.id));
  assert.equal((await manuel('ricevute', { stato: 'da_pagare' })).ricevute.some(x => x.id === ric.id), false);
});

test('ricevute a mano: i controlli, le scadenze che fanno il netto, il doppione, l\'annullamento', async () => {
  const no = async (r, frase) => assert.equal((await manuel('salvaRicevuta', { ricevuta: r })).errore, frase);
  await no({ numero: '1', totale: 10 }, 'Fornitore: scegli il fornitore');
  await no({ idFornitore: 'F002', totale: 10 }, 'Numero: scrivi il numero della fattura');
  await no({ idFornitore: 'F002', numero: '9' }, 'Totale: scrivi quanto');
  await no({ idFornitore: 'F002', numero: '9', totale: 100, scadenze: [{ data: '2026-11-01', importo: 50 }] }, 'Le scadenze fanno 50,00 €: devono fare il netto da pagare, 100,00 €');
  const r = await manuel('salvaRicevuta', { ricevuta: { idFornitore: 'F002', numero: '9', data: '2026-10-20', totale: 100, categoria: 'servizi' } });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.ricevuta.scadenzaStimata, r.ricevuta.scadenze[0].data, r.ricevuta.origine], [true, '2026-11-19', 'mano']);
  await no({ idFornitore: 'F002', numero: '9', data: '2026-10-21', totale: 100 }, 'C\'è già la fattura 9 di Noleggi Piattaforme Prova Snc');
  assert.equal((await manuel('annullaRicevuta', { id: r.ricevuta.id })).errore, 'Motivo: scrivi perché la annulli');
  const a = await manuel('annullaRicevuta', { id: r.ricevuta.id, motivo: 'scritta per errore' });
  assert.deepEqual([a.ricevuta.stato, a.ricevuta.statoVisto, a.ricevuta.daPagare], ['annullata', 'Annullata', 0]);
});

// ------------------------------------------------------------------ cosa non si legge

test('sicurezza e scarti: DOCTYPE, file che non sono fatture, fatture non dello studio, autofatture, troppi file', async () => {
  const xml45 = fs.readFileSync(path.join(XML, 'IT00000000000_00045.xml'), 'utf8');
  const doctype = xml45.replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>');
  const l = await leggi([{ nome: 'cattivo.xml', base64: Buffer.from(doctype).toString('base64') }, { nome: 'foto.jpg', base64: 'AAAA' },
    testo('IT00000000000_00045.xml', [['<IdCodice>00000000000</IdCodice>', '<IdCodice>01234567897</IdCodice>']]),
    testo('IT00000000000_00045.xml', [['<TipoDocumento>TD01</TipoDocumento>', '<TipoDocumento>TD17</TipoDocumento>']])]);
  assert.equal(l.documenti.length, 0);
  const motivi = l.scartati.map(x => x.motivo);
  assert.ok(motivi.some(m => /DOCTYPE/.test(m)), 'il DOCTYPE si rifiuta');
  assert.ok(motivi.includes('Non è un file di fattura: servono .xml, .p7m o .zip'));
  assert.ok(motivi.includes('Non è una fattura dello studio: né chi la emette né chi la riceve è Studio Tecnico GM'));
  assert.ok(motivi.includes('Autofattura o integrazione: Wisper non la gestisce'));
  const troppi = Array.from({ length: 301 }, (_, i) => ({ nome: 'f' + i + '.xml', base64: 'PHg+PC94Pg==' }));
  assert.equal((await manuel('leggiXml', { file: troppi })).errore, 'Troppi file: al massimo 300 per volta');
  assert.equal((await s.leggi(manuel.token, { azione: 'leggiXml' })).errore, 'Questa azione vuole una POST');
  // La partita IVA dello studio serve a capire da che parte sta una fattura.
  await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '' } });
  try {
    assert.match((await manuel('leggiXml', { file: [file('IT00000000000_00045.xml')] })).errore, /^Scrivi prima la partita IVA dello studio/);
  } finally {
    await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '00000000000' } });
  }
  assert.equal((await lettura('leggiXml', { file: [] })).permesso, false, 'lettura non importa');
});
