/*
 * Entrare e uscire dal portale (fase7.md §3.4, §7.1, con la strada Google di §0.4): niente password, un'email sola con
 * un link e un codice, monouso, 10 minuti. Niente cookie: la sessione e' un token di 32 byte che il server da' con
 * codice, link e azienda, e la pagina tiene in sessionStorage; la pre-sessione ("pre") e' un valore casuale che la pagina
 * crea e manda con entra e codice: il codice vale solo con la stessa pre-sessione. Nel database solo lo SHA-256.
 *
 * Limiti (§0.4, §6.4): per referente 5 richieste di link all'ora e 10 al giorno; per tutto il portale 60 all'ora (oltre:
 * la stessa risposta di sempre, nessuna email, riga "bloccato"); 5 errori su un codice; 10 errori all'ora per referente
 * fermano gli ingressi per un'ora.
 */
'use strict';

const crypto = require('node:crypto');
const { testo, adesso, adessoMs, istante, sha256, oggi } = require('../utili');

const RE_PRE = /^[A-Za-z0-9_-]{16,200}$/;
const RE_TOKEN = /^[A-Za-z0-9_-]{30,100}$/;
const NON_GIUSTO = 'Il codice non è giusto o non vale più: chiedi un\'email nuova';
const TROPPI = 'Troppi tentativi: riprova fra un\'ora o chiama lo studio';

const errore = (stato, frase, extra) => Object.assign({ ok: false, stato, errore: frase }, extra || {});
const fraTot = minuti => istante(new Date(adessoMs() - minuti * 60000));
const stessi = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** I referenti col portale acceso di questa email (in aziende col portale acceso), in ordine fisso: l'n di "Per quale azienda?". */
function referentiDellEmail(w, email) {
  return w.db.righe("SELECT r.*, s.nome AS azienda FROM referenti r JOIN soggetti s ON s.id = r.soggetto_id WHERE r.portale = 1 AND s.portale = 1 AND r.email <> '' " +
    'AND lower(r.email) = lower(?) ORDER BY r.id', testo(email)).map((r, i) => Object.assign(r, { n: i + 1 }));
}

function contaTentativi(w, chiave, tipo, minuti) {
  return w.db.riga('SELECT COUNT(*) n FROM portale_tentativi WHERE chiave = ? AND tipo = ? AND quando >= ?', chiave, tipo, fraTot(minuti)).n;
}

function segnaTentativo(w, chiave, tipo) {
  w.db.esegui('INSERT INTO portale_tentativi (chiave, quando, tipo) VALUES (?, ?, ?)', chiave, adesso(), tipo);
}

/** Una sessione nuova (identificativo nuovo a ogni ingresso). Torna {token, id}. */
function nuovaSessione(w, ref, agente, o) {
  o = o || {};
  const imp = w.impPortale();
  const token = crypto.randomBytes(32).toString('base64url');
  const ora = adessoMs();
  const durataMs = o.anteprima ? 30 * 60000 : imp.sessioneOre * 3600000;
  const r = w.db.esegui('INSERT INTO portale_sessioni (token_hash, referente_id, soggetto_id, creata, ultimo_uso, scade_il, ip, agente, anteprima_utente_id) VALUES (?,?,?,?,?,?,?,?,?)',
    sha256(token), ref.id, ref.soggetto_id, istante(new Date(ora)), istante(new Date(ora)), istante(new Date(ora + durataMs)), '', testo(agente).slice(0, 40), o.anteprima || null);
  return { token, id: Number(r.lastInsertRowid) };
}

/** Il referente entra: primo ingresso, ultimo accesso, registro. */
function entrato(w, ref, sessione, agente, anteprima) {
  if (anteprima) return;
  const ora = adesso();
  const v = { ultimo_accesso: ora };
  if (!ref.portale_dal) v.portale_dal = ora;
  w.db.esegui('UPDATE referenti SET ultimo_accesso = ?, portale_dal = ? WHERE id = ?', v.ultimo_accesso, v.portale_dal || ref.portale_dal, ref.id);
  w.accessoPortale({ referente_id: ref.id, soggetto_id: ref.soggetto_id, sessione_id: sessione.id, azione: 'entrato', agente });
}

