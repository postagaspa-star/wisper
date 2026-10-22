/*
 * Ore senza rapportino, timer, approvazioni e statistiche delle ore (fase 3,
 * accordo in docs/gestionale/fase3.md, risposte in architettura.md §14).
 *
 * Chi vede e chi scrive:
 *  - un collaboratore vede e scrive solo le sue ore e il suo timer, non approva
 *    e non vede le cose degli altri;
 *  - titolare e amministrazione (col modulo in scrittura) vedono tutto,
 *    scrivono anche per gli altri e approvano;
 *  - lettura vede.
 *
 * L'approvazione (impostazione APPROVAZIONE): "collaboratori" (di base) =
 * servono le approvazioni solo per le cose scritte dai collaboratori; "tutti";
 * "nessuno". Una riga che non ha bisogno di approvazione nasce gia' approvata.
 * Le righe di ore e spese non si cancellano: si tolgono ("tolta") e si
 * rimettono con annulla.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, centesimi, adesso, oggi, piuGiorni, dataIso, dataDaIso, dataOraIso,
} = require('../utili');
const { oreDaOrari, minutiDa, oraDaMinuti, costoOrarioDi, oreDelRapportino, contaNeiConti, rimborsoTrasferta, costoCommessa } = require('../conti');

const STATI = ['bozza', 'da_approvare', 'approvata', 'respinta'];
const TIPI_ORE = ['ordinaria', 'straordinaria'];
const APPROVAZIONI = ['collaboratori', 'tutti', 'nessuno'];
const TIPI_VOCE = ['ore', 'rapportino', 'spesa', 'trasferta'];

const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const virgola = n => String(n).replace('.', ',');
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const nomeGiorno = iso => (iso ? GIORNI[new Date(iso + 'T12:00:00').getDay()] + ' ' + Number(iso.slice(8, 10)) : '');

/** Due valori uguali per il database (null e '' no: sono diversi solo se uno e' scritto). */
function diverso(a, b) {
  const n = v => (v === undefined ? null : v === true ? 1 : v === false ? 0 : v);
  a = n(a);
  b = n(b);
  if (a === b) return false;
  if (a === null || b === null) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) !== Number(b);
  return String(a) !== String(b);
}

function lunediDi(iso) {
  const d = new Date(iso + 'T12:00:00');
  return piuGiorni(iso, -((d.getDay() + 6) % 7));
}

/** Il primo e l'ultimo giorno del mese di un giorno. */
function meseDi(iso) {
  const [a, m] = iso.split('-').map(Number);
  return { da: iso.slice(0, 7) + '-01', a: dataIso(new Date(a, m, 0, 12)) };
}

/** Il periodo chiesto (da/a) o quello di base: la settimana (ore) o il mese (spese, statistiche). */
function periodoDa(d, base) {
  const da = testo(d.da) ? dataDaIso(d.da) : '';
  const a = testo(d.a) ? dataDaIso(d.a) : '';
  if (da || a) return { da, a };
  const t = oggi();
  if (base === 'settimana') return { da: lunediDi(t), a: piuGiorni(lunediDi(t), 6) };
  return meseDi(t);
}

/** I giorni da "da" ad "a" compresi (al massimo 400, per un elenco giorno per giorno). */
function giorniTra(da, a) {
  const out = [];
  for (let g = da; g && a && g <= a && out.length < 400; g = piuGiorni(g, 1)) out.push(g);
  return out;
}

/** Una voce ancora in bozza non si decide: chi l'ha scritta deve prima mandarla. */
function inBozza(v) {
  const nome = v.nome.charAt(0).toUpperCase() + v.nome.slice(1);
  return v.tipo === 'ore' ? nome + ' sono ancora in bozza: chi le ha scritte deve prima mandarle'
    : nome + ' è ancora in bozza: chi l\'ha scritta deve prima mandarla';
}

