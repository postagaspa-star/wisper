// Fase 2: preventivi e listino. I conti (casi-preventivo.json, gli stessi per telefono e computer),
// numeri e revisioni, blocco dopo la bozza, invio, accettazione con le scelte, rifiuto e riapertura,
// commessa dal preventivo una volta sola, permessi di ogni ruolo, registro, dashboard, esportazione.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serverDiProva, PNG, giornoDeiPrototipi, cartellaNuova } = require('./aiuto');
// La Dashboard intera del titolare contiene anche la storia a date fisse delle fasi 4 e 5: dal 2027 quella storia
// invecchia (fatture scadute da mesi, decine di pagamenti scaduti) e riempie le sezioni prima delle voci cercate qui
// (20 voci al massimo per sezione, come vuole l'accordo): queste prove la guardano dal giorno del prototipo, giovedi' 22/10/2026,
// qualunque giorno sia (anche con WISPER_OGGI_PROVA). Le altre prove girano sul giorno vero.
giornoDeiPrototipi();
const C = require('../src/conti');
const { CAMPI_COSTI } = require('../src/permessi');
const { Wisper } = require('../src/wisper');
const { oggi, piuGiorni } = require('../src/utili');

const CASI = require('./casi-preventivo.json').casi;
const ANNO = oggi().slice(0, 4);

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

