/*
 * Il modulo Integrazioni (fase 8, fase8.md §4, letto con la §0.2): la pagina con lo stato VERO di ogni collegamento,
 * nato da controlli che il server fa davvero, e la storia dei controlli.
 *
 * Le parole dello stato (§4.1): collegato (l'ultimo controllo vero e' riuscito), da_configurare (manca un passo),
 * errore (gli ultimi DUE controlli di fila falliti: con uno solo resta Collegato, con "l'ultimo controllo non e'
 * riuscito"), non_collegato (deciso di no, §3.3), in_corso (un controllo gira adesso); in piu' "dipende" per quelli
 * che aspettano una scelta di Andrea (§3.4). Un collegamento nuovo parte Da configurare e diventa Collegato solo dopo
 * il primo controllo riuscito (§4.4).
 *
 * I controlli (§4.2): postino, vies, aggiornamenti, porta (la porta Google, §0.2), portale, calendariofile,
 * calendario, ricerca, copiafuori, internetinterno. Girano da soli (pianificaIntegrazioni, ogni minuto si guarda chi
 * tocca) e a richiesta con Prova adesso (al massimo una volta al minuto per collegamento). Ogni controllo scrive una
 * riga in integrazioni_controlli (tenute 90 giorni).
 *
 * In prova (--prova) niente va su internet: VIES e GitHub si controllano solo coi servizi finti (WISPER_VIES_URL,
 * WISPER_AGGIORNAMENTI_URL), altrimenti restano Da configurare con la frase che lo dice.
 *
 * Mai chiavi, segreti, indirizzi del foglio o del NAS nelle risposte o nel registro (§4.4).
 */
'use strict';

const { Rifiuto, testo, adesso, adessoMs, oggi, dataOraIso, istante, messaggio } = require('../utili');
const E = require('../integrazioni/elenco');
const { voceImpostazione, controllaValore } = require('../impostazioni-generali');

const AGGIORNAMENTI = 'https://github.com/postagaspa-star/wisper/releases/latest/download/aggiornamento.json';
const UN_MINUTO = 60000;
const GIORNI_CONTROLLI = 90;
/** internetinterno: dopo l'ultima richiesta da internet sulla porta interna, Errore per 7 giorni (§18). */
const GIORNI_INTERNET_INTERNO = 7;
const NOTA_INTERNET_INTERNO = 'richiesta da internet sulla porta interna';

/** Le chiavi di risposta ammesse per una riga (le prove le confrontano: nessun segreto, nessun indirizzo). */
const CAMPI_RIGA = ['chiave', 'numero', 'nome', 'cosa', 'gruppo', 'stato', 'controllato', 'millisecondi', 'esito', 'account', 'esce', 'costo', 'regole',
  'provaAdesso', 'perche', 'servirebbe', 'dipende', 'vecchio', 'ultimoNonRiuscito', 'conImpostazioni', 'segue'];

const quandoBreve = ist => {
  const s = dataOraIso(ist);
  if (!s) return '';
  const giorno = s.slice(0, 10);
  const ora = Number(s.slice(11, 13)) + ':' + s.slice(14, 16);
  if (giorno === oggi()) return 'oggi alle ' + ora;
  const ieri = new Date(adessoMs() - 86400000);
  if (giorno === dataOraIso(ieri).slice(0, 10)) return 'ieri alle ' + ora;
  return 'il ' + giorno.slice(8, 10) + '/' + giorno.slice(5, 7) + ' alle ' + ora;
};

