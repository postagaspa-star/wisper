/*
 * Il router del portale clienti (fase7.md §0.2, §6.1, §6.4, §7). Il portale passa da Google: la pagina (Netlify) manda
 * ogni richiesta allo script del portale, il NAS la va a prendere con un secondo giro di porta.js (soloPortale) e la
 * passa qui: w.portale.richiesta(lavoro), con lavoro = {strada, metodo, sessione, pre, corpo, agente, v, id}.
 * In prova la stessa cosa arriva da --porta-portale (avvio.js), un ascolto locale che parla come lo script.
 *
 * Un ELENCO CHIUSO di strade: quello che non e' qui risponde 404 "Non trovato", sempre uguale, per ogni metodo. La
 * risposta e' il JSON di §7 con in piu' "stato" (il codice HTTP che §7 dava): lo script risponde sempre HTTP 200.
 *
 * Il codice del portale e' separato: non importa richieste.js, azioni/ ne' permessi.js (prove/portale-confini.test.js).
 * Chiama per nome un elenco corto di funzioni del server (i conti della fase 2, il cuore di accettaPreventivo, della
 * firma del rapportino e di salvaTicket, i file, il postino, le pubblicazioni) e risponde solo con le viste a elenco
 * chiuso di viste.js.
 */
'use strict';

const { Rifiuto, testo, adesso, adessoMs, oggi, dataIso, dataOraIso, idCasuale, sha256 } = require('../utili');
const C = require('../conti');
const K = require('../comunicazioni');
const { conRicordo } = require('../ricordo');
const S = require('./sessioni');
const V = require('./viste');
const F = require('./file');

const VERSIONE_PROTOCOLLO = 1;
const RE_STRADA = /^[a-z-]+(\/[A-Za-z0-9_.-]{1,200}){0,3}$/;
const NON_TROVATO = Object.freeze({ ok: false, stato: 404, errore: 'Non trovato' });
const KB = 1024;
const MB = 1048576;
/** Oltre questa misura un file non passa da Google (porta-google.md §14bis). */
const SCARICA_MAX = 25 * MB;

const errore = (stato, frase, extra) => Object.assign({ ok: false, stato, errore: frase }, extra || {});
const nonTrovato = () => Object.assign({}, NON_TROVATO);

/** Una finestra di tempo in memoria per i limiti delle letture (300 ogni 5 minuti per sessione, 1.500 per tutto il portale). */
class Finestra {
  constructor(ms) { this.ms = ms; this.voci = new Map(); }
  conta(chiave) {
    const ora = Date.now();
    const l = (this.voci.get(chiave) || []).filter(t => ora - t < this.ms);
    l.push(ora);
    this.voci.set(chiave, l);
    if (this.voci.size > 5000) for (const [k, v] of this.voci) if (!v.length || ora - v[v.length - 1] > this.ms) this.voci.delete(k);
    return l.length;
  }
}

/**
 * Le strade: metodo + forma -> gestore. nome: come la chiama il registro; pubblica: senza sessione; cambia: una POST che
 * cambia qualcosa (in anteprima 403); corpo: il massimo del corpo in byte (64 KB di base).
 */
const STRADE = [
  { metodo: 'GET', re: /^studio$/, nome: 'studio', pubblica: true, fn: studio },
  { metodo: 'POST', re: /^entra$/, nome: 'entra', pubblica: true, fn: (w, x) => S.entra(w, x.lavoro) },
  { metodo: 'POST', re: /^codice$/, nome: 'codice', pubblica: true, fn: (w, x) => S.codice(w, x.lavoro) },
  { metodo: 'POST', re: /^link$/, nome: 'link', pubblica: true, fn: (w, x) => S.link(w, x.lavoro) },
  { metodo: 'POST', re: /^link-nuovo$/, nome: 'link-nuovo', pubblica: true, fn: (w, x) => S.linkNuovo(w, x.lavoro) },
  { metodo: 'GET', re: /^condiviso\/([A-Za-z0-9_-]{8,100})$/, nome: 'condiviso', pubblica: true, fn: condiviso },
  { metodo: 'GET', re: /^condiviso\/([A-Za-z0-9_-]{8,100})\/scarica$/, nome: 'condiviso', pubblica: true, fn: condivisoScarica },
  { metodo: 'POST', re: /^esci$/, nome: 'esci', scegliendo: true, fn: (w, x) => S.esci(w, x) },
  { metodo: 'POST', re: /^informativa$/, nome: 'informativa', cambia: true, fn: (w, x) => S.informativa(w, x) },
  { metodo: 'POST', re: /^azienda$/, nome: 'azienda', cambia: true, scegliendo: true, fn: (w, x) => S.azienda(w, x) },
  { metodo: 'GET', re: /^io$/, nome: 'io', fn: (w, x) => V.io(x) },
  { metodo: 'GET', re: /^casa$/, nome: 'casa', fn: (w, x) => V.casa(x) },
  { metodo: 'GET', re: /^preventivi$/, nome: 'preventivi', permesso: 'preventivi', fn: (w, x) => V.elencoPreventivi(x) },
  { metodo: 'GET', re: /^preventivi\/(\d{1,10})$/, nome: 'preventivo', fn: (w, x, m) => dettaglio(x, m[1], ['preventivo'], v => ({ preventivo: V.preventivo(x, v) })) },
  { metodo: 'GET', re: /^rapportini$/, nome: 'rapportini', permesso: 'rapportini', fn: (w, x) => V.elencoRapportini(x) },
  { metodo: 'GET', re: /^rapportini\/(\d{1,10})$/, nome: 'rapportino', fn: (w, x, m) => dettaglio(x, m[1], ['rapportino'], v => ({ rapportino: V.rapportino(x, v) })) },
  { metodo: 'GET', re: /^documenti$/, nome: 'documenti', permesso: 'documenti', fn: (w, x) => V.elencoDocumenti(x) },
  { metodo: 'GET', re: /^fatture$/, nome: 'fatture', permesso: 'fatture', fn: (w, x) => V.elencoFatture(x) },
  { metodo: 'GET', re: /^fatture\/(\d{1,10})$/, nome: 'fattura', fn: (w, x, m) => dettaglio(x, m[1], ['fattura'], v => ({ fattura: V.fattura(x, v) })) },
  { metodo: 'GET', re: /^richieste$/, nome: 'richieste', permesso: 'richieste', fn: (w, x) => V.elencoRichieste(x) },
  { metodo: 'GET', re: /^richieste\/(\d{1,10})$/, nome: 'richiesta', fn: (w, x, m) => dettaglio(x, m[1], ['ticket'], v => ({ richiesta: V.richiesta(x, v) })) },
  { metodo: 'GET', re: /^accessi$/, nome: 'accessi', fn: (w, x) => V.accessi(x) },
  { metodo: 'GET', re: /^scarica\/([A-Za-z0-9_-]{8,400}\.[A-Za-z0-9_-]{43})$/, nome: 'scarica', fn: (w, x, m) => scarica(x, m[1], false) },
  { metodo: 'GET', re: /^immagine\/([A-Za-z0-9_-]{8,400}\.[A-Za-z0-9_-]{43})$/, nome: 'immagine', fn: (w, x, m) => scarica(x, m[1], true) },
  { metodo: 'POST', re: /^preventivi\/(\d{1,10})\/anteprima$/, nome: 'anteprima', fn: anteprimaPreventivo },
  { metodo: 'POST', re: /^preventivi\/(\d{1,10})\/accetta$/, nome: 'accetta', cambia: true, corpo: 300 * KB, fn: accetta },
  { metodo: 'POST', re: /^preventivi\/(\d{1,10})\/rifiuta$/, nome: 'rifiuta', cambia: true, fn: rifiuta },
  { metodo: 'POST', re: /^preventivi\/(\d{1,10})\/domanda$/, nome: 'domanda', cambia: true, fn: domanda },
  { metodo: 'POST', re: /^rapportini\/(\d{1,10})\/firma$/, nome: 'firma', cambia: true, corpo: 300 * KB, fn: firma },
  { metodo: 'POST', re: /^rapportini\/(\d{1,10})\/segnala$/, nome: 'segnala', cambia: true, fn: segnala },
  { metodo: 'POST', re: /^carica$/, nome: 'carica', cambia: true, corpo: -1, fn: carica },
  { metodo: 'POST', re: /^documenti$/, nome: 'documento', cambia: true, fn: nuovoDocumento },
  { metodo: 'POST', re: /^richieste$/, nome: 'richiesta nuova', cambia: true, fn: nuovaRichiesta },
  { metodo: 'POST', re: /^richieste\/(\d{1,10})\/messaggio$/, nome: 'messaggio', cambia: true, fn: messaggio },
  { metodo: 'POST', re: /^avvisi$/, nome: 'avvisi', cambia: true, fn: avvisi },
  // Fase 8 (fase8.md §0.3): il calendario "anche fuori casa", dal doGet dello script del portale (?calendario=<chiave>).
  // Risponde solo ai feed pubblici e solo con CALENDARIO_PUBBLICO acceso (lo decide calendarioPubblico); il testo ICS torna
  // allo script, che lo restituisce come text/calendar.
  { metodo: 'GET', re: /^calendario$/, nome: 'calendario', pubblica: true, fn: (w, x) => w.calendarioPubblico(testo(x.lavoro.corpo.chiave), x.lavoro.agente) },
];

