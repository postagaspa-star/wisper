// I flussi della fase 7 (WhatsApp e comunicazioni, Portale clienti dalla parte dello studio) fatti con l'interfaccia vera,
// cliccando come una persona, contro il server di prova; dopo ogni passo si controlla col server che sia successo davvero.
// Edge senza finestra, profilo temporaneo (mai il browser di chi lavora).
//
//   node server/src/avvio.js --prova --porta 8470 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8795 --server http://localhost:8470
//   node pc/prove/prova-flussi-fase7.js --porta 8795 [--uscita <schermate>]
//
// Usa i dati di esempio del server così come nascono: va lanciata su un server appena acceso. Il finto ponte fa la parte
// del programma: "apri WhatsApp" non apre niente, si scrive e la prova lo legge (/locale/aperti-fuori); il ritorno della
// finestra in primo piano (Finestra.cs manda "attiva") qui è l'evento focus della pagina.
// Non chiama mai internet: l'indirizzo del portale di prova è sul computer (127.0.0.1:8479, dove non ascolta nessuno).
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8795));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const INDIRIZZO_PROVA = 'https://127.0.0.1:8479';
const aspetta = ms => new Promise(r => setTimeout(r, ms));
const K = require('../ui/regole-comunicazioni.js');

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi7-'));
  const porta = 9800 + Math.floor(Math.random() * 150);
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
      fs.writeFileSync(path.join(USCITA, 'flusso7-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem], [role=switch]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(testo)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t)) || tutti.find(x => pulito(x).indexOf(t) >= 0);
        if (!b) return 'non trovo il pulsante fra: ' + tutti.map(x => pulito(x) || x.getAttribute('aria-label')).filter(Boolean).slice(0, 50).join(' | ');
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
    const locale = async (nome, corpo) => valuta(`fetch('/locale/${nome}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo || {})}) }).then(r => r.json())`);
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
      for (let i = 0; i < 25 && !(await valuta("!!document.querySelector('.accesso')")); i++) await aspetta(200);
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      await aspetta(2800);
    };
    /** Il ritorno della finestra in primo piano (nel programma: Finestra.cs manda "attiva"). */
    const tornaAllaFinestra = async () => { await valuta("window.dispatchEvent(new Event('focus')); true"); await aspetta(900); };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");

    // ------------------------------------------------------------- 1. Manuel: il menu, la campanella, la Dashboard
    await entra('manuel@esempio.it');
    const vociManuel = await menu();
    const nomi = vociManuel.map(v => v.replace(/ \d+$/, ''));
    const iM = nomi.indexOf('Mezzi e attrezzature');
    assert.deepEqual(nomi.slice(iM, iM + 4), ['Mezzi e attrezzature', 'WhatsApp e comunicazioni', 'Portale clienti', 'Collaboratori esterni'], 'l\'ordine del menu: ' + nomi.join(', '));
    const campanella = await valuta("(() => { const b = document.getElementById('campanella'); return b && !b.classList.contains('nascosto') ? b.innerText : null; })()");
    assert.ok(campanella && /Notifiche/.test(campanella), 'la campanella in fondo al menu');
    const dash = await server('dashboard');
    assert.ok(dash.numeri && dash.numeri.portale && dash.numeri.comunicazioni, 'la Dashboard ha i numeri della fase 7');
    let testo = await testoPagina();
    assert.match(testo, /dal portale/, 'il riquadro Dal portale');
    assert.match(testo, /da mandare oggi/, 'il riquadro Da mandare oggi');
    const numPortale = K.numerino(dash.numeri, 'portale');
    if (numPortale) assert.ok(vociManuel.some(v => v === 'Portale clienti ' + numPortale), 'il numerino giallo di Portale clienti: ' + vociManuel.join(', '));
    await unGiallo('Dashboard');
    await foto('01-dashboard');
    passo('Manuel: menu nell\'ordine di §12, campanella, riquadri Dal portale e Da mandare oggi' + (numPortale ? ', numerino ' + numPortale + ' su Portale clienti' : ''));

    // ------------------------------------------------------------- 2. Portale clienti: la riga dello stato e Da guardare
    await vai('#portale');
    testo = await testoPagina();
    const st0 = (await server('portale')).stato;
    const s0 = K.statoPortale(st0);
    assert.ok(testo.indexOf('Portale') >= 0 && testo.indexOf(s0.parola) >= 0, 'la riga dello stato dice ' + s0.parola);
    assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(testo.replace(INDIRIZZO_PROVA, '')), 'niente indirizzi IP nella pagina');
    await unGiallo('Portale › Da guardare');
    await foto('02-portale');
    passo('Portale clienti: la riga dello stato (' + s0.parola + ') e Da guardare, senza IP');

    // ------------------------------------------------------------- 3. Se è Non collegato: Invita mostra Non collegato; poi l'indirizzo in Amministrazione
    const ana = await server('anagrafiche');
    const rossi = (ana.clienti || []).find(c => /Rossi Impianti/.test(c.nome));
    assert.ok(rossi, 'c\'è Rossi Impianti Srl nei dati di esempio');
    let refs = (ana.referenti || []).filter(r => r.idSoggetto === rossi.id);
    const conEmail = refs.find(r => r.email && !r.portale && r.statoPortale !== 'Attivo') || refs.find(r => r.email);
    assert.ok(conEmail, 'Rossi ha un referente con l\'email');
    // Un cliente senza portale, per "Apri il portale a un cliente" (l'elenco ha solo quelli senza).
    const senzaPortale = (ana.clienti || []).find(c => !c.portale && !c.archiviato && (ana.referenti || []).some(r => r.idSoggetto === c.id && r.email));
    if (st0.collegato === 'non_collegato' && senzaPortale) {
      await vai('#portale/clienti');
      await clicca('Apri il portale a un cliente', '#principale', 700);
      await valuta(`(() => { const s = [...document.querySelectorAll('.finestra select')].pop(); s.value = ${JSON.stringify(senzaPortale.id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await clicca('Avanti', '.finestra', 1500);
      testo = await testoFinestra();
      assert.match(testo, /Non collegato/, 'Invita un referente dice Non collegato');
      assert.match(testo, /Prima scegli come portare il portale su internet/);
      const gialli = await valuta("[...[...document.querySelectorAll('.velo .finestra')].pop().querySelectorAll('.btn.giallo')].length");
      assert.equal(gialli, 0, 'senza portale collegato niente Manda l\'invito');
      await foto('03-invita-non-collegato');
      await clicca('Annulla', '.finestra', 500);
      passo('Portale Non collegato: Invita un referente mostra la riga Non collegato al posto del giallo');
    }
    if (st0.collegato === 'non_collegato') {
      await vai('#amministrazione/portale');
      await scrivi('Indirizzo del portale', INDIRIZZO_PROVA, '#principale');
      await clicca('Salva', '#principale .scheda-indirizzo', 2500);
      const imp = (await server('anagrafiche')).impostazioni || {};
      assert.equal(imp.PORTALE_INDIRIZZO, INDIRIZZO_PROVA, 'l\'indirizzo del portale è salvato');
      const st1 = (await server('portale')).stato;
      assert.notEqual(st1.collegato, 'non_collegato', 'con l\'indirizzo non è più Non collegato');
      await foto('04-amm-portale');
      passo('Amministrazione › Portale clienti: indirizzo salvato (sul computer, niente internet), stato ' + K.statoPortale(st1).parola);
    }
    let st = (await server('portale')).stato;
    if (st.attivo === false) {
      await vai('#amministrazione/portale');
      await clicca('Portale acceso', '#principale', 1800);
      st = (await server('portale')).stato;
      assert.equal(st.attivo, true, 'il portale si accende da Amministrazione');
      passo('Portale acceso da Amministrazione › Portale clienti');
    }

    // ------------------------------------------------------------- 4. Invita Sig. Ferretti (o il referente di Rossi con l'email)
    await vai('#portale/cliente/' + encodeURIComponent(rossi.id));
    let pc = await server('portaleCliente?idCliente=' + encodeURIComponent(rossi.id));
    if (!pc.cliente.portale) {
      await clicca('Portale acceso', '#principale', 1800);
      pc = await server('portaleCliente?idCliente=' + encodeURIComponent(rossi.id));
      assert.equal(pc.cliente.portale, true, 'il portale acceso per Rossi');
    }
    // Chi invitare: un referente con l'email e senza accesso, di Rossi o di un altro cliente col portale acceso.
    let daInvitare = (pc.referenti || []).find(r => r.email && !r.portale);
    let cliInvito = rossi.id;
    if (!daInvitare) {
      const ana2 = await server('anagrafiche');
      const r0 = (ana2.referenti || []).find(r => r.email && !r.portale && (ana2.clienti || []).some(c => c.id === r.idSoggetto && c.portale));
      if (r0) { daInvitare = r0; cliInvito = r0.idSoggetto; await vai('#portale/cliente/' + encodeURIComponent(cliInvito)); }
    }
    if (daInvitare) {
      await clicca('Invita un referente', '#principale', 1500);
      await clicca(daInvitare.nome, '.finestra', 400);
      testo = await testoFinestra();
      assert.match(testo, new RegExp('L\'email d\'invito parte a ' + daInvitare.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(testo, /Accetta/);
      assert.match(testo, /Manda file/);
      await unGiallo('Invita un referente');
      await foto('05-invita');
      await clicca('Manda l\'invito', '.finestra', 2200);
      const pcInv = await server('portaleCliente?idCliente=' + encodeURIComponent(cliInvito));
      const inv = pcInv.referenti.find(r => r.id === daInvitare.id);
      assert.ok(inv && inv.portale, 'il referente ha l\'accesso');
      assert.ok(['Invitato', 'Attivo'].indexOf(inv.statoVisto) >= 0, 'stato del referente: ' + inv.statoVisto);
      assert.equal(inv.permessi.fatture, 0, 'di base le fatture a 0 (§3.6)');
      passo('Invita ' + daInvitare.nome + ': ' + inv.statoVisto + ', permessi di base (fatture a 0)');
      pc = await server('portaleCliente?idCliente=' + encodeURIComponent(rossi.id));
    }
    // L'accesso del referente: fatture a Vede, Salva.
    const conAccesso = (pc.referenti || []).find(r => r.portale);
    assert.ok(conAccesso, 'qualcuno di Rossi ha l\'accesso');
    await vai('#portale/cliente/' + encodeURIComponent(rossi.id));
    await valuta(`(() => { const r = [...document.querySelectorAll('#principale .riga')].find(x => x.textContent.indexOf(${JSON.stringify(conAccesso.nome)}) >= 0 && x.tagName === 'BUTTON'); r.click(); return true; })()`);
    await aspetta(800);
    testo = await testoFinestra();
    assert.match(testo, new RegExp('Accesso di ' + conAccesso.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await valuta("(() => { const r = [...[...document.querySelectorAll('.velo .finestra')].pop().querySelectorAll('.riga-int')].find(x => /Fatture/.test(x.textContent)); [...r.querySelectorAll('button')].find(b => b.textContent === 'Vede').click(); return true; })()");
    await aspetta(300);
    await unGiallo('Accesso del referente');
    await foto('06-accesso');
    await clicca('Salva', '.finestra', 1800);
    pc = await server('portaleCliente?idCliente=' + encodeURIComponent(rossi.id));
    assert.equal(pc.referenti.find(r => r.id === conAccesso.id).permessi.fatture, 1, 'fatture a Vede salvato');
    testo = await testoPagina();
    assert.match(testo, /Chi entra/i);
    assert.match(testo, /Cosa si pubblica da solo/i);
    assert.match(testo, /Pubblicati/i);
    assert.match(testo, /Arrivati dal cliente/i);
    assert.match(testo, /Accessi recenti/i);
    await foto('07-cliente-portale');
    passo('Accesso di ' + conAccesso.nome + ': fatture a Vede; la pagina del cliente a due colonne');

    // ------------------------------------------------------------- 5. Pubblica nel portale un preventivo mandato, poi Togli e Annulla
    // Il preventivo dice se è nel portale (§10.4): si guarda uno per uno quelli mandati di Rossi.
    let prev = null;
    for (const p of ((await server('preventivi')).preventivi || []).filter(x => x.idCliente === rossi.id && /INVIATO|ACCETTATO/i.test(x.stato))) {
      const pv = (await server('preventivo?id=' + p.id)).preventivo;
      if (pv && !(pv.portale && pv.portale.pubblicato)) { prev = pv; break; }
    }
    if (prev) {
      await vai('#preventivi/' + prev.id);
      await clicca('Altre azioni', '#principale .testata', 500);
      await clicca('Pubblica nel portale', '.menu', 1500);
      testo = await testoFinestra();
      assert.match(testo, /Lo vedrà|Nessun referente/);
      await unGiallo('Pubblica nel portale');
      await clicca('Pubblica', '.finestra', 2000);
      let pv = (await server('preventivo?id=' + prev.id)).preventivo;
      assert.ok(pv.portale && pv.portale.pubblicato, 'il preventivo è nel portale');
      await vai('#preventivi/' + prev.id);
      testo = await testoPagina();
      assert.match(testo, /Nel portale/, 'la pillola Nel portale');
      await foto('08-preventivo-portale');
      await clicca('Altre azioni', '#principale .testata', 500);
      await clicca('Togli dal portale', '.menu', 1500);
      pv = (await server('preventivo?id=' + prev.id)).preventivo;
      assert.ok(!(pv.portale && pv.portale.pubblicato), 'tolto dal portale');
      await clicca('Annulla', '#avvisi', 1500);
      pv = (await server('preventivo?id=' + prev.id)).preventivo;
      assert.ok(pv.portale && pv.portale.pubblicato, 'Annulla lo rimette');
      passo('Preventivo ' + (prev.numero || prev.id) + ': Pubblica nel portale, Togli dal portale, Annulla');
    }

    // ------------------------------------------------------------- 6. Un rapportino in bozza di Rossi: Fallo firmare nel portale
    const bozza = ((await server('rapportini')).rapportini || []).find(r => r.idCliente === rossi.id && r.stato === 'BOZZA' && !(r.portale && r.portale.pubblicato));
    if (bozza) {
      await valuta(`location.hash = '#rapportini/elenco'; true`);
      await aspetta(1500);
      // Tutti i mesi: la bozza può essere di un mese prima.
      await valuta("(() => { const s = document.querySelector('#principale .filtri select'); if (s) { s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); } return true; })()");
      await aspetta(600);
      await valuta(`(() => { const r = [...document.querySelectorAll('.tab .r.cliccabile')].find(x => x.dataset.chiave === ${JSON.stringify(bozza.id)}); if (r) r.click(); return !!r; })()`);
      await aspetta(700);
      await clicca('Altre azioni', '.pannello', 500);
      await clicca('Fallo firmare nel portale', '.menu', 1500);
      testo = await testoFinestra();
      assert.match(testo, /Da firmare nel portale/, 'già scelto Da firmare nel portale');
      await clicca('Pubblica', '.finestra', 2200);
      const rr = ((await server('rapportini')).rapportini || []).find(r => r.id === bozza.id);
      assert.ok(rr.portale && rr.portale.pubblicato && rr.portale.daFirmare, 'pubblicato da firmare');
      testo = await testoPannello('.pannello');
      assert.match(testo, /Da firmare nel portale/, 'la pillola nel pannello del rapportino');
      await foto('09-rapportino-da-firmare');
      passo('Rapportino ' + bozza.id + ': Fallo firmare nel portale (pillola Da firmare nel portale)');
    }

    // ------------------------------------------------------------- 7. WhatsApp: il sì, il messaggio preparato, wa.me fuori, L'hai mandato?
    refs = ((await server('anagrafiche')).referenti || []).filter(r => r.idSoggetto === rossi.id && K.numeroWhatsapp(r.whatsapp || r.telefono || '').valido);
    assert.ok(refs.length, 'un referente di Rossi col telefono');
    const wa = refs.find(r => !r.whatsappOk) || refs[0];
    const numero = K.numeroWhatsapp(wa.whatsapp || wa.telefono).numero;
    await vai('#clienti/' + encodeURIComponent(rossi.id));
    await clicca('Referenti', '#principale .segmenti', 700);
    await clicca('WhatsApp a ' + wa.nome, '#principale', 1500);
    testo = await testoFinestra();
    assert.match(testo, /Messaggio libero/);
    assert.ok(testo.indexOf(K.numeroVisto(numero)) >= 0, 'nome e numero prima di aprire WhatsApp: ' + K.numeroVisto(numero));
    await valuta("(() => { const t = [...document.querySelectorAll('.velo .finestra textarea')].pop(); t.value = 'Buongiorno, le confermo il sopralluogo di domani. Prova della fase 7.'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await unGiallo('Messaggio');
    await foto('10-messaggio');
    const prima = ((await locale('aperti-fuori')).aperti || []).length;
    await clicca('Apri WhatsApp', '.finestra', 1200);
    if (!wa.whatsappOk) {
      testo = await testoFinestra();
      assert.match(testo, /ha detto che si può scriverle su WhatsApp\?/, 'Ha detto di sì? prima di aprire WhatsApp');
      await unGiallo('Ha detto di sì?');
      await foto('11-ha-detto-si');
      await clicca('Sì, me l\'ha detto', '.finestra', 2200);
      const r2 = ((await server('anagrafiche')).referenti || []).find(r => r.id === wa.id);
      assert.equal(r2.whatsappOk, true, 'il sì a WhatsApp è segnato');
    }
    const aperti = (await locale('aperti-fuori')).aperti || [];
    assert.equal(aperti.length, prima + 1, 'WhatsApp aperto fuori (una volta)');
    const link = aperti[aperti.length - 1].url;
    assert.ok(K.linkWhatsappValido(link) && link.indexOf('https://wa.me/' + numero + '?text=') === 0, 'il link wa.me: ' + link);
    assert.ok(decodeURIComponent(link.split('?text=')[1]).indexOf('Prova della fase 7') >= 0, 'il testo del messaggio nel link');
    let com = ((await server('comunicazioni?idCliente=' + encodeURIComponent(rossi.id))).comunicazioni || []).find(c => c.canale === 'whatsapp' && /Prova della fase 7/.test(c.testo));
    assert.ok(com, 'il messaggio preparato è nello storico');
    assert.equal(com.stato, 'preparato');
    await tornaAllaFinestra();
    testo = await testoFinestra();
    assert.match(testo, /L'hai mandato\?/, 'al ritorno: L\'hai mandato?');
    assert.match(testo, new RegExp('Il messaggio a ' + wa.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await unGiallo('L\'hai mandato?');
    await foto('12-lhai-mandato');
    await clicca('Sì, l\'ho mandato', '.finestra', 1800);
    com = ((await server('comunicazioni?idCliente=' + encodeURIComponent(rossi.id))).comunicazioni || []).find(c => c.id === com.id);
    assert.equal(com.stato, 'mandato', 'segnato mandato');
    passo('WhatsApp a ' + wa.nome + ': ' + (wa.whatsappOk ? '' : 'Ha detto di sì, ') + 'preparato, wa.me aperto fuori (' + K.numeroVisto(numero) + '), L\'hai mandato? Sì: mandato');

    // ------------------------------------------------------------- 8. Storico: la riga e il pannello; Annota una telefonata
    await vai('#comunicazioni/storico');
    await valuta(`(() => { const r = document.querySelector('.tab .r[data-id="${com.id}"]'); if (r) r.click(); return !!r; })()`);
    await aspetta(700);
    testo = await testoPannello('.pannello-com');
    assert.match(testo, /Testo preparato/i, 'nel pannello WhatsApp dice Testo preparato');
    assert.match(testo, /Mandato/);
    await unGiallo('Storico col pannello');
    await foto('13-storico');
    await valuta("document.querySelector('.pannello-com [aria-label=\"Chiudi\"]').click(); true");
    await aspetta(400);
    await clicca('Altre azioni', '#principale .testata', 500);
    await clicca('Annota una telefonata', '.menu', 800);
    await valuta(`(() => { const s = [...document.querySelectorAll('.finestra select')].pop(); s.value = ${JSON.stringify(rossi.id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await aspetta(300);
    await scrivi('Cosa vi siete detti', 'Chiede di spostare il collaudo: prova della fase 7');
    await clicca('Salva', '.finestra', 1800);
    const tel = ((await server('comunicazioni?idCliente=' + encodeURIComponent(rossi.id))).comunicazioni || []).find(c => c.canale === 'telefonata' && /prova della fase 7/.test(c.testo));
    assert.ok(tel, 'la telefonata annotata è nello storico');
    passo('Storico: il pannello della comunicazione (Testo preparato, Mandato); Annota una telefonata');

    // ------------------------------------------------------------- 9. Modelli: un segnaposto sbagliato si ferma, un modello nuovo si salva
    await vai('#comunicazioni/modelli');
    testo = await testoPagina();
    assert.match(testo, /Promemoria appuntamento/, 'i modelli di Wisper');
    await clicca('Nuovo modello', '#principale', 800);
    await scrivi('Nome', 'Prova della fase 7');
    await scrivi('Testo', 'Buongiorno {nome}, {cleinte}');
    await clicca('Salva il modello', '.finestra', 900);
    testo = await testoFinestra();
    assert.match(testo, /Segnaposto sconosciuto: \{cleinte\}/, 'il segnaposto sbagliato si ferma prima del server');
    await scrivi('Testo', 'Buongiorno {nome}, le scrivo per {cliente}. {mittente}');
    testo = await testoFinestra();
    assert.match(testo, /Come arriva a Sig\. Ferretti/i);
    assert.match(testo, /Buongiorno Sig\. Ferretti, le scrivo per Rossi Impianti Srl/, 'l\'anteprima coi segnaposti riempiti');
    await unGiallo('Modello');
    await foto('14-modello');
    await clicca('Salva il modello', '.finestra', 1800);
    const mod = ((await server('modelliMessaggi')).modelli || []).find(m => m.nome === 'Prova della fase 7');
    assert.ok(mod, 'il modello nuovo è sul server');
    passo('Modelli: {cleinte} fermato, anteprima riempita, modello nuovo salvato');

    // ------------------------------------------------------------- 10. Da mandare: due colonne, il giallo della pagina col bordo
    await vai('#comunicazioni');
    const dm = await server('daMandare');
    const proposte = [].concat(dm.oggi || [], dm.domani || [], dm.proposti || []);
    testo = await testoPagina();
    assert.match(testo, /Oggi/i);
    assert.match(testo, /WhatsApp Business/);
    assert.match(testo, /Non collegato/, 'le righe Non collegato in fondo');
    if (proposte.length) {
      const aperta = await valuta("!!document.querySelector('.colonna-msg.destra .scheda-msg')");
      assert.ok(aperta, 'il messaggio scelto è già aperto a destra');
      const nuovo = await valuta("(() => { const b = [...document.querySelectorAll('[data-giallo-pagina]')][0]; return b ? b.classList.contains('giallo') : null; })()");
      assert.equal(nuovo, false, 'con la colonna aperta Nuovo messaggio ha il bordo');
    }
    await unGiallo('Da mandare');
    await foto('15-da-mandare');
    passo('Da mandare: ' + proposte.length + ' proposte' + (proposte.length ? ', la prima già aperta a destra, Nuovo messaggio col bordo' : '') + ', righe Non collegato');

    // ------------------------------------------------------------- 11. Da guardare: un file dal cliente (se c'è) si apre come pannello
    const dg = (await server('portale')).daGuardare || [];
    const fileDg = dg.find(x => x.tipo === 'caricamento');
    if (fileDg) {
      await vai('#portale');
      await valuta(`(() => { const c = document.querySelector('.carta-msg[data-dg="${fileDg.id}"] .testa-proposta'); if (c) c.click(); return !!c; })()`);
      await aspetta(1500);
      testo = await testoPannello('.pannello-file');
      assert.match(testo, /File dal cliente/);
      assert.match(testo, /Scarica/);
      await unGiallo('File dal cliente');
      await foto('16-file-cliente');
      // Accetta e archivia con la prima categoria: diventa un documento, esce da Da guardare.
      const conCategoria = await valuta("(() => { const c = [...document.querySelectorAll('.pannello-file .campo')].find(x => /Categoria/.test(x.querySelector('label').textContent)); const b = c && c.querySelector('.pillola'); if (b) b.click(); return !!b; })()");
      if (conCategoria) {
        await aspetta(300);
        await clicca('Accetta e archivia', '.pannello-file', 2200);
        const car = ((await server('caricamentiPortale')).caricamenti || []).find(x => String(x.id) === String(fileDg.collegamento.id));
        assert.equal(car.stato, 'accettato', 'il file è accettato');
        assert.ok(!((await server('portale')).daGuardare || []).some(x => x.id === fileDg.id), 'esce da Da guardare');
        passo('Da guardare: il file dal cliente come pannello, Accetta e archivia con la categoria: accettato, esce da Da guardare');
      } else passo('Da guardare: il file dal cliente come pannello (Scarica, Accetta e archivia)');
    }

    // ------------------------------------------------------------- 12. Notifiche: la pagina, Segna tutte lette
    await valuta("document.getElementById('campanella').click(); true");
    await aspetta(1500);
    testo = await testoPagina();
    assert.match(testo, /Notifiche|Nessuna notifica/);
    const nn = await server('notifiche');
    if (nn.nuove) {
      await clicca('Segna tutte lette', '#principale', 1500);
      assert.equal((await server('notifiche')).nuove, 0, 'tutte lette');
    }
    await unGiallo('Notifiche');
    passo('Notifiche dalla campanella' + (nn.nuove ? ': ' + nn.nuove + ' segnate lette' : ''));

    // ------------------------------------------------------------- 13. Marco (collaboratore): comunicazioni sì, portale no
    await entra('marco@esempio.it');
    const vociMarco = (await menu()).map(v => v.replace(/ \d+$/, ''));
    assert.ok(vociMarco.indexOf('WhatsApp e comunicazioni') >= 0 && vociMarco.indexOf('Portale clienti') < 0, 'menu di Marco: ' + vociMarco.join(', '));
    await vai('#portale');
    assert.match(await testoPagina(), /Non hai il permesso/);
    assert.equal((await server('portale')).permesso, false, 'il server rifiuta il portale a Marco');
    await vai('#comunicazioni');
    testo = await testoPagina();
    assert.match(testo, /Nuovo messaggio/, 'Marco scrive le sue comunicazioni');
    passo('Marco: WhatsApp e comunicazioni sì (le sue), Portale clienti no, anche dal server');

    // ------------------------------------------------------------- 14. Lettura: vede, niente gialli per scrivere
    await entra('lettura@esempio.it');
    const vociLett = (await menu()).map(v => v.replace(/ \d+$/, ''));
    assert.ok(vociLett.indexOf('WhatsApp e comunicazioni') >= 0 && vociLett.indexOf('Portale clienti') >= 0, 'lettura vede le due voci');
    for (const h of ['#comunicazioni/storico', '#portale/clienti', '#portale/cliente/' + encodeURIComponent(rossi.id)]) {
      await vai(h);
      const g = await valuta("[...document.querySelectorAll('#principale .btn.giallo, .pannello .btn.giallo')].filter(x => x.offsetParent !== null).length");
      assert.equal(g, 0, 'lettura: nessun giallo in ' + h);
    }
    assert.equal((await server('salvaPortaleCliente', { idCliente: rossi.id, portale: false })).ok, false, 'il server non lascia scrivere la lettura');
    passo('Lettura: vede storico e portale, nessun giallo, il server rifiuta le scritture');

    // ------------------------------------------------------------- 15. Manuel spegne il portale adesso
    await entra('manuel@esempio.it');
    await vai('#amministrazione/portale');
    await clicca('Spegni il portale adesso', '#principale', 1200);
    testo = await testoFinestra();
    assert.match(testo, /Il portale si spegne per tutti i clienti/, 'la conferma del server');
    await clicca('Spegni il portale', '.finestra', 2000);
    assert.equal((await server('portale')).stato.attivo, false, 'il portale è spento');
    await vai('#portale');
    assert.match(await testoPagina(), /Spento/, 'la riga dello stato dice Spento');
    await foto('17-spento');
    passo('Spegni il portale adesso: conferma, spento, la riga dello stato dice Spento');

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
