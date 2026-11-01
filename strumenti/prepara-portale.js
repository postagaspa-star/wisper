// Prepara la pagina del portale clienti per Netlify (docs/gestionale/fase7.md §0.1).
//
//   node strumenti/prepara-portale.js --script <indirizzo dello script del PORTALE> --uscita <cartella>
//
// Mette nella cartella: index.html, portale.css, portale.js, _headers, il carattere Figtree (con la licenza),
// documenti.js e conti.js (gli stessi modelli dei PDF di telefono e computer, da pc/ui/) e config.js con l'indirizzo
// dello script del portale. La cartella si trascina su app.netlify.com/drop.
//
// L'indirizzo è quello dello script del PORTALE (il progetto Apps Script a parte, con Porta.gs e PortaleClienti.gs):
// MAI quello dello script del foglio, che resta segreto. config.js non va nel repository (.gitignore).
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RADICE = path.resolve(__dirname, '..');
const FILE = [
  ['portale/index.html', 'index.html'],
  ['portale/portale.css', 'portale.css'],
  ['portale/portale.js', 'portale.js'],
  ['portale/_headers', '_headers'],
  ['portale/font/Figtree.ttf', 'font/Figtree.ttf'],
  ['portale/font/figtree-OFL.txt', 'font/figtree-OFL.txt'],
  ['pc/ui/documenti.js', 'documenti.js'],
  ['pc/ui/conti.js', 'conti.js'],
];
const NOSTRI = new Set(FILE.map(f => f[1]).concat(['config.js', 'font']));

function fallisci(msg) {
  console.error(msg);
  process.exit(1);
}

/** L'indirizzo dello script: solo https://script.google.com/macros/s/<id>/exec (la CSP della pagina permette solo Google). */
function controllaScript(s) {
  let u;
  try { u = new URL(String(s || '')); } catch (e) { return 'Manca --script, o non è un indirizzo: serve quello dello script del portale (finisce con /exec)'; }
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com') return "L'indirizzo deve cominciare con https://script.google.com/ (la pagina parla solo con Google)";
  if (!/^\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/.test(u.pathname) || u.search || u.hash) return "L'indirizzo deve essere quello della distribuzione dello script, nella forma https://script.google.com/macros/s/<id>/exec";
  return '';
}

function prepara(script, uscita) {
  const e = controllaScript(script);
  if (e) fallisci(e);
  if (!uscita) fallisci('Manca --uscita <cartella>');
  const dest = path.resolve(uscita);
  if (dest === RADICE || dest.startsWith(path.join(RADICE, 'portale'))) fallisci('La cartella di uscita deve stare fuori dal repository (o almeno fuori da portale/)');
  if (fs.existsSync(dest)) {
    const altri = fs.readdirSync(dest).filter(n => !NOSTRI.has(n));
    if (altri.length) fallisci('La cartella ' + dest + ' contiene altri file (' + altri.slice(0, 5).join(', ') + '): Netlify li pubblicherebbe. Usa una cartella vuota.');
  }
  fs.mkdirSync(path.join(dest, 'font'), { recursive: true });
  FILE.forEach(([da, a]) => fs.copyFileSync(path.join(RADICE, da), path.join(dest, a)));
  fs.writeFileSync(path.join(dest, 'config.js'),
    '// Scritto da strumenti/prepara-portale.js. Lo script del PORTALE (mai quello del foglio).\nwindow.WISPER_PORTALE = { script: ' + JSON.stringify(String(script)) + ' };\n');
  return dest;
}

if (require.main === module) {
  const arg = process.argv.slice(2);
  const opz = n => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : ''; };
  const dest = prepara(opz('--script'), opz('--uscita'));
  console.log('Pagina del portale pronta in ' + dest);
  console.log('File: ' + FILE.map(f => f[1]).concat('config.js').join(', '));
  console.log('Prossimo passo: trascina la cartella su https://app.netlify.com/drop (sito per esempio "studiogm-portale").');
}

module.exports = { prepara, controllaScript, FILE };