/** La risposta di un ingresso riuscito (codice, link, azienda). */
function rispostaIngresso(w, ref, sessione, destinazione) {
  const imp = w.impPortale();
  return { ok: true, stato: 200, destinazione: testo(destinazione), informativa: ref.informativa_versione !== imp.informativaData, sessione: sessione.token };
}

/** "f•••••••@rossi.example": l'email accorciata. */
function emailAccorciata(e) {
  const [nome, dominio] = String(e).split('@');
  return (nome ? nome.charAt(0) + '•'.repeat(Math.max(1, nome.length - 1)) : '') + '@' + (dominio || '');
}

/**
 * Il lavoro di "entra" dopo la risposta (sempre la stessa, subito): cerca l'email, guarda i limiti, crea il link e il
 * codice, manda l'email d'accesso. Mai l'email in chiaro di chi non ha l'accesso: solo il suo SHA-256 nei tentativi.
 */
async function lavoroEntra(w, email, destinazione, pre, agente) {
  const refs = referentiDellEmail(w, email);
  const chiaveEmail = 'email:' + sha256(email.toLowerCase());
  const pronto = w.db.transazione(() => {
    const generale = contaTentativi(w, 'portale', 'link', 60);
    segnaTentativo(w, 'portale', 'link');
    if (!refs.length) { segnaTentativo(w, chiaveEmail, 'link'); return null; }
    const oraN = contaTentativi(w, chiaveEmail, 'link', 60);
    const giornoN = contaTentativi(w, chiaveEmail, 'link', 24 * 60);
    segnaTentativo(w, chiaveEmail, 'link');
    const fermoCodici = contaTentativi(w, 'codice:' + refs[0].id, 'codice_sbagliato', 60) >= 10;
    if (generale >= 60 || oraN >= 5 || giornoN >= 10 || fermoCodici) {
      for (const r of refs) w.accessoPortale({ referente_id: r.id, soggetto_id: r.soggetto_id, azione: 'bloccato', esito: 'no', agente });
      return null;
    }
    // I link d'accesso di prima di questa email non valgono piu' (un codice alla volta).
    w.annullaLinkPortale("tipo = 'accesso' AND referente_id IN (" + refs.map(() => '?').join(',') + ')', refs.map(r => r.id));
    const imp = w.impPortale();
    const link = w.creaLinkPortale(refs[0].id, 'accesso', { minuti: imp.linkMinuti, pre, destinazione });
    for (const r of refs) w.accessoPortale({ referente_id: r.id, soggetto_id: r.soggetto_id, azione: 'link_chiesto', agente });
    return { link, imp };
  });
  if (!pronto) return;
  const { link, imp } = pronto;
  const r = refs[0];
  const testoEmail = 'Buongiorno ' + r.nome + ',\nil codice per entrare nel portale di ' + imp.studio.nome + ' è ' + link.codice + '.\nOppure apra questo link: ' +
    w.indirizzoLink(link.token) + '\nCodice e link valgono ' + imp.linkMinuti + ' minuti e si usano una volta.\nSe non ha chiesto lei di entrare, ignori questa email: senza il codice nessuno entra.\n' +
    imp.studio.nome + ' · ' + imp.studio.telefono;
  try {
    await w.mandaEmailPortale(r.email, 'Entra nel portale di ' + imp.studio.nome, testoEmail, 1);
  } catch (err) {
    console.error('[portale] email d\'accesso: ' + (err && err.message ? err.message : err));
  }
}

