// La migrazione 003 e le spese dei rapportini (architettura.md §14.11). Il requisito: dopo la migrazione ogni
// rapportino gia' scritto da' gli stessi identici numeri di prima, al centesimo. "Prima" non e' ricalcolato da
// questo codice: e' prima.json, scritto dal server 0.5.0 sullo stesso database (migrazione-003/genera-prima.js).
// In piu': le versioni vecchie delle app (dal ponte) continuano a salvare rapportini con spese e foto, e una spesa
// del rapportino spostata allo studio esce dal suo conto.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cartellaNuova, PNG } = require('./aiuto');
const { creaDatabaseVersione2, numeri, RAPPORTINI } = require('./migrazione-003/semi');
const PRIMA = require('./migrazione-003/prima.json');
const { Wisper } = require('../src/wisper');
const { Database } = require('../src/db');
const { esegui } = require('../src/richieste');
const { speseDaiRapportini } = require('../src/migrazioni/003-ore-spese');
const { numero, centesimi } = require('../src/utili');

let cartella;
let w;
let righePrima;
let filePrima;

test.before(() => {
  cartella = cartellaNuova('migrazione-003');
  creaDatabaseVersione2(cartella);
  const db = new Database(path.join(cartella, 'wisper.db'));
  righePrima = db.righe('SELECT * FROM rapportini ORDER BY id');
  filePrima = db.righe('SELECT * FROM file ORDER BY id');
  db.chiudi();
  w = new Wisper({ dati: cartella });
});
test.after(() => w.chiudi());

/** Come una versione vecchia dell'app attraverso il ponte (lavora come il titolare). */
const ponte = (azione, dati) => esegui(w, Object.assign({ azione }, dati || {}), { ponte: true });
const spese = id => w.db.righe('SELECT * FROM spese WHERE rapportino_id = ? ORDER BY id', id);
const rapportino = id => w.db.riga('SELECT * FROM rapportini WHERE id = ?', id);

/**
 * 03/11/2026 (server 0.12.0): il CSV dei rapportini ha tre colonne in piu' subito dopo la commessa (Codice progetto,
 * Progetto, Intestato a), vuote per i rapportini di prima. Controllate vuote e tolte, il resto deve essere identico.
 * 06/11/2026 (il rapportino con piu' lavori): e una colonna Rapportino subito dopo il Numero, che per una riga di prima e'
 * il suo stesso numero (un rapportino con un lavoro solo). Controllata e tolta anche lei.
 */
function senzaProgetti(csv) {
  return csv.split('\r\n').map((riga, n) => {
    if (!riga) return riga;
    const c = riga.split(';');
    assert.equal(c[1], n === 0 ? 'Rapportino' : c[0], 'colonna Rapportino, riga ' + n);
    c.splice(1, 1);
    assert.deepEqual(c.slice(7, 10), n === 0 ? ['Codice progetto', 'Progetto', 'Intestato a'] : ['', '', ''], 'colonne dei progetti, riga ' + n);
    return c.slice(0, 7).concat(c.slice(10)).join(';');
  }).join('\r\n');
}

/** Ogni campo che c'era prima ha lo stesso identico valore (i campi nuovi si aggiungono e basta). */
function stessiCampi(ora, prima, chi) {
  for (const k of Object.keys(prima)) assert.deepEqual(ora[k], prima[k], chi + ' · ' + k);
}

