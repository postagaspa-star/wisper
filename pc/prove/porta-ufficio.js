// Il collegamento di Wisper Ufficio al server, imitato in Node con le stesse regole di
// pc/WisperUfficio/Server.cs (docs/gestionale/porta-google.md): lo usa il finto ponte con
// --google, e le prove in porta-ufficio.test.js lo provano contro il finto Google e un
// server di prova veri.
//
//  - in casa, direttamente: <casa>/exec, /carica, /file/<id>, col Bearer e idRichiesta nelle POST;
//  - fuori casa, la porta Google: POST {porta:1, id, token, strada, ...} allo script;
//  - la regola di casa (§8): casa solo se /salute sa fare la firma col token; la scelta vale
//    5 minuti; una richiesta a casa persa per strada riparte da Google con lo stesso id;
//    accedi passa da Google se c'è; "attesa" si richiede con lo stesso id per un po'.
'use strict';

const crypto = require('node:crypto');

const DURATA_SCELTA_MS = 5 * 60 * 1000;
const PROVA_CASA_MS = 1500;
const PAZIENZA_ATTESA_MS = 55 * 1000;
const MASSIMO_DA_GOOGLE = 26000000;
const TROPPO_GRANDE = 'La richiesta è troppo grande per passare da Google (al massimo 26 MB): mandala quando sei in ufficio';
const LETTERE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** n caratteri a caso fra [A-Za-z0-9_-]. */
function casuale(n) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += LETTERE[b[i] & 63];
  return s;
}
const nuovoId = () => casuale(16);
const sha = t => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');

/** La firma che solo il server vero sa fare (§8.2): HMAC-SHA256(chiave: SHA-256(token) in esadecimale, messaggio: prova). */
function firmaAttesa(token, prova) {
  return crypto.createHmac('sha256', sha(token)).update(String(prova), 'utf8').digest('hex');
}

const errore = (testo, rete) => ({ ok: false, errore: testo, rete: !!rete });

/** "https://script.google.com/macros/s/…/exec" o il finto Google sul computer stesso. Null se non va bene. */
function indirizzoGoogle(s) {
  let u = String(s || '').trim().replace(/\/+$/, '');
  if (!u || u.length > 300) return null;
  if (u.startsWith('https://script.google.com/') && !u.endsWith('/exec')) u += '/exec';
  return /^https:\/\/script\.google\.com\/(macros|a\/macros\/[A-Za-z0-9.-]+)\/s\/[A-Za-z0-9_-]+\/exec$/.test(u) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/exec$/.test(u) ? u : null;
}

class Collegamento {
  /**
   * @param o {casa, google, disp, dispNome, app, log}: casa = il server di casa (vuoto = solo Google),
   *          google = l'indirizzo dello script (vuoto = solo casa, come prima).
   */
  constructor(o) {
    o = o || {};
    this.casa = String(o.casa || '').replace(/\/+$/, '');
    this.google = o.google ? indirizzoGoogle(o.google) || '' : '';
    this.chi = { disp: o.disp || 'prova', dispNome: o.dispNome || 'prova', app: o.app || 'ufficio prova' };
    this.log = o.log || (() => {});
    this.token = '';
    this.scelta = '';
    this.sceltaFinoA = 0;
    this.provaInCorso = null;
    this.generazione = 0;
    this.ultimaStrada = '';
    this.ultimoContatto = null;
    this.daRiprovare = new Map();
    this.conti = { casa: 0, google: 0, prove: 0 };
  }

  dimentica() { this.generazione++; this.scelta = ''; }

