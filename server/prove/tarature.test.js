// Fase 6: strumenti e tarature (fase6.md §3.8, §3.9, §7.5, §7.6, §7.8). Taratura conforme che chiude la scadenza e fa
// la prossima; non conforme: Fuori uso e gli usi da controllare dall'ultima taratura buona; una conforme dopo lo
// rimette in uso; la riparazione che porta a "Taratura non scritta"; lo strumento scaduto nel rapportino con conferma
// (e con TARATURA_BLOCCO = blocco), quello non conforme mai scelto, il rapportino della coda mai rifiutato; lo stato
// congelato in strumenti_usati; il ticket con gli strumenti dei suoi rapportini; da firmato in poi non cambiano.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva } = require('./aiuto');
const { oggi, piuGiorni } = require('../src/utili');
const C = require('../src/conti');

let s;
let manuel;
let marco;
let laura;
let lettura;
const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const T = oggi();
const MT = 1;
const AR6 = 2;
const PINZA = 3;
const MULTI = 4;
let n = 0;

test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  marco = await s.come('marco@esempio.it');
  laura = await s.come('laura@esempio.it');
  lettura = await s.come('lettura@esempio.it');
});
test.after(() => s.ferma());

const rapportino = (chi, strumenti, extra) => chi('salvaRapportino', { rapportino: Object.assign({ idLocale: 'tar-' + (++n), data: T, tecnico: 'Marco Rossato', idCliente: 'C002', descrizione: 'Verifica impianto', oreLavoro: 2, strumenti }, extra || {}) });
const voci = d => d.urgenti.concat(d.settimana, d.pianificare);

