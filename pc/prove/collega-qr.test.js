// Entrare col telefono (docs/gestionale/collega-qr.md §3 e §6), dal lato di Wisper Ufficio: le regole senza grafica di
// pc/ui/regole-collegamento.js (testo del QR, nome del computer, tempi dei codici, cosa mostra la pagina, frasi) e la
// riga del registro. La cifratura col caso fisso è in server/prove/collega.test.js e in collega-exe.test.js.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const K = require('../ui/regole-collegamento.js');
const Q = require('../ui/qr.js');
const { leggi } = require('./leggi-qr.js');

const chiave = () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return e.getPublicKey(null, 'compressed').toString('base64url'); };
const id = () => crypto.randomBytes(16).toString('base64url');

test('il testo del QR: wisper-collega:1:<id>:<chiave>:<nome>, e il telefono lo rilegge', () => {
  const i = id();
  const c = chiave();
  const t = K.testoQr(i, c, 'UFFICIO-PC');
  assert.equal(t, 'wisper-collega:1:' + i + ':' + c + ':UFFICIO-PC');
  assert.deepEqual(K.leggiTestoQr(t), { id: i, chiave: c, nome: 'UFFICIO-PC' });
  // Il nome scritto come encodeURIComponent e riletto uguale.
  const t2 = K.testoQr(i, c, 'PC di Laura · Città (1)');
  assert.equal(t2.split(':')[4], 'PC%20di%20Laura%20%C2%B7%20Citt%C3%A0%20(1)');
  assert.equal(K.leggiTestoQr(t2).nome, 'PC di Laura · Città (1)');
});

test('il telefono rifiuta ogni altro testo, versione, id o chiave sbagliati', () => {
  const i = id();
  const c = chiave();
  for (const t of ['', 'HELLO WORLD', 'https://esempio.it', 'wisper-collega:2:' + i + ':' + c + ':PC',
    'wisper-collega:1:' + i.slice(1) + ':' + c + ':PC', 'wisper-collega:1:' + i + ':' + c.slice(1) + ':PC',
    'wisper-collega:1:' + i + ':' + c + ':', 'wisper-collega:1:' + i + ':' + c + ':%E0%A4%A',
    'wisper-collega:1:' + i + ':' + c + ':PC:altro',
    // Una chiave non compressa (04...) o un id che non sono 16 byte esatti.
    'wisper-collega:1:' + i + ':' + 'B' + c.slice(1) + ':PC',
    'wisper-collega:1:' + i.slice(0, 21) + 'B:' + c + ':PC',
    'wisper-collega:1:' + i + ':' + c + ':' + encodeURIComponent('x'.repeat(33)),
    'wisper-collega:1:' + i + ':' + c + ':' + encodeURIComponent('PC‮etouq')]) {
    assert.equal(K.leggiTestoQr(t), null, t);
  }
});

test('il nome del computer: senza caratteri di controllo, al massimo 32 caratteri e 128 byte scritti', () => {
  assert.equal(K.nomeQr('UFFICIO-PC'), 'UFFICIO-PC');
  assert.equal(K.nomeQr('  '), 'Computer');
  assert.equal(K.nomeQr(''), 'Computer');
  assert.equal(K.nomeQr(null), 'Computer');
  assert.equal(K.nomeQr('PC\nUFFICIO​'), 'PCUFFICIO');
  assert.equal(K.nomeQr('x'.repeat(40)), 'x'.repeat(32));
  // 40 "€" sono 9 caratteri scritti l'uno: ne stanno 14 (126 byte).
  assert.equal(K.nomeQr('€'.repeat(40)), '€'.repeat(14));
  // Un carattere fuori dal piano base conta uno, come per il server (scritto sono 12 byte: ne stanno 10).
  assert.equal([...K.nomeQr('😀'.repeat(40))].length, 10);
  assert.equal([...K.nomeQr('😀'.repeat(8))].length, 8);
  // Il caso peggiore sta nel QR (versione 10 al massimo).
  for (const nome of ['x'.repeat(32), '€'.repeat(40), '😀'.repeat(40), 'à'.repeat(32)]) {
    const t = K.testoQr(id(), chiave(), nome);
    const qr = Q.codifica(t);
    assert.ok(qr.versione <= 10);
    assert.equal(leggi(Q.righe(qr)).testo, t);
    assert.ok(K.leggiTestoQr(t), 'e il telefono lo accetta: ' + nome.slice(0, 4));
  }
  // Un nome di macchina normale (15 caratteri) sta in un QR piccolo: versione 6.
  assert.equal(Q.codifica(K.testoQr(id(), chiave(), 'UFFICIO-STUDIO1')).versione, 6);
});

