// Le fatture elettroniche: leggerle (xml, p7m in DER e in base64, zip, lotti, notifiche dello SDI) e scrivere l'XML
// da completare (fase4.md §8.3 e §9.1). I file d'esempio sono in prove/xml (dati inventati, node server/prove/xml/genera.js).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const F = require('../src/fatturapa');
const { Rifiuto } = require('../src/utili');
const { scriviZip } = require('../strumenti/xlsx');
const G = require('./xml/genera');

const XML = path.join(__dirname, 'xml');
const carica = nome => ({ nome, dati: fs.readFileSync(path.join(XML, nome)) });
const leggi = (...nomi) => F.leggiFatturePA(nomi.map(carica));
const unico = nome => {
  const r = leggi(nome);
  assert.deepEqual(r.scartati, [], nome + ': niente scartato');
  assert.equal(r.documenti.length, 1, nome);
  return r.documenti[0];
};
const conti = (compenso, contributo, baseIva, iva, totale, ritenuta, netto, extra) => Object.assign(
  { compenso, contributo, baseIva, iva, anticipazioni: 0, altre: 0, bollo: 0, bolloAddebitato: 0, totale, ritenuta, netto }, extra || {});

// ------------------------------------------------------------------ i file d'esempio sono quelli che genera.js scrive oggi

test('i file d\'esempio sono aggiornati (genera.js li rifarebbe uguali)', () => {
  const file = G.genera();
  for (const nome of Object.keys(file)) {
    const atteso = Buffer.isBuffer(file[nome]) ? file[nome] : Buffer.from(file[nome], 'utf8');
    assert.ok(fs.readFileSync(path.join(XML, nome)).equals(atteso), nome + ': rifallo con node server/prove/xml/genera.js');
  }
});

// ------------------------------------------------------------------ lettura

