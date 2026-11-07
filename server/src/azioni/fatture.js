/*
 * Fatturazione (fase 4, accordo in docs/gestionale/fase4.md, risposte in
 * architettura.md §15): Da fatturare, bozze e righe, stati, passaggio al
 * programma, note di credito, scadenze di pagamento delle commesse, riepilogo.
 * Il ritorno dell'XML e le fatture ricevute sono in ritorno.js; incassi,
 * pagamenti e scadenziario in banche.js.
 *
 * Le regole che non si discutono:
 *  - Wisper PREPARA, il programma di Manuel EMETTE: una bozza non ha mai un
 *    numero fiscale inventato (il numero arriva dall'XML o lo scrive Manuel).
 *  - Una cosa si fattura UNA VOLTA SOLA: ogni sorgente entra in una fattura solo
 *    da fattura_sorgenti, e l'indice unico del database (fattura_sorgenti_una)
 *    rifiuta la stessa sorgente in due fatture vive, anche in due salvataggi
 *    nello stesso istante. Il codice controlla prima per dire una frase chiara;
 *    la garanzia e' il database.
 *  - I conti li fa solo contiFattura (conti.js), coi parametri fiscali congelati
 *    nella fattura quando nasce.
 */
'use strict';

const {
  Rifiuto, senzaPermesso, testo, numero, numeroONull, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso,
} = require('../utili');
const C = require('../conti');
const passaggio = require('../passaggio');
const { etichettaPreventivo } = require('./preventivi');

const si = v => v === true || v === 1 || v === '1' || v === 'true' || v === 'SI' || v === 'si' || v === 'Sì';
const vuoto = v => v === undefined || v === null || v === '';
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
/** "domenica 1 novembre". */
const giornoLungo = iso => (iso ? GIORNI[new Date(iso + 'T12:00:00').getDay()] + ' ' + Number(iso.slice(8, 10)) + ' ' + C.MESI[Number(iso.slice(5, 7)) - 1] : '');
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
const STATI = ['bozza', 'pronta', 'emessa', 'scartata', 'annullata'];
const VIVE = ['bozza', 'pronta'];
// Fase 5: il ticket chiuso "una riga per l'intervento" (fase5.md §7.6) e' una sorgente come le altre, con lo stesso indice unico.
const TIPI_SORGENTE = ['scadenza', 'rapportino', 'spesa', 'ore', 'ticket'];
const RIFERIMENTO_N1 = 'Escluse ex art. 15 DPR 633/72';
const RIFERIMENTO_FORFETTARIO = 'Operazione in franchigia da IVA (regime forfettario)';

/** "…4521": le ultime quattro cifre di un IBAN (nelle schermate non si mostra intero). */
const ultimeCifre = iban => (testo(iban) ? testo(iban).replace(/\s/g, '').slice(-4) : '');
const ibanCoperto = iban => (testo(iban) ? testo(iban).replace(/\s/g, '').slice(0, 2).toUpperCase() + '…' + ultimeCifre(iban) : '');

/** Il cliente: nome e cognome di un privato (l'ultima parola e' il cognome). */
function nomeECognome(nome) {
  const parti = testo(nome).split(/\s+/).filter(Boolean);
  if (parti.length < 2) return { nome: parti[0] || '', cognome: parti[0] || '' };
  return { nome: parti.slice(0, -1).join(' '), cognome: parti[parti.length - 1] };
}

/** Una partita IVA per confrontarla (senza IT, spazi e punti). */
const chiavePiva = v => testo(v).toUpperCase().replace(/[\s.\-]/g, '').replace(/^IT(?=\d{11}$)/, '');

