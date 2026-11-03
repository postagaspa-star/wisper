// Il portale provato con Edge senza finestra (profilo temporaneo, mai il browser di chi lavora), cliccando come il
// cliente: il flusso di docs/gestionale/fase7.md §13.3 (entra con l'email e il codice della posta finta, informativa,
// preventivo con le scelte, firma e accetta, firma del rapportino, richiesta urgente con la foto, messaggio), la prova
// dei testi cattivi di §13.2 punto 9 (nessun alert parte), la stessa operazione riprovata con lo stesso id, e le schermate
// di telefono e computer, chiaro e scuro.
//
//   node portale/prova.js --finto --porta 8791 --porta-portale 8425        (in un'altra finestra)
//   node portale/prove/prova-portale-edge.js --pagina http://127.0.0.1:8791 --script http://127.0.0.1:8425 --finto --uscita <cartella>
//
// Con il server di prova vero (`node portale/prova.js`) si toglie --finto e si dice dove leggere la posta finta:
//   --posta <cartella delle email del server di prova>
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PAGINA = opz('--pagina', 'http://127.0.0.1:8791');
const SCRIPT = opz('--script', 'http://127.0.0.1:8425');
const FINTO = arg.includes('--finto');
const POSTA = opz('--posta', '');
const USCITA = opz('--uscita', '');
const EMAIL = opz('--email', 'f.ferretti@rossi.example');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const aspetta = ms => new Promise(r => setTimeout(r, ms));
let inizioPosta = 0;
const EXEC = opz('--exec', '');   // il server di prova vero: /exec per preparare (telefono dello studio, informativa nuova, anteprima, link condiviso, spegnere)
// I dati di esempio: quelli del finto portale (§7) o quelli del server di prova (fase7-server-pronto.txt §3, orologio al 22/10/2026).
const DATI = FINTO ? {
  prev: 12, etichetta: 'PR/2026/012 rev. 1', oggetto: 'Adeguamento impianto elettrico capannone', totale0: '4.291,35 €', diri: 14, propri: 15, esterno: 16,
  totaleDiri: '4.867,80 €', totaleFinale: '5.175,24 €', primaRata: '1.212,00 €', rapFirmato: 16, numFirmato: 'RAP/2026/0142', rapDaFirmare: 15, numDaFirmare: 'RAP/2026/0153',
  lavoro: 'Ricerca guasto sul quadro QG2', ore: '3 ore di lavoro · 0,5 di viaggio · 24 km', sede1: 'Capannone di Thiene', sede2: 'Cabina MT di Zanè',
  ric: 21, testoRic: 'Va bene, vi aspetta il custode al cancello nord.', statoRic: 'Intervento fissato', fattura: 18,
} : {
  prev: 1, etichetta: 'PR/2026/014', oggetto: 'Adeguamento delle protezioni della cabina MT', totale0: '1.409,10 €', diri: 23, propri: 24, esterno: 25,
  totaleDiri: '1.985,55 €', totaleFinale: '2.292,99 €', primaRata: '537,00 €', rapFirmato: 5, numFirmato: 'RAP/2026/0013', rapDaFirmare: 4, numDaFirmare: 'RAP/2026/0004',
  lavoro: 'Sostituzione interruttore generale', ore: '3,5 ore di lavoro · 0 di viaggio · 22 km', sede1: 'Capannone', sede2: 'Cabina MT Acme',
  ric: 11, testoRic: 'Va bene, vi aspetta il custode al cancello nord.', statoRic: 'Ricevuta', fattura: 8,
};
let tokenExec = '';
/** Un'azione dello studio sul server di prova (come manuel@, password "prova"). */
async function exec(azione, d) {
  const json = async corpo => (await fetch(EXEC.replace(/\/$/, '') + '/exec', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tokenExec ? { Authorization: 'Bearer ' + tokenExec } : {}), body: JSON.stringify(corpo) })).json();
  if (!tokenExec) tokenExec = (await json({ azione: 'accedi', email: 'manuel@esempio.it', password: 'prova', dispositivo: 'Prova del portale' })).token;
  return json(Object.assign({ azione }, d || {}));
}
let giroInformativa = 0;
/** Cambia la versione dell'informativa: al prossimo ingresso tutti la rivedono (§3.19). Solo col server vero. */
async function nuovaInformativa() {
  if (!EXEC) return;
  const x = await exec('salvaImpostazioni', { valori: { PORTALE_INFORMATIVA_DATA: '2026-11-' + String(10 + (++giroInformativa)) } });
  if (!x.ok) throw new Error('salvaImpostazioni: ' + JSON.stringify(x).slice(0, 300));
}