test('45/2026 (XML in chiaro, UTF-8): testata, righe, conti, scadenze, riferimento di Wisper', () => {
  const d = unico('IT00000000000_00045.xml');
  assert.equal(d.chiave, 'f1#1');
  assert.equal(d.genere, 'fattura');
  assert.equal(d.versione, 'FPR12');
  assert.deepEqual([d.tipoDocumento, d.divisa, d.data, d.numero], ['TD01', 'EUR', '2026-10-19', '45/2026']);
  assert.deepEqual([d.cedente.partitaIva, d.cedente.denominazione, d.cedente.regimeFiscale], ['00000000000', 'Studio Tecnico GM', 'RF01']);
  assert.deepEqual([d.cessionario.partitaIva, d.cessionario.nomeVisto, d.cessionario.pec, d.cessionario.sede.cap], ['04455667784', 'Rossi Impianti Srl', 'rossiimpianti@pec.esempio.it', '36061']);
  assert.deepEqual(d.trasmissione, { paese: 'IT', codice: '00000000000', progressivo: '00045', codiceDestinatario: '0000000', pecDestinatario: 'rossiimpianti@pec.esempio.it' });
  assert.equal(d.righe.length, 1);
  assert.deepEqual([d.righe[0].prezzoTotale, d.righe[0].aliquotaIva, d.righe[0].natura, d.righe[0].ritenuta], [1140, 22, '', true]);
  assert.match(d.righe[0].descrizione, /^30% alla firma: Adeguamento impianto elettrico capannone \(commessa 26ST003/);
  assert.deepEqual(d.casse, [{ tipo: 'TC17', aliquota: 5, importo: 57, imponibile: 1140, aliquotaIva: 22, ritenuta: false, natura: '' }]);
  assert.deepEqual(d.ritenute, [{ tipo: 'RT01', importo: 228, aliquota: 20, causale: 'A' }]);
  assert.deepEqual(d.riepilogo, [{ aliquotaIva: 22, natura: '', imponibile: 1197, imposta: 263.34, esigibilita: 'I', riferimentoNormativo: '' }]);
  assert.equal(d.importoTotale, 1460.34);
  assert.deepEqual(d.conti, conti(1140, 57, 1197, 263.34, 1460.34, 228, 1232.34));
  assert.deepEqual(d.scadenze, [{ data: '2026-11-18', importo: 1232.34, modalita: 'MP05', iban: 'IT60X0542811101000000123456' }]);
  assert.deepEqual(d.riferimentiWisper, ['W-13']);
  assert.deepEqual(d.causale, ['Acconto 30% alla firma, commessa 26ST003. Rif. Wisper W-13']);
  assert.equal(d.bollo, null);
});

test('46/2026 in una busta .p7m DER, coi prefissi p: e ds: (la bozza W-14 di un privato)', () => {
  const d = unico('IT00000000000_00046.xml.p7m');
  assert.deepEqual([d.numero, d.data, d.nomeFile], ['46/2026', '2026-10-22', 'IT00000000000_00046.xml.p7m']);
  assert.deepEqual([d.cessionario.nome, d.cessionario.cognome, d.cessionario.nomeVisto, d.cessionario.codiceFiscale, d.cessionario.partitaIva],
    ['Mario', 'Bianchi', 'Mario Bianchi', 'BNCMRA70C12L840K', '']);
  assert.deepEqual(d.conti, conti(250, 12.5, 262.5, 57.75, 320.25, 0, 320.25));
  assert.deepEqual(d.ritenute, []);
  assert.equal(d.righe[0].ritenuta, false);
  assert.deepEqual(d.scadenze.map(s => [s.data, s.importo]), [['2026-11-21', 320.25]]);
  assert.deepEqual(d.riferimentiWisper, ['W-14']);
  // La busta e' vera DER: comincia con SEQUENCE a lunghezza definita.
  const b = fs.readFileSync(path.join(XML, 'IT00000000000_00046.xml.p7m'));
  assert.equal(b[0], 0x30);
  assert.notEqual(b[1], 0x80);
});

test('47/2026 in ISO-8859-1 senza prefissi: le lettere accentate si leggono giuste, tre righe di Elettrodinamica', () => {
  const b = fs.readFileSync(path.join(XML, 'IT00000000000_00047.xml'));
  assert.match(b.toString('latin1', 0, 60), /encoding="ISO-8859-1"/);
  assert.ok(b.includes(Buffer.from([0x41, 0x74, 0x74, 0x69, 0x76, 0x69, 0x74, 0xE0])), 'la à in Latin-1, un byte solo');
  const d = unico('IT00000000000_00047.xml');
  assert.deepEqual(d.causale, ['Attività di settembre 2026']);
  assert.equal(d.cessionario.sede.indirizzo, 'Via dell\'Industria 12');
  assert.deepEqual([d.cessionario.partitaIva, d.trasmissione.codiceDestinatario], ['02468135799', 'AB12CD3']);
  assert.deepEqual(d.righe.map(r => [r.descrizione, r.quantita, r.unitaMisura, r.prezzoUnitario, r.prezzoTotale]), [
    ['Prestazioni professionali di settembre 2026 (6 rapportini)', 38, 'ore', 30, 1140],
    ['Rimborso chilometrico di settembre 2026', 312, 'km', 0.76, 237.12],
    ['Spese di viaggio e materiale di settembre 2026', 1, '', 16.8, 16.8]]);
  assert.deepEqual(d.conti, conti(1393.92, 69.7, 1463.62, 322, 1785.62, 278.78, 1506.84));
  assert.deepEqual(d.riferimentiWisper, []);
});

test('48/2026 in base64, BER a lunghezze indefinite, contenuto spezzato in pezzi, prefisso ns2: (bollo e spesa anticipata)', () => {
  const testo = fs.readFileSync(path.join(XML, 'IT00000000000_00048.xml.p7m'), 'latin1');
  assert.ok(testo.startsWith('MIA'), 'base64 di una busta a lunghezza indefinita');
  const der = Buffer.from(testo.replace(/\s/g, ''), 'base64');
  assert.deepEqual([der[0], der[1]], [0x30, 0x80]);
  assert.ok(der.includes(Buffer.from([0x24, 0x80])), 'la OCTET STRING costruita');
  const xml = F.estraiP7m(Buffer.from(testo, 'latin1')).toString('utf8');
  assert.match(xml, /<ns2:FatturaElettronica /);
  assert.ok(xml.length > 3000, 'tutti i pezzi rimessi insieme');
  const d = unico('IT00000000000_00048.xml.p7m');
  assert.equal(d.numero, '48/2026');
  assert.deepEqual(d.righe.map(r => [r.prezzoTotale, r.natura, r.ritenuta]), [[1520, '', true], [120, 'N1', false], [2, 'N1', false]]);
  assert.deepEqual(d.bollo, { virtuale: true, importo: 2 });
  assert.deepEqual(d.riepilogo.map(r => [r.aliquotaIva, r.natura, r.imponibile, r.imposta]), [[22, '', 1596, 351.12], [0, 'N1', 122, 0]]);
  assert.deepEqual(d.conti, conti(1520, 76, 1596, 351.12, 2069.12, 304, 1765.12, { anticipazioni: 120, bollo: 2, bolloAddebitato: 2 }));
  assert.deepEqual(d.riferimentiWisper, [], 'nessun riferimento: si abbina per importo');
});

test('49/2026 (solo il compenso) e la nota di credito TD04 con la fattura che corregge', () => {
  const d = unico('IT00000000000_00049.xml');
  assert.deepEqual(d.conti, conti(1520, 76, 1596, 351.12, 1947.12, 304, 1643.12));
  const n = unico('IT00000000000_00050.xml');
  assert.deepEqual([n.tipoDocumento, n.numero, n.data], ['TD04', '3/2026', '2026-10-23']);
  assert.deepEqual(n.fattureCollegate, [{ idDocumento: '45/2026', data: '2026-10-19' }]);
  assert.deepEqual(n.conti, conti(200, 10, 210, 46.2, 256.2, 40, 216.2), 'senza DatiPagamento: netto = totale - ritenuta');
  assert.deepEqual(n.pagamenti, []);
  assert.deepEqual(n.scadenze, []);
});

test('un lotto: due fatture nello stesso file danno due documenti', () => {
  const r = leggi('IT00000000000_00052.xml');
  assert.deepEqual(r.documenti.map(d => [d.chiave, d.numero, d.conti.totale, d.cessionario.nomeVisto]),
    [['f1#1', '52/2026', 128.1, 'Mario Bianchi'], ['f1#2', '53/2026', 256.2, 'Mario Bianchi']]);
  assert.equal(r.documenti[1].trasmissione.progressivo, '00052', 'la testata e\' la stessa');
});

test('ricevuta di consegna, notifica di scarto, metadati (scartati)', () => {
  const r = leggi('IT00000000000_00045_RC_001.xml', 'IT00000000000_00046_NS_001.xml', 'IT00000000000_00045_MT_001.xml');
  assert.deepEqual(r.documenti, [
    { chiave: 'f1#1', nomeFile: 'IT00000000000_00045_RC_001.xml', genere: 'esito', esito: 'consegnata', nomeFileFattura: 'IT00000000000_00045.xml',
      identificativoSdi: '111111111', data: '2026-10-19', errori: [] },
    { chiave: 'f2#1', nomeFile: 'IT00000000000_00046_NS_001.xml', genere: 'esito', esito: 'scartata', nomeFileFattura: 'IT00000000000_00046.xml.p7m',
      identificativoSdi: '222222222', data: '2026-10-23', errori: [{ codice: '00404', descrizione: 'Fattura duplicata' }] }]);
  assert.deepEqual(r.scartati, [{ nomeFile: 'IT00000000000_00045_MT_001.xml', motivo: 'Non serve: sono i dati dell\'invio, non la fattura' }]);
});

test('fatture ricevute: un fornitore nuovo (p7m) e un professionista con la ritenuta e senza scadenza', () => {
  const c = unico('IT09988776655_0A1B2.xml.p7m');
  assert.deepEqual([c.cedente.partitaIva, c.cedente.nomeVisto, c.cessionario.partitaIva, c.numero, c.data],
    ['09988776655', 'Comel Forniture Elettriche', '00000000000', '1301', '2026-10-20']);
  assert.deepEqual(c.conti, conti(96.38, 0, 96.38, 21.2, 117.58, 0, 117.58));
  assert.deepEqual(c.scadenze.map(s => [s.data, s.importo, s.iban]), [['2026-11-21', 117.58, 'IT02L0306911884100000001234']]);
  const v = unico('IT01122334459_00015.xml');
  assert.deepEqual([v.cedente.partitaIva, v.cedente.denominazione, v.numero], ['01122334459', 'Ing. Paolo Verdi', '15']);
  assert.deepEqual(v.casse.map(x => [x.tipo, x.aliquota, x.importo, x.imponibile]), [['TC04', 4, 20.8, 520]]);
  assert.deepEqual(v.ritenute, [{ tipo: 'RT01', importo: 104, aliquota: 20, causale: 'A' }]);
  assert.deepEqual(v.conti, conti(520, 20.8, 540.8, 118.98, 659.78, 104, 555.78));
  assert.deepEqual(v.scadenze, [], 'il DettaglioPagamento non ha la data');
  assert.equal(v.pagamenti[0].dettagli[0].importo, 555.78);
});

test('uno zip: quattro fatture, la foto e lo zip dentro lo zip scartati col loro perche\'', () => {
  const r = leggi('fatture-ottobre.zip');
  assert.deepEqual(r.documenti.map(d => [d.chiave, d.nomeFile, d.numero]), [
    ['f1.1#1', 'IT00000000000_00046.xml.p7m', '46/2026'],
    ['f1.2#1', 'IT00000000000_00047.xml', '47/2026'],
    ['f1.3#1', 'IT09988776655_0A1B2.xml.p7m', '1301'],
    ['f1.4#1', 'IT00000000000_00045.xml', '45/2026']]);
  assert.deepEqual(r.scartati, [
    { nomeFile: 'foto.jpg', motivo: 'Non è un file di fattura: servono .xml, .p7m o .zip' },
    { nomeFile: 'vecchie.zip', motivo: 'Uno zip dentro lo zip: aprilo e carica i file che ha dentro' }]);
  // Con altri file insieme: la chiave dice quale file e quale voce.
  const due = F.leggiFatturePA([carica('IT00000000000_00049.xml'), carica('fatture-ottobre.zip')]);
  assert.deepEqual(due.documenti.map(d => d.chiave), ['f1#1', 'f2.1#1', 'f2.2#1', 'f2.3#1', 'f2.4#1']);
  // Le cartelle e i file nascosti del Mac non contano.
  const mac = F.leggiFatturePA([{ nome: 'mac.zip', dati: scriviZip([
    { nome: 'cartella/', dati: '' }, { nome: '__MACOSX/cartella/._IT00000000000_00049.xml', dati: 'x' },
    { nome: 'cartella/IT00000000000_00049.xml', dati: fs.readFileSync(path.join(XML, 'IT00000000000_00049.xml')) }]) }]);
  assert.deepEqual([mac.documenti.map(d => d.chiave), mac.scartati], [['f1.1#1'], []]);
});

test('i file arrivano anche in base64, come li mandano le app', () => {
  const b = fs.readFileSync(path.join(XML, 'IT00000000000_00046.xml.p7m')).toString('base64');
  const r = F.leggiFatturePA([{ nome: 'IT00000000000_00046.xml.p7m', base64: b }]);
  assert.equal(r.documenti[0].numero, '46/2026');
});

// ------------------------------------------------------------------ casi in piu': buste, codifiche, nomi

/** Pezzi DER per costruire buste strane nelle prove. */
const der = (tag, ...c) => {
  const corpo = Buffer.concat(c);
  const l = corpo.length < 128 ? Buffer.from([corpo.length]) : corpo.length < 256 ? Buffer.from([0x81, corpo.length]) : Buffer.from([0x82, corpo.length >> 8, corpo.length & 255]);
  return Buffer.concat([Buffer.from([tag]), l, corpo]);
};
const oid = hex => der(0x06, Buffer.from(hex, 'hex'));

test('buste: OCTET STRING costruita annidata, busta dentro la busta, PEM, un ".p7m" che e\' un XML in chiaro', () => {
  const xml = Buffer.from(fs.readFileSync(path.join(XML, 'IT00000000000_00049.xml')));
  const a = xml.subarray(0, 700);
  const b = xml.subarray(700, 1500);
  const c = xml.subarray(1500);
  const annidata = der(0x24, der(0x24, der(0x04, a), der(0x04, b)), der(0x04, c));
  const busta = der(0x30, oid('2a864886f70d010702'), der(0xA0, der(0x30, der(0x02, Buffer.from([1])), der(0x31),
    der(0x30, oid('2a864886f70d010701'), der(0xA0, annidata)), der(0x31))));
  assert.ok(F.estraiP7m(busta).equals(xml), 'i pezzi annidati rimessi in fila');
  const doppia = G.bustaDer(G.bustaDer(xml));
  assert.ok(F.estraiP7m(doppia).equals(xml), 'una firma dentro l\'altra');
  const pem = Buffer.from('-----BEGIN PKCS7-----\r\n' + G.bustaDer(xml).toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n-----END PKCS7-----\r\n');
  assert.ok(F.estraiP7m(pem).equals(xml), 'PEM');
  const r = F.leggiFatturePA([{ nome: 'chiara.xml.p7m', dati: xml }]);
  assert.equal(r.documenti[0].numero, '49/2026', 'un .p7m che e\' l\'XML in chiaro si legge lo stesso');
  const rotta = F.leggiFatturePA([{ nome: 'rotta.p7m', dati: Buffer.from([0x30, 0x82, 0x10, 0x00, 0x06]) }, { nome: 'vuota.p7m', dati: Buffer.alloc(0) },
    { nome: 'staccata.p7m', dati: der(0x30, oid('2a864886f70d010702'), der(0xA0, der(0x30, der(0x02, Buffer.from([1])), der(0x31), der(0x30, oid('2a864886f70d010701')), der(0x31)))) }]);
  assert.deepEqual(rotta.scartati, [
    { nomeFile: 'rotta.p7m', motivo: 'La busta firmata (.p7m) non si legge: scarica di nuovo il file dal programma' },
    { nomeFile: 'vuota.p7m', motivo: 'Il file è vuoto' },
    { nomeFile: 'staccata.p7m', motivo: 'La busta firmata (.p7m) non si legge: scarica di nuovo il file dal programma' }]);
});

test('codifiche: BOM UTF-8, UTF-16 col BOM, windows-1252 (l\'euro e\' un byte solo)', () => {
  const corpo = '<a><b>Città € ok</b></a>';
  assert.equal(F.val(F.leggiXml(F.decodificaXml(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('<?xml version="1.0"?>' + corpo)]))), 'b'), 'Città € ok');
  const u16 = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('<?xml version="1.0" encoding="UTF-16"?>' + corpo, 'utf16le')]);
  assert.equal(F.val(F.leggiXml(F.decodificaXml(u16)), 'b'), 'Città € ok');
  const be = Buffer.from(u16.subarray(2));
  for (let i = 0; i < be.length; i += 2) { const x = be[i]; be[i] = be[i + 1]; be[i + 1] = x; }
  assert.equal(F.val(F.leggiXml(F.decodificaXml(Buffer.concat([Buffer.from([0xFE, 0xFF]), be]))), 'b'), 'Città € ok');
  const w = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="windows-1252"?><a><b>Citt'), Buffer.from([0xE0, 0x20, 0x80]), Buffer.from('</b></a>')]);
  assert.equal(F.val(F.leggiXml(F.decodificaXml(w)), 'b'), 'Città €');
});

