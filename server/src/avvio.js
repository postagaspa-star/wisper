/*
 * Avvio del server Wisper.
 *
 *   node server/src/avvio.js --dati <cartella> [--porta 8400] [--prova]
 *
 * --dati   la cartella dei dati: wisper.db, file/, copie/ (sul NAS: /data)
 * --porta  di base 8400
 * --porta-condivisione  (fase 5) una seconda porta che risponde solo ai link per i clienti
 *          (/condiviso/<token>); senza, i link non si aprono da nessuna parte
 * --prova  database in memoria coi dati di esempio di semina() e quattro utenti
 *          di prova (manuel@, laura@, marco@, lettura@esempio.it, password "prova");
 *          le email e le copie finiscono in <dati>/posta-finta. Ogni avvio riparte da capo.
 *
 * Dal .env (docker-compose): SEGRETO_SERVER (il ponte), WISPER_POSTINO_URL e
 * WISPER_POSTINO_SEGRETO (il postino), WISPER_ORA_COPIA (di base 02:30),
 * WISPER_VIES_URL e WISPER_SPAZIO_FINTO_MB (lo spazio libero finto in MB: solo per le prove).
 */
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Wisper } = require('./wisper');
const { Postino } = require('./postino');
const { creaServer, creaServerCondivisione } = require('./http');
const { semina } = require('./prova');

function argomenti(argv) {
  const a = { porta: 8400, prova: false, dati: '', portaCondivisione: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dati') a.dati = argv[++i];
    else if (argv[i] === '--porta') a.porta = Number(argv[++i]);
    else if (argv[i] === '--porta-condivisione') a.portaCondivisione = Number(argv[++i]);
    else if (argv[i] === '--prova') a.prova = true;
    else if (argv[i] === '--aiuto' || argv[i] === '--help') a.aiuto = true;
    else throw new Error('Non conosco "' + argv[i] + '". Si usa: node server/src/avvio.js --dati <cartella> [--porta 8400] [--porta-condivisione 8401] [--prova]');
  }
  return a;
}

/** Crea e avvia il server; torna {wisper, server} (le prove lo usano cosi'). */
function avvia(o) {
  const dati = path.resolve(o.dati || fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prova-')));
  fs.mkdirSync(dati, { recursive: true });
  const env = o.env || process.env;
  const postino = new Postino({
    url: env.WISPER_POSTINO_URL || '',
    segreto: env.WISPER_POSTINO_SEGRETO || env.SEGRETO_SERVER || '',
    // In prova, senza un postino vero, le email e le copie vanno su disco.
    cartella: o.prova && !env.WISPER_POSTINO_URL ? path.join(dati, 'posta-finta') : '',
  });
  const wisper = new Wisper({ dati, memoria: !!o.prova, postino, prova: !!o.prova });
  if (env.WISPER_SPAZIO_FINTO_MB) wisper.spazioFintoMb = Number(env.WISPER_SPAZIO_FINTO_MB);
  if (o.prova) semina(wisper);
  // In prova il database e' in memoria e riparte da capo: la copia notturna non serve.
  if (o.pianifica !== false && !o.prova) wisper.pianifica(env.WISPER_ORA_COPIA);
  const server = creaServer(wisper, { segretoPonte: env.SEGRETO_SERVER || '' });
  // Fase 5: la seconda porta, solo per i link per i clienti (Non collegato finche' CONDIVISIONE_INDIRIZZO e' vuoto).
  const condivisione = o.portaCondivisione ? creaServerCondivisione(wisper) : null;
  return { wisper, server, dati, condivisione };
}

if (require.main === module) {
  let a;
  try {
    a = argomenti(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (a.aiuto || (!a.dati && !a.prova)) {
    console.log('Si usa: node server/src/avvio.js --dati <cartella> [--porta 8400] [--porta-condivisione 8401] [--prova]');
    process.exit(a.aiuto ? 0 : 2);
  }
  const { wisper, server, dati, condivisione } = avvia(a);
  if (condivisione) condivisione.listen(a.portaCondivisione, () => console.log('Link per i clienti sulla porta ' + a.portaCondivisione + ' (solo /condiviso/<token>)'));
  server.listen(a.porta, () => {
    console.log('Wisper server ' + wisper.versione + ' su http://localhost:' + a.porta + ' (dati: ' + dati + (a.prova ? ', PROVA: dati di esempio, password "prova"' : '') + ')');
    console.log('Postino: ' + wisper.postino.descrizione() + ' · ponte: ' + (process.env.SEGRETO_SERVER ? 'acceso' : 'spento (manca SEGRETO_SERVER)') +
      (a.prova ? ' · copia notturna spenta in prova' : ' · copia ogni notte alle ' + wisper.oraCopia));
    // Il postino risponde? Lo si dice subito, invece di scoprirlo alla prima email o stanotte.
    if (wisper.postino.configurato() && !wisper.postino.cartella) {
      wisper.postino.prova()
        .then(r => console.log('Postino raggiunto (email rimaste oggi: ' + r.rimaste + ')'))
        .catch(err => console.log('ATTENZIONE: il postino non risponde: ' + err.message));
    }
    if (!wisper.titolare()) {
      console.log('ATTENZIONE: nessun titolare. Crealo con: node server/strumenti/utente.js --titolare "Nome Cognome" email --dati ' + dati);
    }
  });
  const ferma = () => {
    server.close();
    if (condivisione) condivisione.close();
    wisper.chiudi();
    process.exit(0);
  };
  process.on('SIGTERM', ferma);
  process.on('SIGINT', ferma);
}

module.exports = { avvia, argomenti };
