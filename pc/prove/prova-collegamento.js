// Il collegamento in basso a sinistra nel menu di Wisper Ufficio, riletto ogni minuto (13/11/2026). Andrea: "il
// collegamento (quello che si vede in basso a sinistra sul menù, con il pallino verde) si deve aggiornare ogni minuto".
// Interfaccia vera contro il server di prova; il giro di ogni minuto si chiama a mano (WisperVivo.giro) per non aspettare.
// Edge senza finestra, profilo temporaneo (mai il browser di chi lavora). Solo dati di esempio.
//
//   node server/src/avvio.js --prova --porta 8481 --dati <cartella temporanea>
//   node pc/prove/finto-ponte.js 8483 --server http://localhost:8481
//   node pc/prove/prova-collegamento.js --porta 8483 --server http://localhost:8481 [--uscita <schermate>]
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { portaDevtools, chiudiEdge: chiudiEdgeCdp, togliCartella } = require('./edge-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8483));
const SERVER = opz('--server', 'http://localhost:8481');
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));

/** Il telefono: un'altra persona entrata dallo stesso server, che scrive un rapportino. */
async function telefono() {
  const chiama = async (token, corpo) => (await fetch(SERVER + '/exec', { method: 'POST',
    headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, token ? { Authorization: 'Bearer ' + token } : {}), body: JSON.stringify(corpo) })).json();
  const r = await chiama(null, { azione: 'accedi', email: 'manuel@esempio.it', password: 'prova', disp: 'telefono-di-prova', dispNome: 'Telefono di prova', app: 'prove' });
  assert.equal(r.ok, true, 'il telefono entra: ' + JSON.stringify(r));
  let n = 0;
  return {
    async scrive(descrizione) {
      n += 1;
      const oggi = new Date();
      const data = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');
      const s = await chiama(r.token, { azione: 'salvaRapportino', rapportino: { idLocale: 'tel-' + Date.now() + '-' + n, data, tecnico: 'Manuel Gasparotto',
        lavori: [{ idLocale: 'tel-' + Date.now() + '-' + n + '-1', idCliente: 'C002', descrizione, oreLavoro: 1, tariffa: 40 }] } });
      assert.equal(s.ok, true, 'il telefono salva: ' + JSON.stringify(s).slice(0, 300));
    },
    accessi: async () => (await chiama(r.token, { azione: 'accessi', pagina: 1 })).quante,
  };
}

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-coll-'));
  const porta = portaDevtools(9820, 150);
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
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      for (const scuro of [false, true]) {
        await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] });
        await aspetta(250);
        const f = await cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(USCITA, 'collegamento-' + nome + (scuro ? '-scuro' : '') + '.png'), Buffer.from(f.result.data, 'base64'));
      }
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    };
    /** Lo stato in basso a sinistra: il testo, se è rosso, e il nome che si vede col menu richiuso. */
    const stato = () => valuta(`(() => { const b = document.querySelector('#stato-server'); return { testo: b.textContent.trim(), male: b.classList.contains('male'), nome: b.dataset.nome || '', pallino: !!b.querySelector('.pallino-stato') }; })()`);
    /** Un giro (quello che parte da solo ogni minuto) contando le domande fatte al server. */
    const giro = (durante) => valuta(`(async () => {
      const vero = window.fetch; const fatte = [];
      window.fetch = function (u) { const s = String(u && u.url ? u.url : u); if (s.indexOf('/server/') >= 0) fatte.push(s.replace(/^.*\\/server\\//, '').replace(/\\?.*$/, '')); return vero.apply(this, arguments); };
      try { const p = WisperVivo.giro(); ${durante || ''}; await p; } finally { window.fetch = vero; }
      return fatte;
    })()`);
    const pagina1 = () => valuta("document.querySelector('#principale').textContent");
    const oraAdesso = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const letteOra = async (prima) => {
      const s = await stato();
      const ore = [oraAdesso(), prima];
      assert.ok(ore.some(o => s.testo === 'Collegato · letto alle ' + o), 'lo stato dice l\'ora di adesso: ' + JSON.stringify(s) + ' (attese ' + ore.join(' o ') + ')');
      return s;
    };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); localStorage.removeItem('wisper-lato'); true");
    await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
    await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#rapportini' });
    for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
    await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = 'manuel@esempio.it'; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
    await aspetta(3000);
    // Dopo l'accesso si è sulla Casa: la prova guarda l'elenco dei Rapportini.
    await valuta("location.hash = '#rapportini'; true");
    await aspetta(1500);
    const tel = await telefono();

    // ------------------------------------------------------------- 1. Lo stato avanza da solo: una domanda sola al server
    let s = await stato();
    assert.match(s.testo, /^Collegato · letto alle \d{1,2}:\d{2}$/);
    assert.ok(s.pallino && !s.male);
    // Il primo giro dopo l'apertura legge tutto una volta (non sa ancora l'impronta); da lì in poi basta una domanda.
    let prima = oraAdesso();
    await giro();
    await valuta('WisperVivo.S.ultimaLettura = new Date(2026, 0, 1, 7, 5); true');
    prima = oraAdesso();
    const accessiPrima = await tel.accessi();
    let fatte = await giro();
    assert.deepEqual(fatte, ['novita'], 'senza novità una domanda sola');
    s = await letteOra(prima);
    assert.equal(s.nome, s.testo, 'col menu richiuso il nome è lo stesso');
    for (let i = 0; i < 3; i++) await giro();
    // "accessi" lascia la sua riga (una per lettura, qui due): i quattro giri nessuna.
    assert.equal(await tel.accessi(), accessiPrima + 1, 'i giri senza novità non lasciano righe negli accessi');
    await foto('collegato');
    passo('Ogni giro rimette l\'ora in "Collegato · letto alle ' + oraAdesso() + '" con una domanda sola, senza righe negli accessi');

    // ------------------------------------------------------------- 2. Un rapportino scritto dal telefono arriva da solo
    assert.ok(!(await pagina1()).includes('Quadro scritto dal telefono'));
    await tel.scrive('Quadro scritto dal telefono');
    await valuta("document.querySelector('#principale .pagina').dataset.segno = 'prima'; true");
    fatte = await giro();
    assert.deepEqual(fatte.slice().sort(), ['anagrafiche', 'dashboard', 'io', 'novita', 'rapportini'], 'con una novità si rilegge tutto');
    assert.ok((await pagina1()).includes('Quadro scritto dal telefono'), 'il rapportino del telefono è nell\'elenco senza premere niente');
    assert.equal(await valuta("document.querySelector('#principale .pagina').dataset.segno || ''"), '', 'l\'elenco dei Rapportini si è rifatto');
    assert.equal(await valuta("!!document.querySelector('.attesa')"), false, 'niente "Rileggo…"');
    await foto('arrivato');
    passo('Un rapportino scritto dal telefono compare nell\'elenco al giro dopo, senza "Rileggo…"');

    // ------------------------------------------------------------- 3. Con una finestra aperta la pagina non si tocca
    await valuta("[...document.querySelectorAll('#principale button')].find(b => b.textContent.trim() === 'Nuovo rapportino').click(); true");
    await aspetta(900);
    assert.equal(await valuta("!!document.querySelector('.velo')"), true, 'la finestra del rapportino è aperta');
    await tel.scrive('Cabina scritta dal telefono');
    await valuta("document.querySelector('#principale .pagina').dataset.segno = 'sotto'; true");
    await giro();
    assert.equal(await valuta("!!document.querySelector('.velo')"), true, 'la finestra resta aperta');
    assert.equal(await valuta("document.querySelector('#principale .pagina').dataset.segno || ''"), 'sotto', 'sotto la finestra la pagina non si rifà');
    await letteOra(oraAdesso());
    await valuta("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
    await aspetta(600);
    if (await valuta("!!document.querySelector('.velo')")) {
      await valuta("(b => { if (b) b.click(); return true; })([...document.querySelectorAll('.velo button')].find(b => /^(Annulla|Chiudi)$/.test(b.textContent.trim())))");
      await aspetta(600);
    }
    assert.equal(await valuta("!!document.querySelector('.velo')"), false, 'la finestra si chiude');
    await aspetta(50);
    await giro();
    assert.ok((await pagina1()).includes('Cabina scritta dal telefono'), 'chiusa la finestra, al giro dopo l\'elenco ha anche il secondo');
    passo('Con una finestra aperta la pagina sotto non si rifà; chiusa, al giro dopo arriva tutto');

    // ------------------------------------------------------------- 4. Se si tocca qualcosa mentre legge, i dati si buttano
    await tel.scrive('Linea scritta dal telefono');
    await giro("document.dispatchEvent(new Event('pointerdown'))");
    assert.ok(!(await pagina1()).includes('Linea scritta dal telefono'), 'toccato qualcosa durante la lettura: i dati arrivati non si usano');
    await letteOra(oraAdesso());
    fatte = await giro();
    assert.ok(fatte.includes('rapportini'), 'al giro dopo si rilegge');
    assert.ok((await pagina1()).includes('Linea scritta dal telefono'));
    passo('Toccando qualcosa mentre legge i dati arrivati si buttano; il giro dopo li riprende');

    // ------------------------------------------------------------- 5. Su un'altra pagina i dati entrano, la pagina resta
    await valuta("location.hash = '#clienti'; true");
    await aspetta(1500);
    await tel.scrive('Verifica scritta dal telefono');
    await valuta("document.querySelector('#principale .pagina').dataset.segno = 'clienti'; true");
    await giro();
    assert.equal(await valuta("document.querySelector('#principale .pagina').dataset.segno || ''"), 'clienti', 'la pagina dei Clienti non si rifà da sola');
    assert.ok(await valuta("WisperVivo.S.rapportini.some(r => r.descrizione === 'Verifica scritta dal telefono')"), 'ma i dati sono arrivati');
    await valuta("location.hash = '#rapportini'; true");
    await aspetta(1500);
    assert.ok((await pagina1()).includes('Verifica scritta dal telefono'), 'entrando nei Rapportini c\'è già');
    passo('Sulle altre pagine i dati entrano senza rifare la pagina; ai Rapportini ci sono già');

    // ------------------------------------------------------------- 6. Server non raggiunto: lo dice da solo, e torna da solo
    await valuta("window.__vero = window.fetch; window.fetch = function (u) { return String(u && u.url ? u.url : u).indexOf('/server/') >= 0 ? Promise.reject(new TypeError('spento')) : window.__vero.apply(this, arguments); }; true");
    await valuta('WisperVivo.giro()');
    s = await stato();
    assert.deepEqual([s.testo, s.male, s.nome], ['Server non raggiunto · Riprova', true, 'Server non raggiunto · Riprova']);
    assert.ok((await pagina1()).includes('Quadro scritto dal telefono'), 'la pagina resta com\'era');
    assert.equal(await valuta("!!document.querySelector('.avviso.male, .avviso.errore')"), false, 'nessun avviso rosso a ogni minuto');
    await foto('non-raggiunto');
    await valuta('window.fetch = window.__vero; true');
    await valuta('WisperVivo.giro()');
    s = await letteOra(oraAdesso());
    assert.ok(!s.male && s.pallino);
    passo('Server non raggiunto: lo stato diventa rosso da solo, e torna "Collegato" al primo giro buono');

    // ------------------------------------------------------------- 7. Il giro parte da solo ogni minuto
    assert.equal(await valuta("typeof WisperVivo.giro"), 'function');
    await valuta('WisperVivo.S.ultimaLettura = new Date(2026, 0, 1, 7, 5); document.querySelector("#stato-server").click(); true');
    await aspetta(2500);
    await letteOra(oraAdesso());
    passo('Premendo lo stato si rilegge subito, come prima');

    assert.deepEqual(errori, [], 'errori nella pagina');
    console.log('\n' + passi + ' passi, tutti a posto');
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* già chiuso */ }
    try { await chiudiEdge(); } catch (e) { /* già chiuso */ }
    await chiudiEdgeCdp(porta, edge);
    await aspetta(500);
    await togliCartella(profilo);
  }
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
