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
 *    cliente, commesse, commessa, rapportini, fatturazione, amministrazione
 */
'use strict';

const { testo, numero, centesimi, oggi, piuGiorni } = require('../utili');
const { budgetDi } = require('../conti');

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
    const firmati = rapportini.filter(r => testo(r.stato).toUpperCase() === 'FIRMATO');
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
    return risposta;
  },
};
