// Il ponte di Wisper Ufficio imitato in Node, per provare l'interfaccia in un
// browser qualsiasi senza compilare il programma.
//
//   Col server di prova (come il programma vero):
//     node server/src/avvio.js --prova --porta 8400 --dati <cartella temporanea>
//     node pc/prove/finto-ponte.js [porta] [--server http://localhost:8400]
//   Senza server, coi dati di esempio in memoria (quelli della visita guidata):
//     node pc/prove/finto-ponte.js [porta] --esempio
//   poi http://localhost:8790/ ed entra con manuel@esempio.it, laura@esempio.it,
//   marco@esempio.it o lettura@esempio.it, password "prova".
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
const { execFile } = require('node:child_process');

const argomenti = process.argv.slice(2);
const opzione = nome => { const i = argomenti.indexOf(nome); return i >= 0 ? argomenti[i + 1] : null; };
const PORTA = Number(argomenti.find(a => /^\d+$/.test(a)) || 8790);
const ESEMPIO = argomenti.includes('--esempio');
const SERVER = (opzione('--server') || process.env.SERVER || 'http://localhost:8400').replace(/\/+$/, '');
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

// Chi è entrato. Come nel programma, la chiave resta qui: la pagina non la vede mai.
const sessione = { token: '', email: '', studio: '', esempio: null };
const DISPOSITIVO = { disp: 'finto-ponte-' + os.hostname(), dispNome: os.hostname() + ' (finto ponte)', app: 'ufficio prova' };

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

// ----------------------------------------------------------------------------- PDF
function stampa(html, nome) {
  return new Promise((risolvi, rifiuta) => {
    fs.mkdirSync(STAMPE, { recursive: true });
    const id = Math.random().toString(36).slice(2);
    daStampare.set(id, html);
    const pdf = path.join(STAMPE, nome.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');
    if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
    // Un profilo a parte: senza, Edge passa la richiesta a quello gia' aperto ed esce subito.
    execFile(EDGE, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer',
      '--user-data-dir=' + path.join(os.tmpdir(), 'wisper-edge-stampa'), '--print-to-pdf=' + pdf,
      'http://localhost:' + PORTA + '/stampa/' + id + '.html'], { timeout: 60000 }, err => {
      // msedge.exe passa il lavoro a un processo figlio ed esce subito: si
      // aspetta che il PDF compaia, e che smetta di crescere.
      let attese = 0;
      let ultima = -1;
      const guarda = setInterval(() => {
        const dim = fs.existsSync(pdf) ? fs.statSync(pdf).size : -1;
        if (dim > 0 && dim === ultima) {
          clearInterval(guarda); daStampare.delete(id); risolvi(pdf);
        } else if (++attese > 120) {
          clearInterval(guarda); daStampare.delete(id); rifiuta(err || new Error('Edge non ha scritto il PDF'));
        }
        ultima = dim;
      }, 250);
    });
  });
}

// ----------------------------------------------------------------------------- /locale/*
async function locale(nome, o) {
  switch (nome) {
    case 'stato':
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
      const ris = await alServer('POST', 'accedi', null, JSON.stringify({ email: o.email, password: o.password }));
      if (!ris.ok) return ris;
      sessione.token = ris.token;
      sessione.email = email;
      // La pagina non riceve la chiave: solo chi è e cosa può fare.
      return { ok: true, utente: ris.utente, permessi: ris.permessi };
    }
    case 'esci':
      if (!ESEMPIO && sessione.token) await alServer('POST', 'esci', null, '{}');
      sessione.token = '';
      sessione.esempio = null;
      return { ok: true };
    case 'aggiorna': return { ok: true, aggiornamento: aggiornamento() };
    case 'riavvia': console.log('[riavvia]'); return { ok: true };
    case 'cartella-pdf': return { ok: true };
    case 'apri': return { ok: true };
    case 'apri-documento': console.log('[apri documento]', o.nome); return { ok: true };
    // Il promemoria: nel programma vero è una notifica di Windows.
    case 'notifica': console.log('[notifica]', o.titolo, '·', o.testo); return { ok: true };
    case 'scegli-file': return { ok: true, nome: 'scontrino.png', mime: 'image/png', base64: IMMAGINE.toString('base64') };
    case 'salva-file': {
      // Qui la finestra Salva di Windows non c'è: il file va nella cartella delle stampe.
      fs.mkdirSync(STAMPE, { recursive: true });
      const file = path.join(STAMPE, String(o.nome || 'esportazione.csv').replace(/[\\/:*?"<>|]+/g, '-'));
      fs.writeFileSync(file, o.base64 ? Buffer.from(o.base64, 'base64') : Buffer.from(String(o.testo || ''), 'utf8'));
      console.log('[salvato]', file);
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
  let corpo = '';
  for await (const p of rq) corpo += p;
  const json = (o, s) => { rs.writeHead(s || 200, { 'Content-Type': 'application/json; charset=utf-8' }); rs.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  try {
    if (u.pathname.startsWith('/server/')) {
      const azione = u.pathname.slice(8);
      if (ESEMPIO) {
        if (!sessione.esempio) return json({ ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
        return json(Esempio.gestisci(sessione.esempio, rq.method, u.pathname + u.search, corpo ? JSON.parse(corpo) : {}));
      }
      if (!sessione.token) return json({ ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
      return json(await alServer(rq.method, azione, u.searchParams, corpo));
    }
    if (u.pathname.startsWith('/file/')) {
      if (ESEMPIO) { rs.writeHead(200, { 'Content-Type': 'image/png' }); return rs.end(IMMAGINE); }
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
}).listen(PORTA, () => console.log('Finto ponte su http://localhost:' + PORTA + '/ -> ' + (ESEMPIO ? 'dati di esempio in memoria' : SERVER)));
