/*
 * Il foglio intero in Excel, preso dal NAS col postino (Ponte.gs, postinoEsporta): lo stesso file di
 * File > Scarica > Microsoft Excel, che importa.js legge la sera del cambio. Nessuno deve scaricarlo a mano.
 *
 *   node server/strumenti/scarica-foglio.js --uscita <copia.xlsx>
 *
 * Usa WISPER_POSTINO_URL, il segreto (WISPER_POSTINO_SEGRETO o SEGRETO_SERVER) e WISPER_INVITO_SCRIPT del .env:
 * nel contenitore, docker compose -p wisper exec wisper node strumenti/scarica-foglio.js --uscita /data/foglio.xlsx
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Postino } = require('../src/postino');

/** Scarica e scrive il file; torna {nome, byte, uscita}. Il file c'e' solo se e' arrivato intero. */
async function scaricaFoglio(o) {
  if (!o.uscita) throw new Error('Si usa: node server/strumenti/scarica-foglio.js --uscita <copia.xlsx>');
  const r = await o.postino.chiama('postinoEsporta', {});
  const dati = Buffer.from(String(r.base64 || ''), 'base64');
  if (!dati.length || dati.length !== r.byte) throw new Error('Il foglio non è arrivato intero: riprova');
  // Un .xlsx e' uno zip: comincia con "PK".
  if (dati[0] !== 0x50 || dati[1] !== 0x4b) throw new Error('Quello che è arrivato non è un file Excel');
  fs.mkdirSync(path.dirname(path.resolve(o.uscita)), { recursive: true });
  const provvisorio = o.uscita + '.parziale';
  fs.writeFileSync(provvisorio, dati);
  fs.renameSync(provvisorio, o.uscita);
  return { nome: r.nome, byte: dati.length, uscita: o.uscita };
}

if (require.main === module) {
  (async () => {
    const a = {};
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--uscita') a.uscita = argv[++i];
      else throw new Error('Non conosco "' + argv[i] + '"');
    }
    a.postino = Postino.dalEnv(process.env);
    const r = await scaricaFoglio(a);
    console.log('Scaricato "' + r.nome + '" (' + r.byte + ' byte) in ' + r.uscita);
  })().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { scaricaFoglio };