test('il lettore XML: nomi locali, attributi, CDATA, commenti, entita\' numeriche', () => {
  const r = F.leggiXml('<?xml version="1.0"?><!-- c --><x:a xmlns:x="u" k=\'1\' x:j="2"><x:b><![CDATA[<non è un tag>]]> &amp; &#233;&#xE8;</x:b><c/></x:a>');
  assert.deepEqual([r.nome, r.qnome, r.attributi.k, r.attributi.j], ['a', 'x:a', '1', '2']);
  assert.equal(F.val(r, 'b'), '<non è un tag> & éè');
  assert.deepEqual(r.figli.map(f => f.nome), ['b', 'c']);
});

// ------------------------------------------------------------------ rifiuti e sicurezza

test('sicurezza: DOCTYPE, ENTITY e il "billion laughs" si scartano senza espandere niente', () => {
  const risate = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
    '<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]><lolz>&lol3;</lolz>';
  const esterna = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><FatturaElettronica>&x;</FatturaElettronica>';
  const soloEntity = '<a><!ENTITY x "y"></a>';
  const r = F.leggiFatturePA([{ nome: 'risate.xml', dati: Buffer.from(risate) }, { nome: 'esterna.xml', dati: Buffer.from(esterna) },
    { nome: 'entity.xml', dati: Buffer.from(soloEntity) }]);
  assert.equal(r.documenti.length, 0);
  const frase = 'Il file ha parti che Wisper non legge per sicurezza (DOCTYPE): non è un XML di fattura normale';
  assert.deepEqual(r.scartati.map(s => s.motivo), [frase, frase, frase]);
  // Anche dentro una busta.
  const nellaBusta = F.leggiFatturePA([{ nome: 'x.xml.p7m', dati: G.bustaDer(Buffer.from(esterna)) }]);
  assert.deepEqual(nellaBusta.scartati.map(s => s.motivo), [frase]);
});

