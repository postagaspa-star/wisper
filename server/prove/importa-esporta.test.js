// Fase 8 (fase8.md §7, §16): importa ed esporta. CSV con ";" e con ",", in UTF-8 e in Windows-1252, XLSX; doppioni per
// partita IVA e per nome; mai un campo pieno sovrascritto; errori di riga; Archivia quelli importati che salta chi ha una
// commessa; Esporta tutto: ZIP che Windows apre, un CSV per elenco uguale all'esportazione singola, niente colonne di
// soldi o riservati per chi non li vede (come titolare e come un titolare con "riservati" tolto per la prova).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { partitaIvaDiProva } = require('../src/prova');
const { leggiZip } = require('../src/zip');
const { scriviXlsx } = require('../strumenti/xlsx');
const { ELENCHI_ESPORTA_TUTTO } = require('../src/azioni/importa');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const b64 = b => Buffer.from(b).toString('base64');

let s;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

const PIVA1 = partitaIvaDiProva('0555555555');
const PIVA2 = partitaIvaDiProva('0666666666');

test('CSV con ";" in UTF-8: le colonne proposte dai nomi delle intestazioni (senza maiuscole, spazi e punti), gli esempi', async () => {
  const csv = '﻿Ragione sociale;P.IVA;Città;E-mail;Codice destinatario;Note interne\r\nAlfa Impianti Srl;' + PIVA1 + ';Thiene;alfa@esempio.it;ABC1234;\r\n"Beta; Gamma Snc";' + PIVA2 + ';Schio;beta@esempio.it;;"con ""virgolette"""\r\n';
  const r = ok(await manuel('leggiImport', { nome: 'clienti-fatture.csv', base64: b64(csv) }));
  assert.equal(r.righe, 2);
  assert.deepEqual(r.colonne.map(c => [c.intestazione, c.campo]), [['Ragione sociale', 'nome'], ['P.IVA', 'partitaIva'], ['Città', 'citta'], ['E-mail', 'email'],
    ['Codice destinatario', 'codiceSdi'], ['Note interne', '']]);
  assert.deepEqual(r.colonne[0].esempi, ['Alfa Impianti Srl', 'Beta; Gamma Snc']);
  const c = ok(await manuel('controllaImport', { idLettura: r.idLettura, colonne: r.colonne.map(x => x.campo), tipo: 'clienti' }));
  assert.deepEqual([c.nuovi, c.completati, c.daSistemare.length], [2, 0, 0]);
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM soggetti WHERE nome = 'Alfa Impianti Srl'").n, 0, 'il controllo non scrive niente');
});