function chiavi(x, out) {
  out = out || new Set();
  if (Array.isArray(x)) x.forEach(v => chiavi(v, out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) { out.add(k); chiavi(x[k], out); }
  return out;
}
const soldiIn = x => Array.from(chiavi(x)).filter(k => CAMPI_COSTI.has(k));
const listino = async codice => (await manuel('listino', { tutte: true })).listino.find(v => v.codice === codice);
/** Il PR/…/012 dei dati di esempio (nei primi giorni di gennaio il suo anno e' quello prima). */
const dodici = async () => (await manuel('preventivi')).preventivi.find(p => /\/012$/.test(p.numero)).numero;

/** Un preventivo completo (niente da dire per la legge), con una facoltativa e due alternative. */
async function nuovoCompleto(extra) {
  const r = await manuel('salvaPreventivo', { preventivo: Object.assign({
    idCliente: 'C002', oggetto: 'Prova ' + Math.random().toString(36).slice(2, 7), complessita: 'media', oneriPrevisti: 'Nessuno',
    sezioni: [
      { titolo: 'Progetto', voci: [{ descrizione: 'Progetto', modo: 'corpo', quantita: 1, prezzo: 1000 }] },
      { titolo: 'Cantiere', voci: [
        { descrizione: 'Direzione lavori', modo: 'ore', quantita: 10, prezzo: 40 },
        { descrizione: 'DiRi', prezzo: 300, facoltativa: true },
        { descrizione: 'Collaudo A', prezzo: 200, alternativa: 'collaudo' },
        { descrizione: 'Collaudo B', prezzo: 500, alternativa: 'collaudo' }] }],
    scadenzePagamento: [{ tipo: 'percentuale', valore: 30, quando: 'firma' }, { tipo: 'percentuale', valore: 70, quando: 'fine' }],
  }, extra || {}) });
  assert.equal(r.ok, true, r.errore);
  return r.preventivo;
}
const voceDi = (p, descrizione) => [].concat(...p.sezioni.map(x => x.voci)).find(v => v.descrizione === descrizione);

// ------------------------------------------------------------------ i conti

test('conti del preventivo: tutti i casi di casi-preventivo.json, al centesimo', () => {
  assert.ok(CASI.length >= 10, 'almeno 10 casi');
  for (const caso of CASI) {
    const r = C.contiPreventivo(caso.preventivo);
    for (const k of Object.keys(caso.atteso)) assert.deepEqual(r[k], caso.atteso[k], caso.nome + ' · ' + k);
  }
});

test('conti del preventivo: il server usa gli stessi conti (il PR/012 del prototipo)', async () => {
  // Dalla fase 4 il PR/012 rev. 1 dei dati di esempio e' accettato con la DiRi (e' il contratto di 26ST003): si
  // prova una sua copia con le scelte di quando era stato mandato (DiRi non scelta), i numeri del caso condiviso.
  const copia = (await manuel('duplicaPreventivo', { id: await dodici() })).preventivo;
  s.wisper.db.esegui("UPDATE preventivo_voci SET scelta = 0 WHERE preventivo_id = ? AND descrizione = 'Dichiarazione di rispondenza'", copia.id);
  const p = (await manuel('preventivo', { id: copia.id })).preventivo;
  const caso = CASI.find(c => c.nome.startsWith('PR/2026/012')).atteso;
  for (const k of ['sommaVoci', 'imponibile', 'contributo', 'baseIva', 'iva', 'totale', 'oreVoci']) assert.equal(p.conti[k], caso[k], k);
  assert.deepEqual(p.sezioni.map(x => x.subtotale), caso.sezioni);
  assert.deepEqual(p.scadenzePagamento.map(x => x.importo), caso.scadenze);
  assert.equal(voceDi(p, 'Dichiarazione di rispondenza').conta, false, 'la facoltativa non scelta non conta');
  assert.equal(voceDi(p, 'Collaudo con laboratorio esterno').conta, false, 'l\'alternativa non scelta non conta');
  assert.equal(p.totale, 4291.35);
  assert.deepEqual(p.mancano, []);
});

// ------------------------------------------------------------------ migrazione

test('migrazione 002 su un database della fase 1: copia prima-2, file e dati conservati, tipi di file nuovi', () => {
  const { Database } = require('../src/db');
  const dati = cartellaNuova('002');
  const cartella = path.join(dati, 'migrazioni');
  fs.mkdirSync(cartella);
  fs.copyFileSync(path.join(__dirname, '..', 'src', 'migrazioni', '001-base.sql'), path.join(cartella, '001-base.sql'));
  const file = path.join(dati, 'wisper.db');
  let db = new Database(file);
  db.migra(cartella);
  db.esegui("INSERT INTO rapportini (id, stato) VALUES ('RAP/2026/0001', 'BOZZA')");
  db.esegui("INSERT INTO file (id, tipo, rapportino_id, creato) VALUES ('f1', 'spesa', 'RAP/2026/0001', '2026-10-21T10:00:00+02:00')");
  db.esegui("INSERT INTO impostazioni (chiave, valore) VALUES ('IVA', '21')");
  fs.copyFileSync(path.join(__dirname, '..', 'src', 'migrazioni', '002-preventivi-attivita.sql'), path.join(cartella, '002-preventivi-attivita.sql'));
  assert.equal(db.migra(cartella), 1);
  assert.equal(db.versione(), 2);
  assert.ok(fs.existsSync(file + '.prima-2'), 'la copia prima della migrazione');
  assert.deepEqual({ ...db.riga("SELECT id, tipo, rapportino_id FROM file WHERE id = 'f1'") }, { id: 'f1', tipo: 'spesa', rapportino_id: 'RAP/2026/0001' });
  assert.equal(db.riga("SELECT valore FROM impostazioni WHERE chiave = 'IVA'").valore, '21', 'un valore gia\' scritto non si tocca');
  assert.equal(db.riga("SELECT valore FROM impostazioni WHERE chiave = 'EPPI_INTEGRATIVO'").valore, '5');
  db.esegui("INSERT INTO file (id, tipo, attivita_id, creato) VALUES ('f2', 'attivita', 1, 'x')");
  db.esegui("INSERT INTO file (id, tipo, preventivo_id, creato) VALUES ('f3', 'preventivo', 1, 'x')");
  assert.throws(() => db.esegui("INSERT INTO file (id, tipo, creato) VALUES ('f4', 'boh', 'x')"), /CHECK/);
  assert.equal(db.riga("SELECT formato FROM numerazioni WHERE tipo = 'preventivo'").formato, 'PR/{AAAA}/{NNN}');
  assert.equal(db.riga('SELECT COUNT(*) n FROM listino WHERE prezzo IS NULL').n, 8);
  db.chiudi();
  db = new Database(file + '.prima-2');
  assert.equal(db.versione(), 1, 'la copia e\' com\'era prima');
  db.chiudi();
});

// ------------------------------------------------------------------ listino

test('listino: si parte con le prestazioni tipiche senza prezzi; il prezzo lo scrive chi vede i costi', async () => {
  const dati = cartellaNuova('listino');
  const vuoto = new Wisper({ dati, memoria: true });
  const l = vuoto.leggiListino();
  assert.deepEqual(l.map(v => v.nome), ['Sopralluogo e rilievo', 'Progetto preliminare', 'Progetto esecutivo', 'Direzione lavori',
    'Dichiarazione di rispondenza (DiRi)', 'Verifiche periodiche', 'Collaudo', 'Ore di consulenza']);
  assert.ok(l.every(v => v.prezzo === null), 'nessun prezzo: li scrive Manuel');
  assert.equal(l.find(v => v.codice === 'CON').modo, 'ore');
  assert.equal(vuoto.leggiImpostazioni().IVA, 22);
  assert.equal(vuoto.leggiImpostazioni().EPPI_INTEGRATIVO, 5);
  assert.equal(vuoto.leggiImpostazioni().PREVENTIVO_VALIDITA_GIORNI, 30);
  vuoto.chiudi();

  const nuova = await manuel('salvaVoceListino', { voce: { codice: 'FV', nome: 'Pratica fotovoltaico', modo: 'corpo', prezzo: 250 } });
  assert.equal(nuova.ok, true, nuova.errore);
  assert.equal(nuova.voce.prezzo, 250);
  assert.equal((await manuel('salvaVoceListino', { voce: { nome: '' } })).errore, 'Descrizione: scrivi la descrizione del servizio');
  assert.equal((await manuel('salvaVoceListino', { voce: { nome: 'X', modo: 'boh' } })).errore, 'Modo: corpo, ore o quantita');
  assert.equal((await manuel('archiviaVoceListino', { id: nuova.voce.id })).voce.attivo, false);
  assert.equal((await manuel('listino')).listino.some(v => v.id === nuova.voce.id), false, 'archiviata non si propone');
  assert.equal((await manuel('listino', { tutte: true })).listino.some(v => v.id === nuova.voce.id), true);
  assert.equal((await manuel('archiviaVoceListino', { id: nuova.voce.id, archiviata: false })).voce.attivo, true);
});

// ------------------------------------------------------------------ salvare

test('salvaPreventivo: numero nuovo, EPPI e IVA congelati, scadenza, voci dal listino, alternative normalizzate', async () => {
  const prossimo = (await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'preventivo').prossimo;
  const sop = await listino('SOP');
  const dl = await listino('DL');
  const r = await manuel('salvaPreventivo', { preventivo: {
    idCliente: 'C001', oggetto: 'Quadro nuovo', sezioni: [{ titolo: 'Tutto', voci: [
      { idListino: sop.id },
      { idListino: dl.id, quantita: 8 },
      { descrizione: 'A', prezzo: 10, alternativa: 'gruppo' },
      { descrizione: 'B', prezzo: 20, alternativa: 'Gruppo', scelta: true },
      { descrizione: 'C', prezzo: 30, alternativa: 'gruppo', scelta: true }] }],
  } });
  assert.equal(r.ok, true, r.errore);
  const p = r.preventivo;
  assert.equal(p.numero, prossimo);
  assert.match(p.numero, new RegExp('^PR/' + ANNO + '/\\d{3}$'));
  assert.equal(p.revisione, 0);
  assert.equal(p.stato, 'BOZZA');
  assert.equal(p.modificabile, true);
  assert.equal(p.data, oggi());
  assert.equal(p.scadenza, piuGiorni(oggi(), 30), 'scadenza = data + PREVENTIVO_VALIDITA_GIORNI');
  assert.equal(p.eppiPercentuale, 5);
  assert.equal(p.ivaPercentuale, 22);
  assert.match(p.condizioni, /compenso/, 'le condizioni predefinite');
  const voci = p.sezioni[0].voci;
  assert.equal(voci[0].descrizione, 'Sopralluogo e rilievo', 'dal listino: nome');
  assert.equal(voci[0].prezzo, 350, 'dal listino: prezzo');
  assert.equal(voci[1].modo, 'ore');
  assert.equal(voci[1].importo, 360);
  assert.deepEqual(voci.slice(2).map(v => v.scelta), [false, true, false], 'di un gruppo resta scelta solo la prima scelta');
  assert.equal(p.conti.sommaVoci, 350 + 360 + 20);
  assert.deepEqual(p.mancano.map(m => m.campo), ['complessita', 'oneri']);
  // Cambiare l'IVA non tocca i preventivi che ci sono: vale per i nuovi.
  await manuel('salvaImpostazioni', { valori: { IVA: 10 } });
  assert.equal((await manuel('preventivo', { id: p.id })).preventivo.ivaPercentuale, 22);
  const dopo = await manuel('salvaPreventivo', { preventivo: { idCliente: 'C001', oggetto: 'Con l\'IVA nuova' } });
  assert.equal(dopo.preventivo.ivaPercentuale, 10);
  await manuel('salvaImpostazioni', { valori: { IVA: 22 } });
  // Togliere una voce e cambiare l'ordine.
  const cambia = await manuel('salvaPreventivo', { preventivo: { id: p.id, sezioni: [{ id: p.sezioni[0].id, titolo: 'Tutto', voci: [
    { id: voci[1].id }, { id: voci[0].id }] }] } });
  assert.deepEqual(cambia.preventivo.sezioni[0].voci.map(v => v.descrizione), ['Direzione lavori', 'Sopralluogo e rilievo']);
  assert.equal(cambia.preventivo.conti.sommaVoci, 710);
});

test('salvaPreventivo: gli errori dicono il campo', async () => {
  const no = async (p, frase) => assert.equal((await manuel('salvaPreventivo', { preventivo: p })).errore, frase);
  await no({ oggetto: 'X' }, 'Cliente: scegli il cliente');
  await no({ idCliente: 'C002' }, 'Oggetto: scrivi di cosa si tratta');
  await no({ idCliente: 'C999', oggetto: 'X' }, 'Cliente C999 non trovato');
  await no({ idCliente: 'C002', oggetto: 'X', complessita: 'enorme' }, 'Complessità: bassa, media o alta');
  await no({ idCliente: 'C002', oggetto: 'X', sezioni: [{ titolo: 'A', voci: [{ prezzo: 1 }] }] }, 'Voce: scrivi la descrizione');
  await no({ idCliente: 'C002', oggetto: 'X', sezioni: [{ titolo: 'A', voci: [{ descrizione: 'x', modo: 'a peso' }] }] }, 'Modo: corpo, ore o quantita');
  await no({ idCliente: 'C002', oggetto: 'X', sezioni: [{ titolo: 'A', voci: [{ descrizione: 'x', quantita: -1 }] }] }, 'Quantità: non può essere negativa');
  await no({ idCliente: 'C002', oggetto: 'X', scontoPercentuale: 120 }, 'Sconto: da 0 a 100');
  await no({ idCliente: 'C002', oggetto: 'X', scontoEuro: 50, sezioni: [{ titolo: 'A', voci: [{ descrizione: 'x', prezzo: 10 }] }] }, 'Sconto: è più grande del totale delle voci');
  await no({ idCliente: 'C002', oggetto: 'X', data: '2026-10-20', scadenza: '2026-10-10' }, 'Scadenza: deve venire dopo la data del preventivo');
  await no({ idCliente: 'C002', oggetto: 'X', idSede: 1 }, 'La sede 1 non è di questo cliente');
});

// ------------------------------------------------------------------ revisioni e blocco

test('revisioni: dopo la bozza i prezzi non cambiano, la revisione tiene il numero e la vecchia diventa SOSTITUITO', async () => {
  const p = await nuovoCompleto();
  const inv = await manuel('segnaInviato', { id: p.id });
  assert.equal(inv.ok, true, inv.errore);
  assert.equal(inv.preventivo.stato, 'INVIATO');
  assert.ok(inv.preventivo.inviatoIl);
  assert.equal(inv.preventivo.modificabile, false);
  const bloccato = await manuel('salvaPreventivo', { preventivo: { id: p.id, oggetto: 'Cambiato' } });
  assert.equal(bloccato.errore, 'Il preventivo ' + p.numero + ' è già stato inviato: per cambiarlo fai una nuova revisione');
  assert.equal((await manuel('nuovaRevisione', { id: (await nuovoCompleto()).id })).errore, 'È ancora in bozza: cambiala direttamente');

  const rev = await manuel('nuovaRevisione', { id: p.id });
  assert.equal(rev.ok, true, rev.errore);
  assert.equal(rev.preventivo.numero, p.numero, 'stesso numero');
  assert.equal(rev.preventivo.revisione, 1);
  assert.equal(rev.preventivo.etichetta, p.numero + ' rev. 1');
  assert.equal(rev.preventivo.stato, 'BOZZA');
  assert.equal(rev.preventivo.totale, p.totale, 'stessi contenuti');
  assert.deepEqual(rev.preventivo.revisioni.map(x => [x.revisione, x.stato]), [[0, 'SOSTITUITO'], [1, 'BOZZA']]);
  const vecchio = (await manuel('preventivo', { id: p.id })).preventivo;
  assert.equal(vecchio.stato, 'SOSTITUITO', 'la vecchia resta da consultare');
  assert.equal(vecchio.sezioni.length, 2);
  assert.match((await manuel('salvaPreventivo', { preventivo: { id: p.id, oggetto: 'X' } })).errore, /sostituito/);
  assert.match((await manuel('nuovaRevisione', { id: p.id })).errore, /sostituito/);
  // La revisione si cambia (e' una bozza); per numero si trova l'ultima.
  const cambiata = await manuel('salvaPreventivo', { preventivo: { id: rev.preventivo.id, scontoEuro: 100 } });
  assert.equal(cambiata.preventivo.conti.scontoEuro, 100);
  assert.equal((await manuel('preventivo', { id: p.numero })).preventivo.id, rev.preventivo.id);
  // L'elenco mostra l'ultima; le vecchie solo se chieste.
  const elenco = (await manuel('preventivi')).preventivi.filter(x => x.numero === p.numero);
  assert.deepEqual(elenco.map(x => x.revisione), [1]);
  const tutte = (await manuel('preventivi', { sostituiti: true })).preventivi.filter(x => x.numero === p.numero);
  assert.deepEqual(tutte.map(x => x.revisione).sort(), [0, 1]);
});

test('scaduto: non si salva, e\' un inviato con la scadenza passata', async () => {
  const sette = (await manuel('preventivi', { stato: 'SCADUTO' })).preventivi;
  const p = sette.find(x => /\/007$/.test(x.numero));
  assert.ok(p, 'il PR/007 dei dati di esempio');
  assert.equal(p.stato, 'INVIATO', 'salvato: inviato');
  assert.equal(p.statoVisto, 'SCADUTO');
  assert.equal(p.scaduto, true);
  assert.ok(p.giorniAllaScadenza < 0);
  assert.equal((await manuel('preventivi', { stato: 'INVIATO' })).preventivi.some(x => x.id === p.id), false, 'tra gli inviati no');
  assert.equal(s.wisper.db.riga('SELECT stato FROM preventivi WHERE id = ?', p.id).stato, 'INVIATO');
  // Una bozza con la scadenza passata non si invia.
  const b = await nuovoCompleto({ data: '2026-01-01', scadenza: '2026-01-31' });
  assert.equal((await manuel('segnaInviato', { id: b.id })).errore, 'La scadenza è già passata: cambiala prima di inviarlo');
});

// ------------------------------------------------------------------ invio

test('invio: prima dice cosa manca per la legge, con conferma si manda; l\'email porta il PDF', async () => {
  const b = await manuel('salvaPreventivo', { preventivo: { idCliente: 'C002', oggetto: 'Senza complessita', sezioni: [{ titolo: 'A', voci: [{ descrizione: 'x', prezzo: 100 }] }] } });
  const r = await manuel('segnaInviato', { id: b.preventivo.id });
  assert.equal(r.ok, false);
  assert.equal(r.serveConferma, true);
  assert.equal(r.errore, 'Prima di inviarlo manca: il grado di complessità, gli oneri ipotizzabili');
  assert.deepEqual(r.mancano.map(m => m.campo), ['complessita', 'oneri']);
  assert.equal((await manuel('preventivo', { id: b.preventivo.id })).preventivo.stato, 'BOZZA', 'non e\' partito niente');
  assert.equal((await manuel('segnaInviato', { id: b.preventivo.id, conferma: true })).preventivo.stato, 'INVIATO');

  const p = await nuovoCompleto();
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  const e = await manuel('inviaPreventivo', { id: p.id, a: 'rossi@example.com', messaggio: 'In allegato il preventivo.', allegati: [{ nome: p.numero.replace(/\//g, '-') + '.pdf', mime: 'application/pdf', base64: pdf }] });
  assert.equal(e.ok, true, e.errore);
  assert.equal(e.preventivo.stato, 'INVIATO');
  const cartella = path.join(s.dati, 'posta-finta', 'email');
  const ultima = fs.readdirSync(cartella).sort().pop();
  const testo = fs.readFileSync(path.join(cartella, ultima, 'email.txt'), 'utf8');
  assert.match(testo, /A: rossi@example.com/);
  assert.match(testo, new RegExp('Oggetto: Preventivo ' + p.numero.replace(/\//g, '\\/')));
  assert.ok(fs.existsSync(path.join(cartella, ultima, p.numero.replace(/\//g, '-') + '.pdf')), 'il PDF allegato');
  assert.equal((await manuel('inviaPreventivo', { id: p.id, a: '' })).errore, 'Manca l\'indirizzo del cliente');
  const modello = (await manuel('preventivi', { stato: 'MODELLO' })).preventivi[0];
  assert.equal((await manuel('segnaInviato', { id: modello.id })).errore, 'È un modello: prima fai un preventivo da questo modello');
  assert.equal((await manuel('inviaPreventivo', { id: p.id, a: 'x@example.com' })).ok, true, 'rimandarlo si puo\'');
  assert.equal((await manuel.leggi({ azione: 'inviaPreventivo', id: p.id })).errore, 'Questa azione vuole una POST');
});

// ------------------------------------------------------------------ accettazione

test('accettazione: con le scelte del cliente e la firma; i conti si rifanno; ripetuta uguale va bene', async () => {
  const p = await nuovoCompleto();
  assert.equal((await manuel('accettaPreventivo', { id: p.id, modo: 'email', nome: 'X' })).errore, 'Il preventivo ' + p.numero + ' non è ancora stato inviato');
  await manuel('segnaInviato', { id: p.id });
  const diri = voceDi(p, 'DiRi');
  const a = voceDi(p, 'Collaudo A');
  const b = voceDi(p, 'Collaudo B');
  assert.equal(p.conti.sommaVoci, 1000 + 400 + 200, 'prima: la facoltativa no, la prima alternativa si');
  const no = async (d, frase) => assert.equal((await manuel('accettaPreventivo', Object.assign({ id: p.id }, d))).errore, frase);
  await no({ modo: 'firma', nome: 'Paolo Rossi' }, 'Per la firma serve il tratto del cliente');
  await no({ modo: 'piccione', nome: 'Paolo Rossi' }, 'Come ha accettato? firma, email, documento o voce');
  await no({ modo: 'email', nome: '' }, 'Nome: scrivi chi ha accettato');
  await no({ modo: 'email', nome: 'Paolo Rossi', scelte: { [a.id]: true, [b.id]: true } }, 'Di «collaudo» se ne sceglie una sola');
  const firma = { base64: PNG.toString('base64'), mime: 'image/png', idFile: 'firma-prev-1' };
  const ok = await manuel('accettaPreventivo', { id: p.id, modo: 'firma', nome: 'Paolo Rossi', firma, scelte: { [diri.id]: true, [a.id]: false, [b.id]: true } });
  assert.equal(ok.ok, true, ok.errore);
  const acc = ok.preventivo;
  assert.equal(acc.stato, 'ACCETTATO');
  assert.equal(acc.accettatoDa, 'Paolo Rossi');
  assert.equal(acc.accettazioneModo, 'firma');
  assert.ok(acc.accettatoIl);
  assert.equal(voceDi(acc, 'DiRi').scelta, true);
  assert.equal(voceDi(acc, 'Collaudo B').conta, true);
  assert.equal(voceDi(acc, 'Collaudo A').conta, false);
  assert.equal(acc.conti.sommaVoci, 1000 + 400 + 300 + 500, 'con le scelte del cliente');
  assert.deepEqual(acc.scadenzePagamento.map(x => x.importo), [660, 1540], 'le scadenze sui conti nuovi');
  assert.ok(acc.firma && acc.firma.url === '/file/' + acc.firma.id);
  assert.equal((await manuel.file(acc.firma.id)).status, 200);
  assert.equal((await marco.file(acc.firma.id)).status, 403, 'il collaboratore non vede i preventivi');
  assert.equal(s.wisper.db.riga('SELECT tipo, preventivo_id FROM file WHERE id = ?', acc.firma.id).tipo, 'preventivo');
  // La coda del telefono ripete: stessa risposta, niente di nuovo.
  const file = s.wisper.db.riga('SELECT COUNT(*) n FROM file').n;
  const ancora = await manuel('accettaPreventivo', { id: p.id, modo: 'firma', nome: 'Paolo Rossi', firma });
  assert.equal(ancora.ok, true);
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM file').n, file);
  assert.equal((await manuel('accettaPreventivo', { id: p.id, modo: 'voce', nome: 'Altro' })).errore, 'Il preventivo ' + p.numero + ' è già accettato');
  assert.equal((await manuel('nuovaRevisione', { id: p.id })).errore, 'È già accettato: non si fanno revisioni');
  assert.match((await manuel('salvaPreventivo', { preventivo: { id: p.id, oggetto: 'x' } })).errore, /già accettato/);
});

test('rifiuto e riapertura: il rifiutato torna come revisione nuova in bozza', async () => {
  const p = await nuovoCompleto();
  assert.equal((await manuel('rifiutaPreventivo', { id: p.id })).errore, 'Il preventivo ' + p.numero + ' non è ancora stato inviato');
  await manuel('segnaInviato', { id: p.id });
  const r = await manuel('rifiutaPreventivo', { id: p.id, motivo: 'Troppo caro' });
  assert.equal(r.preventivo.stato, 'RIFIUTATO');
  assert.equal(r.preventivo.motivoRifiuto, 'Troppo caro');
  assert.ok(r.preventivo.rifiutatoIl);
  assert.equal((await manuel('riapriPreventivo', { id: (await nuovoCompleto()).id })).errore, 'Si riapre solo un preventivo rifiutato');
  const riaperto = await manuel('riapriPreventivo', { id: p.id });
  assert.equal(riaperto.preventivo.stato, 'BOZZA');
  assert.equal(riaperto.preventivo.revisione, 1);
  assert.equal(riaperto.preventivo.numero, p.numero);
  const vecchio = (await manuel('preventivo', { id: p.id })).preventivo;
  assert.equal(vecchio.stato, 'SOSTITUITO');
  assert.equal(vecchio.motivoRifiuto, 'Troppo caro', 'il motivo resta');
});

// ------------------------------------------------------------------ commessa dal preventivo

test('creaCommessaDaPreventivo: una volta sola, con prestazioni, importo, ore, prezzo e scadenze giuste', async () => {
  const p = await nuovoCompleto({ idSede: s.wisper.leggiSedi().find(x => x.idSoggetto === 'C002').id, scontoPercentuale: 10 });
  assert.equal((await manuel('creaCommessaDaPreventivo', { id: p.id })).errore, 'Il preventivo ' + p.numero + ' non è accettato');
  await manuel('segnaInviato', { id: p.id });
  await manuel('accettaPreventivo', { id: p.id, modo: 'documento', nome: 'Paolo Rossi', scelte: { [voceDi(p, 'DiRi').id]: true } });
  const prossimo = (await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'commessa').prossimo;
  const r = await manuel('creaCommessaDaPreventivo', { id: p.id });
  assert.equal(r.ok, true, r.errore);
  const m = r.commessa;
  // Voci che contano: 1000 + 400 (10 ore a 40) + 300 (DiRi scelta) + 200 (Collaudo A) = 1900; sconto 10% = 190; imponibile 1710.
  assert.equal(m.id, prossimo);
  assert.equal(m.idCliente, 'C002');
  assert.equal(m.descrizione, p.oggetto);
  assert.equal(m.importoContratto, 1710);
  assert.equal(m.budgetOre, 10);
  assert.equal(m.prezzoOrario, 40);
  assert.equal(m.sedeId, p.idSede);
  assert.equal(m.responsabileId, 1);
  assert.equal(m.stato, 'APERTA');
  assert.deepEqual(r.prestazioni.map(x => x.nome), ['Progetto', 'Direzione lavori', 'DiRi', 'Collaudo A']);
  assert.deepEqual(r.prestazioni.map(x => x.valore), [900, 360, 270, 180], 'lo sconto diviso in proporzione');
  assert.equal(r.prestazioni.reduce((a, x) => a + x.valore, 0), m.importoContratto, 'la somma e\' l\'importo del contratto');
  assert.ok(r.prestazioni.every(x => x.avanzamento === 0 && x.stato === 'da_fare'));
  assert.equal(r.preventivo.idCommessa, m.id);
  assert.deepEqual(r.preventivo.scadenzePagamento.map(x => [x.idCommessa, x.importo]), [[m.id, 513], [m.id, 1197]]);
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM scadenze_pagamento WHERE commessa_id = ?', m.id).n, 2);
  // Una volta sola.
  const di = await manuel('creaCommessaDaPreventivo', { id: p.id });
  assert.equal(di.errore, 'Il preventivo ' + p.numero + ' è già diventato la commessa ' + m.id);
  assert.equal((await manuel('anagrafiche')).commesse.filter(x => x.descrizione === p.oggetto).length, 1);
  // Piu' prezzi orari diversi: il prezzo orario resta vuoto.
  const due = await nuovoCompleto({ sezioni: [{ titolo: 'Ore', voci: [
    { descrizione: 'Ore A', modo: 'ore', quantita: 2, prezzo: 40 }, { descrizione: 'Ore B', modo: 'ore', quantita: 3, prezzo: 50 }] }], scadenzePagamento: [] });
  await manuel('segnaInviato', { id: due.id });
  await manuel('accettaPreventivo', { id: due.id, modo: 'voce', nome: 'Paolo Rossi' });
  const m2 = (await laura('creaCommessaDaPreventivo', { id: due.id })).commessa;
  assert.equal(m2.budgetOre, 5);
  assert.equal(m2.prezzoOrario, null);
  assert.equal(m2.responsabileId, 2, 'chi la crea');
});

test('duplicare e modelli: un preventivo nasce da un modello col numero nuovo', async () => {
  const modello = (await manuel('preventivi', { stato: 'MODELLO' })).preventivi[0];
  assert.ok(modello, 'il modello dei dati di esempio');
  assert.equal(modello.etichetta, 'Modello');
  assert.equal(modello.numero, '');
  assert.equal((await manuel('preventivi')).preventivi.some(x => x.id === modello.id), false, 'un modello non sta nell\'elenco normale');
  const prossimo = (await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'preventivo').prossimo;
  const nuovo = await manuel('duplicaPreventivo', { id: modello.id, idCliente: 'C001' });
  assert.equal(nuovo.ok, true, nuovo.errore);
  assert.equal(nuovo.preventivo.numero, prossimo);
  assert.equal(nuovo.preventivo.idCliente, 'C001');
  assert.equal(nuovo.preventivo.modello, false);
  assert.equal(nuovo.preventivo.stato, 'BOZZA');
  assert.equal(nuovo.preventivo.sezioni.length, 2);
  assert.equal(nuovo.preventivo.scadenzePagamento.length, 3);
  assert.equal((await manuel('duplicaPreventivo', { id: modello.id })).errore, 'Cliente: scegli il cliente del preventivo nuovo');
  const comeModello = await manuel('duplicaPreventivo', { id: nuovo.preventivo.id, comeModello: true });
  assert.equal(comeModello.preventivo.modello, true);
  assert.equal(comeModello.preventivo.numero, '');
  assert.equal((await manuel('numerazioni')).numerazioni.find(n => n.tipo === 'preventivo').prossimo !== prossimo, true);
});

// ------------------------------------------------------------------ permessi

test('permessi: il collaboratore non vede preventivi, listino ne\' prezzi; lettura vede e non scrive', async () => {
  const p = (await manuel('preventivi')).preventivi[0];
  for (const [azione, dati] of [
    // 1.4.0: il listino (i Servizi) lo vede anche chi fa i rapportini, senza prezzi (servizi.test.js); cambiarlo no.
    ['salvaVoceListino', { voce: { nome: 'X' } }], ['archiviaVoceListino', { id: 1 }], ['preventivi'], ['preventivo', { id: p.id }],
    ['salvaPreventivo', { preventivo: { idCliente: 'C001', oggetto: 'X' } }], ['duplicaPreventivo', { id: p.id }], ['nuovaRevisione', { id: p.id }],
    ['segnaInviato', { id: p.id }], ['inviaPreventivo', { id: p.id, a: 'x@example.com' }], ['accettaPreventivo', { id: p.id, modo: 'voce', nome: 'X' }],
    ['rifiutaPreventivo', { id: p.id }], ['riapriPreventivo', { id: p.id }], ['creaCommessaDaPreventivo', { id: p.id }], ['esporta', { cosa: 'preventivi' }],
  ]) {
    const r = await marco(azione, dati);
    assert.equal(r.permesso, false, 'marco ' + azione + ': ' + JSON.stringify(r));
  }
  const d = await marco('dashboard', { tutto: true });
  assert.equal('preventivi' in d.numeri, false);
  assert.equal([].concat(d.urgenti, d.settimana, d.pianificare).some(v => v.tipo === 'preventivo'), false);

  // Lettura: vede tutto, coi soldi, e non scrive niente.
  const l = await lettura('preventivo', { id: p.id });
  assert.equal(typeof l.preventivo.totale, 'number');
  assert.equal(typeof (await lettura('listino')).listino[0].prezzo, 'number');
  const prima = s.wisper.db.riga('SELECT COUNT(*) n FROM registro').n;
  for (const [azione, dati] of [
    ['salvaVoceListino', { voce: { nome: 'X' } }], ['salvaPreventivo', { preventivo: { idCliente: 'C001', oggetto: 'X' } }], ['duplicaPreventivo', { id: p.id }],
    ['nuovaRevisione', { id: p.id }], ['segnaInviato', { id: p.id }], ['accettaPreventivo', { id: p.id, modo: 'voce', nome: 'X' }],
    ['rifiutaPreventivo', { id: p.id }], ['riapriPreventivo', { id: p.id }], ['creaCommessaDaPreventivo', { id: p.id }], ['inviaPreventivo', { id: p.id, a: 'x@x.it' }],
  ]) {
    const r = await lettura(azione, dati);
    assert.equal(r.permesso, false, 'lettura ' + azione + ': ' + JSON.stringify(r));
  }
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM registro').n, prima, 'niente e\' cambiato');

  // Amministrazione lavora sui preventivi.
  const lav = await laura('salvaPreventivo', { preventivo: { idCliente: 'C001', oggetto: 'Di Laura' } });
  assert.equal(lav.ok, true, lav.errore);
});

test('senza costi: niente prezzi, importi, sconti, totali ne\' conti, a qualunque profondita\'', async () => {
  await manuel('salvaPermessi', { permessi: { lettura: { costi: 0 } } });
  try {
    const p = (await lettura('preventivo', { id: await dodici() })).preventivo;
    assert.deepEqual(soldiIn(p), []);
    assert.equal('conti' in p, false);
    assert.equal(p.sezioni[0].voci[0].descrizione, 'Sopralluogo e rilievo', 'le descrizioni si');
    assert.equal(p.sezioni[0].voci[0].conta, true);
    assert.equal(p.senzaPrezzo, 0);
    assert.equal(/4291|3517|773\.85|1900/.test(JSON.stringify(p)), false, 'i numeri dei soldi non escono sotto altri nomi');
    assert.deepEqual(soldiIn(await lettura('preventivi')), []);
    assert.deepEqual(soldiIn(await lettura('listino')), []);
    assert.deepEqual(soldiIn(await lettura('dashboard', { tutto: true })), []);
    const csv = Buffer.from((await lettura('esporta', { cosa: 'preventivi' })).base64, 'base64').toString('utf8');
    assert.equal(csv.includes('Totale'), false);
    assert.equal(csv.includes('Imponibile'), false);
    // Anche nel registro (lettura non vede il registro: si prova con chi lo vede, senza costi).
    await manuel('salvaPermessi', { permessi: { amministrazione: { costi: 0 } } });
    const reg = await laura('registro', { tabella: 'preventivo_voci' });
    assert.ok(reg.righe.length > 0);
    assert.equal(JSON.stringify(reg).includes('"prezzo"'), false);
    // Chi non vede i costi e salva una bozza lascia i prezzi che c'erano.
    const b = await nuovoCompleto();
    const salvato = await laura('salvaPreventivo', { preventivo: { id: b.id, sezioni: b.sezioni.map(x => ({ id: x.id, titolo: x.titolo + '!', voci: x.voci.map(v => ({ id: v.id, prezzo: 1 })) })) } });
    assert.equal(salvato.ok, true, salvato.errore);
    assert.equal((await manuel('preventivo', { id: b.id })).preventivo.totale, b.totale, 'i prezzi sono rimasti');
  } finally {
    await manuel('salvaPermessi', { permessi: { lettura: { costi: 1 }, amministrazione: { costi: 2 } } });
  }
});

// ------------------------------------------------------------------ registro, dashboard, esportazione

test('registro: ogni modifica dei preventivi ha chi, prima e dopo; le voci tolte restano scritte', async () => {
  const p = await nuovoCompleto();
  await manuel('salvaPreventivo', { preventivo: { id: p.id, oggetto: 'Oggetto cambiato' } });
  const reg = await manuel('registro', { tabella: 'preventivi', idRiga: String(p.id) });
  assert.equal(reg.righe[0].azione, 'salvaPreventivo');
  assert.deepEqual(reg.righe[0].prima, { oggetto: p.oggetto });
  assert.deepEqual(reg.righe[0].dopo, { oggetto: 'Oggetto cambiato' });
  assert.equal(reg.righe[reg.righe.length - 1].prima, null, 'la creazione');
  const tolta = voceDi(p, 'Collaudo B');
  await manuel('salvaPreventivo', { preventivo: { id: p.id, sezioni: p.sezioni.map(x => ({ id: x.id, voci: x.voci.filter(v => v.id !== tolta.id).map(v => ({ id: v.id })) })) } });
  const r = await manuel('registro', { tabella: 'preventivo_voci', idRiga: String(tolta.id) });
  assert.equal(r.righe[0].nota, 'tolta');
  assert.equal(r.righe[0].dopo, null);
  assert.equal(r.righe[0].prima.descrizione, 'Collaudo B');
  await manuel('segnaInviato', { id: p.id });
  const stato = await manuel('registro', { tabella: 'preventivi', idRiga: String(p.id) });
  assert.equal(stato.righe[0].dopo.stato, 'INVIATO');
});

test('dashboard: preventivi in scadenza, senza risposta, bozze; i numeri dei preventivi', async () => {
  const d = await manuel('dashboard', { tutto: true });
  const voci = [].concat(d.urgenti, d.settimana, d.pianificare);
  // Dalla fase 4 il PR/012 e' accettato: un preventivo mandato che scade fra 6 giorni lo fa la prova.
  const inScadenza = await nuovoCompleto();
  await manuel('salvaPreventivo', { preventivo: { id: inScadenza.id, scadenza: piuGiorni(oggi(), 6) } });
  await manuel('segnaInviato', { id: inScadenza.id });
  const conScadenza = await manuel('dashboard', { tutto: true });
  const scade = conScadenza.settimana.find(v => v.collegamento.id === inScadenza.id && / scade fra 6 giorni$/.test(v.titolo));
  assert.ok(scade, 'il preventivo scade fra 6 giorni');
  assert.equal(scade.collegamento.pagina, 'preventivo');
  assert.equal(scade.quanto, (await manuel('preventivo', { id: inScadenza.id })).preventivo.totale);
  assert.equal(scade.unita, 'euro');
  const muto = d.urgenti.find(v => /\/007: nessuna risposta da \d+ giorni$/.test(v.titolo));
  assert.ok(muto, 'il PR/007 senza risposta');
  assert.match(muto.dettaglio, /scaduto il/);
  assert.ok(voci.some(v => v.collegamento.pagina === 'preventivi' && v.collegamento.filtro.stato === 'BOZZA'));
  assert.ok(d.numeri.preventivi.bozze >= 1);
  assert.ok(d.numeri.preventivi.scaduti >= 1);
  assert.ok(conScadenza.numeri.preventivi.inScadenza >= 1);
  assert.equal(typeof d.numeri.soldi.preventiviInAttesa, 'number');
  // Un accettato senza commessa si fa vedere.
  const p = await nuovoCompleto();
  await manuel('segnaInviato', { id: p.id });
  await manuel('accettaPreventivo', { id: p.id, modo: 'voce', nome: 'Paolo Rossi' });
  const dopo = await manuel('dashboard', { tutto: true });
  assert.ok(dopo.settimana.some(v => v.collegamento.id === p.id && /manca la commessa/.test(v.titolo)));
});

test('esporta preventivi: CSV con lo stato a parole e le colonne dei soldi', async () => {
  const r = await manuel('esporta', { cosa: 'preventivi' });
  assert.equal(r.ok, true, r.errore);
  const csv = Buffer.from(r.base64, 'base64').toString('utf8');
  const righe = csv.slice(1).trim().split('\r\n');
  const testa = righe[0].split(';');
  assert.deepEqual(testa.slice(0, 5), ['Numero', 'Revisione', 'Data', 'Scadenza', 'Stato']);
  // Dalla fase 4 il PR/012 rev. 1 e' accettato con la DiRi: 3.800 + 190 di contributo + IVA = 4.867,80.
  const dodici = righe.find(x => /^PR\/\d{4}\/012;1;/.test(x)).split(';');
  assert.equal(dodici[testa.indexOf('Totale')], '4867,8');
  assert.equal(dodici[testa.indexOf('Contributo integrativo')], '190');
  assert.equal(dodici[testa.indexOf('Stato')], 'Accettato');
  assert.ok(righe.some(x => x.includes(';Scaduto;')));
});
