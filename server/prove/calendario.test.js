// Fase 8 (fase8.md §5, §16): il calendario in altre app. Il file dei dati di prova con l'orologio fermo uguale a
// server/prove/ics/atteso-manuel.ics; un lettore minimo controlla CRLF, righe di al massimo 75 byte senza caratteri
// spezzati, UID e DTSTAMP in ogni evento, giorni interi con la fine esclusa, l'ora legale (29/03 e 25/10), testi con
// virgole, punti e virgola, a capo e accenti, nessun euro e nessun importo; i feed: chiave giusta, sbagliata, tolta,
// utente disattivato (404 uguali), permesso tolto, 304, 61 letture -> 429, senza dettagli niente LOCATION e DESCRIPTION.
// Il feed pubblico fuori casa (script del portale) sta in calendario-google.test.js.
//   node --test server/prove/            (WISPER_RIFAI_ICS=si riscrive il file atteso, dopo averlo guardato)
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spegniOrologioDiProva } = require('../src/utili');
const { creaIcs, controllaIcs, leggiIcs, piega } = require('../src/calendario');

// L'orologio fermo: giovedi' 22/10/2026 alle 10:00 (i dati di esempio e il DTSTAMP sempre uguali), qualunque giorno sia
// (anche con WISPER_OGGI_PROVA di prove-giorni: qui l'orologio di prova resta spento).
delete process.env.WISPER_OGGI_PROVA;
const ORA = Date.parse('2026-10-22T10:00:00+02:00');
spegniOrologioDiProva();
test.mock.timers.enable({ apis: ['Date'], now: ORA });
const { serverDiProva } = require('./aiuto');

const ATTESO = path.join(__dirname, 'ics', 'atteso-manuel.ics');
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let manuel;
let idApp = {};
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  // Due appuntamenti col cambio dell'ora (25/10/2026 e 29/03/2027) e un'attivita' con un testo difficile.
  const app = (titolo, inizio, fine, luogo, descrizione) => ok(Object.assign({}, s.wisper.come({ utente: s.wisper.titolare(), permessi: s.wisper.permessiDi('titolare') },
    () => s.wisper.db.transazione(() => s.wisper.salvaAttivita({ conferma: true, attivita: { titolo, tipo: 'appuntamento', inizio, fine, luogo, descrizione, assegnataA: s.wisper.titolare().id } })))));
  idApp.ottobre = app('Riunione di cantiere, Batokyo', '2026-10-25T09:00:00', '2026-10-25T10:30:00', 'Via dell\'Esempio 10; Schio (VI)', 'Portare: schemi, tester\ne il verbale; però non l\'offerta').attivita.id;
  idApp.marzo = app('Collaudo quadro QG2', '2027-03-29T09:00:00', '', 'Capannone Rossi', 'Collaudo con l\'impresa').attivita.id;
});
test.after(async () => {
  await s.ferma();
  test.mock.timers.reset();
});

test('le regole del formato: piega a 75 byte senza spezzare un carattere, testi con \\ ; , e a capo', () => {
  const lunga = 'DESCRIPTION:' + 'àèìòù€'.repeat(30);
  const p = piega(lunga);
  for (const r of p.split('\r\n')) assert.ok(Buffer.byteLength(r) <= 75, 'riga di ' + Buffer.byteLength(r) + ' byte');
  assert.equal(p.split('\r\n').map((r, i) => (i ? r.slice(1) : r)).join(''), lunga, 'spiegata torna uguale');
  assert.ok(!/�/.test(p));
  const ics = creaIcs({ nome: 'Prova', ora: new Date(ORA), eventi: [{ uid: 'x@wisper', giorno: '2026-12-31', titolo: 'a\\b;c,d\ne', categoria: 'Attività' }] });
  assert.deepEqual(controllaIcs(ics), []);
  assert.match(ics, /\r\nSUMMARY:a\\\\b\\;c\\,d\\ne\r\n/);
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n/, 'la fine esclusa, anche a cavallo dell\'anno');
});

test('il file di Manuel coi dati di prova e l\'orologio fermo e\' uguale a server/prove/ics/atteso-manuel.ics', async () => {
  const r = ok(await manuel('esportaCalendario', { cosa: 'mie', assenze: true, scadenze: true }));
  assert.equal(r.nome, 'wisper-calendario-manuel-2026-10-22.ics');
  assert.equal(r.mime, 'text/calendar;charset=utf-8');
  const ics = Buffer.from(r.base64, 'base64').toString('utf8');
  assert.equal(leggiIcs(ics).eventi.length, r.eventi);
  if (process.env.WISPER_RIFAI_ICS === 'si') fs.writeFileSync(ATTESO, ics);
  assert.equal(ics, fs.readFileSync(ATTESO, 'utf8'));
});

