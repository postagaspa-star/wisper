// I flussi della fase 3 (approvazioni, spese, trasferte, rimborsi; dal 07/11/2026 niente più Ore né timer) fatti con
// l'interfaccia vera, cliccando come una persona, contro il server di prova; dopo ogni
// passo si controlla col server che sia successo davvero. Edge senza finestra, profilo
// temporaneo (mai il browser di chi lavora).
//
//   node server/src/avvio.js --prova --porta 8441 --dati <cartella temporanea>
//   node pc/prove/finto-ponte.js 8797 --server http://localhost:8441
//   node pc/prove/prova-flussi-fase3.js --porta 8797 [--uscita <schermate>]
//
// Il server di prova tiene i dati finché resta acceso: ogni giro usa nomi nuovi.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { portaDevtools, chiudiEdge } = require('./edge-prova.js');

const C = require('../ui/conti.js');
global.WisperConti = C;


const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8797));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const GIRO = Date.now().toString(36).slice(-4).toUpperCase();

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi3-'));
  const porta = portaDevtools(9450, 150);
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
      fs.writeFileSync(path.join(USCITA, 'flusso3-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    // Un pulsante dal suo testo (dentro "dove", di base tutta la pagina) e il clic.
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem], [role=checkbox]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const b = tutti.find(x => x.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(testo)}) || tutti.find(x => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(testo)}));
        if (!b) return 'non trovo il pulsante';
        if (b.disabled) return 'il pulsante è spento';
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "' + testo + '": ' + ok);
      await aspetta(attesa || 800);
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
      await aspetta(150);
    };
    const server = async (azione, corpo) => valuta(corpo
      ? `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`
      : `fetch('/server/${azione}').then(r => r.json())`);
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1300); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoAvvisi = () => valuta("document.querySelector('#avvisi').innerText");
    const testoFinestra = () => valuta("(document.querySelector('.velo:last-child .finestra') || {}).innerText || ''");
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    const entra = async email => {
      await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
      await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#dashboard' });
      await aspetta(1200);
      // Dal 02/11/2026 la pagina di accesso si apre sul codice per il telefono: si passa a email e password come una persona.
      for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      await aspetta(2500);
    };
    // Un elemento cliccabile che contiene un testo (le righe della Dashboard cominciano col numero).
    const cliccaCon = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = document.querySelector(${JSON.stringify(dove)});
        const b = radice && [...radice.querySelectorAll('button, [role=button]')].find(x => x.textContent.toLowerCase().indexOf(${JSON.stringify(testo.toLowerCase())}) >= 0);
        if (!b) return 'non trovo' + (radice ? ' in: ' + radice.innerText.slice(0, 400).replace(/\\s+/g, ' ') : ' ' + ${JSON.stringify(dove)});
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "…' + testo + '…": ' + ok);
      await aspetta(attesa || 800);
    };
    // L'Annulla dell'ultimo avviso (ce ne possono essere ancora di prima).
    const annullaUltimo = async () => {
      const ok = await valuta("(() => { const b = [...document.querySelectorAll('#avvisi .avviso button.azione')].pop(); if (!b) return false; b.click(); return true; })()");
      if (ok !== true) throw new Error('Nessun avviso con Annulla');
      await aspetta(1500);
    };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(300);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");

    // ============================================================ il collaboratore (Marco)
    await entra('marco@esempio.it');
    const vociMarco = await valuta("[...document.querySelectorAll('#voci .voce')].map(x => x.dataset.nome)");
    // 07/11/2026 (Manuel: "le Ore vanno tolte, non servono, metti solamente i Rapportini"): la voce è Rapportini.
    // Fase 5: dopo vengono Documenti e Ticket; Spese resta subito dopo Rapportini.
    assert.ok(vociMarco.indexOf('Ore e rapportini') < 0, 'niente più Ore e rapportini: ' + vociMarco.join(', '));
    assert.equal(vociMarco[vociMarco.indexOf('Rapportini') + 1], 'Spese', 'Spese dopo Rapportini: ' + vociMarco.join(', '));
    passo('menu: Rapportini (non più Ore e rapportini), Spese e trasferte subito dopo');
    // Un rapportino di Marco: nasce da approvare (il titolare lo guarda più avanti).
    const rapMarco = (await server('salvaRapportino', { rapportino: { idLocale: 'fase3-marco-' + GIRO, data: C.oggiIso(), idCliente: 'C002', idCommessa: '26ST002',
      descrizione: 'Rapportino da approvare ' + GIRO, oreLavoro: 1, oreExtra: 0, oreViaggio: 0, km: 0, spese: 0 } })).rapportino;
    assert.equal(rapMarco.statoApprovazione, 'da_approvare', 'il rapportino del collaboratore va approvato');

    // ------------------------------------------------------------ niente Ore: i collegamenti di prima aprono i Rapportini
    const paginaRapportini = async hash => {
      await vai(hash);
      return valuta(`({ h1: document.querySelector('#principale h1').textContent, dove: [...document.querySelectorAll('#principale .testata .dove')].map(x => x.textContent),
        segmenti: [...document.querySelectorAll('#principale .segmenti button')].map(b => b.textContent),
        ore: !!document.querySelector('.zona-timer, .timesheet, .cella-ore, .timer-scheda'),
        pulsanti: [...document.querySelectorAll('#principale button')].map(b => b.textContent.trim()).filter(x => /timer|Registra ore|Statistiche|^Ore$/.test(x)) })`);
    };
    for (const hash of ['#rapportini', '#rapportini/ore', '#rapportini/statistiche', '#rapportini/approvare']) {
      const x = await paginaRapportini(hash);
      assert.equal(x.h1, 'Rapportini', hash + ': si apre l\'elenco dei rapportini');
      assert.deepEqual(x.dove, [], hash + ': niente "Ore e rapportini" sopra il titolo');
      assert.deepEqual(x.segmenti.filter(s => !/^(Tutti|Da inviare|Da fatturare)$/.test(s)), [], hash + ': il collaboratore non ha né Ore né Da approvare');
      assert.equal(x.ore, false, hash + ': niente timer né settimana delle ore');
      assert.deepEqual(x.pulsanti, [], hash + ': niente pulsanti delle ore');
    }
    await vai('#dashboard');
    assert.equal(await valuta("!!document.querySelector('.timer-scheda')"), false, 'niente timer sulla Dashboard');
    assert.ok(!/timer/i.test(await testoPagina()), 'la Dashboard non parla del timer');
    // Il riquadro "ore della settimana" del collaboratore: col server di adesso porta al segmento "ore" di prima, col server
    // nuovo a { pagina: 'rapportini' }; tutti e due aprono i Rapportini, senza errori.
    let riquadroOre = false;
    if (await valuta("!!document.querySelector('[data-riquadro=\"oreSettimana\"]')")) {
      await valuta("document.querySelector('[data-riquadro=\"oreSettimana\"]').click(); true");
      await aspetta(1300);
      assert.equal(await valuta("document.querySelector('#principale h1').textContent"), 'Rapportini', 'il riquadro delle ore apre i Rapportini');
      riquadroOre = true;
    }
    passo('niente Ore: #rapportini, /ore, /statistiche e /approvare aprono i Rapportini, senza timer, settimana o Registra ore; Dashboard senza timer' + (riquadroOre ? '; il riquadro "ore della settimana" apre i Rapportini' : ''));

    // ------------------------------------------------------------ spesa con la foto, poi Allo studio
    await vai('#spese');
    await clicca('Nuova spesa', null, 700);
    await clicca('Trascina qui lo scontrino', '.finestra', 800);
    assert.equal(await valuta("!!document.querySelector('.finestra .foto-grande img')"), true, 'la foto si vede a sinistra');
    await scrivi('Importo', '12,40');
    await clicca('Parcheggio', '.finestra', 200);
    await scrivi('Commessa', '26ST001');
    assert.equal(await valuta("[...document.querySelectorAll('.finestra .segmenti button')].find(b => b.classList.contains('scelto')).textContent"), 'Al cliente', 'con la commessa va al cliente');
    await scrivi('Descrizione', 'Parcheggio ' + GIRO);
    await clicca('Salva', '.finestra .piede-f', 1800);
    let spesa = (await server('spese')).spese.find(s => s.descrizione === 'Parcheggio ' + GIRO);
    assert.ok(spesa, 'salvata');
    assert.deepEqual([spesa.importo, spesa.categoria, spesa.destinazione, spesa.pagataDaMe, spesa.stato, spesa.foto.length], [12.4, 'parcheggio', 'cliente', true, 'da_approvare', 1]);
    await vai('#spese');
    await clicca('Parcheggio ' + GIRO, '.scheda.righe', 700);
    await clicca('Allo studio', '.finestra', 200);
    await clicca('Salva', '.finestra .piede-f', 1500);
    spesa = (await server('spese')).spese.find(s => s.id === spesa.id);
    assert.equal(spesa.destinazione, 'studio', 'spostata allo studio');
    assert.equal(spesa.foto.length, 1, 'la foto resta');
    passo('spesa: la foto a sinistra, Al cliente con la commessa, poi spostata Allo studio');

    // ------------------------------------------------------------ trasferta col rimborso
    await clicca('Trasferte', '.filtri', 900);
    await clicca('Nuova trasferta', null, 900);
    await scrivi('Destinazione', 'Thiene ' + GIRO);
    await scrivi('Motivo', 'Sopralluogo');
    await scrivi('Km', '25');
    const conto = await valuta("document.querySelector('.finestra .conto-vivo').innerText");
    assert.match(conto, /50 km × 0,76 €/, 'andata e ritorno raddoppia i km');
    assert.match(conto, /38,00 €/, 'il rimborso si vede subito');
    await foto('trasferta');
    await clicca('Salva', '.finestra .piede-f', 1500);
    const tr = (await server('trasferte')).trasferte.find(t => t.destinazione === 'Thiene ' + GIRO);
    assert.ok(tr, 'salvata');
    assert.deepEqual([tr.kmTotali, tr.euroKm, tr.rimborsoKm, tr.totale, tr.stato], [50, 0.76, 38, 38, 'da_approvare']);
    passo('trasferta: 25 km andata e ritorno a 0,76 = 38,00 €, da approvare');

    // ------------------------------------------------------------ il collaboratore non vede gli altri
    const sueSpese = (await server('spese')).spese;
    assert.ok(sueSpese.every(s => s.idUtente === 3), 'solo le sue spese');
    assert.ok(sueSpese.every(s => typeof s.importo === 'number'), 'gli importi delle sue spese li vede');
    assert.equal((await server('daApprovare')).permesso, false, 'non approva');
    // #rapportini/approvare per lui apre i Rapportini (provato sopra, coi collegamenti delle ore).
    passo('collaboratore: solo le sue spese (con gli importi), niente Da approvare');

    // ============================================================ il titolare (Manuel)
    await entra('manuel@esempio.it');

    // ------------------------------------------------------------ il rapportino da approvare non si manda al cliente
    const daApprovare = (await server('rapportini')).rapportini.find(r => r.id === rapMarco.id && r.statoApprovazione === 'da_approvare');
    assert.ok(daApprovare, 'il titolare vede il rapportino da approvare');
    if (daApprovare) {
      await vai('#rapportini/elenco');
      await valuta("document.querySelector('select.scelta').value = ''; document.querySelector('select.scelta').dispatchEvent(new Event('change', { bubbles: true })); true");
      await aspetta(600);
      assert.match(await valuta(`document.querySelector('.tab .r[data-chiave="${daApprovare.id}"]').innerText`), /Da approvare/, 'la pillola nella riga');
      await valuta(`document.querySelector('.tab .r[data-chiave="${daApprovare.id}"]').click(); true`);
      await aspetta(600);
      const pannello = await valuta("document.querySelector('.pannello').innerText");
      assert.match(pannello, /Da approvare: si manda al cliente e si fattura dopo l'approvazione/);
      await valuta("document.querySelector('.pannello .piede button[aria-label=\"Altre azioni\"]').click(); true");
      await aspetta(300);
      const menu = await valuta("(document.querySelector('.menu') || {}).innerText || ''");
      assert.ok(!/Invia al cliente|Segna fatturato|Segna inviato/.test(menu), 'niente invio né fattura dal menu');
      await valuta("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true");
      await aspetta(300);
      passo('rapportino da approvare: la pillola, la frase nel pannello, niente invio al cliente');
    }

    // La Dashboard porta a Da approvare.
    await vai('#dashboard/tutto');
    // Fase 8 (§8.2): al massimo 7 urgenti. Con tante urgenze "N cose da approvare" finisce sotto "Altre N", cioè in
    // Tutto quello che c'è da fare; se è la cosa più urgente il pulsante dice "Apri Da approvare".
    const daApprovareDash = "[...document.querySelectorAll('#principale button')].find(b => /cos[ae] da approvare|Apri Da approvare/i.test(b.textContent))";
    assert.ok(await valuta('!!' + daApprovareDash), 'la voce delle cose da approvare');
    await valuta(daApprovareDash + '.click(); true');
    await aspetta(1500);
    // Fase 8 (§8.2 punto 5): "N cose da approvare" è una voce sola che apre il foglio con le tre righe.
    // La riga dice dove porta: "Rapportini › Da approvare" (il server di prima scrive ancora "Ore e rapportini › ...").
    if (await valuta("!!document.querySelector('.velo .finestra')")) await cliccaCon('rapportini › Da approvare', '.velo .finestra', 1500);
    assert.match(await valuta("document.querySelector('h1').textContent"), /Da approvare/);
    await foto('da-approvare');

    // ------------------------------------------------------------ approva con Annulla
    // 07/11/2026: niente righe di ore in Da approvare (il server di prima le manda ancora: il programma non le mostra).
    const vociApp = await valuta("[...document.querySelectorAll('.voce-app .t1')].map(x => x.textContent)");
    assert.ok(vociApp.length && !vociApp.some(x => /^Ore\b/.test(x)), 'niente righe di ore: ' + vociApp.join(' | '));
    await clicca('Togli la selezione', null, 300);
    await cliccaCon('Rapportino da approvare ' + GIRO, '#principale', 300);
    await clicca('Approva (1)', null, 1500);
    const statoRap = async () => ((await server('rapportini')).rapportini.find(r => r.id === rapMarco.id) || {}).statoApprovazione;
    assert.notEqual(await statoRap(), 'da_approvare', 'approvato');
    assert.match(await testoAvvisi(), /1 approvata/);
    await annullaUltimo();
    assert.equal(await statoRap(), 'da_approvare', 'Annulla lo rimette da approvare');
    passo('approvazioni: niente righe di ore; il rapportino di Marco con Approva (1) e poi Annulla, che lo rimette da approvare');

    // ------------------------------------------------------------ respingi senza motivo: no
    await vai('#rapportini/approvare');
    await clicca('Togli la selezione', null, 300);
    await clicca('Trasferta · Thiene ' + GIRO, '.sezione', 300);
    await clicca('Respingi', '.azioni-approva', 600);
    await clicca('Respingi (1)', '.finestra', 800);
    assert.match(await testoFinestra(), /Scrivi il motivo: arriva a chi l'ha scritta/, 'senza motivo non parte');
    assert.equal((await server('trasferte?utente=3')).trasferte.find(t => t.id === tr.id).stato, 'da_approvare');
    const senza = await server('respingi', { voci: [{ tipo: 'trasferta', id: tr.id }], motivo: '' });
    assert.equal(senza.ok, false, 'anche il server lo rifiuta');
    await scrivi('Motivo', 'Manca il motivo del sopralluogo ' + GIRO);
    await clicca('Respingi (1)', '.finestra', 1500);
    const respinta = (await server('trasferte?utente=3')).trasferte.find(t => t.id === tr.id);
    assert.equal(respinta.stato, 'respinta');
    assert.equal(respinta.motivoRifiuto, 'Manca il motivo del sopralluogo ' + GIRO);
    passo('approvazioni: Respingi senza motivo rifiutato (interfaccia e server), col motivo sì');

    // Le altre di questo giro si approvano tutte (Seleziona tutto: si parte con tutte scelte).
    await vai('#rapportini/approvare');
    const nVoci = await valuta("document.querySelectorAll('.voce-app').length");
    await clicca('Approva (' + nVoci + ')', null, 2000);
    assert.equal((await server('spese?utente=3')).spese.find(s => s.id === spesa.id).stato, 'approvata');
    passo('approvazioni: Approva (' + nVoci + ') con tutte scelte');

    // ------------------------------------------------------------ segna rimborsato (e Annulla)
    await vai('#spese');
    await clicca('Rimborsi', '.filtri', 1200);
    const prima = (await server('rimborsi')).persone.find(p => p.idUtente === 3);
    assert.ok(prima && prima.voci.some(v => v.tipo === 'spesa' && v.id === spesa.id), 'la spesa pagata da Marco è tra i rimborsi');
    await valuta(`(() => { const s = [...document.querySelectorAll('.scheda.rimborso')].find(x => /Marco/.test(x.querySelector('b').textContent)); s.querySelector('button').click(); return true; })()`);
    await aspetta(1500);
    assert.match(await testoAvvisi(), /Rimborsato a Marco/);
    const dopo = (await server('rimborsi')).persone.find(p => p.idUtente === 3);
    assert.ok(!dopo || !dopo.voci.length, 'niente più da rimborsare a Marco');
    assert.ok((await server('spese?utente=3')).spese.find(s => s.id === spesa.id).rimborsataIl, 'la spesa è segnata rimborsata');
    await annullaUltimo();
    assert.equal((await server('spese?utente=3')).spese.find(s => s.id === spesa.id).rimborsataIl, '', 'Annulla toglie il rimborsato');
    await valuta(`(() => { const s = [...document.querySelectorAll('.scheda.rimborso')].find(x => /Marco/.test(x.querySelector('b').textContent)); s.querySelector('button').click(); return true; })()`);
    await aspetta(1500);
    passo('rimborsi: Segna rimborsato per Marco, Annulla, e di nuovo');

    // ------------------------------------------------------------ la spesa di un rapportino spostata allo studio esce dal conto
    const rap = (await server('salvaRapportino', { rapportino: { idLocale: 'fase3-' + GIRO, data: C.oggiIso(), idCliente: 'C002', idCommessa: '26ST002', descrizione: 'Prova delle spese ' + GIRO,
      oreLavoro: 2, oreExtra: 0, oreViaggio: 0, km: 0, spese: 7.5, noteSpese: 'Pranzo ' + GIRO, tariffa: 42 } })).rapportino;
    assert.equal(rap.spese, 7.5);
    const totalePrima = rap.totale;
    await vai('#dashboard');
    await vai('#spese');
    await clicca('Spese', '.filtri', 1000);
    await clicca('Pranzo ' + GIRO, '.scheda.righe', 800);
    await clicca('Allo studio', '.finestra', 200);
    await clicca('Salva', '.finestra .piede-f', 1500);
    const rapDopo = (await server('rapportini')).rapportini.find(r => r.id === rap.id);
    assert.equal(rapDopo.spese, 0, 'la spesa esce dal conto del cliente');
    assert.equal(Math.round((totalePrima - rapDopo.totale) * 100) / 100, 7.5);
    passo('spesa del rapportino spostata Allo studio: esce dal conto (' + C.euro(totalePrima) + ' -> ' + C.euro(rapDopo.totale) + ')');

    // ------------------------------------------------------------ esportazione e veicoli
    await vai('#amministrazione/importa');
    const esporta = await testoPagina();
    assert.match(esporta, /Le spese di questo mese/);
    assert.ok(!/Le ore di questa settimana/.test(esporta), 'niente più l\'esportazione delle ore');
    await vai('#amministrazione/veicoli');
    assert.match(await testoPagina(), /0,76 €\/km/);
    passo('Esporta per Excel senza le ore; Amministrazione › Veicoli e rimborso km');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('TUTTO BENE (' + passi + ' passi)');
  } finally {
    if (ws) ws.close();
    await chiudiEdge(porta, edge);
    await aspetta(500);
    await require('./edge-prova.js').togliCartella(profilo); // Edge a volte tiene un file un attimo: riprova per qualche secondo
  }
}

main().catch(e => { console.error('NON VA: ' + (e && e.stack || e)); process.exit(1); });