test('CSV con "," in Windows-1252, XLSX; Gia\' in Wisper per partita IVA e per nome: si completano SOLO i campi vuoti; Da sistemare con la frase di salvaSoggetto', async () => {
  // Rossi Impianti Srl c'e' gia' (stesso nome, con partita IVA ed email, senza telefono): si completa il telefono; la
  // partita IVA e l'email del file non toccano quelle che ci sono.
  const prima = s.wisper.db.riga("SELECT * FROM soggetti WHERE nome = 'Rossi Impianti Srl'");
  assert.ok(prima.email && prima.partita_iva && !prima.telefono);
  const csv = 'Denominazione,Partita IVA,Comune,Email,Telefono\r\nRossi Impianti Srl,' + PIVA2 + ',Zanè,altra@esempio.it,0445 123456\r\nDelta Srl,12345678901,Thiene,,\r\nEpsilon Srl,,Marostica,epsilon@esempio.it,\r\n';
  const r = ok(await manuel('leggiImport', { nome: 'fornitori.csv', base64: b64(Buffer.from(csv, 'latin1')) }));
  assert.deepEqual(r.colonne.map(c => c.campo), ['nome', 'partitaIva', 'citta', 'email', 'telefono']);
  const c = ok(await manuel('controllaImport', { idLettura: r.idLettura, colonne: r.colonne, tipo: 'clienti' }));
  assert.deepEqual([c.nuovi, c.completati], [1, 1]);
  assert.deepEqual(c.daSistemare, [{ riga: 3, errore: 'Riga 3 · Partita IVA: il numero non torna, controlla le cifre' }]);
  const gia = c.anteprima.find(x => x.gruppo === 'gia');
  assert.deepEqual(gia.completa, ['Telefono'], 'mai un campo pieno');
  const i = ok(await manuel('importaSoggetti', { idLettura: r.idLettura, colonne: r.colonne, tipo: 'clienti' }));
  assert.deepEqual([i.importazione.nuovi, i.importazione.completati, i.importazione.saltati], [1, 1, 1]);
  const dopo = s.wisper.db.riga("SELECT * FROM soggetti WHERE nome = 'Rossi Impianti Srl'");
  assert.equal(dopo.email, prima.email, 'l\'email piena resta');
  assert.equal(dopo.partita_iva, prima.partita_iva, 'la partita IVA piena resta');
  assert.equal(dopo.telefono, '0445 123456', 'il telefono vuoto si completa');
  assert.ok(s.wisper.db.riga("SELECT * FROM soggetti WHERE nome = 'Epsilon Srl' AND citta = 'Marostica'"), 'la Windows-1252 letta giusta');
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'soggetti' AND nota = 'importato da fornitori.csv'"));
  // La lettura si usa una volta: dopo l'importazione e' finita.
  assert.match((await manuel('controllaImport', { idLettura: r.idLettura, colonne: r.colonne, tipo: 'clienti' })).errore, /^La lettura del file è scaduta/);
  // XLSX, "lo dice una colonna", e i doppioni dentro il file.
  const xlsx = scriviXlsx([{ nome: 'Anagrafiche', righe: [['Ragione sociale', 'Tipo', 'PIVA'], ['Zeta Forniture Srl', 'Fornitore', PIVA1], ['Zeta Forniture Srl', 'fornitore', PIVA1], ['Omega Srl', 'boh', '']] }]);
  const x = ok(await manuel('leggiImport', { nome: 'elenco.xlsx', base64: b64(xlsx) }));
  assert.deepEqual(x.colonne.map(c2 => c2.campo), ['nome', 'tipo', 'partitaIva']);
  const cx = ok(await manuel('controllaImport', { idLettura: x.idLettura, colonne: x.colonne, tipo: 'colonna' }));
  assert.deepEqual(cx.daSistemare.map(d => d.errore), ['Riga 3 · è un doppione della riga 2', 'Riga 4 · Cliente o fornitore: scrivi cliente, fornitore o entrambi']);
  const ix = ok(await manuel('importaSoggetti', { idLettura: x.idLettura, colonne: x.colonne, tipo: 'colonna' }));
  assert.equal(ix.importazione.nuovi, 1);
  assert.equal(s.wisper.db.riga("SELECT fornitore FROM soggetti WHERE nome = 'Zeta Forniture Srl'").fornitore, 1);
});

test('i limiti: colonne giuste, il nome serve, 5 MB, niente PDF; il permesso clienti 2', async () => {
  const r = ok(await manuel('leggiImport', { nome: 'x.csv', base64: b64('Nome;Email\r\nA;a@esempio.it\r\n') }));
  assert.match((await manuel('controllaImport', { idLettura: r.idLettura, colonne: ['', 'email'], tipo: 'clienti' })).errore, /^Ragione sociale: scegli la colonna col nome/);
  assert.match((await manuel('controllaImport', { idLettura: r.idLettura, colonne: ['nome'], tipo: 'clienti' })).errore, /una scelta per ogni colonna/);
  assert.match((await manuel('controllaImport', { idLettura: r.idLettura, colonne: ['nome', 'nome'], tipo: 'clienti' })).errore, /scelto per due colonne/);
  assert.match((await manuel('leggiImport', { nome: 'x.pdf', base64: b64('%PDF-1.4 niente') })).errore, /solo file CSV o Excel/);
  assert.match((await manuel('leggiImport', { nome: 'grande.csv', base64: b64(Buffer.alloc(5 * 1024 * 1024 + 10, 65)) })).errore, /più grande di 5 MB/);
  const marco = await s.come('marco@esempio.it');
  assert.equal((await marco('leggiImport', { nome: 'x.csv', base64: b64('Nome\r\nA\r\n') })).permesso, false);
});

