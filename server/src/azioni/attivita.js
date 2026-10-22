/*
 * Attivita' e calendario (fase 2, accordo in docs/gestionale/fase2.md, risposte
 * in architettura.md §13.6-13.7).
 *
 * Un'attivita' ha una scadenza (un giorno) oppure un inizio e una fine
 * (appuntamenti e sopralluoghi). Chi la vede e chi la scrive:
 *  - un collaboratore vede le sue (assegnate a lui o create da lui), le non
 *    assegnate e quelle delle commesse dove e' responsabile o tra le persone;
 *    scrive solo le sue, e assegna solo a se' o a nessuno;
 *  - gli altri ruoli, col permesso del modulo, tutto.
 *
 * Le ricorrenze: una serie (tabella ricorrenze) con la regola e il modello; le
 * occorrenze sono attivita' vere, create per i prossimi 90 giorni e allungate
 * ogni notte (allungaRicorrenze, nella stessa pianificazione delle copie).
 * Un'occorrenza annullata resta li': e' cosi' che se ne salta una senza
 * rompere la serie. Cambiando un'occorrenza si sceglie "questa", "future" o
 * "tutte"; le occorrenze fatte non si toccano mai.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, adesso, oggi, piuGiorni, dataIso, dataDaIso, dataOraIso, istante, due,
} = require('../utili');

// Fase 5: "intervento" e' l'uscita per un ticket (ticket_id), nel calendario di tutti come gli altri.
const TIPI = ['attivita', 'appuntamento', 'sopralluogo', 'intervento'];
const PRIORITA = ['alta', 'normale', 'bassa'];
const STATI = ['da_fare', 'in_corso', 'fatta', 'annullata'];
const REGOLE = ['giorni', 'settimane', 'mesi', 'anni'];
const PER_RICORRENZA = ['questa', 'future', 'tutte'];
/** Quanti giorni avanti ci sono gia' le occorrenze. */
const GIORNI_AVANTI = 90;
/** Il giorno di un'attivita' in SQL: quello dell'inizio, se no la scadenza. */
const GIORNO = "COALESCE(NULLIF(substr(a.inizio, 1, 10), ''), a.scadenza)";
/** I campi che passano dal modello di una serie alle sue occorrenze. */
const CAMPI_MODELLO = ['titolo', 'descrizione', 'tipo', 'cliente_id', 'commessa_id', 'prestazione_id', 'assegnata_a',
  'priorita', 'luogo', 'promemoria_minuti', 'tutto_il_giorno'];

const vuoto = v => v === undefined || v === null || v === '';
const si = v => v === true || v === 1 || v === '1' || v === 'true';

/** Il giorno di una riga del database. */
const giornoDi = r => (r.inizio ? dataIso(r.inizio) : r.scadenza || '');
/** "14:30:00" dall'istante salvato. */
const oraDi = ist => dataOraIso(ist).slice(11, 19);
/** "8:30" per le frasi. */
const oraBreve = ist => {
  const o = dataOraIso(ist).slice(11, 16);
  return o ? Number(o.slice(0, 2)) + ':' + o.slice(3) : '';
};
const minutiTra = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

/** Un istante mandato dall'app ("2026-10-23T14:30:00", ora italiana; o un giorno solo) per il database. */
function istanteDa(v, campo) {
  const s = testo(v);
  if (!s) return '';
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s + 'T00:00:00');
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) d = new Date(s);
  if (!d || isNaN(d.getTime())) throw new Rifiuto(campo + ': non è un\'ora valida (' + s + ')');
  return istante(d);
}

/** Un'ora del giorno su un giorno: "2026-10-23" + "14:30:00" -> l'istante col fuso giusto (anche col cambio dell'ora). */
const suGiorno = (giorno, ora) => istante(new Date(giorno + 'T' + (ora || '00:00:00')));

/** 1 lunedi' ... 7 domenica. */
const giornoSettimana = iso => ((new Date(iso + 'T12:00:00').getDay() + 6) % 7) + 1;

/** Il giorno "giorno" del mese (meseIndice da 0, anche oltre 11); se il mese e' piu' corto, l'ultimo. */
function giornoDelMese(anno, meseIndice, giorno) {
  const a = anno + Math.floor(meseIndice / 12);
  const m = ((meseIndice % 12) + 12) % 12;
  const ultimo = new Date(a, m + 1, 0).getDate();
  return a + '-' + due(m + 1) + '-' + due(Math.min(giorno, ultimo));
}

function giorniSettimanaDa(v) {
  const lista = Array.isArray(v) ? v : testo(v) ? testo(v).split(',') : [];
  const n = Array.from(new Set(lista.map(x => Number(x)))).sort((a, b) => a - b);
  if (n.some(x => !(x >= 1 && x <= 7) || Math.round(x) !== x)) throw new Rifiuto('Giorni della settimana: da 1 (lunedì) a 7 (domenica)');
  return n;
}

/**
 * I giorni di una serie fra il suo inizio e "finoA" (compreso), fermandosi alla
 * sua fine. Ogni N giorni, settimane (nei giorni della settimana scelti),
 * mesi (lo stesso giorno, o l'ultimo se il mese e' piu' corto) o anni.
 */
