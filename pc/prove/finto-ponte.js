// Il ponte di Wisper Ufficio imitato in Node, per provare l'interfaccia in un
// browser qualsiasi senza compilare il programma.
//
//   Col server di prova (come il programma vero):
//     node server/src/avvio.js --prova --porta 8400 --dati <cartella temporanea>
//     node pc/prove/finto-ponte.js [porta] [--server http://localhost:8400]
//   Fuori casa, dalla porta Google (finto Google + server di prova: node pc/prove/porta-di-prova.js):
//     node pc/prove/finto-ponte.js [porta] --google http://127.0.0.1:8766/exec [--casa http://127.0.0.1:8767]
//     con le stesse regole del programma (porta-ufficio.js = Server.cs): senza --casa solo Google;
//     con --casa prima la prova di casa con la firma, poi Google.
//   Senza server, coi dati di esempio in memoria (quelli della visita guidata):
//     node pc/prove/finto-ponte.js [porta] --esempio
//   poi http://localhost:8790/ ed entra con manuel@esempio.it, laura@esempio.it,
//   marco@esempio.it o lettura@esempio.it, password "prova".
//   Col server di prova si entra anche col telefono, come nel programma (docs/gestionale/collega-qr.md): la pagina
//   mostra il QR (/locale/collega-qr, /locale/collega-qr-stato fatti qui come CollegaQr.cs) e il telefono, o chi fa
//   la sua parte (pc/prove/prova-flussi-collega.js), chiama autorizzaComputer sul server di prova. WISPER_NOME_PC: il
//   nome del computer nel QR (di base "UFFICIO-PC", un nome d'esempio).
//
// Fa quello che fa Ponte.cs: serve pc/ui, entra ed esce (/locale/accedi, /locale/esci)
// tenendo per sé la chiave d'accesso, gira /server/* al server con la chiave,
// serve /file/{id}. I PDF li stampa Edge senza finestra (lo stesso motore di
// WebView2) in pc/prove/stampe/; i file "salvati" finiscono lì; "scegli un file"
// restituisce sempre un'immagine di prova, perché qui una finestra di Windows non c'è.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chiudiEdge, togliCartella } = require('./edge-prova.js');
const aspettaMs = ms => new Promise(r => setTimeout(r, ms));

const argomenti = process.argv.slice(2);
const opzione = nome => { const i = argomenti.indexOf(nome); return i >= 0 ? argomenti[i + 1] : null; };
const PORTA = Number(argomenti.find(a => /^\d+$/.test(a)) || 8790);
const ESEMPIO = argomenti.includes('--esempio');
const SERVER = (opzione('--server') || process.env.SERVER || 'http://localhost:8400').replace(/\/+$/, '');
const GOOGLE = opzione('--google') || '';
const CASA = (opzione('--casa') || '').replace(/\/+$/, '');
const UI = path.join(__dirname, '..', 'ui');
const STAMPE = path.join(__dirname, 'stampe');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const daStampare = new Map();
const aggiornamento = () => process.env.AGGIORNAMENTO === 'pronto'
  ? { attivi: true, versione: '0.5.0', stato: 'pronto', nuova: '0.5.1', messaggio: 'La versione 0.5.1 è pronta: parte alla prossima apertura', controllato: '18:00' }
  : { attivi: true, versione: '0.5.0', stato: 'nessuno', nuova: null, messaggio: 'Hai l’ultima versione', controllato: '18:00' };

const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

