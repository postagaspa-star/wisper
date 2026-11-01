/*
 * Avvio del server Wisper.
 *
 *   node server/src/avvio.js --dati <cartella> [--porta 8400] [--prova]
 *
 * --dati   la cartella dei dati: wisper.db, file/, copie/ (sul NAS: /data)
 * --porta  di base 8400
 * --porta-condivisione  (fase 5) una seconda porta che risponde solo ai link per i clienti
 *          (/condiviso/<token>); senza, i link non si aprono da nessuna parte
 * --porta-ingresso  la porta per l'ingresso da internet (contenitore wisper-ingresso, sul NAS 8402,
 *          anche da WISPER_PORTA_INGRESSO): l'indirizzo di chi chiama arriva in X-Forwarded-For e
 *          passano solo le strade di telefono e computer. Va raggiunta SOLO dall'ingresso (expose, mai ports)
 * --porta-portale <n>  (fase 7) SOLO con --prova: un ascolto HTTP locale che parla come lo script del portale (§0.2 di
 *          docs/gestionale/fase7.md), per provare la pagina del portale sul PC senza Google. Fuori da --prova il server
 *          non parte: sul NAS il portale passa solo da Google (WISPER_PORTALE_URL e SEGRETO_PORTALE).
 * --prova  database in memoria coi dati di esempio di semina() e quattro utenti
 *          di prova (manuel@, laura@, marco@, lettura@esempio.it, password "prova");
 *          le email e le copie finiscono in <dati>/posta-finta. Ogni avvio riparte da capo.
 *          Solo qui conta WISPER_OGGI_PROVA=AAAA-MM-GG (l'orologio di prova: per il server oggi e' quel
 *          giorno, le ore restano quelle vere); senza --prova la variabile non fa niente.
 *
 * Dal .env (docker-compose): SEGRETO_SERVER (il ponte), WISPER_POSTINO_URL e
 * WISPER_POSTINO_SEGRETO (il postino), WISPER_ORA_COPIA (di base 02:30),
 * WISPER_VIES_URL e WISPER_SPAZIO_FINTO_MB (lo spazio libero finto in MB: solo per le prove),
 * WISPER_PORTA_INGRESSO e WISPER_PONTE_DA_FUORI ("si": /ponte passa anche dall'ingresso, solo nelle
 * settimane del cambio).
 *
 * La porta Google (porta.js, docs/gestionale/porta-google.md): con WISPER_POSTINO_URL e il segreto il
 * server va a prendere da solo, dallo script del foglio, le richieste di telefoni e computer fuori casa.
 * WISPER_PORTA_ATTESA: quanti secondi lo script tiene aperta ogni chiamata (di base 45);
 * WISPER_PORTA_PAUSA: secondi di pausa fra una chiamata senza lavoro e l'altra (di base 0);
 * WISPER_PORTA_GOOGLE=no la spegne.
 *
 * Il portale clienti (fase 7, fase7.md §0): con WISPER_PORTALE_URL (l'indirizzo dello script del portale, quello che
 * finisce con /exec) e SEGRETO_PORTALE un secondo giro di porta.js (soloPortale) va a prendere le richieste della pagina
 * del portale e le passa solo al router del portale (server/src/portale/). Nessuna porta nuova. Ogni minuto il giro del
 * portale manda gli avvisi raggruppati, fa le pulizie e, ogni ora, il controllo del portale. In prova
 * WISPER_PORTALE_INDIRIZZO scrive l'indirizzo della pagina nei dati di esempio (per i link delle email).
 */
'use strict';

process.env.TZ = 'Europe/Rome';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Wisper } = require('./wisper');
const { Postino } = require('./postino');
const { PortaGoogle } = require('./porta');
const { creaServer, creaServerIngresso, creaServerCondivisione } = require('./http');
const { creaServerPortale } = require('./portale/ascolto');
const { semina } = require('./prova');
const { accendiOrologioDiProva, orologioDiProva } = require('./utili');

