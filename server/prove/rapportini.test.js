// Le regole dei dati, come le prove di Code.gs: salvataggi, ripetizioni, stati, firme, file,
// commesse 26ST, clienti doppi, partite IVA. Contro un server vero, in HTTP, coi dati di esempio.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serverDiProva, PNG } = require('./aiuto');

// Il finto Google con lo script vero: le sue risposte sono il riferimento.
process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const finto = require('../../apps-script/prove/finto-google.js');
const delloScript = p => JSON.parse(finto.contesto.doGet({ parameter: Object.assign({ codice: 'prova' }, p) }).testo);

let s;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

const base64 = PNG.toString('base64');
let n = 0;
const nuovo = dati => manuel('salvaRapportino', { rapportino: Object.assign({ idLocale: 'prova-' + (++n), data: '2026-10-20', tecnico: 'Manuel Gasparotto' }, dati) });

// ------------------------------------------------------------------ gli stessi dati dello script

test('i dati di esempio: stessi clienti, commesse e conti di semina() sullo script', async () => {
  const mio = await manuel('anagrafiche');
  const suo = delloScript({});
  // Indirizzo e partita IVA no: dalla fase 4 i dati di esempio del server hanno quelli di fatturazione di Elettrodinamica e Rossi.
  const campiCliente = ['id', 'nome', 'alias', 'gruppo', 'email', 'telefono', 'tariffaFissa', 'costoFisso', 'ultimaTariffa', 'pagaViaggio', 'kmRimborsati', 'maggExtra', 'note', 'accorpatoIn'];
  const solo = (o, campi) => Object.fromEntries(campi.map(k => [k, o[k]]));
  for (const c of suo.clienti) assert.deepEqual(solo(mio.clienti.find(x => x.id === c.id), campiCliente), solo(c, campiCliente), c.nome);
  const campiCommessa = ['id', 'idCliente', 'descrizione', 'stato', 'indirizzo', 'budgetOre', 'budgetEuro', 'prezzoOrario', 'costoOrario', 'euroKm', 'inizio', 'finePrevista', 'codicePrecedente', 'note'];
  for (const m of suo.commesse) assert.deepEqual(solo(mio.commesse.find(x => x.id === m.id), campiCommessa), solo(m, campiCommessa), m.id);
  for (const k of Object.keys(suo.impostazioni)) assert.deepEqual(mio.impostazioni[k], suo.impostazioni[k], k);

  const miei = (await manuel('rapportini', { tutti: true })).rapportini;
  const suoi = delloScript({ azione: 'rapportini', tutti: '1' }).rapportini;
  // idLocale no: nel finto Google il contatore e' lo stesso degli id dei file.
  const campi = ['id', 'data', 'tecnico', 'idCliente', 'cliente', 'gruppo', 'idCommessa', 'commessa', 'descrizione', 'oreLavoro', 'oreExtra',
    'oreViaggio', 'oreTotali', 'km', 'spese', 'noteSpese', 'foto', 'tariffa', 'pagaViaggio', 'kmRimborsati', 'euroKm', 'maggExtra', 'compensoOre', 'rimborsoKm',
    'totale', 'costoOrario', 'firma', 'stato'];
  assert.equal(suoi.length, 4);
  for (const r of suoi) assert.deepEqual(solo(miei.find(x => x.id === r.id), campi), solo(r, campi), r.id);
  assert.equal(miei.length, 13, 'piu\' i due di Marco e i sette della fase 4');
});

// ------------------------------------------------------------------ salvataggi

