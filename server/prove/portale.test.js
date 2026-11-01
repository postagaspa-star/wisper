// Fase 7: il router del portale clienti (fase7.md §0, §6, §7, §13.1-13.2), chiamato come lo chiama il giro del portale:
// w.portale.richiesta(lavoro). Coi dati di esempio della fase 7 e l'orologio dei prototipi.
// Le prove: entrare (link, codice, pre-sessione, limiti, stessa risposta), sessioni, viste a elenco chiuso, isolamento
// (IDOR), anteprima, accettare e firmare con la prova, richieste e messaggi, file (tipi e controlli sui byte), strade e
// 404 uguali, quota delle email, --porta-portale solo in prova.
//   node --test server/prove/
'use strict';

process.env.WISPER_PORTALE_INDIRIZZO = 'http://localhost:8790';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { argomenti } = require('../src/avvio');
const { PortaGoogle } = require('../src/porta');

giornoDeiPrototipi();

let s;
let w;
let ids;
test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  w.portaleSincrono = true;
  ids = {
    ferretti: 4, anna: 5, giulia: 8, mario: 7,
    p: Object.fromEntries(w.db.righe('SELECT id, tipo, rif, soggetto_id FROM portale_pubblicazioni ORDER BY id').map(r => [r.id, r])),
  };
});
test.after(() => s.ferma());

// ------------------------------------------------------------------ aiuti

function png(larghezza, altezza, pixel) {
  const crc = b => { let c; const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const pezzo = (tipo, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(tipo), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(larghezza, 0); ih.writeUInt32BE(altezza, 4); ih[8] = 8; ih[9] = 6;
  const righe = [];
  for (let y = 0; y < altezza; y++) { const r = Buffer.alloc(larghezza * 4 + 1); for (let x = 0; x < larghezza; x++) { const p = pixel(x, y); for (let k = 0; k < 4; k++) r[1 + x * 4 + k] = p[k]; } righe.push(r); }
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), pezzo('IHDR', ih), pezzo('IDAT', zlib.deflateSync(Buffer.concat(righe))), pezzo('IEND', Buffer.alloc(0))]);
}
const FIRMA = 'data:image/png;base64,' + png(80, 24, (x, y) => (Math.abs(x - 3 * y) < 2 ? [0, 0, 0, 255] : [255, 255, 255, 0])).toString('base64');
const VUOTA = 'data:image/png;base64,' + png(80, 24, () => [255, 255, 255, 255]).toString('base64');
const nuovoId = () => crypto.randomBytes(12).toString('base64url');
const nuovoPre = () => crypto.randomBytes(32).toString('base64url');

/** Una richiesta della pagina, come arriva dal giro del portale. */
function chiedi(strada, o) {
  o = o || {};
  return w.portale.richiesta({ v: o.v === undefined ? 1 : o.v, id: o.id || nuovoId(), strada, metodo: 'metodo' in o ? o.metodo : (o.corpo ? 'POST' : 'GET'), sessione: o.sessione || '',
    pre: o.pre || '', corpo: o.corpo || {}, agente: 'Chrome · Android' });
}

/** L'ultima email arrivata a questo indirizzo nella posta finta. */
function ultimaEmail(a) {
  const dir = path.join(s.dati, 'posta-finta', 'email');
  if (!fs.existsSync(dir)) return null;
  for (const d of fs.readdirSync(dir).sort().reverse()) {
    const t = fs.readFileSync(path.join(dir, d, 'email.txt'), 'utf8');
    if (t.startsWith('A: ' + a + '\n')) return t;
  }
  return null;
}
const quanteEmail = () => { const dir = path.join(s.dati, 'posta-finta', 'email'); return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0; };