test('migrazione 003: versione 3, la copia wisper.db.prima-3, i rapportini non si toccano', () => {
  // Dalla fase 4 (e dalla 5 e dalla 6) il database va avanti fino all'ultima migrazione: la 003 c'e' (la sua copia prima-3 anche).
  assert.equal(w.db.versione(), 14);
  assert.ok(fs.existsSync(path.join(cartella, 'wisper.db.prima-3')), 'la copia prima della migrazione');
  const dopo = w.db.righe('SELECT * FROM rapportini ORDER BY id');
  assert.equal(dopo.length, righePrima.length);
  righePrima.forEach((r, i) => stessiCampi(dopo[i], r, r.id));
  for (const r of dopo) assert.equal(r.stato_approvazione, '', r.id + ': prima della fase 3 non serviva approvare');
  const file = w.db.righe('SELECT * FROM file ORDER BY id');
  filePrima.forEach((f, i) => {
    const senzaSpesa = Object.assign({}, file[i]);
    delete senzaSpesa.spesa_id;
    // Le colonne della migrazione 004 (fase 4): la foto non e' di una fattura.
    delete senzaSpesa.fattura_id;
    delete senzaSpesa.ricevuta_id;
    // Le colonne della migrazione 005 (fase 5): il documento dell'archivio, il ticket, la copia fuori casa.
    for (const k of ['documento_id', 'versione_id', 'ticket_id', 'fuori_il', 'fuori_no', 'caricato_da', 'svuotato']) delete senzaSpesa[k];
    // Le colonne della migrazione 006 (fase 6): la manutenzione, la lettura dei km, la consegna, l'assegnazione.
    for (const k of ['manutenzione_id', 'lettura_id', 'consegna_id', 'assegnazione_id']) delete senzaSpesa[k];
    // La colonna della migrazione 007 (fase 7): il file non e' arrivato dal portale.
    delete senzaSpesa.caricamento_id;
    assert.deepEqual(senzaSpesa, Object.assign({}, f), f.id);
  });
});

test('i rapportini gia\' scritti danno gli stessi identici numeri del server 0.5.0: campi, CSV, dashboard', () => {
  const ora = numeri(w);
  assert.equal(PRIMA.versione, '0.5.0');
  assert.equal(ora.rapportini.length, PRIMA.rapportini.length);
  for (const vecchio of PRIMA.rapportini) {
    const nuovo = ora.rapportini.find(r => r.id === vecchio.id);
    assert.ok(nuovo, vecchio.id);
    // Tutti i campi di prima, uno per uno: spese, totale, compenso, rimborso km, foto, firma, stato, date...
    stessiCampi(nuovo, vecchio, vecchio.id);
  }
  assert.equal(senzaProgetti(ora.csv), PRIMA.csv, 'il CSV per Excel e\' uguale carattere per carattere');
  // 06/11/2026 (il rapportino con piu' lavori, senza firma): i lavori Da inviare (BOZZA) si fatturano anche senza firma, quindi
  // "Da fatturare" cresce esattamente di "In bozza"; In bozza resta uguale.
  assert.deepEqual(ora.soldi, { daFatturare: Math.round((PRIMA.soldi.daFatturare + PRIMA.soldi.inBozza) * 100) / 100, inBozza: PRIMA.soldi.inBozza }, 'da fatturare e in bozza');
  // 06/11/2026: niente piu' "da firmare": le bozze (di prima "da firmare") e i firmati sono tutti Da inviare (daMandare), e si
  // fatturano anche le bozze.
  const c = PRIMA.contiRapportini;
  assert.deepEqual(ora.contiRapportini, { daFirmare: 0, daMandare: c.daFirmare + c.daMandare, daFatturare: c.daFatturare + c.daFirmare });
  // I casi limite, con le parole: vuote, zero, testo con la virgola, tre decimali, negativo.
  const r = id => ora.rapportini.find(x => x.id === id);
  assert.deepEqual([r('RAP/2026/0003').spese, r('RAP/2026/0008').spese, r('RAP/2026/0004').spese], [0, 0, 0]);
  assert.equal(r('RAP/2026/0007').spese, 12.5);
  assert.equal(r('RAP/2026/0002').spese, 23.456);
  assert.equal(r('RAP/2026/0010').spese, -5);
});

