/*
 * Il collegamento a Google: la porta Google dal lato del NAS
 * (docs/gestionale/porta-google.md, apps-script/Porta.gs).
 *
 * Il NAS di casa non si raggiunge da internet. Telefoni e computer fuori casa
 * mandano le richieste allo script del foglio (Apps Script), che le tiene in
 * coda; qui il server le va a prendere da solo, sempre lui a chiamare Google:
 *
 *   1. portaPrendi: "c'e' lavoro?". Lo script tiene aperta la chiamata fino a
 *      45 secondi (WISPER_PORTA_ATTESA) e la chiude appena arriva una richiesta.
 *      Appena torna, si richiama: una chiamata aperta sempre, giorno e notte.
 *   2. Ogni lavoro passa allo stesso gestore di /exec, /carica, /file/<id> e
 *      /ponte (richiestaInterna in http.js): stessi permessi, stesso registro,
 *      provenienza "google" (da fuori, per i limiti ai tentativi d'accesso).
 *   3. La risposta parte con la chiamata portaPrendi successiva; se una chiamata
 *      e' gia' aperta ad aspettare, parte subito con portaConsegna.
 *
 * Fase 7 (fase7.md §0.1): un secondo giro, con soloPortale, va a prendere il lavoro dallo script DEL PORTALE (un
 * progetto Apps Script a parte, col suo segreto SEGRETO_PORTALE e WISPER_PORTALE_URL): accetta solo i lavori
 * {tipo: "portale"} e li passa al router del portale (w.portale.richiesta), mai a /exec. Il giro di sempre (quello del
 * foglio) rifiuta i lavori "portale" (Richiesta non valida), e questo rifiuta tutto il resto.
 *
 * Senza perdere niente: una risposta che non arriva allo script resta qui e
 * riparte; un lavoro che lo script ridà (risposta persa) non si rifa' se e' una
 * scrittura (ricordo.js, con l'id della richiesta) e se e' ancora in corso si
 * aspetta quello. Se Google non risponde si riprova dopo 2, 4, 8... secondi, fino
 * a un minuto, senza fine.
 */
'use strict';

const { richiestaInterna } = require('./http');
const { testo, oggi, dataOraIso } = require('./utili');

const PROVENIENZA = Object.freeze({ ip: 'google', daFuori: true });
const ATTESA_S = 45;
const PAUSA_MINIMA = 2000;
const PAUSA_MASSIMA = 60000;
/** Un file oltre questa misura non passa da Google (in base64 sono 33 MB, il limite di una chiamata e' 50). */
const FILE_MASSIMO = 25 * 1024 * 1024;
/** Quanto si manda allo script in una chiamata (testo). */
const CONSEGNA_MASSIMA = 40 * 1000 * 1000;
/** Lo script dimentica una richiesta dopo 10 minuti: una risposta piu' vecchia di cosi' non serve piu'. */
const RISPOSTA_VECCHIA_MS = 9 * 60 * 1000;
/** Un lavoro che non finisce: l'app riceve "riprova" invece di aspettare per niente. */
const LAVORO_MASSIMO_MS = 120 * 1000;
const RE_ID = /^[A-Za-z0-9_-]{8,80}$/;

const NON_VALIDA = '{"ok":false,"errore":"Richiesta non valida"}';
const SOLO_IN_CASA = JSON.stringify({ ok: false, stato: 403, soloInCasa: true, errore: 'Il file con tutti i dati si scarica solo in casa: aprilo quando sei in ufficio' });
const ERRORE_SERVER = '{"ok":false,"rete":true,"errore":"Errore del server: riprova"}';

