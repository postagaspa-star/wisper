/**
 * WISPER - la porta Google (dal 31/10/2026).
 *
 * Va nello stesso progetto Apps Script di Code.gs e Ponte.gs, come terzo file
 * (Porta.gs). Il contratto completo e' in docs/gestionale/porta-google.md.
 *
 * PERCHE'. Il server di Wisper sta nel NAS di casa, che da internet non si
 * raggiunge (il router non si tocca, niente domini, niente abbonamenti). Lo
 * script invece si raggiunge da ovunque. Allora fa da porta d'ingresso:
 *
 *   telefono / computer  --POST-->  questo script  <--POST--  server sul NAS
 *
 * 1. Un'app manda la sua richiesta allo script (come al Wisper di prima).
 * 2. Lo script la mette in coda (nella cache dello script) e aspetta.
 * 3. Il server sul NAS chiama lo script di continuo ("c'e' lavoro?"): lo script
 *    tiene aperta quella chiamata fino a 45 secondi e la chiude appena arriva una
 *    richiesta, consegnandogliela. E' sempre il NAS a chiamare Google: a casa non
 *    si apre niente.
 * 4. Il server fa il lavoro (stessi permessi, stesso registro di sempre) e
 *    consegna la risposta con la chiamata successiva.
 * 5. L'esecuzione dell'app, che intanto guardava la cache, trova la risposta e
 *    la restituisce all'app. Se in 25 secondi non arriva niente risponde "rete
 *    lenta, riprova" (rete: true), e la richiesta ripetuta con lo stesso id non
 *    viene fatta due volte.
 *
 * Lo script non legge i token e non guarda i dati: passa tutto al server, che
 * decide. Le richieste restano su Google solo il tempo della consegna.
 */

/** I tempi e le misure della porta. Le quote di Google sono nel contratto (§2). */
var PORTA = {
  attesaAppMs: 25000,        // quanto aspetta l'esecuzione di un'app (le app vecchie leggono con 30 s di pazienza)
  passoAppMs: 200,           // ogni quanto guarda se la risposta e' arrivata
  attesaNasS: 45,            // quanto tiene aperta la chiamata del NAS, di base
  attesaNasMassimaS: 55,
  passoNasMs: 300,           // ogni quanto, durante quella chiamata, guarda se c'e' lavoro
  nasSegnoMs: 10000,         // ogni quanto, durante quella chiamata, segna "il NAS c'e'"
  nasSpentoMs: 90000,        // senza notizie dal NAS da tanto: le app non aspettano
  presaScadeMs: 60000,       // un lavoro preso ma senza risposta torna disponibile dopo tanto (se il NAS non dice inCorso)
  preseMassime: 3,           // dopo tre volte senza risposta si smette di darlo al NAS
  vitaS: 600,                // una richiesta in coda vale 10 minuti (poi l'app la rimanda lei)
  pezzo: 90000,              // caratteri per voce di cache (il limite e' 100 KB per voce)
  massimoInCache: 2000000,   // fino a qui a pezzi nella cache (22 voci); oltre, un file temporaneo su Drive
  massimoRichiesta: 36000000, // circa 27 MB di file in base64: oltre non passa da Google
  codaMassima: 40,           // richieste in coda insieme
  lavoriPerVolta: 8,
  caratteriPerVolta: 40000000, // quanto si consegna al NAS in una risposta (il limite di Google e' 50 MB)
  puliziaOgniS: 900,         // la pulizia della coda e dei file temporanei, al massimo ogni 15 minuti
  temporaneiVecchiMs: 1800000 // un file temporaneo con piu' di 30 minuti e' rimasto indietro: via
};

var PORTA_CHIAVE = {
  coda: 'porta:coda',        // gli id in coda, in ordine (JSON)
  nas: 'porta:nas',          // l'ultima volta che il NAS si e' fatto vivo (millisecondi)
  pulizia: 'porta:pulizia',
  stato: 'porta:s:',         // + id: {s: coda|presa|pronta, c: quando e' arrivata, t: ultimo cambio, n: prese, l: caratteri}
  richiesta: 'porta:r:',     // + id: la richiesta (o "#pezzi:N", o "#drive:<id>")
  risposta: 'porta:a:'       // + id: la risposta, nello stesso modo
};