/** Le strade che non si ricordano (rifarle e' giusto, e le loro risposte portano la sessione). */
const SENZA_RICORDO = new Set(['entra', 'codice', 'link', 'link-nuovo', 'esci', 'azienda', 'anteprima', 'carica']);

function creaPortale(w) {
  const letture = new Finestra(5 * 60000);

  /** Il lavoro che arriva dallo script del portale (o da --porta-portale in prova): torna l'oggetto risposta. */
  async function richiesta(lavoro) {
    lavoro = lavoro && typeof lavoro === 'object' ? lavoro : {};
    if (Number(lavoro.v) !== VERSIONE_PROTOCOLLO) return errore(426, 'Il portale è stato aggiornato: ricarica la pagina', { ricarica: true });
    const strada = typeof lavoro.strada === 'string' ? lavoro.strada : '';
    const metodo = lavoro.metodo === 'POST' ? 'POST' : lavoro.metodo === 'GET' ? 'GET' : '';
    // Le strade si confrontano PRIMA di guardare il corpo; niente "..", niente caratteri strani.
    if (!RE_STRADA.test(strada) || strada.indexOf('..') >= 0 || !metodo) return nonTrovato();
    let voce = null;
    let m = null;
    for (const s of STRADE) {
      if (s.metodo !== metodo) continue;
      const x = strada.match(s.re);
      if (x) { voce = s; m = x; break; }
    }
    if (!voce) return nonTrovato();
    const corpo = lavoro.corpo && typeof lavoro.corpo === 'object' && !Array.isArray(lavoro.corpo) ? lavoro.corpo : {};
    lavoro = Object.assign({}, lavoro, { corpo, agente: testo(lavoro.agente).slice(0, 40) });
    const max = voce.corpo === -1 ? Math.ceil(w.impPortale().fileMaxMb * MB / 3) * 4 + 64 * KB : (voce.corpo || 64 * KB);
    if (JSON.stringify(corpo).length > max) return voce.nome === 'carica' ? errore(413, 'Il file è più grande di ' + w.impPortale().fileMaxMb + ' MB: non si carica') : errore(413, 'Troppo grande');
    if (letture.conta('portale') > 1500) return errore(429, 'Troppe richieste: aspetta un minuto');
    let imp;
    try {
      imp = w.impPortale();
      w.db.riga('SELECT 1 AS uno');
    } catch (err) {
      return errore(503, 'Il portale non risponde adesso. Riprova fra qualche minuto o chiama lo studio');
    }
    if (!imp.attivo && voce.nome !== 'studio') {
      if (voce.nome === 'condiviso') return errore(404, 'Questo link non vale più');
      return errore(503, 'Il portale di ' + imp.studio.nome + ' non è attivo', { spento: true, telefono: imp.studio.telefono });
    }
    try {
      if (voce.pubblica) return await voce.fn(w, { lavoro, imp }, m);
      const v = S.sessioneValida(w, lavoro.sessione);
      if (!v) return errore(401, 'La sessione è scaduta: entra di nuovo', { accesso: false });
      if (v.s.da_scegliere && !voce.scegliendo) return errore(401, 'Scegli prima l\'azienda', { accesso: false });
      if (letture.conta('s:' + v.s.id) > 300) return errore(429, 'Troppe richieste: aspetta un minuto');
      if (voce.cambia && v.s.anteprima_utente_id) return errore(403, 'È un\'anteprima: qui non si accetta e non si firma');
      const ctx = {
        w, lavoro, imp, s: v.s, ref: v.ref, sog: v.sog, agente: lavoro.agente, perm: w.permessiReferente(v.ref), sedi: w.sediReferente(v.ref),
        aziende: S.referentiDellEmail(w, v.ref.email).map(r => ({ n: r.n, azienda: r.azienda, idReferente: r.id })),
      };
      // Un elenco di un tipo che il referente non vede: 404, come una cosa che non esiste (§13.2, 4).
      if (voce.permesso && (ctx.perm[voce.permesso] || 0) < 1) return nonTrovato();
      const chi = { utente: null, permessi: null, app: 'portale', disp: '', dispNome: ('Portale · ' + lavoro.agente).slice(0, 80), azione: ('portale ' + voce.nome).slice(0, 40),
        portale: { nome: v.ref.nome, referenteId: v.ref.id, soggettoId: v.sog.id, sessioneId: v.s.id, anteprima: !!v.s.anteprima_utente_id } };
      const fai = () => w.come(chi, () => voce.fn(w, ctx, m));
      if (voce.metodo === 'POST' && !SENZA_RICORDO.has(voce.nome)) {
        return await conRicordo(w, testo(lavoro.id), 'portale:' + testo(lavoro.sessione), 'portale ' + voce.nome, { scrive: true }, async () => fai());
      }
      return await fai();
    } catch (err) {
      if (err instanceof Rifiuto) return Object.assign(errore(err.extra && err.extra.stato ? err.extra.stato : 400, err.message), err.extra, { stato: err.extra && err.extra.stato ? err.extra.stato : 400 });
      console.error('[portale] ' + voce.nome + ': ' + (err && err.stack ? err.stack : err));
      return errore(503, 'Il portale non risponde adesso. Riprova fra qualche minuto o chiama lo studio allo ' + imp.studio.telefono);
    }
  }

  return { richiesta, STRADE };
}

