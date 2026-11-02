// Collegare il computer col QR (docs/gestionale/collega-qr.md §4 e §5): autorizzaComputer dal telefono,
// attesaComputer dal computer (senza token, solo da casa), statoComputer per il telefono; la cifratura del pacchetto
// col caso fisso condiviso col computer (server/prove/casi-collega.json, lo decifra anche WisperUfficio.exe).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva } = require('./aiuto');
const { esegui } = require('../src/richieste');
const { conProvenienza } = require('../src/provenienza');
const { cifraPacchetto, decifraPacchetto, MASSIMO_PER_UTENTE } = require('../src/azioni/collega');

const GOOGLE_FINTO = 'https://script.google.com/macros/s/ESEMPIO-NON-VERO/exec';
const CASI = JSON.parse(fs.readFileSync(path.join(__dirname, 'casi-collega.json'), 'utf8')).casi;

let s;
let manuel;
let laura;
// La porta Google configurata (non accesa: le prove non vanno su internet), per vedere "google" nel pacchetto.
test.before(async () => {
  s = await serverDiProva({ ingresso: true, env: { WISPER_POSTINO_URL: GOOGLE_FINTO } });
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
});
test.after(() => s.ferma());

/** Un computer col suo QR: chiavi nuove e id a caso, come pc/WisperUfficio/CollegaQr.cs. */
function computer(nome) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const id = crypto.randomBytes(16).toString('base64url');
  return { ecdh, id, chiave: ecdh.getPublicKey(null, 'compressed').toString('base64url'), nome: nome || 'UFFICIO-PC' };
}
const autorizza = (chi, pc) => chi('autorizzaComputer', { id: pc.id, chiave: pc.chiave, nome: pc.nome });
/** attesaComputer dalla porta di casa, senza token, come il computer (disp: il suo id di dispositivo). */
const attesa = pc => s.chiama(null, { azione: 'attesaComputer', id: pc.id, disp: 'pc-prova-qr', dispNome: 'non conta', app: 'ufficio prova' });
const apri = (pc, r) => JSON.parse(decifraPacchetto(pc.ecdh.getPrivateKey(), Buffer.from(pc.id, 'base64url'), r));

test('autorizza, attesa, pronto una volta sola: il token del pacchetto funziona davvero con io', async () => {
  const pc = computer('UFFICIO-PC');
  assert.deepEqual(await attesa(pc), { ok: true, stato: 'attesa' }, 'prima del telefono: attesa');
  assert.deepEqual(await autorizza(manuel, pc), { ok: true, nome: 'UFFICIO-PC' });
  assert.deepEqual(await manuel('statoComputer', { id: pc.id }), { ok: true, stato: 'autorizzato', nome: 'UFFICIO-PC' });

  const r = await attesa(pc);
  assert.equal(r.ok, true);
  assert.equal(r.stato, 'pronto');
  assert.equal(Buffer.from(r.chiave, 'base64url').length, 65, 'chiave del server non compressa');
  assert.equal(Buffer.from(r.chiave, 'base64url')[0], 4);
  assert.equal(Buffer.from(r.iv, 'base64url').length, 12);
  assert.ok(!('token' in r) && !JSON.stringify(r).includes('manuel'), 'niente in chiaro');

  const p = apri(pc, r);
  assert.equal(p.ok, true);
  assert.equal(p.utente.email, 'manuel@esempio.it');
  assert.equal(p.utente.ruolo, 'titolare');
  assert.equal(p.permessi.amministrazione, 2);
  assert.equal(p.google, GOOGLE_FINTO, 'l\'indirizzo Google, con la porta configurata');
  const io = await s.leggi(p.token, { azione: 'io' });
  assert.equal(io.ok, true);
  assert.equal(io.utente.email, 'manuel@esempio.it');

  // La sessione: come accedi, col nome del computer e l'app "Wisper Ufficio · <nome>".
  const sess = s.wisper.db.riga('SELECT * FROM sessioni WHERE id = ?', p.sessione);
  assert.equal(sess.app, 'Wisper Ufficio · UFFICIO-PC');
  assert.equal(sess.disp_nome, 'UFFICIO-PC');
  assert.equal(sess.disp, 'pc-prova-qr');

  assert.deepEqual(await attesa(pc), { ok: true, stato: 'attesa' }, 'una volta sola: dopo dice attesa');
  assert.deepEqual(await manuel('statoComputer', { id: pc.id }), { ok: true, stato: 'entrato', nome: 'UFFICIO-PC' });
});

