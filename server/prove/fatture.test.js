// Fase 4: la fatturazione (docs/gestionale/fase4.md). Da fatturare, la bozza con le righe e i gruppi, una cosa si
// fattura una volta sola (anche con due richieste insieme: lo garantisce il database), gli stati, il passaggio al
// programma (prospetto e XML da completare), le regole fiscali da confermare, gli effetti dell'emissione e il loro
// contrario, le note di credito, i blocchi sulle cose gia' in una fattura, le scadenze delle commesse, il riepilogo,
// i permessi, la Dashboard e le esportazioni.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, cartellaNuova, PNG } = require('./aiuto');
const { Wisper } = require('../src/wisper');
const { semina } = require('../src/prova');
const { leggiFatturePA } = require('../src/fatturapa');
const { oggi } = require('../src/utili');
const C = require('../src/conti');

const CASI = require('./casi-fattura.json');

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

const db = () => s.wisper.db;
const daFatturare = async (idCliente) => (await manuel('daFatturare', idCliente ? { idCliente } : {}));
const vociDi = (df, idCliente) => (df.gruppi.find(g => g.idCliente === idCliente) || { voci: [] }).voci;
const scelte = voci => voci.map(v => ({ tipo: v.tipo, id: v.id }));
const settembre = df => vociDi(df, 'C001').filter(v => v.gruppo === 'rapportini:C001:2026-09' && v.tipo === 'rapportino');
let n = 0;
/** Un rapportino firmato (pronto da fatturare) per un cliente, con o senza commessa. */
async function firmato(dati) {
  const r = await manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'f4-' + (++n), data: oggi(), tecnico: 'Manuel Gasparotto', oreLavoro: 2 }, dati) });
  assert.equal(r.ok, true, r.errore);
  const f = await manuel('caricaFile', { tipo: 'firma', id: r.rapportino.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'firma-f4-' + n, firmatario: 'Cliente' });
  assert.equal(f.ok, true, f.errore);
  return r.rapportino.id;
}

// ------------------------------------------------------------------ Da fatturare

test('Da fatturare: per cliente, voci in ordine, i rapportini del mese con le loro spese, piu\' avanti, in bozza, riepiloghi', async () => {
  const df = await daFatturare();
  assert.equal(df.ok, true, df.errore);
  assert.equal(df.oggi, oggi());
  const elettro = df.gruppi.find(g => g.idCliente === 'C001');
  const rossi = df.gruppi.find(g => g.idCliente === 'C002');
  assert.ok(elettro && rossi);
  assert.equal(rossi.cliente, 'Rossi Impianti Srl');
  assert.equal(rossi.sostituto, true, 'ha la partita IVA');
  assert.deepEqual(rossi.mancano, [], 'ha partita IVA, indirizzo e PEC');
  // Settembre di Elettrodinamica: sei rapportini, due coi pedaggi, 1.393,92 di compenso (come il caso 5).
  const sett = vociDi(df, 'C001').filter(v => v.gruppo === 'rapportini:C001:2026-09');
  assert.equal(sett.filter(v => v.tipo === 'rapportino').length, 6);
  assert.equal(sett.filter(v => v.tipo === 'spesa').length, 2);
  assert.equal(C.importoRigaFattura({ importo: sett.reduce((t, v) => t + v.importo, 0) }), 1393.92);
  const primo = sett.find(v => v.tipo === 'rapportino');
  assert.equal(primo.importo, 219.52, '6 ore x 30 + 52 km x 0,76');
  assert.deepEqual([primo.totaleConSpese, primo.spese.length], [227.92, 1]);
  // Ogni rapportino e' seguito dalle sue spese.
  const voci = vociDi(df, 'C002');
  const collaudo = voci.findIndex(v => v.tipo === 'rapportino' && v.titolo === 'Collaudo quadro');
  assert.ok(collaudo >= 0);
  assert.deepEqual(voci.slice(collaudo + 1, collaudo + 3).map(v => [v.tipo, v.anticipazione]), [['spesa', false], ['spesa', true]]);
  // Le scadenze prima, le ore in fondo.
  const ordine = { scadenza: 0, spesa: 1, rapportino: 2, ore: 3 };
  const senzaRapportino = voci.filter(v => !(v.tipo === 'spesa' && v.idRapportino));
  assert.deepEqual(senzaRapportino.map(v => ordine[v.tipo]), senzaRapportino.map(v => ordine[v.tipo]).slice().sort());
  // Il saldo a fine lavori di 26ST003 (commessa aperta) e' piu' avanti; il 40% e' nella bozza W-15.
  assert.ok(df.piuAvanti.some(v => v.tipo === 'scadenza' && v.titolo === 'Saldo a fine lavori' && v.importo === 1140 && v.idCliente === 'C002'));
  assert.ok(df.inBozza.some(f => f.riferimento === 'W-15' && f.stato === 'bozza' && f.voci === 2 && f.totale === 2069.12));
  assert.ok(df.inBozza.some(f => f.riferimento === 'W-14' && f.stato === 'pronta'));
  assert.ok(df.riepiloghi.some(r => r.idCliente === 'C001' && r.mese === '2026-09' && r.rapportini === 6 && r.inviatoIl === '2026-09-30T18:05:00'));
  assert.deepEqual([df.raggruppa.C001, df.raggruppa.C002], ['mese', 'rapportino']);
  assert.ok(df.daFirmare.length >= 1, 'i rapportini ancora da firmare, in fondo');
  assert.equal(df.totale, Math.round(df.gruppi.reduce((t, g) => t + g.totale, 0) * 100) / 100);
  // Le riservate non ci sono: il 40% di 26ST003 e la pratica sono nella W-15.
  assert.equal(voci.some(v => v.tipo === 'scadenza' && v.titolo === '40% a fine progetto'), false);
  assert.equal(voci.some(v => v.tipo === 'spesa' && v.titolo === 'Pratica di connessione al distributore'), false);
});

test('commessa a corpo: i suoi rapportini non compaiono mai; a "misto" si', async () => {
  const id = await firmato({ idCliente: 'C002', idCommessa: '26ST003', descrizione: 'Ore in cantiere a corpo', tariffa: 45 });
  assert.equal(vociDi(await daFatturare('C002'), 'C002').some(v => v.id === id), false, 'a corpo: dentro il prezzo del contratto');
  await manuel('aggiornaCommessa', { id: '26ST003', campi: { modoFatturazione: 'misto' } });
  assert.ok(vociDi(await daFatturare('C002'), 'C002').some(v => v.id === id), 'a misto: le ore in piu\' si fatturano');
  const sbagliato = await manuel('aggiornaCommessa', { id: '26ST003', campi: { modoFatturazione: 'forfait' } });
  assert.equal(sbagliato.errore, 'Come si fattura: ore, corpo o misto');
  await manuel('aggiornaCommessa', { id: '26ST003', campi: { modoFatturazione: 'corpo' } });
  assert.equal((await manuel('anagrafiche')).commesse.find(m => m.id === '26ST003').modoFatturazione, 'corpo');
});

// ------------------------------------------------------------------ la bozza

let bozzaSettembre;

