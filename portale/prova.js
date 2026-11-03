// Prova il portale sul PC, senza Google e senza Netlify: serve la pagina su localhost con un config.js che punta a un
// "script del portale" locale, e le stesse intestazioni di portale/_headers (connect-src cambiato verso quello locale).
//
//   node portale/prova.js                       accende il server di prova vero con --porta-portale (cartella dati nuova)
//   node portale/prova.js --finto               usa il finto portale (portale/prove/finto-portale.js, dati di §7)
//   node portale/prova.js --script <indirizzo>  usa uno script del portale già acceso (es. http://127.0.0.1:8421/)
//
// Opzioni: --porta <pagina, 8791> --porta-server <8420> --porta-portale <8421> --dati <cartella>.
// Porte del progetto per le prove della pagina: 8791 e vicine (mai 8765 né 8790); per i server 8420-8439.
// Chiude i processi che ha acceso quando lo si ferma (Ctrl+C).
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const RADICE = path.resolve(__dirname, '..');
const PORTA = Number(opz('--porta', 8791));
const PORTA_SERVER = Number(opz('--porta-server', 8420));
const PORTA_PORTALE = Number(opz('--porta-portale', arg.includes('--finto') ? 8425 : 8421));
const figli = [];

/** I file della pagina: una mappa fissa (mai un percorso costruito con quello che chiede il browser). */
const FILE = {
  '/': ['portale/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['portale/index.html', 'text/html; charset=utf-8'],
  '/portale.css': ['portale/portale.css', 'text/css; charset=utf-8'],
  '/portale.js': ['portale/portale.js', 'text/javascript; charset=utf-8'],
  '/documenti.js': ['pc/ui/documenti.js', 'text/javascript; charset=utf-8'],
  '/conti.js': ['pc/ui/conti.js', 'text/javascript; charset=utf-8'],
  '/font/Figtree.ttf': ['portale/font/Figtree.ttf', 'font/ttf'],
  '/font/figtree-OFL.txt': ['portale/font/figtree-OFL.txt', 'text/plain; charset=utf-8'],
};

/** Le intestazioni di portale/_headers: { percorso: {Nome: valore} } (il formato di Netlify). */
function leggiIntestazioni(testo) {
  const out = {};
  let corrente = null;
  testo.split(/\r?\n/).forEach(riga => {
    if (!riga.trim() || riga.trim().charAt(0) === '#') return;
    if (!/^\s/.test(riga)) { corrente = riga.trim(); out[corrente] = out[corrente] || {}; return; }
    const i = riga.indexOf(':');
    if (corrente && i > 0) out[corrente][riga.slice(0, i).trim()] = riga.slice(i + 1).trim();
  });
  return out;
}

function avviaFiglio(nome, comando, argomenti) {
  const p = spawn(comando, argomenti, { cwd: RADICE, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => process.stdout.write('[' + nome + '] ' + d));
  p.stderr.on('data', d => process.stderr.write('[' + nome + '] ' + d));
  p.on('exit', c => console.log('[' + nome + '] uscito (' + c + ')'));
  figli.push(p);
  return p;
}
function chiudi() {
  figli.forEach(p => { try { p.kill(); } catch (e) { /* già chiuso */ } });
  process.exit(0);
}
process.on('SIGINT', chiudi);
process.on('SIGTERM', chiudi);

let script = opz('--script', '');
if (!script && arg.includes('--finto')) {
  avviaFiglio('finto', process.execPath, [path.join(__dirname, 'prove', 'finto-portale.js'), '--porta', String(PORTA_PORTALE)]);
  script = 'http://127.0.0.1:' + PORTA_PORTALE + '/';
} else if (!script) {
  const dati = opz('--dati', fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-portale-prova-')));
  console.log('Dati del server di prova (e la posta finta in posta-finta/email/): ' + dati);
  avviaFiglio('server', process.execPath, [path.join(RADICE, 'server', 'src', 'avvio.js'), '--prova', '--porta', String(PORTA_SERVER), '--porta-portale', String(PORTA_PORTALE), '--dati', dati]);
  script = 'http://127.0.0.1:' + PORTA_PORTALE + '/';
}
const origineScript = new URL(script).origin;
const INTESTAZIONI = leggiIntestazioni(fs.readFileSync(path.join(__dirname, '_headers'), 'utf8'));
const CONFIG = '// Scritto da portale/prova.js: SOLO per provare sul PC.\nwindow.WISPER_PORTALE = { script: ' + JSON.stringify(script) + ' };\n';

http.createServer((req, res) => {
  const percorso = new URL(req.url, 'http://localhost').pathname;
  const base = Object.assign({}, INTESTAZIONI['/*'] || {});
  // Come Netlify, con una sola differenza: le richieste vanno allo script locale invece che a Google.
  if (base['Content-Security-Policy']) base['Content-Security-Policy'] = base['Content-Security-Policy'].replace(/connect-src [^;]+/, 'connect-src ' + origineScript);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, base); return res.end(); }
  if (percorso === '/config.js') {
    res.writeHead(200, Object.assign(base, INTESTAZIONI['/config.js'] || {}, { 'Content-Type': 'text/javascript; charset=utf-8' }));
    return res.end(CONFIG);
  }
  const f = FILE[percorso];
  if (!f) { res.writeHead(404, Object.assign(base, { 'Content-Type': 'text/plain; charset=utf-8' })); return res.end('Non trovato'); }
  res.writeHead(200, Object.assign(base, INTESTAZIONI[percorso] || {}, { 'Content-Type': f[1] }));
  return res.end(fs.readFileSync(path.join(RADICE, f[0])));
}).listen(PORTA, '127.0.0.1', () => {
  console.log('Portale di prova: http://127.0.0.1:' + PORTA + '/   (script del portale: ' + script + ')');
});
