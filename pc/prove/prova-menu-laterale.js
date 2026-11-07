// Il menu laterale di Wisper Ufficio quando le voci non ci stanno tutte (04/11/2026): cliccando una voce il menu resta
// dov'era (prima tornava in cima a ogni clic) e non c'è la barra grigia di scorrimento (il bordo sfuma dove ci sono altre
// voci). Interfaccia vera, clic veri del mouse e della tastiera, contro il server di prova. Edge senza finestra, profilo
// temporaneo (mai il browser di chi lavora), barre di scorrimento NON nascoste. Solo dati di esempio.
//
//   node server/src/avvio.js --prova --porta 8481 --dati <cartella temporanea>
//   node pc/prove/finto-ponte.js 8483 --server http://localhost:8481
//   node pc/prove/prova-menu-laterale.js --porta 8483 [--uscita <schermate>]
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { portaDevtools, chiudiEdge: chiudiEdgeCdp } = require('./edge-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8483));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-menu-'));
  const porta = portaDevtools(9650, 150);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  let chiudiEdge = async () => {};
  const errori = [];
  let passi = 0;
  try {
    let pagina = null;
    for (let i = 0; i < 50 && !pagina; i++) {
      await aspetta(200);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    // Per chiuderlo davvero alla fine: il browser intero, non solo il primo processo (lascerebbe vivi i figli).
    chiudiEdge = async () => {
      const v = await fetch('http://127.0.0.1:' + porta + '/json/version').then(r => r.json()).catch(() => null);
      if (!v || !v.webSocketDebuggerUrl) return;
      const b = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise(ok => { b.onopen = ok; b.onerror = ok; setTimeout(ok, 2000); });
      try { b.send(JSON.stringify({ id: 1, method: 'Browser.close' })); } catch (e) { /* già chiuso */ }
      await aspetta(800);
      try { b.close(); } catch (e) { /* già chiuso */ }
    };
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
      if (r.result && r.result.exceptionDetails) throw new Error(espr.slice(0, 160) + '\n' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result.result.value;
    };
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    const tema = async scuro => { await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] }); await aspetta(250); };
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      for (const scuro of [false, true]) {
        await tema(scuro);
        const f = await cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(USCITA, 'menu-' + nome + (scuro ? '-scuro' : '') + '.png'), Buffer.from(f.result.data, 'base64'));
      }
      await tema(false);
    };
    /** Lo stato del menu: dove è arrivato, se scorre, la barra, le sfumature, la voce aperta e dove si vede. */
    const menu = () => valuta(`(() => {
      const v = document.querySelector('#voci'), c = v.getBoundingClientRect();
      const a = v.querySelector('.voce.attiva'), r = a && a.getBoundingClientRect();
      return { cima: v.scrollTop, alto: v.clientHeight, tutto: v.scrollHeight, barra: v.offsetWidth - v.clientWidth,
        su: v.classList.contains('piu-su'), giu: v.classList.contains('piu-giu'), maschera: getComputedStyle(v).maskImage || getComputedStyle(v).webkitMaskImage || '',
        attiva: a ? a.dataset.nome : '', attivaIntera: !!r && r.top >= c.top && r.bottom <= c.bottom,
        fuoco: document.activeElement && document.activeElement.closest('#voci') ? document.activeElement.dataset.nome : '' };
    })()`);
    /** Il centro di una voce del menu, per cliccarla col mouse vero. */
    const centro = nome => valuta(`(() => {
      const el = [...document.querySelectorAll('#voci .voce')].find(x => x.dataset.nome === ${JSON.stringify(nome)});
      if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    const cliccaVoce = async nome => {
      const p = await centro(nome);
      assert.ok(p, 'nel menu non c\'è ' + nome);
      for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await aspetta(1700);
    };
    /** Le voci che si vedono per intero nel menu, dall'alto in basso. */
    const vociIntere = () => valuta(`(() => {
      const v = document.querySelector('#voci'), c = v.getBoundingClientRect();
      return [...v.querySelectorAll('.voce')].filter(x => { const r = x.getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom; }).map(x => x.dataset.nome);
    })()`);

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    // Uno schermo basso (portatile con la barra di Windows): le voci del titolare non ci stanno tutte.
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 620, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); localStorage.removeItem('wisper-lato'); true");
    await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
    await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#dashboard' });
    for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
    await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = 'manuel@esempio.it'; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
    await aspetta(3000);

    // ------------------------------------------------------------- 1. Le voci non ci stanno: niente barra, sfuma solo sotto
    let m = await menu();
    assert.ok(m.tutto > m.alto + 100, 'con 620 di altezza le voci del titolare non ci stanno: ' + JSON.stringify(m));
    assert.equal(m.barra, 0, 'nessuna barra di scorrimento nel menu');
    assert.match(m.maschera, /linear-gradient/, 'il bordo del menu sfuma');
    assert.equal(m.cima, 0);
    assert.ok(!m.su && m.giu, 'in cima: sfuma solo sotto ' + JSON.stringify(m));
    await foto('in-cima');
    passo('Le voci non ci stanno: nessuna barra grigia, il bordo sfuma solo sotto');

    // ------------------------------------------------------------- 2. La rotellina scorre il menu; in fondo sfuma solo sopra
    const pDash = await centro('Dashboard');
    for (let i = 0; i < 12; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pDash.x, y: pDash.y + 120, deltaX: 0, deltaY: 200 });
    await aspetta(800);
    m = await menu();
    assert.ok(Math.abs(m.cima + m.alto - m.tutto) <= 1, 'la rotellina porta in fondo al menu: ' + JSON.stringify(m));
    assert.ok(m.su && !m.giu, 'in fondo: sfuma solo sopra ' + JSON.stringify(m));
    passo('La rotellina scorre il menu fino in fondo; lì il bordo sfuma solo sopra');

    // ------------------------------------------------------------- 3. Il clic su una voce in fondo non riporta in cima
    const inFondo = await vociIntere();
    const ultima = inFondo[inFondo.length - 1], penultima = inFondo[inFondo.length - 2];
    const prima = m.cima;
    await cliccaVoce(ultima);
    m = await menu();
    assert.equal(m.attiva, ultima, 'si è aperta ' + ultima);
    assert.ok(Math.abs(m.cima - prima) <= 1, 'il menu resta dov\'era (' + prima + ' → ' + m.cima + ')');
    await cliccaVoce(penultima);
    m = await menu();
    assert.equal(m.attiva, penultima);
    assert.ok(Math.abs(m.cima - prima) <= 1, 'anche al secondo clic il menu resta dov\'era (' + prima + ' → ' + m.cima + ')');
    await foto('in-fondo');
    passo('Clic su ' + ultima + ' e su ' + penultima + ': il menu resta dov\'era');

    // ------------------------------------------------------------- 4. A metà menu, il clic tiene il punto anche lì
    await valuta("document.querySelector('#voci').scrollTop = Math.round((document.querySelector('#voci').scrollHeight - document.querySelector('#voci').clientHeight) / 2); true");
    await aspetta(300);
    m = await menu();
    const meta = m.cima;
    assert.ok(m.su && m.giu, 'a metà: sfuma sopra e sotto');
    const aMeta = await vociIntere();
    await cliccaVoce(aMeta[Math.floor(aMeta.length / 2)]);
    m = await menu();
    assert.ok(Math.abs(m.cima - meta) <= 1, 'a metà menu il clic tiene il punto (' + meta + ' → ' + m.cima + ')');
    passo('A metà menu: sfuma sopra e sotto, e il clic tiene il punto');

    // ------------------------------------------------------------- 5. Una rilettura dal server non sposta il menu
    await valuta("document.querySelector('#stato-server').click(); true");
    await aspetta(2500);
    m = await menu();
    assert.ok(Math.abs(m.cima - meta) <= 1, 'dopo la rilettura il menu è ancora lì (' + meta + ' → ' + m.cima + ')');
    passo('Rileggi dal server: il menu non si sposta');

    // ------------------------------------------------------------- 6. Con la tastiera: Invio apre la voce e il fuoco resta lì
    const daTastiera = (await vociIntere())[1];
    await valuta(`[...document.querySelectorAll('#voci .voce')].find(x => x.dataset.nome === ${JSON.stringify(daTastiera)}).focus(); true`);
    const cimaTast = (await menu()).cima;
    for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined });
    await aspetta(1700);
    m = await menu();
    assert.equal(m.attiva, daTastiera, 'Invio apre la voce');
    assert.equal(m.fuoco, daTastiera, 'il fuoco resta sulla voce, non torna all\'inizio');
    assert.ok(Math.abs(m.cima - cimaTast) <= 1, 'con la tastiera il menu resta dov\'era');
    passo('Tastiera: Invio apre ' + daTastiera + ', il fuoco resta lì e il menu non si sposta');

    // ------------------------------------------------------------- 7. Una pagina aperta da fuori (Dashboard, collegamenti): la sua voce si vede
    await valuta("document.querySelector('#voci').scrollTop = 0; true");
    await aspetta(300);
    const nascosta = (await valuta("[...document.querySelectorAll('#voci .voce')].map(x => ({ n: x.dataset.nome, h: x.getAttribute('href') }))")).pop();
    await valuta(`location.hash = ${JSON.stringify(nascosta.h)}; true`);
    await aspetta(1700);
    m = await menu();
    assert.equal(m.attiva, nascosta.n);
    assert.ok(m.attivaIntera, 'la voce della pagina aperta da fuori si vede per intera: ' + JSON.stringify(m));
    passo('Pagina aperta da fuori (' + nascosta.n + '): il menu scorre quanto basta per mostrarne la voce');

    // ------------------------------------------------------------- 8. Menu richiuso: stesse regole, nessuna barra
    await valuta("document.querySelector('#richiudi').click(); true");
    await aspetta(600);
    m = await menu();
    assert.equal(m.barra, 0, 'richiuso: nessuna barra');
    await valuta("document.querySelector('#richiudi').click(); true");
    await aspetta(600);
    passo('Menu richiuso: nessuna barra di scorrimento');

    // ------------------------------------------------------------- 9. Schermo alto: le voci ci stanno, niente sfumature
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 1, mobile: false });
    await aspetta(700);
    m = await menu();
    assert.ok(m.tutto <= m.alto + 1, 'a 1400 di altezza ci stanno: ' + JSON.stringify(m));
    assert.ok(!m.su && !m.giu, 'senza niente da scorrere il bordo non sfuma');
    passo('Schermo alto: le voci ci stanno e il bordo non sfuma');

    assert.deepEqual(errori, [], 'errori nella pagina');
    console.log('\n' + passi + ' passi, tutti a posto');
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* già chiuso */ }
    try { await chiudiEdge(); } catch (e) { /* già chiuso */ }
    await chiudiEdgeCdp(porta, edge);
    await aspetta(500);
    await require('./edge-prova.js').togliCartella(profilo); // Edge a volte tiene un file un attimo: riprova per qualche secondo
  }
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