test('lo stesso idLocale due volte: una riga sola, aggiornata', async () => {
  const a = await nuovo({ idLocale: 'ripetuto-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 2 });
  assert.equal(a.ok, true, a.errore);
  const prima = (await manuel('rapportini', { tutti: true })).rapportini.length;
  const b = await nuovo({ idLocale: 'ripetuto-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 3 });
  assert.equal(b.rapportino.id, a.rapportino.id);
  assert.equal(b.rapportino.oreLavoro, 3);
  assert.equal((await manuel('rapportini', { tutti: true })).rapportini.length, prima);
});

test('manca l\'identificativo, manca il cliente, data non valida', async () => {
  assert.equal((await manuel('salvaRapportino', { rapportino: { cliente: 'Rossi Impianti Srl' } })).errore, 'Manca l\'identificativo del rapportino');
  assert.equal((await nuovo({ oreLavoro: 1 })).errore, 'Manca il cliente');
  assert.equal((await nuovo({ cliente: 'Rossi Impianti Srl', tariffa: 40, data: 'ieri' })).errore, 'Data non valida: ieri');
});

test('prima i controlli, poi le creazioni: un rapportino rifiutato non lascia il cliente nuovo', async () => {
  const r = await nuovo({ cliente: 'Cliente Senza Tariffa Spa', commessa: 'Lavoro nuovo', oreLavoro: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'Manca la tariffa oraria per Cliente Senza Tariffa Spa');
  const a = await manuel('anagrafiche');
  assert.equal(a.clienti.some(c => c.nome === 'Cliente Senza Tariffa Spa'), false);
  assert.equal(a.commesse.some(m => m.descrizione === 'Lavoro nuovo'), false);
});

test('un cliente e una commessa nati sul telefono si creano col rapportino', async () => {
  const r = await nuovo({ cliente: 'Bianchi Automazioni Srl', commessa: 'Linea di imbottigliamento', codiceProposto: '26ST050', tariffa: 44, oreLavoro: 1 });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.cliente, 'Bianchi Automazioni Srl');
  assert.equal(r.rapportino.idCommessa, '26ST050', 'il codice che il telefono le ha dato');
  assert.equal(r.rapportino.commessa, 'Linea di imbottigliamento');
  const a = await manuel('anagrafiche');
  const c = a.clienti.find(x => x.nome === 'Bianchi Automazioni Srl');
  assert.equal(c.ultimaTariffa, 44, 'la tariffa libera si ricorda');
  assert.equal(a.commesse.find(m => m.id === '26ST050').prezzoOrario, 44, 'la commessa prende il prezzo del primo rapportino');
});

test('codice proposto gia\' preso: il primo libero; scritto a mano: rifiutato', async () => {
  const c = await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Dal computer', id: '26ST060' });
  assert.equal(c.ok, true, c.errore);
  const r = await nuovo({ idCliente: 'C002', commessa: 'Dal telefono', codiceProposto: '26ST060', tariffa: 42, oreLavoro: 1 });
  assert.equal(r.rapportino.idCommessa, '26ST061');
  const doppione = await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Doppione', id: '26ST001' });
  assert.equal(doppione.ok, false);
  assert.match(doppione.errore, /26ST001/);
  const stessa = await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'dal  COMPUTER' });
  assert.equal(stessa.commessa.giaEsisteva, true, 'stesso cliente e stessa descrizione: quella che c\'e\'');
  const auto = await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Codice automatico' });
  assert.equal(auto.commessa.id, '26ST062');
});

test('le tariffe restano congelate nella riga; si ricalcola solo se cambiano cliente o commessa', async () => {
  const m = (await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Congelata', euroKm: 0.9 })).commessa;
  const r = (await nuovo({ idLocale: 'congelato-1', idCliente: 'C002', idCommessa: m.id, tariffa: 40, oreLavoro: 1, km: 100 })).rapportino;
  assert.equal(r.euroKm, 0.9);
  assert.equal(r.rimborsoKm, 90);
  await manuel('aggiornaCommessa', { id: m.id, campi: { euroKm: 1.2 } });
  await manuel('salvaImpostazioni', { valori: { EURO_KM: 0.8 } });
  const dopo = (await nuovo({ idLocale: 'congelato-1', idCliente: 'C002', idCommessa: m.id, tariffa: 40, oreLavoro: 2, km: 100 })).rapportino;
  assert.equal(dopo.euroKm, 0.9, 'aggiornare l\'ACI non riscrive il passato');
  assert.equal(dopo.totale, 170);
  const cambiato = (await nuovo({ idLocale: 'congelato-1', idCliente: 'C002', tariffa: 40, oreLavoro: 2, km: 100 })).rapportino;
  assert.equal(cambiato.euroKm, 0.8, 'senza commessa: le regole di oggi');
  await manuel('salvaImpostazioni', { valori: { EURO_KM: 0.76 } });
});

test('Elettrodinamica: tariffa fissa, e le sue commesse non prendono un prezzo', async () => {
  const m = (await manuel('creaCommessa', { idCliente: 'C001', descrizione: 'Cantiere fisso' })).commessa;
  const r = await nuovo({ idCliente: 'C001', idCommessa: m.id, oreLavoro: 2, oreViaggio: 1, km: 10, tariffa: 99 });
  assert.equal(r.rapportino.tariffa, 30, 'la tariffa fissa vince su quella scritta');
  assert.equal(r.rapportino.compensoOre, 60, 'il viaggio non si paga');
  assert.equal((await manuel('anagrafiche')).commesse.find(x => x.id === m.id).prezzoOrario, null);
});

test('il costo orario: prima il costo fisso del cliente, poi la commessa, poi le impostazioni', async () => {
  await manuel('salvaImpostazioni', { valori: { COSTO_ORARIO: 18 } });
  const m = (await manuel('creaCommessa', { idCliente: 'C002', descrizione: 'Con costo', costoOrario: 22, prezzoOrario: 45 })).commessa;
  assert.equal((await nuovo({ idCliente: 'C002', idCommessa: m.id, tariffa: 45, oreLavoro: 1 })).rapportino.costoOrario, 22);
  assert.equal((await nuovo({ idCliente: 'C002', tariffa: 45, oreLavoro: 1 })).rapportino.costoOrario, 18);
  const e = (await manuel('creaCommessa', { idCliente: 'C001', descrizione: 'Elettro con costo', costoOrario: 40 })).commessa;
  assert.equal((await nuovo({ idCliente: 'C001', idCommessa: e.id, oreLavoro: 1 })).rapportino.costoOrario, 22, 'il costo fisso di Elettrodinamica');
  await manuel('salvaImpostazioni', { valori: { COSTO_ORARIO: 15 } });
});

test('il numero RAP viene dall\'anno della data, non da quando arriva', async () => {
  const a = await nuovo({ data: '2025-12-31', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 });
  assert.equal(a.rapportino.id, 'RAP/2025/0001');
  const b = await nuovo({ data: '2026-01-02', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 });
  assert.match(b.rapportino.id, /^RAP\/2026\/\d{4}$/);
  assert.ok(Number(b.rapportino.id.slice(-4)) > 6, 'continua dopo quelli del 2026');
});

test('un telefono rimasto alla 0.3.3: cliente nuovo "del gruppo Elettrodinamica" = Elettrodinamica', async () => {
  const r = await nuovo({ cliente: 'Cliente Finale Nuovo', gruppo: 'Elettrodinamica', oreLavoro: 1 });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.cliente, 'Elettrodinamica');
  assert.equal((await manuel('anagrafiche')).clienti.some(c => c.nome === 'Cliente Finale Nuovo'), false);
});

test('il cliente si trova anche per soprannome, senza badare a maiuscole e spazi', async () => {
  await manuel('aggiornaCliente', { id: 'C001', campi: { alias: ['Batokyo'] } });
  const r = await nuovo({ cliente: '  BATO kyo ', oreLavoro: 1 });
  assert.equal(r.rapportino.idCliente, 'C001');
});

test('una descrizione che comincia con "=" resta testo, e il ticket tiene gli zeri', async () => {
  const r = await nuovo({ cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1, descrizione: '=IMPORTXML("http://example.com")', ticket: '000123' });
  assert.equal(r.rapportino.descrizione, '=IMPORTXML("http://example.com")');
  assert.equal(r.rapportino.ticket, '000123');
});

// ------------------------------------------------------------------ clienti doppi, partite IVA, telefoni

test('clienti doppi: stesso nome, soprannome o partita IVA = quello che c\'e\'', async () => {
  const a = await manuel('creaCliente', { nome: 'Zero Davanti Srl', partitaIva: '01234567890', telefono: '0445123456' });
  assert.equal(a.cliente.giaEsisteva, false);
  assert.equal(a.cliente.partitaIva, '01234567890', 'lo zero davanti resta');
  assert.equal(a.cliente.telefono, '0445123456');
  assert.equal((await manuel('creaCliente', { nome: 'zero davanti s.r.l.' })).cliente.giaEsisteva, true, 'punti, spazi e maiuscole non contano');
  assert.equal((await manuel('creaCliente', { nome: 'Zero Davanti Due Srl' })).cliente.giaEsisteva, false, 'un nome diverso e\' un altro cliente');
  const b = await manuel('creaCliente', { nome: 'ZERO DAVANTI SRL' });
  assert.equal(b.cliente.giaEsisteva, true);
  assert.equal(b.cliente.id, a.cliente.id);
  const c = await manuel('creaCliente', { nome: 'Nome Diverso Spa', partitaIva: '01234567890' });
  assert.equal(c.cliente.giaEsisteva, true, 'stessa partita IVA');
  assert.equal(c.cliente.id, a.cliente.id);
  const d = await manuel('aggiornaCliente', { id: a.cliente.id, campi: { email: 'nuova@example.com' } });
  assert.equal(d.cliente.partitaIva, '01234567890', 'cambiare l\'email non toglie lo zero');
  assert.equal((await manuel('aggiornaCliente', { id: 'C999', campi: {} })).errore, 'Cliente C999 non trovato');
});

test('le impostazioni: partita IVA e telefono restano testo, un numero scritto diventa numero', async () => {
  const r = await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '04567890123', TELEFONO: '+39 333 1234567', COSTO_ORARIO: '16' } });
  assert.equal(r.impostazioni.PARTITA_IVA, '04567890123');
  assert.equal(r.impostazioni.TELEFONO, '+39 333 1234567');
  assert.equal(r.impostazioni.COSTO_ORARIO, 16);
  await manuel('salvaImpostazioni', { valori: { PARTITA_IVA: '00000000000', COSTO_ORARIO: 15 } });
});

