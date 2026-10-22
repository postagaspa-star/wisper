/*
 * La pagina iniziale: risponde a "cosa devo fare adesso?". Prima i problemi
 * (Urgenti), poi Questa settimana, poi Da pianificare; ogni voce dice dove si
 * sistema (collegamento). I numeri e le voci di soldi solo a chi ha "costi";
 * al collaboratore solo le sue cose, e i giorni senza rapportino sono i suoi.
 *
 * Ogni voce: {tipo, gravita, titolo, dettaglio, quanto, unita, collegamento}
 *  - gravita: 'urgente' | 'attenzione' | 'soldi' | 'info'
 *  - quanto/unita: il numero a destra, se c'e' (euro, ore, giorni, rapportini)
 *  - collegamento: {pagina, id?, filtro?}; pagina tra dashboard, clienti,
 *    cliente, commesse, commessa, rapportini, fatturazione, amministrazione e,
 *    dalla fase 2, preventivi, preventivo, attivita, calendario; dalla fase 3
 *    spese (Spese e trasferte) e i filtri "segmento" di rapportini e spese
 */
'use strict';

const { testo, numero, centesimi, oggi, piuGiorni, dataOraIso, dataIso } = require('../utili');
const { budgetDi } = require('../conti');
const { giornoAttivita } = require('./attivita');
const { etichettaPreventivo, statoVistoPreventivo } = require('./preventivi');
const { contaNeiConti } = require('../conti');
const C = require('../conti');
const { giornoLungo } = require('./fatture');

const ORDINE = { urgente: 0, soldi: 1, attenzione: 2, info: 3 };
const MASSIMO_PER_SEZIONE = 20;

const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
/** I numeri nelle frasi come li scrive una persona: 7,5 e non 7.5. */
const virgola = n => String(n).replace('.', ',');
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const nomeGiorno = iso => GIORNI[new Date(iso + 'T12:00:00').getDay()] + ' ' + Number(iso.slice(8, 10));

function lunediDi(iso) {
  const d = new Date(iso + 'T12:00:00');
  return piuGiorni(iso, -((d.getDay() + 6) % 7));
}

function plurale(n, uno, tanti) {
  return n + ' ' + (n === 1 ? uno : tanti);
}

