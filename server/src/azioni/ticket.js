/*
 * Ticket e assistenza (fase 5, accordo in docs/gestionale/fase5.md §7 e §9,
 * risposte in architettura.md §16).
 *
 * Un ticket non e' un posto nuovo dove riscrivere le cose (§3.2): l'intervento
 * e' un'attivita' del calendario della fase 2 (tipo "intervento"), le ore sono
 * ore e le spese sono spese della fase 3, il rapportino e' quello di sempre. Il
 * ticket le tiene insieme (ticket_id) e misura i tempi: presa in carico,
 * intervento, risoluzione, chiusura.
 *
 * Alla chiusura il titolare o l'amministrazione sceglie come si fattura:
 * "ticket" (una riga per l'intervento, sorgente nuova di Da fatturare con lo
 * stesso indice unico della fase 4), "separati" (con gli altri rapportini),
 * "contratto" (nel canone), "no" (non si fattura, col motivo). Finche' il
 * ticket e' aperto i suoi rapportini, ore e spese non compaiono in Da fatturare.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, numero, centesimi, adesso, oggi, dataIso, dataDaIso, dataOraIso, istante, piuGiorni, adessoMs } = require('../utili');
const C = require('../conti');
const { soldiPropri } = require('../permessi');

const TIPI = { guasto: 'Guasto', verifica: 'Verifica', piccolo: 'Piccolo intervento', assistenza: 'Assistenza', programmato: 'Programmato' };
const ORIGINI = { telefono: 'Telefono', email: 'Email', sopralluogo: 'Sopralluogo', ufficio: 'Ufficio', scadenza: 'Da una scadenza', whatsapp: 'WhatsApp', portale: 'Portale' };
const PRIORITA = { urgente: 'Urgente', alta: 'Alta', normale: 'Normale', bassa: 'Bassa' };
const ORDINE_PRIORITA = { urgente: 0, alta: 1, normale: 2, bassa: 3 };
const STATI = { aperto: 'Aperto', in_carico: 'In carico', in_attesa: 'In attesa', risolto: 'Risolto', chiuso: 'Chiuso', annullato: 'Annullato' };
const IMPATTI = ['fermo', 'ridotto', 'nessuno'];
const URGENZE = ['subito', 'presto', 'quando_si_puo'];
const MODI = { ticket: 'Una riga per l\'intervento', separati: 'Con gli altri rapportini', contratto: 'Nel contratto', no: 'Non si fattura' };
const MODI_CHIUSO = { ticket: 'una riga per l\'intervento', separati: 'con gli altri rapportini', contratto: 'nel contratto', no: 'non si fattura' };
const MODI_BREVI = { ticket: 'Una riga', separati: 'Con i rapportini', contratto: 'Nel contratto', no: 'Non si fattura' };
const VIVI = ['aperto', 'in_carico', 'in_attesa', 'risolto'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const CATEGORIE_IMPIANTO = { cabina_mt: 'Cabina MT', quadro: 'Quadro', terra: 'Impianto di terra', scariche: 'Protezione dalle scariche', fotovoltaico: 'Fotovoltaico',
  automazione: 'Automazione', illuminazione: 'Illuminazione', altro: 'Altro' };
const AMBIENTI = { ordinario: 'Ordinario', cantiere: 'Cantiere', medico: 'Locale medico', incendio: 'Rischio di incendio', esplosione: 'Rischio di esplosione' };
const PER_PAGINA_STORICO = 30;

const vuoto = v => v === undefined || v === null || v === '';
const si = v => v === true || v === 1 || v === '1' || v === 'true';
const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
const dataBreve = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '');
/** "9:40" da un istante. */
const oraBreve = ist => { const o = dataOraIso(ist).slice(11, 16); return o ? Number(o.slice(0, 2)) + ':' + o.slice(3) : ''; };
/** "giovedì 23 alle 9:00" da un istante. */
const quandoLungo = ist => { const g = dataIso(ist); return g ? GIORNI[new Date(g + 'T12:00:00').getDay()] + ' ' + Number(g.slice(8, 10)) + ' alle ' + oraBreve(ist) : ''; };
const ore = (da, a) => (Date.parse(a) - Date.parse(da)) / 3600000;
const unaCifra = n => Math.round(n * 10) / 10;
const quanto = n => { const h = Math.round(n); if (h < 1) { const m = Math.max(1, Math.round(n * 60)); return m + (m === 1 ? ' minuto' : ' minuti'); } if (h < 48) return h + (h === 1 ? ' ora' : ' ore'); const g = Math.round(n / 24); return g + ' giorni'; };