/** La mediana di un elenco di numeri. */
function mediana(l) {
  const s = l.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

module.exports = {
  // ------------------------------------------------------------------ approvazione: chi, quando

  /** collaboratori (di base) | tutti | nessuno. */
  regolaApprovazione() {
    const r = testo(this.leggiImpostazioni().APPROVAZIONE).toLowerCase();
    return APPROVAZIONI.indexOf(r) >= 0 ? r : 'collaboratori';
  },

  /** Le cose scritte da questa persona vanno approvate? */
  serveApprovazione(utenteId) {
    const regola = this.regolaApprovazione();
    if (regola === 'nessuno' || utenteId === null || utenteId === undefined) return false;
    if (regola === 'tutti') return true;
    const u = this.db.riga('SELECT ruolo FROM utenti WHERE id = ?', utenteId);
    return !!u && u.ruolo === 'collaboratore';
  },

  /**
   * Chi approva: titolare e amministrazione, col modulo in scrittura. Il
   * responsabile della commessa approvera' quando non sara' un collaboratore:
   * oggi un collaboratore non approva e non vede le cose degli altri.
   */
  puoApprovare(modulo) {
    const c = this.chi();
    if (c.sistema) return true;
    if (!c.utente || this.soloSuoi()) return false;
    return this.livello(modulo) >= 2;
  },

  /** I nomi che servono alle risposte: persone, commesse, clienti. */
  nomiFase3() {
    const a = { utenti: {}, commesse: {}, clienti: {} };
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { a.utenti[u.id] = u.nome; });
    this.db.righe('SELECT id, descrizione, cliente_id FROM commesse').forEach(m => {
      a.commesse[String(m.id).toUpperCase()] = { id: m.id, descrizione: m.descrizione, idCliente: m.cliente_id };
    });
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.clienti[s.id] = s.nome; });
    return a;
  },

  /** La commessa (oggetto di anagrafiche) e il suo cliente, o un errore se il codice non c'e'. */
  commessaPerCodice(id) {
    if (!testo(id)) return null;
    const m = this.commessa(id);
    if (!m) throw new Rifiuto('Commessa ' + testo(id) + ' non trovata');
    return m;
  },

  /** Il costo orario di adesso per una commessa (o per lo studio): si congela nella riga. */
  costoOrarioPer(commessa) {
    const cliente = commessa && commessa.idCliente ? this.soggetto(commessa.idCliente) : null;
    return costoOrarioDi(cliente, commessa, this.leggiImpostazioni());
  },

  /** Prestazione e attivita' scelte per una riga di ore o per il timer (la prestazione deve essere della commessa). */
  prestazioneEAttivita(x, prima, commessa) {
    const idPrest = x.idPrestazione !== undefined ? (testo(x.idPrestazione) ? Number(x.idPrestazione) : null) : prima ? prima.prestazione_id : null;
    const idAtt = x.idAttivita !== undefined ? (testo(x.idAttivita) ? Number(x.idAttivita) : null) : prima ? prima.attivita_id : null;
    let m = commessa;
    if (idPrest !== null) {
      const p = this.db.riga('SELECT * FROM prestazioni WHERE id = ?', idPrest);
      if (!p || (m && String(p.commessa_id).toUpperCase() !== String(m.id).toUpperCase())) {
        throw new Rifiuto('Prestazione ' + idPrest + ' non trovata' + (m ? ' in ' + m.id : ''));
      }
      if (!m) m = this.commessa(p.commessa_id);
    }
    if (idAtt !== null && !this.db.riga('SELECT id FROM attivita WHERE id = ?', idAtt)) throw new Rifiuto('Attività ' + idAtt + ' non trovata');
    return { idPrest, idAtt, commessa: m };
  },

  // ------------------------------------------------------------------ ore: lettura

  /** Un collaboratore vede solo le sue ore. */
  vedeDi(utenteId) {
    return !this.soloSuoi() || utenteId === this.chi().utente.id;
  },

  rigaOre(id) {
    const r = this.db.riga('SELECT * FROM ore WHERE id = ?', Number(id) || 0);
    if (!r || !this.vedeDi(r.utente_id)) throw new Rifiuto('Ore ' + testo(id) + ' non trovate');
    return r;
  },

  /** Perche' una riga non si cambia (o ''): approvata, per chi non approva. */
  oreBloccate(r) {
    if (r.tolta) return 'Le ore sono state tolte';
    // Fase 4: in una bozza o in una fattura le ore non cambiano.
    const frase = this.fraseSorgenteFerma('ore', r.id);
    if (frase) return frase;
    if (r.fatturata_il) return 'Fatturate fuori da Wisper il ' + dataBreve(dataIso(r.fatturata_il)) + ': non si cambiano';
    if (r.stato === 'approvata' && this.soloSuoi()) return 'Sono già approvate: per cambiarle chiedi a chi approva';
    return '';
  },

  oreDaRiga(r, a) {
    a = a || this.nomiFase3();
    const m = r.commessa_id ? a.commesse[String(r.commessa_id).toUpperCase()] : null;
    const extra = a.prestazioni || {};
    const attivita = a.attivita || {};
    const bloccata = this.oreBloccate(r);
    return {
      id: r.id, idUtente: r.utente_id, utente: a.utenti[r.utente_id] || '', data: r.data,
      inizio: r.inizio, fine: r.fine, pausaMinuti: r.pausa_minuti, ore: numero(r.ore),
      giornoDopo: !!(r.inizio && r.fine && r.fine < r.inizio),
      idCommessa: m ? m.id : r.commessa_id, commessa: m ? m.descrizione : '', idCliente: m ? m.idCliente : '',
      cliente: m && m.idCliente ? a.clienti[m.idCliente] || '' : '',
      idPrestazione: r.prestazione_id === null ? null : r.prestazione_id,
      prestazione: r.prestazione_id !== null ? extra[r.prestazione_id] || '' : '',
      idAttivita: r.attivita_id === null ? null : r.attivita_id,
      attivita: r.attivita_id !== null ? attivita[r.attivita_id] || '' : '',
      descrizione: r.descrizione, fatturabile: r.fatturabile === 1, tipo: r.tipo,
      costoOrario: numeroONull(r.costo_orario),
      costo: r.costo_orario === null ? null : centesimi(numero(r.ore) * numero(r.costo_orario)),
      stato: r.stato, approvataDa: r.approvata_da === null ? null : r.approvata_da,
      approvataDaNome: r.approvata_da ? a.utenti[r.approvata_da] || '' : '', approvataIl: dataOraIso(r.approvata_il),
      motivoRifiuto: r.motivo, dalTimer: r.dal_timer === 1, tolta: dataOraIso(r.tolta),
      puoScrivere: this.livello('rapportini') >= 2 && this.vedeDi(r.utente_id) && !bloccata,
      bloccata,
      creato: dataOraIso(r.creato), modificato: dataOraIso(r.modificato),
    };
  },

  /** I nomi delle prestazioni e delle attivita' citate da queste righe. */
  aiutiOre(righe) {
    const a = this.nomiFase3();
    a.prestazioni = {};
    a.attivita = {};
    const prest = Array.from(new Set(righe.map(r => r.prestazione_id).filter(x => x !== null)));
    const att = Array.from(new Set(righe.map(r => r.attivita_id).filter(x => x !== null)));
    if (prest.length) this.db.righe('SELECT id, nome FROM prestazioni WHERE id IN (' + prest.map(Number).join(',') + ')').forEach(p => { a.prestazioni[p.id] = p.nome; });
    if (att.length) this.db.righe('SELECT id, titolo FROM attivita WHERE id IN (' + att.map(Number).join(',') + ')').forEach(x => { a.attivita[x.id] = x.titolo; });
    return a;
  },

  orePerId(id) {
    const r = this.db.riga('SELECT * FROM ore WHERE id = ?', id);
    return r ? this.oreDaRiga(r, this.aiutiOre([r])) : null;
  },

  /** Il filtro "di chi": un collaboratore sempre e solo se stesso. */
  filtroUtente(d) {
    if (this.soloSuoi()) return this.chi().utente.id;
    const u = testo(d.utente !== undefined ? d.utente : d.idUtente);
    return u ? Number(u) : null;
  },

  /**
   * ore {da, a, utente, commessa, stato}: le righe del periodo (di base la
   * settimana di oggi), i giorni uno per uno (con le ore dei rapportini della
   * stessa persona, per la settimana come Il tuo giorno) e i totali.
   */
  leggiOre(d) {
    d = d || {};
    const { da, a } = periodoDa(d, 'settimana');
    const cond = ['tolta IS NULL'];
    const par = [];
    const utente = this.filtroUtente(d);
    if (utente !== null) { cond.push('utente_id = ?'); par.push(utente); }
    if (da) { cond.push('data >= ?'); par.push(da); }
    if (a) { cond.push('data <= ?'); par.push(a); }
    const commessa = testo(d.commessa !== undefined ? d.commessa : d.idCommessa);
    if (commessa) {
      if (commessa === 'studio') cond.push("commessa_id = ''");
      else { cond.push('commessa_id = ? COLLATE NOCASE'); par.push(commessa); }
    }
    const stato = testo(d.stato);
    if (stato && stato !== 'tutte') {
      if (STATI.indexOf(stato) < 0) throw new Rifiuto('Stato: bozza, da_approvare, approvata, respinta o tutte');
      cond.push('stato = ?');
      par.push(stato);
    }
    const righe = this.db.righe('SELECT * FROM ore WHERE ' + cond.join(' AND ') + ' ORDER BY data, inizio, id', ...par);
    const aiuti = this.aiutiOre(righe);
    const ore = righe.map(r => this.oreDaRiga(r, aiuti));

    // Le ore dei rapportini degli stessi giorni (della stessa persona), per i giorni.
    const condR = ["UPPER(stato) <> 'ANNULLATO'"];
    const parR = [];
    if (utente !== null) { condR.push('utente_id = ?'); parR.push(utente); }
    if (da) { condR.push('data >= ?'); parR.push(da); }
    if (a) { condR.push('data <= ?'); parR.push(a); }
    if (commessa) {
      if (commessa === 'studio') condR.push("id_commessa = ''");
      else { condR.push('id_commessa = ? COLLATE NOCASE'); parR.push(commessa); }
    }
    const rap = this.db.righe('SELECT data, ore_lavoro, ore_extra, ore_viaggio, ore_totali FROM rapportini WHERE ' + condR.join(' AND '), ...parR);
    const perGiorno = {};
    const oreRap = {};
    for (const o of ore) if (o.stato !== 'respinta') perGiorno[o.data] = Math.round(((perGiorno[o.data] || 0) + o.ore) * 100) / 100;
    for (const r of rap) {
      const g = dataIso(r.data);
      if (!g) continue;
      const h = numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio);
      oreRap[g] = Math.round(((oreRap[g] || 0) + h) * 100) / 100;
    }
    const giorni = da && a ? giorniTra(da, a).map(g => ({ data: g, ore: perGiorno[g] || 0, oreRapportini: oreRap[g] || 0 })) : [];
    const valide = ore.filter(o => o.stato !== 'respinta');
    const somma = l => Math.round(l.reduce((s, o) => s + o.ore, 0) * 100) / 100;
    return {
      ok: true, da, a, oreGiornaliere: numero(this.leggiImpostazioni().ORE_GIORNALIERE) || 8,
      ore, giorni,
      totali: {
        ore: somma(valide), fatturabili: somma(valide.filter(o => o.fatturabile)),
        straordinarie: somma(valide.filter(o => o.tipo === 'straordinaria')),
        oreRapportini: Math.round(Object.values(oreRap).reduce((s, x) => s + x, 0) * 100) / 100,
        daApprovare: ore.filter(o => o.stato === 'da_approvare').length,
      },
    };
  },

  // ------------------------------------------------------------------ ore: scrittura

  /**
   * salvaOre {riga: {id?, idUtente?, data, inizio?, fine?, pausaMinuti?, ore?,
   * idCommessa?, idPrestazione?, idAttivita?, descrizione?, fatturabile?, tipo?,
   * bozza?}}. Con inizio e fine le ore si calcolano (oreDaOrari, anche a cavallo
   * della mezzanotte); senza, si scrivono a mano. "bozza: true" la tiene in
   * bozza; senza, la riga va a chi approva (o e' gia' approvata, se per
   * quella persona non serve).
   */
  salvaOre(d) {
    d = d || {};
    const x = d.riga || (d.ore && typeof d.ore === 'object' ? d.ore : null) || {};
    const c = this.chi();
    const io = c.utente ? c.utente.id : null;
    const prima = testo(x.id) ? this.rigaOre(x.id) : null;
    // La stessa riga mandata due volte dalla coda del telefono (la prima risposta persa per strada):
    // c'e' gia', si restituisce quella senza farne un doppione.
    const giaArrivata = !prima && testo(x.idLocale) ? this.db.riga('SELECT id, utente_id FROM ore WHERE id_locale = ?', testo(x.idLocale)) : null;
    if (giaArrivata) {
      if (this.soloSuoi() && giaArrivata.utente_id !== io) throw senzaPermesso('vedere le ore degli altri');
      return { ok: true, riga: this.orePerId(giaArrivata.id), giaArrivata: true };
    }
    if (prima) {
      if (prima.tolta) throw new Rifiuto('Queste ore sono state tolte: rimettile prima di cambiarle');
      const b = this.oreBloccate(prima);
      if (b) throw new Rifiuto(b);
    }
    let utente = prima ? prima.utente_id : io;
    if (x.idUtente !== undefined && testo(x.idUtente) !== '' && Number(x.idUtente) !== utente) {
      if (this.soloSuoi()) throw senzaPermesso('registrare le ore degli altri');
      if (prima) throw new Rifiuto('Le ore non cambiano persona: toglile e scrivile per l\'altra persona');
      utente = Number(x.idUtente);
      if (!this.db.riga('SELECT id FROM utenti WHERE id = ?', utente)) throw new Rifiuto('Persona ' + utente + ' non trovata');
    }
    if (utente === null) throw new Rifiuto('Di chi sono queste ore? Manca la persona');

    const bozza = si(x.bozza);
    const data = x.data !== undefined && testo(x.data) ? dataDaIso(x.data) : prima ? prima.data : oggi();
    let commessa = this.commessaPerCodice(x.idCommessa !== undefined ? x.idCommessa : prima ? prima.commessa_id : '');
    const pa = this.prestazioneEAttivita(x, prima, commessa);
    commessa = pa.commessa;

    let inizio = x.inizio !== undefined ? testo(x.inizio) : prima ? prima.inizio : '';
    let fine = x.fine !== undefined ? testo(x.fine) : prima ? prima.fine : '';
    let pausa = x.pausaMinuti !== undefined ? x.pausaMinuti : prima ? prima.pausa_minuti : 0;
    let ore;
    if (inizio && fine) {
      const o = oreDaOrari(inizio, fine, pausa);
      inizio = o.inizio;
      fine = o.fine;
      pausa = o.pausaMinuti;
      ore = o.ore;
    } else {
      if ((inizio || fine) && !bozza) throw new Rifiuto('Scrivi l\'inizio e la fine, oppure solo le ore');
      if (inizio) {
        const m = minutiDa(inizio);
        if (m === null) throw new Rifiuto('Inizio: scrivi l\'ora come 8:30');
        inizio = oraDaMinuti(m);
      }
      if (fine) {
        const m = minutiDa(fine);
        if (m === null) throw new Rifiuto('Fine: scrivi l\'ora come 17:30');
        fine = oraDaMinuti(m);
      }
      pausa = 0;
      ore = x.ore !== undefined ? numero(x.ore) : prima ? numero(prima.ore) : 0;
    }
    ore = Math.round(ore * 100) / 100;
    if (!(ore >= 0) || ore > 24) throw new Rifiuto('Ore: da 0 a 24');
    if (!bozza && !(ore > 0)) throw new Rifiuto('Ore: scrivi quante ore hai lavorato');
    let tipo = x.tipo !== undefined ? testo(x.tipo).toLowerCase() || 'ordinaria' : prima ? prima.tipo : 'ordinaria';
    if (x.straordinaria !== undefined && x.tipo === undefined) tipo = si(x.straordinaria) ? 'straordinaria' : 'ordinaria';
    if (TIPI_ORE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: ordinaria o straordinaria');
    const fatturabile = x.fatturabile !== undefined ? si(x.fatturabile) : prima ? prima.fatturabile === 1 : !!commessa;
    const descrizione = x.descrizione !== undefined ? testo(x.descrizione) : prima ? prima.descrizione : '';
    const idCommessa = commessa ? commessa.id : '';
    // Il costo orario si congela alla nascita; si rifa' solo se cambia la commessa (come i rapportini).
    const stessaCommessa = prima && String(prima.commessa_id).toUpperCase() === idCommessa.toUpperCase();
    const costoOrario = stessaCommessa ? prima.costo_orario : this.costoOrarioPer(commessa);

    const v = {
      utente_id: utente, data, inizio, fine, pausa_minuti: pausa, ore, commessa_id: idCommessa, prestazione_id: pa.idPrest,
      attivita_id: pa.idAtt, descrizione, fatturabile: fatturabile ? 1 : 0, tipo, costo_orario: costoOrario,
    };
    const cambiato = !prima || Object.keys(v).some(k => diverso(prima[k], v[k]));
    Object.assign(v, this.statoDopoSalvataggio(prima, utente, bozza, cambiato));
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      this.aggiorna('ore', id, Object.assign(v, { modificato: ora }));
    } else {
      id = this.inserisci('ore', Object.assign(v, { id_locale: testo(x.idLocale) || null, creato: ora, modificato: ora }));
    }
    return { ok: true, riga: this.orePerId(id) };
  },

  /**
   * Lo stato dopo un salvataggio (ore, spese, trasferte):
   *  - "bozza: true" -> bozza;
   *  - nuova, o era in bozza, o chi l'ha scritta la cambia (anche respinta) ->
   *    da approvare, oppure approvata se per quella persona non serve;
   *  - chi approva cambia la riga di un altro -> lo stato resta quello.
   */
  statoDopoSalvataggio(prima, utente, bozza, cambiato, colonnaMotivo) {
    const io = this.chi().utente ? this.chi().utente.id : null;
    let stato;
    if (bozza) stato = 'bozza';
    else if (!prima || prima.stato === 'bozza' || (utente === io && (cambiato || prima.stato === 'respinta'))) {
      stato = this.serveApprovazione(utente) ? 'da_approvare' : 'approvata';
    } else stato = prima.stato;
    if (!prima || prima.stato === stato) return { stato };
    // Lo stato cambia: chi aveva deciso e il motivo del rifiuto non valgono piu' (restano nel registro).
    return { stato, approvata_da: null, approvata_il: '', [colonnaMotivo || 'motivo']: '' };
  },

  /** togliOre {id, annulla?}: la riga esce dagli elenchi e dai conti; annulla la rimette. */
  togliOre(d) {
    const r = this.rigaOre(d.id);
    if (!this.vedeDi(r.utente_id)) throw senzaPermesso('togliere le ore degli altri');
    if (si(d.annulla)) {
      if (r.tolta) this.aggiorna('ore', r.id, { tolta: null, modificato: adesso() });
      return { ok: true, riga: this.orePerId(r.id) };
    }
    if (r.stato === 'approvata' && this.soloSuoi()) throw new Rifiuto('Sono già approvate: per toglierle chiedi a chi approva');
    if (!r.tolta) {
      const ferma = this.oreBloccate(r);
      if (ferma) throw new Rifiuto(ferma);
    }
    if (!r.tolta) this.aggiorna('ore', r.id, { tolta: adesso(), modificato: adesso() });
    return { ok: true, riga: this.orePerId(r.id) };
  },

  // ------------------------------------------------------------------ il timer

  timerDaRiga(t) {
    if (!t) return null;
    const a = this.nomiFase3();
    const m = t.commessa_id ? a.commesse[String(t.commessa_id).toUpperCase()] : null;
    return {
      partitoIl: dataOraIso(t.partito_il), idCommessa: m ? m.id : t.commessa_id, commessa: m ? m.descrizione : '',
      idPrestazione: t.prestazione_id === null ? null : t.prestazione_id, idAttivita: t.attivita_id === null ? null : t.attivita_id,
      descrizione: t.descrizione, fatturabile: t.fatturabile === 1,
      secondi: Math.max(0, Math.floor((Date.now() - Date.parse(t.partito_il)) / 1000)),
    };
  },

  mioTimer() {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Il timer è di una persona: entra col tuo nome');
    return this.db.riga('SELECT * FROM timer WHERE utente_id = ?', c.utente.id);
  },

  /** timer {}: il proprio, acceso o no; "adesso" e' l'ora del server, per far scorrere i secondi giusti. */
  statoTimer() {
    return { ok: true, adesso: dataOraIso(adesso()), timer: this.timerDaRiga(this.mioTimer()) };
  },

  /** avviaTimer {idCommessa?, idPrestazione?, idAttivita?, descrizione?, fatturabile?}: uno per persona. */
  avviaTimer(d) {
    d = d || {};
    const acceso = this.mioTimer();
    if (acceso) {
      const t = this.timerDaRiga(acceso);
      throw new Rifiuto('Il timer è già acceso dalle ' + t.partitoIl.slice(11, 16) + (t.idCommessa ? ' (' + t.idCommessa + ')' : '') +
        ': fermalo prima di avviarne un altro', { timer: t });
    }
    let commessa = this.commessaPerCodice(d.idCommessa);
    const pa = this.prestazioneEAttivita(d, null, commessa);
    commessa = pa.commessa;
    this.inserisci('timer', {
      utente_id: this.chi().utente.id, partito_il: adesso(), commessa_id: commessa ? commessa.id : '', prestazione_id: pa.idPrest,
      attivita_id: pa.idAtt, descrizione: testo(d.descrizione), fatturabile: d.fatturabile !== undefined ? (si(d.fatturabile) ? 1 : 0) : (commessa ? 1 : 0),
    }, 'utente_id');
    return this.statoTimer();
  },

  /**
   * fermaTimer {}: la riga di ore in bozza, dal giorno e dall'ora in cui e'
   * partito fino ad adesso (anche dopo mezzanotte), da correggere e mandare con
   * salvaOre. Acceso da piu' di un giorno: la bozza ha solo l'inizio e zero
   * ore, e un avviso (non si indovinano le ore).
   */
  fermaTimer() {
    const t = this.mioTimer();
    if (!t) throw new Rifiuto('Il timer non è acceso');
    const partito = new Date(t.partito_il);
    const ms = Date.now() - partito.getTime();
    const data = dataIso(partito);
    const inizio = dataOraIso(t.partito_il).slice(11, 16);
    const fineOra = dataOraIso(adesso()).slice(11, 16);
    let fine = '';
    let ore = 0;
    let avviso = '';
    if (ms >= 24 * 3600 * 1000) {
      avviso = 'Il timer era acceso da più di un giorno: scrivi tu le ore giuste';
    } else if (fineOra !== inizio) {
      fine = fineOra;
      ore = oreDaOrari(inizio, fine, 0).ore;
    }
    const commessa = t.commessa_id ? this.commessa(t.commessa_id) : null;
    const ora = adesso();
    const id = this.inserisci('ore', {
      utente_id: t.utente_id, data, inizio, fine, pausa_minuti: 0, ore, commessa_id: commessa ? commessa.id : '',
      prestazione_id: t.prestazione_id, attivita_id: t.attivita_id, descrizione: t.descrizione, fatturabile: t.fatturabile,
      tipo: 'ordinaria', costo_orario: this.costoOrarioPer(commessa), stato: 'bozza', dal_timer: 1, creato: ora, modificato: ora,
    });
    this.db.esegui('DELETE FROM timer WHERE utente_id = ?', t.utente_id);
    this.annota('timer', t.utente_id, { partito_il: t.partito_il, commessa_id: t.commessa_id }, null, 'fermato: ore ' + id + ' in bozza');
    const r = { ok: true, riga: this.orePerId(id), timer: null };
    if (avviso) r.avviso = avviso;
    return r;
  },

  // ------------------------------------------------------------------ approvazioni

  /** Una cosa da approvare: la riga, il modulo, chi l'ha scritta, lo stato con le parole delle ore. */
  voceApprovabile(tipo, id) {
    if (TIPI_VOCE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: ore, rapportino, spesa o trasferta');
    if (tipo === 'ore') {
      const r = this.db.riga('SELECT * FROM ore WHERE id = ?', Number(id) || 0);
      if (!r || r.tolta) throw new Rifiuto('Ore ' + testo(id) + ' non trovate');
      return { tipo, r, tabella: 'ore', id: r.id, modulo: 'rapportini', autore: r.utente_id, stato: r.stato, nome: 'le ore del ' + dataBreve(r.data) };
    }
    if (tipo === 'rapportino') {
      const r = this.trovaRiga(id, id);
      if (!r) throw new Rifiuto('Rapportino ' + testo(id) + ' non trovato');
      const s = { '': 'nonServe', da_approvare: 'da_approvare', approvato: 'approvata', respinto: 'respinta' }[r.stato_approvazione || ''];
      return { tipo, r, tabella: 'rapportini', id: r.id, modulo: 'rapportini', autore: r.utente_id, stato: s, nome: 'il rapportino ' + r.id };
    }
    if (tipo === 'spesa') {
      const r = this.db.riga('SELECT * FROM spese WHERE id = ?', Number(id) || 0);
      if (!r || r.tolta) throw new Rifiuto('Spesa ' + testo(id) + ' non trovata');
      if (r.rapportino_id) throw new Rifiuto('La spesa ' + r.id + ' è nel rapportino ' + r.rapportino_id + ': si approva insieme al rapportino');
      return { tipo, r, tabella: 'spese', id: r.id, modulo: 'spese', autore: r.utente_id, stato: r.stato, nome: 'la spesa del ' + dataBreve(r.data) };
    }
    const r = this.db.riga('SELECT * FROM trasferte WHERE id = ?', Number(id) || 0);
    if (!r || r.tolta) throw new Rifiuto('Trasferta ' + testo(id) + ' non trovata');
    return { tipo, r, tabella: 'trasferte', id: r.id, modulo: 'spese', autore: r.utente_id, stato: r.stato, nome: 'la trasferta del ' + dataBreve(r.dal) };
  },

  /** Cosa la tiene ferma (gia' rimborsata, fatturata, mandata al cliente) o ''. */
  decisioneBloccata(v) {
    const r = v.r;
    // Fase 4: una cosa gia' in una bozza o in una fattura non si rimette in discussione.
    const sorgente = { ore: 'ore', rapportino: 'rapportino', spesa: 'spesa' }[v.tipo];
    if (sorgente) {
      const a = this.sorgenteAttiva(sorgente, r.id);
      if (a) return this.fraseGiaRiservata(sorgente, r.id, a).replace(/^./, c => c.toUpperCase());
    }
    if (v.tipo === 'rapportino') {
      const st = testo(r.stato).toUpperCase();
      if (st === 'INVIATO' || st === 'FATTURATO') return 'Il rapportino ' + r.id + ' è già stato mandato al cliente';
      return '';
    }
    if (r.rimborsata_il) return (v.tipo === 'trasferta' ? 'La trasferta' : 'La spesa') + ' è già stata rimborsata il ' + dataBreve(dataIso(r.rimborsata_il));
    if (r.fatturata_il) return 'La spesa è già stata fatturata il ' + dataBreve(dataIso(r.fatturata_il));
    return '';
  },

  /**
   * approva / respingi / annullaApprovazione {voci: [{tipo, id}], motivo?}.
   * Tutto o niente (una transazione). Una voce gia' nello stato voluto si salta
   * (una richiesta ripetuta dalla coda del telefono non fa danni). Il registro
   * tiene chi, quando e il motivo: e' la notifica per chi l'ha scritta, che la
   * vede anche nella sua Dashboard.
   */
  decidi(d, decisione) {
    const voci = Array.isArray(d.voci) ? d.voci : [];
    if (!voci.length) throw new Rifiuto('Scegli cosa ' + (decisione === 'approva' ? 'approvare' : decisione === 'respingi' ? 'respingere' : 'rimettere da approvare'));
    const motivo = testo(d.motivo);
    if (decisione === 'respingi' && !motivo) throw new Rifiuto('Scrivi il motivo: arriva a chi l\'ha scritta');
    const io = this.chi().utente ? this.chi().utente.id : null;
    const ora = adesso();
    const fatte = [];
    for (const x of voci) {
      const tipo = testo(x && x.tipo);
      if (TIPI_VOCE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: ore, rapportino, spesa o trasferta');
      // Prima il permesso (dal tipo), poi la riga: chi non approva non scopre nemmeno se c'e'.
      const modulo = tipo === 'ore' || tipo === 'rapportino' ? 'rapportini' : 'spese';
      if (!this.puoApprovare(modulo)) throw senzaPermesso(modulo === 'spese' ? 'approvare spese e trasferte' : 'approvare ore e rapportini');
      const v = this.voceApprovabile(tipo, x.id);
      const rap = v.tipo === 'rapportino';
      let nuovo;
      if (decisione === 'approva') {
        if (v.stato === 'approvata' || v.stato === 'nonServe') { fatte.push({ tipo: v.tipo, id: v.id, stato: v.stato === 'nonServe' ? '' : 'approvata', saltata: true }); continue; }
        if (v.stato === 'bozza') throw new Rifiuto(inBozza(v));
        nuovo = rap ? { stato_approvazione: 'approvato', approvato_da: io, approvato_il: ora, motivo: '' }
          : { stato: 'approvata', approvata_da: io, approvata_il: ora, [v.tipo === 'trasferta' ? 'motivo_rifiuto' : 'motivo']: '' };
      } else if (decisione === 'respingi') {
        if (v.stato === 'respinta' && (rap ? v.r.motivo : v.tipo === 'trasferta' ? v.r.motivo_rifiuto : v.r.motivo) === motivo) {
          fatte.push({ tipo: v.tipo, id: v.id, stato: rap ? 'respinto' : 'respinta', saltata: true });
          continue;
        }
        if (v.stato === 'bozza') throw new Rifiuto(inBozza(v));
        const b = this.decisioneBloccata(v);
        if (b) throw new Rifiuto(b + ': non si respinge più');
        nuovo = rap ? { stato_approvazione: 'respinto', approvato_da: io, approvato_il: ora, motivo }
          : { stato: 'respinta', approvata_da: io, approvata_il: ora, [v.tipo === 'trasferta' ? 'motivo_rifiuto' : 'motivo']: motivo };
      } else {
        if (v.stato === 'da_approvare') { fatte.push({ tipo: v.tipo, id: v.id, stato: 'da_approvare', saltata: true }); continue; }
        if (v.stato === 'bozza' || v.stato === 'nonServe') throw new Rifiuto('Non c\'è niente da annullare per ' + v.nome);
        const b = this.decisioneBloccata(v);
        if (b) throw new Rifiuto(b + ': non si rimette da approvare');
        nuovo = rap ? { stato_approvazione: 'da_approvare', approvato_da: null, approvato_il: '', motivo: '' }
          : { stato: 'da_approvare', approvata_da: null, approvata_il: '', [v.tipo === 'trasferta' ? 'motivo_rifiuto' : 'motivo']: '' };
      }
      this.aggiorna(v.tabella, v.id, Object.assign(nuovo, { modificato: ora }));
      if (rap) this.allineaSpeseRapportino(v.id);
      fatte.push({ tipo: v.tipo, id: v.id, stato: rap ? nuovo.stato_approvazione : nuovo.stato });
    }
    return { ok: true, fatte: fatte.filter(f => !f.saltata).length, voci: fatte.map(f => ({ tipo: f.tipo, id: f.id, stato: f.stato })) };
  },

  /**
   * daApprovare {}: per chi approva, le cose in attesa raggruppate per persona,
   * con le anomalie da guardare prima: troppe ore in un giorno (piu' di
   * ORE_GIORNALIERE + 4, contando ore registrate e rapportini), spesa senza
   * scontrino, spesa sopra i 200 euro, km diversi dal solito per la commessa.
   */
  daApprovare() {
    const ore = this.puoApprovare('rapportini');
    const spese = this.puoApprovare('spese');
    if (!ore && !spese) throw senzaPermesso('approvare ore, rapportini e spese');
    const imp = this.leggiImpostazioni();
    const soglia = (numero(imp.ORE_GIORNALIERE) || 8) + 4;
    const a = this.nomiFase3();
    const codice = id => (id ? (a.commesse[String(id).toUpperCase()] || { id }).id : '');
    const voci = [];
    const righeOre = ore ? this.db.righe("SELECT * FROM ore WHERE stato = 'da_approvare' AND tolta IS NULL") : [];
    const righeRap = ore ? this.db.righe("SELECT * FROM rapportini WHERE stato_approvazione = 'da_approvare' AND UPPER(stato) <> 'ANNULLATO'") : [];
    const righeSpese = spese ? this.db.righe("SELECT * FROM spese WHERE stato = 'da_approvare' AND tolta IS NULL AND rapportino_id IS NULL") : [];
    const righeTr = spese ? this.db.righe("SELECT * FROM trasferte WHERE stato = 'da_approvare' AND tolta IS NULL") : [];

    // Le ore di ogni persona in ogni giorno toccato: ore registrate che contano + rapportini non annullati.
    const chiave = (u, g) => u + '|' + g;
    const giorni = new Set(righeOre.map(r => chiave(r.utente_id, r.data)).concat(righeRap.map(r => chiave(r.utente_id, dataIso(r.data)))));
    const oreDelGiorno = {};
    if (giorni.size) {
      for (const r of this.db.righe("SELECT utente_id, data, ore FROM ore WHERE tolta IS NULL AND stato IN ('da_approvare', 'approvata')")) {
        const k = chiave(r.utente_id, r.data);
        if (giorni.has(k)) oreDelGiorno[k] = (oreDelGiorno[k] || 0) + numero(r.ore);
      }
      for (const r of this.db.righe("SELECT utente_id, data, ore_lavoro, ore_extra, ore_viaggio, ore_totali FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO'")) {
        const k = chiave(r.utente_id, dataIso(r.data));
        if (giorni.has(k)) oreDelGiorno[k] = (oreDelGiorno[k] || 0) + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio));
      }
    }
    const troppe = (u, g) => {
      const h = Math.round((oreDelGiorno[chiave(u, g)] || 0) * 100) / 100;
      return h > soglia ? [{ tipo: 'troppeOre', testo: virgola(h) + ' ore in un giorno' }] : [];
    };
    // I km soliti di ogni commessa: rapportini e trasferte (tranne la voce stessa), almeno due.
    const kmPerCommessa = {};
    const aggiungiKm = (commessa, chi, km) => {
      if (!commessa || !(km > 0)) return;
      const k = String(commessa).toUpperCase();
      (kmPerCommessa[k] = kmPerCommessa[k] || []).push({ chi, km });
    };
    for (const r of this.db.righe("SELECT id, id_commessa, km FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO'")) aggiungiKm(r.id_commessa, 'r' + r.id, numero(r.km));
    for (const t of this.db.righe('SELECT id, commessa_id, km, andata_ritorno FROM trasferte WHERE tolta IS NULL')) {
      aggiungiKm(t.commessa_id, 't' + t.id, rimborsoTrasferta({ km: t.km, andataRitorno: t.andata_ritorno === 1 }).kmTotali);
    }
    const kmDiversi = (commessa, chi, km) => {
      if (!commessa || !(km > 0)) return [];
      const altri = (kmPerCommessa[String(commessa).toUpperCase()] || []).filter(x => x.chi !== chi).map(x => x.km);
      if (altri.length < 2) return [];
      const solito = mediana(altri);
      return Math.abs(km - solito) > Math.max(10, solito * 0.25)
        ? [{ tipo: 'kmDiversi', testo: 'Km diversi dal solito: ' + virgola(km) + ' invece di circa ' + virgola(Math.round(solito)) }] : [];
    };
    // Le foto delle spese e dei rapportini.
    const fotoSpesa = {};
    for (const f of this.db.righe("SELECT spesa_id, rapportino_id FROM file WHERE tipo = 'spesa' AND cestinato IS NULL")) {
      if (f.spesa_id !== null) fotoSpesa[f.spesa_id] = (fotoSpesa[f.spesa_id] || 0) + 1;
      if (f.rapportino_id) fotoSpesa['r' + f.rapportino_id] = (fotoSpesa['r' + f.rapportino_id] || 0) + 1;
    }

    for (const r of righeOre) {
      voci.push({
        tipo: 'ore', id: r.id, idUtente: r.utente_id, data: r.data, cosa: 'Ore',
        dettaglio: [codice(r.commessa_id) || 'Studio', r.descrizione, nomeGiorno(r.data)].filter(Boolean).join(' · '),
        quanto: numero(r.ore), unita: 'ore', anomalie: troppe(r.utente_id, r.data),
      });
    }
    for (const r of righeRap) {
      const g = dataIso(r.data);
      const sueSpese = this.db.righe('SELECT importo FROM spese WHERE rapportino_id = ? AND tolta IS NULL', r.id);
      const anomalie = troppe(r.utente_id, g).concat(kmDiversi(r.id_commessa, 'r' + r.id, numero(r.km)));
      if (numero(r.spese) > 0 && !fotoSpesa['r' + r.id]) anomalie.push({ tipo: 'senzaFoto', testo: 'Spese senza scontrino' });
      if (sueSpese.some(s => numero(s.importo) > 200)) anomalie.push({ tipo: 'sopra200', testo: 'Una spesa sopra i 200 €' });
      voci.push({
        tipo: 'rapportino', id: r.id, idUtente: r.utente_id, data: g, cosa: 'Rapportino',
        dettaglio: [r.id, r.descrizione, nomeGiorno(g)].filter(Boolean).join(' · '),
        quanto: numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio), unita: 'ore', km: numero(r.km), anomalie,
      });
    }
    for (const r of righeSpese) {
      const anomalie = [];
      if (!fotoSpesa[r.id]) anomalie.push({ tipo: 'senzaFoto', testo: 'Senza scontrino' });
      if (numero(r.importo) > 200) anomalie.push({ tipo: 'sopra200', testo: 'Spesa sopra i 200 €' });
      voci.push({
        tipo: 'spesa', id: r.id, idUtente: r.utente_id, data: r.data, cosa: 'Spesa',
        dettaglio: [r.descrizione || r.categoria, codice(r.commessa_id) || 'senza commessa', nomeGiorno(r.data)].join(' · '),
        quanto: numero(r.importo), unita: 'euro', anomalie,
      });
    }
    for (const t of righeTr) {
      const conto = rimborsoTrasferta({ km: t.km, andataRitorno: t.andata_ritorno === 1, euroKm: t.euro_km, indennita: t.indennita });
      voci.push({
        tipo: 'trasferta', id: t.id, idUtente: t.utente_id, data: t.dal, cosa: 'Trasferta',
        dettaglio: [t.destinazione, codice(t.commessa_id), nomeGiorno(t.dal)].filter(Boolean).join(' · '),
        quanto: conto.totale, unita: 'euro', km: conto.kmTotali, anomalie: kmDiversi(t.commessa_id, 't' + t.id, conto.kmTotali),
      });
    }
    const persone = {};
    for (const v of voci) {
      const k = v.idUtente === null ? 'nessuno' : v.idUtente;
      const p = persone[k] || (persone[k] = { idUtente: v.idUtente, nome: v.idUtente ? a.utenti[v.idUtente] || '' : 'Senza persona', quante: 0, conAnomalie: 0, voci: [] });
      p.quante++;
      if (v.anomalie.length) p.conAnomalie++;
      p.voci.push(v);
    }
    const elenco = Object.values(persone).sort((x, y) => (x.nome < y.nome ? -1 : 1));
    const ordine = { ore: 0, rapportino: 1, spesa: 2, trasferta: 3 };
    elenco.forEach(p => p.voci.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : ordine[x.tipo] - ordine[y.tipo])));
    return { ok: true, oggi: oggi(), quante: voci.length, conAnomalie: voci.filter(v => v.anomalie.length).length, persone: elenco };
  },

  // ------------------------------------------------------------------ statistiche

  /**
   * statisticheOre {da, a, per: persona|commessa}: ore totali, fatturabili,
   * percentuale e costo, dai rapportini (non annullati, non respinti) e dalle
   * ore registrate (mandate o approvate). Il costo solo con "costi"; un
   * collaboratore vede solo le sue.
   */
  statisticheOre(d) {
    d = d || {};
    const { da, a } = periodoDa(d, 'mese');
    const per = testo(d.per) || 'persona';
    if (per !== 'persona' && per !== 'commessa') throw new Rifiuto('Per: persona o commessa');
    const io = this.soloSuoi() ? this.chi().utente.id : null;
    const nomi = this.nomiFase3();
    const imp = this.leggiImpostazioni();
    const dentro = g => g && (!da || g >= da) && (!a || g <= a);
    const costoOggi = {};
    const costoDi = idCommessa => {
      const k = String(idCommessa || '').toUpperCase();
      if (!(k in costoOggi)) {
        const m = k ? this.commessa(idCommessa) : null;
        costoOggi[k] = m ? this.costoOrarioPer(m) : costoOrarioDi(null, null, imp);
      }
      return costoOggi[k];
    };
    const gruppi = {};
    const gruppo = (k, nome, extra) => gruppi[k] || (gruppi[k] = Object.assign({
      chiave: k, nome, ore: 0, fatturabili: 0, percentuale: null, oreRapportini: 0, oreRegistrate: 0, costo: 0, costoNoto: true,
    }, extra || {}));
    const perCommessa = id => {
      const m = id ? nomi.commesse[String(id).toUpperCase()] : null;
      return m ? gruppo(m.id, m.descrizione, { idCliente: m.idCliente, cliente: nomi.clienti[m.idCliente] || '' })
        : gruppo('', 'Attività dello studio', { idCliente: '', cliente: '' });
    };
    const aggiungi = (g, ore, fatturabili, costo, daRapportino) => {
      g.ore += ore;
      g.fatturabili += fatturabili;
      if (daRapportino) g.oreRapportini += ore;
      else g.oreRegistrate += ore;
      if (costo === null) g.costoNoto = false;
      else g.costo += costo;
    };
    for (const r of this.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO' AND stato_approvazione <> 'respinto'")) {
      if (!dentro(dataIso(r.data)) || (io !== null && r.utente_id !== io)) continue;
      const x = oreDelRapportino({
        oreLavoro: r.ore_lavoro, oreExtra: r.ore_extra, oreViaggio: r.ore_viaggio, oreTotali: r.ore_totali,
        pagaViaggio: r.paga_viaggio === 1, costoOrario: r.costo_orario,
      }, costoDi(r.id_commessa));
      const g = per === 'persona'
        ? (r.utente_id !== null ? gruppo(r.utente_id, nomi.utenti[r.utente_id] || '') : gruppo('foglio:' + testo(r.tecnico), testo(r.tecnico) || 'Senza persona'))
        : perCommessa(r.id_commessa);
      aggiungi(g, x.ore, x.fatturabili, x.costo, true);
    }
    for (const o of this.db.righe('SELECT * FROM ore WHERE tolta IS NULL')) {
      if (!contaNeiConti(o) || !dentro(o.data) || (io !== null && o.utente_id !== io)) continue;
      const co = o.costo_orario !== null ? numero(o.costo_orario) : costoDi(o.commessa_id);
      const g = per === 'persona' ? gruppo(o.utente_id, nomi.utenti[o.utente_id] || '') : perCommessa(o.commessa_id);
      aggiungi(g, numero(o.ore), o.fatturabile === 1 ? numero(o.ore) : 0, co === null ? null : centesimi(numero(o.ore) * co), false);
    }
    const pulisci = g => {
      ['ore', 'fatturabili', 'oreRapportini', 'oreRegistrate'].forEach(k => { g[k] = Math.round(g[k] * 100) / 100; });
      g.costo = centesimi(g.costo);
      g.percentuale = g.ore > 0 ? Math.round(g.fatturabili / g.ore * 100) : null;
      return g;
    };
    const righe = Object.values(gruppi).map(pulisci).sort((x, y) => y.ore - x.ore || (x.nome < y.nome ? -1 : 1));
    const totale = pulisci(righe.reduce((t, g) => {
      t.ore += g.ore; t.fatturabili += g.fatturabili; t.oreRapportini += g.oreRapportini; t.oreRegistrate += g.oreRegistrate;
      t.costo += g.costo; t.costoNoto = t.costoNoto && g.costoNoto;
      return t;
    }, { ore: 0, fatturabili: 0, percentuale: null, oreRapportini: 0, oreRegistrate: 0, costo: 0, costoNoto: true }));
    return { ok: true, da, a, per, righe, totale };
  },

  /**
   * costoCommessa {idCommessa}: il costo della commessa come lo conta il
   * server dalla fase 3 (costoCommessa in conti.js). Tutto l'oggetto e' "soldi":
   * senza "costi" la risposta ha solo idCommessa.
   */
  costoDellaCommessa(d) {
    const m = this.commessaPerCodice(d.idCommessa || d.id);
    if (!m) throw new Rifiuto('Commessa: scegli la commessa');
    if (this.soloSuoi() && !this.mieCommesse().has(String(m.id).toUpperCase())) throw senzaPermesso('vedere i costi di questa commessa');
    const id = m.id;
    const aiuti = this.aiutiRapportini();
    const rapportini = this.db.righe('SELECT * FROM rapportini WHERE id_commessa = ? COLLATE NOCASE', id).map(r => this.rapportinoDaRiga(r, aiuti));
    const ore = this.db.righe('SELECT * FROM ore WHERE commessa_id = ? COLLATE NOCASE', id)
      .map(o => ({ idCommessa: o.commessa_id, ore: o.ore, costoOrario: o.costo_orario, stato: o.stato, tolta: o.tolta }));
    const spese = this.db.righe('SELECT * FROM spese WHERE commessa_id = ? COLLATE NOCASE', id)
      .map(s => ({ idCommessa: s.commessa_id, importo: s.importo, destinazione: s.destinazione, stato: s.stato, idRapportino: s.rapportino_id || '', tolta: s.tolta }));
    const trasferte = this.db.righe('SELECT * FROM trasferte WHERE commessa_id = ? COLLATE NOCASE', id)
      .map(t => ({ idCommessa: t.commessa_id, km: t.km, andataRitorno: t.andata_ritorno === 1, euroKm: t.euro_km, indennita: t.indennita, stato: t.stato, tolta: t.tolta }));
    const cliente = m.idCliente ? this.soggetto(m.idCliente) : null;
    return {
      ok: true, idCommessa: id,
      costoCommessa: costoCommessa({ commessa: m, cliente, impostazioni: this.leggiImpostazioni(), rapportini, ore, spese, trasferte }),
    };
  },
};

Object.defineProperties(module.exports, {
  periodoDa: { value: periodoDa },
  diverso: { value: diverso },
  lunediDi: { value: lunediDi },
  nomeGiorno: { value: nomeGiorno },
  STATI_APPROVAZIONE: { value: STATI },
});
