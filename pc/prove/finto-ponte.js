// Il ponte di Wisper Ufficio imitato in Node, per provare l'interfaccia in un
// browser qualsiasi senza compilare il programma.
//
//   node apps-script/prove/finto-google.js        (il foglio finto, porta 8765)
//   node pc/prove/finto-ponte.js [porta]          (questo, porta 8790)
//   poi http://localhost:8790/
//
// Fa quello che fa Ponte.cs: serve pc/ui, gira /foglio/* allo script col codice,
// serve /file/{id}. I PDF li stampa Edge senza finestra (lo stesso motore di
// WebView2) in pc/prove/stampe/; "scegli un file" restituisce sempre un'immagine
// di prova, perche' qui una finestra di Windows non c'e'.
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');

const PORTA = Number(process.argv[2] || 8790);
const FOGLIO = process.env.FOGLIO || 'http://localhost:8765/exec';
const CODICE = process.env.CODICE || 'prova';
const UI = path.join(__dirname, '..', 'ui');
const STAMPE = path.join(__dirname, 'stampe');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const daStampare = new Map();
const aggiornamento = () => process.env.AGGIORNAMENTO === 'pronto'
  ? { attivi: true, versione: '0.3.0', stato: 'pronto', nuova: '0.3.1', messaggio: 'La versione 0.3.1 è pronta: parte alla prossima apertura', controllato: '18:00' }
  : { attivi: true, versione: '0.3.0', stato: 'nessuno', nuova: null, messaggio: 'Hai l’ultima versione', controllato: '18:00' };

const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

// Un PNG 2x2 grigio: lo "scontrino" e la "firma" di prova.
const IMMAGINE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYGD4z8DAwMDEwMDAAAAZ8wMDp0gFgQAAAABJRU5ErkJggg==', 'base64');

async function foglioGet(azione, parametri) {
  const u = new URL(FOGLIO);
  u.searchParams.set('codice', CODICE);
  u.searchParams.set('azione', azione);
  for (const [k, v] of parametri) if (k !== 'codice' && k !== 'azione') u.searchParams.set(k, v);
  return (await fetch(u)).text();
}

async function foglioPost(azione, corpo) {
  const o = corpo ? JSON.parse(corpo) : {};
  o.azione = azione;
  o.codice = CODICE;
  return (await fetch(FOGLIO, { method: 'POST', body: JSON.stringify(o) })).text();
}

function stampa(html, nome) {
  return new Promise((risolvi, rifiuta) => {
    fs.mkdirSync(STAMPE, { recursive: true });
    const id = Math.random().toString(36).slice(2);
    daStampare.set(id, html);
    const pdf = path.join(STAMPE, nome.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');
    if (fs.existsSync(pdf)) fs.unlinkSync(pdf);
    // Un profilo a parte: senza, Edge passa la richiesta a quello gia' aperto ed esce subito.
    execFile(EDGE, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer',
      '--user-data-dir=' + path.join(require('node:os').tmpdir(), 'wisper-edge-stampa'), '--print-to-pdf=' + pdf,
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

http.createServer(async (rq, rs) => {
  const u = new URL(rq.url, 'http://localhost');
  let corpo = '';
  for await (const p of rq) corpo += p;
  const json = (o, s) => { rs.writeHead(s || 200, { 'Content-Type': 'application/json; charset=utf-8' }); rs.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  try {
    if (u.pathname.startsWith('/foglio/')) {
      const azione = u.pathname.slice(8);
      return json(rq.method === 'GET' ? await foglioGet(azione, u.searchParams) : await foglioPost(azione, corpo));
    }
    if (u.pathname.startsWith('/file/')) {
      const r = JSON.parse(await foglioGet('file', new Map([['id', u.pathname.slice(6)]])));
      if (!r.ok) { rs.writeHead(404); return rs.end(); }
      rs.writeHead(200, { 'Content-Type': r.file.mime });
      return rs.end(Buffer.from(r.file.base64, 'base64'));
    }
    if (u.pathname.startsWith('/stampa/')) {
      const html = daStampare.get(path.basename(u.pathname, '.html'));
      rs.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
      return rs.end(html || '');
    }
    if (u.pathname.startsWith('/locale/')) {
      const o = corpo ? JSON.parse(corpo) : {};
      switch (u.pathname.slice(8)) {
        // AGGIORNAMENTO=pronto fa vedere il riquadro "Versione pronta" e il pulsante Riavvia.
        case 'stato': return json({ ok: true, configurato: true, codiceSalvato: true, codiceFine: CODICE.length >= 8 ? CODICE.slice(-4) : '', url: FOGLIO, cartellaPdf: STAMPE, versione: '0.3.0', aggiornamento: aggiornamento() });
        case 'aggiorna': return json({ ok: true, aggiornamento: aggiornamento() });
        case 'riavvia': console.log('[riavvia]'); return json({ ok: true });
        case 'configura': return json({ ok: true, configurato: true });
        case 'cartella-pdf': return json({ ok: true });
        case 'apri': return json({ ok: true });
        case 'scegli-file': return json({ ok: true, nome: 'scontrino.png', mime: 'image/png', base64: IMMAGINE.toString('base64') });
        case 'pdf': {
          const pdf = await stampa(o.html, o.nome);
          console.log('[pdf]', pdf);
          return json({ ok: true, percorso: pdf, nome: path.basename(pdf), base64: o.base64 ? fs.readFileSync(pdf).toString('base64') : null });
        }
        default: return json({ ok: false, errore: 'sconosciuto' }, 404);
      }
    }
    const file = path.join(UI, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^([\\/])+/, ''));
    if (!file.startsWith(UI) || !fs.existsSync(file)) { rs.writeHead(404); return rs.end('non trovato'); }
    rs.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(fs.readFileSync(file));
  } catch (e) {
    console.error(e);
    json({ ok: false, errore: 'finto ponte: ' + e.message }, 500);
  }
}).listen(PORTA, () => console.log('Finto ponte su http://localhost:' + PORTA + '/ -> ' + FOGLIO));
