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
  { nome: 'commessa-costi', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST045', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /Costi/.test(b.textContent)).click()" },
  { nome: 'commessa-menu', hash: '#commesse/' + new Date().getFullYear() % 100 + 'ST044', fai: "document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click()", dopo: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))" },
  { nome: 'commessa-modulo', hash: '#commesse', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova commessa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rapportini', hash: '#rapportini/elenco' },
  { nome: 'rapportino-modulo', hash: '#rapportini/elenco', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuovo rapportino/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rapportino-pannello', hash: '#rapportini/elenco', fai: "document.querySelector('.tab .r.cliccabile').click()", dopo: "document.querySelector('.pannello') && document.querySelector('.pannello').remove()" },
  // fase 3: ore, timer, approvazioni, statistiche, spese e trasferte, veicoli
  { nome: 'ore', hash: '#rapportini/ore' },
  { nome: 'ore-registra', hash: '#rapportini/ore', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Registra ore/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('.finestra .segmenti button')].find(b => b.textContent === 'Inizio e fine').click(); const f = document.querySelector('.finestra'); const i = [...f.querySelectorAll('.campo')]; const m = (et, v) => { const c = i.find(x => x.querySelector('label') && x.querySelector('label').textContent === et); const x = c.querySelector('input'); x.value = v; x.dispatchEvent(new Event('input', { bubbles: true })); }; m('Inizio', '8:30'); m('Fine', '17:00'); m('Pausa', '30')", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'ore-timer-avvia', hash: '#rapportini/ore', fai: "[...document.querySelectorAll('.zona-timer .btn')].find(b => /Avvia il timer/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'ore-giorno', hash: '#rapportini/ore', fai: "document.querySelector('button.cella-ore.apri').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'statistiche', hash: '#rapportini/statistiche' },
  { nome: 'da-approvare', hash: '#rapportini/approvare' },
  { nome: 'da-approvare-respingi', hash: '#rapportini/approvare', fai: "[...document.querySelectorAll('.azioni-approva .btn')].find(b => b.textContent === 'Respingi').click(); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('.finestra .btn.giallo')].pop().click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'spese', hash: '#spese' },
  { nome: 'spesa-nuova', hash: '#spese', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova spesa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'spesa-foto', hash: '#spese', fai: "[...document.querySelectorAll('.scheda.righe .riga')].find(r => r.querySelector('.ico-riga')).click(); await new Promise(r => setTimeout(r, 300)); const r = [...document.querySelectorAll('.scheda.righe .riga')].find(x => !/senza scontrino/.test(x.textContent)); if (r) { document.querySelectorAll('.velo').forEach(v => v.remove()); r.click(); }", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'trasferte', hash: '#spese', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /^Trasferte/.test(b.textContent)).click()" },
  { nome: 'trasferta-modulo', hash: '#spese', fai: "[...document.querySelectorAll('.segmenti button')].find(b => /^Trasferte/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 900)); document.querySelector('.scheda.righe .riga').click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'rimborsi', hash: '#spese', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Rimborsi').click()" },
  { nome: 'riepiloghi', hash: '#spese/riepiloghi' },
  { nome: 'veicoli', hash: '#amministrazione/veicoli' },
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
  // fase 2: preventivi, attività e calendario
  { nome: 'preventivi', hash: '#preventivi' },
  { nome: 'preventivo', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012') },
  { nome: 'preventivo-menu', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012'), fai: "document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click()", dopo: "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))" },
  { nome: 'preventivo-accetta', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012'), fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Segna accettato/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'preventivo-invio', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/013'), fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Invia al cliente/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 400)); [...document.querySelectorAll('.finestra .btn.giallo')].find(b => /Mandalo/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'preventivo-editor', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012') + '/modifica' },
  { nome: 'preventivo-editor-bozza', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/013') + '/modifica' },
  { nome: 'preventivo-nuovo', hash: '#preventivi/nuovo', fai: "document.querySelector('.piede-sez .btn').click()", dopo: "document.querySelectorAll('.menu').forEach(m => m.remove())" },
  { nome: 'preventivo-crea-commessa', hash: '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/009'), fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Crea la commessa/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'listino', hash: '#preventivi/listino' },
  { nome: 'contratti', hash: '#preventivi/contratti' },
  { nome: 'attivita', hash: '#attivita' },
  { nome: 'attivita-squadra', hash: '#attivita', fai: "document.querySelectorAll('.segmenti button')[1].click()" },
  { nome: 'attivita-modulo', hash: '#attivita', fai: "document.querySelectorAll('.riga-attivita')[1].click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'attivita-nuova', hash: '#attivita', fai: "[...document.querySelectorAll('.btn.giallo')].find(b => /Nuova attività/.test(b.textContent)).click()", dopo: "document.querySelectorAll('.velo').forEach(v => v.remove())" },
  { nome: 'calendario', hash: '#attivita/calendario' },
  { nome: 'calendario-mese', hash: '#attivita/calendario', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Mese').click()", dopo: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Settimana').click()" },
  { nome: 'calendario-giorno', hash: '#attivita/calendario', fai: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Giorno').click()", dopo: "[...document.querySelectorAll('.segmenti button')].find(b => b.textContent === 'Settimana').click()" },
  { nome: 'pianificazione', hash: '#attivita/pianificazione' },
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
        if (p.fai) { await valuta('(async () => { ' + p.fai + ' })()'); await aspetta(600); }
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
