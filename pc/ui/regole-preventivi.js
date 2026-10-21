/*
 * Wisper Ufficio: le regole dei preventivi (fase 2), senza niente di grafico.
 *
 * Stati e parole, il preventivo scaduto (un inviato con la scadenza passata), i
 * segmenti dell'elenco, il pulsante giallo secondo lo stato, le voci del menu ⋯,
 * cosa chiede la legge e manca, le voci prese dal listino, lo spostamento delle
 * voci fra le sezioni, l'anteprima della commessa che nascerà. Il conto è in
 * conti.js (contiPreventivo), perché serve anche al PDF del telefono.
 * Si provano con Node (prove/preventivi.test.js). La garanzia resta il server:
 * qui si decide solo cosa mostrare.
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);

  // ------------------------------------------------------------------ stati

  /** Le parole e i colori degli stati (fase2.md §5): Bozza grigia, Inviato blu, Accettato verde, Scaduto ambra, Rifiutato rosso tenue. */
  const STATI = {
    BOZZA: { parola: 'Bozza', colore: 'grigio' },
    INVIATO: { parola: 'Inviato', colore: 'blu' },
    ACCETTATO: { parola: 'Accettato', colore: 'verde' },
    SCADUTO: { parola: 'Scaduto', colore: 'giallo' },
    RIFIUTATO: { parola: 'Rifiutato', colore: 'rosso' },
    SOSTITUITO: { parola: 'Sostituito', colore: 'grigio' },
  };

  const COMPLESSITA = [['bassa', 'Bassa'], ['media', 'Media'], ['alta', 'Alta']];
  const MODI = [['corpo', 'A corpo'], ['ore', 'A ore'], ['quantita', 'A quantità']];
  const MODI_ACCETTAZIONE = [
    ['firma', 'Firma qui sul computer'], ['email', 'Ha risposto per email'], ['documento', 'Ho il documento firmato'], ['voce', 'A voce'],
  ];
  const QUANDO = [['firma', 'Alla firma'], ['avanzamento', 'Ad avanzamento'], ['fine', 'A fine lavori'], ['data', 'A una data']];

  const due = n => String(n).padStart(2, '0');
  function oggiIso() { const d = new Date(); return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()); }

  /** "2026-10-14" + 30 giorni -> "2026-11-13". */
  function piuGiorni(iso, giorni) {
    const d = new Date(String(iso || oggiIso()).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + (Number(giorni) || 0));
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }

  function giorniFra(a, b) {
    return Math.round((new Date(String(b).slice(0, 10) + 'T12:00:00') - new Date(String(a).slice(0, 10) + 'T12:00:00')) / 86400000);
  }

  /**
   * Lo stato che si vede: SCADUTO non è salvato, è un INVIATO con la scadenza passata.
   * Se il server lo dice già (statoVisto, statoCalcolato o scaduto), vale il suo.
   */
  function statoVisto(p, oggi) {
    if (!p) return 'BOZZA';
    const dalServer = p.statoVisto || p.statoCalcolato;
    if (dalServer) return String(dalServer).toUpperCase();
    const st = String(p.stato || 'BOZZA').toUpperCase();
    if (st === 'INVIATO' && (p.scaduto === true || (p.scadenza && String(p.scadenza).slice(0, 10) < (oggi || oggiIso())))) return 'SCADUTO';
    return st;
  }

  /** "PR/2026/012 · rev. 1" */
  function numeroConRevisione(p) {
    if (p.modello) return 'Modello';
    return (p.numero || 'Nuovo') + (Number(p.revisione) > 0 ? ' · rev. ' + p.revisione : '');
  }

  /** La riga della scadenza nell'elenco: "scade fra 6 giorni", "scaduto il 05/10", "scade oggi". */
  function scadenzaAParole(p, oggi) {
    const st = statoVisto(p, oggi);
    if (!p.scadenza || (st !== 'INVIATO' && st !== 'SCADUTO' && st !== 'BOZZA')) return '';
    const n = giorniFra(oggi || oggiIso(), p.scadenza);
    if (n < 0) return 'scaduto il ' + C.data(p.scadenza).slice(0, 5);
    if (n === 0) return 'scade oggi';
    if (n === 1) return 'scade domani';
    return st === 'BOZZA' ? 'valido ' + n + ' giorni' : 'scade fra ' + n + ' giorni';
  }

  // ------------------------------------------------------------------ elenco

  const SEGMENTI = [['bozze', 'Bozze'], ['inviati', 'Inviati'], ['accettati', 'Accettati'], ['scaduti', 'Scaduti'], ['tutti', 'Tutti']];
  const PER_SEGMENTO = { bozze: ['BOZZA'], inviati: ['INVIATO'], accettati: ['ACCETTATO'], scaduti: ['SCADUTO'] };

  function norm(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');
  }

  /**
   * L'elenco di un segmento, cercato: i modelli e le revisioni sostituite non ci
   * sono mai (le revisioni si vedono dalla pagina del preventivo). I più nuovi prima.
   */
  function filtraPreventivi(lista, f, nomeCliente, oggi) {
    const testo = norm(f && f.testo);
    const seg = (f && f.segmento) || 'tutti';
    return (lista || []).filter(p => {
      if (p.modello) return false;
      const st = statoVisto(p, oggi);
      if (st === 'SOSTITUITO') return false;
      if (PER_SEGMENTO[seg] && PER_SEGMENTO[seg].indexOf(st) < 0) return false;
      if (f && f.cliente && p.idCliente !== f.cliente) return false;
      if (testo && norm([p.numero, p.oggetto, nomeCliente ? nomeCliente(p.idCliente) : p.cliente].join(' ')).indexOf(testo) < 0) return false;
      return true;
    }).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.numero || '').localeCompare(String(a.numero || '')));
  }

  function contaPreventivi(lista, oggi) {
    const n = { bozze: 0, inviati: 0, accettati: 0, scaduti: 0, tutti: 0, modelli: 0 };
    (lista || []).forEach(p => {
      if (p.modello) { n.modelli++; return; }
      const st = statoVisto(p, oggi);
      if (st === 'SOSTITUITO') return;
      n.tutti++;
      if (st === 'BOZZA') n.bozze++;
      else if (st === 'INVIATO') n.inviati++;
      else if (st === 'ACCETTATO') n.accettati++;
      else if (st === 'SCADUTO') n.scaduti++;
    });
    return n;
  }

  // ------------------------------------------------------------------ pagina

  const liv = (perm, m) => { const v = perm ? Number(perm[m]) : 0; return v === 1 || v === 2 ? v : 0; };

  /**
   * UN pulsante giallo secondo lo stato (fase2.md §5): Bozza → Invia al cliente;
   * Inviato o scaduto → Segna accettato; Accettato senza commessa → Crea la
   * commessa; Accettato con commessa → Apri la commessa. Null se il ruolo non può.
   */
  function azioneGialla(p, perm, oggi) {
    const st = statoVisto(p, oggi);
    const scrive = liv(perm, 'preventivi') >= 2;
    if (st === 'BOZZA') return scrive ? { chiave: 'invia', testo: 'Invia al cliente' } : null;
    if (st === 'INVIATO' || st === 'SCADUTO') return scrive ? { chiave: 'accetta', testo: 'Segna accettato' } : null;
    if (st === 'ACCETTATO') {
      if (p.idCommessa) return liv(perm, 'commesse') >= 1 ? { chiave: 'apriCommessa', testo: 'Apri la commessa ' + p.idCommessa } : null;
      return scrive && liv(perm, 'commesse') >= 2 ? { chiave: 'creaCommessa', testo: 'Crea la commessa' } : null;
    }
    return null;
  }

  /** Le voci del menu ⋯ della pagina del preventivo, nell'ordine della guida (fase2.md §5). */
  function vociMenu(p, perm, oggi) {
    const st = statoVisto(p, oggi);
    const scrive = liv(perm, 'preventivi') >= 2;
    const voci = [];
    if (scrive && st === 'BOZZA') voci.push({ chiave: 'modifica', testo: 'Modifica' });
    if (scrive && (st === 'INVIATO' || st === 'SCADUTO')) voci.push({ chiave: 'nuovaRevisione', testo: 'Nuova revisione' });
    if (scrive) voci.push({ chiave: 'duplica', testo: 'Duplica' }, { chiave: 'modello', testo: 'Duplica come modello' });
    if (scrive && st === 'BOZZA') voci.push({ chiave: 'segnaInviato', testo: 'Segna inviato senza email' });
    if (scrive && (st === 'INVIATO' || st === 'SCADUTO')) voci.push({ chiave: 'invia', testo: 'Invia di nuovo al cliente' }, { chiave: 'rifiuta', testo: 'Rifiutato', pericolo: true });
    if (scrive && st === 'RIFIUTATO') voci.push({ chiave: 'riapri', testo: 'Riapri in una nuova revisione' });
    voci.push({ chiave: 'pdf', testo: 'PDF del preventivo' });
    if (st === 'ACCETTATO') voci.push({ chiave: 'incarico', testo: 'PDF dell\'incarico' });
    return voci;
  }

  /** I passi in cima alla pagina: Bozza → Inviato → Accettato. Indice del passo di adesso (scaduto = inviato). */
  function passoAttuale(p, oggi) {
    const st = statoVisto(p, oggi);
    return { BOZZA: 0, INVIATO: 1, SCADUTO: 1, RIFIUTATO: 1, ACCETTATO: 2, SOSTITUITO: 1 }[st] || 0;
  }

  /** Si può cambiare solo in bozza: dopo l'invio i prezzi non cambiano (si fa una revisione). */
  function modificabile(p) {
    if (p && typeof p.modificabile === 'boolean') return p.modificabile;
    return String((p && p.stato) || 'BOZZA').toUpperCase() === 'BOZZA' && !(p && p.idCommessa);
  }

  // ------------------------------------------------------------------ la legge

  /**
   * Cosa chiede la legge (DL 1/2012 art. 9, L. 124/2017 c. 150-152) e se c'è:
   * complessità, voci con il prezzo (comprensive di spese, oneri e contributi),
   * oneri ipotizzabili, polizza, titoli. [{ chiave, testo, ok, dove }]
   */
  function cosaChiedeLaLegge(p, impostazioni, voci) {
    const imp = impostazioni || {};
    const tutte = voci || C.vociDelPreventivo(p);
    const scritto = v => v !== undefined && v !== null && String(v).trim() !== '';
    const senzaPrezzo = tutte.filter(v => !(C.num(v.prezzo) > 0)).length;
    const lista = [
      { chiave: 'complessita', testo: 'Grado di complessità', ok: scritto(p.complessita), dove: 'preventivo' },
      { chiave: 'prezzi', testo: senzaPrezzo ? (senzaPrezzo === 1 ? '1 voce senza prezzo' : senzaPrezzo + ' voci senza prezzo') : 'Voci con spese, oneri e contributi', ok: tutte.length > 0 && senzaPrezzo === 0, dove: 'preventivo' },
      { chiave: 'oneri', testo: 'Oneri ipotizzabili', ok: scritto(p.oneriPrevisti), dove: 'preventivo' },
      { chiave: 'polizza', testo: 'Polizza professionale', ok: scritto(imp.POLIZZA_COMPAGNIA) && scritto(imp.POLIZZA_NUMERO), dove: 'studio' },
      { chiave: 'titoli', testo: 'Titoli e specializzazioni', ok: scritto(imp.TITOLI), dove: 'studio' },
    ];
    // Quello che il server dice che manca vince (§13.4: campo tra cliente, oggetto, voci, prezzi, complessita, oneri, polizza, titoli).
    if (Array.isArray(p.mancano) && !voci) {
      p.mancano.forEach(m => {
        const campo = typeof m === 'string' ? '' : m && m.campo;
        const x = lista.find(y => y.chiave === campo || (campo === 'voci' && y.chiave === 'prezzi'));
        if (x) x.ok = false;
        else if (campo) lista.unshift({ chiave: campo, testo: NOMI_MANCANO[campo] || campo, ok: false, dove: 'preventivo' });
      });
    }
    return lista;
  }

  const NOMI_MANCANO = { cliente: 'Il cliente', oggetto: 'L\'oggetto', voci: 'Le voci', prezzi: 'I prezzi delle voci', complessita: 'Il grado di complessità',
    oneri: 'Gli oneri ipotizzabili', polizza: 'La polizza professionale', titoli: 'I titoli e le specializzazioni' };

  /** Cosa manca, in breve, per la domanda prima dell'invio: "la polizza, i titoli". */
  function mancanoInBreve(p, impostazioni) {
    if (Array.isArray(p.mancano)) {
      return p.mancano.map(m => (typeof m === 'string' ? m : NOMI_MANCANO[m.campo] || m.testo || '')).filter(Boolean).map(x => x.charAt(0).toLowerCase() + x.slice(1));
    }
    return cosaChiedeLaLegge(p, impostazioni).filter(x => !x.ok).map(x => (NOMI_MANCANO[x.chiave] || x.testo).toLowerCase());
  }

  /**
   * Quello che manca, come frasi: dal server (mancano: testi o { testo }) se l'ha
   * mandato, altrimenti dai controlli qui sopra.
   */
  function mancano(p, impostazioni) {
    if (Array.isArray(p.mancano)) return p.mancano.map(x => (typeof x === 'string' ? x : (x && (x.testo || x.frase || x.campo)) || '')).filter(Boolean);
    return cosaChiedeLaLegge(p, impostazioni).filter(x => !x.ok).map(x => x.testo);
  }

  // ------------------------------------------------------------------ editor

  let progressivo = 0;
  /** Un id provvisorio per sezioni e voci nuove (il server dà quelli veri al salvataggio). */
  function idNuovo(prefisso) { progressivo++; return (prefisso || 'n') + '-' + Date.now().toString(36) + '-' + progressivo; }
  const nuovo = id => /^[a-z]+-/.test(String(id || ''));

  /** Una voce presa dal listino: nome, modo e prezzo dello studio, quantità 1. */
  function voceDaListino(l) {
    return {
      id: idNuovo('v'), idListino: l.id, descrizione: l.nome || '', modo: l.modo || 'corpo', quantita: l.modo === 'ore' ? 1 : 1,
      unita: l.unita || '', prezzo: l.prezzo === undefined ? null : l.prezzo, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false,
    };
  }

  function voceLibera(testo) {
    return { id: idNuovo('v'), idListino: null, descrizione: testo || '', modo: 'corpo', quantita: 1, unita: '', prezzo: null, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false };
  }

  /**
   * Sposta una voce (trascinando) da una sezione a un'altra, o nella stessa:
   * sezioni nuove (le vecchie non si toccano). aIndice è la posizione d'arrivo.
   */
  function spostaVoce(sezioni, daSezione, daIndice, aSezione, aIndice) {
    const out = (sezioni || []).map(s => Object.assign({}, s, { voci: (s.voci || []).slice() }));
    const da = out.find(s => String(s.id) === String(daSezione));
    const a = out.find(s => String(s.id) === String(aSezione));
    if (!da || !a || daIndice < 0 || daIndice >= da.voci.length) return out;
    const [v] = da.voci.splice(daIndice, 1);
    // aIndice conta le posizioni di prima: nella stessa sezione, dopo il punto di partenza, si scala di uno.
    const i = Math.max(0, Math.min(a.voci.length, da === a && daIndice < aIndice ? aIndice - 1 : aIndice));
    a.voci.splice(i, 0, v);
    return out;
  }

  /**
   * Il preventivo pronto per salvaPreventivo: testata, sezioni con le loro voci,
   * scadenze di pagamento. Gli id provvisori (n-..., v-...) non partono: per il
   * server sono righe nuove. ordine = la posizione.
   */
  function perSalvare(p) {
    const pulisci = id => (id === undefined || id === null || nuovo(id) ? undefined : id);
    const campi = ['id', 'idCliente', 'idSede', 'idReferente', 'oggetto', 'introduzione', 'complessita', 'complessitaNota', 'oneriPrevisti',
      'condizioni', 'data', 'scadenza', 'scontoPercentuale', 'scontoEuro', 'noteInterne', 'modello'];
    const out = {};
    campi.forEach(k => { if (p[k] !== undefined) out[k] = p[k]; });
    out.id = pulisci(p.id);
    out.sezioni = (p.sezioni || []).map((s, i) => ({
      id: pulisci(s.id), titolo: s.titolo || '', ordine: i + 1,
      voci: (s.voci || []).map((v, j) => ({
        id: pulisci(v.id), idListino: v.idListino || null, descrizione: v.descrizione || '', modo: v.modo || 'corpo',
        quantita: C.num(v.quantita === undefined || v.quantita === null || v.quantita === '' ? 1 : v.quantita), unita: v.unita || '',
        prezzo: v.prezzo === null || v.prezzo === undefined || v.prezzo === '' ? null : C.num(v.prezzo),
        scontoPercentuale: C.num(v.scontoPercentuale), facoltativa: !!v.facoltativa, alternativa: String(v.alternativa || '').trim(),
        scelta: !!v.scelta, ordine: j + 1,
      })),
    }));
    out.scadenzePagamento = (p.scadenzePagamento || []).map((s, i) => ({
      id: pulisci(s.id), descrizione: s.descrizione || '', tipo: s.tipo || 'percentuale', valore: C.num(s.valore),
      quando: s.quando || 'firma', data: s.quando === 'data' ? (s.data || '') : '', ordine: i + 1,
    }));
    return out;
  }

  /** Gli errori che fermano il salvataggio: { campo: frase }. */
  function validaPreventivo(p) {
    const e = {};
    if (!p.idCliente) e.cliente = 'Scegli il cliente';
    if (!String(p.oggetto || '').trim()) e.oggetto = 'Scrivi l\'oggetto del preventivo';
    const voci = C.vociDelPreventivo(p);
    if (voci.some(v => !String(v.descrizione || '').trim())) e.voci = 'C\'è una voce senza descrizione';
    ['scontoPercentuale', 'scontoEuro'].forEach(k => { if (C.num(p[k]) < 0) e[k] = 'Lo sconto non può essere negativo'; });
    if (C.num(p.scontoPercentuale) > 100) e.scontoPercentuale = 'Lo sconto va da 0 a 100%';
    return e;
  }

  /** Le quote delle scadenze in percentuale: "fanno 90%: manca il 10%". Vuoto se tornano o se ci sono importi fissi. */
  function controllaScadenze(scadenze) {
    const lista = scadenze || [];
    if (!lista.length || lista.some(s => s.tipo === 'importo')) return '';
    const tot = Math.round(lista.reduce((a, s) => a + C.num(s.valore), 0) * 100) / 100;
    if (tot === 100) return '';
    return tot < 100 ? 'Le quote fanno ' + C.numero(tot) + '%: manca il ' + C.numero(100 - tot) + '%' : 'Le quote fanno ' + C.numero(tot) + '%: sono più del 100%';
  }

  // ------------------------------------------------------------------ dalla bozza alla commessa

  /** I gruppi di alternative di un preventivo: { testo: [voci] }. */
  function gruppiAlternative(voci) {
    const g = {};
    (voci || []).forEach(v => { const k = C.gruppoAlternativa(v); if (k) (g[k] = g[k] || []).push(v); });
    return g;
  }

  /**
   * Le voci da far scegliere al cliente nell'accettazione: le facoltative e,
   * per ogni gruppo, le alternative. Le scelte di partenza sono quelle del preventivo.
   */
  function daScegliere(voci) {
    return (voci || []).filter(v => v.facoltativa === true || v.facoltativa === 1 || C.gruppoAlternativa(v));
  }

  function scelteIniziali(voci) {
    const s = {};
    daScegliere(voci).forEach(v => { s[String(v.id)] = v.scelta === true || v.scelta === 1; });
    // Di un gruppo senza nessuna scelta si propone la prima.
    const g = gruppiAlternative(voci);
    Object.keys(g).forEach(k => { if (!g[k].some(v => s[String(v.id)])) s[String(g[k][0].id)] = true; });
    return s;
  }

  /**
   * Come sarà la commessa che nasce dal preventivo accettato (fase2.md §4,
   * creaCommessaDaPreventivo): prestazioni = voci che contano, ore previste = somma
   * delle voci a ore, prezzo orario = quello delle voci a ore se è uno solo.
   * La crea il server: questa è l'anteprima per la conferma.
   */
  function anteprimaCommessa(p, voci) {
    const tutte = voci || C.vociDelPreventivo(p);
    const contano = C.vociCheContano(tutte);
    const contate = tutte.filter((v, i) => contano[i]);
    const aOre = contate.filter(v => v.modo === 'ore');
    const prezzi = Array.from(new Set(aOre.map(v => C.centesimi(C.num(v.prezzo) * (1 - C.num(v.scontoPercentuale) / 100)))));
    const k = C.contiPreventivo(p, tutte);
    // §13.5: il valore di ogni prestazione è l'importo della voce con gli sconti sul totale divisi in
    // proporzione, così che la somma sia l'importo del contratto (l'ultima prende il resto dei centesimi).
    const importi = contate.map(v => C.importoVoce(v));
    const valori = importi.map(x => (k.sommaVoci > 0 ? C.centesimi(x * k.imponibile / k.sommaVoci) : 0));
    if (valori.length) valori[valori.length - 1] = C.centesimi(k.imponibile - valori.slice(0, -1).reduce((a, x) => C.centesimi(a + x), 0));
    return {
      descrizione: p.oggetto || '',
      importoContratto: k.imponibile,
      prestazioni: contate.map((v, i) => ({ nome: v.descrizione, valore: valori[i] })),
      budgetOre: aOre.length ? Math.round(aOre.reduce((a, v) => a + C.num(v.quantita), 0) * 100) / 100 : null,
      prezzoOrario: prezzi.length === 1 ? prezzi[0] : null,
      scadenze: (p.scadenzePagamento || []).length,
    };
  }

  // ------------------------------------------------------------------ dalle risposte del server

  const DA_COLONNE = { cliente_id: 'idCliente', clienteId: 'idCliente', commessa_id: 'idCommessa', commessaId: 'idCommessa', sede_id: 'idSede', sedeId: 'idSede',
    referente_id: 'idReferente', referenteId: 'idReferente', sezione_id: 'idSezione', sezioneId: 'idSezione', listino_id: 'idListino', listinoId: 'idListino',
    utente_id: 'idUtente', preventivo_id: 'idPreventivo', firma_file_id: 'firmaFileId' };
  function camel(k) { return DA_COLONNE[k] || String(k).replace(/_([a-z])/g, (m, x) => x.toUpperCase()); }
  function chiaviCamel(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
    const x = {};
    Object.keys(o).forEach(k => { x[camel(k)] = o[k]; });
    return x;
  }

  /**
   * Un preventivo come lo usano le pagine: chiavi alla JavaScript, stato in
   * maiuscolo, sezioni con le loro voci dentro (il server può mandarle in un elenco
   * solo, con idSezione), scadenze di pagamento sotto un nome solo.
   */
  function normalizzaPreventivo(p0) {
    const p = chiaviCamel(p0 || {});
    p.stato = String(p.stato || 'BOZZA').toUpperCase();
    p.modello = p.modello === true || p.modello === 1;
    p.scadenzePagamento = (p.scadenzePagamento || p.scadenze || p.pagamenti || []).map(chiaviCamel);
    const ordina = l => l.slice().sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0));
    const sezioni = ordina((p.sezioni || []).map(chiaviCamel));
    const voci = (p.voci || []).map(chiaviCamel);
    p.sezioni = sezioni.map(s => Object.assign({}, s, {
      voci: ordina(((s.voci || []).map(chiaviCamel)).concat(voci.filter(v => String(v.idSezione) === String(s.id)))).map(normalizzaVoce),
    }));
    const sciolte = voci.filter(v => !sezioni.some(s => String(s.id) === String(v.idSezione)));
    if (sciolte.length) p.sezioni.push({ id: idNuovo('n'), titolo: '', voci: ordina(sciolte).map(normalizzaVoce) });
    delete p.voci;
    if (!Array.isArray(p.revisioni)) p.revisioni = [];
    return p;
  }

  function normalizzaVoce(v) {
    return Object.assign({}, v, {
      facoltativa: v.facoltativa === true || v.facoltativa === 1,
      scelta: v.scelta === true || v.scelta === 1,
      alternativa: v.alternativa || '',
      modo: v.modo || 'corpo',
      quantita: v.quantita === undefined || v.quantita === null ? 1 : v.quantita,
    });
  }

  const RegolePreventivi = {
    STATI, COMPLESSITA, MODI, MODI_ACCETTAZIONE, QUANDO, SEGMENTI,
    oggiIso, piuGiorni, giorniFra, statoVisto, numeroConRevisione, scadenzaAParole,
    filtraPreventivi, contaPreventivi, azioneGialla, vociMenu, passoAttuale, modificabile,
    cosaChiedeLaLegge, mancano, idNuovo, voceDaListino, voceLibera, spostaVoce, perSalvare, validaPreventivo, controllaScadenze,
    gruppiAlternative, daScegliere, scelteIniziali, anteprimaCommessa, normalizzaPreventivo, chiaviCamel, mancanoInBreve, NOMI_MANCANO,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RegolePreventivi;
  else radice.WisperRegolePreventivi = RegolePreventivi;
})(typeof window !== 'undefined' ? window : globalThis);