/** Un PNG vero, piccolo (la "foto" del quadro). */
function pngProva(file) {
  const l = 64, a = 48;
  const righe = Buffer.alloc((l * 3 + 1) * a);
  for (let y = 0; y < a; y++) for (let x = 0; x < l; x++) { const i = y * (l * 3 + 1) + 1 + x * 3; righe[i] = 90 + x; righe[i + 1] = 90 + y; righe[i + 2] = 80; }
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const pezzo = (t, d) => { const n = Buffer.alloc(4); n.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([n, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(l, 0); ih.writeUInt32BE(a, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pezzo('IHDR', ih), pezzo('IDAT', zlib.deflateSync(righe)), pezzo('IEND', Buffer.alloc(0))]));
  return file;
}

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-portale-'));
  const foto = pngProva(path.join(profilo, 'Foto quadro QG2.png'));
  const porta = 9600 + Math.floor(Math.random() * 150);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const errori = [];
  const dialoghi = [];
  const mandate = [];
  let passi = 0;
  const note = [];
  try {
    let pagina = null;
    for (let i = 0; i < 60 && !pagina; i++) {
      await aspetta(250);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    ws = new WebSocket(pagina.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let n = 0;
    const attese = new Map();
    const cdp = (method, params) => new Promise(ok => { const id = ++n; attese.set(id, ok); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errori.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errori.push('console: ' + d.params.args.map(a => a.value || a.description).join(' '));
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) errori.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
      if (d.method === 'Page.javascriptDialogOpening') { dialoghi.push(d.params.message); cdp('Page.handleJavaScriptDialog', { accept: false }); }
      if (d.method === 'Network.requestWillBeSent' && d.params.request.method === 'POST' && d.params.request.url.indexOf(SCRIPT) === 0 && d.params.request.postData) {
        try { mandate.push(JSON.parse(d.params.request.postData)); } catch (e) { /* un file grande: postData tagliato */ }
      }
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Log.enable');
    await cdp('Network.enable', { maxPostDataSize: 2000000 });
    await cdp('DOM.enable');
    const valuta = async espr => {
      const r = await cdp('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(espr.slice(0, 200) + '\n' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result.result.value;
    };
    const finto = async p => (await fetch(SCRIPT.replace(/\/$/, '') + '/prova/' + p)).json();
    let modo = 'telefono';
    const dispositivo = async (m, scuro) => {
      modo = m;
      if (m === 'telefono') {
        await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
      } else {
        await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' });
      }
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] });
    };
    let prefisso = 'tel-chiaro';
    const foto_ = async (nome, intera) => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      await aspetta(350);
      let par = { format: 'png' };
      if (intera) {
        const m = await cdp('Page.getLayoutMetrics');
        const alto = Math.ceil(m.result.cssContentSize ? m.result.cssContentSize.height : m.result.contentSize.height);
        par = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: modo === 'telefono' ? 390 : 1280, height: Math.min(alto, 6000), scale: 1 } };
      }
      const f = await cdp('Page.captureScreenshot', par);
      fs.writeFileSync(path.join(USCITA, prefisso + '-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    const testo = () => valuta("document.querySelector('#contenuto') ? document.querySelector('#contenuto').innerText : document.body.innerText");
    const attendi = async (cosa, ms) => {
      const fine = Date.now() + (ms || 8000);
      for (;;) {
        const t = await testo();
        if (typeof cosa === 'string' ? t.toLowerCase().indexOf(cosa.toLowerCase()) >= 0 : cosa.test(t)) return t;
        if (Date.now() > fine) throw new Error('Non arriva "' + cosa + '". La pagina dice:\n' + t.slice(0, 900));
        await aspetta(150);
      }
    };
    const clicca = async (t, dove) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : "document.querySelector('dialog[open]') || document"};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const vis = x => x.offsetParent !== null || getComputedStyle(x).position === 'fixed';
        const tutti = [...radice.querySelectorAll('button, a, label, [role=switch]')].filter(vis);
        const pulito = x => (x.textContent || '').replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(t)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t));
        if (!b) return 'non trovo "' + t + '" fra: ' + tutti.map(pulito).filter(Boolean).slice(0, 50).join(' | ');
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic: ' + ok);
      await aspetta(250);
    };
    const scrivi = async (etichetta, valore) => {
      const ok = await valuta(`(() => {
        const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === ${JSON.stringify(etichetta)});
        if (!l) return 'non trovo il campo ' + ${JSON.stringify(etichetta)};
        const i = document.getElementById(l.getAttribute('for'));
        i.value = ${JSON.stringify(valore)};
        i.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      if (ok !== true) throw new Error(ok);
    };
    const firma = async () => valuta(`(() => {
      const c = document.querySelector('.firma-box canvas');
      const r = c.getBoundingClientRect();
      const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, pointerId: 7, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
      ev('pointerdown', 30, 130);
      for (let i = 0; i <= 70; i++) ev('pointermove', 30 + i * (r.width - 80) / 70, 130 - Math.sin(i / 4.5) * 45 * (1 - i / 120));
      ev('pointerup', r.width - 50, 120);
      return true;
    })()`);
    const vai = async hash => { await valuta('location.hash = ' + JSON.stringify(hash) + '; true'); await aspetta(200); };
    const unGiallo = async nome => {
      const k = await valuta(`(() => { const d = document.querySelector('dialog[open]'); const r = d || document; return [...r.querySelectorAll('.principale')].filter(x => x.offsetParent !== null || getComputedStyle(x.parentNode).position === 'fixed').length; })()`);
      assert.ok(k <= 1, nome + ': ' + k + ' pulsanti gialli');
    };
    const passo = m => { passi++; console.log('ok  ' + m); };
    const leggiCodice = async email => {
      if (FINTO) { const p = await finto('posta'); const x = p.filter(e => e.a === email && e.codice).pop(); return x && x.codice; }
      if (POSTA) {
        // Il postino finto del server scrive <cartella>/email/<istante>/email.txt: l'ultima per questa email col codice.
        const tutte = [];
        const giro = d => fs.readdirSync(d, { withFileTypes: true }).forEach(x => { const p = path.join(d, x.name); if (x.isDirectory()) giro(p); else if (x.name === 'email.txt') tutte.push(p); });
        for (let i = 0; i < 40; i++) {
          tutte.length = 0;
          if (fs.existsSync(POSTA)) giro(POSTA);
          const buone = tutte.map(p => ({ p, t: fs.readFileSync(p, 'utf8'), m: fs.statSync(p).mtimeMs }))
            .filter(x => x.m >= inizioPosta && x.t.indexOf('A: ' + email) >= 0 && /portale/.test(x.t) && /\b\d{6}\b/.test(x.t)).sort((a, b) => a.m - b.m);
          const ultima = buone.pop();
          if (ultima) return (ultima.t.match(/è (\d{6})/) || ultima.t.match(/\b(\d{6})\b/))[1];
          await aspetta(250);   // il server risponde subito e manda l'email dopo (§3.4)
        }
        throw new Error('Nessuna email col codice per ' + email + ' in ' + POSTA);
      }
      throw new Error('Serve --finto o --posta per leggere il codice');
    };
    const misure = async nome => {
      // Testi sotto i 16 px e tocchi sotto i 48 (le eccezioni volute: pillole, etichette in maiuscolo, piè di pagina, sotto il nome dello studio).
      const r = await valuta(`(() => {
        const vis = x => x.offsetParent !== null;
        const piccoli = [...document.querySelectorAll('#contenuto *')].filter(x => vis(x) && [...x.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()))
          .filter(x => parseFloat(getComputedStyle(x).fontSize) < 16 && !x.closest('.pill, .etichetta, .piede, .nome-st, .chi-b, .gruppo-alt, .coppia .k, .num-box span, .tempo-r span, .firma-box'))
          .map(x => x.tagName + '.' + x.className + ' ' + getComputedStyle(x).fontSize + ' «' + x.textContent.trim().slice(0, 30) + '»');
        const tocchi = [...document.querySelectorAll('#contenuto button, #contenuto a, #contenuto input, #contenuto label.bordo, #contenuto label.zona-file')].filter(vis)
          .filter(x => !x.closest('.piede') && !(x.tagName === 'INPUT' && (x.type === 'file' || x.classList.contains('casella') || x.classList.contains('cerchio-sc'))))
          .filter(x => x.getBoundingClientRect().height < 47.5).map(x => x.tagName + '.' + x.className + ' ' + Math.round(x.getBoundingClientRect().height) + ' «' + x.textContent.trim().slice(0, 30) + '»');
        return { piccoli, tocchi };
      })()`);
      if (r.piccoli.length) note.push(nome + ': testo sotto 16 px: ' + r.piccoli.slice(0, 4).join(' · '));
      if (r.tocchi.length) note.push(nome + ': tocchi sotto 48 px: ' + r.tocchi.slice(0, 4).join(' · '));
    };
    const pulisci = async () => {
      await cdp('Page.navigate', { url: 'about:blank' });
      await aspetta(150);
      await cdp('Page.navigate', { url: PAGINA + '/' });
      await aspetta(400);
      await valuta('sessionStorage.clear(); localStorage.clear(); true');
    };

    // ============================================================================================ computer e tema scuro
    if (EXEC) {
      const x = await exec('salvaImpostazioni', { valori: { TELEFONO: '0445 000100', PORTALE_ATTIVO: true } });
      if (!x.ok) throw new Error('salvaImpostazioni: ' + JSON.stringify(x).slice(0, 300));
    }
    const giro = async (prefissoNuovo, m, scuro, pagine) => {
      prefisso = prefissoNuovo;
      await dispositivo(m, scuro);
      if (FINTO) await finto('azzera');
      await nuovaInformativa();
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/#/entra' });
      await attendi('La tua email');
      await foto_('01-entra');
      await scrivi('La tua email', EMAIL);
      inizioPosta = Date.now() - 1500; await clicca('Mandami il link');
      await attendi('Controlla la posta');
      await scrivi('Codice', await leggiCodice(EMAIL));
      await clicca('Entra');
      const dopo = await attendi(/Prima di entrare|Buongiorno|Buon pomeriggio|Buonasera/);
      if (/Prima di entrare/.test(dopo)) { await foto_('03-prima-di-entrare'); await clicca('Ho letto, entra'); }
      await attendi('Da fare');
      for (const [nome, hash, cosa, fai] of pagine) {
        await vai(hash);
        await attendi(cosa, 10000);
        if (fai) await valuta(fai);
        await aspetta(300);
        await unGiallo(prefissoNuovo + ' ' + nome);
        await foto_(nome, m === 'telefono');
        if (m === 'computer' && !scuro) await misure(prefissoNuovo + ' ' + nome);
      }
    };
    const firmaFinta = "(() => { const c = document.querySelector('.firma-box canvas'); const r = c.getBoundingClientRect(); const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, pointerId: 9, bubbles: true, pointerType: 'mouse' })); ev('pointerdown', 40, 130); for (let i = 0; i <= 60; i++) ev('pointermove', 40 + i * (r.width - 100) / 60, 130 - Math.sin(i / 4) * 40); ev('pointerup', r.width - 60, 120); return true; })()";
    const PAGINE_PC = [
      ['04-casa', '#/casa', 'Da fare'], ['05-preventivo', '#/preventivi/' + DATI.prev, DATI.totale0], ['07-accetta', '#/preventivi/' + DATI.prev + '/accetta', 'Ho letto le condizioni', firmaFinta],
      ['12-rapportino', '#/rapportini/' + DATI.rapDaFirmare, DATI.lavoro], ['13-firma-rapportino', '#/rapportini/' + DATI.rapDaFirmare + '/firma', 'Firmando confermi', firmaFinta],
      ['19-richiesta-messaggi', '#/richieste/' + DATI.ric, DATI.testoRic], ['15-nuova-richiesta', '#/richieste/nuova', 'Cosa succede'], ['21-documenti', '#/documenti', 'Schema unifilare'],
      ['22-manda-file', '#/documenti/manda', 'Scegli il file'], ['24-fattura', '#/fatture/' + DATI.fattura, 'Come pagare'], ['25-preventivi', '#/preventivi', 'Contratti'], ['26-accesso', '#/accesso', 'Ultimi accessi'],
    ];
    await giro('pc-chiaro', 'computer', false, PAGINE_PC);
    passo('computer chiaro: menu a sinistra, un giallo per schermata');
    await giro('pc-scuro', 'computer', true, PAGINE_PC.filter(p => ['04-casa', '05-preventivo', '07-accetta', '13-firma-rapportino', '19-richiesta-messaggi', '24-fattura'].includes(p[0])));
    const sfondo = await valuta("getComputedStyle(document.body).backgroundColor");
    assert.equal(sfondo, 'rgb(18, 18, 20)', 'tema scuro dal sistema');
    passo('computer scuro (prefers-color-scheme)');
    await giro('tel-scuro', 'telefono', true, PAGINE_PC.filter(p => ['04-casa', '05-preventivo', '07-accetta', '13-firma-rapportino', '19-richiesta-messaggi', '24-fattura', '15-nuova-richiesta'].includes(p[0])));
    passo('telefono scuro; la firma del rapportino resta chiara');

    // ============================================================================================ il flusso (telefono, chiaro)
    prefisso = 'tel-chiaro';
    if (FINTO) await finto('azzera');
    await nuovaInformativa();
    await dispositivo('telefono', false);
    await pulisci();
    await cdp('Page.navigate', { url: PAGINA + '/#/preventivi/' + DATI.prev });
    await attendi('La tua email');
    await unGiallo('entra');
    await foto_('01-entra');
    await misure('entra');
    passo('senza sessione la pagina chiesta porta a Entra');

    inizioPosta = Date.now() - 1500; await clicca('Mandami il link');
    await attendi('Scrivi un\'email intera');
    await scrivi('La tua email', EMAIL);
    inizioPosta = Date.now() - 1500; await clicca('Mandami il link');
    await attendi('Controlla la posta');
    await attendi('ti è arrivata un\'email con un link e un codice. Valgono 10 minuti.');
    const nuova = await valuta("[...document.querySelectorAll('button')].find(b => /Mandala di nuovo/.test(b.textContent)).disabled");
    assert.equal(nuova, true, '"Mandala di nuovo" aspetta 60 secondi');
    await foto_('02-posta');
    passo('Mandami il link → Controlla la posta (frase uguale per tutti, "Mandala di nuovo" spento per 60 s)');

    await scrivi('Codice', '000000');
    await clicca('Entra');
    await attendi('Il codice non è giusto o non vale più');
    const codice = await leggiCodice(EMAIL);
    assert.match(String(codice), /^\d{6}$/);
    await scrivi('Codice', codice);
    await clicca('Entra');
    await attendi('Prima di entrare');
    await attendi('Le email e il collegamento passano da Google; la pagina è ospitata da Netlify');
    const sess = await valuta("({ s: sessionStorage.getItem('wisper.sessione'), l: Object.keys(localStorage), c: document.cookie })");
    assert.ok(sess.s && sess.s.length >= 20, 'la sessione sta in sessionStorage');
    assert.deepEqual(sess.l, ['wisper.studio'], 'in localStorage solo i dati pubblici dello studio');
    assert.equal(sess.c, '', 'nessun cookie');
    await unGiallo('informativa');
    await foto_('03-prima-di-entrare');
    passo('codice sbagliato rifiutato, codice della posta finta → Prima di entrare; sessione solo in sessionStorage, nessun cookie');

    await clicca('Ho letto, entra');
    await attendi(DATI.oggetto);
    passo('Ho letto, entra → torna dove voleva andare (il preventivo)');

    // Il preventivo: la DiRi e il collaudo esterno, il totale chiesto al server.
    await attendi(DATI.totale0);
    await unGiallo('preventivo');
    await foto_('05-preventivo', true);
    await foto_('05-preventivo-alto');
    await valuta("document.getElementById('v-" + DATI.diri + "').click(); true");
    await attendi(DATI.totaleDiri);
    await valuta("document.getElementById('v-" + DATI.esterno + "').click(); true");
    await attendi(DATI.totaleFinale);
    const pag = await testo();
    assert.ok(pag.indexOf(DATI.primaRata) >= 0, 'le scadenze seguono le scelte');
    assert.ok(mandate.some(q => q.strada === 'preventivi/' + DATI.prev + '/anteprima' && q.corpo.scelte[DATI.diri] === true && q.corpo.scelte[DATI.esterno] === true && q.corpo.scelte[DATI.propri] === false), 'le scelte vanno al server');
    await foto_('06-preventivo-scelte', true);
    await misure('preventivo');
    passo('preventivo: La voglio + Una di queste → anteprima dal server, totale ' + DATI.totaleFinale);

    await clicca('Accetta il preventivo');
    await attendi('Ho letto le condizioni e accetto il preventivo ' + DATI.etichetta);
    await attendi(DATI.totaleFinale);
    const riass = await testo();
    assert.ok(/Dichiarazione di rispondenza\s*inclusa/.test(riass) && /Collaudo con laboratorio esterno\s*scelto/.test(riass), 'le scelte riassunte');
    assert.equal(await valuta("document.getElementById('a-nome').value"), 'Sig. Ferretti', 'il nome del referente già scritto');
    await clicca('Firma e accetta');
    await attendi('Spunta «Ho letto le condizioni»');
    await attendi('Manca la firma');
    const coloreErr = await valuta("getComputedStyle(document.querySelector('.errore:not([hidden])')).color");
    assert.ok(!/rgb\(2(0[0-9]|[1-5][0-9]), [0-9]{1,2}, [0-9]{1,2}\)/.test(coloreErr), 'errori al cliente mai in rosso: ' + coloreErr);
    await scrivi('Nome e cognome di chi accetta', 'Roberto Ferretti');
    await valuta("document.getElementById('a-letto').click(); true");
    await valuta(`(() => { const c = document.querySelector('.firma-box canvas'); const r = c.getBoundingClientRect(); const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + y, pointerId: 3, bubbles: true, pointerType: 'mouse' })); ev('pointerdown', 40, 120); for (let i = 0; i < 10; i++) ev('pointermove', 40 + i * 4, 120); ev('pointerup', 80, 120); return true; })()`);
    await clicca('Firma e accetta');
    await attendi('Manca la firma');
    passo('accetta: errori sotto i campi (ambra, mai rosso), una firma di 12 punti non basta (ne servono 30)');
    await clicca('Cancella');
    await firma();
    const bianco = await valuta("getComputedStyle(document.querySelector('.firma-box')).backgroundColor + ' ' + document.querySelector('.firma-box').getBoundingClientRect().height");
    assert.equal(bianco, 'rgb(255, 255, 255) 220', 'riquadro bianco alto 220');
    await foto_('07-accetta', true);
    await foto_('07-accetta-basso');
    await unGiallo('accetta');
    // Il portale non risponde alla prima prova: la seconda riparte con lo stesso id (§0.2).
    if (FINTO) await finto('modo?m=attesa');
    const prima = mandate.length;
    await clicca('Firma e accetta');
    if (FINTO) {
      await attendi('Il portale non risponde adesso: riprova fra qualche minuto');
      await attendi('0445 000100');
      await foto_('08-accetta-non-risponde');
      await finto('modo?m=normale');
      await clicca('Firma e accetta');
    }
    await attendi('Preventivo accettato', 12000);
    await attendi("Ti abbiamo mandato un'email di conferma");
    const tentativi = mandate.slice(prima).filter(q => q.strada === 'preventivi/' + DATI.prev + '/accetta');
    if (FINTO) {
      assert.equal(tentativi.length, 2);
      assert.equal(tentativi[0].id, tentativi[1].id, 'riprovata con lo stesso id');
      assert.match(tentativi[0].corpo.firma, /^data:image\/png;base64,/);
      assert.ok(tentativi[0].corpo.firma.length < 250 * 1024 * 1.37, 'firma sotto i 250 KB');
      assert.equal(tentativi[0].corpo.letto, true);
      assert.equal(tentativi[0].corpo.versione, '2026-10-15T10:00:00');
    }
    assert.ok(tentativi.length >= 1);
    assert.deepEqual(tentativi[0].corpo.scelte, { [DATI.diri]: true, [DATI.propri]: false, [DATI.esterno]: true });
    assert.match(tentativi[0].corpo.versione, /^\d{4}-\d\d-\d\dT/);
    await foto_('09-accettato');
    passo(FINTO ? 'Firma e accetta: "non risponde" col telefono dello studio, poi la stessa richiesta con lo STESSO id → Preventivo accettato' : 'Firma e accetta → Preventivo accettato (la prova del "non risponde" con lo stesso id gira col finto portale)');

    await vai('#/preventivi/' + DATI.prev);
    await attendi(/Accettato il \d\d\/\d\d\/\d{4} alle \d+:\d\d da Roberto Ferretti/);
    await aspetta(600);
    const firmaVista = await valuta("(document.querySelector('.firma-vista img') || {}).src || ''");
    assert.match(firmaVista, /^blob:/, 'la firma si vede da immagine/<chiave> come blob:');
    await foto_('10-preventivo-accettato', true);
    passo('il preventivo accettato mostra "Accettato il … da Roberto Ferretti" con la firma (blob:)');

    // Stampa o salva in PDF: documenti.js in un iframe senza script.
    await vai('#/rapportini/' + DATI.rapFirmato);
    await attendi('Firmato');
    await aspetta(800);
    const conFirma = await valuta("!!document.querySelector('.firma-vista img[src^=\"blob:\"]')");
    await clicca('Stampa o salva in PDF');
    await aspetta(1200);
    const st = await valuta(`(() => { const f = document.getElementById('cornice-stampa'); return f ? { sandbox: f.getAttribute('sandbox'), testo: f.contentDocument.body.innerText, img: [...f.contentDocument.images].map(i => i.src.slice(0, 22)) } : null; })()`);
    assert.ok(st, 'iframe della stampa');
    assert.equal(st.sandbox, 'allow-same-origin allow-modals');
    assert.ok(st.testo.indexOf(DATI.numFirmato) >= 0, 'il documento della stampa');
    assert.ok(!/Bozza|Fatturato|Inviato/.test(st.testo));
    if (conFirma) assert.ok(st.img.some(s => s.indexOf('data:image/') === 0), 'la firma nel PDF');
    passo('Stampa o salva in PDF: documenti.js in un iframe sandbox senza script, con la firma');

    // Il rapportino da firmare.
    await vai('#/rapportini');
    await attendi('Da firmare');
    await foto_('11-rapportini');
    await vai('#/rapportini/' + DATI.rapDaFirmare);
    await attendi(DATI.lavoro);
    await unGiallo('rapportino');
    await foto_('12-rapportino', true);
    await clicca('Firma il rapportino');
    await attendi('Firmando confermi lavoro e ore del rapportino');
    await attendi(DATI.ore);
    assert.ok((await testo()).indexOf('€') < 0, 'nella firma mai i soldi');
    const tema = await valuta("document.documentElement.getAttribute('data-theme')");
    assert.equal(tema, 'light', 'la firma del rapportino è chiara anche col tema scuro');
    await clicca('Conferma firma');
    await attendi('Scrivi il nome di chi firma');
    await scrivi('Nome di chi firma', 'Roberto Ferretti');
    await firma();
    await foto_('13-firma-rapportino', true);
    await clicca('Conferma firma');
    await attendi('Firmato nel portale', 10000);
    await foto_('14-rapportino-firmato', true);
    passo('Firma il rapportino → Firmato, "Firmato nel portale" sotto la firma');

    // Nuova richiesta urgente con la foto.
    await vai('#/casa');
    await attendi('Novità');
    assert.ok((await testo()).toLowerCase().indexOf('da fare') < 0, 'accettato e firmato: niente più da fare');
    await foto_('04-casa-dopo', true);
    await misure('casa');
    await clicca("Nuova richiesta d'intervento");
    await attendi('Cosa succede');
    await foto_('15-nuova-richiesta', true);
    await clicca('Manda la richiesta');
    await attendi("Scegli l'impianto o la sede");
    await clicca(DATI.sede1);
    await scrivi('Cosa succede', 'Scatta il differenziale del quadro QG2');
    await scrivi('Racconta', 'Da stamattina alle 8 scatta ogni dieci minuti, la linea 4 è ferma.');
    await clicca('Sì, è fermo');
    await clicca('Subito');
    const nodo = await cdp('Runtime.evaluate', { expression: "[...document.querySelectorAll('input[type=file]')].find(i => !i.multiple)" });
    const nodoMulti = await cdp('Runtime.evaluate', { expression: "[...document.querySelectorAll('input[type=file]')].find(i => i.multiple)" });
    const fotografa = await valuta("[...document.querySelectorAll('input[type=file]')].some(i => i.getAttribute('capture') === 'environment' && i.accept === 'image/*')");
    assert.equal(fotografa, true, 'sul telefono c\'è Fotografa');
    await cdp('DOM.setFileInputFiles', { files: [foto], objectId: (nodoMulti.result.result || nodo.result.result).objectId });
    await aspetta(500);
    assert.ok((await valuta("document.querySelectorAll('.mini img').length")) === 1, 'la miniatura della foto');
    await foto_('16-nuova-richiesta-piena', true);
    await clicca('Manda la richiesta');
    await attendi(/Richiesta TK\/\d{4}\/\d{4} ricevuta/, 15000);
    await attendi('Se è urgente chiama anche lo 0445 000100');
    const tel = await valuta("[...document.querySelectorAll('a[href^=\"tel:\"]')].map(a => a.getAttribute('href'))");
    assert.ok(tel.indexOf('tel:+390445000100') >= 0, 'il numero si tocca');
    const car = mandate.filter(q => q.strada === 'carica').pop();
    assert.ok(car && car.corpo.per === 'richiesta' && car.corpo.nome === 'Foto quadro QG2.png' && car.corpo.base64.length > 50, 'la foto in base64 con la strada carica');
    const ric = mandate.filter(q => q.strada === 'richieste' && q.metodo === 'POST').pop();
    assert.equal(ric.corpo.impatto, 'fermo');
    assert.equal(ric.corpo.urgenza, 'subito');
    assert.equal(ric.corpo.caricamenti.length, 1);
    await foto_('17-richiesta-ricevuta');
    passo('Nuova richiesta urgente con la foto (carica in base64) → ricevuta, col telefono dello studio toccabile');

    await clicca('Apri la richiesta');
    await attendi('Scrivi allo studio');
    await scrivi('Scrivi allo studio', 'La foto è del quadro QG2, lato porta.');
    await clicca('Manda');
    await attendi('La foto è del quadro QG2, lato porta.');
    await foto_('18-richiesta', true);
    passo('messaggio nella richiesta (a destra, come una chat)');

    await vai('#/richieste/' + DATI.ric);
    await attendi(DATI.testoRic);
    await foto_('19-richiesta-messaggi', true);
    await vai('#/richieste');
    await attendi(DATI.statoRic);
    await foto_('20-richieste');
    await vai('#/documenti');
    await attendi('Schema unifilare cabina MT');
    await foto_('21-documenti', true);
    // Scarica: la risposta in base64 diventa un Blob, e un collegamento con download salva il file.
    const scaricati = path.join(profilo, 'scaricati');
    fs.mkdirSync(scaricati, { recursive: true });
    await cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: scaricati });
    await clicca('Scarica Schema unifilare cabina MT');
    let salvato = null;
    for (let i = 0; i < 40 && !salvato; i++) { await aspetta(250); salvato = fs.readdirSync(scaricati).find(n => /.pdf$/.test(n)); }
    assert.ok(salvato, 'il PDF scaricato');
    assert.equal(fs.readFileSync(path.join(scaricati, salvato)).slice(0, 5).toString(), '%PDF-');
    passo('Scarica: il documento arriva come file (' + salvato + ')');
    await clicca('Manda un file allo studio');
    await attendi('Scegli il file');
    await foto_('22-manda-file', true);
    await vai('#/fatture');
    await attendi('45/2026');
    await foto_('23-fatture');
    await vai('#/fatture/' + DATI.fattura);
    await attendi('Come pagare');
    await foto_('24-fattura', true);
    await vai('#/preventivi');
    await attendi('Contratti');
    await foto_('25-preventivi');
    await vai('#/accesso');
    await attendi('Ultimi accessi');
    await attendi('Chrome · Android');
    await foto_('26-accesso', true);
    await clicca('Menu');
    await aspetta(400);
    await foto_('27-menu');
    await valuta("document.querySelector('.velo').click(); true");
    await vai('#/fatture/999');
    await attendi('Non trovato');
    await foto_('28-non-trovato');
    passo('le altre pagine si aprono (documenti, file, fatture, preventivi e contratti, il mio accesso, menu, non trovato)');

    // ============================================================================================ testi cattivi (§13.2 punto 9)
    const cattivi = { titolo: '<img src=x onerror=alert(1)>', file: '"><svg onload=alert(3)>.pdf', msg: '</script><script>alert(2)</script>' };
    await vai('#/richieste/nuova');
    await attendi('Cosa succede');
    await clicca(DATI.sede2);
    await scrivi('Cosa succede', cattivi.titolo);
    await scrivi('Racconta', cattivi.msg);
    await clicca('Manda la richiesta');
    await attendi(/ricevuta/, 10000);
    await clicca('Apri la richiesta');
    await attendi(cattivi.titolo);
    await scrivi('Scrivi allo studio', cattivi.msg);
    await clicca('Manda');
    await aspetta(1500);
    // Il nome di file cattivo non si può creare su Windows: arriva dal protocollo, con la sessione della pagina.
    const sessione = await valuta("sessionStorage.getItem('wisper.sessione')");
    const pdf = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');
    const manda = async (strada, corpo) => (await fetch(SCRIPT, { method: 'POST', body: JSON.stringify({ portale: 1, v: 1, id: 'prova' + Date.now() + Math.random().toString(36).slice(2, 10), strada, metodo: 'POST', sessione, pre: '', corpo, agente: 'Prova · Node' }) })).json();
    const c1 = await manda('carica', { nome: cattivi.file, per: 'documento', base64: pdf });
    assert.equal(c1.ok, true, JSON.stringify(c1));
    const c2 = await manda('documenti', { caricamento: c1.caricamento.id, titolo: cattivi.titolo, idSede: null, nota: cattivi.msg });
    assert.equal(c2.ok, true, JSON.stringify(c2));
    await vai('#/casa');
    await aspetta(300);
    await vai('#/documenti');
    await attendi(cattivi.titolo);
    const iniettati = await valuta("document.querySelectorAll('#contenuto img[onerror], #contenuto svg[onload], #contenuto script').length");
    assert.equal(iniettati, 0, 'niente HTML dai testi');
    await foto_('29-testi-cattivi-documenti', true);
    await vai('#/richieste');
    await attendi(cattivi.titolo);
    await aspetta(800);
    assert.deepEqual(dialoghi, [], 'nessun alert è partito');
    passo('testi cattivi (titolo, nome del file, messaggio) tornano al cliente come testo: nessun alert, nessun elemento iniettato');

    // ============================================================================================ pagine di servizio (server vero)
    if (EXEC) {
      const ultimoLink = async email => {
        const tutte = [];
        const giro = d => fs.readdirSync(d, { withFileTypes: true }).forEach(x => { const p = path.join(d, x.name); if (x.isDirectory()) giro(p); else if (x.name === 'email.txt') tutte.push(p); });
        giro(POSTA);
        const t = tutte.sort().map(p => fs.readFileSync(p, 'utf8')).filter(x => x.indexOf('A: ' + email) >= 0 && /#\/entra\//.test(x)).pop();
        return t.match(/#\/entra\/([A-Za-z0-9_-]+)/)[1];
      };
      // Il link dell'email: aprirlo non consuma niente, il token sparisce dall'indirizzo, solo il pulsante lo usa.
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/#/entra' });
      await attendi('La tua email');
      // Un altro referente: Ferretti ha già chiesto 5 link in quest'ora (il limite di §6.4, giusto che non arrivino più email).
      const EMAIL2 = 'mario.bianchi@example.com';
      await scrivi('La tua email', EMAIL2);
      inizioPosta = Date.now() - 1500; await clicca('Mandami il link');
      await attendi('Controlla la posta');
      await leggiCodice(EMAIL2);
      const tok = await ultimoLink(EMAIL2);
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/?l=1#/entra/' + tok });
      await attendi('Entra nel portale di Studio Tecnico GM');
      const url = await valuta('location.href');
      assert.ok(url.indexOf(tok) < 0 && /#\/link$/.test(url), 'il token tolto dall\'indirizzo: ' + url);
      assert.ok(!mandate.some(q => q.strada === 'link' && q.corpo.token === tok), 'aprire la pagina non consuma il link');
      await foto_('32-dal-link');
      await clicca('Entra nel portale');
      await attendi(/Prima di entrare|Buongiorno|Buon pomeriggio|Buonasera/, 10000);
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/?l=2#/entra/' + tok });
      await attendi('Entra nel portale');
      await clicca('Entra nel portale');
      await attendi('Questo link non vale più');
      await foto_('33-link-scaduto');
      const conNuovo = await valuta("[...document.querySelectorAll('.principale')].map(b => b.textContent).join('|')");
      if (/Mandami un link nuovo/.test(conNuovo)) { await clicca('Mandami un link nuovo'); await attendi('Ti abbiamo mandato un link nuovo'); }
      passo('Dal link (server vero): la pagina non consuma il token, il token sparisce dall\'indirizzo; usato una volta → "Questo link non vale più"' + (/Mandami/.test(conNuovo) ? ' → Mandami un link nuovo' : ''));

      // La sessione scaduta (un token che il server non conosce).
      await valuta("sessionStorage.setItem('wisper.sessione', 'scaduta' + 'x'.repeat(36)); true");
      await cdp('Page.navigate', { url: PAGINA + '/?s=1#/fatture/' + DATI.fattura });
      await attendi('La sessione è scaduta', 10000);
      assert.equal(await valuta("sessionStorage.getItem('wisper.dopo')"), 'fatture/' + DATI.fattura, 'ricorda dove voleva andare');
      await foto_('35-sessione-scaduta');
      passo('sessione scaduta (server vero) → Entra con l\'avviso, ricordando dove voleva andare');

      // L'anteprima dello studio (anteprimaPortale come manuel@).
      const a = await exec('anteprimaPortale', { idReferente: 4 });
      assert.equal(a.ok, true, JSON.stringify(a).slice(0, 300));
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/?a=1#' + a.link.split('#')[1] });
      await attendi('Entra nel portale');
      await clicca('Entra nel portale');
      await attendi('Rossi Impianti Srl', 10000);
      const fascia = await valuta("(() => { const f = document.querySelector('.fascia-ant'); return f && !f.hidden ? f.textContent : ''; })()");
      assert.equal(fascia, 'Anteprima dello studio: niente di quello che fai arriva al cliente');
      await foto_('36-anteprima');
      await vai('#/richieste/nuova');
      await attendi('Cosa succede');
      await clicca(DATI.sede1);
      await scrivi('Cosa succede', 'Prova dell\'anteprima');
      await clicca('Manda la richiesta');
      assert.equal(await valuta("document.querySelector('.avviso').textContent"), "È un'anteprima: qui non si accetta e non si firma");
      passo("anteprima dello studio (server vero): la fascia, e Manda la richiesta risponde che è un'anteprima");

      // Il link condiviso della fase 5.
      const docs = await exec('documenti', {});
      const doc = (docs.documenti || []).find(x => x.titolo === 'Schema unifilare cabina MT');
      const cd = doc ? await exec('condividiDocumento', { id: doc.id, perChi: 'Prova del portale' }) : { ok: false, errore: 'documento non trovato' };
      if (cd.ok) {
        await pulisci();
        await cdp('Page.navigate', { url: PAGINA + '/?c=1#' + cd.link.split('#').pop().replace(/^\/?/, '/') });
        await attendi('Schema unifilare cabina MT', 10000);
        assert.ok((await valuta('location.href')).indexOf(cd.link.split('/').pop()) < 0, 'token tolto dall\'indirizzo');
        await foto_('37-condiviso');
        passo('link condiviso (server vero): titolo, file, Scarica; token tolto dall\'indirizzo');
      } else note.push('link condiviso col server vero non provato: ' + JSON.stringify(cd).slice(0, 200));

      // Portale spento (spegniPortale), poi riacceso.
      const sp = await exec('spegniPortale', { conferma: true });
      assert.equal(sp.ok, true, JSON.stringify(sp).slice(0, 300));
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/?p=1#/entra' });
      await attendi('Il portale di Studio Tecnico GM non è attivo', 10000);
      await attendi('0445 000100');
      await foto_('31-portale-spento');
      const ri = await exec('salvaImpostazioni', { valori: { PORTALE_ATTIVO: true } });
      assert.equal(ri.ok, true);
      passo('Spegni il portale adesso (server vero) → "Il portale di Studio Tecnico GM non è attivo" col telefono');
    }

    // ============================================================================================ pagine di servizio (finto)
    if (FINTO) {
      await finto('modo?m=spento');
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/#/entra' });
      await attendi('Il portale non risponde adesso: riprova fra qualche minuto', 10000);
      await foto_('30-non-risponde');
      await finto('modo?m=portale-spento');
      await clicca('Riprova');
      await attendi('Il portale di Studio Tecnico GM non è attivo', 10000);
      await attendi('0445 000100');
      await foto_('31-portale-spento');
      await finto('modo?m=normale');
      passo('NAS spento (rete:true) → "Il portale non risponde adesso" col telefono dall\'ultima "studio"; portale spento → pagina "non è attivo"');

      // Il link dell'email: aprirlo non consuma niente, il token sparisce dall'indirizzo.
      const l = await finto('link?tipo=avviso&dest=rapportini/16');
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + l.link });
      await attendi('Entra nel portale di Studio Tecnico GM');
      const url = await valuta('location.href');
      assert.ok(url.indexOf(l.token) < 0 && /#\/link$/.test(url), 'il token tolto dall\'indirizzo: ' + url);
      assert.ok(!mandate.some(q => q.strada === 'link' && q.corpo.token === l.token), 'aprire la pagina non consuma il link');
      await foto_('32-dal-link');
      await clicca('Entra nel portale');
      await attendi('RAP/2026/0142', 10000);
      passo('Dal link: la pagina non consuma il token (solo il pulsante), il token sparisce dall\'indirizzo, si arriva alla destinazione');

      await cdp('Page.navigate', { url: PAGINA + l.link });
      await aspetta(300);
      await valuta("sessionStorage.removeItem('wisper.sessione'); true");
      await cdp('Page.navigate', { url: PAGINA + l.link.replace('/#', '/?r=1#') });
      await attendi('Entra nel portale');
      await clicca('Entra nel portale');
      await attendi('Questo link non vale più');
      await foto_('33-link-scaduto');
      await clicca('Mandami un link nuovo');
      await attendi('Ti abbiamo mandato un link nuovo a f•••••••@rossi.example');
      passo('link già usato → "Questo link non vale più" → Mandami un link nuovo');

      // Più aziende con la stessa email.
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + '/#/entra' });
      await attendi('La tua email');
      await scrivi('La tua email', 'consulente@esempio.it');
      inizioPosta = Date.now() - 1500; await clicca('Mandami il link');
      await attendi('Controlla la posta');
      await scrivi('Codice', await leggiCodice('consulente@esempio.it'));
      await clicca('Entra');
      await attendi('Per quale azienda?');
      await foto_('34-per-quale-azienda');
      await clicca('Edilnord Srl');
      await attendi('Edilnord Srl', 10000);
      passo('stessa email in due aziende → Per quale azienda? → dentro');

      // La sessione scaduta.
      await valuta("sessionStorage.setItem('wisper.sessione', 'scaduta-' + 'x'.repeat(30)); true");
      await cdp('Page.navigate', { url: PAGINA + '/?s=1#/fatture/18' });
      await attendi('La sessione è scaduta: entra di nuovo', 10000);
      assert.equal(await valuta("sessionStorage.getItem('wisper.dopo')"), 'fatture/18', 'ricorda dove voleva andare');
      await foto_('35-sessione-scaduta');
      passo('sessione scaduta → Entra con l\'avviso, ricordando dove voleva andare');

      // L'anteprima dello studio.
      await finto('azzera');
      const a = await finto('link?tipo=anteprima&ref=3');
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + a.link });
      await attendi('Entra nel portale');
      await clicca('Entra nel portale');
      await attendi('Rossi Impianti Srl', 10000);
      const fascia = await valuta("(() => { const f = document.querySelector('.fascia-ant'); return f && !f.hidden ? f.textContent : ''; })()");
      assert.equal(fascia, 'Anteprima dello studio: niente di quello che fai arriva al cliente');
      await foto_('36-anteprima');
      await vai('#/rapportini/15');
      await attendi('RAP/2026/0153');
      await clicca('Firma il rapportino');
      const avv = await valuta("document.querySelector('.avviso').textContent");
      assert.equal(avv, "È un'anteprima: qui non si accetta e non si firma");
      await foto_('36-anteprima-rapportino');
      passo("anteprima dello studio: la fascia in cima; il giallo c'è ma il tocco dice che è un'anteprima");

      // Il link condiviso della fase 5.
      const cd = await finto('condiviso');
      await pulisci();
      await cdp('Page.navigate', { url: PAGINA + cd.link });
      await attendi('Schema unifilare cabina MT');
      assert.ok((await valuta('location.href')).indexOf(cd.token) < 0, 'token tolto dall\'indirizzo');
      await foto_('37-condiviso');
      passo('link condiviso (#/condiviso/<token>): titolo, file, Scarica; token tolto dall\'indirizzo');
    }


    if (errori.length) throw new Error('Errori di JavaScript o della CSP nella pagina:\n' + errori.join('\n'));
    console.log('\n' + passi + ' passi, nessun errore di JavaScript né della CSP, nessun alert.');
    if (note.length) console.log('\nDa guardare (misure):\n- ' + [...new Set(note)].join('\n- '));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* già chiuso */ }
    try { edge.kill(); } catch (e) { /* già chiuso */ }
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge tiene ancora qualche file */ }
  }
}

main().catch(e => { console.error('FALLITA: ' + (e && e.stack || e)); process.exit(1); });
