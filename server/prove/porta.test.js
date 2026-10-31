// La porta Google dal lato del server (src/porta.js) contro lo script vero (apps-script/Porta.gs)
// nel finto Google: un'app fuori casa manda la richiesta allo script, il server va a prenderla
// da solo, la fa con gli stessi permessi e lo stesso registro, e la risposta torna all'app.
// Niente Google vero, niente rete fuori dal computer.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serverDiProva, SEGRETO } = require('./aiuto');
const { PortaGoogle } = require('../src/porta');

process.env.WISPER_POSTA_FINTA = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-posta-'));
const finto = require('../../apps-script/prove/finto-google.js');
finto.proprieta.set('SEGRETO_SERVER', SEGRETO);

const dormi = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

let google;
let script;
let s;

async function aspetta(condizione, ms, cosa) {
  const fine = Date.now() + (ms || 10000);
  while (!condizione()) {
    if (Date.now() > fine) throw new Error('non succede: ' + (cosa || 'condizione'));
    await dormi(50);
  }
}

test.before(async () => {
  google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  await new Promise(r => google.on('listening', r));
  script = 'http://127.0.0.1:' + google.address().port + '/exec';
  s = await serverDiProva({ env: { SEGRETO_SERVER: SEGRETO, WISPER_POSTINO_URL: script, WISPER_PORTA_ATTESA: '3' }, portaGoogle: true });
  await aspetta(() => s.wisper.porta.ultimoContatto > 0, 10000, 'il primo contatto con lo script');
});
test.after(async () => {
  if (s) await s.ferma();
  if (google) await finto.chiudiHttp(google);
});

let numero = 0;
const nuovoId = () => 'prova-' + String(++numero).padStart(4, '0') + '-' + crypto.randomBytes(4).toString('hex');

/** Un'app fuori casa: la richiesta va allo script del foglio, con il campo porta. */
async function viaGoogle(corpo) {
  const r = await fetch(script, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ porta: 1 }, corpo)) });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { html: t }; }
}
const exec = (token, dati, altro) => viaGoogle(Object.assign({ id: nuovoId(), token, strada: 'exec', dati }, altro || {}));
async function accediDaGoogle(email, password) {
  return exec('', { azione: 'accedi', email, password: password === undefined ? 'prova' : password, disp: 'tel-fuori-' + email, dispNome: 'telefono fuori casa', app: 'prove' });
}
async function tokenDaGoogle(email) {
  const r = await accediDaGoogle(email);
  assert.equal(r.ok, true, 'accedi ' + email + ': ' + r.errore);
  return r.token;
}
// Le righe di node:sqlite non hanno prototipo: si copiano in oggetti normali per confrontarle.
const ultimiAccessi = n => s.wisper.db.righe('SELECT esito, azione, ip, da_fuori, utente_id FROM accessi ORDER BY id DESC LIMIT ?', n).map(r => Object.assign({}, r));

test('accedi e lavora dalla porta Google: stessi permessi, nel registro come "google" da fuori', async () => {
  const manuel = await tokenDaGoogle('manuel@esempio.it');
  const io = await exec(manuel, { azione: 'io' });
  assert.equal(io.ok, true);
  assert.equal(io.utente.nome, 'Manuel Gasparotto');
  assert.deepEqual(ultimiAccessi(1)[0], { esito: 'ok', azione: 'io', ip: 'google', da_fuori: 1, utente_id: io.utente.id });
  // Marco (collaboratore, senza "costi"): solo i suoi rapportini e senza i soldi, come da casa.
  const marco = await tokenDaGoogle('marco@esempio.it');
  const r = await exec(marco, { azione: 'rapportini', tutti: '1' }, { metodo: 'GET' });
  assert.equal(r.ok, true, r.errore);
  assert.ok(r.rapportini.length > 0);
  assert.ok(r.rapportini.every(x => !('totale' in x)), 'il server toglie i soldi anche da Google');
  const daCasa = await s.leggi(marco, { azione: 'rapportini', tutti: '1' });
  assert.deepEqual(r.rapportini.map(x => x.id).sort(), daCasa.rapportini.map(x => x.id).sort(), 'la stessa risposta di casa');
  assert.equal((await exec(marco, { azione: 'salvaPermessi', ruolo: 'lettura', permessi: {} })).permesso, false);
  // Senza token: accesso scaduto, come da casa.
  assert.equal((await exec('', { azione: 'io' })).accesso, false);
  assert.equal((await exec('token-inventato', { azione: 'io' })).accesso, false);
  assert.equal(ultimiAccessi(1)[0].esito, 'accesso negato');
  assert.equal(ultimiAccessi(1)[0].ip, 'google');
});