test('negli accessi una riga "accedi col QR" e niente righe per le attese; nel registro il nome, mai il token', async () => {
  const prima = s.wisper.db.riga('SELECT MAX(id) n FROM accessi').n;
  const pc = computer('PC-RECEPTION');
  for (let i = 0; i < 3; i++) await attesa(pc);
  await autorizza(manuel, pc);
  const r = await attesa(pc);
  const p = apri(pc, r);
  const righe = s.wisper.db.righe('SELECT * FROM accessi WHERE id > ? ORDER BY id', prima);
  assert.deepEqual(righe.filter(x => x.azione === 'attesaComputer'), [], 'le attese non lasciano righe');
  const qr = righe.filter(x => x.azione === 'accedi col QR');
  assert.equal(qr.length, 1);
  assert.equal(qr[0].esito, 'ok');
  assert.equal(qr[0].disp_nome, 'PC-RECEPTION');
  assert.equal(qr[0].utente_id, p.utente.id);
  const reg = s.wisper.db.righe("SELECT * FROM registro WHERE tabella = 'collegamenti_qr' ORDER BY id DESC LIMIT 1")[0];
  assert.equal(reg.nota, 'Collegamento col QR autorizzato per PC-RECEPTION');
  assert.equal(reg.utente, 'Manuel Gasparotto');
  const tutto = JSON.stringify(s.wisper.db.righe('SELECT * FROM registro')) + JSON.stringify(s.wisper.db.righe('SELECT * FROM accessi'));
  assert.ok(!tutto.includes(p.token) && !tutto.includes(pc.chiave), 'nessun segreto nel registro e negli accessi');
  // Il pacchetto non resta fra le richieste gia' fatte (ricordo.js), nemmeno con un idRichiesta.
  const pc2 = computer('PC-RICORDO');
  await autorizza(manuel, pc2);
  const r2 = await s.chiama(null, { azione: 'attesaComputer', id: pc2.id, idRichiesta: 'ricordo-qr-0001' });
  assert.equal(r2.stato, 'pronto');
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM richieste_fatte WHERE azione = 'attesaComputer'").n, 0);
});

test('un id gia\' usato si rifiuta, anche da un altro utente e dopo che il computer e\' entrato', async () => {
  const pc = computer();
  assert.equal((await autorizza(manuel, pc)).ok, true);
  const di = await autorizza(manuel, pc);
  assert.deepEqual(di, { ok: false, errore: 'Questo codice è già stato usato: sul computer ne compare uno nuovo' });
  assert.equal((await autorizza(laura, pc)).errore, 'Questo codice è già stato usato: sul computer ne compare uno nuovo');
  assert.equal((await attesa(pc)).stato, 'pronto');
  assert.equal((await autorizza(laura, pc)).errore, 'Questo codice è già stato usato: sul computer ne compare uno nuovo');
});

test('un codice che non e\' di Wisper Ufficio: id, chiave e nome controllati', async () => {
  const pc = computer();
  const no = { ok: false, errore: 'Questo non è un codice di Wisper Ufficio' };
  const prova = o => manuel('autorizzaComputer', Object.assign({ id: computer().id, chiave: pc.chiave, nome: 'UFFICIO-PC' }, o));
  // L'id: 22 caratteri base64url, 16 byte.
  assert.deepEqual(await prova({ id: 'corto' }), no);
  assert.deepEqual(await prova({ id: crypto.randomBytes(17).toString('base64url') }), no);
  assert.deepEqual(await prova({ id: crypto.randomBytes(16).toString('base64') }), no, 'base64 normale con = non va');
  assert.deepEqual(await prova({ id: 12345 }), no);
  // La chiave: 33 byte compressi, prefisso 02/03, un punto vero di P-256.
  assert.deepEqual(await prova({ chiave: pc.ecdh.getPublicKey(null, 'uncompressed').toString('base64url') }), no, 'non compressa: no');
  assert.deepEqual(await prova({ chiave: Buffer.concat([Buffer.from([4]), crypto.randomBytes(32)]).toString('base64url') }), no, 'prefisso 04');
  // Una X che non sta sulla curva (circa meta' delle X non ci stanno: se ne cerca una).
  let fuori = null;
  for (let i = 0; i < 200 && !fuori; i++) {
    const b = Buffer.concat([Buffer.from([2]), crypto.randomBytes(32)]);
    try { const e = crypto.createECDH('prime256v1'); e.generateKeys(); e.computeSecret(b); } catch (x) { fuori = b; }
  }
  assert.ok(fuori, 'trovata una X fuori dalla curva');
  assert.deepEqual(await prova({ chiave: fuori.toString('base64url') }), no, 'non e\' un punto di P-256');
  assert.deepEqual(await prova({ chiave: 'A'.repeat(44) }), no);
  assert.deepEqual(await prova({ chiave: '' }), no);
  // Il nome: 1-32 caratteri, niente caratteri di controllo o di formato.
  assert.deepEqual(await prova({ nome: '' }), no);
  assert.deepEqual(await prova({ nome: 'x'.repeat(33) }), no);
  assert.deepEqual(await prova({ nome: 'UFFICIO\nPC' }), no);
  assert.deepEqual(await prova({ nome: 'PC‮etouq' }), no, 'niente scritte rovesciate');
  assert.equal((await prova({ nome: 'x'.repeat(32) })).ok, true, '32 caratteri vanno bene');
  assert.equal((await prova({ nome: 'PC di Laura · Città' })).ok, true);
});