test('una riga di spese per ogni rapportino con spese: stesso importo, al cliente, approvata, con le sue foto', () => {
  const conSpese = RAPPORTINI.filter(x => numero(x[9]) !== 0).map(x => x[0]);
  assert.deepEqual(conSpese.sort(), ['RAP/2026/0001', 'RAP/2026/0002', 'RAP/2026/0005', 'RAP/2026/0006', 'RAP/2026/0007', 'RAP/2026/0009',
    'RAP/2026/0010', 'RAP/2026/0011']);
  for (const x of RAPPORTINI) {
    const [id, data, stato, cliente, commessa, , , , , importo, note, , , , , , utente, altro] = x;
    const righe = spese(id);
    if (numero(importo) === 0) {
      assert.equal(righe.length, 0, id + ': spese vuote o zero, nessuna riga');
      continue;
    }
    assert.equal(righe.length, 1, id);
    const s = righe[0];
    assert.equal(s.importo, numero(importo), id + ': lo stesso identico importo');
    assert.deepEqual([s.destinazione, s.stato, s.dal_rapportino, s.categoria, s.pagata_da_me, s.anticipazione], ['cliente', 'approvata', 1, 'altro', 0, 0], id);
    assert.deepEqual([s.data, s.cliente_id, s.commessa_id, s.utente_id], [data, cliente, commessa, utente], id);
    assert.equal(s.descrizione, note || 'Spese del rapportino', id);
    assert.equal(s.fatturata_il, stato === 'FATTURATO' ? altro.fatturato_il : '', id + ': fatturata se il rapportino lo e\'');
    // La colonna resta il totale delle spese al cliente.
    assert.equal(centesimi(numero(rapportino(id).spese)), centesimi(s.importo), id);
  }
  const fotoDi = id => w.db.righe("SELECT id, spesa_id FROM file WHERE tipo = 'spesa' AND rapportino_id = ? ORDER BY id", id);
  const riga = id => spese(id)[0].id;
  assert.deepEqual(fotoDi('RAP/2026/0001').map(f => f.spesa_id), [riga('RAP/2026/0001'), riga('RAP/2026/0001')]);
  assert.deepEqual(fotoDi('RAP/2026/0009').map(f => f.spesa_id), [riga('RAP/2026/0009'), riga('RAP/2026/0009')], 'anche quella nel cestino');
  assert.deepEqual(fotoDi('RAP/2026/0004').map(f => f.spesa_id), [null], 'spese zero: la foto resta solo del rapportino');
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM registro WHERE nota LIKE 'migrazione 003%' AND tabella = 'spese'").n, 8, 'nel registro');
  assert.equal(speseDaiRapportini(w.db, 'di nuovo'), 0, 'rifarla non crea doppioni');
});

test('migrazione 003: impostazioni nuove e il primo veicolo dall\'auto di oggi (AUTO, EURO_KM)', () => {
  const imp = w.leggiImpostazioni();
  assert.deepEqual([imp.APPROVAZIONE, imp.ACI_ANNO, imp.INDENNITA_TRASFERTA, imp.ORE_GIORNALIERE], ['collaboratori', 2026, '', 8]);
  const v = w.db.righe('SELECT * FROM veicoli');
  assert.equal(v.length, 1);
  assert.deepEqual([v[0].nome, v[0].euro_km, v[0].anno_aci, v[0].attivo], ['Auto di prova', 0.9, 2026, 1]);
});

test('riaperto il server: la migrazione non si rifa\' e i numeri restano quelli di prima', () => {
  const quante = w.db.riga('SELECT COUNT(*) n FROM spese').n;
  w.chiudi();
  w = new Wisper({ dati: cartella });
  assert.equal(w.db.versione(), 14);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM spese').n, quante);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM veicoli').n, 1);
  const ora = numeri(w);
  for (const vecchio of PRIMA.rapportini) stessiCampi(ora.rapportini.find(r => r.id === vecchio.id), vecchio, vecchio.id);
  assert.equal(senzaProgetti(ora.csv), PRIMA.csv);
});