class PortaGoogle {
  /**
   * @param w  il server (wisper.js)
   * @param o  {url: WISPER_POSTINO_URL, segreto: WISPER_POSTINO_SEGRETO o SEGRETO_SERVER,
   *            segretoPonte: SEGRETO_SERVER, attesaS, pausaS, spenta: WISPER_PORTA_GOOGLE=no, fetch (le prove)}
   * pausaS (WISPER_PORTA_PAUSA, di base 0): i secondi fra una chiamata senza lavoro e la successiva. Con
   * attesaS 0 e pausaS 3 la porta diventa "una chiamata breve ogni 3 secondi" (la strada di riserva, se
   * Google un giorno non volesse chiamate tenute aperte: porta-google.md §6).
   */
  constructor(w, o) {
    o = o || {};
    this.w = w;
    this.url = testo(o.url);
    this.segreto = testo(o.segreto);
    this.segretoPonte = testo(o.segretoPonte);
    this.attesaS = Math.min(Math.max(o.attesaS === undefined || o.attesaS === null || isNaN(Number(o.attesaS)) ? ATTESA_S : Number(o.attesaS), 0), 55);
    this.pausaS = Math.min(Math.max(Number(o.pausaS) || 0, 0), 300);
    this.spenta = !!o.spenta;
    // Fase 7: il giro del portale (solo i lavori "portale", al router del portale).
    this.soloPortale = !!o.soloPortale;
    this.fetch = o.fetch || ((...a) => fetch(...a));
    this.acceso = false;
    this.inAttesaLunga = false;
    this.pronte = [];
    this.inCorso = new Map();
    this.controllori = new Set();
    this.svegli = new Set();
    this.consegnando = false;
    this.ancora = false;
    this.inConsegna = new Set();
    this.ultimoContatto = 0;
    this.ultimoErrore = '';
    this.erroriDiFila = 0;
    this.annunciato = false;
    this.azzeraConti();
  }

  configurata() {
    return !!(this.url && this.segreto);
  }

  avvia() {
    if (this.acceso || !this.configurata() || this.spenta) return;
    this.acceso = true;
    this.ciclo = this.gira().catch(err => console.error('[porta] ' + (err && err.stack ? err.stack : err)));
  }

  /** Ferma il collegamento: la chiamata aperta si chiude subito. */
  ferma() {
    this.acceso = false;
    this.controllori.forEach(c => c.abort());
    this.svegli.forEach(s => s());
    return this.ciclo || Promise.resolve();
  }

  /** Per /salute e per Amministrazione (copie): {stato, frase, ultimoContatto, ...}. */
  stato() {
    if (!this.configurata()) {
      return { stato: 'non collegato', frase: this.soloPortale ? 'Non collegato: mancano WISPER_PORTALE_URL e SEGRETO_PORTALE nel .env' : 'Non collegato: mancano WISPER_POSTINO_URL e SEGRETO_SERVER nel .env', ultimoContatto: '' };
    }
    this.contiDiOggi();
    const ultimo = this.ultimoContatto ? dataOraIso(new Date(this.ultimoContatto)) : '';
    const alle = ultimo ? ultimo.slice(11, 16) : '';
    let stato;
    if (this.spenta) stato = 'spento';
    else if (!this.acceso) stato = 'fermo';
    else if (this.erroriDiFila) stato = 'non risponde';
    else if (this.ultimoContatto && Date.now() - this.ultimoContatto < (this.attesaS + this.pausaS + 30) * 1000) stato = 'attivo';
    else stato = this.ultimoContatto ? 'non risponde' : 'in avvio';
    const frasi = {
      spento: 'Spento (WISPER_PORTA_GOOGLE=no)',
      fermo: 'Fermo',
      attivo: 'Attivo, ultimo contatto alle ' + alle,
      'in avvio': 'In avvio',
      'non risponde': 'Non risponde' + (alle ? ' (ultimo contatto alle ' + alle + ')' : '') + ': riprova da solo',
    };
    const o = {
      stato, frase: frasi[stato], ultimoContatto: ultimo,
      oggi: {
        chiamate: this.conti.chiamate, lavori: this.conti.lavori, errori: this.conti.errori,
        // In media: quanto una richiesta e' rimasta in coda sullo script prima che arrivasse qui, e quanto ci ha messo il server.
        attesaInCodaMs: this.conti.lavori ? Math.round(this.conti.inCoda / this.conti.lavori) : 0,
        lavoroMs: this.conti.lavori ? Math.round(this.conti.tempo / this.conti.lavori) : 0,
      },
      inCorso: this.inCorso.size,
      daConsegnare: this.pronte.length,
    };
    if (this.ultimoErrore) o.ultimoErrore = this.ultimoErrore;
    return o;
  }

  azzeraConti() {
    this.conti = { giorno: oggi(), chiamate: 0, lavori: 0, errori: 0, inCoda: 0, tempo: 0 };
  }

  contiDiOggi() {
    if (this.conti.giorno !== oggi()) this.azzeraConti();
  }

  // ------------------------------------------------------------------ il giro