test('una scrittura ripetuta con lo stesso id non si fa due volte (anche da casa a Google)', async () => {
  const manuel = await tokenDaGoogle('manuel@esempio.it');
  const conta = nome => s.wisper.db.riga('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome).n;
  const id = nuovoId();
  const dati = { azione: 'salvaReferente', referente: { idSoggetto: 'C002', nome: 'Referente da Google', ruolo: 'Acquisti' } };
  const a = await viaGoogle({ id, token: manuel, strada: 'exec', dati });
  assert.equal(a.ok, true, a.errore);
  // La risposta e' "persa": l'app riprova con lo stesso id (lo script l'ha gia' consegnata e dimenticata).
  const b = await viaGoogle({ id, token: manuel, strada: 'exec', dati });
  assert.equal(b.referente.id, a.referente.id);
  assert.equal(conta('Referente da Google'), 1);
  // La stessa richiesta mandata da casa con idRichiesta (la regola di casa: prima casa, poi Google).
  const c = await s.chiama(manuel, Object.assign({ idRichiesta: id }, dati));
  assert.equal(c.referente.id, a.referente.id);
  assert.equal(conta('Referente da Google'), 1);
  // Con un altro accesso lo stesso id non vale: si fa (e' un'altra persona).
  const laura = await tokenDaGoogle('laura@esempio.it');
  await viaGoogle({ id, token: laura, strada: 'exec', dati });
  assert.equal(conta('Referente da Google'), 2);
  // Un rapportino con lo stesso idLocale da due richieste diverse: uno solo (la coda del telefono).
  const rap = { azione: 'salvaRapportino', rapportino: { idLocale: 'porta-rap-1', data: '2026-10-30', idCliente: 'C002', descrizione: 'Dalla porta Google', oreLavoro: 2, tariffa: 40 } };
  const r1 = await exec(manuel, rap);
  const r2 = await exec(manuel, rap);
  assert.equal(r1.ok, true, r1.errore);
  assert.equal(r1.rapportino.id, r2.rapportino.id);
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM rapportini WHERE id_locale = 'porta-rap-1'").n, 1);
  // accedi non si ricorda mai (dentro c'e' il token).
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM richieste_fatte WHERE risposta LIKE '%token%'").n, 0);
});

test('un file grande avanti e indietro: /carica e /file dalla porta Google', async () => {
  const manuel = await tokenDaGoogle('manuel@esempio.it');
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(3 * 1024 * 1024)]);
  const su = await viaGoogle({ id: nuovoId(), token: manuel, strada: 'carica', disp: 'tel-fuori', dispNome: 'telefono fuori casa', app: 'prove',
    query: { nome: 'Schema grande.pdf', mime: 'application/pdf', idFile: 'porta-file-1', per: 'documento' }, base64: pdf.toString('base64') });
  assert.equal(su.ok, true, su.errore);
  assert.equal(su.file.byte, pdf.length);
  assert.equal(su.file.sha256, sha(pdf));
  assert.deepEqual(ultimiAccessi(1)[0], { esito: 'ok', azione: 'carica', ip: 'google', da_fuori: 1, utente_id: 1 });
  // La coda del telefono che ripete: lo stesso idFile, lo stesso file.
  const ancora = await viaGoogle({ id: nuovoId(), token: manuel, strada: 'carica', query: { nome: 'Schema grande.pdf', mime: 'application/pdf', idFile: 'porta-file-1', per: 'documento' }, base64: pdf.toString('base64') });
  assert.equal(ancora.file.id, su.file.id);
  const giu = await viaGoogle({ id: nuovoId(), token: manuel, strada: 'file', file: su.file.id });
  assert.equal(giu.ok, true, giu.errore);
  assert.equal(giu.nome, 'Schema grande.pdf');
  assert.equal(giu.mime, 'application/pdf');
  assert.ok(Buffer.from(giu.base64, 'base64').equals(pdf), 'il file torna uguale');
  assert.equal(ultimiAccessi(1)[0].azione, 'file');
  assert.equal(ultimiAccessi(1)[0].ip, 'google');
  // I codici di /file arrivano nel JSON.
  const manca = await viaGoogle({ id: nuovoId(), token: manuel, strada: 'file', file: 'nonCeQuestoFile' });
  assert.equal(manca.ok, false);
  assert.equal(manca.stato, 404);
  const senza = await viaGoogle({ id: nuovoId(), token: 'sbagliato', strada: 'file', file: su.file.id });
  assert.equal(senza.stato, 401);
  assert.equal(senza.accesso, false);
  // I passaggi grandi sono andati su Drive e via (senza il servizio Drive API, nel cestino).
  const cartella = finto.contesto.portaCartella(false);
  assert.ok(cartella && cartella.figli.length >= 2);
  assert.ok(cartella.figli.every(f => f.isTrashed()));
});

