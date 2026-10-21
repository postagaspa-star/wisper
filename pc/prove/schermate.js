// Le schermate dell'interfaccia di Wisper Ufficio, con Edge senza finestra e un
// profilo temporaneo (mai il browser di chi lavora), per confrontarle col prototipo.
//
//   node pc/prove/finto-ponte.js 8790 --esempio        (in un'altra finestra)
//   node pc/prove/schermate.js --uscita <cartella> [--porta 8790] [--scuro] [--chi manuel] [--solo dashboard,clienti]
//
// Entra con l'utente di prova scelto (password "prova"), apre le pagine una per
// una e salva un PNG per pagina (1280x800, come il prototipo). Gli errori di
// JavaScript della pagina li scrive qui: una schermata bella con un errore sotto non vale.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8790));
const USCITA = path.resolve(opz('--uscita', path.join(os.tmpdir(), 'wisper-schermate')));
const SCURO = arg.includes('--scuro');
const CHI = opz('--chi', 'manuel');
const SOLO = (opz('--solo', '') || '').split(',').filter(Boolean);
const LARGO = Number(opz('--largo', 1280));
const ALTO = Number(opz('--alto', 800));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;

// Le pagine: nome del file, indirizzo, e cosa fare prima della schermata (JavaScript nella pagina).
const PAGINE = [
  { nome: 'accesso', esci: true },
  { nome: 'dashboard', hash: '#dashboard' },
  { nome: 'lato-richiuso', hash: '#dashboard', fai: "document.getElementById('richiudi').click()", dopo: "document.getElementById('richiudi').click()" },
  { nome: 'clienti', hash: '#clienti' },
  { nome: 'fornitori', hash: '#clienti', fai: "document.querySelectorAll('.segmenti button')[1].click()", dopo: "document.querySelectorAll('.segmenti button')[0] && document.querySelectorAll('.segmenti button')[0].click()" },
  { nome: 'cliente-dati', hash: '#clienti/C002' },
  { nome: 'cliente-referenti', hash: '#clienti/C001', fai: "document.querySelectorAll('.segmenti button')[1].click()" },
  { nome: 'cliente-sedi', hash: '#clienti/C001', fai: "document.querySelectorAll('.segmenti button')[2].click()" },
  { nome: 'cliente-modulo', hash: '#clienti/C002', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => b.textContent === 'Modifica').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'commesse', hash: '#commesse' },
  { nome: 'commessa-prestazioni', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST044' },
  { nome: 'commessa-panoramica', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST045', fai: "document.querySelectorAll('.segmenti button')[0].click()" },
  { nome: 'commessa-menu', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST044', fai: "document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click()", dopo: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))" },
  { nome: 'commessa-modulo', hash: '#commesse', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova commessa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rapportini', hash: '#rapportini' },
  { nome: 'rapportino-modulo', hash: '#rapportini', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo rapportino/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rapportino-pannello', hash: '#rapportini', fai: "document.querySelector('.tab .r.cliccabile').click()", dopo: "document.querySelector('.pannello') && document.querySelector('.pannello').remove()" },
  { nome: 'fatturazione', hash: '#fatturazione' },
  { nome: 'amministrazione', hash: '#amministrazione' },
  { nome: 'studio', hash: '#amministrazione/studio' },
  { nome: 'utenti', hash: '#amministrazione/utenti' },
  { nome: 'utente', hash: '#amministrazione/utenti/2' },
  { nome: 'nuovo-utente', hash: '#amministrazione/utenti', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo utente/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'permessi', hash: '#amministrazione/permessi' },
  { nome: 'numerazioni', hash: '#amministrazione/numerazioni' },
  { nome: 'tariffe', hash: '#amministrazione/tariffe' },
  { nome: 'registro', hash: '#amministrazione/registro' },
  { nome: 'copie', hash: '#amministrazione/copie' },
  { nome: 'cestino', hash: '#amministrazione/cestino' },
  { nome: 'app', hash: '#amministrazione/app' },
];

const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(USCITA, { recursive: true });
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-prove-'));
  const porta = 9300 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let lista = null;
    for (let i = 0; i < 50 && !lista; i++) {
      await aspetta(200);
      lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
    }
    const pagina = (lista || []).find(x => x.type === 'page');
    if (!pagina) throw new Error('Edge senza finestra non è partito');
    ws = new WebSocket(pagina.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let n = 0;
    const attese = new Map();
    const errori = [];
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errori.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errori.push(d.params.args.map(a => a.value || a.description).join(' '));
    };
    const cdp = (method, params) => new Promise(ok => { const id = ++n; attese.set(id, ok); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const valuta = async espr => {
      const r = await cdp('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) errori.push('[valuta] ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: LARGO, height: ALTO, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: SCURO ? 'dark' : 'light' }] });

    const email = CHI === 'lettura' ? 'lettura@esempio.it' : CHI + '@esempio.it';
    // Ogni pagina si carica da capo (cambiando solo il #, il browser non ricarica niente).
    let giro = 0;
    const vai = async hash => {
      await cdp('Page.navigate', { url: BASE + '/?g=' + (++giro) + (hash || '') });
      await aspetta(1100);
    };
    // La visita guidata non deve coprire le schermate: si segna come già vista, su una
    // pagina vuota della stessa origine, prima che l'interfaccia parta.
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); localStorage.setItem('wisper-tema', 'auto'); localStorage.removeItem('wisper-lato'); true");
    // Si entra sempre come l'utente scelto: chi era dentro prima esce.
    await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' }).then(r => r.json())");
    for (const p of PAGINE) {
      if (SOLO.length && SOLO.indexOf(p.nome) < 0) continue;
      const prima = errori.length;
      if (p.esci) {
        await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' }).then(r => r.json())");
        await vai('#dashboard');
      } else {
        await valuta("fetch('/locale/stato').then(r => r.json()).then(s => s.entrato ? true : fetch('/locale/accedi', { method: 'POST', body: JSON.stringify({ email: '" + email + "', password: 'prova' }) }).then(r => r.json()))");
        await vai(p.hash);
        if (p.fai) { await valuta(p.fai); await aspetta(500); }
      }
      const foto = await cdp('Page.captureScreenshot', { format: 'png' });
      const file = path.join(USCITA, p.nome + (SCURO ? '-scuro' : '') + (CHI !== 'manuel' ? '-' + CHI : '') + '.png');
      fs.writeFileSync(file, Buffer.from(foto.result.data, 'base64'));
      console.log((errori.length > prima ? 'ERRORI ' : 'ok     ') + file);
      for (const e of errori.slice(prima)) console.log('   ' + String(e).split('\n').slice(0, 3).join('\n   '));
      if (p.dopo) { await valuta(p.dopo); await aspetta(200); }
    }
    if (errori.length) process.exitCode = 1;
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge a volte tiene un file ancora un attimo */ }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
