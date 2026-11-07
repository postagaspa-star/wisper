// Il rapportino con più lavori (docs/gestionale/rapportino-lavori.md, 06/11/2026), fatto con l'interfaccia vera contro
// il server di prova, con Edge senza finestra e un profilo temporaneo:
//   un rapportino con 3 lavori di 2 clienti (uno col nome lunghissimo) → l'errore che dice quale lavoro → salvato →
//   l'elenco raggruppato col rapportino e i suoi lavori → Da inviare → la scelta di tutto il rapportino → il pannello →
//   il PDF per un cliente solo → l'invio diviso in 2 email, ognuna solo coi suoi lavori → i lavori Inviati.
// Lungo la strada: il testo sta tutto nei contenitori (1024 e 1440 px, chiaro e scuro, niente puntini) e nessuna
// parola "firma" nelle schermate nuove.
//
//   node server/src/avvio.js --prova --porta 8743 --dati <cartella temporanea>
//   node pc/prove/finto-ponte.js 8744 --server http://localhost:8743
//   node pc/prove/prova-flussi-lavori.js --porta 8744 [--posta <cartella temporanea>/posta-finta/email] [--uscita <schermate>]
//   (WISPER_DEVTOOLS_PORTA per la porta di DevTools)
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { portaDevtools, chiudiEdge: chiudiEdgeCdp } = require('./edge-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8744));
const USCITA = opz('--uscita', '');
const POSTA = opz('--posta', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));
// Il server di prova tiene i dati finché resta acceso: un cliente nuovo a ogni giro, col nome più lungo che si possa
// incontrare (per vedere che il testo stia nei contenitori).
// Con --uscita (schermate per il diario, sempre su un server nuovo) il nome resta senza il codice del giro. Un nome che
// si vede subito inventato ("Esempio"), per non somigliare a una ditta vera.
const GIRO = Date.now().toString(36).slice(-4).toUpperCase();
const LUNGO = 'Officine Elettromeccaniche Esempio e Figli ' + (USCITA ? '' : GIRO + ' ') + 'Srl';
const EMAIL_LUNGO = 'ufficio.' + (USCITA ? 'esempio' : GIRO.toLowerCase()) + '@esempio.it';
const STAMPE = path.join(__dirname, 'stampe');

// I testi tagliati coi puntini, quello che sborda dal suo contenitore (escluse le anteprime volute di una riga e il foglio
// schematico dell'invio).
const CONTROLLO = `(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const fuori = [];
  [...document.querySelectorAll('#principale, .pannello, .velo .finestra, #lato')].forEach(rad => rad.querySelectorAll('*').forEach(e => {
    if (!vis(e) || e.closest('.foglio-a4, .una-riga, svg, .menu, .miniature')) return;
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) fuori.push('puntini: ' + (e.className || e.tagName) + ' «' + e.textContent.trim().slice(0, 50) + '»');
    if (e.children.length === 0 && e.textContent.trim() && e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA') {
      if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 1) fuori.push('tagliato: ' + (e.className || e.tagName) + ' «' + e.textContent.trim().slice(0, 50) + '»');
      const r = e.getBoundingClientRect();
      const p = e.parentElement.getBoundingClientRect();
      if (r.right > p.right + 2 && getComputedStyle(e.parentElement).overflow !== 'visible') fuori.push('sborda: ' + (e.className || e.tagName) + ' «' + e.textContent.trim().slice(0, 50) + '»');
    }
  }));
  return Array.from(new Set(fuori));
})()`;

async function collega(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let n = 0;
  const attese = new Map();
  const errori = [];
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
  return { ws, cdp, valuta, errori };
}