/** Entra con link e codice dell'email: torna {sessione, codice, token}. */
async function entra(email) {
  // Le prove entrano tante volte con la stessa email: i limiti dei link (5 all'ora) si azzerano qui.
  w.db.esegui('DELETE FROM portale_tentativi');
  const pre = nuovoPre();
  const r = await chiedi('entra', { corpo: { email, destinazione: '' }, pre });
  assert.equal(r.ok, true, JSON.stringify(r));
  await w.portaleInCorso;
  const t = ultimaEmail(email);
  const codice = t.match(/è (\d{6})\./)[1];
  const token = t.match(/#\/entra\/([A-Za-z0-9_-]+)/)[1];
  const c = await chiedi('codice', { corpo: { email, codice }, pre });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { sessione: c.sessione, codice, token, pre, risposta: c };
}

/** Le chiavi di un oggetto a ogni profondita' ("a.b[].c"). */
function chiavi(x, pref, out) {
  out = out || new Set();
  if (Array.isArray(x)) x.forEach(v => chiavi(v, pref + '[]', out));
  else if (x && typeof x === 'object') for (const k of Object.keys(x)) { const p = pref ? pref + '.' + k : k; out.add(p); chiavi(x[k], p, out); }
  return out;
}

// ------------------------------------------------------------------ strade e forma

test('strade fuori elenco, exec, .., %2e, metodi sbagliati, versione diversa: 404 (o 426) sempre uguali', async () => {
  const nonTrovato = { ok: false, stato: 404, errore: 'Non trovato' };
  for (const strada of ['exec', 'exec/io', 'file/abc', 'ponte', 'salute', 'carica/x', 'portale/static/..', '../exec', 'preventivi/..', 'condiviso/../exec',
    '%2e%2e', 'preventivi/%2e', 'Preventivi', 'preventivi/12/cancella', 'admin', 'io/x', 'preventivi/abc', 'scarica/nonvale', '']) {
    assert.deepEqual(await chiedi(strada), nonTrovato, strada);
  }
  for (const metodo of ['PUT', 'DELETE', 'OPTIONS', 'HEAD', '']) assert.deepEqual(await chiedi('io', { metodo }), nonTrovato, metodo);
  assert.deepEqual(await chiedi('io', { metodo: 'POST' }), nonTrovato, 'io vuole GET');
  assert.deepEqual(await chiedi('entra', { metodo: 'GET' }), nonTrovato, 'entra vuole POST');
  const vecchia = await chiedi('studio', { v: 2 });
  assert.deepEqual(vecchia, { ok: false, stato: 426, errore: 'Il portale è stato aggiornato: ricarica la pagina', ricarica: true });
});

test('studio (pubblica): i dati dello studio, attivo, l\'informativa coi dati dello studio', async () => {
  const r = await chiedi('studio');
  assert.deepEqual(Object.keys(r).sort(), ['attivo', 'informativa', 'ok', 'stato', 'studio']);
  assert.deepEqual(Object.keys(r.studio).sort(), ['email', 'indirizzo', 'nome', 'partitaIva', 'telefono']);
  assert.equal(r.attivo, true);
  assert.match(r.informativa, /Studio Tecnico GM \(Via dell'Esempio 1/);
  assert.doesNotMatch(r.informativa, /\{[a-z_]+\}/, 'nessun segnaposto rimasto');
});

test('--porta-portale esiste solo con --prova: fuori da --prova il server non parte', () => {
  assert.throws(() => argomenti(['--dati', 'x', '--porta-portale', '8411']), /solo con --prova/);
  assert.equal(argomenti(['--prova', '--porta-portale', '8411']).portaPortale, 8411);
});

test('il giro del foglio rifiuta i lavori "portale"; il giro del portale rifiuta tutto il resto', async () => {
  const foglio = new PortaGoogle(w, {});
  const portale = new PortaGoogle(w, { soloPortale: true });
  const no = '{"ok":false,"errore":"Richiesta non valida"}';
  assert.equal(await foglio.esegui({ tipo: 'portale', v: 1, strada: 'studio', metodo: 'GET', corpo: {} }, 'lavoro-portale-01'), no);
  for (const tipo of ['exec', 'carica', 'file', 'ponte', '']) assert.equal(await portale.esegui({ tipo, dati: { azione: 'io' }, file: 'abc' }, 'lavoro-altro-0001'), no, tipo);
  const ok = JSON.parse(await portale.esegui({ tipo: 'portale', v: 1, strada: 'studio', metodo: 'GET', corpo: {} }, 'lavoro-portale-02'));
  assert.equal(ok.ok, true);
  assert.equal(ok.studio.nome, 'Studio Tecnico GM');
  // La porta di casa (8400) non ha nessuna strada /portale/.
  const r = await fetch(s.url + '/portale/api/io');
  assert.equal(r.status, 404);
});

// ------------------------------------------------------------------ entrare

test('entra: la stessa frase per email abilitata, sconosciuta, senza accesso, limitata; email sbagliata 400; senza pre 400', async () => {
  const frase = e => 'Se ' + e + ' è tra gli indirizzi abilitati, ti è arrivata un\'email con un link e un codice. Valgono 10 minuti.';
  for (const e of ['f.ferretti@rossi.example', 'nessuno@esempio.it', 'giulia.bianchi@elettrodinamica.example']) {
    const r = await chiedi('entra', { corpo: { email: e }, pre: nuovoPre() });
    assert.deepEqual(r, { ok: true, stato: 200, frase: frase(e) }, e);
    await w.portaleInCorso;
  }
  assert.equal(ultimaEmail('nessuno@esempio.it'), null, 'all\'email sconosciuta non parte niente');
  assert.equal(ultimaEmail('giulia.bianchi@elettrodinamica.example'), null, 'a un referente senza accesso non parte niente');
  assert.match(ultimaEmail('f.ferretti@rossi.example'), /Oggetto: Entra nel portale di Studio Tecnico GM/);
  assert.equal((await chiedi('entra', { corpo: { email: 'non-una-email' }, pre: nuovoPre() })).stato, 400);
  assert.equal((await chiedi('entra', { corpo: { email: 'a@b.it' } })).stato, 400);
  // Nessuna email in chiaro di chi non ha l'accesso: nei tentativi solo lo SHA-256.
  const t = w.db.righe('SELECT chiave FROM portale_tentativi').map(x => x.chiave).join(' ');
  assert.doesNotMatch(t, /nessuno@esempio/);
  assert.match(t, /email:[0-9a-f]{64}/);
});

test('entra risponde prima di cercare l\'email: tempi simili per abilitata e sconosciuta (differenza media sotto 50 ms)', async () => {
  const tempo = async e => { const t0 = process.hrtime.bigint(); await chiedi('entra', { corpo: { email: e }, pre: nuovoPre() }); const t = Number(process.hrtime.bigint() - t0) / 1e6; await w.portaleInCorso; return t; };
  let a = 0;
  let b = 0;
  // Sotto il limite generale delle richieste di link: si azzerano i tentativi fra un giro e l'altro.
  for (let i = 0; i < 25; i++) {
    w.db.esegui('DELETE FROM portale_tentativi');
    a += await tempo('giulia.neri@batokyo.example');
    b += await tempo('sconosciuto' + i + '@esempio.it');
  }
  assert.ok(Math.abs(a - b) / 25 < 50, 'media ' + (a / 25).toFixed(1) + ' contro ' + (b / 25).toFixed(1) + ' ms');
  w.db.esegui('DELETE FROM portale_tentativi');
});

test('codice: monouso, solo con la stessa pre-sessione, 5 errori lo annullano, 10 errori in un\'ora fermano il referente', async () => {
  const email = 'mario.bianchi@example.com';
  const pre = nuovoPre();
  await chiedi('entra', { corpo: { email }, pre });
  await w.portaleInCorso;
  const codice = ultimaEmail(email).match(/è (\d{6})\./)[1];
  const nonGiusto = { ok: false, stato: 401, errore: 'Il codice non è giusto o non vale più: chiedi un\'email nuova' };
  // Un altro browser (pre diversa): rifiutato, uguale a un codice sbagliato.
  assert.deepEqual(await chiedi('codice', { corpo: { email, codice }, pre: nuovoPre() }), nonGiusto);
  // Giusto con la sua pre: entra; la seconda volta no (monouso).
  const ok = await chiedi('codice', { corpo: { email, codice }, pre });
  assert.equal(ok.ok, true);
  assert.match(ok.sessione, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await chiedi('codice', { corpo: { email, codice }, pre }), nonGiusto);
  // 5 errori uccidono il codice: poi anche quello giusto non vale.
  const pre2 = nuovoPre();
  await chiedi('entra', { corpo: { email }, pre: pre2 });
  await w.portaleInCorso;
  const c2 = ultimaEmail(email).match(/è (\d{6})\./)[1];
  const sbagliato = c2 === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.deepEqual(await chiedi('codice', { corpo: { email, codice: sbagliato }, pre: pre2 }), nonGiusto);
  assert.deepEqual(await chiedi('codice', { corpo: { email, codice: c2 }, pre: pre2 }), nonGiusto, 'dopo 5 errori il codice non vale piu\'');
  // 10 errori in un'ora: 429 e niente email nuove (entra risponde uguale ma blocca).
  for (let i = 0; i < 5; i++) await chiedi('codice', { corpo: { email, codice: sbagliato }, pre: pre2 });
  assert.deepEqual(await chiedi('codice', { corpo: { email, codice: sbagliato }, pre: pre2 }), { ok: false, stato: 429, errore: 'Troppi tentativi: riprova fra un\'ora o chiama lo studio' });
  const prima = quanteEmail();
  await chiedi('entra', { corpo: { email }, pre: nuovoPre() });
  await w.portaleInCorso;
  assert.equal(quanteEmail(), prima, 'referente fermo: nessuna email');
  assert.ok(w.db.riga("SELECT id FROM portale_accessi WHERE referente_id = 7 AND azione = 'bloccato'"));
  w.db.esegui('DELETE FROM portale_tentativi');
});

test('limiti dei link: 5 all\'ora per email (poi nessuna email, riga "bloccato"), 60 all\'ora per tutto il portale', async () => {
  w.db.esegui('DELETE FROM portale_tentativi');
  const prima = quanteEmail();
  for (let i = 0; i < 7; i++) { await chiedi('entra', { corpo: { email: 'giulia.neri@batokyo.example' }, pre: nuovoPre() }); await w.portaleInCorso; }
  assert.equal(quanteEmail() - prima, 5, 'cinque email, non sette');
  // 200 richieste da 50 email diverse: il portale si ferma a 60 (e le email partite restano sotto il tetto).
  w.db.esegui('DELETE FROM portale_tentativi');
  for (let i = 0; i < 200; i++) await chiedi('entra', { corpo: { email: 'persona' + (i % 50) + '@esempio.it' }, pre: nuovoPre() });
  await w.portaleInCorso;
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM portale_tentativi WHERE chiave = 'portale'").n, 200);
  const piu = await chiedi('entra', { corpo: { email: 'f.ferretti@rossi.example' }, pre: nuovoPre() });
  assert.equal(piu.ok, true, 'la risposta resta la stessa');
  const n = quanteEmail();
  await w.portaleInCorso;
  assert.equal(quanteEmail(), n, 'oltre 60 all\'ora: nessuna email');
  w.db.esegui('DELETE FROM portale_tentativi');
});

test('quota delle email: con le email di Google quasi finite, a tutti la stessa risposta "quota"; la riserva resta allo studio', async () => {
  w.quotaPostino = { giorno: require('../src/utili').oggi(), rimaste: 8 };
  const r = await chiedi('entra', { corpo: { email: 'f.ferretti@rossi.example' }, pre: nuovoPre() });
  assert.equal(r.quota, true);
  assert.equal(r.stato, 503);
  assert.equal((await chiedi('entra', { corpo: { email: 'nessuno@esempio.it' }, pre: nuovoPre() })).quota, true, 'uguale per tutti');
  // Gli avvisi (importanza 3) si fermano gia' sotto la riserva (20); i link (1) solo sotto 10.
  w.quotaPostino.rimaste = 15;
  assert.equal(w.emailPortalePuo(1), true);
  assert.equal(w.emailPortalePuo(3), false);
  delete w.quotaPostino;
});

test('link: si consuma solo con la POST, una volta; scaduto o usato -> "Questo link non vale più" con nuovo; link-nuovo manda un link alla stessa email', async () => {
  const x = await entra('f.ferretti@rossi.example');
  // Il token del link dell'email d'accesso (l'altra strada dello stesso messaggio): gia' usato il codice, il link e' lo stesso
  // record: non vale piu'.
  const usato = await chiedi('link', { corpo: { token: x.token } });
  assert.deepEqual(usato, { ok: false, stato: 401, errore: 'Questo link non vale più', nuovo: true });
  const nuovo = await chiedi('link-nuovo', { corpo: { token: x.token } });
  assert.deepEqual(nuovo, { ok: true, stato: 200, frase: 'Ti abbiamo mandato un link nuovo a f' + '•'.repeat(9) + '@rossi.example' });
  await w.portaleInCorso;
  const t2 = ultimaEmail('f.ferretti@rossi.example').match(/#\/entra\/([A-Za-z0-9_-]+)/)[1];
  assert.notEqual(t2, x.token);
  const dentro = await chiedi('link', { corpo: { token: t2 } });
  assert.equal(dentro.ok, true);
  assert.match(dentro.sessione, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(dentro.sessione, x.sessione, 'sessione nuova a ogni ingresso');
  // Un token inventato: non vale, senza "nuovo".
  assert.deepEqual(await chiedi('link', { corpo: { token: 'x'.repeat(43) } }), { ok: false, stato: 401, errore: 'Questo link non vale più', nuovo: false });
  // Nessun token ne' codice nel registro dello studio ne' in quello del portale.
  const tutto = JSON.stringify(w.db.righe('SELECT * FROM registro')) + JSON.stringify(w.db.righe('SELECT * FROM portale_accessi'));
  assert.ok(tutto.indexOf(x.token) < 0 && tutto.indexOf(t2) < 0 && tutto.indexOf(dentro.sessione) < 0);
  assert.ok(tutto.indexOf('"' + x.codice + '"') < 0);
  // Nel database solo impronte.
  assert.ok(!w.db.riga('SELECT id FROM portale_link WHERE token_hash = ?', t2));
  assert.ok(w.db.riga('SELECT id FROM portale_link WHERE token_hash = ?', crypto.createHash('sha256').update(t2).digest('hex')));
});

test('sessione: esci e esci da tutti chiudono sul server; 30 minuti senza uso e 8 ore chiudono; token di un\'altra sessione chiusa -> 401', async () => {
  const a = await entra('f.ferretti@rossi.example');
  const b = await entra('f.ferretti@rossi.example');
  assert.equal((await chiedi('io', { sessione: a.sessione })).ok, true);
  assert.deepEqual(await chiedi('esci', { sessione: a.sessione, corpo: { tutti: false } }), { ok: true, stato: 200 });
  const scaduta = { ok: false, stato: 401, errore: 'La sessione è scaduta: entra di nuovo', accesso: false };
  assert.deepEqual(await chiedi('io', { sessione: a.sessione }), scaduta);
  assert.equal((await chiedi('io', { sessione: b.sessione })).ok, true, 'l\'altra sessione resta');
  await chiedi('esci', { sessione: b.sessione, corpo: { tutti: true } });
  assert.deepEqual(await chiedi('io', { sessione: b.sessione }), scaduta);
  // 30 minuti senza uso.
  const c = await entra('f.ferretti@rossi.example');
  const idS = w.db.riga('SELECT id FROM portale_sessioni WHERE token_hash = ?', crypto.createHash('sha256').update(c.sessione).digest('hex')).id;
  w.db.esegui('UPDATE portale_sessioni SET ultimo_uso = ? WHERE id = ?', require('../src/utili').istante(new Date(require('../src/utili').adessoMs() - 31 * 60000)), idS);
  assert.deepEqual(await chiedi('io', { sessione: c.sessione }), scaduta);
  // 8 ore comunque.
  const d = await entra('f.ferretti@rossi.example');
  w.db.esegui('UPDATE portale_sessioni SET scade_il = ? WHERE token_hash = ?', require('../src/utili').istante(new Date(require('../src/utili').adessoMs() - 1000)), crypto.createHash('sha256').update(d.sessione).digest('hex'));
  assert.deepEqual(await chiedi('io', { sessione: d.sessione }), scaduta);
});

test('Togli l\'accesso, email cambiata, portale del cliente spento: le sessioni aperte si chiudono alla richiesta dopo', async () => {
  const m = await s.come('manuel@esempio.it');
  const a = await entra('giulia.neri@batokyo.example');
  assert.equal((await m('togliAccessoReferente', { idReferente: 8 })).ok, true);
  assert.equal((await chiedi('io', { sessione: a.sessione })).stato, 401);
  assert.equal((await m('invitaReferente', { idReferente: 8, manda: false })).ok, true);
  const b = await entra('giulia.neri@batokyo.example');
  assert.equal((await m('salvaReferente', { referente: { id: 8, email: 'g.neri@batokyo.example' } })).avviso, 'L\'email è cambiata: per entrare nel portale userà quella nuova');
  assert.equal((await chiedi('io', { sessione: b.sessione })).stato, 401);
  const c = await entra('g.neri@batokyo.example');
  await m('salvaPortaleCliente', { idCliente: 'C004', portale: false });
  assert.equal((await chiedi('io', { sessione: c.sessione })).stato, 401);
  await m('salvaPortaleCliente', { idCliente: 'C004', portale: true });
  await m('salvaReferente', { referente: { id: 8, email: 'giulia.neri@batokyo.example' } });
});

// ------------------------------------------------------------------ viste a elenco chiuso

test('viste: le chiavi di ogni risposta sono esattamente quelle di fase7.md §7; nessun valore interno nel testo', async () => {
  // Valori interni riconoscibili: note interne, costi, nomi di chi ha scritto, cronologia interna.
  w.db.esegui("UPDATE preventivi SET note_interne = 'NOTA-INTERNA-PREVENTIVO' WHERE id = 7");
  w.db.esegui("UPDATE rapportini SET note_interne = 'NOTA-INTERNA-RAPPORTINO', costo_orario = 98.76 WHERE id = 'RAP/2026/0013'");
  w.db.esegui("UPDATE ticket SET motivo = 'MOTIVO-INTERNO-TICKET', esito = 'ESITO-INTERNO' WHERE numero = 'TK/2026/0014'");
  w.db.esegui("UPDATE fatture SET note_interne = 'NOTA-INTERNA-FATTURA' WHERE numero = '45/2026'");
  const x = await entra('f.ferretti@rossi.example');
  const o = { sessione: x.sessione };
  const attese = {
    io: 'aziende azienda fileMaxMb informativa informativa.daLeggere informativa.data informativa.testo ok puo puo.documenti puo.fatture puo.preventivi puo.rapportini puo.richieste referente referente.avvisiEmail referente.email referente.nome sedi sedi[].id sedi[].nome sedi[].tipo sessione sessione.anteprima sessione.scadeComunque sessione.scadeSenzaUso stato studio studio.email studio.indirizzo studio.nome studio.partitaIva studio.telefono tipiFile',
    casa: 'conteggi conteggi.documenti conteggi.fatture conteggi.preventivi conteggi.rapportini conteggi.richieste daFare daFare[].dettaglio daFare[].id daFare[].tipo daFare[].titolo novita novita[].dettaglio novita[].id novita[].quando novita[].tipo novita[].titolo ok stato',
    preventivi: 'contratti contratti[].al contratti[].dal contratti[].id contratti[].numero contratti[].statoVisto contratti[].titolo ok preventivi preventivi[].data preventivi[].etichetta preventivi[].id preventivi[].nuovo preventivi[].oggetto preventivi[].scadenza preventivi[].stato preventivi[].statoVisto preventivi[].totale stato',
    'preventivi/1': 'ok preventivo preventivo.accettazione preventivo.complessita preventivo.condizioni preventivo.conti preventivo.conti.baseIva preventivo.conti.contributo preventivo.conti.eppiPercentuale preventivo.conti.imponibile preventivo.conti.iva preventivo.conti.ivaPercentuale preventivo.conti.scontoDaPercentuale preventivo.conti.scontoEuro preventivo.conti.sommaVoci preventivo.conti.totale preventivo.data preventivo.etichetta preventivo.id preventivo.introduzione preventivo.numero preventivo.oggetto preventivo.oneriPrevisti preventivo.pdf preventivo.pdf.chiave preventivo.pdf.nome preventivo.puoAccettare preventivo.revisione preventivo.scadenza preventivo.scadenzePagamento preventivo.scadenzePagamento[].descrizione preventivo.scadenzePagamento[].importo preventivo.scontoEuro preventivo.scontoPercentuale preventivo.sezioni preventivo.sezioni[].subtotale preventivo.sezioni[].titolo preventivo.sezioni[].voci preventivo.sezioni[].voci[].alternativa preventivo.sezioni[].voci[].descrizione preventivo.sezioni[].voci[].facoltativa preventivo.sezioni[].voci[].id preventivo.sezioni[].voci[].importo preventivo.sezioni[].voci[].modo preventivo.sezioni[].voci[].prezzo preventivo.sezioni[].voci[].quantita preventivo.sezioni[].voci[].scelta preventivo.sezioni[].voci[].scontoPercentuale preventivo.sezioni[].voci[].unita preventivo.stato preventivo.statoVisto preventivo.studio preventivo.studio.polizza preventivo.studio.titoli preventivo.versione stato',
    rapportini: 'ok rapportini rapportini[].daFirmare rapportini[].data rapportini[].id rapportini[].lavoro rapportini[].luogo rapportini[].numero rapportini[].nuovo rapportini[].statoVisto stato',
    'rapportini/5': 'ok rapportino rapportino.commessa rapportino.daFirmare rapportino.data rapportino.firma rapportino.firma.chiave rapportino.firmaModo rapportino.firmatario rapportino.firmatoIl rapportino.id rapportino.importi rapportino.km rapportino.lavoro rapportino.luogo rapportino.numero rapportino.oreExtra rapportino.oreLavoro rapportino.oreViaggio rapportino.puoFirmare rapportino.statoVisto rapportino.tecnico rapportino.ticket rapportino.versione stato',
    documenti: 'documenti documenti[].byte documenti[].categoria documenti[].data documenti[].file documenti[].file.chiave documenti[].id documenti[].luogo documenti[].nomeFile documenti[].nuovo documenti[].revisione documenti[].titolo ok stato tuoi tuoi[].byte tuoi[].id tuoi[].inviatoIl tuoi[].motivo tuoi[].nomeFile tuoi[].statoVisto tuoi[].titolo',
    fatture: 'fatture fatture[].daPagare fatture[].data fatture[].dettaglioStato fatture[].id fatture[].numero fatture[].nuovo fatture[].statoVisto fatture[].tipo fatture[].totale ok stato',
    'fatture/8': 'fattura fattura.causale fattura.conti fattura.conti.anticipazioni fattura.conti.bollo fattura.conti.compenso fattura.conti.contributo fattura.conti.iva fattura.conti.netto fattura.conti.ritenuta fattura.conti.totale fattura.copia fattura.daPagare fattura.data fattura.dettaglioStato fattura.id fattura.numero fattura.pagamento fattura.pagamento.causale fattura.pagamento.iban fattura.pagamento.intestatario fattura.righe fattura.righe[].descrizione fattura.righe[].importo fattura.righe[].quantita fattura.scadenze fattura.scadenze[].data fattura.scadenze[].importo fattura.scadenze[].pagata fattura.statoVisto fattura.tipo fattura.xml fattura.xml.chiave fattura.xml.nome ok stato',
    richieste: 'ok richieste richieste[].apertaIl richieste[].dettaglioStato richieste[].id richieste[].luogo richieste[].numero richieste[].nuovo richieste[].statoVisto richieste[].titolo stato',
    'richieste/11': 'ok richiesta richiesta.apertaDa richiesta.apertaIl richiesta.descrizione richiesta.dettaglioStato richiesta.id richiesta.luogo richiesta.messaggi richiesta.messaggi[].da richiesta.messaggi[].file richiesta.messaggi[].quando richiesta.messaggi[].testo richiesta.numero richiesta.puoDireNonRisolto richiesta.puoScrivere richiesta.rapportini richiesta.rifCliente richiesta.risposte richiesta.risposte.fermo richiesta.risposte.quando richiesta.statoVisto richiesta.tempo richiesta.tempo[].quando richiesta.tempo[].testo richiesta.titolo stato',
    accessi: 'accessi accessi[].dispositivo accessi[].frase accessi[].quando ok stato',
  };
  let tuttoIlTesto = '';
  for (const [strada, elenco] of Object.entries(attese)) {
    const r = await chiedi(strada, o);
    assert.equal(r.ok, true, strada + ': ' + JSON.stringify(r));
    assert.deepEqual(Array.from(chiavi(r, '')).sort(), elenco.split(' ').sort(), strada);
    tuttoIlTesto += JSON.stringify(r);
  }
  for (const interno of ['NOTA-INTERNA', 'MOTIVO-INTERNO', 'ESITO-INTERNO', '98.76', 'costo', 'margine', 'noteInterne', 'idUtente', 'idCliente', 'csrf', 'Marco Rossato', 'Laura Bianchi']) {
    assert.ok(tuttoIlTesto.indexOf(interno) < 0, interno + ' non deve arrivare al cliente');
  }
});

// ------------------------------------------------------------------ isolamento (IDOR)

test('isolamento: Giulia Neri (Batokyo, solo il Magazzino) vede solo le sue cose; tutto il resto 404, anche le chiavi dei file di un\'altra sessione', async () => {
  const g = await entra('giulia.neri@batokyo.example');
  const f = await entra('f.ferretti@rossi.example');
  const viste = [];
  for (const id of Object.keys(ids.p)) {
    const p = ids.p[id];
    const strada = { preventivo: 'preventivi', contratto: 'preventivi', rapportino: 'rapportini', fattura: 'fatture', documento: 'documenti', ticket: 'richieste' }[p.tipo];
    if (p.tipo === 'contratto' || p.tipo === 'documento') continue;
    const r = await chiedi(strada + '/' + id, { sessione: g.sessione });
    if (r.ok) viste.push(Number(id));
    else assert.deepEqual(r, { ok: false, stato: 404, errore: 'Non trovato' }, strada + '/' + id);
  }
  assert.deepEqual(viste, [13], 'solo la richiesta del Magazzino automatico');
  const docs = await chiedi('documenti', { sessione: g.sessione });
  assert.deepEqual(docs.documenti, [], 'il verbale della terra e\' fuori dalla sua sede');
  const contratti = await chiedi('preventivi', { sessione: g.sessione });
  assert.deepEqual(contratti.contratti.map(c => c.numero), ['CA/2026/001']);
  assert.equal((await chiedi('fatture', { sessione: g.sessione })).stato, 404, 'fatture 0: 404 anche l\'elenco');
  // Una chiave di file data a Ferretti non vale nella sessione di Giulia (ne' in quella di nessun altro).
  const pr = await chiedi('preventivi/1', { sessione: f.sessione });
  assert.equal((await chiedi('scarica/' + pr.preventivo.pdf.chiave, { sessione: f.sessione })).ok, true);
  assert.deepEqual(await chiedi('scarica/' + pr.preventivo.pdf.chiave, { sessione: g.sessione }), { ok: false, stato: 404, errore: 'Non trovato' });
  // Una chiave cambiata a mano (un'altra pubblicazione, lo stesso file): la firma non torna.
  const [corpo, firma] = pr.preventivo.pdf.chiave.split('.');
  const altra = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  altra.p = 15;
  assert.equal((await chiedi('scarica/' + Buffer.from(JSON.stringify(altra)).toString('base64url') + '.' + firma, { sessione: f.sessione })).stato, 404);
  // Dopo Togli dal portale la chiave gia' data non vale piu'.
  const m = await s.come('manuel@esempio.it');
  await m('togliDalPortale', { id: 1 });
  assert.equal((await chiedi('scarica/' + pr.preventivo.pdf.chiave, { sessione: f.sessione })).stato, 404);
  assert.equal((await chiedi('preventivi/1', { sessione: f.sessione })).stato, 404);
  await m('togliDalPortale', { id: 1, annulla: true });
  assert.equal((await chiedi('preventivi/1', { sessione: f.sessione })).ok, true);
  // Anna Rossi: richieste 0 -> 404 sull'elenco delle richieste.
  const a = await entra('amministrazione@rossi.example');
  assert.equal(a.risposta.informativa, true, 'primo ingresso: Prima di entrare');
  assert.equal((await chiedi('richieste', { sessione: a.sessione })).stato, 404);
  assert.equal((await chiedi('fatture', { sessione: a.sessione })).ok, true);
});

// ------------------------------------------------------------------ anteprima dello studio

test('anteprima dello studio: ogni POST che cambia -> 403, niente "visto", nel registro dello studio', async () => {
  const m = await s.come('manuel@esempio.it');
  const l = await m('anteprimaPortale', { idReferente: 4 });
  assert.match(l.link, /^http:\/\/localhost:8790\/#\/entra\/[A-Za-z0-9_-]{43}$/);
  const token = l.link.split('/entra/')[1];
  const r = await chiedi('link', { corpo: { token } });
  assert.equal(r.ok, true);
  const io = await chiedi('io', { sessione: r.sessione });
  assert.equal(io.sessione.anteprima, true);
  const prima = w.db.riga('SELECT visto_il FROM portale_pubblicazioni WHERE id = 3').visto_il;
  await chiedi('preventivi/3', { sessione: r.sessione });
  assert.equal(w.db.riga('SELECT visto_il FROM portale_pubblicazioni WHERE id = 3').visto_il, prima, 'niente visto');
  const anteprima = { ok: false, stato: 403, errore: 'È un\'anteprima: qui non si accetta e non si firma' };
  for (const [strada, corpo] of [['preventivi/1/accetta', { nome: 'X' }], ['rapportini/4/firma', {}], ['richieste', { titolo: 'x' }], ['avvisi', { email: false }],
    ['informativa', {}], ['preventivi/1/domanda', { testo: 'x' }], ['richieste/11/messaggio', { testo: 'x' }], ['carica', { nome: 'a.pdf' }]]) {
    assert.deepEqual(await chiedi(strada, { sessione: r.sessione, corpo }), anteprima, strada);
  }
  assert.ok(w.db.riga("SELECT id FROM registro WHERE nota = 'anteprima del portale come Sig. Ferretti'"));
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM portale_accessi WHERE sessione_id = ?', w.db.riga('SELECT id FROM portale_sessioni WHERE anteprima_utente_id IS NOT NULL ORDER BY id DESC LIMIT 1').id).n, 0,
    'nessuna riga nel registro del cliente');
});

// ------------------------------------------------------------------ accettare

test('accettare: anteprima coi conti della fase 2, firma vera, prova "via google", versione cambiata 409, doppione ok, conferma per email, Da guardare, commessa', async () => {
  const x = await entra('f.ferretti@rossi.example');
  const o = { sessione: x.sessione };
  const p = (await chiedi('preventivi/1', o)).preventivo;
  const voci = p.sezioni[0].voci;
  const [diri, propri, esterno] = [voci[1].id, voci[2].id, voci[3].id];
  const scelte = { [diri]: true, [propri]: false, [esterno]: true };
  const ante = await chiedi('preventivi/1/anteprima', { sessione: x.sessione, corpo: { scelte } });
  // Gli stessi conti di contiPreventivo (fase 2) con quelle scelte.
  const C = require('../src/conti');
  const r = w.db.riga('SELECT * FROM preventivi WHERE id = 7');
  const c = w.contenutiDi([7])[7];
  c.sezioni[0].voci.forEach(v => { if (scelte[v.id] !== undefined) v.scelta = scelte[v.id]; });
  const conti = C.contiPreventivo({ scontoPercentuale: r.sconto_percentuale, scontoEuro: r.sconto_euro, eppiPercentuale: r.eppi_percentuale, ivaPercentuale: r.iva_percentuale,
    sezioni: c.sezioni, scadenzePagamento: c.scadenze });
  assert.equal(ante.conti.totale, conti.totale);
  assert.equal(ante.conti.imponibile, conti.imponibile);
  assert.deepEqual(ante.scadenzePagamento.map(s2 => s2.importo), conti.scadenze);
  assert.equal((await chiedi('preventivi/1/anteprima', { sessione: x.sessione, corpo: { scelte: { [propri]: true, [esterno]: true } } })).errore, 'Di «collaudo» se ne sceglie una sola');
  const corpo = { scelte, nome: 'Roberto Ferretti', firma: FIRMA, letto: true, versione: p.versione };
  assert.equal((await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo: Object.assign({}, corpo, { nome: '' }) })).errore, 'Scrivi il nome e cognome di chi accetta');
  assert.equal((await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo: Object.assign({}, corpo, { firma: VUOTA }) })).errore, 'Manca la firma');
  assert.equal((await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo: Object.assign({}, corpo, { letto: false }) })).errore, 'Spunta «Ho letto le condizioni»');
  const cambiato = await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo: Object.assign({}, corpo, { versione: '2026-01-01T00:00:00' }) });
  assert.deepEqual(cambiato, { ok: false, stato: 409, errore: 'Il preventivo è stato aggiornato: guarda la versione nuova', cambiato: true });
  // Un referente con preventivi 1 (Anna Rossi): 403.
  const a = await entra('amministrazione@rossi.example');
  assert.equal((await chiedi('preventivi/1/accetta', { sessione: a.sessione, corpo })).stato, 403);
  const id = nuovoId();
  const ok = await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo, id });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.preventivo.stato, 'accettato');
  assert.equal(ok.preventivo.accettazione.modo, 'portale');
  assert.equal(ok.preventivo.accettazione.da, 'Roberto Ferretti');
  assert.match(ok.preventivo.accettazione.firma.chiave, /\./);
  const img = await chiedi('immagine/' + ok.preventivo.accettazione.firma.chiave, o);
  assert.equal(img.mime, 'image/png');
  // La rete che cade: la stessa POST (stesso id) torna uguale; una diversa ma uguale: ok senza rifare.
  assert.deepEqual(await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo, id }), ok);
  assert.equal((await chiedi('preventivi/1/accetta', { sessione: x.sessione, corpo })).ok, true);
  const dopo = w.db.riga('SELECT * FROM preventivi WHERE id = 7');
  assert.deepEqual([dopo.stato, dopo.accettazione_modo, dopo.accettato_referente_id], ['ACCETTATO', 'portale', 4]);
  const prova = JSON.parse(dopo.accettazione_prova);
  assert.deepEqual(Object.keys(prova).sort(), ['agente', 'email', 'firma', 'il', 'impronta', 'nome', 'referente', 'versione', 'via']);
  assert.equal(prova.via, 'google');
  assert.match(prova.impronta, /^[0-9a-f]{64}$/);
  assert.equal(prova.firma, dopo.firma_file_id);
  await w.portaleInCorso;
  const conferma = ultimaEmail('f.ferretti@rossi.example');
  assert.match(conferma, /Oggetto: Preventivo PR\/2026\/014 accettato/);
  assert.match(conferma, /Roberto Ferretti ha accettato nel portale il preventivo PR\/2026\/014 \(Adeguamento delle protezioni della cabina MT\), per un totale di .* € IVA compresa/);
  // Lo studio: Da guardare, notifica, Dashboard; la commessa chiude la riga.
  const m = await s.come('manuel@esempio.it');
  const st = await m('portale');
  assert.ok(st.daGuardare.some(r2 => r2.tipo === 'accettato' && r2.collegamento.id === 7));
  assert.ok((await m('notifiche', { soloNuove: true })).notifiche.some(n => n.tipo === 'preventivo_accettato'));
  const dash = await m('dashboard');
  assert.ok(dash.settimana.some(v => v.titolo === 'PR/2026/014 accettato nel portale' && v.dettaglio === 'Roberto Ferretti · manca la commessa'));
  const studio = (await m('preventivo', { id: 7 })).preventivo;
  assert.equal(studio.accettazione.modo, 'portale');
  assert.equal(studio.accettazione.prova.via, 'google');
  await m('creaCommessaDaPreventivo', { id: 7 });
  assert.ok(!(await m('portale')).daGuardare.some(r2 => r2.tipo === 'accettato' && r2.collegamento.id === 7));
  // Dall'/exec "portale" non si mette.
  assert.equal((await m('accettaPreventivo', { id: 1, modo: 'portale', nome: 'X' })).errore, '«Portale» lo mette solo il portale');
  // Scaduto: si guarda e basta.
  assert.match((await chiedi('preventivi/3/accetta', { sessione: x.sessione, corpo: Object.assign({}, corpo, { versione: (await chiedi('preventivi/3', o)).preventivo.versione }) })).errore,
    /^Il preventivo è scaduto il \d{2}\/\d{2}\/\d{4}: chiedi allo studio di rinnovarlo$/);
});

