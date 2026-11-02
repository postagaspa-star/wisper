// I flussi della fase 5 (documenti, ticket e assistenza) fatti con l'interfaccia vera, cliccando come una
// persona, contro il server di prova; dopo ogni passo si controlla col server che sia successo davvero.
// Edge senza finestra, profilo temporaneo (mai il browser di chi lavora).
//
//   node server/src/avvio.js --prova --porta 8465 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8797 --server http://localhost:8465
//   node pc/prove/prova-flussi-fase5.js --porta 8797 [--uscita <schermate>]
//
// Usa i dati di esempio del server così come nascono: va lanciata su un server appena acceso.
// Il finto ponte fa la parte del programma: "Scegli un file" dà un PDF di prova, che va al server con /carica.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8797));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi5-'));
  const porta = 9640 + Math.floor(Math.random() * 150);
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
      fs.writeFileSync(path.join(USCITA, 'flusso5-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    // Clic su un pulsante (o una riga, una voce di menu, una scheda) col testo dato, dentro "dove" (l'ultimo che c'è).
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(testo)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t)) || tutti.find(x => pulito(x).indexOf(t) >= 0);
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
      await aspetta(200);
    };
    const server = async (azione, corpo) => valuta(corpo
      ? `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`
      : `fetch('/server/${azione}').then(r => r.json())`);
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1600); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoPannello = sel => valuta(`(document.querySelector(${JSON.stringify(sel)}) || {}).innerText || ''`);
    const testoFinestra = () => valuta("([...document.querySelectorAll('.velo .finestra')].pop() || {}).innerText || ''");
    const testoAvvisi = () => valuta("document.querySelector('#avvisi').innerText");
    // Un solo pulsante giallo visibile per schermata (pagina + pannello, oppure la finestra in cima).
    const unGiallo = async nome => {
      const k = await valuta(`(() => {
        const vis = x => x.offsetParent !== null;
        const finestre = [...document.querySelectorAll('.velo .finestra')];
        if (finestre.length) return [...finestre.pop().querySelectorAll('.btn.giallo')].filter(vis).length;
        return [...document.querySelectorAll('#principale .btn.giallo, .pannello-doc .btn.giallo, .pannello-ticket .btn.giallo, .pannello-contratto .btn.giallo, .pannello .btn.giallo')].filter(vis).length;
      })()`);
      assert.ok(k <= 1, nome + ': ' + k + ' pulsanti gialli');
    };
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    const entra = async email => {
      await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
      await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#dashboard' });
      await aspetta(1200);
      // Dal 02/11/2026 la pagina di accesso si apre sul codice per il telefono: si passa a email e password come una persona.
      for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      await aspetta(2600);
    };
    const oggi = new Date();
    const due = x => String(x).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");

    // ------------------------------------------------------------- 1. nuovo ticket urgente
    await entra('manuel@esempio.it');
    let testo = await testoPagina();
    assert.match(testo, /ticket aperti/, 'la Dashboard ha i riquadri dei ticket');
    // Dalla fase 6 fra Banche e scadenze e Documenti c'è Persone e risorse umane (l'ordine delle specifiche).
    const menu = await valuta("[...document.querySelectorAll('#voci .voce')].map(v => v.dataset.nome)");
    assert.ok(menu.indexOf('Documenti') > menu.indexOf('Banche e scadenze') && menu.indexOf('Ticket e assistenza') === menu.indexOf('Documenti') + 1, 'menu nell\'ordine delle specifiche: ' + menu.join(', '));
    passo('Dashboard coi riquadri dei ticket; menu: Banche e scadenze, Documenti, Ticket e assistenza');

    await vai('#ticket');
    await unGiallo('Ticket aperti');
    await clicca('Nuovo ticket', '#principale', 700);
    await valuta(`(() => { const i = document.querySelector('.finestra input[type=search]'); i.value = 'Rossi'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await aspetta(300);
    await clicca('Rossi Impianti Srl', '.finestra', 1400);
    await clicca('Cabina MT Acme', '.finestra', 500);
    await scrivi('Cosa succede', 'Il quadro di prova va in blocco');
    await scrivi('Cosa dice il cliente', 'Si ferma tutto appena accendono la linea 2.');
    await clicca('Fermo', '.finestra', 200);
    await clicca('Subito', '.finestra', 300);
    testo = await testoFinestra();
    assert.match(testo, /Priorità\s*Urgente/, 'le due domande danno Urgente');
    assert.match(testo, /Nel contratto CA\/2026\/002/, 'il contratto dell\'impianto si propone da solo');
    await unGiallo('Nuovo ticket');
    await foto('1-nuovo-ticket');
    await clicca('Apri il ticket', '.finestra', 2200);
    const elenco = await server('tickets?testo=' + encodeURIComponent('quadro di prova'));
    const nuovo = (elenco.ticket || []).find(t => t.titolo === 'Il quadro di prova va in blocco');
    assert.ok(nuovo, 'il ticket c\'è sul server');
    assert.equal(nuovo.priorita, 'urgente');
    assert.equal(nuovo.stato, 'aperto');
    assert.equal(nuovo.contratto, 'CA/2026/002');
    assert.match(await testoPannello('.pannello-ticket'), new RegExp(nuovo.numero.replace(/\//g, '\\/')), 'si apre il pannello del ticket nuovo');
    passo('Nuovo ticket urgente ' + nuovo.numero + ' (Fermo + Subito), col contratto proposto dall\'impianto');

    // ------------------------------------------------------------- 2. prendo io
    await unGiallo('Ticket aperto');
    await clicca('Prendo io', '.pannello-ticket', 1800);
    let tk = (await server('ticket?id=' + nuovo.id)).ticket;
    assert.equal(tk.stato, 'in_carico');
    assert.equal(tk.responsabile, 'Manuel Gasparotto');
    assert.ok(tk.presoIl, 'presoIl segnato');
    passo('Prendo io: in carico a Manuel, presa misurata');

    // ------------------------------------------------------------- 3. pianifica: l'intervento nel calendario
    await clicca('Pianifica l\'intervento', '.pannello-ticket', 1500);
    testo = await testoFinestra();
    assert.match(testo, /Che giorno/);
    await clicca('domani', '.finestra', 1200);
    await unGiallo('Pianifica');
    const bottone = await valuta("[...document.querySelectorAll('.finestra .btn.giallo')].pop().textContent");
    await clicca(bottone.trim(), '.finestra', 1800);
    // Se il server chiede conferma per una sovrapposizione: Mettilo lo stesso.
    if (/Si sovrappone/.test(await testoFinestra())) await clicca('Mettilo lo stesso', '.finestra', 1800);
    tk = (await server('ticket?id=' + nuovo.id)).ticket;
    assert.equal(tk.interventi.length, 1, 'un intervento');
    const domani = new Date(oggi.getTime() + 86400000);
    assert.equal(String(tk.interventi[0].inizio).slice(0, 10), iso(domani));
    assert.equal(tk.interventi[0].tipo, 'intervento');
    const delGiorno = await server('attivita?da=' + iso(domani) + '&a=' + iso(domani));
    assert.ok(delGiorno.attivita.some(a => a.idTicket === nuovo.id && a.tipo === 'intervento'), 'l\'intervento è un\'attività del calendario');
    await vai('#attivita/calendario');
    if (domani.getDay() === 1) { await clicca('Settimana dopo', '#principale', 1200); }
    testo = await testoPagina();
    assert.ok(testo.indexOf(nuovo.numero) >= 0, 'il calendario mostra l\'intervento del ticket');
    assert.match(testo, /TICKET|Ticket/, 'col segno Ticket');
    await foto('3-calendario');
    passo('Pianifica l\'intervento: un\'attività tipo intervento domani, e il calendario la mostra');

    // ------------------------------------------------------------- 4. ore e spesa materiale dal ticket
    await vai('#ticket/tk/' + nuovo.id);
    await clicca('+ Ore', '.pannello-ticket', 900);
    await clicca('Salva', '.finestra', 1800);
    await clicca('+ Materiale o spesa', '.pannello-ticket', 900);
    await valuta(`(() => { const i = document.querySelector('.finestra input.importo-grande'); i.value = '18,50'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await scrivi('Descrizione', 'Fusibili e portafusibili');
    await clicca('Salva', '.finestra', 1800);
    tk = (await server('ticket?id=' + nuovo.id)).ticket;
    assert.equal(tk.ore.length, 1, 'una riga di ore del ticket');
    assert.equal(tk.spese.length, 1, 'una spesa del ticket');
    assert.equal(tk.spese[0].categoria, 'materiale');
    assert.equal(tk.spese[0].destinazione, 'cliente');
    assert.equal(tk.spese[0].importo, 18.5);
    assert.equal(tk.somma.materiale, 18.5);
    assert.match(await testoPannello('.pannello-ticket'), /materiale 18,50 €/, 'il pannello somma ore e materiale');
    passo('Ore e materiale dal ticket: righe di ore e di spese della fase 3 col ticket (somma: materiale 18,50 €)');

    // ------------------------------------------------------------- 5. rapportino → il lavoro è finito? → risolto
    await clicca('Altre azioni', '.pannello-ticket', 400);
    await clicca('Scrivi il rapportino', '.menu', 1200);
    testo = await testoFinestra();
    assert.match(testo, new RegExp('Ticket ' + nuovo.numero.replace(/\//g, '\\/')), 'il rapportino ha la pillola del ticket');
    assert.match(testo, /Rossi Impianti Srl/, 'già col cliente del ticket');
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', 'Sostituiti i fusibili del quadro, linea ripartita');
    const tariffa = await valuta("(() => { const c = [...document.querySelectorAll('.finestra .riga-stepper')].find(x => /Tariffa oraria/.test(x.textContent)); return c ? c.querySelector('input').value : 'fissa'; })()");
    if (tariffa === '') await valuta("(() => { const c = [...document.querySelectorAll('.finestra .riga-stepper')].find(x => /Tariffa oraria/.test(x.textContent)); const i = c.querySelector('input'); i.value = '45'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await clicca('Salva', '.finestra', 2400);
    testo = await testoFinestra();
    assert.match(testo, /Il lavoro è finito\?/, 'dopo il rapportino: Il lavoro è finito?');
    await unGiallo('Il lavoro è finito');
    await foto('5-lavoro-finito');
    await clicca('Sì, è risolto', '.finestra', 2000);
    tk = (await server('ticket?id=' + nuovo.id)).ticket;
    assert.equal(tk.stato, 'risolto');
    assert.equal(tk.rapportini.length, 1);
    const rap = (await server('rapportini?idTicket=' + nuovo.id)).rapportini[0];
    assert.equal(rap.idTicket, nuovo.id, 'il rapportino è del ticket');
    assert.equal(rap.numeroTicket, nuovo.numero);
    assert.ok(String(rap.ticket).indexOf(nuovo.numero) === 0, 'il campo Ticket del rapportino ha il numero (lo scrive il server)');
    passo('Rapportino del ticket (' + rap.id + ', campo Ticket "' + rap.ticket + '"), poi "Sì, è risolto"');

    // Il rapportino va firmato per andare in fattura: il foglio firmato caricato dal computer.
    await vai('#rapportini/elenco');
    await valuta(`(() => { const r = document.querySelector('.tab .r[data-chiave="${rap.id}"]'); r.click(); return true; })()`);
    await aspetta(900);
    assert.match(await testoPannello('.pannello'), new RegExp('Ticket ' + nuovo.numero.replace(/\//g, '\\/')), 'il pannello del rapportino ha la pillola del ticket');
    await clicca('Altre azioni', '.pannello', 400);
    await clicca('Carica il foglio firmato', '.menu', 700);
    await scrivi('Nome di chi ha firmato', 'R. Ferretti');
    await clicca('Scegli il file', '.finestra', 2500);
    const firmato = (await server('rapportini?idTicket=' + nuovo.id)).rapportini[0];
    assert.equal(firmato.stato, 'FIRMATO');
    passo('Foglio firmato caricato: ' + rap.id + ' firmato');

    // ------------------------------------------------------------- 6. chiudi con "una riga per l'intervento"
    await vai('#ticket/tk/' + nuovo.id);
    await unGiallo('Ticket risolto');
    await clicca('Chiudi il ticket', '.pannello-ticket', 1200);
    testo = await testoFinestra();
    assert.match(testo, /Come si fattura\?/);
    assert.match(testo, /Proposta: Nel contratto CA\/2026\/002/, 'la proposta del server: nel contratto');
    await clicca('Una riga per l\'intervento', '.finestra', 500);
    testo = await testoFinestra();
    assert.match(testo, /La riga che nascerà/i);
    assert.match(testo, new RegExp('Intervento ' + nuovo.numero.replace(/\//g, '\\/') + ' del'), 'la riga di fattura che nascerà');
    const rigaPrevista = (testo.split(/la riga che nascerà\n/i)[1] || '').split('\n')[0].trim();
    assert.match(rigaPrevista, /\(5 ore, materiale e spese 18,50 €, commessa /, 'la riga coi numeri del server: ' + rigaPrevista);
    await unGiallo('Chiudi il ticket');
    await foto('6-chiudi');
    await valuta("[...document.querySelectorAll('.finestra .btn.giallo')].pop().click()");
    await aspetta(2200);
    if (/Chiudo lo stesso/.test(await testoFinestra())) await clicca('Chiudi lo stesso', '.finestra', 2000);
    tk = (await server('ticket?id=' + nuovo.id)).ticket;
    assert.equal(tk.stato, 'chiuso');
    assert.equal(tk.fatturazione, 'ticket');
    assert.match(await testoAvvisi(), /Chiuso: va in Da fatturare/, 'l\'avviso dice dove va');
    passo('Chiuso con "Una riga per l\'intervento" (la proposta era "nel contratto")');

    // ------------------------------------------------------------- 7. Da fatturare, una volta sola
    let df = await server('daFatturare');
    const voce = [].concat(...df.gruppi.map(g => g.voci)).find(v => v.tipo === 'ticket' && v.id === nuovo.numero);
    assert.ok(voce, 'il ticket è una voce di Da fatturare');
    assert.equal(voce.pronta, true);
    assert.ok(![].concat(...df.gruppi.map(g => g.voci)).some(v => v.tipo === 'rapportino' && v.id === rap.id), 'il suo rapportino non è una voce a parte');
    await vai('#fatturazione');
    testo = await testoPagina();
    assert.ok(testo.indexOf('Intervento ' + nuovo.numero) >= 0, 'Da fatturare mostra la voce del ticket');
    await valuta(`(() => { const r = [...document.querySelectorAll('.tab-df .r')].find(x => x.textContent.indexOf('Intervento ${nuovo.numero}') >= 0); r.querySelector('input.casella-df').click(); return true; })()`);
    await aspetta(500);
    await foto('7-da-fatturare');
    await clicca('Prepara la bozza', '#principale', 2500);
    const hashBozza = await valuta('location.hash');
    assert.match(hashBozza, /^#fatturazione\/bozza\/\d+$/, 'si apre la bozza');
    const bozza = (await server('fattura?id=' + hashBozza.split('/').pop())).fattura;
    assert.ok(bozza.righe.some(r => r.descrizione === rigaPrevista), 'la bozza ha proprio la riga mostrata alla chiusura: ' + bozza.righe.map(r => r.descrizione).join(' | '));
    df = await server('daFatturare');
    assert.ok(![].concat(...df.gruppi.map(g => g.voci), df.piuAvanti || []).some(v => v.tipo === 'ticket' && v.id === nuovo.numero), 'non è più da fatturare');
    const due1 = await server('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'ticket', id: nuovo.numero }] });
    assert.equal(due1.ok, false, 'il ticket non si fattura due volte');
    const due2 = await server('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'rapportino', id: rap.id }] });
    assert.equal(due2.ok, false, 'nemmeno il suo rapportino da solo');
    passo('Da fatturare → bozza ' + bozza.riferimento + ' con la riga del ticket; due volte no (ticket: "' + due1.errore + '")');

    // ------------------------------------------------------------- 8. documento caricato con /carica e collegamento OneDrive
    await vai('#documenti');
    await unGiallo('Archivio');
    await clicca('Aggiungi un documento', '#principale', 700);
    await clicca('Carica un file', '.finestra', 400);
    await clicca('Scegli un file dal computer', '.finestra', 900);
    testo = await testoFinestra();
    assert.match(testo, /Verbale di prova\.pdf/, 'il file scelto');
    assert.match(testo, /diventa la rev\. 0/);
    await clicca('Verbali di verifica', '.finestra', 300);
    await clicca('Salva il documento', '.finestra', 2500);
    // Un verbale nuovo può chiedere se chiude una scadenza: qui no.
    if (/Chiude una scadenza/.test(await testoFinestra())) await clicca('Annulla', '.finestra', 600);
    let arch = await server('documenti?archivio=1&testo=' + encodeURIComponent('Verbale di prova'));
    const caricato = arch.documenti.find(d => d.titolo === 'Verbale di prova');
    assert.ok(caricato, 'il documento caricato c\'è');
    assert.equal(caricato.origine, 'file');
    assert.equal(caricato.revisione, 0);
    assert.equal(caricato.mime, 'application/pdf');
    assert.ok(caricato.byte > 50, 'i byte del file sono arrivati');
    assert.match(await testoPannello('.pannello-doc'), /Verbale di prova/, 'si apre il pannello del documento nuovo');
    passo('Documento caricato in byte con /carica (' + caricato.byte + ' byte, rev. 0)');

    await clicca('Chiudi', '.pannello-doc', 400);
    await clicca('Aggiungi un documento', '#principale', 700);
    await clicca('Collega un file o una cartella', '.finestra', 400);
    await valuta(`(() => { const i = document.querySelector('.finestra .campo-con-pulsante input'); i.value = 'https://esempio-my.sharepoint.com/:f:/g/personal/studio/Commesse/26ST099'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await aspetta(300);
    testo = await testoFinestra();
    assert.match(testo, /OneDrive/, 'la pillola del tipo mentre si incolla');
    assert.match(testo, /Non collegato/, 'Sfoglia OneDrive e Google Drive: Non collegato');
    await clicca('Progetti e schemi', '.finestra', 300);
    await clicca('Salva il documento', '.finestra', 2500);
    arch = await server('documenti?archivio=1&testo=26ST099');
    const coll = arch.documenti.find(d => d.origine === 'collegamento' && /26ST099/.test(d.url));
    assert.ok(coll, 'il collegamento c\'è');
    assert.equal(coll.collegamentoTipo, 'onedrive');
    assert.equal(coll.cartella, true);
    const pann = await testoPannello('.pannello-doc');
    assert.match(pann, /Apri in OneDrive/);
    assert.match(pann, /Le revisioni le tiene OneDrive/);
    await foto('8-collegamento');
    passo('Collegamento OneDrive: tipo riconosciuto dall\'indirizzo, cartella, "Apri in OneDrive"');
    await clicca('Apri in OneDrive', '.pannello-doc', 600);

    // ------------------------------------------------------------- 9. nuova revisione e approvazione
    await vai('#documenti/doc/' + caricato.id);
    await clicca('Carica una revisione', '.pannello-doc', 600);
    await clicca('Scegli un file dal computer', '.finestra', 800);
    await scrivi('Cosa cambia', 'Aggiunte le misure del secondo dispersore');
    await clicca('Carica la revisione', '.finestra', 2500);
    let doc = (await server('documento?id=' + caricato.id)).documento;
    assert.equal(doc.versioni.length, 2);
    assert.equal(doc.versioni[0].numero, 1);
    assert.equal(doc.versioni[0].statoVisto, 'Valida', 'caricata da chi approva: valida subito');
    assert.equal(doc.versioni[1].statoVisto, 'Superata');
    passo('Nuova revisione: rev. 1 valida, rev. 0 superata');

    // La rev. 3 dello schema caricata da Marco aspetta: Manuel la approva dal pannello.
    let schema = (await server('documento?id=1')).documento;
    const attesa = schema.versioni.find(v => v.statoVisto === 'Da approvare');
    assert.ok(attesa, 'lo schema ha una revisione da approvare');
    await vai('#documenti/approvare');
    testo = await testoPagina();
    assert.match(testo, /Schema unifilare cabina MT/);
    await clicca('Schema unifilare cabina MT', '#principale', 1200);
    await unGiallo('Da approvare');
    await clicca('Approva la rev. ' + attesa.numero, '.pannello-doc', 1800);
    schema = (await server('documento?id=1')).documento;
    assert.equal(schema.versioni.find(v => v.id === attesa.id).statoVisto, 'Valida');
    assert.equal(schema.revisione, attesa.numero);
    passo('Approvazione: la rev. ' + attesa.numero + ' di Marco approvata da Manuel, ora è la valida');

    // ------------------------------------------------------------- 10. scadenza segnata fatta
    let sc = await server('scadenze');
    // Una che si ripete (dalla fase 6 ci sono anche le tarature e i DPI scaduti, che si chiudono in un altro modo).
    const scaduta = (sc.scadute || []).find(x => x.ogniMesi) || (sc.scadute || [])[0];
    assert.ok(scaduta, 'c\'è una scadenza scaduta');
    await vai('#documenti/scadenze');
    await clicca(scaduta.titolo, '#principale', 900);
    await unGiallo('Scadenza');
    await clicca('Segna fatta', '.finestra', 2000);
    sc = await server('scadenze?stato=tutte');
    const fatta = sc.scadenze.find(x => x.id === scaduta.id);
    assert.equal(fatta.stato, 'fatta');
    assert.ok(fatta.idProssima, 'si ripete: nasce la prossima');
    assert.match(await testoAvvisi(), /Fatta: la prossima è il/);
    passo('Scadenza "' + scaduta.titolo + '" segnata fatta: nasce la prossima');

    // ------------------------------------------------------------- 11. il collaboratore non chiude
    await entra('marco@esempio.it');
    await vai('#ticket');
    testo = await testoPagina();
    assert.ok(testo.indexOf(nuovo.numero) < 0, 'Marco non vede il ticket di Manuel');
    const suo = (await server('tickets')).ticket.find(t => t.responsabile === 'Marco Rossato');
    assert.ok(suo, 'Marco ha un suo ticket');
    await vai('#ticket/tk/' + suo.id);
    await clicca('Altre azioni', '.pannello-ticket', 400);
    await clicca('Segna risolto', '.menu', 1800);
    const pannMarco = await testoPannello('.pannello-ticket');
    assert.match(pannMarco, /Lo chiude l'ufficio/, 'il collaboratore vede "Lo chiude l\'ufficio"');
    const gialloMarco = await valuta("[...document.querySelectorAll('.pannello-ticket .btn.giallo')].map(b => b.textContent).join('|')");
    assert.ok(!/Chiudi il ticket/.test(gialloMarco), 'nessun giallo "Chiudi il ticket" per il collaboratore');
    const rifiuto = await server('chiudiTicket', { id: suo.id, fatturazione: 'ticket' });
    assert.equal(rifiuto.ok, false);
    assert.equal(rifiuto.permesso, false);
    assert.equal(rifiuto.errore, 'Il ticket lo chiude l\'ufficio: tu segnalo risolto');
    await vai('#documenti');
    assert.equal(await valuta("document.querySelectorAll('#principale .btn.giallo').length"), 0, 'documenti in lettura: niente giallo per Marco');
    await foto('11-marco');
    passo('Marco (collaboratore): segna risolto, non chiude ("' + rifiuto.errore + '"); documenti solo da leggere');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('\n' + passi + ' passi, tutto a posto.');
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge tiene un file ancora un attimo */ }
  }
}

main().catch(e => { console.error('NO  ' + (e && e.stack ? e.stack : e)); process.exit(1); });
