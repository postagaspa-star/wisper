// Il rapportino con piu' lavori e senza firma (06/11/2026, docs/gestionale/rapportino-lavori.md §2-§4 e §6, parte del
// server): la migrazione 011 (ogni riga di prima e' un rapportino con un lavoro, stesso numero), salvaRapportino nella
// forma nuova (coi lavori) e in quella di prima (le app 1.1 e le loro code), idempotenza con idLocale, togliere lavori,
// lavori bloccati, numerazione, stato e ripristino del rapportino intero, Da inviare (inviaEmail, stato INVIATO, Riporta
// da inviare), Da fatturare con i lavori Da inviare, i testi della fattura col numero del rapportino, le commesse della
// fattura, la Dashboard senza firma, l'esportazione, il collaboratore.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, cartellaNuova, PNG, giornoDeiPrototipi } = require('./aiuto');
giornoDeiPrototipi();
const { Database } = require('../src/db');
const { Wisper } = require('../src/wisper');
const { oggi, piuGiorni } = require('../src/utili');

const MIGRAZIONI = path.join(__dirname, '..', 'src', 'migrazioni');

let s;
let w;
let manuel;
let marco;
test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  manuel = await s.come('manuel@esempio.it');
  marco = await s.come('marco@esempio.it');
});
test.after(() => s.ferma());

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400)); return r; };
const salva = g => manuel('salvaRapportino', { rapportino: g });
const riga = id => w.db.riga('SELECT * FROM rapportini WHERE id = ?', id);
const giornata = id => w.db.riga('SELECT * FROM giornate WHERE id = ?', id);
const lavoriDi = id => w.db.righe('SELECT * FROM rapportini WHERE id_giornata = ? ORDER BY posizione, id', id);
const cent = n => Math.round(n * 100) / 100;

let k = 0;
/** Un rapportino nuovo coi suoi lavori (idLocale unici). */
function rapportino(lavori, altro) {
  const n = ++k;
  return Object.assign({ idLocale: 'rl-' + n, data: '2026-10-20', tecnico: 'Manuel Gasparotto',
    lavori: lavori.map((l, i) => Object.assign({ idLocale: 'rl-' + n + '-' + (i + 1) }, l)) }, altro || {});
}
const ROSSI = { idCliente: 'C002', descrizione: 'Quadro di cantiere', oreLavoro: 2, tariffa: 40 };
const ELETTRO = { idCliente: 'C001', descrizione: 'Manutenzione linea 2', oreLavoro: 3, km: 10 };
const BIANCHI = { idCliente: 'C003', descrizione: 'Controllo inverter', oreLavoro: 1, tariffa: 45 };

// ------------------------------------------------------------------ la forma nuova

test('forma nuova: un rapportino con due lavori di due clienti, numeri RAP/AAAA/NNNN-1 e -2, le regole di ogni lavoro', async () => {
  const g = rapportino([ROSSI, ELETTRO]);
  const r = ok(await salva(g)).rapportino;
  assert.match(r.id, /^RAP\/2026\/\d{4}$/);
  assert.deepEqual([r.idLocale, r.data, r.tecnico], [g.idLocale, '2026-10-20', 'Manuel Gasparotto']);
  assert.deepEqual(r.lavori.map(l => [l.id, l.idGiornata, l.posizione, l.numero, l.idCliente, l.stato]),
    [[r.id + '-1', r.id, 1, r.id, 'C002', 'BOZZA'], [r.id + '-2', r.id, 2, r.id, 'C001', 'BOZZA']]);
  // Ogni lavoro con le sue regole congelate: Elettrodinamica a 30 €/h fissi, Rossi alla tariffa scritta.
  assert.deepEqual([r.lavori[0].tariffa, r.lavori[1].tariffa], [40, 30]);
  assert.equal(r.totale, cent(r.lavori[0].totale + r.lavori[1].totale));
  assert.ok(r.totale > 0);
  // La giornata: data, tecnico, chi l'ha scritta.
  const gg = giornata(r.id);
  assert.deepEqual([gg.id_locale, gg.data, gg.tecnico, gg.utente_id], [g.idLocale, '2026-10-20', 'Manuel Gasparotto', 1]);
  // La lettura: i lavori come oggi, piu' idGiornata, posizione e numero, vicini e in ordine.
  const tutti = ok(await manuel('rapportini', { tutti: true })).rapportini;
  const i = tutti.findIndex(x => x.id === r.id + '-1');
  assert.deepEqual(tutti.slice(i, i + 2).map(x => x.id), [r.id + '-1', r.id + '-2']);
  assert.deepEqual(tutti[i], r.lavori[0], 'il lavoro letto e quello della risposta sono uguali');
  // La forma nuova anche senza "rapportino" intorno.
  const sopra = ok(await manuel('salvaRapportino', rapportino([BIANCHI]))).rapportino;
  assert.deepEqual(sopra.lavori.map(l => l.id), [sopra.id + '-1']);
});

