/*
 * Gli XML di esempio delle prove della fase 4 (fatture emesse, ricevute,
 * notifiche dello SDI, buste .p7m e uno zip). Per rifarli:
 *
 *   node server/prove/xml/genera.js
 *
 * Dati inventati, coerenti coi dati di esempio del server (src/prova.js):
 * Studio Tecnico GM con la partita IVA 00000000000, Elettrodinamica, Rossi
 * Impianti Srl, Mario Bianchi, due fornitori. Le partite IVA hanno il codice di
 * controllo giusto ma non sono di nessuno. Le firme delle buste sono finte:
 * Wisper non le verifica, legge solo il contenuto.
 *
 * Il risultato e' sempre lo stesso a ogni giro (anche lo zip: la data dentro e'
 * fissa), cosi' git vede un cambio solo se cambia davvero qualcosa.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { scriviFatturaPA } = require('../../src/fatturapa');
const { scriviZip } = require('../../strumenti/xlsx');

const QUI = __dirname;
const c2 = n => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ chi c'e'

const STUDIO = {
  denominazione: 'Studio Tecnico GM', partitaIva: '00000000000', codiceFiscale: '00000000000', regimeFiscale: 'RF01',
  albo: { nome: 'Periti industriali', provincia: 'VI', numero: '000', data: '' },
  sede: { indirizzo: 'Via dell\'Esempio 1', cap: '36016', comune: 'Thiene', provincia: 'VI', nazione: 'IT' }, pec: '', email: 'studio@example.com',
};
/** Lo studio quando e' lui a ricevere la fattura (dai fornitori). */
const STUDIO_CLIENTE = {
  denominazione: 'Studio Tecnico GM', nome: '', cognome: '', partitaIva: '00000000000', codiceFiscale: '00000000000',
  sede: STUDIO.sede, codiceDestinatario: '0000000', pec: '',
};
const ELETTRO = {
  denominazione: 'Elettrodinamica', nome: '', cognome: '', partitaIva: '02468135799', codiceFiscale: '',
  sede: { indirizzo: 'Via dell\'Industria 12', cap: '36016', comune: 'Thiene', provincia: 'VI', nazione: 'IT' }, codiceDestinatario: 'AB12CD3', pec: '',
};
const ROSSI = {
  denominazione: 'Rossi Impianti Srl', nome: '', cognome: '', partitaIva: '04455667784', codiceFiscale: '',
  sede: { indirizzo: 'Via Nuova 3', cap: '36061', comune: 'Bassano del Grappa', provincia: 'VI', nazione: 'IT' },
  codiceDestinatario: '0000000', pec: 'rossiimpianti@pec.esempio.it',
};
const BIANCHI = {
  denominazione: '', nome: 'Mario', cognome: 'Bianchi', partitaIva: '', codiceFiscale: 'BNCMRA70C12L840K',
  sede: { indirizzo: 'Via Montegrappa 8', cap: '36063', comune: 'Marostica', provincia: 'VI', nazione: 'IT' }, codiceDestinatario: '0000000', pec: '',
};
const COMEL = {
  denominazione: 'Comel Forniture Elettriche', partitaIva: '09988776655', codiceFiscale: '09988776655', regimeFiscale: 'RF01', albo: {},
  sede: { indirizzo: 'Via dei Fornitori 9', cap: '35100', comune: 'Padova', provincia: 'PD', nazione: 'IT' }, pec: '', email: '',
};
const VERDI = {
  denominazione: 'Ing. Paolo Verdi', partitaIva: '01122334459', codiceFiscale: '01122334459', regimeFiscale: 'RF01', albo: {},
  sede: { indirizzo: 'Via degli Ingegneri 4', cap: '36100', comune: 'Vicenza', provincia: 'VI', nazione: 'IT' }, pec: '', email: '',
};
const IBAN_STUDIO = 'IT60X0542811101000000123456';

/**
 * Il modello di una fattura, coi conti dell'accordo (fase4.md §6): compenso,
 * contributo della cassa sul compenso, IVA 22% su compenso + contributo, righe
 * N1 fuori da tutto, ritenuta 20% sul compenso se il cliente e' sostituto.
 */
