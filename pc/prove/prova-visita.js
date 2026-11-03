// La visita guidata, fatta tutta come la farebbe una persona: nei passi da leggere
// Avanti, nei passi da fare il clic sull'elemento illuminato (al centro del buco).
//
//   node pc/prove/finto-ponte.js 8790 --esempio
//   node pc/prove/prova-visita.js [--porta 8790] [--chi manuel|marco|laura|lettura] [--uscita <schermate>]
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8790));
const CHI = opz('--chi', 'manuel');
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-visita-'));
  const porta = 9960 + Math.floor(Math.random() * 30);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const errori = [];
  try {
    let pagina = null;
    for (let i = 0; i < 50 && !pagina; i++) {
      await aspetta(200);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    ws = new WebSocket(pagina.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let n = 0;
    const attese = new Map();
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errori.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
    };
    const cdp = (method, params) => new Promise(ok => { const id = ++n; attese.set(id, ok); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const valuta = async espr => {
      const r = await cdp('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: 'http://localhost:' + PORTA + '/vuota' });
    await aspetta(300);
    // La prima volta su questo computer la visita parte da sola dopo l'accesso.
    await valuta("localStorage.removeItem('wisper-visita-2'); fetch('/locale/esci', { method: 'POST', body: '{}' }).then(() => fetch('/locale/accedi', { method: 'POST', body: JSON.stringify({ email: '" + CHI + "@esempio.it', password: 'prova' }) })).then(r => r.json())");
    await cdp('Page.navigate', { url: 'http://localhost:' + PORTA + '/?g=1#dashboard' });
    await aspetta(2500);
    const visti = [];
    for (let giro = 0; giro < 30; giro++) {
      const stato = await valuta(`(() => {
        const f = document.querySelector('.visita .fumetto');
        if (!f) return null;
        const b = document.querySelector('.visita .buco');
        const r = b.getBoundingClientRect();
        const avanti = [...f.querySelectorAll('button')].find(x => /^(Avanti|Inizia)$/.test(x.textContent));
        return { titolo: f.querySelector('h3').textContent, conta: (f.querySelector('.piccolo') || {}).textContent || '', avanti: !!avanti, senza: b.classList.contains('senza'),
          x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!stato) break;
      visti.push(stato.conta + ' ' + stato.titolo);
      if (USCITA && giro < 4) {
        fs.mkdirSync(USCITA, { recursive: true });
        const f = await cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(USCITA, 'visita-' + (giro + 1) + '-' + CHI + '.png'), Buffer.from(f.result.data, 'base64'));
      }
      if (stato.avanti) {
        await valuta("[...document.querySelectorAll('.visita .fumetto button')].find(x => /^(Avanti|Inizia)$/.test(x.textContent)).click(); true");
      } else {
        // Il passo da fare: il clic vero sull'elemento sotto il buco.
        const ok = await valuta(`(() => {
          const el = document.elementFromPoint(${stato.x}, ${stato.y});
          const b = el && el.closest('button, a, [role=button]');
          if (!b) return 'niente sotto il buco: ' + (el ? el.outerHTML.slice(0, 80) : 'nulla');
          b.click();
          return true;
        })()`);
        if (ok !== true) throw new Error('Passo "' + stato.titolo + '": ' + ok);
      }
      await aspetta(900);
    }
    console.log(visti.join('\n'));
    assert.ok(visti.length >= 3, 'la visita è partita da sola');
    assert.equal(visti[0].trim().endsWith('Il menu'), true);
    assert.equal(visti[visti.length - 1].trim(), 'Ecco fatto');
    assert.equal(await valuta("localStorage.getItem('wisper-visita-2')"), '1', 'finita, non riparte');
    assert.equal(await valuta("!!document.querySelector('.visita')"), false);
    // Finita la visita si torna ai dati veri (qui quelli del finto ponte) e alla Dashboard.
    assert.equal(await valuta('location.hash'), '#dashboard');
    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('TUTTO BENE (' + visti.length + ' passi, ' + CHI + ')');
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge tiene ancora un file */ }
  }
}

main().catch(e => { console.error('NO: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