test('il lettore minimo: CRLF, 75 byte, UID e DTSTAMP, giorni interi, ora legale, testi, niente soldi, niente promemoria', async () => {
  const r = ok(await manuel('esportaCalendario', { cosa: 'mie', assenze: true, scadenze: true }));
  const ics = Buffer.from(r.base64, 'base64').toString('utf8');
  assert.deepEqual(controllaIcs(ics), []);
  assert.notEqual(ics.charCodeAt(0), 0xFEFF, 'senza BOM');
  const { righe, eventi } = leggiIcs(ics);
  assert.ok(righe.includes('BEGIN:VTIMEZONE') && righe.includes('TZID:Europe/Rome') && righe.includes('METHOD:PUBLISH'));
  assert.ok(righe.includes('NAME:Wisper · Manuel Gasparotto'));
  assert.ok(eventi.length >= 5);
  for (const e of eventi) {
    assert.match(e.UID, /^(attivita|assenza|chiusura|scadenza)-\d+(-\d{8})?@wisper$/);
    assert.match(e.DTSTAMP, /^20261022T080000Z$/, 'DTSTAMP in UTC: le 10:00 italiane');
    assert.ok(['CONFIRMED', 'CANCELLED'].includes(e.STATUS));
  }
  assert.equal(new Set(eventi.map(e => e.UID)).size, eventi.length, 'lo stesso evento ha sempre lo stesso UID, una volta sola');
  // L'ora legale: alle 9:00 italiane, prima e dopo il cambio dell'ora.
  const ott = eventi.find(e => e.UID === 'attivita-' + idApp.ottobre + '@wisper');
  assert.deepEqual([ott.DTSTART, ott.DTEND, ott.TRANSP, ott.CATEGORIES], ['TZID=Europe/Rome:20261025T090000', 'TZID=Europe/Rome:20261025T103000', 'OPAQUE', 'Appuntamento']);
  const mar = eventi.find(e => e.UID === 'attivita-' + idApp.marzo + '@wisper');
  assert.deepEqual([mar.DTSTART, mar.DTEND], ['TZID=Europe/Rome:20270329T090000', 'TZID=Europe/Rome:20270329T100000'], 'senza fine, un\'ora');
  // I testi difficili tornano uguali, spiegati.
  assert.equal(ott.SUMMARY, 'Riunione di cantiere, Batokyo');
  assert.equal(ott.LOCATION, 'Via dell\'Esempio 10; Schio (VI)');
  assert.match(ott.DESCRIPTION, /^Portare: schemi, tester\ne il verbale; però non l'offerta\nSi cambia in Wisper, non qui\.$/);
  // I giorni interi: VALUE=DATE con la fine il giorno dopo, TRANSPARENT; "Da fare: " davanti alle attivita' senza ora.
  const intere = eventi.filter(e => /^VALUE=DATE:/.test(e.DTSTART));
  assert.ok(intere.length >= 2);
  for (const e of intere) {
    const g = e.DTSTART.split(':')[1];
    assert.ok(e.DTEND.split(':')[1] > g, e.UID);
    assert.equal(e.TRANSP, 'TRANSPARENT');
  }
  assert.ok(eventi.some(e => /^Da fare: /.test(e.SUMMARY) && e.CATEGORIES === 'Attività'));
  assert.ok(eventi.some(e => e.CATEGORIES === 'Scadenza' && /^Scadenza: /.test(e.SUMMARY)), 'le scadenze come eventi di un giorno');
  // Mai soldi, mai promemoria.
  assert.doesNotMatch(ics, /€|EUR\b|\d+,\d\d €|VALARM|TRIGGER/);
});

test('il feed dello studio: con attivita 2 e non collaboratore, i nomi tra parentesi e "(da assegnare)"; il collaboratore no', async () => {
  const r = ok(await manuel('esportaCalendario', { cosa: 'studio' }));
  const { eventi, righe } = leggiIcs(Buffer.from(r.base64, 'base64').toString('utf8'));
  assert.ok(righe.includes('NAME:Wisper · Studio Tecnico GM'));
  assert.ok(eventi.some(e => / \(Marco Rossato\)$/.test(e.SUMMARY)));
  assert.ok(eventi.some(e => / \(da assegnare\)$/.test(e.SUMMARY)));
  const marco = await s.come('marco@esempio.it');
  const no = await marco('esportaCalendario', { cosa: 'studio' });
  assert.deepEqual([no.ok, no.permesso], [false, false]);
  const sue = ok(await marco('esportaCalendario', { cosa: 'mie' }));
  assert.ok(leggiIcs(Buffer.from(sue.base64, 'base64').toString('utf8')).eventi.every(e => !/\(/.test(e.SUMMARY)));
});

test('gli indirizzi: si creano (al massimo 5), la chiave si vede una volta; GET senza Bearer; 404 uguali per chiave sbagliata, tolta, utente disattivato', async () => {
  const nuovo = ok(await manuel('nuovoFeed', { nome: 'Telefono di prova', cosa: { attivita: 'mie', assenze: true, scadenze: true } }));
  assert.match(nuovo.indirizzo, /^http:\/\/127\.0\.0\.1:\d+\/calendario\/[A-Za-z0-9_-]{43}\.ics$/, 'schema e Host della richiesta');
  assert.equal(nuovo.webcal, nuovo.indirizzo.replace('http://', 'webcal://'));
  const chiave = nuovo.indirizzo.match(/calendario\/(.+)\.ics$/)[1];
  const elenco = ok(await manuel('feedCalendario'));
  assert.ok(elenco.feed.some(f => f.id === nuovo.feed.id && f.ultimoUso === '' && f.dettagli === true));
  assert.ok(JSON.stringify(elenco).indexOf(chiave) < 0, 'la chiave non torna piu\'');
  assert.ok(s.wisper.db.riga('SELECT token_hash FROM calendario_feed WHERE id = ?', nuovo.feed.id).token_hash.length === 64, 'nel database solo lo SHA-256');
  const r = await fetch(nuovo.indirizzo, { headers: { 'User-Agent': 'ICSx5/2.4.3 (prova)' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/calendar; charset=utf-8$/);
  assert.equal(r.headers.get('cache-control'), 'private, max-age=0');
  assert.ok(r.headers.get('etag') && r.headers.get('last-modified'));
  const corpo = await r.text();
  assert.deepEqual(controllaIcs(corpo), []);
  const f = s.wisper.db.riga('SELECT * FROM calendario_feed WHERE id = ?', nuovo.feed.id);
  assert.deepEqual([f.letture, f.agente.slice(0, 10)], [1, 'ICSx5/2.4.']);
  assert.ok(s.wisper.db.riga("SELECT id FROM accessi WHERE azione = 'calendario' AND esito = 'ok'"));
  // 304 con If-None-Match.
  const r2 = await fetch(nuovo.indirizzo, { headers: { 'If-None-Match': r.headers.get('etag') } });
  assert.equal(r2.status, 304);
  // 404 uguali: chiave sbagliata, tolta, utente disattivato.
  const corpo404 = async u => { const x = await fetch(u); return [x.status, await x.text()]; };
  const sbagliata = await corpo404(nuovo.indirizzo.replace(chiave, 'A'.repeat(43)));
  assert.deepEqual(sbagliata, [404, 'Non trovato']);
  const laura = await s.come('laura@esempio.it');
  const suo = ok(await laura('nuovoFeed', { nome: 'Outlook in ufficio', cosa: { attivita: 'mie' } }));
  ok(await laura('revocaFeed', { id: suo.feed.id }));
  assert.deepEqual(await corpo404(suo.indirizzo), sbagliata, 'tolta');
  const altro = ok(await laura('nuovoFeed', { nome: 'Telefono di Laura', cosa: { attivita: 'mie' } }));
  s.wisper.db.esegui("UPDATE utenti SET attivo = 0 WHERE email = 'laura@esempio.it'");
  assert.deepEqual(await corpo404(altro.indirizzo), sbagliata, 'utente disattivato');
  s.wisper.db.esegui("UPDATE utenti SET attivo = 1 WHERE email = 'laura@esempio.it'");
  // Al massimo 5 a persona; il nome serve.
  assert.equal((await manuel('nuovoFeed', { nome: '', cosa: {} })).errore, 'Nome: scrivi un nome per riconoscerlo');
  for (let i = 0; i < 3; i++) ok(await manuel('nuovoFeed', { nome: 'Altro ' + i, cosa: {} }));
  assert.equal((await manuel('nuovoFeed', { nome: 'Il sesto', cosa: {} })).errore, 'Hai già 5 indirizzi: togline uno');
  // Il feed pubblico fuori casa non si crea finche' il calendario fuori casa e' spento.
  assert.equal((await laura('nuovoFeed', { nome: 'Google', cosa: {}, pubblico: true })).errore, 'Il calendario fuori casa non è acceso');
});

test('60 letture in un\'ora per chiave, la 61esima risponde 429', async () => {
  const marco = await s.come('marco@esempio.it');
  const f = ok(await marco('nuovoFeed', { nome: 'Telefono di Marco', cosa: { attivita: 'mie' } }));
  for (let i = 0; i < 60; i++) assert.equal((await fetch(f.indirizzo)).status, 200, 'lettura ' + (i + 1));
  const r = await fetch(f.indirizzo);
  assert.equal(r.status, 429);
});

test('il contenuto coi permessi di oggi: tolto un permesso, alla lettura dopo quelle cose escono; senza dettagli niente luogo e descrizione', async () => {
  const laura = await s.come('laura@esempio.it');
  const f = ok(await laura('nuovoFeed', { nome: 'Senza dettagli', cosa: { attivita: 'studio', scadenze: true }, dettagli: false }));
  const prima = leggiIcs(await (await fetch(f.indirizzo)).text()).eventi;
  assert.ok(prima.some(e => e.CATEGORIES === 'Scadenza'));
  for (const e of prima) {
    assert.equal(e.LOCATION, undefined);
    assert.equal(e.DESCRIPTION, undefined);
    assert.ok(['Appuntamento', 'Sopralluogo', 'Intervento', 'Attività', 'Assenza', 'Scadenza', 'Chiusura'].includes(e.SUMMARY), e.SUMMARY);
  }
  // L'amministrazione perde i documenti: le scadenze escono subito. Poi le attivita' dello studio: resta il feed con le sue.
  ok(await manuel('salvaPermessi', { permessi: { amministrazione: { documenti: 0 } } }));
  const dopo = leggiIcs(await (await fetch(f.indirizzo)).text()).eventi;
  assert.ok(!dopo.some(e => e.CATEGORIES === 'Scadenza'));
  ok(await manuel('salvaPermessi', { permessi: { amministrazione: { attivita: 1 } } }));
  const sue = await fetch(f.indirizzo);
  assert.equal(sue.status, 200);
  assert.ok(leggiIcs(await sue.text()).eventi.length <= dopo.length);
  ok(await manuel('salvaPermessi', { permessi: { amministrazione: { documenti: 2, attivita: 2 } } }));
});

test('in casa (8400) un feed pubblico risponde come gli altri; dal router del portale solo coi feed pubblici e CALENDARIO_PUBBLICO acceso', async () => {
  const w = s.wisper;
  const io = w.titolare();
  const chiave = 'ChiaveDelFeedPubblicoDiProva0123456789abcd';
  const chiaveCasa = 'ChiaveDelFeedDiCasaDiProva0123456789abcdef';
  w.db.esegui("INSERT INTO calendario_feed (utente_id, nome, token_hash, cosa, dettagli, pubblico, creato) VALUES (?, 'Google', ?, '{\"attivita\":\"mie\"}', 0, 1, ?)",
    io.id, require('../src/utili').sha256(chiave), require('../src/utili').adesso());
  w.db.esegui("INSERT INTO calendario_feed (utente_id, nome, token_hash, cosa, dettagli, pubblico, creato) VALUES (?, 'Casa', ?, '{\"attivita\":\"mie\"}', 1, 0, ?)",
    io.id, require('../src/utili').sha256(chiaveCasa), require('../src/utili').adesso());
  assert.equal((await fetch(s.url + '/calendario/' + chiave + '.ics')).status, 200, 'in casa risponde come gli altri');
  const lavoro = k => ({ v: 1, strada: 'calendario', metodo: 'GET', corpo: { chiave: k }, agente: 'fuori casa' });
  // Il portale spento: niente (il router risponde "non attivo"); acceso ma CALENDARIO_PUBBLICO spento: niente.
  let r = await w.portale.richiesta(lavoro(chiave));
  assert.equal(r.ok, false);
  w.db.transazione(() => w.salvaImpostazioni({ PORTALE_ATTIVO: true }));
  r = await w.portale.richiesta(lavoro(chiave));
  assert.deepEqual([r.ok, r.stato, r.errore], [false, 404, 'Indirizzo del calendario non valido']);
  w.db.transazione(() => w.come(require('../src/wisper').SISTEMA, () => w.salvaImpostazioni({ CALENDARIO_PUBBLICO: true })));
  r = await w.portale.richiesta(lavoro(chiave));
  assert.equal(r.ok, true);
  assert.match(r.ics, /^BEGIN:VCALENDAR\r\n/);
  assert.doesNotMatch(r.ics, /\r\n(LOCATION|DESCRIPTION):/, 'nasce senza dettagli');
  // Un feed di casa (non pubblico) dal portale: niente, anche col calendario fuori casa acceso.
  r = await w.portale.richiesta(lavoro(chiaveCasa));
  assert.deepEqual([r.ok, r.stato], [false, 404]);
  w.db.transazione(() => w.come(require('../src/wisper').SISTEMA, () => w.salvaImpostazioni({ CALENDARIO_PUBBLICO: false, PORTALE_ATTIVO: false })));
  r = await w.portale.richiesta(lavoro(chiave));
  assert.equal(r.ok, false, 'spento CALENDARIO_PUBBLICO si chiude subito');
});