// ------------------------------------------------------------------ pubbliche

/** GET studio (§0.3): quello che la pagina d'ingresso e il pie' di pagina mostrano, e se il portale e' acceso. */
function studio(w, x) {
  return { ok: true, stato: 200, studio: V.studio(x.imp), attivo: x.imp.attivo, informativa: V.testoInformativa(x.imp, '') };
}

/** GET condiviso/<token>: il link che scade della fase 5, ora pagina del portale (fase5.md §5.8). */
function condiviso(w, x, m) {
  let a = null;
  try { a = w.aperturaCondivisa(m[1], true); } catch (e) { a = null; }
  if (!a) return errore(404, 'Questo link non vale più');
  return { ok: true, stato: 200, studio: V.studio(x.imp), documento: { titolo: a.documento.titolo, revisione: 'rev. ' + a.versione.numero, nomeFile: a.versione.nome_file, byte: a.versione.byte } };
}

function condivisoScarica(w, x, m) {
  let a = null;
  try { a = w.aperturaCondivisa(m[1], false); } catch (e) { a = null; }
  if (!a) return errore(404, 'Questo link non vale più');
  return bytesDelFile(w, a.file, a.versione.nome_file, a.versione.mime);
}

function bytesDelFile(w, f, nome, mime) {
  const fs = require('node:fs');
  const percorso = f && f.percorso && !f.svuotato ? w.percorsoFile(f.percorso) : '';
  if (!percorso || !fs.existsSync(percorso)) return nonTrovato();
  const st = fs.statSync(percorso);
  if (st.size > SCARICA_MAX) return errore(413, 'Il file è troppo grande per scaricarlo dal portale: chiedilo allo studio');
  return { ok: true, stato: 200, nome: nome || f.nome, mime: mime || f.mime || 'application/octet-stream', byte: st.size, base64: fs.readFileSync(percorso).toString('base64') };
}

// ------------------------------------------------------------------ letture

/** La pagina di una cosa: vedibile o 404; la prima apertura segna "visto" (non in anteprima) e il registro una volta per sessione. */
function dettaglio(ctx, id, tipi, vista) {
  const v = V.vedibile(ctx, id, tipi);
  if (!v) return nonTrovato();
  segnaVisto(ctx, v.p);
  return Object.assign({ ok: true, stato: 200 }, vista(v));
}

function segnaVisto(ctx, p) {
  if (ctx.s.anteprima_utente_id) return;
  const w = ctx.w;
  if (!p.visto_il) w.db.esegui('UPDATE portale_pubblicazioni SET visto_il = ?, visto_da = ? WHERE id = ? AND visto_il IS NULL', adesso(), ctx.ref.id, p.id);
  const oggetto = p.tipo + ':' + p.id;
  if (!w.db.riga("SELECT id FROM portale_accessi WHERE sessione_id = ? AND azione = 'visto' AND oggetto = ?", ctx.s.id, oggetto)) {
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'visto', oggetto, agente: ctx.agente });
  }
}

/**
 * GET scarica/<chiave> e immagine/<chiave> (§7.8, §0.2): firma giusta, non scaduta, sessione uguale e viva, e il file
 * ancora vedibile (la pubblicazione non e' stata tolta nel frattempo). La risposta porta il file in base64.
 */
function scarica(ctx, k, immagine) {
  const w = ctx.w;
  const o = F.leggiChiave(w.portaleSegreto(), k);
  if (!o || o.s !== ctx.s.id) return nonTrovato();
  const v = V.vedibile(ctx, o.p, null);
  if (!v || !fileDellaPubblicazione(w, v, String(o.f))) return nonTrovato();
  const f = w.db.riga('SELECT * FROM file WHERE id = ? AND cestinato IS NULL', String(o.f));
  if (!f) return nonTrovato();
  if (immagine && ['image/png', 'image/jpeg'].indexOf(f.mime) < 0) return nonTrovato();
  const r = bytesDelFile(w, f, w.nomeDaScaricare ? w.nomeDaScaricare(f) : f.nome, f.mime);
  if (r.ok && !ctx.s.anteprima_utente_id && !immagine) {
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'scaricato', oggetto: f.nome, agente: ctx.agente });
  }
  return r;
}