test('preparaFattura: i rapportini del mese in tre righe (raggruppamento A), le loro spese con loro, i conti del caso 5', async () => {
  const sett = settembre(await daFatturare('C001'));
  // Solo i rapportini: le spese vengono con loro.
  const r = await manuel('preparaFattura', { idCliente: 'C001', voci: scelte(sett) });
  assert.equal(r.ok, true, r.errore);
  const f = r.fattura;
  bozzaSettembre = f;
  assert.match(f.riferimento, /^W-\d+$/);
  assert.deepEqual([f.stato, f.statoVisto, f.etichetta, f.numero, f.tipoDocumento], ['bozza', 'Bozza', 'Bozza ' + f.riferimento, '', 'TD01']);
  const atteso = CASI.raggruppamenti[0].atteso;
  assert.deepEqual(f.righe.map(x => ({ tipo: x.tipo, descrizione: x.descrizione, quantita: x.quantita, unita: x.unita, prezzo: x.prezzo, importo: x.importo })), atteso.righe);
  assert.ok(f.righe.every(x => x.gruppo === 'rapportini:C001:2026-09' && x.importoSorgenti === x.importo));
  assert.equal(f.sorgenti.filter(x => x.attiva).length, 8);
  const caso5 = CASI.casi[4].atteso;
  for (const k of Object.keys(caso5)) assert.deepEqual(f.conti[k], caso5[k], k);
  assert.deepEqual([f.ritenuta, f.ivaPercentuale, f.eppiPercentuale, f.ritenutaPercentuale, f.regime], [true, 22, 5, 20, 'ordinario']);
  assert.equal(f.causale, 'Prestazioni di settembre 2026');
  assert.deepEqual(f.scadenze.map(x => [x.data, x.importo, x.modalita]), [[C.scadenzaFattura(f.data, 30, false), 1506.84, 'MP05']]);
  assert.equal(f.conto, 'Conto studio …3456');
  assert.deepEqual(f.mancano, []);
  assert.equal(f.regoleConfermate, false);
  assert.equal(f.modificabile, true);
  // Non sono piu' da fatturare.
  const dopo = await daFatturare('C001');
  assert.equal(settembre(dopo).length, 0);
  assert.equal(vociDi(dopo, 'C001').some(v => v.gruppo === 'rapportini:C001:2026-09'), false, 'nemmeno le spese');
  // Il registro: la fattura, le righe, le sorgenti.
  const reg = await manuel('registro', { tabella: 'fattura_sorgenti' });
  assert.ok(reg.righe.length >= 8);
});

test('una cosa si fattura una volta sola: la seconda bozza e\' rifiutata con la frase che dice dove sta', async () => {
  const sorgente = bozzaSettembre.sorgenti.find(x => x.tipo === 'rapportino').id;
  const doppia = await manuel('preparaFattura', { idCliente: 'C001', voci: [{ tipo: 'rapportino', id: sorgente }] });
  assert.equal(doppia.ok, false);
  assert.equal(doppia.errore, sorgente + ' è già nella bozza ' + bozzaSettembre.riferimento + ' per Elettrodinamica');
  const altri = vociDi(await daFatturare(), 'C002').filter(v => v.tipo === 'ore').slice(0, 1);
  const mescolati = await manuel('preparaFattura', { idCliente: 'C001', voci: scelte(altri) });
  assert.equal(mescolati.errore, 'Una fattura è per un cliente solo');
  assert.equal((await manuel('preparaFattura', { idCliente: 'C001', voci: [] })).errore, 'Scegli almeno una cosa da fatturare');
  assert.match((await manuel('preparaFattura', { idCliente: 'C001', voci: [{ tipo: 'ore', id: 99999 }] })).errore, /non è più da fatturare$/);
});

