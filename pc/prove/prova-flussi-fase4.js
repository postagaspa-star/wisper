// I flussi della fase 4 (fatturazione, banche e scadenze) fatti con l'interfaccia vera, cliccando
// come una persona, contro il server di prova; dopo ogni passo si controlla col server che sia
// successo davvero. Edge senza finestra, profilo temporaneo (mai il browser di chi lavora).
//
//   node server/src/avvio.js --prova --porta 8445 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8798 --server http://localhost:8445
//   node pc/prove/prova-flussi-fase4.js --porta 8798 [--uscita <schermate>]
//
// Usa i dati di esempio del server così come nascono (settembre di Elettrodinamica da fatturare,
// la bozza W-15 di Rossi, l'XML 47/2026 di server/prove/xml): va lanciata su un server appena acceso.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { portaDevtools, chiudiEdge: chiudiEdgeCdp } = require('./edge-prova.js');

const C = require('../ui/conti.js');
global.WisperConti = C;
const RF = require('../ui/regole-fatture.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8798));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const STAMPE = path.join(__dirname, 'stampe');
const XML = path.join(__dirname, '..', '..', 'server', 'prove', 'xml');
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const CASI = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'prove', 'casi-fattura.json'), 'utf8'));

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi4-'));
  const porta = portaDevtools(9620, 150);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const errori = [];
  const creati = [];
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
      fs.writeFileSync(path.join(USCITA, 'flusso4-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
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
      await aspetta(attesa || 900);
    };
    const scrivi = async (etichetta, valore, dove) => {
      const ok = await valuta(`(() => {
        const radice = [...document.querySelectorAll(${JSON.stringify(dove || '.finestra')})].pop();
        if (!radice) return 'non trovo ' + ${JSON.stringify(dove || '.finestra')};
        const c = [...radice.querySelectorAll('.campo')].find(x => x.querySelector('label') && x.querySelector('label').textContent.trim() === ${JSON.stringify(etichetta)});
        if (!c) return 'non trovo il campo';
        const i = c.querySelector('input, textarea, select');
        i.readOnly = false;
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
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1500); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoPannello = () => valuta("(document.querySelector('.pannello-fattura') || {}).innerText || ''");
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
    const euro = n => C.euro(n);

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");

    // ------------------------------------------------------------- 1. Da fatturare → bozza
    await entra('manuel@esempio.it');
    const prima = await server('daFatturare');
    assert.ok(prima.ok, 'daFatturare risponde');
    const elettro = prima.gruppi.find(g => g.idCliente === 'C001');
    const settembre = elettro.voci.filter(v => v.tipo === 'rapportino' && String(v.data).startsWith('2026-09'));
    assert.equal(settembre.length, 6, 'i sei rapportini di settembre di Elettrodinamica sono da fatturare');
    await vai('#fatturazione');
    let testo = await testoPagina();
    assert.match(testo, /Elettrodinamica/);
    assert.match(testo, /Settembre 2026 · 6 rapportini/, 'i rapportini di un mese sono una voce');
    assert.match(testo, /Riepilogo inviato il 30\/09/, 'il fine mese di prima resta: riepilogo inviato');
    passo('Da fatturare: Elettrodinamica, settembre come una voce col riepilogo inviato il 30/09');
    // Una riga per il mese (di base per i clienti a tariffa fissa) e la voce di settembre scelta.
    await valuta(`(() => { const s = [...document.querySelectorAll('.scheda-cliente-df')].find(x => /Elettrodinamica/.test(x.querySelector('.chi b').textContent));
      const r = [...s.querySelectorAll('.riga-mese')].find(x => /Settembre 2026/.test(x.textContent)); r.querySelector('input.casella-df').click(); return true; })()`);
    await aspetta(400);
    testo = await testoPagina();
    assert.match(testo, /Prepara la bozza \(6\) · 1\.393,92 €/, 'il pulsante dice quante cose e quanto: ' + testo.slice(0, 200));
    await foto('1-da-fatturare');
    await clicca('Prepara la bozza', '#principale', 2200);
    const hashBozza = await valuta('location.hash');
    assert.match(hashBozza, /^#fatturazione\/bozza\/\d+$/, 'si apre la bozza');
    const idBozza = Number(hashBozza.split('/').pop());
    const bozza = (await server('fattura?id=' + idBozza)).fattura;
    assert.equal(bozza.stato, 'bozza');
    assert.equal(bozza.idCliente, 'C001');
    const caso5 = CASI.casi.find(c => /^5\./.test(c.nome)).atteso;
    assert.equal(bozza.conti.totale, caso5.totale, 'totale della bozza = caso 5 del contratto');
    assert.equal(bozza.conti.netto, caso5.netto);
    testo = await testoPagina();
    assert.match(testo, new RegExp(euro(caso5.totale).replace(/\./g, '\\.')), 'la pagina mostra il totale del server');
    assert.match(testo, new RegExp(euro(caso5.netto).replace(/\./g, '\\.')));
    assert.match(testo, /Da confermare/, 'regole non confermate: la pillola c\'è');
    assert.match(testo, /Rif\. W-\d+ · non è ancora una fattura/);
    const locale = RF.contiFattura(Object.assign({}, CASI.base, { ritenuta: true, righe: bozza.righe.filter(r => r.tipo !== 'bollo') }));
    assert.equal(locale.totale, bozza.conti.totale, 'l\'anteprima del computer ritrova il conto del server');
    passo('Bozza ' + bozza.riferimento + ': 3 righe del mese, totale ' + euro(bozza.conti.totale) + ', netto ' + euro(bozza.conti.netto) + ' (caso 5)');
    await foto('2-bozza');

    // ------------------------------------------------------------- 2. Passa al programma: prospetto e XML salvati
    await clicca('Passa al programma', '#principale', 1800);
    testo = await testoFinestra();
    assert.match(testo, /Passa al programma: Elettrodinamica/);
    assert.match(testo, /Non collegato/, 'Invio allo SDI · Non collegato');
    assert.match(testo, /Regole non ancora confermate/);
    const nomePdf = path.join(STAMPE, 'Prospetto ' + bozza.riferimento + ' Elettrodinamica.pdf');
    if (fs.existsSync(nomePdf)) fs.unlinkSync(nomePdf);
    await clicca('Scarica il prospetto (PDF)', '.finestra', 6000);
    assert.ok(fs.existsSync(nomePdf) && fs.statSync(nomePdf).size > 3000, 'il PDF del prospetto è salvato: ' + nomePdf);
    creati.push(nomePdf);
    const nomeXml = path.join(STAMPE, 'Bozza ' + bozza.riferimento + ' Elettrodinamica - non inviare.xml');
    if (fs.existsSync(nomeXml)) fs.unlinkSync(nomeXml);
    await clicca('Scarica l\'XML da completare', '.finestra', 1200);
    assert.ok(fs.existsSync(nomeXml), 'l\'XML da completare è salvato col nome che dice di non inviarlo');
    creati.push(nomeXml);
    const xml = fs.readFileSync(nomeXml, 'latin1');
    const xmlBozza64 = fs.readFileSync(nomeXml).toString('base64');
    assert.match(xml, /<Numero>BOZZA<\/Numero>/, 'nell\'XML il numero è BOZZA');
    assert.match(xml, new RegExp('Rif\\. Wisper ' + bozza.riferimento));
    passo('Passa al programma: prospetto PDF e "' + path.basename(nomeXml) + '" salvati (Numero = BOZZA)');
    await foto('3-passa');
    await clicca('Segna come passata al programma', '.finestra', 1000);
    testo = await testoFinestra();
    assert.match(testo, /passala lo stesso/i, 'regole non confermate: chiede una conferma in più');
    await clicca('Passala lo stesso', '.velo:last-child .finestra', 2200);
    assert.equal((await server('fattura?id=' + idBozza)).fattura.stato, 'pronta');
    testo = await testoPannello();
    assert.match(testo, /Pronta W-\d+/, 'si apre il pannello della pronta');
    assert.match(testo, /Importa l'XML emesso/, 'il giallo della pronta è Importa l\'XML emesso');
    passo(bozza.riferimento + ' pronta (con la conferma delle regole non confermate)');

    // ------------------------------------------------------------- 3. Importa l'XML di ritorno (47/2026, trascinato)
    // L'XML da completare, importato per sbaglio, si scarta con la frase del server (correzioni del 22/10).
    const lascia = async (nome, b) => valuta(`(() => { const bin = atob(${JSON.stringify(b)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([a], ${JSON.stringify(nome)}, { type: 'application/xml' }));
      document.querySelector('.zona-xml').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
    await clicca('Importa l\'XML emesso', '.pannello-fattura', 900);
    await lascia(path.basename(nomeXml), xmlBozza64);
    await aspetta(2000);
    testo = await testoFinestra();
    assert.match(testo, /È l'XML da completare preparato da Wisper, non una fattura emessa/, 'il motivo del server, com\'è: ' + testo);
    assert.match(testo, /Conferma \(0\)/);
    await foto('4a-xml-da-completare-scartato');
    await clicca('Annulla', '.finestra', 500);
    passo('L\'XML da completare importato per sbaglio: scartato con la frase del server');
    await clicca('Importa l\'XML emesso', '.pannello-fattura', 900);
    // L'XML di prova è del 21/10/2026: la data si porta a oggi, perché il server propone l'abbinamento solo con la data
    // dell'XML vicina al giorno in cui la fattura è diventata pronta (qui oggi), e la prova deve passare in ogni giorno.
    const oggiIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const b64 = Buffer.from(fs.readFileSync(path.join(XML, 'IT00000000000_00047.xml'), 'utf8').replace(/<Data>2026-10-21<\/Data>/g, '<Data>' + oggiIso + '</Data>'), 'utf8').toString('base64');
    await valuta(`(() => { const bin = atob(${JSON.stringify(b64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      const dt = new DataTransfer(); dt.items.add(new File([a], 'IT00000000000_00047.xml', { type: 'application/xml' }));
      document.querySelector('.zona-xml').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()`);
    await aspetta(2500);
    testo = await testoFinestra();
    assert.match(testo, /Fattura 47\/2026/);
    assert.match(testo, /Probabile/, 'stesso cliente e stesso totale: probabile');
    assert.match(testo, /Conferma \(0\)/, 'la probabile non è scelta da sola: serve la conferma riga per riga');
    await foto('4-importa');
    await clicca('Scegli cosa fare', '.finestra', 300);
    await clicca('Abbina alla ' + bozza.riferimento, '.menu', 400);
    testo = await testoFinestra();
    assert.match(testo, /Conferma \(1\)/);
    await clicca('Conferma (1)', '.finestra', 2500);
    const emessa = (await server('fattura?id=' + idBozza)).fattura;
    assert.equal(emessa.stato, 'emessa');
    assert.equal(emessa.numero, '47/2026', 'il numero vero arriva dall\'XML');
    const rap = (await server('rapportini')).rapportini.filter(r => settembre.some(v => v.id === r.id));
    assert.equal(rap.length, 6);
    assert.ok(rap.every(r => r.stato === 'FATTURATO'), 'i rapportini di settembre sono FATTURATO');
    assert.ok(rap.every(r => r.fattura && r.fattura.etichetta === 'Fattura 47/2026'), 'ogni rapportino porta la pillola della fattura');
    passo('XML 47/2026 abbinato alla ' + bozza.riferimento + ': emessa col numero vero, 6 rapportini FATTURATO');

    // ------------------------------------------------------------- 4. Incasso in parte → pagata in parte
    await vai('#fatturazione/fatture');
    await valuta(`document.querySelector('.tab .r[data-id="${idBozza}"]').click(); true`);
    await aspetta(1200);
    testo = await testoPannello();
    assert.match(testo, /Fattura 47\/2026/);
    await clicca('Segna un incasso', '.pannello-fattura', 900);
    await clicca('In parte', '.finestra', 200);
    await scrivi('Importo', '500');
    await foto('5-incasso');
    await clicca('Segna l\'incasso', '.finestra', 2000);
    const inParte = (await server('fattura?id=' + idBozza)).fattura;
    assert.equal(inParte.pagamento, 'in_parte');
    assert.equal(inParte.statoVisto, 'Pagata in parte');
    assert.equal(inParte.incassato, 500);
    assert.equal(inParte.residuo, Math.round((caso5.netto - 500) * 100) / 100);
    await valuta(`document.querySelector('.tab .r[data-id="${idBozza}"]').click(); true`);
    await aspetta(1200);
    testo = await testoPannello();
    assert.match(testo, /Pagata in parte/);
    assert.match(testo, new RegExp('Restano\\s+' + euro(inParte.residuo).replace(/\./g, '\\.')));
    passo('Incasso di 500,00 €: Pagata in parte, restano ' + euro(inParte.residuo));

    // ------------------------------------------------------------- 5. Nota di credito che libera le righe
    await valuta("document.querySelector('.pannello-fattura .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Prepara una nota di credito', '.menu', 600);
    testo = await testoFinestra();
    assert.match(testo, /Tornano da fatturare/, 'dice cosa torna da fatturare');
    await scrivi('Motivo', 'Fatturati due volte per prova');
    await clicca('Prepara la nota', '.finestra', 2200);
    const hashNota = await valuta('location.hash');
    const idNota = Number(hashNota.split('/').pop());
    const nota = (await server('fattura?id=' + idNota)).fattura;
    assert.equal(nota.tipo, 'nota');
    assert.equal(nota.conti.totale, emessa.conti.totale, 'tutta la fattura: stesso totale');
    await clicca('Passa al programma', '#principale', 1800);
    await clicca('Segna come passata al programma', '.finestra', 1000);
    await clicca('Passala lo stesso', '.velo:last-child .finestra', 2200);
    await valuta("document.querySelector('.pannello-fattura .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Segna emessa senza XML', '.menu', 600);
    await scrivi('Numero', '5/2026');
    await clicca('Segna emessa', '.finestra', 1000);
    await clicca('Segna emessa', '.velo:last-child .finestra', 2200);
    const notaEmessa = (await server('fattura?id=' + idNota)).fattura;
    assert.equal(notaEmessa.stato, 'emessa');
    const dopoNota = (await server('rapportini')).rapportini.filter(r => settembre.some(v => v.id === r.id));
    assert.ok(dopoNota.every(r => r.stato === 'INVIATO' || r.stato === 'FIRMATO'), 'i rapportini tornano come prima: ' + dopoNota.map(r => r.stato).join(','));
    const df2 = await server('daFatturare');
    const elettro2 = df2.gruppi.find(g => g.idCliente === 'C001');
    assert.ok(elettro2 && settembre.every(v => elettro2.voci.some(x => x.id === v.id)), 'settembre torna in Da fatturare');
    const annullata = (await server('fattura?id=' + idBozza)).fattura;
    assert.equal(annullata.daRestituire, 500, 'i 500,00 € incassati sono da restituire o compensare');
    await vai('#dashboard');
    const cercaVoce = `(() => {
      const voce = [...document.querySelectorAll('.dash-corpo button.riga, #principale .scheda.righe button.riga')].find(b => /da restituire/.test(b.textContent));
      if (voce) { voce.click(); return 'riga'; }
      const urgente = document.querySelector('.piu-urgente');
      if (urgente && /da restituire/.test(urgente.textContent)) { urgente.querySelector('button').click(); return 'la cosa più urgente'; }
      return 'manca';
    })()`;
    let voceDash = await valuta(cercaVoce);
    // Urgenti mostra al massimo 7 righe: dopo mezzanotte (attività e ticket di ieri in ritardo) la voce può stare in
    // "Altre N", cioè in Tutto quello che c'è da fare.
    if (voceDash === 'manca') {
      await valuta("([...document.querySelectorAll('.sezione-dash')].find(s => /^Urgenti/.test(s.querySelector('.etichetta').textContent)) || document).querySelector('button.altre-righe').click(); true");
      await aspetta(1800);
      voceDash = await valuta(cercaVoce);
      if (voceDash !== 'manca') voceDash = 'Tutto quello che c\'è da fare';
    }
    assert.notEqual(voceDash, 'manca', 'la Dashboard ha la voce dei soldi da restituire: ' + (await testoPagina()).slice(0, 1500));
    await aspetta(1800);
    testo = await testoPannello();
    assert.match(testo, /500,00 € da restituire o compensare/, 'la voce della Dashboard porta al pannello con la riga: ' + testo.slice(0, 200));
    await foto('7-da-restituire');
    passo('47/2026 annullata con 500,00 € incassati: la voce della Dashboard (' + voceDash + ') apre il pannello con "500,00 € da restituire o compensare"');
    passo('Nota di credito 5/2026: settembre torna da fatturare, rapportini ' + dopoNota[0].stato + ', la 47/2026 è ' + annullata.statoVisto);

    // ------------------------------------------------------------- 6. Doppia fatturazione rifiutata dal server
    await vai('#fatturazione');
    await valuta(`(() => { const s = [...document.querySelectorAll('.scheda-cliente-df')].find(x => /Rossi/.test(x.querySelector('.chi b').textContent));
      const r = [...s.querySelectorAll('.tab-df .r')].find(x => /Diritti di segreteria/.test(x.textContent)); r.querySelector('input.casella-df').click(); return true; })()`);
    await aspetta(300);
    // Nel frattempo un'altra persona prepara una bozza con la stessa spesa.
    const altra = await server('preparaFattura', { idCliente: 'C002', voci: [{ tipo: 'spesa', id: 6 }] });
    assert.ok(altra.ok, 'l\'altra bozza nasce');
    await clicca('Prepara la bozza', '#principale', 1500);
    const avvisi = await testoAvvisi();
    assert.match(avvisi, new RegExp('è già nella bozza ' + altra.fattura.riferimento + ' per Rossi Impianti Srl'), 'la frase del server: ' + avvisi);
    passo('Doppia fatturazione rifiutata: "' + avvisi.split('\n').find(x => /già nella bozza/.test(x)) + '"');
    await server('scartaFattura', { id: altra.fattura.id, motivo: 'prova' });

    // ------------------------------------------------------------- 7. Scadenziario sotto soglia
    await vai('#banche');
    await clicca('90 giorni', '#principale', 1800);
    testo = await testoPagina();
    const sc = await server('scadenziario?da=' + C.oggiIso() + '&a=' + new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
    assert.ok(sc.primoSottoSoglia, 'il server vede un giorno sotto soglia');
    assert.match(testo, /Sotto soglia/, 'i giorni sotto soglia hanno la parola');
    assert.match(testo, /Gli incassi scaduti non entrano nel saldo previsto/);
    passo('Scadenziario: sotto soglia dal ' + C.data(sc.primoSottoSoglia) + ', con la parola e la nota sugli incassi scaduti');
    await foto('6-scadenziario');

    // ------------------------------------------------------------- 8. Collaboratore: niente Fatturazione né Banche
    await entra('marco@esempio.it');
    const voci = await valuta("[...document.querySelectorAll('#voci .voce')].map(v => v.dataset.nome)");
    assert.ok(voci.indexOf('Fatturazione') < 0 && voci.indexOf('Banche e scadenze') < 0, 'nel menu di Marco: ' + voci.join(', '));
    await vai('#fatturazione');
    assert.match(await testoPagina(), /Non hai il permesso/);
    const rifiuto = await server('daFatturare');
    assert.equal(rifiuto.permesso, false, 'il server lo rifiuta');
    passo('Marco (collaboratore): niente Fatturazione né Banche nel menu, la pagina e il server dicono no');

    // ------------------------------------------------------------- 9. Lettura: vede, non scrive
    await entra('lettura@esempio.it');
    await vai('#fatturazione/fatture');
    testo = await testoPagina();
    assert.match(testo, /47\/2026|45\/2026/);
    const gialli = await valuta("document.querySelectorAll('#principale .btn.giallo').length");
    assert.equal(gialli, 0, 'lettura: nessun giallo');
    assert.doesNotMatch(testo, /Importa XML|Nuova fattura/);
    passo('Lettura: vede le fatture, nessun pulsante per scrivere');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('\n' + passi + ' passi, tutto a posto.');
  } finally {
    if (ws) ws.close();
    await chiudiEdgeCdp(porta, edge);
    creati.forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* già tolto */ } });
    await aspetta(500);
    await require('./edge-prova.js').togliCartella(profilo); // Edge a volte tiene un file un attimo: riprova per qualche secondo
  }
}

main().catch(e => { console.error('NO  ' + (e && e.stack ? e.stack : e)); process.exit(1); });