var PORTA_CARTELLA = 'Porta (temporanei)';

/** L'ora, in millisecondi. Una funzione a parte: le prove la spostano. */
function portaAdessoMs() {
  return new Date().getTime();
}

/** Una richiesta della porta: delle app nuove (campo porta) o del server sul NAS (azione portaPrendi, portaConsegna). */
function eRichiestaPorta(d) {
  return !!d && typeof d === 'object' && (d.porta !== undefined || eRichiestaNas(d));
}

function eRichiestaNas(d) {
  return typeof d.azione === 'string' && /^porta[A-Z]/.test(d.azione);
}

/** L'ingresso della porta (da doPost). Risponde sempre JSON. */
function porta(d) {
  var testoRisposta = eRichiestaNas(d) ? portaNas(d) : portaApp(d);
  return ContentService.createTextOutput(testoRisposta).setMimeType(ContentService.MimeType.JSON);
}

function portaProprieta() {
  return PropertiesService.getScriptProperties().getProperties() || {};
}

/** Quanto aspetta l'esecuzione di un'app: PORTA_ATTESA_MS (le prove), mai oltre 25 s (le app vecchie leggono con 30 s). */
function portaAttesaApp(p) {
  var ms = Number(p.PORTA_ATTESA_MS);
  return ms > 0 ? Math.min(ms, PORTA.attesaAppMs) : PORTA.attesaAppMs;
}

function portaIdValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id);
}

function portaNuovoId(prima) {
  return prima + Utilities.getUuid().replace(/-/g, '');
}

/**
 * JSON con i caratteri oltre l'ASCII scritti \uXXXX: un carattere = un byte,
 * cosi' i pezzi della cache si misurano contando i caratteri.
 */
