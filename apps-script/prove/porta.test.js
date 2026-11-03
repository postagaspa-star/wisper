// La porta Google (Porta.gs) sul finto Google, con un NAS finto scritto qui.
// Il finto Google gira in HTTP con le esecuzioni in parallelo (come Google): un'app
// aspetta la risposta mentre il "NAS" viene a prendere il lavoro.
//   node --test "apps-script/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const finto = require('./finto-google.js');

const SEGRETO = 'segreto-della-porta-1234567890';
finto.proprieta.set('SEGRETO_SERVER', SEGRETO);

let google;
let url;
test.before(() => new Promise(r => {
  google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  google.on('listening', () => { url = 'http://127.0.0.1:' + google.address().port + '/exec'; r(); });
}));
test.after(() => finto.chiudiHttp(google));

const dormi = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

async function manda(corpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { html: t, stato: r.status }; }
}

/** Una chiamata del NAS (di base: attesa 0, cioe' "c'e' lavoro adesso?"). */
const nas = altro => manda(Object.assign({ azione: 'portaPrendi', segreto: SEGRETO, attesa: 0 }, altro));

/**
 * Il NAS finto: chiama portaPrendi di continuo, risponde con rispondi(lavoro) e consegna con la chiamata dopo.
 * Si fa vivo una volta prima di tornare (il NAS vero chiama sempre: una richiesta non lo trova mai "spento").
 */
async function nasFinto(rispondi) {
  await nas({});
  let acceso = true;
  const visti = [];
  const giro = (async () => {
    let pronte = [];
    while (acceso) {
      const r = await manda({ azione: 'portaPrendi', segreto: SEGRETO, attesa: 1, risposte: pronte });
      pronte = [];
      if (!r.ok) throw new Error('portaPrendi: ' + (r.errore || r.html));
      for (const l of r.lavori) {
        visti.push(l);
        const risposta = await rispondi(l);
        if (risposta !== undefined) pronte.push({ id: l.id, risposta });
      }
    }
    if (pronte.length) await manda({ azione: 'portaConsegna', segreto: SEGRETO, risposte: pronte });
  })();
  return { visti, ferma: async () => { acceso = false; await giro; } };
}

/** Via tutto quello che la porta tiene nella cache (ogni prova parte pulita). */
function svuota() {
  for (const k of Array.from(finto.memoria.keys())) if (k.startsWith('porta:')) finto.memoria.delete(k);
}
const vociDi = id => Array.from(finto.memoria.keys()).filter(k => k.includes(id));
const cache = () => finto.contesto.CacheService.getScriptCache();

test('app nuova: la richiesta va in coda, il NAS la prende, la risposta torna all\'app', async () => {
  svuota();
  const n = await nasFinto(l => ({ ok: true, eco: l.lavoro.dati, token: l.lavoro.token, tipo: l.lavoro.tipo, metodo: l.lavoro.metodo }));
  const r = await manda({ porta: 1, id: 'prova-uno-0001', token: 'token-di-prova-segreto', strada: 'exec', dati: { azione: 'io', nota: 'caffè e però' } });
  await n.ferma();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.eco.azione, 'io');
  assert.equal(r.eco.nota, 'caffè e però', 'le lettere accentate arrivano uguali');
  assert.equal(r.token, 'token-di-prova-segreto', 'il token arriva al server cosi\' com\'e\'');
  assert.equal(r.tipo, 'exec');
  assert.equal(r.metodo, 'POST');
  assert.equal(n.visti.length, 1);
  assert.equal(n.visti[0].prese, 1);
  assert.equal(typeof n.visti[0].inCoda, 'number');
  assert.deepEqual(vociDi('prova-uno-0001'), [], 'consegnata: su Google non resta niente');
  // Lo script non scrive le richieste delle app nuove nel foglio, e il token non ci finisce mai.
  assert.ok(!JSON.stringify(finto.fogli.get('Accessi').celle).includes('token-di-prova-segreto'));
});