module.exports = {
  // ------------------------------------------------------------------ regole, soggetti, conti in banca

  /** La conferma del commercialista ({data, commercialista, da}) o null. */
  regoleConfermate() {
    const r = this.leggiImpostazioni().REGOLE_FISCALI_CONFERMATE;
    return r && typeof r === 'object' && r.data ? r : null;
  },

  /** Il cliente e' sostituto d'imposta: scritto a mano (0/1), se no automatico (si' con la partita IVA). */
  sostitutoDi(s) {
    if (!s) return false;
    if (s.sostituto_imposta === 0 || s.sostituto_imposta === 1) return s.sostituto_imposta === 1;
    return !!chiavePiva(s.partita_iva);
  },

  /** Come si raggruppano i rapportini di un cliente: per mese i clienti a tariffa fissa, uno per riga gli altri. */
  raggruppaDi(s) {
    return s && s.tariffa_fissa !== null && s.tariffa_fissa !== undefined && s.tariffa_fissa !== '' ? 'mese' : 'rapportino';
  },

  contoPredefinito() {
    return this.db.riga('SELECT * FROM conti WHERE predefinito = 1 AND attivo = 1') ||
      this.db.riga('SELECT * FROM conti WHERE attivo = 1 ORDER BY id LIMIT 1');
  },

  /**
   * Il conto su cui farsi pagare la fattura. Una bozza nata quando i conti non c'erano ancora (conto_id vuoto) prende il
   * predefinito di oggi: il conto scritto dopo in Banche vale anche per lei. Passando al programma il conto si fissa nella
   * fattura (passaAlProgramma). conti: la mappa id -> conto degli elenchi, se c'e'.
   */
  contoDellaFattura(f, conti) {
    if (f.conto_id) return conti ? conti[f.conto_id] || null : this.db.riga('SELECT * FROM conti WHERE id = ?', f.conto_id);
    if (f.stato !== 'bozza') return null;
    return this.ricordata('contoPredefinito', () => this.contoPredefinito()) || null;
  },

  /** "Conto studio …4521". */
  nomeConto(c) {
    if (!c) return '';
    return testo(c.nome) + (ultimeCifre(c.iban) ? ' …' + ultimeCifre(c.iban) : '');
  },

  // ------------------------------------------------------------------ sorgenti: chi e' gia' in una fattura

  /** Le sorgenti attive (riservate o fatturate): "tipo|id" -> {fattura, gruppo}. */
  sorgentiAttive() {
    const m = new Map();
    for (const r of this.db.righe(
      'SELECT s.tipo, s.sorgente_id, s.gruppo, s.fattura_id, f.stato, f.riferimento, f.numero, f.cliente_id, f.tipo tipo_fattura FROM fattura_sorgenti s JOIN fatture f ON f.id = s.fattura_id WHERE s.attiva = 1')) {
      m.set(r.tipo + '|' + r.sorgente_id, r);
    }
    return m;
  },

  sorgenteAttiva(tipo, id) {
    return this.db.riga(
      'SELECT s.*, f.stato, f.riferimento, f.numero, f.cliente_id, f.tipo tipo_fattura FROM fattura_sorgenti s JOIN fatture f ON f.id = s.fattura_id WHERE s.attiva = 1 AND s.tipo = ? AND s.sorgente_id = ?',
      tipo, String(id));
  },

  /** Come si chiama una sorgente nelle frasi: "Il rapportino RAP/2026/0142", "La spesa «Pedaggio» del 21/10"... */
  nomeSorgente(tipo, id, breve) {
    if (tipo === 'rapportino') return breve ? String(id) : 'Il rapportino ' + id;
    if (tipo === 'ticket') return breve ? String(id) : 'Il ticket ' + id;
    if (tipo === 'scadenza') {
      const s = this.db.riga('SELECT descrizione, commessa_id FROM scadenze_pagamento WHERE id = ?', Number(id) || 0);
      return s ? (breve ? '«' + s.descrizione + '» di ' + s.commessa_id : 'La scadenza «' + s.descrizione + '» di ' + s.commessa_id) : 'La scadenza ' + id;
    }
    if (tipo === 'spesa') {
      const s = this.db.riga('SELECT descrizione, data FROM spese WHERE id = ?', Number(id) || 0);
      return s ? 'La spesa «' + (s.descrizione || 'senza descrizione') + '» del ' + dataBreve(s.data) : 'La spesa ' + id;
    }
    const o = this.db.riga('SELECT data, commessa_id FROM ore WHERE id = ?', Number(id) || 0);
    return o ? 'Le ore del ' + dataBreve(o.data) + ' su ' + o.commessa_id : 'Le ore ' + id;
  },

  /** "nella bozza W-15 per Rossi Impianti Srl" / "nella fattura 45/2026". */
  doveSta(a) {
    if (VIVE.indexOf(a.stato) >= 0) {
      const cliente = this.db.riga('SELECT nome FROM soggetti WHERE id = ?', a.cliente_id);
      return 'nella ' + (a.stato === 'pronta' ? 'fattura ' + a.riferimento + ' (già passata al programma)' : 'bozza ' + a.riferimento) +
        ' per ' + (cliente ? cliente.nome : a.cliente_id);
    }
    return 'nella fattura ' + (a.numero || a.riferimento);
  },

  /** La frase di §4.4: "RAP/2026/0142 è già nella bozza W-15 per Rossi Impianti Srl". */
  fraseGiaRiservata(tipo, id, a) {
    a = a || this.sorgenteAttiva(tipo, id);
    const plurale = tipo === 'ore';
    return this.nomeSorgente(tipo, id, true) + (plurale ? ' sono già ' : ' è già ') + (a ? this.doveSta(a) : 'in una fattura');
  },

  /**
   * Una sorgente riservata o fatturata non si cambia (§7.3). Le frasi dicono
   * dove sta e cosa fare: toglierla dalla bozza, o fare una nota di credito.
   */
  controllaSorgenteLibera(tipo, id) {
    const frase = this.fraseSorgenteFerma(tipo, id);
    if (frase) throw new Rifiuto(frase);
    if (tipo === 'scadenza') {
      const s = this.db.riga('SELECT stato FROM scadenze_pagamento WHERE id = ?', Number(id) || 0);
      if (s && s.stato === 'fatturata') throw new Rifiuto(this.nomeSorgente(tipo, id) + ' è già fatturata fuori da Wisper');
    }
  },

  /** La frase di §7.3 se la sorgente sta in una bozza o in una fattura, se no ''. */
  fraseSorgenteFerma(tipo, id) {
    const a = this.sorgenteAttiva(tipo, id);
    if (!a) return '';
    const nome = this.nomeSorgente(tipo, id);
    const f = { rapportino: ['è', 'toglilo', 'cambiarlo'], ticket: ['è', 'toglilo', 'cambiarlo'], scadenza: ['è', 'toglila', 'cambiarla'], spesa: ['è', 'toglila', 'cambiarla'], ore: ['sono', 'toglile', 'cambiarle'] }[tipo];
    if (VIVE.indexOf(a.stato) >= 0) return nome + ' ' + f[0] + ' ' + this.doveSta(a) + ': ' + f[1] + ' prima dalla bozza';
    return nome + ' ' + f[0] + ' ' + this.doveSta(a) + ': per ' + f[2] + ' serve una nota di credito';
  },

  // ------------------------------------------------------------------ Da fatturare: le sorgenti libere (§5.1)

  /**
   * Tutto quello che si puo' fatturare adesso (anche "piu' avanti"), una voce
   * per sorgente: scadenze di pagamento, lavori dei rapportini da inviare o inviati
   * (non di una commessa a corpo), spese al cliente, ore fatturabili. Le riservate e le
   * fatturate non ci sono.
   */
  sorgentiDaFatturare(filtro) {
    const f = filtro || {};
    const t = oggi();
    const attive = this.sorgentiAttive();
    const libera = (tipo, id) => !attive.has(tipo + '|' + id);
    const commesse = {};
    this.db.righe('SELECT * FROM commesse').forEach(m => { commesse[String(m.id).toUpperCase()] = m; });
    const soggetti = {};
    this.db.righe('SELECT * FROM soggetti').forEach(s => { soggetti[s.id] = s; });
    const contratti = {};
    this.db.righe('SELECT id, numero, revisione FROM preventivi').forEach(p => { contratti[p.id] = etichettaPreventivo(p); });
    const commessaDi = id => (id ? commesse[String(id).toUpperCase()] || null : null);
    const fattura_a_ore = m => !m || m.modo_fatturazione !== 'corpo';
    const voci = [];
    // Fase 5 (§3.4): le cose di un ticket aspettano la sua chiusura; chiuso "una riga" stanno dentro la voce del ticket,
    // "separati" sono sorgenti normali, "contratto" mai (tranne le spese al cliente se i materiali non sono compresi,
    // e le anticipazioni), "no" mai. Un ticket annullato non trattiene niente.
    const tickets = {};
    this.ticketConContratto().forEach(t => { tickets[t.id] = t; });
    const fuoriPerTicket = (idTicket, tipo, anticipazione) => {
      const t = idTicket !== null && idTicket !== undefined ? tickets[idTicket] : null;
      if (!t || t.stato === 'annullato') return false;
      if (t.stato !== 'chiuso') return true;
      if (t.fatturazione === 'separati' || t.fatturazione === '') return false;
      if (t.fatturazione === 'contratto') return tipo === 'spesa' ? !anticipazione && t.materiali_inclusi === 1 : true;
      return true;
    };

    // Scadenze di pagamento delle commesse (acconti, avanzamenti, saldo).
    for (const s of this.db.righe("SELECT * FROM scadenze_pagamento WHERE commessa_id <> '' AND stato = 'prevista' ORDER BY commessa_id, ordine, id")) {
      const m = commessaDi(s.commessa_id);
      if (!m || m.archiviata === 1 || !libera('scadenza', s.id)) continue;
      let pronta = true;
      if (s.quando === 'fine') pronta = String(m.stato).toUpperCase() === 'CHIUSA';
      else if (s.quando === 'data') pronta = !!s.data && s.data <= C.giorniDopo(t, 15);
      // Fase 5: la rata del canone di un contratto d'assistenza porta il numero del contratto (CA/2026/002).
      const ca = s.contratto_id ? this.db.riga('SELECT numero FROM contratti WHERE id = ?', s.contratto_id) : null;
      const contratto = s.preventivo_id ? contratti[s.preventivo_id] || '' : ca ? ca.numero : '';
      voci.push({
        tipo: 'scadenza', id: s.id, idCliente: m.cliente_id, idCommessa: m.id, data: s.data || '', titolo: s.descrizione,
        dettaglio: [m.id, m.descrizione, contratto].filter(Boolean).join(' · '), quando: s.quando, pronta,
        importo: centesimi(numero(s.importo)), anticipazione: false, gruppo: 'commessa:' + m.id, riga: s, commessa: m, contratto,
      });
    }

    // I lavori dei rapportini Da inviare (BOZZA, e il FIRMATO di prima) o inviati, approvati se serviva, non di una commessa
    // a corpo. 06/11/2026: niente firma, un lavoro si fattura anche prima di mandarlo al cliente.
    const rapportini = {};
    for (const r of this.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) IN ('BOZZA', 'FIRMATO', 'INVIATO') AND stato_approvazione IN ('', 'approvato')")) {
      rapportini[r.id] = r;
    }
    const speseDeiRapportini = {};
    this.db.righe('SELECT rapportino_id, COUNT(*) n FROM spese WHERE rapportino_id IS NOT NULL GROUP BY rapportino_id')
      .forEach(x => { speseDeiRapportini[x.rapportino_id] = x.n; });
    const elencati = {};
    for (const r of Object.values(rapportini)) {
      const m = commessaDi(r.id_commessa);
      if (!testo(r.id_cliente) || !fattura_a_ore(m) || !libera('rapportino', r.id)) continue;
      if (fuoriPerTicket(r.ticket_id, 'rapportino')) continue;
      // Un rapportino di prima della fase 3 con spese e nessuna riga di spese le porta nel suo importo (§5.1).
      const speseSenzaRighe = numero(r.spese) > 0 && !speseDeiRapportini[r.id] ? centesimi(numero(r.spese)) : 0;
      const ore = C.orePagate({ oreLavoro: r.ore_lavoro, oreExtra: r.ore_extra, oreViaggio: r.ore_viaggio, pagaViaggio: r.paga_viaggio === 1 });
      // 06/11/2026: col progetto il suo codice ("progetto ED-003 · 6 ore · 40 km"), senza quello della commessa.
      const dettaglio = [testo(r.progetto) ? C.testoProgetti([testo(r.progetto)]) : testo(r.id_commessa), ore > 0 ? C.numeroIt(ore) + (ore === 1 ? ' ora' : ' ore') : '',
        numero(r.km) > 0 && numero(r.rimborso_km) > 0 ? C.numeroIt(r.km) + ' km' : ''].filter(Boolean).join(' · ');
      const v = {
        // 06/11/2026: il numero che si vede e' quello del rapportino (la giornata), non quello del lavoro.
        tipo: 'rapportino', id: r.id, idCliente: r.id_cliente, idCommessa: testo(r.id_commessa), data: dataIso(r.data), titolo: testo(r.descrizione) || 'Rapportino ' + (testo(r.id_giornata) || r.id),
        dettaglio, pronta: true, importo: centesimi(numero(r.compenso_ore) + numero(r.rimborso_km) + speseSenzaRighe),
        anticipazione: false, gruppo: 'rapportini:' + r.id_cliente + ':' + String(dataIso(r.data)).slice(0, 7), riga: r, speseSenzaRighe, spese: [],
      };
      elencati[r.id] = v;
      voci.push(v);
    }

    // Spese al cliente, approvate, non ancora fatturate. Quelle di un rapportino vanno con lui.
    for (const s of this.db.righe("SELECT * FROM spese WHERE destinazione = 'cliente' AND stato = 'approvata' AND fatturata_il = '' AND tolta IS NULL ORDER BY data, id")) {
      if (!libera('spesa', s.id)) continue;
      if (fuoriPerTicket(s.ticket_id, 'spesa', s.anticipazione === 1)) continue;
      let idCliente = testo(s.cliente_id);
      const m = commessaDi(s.commessa_id);
      if (!idCliente && m) idCliente = m.cliente_id;
      let delRapportino = null;
      let progetto = '';
      if (s.rapportino_id) {
        const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', s.rapportino_id);
        if (!r || ['BOZZA', 'FIRMATO', 'INVIATO'].indexOf(testo(r.stato).toUpperCase() || 'BOZZA') < 0 || ['', 'approvato'].indexOf(r.stato_approvazione || '') < 0) continue;
        if (!idCliente) idCliente = testo(r.id_cliente);
        delRapportino = elencati[r.id] || null;
        progetto = testo(r.progetto);
      }
      if (!idCliente || !soggetti[idCliente]) continue;
      const v = {
        tipo: 'spesa', id: s.id, idCliente, idCommessa: m ? m.id : testo(s.commessa_id), idRapportino: delRapportino ? delRapportino.id : '',
        // 06/11/2026: la spesa di un rapportino col progetto dice il progetto, come il suo rapportino.
        data: s.data, titolo: s.descrizione || 'Spesa', dettaglio: [progetto ? C.testoProgetti([progetto]) : m ? m.id : '', s.anticipazione === 1 ? 'ricevuta intestata al cliente' : s.categoria].filter(Boolean).join(' · '),
        pronta: true, importo: centesimi(numero(s.importo)), anticipazione: s.anticipazione === 1,
        gruppo: delRapportino ? delRapportino.gruppo : (m ? 'commessa:' + m.id : 'spese:' + idCliente), riga: s,
      };
      if (delRapportino) delRapportino.spese.push(s.id);
      voci.push(v);
    }

    // Ore registrate fatturabili, approvate, di una commessa a ore o mista.
    for (const o of this.db.righe("SELECT * FROM ore WHERE fatturabile = 1 AND stato = 'approvata' AND fatturata_il = '' AND tolta IS NULL AND commessa_id <> '' ORDER BY data, id")) {
      const m = commessaDi(o.commessa_id);
      if (!m || !fattura_a_ore(m) || !libera('ore', o.id) || !soggetti[m.cliente_id]) continue;
      if (fuoriPerTicket(o.ticket_id, 'ore')) continue;
      const cliente = soggetti[m.cliente_id];
      const prezzo = C.prezzoOrarioDi({ tariffaFissa: cliente.tariffa_fissa }, { prezzoOrario: m.prezzo_orario });
      const ore = Math.round(numero(o.ore) * 100) / 100;
      voci.push({
        tipo: 'ore', id: o.id, idCliente: m.cliente_id, idCommessa: m.id, data: o.data, titolo: o.descrizione || 'Ore di lavoro',
        dettaglio: m.id + ' · ' + C.numeroIt(ore) + (ore === 1 ? ' ora' : ' ore') + (prezzo !== null ? ' × ' + C.euroIt(prezzo) + ' €' : ' · senza prezzo'),
        pronta: true, importo: prezzo !== null ? centesimi(ore * prezzo) : 0, senzaPrezzo: prezzo === null, prezzo,
        anticipazione: false, gruppo: 'ore:' + m.id + ':' + String(o.data).slice(0, 7), riga: o, commessa: m,
      });
    }
    // Fase 5: i ticket chiusi "una riga per l'intervento", non riservati e non fatturati. Le loro spese anticipate
    // seguono la voce (una voce "spesa" ciascuna, col gruppo del ticket), come le spese di un rapportino.
    for (const t of Object.values(tickets)) {
      if (t.stato !== 'chiuso' || t.fatturazione !== 'ticket' || t.fatturato_il || !libera('ticket', t.numero) || !soggetti[t.cliente_id]) continue;
      const vt = this.voceTicket(t);
      const m = commessaDi(t.commessa_id);
      const v = {
        tipo: 'ticket', id: t.numero, idTicket: t.id, idCliente: t.cliente_id, idCommessa: m ? m.id : testo(t.commessa_id), data: dataIso(t.risolto_il) || dataIso(t.chiuso_il),
        titolo: t.titolo, dettaglio: vt.dettaglio, pronta: vt.pronta, perche: vt.perche, importo: vt.importo, aCorpo: vt.aCorpo, dentro: vt.dentro,
        spese: vt.anticipazioni.map(s => s.id), senzaPrezzo: vt.senzaPrezzo, anticipazione: false, gruppo: vt.gruppo, riga: t, voceTicket: vt,
      };
      voci.push(v);
      for (const s of vt.anticipazioni) {
        if (!libera('spesa', s.id)) continue;
        voci.push({
          tipo: 'spesa', id: s.id, idCliente: t.cliente_id, idCommessa: v.idCommessa, idTicket: t.numero, data: s.data, titolo: s.descrizione || 'Spesa',
          dettaglio: [v.idCommessa, 'ricevuta intestata al cliente'].filter(Boolean).join(' · '), pronta: vt.pronta, importo: centesimi(numero(s.importo)),
          anticipazione: true, gruppo: vt.gruppo, riga: s,
        });
      }
    }
    for (const v of voci) {
      if (v.tipo === 'rapportino') v.totaleConSpese = centesimi(v.importo + voci.filter(s => s.tipo === 'spesa' && s.idRapportino === v.id && !s.anticipazione)
        .reduce((x, s) => x + s.importo, 0));
    }
    return voci.filter(v => (!testo(f.idCliente) || v.idCliente === testo(f.idCliente)) &&
      (!testo(f.idCommessa) || String(v.idCommessa).toUpperCase() === testo(f.idCommessa).toUpperCase()));
  },

  /** Cosa servira' al passaggio per questo cliente (§8.2), per saperlo prima. */
  mancanoCliente(s) {
    const m = [];
    if (!s) return m;
    const italiano = !testo(s.nazione) || testo(s.nazione).toUpperCase() === 'IT';
    if (!chiavePiva(s.partita_iva) && !testo(s.codice_fiscale)) m.push({ campo: 'cliente', testo: 'La partita IVA o il codice fiscale del cliente' });
    if (!testo(s.indirizzo) || !testo(s.cap) || !testo(s.citta) || (italiano && !testo(s.provincia))) {
      m.push({ campo: 'indirizzo', testo: 'L\'indirizzo del cliente: via, CAP, città e provincia' });
    }
    if (chiavePiva(s.partita_iva) && !testo(s.codice_sdi) && !testo(s.pec)) m.push({ campo: 'destinatario', testo: 'Il codice destinatario o la PEC del cliente' });
    if (testo(s.codice_sdi).length === 6) m.push({ campo: 'pa', testo: 'Fatture alla pubblica amministrazione: Wisper non le prepara ancora' });
    return m;
  },

  /** daFatturare {idCliente?, idCommessa?} (§11.1). */
  daFatturare(d) {
    d = d || {};
    const voci = this.sorgentiDaFatturare(d);
    const soggetti = {};
    this.db.righe('SELECT * FROM soggetti').forEach(s => { soggetti[s.id] = s; });
    const perCliente = new Map();
    const piuAvanti = [];
    for (const v of voci) {
      // Le scadenze non pronte e (fase 5) i ticket non pronti, con le loro spese anticipate, stanno in "piu' avanti".
      if ((v.tipo === 'scadenza' || v.tipo === 'ticket' || (v.tipo === 'spesa' && v.idTicket)) && !v.pronta) {
        piuAvanti.push(this.voceDaFatturare(v, soggetti));
        continue;
      }
      if (!perCliente.has(v.idCliente)) perCliente.set(v.idCliente, []);
      perCliente.get(v.idCliente).push(v);
    }
    const gruppi = [];
    for (const [idCliente, lista] of perCliente) {
      const s = soggetti[idCliente];
      // Ordine: scadenze, spese della commessa, rapportini per data (ognuno seguito dalle sue spese), ore.
      const rapportini = lista.filter(v => v.tipo === 'rapportino').sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.id < b.id ? -1 : 1)));
      const sueSpese = id => lista.filter(v => v.tipo === 'spesa' && v.idRapportino === id);
      // Fase 5: ogni ticket e' seguito dalle sue spese anticipate, dopo i rapportini e prima delle ore.
      const ticket = lista.filter(v => v.tipo === 'ticket').sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.id < b.id ? -1 : 1)));
      const delTicket = id => lista.filter(v => v.tipo === 'spesa' && v.idTicket === id);
      const ordinate = lista.filter(v => v.tipo === 'scadenza')
        .concat(lista.filter(v => v.tipo === 'spesa' && !v.idRapportino && !v.idTicket))
        .concat([].concat(...rapportini.map(r => [r].concat(sueSpese(r.id)))))
        .concat([].concat(...ticket.map(t => [t].concat(delTicket(t.id)))))
        .concat(lista.filter(v => v.tipo === 'ore'));
      gruppi.push({
        idCliente, cliente: s ? s.nome : idCliente, sostituto: this.sostitutoDi(s), mancano: this.mancanoCliente(s),
        totale: centesimi(ordinate.filter(v => v.pronta).reduce((t, v) => t + v.importo, 0)),
        voci: ordinate.map(v => this.voceDaFatturare(v, soggetti)),
      });
    }
    gruppi.sort((a, b) => a.cliente.localeCompare(b.cliente, 'it'));
    const inBozza = this.db.righe("SELECT * FROM fatture WHERE stato IN ('bozza', 'pronta') AND tipo = 'fattura' ORDER BY id")
      .filter(f => (!testo(d.idCliente) || f.cliente_id === testo(d.idCliente)) && (!testo(d.idCommessa) || String(f.commessa_id).toUpperCase() === testo(d.idCommessa).toUpperCase()))
      .map(f => ({
        idFattura: f.id, riferimento: f.riferimento, idCliente: f.cliente_id, cliente: soggetti[f.cliente_id] ? soggetti[f.cliente_id].nome : '',
        stato: f.stato, voci: this.db.riga('SELECT COUNT(*) n FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1', f.id).n, totale: f.totale,
      }));
    // "Riepilogo inviato il 30/09": i rapportini pronti di un cliente e di un mese, tutti gia' mandati.
    const riepiloghi = [];
    const perMese = new Map();
    for (const v of voci.filter(x => x.tipo === 'rapportino')) {
      const k = v.idCliente + '|' + v.data.slice(0, 7);
      if (!perMese.has(k)) perMese.set(k, []);
      perMese.get(k).push(v);
    }
    for (const [k, lista] of perMese) {
      if (!lista.every(v => testo(v.riga.stato).toUpperCase() === 'INVIATO' && v.riga.inviato_il)) continue;
      const [idCliente, mese] = k.split('|');
      riepiloghi.push({ idCliente, mese, rapportini: lista.length, inviatoIl: dataOraIso(lista.map(v => v.riga.inviato_il).sort().pop()) });
    }
    const raggruppa = {};
    for (const g of gruppi) raggruppa[g.idCliente] = this.raggruppaDi(soggetti[g.idCliente]);
    // 06/11/2026: niente piu' "Da far firmare" (i lavori Da inviare si fatturano). La chiave resta, vuota, per le app 1.1.
    const daFirmare = [];
    return {
      ok: true, oggi: oggi(), totale: centesimi(gruppi.reduce((t, g) => t + g.totale, 0)), clienti: gruppi.filter(g => g.totale > 0 || g.voci.some(v => v.pronta)).length,
      gruppi, piuAvanti, inBozza, riepiloghi, raggruppa, daFirmare,
    };
  },

  /** Una voce di Da fatturare come la vedono le app. */
  voceDaFatturare(v, soggetti) {
    const o = {
      tipo: v.tipo, id: v.id, idCommessa: v.idCommessa || '', data: v.data || '', titolo: v.titolo, dettaglio: v.dettaglio,
    };
    if (v.tipo === 'scadenza') o.quando = v.quando;
    if (v.idRapportino) o.idRapportino = v.idRapportino;
    if (v.tipo === 'spesa' && v.idTicket) o.idTicket = v.idTicket;
    o.pronta = v.pronta;
    o.importo = v.importo;
    if (v.tipo === 'rapportino') { o.spese = v.spese; o.totaleConSpese = v.totaleConSpese; }
    if (v.tipo === 'ticket') {
      o.aCorpo = v.aCorpo;
      o.dentro = v.dentro;
      o.spese = v.spese;
      o.senzaPrezzo = !!v.senzaPrezzo;
      if (!v.pronta) o.perche = v.perche;
    }
    if (v.tipo === 'ore') o.senzaPrezzo = !!v.senzaPrezzo;
    o.anticipazione = !!v.anticipazione;
    o.gruppo = v.gruppo;
    if (!v.pronta) { o.idCliente = v.idCliente; o.cliente = soggetti[v.idCliente] ? soggetti[v.idCliente].nome : ''; }
    return o;
  },

  // ------------------------------------------------------------------ le righe che nascono (§5.2) e i gruppi (§5.3)

  /**
   * Dalle voci scelte (gia' controllate, tutte dello stesso cliente) ai gruppi
   * di righe e sorgenti, nell'ordine di §11.1.
   */
  gruppiDaVoci(scelte, cliente, raggruppa) {
    const gruppi = [];
    const scadenze = scelte.filter(v => v.tipo === 'scadenza');
    for (const v of scadenze) {
      // Fase 5: una rata del canone di un contratto d'assistenza dice il contratto e la commessa (fase5.md §8.3).
      const ca = v.riga.contratto_id ? this.db.riga('SELECT numero, titolo FROM contratti WHERE id = ?', v.riga.contratto_id) : null;
      gruppi.push({
        gruppo: 'scadenza:' + v.id, righe: [ca ? C.rigaCanone({ descrizione: v.riga.descrizione, importo: v.importo }, ca, v.commessa)
          : C.rigaScadenza({ descrizione: v.riga.descrizione, importo: v.importo }, v.commessa, v.contratto)],
        sorgenti: [{ tipo: 'scadenza', id: String(v.id), importo: v.importo }],
      });
    }
    for (const v of scelte.filter(x => x.tipo === 'spesa' && !x.idRapportino && !x.idTicket)) {
      gruppi.push({
        gruppo: 'spesa:' + v.id,
        righe: [C.rigaSpesa({ descrizione: v.riga.descrizione, data: v.riga.data, importo: v.importo, anticipazione: v.anticipazione, idCommessa: v.idCommessa })],
        sorgenti: [{ tipo: 'spesa', id: String(v.id), importo: v.importo }],
      });
    }
    const rapportini = scelte.filter(x => x.tipo === 'rapportino');
    if (rapportini.length) {
      const sue = scelte.filter(x => x.tipo === 'spesa' && x.idRapportino);
      const r = C.righeRapportini({
        raggruppa, cliente: { id: cliente.id, tariffaFissa: cliente.tariffa_fissa, pagaViaggio: cliente.paga_viaggio === 1 },
        rapportini: rapportini.map(v => ({
          id: v.id, data: dataIso(v.riga.data), descrizione: v.riga.descrizione, oreLavoro: v.riga.ore_lavoro, oreExtra: v.riga.ore_extra,
          oreViaggio: v.riga.ore_viaggio, pagaViaggio: v.riga.paga_viaggio === 1, tariffa: v.riga.tariffa, maggExtra: v.riga.magg_extra,
          compensoOre: v.riga.compenso_ore, km: v.riga.km, euroKm: v.riga.euro_km, rimborsoKm: v.riga.rimborso_km,
          speseSenzaRighe: v.speseSenzaRighe, idCommessa: testo(v.riga.id_commessa), progetto: testo(v.riga.progetto),
          // 06/11/2026: "Rapportino RAP/2026/0153 del ...": il numero del rapportino, non quello del lavoro.
          numero: testo(v.riga.id_giornata) || v.id,
        })),
        spese: sue.map(v => ({ id: v.id, idRapportino: v.idRapportino, data: v.riga.data, descrizione: v.riga.descrizione, importo: v.importo, anticipazione: v.anticipazione, idCommessa: v.idCommessa })),
      });
      gruppi.push(...r);
    }
    // Fase 5: i ticket, una riga per l'intervento (con le loro spese anticipate a parte), coi testi di §7.6.
    for (const v of scelte.filter(x => x.tipo === 'ticket')) gruppi.push(...C.righeTicket(v.voceTicket.ingresso));
    // Ore: per commessa, mese e prezzo.
    const perOre = new Map();
    for (const v of scelte.filter(x => x.tipo === 'ore')) {
      const k = v.idCommessa + ':' + String(v.data).slice(0, 7) + ':' + (v.prezzo === null ? 'senza' : v.prezzo);
      if (!perOre.has(k)) perOre.set(k, []);
      perOre.get(k).push(v);
    }
    for (const [k, lista] of perOre) {
      const ore = lista.reduce((t, v) => t + numero(v.riga.ore), 0);
      gruppi.push({
        gruppo: 'ore:' + k, righe: [C.rigaOre(ore, lista[0].commessa, lista[0].prezzo, String(lista[0].data).slice(0, 7))],
        sorgenti: lista.map(v => ({ tipo: 'ore', id: String(v.id), importo: v.importo })),
      });
    }
    return gruppi;
  },

  /** I parametri fiscali di oggi, congelati nella fattura che nasce. */
  parametriFiscali(cliente) {
    const imp = this.leggiImpostazioni();
    const conto = this.contoPredefinito();
    const giorni = cliente && cliente.pagamento_giorni !== null && cliente.pagamento_giorni !== undefined ? cliente.pagamento_giorni : Math.round(numero(imp.GIORNI_PAGAMENTO));
    const fine = cliente && (cliente.pagamento_fine_mese === 0 || cliente.pagamento_fine_mese === 1) ? cliente.pagamento_fine_mese === 1 : si(imp.PAGAMENTO_FINE_MESE);
    return {
      regime: testo(imp.REGIME_FISCALE).toUpperCase() === 'RF19' ? 'forfettario' : 'ordinario',
      tipo_documento: testo(imp.TIPO_DOCUMENTO) || 'TD01',
      iva_percentuale: numero(imp.IVA), eppi_percentuale: numero(imp.EPPI_INTEGRATIVO), ritenuta_percentuale: numero(imp.RITENUTA),
      ritenuta_applicata: this.sostitutoDi(cliente) ? 1 : 0,
      bollo_soglia: numero(imp.BOLLO_SOGLIA), bollo_importo: numero(imp.BOLLO_IMPORTO), bollo_rivalsa: si(imp.BOLLO_RIVALSA) ? 1 : 0,
      giorni_pagamento: giorni, fine_mese: fine ? 1 : 0, modalita_pagamento: testo(imp.MODALITA_PAGAMENTO) || 'MP05',
      conto_id: conto ? conto.id : null,
    };
  },

  /** Una riga del database dalla riga di conti.js. */
  rigaPerDb(r, f, gruppo, ordine) {
    const compenso = r.tipo === 'compenso';
    return {
      ordine, origine: 'bozza', gruppo: gruppo || '', tipo: r.tipo, descrizione: testo(r.descrizione),
      quantita: r.quantita === null || r.quantita === undefined || r.quantita === '' ? null : numero(r.quantita), unita: testo(r.unita),
      prezzo: r.prezzo === null || r.prezzo === undefined || r.prezzo === '' ? null : numero(r.prezzo),
      importo: centesimi(numero(r.importo !== undefined && r.importo !== null ? r.importo : C.importoRigaFattura(r))),
      aliquota_iva: compenso && f.regime !== 'forfettario' ? numero(f.iva_percentuale) : 0,
      natura: compenso ? (f.regime === 'forfettario' ? 'N2.2' : '') : 'N1',
      soggetta_ritenuta: compenso ? 1 : 0, tributo_cliente: r.tributoCliente ? 1 : 0, commessa_id: testo(r.idCommessa),
      periodo_da: testo(r.periodoDa), periodo_a: testo(r.periodoA),
    };
  },

  /** Lega le sorgenti alla fattura: l'indice unico del database rifiuta quelle gia' in un'altra fattura viva. */
  legaSorgenti(idFattura, gruppo, sorgenti) {
    for (const s of sorgenti) {
      if (TIPI_SORGENTE.indexOf(s.tipo) < 0) throw new Rifiuto('Tipo: scadenza, rapportino, spesa, ore o ticket');
      const gia = this.sorgenteAttiva(s.tipo, s.id);
      if (gia) throw new Rifiuto(this.fraseGiaRiservata(s.tipo, s.id, gia));
      try {
        this.inserisci('fattura_sorgenti', {
          fattura_id: idFattura, gruppo, tipo: s.tipo, sorgente_id: String(s.id), importo: s.importo === undefined ? null : s.importo, attiva: 1, creato: adesso(),
        });
      } catch (err) {
        if (/UNIQUE constraint failed: fattura_sorgenti/.test(String(err && err.message))) throw new Rifiuto(this.fraseGiaRiservata(s.tipo, s.id));
        throw err;
      }
    }
  },

  /** Una bozza nuova (fattura o nota) coi parametri gia' decisi; torna l'id. */
  creaBozza(v) {
    const ora = adesso();
    const c = this.chi();
    const id = this.inserisci('fatture', Object.assign({
      stato: 'bozza', data: oggi(), utente_id: c.utente ? c.utente.id : null, creato: ora, modificato: ora,
    }, v));
    return id;
  },

  /**
   * preparaFattura {idCliente, voci: [{tipo, id}], raggruppa?, data?} (§11.1):
   * la bozza con le righe di §5.2, i parametri fiscali congelati e le sorgenti
   * riservate. Le spese di un rapportino scelto vengono con lui.
   */
  preparaFattura(d) {
    const voci = Array.isArray(d.voci) ? d.voci : [];
    if (!voci.length) throw new Rifiuto('Scegli almeno una cosa da fatturare');
    const idCliente = testo(d.idCliente);
    const cliente = this.db.riga('SELECT * FROM soggetti WHERE id = ?', idCliente);
    if (!cliente) throw new Rifiuto('Cliente ' + (idCliente || '') + ' non trovato');
    const raggruppa = testo(d.raggruppa) || this.raggruppaDi(cliente);
    if (['mese', 'rapportino'].indexOf(raggruppa) < 0) throw new Rifiuto('Raggruppa: mese o rapportino');
    const tutte = this.sorgentiDaFatturare({});
    const perChiave = new Map(tutte.map(v => [v.tipo + '|' + v.id, v]));
    const scelte = new Map();
    for (const x of voci) {
      const tipo = testo(x && x.tipo);
      const id = testo(x && x.id);
      if (TIPI_SORGENTE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: scadenza, rapportino, spesa, ore o ticket');
      const v = perChiave.get(tipo + '|' + id);
      if (!v) {
        const gia = this.sorgenteAttiva(tipo, id);
        throw new Rifiuto(gia ? this.fraseGiaRiservata(tipo, id, gia) : this.nomeSorgente(tipo, id) + ' non è più da fatturare');
      }
      if (v.idCliente !== idCliente) throw new Rifiuto('Una fattura è per un cliente solo');
      scelte.set(tipo + '|' + id, v);
    }
    // Fase 5: un ticket porta le sue spese anticipate; una di loro porta il ticket. Un ticket non pronto non si fattura.
    for (const v of Array.from(scelte.values())) {
      const numeroT = v.tipo === 'ticket' ? v.id : v.tipo === 'spesa' && v.idTicket ? v.idTicket : '';
      if (!numeroT) continue;
      const t = perChiave.get('ticket|' + numeroT);
      if (!t) continue;
      if (!t.pronta) throw new Rifiuto('Il ticket ' + numeroT + ' non è ancora pronto: ' + t.perche);
      scelte.set('ticket|' + numeroT, t);
      for (const s of tutte.filter(x => x.tipo === 'spesa' && x.idTicket === numeroT)) scelte.set('spesa|' + s.id, s);
    }
    // Un rapportino porta le sue spese; una spesa di un rapportino porta il rapportino (e le altre sue spese).
    for (const v of Array.from(scelte.values())) {
      const idRap = v.tipo === 'rapportino' ? v.id : v.tipo === 'spesa' ? v.idRapportino : '';
      if (!idRap) continue;
      const r = perChiave.get('rapportino|' + idRap);
      if (r) scelte.set('rapportino|' + idRap, r);
      for (const s of tutte.filter(x => x.tipo === 'spesa' && x.idRapportino === idRap)) scelte.set('spesa|' + s.id, s);
    }
    const lista = Array.from(scelte.values());
    const gruppi = this.gruppiDaVoci(lista, cliente, raggruppa);
    return this.scriviBozzaDaGruppi(cliente, gruppi, { data: d.data });
  },

  /** Scrive bozza, righe e sorgenti; rifa' i conti. */
  scriviBozzaDaGruppi(cliente, gruppi, o) {
    const par = this.parametriFiscali(cliente);
    const data = o.data ? dataDaIso(o.data) : oggi();
    const commesse = Array.from(new Set([].concat(...gruppi.map(g => g.righe.map(r => testo(r.idCommessa).toUpperCase())))));
    const idCommessa = commesse.length === 1 && commesse[0] ? gruppi[0].righe[0].idCommessa : '';
    const id = this.creaBozza(Object.assign({}, par, {
      tipo: 'fattura', cliente_id: cliente.id, commessa_id: idCommessa, data, causale: this.causaleDa(gruppi, idCommessa),
    }));
    let ordine = 0;
    for (const g of gruppi) {
      for (const r of g.righe) {
        const riga = this.rigaPerDb(r, par, g.gruppo, ++ordine);
        riga.importo_sorgenti = riga.importo;
        this.inserisci('fattura_righe', Object.assign({ fattura_id: id }, riga));
      }
      this.legaSorgenti(id, g.gruppo, g.sorgenti);
    }
    this.ricalcolaFattura(id);
    return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', id)) };
  },

  /**
   * La causale proposta: "40% a fine progetto, commessa 26ST003", "Prestazioni di settembre 2026"... 06/11/2026 (Manuel):
   * quando il lavoro fatturato sono solo rapportini e ognuno ha il suo progetto, al posto della commessa i progetti
   * ("Prestazioni di settembre 2026, progetti ED-001, ED-002"); il codice della commessa va accanto al mittente nel PDF.
   */
  causaleDa(gruppi, idCommessa) {
    // Contano i gruppi del compenso: una spesa anticipata accanto a un acconto non cambia la causale.
    const delCompenso = gruppi.filter(g => g.righe.some(r => r.tipo === 'compenso'));
    const progetti = this.progettiDeiGruppi(delCompenso);
    const coda = progetti ? ', ' + C.testoProgetti(progetti) : idCommessa ? ', commessa ' + idCommessa : '';
    if (delCompenso.length === 1) {
      const g = delCompenso[0].gruppo;
      if (g.indexOf('scadenza:') === 0) {
        const s = this.db.riga('SELECT descrizione FROM scadenze_pagamento WHERE id = ?', Number(g.slice(9)));
        return (s ? s.descrizione : 'Pagamento') + coda;
      }
      if (g.indexOf('rapportini:') === 0) return 'Prestazioni di ' + C.nomeMese(g.slice(-7)) + coda;
      if (g.indexOf('rapportino:') === 0) return 'Rapportino ' + this.numeroDelRapportino(g.slice(11)) + coda;
      if (g.indexOf('ticket:') === 0) return 'Intervento ' + g.slice(7) + coda;
    }
    return 'Prestazioni professionali' + coda;
  },

  /** Il numero che si vede del rapportino di un lavoro (RAP/2026/0153 per il lavoro RAP/2026/0153-2). */
  numeroDelRapportino(idLavoro) {
    const r = this.db.riga('SELECT id_giornata FROM rapportini WHERE id = ?', idLavoro);
    return (r && testo(r.id_giornata)) || idLavoro;
  },

  /**
   * I progetti del lavoro di questi gruppi, o null: solo se il lavoro sono rapportini (con le loro spese) e tutti hanno il
   * progetto. Scadenze di pagamento, ore registrate e ticket sono della commessa: con loro resta la commessa.
   */
  progettiDeiGruppi(gruppi) {
    const ids = [];
    for (const g of gruppi) {
      for (const s of g.sorgenti || []) {
        if (s.tipo === 'rapportino') ids.push(String(s.id));
        else if (s.tipo !== 'spesa') return null;
      }
    }
    if (!ids.length) return null;
    const righe = this.db.righe('SELECT id, progetto FROM rapportini WHERE id IN (' + ids.map(() => '?').join(', ') + ')', ...ids);
    if (righe.length !== new Set(ids).size) return null;
    return C.progettiDi(righe);
  },

  /** nuovaFattura {idCliente}: una bozza vuota, da riempire con righe libere. */
  nuovaFattura(d) {
    const cliente = this.db.riga('SELECT * FROM soggetti WHERE id = ?', testo(d.idCliente));
    if (!cliente) throw new Rifiuto('Cliente ' + (testo(d.idCliente) || '') + ' non trovato');
    const par = this.parametriFiscali(cliente);
    const id = this.creaBozza(Object.assign({}, par, { tipo: 'fattura', cliente_id: cliente.id, causale: 'Prestazioni professionali' }));
    this.ricalcolaFattura(id);
    return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', id)) };
  },

  // ------------------------------------------------------------------ i conti di una fattura

  /** Le righe che contano: quelle dell'XML se c'e' (l'emessa vera), se no quelle della bozza. */
  righeVisibili(id) {
    const xml = this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'xml' ORDER BY ordine, id", id);
    return xml.length ? xml : this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza' ORDER BY ordine, id", id);
  },

  contiDi(f, righe) {
    return C.contiFattura({
      regime: f.regime, ivaPercentuale: f.iva_percentuale, eppiPercentuale: f.eppi_percentuale, ritenutaPercentuale: f.ritenuta_percentuale,
      ritenuta: f.ritenuta_applicata === 1, bolloSoglia: f.bollo_soglia, bolloImporto: f.bollo_importo, bolloRivalsa: f.bollo_rivalsa === 1,
      righe: righe.filter(r => r.tipo !== 'bollo').map(r => ({ tipo: r.tipo, quantita: r.quantita, prezzo: r.prezzo, importo: r.importo, tributoCliente: r.tributo_cliente === 1 })),
    });
  },

  /**
   * Rifa' i conti di una bozza: la riga del bollo (la mette e la toglie il
   * server), i totali salvati e la scadenza (calcolata, o quella scritta a mano
   * col netto nuovo).
   */
  ricalcolaFattura(id) {
    const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
    if (!f || VIVE.indexOf(f.stato) < 0) return;
    const righe = this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza' ORDER BY ordine, id", id);
    const conti = this.contiDi(f, righe);
    const bolli = righe.filter(r => r.tipo === 'bollo');
    const normali = righe.filter(r => r.tipo !== 'bollo');
    if (conti.bolloAddebitato > 0) {
      const b = conti.bolloAddebitato;
      if (!bolli.length) {
        this.inserisci('fattura_righe', {
          fattura_id: id, ordine: normali.length + 1, origine: 'bozza', gruppo: '', tipo: 'bollo', descrizione: 'Imposta di bollo', quantita: 1, unita: '',
          prezzo: b, importo: b, aliquota_iva: 0, natura: 'N1', soggetta_ritenuta: 0, tributo_cliente: 0, commessa_id: '',
        });
      } else {
        this.aggiorna('fattura_righe', bolli[0].id, { prezzo: b, importo: b, quantita: 1, ordine: normali.length + 1 });
        for (const x of bolli.slice(1)) this.togliRiga(x, 'tolta: un bollo solo');
      }
    } else {
      for (const x of bolli) this.togliRiga(x, 'tolta: il bollo non serve più');
    }
    normali.forEach((r, i) => { if (r.ordine !== i + 1) this.aggiorna('fattura_righe', r.id, { ordine: i + 1 }); });
    this.aggiorna('fatture', id, {
      compenso: conti.compenso, contributo: conti.contributo, base_iva: conti.baseIva, iva: conti.iva, anticipazioni: conti.anticipazioni,
      bollo: conti.bollo, bollo_addebitato: conti.bolloAddebitato, totale: conti.totale, ritenuta: conti.ritenuta, netto: conti.netto,
    });
    const scadenze = this.db.righe('SELECT * FROM fattura_scadenze WHERE fattura_id = ? ORDER BY ordine, id', id);
    const data = f.scadenza_a_mano === 1 && scadenze[0] ? scadenze[0].data : C.scadenzaFattura(f.data, f.giorni_pagamento, f.fine_mese === 1);
    const conto = this.contoDellaFattura(f);
    const v = { ordine: 1, data, importo: conti.netto, modalita: f.modalita_pagamento, iban: conto ? testo(conto.iban) : '' };
    if (scadenze[0]) this.aggiorna('fattura_scadenze', scadenze[0].id, v);
    else this.inserisci('fattura_scadenze', Object.assign({ fattura_id: id }, v));
    for (const x of scadenze.slice(1)) {
      this.db.esegui('DELETE FROM fattura_scadenze WHERE id = ?', x.id);
      this.annota('fattura_scadenze', x.id, Object.assign({}, x), null, 'tolta');
    }
  },

  togliRiga(r, nota) {
    this.db.esegui('DELETE FROM fattura_righe WHERE id = ?', r.id);
    this.annota('fattura_righe', r.id, Object.assign({}, r), null, nota || 'tolta');
  },

  // ------------------------------------------------------------------ lettura di una fattura (§11.2)

  /** Una fattura per id interno (15), riferimento ("W-15"), numero ("45/2026") o {numero, anno}. */
  rigaFattura(id) {
    let f = null;
    if (id && typeof id === 'object') {
      const n = testo(id.numero);
      const anno = testo(id.anno);
      f = this.db.riga("SELECT * FROM fatture WHERE numero = ? AND (? = '' OR substr(data, 1, 4) = ?) ORDER BY id DESC LIMIT 1", n, anno, anno);
    } else {
      const s = testo(id);
      if (/^\d+$/.test(s)) f = this.db.riga('SELECT * FROM fatture WHERE id = ?', Number(s));
      else if (/^W-\d+$/i.test(s)) f = this.db.riga('SELECT * FROM fatture WHERE riferimento = ?', s.toUpperCase());
      else if (s) f = this.db.riga("SELECT * FROM fatture WHERE numero = ? AND stato <> 'scartata' ORDER BY id DESC LIMIT 1", s);
    }
    if (!f) throw new Rifiuto('Fattura ' + (typeof id === 'object' && id ? testo(id.numero) : testo(id)) + ' non trovata');
    return f;
  },

  /** "Bozza W-15", "Pronta W-15", "45/2026", "Nota di credito 3/2026". */
  etichettaFattura(f) {
    if (f.stato === 'bozza') return 'Bozza ' + f.riferimento;
    if (f.stato === 'pronta') return 'Pronta ' + f.riferimento;
    if (f.stato === 'scartata') return 'Scartata ' + f.riferimento;
    const n = f.numero || f.riferimento;
    return f.tipo === 'nota' ? 'Nota di credito ' + n : n;
  },

  /** Gli incassi di piu' fatture insieme: idFattura -> [{idMovimento, data, importo, conto, verificato}]. */
  incassiDi(ids) {
    const per = {};
    if (!ids.length) return per;
    // Fase 8 (prova di carico): dentro la Dashboard (conLettureRicordate) gli incassi di tutte le fatture si leggono una
    // volta sola e ogni elenco prende i suoi (stesso ordine per fattura: data e id del movimento).
    if (this.memoLetture) {
      const tutti = this.ricordata('incassiDi', () => this.incassiLetti(null));
      for (const id of ids) if (tutti[id]) per[id] = tutti[id];
      return per;
    }
    return this.incassiLetti(ids);
  },

  /** Gli incassi delle fatture ids (null = di tutte), per fattura, in ordine di data. */
  incassiLetti(ids) {
    const per = {};
    const conti = {};
    this.db.righe('SELECT * FROM conti').forEach(c => { conti[c.id] = c; });
    for (const r of this.db.righe(
      'SELECT a.fattura_id, a.importo, m.id idm, m.data, m.conto_id, m.verificato FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id ' +
      'WHERE m.annullato = 0 AND ' + (ids ? 'a.fattura_id IN (' + ids.map(Number).join(',') + ')' : 'a.fattura_id IS NOT NULL') + ' ORDER BY m.data, m.id')) {
      (per[r.fattura_id] = per[r.fattura_id] || []).push({
        idMovimento: r.idm, data: r.data, importo: centesimi(r.importo), conto: this.nomeConto(conti[r.conto_id]), verificato: r.verificato === 1,
      });
    }
    return per;
  },

  /**
   * Fase 8 (prova di carico): le fatture (tipo "fattura") di quegli stati. Fuori dalla Dashboard la lettura di sempre
   * (sql); dentro, da una lettura sola di tutte, filtrata: stesso ordine dell'indice fatture_stato (stato, data, id), lo
   * stesso che SQLite usa per le letture di prima.
   */
  fattureDiStati(stati, sql) {
    if (!this.memoLetture) return this.db.righe(sql);
    const tutte = this.ricordata('fattureTutte', () => this.db.righe("SELECT * FROM fatture WHERE tipo = 'fattura' AND stato IN ('annullata', 'bozza', 'emessa', 'pronta')"));
    return tutte.filter(f => stati.indexOf(f.stato) >= 0);
  },

  /** Fase 8 (prova di carico): tutti i ticket col "materiali compresi" del contratto; dentro la Dashboard una lettura sola. */
  ticketConContratto() {
    return this.ricordata('ticketConContratto', () => this.db.righe('SELECT t.*, c.materiali_inclusi FROM ticket t LEFT JOIN contratti c ON c.id = t.contratto_id'));
  },

  /** Quello che serve a piu' fatture insieme (elenchi): incassi, note collegate, scadenze, nomi. */
  aiutiFatture(righe) {
    const ids = righe.map(f => f.id);
    const n = this.ricordata('aiutiFatture', () => {
      const x = { clienti: {}, conti: {} };
      this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { x.clienti[s.id] = s.nome; });
      this.db.righe('SELECT * FROM conti').forEach(c => { x.conti[c.id] = c; });
      return x;
    });
    const a = { incassi: this.incassiDi(ids), note: {}, scadenze: {}, clienti: n.clienti, conti: n.conti };
    if (ids.length) {
      const lista = ids.map(Number).join(',');
      this.db.righe("SELECT * FROM fatture WHERE tipo = 'nota' AND fattura_collegata_id IN (" + lista + ') ORDER BY id')
        .forEach(n => { (a.note[n.fattura_collegata_id] = a.note[n.fattura_collegata_id] || []).push(n); });
      this.db.righe('SELECT * FROM fattura_scadenze WHERE fattura_id IN (' + lista + ') ORDER BY data, ordine, id')
        .forEach(s => { (a.scadenze[s.fattura_id] = a.scadenze[s.fattura_id] || []).push(s); });
    }
    return a;
  },

  /**
   * Incassato, residuo, pagamento e scaduta (§7.1), calcolati e mai salvati.
   * residuo = netto - note di credito emesse collegate (il loro netto) -
   * incassato; le rate si coprono in ordine di data. Su una bozza o una pronta
   * con incassi (avviso di parcella) il residuo si conta sul netto della bozza e,
   * quando e' coperta, va emessa entro 12 giorni dall'incasso.
   */
  pagamentoDi(f, a) {
    a = a || this.aiutiFatture([f]);
    const incassi = a.incassi[f.id] || [];
    const scadenze = a.scadenze[f.id] || [];
    if (f.tipo === 'nota') {
      return { incassato: 0, residuo: 0, pagamento: '', scaduta: false, giorniScaduta: 0, daEmettereEntro: '', incassi, coperture: scadenze.map(() => 0), daRestituire: 0 };
    }
    const incassato = centesimi(incassi.reduce((t, x) => t + x.importo, 0));
    const note = (a.note[f.id] || []).filter(n => n.stato === 'emessa');
    const noteNetto = centesimi(note.reduce((t, n) => t + numero(n.netto), 0));
    // Una nota arrivata dopo un incasso pieno lascerebbe un residuo negativo (un credito del cliente): si mostra zero.
    const residuo = Math.max(0, centesimi(numero(f.netto) - noteNetto - incassato));
    // Soldi gia' incassati che, dopo una nota di credito, il cliente non doveva piu': vanno restituiti o compensati.
    const daRestituire = incassato > 0 ? Math.max(0, centesimi(incassato + noteNetto - numero(f.netto))) : 0;
    const pagamento = residuo <= 0 ? 'pagata' : incassato > 0 ? 'in_parte' : 'da_incassare';
    let disponibile = centesimi(incassato + noteNetto);
    const coperture = scadenze.map(s => {
      const c = Math.max(0, Math.min(numero(s.importo), disponibile));
      disponibile = centesimi(disponibile - c);
      return centesimi(c);
    });
    const prima = scadenze.find((s, i) => coperture[i] < centesimi(numero(s.importo)) - 0.001);
    const t = oggi();
    const scaduta = f.stato === 'emessa' && residuo > 0 && !!prima && prima.data < t;
    let daEmettereEntro = '';
    if (VIVE.indexOf(f.stato) >= 0 && incassato > 0 && residuo <= 0) {
      let somma = 0;
      for (const x of incassi) {
        somma = centesimi(somma + x.importo);
        if (somma >= centesimi(numero(f.netto) - noteNetto)) { daEmettereEntro = C.giorniDopo(x.data, 12); break; }
      }
    }
    return {
      incassato, residuo, pagamento, scaduta, giorniScaduta: scaduta ? giorniTra(prima.data, t) : 0,
      daEmettereEntro, incassi, coperture, primaScoperta: prima ? prima.data : '', daRestituire,
    };
  },

  /** La parola da mostrare (§7.1). */
  statoVistoDi(f, p) {
    if (f.stato === 'scartata') return 'Scartata';
    if (f.stato === 'annullata') return 'Annullata';
    if (f.stato === 'bozza') return 'Bozza';
    if (f.stato === 'pronta') return p.incassato > 0 && p.residuo <= 0 ? 'Pronta · già pagata' : 'Pronta';
    if (f.tipo === 'nota') return 'Emessa';
    if (p.scaduta) return 'Scaduta';
    if (p.pagamento === 'pagata') return 'Pagata';
    if (p.pagamento === 'in_parte') return 'Pagata in parte';
    return 'Emessa';
  },

  /** Una fattura negli elenchi: §11.2 senza righe, sorgenti, incassi. */
  riassuntoFattura(f, a) {
    a = a || this.aiutiFatture([f]);
    const p = this.pagamentoDi(f, a);
    const scadenze = a.scadenze[f.id] || [];
    const conto = this.contoDellaFattura(f, a.conti);
    return {
      id: f.id, riferimento: f.riferimento, etichetta: this.etichettaFattura(f), tipo: f.tipo, tipoDocumento: f.tipo_documento,
      idCliente: f.cliente_id, cliente: a.clienti[f.cliente_id] || '', idCommessa: f.commessa_id || '',
      idFatturaCollegata: f.fattura_collegata_id === null ? null : f.fattura_collegata_id,
      stato: f.stato, statoVisto: f.tipo === 'nota' && f.stato === 'emessa' ? 'Nota di credito' : this.statoVistoDi(f, p),
      pagamento: p.pagamento, scaduta: p.scaduta, giorniScaduta: p.giorniScaduta,
      data: f.data, numero: f.numero, numeroDa: f.numero_da, causale: f.causale, noteInterne: f.note_interne,
      regime: f.regime, ivaPercentuale: f.iva_percentuale, eppiPercentuale: f.eppi_percentuale, ritenutaPercentuale: f.ritenuta_percentuale,
      ritenuta: f.ritenuta_applicata === 1, bolloRivalsa: f.bollo_rivalsa === 1,
      conti: {
        compenso: f.compenso, contributo: f.contributo, baseIva: f.base_iva, iva: f.iva, anticipazioni: f.anticipazioni,
        bollo: f.bollo, bolloAddebitato: f.bollo_addebitato, totale: f.totale, ritenuta: f.ritenuta, netto: f.netto,
      },
      totaleBozza: f.totale_bozza === null ? null : f.totale_bozza, nettoBozza: f.netto_bozza === null ? null : f.netto_bozza,
      scadenze: scadenze.map((s, i) => ({ id: s.id, data: s.data, importo: s.importo, modalita: s.modalita, coperta: p.coperture[i] || 0 })),
      scadenzaAMano: f.scadenza_a_mano === 1, idConto: conto ? conto.id : null, conto: this.nomeConto(conto),
      incassato: p.incassato, residuo: p.residuo, daRestituire: p.daRestituire, daEmettereEntro: p.daEmettereEntro,
      esitoSdi: f.esito_sdi, prontaIl: dataOraIso(f.pronta_il), emessaIl: dataOraIso(f.emessa_il), avvisoInviatoIl: dataOraIso(f.avviso_inviato_il),
      regoleConfermate: f.stato === 'bozza' ? !!this.regoleConfermate() : !!f.regole_confermate,
      creato: dataOraIso(f.creato), modificato: dataOraIso(f.modificato),
      // Fase 7 (§10.4): niente promemoria di pagamento (il motivo), la copia di cortesia in PDF, se e' nel portale.
      sollecitiNo: f.solleciti_no || '', copia: this.copiaFatturaDi(f),
      portale: (pp => ({ pubblicato: pp.pubblicato, vistoIl: pp.vistoIl, vistoDa: pp.vistoDa, pubblicazione: pp.pubblicazione }))(this.portaleDi('fattura', f.id)),
    };
  },

  /** Una fattura completa (§11.2). */
  fatturaCompleta(f) {
    const a = this.aiutiFatture([f]);
    const o = this.riassuntoFattura(f, a);
    const p = this.pagamentoDi(f, a);
    const righe = this.righeVisibili(f.id);
    o.conti = Object.assign({ righe: this.contiDi(f, righe).righe }, o.conti);
    // Le parti del conto che si leggono nella pagina (le app le mostrano con le parole di §13).
    o.conti.parteSenzaIva = this.contiDi(f, righe).parteSenzaIva;
    const sorgenti = this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? ORDER BY id', f.id);
    o.righe = righe.map(r => ({
      id: r.id, ordine: r.ordine, origine: r.origine, gruppo: r.gruppo, tipo: r.tipo, descrizione: r.descrizione, quantita: r.quantita,
      unita: r.unita, prezzo: r.prezzo, importo: r.importo, aliquotaIva: r.aliquota_iva, natura: r.natura,
      ritenuta: r.soggetta_ritenuta === 1 && f.ritenuta_applicata === 1, tributoCliente: r.tributo_cliente === 1, idCommessa: r.commessa_id,
      periodoDa: r.periodo_da, periodoA: r.periodo_a, importoSorgenti: r.importo_sorgenti === null ? null : r.importo_sorgenti,
    }));
    o.sorgenti = sorgenti.map(s => ({
      tipo: s.tipo, id: s.sorgente_id, gruppo: s.gruppo, descrizione: this.descrizioneSorgente(s.tipo, s.sorgente_id), importo: s.importo,
      attiva: s.attiva === 1, liberataIl: dataOraIso(s.liberata_il), liberataPerche: s.liberata_perche,
    }));
    // 06/11/2026: i codici delle commesse della fattura (il PDF li scrive accanto al Mittente: "Commessa 26ST014").
    o.commesse = this.commesseDellaFattura(f);
    o.incassi = p.incassi;
    o.note = (a.note[f.id] || []).map(n => ({ id: n.id, numero: n.numero || n.riferimento, data: n.data, totale: n.totale, netto: n.netto, stato: n.stato }));
    o.fatturaCollegata = null;
    if (f.fattura_collegata_id) {
      const c = this.db.riga('SELECT id, numero, riferimento, data, totale FROM fatture WHERE id = ?', f.fattura_collegata_id);
      o.fatturaCollegata = c ? { id: c.id, numero: c.numero || c.riferimento, data: c.data, totale: c.totale } : null;
    }
    const file = f.file_id ? this.db.riga('SELECT id, nome FROM file WHERE id = ?', f.file_id) : null;
    o.file = file ? { id: file.id, url: '/file/' + file.id, nome: file.nome } : null;
    o.nomeFileSdi = f.nome_file_sdi;
    o.esitoIl = dataOraIso(f.esito_il);
    o.motivo = f.motivo;
    o.scartataIl = dataOraIso(f.scartata_il);
    o.annullataIl = dataOraIso(f.annullata_il);
    o.puoScrivere = this.livello('fatturazione') >= 2;
    o.modificabile = f.stato === 'bozza' && o.puoScrivere;
    o.mancano = VIVE.indexOf(f.stato) >= 0 ? this.mancanoFattura(f) : [];
    // Le righe gialle e rosse della pagina, gia' scritte.
    o.avvisi = [];
    if (o.daEmettereEntro) o.avvisi.push({ tipo: 'emetti', testo: 'Va emessa entro ' + giornoLungo(o.daEmettereEntro) + ': ha pagato il ' + dataBreve(p.incassi[p.incassi.length - 1].data) });
    if (f.esito_sdi === 'scartata') o.avvisi.push({ tipo: 'scarto', testo: 'Lo SDI l\'ha scartata il ' + dataBreve(dataIso(f.esito_il)) + ': correggila nel programma e importa di nuovo l\'XML' });
    if (f.totale_bozza !== null && f.stato === 'emessa' && centesimi(f.totale_bozza) !== centesimi(f.totale)) {
      o.avvisi.push({ tipo: 'diversa', testo: 'L\'XML emesso è diverso dalla bozza: era ' + C.euroIt(f.totale_bozza) + ' €, è ' + C.euroIt(f.totale) + ' €' });
    }
    return o;
  },

  /** Due parole su una sorgente, per la pagina della fattura. */
  descrizioneSorgente(tipo, id) {
    if (tipo === 'ticket') {
      const t = this.db.riga('SELECT titolo, risolto_il FROM ticket WHERE numero = ?', String(id));
      return id + (t ? ' · ' + dataBreve(dataIso(t.risolto_il)) + ' · ' + t.titolo : '');
    }
    if (tipo === 'rapportino') {
      const r = this.db.riga('SELECT descrizione, data FROM rapportini WHERE id = ?', id);
      return id + (r ? ' · ' + dataBreve(dataIso(r.data)) + (r.descrizione ? ' · ' + r.descrizione : '') : '');
    }
    if (tipo === 'scadenza') {
      const s = this.db.riga('SELECT descrizione, commessa_id FROM scadenze_pagamento WHERE id = ?', Number(id));
      return s ? s.descrizione + ' · ' + s.commessa_id : 'Scadenza ' + id;
    }
    if (tipo === 'spesa') {
      const s = this.db.riga('SELECT descrizione, data FROM spese WHERE id = ?', Number(id));
      return s ? (s.descrizione || 'Spesa') + ' · ' + dataBreve(s.data) : 'Spesa ' + id;
    }
    const o = this.db.riga('SELECT descrizione, data, ore FROM ore WHERE id = ?', Number(id));
    return o ? (o.descrizione || 'Ore') + ' · ' + dataBreve(o.data) + ' · ' + C.numeroIt(o.ore) + ' ore' : 'Ore ' + id;
  },

  /** fatture {stato?, pagamento?, scadute?, tipo?, idCliente?, idCommessa?, testo?, anno?} (§11.1). */
  leggiFatture(d) {
    d = d || {};
    const cond = [];
    const par = [];
    const stato = testo(d.stato);
    if (stato === 'da_emettere') cond.push("stato IN ('bozza', 'pronta')");
    else if (stato) {
      if (STATI.indexOf(stato) < 0) throw new Rifiuto('Stato: bozza, pronta, emessa, scartata, annullata o da_emettere');
      cond.push('stato = ?');
      par.push(stato);
    } else cond.push("stato <> 'scartata'");
    if (testo(d.tipo)) { cond.push('tipo = ?'); par.push(testo(d.tipo)); }
    if (testo(d.idCliente)) { cond.push('cliente_id = ?'); par.push(testo(d.idCliente)); }
    if (testo(d.idCommessa)) {
      cond.push('(commessa_id = ? COLLATE NOCASE OR EXISTS (SELECT 1 FROM fattura_righe r WHERE r.fattura_id = fatture.id AND r.commessa_id = ? COLLATE NOCASE))');
      par.push(testo(d.idCommessa), testo(d.idCommessa));
    }
    if (testo(d.anno)) { cond.push('substr(data, 1, 4) = ?'); par.push(testo(d.anno)); }
    const righe = this.db.righe('SELECT * FROM fatture' + (cond.length ? ' WHERE ' + cond.join(' AND ') : ''), ...par);
    const a = this.aiutiFatture(righe);
    let lista = righe.map(f => this.riassuntoFattura(f, a));
    const cerca = testo(d.testo).toLowerCase();
    if (cerca) lista = lista.filter(f => [f.numero, f.riferimento, f.cliente, f.causale].some(x => String(x || '').toLowerCase().indexOf(cerca) >= 0));
    const pag = testo(d.pagamento);
    if (pag === 'aperta') lista = lista.filter(f => f.stato === 'emessa' && f.tipo === 'fattura' && f.residuo > 0);
    else if (pag) lista = lista.filter(f => f.stato === 'emessa' && f.pagamento === pag);
    if (si(d.scadute)) lista = lista.filter(f => f.scaduta);
    const vive = f => (VIVE.indexOf(f.stato) >= 0 ? 0 : 1);
    lista.sort((x, y) => vive(x) - vive(y) || (x.data < y.data ? 1 : x.data > y.data ? -1 : y.id - x.id));
    return lista;
  },

  // ------------------------------------------------------------------ salvare una bozza

  controllaInBozza(f) {
    if (f.stato === 'pronta') throw new Rifiuto('La fattura ' + f.riferimento + ' è già stata passata al programma: per cambiarla falla tornare in bozza');
    if (f.stato !== 'bozza') throw new Rifiuto('La fattura ' + this.etichettaFattura(f) + ' non è una bozza: non si cambia');
  },

  /**
   * salvaFattura {fattura: {id, data?, scadenza?, giorniPagamento?, fineMese?,
   * idConto?, causale?, noteInterne?, ritenuta?, tipoDocumento?, righe?}}
   * (§11.1). righe, se c'e', e' l'elenco intero: quelle senza id si creano
   * (libere), quelle che mancano si tolgono, e se manca anche solo una riga di
   * un gruppo si toglie tutto il gruppo e le sue sorgenti tornano libere.
   */
  salvaFattura(d) {
    const x = d.fattura || d;
    const f = this.rigaFattura(x.id);
    this.controllaInBozza(f);
    const v = {};
    if (x.data !== undefined) v.data = x.data ? dataDaIso(x.data) : oggi();
    if (x.causale !== undefined) v.causale = testo(x.causale);
    if (x.noteInterne !== undefined) v.note_interne = testo(x.noteInterne);
    if (x.giorniPagamento !== undefined) {
      const g = Math.round(numero(x.giorniPagamento));
      if (g < 0 || g > 365) throw new Rifiuto('Giorni di pagamento: da 0 a 365');
      v.giorni_pagamento = g;
    }
    if (x.fineMese !== undefined) v.fine_mese = si(x.fineMese) ? 1 : 0;
    if (x.ritenuta !== undefined) v.ritenuta_applicata = si(x.ritenuta) ? 1 : 0;
    if (x.tipoDocumento !== undefined) {
      const t = testo(x.tipoDocumento).toUpperCase();
      const ammessi = f.tipo === 'nota' ? ['TD04'] : ['TD01', 'TD06'];
      if (ammessi.indexOf(t) < 0) throw new Rifiuto('Tipo di documento: ' + ammessi.join(' o '));
      v.tipo_documento = t;
    }
    if (x.idConto !== undefined) {
      if (vuoto(x.idConto)) v.conto_id = null;
      else {
        const c = this.db.riga('SELECT id FROM conti WHERE id = ? AND attivo = 1', Number(x.idConto));
        if (!c) throw new Rifiuto('Conto ' + x.idConto + ' non trovato');
        v.conto_id = c.id;
      }
    }
    if (x.scadenza !== undefined) v.scadenza_a_mano = x.scadenza ? 1 : 0;
    if (Object.keys(v).length) this.aggiorna('fatture', f.id, Object.assign(v, { modificato: adesso() }));
    if (x.scadenza) {
      const data = dataDaIso(x.scadenza);
      const s = this.db.riga('SELECT * FROM fattura_scadenze WHERE fattura_id = ? ORDER BY ordine, id LIMIT 1', f.id);
      if (s) this.aggiorna('fattura_scadenze', s.id, { data });
      else this.inserisci('fattura_scadenze', { fattura_id: f.id, ordine: 1, data, importo: 0, modalita: f.modalita_pagamento, iban: '' });
    }
    let liberate = [];
    if (Array.isArray(x.righe)) liberate = this.scriviRigheBozza(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id), x.righe);
    this.ricalcolaFattura(f.id);
    return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)), liberate };
  },

  /** Le righe della bozza dall'elenco intero mandato dall'app; torna le sorgenti liberate. */
  scriviRigheBozza(f, lista) {
    const vecchie = this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND origine = 'bozza' AND tipo <> 'bollo' ORDER BY ordine, id", f.id);
    const perId = new Map(vecchie.map(r => [r.id, r]));
    const tenute = new Set();
    const nuove = [];
    for (const r of lista) {
      if (!r || r.tipo === 'bollo') continue;
      const vecchia = r.id ? perId.get(Number(r.id)) : null;
      if (r.id && !vecchia) {
        // Una riga che non c'e' (gia' tolta, o del bollo): si ignora.
        continue;
      }
      if (vecchia) tenute.add(vecchia.id);
      nuove.push({ r, vecchia });
    }
    // Un gruppo con una riga mancante si toglie tutto, e le sue sorgenti tornano da fatturare.
    const gruppiTolti = new Set(vecchie.filter(r => !tenute.has(r.id) && r.gruppo).map(r => r.gruppo));
    const liberate = [];
    for (const g of gruppiTolti) liberate.push(...this.liberaGruppo(f.id, g, 'tolta dalla bozza'));
    for (const r of vecchie) {
      if (!tenute.has(r.id) || gruppiTolti.has(r.gruppo)) this.togliRiga(r, r.gruppo ? 'tolta dalla bozza (gruppo ' + r.gruppo + ')' : 'tolta dalla bozza');
    }
    let ordine = 0;
    for (const { r, vecchia } of nuove) {
      if (vecchia && gruppiTolti.has(vecchia.gruppo)) continue;
      ordine++;
      const tipo = vecchia && vecchia.gruppo ? vecchia.tipo : testo(r.tipo) || (vecchia ? vecchia.tipo : 'compenso');
      if (['compenso', 'anticipazione'].indexOf(tipo) < 0) throw new Rifiuto('Riga: compenso o anticipazione');
      const descrizione = r.descrizione !== undefined ? testo(r.descrizione) : vecchia ? vecchia.descrizione : '';
      if (!descrizione) throw new Rifiuto('Riga: scrivi la descrizione');
      const quantita = r.quantita !== undefined ? numeroONull(r.quantita) : vecchia ? vecchia.quantita : 1;
      if (quantita !== null && quantita < 0) throw new Rifiuto('Quantità: non può essere negativa');
      const prezzo = r.prezzo !== undefined ? numeroONull(r.prezzo) : vecchia ? vecchia.prezzo : null;
      if (prezzo !== null && prezzo < 0) throw new Rifiuto('Prezzo: non può essere negativo');
      const unita = r.unita !== undefined ? testo(r.unita) : vecchia ? vecchia.unita : '';
      const tributo = r.tributoCliente !== undefined ? si(r.tributoCliente) : vecchia ? vecchia.tributo_cliente === 1 : false;
      // L'importo segue quantita' x prezzo; una riga di un gruppo non cambiata tiene la somma delle sue sorgenti.
      const cambiati = !vecchia || numero(quantita) !== numero(vecchia.quantita) || numero(prezzo) !== numero(vecchia.prezzo) || (quantita === null) !== (vecchia.quantita === null);
      const importo = !cambiati ? vecchia.importo : C.importoRigaFattura({ quantita, prezzo });
      const base = this.rigaPerDb({ tipo, descrizione, quantita, unita, prezzo, importo, tributoCliente: tributo && tipo === 'anticipazione',
        idCommessa: vecchia ? vecchia.commessa_id : testo(r.idCommessa), periodoDa: vecchia ? vecchia.periodo_da : '', periodoA: vecchia ? vecchia.periodo_a : '' }, f, vecchia ? vecchia.gruppo : '', ordine);
      if (vecchia) {
        delete base.origine;
        delete base.gruppo;
        this.aggiorna('fattura_righe', vecchia.id, base);
      } else {
        this.inserisci('fattura_righe', Object.assign({ fattura_id: f.id }, base));
      }
    }
    return liberate;
  },

  /** Libera le sorgenti attive di un gruppo (o di tutta la fattura con gruppo null); torna quali. */
  liberaGruppo(idFattura, gruppo, perche) {
    const righe = gruppo === null
      ? this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1 ORDER BY id', idFattura)
      : this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND gruppo = ? AND attiva = 1 ORDER BY id', idFattura, gruppo);
    const ora = adesso();
    for (const s of righe) this.aggiorna('fattura_sorgenti', s.id, { attiva: 0, liberata_il: ora, liberata_perche: perche }, 'id', perche);
    return righe.map(s => ({ tipo: s.tipo, id: s.sorgente_id, descrizione: this.descrizioneSorgente(s.tipo, s.sorgente_id) }));
  },

  /** scartaFattura {id, motivo?, conferma?}: da bozza o pronta; le sorgenti tornano libere. */
  scartaFattura(d) {
    const f = this.rigaFattura(d.id);
    if (f.stato === 'scartata') return { ok: true, fattura: this.fatturaCompleta(f) };
    if (VIVE.indexOf(f.stato) < 0) throw new Rifiuto('La fattura ' + this.etichettaFattura(f) + ' è già emessa: per annullarla serve una nota di credito');
    if (f.stato === 'pronta' && !si(d.conferma)) {
      return { ok: false, errore: 'La ' + f.riferimento + ' è già nel programma: scartala solo se lì non l\'hai emessa', serveConferma: true };
    }
    const ora = adesso();
    this.liberaGruppo(f.id, null, 'bozza scartata');
    this.aggiorna('fatture', f.id, { stato: 'scartata', scartata_il: ora, motivo: testo(d.motivo), modificato: ora }, 'id', 'bozza scartata');
    return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)) };
  },

  // ------------------------------------------------------------------ il passaggio al programma (§8)

  /** Cosa manca per passare la fattura al programma (§8.2): campi che il programma chiederebbe comunque. */
  mancanoFattura(f) {
    const imp = this.leggiImpostazioni();
    const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', f.cliente_id);
    const m = [];
    const cliente = this.mancanoCliente(s).filter(x => x.campo !== 'pa');
    m.push(...cliente);
    if (!chiavePiva(imp.PARTITA_IVA) || !testo(imp.CODICE_FISCALE) || !testo(imp.REGIME_FISCALE) || !testo(imp.INDIRIZZO) ||
      !testo(imp.STUDIO_CAP) || !testo(imp.STUDIO_COMUNE) || !testo(imp.STUDIO_PROVINCIA)) {
      m.push({ campo: 'studio', testo: 'I dati dello studio per la fattura: scrivili in Amministrazione › Dati dello studio' });
    }
    const conto = this.contoDellaFattura(f);
    if (f.modalita_pagamento === 'MP05' && !(conto && testo(conto.iban))) {
      m.push({ campo: 'iban', testo: 'L\'IBAN del conto su cui farti pagare: scrivilo in Banche e scadenze › Conti' });
    }
    const righe = this.righeVisibili(f.id).filter(r => r.tipo !== 'bollo');
    if (!righe.length) m.push({ campo: 'righe', testo: 'Almeno una riga' });
    const senza = righe.filter(r => r.prezzo === null).length;
    if (senza) m.push({ campo: 'prezzi', testo: senza + (senza === 1 ? ' riga senza prezzo' : ' righe senza prezzo') });
    if (righe.length && !(numero(f.totale) > 0)) m.push({ campo: 'totale', testo: 'Il totale è zero' });
    if (s && testo(s.codice_sdi).length === 6) m.push({ campo: 'pa', testo: 'Fatture alla pubblica amministrazione: Wisper non le prepara ancora' });
    return m;
  },

  /**
   * Il modello della fattura (§8.1): tutti i campi FatturaPA, gia' calcolati.
   * Prospetto, XML da completare e PDF nascono solo da qui. L'IBAN e' intero
   * (serve al prospetto) solo per chi scrive le fatture; agli altri coperto.
   */
  modelloFattura(f, opzioni) {
    const o = opzioni || {};
    const imp = this.leggiImpostazioni();
    const s = this.db.riga('SELECT * FROM soggetti WHERE id = ?', f.cliente_id) || {};
    const righe = this.righeVisibili(f.id);
    const privato = !chiavePiva(s.partita_iva);
    const nc = nomeECognome(s.nome);
    const conto = this.contoDellaFattura(f);
    const iban = c => (o.ibanIntero ? testo(c).replace(/\s/g, '') : ibanCoperto(c));
    const forfettario = f.regime === 'forfettario';
    const ritenutaSi = f.ritenuta_applicata === 1 && !forfettario && numero(f.ritenuta) > 0;
    const modelloRighe = righe.map((r, i) => ({
      numero: i + 1, descrizione: r.descrizione, quantita: r.quantita === null ? 1 : r.quantita, unitaMisura: r.unita,
      prezzoUnitario: r.prezzo === null ? 0 : r.prezzo, prezzoTotale: r.importo, aliquotaIva: r.aliquota_iva, natura: r.natura,
      ritenuta: r.soggetta_ritenuta === 1 && ritenutaSi, periodoDa: r.periodo_da || '', periodoA: r.periodo_a || '',
    }));
    const riepilogo = [];
    if (forfettario) {
      const imponibile = centesimi(numero(f.compenso) + numero(f.contributo));
      if (imponibile > 0) riepilogo.push({ aliquotaIva: 0, natura: 'N2.2', imponibile, imposta: 0, esigibilita: '', riferimentoNormativo: RIFERIMENTO_FORFETTARIO });
    } else if (numero(f.base_iva) > 0) {
      riepilogo.push({ aliquotaIva: f.iva_percentuale, natura: '', imponibile: f.base_iva, imposta: f.iva, esigibilita: 'I', riferimentoNormativo: '' });
    }
    const n1 = centesimi(numero(f.anticipazioni) + numero(f.bollo_addebitato));
    if (n1 > 0) riepilogo.push({ aliquotaIva: 0, natura: 'N1', imponibile: n1, imposta: 0, esigibilita: '', riferimentoNormativo: RIFERIMENTO_N1 });
    const scadenze = this.db.righe('SELECT * FROM fattura_scadenze WHERE fattura_id = ? ORDER BY data, ordine, id', f.id);
    const collegata = f.fattura_collegata_id ? this.db.riga('SELECT numero, riferimento, data FROM fatture WHERE id = ?', f.fattura_collegata_id) : null;
    const confermate = f.stato === 'bozza' ? !!this.regoleConfermate() : !!f.regole_confermate;
    return {
      riferimento: f.riferimento, tipoDocumento: f.tipo_documento, divisa: 'EUR', dataProposta: f.data, data: f.stato === 'emessa' || f.stato === 'annullata' ? f.data : '',
      numero: f.numero || '',
      prestatore: {
        denominazione: testo(imp.RAGIONE_SOCIALE), partitaIva: chiavePiva(imp.PARTITA_IVA), codiceFiscale: testo(imp.CODICE_FISCALE).toUpperCase(),
        regimeFiscale: testo(imp.REGIME_FISCALE) || 'RF01',
        albo: { nome: testo(imp.ALBO), provincia: testo(imp.ALBO_PROVINCIA).toUpperCase(), numero: testo(imp.ALBO_NUMERO), data: dataIso(imp.ALBO_DATA) },
        // INDIRIZZO e' via e numero; un indirizzo scritto tutto insieme ("..., 36016 Thiene (VI)") si taglia al CAP.
        sede: { indirizzo: testo(imp.INDIRIZZO).replace(/,\s*\d{5}\b.*$/, ''), cap: testo(imp.STUDIO_CAP), comune: testo(imp.STUDIO_COMUNE),
          provincia: testo(imp.STUDIO_PROVINCIA).toUpperCase(), nazione: 'IT' },
        pec: testo(imp.PEC), email: testo(imp.EMAIL),
      },
      committente: {
        denominazione: privato ? '' : testo(s.nome), nome: privato ? nc.nome : '', cognome: privato ? nc.cognome : '',
        partitaIva: chiavePiva(s.partita_iva), codiceFiscale: testo(s.codice_fiscale).toUpperCase(),
        sede: { indirizzo: testo(s.indirizzo), cap: testo(s.cap), comune: testo(s.citta), provincia: testo(s.provincia).toUpperCase(), nazione: testo(s.nazione).toUpperCase() || 'IT' },
        codiceDestinatario: !privato && testo(s.codice_sdi) ? testo(s.codice_sdi).toUpperCase() : '0000000', pec: testo(s.pec),
      },
      righe: modelloRighe,
      cassa: numero(f.contributo) > 0 || (numero(f.eppi_percentuale) > 0 && numero(f.compenso) > 0) ? {
        tipo: testo(imp.EPPI_TIPO_CASSA) || 'TC17', aliquota: f.eppi_percentuale, imponibile: f.compenso, importo: f.contributo,
        aliquotaIva: forfettario ? 0 : f.iva_percentuale, natura: forfettario ? 'N2.2' : '', ritenuta: false,
      } : null,
      ritenuta: ritenutaSi ? { tipo: testo(imp.RITENUTA_TIPO) || 'RT01', aliquota: f.ritenuta_percentuale, importo: f.ritenuta, causale: testo(imp.RITENUTA_CAUSALE) || 'A' } : null,
      bollo: numero(f.bollo) > 0 ? { virtuale: true, importo: f.bollo } : null,
      riepilogo,
      totaleDocumento: f.totale, nettoAPagare: f.netto,
      pagamento: {
        condizioni: scadenze.length > 1 ? 'TP01' : 'TP02',
        dettagli: scadenze.map(x => ({ modalita: x.modalita || f.modalita_pagamento, scadenza: x.data, importo: x.importo,
          iban: iban(x.iban || (conto ? conto.iban : '')), istituto: conto ? testo(conto.banca) : '' })),
      },
      causale: [(testo(f.causale) ? testo(f.causale) + '. ' : '') + 'Rif. Wisper ' + f.riferimento],
      fattureCollegate: collegata ? [{ idDocumento: collegata.numero || collegata.riferimento, data: collegata.data }] : [],
      regoleConfermate: confermate,
      // 06/11/2026: i codici delle commesse (per il PDF, accanto al Mittente). Non vanno nell'XML.
      commesse: this.commesseDellaFattura(f),
    };
  },

  /** I codici delle commesse di una fattura, nell'ordine delle righe e senza doppioni; senza righe, quella della fattura. */
  commesseDellaFattura(f) {
    const l = [];
    const metti = c => { const x = testo(c); if (x && !l.some(y => y.toUpperCase() === x.toUpperCase())) l.push(x); };
    for (const r of this.db.righe('SELECT commessa_id FROM fattura_righe WHERE fattura_id = ? ORDER BY ordine, id', f.id)) metti(r.commessa_id);
    if (!l.length) metti(f.commessa_id);
    return l;
  },

  /** Il pacchetto (§11.3): uscite, modello, mancano, prospetto, xml. */
  pacchettoDi(f) {
    const imp = this.leggiImpostazioni();
    const intero = this.livello('fatturazione') >= 2;
    const modello = this.modelloFattura(f, { ibanIntero: intero });
    let uscite = passaggio.usciteAttive(imp);
    // Un'emessa si rivede col prospetto; l'XML da completare non ha piu' senso (c'e' quello vero).
    if (f.stato === 'emessa' || f.stato === 'annullata') uscite = uscite.filter(u => u !== 'xml');
    const p = { ok: true, uscite, modello, mancano: VIVE.indexOf(f.stato) >= 0 ? this.mancanoFattura(f) : [] };
    for (const u of uscite) p[u] = passaggio.USCITE[u].crea(modello);
    return p;
  },

  pacchetto(d) {
    return this.pacchettoDi(this.rigaFattura(d.id));
  },

  /**
   * passaAlProgramma {id, conferma?}: da bozza a pronta. Con qualcosa in
   * mancano non si passa; con le regole non confermate serve una conferma in piu'.
   */
  passaAlProgramma(d) {
    const f = this.rigaFattura(d.id);
    if (f.stato === 'pronta') return { ok: true, fattura: this.fatturaCompleta(f), pacchetto: this.pacchettoDi(f) };
    this.controllaInBozza(f);
    const mancano = this.mancanoFattura(f);
    if (mancano.length) {
      return { ok: false, errore: 'Prima di passarla al programma manca: ' + mancano.map(x => x.testo.charAt(0).toLowerCase() + x.testo.slice(1)).join('; '), mancano };
    }
    const regole = this.regoleConfermate();
    if (!regole && !si(d.conferma)) {
      return { ok: false, errore: 'Le regole delle fatture non sono ancora confermate dal commercialista: passala lo stesso?', serveConferma: true };
    }
    const ora = adesso();
    const c = this.chi();
    const conto = this.contoDellaFattura(f);
    const v = { stato: 'pronta', pronta_il: ora, pronta_da: c.utente ? c.utente.id : null, regole_confermate: regole ? regole.data : '', modificato: ora };
    // La bozza nata senza conto si tiene quello che ha usato il prospetto: cambiare il predefinito dopo non la tocca.
    if (!f.conto_id && conto) v.conto_id = conto.id;
    this.aggiorna('fatture', f.id, v, 'id', 'passata al programma');
    if (v.conto_id) this.ricalcolaFattura(f.id);
    const dopo = this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id);
    return { ok: true, fattura: this.fatturaCompleta(dopo), pacchetto: this.pacchettoDi(dopo) };
  },

  /** tornaInBozza {id}: da pronta, solo senza XML abbinato. */
  tornaInBozza(d) {
    const f = this.rigaFattura(d.id);
    if (f.stato === 'bozza') return { ok: true, fattura: this.fatturaCompleta(f) };
    if (f.stato !== 'pronta') throw new Rifiuto('La fattura ' + this.etichettaFattura(f) + ' non è pronta: torna in bozza solo una fattura passata al programma e non ancora emessa');
    if (f.file_id || f.numero) throw new Rifiuto('La ' + f.riferimento + ' ha già un XML abbinato: non torna in bozza');
    this.aggiorna('fatture', f.id, { stato: 'bozza', pronta_il: '', pronta_da: null, regole_confermate: '', modificato: adesso() }, 'id', 'tornata in bozza');
    this.ricalcolaFattura(f.id);
    return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)) };
  },

  /** La chiave contro i doppioni: partitaIvaStudio|tipoDocumento|anno|numero. */
  chiaveFattura(tipoDocumento, data, numeroFiscale) {
    const piva = chiavePiva(this.leggiImpostazioni().PARTITA_IVA);
    return piva + '|' + testo(tipoDocumento).toUpperCase() + '|' + String(data).slice(0, 4) + '|' + testo(numeroFiscale).toUpperCase().replace(/\s+/g, '');
  },

  /**
   * segnaEmessa {id, numero, data, conferma?}: da bozza o pronta, senza XML. Il
   * numero lo scrive Manuel (quello del programma), mai proposto da Wisper.
   */
  segnaEmessa(d) {
    const f = this.rigaFattura(d.id);
    if (VIVE.indexOf(f.stato) < 0) throw new Rifiuto('La fattura ' + this.etichettaFattura(f) + ' non è una bozza né pronta');
    const n = testo(d.numero);
    if (!n) throw new Rifiuto('Numero: scrivi il numero che ha dato il programma');
    if (/^BOZZA$/i.test(n.replace(/\s+/g, ''))) throw new Rifiuto('Numero: BOZZA non è un numero di fattura, scrivi quello che ha dato il programma');
    const data = d.data ? dataDaIso(d.data) : f.data;
    const chiave = this.chiaveFattura(f.tipo_documento, data, n);
    const gia = this.db.riga('SELECT * FROM fatture WHERE chiave = ?', chiave);
    if (gia) throw new Rifiuto('C\'è già la ' + (gia.tipo === 'nota' ? 'nota di credito ' : 'fattura ') + (gia.numero || n));
    if (!si(d.conferma)) {
      return { ok: false, errore: 'Il numero lo scrivi tu: deve essere quello che ha dato il tuo programma. Gli importi restano quelli della bozza finché non importi l\'XML', serveConferma: true };
    }
    if (f.stato === 'bozza') this.ricalcolaFattura(f.id);
    const ora = adesso();
    const regole = this.regoleConfermate();
    this.aggiorna('fatture', f.id, {
      stato: 'emessa', numero: n, numero_da: 'mano', data, chiave, emessa_il: ora, modificato: ora,
      pronta_il: f.pronta_il || ora, regole_confermate: f.regole_confermate || (regole ? regole.data : ''),
    }, 'id', 'emessa: numero scritto a mano');
    // La scadenza segue la data vera (se non era scritta a mano).
    const dopo = this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id);
    if (dopo.scadenza_a_mano !== 1) {
      const s = this.db.riga('SELECT * FROM fattura_scadenze WHERE fattura_id = ? ORDER BY ordine, id LIMIT 1', f.id);
      if (s) this.aggiorna('fattura_scadenze', s.id, { data: C.scadenzaFattura(data, dopo.giorni_pagamento, dopo.fine_mese === 1) });
    }
    this.dopoEmissione(dopo);
    return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)) };
  },

  // ------------------------------------------------------------------ effetti dell'emissione (§7.2) e il loro contrario

  /**
   * Una fattura diventa emessa: le sue sorgenti attive diventano fatturate
   * (rapportino FATTURATO, scadenza fatturata, spesa e ore con la data), ognuna
   * con la sua riga nel registro. Una nota di credito invece libera i gruppi
   * che storna per intero.
   */
  /** Fase 7: la copia di cortesia della fattura ({id, url, nome} o null). */
  copiaFatturaDi(f) {
    const c = f.copia_file_id ? this.db.riga('SELECT id, nome FROM file WHERE id = ? AND cestinato IS NULL', f.copia_file_id) : null;
    return c ? { id: c.id, url: '/file/' + c.id, nome: c.nome } : null;
  },

  dopoEmissione(f) {
    // Fase 7 (§8.1): emessa (anche una nota di credito dello stesso cliente), la regola "fatture" del cliente col portale la pubblica.
    this.pubblicaConRegola('fattura', f.id, {});
    if (f.tipo === 'nota') {
      this.effettiNota(f);
      return;
    }
    const etichetta = 'dalla fattura ' + (f.numero || f.riferimento) + ' (' + f.riferimento + ')';
    for (const s of this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND attiva = 1 ORDER BY id', f.id)) {
      this.segnaSorgenteFatturata(s.tipo, s.sorgente_id, f.data, f.id, etichetta);
    }
    this.aggiornaProposte();
  },

  /** Una sorgente fatturata (anche fuori da Wisper, con idFattura null). */
  segnaSorgenteFatturata(tipo, id, data, idFattura, nota) {
    const ora = adesso();
    if (tipo === 'rapportino') {
      const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', id);
      if (!r) return;
      this.aggiorna('rapportini', r.id, { stato: 'FATTURATO', fatturato_il: data, modificato: ora }, 'id', nota);
      this.allineaSpeseRapportino(r.id);
    } else if (tipo === 'scadenza') {
      this.aggiorna('scadenze_pagamento', Number(id), { stato: 'fatturata', fattura_id: idFattura }, 'id', nota);
    } else if (tipo === 'spesa') {
      this.aggiorna('spese', Number(id), { fatturata_il: data, modificato: ora }, 'id', nota);
    } else if (tipo === 'ore') {
      this.aggiorna('ore', Number(id), { fatturata_il: data, modificato: ora }, 'id', nota);
    } else if (tipo === 'ticket') {
      const t = this.db.riga('SELECT * FROM ticket WHERE numero = ?', String(id));
      if (!t) return;
      this.aggiorna('ticket', t.id, { fatturato_il: data, modificato: ora }, 'id', nota);
      this.eventoTicket(t.id, 'Fatturato' + (nota ? ' (' + nota + ')' : ''));
    }
  },

  /** Il contrario: rapportino di nuovo INVIATO (o Da inviare), scadenza prevista, spesa e ore senza data. */
  togliFatturata(tipo, id, nota) {
    const ora = adesso();
    if (tipo === 'rapportino') {
      const r = this.db.riga('SELECT * FROM rapportini WHERE id = ?', id);
      if (!r) return;
      // 06/11/2026: senza invio torna Da inviare: FIRMATO solo se ha la firma di prima.
      this.aggiorna('rapportini', r.id, { stato: testo(r.inviato_il) ? 'INVIATO' : testo(r.firma) ? 'FIRMATO' : 'BOZZA', fatturato_il: '', modificato: ora }, 'id', nota);
      this.allineaSpeseRapportino(r.id);
    } else if (tipo === 'scadenza') {
      this.aggiorna('scadenze_pagamento', Number(id), { stato: 'prevista', fattura_id: null }, 'id', nota);
    } else if (tipo === 'spesa') {
      this.aggiorna('spese', Number(id), { fatturata_il: '', modificato: ora }, 'id', nota);
    } else if (tipo === 'ore') {
      this.aggiorna('ore', Number(id), { fatturata_il: '', modificato: ora }, 'id', nota);
    } else if (tipo === 'ticket') {
      const t = this.db.riga('SELECT * FROM ticket WHERE numero = ?', String(id));
      if (!t) return;
      this.aggiorna('ticket', t.id, { fatturato_il: '', modificato: ora }, 'id', nota);
      this.eventoTicket(t.id, 'Non più fatturato' + (nota ? ' (' + nota + ')' : ''));
    }
  },

  /** I gruppi della fattura che la nota storna per intero (ogni riga del gruppo, con lo stesso importo). */
  gruppiStornati(nota, fattura) {
    const righeNota = this.db.righe("SELECT * FROM fattura_righe WHERE fattura_id = ? AND tipo <> 'bollo'", nota.id).filter(r => r.gruppo);
    const righeFattura = this.righeVisibili(fattura.id).filter(r => r.tipo !== 'bollo');
    const gruppi = Array.from(new Set(righeNota.filter(r => r.origine === 'bozza').map(r => r.gruppo)));
    return gruppi.filter(g => {
      const originali = righeFattura.filter(r => r.gruppo === g);
      const usate = new Set();
      return originali.length > 0 && originali.every(o => {
        const n = righeNota.find(x => !usate.has(x.id) && x.gruppo === g && centesimi(x.importo) === centesimi(o.importo) && x.tipo === o.tipo);
        if (n) usate.add(n.id);
        return !!n;
      });
    });
  },

  /**
   * Una nota di credito emessa: i gruppi scelti (o stornati per intero) della
   * fattura collegata tornano da fatturare; se le note coprono tutto il totale,
   * la fattura e' annullata.
   */
  effettiNota(nota, libera) {
    if (!nota.fattura_collegata_id) return;
    const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', nota.fattura_collegata_id);
    if (!f) return;
    const etichetta = 'nota di credito ' + (nota.numero || nota.riferimento);
    const gruppi = Array.isArray(libera) ? libera : this.gruppiStornati(nota, f);
    for (const g of gruppi) {
      const sorgenti = this.db.righe('SELECT * FROM fattura_sorgenti WHERE fattura_id = ? AND gruppo = ? AND attiva = 1', f.id, g);
      this.liberaGruppo(f.id, g, etichetta);
      if (f.stato === 'emessa' || f.stato === 'annullata') {
        for (const s of sorgenti) this.togliFatturata(s.tipo, s.sorgente_id, 'stornato dalla ' + etichetta);
      }
    }
    const note = this.db.righe("SELECT totale FROM fatture WHERE tipo = 'nota' AND stato = 'emessa' AND fattura_collegata_id = ?", f.id);
    const coperto = centesimi(note.reduce((t, n) => t + numero(n.totale), 0));
    if (f.stato === 'emessa' && coperto >= centesimi(numero(f.totale)) - 0.001) {
      const ora = adesso();
      this.aggiorna('fatture', f.id, { stato: 'annullata', annullata_il: ora, modificato: ora }, 'id', 'annullata dalla ' + etichetta);
    }
    this.aggiornaProposte();
  },

  // ------------------------------------------------------------------ note di credito (§9.5)

  /**
   * preparaNotaCredito {idFattura, tutta?, righe?: [{idRiga, importo?}], motivo}:
   * da un'emessa. tutta = tutte le righe; righe = solo quelle (un importo piu'
   * piccolo e' uno storno parziale). Stessi parametri fiscali della fattura.
   */
  preparaNotaCredito(d) {
    const f = this.rigaFattura(d.idFattura);
    if (f.tipo !== 'fattura' || f.stato !== 'emessa') throw new Rifiuto('La nota di credito si prepara da una fattura emessa');
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Motivo: scrivi perché la correggi');
    const originali = this.righeVisibili(f.id).filter(r => r.tipo !== 'bollo');
    let scelte;
    if (si(d.tutta)) scelte = originali.map(r => ({ r, importo: r.importo }));
    else {
      const lista = Array.isArray(d.righe) ? d.righe : [];
      if (!lista.length) throw new Rifiuto('Scegli le righe da stornare, o tutta la fattura');
      scelte = lista.map(x => {
        const r = originali.find(o => o.id === Number(x.idRiga));
        if (!r) throw new Rifiuto('Riga ' + testo(x.idRiga) + ' non trovata nella fattura ' + this.etichettaFattura(f));
        const importo = x.importo === undefined || x.importo === null || x.importo === '' ? r.importo : centesimi(numero(x.importo));
        if (!(importo > 0)) throw new Rifiuto('Importo: scrivi quanto stornare');
        if (importo > centesimi(r.importo)) throw new Rifiuto('Si storna al massimo quello che c\'è: ' + C.euroIt(r.importo) + ' €');
        return { r, importo };
      });
    }
    const id = this.creaBozza({
      tipo: 'nota', tipo_documento: 'TD04', fattura_collegata_id: f.id, cliente_id: f.cliente_id, commessa_id: f.commessa_id,
      causale: 'Nota di credito per la fattura ' + (f.numero || f.riferimento) + ': ' + motivo, motivo,
      regime: f.regime, iva_percentuale: f.iva_percentuale, eppi_percentuale: f.eppi_percentuale, ritenuta_percentuale: f.ritenuta_percentuale,
      ritenuta_applicata: f.ritenuta_applicata, bollo_soglia: f.bollo_soglia, bollo_importo: f.bollo_importo, bollo_rivalsa: f.bollo_rivalsa,
      giorni_pagamento: 0, fine_mese: 0, modalita_pagamento: f.modalita_pagamento, conto_id: f.conto_id,
    });
    scelte.forEach((x, i) => {
      const intera = centesimi(x.importo) === centesimi(x.r.importo);
      this.inserisci('fattura_righe', {
        fattura_id: id, ordine: i + 1, origine: 'bozza', gruppo: x.r.gruppo, tipo: x.r.tipo,
        descrizione: (intera ? 'Storno: ' : 'Storno parziale: ') + x.r.descrizione,
        quantita: intera ? x.r.quantita : 1, unita: intera ? x.r.unita : '', prezzo: intera ? x.r.prezzo : x.importo, importo: x.importo,
        aliquota_iva: x.r.aliquota_iva, natura: x.r.natura, soggetta_ritenuta: x.r.soggetta_ritenuta, tributo_cliente: x.r.tributo_cliente,
        commessa_id: x.r.commessa_id, periodo_da: x.r.periodo_da, periodo_a: x.r.periodo_a, importo_sorgenti: x.r.importo,
      });
    });
    this.ricalcolaFattura(id);
    // Non si storna piu' del totale della fattura (contando le altre note vive o emesse).
    const nota = this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
    const altre = this.db.righe("SELECT totale FROM fatture WHERE tipo = 'nota' AND fattura_collegata_id = ? AND id <> ? AND stato IN ('bozza', 'pronta', 'emessa')", f.id, id);
    const resta = centesimi(numero(f.totale) - altre.reduce((t, n) => t + numero(n.totale), 0));
    if (numero(nota.totale) > resta + 0.001) throw new Rifiuto('Si storna al massimo quello che c\'è: ' + C.euroIt(Math.max(resta, 0)) + ' €');
    const fatta = this.fatturaCompleta(nota);
    fatta.tornanoDaFatturare = this.gruppiStornati(nota, f).map(g => ({
      gruppo: g, sorgenti: this.db.righe('SELECT tipo, sorgente_id FROM fattura_sorgenti WHERE fattura_id = ? AND gruppo = ? AND attiva = 1', f.id, g)
        .map(s => ({ tipo: s.tipo, id: s.sorgente_id, descrizione: this.descrizioneSorgente(s.tipo, s.sorgente_id) })),
    }));
    return { ok: true, fattura: fatta };
  },

  // ------------------------------------------------------------------ fatturate fuori da Wisper

  /**
   * segnaFatturataFuori {voci: [{tipo, id}], nota?, annulla?}: per il passaggio,
   * le cose gia' fatturate prima di Wisper. annulla = toglie il segno (solo a
   * quelle segnate cosi', senza fattura in Wisper).
   */
  segnaFatturataFuori(d) {
    const voci = Array.isArray(d.voci) ? d.voci : [];
    if (!voci.length) throw new Rifiuto('Scegli cosa segnare come fatturato');
    const annulla = si(d.annulla);
    const nota = annulla ? 'tolto il segno "fatturata fuori da Wisper"' : 'fatturata fuori da Wisper' + (testo(d.nota) ? ': ' + testo(d.nota) : '');
    const fatte = [];
    for (const x of voci) {
      const tipo = testo(x && x.tipo);
      const id = testo(x && x.id);
      if (TIPI_SORGENTE.indexOf(tipo) < 0) throw new Rifiuto('Tipo: scadenza, rapportino, spesa, ore o ticket');
      const gia = this.sorgenteAttiva(tipo, id);
      if (gia) throw new Rifiuto(this.fraseGiaRiservata(tipo, id, gia));
      const riga = this.rigaSorgente(tipo, id);
      if (!riga) throw new Rifiuto(this.nomeSorgente(tipo, id) + ' non trovata');
      // Fase 5: un ticket "una riga per l'intervento" fatturato fuori porta con se' rapportini, spese e ore che ha dentro.
      if (tipo === 'ticket') {
        if (riga.stato !== 'chiuso' || riga.fatturazione !== 'ticket') throw new Rifiuto('Il ticket ' + riga.numero + ' non è chiuso con «Una riga per l\'intervento»');
        const voceT = annulla ? null : this.voceTicket(riga);
        if (voceT && !voceT.pronta && !this.fatturataFuori('ticket', riga)) throw new Rifiuto('Il ticket ' + riga.numero + ' non è ancora pronto: ' + voceT.perche);
        const dentro = voceT ? voceT.dentro.concat(voceT.anticipazioni.map(s => ({ tipo: 'spesa', id: s.id }))) : [];
        if (annulla) {
          if (!this.fatturataFuori('ticket', riga)) throw new Rifiuto('Il ticket ' + riga.numero + ' non è segnato come fatturato fuori da Wisper');
          this.togliFatturata('ticket', riga.numero, nota);
          const c = this.contenutoTicket(riga);
          for (const r of c.rapportini) if (testo(r.stato).toUpperCase() === 'FATTURATO' && !this.sorgenteAttiva('rapportino', r.id)) this.togliFatturata('rapportino', r.id, nota);
          for (const s of c.spese) if (s.fatturata_il && !this.sorgenteAttiva('spesa', s.id)) this.togliFatturata('spesa', s.id, nota);
          for (const o of c.ore) if (o.fatturata_il && !this.sorgenteAttiva('ore', o.id)) this.togliFatturata('ore', o.id, nota);
        } else {
          if (this.fatturataFuori('ticket', riga)) continue;
          this.segnaSorgenteFatturata('ticket', riga.numero, oggi(), null, nota);
          for (const x of dentro) if (!this.sorgenteAttiva(x.tipo, x.id)) this.segnaSorgenteFatturata(x.tipo, x.id, oggi(), null, nota);
        }
        fatte.push({ tipo, id });
        continue;
      }
      if (annulla) {
        if (!this.fatturataFuori(tipo, riga)) throw new Rifiuto(this.nomeSorgente(tipo, id) + ' non è segnata come fatturata fuori da Wisper');
        this.togliFatturata(tipo, riga.id, nota);
      } else {
        if (this.fatturataFuori(tipo, riga)) continue;
        if (tipo === 'spesa' && riga.rapportino_id) throw new Rifiuto('La spesa ' + riga.id + ' è del rapportino ' + riga.rapportino_id + ': si segna fatturata col suo rapportino');
        if (tipo === 'rapportino') {
          if (this.livello('fatturazione') < 2) throw senzaPermesso('segnare i rapportini come fatturati');
          // 06/11/2026: anche Da inviare (niente firma); un annullato no.
          if ((testo(riga.stato).toUpperCase() || 'BOZZA') === 'ANNULLATO') throw new Rifiuto('Il rapportino ' + riga.id + ' è annullato');
        }
        this.segnaSorgenteFatturata(tipo, riga.id, oggi(), null, nota);
      }
      fatte.push({ tipo, id });
    }
    return { ok: true, fatte: fatte.length, voci: fatte };
  },

  rigaSorgente(tipo, id) {
    if (tipo === 'rapportino') return this.db.riga('SELECT * FROM rapportini WHERE id = ?', id);
    if (tipo === 'ticket') return this.db.riga('SELECT * FROM ticket WHERE numero = ?', String(id));
    if (tipo === 'scadenza') return this.db.riga('SELECT * FROM scadenze_pagamento WHERE id = ?', Number(id) || 0);
    if (tipo === 'spesa') return this.db.riga('SELECT * FROM spese WHERE id = ?', Number(id) || 0);
    return this.db.riga('SELECT * FROM ore WHERE id = ?', Number(id) || 0);
  },

  fatturataFuori(tipo, r) {
    if (tipo === 'rapportino') return testo(r.stato).toUpperCase() === 'FATTURATO';
    if (tipo === 'ticket') return !!testo(r.fatturato_il);
    if (tipo === 'scadenza') return r.stato === 'fatturata';
    return !!testo(r.fatturata_il);
  },

  // ------------------------------------------------------------------ avviso di parcella

  /** inviaAvviso {id, a, cc?, oggetto?, messaggio?, allegati}: come inviaEmail col PDF dell'avviso. Non cambia lo stato. */
  async inviaAvviso(d) {
    const f = this.rigaFattura(d.id);
    if (f.tipo !== 'fattura' || ['bozza', 'pronta'].indexOf(f.stato) < 0) throw new Rifiuto('L\'avviso di parcella si manda prima di emettere la fattura');
    const a = testo(d.a);
    if (!a) throw new Rifiuto('Manca l\'indirizzo del cliente');
    if (!this.postino || !this.postino.configurato()) throw new Rifiuto('Le email non sono collegate: manca il postino (WISPER_POSTINO_URL nel .env del server)');
    const imp = this.leggiImpostazioni();
    const posta = {
      a, nome: testo(imp.RAGIONE_SOCIALE) || 'Wisper', oggetto: testo(d.oggetto) || 'Avviso di parcella', messaggio: testo(d.messaggio) || ' ',
      allegati: (d.allegati || []).map(x => ({ nome: x.nome || 'avviso di parcella.pdf', mime: x.mime || 'application/pdf', base64: x.base64 })),
    };
    if (testo(d.cc)) posta.cc = testo(d.cc);
    if (testo(imp.EMAIL)) posta.rispondiA = testo(imp.EMAIL);
    try {
      await this.postino.email(posta);
    } catch (err) {
      throw new Rifiuto('L\'email non è partita: ' + err.message, err.rete ? { rete: true } : {});
    }
    return this.db.transazione(() => {
      this.aggiorna('fatture', f.id, { avviso_inviato_il: adesso(), modificato: adesso() }, 'id', 'avviso di parcella mandato a ' + a);
      // Fase 5: la copia del PDF mandato (COPIA_INVIATI), nella categoria Mandati ai clienti.
      const copie = this.copiaInviati({ allegati: posta.allegati, a, idCliente: f.cliente_id, idCommessa: f.commessa_id });
      // Fase 7: lo storico (§9.1).
      this.scriviComunicazione({ canale: 'email', tipo: 'avviso_parcella', cliente_id: f.cliente_id, fattura_id: f.id, commessa_id: f.commessa_id || '', a, oggetto: posta.oggetto,
        testo: posta.messaggio, allegati: (posta.allegati || []).map(x => ({ nome: x.nome, byte: Buffer.from(String(x.base64 || ''), 'base64').length })),
        documento_id: copie.length ? copie[0] : null, stato: 'mandato' });
      return { ok: true, fattura: this.fatturaCompleta(this.db.riga('SELECT * FROM fatture WHERE id = ?', f.id)) };
    });
  },

  // ------------------------------------------------------------------ scadenze di pagamento, commessa, riepilogo

  /** scadenzePagamento {idCommessa?, stato?}: le scadenze delle commesse con lo stato visto. */
  scadenzePagamento(d) {
    d = d || {};
    const attive = this.sorgentiAttive();
    const commesse = {};
    this.db.righe('SELECT * FROM commesse').forEach(m => { commesse[String(m.id).toUpperCase()] = m; });
    const clienti = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { clienti[s.id] = s.nome; });
    const contratti = {};
    this.db.righe('SELECT id, numero, revisione FROM preventivi').forEach(p => { contratti[p.id] = etichettaPreventivo(p); });
    const fatture = {};
    const righe = this.db.righe("SELECT * FROM scadenze_pagamento WHERE commessa_id <> ''" + (testo(d.idCommessa) ? ' AND commessa_id = ? COLLATE NOCASE' : '') + ' ORDER BY commessa_id, ordine, id',
      ...(testo(d.idCommessa) ? [testo(d.idCommessa)] : []));
    const fatturaDi = id => {
      if (!id) return null;
      if (!fatture[id]) {
        const f = this.db.riga('SELECT * FROM fatture WHERE id = ?', id);
        fatture[id] = f ? Object.assign({ p: this.pagamentoDi(f) }, f) : null;
      }
      return fatture[id];
    };
    const scadenze = righe.map(s => {
      const a = attive.get('scadenza|' + s.id);
      const f = fatturaDi(a ? a.fattura_id : s.fattura_id);
      let stato = 'prevista';
      if (a && VIVE.indexOf(a.stato) >= 0) stato = 'in_bozza';
      else if (s.stato === 'fatturata') stato = f && f.p.pagamento === 'pagata' ? 'incassata' : 'fatturata';
      const m = commesse[String(s.commessa_id).toUpperCase()];
      return {
        id: s.id, idCommessa: s.commessa_id, commessa: m ? m.descrizione : '', idCliente: m ? m.cliente_id : '', cliente: m ? clienti[m.cliente_id] || '' : '',
        contratto: s.preventivo_id ? contratti[s.preventivo_id] || '' : '', descrizione: s.descrizione, quando: s.quando, data: s.data,
        importo: numero(s.importo), stato, idFattura: f ? f.id : null, fattura: f ? (f.numero || f.riferimento) : '', fuoriDaWisper: s.stato === 'fatturata' && !f,
      };
    }).filter(s => !testo(d.stato) || s.stato === testo(d.stato));
    const perCommessa = new Map();
    for (const s of scadenze) {
      if (!perCommessa.has(s.idCommessa)) perCommessa.set(s.idCommessa, []);
      perCommessa.get(s.idCommessa).push(s);
    }
    const riassunti = Array.from(perCommessa, ([id, lista]) => {
      const m = commesse[String(id).toUpperCase()];
      return {
        idCommessa: id, commessa: lista[0].commessa, idCliente: lista[0].idCliente, cliente: lista[0].cliente,
        contratto: m && m.importo_contratto !== null ? m.importo_contratto : centesimi(lista.reduce((t, s) => t + s.importo, 0)),
        fatturato: centesimi(lista.filter(s => s.stato === 'fatturata' || s.stato === 'incassata').reduce((t, s) => t + s.importo, 0)),
        scadenze: lista,
      };
    });
    return { ok: true, scadenze, commesse: riassunti };
  },

  /** fatturazioneCommessa {id}: i numeri della barra della commessa (§13.1). */
  fatturazioneCommessa(d) {
    const m = this.db.riga('SELECT * FROM commesse WHERE id = ?', testo(d.id));
    if (!m) throw new Rifiuto('Commessa ' + testo(d.id) + ' non trovata');
    const id = m.id;
    const stessa = x => String(x || '').toUpperCase() === String(id).toUpperCase();
    const fatture = this.db.righe("SELECT * FROM fatture WHERE stato IN ('bozza', 'pronta', 'emessa', 'annullata')");
    let fatturato = 0;
    let inBozza = 0;
    let incassato = 0;
    const sue = [];
    const a = this.aiutiFatture(fatture);
    for (const f of fatture) {
      const righe = this.righeVisibili(f.id).filter(r => r.tipo === 'compenso');
      const qui = centesimi(righe.filter(r => stessa(r.commessa_id) || (!r.commessa_id && stessa(f.commessa_id))).reduce((t, r) => t + numero(r.importo), 0));
      if (!(qui > 0) && !stessa(f.commessa_id)) continue;
      sue.push(f);
      const segno = f.tipo === 'nota' ? -1 : 1;
      if (f.stato === 'emessa' || f.stato === 'annullata') {
        fatturato = centesimi(fatturato + segno * qui);
        if (f.tipo === 'fattura' && numero(f.compenso) > 0) incassato = centesimi(incassato + this.pagamentoDi(f, a).incassato * qui / numero(f.compenso));
      } else if (f.tipo === 'fattura') inBozza = centesimi(inBozza + qui);
    }
    const daFatturare = centesimi(this.sorgentiDaFatturare({ idCommessa: id }).filter(v => v.pronta).reduce((t, v) => t + v.importo, 0));
    const scadenze = this.scadenzePagamento({ idCommessa: id }).scadenze;
    const previsto = centesimi(scadenze.filter(s => s.stato === 'prevista').reduce((t, s) => t + s.importo, 0));
    return {
      ok: true, idCommessa: id, modoFatturazione: m.modo_fatturazione,
      contratto: m.importo_contratto === null ? null : m.importo_contratto, fatturato, incassato: centesimi(incassato), daFatturare, inBozza, previsto,
      scadenze, fatture: sue.map(f => this.riassuntoFattura(f, a)),
    };
  },

  /**
   * riepilogoFatturato {anno, per: mese|cliente|commessa}: le emesse dell'anno
   * per data, meno le note di credito. incassato: gli incassi dell'anno (per
   * mese: il mese del movimento).
   */
  riepilogoFatturato(d) {
    const anno = testo(d.anno) || oggi().slice(0, 4);
    if (!/^\d{4}$/.test(anno)) throw new Rifiuto('Anno: scrivilo con quattro cifre, per esempio 2026');
    const per = testo(d.per) || 'mese';
    if (['mese', 'cliente', 'commessa'].indexOf(per) < 0) throw new Rifiuto('Per: mese, cliente o commessa');
    const righe = this.db.righe("SELECT * FROM fatture WHERE stato IN ('emessa', 'annullata') AND substr(data, 1, 4) = ? ORDER BY data, id", anno);
    const clienti = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { clienti[s.id] = s.nome; });
    const commesse = {};
    this.db.righe('SELECT id, descrizione FROM commesse').forEach(m => { commesse[String(m.id).toUpperCase()] = m.descrizione; });
    const gruppi = new Map();
    const chiaveDi = f => (per === 'mese' ? f.data.slice(0, 7) : per === 'cliente' ? f.cliente_id : (f.commessa_id || ''));
    const nomeDi = k => (per === 'mese' ? C.nomeMese(k) : per === 'cliente' ? clienti[k] || k : (k ? commesse[String(k).toUpperCase()] || k : 'Più commesse o nessuna'));
    const gruppo = k => {
      if (!gruppi.has(k)) gruppi.set(k, { chiave: k, nome: nomeDi(k), fatture: 0, compenso: 0, contributo: 0, iva: 0, anticipazioni: 0, totale: 0, ritenute: 0, incassato: 0 });
      return gruppi.get(k);
    };
    if (per === 'mese') for (let m = 1; m <= 12; m++) { const k = anno + '-' + String(m).padStart(2, '0'); if (k <= oggi().slice(0, 7) || righe.some(f => f.data.slice(0, 7) === k)) gruppo(k); }
    for (const f of righe) {
      const g = gruppo(chiaveDi(f));
      const s = f.tipo === 'nota' ? -1 : 1;
      if (f.tipo === 'fattura') g.fatture++;
      g.compenso = centesimi(g.compenso + s * numero(f.compenso));
      g.contributo = centesimi(g.contributo + s * numero(f.contributo));
      g.iva = centesimi(g.iva + s * numero(f.iva));
      g.anticipazioni = centesimi(g.anticipazioni + s * numero(f.anticipazioni));
      g.totale = centesimi(g.totale + s * numero(f.totale));
      g.ritenute = centesimi(g.ritenute + s * numero(f.ritenuta));
    }
    // Gli incassi dell'anno (movimenti non annullati abbinati a fatture).
    for (const x of this.db.righe(
      "SELECT a.importo, m.data, f.cliente_id, f.commessa_id FROM movimento_abbinamenti a JOIN movimenti m ON m.id = a.movimento_id JOIN fatture f ON f.id = a.fattura_id WHERE m.annullato = 0 AND substr(m.data, 1, 4) = ?",
      anno)) {
      const k = per === 'mese' ? x.data.slice(0, 7) : per === 'cliente' ? x.cliente_id : (x.commessa_id || '');
      const g = gruppo(k);
      g.incassato = centesimi(g.incassato + numero(x.importo));
    }
    const lista = Array.from(gruppi.values());
    if (per === 'mese') lista.sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
    else lista.sort((a, b) => b.compenso - a.compenso || String(a.nome).localeCompare(String(b.nome), 'it'));
    const somma = k => centesimi(lista.reduce((t, g) => t + g[k], 0));
    const totali = { fatture: lista.reduce((t, g) => t + g.fatture, 0), compenso: somma('compenso'), contributo: somma('contributo'), iva: somma('iva'),
      anticipazioni: somma('anticipazioni'), totale: somma('totale'), ritenute: somma('ritenute'), incassato: somma('incassato') };
    return { ok: true, anno: Number(anno), per, righe: lista, totali, fatturato: totali.compenso, incassato: totali.incassato };
  },

  /** confermaRegoleFiscali {data, commercialista}: solo il titolare. {data: null} toglie la conferma. */
  confermaRegoleFiscali(d) {
    const c = this.chi();
    if (!c.sistema && !(c.utente && c.utente.ruolo === 'titolare')) throw senzaPermesso('confermare le regole fiscali (lo fa solo il titolare)');
    let valore = null;
    let nota;
    if (d.data === null || d.data === '' || d.data === undefined && !testo(d.commercialista)) {
      nota = 'conferma delle regole tolta';
    } else {
      const data = dataDaIso(d.data);
      const chi = testo(d.commercialista);
      if (!chi) throw new Rifiuto('Commercialista: scrivi chi ha controllato le regole');
      valore = { data, commercialista: chi, da: c.utente ? c.utente.id : null };
      nota = 'regole confermate dal commercialista il ' + C.dataIt(data);
    }
    const v = JSON.stringify(valore);
    if (this.db.riga("SELECT chiave FROM impostazioni WHERE chiave = 'REGOLE_FISCALI_CONFERMATE'")) {
      this.aggiorna('impostazioni', 'REGOLE_FISCALI_CONFERMATE', { valore: v }, 'chiave', nota);
    } else {
      this.inserisci('impostazioni', { chiave: 'REGOLE_FISCALI_CONFERMATE', valore: v, descrizione: '' }, 'chiave', nota);
    }
    return { ok: true, regoleConfermate: valore, impostazioni: this.leggiImpostazioni() };
  },
};

Object.defineProperties(module.exports, {
  ultimeCifre: { value: ultimeCifre },
  ibanCoperto: { value: ibanCoperto },
  chiavePiva: { value: chiavePiva },
  nomeECognome: { value: nomeECognome },
  giornoLungo: { value: giornoLungo },
  VIVE: { value: VIVE },
});