function portaJson(o) {
  return JSON.stringify(o).replace(/[\u007f-￿]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

function portaIso(ms) {
  return Utilities.formatDate(new Date(ms), FUSO, "yyyy-MM-dd'T'HH:mm:ss");
}

// ---------------------------------------------------------------------------
// Le app
// ---------------------------------------------------------------------------

/**
 * Una richiesta di un'app nuova: {porta: 1, id, token, strada, ...}.
 *  - strada "exec": metodo (GET|POST), dati = il corpo che l'app manderebbe a /exec;
 *  - strada "carica": query {nome, mime, idFile, per}, base64 = il file;
 *  - strada "file": file = l'id del file (la risposta porta il file in base64);
 *  - strada "salute": risponde lo script, senza il NAS.
 * Torna il testo JSON da dare all'app.
 */
function portaApp(d) {
  var p = portaProprieta();
  var strada = testo(d.strada) || 'exec';
  if (strada === 'salute') return JSON.stringify(portaSalute(p));
  if (!p.SEGRETO_SERVER) return JSON.stringify(portaRispostaSpento(0));
  var lavoro = { tipo: strada, token: testo(d.token) };
  if (strada === 'exec') {
    if (!d.dati || typeof d.dati !== 'object' || Array.isArray(d.dati)) return JSON.stringify({ ok: false, errore: 'Richiesta non valida' });
    lavoro.metodo = d.metodo === 'GET' ? 'GET' : 'POST';
    lavoro.dati = d.dati;
  } else if (strada === 'carica') {
    var q = d.query && typeof d.query === 'object' ? d.query : {};
    lavoro.query = { nome: testo(q.nome).slice(0, 200), mime: testo(q.mime).slice(0, 100), idFile: testo(q.idFile).slice(0, 80), per: testo(q.per).slice(0, 20) };
    lavoro.base64 = typeof d.base64 === 'string' ? d.base64 : '';
  } else if (strada === 'file') {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(testo(d.file))) return JSON.stringify({ ok: false, errore: 'Richiesta non valida' });
    lavoro.file = testo(d.file);
  } else {
    return JSON.stringify({ ok: false, errore: 'Richiesta non valida' });
  }
  if (strada !== 'exec') {
    lavoro.disp = testo(d.disp).slice(0, 64);
    lavoro.dispNome = testo(d.dispNome).slice(0, 80);
    lavoro.app = testo(d.app).slice(0, 40);
  }
  var id = portaIdValido(d.id) ? d.id : portaNuovoId('g');
  var r = portaChiedi(id, lavoro, portaAttesaApp(p));
  return r.fermo ? JSON.stringify(r.fermo) : r.testo;
}

/** Lo stato della porta, senza chiedere niente al NAS. */
function portaSalute(p) {
  var cache = CacheService.getScriptCache();
  var ultimo = Number(cache.get(PORTA_CHIAVE.nas) || 0);
  var acceso = !!p.SEGRETO_SERVER && ultimo > 0 && portaAdessoMs() - ultimo < PORTA.nasSpentoMs;
  return { ok: true, porta: 'google', server: acceso ? 'acceso' : 'spento', ultimoContatto: ultimo ? portaIso(ultimo) : '' };
}

/**
 * Mette la richiesta in coda (se non c'e' gia' con lo stesso id) e aspetta la
 * risposta del server. Torna {testo} (la risposta del server) o {fermo} (una
 * risposta dello script: server spento, attesa finita, coda piena...).
 */
function portaChiedi(id, lavoro, attesaMs) {
  var cache = CacheService.getScriptCache();
  var inizio = portaAdessoMs();
  var stato = portaStato(cache, id);
  if (stato && stato.s === 'pronta') {
    var pronta = portaLeggiRisposta(cache, id);
    if (pronta !== null) return { testo: pronta };
    // La cache ha perso la risposta: la richiesta si rimette in coda (il server non rifa' una scrittura con lo stesso id).
    cache.remove(PORTA_CHIAVE.stato + id);
    stato = null;
  }
  if (!stato) {
    var ultimo = Number(cache.get(PORTA_CHIAVE.nas) || 0);
    if (!(ultimo > 0 && inizio - ultimo < PORTA.nasSpentoMs)) return { fermo: portaRispostaSpento(ultimo) };
    var testoLavoro = portaJson(lavoro);
    if (testoLavoro.length > PORTA.massimoRichiesta) {
      return { fermo: { ok: false, errore: 'La richiesta è troppo grande per passare da Google (al massimo ' + Math.floor(PORTA.massimoRichiesta * 3 / 4 / 1048576) + ' MB): mandala quando sei in ufficio' } };
    }
    portaConserva(cache, PORTA_CHIAVE.richiesta + id, testoLavoro);
    var esito = portaAccoda(cache, id, testoLavoro.length, inizio);
    if (esito === 'piena' || esito === 'occupato') {
      portaTogliConservato(cache, PORTA_CHIAVE.richiesta + id);
      return { fermo: { ok: false, rete: true, porta: 'occupato', errore: 'Troppe richieste insieme: riprova fra poco' } };
    }
  }
  var t = portaAspetta(cache, id, inizio + attesaMs);
  if (t === null) return { fermo: { ok: false, rete: true, porta: 'attesa', errore: 'Il server dello studio non ha risposto in tempo: riprova fra poco' } };
  return { testo: t };
}

function portaRispostaSpento(ultimo) {
  var r = { ok: false, rete: true, porta: 'spento', errore: 'Il server dello studio non è raggiungibile: riprova più tardi' };
  if (ultimo > 0) {
    r.ultimoContatto = portaIso(ultimo);
    r.errore = 'Il server dello studio non risponde dalle ' + Utilities.formatDate(new Date(ultimo), FUSO, 'HH:mm') + ': riprova più tardi';
  }
  return r;
}

function portaStato(cache, id) {
  var s = cache.get(PORTA_CHIAVE.stato + id);
  if (s === null) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function portaCoda(cache) {
  try {
    var c = JSON.parse(cache.get(PORTA_CHIAVE.coda) || '[]');
    return Array.isArray(c) ? c : [];
  } catch (e) {
    return [];
  }
}

/** In coda, sotto il lucchetto: due richieste insieme non si cancellano a vicenda. */
function portaAccoda(cache, id, caratteri, ora) {
  var lucchetto = LockService.getScriptLock();
  if (!lucchetto.tryLock(10000)) return 'occupato';
  try {
    if (portaStato(cache, id)) return 'gia';
    var coda = portaCoda(cache);
    if (coda.length >= PORTA.codaMassima) return 'piena';
    coda.push(id);
    cache.put(PORTA_CHIAVE.stato + id, JSON.stringify({ s: 'coda', c: ora, t: ora, n: 0, l: caratteri }), PORTA.vitaS);
    cache.put(PORTA_CHIAVE.coda, JSON.stringify(coda), 2 * PORTA.vitaS);
    return 'ok';
  } finally {
    lucchetto.releaseLock();
  }
}

/** Guarda la cache finche' arriva la risposta o finisce il tempo. Torna il testo, o null. */
function portaAspetta(cache, id, finoA) {
  while (true) {
    var t = portaLeggiRisposta(cache, id);
    if (t !== null) return t;
    if (portaAdessoMs() >= finoA) return null;
    Utilities.sleep(PORTA.passoAppMs);
  }
}

/** La risposta, se c'e' tutta; letta, si toglie da Google (cache e file temporaneo). */
function portaLeggiRisposta(cache, id) {
  var chiave = PORTA_CHIAVE.risposta + id;
  var segno = cache.get(chiave);
  if (segno === null) return null;
  var t = portaLeggiConservato(cache, chiave, segno);
  if (t === null) return null;
  portaTogliConservato(cache, chiave, segno);
  cache.remove(PORTA_CHIAVE.stato + id);
  return t;
}

// ---------------------------------------------------------------------------
// Conservare un testo: una voce di cache, piu' voci, o un file temporaneo su Drive
// ---------------------------------------------------------------------------

function portaConserva(cache, chiave, t) {
  if (t.length <= PORTA.pezzo) {
    cache.put(chiave, t, PORTA.vitaS);
    return 'cache';
  }
  if (t.length <= PORTA.massimoInCache) {
    var voci = {};
    var n = Math.ceil(t.length / PORTA.pezzo);
    for (var i = 0; i < n; i++) voci[chiave + '#' + i] = t.substr(i * PORTA.pezzo, PORTA.pezzo);
    voci[chiave] = '#pezzi:' + n;
    cache.putAll(voci, PORTA.vitaS);
    return 'pezzi';
  }
  var file = portaCartella(true).createFile(Utilities.newBlob(t, 'application/json', chiave.replace(/[^A-Za-z0-9_-]/g, '-') + '.json'));
  cache.put(chiave, '#drive:' + file.getId(), PORTA.vitaS);
  return 'drive';
}

/** Il testo conservato, o null se manca qualcosa (la cache di Google puo' perdere una voce). */
function portaLeggiConservato(cache, chiave, segno) {
  if (segno === undefined) segno = cache.get(chiave);
  if (segno === null) return null;
  if (segno.charAt(0) !== '#') return segno;
  if (segno.indexOf('#pezzi:') === 0) {
    var n = Number(segno.slice(7));
    var chiavi = [];
    for (var i = 0; i < n; i++) chiavi.push(chiave + '#' + i);
    var voci = cache.getAll(chiavi);
    var pezzi = [];
    for (var j = 0; j < n; j++) {
      if (typeof voci[chiavi[j]] !== 'string') return null;
      pezzi.push(voci[chiavi[j]]);
    }
    return pezzi.join('');
  }
  if (segno.indexOf('#drive:') === 0) {
    try {
      return DriveApp.getFileById(segno.slice(7)).getBlob().getDataAsString();
    } catch (e) {
      return null;
    }
  }
  return null;
}

function portaTogliConservato(cache, chiave, segno) {
  if (segno === undefined) segno = cache.get(chiave);
  if (segno === null) return;
  var chiavi = [chiave];
  if (segno.indexOf('#pezzi:') === 0) {
    for (var i = 0; i < Number(segno.slice(7)); i++) chiavi.push(chiave + '#' + i);
  } else if (segno.indexOf('#drive:') === 0) {
    portaTogliTemporaneo(segno.slice(7));
  }
  cache.removeAll(chiavi);
}

/**
 * Un file temporaneo via da Drive. Col servizio avanzato "Drive API" acceso
 * (Servizi > Drive API, gratis) si cancella per sempre; senza, va nel cestino di
 * Drive, che Google svuota da solo dopo 30 giorni.
 */
function portaTogliTemporaneo(idFile) {
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.remove) {
      Drive.Files.remove(idFile);
      return 'cancellato';
    }
  } catch (e) { /* si prova col cestino */ }
  try {
    DriveApp.getFileById(idFile).setTrashed(true);
    return 'cestino';
  } catch (e2) {
    return 'non trovato';
  }
}

