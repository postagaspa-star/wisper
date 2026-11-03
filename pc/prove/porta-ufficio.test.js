// La porta Google dal lato di Wisper Ufficio (docs/gestionale/porta-google.md), provata con Node:
//  - le parole del collegamento (pc/ui/regole-collegamento.js);
//  - le regole del collegamento (pc/prove/porta-ufficio.js, le stesse di pc/WisperUfficio/Server.cs, che
//    prova-porta-exe.js prova sull'exe) contro il finto Google con Porta.gs e un server di prova collegato,
//    col rimbalzo 302 come Google e una "casa" finta che si spegne, perde risposte o è un altro apparecchio.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const K = require('../ui/regole-collegamento.js');
const { Collegamento, firmaAttesa, indirizzoGoogle, MASSIMO_DA_GOOGLE, TROPPO_GRANDE } = require('./porta-ufficio.js');
const { avviaPorta } = require('./porta-di-prova.js');

// ------------------------------------------------------------------ le parole

test('la frase del collegamento: "Da fuori: Google · In casa: 192.168.1.51 · ultimo contatto alle …"', () => {
  const adesso = new Date(2026, 9, 31, 11, 0, 0);
  assert.equal(K.frase({ casa: 'http://192.168.1.51:8400', google: true, ultimoContatto: '2026-10-31T10:42:03', ultimaStrada: 'casa' }, { adesso }),
    'Da fuori: Google · In casa: 192.168.1.51 · ultimo contatto alle 10:42 in ufficio');
  assert.equal(K.frase({ casa: 'http://192.168.1.51:8400', google: true, ultimoContatto: '2026-10-31T09:05:00', ultimaStrada: 'google' }, { adesso }),
    'Da fuori: Google · In casa: 192.168.1.51 · ultimo contatto alle 9:05 via Google');
  assert.equal(K.frase({ casa: 'http://192.168.1.51:8400', google: true }), 'Da fuori: Google · In casa: 192.168.1.51', 'senza contatto, senza la terza parte');
  assert.equal(K.frase({ casa: 'http://192.168.1.51:8400', google: false }), 'Da fuori: non collegato · In casa: 192.168.1.51', 'senza Google: solo casa, come prima');
  assert.equal(K.frase({ casa: '', google: true }), 'Da fuori: Google · In casa: non collegato');
  assert.equal(K.frase({ casa: 'http://127.0.0.1:54321', google: true, ultimoContatto: '2026-10-30T18:03:00' }, { adesso }), 'Da fuori: Google · In casa: 127.0.0.1:54321 · ultimo contatto ieri alle 18:03');
  assert.equal(K.quando('2026-10-29T18:03:00', adesso), 'il 29/10 alle 18:03');
  assert.equal(K.frase({ casa: 'http://192.168.1.51:8400', google: true, ultimoContatto: '2026-10-31T10:42:03' }, { ultimo: false, adesso }), 'Da fuori: Google · In casa: 192.168.1.51');
  assert.equal(K.casaBreve('https://wisper.esempio.it/'), 'wisper.esempio.it');
  // Niente punti esclamativi, niente indirizzo dello script: della porta Google si dice solo "Google".
  assert.ok(!/!|script\.google/.test(K.frase({ casa: 'x', google: true })));
});

test('gli errori della pagina di accesso: le parole di Google restano come sono', () => {
  const spento = Object.assign(new Error('Il server dello studio non risponde dalle 10:42: riprova più tardi'), { rete: true, dati: { porta: 'spento' } });
  assert.equal(K.erroreAccesso(spento), 'Il server dello studio non risponde dalle 10:42: riprova più tardi');
  assert.equal(K.erroreAccesso(Object.assign(new Error('Errore 502'), { rete: true })), 'Il server non risponde: controlla la rete e riprova.');
  assert.equal(K.erroreAccesso(new Error('Email o password sbagliate.')), 'Email o password sbagliate.');
});

