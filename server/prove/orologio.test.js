// L'orologio di prova (WISPER_OGGI_PROVA=AAAA-MM-GG): sposta il giorno, non le ore; una data sbagliata ferma tutto; lo
// accende solo --prova. Il server vero, avviato da riga di comando come sul NAS e con la variabile nell'ambiente (come
// se fosse finita nel .env), scrive le sue righe col giorno vero.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const U = require('../src/utili');

const AVVIO = path.join(__dirname, '..', 'src', 'avvio.js');
// Il giorno vero, senza l'orologio di prova (che giorni.js puo' aver acceso per tutte le prove).
const veroOggi = () => U.dataIso(new Date());
// Un giorno che non e' oggi, vicino (i dati di esempio nascono attorno a quel giorno).
const altroGiorno = () => U.piuGiorni(veroOggi(), 3);

function portaLibera() {
  return new Promise(r => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
  });
}

/** Il server da riga di comando, come sul NAS (node src/avvio.js --dati ...), con WISPER_OGGI_PROVA nell'ambiente. */
async function avviaDaRiga(argomenti, giorno) {
  const porta = await portaLibera();
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-orologio-'));
  const env = Object.assign({}, process.env, { WISPER_OGGI_PROVA: giorno, WISPER_PORTA_GOOGLE: 'no' });
  delete env.NODE_TEST_CONTEXT;
  delete env.WISPER_POSTINO_URL;
  const figlio = spawn(process.execPath, [AVVIO, '--dati', dati, '--porta', String(porta), ...argomenti], { env });
  let uscita = '';
  figlio.stdout.on('data', p => { uscita += p; });
  figlio.stderr.on('data', p => { uscita += p; });
  const finito = new Promise(r => figlio.on('exit', r));
  await new Promise((pronto, rotto) => {
    const t = setTimeout(() => rotto(new Error('il server non parte:\n' + uscita)), 60000);
    const guarda = () => { if (/Porta Google:.*\n/.test(uscita)) { clearTimeout(t); pronto(); } };
    figlio.stdout.on('data', guarda);
    figlio.on('exit', () => { clearTimeout(t); rotto(new Error('il server si e\' fermato:\n' + uscita)); });
  });
  // Le ultime righe dell'avvio (l'orologio di prova viene dopo la porta Google).
  await new Promise(r => setTimeout(r, 300));
  const exec = async (corpo, token) => (await fetch('http://127.0.0.1:' + porta + '/exec', {
    method: 'POST', body: JSON.stringify(corpo),
    headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, token ? { Authorization: 'Bearer ' + token } : {}),
  })).json();
  return {
    dati, exec, uscita: () => uscita,
    ferma: async () => { figlio.kill(); await finito; },
  };
}

test('l\'orologio di prova: cambia il giorno, le ore restano quelle vere; una data sbagliata ferma tutto', () => {
  const prima = U.orologioDiProva();
  try {
    assert.throws(() => U.accendiOrologioDiProva('2027-02-29'), /WISPER_OGGI_PROVA non e' una data AAAA-MM-GG: "2027-02-29"/);
    assert.throws(() => U.accendiOrologioDiProva('31/12/2026'), /non e' una data/);
    assert.equal(U.accendiOrologioDiProva('2028-02-29'), '2028-02-29');
    const vero = new Date();
    assert.equal(U.oggi(), '2028-02-29');
    assert.equal(U.adesso().slice(0, 10), '2028-02-29');
    assert.equal(U.dataIso(U.ora()), '2028-02-29');
    // Le ore quelle vere (salvo il minuto che passa).
    const minuti = d => d.getHours() * 60 + d.getMinutes();
    assert.ok(Math.abs(minuti(U.ora()) - minuti(vero)) <= 1, U.adesso());
    assert.ok(Math.abs(U.adessoMs() - U.ora().getTime()) < 1000);
    assert.equal(U.piuGiorni(U.oggi(), 1), '2028-03-01');
    U.spegniOrologioDiProva();
    assert.equal(U.orologioDiProva(), '');
    assert.equal(U.oggi(), veroOggi());
  } finally {
    if (prima) U.accendiOrologioDiProva(prima);
    else U.spegniOrologioDiProva();
  }
});

test('il server vero (senza --prova) non guarda WISPER_OGGI_PROVA: le sue righe hanno il giorno vero', async () => {
  const giorno = altroGiorno();
  const prima = veroOggi();
  const s = await avviaDaRiga([], giorno);
  try {
    assert.equal(/Orologio di prova/.test(s.uscita()), false, s.uscita());
    // Un accesso sbagliato lascia la sua riga (accessi e tentativi_accesso) con l'ora del server.
    const r = await s.exec({ azione: 'accedi', email: 'nessuno@esempio.it', password: 'sbagliata', disp: 'prova-orologio' });
    assert.equal(r.ok, false);
  } finally {
    await s.ferma();
  }
  const dopo = veroOggi();
  const db = new DatabaseSync(path.join(s.dati, 'wisper.db'), { readOnly: true });
  try {
    const giorni = db.prepare('SELECT quando FROM tentativi_accesso UNION ALL SELECT quando FROM accessi').all().map(x => String(x.quando).slice(0, 10));
    assert.ok(giorni.length >= 1, 'nessuna riga scritta');
    for (const g of giorni) {
      assert.notEqual(g, giorno, 'il server vero ha usato il giorno di WISPER_OGGI_PROVA');
      assert.ok(g === prima || g === dopo, g + ' invece del giorno vero ' + prima);
    }
  } finally {
    db.close();
  }
});

test('il server di prova (--prova) usa WISPER_OGGI_PROVA e lo dice all\'avvio', async () => {
  const giorno = altroGiorno();
  const s = await avviaDaRiga(['--prova'], giorno);
  try {
    assert.match(s.uscita(), new RegExp('Orologio di prova: per il server oggi e\' ' + giorno));
    const a = await s.exec({ azione: 'accedi', email: 'manuel@esempio.it', password: 'prova', disp: 'prova-orologio' });
    assert.equal(a.ok, true, a.errore);
    // La settimana delle ore e' quella del giorno di prova.
    const settimana = await s.exec({ azione: 'ore' }, a.token);
    assert.equal(settimana.ok, true, settimana.errore);
    assert.ok(settimana.giorni.some(g => g.data === giorno), JSON.stringify(settimana.giorni.map(g => g.data)));
  } finally {
    await s.ferma();
  }
});

test('una data sbagliata in WISPER_OGGI_PROVA non fa partire il server di prova', async () => {
  await assert.rejects(avviaDaRiga(['--prova'], '2026-13-01'), /WISPER_OGGI_PROVA non e' una data AAAA-MM-GG/);
});