/** La cartella dei file temporanei, dentro la cartella Wisper. crea: false = null se non c'e'. */
function portaCartella(crea) {
  var radice = cartellaRadice();
  var it = radice.getFoldersByName(PORTA_CARTELLA);
  if (it.hasNext()) return it.next();
  return crea ? radice.createFolder(PORTA_CARTELLA) : null;
}

// ---------------------------------------------------------------------------
// Il server sul NAS
// ---------------------------------------------------------------------------

/**
 * Le chiamate del server sul NAS, tutte col segreto (SEGRETO_SERVER, lo stesso
 * del postino), mai col codice delle app:
 *  - portaPrendi {attesa, max, risposte, inCorso}: consegna le risposte pronte e
 *    aspetta lavoro fino ad "attesa" secondi; torna {lavori: [{id, prese, inCoda, lavoro}]}.
 *    inCorso = gli id che il NAS ha in mano: un lavoro "preso" che non c'e' e' andato
 *    perso (il NAS e' ripartito, o la risposta di una chiamata non gli e' arrivata) e
 *    torna subito disponibile;
 *  - portaConsegna {risposte: [{id, risposta}]}: solo le risposte.
 */
function portaNas(d) {
  var p = portaProprieta();
  if (!p.SEGRETO_SERVER || !segretoUguale(d.segreto || '', p.SEGRETO_SERVER)) {
    registraAccesso({ azione: testo(d.azione).slice(0, 40), disp: 'server-nas', dispNome: 'Server Wisper (NAS)', app: 'porta' }, 'rifiutato');
    return JSON.stringify({ ok: false, errore: 'Segreto sbagliato' });
  }
  try {
    if (d.azione === 'portaPrendi') return portaPrendi(d);
    if (d.azione === 'portaConsegna') {
      var cache = CacheService.getScriptCache();
      portaSegnaNas(cache, portaAdessoMs());
      var esito = portaConsegna(cache, d.risposte);
      return JSON.stringify({ ok: true, consegnate: esito.consegnate, scadute: esito.scadute });
    }
    return JSON.stringify({ ok: false, errore: 'Azione sconosciuta: ' + d.azione });
  } catch (err) {
    return JSON.stringify({ ok: false, errore: messaggio(err) });
  }
}