async function main() {
  const inizio = Date.now();
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-lavori-'));
  const porta = portaDevtools(9870, 60);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let tab = null;
  let passi = 0;
  const passo = m => { passi++; console.log('ok  ' + m); };
  try {
    let pagina = null;
    for (let i = 0; i < 50 && !pagina; i++) {
      await aspetta(200);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    tab = await collega(pagina.webSocketDebuggerUrl);
    const { cdp, valuta } = tab;
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    // Senza finestra la pagina non ha il fuoco: senza questo, fuoco e uscita dai campi non arrivano.
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    const misura = async w => { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: w <= 1024 ? 768 : 900, deviceScaleFactor: 1, mobile: false }); await aspetta(350); };
    const tema = async scuro => { await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] }); await aspetta(250); };
    await misura(1440);
    await tema(false);
    const foto = async (nome, scuro) => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      if (scuro) await tema(true);
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'computer-rapportino-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
      if (scuro) await tema(false);
    };
    // Il testo sta nei contenitori a 1024 e 1440, chiaro e scuro; nessuna parola della firma nelle schermate nuove.
    const sta = async (cosa) => {
      for (const w of [1024, 1440]) {
        for (const scuro of [false, true]) {
          await misura(w);
          await tema(scuro);
          const x = await valuta(CONTROLLO);
          assert.deepEqual(x, [], cosa + ' a ' + w + (scuro ? ' scuro' : ' chiaro') + ': il testo non sta');
        }
      }
      await misura(1440);
      await tema(false);
      const parole = await valuta("[...document.querySelectorAll('#principale, .pannello, .velo .finestra')].map(x => x.innerText).join(' ')");
      assert.ok(!/firm/i.test(parole), cosa + ': nessuna parola della firma');
    };
    const togliAvvisi = () => valuta("document.querySelectorAll('#avvisi .avviso').forEach(a => a.remove()); true");
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(testo)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t));
        if (!b) return 'non trovo il pulsante fra: ' + tutti.map(x => pulito(x) || x.getAttribute('aria-label')).filter(Boolean).slice(0, 60).join(' | ');
        if (b.disabled) return 'il pulsante è spento';
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "' + testo + '": ' + ok);
      await aspetta(attesa || 700);
    };
    const finestra = '.velo .finestra';
    const scrivi = async (etichetta, valore, dove) => {
      const ok = await valuta(`(() => {
        const radice = [...document.querySelectorAll(${JSON.stringify(dove || finestra)})].pop();
        const c = [...radice.querySelectorAll('.campo')].find(x => x.querySelector('label') && x.querySelector('label').textContent.trim() === ${JSON.stringify(etichetta)});
        const i = c ? c.querySelector('input, textarea, select') : radice.querySelector(${JSON.stringify('[aria-label="' + etichetta + '"]')});
        if (!i) return 'non trovo il campo';
        i.focus();
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
    const testoFinestra = () => valuta(`([...document.querySelectorAll(${JSON.stringify(finestra)})].pop() || {}).innerText || ''`);
    // Gli avvisi spariscono da soli dopo 3 s: con la macchina lenta l'avviso può essere già andato quando si guarda.
    // guardaAvvisi() tiene nota di ogni avviso comparso da lì in poi; testoAvvisi() dà quelli visti più quelli di adesso.
    const guardaAvvisi = () => valuta(`(() => {
      window.__avvisiVisti = [];
      if (window.__guardiaAvvisi) window.__guardiaAvvisi.disconnect();
      window.__guardiaAvvisi = new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => { if (n.textContent) window.__avvisiVisti.push(n.textContent); })));
      window.__guardiaAvvisi.observe(document.querySelector('#avvisi'), { childList: true, subtree: true });
      return true;
    })()`);
    const testoAvvisi = () => valuta("(window.__avvisiVisti || []).concat([document.querySelector('#avvisi').innerText]).join(' | ')");
    const testoPannello = () => valuta("(document.querySelector('.pannello') || {}).innerText || ''");
    // Un cliente nell'editor: si cerca per nome e si tocca la sua scheda.
    const scegliCliente = async nome => {
      await scrivi('Cerca il cliente', nome.split(' ')[0]);
      await aspetta(300);
      const ok = await valuta(`(() => { const b = [...document.querySelectorAll('.velo .finestra .zona-lavoro .scelta-card')].find(x => x.title === ${JSON.stringify(nome)} || x.title.startsWith(${JSON.stringify(nome + ' ·')})); if (!b) return [...document.querySelectorAll('.velo .finestra .zona-lavoro .scelta-card')].map(x => x.title).join(' | '); b.click(); return true; })()`);
      if (ok !== true) throw new Error('Cliente ' + nome + ': ' + ok);
      await aspetta(400);
    };
    const pillola = async testo => {
      const ok = await valuta(`(() => { const b = [...document.querySelectorAll('.velo .finestra .zona-lavoro .pillola')].find(x => x.textContent.trim().startsWith(${JSON.stringify(testo)})); if (!b) return [...document.querySelectorAll('.velo .finestra .zona-lavoro .pillola')].map(x => x.textContent.trim()).join(' | '); b.click(); return true; })()`);
      if (ok !== true) throw new Error('Pillola ' + testo + ': ' + ok);
      await aspetta(300);
    };
    const tariffa = async valore => {
      const vuota = await valuta("(() => { const i = document.querySelector('.velo .finestra input[aria-label=\"Tariffa oraria\"]'); return !!i && !i.value; })()");
      if (vuota) await scrivi('Tariffa oraria', valore);
    };
    // I PDF: l'HTML che andrebbe a Edge, per guardarlo in una scheda a parte (solo quando si chiede).
    await valuta('true');
    const prendiPdf = () => valuta(`(() => {
      window.__prendi = true;
      if (window.__pdfPreso) return true;
      window.__pdfPreso = true;
      const vero = window.fetch;
      window.fetch = (u, o) => {
        if (window.__prendi && String(u).indexOf('/locale/pdf') >= 0) {
          window.__prendi = false;
          try { window.__ultimoPdf = JSON.parse(o.body).html; } catch (e) { window.__ultimoPdf = ''; }
          return Promise.resolve(new Response(JSON.stringify({ ok: true, percorso: 'stampe', nome: 'prova.pdf', base64: '' }), { headers: { 'Content-Type': 'application/json' } }));
        }
        return vero(u, o);
      };
      return true;
    })()`);
    const fotoHtml = async (nome, html) => {
      const t = await cdp('Target.createTarget', { url: BASE + '/vuota' });
      await aspetta(1000);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json());
      const p = lista.find(x => x.id === t.result.targetId);
      const s = await collega(p.webSocketDebuggerUrl);
      await s.cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 1270, deviceScaleFactor: 1, mobile: false });
      const conBase = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + '<base href="' + BASE + '/">') : '<base href="' + BASE + '/">' + html;
      await s.valuta('document.open(); document.write(' + JSON.stringify(conBase) + '); document.close(); true');
      // Sullo schermo i margini del foglio (@page, 14 mm) non ci sono: si mettono a mano, solo per la schermata.
      await s.valuta("document.body.style.padding = '53px'; true");
      await aspetta(1200);
      const testo = await s.valuta('document.body.innerText');
      if (USCITA) {
        fs.mkdirSync(USCITA, { recursive: true });
        const f = await s.cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(USCITA, 'computer-rapportino-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
      }
      s.ws.close();
      await cdp('Target.closeTarget', { targetId: t.result.targetId });
      return testo;
    };

    // ------------------------------------------------------------- accesso (senza la visita guidata)
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); fetch('/locale/esci', { method: 'POST', body: '{}' }).then(() => fetch('/locale/accedi', { method: 'POST', body: JSON.stringify({ email: 'manuel@esempio.it', password: 'prova' }) })).then(r => r.json())");
    // Il cliente col nome lungo, senza email (all'invio va scritta).
    const cli = await server('salvaSoggetto', { soggetto: { nome: LUNGO, cliente: true, fornitore: false } });
    assert.ok(cli.ok, 'cliente col nome lungo: ' + JSON.stringify(cli));
    // Due rapportini Da inviare di 10 e 9 giorni fa per il cliente nuovo, un lavoro ciascuno (forma nuova di
    // salvaRapportino, come la manda il computer): servono alla voce della Dashboard e all'invio di più rapportini.
    const giorniFa = n => new Date(Date.now() - n * 86400000 + 3600000).toISOString().slice(0, 10);
    const vecchioDi = async (n, cosa) => {
      const r = await server('salvaRapportino', { rapportino: { idLocale: 'G-vecchio' + n + '-' + GIRO, data: giorniFa(n), lavori: [
        { idLocale: 'L-vecchio' + n + '-' + GIRO, idCliente: cli.soggetto.id, cliente: LUNGO, descrizione: cosa, oreLavoro: 2, km: 20, tariffa: 40 }] } });
      assert.ok(r.ok && r.rapportino && r.rapportino.lavori.length === 1, 'rapportino di ' + n + ' giorni fa: ' + JSON.stringify(r).slice(0, 300));
      return r;
    };
    const vecchio = await vecchioDi(10, 'Verifica delle protezioni del quadro.');
    const vecchio2 = await vecchioDi(9, 'Taratura dei relè termici della linea di aspirazione.');
    const VECCHI = [vecchio.rapportino.id, vecchio2.rapportino.id];
    await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#rapportini' });
    // La prima pagina può metterci un po' (macchina lenta): si aspetta il menu e i segmenti, fino a 20 s.
    for (let i = 0; i < 80 && !(await valuta("!!document.querySelector('#voci') && !!document.querySelector('#principale .segmenti')")); i++) await aspetta(250);
    assert.ok(await valuta("!!document.querySelector('#voci')"), 'entrato');
    // Dal 07/11/2026 (niente Ore) la voce Rapportini si apre già sull'elenco.
    for (let i = 0; i < 40 && (await valuta("(document.querySelector('#principale h1') || {}).textContent")) !== 'Rapportini'; i++) await aspetta(250);
    assert.equal(await valuta("document.querySelector('#principale h1').textContent"), 'Rapportini', 'si apre sull\'elenco dei rapportini');
    passo('entrato come Manuel, Rapportini; cliente ' + LUNGO + ' creato');

    // ------------------------------------------------------------- la Dashboard: "N lavori da inviare da più di una settimana"
    // Il collegamento del server è { pagina: 'rapportini', filtro: { quali: 'inviare', a: <7 giorni fa> } }: si apre
    // Rapportini su Da inviare, con "Fino al …", e restano solo i lavori da inviare di prima di quel giorno.
    const dash = await server('dashboard?tutto=1');
    const vociDash = [].concat(...['urgenti', 'settimana', 'pianificare'].map(k => (dash[k] || []))).concat(dash.voci || []);
    const voceVecchi = vociDash.find(v => /lavor[oi] da inviare da più di una settimana/.test(v.titolo || ''));
    assert.ok(voceVecchi, 'il server di prova ha la voce dei lavori vecchi: ' + vociDash.map(v => v.titolo).join(' | ').slice(0, 600));
    const finoA = voceVecchi.collegamento.filtro.a;
    await valuta("location.hash = '#dashboard'; true");
    await aspetta(2500);
    const cercaVecchi = `(() => {
      const b = [...document.querySelectorAll('#principale button')].find(x => /da inviare da più di una settimana/.test(x.textContent));
      if (!b) return 'manca';
      b.click();
      return b.closest('.piu-urgente') ? 'la cosa più urgente' : 'riga';
    })()`;
    let dove = await valuta(cercaVecchi);
    if (dove === 'manca') {
      // Le sezioni hanno un tetto di righe: la voce può stare in "Tutto quello che c'è da fare".
      await valuta("location.hash = '#dashboard/tutto'; true");
      await aspetta(2000);
      for (const sez of ['Urgenti', 'Questa settimana', 'Da pianificare']) {
        dove = await valuta(cercaVecchi);
        if (dove !== 'manca') { dove = 'Tutto quello che c\'è da fare'; break; }
        await valuta(`(() => { const b = [...document.querySelectorAll('#principale .segmenti button')].find(x => x.textContent.startsWith(${JSON.stringify(sez)})); if (b) b.click(); return true; })()`);
        await aspetta(600);
      }
    }
    assert.notEqual(dove, 'manca', 'la Dashboard mostra la voce: ' + (await valuta("document.querySelector('#principale').innerText")).slice(0, 800));
    await aspetta(1800);
    const vistaVecchi = await valuta(`(() => ({
      hash: location.hash,
      segmento: (([...document.querySelectorAll('#principale .segmenti')].pop() || document).querySelector('[aria-pressed="true"], .scelto, .scelta, [aria-checked="true"]') || {}).textContent.trim(),
      chip: [...document.querySelectorAll('#principale .filtro-attivo')].map(x => x.textContent.trim()).join(' | '),
      righe: [...document.querySelectorAll('#principale .tab.lavori .r.lavoro')].length,
    }))()`);
    assert.match(vistaVecchi.hash, /^#rapportini/, 'la voce porta ai Rapportini');
    assert.match(vistaVecchi.chip, new RegExp('Fino al ' + finoA.slice(8, 10) + '/' + finoA.slice(5, 7) + '/' + finoA.slice(0, 4)), 'il filtro "Fino al": ' + vistaVecchi.chip);
    const lavoriVisti = await server('rapportini');
    const attesi = (lavoriVisti.rapportini || []).filter(r => ['BOZZA', 'FIRMATO'].indexOf(String(r.stato || 'BOZZA').toUpperCase()) >= 0 && String(r.data).slice(0, 10) <= finoA);
    assert.ok(vistaVecchi.righe > 0, 'si vedono dei lavori');
    assert.ok(vistaVecchi.righe <= attesi.length, 'solo i lavori da inviare fino al ' + finoA + ': ' + vistaVecchi.righe + ' righe, ' + attesi.length + ' attesi');
    const statiVisti = await valuta("[...document.querySelectorAll('#principale .tab.lavori .r.lavoro .stato')].map(x => x.textContent.trim())");
    assert.ok(statiVisti.length && statiVisti.every(s => s === 'Da inviare'), 'tutti Da inviare: ' + statiVisti.join(', '));
    passo('Dashboard (' + dove + '): "' + voceVecchi.titolo + '" apre Rapportini su ' + (vistaVecchi.segmento || 'Da inviare') + ' con "' + vistaVecchi.chip + '", ' + vistaVecchi.righe + ' lavori, tutti Da inviare');
    // Si torna all'elenco normale (senza il filtro della data).
    await valuta("location.hash = '#rapportini'; true");
    await aspetta(1500);
    await valuta("(() => { const x = [...document.querySelectorAll('#principale .filtro-attivo button')]; x.forEach(b => b.click()); return true; })()");
    await aspetta(600);
    await clicca('Tutti', '#principale .segmenti', 900);
    // e il mese di oggi, come quando si entra
    await valuta(`(() => { const s = document.querySelector('#principale .filtri select'); s.value = ${JSON.stringify(new Date().toISOString().slice(0, 7))}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await aspetta(600);

    // ------------------------------------------------------------- il rapportino: 3 lavori di 2 clienti
    await clicca('Nuovo rapportino', '#principale', 1000);
    let testo = await testoFinestra();
    assert.match(testo, /Nuovo rapportino/);
    assert.match(testo, /Lavoro 1/);
    assert.match(testo, /Aggiungi un lavoro/);
    assert.match(testo, /Salva rapportino/);
    assert.equal(await valuta("document.querySelectorAll('.velo .finestra .btn.giallo').length"), 1, 'un solo pulsante giallo');
    // Lavoro 1: Rossi, commessa 26ST002, 4 ore.
    await scegliCliente('Rossi Impianti Srl');
    await pillola('26ST002');
    await pillola('4 h');
    await scrivi('Cosa hai fatto', 'Cablaggio del quadro generale e prova delle partenze.');
    await tariffa('45');
    // Lavoro 2: il cliente col nome lungo, senza commessa, 6 ore, senza dire cosa (l'errore).
    await clicca('Aggiungi un lavoro', finestra, 600);
    assert.match(await testoFinestra(), /Lavoro 2 di 2/);
    await scegliCliente(LUNGO);
    await pillola('Senza commessa');
    await pillola('6 h');
    await tariffa('40');
    await scrivi('Chilometri', '35');
    await togliAvvisi();
    await clicca('Salva rapportino', finestra, 900);
    assert.match(await testoAvvisi(), /Lavoro 2: scrivi che lavoro hai fatto/, 'l\'errore dice quale lavoro');
    assert.equal(await valuta("document.querySelector('.velo .finestra .card-lavoro.scelta').dataset.lavoro"), '2', 'si apre il lavoro sbagliato');
    assert.ok(await valuta("document.querySelector('.velo .finestra .card-lavoro[data-lavoro=\"2\"]').classList.contains('sbagliata')"), 'la scheda del lavoro 2 è segnata');
    assert.match(await testoFinestra(), /Scrivi che lavoro hai fatto/, 'l\'errore sotto il campo');
    assert.equal((await server('rapportini')).rapportini.filter(r => r.cliente === LUNGO && VECCHI.indexOf(r.idGiornata) < 0).length, 0, 'niente salvato');
    await foto('errore');
    passo('Salva rapportino con il lavoro 2 incompleto: "Lavoro 2: scrivi che lavoro hai fatto", si apre il lavoro 2');
    await scrivi('Cosa hai fatto', 'Sopralluogo per il nuovo impianto di aspirazione e misure del capannone.');
    // Lavoro 3: copia del lavoro 1 (stesso cliente, commessa e tariffa), poi l'altra commessa di Rossi.
    await valuta("document.querySelector('.velo .finestra .card-lavoro[data-lavoro=\"1\"]').click(); true");
    await aspetta(400);
    await clicca('Copia il lavoro scelto', finestra, 700);
    testo = await testoFinestra();
    assert.match(testo, /Lavoro 3 di 3/);
    assert.equal(await valuta("document.querySelector('.velo .finestra .zona-lavoro .scelta-card.scelta b').textContent"), 'Rossi Impianti Srl', 'copiato il cliente');
    await pillola('26ST003');
    await pillola('8 h');
    await scrivi('Cosa hai fatto', 'Adeguamento delle linee del capannone.');
    await tariffa('45');
    testo = await testoFinestra();
    assert.match(testo, /3 lavori · 18 h/);
    assert.match(testo, /Totale del giorno/);
    await togliAvvisi();
    await sta('il rapportino con 3 lavori');
    await foto('editor');
    await guardaAvvisi();
    await clicca('Salva rapportino', finestra, 1800);
    assert.match(await testoAvvisi(), /Salvato: RAP\/\d{4}\/\d{4} · 3 lavori/);
    const tutti = (await server('rapportini')).rapportini;
    const mio = tutti.find(r => r.cliente === LUNGO && VECCHI.indexOf(r.idGiornata) < 0);
    assert.ok(mio, 'il lavoro del cliente lungo è sul server');
    const ID = mio.idGiornata;
    const suoi = tutti.filter(r => r.idGiornata === ID).sort((a, b) => a.posizione - b.posizione);
    assert.deepEqual(suoi.map(r => [r.posizione, r.cliente, r.idCommessa || '', r.stato]),
      [[1, 'Rossi Impianti Srl', '26ST002', 'BOZZA'], [2, LUNGO, '', 'BOZZA'], [3, 'Rossi Impianti Srl', '26ST003', 'BOZZA']], 'tre lavori in ordine');
    assert.ok(suoi.every(r => r.numero === ID), 'il numero del rapportino su ogni lavoro');
    passo('Salva rapportino: ' + ID + ' con 3 lavori di 2 clienti (Rossi 26ST002 e 26ST003, ' + LUNGO + ')');

    // ------------------------------------------------------------- l'elenco raggruppato, Da inviare, la scelta
    await valuta("document.querySelector('.pannello') && document.querySelector('.pannello [aria-label=\"Chiudi\"]').click(); true");
    await aspetta(400);
    await clicca('Da inviare', '#principale .filtri', 900);
    const riga = await valuta(`(document.querySelector('.tab .r.rap[data-giornata="${ID}"]') || {}).innerText || ''`);
    assert.match(riga, /3 lavori · 2 clienti/);
    assert.match(riga, /3 da inviare/);
    assert.equal(await valuta(`(() => { const r = document.querySelector('.tab .r.rap[data-giornata="${ID}"]'); const out = []; let x = r.nextElementSibling; while (x && x.classList.contains('lavoro')) { out.push(x.dataset.chiave); x = x.nextElementSibling; } return out.length; })()`), 3, 'sotto il rapportino i suoi 3 lavori');
    await valuta(`document.querySelector('.tab .r.rap[data-giornata="${ID}"] input').click(); true`);
    await aspetta(500);
    const barra = await valuta("(document.querySelector('.barra-scelti') || {}).innerText || ''");
    assert.match(barra, /3 lavori scelti/);
    assert.match(barra, /2 clienti/);
    await sta('l\'elenco con la barra');
    await foto('elenco');
    passo('Da inviare: la riga del rapportino (3 lavori · 2 clienti, 3 da inviare), la casella sceglie i suoi 3 lavori');
    // Un lavoro tolto dalla scelta: la casella del rapportino va a metà.
    await valuta(`document.querySelector('.tab .r.lavoro[data-chiave="${suoi[1].id}"] input').click(); true`);
    await aspetta(300);
    assert.equal(await valuta(`document.querySelector('.tab .r.rap[data-giornata="${ID}"] input').indeterminate`), true, 'a metà');
    assert.match(await valuta("document.querySelector('.barra-scelti').innerText"), /2 lavori scelti[\s\S]*1 cliente/);
    await clicca('Deseleziona', '.barra-scelti', 400);
    passo('un lavoro tolto: la casella del rapportino a metà; Deseleziona');

    // ------------------------------------------------------------- il pannello
    await valuta(`document.querySelector('.tab .r.rap[data-giornata="${ID}"]').click(); true`);
    await aspetta(700);
    testo = await testoPannello();
    assert.match(testo, new RegExp(ID.replace(/\//g, '\\/')));
    assert.match(testo, /3 lavori · 2 clienti/);
    assert.match(testo, /Totale del giorno/);
    assert.match(testo, /Invia ai clienti/);
    assert.ok(!/Carica il foglio/.test(testo), 'niente foglio da caricare');
    assert.equal(await valuta("[...document.querySelectorAll('.pannello .btn.giallo')].map(b => b.textContent).join('|')"), 'Invia ai clienti', 'un solo giallo: Invia ai clienti');
    await clicca('Altre azioni', '.pannello .piede', 400);
    const menu = await valuta("document.querySelector('.menu').innerText");
    assert.match(menu, /Segna inviato senza email/);
    assert.match(menu, /Elimina/);
    assert.ok(!/firm/i.test(menu));
    await valuta("document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true");
    await aspetta(200);
    await sta('il pannello');
    await foto('pannello');
    // Un lavoro aperto: i suoi dettagli e il suo menu.
    await valuta(`document.querySelector('.pannello .lavoro-p[data-chiave="${suoi[1].id}"] .lavoro-testa').click(); true`);
    await aspetta(400);
    testo = await testoPannello();
    assert.match(testo, /Sopralluogo per il nuovo impianto/);
    assert.match(testo, /Altro su questo lavoro/);
    await sta('il pannello con un lavoro aperto');
    passo('pannello: numero, giorno, 3 lavori con stato e importo, Totale del giorno; giallo solo Invia ai clienti');

    // ------------------------------------------------------------- il PDF per un cliente: solo i suoi lavori
    await prendiPdf();
    await clicca('PDF', '.pannello .piede', 400);
    await clicca('PDF per Rossi Impianti Srl', '.menu', 900);
    const html = await valuta('window.__ultimoPdf || ""');
    assert.ok(html.indexOf('<table class="lavori">') > 0, 'il PDF coi lavori');
    const corpoPdf = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    assert.equal((corpoPdf.match(/<tr>/g) || []).length, 2, 'i 2 lavori di Rossi');
    assert.ok(html.indexOf(LUNGO) < 0, 'niente lavori di un altro cliente');
    assert.ok(html.indexOf('Firma per accettazione') < 0, 'niente riquadro per la firma del cliente');
    const testoPdf = await fotoHtml('pdf', html);
    assert.match(testoPdf, /Totale del giorno/);
    passo('PDF per Rossi: 2 righe, il totale del giorno, niente lavori dell\'altro cliente, niente firma del cliente');

    // ------------------------------------------------------------- l'invio diviso per destinatario
    await clicca('Invia ai clienti', '.pannello', 1200);
    testo = await testoFinestra();
    assert.match(testo, /Invio rapportino/);
    assert.match(testo, /2 clienti/);
    assert.match(testo, /Invia 2 email/);
    const schede = await valuta("[...document.querySelectorAll('.velo .finestra .dest')].map(d => ({ nome: d.dataset.destinatario, a: (d.querySelector('input[type=email]') || {}).value, testo: d.innerText }))");
    assert.deepEqual(schede.map(s => s.nome), ['Rossi Impianti Srl', LUNGO], 'una scheda per destinatario, nell\'ordine dei lavori');
    assert.equal(schede[0].a, 'rossi@example.com', 'l\'email di Rossi già scritta');
    assert.equal(schede[1].a, '', 'il cliente nuovo non ha l\'email');
    const oggetto = 'Rapportino ' + ID + ' del ' + suoi[0].data.split('-').reverse().join('/');
    assert.ok(schede.every(s => s.testo.indexOf(oggetto) >= 0), 'l\'oggetto di un rapportino solo: ' + oggetto);
    assert.match(schede[0].testo, /Rapportino .* · 2 lavori/);
    assert.match(schede[1].testo, /Rapportino .* · 1 lavoro/);
    assert.equal(await valuta("document.querySelectorAll('.velo .finestra .btn.giallo').length"), 1, 'un solo giallo');
    await sta('l\'invio');
    await foto('invio');
    // Senza l'indirizzo del secondo non parte niente.
    await clicca('Invia 2 email', finestra, 900);
    assert.match(await testoFinestra(), /Manca l'indirizzo/);
    assert.ok((await server('rapportini')).rapportini.filter(r => r.idGiornata === ID).every(r => r.stato === 'BOZZA'), 'non è partito niente');
    passo('Invio: 2 schede (Rossi con l\'email, ' + GIRO + ' senza), oggetto "' + oggetto + '"; senza indirizzo non parte niente');
    await valuta(`(() => { const i = [...document.querySelectorAll('.velo .finestra .dest')][1].querySelector('input[type=email]'); i.value = ${JSON.stringify(EMAIL_LUNGO)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await aspetta(300);
    await guardaAvvisi();
    await clicca('Invia 2 email', finestra, 6000);
    for (let i = 0; i < 30 && (await valuta("!!document.querySelector('.velo .finestra .dest')")); i++) await aspetta(500);
    assert.match(await testoAvvisi(), /2 email mandate/);
    const dopo = (await server('rapportini')).rapportini.filter(r => r.idGiornata === ID);
    assert.deepEqual(dopo.map(r => r.stato), ['INVIATO', 'INVIATO', 'INVIATO'], 'i 3 lavori inviati');
    if (POSTA) {
      const nuove = fs.readdirSync(POSTA).map(d => path.join(POSTA, d)).filter(d => fs.statSync(d).mtimeMs >= inizio)
        .map(d => ({ testo: fs.readFileSync(path.join(d, 'email.txt'), 'utf8'), file: fs.readdirSync(d) }));
      const aRossi = nuove.find(e => /^A: rossi@example\.com/m.test(e.testo));
      const aLungo = nuove.find(e => e.testo.indexOf('A: ' + EMAIL_LUNGO) >= 0);
      assert.ok(aRossi && aLungo, 'due email: ' + nuove.map(e => e.testo.split('\n')[0]).join(', '));
      assert.match(aRossi.testo, new RegExp('Oggetto: ' + oggetto.replace(/\//g, '\\/')));
      assert.ok(aRossi.file.some(f => /\.pdf$/.test(f)) && aLungo.file.some(f => /\.pdf$/.test(f)), 'ognuna col suo PDF');
      passo('posta finta: 2 email (rossi@example.com e ' + EMAIL_LUNGO + '), ognuna col suo PDF');
    }
    testo = await testoPannello();
    assert.match(testo, /3 inviati/);
    assert.equal(await valuta("document.querySelectorAll('.pannello .btn.giallo').length"), 0, 'niente più giallo');
    passo('Invia 2 email: i 3 lavori sono Inviati, il pannello lo dice, niente più giallo');

    // ------------------------------------------------------------- modifica: i lavori inviati non si cambiano
    await clicca('Modifica', '.pannello', 1000);
    testo = await testoFinestra();
    assert.match(testo, /Già inviato al cliente: non si cambia/);
    assert.ok(!(await valuta("[...document.querySelectorAll('.velo .finestra button')].some(b => b.textContent.trim() === 'Togli questo lavoro')")), 'un lavoro inviato non si toglie');
    assert.ok(!(await valuta("[...document.querySelectorAll('.velo .finestra button')].some(b => b.textContent.trim() === 'Cambia' && b.closest('.data-rap'))")), 'la data non si cambia');
    await clicca('Annulla', '.velo .finestra .piede-f', 500);
    passo('Modifica: i lavori inviati si vedono e non si cambiano (né la data, né Togli)');

    // ------------------------------------------------------------- modifica di un rapportino Da inviare: un lavoro in più, poi tolto
    const [V1, V2] = VECCHI;
    const meseLista = async valore => {
      await valuta(`(() => { const s = document.querySelector('#principale .filtri select'); s.value = ${JSON.stringify(valore)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await aspetta(700);
    };
    await valuta(`document.querySelector('.pannello [aria-label="Chiudi"]').click(); true`);
    await aspetta(400);
    await clicca('Da inviare', '#principale .filtri', 900);
    await meseLista('');
    await valuta(`document.querySelector('.tab .r.rap[data-giornata="${V1}"]').click(); true`);
    await aspetta(700);
    await clicca('Modifica', '.pannello', 1000);
    testo = await testoFinestra();
    assert.match(testo, new RegExp('Rapportino ' + V1.replace(/\//g, '\\/')), 'si apre il rapportino di 10 giorni fa');
    assert.match(testo, /Verifica delle protezioni del quadro/);
    await clicca('Aggiungi un lavoro', finestra, 600);
    assert.match(await testoFinestra(), /Lavoro 2 di 2/);
    await scegliCliente('Rossi Impianti Srl');
    await pillola('26ST002');
    await pillola('4 h');
    await scrivi('Cosa hai fatto', 'Prova delle protezioni differenziali.');
    await tariffa('45');
    await guardaAvvisi();
    await clicca('Salva rapportino', finestra, 1800);
    assert.match(await testoAvvisi(), new RegExp('Salvato: ' + V1.replace(/\//g, '\\/') + ' · 2 lavori'));
    let delV1 = (await server('rapportini')).rapportini.filter(r => r.idGiornata === V1).sort((a, b) => a.posizione - b.posizione);
    assert.deepEqual(delV1.map(r => [r.posizione, r.cliente, r.stato, String(r.data).slice(0, 10)]),
      [[1, LUNGO, 'BOZZA', giorniFa(10)], [2, 'Rossi Impianti Srl', 'BOZZA', giorniFa(10)]], 'il lavoro in più, con la data del rapportino');
    const aggiunto = delV1[1].id;
    passo('Modifica di ' + V1 + ' (Da inviare): un lavoro in più per Rossi, salvato con la data del rapportino (' + aggiunto + ')');
    // Di nuovo Modifica: si toglie il lavoro 2 (l'avviso ha Annulla), si salva: il server lo segna ANNULLATO.
    await clicca('Modifica', '.pannello', 1000);
    await valuta("document.querySelector('.velo .finestra .card-lavoro[data-lavoro=\"2\"]').click(); true");
    await aspetta(400);
    await guardaAvvisi();
    await clicca('Togli questo lavoro', finestra, 600);
    assert.match(await testoAvvisi(), /Lavoro 2 tolto: sparisce quando salvi/);
    assert.equal(await valuta("document.querySelectorAll('.velo .finestra .card-lavoro').length"), 1, 'resta un lavoro');
    await clicca('Salva rapportino', finestra, 1800);
    delV1 = (await server('rapportini')).rapportini.filter(r => r.idGiornata === V1);
    const vivi = delV1.filter(r => r.stato !== 'ANNULLATO');
    assert.deepEqual(vivi.map(r => r.cliente), [LUNGO], 'resta solo il lavoro di prima');
    const tolto = delV1.find(r => r.id === aggiunto);
    assert.ok(!tolto || tolto.stato === 'ANNULLATO', 'il lavoro tolto è annullato: ' + JSON.stringify(tolto && tolto.stato));
    assert.ok(!(await valuta(`!!document.querySelector('.tab .r.lavoro[data-chiave="${aggiunto}"]')`)), 'e sparisce dall\'elenco');
    passo('Togli questo lavoro + Salva: ' + aggiunto + ' ' + (tolto ? 'ANNULLATO' : 'tolto') + ', in ' + V1 + ' resta il lavoro di prima');

    // ------------------------------------------------------------- due rapportini di un cliente: un'email col riepilogo
    await valuta(`document.querySelector('.pannello [aria-label="Chiudi"]').click(); true`);
    await aspetta(400);
    for (const id of VECCHI) { await valuta(`document.querySelector('.tab .r.rap[data-giornata="${id}"] input').click(); true`); await aspetta(300); }
    assert.match(await valuta("document.querySelector('.barra-scelti').innerText"), /2 lavori scelti[\s\S]*1 cliente/);
    await clicca('Da inviare', '.barra-scelti', 1200);
    testo = await testoFinestra();
    assert.match(testo, /Invio rapportini/, 'due rapportini: Invio rapportini');
    const RI = require(path.join(__dirname, '..', 'ui', 'regole-invio.js'));
    const p2 = RI.periodoInvio([giorniFa(10), giorniFa(9)]);
    const scheda2 = await valuta("[...document.querySelectorAll('.velo .finestra .dest')].map(d => ({ nome: d.dataset.destinatario, a: (d.querySelector('input[type=email]') || {}).value, oggetto: ((d.querySelector('.oggetto-dest .tenue') || {}).textContent || ''), testo: d.innerText }))");
    assert.deepEqual(scheda2.map(s => s.nome), [LUNGO], 'una scheda sola');
    assert.equal(scheda2[0].oggetto, p2.oggetto + ' · ' + LUNGO, 'oggetto dai casi di casi-invio.json');
    assert.match(scheda2[0].testo, /Riepilogo .* · 2 lavori/, 'parte il riepilogo');
    assert.match(testo, /Invia l'email/);
    // L'anteprima: una riga per lavoro, niente lavori di Rossi.
    const righeAnteprima = await valuta("[...document.querySelectorAll('.velo .finestra .foglio-a4 .riga-a4')].map(x => x.textContent)");
    assert.equal(righeAnteprima.length, 2, 'due righe nell\'anteprima: ' + righeAnteprima.join(' | '));
    if (!scheda2[0].a) await valuta(`(() => { const i = document.querySelector('.velo .finestra .dest input[type=email]'); i.value = ${JSON.stringify(EMAIL_LUNGO)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    // Il PDF che parte: si guarda l'HTML che va al finto ponte, senza fermarlo.
    await valuta(`(() => { window.__pdfVisti = []; if (window.__spiaPdf) return true; window.__spiaPdf = true; const vero = window.fetch;
      window.fetch = (u, o) => { if (String(u).indexOf('/locale/pdf') >= 0) { try { window.__pdfVisti.push(JSON.parse(o.body).html); } catch (e) { /* niente */ } } return vero(u, o); }; return true; })()`);
    const inizio2 = Date.now();
    await guardaAvvisi();
    await clicca('Invia l\'email', finestra, 4000);
    for (let i = 0; i < 30 && (await valuta("!!document.querySelector('.velo .finestra .dest')")); i++) await aspetta(500);
    assert.match(await testoAvvisi(), /Email mandata a /);
    const statiV = (await server('rapportini')).rapportini.filter(r => VECCHI.indexOf(r.idGiornata) >= 0 && r.stato !== 'ANNULLATO').map(r => r.stato);
    assert.deepEqual(statiV, ['INVIATO', 'INVIATO'], 'i 2 lavori inviati');
    const htmlRiep = (await valuta('window.__pdfVisti || []')).pop() || '';
    assert.ok(htmlRiep.indexOf(V1) > 0 && htmlRiep.indexOf(V2) > 0, 'il riepilogo ha il N° dei due rapportini');
    assert.ok(htmlRiep.indexOf('Rossi Impianti') < 0 && htmlRiep.indexOf('Prova delle protezioni differenziali') < 0, 'niente del lavoro tolto né di altri clienti');
    assert.ok(htmlRiep.indexOf('Verifica delle protezioni del quadro') > 0 && htmlRiep.indexOf('Taratura dei relè termici') > 0, 'una riga per lavoro');
    assert.ok(!/Firma per accettazione/.test(htmlRiep), 'niente firma del cliente');
    let extra = '';
    if (POSTA) {
      const nuove = fs.readdirSync(POSTA).map(d => path.join(POSTA, d)).filter(d => fs.statSync(d).mtimeMs >= inizio2)
        .map(d => ({ testo: fs.readFileSync(path.join(d, 'email.txt'), 'utf8'), file: fs.readdirSync(d) }));
      assert.equal(nuove.length, 1, 'una email sola');
      assert.ok(nuove[0].testo.indexOf('A: ' + EMAIL_LUNGO) >= 0, 'al cliente nuovo');
      assert.ok(nuove[0].testo.indexOf('Oggetto: ' + p2.oggetto + ' · ' + LUNGO) >= 0, 'l\'oggetto: ' + nuove[0].testo.split('\n').slice(0, 4).join(' / '));
      assert.ok(nuove[0].testo.indexOf('in allegato ' + p2.frase + '.') >= 0, 'la frase: ' + p2.frase);
      assert.ok(nuove[0].file.some(f => /^Riepilogo.*\.pdf$/.test(f)), 'col riepilogo in PDF: ' + nuove[0].file.join(', '));
      extra = ', posta finta: 1 email con "in allegato ' + p2.frase + '"';
    }
    passo('2 rapportini dello stesso cliente: 1 scheda, oggetto "' + p2.oggetto + ' · …", riepilogo con una riga per lavoro (N° ' + V1 + ', ' + V2 + ')' + extra);
    await meseLista(new Date().toISOString().slice(0, 7));

    // ------------------------------------------------------------- la schermata scura
    await valuta(`(document.querySelector('.pannello [aria-label="Chiudi"]') || { click() {} }).click(); true`);
    await aspetta(400);
    await clicca('Tutti', '#principale .filtri', 900);
    await foto('elenco-scuro', true);

    if (tab.errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + tab.errori.join('\n'));
    console.log('TUTTO BENE (' + passi + ' passi)');
  } finally {
    if (tab) tab.ws.close();
    await chiudiEdgeCdp(porta, edge);
    await aspetta(500);
    await require('./edge-prova.js').togliCartella(profilo); // Edge a volte tiene un file un attimo: riprova per qualche secondo
    // I PDF stampati da questo giro (cartella delle stampe del finto ponte).
    try { fs.readdirSync(STAMPE).forEach(f => { const p = path.join(STAMPE, f); if (fs.statSync(p).mtimeMs >= inizio) fs.unlinkSync(p); }); } catch (e) { /* niente stampe */ }
  }
}

main().catch(e => { console.error('NO: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
