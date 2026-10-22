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
    const daFatturare = rapportini.filter(r => ['FIRMATO', 'INVIATO'].indexOf(testo(r.stato).toUpperCase()) >= 0);
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
    if (costi) {
      const somma = lista => centesimi(lista.reduce((s, r) => s + numero(r.totale), 0));
      const deiMesiPrima = daFatturare.filter(r => r.data && r.data.slice(0, 7) < mese);
      const diQuestoMese = daFatturare.filter(r => r.data && r.data.slice(0, 7) === mese);
      if (deiMesiPrima.length) {
        const mesePiuVecchio = deiMesiPrima.map(r => r.data.slice(0, 7)).sort()[0];
        voce(urgenti, { tipo: 'fatturazione', gravita: 'soldi', titolo: 'Da fatturare dei mesi scorsi',
          dettaglio: plurale(deiMesiPrima.length, 'rapportino firmato o mandato', 'rapportini firmati o mandati') + ', dal ' + mesePiuVecchio.slice(5, 7) + '/' + mesePiuVecchio.slice(0, 4),
          quanto: somma(deiMesiPrima), unita: 'euro', collegamento: { pagina: 'fatturazione', filtro: { mese: mesePiuVecchio } } });
      }
      if (diQuestoMese.length) {
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
    return risposta;
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
      const appuntamenti = diOggi.filter(a => a.tipo !== 'attivita' && a.inizio && !a.tutto_il_giorno);
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
      const altreOggi = diOggi.filter(a => appuntamenti.indexOf(a) < 0);
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
