/**
 * WISPER - il ponte e il postino (dal passaggio al server sul NAS).
 *
 * Va nello stesso progetto Apps Script di Code.gs, come secondo file (Ponte.gs).
 * Dettagli in docs/gestionale/postino.md.
 *
 * IL PONTE. Dal giorno del cambio i dati stanno sul server di Wisper, nel NAS.
 * Un telefono o un computer rimasti alla versione vecchia continuano a chiamare
 * questo script col CODICE: lo script passa la richiesta al server e
 * restituisce la sua risposta. Cosi' un rapportino rimasto senza rete su un
 * telefono non ancora aggiornato arriva lo stesso, nel posto giusto. Due strade:
 *  - PONTE_PORTA = si (la strada di oggi, docs/gestionale/porta-google.md): la
 *    richiesta va nella coda della porta Google (Porta.gs) e il server sul NAS
 *    viene a prenderla, come quelle delle app nuove;
 *  - SERVER_URL = l'indirizzo del server (solo se un giorno il NAS fosse
 *    raggiungibile da internet): lo script lo chiama con UrlFetch.
 *
 * IL POSTINO. Il server non ha un Gmail: le email ai clienti partono ancora da
 * qui, dal Gmail di chi possiede il foglio, come oggi. In piu' qui arrivano le
 * copie di sicurezza (su Drive, fuori casa) e, ogni notte, la copia dei dati da
 * riscrivere nelle schede del foglio, che resta leggibile. Il postino risponde
 * solo al SEGRETO_SERVER, mai al CODICE: chi ha il codice delle app non puo'
 * mandare email a nome dello studio ne' riscrivere le schede.
 */

var PROP_SERVER_URL = 'SERVER_URL';
var PROP_SEGRETO_SERVER = 'SEGRETO_SERVER';

/** Le schede che il postino puo' riscrivere: le stesse di oggi, mai Accessi o Dispositivi. */
var SCHEDE_DEL_POSTINO = ['Rapportini', 'Clienti', 'Commesse', 'Impostazioni'];

/** Oltre questa misura un file arriva diviso in pezzi (il limite di Apps Script e' intorno ai 50 MB). */
var MASSIMO_BYTE_COPIA = 20 * 1024 * 1024;

/** Il server da cui passa tutto, se il cambio e' gia' stato fatto. */
function indirizzoServer() {
  return testo(PropertiesService.getScriptProperties().getProperty(PROP_SERVER_URL)).replace(/\/+$/, '');
}

/** PONTE_PORTA = si: il cambio e' fatto e le versioni vecchie passano dalla coda della porta Google. */
function pontePorta() {
  return testo(PropertiesService.getScriptProperties().getProperty('PONTE_PORTA')).toLowerCase() === 'si';
}

/** Il cambio e' fatto: i dati stanno sul server (per una strada o per l'altra). */
function ponteAttivo() {
  return indirizzoServer() !== '' || pontePorta();
}

// ---------------------------------------------------------------------------
// Il ponte
// ---------------------------------------------------------------------------

/**
 * La richiesta di una versione vecchia, passata al server cosi' com'e', senza
 * il codice (al server non serve, e non deve girare piu' del necessario).
 *
 * Se il server non risponde si lancia un errore invece di rispondere ok:false:
 * Google restituisce una pagina d'errore, che telefono e computer trattano come
 * "rete" e quindi riprovano. Un ok:false invece fermerebbe la coda del telefono
 * su quel rapportino, come se fosse sbagliato.
 */
function inoltraAlServer(d) {
  // metodo: GET vuol dire che i parametri sono testi ("tutti": "1"), come li legge doGet.
  var richiesta = { metodo: (d && d._metodo) || 'POST' };
  Object.keys(d || {}).forEach(function (k) {
    if (k !== 'codice' && k !== '_metodo') richiesta[k] = d[k];
  });
  // La porta Google: in coda come le richieste delle app nuove (Porta.gs).
  if (!indirizzoServer()) return portaPerLeVersioniVecchie(richiesta);
  var r = UrlFetchApp.fetch(indirizzoServer() + '/ponte', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(richiesta),
    headers: { 'X-Wisper-Segreto': PropertiesService.getScriptProperties().getProperty(PROP_SEGRETO_SERVER) || '' },
    muteHttpExceptions: true,
    followRedirects: true
  });
  var stato = r.getResponseCode();
  if (stato !== 200) throw new Error('Il server di Wisper ha risposto ' + stato + ': riprova fra poco');
  return JSON.parse(r.getContentText());
}