test('XML rotti, entita\' sconosciute, troppi livelli, file che non sono fatture', () => {
  const casi = [
    ['rotto.xml', '<a><b></a>', /^Il file non è un XML leggibile: <\/a> non corrisponde/],
    ['aperto.xml', '<a><b>', /^Il file non è un XML leggibile: <b> non chiuso/],
    ['nbsp.xml', '<a>&nbsp;</a>', /^Il file non è un XML leggibile: entità sconosciuta &nbsp;/],
    ['due.xml', '<a/><b/>', /due radici/],
    ['profondo.xml', '<a>'.repeat(80) + '</a>'.repeat(80), /troppi livelli/],
    ['html.xml', '<html><body/></html>', /^Non è una fattura elettronica/],
    ['esito.xml', '<NotificaEsito><Esito>EC01</Esito></NotificaEsito>', /^Non serve: è un messaggio dello SDI/],
    ['vuota.xml', '<p:FatturaElettronica xmlns:p="x"><FatturaElettronicaHeader/></p:FatturaElettronica>', /^Il file non ha nessuna fattura dentro/],
    ['niente.xml', '', /^Il file è vuoto/],
  ];
  const r = F.leggiFatturePA(casi.map(([nome, testo]) => ({ nome, dati: Buffer.from(testo) })));
  assert.equal(r.documenti.length, 0);
  casi.forEach(([nome, , frase], k) => {
    assert.equal(r.scartati[k].nomeFile, nome);
    assert.match(r.scartati[k].motivo, frase, nome);
  });
  const altro = F.leggiFatturePA([{ nome: 'foto.png', dati: Buffer.from('x') }, { nome: 'fattura.pdf', dati: Buffer.from('%PDF') }]);
  assert.deepEqual(altro.scartati.map(s => s.motivo), ['Non è un file di fattura: servono .xml, .p7m o .zip', 'Non è un file di fattura: servono .xml, .p7m o .zip']);
  assert.throws(() => F.leggiXml('<a>' + '<b/>'.repeat(50) + '</a>', { elementi: 20 }), /troppi elementi/);
});

