/*
 * Wisper Ufficio: i conti e i filtri, senza niente di grafico.
 *
 * Stanno qui da soli perché si provano con Node (prove/conti.test.js) e perché
 * la formula del rapportino è la stessa dello script e dell'app: calcola() deve
 * dare gli stessi numeri sugli stessi casi (apps-script/prove/casi-calcolo.json).
 * Il conto vero resta quello del foglio; questo serve all'anteprima del modulo
 * e ai riepiloghi delle commesse.
 */
(function (radice) {
  'use strict';

  const IT = 'it-IT';

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    let s = String(v).trim().replace(/\s/g, '');
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** "6,5" -> 6.5; "" -> null; "sei" -> null */
  function numONull(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const s = String(v).trim();
    if (!/^[0-9.,\s]+$/.test(s)) return null;
    return num(s);
  }

  function centesimi(n) {
    return Math.round(n * 100) / 100;
  }

  // useGrouping 'always': in italiano Intl non mette il punto sotto le 10.000
  // ("1234,50"), ma in una fattura si scrive 1.234,50.
  const fmtEuro = new Intl.NumberFormat(IT, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  const fmtNum = new Intl.NumberFormat(IT, { maximumFractionDigits: 2, useGrouping: 'always' });

  function euro(n) { return fmtEuro.format(num(n)) + ' €'; }
  function numero(n) { return fmtNum.format(num(n)); }
  function ore(n) { return fmtNum.format(num(n)) + ' h'; }

  /** "2026-07-05" -> "05/07/2026" */
  function data(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /** "2026-10-15T17:30:00" -> "15/10/2026 17:30" */
  function dataOra(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : data(iso);
  }

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
    'settembre', 'ottobre', 'novembre', 'dicembre'];

  /** "2026-07" -> "Luglio 2026" */
  function nomeMese(m) {
    const x = String(m || '').match(/^(\d{4})-(\d{2})/);
    if (!x) return '';
    const n = MESI[parseInt(x[2], 10) - 1];
    return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + x[1];
  }

  function oggiIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function normalizza(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // ------------------------------------------------------------------ regole e calcolo

  /** Le stesse regole di regoleDi() nello script. */
  function regoleDi(cliente, gruppi, impostazioni) {
    const nomeGruppo = cliente && cliente.gruppo ? cliente.gruppo : '';
    const g = (gruppi || []).find(x => normalizza(x.nome) === normalizza(nomeGruppo));
    let pagaViaggio = g ? g.pagaViaggio : false;
    let kmRimborsati = g ? g.kmRimborsati : true;
    if (cliente && cliente.pagaViaggio !== null && cliente.pagaViaggio !== undefined) pagaViaggio = cliente.pagaViaggio;
    if (cliente && cliente.kmRimborsati !== null && cliente.kmRimborsati !== undefined) kmRimborsati = cliente.kmRimborsati;
    return {
      gruppo: g ? g.nome : nomeGruppo,
      tariffaFissa: g && g.tariffaFissa !== null && g.tariffaFissa !== undefined ? g.tariffaFissa : null,
      pagaViaggio: !!pagaViaggio,
      kmRimborsati: kmRimborsati !== false,
      maggExtra: g ? num(g.maggExtra) : 0,
      euroKm: num((impostazioni || {}).EURO_KM),
    };
  }

  /** La stessa formula di calcola() nello script e di Calcolo.kt nell'app. */
  function calcola(r, regole) {
    const lavoro = num(r.oreLavoro);
    const extra = num(r.oreExtra);
    const viaggio = num(r.oreViaggio);
    const tariffa = regole.tariffaFissa !== null && regole.tariffaFissa !== undefined ? regole.tariffaFissa : num(r.tariffa);
    const compenso = centesimi(
      (lavoro + (regole.pagaViaggio ? viaggio : 0)) * tariffa +
      extra * tariffa * (1 + num(regole.maggExtra) / 100)
    );
    const rimborso = regole.kmRimborsati ? centesimi(num(r.km) * num(regole.euroKm)) : 0;
    const spese = centesimi(num(r.spese));
    return {
      oreTotali: Math.round((lavoro + extra + viaggio) * 100) / 100,
      tariffa: tariffa,
      compensoOre: compenso,
      rimborsoKm: rimborso,
      totale: centesimi(compenso + rimborso + spese),
    };
  }

  /** La tariffa da proporre: l'ultima usata per il cliente (la ricorda il foglio), o quella del suo ultimo rapportino. */
  function tariffaProposta(cliente, rapportini) {
    if (cliente && cliente.ultimaTariffa > 0) return cliente.ultimaTariffa;
    if (!cliente) return null;
    const suoi = (rapportini || []).filter(r => r.idCliente === cliente.id && r.tariffa > 0)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
    return suoi.length ? suoi[0].tariffa : null;
  }

  /** Come nello script: prefisso + anno a due cifre + numero, P2601. */
  function prossimoCodiceCommessa(codici, prefisso, anno) {
    const p = String(prefisso || 'P').toUpperCase();
    const aa = String(anno % 100).padStart(2, '0');
    const re = new RegExp('^' + p + aa + '(\\d{2,})$');
    let max = 0;
    (codici || []).forEach(c => {
      const m = String(c).trim().toUpperCase().match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    const n = max + 1;
    return p + aa + (n < 100 ? String(n).padStart(2, '0') : String(n));
  }

  // ------------------------------------------------------------------ filtri e totali

  const STATI = ['BOZZA', 'FIRMATO', 'INVIATO', 'FATTURATO'];
  const ETICHETTE_STATO = { BOZZA: 'Bozza', FIRMATO: 'Firmato', INVIATO: 'Inviato', FATTURATO: 'Fatturato', ANNULLATO: 'Annullato' };

  /**
   * I rapportini che passano i filtri.
   *  - mese "2026-07" (vuoto = tutti i mesi)
   *  - stato: "" tutti, "dafatturare" = firmati o inviati non ancora fatturati, oppure uno stato preciso
   *  - cliente / gruppo / commessa: codici
   *  - testo: cerca in numero, cliente, commessa, descrizione, luogo
   */
  function filtra(rapportini, f) {
    const testo = normalizza(f.testo);
    return (rapportini || []).filter(r => {
      if (r.stato === 'ANNULLATO') return false;
      if (f.mese && String(r.data).slice(0, 7) !== f.mese) return false;
      if (f.anno && String(r.data).slice(0, 4) !== String(f.anno)) return false;
      if (f.cliente && r.idCliente !== f.cliente) return false;
      if (f.gruppo && normalizza(r.gruppo) !== normalizza(f.gruppo)) return false;
      if (f.commessa && r.idCommessa !== f.commessa) return false;
      if (f.stato === 'dafatturare') {
        if (r.stato !== 'FIRMATO' && r.stato !== 'INVIATO') return false;
      } else if (f.stato && r.stato !== f.stato) return false;
      if (testo) {
        const dove = normalizza([r.id, r.cliente, r.commessa, r.idCommessa, r.descrizione, r.luogo, r.ticket].join(' '));
        if (dove.indexOf(testo) < 0) return false;
      }
      return true;
    });
  }

  function ordina(lista, campo, verso) {
    const v = verso || -1;
    return lista.slice().sort((a, b) => {
      let x = a[campo];
      let y = b[campo];
      if (typeof x === 'string') { x = x.toLowerCase(); y = String(y || '').toLowerCase(); }
      if (x < y) return -1 * v;
      if (x > y) return 1 * v;
      // A parità, il più recente prima e poi per numero: l'ordine resta stabile.
      return (a.data < b.data ? 1 : a.data > b.data ? -1 : (a.id < b.id ? 1 : -1));
    });
  }

  function totali(lista) {
    const t = { n: 0, oreLavoro: 0, oreExtra: 0, oreViaggio: 0, ore: 0, km: 0, spese: 0, compenso: 0, rimborso: 0, totale: 0 };
    (lista || []).forEach(r => {
      t.n += 1;
      t.oreLavoro += num(r.oreLavoro);
      t.oreExtra += num(r.oreExtra);
      t.oreViaggio += num(r.oreViaggio);
      t.ore += num(r.oreTotali);
      t.km += num(r.km);
      t.spese += num(r.spese);
      t.compenso += num(r.compensoOre);
      t.rimborso += num(r.rimborsoKm);
      t.totale += num(r.totale);
    });
    Object.keys(t).forEach(k => { if (k !== 'n') t[k] = centesimi(t[k]); });
    return t;
  }

  // ------------------------------------------------------------------ commesse

  /**
   * Il cruscotto di una commessa, adattato da Pleya a chi lavora da solo e non
   * ha ancora la fatturazione nel programma:
   *  - valore atteso: il budget in euro, o quello che i rapportini hanno già
   *    maturato se è di più;
   *  - costo sostenuto: le tue ore al tuo costo orario, l'auto al costo ACI, le spese;
   *  - margine: la differenza;
   *  - fatturazione: fatturato / pronto da fatturare (firmati e inviati) / in bozza.
   * Le ore si confrontano col budget: dall'85% si avvisa, dal 100% è sforato.
   */
  function cruscotto(commessa, rapportini, impostazioni, oggi) {
    const suoi = (rapportini || []).filter(r => r.idCommessa === commessa.id && r.stato !== 'ANNULLATO');
    const t = totali(suoi);
    const costoOrarioDiOggi = numONull((impostazioni || {}).COSTO_ORARIO);
    let costoLavoro = 0;
    let costoLavoroNoto = true;
    let costoAuto = 0;
    suoi.forEach(r => {
      const co = r.costoOrario !== null && r.costoOrario !== undefined && r.costoOrario !== '' ? num(r.costoOrario) : costoOrarioDiOggi;
      if (co === null) costoLavoroNoto = false;
      else costoLavoro += num(r.oreTotali) * co;
      costoAuto += num(r.km) * (num(r.euroKm) || num((impostazioni || {}).EURO_KM));
    });
    costoLavoro = centesimi(costoLavoro);
    costoAuto = centesimi(costoAuto);
    const costo = centesimi(costoLavoro + costoAuto + t.spese);
    const budgetEuro = num(commessa.budgetEuro);
    const valoreAtteso = Math.max(budgetEuro, t.totale);
    const margine = centesimi(valoreAtteso - costo);

    const budgetOre = num(commessa.budgetOre);
    const percOre = budgetOre > 0 ? t.ore / budgetOre : null;
    const livelloOre = percOre === null ? 'nessuno' : percOre >= 1 ? 'sforato' : percOre >= 0.85 ? 'attenzione' : 'ok';

    let percTempo = null;
    let giorniMancanti = null;
    const adesso = oggi || oggiIso();
    if (commessa.inizio && commessa.finePrevista && commessa.finePrevista > commessa.inizio) {
      const a = Date.parse(commessa.inizio);
      const b = Date.parse(commessa.finePrevista);
      const c = Date.parse(adesso);
      percTempo = Math.min(1, Math.max(0, (c - a) / (b - a)));
      giorniMancanti = Math.round((b - c) / 86400000);
    }

    const somma = stati => centesimi(suoi.filter(r => stati.indexOf(r.stato) >= 0).reduce((s, r) => s + num(r.totale), 0));

    return {
      rapportini: suoi,
      totali: t,
      ore: t.ore,
      budgetOre: budgetOre || null,
      percOre: percOre,
      livelloOre: livelloOre,
      percTempo: percTempo,
      giorniMancanti: giorniMancanti,
      valoreMaturato: t.totale,
      valoreAtteso: valoreAtteso,
      costo: { lavoro: costoLavoro, lavoroNoto: costoLavoroNoto, auto: costoAuto, spese: t.spese, totale: costo },
      margine: margine,
      percMargine: valoreAtteso > 0 ? margine / valoreAtteso : null,
      fatturato: somma(['FATTURATO']),
      prontoDaFatturare: somma(['FIRMATO', 'INVIATO']),
      inBozza: somma(['BOZZA']),
      settimane: settimane(suoi, 12, adesso),
    };
  }

  /** Le ore delle ultime n settimane (da lunedì), la più vecchia prima. */
  function settimane(rapportini, n, oggi) {
    const fine = new Date((oggi || oggiIso()) + 'T12:00:00');
    const lunedi = new Date(fine);
    lunedi.setDate(fine.getDate() - ((fine.getDay() + 6) % 7));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const inizio = new Date(lunedi);
      inizio.setDate(lunedi.getDate() - 7 * i);
      const finis = new Date(inizio);
      finis.setDate(inizio.getDate() + 6);
      const da = iso(inizio);
      const a = iso(finis);
      const oreSett = (rapportini || []).filter(r => r.data >= da && r.data <= a).reduce((s, r) => s + num(r.oreTotali), 0);
      out.push({ inizio: da, ore: Math.round(oreSett * 100) / 100 });
    }
    return out;
  }

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const Conti = {
    num, numONull, centesimi, euro, numero, ore, data, dataOra, nomeMese, oggiIso, normalizza,
    regoleDi, calcola, tariffaProposta, prossimoCodiceCommessa,
    STATI, ETICHETTE_STATO, filtra, ordina, totali, cruscotto, settimane,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Conti;
  else radice.WisperConti = Conti;
})(typeof window !== 'undefined' ? window : globalThis);