test('il codice vale 2 minuti (orologio di prova)', async () => {
  const pc = computer('PC-LENTO');
  await autorizza(manuel, pc);
  const ora = Date.now();
  test.mock.timers.enable({ apis: ['Date'], now: ora + 119 * 1000 });
  try {
    assert.equal((await manuel('statoComputer', { id: pc.id })).stato, 'autorizzato', 'a 1:59 vale ancora');
    test.mock.timers.setTime(ora + 121 * 1000);
    assert.deepEqual(await attesa(pc), { ok: true, stato: 'attesa' }, 'a 2:01 non entra piu\'');
    assert.deepEqual(await manuel('statoComputer', { id: pc.id }), { ok: true, stato: 'scaduto', nome: '' });
    assert.equal((await autorizza(manuel, pc)).errore, 'Questo codice è già stato usato: sul computer ne compare uno nuovo', 'e non si riautorizza');
  } finally {
    test.mock.timers.reset();
  }
});

test('attesaComputer solo da casa: da Google e dall\'ingresso no; e vuole una POST', async () => {
  const pc = computer();
  await autorizza(manuel, pc);
  const daIngresso = await fetch(s.urlIngresso + '/exec', {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', 'X-Forwarded-For': '203.0.113.9' },
    body: JSON.stringify({ azione: 'attesaComputer', id: pc.id }),
  }).then(r => r.json());
  assert.deepEqual(daIngresso, { ok: false, errore: 'Il collegamento col telefono si fa solo in ufficio' });
  const daGoogle = await conProvenienza({ ip: 'google', daFuori: true }, () => esegui(s.wisper, { azione: 'attesaComputer', id: pc.id }, {}));
  assert.deepEqual(daGoogle, { ok: false, errore: 'Il collegamento col telefono si fa solo in ufficio' });
  assert.equal((await s.leggi(null, { azione: 'attesaComputer', id: pc.id })).errore, 'Questa azione vuole una POST');
  // Il telefono invece autorizza anche da Google.
  const pc2 = computer('PC-DA-GOOGLE');
  const r = await conProvenienza({ ip: 'google', daFuori: true }, () => esegui(s.wisper, { azione: 'autorizzaComputer', id: pc2.id, chiave: pc2.chiave, nome: pc2.nome }, { token: manuel.token }));
  assert.deepEqual(r, { ok: true, nome: 'PC-DA-GOOGLE' });
  // Dopo i rifiuti da fuori, da casa il computer entra lo stesso.
  assert.equal((await attesa(pc)).stato, 'pronto');
});

test('chi ha inquadrato e\' stato disattivato, o il suo telefono scollegato: rifiutato', async () => {
  const marco = await s.come('marco@esempio.it');
  const pc = computer('PC-MARCO');
  await autorizza(marco, pc);
  const id = s.wisper.db.riga("SELECT id FROM utenti WHERE email = 'marco@esempio.it'").id;
  s.wisper.db.esegui('UPDATE utenti SET attivo = 0 WHERE id = ?', id);
  try {
    assert.deepEqual(await attesa(pc), { ok: true, stato: 'rifiutato' });
    assert.deepEqual(await attesa(pc), { ok: true, stato: 'attesa' }, 'e poi l\'id non c\'e\' piu\'');
  } finally {
    s.wisper.db.esegui('UPDATE utenti SET attivo = 1 WHERE id = ?', id);
  }
  const marco2 = await s.come('marco@esempio.it');
  const pc2 = computer('PC-MARCO-2');
  await autorizza(marco2, pc2);
  await marco2('esci', {});
  assert.deepEqual(await attesa(pc2), { ok: true, stato: 'rifiutato' }, 'il telefono e\' uscito nel frattempo');
});