test('rifiuti della forma nuova: almeno un lavoro, i lavori col loro identificativo, l\'errore dice quale lavoro', async () => {
  assert.equal((await salva({ idLocale: 'vuoto-1', data: '2026-10-20', lavori: [] })).errore, 'Aggiungi almeno un lavoro');
  assert.equal((await salva({ data: '2026-10-20', lavori: [ROSSI] })).errore, 'Manca l\'identificativo del rapportino');
  const senza = await salva({ idLocale: 'vuoto-2', data: '2026-10-20', lavori: [Object.assign({ idLocale: 'v2-1' }, ROSSI), Object.assign({}, ELETTRO)] });
  assert.deepEqual([senza.errore, senza.lavoro], ['Lavoro 2: Manca l\'identificativo del lavoro', 2]);
  const tariffa = await salva({ idLocale: 'vuoto-3', data: '2026-10-20', lavori: [Object.assign({ idLocale: 'v3-1' }, ROSSI), { idLocale: 'v3-2', cliente: 'Cliente Mai Visto Srl', oreLavoro: 1 }] });
  assert.equal(tariffa.lavoro, 2);
  assert.match(tariffa.errore, /^Lavoro 2: Manca la tariffa oraria per Cliente Mai Visto Srl/);
  // Niente scritto: ne' il rapportino ne' il primo lavoro.
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM giornate WHERE id_locale IN ('vuoto-1', 'vuoto-2', 'vuoto-3')").n, 0);
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM rapportini WHERE id_locale IN ('v2-1', 'v3-1')").n, 0);
});

test('idempotenza: lo stesso rapportino rimandato dalla coda non fa doppioni; i numeri dei lavori non si riusano mai', async () => {
  const g = rapportino([ROSSI, ELETTRO]);
  const r = ok(await salva(g)).rapportino;
  const righe = w.db.riga('SELECT COUNT(*) n FROM rapportini').n;
  const giornate = w.db.riga('SELECT COUNT(*) n FROM giornate').n;
  const registro = w.db.riga('SELECT MAX(id) n FROM registro').n;
  const ancora = ok(await salva(g)).rapportino;
  assert.deepEqual(ancora, r);
  assert.deepEqual([w.db.riga('SELECT COUNT(*) n FROM rapportini').n, w.db.riga('SELECT COUNT(*) n FROM giornate').n], [righe, giornate]);
  // Nel registro al massimo l'ora di modifica della giornata; i lavori no.
  assert.ok(w.db.riga("SELECT COUNT(*) n FROM registro WHERE id > ? AND tabella <> 'giornate'", registro).n === 0, 'i lavori non cambiano');
  // Un lavoro in piu': -3. Tolto (non c'e' piu' nell'elenco) e aggiunto un altro: -4, il 3 non torna.
  const con3 = ok(await salva(Object.assign({}, g, { lavori: g.lavori.concat([Object.assign({ idLocale: g.idLocale + '-x' }, BIANCHI)]) }))).rapportino;
  assert.deepEqual(con3.lavori.map(l => l.id), [r.id + '-1', r.id + '-2', r.id + '-3']);
  const senza3 = ok(await salva(g)).rapportino;
  assert.deepEqual(senza3.lavori.map(l => l.id), [r.id + '-1', r.id + '-2']);
  assert.deepEqual([riga(r.id + '-3').stato, riga(r.id + '-3').stato_prima], ['ANNULLATO', 'BOZZA'], 'tolto come Elimina: si ripristina');
  const con4 = ok(await salva(Object.assign({}, g, { lavori: g.lavori.concat([Object.assign({ idLocale: g.idLocale + '-y' }, BIANCHI)]) }))).rapportino;
  assert.deepEqual(con4.lavori.map(l => l.id), [r.id + '-1', r.id + '-2', r.id + '-4']);
  // Il lavoro tolto rimandato dalla coda (con il suo idLocale) resta tolto: non torna da solo.
  const vecchio = ok(await salva(Object.assign({}, g, { lavori: g.lavori.concat([Object.assign({ idLocale: g.idLocale + '-x' }, BIANCHI), Object.assign({ idLocale: g.idLocale + '-y' }, BIANCHI)]) }))).rapportino;
  assert.deepEqual(vecchio.lavori.map(l => l.id), [r.id + '-1', r.id + '-2', r.id + '-4']);
  // L'ordine cambia con l'elenco (posizione).
  const girato = ok(await salva(Object.assign({}, g, { lavori: [g.lavori[1], g.lavori[0], Object.assign({ idLocale: g.idLocale + '-y' }, BIANCHI)] }))).rapportino;
  assert.deepEqual(girato.lavori.map(l => [l.id, l.posizione]), [[r.id + '-2', 1], [r.id + '-1', 2], [r.id + '-4', 3]]);
  // Il telefono che ha perso l'idLocale del rapportino ma ha quelli dei lavori: lo stesso rapportino.
  const perso = ok(await salva(Object.assign({}, g, { idLocale: 'un-altro-idlocale', lavori: [g.lavori[1], g.lavori[0], Object.assign({ idLocale: g.idLocale + '-y' }, BIANCHI)] }))).rapportino;
  assert.equal(perso.id, r.id);
  // Un lavoro di un altro rapportino no.
  const altro = ok(await salva(rapportino([BIANCHI]))).rapportino;
  const misto = await salva(Object.assign({}, g, { lavori: g.lavori.concat([{ id: altro.lavori[0].id, idLocale: altro.lavori[0].idLocale }]) }));
  assert.equal(misto.errore, 'Lavoro 3: Il lavoro ' + altro.lavori[0].id + ' è del rapportino ' + altro.id);
});