// ---------------------------------------------------------------------------
// Il postino
// ---------------------------------------------------------------------------

function eRichiestaPostino(d) {
  return !!d && typeof d.azione === 'string' && d.azione.indexOf('postino') === 0;
}

/** Confronto che non si ferma alla prima lettera diversa: non dice quanto si e' andati vicini. */
function segretoUguale(a, b) {
  a = String(a); b = String(b);
  var diverso = a.length === b.length ? 0 : 1;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diverso |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diverso === 0;
}

function postino(d) {
  var chi = { azione: testo(d.azione).slice(0, 40), disp: 'server-nas', dispNome: 'Server Wisper (NAS)', app: 'postino' };
  var giusto = PropertiesService.getScriptProperties().getProperty(PROP_SEGRETO_SERVER);
  if (!giusto || !segretoUguale(d.segreto || '', giusto)) {
    registraAccesso(chi, 'rifiutato');
    return json({ ok: false, errore: 'Segreto sbagliato' });
  }
  var risposta;
  try {
    switch (d.azione) {
      case 'postinoEmail': risposta = postinoEmail(d); break;
      case 'postinoCopia': risposta = postinoCopia(d); break;
      case 'postinoFoglio': risposta = postinoFoglio(d); break;
      case 'postinoProva': risposta = { ok: true, quando: quando(new Date()), rimaste: MailApp.getRemainingDailyQuota() }; break;
      default: throw new Error('Azione sconosciuta: ' + d.azione);
    }
  } catch (err) {
    risposta = { ok: false, errore: messaggio(err) };
  }
  registraAccesso(chi, risposta.ok === false ? 'errore' : 'ok');
  return json(risposta);
}

/** Un'email con gli allegati, dal Gmail di chi possiede il foglio. */
function postinoEmail(d) {
  var allegati = (d.allegati || []).map(function (a) {
    return Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime || 'application/pdf', a.nome || 'allegato.pdf');
  });
  if (d.alProprietario === true) {
    avvisa(testo(d.oggetto) || 'Wisper', testo(d.messaggio) || ' ');
    return { ok: true, rimaste: MailApp.getRemainingDailyQuota() };
  }
  var a = testo(d.a);
  if (!a) throw new Error('Manca l\'indirizzo a cui mandare l\'email');
  var opzioni = { attachments: allegati, name: testo(d.nome) || testo(leggiImpostazioni().RAGIONE_SOCIALE) || 'Wisper' };
  if (testo(d.cc)) opzioni.cc = testo(d.cc);
  if (testo(d.rispondiA)) opzioni.replyTo = testo(d.rispondiA);
  MailApp.sendEmail(a, testo(d.oggetto) || 'Wisper', testo(d.messaggio) || ' ', opzioni);
  return { ok: true, rimaste: MailApp.getRemainingDailyQuota() };
}

/**
 * Una copia di sicurezza su Drive, in Wisper/Copie NAS/<cartella>/. Un file con
 * lo stesso nome va nel cestino di Drive (da cui si recupera) e lascia il posto
 * a quello nuovo: la copia del database di stanotte sostituisce quella di
 * stanotte, non quella di ieri, perche' ogni notte ha il suo nome.
 */
function postinoCopia(d) {
  var cartella = testo(d.cartella);
  if (['database', 'file'].indexOf(cartella) < 0) throw new Error('Cartella delle copie non valida: ' + cartella);
  var nome = testo(d.nome);
  if (!nome || /[\/\\]/.test(nome)) throw new Error('Nome del file non valido');
  if (!d.base64) throw new Error('File vuoto');
  var byte = Utilities.base64Decode(d.base64);
  if (byte.length > MASSIMO_BYTE_COPIA) throw new Error('File troppo grande: dividilo in pezzi da 20 MB');
  var dove = sottocartella(sottocartella(cartellaRadice(), 'Copie NAS'), cartella);
  var vecchi = dove.getFilesByName(nome);
  while (vecchi.hasNext()) vecchi.next().setTrashed(true);
  var file = dove.createFile(Utilities.newBlob(byte, d.mime || 'application/octet-stream', nome));
  PropertiesService.getScriptProperties().setProperty('ULTIMA_COPIA_' + cartella.toUpperCase(), String(new Date().getTime()));
  return { ok: true, id: file.getId() };
}