  stato() {
    const valida = this.scelta && Date.now() < this.sceltaFinoA;
    const solo = !this.google ? (this.casa ? 'casa' : '') : !this.casa ? 'google' : '';
    const d = this.ultimoContatto;
    const due = n => String(n).padStart(2, '0');
    return {
      casa: this.casa, google: !!this.google, strada: solo || (valida ? this.scelta : ''), ultimaStrada: this.ultimaStrada,
      ultimoContatto: d ? d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds()) : '',
    };
  }

  // ------------------------------------------------------------------ la regola di casa

  async strada() {
    if (!this.google) return this.casa ? 'casa' : '';
    if (!this.casa || !this.token) return 'google';
    if (this.scelta && Date.now() < this.sceltaFinoA) return this.scelta;
    if (!this.provaInCorso) {
      const gen = this.generazione;
      this.provaInCorso = this.firmaDiCasa().then(ok => {
        this.provaInCorso = null;
        if (gen === this.generazione) this.scegli(ok ? 'casa' : 'google');
        return ok ? 'casa' : 'google';
      });
    }
    return this.provaInCorso;
  }

  async firmaDiCasa() {
    this.conti.prove++;
    const prova = casuale(32);
    const impronta = sha(this.token);
    try {
      const r = await fetch(this.casa + '/salute?prova=' + prova + '&chi=' + impronta.slice(0, 16), { signal: AbortSignal.timeout(PROVA_CASA_MS), redirect: 'manual' });
      if (r.status !== 200) return false;
      const o = JSON.parse(await r.text());
      if (!o || o.ok !== true || typeof o.firma !== 'string') return false;
      const giusta = firmaAttesa(this.token, prova);
      return o.firma.length === giusta.length && crypto.timingSafeEqual(Buffer.from(o.firma), Buffer.from(giusta));
    } catch (e) {
      return false;
    }
  }

  scegli(s) {
    if (s !== this.scelta) this.log('collegamento: ' + (s === 'casa' ? 'in ufficio' : 'via Google'));
    this.scelta = s;
    this.sceltaFinoA = Date.now() + DURATA_SCELTA_MS;
  }

  contatto(s) {
    this.ultimaStrada = s;
    this.ultimoContatto = new Date();
    if (s === 'casa' && this.scelta === 'casa') this.sceltaFinoA = Date.now() + DURATA_SCELTA_MS;
  }

  // ------------------------------------------------------------------ casa

  /** {arrivata, http200, dati} oppure {arrivata:false, dati: errore di rete}. */
  async aCasa(percorso, opzioni, ms) {
    this.conti.casa++;
    try {
      const r = await fetch(this.casa + percorso, Object.assign({ signal: AbortSignal.timeout(ms), redirect: 'manual' }, opzioni));
      const testo = await r.text();
      if (!testo.trim().startsWith('{')) return { arrivata: false, dati: errore('Il server ha risposto ' + r.status, true) };
      return { arrivata: true, http200: r.status === 200, dati: JSON.parse(testo) };
    } catch (e) {
      return { arrivata: false, dati: errore(e.name === 'TimeoutError' ? 'Il server non ha risposto in tempo: controlla la rete e riprova' : 'Il server non risponde: controlla la rete e riprova', true) };
    }
  }

  testa(conChiave) {
    const t = { Accept: 'application/json' };
    if (conChiave && this.token) t.Authorization = 'Bearer ' + this.token;
    return t;
  }

  // ------------------------------------------------------------------ Google

  /** Una richiesta allo script, sempre col corpo di prima (lo stesso id). → {rete, dati}. */
  async aGoogle(corpo, ms, ripeti) {
    const testo = JSON.stringify(corpo);
    const inizio = Date.now();
    for (let tentativo = 1; ; tentativo++) {
      const r = await this.unaVoltaGoogle(testo, ms);
      if (!r.rete) return r;
      const ancora = r.porta === 'attesa' ? Date.now() - inizio < PAZIENZA_ATTESA_MS
        : (r.porta === 'occupato' || r.porta === 'pagina') && ripeti === 'tutto' && tentativo < 2;
      if (!ancora) return r;
      this.log('porta Google: ' + r.porta + ', riprovo con lo stesso id');
      if (r.porta !== 'attesa') await new Promise(x => setTimeout(x, 2000));
    }
  }

  async unaVoltaGoogle(testo, ms) {
    this.conti.google++;
    try {
      // fetch segue da solo il rimbalzo 302 dello script (POST -> GET), come HttpClient.
      const r = await fetch(this.google, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: testo, signal: AbortSignal.timeout(ms) });
      const t = await r.text();
      if (r.status === 429) return { rete: true, porta: 'occupato', dati: errore('Troppe richieste insieme: riprova fra poco', true) };
      let o = null;
      if (r.status === 200 && t.trim().startsWith('{')) { try { o = JSON.parse(t); } catch (e) { o = null; } }
      if (!o || typeof o !== 'object') return { rete: true, porta: 'pagina', dati: errore('Google non ha risposto come doveva: riprova fra poco', true) };
      if (o.rete === true) {
        o.ok = false;
        if (!o.errore) o.errore = 'Il server dello studio non risponde: riprova fra poco';
        return { rete: true, porta: o.porta || 'rete', dati: o };
      }
      return { rete: false, dati: o };
    } catch (e) {
      const scaduto = e.name === 'TimeoutError';
      return { rete: true, porta: scaduto ? 'tempo' : 'connessione', dati: errore(scaduto ? 'Google non ha risposto in tempo: riprova fra poco' : 'Non riesco a raggiungere Google: controlla la rete e riprova', true) };
    }
  }

  risposta(o) {
    if (o && o.accesso === false) this.token = '';
    return o;
  }

  // ------------------------------------------------------------------ le richieste

  async accedi(email, password) {
    const dati = Object.assign({ azione: 'accedi', email, password }, this.chi);
    let r;
    if (this.google) {
      const g = await this.aGoogle({ porta: 1, id: nuovoId(), token: '', strada: 'exec', metodo: 'POST', dati }, 75000, 'attesa');
      if (!g.rete) this.contatto('google');
      r = g.dati;
    } else {
      const c = await this.aCasa('/exec', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, this.testa(false)), body: JSON.stringify(dati) }, 90000);
      if (c.arrivata) this.contatto('casa');
      r = c.dati;
    }
    this.dimentica();
    if (r && r.ok && r.token) this.token = r.token;
    return r;
  }

  /** Una richiesta /exec per la strada scelta, con l'id dato. */
  async exec(metodo, dati, id) {
    const conGoogle = !!this.google;
    if (await this.strada() === 'casa') {
      let c;
      if (metodo === 'GET') {
        const q = new URLSearchParams();
        for (const k of Object.keys(dati)) q.set(k, String(dati[k]));
        c = await this.aCasa('/exec?' + q, { headers: this.testa(true) }, conGoogle ? 55000 : 90000);
      } else {
        c = await this.aCasa('/exec', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, this.testa(true)), body: JSON.stringify(Object.assign({}, dati, { idRichiesta: id })) }, conGoogle ? 55000 : 90000);
      }
      if (c.arrivata && (c.http200 || !conGoogle)) { this.contatto('casa'); return this.risposta(c.dati); }
      if (!conGoogle) return c.dati;
      this.log('il server di casa non ha risposto: passo da Google con la stessa richiesta');
      this.scegli('google');
    }
    if (!conGoogle) return errore('Manca l\'indirizzo del server', true);
    const g = await this.aGoogle({ porta: 1, id, token: this.token, strada: 'exec', metodo, dati }, 75000, 'tutto');
    if (g.rete) return g.dati;
    this.contatto('google');
    return this.risposta(g.dati);
  }

  async leggi(azione, parametri) {
    const dati = { azione };
    for (const [k, v] of parametri || []) if (!['azione', 'codice', 'disp', 'dispNome', 'app', 'token', 'idRichiesta'].includes(k)) dati[k] = v;
    return this.exec('GET', dati, nuovoId());
  }

  /** Una scrittura: rimandata uguale dopo un errore di rete (il "Riprova"), riparte con lo stesso id. */
  async scrivi(azione, corpo, idDato) {
    const dati = Object.assign({}, corpo || {}, { azione });
    delete dati.token; delete dati.codice; delete dati.idRichiesta;
    const chiave = sha('exec\n' + JSON.stringify(dati));
    const id = idDato || this.idPer(chiave);
    const r = await this.exec('POST', dati, id);
    this.ricorda(chiave, id, !!(r && r.rete));
    this.ultimoId = id;
    return r;
  }

  idPer(chiave) {
    const ora = Date.now();
    for (const [k, v] of this.daRiprovare) if (ora - v.quando > 10 * 60000) this.daRiprovare.delete(k);
    const v = this.daRiprovare.get(chiave);
    return v ? v.id : nuovoId();
  }

  ricorda(chiave, id, senzaRisposta) {
    if (senzaRisposta) this.daRiprovare.set(chiave, { id, quando: Date.now() });
    else this.daRiprovare.delete(chiave);
  }

  /** Un file: {stato, mime, dati (Buffer), errore}. */
  async file(idFile) {
    const conGoogle = !!this.google;
    const id = nuovoId();
    if (await this.strada() === 'casa') {
      this.conti.casa++;
      try {
        const r = await fetch(this.casa + '/file/' + encodeURIComponent(idFile), { headers: Object.assign({ 'X-Wisper-Disp': this.chi.disp, 'X-Wisper-App': this.chi.app }, this.testa(true)), signal: AbortSignal.timeout(90000), redirect: 'manual' });
        if (r.status === 200) { const b = Buffer.from(await r.arrayBuffer()); this.contatto('casa'); return { stato: 200, mime: r.headers.get('content-type') || 'application/octet-stream', dati: b, errore: '' }; }
        if ([401, 403, 404].includes(r.status)) {
          this.contatto('casa');
          if (r.status === 401) this.token = '';
          return { stato: r.status, mime: 'text/plain', dati: Buffer.alloc(0), errore: '' };
        }
        if (!conGoogle) return { stato: r.status, mime: 'text/plain', dati: Buffer.alloc(0), errore: 'Il server ha risposto ' + r.status };
      } catch (e) {
        if (!conGoogle) return { stato: 502, mime: 'text/plain', dati: Buffer.alloc(0), errore: 'Il server non risponde: controlla la rete e riprova' };
      }
      this.scegli('google');
    }
    if (!conGoogle) return { stato: 502, mime: 'text/plain', dati: Buffer.alloc(0), errore: 'Manca l\'indirizzo del server' };
    const g = await this.aGoogle(Object.assign({ porta: 1, id, token: this.token, strada: 'file', file: idFile }, this.chi), 120000, 'tutto');
    if (g.rete) return { stato: 502, mime: 'text/plain', dati: Buffer.alloc(0), errore: g.dati.errore };
    this.contatto('google');
    const o = g.dati;
    if (o.ok === true) return { stato: 200, mime: o.mime || 'application/octet-stream', dati: Buffer.from(String(o.base64 || ''), 'base64'), errore: '', nome: o.nome };
    if (o.stato === 401 || o.accesso === false) { this.token = ''; return { stato: 401, mime: 'text/plain', dati: Buffer.alloc(0), errore: 'Accesso scaduto: entra di nuovo' }; }
    return { stato: o.stato || 404, mime: 'text/plain', dati: Buffer.alloc(0), errore: o.errore || 'File non trovato' };
  }

  /** Un file in byte (/carica): in casa così com'è, da Google in base64 fino a 26 MB. */
  async carica(byte, q) {
    q = Object.assign({ nome: 'file', mime: 'application/octet-stream', idFile: '', per: 'documento' }, q || {});
    const chiave = sha('carica\n' + q.nome + '\n' + q.mime + '\n' + q.per + '\n' + q.idFile + '\n' + byte.length);
    const id = this.idPer(chiave);
    if (!q.idFile) q.idFile = 'pc-' + id;
    const r = await this.caricaPerStrada(byte, q, id);
    this.ricorda(chiave, id, !!(r && r.rete));
    return r;
  }

  async caricaPerStrada(byte, q, id) {
    const conGoogle = !!this.google;
    if (await this.strada() === 'casa') {
      const u = new URLSearchParams();
      for (const k of ['nome', 'mime', 'per', 'idFile']) if (q[k]) u.set(k, q[k]);
      const c = await this.aCasa('/carica?' + u, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream', 'X-Wisper-Disp': this.chi.disp, 'X-Wisper-App': this.chi.app }, this.testa(true)), body: byte }, 15 * 60000);
      if (c.arrivata && (c.http200 || !conGoogle)) { this.contatto('casa'); return this.risposta(c.dati); }
      if (!conGoogle) return c.dati;
      this.scegli('google');
    }
    if (!conGoogle) return errore('Manca l\'indirizzo del server', true);
    if (byte.length > MASSIMO_DA_GOOGLE) return errore(TROPPO_GRANDE);
    const g = await this.aGoogle(Object.assign({ porta: 1, id, token: this.token, strada: 'carica', query: { nome: q.nome, mime: q.mime, idFile: q.idFile, per: q.per } }, this.chi, { base64: byte.toString('base64') }), 180000, 'attesa');
    if (g.rete) return g.dati;
    this.contatto('google');
    return this.risposta(g.dati);
  }
}

module.exports = { Collegamento, firmaAttesa, nuovoId, casuale, indirizzoGoogle, MASSIMO_DA_GOOGLE, TROPPO_GRANDE, DURATA_SCELTA_MS };
