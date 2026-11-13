/*
 * Wisper Ufficio: le regole dei Servizi e delle indennità (docs/gestionale/servizi.md §1-§2), senza schermate, per
 * provarle con node --test. Le stesse del server (server/src/servizi.js) e del telefono (rapportino/Servizi.kt).
 *
 *  - i servizi: le unità e le aliquote di Flextaxa, il filtro dell'elenco, l'ordine nella scelta delle indennità
 *    (prima quelle che si chiamano "Indennità..."), il controllo del modulo;
 *  - le indennità di un lavoro: da un servizio a un'indennità, il controllo, l'importo, la riga sotto il lavoro.
 */
(function (radice, fabbrica) {
  const R = fabbrica(radice);
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else radice.WisperRegoleServizi = R;
}(typeof self !== 'undefined' ? self : this, function (radice) {
  'use strict';

  const C = (radice && radice.WisperConti) || (typeof require !== 'undefined' ? require('./conti.js') : null);

  /** Le unità di misura di Flextaxa (l'ordine della tendina). */
  const UNITA = ['Nr', 'Ore', 'Pz', 'Km', 'Giorni', 'A corpo'];
  /** Le aliquote IVA della tendina (22% di base). */
  const ALIQUOTE = [22, 10, 5, 4, 0];
  const TIPI = [['servizio', 'Servizio'], ['prodotto', 'Prodotto']];

  const vuoto = v => v === undefined || v === null || String(v).trim() === '';
  const testo = v => (v === undefined || v === null ? '' : String(v)).trim();
  const norm = s => testo(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Come il server: "a corpo" = corpo, "ore" = ore, il resto a quantità. */
  function modoDaUnita(unita) {
    const u = norm(unita);
    if (!u || u === 'a corpo' || u === 'corpo') return 'corpo';
    if (u === 'ore' || u === 'ora' || u === 'h') return 'ore';
    return 'quantita';
  }

  /** L'unità da mostrare, anche per le voci di prima della 1.4.0 (modo ore e unità "h", corpo senza unità). */
  function unitaDi(s) {
    const u = testo(s && s.unita);
    if (u) {
      const giusta = UNITA.find(x => norm(x) === norm(u));
      if (giusta) return giusta;
      if (norm(u) === 'h') return 'Ore';
      return u;
    }
    if (s && s.modo === 'ore') return 'Ore';
    if (s && s.modo === 'corpo') return 'A corpo';
    return '';
  }

  /**
   * Un servizio col nome che comincia con "Indennità" (anche senza accento). Dal 13/11/2026 (Andrea: "non ci deve essere
   * la distinzione tra servizi ed indennità") non decide più niente negli elenchi: resta solo per chi lo chiede.
   */
  const eIndennita = s => /^indennit/.test(norm(s && s.nome));

  /** I tag scritti come "a, b c" o come elenco -> ['a', 'b c']. */
  function tagDa(v) {
    const l = Array.isArray(v) ? v : String(v || '').split(',');
    const visti = [];
    l.map(testo).filter(Boolean).forEach(t => { if (visti.indexOf(t) < 0) visti.push(t); });
    return visti;
  }

  /**
   * Il filtro dell'elenco: { segmento: 'tutti' | 'servizi' | 'prodotti', testo }. Il testo cerca in
   * codice, descrizione, tag, fornitore e note. Le indennità sono servizi come gli altri (13/11/2026).
   */
  function filtraServizi(lista, filtro) {
    const f = filtro || {};
    const t = norm(f.testo);
    return (lista || []).filter(s => {
      if (f.segmento === 'servizi' && s.tipo === 'prodotto') return false;
      if (f.segmento === 'prodotti' && s.tipo !== 'prodotto') return false;
      if (!t) return true;
      return norm([s.codice, s.nome, s.descrizione, tagDa(s.tag).join(' '), s.fornitore, s.note].join(' ')).indexOf(t) >= 0;
    });
  }

  /** Quanti per segmento (per i numeri accanto ai segmenti). */
  function contaServizi(lista) {
    const n = { tutti: 0, servizi: 0, prodotti: 0 };
    (lista || []).forEach(s => {
      n.tutti += 1;
      if (s.tipo === 'prodotto') n.prodotti += 1;
      else n.servizi += 1;
    });
    return n;
  }

  /** L'ordine dell'elenco: per codice (come Flextaxa), quelli senza codice in fondo per descrizione. */
  function ordinaServizi(lista) {
    return (lista || []).slice().sort((a, b) => {
      const ca = testo(a.codice);
      const cb = testo(b.codice);
      if (ca && !cb) return -1;
      if (!ca && cb) return 1;
      return ca.localeCompare(cb, 'it', { numeric: true }) || testo(a.nome).localeCompare(testo(b.nome), 'it');
    });
  }

  /** Nella scelta di un servizio (per un'indennità del rapportino, per una riga della fattura): gli attivi, nell'ordine dell'elenco. */
  function perIndennita(lista) {
    return ordinaServizi((lista || []).filter(s => s.attivo !== false));
  }

  /** Un numero scritto (anche con la virgola): numero, null se vuoto, NaN se non è un numero. */
  function numeroScritto(v) {
    if (vuoto(v)) return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim().replace(/\s/g, '').replace(/€/g, '');
    const n = Number(s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s);
    return isNaN(n) ? NaN : n;
  }

  /**
   * Il controllo del modulo di un servizio (servizi.md §1): { campo: errore } ({} = va bene). Con soldi il prezzo è
   * obbligatorio (anche 0), come in Flextaxa; senza soldi i prezzi non si vedono e non si controllano.
   */
  function erroreServizio(x, soldi) {
    const e = {};
    if (!testo(x.nome)) e.nome = 'Scrivi la descrizione';
    if (!testo(x.unita)) e.unita = 'Scegli l\'unità di misura';
    if (soldi) {
      const p = numeroScritto(x.prezzo);
      if (p === null) e.prezzo = 'Scrivi il prezzo, anche 0';
      else if (isNaN(p)) e.prezzo = 'Non è un numero';
      else if (p < 0) e.prezzo = 'Non può essere negativo';
      const a = numeroScritto(x.prezzoAcquisto);
      if (a !== null && isNaN(a)) e.prezzoAcquisto = 'Non è un numero';
      else if (a !== null && a < 0) e.prezzoAcquisto = 'Non può essere negativo';
    }
    return e;
  }

  /** Il servizio da mandare a salvaVoceListino (i prezzi solo con soldi). */
  function servizioPerSalvare(x, soldi) {
    const v = {
      nome: testo(x.nome), codice: testo(x.codice), descrizione: testo(x.descrizione), unita: testo(x.unita), modo: modoDaUnita(x.unita),
      tipo: x.tipo === 'prodotto' ? 'prodotto' : 'servizio', aliquotaIva: Number(x.aliquotaIva === undefined || x.aliquotaIva === '' ? 22 : x.aliquotaIva),
      aliquotaAcquisto: Number(x.aliquotaAcquisto === undefined || x.aliquotaAcquisto === '' ? 22 : x.aliquotaAcquisto),
      fornitore: testo(x.fornitore), tag: tagDa(x.tag), note: testo(x.note), immagine: x.immagine && x.immagine.id ? x.immagine.id : testo(x.immagine),
    };
    if (x.id !== undefined && x.id !== null && x.id !== '') v.id = x.id;
    if (soldi) {
      v.prezzo = numeroScritto(x.prezzo);
      v.prezzoAcquisto = numeroScritto(x.prezzoAcquisto);
    }
    return v;
  }

  // ------------------------------------------------------------------ le indennità di un lavoro

  /** Un'indennità nuova da un servizio (quantità 1), coi campi del servizio. */
  function indennitaDaServizio(s) {
    return {
      idServizio: s.id, codice: testo(s.codice), descrizione: testo(s.nome), quantita: 1, unita: unitaDi(s),
      prezzo: s.prezzo === undefined ? null : s.prezzo, aliquotaIva: s.aliquotaIva === undefined ? 22 : s.aliquotaIva,
      tipo: s.tipo === 'prodotto' ? 'prodotto' : 'servizio', prezzoAcquisto: s.prezzoAcquisto === undefined ? null : s.prezzoAcquisto,
      aliquotaAcquisto: s.aliquotaAcquisto === undefined ? 22 : s.aliquotaAcquisto, fornitore: testo(s.fornitore), tag: tagDa(s.tag),
      note: testo(s.note), immagine: s.immagine || null,
    };
  }

  /** Un'indennità scritta a mano (senza servizio). */
  function indennitaVuota() {
    return { idServizio: null, codice: '', descrizione: '', quantita: 1, unita: 'Nr', prezzo: null, aliquotaIva: 22, tipo: 'servizio',
      prezzoAcquisto: null, aliquotaAcquisto: 22, fornitore: '', tag: [], note: '', immagine: null };
  }

  /** Il controllo della finestra dell'indennità: come quello del servizio, più la quantità. */
  function erroreIndennita(x, soldi) {
    const e = erroreServizio({ nome: x.descrizione, unita: x.unita, prezzo: x.prezzo, prezzoAcquisto: x.prezzoAcquisto }, soldi);
    if (e.nome) e.descrizione = e.nome;
    delete e.nome;
    const q = numeroScritto(x.quantita);
    if (q === null) e.quantita = 'Scrivi la quantità';
    else if (isNaN(q)) e.quantita = 'Non è un numero';
    else if (q < 0) e.quantita = 'Non può essere negativa';
    return e;
  }

  /** L'indennità pulita da mettere nel lavoro (numeri veri; senza soldi il prezzo resta quello di prima, lo decide il server). */
  function indennitaPerSalvare(x, soldi) {
    const v = {
      idServizio: x.idServizio === undefined || x.idServizio === '' ? null : x.idServizio, codice: testo(x.codice), descrizione: testo(x.descrizione),
      quantita: numeroScritto(x.quantita) === null ? 1 : numeroScritto(x.quantita), unita: testo(x.unita),
      aliquotaIva: Number(x.aliquotaIva === undefined || x.aliquotaIva === '' ? 22 : x.aliquotaIva), tipo: x.tipo === 'prodotto' ? 'prodotto' : 'servizio',
      aliquotaAcquisto: Number(x.aliquotaAcquisto === undefined || x.aliquotaAcquisto === '' ? 22 : x.aliquotaAcquisto),
      fornitore: testo(x.fornitore), tag: tagDa(x.tag), note: testo(x.note), immagine: x.immagine && x.immagine.id ? x.immagine : (testo(x.immagine) ? { id: testo(x.immagine) } : null),
    };
    if (soldi) {
      v.prezzo = numeroScritto(x.prezzo);
      v.prezzoAcquisto = numeroScritto(x.prezzoAcquisto);
    } else {
      v.prezzo = x.prezzo === undefined ? null : x.prezzo;
      v.prezzoAcquisto = x.prezzoAcquisto === undefined ? null : x.prezzoAcquisto;
    }
    v.importo = C ? C.importoUnaIndennita(v) : Math.round(v.quantita * (Number(v.prezzo) || 0) * 100) / 100;
    return v;
  }

  /** La riga nel lavoro: "IND-TR Indennità di trasferta · 2 Giorni" (con soldi anche "· 60,00 €"). */
  function rigaIndennita(x, soldi) {
    const q = numeroScritto(x.quantita) === null ? 1 : numeroScritto(x.quantita);
    const quanto = C ? C.numero(q) : String(q);
    return [[x.codice, x.descrizione].filter(Boolean).join(' '), quanto + (x.unita ? ' ' + x.unita : ''),
      soldi && C ? C.euro(C.importoUnaIndennita(x)) : ''].filter(Boolean).join(' · ');
  }

  return {
    UNITA, ALIQUOTE, TIPI, modoDaUnita, unitaDi, eIndennita, tagDa, filtraServizi, contaServizi, ordinaServizi, perIndennita, numeroScritto,
    erroreServizio, servizioPerSalvare, indennitaDaServizio, indennitaVuota, erroreIndennita, indennitaPerSalvare, rigaIndennita,
  };
}));
