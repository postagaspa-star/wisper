// La porta Google tutta sul computer, per provare Wisper Ufficio "fuori casa" senza Google vero e senza NAS:
//
//   finto Google (apps-script/prove/finto-google.js, con Porta.gs e il segreto)
//     ↑ il server di prova (server/src/avvio.js, dati di esempio) va a prendere il lavoro, come il NAS
//     ↑ davanti, un "rimbalzo" come quello di Google: la POST allo script risponde 302 verso un altro
//       indirizzo (come script.googleusercontent.com), da seguire con una GET
//   più una "casa" finta davanti al server di prova, che si può spegnere, fingere un altro apparecchio
//   (risponde a /salute senza saper fare la firma) o perdere una risposta per strada.
//
// Da riga di comando resta acceso finché non lo si chiude (Ctrl+C):
//   node pc/prove/porta-di-prova.js [--porta-google 8766] [--porta-casa 8767] [--porta-server 8768]
// e scrive gli indirizzi da dare a finto-ponte.js (--google, --casa) o a WisperUfficio.exe (--google, --server).
// Lo usano prova-flussi-porta.js e prova-porta-exe.js. Niente rete fuori dal computer: tutto su 127.0.0.1.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const SEGRETO = 'segreto-della-porta-di-prova-0123456789';
const dormi = ms => new Promise(r => setTimeout(r, ms));
const ascolta = (server, porta) => new Promise((ok, no) => {
  server.once('error', no);
  server.listen(porta || 0, '127.0.0.1', () => ok('http://127.0.0.1:' + server.address().port));
});
const chiudi = server => new Promise(r => { server.close(() => r()); if (server.closeAllConnections) server.closeAllConnections(); });

/**
 * Accende tutto. opzioni: portaGoogle, portaCasa, portaServer (di base porte libere a caso),
 * attesaNas (secondi della chiamata lunga del server, di base 3).
 */