test('due richieste nello stesso istante con la stessa sorgente: una sola passa', async () => {
  const id = await firmato({ idCliente: 'C002', idCommessa: '26ST002', descrizione: 'Prova delle due richieste', tariffa: 42 });
  const voce = { tipo: 'rapportino', id };
  const [a, b] = await Promise.all([
    manuel('preparaFattura', { idCliente: 'C002', voci: [voce] }),
    laura('preparaFattura', { idCliente: 'C002', voci: [voce] }),
  ]);
  assert.equal([a, b].filter(x => x.ok).length, 1, JSON.stringify([a.errore, b.errore]));
  assert.match([a, b].find(x => !x.ok).errore, new RegExp('^' + id.replace(/\//g, '\\/') + ' è già nella bozza W-\\d+ per Rossi Impianti Srl$'));
  assert.equal(db().riga("SELECT COUNT(*) n FROM fattura_sorgenti WHERE tipo = 'rapportino' AND sorgente_id = ? AND attiva = 1", id).n, 1);
  // Scartare libera.
  const vinta = [a, b].find(x => x.ok).fattura;
  const scartata = await manuel('scartaFattura', { id: vinta.id, motivo: 'era una prova' });
  assert.deepEqual([scartata.ok, scartata.fattura.stato, scartata.fattura.statoVisto], [true, 'scartata', 'Scartata']);
  assert.ok(scartata.fattura.sorgenti.every(x => !x.attiva && x.liberataPerche === 'bozza scartata'));
  assert.ok(vociDi(await daFatturare('C002'), 'C002').some(v => v.id === id), 'torna da fatturare');
  assert.equal((await manuel('fatture')).fatture.some(f => f.id === vinta.id), false, 'le scartate solo con stato: scartata');
  assert.ok((await manuel('fatture', { stato: 'scartata' })).fatture.some(f => f.id === vinta.id));
});

test('il database rifiuta la stessa sorgente attiva in due fatture, anche scrivendo a mano (indice fattura_sorgenti_una)', () => {
  const una = db().riga('SELECT * FROM fattura_sorgenti WHERE attiva = 1 LIMIT 1');
  assert.throws(() => db().esegui("INSERT INTO fattura_sorgenti (fattura_id, gruppo, tipo, sorgente_id, attiva) VALUES (?, '', ?, ?, 1)", una.fattura_id, una.tipo, una.sorgente_id),
    /UNIQUE constraint failed: fattura_sorgenti/);
  // Una liberata (attiva = 0) non conta: la storia resta.
  db().esegui("INSERT INTO fattura_sorgenti (fattura_id, gruppo, tipo, sorgente_id, attiva) VALUES (?, '', ?, ?, 0)", una.fattura_id, una.tipo, una.sorgente_id);
  db().esegui('DELETE FROM fattura_sorgenti WHERE id = (SELECT MAX(id) FROM fattura_sorgenti)');
});

test('due server sullo stesso database (due connessioni): la seconda bozza con la stessa sorgente non passa', () => {
  const dati = cartellaNuova('doppia');
  const a = new Wisper({ dati });
  semina(a);
  const b = new Wisper({ dati });
  try {
    const titolare = w => ({ utente: w.titolare(), permessi: w.permessiDi('titolare') });
    const voce = { tipo: 'scadenza', id: a.db.riga("SELECT id FROM scadenze_pagamento WHERE commessa_id = '26ST003' AND descrizione LIKE 'Saldo%'").id };
    const primo = a.come(titolare(a), () => a.db.transazione(() => a.preparaFattura({ idCliente: 'C002', voci: [voce] })));
    assert.equal(primo.ok, true);
    assert.throws(() => b.come(titolare(b), () => b.db.transazione(() => b.preparaFattura({ idCliente: 'C002', voci: [voce] }))),
      /è già nella bozza W-\d+ per Rossi Impianti Srl/);
    assert.equal(b.db.riga("SELECT COUNT(*) n FROM fattura_sorgenti WHERE tipo = 'scadenza' AND sorgente_id = ? AND attiva = 1", String(voce.id)).n, 1);
  } finally {
    a.chiudi();
    b.chiudi();
  }
});

test('salvaFattura: righe libere, prezzo di una riga di un gruppo, togliere un gruppo libera tutto, il bollo lo mette il server', async () => {
  const f = bozzaSettembre;
  // Il prezzo della riga delle ore cambia: l'importo segue, le sorgenti restano ("era 1.140,00").
  const righe = f.righe.map(r => ({ id: r.id }));
  righe[0].prezzo = 32;
  righe.push({ tipo: 'anticipazione', descrizione: 'Diritti di segreteria anticipati', quantita: 1, prezzo: 80 });
  let r = await manuel('salvaFattura', { fattura: { id: f.id, righe } });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.fattura.righe[0].importo, r.fattura.righe[0].importoSorgenti, r.fattura.righe[0].gruppo], [1216, 1140, 'rapportini:C001:2026-09']);
  const bollo = r.fattura.righe.find(x => x.tipo === 'bollo');
  assert.ok(bollo, 'spese anticipate oltre 77,47: il bollo');
  assert.deepEqual([bollo.descrizione, bollo.importo, bollo.natura, bollo.gruppo], ['Imposta di bollo', 2, 'N1', '']);
  assert.equal(r.fattura.righe[r.fattura.righe.length - 1].tipo, 'bollo', 'in fondo');
  assert.equal(r.fattura.conti.bolloAddebitato, 2);
  assert.equal(r.fattura.sorgenti.filter(x => x.attiva).length, 8);
  // La riga del bollo mandata dall'app si ignora; sotto la soglia sparisce.
  const libera = r.fattura.righe.find(x => x.descrizione === 'Diritti di segreteria anticipati');
  r = await manuel('salvaFattura', { fattura: { id: f.id, righe: r.fattura.righe.map(x => (x.id === libera.id ? { id: x.id, prezzo: 50 } : { id: x.id })) } });
  assert.equal(r.fattura.righe.some(x => x.tipo === 'bollo'), false);
  assert.equal(r.fattura.conti.bollo, 0);
  // Errori.
  assert.equal((await manuel('salvaFattura', { fattura: { id: f.id, righe: [{ tipo: 'compenso', descrizione: '', prezzo: 1 }] } })).errore, 'Riga: scrivi la descrizione');
  assert.equal((await manuel('salvaFattura', { fattura: { id: f.id, righe: [{ tipo: 'compenso', descrizione: 'x', quantita: -1, prezzo: 1 }] } })).errore, 'Quantità: non può essere negativa');
  assert.equal((await manuel('salvaFattura', { fattura: { id: f.id, righe: [{ tipo: 'compenso', descrizione: 'x', prezzo: -1 }] } })).errore, 'Prezzo: non può essere negativo');
  // Una riga del gruppo che manca: si toglie tutto il gruppo e le sue sorgenti tornano da fatturare.
  const senzaKm = r.fattura.righe.filter(x => x.descrizione !== 'Rimborso chilometrico di settembre 2026').map(x => ({ id: x.id }));
  r = await manuel('salvaFattura', { fattura: { id: f.id, righe: senzaKm } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.liberate.length, 8, 'tornano da fatturare 6 rapportini e 2 spese');
  assert.deepEqual(r.fattura.righe.map(x => x.descrizione), ['Diritti di segreteria anticipati']);
  assert.ok(r.fattura.sorgenti.every(x => !x.attiva && x.liberataPerche === 'tolta dalla bozza'));
  assert.equal(settembre(await daFatturare('C001')).length, 6, 'di nuovo da fatturare');
  // La scadenza scritta a mano resta anche cambiando la data; null la fa tornare calcolata.
  r = await manuel('salvaFattura', { fattura: { id: f.id, scadenza: '2026-12-31', data: '2026-10-25' } });
  assert.deepEqual([r.fattura.scadenzaAMano, r.fattura.scadenze[0].data, r.fattura.data], [true, '2026-12-31', '2026-10-25']);
  r = await manuel('salvaFattura', { fattura: { id: f.id, scadenza: null, fineMese: true } });
  assert.deepEqual([r.fattura.scadenzaAMano, r.fattura.scadenze[0].data], [false, '2026-11-30']);
  await manuel('scartaFattura', { id: f.id });
});

test('nuovaFattura e fattura a zero: righe senza prezzo e totale zero non passano al programma', async () => {
  const f = (await manuel('nuovaFattura', { idCliente: 'C003' })).fattura;
  assert.deepEqual([f.stato, f.ritenuta, f.righe.length, f.conti.totale], ['bozza', false, 0, 0], 'Mario Bianchi e\' un privato: niente ritenuta');
  assert.deepEqual(f.mancano.map(m => m.campo), ['righe']);
  const r = await manuel('salvaFattura', { fattura: { id: f.id, righe: [{ tipo: 'compenso', descrizione: 'Consulenza', quantita: 2, unita: 'ore' }] } });
  assert.deepEqual(r.fattura.mancano.map(m => [m.campo, m.testo]), [['prezzi', '1 riga senza prezzo'], ['totale', 'Il totale è zero']]);
  const passa = await manuel('passaAlProgramma', { id: f.id, conferma: true });
  assert.equal(passa.ok, false);
  assert.equal(passa.errore, 'Prima di passarla al programma manca: 1 riga senza prezzo; il totale è zero');
  assert.deepEqual(passa.mancano.map(m => m.campo), ['prezzi', 'totale']);
  await manuel('scartaFattura', { id: f.id });
});

// ------------------------------------------------------------------ il passaggio al programma

test('pacchetto: il modello, il prospetto per sezioni e l\'XML da completare (numero BOZZA, nome che dice di non inviarlo)', async () => {
  const p = await manuel('pacchetto', { id: 'W-15' });
  assert.equal(p.ok, true, p.errore);
  assert.deepEqual(p.uscite, ['prospetto', 'xml']);
  assert.deepEqual(p.mancano, []);
  const m = p.modello;
  assert.deepEqual([m.riferimento, m.tipoDocumento, m.numero, m.divisa], ['W-15', 'TD01', '', 'EUR']);
  assert.deepEqual([m.prestatore.partitaIva, m.prestatore.regimeFiscale, m.prestatore.sede.indirizzo, m.prestatore.albo.nome], ['00000000000', 'RF01', 'Via dell\'Esempio 1', 'Periti industriali']);
  assert.deepEqual([m.committente.denominazione, m.committente.partitaIva, m.committente.codiceDestinatario, m.committente.pec], ['Rossi Impianti Srl', '04455667784', '0000000', 'rossiimpianti@pec.esempio.it']);
  assert.deepEqual(m.righe.map(r => [r.prezzoTotale, r.natura, r.ritenuta]), [[1520, '', true], [120, 'N1', false], [2, 'N1', false]]);
  assert.deepEqual(m.cassa, { tipo: 'TC17', aliquota: 5, imponibile: 1520, importo: 76, aliquotaIva: 22, natura: '', ritenuta: false });
  assert.deepEqual(m.ritenuta, { tipo: 'RT01', aliquota: 20, importo: 304, causale: 'A' });
  assert.deepEqual(m.bollo, { virtuale: true, importo: 2 });
  assert.deepEqual(m.riepilogo, [
    { aliquotaIva: 22, natura: '', imponibile: 1596, imposta: 351.12, esigibilita: 'I', riferimentoNormativo: '' },
    { aliquotaIva: 0, natura: 'N1', imponibile: 122, imposta: 0, esigibilita: '', riferimentoNormativo: 'Escluse ex art. 15 DPR 633/72' }]);
  assert.deepEqual([m.totaleDocumento, m.nettoAPagare], [2069.12, 1765.12]);
  assert.equal(m.pagamento.dettagli[0].iban, 'IT60X0542811101000000123456', 'intero per chi scrive le fatture');
  assert.deepEqual(m.causale, ['40% a fine progetto, commessa 26ST003. Rif. Wisper W-15']);
  assert.equal(m.regoleConfermate, false);
  // Il prospetto: le sezioni nell'ordine dell'accordo, "Copia tutto" e l'avviso delle regole.
  assert.deepEqual(p.prospetto.sezioni.map(x => x.titolo), ['Cliente', 'Documento', 'Righe', 'Cassa previdenziale', 'Ritenuta', 'Bollo', 'Riepilogo IVA', 'Totali', 'Pagamento']);
  assert.equal(p.prospetto.titolo, 'Prospetto per il programma delle fatture');
  assert.ok(p.prospetto.sezioni[1].campi.some(c => c.etichetta === 'Numero' && c.valore === 'lo dà il programma'));
  assert.ok(p.prospetto.sezioni[1].campi.some(c => c.etichetta === 'Tipo' && c.valore === 'Fattura (TD01)'));
  assert.ok(p.prospetto.testo.includes('Netto da incassare: 1.765,12'));
  assert.ok(p.prospetto.testo.startsWith('Conti da verificare: regole non confermate dal commercialista'));
  // L'XML da completare.
  assert.equal(p.xml.nome, 'Bozza W-15 Rossi Impianti Srl - non inviare.xml');
  assert.equal(p.xml.mime, 'application/xml');
  const xml = Buffer.from(p.xml.base64, 'base64').toString('utf8');
  assert.match(xml, /<Numero>BOZZA<\/Numero>/);
  assert.match(xml, /<ProgressivoInvio>W15<\/ProgressivoInvio>/);
  assert.match(xml, /<Causale>Conti da verificare: regole non confermate dal commercialista<\/Causale>/);
  assert.doesNotMatch(p.xml.nome, /^IT\d+_/);
  // Riletto dal nostro lettore: gli stessi conti del modello.
  const letto = leggiFatturePA([{ nome: 'x.xml', base64: p.xml.base64 }]).documenti[0];
  assert.deepEqual([letto.numero, letto.conti.compenso, letto.conti.contributo, letto.conti.iva, letto.conti.anticipazioni, letto.conti.bolloAddebitato, letto.conti.totale, letto.conti.ritenuta, letto.conti.netto],
    ['BOZZA', 1520, 76, 351.12, 120, 2, 2069.12, 304, 1765.12]);
  assert.deepEqual(letto.riferimentiWisper, ['W-15']);
  // Chi legge e basta vede l'IBAN coperto.
  const suo = await lettura('pacchetto', { id: 'W-15' });
  assert.equal(suo.modello.pagamento.dettagli[0].iban, 'IT…3456');
  assert.ok(!Buffer.from(suo.xml.base64, 'base64').toString('utf8').includes('<IBAN>'), 'nell\'XML niente IBAN coperto');
  // Solo il prospetto, se l'impostazione lo dice.
  await manuel('salvaImpostazioni', { valori: { PASSAGGIO_USCITE: ['prospetto'] } });
  const solo = await manuel('pacchetto', { id: 'W-15' });
  assert.deepEqual([solo.uscite, 'xml' in solo], [['prospetto'], false]);
  await manuel('salvaImpostazioni', { valori: { PASSAGGIO_USCITE: ['prospetto', 'xml'] } });
});

test("l'XML da completare preparato da Wisper (numero BOZZA) non diventa mai una fattura emessa", async () => {
  // Difetto trovato dal telefono il 22/10/2026: tornava come proposta "certa" e confermandolo la bozza diventava emessa col numero BOZZA.
  const p = await manuel('pacchetto', { id: 'W-15' });
  assert.equal(p.ok, true, p.errore);
  const r = await manuel('leggiXml', { file: [{ nome: p.xml.nome, base64: p.xml.base64 }] });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual(r.documenti, []);
  assert.equal(r.scartati.length, 1);
  assert.match(r.scartati[0].motivo, /XML da completare preparato da Wisper/);
  // E a mano il numero BOZZA non si scrive.
  const e = await manuel('segnaEmessa', { id: 'W-15', numero: ' bozza ', conferma: true });
  assert.equal(e.ok, false);
  assert.match(e.errore, /BOZZA non è un numero di fattura/);
});

test('inviaAvviso: l\'avviso di parcella col PDF (dal postino), segna quando; non cambia lo stato', async () => {
  const r = await manuel('inviaAvviso', { id: 'W-15', a: 'rossi@example.com', oggetto: 'Avviso di parcella W-15',
    allegati: [{ nome: 'avviso.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 prova').toString('base64') }] });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.fattura.stato, !!r.fattura.avvisoInviatoIl], ['bozza', true]);
  assert.equal((await manuel('inviaAvviso', { id: 'W-15' })).errore, 'Manca l\'indirizzo del cliente');
  assert.equal((await manuel('inviaAvviso', { id: 'W-13', a: 'x@example.com' })).errore, 'L\'avviso di parcella si manda prima di emettere la fattura');
  assert.equal((await s.leggi(manuel.token, { azione: 'inviaAvviso', id: 'W-15' })).errore, 'Questa azione vuole una POST');
});