test('Archivia quelli importati: salta chi ha gia\' una commessa; nel registro', async () => {
  const csv = 'Ragione sociale\r\nPrimo Importato Srl\r\nSecondo Importato Srl\r\n';
  const r = ok(await manuel('leggiImport', { nome: 'due.csv', base64: b64(csv) }));
  const i = ok(await manuel('importaSoggetti', { idLettura: r.idLettura, colonne: ['nome'], tipo: 'clienti' }));
  const secondo = s.wisper.db.riga("SELECT id FROM soggetti WHERE nome = 'Secondo Importato Srl'").id;
  ok(await manuel('creaCommessa', { idCliente: secondo, descrizione: 'Commessa del secondo' }));
  const a = ok(await manuel('archiviaImportati', { idImportazione: i.importazione.id }));
  assert.deepEqual([a.archiviati, a.restano], [1, 1]);
  assert.equal(s.wisper.db.riga("SELECT archiviato FROM soggetti WHERE nome = 'Primo Importato Srl'").archiviato, 1);
  assert.equal(s.wisper.db.riga('SELECT archiviato FROM soggetti WHERE id = ?', secondo).archiviato, 0);
  const elenco = ok(await manuel('importazioni'));
  const riga = elenco.importazioni.find(x => x.id === i.importazione.id);
  assert.deepEqual([riga.nomeFile, riga.nuovi, !!riga.archiviati], ['due.csv', 2, true]);
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'archiviati gli importati da due.csv'"));
});