/** POST entra {email, destinazione}: la risposta e' sempre la stessa e arriva prima di cercare l'email. */
function entra(w, lavoro) {
  const c = lavoro.corpo || {};
  const email = testo(c.email);
  if (!/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 200) return errore(400, 'Scrivi un\'email intera, per esempio nome@azienda.it');
  const pre = testo(lavoro.pre);
  if (!RE_PRE.test(pre)) return errore(400, 'Ricarica la pagina e riprova');
  const imp = w.impPortale();
  // Quota finita: lo stesso a tutti, cosi' non svela niente (§3.12).
  if (!w.emailPortalePuo(1)) {
    return errore(503, 'Adesso non riusciamo a mandare l\'email: riprova domani o chiama lo studio allo ' + imp.studio.telefono, { quota: true });
  }
  const destinazione = /^[a-z]{3,12}(\/\d{1,10})?$/.test(testo(c.destinazione)) ? testo(c.destinazione) : '';
  const lavoroDopo = () => lavoroEntra(w, email, destinazione, pre, lavoro.agente).catch(err => console.error('[portale] entra: ' + (err && err.stack ? err.stack : err)));
  // Dopo la risposta, sempre (anche nelle prove, che possono aspettare w.portaleInCorso): stesso tempo per ogni email.
  const dopo = new Promise(r => setImmediate(r)).then(lavoroDopo);
  if (w.portaleSincrono) w.portaleInCorso = dopo;
  return { ok: true, stato: 200, frase: 'Se ' + email + ' è tra gli indirizzi abilitati, ti è arrivata un\'email con un link e un codice. Valgono ' + imp.linkMinuti + ' minuti.' };
}

/** POST codice {email, codice} con la stessa pre-sessione di entra. */
function codice(w, lavoro) {
  const c = lavoro.corpo || {};
  const email = testo(c.email);
  const cod = testo(c.codice).replace(/\s/g, '');
  const pre = testo(lavoro.pre);
  const refs = email ? referentiDellEmail(w, email) : [];
  if (!refs.length || !/^\d{6}$/.test(cod) || !RE_PRE.test(pre)) return errore(401, NON_GIUSTO);
  if (contaTentativi(w, 'codice:' + refs[0].id, 'codice_sbagliato', 60) >= 10) return errore(429, TROPPI);
  const imp = w.impPortale();
  const link = w.db.riga("SELECT * FROM portale_link WHERE tipo = 'accesso' AND referente_id IN (" + refs.map(() => '?').join(',') + ') AND usato_il IS NULL AND annullato_il IS NULL ' +
    'ORDER BY id DESC LIMIT 1', ...refs.map(r => r.id));
  const sbagliato = () => {
    w.db.transazione(() => {
      segnaTentativo(w, 'codice:' + refs[0].id, 'codice_sbagliato');
      if (link) {
        w.db.esegui('UPDATE portale_link SET tentativi = tentativi + 1 WHERE id = ?', link.id);
        if (link.tentativi + 1 >= imp.codiceTentativi) w.db.esegui('UPDATE portale_link SET annullato_il = ? WHERE id = ?', adesso(), link.id);
      }
      for (const r of refs) w.accessoPortale({ referente_id: r.id, soggetto_id: r.soggetto_id, azione: 'codice_sbagliato', esito: 'no', agente: lavoro.agente });
    });
    return errore(401, NON_GIUSTO);
  };
  if (!link || Date.parse(link.scade) <= adessoMs() || !link.pre_hash || !stessi(link.pre_hash, sha256(pre))) return sbagliato();
  if (!stessi(link.codice_hash, w.hmacCodice(link.referente_id, cod))) return sbagliato();
  return w.db.transazione(() => {
    w.db.esegui('UPDATE portale_link SET usato_il = ? WHERE id = ?', adesso(), link.id);
    if (refs.length > 1) {
      // Piu' aziende con la stessa email: la sessione vale solo per scegliere (azienda) o uscire.
      const s = nuovaSessione(w, refs[0], lavoro.agente);
      w.db.esegui('UPDATE portale_sessioni SET da_scegliere = 1 WHERE id = ?', s.id);
      return { ok: true, stato: 200, scegli: refs.map(r => ({ n: r.n, azienda: r.azienda })), sessione: s.token, destinazione: link.destinazione };
    }
    const s = nuovaSessione(w, refs[0], lavoro.agente);
    entrato(w, refs[0], s, lavoro.agente);
    return rispostaIngresso(w, refs[0], s, link.destinazione);
  });
}