test('limiti: troppi file, troppi byte, un XML troppo grande, zip cifrati', () => {
  const tre = ['IT00000000000_00045.xml', 'IT00000000000_00049.xml', 'IT00000000000_00050.xml'].map(carica);
  assert.throws(() => F.leggiFatturePA(tre, { file: 2 }), e => e instanceof Rifiuto && e.message === 'Troppi file: al massimo 2 per volta');
  // Le voci degli zip contano.
  assert.throws(() => F.leggiFatturePA([carica('fatture-ottobre.zip')], { file: 3 }), /Troppi file: al massimo 3 per volta/);
  assert.throws(() => F.leggiFatturePA(tre, { byte: 5000 }), e => e instanceof Rifiuto && /^File troppo grandi: al massimo/.test(e.message));
  assert.throws(() => F.leggiFatturePA([{ nome: 'a.xml', base64: 'A'.repeat(100000) }], { byte: 1000 }), /File troppo grandi/, 'si ferma prima di decodificare');
  const grande = F.leggiFatturePA(tre, { xml: 4300 });
  assert.equal(grande.documenti.length, 2);
  assert.deepEqual(grande.scartati.map(s => s.nomeFile), ['IT00000000000_00045.xml']);
  assert.match(grande.scartati[0].motivo, /^Il file è troppo grande: al massimo/);
  // Il limite di quanto si scompatta in tutto da uno zip.
  assert.throws(() => F.leggiFatturePA([carica('fatture-ottobre.zip')], { scompattati: 6000 }), /scompattati per volta/);
  // Una voce cifrata (bit 0 delle bandiere nell'indice).
  const z = Buffer.from(scriviZip([{ nome: 'IT00000000000_00049.xml', dati: '<a/>' }]));
  const indice = z.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]));
  z.writeUInt16LE(z.readUInt16LE(indice + 8) | 1, indice + 8);
  assert.deepEqual(F.leggiFatturePA([{ nome: 'c.zip', dati: z }]).scartati, [{ nomeFile: 'IT00000000000_00049.xml', motivo: 'Il file nello zip è protetto da una password: Wisper non lo apre' }]);
  assert.deepEqual(F.leggiFatturePA([{ nome: 'rotto.zip', dati: Buffer.from('PK non e\' uno zip') }]).scartati,
    [{ nomeFile: 'rotto.zip', motivo: 'Lo zip non si apre: scaricalo di nuovo dal programma' }]);
});