test('l\'indirizzo Google: solo uno script (o il finto Google sul computer), mai altro', () => {
  assert.equal(indirizzoGoogle('https://script.google.com/macros/s/AKfycb_x-1/exec'), 'https://script.google.com/macros/s/AKfycb_x-1/exec');
  assert.equal(indirizzoGoogle(' https://script.google.com/macros/s/AKfycb_x-1/exec/ '), 'https://script.google.com/macros/s/AKfycb_x-1/exec');
  assert.equal(indirizzoGoogle('https://script.google.com/macros/s/AKfycb_x-1'), 'https://script.google.com/macros/s/AKfycb_x-1/exec', 'senza /exec si aggiunge');
  assert.equal(indirizzoGoogle('https://script.google.com/a/macros/studio.it/s/AKfy/exec'), 'https://script.google.com/a/macros/studio.it/s/AKfy/exec');
  assert.equal(indirizzoGoogle('http://127.0.0.1:8766/exec'), 'http://127.0.0.1:8766/exec');
  for (const no of ['https://example.com/ruba/exec', 'http://script.google.com/macros/s/x/exec', 'https://script.google.com/macros/s/x/dev', 'http://192.168.1.51:8400/exec', '', 'javascript:alert(1)']) {
    assert.equal(indirizzoGoogle(no), null, no);
  }
});

test('la firma di casa: HMAC-SHA256 con chiave lo SHA-256 del token in esadecimale (come server/prove/porta.test.js)', () => {
  const token = 'token-di-prova';
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  assert.equal(firmaAttesa(token, 'abc'), crypto.createHmac('sha256', hash).update('abc').digest('hex'));
  assert.match(firmaAttesa(token, 'abc'), /^[0-9a-f]{64}$/);
});

// ------------------------------------------------------------------ col finto Google e il server di prova

let p;
test.before(async () => { p = await avviaPorta(); });
test.after(async () => { if (p) await p.ferma(); });

const conta = (tabella, colonna, valore) => p.wisper.db.riga('SELECT COUNT(*) n FROM ' + tabella + ' WHERE ' + colonna + ' = ?', valore).n;
const dormi = ms => new Promise(r => setTimeout(r, ms));

test('fuori casa (solo Google): entra, legge, salva un rapportino, carica e scarica un file, col rimbalzo 302', async () => {
  const c = new Collegamento({ google: p.google });
  const prima = Object.assign({}, p.rimbalzi);
  const a = await c.accedi('manuel@esempio.it', 'prova');
  assert.equal(a.ok, true, a.errore);
  assert.equal(a.utente.nome, 'Manuel Gasparotto');
  const io = await c.leggi('io', []);
  assert.equal(io.ok, true, io.errore);
  const rap = await c.leggi('rapportini', [['tutti', '1']]);
  assert.ok(rap.rapportini.length > 0);
  const idLocale = 'porta-pc-' + crypto.randomBytes(4).toString('hex');
  const s = await c.scrivi('salvaRapportino', { rapportino: { idLocale, data: '2026-10-30', idCliente: 'C002', descrizione: 'Dal computer fuori casa', oreLavoro: 2, tariffa: 40 } });
  assert.equal(s.ok, true, s.errore);
  assert.equal(conta('rapportini', 'id_locale', idLocale), 1);
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(700 * 1024)]);
  const su = await c.carica(pdf, { nome: 'Scontrino.pdf', mime: 'application/pdf', per: 'documento' });
  assert.equal(su.ok, true, su.errore);
  assert.equal(su.file.byte, pdf.length);
  const giu = await c.file(su.file.id);
  assert.equal(giu.stato, 200);
  assert.ok(giu.dati.equals(pdf), 'il file torna uguale');
  assert.equal((await c.file('nonCeQuestoFile')).stato, 404);
  // Tutto dallo script: le POST seguite dal rimbalzo con una GET, mai una POST forzata sul rimbalzo.
  assert.ok(p.rimbalzi.post - prima.post >= 7);
  assert.equal(p.rimbalzi.get - prima.get, p.rimbalzi.post - prima.post);
  assert.equal(p.rimbalzi.postSulRimbalzo, 0);
  assert.equal(c.conti.casa, 0, 'senza casa non si prova casa');
  assert.equal(c.stato().strada, 'google');
  assert.match(c.stato().ultimoContatto, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  // Accedi da Google: il server lo scrive come "google", da fuori.
  const acc = Object.assign({}, p.wisper.db.riga("SELECT ip, da_fuori FROM accessi WHERE azione = 'io' ORDER BY id DESC LIMIT 1"));
  assert.deepEqual(acc, { ip: 'google', da_fuori: 1 });
});