/** Il file fa parte di quella pubblicazione? (il PDF, la firma, la revisione valida, l'XML, la copia, gli allegati dei messaggi). */
function fileDellaPubblicazione(w, v, idFile) {
  const p = v.p;
  if (p.file_id === idFile) return true;
  if (p.tipo === 'preventivo') return (w.db.riga('SELECT firma_file_id FROM preventivi WHERE id = ?', Number(p.rif)) || {}).firma_file_id === idFile;
  if (p.tipo === 'rapportino') return (w.db.riga('SELECT firma FROM rapportini WHERE id = ?', p.rif) || {}).firma === idFile;
  if (p.tipo === 'documento') return w.fileValidoDocumento(Number(p.rif)) === idFile;
  if (p.tipo === 'contratto') {
    const c = w.db.riga('SELECT documento_id FROM contratti WHERE id = ?', Number(p.rif));
    return !!(c && c.documento_id && w.fileValidoDocumento(c.documento_id) === idFile);
  }
  if (p.tipo === 'fattura') {
    const f = w.db.riga('SELECT file_id, copia_file_id FROM fatture WHERE id = ?', Number(p.rif));
    return !!f && (f.file_id === idFile || f.copia_file_id === idFile);
  }
  if (p.tipo === 'ticket') {
    for (const c of w.db.righe("SELECT allegati FROM comunicazioni WHERE canale = 'portale' AND pubblica = 1 AND ticket_id = ?", Number(p.rif))) {
      try { if (JSON.parse(c.allegati || '[]').some(a => a.id === idFile)) return true; } catch (e) { /* niente */ }
    }
  }
  return false;
}

// ------------------------------------------------------------------ preventivi (§3.8, §7.3)

/** Le scelte del cliente: solo le voci facoltative e le alternative di quel preventivo (le altre chiavi si ignorano). */
function scelteDi(w, r, scelte) {
  const voci = w.db.righe('SELECT * FROM preventivo_voci WHERE preventivo_id = ?', r.id);
  const o = {};
  const s = scelte && typeof scelte === 'object' ? scelte : {};
  for (const v of voci) {
    if (!(v.facoltativa === 1 || v.alternativa)) continue;
    o[v.id] = s[v.id] !== undefined ? (s[v.id] === true || s[v.id] === 1 || s[v.id] === '1' || s[v.id] === 'true') : v.scelta === 1;
  }
  const gruppi = {};
  for (const v of voci) {
    if (!v.alternativa || !o[v.id]) continue;
    const g = C.gruppoAlternativa(v);
    if (gruppi[g]) throw new Rifiuto('Di «' + v.alternativa + '» se ne sceglie una sola');
    gruppi[g] = true;
  }
  return o;
}

function anteprimaPreventivo(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['preventivo']);
  if (!v) return nonTrovato();
  const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(v.p.rif));
  const scelte = scelteDi(w, r, ctx.lavoro.corpo.scelte);
  const c = V.contenuto(w, r, scelte);
  return { ok: true, stato: 200, conti: V.contiPortale(c.conti), scadenzePagamento: c.scadenze.map(s => ({ descrizione: s.descrizione, importo: s.importo })) };
}

async function accetta(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['preventivo']);
  if (!v) return nonTrovato();
  if (ctx.perm.preventivi < 2) return errore(403, 'Non puoi accettare i preventivi: chiedi allo studio');
  const c = ctx.lavoro.corpo;
  const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(v.p.rif));
  const nome = testo(c.nome).slice(0, 120);
  if (r.stato === 'ACCETTATO') {
    // Ripetuta uguale (la rete che cade): ok senza rifare niente.
    if (r.accettazione_modo === 'portale' && r.accettato_referente_id === ctx.ref.id && r.accettato_da === nome) return { ok: true, stato: 200, preventivo: V.preventivo(ctx, v) };
    return errore(400, 'È già accettato');
  }
  if (r.stato !== 'INVIATO') return errore(400, 'Il preventivo non si può più accettare: chiedi allo studio');
  if (r.scadenza && r.scadenza < oggi()) return errore(400, 'Il preventivo è scaduto il ' + K.dataIt(r.scadenza) + ': chiedi allo studio di rinnovarlo');
  if (testo(c.versione) !== dataOraIso(r.modificato)) return errore(409, 'Il preventivo è stato aggiornato: guarda la versione nuova', { cambiato: true });
  if (!nome) return errore(400, 'Scrivi il nome e cognome di chi accetta');
  const f = F.leggiFirma(c.firma);
  if (!f.ok) return errore(400, f.errore);
  if (c.letto !== true) return errore(400, 'Spunta «Ho letto le condizioni»');
  const scelte = scelteDi(w, r, c.scelte);
  const impronta = V.improntaPreventivo(ctx, v, scelte);
  const ora = adesso();
  const prova = { via: 'google', agente: ctx.agente, il: dataOraIso(ora), impronta, versione: dataOraIso(r.modificato), nome, referente: ctx.ref.id, email: ctx.ref.email };
  const risultato = w.db.transazione(() => {
    w.accettaPreventivo({ id: r.id, modo: 'portale', nome, scelte, firma: { base64: f.dati.toString('base64'), mime: 'image/png', idFile: 'portale-' + v.p.id }, prova, idReferente: ctx.ref.id });
    const dopo = w.db.riga('SELECT * FROM preventivi WHERE id = ?', r.id);
    prova.firma = dopo.firma_file_id;
    w.db.esegui('UPDATE preventivi SET accettazione_prova = ? WHERE id = ?', JSON.stringify(prova), r.id);
    const et = r.numero + (r.revisione ? ' rev. ' + r.revisione : '');
    w.daGuardare('accettato', r.id, ctx.sog.id, ctx.ref.id, 'Accettato nel portale: ' + et, nome + ' · ' + ctx.sog.nome);
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']).concat(r.utente_id ? [r.utente_id] : []), 'preventivo_accettato', et + ' accettato nel portale', nome + ' · ' + ctx.sog.nome,
      { pagina: 'preventivo', id: r.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'accettato', oggetto: 'preventivo:' + v.p.id, agente: ctx.agente });
    return { et, totale: w.contenutoPreventivo(dopo).conti.totale };
  });
  conferma(w, ctx, 'Preventivo ' + risultato.et + ' accettato', 'ha accettato nel portale il preventivo ' + risultato.et + ' (' + r.oggetto + '), per un totale di ' + C.euroIt(risultato.totale) + ' € IVA compresa',
    nome, { preventivo_id: r.id });
  return { ok: true, stato: 200, preventivo: V.preventivo(ctx, V.vedibile(ctx, v.p.id, ['preventivo'])) };
}