test('NAS spento: l\'app riceve "riprova" nel tempo massimo, e la richiesta arriva una volta sola', async () => {
  const manuel = await tokenDaGoogle('manuel@esempio.it');
  finto.proprieta.set('PORTA_ATTESA_MS', '2000');
  try {
    await s.wisper.porta.ferma();
    // Il NAS si e' fatto vivo da poco: l'app aspetta il tempo massimo, poi "riprova".
    const id = nuovoId();
    const dati = { azione: 'salvaReferente', referente: { idSoggetto: 'C002', nome: 'Referente col NAS spento' } };
    const t0 = Date.now();
    const r = await viaGoogle({ id, token: manuel, strada: 'exec', dati });
    const ms = Date.now() - t0;
    assert.equal(r.ok, false);
    assert.equal(r.rete, true);
    assert.equal(r.porta, 'attesa');
    assert.ok(ms >= 1900 && ms < 6000, ms + ' ms');
    // Senza notizie dal NAS da piu' di un minuto e mezzo: "spento", subito, con l'ora.
    finto.contesto.CacheService.getScriptCache().put('porta:nas', String(Date.now() - 2 * 60000), 21600);
    const t1 = Date.now();
    const spento = await exec(manuel, { azione: 'io' });
    assert.equal(spento.porta, 'spento');
    assert.match(spento.errore, /non risponde dalle \d{2}:\d{2}/);
    assert.ok(Date.now() - t1 < 1900);
    assert.match(s.wisper.porta.stato().stato, /fermo/);
    // Il NAS torna: la richiesta rimasta in coda si fa, e l'app che riprova con lo stesso id riceve quella risposta.
    s.wisper.porta.avvia();
    await aspetta(() => s.wisper.db.riga("SELECT COUNT(*) n FROM referenti WHERE nome = 'Referente col NAS spento'").n === 1, 10000, 'la richiesta in coda');
    const di = await viaGoogle({ id, token: manuel, strada: 'exec', dati });
    assert.equal(di.ok, true, di.errore);
    assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM referenti WHERE nome = 'Referente col NAS spento'").n, 1);
  } finally {
    finto.proprieta.delete('PORTA_ATTESA_MS');
    s.wisper.porta.avvia();
  }
});

test('otto richieste insieme: tutte con la loro risposta', async () => {
  const manuel = await tokenDaGoogle('manuel@esempio.it');
  const azioni = ['io', 'anagrafiche', 'dashboard', 'copie', 'io', 'numerazioni', 'utenti', 'io'];
  const r = await Promise.all(azioni.map(a => exec(manuel, { azione: a })));
  r.forEach((x, i) => assert.equal(x.ok, true, azioni[i] + ': ' + x.errore));
  assert.equal(r[0].utente.nome, 'Manuel Gasparotto');
  assert.ok(r[1].clienti);
  assert.ok(r[3].google, 'Amministrazione: copie dice lo stato del collegamento');
});

