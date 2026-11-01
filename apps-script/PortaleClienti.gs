/**
 * WISPER - lo script del portale clienti (dal 01/11/2026, docs/gestionale/fase7.md §0).
 *
 * E' un PROGETTO APPS SCRIPT NUOVO, separato da quello del foglio, dello stesso account Google dello studio, con due
 * file: Porta.gs (identico a quello del foglio: si incolla uguale) e questo. Si pubblica come app web, "Esegui come:
 * io", "Chi ha accesso: chiunque". Proprieta' dello script: SEGRETO_SERVER = un segreto NUOVO, diverso da quello del
 * foglio (sul NAS si chiama SEGRETO_PORTALE, insieme a WISPER_PORTALE_URL = l'indirizzo di questa app web).
 * Facoltativa: PORTALE_ATTESA_MS (quanto aspetta il server, di base e al massimo 20000).
 *
 * PERCHE' A PARTE. L'indirizzo di questo script sta per forza nella pagina del portale (Netlify), quindi e' pubblico.
 * Da solo non apre niente: risponde solo al protocollo di §0.2 e passa tutto al server sul NAS, che decide. L'indirizzo
 * dello script del foglio resta segreto come sempre e non compare mai nella pagina, nelle email o nei messaggi.
 *
 *   pagina del portale (browser)  --POST {portale: 1, ...}-->  questo script  <--portaPrendi--  server sul NAS
 *
 * 1. La pagina manda ogni richiesta qui (POST, corpo JSON come testo, nessuna domanda preliminare del browser).
 * 2. Lo script controlla solo la forma (portale 1, strada con la forma giusta, corpo oggetto, grandezza fino a 36 milioni
 *    di caratteri) e la mette in coda con portaChiedi() di Porta.gs, come lavoro {tipo: "portale", ...}. Non guarda
 *    dentro: niente token, niente dati.
 * 3. Il server sul NAS (un secondo giro di porta.js, soloPortale) la prende con portaPrendi e la passa SOLO al router
 *    del portale (server/src/portale/), mai a /exec. La risposta torna qui e da qui alla pagina.
 * Lo script aspetta il server al massimo 20 secondi; poi risponde "riprova" (rete: true, porta: attesa | spento |
 * occupato), e la pagina dice "Il portale non risponde adesso: riprova fra qualche minuto". Sempre HTTP 200, JSON.
 * Google rimbalza su script.googleusercontent.com, che risponde con Access-Control-Allow-Origin: *.
 *
 * Porta.gs usa alcune funzioni che nel progetto del foglio stanno in Code.gs e Ponte.gs (FUSO, testo, messaggio,
 * segretoUguale, registraAccesso, cartellaRadice): qui sono scritte da capo, piccole, senza fogli ne' Gmail.
 */

var FUSO = 'Europe/Rome';

/** Quanto lo script aspetta il server sul NAS (la pagina ne aspetta 45). */
var PORTALE_ATTESA_MS = 20000;

/** La forma della strada (§0.2): il percorso di §6.1 senza /portale/api/, niente "..". */
var PORTALE_STRADA = /^[a-z-]+(\/[A-Za-z0-9_.-]{1,200}){0,3}$/;

/** Oltre questa misura (un file di circa 26 MB in base64) la richiesta non passa da Google. */
var PORTALE_MASSIMO = 36000000;

function testo(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function messaggio(err) {
  return err && err.message ? err.message : String(err);
}

/** Due segreti uguali, senza far capire quante lettere sono giuste (come in Ponte.gs). */
function segretoUguale(a, b) {
  a = String(a); b = String(b);
  var diverso = a.length === b.length ? 0 : 1;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diverso |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diverso === 0;
}

/**
 * Porta.gs la chiama quando il segreto del NAS e' sbagliato. Qui non c'e' un foglio: si conta solo nella cache (le
 * richieste della pagina le registra il server, nel registro degli accessi del portale).
 */
function registraAccesso(d, esito) {
  try {
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get('portale:rifiutati') || 0) + 1;
    cache.put('portale:rifiutati', String(n), 3600);
  } catch (e) {
    // Non deve fermare la risposta.
  }
}