test('in casa: accedi passa da Google (la password non va a casa), poi la firma sceglie casa per 5 minuti', async () => {
  p.modoCasa('passa');
  const vistiPrima = p.statoCasa.visti.length;
  const c = new Collegamento({ casa: p.casa, google: p.google });
  assert.equal((await c.accedi('laura@esempio.it', 'prova')).ok, true);
  assert.equal(p.statoCasa.visti.length, vistiPrima, 'accedi non tocca casa');
  assert.equal((await c.leggi('io', [])).ok, true);
  assert.equal(c.stato().strada, 'casa');
  const visti = p.statoCasa.visti.slice(vistiPrima);
  assert.equal(visti[0].percorso, '/salute');
  assert.equal(visti[0].conChiave, false, 'la prova di casa non manda il token');
  assert.equal(visti[1].percorso, '/exec');
  assert.equal(visti[1].conChiave, true);
  // La scelta vale: altre richieste vanno a casa senza riprovare la firma.
  await c.leggi('anagrafiche', []);
  await c.leggi('io', []);
  assert.equal(c.conti.prove, 1);
  assert.equal(c.conti.google, 1, 'solo accedi da Google');
  // Una scrittura da casa porta l'id della richiesta (idRichiesta).
  await c.scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: 'Referente da casa ' + Date.now() } });
  assert.equal(p.statoCasa.visti.slice(-1)[0].idRichiesta, c.ultimoId);
  // La rete cambia: la scelta si rifà.
  c.dimentica();
  await c.leggi('io', []);
  assert.equal(c.conti.prove, 2);
});

test('un altro apparecchio allo stesso indirizzo (albergo, cliente): niente firma, niente token, si passa da Google', async () => {
  p.modoCasa('impostore');
  try {
    const c = new Collegamento({ casa: p.casa, google: p.google });
    assert.equal((await c.accedi('manuel@esempio.it', 'prova')).ok, true);
    const vistiPrima = p.statoCasa.visti.length;
    const io = await c.leggi('io', []);
    assert.equal(io.ok, true, io.errore);
    assert.equal(c.stato().strada, 'google');
    const visti = p.statoCasa.visti.slice(vistiPrima);
    assert.deepEqual(visti.map(v => v.percorso), ['/salute'], 'all\'altro apparecchio solo la prova');
    assert.ok(visti.every(v => !v.conChiave), 'il token non gli arriva mai');
  } finally {
    p.modoCasa('passa');
  }
});

test('casa spenta: la prova non passa in 1,5 secondi e si va da Google', async () => {
  p.modoCasa('spento');
  try {
    const c = new Collegamento({ casa: p.casa, google: p.google });
    await c.accedi('manuel@esempio.it', 'prova');
    const t0 = Date.now();
    assert.equal((await c.leggi('io', [])).ok, true);
    assert.ok(Date.now() - t0 < 6000);
    assert.equal(c.stato().strada, 'google');
  } finally {
    p.modoCasa('passa');
  }
});

