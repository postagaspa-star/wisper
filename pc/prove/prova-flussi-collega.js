// Entrare col telefono (docs/gestionale/collega-qr.md, prototipo docs/prototipo/Collega-QR.html) con l'interfaccia vera
// di Wisper Ufficio, contro il server di prova. La pagina di accesso mostra il QR; la prova lo legge dall'SVG disegnato
// (col lettore indipendente di pc/prove/leggi-qr.js), fa la parte del telefono chiamando autorizzaComputer come
// manuel@esempio.it, e controlla che la pagina entri da sola nella Dashboard col nome giusto. Poi: il codice già usato,
// email e password e ritorno al codice, il telefono che esce prima che il computer entri (rifiutato), i 5 codici e lo
// stop ("Mostra un codice nuovo"), il server dell'ufficio che non risponde. Edge senza finestra, profilo temporaneo
// (mai il browser di chi lavora).
//
// Da sola accende quello che serve, sulle porte 8761-8764, e alla fine spegne solo quello che ha acceso:
//   node pc/prove/prova-flussi-collega.js [--uscita <cartella delle schermate>]
// oppure coi server già accesi (il server va acceso nuovo: usa i suoi dati di esempio così come nascono):
//   node server/src/avvio.js --prova --porta 8761 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8762 --server http://localhost:8761
//   node pc/prove/finto-ponte.js 8763 --server http://127.0.0.1:8764        (8764: nessuno risponde)
//   node pc/prove/prova-flussi-collega.js --gia-accesi [--uscita <cartella>]
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const K = require('../ui/regole-collegamento.js');
const { leggi, daSvg } = require('./leggi-qr.js');
const { portaDevtools, chiudiEdge } = require('./edge-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const USCITA = opz('--uscita', '');
const GIA_ACCESI = arg.includes('--gia-accesi');
// --porte <n>: le quattro porte da n a n+3 al posto di 8761-8764 (per tenere le prove in un giro di porte deciso).
const PRIMA = Number(opz('--porte', 8761));
const SERVER = 'http://localhost:' + PRIMA;
const BASE = 'http://localhost:' + (PRIMA + 1);
const BASE_LONTANO = 'http://localhost:' + (PRIMA + 2);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RADICE = path.join(__dirname, '..', '..');
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const accesi = [];
let datiServer = '';

/** Accende un processo di prova e aspetta che risponda; si spegne alla fine (solo quelli accesi qui). */
async function accendi(argomenti, prova) {
  const p = spawn(process.execPath, argomenti, { cwd: RADICE, stdio: ['ignore', 'pipe', 'pipe'] });
  let uscita = '';
  p.stdout.on('data', d => { uscita += d; });
  p.stderr.on('data', d => { uscita += d; });
  accesi.push(p);
  for (let i = 0; i < 100; i++) {
    if (await fetch(prova).then(r => r.ok).catch(() => false)) return p;
    if (p.exitCode !== null) break;
    await aspetta(200);
  }
  throw new Error('Non parte: node ' + argomenti.join(' ') + '\n' + uscita.slice(-2000));
}

async function main() {
  if (!GIA_ACCESI) {
    datiServer = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-collega-server-'));
    await accendi(['server/src/avvio.js', '--prova', '--porta', String(PRIMA), '--dati', datiServer], SERVER + '/salute');
    await accendi(['pc/prove/finto-ponte.js', String(PRIMA + 1), '--server', SERVER], BASE + '/locale/stato');
    await accendi(['pc/prove/finto-ponte.js', String(PRIMA + 2), '--server', 'http://127.0.0.1:' + (PRIMA + 3)], BASE_LONTANO + '/locale/stato');
  }
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-collega-'));
  const porta = portaDevtools(9650, 150);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const errori = [];
  let passi = 0;
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
      if (r.result && r.result.exceptionDetails) throw new Error(espr.slice(0, 160) + '\n' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result.result.value;
    };
    const tema = async scuro => {
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] });
      await aspetta(300);
    };
    // Le schermate per il diario: solo dati di esempio (server di prova, nome del computer d'esempio).
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      for (const scuro of [false, true]) {
        await tema(scuro);
        const f = await cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(USCITA, '2026-11-02-qr-pc-' + nome + '-' + (scuro ? 'scuro' : 'chiaro') + '.png'), Buffer.from(f.result.data, 'base64'));
      }
      await tema(false);
    };
    const clicca = async (testo, attesa) => {
      const ok = await valuta(`(() => {
        const tutti = [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null);
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const b = tutti.find(x => pulito(x) === ${JSON.stringify(testo)});
        if (!b) return 'non trovo il pulsante fra: ' + tutti.map(pulito).filter(Boolean).join(' | ');
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "' + testo + '": ' + ok);
      await aspetta(attesa || 600);
    };
    const finche = async (espr, cosa, ms) => {
      const fine = Date.now() + (ms || 8000);
      while (Date.now() < fine) {
        if (await valuta(espr)) return;
        await aspetta(200);
      }
      throw new Error('Non è successo: ' + cosa + '\n' + (await valuta("document.querySelector('#principale').innerText")).slice(0, 600));
    };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    /** Il testo del QR come lo legge un lettore: dall'SVG disegnato nella pagina. */
    const leggiQr = async () => {
      const svg = await valuta("(document.querySelector('.qr-box svg') || {}).outerHTML || ''");
      assert.ok(svg, 'c\'è il QR');
      const r = leggi(daSvg(svg));
      assert.ok(r.correzioneGiusta && r.formatoUguale, 'il QR si legge');
      return r.testo;
    };
    /** Un solo pulsante giallo, e ogni tocco della pagina di accesso alto almeno 48 px. */
    const regole = async nome => {
      const r = await valuta(`(() => {
        const vis = [...document.querySelectorAll('.pagina-accesso button, .pagina-accesso input')].filter(x => x.offsetParent !== null);
        return { gialli: vis.filter(x => x.matches('.giallo, .btn-entra')).length, bassi: vis.filter(x => x.getBoundingClientRect().height < 47.5 && !x.matches(".btn.collegamento, .occhio")).map(x => (x.textContent.trim() || x.type) + " " + x.getBoundingClientRect().height) };
      })()`);
      assert.ok(r.gialli <= 1, nome + ': ' + r.gialli + ' pulsanti gialli');
      assert.deepEqual(r.bassi, [], nome + ': tocchi sotto i 48 px');
    };
    // Il telefono: entra sul server di prova come una persona e chiama autorizzaComputer, come farà l'app.
    const telefono = async email => {
      const a = await fetch(SERVER + '/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ azione: 'accedi', email, password: 'prova', disp: 'telefono-prova-qr', dispNome: 'Telefono di prova', app: 'prove' }) }).then(r => r.json());
      assert.equal(a.ok, true, 'il telefono entra: ' + a.errore);
      const chiama = (azione, d) => fetch(SERVER + '/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Authorization: 'Bearer ' + a.token }, body: JSON.stringify(Object.assign({ azione }, d)) }).then(r => r.json());
      chiama.token = a.token;
      return chiama;
    };
    const apriAccesso = async base => {
      await cdp('Page.navigate', { url: base + '/vuota' });
      await aspetta(300);
      await valuta("localStorage.setItem('wisper-visita-2', '1'); fetch('/locale/esci', { method: 'POST', body: '{}' }).then(() => true)");
      await cdp('Page.navigate', { url: base + '/?g=' + Date.now() + '#dashboard' });
    };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await tema(false);

    // ------------------------------------------------------------- 1. la pagina di accesso col QR
    await apriAccesso(BASE);
    await finche("!!document.querySelector('.qr-box svg')", 'il QR compare');
    let testo = await testoPagina();
    assert.match(testo, /Entra in Wisper/);
    assert.match(testo, /Entra col telefono/);
    assert.match(testo, /Apri Wisper sul telefono/);
    assert.match(testo, /Nel menu tocca Collega un computer/);
    assert.match(testo, /Inquadra questo codice/);
    assert.match(testo, /Entra con email e password/);
    assert.match(testo, new RegExp('In casa: localhost:' + PRIMA));
    assert.ok(!/!/.test(testo), 'niente punti esclamativi');
    const misure = await valuta(`(() => { const b = document.querySelector('.qr-box').getBoundingClientRect(); const c = document.querySelector('.carta-accesso').getBoundingClientRect();
      return { qr: [Math.round(b.width), Math.round(b.height)], carta: Math.round(c.width), fondo: getComputedStyle(document.querySelector('.qr-box')).backgroundColor }; })()`);
    assert.deepEqual(misure.qr, [300, 300], 'il QR in un riquadro di 300 px');
    assert.equal(misure.carta, 760, 'la carta larga 760 px');
    assert.equal(misure.fondo, 'rgb(255, 255, 255)');
    await regole('pagina col QR');
    const primo = K.leggiTestoQr(await leggiQr());
    assert.ok(primo, 'il testo del QR è un codice di Wisper Ufficio');
    assert.equal(primo.nome, 'UFFICIO-PC');
    await tema(true);
    assert.equal(await valuta("getComputedStyle(document.querySelector('.qr-box')).backgroundColor"), 'rgb(255, 255, 255)', 'nero su bianco anche in tema scuro');
    assert.match(await valuta("document.querySelector('.qr-box svg path').getAttribute('fill')"), /#000000/i);
    await tema(false);
    passo('pagina di accesso: il QR (300 px, nero su bianco anche al buio), i tre passi, "Entra con email e password", la riga del server');

    // ------------------------------------------------------------- 2. il telefono collega: la pagina entra da sola
    const manuel = await telefono('manuel@esempio.it');
    // Per la schermata la spunta resta qualche secondo in più (di base 1,2 secondi).
    if (USCITA) await valuta('window.WisperCollegamento.QR.ENTRATO_MS = 5000; true');
    const autorizza = await manuel('autorizzaComputer', primo);
    assert.deepEqual(autorizza, { ok: true, nome: 'UFFICIO-PC' });
    await finche("/Entrato come Manuel Gasparotto/.test(document.querySelector('#principale').innerText)", 'la spunta "Entrato come Manuel Gasparotto"', 6000);
    assert.equal(await valuta("!!document.querySelector('.spunta-accesso')"), true);
    await regole('entrato');
    if (USCITA) { await aspetta(800); await foto('entrato'); await valuta('window.WisperCollegamento.QR.ENTRATO_MS = 1200; true'); }
    await finche("!document.body.classList.contains('fuori') && /Manuel/.test((document.querySelector('h1') || {}).textContent || '')", 'la Dashboard col nome', 12000);
    assert.equal((await manuel('statoComputer', { id: primo.id })).stato, 'entrato', 'il telefono può dire "UFFICIO-PC è entrato"');
    const io = await valuta("fetch('/server/io').then(r => r.json())");
    assert.equal(io.utente.email, 'manuel@esempio.it', 'il computer lavora come Manuel');
    assert.ok(!(await valuta("document.documentElement.outerHTML + JSON.stringify(localStorage) + JSON.stringify(sessionStorage)")).includes(manuel.token.slice(0, 20)), 'il token del telefono non arriva alla pagina');
    passo('il telefono autorizza: la pagina dice "Entrato come Manuel Gasparotto" e apre da sola la Dashboard di Manuel');

    // ------------------------------------------------------------- 3. Esci: il codice di prima non vale più
    await valuta("[...document.querySelectorAll('button')].find(b => b.id === 'chi').click(); true");
    await aspetta(400);
    await clicca('Esci', 1500);
    await finche("!!document.querySelector('.qr-box svg')", 'dopo Esci di nuovo il QR');
    assert.equal((await manuel('autorizzaComputer', primo)).errore, 'Questo codice è già stato usato: sul computer ne compare uno nuovo');
    testo = await testoPagina();
    assert.match(testo, /Studio Tecnico GM/, 'il nome dello studio sotto il titolo, ricordato');
    await aspetta(800);
    await foto('codice');
    passo('dopo Esci: un codice nuovo; quello di prima, ripresentato dal telefono, è "già usato"');

    // ------------------------------------------------------------- 3b. di nuovo col telefono, poi scollegato da Dispositivi
    const secondo = K.leggiTestoQr(await leggiQr());
    assert.equal((await manuel('autorizzaComputer', secondo)).ok, true);
    await finche("!document.body.classList.contains('fuori') && /Manuel/.test((document.querySelector('h1') || {}).textContent || '')", 'di nuovo la Dashboard', 12000);
    const sessioni = (await manuel('sessioni', {})).sessioni || [];
    const delComputer = sessioni.find(x => x.app === 'Wisper Ufficio · UFFICIO-PC' && !x.revocata);
    assert.ok(delComputer, 'fra i dispositivi di Manuel c\'è "Wisper Ufficio · UFFICIO-PC": ' + JSON.stringify(sessioni.map(x => x.app)));
    assert.equal((await manuel('revocaSessione', { id: delComputer.id })).ok, true);
    // "Rileggi" in fondo al menu: la prima richiesta al server dice che l'accesso non vale più.
    await valuta("document.querySelector('#stato-server').click(); true");
    await finche("!!document.querySelector('.qr-box svg')", 'scollegato: di nuovo il QR', 8000);
    await aspetta(2500);
    assert.match(await valuta("(document.querySelector('.zona-errore-accesso .avviso-calmo') || {}).textContent || ''"), /Sei uscito da questo dispositivo/, 'il riquadro grigio resta col primo codice');
    passo('di nuovo col telefono; scollegato da Dispositivi: il QR col riquadro grigio "Sei uscito da questo dispositivo"');

    // ------------------------------------------------------------- 4. email e password, e ritorno al codice
    await clicca('Entra con email e password', 500);
    assert.equal(await valuta("!!document.querySelector('.carta-accesso .accesso input[type=email]')"), true, 'il modulo di sempre');
    assert.equal(await valuta("!!document.querySelector('.qr-box')"), false);
    testo = await testoPagina();
    assert.match(testo, /Torna al codice del telefono/);
    await regole('email e password');
    await foto('password');
    await clicca('Torna al codice del telefono', 600);
    await finche("!!document.querySelector('.qr-box svg')", 'di nuovo il QR');
    passo('"Entra con email e password" mostra il modulo, "Torna al codice del telefono" torna al QR');

    // ------------------------------------------------------------- 5. il telefono esce prima che il computer entri: rifiutato
    // La pagina "non si vede" (le domande si fermano), il telefono autorizza ed esce, la pagina torna in vista.
    await valuta("Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); true");
    await aspetta(2500);
    const prima = K.leggiTestoQr(await leggiQr());
    const marco = await telefono('marco@esempio.it');
    assert.equal((await marco('autorizzaComputer', prima)).ok, true);
    await marco('esci', {});
    await valuta("delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); true");
    await finche("/non può più entrare/.test(document.querySelector('#principale').innerText)", 'il riquadro "non può più entrare"', 6000);
    await finche("!!document.querySelector('.qr-box svg')", 'un codice nuovo');
    const dopo = K.leggiTestoQr(await leggiQr());
    assert.notEqual(dopo.id, prima.id, 'il codice è cambiato');
    assert.equal(await valuta("document.body.classList.contains('fuori')"), true, 'il computer non è entrato');
    passo('pagina nascosta: niente domande; il telefono esce prima del computer: "non può più entrare" e un codice nuovo');

    // ------------------------------------------------------------- 6. i 5 codici e lo stop
    // I tempi veri sono 2 minuti a codice: qui il codice dura meno di un giro, e in 5 giri si arriva allo stop.
    await valuta("window.WisperCollegamento.QR.DURATA_MS = 500; true");
    await finche("!!document.querySelector('.qr-box.scaduto')", 'il QR sfocato dopo 5 codici', 20000);
    const fermo = await leggiQr();
    await aspetta(4500);
    assert.equal(await leggiQr(), fermo, 'fermo: niente codici nuovi');
    assert.equal(await valuta("[...document.querySelectorAll('.qr-velo .btn.giallo')].map(b => b.textContent).join('|')"), 'Mostra un codice nuovo');
    await regole('codice scaduto');
    await valuta("window.WisperCollegamento.QR.DURATA_MS = 120000; true");
    await foto('scaduto');
    await clicca('Mostra un codice nuovo', 1500);
    await finche("!!document.querySelector('.qr-box svg') && !document.querySelector('.qr-box.scaduto')", 'il QR di nuovo nitido');
    assert.notEqual(await leggiQr(), fermo, 'un codice nuovo');
    passo('dopo 5 codici il QR è sfocato e si ferma; "Mostra un codice nuovo" riparte');

    // ------------------------------------------------------------- 7. il server dell'ufficio non risponde
    await apriAccesso(BASE_LONTANO);
    await finche("/Il server dell'ufficio non risponde/.test(document.querySelector('#principale').innerText)", '"Il server dell\'ufficio non risponde"', 10000);
    testo = await testoPagina();
    assert.match(testo, /Il codice per il telefono funziona solo quando questo computer è in ufficio, sulla stessa rete del server\./);
    assert.equal(await valuta("[...document.querySelectorAll('.pagina-accesso .btn.giallo')].map(b => b.textContent).join('|')"), 'Riprova');
    assert.equal(await valuta("!!document.querySelector('.qr-box')"), false, 'niente codice che non può funzionare');
    await regole('server che non risponde');
    await foto('lontano');
    await clicca('Riprova', 300);
    await finche("/Il server dell'ufficio non risponde/.test(document.querySelector('#principale').innerText)", 'Riprova: ancora "non risponde"', 10000);
    await clicca('Entra con email e password', 500);
    assert.equal(await valuta("!!document.querySelector('.carta-accesso .accesso')"), true);
    passo('server dell\'ufficio spento: "Il server dell\'ufficio non risponde", Riprova (giallo) e Entra con email e password');

    assert.deepEqual(errori, [], 'nessun errore nella pagina');
    console.log('\n' + passi + ' passi, tutto bene' + (USCITA ? ' · schermate in ' + USCITA : ''));
  } finally {
    if (ws) ws.close();
    await chiudiEdge(porta, edge);
    for (const p of accesi) p.kill();
    await aspetta(500);
    await require('./edge-prova.js').togliCartella(profilo); // Edge a volte tiene un file un attimo: riprova per qualche secondo
    try { if (datiServer) fs.rmSync(datiServer, { recursive: true, force: true }); } catch (e) { /* il server lascia andare i file con calma */ }
  }
}

main().catch(e => { console.error('NO  ' + (e && e.stack ? e.stack : e)); process.exitCode = 1; });