/** L'email di conferma al referente (§9.6: l'unica con un importo, il totale accettato), dopo la risposta. */
function conferma(w, ctx, oggetto, cosa, da, legami) {
  const imp = ctx.imp;
  const ora = dataOraIso(adesso());
  const testoEmail = 'Buongiorno ' + ctx.ref.nome + ',\nconfermiamo che il ' + K.dataIt(ora.slice(0, 10)) + ' alle ' + ora.slice(11, 16) + ' ' + da + ' ' + cosa + '.\nLo trova nel portale con la firma: ' +
    imp.indirizzo + '\nSe non è stato lei, ci chiami subito allo ' + imp.studio.telefono + '.\n' + imp.studio.nome;
  const lavoro = async () => {
    let partita = false;
    try { partita = await w.mandaEmailPortale(ctx.ref.email, oggetto, testoEmail, 2); } catch (e) { partita = false; }
    w.db.transazione(() => w.scriviComunicazione(Object.assign({ canale: 'email', tipo: 'conferma_portale', cliente_id: ctx.sog.id,
      referente_id: ctx.ref.id, a: ctx.ref.email, oggetto, testo: testoEmail, stato: partita ? 'mandato' : 'errore', errore: partita ? '' : 'quota delle email finita o postino non raggiunto', utente_id: null }, legami)));
  };
  const p = lavoro().catch(err => console.error('[portale] conferma: ' + (err && err.message ? err.message : err)));
  if (w.portaleSincrono) w.portaleInCorso = p;
}

function rifiuta(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['preventivo']);
  if (!v) return nonTrovato();
  if (ctx.perm.preventivi < 2) return errore(403, 'Non puoi accettare i preventivi: chiedi allo studio');
  const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(v.p.rif));
  if (r.stato === 'RIFIUTATO') return { ok: true, stato: 200, preventivo: V.preventivo(ctx, v) };
  if (r.stato !== 'INVIATO') return errore(400, r.stato === 'ACCETTATO' ? 'È già accettato' : 'Il preventivo non si può più cambiare: chiedi allo studio');
  const motivo = testo(ctx.lavoro.corpo.motivo).slice(0, 500);
  w.db.transazione(() => {
    w.rifiutaPreventivo({ id: r.id, motivo: 'Dal portale (' + ctx.ref.nome + ')' + (motivo ? ': ' + motivo : '') });
    const et = r.numero + (r.revisione ? ' rev. ' + r.revisione : '');
    w.annota('preventivi', r.id, null, null, 'rifiutato nel portale da ' + ctx.ref.nome);
    w.daGuardare('rifiutato', r.id, ctx.sog.id, ctx.ref.id, et + ' non accettato', ctx.ref.nome + (motivo ? ' · ' + motivo.split('\n')[0] : ''));
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']).concat(r.utente_id ? [r.utente_id] : []), 'preventivo_rifiutato', et + ' non accettato', ctx.ref.nome + (motivo ? ' · ' + motivo.split('\n')[0] : ''),
      { pagina: 'preventivo', id: r.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'rifiutato', oggetto: 'preventivo:' + v.p.id, agente: ctx.agente });
  });
  return { ok: true, stato: 200, preventivo: V.preventivo(ctx, V.vedibile(ctx, v.p.id, ['preventivo'])) };
}

function domanda(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['preventivo']);
  if (!v) return nonTrovato();
  const corpo = String(ctx.lavoro.corpo.testo || '').trim();
  if (!corpo) return errore(400, 'Scrivi la domanda');
  if (corpo.length > 2000) return errore(400, 'La domanda è più lunga di 2.000 caratteri: accorciala');
  const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(v.p.rif));
  const et = r.numero + (r.revisione ? ' rev. ' + r.revisione : '');
  w.db.transazione(() => {
    w.scriviComunicazione({ canale: 'portale', direzione: 'entrata', tipo: 'domanda', stato: 'ricevuto', cliente_id: ctx.sog.id, referente_id: ctx.ref.id, preventivo_id: r.id, testo: corpo, utente_id: null });
    w.daGuardare('domanda', r.id, ctx.sog.id, ctx.ref.id, 'Domanda sul preventivo ' + et, ctx.ref.nome + ' · ' + corpo.split('\n')[0].slice(0, 120));
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']).concat(r.utente_id ? [r.utente_id] : []), 'domanda', 'Domanda sul preventivo ' + et, ctx.ref.nome + ' · ' + corpo.split('\n')[0].slice(0, 120),
      { pagina: 'preventivo', id: r.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'domanda', oggetto: 'preventivo:' + v.p.id, agente: ctx.agente });
  });
  return { ok: true, stato: 200 };
}

// ------------------------------------------------------------------ rapportini (§3.9, §7.4)

function firma(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['rapportino']);
  if (!v) return nonTrovato();
  if (ctx.perm.rapportini < 2) return errore(403, 'Non puoi firmare i rapportini: chiedi allo studio');
  const c = ctx.lavoro.corpo;
  const r = w.db.riga('SELECT * FROM rapportini WHERE id = ?', v.p.rif);
  const nome = testo(c.nome).slice(0, 120);
  const st = testo(r.stato).toUpperCase() || 'BOZZA';
  if (st !== 'BOZZA' || v.p.da_firmare !== 1) {
    if (r.firma_modo === 'portale' && r.firma_referente_id === ctx.ref.id && r.firmatario === nome) return { ok: true, stato: 200, rapportino: V.rapportino(ctx, v) };
    return errore(400, 'È già firmato');
  }
  if (testo(c.versione) !== dataOraIso(r.modificato)) return errore(409, 'Il rapportino è cambiato: guardalo di nuovo prima di firmare', { cambiato: true });
  if (!nome) return errore(400, 'Scrivi il nome di chi firma');
  const f = F.leggiFirma(c.firma);
  if (!f.ok) return errore(400, f.errore);
  const ora = adesso();
  w.db.transazione(() => {
    w.caricaFile({ tipo: 'firma', id: r.id, base64: f.dati.toString('base64'), mime: 'image/png', idFile: 'portale-' + v.p.id + '-' + ctx.s.id, firmatario: nome, firmatoIl: ora });
    const dopo = w.db.riga('SELECT * FROM rapportini WHERE id = ?', r.id);
    const prova = { via: 'google', agente: ctx.agente, il: dataOraIso(ora), versione: dataOraIso(r.modificato), nome, referente: ctx.ref.id, email: ctx.ref.email, firma: dopo.firma,
      impronta: sha256(JSON.stringify({ id: r.id, data: dataIso(r.data), lavoro: r.descrizione, ore: [r.ore_lavoro, r.ore_extra, r.ore_viaggio], km: r.km })) };
    w.aggiorna('rapportini', r.id, { firma_modo: 'portale', firma_prova: JSON.stringify(prova), firma_referente_id: ctx.ref.id }, 'id', 'firmato nel portale da ' + nome);
    w.db.esegui('UPDATE portale_pubblicazioni SET da_firmare = 0 WHERE id = ?', v.p.id);
    w.daGuardare('firmato', r.id, ctx.sog.id, ctx.ref.id, 'Firmato nel portale: ' + r.id, nome + ' · ' + K.dataIt(dataIso(r.data)));
    w.notifica([r.utente_id].concat(w.utentiDeiRuoli(['titolare'])), 'rapportino_firmato', r.id + ' firmato nel portale', nome + ' · ' + dataIso(r.data).slice(8, 10) + '/' + dataIso(r.data).slice(5, 7),
      { pagina: 'rapportino', id: r.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'firmato', oggetto: 'rapportino:' + v.p.id, agente: ctx.agente });
  });
  conferma(w, ctx, 'Rapportino del ' + K.dataIt(dataIso(r.data)) + ' firmato', 'ha firmato nel portale il rapportino ' + r.id + ' del ' + K.dataIt(dataIso(r.data)), nome, { rapportino_id: r.id });
  return { ok: true, stato: 200, rapportino: V.rapportino(ctx, V.vedibile(ctx, v.p.id, ['rapportino'])) };
}

