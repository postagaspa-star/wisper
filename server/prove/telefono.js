/*
 * Le prove del telefono contro il server di prova vero (app/src/test/.../ServerDiProva*Test.kt), in un modo solo:
 *
 *   node server/prove/telefono.js [--giri N] [altri argomenti per gradle, es. --tests "*Fase4*"]
 *
 * Accende il finto Google con la porta (apps-script/prove/finto-google.js, col SEGRETO_SERVER) e un server di
 * prova nuovo (database in memoria coi dati di esempio, porte libere su 127.0.0.1) con l'orologio fermo al
 * giorno dei prototipi, giovedi' 22/10/2026 (giornoDeiPrototipi() di aiuto.js, come le prove del server delle
 * fasi 4 e 5); poi lancia ./gradlew :app:testDebugUnitTest --rerun con WISPER_SERVER_PROVA e WISPER_GOOGLE_PROVA,
 * N volte di fila sullo stesso server (--giri 2: le prove non devono dipendere da cosa ha fatto il giro prima),
 * e spegne tutto. --rerun serve: senza, gradle vede la prova "gia' fatta" e il secondo giro non gira davvero.
 * JAVA_HOME, se manca, e' quello di Android Studio. Esce con 1 se un giro non passa.
 * Non e' un file *.test.js: "npm test" (le prove del server) non lo fa girare.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RADICE = path.join(__dirname, '..', '..');
const RISULTATI = path.join(RADICE, 'app', 'build', 'test-results', 'testDebugUnitTest');

// La posta del finto Google in una cartella temporanea (di base andrebbe dentro il progetto): prima di caricarlo.
const postaFinta = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-telefono-posta-'));
process.env.WISPER_POSTA_FINTA = postaFinta;
const { serverDiProva, giornoDeiPrototipi, SEGRETO } = require('./aiuto');
const finto = require('../../apps-script/prove/finto-google.js');

function argomenti(argv) {
  const a = { giri: 1, gradle: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--giri') a.giri = Number(argv[++i]);
    else a.gradle.push(argv[i]);
  }
  if (!(a.giri >= 1)) throw new Error('--giri vuole un numero da 1 in su');
  return a;
}

/** Quante prove, fallite e saltate nei risultati di gradle (i file XML di JUnit). */
function conta() {
  const c = { prove: 0, fallite: 0, saltate: 0, nomi: [] };
  if (!fs.existsSync(RISULTATI)) return c;
  for (const f of fs.readdirSync(RISULTATI).filter(x => x.endsWith('.xml'))) {
    const x = fs.readFileSync(path.join(RISULTATI, f), 'utf8');
    const m = x.match(/<testsuite [^>]*tests="(\d+)" skipped="(\d+)" failures="(\d+)" errors="(\d+)"/);
    if (!m) continue;
    c.prove += Number(m[1]);
    c.saltate += Number(m[2]);
    c.fallite += Number(m[3]) + Number(m[4]);
    const re = /<testcase name="([^"]*)" classname="([^"]*)"[^>]*>\s*<(failure|error)/g;
    let t;
    while ((t = re.exec(x))) c.nomi.push(t[2].split('.').pop() + ' > ' + t[1].replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  }
  return c;
}

/** Lancia gradle e aspetta: torna il codice d'uscita. */
function gradle(args, env) {
  // Su Windows il .bat passa da cmd, con il percorso intero (cmd puo' non cercare nella cartella corrente) e gli
  // argomenti con spazi o asterischi tra virgolette.
  const figlio = process.platform === 'win32'
    ? spawn([path.join(RADICE, 'gradlew.bat'), ...args].map(a => (/[\s"*&|<>^]/.test(a) ? '"' + a.replace(/"/g, '""') + '"' : a)).join(' '),
      { cwd: RADICE, env, stdio: 'inherit', shell: true })
    : spawn(path.join(RADICE, 'gradlew'), args, { cwd: RADICE, env, stdio: 'inherit' });
  return new Promise(r => figlio.on('close', codice => r(codice === null ? 1 : codice)));
}

async function main() {
  const a = argomenti(process.argv.slice(2));
  const giorno = giornoDeiPrototipi();

  const google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  await new Promise(r => google.on('listening', r));
  const script = 'http://127.0.0.1:' + google.address().port + '/exec';
  finto.proprieta.set('SEGRETO_SERVER', SEGRETO);
  const s = await serverDiProva({ env: { SEGRETO_SERVER: SEGRETO, WISPER_POSTINO_URL: script, WISPER_PORTA_ATTESA: '3' }, portaGoogle: true });
  let esito = 1;
  try {
    // La porta comincia a chiedere lavoro allo script da sola: si aspetta il primo contatto.
    const fine = Date.now() + 15000;
    while (!(s.wisper.porta.ultimoContatto > 0)) {
      if (Date.now() > fine) throw new Error('il server non raggiunge il finto Google');
      await new Promise(r => setTimeout(r, 50));
    }
    console.log('Server di prova su ' + s.url + ' (oggi per il server: ' + giorno + '), finto Google su ' + script);

    const env = Object.assign({}, process.env, { WISPER_SERVER_PROVA: s.url, WISPER_GOOGLE_PROVA: script });
    delete env.WISPER_OGGI_PROVA; // e' del server, non di gradle
    const studio = 'C:\\Program Files\\Android\\Android Studio\\jbr';
    if (!env.JAVA_HOME && process.platform === 'win32' && fs.existsSync(studio)) env.JAVA_HOME = studio;

    const esiti = [];
    for (let giro = 1; giro <= a.giri; giro++) {
      console.log('\n--- Giro ' + giro + ' di ' + a.giri + ' sullo stesso server');
      if (fs.existsSync(RISULTATI)) fs.rmSync(RISULTATI, { recursive: true, force: true });
      const codice = await gradle([':app:testDebugUnitTest', '--rerun', ...a.gradle], env);
      esiti.push(Object.assign({ giro, codice }, conta()));
    }
    console.log('');
    for (const e of esiti) {
      console.log('Giro ' + e.giro + ': ' + e.prove + ' prove, ' + e.fallite + ' fallite, ' + e.saltate + ' saltate' + (e.codice ? ' (gradle: uscita ' + e.codice + ')' : ''));
      for (const n of e.nomi) console.log('  fallita: ' + n);
    }
    esito = esiti.every(e => e.codice === 0 && e.fallite === 0) ? 0 : 1;
  } finally {
    await s.ferma();
    await finto.chiudiHttp(google);
    for (const c of [s.dati, postaFinta]) fs.rmSync(c, { recursive: true, force: true });
  }
  return esito;
}

main().then(codice => process.exit(codice), err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
