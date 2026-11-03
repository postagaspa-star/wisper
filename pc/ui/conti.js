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

  /**
   * Le stesse regole di regoleDi() nello script: la tariffa fissa dalla scheda del
   * cliente (Elettrodinamica 30, gli altri liberi), il rimborso chilometrico dalla
   * commessa se ne ha uno. I gruppi solo per i clienti dei fogli vecchi.
   */
  function regoleDi(cliente, gruppi, impostazioni, commessa) {
    const c = cliente || {};
    const g = (gruppi || []).find(x => normalizza(x.nome) === normalizza(c.gruppo || ''));
    const scritto = v => v !== null && v !== undefined;
    return {
      gruppo: g ? g.nome : (c.gruppo || ''),
      tariffaFissa: scritto(c.tariffaFissa) ? c.tariffaFissa : (g && scritto(g.tariffaFissa) ? g.tariffaFissa : null),
      pagaViaggio: !!(scritto(c.pagaViaggio) ? c.pagaViaggio : (g ? g.pagaViaggio : false)),
      kmRimborsati: (scritto(c.kmRimborsati) ? c.kmRimborsati : (g ? g.kmRimborsati : true)) !== false,
      maggExtra: num(scritto(c.maggExtra) ? c.maggExtra : (g ? g.maggExtra : 0)),
      euroKm: commessa && scritto(commessa.euroKm) ? num(commessa.euroKm) : num((impostazioni || {}).EURO_KM),
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

  /**
   * La tariffa da proporre: il prezzo della commessa, se ne ha uno; altrimenti l'ultima
   * usata per il cliente (la ricorda il foglio), o quella del suo ultimo rapportino.
   */
  function tariffaProposta(cliente, rapportini, commessa) {
    if (commessa && commessa.prezzoOrario > 0) return commessa.prezzoOrario;
    if (cliente && cliente.ultimaTariffa > 0) return cliente.ultimaTariffa;
    if (!cliente) return null;
    const suoi = (rapportini || []).filter(r => r.idCliente === cliente.id && r.tariffa > 0)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
    return suoi.length ? suoi[0].tariffa : null;
  }

  /**
   * Come nello script: anno a due cifre + ST + numero, 26ST001. Il numero va di
   * fila e non riparte a gennaio (dopo 26ST046 viene 27ST047).
   */
  function prossimoCodiceCommessa(codici, anno) {
    let max = 0;
    (codici || []).forEach(c => {
      const m = String(c).trim().toUpperCase().match(/^\d{2}ST(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    const n = max + 1;
    return String(anno % 100).padStart(2, '0') + 'ST' + (n < 1000 ? String(n).padStart(3, '0') : String(n));
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

  const scritto = v => v !== null && v !== undefined && v !== '';

  /** Il prezzo di un'ora della commessa: la tariffa fissa del cliente (Elettrodinamica) o quello della commessa. */
  function prezzoOrarioDi(cliente, commessa) {
    if (cliente && scritto(cliente.tariffaFissa)) return num(cliente.tariffaFissa);
    return commessa && scritto(commessa.prezzoOrario) ? num(commessa.prezzoOrario) : null;
  }

  /** Quanto costa a te un'ora: il costo fisso del cliente, poi quello della commessa, poi le impostazioni. */
  function costoOrarioDi(cliente, commessa, impostazioni) {
    if (cliente && scritto(cliente.costoFisso)) return num(cliente.costoFisso);
    if (commessa && scritto(commessa.costoOrario)) return num(commessa.costoOrario);
    return numONull((impostazioni || {}).COSTO_ORARIO);
  }

  /**
   * Il budget di una commessa come lo scrive lo studio: ore previste x prezzo orario =
   * budget in euro; ore x costo orario = costo previsto; la differenza e' il margine
   * (prezzo - costo all'ora, 30 - 22 = 8 euro). Ne bastano due fra ore, prezzo e budget.
   */
  function budgetDi(commessa, cliente, impostazioni) {
    const prezzo = prezzoOrarioDi(cliente, commessa);
    const costo = costoOrarioDi(cliente, commessa, impostazioni);
    let ore = scritto(commessa.budgetOre) && num(commessa.budgetOre) > 0 ? num(commessa.budgetOre) : null;
    let euro = scritto(commessa.budgetEuro) && num(commessa.budgetEuro) > 0 ? num(commessa.budgetEuro) : null;
    if (euro === null && ore !== null && prezzo) euro = centesimi(ore * prezzo);
    if (ore === null && euro !== null && prezzo) ore = Math.round(euro / prezzo * 10) / 10;
    const margineOrario = prezzo !== null && costo !== null ? centesimi(prezzo - costo) : null;
    const costoPrevisto = ore !== null && costo !== null ? centesimi(ore * costo) : null;
    return {
      ore, prezzo, costo, euro, margineOrario, costoPrevisto,
      margine: euro !== null && costoPrevisto !== null ? centesimi(euro - costoPrevisto) : null,
    };
  }

  /**
   * Il cruscotto di una commessa, adattato da Pleya a chi lavora da solo e non
   * ha ancora la fatturazione nel programma:
   *  - valore atteso: il budget in euro, o quello che i rapportini hanno già
   *    maturato se è di più;
   *  - costo sostenuto: le tue ore di lavoro al tuo costo orario, l'auto al costo ACI,
   *    le spese. Le ore di viaggio no: il costo orario le comprende gia';
   *  - margine atteso: il valore atteso meno i costi attesi, cioè i soldi che restano.
   *    Il lavoro costa almeno quanto previsto dal budget (ore × costo orario) anche
   *    prima di farlo; se si è già speso di più, conta quello. Auto e spese come sono;
   *  - fatturazione: fatturato / pronto da fatturare (firmati e inviati) / in bozza.
   * Le ore di lavoro (con le extra) si confrontano col budget: dall'85% si avvisa,
   * dal 100% è sforato.
   */
  function cruscotto(commessa, rapportini, impostazioni, oggi, cliente) {
    const suoi = (rapportini || []).filter(r => r.idCommessa === commessa.id && r.stato !== 'ANNULLATO');
    const t = totali(suoi);
    const oreLavoro = Math.round(suoi.reduce((s, r) => s + num(r.oreLavoro) + num(r.oreExtra), 0) * 100) / 100;
    const costoOrarioDiOggi = costoOrarioDi(cliente, commessa, impostazioni);
    let costoLavoro = 0;
    let costoLavoroNoto = true;
    let costoAuto = 0;
    suoi.forEach(r => {
      const co = r.costoOrario !== null && r.costoOrario !== undefined && r.costoOrario !== '' ? num(r.costoOrario) : costoOrarioDiOggi;
      if (co === null) costoLavoroNoto = false;
      else costoLavoro += (num(r.oreLavoro) + num(r.oreExtra)) * co;
      costoAuto += num(r.km) * (num(r.euroKm) || num((impostazioni || {}).EURO_KM));
    });
    costoLavoro = centesimi(costoLavoro);
    costoAuto = centesimi(costoAuto);
    const costo = centesimi(costoLavoro + costoAuto + t.spese);
    const previsto = budgetDi(commessa, cliente, impostazioni);
    const budgetEuro = num(commessa.budgetEuro) || num(previsto.euro);
    const valoreAtteso = Math.max(budgetEuro, t.totale);
    const lavoroAtteso = previsto.costoPrevisto !== null && costoLavoroNoto ? Math.max(costoLavoro, previsto.costoPrevisto) : costoLavoro;
    const costoAtteso = centesimi(lavoroAtteso + costoAuto + t.spese);
    const margine = centesimi(valoreAtteso - costoAtteso);

    const budgetOre = previsto.ore || 0;
    const percOre = budgetOre > 0 ? oreLavoro / budgetOre : null;
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
      ore: oreLavoro,
      oreViaggio: centesimi(t.ore - oreLavoro),
      budgetOre: budgetOre || null,
      previsto: previsto,
      percOre: percOre,
      livelloOre: livelloOre,
      percTempo: percTempo,
      giorniMancanti: giorniMancanti,
      valoreMaturato: t.totale,
      valoreAtteso: valoreAtteso,
      costo: { lavoro: costoLavoro, lavoroNoto: costoLavoroNoto, auto: costoAuto, spese: t.spese, totale: costo },
      costoAtteso: costoAtteso,
      // Il margine tiene conto del costo previsto dal budget, non ancora speso.
      margineDaBudget: lavoroAtteso > costoLavoro,
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

  // ------------------------------------------------------------------ preventivi (fase 2)

  /*
   * I conti del preventivo (docs/gestionale/fase2.md §3). Il conto vero lo fa il
   * server; questi servono all'anteprima mentre si compila e al PDF, e devono dare
   * gli stessi numeri sugli stessi casi (server/prove/casi-preventivo.json).
   * Ogni pezzo si arrotonda al centesimo prima di sommarlo, come nei rapportini.
   */
  const primo = function () { for (let i = 0; i < arguments.length; i++) if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i]; return undefined; };

  /** Importo di una voce: quantità × prezzo × (1 − sconto della voce), al centesimo (come server/src/conti.js). */
  function importoVoce(v) {
    return centesimi(num(v.quantita) * num(v.prezzo) * (1 - num(primo(v.scontoPercentuale, v.sconto, 0)) / 100));
  }

  const vero = x => x === true || x === 1 || x === '1' || x === 'true';

  /** Il gruppo di alternative ("una di queste"): lo stesso testo, senza badare a maiuscole e spazi. */
  function gruppoAlternativa(v) {
    return String(primo(v.alternativa, v.alt, '') || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Quali voci contano, nello stesso ordine: le normali sempre, le facoltative se
   * scelte, di ogni gruppo di alternative solo la PRIMA scelta (nessuna scelta: niente).
   */
  function vociCheContano(voci) {
    const presi = {};
    return (voci || []).map(v => {
      const g = gruppoAlternativa(v);
      if (g) {
        if (!vero(v.scelta) || presi[g]) return false;
        presi[g] = true;
        return true;
      }
      if (vero(v.facoltativa)) return vero(v.scelta);
      return true;
    });
  }

  /** Una voce conta? Con l'elenco di tutte le voci si sa anche se è la prima scelta del suo gruppo. */
  function contaVoce(v, voci) {
    if (voci) { const i = voci.indexOf(v); if (i >= 0) return vociCheContano(voci)[i]; }
    if (gruppoAlternativa(v)) return vero(v.scelta);
    if (vero(v.facoltativa)) return vero(v.scelta);
    return true;
  }

  /**
   * Le voci con le scelte del cliente: scelte = { idVoce: true|false }. Scegliere
   * un'alternativa toglie le altre dello stesso gruppo.
   */
  function applicaScelte(voci, scelte) {
    const s = scelte || {};
    const out = (voci || []).map(v => Object.assign({}, v));
    out.forEach(v => {
      const k = String(v.id);
      if (!Object.prototype.hasOwnProperty.call(s, k)) return;
      v.scelta = !!s[k];
      const g = gruppoAlternativa(v);
      if (g && v.scelta) out.forEach(x => { if (x !== v && gruppoAlternativa(x) === g && !Object.prototype.hasOwnProperty.call(s, String(x.id))) x.scelta = false; });
    });
    return out;
  }

  /** Tutte le voci di un preventivo, nell'ordine delle sezioni, ognuna con l'id della sua sezione. */
  function vociDelPreventivo(p) {
    if (!p) return [];
    if (Array.isArray(p.voci) && p.voci.length) return p.voci;
    const out = [];
    (p.sezioni || []).forEach((s, i) => (s.voci || []).forEach(v => out.push(v.idSezione === undefined ? Object.assign({ idSezione: chiaveSezione(s, i) }, v) : v)));
    return out;
  }
  /** La chiave di una sezione: il suo id, o la posizione per una sezione senza id (i casi di prova). */
  const chiaveSezione = (s, i) => (s.id === undefined || s.id === null || s.id === '' ? '#' + i : s.id);

  /**
   * Il conto (docs/gestionale/architettura.md §13.4), con gli stessi nomi del server:
   * sommaVoci, scontoDaPercentuale, scontoEuro, imponibile, contributo (EPPI, entra nella
   * base IVA), baseIva, iva, totale, oreVoci, senzaPrezzo, restoScadenze; voci = [{importo,
   * conta}] nell'ordine delle voci; sezioni = i subtotali nell'ordine delle sezioni;
   * perSezione = { idSezione: subtotale } per le pagine.
   */
  function contiPreventivo(p, vociScelte) {
    const x = p || {};
    const tutte = vociScelte || vociDelPreventivo(x);
    const contano = vociCheContano(tutte);
    const ordineSezioni = [];
    const perSezione = {};
    let ore = 0;
    const voci = tutte.map((v, i) => {
      const importo = importoVoce(v);
      const k0 = primo(v.idSezione, v.sezioneId);
      const k = k0 === undefined ? '' : String(k0);
      if (!(k in perSezione)) { perSezione[k] = 0; ordineSezioni.push(k); }
      if (contano[i]) {
        perSezione[k] = centesimi(perSezione[k] + importo);
        if (v.modo === 'ore') ore += num(v.quantita);
      }
      return { importo, conta: contano[i] };
    });
    // Le sezioni senza voci hanno subtotale zero, al loro posto.
    (x.sezioni || []).forEach((s, i) => { const k = String(chiaveSezione(s, i)); if (!(k in perSezione)) { perSezione[k] = 0; ordineSezioni.push(k); } });
    const sezioni = (x.sezioni && x.sezioni.length ? x.sezioni.map((s, i) => String(chiaveSezione(s, i))) : ordineSezioni).map(k => perSezione[k] || 0);
    const sommaVoci = ordineSezioni.reduce((a, k) => centesimi(a + perSezione[k]), 0);
    const scontoDaPercentuale = centesimi(sommaVoci * num(primo(x.scontoPercentuale, 0)) / 100);
    const scontoEuro = centesimi(num(primo(x.scontoEuro, 0)));
    const imponibile = centesimi(sommaVoci - scontoDaPercentuale - scontoEuro);
    const contributo = centesimi(imponibile * num(primo(x.eppiPercentuale, x.eppi, 0)) / 100);
    const baseIva = centesimi(imponibile + contributo);
    const iva = centesimi(baseIva * num(primo(x.ivaPercentuale, x.iva, 0)) / 100);
    const scadenze = (x.scadenzePagamento || []).map(s => importoScadenza(s, imponibile));
    return {
      sommaVoci, scontoDaPercentuale, scontoEuro, sconto: centesimi(scontoDaPercentuale + scontoEuro), imponibile,
      eppiPercentuale: num(primo(x.eppiPercentuale, x.eppi, 0)), contributo, baseIva, ivaPercentuale: num(primo(x.ivaPercentuale, x.iva, 0)), iva,
      totale: centesimi(baseIva + iva), oreVoci: Math.round(ore * 100) / 100, senzaPrezzo: tutte.filter(v => !(num(v.prezzo) > 0)).length,
      restoScadenze: centesimi(imponibile - scadenze.reduce((a, b) => centesimi(a + b), 0)), voci, sezioni, perSezione, scadenze,
    };
  }

  /**
   * Gli importi delle scadenze di pagamento: in percentuale dell'imponibile, o un
   * importo fisso. Il saldo (una percentuale senza valore, o "il resto") non serve:
   * ognuna dice il suo.
   */
  function importoScadenza(s, imponibile) {
    if (s.tipo === 'importo') return centesimi(num(s.valore));
    return centesimi(num(imponibile) * num(s.valore) / 100);
  }

  const Conti = {
    num, numONull, centesimi, euro, numero, ore, data, dataOra, nomeMese, oggiIso, normalizza,
    regoleDi, calcola, tariffaProposta, prossimoCodiceCommessa, prezzoOrarioDi, costoOrarioDi, budgetDi,
    STATI, ETICHETTE_STATO, filtra, ordina, totali, cruscotto, settimane,
    importoVoce, vociCheContano, contaVoce, gruppoAlternativa, applicaScelte, vociDelPreventivo, contiPreventivo, importoScadenza,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Conti;
  else radice.WisperConti = Conti;
})(typeof window !== 'undefined' ? window : globalThis);
