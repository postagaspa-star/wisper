// I flussi della fase 3 (ore, timer, approvazioni, spese, trasferte, rimborsi) fatti con
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

const C = require('../ui/conti.js');
global.WisperConti = C;
const RO = require('../ui/regole-ore-spese.js');

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
  const porta = 9450 + Math.floor(Math.random() * 150);
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
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      await aspetta(2500);
    };
    const sett = RO.settimanaDi(C.oggiIso());
    const oreDellaSettimana = () => server('ore?da=' + sett[0] + '&a=' + sett[6]);
    // Un elemento cliccabile che contiene un testo (le righe della Dashboard cominciano col numero).
    const cliccaCon = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = document.querySelector(${JSON.stringify(dove)});
        const b = radice && [...radice.querySelectorAll('button, [role=button]')].find(x => x.textContent.toLowerCase().indexOf(${JSON.stringify(testo.toLowerCase())}) >= 0);
        if (!b) return 'non trovo';
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
    assert.deepEqual(vociMarco.slice(-2), ['Ore e rapportini', 'Spese e trasferte'], 'Spese e trasferte dopo Ore e rapportini');
    passo('menu: Spese e trasferte al suo posto, dopo Ore e rapportini');
    // Un rapportino di Marco: nasce da approvare (il titolare lo guarda più avanti).
    const rapMarco = (await server('salvaRapportino', { rapportino: { idLocale: 'fase3-marco-' + GIRO, data: C.oggiIso(), idCliente: 'C002', idCommessa: '26ST002',
      descrizione: 'Rapportino da approvare ' + GIRO, oreLavoro: 1, oreExtra: 0, oreViaggio: 0, km: 0, spese: 0 } })).rapportino;
    assert.equal(rapMarco.statoApprovazione, 'da_approvare', 'il rapportino del collaboratore va approvato');

    // ------------------------------------------------------------ timer: ferma -> la bozza
    await vai('#rapportini/ore');
    const segmentiMarco = await valuta("[...document.querySelectorAll('.segmenti button')].map(b => b.textContent)");
    assert.ok(!segmentiMarco.some(s => /Da approvare/.test(s)), 'il collaboratore non vede Da approvare');
    assert.equal(await valuta("!!document.querySelector('select[aria-label=\"Di chi\"]')"), false, 'niente scelta della persona');
    if ((await server('timer')).timer) {
      // Quello acceso dai dati di prova (da stanotte): Ferma apre la bozza da correggere.
      await clicca('26ST', '.zona-timer', 1500);
      assert.match(await testoFinestra(), /Le ore dal timer/);
      // Fermato nello stesso minuto in cui era partito (un giro di prima rimasto acceso): fine vuota, si scrivono le ore.
      if (await valuta("!!document.querySelector('.finestra .anteprima-ore.errore')")) { await clicca('Ore', '.finestra', 300); await clicca('1 h', '.finestra', 300); }
      await scrivi('Cosa hai fatto', 'Dal timer di prova ' + GIRO);
      await clicca('Salva', '.finestra .piede-f', 1500);
      const r = (await oreDellaSettimana()).ore.find(o => o.descrizione === 'Dal timer di prova ' + GIRO);
      assert.ok(r && r.dalTimer && r.stato === 'da_approvare', 'la bozza del timer corretta e mandata');
    }
    await clicca('Avvia il timer', '.zona-timer', 700);
    await clicca('26ST001', '.finestra', 300);
    await scrivi('Cosa fai', 'Timer ' + GIRO);
    await clicca('Avvia', '.finestra .piede-f', 1200);
    const acceso = await server('timer');
    assert.ok(acceso.timer && acceso.timer.idCommessa === '26ST001', 'il timer è acceso sul server');
    assert.match(await valuta("document.querySelector('.zona-timer').innerText"), /26ST001 ·\s*\d\d:\d\d:\d\d\s*· Ferma/);
    await foto('timer-acceso');
    await clicca('26ST001', '.zona-timer', 1500);
    assert.equal((await server('timer')).timer, null, 'fermato');
    assert.match(await testoFinestra(), /Le ore dal timer/);
    const bozza = (await oreDellaSettimana()).ore.find(o => o.dalTimer && o.descrizione === 'Timer ' + GIRO);
    assert.ok(bozza && bozza.stato === 'bozza', 'fermarlo crea la riga in bozza');
    // La bozza si corregge: le ore a mano, un'ora, e si manda.
    await clicca('Ore', '.finestra', 300);
    await clicca('1 h', '.finestra', 300);
    await clicca('Salva', '.finestra .piede-f', 1500);
    const corretta = (await oreDellaSettimana()).ore.find(o => o.id === bozza.id);
    assert.equal(corretta.ore, 1);
    assert.equal(corretta.inizio, '', 'passata alle ore scritte a mano');
    assert.equal(corretta.stato, 'da_approvare');
    passo('timer: Avvia con la commessa, il tempo che scorre, Ferma -> la bozza, corretta e mandata');

    // ------------------------------------------------------------ registra ore (inizio, fine, pausa)
    await clicca('Registra ore', null, 700);
    await clicca('26ST002', '.finestra', 300);
    await clicca('Inizio e fine', '.finestra', 300);
    await scrivi('Inizio', '8.00');
    await scrivi('Fine', '12:30');
    await scrivi('Pausa', '15');
    assert.match(await valuta("document.querySelector('.finestra .anteprima-ore').innerText"), /4,25 h/, 'le ore calcolate subito, come il server');
    await scrivi('Cosa hai fatto', 'Registrate ' + GIRO);
    await clicca('Salva', '.finestra .piede-f', 1500);
    const registrata = (await oreDellaSettimana()).ore.find(o => o.descrizione === 'Registrate ' + GIRO);
    assert.ok(registrata, 'salvata sul server');
    assert.deepEqual([registrata.inizio, registrata.fine, registrata.pausaMinuti, registrata.ore, registrata.idCommessa, registrata.stato], ['08:00', '12:30', 15, 4.25, '26ST002', 'da_approvare']);
    passo('registra ore: 8.00-12:30 con 15 minuti di pausa = 4,25 h, da approvare');

    // ------------------------------------------------------------ una cella del timesheet
    const cella = await valuta(`(() => { const i = [...document.querySelectorAll('input.cella-ore')].find(x => x.dataset.cella.indexOf('26ST002|') === 0 && !x.value); return i ? i.dataset.cella : ''; })()`);
    assert.ok(cella, 'una cella vuota di 26ST002 da scrivere');
    await valuta(`(() => { const i = document.querySelector('[data-cella="${cella}"]'); i.value = '2,5'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await aspetta(1500);
    const daCella = (await oreDellaSettimana()).ore.filter(o => o.data === cella.split('|')[1] && o.idCommessa === '26ST002');
    assert.equal(daCella.length, 1, 'nasce una riga sola');
    assert.equal(daCella[0].ore, 2.5);
    assert.match(await testoAvvisi(), /Ore salvate/);
    // La stessa cella a 3: cambia quella riga (la descrizione resta), non ne nasce un'altra.
    await server('salvaOre', { riga: { id: daCella[0].id, descrizione: 'Descrizione da tenere ' + GIRO } });
    await vai('#rapportini/elenco');
    await vai('#rapportini/ore');
    await valuta(`(() => { const i = document.querySelector('[data-cella="${cella}"]'); i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await aspetta(1500);
    const cambiata = (await oreDellaSettimana()).ore.filter(o => o.data === cella.split('|')[1] && o.idCommessa === '26ST002');
    assert.equal(cambiata.length, 1);
    assert.equal(cambiata[0].ore, 3);
    assert.equal(cambiata[0].descrizione, 'Descrizione da tenere ' + GIRO, 'la descrizione non si perde');
    // Una cella con inizio e fine non si scrive: si apre il giorno.
    const conOrari = await valuta(`(() => { const b = document.querySelector('button.cella-ore.apri[data-cella="26ST002|${registrata.data}"]'); return b ? b.dataset.cella : ''; })()`);
    assert.ok(conOrari, 'la cella delle ore con inizio e fine è un pulsante');
    await valuta(`document.querySelector('[data-cella="${conOrari}"]').click(); true`);
    await aspetta(500);
    assert.match(await testoFinestra(), /Registrate /);
    await valuta("document.querySelectorAll('.velo').forEach(v => v.remove()); true");
    await foto('timesheet');
    passo('timesheet: la cella vuota crea la riga, quella con una riga cambia solo le ore, quella con inizio e fine apre il giorno');

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
    const sueOre = (await oreDellaSettimana()).ore;
    assert.ok(sueOre.length && sueOre.every(o => o.idUtente === 3), 'solo le sue ore');
    const sueSpese = (await server('spese')).spese;
    assert.ok(sueSpese.every(s => s.idUtente === 3), 'solo le sue spese');
    assert.ok(sueSpese.every(s => typeof s.importo === 'number'), 'gli importi delle sue spese li vede');
    assert.equal((await server('daApprovare')).permesso, false, 'non approva');
    await vai('#rapportini/approvare');
    assert.match(await valuta("document.querySelector('h1').textContent"), /La settimana/, 'Da approvare non c\'è: torna alle ore');
    await vai('#rapportini/statistiche');
    assert.ok(!/Costo/.test(await testoPagina()), 'niente costi nelle statistiche');
    passo('collaboratore: solo le sue ore e spese (con gli importi), niente Da approvare, niente costi');

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
    await vai('#dashboard');
    await cliccaCon('da approvare', '.dash-corpo', 1500);
    assert.match(await valuta("document.querySelector('h1').textContent"), /Da approvare/);
    await foto('da-approvare');

    // ------------------------------------------------------------ approva con Annulla
    await clicca('Togli la selezione', null, 300);
    await clicca('Ore · 26ST002 · Registrate ' + GIRO, '.sezione', 300);
    await clicca('Approva (1)', null, 1500);
    let o = (await server('ore?da=' + sett[0] + '&a=' + sett[6] + '&utente=3')).ore.find(x => x.id === registrata.id);
    assert.equal(o.stato, 'approvata');
    assert.match(await testoAvvisi(), /1 approvata/);
    await annullaUltimo();
    o = (await server('ore?da=' + sett[0] + '&a=' + sett[6] + '&utente=3')).ore.find(x => x.id === registrata.id);
    assert.equal(o.stato, 'da_approvare', 'Annulla la rimette da approvare');
    passo('approvazioni: Approva (1) e poi Annulla, che la rimette da approvare');

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
    await vai('#rapportini/ore');
    await clicca('Esporta per Excel', null, 1500);
    assert.match(await testoAvvisi(), /Salvato in /);
    await vai('#amministrazione/veicoli');
    assert.match(await testoPagina(), /0,76 €\/km/);
    passo('esportazione delle ore per Excel; Amministrazione › Veicoli e rimborso km');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('TUTTO BENE (' + passi + ' passi)');
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge a volte tiene un file un attimo */ }
  }
}

main().catch(e => { console.error('NON VA: ' + (e && e.stack || e)); process.exit(1); });