test('lo strumento nel rapportino: lo stato di quel giorno; lo scaduto con conferma resta segnato; mai un rifiuto, nemmeno per uno che non c\'e\'', async () => {
  const r = ok(await rapportino(marco, [{ idAttrezzatura: MULTI, confermato: true }, { idAttrezzatura: MT }, { idAttrezzatura: AR6 }, { idAttrezzatura: 999 }])).rapportino;
  const per = id => r.strumenti.find(x => x.idAttrezzatura === id);
  assert.equal(r.strumenti.length, 3, 'quello che non c\'e\' si salta');
  assert.deepEqual([per(MULTI).statoAllora, per(MULTI).confermato, per(MULTI).scadeAllora, per(MULTI).matricola], ['scaduta', true, '2026-10-12', '6011-2381']);
  assert.equal(per(MT).statoAllora, 'valida');
  assert.equal(per(AR6).statoAllora, 'laboratorio');
  assert.deepEqual(r.strumentiDaGuardare.map(x => x.idAttrezzatura), [AR6], 'lo scaduto confermato non e\' da guardare; quello al laboratorio si\'');
  // Senza conferma: da guardare.
  const r2 = ok(await rapportino(marco, [{ idAttrezzatura: MULTI }])).rapportino;
  assert.deepEqual(r2.strumentiDaGuardare.map(x => x.idAttrezzatura), [MULTI]);
  // La conferma resta nella Dashboard: "usato oggi in ...".
  const d = ok(await manuel('dashboard'));
  assert.ok(voci(d).some(v => v.tipo === 'strumento' && v.titolo === 'Multimetro 87V: ' + C.statoTaratura({ controllo: 'taratura', ultima: { data: '2025-10-12', scade: '2026-10-12', esito: 'conforme' } }, T, 30).parola.replace(/^T/, 't')));
  // Leggere i rapportini: gli strumenti ci sono (anche a chi non ha mezzi? lettura ha mezzi 1).
  const letti = ok(await lettura('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.equal(letti.strumenti.length, 3);
  // Un rapportino senza strumenti: elenco vuoto (il PDF di sempre).
  assert.deepEqual(ok(await rapportino(marco, undefined)).rapportino.strumenti, []);
  // Cambiare l'elenco (in bozza): l'elenco intero, quello tolto sparisce.
  const r3 = ok(await marco('salvaRapportino', { rapportino: { idLocale: 'tar-1', data: T, tecnico: 'Marco Rossato', idCliente: 'C002', descrizione: 'Verifica impianto', oreLavoro: 2, strumenti: [{ idAttrezzatura: MT }] } })).rapportino;
  assert.deepEqual(r3.strumenti.map(x => x.idAttrezzatura), [MT]);
});

test('taratura non conforme: Fuori uso, gli usi da controllare dall\'ultima buona; mai scelto; il rapportino della coda si salva lo stesso', async () => {
  // Un uso di oggi del misuratore (taratura buona fino a fra 24 giorni).
  const usato = ok(await rapportino(marco, [{ idAttrezzatura: MT }])).rapportino;
  assert.equal(usato.strumenti[0].statoAllora, 'valida');
  assert.equal((await marco('registraTaratura', { taratura: { idAttrezzatura: MT, data: T, esito: 'non_conforme' } })).permesso, false, 'le tarature le scrive chi ha mezzi 2');
  const nc = ok(await manuel('registraTaratura', { taratura: { idAttrezzatura: MT, data: T, esito: 'non_conforme', nota: 'Fuori tolleranza sulla scala 20 ohm' } }));
  assert.deepEqual([nc.attrezzatura.statoVisto, nc.attrezzatura.motivo, nc.attrezzatura.taratura.stato, nc.attrezzatura.fuoriUso], ['Fuori uso', 'Non conforme', 'non_conforme', 'non_conforme']);
  assert.ok(nc.usiDaControllare.some(u => u.idRapportino === usato.id && u.cliente === 'Rossi Impianti Srl' && u.chi === 'Marco Rossato'));
  const ultimaBuona = s.wisper.db.riga("SELECT data FROM tarature WHERE attrezzatura_id = ? AND esito <> 'non_conforme' ORDER BY data DESC LIMIT 1", MT).data;
  const quanti = nc.usiDaControllare.length;
  assert.equal(nc.fraseUsi, 'Usato in ' + (quanti === 1 ? '1 intervento' : quanti + ' interventi') + ' dal ' + ultimaBuona.slice(8, 10) + '/' + ultimaBuona.slice(5, 7) + '/' + ultimaBuona.slice(0, 4) + ': controlla se le misure valgono');
  assert.ok(nc.usiDaControllare.every(u => u.data >= ultimaBuona));
  // Mai scelto: ne' Lo prendo io, ne' un'assegnazione.
  assert.equal((await laura('assegna', { idAttrezzatura: MT, tipo: 'assegnato', idPersona: 2 })).errore, 'Non conforme: non si usa finché non è tarato di nuovo');
  // Il telefono senza rete lo manda lo stesso in un rapportino: si salva, segnato non conforme, e la Dashboard lo dice.
  const coda = ok(await rapportino(marco, [{ idAttrezzatura: MT }])).rapportino;
  assert.deepEqual([coda.strumenti[0].statoAllora, coda.strumentiDaGuardare.length], ['non_conforme', 1]);
  const d = ok(await manuel('dashboard'));
  assert.ok(voci(d).some(v => v.titolo === coda.id + ' ha usato il Misuratore di terra MT-500, non conforme'));
  // Una conforme dopo lo rimette in uso (e torna a Marco, che l'aveva assegnato).
  const buona = ok(await manuel('registraTaratura', { taratura: { idAttrezzatura: MT, data: T, esito: 'conforme', certificato: 'LAT 2001/26' } }));
  assert.equal(buona.attrezzatura.statoVisto, 'Assegnato a Marco Rossato');
  assert.equal(buona.attrezzatura.taratura.parola, 'Tarato fino al ' + C.piuMesi(T, 12).split('-').reverse().join('/'));
  // Lo stato del rapportino di prima resta quello di quel giorno (congelato).
  const rilette = ok(await manuel('rapportini', { tutti: true })).rapportini;
  assert.equal(rilette.find(x => x.id === coda.id).strumenti[0].statoAllora, 'non_conforme');
  assert.equal(rilette.find(x => x.id === usato.id).strumenti[0].statoAllora, 'valida');
});

test('taratura conforme: la scadenza aperta si segna fatta col certificato e nasce la prossima; il laboratorio rientra', async () => {
  const aperta = s.wisper.db.riga("SELECT * FROM scadenze WHERE attrezzatura_id = ? AND tipo = 'taratura' AND stato = 'aperta'", MULTI);
  assert.equal(aperta.data, '2026-10-12');
  const scade = C.piuMesi(T, 12);
  const r = ok(await manuel('registraTaratura', { taratura: { idAttrezzatura: MULTI, data: T, esito: 'regolato', certificato: 'LAT 2002/26', idLaboratorio: 'F005' } }));
  assert.equal(r.attrezzatura.taratura.scade, scade);
  const fatta = s.wisper.db.riga('SELECT * FROM scadenze WHERE id = ?', aperta.id);
  assert.equal(fatta.stato, 'fatta');
  const prossima = s.wisper.db.riga('SELECT * FROM scadenze WHERE id = ?', fatta.prossima_id);
  assert.deepEqual([prossima.stato, prossima.data, prossima.tipo, prossima.attrezzatura_id], ['aperta', scade, 'taratura', MULTI]);
  // Gli usi di prima col multimetro scaduto restano scaduti (congelati).
  const vecchi = s.wisper.db.righe('SELECT stato_allora FROM strumenti_usati WHERE attrezzatura_id = ? AND data < ?', MULTI, T);
  assert.ok(vecchi.length && vecchi.every(u => u.stato_allora === 'scaduta'));
  // L'analizzatore AR-6 al laboratorio: la taratura lo fa rientrare (non era di nessuno prima: Disponibile).
  const ar = ok(await manuel('registraTaratura', { taratura: { idAttrezzatura: AR6, data: piuGiorni(T, -1), esito: 'conforme' }, tornaA: true }));
  assert.deepEqual([ar.attrezzatura.statoVisto, ar.attrezzatura.taratura.stato], ['Disponibile', 'valida']);
  assert.ok(s.wisper.db.riga("SELECT id FROM assegnazioni WHERE attrezzatura_id = ? AND tipo = 'laboratorio' AND al IS NOT NULL", AR6));
  // I controlli.
  assert.equal((await manuel('registraTaratura', { taratura: { idAttrezzatura: MULTI, data: T, esito: 'buono' } })).errore, 'Esito: conforme, regolato o non conforme');
  assert.equal((await manuel('registraTaratura', { taratura: { idAttrezzatura: MULTI, data: T, esito: 'conforme', scade: piuGiorni(T, -1) } })).errore, 'Scade: deve venire dopo la data della taratura');
});

test('la riparazione: dopo, la taratura non vale piu\' ("Taratura non scritta") finche\' non se ne registra una', async () => {
  const m = ok(await manuel('salvaManutenzione', { manutenzione: { idAttrezzatura: AR6, tipo: 'riparazione', titolo: 'Sostituito il connettore', stato: 'in_officina' } })).manutenzione;
  ok(await manuel('chiudiManutenzione', { id: m.id, esito: 'Riparato' }));
  const a = ok(await manuel('attrezzatura', { id: AR6 })).attrezzatura;
  assert.deepEqual([a.taratura.stato, a.taratura.parola], ['senza', 'Taratura non scritta']);
  // Un rapportino lo segna "senza" (si sceglie, con la pillola grigia: non e' da guardare).
  const r = ok(await rapportino(manuel, [{ idAttrezzatura: AR6 }], { tecnico: 'Manuel Gasparotto', tariffa: 45 })).rapportino;
  assert.deepEqual([r.strumenti[0].statoAllora, (r.strumentiDaGuardare || []).length], ['senza', 0]);
  ok(await manuel('registraTaratura', { taratura: { idAttrezzatura: AR6, data: T, esito: 'conforme' } }));
  assert.equal(ok(await manuel('attrezzatura', { id: AR6 })).attrezzatura.taratura.stato, 'valida');
});

test('TARATURA_BLOCCO = blocco: lo scaduto e\' da guardare anche confermato; il server salva lo stesso; io lo dice', async () => {
  ok(await manuel('salvaImpostazioni', { valori: { TARATURA_BLOCCO: 'blocco' } }));
  assert.equal(ok(await marco('io')).interfaccia.taraturaBlocco, 'blocco');
  // La pinza diventa scaduta: una taratura di un anno fa scaduta ieri.
  ok(await manuel('registraTaratura', { taratura: { idAttrezzatura: PINZA, data: C.piuMesi(piuGiorni(T, -1), -12), esito: 'conforme', scade: piuGiorni(T, -1) } }));
  const r = ok(await rapportino(marco, [{ idAttrezzatura: PINZA, confermato: true }])).rapportino;
  assert.deepEqual([r.strumenti[0].statoAllora, r.strumenti[0].confermato, r.strumentiDaGuardare.length], ['scaduta', true, 1]);
  ok(await manuel('salvaImpostazioni', { valori: { TARATURA_BLOCCO: 'avviso' } }));
  assert.equal(ok(await marco('io')).interfaccia.taraturaBlocco, 'avviso');
});

test('il ticket mostra gli strumenti dei suoi rapportini con lo stato di quel giorno; da firmato in poi non cambiano', async () => {
  const t = ok(await manuel('salvaTicket', { ticket: { idCliente: 'C002', idSede: 5, titolo: 'Verifica impianto di terra' } })).ticket;
  const r = ok(await rapportino(marco, [{ idAttrezzatura: PINZA, confermato: true }, { idAttrezzatura: MT }], { idTicket: t.id })).rapportino;
  const tk = ok(await manuel('ticket', { id: t.id })).ticket;
  assert.deepEqual(tk.strumenti.map(x => [x.idRapportino, x.idAttrezzatura, x.statoAllora]), [[r.id, PINZA, 'scaduta'], [r.id, MT, 'valida']]);
  assert.equal(tk.tarataScaduta, true);
  // Firmato: non si cambia (come le spese: si riporta in bozza).
  s.wisper.db.esegui("UPDATE rapportini SET stato = 'FIRMATO' WHERE id = ?", r.id);
  const no = await marco('salvaRapportino', { rapportino: { idLocale: r.idLocale, data: T, tecnico: 'Marco Rossato', idCliente: 'C002', oreLavoro: 2, strumenti: [] } });
  assert.match(no.errore, /gia' firmato: riportalo in bozza per modificarlo$/);
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM strumenti_usati WHERE rapportino_id = ?', r.id).n, 2);
});

test('il catalogo: codice proposto, categorie, filtri; dismesso fuori dagli elenchi; usi dello strumento; chi scrive', async () => {
  const nuovo = ok(await manuel('salvaAttrezzatura', { attrezzatura: { nome: 'Termocamera di prova', categoria: 'strumento', controllo: 'taratura', controlloOgniMesi: 24 } })).attrezzatura;
  assert.match(nuovo.codice, /^AT\d{3}$/);
  assert.equal(nuovo.taratura.parola, 'Taratura non scritta');
  assert.equal((await marco('salvaAttrezzatura', { attrezzatura: { nome: 'X', categoria: 'attrezzo' } })).permesso, false);
  assert.equal((await manuel('salvaAttrezzatura', { attrezzatura: { nome: 'X', categoria: 'boh' } })).ok, false);
  const scadute = ok(await manuel('attrezzature', { taratura: 'scadute' })).attrezzature;
  assert.ok(scadute.every(a => a.taratura && a.taratura.stato === 'scaduta'));
  const mie = ok(await marco('attrezzature', { mie: true })).attrezzature;
  assert.ok(mie.length && mie.every(a => a.mio));
  ok(await manuel('dismettiAttrezzatura', { id: nuovo.id, motivo: 'Rotta' }));
  assert.equal(ok(await manuel('attrezzature', {})).attrezzature.some(a => a.id === nuovo.id), false);
  assert.ok(ok(await manuel('attrezzature', { stato: 'dismesse' })).attrezzature.some(a => a.id === nuovo.id));
  const usi = ok(await lettura('usiStrumento', { idAttrezzatura: MULTI })).usi;
  assert.ok(usi.length >= 1 && usi.every(u => u.statoAllora));
});