module.exports = {
  // ------------------------------------------------------------------ trovare e vedere

  /** L'id interno di un ticket da quello che arriva: l'id, il numero (TK/2026/0014) o l'idLocale di uno nato senza rete. */
  idTicketDa(v) {
    const s = testo(v);
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    const t = this.db.riga('SELECT id FROM ticket WHERE numero = ? OR id_locale = ?', s, s);
    return t ? t.id : -1;
  },

  /** Il collaboratore vede i suoi, quelli da prendere, quelli delle sue commesse, quelli con un suo intervento o un suo rapportino. */
  vedeTicket(t, aiuti) {
    if (!t) return false;
    if (this.livello('ticket') < 1) return false;
    if (!this.soloSuoi()) return true;
    const io = this.chi().utente.id;
    // Fase 6: l'esterno vede solo i ticket dove e' responsabile o ha un intervento (o un suo rapportino): non quelli liberi.
    if (this.eEsterno()) {
      if (t.responsabile_id === io) return true;
      const v = aiuti || this.aiutiVisibilita();
      return v.conMioIntervento.has(t.id) || v.conMioRapportino.has(t.id);
    }
    if (t.responsabile_id === io || t.responsabile_id === null || t.creato_da === io) return true;
    const a = aiuti || this.aiutiVisibilita();
    if (t.commessa_id && a.mie.has(String(t.commessa_id).toUpperCase())) return true;
    return a.conMioIntervento.has(t.id) || a.conMioRapportino.has(t.id);
  },

  aiutiVisibilita() {
    const io = this.chi().utente ? this.chi().utente.id : 0;
    return {
      mie: this.mieCommesse(),
      conMioIntervento: new Set(this.db.righe("SELECT DISTINCT ticket_id FROM attivita WHERE ticket_id IS NOT NULL AND assegnata_a = ? AND stato <> 'annullata'", io).map(r => r.ticket_id)),
      conMioRapportino: new Set(this.db.righe('SELECT DISTINCT ticket_id FROM rapportini WHERE ticket_id IS NOT NULL AND utente_id = ?', io).map(r => r.ticket_id)),
    };
  },

  /** Un ticket "suo" per il collaboratore: assegnato a lui, o nato da lui e non assegnato. */
  suoTicket(t) {
    if (!this.soloSuoi()) return true;
    const io = this.chi().utente.id;
    return t.responsabile_id === io || (t.responsabile_id === null && t.creato_da === io);
  },

  rigaTicket(id) {
    const n = this.idTicketDa(id);
    const t = n !== null && n > 0 ? this.db.riga('SELECT * FROM ticket WHERE id = ?', n) : null;
    if (!t || !this.vedeTicket(t)) throw new Rifiuto('Ticket ' + testo(id) + ' non trovato');
    return t;
  },

  /** Chi chiude (e sceglie come si fattura): titolare e amministrazione, col ticket in scrittura e il permesso dei soldi. */
  puoChiudereTicket() {
    const c = this.chi();
    if (c.sistema) return true;
    return !!c.utente && !this.soloSuoi() && this.livello('ticket') >= 2 && this.vedeCosti();
  },

  // ------------------------------------------------------------------ tempi e priorita' (§7.2)

  /** Le ore di presa e d'intervento per priorita': TICKET_TEMPI, cambiate dai "tempi" del contratto. */
  tempiTicket(idContratto) {
    let tempi = this.leggiImpostazioni().TICKET_TEMPI;
    if (typeof tempi === 'string') { try { tempi = JSON.parse(tempi); } catch (e) { tempi = null; } }
    const base = { urgente: { presa: 1, intervento: 4 }, alta: { presa: 2, intervento: 24 }, normale: { presa: 8, intervento: 72 }, bassa: { presa: 24, intervento: 240 } };
    const out = {};
    for (const p of Object.keys(base)) out[p] = Object.assign({}, base[p], (tempi && tempi[p]) || {});
    if (idContratto) {
      const c = this.db.riga('SELECT tempi FROM contratti WHERE id = ?', idContratto);
      let ct = null;
      try { ct = c && c.tempi ? JSON.parse(c.tempi) : null; } catch (e) { ct = null; }
      if (ct) for (const p of Object.keys(ct)) if (out[p]) Object.assign(out[p], ct[p]);
    }
    return out;
  },

  /** entro_presa e entro_intervento (ore di calendario dall'apertura; i programmati: la fine del giorno previsto). */
  entroTicket(v) {
    if (v.tipo === 'programmato' && v.previsto_il) return { entro_presa: '', entro_intervento: istante(new Date(v.previsto_il + 'T23:59:59')) };
    const t = this.tempiTicket(v.contratto_id)[v.priorita] || { presa: 8, intervento: 72 };
    const da = Date.parse(v.aperto_il);
    return { entro_presa: istante(new Date(da + numero(t.presa) * 3600000)), entro_intervento: istante(new Date(da + numero(t.intervento) * 3600000)) };
  },

  /** Ritardo: oltre entro_intervento senza intervento, o oltre entro_presa senza presa ("Da prendere da 2 ore"). */
  ritardoTicket(t) {
    if (VIVI.indexOf(t.stato) < 0 || t.stato === 'risolto') return '';
    const ora = adessoMs();
    if (t.entro_intervento && !t.intervento_il && ora > Date.parse(t.entro_intervento)) return 'Intervento in ritardo da ' + quanto(ore(t.entro_intervento, istante()));
    if (t.entro_presa && !t.preso_il && ora > Date.parse(t.entro_presa)) return 'Da prendere da ' + quanto(ore(t.entro_presa, istante()));
    return '';
  },

  /**
   * intervento_il = il primo fra: l'inizio di un'attivita' del ticket segnata
   * fatta, la nascita del primo rapportino del ticket, la prima riga di ore del
   * ticket, la risoluzione. Si rifa' a ogni cambio di queste cose.
   */
  ricalcolaIntervento(idTicket) {
    const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', idTicket);
    if (!t) return;
    const candidati = [];
    this.db.righe("SELECT inizio, fatta_il FROM attivita WHERE ticket_id = ? AND stato = 'fatta'", t.id).forEach(a => candidati.push(a.inizio || a.fatta_il));
    this.db.righe("SELECT creato FROM rapportini WHERE ticket_id = ? AND UPPER(stato) <> 'ANNULLATO'", t.id).forEach(r => candidati.push(r.creato));
    this.db.righe('SELECT creato FROM ore WHERE ticket_id = ? AND tolta IS NULL', t.id).forEach(o => candidati.push(o.creato));
    if (t.risolto_il) candidati.push(t.risolto_il);
    const validi = candidati.filter(x => x && !isNaN(Date.parse(x))).sort((x, y) => Date.parse(x) - Date.parse(y));
    const primo = validi.length ? validi[0] : '';
    if (primo !== t.intervento_il) this.db.esegui('UPDATE ticket SET intervento_il = ? WHERE id = ?', primo, t.id);
  },

  /** Una riga della cronologia del ticket (non va nel registro: e' gia' una cronologia). */
  eventoTicket(idTicket, frase) {
    const c = this.chi();
    this.db.esegui('INSERT INTO ticket_eventi (ticket_id, quando, utente_id, testo) VALUES (?, ?, ?, ?)', idTicket, adesso(), c.utente ? c.utente.id : null, frase);
  },

  nomeUtente(id) {
    if (id === null || id === undefined) return '';
    const u = this.db.riga('SELECT nome FROM utenti WHERE id = ?', id);
    return u ? u.nome : '';
  },

  mioId() {
    return this.chi().utente ? this.chi().utente.id : null;
  },

  // ------------------------------------------------------------------ riservato o fatturato (§7.6, blocchi della fase 4)

  /** Dove sta un ticket in una fattura: {etichetta: "W-16" | "47/2026", frase} o null (anche le sue sorgenti, se separate). */
  ticketInFattura(t, anche) {
    const a = this.sorgenteAttiva('ticket', t.numero);
    if (a) {
      const viva = ['bozza', 'pronta'].indexOf(a.stato) >= 0;
      return { etichetta: viva ? a.riferimento : a.numero || a.riferimento,
        frase: 'Il ticket ' + t.numero + ' è ' + this.doveSta(a) + (viva ? ': toglilo prima dalla bozza' : ': per cambiarlo serve una nota di credito') };
    }
    if (t.fatturato_il) return { etichetta: 'fuori', frase: 'Il ticket ' + t.numero + ' è già fatturato fuori da Wisper' };
    if (anche) {
      const c = this.contenutoTicket(t);
      const cose = c.rapportini.map(r => ['rapportino', r.id]).concat(c.spese.map(s => ['spesa', s.id]), c.ore.map(o => ['ore', o.id]));
      for (const [tipo, id] of cose) {
        const frase = this.fraseSorgenteFerma(tipo, id);
        if (frase) return { etichetta: '', frase };
      }
    }
    return null;
  },

  controllaTicketLibero(t, anche) {
    const r = this.ticketInFattura(t, anche);
    if (r) throw new Rifiuto(r.frase);
  },

  // ------------------------------------------------------------------ il contenuto: rapportini, ore, spese, foto

  /** Le cose del ticket: rapportini non annullati, ore non tolte, spese non tolte (anche quelle dei suoi rapportini). */
  contenutoTicket(t) {
    const rapportini = this.db.righe("SELECT * FROM rapportini WHERE ticket_id = ? AND UPPER(stato) <> 'ANNULLATO' ORDER BY data, id", t.id);
    const ids = rapportini.map(r => r.id);
    const ore = this.db.righe('SELECT * FROM ore WHERE ticket_id = ? AND tolta IS NULL ORDER BY data, id', t.id);
    const spese = this.db.righe('SELECT * FROM spese WHERE tolta IS NULL AND (ticket_id = ?' + (ids.length ? ' OR rapportino_id IN (' + ids.map(() => '?').join(',') + ')' : '') + ') ORDER BY data, id', t.id, ...ids);
    return { rapportini, ore, spese };
  },

  /** Il prezzo di un'ora fuori contratto: la tariffa del contratto, se no quella del cliente o della commessa (fase 4). */
  prezzoOreTicket(t) {
    if (t.contratto_id) {
      const c = this.db.riga('SELECT tariffa_extra FROM contratti WHERE id = ?', t.contratto_id);
      if (c && c.tariffa_extra !== null && c.tariffa_extra !== undefined) return numero(c.tariffa_extra);
    }
    const cli = this.db.riga('SELECT tariffa_fissa FROM soggetti WHERE id = ?', t.cliente_id) || {};
    const m = t.commessa_id ? this.db.riga('SELECT prezzo_orario FROM commesse WHERE id = ?', t.commessa_id) : null;
    return C.prezzoOrarioDi({ tariffaFissa: cli.tariffa_fissa }, { prezzoOrario: m ? m.prezzo_orario : null });
  },

  /**
   * La voce del ticket "una riga per l'intervento" (§7.6): cosa ci va dentro,
   * se e' pronta (e perche' no), l'importo, il gruppo, le righe e le sorgenti.
   * Serve a Da fatturare, alla pagina del ticket (somma) e alla chiusura.
   */
  voceTicket(t, contenuto) {
    const c = contenuto || this.contenutoTicket(t);
    const cliente = this.db.riga('SELECT * FROM soggetti WHERE id = ?', t.cliente_id) || {};
    const sede = t.sede_id ? this.db.riga('SELECT nome FROM sedi WHERE id = ?', t.sede_id) : null;
    const perche = [];
    const rapportini = [];
    for (const r of c.rapportini) {
      const stato = testo(r.stato).toUpperCase();
      if (stato === 'FATTURATO') continue;
      if (stato === 'BOZZA') perche.push(r.id + ' da far firmare');
      else if (r.stato_approvazione === 'da_approvare') perche.push(r.id + ' da approvare');
      else if (r.stato_approvazione === 'respinto') perche.push(r.id + ' respinto');
      rapportini.push(r);
    }
    const speseDiRapportini = new Set(c.rapportini.map(r => r.id));
    const spese = [];
    for (const s of c.spese) {
      if (s.destinazione !== 'cliente' || s.fatturata_il || s.stato === 'respinta') continue;
      if (s.rapportino_id && !speseDiRapportini.has(s.rapportino_id)) continue;
      if (s.stato !== 'approvata' && !s.rapportino_id) perche.push('La spesa «' + (s.descrizione || 'senza descrizione') + '» del ' + dataBreve(s.data) + ' da approvare');
      spese.push(s);
    }
    const prezzo = this.prezzoOreTicket(t);
    const oreRighe = [];
    for (const o of c.ore) {
      if (!o.fatturabile || o.fatturata_il || o.stato === 'respinta') continue;
      if (o.stato !== 'approvata') perche.push('Le ore del ' + dataBreve(o.data) + ' da approvare');
      oreRighe.push(o);
    }
    const speseSenzaRighe = r => {
      const conRighe = this.db.riga('SELECT COUNT(*) n FROM spese WHERE rapportino_id = ?', r.id).n;
      return numero(r.spese) > 0 && !conRighe ? centesimi(numero(r.spese)) : 0;
    };
    const ingresso = {
      ticket: { numero: t.numero, titolo: t.titolo, impianto: sede ? sede.nome : '', risolto: dataIso(t.risolto_il) || dataIso(t.chiuso_il) || oggi(),
        idCommessa: t.commessa_id, prezzoCorpo: t.prezzo_corpo },
      cliente: { pagaViaggio: cliente.paga_viaggio === 1 },
      rapportini: rapportini.map(r => ({
        id: r.id, data: dataIso(r.data), oreLavoro: r.ore_lavoro, oreExtra: r.ore_extra, oreViaggio: r.ore_viaggio, pagaViaggio: r.paga_viaggio === 1,
        compensoOre: r.compenso_ore, km: r.km, euroKm: r.euro_km, rimborsoKm: r.rimborso_km, speseSenzaRighe: speseSenzaRighe(r),
      })),
      spese: spese.map(s => ({ id: s.id, idRapportino: s.rapportino_id || '', data: s.data, descrizione: s.descrizione, importo: s.importo, anticipazione: s.anticipazione === 1 })),
      ore: oreRighe.map(o => ({ id: o.id, ore: o.ore, prezzo: prezzo })),
    };
    const gruppi = C.righeTicket(ingresso);
    const riga = gruppi[0].righe[0];
    const orePagate = Math.round((rapportini.reduce((tot, r) => tot + C.orePagate({ oreLavoro: r.ore_lavoro, oreExtra: r.ore_extra, oreViaggio: r.ore_viaggio, pagaViaggio: r.paga_viaggio === 1 }), 0) +
      (prezzo !== null ? oreRighe.reduce((tot, o) => tot + numero(o.ore), 0) : 0)) * 100) / 100;
    const km = Math.round(rapportini.filter(r => numero(r.rimborso_km) > 0).reduce((tot, r) => tot + numero(r.km), 0) * 100) / 100;
    const materiale = centesimi(spese.filter(s => s.anticipazione !== 1).reduce((tot, s) => tot + numero(s.importo), 0));
    const parti = [sede ? sede.nome : '', rapportini.length ? (rapportini.length === 1 ? '1 rapportino' : rapportini.length + ' rapportini') : '',
      orePagate > 0 ? C.numeroIt(orePagate) + (orePagate === 1 ? ' ora' : ' ore') : '', km > 0 ? C.numeroIt(km) + ' km' : '',
      materiale > 0 ? 'materiale ' + C.euroIt(materiale) + ' €' : '', !vuoto(t.prezzo_corpo) ? 'a corpo' : ''].filter(Boolean);
    return {
      importo: riga.importo, aCorpo: !vuoto(t.prezzo_corpo), pronta: !perche.length, perche: perche.join(', '),
      senzaPrezzo: prezzo === null && oreRighe.length > 0,
      dentro: rapportini.map(r => ({ tipo: 'rapportino', id: r.id })).concat(spese.filter(s => s.anticipazione !== 1).map(s => ({ tipo: 'spesa', id: s.id })), oreRighe.map(o => ({ tipo: 'ore', id: o.id }))),
      anticipazioni: spese.filter(s => s.anticipazione === 1),
      dettaglio: parti.join(' · '), gruppo: 'ticket:' + t.numero, gruppi, ingresso,
      qualcosa: rapportini.length > 0 || oreRighe.length > 0 || spese.length > 0 || !vuoto(t.prezzo_corpo),
    };
  },

  // ------------------------------------------------------------------ le risposte

  aiutiTicket(righe) {
    const a = { utenti: {}, clienti: {}, sedi: {}, commesse: {}, contratti: {}, interventi: {}, rapportini: {}, fatture: {} };
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { a.utenti[u.id] = u.nome; });
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { a.clienti[s.id] = s.nome; });
    this.db.righe('SELECT id, nome, indirizzo, citta FROM sedi').forEach(s => { a.sedi[s.id] = s; });
    this.db.righe('SELECT id, descrizione FROM commesse').forEach(m => { a.commesse[String(m.id).toUpperCase()] = m; });
    this.db.righe('SELECT id, numero FROM contratti').forEach(c => { a.contratti[c.id] = c.numero; });
    const ids = righe.map(t => Number(t.id));
    if (ids.length) {
      const lista = ids.join(',');
      const t0 = oggi();
      for (const x of this.db.righe("SELECT * FROM attivita WHERE ticket_id IN (" + lista + ") AND stato IN ('da_fare', 'in_corso') AND inizio <> '' ORDER BY inizio")) {
        if (dataIso(x.inizio) < t0 || a.interventi[x.ticket_id]) continue;
        a.interventi[x.ticket_id] = x;
      }
      this.db.righe("SELECT ticket_id, COUNT(*) n FROM rapportini WHERE ticket_id IN (" + lista + ") AND UPPER(stato) <> 'ANNULLATO' GROUP BY ticket_id")
        .forEach(r => { a.rapportini[r.ticket_id] = r.n; });
      if (this.livello('fatturazione') > 0 && this.vedeCosti()) {
        for (const s of this.db.righe("SELECT s.sorgente_id, f.id, f.stato, f.riferimento, f.numero FROM fattura_sorgenti s JOIN fatture f ON f.id = s.fattura_id WHERE s.attiva = 1 AND s.tipo = 'ticket'")) {
          a.fatture[s.sorgente_id] = { id: s.id, riferimento: s.riferimento, stato: s.stato, etichetta: ['bozza', 'pronta'].indexOf(s.stato) >= 0 ? 'In bozza ' + s.riferimento : 'Fattura ' + (s.numero || s.riferimento) };
        }
      }
    }
    a.vis = this.soloSuoi() ? this.aiutiVisibilita() : null;
    return a;
  },

  /** La voce di un ticket negli elenchi. */
  ticketDaRiga(t, a) {
    a = a || this.aiutiTicket([t]);
    const sede = t.sede_id ? a.sedi[t.sede_id] : null;
    const m = t.commessa_id ? a.commesse[String(t.commessa_id).toUpperCase()] : null;
    const prossimo = a.interventi[t.id] || null;
    const ritardo = this.ritardoTicket(t);
    let dettaglio = '';
    if (t.stato === 'in_carico' && prossimo) dettaglio = quandoLungo(prossimo.inizio);
    else if (t.stato === 'in_attesa') dettaglio = t.motivo;
    else if (t.stato === 'chiuso') dettaglio = MODI_CHIUSO[t.fatturazione] || '';
    const livello2 = this.livello('ticket') >= 2;
    const o = {
      id: t.id, numero: t.numero, idLocale: testo(t.id_locale), titolo: t.titolo, tipo: t.tipo, tipoNome: TIPI[t.tipo] || t.tipo,
      idCliente: t.cliente_id, cliente: a.clienti[t.cliente_id] || '',
      idSede: t.sede_id === null ? null : t.sede_id, impianto: sede ? sede.nome : '',
      idCommessa: m ? m.id : t.commessa_id, commessa: m ? m.descrizione : '',
      idContratto: t.contratto_id === null ? null : t.contratto_id, contratto: t.contratto_id ? a.contratti[t.contratto_id] || '' : '',
      priorita: t.priorita, prioritaNome: PRIORITA[t.priorita], stato: t.stato, statoVisto: STATI[t.stato], statoDettaglio: dettaglio,
      inRitardo: !!ritardo, ritardo,
      responsabileId: t.responsabile_id === null ? null : t.responsabile_id, responsabile: t.responsabile_id ? a.utenti[t.responsabile_id] || '' : '',
      apertoIl: dataOraIso(t.aperto_il), previstoIl: t.previsto_il, entroPresa: dataOraIso(t.entro_presa), entroIntervento: dataOraIso(t.entro_intervento),
      prossimoIntervento: prossimo ? {
        id: prossimo.id, inizio: dataOraIso(prossimo.inizio), fine: dataOraIso(prossimo.fine), assegnataA: prossimo.assegnata_a,
        assegnata: prossimo.assegnata_a ? a.utenti[prossimo.assegnata_a] || '' : '', luogo: prossimo.luogo,
      } : null,
      rapportini: a.rapportini[t.id] || 0, origine: t.origine, origineNome: ORIGINI[t.origine] || t.origine,
      fatturazione: t.fatturazione, fatturazioneNome: MODI_BREVI[t.fatturazione] || '', chiusoIl: dataOraIso(t.chiuso_il), fatturatoIl: dataIso(t.fatturato_il) || '',
      puoScrivere: livello2 && VIVI.indexOf(t.stato) >= 0 && (this.suoTicket(t) || t.responsabile_id === null),
      puoPrendere: livello2 && t.stato === 'aperto' && t.responsabile_id === null,
    };
    if (this.livello('fatturazione') > 0 && this.vedeCosti()) o.fattura = a.fatture[t.numero] || null;
    return o;
  },

  /** La proposta di come si fattura (§3.4, §8.2), con il perche'. */
  propostaFatturazione(t) {
    const c = t.contratto_id ? this.db.riga('SELECT * FROM contratti WHERE id = ?', t.contratto_id) : null;
    const cliente = this.db.riga('SELECT nome, tariffa_fissa FROM soggetti WHERE id = ?', t.cliente_id) || {};
    const giorno = dataIso(t.aperto_il) || oggi();
    const valido = c && (c.stato === 'attivo' || c.stato === 'disdetto') && giorno >= c.dal && giorno <= c.al;
    if (valido && t.tipo === 'programmato') return { fatturazione: 'contratto', perche: 'Nel contratto ' + c.numero + ': è una visita del contratto' };
    if (valido && c.copre === 'visite_guasti') return { fatturazione: 'contratto', perche: 'Nel contratto ' + c.numero + ': copre visite e guasti' };
    if (cliente.tariffa_fissa !== null && cliente.tariffa_fissa !== undefined && cliente.tariffa_fissa !== '') {
      return { fatturazione: 'separati', perche: cliente.nome + ' ha la tariffa fissa: il mese resta una riga' };
    }
    if (valido) return { fatturazione: 'ticket', perche: 'Il contratto ' + c.numero + ' copre solo le visite' };
    if (c) return { fatturazione: 'ticket', perche: 'Il contratto ' + c.numero + ' non copre questo intervento' };
    return { fatturazione: 'ticket', perche: 'Nessun contratto per questo impianto' };
  },

  /** ticket {id}: la voce piu' tutto quello che serve alla pagina. */
  ticketCompleto(t) {
    const a = this.aiutiTicket([t]);
    const o = this.ticketDaRiga(t, a);
    const c = this.contenutoTicket(t);
    Object.assign(o, {
      descrizione: t.descrizione, richiedente: t.richiedente, idReferente: t.referente_id === null ? null : t.referente_id, rifCliente: t.rif_cliente,
      impatto: t.impatto, urgenza: t.urgenza, prioritaAMano: t.priorita_a_mano === 1,
      presoIl: dataOraIso(t.preso_il), interventoIl: dataOraIso(t.intervento_il), risoltoIl: dataOraIso(t.risolto_il), annullatoIl: dataOraIso(t.annullato_il),
      motivo: t.motivo, esito: t.esito, prezzoCorpo: t.prezzo_corpo === null ? null : t.prezzo_corpo, motivoNo: t.motivo_no,
      fatturatoIl: dataIso(t.fatturato_il) || '', idScadenza: t.scadenza_id === null ? null : t.scadenza_id,
    });
    if (t.referente_id) {
      const r = this.db.riga('SELECT nome, telefono FROM referenti WHERE id = ?', t.referente_id);
      o.referente = r ? { nome: r.nome, telefono: r.telefono } : null;
    } else o.referente = null;
    const sede = t.sede_id ? this.db.riga('SELECT * FROM sedi WHERE id = ?', t.sede_id) : null;
    o.indirizzoImpianto = sede ? require('./documenti').indirizzoDi(sede) : '';
    o.interventi = this.leggiAttivita({ ticket: t.id, stato: 'tutte' }).filter(x => x.stato !== 'annullata');
    o.rapportini = c.rapportini.map(r => ({
      id: r.id, data: dataIso(r.data), tecnico: r.tecnico, idUtente: r.utente_id === null ? null : r.utente_id,
      ore: Math.round((numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)) * 100) / 100,
      km: numero(r.km), stato: testo(r.stato).toUpperCase(), statoApprovazione: r.stato_approvazione, firmatario: r.firmatario,
      descrizione: r.descrizione, apribile: !this.soloSuoi() || r.utente_id === this.mioId(),
    }));
    const aOre = this.aiutiOre(c.ore);
    o.ore = c.ore.filter(x => this.vedeDi(x.utente_id)).map(x => this.oreDaRiga(x, aOre));
    const aSpese = this.aiutiSpese(c.spese);
    o.spese = c.spese.filter(x => this.vedeDi(x.utente_id) || x.rapportino_id).map(x => this.spesaDaRiga(x, aSpese));
    // Fase 7: anche le foto e i file mandati dal cliente nel portale (pillola "Dal cliente").
    o.foto = this.db.righe("SELECT * FROM file WHERE tipo IN ('ticket', 'portale') AND ticket_id = ? AND cestinato IS NULL ORDER BY creato, rowid", t.id)
      .map(f => Object.assign({ id: f.id, url: '/file/' + f.id, nome: f.nome, mime: f.mime, idDocumento: f.documento_id === null ? null : f.documento_id },
        f.tipo === 'portale' ? { dalCliente: true } : {}));
    o.documenti = this.livello('documenti') >= 1 ? this.leggiDocumenti({ idTicket: t.id }).documenti : [];
    // La somma (§7.5): ore (rapportini + ore registrate), km, materiale e spese; con i soldi anche costo e importo.
    const oreTot = c.rapportini.reduce((tot, r) => tot + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)), 0) +
      c.ore.filter(C.contaNeiConti).reduce((tot, x) => tot + numero(x.ore), 0);
    const contano = c.spese.filter(s => s.destinazione !== 'personale' && s.stato !== 'respinta');
    const costo = this.costoDelTicket(t, c);
    const voce = this.voceTicket(t, c);
    o.somma = {
      ore: Math.round(oreTot * 100) / 100, km: Math.round(c.rapportini.reduce((tot, r) => tot + numero(r.km), 0) * 100) / 100,
      materiale: centesimi(contano.filter(s => s.categoria === 'materiale').reduce((tot, s) => tot + numero(s.importo), 0)),
      spese: centesimi(contano.filter(s => s.categoria !== 'materiale').reduce((tot, s) => tot + numero(s.importo), 0)),
      costo: costo.totale, importo: voce.importo,
    };
    o.proposta = this.propostaFatturazione(t);
    o.daFirmare = voce.perche;
    // Fase 6: lo storico dell'impianto e' dello studio (l'esterno non lo vede).
    o.storico = this.eEsterno() ? [] : this.storicoImpianto({ idSede: t.sede_id, breve: 5 }).voci;
    // Fase 6: gli strumenti usati nei suoi rapportini, con lo stato della taratura di quel giorno (congelato).
    const strum = this.strumentiDeiRapportini(c.rapportini.map(r => r.id));
    o.strumenti = [];
    for (const r of c.rapportini) for (const x of strum[r.id] || []) o.strumenti.push(Object.assign({ idRapportino: r.id, data: dataIso(r.data) }, x));
    o.tarataScaduta = o.strumenti.some(x => x.statoAllora === 'scaduta');
    o.cronologia = this.db.righe('SELECT * FROM ticket_eventi WHERE ticket_id = ? ORDER BY id', t.id)
      .map(e => ({ quando: dataOraIso(e.quando), chi: e.utente_id ? a.utenti[e.utente_id] || '' : '', testo: e.testo }));
    const fatt = this.ticketInFattura(t, false);
    o.riservata = fatt && fatt.etichetta !== 'fuori' ? fatt.etichetta : null;
    o.puoChiudere = this.puoChiudereTicket() && ['aperto', 'in_carico', 'risolto'].indexOf(t.stato) >= 0;
    o.giallo = this.gialloTicket(t, o);
    // Fase 7 (§10.4): nel portale? quanti messaggi nuovi del cliente; la conversazione pubblica (divisa dalla cronologia interna).
    const msg = this.db.righe("SELECT * FROM comunicazioni WHERE canale = 'portale' AND pubblica = 1 AND ticket_id = ? ORDER BY quando, id", t.id);
    o.portale = { visibile: t.portale_visibile === 1 || t.origine === 'portale', messaggiNuovi: this.db.riga("SELECT COUNT(*) n FROM portale_da_guardare WHERE tipo = 'messaggio' AND rif = ? AND visto_il IS NULL", String(t.id)).n };
    o.messaggi = msg.map(m => this.messaggioStudio(m));
    return o;
  },

  /**
   * Il pulsante giallo della pagina del ticket (§12.1), uguale su telefono e
   * computer: prendi, pianifica, scrivi il rapportino, segna risolto, chiudi,
   * riprendi; '' se non c'e' niente da fare (o non si puo').
   */
  gialloTicket(t, o) {
    if (this.livello('ticket') < 2) return '';
    if (t.stato === 'aperto' && t.responsabile_id === null) return 'prendi';
    if (t.stato === 'in_attesa') return this.suoTicket(t) ? 'riprendi' : '';
    if (t.stato === 'risolto') return o.puoChiudere ? 'chiudi' : '';
    if (t.stato !== 'in_carico' && t.stato !== 'aperto') return '';
    if (!this.suoTicket(t)) return '';
    const firmato = o.rapportini.some(r => ['FIRMATO', 'INVIATO', 'FATTURATO'].indexOf(r.stato) >= 0);
    if (firmato) return 'risolvi';
    const oggiFine = oggi();
    const futuro = o.interventi.some(x => x.stato !== 'fatta' && x.giorno > oggiFine);
    const fattoOOggi = o.interventi.some(x => x.giorno && x.giorno <= oggiFine);
    if (o.rapportini.length || fattoOOggi) return 'rapportino';
    if (!futuro) return 'pianifica';
    return '';
  },

  /** Il costo del ticket (fase 3: ore x costo orario + km + spese). */
  costoDelTicket(t, contenuto) {
    const c = contenuto || this.contenutoTicket(t);
    const imp = this.leggiImpostazioni();
    const cliente = this.db.riga('SELECT costo_fisso FROM soggetti WHERE id = ?', t.cliente_id) || {};
    const m = t.commessa_id ? this.db.riga('SELECT costo_orario FROM commesse WHERE id = ?', t.commessa_id) : null;
    const costoOggi = C.costoOrarioDi({ costoFisso: cliente.costo_fisso }, { costoOrario: m ? m.costo_orario : null }, imp);
    return C.costoTicket({
      rapportini: c.rapportini.map(r => ({ oreLavoro: r.ore_lavoro, oreExtra: r.ore_extra, km: r.km, euroKm: r.euro_km, costoOrario: r.costo_orario })),
      ore: c.ore.map(o => ({ ore: o.ore, costoOrario: o.costo_orario, stato: o.stato, tolta: o.tolta })),
      spese: c.spese.map(s => ({ importo: s.importo, destinazione: s.destinazione, stato: s.stato, tolta: s.tolta })),
      costoOrarioOggi: costoOggi, euroKmOggi: imp.EURO_KM,
    });
  },

  /**
   * tickets {segmento?, mie?, nonAssegnati?, priorita?, tipo?, idCliente?, idSede?, idContratto?, testo?, da?, a?} (§10.3).
   * aperti (di base) = aperto, in carico, in attesa, risolto (tranne i programmati oltre 30 giorni); programmati;
   * chiusi = chiusi e annullati del periodo (di base 90 giorni); tutti.
   */
  leggiTicket(d) {
    d = d || {};
    const segmento = testo(d.segmento) || 'aperti';
    if (['aperti', 'programmati', 'chiusi', 'tutti'].indexOf(segmento) < 0) throw new Rifiuto('Segmento: aperti, programmati, chiusi o tutti');
    const tutti = this.db.righe('SELECT * FROM ticket ORDER BY id');
    const vis = this.soloSuoi() ? this.aiutiVisibilita() : null;
    const visibili = tutti.filter(t => this.vedeTicket(t, vis));
    const t30 = piuGiorni(oggi(), 30);
    const aperto = t => VIVI.indexOf(t.stato) >= 0 && !(t.tipo === 'programmato' && t.previsto_il && t.previsto_il > t30);
    const io = this.mioId();
    // Le conte (il numerino del menu e i riquadri), su tutti quelli che uno vede.
    const interventiFuturi = new Set(this.db.righe("SELECT DISTINCT ticket_id FROM attivita WHERE ticket_id IS NOT NULL AND stato <> 'annullata'").map(r => r.ticket_id));
    const apertiTutti = visibili.filter(aperto);
    const conteggi = {
      aperti: apertiTutti.length,
      urgenti: apertiTutti.filter(t => t.priorita === 'urgente' && t.stato !== 'risolto').length,
      nonAssegnati: apertiTutti.filter(t => t.responsabile_id === null && t.stato === 'aperto').length,
      inRitardo: apertiTutti.filter(t => !!this.ritardoTicket(t)).length,
      risoltiDaChiudere: visibili.filter(t => t.stato === 'risolto').length,
      programmatiDaPianificare: visibili.filter(t => t.tipo === 'programmato' && (t.stato === 'aperto' || t.stato === 'in_carico') && !interventiFuturi.has(t.id) &&
        (!t.previsto_il || t.previsto_il <= t30)).length,
    };
    if (this.soloSuoi()) conteggi.miei = apertiTutti.filter(t => t.responsabile_id === io && t.stato !== 'risolto').length;
    let righe;
    if (segmento === 'aperti') righe = visibili.filter(aperto);
    else if (segmento === 'programmati') righe = visibili.filter(t => t.tipo === 'programmato' && ['chiuso', 'annullato'].indexOf(t.stato) < 0);
    else if (segmento === 'chiusi') {
      const da = testo(d.da) ? dataDaIso(d.da) : piuGiorni(oggi(), -90);
      const a = testo(d.a) ? dataDaIso(d.a) : oggi();
      righe = visibili.filter(t => ['chiuso', 'annullato'].indexOf(t.stato) >= 0).filter(t => {
        const g = dataIso(t.chiuso_il || t.annullato_il);
        return g >= da && g <= a;
      });
    } else {
      righe = visibili;
      if (testo(d.da)) righe = righe.filter(t => dataIso(t.aperto_il) >= dataDaIso(d.da));
      if (testo(d.a)) righe = righe.filter(t => dataIso(t.aperto_il) <= dataDaIso(d.a));
    }
    if (si(d.mie)) righe = righe.filter(t => t.responsabile_id === io);
    if (si(d.nonAssegnati)) righe = righe.filter(t => t.responsabile_id === null);
    if (testo(d.priorita)) righe = righe.filter(t => t.priorita === testo(d.priorita));
    if (testo(d.tipo)) righe = righe.filter(t => t.tipo === testo(d.tipo));
    if (testo(d.idCliente)) righe = righe.filter(t => t.cliente_id === testo(d.idCliente));
    if (testo(d.idSede)) righe = righe.filter(t => t.sede_id === Number(d.idSede));
    if (testo(d.idContratto)) righe = righe.filter(t => t.contratto_id === Number(d.idContratto));
    const aiuti = this.aiutiTicket(righe);
    const cerca = require('../documenti').pulisciRicerca(d.testo);
    if (cerca) {
      const P = require('../documenti').pulisciRicerca;
      const parole = cerca.split(' ');
      righe = righe.filter(t => {
        const dove = P([t.numero, t.titolo, t.descrizione, aiuti.clienti[t.cliente_id], t.sede_id && aiuti.sedi[t.sede_id] ? aiuti.sedi[t.sede_id].nome : '',
          t.richiedente, t.rif_cliente, t.commessa_id].join(' '));
        return parole.every(p => dove.indexOf(p) >= 0);
      });
    }
    // Ordine (§10.3): urgenti non presi, in ritardo, poi per entro_intervento, poi per apertura. Programmati per giorno previsto; chiusi dal piu' recente.
    if (segmento === 'programmati') righe.sort((x, y) => String(x.previsto_il || '9').localeCompare(String(y.previsto_il || '9')) || x.id - y.id);
    else if (segmento === 'chiusi') righe.sort((x, y) => String(y.chiuso_il || y.annullato_il).localeCompare(String(x.chiuso_il || x.annullato_il)) || y.id - x.id);
    else {
      const chiave = t => [t.stato === 'risolto' ? 1 : 0, t.priorita === 'urgente' && !t.preso_il ? 0 : 1, this.ritardoTicket(t) ? 0 : 1];
      righe.sort((x, y) => {
        const kx = chiave(x);
        const ky = chiave(y);
        for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i];
        const ex = x.entro_intervento ? Date.parse(x.entro_intervento) : Infinity;
        const ey = y.entro_intervento ? Date.parse(y.entro_intervento) : Infinity;
        if (ex !== ey) return ex - ey;
        return Date.parse(x.aperto_il) - Date.parse(y.aperto_il) || x.id - y.id;
      });
    }
    return { ok: true, adesso: dataOraIso(adesso()), segmento, conteggi, ticket: righe.map(t => this.ticketDaRiga(t, aiuti)) };
  },

  // ------------------------------------------------------------------ aprire e cambiare

  /** Il prossimo numero dell'anno: TK/2026/0001, ... (il piu' alto gia' usato + 1, i buchi non si riusano). */
  prossimoNumeroTicket(anno) {
    return this.prossimoNumero('ticket', this.db.righe('SELECT numero FROM ticket').map(r => r.numero), anno || Number(oggi().slice(0, 4)));
  },

  /** Il contratto attivo che copre quell'impianto (per proporlo aprendo un ticket, §8.2). */
  contrattoDellImpianto(idSede, giorno) {
    if (idSede === null || idSede === undefined) return null;
    const g = giorno || oggi();
    return this.db.riga("SELECT c.* FROM contratti c JOIN contratto_impianti i ON i.contratto_id = c.id WHERE i.sede_id = ? AND c.stato IN ('attivo', 'disdetto') AND c.dal <= ? AND c.al >= ? ORDER BY c.dal DESC LIMIT 1",
      idSede, g, g);
  },

  /**
   * salvaTicket {ticket: {id?, idLocale?, numero?, idCliente, idSede?, idCommessa?, idContratto?, titolo, descrizione?, tipo?,
   * origine?, richiedente?, idReferente?, rifCliente?, impatto?, urgenza?, priorita?, responsabileId?, apertoIl?, previstoIl?}}.
   */
  salvaTicket(d) {
    const x = (d && d.ticket) || d || {};
    const c = this.chi();
    const io = this.mioId();
    let prima = testo(x.id) ? this.rigaTicket(x.id) : null;
    if (!prima && testo(x.idLocale)) {
      const gia = this.db.riga('SELECT * FROM ticket WHERE id_locale = ?', testo(x.idLocale));
      if (gia) {
        if (!this.vedeTicket(gia)) throw new Rifiuto('Ticket non trovato');
        return { ok: true, ticket: this.ticketCompleto(gia), giaArrivato: true };
      }
    }
    if (prima) {
      if (['chiuso', 'annullato'].indexOf(prima.stato) >= 0) throw new Rifiuto('Il ticket ' + prima.numero + ' è ' + (prima.stato === 'chiuso' ? 'chiuso: riaprilo per cambiarlo' : 'annullato'));
      if (!this.suoTicket(prima)) throw senzaPermesso('cambiare i ticket degli altri');
    }
    const p = prima || {};
    // Cliente, impianto, contratto, commessa.
    const idCliente = x.idCliente !== undefined ? testo(x.idCliente) : p.cliente_id;
    if (!idCliente) throw new Rifiuto('Cliente: scegli il cliente');
    const cliente = this.db.riga('SELECT * FROM soggetti WHERE id = ?', idCliente);
    if (!cliente) throw new Rifiuto('Cliente: scegli il cliente');
    if (prima && idCliente !== prima.cliente_id) {
      const c0 = this.contenutoTicket(prima);
      if (c0.rapportini.length || c0.ore.length || c0.spese.length) throw new Rifiuto('Il ticket ha già rapportini, ore o spese di ' + (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', prima.cliente_id) || {}).nome + ': il cliente non si cambia');
    }
    const idSede = x.idSede !== undefined ? (vuoto(x.idSede) ? null : Number(x.idSede)) : (prima && idCliente === prima.cliente_id ? prima.sede_id : null);
    if (idSede !== null) {
      const s = this.db.riga('SELECT * FROM sedi WHERE id = ?', idSede);
      if (!s || s.soggetto_id !== idCliente) throw new Rifiuto('Impianto ' + idSede + ' non trovato tra quelli di ' + cliente.nome);
    }
    const apertoIl = x.apertoIl !== undefined && testo(x.apertoIl) ? istanteTicket(x.apertoIl) : prima ? prima.aperto_il : adesso();
    let idContratto;
    if (x.idContratto !== undefined) idContratto = vuoto(x.idContratto) ? null : Number(x.idContratto);
    else if (prima && (x.idSede === undefined || idSede === prima.sede_id)) idContratto = prima.contratto_id;
    else {
      const proposto = this.contrattoDellImpianto(idSede, dataIso(apertoIl));
      idContratto = proposto ? proposto.id : null;
    }
    let contratto = null;
    if (idContratto !== null) {
      contratto = this.db.riga('SELECT * FROM contratti WHERE id = ?', idContratto);
      if (!contratto) throw new Rifiuto('Contratto ' + idContratto + ' non trovato');
      if (contratto.cliente_id !== idCliente) throw new Rifiuto('Il contratto ' + contratto.numero + ' è di ' + ((this.db.riga('SELECT nome FROM soggetti WHERE id = ?', contratto.cliente_id) || {}).nome || contratto.cliente_id));
    }
    let idCommessa;
    if (x.idCommessa !== undefined) idCommessa = testo(x.idCommessa);
    else if (prima && idContratto === prima.contratto_id) idCommessa = prima.commessa_id;
    else idCommessa = contratto ? contratto.commessa_id : '';
    if (idCommessa) {
      const m = this.db.riga('SELECT id, cliente_id FROM commesse WHERE id = ?', idCommessa);
      if (!m) throw new Rifiuto('Commessa ' + idCommessa + ' non trovata');
      if (m.cliente_id && m.cliente_id !== idCliente) throw new Rifiuto('La commessa ' + m.id + ' è di un altro cliente');
      idCommessa = m.id;
    }
    if (prima && (idContratto !== prima.contratto_id || String(idCommessa).toUpperCase() !== String(prima.commessa_id).toUpperCase())) this.controllaTicketLibero(prima, true);
    // Che cosa, da dove, le due domande.
    const titolo = x.titolo !== undefined ? testo(x.titolo) : p.titolo;
    if (!titolo) throw new Rifiuto('Titolo: scrivi in poche parole cosa succede');
    const tipo = x.tipo !== undefined ? testo(x.tipo) || 'guasto' : p.tipo || 'guasto';
    if (!TIPI[tipo]) throw new Rifiuto('Tipo: guasto, verifica, piccolo, assistenza o programmato');
    const origine = x.origine !== undefined ? testo(x.origine) || 'telefono' : p.origine || 'telefono';
    // Fase 7: "portale" lo mette solo il portale (il router, con c.portale); WhatsApp non e' collegato.
    if (origine === 'whatsapp') throw new Rifiuto('WhatsApp non è collegato');
    if (origine === 'portale' && !c.portale && !(prima && prima.origine === 'portale')) throw new Rifiuto('Da dove arriva: «Portale» lo mette solo il portale');
    if (!ORIGINI[origine] || (origine === 'scadenza' && !c.sistema && (!prima || prima.origine !== 'scadenza'))) throw new Rifiuto('Da dove arriva: telefono, email, sopralluogo o ufficio');
    const impatto = x.impatto !== undefined ? testo(x.impatto) : p.impatto || '';
    if (impatto && IMPATTI.indexOf(impatto) < 0) throw new Rifiuto('L\'impianto è fermo? fermo, ridotto o nessuno');
    const urgenza = x.urgenza !== undefined ? testo(x.urgenza) : p.urgenza || '';
    if (urgenza && URGENZE.indexOf(urgenza) < 0) throw new Rifiuto('Per quando? subito, presto o quando_si_puo');
    let priorita;
    let aMano = prima ? prima.priorita_a_mano : 0;
    if (x.priorita !== undefined && testo(x.priorita)) {
      priorita = testo(x.priorita);
      if (!PRIORITA[priorita]) throw new Rifiuto('Priorità: urgente, alta, normale o bassa');
      aMano = priorita !== C.prioritaDa(impatto, urgenza) || (prima && prima.priorita_a_mano && priorita === prima.priorita) ? 1 : 0;
    } else if (x.priorita !== undefined && !testo(x.priorita)) {
      aMano = 0;
      priorita = C.prioritaDa(impatto, urgenza);
    } else priorita = aMano ? p.priorita : C.prioritaDa(impatto, urgenza);
    let idReferente = x.idReferente !== undefined ? (vuoto(x.idReferente) ? null : Number(x.idReferente)) : (prima ? prima.referente_id : null);
    if (idReferente !== null) {
      const r = this.db.riga('SELECT * FROM referenti WHERE id = ?', idReferente);
      if (!r || r.soggetto_id !== idCliente) throw new Rifiuto('Chi ha chiamato: il referente ' + idReferente + ' non è di ' + cliente.nome);
    }
    // Chi lo segue: il collaboratore solo se stesso o nessuno.
    let responsabile = x.responsabileId !== undefined ? (vuoto(x.responsabileId) ? null : Number(x.responsabileId)) : (prima ? prima.responsabile_id : null);
    if (responsabile !== null) {
      const u = this.db.riga('SELECT * FROM utenti WHERE id = ? AND attivo = 1', responsabile);
      if (!u) throw new Rifiuto('Persona ' + responsabile + ' non trovata');
      if (this.soloSuoi() && responsabile !== io && !(prima && prima.responsabile_id === responsabile)) throw senzaPermesso('assegnare i ticket agli altri');
    }
    const previstoIl = x.previstoIl !== undefined ? (testo(x.previstoIl) ? dataDaIso(x.previstoIl) : '') : p.previsto_il || '';
    const v = {
      cliente_id: idCliente, sede_id: idSede, commessa_id: idCommessa || '', contratto_id: idContratto, titolo,
      descrizione: x.descrizione !== undefined ? testo(x.descrizione) : p.descrizione || '', tipo, origine,
      richiedente: x.richiedente !== undefined ? testo(x.richiedente) : p.richiedente || '', referente_id: idReferente,
      rif_cliente: x.rifCliente !== undefined ? testo(x.rifCliente) : p.rif_cliente || '',
      impatto, urgenza, priorita, priorita_a_mano: aMano ? 1 : 0, aperto_il: apertoIl, previsto_il: previstoIl,
    };
    Object.assign(v, this.entroTicket(v));
    const ora = adesso();
    let id;
    if (prima) {
      id = prima.id;
      const cambioResp = responsabile !== prima.responsabile_id;
      this.aggiorna('ticket', id, Object.assign(v, { modificato: ora }));
      if (prima.priorita !== priorita) this.eventoTicket(id, 'Priorità: ' + PRIORITA[priorita]);
      if (cambioResp) this.cambiaResponsabile(this.db.riga('SELECT * FROM ticket WHERE id = ?', id), responsabile);
    } else {
      const anno = Number(dataIso(apertoIl).slice(0, 4)) || Number(oggi().slice(0, 4));
      const numero = this.numeroTicketNuovo(x.numero, anno);
      id = this.inserisci('ticket', Object.assign(v, {
        numero: numero.codice, id_locale: testo(x.idLocale) || null, responsabile_id: responsabile, stato: responsabile !== null ? 'in_carico' : 'aperto',
        preso_il: responsabile !== null ? ora : '', creato_da: io, creato: ora, modificato: ora,
      }));
      this.segnaNumero('ticket', numero.numero);
      const chi = c.utente ? c.utente.nome : c.portale ? c.portale.nome : 'Wisper';
      this.eventoTicket(id, origine === 'scadenza' ? 'Nato da una scadenza' : 'Aperto da ' + chi + ' (' + ORIGINI[origine].toLowerCase() + ')');
      if (responsabile !== null) this.eventoTicket(id, responsabile === io ? 'Preso da ' + chi : 'Assegnato a ' + this.nomeUtente(responsabile));
      // Fase 7: la regola "richieste: tutte" del cliente col portale (quelle del portale le pubblica il portale).
      if (origine !== 'portale') this.pubblicaConRegola('ticket', id, {});
    }
    return { ok: true, ticket: this.ticketCompleto(this.db.riga('SELECT * FROM ticket WHERE id = ?', id)) };
  },

  /** Il numero mandato (nato senza rete) se e' libero e del formato giusto, se no il prossimo. */
  numeroTicketNuovo(proposto, anno) {
    const p = testo(proposto);
    if (p && !this.db.riga('SELECT id FROM ticket WHERE numero = ?', p)) {
      const n = this.numeroDi('ticket', p);
      const sc = require('../formati').schemaFormato(this.numerazione('ticket').formato);
      const m = p.match(sc.re);
      const annoGiusto = !m || (sc.anno4 ? Number(m[sc.anno4]) === anno : sc.anno2 ? Number(m[sc.anno2]) === anno % 100 : true);
      if (n !== null && annoGiusto) return { numero: n, codice: p };
    }
    return this.prossimoNumeroTicket(anno);
  },

  /** Cambio di chi segue il ticket: aperto -> in carico (preso_il la prima volta), nessuno -> aperto. */
  cambiaResponsabile(t, responsabile) {
    const ora = adesso();
    const io = this.mioId();
    const v = { responsabile_id: responsabile, modificato: ora };
    if (responsabile !== null) {
      if (t.stato === 'aperto') v.stato = 'in_carico';
      if (!t.preso_il) v.preso_il = ora;
    } else if (t.stato === 'in_carico') v.stato = 'aperto';
    this.aggiorna('ticket', t.id, v);
    // Fase 7: preso o assegnato, la riga "richiesta" di Da guardare si chiude da sola; a chi lo riceve da un altro, la notifica.
    if (responsabile !== null) {
      this.chiudiDaGuardare('richiesta', t.id);
      if (responsabile !== io) {
        this.notifica([responsabile], 'assegnato', 'Ti hanno assegnato: ' + t.numero + ' ' + t.titolo,
          (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', t.cliente_id) || {}).nome || '', { pagina: 'ticket', id: t.id });
      }
    }
    if (responsabile === null) this.eventoTicket(t.id, 'Nessuno lo segue più');
    else this.eventoTicket(t.id, responsabile === io ? 'Preso da ' + this.nomeUtente(io) : 'Assegnato a ' + this.nomeUtente(responsabile));
  },

  rispostaTicket(id) {
    return { ok: true, ticket: this.ticketCompleto(this.db.riga('SELECT * FROM ticket WHERE id = ?', id)) };
  },

  /** prendiTicket {id}: "Prendo io". Ripetuto da chi l'ha gia' preso: ok. */
  prendiTicket(d) {
    const t = this.rigaTicket(d.id);
    const io = this.mioId();
    if (['chiuso', 'annullato'].indexOf(t.stato) >= 0) throw new Rifiuto('Il ticket ' + t.numero + ' è ' + (t.stato === 'chiuso' ? 'chiuso' : 'annullato'));
    if (t.responsabile_id === io) return this.rispostaTicket(t.id);
    if (t.responsabile_id !== null) throw new Rifiuto('Il ticket ' + t.numero + ' l\'ha già preso ' + this.nomeUtente(t.responsabile_id));
    this.cambiaResponsabile(t, io);
    return this.rispostaTicket(t.id);
  },

  /** assegnaTicket {id, responsabileId}: null = nessuno (torna aperto). Il collaboratore non assegna agli altri. */
  assegnaTicket(d) {
    const t = this.rigaTicket(d.id);
    if (['chiuso', 'annullato'].indexOf(t.stato) >= 0) throw new Rifiuto('Il ticket ' + t.numero + ' è ' + (t.stato === 'chiuso' ? 'chiuso' : 'annullato'));
    const r = vuoto(d.responsabileId) ? null : Number(d.responsabileId);
    if (this.soloSuoi()) {
      if (r !== null && r !== this.mioId()) throw senzaPermesso('assegnare i ticket agli altri');
      if (r === null && t.responsabile_id !== this.mioId()) throw senzaPermesso('cambiare i ticket degli altri');
    }
    if (r !== null && !this.db.riga('SELECT id FROM utenti WHERE id = ? AND attivo = 1', r)) throw new Rifiuto('Persona ' + r + ' non trovata');
    if (r === t.responsabile_id) return this.rispostaTicket(t.id);
    this.cambiaResponsabile(t, r);
    return this.rispostaTicket(t.id);
  },

  /** sospendiTicket {id, motivo}: in attesa (aspetta il materiale, il cliente...). */
  sospendiTicket(d) {
    const t = this.rigaTicket(d.id);
    if (!this.suoTicket(t)) throw senzaPermesso('cambiare i ticket degli altri');
    const motivo = testo(d.motivo);
    if (t.stato === 'in_attesa' && (!motivo || motivo === t.motivo)) return this.rispostaTicket(t.id);
    if (['aperto', 'in_carico'].indexOf(t.stato) < 0) throw new Rifiuto('Si mette in attesa un ticket aperto o in carico');
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    this.aggiorna('ticket', t.id, { stato: 'in_attesa', motivo, modificato: adesso() });
    this.eventoTicket(t.id, 'In attesa: ' + motivo);
    return this.rispostaTicket(t.id);
  },

  /** riprendiTicket {id}: dall'attesa torna in carico (o aperto, senza responsabile). */
  riprendiTicket(d) {
    const t = this.rigaTicket(d.id);
    if (!this.suoTicket(t)) throw senzaPermesso('cambiare i ticket degli altri');
    if (t.stato !== 'in_attesa') {
      if (['aperto', 'in_carico'].indexOf(t.stato) >= 0) return this.rispostaTicket(t.id);
      throw new Rifiuto('Il ticket ' + t.numero + ' non è in attesa');
    }
    this.aggiorna('ticket', t.id, { stato: t.responsabile_id !== null ? 'in_carico' : 'aperto', motivo: '', modificato: adesso() });
    this.eventoTicket(t.id, 'Ripreso');
    return this.rispostaTicket(t.id);
  },

  /** risolviTicket {id, esito?}: risolto; esito di base la descrizione dell'ultimo rapportino. Chiude la scadenza da cui e' nato. */
  risolviTicket(d) {
    const t = this.rigaTicket(d.id);
    if (!this.suoTicket(t)) throw senzaPermesso('cambiare i ticket degli altri');
    if (t.stato === 'risolto') return this.rispostaTicket(t.id);
    if (['aperto', 'in_carico', 'in_attesa'].indexOf(t.stato) < 0) throw new Rifiuto('Il ticket ' + t.numero + ' è ' + STATI[t.stato].toLowerCase());
    const ultimo = this.db.riga("SELECT descrizione FROM rapportini WHERE ticket_id = ? AND UPPER(stato) <> 'ANNULLATO' ORDER BY data DESC, creato DESC LIMIT 1", t.id);
    const esito = testo(d.esito) || (ultimo ? testo(ultimo.descrizione) : '') || t.esito;
    const ora = adesso();
    const v = { stato: 'risolto', risolto_il: ora, esito, motivo: '', modificato: ora };
    if (t.responsabile_id === null && this.mioId() !== null) Object.assign(v, { responsabile_id: this.mioId(), preso_il: t.preso_il || ora });
    this.aggiorna('ticket', t.id, v);
    this.eventoTicket(t.id, 'Risolto' + (esito ? ': ' + esito : ''));
    this.ricalcolaIntervento(t.id);
    this.chiudiScadenzaDelTicket(t, dataIso(ora));
    // Fase 7: "Risolta" e' una novita' da dire al cliente nel portale (avviso raggruppato).
    this.novitaRichiesta(t.id, 'risolta');
    return this.rispostaTicket(t.id);
  },

  /** "Serve un altro intervento" dopo il rapportino: resta in carico, con la riga nella cronologia. */
  altroIntervento(d) {
    const t = this.rigaTicket(d.id);
    if (!this.suoTicket(t)) throw senzaPermesso('cambiare i ticket degli altri');
    if (['aperto', 'in_carico', 'in_attesa'].indexOf(t.stato) < 0) throw new Rifiuto('Il ticket ' + t.numero + ' è ' + STATI[t.stato].toLowerCase());
    const v = { modificato: adesso() };
    if (t.stato === 'aperto' && t.responsabile_id !== null) v.stato = 'in_carico';
    this.aggiorna('ticket', t.id, v);
    this.eventoTicket(t.id, 'Serve un altro intervento');
    return this.rispostaTicket(t.id);
  },

  /** riapriTicket {id, motivo}: da risolto (o da chiuso non riservato e non fatturato: solo chi chiude) torna in carico. */
  riapriTicket(d) {
    const t = this.rigaTicket(d.id);
    const motivo = testo(d.motivo);
    if (['aperto', 'in_carico'].indexOf(t.stato) >= 0) return this.rispostaTicket(t.id);
    if (['risolto', 'chiuso'].indexOf(t.stato) < 0) throw new Rifiuto('Si riapre un ticket risolto o chiuso');
    if (t.stato === 'chiuso') {
      if (!this.puoChiudereTicket()) throw new Rifiuto('Il ticket lo chiude l\'ufficio: chiedi a loro di riaprirlo', { permesso: false });
      this.controllaTicketLibero(t, true);
    } else if (!this.suoTicket(t)) throw senzaPermesso('cambiare i ticket degli altri');
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    const v = { stato: t.responsabile_id !== null ? 'in_carico' : 'aperto', risolto_il: '', motivo: '', modificato: adesso() };
    if (t.stato === 'chiuso') Object.assign(v, { chiuso_il: '', fatturazione: '', prezzo_corpo: null, motivo_no: '' });
    this.aggiorna('ticket', t.id, v);
    this.eventoTicket(t.id, 'Riaperto: ' + motivo);
    this.ricalcolaIntervento(t.id);
    return this.rispostaTicket(t.id);
  },

  /** annullaTicket {id, motivo}: non con rapportini legati non annullati. Gli interventi ancora da fare si annullano. */
  annullaTicket(d) {
    const t = this.rigaTicket(d.id);
    if (!this.suoTicket(t)) throw senzaPermesso('annullare i ticket degli altri');
    if (t.stato === 'annullato') return this.rispostaTicket(t.id);
    if (['aperto', 'in_carico', 'in_attesa'].indexOf(t.stato) < 0) throw new Rifiuto('Si annulla un ticket aperto, in carico o in attesa');
    const motivo = testo(d.motivo);
    if (!motivo) throw new Rifiuto('Scrivi il motivo');
    const r = this.db.riga("SELECT id FROM rapportini WHERE ticket_id = ? AND UPPER(stato) <> 'ANNULLATO' ORDER BY id LIMIT 1", t.id);
    if (r) throw new Rifiuto('Il ticket ha il rapportino ' + r.id + ': toglilo prima dal ticket');
    this.controllaTicketLibero(t, true);
    const ora = adesso();
    this.aggiorna('ticket', t.id, { stato: 'annullato', annullato_il: ora, motivo, modificato: ora });
    for (const a of this.db.righe("SELECT id FROM attivita WHERE ticket_id = ? AND stato IN ('da_fare', 'in_corso')", t.id)) {
      this.aggiorna('attivita', a.id, { stato: 'annullata', modificato: ora }, 'id', 'il ticket ' + t.numero + ' è annullato');
    }
    this.eventoTicket(t.id, 'Annullato: ' + motivo);
    // Fase 7 (§8.1): un ticket non nato dal portale esce dal portale quando si annulla.
    if (t.origine !== 'portale') this.chiudiPubblicazioni('ticket', t.id, 'annullato');
    return this.rispostaTicket(t.id);
  },

  /**
   * pianificaTicket {id, inizio, fine?, assegnataA?, luogo?, note?, conferma?, promemoriaMinuti?}: un'attivita'
   * "intervento" del calendario della fase 2 (sovrapposizioni con serveConferma, un'ora di base). Il ticket va in carico.
   */
  pianificaTicket(d) {
    if (this.livello('attivita') < 2) throw senzaPermesso('pianificare gli interventi (serve il calendario)');
    const t = this.rigaTicket(d.id);
    if (['chiuso', 'annullato'].indexOf(t.stato) >= 0) throw new Rifiuto('Il ticket ' + t.numero + ' è ' + (t.stato === 'chiuso' ? 'chiuso: riaprilo per pianificare' : 'annullato'));
    if (!this.suoTicket(t) && t.responsabile_id !== null) throw senzaPermesso('pianificare i ticket degli altri');
    if (vuoto(d.inizio)) throw new Rifiuto('Inizio: scrivi quando si va');
    const io = this.mioId();
    const chi = !vuoto(d.assegnataA) ? Number(d.assegnataA) : t.responsabile_id !== null ? t.responsabile_id : io;
    if (this.soloSuoi() && chi !== io) throw senzaPermesso('pianificare per gli altri');
    const sede = t.sede_id ? this.db.riga('SELECT * FROM sedi WHERE id = ?', t.sede_id) : null;
    const luogo = !vuoto(d.luogo) ? testo(d.luogo) : sede ? require('./documenti').indirizzoDi(sede) : '';
    const attivita = {
      titolo: t.numero + ' · ' + t.titolo, tipo: 'intervento', idCliente: t.cliente_id, idCommessa: t.commessa_id || '', assegnataA: chi,
      luogo, descrizione: [t.descrizione, testo(d.note)].filter(Boolean).join('\n'), inizio: d.inizio, idTicket: t.id,
    };
    if (!vuoto(d.fine)) attivita.fine = d.fine;
    if (d.promemoriaMinuti !== undefined) attivita.promemoriaMinuti = d.promemoriaMinuti;
    const r = this.salvaAttivita({ attivita, conferma: d.conferma });
    const dopo = this.db.riga('SELECT * FROM ticket WHERE id = ?', t.id);
    if (dopo.responsabile_id === null) this.cambiaResponsabile(dopo, chi);
    else if (dopo.stato === 'aperto') this.aggiorna('ticket', t.id, { stato: 'in_carico', preso_il: dopo.preso_il || adesso(), modificato: adesso() });
    this.eventoTicket(t.id, 'Intervento pianificato per ' + quandoLungo(r.attivita.inizio) + (chi !== io ? ' (' + this.nomeUtente(chi) + ')' : ''));
    // Fase 7: "Intervento fissato" e' una novita' da dire al cliente nel portale.
    this.novitaRichiesta(t.id, 'intervento fissato');
    return { ok: true, ticket: this.ticketCompleto(this.db.riga('SELECT * FROM ticket WHERE id = ?', t.id)), attivita: r.attivita };
  },

  /**
   * chiudiTicket {id, fatturazione, prezzoCorpo?, motivo?, conferma?} (§7.6): solo titolare e amministrazione
   * (ticket 2 e soldi). Da risolto, o direttamente da aperto o in carico (assistenza al telefono).
   */
  chiudiTicket(d) {
    if (this.soloSuoi()) throw new Rifiuto('Il ticket lo chiude l\'ufficio: tu segnalo risolto', { permesso: false });
    if (!this.puoChiudereTicket()) throw new Rifiuto('Per chiudere i ticket serve anche il permesso dei soldi: chiedi al titolare', { permesso: false });
    const t = this.rigaTicket(d.id);
    const modo = testo(d.fatturazione);
    if (t.stato === 'chiuso') {
      if (t.fatturazione === modo) return Object.assign(this.rispostaTicket(t.id), { daFatturare: this.voceDopoChiusura(t.id) });
      throw new Rifiuto('Il ticket ' + t.numero + ' è già chiuso: riaprilo per cambiare come si fattura');
    }
    if (['aperto', 'in_carico', 'risolto'].indexOf(t.stato) < 0) throw new Rifiuto(t.stato === 'in_attesa' ? 'Il ticket è in attesa: riprendilo prima di chiuderlo' : 'Il ticket ' + t.numero + ' è annullato');
    if (!MODI[modo]) throw new Rifiuto('Come si fattura: ticket, separati, contratto o no');
    this.controllaTicketLibero(t, true);
    const c = this.contenutoTicket(t);
    const v = { fatturazione: modo, prezzo_corpo: null, motivo_no: '' };
    if (modo === 'ticket') {
      if (!vuoto(d.prezzoCorpo)) {
        const p = centesimi(numero(d.prezzoCorpo));
        if (!(p > 0)) throw new Rifiuto('Prezzo a corpo: scrivi quanto');
        v.prezzo_corpo = p;
      }
      const voce = this.voceTicket(Object.assign({}, t, v), c);
      if (!voce.qualcosa) throw new Rifiuto('Non c\'è niente da fatturare: scrivi un prezzo a corpo o scegli Non si fattura');
    } else if (modo === 'contratto') {
      if (!t.contratto_id) throw new Rifiuto('Il ticket non è legato a un contratto');
    } else if (modo === 'no') {
      const motivo = testo(d.motivo);
      if (!motivo) throw new Rifiuto('Scrivi perché non si fattura');
      v.motivo_no = motivo;
      const alCliente = centesimi(c.spese.filter(s => s.destinazione === 'cliente' && s.stato !== 'respinta' && !s.fatturata_il).reduce((tot, s) => tot + numero(s.importo), 0));
      if (alCliente > 0 && !si(d.conferma)) {
        return { ok: false, serveConferma: true, errore: 'Ci sono ' + C.euroIt(alCliente) + ' € di spese segnate al cliente: con «Non si fattura» restano fuori dalla fattura. Chiudo lo stesso?' };
      }
    } else if (modo === 'separati' && t.commessa_id && !si(d.conferma)) {
      const m = this.db.riga('SELECT id, modo_fatturazione FROM commesse WHERE id = ?', t.commessa_id);
      if (m && m.modo_fatturazione === 'corpo' && (c.rapportini.length || c.ore.length)) {
        return { ok: false, serveConferma: true, errore: 'La commessa ' + m.id + ' è a corpo: con «Con gli altri rapportini» i rapportini e le ore del ticket non vanno in fattura. Chiudo lo stesso?' };
      }
    }
    const ora = adesso();
    Object.assign(v, { stato: 'chiuso', chiuso_il: ora, modificato: ora });
    if (!t.risolto_il) v.risolto_il = ora;
    if (t.responsabile_id === null && this.mioId() !== null) Object.assign(v, { responsabile_id: this.mioId(), preso_il: t.preso_il || ora });
    const contratto = t.contratto_id ? this.db.riga('SELECT numero FROM contratti WHERE id = ?', t.contratto_id) : null;
    const frase = modo === 'contratto' && contratto ? 'nel contratto ' + contratto.numero : modo === 'no' ? 'non si fattura (' + v.motivo_no + ')' : MODI_CHIUSO[modo];
    this.aggiorna('ticket', t.id, v, 'id', 'chiuso: ' + MODI_CHIUSO[modo]);
    this.eventoTicket(t.id, 'Chiuso: ' + frase);
    this.ricalcolaIntervento(t.id);
    this.chiudiScadenzaDelTicket(t, dataIso(v.risolto_il || t.risolto_il));
    return Object.assign(this.rispostaTicket(t.id), { daFatturare: this.voceDopoChiusura(t.id) });
  },

  /** Dopo la chiusura "una riga": la voce di Da fatturare (per l'avviso "Chiuso: va in Da fatturare (126,74 €)"). */
  voceDopoChiusura(id) {
    const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', id);
    if (!t || t.stato !== 'chiuso' || t.fatturazione !== 'ticket') return null;
    const v = this.voceTicket(t);
    return { tipo: 'ticket', id: t.numero, importo: v.importo, pronta: v.pronta, perche: v.perche, gruppo: v.gruppo };
  },

  /** Chiudere o risolvere un ticket nato da una scadenza la segna fatta, con la data della risoluzione (§6.1). */
  chiudiScadenzaDelTicket(t, data) {
    const s = t.scadenza_id ? this.db.riga('SELECT * FROM scadenze WHERE id = ?', t.scadenza_id) : null;
    if (s && s.stato === 'aperta') this.segnaScadenzaFatta(s, data || oggi(), null);
  },

  /** Il ticket programmato che nasce da una scadenza (§6.2). */
  ticketDaScadenza(s) {
    const imp = this.leggiImpostazioni();
    const contratto = s.contratto_id ? this.db.riga('SELECT * FROM contratti WHERE id = ?', s.contratto_id) : null;
    const responsabile = s.assegnata_a !== null && this.db.riga('SELECT id FROM utenti WHERE id = ? AND attivo = 1', s.assegnata_a) ? s.assegnata_a : null;
    const ora = adesso();
    const v = {
      cliente_id: s.cliente_id, sede_id: s.sede_id, commessa_id: contratto ? contratto.commessa_id : '', contratto_id: s.contratto_id,
      titolo: s.titolo, descrizione: contratto ? 'Visita del contratto ' + contratto.numero + '.' : s.note || '', tipo: 'programmato', origine: 'scadenza',
      priorita: 'normale', aperto_il: ora, previsto_il: s.data,
    };
    Object.assign(v, this.entroTicket(v));
    const numero = this.prossimoNumeroTicket(Number(ora.slice(0, 4)));
    const id = this.inserisci('ticket', Object.assign(v, {
      numero: numero.codice, responsabile_id: responsabile, stato: responsabile !== null ? 'in_carico' : 'aperto', preso_il: responsabile !== null ? ora : '',
      scadenza_id: s.id, creato: ora, modificato: ora,
    }), 'id', 'nato dalla scadenza del ' + dataIt(s.data));
    this.segnaNumero('ticket', numero.numero);
    this.aggiorna('scadenze', s.id, { ticket_id: id, modificato: ora });
    this.eventoTicket(id, 'Nato dalla scadenza del ' + dataIt(s.data) + (contratto ? ' (contratto ' + contratto.numero + ')' : ''));
    void imp;
    return id;
  },

  // ------------------------------------------------------------------ rapportini, foto (§7.4, §7.5)

  /**
   * Il ticket di un rapportino che si salva (idTicket o idLocaleTicket): stesso
   * cliente, non chiuso, che chi scrive vede. Torna la riga o null.
   */
  ticketPerRapportino(r, idCliente) {
    const chiave = !vuoto(r.idTicket) ? r.idTicket : !vuoto(r.idLocaleTicket) ? r.idLocaleTicket : null;
    if (chiave === null) return null;
    const n = this.idTicketDa(chiave);
    const t = n !== null && n > 0 ? this.db.riga('SELECT * FROM ticket WHERE id = ?', n) : null;
    if (!t || !this.vedeTicket(t)) throw new Rifiuto('Ticket ' + testo(chiave) + ' non trovato');
    this.controllaTicketPerRapportino(t, idCliente);
    return t;
  },

  controllaTicketPerRapportino(t, idCliente) {
    if (t.stato === 'chiuso') throw new Rifiuto('Il ticket ' + t.numero + ' è chiuso: riaprilo per aggiungere un rapportino');
    if (t.stato === 'annullato') throw new Rifiuto('Il ticket ' + t.numero + ' è annullato');
    if (idCliente && t.cliente_id !== idCliente) {
      const nome = id => (this.db.riga('SELECT nome FROM soggetti WHERE id = ?', id) || {}).nome || id;
      throw new Rifiuto('Il ticket è di ' + nome(t.cliente_id) + ', il rapportino di ' + nome(idCliente));
    }
    this.controllaTicketLibero(t, false);
  },

  /** Il testo che il server scrive nel campo Ticket del rapportino: "TK/2026/0014 · rif. 4471". */
  testoTicketRapportino(t) {
    return t.numero + (testo(t.rif_cliente) ? ' · rif. ' + testo(t.rif_cliente) : '');
  },

  /** Dopo che un rapportino e' entrato in un ticket: il ticket va in carico (responsabile chi l'ha scritto), i tempi si rifanno. */
  dopoRapportinoDelTicket(idTicket, rapportino, nuovo) {
    const t = this.db.riga('SELECT * FROM ticket WHERE id = ?', idTicket);
    if (!t) return;
    if (t.stato === 'aperto') {
      const chi = rapportino.utente_id !== null && rapportino.utente_id !== undefined ? rapportino.utente_id : this.mioId();
      const v = { stato: 'in_carico', preso_il: t.preso_il || adesso(), modificato: adesso() };
      if (t.responsabile_id === null && chi !== null) v.responsabile_id = chi;
      this.aggiorna('ticket', t.id, v);
      if (v.responsabile_id) this.eventoTicket(t.id, 'Preso da ' + this.nomeUtente(v.responsabile_id));
    }
    if (nuovo) this.eventoTicket(t.id, 'Rapportino ' + rapportino.id + ' scritto' + (rapportino.tecnico ? ' da ' + rapportino.tecnico : ''));
    this.ricalcolaIntervento(t.id);
  },

  /** legaRapportino {idRapportino, idTicket | null} (rapportini 2): lega o slega dopo. */
  legaRapportino(d) {
    const r = this.trovaRiga(d.idRapportino, d.idRapportino);
    if (!r) throw new Rifiuto('Rapportino ' + testo(d.idRapportino) + ' non trovato');
    this.controllaSuo(r, 'legare i rapportini degli altri');
    if (testo(r.stato).toUpperCase() === 'ANNULLATO') throw new Rifiuto('Il rapportino ' + r.id + ' è annullato');
    this.controllaSorgenteLibera('rapportino', r.id);
    const bloccato = ['FIRMATO', 'INVIATO', 'FATTURATO'].indexOf(testo(r.stato).toUpperCase()) >= 0;
    const vecchio = r.ticket_id ? this.db.riga('SELECT * FROM ticket WHERE id = ?', r.ticket_id) : null;
    if (vuoto(d.idTicket)) {
      if (!vecchio) return { ok: true, rapportino: this.rapportinoPerId(r.id) };
      if (vecchio.stato === 'chiuso') throw new Rifiuto('Il ticket ' + vecchio.numero + ' è chiuso: riaprilo per togliere il rapportino');
      this.controllaTicketLibero(vecchio, false);
      const v = { ticket_id: null, modificato: adesso() };
      // Il numero scritto dal server nel campo Ticket si toglie (non su un rapportino gia' firmato: e' nel PDF firmato).
      if (!bloccato && testo(r.ticket) === this.testoTicketRapportino(vecchio)) v.ticket = '';
      this.aggiorna('rapportini', r.id, v, 'id', 'tolto dal ticket ' + vecchio.numero);
      this.allineaSpeseRapportino(r.id);
      this.eventoTicket(vecchio.id, 'Rapportino ' + r.id + ' tolto dal ticket');
      this.ricalcolaIntervento(vecchio.id);
      return { ok: true, rapportino: this.rapportinoPerId(r.id) };
    }
    if (testo(r.stato).toUpperCase() === 'FATTURATO') throw new Rifiuto('Il rapportino ' + r.id + ' è già fatturato');
    const n = this.idTicketDa(d.idTicket);
    const t = n !== null && n > 0 ? this.db.riga('SELECT * FROM ticket WHERE id = ?', n) : null;
    if (!t || !this.vedeTicket(t)) throw new Rifiuto('Ticket ' + testo(d.idTicket) + ' non trovato');
    if (vecchio && vecchio.id === t.id) return { ok: true, rapportino: this.rapportinoPerId(r.id) };
    if (vecchio) throw new Rifiuto('Il rapportino ' + r.id + ' è già del ticket ' + vecchio.numero + ': toglilo prima da lì');
    this.controllaTicketPerRapportino(t, r.id_cliente);
    const v = { ticket_id: t.id, modificato: adesso() };
    if (!bloccato && !testo(r.ticket)) v.ticket = this.testoTicketRapportino(t);
    this.aggiorna('rapportini', r.id, v, 'id', 'legato al ticket ' + t.numero);
    this.allineaSpeseRapportino(r.id);
    this.dopoRapportinoDelTicket(t.id, r, false);
    this.eventoTicket(t.id, 'Rapportino ' + r.id + ' legato al ticket');
    return { ok: true, rapportino: this.rapportinoPerId(r.id) };
  },

  /** caricaFile {tipo: "ticket", idTicket, base64 | idFileCaricato, mime, nome, idFile}: una foto (o un allegato) del ticket. */
  caricaFotoTicket(d, dati, mime) {
    const t = this.rigaTicket(d.idTicket);
    if (['annullato'].indexOf(t.stato) >= 0) throw new Rifiuto('Il ticket ' + t.numero + ' è annullato');
    const idClient = testo(d.idFile);
    const gia = idClient ? this.db.riga("SELECT * FROM file WHERE tipo = 'ticket' AND ticket_id = ? AND id_client = ? AND cestinato IS NULL", t.id, idClient) : null;
    if (gia) return { id: gia.id, url: '/file/' + gia.id, nome: gia.nome };
    let f;
    if (!vuoto(d.idFileCaricato)) {
      f = this.fileDaLegare(d.idFileCaricato);
      this.aggiorna('file', f.id, { tipo: 'ticket', ticket_id: t.id });
      f = this.db.riga('SELECT * FROM file WHERE id = ?', f.id);
    } else {
      this.controllaSpazio('lavoro');
      const tipoFile = require('../documenti').tipoDaSalvare(mime, dati.subarray(0, 512));
      const est = tipoFile === 'image/png' ? '.png' : tipoFile === 'application/pdf' ? '.pdf' : tipoFile === 'image/jpeg' ? '.jpg' : '';
      f = this.salvaFile({ dati, nome: testo(d.nome) || (t.numero.replace(/\//g, '-') + ' foto ' + (idClient || Date.now()) + est), mime: tipoFile, tipo: 'ticket', idClient });
      this.aggiorna('file', f.id, { ticket_id: t.id });
    }
    this.aggiorna('ticket', t.id, { modificato: adesso() });
    return { id: f.id, url: '/file/' + f.id, nome: f.nome };
  },

  /** togliFotoTicket {id, annulla?}: la foto va nel cestino (annulla la rimette). */
  togliFotoTicket(d) {
    const f = this.db.riga("SELECT * FROM file WHERE id = ? AND tipo = 'ticket'", testo(d.id));
    if (!f) throw new Rifiuto('Foto ' + testo(d.id) + ' non trovata');
    const t = this.rigaTicket(f.ticket_id);
    if (this.soloSuoi() && !this.suoTicket(t)) throw senzaPermesso('togliere le foto dei ticket degli altri');
    const annulla = si(d.annulla);
    if (annulla ? f.cestinato : !f.cestinato) this.aggiorna('file', f.id, { cestinato: annulla ? null : adesso() });
    return this.rispostaTicket(t.id);
  },

  // ------------------------------------------------------------------ storico dell'impianto (§7.7)

  /** storicoImpianto {idSede, pagina?}: la scheda dell'impianto e la riga del tempo (30 voci per pagina). */
  storicoImpianto(d) {
    if (vuoto(d.idSede)) {
      if (d.breve) return { voci: [] };
      throw new Rifiuto('Impianto: scegli l\'impianto');
    }
    const s = this.db.riga('SELECT * FROM sedi WHERE id = ?', Number(d.idSede));
    if (!s) throw new Rifiuto('Impianto ' + testo(d.idSede) + ' non trovato');
    const cliente = this.db.riga('SELECT * FROM soggetti WHERE id = ?', s.soggetto_id) || {};
    const io = this.mioId();
    const utenti = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { utenti[u.id] = u.nome; });
    const vedeTk = this.livello('ticket') >= 1;
    const vis = this.soloSuoi() ? this.aiutiVisibilita() : null;
    const tickets = vedeTk ? this.db.righe("SELECT * FROM ticket WHERE sede_id = ? AND stato <> 'annullato' ORDER BY aperto_il DESC", s.id).filter(t => this.vedeTicket(t, vis)) : [];
    const voci = [];
    for (const t of tickets) {
      voci.push({ tipo: 'ticket', data: dataIso(t.aperto_il), titolo: t.numero + ' · ' + t.titolo,
        dettaglio: [PRIORITA[t.priorita], STATI[t.stato] + (t.stato === 'chiuso' && MODI_CHIUSO[t.fatturazione] ? ' · ' + MODI_CHIUSO[t.fatturazione] : ''), ORIGINI[t.origine].toLowerCase()].join(' · '),
        id: t.numero, idTicket: t.id });
    }
    // Rapportini: quelli dei ticket dell'impianto e quelli delle commesse su questo impianto.
    const idTicket = new Set(this.db.righe('SELECT id FROM ticket WHERE sede_id = ?', s.id).map(t => t.id));
    const numeri = {};
    this.db.righe('SELECT id, numero FROM ticket WHERE sede_id = ?', s.id).forEach(t => { numeri[t.id] = t.numero; });
    const commesse = new Set(this.db.righe('SELECT id FROM commesse WHERE sede_id = ?', s.id).map(m => String(m.id).toUpperCase()));
    if (this.livello('rapportini') >= 1 || vedeTk) {
      for (const r of this.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO' ORDER BY data DESC, id DESC")) {
        const delTicket = r.ticket_id !== null && idTicket.has(r.ticket_id);
        if (!delTicket && !commesse.has(String(r.id_commessa || '').toUpperCase())) continue;
        const ore = Math.round((numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)) * 100) / 100;
        const suo = !this.soloSuoi() || r.utente_id === io;
        const firmato = ['FIRMATO', 'INVIATO', 'FATTURATO'].indexOf(testo(r.stato).toUpperCase()) >= 0;
        const v = suo ? {
          tipo: 'rapportino', data: dataIso(r.data), titolo: r.id + ' · ' + (r.descrizione || 'Rapportino'),
          dettaglio: [r.tecnico, C.numeroIt(ore) + (ore === 1 ? ' ora' : ' ore'), firmato && r.firmatario ? 'firmato da ' + r.firmatario : String(r.stato).toLowerCase()].filter(Boolean).join(' · '),
          id: r.id, apribile: true,
        } : { tipo: 'rapportino', data: dataIso(r.data), titolo: 'Rapportino di ' + (r.tecnico || 'un collega'), dettaglio: '', id: null, apribile: false };
        if (r.ticket_id !== null) { v.idTicket = r.ticket_id; v.ticket = numeri[r.ticket_id] || ''; }
        voci.push(v);
      }
    }
    if (this.livello('documenti') >= 1) {
      const a = this.aiutiDocumenti([]);
      for (const doc of this.db.righe('SELECT * FROM documenti WHERE sede_id = ? AND archiviato IS NULL ORDER BY modificato DESC', s.id).filter(x => this.vedeDocumento(x))) {
        const versioni = this.db.righe('SELECT * FROM documento_versioni WHERE documento_id = ?', doc.id);
        const st = this.statoDocumento(doc, versioni);
        const cat = a.categorie[doc.categoria_id] || {};
        voci.push({ tipo: 'documento', data: doc.data_documento || dataIso(doc.creato), titolo: doc.titolo + (st.daAprire && doc.origine === 'file' ? ' rev. ' + st.daAprire.numero : ''),
          dettaglio: (cat.nome || '') + ' · ' + st.statoVisto, id: doc.id });
      }
    }
    for (const sc of this.db.righe("SELECT * FROM scadenze WHERE sede_id = ? AND stato = 'fatta' ORDER BY fatta_il DESC", s.id).filter(x => this.vedeScadenza(x))) {
      const tk = sc.ticket_id ? this.db.riga('SELECT numero FROM ticket WHERE id = ?', sc.ticket_id) : null;
      voci.push({ tipo: 'scadenza', data: dataIso(sc.fatta_il), titolo: sc.titolo + ' fatta', dettaglio: tk ? 'dal ticket ' + tk.numero : 'scadenza del ' + dataIt(sc.data), id: sc.id });
    }
    if (vedeTk) {
      for (const g of this.db.righe("SELECT f.ticket_id, COUNT(*) n, MAX(f.creato) quando FROM file f JOIN ticket t ON t.id = f.ticket_id WHERE f.tipo = 'ticket' AND f.cestinato IS NULL AND t.sede_id = ? GROUP BY f.ticket_id", s.id)) {
        if (!tickets.some(t => t.id === g.ticket_id)) continue;
        voci.push({ tipo: 'foto', data: dataIso(g.quando), titolo: g.n === 1 ? '1 foto' : g.n + ' foto', dettaglio: 'del ticket ' + numeri[g.ticket_id], id: numeri[g.ticket_id], idTicket: g.ticket_id });
      }
    }
    const contrattiRighe = vedeTk ? this.db.righe('SELECT c.* FROM contratti c JOIN contratto_impianti i ON i.contratto_id = c.id WHERE i.sede_id = ? ORDER BY c.dal DESC', s.id) : [];
    for (const c of contrattiRighe) {
      if (c.stato === 'bozza') continue;
      voci.push({ tipo: 'contratto', data: c.dal, titolo: 'Contratto ' + c.numero + ' · ' + c.titolo, dettaglio: 'dal ' + dataIt(c.dal) + ' al ' + dataIt(c.al), id: c.id });
      if (c.disdetto_il) voci.push({ tipo: 'contratto', data: c.disdetto_il, titolo: 'Contratto ' + c.numero + ' disdetto', dettaglio: c.motivo || 'finisce il ' + dataIt(c.al), id: c.id });
    }
    voci.sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0));
    if (d.breve) return { voci: voci.slice(0, d.breve) };
    const quante = voci.length;
    const pagine = Math.max(1, Math.ceil(quante / PER_PAGINA_STORICO));
    const pagina = Math.min(Math.max(1, Math.round(numero(d.pagina)) || 1), pagine);
    const referente = s.referente_id ? this.db.riga('SELECT nome, telefono FROM referenti WHERE id = ?', s.referente_id) : null;
    const rischio = require('./scadenze').AMBIENTI_RISCHIO.indexOf(s.ambiente) >= 0;
    const dettaglioAmbiente = s.ambiente ? (AMBIENTI[s.ambiente] || s.ambiente) + ': verifica ogni ' + (rischio ? '2 anni' : '5 anni') : '';
    return {
      ok: true,
      impianto: {
        id: s.id, tipo: s.tipo, nome: s.nome, categoria: s.categoria, categoriaNome: CATEGORIE_IMPIANTO[s.categoria] || '', idCliente: s.soggetto_id, cliente: cliente.nome || '',
        indirizzo: require('./documenti').indirizzoDi(s), sedePadreId: s.sede_padre_id === null ? null : s.sede_padre_id, matricola: s.matricola, potenza: s.potenza,
        tensione: s.tensione, messaInServizio: s.messa_in_servizio, ambiente: s.ambiente, ambienteNome: dettaglioAmbiente,
        verificaOgniMesi: s.ambiente ? (rischio ? 24 : 60) : null, idReferente: s.referente_id === null ? null : s.referente_id,
        referente: referente ? referente.nome + (referente.telefono ? ' · ' + referente.telefono : '') : '', datiTecnici: s.dati_tecnici,
      },
      aperti: tickets.filter(t => ['chiuso', 'annullato'].indexOf(t.stato) < 0).map(t => ({ tipo: 'ticket', id: t.numero, idTicket: t.id, titolo: t.titolo, stato: t.stato,
        statoVisto: STATI[t.stato], priorita: t.priorita })),
      scadenze: this.db.righe("SELECT * FROM scadenze WHERE sede_id = ? AND stato = 'aperta' ORDER BY data", s.id).filter(x => this.vedeScadenza(x)).map(x => {
        const v = this.statoScadenza(x);
        return { id: x.id, titolo: x.titolo, data: x.data, statoVisto: v.statoVisto, giorni: v.giorni };
      }),
      contratti: contrattiRighe.map(c => ({ id: c.id, numero: c.numero, titolo: c.titolo, statoVisto: this.statoVistoContratto(c).statoVisto })),
      pagina, pagine, quante, voci: voci.slice((pagina - 1) * PER_PAGINA_STORICO, pagina * PER_PAGINA_STORICO),
    };
  },

  // ------------------------------------------------------------------ statistiche (§9)

  /** statisticheTicket {da?, a?, per: tipo|cliente|impianto|persona|mese}: di base gli ultimi 12 mesi; il collaboratore i suoi. */
  statisticheTicket(d) {
    d = d || {};
    const per = testo(d.per) || 'tipo';
    if (['tipo', 'cliente', 'impianto', 'persona', 'mese'].indexOf(per) < 0) throw new Rifiuto('Per: tipo, cliente, impianto, persona o mese');
    const a = testo(d.a) ? dataDaIso(d.a) : C.fineMese(oggi());
    const da = testo(d.da) ? dataDaIso(d.da) : C.giorniDopo(C.piuMesi(a.slice(0, 8) + '01', -11), 0);
    const io = this.mioId();
    let righe = this.db.righe("SELECT * FROM ticket WHERE stato <> 'annullato'").filter(t => {
      const g = dataIso(t.aperto_il);
      return g >= da && g <= a;
    });
    if (this.soloSuoi()) righe = righe.filter(t => t.responsabile_id === io);
    const costi = this.vedeCosti();
    const nomi = { clienti: {}, sedi: {}, utenti: {} };
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomi.clienti[s.id] = s.nome; });
    this.db.righe('SELECT id, nome FROM sedi').forEach(s => { nomi.sedi[s.id] = s.nome; });
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi.utenti[u.id] = u.nome; });
    // Il fatturato: il compenso delle fatture emesse coi gruppi dei ticket.
    const fatturato = {};
    if (costi) {
      for (const r of this.db.righe("SELECT r.gruppo, SUM(r.importo) imp FROM fattura_righe r JOIN fatture f ON f.id = r.fattura_id WHERE f.stato = 'emessa' AND f.tipo = 'fattura' AND r.tipo = 'compenso' AND r.gruppo LIKE 'ticket:%' GROUP BY r.gruppo")) {
        fatturato[r.gruppo.slice(7)] = numero(r.imp);
      }
    }
    const misure = t => {
      const c = this.contenutoTicket(t);
      const oreT = c.rapportini.reduce((tot, r) => tot + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)), 0) +
        c.ore.filter(C.contaNeiConti).reduce((tot, o) => tot + numero(o.ore), 0);
      return {
        presa: t.preso_il ? ore(t.aperto_il, t.preso_il) : null, intervento: t.intervento_il ? ore(t.aperto_il, t.intervento_il) : null,
        chiusura: t.chiuso_il ? ore(t.aperto_il, t.chiuso_il) / 24 : null,
        entro: t.intervento_il && t.entro_intervento ? Date.parse(t.intervento_il) <= Date.parse(t.entro_intervento) : null,
        ore: oreT, km: c.rapportini.reduce((tot, r) => tot + numero(r.km), 0), costo: costi ? this.costoDelTicket(t, c).totale : 0,
        fatturato: fatturato[t.numero] || 0, chiuso: t.stato === 'chiuso', nelContratto: t.stato === 'chiuso' && t.fatturazione === 'contratto',
      };
    };
    const media = l => (l.length ? unaCifra(l.reduce((x, y) => x + y, 0) / l.length) : null);
    const riassunto = lista => {
      const m = lista.map(x => x.m);
      const out = {
        aperti: lista.length, chiusi: m.filter(x => x.chiuso).length, inCorso: lista.filter(x => VIVI.indexOf(x.t.stato) >= 0).length,
        presaMediaOre: media(m.map(x => x.presa).filter(x => x !== null)), interventoMedioOre: media(m.map(x => x.intervento).filter(x => x !== null)),
        chiusuraMediaGiorni: media(m.map(x => x.chiusura).filter(x => x !== null)),
        entroITempi: m.filter(x => x.entro !== null).length ? Math.round(m.filter(x => x.entro === true).length * 100 / m.filter(x => x.entro !== null).length) : null,
        ore: Math.round(m.reduce((tot, x) => tot + x.ore, 0) * 100) / 100, km: Math.round(m.reduce((tot, x) => tot + x.km, 0) * 100) / 100,
        nelContratto: m.filter(x => x.nelContratto).length,
      };
      if (costi) {
        out.costo = centesimi(m.reduce((tot, x) => tot + x.costo, 0));
        out.fatturato = centesimi(m.reduce((tot, x) => tot + x.fatturato, 0));
      }
      return out;
    };
    const tutti = righe.map(t => ({ t, m: misure(t) }));
    const gruppi = new Map();
    for (const x of tutti) {
      let k;
      let nome;
      if (per === 'tipo') { k = x.t.tipo; nome = { guasto: 'Guasti', verifica: 'Verifiche', piccolo: 'Piccoli interventi', assistenza: 'Assistenza', programmato: 'Programmati' }[k]; }
      else if (per === 'cliente') { k = x.t.cliente_id; nome = nomi.clienti[k] || k; }
      else if (per === 'impianto') { k = x.t.sede_id === null ? '' : String(x.t.sede_id); nome = x.t.sede_id ? nomi.sedi[x.t.sede_id] || k : 'Nessun impianto'; }
      else if (per === 'persona') { k = x.t.responsabile_id === null ? '' : String(x.t.responsabile_id); nome = x.t.responsabile_id ? nomi.utenti[x.t.responsabile_id] || k : 'Nessuno'; }
      else { k = dataIso(x.t.aperto_il).slice(0, 7); nome = C.nomeMese(k); }
      if (!gruppi.has(k)) gruppi.set(k, { nome, lista: [] });
      gruppi.get(k).lista.push(x);
    }
    const out = Array.from(gruppi.entries()).map(([k, g]) => Object.assign({ chiave: k, nome: g.nome }, riassunto(g.lista)));
    if (per === 'mese') out.sort((x, y) => x.chiave.localeCompare(y.chiave));
    else out.sort((x, y) => y.aperti - x.aperti || String(x.nome).localeCompare(String(y.nome), 'it'));
    // "totale" e' anche un campo dei soldi (§12.1): qui e' il riassunto dei ticket e resta anche senza costi (dentro, costo e fatturato no).
    return soldiPropri({ ok: true, da, a, per, totale: riassunto(tutti), righe: out }, ['totale']);
  },
};

/** Un istante mandato dalle app ("2026-10-22T08:40:00", ora italiana) come si salva. */
function istanteTicket(v) {
  const s = testo(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
  if (isNaN(d.getTime())) throw new Rifiuto('Aperto il: scrivi giorno e ora');
  return istante(d);
}

Object.defineProperties(module.exports, {
  TIPI_TICKET: { value: TIPI },
  ORIGINI_TICKET: { value: ORIGINI },
  PRIORITA_TICKET: { value: PRIORITA },
  STATI_TICKET: { value: STATI },
  MODI_FATTURAZIONE_TICKET: { value: MODI },
  CATEGORIE_IMPIANTO: { value: CATEGORIE_IMPIANTO },
  AMBIENTI_IMPIANTO: { value: AMBIENTI },
  quandoLungo: { value: quandoLungo },
  ORDINE_PRIORITA: { value: ORDINE_PRIORITA },
});
