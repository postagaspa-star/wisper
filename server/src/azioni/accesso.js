/*
 * Entrare e uscire (accordo §3). Ognuno ha la sua email e la sua password,
 * al posto del codice unico di oggi.
 *
 *  - la password si tiene solo come scrypt col suo sale: chi legge il database
 *    non la ricava;
 *  - "accedi" da' un token (32 byte casuali) che il dispositivo conserva; nel
 *    database ne resta solo lo SHA-256. Vale finche' non si esce o non viene
 *    revocato, e scade dopo 180 giorni senza uso: un telefono resta collegato;
 *  - 10 tentativi sbagliati in 15 minuti per la stessa email **dallo stesso indirizzo** = 15 minuti di
 *    attesa da li', anche con la password giusta: chi prova a indovinarla si ferma, ma chi conosce
 *    l'email di Manuel non gli blocca l'accesso dagli altri posti (22/10/2026, con l'ingresso da
 *    internet); in piu' 50 tentativi sbagliati in 15 minuti per la stessa email da tutti gli indirizzi
 *    insieme fermano quell'email per tutti (chi prova da tanti indirizzi);
 *  - da internet (l'ingresso, README "Internet entrance") conta anche
 *    l'indirizzo: 20 tentativi sbagliati in 15 minuti dallo stesso indirizzo,
 *    su qualunque email, = 15 minuti di attesa per quell'indirizzo (chi prova
 *    tante email con poche password). L'indirizzo e' quello che passa
 *    l'ingresso, mai quello che scrive chi chiama (provenienza.js);
 *  - dalla porta Google (porta.js, 31/10/2026) l'indirizzo vero non si sa:
 *    Apps Script non lo dice. Tutte le richieste da Google hanno l'indirizzo
 *    "google" e contano come da fuori: 10 sbagliati per la stessa email da
 *    Google fermano quell'email da Google (da casa si entra lo stesso), e 30
 *    sbagliati in 15 minuti da Google su qualunque email fermano per 15 minuti
 *    gli accessi nuovi da Google (chi e' gia' entrato continua a lavorare).
 */
'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Rifiuto, testo, adesso, adessoMs, istante, sha256, oggi } = require('../utili');
const { provenienza, pubblico } = require('../provenienza');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const LUNGHEZZA = 64;

const GIORNI_SESSIONE = 180;
const TENTATIVI_MASSIMI = 10;
const TENTATIVI_MASSIMI_INDIRIZZO = 20;
const TENTATIVI_MASSIMI_EMAIL_TUTTI = 50;
const TENTATIVI_MASSIMI_GOOGLE = 30;
const MINUTI_BLOCCO = 15;

async function hashPassword(password) {
  const sale = crypto.randomBytes(16);
  const h = await scrypt(String(password), sale, LUNGHEZZA, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sale.toString('base64'), h.toString('base64')].join('$');
}

function hashPasswordSync(password) {
  const sale = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(password), sale, LUNGHEZZA, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sale.toString('base64'), h.toString('base64')].join('$');
}