module.exports = {
  // ------------------------------------------------------------------ lettura

  /** integrazioni {} (integrazioni 1): l'elenco di §3.1 con lo stato vero, e i numeri dei segmenti. */
  integrazioniElenco() {
    const righe = E.ELENCO.map(v => this.rigaIntegrazione(v));
    const numeri = { collegati: 0, daSistemare: 0, noncollegati: 0, errori: 0 };
    for (const r of righe) {
      if (r.stato === 'collegato') numeri.collegati++;
      if (r.stato === 'errore' || r.stato === 'da_configurare' || r.stato === 'dipende') numeri.daSistemare++;
      if (r.stato === 'non_collegato') numeri.noncollegati++;
      if (r.stato === 'errore') numeri.errori++;
    }
    // In cima (§4.3): la fascia del postino che non risponde da piu' di un'ora.
    const p = righe.find(r => r.chiave === 'postino');
    const fascia = p && p.stato === 'errore' ? this.frasePostinoFermo() : '';
    return { ok: true, integrazioni: righe, numeri, fascia, segmento: numeri.errori ? 'dasistemare' : 'tutti' };
  },

  /** integrazione {chiave} (integrazioni 1): la riga piu' gli ultimi 20 controlli e, per chi le ha, le impostazioni. */
  integrazioneUna(d) {
    const v = E.voce(testo(d.chiave));
    if (!v) throw new Rifiuto('Collegamento sconosciuto: ' + testo(d.chiave));
    const o = this.rigaIntegrazione(v);
    o.controlli = this.db.righe('SELECT * FROM integrazioni_controlli WHERE chiave = ? ORDER BY id DESC LIMIT 20', v.controllo || v.chiave)
      .map(c => ({ quando: dataOraIso(c.quando), esito: c.esito, millisecondi: c.millisecondi, testo: c.testo }));
    if (v.impostazioni) {
      const imp = this.leggiImpostazioni();
      o.impostazioni = v.impostazioni.map(k => Object.assign({}, voceImpostazione(k) || { chiave: k, etichetta: k, tipo: 'testo' }, { valore: imp[k] === undefined ? '' : imp[k] }));
      o.impostazioni.forEach(x => { delete x.gruppo; });
    }
    return { ok: true, integrazione: o };
  },

  /** Una riga dell'elenco, con lo stato di adesso. */
  rigaIntegrazione(v) {
    const puoProvare = this.livello('integrazioni') >= 2;
    const o = { chiave: v.chiave, numero: v.numero, nome: v.nome, cosa: v.cosa || '', gruppo: v.gruppo, costo: v.costo || '', regole: v.regole || '' };
    if (v.gruppo === 'noncollegati') {
      return Object.assign(o, { stato: 'non_collegato', perche: v.perche || '', servirebbe: v.servirebbe || '', provaAdesso: false });
    }
    if (v.gruppo === 'scelta') {
      // Il calendario fuori casa: costruito e spento; acceso da Andrea segue il portale (§0.3).
      if (v.chiave === 'calendariopubblico' && this.calendarioPubblicoAcceso()) {
        const p = this.statoIntegrazione('portale');
        return Object.assign(o, { stato: p.stato === 'collegato' ? 'collegato' : 'da_configurare', esito: p.stato === 'collegato' ? 'Acceso: passa dallo script del portale' : 'Acceso, ma il portale non è collegato',
          controllato: p.controllato, esce: v.esce || '', servirebbe: v.servirebbe || '', provaAdesso: false, segue: 'portale' });
      }
      return Object.assign(o, { stato: 'dipende', dipende: E.DIPENDE, esce: v.esce || '', servirebbe: v.servirebbe || '', provaAdesso: false });
    }
    if (v.segue) {
      // Link e ponte: niente controllo loro, seguono il portale e la porta (§0.1).
      const s = this.statoIntegrazione(v.segue);
      const esito = v.chiave === 'ponte' ? this.esitoPonte(s) : this.esitoLink(s);
      return Object.assign(o, { stato: esito.stato, esito: esito.frase, controllato: s.controllato, account: v.account || '', esce: v.esce || '', provaAdesso: false, segue: v.segue });
    }
    const s = this.statoIntegrazione(v.controllo);
    Object.assign(o, {
      stato: s.stato, controllato: s.controllato, millisecondi: s.millisecondi, esito: s.esito, account: s.account || v.account || '', esce: v.esce || '',
      provaAdesso: puoProvare, vecchio: s.vecchio, ultimoNonRiuscito: s.ultimoNonRiuscito, conImpostazioni: !!v.impostazioni,
    });
    return o;
  },

  /** Lo stato di un controllo dalla sua riga (con "in corso" e "da allora nessun controllo"). */
  statoIntegrazione(chiave) {
    const r = this.db.riga('SELECT * FROM integrazioni WHERE chiave = ?', chiave) || { stato: 'da_configurare', controllato_il: '', esito: '', errori_di_fila: 0 };
    const v = E.voce(chiave) || {};
    const inCorso = this.controlliInCorso && this.controlliInCorso.has(chiave);
    const frequenza = (v.frequenza || 60) * UN_MINUTO;
    const vecchio = !!r.controllato_il && adessoMs() - Date.parse(r.controllato_il) > 2 * frequenza;
    return {
      stato: inCorso ? 'in_corso' : r.stato, controllato: dataOraIso(r.controllato_il), millisecondi: r.millisecondi === undefined ? null : r.millisecondi,
      esito: r.esito || '', account: r.account || '', vecchio, ultimoNonRiuscito: r.stato === 'collegato' && r.errori_di_fila > 0, erroriDiFila: r.errori_di_fila || 0,
    };
  },

  esitoLink(s) {
    if (s.stato === 'collegato') {
      return this.impPortale().attivo ? { stato: 'collegato', frase: 'Segue il portale: i link si aprono' } : { stato: 'da_configurare', frase: 'Il portale è spento: i link non si aprono' };
    }
    return { stato: s.stato === 'errore' ? 'errore' : 'da_configurare', frase: 'Segue il portale: ' + (s.stato === 'errore' ? 'il portale non risponde' : 'il portale non è ancora collegato') };
  },

  esitoPonte(s) {
    if (s.stato !== 'collegato') return { stato: s.stato === 'errore' ? 'errore' : 'da_configurare', frase: 'Serve la porta Google accesa; si usa solo la sera del cambio (PONTE_PORTA = si nello script del foglio)' };
    const ultimo = this.db.riga("SELECT quando FROM accessi WHERE esito = 'ponte' ORDER BY id DESC LIMIT 1");
    if (ultimo && adessoMs() - Date.parse(ultimo.quando) < 7 * 86400000) return { stato: 'collegato', frase: 'Ultima richiesta di una versione vecchia: ' + quandoBreve(ultimo.quando) };
    return { stato: 'da_configurare', frase: 'Pronto: si accende la sera del cambio (PONTE_PORTA = si nello script del foglio)' };
  },

  frasePostinoFermo() {
    const r = this.db.riga("SELECT riuscito_il FROM integrazioni WHERE chiave = 'postino'");
    if (!r || !r.riuscito_il) return 'Il postino non risponde: le email e la copia di stanotte aspettano';
    const ore = Math.max(1, Math.floor((adessoMs() - Date.parse(r.riuscito_il)) / 3600000));
    return 'Il postino non risponde da ' + (ore === 1 ? 'un\'ora' : ore + ' ore') + ': le email e la copia di stanotte aspettano';
  },

  /** I collegamenti in Errore (per il numerino del menu e la Dashboard). */
  integrazioniInErrore() {
    return E.ELENCO.filter(v => v.controllo).map(v => ({ v, s: this.statoIntegrazione(v.controllo) })).filter(x => x.s.stato === 'errore');
  },

  // ------------------------------------------------------------------ scrittura

  /** provaIntegrazione {chiave} (integrazioni 2): Prova adesso, al massimo una volta al minuto per collegamento. */
  async provaIntegrazione(d) {
    const v = E.voce(testo(d.chiave));
    if (!v) throw new Rifiuto('Collegamento sconosciuto: ' + testo(d.chiave));
    if (v.gruppo === 'noncollegati' || v.gruppo === 'scelta' || !v.controllo) throw new Rifiuto('Non è collegato: non c\'è niente da provare');
    this.provatiAMano = this.provatiAMano || new Map();
    const prima = this.provatiAMano.get(v.controllo);
    if (prima && adessoMs() - prima < UN_MINUTO) throw new Rifiuto('Hai appena provato: riprova fra un minuto');
    this.provatiAMano.set(v.controllo, adessoMs());
    await this.controllaIntegrazione(v.controllo, { aMano: true });
    this.db.transazione(() => this.annota('integrazioni', v.controllo, null, { provato: this.statoIntegrazione(v.controllo).stato }, 'collegamento provato a mano'));
    return { ok: true, integrazione: this.rigaIntegrazione(v) };
  },

  /**
   * salvaIntegrazione {chiave, account?, impostazioni?} (integrazioni 2). Le impostazioni che toccano internet
   * (CALENDARIO_PUBBLICO e quelle del portale) vogliono anche amministrazione 2; CALENDARIO_PUBBLICO si accende solo
   * col portale Collegato (§0.3).
   */
  salvaIntegrazione(d) {
    const v = E.voce(testo(d.chiave));
    if (!v) throw new Rifiuto('Collegamento sconosciuto: ' + testo(d.chiave));
    if (d.account !== undefined) {
      if (!v.controllo) throw new Rifiuto('Questo collegamento non ha un account da scrivere');
      const account = testo(d.account).slice(0, 80);
      if (/https?:\/\/|script\.google|[A-Za-z0-9_-]{40,}/.test(account)) throw new Rifiuto('Account: scrivi solo il nome (per esempio "il Gmail del foglio di Wisper"), mai indirizzi o chiavi');
      this.aggiorna('integrazioni', v.controllo, { account, modificato: adesso() }, 'chiave', 'impostazioni del collegamento cambiate');
    }
    if (d.impostazioni && typeof d.impostazioni === 'object') {
      const valori = {};
      for (const k of Object.keys(d.impostazioni)) {
        if (!(v.impostazioni || []).includes(k)) throw new Rifiuto('Impostazione non di questo collegamento: ' + k);
        if ((k === 'CALENDARIO_PUBBLICO' || /^PORTALE_/.test(k)) && this.livello('amministrazione') < 2) {
          throw new Rifiuto('Le impostazioni che toccano internet le cambia chi ha Amministrazione: Modifica', { permesso: false });
        }
        try {
          valori[k] = controllaValore(k, d.impostazioni[k]);
        } catch (err) {
          throw new Rifiuto(err.message);
        }
      }
      if (valori.CALENDARIO_PUBBLICO === true && !this.calendarioPubblicoAcceso() && this.statoIntegrazione('portale').stato !== 'collegato') {
        throw new Rifiuto('Il calendario fuori casa passa dallo script del portale: prima il portale deve essere Collegato');
      }
      const prima = this.leggiImpostazioni();
      this.salvaImpostazioni(valori);
      if (Object.keys(valori).some(k => JSON.stringify(prima[k]) !== JSON.stringify(valori[k]))) {
        this.annota('integrazioni', v.chiave, null, { impostazioni: Object.keys(valori) }, 'impostazioni del collegamento cambiate');
      }
    }
    return { ok: true, integrazione: this.integrazioneUna({ chiave: v.chiave }).integrazione };
  },

  // ------------------------------------------------------------------ i controlli

  /**
   * Fa il controllo e scrive com'e' andato (stato, riga di integrazioni_controlli). Non lancia mai: un controllo che si
   * rompe e' un controllo fallito. Torna lo stato nuovo.
   */
  async controllaIntegrazione(chiave, opzioni) {
    opzioni = opzioni || {};
    this.controlliInCorso = this.controlliInCorso || new Set();
    if (this.controlliInCorso.has(chiave)) return this.statoIntegrazione(chiave);
    this.controlliInCorso.add(chiave);
    const inizio = Date.now();
    let r;
    try {
      const fn = CONTROLLI[chiave];
      if (!fn) throw new Error('controllo sconosciuto: ' + chiave);
      r = await fn.call(this, opzioni);
    } catch (err) {
      r = { ok: false, esito: messaggio(err) };
    } finally {
      this.controlliInCorso.delete(chiave);
    }
    const ms = Date.now() - inizio;
    this.db.transazione(() => this.scriviControllo(chiave, r, ms));
    return this.statoIntegrazione(chiave);
  },

  /** Scrive l'esito di un controllo: la regola dei due errori di fila (§4.1), la notifica quando diventa Errore. */
  scriviControllo(chiave, r, ms) {
    const ora = adesso();
    if (!this.db.riga('SELECT chiave FROM integrazioni WHERE chiave = ?', chiave)) {
      this.db.esegui("INSERT INTO integrazioni (chiave, stato, modificato) VALUES (?, 'da_configurare', ?)", chiave, ora);
    }
    const prima = this.db.riga('SELECT * FROM integrazioni WHERE chiave = ?', chiave);
    const esito = testo(r.esito).slice(0, 300);
    if (r.daConfigurare) {
      // Manca un passo: non e' un controllo fallito, e non si conta.
      this.db.esegui("UPDATE integrazioni SET stato = 'da_configurare', controllato_il = ?, esito = ?, millisecondi = ?, errori_di_fila = 0, modificato = ? WHERE chiave = ?",
        ora, testo(r.daConfigurare).slice(0, 300), ms, ora, chiave);
      return;
    }
    let stato;
    let errori = 0;
    let riuscito = prima.riuscito_il || '';
    if (r.ok) {
      stato = 'collegato';
      riuscito = ora;
    } else {
      errori = (prima.errori_di_fila || 0) + 1;
      stato = r.forzaErrore || errori >= 2 ? 'errore' : (riuscito ? 'collegato' : 'da_configurare');
    }
    this.db.esegui('UPDATE integrazioni SET stato = ?, controllato_il = ?, esito = ?, millisecondi = ?, errori_di_fila = ?, riuscito_il = ?, modificato = ? WHERE chiave = ?',
      stato, ora, esito, ms, errori, riuscito, ora, chiave);
    this.db.esegui('INSERT INTO integrazioni_controlli (chiave, quando, esito, millisecondi, testo) VALUES (?, ?, ?, ?, ?)', chiave, ora, r.ok ? 'ok' : 'errore', ms, esito);
    if (stato === 'errore' && prima.stato !== 'errore') {
      const v = E.voce(chiave) || { nome: chiave };
      try {
        this.come(require('../wisper').SISTEMA, () => this.notifica(this.utentiAvvisiSistema(), 'integrazione_errore', 'Errore: ' + v.nome, esito,
          chiave === 'internetinterno' ? { pagina: 'amministrazione', filtro: { sezione: 'sicurezza' } } : { pagina: 'integrazione', id: chiave }));
      } catch (e) { /* la notifica non ferma il controllo */ }
    }
  },

  /** Chi riceve gli avvisi del sistema: il titolare e chi ha amministrazione 2 (§8.5). */
  utentiAvvisiSistema() {
    return this.db.righe("SELECT id, ruolo FROM utenti WHERE attivo = 1 AND ruolo <> 'esterno'")
      .filter(u => u.ruolo === 'titolare' || (this.permessiDi(u.ruolo).amministrazione || 0) >= 2).map(u => u.id);
  },

  /**
   * Il giro dei controlli (ogni minuto, da pianificaIntegrazioni): quelli che toccano. VIES alle 6:00, una volta al
   * giorno; aggiornamenti e il file del calendario una volta al giorno; la copia fuori casa a ogni copia (copie.js) e una
   * volta al giorno; gli altri secondo la loro frequenza. Poi la pulizia dei controlli oltre 90 giorni.
   */
  async giroIntegrazioni() {
    const ora = new Date(adessoMs());
    for (const chiave of Object.keys(CONTROLLI)) {
      const r = this.db.riga('SELECT controllato_il FROM integrazioni WHERE chiave = ?', chiave);
      const ultimo = r && r.controllato_il ? Date.parse(r.controllato_il) : 0;
      const v = E.voce(chiave) || {};
      let tocca;
      if (chiave === 'vies') tocca = !ultimo || (dataOraIso(new Date(ultimo)).slice(0, 10) < oggi() && ora.getHours() >= 6);
      else tocca = !ultimo || adessoMs() - ultimo >= (v.frequenza || 60) * UN_MINUTO;
      if (tocca) await this.controllaIntegrazione(chiave);
    }
    if (this.ultimaPuliziaControlli !== oggi()) {
      this.ultimaPuliziaControlli = oggi();
      this.db.esegui('DELETE FROM integrazioni_controlli WHERE quando < ?', istante(new Date(adessoMs() - GIORNI_CONTROLLI * 86400000)));
    }
  },

  /** Accende il giro dei controlli: il primo pochi secondi dopo l'avvio, poi ogni minuto. */
  pianificaIntegrazioni(primoMs) {
    const giro = () => this.giroIntegrazioni().catch(err => console.error('[integrazioni] ' + messaggio(err)));
    this.primoGiroIntegrazioni = setTimeout(giro, primoMs === undefined ? 5000 : primoMs);
    if (this.primoGiroIntegrazioni.unref) this.primoGiroIntegrazioni.unref();
    this.giroIntegrazioniTimer = setInterval(giro, UN_MINUTO);
    if (this.giroIntegrazioniTimer.unref) this.giroIntegrazioniTimer.unref();
  },

  // ------------------------------------------------------------------ il server interno su internet (§0.2)

  /**
   * Una richiesta che non doveva arrivare: sulla 8400 con Tailscale-Funnel-Request o X-Forwarded-For, o una qualunque
   * sull'ingresso interno 8402 (wisper-ingresso, che con la porta Google resta spento). Errore subito (non aspetta il
   * secondo controllo: e' una cosa di sicurezza), una riga nel registro (al massimo ogni 10 minuti), la voce urgente
   * della Dashboard e la notifica.
   */
  segnalaInternetInterno(dove) {
    const ora = adessoMs();
    this.ultimoInternetInterno = { quando: adesso(), dove };
    if (this.ultimaSegnalazioneInterno && ora - this.ultimaSegnalazioneInterno < 10 * UN_MINUTO) return;
    this.ultimaSegnalazioneInterno = ora;
    try {
      this.come(require('../wisper').SISTEMA, () => this.db.transazione(() => {
        this.annota('integrazioni', 'internetinterno', null, { porta: dove }, NOTA_INTERNET_INTERNO);
        this.scriviControllo('internetinterno', { ok: false, forzaErrore: true, esito: this.fraseInternetInterno(adesso()) }, 0);
      }));
    } catch (err) {
      console.error('[integrazioni] internetinterno: ' + messaggio(err));
    }
  },

  /** L'ultima richiesta da internet sulla porta interna negli ultimi 7 giorni (dal registro), o null. */
  ultimaRichiestaInterna() {
    const da = istante(new Date(adessoMs() - GIORNI_INTERNET_INTERNO * 86400000));
    const r = this.db.riga("SELECT quando FROM registro WHERE tabella = 'integrazioni' AND id_riga = 'internetinterno' AND nota = ? AND quando >= ? ORDER BY id DESC LIMIT 1",
      NOTA_INTERNET_INTERNO, da);
    return r ? r.quando : null;
  },

  fraseInternetInterno(quando) {
    const s = dataOraIso(quando);
    return 'Una richiesta è arrivata da internet sull\'ingresso del NAS il ' + s.slice(8, 10) + '/' + s.slice(5, 7) + ' alle ' + Number(s.slice(11, 13)) + ':' + s.slice(14, 16) +
      ': con la porta Google l\'ingresso va spento';
  },

  /** La sessione arrivata dalla porta Google (§0.2): sessioni.da_fuori, al massimo una volta al minuto. */
  segnaDaFuori(idSessione) {
    if (!idSessione) return;
    this.daFuoriVisti = this.daFuoriVisti || new Map();
    const prima = this.daFuoriVisti.get(idSessione);
    if (prima && adessoMs() - prima < UN_MINUTO) return;
    this.daFuoriVisti.set(idSessione, adessoMs());
    try { this.db.esegui('UPDATE sessioni SET da_fuori = ? WHERE id = ?', adesso(), idSessione); } catch (e) { /* non ferma la risposta */ }
  },

  calendarioPubblicoAcceso() {
    const v = this.leggiImpostazioni().CALENDARIO_PUBBLICO;
    return v === true || v === 'true';
  },
};