/** POST link {token}: il link dell'email (accesso, avviso, invito, anteprima). Solo la POST del pulsante lo consuma. */
function link(w, lavoro) {
  const t = testo((lavoro.corpo || {}).token);
  const nonVale = nuovo => errore(401, 'Questo link non vale più', { nuovo: !!nuovo });
  if (!RE_TOKEN.test(t)) return nonVale(false);
  const l = w.db.riga('SELECT * FROM portale_link WHERE token_hash = ?', sha256(t));
  if (!l) return nonVale(false);
  const ref = w.db.riga('SELECT r.*, s.portale AS soggetto_portale FROM referenti r JOIN soggetti s ON s.id = r.soggetto_id WHERE r.id = ?', l.referente_id);
  const haAccesso = !!ref && ref.portale === 1 && ref.soggetto_portale === 1;
  if (l.usato_il || l.annullato_il || Date.parse(l.scade) <= adessoMs() || !haAccesso) {
    if (ref) w.accessoPortale({ referente_id: ref.id, soggetto_id: ref.soggetto_id, azione: 'link_scaduto', esito: 'no', agente: lavoro.agente });
    return nonVale(haAccesso && l.tipo !== 'anteprima');
  }
  return w.db.transazione(() => {
    w.db.esegui('UPDATE portale_link SET usato_il = ? WHERE id = ?', adesso(), l.id);
    const anteprima = l.tipo === 'anteprima' ? (l.anteprima_utente_id || -1) : null;
    const s = nuovaSessione(w, ref, lavoro.agente, { anteprima });
    entrato(w, ref, s, lavoro.agente, !!anteprima);
    return rispostaIngresso(w, ref, s, l.destinazione);
  });
}

/** POST link-nuovo {token}: un link di 10 minuti alla stessa email, senza scrivere niente (stessi limiti di entra). */
function linkNuovo(w, lavoro) {
  const t = testo((lavoro.corpo || {}).token);
  const l = RE_TOKEN.test(t) ? w.db.riga('SELECT * FROM portale_link WHERE token_hash = ?', sha256(t)) : null;
  const ref = l ? w.db.riga('SELECT r.*, s.portale AS soggetto_portale FROM referenti r JOIN soggetti s ON s.id = r.soggetto_id WHERE r.id = ?', l.referente_id) : null;
  if (!l || l.tipo === 'anteprima' || !ref || ref.portale !== 1 || ref.soggetto_portale !== 1) return errore(401, 'Questo link non vale più', { nuovo: false });
  if (!w.emailPortalePuo(1)) return errore(503, 'Adesso non riusciamo a mandare l\'email: riprova domani o chiama lo studio allo ' + w.impPortale().studio.telefono, { quota: true });
  const pre = RE_PRE.test(testo(lavoro.pre)) ? testo(lavoro.pre) : '';
  const lavoroDopo = () => lavoroEntra(w, ref.email, l.destinazione, pre, lavoro.agente).catch(err => console.error('[portale] link nuovo: ' + (err && err.stack ? err.stack : err)));
  // Dopo la risposta, sempre (anche nelle prove, che possono aspettare w.portaleInCorso): stesso tempo per ogni email.
  const dopo = new Promise(r => setImmediate(r)).then(lavoroDopo);
  if (w.portaleSincrono) w.portaleInCorso = dopo;
  return { ok: true, stato: 200, frase: 'Ti abbiamo mandato un link nuovo a ' + emailAccorciata(ref.email) };
}

/**
 * La sessione della richiesta: il token (SHA-256) aperto, non scaduto (30 minuti senza uso, 8 ore comunque), referente
 * e cliente ancora col portale. Torna {s, ref, sog} o null (e chiude quella scaduta).
 */