  async gira() {
    while (this.acceso) {
      const risposte = this.prendiPronte();
      let r;
      this.inAttesaLunga = true;
      try {
        // inCorso: i lavori che ho in mano (anche le risposte non ancora consegnate). Uno "preso" che non c'e'
        // (ripartito il server, o una risposta di Google mai arrivata) lo script lo ridà subito.
        const inCorso = Array.from(new Set([...this.inCorso.keys(), ...this.pronte.map(r => r.id), ...risposte.map(r => r.id), ...this.inConsegna]));
        r = await this.chiama(this.corpo('portaPrendi', risposte, { attesa: this.attesaS, max: 8, inCorso }), (this.attesaS + 30) * 1000);
      } catch (err) {
        this.inAttesaLunga = false;
        this.rimetti(risposte);
        if (!this.acceso) break;
        this.errore(err);
        await this.pausa(Math.min(PAUSA_MASSIMA, PAUSA_MINIMA * 2 ** Math.min(6, this.erroriDiFila - 1)));
        continue;
      }
      this.inAttesaLunga = false;
      this.contatto();
      const lavori = Array.isArray(r.lavori) ? r.lavori : [];
      if (lavori.length) {
        // I lavori veloci (quasi tutti) partono con la prossima chiamata; i lenti, quando finiscono, con portaConsegna.
        await Promise.race([Promise.allSettled(lavori.map(l => this.lavora(l))), this.pausa(1500)]);
      } else if (this.pausaS && this.acceso) {
        await this.pausa(this.pausaS * 1000);
      }
    }
  }

  /** Un lavoro dello script: lo fa e mette la risposta fra quelle da consegnare. */
  lavora(l) {
    const id = testo(l && l.id);
    if (!RE_ID.test(id)) return Promise.resolve();
    // Lo stesso lavoro ridato mentre e' ancora in corso: si aspetta quello, senza rifarlo.
    if (this.inCorso.has(id)) return this.inCorso.get(id);
    const inizio = Date.now();
    let scaduto;
    const tempo = new Promise(r => { scaduto = setTimeout(() => r(ERRORE_SERVER), LAVORO_MASSIMO_MS); });
    const p = Promise.race([this.esegui((l && l.lavoro) || {}, id), tempo])
      .catch(err => {
        console.error('[porta] ' + (err && err.stack ? err.stack : err));
        return ERRORE_SERVER;
      })
      .then(t => {
        clearTimeout(scaduto);
        this.contiDiOggi();
        this.conti.lavori++;
        this.conti.tempo += Date.now() - inizio;
        this.conti.inCoda += Number(l.inCoda) || 0;
        this.pronte.push({ id, testo: t, quando: Date.now() });
        if (this.inAttesaLunga) this.consegnaSubito();
      })
      .finally(() => this.inCorso.delete(id));
    this.inCorso.set(id, p);
    return p;
  }