/** I controlli veri (§4.2): ognuno torna {ok, esito} o {daConfigurare: frase} (o {ok: false, forzaErrore}). */
const CONTROLLI = {
  async postino() {
    if (!this.postino || !this.postino.configurato()) return { daConfigurare: 'Mancano WISPER_POSTINO_URL o il segreto nel .env del NAS' };
    const r = await this.postino.prova();
    const rimaste = r && r.rimaste !== undefined ? Number(r.rimaste) : null;
    return { ok: true, esito: 'Risponde' + (rimaste !== null && isFinite(rimaste) ? ' · Google lascia mandare ancora ' + rimaste + ' email oggi' : '') };
  },

  async vies() {
    const piva = testo(this.leggiImpostazioni().PARTITA_IVA);
    if (!piva) return { daConfigurare: 'Manca la partita IVA dello studio (Dati dello studio)' };
    if (this.prova && !process.env.WISPER_VIES_URL) return { daConfigurare: 'In prova si controlla solo col servizio finto (WISPER_VIES_URL)' };
    let r;
    try {
      r = await this.controllaPartitaIva({ partitaIva: piva });
    } catch (err) {
      return { ok: false, esito: messaggio(err) };
    }
    if (r && r.valida === true) return { ok: true, esito: 'Risponde · la partita IVA dello studio risulta valida' };
    return { ok: false, esito: r && r.errore ? r.errore : 'Il servizio risponde, ma la partita IVA dello studio risulta non valida' };
  },

  async aggiornamenti() {
    const url = process.env.WISPER_AGGIORNAMENTI_URL || (this.prova ? '' : AGGIORNAMENTI);
    if (!url) return { daConfigurare: 'In prova si controlla solo con un elenco finto (WISPER_AGGIORNAMENTI_URL)' };
    let j;
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { ok: false, esito: 'GitHub ha risposto ' + r.status };
      j = await r.json();
    } catch (err) {
      return { ok: false, esito: 'GitHub non risponde (' + (err && err.name === 'TimeoutError' ? 'tempo scaduto' : messaggio(err)) + ')' };
    }
    let m;
    try { m = JSON.parse(j.manifesto); } catch (e) { return { ok: false, esito: 'L\'elenco delle versioni non si legge' }; }
    const telefono = m.android && m.android.nome ? String(m.android.nome) : '';
    const computer = m.computer && m.computer.versione ? String(m.computer.versione) : '';
    if (!telefono && !computer) return { ok: false, esito: 'L\'elenco delle versioni è vuoto' };
    this.versioniUltime = { telefono, computer, quando: adesso() };
    return { ok: true, esito: 'Ultima versione: ' + [telefono ? 'telefono ' + telefono : '', computer ? 'computer ' + computer : ''].filter(Boolean).join(', ') };
  },

  async porta() {
    const p = this.porta;
    if (!p || !p.configurata()) return { daConfigurare: 'Mancano WISPER_POSTINO_URL o SEGRETO_SERVER nel .env del NAS' };
    if (p.spenta) return { daConfigurare: 'Spenta nel .env del NAS (WISPER_PORTA_GOOGLE=no)' };
    if ((p.erroriDiFila || 0) >= 2) return { ok: false, forzaErrore: true, esito: 'Lo script del foglio non risponde: ' + (p.erroriDiFila) + ' giri di fila falliti' };
    if (p.ultimoContatto && Date.now() - p.ultimoContatto < 10 * UN_MINUTO) {
      const a = this.db.riga("SELECT a.quando, a.disp_nome, u.nome FROM accessi a LEFT JOIN utenti u ON u.id = a.utente_id WHERE a.ip = 'google' AND a.utente_id IS NOT NULL ORDER BY a.id DESC LIMIT 1");
      return { ok: true, esito: a ? 'Ultimo accesso da fuori casa: ' + quandoBreve(a.quando) + ', ' + [a.disp_nome, a.nome].filter(x => x && x !== 'senza nome').join(' di ') : 'Lo script del foglio risponde; nessun accesso da fuori casa ancora' };
    }
    return { ok: false, esito: p.ultimoContatto ? 'Nessun giro riuscito negli ultimi 10 minuti' : 'Il collegamento a Google non è ancora partito' };
  },

  async portale(opzioni) {
    const g = this.portaPortale;
    if (!(g && g.configurata && g.configurata()) && !(this.prova && this.portaleLocale)) return { daConfigurare: 'Mancano WISPER_PORTALE_URL e SEGRETO_PORTALE nel .env del NAS' };
    const p = this.impPortale();
    if (!p.indirizzo) return { daConfigurare: 'Manca l\'indirizzo della pagina del portale (PORTALE_INDIRIZZO)' };
    const c = this.controlloPortale;
    // Il controllo di ogni ora del portale (fase 7, giroPortale): se e' fresco si usa quello, Prova adesso lo rifa'.
    const fresco = c && c.quando && adessoMs() - Date.parse(c.quando) < 65 * UN_MINUTO;
    const r = opzioni && opzioni.aMano || !fresco ? await this.controllaPortale() : { collegato: (c.falliti || 0) === 0 ? 'si' : 'no' };
    if (r.collegato === 'si') return { ok: true, esito: 'Risponde · la pagina del portale si apre' + (p.attivo ? '' : ' (il portale è spento)') };
    return { ok: false, esito: 'Il portale non si raggiunge da fuori' };
  },

  async calendariofile() {
    // Il file si fa sul NAS: si prova a farne uno vuoto e a rileggerlo (righe, CRLF).
    const { creaIcs, controllaIcs } = require('../calendario');
    const ics = creaIcs({ nome: 'Prova', eventi: [], ora: new Date(adessoMs()) });
    const problemi = controllaIcs(ics);
    return problemi.length ? { ok: false, esito: 'Il file non è valido: ' + problemi[0] } : { ok: true, esito: 'Il file si fa sul NAS: niente esce' };
  },

  async calendario() {
    const feed = this.db.righe("SELECT * FROM calendario_feed WHERE revocato_il = ''");
    if (!feed.length) return { ok: true, esito: 'Si scarica il file; nessun abbonamento' };
    const letti = feed.filter(f => f.ultimo_uso).sort((a, b) => (a.ultimo_uso < b.ultimo_uso ? 1 : -1));
    if (!letti.length) return { ok: true, esito: feed.length === 1 ? '1 indirizzo, mai letto' : feed.length + ' indirizzi, mai letti' };
    const f = letti[0];
    return { ok: true, esito: 'Ultima lettura: ' + quandoBreve(f.ultimo_uso) + (f.agente ? ' · ' + f.agente.split('/')[0] : '') + ' · ' + (feed.length === 1 ? '1 indirizzo' : feed.length + ' indirizzi') };
  },

  async ricerca() {
    if (!this.fts5Attivo()) return { ok: false, forzaErrore: true, esito: 'Il database del NAS non sa cercare dentro i file: la ricerca resta sui titoli' };
    if (!this.ricercaFileAccesa()) return { daConfigurare: 'Spenta: la ricerca resta sui titoli' };
    return { ok: true, esito: this.fraseLetture() };
  },

  async copiafuori() {
    if (!this.postino || !this.postino.configurato()) return { daConfigurare: 'Il postino non è collegato: la copia resta solo sul NAS' };
    const c = this.db.riga('SELECT * FROM copie ORDER BY id DESC LIMIT 1');
    if (!c) return { daConfigurare: 'Nessuna copia ancora: la prima stanotte' };
    const ok = /^ok/.test(c.fuori || '') && adessoMs() - Date.parse(c.quando) < 50 * 3600000;
    if (ok) return { ok: true, esito: 'Copia del ' + quandoBreve(c.quando) + ' su Drive' + (c.cifrata ? ' · cifrata' : '') };
    if (/^ok/.test(c.fuori || '')) return { ok: false, esito: 'L\'ultima copia fuori casa è di più di 50 ore fa' };
    return { ok: false, esito: 'La copia fuori casa non è riuscita: ' + (c.fuori || 'senza motivo') };
  },

  async internetinterno() {
    const quando = this.ultimaRichiestaInterna();
    if (quando) return { ok: false, forzaErrore: true, esito: this.fraseInternetInterno(quando) };
    return { ok: true, esito: 'Nessuna richiesta da internet sulla porta interna' };
  },
};

Object.defineProperties(module.exports, {
  CONTROLLI_INTEGRAZIONI: { value: CONTROLLI },
  CAMPI_RIGA_INTEGRAZIONE: { value: CAMPI_RIGA },
  NOTA_INTERNET_INTERNO: { value: NOTA_INTERNET_INTERNO },
});
