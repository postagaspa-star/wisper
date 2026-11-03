/*
 * Un elenco delle versioni finto, firmato con una CHIAVE DI PROVA (scritta qui sotto, pubblica di proposito: il server la
 * accetta solo con --prova, mai quella vera di wisper-keys), per provare il campanello degli aggiornamenti
 * (server/src/versioni.js) col server di prova e le app.
 *
 *   node server/strumenti/elenco-di-prova.js [--porta 8799] [--codice 10 --nome 1.1.0 --pc 1.1.0]
 *
 * Il server di prova va acceso con:
 *   WISPER_AGGIORNAMENTI_URL=http://127.0.0.1:8799/aggiornamento.json
 *   WISPER_VERSIONI_CHIAVE=MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1/jAm5XaKB4tW8SYqbMyvbLURcf3spZfJGMjwBBtif3e2KSVFQvhhN9T2lYW/bYiqh2FqnwBk8dhbIsPYm/9pA==
 *   WISPER_VERSIONI_MINUTI=0.1   (ogni 6 secondi)
 *   node server/src/avvio.js --prova --porta 8400 --dati <cartella>
 *
 * L'elenco si cambia senza riavviare: GET http://127.0.0.1:8799/cambia?codice=11&nome=1.1.1&pc=1.1.1. Entro
 * WISPER_VERSIONI_MINUTI il server lo legge, lo mette nelle risposte e sveglia i campanelli. Le app, ricevuto l'avviso,
 * scaricano dall'elenco VERO di GitHub (firma vera): con questo elenco si prova che l'avviso arriva, non l'installazione.
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const PRIVATA_DI_PROVA = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgxnPNQCDVaPP1LfocRh4L4iZRDqkLP3OnMMYVq6vRwnGhRANCAATX+MCbldooHi1bxJipszK9stRFx/eyll8kYyPAEG2J/d7YpJUVC+GE31PaVhb9tiKqHYWqfAGTx2Fsiw9ib/2k';
const PUBBLICA_DI_PROVA = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1/jAm5XaKB4tW8SYqbMyvbLURcf3spZfJGMjwBBtif3e2KSVFQvhhN9T2lYW/bYiqh2FqnwBk8dhbIsPYm/9pA==';

function elencoDiProva(codice, nome, pc) {
  const chiave = crypto.createPrivateKey({ key: Buffer.from(PRIVATA_DI_PROVA, 'base64'), format: 'der', type: 'pkcs8' });
  const testo = JSON.stringify({ creato: new Date().toISOString(), android: { codice: Number(codice), nome: String(nome) }, computer: { versione: String(pc) } });
  const firma = crypto.sign('sha256', Buffer.from(testo, 'utf8'), { key: chiave, dsaEncoding: 'der' });
  return { manifesto: testo, firma: firma.toString('base64') };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  let attuale = { codice: a.codice || 10, nome: a.nome || '1.1.0', pc: a.pc || '1.1.0' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/cambia') {
      attuale = { codice: url.searchParams.get('codice') || attuale.codice, nome: url.searchParams.get('nome') || attuale.nome, pc: url.searchParams.get('pc') || attuale.pc };
      console.log('elenco cambiato: telefono ' + attuale.nome + ' (' + attuale.codice + '), computer ' + attuale.pc);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(elencoDiProva(attuale.codice, attuale.nome, attuale.pc)));
  });
  server.listen(Number(a.porta || 8799), '127.0.0.1', () => {
    console.log('elenco di prova su http://127.0.0.1:' + server.address().port + '/aggiornamento.json (telefono ' + attuale.nome + ' (' + attuale.codice + '), computer ' + attuale.pc + ')');
    console.log('WISPER_VERSIONI_CHIAVE=' + PUBBLICA_DI_PROVA);
  });
}

module.exports = { elencoDiProva, PUBBLICA_DI_PROVA };
