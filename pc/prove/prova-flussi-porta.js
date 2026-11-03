// "Fuori casa" con l'interfaccia vera, cliccando come una persona: finto ponte -> finto Google (con la porta e il
// rimbalzo 302) -> server di prova, che va a prendere il lavoro come il NAS. La casa c'è ma è spenta (come in
// albergo o dal cliente): la prova di casa non passa e tutto va da Google. Dopo ogni passo si controlla sul
// server che sia successo davvero. Edge senza finestra, profilo temporaneo (mai il browser di chi lavora).
//
//   node pc/prove/prova-flussi-porta.js [--uscita <cartella delle schermate>]
//
// Accende da sé finto Google, server di prova e finto ponte (porta-di-prova.js) e li spegne alla fine.
// Passi: entra, legge, salva un rapportino, carica uno scontrino, carica e scarica un PDF, stampa il PDF del
// rapportino; poi il server spento (da poco e da tanto) e riacceso, senza doppioni.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { avviaPorta } = require('./porta-di-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STAMPE = path.join(__dirname, 'stampe');
const PORTA = 8870 + Math.floor(Math.random() * 90);
const BASE = 'http://localhost:' + PORTA;
const GIRO = crypto.randomBytes(3).toString('hex');
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const p = await avviaPorta();
  p.modoCasa('spento');
  const ponte = spawn(process.execPath, [path.join(__dirname, 'finto-ponte.js'), String(PORTA), '--google', p.google, '--casa', p.casa], { stdio: ['ignore', 'pipe', 'pipe'] });
  const voci = [];
  ponte.stdout.on('data', d => voci.push(String(d)));
  ponte.stderr.on('data', d => voci.push(String(d)));
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-porta-'));
  const portaEdge = 9700 + Math.floor(Math.random() * 150);
  let edge = null;
  let ws = null;
  const errori = [];
  let passi = 0;
  try {
    for (let i = 0; i < 50 && !voci.join('').includes('Finto ponte su'); i++) await aspetta(100);
    edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + portaEdge, 'about:blank'], { stdio: 'ignore' });
    let pagina = null;
    for (let i = 0; i < 50 && !pagina; i++) {
      await aspetta(200);
      const lista = await fetch('http://127.0.0.1:' + portaEdge + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    if (!pagina) throw new Error('Edge non si è aperto');
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
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'porta-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(testo)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t));
        if (!b) return 'non trovo il pulsante fra: ' + tutti.map(pulito).filter(Boolean).slice(0, 40).join(' | ');
        if (b.disabled) return 'il pulsante è spento';
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "' + testo + '": ' + ok);
      await aspetta(attesa || 900);
    };
    const scrivi = async (etichetta, valore, dove) => {
      const ok = await valuta(`(() => {
        const radice = [...document.querySelectorAll(${JSON.stringify(dove || '.finestra')})].pop();
        const c = [...radice.querySelectorAll('.campo')].find(x => x.querySelector('label') && x.querySelector('label').textContent.trim() === ${JSON.stringify(etichetta)});
        if (!c) return 'non trovo il campo';
        const i = c.querySelector('input, textarea, select');
        i.value = ${JSON.stringify(valore)};
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (ok !== true) throw new Error('Campo "' + etichetta + '": ' + ok);
    };
    const vai = async (hash, attesa) => { await valuta(`location.hash = '${hash}'; true`); await aspetta(attesa || 1500); };
    const testoAvvisi = () => valuta("document.querySelector('#avvisi') ? document.querySelector('#avvisi').innerText : ''");
    const aspettaChe = async (espr, ms, cosa) => {
      const fine = Date.now() + ms;
      while (Date.now() < fine) { if (await valuta(espr)) return; await aspetta(250); }
      throw new Error('non succede: ' + cosa);
    };
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    const conta = (sql, ...x) => p.wisper.db.riga(sql, ...x).n;

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(300);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");
    await cdp('Page.navigate', { url: BASE + '/?g=1#dashboard' });
    await aspetta(1500);

    // ------------------------------------------------------------ 1. apri: la pagina di accesso dice dove sta il server
    const riga = await valuta("document.querySelector('.riga-server') ? document.querySelector('.riga-server').innerText : ''");
    assert.match(riga, /^Da fuori: Google · In casa: 127\.0\.0\.1:\d+/, riga);
    const dove = new URL(p.google).host;
    assert.ok(!(await valuta('document.documentElement.outerHTML')).includes(dove), 'l\'indirizzo dello script non arriva alla pagina');
    assert.ok(!JSON.stringify(await valuta("fetch('/locale/stato').then(r => r.json())")).includes(dove), 'né a /locale/stato');
    await foto('1-accesso');
    passo('pagina di accesso: "' + riga.split('\n')[0] + '"');
    // Dal 02/11/2026 la pagina di accesso si apre sul codice per il telefono: si passa a email e password come una persona.
    for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
    await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = 'manuel@esempio.it'; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
    await aspettaChe("!!document.querySelector('h1') && /Manuel/.test(document.querySelector('h1').textContent)", 20000, 'la Dashboard');
    assert.deepEqual(p.statoCasa.visti.filter(v => v.metodo === 'POST'), [], 'la password non va a casa');
    passo('entrato da Google come Manuel: Dashboard (' + p.rimbalzi.post + ' richieste allo script, tutte col rimbalzo 302)');

    // ------------------------------------------------------------ 2. leggi
    for (const hash of ['#rapportini/elenco', '#clienti', '#commesse', '#amministrazione/copie']) {
      await vai(hash, 2500);
      const t = await valuta("document.querySelector('#principale').innerText.slice(0, 60).replace(/\\s+/g, ' ')");
      assert.ok(!/non risponde|Server non raggiunto/.test(t), hash + ': ' + t);
      console.log('    ' + hash + ' · ' + t);
    }
    assert.ok(p.statoCasa.visti.every(v => v.percorso === '/salute' && !v.conChiave), 'a casa (spenta) solo la prova, senza token');
    passo('lette le pagine da Google: rapportini, clienti, commesse, copie');

    // ------------------------------------------------------------ 3. salva un rapportino
    const descrizione = 'Fuori casa ' + GIRO;
    await vai('#rapportini/elenco');
    await clicca('Nuovo rapportino', '#principale', 900);
    await valuta("document.querySelector('.finestra .scelta-card').click(); true");
    await aspetta(500);
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', descrizione);
    await clicca('Salva', '.finestra', 500);
    await aspettaChe("/Salvato: RAP/.test(document.querySelector('#avvisi').innerText)", 20000, 'l\'avviso Salvato');
    const rap = p.wisper.db.riga('SELECT id, id_locale FROM rapportini WHERE descrizione = ?', descrizione);
    assert.ok(rap, 'il rapportino è sul server');
    assert.equal(conta('SELECT COUNT(*) n FROM rapportini WHERE descrizione = ?', descrizione), 1);
    passo('rapportino salvato da Google: ' + rap.id);

    // ------------------------------------------------------------ 4. carica uno scontrino (finto ponte: un'immagine di prova)
    await vai('#rapportini/elenco');
    await valuta(`(() => { const r = [...document.querySelectorAll('[data-chiave], [role=button]')].find(x => x.textContent.includes(${JSON.stringify(descrizione)})); if (!r) return document.querySelector('#principale').innerText.slice(0, 400); r.click(); return true; })()`);
    await aspetta(1200);
    await valuta("document.querySelector('.pannello button[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Aggiungi uno scontrino', '.menu', 500);
    await aspettaChe("/Scontrino aggiunto/.test(document.querySelector('#avvisi').innerText)", 25000, 'Scontrino aggiunto');
    const scontrini = conta("SELECT COUNT(*) n FROM file WHERE rapportino_id = ? AND tipo = 'spesa'", rap.id);
    assert.equal(scontrini, 1, 'lo scontrino è sul server, una volta');
    await aspettaChe("[...document.querySelectorAll('.pannello img[alt=Scontrino]')].some(i => i.complete && i.naturalWidth > 0)", 15000, 'la miniatura dello scontrino (passata da Google)');
    await foto('2-scontrino');
    passo('scontrino caricato e la sua miniatura scaricata, tutto da Google');

    // ------------------------------------------------------------ 5. un PDF in byte (strada "carica") e di nuovo giù (strada "file")
    const caricato = await valuta(`(async () => {
      const byte = new Uint8Array(400 * 1024); for (let i = 0; i < byte.length; i += 65536) crypto.getRandomValues(byte.subarray(i, i + 65536));
      const testa = new TextEncoder().encode('%PDF-1.4\\n% fuori casa ${GIRO}\\n'); byte.set(testa, 0);
      const su = await fetch('/locale/carica-corpo?nome=' + encodeURIComponent('Schema ${GIRO}.pdf') + '&mime=application/pdf&per=documento&idFile=porta-${GIRO}', { method: 'POST', body: new Blob([byte]) }).then(r => r.json());
      if (!su.ok) return su;
      const giu = new Uint8Array(await (await fetch('/file/' + su.file.id)).arrayBuffer());
      const uguale = giu.length === byte.length && giu.every((x, i) => x === byte[i]);
      return { ok: true, id: su.file.id, byte: su.file.byte, uguale };
    })()`);
    assert.equal(caricato.ok, true, JSON.stringify(caricato));
    assert.equal(caricato.uguale, true, 'il PDF torna giù uguale');
    passo('PDF di ' + Math.round(caricato.byte / 1024) + ' KB caricato e riscaricato uguale (strade "carica" e "file")');

    // ------------------------------------------------------------ 6. il PDF del rapportino (le immagini passano da Google)
    // Il finto ponte riscrive un PDF con lo stesso nome: conta quello scritto da adesso in poi.
    const pdfDa = Date.now() - 1000;
    const scritti = () => (fs.existsSync(STAMPE) ? fs.readdirSync(STAMPE) : []).filter(x => /\.pdf$/.test(x) && x.indexOf(rap.id.replace(/\//g, '-')) === 0 &&
      fs.statSync(path.join(STAMPE, x)).mtimeMs >= pdfDa && fs.statSync(path.join(STAMPE, x)).size > 1000);
    await clicca('PDF', '.pannello', 1000);
    let nuovi = [];
    for (let i = 0; i < 40 && !nuovi.length; i++) { await aspetta(750); nuovi = scritti(); }
    assert.ok(nuovi.length, 'il PDF del rapportino è in pc/prove/stampe');
    passo('PDF del rapportino stampato: ' + nuovi[0]);

    // ------------------------------------------------------------ 7. server spento da poco: "attesa", poi torna (stesso id, una volta)
    p.attesaApp(1500);
    await p.spegniNas();
    const nome1 = 'Referente porta ' + GIRO;
    const scrittura = valuta(`fetch('/server/salvaReferente', { method: 'POST', body: JSON.stringify({ referente: { idSoggetto: 'C002', nome: ${JSON.stringify(nome1)} } }) }).then(r => r.json())`);
    await aspetta(4000);
    assert.equal(conta('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome1), 0, 'col server spento non si fa');
    p.accendiNas();
    const r1 = await scrittura;
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal(conta('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome1), 1);
    p.attesaApp(0);
    passo('server spento da poco: il programma richiede con lo stesso id, il server torna, il referente c\'è una volta');

    // ------------------------------------------------------------ 8. server spento da tanto: il rapportino non si salva, Riprova lo salva una volta
    await p.spegniNas();
    p.nasMutoDa(5 * 60000);
    const descr2 = 'Col server spento ' + GIRO;
    await vai('#rapportini/elenco');
    await clicca('Nuovo rapportino', '#principale', 900);
    await valuta("document.querySelector('.finestra .scelta-card').click(); true");
    await aspetta(500);
    await clicca('6 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', descr2);
    await clicca('Salva', '.finestra', 500);
    await aspettaChe("/non risponde dalle \\d{1,2}:\\d{2}/.test(document.querySelector('#avvisi').innerText)", 15000, 'l\'avviso del server spento');
    const avviso = (await testoAvvisi()).split('\n').find(x => /non risponde/.test(x));
    assert.ok(!/Serve la rete per salvare/.test(avviso), 'le parole di Google restano: ' + avviso);
    assert.equal(await valuta("!!document.querySelector('.finestra')"), true, 'il modulo resta aperto');
    await foto('3-server-spento');
    passo('server spento: "' + avviso.trim() + '", il modulo resta aperto');
    p.accendiNas();
    await aspetta(1500);
    await clicca('Salva', '.finestra', 500);
    await aspettaChe("/Salvato: RAP/.test(document.querySelector('#avvisi').innerText) && !document.querySelector('.finestra')", 20000, 'il salvataggio dopo il ritorno');
    assert.equal(conta('SELECT COUNT(*) n FROM rapportini WHERE descrizione = ?', descr2), 1, 'una volta sola');
    passo('server riacceso, Salva di nuovo: il rapportino c\'è una volta');

    // ------------------------------------------------------------ 9. Amministrazione: dove si è
    await vai('#amministrazione/app', 2000);
    const frase = await valuta("document.querySelector('.frase-collegamento') ? document.querySelector('.frase-collegamento').textContent : ''");
    assert.match(frase, /^Da fuori: Google · In casa: 127\.0\.0\.1:\d+ · ultimo contatto alle \d{1,2}:\d{2} via Google$/, frase);
    await foto('4-amministrazione');
    passo('Amministrazione › L\'app: "' + frase + '"');

    assert.equal(p.rimbalzi.postSulRimbalzo, 0, 'mai una POST forzata sul rimbalzo');
    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('TUTTO BENE (' + passi + ' passi, ' + p.rimbalzi.post + ' richieste dallo script)');
  } finally {
    if (ws) ws.close();
    if (edge) edge.kill();
    ponte.kill();
    await aspetta(500);
    await p.ferma();
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge tiene ancora un file */ }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('NO: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