function sessioneValida(w, token) {
  const t = testo(token);
  if (!RE_TOKEN.test(t)) return null;
  const s = w.db.riga('SELECT * FROM portale_sessioni WHERE token_hash = ?', sha256(t));
  if (!s || s.chiusa_il) return null;
  const imp = w.impPortale();
  const ora = adessoMs();
  if (ora - Date.parse(s.ultimo_uso) > imp.sessioneMinuti * 60000 || ora >= Date.parse(s.scade_il)) {
    w.db.esegui("UPDATE portale_sessioni SET chiusa_il = ?, motivo_chiusura = 'scaduta' WHERE id = ? AND chiusa_il IS NULL", adesso(), s.id);
    w.accessoPortale({ referente_id: s.referente_id, soggetto_id: s.soggetto_id, sessione_id: s.id, azione: 'scaduta', agente: s.agente });
    return null;
  }
  const ref = w.db.riga('SELECT * FROM referenti WHERE id = ?', s.referente_id);
  const sog = ref ? w.db.riga('SELECT * FROM soggetti WHERE id = ?', ref.soggetto_id) : null;
  if (!ref || ref.portale !== 1 || !sog || sog.portale !== 1 || ref.soggetto_id !== s.soggetto_id) {
    w.db.esegui("UPDATE portale_sessioni SET chiusa_il = ?, motivo_chiusura = 'tolto' WHERE id = ? AND chiusa_il IS NULL", adesso(), s.id);
    return null;
  }
  // L'ultimo uso al massimo ogni 30 secondi (non serve di piu').
  if (ora - Date.parse(s.ultimo_uso) > 30000) w.db.esegui('UPDATE portale_sessioni SET ultimo_uso = ? WHERE id = ?', adesso(), s.id);
  return { s, ref, sog };
}

/** POST esci {tutti}: chiude questa sessione (o tutte quelle del referente) sul server. */
function esci(w, ctx) {
  const tutti = (ctx.lavoro.corpo || {}).tutti === true;
  w.db.transazione(() => {
    if (tutti) w.chiudiSessioniPortale('referente_id = ?', [ctx.ref.id], 'tutti');
    else w.chiudiSessioniPortale('id = ?', [ctx.s.id], 'esci');
    if (!ctx.s.anteprima_utente_id) w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'uscito', agente: ctx.agente });
  });
  return { ok: true, stato: 200 };
}

/** POST informativa {}: la presa visione (non un consenso). */
function informativa(w, ctx) {
  w.db.esegui('UPDATE referenti SET informativa_il = ?, informativa_versione = ? WHERE id = ?', adesso(), ctx.imp.informativaData, ctx.ref.id);
  return { ok: true, stato: 200 };
}

/** POST azienda {n}: completa l'ingresso con piu' aziende, o Cambia azienda (chiude la sessione di prima, motivo azienda). */
function azienda(w, ctx) {
  const n = Number((ctx.lavoro.corpo || {}).n);
  const refs = referentiDellEmail(w, ctx.ref.email);
  const scelto = refs.find(r => r.n === n);
  if (!scelto) return errore(400, 'Scegli l\'azienda');
  return w.db.transazione(() => {
    w.chiudiSessioniPortale('id = ?', [ctx.s.id], 'azienda');
    const s = nuovaSessione(w, scelto, ctx.agente);
    if (ctx.s.da_scegliere) entrato(w, scelto, s, ctx.agente);
    else {
      w.db.esegui('UPDATE referenti SET ultimo_accesso = ?, portale_dal = CASE WHEN portale_dal = \'\' THEN ? ELSE portale_dal END WHERE id = ?', adesso(), adesso(), scelto.id);
      w.accessoPortale({ referente_id: scelto.id, soggetto_id: scelto.soggetto_id, sessione_id: s.id, azione: 'azienda', agente: ctx.agente });
    }
    const r = rispostaIngresso(w, scelto, s, '');
    return { ok: true, stato: 200, destinazione: '', informativa: r.informativa, sessione: s.token };
  });
}

module.exports = { entra, codice, link, linkNuovo, sessioneValida, esci, informativa, azienda, referentiDellEmail, emailAccorciata, nuovaSessione, contaTentativi, segnaTentativo };