module.exports = {
  dashboard(d) {
    const c = this.chi();
    const soloSuoi = this.soloSuoi();
    // Il ruolo decide; chi vede tutto puo' guardare anche "come un collaboratore" (per provare).
    const per = soloSuoi ? 'collaboratore' : (d.per === 'collaboratore' ? 'collaboratore' : 'titolare');
    const mie = per === 'collaboratore';
    const costi = this.vedeCosti() && !mie;
    const io = c.utente ? c.utente.id : null;
    const adesso = oggi();
    const lunedi = lunediDi(adesso);
    const mese = adesso.slice(0, 7);
    const imp = this.leggiImpostazioni();

    const tutti = this.db.righe("SELECT * FROM rapportini WHERE UPPER(stato) <> 'ANNULLATO'");
    const rapportini = mie ? tutti.filter(r => r.utente_id === io) : tutti;
    const clienti = {};
    for (const s of this.soggettiAttivi()) clienti[s.id] = s;
    let commesse = this.leggiCommesse();
    if (mie) commesse = commesse.filter(m => m.responsabileId === io || m.persone.indexOf(io) >= 0);

    const urgenti = [];
    const settimana = [];
    const pianificare = [];
    const voce = (lista, v) => lista.push(Object.assign({ quanto: null, unita: null, dettaglio: '' }, v));

    // ------------------------------------------------------------ commesse
    const oreLavoro = {};
    for (const r of tutti) {
      const k = testo(r.id_commessa).toUpperCase();
      if (k) oreLavoro[k] = (oreLavoro[k] || 0) + numero(r.ore_lavoro) + numero(r.ore_extra);
    }
    const numeriCommesse = { aperte: 0, sospese: 0, chiuse: 0, inRitardo: 0 };
    for (const m of commesse) {
      if (m.stato === 'APERTA') numeriCommesse.aperte++;
      else if (m.stato === 'SOSPESA') numeriCommesse.sospese++;
      else if (m.stato === 'CHIUSA') numeriCommesse.chiuse++;
      if (m.stato !== 'APERTA') continue;
      const cliente = clienti[m.idCliente];
      const nomeCliente = cliente ? cliente.nome : '';
      const collegamento = { pagina: 'commessa', id: m.id };
      if (m.finePrevista && m.finePrevista < adesso) {
        numeriCommesse.inRitardo++;
        const giorni = Math.round((Date.parse(adesso) - Date.parse(m.finePrevista)) / 86400000);
        voce(urgenti, { tipo: 'commessa', gravita: 'urgente', titolo: m.id + ' è in ritardo',
          dettaglio: m.descrizione + ' · doveva finire il ' + dataBreve(m.finePrevista), quanto: giorni, unita: 'giorni', collegamento });
      } else if (m.finePrevista && m.finePrevista <= piuGiorni(adesso, 7)) {
        voce(settimana, { tipo: 'commessa', gravita: 'attenzione', titolo: m.id + ' finisce ' + (m.finePrevista === adesso ? 'oggi' : 'il ' + dataBreve(m.finePrevista)),
          dettaglio: m.descrizione + (nomeCliente ? ' · ' + nomeCliente : ''), collegamento });
      }
      const budget = budgetDi(m, cliente, imp);
      const ore = Math.round((oreLavoro[m.id.toUpperCase()] || 0) * 100) / 100;
      if (budget.ore) {
        const perc = ore / budget.ore;
        if (perc >= 1) {
          voce(urgenti, { tipo: 'commessa', gravita: 'urgente', titolo: m.id + ': ore oltre il budget',
            dettaglio: virgola(ore) + ' h su ' + virgola(budget.ore) + ' h · ' + m.descrizione, quanto: ore, unita: 'ore', collegamento });
        } else if (perc >= 0.85) {
          voce(settimana, { tipo: 'commessa', gravita: 'attenzione', titolo: m.id + ': budget quasi finito',
            dettaglio: virgola(ore) + ' h su ' + virgola(budget.ore) + ' h · ' + m.descrizione, quanto: ore, unita: 'ore', collegamento });
        }
      }
      if (!mie) {
        const manca = [];
        if (!m.responsabileId) manca.push('il responsabile');
        if (!m.finePrevista) manca.push('la fine prevista');
        if (!budget.ore && !budget.euro) manca.push('il budget');
        if (manca.length) {
          voce(pianificare, { tipo: 'commessa', gravita: 'info', titolo: m.id + ': manca ' + manca.join(', '),
            dettaglio: m.descrizione + (nomeCliente ? ' · ' + nomeCliente : ''), collegamento });
        }
      }
    }

    // Le prestazioni non ancora cominciate non stanno qui: sono il normale avanzare di
    // una commessa, non una cosa da sistemare (riempivano la sezione di righe inutili).

    // ------------------------------------------------------------ rapportini
    const settimanaFa = piuGiorni(adesso, -7);
    const bozze = rapportini.filter(r => (testo(r.stato).toUpperCase() || 'BOZZA') === 'BOZZA');
    const vecchie = bozze.filter(r => r.data && r.data < settimanaFa);
    const recenti = bozze.filter(r => !(r.data && r.data < settimanaFa));
    // Fase 3: uno che aspetta l'approvazione non si manda ancora (sta tra le cose da approvare).
    const firmati = rapportini.filter(r => testo(r.stato).toUpperCase() === 'FIRMATO' &&
      r.stato_approvazione !== 'da_approvare' && r.stato_approvazione !== 'respinto');
    // Fase 5: i rapportini di un ticket aperto (aspettano la chiusura) o chiuso nel contratto o senza fattura non contano qui.
    const trattenuti = new Set(this.db.righe("SELECT id FROM ticket WHERE stato IN ('aperto', 'in_carico', 'in_attesa', 'risolto') OR (stato = 'chiuso' AND fatturazione IN ('contratto', 'no'))").map(t => t.id));
    const daFatturare = rapportini.filter(r => ['FIRMATO', 'INVIATO'].indexOf(testo(r.stato).toUpperCase()) >= 0 && !(r.ticket_id && trattenuti.has(r.ticket_id)));
    if (vecchie.length) {
      voce(urgenti, { tipo: 'rapportini', gravita: 'urgente', titolo: plurale(vecchie.length, 'rapportino da far firmare', 'rapportini da far firmare') + ' da più di una settimana',
        dettaglio: 'Il più vecchio è del ' + dataBreve(vecchie.map(r => r.data).sort()[0]), quanto: vecchie.length, unita: 'rapportini',
        collegamento: { pagina: 'rapportini', filtro: { stato: 'BOZZA', a: settimanaFa } } });
    }
    if (recenti.length) {
      voce(settimana, { tipo: 'rapportini', gravita: 'info', titolo: plurale(recenti.length, 'rapportino da far firmare', 'rapportini da far firmare'),
        dettaglio: 'Questa settimana', quanto: recenti.length, unita: 'rapportini', collegamento: { pagina: 'rapportini', filtro: { stato: 'BOZZA' } } });
    }
    if (firmati.length) {
      voce(settimana, { tipo: 'rapportini', gravita: 'attenzione', titolo: plurale(firmati.length, 'rapportino firmato da mandare', 'rapportini firmati da mandare'),
        dettaglio: 'Al cliente, con il PDF', quanto: firmati.length, unita: 'rapportini', collegamento: { pagina: 'rapportini', filtro: { stato: 'FIRMATO' } } });
    }

    // I giorni lavorativi (lunedi'-venerdi') degli ultimi 14 senza nessun rapportino: i suoi per il
    // collaboratore, quelli dello studio per chi vede tutto. Oggi non conta: la giornata non e' finita.
    const giorniConRapportino = new Set(rapportini.map(r => r.data).filter(Boolean));
    const giorniSenza = [];
    for (let i = 14; i >= 1; i--) {
      const g = piuGiorni(adesso, -i);
      const dow = new Date(g + 'T12:00:00').getDay();
      if (dow === 0 || dow === 6) continue;
      if (!giorniConRapportino.has(g)) giorniSenza.push(g);
    }
    const recentiSenza = giorniSenza.filter(g => g >= settimanaFa);
    if (recentiSenza.length) {
      voce(urgenti, { tipo: 'giorni', gravita: 'attenzione', titolo: plurale(recentiSenza.length, 'giorno senza rapportino', 'giorni senza rapportino'),
        dettaglio: recentiSenza.map(nomeGiorno).join(', '), quanto: recentiSenza.length, unita: 'giorni',
        collegamento: { pagina: 'rapportini', filtro: { senzaRapportino: true } } });
    }

    // ------------------------------------------------------------ soldi (solo con "costi")
    let soldi;
    // Fase 4: chi vede le fatture (o le banche) e i soldi ha le voci nuove (§12); "Da fatturare" conta tutte le sorgenti.
    const fase4 = costi && (this.livello('fatturazione') > 0 || this.livello('banche') > 0);
    if (costi) {
      const somma = lista => centesimi(lista.reduce((s, r) => s + numero(r.totale), 0));
      const deiMesiPrima = daFatturare.filter(r => r.data && r.data.slice(0, 7) < mese);
      const diQuestoMese = daFatturare.filter(r => r.data && r.data.slice(0, 7) === mese);
      if (deiMesiPrima.length && !fase4) {
        const mesePiuVecchio = deiMesiPrima.map(r => r.data.slice(0, 7)).sort()[0];
        voce(urgenti, { tipo: 'fatturazione', gravita: 'soldi', titolo: 'Da fatturare dei mesi scorsi',
          dettaglio: plurale(deiMesiPrima.length, 'rapportino firmato o mandato', 'rapportini firmati o mandati') + ', dal ' + mesePiuVecchio.slice(5, 7) + '/' + mesePiuVecchio.slice(0, 4),
          quanto: somma(deiMesiPrima), unita: 'euro', collegamento: { pagina: 'fatturazione', filtro: { mese: mesePiuVecchio } } });
      }
      if (diQuestoMese.length && !fase4) {
        voce(settimana, { tipo: 'fatturazione', gravita: 'soldi', titolo: 'Da fatturare questo mese',
          dettaglio: plurale(diQuestoMese.length, 'rapportino firmato o mandato', 'rapportini firmati o mandati'), quanto: somma(diQuestoMese), unita: 'euro',
          collegamento: { pagina: 'fatturazione', filtro: { mese } } });
      }
      // I clienti con commesse aperte senza codice SDI e PEC: serviranno per le fatture.
      const senzaSdi = Object.values(clienti).filter(s => s.cliente && !s.archiviato && !s.codiceSdi && !s.pec &&
        commesse.some(m => m.stato === 'APERTA' && m.idCliente === s.id));
      for (const s of senzaSdi) {
        voce(pianificare, { tipo: 'cliente', gravita: 'info', titolo: s.nome + ': mancano codice SDI e PEC',
          dettaglio: 'Serviranno per le fatture', collegamento: { pagina: 'cliente', id: s.id } });
      }
      const clientiDelMese = new Set(diQuestoMese.map(r => r.id_cliente));
      soldi = {
        daFatturare: somma(daFatturare),
        daFatturareMesiPrima: somma(deiMesiPrima),
        inBozza: somma(bozze),
        fatturatoMese: somma(rapportini.filter(r => testo(r.stato).toUpperCase() === 'FATTURATO' && testo(r.fatturato_il).slice(0, 7) === mese)),
        clientiDaFatturare: clientiDelMese.size,
      };
      if (fase4) Object.assign(soldi, this.dashboardFase4({ adesso, lunedi, mese, voce, urgenti, settimana, pianificare, ruolo: c.utente ? c.utente.ruolo : '' }));
    }

    // ------------------------------------------------------------ fase 2: attivita' e preventivi
    const fase2 = this.dashboardFase2({ mie, costi, io, adesso, voce, urgenti, settimana, pianificare });
    if (soldi && fase2.preventiviInAttesa !== undefined) soldi.preventiviInAttesa = fase2.preventiviInAttesa;
    // ------------------------------------------------------------ fase 3: ore, approvazioni, rimborsi, ACI
    const fase3 = this.dashboardFase3({ mie, costi, io, adesso, lunedi, mese, voce, urgenti, settimana, pianificare });

    const oreDa = da => Math.round(rapportini.filter(r => r.data && r.data >= da && r.data <= adesso)
      .reduce((s, r) => s + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)), 0) * 100) / 100;

    const ordina = lista => lista.sort((a, b) => ORDINE[a.gravita] - ORDINE[b.gravita]).slice(0, MASSIMO_PER_SEZIONE);
    const risposta = {
      ok: true,
      per,
      oggi: adesso,
      numeri: {
        commesse: numeriCommesse,
        rapportini: {
          daFirmare: bozze.length,
          daMandare: firmati.length,
          daFatturare: daFatturare.length,
          oreSettimana: oreDa(lunedi),
          oreMese: oreDa(mese + '-01'),
        },
        giorniSenzaRapportino: giorniSenza,
      },
      urgenti: ordina(urgenti),
      settimana: ordina(settimana),
      pianificare: ordina(pianificare),
    };
    if (soldi) risposta.numeri.soldi = soldi;
    if (fase2.preventivi) risposta.numeri.preventivi = fase2.preventivi;
    if (fase2.attivita) risposta.numeri.attivita = fase2.attivita;
    if (fase2.agenda) risposta.agenda = fase2.agenda;
    if (fase3.ore) risposta.numeri.ore = fase3.ore;
    if (fase3.approvare) risposta.numeri.approvare = fase3.approvare;
    if (fase3.rimborsi) risposta.numeri.rimborsi = fase3.rimborsi;
    // Fase 5: ticket, documenti, scadenze, contratti, spazio sul NAS (le voci entrano nelle tre sezioni prima di ordinarle).
    const fase5 = this.dashboardFase5({ mie, costi, io, adesso, voce, urgenti, settimana, pianificare });
    risposta.urgenti = ordina(urgenti);
    // Un ticket, una voce sola: se e' gia' tra le urgenti (in ritardo, non preso), non si ripete in settimana o da
    // pianificare (per esempio "Intervento di oggi" dello stesso ticket). Il resto delle voci resta com'e'.
    const ticketUrgenti = new Set(risposta.urgenti.filter(v => v.collegamento && v.collegamento.pagina === 'ticket').map(v => String(v.collegamento.id)));
    const nonRipetuto = v => !(v.collegamento && v.collegamento.pagina === 'ticket' && ticketUrgenti.has(String(v.collegamento.id)));
    risposta.settimana = ordina(settimana.filter(nonRipetuto));
    risposta.pianificare = ordina(pianificare.filter(nonRipetuto));
    for (const k of ['ticket', 'documenti', 'scadenze', 'contratti', 'spazio']) if (fase5[k]) risposta.numeri[k] = fase5[k];
    return risposta;
  },

  /**
   * Le voci della fase 5 (fase5.md §11.1), con le frasi dell'accordo:
   *  - urgenti: ticket urgenti non presi o in ritardo (uno per uno fino a 3),
   *    scadenze scadute, le proprie revisioni respinte, disco quasi pieno;
   *  - questa settimana: interventi di oggi, documenti da approvare, ticket
   *    risolti da chiudere, scadenze nel preavviso entro 30 giorni, contratti
   *    in scadenza;
   *  - da pianificare: ticket da prendere, programmati da pianificare entro 30
   *    giorni, scadenze fra 31 e 120 giorni, documenti da classificare, file
   *    troppo grandi per la copia fuori casa, spazio sotto l'avviso.
   * Il collaboratore: i suoi ticket e quelli da prendere, i suoi interventi, le
   * sue revisioni; niente contratti, niente spazio, niente soldi.
   */
  dashboardFase5({ mie, costi, io, adesso, voce, urgenti, settimana, pianificare }) {
    const out = {};
    const nomiCli = {};
    this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomiCli[s.id] = s.nome; });
    const nomiSedi = {};
    this.db.righe('SELECT id, nome, citta FROM sedi').forEach(s => { nomiSedi[s.id] = s; });
    const utenti = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { utenti[u.id] = u.nome; });
    const ora = ist => { const o = dataOraIso(ist).slice(11, 16); return Number(o.slice(0, 2)) + ':' + o.slice(3); };
    const quandoGiorno = ist => {
      const g = dataIso(ist);
      if (g === adesso) return 'le ' + ora(ist);
      if (g === piuGiorni(adesso, 1)) return 'domani alle ' + ora(ist);
      if (g === piuGiorni(adesso, -1)) return 'ieri alle ' + ora(ist);
      return nomeGiorno(g) + ' alle ' + ora(ist);
    };
    const t30 = piuGiorni(adesso, 30);

    // ------------------------------------------------------------ ticket
    if (this.livello('ticket') >= 1) {
      const vis = mie ? this.aiutiVisibilita() : null;
      let tutti = this.db.righe('SELECT * FROM ticket').filter(t => this.vedeTicket(t, vis));
      if (mie) tutti = tutti.filter(t => t.responsabile_id === io || t.responsabile_id === null);
      const vivi = tutti.filter(t => ['aperto', 'in_carico', 'in_attesa', 'risolto'].indexOf(t.stato) >= 0 && !(t.tipo === 'programmato' && t.previsto_il > t30));
      const conInterventi = new Set(this.db.righe("SELECT DISTINCT ticket_id FROM attivita WHERE ticket_id IS NOT NULL AND stato <> 'annullata'").map(r => r.ticket_id));
      const oggiInterventi = this.db.righe("SELECT * FROM attivita WHERE ticket_id IS NOT NULL AND stato <> 'annullata' AND inizio <> '' ORDER BY inizio")
        .filter(a => dataIso(a.inizio) === adesso && (!mie || a.assegnata_a === io));
      const daChiudere = tutti.filter(t => t.stato === 'risolto');
      const programmati = tutti.filter(t => t.tipo === 'programmato' && (t.stato === 'aperto' || t.stato === 'in_carico') && !conInterventi.has(t.id) && (!t.previsto_il || t.previsto_il <= t30));
      out.ticket = {
        aperti: vivi.length, urgenti: vivi.filter(t => t.priorita === 'urgente' && t.stato !== 'risolto').length,
        nonAssegnati: vivi.filter(t => t.responsabile_id === null && t.stato === 'aperto').length,
        inRitardo: vivi.filter(t => !!this.ritardoTicket(t)).length, interventiOggi: oggiInterventi.length,
        risoltiDaChiudere: daChiudere.length, programmatiDaPianificare: programmati.length,
      };
      const dove = t => [nomiCli[t.cliente_id], t.sede_id && nomiSedi[t.sede_id] ? nomiSedi[t.sede_id].nome : ''].filter(Boolean).join(' · ');
      // Urgenti non presi o in ritardo: uno per uno fino a 3, poi una voce sola.
      const caldi = vivi.filter(t => t.stato !== 'risolto' && ((t.priorita === 'urgente' && !t.preso_il) || this.ritardoTicket(t)) && (!mie || t.responsabile_id === io || t.responsabile_id === null));
      if (caldi.length && caldi.length <= 3) {
        for (const t of caldi) {
          const urgente = t.priorita === 'urgente';
          const coda = !t.preso_il ? 'aperto ' + (dataIso(t.aperto_il) === adesso ? 'alle ' + ora(t.aperto_il) : quandoGiorno(t.aperto_il)) + ' · nessuno l\'ha preso'
            : t.entro_intervento ? 'intervento previsto entro ' + quandoGiorno(t.entro_intervento) : this.ritardoTicket(t);
          voce(urgenti, { tipo: 'ticket', gravita: 'urgente', titolo: t.numero + (urgente ? ' urgente: ' : ' in ritardo: ') + t.titolo,
            dettaglio: [dove(t), coda].filter(Boolean).join(' · '), collegamento: { pagina: 'ticket', id: t.id } });
        }
      } else if (caldi.length) {
        voce(urgenti, { tipo: 'ticket', gravita: 'urgente', titolo: caldi.length + ' ticket urgenti o in ritardo', dettaglio: caldi.slice(0, 3).map(t => t.numero).join(', '),
          quanto: caldi.length, unita: 'ticket', collegamento: { pagina: 'tickets', filtro: { segmento: 'aperti', priorita: 'urgente' } } });
      }
      // Gli interventi di oggi, uno per uno.
      const numeri = {};
      tutti.forEach(t => { numeri[t.id] = t; });
      for (const a of oggiInterventi) {
        const t = numeri[a.ticket_id] || this.db.riga('SELECT * FROM ticket WHERE id = ?', a.ticket_id);
        if (!t) continue;
        const s = t.sede_id ? nomiSedi[t.sede_id] : null;
        voce(settimana, { tipo: 'intervento', gravita: 'attenzione', titolo: 'Intervento di oggi alle ' + ora(a.inizio) + ': ' + t.numero + ' ' + t.titolo,
          dettaglio: [a.assegnata_a ? utenti[a.assegnata_a] : '', nomiCli[t.cliente_id], s ? s.citta || s.nome : ''].filter(Boolean).join(' · '),
          collegamento: { pagina: 'ticket', id: t.id } });
      }
      // I risolti da chiudere: chi chiude (titolare e amministrazione).
      if (!mie && this.puoChiudereTicket()) {
        const lista = daChiudere.slice(0, 3);
        for (const t of daChiudere.length <= 3 ? lista : []) {
          const r = this.db.riga("SELECT firmato_il FROM rapportini WHERE ticket_id = ? AND firmato_il <> '' AND UPPER(stato) <> 'ANNULLATO' ORDER BY firmato_il DESC LIMIT 1", t.id);
          voce(settimana, { tipo: 'ticket', gravita: 'attenzione', titolo: t.numero + ' risolto: da chiudere',
            dettaglio: [nomiCli[t.cliente_id], r ? 'rapportino firmato il ' + dataBreve(dataIso(r.firmato_il)) : 'risolto il ' + dataBreve(dataIso(t.risolto_il))].filter(Boolean).join(' · '),
            collegamento: { pagina: 'ticket', id: t.id } });
        }
        if (daChiudere.length > 3) {
          voce(settimana, { tipo: 'ticket', gravita: 'attenzione', titolo: daChiudere.length + ' ticket risolti da chiudere', dettaglio: lista.map(t => t.numero).join(', '),
            quanto: daChiudere.length, unita: 'ticket', collegamento: { pagina: 'tickets', filtro: { segmento: 'aperti' } } });
        }
      }
      // Da prendere (non urgenti: gli urgenti stanno sopra).
      const daPrendere = vivi.filter(t => t.responsabile_id === null && t.stato === 'aperto' && t.priorita !== 'urgente' && t.tipo !== 'programmato');
      if (daPrendere.length) {
        voce(pianificare, { tipo: 'ticket', gravita: 'info', titolo: daPrendere.length === 1 ? '1 ticket da prendere' : daPrendere.length + ' ticket da prendere',
          dettaglio: daPrendere.slice(0, 3).map(t => t.numero + ' ' + t.titolo).join(', '), quanto: daPrendere.length, unita: 'ticket',
          collegamento: { pagina: 'tickets', filtro: { segmento: 'aperti', nonAssegnati: true } } });
      }
      for (const t of programmati.filter(x => !mie || x.responsabile_id === io)) {
        voce(pianificare, { tipo: 'ticket', gravita: 'info', titolo: t.titolo + (t.previsto_il ? ' del ' + dataBreve(t.previsto_il) : '') + ' da pianificare',
          dettaglio: [t.numero, nomiCli[t.cliente_id]].filter(Boolean).join(' · '), collegamento: { pagina: 'ticket', id: t.id } });
      }
    }

    // ------------------------------------------------------------ documenti
    if (this.livello('documenti') >= 1) {
      const elenco = this.leggiDocumenti({ archivio: true });
      out.documenti = elenco.conteggi;
      const approva = this.puoApprovareDocumenti() && this.livello('documenti') >= 2;
      const versioni = this.db.righe("SELECT v.*, d.titolo, d.vede, d.archiviato FROM documento_versioni v JOIN documenti d ON d.id = v.documento_id WHERE v.tolta IS NULL AND d.archiviato IS NULL ORDER BY v.id")
        .filter(v => this.vedeLivello(v.vede));
      if (approva) {
        const attesa = versioni.filter(v => v.stato === 'da_approvare');
        if (attesa.length) {
          voce(settimana, { tipo: 'documento', gravita: 'attenzione', titolo: attesa.length === 1 ? '1 documento da approvare' : attesa.length + ' documenti da approvare',
            dettaglio: attesa[0].titolo + ' rev. ' + attesa[0].numero + (attesa[0].caricata_da ? ' · ' + (utenti[attesa[0].caricata_da] || '') : ''), quanto: attesa.length, unita: 'documenti',
            collegamento: { pagina: 'documenti', filtro: { segmento: 'approvare' } } });
        }
      }
      // Le proprie revisioni respinte (urgenti) e, per chi non approva, quelle che aspettano.
      for (const v of versioni.filter(x => x.caricata_da === io && x.stato === 'respinta')) {
        voce(urgenti, { tipo: 'documento', gravita: 'attenzione', titolo: v.titolo + ' rev. ' + v.numero + ' respinta',
          dettaglio: 'Motivo: ' + v.motivo_rifiuto + (v.decisa_da ? ' · ' + (utenti[v.decisa_da] || '') : ''), collegamento: { pagina: 'documento', id: v.documento_id } });
      }
      if (!approva) {
        for (const v of versioni.filter(x => x.caricata_da === io && x.stato === 'da_approvare')) {
          voce(settimana, { tipo: 'documento', gravita: 'info', titolo: v.titolo + ' rev. ' + v.numero + ': aspetta l\'approvazione', dettaglio: '',
            collegamento: { pagina: 'documento', id: v.documento_id } });
        }
      }
      if (!mie && this.livello('documenti') >= 2 && elenco.conteggi.daClassificare) {
        const n = elenco.conteggi.daClassificare;
        voce(pianificare, { tipo: 'documento', gravita: 'info', titolo: n === 1 ? '1 documento da classificare' : n + ' documenti da classificare', dettaglio: 'Arrivati senza categoria',
          quanto: n, unita: 'documenti', collegamento: { pagina: 'documenti', filtro: { segmento: 'archivio', daClassificare: true } } });
      }
    }

    // ------------------------------------------------------------ scadenze (niente per il collaboratore: sono dell'ufficio)
    if (this.livello('documenti') >= 1 || this.livello('ticket') >= 1) {
      const aperte = this.db.righe("SELECT * FROM scadenze WHERE stato = 'aperta' ORDER BY data, id").filter(s => this.vedeScadenza(s));
      const scadute = aperte.filter(s => s.data < adesso);
      const entro = aperte.filter(s => s.data >= adesso && this.gruppoScadenza(s) === 'entro');
      out.scadenze = { scadute: scadute.length, entro: entro.length, vicine: scadute.length + entro.length };
      if (!mie) {
        const base = s => s.titolo.replace(/ scade$/, '');
        const dove = s => [nomiCli[s.cliente_id], s.sede_id && nomiSedi[s.sede_id] ? nomiSedi[s.sede_id].nome : ''].filter(Boolean).join(' · ');
        const proprie = l => l.filter(s => s.tipo !== 'contratto' && !(s.azione === 'ticket' && s.ticket_id));
        const sc = proprie(scadute);
        for (const s of sc.length <= 3 ? sc : []) {
          const g = Math.round((Date.parse(adesso + 'T12:00:00') - Date.parse(s.data + 'T12:00:00')) / 86400000);
          voce(urgenti, { tipo: 'scadenza', gravita: 'urgente', titolo: base(s) + ' scaduta da ' + plurale(g, 'giorno', 'giorni'), dettaglio: dove(s),
            quanto: g, unita: 'giorni', collegamento: { pagina: 'scadenza', id: s.id } });
        }
        if (sc.length > 3) {
          voce(urgenti, { tipo: 'scadenza', gravita: 'urgente', titolo: sc.length + ' scadenze scadute', dettaglio: sc.slice(0, 3).map(base).join(', '), quanto: sc.length, unita: 'scadenze',
            collegamento: { pagina: 'documenti', filtro: { segmento: 'scadenze' } } });
        }
        for (const s of proprie(entro).filter(x => x.data <= t30)) {
          const g = Math.round((Date.parse(s.data + 'T12:00:00') - Date.parse(adesso + 'T12:00:00')) / 86400000);
          const quando = g === 0 ? ' oggi' : g === 1 ? ' domani' : ' fra ' + g + ' giorni';
          voce(settimana, { tipo: 'scadenza', gravita: 'attenzione', titolo: base(s) + ' scade' + quando, dettaglio: dove(s), quanto: g, unita: 'giorni',
            collegamento: { pagina: 'scadenza', id: s.id } });
        }
        const lontane = proprie(aperte).filter(s => s.data > piuGiorni(adesso, 30) && s.data <= piuGiorni(adesso, 120));
        for (const s of lontane.slice(0, 5)) {
          voce(pianificare, { tipo: 'scadenza', gravita: 'info', titolo: base(s) + ': ' + dataBreve(s.data) + '/' + s.data.slice(0, 4), dettaglio: dove(s),
            collegamento: { pagina: 'scadenza', id: s.id } });
        }
      }
    }

    // ------------------------------------------------------------ contratti (con i soldi, non il collaboratore)
    if (!mie && costi && this.livello('ticket') >= 1) {
      const contratti = this.db.righe("SELECT * FROM contratti WHERE stato IN ('attivo', 'disdetto')");
      const inScadenza = contratti.filter(c => this.statoVistoContratto(c).statoVisto === 'In scadenza');
      out.contratti = { attivi: contratti.filter(c => c.stato === 'attivo').length, inScadenza: inScadenza.length };
      for (const c of inScadenza) {
        if (c.rinnovo === 'tacito') {
          const entro = this.disdettaEntro(c);
          voce(settimana, { tipo: 'contratto', gravita: 'attenzione', titolo: c.numero + ': la disdetta va mandata entro ' + giornoLungo(entro),
            dettaglio: (nomiCli[c.cliente_id] || '') + ' · si rinnova da solo il ' + dataBreve(piuGiorni(c.al, 1)) + '/' + piuGiorni(c.al, 1).slice(0, 4),
            collegamento: { pagina: 'contratto', id: c.id } });
        } else {
          voce(settimana, { tipo: 'contratto', gravita: 'attenzione', titolo: c.numero + ' scade il ' + dataBreve(c.al) + '/' + c.al.slice(0, 4) + ': rinnovalo o lascialo scadere',
            dettaglio: (nomiCli[c.cliente_id] || '') + ' · ' + c.titolo, collegamento: { pagina: 'contratto', id: c.id } });
        }
      }
    }

    // ------------------------------------------------------------ spazio sul NAS e copia fuori casa (titolare e amministrazione)
    if (!mie && this.livello('amministrazione') >= 1) {
      const imp = this.leggiImpostazioni();
      const { liberoMb } = this.spazioDisco();
      const avvisoMb = numero(imp.SPAZIO_AVVISO_MB) || 10240;
      const minimoMb = numero(imp.SPAZIO_MINIMO_MB) || 2048;
      out.spazio = { liberoMb, avviso: liberoMb < avvisoMb };
      const grandezza = require('../documenti').grandezza;
      const collegamento = { pagina: 'amministrazione', filtro: { sezione: 'spazio' } };
      if (liberoMb < minimoMb) {
        voce(urgenti, { tipo: 'spazio', gravita: 'urgente', titolo: 'Il disco del NAS è quasi pieno: restano ' + grandezza(liberoMb), dettaglio: 'I documenti nuovi non si caricano finché non si libera spazio', collegamento });
      } else if (liberoMb < avvisoMb) {
        voce(pianificare, { tipo: 'spazio', gravita: 'info', titolo: 'Il disco del NAS si sta riempiendo: restano ' + grandezza(liberoMb), dettaglio: 'Amministrazione › Spazio sul NAS', collegamento });
      }
      const troppo = this.db.righe("SELECT id FROM file WHERE fuori_no = 'troppo grande' AND svuotato IS NULL AND cestinato IS NULL").length;
      if (troppo) {
        voce(pianificare, { tipo: 'copia', gravita: 'info', titolo: troppo === 1 ? '1 file è solo sul NAS: troppo grande per la copia fuori casa' : troppo + ' file sono solo sul NAS: troppo grandi per la copia fuori casa',
          dettaglio: 'Oltre ' + (numero(imp.COPIA_FUORI_MAX_MB) || 25) + ' MB', quanto: troppo, unita: null, collegamento });
      }
    }
    return out;
  },

  /**
   * Le voci della fase 4 (§12), per chi vede fatture o banche e i soldi:
   *  - urgenti: fatture scadute (una per una fino a 3, poi una voce sola),
   *    fatture gia' pagate da emettere entro 12 giorni, impegni scaduti, saldo
   *    previsto sotto soglia entro 14 giorni, da fatturare dei mesi scorsi;
   *  - questa settimana: da fatturare, incassi attesi e pagamenti entro 7
   *    giorni, fatture passate al programma da piu' di 3 giorni senza XML;
   *  - da pianificare: regole fiscali da confermare, saldo di un conto non
   *    aggiornato da 30 giorni, saldo sotto soglia piu' avanti, ricevute con la
   *    scadenza stimata, proposte di Wisper da confermare.
   * Torna i numeri da aggiungere a numeri.soldi.
   */
  dashboardFase4({ adesso, lunedi, mese, voce, urgenti, settimana, pianificare, ruolo }) {
    const euro = n => C.euroIt(n);
    const vedeFatture = this.livello('fatturazione') > 0;
    const vedeBanche = this.livello('banche') > 0;
    const out = {};
    // ---- da fatturare (tutte le sorgenti pronte)
    if (vedeFatture) {
      const voci = this.sorgentiDaFatturare({}).filter(v => v.pronta);
      const totale = centesimi(voci.reduce((t, v) => t + v.importo, 0));
      const clienti = Array.from(new Set(voci.map(v => v.idCliente)));
      const nomi = {};
      this.db.righe('SELECT id, nome FROM soggetti').forEach(x => { nomi[x.id] = x.nome; });
      out.daFatturare = totale;
      out.clientiDaFatturare = clienti.length;
      const vecchie = voci.filter(v => v.tipo !== 'scadenza' && v.data && v.data.slice(0, 7) < mese);
      out.daFatturareMesiPrima = centesimi(vecchie.reduce((t, v) => t + v.importo, 0));
      if (vecchie.length) {
        const piuVecchio = vecchie.map(v => v.data.slice(0, 7)).sort()[0];
        voce(urgenti, { tipo: 'fatturazione', gravita: 'soldi', titolo: 'Da fatturare dei mesi scorsi',
          dettaglio: plurale(vecchie.length, 'cosa pronta', 'cose pronte') + ', dal ' + piuVecchio.slice(5, 7) + '/' + piuVecchio.slice(0, 4),
          quanto: out.daFatturareMesiPrima, unita: 'euro', collegamento: { pagina: 'fatturazione', filtro: { mese: piuVecchio } } });
      }
      if (clienti.length) {
        const ordinati = clienti.map(id => ({ id, totale: voci.filter(v => v.idCliente === id).reduce((t, v) => t + v.importo, 0) })).sort((a, b) => b.totale - a.totale);
        voce(settimana, { tipo: 'fatturazione', gravita: 'soldi', titolo: 'Da fatturare',
          dettaglio: plurale(clienti.length, 'cliente', 'clienti') + ' · ' + ordinati.slice(0, 3).map(x => nomi[x.id] || x.id).join(', ') + (clienti.length > 3 ? '…' : ''),
          quanto: totale, unita: 'euro', collegamento: { pagina: 'fatturazione' } });
      }
      const fatture = this.db.righe("SELECT * FROM fatture WHERE tipo = 'fattura' AND stato IN ('bozza', 'pronta', 'emessa')");
      const a = this.aiutiFatture(fatture);
      out.fattureInBozza = centesimi(fatture.filter(f => f.stato !== 'emessa').reduce((t, f) => t + numero(f.totale), 0));
      const emesse = fatture.filter(f => f.stato === 'emessa').map(f => ({ f, p: this.pagamentoDi(f, a) }));
      out.daIncassare = centesimi(emesse.reduce((t, x) => t + x.p.residuo, 0));
      const scadute = emesse.filter(x => x.p.scaduta).sort((x, y) => y.p.giorniScaduta - x.p.giorniScaduta);
      out.scaduto = centesimi(scadute.reduce((t, x) => t + x.p.residuo, 0));
      if (scadute.length > 3) {
        voce(urgenti, { tipo: 'fattura', gravita: 'urgente', titolo: scadute.length + ' fatture scadute',
          dettaglio: 'Restano ' + euro(out.scaduto) + ' da incassare · la più vecchia da ' + scadute[0].p.giorniScaduta + ' giorni', quanto: out.scaduto, unita: 'euro',
          collegamento: { pagina: 'fatture', filtro: { scadute: true } } });
      } else {
        for (const { f, p } of scadute) {
          voce(urgenti, { tipo: 'fattura', gravita: 'urgente', titolo: 'Fattura ' + (f.numero || f.riferimento) + ' scaduta da ' + plurale(p.giorniScaduta, 'giorno', 'giorni'),
            dettaglio: (a.clienti[f.cliente_id] || '') + ' · restano ' + euro(p.residuo) + ' di ' + euro(f.netto), quanto: p.residuo, unita: 'euro',
            collegamento: { pagina: 'fattura', id: f.id } });
        }
      }
      // Incassate e poi stornate con una nota di credito: soldi del cliente da restituire o compensare.
      const stornate = this.db.righe("SELECT * FROM fatture WHERE tipo = 'fattura' AND stato IN ('emessa', 'annullata')");
      const aStornate = this.aiutiFatture(stornate);
      for (const f of stornate) {
        const p = this.pagamentoDi(f, aStornate);
        if (!(p.daRestituire > 0)) continue;
        voce(urgenti, { tipo: 'fattura', gravita: 'urgente', titolo: 'Fattura ' + (f.numero || f.riferimento) + ': ' + euro(p.daRestituire) + ' da restituire o compensare',
          dettaglio: (aStornate.clienti[f.cliente_id] || '') + ' · incassati ' + euro(p.incassato) + ', poi la nota di credito', quanto: p.daRestituire, unita: 'euro',
          collegamento: { pagina: 'fattura', id: f.id } });
      }
      // Gia' pagate (avviso di parcella) da emettere entro 12 giorni dall'incasso.
      for (const f of fatture.filter(x => x.stato !== 'emessa')) {
        const p = this.pagamentoDi(f, a);
        if (!p.daEmettereEntro) continue;
        voce(urgenti, { tipo: 'fattura', gravita: 'urgente', titolo: 'Emetti la fattura per ' + (a.clienti[f.cliente_id] || '') + ' entro ' + giornoLungo(p.daEmettereEntro),
          dettaglio: 'Ha già pagato il ' + dataBreve(p.incassi[p.incassi.length - 1].data) + ' · ' + f.riferimento, quanto: f.netto, unita: 'euro',
          collegamento: { pagina: 'fattura', id: f.id } });
      }
      // Passate al programma da piu' di 3 giorni senza l'XML di ritorno.
      const ferme = fatture.filter(f => f.stato === 'pronta' && dataIso(f.pronta_il) && dataIso(f.pronta_il) < piuGiorni(adesso, -3) && f.esito_sdi !== 'scartata');
      if (ferme.length) {
        voce(settimana, { tipo: 'fattura', gravita: 'attenzione', titolo: plurale(ferme.length, 'fattura passata', 'fatture passate') + ' al programma: manca l\'XML di ritorno',
          dettaglio: ferme.map(f => f.riferimento + ' · ' + (a.clienti[f.cliente_id] || '')).slice(0, 3).join(', '), quanto: ferme.length, unita: 'fatture',
          collegamento: { pagina: 'fatture', filtro: { stato: 'pronta' } } });
      }
      // Fatture ricevute con la scadenza stimata.
      const stimate = this.db.righe("SELECT r.*, s.nome fornitore FROM fatture_ricevute r LEFT JOIN soggetti s ON s.id = r.fornitore_id WHERE r.stato = 'attiva' AND r.scadenza_stimata = 1");
      const aperte = stimate.filter(r => this.statoRicevuta(r, this.aiutiRicevute([r])).daPagare > 0);
      if (aperte.length) {
        voce(pianificare, { tipo: 'ricevuta', gravita: 'info', titolo: plurale(aperte.length, 'fattura ricevuta', 'fatture ricevute') + ' con la scadenza stimata',
          dettaglio: aperte.slice(0, 3).map(r => (r.fornitore || '') + ' ' + r.numero).join(', ') + ' · messa a 30 giorni: controllala', quanto: aperte.length, unita: 'fatture',
          collegamento: { pagina: 'ricevute' } });
      }
      // Le regole fiscali non confermate (solo titolare e amministrazione).
      if (!this.regoleConfermate() && (ruolo === 'titolare' || ruolo === 'amministrazione')) {
        voce(pianificare, { tipo: 'fiscale', gravita: 'info', titolo: 'Regole delle fatture da confermare col commercialista',
          dettaglio: 'Contributo EPPI, ritenuta, bollo e tipo di documento: finché non sono confermate, ogni conto lo dice',
          collegamento: { pagina: 'amministrazione', filtro: { sezione: 'fiscale' } } });
      }
    }
    if (vedeBanche) {
      const conti = this.db.righe('SELECT * FROM conti WHERE attivo = 1');
      // Senza nessun conto non c'e' un saldo da prevedere: si chiede di scriverlo, niente avvisi di cassa.
      if (!conti.length) {
        voce(pianificare, { tipo: 'conto', gravita: 'info', titolo: 'Scrivi il conto dello studio',
          dettaglio: 'Banche e scadenze › Conti: nome, IBAN e il saldo letto in banca', collegamento: { pagina: 'conti' } });
        return out;
      }
      out.saldoConti = centesimi(conti.reduce((t, x) => t + this.saldoConto(x).saldo, 0));
      const movimenti = this.db.righe('SELECT * FROM movimenti WHERE annullato = 0 AND data >= ? AND data <= ?', lunedi, adesso);
      out.incassiSettimana = centesimi(movimenti.filter(m => m.verso === 'entrata').reduce((t, m) => t + m.importo, 0));
      out.pagamentiSettimana = centesimi(movimenti.filter(m => m.verso === 'uscita').reduce((t, m) => t + m.importo, 0));
      const s = this.scadenziario({ da: adesso, a: piuGiorni(adesso, 91) });
      let previsto = s.saldoPartenza;
      for (const g of s.giorni) if (g.data <= piuGiorni(adesso, 30)) previsto = g.saldo;
      out.saldoPrevisto30 = previsto;
      out.primoSottoSoglia = s.primoSottoSoglia;
      if (s.primoSottoSoglia) {
        const presto = s.primoSottoSoglia <= piuGiorni(adesso, 14);
        voce(presto ? urgenti : pianificare, { tipo: 'cassa', gravita: presto ? 'urgente' : 'info',
          titolo: 'Il saldo previsto scende sotto ' + C.numeroIt(s.soglia, 0, 2) + ' € ' + (s.primoSottoSoglia === adesso ? 'già oggi' : 'il ' + giornoLungo(s.primoSottoSoglia)),
          dettaglio: 'Saldo di oggi ' + euro(s.saldoOggi) + ' · guarda lo scadenziario', quanto: null, unita: null,
          collegamento: { pagina: 'scadenziario', filtro: { giorno: s.primoSottoSoglia } } });
      }
      // Impegni scaduti e non pagati (uno per uno fino a 3).
      const impegni = this.leggiImpegni({ stato: 'aperti' });
      const scaduti = impegni.filter(i => i.scaduto && !i.proposta);
      if (scaduti.length > 3) {
        voce(urgenti, { tipo: 'impegno', gravita: 'urgente', titolo: scaduti.length + ' pagamenti scaduti', dettaglio: scaduti.slice(0, 3).map(i => i.descrizione).join(', ') + '…',
          quanto: centesimi(scaduti.reduce((t, i) => t + numero(i.daPagare), 0)), unita: 'euro', collegamento: { pagina: 'impegni' } });
      } else {
        for (const i of scaduti) {
          voce(urgenti, { tipo: 'impegno', gravita: 'urgente', titolo: i.descrizione + ' scaduto da ' + plurale(i.giorniScaduto, 'giorno', 'giorni'),
            dettaglio: [i.codice ? 'codice ' + i.codice : '', 'era per il ' + dataBreve(i.scadenza)].filter(Boolean).join(' · '), quanto: i.daPagare, unita: i.daPagare === null ? null : 'euro',
            collegamento: { pagina: 'impegni', id: i.id } });
        }
      }
      // Incassi attesi e pagamenti entro 7 giorni.
      const entro = piuGiorni(adesso, 7);
      const prossimi = [].concat(...s.giorni.filter(g => g.data <= entro).map(g => g.righe.map(r => Object.assign({ giorno: g.data }, r))));
      const entrate = prossimi.filter(r => r.verso === 'entrata' && r.contaNelSaldo);
      const uscite = prossimi.filter(r => r.verso === 'uscita');
      const breve = r => r.titolo.split(' · ')[0] + ' ' + nomeGiorno(r.giorno);
      if (entrate.length) {
        voce(settimana, { tipo: 'cassa', gravita: 'soldi', titolo: 'Incassi attesi entro 7 giorni', dettaglio: entrate.slice(0, 3).map(breve).join(', '),
          quanto: centesimi(entrate.reduce((t, r) => t + r.importo, 0)), unita: 'euro', collegamento: { pagina: 'scadenziario' } });
      }
      if (uscite.length) {
        voce(settimana, { tipo: 'impegno', gravita: 'attenzione', titolo: 'Pagamenti entro 7 giorni', dettaglio: uscite.slice(0, 3).map(breve).join(', '),
          quanto: centesimi(uscite.filter(r => r.contaNelSaldo).reduce((t, r) => t + r.importo, 0)), unita: 'euro', collegamento: { pagina: 'scadenziario' } });
      }
      // Proposte di Wisper da confermare.
      const proposte = impegni.filter(i => i.proposta);
      if (proposte.length) {
        voce(pianificare, { tipo: 'impegno', gravita: 'info', titolo: plurale(proposte.length, 'proposta di Wisper', 'proposte di Wisper') + ' da confermare',
          dettaglio: proposte.slice(0, 3).map(i => i.descrizione).join(', '), quanto: proposte.length, unita: 'impegni', collegamento: { pagina: 'impegni', filtro: { proposte: true } } });
      }
      // Il saldo di un conto non aggiornato da 30 giorni.
      for (const c of conti) {
        const sc = this.saldoConto(c);
        if (sc.saldoAl && sc.saldoAl >= piuGiorni(adesso, -30)) continue;
        voce(pianificare, { tipo: 'conto', gravita: 'info', titolo: 'Aggiorna il saldo di ' + this.nomeConto(c),
          dettaglio: sc.saldoAl ? 'L\'ultimo saldo scritto è del ' + dataBreve(sc.saldoAl) + ': leggilo sull\'estratto conto' : 'Non hai ancora scritto il saldo letto in banca',
          collegamento: { pagina: 'conti', id: c.id } });
      }
    }
    return out;
  },

  /**
   * Le voci della fase 3:
   *  - per chi approva: le cose da approvare (urgenti), con quante hanno
   *    un'anomalia; i timer degli altri accesi da piu' di 10 ore;
   *  - per chi ha scritto: le sue cose respinte, col motivo (urgenti), e il suo
   *    timer acceso da piu' di 10 ore;
   *  - per chi segna i rimborsi (con "costi"): i rimborsi da fare;
   *  - per chi cambia i veicoli: dall'anno nuovo, finche' non si fa,
   *    "Aggiorna il rimborso km con le tabelle ACI {anno}".
   * Il collaboratore: le sue ore, le sue respinte e il suo timer; niente soldi.
   */
  dashboardFase3({ mie, costi, io, adesso, lunedi, mese, voce, urgenti, settimana, pianificare }) {
    const fuori = {};
    const nomi = {};
    this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi[u.id] = u.nome; });
    const vedeOre = this.livello('rapportini') > 0;
    const vedeSpese = this.livello('spese') > 0;

    // I numeri delle ore registrate: le mie (collaboratore) o di tutto lo studio.
    if (vedeOre) {
      const righe = this.db.righe('SELECT * FROM ore WHERE tolta IS NULL AND data >= ? AND data <= ?', mese + '-01', adesso)
        .filter(o => contaNeiConti(o) && (!mie || o.utente_id === io));
      const somma = l => Math.round(l.reduce((t, o) => t + numero(o.ore), 0) * 100) / 100;
      const mio = io ? this.db.riga('SELECT partito_il FROM timer WHERE utente_id = ?', io) : null;
      const settimanaOre = this.db.righe('SELECT * FROM ore WHERE tolta IS NULL AND data >= ? AND data <= ?', lunedi, adesso)
        .filter(o => contaNeiConti(o) && (!mie || o.utente_id === io));
      fuori.ore = {
        settimana: somma(settimanaOre), mese: somma(righe), fatturabiliMese: somma(righe.filter(o => o.fatturabile === 1)),
        timerAcceso: !!mio,
      };
    }

    // Le cose da approvare.
    if (!mie && (this.puoApprovare('rapportini') || this.puoApprovare('spese'))) {
      const da = this.daApprovare();
      fuori.approvare = { voci: da.quante, conAnomalie: da.conAnomalie };
      if (da.quante) {
        const conta = t => da.persone.reduce((n, p) => n + p.voci.filter(v => v.tipo === t).length, 0);
        const pezzi = [];
        if (conta('ore')) pezzi.push('ore');
        if (conta('spesa')) pezzi.push(conta('spesa') === 1 ? 'una spesa' : 'spese');
        if (conta('trasferta')) pezzi.push(conta('trasferta') === 1 ? 'una trasferta' : conta('trasferta') + ' trasferte');
        if (conta('rapportino')) pezzi.push(conta('rapportino') === 1 ? 'un rapportino' : conta('rapportino') + ' rapportini');
        const elenco = pezzi.length > 1 ? pezzi.slice(0, -1).join(', ') + ' e ' + pezzi[pezzi.length - 1] : pezzi[0];
        voce(urgenti, {
          tipo: 'approvare', gravita: 'attenzione',
          titolo: plurale(da.quante, 'cosa da approvare', 'cose da approvare') + (da.persone.length === 1 ? ' di ' + da.persone[0].nome : ''),
          dettaglio: elenco.charAt(0).toUpperCase() + elenco.slice(1) + (da.conAnomalie ? ' · ' + da.conAnomalie + ' con un\'anomalia' : ''),
          quanto: da.quante, unita: 'voci', collegamento: { pagina: 'rapportini', filtro: { segmento: 'daApprovare' } },
        });
      }
    }

    // Le mie cose respinte, col motivo: una per una fino a 3, poi una voce sola.
    if (io) {
      const respinte = [];
      const chi = id => (id && nomi[id] ? ' · ' + nomi[id] : '');
      if (vedeOre) {
        for (const o of this.db.righe("SELECT * FROM ore WHERE utente_id = ? AND stato = 'respinta' AND tolta IS NULL ORDER BY data", io)) {
          respinte.push({ titolo: 'Ore del ' + dataBreve(o.data) + ' respinte', dettaglio: 'Motivo: ' + o.motivo + chi(o.approvata_da),
            collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore', giorno: o.data } } });
        }
        for (const r of this.db.righe("SELECT * FROM rapportini WHERE utente_id = ? AND stato_approvazione = 'respinto' AND UPPER(stato) <> 'ANNULLATO' ORDER BY data", io)) {
          respinte.push({ titolo: r.id + ' respinto', dettaglio: 'Motivo: ' + r.motivo + chi(r.approvato_da),
            collegamento: { pagina: 'rapportini', filtro: { segmento: 'rapportini', id: r.id } } });
        }
      }
      if (vedeSpese) {
        for (const x of this.db.righe("SELECT * FROM spese WHERE utente_id = ? AND stato = 'respinta' AND tolta IS NULL AND rapportino_id IS NULL ORDER BY data", io)) {
          respinte.push({ titolo: 'Spesa del ' + dataBreve(x.data) + ' respinta', dettaglio: 'Motivo: ' + x.motivo + chi(x.approvata_da),
            collegamento: { pagina: 'spese', filtro: { segmento: 'spese', id: x.id } } });
        }
        for (const t of this.db.righe("SELECT * FROM trasferte WHERE utente_id = ? AND stato = 'respinta' AND tolta IS NULL ORDER BY dal", io)) {
          respinte.push({ titolo: 'Trasferta del ' + dataBreve(t.dal) + ' respinta', dettaglio: 'Motivo: ' + t.motivo_rifiuto + chi(t.approvata_da),
            collegamento: { pagina: 'spese', filtro: { segmento: 'trasferte', id: t.id } } });
        }
      }
      if (respinte.length && respinte.length <= 3) {
        for (const r of respinte) voce(urgenti, Object.assign({ tipo: 'respinta', gravita: 'attenzione' }, r));
      } else if (respinte.length) {
        voce(urgenti, { tipo: 'respinta', gravita: 'attenzione', titolo: respinte.length + ' cose respinte da correggere',
          dettaglio: respinte.slice(0, 3).map(r => r.titolo).join(', '), quanto: respinte.length, unita: 'voci',
          collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore', stato: 'respinta' } } });
      }
    }

    // I timer accesi da piu' di 10 ore: il mio sempre, quelli degli altri per chi approva.
    if (vedeOre) {
      const altri = !mie && this.puoApprovare('rapportini');
      for (const t of this.db.righe('SELECT * FROM timer ORDER BY partito_il')) {
        if (t.utente_id !== io && !altri) continue;
        const ore = (Date.now() - Date.parse(t.partito_il)) / 3600000;
        if (ore <= 10) continue;
        const da = dataOraIso(t.partito_il);
        const quando = 'dalle ' + Number(da.slice(11, 13)) + ':' + da.slice(14, 16) + (da.slice(0, 10) === adesso ? '' : ' del ' + dataBreve(da.slice(0, 10)));
        voce(urgenti, {
          tipo: 'timer', gravita: 'attenzione',
          titolo: (t.utente_id === io ? 'Il timer è acceso da ' : 'Il timer di ' + (nomi[t.utente_id] || '') + ' è acceso da ') + Math.floor(ore) + ' ore',
          dettaglio: [t.commessa_id, quando, t.utente_id === io ? 'fermalo e correggi le ore' : ''].filter(Boolean).join(' · '),
          quanto: Math.floor(ore), unita: 'ore', collegamento: { pagina: 'rapportini', filtro: { segmento: 'ore' } },
        });
      }
    }

    // I rimborsi da fare: per chi li segna, e solo con "costi".
    if (!mie && costi && vedeSpese && this.puoSegnareRimborsi()) {
      const r = this.rimborsi({});
      fuori.rimborsi = { daFare: r.totale, persone: r.persone.filter(p => p.totale > 0).length };
      const dovuti = r.persone.filter(p => p.totale > 0);
      if (dovuti.length) {
        voce(settimana, { tipo: 'rimborsi', gravita: 'soldi', titolo: 'Rimborsi da fare',
          dettaglio: dovuti.slice(0, 3).map(p => p.nome + ' ' + virgola(p.totale.toFixed(2)) + ' €').join(', '),
          quanto: r.totale, unita: 'euro', collegamento: { pagina: 'spese', filtro: { segmento: 'rimborsi' } } });
      }
    }

    // L'anno nuovo: le tabelle ACI dei veicoli da aggiornare.
    if (!mie && this.livello('amministrazione') >= 2) {
      const anno = Number(adesso.slice(0, 4));
      const aci = Number(this.leggiImpostazioni().ACI_ANNO) || 0;
      const vecchi = this.db.righe('SELECT anno_aci FROM veicoli WHERE attivo = 1').map(v => Number(v.anno_aci) || 0);
      const piuVecchio = Math.min(aci || anno, ...vecchi.length ? vecchi : [anno]);
      if (piuVecchio < anno) {
        voce(settimana, { tipo: 'veicoli', gravita: 'attenzione', titolo: 'Aggiorna il rimborso km con le tabelle ACI ' + anno,
          dettaglio: 'I rimborsi km sono ancora quelli delle tabelle ' + piuVecchio + ': le trasferte già scritte restano come sono',
          collegamento: { pagina: 'amministrazione', filtro: { sezione: 'veicoli' } } });
      }
    }
    return fuori;
  },

  /**
   * Le voci della fase 2: attivita' scadute (urgenti), appuntamenti e attivita'
   * di oggi e dei prossimi giorni, preventivi in scadenza, senza risposta,
   * accettati senza commessa, bozze e attivita' non assegnate. Il collaboratore
   * vede le sue attivita' e niente preventivi.
   */
  dashboardFase2({ mie, costi, io, adesso, voce, urgenti, settimana, pianificare }) {
    const fuori = {};
    if (this.livello('attivita') > 0) {
      let aperte = this.righeAttivita({});
      if (mie) aperte = aperte.filter(a => a.assegnata_a === io);
      const nomi = {};
      this.db.righe('SELECT id, nome FROM utenti').forEach(u => { nomi[u.id] = u.nome; });
      const tra7 = piuGiorni(adesso, 7);
      const g = a => giornoAttivita(a);
      const perOra = (x, y) => (g(x) < g(y) ? -1 : g(x) > g(y) ? 1 : (x.inizio || '~') < (y.inizio || '~') ? -1 : 1);
      const scadute = aperte.filter(a => g(a) && g(a) < adesso).sort(perOra);
      const diOggi = aperte.filter(a => g(a) === adesso).sort(perOra);
      const prossime = aperte.filter(a => g(a) > adesso && g(a) <= tra7).sort(perOra);
      const nonAssegnate = aperte.filter(a => a.assegnata_a === null);
      // Fase 5: gli interventi dei ticket hanno la loro voce ("Intervento di oggi alle ...").
      const appuntamenti = diOggi.filter(a => a.tipo !== 'attivita' && a.tipo !== 'intervento' && a.inizio && !a.tutto_il_giorno);
      const breve = a => ({
        id: a.id, tipo: a.tipo, titolo: a.titolo, giorno: g(a), inizio: dataOraIso(a.inizio), fine: dataOraIso(a.fine),
        tuttoIlGiorno: a.tutto_il_giorno === 1, assegnataA: a.assegnata_a, assegnata: a.assegnata_a ? nomi[a.assegnata_a] || '' : '',
        idCommessa: a.commessa_id, luogo: a.luogo, priorita: a.priorita, stato: a.stato,
      });
      const ora = ist => { const o = dataOraIso(ist).slice(11, 16); return Number(o.slice(0, 2)) + ':' + o.slice(3); };
      if (scadute.length && scadute.length <= 3) {
        for (const a of scadute) {
          const giorni = Math.round((Date.parse(adesso + 'T12:00:00') - Date.parse(g(a) + 'T12:00:00')) / 86400000);
          voce(urgenti, { tipo: 'attivita', gravita: 'urgente', titolo: a.titolo + ' è scaduta',
            dettaglio: [a.commessa_id, giorni === 1 ? 'era per ieri' : 'era per il ' + dataBreve(g(a)), a.assegnata_a ? nomi[a.assegnata_a] : 'non assegnata'].filter(Boolean).join(' · '),
            quanto: giorni, unita: 'giorni', collegamento: { pagina: 'attivita', id: a.id } });
        }
      } else if (scadute.length) {
        voce(urgenti, { tipo: 'attivita', gravita: 'urgente', titolo: plurale(scadute.length, 'attività scaduta', 'attività scadute'),
          dettaglio: 'La più vecchia era per il ' + dataBreve(g(scadute[0])), quanto: scadute.length, unita: 'attivita',
          collegamento: { pagina: 'attivita', filtro: { gruppo: 'scadute' } } });
      }
      for (const a of appuntamenti) {
        voce(settimana, { tipo: a.tipo, gravita: 'attenzione', titolo: a.titolo + ' oggi alle ' + ora(a.inizio),
          dettaglio: [a.assegnata_a ? nomi[a.assegnata_a] : '', a.luogo].filter(Boolean).join(' · '),
          collegamento: { pagina: 'calendario', filtro: { giorno: adesso } } });
      }
      const altreOggi = diOggi.filter(a => appuntamenti.indexOf(a) < 0 && a.tipo !== 'intervento');
      if (altreOggi.length) {
        voce(settimana, { tipo: 'attivita', gravita: 'info', titolo: plurale(altreOggi.length, 'attività da fare oggi', 'attività da fare oggi'),
          dettaglio: altreOggi.slice(0, 3).map(a => a.titolo).join(', '), quanto: altreOggi.length, unita: 'attivita',
          collegamento: { pagina: 'attivita', filtro: { gruppo: 'oggi' } } });
      }
      if (prossime.length) {
        voce(settimana, { tipo: 'attivita', gravita: 'info', titolo: plurale(prossime.length, 'attività nei prossimi 7 giorni', 'attività nei prossimi 7 giorni'),
          dettaglio: prossime.slice(0, 3).map(a => a.titolo).join(', '), quanto: prossime.length, unita: 'attivita',
          collegamento: { pagina: 'calendario', filtro: { giorno: piuGiorni(adesso, 1) } } });
      }
      if (!mie && nonAssegnate.length) {
        voce(pianificare, { tipo: 'attivita', gravita: 'info', titolo: plurale(nonAssegnate.length, 'attività non assegnata', 'attività non assegnate'),
          dettaglio: nonAssegnate.slice(0, 3).map(a => a.titolo).join(', '), quanto: nonAssegnate.length, unita: 'attivita',
          collegamento: { pagina: 'attivita', filtro: { nonAssegnate: true } } });
      }
      fuori.attivita = { scadute: scadute.length, oggi: diOggi.length, settimana: prossime.length, nonAssegnate: nonAssegnate.length, appuntamentiOggi: appuntamenti.length };
      fuori.agenda = { oggi: diOggi.map(breve), settimana: prossime.map(breve) };
    }

    if (!mie && this.livello('preventivi') > 0) {
      const elenco = this.elencoPreventivi({});
      const giorniDa = iso => Math.round((Date.parse(adesso + 'T12:00:00') - Date.parse(iso + 'T12:00:00')) / 86400000);
      const quindiciFa = piuGiorni(adesso, -15);
      const stato = x => statoVistoPreventivo(x.riga);
      const bozze = elenco.filter(x => stato(x) === 'BOZZA');
      const inviati = elenco.filter(x => stato(x) === 'INVIATO');
      const scaduti = elenco.filter(x => stato(x) === 'SCADUTO');
      const senzaRisposta = elenco.filter(x => x.riga.stato === 'INVIATO' && x.riga.inviato_il && dataIso(x.riga.inviato_il) < quindiciFa);
      const inScadenza = inviati.filter(x => x.riga.scadenza && x.riga.scadenza <= piuGiorni(adesso, 7));
      const accettati = elenco.filter(x => x.riga.stato === 'ACCETTATO' && !x.riga.commessa_id);
      for (const x of senzaRisposta) {
        const giorni = giorniDa(dataIso(x.riga.inviato_il));
        voce(urgenti, { tipo: 'preventivo', gravita: 'attenzione', titolo: etichettaPreventivo(x.riga) + ': nessuna risposta da ' + giorni + ' giorni',
          dettaglio: [x.riga.oggetto, x.cliente, stato(x) === 'SCADUTO' ? 'scaduto il ' + dataBreve(x.riga.scadenza) : ''].filter(Boolean).join(' · '),
          quanto: giorni, unita: 'giorni', collegamento: { pagina: 'preventivo', id: x.riga.id } });
      }
      for (const x of inScadenza) {
        if (senzaRisposta.indexOf(x) >= 0) continue;
        const giorni = -giorniDa(x.riga.scadenza);
        voce(settimana, { tipo: 'preventivo', gravita: 'attenzione',
          titolo: etichettaPreventivo(x.riga) + (giorni === 0 ? ' scade oggi' : giorni === 1 ? ' scade domani' : ' scade fra ' + giorni + ' giorni'),
          dettaglio: [x.cliente, x.riga.inviato_il ? 'inviato il ' + dataBreve(dataIso(x.riga.inviato_il)) : ''].filter(Boolean).join(' · '),
          quanto: costi ? x.conti.totale : null, unita: costi ? 'euro' : null, collegamento: { pagina: 'preventivo', id: x.riga.id } });
      }
      for (const x of accettati) {
        voce(settimana, { tipo: 'preventivo', gravita: 'attenzione', titolo: etichettaPreventivo(x.riga) + ': accettato, manca la commessa',
          dettaglio: [x.riga.oggetto, x.cliente].filter(Boolean).join(' · '), collegamento: { pagina: 'preventivo', id: x.riga.id } });
      }
      if (bozze.length) {
        voce(pianificare, { tipo: 'preventivo', gravita: 'info', titolo: plurale(bozze.length, 'preventivo in bozza', 'preventivi in bozza'),
          dettaglio: bozze.slice(0, 3).map(x => etichettaPreventivo(x.riga) + ' ' + x.riga.oggetto).join(', '), quanto: bozze.length, unita: 'preventivi',
          collegamento: { pagina: 'preventivi', filtro: { stato: 'BOZZA' } } });
      }
      fuori.preventivi = {
        bozze: bozze.length, inviati: inviati.length, scaduti: scaduti.length, inScadenza: inScadenza.length,
        senzaRisposta: senzaRisposta.length, accettatiSenzaCommessa: accettati.length,
      };
      if (costi) fuori.preventiviInAttesa = centesimi(inviati.reduce((somma, x) => somma + x.conti.totale, 0));
    }
    return fuori;
  },
};