// ------------------------------------------------------------------ firmare

test('firmare un rapportino: da firmare -> FIRMATO con firma_modo portale e la prova; cambiato nel frattempo 409; gia\' firmato', async () => {
  const x = await entra('f.ferretti@rossi.example');
  const r = (await chiedi('rapportini/4', { sessione: x.sessione })).rapportino;
  assert.equal(r.puoFirmare, true);
  // Lo studio lo cambia mentre il cliente lo guarda: 409.
  const m = await s.come('manuel@esempio.it');
  w.db.esegui('UPDATE rapportini SET modificato = ? WHERE id = ?', require('../src/utili').adesso(), 'RAP/2026/0004');
  const vecchio = await chiedi('rapportini/4/firma', { sessione: x.sessione, corpo: { nome: 'Roberto Ferretti', firma: FIRMA, versione: '2026-01-01T00:00:00' } });
  assert.deepEqual(vecchio, { ok: false, stato: 409, errore: 'Il rapportino è cambiato: guardalo di nuovo prima di firmare', cambiato: true });
  const nuova = (await chiedi('rapportini/4', { sessione: x.sessione })).rapportino.versione;
  const ok = await chiedi('rapportini/4/firma', { sessione: x.sessione, corpo: { nome: 'Roberto Ferretti', firma: FIRMA, versione: nuova } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual([ok.rapportino.statoVisto, ok.rapportino.firmaModo, ok.rapportino.firmatario], ['Firmato', 'portale', 'Roberto Ferretti']);
  const riga = w.db.riga("SELECT * FROM rapportini WHERE id = 'RAP/2026/0004'");
  assert.deepEqual([riga.stato, riga.firma_modo, riga.firma_referente_id], ['FIRMATO', 'portale', 4]);
  assert.equal(JSON.parse(riga.firma_prova).via, 'google');
  const studio = (await m('rapportini', { tutti: true })).rapportini.find(x2 => x2.id === 'RAP/2026/0004');
  assert.deepEqual([studio.firmaModo, studio.firmaReferente], ['portale', 'Sig. Ferretti']);
  assert.equal((await chiedi('rapportini/4/firma', { sessione: x.sessione, corpo: { nome: 'Altro', firma: FIRMA, versione: nuova } })).errore, 'È già firmato');
  await w.portaleInCorso;
  assert.match(ultimaEmail('f.ferretti@rossi.example'), /Oggetto: Rapportino del 10\/10\/2026 firmato/);
  // Riportato in bozza dallo studio: la firma si toglie e la pubblicazione si chiude.
  await m('stato', { ids: ['RAP/2026/0004'], stato: 'BOZZA' });
  assert.equal((await chiedi('rapportini/4', { sessione: x.sessione })).stato, 404);
  assert.equal(w.db.riga("SELECT firma_modo FROM rapportini WHERE id = 'RAP/2026/0004'").firma_modo, '');
});

// ------------------------------------------------------------------ richieste, messaggi, file

test('richieste: nuova dal portale con la foto -> ticket origine portale, priorita\' dalla matrice, telefono con fermo e subito; limite al giorno; messaggi', async () => {
  const x = await entra('f.ferretti@rossi.example');
  const foto = png(4, 4, (a, b) => [a * 60, b * 60, 0, 255]).toString('base64');
  const car = await chiedi('carica', { sessione: x.sessione, corpo: { nome: 'Quadro QG2.png', per: 'richiesta', base64: foto } });
  assert.equal(car.ok, true, JSON.stringify(car));
  assert.equal((await chiedi('richieste', { sessione: x.sessione, corpo: { titolo: '' } })).errore, 'Scrivi in poche parole cosa succede');
  assert.equal((await chiedi('richieste', { sessione: x.sessione, corpo: { titolo: 'X' } })).errore, 'Scegli l\'impianto o la sede');
  const titolo = 'Scatta il differenziale <img src=x onerror=alert(1)>';
  const r = await chiedi('richieste', { sessione: x.sessione, corpo: { idSede: 4, titolo, descrizione: 'La linea 4 è ferma </script>', impatto: 'fermo', urgenza: 'subito',
    rifCliente: 'Ordine 77', caricamenti: [car.caricamento.id] } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.richiesta.titolo, titolo, 'il testo torna com\'era, come testo');
  assert.equal(r.richiesta.apertaDa, 'Portale');
  assert.equal(r.richiesta.statoVisto, 'Ricevuta');
  assert.equal(typeof r.telefono, 'string', 'con fermo e subito c\'e\' il telefono dello studio');
  const t = w.db.riga('SELECT * FROM ticket WHERE titolo = ?', titolo);
  assert.deepEqual([t.origine, t.priorita, t.responsabile_id, t.stato, t.portale_visibile, t.referente_id], ['portale', 'urgente', null, 'aperto', 1, 4]);
  assert.ok(w.db.riga("SELECT id FROM file WHERE ticket_id = ? AND tipo = 'portale'", t.id), 'la foto sta nel ticket');
  const m = await s.come('manuel@esempio.it');
  const dash = await m('dashboard');
  assert.ok(dash.urgenti.some(v => v.titolo === 'Richiesta urgente dal portale: ' + t.numero));
  const tk = (await m('ticket', { id: t.id })).ticket;
  assert.ok(tk.foto.some(f => f.dalCliente === true));
  // Marco riceve la notifica (urgente), risponde nel portale; il cliente vede "Studio Tecnico GM".
  const marco = await s.come('marco@esempio.it');
  assert.ok((await marco('notifiche', {})).notifiche.some(n => n.tipo === 'richiesta_portale'));
  await marco('prendiTicket', { id: t.id });
  assert.ok(!(await m('portale')).daGuardare.some(x2 => x2.tipo === 'richiesta' && x2.collegamento.id === t.id), 'presa: la riga si chiude');
  assert.equal((await marco('rispondiNelPortale', { idTicket: t.id, testo: 'Arrivo alle 15.' })).ok, true);
  const pub = w.db.riga("SELECT id FROM portale_pubblicazioni WHERE tipo = 'ticket' AND rif = ?", String(t.id)).id;
  const vista = (await chiedi('richieste/' + pub, { sessione: x.sessione })).richiesta;
  assert.deepEqual(vista.messaggi.map(mm => mm.da), ['Studio Tecnico GM']);
  assert.equal(vista.statoVisto, 'Presa in carico');
  const msg = await chiedi('richieste/' + pub + '/messaggio', { sessione: x.sessione, corpo: { testo: 'Vi aspetta il custode.' } });
  assert.deepEqual(msg.richiesta.messaggi.map(mm => mm.da), ['Studio Tecnico GM', 'Sig. Ferretti']);
  // Il limite al giorno.
  await m('salvaImpostazioni', { valori: { PORTALE_RICHIESTE_GIORNO: 1 } });
  assert.equal((await chiedi('richieste', { sessione: x.sessione, corpo: { idSede: 4, titolo: 'Altra' } })).errore, 'Oggi hai già mandato 1 richieste: per altre chiama lo studio');
  await m('salvaImpostazioni', { valori: { PORTALE_RICHIESTE_GIORNO: 10 } });
});

test('file: ogni tipo ammesso passa; exe rinominato, svg, html, zip, docm, xlsx con le macro, docx "bomba", doppia estensione no', async () => {
  const x = await entra('f.ferretti@rossi.example');
  const carica = (nome, dati) => chiedi('carica', { sessione: x.sessione, corpo: { nome, per: 'documento', base64: Buffer.from(dati).toString('base64') } });
  // Un piccolo ZIP con queste voci (solo l'indice centrale conta), grandezze scompattate a scelta.
  function zip(voci, grandezza) {
    const locali = [];
    const centrali = [];
    let off = 0;
    for (const nome of voci) {
      const n = Buffer.from(nome);
      const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(n.length, 26);
      locali.push(l, n);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(grandezza || 10, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
      centrali.push(c, n);
      off += 30 + n.length;
    }
    const cd = Buffer.concat(centrali);
    const fine = Buffer.alloc(22); fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(voci.length, 8); fine.writeUInt16LE(voci.length, 10); fine.writeUInt32LE(cd.length, 12); fine.writeUInt32LE(off, 16);
    return Buffer.concat([Buffer.concat(locali), cd, fine]);
  }
  const buoni = [
    ['a.pdf', '%PDF-1.4 prova'], ['b.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])], ['c.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1])],
    ['d.png', png(2, 2, () => [1, 2, 3, 255])], ['e.heic', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(8)])],
    ['f.dwg', 'AC1032 disegno'], ['g.dxf', '0\nSECTION\n2\nHEADER\n'], ['h.docx', zip(['[Content_Types].xml', 'word/document.xml'])],
    ['i.xlsx', zip(['[Content_Types].xml', 'xl/workbook.xml'])],
  ];
  for (const [nome, dati] of buoni) assert.equal((await carica(nome, dati)).ok, true, nome);
  const tipo = 'Questo tipo di file non si può caricare: PDF, foto, DWG, DXF, Word o Excel';
  const falso = 'Il file non è quello che dice il nome: non si carica';
  const cattivi = [
    ['programma.pdf', 'MZ\x90\x00 programma', falso], ['disegno.svg', '<svg onload=alert(1)>', tipo], ['pagina.html', '<html>', tipo], ['archivio.zip', zip(['a.txt']), tipo],
    ['macro.docm', zip(['[Content_Types].xml', 'word/document.xml']), tipo], ['macro.xlsx', zip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/vbaProject.bin']), tipo],
    ['bomba.docx', zip(['[Content_Types].xml', 'word/document.xml'], 250 * 1048576), falso], ['fattura.pdf.exe', '%PDF-1.4', tipo],
    ['"><svg onload=alert(1)>.pdf', 'non pdf', falso], ['vuoto.pdf', '', 'File vuoto'],
  ];
  for (const [nome, dati, frase] of cattivi) assert.equal((await carica(nome, dati)).errore, frase, nome);
  // Il caricamento legato a un documento diventa "Ricevuto" (Da guardare); lo studio lo accetta o lo rifiuta col motivo.
  const c = await carica('Schema QG3.pdf', '%PDF-1.4 schema');
  assert.equal((await chiedi('documenti', { sessione: x.sessione, corpo: { caricamento: c.caricamento.id, titolo: '' } })).errore, 'Scrivi di cosa si tratta');
  const tuo = await chiedi('documenti', { sessione: x.sessione, corpo: { caricamento: c.caricamento.id, titolo: 'Schema QG3', idSede: 4, nota: 'nuovo' } });
  assert.equal(tuo.tuo.statoVisto, 'Ricevuto');
  assert.equal((await chiedi('documenti', { sessione: x.sessione, corpo: { caricamento: c.caricamento.id, titolo: 'di nuovo' } })).errore, 'Il file non c\'è più: caricalo di nuovo');
  const m = await s.come('manuel@esempio.it');
  assert.equal((await m('rifiutaCaricamento', { id: c.caricamento.id, motivo: '' })).errore, 'Scrivi il motivo: lo vede il cliente');
  await m('rifiutaCaricamento', { id: c.caricamento.id, motivo: 'È la revisione vecchia' });
  const docs = await chiedi('documenti', { sessione: x.sessione });
  const mio = docs.tuoi.find(t2 => t2.id === c.caricamento.id);
  assert.deepEqual([mio.statoVisto, mio.motivo], ['Non accettato', 'È la revisione vecchia']);
  // Il file dal portale si scarica dallo studio sempre come allegato.
  const idFile = w.db.riga('SELECT file_id FROM portale_caricamenti WHERE id = ?', c.caricamento.id).file_id;
  const f = await m.file(idFile);
  assert.match(f.headers.get('content-disposition'), /^attachment;/);
});

test('i confini del codice: i file del portale non importano richieste.js, azioni/ ne\' permessi.js', () => {
  const cartella = path.join(__dirname, '..', 'src', 'portale');
  const ammessi = new Set(['node:crypto', 'node:fs', 'node:http', 'node:path', 'node:zlib', '../utili', '../conti', '../comunicazioni', '../ricordo',
    './index', './sessioni', './viste', './file']);
  for (const f of fs.readdirSync(cartella).filter(x => x.endsWith('.js'))) {
    const t = fs.readFileSync(path.join(cartella, f), 'utf8');
    const richieste = Array.from(t.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)).map(x => x[1]);
    for (const r of richieste) assert.ok(ammessi.has(r), f + ': require("' + r + '") fuori dall\'elenco');
  }
});