function portaSegnaNas(cache, ora) {
  cache.put(PORTA_CHIAVE.nas, String(ora), 21600);
}

function portaPrendi(d) {
  var cache = CacheService.getScriptCache();
  var inizio = portaAdessoMs();
  portaSegnaNas(cache, inizio);
  var esito = portaConsegna(cache, d.risposte);
  var attesa = Number(d.attesa);
  attesa = Math.min(Math.max(isNaN(attesa) ? PORTA.attesaNasS : attesa, 0), PORTA.attesaNasMassimaS);
  var max = Math.min(Math.max(Number(d.max) || PORTA.lavoriPerVolta, 1), 20);
  var fino = inizio + attesa * 1000;
  var inCorso = Array.isArray(d.inCorso) ? d.inCorso.filter(portaIdValido) : null;
  portaPuliziaSeServe(cache);
  var segnato = inizio;
  while (true) {
    var presi = portaPrendiLavori(cache, max, inCorso);
    if (presi.length) return portaRispostaLavori(cache, presi, esito);
    var ora = portaAdessoMs();
    if (ora >= fino) return portaRispostaLavori(cache, [], esito);
    if (ora - segnato >= PORTA.nasSegnoMs) {
      portaSegnaNas(cache, ora);
      segnato = ora;
    }
    Utilities.sleep(PORTA.passoNasMs);
  }
}

/**
 * Sceglie i lavori da dare al NAS e li segna "presi", sotto il lucchetto.
 * inCorso: gli id che il NAS dice di avere in mano (null: il NAS non lo dice, vale il tempo).
 */