test('togliere un lavoro: Da inviare e Inviato si\' (13/11/2026); in una fattura no, e allora non cambia niente', async () => {
  const g = rapportino([ROSSI, ELETTRO, BIANCHI]);
  const r = ok(await salva(g)).rapportino;
  ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'INVIATO' }));
  // In una fattura (la bozza): no. Insieme cambiava anche la descrizione del secondo: non si scrive.
  const f = ok(await manuel('preparaFattura', { idCliente: 'C003', voci: [{ tipo: 'rapportino', id: r.id + '-3' }] })).fattura;
  const cambiato = Object.assign({}, g.lavori[1], { descrizione: 'Scritto insieme al rifiuto' });
  const inFattura = await salva(Object.assign({}, g, { lavori: [g.lavori[0], cambiato] }));
  assert.deepEqual([inFattura.errore, inFattura.idLavoro], ['Il lavoro per Mario Bianchi è in una fattura: non si toglie', r.id + '-3']);
  assert.equal(riga(r.id + '-2').descrizione, ELETTRO.descrizione);
  ok(await manuel('scartaFattura', { id: f.id }));
  // Il lavoro inviato si toglie (mandato per sbaglio): annullato, e ripristinato torna Inviato.
  const senzaInviato = ok(await salva(Object.assign({}, g, { lavori: [g.lavori[1], g.lavori[2]] }))).rapportino;
  assert.deepEqual(senzaInviato.lavori.map(l => l.id), [r.id + '-2', r.id + '-3']);
  assert.deepEqual([riga(r.id + '-1').stato, riga(r.id + '-1').stato_prima], ['ANNULLATO', 'INVIATO']);
  assert.equal(ok(await manuel('ripristinaRapportino', { id: r.id + '-1' })).rapportino.stato, 'INVIATO');
  // Da inviare: si toglie (annullato, si ripristina).
  const tolto = ok(await salva(Object.assign({}, g, { lavori: [g.lavori[0], g.lavori[1]] }))).rapportino;
  assert.deepEqual(tolto.lavori.map(l => l.id), [r.id + '-1', r.id + '-2']);
  assert.equal(riga(r.id + '-3').stato, 'ANNULLATO');
  assert.equal(ok(await manuel('ripristinaRapportino', { id: r.id + '-3' })).rapportino.stato, 'BOZZA');
});

test('13/11/2026: un lavoro inviato si cambia liberamente e torna Da inviare; rimandato uguale resta Inviato; il fatturato resta fermo', async () => {
  const g = rapportino([ROSSI, ELETTRO]);
  const r = ok(await salva(g)).rapportino;
  ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'INVIATO' }));
  assert.notEqual(riga(r.id + '-1').inviato_il, '');
  // Rimandato uguale insieme a un cambio del secondo: l'inviato resta Inviato, non lo tocca nessuno.
  const due = Object.assign({}, g.lavori[1], { oreLavoro: 4 });
  const dopo = ok(await salva(Object.assign({}, g, { lavori: [g.lavori[0], due] }))).rapportino;
  assert.deepEqual(dopo.lavori.map(l => [l.id, l.data, l.stato, l.oreLavoro]), [[r.id + '-1', '2026-10-20', 'INVIATO', 2], [r.id + '-2', '2026-10-20', 'BOZZA', 4]]);
  // Cambiato (le ore): si scrive e torna Da inviare, senza la data dell'invio.
  const cinque = Object.assign({}, g.lavori[0], { oreLavoro: 5 });
  const corretto = ok(await salva(Object.assign({}, g, { lavori: [cinque, due] }))).rapportino;
  assert.deepEqual(corretto.lavori.map(l => [l.stato, l.oreLavoro]), [['BOZZA', 5], ['BOZZA', 4]]);
  assert.deepEqual([riga(r.id + '-1').ore_lavoro, riga(r.id + '-1').inviato_il], [5, '']);
  // Mandato di nuovo e rimandato uguale: resta Inviato.
  ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'INVIATO' }));
  assert.equal(ok(await salva(Object.assign({}, g, { lavori: [cinque, due] }))).rapportino.lavori[0].stato, 'INVIATO');
  // La data del rapportino cambia: anche l'inviato la segue (il cliente aveva ricevuto l'altra) e torna Da inviare.
  const spostato = ok(await salva(Object.assign({}, g, { data: '2026-10-21', lavori: [cinque, due] }))).rapportino;
  assert.equal(spostato.data, '2026-10-21');
  assert.deepEqual(spostato.lavori.map(l => [l.data, l.stato]), [['2026-10-21', 'BOZZA'], ['2026-10-21', 'BOZZA']]);
  assert.equal(giornata(r.id).data, '2026-10-21');
  // Un inviato rimasto con una data sua (i rapportini di prima del 13/11): salvando altro, senza cambiare la data, non si tocca.
  ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'INVIATO' }));
  w.db.esegui('UPDATE rapportini SET data = ? WHERE id = ?', '2026-10-19', r.id + '-1');
  const tre = Object.assign({}, due, { oreLavoro: 3 });
  const fermo = ok(await salva(Object.assign({}, g, { data: '2026-10-21', lavori: [cinque, tre] }))).rapportino;
  assert.deepEqual(fermo.lavori.map(l => [l.data, l.stato, l.oreLavoro]), [['2026-10-19', 'INVIATO', 5], ['2026-10-21', 'BOZZA', 3]]);
  w.db.esegui('UPDATE rapportini SET data = ? WHERE id = ?', '2026-10-21', r.id + '-1');
  // Riporta da inviare (stato BOZZA) c'e' ancora, per tirarlo indietro senza cambiarlo.
  ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'BOZZA' }));
  assert.equal(riga(r.id + '-1').inviato_il, '');
  const ora = ok(await salva(Object.assign({}, g, { data: '2026-10-21', lavori: [Object.assign({}, g.lavori[0], { oreLavoro: 5 }), due] }))).rapportino;
  assert.deepEqual(ora.lavori.map(l => [l.data, l.oreLavoro]), [['2026-10-21', 5], ['2026-10-21', 4]]);
  // Fatturato: rimandato uguale si', cambiato no.
  ok(await manuel('segnaFatturataFuori', { voci: [{ tipo: 'rapportino', id: r.id + '-2' }] }));
  assert.equal(riga(r.id + '-2').stato, 'FATTURATO');
  ok(await salva(Object.assign({}, g, { data: '2026-10-21', lavori: [Object.assign({}, g.lavori[0], { oreLavoro: 5 }), due] })));
  const fatt = await salva(Object.assign({}, g, { data: '2026-10-21', lavori: [Object.assign({}, g.lavori[0], { oreLavoro: 5 }), Object.assign({}, due, { km: 99 })] }));
  assert.equal(fatt.errore, 'Lavoro 2: Il lavoro ' + r.id + '-2 è già fatturato: non si cambia');
});