function giorniDellaSerie(ric, finoA) {
  const fine = ric.fine && ric.fine < finoA ? ric.fine : finoA;
  const inizio = ric.inizio;
  const out = [];
  if (!inizio || fine < inizio) return out;
  const ogni = Math.max(1, ric.ogni || 1);
  const [a, m, g] = inizio.split('-').map(Number);
  for (let k = 0, giri = 0; giri < 5000; k += ogni, giri++) {
    if (ric.regola === 'giorni') {
      const d = piuGiorni(inizio, k);
      if (d > fine) break;
      out.push(d);
    } else if (ric.regola === 'settimane') {
      const lunedi = piuGiorni(inizio, -(giornoSettimana(inizio) - 1));
      const base = piuGiorni(lunedi, 7 * k);
      if (base > fine) break;
      const giorni = ric.giorni_settimana ? giorniSettimanaDa(ric.giorni_settimana) : [giornoSettimana(inizio)];
      for (const gs of giorni) {
        const d = piuGiorni(base, gs - 1);
        if (d >= inizio && d <= fine) out.push(d);
      }
    } else {
      const d = ric.regola === 'mesi' ? giornoDelMese(a, m - 1 + k, g) : giornoDelMese(a + k, m - 1, g);
      if (d > fine) break;
      out.push(d);
    }
  }
  return out;
}