function segnala(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['rapportino']);
  if (!v) return nonTrovato();
  const corpo = String(ctx.lavoro.corpo.testo || '').trim();
  if (!corpo) return errore(400, 'Scrivi cosa non va');
  if (corpo.length > 2000) return errore(400, 'Il messaggio è più lungo di 2.000 caratteri: accorcialo');
  const r = w.db.riga('SELECT * FROM rapportini WHERE id = ?', v.p.rif);
  w.db.transazione(() => {
    w.scriviComunicazione({ canale: 'portale', direzione: 'entrata', tipo: 'segnalazione', stato: 'ricevuto', cliente_id: ctx.sog.id, referente_id: ctx.ref.id, rapportino_id: r.id,
      commessa_id: r.id_commessa || '', testo: corpo, utente_id: null });
    w.daGuardare('segnalato', r.id, ctx.sog.id, ctx.ref.id, ctx.sog.nome + ' segnala un problema su ' + r.id, corpo.split('\n')[0].slice(0, 120));
    w.notifica([r.utente_id].concat(w.utentiDeiRuoli(['titolare'])), 'segnalazione', ctx.sog.nome + ' segnala un problema su ' + r.id, corpo.split('\n')[0].slice(0, 120), { pagina: 'rapportino', id: r.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'segnalato', oggetto: 'rapportino:' + v.p.id, agente: ctx.agente });
  });
  return { ok: true, stato: 200 };
}

// ------------------------------------------------------------------ file (§3.11, §6.7, §0.2)

/** POST carica {nome, per, base64}: il controllo sui byte decodificati, i limiti, il file "portale" con un id casuale. */
function carica(w, ctx) {
  const c = ctx.lavoro.corpo;
  const per = testo(c.per);
  if (['documento', 'richiesta', 'messaggio'].indexOf(per) < 0) return errore(400, 'Per: documento, richiesta o messaggio');
  if ((per === 'documento' ? ctx.perm.documenti : ctx.perm.richieste) < 2) return errore(403, per === 'documento' ? 'Non puoi mandare file: chiedi allo studio' : 'Non puoi aprire richieste: chiedi allo studio');
  const imp = ctx.imp;
  const b64 = typeof c.base64 === 'string' ? c.base64 : '';
  if (b64.length > Math.ceil(imp.fileMaxMb * MB / 3) * 4 + 8) return errore(413, 'Il file è più grande di ' + imp.fileMaxMb + ' MB: non si carica');
  const dati = Buffer.from(b64, 'base64');
  const giorno = oggi();
  const oggiN = w.db.riga('SELECT COUNT(*) n, COALESCE(SUM(byte), 0) b FROM portale_caricamenti WHERE referente_id = ? AND substr(creato, 1, 10) = ?', ctx.ref.id, giorno);
  if (oggiN.n >= imp.fileGiorno || oggiN.b + dati.length > 200 * MB) return errore(429, 'Oggi hai già mandato ' + imp.fileGiorno + ' file: per altri scrivi allo studio');
  const mese = w.db.riga('SELECT COALESCE(SUM(byte), 0) b FROM portale_caricamenti WHERE soggetto_id = ? AND substr(creato, 1, 7) = ?', ctx.sog.id, giorno.slice(0, 7));
  if (mese.b + dati.length > 1024 * MB) return errore(429, 'Questo mese la vostra azienda ha già mandato 1 GB di file: per altri scrivi allo studio');
  try { w.controllaSpazio('documento'); } catch (e) { return errore(400, 'Lo spazio per i file è finito: chiama lo studio'); }
  const ctrl = F.controllaFile(testo(c.nome), dati, { tipi: imp.tipiFile, maxMb: imp.fileMaxMb });
  if (!ctrl.ok) return errore(ctrl.errore.indexOf('più grande') >= 0 ? 413 : 400, ctrl.errore);
  const id = w.db.transazione(() => {
    const f = w.salvaFile({ dati, nome: ctrl.nome, mime: ctrl.mime, tipo: 'portale' });
    const idC = w.inserisci('portale_caricamenti', { file_id: f.id, soggetto_id: ctx.sog.id, referente_id: ctx.ref.id, per, nome_originale: ctrl.nome, estensione: ctrl.estensione,
      byte: dati.length, stato: 'caricato', creato: adesso() });
    w.db.esegui('UPDATE file SET caricamento_id = ? WHERE id = ?', idC, f.id);
    return idC;
  });
  return { ok: true, stato: 200, caricamento: { id, nome: ctrl.nome, byte: dati.length } };
}

/** Un caricamento di questo referente, non ancora legato, per questo uso. */
function caricamentoLibero(w, ctx, id, per) {
  const c = w.db.riga('SELECT * FROM portale_caricamenti WHERE id = ?', Number(id) || 0);
  if (!c || c.referente_id !== ctx.ref.id || c.soggetto_id !== ctx.sog.id || c.stato !== 'caricato' || c.per !== per) return null;
  const f = w.db.riga('SELECT id FROM file WHERE id = ? AND cestinato IS NULL', c.file_id);
  return f ? c : null;
}

function sedeAmmessa(w, ctx, idSede) {
  if (idSede === undefined || idSede === null || idSede === '') return { ok: true, id: null };
  const s = w.db.riga('SELECT * FROM sedi WHERE id = ? AND soggetto_id = ? AND archiviata = 0', Number(idSede) || 0, ctx.sog.id);
  if (!s || (ctx.sedi && ctx.sedi.indexOf(s.id) < 0)) return { ok: false };
  return { ok: true, id: s.id, nome: s.nome };
}