function portaPrendiLavori(cache, max, inCorso) {
  if (!portaCoda(cache).length) return [];
  var lucchetto = LockService.getScriptLock();
  if (!lucchetto.tryLock(5000)) return [];
  var presi = [];
  var falliti = [];
  try {
    var coda = portaCoda(cache);
    var stati = coda.length ? cache.getAll(coda.map(function (id) { return PORTA_CHIAVE.stato + id; })) : {};
    var ora = portaAdessoMs();
    var resta = [];
    var nuovi = {};
    var caratteri = 0;
    coda.forEach(function (id) {
      var s = null;
      try { s = JSON.parse(stati[PORTA_CHIAVE.stato + id] || 'null'); } catch (e) { s = null; }
      // Consegnata, sparita dalla cache o troppo vecchia: fuori dalla coda (l'app, se serve, la rimanda).
      if (!s || s.s === 'pronta' || ora - s.c > PORTA.vitaS * 1000) return;
      var persa = s.s === 'presa' && (inCorso ? inCorso.indexOf(id) < 0 : ora - s.t > PORTA.presaScadeMs);
      var libera = s.s === 'coda' || persa;
      if (libera && presi.length < max && (presi.length === 0 || caratteri + s.l <= PORTA.caratteriPerVolta)) {
        if (s.n >= PORTA.preseMassime) {
          falliti.push(id);
          return;
        }
        s.s = 'presa';
        s.t = ora;
        s.n += 1;
        nuovi[PORTA_CHIAVE.stato + id] = JSON.stringify(s);
        presi.push({ id: id, n: s.n, inCoda: ora - s.c });
        caratteri += s.l;
      }
      resta.push(id);
    });
    if (presi.length) cache.putAll(nuovi, PORTA.vitaS);
    cache.put(PORTA_CHIAVE.coda, JSON.stringify(resta), 2 * PORTA.vitaS);
  } finally {
    lucchetto.releaseLock();
  }
  // Data al NAS tre volte senza risposta: l'app riceve "riprova" invece di aspettare per niente.
  falliti.forEach(function (id) {
    portaRispondiQui(cache, id, { ok: false, rete: true, porta: 'attesa', errore: 'Il server dello studio non riesce a rispondere a questa richiesta: riprova più tardi' });
  });
  return presi;
}

/** Una risposta scritta dallo script al posto del server (la richiesta non si fa piu'). */
function portaRispondiQui(cache, id, risposta) {
  portaTogliConservato(cache, PORTA_CHIAVE.richiesta + id);
  cache.put(PORTA_CHIAVE.risposta + id, portaJson(risposta), PORTA.vitaS);
  cache.put(PORTA_CHIAVE.stato + id, JSON.stringify({ s: 'pronta', c: portaAdessoMs(), t: portaAdessoMs(), n: 0, l: 0 }), PORTA.vitaS);
}

/** La risposta per il NAS, scritta a mano: le richieste sono gia' JSON e non si rileggono. */
function portaRispostaLavori(cache, presi, esito) {
  var pezzi = [];
  presi.forEach(function (p) {
    var t = portaLeggiConservato(cache, PORTA_CHIAVE.richiesta + p.id);
    if (t === null) {
      portaRispondiQui(cache, p.id, { ok: false, rete: true, porta: 'attesa', errore: 'La richiesta si è persa per strada: riprova' });
      return;
    }
    pezzi.push('{"id":' + JSON.stringify(p.id) + ',"prese":' + p.n + ',"inCoda":' + p.inCoda + ',"lavoro":' + t + '}');
  });
  return '{"ok":true,"adesso":' + JSON.stringify(portaIso(portaAdessoMs())) + ',"consegnate":' + esito.consegnate +
    ',"scadute":' + esito.scadute + ',"lavori":[' + pezzi.join(',') + ']}';
}

/**
 * Le risposte del NAS, ognuna al suo posto. Una risposta per una richiesta che
 * non c'e' piu' (scaduta, o gia' consegnata) si conta e si lascia cadere.
 */