test('passaAlProgramma: cosa manca blocca, le regole non confermate chiedono una conferma; tornaInBozza', async () => {
  // Un cliente senza indirizzo ne' partita IVA: non si passa (niente conferma).
  const nuovo = (await manuel('salvaSoggetto', { soggetto: { nome: 'Cliente Senza Dati Srl' } })).soggetto;
  const f = (await manuel('nuovaFattura', { idCliente: nuovo.id })).fattura;
  await manuel('salvaFattura', { fattura: { id: f.id, righe: [{ tipo: 'compenso', descrizione: 'Consulenza', quantita: 1, prezzo: 100 }] } });
  const no = await manuel('passaAlProgramma', { id: f.id, conferma: true });
  assert.equal(no.ok, false);
  assert.deepEqual(no.mancano.map(m => m.campo), ['cliente', 'indirizzo']);
  assert.match(no.errore, /^Prima di passarla al programma manca: la partita IVA o il codice fiscale del cliente; l'indirizzo del cliente/);
  await manuel('scartaFattura', { id: f.id });
  // La W-15: regole non confermate.
  const chiede = await manuel('passaAlProgramma', { id: 'W-15' });
  assert.deepEqual([chiede.ok, chiede.serveConferma], [false, true]);
  assert.equal(chiede.errore, 'Le regole delle fatture non sono ancora confermate dal commercialista: passala lo stesso?');
  const r = await manuel('passaAlProgramma', { id: 'W-15', conferma: true });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.fattura.stato, r.fattura.statoVisto, r.fattura.etichetta, r.fattura.modificabile, r.fattura.regoleConfermate], ['pronta', 'Pronta', 'Pronta W-15', false, false]);
  assert.match(r.fattura.prontaIl, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(r.pacchetto.xml);
  // Una pronta non si cambia.
  assert.equal((await manuel('salvaFattura', { fattura: { id: 'W-15', causale: 'x' } })).errore, 'La fattura W-15 è già stata passata al programma: per cambiarla falla tornare in bozza');
  // La coda del telefono che ripete: niente di nuovo.
  assert.equal((await manuel('passaAlProgramma', { id: 'W-15', conferma: true })).fattura.stato, 'pronta');
  const indietro = await manuel('tornaInBozza', { id: 'W-15' });
  assert.deepEqual([indietro.ok, indietro.fattura.stato, indietro.fattura.prontaIl], [true, 'bozza', '']);
  const reg = (await manuel('registro', { tabella: 'fatture', idRiga: '15' })).righe.map(x => x.nota);
  assert.ok(reg.includes('passata al programma') && reg.includes('tornata in bozza'));
});

