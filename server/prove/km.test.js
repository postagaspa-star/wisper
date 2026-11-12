// I km dallo studio (12/11/2026, docs/gestionale/km.md): il Dove del progetto, le strade chieste allo script una volta per
// indirizzo (qui il postino finto, che le inventa sempre uguali), kmStudio andata e ritorno nelle anagrafiche.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { distanzaFinta } = require('../src/postino');
const K = require('../src/azioni/km');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let manuel;
let chiamate;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  // Conta le domande al postino: ogni indirizzo una volta sola.
  chiamate = [];
  const vero = s.wisper.postino.chiama.bind(s.wisper.postino);
  s.wisper.postino.chiama = (azione, corpo) => { if (azione === 'postinoDistanza') chiamate.push(corpo.a); return vero(azione, corpo); };
});
test.after(() => s.ferma());

test('normalizza e indirizzo intero: la stessa chiave per lo stesso posto; CAP e comune non si ripetono', () => {
  assert.equal(K.normalizzaLuogo('  Via  Roma 1 ,Bassano  '), 'via roma 1, bassano');
  assert.equal(K.indirizzoIntero('Via Roma 1', '36061', 'Bassano del Grappa', 'vi'), 'Via Roma 1, 36061 Bassano del Grappa (VI)');
  assert.equal(K.indirizzoIntero('Via Roma 1, 36061 Bassano', '36061', 'Bassano', 'VI'), 'Via Roma 1, 36061 Bassano');
  assert.equal(K.indirizzoIntero('', '', 'Schio', ''), 'Schio');
  assert.deepEqual([K.kmAndataRitorno(24300), K.kmAndataRitorno(null)], [49, null]);
});

test('il postino finto: sempre la stessa strada per lo stesso indirizzo, "introvabile" non si trova', () => {
  const a = distanzaFinta('Studio', 'Via Roma 1, Schio');
  assert.deepEqual(distanzaFinta('Studio', 'via  roma 1, schio').metri, a.metri);
  assert.ok(a.trovata && a.metri >= 4000 && a.metri <= 60000);
  assert.equal(distanzaFinta('Studio', 'Via Introvabile 9').trovata, false);
});

test('il giro: chiede la strada dei luoghi che mancano, una volta sola; kmStudio andata e ritorno su clienti e commesse', async () => {
  const w = s.wisper;
  const studio = w.indirizzoStudio();
  assert.ok(studio, 'i dati di esempio hanno l\'indirizzo dello studio');
  const mancano = w.luoghiDaCalcolare();
  assert.ok(mancano.length > 0);
  let giri = 0;
  for (let r = await w.giroKm(); r.mancano > 0 && giri < 20; r = await w.giroKm()) giri++;
  assert.deepEqual(w.luoghiDaCalcolare(), []);
  const chieste = chiamate.length;
  assert.equal(chieste, mancano.length, 'una domanda per luogo');
  assert.equal(new Set(chiamate.map(K.normalizzaLuogo)).size, chieste, 'nessun luogo due volte');
  await w.giroKm();
  assert.equal(chiamate.length, chieste, 'al giro dopo niente da chiedere');
  const ana = ok(await manuel('anagrafiche'));
  const conSede = ana.clienti.find(c => c.indirizzo || c.citta);
  const atteso = K.kmAndataRitorno(distanzaFinta(studio, K.indirizzoIntero(conSede.indirizzo, conSede.cap, conSede.citta, conSede.provincia)).metri);
  assert.equal(conSede.kmStudio, atteso, 'andata e ritorno, in km interi');
  const senza = ana.clienti.find(c => !c.indirizzo && !c.citta);
  if (senza) assert.equal(senza.kmStudio, null, 'senza indirizzo niente km');
  assert.ok(ana.commesse.every(m => 'kmStudio' in m) && ana.progetti.every(p => 'kmStudio' in p));
});