test('versioni vecchie (ponte): le stesse spese non cambiano niente; spese nuove spostano la riga del passo 3', async () => {
  const vecchio = PRIMA.rapportini.find(r => r.id === 'RAP/2026/0007');
  // L'app vecchia rimanda il rapportino cosi' come l'aveva letto.
  const stesso = await ponte('salvaRapportino', { rapportino: vecchio });
  assert.equal(stesso.ok, true, stesso.errore);
  assert.deepEqual([stesso.rapportino.spese, stesso.rapportino.totale, stesso.rapportino.compensoOre], [12.5, 242.3, 210]);
  const primaRiga = spese('RAP/2026/0007')[0];
  assert.equal(spese('RAP/2026/0007').length, 1);
  assert.equal(primaRiga.importo, 12.5);
  // Spese nuove: la colonna e' quella mandata, la riga del passo 3 la segue, il totale con le tariffe congelate.
  const venti = await ponte('salvaRapportino', { rapportino: Object.assign({}, vecchio, { spese: 20, noteSpese: 'Pranzo e parcheggio' }) });
  assert.deepEqual([venti.rapportino.spese, venti.rapportino.totale], [20, 249.8]);
  assert.deepEqual(spese('RAP/2026/0007').map(s => [s.id, s.importo, s.descrizione, s.tolta === null]), [[primaRiga.id, 20, 'Pranzo e parcheggio', true]]);
  assert.equal(venti.rapportino.righeSpese.length, 1);
  assert.equal(venti.rapportino.righeSpese[0].importo, 20);
  // A zero la riga si toglie (non si cancella); quando le spese tornano, torna la stessa riga.
  const zero = await ponte('salvaRapportino', { rapportino: Object.assign({}, vecchio, { spese: 0 }) });
  assert.deepEqual([zero.rapportino.spese, zero.rapportino.totale, zero.rapportino.righeSpese.length], [0, 229.8, 0]);
  assert.ok(spese('RAP/2026/0007')[0].tolta);
  const otto = await ponte('salvaRapportino', { rapportino: Object.assign({}, vecchio, { spese: 8 }) });
  assert.deepEqual([otto.rapportino.spese, otto.rapportino.totale], [8, 237.8]);
  assert.deepEqual(spese('RAP/2026/0007').map(s => [s.id, s.importo, s.tolta]), [[primaRiga.id, 8, null]]);
  // Un rapportino nuovo da un'app vecchia, con spese: nasce la riga.
  const nuovo = await ponte('salvaRapportino', { rapportino: { idLocale: 'vecchia-app-1', data: '2026-10-01', idCliente: 'C002', idCommessa: '26ST002',
    tariffa: 42, oreLavoro: 2, km: 22, spese: 11.35, noteSpese: 'Pedaggio' } });
  assert.equal(nuovo.ok, true, nuovo.errore);
  assert.deepEqual([nuovo.rapportino.spese, nuovo.rapportino.totale], [11.35, centesimi(84 + 19.8 + 11.35)]);
  assert.deepEqual(spese(nuovo.rapportino.id).map(s => [s.importo, s.destinazione, s.descrizione, s.stato]), [[11.35, 'cliente', 'Pedaggio', 'approvata']]);
});