test('regole fiscali: le conferma solo il titolare; cambiarne una toglie la conferma (con la nota nel registro)', async () => {
  const sua = await laura('confermaRegoleFiscali', { data: '2026-11-05', commercialista: 'Studio di esempio' });
  assert.equal(sua.permesso, false, 'l\'amministrazione no');
  const r = await manuel('confermaRegoleFiscali', { data: '2026-11-05', commercialista: 'Studio di esempio' });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual(r.regoleConfermate, { data: '2026-11-05', commercialista: 'Studio di esempio', da: 1 });
  assert.equal((await manuel('fattura', { id: 'W-15' })).fattura.regoleConfermate, true);
  assert.equal((await manuel('salvaImpostazioni', { valori: { REGOLE_FISCALI_CONFERMATE: null } })).ok, false, 'non si scrive da Impostazioni');
  // Il pacchetto non porta piu' l'avviso.
  const p = await manuel('pacchetto', { id: 'W-15' });
  assert.equal(p.prospetto.avviso, '');
  assert.doesNotMatch(Buffer.from(p.xml.base64, 'base64').toString('utf8'), /Conti da verificare/);
  // Un salvataggio che non cambia niente lascia la conferma; cambiare la soglia del bollo la toglie.
  await manuel('salvaImpostazioni', { valori: { BOLLO_SOGLIA: 77.47 } });
  assert.ok((await manuel('anagrafiche')).impostazioni.REGOLE_FISCALI_CONFERMATE);
  await manuel('salvaImpostazioni', { valori: { BOLLO_SOGLIA: 77.48 } });
  assert.equal((await manuel('anagrafiche')).impostazioni.REGOLE_FISCALI_CONFERMATE, null);
  const reg = await manuel('registro', { tabella: 'impostazioni', idRiga: 'REGOLE_FISCALI_CONFERMATE' });
  assert.deepEqual(reg.righe.slice(0, 2).map(x => x.nota), ['regole cambiate: la conferma del commercialista non vale più', 'regole confermate dal commercialista il 05/11/2026']);
  await manuel('salvaImpostazioni', { valori: { BOLLO_SOGLIA: 77.47 } });
  // SOGLIA_CASSA non e' una regola fiscale.
  await manuel('confermaRegoleFiscali', { data: '2026-11-05', commercialista: 'Studio di esempio' });
  await manuel('salvaImpostazioni', { valori: { SOGLIA_CASSA: 2500 } });
  assert.ok((await manuel('anagrafiche')).impostazioni.REGOLE_FISCALI_CONFERMATE);
  await manuel('salvaImpostazioni', { valori: { SOGLIA_CASSA: 3000 } });
  assert.equal((await manuel('confermaRegoleFiscali', { data: null })).regoleConfermate, null);
});

// ------------------------------------------------------------------ emissione, blocchi, note di credito

let emessaSettembre;

test('i blocchi (§7.3): una cosa in una bozza non si cambia; in una fattura emessa serve una nota di credito', async () => {
  const sett = settembre(await daFatturare('C001'));
  const f = (await manuel('preparaFattura', { idCliente: 'C001', voci: scelte(sett) })).fattura;
  emessaSettembre = f;
  const rap = sett[0].id;
  const spesa = f.sorgenti.find(x => x.tipo === 'spesa').id;
  const frase = 'Il rapportino ' + rap + ' è nella bozza ' + f.riferimento + ' per Elettrodinamica: toglilo prima dalla bozza';
  assert.equal((await manuel('salvaRapportino', { rapportino: { id: rap, idCliente: 'C001', oreLavoro: 9 } })).errore, frase);
  assert.equal((await manuel('stato', { ids: [rap], stato: 'BOZZA' })).errore, frase);
  assert.equal((await manuel('stato', { ids: [rap], stato: 'ANNULLATO' })).errore, frase);
  assert.equal((await manuel('stato', { ids: [rap], stato: 'FATTURATO' })).errore, 'Diventa fatturato da solo quando torna l\'XML della fattura ' + f.riferimento);
  const foto = await manuel('caricaFile', { tipo: 'spesa', id: rap, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'foto-bloccata' });
  assert.equal(foto.errore, frase);
  const s1 = await manuel('salvaSpesa', { spesa: { id: spesa, importo: 9 } });
  assert.match(s1.errore, /^La spesa «Pedaggio» del \d\d\/\d\d è nella bozza W-\d+ per Elettrodinamica: toglila prima dalla bozza$/);
  assert.equal((await manuel('salvaSpesa', { spesa: { id: spesa, descrizione: 'Pedaggio A4' } })).ok, true, 'la descrizione si');
  assert.match((await manuel('togliSpesa', { id: spesa })).errore, /toglila prima dalla bozza$/);
  // Ore in una bozza.
  const ore = vociDi(await daFatturare('C002'), 'C002').find(v => v.tipo === 'ore');
  const bOre = (await manuel('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'ore', id: ore.id }] })).fattura;
  const oreBloccate = await manuel('salvaOre', { riga: { id: ore.id, ore: 9 } });
  assert.match(oreBloccate.errore, /^Le ore del \d\d\/\d\d su 26ST002 sono nella bozza W-\d+ per Rossi Impianti Srl: toglile prima dalla bozza$/);
  assert.match((await manuel('togliOre', { id: ore.id })).errore, /toglile prima dalla bozza$/);
  assert.match((await manuel('respingi', { voci: [{ tipo: 'ore', id: ore.id }], motivo: 'no' })).errore, /già nella bozza/, 'non si respinge una cosa in una bozza');
  await manuel('scartaFattura', { id: bOre.id });
  // Un rapportino fuori da tutto si segna fatturato a mano (quelli fatturati fuori da Wisper), con la nota.
  const libero = await firmato({ idCliente: 'C002', idCommessa: '26ST002', descrizione: 'Fatturato fuori', tariffa: 42 });
  assert.equal((await manuel('stato', { ids: [libero], stato: 'FATTURATO' })).ok, true);
  const nota = (await manuel('registro', { tabella: 'rapportini', idRiga: libero })).righe[0].nota;
  assert.equal(nota, 'segnato fatturato a mano, senza fattura in Wisper');
  assert.equal((await manuel('stato', { ids: [libero], stato: 'INVIATO' })).ok, true, '"non ancora fatturato" per questi si');
});

test('segnaEmessa (numero scritto a mano): gli effetti dell\'emissione, ognuno nel registro', async () => {
  const f = emessaSettembre;
  const chiede = await manuel('segnaEmessa', { id: f.id, numero: '52/2026', data: '2026-10-23' });
  assert.deepEqual([chiede.ok, chiede.serveConferma], [false, true]);
  assert.equal(chiede.errore, 'Il numero lo scrivi tu: deve essere quello che ha dato il tuo programma. Gli importi restano quelli della bozza finché non importi l\'XML');
  assert.equal((await manuel('segnaEmessa', { id: f.id, numero: '', conferma: true })).errore, 'Numero: scrivi il numero che ha dato il programma');
  assert.equal((await manuel('segnaEmessa', { id: f.id, numero: '45/2026', data: '2026-10-23', conferma: true })).errore, 'C\'è già la fattura 45/2026');
  const r = await manuel('segnaEmessa', { id: f.id, numero: '52/2026', data: '2026-10-23', conferma: true });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.fattura.stato, r.fattura.numero, r.fattura.numeroDa, r.fattura.etichetta, r.fattura.data, r.fattura.statoVisto], ['emessa', '52/2026', 'mano', '52/2026', '2026-10-23', 'Emessa']);
  const rap = await manuel('rapportini', { tutti: true });
  for (const x of f.sorgenti.filter(y => y.tipo === 'rapportino')) {
    const q = rap.rapportini.find(y => y.id === x.id);
    assert.deepEqual([q.stato, q.fatturatoIl], ['FATTURATO', '2026-10-23'], x.id);
  }
  for (const x of f.sorgenti.filter(y => y.tipo === 'spesa')) assert.equal(db().riga('SELECT fatturata_il FROM spese WHERE id = ?', Number(x.id)).fatturata_il, '2026-10-23');
  const reg = await manuel('registro', { tabella: 'rapportini', idRiga: f.sorgenti[0].id });
  assert.equal(reg.righe[0].nota, 'dalla fattura 52/2026 (' + f.riferimento + ')');
  // Ora serve una nota di credito.
  const rid = f.sorgenti.find(x => x.tipo === 'rapportino').id;
  assert.equal((await manuel('stato', { ids: [rid], stato: 'INVIATO' })).errore, 'Il rapportino ' + rid + ' è nella fattura 52/2026: per cambiarlo serve una nota di credito');
  assert.equal((await manuel('tornaInBozza', { id: f.id })).ok, false);
  assert.equal((await manuel('scartaFattura', { id: f.id })).errore, 'La fattura 52/2026 è già emessa: per annullarla serve una nota di credito');
  assert.equal((await manuel('fattura', { numero: '52/2026', anno: '2026' })).fattura.id, f.id, 'si trova anche per numero e anno');
});