test('il Dove del progetto: scritto, ripreso da un altro progetto con lo stesso Intestato a, cambiato; i suoi km', async () => {
  const w = s.wisper;
  const p1 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'KM-001', intestatoA: 'Batokyo Srl', dove: 'Via dei Mulini 4, Schio', descrizione: 'Quadro QE1' })).progetto;
  assert.equal(p1.dove, 'Via dei Mulini 4, Schio');
  const p2 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'KM-002', intestatoA: '  batokyo srl ', descrizione: 'Cabina' })).progetto;
  assert.equal(p2.dove, 'Via dei Mulini 4, Schio', 'lo stesso Intestato a: lo stesso posto');
  const p3 = ok(await manuel('creaProgetto', { idCommessa: '26ST001', codiceProgetto: 'KM-003', intestatoA: 'Nuova Srl', descrizione: 'Illuminazione' })).progetto;
  assert.equal(p3.dove, '');
  const cambiato = ok(await manuel('aggiornaProgetto', { id: p3.id, campi: { dove: 'Via Introvabile 9, Thiene' } })).progetto;
  assert.equal(cambiato.dove, 'Via Introvabile 9, Thiene');
  // Prima del giro i km non si sanno ancora.
  let ana = ok(await manuel('anagrafiche'));
  assert.equal(ana.progetti.find(p => p.id === p1.id).kmStudio, null);
  await w.giroKm();
  ana = ok(await manuel('anagrafiche'));
  const km1 = K.kmAndataRitorno(distanzaFinta(w.indirizzoStudio(), 'Via dei Mulini 4, Schio').metri);
  assert.deepEqual([ana.progetti.find(p => p.id === p1.id).kmStudio, ana.progetti.find(p => p.id === p2.id).kmStudio], [km1, km1]);
  assert.equal(ana.progetti.find(p => p.id === p3.id).kmStudio, null, 'introvabile: niente km (si riprova se lo si cambia)');
  assert.ok(chiamate.indexOf('Via dei Mulini 4, Schio') >= 0 && chiamate.filter(a => /mulini/i.test(a)).length === 1, 'i due progetti nello stesso posto: una domanda');
  // Il progetto nato sul telefono col rapportino porta anche il suo Dove.
  const r = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'km-r1', data: '2026-10-21', idCommessa: '26ST001', cliente: 'Elettrodinamica', descrizione: 'Cablaggio', oreLavoro: 2,
    progettoNuovo: { idLocale: 'km-p4', codice: 'KM-004', intestatoA: 'Lago Srl', dove: 'Via del Lago 2, Arsiero', descrizione: 'Quadro' } } })).rapportino;
  const p4 = ok(await manuel('progetti', { idCommessa: '26ST001' })).progetti.find(p => p.id === r.idProgetto);
  assert.equal(p4.dove, 'Via del Lago 2, Arsiero');
});

test('cambia l\'indirizzo dello studio: le strade si richiedono da li\'', async () => {
  const w = s.wisper;
  await w.giroKm();
  assert.deepEqual(w.luoghiDaCalcolare(), []);
  ok(await manuel('salvaImpostazioni', { valori: { INDIRIZZO: 'Via Nuova 10' } }));
  const da = w.indirizzoStudio();
  assert.ok(/^Via Nuova 10/.test(da));
  assert.ok(w.luoghiDaCalcolare().length > 0, 'da uno studio nuovo nessuna strada e\' ancora nota');
  const ana = ok(await manuel('anagrafiche'));
  assert.ok(ana.clienti.every(c => c.kmStudio === null), 'i km dello studio di prima non valgono');
});

test('senza postino o senza indirizzo dello studio il giro non fa niente e lo dice', async () => {
  const w = s.wisper;
  const postino = w.postino;
  w.postino = { configurato: () => false };
  try {
    assert.deepEqual(await w.giroKm(), { fatte: 0, mancano: 0, motivo: 'postino non collegato' });
  } finally { w.postino = postino; }
  // Un postino che non risponde (o senza postinoDistanza, script non ancora incollato): niente si scrive, si riprova dopo.
  const prima = w.db.riga('SELECT COUNT(*) n FROM distanze').n;
  const chiama = postino.chiama;
  postino.chiama = async () => { throw new Error('Il postino ha detto di no: Azione sconosciuta: postinoDistanza'); };
  try {
    const r = await w.giroKm();
    assert.equal(r.fatte, 0);
    assert.match(r.motivo, /postinoDistanza/);
    // Poi un'ora di pausa: il giro dopo non chiama lo script (ogni chiamata e' una riga in Accessi sul foglio).
    let chiamate = 0;
    postino.chiama = async () => { chiamate++; throw new Error('Il postino ha detto di no: Azione sconosciuta: postinoDistanza'); };
    assert.deepEqual(await w.giroKm(), { fatte: 0, mancano: 0, motivo: 'in pausa' });
    assert.equal(chiamate, 0);
    assert.ok(w.kmFermoFino - Date.now() > 55 * 60000, 'un\'ora se lo script non conosce ancora postinoDistanza');
    await w.giroKm({ subito: true });
    assert.equal(chiamate, 1, 'subito salta la pausa');
  } finally { postino.chiama = chiama; }
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM distanze').n, prima);
  // Il primo giro che riesce toglie la pausa.
  assert.equal((await w.giroKm({ subito: true })).motivo, undefined);
  assert.equal(w.kmFermoFino, 0);
});