/**
 * La copia notturna dei dati nelle schede del foglio, nello stesso formato di
 * oggi: chi apre il foglio continua a trovarci rapportini, clienti e commesse.
 * Solo a ponte acceso: prima del cambio le schede sono ancora i dati veri, e
 * il postino non deve mai riscriverle.
 */
function postinoFoglio(d) {
  if (!ponteAttivo()) throw new Error('Il foglio si riscrive solo dopo il cambio (manca PONTE_PORTA = si)');
  var nome = testo(d.scheda);
  if (SCHEDE_DEL_POSTINO.indexOf(nome) < 0) throw new Error('Scheda non valida: ' + nome);
  var intestazioni = (d.intestazioni || []).map(testo);
  if (!intestazioni.length) throw new Error('Mancano le intestazioni');
  var righe = (d.righe || []).map(function (r) {
    return intestazioni.map(function (h, i) {
      var v = r[i] === undefined || r[i] === null ? '' : r[i];
      // Le date arrivano come aaaa-mm-gg o come istanti ISO: nel foglio tornano date vere.
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return new Date(v.length === 10 ? v + 'T00:00:00' : v);
      return perLaCella(h, v);
    });
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var f = ss.getSheetByName(nome) || ss.insertSheet(nome);
  if (f.getLastRow() > 0) f.getRange(1, 1, f.getLastRow(), Math.max(f.getLastColumn(), intestazioni.length)).clearContent();
  f.getRange(1, 1, 1, intestazioni.length).setValues([intestazioni]);
  if (righe.length) f.getRange(2, 1, righe.length, intestazioni.length).setValues(righe);
  return { ok: true, righe: righe.length };
}

// ---------------------------------------------------------------------------
// I controlli del mattino
// ---------------------------------------------------------------------------

/**
 * Da eseguire una volta dall'editor dopo il cambio: crea l'attivatore che ogni
 * mattina alle 7 guarda se il server risponde e se la copia di stanotte e'
 * arrivata. Google chiede il permesso per gli attivatori la prima volta.
 */
function installaControlli() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'controlloMattina') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('controlloMattina').timeBased().everyDays(1).atHour(7).create();
  Logger.log('Controllo delle 7 installato.');
}

function controlloMattina() {
  if (!ponteAttivo()) return;
  var problemi = [];
  if (indirizzoServer()) {
    try {
      var r = UrlFetchApp.fetch(indirizzoServer() + '/salute', { muteHttpExceptions: true, followRedirects: true });
      var salute = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
      if (!salute || salute.ok !== true) problemi.push('Il server di Wisper non risponde bene (risposta ' + r.getResponseCode() + ').');
    } catch (err) {
      problemi.push('Il server di Wisper non risponde: ' + messaggio(err) + '.');
    }
  } else {
    // La porta Google: il NAS non si raggiunge, ma viene lui a prendere il lavoro ogni pochi secondi.
    var ultimo = Number(CacheService.getScriptCache().get('porta:nas') || 0);
    if (!ultimo) problemi.push('Il server di Wisper non si fa vivo con Google da più di 6 ore.');
    else if (new Date().getTime() - ultimo > 30 * 60 * 1000) problemi.push('Il server di Wisper non si fa vivo con Google dal ' + quando(new Date(ultimo)) + '.');
  }
  var ultima = Number(PropertiesService.getScriptProperties().getProperty('ULTIMA_COPIA_DATABASE') || 0);
  if (new Date().getTime() - ultima > 50 * 3600 * 1000) {
    problemi.push(ultima ? 'L\'ultima copia del database su Drive e\' del ' + quando(new Date(ultima)) + '.' : 'Su Drive non e\' ancora arrivata nessuna copia del database.');
  }
  if (!problemi.length) return;
  avvisaUnaVolta('controlloMattina', 12 * 3600, 'Wisper: qualcosa non va sul server',
    problemi.join('\n') + '\n\n' +
    'Telefoni e computer intanto tengono i rapportini e li mandano appena il server torna.\n' +
    'Cosa guardare: che il NAS sia acceso e collegato a internet; poi, sul NAS, che il contenitore "wisper" sia in funzione.');
}