test('nota di credito parziale: storna una parte, niente torna da fatturare; il residuo scende', async () => {
  const f = (await manuel('fattura', { id: emessaSettembre.id })).fattura;
  assert.equal((await manuel('preparaNotaCredito', { idFattura: f.id, tutta: true })).errore, 'Motivo: scrivi perché la correggi');
  const troppo = await manuel('preparaNotaCredito', { idFattura: f.id, righe: [{ idRiga: f.righe[0].id, importo: 5000 }], motivo: 'x' });
  assert.equal(troppo.errore, 'Si storna al massimo quello che c\'è: 1.140,00 €');
  const r = await manuel('preparaNotaCredito', { idFattura: f.id, righe: [{ idRiga: f.righe[0].id, importo: 200 }], motivo: 'Un\'ora contata due volte' });
  assert.equal(r.ok, true, r.errore);
  const nota = r.fattura;
  assert.deepEqual([nota.tipo, nota.tipoDocumento, nota.stato, nota.idFatturaCollegata, nota.fatturaCollegata.numero], ['nota', 'TD04', 'bozza', f.id, '52/2026']);
  for (const k of Object.keys(CASI.casi[11].atteso)) assert.deepEqual(nota.conti[k], CASI.casi[11].atteso[k], 'caso 12 · ' + k);
  assert.deepEqual(nota.tornanoDaFatturare, [], 'uno storno parziale non libera niente');
  assert.equal(nota.righe[0].descrizione, 'Storno parziale: Prestazioni professionali di settembre 2026 (6 rapportini)');
  const p = await manuel('pacchetto', { id: nota.id });
  assert.deepEqual(p.modello.fattureCollegate, [{ idDocumento: '52/2026', data: '2026-10-23' }]);
  assert.equal(p.prospetto.sezioni[1].campi.find(c => c.etichetta === 'Tipo').valore, 'Nota di credito (TD04)');
  const e = await manuel('segnaEmessa', { id: nota.id, numero: '3/2026', data: '2026-10-24', conferma: true });
  assert.equal(e.ok, true, e.errore);
  assert.deepEqual([e.fattura.etichetta, e.fattura.statoVisto], ['Nota di credito 3/2026', 'Nota di credito']);
  const dopo = (await manuel('fattura', { id: f.id })).fattura;
  assert.deepEqual([dopo.stato, dopo.residuo], ['emessa', Math.round((1506.84 - 216.2) * 100) / 100]);
  assert.deepEqual(dopo.note.map(x => [x.numero, x.netto]), [['3/2026', 216.2]]);
  assert.ok(dopo.sorgenti.every(x => x.attiva), 'le sorgenti restano fatturate');
});

test('nota di credito totale: tutto torna da fatturare (rapportini di nuovo inviati), la fattura e\' annullata', async () => {
  const f = (await manuel('fattura', { id: emessaSettembre.id })).fattura;
  // Le note vive o emesse non stornano piu' del totale: con la parziale gia' fatta, "tutta" non ci sta.
  assert.match((await manuel('preparaNotaCredito', { idFattura: f.id, tutta: true, motivo: 'Rifatta' })).errore, /^Si storna al massimo quello che c'è: 1\.529,42 €$/);
  // Prima si toglie la parziale (una nota emessa non si scarta: qui la si porta via dal database della prova).
  const parziale = (await manuel('fatture', { tipo: 'nota' })).fatture.find(x => x.idFatturaCollegata === f.id);
  db().esegui("UPDATE fatture SET stato = 'scartata' WHERE id = ?", parziale.id);
  // Il cliente aveva gia' pagato 300 €: dopo la nota totale vanno restituiti o compensati, e Wisper lo dice.
  const inc = await manuel('segnaIncasso', { idFattura: f.id, importo: 300, data: '2026-10-24' });
  assert.equal(inc.ok, true, inc.errore);
  const r = await manuel('preparaNotaCredito', { idFattura: f.id, tutta: true, motivo: 'Rifatta con le ore giuste' });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.fattura.conti.totale, f.conti.totale);
  assert.deepEqual(r.fattura.tornanoDaFatturare.map(g => [g.gruppo, g.sorgenti.length]), [['rapportini:C001:2026-09', 8]]);
  const e = await manuel('segnaEmessa', { id: r.fattura.id, numero: '4/2026', data: '2026-10-25', conferma: true });
  assert.equal(e.ok, true, e.errore);
  const dopo = (await manuel('fattura', { id: f.id })).fattura;
  assert.deepEqual([dopo.stato, dopo.statoVisto], ['annullata', 'Annullata']);
  assert.equal(dopo.daRestituire, 300);
  const dash = await manuel('dashboard');
  assert.ok(dash.urgenti.some(v => v.titolo === 'Fattura ' + f.numero + ': 300,00 da restituire o compensare'), JSON.stringify(dash.urgenti.map(v => v.titolo)));
  await manuel('annullaMovimento', { id: inc.movimento.id, motivo: 'prova' });
  assert.equal((await manuel('fattura', { id: f.id })).fattura.daRestituire, 0);
  assert.ok(dopo.sorgenti.every(x => !x.attiva && x.liberataPerche === 'nota di credito 4/2026'));
  const rap = (await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === f.sorgenti[0].id);
  assert.deepEqual([rap.stato, rap.fatturatoIl], ['INVIATO', ''], 'aveva la data d\'invio: torna inviato');
  const spesa = f.sorgenti.find(x => x.tipo === 'spesa').id;
  assert.equal(db().riga('SELECT fatturata_il FROM spese WHERE id = ?', Number(spesa)).fatturata_il, '');
  assert.equal(settembre(await daFatturare('C001')).length, 6, 'di nuovo da fatturare');
  const reg = await manuel('registro', { tabella: 'rapportini', idRiga: rap.id });
  assert.equal(reg.righe[0].nota, 'stornato dalla nota di credito 4/2026');
});