/** POST documenti {caricamento, titolo, idSede, nota}: il file mandato allo studio diventa "Ricevuto" (Da guardare). */
function nuovoDocumento(w, ctx) {
  if (ctx.perm.documenti < 2) return errore(403, 'Non puoi mandare file: chiedi allo studio');
  const c = ctx.lavoro.corpo;
  const titolo = testo(c.titolo).slice(0, 200);
  if (!titolo) return errore(400, 'Scrivi di cosa si tratta');
  const car = caricamentoLibero(w, ctx, c.caricamento, 'documento');
  if (!car) return errore(400, 'Il file non c\'è più: caricalo di nuovo');
  const sede = sedeAmmessa(w, ctx, c.idSede);
  if (!sede.ok) return errore(400, 'Scegli una delle tue sedi');
  w.db.transazione(() => {
    w.aggiorna('portale_caricamenti', car.id, { titolo, nota: testo(c.nota).slice(0, 1000), sede_id: sede.id, stato: 'da_guardare' }, 'id', 'file dal portale');
    w.daGuardare('caricamento', car.id, ctx.sog.id, ctx.ref.id, car.nome_originale, ctx.sog.nome + ' · ' + ctx.ref.nome + ' · ' + mbIt(car.byte));
    w.notifica(w.utentiDeiRuoli(['titolare', 'amministrazione']), 'file_portale', 'File dal portale: ' + car.nome_originale, ctx.sog.nome + ' · ' + mbIt(car.byte), { pagina: 'caricamento', id: car.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'caricato', oggetto: car.nome_originale, agente: ctx.agente });
  });
  return { ok: true, stato: 200, tuo: V.tuo(w.db.riga('SELECT * FROM portale_caricamenti WHERE id = ?', car.id)) };
}

const mbIt = n => C.numeroIt(Math.round(Number(n || 0) / MB * 10) / 10, 0, 1) + ' MB';

// ------------------------------------------------------------------ richieste d'intervento (§3.10, §7.7)

const IMPATTI = ['fermo', 'ridotto', 'nessuno'];
const URGENZE = ['subito', 'presto', 'quando_si_puo'];

/** POST richieste: nasce col cuore di salvaTicket, origine "portale", priorita' dalla matrice, nessun responsabile. */
function nuovaRichiesta(w, ctx) {
  if (ctx.perm.richieste < 2) return errore(403, 'Non puoi aprire richieste: chiedi allo studio');
  const c = ctx.lavoro.corpo;
  const imp = ctx.imp;
  const titolo = testo(c.titolo).slice(0, 160);
  if (!titolo) return errore(400, 'Scrivi in poche parole cosa succede');
  const impatto = IMPATTI.indexOf(testo(c.impatto)) >= 0 ? testo(c.impatto) : '';
  const urgenza = URGENZE.indexOf(testo(c.urgenza)) >= 0 ? testo(c.urgenza) : '';
  let sede = sedeAmmessa(w, ctx, c.idSede);
  if (!sede.ok) return errore(400, 'Scegli l\'impianto o la sede');
  if (!sede.id) {
    const mie = w.db.righe('SELECT id, nome FROM sedi WHERE soggetto_id = ? AND archiviata = 0', ctx.sog.id).filter(s => !ctx.sedi || ctx.sedi.indexOf(s.id) >= 0);
    if (mie.length > 1) return errore(400, 'Scegli l\'impianto o la sede');
    if (mie.length === 1) sede = { ok: true, id: mie[0].id, nome: mie[0].nome };
  }
  const n = w.db.riga("SELECT COUNT(*) n FROM ticket WHERE referente_id = ? AND origine = 'portale' AND substr(aperto_il, 1, 10) = ?", ctx.ref.id, oggi()).n;
  if (n >= imp.richiesteGiorno) return errore(429, 'Oggi hai già mandato ' + imp.richiesteGiorno + ' richieste: per altre chiama lo studio');
  const caricamenti = (Array.isArray(c.caricamenti) ? c.caricamenti : []).slice(0, 10).map(id => caricamentoLibero(w, ctx, id, 'richiesta'));
  if (caricamenti.some(x => !x)) return errore(400, 'Il file non c\'è più: caricalo di nuovo');
  const idT = w.db.transazione(() => {
    const r = w.salvaTicket({ ticket: { idCliente: ctx.sog.id, idSede: sede.id, titolo, descrizione: String(c.descrizione || '').trim().slice(0, 4000), tipo: 'guasto', origine: 'portale',
      impatto, urgenza, richiedente: ctx.ref.nome, idReferente: ctx.ref.id, rifCliente: testo(c.rifCliente).replace(/[\r\n]+/g, ' ').slice(0, 60) } });
    const t = w.db.riga('SELECT * FROM ticket WHERE id = ?', r.ticket.id);
    w.db.esegui('UPDATE ticket SET portale_visibile = 1 WHERE id = ?', t.id);
    w.annota('ticket', t.id, null, null, 'richiesta dal portale');
    for (const x of caricamenti) {
      w.db.esegui('UPDATE file SET ticket_id = ? WHERE id = ?', t.id, x.file_id);
      w.aggiorna('portale_caricamenti', x.id, { ticket_id: t.id, titolo: titolo, sede_id: sede.id, stato: 'da_guardare' });
    }
    w.pubblicaConRegola('ticket', t.id, { dalPortale: true });
    const urgente = t.priorita === 'urgente';
    const ora = dataOraIso(t.aperto_il).slice(11, 16);
    const dettaglio = [ctx.sog.nome, sede.nome || '', ctx.ref.nome, 'alle ' + ora.replace(/^0/, '')].filter(Boolean).join(' · ');
    w.daGuardare('richiesta', t.id, ctx.sog.id, ctx.ref.id, (urgente ? 'Richiesta urgente: ' : 'Richiesta dal portale: ') + t.numero, dettaglio);
    const chi = w.utentiConModulo('ticket', 2).filter(u => u.ruolo !== 'collaboratore' || urgente || commessaOImpiantoSuo(w, u.id, t)).map(u => u.id);
    w.notifica(chi, 'richiesta_portale', 'Richiesta dal portale: ' + t.numero, [ctx.sog.nome, titolo, urgente ? 'Urgente' : ''].filter(Boolean).join(' · '), { pagina: 'ticket', id: t.id });
    const pub = w.db.riga("SELECT id FROM portale_pubblicazioni WHERE tipo = 'ticket' AND rif = ? AND tolta_il IS NULL", String(t.id));
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'richiesta', oggetto: pub ? 'ticket:' + pub.id : t.numero, agente: ctx.agente });
    return t.id;
  });
  const p = w.db.riga("SELECT * FROM portale_pubblicazioni WHERE tipo = 'ticket' AND rif = ? AND tolta_il IS NULL", String(idT));
  const v = p ? V.vedibile(ctx, p.id, ['ticket']) : null;
  const o = { ok: true, stato: 200, richiesta: v ? V.richiesta(ctx, v) : null };
  if (impatto === 'fermo' && urgenza === 'subito') o.telefono = imp.studio.telefono;
  return o;
}

