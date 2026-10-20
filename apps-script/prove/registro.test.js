// Partite IVA, telefoni e il registro degli accessi, provati sul finto Google
// (finto-google.js), che legge le celle come Fogli: "0123" diventa 123.
//   node --test apps-script/prove
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const { contesto, fogli, proprieta, memoria, CARTELLA_POSTA } = require('./finto-google.js');

const CODICE = 'prova';
const TELEFONO = { disp: 'telefono-di-prova-1', dispNome: 'motorola edge 60 pro', app: 'telefono 0.3.3' };
const UFFICIO = { disp: 'ufficio-di-prova-1', dispNome: 'UFFICIO-PC (manuel)', app: 'ufficio 0.3.3' };

function scrivi(azione, dati, chi) {
  const corpo = Object.assign({ codice: CODICE, azione }, chi || UFFICIO, dati);
  return JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify(corpo) } }).testo);
}
function leggi(parametri, chi) {
  return JSON.parse(contesto.doGet({ parameter: Object.assign({ codice: CODICE }, chi || UFFICIO, parametri) }).testo);
}
function righe(nome) {
  const f = fogli.get(nome);
  return f ? f.celle.slice(1) : [];
}
function colonna(nome, intestazione) {
  return fogli.get(nome).celle[0].indexOf(intestazione);
}
function email() {
  return fs.readdirSync(CARTELLA_POSTA).sort().map(d => fs.readFileSync(path.join(CARTELLA_POSTA, d, 'email.txt'), 'utf8'));
}
function dimenticaAvvisi() {
  for (const k of Array.from(proprieta.keys())) if (k.startsWith('AVVISO_')) proprieta.delete(k);
  memoria.clear();
}

// ------------------------------------------------------------------ partite IVA e telefoni

test('una partita IVA con lo zero davanti resta com\'e\', anche nella cella', () => {
  const r = scrivi('creaCliente', { nome: 'Zero Davanti Srl', partitaIva: '01234567890', telefono: '0445123456' });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.cliente.partitaIva, '01234567890');
  assert.equal(r.cliente.telefono, '0445123456');
  const riga = righe('Clienti').find(x => x.includes('Zero Davanti Srl'));
  assert.equal(riga[colonna('Clienti', 'PARTITA_IVA')], '01234567890');
  assert.equal(riga[colonna('Clienti', 'TELEFONO')], '0445123456');
});

test('cambiare l\'email di un cliente non toglie lo zero alla sua partita IVA', () => {
  const c = scrivi('creaCliente', { nome: 'Email Nuova Snc', partitaIva: '00987654321' }).cliente;
  const r = scrivi('aggiornaCliente', { id: c.id, campi: { email: 'nuova@example.com' } });
  assert.equal(r.cliente.partitaIva, '00987654321');
  const riga = righe('Clienti').find(x => x.includes('Email Nuova Snc'));
  assert.equal(riga[colonna('Clienti', 'PARTITA_IVA')], '00987654321');
});

test('la partita IVA dello studio, nelle impostazioni, tiene lo zero', () => {
  const r = scrivi('salvaImpostazioni', { valori: { PARTITA_IVA: '04567890123', TELEFONO: '+39 333 1234567' } });
  assert.equal(r.impostazioni.PARTITA_IVA, '04567890123');
  assert.equal(r.impostazioni.TELEFONO, '+39 333 1234567');
});

test('quelle gia\' diventate numeri si leggono giuste, e riparaTesti le rimette testo nel foglio', () => {
  const c = scrivi('creaCliente', { nome: 'Vecchio Numero Spa' }).cliente;
  const f = fogli.get('Clienti');
  const n = f.celle.findIndex(x => x.includes('Vecchio Numero Spa'));
  f.celle[n][colonna('Clienti', 'PARTITA_IVA')] = 1234567890;   // era "01234567890"
  f.celle[n][colonna('Clienti', 'TELEFONO')] = 445123456;       // era "0445123456"
  let letto = leggi({}).clienti.find(x => x.id === c.id);
  assert.equal(letto.partitaIva, '01234567890');
  assert.equal(letto.telefono, '0445123456');
  assert.equal(contesto.riparaTesti() >= 1, true);
  assert.equal(f.celle[n][colonna('Clienti', 'PARTITA_IVA')], '01234567890');
  assert.equal(f.celle[n][colonna('Clienti', 'TELEFONO')], '0445123456');
  assert.equal(contesto.riparaTesti(), 0, 'la seconda volta non c\'e\' piu\' niente da riparare');
});