test('un lavoro FIRMATO di prima: rimandato uguale resta firmato; cambiato torna Da inviare senza la firma di prima', async () => {
  const vecchio = ok(await salva({ idLocale: 'firmato-prima', data: '2026-10-19', tecnico: 'Manuel Gasparotto', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1, descrizione: 'Di prima' })).rapportino;
  ok(await manuel('caricaFile', { tipo: 'firma', id: vecchio.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'firma-rl-1', firmatario: 'Il cliente' }));
  assert.equal(riga(vecchio.id).stato, 'FIRMATO', 'le app 1.1 firmano ancora');
  const lavoro = { id: vecchio.id, idLocale: 'firmato-prima', cliente: 'Rossi Impianti Srl', idCliente: 'C002', tariffa: 40, oreLavoro: 1, descrizione: 'Di prima' };
  const g = { id: vecchio.idGiornata, idLocale: 'giornata-firmato', data: '2026-10-19', tecnico: 'Manuel Gasparotto', lavori: [lavoro] };
  const uguale = ok(await salva(g)).rapportino;
  assert.equal(uguale.id, vecchio.id, 'il rapportino di prima, col suo numero');
  assert.deepEqual([uguale.lavori[0].stato, riga(vecchio.id).firmatario], ['FIRMATO', 'Il cliente']);
  const cambiato = ok(await salva(Object.assign({}, g, { lavori: [Object.assign({}, lavoro, { oreLavoro: 2 })] }))).rapportino;
  assert.equal(cambiato.lavori[0].stato, 'BOZZA');
  const x = riga(vecchio.id);
  assert.deepEqual([x.firma, x.firmatario, x.firmato_il, x.ore_lavoro], ['', '', '', 2]);
});

// ------------------------------------------------------------------ la forma di prima (app 1.1)