/** Esporta tutto e aspetta che sia pronto: torna lo ZIP letto. */
async function esportaTutto(chi) {
  const e = ok(await chi('esportaTutto'));
  assert.deepEqual(e.esportazione.stato, 'in_corso');
  await s.wisper.attendiEsportazioni();
  const l = ok(await chi('esportazioni'));
  const x = l.esportazioni.find(y => y.id === e.esportazione.id);
  assert.equal(x.stato, 'pronta', x.errore);
  const r = await fetch(s.url + '/esportazione/' + x.id, { headers: { Authorization: 'Bearer ' + chi.token } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.match(r.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''wisper-tutto-\d{4}-\d{2}-\d{2}\.zip$/);
  return { id: x.id, zip: Buffer.from(await r.arrayBuffer()), riga: x };
}

test('Esporta tutto: uno ZIP che Windows apre, un CSV per elenco uguale all\'esportazione singola, leggimi.txt, la notifica, il registro', async () => {
  const { zip, riga, id } = await esportaTutto(manuel);
  // Lo zip come lo vuole Esplora file: firme giuste, deflate, CRC giusti, nomi in UTF-8 col loro bit, senza cartelle strane.
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const z = leggiZip(zip);
  assert.ok(z.nomi.includes('leggimi.txt'));
  for (const n of z.nomi) {
    assert.ok(!n.startsWith('/') && n.indexOf('..') < 0 && n.indexOf('\\') < 0, n);
    const info = z.info(n);
    assert.equal(info.metodo, 8);
    assert.equal(zlib.crc32(z.leggi(n)), zip.readUInt32LE(zip.indexOf(Buffer.from(n, 'utf8')) - 30 + 14), n + ': il CRC');
  }
  const leggimi = z.leggi('leggimi.txt').toString('utf8');
  assert.match(leggimi, /I file \(foto, firme, documenti\) non ci sono: stanno nella copia del NAS e in quella fuori casa\./);
  assert.match(leggimi, /dal server 0\.11\.1/);
  // Un CSV per elenco, ognuno uguale all'esportazione singola con gli stessi filtri.
  for (const [nome, cosa, filtri] of ELENCHI_ESPORTA_TUTTO.filter(x => x[1] !== 'registro')) {
    assert.ok(z.nomi.includes(nome + '.csv'), nome + '.csv nello zip');
    const singola = await manuel('esporta', Object.assign({ cosa }, filtri));
    if (!singola.ok) continue;
    assert.equal(z.leggi(nome + '.csv').toString('utf8'), Buffer.from(singola.base64, 'base64').toString('utf8'), nome + ': uguale all\'esportazione singola');
  }
  const reg = z.leggi('registro.csv').toString('utf8');
  assert.match(reg, /^﻿Quando;Chi;Dispositivo;Azione;Tabella;Riga;Prima;Dopo;Nota\r\n/);
  assert.ok(riga.righe.registro > 100);
  assert.ok(s.wisper.db.riga("SELECT * FROM notifiche WHERE tipo = 'esportazione_pronta'"));
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'esportazioni' AND id_riga = ? AND nota = 'esportazione di tutti i dati' AND dopo IS NOT NULL", String(id)));
  // Solo chi l'ha chiesta la scarica; dopo ESPORTAZIONI_GIORNI il file se ne va.
  const laura = await s.come('laura@esempio.it');
  assert.equal((await fetch(s.url + '/esportazione/' + id, { headers: { Authorization: 'Bearer ' + laura.token } })).status, 404);
  assert.equal((await laura('esportaTutto')).permesso === false || (await laura('esportaTutto')).ok === false, true, 'solo il titolare');
  s.wisper.db.esegui("UPDATE esportazioni SET scade = '2000-01-01T00:00:00+01:00' WHERE id = ?", id);
  assert.equal((await fetch(s.url + '/esportazione/' + id, { headers: { Authorization: 'Bearer ' + manuel.token } })).status, 404);
});

test('Esporta tutto da fuori casa (porta Google): lo ZIP non passa da Google, la risposta lo dice e il server continua', async () => {
  const { PortaGoogle } = require('../src/porta');
  const porta = new PortaGoogle(s.wisper, { spenta: true });
  const r = JSON.parse(await porta.esegui({ tipo: 'esportazione', id: '1', token: manuel.token }, 'prova-esportazione'));
  assert.deepEqual([r.ok, r.stato, r.soloInCasa, r.errore], [false, 403, true, 'Il file con tutti i dati si scarica solo in casa: aprilo quando sei in ufficio']);
  // Prepararlo e vederne l'elenco da fuori casa si puo' (passa come /exec).
  const l = JSON.parse(await porta.esegui({ tipo: 'exec', metodo: 'GET', dati: { azione: 'esportazioni' }, token: manuel.token }, 'prova-elenco'));
  assert.equal(l.ok, true, JSON.stringify(l));
  assert.equal((await manuel('io')).ok, true, 'il server risponde ancora');
});

test('Esporta tutto senza "riservati" (titolare finto per la prova): niente CCNL, livello, tipi sanitari; senza "costi" niente colonne di soldi', async () => {
  const w = s.wisper;
  const permessi = Object.assign(w.permessiDi('titolare'), { riservati: 0 });
  const chi = { utente: w.titolare(), permessi, app: 'prova' };
  const r = w.come(chi, () => w.esportaPerTutto('persone', { stato: 'tutte' }));
  const persone = Buffer.from(r.base64, 'base64').toString('utf8').split('\r\n')[0];
  const pieno = w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, () => w.esportaPerTutto('persone', { stato: 'tutte' }));
  const testaPiena = Buffer.from(pieno.base64, 'base64').toString('utf8').split('\r\n')[0];
  assert.match(testaPiena, /CCNL/);
  assert.doesNotMatch(persone, /CCNL|Livello/, 'senza riservati niente colonne riservate');
  const senzaCosti = w.come({ utente: w.titolare(), permessi: Object.assign(w.permessiDi('titolare'), { costi: 0 }) }, () => w.esportaPerTutto('rapportini', { tutti: true }));
  const testa = Buffer.from(senzaCosti.base64, 'base64').toString('utf8').split('\r\n')[0];
  assert.doesNotMatch(testa, /Tariffa|Totale|Compenso/);
  assert.equal(w.come({ utente: w.titolare(), permessi: Object.assign(w.permessiDi('titolare'), { costi: 0 }) }, () => w.esportaPerTutto('fatture', {})), null, 'le fatture senza soldi non ci sono');
});