function portaConsegna(cache, risposte) {
  var esito = { consegnate: 0, scadute: 0 };
  if (!Array.isArray(risposte) || !risposte.length) return esito;
  var pronte = [];
  risposte.forEach(function (r) {
    if (!r || !portaIdValido(r.id) || r.risposta === undefined) return;
    var s = portaStato(cache, r.id);
    if (!s) { esito.scadute++; return; }
    if (s.s === 'pronta') { esito.consegnate++; return; }
    portaConserva(cache, PORTA_CHIAVE.risposta + r.id, portaJson(r.risposta));
    portaTogliConservato(cache, PORTA_CHIAVE.richiesta + r.id);
    s.s = 'pronta';
    s.t = portaAdessoMs();
    pronte.push([r.id, s]);
    esito.consegnate++;
  });
  if (pronte.length) {
    var voci = {};
    pronte.forEach(function (x) { voci[PORTA_CHIAVE.stato + x[0]] = JSON.stringify(x[1]); });
    cache.putAll(voci, PORTA.vitaS);
  }
  return esito;
}

// ---------------------------------------------------------------------------
// La pulizia
// ---------------------------------------------------------------------------

function portaPuliziaSeServe(cache) {
  if (cache.get(PORTA_CHIAVE.pulizia) !== null) return;
  cache.put(PORTA_CHIAVE.pulizia, '1', PORTA.puliziaOgniS);
  try {
    portaPulizia();
  } catch (e) {
    // La pulizia non deve fermare il lavoro: si riprova fra 15 minuti.
  }
}

/**
 * Toglie dalla coda le richieste consegnate, sparite o troppo vecchie, e da
 * Drive i file temporanei rimasti indietro (una consegna andata a meta').
 * La cache si svuota da sola: ogni voce della porta scade dopo 10 minuti.
 */
function portaPulizia() {
  var cache = CacheService.getScriptCache();
  var ora = portaAdessoMs();
  var tolti = { coda: 0, file: 0 };
  var lucchetto = LockService.getScriptLock();
  if (lucchetto.tryLock(5000)) {
    try {
      var coda = portaCoda(cache);
      var stati = coda.length ? cache.getAll(coda.map(function (id) { return PORTA_CHIAVE.stato + id; })) : {};
      var resta = coda.filter(function (id) {
        var s = null;
        try { s = JSON.parse(stati[PORTA_CHIAVE.stato + id] || 'null'); } catch (e) { s = null; }
        return !!s && s.s !== 'pronta' && ora - s.c <= PORTA.vitaS * 1000;
      });
      tolti.coda = coda.length - resta.length;
      if (tolti.coda) cache.put(PORTA_CHIAVE.coda, JSON.stringify(resta), 2 * PORTA.vitaS);
    } finally {
      lucchetto.releaseLock();
    }
  }
  var cartella = portaCartella(false);
  if (cartella) {
    var file = cartella.getFiles();
    while (file.hasNext()) {
      var f = file.next();
      if (f.isTrashed()) continue;
      if (ora - f.getDateCreated().getTime() > PORTA.temporaneiVecchiMs) {
        portaTogliTemporaneo(f.getId());
        tolti.file++;
      }
    }
  }
  return tolti;
}

// ---------------------------------------------------------------------------
// Le versioni vecchie (il ponte, attraverso la coda)
// ---------------------------------------------------------------------------

/**
 * La richiesta di una versione vecchia (col codice giusto, gia' controllato),
 * nella stessa coda delle app nuove. Il server la fa come il titolare, come il
 * ponte di sempre. Se il server non risponde si lancia un errore: Google
 * risponde con una pagina d'errore, che le app vecchie trattano come "rete" e
 * quindi riprovano (un rapportino in coda non viene scartato).
 */
function portaPerLeVersioniVecchie(richiesta) {
  var p = portaProprieta();
  if (!p.SEGRETO_SERVER) throw new Error('Il server di Wisper non è collegato: riprova fra poco');
  var r = portaChiedi(portaNuovoId('v'), { tipo: 'ponte', dati: richiesta }, portaAttesaApp(p));
  if (r.fermo) {
    if (r.fermo.rete) throw new Error(r.fermo.errore);
    return r.fermo;
  }
  return JSON.parse(r.testo);
}