// Un PNG 2x2 grigio: lo "scontrino" e la "firma" di prova.
const IMMAGINE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYGD4z8DAwMDEwMDAAAAZ8wMDp0gFgQAAAABJRU5ErkJggg==', 'base64');
// Fase 5: il documento di prova che "Scegli un file" restituisce (un PDF piccolo ma vero nei primi byte),
// o il file di WISPER_FILE. I file scelti si tengono qui (rif -> file): la pagina non vede mai il percorso.
const PDF_PROVA = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%% prova ' + Date.now() + '\n%%EOF\n');
const scelti = new Map();
// Fase 8: il CSV di prova di "Importa clienti e fornitori" (solo nomi e numeri di esempio).
const CSV_PROVA = ['Ragione sociale;P.IVA;Cod. destinatario;PEC;Città;Fax',
  'Verdi Impianti Snc;;ABC1234;verdi@pec.esempio.it;Thiene;0445 000001',
  'Officine Dal Santo Srl;;;dalsanto@pec.esempio.it;Schio;',
  'Rossi Impianti Srl;;XYZ9876;;Bassano del Grappa;',
  'Bianchi Elettro;12345678901;;;Marostica;',
  ';;;;Vicenza;'].join('\r\n') + '\r\n';
// Fase 7: quello che il programma aprirebbe fuori (WhatsApp, collegamenti), per la prova dei flussi.
const apertiFuori = [];
const RegoleCom = require('../ui/regole-comunicazioni.js');
// Entrare col telefono (collega-qr.md §6): le chiavi del QR in memoria, al massimo 2 vive, come CollegaQr.cs.
const crypto = require('node:crypto');
const RegoleColl = require('../ui/regole-collegamento.js');
const { decifraPacchetto } = require('../../server/src/azioni/collega.js');
const NOME_PC = process.env.WISPER_NOME_PC || 'UFFICIO-PC';
const chiaviQr = [];

// Chi è entrato. Come nel programma, la chiave resta qui: la pagina non la vede mai.
const sessione = { token: '', email: '', studio: '', esempio: null };
// Fase 8: niente nome vero del computer (si vede in Sicurezza e nelle schermate): un nome d'esempio.
const DISPOSITIVO = { disp: 'finto-ponte-prova', dispNome: 'PC dello studio (finto ponte)', app: 'ufficio prova' };
// La porta Google (--google): il collegamento con le regole di Server.cs, che tiene la chiave per sé.
const { Collegamento } = require('./porta-ufficio.js');
const COLL = GOOGLE ? new Collegamento(Object.assign({ casa: CASA, google: GOOGLE, log: x => console.log('[collegamento] ' + x) }, DISPOSITIVO)) : null;
const entrato = () => (COLL ? !!COLL.token : !!sessione.token);

// ----------------------------------------------------------------------------- dati di esempio
let Esempio = null;
if (ESEMPIO) {
  globalThis.WisperConti = require('../ui/conti.js');
  globalThis.WisperRegole = require('../ui/regole.js');
  Esempio = require('../ui/esempio.js');
}
const UTENTI_ESEMPIO = { 'manuel@esempio.it': 'manuel', 'laura@esempio.it': 'laura', 'marco@esempio.it': 'marco', 'lettura@esempio.it': 'lettura', 'commercialista@esempio.it': 'lettura' };

// ----------------------------------------------------------------------------- server vero
async function alServer(metodo, azione, parametri, corpo) {
  if (COLL) return metodo === 'GET' ? COLL.leggi(azione, Array.from(parametri)) : COLL.scrivi(azione, corpo ? JSON.parse(corpo) : {});
  const testa = { Accept: 'application/json' };
  if (sessione.token) testa.Authorization = 'Bearer ' + sessione.token;
  try {
    let r;
    if (metodo === 'GET') {
      const u = new URL(SERVER + '/exec');
      u.searchParams.set('azione', azione);
      for (const [k, v] of parametri) if (k !== 'azione') u.searchParams.set(k, v);
      for (const [k, v] of Object.entries(DISPOSITIVO)) u.searchParams.set(k, v);
      r = await fetch(u, { headers: testa });
    } else {
      const o = Object.assign(corpo ? JSON.parse(corpo) : {}, { azione }, DISPOSITIVO);
      r = await fetch(SERVER + '/exec', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, testa), body: JSON.stringify(o) });
    }
    const testo = await r.text();
    if (!testo.trim().startsWith('{')) return { ok: false, errore: 'Il server ha risposto ' + r.status, rete: true };
    const dati = JSON.parse(testo);
    // Accesso scaduto o revocato: la chiave non serve più.
    if (dati.accesso === false) sessione.token = '';
    return dati;
  } catch (e) {
    return { ok: false, errore: 'Il server non risponde', rete: true };
  }
}

