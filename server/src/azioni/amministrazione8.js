/*
 * Amministrazione e impostazioni completa (fase 8, fase8.md §9), solo quello che mancava: impostazioni generali con
 * tutte le chiavi, funzioni accese, notifiche, sicurezza (con la copia fuori casa cifrata, spenta di base), copie e
 * ripristino provato, stato del sistema, la lista di controllo e il cambio (§11).
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { Rifiuto, senzaPermesso, testo, adesso, adessoMs, oggi, dataOraIso, istante, numero, piuGiorni } = require('../utili');
const P = require('../permessi');
const G = require('../impostazioni-generali');
const K = require('../cifra');
const { passwordGiusta } = require('./accesso');

/**
 * Le funzioni e cosa cambia se si spengono (§9.5). Dal 03/11/2026 si spengono tutte (Manuel: "nessuna obbligatoria").
 * richiede: senza quelle funzioni questa non lavora (una commessa vuole un cliente, un progetto una commessa): spegnere
 * Clienti spegne anche Commesse e Progetti, accendere Progetti accende anche Commesse e Clienti.
 */
const FUNZIONI = [
  { modulo: 'dashboard', nome: 'Dashboard', richiede: [], cosaCambia: 'Sparisce dal menu di tutti: Wisper si apre sulla prima voce accesa. I dati restano.' },
  { modulo: 'clienti', nome: 'Clienti e fornitori', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; non si creano clienti nuovi. I dati restano.' },
  { modulo: 'commesse', nome: 'Commesse', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti; i rapportini non chiedono più la commessa. I dati restano.' },
  { modulo: 'progetti', nome: 'Progetti', richiede: ['commesse'], cosaCambia: 'Sparisce dal menu di tutti; i rapportini non chiedono più il progetto. I dati restano.' },
  { modulo: 'preventivi', nome: 'Preventivi', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
  { modulo: 'attivita', nome: 'Attività e calendario', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; niente promemoria delle attività. I dati restano.' },
  // 07/11/2026 (Manuel: "le Ore vanno tolte, non servono, metti solamente i Rapportini"): prima "Ore e rapportini".
  { modulo: 'rapportini', nome: 'Rapportini', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti; non si scrivono rapportini. I dati restano.' },
  { modulo: 'spese', nome: 'Spese e trasferte', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
  { modulo: 'fatturazione', nome: 'Fatturazione', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
  { modulo: 'banche', nome: 'Banche e scadenze', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. Segnare un incasso da una fattura funziona lo stesso. I dati restano.' },
  { modulo: 'persone', nome: 'Persone', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
  { modulo: 'documenti', nome: 'Documenti', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
  { modulo: 'ticket', nome: 'Ticket e assistenza', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
  { modulo: 'mezzi', nome: 'Mezzi e attrezzature', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. Nei rapportini non si scelgono più gli strumenti. I dati restano.' },
  { modulo: 'comunicazioni', nome: 'WhatsApp e comunicazioni', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti; niente proposte di messaggi. La campanella apre lo stesso le notifiche. I dati restano.' },
  { modulo: 'portale', nome: 'Portale clienti', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti e il portale si spegne subito per i clienti. I dati restano.' },
  { modulo: 'collaboratori', nome: 'Collaboratori esterni', richiede: ['commesse'], cosaCambia: 'Sparisce dal menu di tutti; gli esterni non vedono più le loro cose. I dati restano.' },
  { modulo: 'integrazioni', nome: 'Integrazioni', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; i collegamenti già fatti continuano a lavorare. I dati restano.' },
  { modulo: 'amministrazione', nome: 'Amministrazione', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; al titolare resta Funzioni, per riaccenderla. I dati restano.' },
];
const NOMI_MODULI = {};
for (const f of FUNZIONI) NOMI_MODULI[f.modulo] = f.nome;
const SPEGNIBILI = FUNZIONI.map(f => f.modulo);

/** Le funzioni che hanno bisogno di questa (anche passando da un'altra): si spengono con lei. */
function chiLaUsa(modulo) {
  const out = [];
  const giro = m => FUNZIONI.forEach(f => { if (f.richiede.indexOf(m) >= 0 && out.indexOf(f.modulo) < 0) { out.push(f.modulo); giro(f.modulo); } });
  giro(modulo);
  return SPEGNIBILI.filter(m => out.indexOf(m) >= 0);
}

/** Le funzioni di cui questa ha bisogno (anche passando da un'altra): si accendono con lei. */
function diCosaHaBisogno(modulo) {
  const out = [];
  const giro = m => { const f = FUNZIONI.find(x => x.modulo === m); (f ? f.richiede : []).forEach(r => { if (out.indexOf(r) < 0) { out.push(r); giro(r); } }); };
  giro(modulo);
  return SPEGNIBILI.filter(m => out.indexOf(m) >= 0);
}

/** I tipi di notifica per gruppo (§9.7). */
const GRUPPI_NOTIFICHE = [
  { nome: 'Lavoro', tipi: ['assegnato', 'da_mandare'] },
  { nome: 'Clienti e portale', tipi: ['richiesta_portale', 'messaggio_portale', 'file_portale', 'preventivo_accettato', 'preventivo_rifiutato', 'domanda', 'rapportino_firmato', 'segnalazione'] },
  { nome: 'Sistema', tipi: ['portale_irraggiungibile', 'integrazione_errore', 'copia_non_riuscita', 'ripristino_da_provare'] },
  { nome: 'Per te', tipi: ['esportazione_pronta', 'importazione_finita'] },
];

/**
 * I gruppi della lista di controllo col nome di oggi: nel database restano quelli scritti dalla migrazione 008 (i dati non
 * si riscrivono), a schermo arriva il nome nuovo. 07/11/2026: "06 Ore e rapportini" diventa "06 Rapportini" (Ore tolte).
 */
const GRUPPI_CONTROLLI_RINOMINATI = { '06 Ore e rapportini': '06 Rapportini' };

/** Le tabelle principali contate nella copia (§9.10). */
const TABELLE_CONTATE = ['rapportini', 'soggetti', 'commesse', 'preventivi', 'fatture', 'ore', 'spese', 'documenti', 'file', 'registro'];

function json(v, base) {
  try { return v ? JSON.parse(v) : base; } catch (e) { return base; }
}

const mascheraEmail = e => { const s = String(e || ''); const i = s.indexOf('@'); return i > 0 ? s.slice(0, i + 1) + '…' : s; };

module.exports = {
  // ------------------------------------------------------------------ funzioni accese (§9.5)

  /** Le funzioni spente (MODULI_SPENTI). */
  moduliSpenti() {
    // Una riga sola, letta a ogni richiesta (la usa permessiDi): niente memoria da tenere d'accordo col database.
    let r = null;
    try { r = this.db.riga("SELECT valore FROM impostazioni WHERE chiave = 'MODULI_SPENTI'"); } catch (e) { r = null; }
    const l = r ? json(r.valore, []) : [];
    return Array.isArray(l) ? l.filter(m => SPEGNIBILI.indexOf(m) >= 0) : [];
  },

  /**
   * funzioni {} (amministrazione 1, il titolare sempre). Per ognuna: richiede (le funzioni che si accendono con lei) e
   * serveA (quelle che si spengono con lei), cosi' il foglio di conferma dice tutto prima.
   */
  funzioni() {
    const spenti = new Set(this.moduliSpenti());
    const out = [];
    for (const m of P.MODULI) {
      const f = FUNZIONI.find(x => x.modulo === m);
      if (!f) continue;
      out.push({ modulo: m, nome: f.nome, accesa: !spenti.has(m), spegnibile: true, cosaCambia: f.cosaCambia, richiede: diCosaHaBisogno(m), serveA: chiLaUsa(m) });
    }
    return { ok: true, funzioni: out, accese: out.filter(x => x.accesa).length, totale: out.length };
  },

  /**
   * salvaFunzioni {modulo, accesa} (titolare). Spegnere una funzione spegne anche quelle che la usano; accenderla accende
   * anche quelle di cui ha bisogno. anche: le altre che sono cambiate. Spegnere il portale fa anche Spegni il portale adesso.
   */
  salvaFunzioni(d) {
    if (!this.eTitolare()) throw senzaPermesso('accendere e spegnere le funzioni (lo fa solo il titolare)');
    const modulo = testo(d.modulo);
    const f = FUNZIONI.find(x => x.modulo === modulo);
    if (!f) throw new Rifiuto('Funzione sconosciuta: ' + modulo);
    const accesa = d.accesa === true || d.accesa === 'true' || d.accesa === 1;
    const spenti = new Set(this.moduliSpenti());
    const prima = new Set(spenti);
    if (accesa) [modulo].concat(diCosaHaBisogno(modulo)).forEach(m => spenti.delete(m));
    else [modulo].concat(chiLaUsa(modulo)).forEach(m => spenti.add(m));
    const cambiate = SPEGNIBILI.filter(m => prima.has(m) !== spenti.has(m));
    if (!cambiate.length) return { ok: true, anche: [] };
    this.salvaImpostazioni({ MODULI_SPENTI: SPEGNIBILI.filter(m => spenti.has(m)) });
    for (const m of cambiate) {
      this.annota('impostazioni', 'MODULI_SPENTI', null, { modulo: m, accesa }, (accesa ? 'funzione accesa: ' : 'funzione spenta: ') + NOMI_MODULI[m] +
        (m === modulo ? '' : ' (con ' + f.nome + ')'));
    }
    // Spegnere la funzione e' gia' la conferma: il portale si spegne per tutti (sessioni chiuse, link annullati).
    if (!accesa && cambiate.indexOf('portale') >= 0 && this.impPortale().attivo) this.spegniPortale({ conferma: true });
    const anche = cambiate.filter(m => m !== modulo).map(m => ({ modulo: m, nome: NOMI_MODULI[m] }));
    return { ok: true, anche };
  },

  // ------------------------------------------------------------------ impostazioni generali (§9.4)

  /** impostazioniGenerali {} (amministrazione 1): le undici schede con etichette, unita', limiti e valori. */
  impostazioniGenerali() {
    const imp = this.leggiImpostazioni();
    const gruppi = G.GRUPPI.map(g => ({
      chiave: g.chiave, nome: g.nome, collegamenti: g.collegamenti || [], azioni: g.azioni || [],
      voci: g.voci.map(v => Object.assign({}, v, { valore: v.chiave === 'WISPER_ORA_COPIA' ? (this.oraCopia || process.env.WISPER_ORA_COPIA || '02:30') : (imp[v.chiave] === undefined ? '' : imp[v.chiave]) })),
    }));
    const quante = gruppi.reduce((t, g) => t + g.voci.length, 0);
    return { ok: true, gruppi, quante, altrove: G.ALTROVE, nascoste: Object.keys(G.NASCOSTE) };
  },

  /**
   * Le chiavi che hanno una pagina loro (CAMBIO, COPIA_CIFRATA) salvate da quella pagina: salvaImpostazioni le rifiuta
   * da Impostazioni generali, non da qui.
   */
  salvaDallaSuaPagina(valori) {
    this.dallaSuaPagina = true;
    try {
      return this.salvaImpostazioni(valori);
    } finally {
      this.dallaSuaPagina = false;
    }
  },

  /** I valori controllati coi limiti delle voci (salvaImpostazioni): un errore comincia col nome. */
  controllaImpostazioni(valori) {
    const out = {};
    for (const k of Object.keys(valori || {})) {
      const daPagina = this.chi().sistema || this.dallaSuaPagina;
      if (G.NASCOSTE[k] && k !== 'CONDIVISIONE_INDIRIZZO' && !daPagina) {
        if (k === 'CAMBIO') throw new Rifiuto('Il cambio si segna nella Lista di controllo');
      }
      if (k === 'MODULI_SPENTI' && !this.chi().sistema && !this.eTitolare()) throw senzaPermesso('accendere e spegnere le funzioni (lo fa solo il titolare)');
      if (k === 'COPIA_CIFRATA' && !daPagina) throw new Rifiuto('La cifratura della copia si accende e si spegne in Amministrazione › Sicurezza');
      if (k === 'CALENDARIO_PUBBLICO' && !this.chi().sistema) {
        if (this.livello('amministrazione') < 2) throw senzaPermesso('accendere il calendario fuori casa');
        const v = valori[k] === true || valori[k] === 'true';
        if (v && !this.calendarioPubblicoAcceso() && this.statoIntegrazione('portale').stato !== 'collegato') throw new Rifiuto('Il calendario fuori casa passa dallo script del portale: prima il portale deve essere Collegato');
      }
      try {
        out[k] = G.controllaValore(k, valori[k]);
      } catch (err) {
        throw new Rifiuto(err.message);
      }
      if (k === 'SPAZIO_MINIMO_MB' || k === 'SPAZIO_AVVISO_MB') {
        const imp = this.leggiImpostazioni();
        const minimo = k === 'SPAZIO_MINIMO_MB' ? out[k] : numero(valori.SPAZIO_MINIMO_MB !== undefined ? valori.SPAZIO_MINIMO_MB : imp.SPAZIO_MINIMO_MB);
        const avviso = k === 'SPAZIO_AVVISO_MB' ? out[k] : numero(valori.SPAZIO_AVVISO_MB !== undefined ? valori.SPAZIO_AVVISO_MB : imp.SPAZIO_AVVISO_MB);
        if (minimo > avviso) throw new Rifiuto('Ferma i caricamenti sotto: non può essere più dell\'avviso');
      }
    }
    return out;
  },

  // ------------------------------------------------------------------ notifiche (§9.7)

  /** I tipi che chi lavora puo' ricevere. */
  tipiNotificheMiei() {
    const c = this.chi();
    const ruolo = c.utente ? c.utente.ruolo : 'titolare';
    const sistema = ruolo === 'titolare' || (this.livello('amministrazione') >= 2 && ruolo !== 'lettura');
    return GRUPPI_NOTIFICHE.map(g => ({
      nome: g.nome,
      tipi: g.tipi.filter(t => {
        if (g.nome === 'Sistema') return sistema;
        if (g.nome === 'Clienti e portale') return t === 'messaggio_portale' || t === 'rapportino_firmato' || t === 'segnalazione' ? this.livello('ticket') >= 1 || this.livello('portale') >= 1 : this.livello('portale') >= 1;
        if (t === 'esportazione_pronta') return ruolo === 'titolare';
        if (t === 'importazione_finita') return this.livello('clienti') >= 2;
        if (t === 'da_mandare') return this.livello('comunicazioni') >= 1;
        return true;
      }),
    })).filter(g => g.tipi.length);
  },

  /** notifichePreferenze {}: le proprie. */
  notifichePreferenze() {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Le preferenze sono di una persona');
    const u = this.db.riga('SELECT notifiche_telefono, notifiche_silenzio, notifiche_tipi FROM utenti WHERE id = ?', c.utente.id);
    const scelti = json(u.notifiche_tipi, null) || {};
    const gruppi = this.tipiNotificheMiei();
    const tipi = {};
    gruppi.forEach(g => g.tipi.forEach(t => { tipi[t] = scelti[t] !== false; }));
    return { ok: true, telefono: u.notifiche_telefono !== 0, silenzioSera: u.notifiche_silenzio !== 0, tipi, gruppi };
  },

  /**
   * salvaNotifichePreferenze {telefono?, silenzioSera?, tipi?}: una notifica spenta non nasce per quella persona.
   * 06/11/2026 (le app salvano da sole, una parte per volta): una parte assente, null o vuota resta com'era; dei tipi
   * cambiano solo quelli scritti (un tipo null resta com'era).
   */
  salvaNotifichePreferenze(d) {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Le preferenze sono di una persona');
    const c_e = x => x !== undefined && x !== null && x !== '';
    const acceso = x => x === true || x === 'true' || x === 1 || x === '1';
    const v = {};
    if (c_e(d.telefono)) v.notifiche_telefono = acceso(d.telefono) ? 1 : 0;
    if (c_e(d.silenzioSera)) v.notifiche_silenzio = acceso(d.silenzioSera) ? 1 : 0;
    if (d.tipi && typeof d.tipi === 'object' && !Array.isArray(d.tipi)) {
      const possibili = new Set([].concat(...GRUPPI_NOTIFICHE.map(g => g.tipi)));
      const prima = json(this.db.riga('SELECT notifiche_tipi FROM utenti WHERE id = ?', c.utente.id).notifiche_tipi, null) || {};
      for (const k of Object.keys(d.tipi)) {
        if (!possibili.has(k)) throw new Rifiuto('Tipo di notifica sconosciuto: ' + k);
        if (!c_e(d.tipi[k])) continue;
        prima[k] = d.tipi[k] !== false && d.tipi[k] !== 'false' && d.tipi[k] !== 0 && d.tipi[k] !== '0';
      }
      v.notifiche_tipi = Object.values(prima).some(x => x === false) ? JSON.stringify(prima) : null;
    }
    if (Object.keys(v).length) this.db.esegui('UPDATE utenti SET ' + Object.keys(v).map(k => k + ' = @' + k).join(', ') + ' WHERE id = @id', Object.assign({ id: c.utente.id }, v));
    return { ok: true };
  },

  /** Quella persona riceve quel tipo? (notifica() lo chiede prima di scrivere). */
  vuoleNotifica(idUtente, tipo) {
    const r = this.db.riga('SELECT notifiche_tipi FROM utenti WHERE id = ?', idUtente);
    const t = json(r && r.notifiche_tipi, null);
    return !(t && t[tipo] === false);
  },

  /** Di sera (dalle 20 alle 7) e nei festivi niente avvisi sul telefono, per chi l'ha acceso (§9.7). */
  silenzioAdesso(idUtente) {
    const r = this.db.riga('SELECT notifiche_silenzio FROM utenti WHERE id = ?', idUtente || 0);
    if (!r || r.notifiche_silenzio === 0) return false;
    const ora = new Date(adessoMs());
    if (ora.getHours() >= 20 || ora.getHours() < 7) return true;
    const t = oggi();
    if (ora.getDay() === 0) return true;
    return require('../conti').festivi(Number(t.slice(0, 4)), this.leggiImpostazioni().FESTA_PATRONO).indexOf(t) >= 0;
  },

  /** provaAvvisi {} (amministrazione 2): un'email dal postino a chi riceve gli avvisi del server. */
  async provaAvvisi() {
    if (!this.postino || !this.postino.configurato()) throw new Rifiuto('Il postino non è collegato: le email non partono');
    const a = testo(this.leggiImpostazioni().EMAIL_AVVISI).split(/[,;\s]+/).filter(x => /@/.test(x));
    await this.postino.email({ alProprietario: true, nome: 'Wisper', oggetto: 'Prova degli avvisi di Wisper',
      messaggio: 'Questa è una prova: gli avvisi del server di Wisper (copia non riuscita, server che non risponde, portale) arrivano a questo indirizzo.' });
    this.db.transazione(() => this.annota('impostazioni', 'EMAIL_AVVISI', null, { prova: a.length }, 'prova degli avvisi mandata'));
    return { ok: true, a: ['il proprietario del foglio'].concat(a) };
  },

  // ------------------------------------------------------------------ sicurezza (§9.8)

  /** sicurezza {} (amministrazione 1): le schede verdi o rosse, i dispositivi, i feed, la durata delle sessioni. */
  sicurezza() {
    const imp = this.leggiImpostazioni();
    const interno = this.ultimaRichiestaInterna();
    const da30 = istante(new Date(adessoMs() - 30 * 86400000));
    const sbagliati = this.db.riga("SELECT COUNT(*) n FROM accessi WHERE quando >= ? AND esito IN ('password sbagliata', 'bloccato')", da30).n;
    const blocchi = this.db.righe("SELECT id_riga FROM registro WHERE tabella = 'tentativi_accesso' AND quando >= ? AND nota LIKE '%fermat%'", da30);
    const da60 = istante(new Date(adessoMs() - 60 * 86400000));
    const da90 = istante(new Date(adessoMs() - 90 * 86400000));
    const dispositiviFermi = this.db.righe('SELECT s.*, u.nome FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.revocata IS NULL AND s.ultimo_uso < ? ORDER BY s.ultimo_uso', da60)
      .map(s => ({ id: s.id, idUtente: s.utente_id, utente: s.nome, dispNome: s.disp_nome, app: s.app, ultimoUso: dataOraIso(s.ultimo_uso) }));
    const utentiFermi = this.db.righe("SELECT * FROM utenti WHERE attivo = 1 AND ((ultimo_accesso IS NOT NULL AND ultimo_accesso < ?) OR (ultimo_accesso IS NULL AND creato < ?)) ORDER BY nome", da90, da90)
      .map(u => ({ idUtente: u.id, nome: u.nome, ultimoAccesso: dataOraIso(u.ultimo_accesso) }));
    const passwordIniziali = this.db.righe('SELECT * FROM utenti WHERE attivo = 1 AND password_iniziale = 1 ORDER BY nome').map(u => ({ idUtente: u.id, nome: u.nome, dal: dataOraIso(u.password_il) }));
    const copiaCifrata = imp.COPIA_CIFRATA === true || imp.COPIA_CIFRATA === 'true';
    const problemi = [];
    if (interno) problemi.push(this.fraseInternetInterno(interno));
    if (passwordIniziali.length) problemi.push(passwordIniziali[0].nome + ' non ha ancora cambiato la password iniziale');
    if (dispositiviFermi.length) problemi.push(dispositiviFermi.length === 1 ? '1 dispositivo non si usa da più di 60 giorni' : dispositiviFermi.length + ' dispositivi non si usano da più di 60 giorni');
    if (utentiFermi.length) problemi.push(utentiFermi.length === 1 ? '1 utente non entra da 90 giorni' : utentiFermi.length + ' utenti non entrano da 90 giorni');
    const o = {
      ok: true,
      internetInterno: { ok: !interno, ultimo: interno ? dataOraIso(interno) : null, frase: interno ? this.fraseInternetInterno(interno) : 'Nessuna richiesta da internet sulla porta interna' },
      copiaCifrata,
      accessiSbagliati: { giorni: 30, quanti: sbagliati, blocchi: blocchi.length, chi: Array.from(new Set(blocchi.map(b => mascheraEmail(b.id_riga)))) },
      dispositiviFermi, utentiFermi, passwordIniziali,
      sessioneGiorni: numero(imp.SESSIONE_GIORNI) || 180,
      tuttoAPosto: !problemi.length, primaCosa: problemi[0] || 'Tutto a posto',
      dispositivi: this.livello('amministrazione') >= 2 ? this.leggiSessioni() : [],
    };
    if (this.livello('amministrazione') >= 2) o.feed = this.tuttiIFeed();
    return o;
  },

  /** scollegaTutti {password} (titolare): tutti escono, compreso chi chiede; le code dei telefoni restano. */
  async scollegaTutti(d) {
    const c = this.chi();
    if (!this.eTitolare() || !c.utente) throw senzaPermesso('scollegare tutti i dispositivi (lo fa solo il titolare)');
    const u = this.db.riga('SELECT * FROM utenti WHERE id = ?', c.utente.id);
    if (!(await passwordGiusta(String(d.password || ''), u.password_hash))) throw new Rifiuto('La password è sbagliata');
    const n = this.db.transazione(() => {
      const r = this.db.esegui('UPDATE sessioni SET revocata = ? WHERE revocata IS NULL', adesso());
      this.annota('sessioni', '', null, { scollegati: Number(r.changes) }, 'scollegati tutti i dispositivi');
      return Number(r.changes);
    });
    return { ok: true, scollegati: n };
  },

  /** accendiCifratura {} (titolare): la chiave nasce qui e si mostra SOLO in questa risposta. */
  accendiCifratura() {
    if (!this.eTitolare()) throw senzaPermesso('accendere la cifratura della copia (lo fa solo il titolare)');
    const imp = this.leggiImpostazioni();
    if ((imp.COPIA_CIFRATA === true || imp.COPIA_CIFRATA === 'true') && K.leggiChiave(this.dati)) throw new Rifiuto('La cifratura è già accesa: la chiave si vede solo quando si accende');
    // Una chiave che c'e' gia' (accesa e poi spenta) resta: apre le copie gia' cifrate.
    let chiave = K.leggiChiave(this.dati);
    const nuova = !chiave;
    if (nuova) {
      chiave = K.nuovaChiave();
      K.scriviChiave(this.dati, chiave);
    }
    this.salvaDallaSuaPagina({ COPIA_CIFRATA: true });
    this.annota('impostazioni', 'COPIA_CIFRATA', { valore: false }, { valore: true }, 'cifratura della copia accesa');
    // Sempre 8 gruppi di 4 (sul disco puo' stare coi trattini o senza): e' quella da scrivere su carta.
    return { ok: true, chiave: K.pulisciChiave(chiave).match(/.{4}/g).join('-'), nuova };
  },

  /** spegniCifratura {conferma} (titolare): le copie gia' cifrate restano cifrate (e la chiave resta sul NAS). */
  spegniCifratura(d) {
    if (!this.eTitolare()) throw senzaPermesso('spegnere la cifratura della copia (lo fa solo il titolare)');
    if (!(d.conferma === true || d.conferma === 'true')) throw new Rifiuto('Conferma: la copia fuori casa da stanotte si aprirà senza chiave', { conferma: true });
    this.salvaDallaSuaPagina({ COPIA_CIFRATA: false });
    this.annota('impostazioni', 'COPIA_CIFRATA', { valore: true }, { valore: false }, 'cifratura della copia spenta');
    return { ok: true };
  },

  /** La chiave della copia, solo per chi la cifra (copie.js) e mai in una risposta. */
  chiaveCopia() {
    return K.leggiChiave(this.dati);
  },

  // ------------------------------------------------------------------ copie e ripristino provato (§9.10)

  /** I conteggi delle tabelle principali (salvati nella riga della copia). */
  contaTabelle() {
    const o = {};
    for (const t of TABELLE_CONTATE) {
      try { o[t] = this.db.riga('SELECT COUNT(*) n FROM ' + t).n; } catch (e) { o[t] = null; }
    }
    return o;
  },

  /**
   * provaCopia {} (amministrazione 2) e la prova di ogni PROVA_COPIA_GIORNI giorni dopo la copia della notte:
   * l'ultima copia del NAS aperta in sola lettura in una cartella temporanea (integrity_check), le righe contate contro
   * quelle salvate al momento della copia, 20 file a caso con lo SHA-256, l'impronta della copia fuori casa chiesta al
   * postino. Una alla volta.
   */
  async provaCopia() {
    if (this.provaInCorso) throw new Rifiuto('Una prova è già in corso');
    this.provaInCorso = true;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prova-copia-'));
    try {
      const c = this.db.righe("SELECT * FROM copie WHERE locale = 'ok' ORDER BY id DESC").find(x => fs.existsSync(path.join(this.cartellaCopie, x.file)));
      const det = { integrita: '', conteggi: {}, file: { provati: 0, giusti: 0, sbagliati: [] }, fuori: { md5: 'non controllata' }, problemi: [] };
      if (!c) det.problemi.push('Nessuna copia sul NAS da provare');
      else {
        const copiaTmp = path.join(tmp, c.file);
        fs.copyFileSync(path.join(this.cartellaCopie, c.file), copiaTmp);
        let db = null;
        try {
          db = new DatabaseSync(copiaTmp, { readOnly: true });
          const r = db.prepare('PRAGMA integrity_check').get();
          det.integrita = r ? String(Object.values(r)[0]) : 'nessuna risposta';
          if (det.integrita !== 'ok') det.problemi.push('la copia è rovinata (' + det.integrita + ')');
          else {
            const salvati = json(c.conteggi, null);
            const ora = {};
            for (const t of TABELLE_CONTATE) { try { ora[t] = db.prepare('SELECT COUNT(*) n FROM ' + t).get().n; } catch (e) { ora[t] = null; } }
            for (const t of TABELLE_CONTATE) {
              det.conteggi[t] = [ora[t], salvati ? salvati[t] : null];
              if (salvati && salvati[t] !== undefined && salvati[t] !== ora[t]) det.problemi.push(t + ': ' + ora[t] + ' righe nella copia, ' + salvati[t] + ' al momento della copia');
            }
          }
        } catch (err) {
          det.integrita = 'non si apre';
          det.problemi.push('la copia non si apre (' + (err && err.message ? err.message : err) + ')');
        } finally {
          if (db) try { db.close(); } catch (e) { /* niente */ }
        }
        // 20 file a caso dal disco, contro lo SHA-256 della tabella file.
        const candidati = this.db.righe('SELECT id, percorso, sha256 FROM file WHERE percorso IS NOT NULL AND sha256 IS NOT NULL AND svuotato IS NULL');
        for (let i = candidati.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [candidati[i], candidati[j]] = [candidati[j], candidati[i]]; }
        for (const f of candidati) {
          if (det.file.provati >= 20) break;
          const p = this.percorsoFile(f.percorso);
          if (!fs.existsSync(p)) continue;
          det.file.provati++;
          const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
          if (h === f.sha256) det.file.giusti++;
          else det.file.sbagliati.push(f.id);
        }
        if (det.file.sbagliati.length) det.problemi.push(det.file.sbagliati.length === 1 ? 'un file non è più quello caricato' : det.file.sbagliati.length + ' file non sono più quelli caricati');
        // L'impronta della copia fuori casa: quella che dice Drive contro quella del file mandato.
        if (c.md5 && this.postino && this.postino.configurato() && /^ok/.test(c.fuori || '')) {
          try {
            const r = await this.postino.impronta({ cartella: 'database', nome: c.file + '.gz' + (c.cifrata ? '.cifrato' : '') });
            det.fuori.md5 = r && r.md5 === c.md5 ? 'giusto' : 'diverso';
            if (det.fuori.md5 === 'diverso') det.problemi.push('la copia fuori casa del ' + dataOraIso(c.quando).slice(8, 10) + '/' + dataOraIso(c.quando).slice(5, 7) + ' è diversa da quella mandata');
          } catch (err) {
            det.fuori.md5 = 'non controllata';
            det.fuori.errore = err && err.message ? err.message : String(err);
          }
        }
      }
      const esito = det.problemi.length ? 'errore' : 'ok';
      const id = this.db.transazione(() => {
        const nuovo = this.inserisci('copie_prove', { quando: adesso(), tipo: 'automatica', copia: c ? c.file : '', da: 'nas', esito, dettagli: JSON.stringify(det), con_chiave: 0, note: '' },
          'id', 'prova della copia: ' + (esito === 'ok' ? 'tutto torna' : 'non torna'));
        return nuovo;
      });
      if (esito === 'errore') {
        try { this.db.transazione(() => this.come(require('../wisper').SISTEMA, () => this.notifica(this.utentiAvvisiSistema(), 'copia_non_riuscita', 'La prova automatica della copia non è riuscita', det.problemi[0] || '', { pagina: 'amministrazione', filtro: { sezione: 'copie' } }))); } catch (e) { /* niente */ }
      }
      this.lavoro('Prova della copia', esito, esito === 'ok' ? 'tutto torna' : det.problemi[0]);
      return { ok: true, prova: this.provaDaRiga(this.db.riga('SELECT * FROM copie_prove WHERE id = ?', id)) };
    } finally {
      this.provaInCorso = false;
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* niente */ }
    }
  },

  provaDaRiga(p) {
    const det = json(p.dettagli, {});
    return {
      id: p.id, quando: dataOraIso(p.quando), tipo: p.tipo, copia: p.copia, da: p.da, esito: p.esito, conChiave: p.con_chiave === 1, note: p.note,
      integrita: det.integrita, conteggi: det.conteggi, file: det.file ? { provati: det.file.provati, giusti: det.file.giusti } : undefined, fuori: det.fuori,
      problemi: det.problemi || [], controlli: det.controlli,
    };
  },

  /** segnaRipristino {copia, da, conChiave, controlli: [5 vero/falso], note} (amministrazione 2): fatto da Andrea a mano. */
  segnaRipristino(d) {
    const copia = testo(d.copia).slice(0, 120);
    if (!copia) throw new Rifiuto('Quale copia: scegli quella che hai ripristinato');
    const da = testo(d.da) === 'drive' ? 'drive' : testo(d.da) === 'nas' ? 'nas' : '';
    if (!da) throw new Rifiuto('Da dove: da Drive o dal NAS');
    const controlli = Array.isArray(d.controlli) ? d.controlli.map(x => x === true || x === 'true') : [];
    if (controlli.length !== 5) throw new Rifiuto('I cinque controlli: spunta quelli che tornano');
    const conChiave = d.conChiave === true || d.conChiave === 'true';
    const esito = controlli.every(Boolean) ? 'ok' : 'errore';
    const c = this.chi();
    const id = this.inserisci('copie_prove', {
      quando: adesso(), tipo: 'a_mano', copia, da, esito, dettagli: JSON.stringify({ controlli }), utente_id: c.utente ? c.utente.id : null,
      con_chiave: conChiave ? 1 : 0, note: testo(d.note).slice(0, 500),
    }, 'id', 'ripristino provato a mano: ' + copia);
    return { ok: true, prova: this.provaDaRiga(this.db.riga('SELECT * FROM copie_prove WHERE id = ?', id)) };
  },

  /** Le ultime 12 prove e quando tocca la prossima automatica (per copie {}). */
  proveDelleCopie() {
    const prove = this.db.righe('SELECT * FROM copie_prove ORDER BY id DESC LIMIT 12').map(p => this.provaDaRiga(p));
    const ultima = this.db.riga("SELECT quando FROM copie_prove WHERE tipo = 'automatica' ORDER BY id DESC LIMIT 1");
    const ogni = numero(this.leggiImpostazioni().PROVA_COPIA_GIORNI) || 30;
    const prossimaProva = ultima ? piuGiorni(dataOraIso(ultima.quando).slice(0, 10), ogni) : oggi();
    return { prove, prossimaProva };
  },

  /** Dopo la copia della notte: la prova automatica, se sono passati PROVA_COPIA_GIORNI giorni dall'ultima. */
  async provaCopiaSeTocca() {
    const { prossimaProva } = this.proveDelleCopie();
    if (prossimaProva > oggi()) return null;
    return this.provaCopia();
  },

  // ------------------------------------------------------------------ stato del sistema (§9.11)

  /** Un lavoro della notte (o del giro): l'ultimo esito, per Stato del sistema. */
  lavoro(nome, esito, nota) {
    this.lavori = this.lavori || {};
    this.lavori[nome] = { nome, quando: adesso(), esito: esito || 'ok', nota: testo(nota) };
  },

  /** Il controllo d'integrita' del database: quick_check ogni notte, integrity_check una volta a settimana. */
  controllaDatabase() {
    const pieno = new Date(adessoMs()).getDay() === 0 || !this.controlloDb;
    const r = this.db.riga(pieno ? 'PRAGMA integrity_check' : 'PRAGMA quick_check');
    const esito = r ? String(Object.values(r)[0]) : 'nessuna risposta';
    this.controlloDb = { quando: adesso(), esito, tipo: pieno ? 'integrity_check' : 'quick_check' };
    this.lavoro('Controllo del database', esito === 'ok' ? 'ok' : 'errore', esito === 'ok' ? 'tutto a posto' : esito);
    return this.controlloDb;
  },

  /** statoSistema {oraDispositivo?} (amministrazione 1). */
  statoSistema(d) {
    d = d || {};
    const oraNas = new Date(adessoMs());
    const server = { versione: this.versione, acceso: dataOraIso(this.accesoIl), schema: this.db.versione(), node: process.versions.node, ora: dataOraIso(oraNas) };
    if (testo(d.oraDispositivo)) {
      const dev = Date.parse(testo(d.oraDispositivo));
      if (isFinite(dev)) {
        // L'ora vera del NAS (Date.now): l'orologio di prova sposta i giorni, non l'orologio del NAS.
        server.differenzaSecondi = Math.round((Date.now() - dev) / 1000);
        const min = Math.round(Math.abs(server.differenzaSecondi) / 60);
        if (Math.abs(server.differenzaSecondi) > 120) server.avvisoOra = 'L\'ora del NAS è ' + (server.differenzaSecondi < 0 ? 'indietro' : 'avanti') + ' di ' + min + ' minuti: i rapportini prendono l\'ora del NAS';
      }
    }
    let mb = null;
    try { if (!this.db.inMemoria) mb = Math.round(fs.statSync(this.percorsoDb).size / 1048576 * 10) / 10; } catch (e) { mb = null; }
    const c = this.controlloDb || null;
    const database = { mb, integrita: c ? c.esito : '', controllato: c ? dataOraIso(c.quando) : '', righe: this.contaTabelle() };
    let disco = {};
    try { disco = this.spazioDisco(); } catch (e) { disco = {}; }
    const collegati = [];
    const errori = [];
    for (const v of require('../integrazioni/elenco').ELENCO.filter(x => x.controllo)) {
      const s = this.statoIntegrazione(v.controllo);
      if (s.stato === 'collegato') collegati.push(v.nome);
      if (s.stato === 'errore') errori.push({ chiave: v.chiave, nome: v.nome, esito: s.esito });
    }
    const ultime = this.versioniUltime || this.versioniDaEsito() || { telefono: '', computer: '' };
    const da30 = istante(new Date(adessoMs() - 30 * 86400000));
    const indietro = new Set(this.dispositiviIndietro().map(x => x.nome));
    const dispositivi = this.db.righe('SELECT s.app, s.disp_nome, s.ultimo_uso, u.nome FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.revocata IS NULL AND s.ultimo_uso >= ? ORDER BY s.ultimo_uso DESC', da30)
      .map(s => { const nome = (s.disp_nome || 'Dispositivo') + (s.nome ? ' di ' + s.nome.split(' ')[0] : ''); return { nome, persona: s.nome, app: s.app, ultimoUso: dataOraIso(s.ultimo_uso), indietro: indietro.has(nome) }; });
    return {
      ok: true, server, database, disco, lavori: this.lavoriDellaNotte(),
      collegamenti: { collegati: collegati.length, nomi: collegati, errori },
      versioni: { ultime: { telefono: ultime.telefono || '', computer: ultime.computer || '' }, dispositivi },
    };
  },

  /** I lavori della notte: dalle tabelle quando si puo' (copie, prove, controlli), dalla memoria gli altri. */
  lavoriDellaNotte() {
    const out = [];
    const c = this.db.riga('SELECT * FROM copie ORDER BY id DESC LIMIT 1');
    const esito = s => (/^ok/.test(s || '') ? 'ok' : !s || /non collegato|non ancora/.test(s) ? 'fermo' : 'errore');
    if (c) {
      out.push({ nome: 'Copia', quando: dataOraIso(c.quando), esito: esito(c.locale), nota: c.locale });
      out.push({ nome: 'Copia fuori casa', quando: dataOraIso(c.quando), esito: esito(c.fuori), nota: c.fuori + (c.cifrata ? ' · cifrata' : '') });
      out.push({ nome: 'Foglio', quando: dataOraIso(c.quando), esito: esito(c.foglio), nota: c.foglio });
    } else out.push({ nome: 'Copia', quando: '', esito: 'fermo', nota: 'nessuna copia ancora' });
    const ic = this.db.riga('SELECT * FROM integrazioni_controlli ORDER BY id DESC LIMIT 1');
    if (ic) out.push({ nome: 'Controlli delle integrazioni', quando: dataOraIso(ic.quando), esito: ic.esito, nota: '' });
    for (const l of Object.values(this.lavori || {})) if (!out.some(x => x.nome === l.nome)) out.push(Object.assign({}, l, { quando: dataOraIso(l.quando) }));
    return out;
  },

  // ------------------------------------------------------------------ la lista di controllo (§11) e il cambio

  statoCambio() {
    let v = this.leggiImpostazioni().CAMBIO;
    if (typeof v === 'string') v = json(v, null);
    return v && typeof v === 'object' && v.stato ? v : { stato: 'prima' };
  },

  /** Le righe "dal server" (§11.2-§11.3): verdi o rosse da sole, coi dati veri. */
  righeDalServer() {
    const imp = this.leggiImpostazioni();
    const o = {};
    o['M08.2'] = { ok: this.regoleConfermate(), nota: this.regoleConfermate() ? 'Confermate' : 'Da confermare col commercialista' };
    const err = this.integrazioniInErrore();
    o['M17.1'] = { ok: !err.length, nota: err.length ? 'In errore: ' + err.map(x => x.v.nome).join(', ') : 'Nessun collegamento in errore' };
    const manca = [['PARTITA_IVA', 'partita IVA'], ['CODICE_FISCALE', 'codice fiscale'], ['INDIRIZZO', 'indirizzo'], ['ALBO_NUMERO', 'albo'], ['POLIZZA_NUMERO', 'polizza']]
      .filter(([k]) => !testo(imp[k])).map(x => x[1]);
    o['M18.1'] = { ok: !manca.length, nota: manca.length ? 'Manca: ' + manca.join(', ') : 'Completi' };
    const pul = this.lavori && (this.lavori['Pulizie'] || this.lavori['Pulizie del portale']);
    o.T10 = { ok: !!(pul && adessoMs() - Date.parse(pul.quando) < 26 * 3600000 && pul.esito === 'ok'), nota: pul ? 'Ultima: ' + dataOraIso(pul.quando) : 'Non ancora girate dall\'avvio' };
    const interno = this.ultimaRichiestaInterna();
    const cifrata = imp.COPIA_CIFRATA === true || imp.COPIA_CIFRATA === 'true';
    const vecchie = this.db.righe("SELECT nome, password_il FROM utenti WHERE attivo = 1 AND password_iniziale = 1 AND password_il <> '' AND password_il < ?", istante(new Date(adessoMs() - 7 * 86400000)));
    const t11 = [];
    if (interno) t11.push('una richiesta da internet sulla porta interna');
    if (!cifrata) t11.push('la copia fuori casa non è cifrata');
    if (vecchie.length) t11.push(vecchie[0].nome + ' ha la password iniziale da più di 7 giorni');
    o.T11 = { ok: !t11.length, nota: t11.length ? t11.join('; ') : 'Tutto a posto' };
    const indietro = this.dispositiviIndietro();
    const conosciute = !!(this.versioniUltime || this.versioniDaEsito());
    o.T12 = { ok: conosciute && !indietro.length, nota: !conosciute ? 'L\'ultima versione non si sa ancora (controllo Aggiornamenti)' : indietro.length ? indietro.length + ' dispositivi con una versione vecchia' : 'Tutti aggiornati' };
    const c = this.db.riga('SELECT * FROM copie ORDER BY id DESC LIMIT 1');
    const copiaOk = !!(c && adessoMs() - Date.parse(c.quando) < 26 * 3600000 && c.locale === 'ok' && /^ok/.test(c.fuori || '') && c.foglio === 'ok');
    const pa = this.db.riga("SELECT * FROM copie_prove WHERE tipo = 'automatica' ORDER BY id DESC LIMIT 1");
    const provaOk = !!(pa && pa.esito === 'ok' && adessoMs() - Date.parse(pa.quando) < 30 * 86400000);
    o.T13 = { ok: copiaOk && provaOk, nota: !copiaOk ? 'L\'ultima copia completa non è delle ultime 26 ore' : !provaOk ? 'Nessuna prova automatica riuscita negli ultimi 30 giorni' : 'Copia e prova a posto' };
    const pm = this.db.riga("SELECT * FROM copie_prove WHERE tipo = 'a_mano' AND esito = 'ok' ORDER BY id DESC LIMIT 1");
    const giorni = numero(imp.PROVA_RIPRISTINO_GIORNI) || 90;
    o.T14 = { ok: !!(pm && adessoMs() - Date.parse(pm.quando) < giorni * 86400000), nota: pm ? 'Ultimo: ' + dataOraIso(pm.quando).slice(0, 10) : 'Mai provato' };
    return o;
  },

  /** controlliFinali {} (amministrazione 1). */
  controlliFinali() {
    const server = this.righeDalServer();
    const nomi = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi[u.id] = u.nome; });
    const gruppi = [];
    const riassunto = { fatti: 0, totale: 0, nonVanno: 0, attesa: 0, daRifare: 0 };
    for (const r of this.db.righe('SELECT * FROM controlli_finali ORDER BY ordine')) {
      let stato = r.stato;
      let nota = r.nota;
      if (r.tipo === 'server') {
        const s = server[r.chiave] || { ok: false, nota: '' };
        stato = s.ok ? 'fatto' : 'non_va';
        nota = s.nota;
      } else if (r.tipo === 'automatica' && r.stato === 'fatto' && r.versione && r.versione !== this.versione) stato = 'da_rifare';
      // La M15.2 resta in attesa finche' il portale non e' acceso (§0.4).
      if (r.chiave === 'M15.2' && r.stato === 'attesa' && this.statoIntegrazione('portale').stato === 'collegato') stato = 'da_fare';
      const riga = { chiave: r.chiave, testo: r.testo, tipo: r.tipo, chi: r.chi, stato, il: r.il, utente: r.utente_id ? nomi[r.utente_id] || '' : '', versione: r.versione, nota, documento: r.documento_id };
      const nomeGruppo = GRUPPI_CONTROLLI_RINOMINATI[r.gruppo] || r.gruppo;
      let g = gruppi.find(x => x.nome === nomeGruppo);
      if (!g) { g = { nome: nomeGruppo, righe: [] }; gruppi.push(g); }
      g.righe.push(riga);
      riassunto.totale++;
      if (stato === 'fatto') riassunto.fatti++;
      if (stato === 'non_va') riassunto.nonVanno++;
      if (stato === 'attesa') riassunto.attesa++;
      if (stato === 'da_rifare') riassunto.daRifare++;
    }
    riassunto.completo = riassunto.fatti + riassunto.attesa === riassunto.totale;
    return { ok: true, riassunto, gruppi, cambio: this.statoCambio() };
  },

  /** segnaControllo {chiave, stato: fatto | non_va | da_fare, nota?, idDocumento?} (amministrazione 2; non sulle righe dal server). */
  segnaControllo(d) {
    const r = this.db.riga('SELECT * FROM controlli_finali WHERE chiave = ?', testo(d.chiave));
    if (!r) throw new Rifiuto('Controllo sconosciuto: ' + testo(d.chiave));
    if (r.tipo === 'server') throw new Rifiuto('Questa riga la controlla il server da solo');
    const stato = testo(d.stato);
    if (['fatto', 'non_va', 'da_fare'].indexOf(stato) < 0) throw new Rifiuto('Stato: Fatto, Non va o Da fare');
    const nota = testo(d.nota).slice(0, 500);
    if (stato === 'non_va' && !nota) throw new Rifiuto('Nota: scrivi cosa non va');
    let documento = r.documento_id;
    if (d.idDocumento !== undefined && testo(d.idDocumento)) {
      const doc = this.db.riga('SELECT * FROM documenti WHERE id = ?', Number(d.idDocumento) || 0);
      if (!doc || !this.vedeDocumento(doc)) throw new Rifiuto('Documento ' + testo(d.idDocumento) + ' non trovato');
      documento = doc.id;
    }
    const c = this.chi();
    this.aggiorna('controlli_finali', r.chiave, {
      stato, il: stato === 'da_fare' ? '' : oggi(), utente_id: stato === 'da_fare' ? null : (c.utente ? c.utente.id : null), versione: stato === 'da_fare' ? '' : this.versione,
      nota, documento_id: documento,
    }, 'chiave', 'controllo segnato: ' + r.chiave + ' ' + stato);
    const riga = this.controlliFinali().gruppi.reduce((x, g) => x || g.righe.find(y => y.chiave === r.chiave), null);
    return { ok: true, riga };
  },

  /** segnaCambio {stato: prima | prova | fatto | chiuso} (titolare): CAMBIO, con la data di ogni passo. */
  segnaCambio(d) {
    if (!this.eTitolare()) throw senzaPermesso('segnare il cambio (lo fa solo il titolare)');
    const stato = testo(d.stato);
    if (['prima', 'prova', 'fatto', 'chiuso'].indexOf(stato) < 0) throw new Rifiuto('Stato del cambio: prima, prova, fatto o chiuso');
    const c = Object.assign({}, this.statoCambio(), { stato });
    if (stato === 'prova') c.provaIl = adesso().slice(0, 16);
    if (stato === 'fatto') c.cambioIl = adesso().slice(0, 16);
    if (stato === 'chiuso') c.chiusoIl = adesso().slice(0, 16);
    this.salvaDallaSuaPagina({ CAMBIO: c });
    this.annota('impostazioni', 'CAMBIO', null, { stato }, 'cambio: ' + stato);
    return { ok: true, cambio: c };
  },
};

Object.defineProperties(module.exports, {
  FUNZIONI: { value: FUNZIONI },
  SPEGNIBILI: { value: SPEGNIBILI },
  NOMI_MODULI: { value: NOMI_MODULI },
  FUNZIONI: { value: FUNZIONI },
  GRUPPI_NOTIFICHE: { value: GRUPPI_NOTIFICHE },
  TABELLE_CONTATE: { value: TABELLE_CONTATE },
});