test('zip bomb: una voce che dichiara pochi byte e ne scompatta tanti si ferma al limite', () => {
  const tanti = Buffer.alloc(40 * 1024 * 1024, 0x20);
  const z = Buffer.from(scriviZip([{ nome: 'bomba.xml', dati: tanti }]));
  assert.ok(z.length < 100 * 1024, 'compressa e\' piccola');
  // L'indice dichiara 100 byte scompattati (bugia).
  const indice = z.indexOf(Buffer.from([0x50, 0x4B, 0x01, 0x02]));
  z.writeUInt32LE(100, indice + 24);
  const prima = process.memoryUsage().arrayBuffers;
  const r = F.leggiFatturePA([{ nome: 'b.zip', dati: z }], { xml: 1024 * 1024 });
  assert.equal(r.documenti.length, 0);
  assert.deepEqual(r.scartati, [{ nomeFile: 'bomba.xml', motivo: 'Il file è troppo grande: al massimo 1 MB per una fattura' }]);
  assert.ok(process.memoryUsage().arrayBuffers - prima < 20 * 1024 * 1024, 'non ha scompattato i 40 MB');
  // Senza bugie la dimensione dichiarata basta per scartarla subito.
  const onesta = F.leggiFatturePA([{ nome: 'b.zip', dati: scriviZip([{ nome: 'bomba.xml', dati: Buffer.alloc(2 * 1024 * 1024, 0x20) }]) }], { xml: 1024 * 1024 });
  assert.match(onesta.scartati[0].motivo, /troppo grande/);
  assert.equal(typeof zlib.inflateRawSync, 'function');
});

// ------------------------------------------------------------------ scrittura: l'XML da completare

/** Il modello di una bozza come lo prepara il server (fase4.md §8.1): W-15, Rossi, 1520 + 120 N1 + bollo. */
function modelloW15() {
  return {
    riferimento: 'W-15', tipoDocumento: 'TD01', divisa: 'EUR', dataProposta: '2026-10-22', numero: '',
    prestatore: G.STUDIO,
    committente: G.ROSSI,
    righe: [
      { numero: 1, descrizione: '40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)',
        quantita: 1, unitaMisura: '', prezzoUnitario: 1520, prezzoTotale: 1520, aliquotaIva: 22, natura: '', ritenuta: true },
      { numero: 2, descrizione: 'Spesa anticipata per conto del cliente: Pratica di connessione al distributore del 14/10/2026 – 120 € “diritti”',
        quantita: 1, unitaMisura: '', prezzoUnitario: 120, prezzoTotale: 120, aliquotaIva: 0, natura: 'N1', ritenuta: false },
      { numero: 3, descrizione: 'Imposta di bollo', quantita: 1, unitaMisura: '', prezzoUnitario: 2, prezzoTotale: 2, aliquotaIva: 0, natura: 'N1', ritenuta: false }],
    cassa: { tipo: 'TC17', aliquota: 5, imponibile: 1520, importo: 76, aliquotaIva: 22, natura: '', ritenuta: false },
    ritenuta: { tipo: 'RT01', aliquota: 20, importo: 304, causale: 'A' },
    bollo: { virtuale: true, importo: 2 },
    riepilogo: [
      { aliquotaIva: 22, natura: '', imponibile: 1596, imposta: 351.12, esigibilita: 'I', riferimentoNormativo: '' },
      { aliquotaIva: 0, natura: 'N1', imponibile: 122, imposta: 0, esigibilita: '', riferimentoNormativo: 'Escluse ex art. 15 DPR 633/72' }],
    totaleDocumento: 2069.12, nettoAPagare: 1765.12,
    pagamento: { condizioni: 'TP02', dettagli: [{ modalita: 'MP05', scadenza: '2026-11-21', importo: 1765.12, iban: 'IT60X0542811101000000123456', istituto: 'Banca di esempio' }] },
    causale: ['40% a fine progetto, commessa 26ST003. Rif. Wisper W-15', 'Conti da verificare: regole non confermate dal commercialista'],
    fattureCollegate: [],
    regoleConfermate: false,
  };
}

