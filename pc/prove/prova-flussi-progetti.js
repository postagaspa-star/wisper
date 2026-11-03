// I progetti e le funzioni che si spengono tutte (docs/gestionale/progetti.md, 03/11/2026), fatti con l'interfaccia vera di
// Wisper Ufficio cliccando come una persona, contro il server di prova; dopo ogni passo si controlla col server che sia
// successo davvero. Edge senza finestra, profilo temporaneo (mai il browser di chi lavora). Solo dati di esempio.
//
//   node server/src/avvio.js --prova --porta 8481 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8483 --server http://localhost:8481
//   node pc/prove/prova-flussi-progetti.js --porta 8483 [--uscita <schermate>]
//
// Va lanciata su un server appena acceso (senza progetti: i primi due codici si scrivono a mano, il terzo lo propone).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8483));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-progetti-'));
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
    const tema = async scuro => { await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scuro ? 'dark' : 'light' }] }); await aspetta(250); };
    /** La schermata in chiaro e in scuro (progetti.md: "tema chiaro e scuro"). */
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      // Gli avvisi dei passi di prima (gli errori restano finché non si chiudono) non vanno nelle schermate.
      await valuta("document.querySelectorAll('#avvisi .avviso').forEach(a => a.remove()); true");
      for (const scuro of [false, true]) {
        await tema(scuro);
        const f = await cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(USCITA, 'progetti-' + nome + (scuro ? '-scuro' : '') + '.png'), Buffer.from(f.result.data, 'base64'));
      }
      await tema(false);
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
    const valoreCampo = etichetta => valuta(`(() => {
      const radice = [...document.querySelectorAll('.finestra')].pop();
      const c = radice && [...radice.querySelectorAll('.campo')].find(x => x.querySelector('label') && x.querySelector('label').textContent.trim() === ${JSON.stringify(etichetta)});
      return c ? c.querySelector('input, textarea, select').value : null;
    })()`);
    const server = async (azione, corpo) => valuta(corpo
      ? `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`
      : `fetch('/server/${azione}').then(r => r.json())`);
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1700); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoPannello = sel => valuta(`(document.querySelector(${JSON.stringify(sel)}) || {}).innerText || ''`);
    const testoFinestra = () => valuta("([...document.querySelectorAll('.velo .finestra')].pop() || {}).innerText || ''");
    const testoAvvisi = () => valuta("document.querySelector('#avvisi').innerText");
    const chiudiAvvisi = () => valuta("document.querySelectorAll('#avvisi .avviso').forEach(a => a.remove()); true");
    const menu = () => valuta("[...document.querySelectorAll('#voci .voce')].map(v => v.dataset.nome)");
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
      for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      await aspetta(3000);
    };
    const ricarica = async hash => { await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + (hash || '#dashboard') }); await aspetta(3000); };
    const progettoDalServer = async codice => ((await server('progetti')).progetti || []).find(p => p.codice === codice);
    /** Il nuovo progetto: sceglie la commessa nel modulo (select) e aspetta la proposta del server. */
    const scegliCommessa = async id => {
      await valuta(`(() => { const s = [...document.querySelectorAll('.finestra')].pop().querySelector('select'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await aspetta(900);
    };
    const pilloleProgetto = () => valuta("[...[...document.querySelectorAll('.finestra')].pop().querySelectorAll('[data-campo=progetto] .pillola')].map(b => b.textContent.trim() + (b.classList.contains('scelta') ? ' *' : ''))");
    const interruttore = async modulo => { await valuta(`document.querySelector('[data-modulo="${modulo}"] .interruttore').click(); true`); await aspetta(700); };
    /** Il pulsante che conferma, in fondo alla finestra in cima (non la x in alto, che si chiama Chiudi). */
    const confermaFinestra = async attesa => { await valuta("[...[...document.querySelectorAll('.velo .finestra')].pop().querySelectorAll('.piede-f .btn')].pop().click(); true"); await aspetta(attesa || 1500); };
    const funzioniSpente = async () => ((await server('io')).interfaccia || {}).funzioniSpente || [];

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");

    // ------------------------------------------------------------- 1. Il menu: Progetti subito sotto Commesse; elenco vuoto
    await entra('manuel@esempio.it');
    const ana0 = await server('anagrafiche?archiviati=1');
    assert.ok(Array.isArray(ana0.progetti), 'il server manda i progetti nelle anagrafiche');
    assert.equal(ana0.progetti.length, 0, 'server appena acceso: nessun progetto');
    const voci = await menu();
    assert.equal(voci[voci.indexOf('Commesse') + 1], 'Progetti', 'Progetti subito sotto Commesse: ' + voci.join(', '));
    assert.ok(!voci.includes('Progetti e commesse'), 'la voce di prima non c\'è più');
    await vai('#progetti');
    let testo = await testoPagina();
    assert.match(testo, /Progetti/);
    assert.match(testo, /Nessun progetto aperto/);
    assert.match(testo, /Aperti · 0/);
    await unGiallo('Progetti vuota');
    passo('Menu: Progetti subito sotto Commesse; l\'elenco vuoto dice "Nessun progetto aperto"');

    // ------------------------------------------------------------- 1b. Il primo giorno: commessa nuova e progetto nuovo dal rapportino
    // Nessun codice ancora: Wisper non sa proporlo, quindi il codice va scritto prima di chiudere il progetto (non solo al
    // salvataggio del rapportino, dove il server lo rifiuterebbe). Poi si chiude senza salvare: niente resta sul server.
    const commesseAllInizio = (await server('anagrafiche?archiviati=1')).commesse.length;
    const nuovaCommessaNelRapportino = async nome => {
      await vai('#rapportini/elenco');
      await clicca('Nuovo rapportino', '#principale', 800);
      await valuta("(() => { const i = document.querySelector('.finestra input[type=search]'); i.value = 'Elettro'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
      await aspetta(400);
      await clicca('Elettrodinamica', '.finestra', 500);
      await valuta(`(() => { const i = [...[...document.querySelectorAll('.finestra')].pop().querySelectorAll('input')].find(x => x.placeholder === 'Come la chiami tu'); i.value = ${JSON.stringify(nome)}; return true; })()`);
      await clicca('Commessa nuova', '.finestra', 600);
      assert.deepEqual(await pilloleProgetto(), ['+ Nuovo progetto'], 'commessa nuova: solo Nuovo progetto');
      await clicca('+ Nuovo progetto', '.finestra', 1200);
    };
    await nuovaCommessaNelRapportino('Ampliamento uffici');
    assert.equal(await valoreCampo('Codice'), '', 'nessuna proposta senza codici');
    await scrivi('Descrizione', 'Quadro uffici');
    await clicca('Salva', '.finestra', 900);
    assert.match(await testoFinestra(), /Scrivi il codice del progetto: dopo i primi due Wisper lo propone da solo/, 'il codice va scritto subito');
    await scrivi('Codice', 'UF-01');
    await clicca('Salva', '.finestra', 900);
    assert.deepEqual(await pilloleProgetto(), ['UF-01 · Quadro uffici (nuovo) *'], 'il progetto nuovo resta nel rapportino');
    await valuta("[...document.querySelectorAll('.velo')].pop().chiudi(); true");
    await aspetta(400);
    assert.equal((await server('progetti')).progetti.length, 0, 'chiuso senza salvare: nessun progetto');
    assert.equal((await server('anagrafiche?archiviati=1')).commesse.length, commesseAllInizio, 'e nessuna commessa');
    passo('Primo giorno: commessa nuova + progetto nuovo dal rapportino, senza codici il campo Codice è obbligatorio ("Scrivi il codice del progetto")');
    await vai('#progetti');

    // ------------------------------------------------------------- 2. Il primo progetto a mano (dall'elenco)
    await clicca('Nuovo progetto', '#principale', 700);
    testo = await testoFinestra();
    assert.match(testo, /Commessa/);
    assert.match(testo, /Codice/);
    assert.match(testo, /Intestato a/, 'Intestato a sempre visibile');
    assert.ok(!/sotto-cliente/i.test(testo), 'la parola sotto-cliente non c\'è');
    await scegliCommessa('26ST001');
    assert.equal(await valoreCampo('Codice'), '', 'nessun progetto: niente proposta, il codice si scrive a mano');
    await unGiallo('Nuovo progetto');
    // Senza descrizione il server non serve: lo dice il modulo, sotto il campo.
    await clicca('Salva', '.finestra', 600);
    assert.match(await testoFinestra(), /Scrivi la descrizione del progetto/);
    await scrivi('Codice', 'ED-001');
    await scrivi('Intestato a', 'Batokyo Srl');
    await scrivi('Descrizione', 'Quadro QE1');
    await clicca('Salva', '.finestra', 2000);
    const p1 = await progettoDalServer('ED-001');
    assert.ok(p1, 'il primo progetto è sul server');
    assert.equal(p1.idCommessa, '26ST001');
    assert.equal(p1.intestatoA, 'Batokyo Srl');
    assert.equal(p1.idCliente, 'C001', 'il cliente è quello della commessa');
    assert.equal(await valuta('location.hash'), '#progetti/' + p1.id, 'si apre la sua scheda');
    testo = await testoPagina();
    assert.match(testo, /ED-001/);
    assert.match(testo, /Quadro QE1/);
    assert.match(testo, /Intestato a\s+Batokyo Srl/);
    assert.match(testo, /Elettrodinamica/);
    passo('Primo progetto a mano: ED-001 · Quadro QE1, intestato a Batokyo Srl, sulla 26ST001 (cliente dalla commessa)');

    // ------------------------------------------------------------- 3. Il secondo a mano, dalla scheda della commessa
    await vai('#commesse/26ST001');
    await clicca('Progetti · 1', '#principale .segmenti', 800);
    testo = await testoPagina();
    assert.match(testo, /ED-001/);
    await clicca('Nuovo progetto', '#principale', 900);
    assert.equal(await valuta("[...document.querySelectorAll('.finestra')].pop().querySelector('select').value"), '26ST001', 'la commessa già messa');
    assert.equal(await valoreCampo('Codice'), '', 'un progetto solo non basta per proporre');
    // "Intestato a": i nomi già usati per questo cliente, da toccare.
    const nomi = await valuta("[...[...document.querySelectorAll('.finestra')].pop().querySelectorAll('.pillole .pillola')].map(b => b.textContent.trim())");
    assert.deepEqual(nomi, ['Batokyo Srl'], 'il nome già usato per Elettrodinamica');
    await clicca('Batokyo Srl', '.finestra', 300);
    assert.equal(await valoreCampo('Intestato a'), 'Batokyo Srl');
    await scrivi('Codice', 'ED-002');
    await scrivi('Descrizione', 'Linea nastri');
    await clicca('Salva', '.finestra', 2000);
    const p2 = await progettoDalServer('ED-002');
    assert.ok(p2 && p2.intestatoA === 'Batokyo Srl', 'il secondo progetto è sul server');
    // Un codice già preso: la frase del server sotto il campo, così com'è.
    await vai('#progetti');
    await clicca('Nuovo progetto', '#principale', 700);
    await scegliCommessa('26ST001');
    await scrivi('Codice', 'ED-001');
    await scrivi('Descrizione', 'Doppione');
    await clicca('Salva', '.finestra', 1500);
    assert.match(await testoFinestra(), /Il codice ED-001 è già di un altro progetto di questo cliente/);
    await valuta("[...document.querySelectorAll('.velo')].pop().chiudi(); true");
    await aspetta(300);
    passo('Secondo progetto dalla scheda commessa (commessa già messa, "Batokyo Srl" proposto); il codice doppio lo ferma il server');

    // ------------------------------------------------------------- 4. Il terzo arriva col codice proposto
    const attesoDalServer = (await server('codiceProgetto?idCommessa=26ST001')).codice;
    assert.equal(attesoDalServer, 'ED-003', 'dopo i primi due il server propone ED-003');
    await vai('#progetti');
    await clicca('Nuovo progetto', '#principale', 700);
    await scegliCommessa('26ST001');
    assert.equal(await valoreCampo('Codice'), 'ED-003', 'il codice proposto è già scritto nel campo');
    await scrivi('Descrizione', 'Quadro QE2');
    await clicca('Batokyo Srl', '.finestra', 300);
    await foto('nuovo-codice-proposto');
    await clicca('Salva', '.finestra', 2000);
    const p3 = await progettoDalServer('ED-003');
    assert.ok(p3, 'il terzo progetto è sul server');
    assert.equal(p3.codiceAutomatico, true, 'il server sa che è il suo codice');
    passo('Terzo progetto: il campo Codice arriva già con ED-003, quello proposto dal server (codiceAutomatico)');

    // ------------------------------------------------------------- 5. Un rapportino sotto un progetto (dalla scheda)
    await vai('#progetti/' + p3.id);
    await unGiallo('Scheda progetto');
    await clicca('Nuovo rapportino', '#principale', 900);
    let pill = await pilloleProgetto();
    assert.deepEqual(pill, ['ED-001 · Quadro QE1', 'ED-002 · Linea nastri', 'ED-003 · Quadro QE2 *', '+ Nuovo progetto'], 'il progetto già scelto, fra gli aperti della commessa: ' + pill.join(' | '));
    testo = await testoFinestra();
    assert.ok(!/Senza commessa/.test(testo), 'coi progetti accesi niente "Senza commessa"');
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', 'Cablaggio del quadro QE2');
    await foto('rapportino-campo-progetto');
    await clicca('Salva', '.finestra', 2200);
    let rap = (await server('rapportini')).rapportini.find(r => r.descrizione === 'Cablaggio del quadro QE2');
    assert.ok(rap, 'il rapportino è sul server');
    assert.equal(String(rap.idProgetto), String(p3.id), 'col progetto giusto');
    assert.equal(rap.progetto, 'ED-003');
    assert.equal(rap.progettoDescrizione, 'Quadro QE2');
    assert.equal(rap.progettoIntestatoA, 'Batokyo Srl');
    // Il pannello: la riga del progetto.
    testo = await testoPannello('.pannello');
    assert.match(testo, /Progetto\s+ED-003 · Quadro QE2/i);
    assert.match(testo, /Intestato a Batokyo Srl/);
    passo('Rapportino dalla scheda del progetto: cliente, commessa e progetto già messi; sul server con ED-003; il pannello lo dice');

    // ------------------------------------------------------------- 6. Senza progetto non si salva; "Nuovo progetto" dentro il rapportino
    await vai('#rapportini/elenco');
    await clicca('Nuovo rapportino', '#principale', 800);
    await valuta("(() => { const i = document.querySelector('.finestra input[type=search]'); i.value = 'Elettro'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(400);
    await clicca('Elettrodinamica', '.finestra', 500);
    await clicca('26ST001 · ', '.finestra', 500);
    pill = await pilloleProgetto();
    assert.ok(pill.length === 4 && pill.every(t => !t.endsWith('*')), 'tre aperti, nessuno scelto: ' + pill.join(' | '));
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', 'Prove del quadro QE1');
    await clicca('Salva', '.finestra', 900);
    assert.match(await testoFinestra(), /Scegli il progetto/, 'senza progetto non si salva');
    assert.equal(await valuta("!!document.querySelector('.finestra')"), true, 'il modulo resta aperto');
    await clicca('ED-001 · Quadro QE1', '.finestra', 300);
    await clicca('Salva', '.finestra', 2200);
    rap = (await server('rapportini')).rapportini.find(r => r.descrizione === 'Prove del quadro QE1');
    assert.equal(String(rap && rap.idProgetto), String(p1.id), 'salvato con ED-001 dopo averlo scelto');
    // Rossi, commessa senza progetti: il progetto nuovo nasce dal rapportino.
    await clicca('Nuovo rapportino', '#principale', 800);
    await valuta("(() => { const i = document.querySelector('.finestra input[type=search]'); i.value = 'Rossi'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(400);
    await clicca('Rossi Impianti Srl', '.finestra', 500);
    await clicca('26ST002 · ', '.finestra', 500);
    pill = await pilloleProgetto();
    assert.deepEqual(pill, ['+ Nuovo progetto'], 'la commessa non ha progetti: solo Nuovo progetto');
    await clicca('+ Nuovo progetto', '.finestra', 1200);
    assert.equal(await valuta("[...document.querySelectorAll('.finestra')].pop().querySelector('select').disabled"), true, 'dal rapportino la commessa è fissa');
    const propostoRossi = (await server('codiceProgetto?idCommessa=26ST002')).codice;
    assert.equal(await valoreCampo('Codice'), propostoRossi, 'il codice proposto dal server (' + propostoRossi + ')');
    await scrivi('Descrizione', 'Quadro generale capannone');
    await clicca('Salva', '.finestra', 2000);
    pill = await pilloleProgetto();
    assert.ok(pill.some(t => /Quadro generale capannone \*$/.test(t)), 'il progetto nuovo è già scelto nel rapportino: ' + pill.join(' | '));
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', 'Rilievo del quadro generale');
    await clicca('Salva', '.finestra', 2200);
    const pRossi = (await server('progetti?idCommessa=26ST002')).progetti[0];
    rap = (await server('rapportini')).rapportini.find(r => r.descrizione === 'Rilievo del quadro generale');
    assert.ok(pRossi && rap && String(rap.idProgetto) === String(pRossi.id), 'progetto creato col rapportino e rapportino sotto di lui');
    passo('Senza progetto il rapportino non si salva ("Scegli il progetto"); "Nuovo progetto" dentro il rapportino crea ' + pRossi.codice + ' e lo sceglie');

    // ------------------------------------------------------------- 7. Elenco: colonne, conti, ricerca; elenco rapportini col progetto
    await vai('#progetti');
    testo = await testoPagina();
    ['Codice', 'Descrizione', 'Intestato a', 'Cliente · commessa', 'Rapportini e ore'].forEach(c => assert.match(testo, new RegExp(c, 'i'), 'colonna ' + c));
    assert.match(testo, /Aperti · 4/);
    assert.match(testo, /Elettrodinamica/);
    assert.match(testo, /1 rapportino · 4 h/, 'quanti rapportini e ore li conta il server');
    await valuta("(() => { const i = document.querySelector('#principale input[type=search]'); i.value = 'linea'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(400);
    const righe = await valuta("[...document.querySelectorAll('#principale [data-progetto]')].map(r => r.innerText.split('\\n')[0])");
    assert.deepEqual(righe, ['ED-002'], 'la ricerca trova la descrizione');
    await valuta("(() => { const i = document.querySelector('#principale input[type=search]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(300);
    await foto('elenco');
    await vai('#rapportini/elenco');
    testo = await testoPagina();
    assert.match(testo, /ED-003 · Quadro QE2/, 'l\'elenco dei rapportini mostra il progetto');
    passo('Elenco Progetti: le cinque colonne, "1 rapportino · 4 h", la ricerca; l\'elenco dei rapportini mostra "ED-003 · Quadro QE2"');

    // ------------------------------------------------------------- 8. Chiudi, Riapri, Togli (solo senza rapportini)
    await vai('#progetti/' + p2.id);
    await clicca('Chiudi', '#principale', 600);
    assert.match(await testoFinestra(), /Chiudere il progetto?/);
    await confermaFinestra();
    assert.equal((await progettoDalServer('ED-002')).stato, 'CHIUSO');
    await vai('#progetti');
    assert.match(await testoPagina(), /Chiusi · 1/);
    await vai('#progetti/' + p2.id);
    await clicca('Riapri', '#principale', 600);
    assert.match(await testoFinestra(), /Riaprire il progetto?/);
    await confermaFinestra();
    assert.equal((await progettoDalServer('ED-002')).stato, 'APERTO');
    // ED-002 non ha rapportini: si toglie. ED-003 ne ha uno: il menu Togli non c'è.
    await clicca('Altre azioni', '#principale', 300);
    await clicca('Togli', '.menu', 500);
    assert.match(await testoFinestra(), /Togliere il progetto?/);
    await confermaFinestra();
    assert.ok(!(await progettoDalServer('ED-002')), 'tolto dal server');
    assert.equal(await valuta('location.hash'), '#progetti');
    await vai('#progetti/' + p3.id);
    assert.equal(await valuta("!!document.querySelector('#principale [aria-label=\"Altre azioni\"]')"), false, 'con rapportini non si toglie');
    testo = await testoPagina();
    assert.match(testo, /Cablaggio del quadro QE2/, 'la scheda mostra i suoi rapportini');
    await foto('scheda');
    passo('Chiudi e Riapri con conferma; Togli solo senza rapportini (ED-002 tolto, ED-003 col rapportino no)');

    // ------------------------------------------------------------- 9. Il PDF del rapportino: la riga Progetto e Intestato a
    await vai('#rapportini/elenco');
    await valuta(`(() => { const r = [...document.querySelectorAll('.tab .r[data-chiave]')].find(x => x.textContent.includes('Cablaggio del quadro QE2')); r.click(); return true; })()`);
    await aspetta(1200);
    await clicca('PDF', '.pannello', 4000);
    assert.match(await testoAvvisi(), /PDF salvato in/, 'il PDF esce (Edge stampa nel finto ponte)');
    const html = await valuta(`(async () => {
      const rap = (await fetch('/server/rapportini').then(r => r.json())).rapportini.find(r => r.descrizione === 'Cablaggio del quadro QE2');
      const a = await fetch('/server/anagrafiche?archiviati=1').then(r => r.json());
      return WisperDocumenti.rapportino(rap, { impostazioni: a.impostazioni, clienti: a.clienti, commesse: a.commesse, progetti: a.progetti }, {});
    })()`);
    assert.ok(html.indexOf('<div class="etichetta">Progetto</div><div class="valore">ED-003 · Quadro QE2</div>') > 0, 'la riga Progetto');
    assert.ok(html.indexOf('<div class="etichetta">Intestato a</div><div class="valore">Batokyo Srl</div>') > 0, 'Intestato a');
    if (USCITA) {
      // La pagina del documento da sola (in un file, come la stampa: dentro l'app le regole della pagina tolgono lo stile in linea).
      fs.mkdirSync(USCITA, { recursive: true });
      const fileDoc = path.join(profilo, 'rapportino-di-prova.html');
      fs.writeFileSync(fileDoc, html);
      await cdp('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false });
      await cdp('Page.navigate', { url: 'file:///' + fileDoc.replace(/\\/g, '/') });
      await aspetta(1500);
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'progetti-pdf-rapportino.png'), Buffer.from(f.result.data, 'base64'));
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await ricarica('#progetti');
    }
    passo('PDF del rapportino: esce, e ha la riga Progetto (ED-003 · Quadro QE2) e Intestato a (Batokyo Srl)');

    // ------------------------------------------------------------- 10. Funzioni: spegne Progetti e la riaccende
    await vai('#amministrazione/funzioni');
    testo = await testoPagina();
    assert.equal(await valuta("document.querySelectorAll('[data-modulo] .interruttore').length"), 19, 'tutte e 19 si spengono');
    assert.ok(!/Sempre accesa/.test(testo), 'nessuna "Sempre accesa"');
    await interruttore('progetti');
    testo = await testoFinestra();
    assert.match(testo, /Spegnere Progetti\?/);
    assert.match(testo, /i rapportini non chiedono più il progetto/);
    assert.ok(!/Si spengono anche/.test(testo), 'Progetti non si porta dietro nessuno');
    await clicca('Spegni', '.finestra', 2500);
    assert.deepEqual(await funzioniSpente(), ['progetti'], 'il server la sa spenta');
    assert.ok(!(await menu()).includes('Progetti'), 'sparita dal menu');
    assert.match(await testoAvvisi(), /Progetti spenta: i dati restano/);
    // Il rapportino senza il campo Progetto, con "Senza commessa" di nuovo.
    await vai('#rapportini/elenco');
    await clicca('Nuovo rapportino', '#principale', 800);
    await valuta("(() => { const i = document.querySelector('.finestra input[type=search]'); i.value = 'Elettro'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(400);
    await clicca('Elettrodinamica', '.finestra', 500);
    testo = await testoFinestra();
    assert.ok(!/Progetto/.test(testo), 'il campo Progetto non c\'è');
    assert.match(testo, /Senza commessa/);
    await valuta("[...document.querySelectorAll('.velo')].pop().chiudi(); true");
    await aspetta(300);
    await vai('#progetti');
    assert.match(await testoPagina(), /La funzione Progetti è spenta/);
    // Riaccesa: Commesse è accesa, niente foglio; il menu la riporta.
    await vai('#amministrazione/funzioni');
    await chiudiAvvisi();
    await interruttore('progetti');
    await aspetta(2000);
    assert.deepEqual(await funzioniSpente(), [], 'riaccesa');
    assert.ok((await menu()).includes('Progetti'), 'di nuovo nel menu');
    assert.match(await testoAvvisi(), /Progetti riaccesa: i dati sono come prima/);
    passo('Funzioni: Progetti spenta (foglio con cosa cambia, menu, rapportino senza il campo) e riaccesa');

    // ------------------------------------------------------------- 11. Funzioni: le dipendenze nel foglio (Commesse si porta dietro Progetti e Collaboratori)
    await interruttore('commesse');
    testo = await testoFinestra();
    assert.match(testo, /Spegnere Commesse\?/);
    assert.match(testo, /Si spengono anche: Progetti, Collaboratori esterni/);
    await unGiallo('Foglio di conferma');
    await foto('funzioni-foglio');
    await clicca('Spegni', '.finestra', 2500);
    assert.deepEqual((await funzioniSpente()).slice().sort(), ['collaboratori', 'commesse', 'progetti']);
    let m = await menu();
    assert.ok(!m.includes('Commesse') && !m.includes('Progetti') && !m.includes('Collaboratori esterni'), 'via dal menu tutte e tre: ' + m.join(', '));
    assert.match(await testoAvvisi(), /Commesse spenta, e anche Progetti e Collaboratori esterni: i dati restano/);
    // Il rapportino non chiede neanche la commessa.
    await vai('#rapportini/elenco');
    await clicca('Nuovo rapportino', '#principale', 800);
    await valuta("(() => { const i = document.querySelector('.finestra input[type=search]'); i.value = 'Elettro'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(400);
    await clicca('Elettrodinamica', '.finestra', 500);
    testo = await testoFinestra();
    assert.ok(!/Commessa/.test(testo) && !/Progetto/.test(testo), 'niente commessa e niente progetto con Commesse spenta');
    await valuta("[...document.querySelectorAll('.velo')].pop().chiudi(); true");
    await aspetta(300);
    // Accendere Progetti riaccende Commesse (il foglio lo dice); Collaboratori resta spenta.
    await vai('#amministrazione/funzioni');
    await chiudiAvvisi();
    await interruttore('progetti');
    testo = await testoFinestra();
    assert.match(testo, /Accendere Progetti\?/);
    assert.match(testo, /Si accendono anche: Commesse/);
    await clicca('Accendi', '.finestra', 2500);
    assert.deepEqual(await funzioniSpente(), ['collaboratori']);
    m = await menu();
    assert.ok(m.includes('Commesse') && m.includes('Progetti'), 'di nuovo nel menu: ' + m.join(', '));
    assert.match(await testoAvvisi(), /Progetti riaccesa, e anche Commesse: i dati sono come prima/);
    await interruttore('collaboratori');
    await aspetta(2000);
    assert.deepEqual(await funzioniSpente(), []);
    passo('Funzioni: spegnere Commesse spegne anche Progetti e Collaboratori (il foglio lo dice); accendere Progetti riaccende Commesse');

    // ------------------------------------------------------------- 12. Amministrazione spenta, Dashboard spenta, tutto spento
    await chiudiAvvisi();
    await interruttore('amministrazione');
    await clicca('Spegni', '.finestra', 2500);
    m = await menu();
    assert.ok(m.includes('Amministrazione'), 'il titolare vede ancora Amministrazione');
    await vai('#amministrazione');
    assert.equal(await valuta('location.hash'), '#amministrazione/funzioni', 'dentro c\'è solo Funzioni');
    await vai('#amministrazione/utenti');
    assert.equal(await valuta('location.hash'), '#amministrazione/funzioni', 'le altre pagine portano a Funzioni');
    assert.match(await testoPagina(), /Funzioni accese/);
    // Laura (amministrazione) non la vede.
    await entra('laura@esempio.it');
    assert.ok(!(await menu()).includes('Amministrazione'), 'gli altri non vedono Amministrazione');
    await entra('manuel@esempio.it');
    await vai('#amministrazione/funzioni');
    await interruttore('amministrazione');
    await aspetta(2000);
    assert.deepEqual(await funzioniSpente(), []);
    // Dashboard spenta: si apre la prima voce accesa.
    await server('salvaFunzioni', { modulo: 'dashboard', accesa: false });
    await ricarica('#dashboard');
    assert.equal(await valuta('location.hash'), '#clienti', 'senza Dashboard si apre la prima voce accesa');
    await server('salvaFunzioni', { modulo: 'dashboard', accesa: true });
    // Tutto spento: la pagina "Nessuna funzione accesa" col pulsante Funzioni per il titolare.
    const tutte = (await server('funzioni')).funzioni.map(f => f.modulo);
    for (const x of tutte) await server('salvaFunzioni', { modulo: x, accesa: false });
    assert.equal((await funzioniSpente()).length, 19, 'tutte spente');
    await ricarica('#dashboard');
    testo = await testoPagina();
    assert.match(testo, /Nessuna funzione accesa/);
    assert.deepEqual(await menu(), ['Amministrazione'], 'resta solo Amministrazione per il titolare');
    await unGiallo('Nessuna funzione accesa');
    await clicca('Funzioni', '#principale', 1500);
    assert.equal(await valuta('location.hash'), '#amministrazione/funzioni');
    for (const x of tutte) await server('salvaFunzioni', { modulo: x, accesa: true });
    assert.deepEqual(await funzioniSpente(), []);
    await ricarica('#dashboard');
    assert.equal(await valuta('location.hash'), '#dashboard', 'tutto riacceso, di nuovo la Dashboard');
    passo('Amministrazione spenta (al titolare solo Funzioni, Laura non la vede), Dashboard spenta (si apre Clienti), tutto spento ("Nessuna funzione accesa" col pulsante Funzioni)');

    // ------------------------------------------------------------- 13. Commessa nuova + progetto nuovo, ora che Wisper sa proporre il codice
    await nuovaCommessaNelRapportino('Cabina di trasformazione');
    const propostoNuova = await valoreCampo('Codice');
    assert.match(propostoNuova, /^ED-\d{3}$/, 'il codice proposto dal cliente anche per una commessa che non c\'è ancora: ' + propostoNuova);
    await scrivi('Descrizione', 'Cabina MT');
    await clicca('Salva', '.finestra', 900);
    assert.deepEqual(await pilloleProgetto(), [propostoNuova + ' · Cabina MT (nuovo) *']);
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', 'Sopralluogo cabina');
    await clicca('Salva', '.finestra', 2500);
    rap = (await server('rapportini')).rapportini.find(r => r.descrizione === 'Sopralluogo cabina');
    assert.ok(rap && rap.idCommessa && rap.idProgetto, 'rapportino salvato con commessa e progetto nuovi: ' + JSON.stringify(rap && { c: rap.idCommessa, p: rap.idProgetto }));
    assert.equal(rap.progetto, propostoNuova, 'il server ha dato lo stesso codice proposto');
    passo('Commessa nuova + progetto nuovo dal rapportino: codice proposto (' + propostoNuova + ') e lo stesso sul server, rapportino sotto di lui');

    assert.deepEqual(errori, [], 'nessun errore JavaScript nella pagina');
    console.log('\n' + passi + ' passi, tutti a posto');
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* già chiuso */ }
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge lo tiene ancora */ }
  }
}

main().catch(e => { console.error('FALLITA:', e.stack || e.message || e); process.exit(1); });