function modello(o) {
  const righe = o.righe.map((r, k) => ({
    numero: k + 1, descrizione: r.d, quantita: r.q === undefined ? 1 : r.q, unitaMisura: r.u || '',
    prezzoUnitario: r.p, prezzoTotale: c2((r.q === undefined ? 1 : r.q) * r.p),
    aliquotaIva: r.natura ? 0 : 22, natura: r.natura || '', ritenuta: !r.natura && !!o.sostituto,
  }));
  const compenso = c2(righe.filter(r => !r.natura).reduce((t, r) => c2(t + r.prezzoTotale), 0));
  const n1 = c2(righe.filter(r => r.natura === 'N1').reduce((t, r) => c2(t + r.prezzoTotale), 0));
  const cassa = o.cassa === null ? null : Object.assign({ tipo: 'TC17', aliquota: 5 }, o.cassa || {});
  const contributo = cassa ? c2(compenso * cassa.aliquota / 100) : 0;
  const base = c2(compenso + contributo);
  const iva = c2(base * 22 / 100);
  const totale = c2(base + iva + n1);
  const ritenuta = o.sostituto ? c2(compenso * 20 / 100) : 0;
  const netto = c2(totale - ritenuta);
  const riepilogo = [{ aliquotaIva: 22, natura: '', imponibile: base, imposta: iva, esigibilita: 'I', riferimentoNormativo: '' }];
  if (n1) riepilogo.push({ aliquotaIva: 0, natura: 'N1', imponibile: n1, imposta: 0, esigibilita: '', riferimentoNormativo: 'Escluse ex art. 15 DPR 633/72' });
  return {
    riferimento: o.riferimento || '', tipoDocumento: o.tipo || 'TD01', divisa: 'EUR', dataProposta: o.data, data: o.data, numero: o.numero || '',
    prestatore: o.prestatore || STUDIO, committente: o.committente,
    righe,
    cassa: cassa ? { tipo: cassa.tipo, aliquota: cassa.aliquota, imponibile: compenso, importo: contributo, aliquotaIva: 22, natura: '', ritenuta: false } : null,
    ritenuta: ritenuta ? { tipo: 'RT01', aliquota: 20, importo: ritenuta, causale: 'A' } : null,
    bollo: o.bollo ? { virtuale: true, importo: 2 } : null,
    riepilogo,
    totaleDocumento: totale, nettoAPagare: netto,
    pagamento: o.senzaPagamento ? null : {
      condizioni: 'TP02',
      dettagli: [{ modalita: 'MP05', scadenza: o.scadenza || '', importo: netto, iban: o.iban === undefined ? IBAN_STUDIO : o.iban, istituto: o.iban === '' ? '' : 'Banca di esempio' }],
    },
    causale: o.causale ? [o.causale] : [],
    fattureCollegate: o.collegate || [],
    regoleConfermate: false,
  };
}

const xml = (m, numero, progressivo) => scriviFatturaPA(m, { numero, progressivo });

// ------------------------------------------------------------------ le buste .p7m (firma finta)

function lunghezzaDer(n) {
  if (n < 128) return Buffer.from([n]);
  const b = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) b.unshift(x % 256);
  return Buffer.from([0x80 | b.length].concat(b));
}
const der = (tag, ...c) => {
  const corpo = Buffer.concat(c);
  return Buffer.concat([Buffer.from([tag]), lunghezzaDer(corpo.length), corpo]);
};
/** Lunghezza indefinita: 0x80 e in fondo 00 00 (BER). */
const ber = (tag, ...c) => Buffer.concat([Buffer.from([tag, 0x80]), ...c, Buffer.from([0, 0])]);
const oid = hex => der(0x06, Buffer.from(hex, 'hex'));
const NULLA = Buffer.from([0x05, 0x00]);
const UNO = der(0x02, Buffer.from([1]));
const SHA256 = der(0x30, oid('608648016503040201'), NULLA);
const FIRMATARIO = der(0x30,
  UNO,
  der(0x30, der(0x30, der(0x31, der(0x30, oid('550403'), der(0x0C, Buffer.from('Firma finta di prova'))))), UNO),
  SHA256,
  der(0x30, oid('2a864886f70d010101'), NULLA),
  der(0x04, Buffer.alloc(32, 0x5A)));

