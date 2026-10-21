/*
 * Amministrazione: utenti, dispositivi collegati, ruoli e permessi, registro
 * delle modifiche e degli accessi, numerazioni.
 *
 * Due regole che non si scavalcano:
 *  - il titolare ha sempre tutto, e l'ultimo titolare attivo non si toglie
 *    (ne' cambiandogli ruolo, ne' disattivandolo): senza, nessuno potrebbe piu'
 *    cambiare utenti e permessi;
 *  - chi non e' titolare non puo' dare a un ruolo piu' di quello che ha lui, ne'
 *    nominare un titolare: un permesso non si allarga da solo.
 */
'use strict';

const P = require('../permessi');
const { Rifiuto, senzaPermesso, testo, adesso, dataOraIso, numero } = require('../utili');
const { hashPassword, controllaPasswordNuova, generaPassword } = require('./accesso');
const { controllaFormato } = require('../formati');

const PER_PAGINA = 100;
const MASSIMO_ACCESSI = 60000;
const ACCESSI_DOPO_LA_PULIZIA = 50000;

function utenteDaRiga(u, sessioni) {
  return {
    id: u.id, nome: u.nome, email: u.email, ruolo: u.ruolo, attivo: u.attivo === 1,
    creato: dataOraIso(u.creato), ultimoAccesso: dataOraIso(u.ultimo_accesso), dispositivi: sessioni || 0,
  };
}

function json(v) {
  if (v === null || v === undefined) return null;
  try { return JSON.parse(v); } catch (e) { return v; }
}

