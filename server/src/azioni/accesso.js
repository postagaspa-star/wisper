/*
 * Entrare e uscire (accordo §3). Ognuno ha la sua email e la sua password,
 * al posto del codice unico di oggi.
 *
 *  - la password si tiene solo come scrypt col suo sale: chi legge il database
 *    non la ricava;
 *  - "accedi" da' un token (32 byte casuali) che il dispositivo conserva; nel
 *    database ne resta solo lo SHA-256. Vale finche' non si esce o non viene
 *    revocato, e scade dopo 180 giorni senza uso: un telefono resta collegato;
 *  - 10 tentativi sbagliati in 15 minuti per la stessa email = 15 minuti di
 *    attesa, anche con la password giusta: chi prova a indovinarla si ferma li'.
 */
'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Rifiuto, testo, adesso, istante, sha256 } = require('../utili');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const LUNGHEZZA = 64;

const GIORNI_SESSIONE = 180;
const TENTATIVI_MASSIMI = 10;
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

    const da = istante(new Date(Date.now() - MINUTI_BLOCCO * 60000));
    const sbagliati = this.db.riga('SELECT COUNT(*) n FROM tentativi_accesso WHERE email = ? AND quando > ?', email, da).n;
    if (sbagliati >= TENTATIVI_MASSIMI) {
      // Anche il tentativo durante l'attesa conta: chi continua a provare resta fermo.
      this.db.esegui('INSERT INTO tentativi_accesso (email, quando) VALUES (?, ?)', email, adesso());
      throw conEsito(new Rifiuto('Troppi tentativi: riprova fra ' + MINUTI_BLOCCO + ' minuti'), 'bloccato');
    }

    const u = this.db.riga('SELECT * FROM utenti WHERE email = ?', email);
    const giusta = await passwordGiusta(password, u ? u.password_hash : finto());
    if (!u || !giusta) {
      this.db.esegui('INSERT INTO tentativi_accesso (email, quando) VALUES (?, ?)', email, adesso());
      if (sbagliati + 1 === TENTATIVI_MASSIMI) {
        this.annota('tentativi_accesso', email, null, { tentativi: TENTATIVI_MASSIMI },
          'accesso fermato per ' + MINUTI_BLOCCO + ' minuti: troppe password sbagliate');
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
    const ultimo = Date.parse(s.ultimo_uso);
    if (Date.now() - ultimo > GIORNI_SESSIONE * 86400000) {
      this.db.esegui('UPDATE sessioni SET revocata = ? WHERE id = ?', adesso(), s.sessione);
      return null;
    }
    // L'ultimo uso si riscrive al massimo una volta al minuto: non serve di piu'.
    if (Date.now() - ultimo > 60000) this.db.esegui('UPDATE sessioni SET ultimo_uso = ? WHERE id = ?', adesso(), s.sessione);
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