test('forma di prima: come la 1.1, un rapportino con un lavoro col suo stesso numero; la risposta di oggi piu\' idGiornata', async () => {
  const r = ok(await salva({ idLocale: 'app-11', data: '2026-10-18', tecnico: 'Manuel Gasparotto', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 })).rapportino;
  assert.match(r.id, /^RAP\/2026\/\d{4}$/);
  assert.deepEqual([r.idGiornata, r.posizione, r.numero], [r.id, 1, r.id]);
  assert.deepEqual([giornata(r.id).id_locale, giornata(r.id).data], ['app-11', '2026-10-18']);
  const letto = ok(await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.deepEqual(letto, r);
  // La coda della 1.1 lo rimanda: niente doppioni; con una data nuova la giornata la segue.
  assert.equal(ok(await salva({ idLocale: 'app-11', data: '2026-10-18', tecnico: 'Manuel Gasparotto', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 })).rapportino.id, r.id);
  ok(await salva({ idLocale: 'app-11', id: r.id, data: '2026-10-17', tecnico: 'Manuel Gasparotto', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 }));
  assert.equal(giornata(r.id).data, '2026-10-17');
  // Un lavoro di un rapportino con piu' lavori, dalla 1.1: cambia solo lui, la data del rapportino resta.
  const g = ok(await salva(rapportino([ROSSI, ELETTRO]))).rapportino;
  const l2 = g.lavori[1];
  const app = ok(await salva({ id: l2.id, idLocale: l2.idLocale, data: '2026-10-25', tecnico: 'Manuel Gasparotto', idCliente: 'C001', descrizione: 'Dalla 1.1', oreLavoro: 3, km: 10 })).rapportino;
  assert.deepEqual([app.id, app.idGiornata, app.posizione, app.data, app.descrizione], [l2.id, g.id, 2, '2026-10-25', 'Dalla 1.1']);
  assert.equal(giornata(g.id).data, '2026-10-20');
});

test('numerazione: conta i rapportini e i numeri di prima, non i -2 dei lavori; non ripete mai', async () => {
  const a = ok(await salva(rapportino([ROSSI, ELETTRO, BIANCHI]))).rapportino;
  const n = Number(a.id.slice(-4));
  const b = ok(await salva(rapportino([ROSSI]))).rapportino;
  assert.equal(b.id, 'RAP/2026/' + String(n + 1).padStart(4, '0'));
  // Un numero di prima piu' alto (una riga scritta da un'importazione, col suo rapportino) e un rapportino senza lavori vivi.
  w.db.esegui("INSERT INTO rapportini (id, data, id_cliente, cliente, stato, creato, modificato, id_giornata, posizione) VALUES ('RAP/2026/0400', '2026-10-01', 'C002', 'Rossi Impianti Srl', 'ANNULLATO', 'x', 'x', 'RAP/2026/0400', 1)");
  w.db.esegui("INSERT INTO giornate (id, data, creato, modificato) VALUES ('RAP/2026/0400', '2026-10-01', 'x', 'x')");
  const c = ok(await salva(rapportino([ROSSI]))).rapportino;
  assert.equal(c.id, 'RAP/2026/0401');
  const d = ok(await salva({ idLocale: 'num-11', data: '2026-10-20', tecnico: 'Manuel Gasparotto', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  assert.equal(d.id, 'RAP/2026/0402', 'anche la forma di prima');
  // L'anno della data: un rapportino del 2027 riparte.
  const e = ok(await salva(rapportino([ROSSI], { data: '2027-01-04' }))).rapportino;
  assert.match(e.id, /^RAP\/2027\/\d{4}$/);
});

// ------------------------------------------------------------------ stato, Elimina, ripristino

test('Elimina il rapportino intero (stato con idGiornata): anche con un lavoro inviato, non con uno fatturato; ripristina li riporta', async () => {
  const r = ok(await salva(rapportino([ROSSI, ELETTRO]))).rapportino;
  const tolti = ok(await manuel('stato', { idGiornata: r.id, stato: 'ANNULLATO' })).rapportini;
  assert.deepEqual(tolti.map(x => [x.id, x.stato]), [[r.id + '-1', 'ANNULLATO'], [r.id + '-2', 'ANNULLATO']]);
  assert.ok(!ok(await manuel('rapportini', {})).rapportini.some(x => x.idGiornata === r.id));
  const tornato = ok(await manuel('ripristinaRapportino', { id: r.id })).rapportino;
  assert.deepEqual(tornato.lavori.map(x => [x.id, x.stato]), [[r.id + '-1', 'BOZZA'], [r.id + '-2', 'BOZZA']]);
  // Anche col numero del rapportino in ids (non e' il numero di un lavoro).
  assert.equal(ok(await manuel('stato', { ids: [r.id], stato: 'ANNULLATO' })).rapportini.length, 2);
  ok(await manuel('ripristinaRapportino', { id: r.id }));
  // Con un lavoro inviato: si' (13/11/2026), e ripristinato torna Inviato.
  ok(await manuel('stato', { ids: [r.id + '-2'], stato: 'INVIATO' }));
  assert.equal(ok(await manuel('stato', { idGiornata: r.id, stato: 'ANNULLATO' })).rapportini.length, 2);
  ok(await manuel('ripristinaRapportino', { id: r.id }));
  assert.deepEqual(lavoriDi(r.id).map(x => x.stato), ['BOZZA', 'INVIATO']);
  // Con un lavoro fatturato: no, e niente tolto.
  ok(await manuel('segnaFatturataFuori', { voci: [{ tipo: 'rapportino', id: r.id + '-2' }] }));
  const no = await manuel('stato', { idGiornata: r.id, stato: 'ANNULLATO' });
  assert.equal(no.errore, 'Il lavoro per Elettrodinamica è in una fattura: non si toglie');
  assert.deepEqual(lavoriDi(r.id).map(x => x.stato), ['BOZZA', 'FATTURATO']);
  // Un lavoro solo (il suo numero): come oggi.
  assert.deepEqual(ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'ANNULLATO' })).rapportini.map(x => x.id), [r.id + '-1']);
  // Un rapportino di prima (numero del lavoro = numero del rapportino): e' il lavoro, come oggi.
  const vecchio = ok(await salva({ idLocale: 'el-11', data: '2026-10-20', tecnico: 'Manuel Gasparotto', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  assert.deepEqual(ok(await manuel('stato', { ids: [vecchio.id], stato: 'ANNULLATO' })).rapportini.map(x => x.id), [vecchio.id]);
});

test('Da inviare: inviaEmail e stato INVIATO accettano i lavori in BOZZA; Riporta da inviare toglie l\'invio', async () => {
  const r = ok(await salva(rapportino([ROSSI, ELETTRO]))).rapportino;
  const inviati = ok(await manuel('inviaEmail', { a: 'rossi@example.com', oggetto: 'Rapportino ' + r.id, messaggio: 'In allegato.',
    allegati: [{ nome: 'rapportino.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 finto').toString('base64') }], ids: [r.id + '-1'] })).rapportini;
  assert.deepEqual(inviati.map(x => [x.id, x.stato]), [[r.id + '-1', 'INVIATO']]);
  assert.equal(riga(r.id + '-2').stato, 'BOZZA', 'l\'altro lavoro (un altro cliente) resta Da inviare');
  assert.equal(ok(await manuel('stato', { ids: [r.id + '-2'], stato: 'INVIATO' })).rapportini[0].stato, 'INVIATO');
  const indietro = ok(await manuel('stato', { ids: [r.id + '-1'], stato: 'BOZZA' })).rapportini[0];
  assert.deepEqual([indietro.stato, riga(r.id + '-1').inviato_il], ['BOZZA', '']);
  // Firmare a mano no (serve la firma vera, come oggi).
  assert.equal((await manuel('stato', { ids: [r.id + '-1'], stato: 'FIRMATO' })).errore, 'Per firmare serve la firma: caricala dal rapportino');
});

// ------------------------------------------------------------------ fatture

test('Da fatturare coi lavori Da inviare; la fattura dice "Rapportino <numero del rapportino>"; le commesse della fattura; Segna fatturato', async () => {
  const r = ok(await salva(rapportino([Object.assign({}, ROSSI, { idCommessa: '26ST002', descrizione: '' }), ELETTRO]))).rapportino;
  const df = ok(await manuel('daFatturare', { idCliente: 'C002' }));
  assert.deepEqual(df.daFirmare, []);
  const voce = df.gruppi.flatMap(x => x.voci).find(v => v.tipo === 'rapportino' && v.id === r.id + '-1');
  assert.ok(voce && voce.pronta, 'il lavoro Da inviare si fattura');
  assert.equal(voce.titolo, 'Rapportino ' + r.id, 'senza descrizione: il numero del rapportino');
  const f = ok(await manuel('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'rapportino', id: r.id + '-1' }] })).fattura;
  assert.match(f.righe[0].descrizione, new RegExp('^Rapportino ' + r.id.replace(/\//g, '\\/') + ' del 20\\/10\\/2026'));
  assert.ok(!f.righe.some(x => x.descrizione.indexOf(r.id + '-1') >= 0), 'mai il numero del lavoro nei testi');
  assert.equal(f.causale.indexOf(r.id + '-1'), -1);
  // Le commesse della fattura: nella fattura e nel modello del pacchetto (il PDF le scrive accanto al Mittente).
  assert.deepEqual(f.commesse, ['26ST002']);
  assert.deepEqual(ok(await manuel('fattura', { id: f.id })).fattura.commesse, ['26ST002']);
  assert.deepEqual(ok(await manuel('pacchetto', { id: f.id })).modello.commesse, ['26ST002']);
  ok(await manuel('scartaFattura', { id: f.id }));
  // Segna fatturato (fuori da Wisper) un lavoro Da inviare: si'; tolto il segno torna Da inviare.
  ok(await manuel('segnaFatturataFuori', { voci: [{ tipo: 'rapportino', id: r.id + '-2' }] }));
  assert.equal(riga(r.id + '-2').stato, 'FATTURATO');
  ok(await manuel('segnaFatturataFuori', { voci: [{ tipo: 'rapportino', id: r.id + '-2' }], annulla: true }));
  assert.equal(riga(r.id + '-2').stato, 'BOZZA');
  // Un lavoro tolto (annullato) no.
  ok(await manuel('stato', { ids: [r.id + '-2'], stato: 'ANNULLATO' }));
  assert.equal((await manuel('segnaFatturataFuori', { voci: [{ tipo: 'rapportino', id: r.id + '-2' }] })).errore, 'Il rapportino ' + r.id + '-2 è annullato');
});

// ------------------------------------------------------------------ Dashboard, esportazione, collaboratore

test('la Dashboard: niente firma; "N lavori da inviare da più di una settimana" col collegamento quali: inviare', async () => {
  const vecchio = ok(await salva(rapportino([ROSSI], { data: piuGiorni(oggi(), -12) }))).rapportino;
  const d = ok(await manuel('dashboard', { tutto: true }));
  const tutte = [].concat(d.urgenti, d.settimana, d.pianificare);
  assert.ok(!tutte.some(v => /firm/.test(v.titolo)), 'nessuna voce parla di firma');
  const v = tutte.find(x => /^\d+ lavor[oi] da inviare da più di una settimana$/.test(x.titolo));
  assert.ok(v);
  assert.deepEqual([v.tipo, v.gravita, v.unita], ['rapportini', 'urgente', 'lavori']);
  assert.deepEqual(v.collegamento, { pagina: 'rapportini', filtro: { quali: 'inviare', a: piuGiorni(oggi(), -7) } });
  assert.ok(v.oggetti.includes('rapportino:' + vecchio.id + '-1'));
  const n = d.numeri.rapportini;
  assert.equal(n.daFirmare, 0);
  assert.equal(n.daMandare, n.daInviare);
  assert.ok(n.daInviare >= v.quanto);
  // Nessuna proposta di far firmare.
  assert.ok(!ok(await manuel('daMandare')).proposti.some(x => /^rapportino:/.test(x.proposta)));
});

test('esporta: la colonna Rapportino accanto al Numero del lavoro', async () => {
  const r = ok(await salva(rapportino([ROSSI, ELETTRO]))).rapportino;
  const csv = Buffer.from(ok(await manuel('esporta', { cosa: 'rapportini', tutti: true })).base64, 'base64').toString('utf8').replace(/^﻿/, '');
  const righe = csv.split('\r\n');
  assert.deepEqual(righe[0].split(';').slice(0, 3), ['Numero', 'Rapportino', 'Data']);
  const due = righe.find(x => x.split(';')[0] === r.id + '-2');
  assert.deepEqual(due.split(';').slice(0, 2), [r.id + '-2', r.id]);
});

test('il collaboratore: i suoi rapportini col suo nome; quelli degli altri no', async () => {
  const mio = ok(await marco('salvaRapportino', { rapportino: rapportino([{ idCliente: 'C001', descrizione: 'Cablaggio', oreLavoro: 2 }], { tecnico: 'Qualcun Altro' }) })).rapportino;
  assert.equal(mio.tecnico, 'Marco Rossato');
  assert.equal(giornata(mio.id).utente_id, w.db.riga("SELECT id FROM utenti WHERE email = 'marco@esempio.it'").id);
  const g = rapportino([ROSSI]);
  const suo = ok(await salva(g)).rapportino;
  const no = await marco('salvaRapportino', { rapportino: Object.assign({}, g, { lavori: [Object.assign({}, g.lavori[0], { oreLavoro: 9 })] }) });
  assert.equal(no.permesso, false);
  assert.equal(riga(suo.id + '-1').ore_lavoro, 2);
  assert.equal((await marco('stato', { idGiornata: suo.id, stato: 'ANNULLATO' })).permesso, false);
});

// ------------------------------------------------------------------ la migrazione 011

test('migrazione 011: ogni riga di prima e\' un rapportino con un lavoro, stesso numero; copia prima-11; le righe senza rapportino si sistemano', () => {
  const dati = cartellaNuova('migrazione-011');
  const migr = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(migr, { recursive: true });
  for (const f of ['utili.js', 'documenti.js']) fs.copyFileSync(path.join(MIGRAZIONI, '..', f), path.join(dati, 'src', f));
  for (const f of fs.readdirSync(MIGRAZIONI).filter(x => /^(00\d|010)-/.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(migr, f));
  const db = new Database(path.join(dati, 'wisper.db'));
  db.migra(migr);
  assert.equal(db.versione(), 10);
  const righe = [
    ['RAP/2026/0001', 'a-1', '2026-10-01', 'Manuel Gasparotto', 'BOZZA', ''],
    ['RAP/2026/0002', 'a-2', '2026-10-02', 'Marco Rossato', 'FIRMATO', 'firma.png'],
    ['RAP/2026/0003', null, '2026-10-03', 'Manuel Gasparotto', 'INVIATO', ''],
    ['RAP/2025/0099', 'a-4', '2025-12-30', 'Manuel Gasparotto', 'ANNULLATO', ''],
  ];
  for (const [id, loc, data, tecnico, stato, firma] of righe) {
    db.esegui("INSERT INTO rapportini (id, id_locale, data, tecnico, id_cliente, cliente, stato, firma, creato, modificato) VALUES (?, ?, ?, ?, 'C002', 'Rossi Impianti Srl', ?, ?, ?, ?)",
      id, loc, data, tecnico, stato, firma, data + ' 18:00:00', data + ' 18:30:00');
  }
  const prima = db.righe('SELECT * FROM rapportini ORDER BY id').map(r => Object.assign({}, r));
  db.chiudi();
  const w2 = new Wisper({ dati });
  try {
    assert.equal(w2.db.versione(), 14);
    const copia = new Database(path.join(dati, 'wisper.db.prima-11'));
    assert.equal(copia.versione(), 10, 'la copia e\' com\'era prima');
    copia.chiudi();
    // Le righe di prima: tutte le colonne uguali, piu' id_giornata = id e posizione 1.
    const dopo = w2.db.righe('SELECT * FROM rapportini ORDER BY id').map(r => Object.assign({}, r));
    assert.equal(dopo.length, prima.length);
    dopo.forEach((r, i) => {
      assert.deepEqual([r.id_giornata, r.posizione], [r.id, 1]);
      const x = Object.assign({}, r);
      delete x.id_giornata;
      delete x.posizione;
      // 1.4.0: le colonne della 014 col valore di base.
      assert.deepEqual([x.indennita, x.importo_indennita], ['', 0]);
      delete x.indennita;
      delete x.importo_indennita;
      assert.deepEqual(x, prima[i], r.id);
    });
    // Un rapportino per riga, col suo stesso numero, idLocale, data, tecnico e orari.
    const giornate = w2.db.righe('SELECT * FROM giornate ORDER BY id').map(g => Object.assign({}, g));
    assert.deepEqual(giornate.map(g => [g.id, g.id_locale, g.data, g.tecnico, g.creato, g.modificato]),
      prima.map(r => [r.id, r.id_locale, r.data, r.tecnico, r.creato, r.modificato]));
    // Il prossimo numero continua.
    const nuovo = w2.come({ utente: w2.db.riga('SELECT * FROM utenti ORDER BY id LIMIT 1') || null, sistema: true }, () =>
      w2.salvaRapportino({ idLocale: 'dopo-011', data: '2026-10-20', lavori: [{ idLocale: 'dopo-011-1', idCliente: '', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 }] }));
    assert.equal(nuovo.id, 'RAP/2026/0004');
    // Una riga scritta senza rapportino (un'importazione, il ponte): alla riapertura ha il suo.
    w2.db.esegui("INSERT INTO rapportini (id, data, id_cliente, cliente, stato, creato, modificato) VALUES ('RAP/2026/0050', '2026-10-05', 'C002', 'Rossi Impianti Srl', 'BOZZA', 'x', 'x')");
  } finally {
    w2.chiudi();
  }
  const w3 = new Wisper({ dati });
  try {
    assert.deepEqual([w3.db.riga("SELECT id_giornata FROM rapportini WHERE id = 'RAP/2026/0050'").id_giornata, !!w3.db.riga("SELECT id FROM giornate WHERE id = 'RAP/2026/0050'")], ['RAP/2026/0050', true]);
  } finally {
    w3.chiudi();
  }
});

// ------------------------------------------------------------------ la migrazione 012

test('migrazione 012: i rapportini di prima dello stesso giorno e della stessa persona diventano uno; quelli della 1.2 restano', () => {
  const dati = cartellaNuova('migrazione-012');
  const migr = path.join(dati, 'src', 'migrazioni');
  fs.mkdirSync(migr, { recursive: true });
  for (const f of ['utili.js', 'documenti.js']) fs.copyFileSync(path.join(MIGRAZIONI, '..', f), path.join(dati, 'src', f));
  const copia = re => { for (const f of fs.readdirSync(MIGRAZIONI).filter(x => re.test(x))) fs.copyFileSync(path.join(MIGRAZIONI, f), path.join(migr, f)); };
  copia(/^(00\d|010)-/);
  const db = new Database(path.join(dati, 'wisper.db'));
  db.migra(migr);
  // Le righe di prima (prima della 1.2), con l'ora in cui erano state scritte.
  const righe = [
    ['RAP/2026/0001', '2026-11-06', 'Manuel Gasparotto', 'INVIATO', '2026-11-06T19:27:00+01:00'],
    ['RAP/2026/0003', '2026-11-06', 'Manuel Gasparotto', 'BOZZA', '2026-11-06T19:31:00+01:00'],
    ['RAP/2026/0002', '2026-11-06', 'Manuel Gasparotto', 'INVIATO', '2026-11-06T19:29:00+01:00'],
    ['RAP/2026/0004', '2026-11-05', 'Manuel Gasparotto', 'INVIATO', '2026-11-06T19:44:00+01:00'],
    ['RAP/2026/0005', '2026-11-05', 'Manuel Gasparotto', 'INVIATO', '2026-11-06T19:45:00+01:00'],
    ['RAP/2026/0006', '2026-11-06', 'Marco Rossato', 'BOZZA', '2026-11-06T20:00:00+01:00'],
    ['RAP/2026/0007', '2026-11-04', 'Andrea Gasparotto', 'ANNULLATO', '2026-11-04T06:38:00+01:00'],
  ];
  for (const [id, data, tecnico, stato, creato] of righe) {
    db.esegui("INSERT INTO rapportini (id, data, tecnico, id_cliente, cliente, stato, creato, modificato) VALUES (?, ?, ?, 'C002', 'Rossi Impianti Srl', ?, ?, ?)",
      id, data, tecnico, stato, creato, creato.replace('T19', 'T21'));
  }
  copia(/^011-/);
  db.migra(migr);
  assert.equal(db.versione(), 11);
  // Un rapportino fatto con la 1.2 lo stesso giorno: resta com'e'.
  db.esegui("INSERT INTO giornate (id, data, tecnico, creato, modificato) VALUES ('RAP/2026/0010', '2026-11-06', 'Manuel Gasparotto', 'x', 'x')");
  db.esegui("INSERT INTO rapportini (id, id_giornata, posizione, data, tecnico, id_cliente, cliente, stato, creato, modificato) VALUES ('RAP/2026/0010-1', 'RAP/2026/0010', 1, '2026-11-06', 'Manuel Gasparotto', 'C002', 'Rossi Impianti Srl', 'BOZZA', 'x', 'x')");
  const prima = db.righe('SELECT * FROM rapportini ORDER BY id').map(r => Object.assign({}, r));
  db.chiudi();
  const w2 = new Wisper({ dati });
  try {
    assert.equal(w2.db.versione(), 14);
    const copiaPrima = new Database(path.join(dati, 'wisper.db.prima-12'));
    assert.equal(copiaPrima.versione(), 11, 'la copia e\' com\'era prima');
    copiaPrima.chiudi();
    // I rapportini: quello del 06/11 di Manuel prende il numero del primo scritto e i lavori in ordine di scrittura.
    const giornate = w2.db.righe('SELECT id, data, tecnico, creato, modificato FROM giornate ORDER BY id').map(g => Object.assign({}, g));
    assert.deepEqual(giornate.map(g => g.id), ['RAP/2026/0001', 'RAP/2026/0004', 'RAP/2026/0006', 'RAP/2026/0007', 'RAP/2026/0010']);
    assert.deepEqual([giornate[0].creato, giornate[0].modificato], ['2026-11-06T19:27:00+01:00', '2026-11-06T21:31:00+01:00']);
    const dove = w2.db.righe('SELECT id, id_giornata, posizione FROM rapportini ORDER BY id_giornata, posizione').map(r => [r.id, r.id_giornata, r.posizione]);
    assert.deepEqual(dove, [
      ['RAP/2026/0001', 'RAP/2026/0001', 1], ['RAP/2026/0002', 'RAP/2026/0001', 2], ['RAP/2026/0003', 'RAP/2026/0001', 3],
      ['RAP/2026/0004', 'RAP/2026/0004', 1], ['RAP/2026/0005', 'RAP/2026/0004', 2],
      ['RAP/2026/0006', 'RAP/2026/0006', 1],
      ['RAP/2026/0007', 'RAP/2026/0007', 1],
      ['RAP/2026/0010-1', 'RAP/2026/0010', 1],
    ]);
    // I lavori non cambiano in niente altro.
    const dopo = w2.db.righe('SELECT * FROM rapportini ORDER BY id').map(r => Object.assign({}, r));
    dopo.forEach((r, i) => {
      const a = Object.assign({}, r); const b = Object.assign({}, prima[i]);
      for (const x of [a, b]) { delete x.id_giornata; delete x.posizione; delete x.indennita; delete x.importo_indennita; }
      assert.deepEqual(a, b, r.id);
    });
    // Nel registro, uno spostamento per lavoro spostato.
    assert.deepEqual(w2.db.righe("SELECT id_riga FROM registro WHERE nota LIKE 'migrazione 012%' ORDER BY id_riga").map(r => r.id_riga), ['RAP/2026/0002', 'RAP/2026/0003', 'RAP/2026/0005']);
    // Come lo leggono le app: il numero che si vede e' quello del rapportino.
    const letti = w2.come({ utente: null, sistema: true }, () => w2.leggiRapportini('2026-11-01', '2026-11-30', true));
    const lista = Array.isArray(letti) ? letti : letti.rapportini;
    assert.deepEqual(lista.filter(r => r.idGiornata === 'RAP/2026/0001').map(r => [r.id, r.posizione, r.numero]),
      [['RAP/2026/0001', 1, 'RAP/2026/0001'], ['RAP/2026/0002', 2, 'RAP/2026/0001'], ['RAP/2026/0003', 3, 'RAP/2026/0001']]);
    // Il prossimo numero non riprende quelli tolti come rapportini (sono ancora numeri di lavori).
    const nuovo = w2.come({ utente: null, sistema: true }, () =>
      w2.salvaRapportino({ idLocale: 'dopo-012', data: '2026-11-07', lavori: [{ idLocale: 'dopo-012-1', idCliente: '', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 }] }));
    assert.equal(nuovo.id, 'RAP/2026/0011');
  } finally {
    w2.chiudi();
  }
});