async function avviaPorta(opzioni) {
  opzioni = opzioni || {};
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-porta-pc-'));
  // Le email del finto Google finiscono qui, non in apps-script/prove/posta-finta.
  process.env.WISPER_POSTA_FINTA = path.join(cartella, 'posta');
  fs.mkdirSync(process.env.WISPER_POSTA_FINTA, { recursive: true });
  const finto = require('../../apps-script/prove/finto-google.js');
  finto.proprieta.set('SEGRETO_SERVER', SEGRETO);

  // 1. Il finto Google, diretto (lo chiama il server, come il NAS).
  const google = finto.ascoltaHttp(0, { host: '127.0.0.1', parla: false });
  await new Promise(r => google.on('listening', r));
  const googleDiretto = 'http://127.0.0.1:' + google.address().port + '/exec';

  // 2. Il rimbalzo di Google per le app: POST /exec -> 302 -> GET su un altro indirizzo con la risposta.
  const conservate = new Map();
  const rimbalzi = { post: 0, get: 0, postSulRimbalzo: 0 };
  const eco = http.createServer((rq, rs) => {
    const u = new URL(rq.url, 'http://x');
    const k = u.searchParams.get('user_content_key') || '';
    // Google vero: forzare la POST sul rimbalzo non funziona (411/405). Le app devono seguirlo con una GET.
    if (rq.method !== 'GET') { rimbalzi.postSulRimbalzo++; rq.resume(); rs.writeHead(405, { 'Content-Type': 'text/html' }); return rs.end('<!DOCTYPE html><html><body>Metodo non consentito</body></html>'); }
    const r = conservate.get(k);
    conservate.delete(k);
    rimbalzi.get++;
    if (!r) { rs.writeHead(404, { 'Content-Type': 'text/html' }); return rs.end('<!DOCTYPE html><html><body>Non trovato</body></html>'); }
    rs.writeHead(200, { 'Content-Type': r.tipo });
    rs.end(r.testo);
  });
  const urlEco = await ascolta(eco, 0);
  const entrata = http.createServer(async (rq, rs) => {
    const pezzi = [];
    for await (const p of rq) pezzi.push(p);
    const u = new URL(rq.url, 'http://x');
    try {
      const r = await fetch(googleDiretto + u.search, { method: rq.method, headers: { 'Content-Type': rq.headers['content-type'] || 'text/plain' }, body: rq.method === 'GET' ? undefined : Buffer.concat(pezzi) });
      const testo = await r.text();
      if (r.status !== 200) { rs.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'text/html' }); return rs.end(testo); }
      const k = crypto.randomBytes(12).toString('hex');
      conservate.set(k, { testo, tipo: r.headers.get('content-type') || 'application/json' });
      setTimeout(() => conservate.delete(k), 60000).unref();
      if (rq.method === 'POST') rimbalzi.post++;
      rs.writeHead(302, { Location: urlEco + '/macros/echo?user_content_key=' + k });
      rs.end();
    } catch (e) {
      rs.writeHead(502, { 'Content-Type': 'text/html' });
      rs.end('<!DOCTYPE html><html><body>finto Google irraggiungibile</body></html>');
    }
  });
  const urlEntrata = await ascolta(entrata, opzioni.portaGoogle);

  // 3. Il server di prova con la porta Google accesa (va lui a prendere il lavoro, come il NAS).
  const { avvia } = require('../../server/src/avvio');
  const { wisper, server } = avvia({
    dati: path.join(cartella, 'server'), prova: true, pianifica: false, portaGoogle: true,
    env: { SEGRETO_SERVER: SEGRETO, WISPER_POSTINO_URL: googleDiretto, WISPER_PORTA_ATTESA: String(opzioni.attesaNas || 3) },
  });
  const urlServer = await ascolta(server, opzioni.portaServer);
  const fine = Date.now() + 15000;
  while (!(wisper.porta.ultimoContatto > 0)) {
    if (Date.now() > fine) throw new Error('il server di prova non si collega al finto Google');
    await dormi(50);
  }

  // 4. La casa finta: davanti al server di prova, con i suoi modi.
  //    passa = il server di casa vero; spento = la connessione cade subito; impostore = un altro apparecchio
  //    allo stesso indirizzo (risponde a /salute senza la firma giusta); perdiRisposta = la prossima richiesta
  //    (non /salute) arriva al server ma la risposta si perde per strada.
  const casa = { modo: 'passa', visti: [], perse: 0 };
  const proxy = http.createServer((rq, rs) => {
    const u = new URL(rq.url, 'http://x');
    casa.visti.push({ metodo: rq.method, percorso: u.pathname, conChiave: !!rq.headers.authorization, idRichiesta: null });
    if (casa.modo === 'spento') { rq.socket.destroy(); return; }
    if (casa.modo === 'impostore') {
      rq.resume();
      if (u.pathname === '/salute') { rs.writeHead(200, { 'Content-Type': 'application/json' }); return rs.end(JSON.stringify({ ok: true, versione: '9.9.9', firma: crypto.randomBytes(32).toString('hex') })); }
      rs.writeHead(404, { 'Content-Type': 'text/html' });
      return rs.end('<!DOCTYPE html><html><body>Pagina del router</body></html>');
    }
    const perdi = casa.modo === 'perdiRisposta' && u.pathname !== '/salute';
    if (perdi) casa.modo = 'passa';
    const pezzi = [];
    rq.on('data', p => pezzi.push(p));
    rq.on('end', () => {
      const corpo = Buffer.concat(pezzi);
      if (rq.method === 'POST' && u.pathname === '/exec') {
        try { casa.visti[casa.visti.length - 1].idRichiesta = JSON.parse(corpo.toString('utf8')).idRichiesta || null; } catch (e) { /* non JSON */ }
      }
      const intestazioni = Object.assign({}, rq.headers, { host: new URL(urlServer).host, 'content-length': String(corpo.length) });
      delete intestazioni['transfer-encoding'];
      const avanti = http.request(urlServer + rq.url, { method: rq.method, headers: intestazioni }, r => {
        const ritorno = [];
        r.on('data', p => ritorno.push(p));
        r.on('end', () => {
          if (perdi) { casa.perse++; rs.socket.destroy(); return; }
          rs.writeHead(r.statusCode, r.headers);
          rs.end(Buffer.concat(ritorno));
        });
      });
      avanti.on('error', () => rs.socket.destroy());
      avanti.end(corpo);
    });
  });
  const urlCasa = await ascolta(proxy, opzioni.portaCasa);

  return {
    google: urlEntrata + '/exec', googleDiretto, casa: urlCasa, server: urlServer, segreto: SEGRETO,
    wisper, finto, rimbalzi, statoCasa: casa, cartella,
    modoCasa(m) { casa.modo = m; },
    /** Il server del NAS smette di chiamare Google (spento, o senza internet). */
    async spegniNas() { await wisper.porta.ferma(); },
    accendiNas() { wisper.porta.avvia(); },
    /** Come se il NAS non si facesse vivo da ms millisecondi: lo script risponde "spento" subito. */
    nasMutoDa(ms) { finto.contesto.CacheService.getScriptCache().put('porta:nas', String(Date.now() - ms), 21600); },
    /** Quanto lo script fa aspettare un'app prima di "attesa" (di base 25 s). */
    attesaApp(ms) { if (ms) finto.proprieta.set('PORTA_ATTESA_MS', String(ms)); else finto.proprieta.delete('PORTA_ATTESA_MS'); },
    async ferma() {
      try { await wisper.porta.ferma(); } catch (e) { /* già fermo */ }
      await chiudi(proxy);
      await chiudi(entrata);
      await chiudi(eco);
      await chiudi(server);
      await finto.chiudiHttp(google);
      try { wisper.chiudi(); } catch (e) { /* già chiuso */ }
      try { fs.rmSync(cartella, { recursive: true, force: true }); } catch (e) { /* resta nella cartella temporanea */ }
    },
  };
}

module.exports = { avviaPorta, SEGRETO };

if (require.main === module) {
  const arg = process.argv.slice(2);
  const opz = n => { const i = arg.indexOf(n); return i >= 0 ? Number(arg[i + 1]) : 0; };
  avviaPorta({ portaGoogle: opz('--porta-google'), portaCasa: opz('--porta-casa'), portaServer: opz('--porta-server') }).then(p => {
    console.log('Porta Google di prova accesa (Ctrl+C per chiudere):');
    console.log('  Google (con rimbalzo 302): ' + p.google);
    console.log('  casa finta (davanti al server): ' + p.casa);
    console.log('  server di prova: ' + p.server + '  (utenti manuel@, laura@, marco@, lettura@esempio.it, password "prova")');
    console.log('  finto ponte fuori casa:  node pc/prove/finto-ponte.js 8799 --google ' + p.google);
    const esci = async () => { await p.ferma(); process.exit(0); };
    process.on('SIGINT', esci);
    process.on('SIGTERM', esci);
  }).catch(e => { console.error(e); process.exit(1); });
}