/** Fase 5: un file in byte al server (POST /carica), con la chiave come il programma. */
async function alServerCarica(dati, q) {
  if (COLL) return COLL.token ? COLL.carica(dati, q) : { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false };
  if (!sessione.token) return { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false };
  const u = new URL(SERVER + '/carica');
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v);
  try {
    const r = await fetch(u, { method: 'POST', headers: { Authorization: 'Bearer ' + sessione.token, 'Content-Type': 'application/octet-stream', 'X-Wisper-Disp': DISPOSITIVO.disp, 'X-Wisper-App': DISPOSITIVO.app }, body: dati });
    const testo = await r.text();
    if (!testo.trim().startsWith('{')) return { ok: false, errore: 'Il server ha risposto ' + r.status, rete: true };
    const x = JSON.parse(testo);
    if (x.accesso === false) sessione.token = '';
    return x;
  } catch (e) {
    return { ok: false, errore: 'Il server non risponde', rete: true };
  }
}

// ----------------------------------------------------------------------------- entrare col telefono (QR)

/** Via le chiavi scadute: la precedente dopo 20 secondi, tutte dopo 2 minuti e 20 (come CollegaQr.cs). */
function pulisciQr() {
  const ora = Date.now();
  for (let i = chiaviQr.length - 1; i >= 0; i--) {
    const c = chiaviQr[i];
    if (ora - c.creata > 140000 || (c.sostituita && ora - c.sostituita > 20000)) chiaviQr.splice(i, 1);
  }
}

/** POST /locale/collega-qr: chiavi nuove; alla pagina solo il testo del QR. */
function nuovoQr() {
  pulisciQr();
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const id = crypto.randomBytes(16);
  chiaviQr.forEach(c => { if (!c.sostituita) c.sostituita = Date.now(); });
  while (chiaviQr.length > 1) chiaviQr.shift();
  chiaviQr.push({ id: id.toString('base64url'), idByte: id, ecdh, creata: Date.now(), sostituita: 0 });
  return RegoleColl.testoQr(id.toString('base64url'), ecdh.getPublicKey(null, 'compressed').toString('base64url'), NOME_PC);
}

/** attesaComputer al server di casa, 1,5 secondi al massimo, senza chiave: null se non risponde (come Server.cs). */
async function attesaComputer(id) {
  try {
    const r = await fetch(SERVER + '/exec', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ azione: 'attesaComputer', id }, DISPOSITIVO)), signal: AbortSignal.timeout(1500),
    });
    if (r.status !== 200) return null;
    const j = JSON.parse(await r.text());
    return j && j.ok === true ? j : null;
  } catch (e) {
    return null;
  }
}

/** GET /locale/collega-qr-stato: attesa, lontano, rifiutato o entrato (la chiave d'accesso resta qui). */
async function statoQr() {
  pulisciQr();
  const vive = chiaviQr.slice();
  if (!vive.length) return { ok: true, stato: 'attesa' };
  let risposte = 0;
  for (const c of vive) {
    const r = await attesaComputer(c.id);
    if (!r) continue;
    risposte++;
    if (r.stato === 'rifiutato') { chiaviQr.splice(chiaviQr.indexOf(c), 1); return { ok: true, stato: 'rifiutato' }; }
    if (r.stato !== 'pronto') continue;
    let p;
    try { p = JSON.parse(decifraPacchetto(c.ecdh.getPrivateKey(), c.idByte, r)); } catch (e) { console.log('[collega-qr] pacchetto non decifrato'); continue; }
    if (!p || p.ok !== true || !p.token) continue;
    sessione.token = p.token;
    sessione.email = String((p.utente && p.utente.email) || '');
    chiaviQr.length = 0;
    console.log('[collega-qr] entrato col telefono come ' + ((p.utente && p.utente.ruolo) || '?') + (p.google ? ' (con la porta Google)' : ''));
    return { ok: true, stato: 'entrato', utente: p.utente, permessi: p.permessi };
  }
  return { ok: true, stato: risposte ? 'attesa' : 'lontano' };
}