async function passwordGiusta(password, hash) {
  const p = String(hash || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return false;
  const atteso = Buffer.from(p[5], 'base64');
  const h = await scrypt(String(password), Buffer.from(p[4], 'base64'), atteso.length,
    { N: Number(p[1]), r: Number(p[2]), p: Number(p[3]) });
  return h.length === atteso.length && crypto.timingSafeEqual(h, atteso);
}

// Per un'email che non esiste si fa lo stesso lavoro che per una vera: dal tempo
// di risposta non si capisce quali email sono registrate.
let hashFinto = null;
function finto() {
  if (!hashFinto) hashFinto = hashPasswordSync(crypto.randomBytes(16).toString('hex'));
  return hashFinto;
}

function controllaPasswordNuova(p) {
  if (String(p || '').length < 8) throw new Rifiuto('La password deve avere almeno 8 caratteri');
  if (String(p).length > 200) throw new Rifiuto('La password è troppo lunga (al massimo 200 caratteri)');
}

/**
 * Una password iniziale da dettare a voce: 12 caratteri in tre gruppi
 * (ABCD-EFGH-JKMN), senza i caratteri che si confondono (0/O, 1/I/L). I
 * trattini fanno parte della password.
 */
const LEGGIBILI = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generaPassword() {
  let s = '';
  while (s.length < 12) {
    const b = crypto.randomBytes(1)[0];
    if (b < 248) s += LEGGIBILI[b % LEGGIBILI.length];   // 248 = 8 x 31: nessuna lettera piu' probabile delle altre
  }
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

/** L'esito da scrivere negli accessi, oltre al messaggio per chi chiama. */
function conEsito(err, esito) {
  err.esito = esito;
  return err;
}

function utentePubblico(u) {
  return { id: u.id, nome: u.nome, email: u.email, ruolo: u.ruolo };
}

module.exports = {
  /**
   * accedi {email, password, disp, dispNome, app} -> {token, utente, permessi}.
   * Asincrona: scrypt lavora fuori dal filo principale e il server intanto
   * risponde agli altri.
   */
  async accedi(d) {
    const email = testo(d.email).toLowerCase();
    const password = d.password === undefined || d.password === null ? '' : String(d.password);
    if (!email || !password) throw new Rifiuto('Scrivi email e password');

    const da = istante(new Date(adessoMs() - MINUTI_BLOCCO * 60000));
    const sbagliati = this.db.riga('SELECT COUNT(*) n FROM tentativi_accesso WHERE email = ? AND quando > ?', email, da).n;
    // L'indirizzo conta solo da internet e se e' un indirizzo di internet: in casa (o se l'ingresso passasse
    // l'indirizzo della rete Docker) un limite per indirizzo fermerebbe tutti insieme.
    const { ip, daFuori } = provenienza();
    // La porta Google conta come un indirizzo solo, "google", con una soglia piu' alta (ci passano tutti).
    const google = daFuori && ip === 'google';
    const perIndirizzo = daFuori && (pubblico(ip) || google);
    const sogliaIndirizzo = google ? TENTATIVI_MASSIMI_GOOGLE : TENTATIVI_MASSIMI_INDIRIZZO;
    const dallIndirizzo = perIndirizzo ? this.db.riga('SELECT COUNT(*) n FROM tentativi_accesso WHERE ip = ? AND quando > ?', ip, da).n : 0;
    // Per l'email contano i tentativi da questo stesso indirizzo (ip uguale; vuoto se l'indirizzo non si sa).
    const sbagliatiQui = this.db.riga('SELECT COUNT(*) n FROM tentativi_accesso WHERE email = ? AND ip = ? AND quando > ?', email, ip || '', da).n;
    const segna = () => this.db.esegui('INSERT INTO tentativi_accesso (email, quando, ip) VALUES (?, ?, ?)', email, adesso(), ip || '');
    // Prima di scrypt: chi e' fermo non fa lavorare il server.
    if (sbagliatiQui >= TENTATIVI_MASSIMI || sbagliati >= TENTATIVI_MASSIMI_EMAIL_TUTTI || dallIndirizzo >= sogliaIndirizzo) {
      // Anche il tentativo durante l'attesa conta: chi continua a provare resta fermo.
      segna();
      throw conEsito(new Rifiuto('Troppi tentativi: riprova fra ' + MINUTI_BLOCCO + ' minuti'), 'bloccato');
    }

    const u = this.db.riga('SELECT * FROM utenti WHERE email = ?', email);
    const giusta = await passwordGiusta(password, u ? u.password_hash : finto());
    if (!u || !giusta) {
      segna();
      if (sbagliatiQui + 1 === TENTATIVI_MASSIMI || sbagliati + 1 === TENTATIVI_MASSIMI_EMAIL_TUTTI) {
        this.annota('tentativi_accesso', email, null, { tentativi: TENTATIVI_MASSIMI },
          'accesso fermato per ' + MINUTI_BLOCCO + ' minuti: troppe password sbagliate');
      }
      if (perIndirizzo && dallIndirizzo + 1 === sogliaIndirizzo) {
        this.annota('tentativi_accesso', ip, null, { tentativi: sogliaIndirizzo }, google
          ? 'accessi nuovi attraverso Google fermati per ' + MINUTI_BLOCCO + ' minuti: troppe password sbagliate'
          : 'accesso da internet fermato per ' + MINUTI_BLOCCO + ' minuti all\'indirizzo ' + ip + ': troppe password sbagliate');
      }
      throw conEsito(new Rifiuto('Email o password sbagliate'), 'password sbagliata');
    }
    if (u.attivo !== 1) throw new Rifiuto('Il tuo accesso è stato disattivato: chiedi al titolare');

    this.db.esegui('DELETE FROM tentativi_accesso WHERE email = ?', email);
    const token = crypto.randomBytes(32).toString('base64url');
    const ora = adesso();
    const s = this.db.esegui(
      'INSERT INTO sessioni (token_hash, utente_id, disp, disp_nome, app, creata, ultimo_uso) VALUES (?,?,?,?,?,?,?)',
      sha256(token), u.id, testo(d.disp).slice(0, 64), testo(d.dispNome).slice(0, 80), testo(d.app).slice(0, 40), ora, ora);
    this.db.esegui('UPDATE utenti SET ultimo_accesso = ? WHERE id = ?', ora, u.id);
    return {
      ok: true, token, utente: utentePubblico(u), permessi: this.permessiDi(u.ruolo),
      sessione: Number(s.lastInsertRowid),
    };
  },

  /**
   * Dal token all'utente, o null se il token non c'e', e' stato revocato, e'
   * scaduto (180 giorni senza uso) o l'utente e' stato disattivato.
   */
  utenteDaToken(token) {
    if (!testo(token)) return null;
    const s = this.db.riga(
      'SELECT s.id AS sessione, s.ultimo_uso, s.revocata, s.disp AS s_disp, s.disp_nome AS s_disp_nome, s.app AS s_app, u.* FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.token_hash = ?',
      sha256(testo(token)));
    if (!s || s.revocata || s.attivo !== 1) return null;
    // Fase 6: l'accesso di una persona uscita si chiude dalla fine del suo ultimo giorno (anche se la notte non e' ancora passata).
    const p = this.db.riga("SELECT uscita_il FROM persone WHERE utente_id = ? AND uscita_il <> ''", s.id);
    if (p && p.uscita_il < oggi()) {
      this.applicaUscite();
      return null;
    }
    const ultimo = Date.parse(s.ultimo_uso);
    if (adessoMs() - ultimo > GIORNI_SESSIONE * 86400000) {
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE id = ?', adesso(), s.sessione);
      return null;
    }
    // L'ultimo uso si riscrive al massimo una volta al minuto: non serve di piu'.
    if (adessoMs() - ultimo > 60000) this.db.esegui('UPDATE sessioni SET ultimo_uso = ? WHERE id = ?', adesso(), s.sessione);
    return { utente: utentePubblico(s), sessione: s.sessione, disp: s.s_disp, dispNome: s.s_disp_nome, app: s.s_app };
  },

  esci() {
    const c = this.chi();
    if (c.sessione) this.db.esegui('UPDATE sessioni SET revocata = ? WHERE id = ? AND revocata IS NULL', adesso(), c.sessione);
    return { ok: true };
  },

  /** La propria password: serve quella vecchia. Gli altri dispositivi escono, questo resta. */
  async cambiaPassword(d) {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Il ponte non cambia password');
    const u = this.db.riga('SELECT * FROM utenti WHERE id = ?', c.utente.id);
    if (!(await passwordGiusta(String(d.vecchia || ''), u.password_hash))) throw new Rifiuto('La password attuale è sbagliata');
    controllaPasswordNuova(d.nuova);
    const hash = await hashPassword(d.nuova);
    this.db.transazione(() => {
      this.aggiorna('utenti', u.id, { password_hash: hash });
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE utente_id = ? AND id <> ? AND revocata IS NULL', adesso(), u.id, c.sessione || 0);
    });
    return { ok: true };
  },

  /** Chi sono, cosa posso fare, e quello che serve all'interfaccia. */
  io() {
    const c = this.chi();
    const imp = this.leggiImpostazioni();
    const t = this.titolare();
    const r = this.ioBase(c, imp, t);
    // Fase 6: l'esterno sa di quale collaboratore fa parte (la pillola "Esterno · ..." accanto al nome).
    if (this.eEsterno()) {
      const sog = this.mioSoggetto();
      r.interfaccia.esterno = { idSoggetto: sog, nome: sog ? (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', sog) || {}).nome || '' : '' };
    }
    return r;
  },

  ioBase(c, imp, t) {
    return {
      ok: true,
      utente: c.utente,
      permessi: c.permessi,
      titolare: t ? t.nome : '',
      ragioneSociale: testo(imp.RAGIONE_SOCIALE),
      interfaccia: {
        ticketAttivo: testo(imp.TICKET_ATTIVO).toUpperCase() === 'SI',
        // Il nome che compare come compilatore: per un collaboratore il suo (il server lo mette comunque).
        tecnico: this.soloSuoi() ? c.utente.nome : testo(imp.TECNICO),
        soloSuoi: this.soloSuoi(),
        versioneServer: this.versione,
        // Fase 3: il segmento "Da approvare", il pulsante "Segna rimborsato", le ore di una giornata normale.
        puoApprovare: this.puoApprovare('rapportini') || this.puoApprovare('spese'),
        puoSegnareRimborsi: this.puoSegnareRimborsi() && this.livello('spese') >= 2,
        approvazione: this.regolaApprovazione(),
        oreGiornaliere: Number(imp.ORE_GIORNALIERE) || 8,
        // Fase 5: il giallo "Approva" dei documenti, "Chiudi il ticket", i link per i clienti, la grandezza massima di un file.
        puoApprovareDocumenti: this.puoApprovareDocumenti() && this.livello('documenti') >= 2,
        puoChiudereTicket: this.puoChiudereTicket(),
        condivisioneCollegata: !!testo(imp.CONDIVISIONE_INDIRIZZO),
        fileMaxMb: Number(imp.FILE_MAX_MB) || 50,
        // Fase 6: la persona di chi entra, chi approva le assenze, chi vede i dati riservati, come si usa uno strumento scaduto.
        idPersona: this.miaPersonaId(),
        puoApprovareAssenze: this.puoApprovareAssenze(),
        vedeRiservati: this.livello('riservati') >= 1,
        taraturaBlocco: testo(imp.TARATURA_BLOCCO) === 'blocco' ? 'blocco' : 'avviso',
      },
    };
  },
};

Object.defineProperties(module.exports, {
  hashPassword: { value: hashPassword },
  hashPasswordSync: { value: hashPasswordSync },
  passwordGiusta: { value: passwordGiusta },
  controllaPasswordNuova: { value: controllaPasswordNuova },
  generaPassword: { value: generaPassword },
  utentePubblico: { value: utentePubblico },
});