test('telefoni diventati numeri: il fisso riprende lo 0, il +39 torna, il cellulare resta', () => {
  assert.equal(contesto.telefonoDalFoglio(445123456), '0445123456');
  assert.equal(contesto.telefonoDalFoglio(393331234567), '+393331234567');
  assert.equal(contesto.telefonoDalFoglio(3331234567), '3331234567');
  assert.equal(contesto.telefonoDalFoglio('0445 123456'), '0445 123456');
  assert.equal(contesto.partitaIvaDalFoglio(12345678901), '12345678901');
  assert.equal(contesto.partitaIvaDalFoglio(''), '');
});

test('una descrizione che comincia con "=" o "-" resta testo, non diventa una formula', () => {
  const r = scrivi('salvaRapportino', { rapportino: {
    idLocale: 'formula-1', data: '2026-10-16', cliente: 'Rossi Impianti Srl', tariffa: 40, oreLavoro: 1,
    descrizione: '=IMPORTXML("http://example.com")', ticket: '000123',
  } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.rapportino.descrizione, '=IMPORTXML("http://example.com")');
  assert.equal(r.rapportino.ticket, '000123');
});

// ------------------------------------------------------------------ registro degli accessi

test('ogni richiesta lascia una riga negli Accessi, con il dispositivo', () => {
  const prima = righe('Accessi').length;
  leggi({ azione: 'rapportini', da: '2026-10-01', a: '2026-10-31' }, TELEFONO);
  const ultima = righe('Accessi').slice(-1)[0];
  assert.equal(righe('Accessi').length, prima + 1);
  assert.equal(ultima[1], 'ok');
  assert.equal(ultima[2], 'rapportini');
  assert.equal(ultima[3], 'motorola edge 60 pro');
  assert.equal(ultima[4], 'telefono 0.3.3');
  assert.equal(ultima[5], 'telefono-di-prova-1');
});

test('un dispositivo nuovo finisce in Dispositivi e manda un avviso, una volta sola', () => {
  dimenticaAvvisi();
  const nuovo = { disp: 'mai-visto-1', dispNome: 'Telefono Sconosciuto', app: 'telefono 0.3.3' };
  const prima = email().length;
  leggi({}, nuovo);
  memoria.clear();   // anche dopo i 10 minuti in cui non lo si riguarda
  leggi({}, nuovo);
  const riga = righe('Dispositivi').filter(x => x[0] === 'mai-visto-1');
  assert.equal(riga.length, 1);
  assert.equal(riga[0][1], 'Telefono Sconosciuto');
  const nuove = email().slice(prima);
  assert.equal(nuove.length, 1);
  assert.match(nuove[0], /Oggetto: Wisper: un dispositivo nuovo/);
  assert.match(nuove[0], /A: proprietario@example.com/);
  assert.match(nuove[0], /Telefono Sconosciuto/);
});

test('i codici sbagliati si registrano, mai il codice; dal quinto arriva un avviso', () => {
  dimenticaAvvisi();
  const prima = email().length;
  for (let i = 0; i < 6; i++) {
    const r = JSON.parse(contesto.doGet({ parameter: { codice: 'indovina' + i, disp: 'ladro', dispNome: 'curl' } }).testo);
    assert.equal(r.ok, false);
    assert.equal(r.errore, 'Codice sbagliato');
  }
  const sbagliate = righe('Accessi').filter(x => x[1] === 'codice sbagliato');
  assert.equal(sbagliate.length >= 6, true);
  assert.equal(righe('Dispositivi').some(x => x[0] === 'ladro'), false, 'chi sbaglia il codice non diventa un dispositivo');
  const nuove = email().slice(prima);
  assert.equal(nuove.length, 1, 'un avviso solo, non uno per tentativo');
  assert.match(nuove[0], /Oggetto: Wisper: tanti codici sbagliati/);
  const tutto = JSON.stringify(fogli.get('Accessi').celle);
  assert.equal(tutto.includes('indovina'), false);
  assert.equal(tutto.includes('"' + CODICE + '"'), false);
});

test('dopo 50 codici sbagliati in un\'ora si contano e basta: il foglio non si riempie', () => {
  memoria.clear();
  const prima = righe('Accessi').length;
  for (let i = 0; i < 80; i++) contesto.doGet({ parameter: { codice: 'x' + i } });
  assert.equal(righe('Accessi').length - prima, 50);
});

test('richiesta senza nome col codice giusto: niente avviso finche\' i dispositivi sono appena arrivati', () => {
  dimenticaAvvisi();
  const prima = email().length;
  JSON.parse(contesto.doGet({ parameter: { codice: CODICE } }).testo);
  assert.equal(righe('Accessi').slice(-1)[0][3], 'senza nome');
  assert.equal(email().length, prima);
});

test('richiesta senza nome quando le app nuove ci sono da giorni: un avviso al giorno', () => {
  dimenticaAvvisi();
  const f = fogli.get('Dispositivi');
  f.celle[1][3] = new Date(Date.now() - 3 * 24 * 3600 * 1000);   // PRIMO_ACCESSO tre giorni fa
  const prima = email().length;
  contesto.doGet({ parameter: { codice: CODICE } });
  contesto.doGet({ parameter: { codice: CODICE } });
  const nuove = email().slice(prima);
  assert.equal(nuove.length, 1);
  assert.match(nuove[0], /Oggetto: Wisper: un accesso senza nome/);
});

test('un nome che comincia con "=" non diventa una formula nel registro', () => {
  leggi({}, { disp: 'formula-disp', dispNome: '=HYPERLINK("http://x")', app: 'x' });
  const ultima = righe('Accessi').slice(-1)[0];
  assert.equal(ultima[3], '=HYPERLINK("http://x")');
});

test('le schede Accessi e Dispositivi hanno le loro intestazioni', () => {
  assert.deepEqual(fogli.get('Accessi').celle[0], ['QUANDO', 'ESITO', 'AZIONE', 'DISPOSITIVO', 'APP', 'ID_DISPOSITIVO']);
  assert.deepEqual(fogli.get('Dispositivi').celle[0], ['ID_DISPOSITIVO', 'NOME', 'APP', 'PRIMO_ACCESSO', 'ULTIMO_ACCESSO', 'NOTE']);
});

// ------------------------------------------------------------------ collegare il computer

test('collegare il computer: un\'email al proprietario col file di collegamento', () => {
  const prima = fs.readdirSync(CARTELLA_POSTA).length;
  const r = scrivi('collegaComputer', { url: 'https://script.google.com/macros/s/AKfyc-prova_123/exec' }, TELEFONO);
  assert.equal(r.ok, true, r.errore);
  assert.equal(r.a, 'proprietario@example.com');
  const cartelle = fs.readdirSync(CARTELLA_POSTA).sort();
  assert.equal(cartelle.length, prima + 1);
  const dir = path.join(CARTELLA_POSTA, cartelle[cartelle.length - 1]);
  const testo = fs.readFileSync(path.join(dir, 'email.txt'), 'utf8');
  assert.match(testo, /^A: proprietario@example\.com/);
  assert.match(testo, /Oggetto: Collega Wisper Ufficio al foglio/);
  assert.match(testo, /motorola edge 60 pro/);
  // La stessa email installa anche il programma: il link all'ultima versione pubblicata.
  assert.match(testo, /https:\/\/github\.com\/postagaspa-star\/wisper\/releases\/latest\/download\/WisperUfficio\.exe/);
  const file = JSON.parse(fs.readFileSync(path.join(dir, 'Collega Wisper Ufficio.wisper'), 'utf8'));
  assert.deepEqual(file, { tipo: 'wisper-collegamento', versione: 1, url: 'https://script.google.com/macros/s/AKfyc-prova_123/exec', codice: CODICE });
});

test('collegare il computer: un indirizzo strano si rifiuta, e senza codice niente email', () => {
  assert.equal(scrivi('collegaComputer', { url: 'https://example.com/ruba' }).ok, false);
  const r = JSON.parse(contesto.doPost({ postData: { contents: JSON.stringify({ codice: 'sbagliato', azione: 'collegaComputer', url: 'https://script.google.com/macros/s/x/exec' }) } }).testo);
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'Codice sbagliato');
});