test('segnaFatturataFuori: le cose fatturate prima di Wisper escono da Da fatturare (e si rimettono)', async () => {
  const df = await daFatturare('C002');
  const ore = vociDi(df, 'C002').find(v => v.tipo === 'ore');
  const rap = vociDi(df, 'C002').find(v => v.tipo === 'rapportino');
  const r = await manuel('segnaFatturataFuori', { voci: [{ tipo: 'ore', id: ore.id }, { tipo: 'rapportino', id: rap.id }], nota: 'fattura 12/2025 del vecchio programma' });
  assert.deepEqual([r.ok, r.fatte], [true, 2]);
  assert.equal(vociDi(await daFatturare('C002'), 'C002').some(v => v.id === ore.id || v.id === rap.id), false);
  assert.equal((await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === rap.id).stato, 'FATTURATO');
  assert.ok(db().riga('SELECT fatturata_il FROM ore WHERE id = ?', ore.id).fatturata_il);
  assert.equal((await manuel('registro', { tabella: 'ore', idRiga: String(ore.id) })).righe[0].nota, 'fatturata fuori da Wisper: fattura 12/2025 del vecchio programma');
  assert.equal((await manuel('salvaOre', { riga: { id: ore.id, ore: 1 } })).errore.indexOf('Fatturate fuori da Wisper') === 0, true);
  const indietro = await manuel('segnaFatturataFuori', { voci: [{ tipo: 'ore', id: ore.id }, { tipo: 'rapportino', id: rap.id }], annulla: true });
  assert.equal(indietro.ok, true, indietro.errore);
  assert.ok(vociDi(await daFatturare('C002'), 'C002').some(v => v.id === ore.id));
  assert.equal((await marco('segnaFatturataFuori', { voci: [{ tipo: 'ore', id: ore.id }] })).permesso, false);
});

test('incassi: in parte, pagata, scaduta calcolate; un incasso su una pronta (avviso di parcella) e "va emessa entro"', async () => {
  const f39 = (await manuel('fattura', { id: 12 })).fattura;
  assert.deepEqual([f39.etichetta, f39.statoVisto, f39.pagamento, f39.scaduta, f39.incassato, f39.residuo], ['39/2026', 'Scaduta', 'in_parte', true, 500, 310.75]);
  assert.ok(f39.giorniScaduta >= 12);
  assert.deepEqual(f39.incassi.map(x => [x.data, x.importo, x.verificato]), [['2026-10-12', 500, false]]);
  assert.deepEqual(f39.scadenze.map(x => [x.data, x.importo, x.coperta]), [['2026-10-10', 810.75, 500]]);
  const w14 = (await manuel('fattura', { id: 'W-14' })).fattura;
  assert.deepEqual([w14.statoVisto, w14.pagamento, w14.residuo, w14.daEmettereEntro], ['Pronta · già pagata', 'pagata', 0, '2026-11-01']);
  assert.equal(w14.avvisi[0].testo, 'Va emessa entro domenica 1 novembre: ha pagato il 20/10');
  const piena = await manuel('segnaIncasso', { idFattura: 12, data: oggi() });
  assert.equal(piena.ok, true, piena.errore);
  assert.deepEqual([piena.fattura.statoVisto, piena.fattura.residuo, piena.movimento.importo], ['Pagata', 0, 310.75]);
  assert.match(piena.movimento.descrizione, /^Incasso Rossi Impianti Srl, fattura 39\/2026$/);
  await manuel('annullaMovimento', { id: piena.movimento.id, motivo: 'prova' });
  assert.equal((await manuel('fattura', { id: 12 })).fattura.statoVisto, 'Scaduta', 'annullare il movimento la riapre');
});

// ------------------------------------------------------------------ commesse, riepilogo, elenchi

test('scadenze di pagamento e fatturazione della commessa: contratto, fatturato, in bozza, previsto', async () => {
  const sc = await manuel('scadenzePagamento', { idCommessa: '26ST003' });
  assert.equal(sc.ok, true, sc.errore);
  assert.deepEqual(sc.scadenze.map(x => [x.descrizione, x.importo, x.stato, x.fattura]),
    [['30% alla firma', 1140, 'fatturata', '45/2026'], ['40% a fine progetto', 1520, 'in_bozza', 'W-15'], ['Saldo a fine lavori', 1140, 'prevista', '']]);
  assert.deepEqual([sc.commesse[0].contratto, sc.commesse[0].fatturato], [3800, 1140]);
  const fc = await manuel('fatturazioneCommessa', { id: '26ST003' });
  assert.deepEqual([fc.contratto, fc.fatturato, fc.inBozza, fc.previsto, fc.modoFatturazione], [3800, 1140, 1520, 1140, 'corpo']);
  assert.ok(fc.fatture.some(f => f.etichetta === '45/2026'));
  assert.equal((await marco('fatturazioneCommessa', { id: '26ST003' })).permesso, false);
});

test('riepilogo del fatturato: per mese, per cliente e per commessa (emesse meno note), con gli incassi', async () => {
  const r = await manuel('riepilogoFatturato', { anno: 2026, per: 'mese' });
  assert.equal(r.ok, true, r.errore);
  const mese = k => r.righe.find(x => x.chiave === k);
  assert.deepEqual([mese('2026-08').compenso, mese('2026-08').fatture, mese('2026-08').nome], [960, 1, 'agosto 2026']);
  assert.equal(mese('2026-09').compenso, 750);
  assert.equal(mese('2026-09').incassato, 1037.76, 'l\'incasso della 38/2026 e\' di settembre');
  assert.equal(r.fatturato, r.totali.compenso);
  const c = await manuel('riepilogoFatturato', { anno: 2026, per: 'cliente' });
  assert.ok(c.righe.some(x => x.chiave === 'C002' && x.nome === 'Rossi Impianti Srl'));
  const m = await manuel('riepilogoFatturato', { anno: 2026, per: 'commessa' });
  assert.ok(m.righe.some(x => x.chiave === '26ST003' && x.compenso === 1140));
  assert.equal((await manuel('riepilogoFatturato', { anno: 2026, per: 'boh' })).errore, 'Per: mese, cliente o commessa');
});

test('fatture: filtri (da emettere, da incassare, scadute, testo), le bozze in cima; fattura per riferimento o numero', async () => {
  const tutte = (await manuel('fatture')).fatture;
  const prima = tutte.findIndex(f => f.stato === 'emessa' || f.stato === 'annullata');
  assert.ok(tutte.slice(0, prima).every(f => f.stato === 'bozza' || f.stato === 'pronta'), 'bozze e pronte in cima');
  assert.ok((await manuel('fatture', { stato: 'da_emettere' })).fatture.every(f => ['bozza', 'pronta'].includes(f.stato)));
  assert.ok((await manuel('fatture', { scadute: true })).fatture.every(f => f.scaduta));
  assert.ok((await manuel('fatture', { pagamento: 'aperta' })).fatture.some(f => f.etichetta === '45/2026'));
  assert.deepEqual((await manuel('fatture', { testo: 'mario' })).fatture.map(f => f.riferimento), ['W-14']);
  const una = (await manuel('fatture')).fatture[0];
  for (const k of ['righe', 'sorgenti', 'incassi']) assert.equal(k in una, false, 'negli elenchi niente ' + k);
  assert.equal((await manuel('fattura', { id: 'W-13' })).fattura.etichetta, '45/2026');
  assert.equal((await manuel('fattura', { id: '45/2026' })).fattura.riferimento, 'W-13');
  assert.equal((await manuel('fattura', { id: 'W-999' })).errore, 'Fattura W-999 non trovata');
});

