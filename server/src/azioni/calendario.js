/*
 * Il calendario in altre app (fase 8, fase8.md §5 con la §0.3): il file da scaricare (esportaCalendario) e gli
 * indirizzi d'abbonamento (calendario_feed), letti in casa da GET /calendario/<chiave>.ics sulla 8400 e, solo se
 * Andrea l'accende, anche fuori casa dallo script del portale (CALENDARIO_PUBBLICO, feed "pubblico", spento di base).
 *
 * Cosa c'e' dentro (§5.2): le mie attivita', appuntamenti, sopralluoghi e interventi (o quelli di tutto lo studio, con
 * attivita 2 e non collaboratore, col nome tra parentesi), e a scelta ferie e assenze (con la parola che chi chiede puo'
 * vedere, piu' le chiusure dello studio) e scadenze (solo con documenti 1). Da CALENDARIO_GIORNI_PRIMA giorni fa a
 * CALENDARIO_MESI_DOPO mesi da oggi; le ricorrenze oltre le occorrenze gia' scritte si calcolano al volo con la stessa
 * regola, senza scriverle, e con lo stesso UID che avranno quando saranno scritte. Mai soldi, mai note interne.
 *
 * Il contenuto si calcola a ogni lettura coi permessi di oggi della persona del feed: tolto un permesso, il feed perde
 * quelle cose da subito.
 */
'use strict';

const crypto = require('node:crypto');
const { Rifiuto, senzaPermesso, testo, adesso, adessoMs, oggi, piuGiorni, dataIso, dataOraIso, istante, sha256 } = require('../utili');
const { creaIcs } = require('../calendario');
const { giorniDellaSerie } = require('./attivita');
const C = require('../conti');

const MASSIMO_FEED = 5;
const LETTURE_ORA = 60;
const CATEGORIA = { attivita: 'Attività', appuntamento: 'Appuntamento', sopralluogo: 'Sopralluogo', intervento: 'Intervento' };
const NON_TROVATO = { stato: 404 };

const si = v => v === true || v === 1 || v === '1' || v === 'true';

/** Il nome del file: wisper-calendario-manuel-2026-10-22.ics (il primo nome, senza accenti). */
function nomeFile(nome, cosa) {
  const primo = cosa === 'studio' ? 'studio' : String(nome || 'mio').split(/\s+/)[0].normalize('NFD').replace(/[^\w]/g, '').toLowerCase() || 'mio';
  return 'wisper-calendario-' + primo + '-' + oggi() + '.ics';
}

function json(v, base) {
  try { return v ? JSON.parse(v) : base; } catch (e) { return base; }
}

/** Le letture di un feed nell'ultima ora (in memoria: 60 per chiave, 429 oltre). */
function contaLettura(w, id) {
  w.lettureFeed = w.lettureFeed || new Map();
  const ora = Date.now();
  const l = (w.lettureFeed.get(id) || []).filter(t => ora - t < 3600000);
  l.push(ora);
  w.lettureFeed.set(id, l);
  return l.length;
}

