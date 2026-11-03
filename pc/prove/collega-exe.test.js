// Entrare col telefono, la parte del computer in C# (pc/WisperUfficio/CollegaQr.cs): WisperUfficio.exe decifra il caso
// fisso del server (server/prove/casi-collega.json) con --prova-collega, senza aprire finestre, senza installarsi e
// senza toccare la configurazione; e fa il testo del QR come pc/ui/regole-collegamento.js.
// Serve una build: cd pc/WisperUfficio && dotnet build (l'exe finisce in %LOCALAPPDATA%\WisperUfficio-build, vedi
// pc/Directory.Build.props), oppure WISPER_EXE=<percorso dell'exe>. Senza build la prova si salta (e lo dice).
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const K = require('../ui/regole-collegamento.js');

const EXE = process.env.WISPER_EXE || path.join(process.env.LOCALAPPDATA || '', 'WisperUfficio-build', 'WisperUfficio', 'bin', 'Debug', 'net8.0-windows', 'WisperUfficio.exe');
const CASI = path.join(__dirname, '..', '..', 'server', 'prove', 'casi-collega.json');
const senzaExe = process.platform !== 'win32' || !fs.existsSync(EXE);

test('WisperUfficio.exe decifra il caso fisso del server e scrive il QR come la pagina', { skip: senzaExe ? 'manca la build di WisperUfficio.exe (dotnet build in pc/WisperUfficio)' : false }, () => {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-collega-exe-'));
  const esito = path.join(os.tmpdir(), 'wisper-collega-esito-' + process.pid + '.json');
  try {
    execFileSync(EXE, ['--no-installa', '--dati', dati, '--prova-collega', CASI, esito], { timeout: 60000, stdio: 'ignore' });
    const r = JSON.parse(fs.readFileSync(esito, 'utf8'));
    assert.equal(r.ok, true, JSON.stringify(r.casi));
    const casi = JSON.parse(fs.readFileSync(CASI, 'utf8')).casi;
    assert.equal(r.casi.length, casi.length);
    r.casi.forEach(c => assert.equal(c.ok, true, c.nome + ': ' + c.errore));
    // Il testo del QR e il nome tagliato uguali a quelli delle regole della pagina.
    assert.equal(r.testoEsempio, K.testoQr('AAAAAAAAAAAAAAAAAAAAAA', 'A51pUoMUCK9srHCmm9ih3tT6Q5ygBc8YetQmqaWOpAWl', 'PC di Laura · Città (1)'));
    assert.equal(r.nomeLungo, K.nomeQr('€'.repeat(40)));
    assert.deepEqual(fs.readdirSync(dati), [], 'la configurazione non si tocca');
  } finally {
    fs.rmSync(dati, { recursive: true, force: true });
    fs.rmSync(esito, { force: true });
  }
});

/** L'exe col giro vero (--prova-collega-vivo) contro quel server: torna {codice, esito, testo, dati}. */
function dalVivo(server, quandoCeIlTesto) {
  const { spawn } = require('node:child_process');
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-collega-vivo-'));
  const fileTesto = path.join(dati, 'testo-qr.txt');
  const esito = path.join(dati, 'esito.json');
  const exe = spawn(EXE, ['--no-installa', '--dati', dati, '--server', server, '--prova-collega-vivo', fileTesto, esito], { stdio: 'ignore' });
  return new Promise((ok, no) => {
    let letto = false;
    const guarda = setInterval(async () => {
      if (letto || !fs.existsSync(fileTesto)) return;
      letto = true;
      try { await quandoCeIlTesto(fs.readFileSync(fileTesto, 'utf8')); } catch (e) { no(e); }
    }, 100);
    const ferma = setTimeout(() => { exe.kill(); }, 45000);
    exe.on('exit', codice => {
      clearInterval(guarda);
      clearTimeout(ferma);
      ok({ codice, esito: fs.existsSync(esito) ? JSON.parse(fs.readFileSync(esito, 'utf8')) : null, testo: letto ? fs.readFileSync(fileTesto, 'utf8') : '', dati });
    });
  });
}

test('WisperUfficio.exe dal vivo: il QR col nome del computer, il telefono autorizza, il computer entra e la chiave funziona', { skip: senzaExe ? 'manca la build di WisperUfficio.exe' : false, timeout: 90000 }, async () => {
  const { avvia } = require('../../server/src/avvio');
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-collega-server-'));
  const { wisper, server } = avvia({ dati, prova: true, env: {}, pianifica: false, portaGoogle: false });
  // La porta del server di prova di questa prova (8769, nel giro di quelle per le prove del collegamento).
  await new Promise(r => server.listen(8769, '127.0.0.1', r));
  let vivo;
  try {
    const chiama = (token, corpo) => fetch('http://127.0.0.1:8769/exec', { method: 'POST', headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(corpo) }).then(r => r.json());
    vivo = await dalVivo('http://127.0.0.1:8769', async testo => {
      const letto = K.leggiTestoQr(testo);
      assert.ok(letto, 'il telefono accetta il testo del QR fatto dal programma: ' + testo);
      // Il nome del computer (Environment.MachineName): c'è, ed è già come lo vuole il server.
      assert.equal(letto.nome, K.nomeQr(letto.nome));
      const a = await chiama(null, { azione: 'accedi', email: 'manuel@esempio.it', password: 'prova', disp: 'telefono-prova', dispNome: 'Telefono di prova', app: 'prove' });
      const r = await chiama(a.token, Object.assign({ azione: 'autorizzaComputer' }, letto));
      assert.equal(r.ok, true, r.errore);
    });
    assert.equal(vivo.codice, 0, JSON.stringify(vivo.esito));
    assert.equal(vivo.esito.stato, 'entrato');
    assert.equal(vivo.esito.utente.email, 'manuel@esempio.it');
    assert.equal(vivo.esito.io.email, 'manuel@esempio.it', 'il programma lavora col token appena salvato');
    // La chiave d'accesso sul disco è cifrata (DPAPI): in chiaro c'è solo l'email.
    const conf = JSON.parse(fs.readFileSync(path.join(vivo.dati, 'configurazione.json'), 'utf8'));
    assert.equal(conf.email, 'manuel@esempio.it');
    assert.ok(conf.token.length > 100, 'il token c\'è, cifrato');
    const sessione = wisper.db.riga("SELECT * FROM sessioni WHERE app LIKE 'Wisper Ufficio · %' ORDER BY id DESC LIMIT 1");
    assert.ok(sessione && conf.token.indexOf(sessione.token_hash) < 0);
    assert.equal(sessione.disp, conf.dispositivo, 'la sessione ha il dispositivo del computer');
  } finally {
    await new Promise(r => { server.close(() => r()); if (server.closeAllConnections) server.closeAllConnections(); });
    wisper.chiudi();
    if (vivo) fs.rmSync(vivo.dati, { recursive: true, force: true });
    fs.rmSync(dati, { recursive: true, force: true });
  }
});

test('WisperUfficio.exe dal vivo, il server di casa non risponde: "lontano"', { skip: senzaExe ? 'manca la build di WisperUfficio.exe' : false, timeout: 60000 }, async () => {
  // 8764: nessuno risponde.
  const vivo = await dalVivo('http://127.0.0.1:8764', async () => {});
  try {
    assert.equal(vivo.codice, 1);
    assert.equal(vivo.esito.stato, 'lontano');
    assert.equal(vivo.esito.entrato, false);
  } finally {
    fs.rmSync(vivo.dati, { recursive: true, force: true });
  }
});