// ------------------------------------------------------------------ stati, firme e file

test('firma: il rapportino diventa FIRMATO; ripetere lo stesso invio non cambia niente', async () => {
  const r = (await nuovo({ idLocale: 'firma-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  const f = await manuel('caricaFile', { tipo: 'firma', idLocale: 'firma-1', idFile: 'f-1', mime: 'image/png', base64, firmatario: 'Paolo Rossi', firmatoIl: '2026-10-20T17:30:00' });
  assert.equal(f.ok, true, f.errore);
  assert.match(f.file.url, /^\/file\/[A-Za-z0-9_-]{28}$/);
  const dopo = (await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.equal(dopo.stato, 'FIRMATO');
  assert.equal(dopo.firmatario, 'Paolo Rossi');
  assert.equal(dopo.firmatoIl, '2026-10-20T17:30:00');
  assert.deepEqual(dopo.firma, f.file);
  const ancora = await manuel('caricaFile', { tipo: 'firma', idLocale: 'firma-1', idFile: 'f-1', mime: 'image/png', base64, firmatario: 'Paolo Rossi' });
  assert.equal(ancora.file.id, f.file.id);
  const bloccato = await nuovo({ idLocale: 'firma-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 9 });
  assert.equal(bloccato.ok, false);
  assert.equal(bloccato.errore, 'Il rapportino ' + r.id + ' e\' gia\' firmato: riportalo in bozza per modificarlo');
  // Il PNG arriva com'e', col suo tipo.
  const bin = await manuel.file(f.file.id);
  assert.equal(bin.status, 200);
  assert.equal(bin.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await bin.arrayBuffer()), PNG);
  const viaAzione = await manuel('file', { id: f.file.id });
  assert.equal(viaAzione.file.base64, base64);
  assert.equal(viaAzione.file.mime, 'image/png');
});

test('stati: in bozza la firma cade, inviato azzera il fatturato, firmato solo con la firma', async () => {
  const r = (await nuovo({ idLocale: 'stati-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  await manuel('caricaFile', { tipo: 'firma', idLocale: 'stati-1', idFile: 'f-2', mime: 'image/png', base64, firmatario: 'X' });
  const fatt = (await manuel('stato', { ids: [r.id], stato: 'fatturato' })).rapportini[0];
  assert.equal(fatt.stato, 'FATTURATO');
  assert.ok(fatt.fatturatoIl);
  const inv = (await manuel('stato', { ids: [r.id], stato: 'INVIATO' })).rapportini[0];
  assert.equal(inv.fatturatoIl, '');
  assert.ok(inv.inviatoIl);
  // Una firma arrivata dopo l'invio si aggiunge ma non lo riporta indietro.
  await manuel('caricaFile', { tipo: 'firma', id: r.id, idFile: 'f-3', mime: 'image/png', base64, firmatario: 'Y' });
  assert.equal((await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id).stato, 'INVIATO');
  const bozza = (await manuel('stato', { id: r.id, stato: 'BOZZA' })).rapportini[0];
  assert.deepEqual([bozza.firma, bozza.firmatario, bozza.firmatoIl, bozza.inviatoIl, bozza.fatturatoIl], [null, '', '', '', '']);
  assert.equal((await manuel('stato', { ids: [r.id], stato: 'FIRMATO' })).errore, 'Per firmare serve la firma: caricala dal rapportino');
  assert.equal((await manuel('stato', { ids: [r.id], stato: 'BOH' })).errore, 'Stato non valido: BOH');
  assert.equal((await manuel('stato', { ids: ['RAP/1999/0001'], stato: 'BOZZA' })).errore, 'Rapportino RAP/1999/0001 non trovato');
});

test('annullato: non si vede negli elenchi, si ripristina com\'era', async () => {
  const r = (await nuovo({ idLocale: 'annulla-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  await manuel('caricaFile', { tipo: 'firma', idLocale: 'annulla-1', idFile: 'f-4', mime: 'image/png', base64, firmatario: 'Z' });
  await manuel('stato', { ids: [r.id], stato: 'ANNULLATO' });
  assert.equal((await manuel('rapportini')).rapportini.some(x => x.id === r.id), false);
  const annullato = (await manuel.leggi({ azione: 'rapportini', tutti: '1' })).rapportini.find(x => x.id === r.id);
  assert.equal(annullato.stato, 'ANNULLATO');
  assert.equal(annullato.statoPrima, 'FIRMATO');
  const back = await manuel('ripristinaRapportino', { id: r.id });
  assert.equal(back.rapportino.stato, 'FIRMATO');
  assert.ok(back.rapportino.firma);
  assert.match((await manuel('ripristinaRapportino', { id: r.id })).errore, /non è annullato/);
});

test('inviaEmail: parte dal postino col nome dello studio, segna inviati ma non riporta indietro i fatturati', async () => {
  const a = (await nuovo({ cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  const b = (await nuovo({ cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1 })).rapportino;
  await manuel('stato', { ids: [b.id], stato: 'FATTURATO' });
  const r = await manuel('inviaEmail', { a: 'rossi@example.com', cc: 'copia@example.com', oggetto: 'Rapportini di ottobre', messaggio: 'In allegato.',
    allegati: [{ nome: 'riepilogo.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 finto').toString('base64') }], ids: [a.id, b.id] });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual(r.rapportini.map(x => x.id), [a.id]);
  assert.equal(r.rapportini[0].stato, 'INVIATO');
  const tutti = (await manuel('rapportini', { tutti: true })).rapportini;
  assert.equal(tutti.find(x => x.id === b.id).stato, 'FATTURATO');
  const cartella = path.join(s.dati, 'posta-finta', 'email');
  const ultima = fs.readdirSync(cartella).sort().pop();
  const testo = fs.readFileSync(path.join(cartella, ultima, 'email.txt'), 'utf8');
  assert.match(testo, /^A: rossi@example\.com/);
  assert.match(testo, /CC: copia@example\.com/);
  assert.match(testo, /Da: Studio Tecnico GM/);
  assert.match(testo, /Rispondi a: studio@example\.com/);
  assert.ok(fs.existsSync(path.join(cartella, ultima, 'riepilogo.pdf')));
  const aMe = await manuel('inviaEmail', { aMe: true, oggetto: 'Prova', messaggio: 'x', ids: [a.id] });
  assert.deepEqual(aMe.rapportini, [], 'a me: non cambia niente');
  assert.equal((await manuel('inviaEmail', { oggetto: 'x' })).errore, 'Manca l\'indirizzo del cliente');
});

test('foto delle spese: niente doppioni con lo stesso idFile; tolta va nel cestino e si ripristina', async () => {
  const r = (await nuovo({ idLocale: 'foto-1', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1, spese: 12 })).rapportino;
  const f1 = await manuel('caricaFile', { tipo: 'spesa', idLocale: 'foto-1', idFile: 'scontrino-1', mime: 'image/png', base64 });
  const f1bis = await manuel('caricaFile', { tipo: 'spesa', idLocale: 'foto-1', idFile: 'scontrino-1', mime: 'image/png', base64 });
  const f2 = await manuel('caricaFile', { tipo: 'spesa', id: r.id, idFile: 'scontrino-2', mime: 'image/png', base64 });
  assert.equal(f1bis.file.id, f1.file.id);
  let dopo = (await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.deepEqual(dopo.foto.map(x => x.id), [f1.file.id, f2.file.id], 'in ordine di arrivo');
  const tolta = await manuel('togliFile', { id: r.id, fileId: f1.file.id });
  assert.deepEqual(tolta.rapportino.foto.map(x => x.id), [f2.file.id]);
  assert.equal((await manuel.file(f1.file.id)).status, 404, 'nel cestino non si scarica');
  const cestino = await manuel('cestino');
  assert.ok(cestino.file.some(x => x.id === f1.file.id));
  await manuel('ripristinaFile', { id: f1.file.id });
  dopo = (await manuel('rapportini', { tutti: true })).rapportini.find(x => x.id === r.id);
  assert.deepEqual(dopo.foto.map(x => x.id), [f1.file.id, f2.file.id]);
  assert.equal((await manuel('caricaFile', { tipo: 'spesa', idLocale: 'mai-visto', base64 })).errore, 'Rapportino non trovato: va salvato prima della foto');
  assert.equal((await manuel('caricaFile', { tipo: 'spesa', idLocale: 'foto-1' })).errore, 'File vuoto');
  assert.equal((await manuel('caricaFile', { tipo: 'boh', idLocale: 'foto-1', base64 })).errore, 'Tipo di file sconosciuto: boh');
});

test('documenti della commessa e firma del tecnico', async () => {
  const d = await manuel('caricaFile', { tipo: 'documento', idCommessa: '26ST001', nome: 'Schema quadro.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4').toString('base64') });
  assert.equal(d.ok, true, d.errore);
  assert.equal(d.file.nome, 'Schema quadro.pdf');
  const elenco = await manuel.leggi({ azione: 'documenti', idCommessa: '26ST001' });
  assert.equal(elenco.documenti[0].id, d.file.id);
  assert.equal(elenco.documenti[0].url, '/file/' + d.file.id);
  assert.equal((await manuel('documenti', { idCommessa: '99ST999' })).errore, 'Commessa 99ST999 non trovata');
  const t = await manuel('caricaFile', { tipo: 'firmaTecnico', mime: 'image/png', base64 });
  assert.equal((await manuel('anagrafiche')).impostazioni.FIRMA_TECNICO, '/file/' + t.file.id);
});

test('le azioni che non servono piu\' e quelle sconosciute', async () => {
  assert.equal((await manuel('salvaGruppo', { gruppo: { nome: 'x' } })).errore, 'Non serve più');
  assert.equal((await manuel('collegaComputer', { url: 'x' })).errore, 'Non serve più');
  assert.equal((await manuel('boh')).errore, 'Azione sconosciuta: boh');
  assert.equal((await manuel.leggi({ azione: 'salvaRapportino' })).errore, 'Questa azione vuole una POST', 'con una GET solo le letture');
  assert.equal((await s.leggi(null, { azione: 'accedi', email: 'manuel@esempio.it', password: 'prova' })).errore, 'Questa azione vuole una POST');
  const r = await fetch(s.url + '/exec', { method: 'POST', headers: { Authorization: 'Bearer ' + manuel.token }, body: '{rotto' });
  assert.equal((await r.json()).errore, 'Richiesta non valida');
});

test('lettura per date: da/a comprese, i piu\' recenti prima, anche in GET come lo script', async () => {
  const r = await manuel.leggi({ azione: 'rapportini', da: '2026-10-01', a: '2026-10-10' });
  assert.ok(r.rapportini.length >= 3);
  assert.ok(r.rapportini.every(x => x.data >= '2026-10-01' && x.data <= '2026-10-10'));
  const date = r.rapportini.map(x => x.data);
  assert.deepEqual(date, date.slice().sort().reverse());
});