// La pagina del portale (portale/, la costruisce un altro pezzo): le intestazioni di §0.4 in portale/_headers e nessuna
// risorsa esterna nelle pagine. La prova gira quando la cartella c'e'.
const PAGINA = path.join(__dirname, '..', '..', 'portale');
test('la pagina del portale: le intestazioni di §0.4 in _headers, niente risorse esterne, niente indirizzo dello script del foglio', { skip: !fs.existsSync(path.join(PAGINA, '_headers')) }, () => {
  const h = fs.readFileSync(path.join(PAGINA, '_headers'), 'utf8');
  for (const riga of ["default-src 'none'", "script-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'",
    'connect-src https://script.google.com https://script.googleusercontent.com', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy: no-referrer',
    'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Cross-Origin-Opener-Policy: same-origin']) {
    assert.ok(h.indexOf(riga) >= 0, riga);
  }
  for (const f of fs.readdirSync(PAGINA).filter(x => /\.(html|js|css)$/.test(x) && x !== 'config.esempio.js')) {
    const t = fs.readFileSync(path.join(PAGINA, f), 'utf8');
    assert.doesNotMatch(t, /<script[^>]+src=["']https?:|<link[^>]+href=["']https?:|@import\s+url\(["']?https?:|fonts\.googleapis/i, f + ': niente risorse esterne');
    assert.doesNotMatch(t, /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/, f + ': niente indirizzi di script');
  }
});