test('il segreto sbagliato: il collegamento lo dice e non prende niente', async () => {
  const sbagliata = new PortaGoogle(s.wisper, { url: script, segreto: 'segreto-sbagliato', attesaS: 1 });
  sbagliata.avvia();
  await aspetta(() => sbagliata.erroriDiFila > 0, 10000, 'il primo errore');
  const st = sbagliata.stato();
  await sbagliata.ferma();
  assert.equal(st.stato, 'non risponde');
  assert.match(st.ultimoErrore, /Segreto sbagliato/);
  assert.equal(st.oggi.lavori, 0);
  const accessi = finto.fogli.get('Accessi').celle;
  assert.ok(accessi.some(r => r[1] === 'rifiutato' && r[2] === 'portaPrendi'));
  assert.ok(!JSON.stringify(accessi).includes(SEGRETO));
});

test('una versione vecchia col codice passa dalla coda e arriva al server come il titolare', async () => {
  finto.proprieta.set('PONTE_PORTA', 'si');
  try {
    const a = await (await fetch(script + '?codice=prova&disp=tel-vecchio&dispNome=telefono%200.4.0')).json();
    assert.equal(a.ok, true, a.errore);
    assert.ok(a.fornitori, 'e\' la risposta del server');
    const r = await (await fetch(script, { method: 'POST', body: JSON.stringify({ codice: 'prova', azione: 'salvaRapportino', disp: 'tel-vecchio', dispNome: 'telefono 0.4.0',
      rapportino: { idLocale: 'porta-vecchio-1', data: '2026-10-29', idCliente: 'C002', descrizione: 'Dal telefono vecchio', oreLavoro: 1, tariffa: 40 } }) })).json();
    assert.equal(r.ok, true, r.errore);
    const riga = s.wisper.db.riga("SELECT * FROM rapportini WHERE id_locale = 'porta-vecchio-1'");
    assert.ok(riga);
    const nota = s.wisper.db.riga("SELECT nota FROM registro WHERE tabella = 'rapportini' AND id_riga = ? ORDER BY id DESC LIMIT 1", riga.id);
    assert.match(nota.nota, /ponte/);
    const acc = Object.assign({}, s.wisper.db.riga("SELECT esito, ip, da_fuori FROM accessi WHERE azione = 'salvaRapportino' ORDER BY id DESC LIMIT 1"));
    assert.deepEqual(acc, { esito: 'ponte', ip: 'google', da_fuori: 1 });
    // Il codice sbagliato si ferma allo script.
    const no = await (await fetch(script + '?codice=sbagliato')).json();
    assert.equal(no.errore, 'Codice sbagliato');
  } finally {
    finto.proprieta.delete('PONTE_PORTA');
  }
});