test('versioni vecchie (ponte): la foto della spesa va al rapportino, come oggi, e alla riga del passo 3', async () => {
  const f = await ponte('caricaFile', { tipo: 'spesa', id: 'RAP/2026/0007', base64: PNG.toString('base64'), mime: 'image/png', idFile: 'vecchia-foto-1' });
  assert.equal(f.ok, true, f.errore);
  const id = f.file.url.match(/\/d\/([^/]+)\//)[1];
  const riga = w.db.riga('SELECT * FROM file WHERE id = ?', id);
  assert.equal(riga.rapportino_id, 'RAP/2026/0007');
  assert.equal(riga.spesa_id, spese('RAP/2026/0007')[0].id);
  const r = await ponte('rapportini', { tutti: true });
  assert.ok(r.rapportini.find(x => x.id === 'RAP/2026/0007').foto.some(x => x.id === id), 'tra le foto del rapportino, come prima');
});

test('una spesa del rapportino spostata allo studio esce dal suo conto (e le sue foto dal PDF); torna al cliente e rientra', async () => {
  const s = spese('RAP/2026/0009')[0];
  const prima = rapportino('RAP/2026/0009');
  assert.deepEqual([prima.spese, prima.totale], [0.1, 206.5]);
  const studio = await ponte('salvaSpesa', { spesa: { id: s.id, destinazione: 'studio' } });
  assert.equal(studio.ok, true, studio.errore);
  const dopo = (await ponte('rapportini', { tutti: true })).rapportini.find(x => x.id === 'RAP/2026/0009');
  assert.deepEqual([dopo.spese, dopo.totale, dopo.compensoOre, dopo.rimborsoKm], [0, 206.4, 120, 86.4], 'totale = compenso + rimborso km + spese al cliente');
  assert.deepEqual(dopo.righeSpese.map(x => [x.id, x.destinazione]), [[s.id, 'studio']], 'la riga resta del rapportino');
  assert.equal(dopo.foto.length, 0, 'lo scontrino non va piu\' al cliente');
  const indietro = await ponte('salvaSpesa', { spesa: { id: s.id, destinazione: 'cliente' } });
  assert.equal(indietro.ok, true, indietro.errore);
  const ancora = rapportino('RAP/2026/0009');
  assert.deepEqual([ancora.spese, ancora.totale], [0.1, 206.5]);
  assert.equal(w.db.righe("SELECT id FROM file WHERE rapportino_id = 'RAP/2026/0009' AND tipo = 'spesa' AND cestinato IS NULL").length, 1);
});

test('da firmato in poi le spese del rapportino non cambiano conto: niente spostamenti, niente tolte, solo chi l\'ha pagata', async () => {
  const s = spese('RAP/2026/0005')[0];
  const sposta = await ponte('salvaSpesa', { spesa: { id: s.id, destinazione: 'studio' } });
  assert.equal(sposta.ok, false);
  assert.equal(sposta.errore, 'È nel rapportino RAP/2026/0005, già inviato: si cambiano solo categoria, descrizione e chi l\'ha pagata');
  const importo = await ponte('salvaSpesa', { spesa: { id: s.id, importo: 99 } });
  assert.equal(importo.ok, false);
  const toglie = await ponte('togliSpesa', { id: spese('RAP/2026/0001')[0].id });
  assert.equal(toglie.errore, 'Il rapportino RAP/2026/0001 è già inviato: per togliere la spesa riportalo da inviare');
  const aggiunge = await ponte('salvaSpesa', { spesa: { idRapportino: 'RAP/2026/0011', importo: 5, categoria: 'parcheggio' } });
  assert.equal(aggiunge.errore, 'Il rapportino RAP/2026/0011 è già inviato: per aggiungere spese riportalo da inviare');
  const pagata = await ponte('salvaSpesa', { spesa: { id: s.id, pagataDaMe: true, categoria: 'vitto' } });
  assert.equal(pagata.ok, true, pagata.errore);
  assert.deepEqual([pagata.spesa.pagataDaMe, pagata.spesa.categoria, pagata.spesa.importo], [true, 'vitto', 14.5]);
  const r = rapportino('RAP/2026/0005');
  assert.deepEqual([r.spese, r.totale, r.stato], [14.5, 325.9, 'FIRMATO'], 'il rapportino firmato non si tocca');
});

test('un rapportino annullato: la sua spesa non conta negli elenchi; ripristinato, torna', async () => {
  const id = spese('RAP/2026/0006')[0].id;
  const settembre = { da: '2026-09-01', a: '2026-09-30' };
  assert.equal((await ponte('spese', settembre)).spese.some(x => x.id === id), false);
  assert.equal((await ponte('ripristinaRapportino', { id: 'RAP/2026/0006' })).ok, true);
  assert.equal((await ponte('spese', settembre)).spese.some(x => x.id === id), true);
  const r = rapportino('RAP/2026/0006');
  assert.deepEqual([r.stato, r.spese, r.totale], ['FIRMATO', 7.3, 111.1]);
});

test('importazione dal foglio: le spese dei rapportini diventano righe anche li\'', () => {
  // importa.js scrive i rapportini in un database nuovo (gia' alla 003) e poi chiama la stessa funzione.
  const c = cartellaNuova('importa-003');
  const nuovo = new Wisper({ dati: c });
  nuovo.db.esegui("INSERT INTO rapportini (id, data, id_cliente, cliente, spese, totale, stato, creato, modificato) VALUES ('RAP/2025/0001', '2025-12-01', 'C001', 'X', 31.4, 100, 'FATTURATO', '', '')");
  assert.equal(speseDaiRapportini(nuovo.db, 'importazione'), 1);
  assert.equal(nuovo.db.riga("SELECT importo FROM spese WHERE rapportino_id = 'RAP/2025/0001'").importo, 31.4);
  nuovo.chiudi();
});