module.exports = {
  // ------------------------------------------------------------------ utenti

  leggiUtenti() {
    const attive = {};
    for (const s of this.db.righe('SELECT utente_id, COUNT(*) n FROM sessioni WHERE revocata IS NULL GROUP BY utente_id')) attive[s.utente_id] = s.n;
    return this.db.righe('SELECT * FROM utenti ORDER BY attivo DESC, nome').map(u => utenteDaRiga(u, attive[u.id]));
  },

  titolariAttivi() {
    return this.db.riga("SELECT COUNT(*) n FROM utenti WHERE ruolo = 'titolare' AND attivo = 1").n;
  },

  eTitolare() {
    const c = this.chi();
    return c.sistema || !!(c.utente && c.utente.ruolo === 'titolare');
  },

  /**
   * Crea o modifica un utente: nome, email, ruolo, attivo. Un utente nuovo
   * senza password scritta ne riceve una iniziale, che torna UNA volta nella
   * risposta (passwordIniziale) e si comunica a voce.
   */
  async salvaUtente(x) {
    x = x || {};
    const nuovo = !x.id;
    const prima = nuovo ? null : this.db.riga('SELECT * FROM utenti WHERE id = ?', Number(x.id));
    if (!nuovo && !prima) throw new Rifiuto('Utente ' + x.id + ' non trovato');

    const v = {};
    if (x.nome !== undefined || nuovo) {
      v.nome = testo(x.nome);
      if (!v.nome) throw new Rifiuto('Nome: scrivi il nome');
    }
    if (x.email !== undefined || nuovo) {
      v.email = testo(x.email).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+$/.test(v.email)) throw new Rifiuto('Email: manca la @ o c\'è uno spazio');
      const altro = this.db.riga('SELECT id FROM utenti WHERE email = ? AND id <> ?', v.email, prima ? prima.id : 0);
      if (altro) throw new Rifiuto('Email: c\'è già un utente con questa email');
    }
    if (x.ruolo !== undefined || nuovo) {
      // I nuovi partono dal ruolo piu' basso che scrive: collaboratore.
      v.ruolo = testo(x.ruolo).toLowerCase() || 'collaboratore';
      if (P.RUOLI.indexOf(v.ruolo) < 0) throw new Rifiuto('Ruolo: titolare, amministrazione, collaboratore o lettura');
    }
    if (x.attivo !== undefined) v.attivo = x.attivo ? 1 : 0;

    const diventaTitolare = v.ruolo === 'titolare' && (!prima || prima.ruolo !== 'titolare');
    const toccaTitolare = prima && prima.ruolo === 'titolare';
    if ((diventaTitolare || toccaTitolare) && !this.eTitolare()) throw senzaPermesso('nominare o cambiare un titolare');
    if (prima && prima.ruolo === 'titolare' && prima.attivo === 1 &&
      ((v.ruolo && v.ruolo !== 'titolare') || v.attivo === 0) && this.titolariAttivi() <= 1) {
      throw new Rifiuto('Non si può togliere l\'ultimo titolare attivo: prima nominane un altro');
    }

    let passwordIniziale = null;
    let password = testo(x.password) ? String(x.password) : null;
    if (password) controllaPasswordNuova(password);
    if (nuovo && !password) {
      passwordIniziale = generaPassword();
      password = passwordIniziale;
    }
    const hash = password ? await hashPassword(password) : null;

    const id = this.db.transazione(() => {
      if (nuovo) {
        return this.inserisci('utenti', Object.assign({ attivo: 1 }, v, { password_hash: hash, creato: adesso() }));
      }
      if (hash) v.password_hash = hash;
      this.aggiorna('utenti', prima.id, v);
      // Password nuova o utente disattivato: i suoi dispositivi escono.
      if (hash || v.attivo === 0) {
        this.db.esegui('UPDATE sessioni SET revocata = ? WHERE utente_id = ? AND revocata IS NULL', adesso(), prima.id);
      }
      return prima.id;
    });
    const risposta = { ok: true, utente: utenteDaRiga(this.db.riga('SELECT * FROM utenti WHERE id = ?', id)) };
    if (passwordIniziale) risposta.passwordIniziale = passwordIniziale;
    return risposta;
  },

  /** Una password nuova scelta dal server, per chi l'ha dimenticata. I suoi dispositivi escono. */
  async nuovaPassword(idUtente) {
    const u = this.db.riga('SELECT * FROM utenti WHERE id = ?', Number(idUtente));
    if (!u) throw new Rifiuto('Utente ' + idUtente + ' non trovato');
    if (u.ruolo === 'titolare' && !this.eTitolare()) throw senzaPermesso('cambiare la password di un titolare');
    const passwordIniziale = generaPassword();
    const hash = await hashPassword(passwordIniziale);
    this.db.transazione(() => {
      this.aggiorna('utenti', u.id, { password_hash: hash });
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE utente_id = ? AND revocata IS NULL', adesso(), u.id);
    });
    return { ok: true, passwordIniziale };
  },

  /** I dispositivi collegati (sessioni attive), di tutti o di uno. */
  leggiSessioni(idUtente) {
    const c = this.chi();
    const righe = testo(idUtente)
      ? this.db.righe('SELECT s.*, u.nome FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.revocata IS NULL AND s.utente_id = ? ORDER BY s.ultimo_uso DESC', Number(idUtente))
      : this.db.righe('SELECT s.*, u.nome FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.revocata IS NULL ORDER BY s.ultimo_uso DESC');
    return righe.map(s => ({
      id: s.id, idUtente: s.utente_id, utente: s.nome, disp: s.disp, dispNome: s.disp_nome, app: s.app,
      creata: dataOraIso(s.creata), ultimoUso: dataOraIso(s.ultimo_uso), questa: s.id === c.sessione,
    }));
  },

  revocaSessione(id) {
    const s = this.db.riga('SELECT s.*, u.ruolo FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.id = ?', Number(id));
    if (!s) throw new Rifiuto('Dispositivo ' + id + ' non trovato');
    if (s.ruolo === 'titolare' && !this.eTitolare()) throw senzaPermesso('scollegare i dispositivi di un titolare');
    if (!s.revocata) {
      const ora = adesso();
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE id = ?', ora, s.id);
      this.annota('sessioni', s.id, { utente_id: s.utente_id, disp_nome: s.disp_nome, revocata: null }, { revocata: ora }, 'dispositivo scollegato');
    }
    return { ok: true };
  },

  // ------------------------------------------------------------------ permessi

  leggiPermessi() {
    const permessi = {};
    for (const r of P.RUOLI) permessi[r] = this.permessiDi(r);
    return { ok: true, ruoli: P.RUOLI, moduli: P.MODULI, speciali: P.SPECIALI, permessi };
  },

  /** salvaPermessi {permessi: {ruolo: {modulo: livello}}}: vale da subito, anche per chi e' gia' collegato. */
  salvaPermessi(d) {
    const nuovi = d.permessi || {};
    const mie = this.chi().permessi;
    for (const ruolo of Object.keys(nuovi)) {
      if (ruolo === 'titolare') throw new Rifiuto('Il titolare ha sempre tutto: i suoi permessi non si cambiano');
      if (P.RUOLI.indexOf(ruolo) < 0) throw new Rifiuto('Ruolo sconosciuto: ' + ruolo);
      for (const modulo of Object.keys(nuovi[ruolo] || {})) {
        if (P.TUTTE.indexOf(modulo) < 0) throw new Rifiuto('Modulo sconosciuto: ' + modulo);
        const livello = Number(nuovi[ruolo][modulo]);
        if ([0, 1, 2].indexOf(livello) < 0) throw new Rifiuto('Livello non valido per ' + modulo + ': 0 niente, 1 vede, 2 modifica');
        if (!this.eTitolare() && mie && livello > (mie[modulo] || 0)) {
          throw senzaPermesso('dare a un ruolo più di quello che hai tu (' + modulo + ')');
        }
        const prima = this.db.riga('SELECT livello FROM permessi WHERE ruolo = ? AND modulo = ?', ruolo, modulo);
        if (prima && prima.livello === livello) continue;
        this.db.esegui('INSERT INTO permessi (ruolo, modulo, livello) VALUES (?, ?, ?) ON CONFLICT(ruolo, modulo) DO UPDATE SET livello = excluded.livello',
          ruolo, modulo, livello);
        this.annota('permessi', ruolo + '.' + modulo, { livello: prima ? prima.livello : null }, { livello });
      }
    }
    return this.leggiPermessi();
  },

  // ------------------------------------------------------------------ registro e accessi

  /** registro {da, a, utente, tabella, idRiga, pagina}: le modifiche, le piu' recenti prima. */
  leggiRegistro(d) {
    const cond = [];
    const par = [];
    if (testo(d.da)) { cond.push('substr(quando, 1, 10) >= ?'); par.push(testo(d.da)); }
    if (testo(d.a)) { cond.push('substr(quando, 1, 10) <= ?'); par.push(testo(d.a)); }
    if (testo(d.utente)) { cond.push('utente_id = ?'); par.push(Number(d.utente)); }
    if (testo(d.tabella)) { cond.push('tabella = ?'); par.push(testo(d.tabella)); }
    if (testo(d.idRiga)) { cond.push('id_riga = ?'); par.push(testo(d.idRiga)); }
    const dove = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
    const quante = this.db.riga('SELECT COUNT(*) n FROM registro' + dove, ...par).n;
    const pagina = Math.max(1, Math.round(numero(d.pagina)) || 1);
    const righe = this.db.righe('SELECT * FROM registro' + dove + ' ORDER BY id DESC LIMIT ' + PER_PAGINA + ' OFFSET ' + (pagina - 1) * PER_PAGINA, ...par)
      .map(r => ({
        id: r.id, quando: dataOraIso(r.quando), idUtente: r.utente_id, utente: r.utente, disp: r.disp, azione: r.azione,
        tabella: r.tabella, idRiga: r.id_riga, prima: json(r.prima), dopo: json(r.dopo), nota: r.nota,
      }));
    return { ok: true, righe, pagina, pagine: Math.max(1, Math.ceil(quante / PER_PAGINA)), quante };
  },

  /** accessi {da, a, utente, esito, pagina}: ogni richiesta, le piu' recenti prima. */
  leggiAccessi(d) {
    const cond = [];
    const par = [];
    if (testo(d.da)) { cond.push('substr(a.quando, 1, 10) >= ?'); par.push(testo(d.da)); }
    if (testo(d.a)) { cond.push('substr(a.quando, 1, 10) <= ?'); par.push(testo(d.a)); }
    if (testo(d.utente)) { cond.push('a.utente_id = ?'); par.push(Number(d.utente)); }
    if (testo(d.esito)) { cond.push('a.esito = ?'); par.push(testo(d.esito)); }
    const dove = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
    const quante = this.db.riga('SELECT COUNT(*) n FROM accessi a' + dove, ...par).n;
    const pagina = Math.max(1, Math.round(numero(d.pagina)) || 1);
    const righe = this.db.righe('SELECT a.*, u.nome FROM accessi a LEFT JOIN utenti u ON u.id = a.utente_id' + dove +
      ' ORDER BY a.id DESC LIMIT ' + PER_PAGINA + ' OFFSET ' + (pagina - 1) * PER_PAGINA, ...par)
      .map(r => ({
        id: r.id, quando: dataOraIso(r.quando), esito: r.esito, azione: r.azione, idUtente: r.utente_id,
        utente: r.nome || '', disp: r.disp, dispNome: r.disp_nome, app: r.app,
      }));
    return { ok: true, righe, pagina, pagine: Math.max(1, Math.ceil(quante / PER_PAGINA)), quante };
  },

  /**
   * La riga negli accessi, per ogni richiesta, e il dispositivo visto. Non
   * deve mai fermare una risposta. Mai la password o il token.
   */
  registraAccesso(d, esito, utente) {
    try {
      d = d || {};
      const ora = adesso();
      const disp = testo(d.disp).slice(0, 64);
      const nome = testo(d.dispNome).slice(0, 80);
      const app = testo(d.app).slice(0, 40);
      this.db.esegui('INSERT INTO accessi (quando, esito, azione, utente_id, disp, disp_nome, app) VALUES (?,?,?,?,?,?,?)',
        ora, esito, testo(d.azione).slice(0, 40) || 'anagrafiche', utente ? utente.id : null, disp, nome || 'senza nome', app);
      if (disp && utente) {
        this.db.esegui('INSERT INTO dispositivi (id, nome, app, primo, ultimo, utente_id) VALUES (?,?,?,?,?,?) ' +
          'ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, app = excluded.app, ultimo = excluded.ultimo, utente_id = excluded.utente_id',
          disp, nome, app, ora, ora, utente.id);
      }
      this.puliziaAccessi();
    } catch (err) {
      // Il registro non deve fermare la risposta.
    }
  },

  /** Una volta al giorno, se le righe sono troppe (circa un anno d'uso), via le piu' vecchie. */
  puliziaAccessi() {
    const ora = Date.now();
    if (this.ultimaPulizia && ora - this.ultimaPulizia < 24 * 3600 * 1000) return;
    this.ultimaPulizia = ora;
    const n = this.db.riga('SELECT COUNT(*) n FROM accessi').n;
    if (n > MASSIMO_ACCESSI) {
      this.db.esegui('DELETE FROM accessi WHERE id IN (SELECT id FROM accessi ORDER BY id LIMIT ?)', n - ACCESSI_DOPO_LA_PULIZIA);
    }
  },

  // ------------------------------------------------------------------ numerazioni

  /** Le numerazioni, ognuna col prossimo codice che darebbe adesso. */
  leggiNumerazioni() {
    const anno = new Date().getFullYear();
    return this.db.righe('SELECT * FROM numerazioni ORDER BY tipo').map(n => {
      const prossimo = n.tipo === 'commessa' ? this.prossimoCodiceCommessa(anno)
        : n.tipo === 'rapportino' ? this.prossimoNumeroRapportino(anno)
          : n.tipo === 'preventivo' ? this.prossimoNumeroPreventivo(anno) : null;
      return {
        tipo: n.tipo, formato: n.formato, annuale: n.annuale === 1, ultimo: n.ultimo,
        prossimo: prossimo ? prossimo.codice : '',
      };
    });
  },

  /** Un formato nuovo vale solo per i numeri nuovi: quelli gia' dati non cambiano. */
  salvaNumerazione(d) {
    const n = this.numerazione(testo(d.tipo));
    const annuale = d.annuale === undefined ? n.annuale === 1 : !!d.annuale;
    const formato = controllaFormato(d.formato === undefined ? n.formato : d.formato, annuale);
    const precedenti = JSON.parse(n.formati_precedenti || '[]');
    if (formato !== n.formato && precedenti.indexOf(n.formato) < 0) precedenti.push(n.formato);
    const prima = { formato: n.formato, annuale: n.annuale };
    const dopo = { formato, annuale: annuale ? 1 : 0 };
    if (prima.formato !== dopo.formato || prima.annuale !== dopo.annuale) {
      this.db.esegui('UPDATE numerazioni SET formato = ?, annuale = ?, formati_precedenti = ? WHERE tipo = ?',
        formato, dopo.annuale, JSON.stringify(precedenti), n.tipo);
      this.annota('numerazioni', n.tipo, prima, dopo);
    }
    return this.leggiNumerazioni().filter(x => x.tipo === n.tipo)[0];
  },
};