test('/salute e Amministrazione: "Collegamento a Google: attivo, ultimo contatto alle ..."', async () => {
  await aspetta(() => s.wisper.porta.stato().stato === 'attivo', 10000, 'attivo');
  const salute = await (await fetch(s.url + '/salute')).json();
  assert.equal(salute.google.stato, 'attivo');
  assert.match(salute.google.frase, /^Attivo, ultimo contatto alle \d{2}:\d{2}$/);
  assert.match(salute.google.ultimoContatto, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.ok(salute.google.oggi.lavori > 0);
  const manuel = await s.come('manuel@esempio.it');
  const copie = await manuel('copie');
  assert.equal(copie.google.stato, 'attivo');
  // Lo script dice lo stesso alle app (senza chiedere al server).
  assert.equal((await viaGoogle({ strada: 'salute' })).server, 'acceso');
});

test('la firma di casa: solo il server vero la sa fare', async () => {
  const manuel = await s.come('manuel@esempio.it');
  const hash = sha(manuel.token);
  const prova = crypto.randomBytes(16).toString('hex');
  const r = await (await fetch(s.url + '/salute?prova=' + prova + '&chi=' + hash.slice(0, 16))).json();
  assert.equal(r.firma, crypto.createHmac('sha256', hash).update(prova).digest('hex'));
  // Un altro token, un token uscito, un chi sbagliato: niente firma.
  assert.equal((await (await fetch(s.url + '/salute?prova=' + prova + '&chi=0000000000000000')).json()).firma, undefined);
  await manuel('esci');
  assert.equal((await (await fetch(s.url + '/salute?prova=' + prova + '&chi=' + hash.slice(0, 16))).json()).firma, undefined);
  assert.equal((await (await fetch(s.url + '/salute?prova=corta&chi=' + hash.slice(0, 16))).json()).firma, undefined);
});

test('i tentativi d\'accesso da Google contano a parte: per email e per tutto Google', async () => {
  const giaEntrato = await tokenDaGoogle('manuel@esempio.it');
  s.wisper.db.esegui('DELETE FROM tentativi_accesso');
  try {
    // 10 password sbagliate per Laura da Google: da Google Laura e' ferma, da casa entra.
    for (let i = 0; i < 10; i += 5) {
      await Promise.all([0, 1, 2, 3, 4].map(() => accediDaGoogle('laura@esempio.it', 'sbagliata')));
    }
    assert.match((await accediDaGoogle('laura@esempio.it')).errore, /Troppi tentativi/);
    // 30 sbagliate in tutto da Google (email qualunque, anche quella ferma conta): gli accessi nuovi da Google si
    // fermano per 15 minuti. Le ultime una alla volta: la nota nel registro la scrive il tentativo che arriva a 30.
    const tutte = Array.from({ length: 19 }, (_, i) => 'nessuno' + i + '@esempio.it');
    for (let i = 0; i < 14; i += 7) await Promise.all(tutte.slice(i, i + 7).map(e => accediDaGoogle(e, 'x')));
    for (const e of tutte.slice(14)) await accediDaGoogle(e, 'x');
    assert.match((await accediDaGoogle('manuel@esempio.it')).errore, /Troppi tentativi/);
    const nota = s.wisper.db.riga("SELECT nota FROM registro WHERE tabella = 'tentativi_accesso' AND id_riga = 'google'");
    assert.match(nota.nota, /accessi nuovi attraverso Google fermati/);
    assert.equal((await exec(giaEntrato, { azione: 'io' })).ok, true, 'chi era gia\' entrato da Google continua');
    // Da casa si entra lo stesso.
    assert.equal((await s.chiama(null, { azione: 'accedi', email: 'laura@esempio.it', password: 'prova' })).ok, true, 'Laura da casa');
    assert.equal((await s.chiama(null, { azione: 'accedi', email: 'manuel@esempio.it', password: 'prova' })).ok, true, 'Manuel da casa');
  } finally {
    s.wisper.db.esegui('DELETE FROM tentativi_accesso');
  }
});

test('la prova a tempo reale: quanto aspetta un\'app che passa da Google (finto Google + server di prova)', async () => {
  const manuel = await tokenDaGoogle('manuel@esempio.it');
  const tempi = [];
  for (let i = 0; i < 20; i++) {
    const t0 = Date.now();
    const r = await exec(manuel, { azione: 'io' });
    tempi.push(Date.now() - t0);
    assert.equal(r.ok, true);
  }
  // Da casa, direttamente, per confronto.
  const casa = [];
  for (let i = 0; i < 20; i++) {
    const t0 = Date.now();
    await s.chiama(manuel, { azione: 'io' });
    casa.push(Date.now() - t0);
  }
  const ordina = a => a.slice().sort((x, y) => x - y);
  const mediana = a => ordina(a)[Math.floor(a.length / 2)];
  const p90 = a => ordina(a)[Math.floor(a.length * 0.9)];
  const st = s.wisper.porta.stato().oggi;
  console.log('[misura] porta Google (finto Google in locale): mediana ' + mediana(tempi) + ' ms, 90% entro ' + p90(tempi) + ' ms, massimo ' + Math.max(...tempi) +
    ' ms; da casa diretto: mediana ' + mediana(casa) + ' ms; in coda sullo script in media ' + st.attesaInCodaMs + ' ms, lavoro del server ' + st.lavoroMs + ' ms');
  assert.ok(mediana(tempi) < 2000, 'mediana ' + mediana(tempi) + ' ms');
});