test('statoComputer solo per chi ha autorizzato', async () => {
  const pc = computer('PC-DI-MANUEL');
  await autorizza(manuel, pc);
  assert.deepEqual(await laura('statoComputer', { id: pc.id }), { ok: true, stato: 'scaduto', nome: '' }, 'per Laura l\'id non esiste');
  assert.deepEqual(await manuel('statoComputer', { id: pc.id }), { ok: true, stato: 'autorizzato', nome: 'PC-DI-MANUEL' });
  assert.deepEqual(await manuel('statoComputer', { id: computer().id }), { ok: true, stato: 'scaduto', nome: '' });
  assert.equal((await s.chiama(null, { azione: 'statoComputer', id: pc.id })).accesso, false, 'senza token no');
  assert.equal((await s.chiama(null, { azione: 'autorizzaComputer', id: pc.id, chiave: pc.chiave, nome: 'x' })).accesso, false, 'senza token no');
});

test('al massimo 5 in attesa per utente: la piu\' vecchia si butta', async () => {
  const lettura = await s.come('lettura@esempio.it');
  const tanti = [];
  for (let i = 0; i < MASSIMO_PER_UTENTE + 1; i++) {
    const pc = computer('PC-' + i);
    assert.equal((await autorizza(lettura, pc)).ok, true);
    tanti.push(pc);
  }
  assert.deepEqual(await lettura('statoComputer', { id: tanti[0].id }), { ok: true, stato: 'scaduto', nome: '' }, 'la prima e\' andata');
  assert.deepEqual(await attesa(tanti[0]), { ok: true, stato: 'attesa' });
  for (let i = 1; i <= MASSIMO_PER_UTENTE; i++) assert.equal((await lettura('statoComputer', { id: tanti[i].id })).stato, 'autorizzato', 'PC-' + i);
  // Entra con i suoi permessi (lettura), non con quelli di altri.
  const p = apri(tanti[5], await attesa(tanti[5]));
  assert.equal(p.utente.ruolo, 'lettura');
  assert.equal(p.permessi.amministrazione || 0, 0);
});

test('senza porta Google configurata (o spenta) il pacchetto non ha "google"', async () => {
  const altro = await serverDiProva({ env: { WISPER_POSTINO_URL: GOOGLE_FINTO, WISPER_PORTA_GOOGLE: 'no' } });
  try {
    const m = await altro.come('manuel@esempio.it');
    const pc = computer();
    await m('autorizzaComputer', { id: pc.id, chiave: pc.chiave, nome: pc.nome });
    const r = await altro.chiama(null, { azione: 'attesaComputer', id: pc.id });
    const p = apri(pc, r);
    assert.equal(p.ok, true);
    assert.ok(!('google' in p), 'con WISPER_PORTA_GOOGLE=no niente indirizzo');
  } finally {
    await altro.ferma();
  }
});

test('il caso fisso condiviso col computer: il server cifra e ritrova il risultato, e lo decifra', () => {
  assert.ok(CASI.length >= 1);
  for (const c of CASI) {
    const b = x => Buffer.from(x, 'base64url');
    // La chiave del QR e' la compressa della pubblica del computer, ricavata dalla privata.
    const pc = crypto.createECDH('prime256v1');
    pc.setPrivateKey(b(c.privataComputer));
    assert.equal(pc.getPublicKey(null, 'compressed').toString('base64url'), c.chiaveQr);
    assert.equal(pc.getPublicKey(null, 'uncompressed').toString('base64url'), c.pubblicaComputer);
    const r = cifraPacchetto(b(c.chiaveQr), b(c.id), c.inChiaro, { privataServer: b(c.privataServer), iv: b(c.iv) });
    assert.deepEqual(r, c.risultato, c.nome);
    assert.equal(decifraPacchetto(b(c.privataComputer), b(c.id), c.risultato), c.inChiaro);
    // Un byte cambiato, o un altro id (AAD), e non si decifra.
    const rotto = b(c.risultato.dati);
    rotto[3] ^= 1;
    assert.throws(() => decifraPacchetto(b(c.privataComputer), b(c.id), Object.assign({}, c.risultato, { dati: rotto.toString('base64url') })));
    assert.throws(() => decifraPacchetto(b(c.privataComputer), crypto.randomBytes(16), c.risultato));
    // Solo dati di esempio.
    assert.ok(!/@(?!esempio\.it)/.test(c.inChiaro));
  }
});