/** La cartella per i pezzi grandi (Porta.gs: "Porta (temporanei)"), nel Drive del proprietario dello script. */
function cartellaRadice() {
  var prop = PropertiesService.getScriptProperties();
  var id = prop.getProperty('CARTELLA_DRIVE');
  if (id) {
    try {
      var c = DriveApp.getFolderById(id);
      if (!c.isTrashed()) return c;
    } catch (e) {
      // cancellata o non piu' accessibile: se ne crea una nuova
    }
  }
  var nuova = DriveApp.createFolder('Wisper portale');
  prop.setProperty('CARTELLA_DRIVE', nuova.getId());
  return nuova;
}

/** Una riga di testo: questo indirizzo risponde solo alla pagina del portale. */
function doGet(e) {
  return ContentService.createTextOutput('Portale clienti: questo indirizzo risponde solo alla pagina del portale.').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Le chiamate del server sul NAS (portaPrendi, portaConsegna, col segreto) vanno a Porta.gs; le richieste della pagina
 * ({portale: 1, ...}) si controllano nella forma e si mettono in coda. Tutto il resto: "Richiesta non valida".
 */
function doPost(e) {
  var corpo = e && e.postData ? String(e.postData.contents || '') : '';
  var d = null;
  try {
    d = JSON.parse(corpo || '{}');
  } catch (err) {
    d = null;
  }
  if (d && typeof d === 'object' && eRichiestaNas(d)) return porta(d);
  return ContentService.createTextOutput(portaleRispondi(d, corpo.length)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Il lavoro per il server, se la richiesta ha la forma giusta (§0.2), o null. Solo questi campi passano: il resto del
 * corpo della richiesta si butta.
 */
function portaleLavoro(d, lunghezza) {
  if (!d || typeof d !== 'object' || d instanceof Array || Number(d.portale) !== 1) return null;
  if (lunghezza > PORTALE_MASSIMO) return null;
  var strada = typeof d.strada === 'string' ? d.strada : '';
  if (!PORTALE_STRADA.test(strada) || strada.indexOf('..') >= 0) return null;
  if (d.corpo !== undefined && (d.corpo === null || typeof d.corpo !== 'object' || d.corpo instanceof Array)) return null;
  return {
    tipo: 'portale', v: d.v, id: typeof d.id === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(d.id) ? d.id : '', strada: strada,
    metodo: d.metodo === 'GET' ? 'GET' : 'POST', sessione: typeof d.sessione === 'string' ? d.sessione.slice(0, 200) : '',
    pre: typeof d.pre === 'string' ? d.pre.slice(0, 200) : '', corpo: d.corpo || {}, agente: typeof d.agente === 'string' ? d.agente.slice(0, 40) : ''
  };
}

/** Quanto aspettare il server: PORTALE_ATTESA_MS (le prove), mai oltre 20 secondi. */
function portaleAttesa(p) {
  var ms = Number(p.PORTALE_ATTESA_MS);
  return ms > 0 ? Math.min(ms, PORTALE_ATTESA_MS) : PORTALE_ATTESA_MS;
}

/** La risposta per la pagina: quella del server (con "stato"), o un "riprova" di Porta.gs (rete: true). Testo JSON. */
function portaleRispondi(d, lunghezza) {
  var lavoro = portaleLavoro(d, lunghezza);
  if (!lavoro) return JSON.stringify({ ok: false, errore: 'Richiesta non valida' });
  var p = portaProprieta();
  if (!p.SEGRETO_SERVER) return JSON.stringify(portaRispostaSpento(0));
  // Lo stesso id quando la pagina riprova la stessa operazione: una POST ripetuta non si fa due volte.
  var id = lavoro.id || portaNuovoId('w');
  var r = portaChiedi(id, lavoro, portaleAttesa(p));
  return r.fermo ? JSON.stringify(r.fermo) : r.testo;
}