function argomenti(argv) {
  const a = { porta: 8400, prova: false, dati: '', portaCondivisione: 0, portaIngresso: 0, portaPortale: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dati') a.dati = argv[++i];
    else if (argv[i] === '--porta') a.porta = Number(argv[++i]);
    else if (argv[i] === '--porta-condivisione') a.portaCondivisione = Number(argv[++i]);
    else if (argv[i] === '--porta-ingresso') a.portaIngresso = Number(argv[++i]);
    else if (argv[i] === '--porta-portale') a.portaPortale = Number(argv[++i]);
    else if (argv[i] === '--prova') a.prova = true;
    else if (argv[i] === '--aiuto' || argv[i] === '--help') a.aiuto = true;
    else throw new Error('Non conosco "' + argv[i] + '". Si usa: node server/src/avvio.js --dati <cartella> [--porta 8400] [--porta-condivisione 8401] [--porta-ingresso 8402] [--prova [--porta-portale 8403]]');
  }
  // Fase 7: la porta locale del portale esiste solo in prova (sul NAS il portale passa da Google).
  if (a.portaPortale && !a.prova) throw new Error('--porta-portale esiste solo con --prova: sul NAS il portale passa da Google (WISPER_PORTALE_URL e SEGRETO_PORTALE nel .env)');
  return a;
}

