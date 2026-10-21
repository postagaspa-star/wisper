// I flussi che scrivono, fatti con l'interfaccia vera (clic sui pulsanti) contro il
// server di prova, con Edge senza finestra e un profilo temporaneo.
//
//   node server/src/avvio.js --prova --porta 8400 --dati <cartella temporanea>
//   node pc/prove/finto-ponte.js 8791 --server http://localhost:8400
//   node pc/prove/prova-flussi.js --porta 8791 [--uscita <schermate>]
//
// Ogni passo clicca come una persona e poi controlla col server che sia successo davvero.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8791));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));
// Il server di prova tiene i dati finché resta acceso: nomi, partita IVA ed email nuovi a ogni giro.
const GIRO = Date.now().toString(36).slice(-4).toUpperCase();
const NOME = 'Verdi Automazioni ' + GIRO + ' Srl';
function partitaIva() {
  const dieci = String(Math.floor(Math.random() * 9e9) + 1e9);
  for (let c = 0; c <= 9; c++) {
    const s = dieci + c;
    let somma = 0;
    for (let i = 0; i < 11; i++) { let x = s.charCodeAt(i) - 48; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; } somma += x; }
    if (somma % 10 === 0) return s;
  }
  return partitaIva();
}
const IVA = partitaIva();
const EMAIL = 'giorgio.' + GIRO.toLowerCase() + '@esempio.it';

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi-'));
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
      if (r.result && r.result.exceptionDetails) throw new Error(espr.slice(0, 120) + '\n' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result.result.value;
    };
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'flusso-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    // Un pulsante dal suo testo (dentro "dove", di base tutta la pagina) e il clic.
    const clicca = async (testo, dove) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `document.querySelector(${JSON.stringify(dove)})` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const b = [...radice.querySelectorAll('button, a.btn, [role=button], .riga, [role=menuitem]')].filter(x => x.offsetParent !== null || x.closest('.menu'))
          .find(x => x.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(testo)}) ||
          [...radice.querySelectorAll('button, [role=menuitem]')].find(x => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(testo)}));
        if (!b) return 'non trovo il pulsante';
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "' + testo + '": ' + ok);
      await aspetta(700);
    };
    const scrivi = async (etichetta, valore, dove) => {
      const ok = await valuta(`(() => {
        const radice = document.querySelector(${JSON.stringify(dove || '.finestra')});
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
    const server = async (azione, corpo) => valuta(corpo
      ? `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`
      : `fetch('/server/${azione}').then(r => r.json())`);
    const vai = async hash => { await valuta(`location.hash = '${hash}'; true`); await aspetta(900); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoAvvisi = () => valuta("document.querySelector('#avvisi').innerText");
    const passo = msg => { passi++; console.log('ok  ' + msg); };

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(300);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");
    await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
    await cdp('Page.navigate', { url: BASE + '/?g=1#dashboard' });
    await aspetta(1200);

    // ------------------------------------------------------------ accesso
    await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = 'manuel@esempio.it'; f.querySelector('input[type=password]').value = 'sbagliata'; f.requestSubmit(); return true; })()`);
    await aspetta(1200);
    assert.match(await valuta("document.querySelector('.avviso-errore') ? document.querySelector('.avviso-errore').textContent : ''"), /Email o password sbagliate/);
    assert.equal(await valuta("document.querySelector('.accesso input[type=email]').value"), 'manuel@esempio.it', 'l\'email resta scritta');
    passo('accesso: password sbagliata, riquadro rosso, email rimasta');
    await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
    await aspetta(2500);
    assert.match(await valuta("document.querySelector('h1').textContent"), /Manuel/);
    passo('accesso: entrato, Dashboard');
    // Si parte dai permessi di base (un giro interrotto può averli lasciati cambiati).
    await server('salvaPermessi', { permessi: { collaboratore: { fatturazione: 0 } } });

    // ------------------------------------------------------------ clienti e fornitori
    await vai('#clienti');
    await clicca('Nuovo cliente');
    await scrivi('Nome o ragione sociale', 'rossi impianti');
    await clicca('Crea', '.finestra');
    assert.match(await valuta("document.querySelector('.doppione') ? document.querySelector('.doppione').textContent : ''"), /C'è già Rossi Impianti Srl/);
    assert.equal(await valuta("[...document.querySelectorAll('.finestra .btn.giallo')].some(b => b.textContent === 'Crea')"), false, 'col doppione Crea non c\'è');
    passo('cliente: il doppione si dice prima di salvare, con Apri');
    await scrivi('Nome o ragione sociale', NOME);
    await scrivi('Partita IVA', '0123456789');
    await scrivi('CAP', '3601');
    await clicca('Crea', '.finestra').catch(async () => { /* col doppione sparito il pulsante torna al prossimo disegno */ });
    let testo = await valuta("document.querySelector('.finestra').innerText");
    if (!/La partita IVA ha 11 cifre/.test(testo)) { await clicca('Crea', '.finestra'); testo = await valuta("document.querySelector('.finestra').innerText"); }
    assert.match(testo, /La partita IVA ha 11 cifre/);
    assert.match(testo, /Il CAP ha 5 cifre/);
    passo('cliente: errori sotto i campi (partita IVA, CAP)');
    await scrivi('Partita IVA', IVA);
    await scrivi('CAP', '36016');
    await scrivi('Città', 'Thiene');
    await scrivi('Provincia', 'vi');
    await scrivi('Codice SDI', 'abc1234');
    await clicca('Crea', '.finestra');
    await aspetta(800);
    const nuovo = (await server('anagrafiche?archiviati=1')).clienti.find(c => c.nome === NOME);
    assert.ok(nuovo, 'il cliente è sul server');
    assert.equal(nuovo.codiceSdi, 'ABC1234');
    assert.equal(nuovo.provincia, 'VI');
    assert.match(await valuta('location.hash'), new RegExp('#clienti/' + nuovo.id));
    await foto('cliente-nuovo');
    passo('cliente: creato ' + nuovo.id + ', si apre la sua scheda');

    await clicca('Referenti · 0');
    await clicca('Aggiungi un referente');
    await scrivi('Nome', 'Anna Verdi');
    await scrivi('Ruolo', 'Acquisti');
    await scrivi('Telefono', '0445 000 222');
    await clicca('Salva', '.finestra');
    assert.ok((await server('anagrafiche')).referenti.some(r => r.nome === 'Anna Verdi' && r.idSoggetto === nuovo.id));
    assert.match(await testoPagina(), /Anna Verdi/);
    passo('referente aggiunto');
    await clicca('Sedi e impianti · 0');
    await clicca('Aggiungi una sede o un impianto');
    await clicca('Impianto', '.finestra');
    await scrivi('Nome', 'Linea di confezionamento');
    await scrivi('Città', 'Thiene');
    await clicca('Salva', '.finestra');
    const sede = (await server('anagrafiche')).sedi.find(s => s.nome === 'Linea di confezionamento');
    assert.ok(sede && sede.tipo === 'impianto');
    passo('impianto aggiunto');

    await valuta("document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Archivia', '.menu');
    await clicca('Archivia', '.finestra');
    await aspetta(800);
    const arch = (await server('anagrafiche?archiviati=1')).clienti.find(c => c.id === nuovo.id);
    if (!arch || arch.archiviato !== true) console.log('DEBUG', JSON.stringify(arch && { id: arch.id, archiviato: arch.archiviato }), await testoAvvisi(), await valuta("document.querySelectorAll('.velo').length"));
    assert.equal(arch.archiviato, true);
    assert.match(await testoAvvisi(), /archiviato/);
    await clicca('Annulla', '#avvisi .avviso:last-child');
    await aspetta(800);
    assert.equal((await server('anagrafiche?archiviati=1')).clienti.find(c => c.id === nuovo.id).archiviato, false, 'Annulla ripristina');
    passo('archivia con conferma, poi Annulla dall\'avviso');

    // ------------------------------------------------------------ commesse e prestazioni
    await vai('#commesse/26ST002');
    testo = await testoPagina();
    await clicca(/Prestazioni · (\d+)/.exec(testo)[0]);
    const prima = (await server('anagrafiche')).prestazioni.filter(p => p.idCommessa === '26ST002');
    await clicca('Aggiungi una prestazione');
    await scrivi('Nome', 'Collaudo ' + GIRO);
    await scrivi('Valore', '450');
    await valuta("document.querySelector('.finestra button[aria-label=\"Più 5%\"]').click(); true");
    await aspetta(200);
    await clicca('Salva', '.finestra');
    let ps = (await server('anagrafiche')).prestazioni.filter(p => p.idCommessa === '26ST002');
    const coll = ps.find(p => p.nome === 'Collaudo ' + GIRO);
    assert.ok(coll && coll.valore === 450 && coll.avanzamento === 5 && coll.stato === 'in_corso', JSON.stringify(coll));
    passo('prestazione aggiunta (450 €, 5%)');
    await valuta(`[...document.querySelectorAll('.prestazione')].find(x => x.textContent.includes('Collaudo ${GIRO}')).querySelector('.basso button').click(); true`);
    await aspetta(900);
    assert.equal((await server('anagrafiche')).prestazioni.find(p => p.id === coll.id).avanzamento, 15, '+10%');
    passo('+10% → 15%');
    await valuta(`[...[...document.querySelectorAll('.prestazione')].find(x => x.textContent.includes('Collaudo ${GIRO}')).querySelectorAll('.basso button')].find(b => b.textContent === 'Segna fatta').click(); true`);
    await aspetta(900);
    ps = (await server('anagrafiche')).prestazioni.filter(p => p.idCommessa === '26ST002');
    assert.equal(ps.find(p => p.id === coll.id).stato, 'fatta');
    await clicca('Annulla', '#avvisi .avviso:last-child');
    await aspetta(900);
    assert.equal((await server('anagrafiche')).prestazioni.find(p => p.id === coll.id).avanzamento, 15, 'Annulla rimette 15%');
    passo('Segna fatta, poi Annulla');
    // L'ordine trascinando: l'ultima in cima (gli eventi di trascinamento del browser, uno dopo l'altro).
    await valuta(`(() => {
      const righe = [...document.querySelectorAll('.prestazione')];
      const da = righe[righe.length - 1], a = righe[0];
      const dt = new DataTransfer();
      da.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const r = a.getBoundingClientRect();
      a.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + 2 }));
      a.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + 2 }));
      da.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return true;
    })()`);
    await aspetta(1200);
    ps = (await server('anagrafiche')).prestazioni.filter(p => p.idCommessa === '26ST002').sort((x, y) => x.ordine - y.ordine);
    assert.equal(ps[0].id, coll.id, 'la prestazione nuova è in cima');
    await foto('prestazioni');
    passo('ordine trascinando: l\'ultima prestazione è andata in cima (salvato sul server)');
    assert.ok(prima.length + 1 === ps.length);

    await valuta("document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Duplica', '.menu');
    await aspetta(1000);
    const hashCopia = await valuta('location.hash');
    assert.match(hashCopia, /#commesse\/26ST\d{3}/);
    assert.notEqual(hashCopia, '#commesse/26ST002');
    const idCopia = decodeURIComponent(hashCopia.split('/')[1]);
    const copia = (await server('anagrafiche?archiviati=1')).commesse.find(m => m.id === idCopia);
    assert.match(copia.descrizione, /\(copia\)$/);
    passo('Duplica: nuova commessa ' + idCopia);
    await valuta("document.querySelector('.testata .tondo[aria-label=\"Altre azioni\"]').click(); true");
    await aspetta(300);
    await clicca('Archivia', '.menu');
    await clicca('Archivia', '.finestra');
    await aspetta(800);
    assert.equal((await server('anagrafiche?archiviati=1')).commesse.find(m => m.id === idCopia).archiviata, true);
    await vai('#commesse');
    await clicca('Archivio');
    assert.match(await testoPagina(), new RegExp(idCopia));
    passo('Archivia la copia: compare in Archivio');

    // Modifica della commessa: responsabile, sede, persone.
    await vai('#commesse/26ST002');
    await clicca('Modifica');
    await valuta(`(() => { const s = [...document.querySelectorAll('.finestra .campo')].find(c => c.querySelector('label').textContent === 'Responsabile').querySelector('select'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); return s.value; })()`);
    // Marco fra le persone (la pillola si accende e si spegne: si tocca solo se è spenta).
    await valuta("(() => { const b = [...document.querySelectorAll('.finestra .pillola')].find(x => x.textContent === 'Marco Collaboratore'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); return true; })()");
    await clicca('Salva', '.finestra');
    await aspetta(800);
    const m2 = (await server('anagrafiche')).commesse.find(m => m.id === '26ST002');
    assert.ok(m2.responsabileId, 'responsabile scelto');
    assert.ok(m2.persone.includes(3), 'Marco tra le persone');
    passo('Modifica commessa: responsabile e persone salvati');

    // ------------------------------------------------------------ amministrazione
    await vai('#amministrazione/utenti');
    await clicca('Nuovo utente');
    await scrivi('Nome', 'Giorgio Prova');
    await scrivi('Email', EMAIL);
    await clicca('Lettura', '.finestra');
    await clicca('Crea l\'utente', '.finestra');
    await aspetta(800);
    const pw = await valuta("document.querySelector('.scatola-password code') ? document.querySelector('.scatola-password code').textContent : ''");
    assert.match(pw, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await foto('password-iniziale');
    await clicca('Fatto', '.finestra');
    const giorgio = (await server('utenti')).utenti.find(u => u.email === EMAIL);
    assert.equal(giorgio.ruolo, 'lettura');
    passo('Nuovo utente con la password iniziale del server (' + pw.replace(/./g, '•') + ')');
    // La password iniziale funziona davvero.
    const prova = await fetch('http://localhost:8400/exec', { method: 'POST', body: JSON.stringify({ azione: 'accedi', email: EMAIL, password: pw }) }).then(r => r.json());
    assert.equal(prova.ok, true, 'Giorgio entra con la password iniziale');
    passo('la password iniziale vale per entrare');
    await vai('#amministrazione/utenti/' + giorgio.id);
    await clicca('Collaboratore');
    assert.match(await valuta("document.querySelector('.finestra').innerText"), /Non vedrà: Fatturazione, Amministrazione/);
    await clicca('Cambia il ruolo', '.finestra');
    await aspetta(800);
    assert.equal((await server('utenti')).utenti.find(u => u.id === giorgio.id).ruolo, 'collaboratore');
    passo('cambio ruolo con la conferma che dice cosa vedrà');
    await clicca('Nuova password', '.scheda.righe');
    await clicca('Fai la password', '.finestra');
    await aspetta(800);
    assert.match(await valuta("document.querySelector('.scatola-password code').textContent"), /^[A-Z2-9]{4}-/);
    await clicca('Fatto', '.finestra');
    passo('Nuova password');
    await clicca('Disattiva', '.scheda.righe');
    await clicca('Disattiva', '.finestra');
    await aspetta(800);
    assert.equal((await server('utenti')).utenti.find(u => u.id === giorgio.id).attivo, false);
    passo('Disattiva');
    await vai('#amministrazione/utenti/1');
    assert.match(await testoPagina(), /È l'ultimo titolare/);
    assert.equal(await valuta("[...document.querySelectorAll('.scelta-ruolo')].every(b => b.disabled)"), true, 'il ruolo del titolare non si cambia');
    passo('l\'ultimo titolare: ruolo bloccato e la riga che dice perché');

    await vai('#amministrazione/permessi');
    await valuta(`(() => { const r = [...document.querySelectorAll('.riga-perm')].find(x => x.textContent.includes('Fatturazione')); r.querySelector('.l1').click(); return true; })()`);
    await aspetta(900);
    assert.equal((await server('permessi')).permessi.collaboratore.fatturazione, 1);
    assert.match(await testoAvvisi(), /Permesso cambiato: vale da subito/);
    await clicca('Annulla', '#avvisi .avviso:last-child');
    await aspetta(900);
    assert.equal((await server('permessi')).permessi.collaboratore.fatturazione, 0, 'Annulla rimette Niente');
    passo('permesso cambiato (vale da subito) e Annulla');

    await vai('#amministrazione/numerazioni');
    await clicca('Modifica');
    await valuta(`(() => { const p = [...document.querySelectorAll('.finestra .pezzo')].find(x => x.textContent.includes('Numero')); p.querySelector('button[aria-label="Una cifra in più"]').click(); return true; })()`);
    await aspetta(300);
    assert.match(await valuta("document.querySelector('.anteprima-numero .codice').textContent"), /^\d{2}ST\d{4}$/);
    await clicca('Salva', '.finestra');
    await aspetta(800);
    const num = (await server('numerazioni')).numerazioni.find(x => x.tipo === 'commessa');
    assert.equal(num.formato, '{AA}ST{NNNN}');
    passo('numerazione: una cifra in più, anteprima ' + num.prossimo);
    await server('salvaNumerazione', { tipo: 'commessa', formato: '{AA}ST{NNN}' });

    await vai('#amministrazione/registro');
    testo = await testoPagina();
    assert.ok(testo.includes('Manuel ha creato il cliente ' + NOME), 'la frase della creazione');
    assert.match(testo, /Manuel ha cambiato il permesso di Collaboratore su Fatturazione/);
    await foto('registro');
    await clicca('Esporta per Excel');
    await aspetta(1000);
    assert.match(await testoAvvisi(), /Salvato in/);
    passo('registro: frasi leggibili, Esporta per Excel salvato');

    await vai('#amministrazione/copie');
    await clicca('Fai una copia adesso');
    await aspetta(1500);
    assert.match(await testoPagina(), /Ultima copia/i);
    assert.ok((await server('copie')).copie.length >= 1);
    passo('copia fatta adesso');

    // ------------------------------------------------------------ accesso scaduto
    const mie = (await server('sessioni?idUtente=1')).sessioni.filter(s => s.questa);
    await server('revocaSessione', { id: mie[0].id });
    await vai('#clienti');
    await aspetta(500);
    await valuta("document.querySelector('#stato-server').click(); true");
    await aspetta(1500);
    assert.match(await valuta("document.querySelector('.avviso-calmo') ? document.querySelector('.avviso-calmo').textContent : ''"), /Sei uscito da questo dispositivo: entra di nuovo/);
    await foto('uscito');
    passo('dispositivo scollegato: si torna all\'accesso col riquadro grigio');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('TUTTO BENE (' + passi + ' passi)');
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge tiene ancora un file */ }
  }
}

main().catch(e => { console.error('NO: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