test('lo stato della porta: lo script dice se il server c\'e\', senza chiederglielo', async () => {
  svuota();
  assert.equal((await manda({ porta: 1, strada: 'salute' })).server, 'spento');
  await nas({});
  const s = await manda({ porta: 1, strada: 'salute' });
  assert.equal(s.ok, true);
  assert.equal(s.server, 'acceso');
  assert.match(s.ultimoContatto, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});

test('server spento: "riprova" subito, e la richiesta non resta in coda', async () => {
  svuota();
  const t0 = Date.now();
  const r = await manda({ porta: 1, id: 'prova-spento-01', token: 't', strada: 'exec', dati: { azione: 'io' } });
  assert.ok(Date.now() - t0 < 3000, 'non aspetta');
  assert.equal(r.ok, false);
  assert.equal(r.rete, true, 'le app la trattano come rete: riprovano, la coda non scarta');
  assert.equal(r.porta, 'spento');
  assert.deepEqual(vociDi('prova-spento-01'), []);
  // Senza notizie da 5 minuti: lo dice con l'ora.
  cache().put('porta:nas', String(Date.now() - 5 * 60000), 21600);
  const v = await manda({ porta: 1, id: 'prova-spento-02', token: 't', strada: 'exec', dati: { azione: 'io' } });
  assert.equal(v.porta, 'spento');
  assert.match(v.errore, /non risponde dalle \d{2}:\d{2}/);
  assert.ok(v.ultimoContatto);
  // Senza SEGRETO_SERVER la porta e' chiusa del tutto.
  finto.proprieta.delete('SEGRETO_SERVER');
  assert.equal((await manda({ porta: 1, id: 'prova-spento-03', token: 't', strada: 'exec', dati: { azione: 'io' } })).porta, 'spento');
  finto.proprieta.set('SEGRETO_SERVER', SEGRETO);
});

test('server lento: "riprova" nel tempo massimo, poi la stessa richiesta non si fa due volte', async () => {
  svuota();
  finto.proprieta.set('PORTA_ATTESA_MS', '1500');
  try {
    await nas({});
    const richiesta = { porta: 1, id: 'prova-lenta-0001', token: 't', strada: 'exec', dati: { azione: 'salvaOre', idLocale: 'ore-1' } };
    let t0 = Date.now();
    const r = await manda(richiesta);
    const ms = Date.now() - t0;
    assert.equal(r.porta, 'attesa');
    assert.equal(r.rete, true);
    assert.ok(ms >= 1400 && ms < 6000, 'aspetta il tempo massimo e non di piu\': ' + ms + ' ms');
    // L'app riprova mentre la richiesta e' ancora in coda: resta una sola.
    assert.equal((await manda(richiesta)).porta, 'attesa');
    assert.deepEqual(JSON.parse(cache().get('porta:coda')), ['prova-lenta-0001']);
    // Il NAS arriva, la prende (una volta) e risponde.
    const presi = await nas({});
    assert.deepEqual(presi.lavori.map(l => l.id), ['prova-lenta-0001']);
    assert.ok(presi.lavori[0].inCoda >= 1400);
    const c = await nas({ risposte: [{ id: 'prova-lenta-0001', risposta: { ok: true, fatto: 1 } }] });
    assert.equal(c.consegnate, 1);
    // L'app riprova ancora con lo stesso id: la risposta c'e' gia', subito.
    t0 = Date.now();
    const r2 = await manda(richiesta);
    assert.equal(r2.ok, true);
    assert.equal(r2.fatto, 1);
    assert.ok(Date.now() - t0 < 1400);
    assert.equal((await nas({})).lavori.length, 0, 'il NAS non la rivede');
    // Una consegna ripetuta (la risposta del NAS arrivata due volte) non fa danni.
    assert.equal((await nas({ risposte: [{ id: 'prova-lenta-0001', risposta: { ok: true, fatto: 2 } }] })).scadute, 1);
  } finally {
    finto.proprieta.delete('PORTA_ATTESA_MS');
  }
});

test('un lavoro preso e mai risposto torna disponibile; dopo tre volte l\'app riceve "riprova"', async () => {
  svuota();
  finto.proprieta.set('PORTA_ATTESA_MS', '1000');
  try {
    await nas({});
    const richiesta = { porta: 1, id: 'prova-persa-0001', token: 't', strada: 'exec', dati: { azione: 'io' } };
    await manda(richiesta);
    assert.equal((await nas({})).lavori[0].prese, 1);
    assert.equal((await nas({})).lavori.length, 0, 'presa da poco: non si ridà');
    // Sessanta secondi dopo, senza risposta: il NAS si e' perso la risposta, si ridà.
    const cambia = ms => {
      const s = JSON.parse(cache().get('porta:s:prova-persa-0001'));
      s.t -= ms;
      cache().put('porta:s:prova-persa-0001', JSON.stringify(s), 600);
    };
    cambia(61000);
    assert.equal((await nas({})).lavori[0].prese, 2);
    cambia(61000);
    assert.equal((await nas({})).lavori[0].prese, 3);
    cambia(61000);
    assert.equal((await nas({})).lavori.length, 0, 'la quarta volta no');
    const r = await manda(richiesta);
    assert.equal(r.rete, true);
    assert.equal(r.porta, 'attesa');
    assert.match(r.errore, /non riesce a rispondere/);
  } finally {
    finto.proprieta.delete('PORTA_ATTESA_MS');
  }
});

test('il NAS ripartito (inCorso vuoto) riprende subito i lavori che si era perso; quelli che ha in mano no', async () => {
  svuota();
  finto.proprieta.set('PORTA_ATTESA_MS', '800');
  try {
    await nas({ inCorso: [] });
    await manda({ porta: 1, id: 'prova-ripartito-1', token: 't', strada: 'exec', dati: { azione: 'io' } });
    // Presa da una chiamata la cui risposta non e' arrivata al NAS (o il NAS e' ripartito subito dopo).
    assert.equal((await nas({ inCorso: [] })).lavori[0].prese, 1);
    // Il NAS che la sta facendo lo dice: non si ridà.
    assert.equal((await nas({ inCorso: ['prova-ripartito-1'] })).lavori.length, 0);
    // Il NAS che non ce l'ha: si ridà subito, senza aspettare il minuto.
    const r = await nas({ inCorso: [] });
    assert.deepEqual(r.lavori.map(l => [l.id, l.prese]), [['prova-ripartito-1', 2]]);
  } finally {
    finto.proprieta.delete('PORTA_ATTESA_MS');
  }
});

test('tre richieste insieme: ognuna riceve la sua risposta', async () => {
  svuota();
  const n = await nasFinto(async l => { await dormi(50); return { ok: true, chi: l.lavoro.dati.chi }; });
  const r = await Promise.all([1, 2, 3].map(i => manda({ porta: 1, id: 'prova-insieme-' + i, token: 't', strada: 'exec', dati: { azione: 'io', chi: i } })));
  await n.ferma();
  assert.deepEqual(r.map(x => x.chi), [1, 2, 3]);
  assert.equal(n.visti.length, 3);
});

test('file grandi avanti e indietro: a pezzi nella cache, o su Drive solo il tempo della consegna', async () => {
  svuota();
  finto.driveAvanzato(false);
  const grande = crypto.randomBytes(3 * 1024 * 1024);
  const medio = crypto.randomBytes(600 * 1024);
  const temporanei = () => {
    const c = finto.contesto.portaCartella(false);
    return c ? c.figli.slice() : [];
  };
  const prima = temporanei().length;
  const n = await nasFinto(l => {
    if (l.lavoro.tipo === 'carica') {
      const b = Buffer.from(l.lavoro.base64, 'base64');
      return { ok: true, file: { nome: l.lavoro.query.nome, byte: b.length, sha256: sha(b) }, disp: l.lavoro.disp };
    }
    if (l.lavoro.tipo === 'file') return { ok: true, nome: 'grande.bin', mime: 'application/octet-stream', byte: grande.length, base64: grande.toString('base64') };
    return { ok: false, errore: 'non previsto' };
  });
  try {
    const su = await manda({ porta: 1, id: 'prova-carica-01', token: 't', strada: 'carica', disp: 'tel-1', query: { nome: 'grande.bin', mime: 'application/octet-stream', idFile: 'f-1', per: 'documento' }, base64: grande.toString('base64') });
    assert.equal(su.ok, true, JSON.stringify(su).slice(0, 200));
    assert.equal(su.file.byte, grande.length);
    assert.equal(su.file.sha256, sha(grande));
    assert.equal(su.disp, 'tel-1');
    const giu = await manda({ porta: 1, id: 'prova-file-0001', token: 't', strada: 'file', file: 'abc123' });
    assert.ok(Buffer.from(giu.base64, 'base64').equals(grande), 'il file torna uguale');
    const m = await manda({ porta: 1, id: 'prova-carica-02', token: 't', strada: 'carica', query: { nome: 'medio.bin' }, base64: medio.toString('base64') });
    assert.equal(m.file.sha256, sha(medio));
  } finally {
    await n.ferma();
  }
  // Due passaggi su Drive (la richiesta grande e la risposta grande), il medio a pezzi nella cache. Senza
  // il servizio Drive API vanno nel cestino di Drive (Google lo svuota dopo 30 giorni).
  const dopo = temporanei();
  assert.equal(dopo.length - prima, 2);
  assert.ok(dopo.every(f => f.isTrashed()));
  assert.deepEqual(['prova-carica-01', 'prova-file-0001', 'prova-carica-02'].flatMap(vociDi), [], 'niente resta nella cache');
  // Col servizio Drive API acceso si cancellano per sempre: nella cartella non resta niente di nuovo.
  finto.driveAvanzato(true);
  const n2 = await nasFinto(l => ({ ok: true, byte: Buffer.from(l.lavoro.base64, 'base64').length }));
  try {
    const r = await manda({ porta: 1, id: 'prova-carica-03', token: 't', strada: 'carica', query: { nome: 'grande.bin' }, base64: grande.toString('base64') });
    assert.equal(r.byte, grande.length);
  } finally {
    await n2.ferma();
    finto.driveAvanzato(false);
  }
  assert.equal(temporanei().length, dopo.length);
});

test('una richiesta troppo grande per Google o sbagliata si ferma subito', async () => {
  svuota();
  await nas({});
  const enorme = await manda({ porta: 1, id: 'prova-enorme-1', token: 't', strada: 'carica', query: { nome: 'x.bin' }, base64: 'A'.repeat(36000001) });
  assert.equal(enorme.ok, false);
  assert.equal(enorme.rete, undefined, 'riprovare uguale non serve');
  assert.match(enorme.errore, /troppo grande per passare da Google/);
  assert.equal((await manda({ porta: 1, strada: 'boh' })).errore, 'Richiesta non valida');
  assert.equal((await manda({ porta: 1, strada: 'exec' })).errore, 'Richiesta non valida');
  assert.equal((await manda({ porta: 1, strada: 'file', file: '../x' })).errore, 'Richiesta non valida');
  assert.equal(cache().get('porta:coda'), null, 'niente in coda');
});

test('il segreto sbagliato: il NAS non prende niente, e lo script lo scrive in Accessi', async () => {
  svuota();
  await nas({});
  finto.proprieta.set('PORTA_ATTESA_MS', '800');
  try {
    assert.equal((await manda({ porta: 1, id: 'prova-segreto-1', token: 't', strada: 'exec', dati: { azione: 'io' } })).porta, 'attesa');
  } finally {
    finto.proprieta.delete('PORTA_ATTESA_MS');
  }
  for (const finta of [{ segreto: 'sbagliato' }, {}, { codice: 'prova' }, { porta: 1, codice: 'prova' }]) {
    const r = await manda(Object.assign({ azione: 'portaPrendi', attesa: 0 }, finta));
    assert.equal(r.ok, false);
    assert.equal(r.errore, 'Segreto sbagliato');
  }
  assert.equal((await manda({ azione: 'portaConsegna', segreto: 'no', risposte: [{ id: 'prova-segreto-1', risposta: { ok: true, finta: true } }] })).errore, 'Segreto sbagliato');
  const ultima = finto.fogli.get('Accessi').celle.slice(-1)[0];
  assert.equal(ultima[1], 'rifiutato');
  assert.equal(ultima[3], 'Server Wisper (NAS)');
  assert.ok(!JSON.stringify(finto.fogli.get('Accessi').celle).includes(SEGRETO));
  // La richiesta e' ancora li', non presa e senza la risposta finta.
  const presi = await nas({});
  assert.deepEqual(presi.lavori.map(l => l.id), ['prova-segreto-1']);
});

test('versione vecchia col codice (PONTE_PORTA = si): passa dalla stessa coda', async () => {
  svuota();
  finto.proprieta.set('PONTE_PORTA', 'si');
  finto.proprieta.delete('SERVER_URL');
  const rapportiniPrima = JSON.stringify(finto.fogli.get('Rapportini').celle);
  const n = await nasFinto(l => (l.lavoro.tipo === 'ponte' ? { ok: true, eco: l.lavoro.dati } : { ok: false, errore: 'non previsto' }));
  try {
    const r = await manda({ codice: 'prova', azione: 'salvaRapportino', rapportino: { idLocale: 'vecchio-1' }, disp: 'tel-vecchio', dispNome: 'telefono 0.4.0' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.eco.azione, 'salvaRapportino');
    assert.equal(r.eco.metodo, 'POST');
    assert.equal(r.eco.codice, undefined, 'il codice non va al server');
    assert.equal(r.eco.disp, 'tel-vecchio');
    const g = await (await fetch(url + '?codice=prova&azione=rapportini&tutti=1')).json();
    assert.equal(g.eco.metodo, 'GET');
    assert.equal(g.eco.tutti, '1');
    const z = await manda({ codice: 'sbagliato', azione: 'anagrafiche' });
    assert.equal(z.errore, 'Codice sbagliato');
  } finally {
    await n.ferma();
  }
  assert.equal(n.visti.length, 2, 'il codice sbagliato non arriva al NAS');
  assert.ok(n.visti.every(l => l.lavoro.tipo === 'ponte' && !l.lavoro.token));
  assert.equal(JSON.stringify(finto.fogli.get('Rapportini').celle), rapportiniPrima, 'il foglio non e\' stato toccato');
  assert.ok(finto.fogli.get('Accessi').celle.some(r => r[1] === 'ponte' && r[2] === 'salvaRapportino'), 'in Accessi come il ponte di sempre');
  // Server spento: errore che esce dallo script (pagina HTML), cosi' le app vecchie riprovano.
  svuota();
  const h = await manda({ codice: 'prova', azione: 'salvaRapportino', rapportino: { idLocale: 'vecchio-2' } });
  assert.match(h.html, /^<!DOCTYPE html>/);
  finto.proprieta.delete('PONTE_PORTA');
});

test('la pulizia: via dalla coda le richieste vecchie o finite, via da Drive i file rimasti indietro', () => {
  svuota();
  const c = cache();
  const ora = Date.now();
  c.put('porta:s:vecchia-00001', JSON.stringify({ s: 'coda', c: ora - 11 * 60000, t: ora - 11 * 60000, n: 0, l: 10 }), 600);
  c.put('porta:s:pronta-000001', JSON.stringify({ s: 'pronta', c: ora, t: ora, n: 1, l: 10 }), 600);
  c.put('porta:s:viva-0000001', JSON.stringify({ s: 'coda', c: ora, t: ora, n: 0, l: 10 }), 600);
  c.put('porta:coda', JSON.stringify(['vecchia-00001', 'pronta-000001', 'sparita-00001', 'viva-0000001']), 1200);
  const cartella = finto.contesto.portaCartella(true);
  const vecchio = cartella.createFile('porta-r-vecchio.json', '{}', 'application/json');
  vecchio.data = new Date(ora - 40 * 60000);
  const nuovo = cartella.createFile('porta-r-nuovo.json', '{}', 'application/json');
  const tolti = finto.contesto.portaPulizia();
  assert.deepEqual(JSON.parse(JSON.stringify(tolti)), { coda: 3, file: 1 });
  assert.deepEqual(JSON.parse(c.get('porta:coda')), ['viva-0000001']);
  assert.equal(vecchio.isTrashed(), true);
  assert.equal(nuovo.isTrashed(), false);
  svuota();
});

test('la cache del finto Google ha i limiti di quella vera', () => {
  const c = cache();
  assert.throws(() => c.put('x', 'a'.repeat(100 * 1024 + 1)), /too large/);
  assert.throws(() => c.put('x'.repeat(251), 'a'), /too large/);
  assert.throws(() => c.put('x', 'a', 21601), /expiration/);
  c.put('porta:prova-limiti', 'a'.repeat(90000), 60);
  assert.equal(c.get('porta:prova-limiti').length, 90000);
  svuota();
});