// ----------------------------------------------------------------------------- PDF
// 12/11/2026: con Edge 157 la stampa da riga di comando (--print-to-pdf) esce subito e il PDF non arriva, o arriva
// dopo più di un minuto. Si stampa da DevTools (Page.printToPDF), come fa WebView2 nel programma vero: un Edge senza
// finestra e un profilo nuovo per ogni stampa, chiusi alla fine (Browser.close, poi la cartella si toglie).
async function stampa(html, nome) {
  fs.mkdirSync(STAMPE, { recursive: true });
  const id = Math.random().toString(36).slice(2);
  daStampare.set(id, html);
  const pdf = path.join(STAMPE, nome.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');
  if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-stampa-'));
  // Porte a parte (10100-10399): le prove cliccate usano 9450-9989 per il loro Edge.
  const porta = 10100 + Math.floor(Math.random() * 300);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    let pagina = null;
    for (let i = 0; i < 100 && !pagina; i++) {
      await aspettaMs(200);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    if (!pagina) throw new Error('Edge non si è acceso per stampare');
    ws = new WebSocket(pagina.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('DevTools di Edge non risponde')); });
    let n = 0;
    let caricata = false;
    const attese = new Map();
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id); } else if (d.method === 'Page.loadEventFired') caricata = true;
    };
    const cdp = (method, params) => new Promise(ok => { const k = ++n; attese.set(k, ok); ws.send(JSON.stringify({ id: k, method, params: params || {} })); });
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: 'http://localhost:' + PORTA + '/stampa/' + id + '.html' });
    for (let i = 0; i < 300 && !caricata; i++) await aspettaMs(100);
    await cdp('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
    const r = await cdp('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    if (!r.result || !r.result.data) throw new Error('Edge non ha scritto il PDF');
    fs.writeFileSync(pdf, Buffer.from(r.result.data, 'base64'));
    return pdf;
  } finally {
    daStampare.delete(id);
    try { if (ws) ws.close(); } catch (e) { /* già chiuso */ }
    await chiudiEdge(porta, edge);
    togliCartella(profilo);
  }
}

