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
