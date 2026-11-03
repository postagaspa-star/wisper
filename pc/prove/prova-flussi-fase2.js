// I flussi della fase 2 (preventivi, attività e calendario) fatti con l'interfaccia vera,
// cliccando come una persona, contro il server di prova; dopo ogni passo si controlla
// col server che sia successo davvero. Edge senza finestra, profilo temporaneo.
//
//   node server/src/avvio.js --prova --porta 8411 --dati <cartella temporanea>
//   node pc/prove/finto-ponte.js 8796 --server http://localhost:8411
//   node pc/prove/prova-flussi-fase2.js --porta 8796 [--uscita <schermate>]
//
// Il server di prova tiene i dati finché resta acceso: ogni giro usa nomi nuovi.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const C = require('../ui/conti.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8796));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const STAMPE = path.join(__dirname, 'stampe');
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const GIRO = Date.now().toString(36).slice(-4).toUpperCase();
const OGGETTO = 'Quadro di automazione ' + GIRO;

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi2-'));
  const porta = 9650 + Math.floor(Math.random() * 150);
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
      fs.writeFileSync(path.join(USCITA, 'flusso2-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    // Un pulsante dal suo testo (dentro "dove", di base tutta la pagina) e il clic.
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
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
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1200); };
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

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(300);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");
    await entra('manuel@esempio.it');
    assert.match(await valuta("document.querySelector('h1').textContent"), /Manuel/);
    const voci = await valuta("[...document.querySelectorAll('#voci .voce')].map(x => x.dataset.nome)");
    // Dal 03/11/2026 (progetti.md §4) Commesse e Progetti sono due voci.
    assert.deepEqual(voci.slice(0, 6), ['Dashboard', 'Clienti e fornitori', 'Commesse', 'Progetti', 'Preventivi e contratti', 'Attività e calendario']);
    passo('menu: Preventivi e contratti e Attività e calendario al loro posto');

    // ------------------------------------------------------------ preventivo nuovo, dal listino
    await vai('#preventivi');
    await clicca('Nuovo preventivo');
    assert.match(await testoPagina(), /Nuovo preventivo/);
    await scrivi('Cliente', 'C002', '.griglia-editor');
    await scrivi('Oggetto', OGGETTO, '.griglia-editor');
    await clicca('Media', '.griglia-editor', 300);
    // Dal listino: Sopralluogo e Direzione lavori.
    await clicca('Dal listino', '.griglia-editor', 400);
    await clicca('Sopralluogo e rilievo', '.listino-menu', 500);
    await clicca('Dal listino', '.griglia-editor', 400);
    await clicca('Direzione lavori', '.listino-menu', 500);
    // La direzione lavori a ore: 10 ore a 45 € (nel listino di prova non ha prezzo, lo si scrive).
    await valuta(`(() => {
      const v = [...document.querySelectorAll('.voce-editor')].find(x => x.querySelector('.desc-voce').value === 'Direzione lavori');
      const metti = (et, val) => { const c = [...v.querySelectorAll('.campo')].find(x => x.querySelector('label').textContent.trim() === et); const i = c.querySelector('input, select'); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); };
      metti('Quantità', '10'); metti('Prezzo all\\'ora', '45');
      return true; })()`);
    await aspetta(300);
    // Una voce libera, facoltativa.
    await clicca('Voce libera', '.griglia-editor', 400);
    await valuta(`(() => {
      const v = [...document.querySelectorAll('.voce-editor')].pop();
      const d = v.querySelector('.desc-voce'); d.value = 'Collaudo con strumenti'; d.dispatchEvent(new Event('input', { bubbles: true }));
      const c = [...v.querySelectorAll('.campo')].find(x => x.querySelector('label').textContent.trim() === 'Prezzo'); const i = c.querySelector('input'); i.value = '380'; i.dispatchEvent(new Event('input', { bubbles: true }));
      const f = [...v.querySelectorAll('label')].find(x => x.textContent.trim() === 'Facoltativa').querySelector('input'); f.click();
      return true; })()`);
    await aspetta(400);
    await scrivi('Oneri ipotizzabili dal conferimento alla conclusione', 'Pratiche in Comune a carico del cliente', '.griglia-editor');
    const anteprima = await valuta("document.querySelector('.conto-prev .tot .numero-grande').textContent");
    await foto('editor');
    await clicca('Salva', '.bottoni-editor', 1500);
    const id = await valuta("decodeURIComponent(location.hash.split('/')[1])");
    const p = (await server('preventivo?id=' + id)).preventivo;
    assert.equal(p.oggetto, OGGETTO);
    assert.equal(p.stato, 'BOZZA');
    assert.equal(p.complessita, 'media');
    assert.equal(p.sezioni[0].voci.length, 3);
    // Sopralluogo 350 (prezzo del listino) + 10 ore × 45; la facoltativa non conta.
    assert.equal(p.conti.sommaVoci, 350 + 450);
    assert.equal(C.euro(p.conti.totale), anteprima, 'l\'anteprima dell\'editor dà lo stesso totale del server');
    assert.equal(C.contiPreventivo(p).totale, p.conti.totale, 'conti.js sul preventivo del server dà lo stesso conto');
    passo('preventivo nuovo dal listino: ' + p.etichetta + ', anteprima ' + anteprima + ' = server');

    // ------------------------------------------------------------ invio col PDF, accettazione, commessa
    await clicca('Invia al cliente');
    let f = await testoFinestra();
    if (/Manca qualcosa/.test(f)) { await clicca('Mandalo lo stesso', '.velo:last-child', 600); f = await testoFinestra(); }
    assert.match(f, /Invia per email|Preventivo/);
    await valuta(`(() => { const i = document.querySelector('.riepilogo-f input[type=email]'); if (!i.value) { i.value = 'rossi@esempio.com'; i.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
    await foto('invio');
    await clicca('Invia per email', '.riepilogo-f', 6000);
    // Il PDF lo fa Edge e a volte ci mette più dei 6 secondi: si aspetta che il server lo segni inviato, fino a 30.
    let inviato = (await server('preventivo?id=' + id)).preventivo;
    for (let i = 0; i < 24 && inviato.stato !== 'INVIATO'; i++) { await aspetta(1000); inviato = (await server('preventivo?id=' + id)).preventivo; }
    assert.equal(inviato.stato, 'INVIATO', 'il server lo segna inviato: ' + (await testoAvvisi()));
    passo('invio: PDF fatto da Edge, email al postino finto, preventivo INVIATO');

    await clicca('Segna accettato');
    await clicca('Ha risposto per email', '.finestra', 300);
    await scrivi('Nome di chi accetta', 'Andrea Rossi');
    // Il cliente vuole anche la facoltativa: il totale si aggiorna.
    const prima = await valuta("document.querySelector('.totale-accetta .numero-grande').textContent");
    await clicca('Collaudo con strumenti', '.finestra', 300);
    const dopo = await valuta("document.querySelector('.totale-accetta .numero-grande').textContent");
    assert.notEqual(prima, dopo, 'il totale si aggiorna con le scelte');
    await foto('accetta');
    await clicca('Segna accettato', '.finestra .piede-f', 1500);
    const accettato = (await server('preventivo?id=' + id)).preventivo;
    assert.equal(accettato.stato, 'ACCETTATO');
    assert.equal(accettato.accettatoDa, 'Andrea Rossi');
    assert.equal(accettato.conti.sommaVoci, 350 + 450 + 380, 'con la facoltativa scelta');
    assert.equal(C.euro(accettato.conti.totale), dopo, 'il totale della finestra = quello del server dopo le scelte');
    passo('accettazione per email con la facoltativa scelta: ' + dopo);

    await clicca('Crea la commessa');
    assert.match(await testoFinestra(), /Collaudo con strumenti/);
    await clicca('Crea la commessa', '.finestra .piede-f', 2000);
    const conCommessa = (await server('preventivo?id=' + id)).preventivo;
    assert.ok(conCommessa.idCommessa, 'il preventivo ha la sua commessa');
    assert.match(await valuta('location.hash'), new RegExp('#commesse/' + conCommessa.idCommessa));
    const ana = await server('anagrafiche');
    const prest = ana.prestazioni.filter(x => x.idCommessa === conCommessa.idCommessa);
    assert.equal(prest.length, 3);
    assert.equal(Math.round(prest.reduce((a, x) => a + x.valore, 0) * 100) / 100, accettato.conti.imponibile);
    const ancora = await server('creaCommessaDaPreventivo', { id });
    assert.equal(ancora.ok, false, 'una volta sola');
    passo('crea la commessa ' + conCommessa.idCommessa + ' con ' + prest.length + ' prestazioni; la seconda volta no');

    // ------------------------------------------------------------ revisione di un inviato
    const elenco = (await server('preventivi')).preventivi;
    const daRivedere = elenco.find(x => x.stato === 'INVIATO' && x.id !== id);
    await vai('#preventivi/' + daRivedere.id);
    await valuta("document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Nuova revisione', '.menu', 500);
    await clicca('Nuova revisione', '.velo:last-child .piede-f', 1500);
    assert.match(await testoPagina(), /Modifica PR\//);
    await clicca('Salva', '.bottoni-editor', 1500);
    const rev = (await server('preventivo?id=' + daRivedere.numero)).preventivo;
    assert.equal(rev.revisione, daRivedere.revisione + 1);
    assert.equal(rev.stato, 'BOZZA');
    assert.equal(rev.revisioni.find(x => x.id === daRivedere.id).stato, 'SOSTITUITO', 'la precedente resta, sostituita');
    passo('nuova revisione: ' + rev.etichetta + ', la precedente sostituita');

    // ------------------------------------------------------------ PDF di preventivo e incarico
    const pdfPrima = fs.existsSync(STAMPE) ? fs.readdirSync(STAMPE).length : 0;
    await vai('#preventivi/' + id);
    await clicca('PDF', null, 5000);
    await valuta("document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('PDF dell\'incarico', '.menu', 5000);
    // Anche qui Edge può metterci più dei 5 secondi: si aspetta l'incarico, fino a 30.
    const stampati = () => fs.readdirSync(STAMPE).filter(x => /^(Preventivo|Incarico) /.test(x) && x.indexOf(GIRO) < 0);
    for (let i = 0; i < 25 && !stampati().some(x => /^Incarico /.test(x)); i++) await aspetta(1000);
    const nuovi = stampati();
    assert.ok(fs.readdirSync(STAMPE).length >= pdfPrima, 'i PDF ci sono');
    assert.ok(nuovi.some(x => /^Preventivo /.test(x)) && nuovi.some(x => /^Incarico /.test(x)), 'preventivo e incarico in pc/prove/stampe: ' + nuovi.join(', '));
    passo('PDF del preventivo e dell\'incarico stampati');

    // ------------------------------------------------------------ attività: sovrapposizione, spunta, ricorrenza
    await vai('#attivita');
    const aperte = (await server('attivita')).attivita;
    const riunione = aperte.find(a => a.assegnataA === 1 && a.inizio && a.fine && a.tipo !== 'attivita');
    await clicca('Nuova attività');
    await scrivi('Titolo', 'Telefonata ' + GIRO);
    await clicca('Appuntamento', '.finestra', 300);
    await scrivi('Giorno', riunione.inizio.slice(0, 10));
    await scrivi('Dalle', riunione.inizio.slice(11, 16));
    await scrivi('Alle', riunione.fine.slice(11, 16));
    await clicca('Manuel Gasparotto', '.finestra', 200);
    await clicca('Salva', '.finestra .piede-f', 1200);
    assert.match(await testoFinestra(), /Si sovrappone a un altro appuntamento/, 'il server chiede conferma, si vede come domanda');
    await foto('sovrapposta');
    await clicca('Salva lo stesso', '.velo:last-child', 1500);
    const conLei = (await server('attivita?da=' + riunione.inizio.slice(0, 10) + '&a=' + riunione.inizio.slice(0, 10))).attivita;
    assert.ok(conLei.some(a => a.titolo === 'Telefonata ' + GIRO), 'salvata con la conferma');
    passo('appuntamento sovrapposto: domanda, poi salvato con conferma');

    const daSpuntare = (await server('attivita')).attivita.find(a => a.assegnataA === 1 && a.puoScrivere);
    await vai('#attivita');
    await valuta(`[...document.querySelectorAll('.riga-attivita')].find(r => r.querySelector('.t1').textContent === ${JSON.stringify(daSpuntare.titolo)}).querySelector('.spunta-attivita').click(); true`);
    await aspetta(1200);
    assert.match(await testoAvvisi(), /Fatta: /);
    let lei = (await server('attivita?stato=tutte')).attivita.find(a => a.id === daSpuntare.id);
    assert.equal(lei.stato, 'fatta');
    await clicca('Annulla', '#avvisi', 1200);
    lei = (await server('attivita')).attivita.find(a => a.id === daSpuntare.id);
    assert.equal(lei.stato, 'da_fare', 'Annulla la rimette da fare');
    passo('spunta con Annulla: fatta e di nuovo da fare');

    await clicca('Nuova attività');
    await scrivi('Titolo', 'Giro dei cantieri ' + GIRO);
    await scrivi('Scadenza', C.oggiIso());
    await scrivi('Ripeti', 'settimane');
    await clicca('Salva', '.finestra .piede-f', 1800);
    const serie = (await server('attivita')).attivita.filter(a => a.titolo === 'Giro dei cantieri ' + GIRO);
    assert.ok(serie.length >= 12, 'le occorrenze dei prossimi 90 giorni: ' + serie.length);
    assert.match(await testoAvvisi(), /si ripete ogni settimana/);
    // Cambiare la terza "da questa in poi".
    serie.sort((a, b) => a.giorno.localeCompare(b.giorno));
    await vai('#attivita');
    await clicca('Squadra', null, 400);
    await valuta(`(() => { const t = document.querySelectorAll('.riga-attivita'); const r = [...t].find(x => x.querySelector('.t1').textContent === ${JSON.stringify('Giro dei cantieri ' + GIRO)}); r.click(); return true; })()`);
    await aspetta(600);
    await scrivi('Titolo', 'Giro dei cantieri e del magazzino ' + GIRO);
    await clicca('Salva', '.finestra .piede-f', 800);
    assert.match(await testoFinestra(), /Cambiare anche le altre volte/);
    await clicca('Da questa in poi', '.velo:last-child', 200);
    await clicca('Conferma', '.velo:last-child', 1800);
    const dopoSerie = (await server('attivita')).attivita.filter(a => a.titolo.indexOf(GIRO) >= 0 && a.titolo.indexOf('Giro') === 0);
    assert.ok(dopoSerie.length >= 12 && dopoSerie.every(a => a.titolo === 'Giro dei cantieri e del magazzino ' + GIRO), 'tutte le volte dalla prima in poi');
    passo('ricorrenza settimanale e "da questa in poi": ' + dopoSerie.length + ' volte');

    // ------------------------------------------------------------ calendario e pianificazione
    await vai('#attivita/calendario');
    assert.ok(await valuta("document.querySelectorAll('.cal-blocco').length > 0"), 'la settimana ha i suoi appuntamenti');
    await foto('calendario');
    await vai('#attivita/pianificazione');
    const libera = await valuta("(document.querySelector('.libere-pian .card-pian') || {}).dataset ? document.querySelector('.libere-pian .card-pian').dataset.attivita : ''");
    assert.ok(libera, 'c\'è una non assegnata da trascinare');
    // Trascinare: dragstart sulla scheda, drop sulla cella di Marco del primo giorno della settimana.
    await valuta(`(() => {
      const da = document.querySelector('.libere-pian .card-pian');
      const a = [...document.querySelectorAll('.cella-pian')].find(c => c.dataset.utente === '3');
      const dt = new DataTransfer();
      da.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      a.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      a.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      return true; })()`);
    await aspetta(1500);
    const assegnata = (await server('attivita?stato=tutte')).attivita.find(a => String(a.id) === String(libera));
    assert.equal(assegnata.assegnataA, 3, 'trascinata su Marco');
    passo('pianificazione: una non assegnata trascinata su Marco');

    // ------------------------------------------------------------ promemoria
    const adesso = new Date();
    const hhmm = String(adesso.getHours()).padStart(2, '0') + ':' + String(adesso.getMinutes()).padStart(2, '0');
    await server('salvaAttivita', { attivita: { titolo: 'Promemoria ' + GIRO, tipo: 'appuntamento', assegnataA: 1, inizio: C.oggiIso() + 'T' + hhmm + ':00', promemoriaMinuti: 0 }, conferma: true });
    await vai('#attivita');
    await valuta("[...document.querySelectorAll('.btn')].find(b => b.textContent.trim() === 'Attività') ? true : true");
    // L'elenco si rilegge entrando nella pagina; il controllo dei promemoria passa ogni mezzo minuto.
    await valuta("window.__visti = null; true");
    let visto = false;
    for (let i = 0; i < 40 && !visto; i++) { await aspetta(1000); visto = /Promemoria: Promemoria /.test(await testoAvvisi()); }
    if (!visto) {
      // Le aperte erano già in memoria prima di crearlo: un giro sulla pagina e si rilegge.
      await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#attivita' });
      for (let i = 0; i < 40 && !visto; i++) { await aspetta(1000); visto = /Promemoria: Promemoria /.test(await testoAvvisi()); }
    }
    assert.ok(visto, 'l\'avviso del promemoria nel programma');
    passo('promemoria: avviso nel programma (e /locale/notifica, nel finto ponte una riga nel registro)');

    // ------------------------------------------------------------ il collaboratore
    await entra('marco@esempio.it');
    const vociMarco = await valuta("[...document.querySelectorAll('#voci .voce')].map(x => x.dataset.nome)");
    assert.ok(!vociMarco.includes('Preventivi e contratti'), 'niente preventivi');
    assert.ok(vociMarco.includes('Attività e calendario'));
    await vai('#preventivi');
    assert.match(await testoPagina(), /Non hai il permesso/);
    await vai('#attivita');
    await clicca('Squadra', null, 600);
    const spente = await valuta("[...document.querySelectorAll('.spunta-attivita')].filter(b => b.disabled).length");
    assert.ok(spente > 0, 'quelle degli altri le vede ma non le spunta');
    passo('collaboratore: niente preventivi, le attività degli altri senza spunta');

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