  /** Il lavoro, dallo stesso gestore delle richieste di casa. Torna il testo JSON per l'app. */
  async esegui(l, id) {
    // Fase 7: il giro del portale passa i lavori "portale" al router del portale e rifiuta tutto il resto; il giro del
    // foglio rifiuta i lavori "portale" (cade in fondo: Richiesta non valida).
    if (this.soloPortale) {
      if (l.tipo !== 'portale' || !this.w.portale) return NON_VALIDA;
      const lavoro = Object.assign({}, l, { id: testo(l.id) || id });
      return JSON.stringify(await this.w.portale.richiesta(lavoro));
    }
    if (l.tipo === 'portale') return NON_VALIDA;
    const accesso = testo(l.token) ? { authorization: 'Bearer ' + testo(l.token) } : {};
    const opzioni = { segretoPonte: this.segretoPonte };
    const chiedi = r => richiestaInterna(this.w, opzioni, r, PROVENIENZA);
    if (l.tipo === 'exec') {
      if (!l.dati || typeof l.dati !== 'object' || Array.isArray(l.dati)) return NON_VALIDA;
      const dati = Object.assign({}, l.dati);
      if (l.metodo === 'GET') {
        const query = {};
        for (const k of Object.keys(dati)) if (dati[k] !== undefined && dati[k] !== null && typeof dati[k] !== 'object') query[k] = String(dati[k]);
        return comeJson(await chiedi({ metodo: 'GET', percorso: '/exec', query, intestazioni: accesso }));
      }
      // L'id della richiesta: se lo script ridà lo stesso lavoro (risposta persa), una scrittura non si rifa'.
      dati.idRichiesta = id;
      return comeJson(await chiedi({ metodo: 'POST', percorso: '/exec', intestazioni: Object.assign({ 'content-type': 'application/json' }, accesso), corpo: JSON.stringify(dati) }));
    }
    if (l.tipo === 'carica') {
      const q = l.query && typeof l.query === 'object' ? l.query : {};
      const query = {};
      for (const k of ['nome', 'mime', 'idFile', 'per']) if (testo(q[k])) query[k] = testo(q[k]);
      const corpo = Buffer.from(typeof l.base64 === 'string' ? l.base64 : '', 'base64');
      return comeJson(await chiedi({ metodo: 'POST', percorso: '/carica', query, intestazioni: Object.assign(dispositivo(l), accesso), corpo }));
    }
    if (l.tipo === 'file') {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(testo(l.file))) return NON_VALIDA;
      const r = await chiedi({ metodo: 'GET', percorso: '/file/' + testo(l.file), intestazioni: Object.assign(dispositivo(l), accesso) });
      if (r.stato !== 200) {
        let j;
        try { j = JSON.parse(r.corpo.toString('utf8')); } catch (e) { j = { ok: false, errore: 'File non trovato' }; }
        j.stato = r.stato;
        return JSON.stringify(j);
      }
      if (r.corpo.length > FILE_MASSIMO) {
        return JSON.stringify({ ok: false, stato: 413, errore: 'Il file è troppo grande per passare da Google (più di ' + Math.round(FILE_MASSIMO / 1048576) + ' MB): aprilo quando sei in ufficio' });
      }
      return JSON.stringify({
        ok: true, nome: nomeDa(r.intestazioni['Content-Disposition']), mime: r.intestazioni['Content-Type'] || 'application/octet-stream',
        byte: r.corpo.length, base64: r.corpo.toString('base64'),
      });
    }
    if (l.tipo === 'ponte') {
      // Una versione vecchia (col codice, controllato dallo script): come il ponte di sempre, a nome del titolare.
      if (!this.segretoPonte) return JSON.stringify({ ok: false, rete: true, errore: 'Il ponte del server è spento (manca SEGRETO_SERVER): riprova più tardi' });
      const dati = l.dati && typeof l.dati === 'object' && !Array.isArray(l.dati) ? l.dati : {};
      const r = await chiedi({ metodo: 'POST', percorso: '/ponte', intestazioni: { 'content-type': 'application/json', 'x-wisper-segreto': this.segretoPonte }, corpo: JSON.stringify(dati) });
      return r.stato === 200 ? r.corpo.toString('utf8') : JSON.stringify({ ok: false, rete: true, errore: 'Il server ha risposto ' + r.stato + ': riprova fra poco' });
    }
    // Fase 8: lo ZIP di Esporta tutto (GET /esportazione/<id>) si scarica solo in casa, non passa da Google: una frase
    // chiara invece di "Richiesta non valida". Prepararlo (esportaTutto) da fuori casa si puo'.
    if (l.tipo === 'esportazione') return SOLO_IN_CASA;
    return NON_VALIDA;
  }

  // ------------------------------------------------------------------ le consegne

  /** Le risposte da consegnare, dalle piu' vecchie, fino a CONSEGNA_MASSIMA caratteri. */
  prendiPronte() {
    const ora = Date.now();
    this.pronte = this.pronte.filter(r => ora - r.quando < RISPOSTA_VECCHIA_MS);
    const prese = [];
    let n = 0;
    while (this.pronte.length && (prese.length === 0 || n + this.pronte[0].testo.length <= CONSEGNA_MASSIMA)) {
      const r = this.pronte.shift();
      n += r.testo.length;
      prese.push(r);
    }
    return prese;
  }

  rimetti(risposte) {
    if (risposte.length) this.pronte.unshift(...risposte);
  }

  /** Mentre una chiamata portaPrendi aspetta, le risposte pronte partono subito con portaConsegna. */
  consegnaSubito() {
    if (this.consegnando) { this.ancora = true; return; }
    this.consegnando = true;
    (async () => {
      do {
        this.ancora = false;
        const rs = this.prendiPronte();
        if (!rs.length) break;
        rs.forEach(r => this.inConsegna.add(r.id));
        try {
          await this.chiama(this.corpo('portaConsegna', rs, {}), 60000);
          this.contatto();
        } catch (err) {
          // Partono con la prossima portaPrendi.
          this.rimetti(rs);
          if (this.acceso) this.errore(err);
          break;
        } finally {
          rs.forEach(r => this.inConsegna.delete(r.id));
        }
      } while (this.acceso && (this.ancora || (this.inAttesaLunga && this.pronte.length)));
      this.consegnando = false;
    })();
  }

  /**
   * Il corpo della chiamata, scritto a mano: le risposte sono gia' JSON (cosi'
   * non si rileggono e non si riscrivono, anche quando sono grandi).
   */
  corpo(azione, risposte, altro) {
    let s = '{"azione":' + JSON.stringify(azione) + ',"segreto":' + JSON.stringify(this.segreto);
    for (const k of Object.keys(altro)) s += ',' + JSON.stringify(k) + ':' + JSON.stringify(altro[k]);
    return s + ',"risposte":[' + risposte.map(r => '{"id":' + JSON.stringify(r.id) + ',"risposta":' + r.testo + '}').join(',') + ']}';
  }

  async chiama(corpo, ms) {
    const ac = new AbortController();
    this.controllori.add(ac);
    const tempo = setTimeout(() => ac.abort(), ms);
    this.contiDiOggi();
    this.conti.chiamate++;
    try {
      let r;
      let t;
      try {
        // Apps Script risponde a una POST con un rimbalzo (302) verso un secondo indirizzo: fetch lo segue da solo.
        r = await this.fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo, redirect: 'follow', signal: ac.signal });
        t = await r.text();
      } catch (err) {
        if (ac.signal.aborted) throw new Error(this.acceso ? 'Google non ha risposto in tempo' : 'collegamento fermato');
        throw new Error('Google non si raggiunge (' + ((err.cause && (err.cause.code || err.cause.message)) || err.message) + ')');
      }
      if (r.status === 429) throw new Error('Google dice che ci sono troppe esecuzioni insieme (429)');
      if (!r.ok) throw new Error('Google ha risposto ' + r.status);
      let j;
      try {
        j = JSON.parse(t);
      } catch (e) {
        throw new Error(/<html|<!doctype/i.test(t) ? 'Google ha risposto con una pagina d\'errore (lo script si è fermato o è finita una quota)' : 'risposta non valida da Google');
      }
      if (!j || j.ok !== true) {
        throw new Error(j && j.errore === 'Segreto sbagliato'
          ? 'lo script dice "Segreto sbagliato": SEGRETO_SERVER nel .env deve essere uguale alla proprietà SEGRETO_SERVER dello script'
          : 'lo script ha detto: ' + ((j && j.errore) || 'no'));
      }
      return j;
    } finally {
      clearTimeout(tempo);
      this.controllori.delete(ac);
    }
  }

  contatto() {
    this.ultimoContatto = Date.now();
    if (this.erroriDiFila || !this.annunciato) console.log((this.soloPortale ? 'Portale clienti (Google): ' : 'Collegamento a Google: ') + 'attivo');
    this.annunciato = true;
    this.erroriDiFila = 0;
    this.ultimoErrore = '';
  }

  errore(err) {
    this.erroriDiFila++;
    this.contiDiOggi();
    this.conti.errori++;
    const frase = err && err.message ? err.message : String(err);
    if (this.erroriDiFila === 1 || frase !== this.ultimoErrore) console.log((this.soloPortale ? 'Portale clienti (Google): ' : 'Collegamento a Google: ') + 'non risponde (' + frase + '): riprovo da solo');
    this.ultimoErrore = frase;
  }

  pausa(ms) {
    return new Promise(r => {
      const sveglia = () => { clearTimeout(t); this.svegli.delete(sveglia); r(); };
      const t = setTimeout(sveglia, ms);
      this.svegli.add(sveglia);
    });
  }
}

/** Il JSON di una risposta interna; un errore HTTP diventa "riprova" (come per le app un 500). */
function comeJson(r) {
  const t = r.corpo.toString('utf8');
  if (r.stato === 200 && t.charAt(0) === '{') return t;
  if (t.charAt(0) === '{') {
    try {
      const j = JSON.parse(t);
      if (r.stato >= 500) j.rete = true;
      return JSON.stringify(j);
    } catch (e) { /* sotto */ }
  }
  return ERRORE_SERVER;
}

/** Le intestazioni del dispositivo per /carica e /file (come X-Wisper-Disp da casa). */
function dispositivo(l) {
  const o = {};
  if (testo(l.disp)) o['x-wisper-disp'] = testo(l.disp).slice(0, 64);
  if (testo(l.dispNome)) o['x-wisper-disp-nome'] = testo(l.dispNome).slice(0, 80);
  if (testo(l.app)) o['x-wisper-app'] = testo(l.app).slice(0, 40);
  return o;
}

function nomeDa(disposizione) {
  const m = String(disposizione || '').match(/filename\*=UTF-8''([^;]+)/i);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
}

module.exports = { PortaGoogle, PROVENIENZA, FILE_MASSIMO };