function commessaOImpiantoSuo(w, idUtente, t) {
  if (t.commessa_id) {
    const m = w.db.riga('SELECT responsabile_id FROM commesse WHERE id = ?', t.commessa_id);
    if (m && m.responsabile_id === idUtente) return true;
    if (w.db.riga('SELECT 1 FROM commessa_persone WHERE commessa_id = ? AND utente_id = ?', t.commessa_id, idUtente)) return true;
  }
  return false;
}

/** POST richieste/<id>/messaggio {testo, caricamenti}: il cliente scrive allo studio dentro la richiesta. */
function messaggio(w, ctx, m) {
  const v = V.vedibile(ctx, m[1], ['ticket']);
  if (!v) return nonTrovato();
  if (ctx.perm.richieste < 2) return errore(403, 'Non puoi scrivere allo studio: chiedi allo studio');
  const t = w.db.riga('SELECT * FROM ticket WHERE id = ?', Number(v.p.rif));
  if (['chiuso', 'annullato'].indexOf(t.stato) >= 0) return errore(400, 'La richiesta è chiusa: per un problema nuovo apri una richiesta nuova');
  const corpo = String(ctx.lavoro.corpo.testo || '').trim();
  if (!corpo) return errore(400, 'Scrivi il messaggio');
  if (corpo.length > 2000) return errore(400, 'Il messaggio è più lungo di 2.000 caratteri: accorcialo');
  const caricamenti = (Array.isArray(ctx.lavoro.corpo.caricamenti) ? ctx.lavoro.corpo.caricamenti : []).slice(0, 10).map(id => caricamentoLibero(w, ctx, id, 'messaggio'));
  if (caricamenti.some(x => !x)) return errore(400, 'Il file non c\'è più: caricalo di nuovo');
  w.db.transazione(() => {
    const allegati = caricamenti.map(x => ({ nome: x.nome_originale, byte: x.byte, id: x.file_id }));
    const idC = w.scriviComunicazione({ canale: 'portale', direzione: 'entrata', tipo: 'messaggio', stato: 'ricevuto', pubblica: 1, cliente_id: ctx.sog.id, referente_id: ctx.ref.id,
      ticket_id: t.id, commessa_id: t.commessa_id || '', testo: corpo, allegati: JSON.stringify(allegati), utente_id: null });
    for (const x of caricamenti) {
      w.db.esegui('UPDATE file SET ticket_id = ? WHERE id = ?', t.id, x.file_id);
      w.aggiorna('portale_caricamenti', x.id, { ticket_id: t.id, comunicazione_id: idC, titolo: 'Messaggio su ' + t.numero, stato: 'da_guardare' });
    }
    const titolo = 'Messaggio di ' + ctx.ref.nome + ' su ' + t.numero;
    const aperta = w.db.riga("SELECT id FROM portale_da_guardare WHERE tipo = 'messaggio' AND rif = ? AND visto_il IS NULL", String(t.id));
    if (aperta) w.db.esegui('UPDATE portale_da_guardare SET titolo = ?, dettaglio = ?, creato = ?, referente_id = ? WHERE id = ?', titolo, corpo.split('\n')[0].slice(0, 120), adesso(), ctx.ref.id, aperta.id);
    else w.daGuardare('messaggio', t.id, ctx.sog.id, ctx.ref.id, titolo, corpo.split('\n')[0].slice(0, 120));
    const a = t.responsabile_id ? [t.responsabile_id] : w.utentiConModulo('ticket', 2).filter(u => u.ruolo !== 'collaboratore').map(u => u.id);
    w.notifica(a, 'messaggio_portale', titolo, corpo.split('\n')[0].slice(0, 120), { pagina: 'ticket', id: t.id });
    w.accessoPortale({ referente_id: ctx.ref.id, soggetto_id: ctx.sog.id, sessione_id: ctx.s.id, azione: 'messaggio', oggetto: 'ticket:' + v.p.id, agente: ctx.agente });
  });
  return { ok: true, stato: 200, richiesta: V.richiesta(ctx, V.vedibile(ctx, v.p.id, ['ticket'])) };
}

/** POST avvisi {email}: accende o spegne gli avvisi per email (link e conferme partono comunque). */
function avvisi(w, ctx) {
  const si = ctx.lavoro.corpo.email === true;
  w.db.esegui('UPDATE referenti SET avvisi_email = ? WHERE id = ?', si ? 1 : 0, ctx.ref.id);
  return { ok: true, stato: 200 };
}

/**
 * Il controllo della forma che fa lo script del portale (§0.2), uguale per --porta-portale in prova: portale 1, strada
 * con la forma giusta, corpo oggetto, grandezza fino a 36 milioni di caratteri. Torna il lavoro per il router o null.
 */
function lavoroDallaPagina(d, lunghezza) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || Number(d.portale) !== 1) return null;
  if (lunghezza !== undefined && lunghezza > 36000000) return null;
  const strada = typeof d.strada === 'string' ? d.strada : '';
  if (!RE_STRADA.test(strada) || strada.indexOf('..') >= 0) return null;
  if (d.corpo !== undefined && (d.corpo === null || typeof d.corpo !== 'object' || Array.isArray(d.corpo))) return null;
  const id = typeof d.id === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(d.id) ? d.id : '';
  return {
    strada, metodo: d.metodo === 'GET' ? 'GET' : 'POST', sessione: typeof d.sessione === 'string' ? d.sessione.slice(0, 200) : '', pre: typeof d.pre === 'string' ? d.pre.slice(0, 200) : '',
    corpo: d.corpo || {}, agente: typeof d.agente === 'string' ? d.agente.slice(0, 40) : '', v: d.v, id,
  };
}

module.exports = { creaPortale, STRADE, lavoroDallaPagina, RE_STRADA, VERSIONE_PROTOCOLLO, fileDellaPubblicazione };