test('una scrittura a casa che si perde per strada riparte da Google con lo stesso id: fatta una volta sola', async () => {
  p.modoCasa('passa');
  const c = new Collegamento({ casa: p.casa, google: p.google });
  await c.accedi('manuel@esempio.it', 'prova');
  assert.equal((await c.leggi('io', [])).ok, true);
  assert.equal(c.stato().strada, 'casa');
  const nome = 'Referente persa a casa ' + Date.now();
  p.modoCasa('perdiRisposta');
  const r = await c.scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome, ruolo: 'Acquisti' } });
  assert.equal(r.ok, true, r.errore);
  assert.equal(p.statoCasa.perse, 1, 'a casa la risposta si è persa');
  assert.equal(p.statoCasa.visti.slice(-1)[0].idRichiesta, c.ultimoId, 'a casa è partita con l\'id');
  assert.equal(conta('referenti', 'nome', nome), 1, 'il server l\'ha fatta una volta: da Google ha ridato la risposta di prima');
  assert.equal(c.stato().strada, 'google', 'dopo un errore di rete verso casa: Google');
});

test('NAS spento da poco: "attesa", si richiede con lo stesso id; il NAS torna e la scrittura è fatta una volta', async () => {
  const c = new Collegamento({ google: p.google });
  await c.accedi('manuel@esempio.it', 'prova');
  p.attesaApp(1500);
  await p.spegniNas();
  try {
    const nome = 'Referente col NAS spento ' + Date.now();
    const scrittura = c.scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome } });
    await dormi(4000);
    assert.equal(conta('referenti', 'nome', nome), 0, 'col NAS spento non si fa');
    p.accendiNas();
    const r = await scrittura;
    assert.equal(r.ok, true, r.errore);
    assert.equal(conta('referenti', 'nome', nome), 1);
    assert.ok(c.conti.google >= 3, 'più tentativi, tutti con lo stesso id: ' + c.conti.google);
  } finally {
    p.attesaApp(0);
    p.accendiNas();
  }
});

test('NAS spento da tanto: "spento" subito con l\'ora; il "Riprova" usa lo stesso id e non fa doppioni', async () => {
  const c = new Collegamento({ google: p.google });
  await c.accedi('manuel@esempio.it', 'prova');
  await p.spegniNas();
  p.nasMutoDa(5 * 60000);
  const nome = 'Referente col NAS muto ' + Date.now();
  const dati = { referente: { idSoggetto: 'C002', nome } };
  try {
    const t0 = Date.now();
    const r = await c.scrivi('salvaReferente', dati);
    assert.ok(Date.now() - t0 < 3000, 'non aspetta');
    assert.equal(r.ok, false);
    assert.equal(r.rete, true);
    assert.equal(r.porta, 'spento');
    assert.match(r.errore, /non risponde dalle \d{2}:\d{2}/);
    const primo = c.ultimoId;
    p.accendiNas();
    await dormi(500);
    const di = await c.scrivi('salvaReferente', dati);
    assert.equal(di.ok, true, di.errore);
    assert.equal(c.ultimoId, primo, 'la stessa scrittura riparte con lo stesso id');
    // E se la risposta di questa si perdesse, un'altra ripetizione ridarebbe la stessa: una sola riga.
    assert.equal(conta('referenti', 'nome', nome), 1);
    const nuova = await c.scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: nome + ' bis' } });
    assert.notEqual(c.ultimoId, primo, 'una scrittura diversa ha un id nuovo');
    assert.equal(nuova.ok, true);
  } finally {
    p.accendiNas();
  }
});

test('un file oltre 26 MB non parte da Google: si dice di mandarlo dall\'ufficio', async () => {
  const c = new Collegamento({ google: p.google });
  await c.accedi('manuel@esempio.it', 'prova');
  const prima = c.conti.google;
  const r = await c.carica(Buffer.alloc(MASSIMO_DA_GOOGLE + 1), { nome: 'enorme.bin', per: 'documento' });
  assert.equal(r.ok, false);
  assert.equal(r.rete, false, 'riprovare uguale non serve');
  assert.equal(r.errore, TROPPO_GRANDE);
  assert.equal(c.conti.google, prima, 'non è partito niente');
});

test('accesso scaduto da Google: la chiave si butta', async () => {
  const c = new Collegamento({ google: p.google });
  c.token = 'token-inventato';
  const r = await c.leggi('io', []);
  assert.equal(r.accesso, false);
  assert.equal(c.token, '');
});