module.exports = {
  // ------------------------------------------------------------------ gli eventi

  /**
   * Gli eventi per chi lavora adesso. cosa: {attivita: "mie"|"studio", assenze, scadenze}; dettagli: false = la sola
   * parola (Appuntamento, Attivita'...), niente luogo e descrizione (§5.3).
   */
  eventiCalendario(cosa, dettagli) {
    const imp = this.leggiImpostazioni();
    const t = oggi();
    const da = piuGiorni(t, -(Number(imp.CALENDARIO_GIORNI_PRIMA) >= 0 ? Number(imp.CALENDARIO_GIORNI_PRIMA) : 30));
    const a = C.piuMesi(t, Number(imp.CALENDARIO_MESI_DOPO) > 0 ? Number(imp.CALENDARIO_MESI_DOPO) : 12);
    const studio = cosa.attivita === 'studio';
    if (studio && !this.puoCalendarioStudio()) throw senzaPermesso('vedere il calendario di tutto lo studio');
    const io = this.chi().utente ? this.chi().utente.id : null;
    const nomi = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi[u.id] = u.nome; });
    const eventi = [];
    if (this.livello('attivita') >= 1) eventi.push(...this.eventiAttivita({ da, a, studio, io, nomi, dettagli }));
    if (si(cosa.assenze) && (this.livello('persone') >= 1 || this.miaPersonaId())) eventi.push(...this.eventiAssenze({ da, a, studio, dettagli }));
    if (si(cosa.scadenze) && this.livello('documenti') >= 1) eventi.push(...this.eventiScadenze({ da, a, dettagli }));
    // Ordine fisso: per giorno, poi per ora, poi per UID (lo stesso file per gli stessi dati).
    const chiave = e => (e.inizio ? dataOraIso(e.inizio) : e.giorno + 'T00:00:00') + ' ' + e.uid;
    return eventi.sort((x, y) => (chiave(x) < chiave(y) ? -1 : chiave(x) > chiave(y) ? 1 : 0));
  },

  /** Tutto lo studio: attivita 2 e non collaboratore (come la vista Squadra della fase 2). */
  puoCalendarioStudio() {
    return this.livello('attivita') >= 2 && !this.soloSuoi();
  },

  eventiAttivita({ da, a, studio, io, nomi, dettagli }) {
    const out = [];
    const ora = adessoMs();
    const trentaFa = istante(new Date(ora - 30 * 86400000));
    const righe = this.db.righe("SELECT * FROM attivita WHERE COALESCE(NULLIF(substr(inizio, 1, 10), ''), scadenza) BETWEEN ? AND ? ORDER BY id", da, a)
      .filter(r => (studio ? this.vedeAttivita(r) : r.assegnata_a === io && io !== null));
    const aiuti = this.aiutiCalendario(righe);
    const scritte = new Map();
    for (const r of righe) {
      if (r.ricorrenza_id) {
        const m = scritte.get(r.ricorrenza_id) || '';
        if (r.occorrenza > m) scritte.set(r.ricorrenza_id, r.occorrenza);
      }
      if (r.stato === 'annullata' && !(r.modificato && r.modificato >= trentaFa)) continue;
      if (r.stato === 'fatta' && !r.inizio && !(r.fatta_il && r.fatta_il >= trentaFa)) continue;
      out.push(this.eventoAttivita(r, aiuti, { studio, nomi, dettagli }));
    }
    // Le ricorrenze oltre le occorrenze gia' scritte (fase 2 le scrive per 90 giorni): calcolate al volo, non scritte.
    for (const ric of this.db.righe("SELECT * FROM ricorrenze WHERE per = 'attivita' AND (fine = '' OR fine >= ?)", da)) {
      const m = json(ric.modello, {});
      if (studio ? !this.vedeAttivita({ assegnata_a: m.assegnata_a === undefined ? null : m.assegnata_a, creata_da: ric.creata_da, commessa_id: m.commessa_id || '' })
        : !(io !== null && m.assegnata_a === io)) continue;
      const ultima = this.db.riga('SELECT MAX(occorrenza) m FROM attivita WHERE ricorrenza_id = ?', ric.id).m || '';
      for (const g of giorniDellaSerie(ric, a)) {
        if (g <= ultima || g < da) continue;
        const r = {
          id: null, ricorrenza_id: ric.id, occorrenza: g, titolo: m.titolo || '', descrizione: m.descrizione || '', tipo: m.tipo || 'attivita',
          cliente_id: m.cliente_id || '', commessa_id: m.commessa_id || '', assegnata_a: m.assegnata_a === undefined ? null : m.assegnata_a, luogo: m.luogo || '',
          stato: 'da_fare', scadenza: m.conOra ? '' : g, inizio: '', fine: '', modificato: ric.modificato, ticket_id: null, sede_id: null,
        };
        if (m.conOra) {
          const inizio = new Date(g + 'T' + (m.ora || '00:00:00'));
          r.inizio = istante(inizio);
          r.fine = istante(new Date(inizio.getTime() + (m.durata || 60) * 60000));
        }
        const extra = this.aiutiCalendario([r]);
        out.push(this.eventoAttivita(r, extra, { studio, nomi, dettagli, checklist: (m.checklist || []).length }));
      }
    }
    return out;
  },

  /** Clienti, commesse, ticket, sedi e checklist delle attivita' (una lettura per tipo). */
  aiutiCalendario(righe) {
    const clienti = {};
    const commesse = {};
    const ticket = {};
    const sedi = {};
    const liste = {};
    const ids = righe.map(r => r.id).filter(x => x !== null);
    const clientiIds = Array.from(new Set(righe.map(r => r.cliente_id).filter(Boolean)));
    const commesseIds = Array.from(new Set(righe.map(r => String(r.commessa_id || '').toUpperCase()).filter(Boolean)));
    const ticketIds = Array.from(new Set(righe.map(r => r.ticket_id).filter(x => x !== null && x !== undefined)));
    const segnaposti = l => l.map(() => '?').join(',');
    if (clientiIds.length) this.db.righe('SELECT id, nome FROM soggetti WHERE id IN (' + segnaposti(clientiIds) + ')', ...clientiIds).forEach(s => { clienti[s.id] = s.nome; });
    if (commesseIds.length) this.db.righe('SELECT id, descrizione, sede_id, cliente_id FROM commesse WHERE UPPER(id) IN (' + segnaposti(commesseIds) + ')', ...commesseIds).forEach(m => { commesse[String(m.id).toUpperCase()] = m; });
    if (ticketIds.length) this.db.righe('SELECT id, numero, sede_id, cliente_id FROM ticket WHERE id IN (' + segnaposti(ticketIds) + ')', ...ticketIds).forEach(x => { ticket[x.id] = x; });
    const sediIds = Array.from(new Set(Object.values(commesse).map(m => m.sede_id).concat(Object.values(ticket).map(x => x.sede_id)).filter(x => x !== null && x !== undefined)));
    if (sediIds.length) this.db.righe('SELECT * FROM sedi WHERE id IN (' + segnaposti(sediIds) + ')', ...sediIds).forEach(s => { sedi[s.id] = s; });
    if (ids.length) {
      this.db.righe('SELECT attivita_id, COUNT(*) n, SUM(fatta) f FROM attivita_checklist WHERE attivita_id IN (' + segnaposti(ids) + ') GROUP BY attivita_id', ...ids)
        .forEach(c => { liste[c.attivita_id] = { n: c.n, f: c.f || 0 }; });
    }
    return { clienti, commesse, ticket, sedi, liste };
  },

  eventoAttivita(r, aiuti, o) {
    const tipo = CATEGORIA[r.tipo] ? r.tipo : 'attivita';
    const conOra = !!r.inizio && !r.tutto_il_giorno;
    const uid = r.ricorrenza_id && r.occorrenza ? 'attivita-' + r.ricorrenza_id + '-' + r.occorrenza.replace(/-/g, '') + '@wisper' : 'attivita-' + r.id + '@wisper';
    const e = { uid, categoria: CATEGORIA[tipo], annullato: r.stato === 'annullata', modificato: r.modificato || null };
    if (conOra) { e.inizio = r.inizio; e.fine = r.fine || null; } else e.giorno = r.inizio ? dataIso(r.inizio) : r.scadenza;
    if (!o.dettagli) {
      e.titolo = CATEGORIA[tipo];
      return e;
    }
    let titolo = r.titolo || CATEGORIA[tipo];
    if (!conOra && tipo === 'attivita') titolo = (r.stato === 'fatta' ? 'Fatto: ' : 'Da fare: ') + titolo;
    if (o.studio) titolo += ' (' + (r.assegnata_a ? o.nomi[r.assegnata_a] || '' : 'da assegnare') + ')';
    e.titolo = titolo;
    const m = r.commessa_id ? aiuti.commesse[String(r.commessa_id).toUpperCase()] : null;
    const tk = r.ticket_id ? aiuti.ticket[r.ticket_id] : null;
    const sede = (tk && tk.sede_id && aiuti.sedi[tk.sede_id]) || (m && m.sede_id && aiuti.sedi[m.sede_id]) || null;
    e.luogo = testo(r.luogo) || (sede ? [sede.indirizzo, [sede.citta, sede.provincia ? '(' + sede.provincia + ')' : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ') || sede.nome : '');
    const cliente = aiuti.clienti[r.cliente_id] || (m && aiuti.clienti[m.cliente_id]) || '';
    const lista = r.id !== null ? aiuti.liste[r.id] : (o.checklist ? { n: o.checklist, f: 0 } : null);
    const righe = [];
    if (cliente) righe.push('Cliente: ' + cliente);
    if (m) righe.push('Commessa: ' + m.id + (m.descrizione ? ' ' + m.descrizione : ''));
    else if (r.commessa_id) righe.push('Commessa: ' + r.commessa_id);
    if (tk) righe.push('Ticket: ' + tk.numero);
    if (lista && lista.n) righe.push('Checklist: ' + lista.f + ' di ' + lista.n);
    if (testo(r.descrizione)) righe.push(testo(r.descrizione).slice(0, 500));
    righe.push('Si cambia in Wisper, non qui.');
    e.descrizione = righe.join('\n');
    return e;
  },

  /** Ferie e assenze: le mie, o (feed dello studio) quelle di tutti con la parola che chi chiede vede; le chiusure. */
  eventiAssenze({ da, a, studio, dettagli }) {
    const out = [];
    const trentaFa = istante(new Date(adessoMs() - 30 * 86400000));
    const mia = this.miaPersonaId();
    const nomi = {};
    this.db.righe('SELECT id, nome FROM persone').forEach(p => { nomi[p.id] = p.nome; });
    const vediAltri = studio && this.livello('persone') >= 1;
    for (const x of this.db.righe("SELECT * FROM assenze WHERE al >= ? AND dal <= ? AND stato IN ('approvata', 'annullata') ORDER BY id", da, a)) {
      if (x.persona_id !== mia && !vediAltri) continue;
      if (x.stato === 'annullata' && !(x.annullata_il && x.annullata_il >= trentaFa)) continue;
      const parola = this.tipoVistoAssenza(x);
      const conOra = !!(x.dalle && x.alle) && x.dal === x.al;
      const e = { uid: 'assenza-' + x.id + '@wisper', categoria: x.tipo === 'ferie' && parola !== 'Assente' ? 'Ferie' : 'Assenza', annullato: x.stato === 'annullata', modificato: x.modificato || null };
      if (conOra) { e.inizio = istante(new Date(x.dal + 'T' + x.dalle + ':00')); e.fine = istante(new Date(x.al + 'T' + x.alle + ':00')); } else { e.giorno = x.dal; e.giornoFine = x.al; }
      if (!dettagli) e.titolo = 'Assenza';
      else {
        const orario = conOra ? ' ' + Number(x.dalle.slice(0, 2)) + ':' + x.dalle.slice(3, 5) + '-' + Number(x.alle.slice(0, 2)) + ':' + x.alle.slice(3, 5) : '';
        const mezza = !conOra && x.mezza ? ' (' + x.mezza + ')' : '';
        e.titolo = parola + orario + mezza + (studio ? ' (' + (nomi[x.persona_id] || '') + ')' : '');
        e.descrizione = 'Si cambia in Wisper, non qui.';
      }
      out.push(e);
    }
    for (const c of this.db.righe('SELECT * FROM chiusure WHERE al >= ? AND dal <= ? ORDER BY id', da, a)) {
      const e = { uid: 'chiusura-' + c.id + '@wisper', categoria: 'Chiusura', giorno: c.dal, giornoFine: c.al, modificato: c.creato || null };
      e.titolo = dettagli ? 'Studio chiuso' + (testo(c.nome) ? ': ' + c.nome : '') : 'Chiusura';
      if (dettagli) e.descrizione = 'Si cambia in Wisper, non qui.';
      out.push(e);
    }
    return out;
  },

  /** Le scadenze aperte delle fasi 5 e 6 che chi chiede vede, come eventi di un giorno. */
  eventiScadenze({ da, a, dettagli }) {
    const out = [];
    const clienti = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { clienti[s.id] = s.nome; });
    for (const s of this.db.righe("SELECT * FROM scadenze WHERE stato = 'aperta' AND data BETWEEN ? AND ? ORDER BY data, id", da, a)) {
      if (!this.vedeScadenza(s)) continue;
      const e = { uid: 'scadenza-' + s.id + '@wisper', categoria: 'Scadenza', giorno: s.data, modificato: s.modificato || s.creato || null };
      if (!dettagli) e.titolo = 'Scadenza';
      else {
        const base = String(s.titolo || '').replace(/ scade$/, '');
        const cliente = s.cliente_id && this.gruppoDiScadenza(s) !== 'persone' ? clienti[s.cliente_id] || '' : '';
        e.titolo = 'Scadenza: ' + base + (cliente ? ' · ' + cliente : '');
        e.descrizione = [cliente ? 'Cliente: ' + cliente : '', 'Si cambia in Wisper, non qui.'].filter(Boolean).join('\n');
      }
      out.push(e);
    }
    return out;
  },

  /** Il testo ICS per chi lavora adesso. */
  icsCalendario(cosa, dettagli, nome) {
    return creaIcs({ nome, eventi: this.eventiCalendario(cosa, dettagli), ora: new Date(adessoMs()) });
  },

  nomeCalendario(cosa) {
    const c = this.chi();
    if (cosa.attivita === 'studio') {
      const imp = this.leggiImpostazioni();
      return 'Wisper · ' + (testo(imp.STUDIO_NOME_BREVE) || testo(imp.RAGIONE_SOCIALE) || 'Studio');
    }
    return 'Wisper · ' + (c.utente ? c.utente.nome : 'Studio');
  },

  // ------------------------------------------------------------------ il file da scaricare (§5.4)

  /** esportaCalendario {cosa: "mie"|"studio", assenze?, scadenze?} (attivita 1). */
  esportaCalendario(d) {
    const cosa = { attivita: testo(d.cosa) === 'studio' ? 'studio' : 'mie', assenze: si(d.assenze), scadenze: si(d.scadenze) };
    if (testo(d.cosa) && ['mie', 'studio'].indexOf(testo(d.cosa)) < 0) throw new Rifiuto('Cosa: le mie cose o tutto lo studio');
    const eventi = this.eventiCalendario(cosa, true);
    const ics = creaIcs({ nome: this.nomeCalendario(cosa), eventi, ora: new Date(adessoMs()) });
    const c = this.chi();
    return { ok: true, nome: nomeFile(c.utente ? c.utente.nome : '', cosa.attivita), mime: 'text/calendar;charset=utf-8', eventi: eventi.length, base64: Buffer.from(ics, 'utf8').toString('base64') };
  },

  // ------------------------------------------------------------------ gli indirizzi d'abbonamento (§5.5)

  feedDaRiga(f) {
    return {
      id: f.id, nome: f.nome, cosa: json(f.cosa, { attivita: 'mie', assenze: false, scadenze: false }), dettagli: f.dettagli === 1, pubblico: f.pubblico === 1,
      creato: dataOraIso(f.creato), ultimoUso: dataOraIso(f.ultimo_uso), agente: f.agente, letture: f.letture,
    };
  },

  /** feedCalendario {} (attivita 1): i propri, non tolti. */
  feedCalendario() {
    const c = this.chi();
    // fuoriCasa: il calendario fuori casa e' acceso (CALENDARIO_PUBBLICO), cosi' l'app sa se offrire "Fuori casa".
    if (!c.utente) return { ok: true, feed: [], fuoriCasa: this.calendarioPubblicoAcceso() };
    return { ok: true, feed: this.db.righe("SELECT * FROM calendario_feed WHERE utente_id = ? AND revocato_il = '' ORDER BY id", c.utente.id).map(f => this.feedDaRiga(f)),
      fuoriCasa: this.calendarioPubblicoAcceso() };
  },

  /**
   * nuovoFeed {nome, cosa, dettagli, pubblico?, conferma?}: la chiave (32 byte casuali) si mostra UNA volta, qui, dentro
   * indirizzo e webcal. In casa l'indirizzo nasce dallo schema e dall'Host della richiesta (§0.3); fuori casa (pubblico)
   * e' quello dello script del portale. Un feed pubblico nasce senza dettagli: coi dettagli serve conferma: true.
   */
  nuovoFeed(d) {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Gli indirizzi del calendario sono di una persona');
    const nome = testo(d.nome).slice(0, 60);
    if (!nome) throw new Rifiuto('Nome: scrivi un nome per riconoscerlo');
    const n = this.db.riga("SELECT COUNT(*) n FROM calendario_feed WHERE utente_id = ? AND revocato_il = ''", c.utente.id).n;
    if (n >= MASSIMO_FEED) throw new Rifiuto('Hai già 5 indirizzi: togline uno');
    const x = d.cosa && typeof d.cosa === 'object' ? d.cosa : {};
    const cosa = { attivita: testo(x.attivita) === 'studio' ? 'studio' : 'mie', assenze: si(x.assenze), scadenze: si(x.scadenze) };
    if (cosa.attivita === 'studio' && !this.puoCalendarioStudio()) throw senzaPermesso('vedere il calendario di tutto lo studio');
    const pubblico = si(d.pubblico);
    const dettagli = d.dettagli === undefined ? !pubblico : si(d.dettagli);
    let indirizzoBase;
    if (pubblico) {
      if (!this.calendarioPubblicoAcceso() || !this.indirizzoScriptPortale()) throw new Rifiuto('Il calendario fuori casa non è acceso');
      if (dettagli && !si(d.conferma)) throw new Rifiuto('Titoli, luoghi e clienti passeranno dai server di Google o Microsoft', { conferma: true });
      indirizzoBase = null;
    } else {
      indirizzoBase = this.indirizzoDiCasa();
    }
    const chiave = crypto.randomBytes(32).toString('base64url');
    const ora = adesso();
    const id = this.inserisci('calendario_feed', {
      utente_id: c.utente.id, nome, token_hash: sha256(chiave), cosa: JSON.stringify(cosa), dettagli: dettagli ? 1 : 0, pubblico: pubblico ? 1 : 0, creato: ora,
    }, 'id', 'indirizzo del calendario creato: ' + nome);
    const indirizzo = pubblico ? this.indirizzoScriptPortale() + '?calendario=' + chiave : indirizzoBase + '/calendario/' + chiave + '.ics';
    const webcal = indirizzo.replace(/^https?:\/\//, 'webcal://');
    return { ok: true, feed: this.feedDaRiga(this.db.riga('SELECT * FROM calendario_feed WHERE id = ?', id)), indirizzo, webcal };
  },

  /**
   * L'indirizzo con cui il telefono parla al server in casa: schema e Host della richiesta che crea il feed. Da fuori
   * casa (porta Google) il NAS non sa il suo indirizzo di casa: WISPER_INDIRIZZO_CASA se c'e', se no si chiede di
   * crearlo da casa (§18).
   */
  indirizzoDiCasa() {
    const r = this.chi().richiesta || {};
    const host = testo(r.host);
    if (host && !r.daGoogle && /^[A-Za-z0-9.:[\]-]{1,100}$/.test(host)) return (r.schema === 'https' ? 'https' : 'http') + '://' + host;
    const env = testo(process.env.WISPER_INDIRIZZO_CASA).replace(/\/+$/, '');
    if (/^https?:\/\/[A-Za-z0-9.:[\]-]{1,100}$/.test(env)) return env;
    throw new Rifiuto('Crea l\'indirizzo quando sei in casa: da fuori casa il NAS non sa con che indirizzo lo chiami');
  },

  /** L'indirizzo dello script del portale (WISPER_PORTALE_URL): pubblico per costruzione, mai nei dati di prova. */
  indirizzoScriptPortale() {
    const u = testo(process.env.WISPER_PORTALE_URL);
    return /^https?:\/\/\S+$/.test(u) ? u : '';
  },

  /** revocaFeed {id}: i propri; quelli degli altri con amministrazione 2 (Sicurezza, §9.8). */
  revocaFeed(d) {
    const f = this.db.riga('SELECT * FROM calendario_feed WHERE id = ?', Number(d.id) || 0);
    const c = this.chi();
    const mio = f && c.utente && f.utente_id === c.utente.id;
    if (!f || (!mio && this.livello('amministrazione') < 2)) throw new Rifiuto('Indirizzo ' + testo(d.id) + ' non trovato');
    if (!f.revocato_il) this.aggiorna('calendario_feed', f.id, { revocato_il: adesso() }, 'id', 'indirizzo del calendario tolto');
    return { ok: true };
  },

  /** I feed di tutti (Amministrazione › Sicurezza). */
  tuttiIFeed() {
    return this.db.righe("SELECT f.*, u.nome AS persona FROM calendario_feed f JOIN utenti u ON u.id = f.utente_id WHERE f.revocato_il = '' ORDER BY u.nome, f.id")
      .map(f => Object.assign(this.feedDaRiga(f), { idUtente: f.utente_id, persona: f.persona }));
  },

  // ------------------------------------------------------------------ la lettura senza Bearer

  /**
   * GET /calendario/<chiave>.ics (in casa) e lo script del portale (fuori casa, pubblico: true). Torna {stato, ics?,
   * etag?, ultimaModifica?}: 404 uguale per chiave sconosciuta, tolta o di un utente disattivato; 429 oltre 60 letture
   * in un'ora; 304 se If-None-Match e' quello di adesso.
   */
  leggiFeedCalendario(chiave, o) {
    o = o || {};
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(testo(chiave))) return NON_TROVATO;
    const f = this.db.riga("SELECT f.*, u.id AS uid, u.nome AS unome, u.email AS uemail, u.ruolo AS uruolo, u.attivo AS uattivo FROM calendario_feed f JOIN utenti u ON u.id = f.utente_id WHERE f.token_hash = ?",
      sha256(testo(chiave)));
    if (!f || f.revocato_il || f.uattivo !== 1) return NON_TROVATO;
    if (o.pubblico && (f.pubblico !== 1 || !this.calendarioPubblicoAcceso())) return NON_TROVATO;
    if (contaLettura(this, f.id) > LETTURE_ORA) return { stato: 429 };
    const utente = { id: f.uid, nome: f.unome, email: f.uemail, ruolo: f.uruolo };
    const cosa = json(f.cosa, { attivita: 'mie' });
    let ics;
    try {
      ics = this.come({ utente, permessi: this.permessiDi(utente.ruolo), azione: 'calendario', app: 'calendario', dispNome: testo(o.agente).slice(0, 60) },
        () => creaIcs({ nome: 'Wisper · ' + f.nome, eventi: this.eventiCalendario(cosa, f.dettagli === 1), ora: new Date(adessoMs()) }));
    } catch (err) {
      // Il permesso del feed dello studio tolto: il feed resta, con le sole cose sue.
      ics = this.come({ utente, permessi: this.permessiDi(utente.ruolo), azione: 'calendario' },
        () => creaIcs({ nome: 'Wisper · ' + f.nome, eventi: this.eventiCalendario(Object.assign({}, cosa, { attivita: 'mie' }), f.dettagli === 1), ora: new Date(adessoMs()) }));
    }
    const etag = '"' + crypto.createHash('sha256').update(ics.replace(/^DTSTAMP:.*\r\n/gm, '')).digest('base64url').slice(0, 27) + '"';
    const ora = adesso();
    this.db.esegui('UPDATE calendario_feed SET ultimo_uso = ?, letture = letture + 1, agente = ? WHERE id = ?', ora, testo(o.agente).slice(0, 60), f.id);
    if (o.seNonCambiato && o.seNonCambiato === etag) return { stato: 304, etag };
    const ultime = ics.match(/^LAST-MODIFIED:(\d{8}T\d{6}Z)/gm) || [];
    const ultima = ultime.map(x => x.slice(14)).sort().pop();
    const ultimaModifica = ultima ? new Date(Date.UTC(+ultima.slice(0, 4), +ultima.slice(4, 6) - 1, +ultima.slice(6, 8), +ultima.slice(9, 11), +ultima.slice(11, 13), +ultima.slice(13, 15))).toUTCString()
      : new Date(Date.parse(f.creato)).toUTCString();
    return { stato: 200, ics, etag, ultimaModifica, utente };
  },

  /** Lo script del portale (§0.3): {ok, stato, ics} solo per i feed pubblici con CALENDARIO_PUBBLICO acceso. */
  calendarioPubblico(chiave, agente) {
    const r = this.leggiFeedCalendario(chiave, { pubblico: true, agente });
    this.registraAccesso({ azione: 'calendario', app: 'calendario', dispNome: 'fuori casa' }, r.stato === 200 ? 'ok' : r.stato === 429 ? 'troppe letture' : 'non trovato', r.utente || null);
    if (r.stato !== 200) return { ok: false, stato: r.stato === 429 ? 429 : 404, errore: 'Indirizzo del calendario non valido' };
    return { ok: true, stato: 200, ics: r.ics };
  },
};

Object.defineProperties(module.exports, {
  nomeFileCalendario: { value: nomeFile },
});