// ----------------------------------------------------------------------------- /locale/*
async function locale(nome, o) {
  switch (nome) {
    case 'stato':
      if (COLL) return Object.assign({ ok: true, entrato: entrato(), server: CASA, studio: sessione.studio, email: sessione.email, cartellaPdf: STAMPE, versione: '0.5.0', aggiornamento: aggiornamento() }, COLL.stato());
      return { ok: true, entrato: !!(sessione.token || sessione.esempio), server: ESEMPIO ? 'esempio (in memoria)' : SERVER, studio: sessione.studio, email: sessione.email,
        cartellaPdf: STAMPE, versione: '0.5.0', aggiornamento: aggiornamento() };
    case 'accedi': {
      const email = String(o.email || '').trim().toLowerCase();
      if (ESEMPIO) {
        const chi = UTENTI_ESEMPIO[email];
        if (!chi || o.password !== 'prova') return { ok: false, errore: 'Email o password sbagliate.' };
        sessione.esempio = Esempio.crea({ chi });
        sessione.email = email;
        sessione.studio = sessione.esempio.ana.impostazioni.RAGIONE_SOCIALE;
        return { ok: true, utente: sessione.esempio.io, permessi: sessione.esempio.permessiIo };
      }
      if (COLL) {
        const r = await COLL.accedi(o.email, o.password);
        if (!r.ok) return r;
        sessione.email = email;
        return { ok: true, utente: r.utente, permessi: r.permessi };
      }
      const ris = await alServer('POST', 'accedi', null, JSON.stringify({ email: o.email, password: o.password }));
      if (!ris.ok) return ris;
      sessione.token = ris.token;
      sessione.email = email;
      // La pagina non riceve la chiave: solo chi è e cosa può fare.
      return { ok: true, utente: ris.utente, permessi: ris.permessi };
    }
    case 'esci':
      if (COLL) { if (COLL.token) await COLL.scrivi('esci', {}); COLL.token = ''; return { ok: true }; }
      if (!ESEMPIO && sessione.token) await alServer('POST', 'esci', null, '{}');
      sessione.token = '';
      sessione.esempio = null;
      return { ok: true };
    case 'aggiorna': return { ok: true, aggiornamento: aggiornamento() };
    // Il file .wisper dell'email: qui la finestra di Windows non c'è.
    case 'collega-file': return { ok: false, annullato: true };
    // Entrare col telefono: solo col server di prova (coi dati di esempio e dalla porta Google si entra con email e password).
    case 'collega-qr':
      if (ESEMPIO || COLL) return { ok: false, errore: 'In questa prova si entra con email e password' };
      if (sessione.token) return { ok: false, errore: 'Sei già entrato' };
      return { ok: true, testo: nuovoQr() };
    case 'collega-qr-stato':
      if (ESEMPIO || COLL) return { ok: true, stato: 'attesa' };
      return statoQr();
    case 'riavvia': console.log('[riavvia]'); return { ok: true };
    case 'cartella-pdf': return { ok: true };
    case 'apri': return { ok: true };
    case 'apri-documento': console.log(o.salva ? '[salva documento]' : '[apri documento]', o.nome); return { ok: true, percorso: path.join(STAMPE, String(o.nome || 'documento')) };
    // Fase 5: un collegamento si apre fuori (nel programma vero: il browser o Esplora file). Qui si scrive e basta.
    case 'apri-collegamento': console.log('[apri collegamento]', o.url); apertiFuori.push({ tipo: 'collegamento', url: String(o.url || '') }); return { ok: true };
    // Fase 7: il messaggio pronto per WhatsApp si apre nel browser del sistema (Ponte.cs, stesso controllo del link).
    // Qui si scrive e si tiene da parte: la prova dei flussi lo legge con /locale/aperti-fuori (solo nel finto ponte).
    case 'apri-whatsapp': {
      if (!RegoleCom.linkWhatsappValido(o.url)) return { ok: false, errore: 'Il messaggio per WhatsApp non è andato bene: riprova' };
      console.log('[apri whatsapp]', o.url);
      apertiFuori.push({ tipo: 'whatsapp', url: String(o.url) });
      return { ok: true };
    }
    case 'aperti-fuori': return { ok: true, aperti: apertiFuori.slice(-20) };
    case 'carica': {
      const f = scelti.get(String(o.rif || ''));
      if (!f) return { ok: false, errore: 'Il file scelto non c\'è più: sceglilo di nuovo' };
      return alServerCarica(f.dati, { nome: f.nome, mime: f.mime, idFile: o.idFile || '', per: o.per || 'documento' });
    }
    // Il promemoria: nel programma vero è una notifica di Windows.
    case 'notifica': console.log('[notifica]', o.titolo, '·', o.testo); return { ok: true };
    case 'scegli-file': {
      // Fase 8 (§7.2): "Importa clienti e fornitori" sceglie un CSV o un XLSX. Qui la finestra non c'è: il file di
      // WISPER_IMPORTA, o un CSV di prova con nomi di esempio (un doppione per partita IVA, una partita IVA sbagliata).
      if (o.filtro === 'importa') {
        if (process.env.WISPER_IMPORTA) return { ok: true, nome: path.basename(process.env.WISPER_IMPORTA), mime: 'text/csv', base64: fs.readFileSync(process.env.WISPER_IMPORTA).toString('base64') };
        return { ok: true, nome: 'clienti-fatture.csv', mime: 'text/csv', base64: Buffer.from(CSV_PROVA, 'utf8').toString('base64') };
      }
      // Fase 4: "Scegli i file" di Importa XML (più file insieme). Qui la finestra di Windows non c'è: si
      // restituiscono i file di WISPER_XML (percorsi separati da virgole), di base lo zip di ottobre degli esempi.
      if (o.filtro === 'fatture') {
        const percorsi = String(process.env.WISPER_XML || path.join(__dirname, '..', '..', 'server', 'prove', 'xml', 'fatture-ottobre.zip')).split(',').map(x => x.trim()).filter(Boolean);
        const file = percorsi.filter(p => fs.existsSync(p)).map(p => ({ nome: path.basename(p), base64: fs.readFileSync(p).toString('base64') }));
        return file.length ? { ok: true, file } : { ok: false, annullato: true };
      }
      // Fase 5: "percorso: true" = il programma tiene il file e restituisce solo il suo riferimento (rif).
      if (o.percorso) {
        const rif = 'rif' + Math.random().toString(36).slice(2);
        const f = o.filtro === 'immagini' ? { nome: 'Foto del guasto.png', mime: 'image/png', dati: IMMAGINE }
          : process.env.WISPER_FILE ? { nome: path.basename(process.env.WISPER_FILE), mime: 'application/octet-stream', dati: fs.readFileSync(process.env.WISPER_FILE) }
            : { nome: 'Verbale di prova.pdf', mime: 'application/pdf', dati: PDF_PROVA() };
        scelti.set(rif, f);
        return { ok: true, rif, nome: f.nome, mime: f.mime, byte: f.dati.length };
      }
      return { ok: true, nome: 'scontrino.png', mime: 'image/png', base64: IMMAGINE.toString('base64') };
    }
    case 'salva-file': {
      // Qui la finestra Salva di Windows non c'è: il file va nella cartella delle stampe.
      fs.mkdirSync(STAMPE, { recursive: true });
      const file = path.join(STAMPE, String(o.nome || 'esportazione.csv').replace(/[\\/:*?"<>|]+/g, '-'));
      fs.writeFileSync(file, o.base64 ? Buffer.from(o.base64, 'base64') : Buffer.from(String(o.testo || ''), 'utf8'));
      console.log('[salvato]', file);
      return { ok: true, percorso: file };
    }
    // Fase 8 (§7.1): il file di Esporta tutto (GET /esportazione/<id> col Bearer, come Server.cs), nella cartella delle stampe.
    case 'scarica-esportazione': {
      const id = String(o.id || '');
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return { ok: false, errore: 'Esportazione non trovata' };
      const nome = String(o.nome || 'wisper-tutto.zip').replace(/[\\/:*?"<>|]+/g, '-');
      fs.mkdirSync(STAMPE, { recursive: true });
      const file = path.join(STAMPE, /\.zip$/i.test(nome) ? nome : 'wisper-tutto.zip');
      if (ESEMPIO) { fs.writeFileSync(file, Buffer.from([0x50, 0x4b, 0x05, 0x06].concat(new Array(18).fill(0)))); return { ok: true, percorso: file }; }
      if (COLL) return { ok: false, errore: 'Il file con tutti i dati si scarica dalla rete di casa: riprova quando sei in ufficio', rete: true };
      const rr = await fetch(SERVER + '/esportazione/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + sessione.token } }).catch(() => null);
      if (!rr) return { ok: false, errore: 'Il server non risponde: controlla la rete e riprova', rete: true };
      if (rr.status === 401) { sessione.token = ''; return { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false }; }
      if (!rr.ok) return { ok: false, errore: rr.status === 403 ? 'Il file con tutti i dati lo scarica solo chi l\'ha chiesto' : 'Il file non c\'è più: preparane uno nuovo' };
      fs.writeFileSync(file, Buffer.from(await rr.arrayBuffer()));
      console.log('[esportazione]', file);
      return { ok: true, percorso: file };
    }
    case 'pdf': {
      const pdf = await stampa(o.html, o.nome);
      console.log('[pdf]', pdf);
      return { ok: true, percorso: pdf, nome: path.basename(pdf), base64: o.base64 ? fs.readFileSync(pdf).toString('base64') : null };
    }
    default: return null;
  }
}

http.createServer(async (rq, rs) => {
  const u = new URL(rq.url, 'http://localhost');
  const pezzi = [];
  for await (const p of rq) pezzi.push(p);
  const grezzo = Buffer.concat(pezzi);
  const corpo = grezzo.toString('utf8');
  const json = (o, s) => { rs.writeHead(s || 200, { 'Content-Type': 'application/json; charset=utf-8' }); rs.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  try {
    if (u.pathname.startsWith('/server/')) {
      const azione = u.pathname.slice(8);
      if (ESEMPIO) {
        if (!sessione.esempio) return json({ ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
        return json(Esempio.gestisci(sessione.esempio, rq.method, u.pathname + u.search, corpo ? JSON.parse(corpo) : {}));
      }
      if (!entrato()) return json({ ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
      const r = await alServer(rq.method, azione, u.searchParams, corpo);
      // La ragione sociale si ricorda: la pagina di accesso la mostra anche senza essere entrati (come Ponte.cs).
      if (azione === 'io' && r && r.ok && r.ragioneSociale) sessione.studio = r.ragioneSociale;
      return json(r, COLL && r && r.rete ? 502 : 200);
    }
    if (u.pathname.startsWith('/file/')) {
      if (ESEMPIO) { rs.writeHead(200, { 'Content-Type': 'image/png' }); return rs.end(IMMAGINE); }
      if (COLL) {
        const f = COLL.token ? await COLL.file(u.pathname.slice(6)) : { stato: 401, mime: 'text/plain', dati: Buffer.alloc(0) };
        rs.writeHead(f.stato, { 'Content-Type': f.mime });
        return rs.end(f.dati);
      }
      const r = await fetch(SERVER + u.pathname, { headers: { Authorization: 'Bearer ' + sessione.token } }).catch(() => null);
      if (!r || !r.ok) { rs.writeHead(r ? r.status : 502); return rs.end(); }
      rs.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream' });
      return rs.end(Buffer.from(await r.arrayBuffer()));
    }
    if (u.pathname.startsWith('/stampa/')) {
      const html = daStampare.get(path.basename(u.pathname, '.html'));
      rs.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
      return rs.end(html || '');
    }
    // Fase 5: un file trascinato sulla pagina arriva in byte e va al server così com'è.
    if (u.pathname === '/locale/carica-corpo') {
      if (ESEMPIO) return json({ ok: false, errore: 'Nei dati di esempio i file non si caricano' });
      return json(await alServerCarica(grezzo, { nome: u.searchParams.get('nome'), mime: u.searchParams.get('mime'), idFile: u.searchParams.get('idFile'), per: u.searchParams.get('per') || 'documento' }));
    }
    if (u.pathname.startsWith('/locale/')) {
      const ris = await locale(u.pathname.slice(8), corpo ? JSON.parse(corpo) : {});
      return ris ? json(ris) : json({ ok: false, errore: 'sconosciuto' }, 404);
    }
    const file = path.join(UI, u.pathname === '/' ? 'index.html' : path.normalize(decodeURIComponent(u.pathname)).replace(/^([\\/])+/, ''));
    if (!file.startsWith(UI) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { rs.writeHead(404); return rs.end('non trovato'); }
    rs.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(fs.readFileSync(file));
  } catch (e) {
    console.error(e);
    json({ ok: false, errore: 'finto ponte: ' + e.message }, 500);
  }
}).listen(PORTA, () => console.log('Finto ponte su http://localhost:' + PORTA + '/ -> ' + (ESEMPIO ? 'dati di esempio in memoria' : COLL ? 'porta Google' + (CASA ? ' (prima la prova di casa)' : ' (fuori casa)') : SERVER)));
