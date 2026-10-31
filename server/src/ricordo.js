/*
 * Le richieste gia' fatte: una scrittura ripetuta con lo stesso idRichiesta non
 * si fa due volte (docs/gestionale/porta-google.md §6).
 *
 * Succede quando la risposta si perde per strada: il telefono ha mandato
 * "salva il referente", il server l'ha salvato, ma la risposta non e' tornata
 * (la rete di casa e' caduta, Google ha chiuso la chiamata, l'app ha smesso di
 * aspettare). L'app riprova, anche da un'altra strada (casa o Google), con lo
 * stesso idRichiesta: il server riconosce l'id e ridà la risposta di prima.
 *
 *  - Solo le scritture (azioni che scrivono o che vogliono una POST): una
 *    lettura ripetuta non fa danni e la risposta giusta e' quella di adesso.
 *  - Solo le risposte ok:true: un "no" o un "riprova" si rifanno.
 *  - Mai una risposta con dentro un token o una password (accedi, la password
 *    nuova da dettare): quelle si rifanno, non si tengono nel database.
 *  - Vale solo per lo stesso token: con un altro accesso l'id non vale.
 *  - Si tiene un giorno (le code delle app riprovano in pochi minuti).
 * Due richieste con lo stesso id nello stesso momento: la seconda aspetta la prima.
 *
 * La tabella si crea all'avvio se manca (come colonneIndirizzo in wisper.js: la
 * migrazione 007 e' promessa alla fase 7).
 */
'use strict';

const { testo, sha256, adesso, adessoMs, istante } = require('./utili');

const UN_GIORNO = 24 * 3600 * 1000;
const RISPOSTA_MASSIMA = 256 * 1024;
const RE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const RE_SEGRETI = /"(token|password|passwordIniziale|passwordNuova|nuovaPassword)"\s*:/i;

function preparaRicordo(w) {
  w.db.db.exec('CREATE TABLE IF NOT EXISTS richieste_fatte (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, azione TEXT NOT NULL, quando TEXT NOT NULL, risposta TEXT NOT NULL)');
  w.db.db.exec('CREATE INDEX IF NOT EXISTS richieste_fatte_quando ON richieste_fatte(quando)');
  if (!w.richiesteInCorso) w.richiesteInCorso = new Map();
}

/**
 * Fa fn() una volta sola per idRichiesta.
 * @param voce  la voce dell'azione in AZIONI (richieste.js), per sapere se scrive
 */
async function conRicordo(w, idRichiesta, token, azione, voce, fn) {
  const id = testo(idRichiesta);
  if (!RE_ID.test(id) || !voce || !(voce.scrive || voce.soloPost) || azione === 'accedi') return fn();
  if (!w.richiesteInCorso) preparaRicordo(w);
  const chiave = sha256(String(token || '')) + ':' + id;
  if (w.richiesteInCorso.has(chiave)) return w.richiesteInCorso.get(chiave);
  const lavoro = (async () => {
    const th = sha256(String(token || ''));
    const gia = w.db.riga('SELECT token_hash, risposta FROM richieste_fatte WHERE id = ?', id);
    if (gia && gia.token_hash === th) {
      try { return JSON.parse(gia.risposta); } catch (e) { /* rovinata: si rifa' */ }
    }
    const r = await fn();
    try {
      const t = JSON.stringify(r);
      if (r && r.ok === true && t.length <= RISPOSTA_MASSIMA && !RE_SEGRETI.test(t)) {
        w.db.esegui('INSERT OR REPLACE INTO richieste_fatte (id, token_hash, azione, quando, risposta) VALUES (?, ?, ?, ?, ?)', id, th, testo(azione).slice(0, 40), adesso(), t);
      }
      puliziaRicordo(w);
    } catch (e) {
      // Ricordare non deve fermare la risposta: al peggio una ripetizione si rifa'.
    }
    return r;
  })();
  w.richiesteInCorso.set(chiave, lavoro);
  try {
    return await lavoro;
  } finally {
    w.richiesteInCorso.delete(chiave);
  }
}

/** Una volta all'ora, via quelle di piu' di un giorno fa. */
function puliziaRicordo(w) {
  const ora = adessoMs();
  if (w.ultimaPuliziaRicordo && ora - w.ultimaPuliziaRicordo < 3600 * 1000) return;
  w.ultimaPuliziaRicordo = ora;
  w.db.esegui('DELETE FROM richieste_fatte WHERE quando < ?', istante(new Date(ora - UN_GIORNO)));
}

module.exports = { preparaRicordo, conRicordo, RE_ID };