/** L'ordine dei figli che vuole lo schema 1.2.3, per i contenitori che Wisper scrive. */
const ORDINE = {
  FatturaElettronica: ['FatturaElettronicaHeader', 'FatturaElettronicaBody'],
  FatturaElettronicaHeader: ['DatiTrasmissione', 'CedentePrestatore', 'RappresentanteFiscale', 'CessionarioCommittente'],
  DatiTrasmissione: ['IdTrasmittente', 'ProgressivoInvio', 'FormatoTrasmissione', 'CodiceDestinatario', 'ContattiTrasmittente', 'PECDestinatario'],
  IdTrasmittente: ['IdPaese', 'IdCodice'],
  IdFiscaleIVA: ['IdPaese', 'IdCodice'],
  CedentePrestatore: ['DatiAnagrafici', 'Sede', 'StabileOrganizzazione', 'IscrizioneREA', 'Contatti', 'RiferimentoAmministrazione'],
  CessionarioCommittente: ['DatiAnagrafici', 'Sede', 'StabileOrganizzazione', 'RappresentanteFiscale'],
  DatiAnagrafici: ['IdFiscaleIVA', 'CodiceFiscale', 'Anagrafica', 'AlboProfessionale', 'ProvinciaAlbo', 'NumeroIscrizioneAlbo', 'DataIscrizioneAlbo', 'RegimeFiscale'],
  Anagrafica: ['Denominazione', 'Nome', 'Cognome', 'Titolo', 'CodEORI'],
  Sede: ['Indirizzo', 'NumeroCivico', 'CAP', 'Comune', 'Provincia', 'Nazione'],
  Contatti: ['Telefono', 'Fax', 'Email'],
  FatturaElettronicaBody: ['DatiGenerali', 'DatiBeniServizi', 'DatiVeicoli', 'DatiPagamento', 'Allegati'],
  DatiGenerali: ['DatiGeneraliDocumento', 'DatiOrdineAcquisto', 'DatiContratto', 'DatiConvenzione', 'DatiRicezione', 'DatiFattureCollegate', 'DatiSAL', 'DatiDDT', 'DatiTrasporto', 'FatturaPrincipale'],
  DatiGeneraliDocumento: ['TipoDocumento', 'Divisa', 'Data', 'Numero', 'DatiRitenuta', 'DatiBollo', 'DatiCassaPrevidenziale', 'ScontoMaggiorazione', 'ImportoTotaleDocumento', 'Arrotondamento', 'Causale', 'Art73'],
  DatiRitenuta: ['TipoRitenuta', 'ImportoRitenuta', 'AliquotaRitenuta', 'CausalePagamento'],
  DatiBollo: ['BolloVirtuale', 'ImportoBollo'],
  DatiCassaPrevidenziale: ['TipoCassa', 'AlCassa', 'ImportoContributoCassa', 'ImponibileCassa', 'AliquotaIVA', 'Ritenuta', 'Natura', 'RiferimentoAmministrazione'],
  DatiFattureCollegate: ['RiferimentoNumeroLinea', 'IdDocumento', 'Data', 'NumItem', 'CodiceCommessaConvenzione', 'CodiceCUP', 'CodiceCIG'],
  DatiBeniServizi: ['DettaglioLinee', 'DatiRiepilogo'],
  DettaglioLinee: ['NumeroLinea', 'TipoCessionePrestazione', 'CodiceArticolo', 'Descrizione', 'Quantita', 'UnitaMisura', 'DataInizioPeriodo', 'DataFinePeriodo',
    'PrezzoUnitario', 'ScontoMaggiorazione', 'PrezzoTotale', 'AliquotaIVA', 'Ritenuta', 'Natura', 'RiferimentoAmministrazione', 'AltriDatiGestionali'],
  AltriDatiGestionali: ['TipoDato', 'RiferimentoTesto', 'RiferimentoNumero', 'RiferimentoData'],
  DatiRiepilogo: ['AliquotaIVA', 'Natura', 'SpeseAccessorie', 'Arrotondamento', 'ImponibileImporto', 'Imposta', 'EsigibilitaIVA', 'RiferimentoNormativo'],
  DatiPagamento: ['CondizioniPagamento', 'DettaglioPagamento'],
  DettaglioPagamento: ['Beneficiario', 'ModalitaPagamento', 'DataRiferimentoTerminiPagamento', 'GiorniTerminiPagamento', 'DataScadenzaPagamento', 'ImportoPagamento',
    'CodUfficioPostale', 'CognomeQuietanzante', 'NomeQuietanzante', 'CFQuietanzante', 'TitoloQuietanzante', 'IstitutoFinanziario', 'IBAN', 'ABI', 'CAB', 'BIC'],
};

function controllaOrdine(nodo) {
  const lista = ORDINE[nodo.nome];
  if (lista) {
    let ultimo = -1;
    for (const f of nodo.figli) {
      const k = lista.indexOf(f.nome);
      assert.ok(k >= 0, f.nome + ' non sta in ' + nodo.nome);
      assert.ok(k >= ultimo, f.nome + ' fuori posto in ' + nodo.nome);
      ultimo = k;
    }
  } else assert.equal(nodo.figli.length, 0, nodo.nome + ' ha figli che non controllo');
  nodo.figli.forEach(controllaOrdine);
}

test('XML da completare: Numero BOZZA, ProgressivoInvio W15, solo Latin-1, ordine dello schema', () => {
  const xml = F.scriviFatturaPA(modelloW15());
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" ' +
    'xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'));
  assert.match(xml, /<Numero>BOZZA<\/Numero>/);
  assert.match(xml, /<ProgressivoInvio>W15<\/ProgressivoInvio>/);
  assert.match(xml, /<FormatoTrasmissione>FPR12<\/FormatoTrasmissione>/);
  assert.match(xml, /<IdTrasmittente>\s*<IdPaese>IT<\/IdPaese>\s*<IdCodice>00000000000<\/IdCodice>/);
  assert.match(xml, /<CodiceDestinatario>0000000<\/CodiceDestinatario>\s*<PECDestinatario>rossiimpianti@pec.esempio.it<\/PECDestinatario>/);
  for (const ch of xml) assert.ok(ch.codePointAt(0) <= 0xFF, 'carattere fuori da Latin-1: ' + ch);
  assert.match(xml, /del 14\/10\/2026 - 120 EUR &quot;diritti&quot;<\/Descrizione>/, 'euro, trattino lungo e virgolette tipografiche');
  assert.match(xml, /<ImportoTotaleDocumento>2069.12<\/ImportoTotaleDocumento>/);
  assert.match(xml, /<AlCassa>5.00<\/AlCassa>/);
  assert.match(xml, /<Quantita>1.00<\/Quantita>/);
  assert.match(xml, /<AltriDatiGestionali>\s*<TipoDato>RIFWISPER<\/TipoDato>\s*<RiferimentoTesto>W-15<\/RiferimentoTesto>/);
  assert.equal((xml.match(/<AltriDatiGestionali>/g) || []).length, 1, 'solo sulla prima riga');
  assert.equal((xml.match(/<Causale>/g) || []).length, 2);
  controllaOrdine(F.leggiXml(xml));
  // Col numero e il progressivo veri (i file d'esempio) e una causale troppo lunga, divisa in pezzi da 200.
  const lungo = Object.assign(modelloW15(), { causale: ['x'.repeat(450)] });
  const conNumero = F.scriviFatturaPA(lungo, { numero: '48/2026', progressivo: '00048' });
  assert.match(conNumero, /<Numero>48\/2026<\/Numero>/);
  assert.match(conNumero, /<ProgressivoInvio>00048<\/ProgressivoInvio>/);
  assert.deepEqual((conNumero.match(/<Causale>(x+)<\/Causale>/g) || []).map(c => c.length - 19), [200, 200, 50]);
  assert.equal(F.testoLatino('Prezzo… 3,5 € — “ok” ‘sì’ 日本', 0), 'Prezzo... 3,5 EUR - "ok" \'sì\'');
});