/** Una busta CMS (SignedData) in DER, con l'XML dentro. */
function bustaDer(contenuto) {
  const encap = der(0x30, oid('2a864886f70d010701'), der(0xA0, der(0x04, contenuto)));
  const signed = der(0x30, UNO, der(0x31, SHA256), encap, der(0x31, FIRMATARIO));
  return der(0x30, oid('2a864886f70d010702'), der(0xA0, signed));
}

/** La stessa busta in BER a lunghezze indefinite, con l'XML spezzato in pezzi da 1000 byte. */
function bustaBer(contenuto) {
  const pezzi = [];
  for (let i = 0; i < contenuto.length; i += 1000) pezzi.push(der(0x04, contenuto.subarray(i, i + 1000)));
  const encap = ber(0x30, oid('2a864886f70d010701'), ber(0xA0, ber(0x24, ...pezzi)));
  const signed = ber(0x30, UNO, der(0x31, SHA256), encap, der(0x31, FIRMATARIO));
  return ber(0x30, oid('2a864886f70d010702'), ber(0xA0, signed));
}

const base64Righe = buf => buf.toString('base64').replace(/(.{64})/g, '$1\n').trim() + '\n';

// ------------------------------------------------------------------ i documenti

function genera() {
  const file = {};
  const rif26ST003 = ': Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)';

  // 1. 45/2026 a Rossi: l'acconto del 30% (gia' emessa nei dati di esempio: serve per il doppione).
  const m45 = modello({ data: '2026-10-19', committente: ROSSI, sostituto: true, riferimento: 'W-13', scadenza: '2026-11-18',
    righe: [{ d: '30% alla firma' + rif26ST003, p: 1140 }], causale: 'Acconto 30% alla firma, commessa 26ST003. Rif. Wisper W-13' });
  file['IT00000000000_00045.xml'] = xml(m45, '45/2026', '00045');

  // 2. 46/2026 a Mario Bianchi, in una busta DER, coi prefissi p: (e ds: dichiarato): e' la bozza W-14.
  const m46 = modello({ data: '2026-10-22', committente: BIANCHI, sostituto: false, riferimento: 'W-14', scadenza: '2026-11-21',
    righe: [{ d: 'Sopralluogo e rilievo: Impianto fotovoltaico', p: 250 }], causale: 'Sopralluogo e rilievo, impianto fotovoltaico. Rif. Wisper W-14' });
  file['IT00000000000_00046.xml.p7m'] = bustaDer(Buffer.from(xml(m46, '46/2026', '00046'), 'utf8'));

  // 3. 47/2026 a Elettrodinamica, fatta fuori da Wisper: ISO-8859-1, senza prefissi.
  const m47 = modello({ data: '2026-10-21', committente: ELETTRO, sostituto: true, scadenza: '2026-11-20',
    righe: [
      { d: 'Prestazioni professionali di settembre 2026 (6 rapportini)', q: 38, u: 'ore', p: 30 },
      { d: 'Rimborso chilometrico di settembre 2026', q: 312, u: 'km', p: 0.76 },
      { d: 'Spese di viaggio e materiale di settembre 2026', q: 1, p: 16.8 }],
    causale: 'Attività di settembre 2026' });
  const x47 = xml(m47, '47/2026', '00047')
    .replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0" encoding="ISO-8859-1"?>')
    .replace(/<p:FatturaElettronica [^>]*>/, '<FatturaElettronica versione="FPR12" xmlns="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">')
    .replace('</p:FatturaElettronica>', '</FatturaElettronica>');
  file['IT00000000000_00047.xml'] = Buffer.from(x47, 'latin1');

  // 4. 48/2026 a Rossi: la bozza W-15 senza il riferimento, prefisso ns2: ovunque, busta BER in base64.
  const m48 = modello({ data: '2026-10-22', committente: ROSSI, sostituto: true, scadenza: '2026-11-21', bollo: true,
    righe: [
      { d: '40% a fine progetto' + rif26ST003, p: 1520 },
      { d: 'Spesa anticipata per conto del cliente: Pratica di connessione al distributore del 14/10/2026', p: 120, natura: 'N1' },
      { d: 'Imposta di bollo', p: 2, natura: 'N1' }],
    causale: '40% a fine progetto, commessa 26ST003' });
  const x48 = xml(m48, '48/2026', '00048')
    .replace(/<p:FatturaElettronica ([^>]*)>/, (t, attr) => '<FatturaElettronica ' + attr.replace('xmlns:p=', 'xmlns:ns2=') + '>')
    .replace('</p:FatturaElettronica>', '</FatturaElettronica>')
    .replace(/<(\/?)([A-Za-z]\w*)(?=[\s>/])/g, (t, chiude, nome) => '<' + chiude + 'ns2:' + nome);
  file['IT00000000000_00048.xml.p7m'] = base64Righe(bustaBer(Buffer.from(x48, 'utf8')));

  // 5. 49/2026 a Rossi: solo i 1520 (manca la spesa anticipata): "diversa" dalla W-15.
  const m49 = modello({ data: '2026-10-22', committente: ROSSI, sostituto: true, scadenza: '2026-11-21',
    righe: [{ d: '40% a fine progetto' + rif26ST003, p: 1520 }], causale: '40% a fine progetto, commessa 26ST003' });
  file['IT00000000000_00049.xml'] = xml(m49, '49/2026', '00049');

  // 6. Nota di credito 3/2026 a Rossi: storna 200 della 45/2026.
  const m50 = modello({ tipo: 'TD04', data: '2026-10-23', committente: ROSSI, sostituto: true, senzaPagamento: true,
    righe: [{ d: 'Storno parziale: 30% alla firma, commessa 26ST003', p: 200 }], causale: 'Storno parziale della fattura 45/2026',
    collegate: [{ idDocumento: '45/2026', data: '2026-10-19' }] });
  file['IT00000000000_00050.xml'] = xml(m50, '3/2026', '00050');

  // 7. Un lotto: due fatture a Mario Bianchi nello stesso file.
  const m52 = modello({ data: '2026-10-24', committente: BIANCHI, scadenza: '2026-11-23', righe: [{ d: 'Consulenza impianto fotovoltaico', p: 100 }] });
  const m53 = modello({ data: '2026-10-24', committente: BIANCHI, scadenza: '2026-11-23', righe: [{ d: 'Pratica GSE', p: 200 }] });
  const x53 = xml(m53, '53/2026', '00052');
  const inizio = x53.indexOf('  <FatturaElettronicaBody>');
  const fine = x53.indexOf('</FatturaElettronicaBody>') + '</FatturaElettronicaBody>'.length;
  file['IT00000000000_00052.xml'] = xml(m52, '52/2026', '00052').replace('</p:FatturaElettronica>', x53.slice(inizio, fine) + '\n</p:FatturaElettronica>');

  // 8. Ricevuta di consegna della 45/2026.
  file['IT00000000000_00045_RC_001.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ns3:RicevutaConsegna xmlns:ns3="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/messaggi/v1.0" versione="1.0">',
    '  <IdentificativoSdI>111111111</IdentificativoSdI>',
    '  <NomeFile>IT00000000000_00045.xml</NomeFile>',
    '  <Hash>0000000000000000000000000000000000000000000000000000000000000000</Hash>',
    '  <DataOraRicezione>2026-10-19T10:00:00.000+02:00</DataOraRicezione>',
    '  <DataOraConsegna>2026-10-19T10:05:00.000+02:00</DataOraConsegna>',
    '  <Destinatario>',
    '    <Codice>0000000</Codice>',
    '    <Descrizione>Rossi Impianti Srl</Descrizione>',
    '  </Destinatario>',
    '  <MessageId>900000001</MessageId>',
    '</ns3:RicevutaConsegna>', ''].join('\n');

  // 9. Notifica di scarto della 46/2026.
  file['IT00000000000_00046_NS_001.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ns3:NotificaScarto xmlns:ns3="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/messaggi/v1.0" versione="1.0">',
    '  <IdentificativoSdI>222222222</IdentificativoSdI>',
    '  <NomeFile>IT00000000000_00046.xml.p7m</NomeFile>',
    '  <DataOraRicezione>2026-10-23T09:00:00.000+02:00</DataOraRicezione>',
    '  <ListaErrori>',
    '    <Errore>',
    '      <Codice>00404</Codice>',
    '      <Descrizione>Fattura duplicata</Descrizione>',
    '    </Errore>',
    '  </ListaErrori>',
    '  <MessageId>900000002</MessageId>',
    '</ns3:NotificaScarto>', ''].join('\n');

  // 10. Una fattura ricevuta da un fornitore nuovo (Comel), in busta DER.
  const mComel = modello({ prestatore: COMEL, committente: STUDIO_CLIENTE, data: '2026-10-20', cassa: null, scadenza: '2026-11-21',
    iban: 'IT02L0306911884100000001234', righe: [
      { d: 'Interruttori magnetotermici 2P 16A', q: 4, u: 'pz', p: 15 },
      { d: 'Morsetti a molla e canalina', q: 1, p: 36.38 }] });
  mComel.pagamento.dettagli[0].istituto = 'Banca del fornitore';
  file['IT09988776655_0A1B2.xml.p7m'] = bustaDer(Buffer.from(xml(mComel, '1301', '0A1B2'), 'utf8'));

  // 11. Una fattura ricevuta da un professionista, con la ritenuta che versa lo studio e senza data di scadenza.
  const mVerdi = modello({ prestatore: VERDI, committente: STUDIO_CLIENTE, data: '2026-10-18', sostituto: true, cassa: { tipo: 'TC04', aliquota: 4 },
    iban: 'IT40S0542811101000000654321', righe: [{ d: 'Consulenza calcoli strutturali quadro', p: 520 }] });
  mVerdi.pagamento.dettagli[0].istituto = 'Banca del professionista';
  file['IT01122334459_00015.xml'] = xml(mVerdi, '15', '00015');

  // 13. I metadati dell'invio (non servono: si scartano).
  file['IT00000000000_00045_MT_001.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ns3:MetadatiInvioFile xmlns:ns3="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/messaggi/v1.0" versione="1.0">',
    '  <IdentificativoSdI>111111111</IdentificativoSdI>',
    '  <NomeFile>IT00000000000_00045.xml</NomeFile>',
    '  <CodiceDestinatario>0000000</CodiceDestinatario>',
    '  <Formato>FPR12</Formato>',
    '  <TentativiInvio>1</TentativiInvio>',
    '  <MessageId>900000003</MessageId>',
    '</ns3:MetadatiInvioFile>', ''].join('\n');

  // 12. Uno zip con quattro fatture, una foto e uno zip dentro (questi due si scartano).
  const foto = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xFF, 0xD9]);
  const vecchie = scriviZip([{ nome: 'vecchia.xml', dati: '<x/>' }]);
  file['fatture-ottobre.zip'] = scriviZip([
    { nome: 'IT00000000000_00046.xml.p7m', dati: file['IT00000000000_00046.xml.p7m'] },
    { nome: 'IT00000000000_00047.xml', dati: file['IT00000000000_00047.xml'] },
    { nome: 'IT09988776655_0A1B2.xml.p7m', dati: file['IT09988776655_0A1B2.xml.p7m'] },
    { nome: 'IT00000000000_00045.xml', dati: Buffer.from(file['IT00000000000_00045.xml'], 'utf8') },
    { nome: 'foto.jpg', dati: foto },
    { nome: 'vecchie.zip', dati: vecchie },
  ]);
  return file;
}

if (require.main === module) {
  const file = genera();
  for (const nome of Object.keys(file)) fs.writeFileSync(path.join(QUI, nome), file[nome]);
  fs.writeFileSync(path.join(QUI, 'README.txt'), [
    'Fatture elettroniche di esempio per le prove della fase 4 (server/prove/fatturapa.test.js e le prove delle fatture).',
    'Sono dati inventati: nomi, partite IVA, IBAN e firme non sono di nessuno (le firme delle buste .p7m sono finte).',
    'Si rifanno con: node server/prove/xml/genera.js',
    ''].join('\n'));
  console.log('Scritti ' + Object.keys(file).length + ' file in ' + QUI);
}

module.exports = { genera, modello, bustaDer, bustaBer, STUDIO, STUDIO_CLIENTE, ELETTRO, ROSSI, BIANCHI, COMEL, VERDI, IBAN_STUDIO };
