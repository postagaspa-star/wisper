/*
 * Tutte le prove del server su tanti giorni diversi, con l'orologio di prova (WISPER_OGGI_PROVA): le prove
 * devono passare qualunque giorno, anche di sabato, a Natale o il 29 febbraio.
 *
 *   node prove/giorni.js                       i giorni di sempre (sotto) e il giorno vero, senza orologio
 *   node prove/giorni.js 2027-04-05 2027-08-15 solo questi giorni
 *   npm run prove-giorni                       come il primo
 *
 * Un giorno alla volta (le prove di un giorno girano gia' in parallelo). Le uscite intere restano in una
 * cartella temporanea, scritta alla fine; esce con 1 se un giorno solo ha una prova rossa.
 * Non e' un file *.test.js: "npm test" non lo fa girare.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

process.env.TZ = 'Europe/Rome';

const GIORNI = [
  ['2026-11-02', 'lunedì'],
  ['2026-11-05', 'giovedì'],
  ['2026-11-07', 'sabato'],
  ['2026-11-08', 'domenica'],
  ['2026-11-01', 'domenica, Ognissanti'],
  ['2026-11-30', 'lunedì, ultimo del mese'],
  ['2026-12-25', 'venerdì, Natale'],
  ['2026-12-31', 'giovedì, ultimo dell\'anno'],
  ['2027-01-01', 'venerdì, Capodanno'],
  ['2027-03-29', 'lunedì, Pasquetta'],
  ['2028-02-29', 'martedì, anno bisestile'],
];

const NOMI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const file = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-giorni-'));

function unGiorno(giorno) {
  return new Promise(risolvi => {
    const env = Object.assign({}, process.env);
    delete env.NODE_TEST_CONTEXT;
    delete env.WISPER_OGGI_PROVA;
    if (giorno) env.WISPER_OGGI_PROVA = giorno;
    const inizio = Date.now();
    // Una prova ferma (che aspetta qualcosa che non arriva) diventa rossa dopo 5 minuti, invece di fermare tutto il giro.
    const figlio = spawn(process.execPath, ['--test', '--test-reporter=spec', '--test-timeout=300000', ...file], { cwd: path.join(__dirname, '..'), env });
    let uscita = '';
    figlio.stdout.on('data', p => { uscita += p; });
    figlio.stderr.on('data', p => { uscita += p; });
    const guardia = setTimeout(() => { uscita += '\n✖ failing tests:\n✖ il giro si e\' fermato: dopo 20 minuti non era finito\n'; figlio.kill(); }, 20 * 60 * 1000);
    figlio.on('close', codice => {
      clearTimeout(guardia);
      const log = path.join(cartella, (giorno || 'giorno-vero') + '.txt');
      fs.writeFileSync(log, uscita, 'utf8');
      const conta = nome => { const m = uscita.match(new RegExp('^ℹ ' + nome + ' (\\d+)', 'm')); return m ? Number(m[1]) : NaN; };
      const dopo = uscita.split('✖ failing tests:')[1] || '';
      const rosse = [...new Set(dopo.split('\n').filter(l => /^✖ /.test(l)).map(l => l.replace(/^✖ /, '').replace(/ \([\d.]+ms\)$/, '')))];
      risolvi({ giorno, codice, prove: conta('tests'), passate: conta('pass'), rosse, secondi: Math.round((Date.now() - inizio) / 1000), log });
    });
  });
}

async function principale() {
  const scelti = process.argv.slice(2);
  for (const g of scelti) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) {
      console.error('Si usa: node prove/giorni.js [AAAA-MM-GG ...]');
      process.exit(2);
    }
  }
  const lista = scelti.length ? scelti.map(g => [g, NOMI[new Date(g + 'T12:00:00').getDay()]]) : GIORNI.concat([['', 'giorno vero, senza orologio']]);
  const esiti = [];
  for (const [giorno, nota] of lista) {
    process.stdout.write((giorno || 'oggi vero ').padEnd(11) + ' ' + nota.padEnd(28) + ' ');
    const e = await unGiorno(giorno);
    e.nota = nota;
    esiti.push(e);
    const ok = e.codice === 0 && e.rosse.length === 0 && e.prove > 0;
    console.log((ok ? 'verde' : 'ROSSO') + '  ' + e.passate + '/' + e.prove + '  (' + e.secondi + ' s)');
    for (const r of e.rosse) console.log('             ✖ ' + r);
  }
  const rossi = esiti.filter(e => !(e.codice === 0 && e.rosse.length === 0 && e.prove > 0));
  console.log('\n' + (rossi.length ? rossi.length + ' giorni con prove rosse' : 'Tutti verdi: ' + esiti.length + ' giorni') + '. Le uscite intere: ' + cartella);
  process.exit(rossi.length ? 1 : 0);
}

principale();