module.exports = {
  // ------------------------------------------------------------------ chi vede, chi scrive

  /** Le commesse dove chi lavora e' responsabile o tra le persone. */
  mieCommesse() {
    const c = this.chi();
    if (!c.utente) return new Set();
    const ids = this.db.righe('SELECT commessa_id id FROM commessa_persone WHERE utente_id = ? UNION SELECT id FROM commesse WHERE responsabile_id = ?',
      c.utente.id, c.utente.id).map(r => String(r.id).toUpperCase());
    return new Set(ids);
  },

  vedeAttivita(r, mie) {
    if (!this.soloSuoi()) return true;
    const io = this.chi().utente.id;
    if (r.assegnata_a === io || r.assegnata_a === null || r.creata_da === io) return true;
    return !!r.commessa_id && (mie || this.mieCommesse()).has(String(r.commessa_id).toUpperCase());
  },

  /** Un collaboratore scrive solo le sue: assegnate a lui o create da lui. */
  suaAttivita(r) {
    if (!this.soloSuoi()) return true;
    const io = this.chi().utente.id;
    return r.assegnata_a === io || r.creata_da === io;
  },

  controllaSua(r, cosa) {
    if (!this.suaAttivita(r)) throw senzaPermesso(cosa || 'cambiare le attività degli altri');
  },

  rigaAttivita(id) {
    const r = this.db.riga('SELECT * FROM attivita WHERE id = ?', Number(id) || 0);
    if (!r) throw new Rifiuto('Attività ' + testo(id) + ' non trovata');
    if (!this.vedeAttivita(r)) throw senzaPermesso('vedere le attività degli altri');
    return r;
  },

  // ------------------------------------------------------------------ lettura

  /** Nomi, checklist, allegati e serie che servono per mandare un elenco di attivita'. */
  aiutiAttivita(ids) {
    const lista = ids && ids.length ? ' IN (' + ids.map(Number).join(',') + ')' : null;
    const a = { utenti: {}, clienti: {}, commesse: {}, checklist: {}, allegati: {}, ricorrenze: {}, mie: this.mieCommesse() };
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { a.utenti[u.id] = u.nome; });
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.clienti[s.id] = s.nome; });
    this.db.righe('SELECT id, descrizione FROM commesse').forEach(m => { a.commesse[String(m.id).toUpperCase()] = m.descrizione; });
    this.db.righe('SELECT * FROM ricorrenze').forEach(r => { a.ricorrenze[r.id] = r; });
    a.ticket = {};
    this.db.righe('SELECT id, numero FROM ticket').forEach(t => { a.ticket[t.id] = t.numero; });
    if (!lista) return a;
    for (const c of this.db.righe('SELECT * FROM attivita_checklist WHERE attivita_id' + lista + ' ORDER BY ordine, id')) {
      (a.checklist[c.attivita_id] = a.checklist[c.attivita_id] || []).push({ id: c.id, testo: c.testo, fatta: c.fatta === 1, ordine: c.ordine });
    }
    for (const f of this.db.righe("SELECT * FROM file WHERE tipo = 'attivita' AND cestinato IS NULL AND attivita_id" + lista + ' ORDER BY creato, rowid')) {
      (a.allegati[f.attivita_id] = a.allegati[f.attivita_id] || []).push({ id: f.id, nome: f.nome, mime: f.mime, url: '/file/' + f.id });
    }
    return a;
  },

  attivitaDaRiga(r, aiuti) {
    aiuti = aiuti || this.aiutiAttivita([r.id]);
    const giorno = giornoDi(r);
    const adesso = oggi();
    const gruppo = r.stato === 'fatta' ? 'fatte' : r.stato === 'annullata' ? 'annullate' : !giorno ? 'senzaData'
      : giorno < adesso ? 'scadute' : giorno === adesso ? 'oggi' : 'prossimi';
    const ric = r.ricorrenza_id ? aiuti.ricorrenze[r.ricorrenza_id] : null;
    return {
      id: r.id, titolo: r.titolo, descrizione: r.descrizione, tipo: r.tipo,
      idCliente: r.cliente_id, cliente: aiuti.clienti[r.cliente_id] || '',
      idCommessa: r.commessa_id, commessa: r.commessa_id ? aiuti.commesse[String(r.commessa_id).toUpperCase()] || '' : '',
      idPrestazione: r.prestazione_id === null ? null : r.prestazione_id,
      assegnataA: r.assegnata_a === null ? null : r.assegnata_a, assegnata: r.assegnata_a ? aiuti.utenti[r.assegnata_a] || '' : '',
      creataDa: r.creata_da === null ? null : r.creata_da, priorita: r.priorita, stato: r.stato,
      scadenza: r.scadenza, inizio: dataOraIso(r.inizio), fine: dataOraIso(r.fine), tuttoIlGiorno: r.tutto_il_giorno === 1,
      luogo: r.luogo, promemoriaMinuti: r.promemoria_minuti === null ? null : r.promemoria_minuti,
      idRicorrenza: r.ricorrenza_id === null ? null : r.ricorrenza_id, occorrenza: r.occorrenza,
      ricorrenza: ric ? {
        regola: ric.regola, ogni: ric.ogni, giorniSettimana: ric.giorni_settimana ? giorniSettimanaDa(ric.giorni_settimana) : [],
        inizio: ric.inizio, fine: ric.fine,
      } : null,
      fattaIl: dataOraIso(r.fatta_il), giorno, gruppo,
      checklist: aiuti.checklist[r.id] || [], allegati: aiuti.allegati[r.id] || [],
      puoScrivere: this.livello('attivita') >= 2 && this.suaAttivita(r),
      // Fase 5
      idTicket: r.ticket_id === null || r.ticket_id === undefined ? null : r.ticket_id, ticket: r.ticket_id ? aiuti.ticket[r.ticket_id] || '' : '',
      creato: dataOraIso(r.creato), modificato: dataOraIso(r.modificato),
    };
  },

  attivitaPerId(id) {
    const r = this.db.riga('SELECT * FROM attivita WHERE id = ?', id);
    return r ? this.attivitaDaRiga(r) : null;
  },

  /**
   * Le righe dell'elenco. Senza date: le aperte di ogni giorno (scadute, oggi,
   * prossimi giorni, senza data). Con da/a: quelle del periodo, tranne le
   * annullate (il calendario).
   */
  righeAttivita(d) {
    d = d || {};
    const da = testo(d.da) ? dataDaIso(d.da) : '';
    const a = testo(d.a) ? dataDaIso(d.a) : '';
    const stato = testo(d.stato) || (da || a ? 'non_annullate' : 'aperte');
    const cond = [];
    const par = [];
    if (stato === 'aperte') cond.push("a.stato IN ('da_fare', 'in_corso')");
    else if (stato === 'non_annullate') cond.push("a.stato <> 'annullata'");
    else if (stato !== 'tutte') {
      if (STATI.indexOf(stato) < 0) throw new Rifiuto('Stato: aperte, da_fare, in_corso, fatta, annullata o tutte');
      cond.push('a.stato = ?');
      par.push(stato);
    }
    if (da) { cond.push(GIORNO + " <> '' AND " + GIORNO + ' >= ?'); par.push(da); }
    if (a) { cond.push(GIORNO + " <> '' AND " + GIORNO + ' <= ?'); par.push(a); }
    const io = this.chi().utente ? this.chi().utente.id : 0;
    if (testo(d.assegnata)) { cond.push('a.assegnata_a = ?'); par.push(Number(d.assegnata)); }
    if (si(d.mie)) { cond.push('a.assegnata_a = ?'); par.push(io); }
    if (si(d.nonAssegnate)) cond.push('a.assegnata_a IS NULL');
    if (testo(d.commessa || d.idCommessa)) { cond.push('a.commessa_id = ? COLLATE NOCASE'); par.push(testo(d.commessa || d.idCommessa)); }
    if (testo(d.cliente || d.idCliente)) { cond.push('a.cliente_id = ?'); par.push(testo(d.cliente || d.idCliente)); }
    if (testo(d.ticket || d.idTicket)) { cond.push('a.ticket_id = ?'); par.push(this.idTicketDa(d.ticket || d.idTicket)); }
    if (this.soloSuoi()) {
      cond.push('(a.assegnata_a = ? OR a.assegnata_a IS NULL OR a.creata_da = ? ' +
        'OR a.commessa_id IN (SELECT commessa_id FROM commessa_persone WHERE utente_id = ?) ' +
        'OR a.commessa_id IN (SELECT id FROM commesse WHERE responsabile_id = ?))');
      par.push(io, io, io, io);
    }
    const sql = 'SELECT a.* FROM attivita a' + (cond.length ? ' WHERE ' + cond.join(' AND ') : '') +
      ' ORDER BY CASE WHEN ' + GIORNO + " = '' THEN 1 ELSE 0 END, " + GIORNO + ', a.inizio, ' +
      "CASE a.priorita WHEN 'alta' THEN 0 WHEN 'normale' THEN 1 ELSE 2 END, a.id";
    return this.db.righe(sql, ...par);
  },

  leggiAttivita(d) {
    const righe = this.righeAttivita(d);
    const aiuti = this.aiutiAttivita(righe.map(r => r.id));
    return righe.map(r => this.attivitaDaRiga(r, aiuti));
  },

  // ------------------------------------------------------------------ scrittura

  /** I valori di un'attivita' come saranno dopo il salvataggio (i campi non mandati restano com'erano). */
  valoriAttivita(x, prima) {
    const p = prima || {};
    const prendi = (k, col, base) => (x[k] !== undefined ? testo(x[k]) : prima ? p[col] : base);
    const v = {
      titolo: prendi('titolo', 'titolo', ''),
      descrizione: prendi('descrizione', 'descrizione', ''),
      luogo: prendi('luogo', 'luogo', ''),
      tipo: x.tipo !== undefined ? testo(x.tipo).toLowerCase() || 'attivita' : prima ? p.tipo : 'attivita',
      priorita: x.priorita !== undefined ? testo(x.priorita).toLowerCase() || 'normale' : prima ? p.priorita : 'normale',
      stato: x.stato !== undefined ? testo(x.stato).toLowerCase() || 'da_fare' : prima ? p.stato : 'da_fare',
    };
    if (!v.titolo) throw new Rifiuto('Titolo: scrivi cosa c\'è da fare');
    if (TIPI.indexOf(v.tipo) < 0) throw new Rifiuto('Tipo: attivita, appuntamento, sopralluogo o intervento');
    if (PRIORITA.indexOf(v.priorita) < 0) throw new Rifiuto('Priorità: alta, normale o bassa');
    if (STATI.indexOf(v.stato) < 0) throw new Rifiuto('Stato: da_fare, in_corso, fatta o annullata');
    v.fatta_il = v.stato === 'fatta' ? (prima && p.stato === 'fatta' ? p.fatta_il : adesso()) : '';

    // Commessa, cliente, prestazione, persona.
    v.commessa_id = prima ? p.commessa_id : '';
    if (x.idCommessa !== undefined) {
      const codice = testo(x.idCommessa);
      if (codice) {
        const m = this.db.riga('SELECT id FROM commesse WHERE id = ?', codice);
        if (!m) throw new Rifiuto('Commessa ' + codice + ' non trovata');
        v.commessa_id = m.id;
      } else v.commessa_id = '';
    }
    v.cliente_id = x.idCliente !== undefined ? testo(x.idCliente) : prima ? p.cliente_id : '';
    if (v.cliente_id && !this.db.riga('SELECT id FROM soggetti WHERE id = ?', v.cliente_id)) throw new Rifiuto('Cliente ' + v.cliente_id + ' non trovato');
    if (!v.cliente_id && v.commessa_id) v.cliente_id = this.db.riga('SELECT cliente_id FROM commesse WHERE id = ?', v.commessa_id).cliente_id;
    // Fase 5: il ticket dell'intervento (stesso cliente).
    v.ticket_id = x.idTicket !== undefined ? (vuoto(x.idTicket) ? null : this.idTicketDa(x.idTicket)) : prima ? p.ticket_id : null;
    if (v.ticket_id !== null) {
      const t = this.rigaTicket(v.ticket_id);
      if (v.cliente_id && t.cliente_id !== v.cliente_id) throw new Rifiuto('Il ticket ' + t.numero + ' è di un altro cliente');
      if (!v.cliente_id) v.cliente_id = t.cliente_id;
      v.ticket_id = t.id;
    }
    v.prestazione_id = x.idPrestazione !== undefined ? (vuoto(x.idPrestazione) ? null : Number(x.idPrestazione)) : prima ? p.prestazione_id : null;
    if (v.prestazione_id !== null && !this.db.riga('SELECT id FROM prestazioni WHERE id = ?', v.prestazione_id)) {
      throw new Rifiuto('Prestazione ' + v.prestazione_id + ' non trovata');
    }
    v.assegnata_a = x.assegnataA !== undefined ? (vuoto(x.assegnataA) ? null : Number(x.assegnataA)) : prima ? p.assegnata_a : null;
    if (v.assegnata_a !== null && !this.db.riga('SELECT id FROM utenti WHERE id = ?', v.assegnata_a)) {
      throw new Rifiuto('Persona ' + v.assegnata_a + ' non trovata');
    }

    // Quando: una scadenza, oppure inizio e fine.
    v.tutto_il_giorno = x.tuttoIlGiorno !== undefined ? (si(x.tuttoIlGiorno) ? 1 : 0) : prima ? p.tutto_il_giorno : 0;
    v.scadenza = x.scadenza !== undefined ? (x.scadenza ? dataDaIso(x.scadenza) : '') : prima ? p.scadenza : '';
    v.inizio = x.inizio !== undefined ? istanteDa(x.inizio, 'Inizio') : prima ? p.inizio : '';
    v.fine = x.fine !== undefined ? istanteDa(x.fine, 'Fine') : prima ? p.fine : '';
    if (!v.inizio && v.tipo !== 'attivita') throw new Rifiuto('Inizio: scrivi quando comincia');
    if (v.fine && !v.inizio) throw new Rifiuto('Inizio: scrivi quando comincia');
    if (v.inizio && v.tutto_il_giorno) {
      v.inizio = suGiorno(dataIso(v.inizio), '00:00:00');
      v.fine = suGiorno(dataIso(v.fine || v.inizio), '23:59:00');
    }
    if (v.inizio && !v.fine) v.fine = istante(new Date(Date.parse(v.inizio) + 3600000));
    if (v.inizio && Date.parse(v.fine) < Date.parse(v.inizio)) throw new Rifiuto('Fine: deve venire dopo l\'inizio');
    if (x.promemoriaMinuti !== undefined) {
      v.promemoria_minuti = vuoto(x.promemoriaMinuti) ? null : Math.round(numero(x.promemoriaMinuti));
      if (v.promemoria_minuti !== null && v.promemoria_minuti < 0) throw new Rifiuto('Promemoria: quanti minuti prima, da 0 in su');
    } else v.promemoria_minuti = prima ? p.promemoria_minuti : null;
    return v;
  },

  /**
   * Due impegni della stessa persona nella stessa ora: si dice prima di
   * salvare, con l'elenco; con "conferma" si salva lo stesso.
   */
  controllaSovrapposte(v, tranneId) {
    if (!v.inizio || !v.fine || v.tutto_il_giorno || v.assegnata_a === null || v.stato === 'fatta' || v.stato === 'annullata') return;
    const altre = this.db.righe("SELECT * FROM attivita WHERE assegnata_a = ? AND id <> ? AND inizio <> '' AND fine <> '' " +
      "AND tutto_il_giorno = 0 AND stato IN ('da_fare', 'in_corso') AND substr(inizio, 1, 10) <= ? AND substr(fine, 1, 10) >= ? ORDER BY inizio",
    v.assegnata_a, tranneId || 0, dataIso(v.fine), dataIso(v.inizio))
      .filter(a => Date.parse(a.inizio) < Date.parse(v.fine) && Date.parse(v.inizio) < Date.parse(a.fine));
    if (!altre.length) return;
    const nome = (this.db.riga('SELECT nome FROM utenti WHERE id = ?', v.assegnata_a) || {}).nome || '';
    throw new Rifiuto('Si sovrappone a: ' + altre.map(a => a.titolo + ' (' + oraBreve(a.inizio) + '-' + oraBreve(a.fine) + ')').join(', '), {
      sovrapposte: altre.map(a => ({
        id: a.id, titolo: a.titolo, inizio: dataOraIso(a.inizio), fine: dataOraIso(a.fine), assegnataA: a.assegnata_a, assegnata: nome,
      })),
      serveConferma: true,
    });
  },

  /** La checklist: l'elenco intero (quelle senza id si creano, quelle che mancano si tolgono). */
  scriviChecklist(id, lista) {
    const vecchie = new Map(this.db.righe('SELECT * FROM attivita_checklist WHERE attivita_id = ?', id).map(c => [c.id, c]));
    const tenute = new Set();
    let ordine = 0;
    for (const x of Array.isArray(lista) ? lista : []) {
      const t = testo(x && typeof x === 'object' ? x.testo : x);
      if (!t) continue;
      ordine++;
      const vecchia = x && x.id ? vecchie.get(Number(x.id)) : null;
      const fatta = x && x.fatta !== undefined ? (si(x.fatta) ? 1 : 0) : vecchia ? vecchia.fatta : 0;
      if (vecchia) {
        this.aggiorna('attivita_checklist', vecchia.id, { testo: t, fatta, ordine });
        tenute.add(vecchia.id);
      } else {
        tenute.add(this.inserisci('attivita_checklist', { attivita_id: id, testo: t, fatta, ordine }));
      }
    }
    for (const c of vecchie.values()) {
      if (tenute.has(c.id)) continue;
      this.db.esegui('DELETE FROM attivita_checklist WHERE id = ?', c.id);
      this.annota('attivita_checklist', c.id, Object.assign({}, c), null, 'tolta');
    }
  },

  /**
   * Crea o cambia un'attivita'. Con "ricorrenza" nasce una serie (questa e' la
   * prima occorrenza); su un'occorrenza "perRicorrenza" dice se il cambio vale
   * per questa, per le future o per tutte.
   */
  salvaAttivita(d) {
    d = d || {};
    const x = d.attivita || {};
    const per = testo(d.perRicorrenza || x.perRicorrenza) || 'questa';
    if (PER_RICORRENZA.indexOf(per) < 0) throw new Rifiuto('Quali occorrenze? questa, future o tutte');
    const conferma = si(d.conferma) || si(x.conferma);
    const prima = testo(x.id) ? this.rigaAttivita(x.id) : null;
    if (prima) this.controllaSua(prima, 'cambiare le attività degli altri');
    const v = this.valoriAttivita(x, prima);
    const c = this.chi();
    const io = c.utente ? c.utente.id : null;
    if (this.soloSuoi() && v.assegnata_a !== null && v.assegnata_a !== io &&
      !(prima && prima.assegnata_a === v.assegnata_a)) {
      throw senzaPermesso('assegnare attività agli altri');
    }
    if (!conferma) this.controllaSovrapposte(v, prima ? prima.id : null);
    const ora = adesso();
    let id;
    let occorrenze;
    if (!prima) {
      id = this.inserisci('attivita', Object.assign({}, v, { creata_da: io, creato: ora, modificato: ora }));
      if (x.checklist !== undefined) this.scriviChecklist(id, x.checklist);
      if (x.ricorrenza) occorrenze = this.creaSerie(id, x.ricorrenza);
    } else if (!prima.ricorrenza_id) {
      id = prima.id;
      this.aggiorna('attivita', id, Object.assign({}, v, { modificato: ora }));
      if (x.checklist !== undefined) this.scriviChecklist(id, x.checklist);
      if (x.ricorrenza) occorrenze = this.creaSerie(id, x.ricorrenza);
    } else {
      id = prima.id;
      occorrenze = this.salvaOccorrenza(prima, v, x, per);
    }
    const risposta = { ok: true, attivita: this.attivitaPerId(id) };
    if (occorrenze !== undefined) risposta.occorrenze = occorrenze;
    // Fase 5: un intervento fatto (o tolto) cambia il momento del primo intervento del ticket.
    for (const tk of new Set([prima && prima.ticket_id, v.ticket_id].filter(x => x !== null && x !== undefined))) this.ricalcolaIntervento(tk);
    return risposta;
  },

  // ------------------------------------------------------------------ ricorrenze

  regolaDa(x) {
    x = x || {};
    const regola = testo(x.regola).toLowerCase();
    if (REGOLE.indexOf(regola) < 0) throw new Rifiuto('Ripeti: giorni, settimane, mesi o anni');
    return {
      regola,
      ogni: Math.max(1, Math.round(numero(x.ogni)) || 1),
      giorni_settimana: regola === 'settimane' ? giorniSettimanaDa(x.giorniSettimana).join(',') : '',
      fine: x.fine ? dataDaIso(x.fine) : '',
    };
  },

  /** Il modello di una serie: cio' che ogni occorrenza copia, con l'ora e la durata se ha un inizio. */
  modelloDa(r) {
    const m = {};
    CAMPI_MODELLO.forEach(k => { m[k] = r[k]; });
    m.conOra = !!r.inizio;
    m.ora = r.inizio ? oraDi(r.inizio) : '';
    m.durata = r.inizio && r.fine ? minutiTra(r.inizio, r.fine) : null;
    m.checklist = this.db.righe('SELECT testo FROM attivita_checklist WHERE attivita_id = ? ORDER BY ordine, id', r.id).map(c => c.testo);
    return m;
  },

  creaSerie(id, regolaX) {
    const a = this.db.riga('SELECT * FROM attivita WHERE id = ?', id);
    const giorno = giornoDi(a);
    if (!giorno) throw new Rifiuto('Per ripetere un\'attività serve la data');
    const r = this.regolaDa(regolaX);
    if (r.fine && r.fine < giorno) throw new Rifiuto('Ripeti fino al: deve venire dopo il primo giorno');
    const ora = adesso();
    const c = this.chi();
    const ricId = this.inserisci('ricorrenze', Object.assign({}, r, {
      inizio: giorno, modello: JSON.stringify(this.modelloDa(a)), creata_da: c.utente ? c.utente.id : null, creato: ora, modificato: ora,
    }));
    this.aggiorna('attivita', id, { ricorrenza_id: ricId, occorrenza: giorno });
    this.generaOccorrenze(ricId);
    return this.contaOccorrenze(ricId);
  },

  contaOccorrenze(ricId) {
    return this.db.riga('SELECT COUNT(*) n FROM attivita WHERE ricorrenza_id = ?', ricId).n;
  },

  /** Le occorrenze che mancano, fino a 90 giorni da oggi (o alla fine della serie). */
  generaOccorrenze(ricId, finoA) {
    const ric = this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', ricId);
    if (!ric) return 0;
    const giorni = giorniDellaSerie(ric, finoA || piuGiorni(oggi(), GIORNI_AVANTI));
    const esistenti = new Set(this.db.righe('SELECT occorrenza FROM attivita WHERE ricorrenza_id = ?', ricId).map(r => r.occorrenza));
    const m = JSON.parse(ric.modello || '{}');
    let n = 0;
    for (const g of giorni) {
      if (esistenti.has(g)) continue;
      const ora = adesso();
      const v = { stato: 'da_fare', ricorrenza_id: ric.id, occorrenza: g, creata_da: ric.creata_da, creato: ora, modificato: ora };
      CAMPI_MODELLO.forEach(k => { v[k] = m[k] === undefined ? null : m[k]; });
      ['titolo', 'descrizione', 'cliente_id', 'commessa_id', 'luogo'].forEach(k => { if (v[k] === null) v[k] = ''; });
      if (!v.tipo) v.tipo = 'attivita';
      if (!v.priorita) v.priorita = 'normale';
      v.tutto_il_giorno = v.tutto_il_giorno ? 1 : 0;
      if (m.conOra) {
        v.inizio = suGiorno(g, m.ora);
        v.fine = istante(new Date(Date.parse(v.inizio) + (m.durata || 60) * 60000));
      } else {
        v.scadenza = g;
      }
      const id = this.inserisci('attivita', v);
      (m.checklist || []).forEach((t, i) => this.inserisci('attivita_checklist', { attivita_id: id, testo: t, fatta: 0, ordine: i + 1 }));
      n++;
    }
    return n;
  },

  /** Ogni notte: le serie ancora vive si allungano fino a 90 giorni da oggi. */
  allungaRicorrenze() {
    return this.db.transazione(() => {
      let n = 0;
      for (const r of this.db.righe("SELECT id FROM ricorrenze WHERE (fine = '' OR fine >= ?) AND per = 'attivita'", oggi())) n += this.generaOccorrenze(r.id);
      return n;
    });
  },

  /** Toglie (davvero) le occorrenze aperte o saltate da un giorno in poi: servono a rifare la serie. */
  togliOccorrenze(ricId, da, tranneId, nota) {
    const righe = this.db.righe("SELECT * FROM attivita WHERE ricorrenza_id = ? AND occorrenza >= ? AND id <> ? AND stato <> 'fatta'",
      ricId, da, tranneId || 0);
    const ora = adesso();
    for (const r of righe) {
      this.db.esegui('UPDATE file SET cestinato = ? WHERE attivita_id = ? AND cestinato IS NULL', ora, r.id);
      this.db.esegui('DELETE FROM attivita WHERE id = ?', r.id);
      this.annota('attivita', r.id, Object.assign({}, r), null, nota || 'tolta: la ricorrenza è cambiata');
    }
    return righe.length;
  },

  /**
   * Cambia un'occorrenza. "questa": solo lei. "future": lei e le seguenti (se
   * non e' la prima, da qui nasce una serie nuova). "tutte": tutta la serie.
   * Se cambiano solo titolo, persona, priorita', luogo, ora o durata, si
   * riportano sulle occorrenze aperte; se cambiano il giorno o la regola, le
   * occorrenze aperte da li' in poi si rifanno. Le fatte non si toccano.
   */
  salvaOccorrenza(prima, v, x, per) {
    const ora = adesso();
    if (per === 'questa') {
      this.aggiorna('attivita', prima.id, Object.assign({}, v, { modificato: ora }));
      if (x.checklist !== undefined) this.scriviChecklist(prima.id, x.checklist);
      return undefined;
    }
    const ric = this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', prima.ricorrenza_id);
    const da = per === 'tutte' ? ric.inizio : prima.occorrenza || giornoDi(prima);

    // Non si ripete piu': resta solo questa, le aperte seguenti si tolgono.
    if (x.ricorrenza === null) {
      this.aggiorna('attivita', prima.id, Object.assign({}, v, { ricorrenza_id: null, occorrenza: '', modificato: ora }));
      if (x.checklist !== undefined) this.scriviChecklist(prima.id, x.checklist);
      this.togliOccorrenze(ric.id, da, prima.id, 'tolta: la serie non si ripete più');
      this.aggiorna('ricorrenze', ric.id, { fine: piuGiorni(da, -1), modificato: ora });
      return 0;
    }

    let serie = ric;
    if (per === 'future' && da > ric.inizio) {
      // Da qui in poi una serie nuova; la vecchia finisce il giorno prima.
      const c = this.chi();
      const nuova = this.inserisci('ricorrenze', {
        regola: ric.regola, ogni: ric.ogni, giorni_settimana: ric.giorni_settimana, inizio: da, fine: ric.fine,
        modello: ric.modello, creata_da: c.utente ? c.utente.id : ric.creata_da, creato: ora, modificato: ora,
      });
      this.aggiorna('ricorrenze', ric.id, { fine: piuGiorni(da, -1), modificato: ora });
      for (const r of this.db.righe('SELECT id FROM attivita WHERE ricorrenza_id = ? AND occorrenza >= ?', ric.id, da)) {
        this.aggiorna('attivita', r.id, { ricorrenza_id: nuova });
      }
      serie = this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', nuova);
    }

    const regola = x.ricorrenza ? this.regolaDa(x.ricorrenza) : null;
    const regolaCambiata = !!regola && (regola.regola !== serie.regola || regola.ogni !== serie.ogni || regola.giorni_settimana !== serie.giorni_settimana);
    const fine = regola ? regola.fine : serie.fine;
    const giornoPrima = giornoDi(prima);
    const giornoDopo = giornoDi(v);
    if (!giornoDopo) throw new Rifiuto('Per ripetere un\'attività serve la data');
    const dataCambiata = giornoPrima !== giornoDopo || !!prima.inizio !== !!v.inizio;

    this.aggiorna('attivita', prima.id, Object.assign({}, v, { modificato: ora }));
    if (x.checklist !== undefined) this.scriviChecklist(prima.id, x.checklist);
    const dopo = this.db.riga('SELECT * FROM attivita WHERE id = ?', prima.id);
    const modello = this.modelloDa(dopo);

    if (!regolaCambiata && !dataCambiata) {
      // Lo stesso calendario: i campi cambiati passano alle altre occorrenze aperte.
      const cambiati = CAMPI_MODELLO.filter(k => String(prima[k]) !== String(dopo[k]));
      const oraCambiata = !!dopo.inizio && (oraDi(prima.inizio) !== oraDi(dopo.inizio) || minutiTra(prima.inizio, prima.fine) !== minutiTra(dopo.inizio, dopo.fine));
      const altre = this.db.righe("SELECT * FROM attivita WHERE ricorrenza_id = ? AND occorrenza >= ? AND id <> ? AND stato IN ('da_fare', 'in_corso')",
        serie.id, per === 'tutte' ? serie.inizio : da, prima.id);
      for (const r of altre) {
        const w = {};
        cambiati.forEach(k => { w[k] = dopo[k]; });
        if (oraCambiata && r.inizio) {
          w.inizio = suGiorno(dataIso(r.inizio), modello.ora);
          w.fine = istante(new Date(Date.parse(w.inizio) + modello.durata * 60000));
        }
        if (Object.keys(w).length) this.aggiorna('attivita', r.id, Object.assign(w, { modificato: ora }));
      }
      if (fine && fine < giornoDopo) throw new Rifiuto('Ripeti fino al: deve venire dopo questo giorno');
      this.aggiorna('ricorrenze', serie.id, { modello: JSON.stringify(modello), fine, modificato: ora });
      if (fine && fine !== serie.fine) this.togliOccorrenze(serie.id, piuGiorni(fine, 1), prima.id, 'tolta: la serie finisce prima');
    } else {
      // Un altro calendario: le occorrenze aperte da qui in poi si rifanno, a partire da questa.
      if (fine && fine < giornoDopo) throw new Rifiuto('Ripeti fino al: deve venire dopo il primo giorno');
      this.togliOccorrenze(serie.id, per === 'tutte' ? serie.inizio : da, prima.id);
      const r = regola || { regola: serie.regola, ogni: serie.ogni, giorni_settimana: serie.giorni_settimana, fine };
      this.aggiorna('ricorrenze', serie.id, {
        regola: r.regola, ogni: r.ogni, giorni_settimana: r.giorni_settimana, inizio: giornoDopo, fine,
        modello: JSON.stringify(modello), modificato: ora,
      });
      this.aggiorna('attivita', prima.id, { ricorrenza_id: serie.id, occorrenza: giornoDopo });
    }
    this.generaOccorrenze(serie.id);
    return this.contaOccorrenze(serie.id);
  },

  // ------------------------------------------------------------------ fatta, tolta, checklist, allegati

  faiAttivita(d) {
    const r = this.rigaAttivita(d.id);
    this.controllaSua(r, 'cambiare le attività degli altri');
    const fatta = d.fatta === undefined ? true : si(d.fatta);
    const ora = adesso();
    this.aggiorna('attivita', r.id, { stato: fatta ? 'fatta' : 'da_fare', fatta_il: fatta ? (r.stato === 'fatta' ? r.fatta_il : ora) : '', modificato: ora });
    if (r.ticket_id) this.ricalcolaIntervento(r.ticket_id);
    return { ok: true, attivita: this.attivitaPerId(r.id) };
  },

  /**
   * Toglie un'attivita' (annullata: non si cancella). Su un'occorrenza:
   * "questa" la salta e la serie continua; "future" fa finire la serie qui;
   * "tutte" toglie tutta la serie (tranne le fatte).
   */
  togliAttivita(d) {
    const r = this.rigaAttivita(d.id);
    this.controllaSua(r, 'togliere le attività degli altri');
    const per = testo(d.perRicorrenza) || 'questa';
    if (PER_RICORRENZA.indexOf(per) < 0) throw new Rifiuto('Quali occorrenze? questa, future o tutte');
    const ora = adesso();
    if (!r.ricorrenza_id || per === 'questa') {
      const tolte = r.stato === 'annullata' ? 0 : 1;
      if (tolte) this.aggiorna('attivita', r.id, { stato: 'annullata', modificato: ora });
      if (r.ticket_id) this.ricalcolaIntervento(r.ticket_id);
      return { ok: true, attivita: this.attivitaPerId(r.id), tolte };
    }
    const ric = this.db.riga('SELECT * FROM ricorrenze WHERE id = ?', r.ricorrenza_id);
    const da = per === 'tutte' ? ric.inizio : r.occorrenza;
    const righe = this.db.righe("SELECT id FROM attivita WHERE ricorrenza_id = ? AND occorrenza >= ? AND stato IN ('da_fare', 'in_corso')", ric.id, da);
    for (const x of righe) this.aggiorna('attivita', x.id, { stato: 'annullata', modificato: ora });
    this.aggiorna('ricorrenze', ric.id, { fine: piuGiorni(da, -1), modificato: ora });
    return { ok: true, attivita: this.attivitaPerId(r.id), tolte: righe.length };
  },

  spuntaChecklist(d) {
    const voce = this.db.riga('SELECT * FROM attivita_checklist WHERE id = ?', Number(d.id) || 0);
    if (!voce) throw new Rifiuto('Voce della checklist ' + testo(d.id) + ' non trovata');
    const r = this.rigaAttivita(voce.attivita_id);
    this.controllaSua(r, 'cambiare le attività degli altri');
    const fatta = d.fatta === undefined ? 1 : (si(d.fatta) ? 1 : 0);
    if (voce.fatta !== fatta) {
      this.aggiorna('attivita_checklist', voce.id, { fatta });
      this.aggiorna('attivita', r.id, { modificato: adesso() });
    }
    return { ok: true, attivita: this.attivitaPerId(r.id) };
  },

  /** Un allegato tolto va nel cestino, da cui si recupera. */
  togliAllegato(d) {
    const f = this.db.riga("SELECT * FROM file WHERE id = ? AND tipo = 'attivita'", testo(d.id));
    if (!f) throw new Rifiuto('Allegato ' + testo(d.id) + ' non trovato');
    const r = this.rigaAttivita(f.attivita_id);
    this.controllaSua(r, 'togliere gli allegati delle attività degli altri');
    if (!f.cestinato) {
      this.aggiorna('file', f.id, { cestinato: adesso() });
      this.aggiorna('attivita', r.id, { modificato: adesso() });
    }
    return { ok: true, attivita: this.attivitaPerId(r.id) };
  },
};

Object.defineProperties(module.exports, {
  giorniDellaSerie: { value: giorniDellaSerie },
  giornoAttivita: { value: giornoDi },
});