test('XML da completare: riletto, torna uguale al modello (giro completo)', () => {
  const m = modelloW15();
  const r = F.leggiFatturePA([{ nome: 'Bozza W-15 Rossi Impianti Srl - non inviare.xml', dati: Buffer.from(F.scriviFatturaPA(m), 'utf8') }]);
  assert.deepEqual(r.scartati, []);
  const d = r.documenti[0];
  assert.deepEqual([d.tipoDocumento, d.divisa, d.data, d.numero, d.trasmissione.progressivo], ['TD01', 'EUR', '2026-10-22', 'BOZZA', 'W15']);
  for (const k of ['partitaIva', 'codiceFiscale', 'denominazione', 'regimeFiscale']) assert.equal(d.cedente[k], m.prestatore[k], 'cedente ' + k);
  assert.deepEqual(d.cedente.sede, Object.assign({ numeroCivico: '' }, m.prestatore.sede));
  assert.equal(d.cedente.email, m.prestatore.email);
  for (const k of ['partitaIva', 'denominazione', 'pec']) assert.equal(d.cessionario[k], m.committente[k], 'cessionario ' + k);
  assert.deepEqual(d.cessionario.sede, Object.assign({ numeroCivico: '' }, m.committente.sede));
  assert.equal(d.trasmissione.codiceDestinatario, m.committente.codiceDestinatario);
  const atteseRighe = m.righe.map(x => ({ numero: x.numero, descrizione: F.testoLatino(x.descrizione), quantita: x.quantita, prezzoUnitario: x.prezzoUnitario,
    prezzoTotale: x.prezzoTotale, aliquotaIva: x.aliquotaIva, natura: x.natura, ritenuta: x.ritenuta }));
  assert.deepEqual(d.righe.map(x => ({ numero: x.numero, descrizione: x.descrizione, quantita: x.quantita, prezzoUnitario: x.prezzoUnitario,
    prezzoTotale: x.prezzoTotale, aliquotaIva: x.aliquotaIva, natura: x.natura, ritenuta: x.ritenuta })), atteseRighe);
  assert.deepEqual(d.riepilogo, m.riepilogo.map(x => ({ aliquotaIva: x.aliquotaIva, natura: x.natura, imponibile: x.imponibile, imposta: x.imposta,
    esigibilita: x.esigibilita, riferimentoNormativo: x.riferimentoNormativo })));
  assert.deepEqual(d.casse, [Object.assign({}, m.cassa)].map(c => ({ tipo: c.tipo, aliquota: c.aliquota, importo: c.importo, imponibile: c.imponibile,
    aliquotaIva: c.aliquotaIva, ritenuta: c.ritenuta, natura: c.natura })));
  assert.deepEqual(d.ritenute, [{ tipo: 'RT01', importo: 304, aliquota: 20, causale: 'A' }]);
  assert.deepEqual(d.bollo, { virtuale: true, importo: 2 });
  assert.equal(d.importoTotale, m.totaleDocumento);
  assert.deepEqual(d.scadenze, [{ data: '2026-11-21', importo: 1765.12, modalita: 'MP05', iban: 'IT60X0542811101000000123456' }]);
  assert.equal(d.pagamenti[0].dettagli[0].istituto, 'Banca di esempio');
  assert.deepEqual(d.causale, m.causale);
  assert.deepEqual(d.riferimentiWisper, ['W-15']);
  assert.deepEqual(d.conti, conti(1520, 76, 1596, 351.12, 2069.12, 304, 1765.12, { anticipazioni: 120, bollo: 2, bolloAddebitato: 2 }));
  // Un privato: Nome e Cognome, codice fiscale, niente IdFiscaleIVA; una nota con la fattura collegata.
  const privato = Object.assign(modelloW15(), { tipoDocumento: 'TD04', committente: G.BIANCHI, fattureCollegate: [{ idDocumento: '46/2026', data: '2026-10-22' }] });
  const p = F.leggiFatturePA([{ nome: 'p.xml', dati: Buffer.from(F.scriviFatturaPA(privato)) }]).documenti[0];
  assert.deepEqual([p.cessionario.nome, p.cessionario.cognome, p.cessionario.codiceFiscale, p.cessionario.partitaIva, p.tipoDocumento],
    ['Mario', 'Bianchi', 'BNCMRA70C12L840K', '', 'TD04']);
  assert.deepEqual(p.fattureCollegate, [{ idDocumento: '46/2026', data: '2026-10-22' }]);
  const xmlPrivato = F.scriviFatturaPA(privato);
  assert.doesNotMatch(xmlPrivato.split('<CessionarioCommittente>')[1], /<IdFiscaleIVA>/);
  assert.doesNotMatch(xmlPrivato, /<PECDestinatario>/, 'senza PEC niente PECDestinatario');
  controllaOrdine(F.leggiXml(xmlPrivato));
});