/** Crea e avvia il server; torna {wisper, server} (le prove lo usano cosi'). */
function avvia(o) {
  // Fase 7: la porta locale del portale esiste solo in prova (argomenti() lo controlla gia' per la riga di comando).
  if (o.portaPortale && !o.prova) throw new Error('--porta-portale esiste solo con --prova');
  const dati = path.resolve(o.dati || fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prova-')));
  fs.mkdirSync(dati, { recursive: true });
  const env = o.env || process.env;
  // L'orologio di prova (WISPER_OGGI_PROVA=AAAA-MM-GG) solo con --prova: database in memoria coi dati di
  // esempio. Il server vero non lo accende mai, qualunque cosa ci sia nel .env (utili.js, prove/orologio.test.js).
  if (o.prova) accendiOrologioDiProva(env.WISPER_OGGI_PROVA || process.env.WISPER_OGGI_PROVA);
  const postino = new Postino({
    url: env.WISPER_POSTINO_URL || '',
    segreto: env.WISPER_POSTINO_SEGRETO || env.SEGRETO_SERVER || '',
    // In prova, senza un postino vero, le email e le copie vanno su disco.
    cartella: o.prova && !env.WISPER_POSTINO_URL ? path.join(dati, 'posta-finta') : '',
  });
  const wisper = new Wisper({ dati, memoria: !!o.prova, postino, prova: !!o.prova });
  if (env.WISPER_SPAZIO_FINTO_MB) wisper.spazioFintoMb = Number(env.WISPER_SPAZIO_FINTO_MB);
  if (o.prova) semina(wisper);
  // La porta Google: parte da sola se c'e' l'indirizzo dello script col segreto (le prove la accendono loro).
  wisper.porta = new PortaGoogle(wisper, {
    url: env.WISPER_POSTINO_URL || '',
    segreto: env.WISPER_POSTINO_SEGRETO || env.SEGRETO_SERVER || '',
    segretoPonte: env.SEGRETO_SERVER || '',
    attesaS: env.WISPER_PORTA_ATTESA === undefined || env.WISPER_PORTA_ATTESA === '' ? undefined : Number(env.WISPER_PORTA_ATTESA),
    pausaS: Number(env.WISPER_PORTA_PAUSA) || 0,
    spenta: String(env.WISPER_PORTA_GOOGLE || '').trim().toLowerCase() === 'no',
  });
  if (o.portaGoogle !== false) wisper.porta.avvia();
  // Fase 7: il secondo giro, quello del portale clienti (solo i lavori "portale", al router del portale).
  wisper.portaPortale = new PortaGoogle(wisper, {
    url: env.WISPER_PORTALE_URL || '',
    segreto: env.SEGRETO_PORTALE || '',
    soloPortale: true,
    attesaS: env.WISPER_PORTA_ATTESA === undefined || env.WISPER_PORTA_ATTESA === '' ? undefined : Number(env.WISPER_PORTA_ATTESA),
    pausaS: Number(env.WISPER_PORTA_PAUSA) || 0,
    spenta: String(env.WISPER_PORTA_GOOGLE || '').trim().toLowerCase() === 'no',
  });
  if (o.portaGoogle !== false) wisper.portaPortale.avvia();
  const portale = o.portaPortale ? creaServerPortale(wisper) : null;
  if (portale) wisper.portaleLocale = true;
  // Il giro del portale: ogni minuto (avvisi raggruppati, pulizie, controllo di ogni ora). Le prove lo chiamano da sole.
  if (o.pianifica !== false) {
    wisper.giroPortaleTimer = setInterval(() => { wisper.giroPortale().catch(err => console.error('[portale] ' + (err && err.message ? err.message : err))); }, 60000);
    if (wisper.giroPortaleTimer.unref) wisper.giroPortaleTimer.unref();
  }
  // In prova il database e' in memoria e riparte da capo: la copia notturna non serve.
  if (o.pianifica !== false && !o.prova) wisper.pianifica(env.WISPER_ORA_COPIA);
  const server = creaServer(wisper, { segretoPonte: env.SEGRETO_SERVER || '' });
  // Fase 5: la seconda porta, solo per i link per i clienti (Non collegato finche' CONDIVISIONE_INDIRIZZO e' vuoto).
  const condivisione = o.portaCondivisione ? creaServerCondivisione(wisper) : null;
  // L'ingresso da internet: la sua porta, dove l'indirizzo vero arriva in X-Forwarded-For (README, "Internet entrance").
  const portaIngresso = Number(o.portaIngresso || env.WISPER_PORTA_INGRESSO || 0);
  const ponteDaFuori = String(env.WISPER_PONTE_DA_FUORI || '').trim().toLowerCase() === 'si';
  const ingresso = portaIngresso ? creaServerIngresso(wisper, { segretoPonte: env.SEGRETO_SERVER || '', ponteDaFuori }) : null;
  return { wisper, server, dati, condivisione, ingresso, portaIngresso, ponteDaFuori, portale };
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
    console.log('Si usa: node server/src/avvio.js --dati <cartella> [--porta 8400] [--porta-condivisione 8401] [--porta-ingresso 8402] [--prova]');
    process.exit(a.aiuto ? 0 : 2);
  }
  const { wisper, server, dati, condivisione, ingresso, portaIngresso, ponteDaFuori, portale } = avvia(a);
  if (portale) portale.listen(a.portaPortale, () => console.log('Portale clienti di prova sulla porta ' + a.portaPortale + ' (POST come lo script del portale, §0.2 di fase7.md; le email in ' + path.join(dati, 'posta-finta', 'email') + ')'));
  if (condivisione) condivisione.listen(a.portaCondivisione, () => console.log('Link per i clienti sulla porta ' + a.portaCondivisione + ' (solo /condiviso/<token>)'));
  if (ingresso) {
    ingresso.listen(portaIngresso, () => console.log('Ingresso da internet sulla porta ' + portaIngresso + ' (solo /exec, /carica, /file, /salute' +
      (ponteDaFuori ? ' e /ponte: WISPER_PONTE_DA_FUORI=si' : '') + '; deve raggiungerla solo il contenitore wisper-ingresso)'));
  }
  server.listen(a.porta, () => {
    console.log('Wisper server ' + wisper.versione + ' su http://localhost:' + a.porta + ' (dati: ' + dati + (a.prova ? ', PROVA: dati di esempio, password "prova"' : '') + ')');
    console.log('Postino: ' + wisper.postino.descrizione() + ' · ponte: ' + (process.env.SEGRETO_SERVER ? 'acceso' : 'spento (manca SEGRETO_SERVER)') +
      (a.prova ? ' · copia notturna spenta in prova' : ' · copia ogni notte alle ' + wisper.oraCopia));
    console.log('Porta Google: ' + (wisper.porta.acceso ? 'il server va a prendere il lavoro dallo script del foglio' : wisper.porta.stato().frase));
    console.log('Portale clienti: ' + (wisper.portaPortale.acceso ? 'il server va a prendere le richieste dallo script del portale' : wisper.portaPortale.stato().frase));
    if (orologioDiProva()) console.log('Orologio di prova: per il server oggi e\' ' + orologioDiProva() + ' (WISPER_OGGI_PROVA; le ore sono quelle vere)');
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
    if (ingresso) ingresso.close();
    if (portale) portale.close();
    wisper.chiudi();
    process.exit(0);
  };
  process.on('SIGTERM', ferma);
  process.on('SIGINT', ferma);
}

module.exports = { avvia, argomenti };