test('esporta: fatture (le colonne dell\'accordo), da fatturare, riepilogo', async () => {
  const r = await manuel('esporta', { cosa: 'fatture' });
  assert.equal(r.ok, true, r.errore);
  const csv = Buffer.from(r.base64, 'base64').toString('utf8');
  const righe = csv.slice(1).trim().split('\r\n');
  assert.deepEqual(righe[0].split(';'), ['Riferimento', 'Numero', 'Data', 'Tipo', 'Stato', 'Cliente', 'Partita IVA', 'Commessa', 'Compenso', 'Contributo', 'IVA',
    'Spese anticipate', 'Bollo', 'Totale', 'Ritenuta', 'Netto', 'Incassato', 'Residuo', 'Scadenza']);
  assert.ok(righe.some(x => x.startsWith('W-13;45/2026;19/10/2026;Fattura;Emessa;Rossi Impianti Srl;04455667784;26ST003;1140;57;263,34;0;0;1460,34;228;1232,34;')));
  assert.equal((await manuel('esporta', { cosa: 'daFatturare' })).ok, true);
  assert.equal((await manuel('esporta', { cosa: 'riepilogo', anno: 2026 })).ok, true);
  assert.equal((await lettura('esporta', { cosa: 'fatture' })).ok, true, 'lettura esporta');
  assert.equal((await marco('esporta', { cosa: 'fatture' })).permesso, false);
});

// ------------------------------------------------------------------ permessi e Dashboard

test('permessi: il collaboratore niente; lettura vede ed esporta ma non scrive; senza "costi" niente fatture', async () => {
  const azioniLettura = [['daFatturare', {}], ['fatture', {}], ['fattura', { id: 'W-15' }], ['pacchetto', { id: 'W-15' }], ['ricevute', {}],
    ['scadenzePagamento', {}], ['fatturazioneCommessa', { id: '26ST003' }], ['riepilogoFatturato', { anno: 2026 }]];
  const azioniScrittura = [['preparaFattura', { idCliente: 'C002', voci: [] }], ['nuovaFattura', { idCliente: 'C002' }], ['salvaFattura', { fattura: { id: 'W-15' } }],
    ['scartaFattura', { id: 'W-15' }], ['passaAlProgramma', { id: 'W-15' }], ['tornaInBozza', { id: 'W-15' }], ['segnaEmessa', { id: 'W-15', numero: '1' }],
    ['leggiXml', { file: [] }], ['confermaXml', { idLettura: 'x' }], ['preparaNotaCredito', { idFattura: 13, motivo: 'x' }],
    ['segnaFatturataFuori', { voci: [] }], ['salvaRicevuta', { ricevuta: {} }], ['annullaRicevuta', { id: 1, motivo: 'x' }],
    ['inviaAvviso', { id: 'W-15', a: 'x@example.com' }]];
  for (const [azione, dati] of azioniLettura.concat(azioniScrittura)) {
    const r = await marco(azione, dati);
    assert.equal(r.permesso, false, 'collaboratore: ' + azione);
  }
  for (const [azione, dati] of azioniLettura) assert.equal((await lettura(azione, dati)).ok, true, 'lettura vede: ' + azione);
  for (const [azione, dati] of azioniScrittura) assert.equal((await lettura(azione, dati)).permesso, false, 'lettura non scrive: ' + azione);
  // Senza il permesso dei soldi niente fatture, con la frase dell'accordo.
  await manuel('salvaPermessi', { permessi: { lettura: { costi: 0 } } });
  try {
    const r = await lettura('fatture');
    assert.deepEqual([r.ok, r.permesso, r.errore], [false, false, 'Per vedere le fatture serve anche il permesso dei soldi: chiedi al titolare']);
    assert.equal((await lettura('conti')).errore, 'Per vedere banche e scadenze serve anche il permesso dei soldi: chiedi al titolare');
    const d = await lettura('dashboard');
    assert.equal('soldi' in d.numeri, false);
  } finally {
    await manuel('salvaPermessi', { permessi: { lettura: { costi: 1 } } });
  }
  // Il collaboratore: nella commessa niente soldi, nella Dashboard niente voci di fatture e banche.
  const commessa = (await marco('anagrafiche')).commesse.find(m => m.id === '26ST003');
  assert.equal('importoContratto' in commessa, false);
  const d = await marco('dashboard');
  const voci = [].concat(d.urgenti, d.settimana, d.pianificare);
  assert.equal(voci.some(v => ['fattura', 'ricevuta', 'impegno', 'cassa', 'conto', 'fiscale'].includes(v.tipo)), false);
  assert.equal('soldi' in d.numeri, false);
});

test('Dashboard: fatture scadute, da emettere entro 12 giorni, da fatturare per cliente, regole da confermare, i numeri dei soldi', async () => {
  const d = await manuel('dashboard');
  const s = d.numeri.soldi;
  for (const k of ['daFatturare', 'fattureInBozza', 'daIncassare', 'scaduto', 'incassiSettimana', 'pagamentiSettimana', 'saldoConti', 'saldoPrevisto30', 'primoSottoSoglia']) {
    assert.ok(k in s, k);
  }
  assert.equal(s.scaduto, 310.75);
  const scaduta = d.urgenti.find(v => v.tipo === 'fattura' && /^Fattura 39\/2026 scaduta da \d+ giorni$/.test(v.titolo));
  assert.ok(scaduta);
  assert.deepEqual([scaduta.dettaglio, scaduta.quanto, scaduta.collegamento], ['Rossi Impianti Srl · restano 310,75 di 810,75', 310.75, { pagina: 'fattura', id: 12 }]);
  const emetti = d.urgenti.find(v => v.titolo === 'Emetti la fattura per Mario Bianchi entro domenica 1 novembre');
  assert.ok(emetti);
  assert.equal(emetti.dettaglio, 'Ha già pagato il 20/10 · W-14');
  const da = d.settimana.find(v => v.titolo === 'Da fatturare');
  assert.match(da.dettaglio, /^\d+ client[ei] · /);
  assert.equal(da.collegamento.pagina, 'fatturazione');
  assert.ok(d.pianificare.some(v => v.tipo === 'fiscale' && v.collegamento.filtro.sezione === 'fiscale'));
  // L'amministrazione vede le regole da confermare; lettura no.
  assert.ok([].concat((await laura('dashboard')).pianificare).some(v => v.tipo === 'fiscale'));
  assert.equal([].concat((await lettura('dashboard')).pianificare).some(v => v.tipo === 'fiscale'), false);
});

test('rapportini: la pillola della fattura ("In bozza W-15", "Fattura 45/2026") solo per chi vede le fatture', async () => {
  const df = await manuel('daFatturare', { idCliente: 'C002' });
  const rap = df.gruppi[0].voci.find(v => v.tipo === 'rapportino');
  const f = (await manuel('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'rapportino', id: rap.id }] })).fattura;
  const suo = (await manuel('rapportini', { tutti: true })).rapportini.find(r => r.id === rap.id);
  assert.deepEqual(suo.fattura, { id: f.id, riferimento: f.riferimento, stato: 'bozza', etichetta: 'In bozza ' + f.riferimento });
  assert.equal((await manuel('rapportini', { tutti: true })).rapportini.find(r => r.fattura === null) !== undefined, true, 'gli altri: null');
  const delCollaboratore = (await marco('rapportini', { tutti: true })).rapportini[0];
  assert.equal('fattura' in delCollaboratore, false, 'il collaboratore non vede la fattura');
  await manuel('scartaFattura', { id: f.id });
});