test('i codici: 2 minuti l\'uno, dopo 5 ci si ferma', () => {
  const t0 = 1000000;
  assert.equal(K.codiceDopo(t0, 1, t0 + 119999), 'resta');
  assert.equal(K.codiceDopo(t0, 1, t0 + 120000), 'nuovo');
  assert.equal(K.codiceDopo(t0, 4, t0 + 120000), 'nuovo');
  assert.equal(K.codiceDopo(t0, 5, t0 + 119000), 'resta', 'il quinto vale i suoi 2 minuti');
  assert.equal(K.codiceDopo(t0, 5, t0 + 120000), 'fermo');
  assert.equal(K.QR.DURATA_MS, 120000);
  assert.equal(K.QR.CODICI, 5);
  assert.equal(K.QR.OGNI_MS, 2000);
  assert.equal(K.QR.ENTRATO_MS, 1200);
});

test('cosa mostra la pagina dopo lo stato: un singhiozzo non fa sparire il codice, alla prima domanda sì', () => {
  assert.deepEqual(K.vistaDopo({ lontani: 0, domande: 0 }, 'lontano'), { vista: 'lontano', lontani: 1 }, 'aprendo la pagina fuori ufficio si dice subito');
  assert.deepEqual(K.vistaDopo({ lontani: 0, domande: 3 }, 'lontano'), { vista: 'qr', lontani: 1 }, 'una volta sola: resta il codice');
  assert.deepEqual(K.vistaDopo({ lontani: 1, domande: 4 }, 'lontano'), { vista: 'lontano', lontani: 2 }, 'due di fila: non risponde');
  assert.deepEqual(K.vistaDopo({ lontani: 1, domande: 4 }, 'attesa'), { vista: 'qr', lontani: 0 }, 'una risposta azzera');
  assert.deepEqual(K.vistaDopo({ lontani: 1, domande: 4 }, 'entrato'), { vista: 'entrato', lontani: 0 });
  assert.deepEqual(K.vistaDopo({ lontani: 0, domande: 2 }, 'rifiutato'), { vista: 'rifiutato', lontani: 0 });
  assert.deepEqual(K.vistaDopo(null, 'attesa'), { vista: 'qr', lontani: 0 });
});

test('le frasi: quelle del prototipo, italiano semplice, niente punti esclamativi', () => {
  const F = K.FRASI_QR;
  assert.equal(F.titolo, 'Entra col telefono');
  assert.deepEqual(F.passi.map(p => p.join('')), ['Apri Wisper sul telefono', 'Nel menu tocca Collega un computer', 'Inquadra questo codice']);
  assert.equal(F.altraStrada, 'Entra con email e password');
  assert.equal(F.tornaAlCodice, 'Torna al codice del telefono');
  assert.equal(F.nuovoCodice, 'Mostra un codice nuovo');
  assert.equal(F.lontanoTitolo, 'Il server dell\'ufficio non risponde');
  assert.equal(F.lontanoTesto, 'Il codice per il telefono funziona solo quando questo computer è in ufficio, sulla stessa rete del server.');
  assert.equal(F.entrato('Manuel Gasparotto'), 'Entrato come Manuel Gasparotto');
  assert.equal(F.aproDashboard, 'Apro la Dashboard…');
  const tutte = Object.values(F).map(x => (typeof x === 'function' ? x('Laura') : JSON.stringify(x))).join(' ');
  assert.ok(!/!/.test(tutte), 'niente punti esclamativi');
  assert.ok(!/script|token|QR code/i.test(tutte), 'niente gergo');
});

test('il registro: "Manuel ha collegato col telefono il computer UFFICIO-PC"', () => {
  globalThis.WisperConti = require('../ui/conti.js');
  const R = require('../ui/regole.js');
  const pezzi = R.fraseRegistro({ utente: 'Manuel Gasparotto', tabella: 'collegamenti_qr', idRiga: 'UFFICIO-PC', dopo: { nome: 'UFFICIO-PC', stato: 'autorizzato' }, nota: 'Collegamento col QR autorizzato per UFFICIO-PC' });
  assert.equal(pezzi.map(p => p.testo).join(''), 'Manuel ha collegato col telefono il computer UFFICIO-PC');
  assert.equal(pezzi[pezzi.length - 1].forte, true, 'il nome del computer in grassetto');
});
