// I flussi della fase 8 (integrazioni, calendario in altre app, ricerca dentro i file, importa clienti, funzioni accese,
// riquadri, lista di controllo) fatti con l'interfaccia vera di Wisper Ufficio, cliccando come una persona, contro il
// server di prova; dopo ogni passo si controlla col server che sia successo davvero. Edge senza finestra, profilo
// temporaneo (mai il browser di chi lavora). Niente internet: la Verifica della partita IVA parla col finto VIES.
//
//   node pc/prove/finto-vies.js 8748 --rotto
//   WISPER_VIES_URL=http://127.0.0.1:8748 node server/src/avvio.js --prova --porta 8742 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8743 --server http://localhost:8742
//   node pc/prove/prova-flussi-fase8.js --porta 8743 --server http://localhost:8742 --vies http://127.0.0.1:8748 [--uscita <schermate>]
//
// Va lanciata su un server appena acceso (usa i suoi dati di esempio così come nascono).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { portaDevtools, chiudiEdge: chiudiEdgeCdp } = require('./edge-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8743));
const SERVER = opz('--server', 'http://localhost:8742').replace(/\/+$/, '');
const VIES = opz('--vies', 'http://127.0.0.1:8748').replace(/\/+$/, '');
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const Q = require('../ui/regole-fase8.js');

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi8-'));
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
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'flusso8-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem], [role=switch], [role=checkbox]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(testo)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t)) || tutti.find(x => pulito(x).indexOf(t) >= 0);
        if (!b) return 'non trovo il pulsante fra: ' + tutti.map(x => pulito(x) || x.getAttribute('aria-label')).filter(Boolean).slice(0, 60).join(' | ');
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
        if (!radice) return 'non trovo ' + ${JSON.stringify(dove || '.finestra')};
        const c = [...radice.querySelectorAll('.campo')].find(x => x.querySelector('label') && x.querySelector('label').textContent.trim() === ${JSON.stringify(etichetta)});
        if (!c) return 'non trovo il campo';
        const i = c.querySelector('input, textarea, select');
        i.value = ${JSON.stringify(valore)};
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (ok !== true) throw new Error('Campo "' + etichetta + '": ' + ok);
      await aspetta(250);
    };
    const server = async (azione, corpo) => valuta(corpo
      ? `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`
      : `fetch('/server/${azione}').then(r => r.json())`);
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1700); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoPannello = sel => valuta(`(document.querySelector(${JSON.stringify(sel)}) || {}).innerText || ''`);
    const testoFinestra = () => valuta("([...document.querySelectorAll('.velo .finestra')].pop() || {}).innerText || ''");
    const testoAvvisi = () => valuta("document.querySelector('#avvisi').innerText");
    const menu = () => valuta("[...document.querySelectorAll('#voci .voce')].map(v => v.dataset.nome + (v.querySelector('.num-v') ? ' ' + v.querySelector('.num-v').textContent : ''))");
    // Un solo pulsante giallo visibile per schermata (pagina + pannello, oppure la finestra in cima).
    const unGiallo = async nome => {
      const k = await valuta(`(() => {
        const vis = x => x.offsetParent !== null;
        const finestre = [...document.querySelectorAll('.velo .finestra')];
        if (finestre.length) return [...finestre.pop().querySelectorAll('.btn.giallo')].filter(vis).length;
        return [...document.querySelectorAll('#principale .btn.giallo, .pannello .btn.giallo')].filter(vis).length;
      })()`);
      assert.ok(k <= 1, nome + ': ' + k + ' pulsanti gialli');
    };
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    const entra = async email => {
      await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
      await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#dashboard' });
      // Dal 02/11/2026 la pagina di accesso si apre sul codice per il telefono: si passa a email e password come una persona.
      for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      for (let i = 0; i < 60 && !(await valuta("!!document.querySelector('#voci .voce')")); i++) await aspetta(250);
      await aspetta(1200);
    };
    const integrazione = async chiave => { const r = await server('integrazione?chiave=' + chiave); return r.integrazione || r; };
    const vies = async comando => fetch(VIES + '/' + comando).then(r => r.json());
    let ultimaProvaVies = 0;
    const provaVies = async () => { ultimaProvaVies = Date.now(); return server('provaIntegrazione', { chiave: 'vies' }); };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");

    // ------------------------------------------------------------- 0. La Verifica della partita IVA in Errore (finto VIES rotto)
    await entra('manuel@esempio.it');
    await vies('rompi');
    for (let i = 0; i < 3; i++) {
      const s = await integrazione('vies');
      if (s.stato === 'errore') break;
      if (ultimaProvaVies && Date.now() - ultimaProvaVies < 61000) await aspetta(61000 - (Date.now() - ultimaProvaVies));
      const r = await provaVies();
      assert.equal(r.ok, true, 'Prova adesso dal server: ' + (r.errore || ''));
    }
    assert.equal((await integrazione('vies')).stato, 'errore', 'due controlli falliti di fila: Errore (§4.1)');
    passo('Verifica della partita IVA: due controlli di fila col servizio finto rotto, il server dice Errore');

    // ------------------------------------------------------------- 1. Manuel: menu, numerino di Integrazioni, la Dashboard coi riquadri
    await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#dashboard' });
    await aspetta(3000);
    const voci = await menu();
    const nomi = voci.map(v => v.replace(/ (\d+|99\+)$/, ''));
    const iI = nomi.indexOf('Integrazioni');
    assert.ok(iI > 0 && nomi[iI - 1] === 'Collaboratori' && nomi[iI + 1] === 'Impostazioni', 'Integrazioni fra Collaboratori e Impostazioni: ' + nomi.join(', '));
    assert.ok(voci.some(v => /^Integrazioni [1-9]/.test(v)), 'il numerino dei collegamenti in Errore: ' + voci.join(', '));
    const dash = await server('dashboard');
    assert.ok(Array.isArray(dash.riquadri) && dash.riquadri.length === 4, 'quattro riquadri dal server');
    await vai('#dashboard/tutto');
    const riquadriPagina = await valuta("[...document.querySelectorAll('[data-riquadro]')].map(b => b.dataset.riquadro)");
    assert.deepEqual(riquadriPagina, dash.riquadri.map(r => r.chiave), 'in pagina i quattro della persona, in fila');
    assert.ok(dash.quante && typeof dash.quante.urgenti === 'number', 'quante per sezione');
    const testoDash = await testoPagina();
    assert.match(testoDash, /Tutto quello che c'è da fare/);
    assert.match(testoDash, /Cambia i riquadri/);
    await unGiallo('Dashboard');
    await foto('01-dashboard');
    passo('Manuel: Integrazioni nel menu col numerino, la Dashboard coi suoi quattro riquadri e i testi in fondo');

    // ------------------------------------------------------------- 2. Integrazioni: Da sistemare, la fascia, il pannello con Prova adesso giallo
    await vai('#integrazioni');
    let testo = await testoPagina();
    const segScelto = await valuta("(document.querySelector('#principale .segmenti button.scelto') || {}).textContent || ''");
    assert.match(segScelto, /^Da sistemare/, 'si apre su Da sistemare se c\'è un Errore');
    assert.match(testo, /Verifica della partita IVA/);
    assert.match(testo, /Errore/);
    const lista = (await server('integrazioni')).integrazioni;
    assert.equal(lista.length, 26, 'i 26 collegamenti');
    assert.ok(!/https?:\/\//.test(testo), 'nessun indirizzo in pagina');
    await clicca('Tutti', '#principale .segmenti', 600);
    testo = await testoPagina();
    assert.match(testo, /Non collegati/i);
    assert.match(testo, /Dipendono da una scelta/i);
    await valuta("document.querySelector('.tab-integrazioni .r[data-chiave=\"vies\"]').click(); true");
    await aspetta(1500);
    const pann = await testoPannello('.pannello-integrazione');
    assert.match(pann, /Cosa fa/);
    assert.match(pann, /Ultimi controlli/i);
    assert.match(pann, /Errore/);
    const gialloProva = await valuta("[...document.querySelectorAll('.pannello-integrazione .btn.giallo')].map(b => b.textContent).join('|')");
    assert.equal(gialloProva, 'Prova adesso', 'in Errore il giallo è Prova adesso');
    await unGiallo('Integrazioni col pannello');
    await foto('02-integrazione-errore');
    // Un Non collegato: nessun pulsante che finga di collegare.
    await valuta("document.querySelector('.tab-integrazioni .r[data-chiave=\"sdi\"]').click(); true");
    await aspetta(1300);
    const nc = await testoPannello('.pannello-integrazione');
    assert.match(nc, /Perché non è collegato/);
    assert.ok(!/Prova adesso/.test(nc), 'un Non collegato non si prova');
    passo('Integrazioni: si apre su Da sistemare, il pannello in Errore col giallo Prova adesso; un Non collegato col perché e niente da provare');

    // ------------------------------------------------------------- 3. Il calendario in altre app: nuovo indirizzo, l'indirizzo risponde
    await vai('#attivita/calendario');
    await clicca('Altro', '#principale .testata', 500);
    await clicca('Il calendario in altre app', '.menu', 1500);
    assert.equal(await valuta('location.hash'), '#attivita/altreapp');
    testo = await testoPagina();
    assert.match(testo, /Scarica un file/);
    assert.match(testo, /Sempre aggiornato/);
    assert.match(testo, /Google Calendar e Outlook/);
    await unGiallo('Il calendario in altre app');
    const prima = ((await server('feedCalendario')).feed || []).length;
    await clicca('Nuovo indirizzo', '#principale', 700);
    await scrivi('Nome', 'Tablet di prova');
    await unGiallo('Nuovo indirizzo');
    await clicca('Crea l\'indirizzo', '.finestra', 1500);
    const indirizzo = await valuta("(document.querySelector('.finestra .indirizzo-feed') || {}).textContent || ''");
    assert.match(indirizzo, /\/calendario\/[A-Za-z0-9_-]{20,}\.ics$/, 'l\'indirizzo si vede, una volta');
    testo = await testoFinestra();
    assert.match(testo, /Non lo mostriamo più/);
    await foto('03-indirizzo');
    const ics = await fetch(indirizzo).then(async r => ({ stato: r.status, tipo: r.headers.get('content-type') || '', testo: await r.text() })).catch(e => ({ stato: 0, testo: String(e) }));
    assert.equal(ics.stato, 200, 'l\'indirizzo risponde in casa: ' + ics.testo.slice(0, 120));
    assert.match(ics.tipo, /text\/calendar/);
    assert.ok(ics.testo.startsWith('BEGIN:VCALENDAR\r\n'), 'un file ICS vero');
    await clicca('Fatto', '.finestra', 900);
    const feed = (await server('feedCalendario')).feed || [];
    assert.equal(feed.length, prima + 1);
    assert.ok(feed.every(f => !f.indirizzo && !f.chiave), 'nell\'elenco la chiave non c\'è più');
    // Il file da scaricare: la finestra Salva (nel finto ponte va nella cartella delle stampe).
    await clicca('Scarica il file', '#principale', 2000);
    assert.match(await testoAvvisi(), /Salvato in .*\.ics/, 'il file .ics salvato');
    passo('Il calendario in altre app: dal ⋯ del calendario, nuovo indirizzo (visto una volta) che risponde un ICS vero, file salvato');

    // ------------------------------------------------------------- 4. Documenti: "terra"
    await vai('#documenti');
    await valuta("(() => { const i = document.querySelector('.cerca input'); i.value = 'terra'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(1800);
    const trovati = await valuta("[...document.querySelectorAll('.tab-archivio .r.cliccabile')].map(r => r.innerText.replace(/\\s+/g, ' '))");
    assert.ok(trovati.length >= 1 && trovati.some(t => /terra/i.test(t)), 'trovato il verbale: ' + trovati.join(' | '));
    const r4 = await server('documenti?archivio=1&testo=terra');
    const dentro = (r4.documenti || []).filter(d => d.trovato);
    if (dentro.length) assert.ok(trovati.some(t => /Nel testo/.test(t)), 'chi è trovato dentro ha la pillola Nel testo');
    await foto('04-terra');
    passo('Documenti: "terra" trova ' + trovati.length + ' documenti' + (dentro.length ? ', ' + dentro.length + ' dentro il testo con l\'estratto' : ' (nessuno dentro il testo: i file di prova non sono ancora letti)'));

    // ------------------------------------------------------------- 5. Importa clienti da un CSV
    const anaPrima = await server('anagrafiche?archiviati=1');
    const nomiPrima = new Set([].concat(anaPrima.clienti || [], anaPrima.fornitori || []).map(s => s.nome));
    await vai('#amministrazione/importa');
    await unGiallo('Importa ed esporta');
    await clicca('Importa clienti e fornitori', '#principale', 1500);
    for (let i = 0; i < 15 && !(await valuta("!!document.querySelector('.finestra .controllo-import h3')")); i++) await aspetta(300);
    testo = await testoFinestra();
    assert.match(testo, /clienti-fatture\.csv/);
    assert.match(testo, /Nuovi/i);
    assert.match(testo, /Già in Wisper/i);
    assert.match(testo, /Da sistemare/i);
    await unGiallo('Importa clienti e fornitori');
    await foto('05-importa');
    const giallo = await valuta("([...document.querySelectorAll('.finestra .btn.giallo')].pop() || {}).textContent || ''");
    assert.match(giallo, /^(Importa \d+( e completa \d+)?|Completa \d+)$/, 'il giallo dice quanti: ' + giallo);
    await clicca(giallo, '.finestra', 2500);
    assert.match(await testoAvvisi(), /Importati \d+ clienti, completati \d+, saltati \d+/);
    const imp = (await server('importazioni')).importazioni || [];
    assert.ok(imp.length && /clienti-fatture\.csv/.test(imp[0].nomeFile || imp[0].nome_file || imp[0].nome || ''), 'l\'importazione c\'è: ' + JSON.stringify(imp[0] || {}).slice(0, 200));
    const anaDopo = await server('anagrafiche?archiviati=1');
    const nuovi = [].concat(anaDopo.clienti || [], anaDopo.fornitori || []).filter(s => !nomiPrima.has(s.nome)).map(s => s.nome);
    assert.ok(nuovi.length >= 1, 'almeno un cliente nuovo: ' + nuovi.join(', '));
    passo('Importa clienti e fornitori: la finestra a due colonne, il controllo, il giallo coi numeri; nuovi: ' + nuovi.join(', '));

    // ------------------------------------------------------------- 6. Spegne e riaccende Mezzi e attrezzature
    await vai('#amministrazione/funzioni');
    testo = await testoPagina();
    // Dal 03/11/2026 (progetti.md §5) si spengono tutte e 19: nessuna "Sempre accesa".
    assert.ok(!/Sempre accesa/.test(testo), 'nessuna funzione "Sempre accesa"');
    assert.equal(await valuta("document.querySelectorAll('[data-modulo] .interruttore').length"), 19, 'un interruttore per ognuna delle 19 funzioni');
    await valuta("document.querySelector('[data-modulo=\"mezzi\"] .interruttore').click(); true");
    await aspetta(600);
    testo = await testoFinestra();
    assert.match(testo, /Spegnere Mezzi e attrezzature\?/);
    assert.match(testo, /Nei rapportini non si scelgono più gli strumenti/);
    await foto('06-spegni');
    await clicca('Spegni', '.finestra', 2200);
    let io = await server('io');
    assert.ok((io.interfaccia.funzioniSpente || []).indexOf('mezzi') >= 0, 'il server la sa spenta');
    assert.ok((await menu()).every(v => !/^Mezzi/.test(v)), 'sparita dal menu');
    const spenta = await server('mezzi');
    assert.equal(spenta.ok, false, 'le sue azioni rispondono spenta');
    await valuta("document.querySelector('[data-modulo=\"mezzi\"] .interruttore').click(); true");
    await aspetta(2200);
    io = await server('io');
    assert.ok((io.interfaccia.funzioniSpente || []).indexOf('mezzi') < 0, 'riaccesa');
    assert.ok((await menu()).some(v => /^Mezzi/.test(v)), 'di nuovo nel menu');
    passo('Funzioni accese: Mezzi e attrezzature spenta (conferma, menu, azioni spente) e riaccesa');

    // ------------------------------------------------------------- 7. Cambia i riquadri
    await vai('#dashboard/tutto');
    await clicca('Cambia i riquadri', '#principale', 700);
    await unGiallo('Cambia i riquadri');
    const scelti0 = await valuta("[...document.querySelectorAll('.finestra .scelta-riquadro.scelta')].map(b => b.dataset.riquadro)");
    const libero = await valuta("([...document.querySelectorAll('.finestra .scelta-riquadro:not(.scelta)')].map(b => b.dataset.riquadro)[0]) || ''");
    assert.ok(scelti0.length === 4 && libero, 'quattro scelti e uno libero');
    await valuta(`document.querySelector('.finestra .scelta-riquadro[data-riquadro="${scelti0[0]}"]').click(); true`);
    await aspetta(200);
    await valuta(`document.querySelector('.finestra .scelta-riquadro[data-riquadro="${libero}"]').click(); true`);
    await aspetta(200);
    await foto('07-riquadri');
    await clicca('Salva i riquadri', '.finestra', 2200);
    const attesi = scelti0.slice(1).concat([libero]);
    assert.deepEqual((await server('dashboard')).riquadri.map(r => r.chiave), attesi, 'il server ha i quattro nuovi, nell\'ordine del tocco');
    assert.deepEqual(await valuta("[...document.querySelectorAll('[data-riquadro]')].map(b => b.dataset.riquadro)"), attesi, 'e la pagina li mostra');
    passo('Cambia i riquadri: tolto ' + scelti0[0] + ', aggiunto ' + libero + ', salvati e mostrati');

    // ------------------------------------------------------------- 8. Segna un controllo della lista
    await vai('#amministrazione/controlli');
    testo = await testoPagina();
    assert.match(testo, /\d+ di \d+ fatti/);
    const cf = await server('controlliFinali');
    const riga = [].concat(...(cf.gruppi || []).map(g => g.righe || [])).find(x => x.tipo === 'a_mano' && x.stato !== 'fatto');
    assert.ok(riga, 'c\'è una riga a mano da fare');
    await valuta(`document.querySelector('.tab-controlli .r[data-chiave="${riga.chiave}"]').click(); true`);
    await aspetta(800);
    await scrivi('Nota', 'Provato coi dati finti', '.pannello-controllo');
    await unGiallo('Lista di controllo col pannello');
    await foto('08-controllo');
    await clicca('Salva', '.pannello-controllo', 1800);
    const dopoCf = await server('controlliFinali');
    const rigaDopo = [].concat(...(dopoCf.gruppi || []).map(g => g.righe || [])).find(x => x.chiave === riga.chiave);
    assert.equal(rigaDopo.stato, 'fatto', 'il server la segna Fatto');
    assert.equal(rigaDopo.nota, 'Provato coi dati finti');
    // Una riga dal server non si segna.
    const rigaServer = [].concat(...(dopoCf.gruppi || []).map(g => g.righe || [])).find(x => x.tipo === 'server');
    if (rigaServer) {
      await valuta(`document.querySelector('.tab-controlli .r[data-chiave="${rigaServer.chiave}"]').click(); true`);
      await aspetta(700);
      assert.ok(!(await valuta("!!document.querySelector('.pannello-controllo .btn.giallo')")), 'una riga del server non ha Salva');
    }
    passo('Lista di controllo: ' + riga.chiave + ' segnata Fatto con la nota; le righe del server non si segnano');

    // ------------------------------------------------------------- 9. Prova adesso dall'interfaccia: il servizio è tornato, Collegato
    await vies('ripara');
    const manca = 61000 - (Date.now() - ultimaProvaVies);
    if (ultimaProvaVies && manca > 0) await aspetta(manca);
    await vai('#integrazioni/vies');
    await aspetta(800);
    await clicca('Prova adesso', '.pannello-integrazione', 3500);
    assert.equal((await integrazione('vies')).stato, 'collegato', 'col servizio tornato: Collegato');
    const pannDopo = await testoPannello('.pannello-integrazione');
    assert.match(pannDopo, /Collegato/);
    assert.match(pannDopo, /controllato oggi alle \d+:\d\d/);
    assert.ok(!(await valuta("!!document.querySelector('.pannello-integrazione .btn.giallo')")), 'Collegato: Prova adesso col bordo');
    await foto('09-collegato');
    passo('Prova adesso dal pannello: il servizio è tornato, Collegato, "controllato oggi alle …", il giallo torna col bordo');

    // ------------------------------------------------------------- 10. Lettura e collaboratore
    await entra('lettura@esempio.it');
    await vai('#integrazioni');
    await valuta("document.querySelector('.tab-integrazioni .r[data-chiave=\"postino\"]').click(); true");
    await aspetta(1200);
    assert.ok(!(await valuta("[...document.querySelectorAll('.pannello-integrazione button')].some(b => /Prova adesso/.test(b.textContent))")), 'la lettura non prova');
    await entra('marco@esempio.it');
    assert.ok((await menu()).every(v => !/^Integrazioni/.test(v)), 'il collaboratore non ha Integrazioni');
    await vai('#amministrazione/notifiche');
    testo = await testoPagina();
    assert.match(testo, /Le tue notifiche/, 'Tu › Notifiche è di tutti');
    assert.ok(!/Per lo studio/.test(testo), 'la parte dello studio no');
    passo('Lettura: vede Integrazioni senza Prova adesso; Marco: niente Integrazioni, le sue Notifiche sì');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('\n' + passi + ' passi, tutto a posto.');
  } finally {
    if (ws) ws.close();
    await chiudiEdgeCdp(porta, edge);
    await aspetta(500);
    await require('./edge-prova.js').togliCartella(profilo); // Edge a volte tiene un file un attimo: riprova per qualche secondo
  }
}

main().catch(e => { console.error('NO  ' + (e && e.stack ? e.stack : e)); process.exit(1); });
