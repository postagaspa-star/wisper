/*
 * Wisper Ufficio, fase 6: persone, mezzi e attrezzature, collaboratori esterni. Le regole senza niente di grafico.
 *
 * I conti condivisi col server (server/src/conti.js, casi in server/prove/casi-persone.json, casi-mezzi.json e
 * casi-incarichi.json: stessi numeri al centesimo) servono all'anteprima del modulo Chiedi ferie (giorni, ore, saldo)
 * e al rapportino (lo stato della taratura di uno strumento, ricalcolato dalla data). Il server fa fede: quello che
 * arriva dal server si mostra così com'è.
 *
 * Le regole dei dati della persona (fase6.md §3.2): l'interfaccia mostra SOLO quello che il server manda. Un campo
 * che non c'è non diventa un'etichetta vuota; una sezione che il server non manda non compare; il tipo di
 * un'assenza che il server non dice è "Assente".
 */
(function (radice) {
  'use strict';

  // ------------------------------------------------------------------ piccole cose (come server/src/utili.js)

  function numero(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  const centesimi = n => Math.round(n * 100) / 100;
  const ore2 = n => Math.round(numero(n) * 100) / 100;
  const testo = v => (v === null || v === undefined ? '' : String(v).trim());
  const due = n => String(n).padStart(2, '0');
  const giornoSettimana = iso => { const g = new Date(iso + 'T12:00:00').getDay(); return g === 0 ? 7 : g; };

  function giorniDopo(iso, n) {
    const [a, m, g] = String(iso).split('-').map(Number);
    const d = new Date(a, m - 1, g + n, 12);
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }

  function fineMese(iso) {
    const [a, m] = String(iso).split('-').map(Number);
    const d = new Date(a, m, 0, 12);
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }

  function piuMesi(iso, n) {
    const [a, m, g] = String(iso).split('-').map(Number);
    const totale = (m - 1) + Number(n);
    const anno = a + Math.floor(totale / 12);
    const mese = ((totale % 12) + 12) % 12;
    const ultimo = new Date(anno, mese + 1, 0, 12).getDate();
    return anno + '-' + due(mese + 1) + '-' + due(Math.min(g, ultimo));
  }

  /** La Pasqua (Meeus), per il lunedì dell'Angelo. */
  function pasqua(anno) {
    const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31);
    const giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return anno + '-' + due(mese) + '-' + due(giorno);
  }

  function minutiDa(ora) {
    const m = testo(ora).match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mi = Number(m[2]);
    return hh > 23 || mi > 59 ? null : hh * 60 + mi;
  }

  const giorniTra = (da, a) => Math.round((Date.parse(testo(a) + 'T12:00:00') - Date.parse(testo(da) + 'T12:00:00')) / 86400000);
  const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');

  // ------------------------------------------------------------------ i conti condivisi (casi-persone.json)

  /** I festivi di un anno: fissi, Pasquetta, il 4 ottobre dal 2026, il patrono "mm-gg". */
  function festivi(anno, patrono) {
    const a = Number(anno);
    const fissi = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
    if (a >= 2026) fissi.push('10-04');
    const p = testo(patrono);
    if (/^\d{2}-\d{2}$/.test(p)) fissi.push(p);
    const out = new Set(fissi.map(mg => a + '-' + mg));
    out.add(giorniDopo(pasqua(a), 1));
    return Array.from(out).sort();
  }

  function festiviTra(dal, al, patrono) {
    const out = [];
    for (let a = Number(String(dal).slice(0, 4)); a <= Number(String(al || dal).slice(0, 4)); a++) out.push(...festivi(a, patrono));
    return out;
  }

  function giorniLavorativiElenco(dal, al, giorniSettimana, fest) {
    const giorni = Array.isArray(giorniSettimana) && giorniSettimana.length ? giorniSettimana.map(Number) : [1, 2, 3, 4, 5];
    const f = new Set(fest || []);
    const out = [];
    for (let g = dal; g && al && g <= al && out.length < 1000; g = giorniDopo(g, 1)) if (giorni.indexOf(giornoSettimana(g)) >= 0 && !f.has(g)) out.push(g);
    return out;
  }

  function giorniLavorativi(dal, al, giorniSettimana, fest) {
    return giorniLavorativiElenco(dal, al, giorniSettimana, fest).length;
  }

  function oreGiornoPersona(persona) {
    const p = persona || {};
    const giorni = Array.isArray(p.giorniSettimana) && p.giorniSettimana.length ? p.giorniSettimana.length : 5;
    const settimana = p.oreSettimana !== null && p.oreSettimana !== undefined && p.oreSettimana !== '' ? numero(p.oreSettimana)
      : (numero(p.oreGiornaliere) || 8) * giorni;
    return ore2(settimana / giorni);
  }

  const SANITARIE = ['malattia', 'infortunio', 'congedo', 'legge104'];

  function assenzaAOre(a) {
    const tipo = testo(a.tipo);
    if (tipo === 'permesso') return true;
    if (tipo !== 'altro' && tipo !== 'legge104') return false;
    return !!(testo(a.dalle) || testo(a.alle) || (a.ore !== undefined && a.ore !== null && a.ore !== '' && numero(a.ore) > 0));
  }

  /** Giorni e ore di un'assenza (fase6.md §6.2), come il server. */
  function oreAssenza(a, persona, fest) {
    const tipo = testo(a.tipo);
    const dal = testo(a.dal);
    const al = testo(a.al) || dal;
    const oreGiorno = oreGiornoPersona(persona);
    const lavorativi = giorniLavorativi(dal, al, (persona || {}).giorniSettimana, fest);
    if (assenzaAOre(a)) {
      let ore;
      if (testo(a.dalle) && testo(a.alle)) {
        const m1 = minutiDa(a.dalle);
        const m2 = minutiDa(a.alle);
        ore = m1 === null || m2 === null || m2 <= m1 ? 0 : ore2((m2 - m1) / 60);
      } else ore = ore2(a.ore);
      return { giorni: 0, ore: lavorativi ? ore : 0 };
    }
    if (SANITARIE.indexOf(tipo) >= 0) {
      const calendario = dal && al && al >= dal ? giorniTra(dal, al) + 1 : 0;
      return { giorni: calendario, ore: ore2(lavorativi * oreGiorno) };
    }
    const giorni = testo(a.mezza) && dal === al ? (lavorativi ? 0.5 : 0) : lavorativi;
    return { giorni, ore: ore2(giorni * oreGiorno) };
  }

  /** Il saldo di ferie o permessi dal cedolino (fase6.md §3.4, §6.3), come il server. */
  function saldoAssenze({ annue, saldi, assenze, oggi, entrata, uscita }) {
    const conAnnue = annue !== null && annue !== undefined && annue !== '';
    if (!conAnnue && !(saldi || []).length) return { tenuto: false };
    const fino = testo(oggi);
    const ultimo = (saldi || []).filter(s => testo(s.data) && testo(s.data) <= fino)
      .sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : 0))[0] || null;
    const scritto = ultimo ? ore2(ultimo.ore) : 0;
    const scrittoIl = ultimo ? testo(ultimo.data) : '';
    let partenza = scrittoIl;
    if (!partenza) {
      const gennaio = fino.slice(0, 4) + '-01-01';
      const meseEntrata = testo(entrata) ? testo(entrata).slice(0, 7) + '-01' : '';
      partenza = giorniDopo(meseEntrata && meseEntrata > gennaio ? meseEntrata : gennaio, -1);
    }
    let mesi = 0;
    if (conAnnue) {
      let m = partenza.slice(0, 7) + '-01';
      for (let i = 0; i < 600; i++) {
        const fine = fineMese(m);
        if (fine > fino) break;
        const dentroEntrata = !testo(entrata) || fine >= testo(entrata);
        const dentroUscita = !testo(uscita) || m <= testo(uscita);
        if (fine > partenza && dentroEntrata && dentroUscita) mesi++;
        m = giorniDopo(fine, 1);
      }
    }
    const maturate = conAnnue ? centesimi(numero(annue) * mesi / 12) : 0;
    let godute = 0;
    let prenotate = 0;
    for (const a of assenze || []) {
      const dal = testo(a.dal);
      if (scrittoIl && dal <= scrittoIl) continue;
      if (a.stato === 'approvata') {
        if (dal <= fino) godute += numero(a.ore);
        else prenotate += numero(a.ore);
      } else if (a.stato === 'da_approvare') prenotate += numero(a.ore);
    }
    godute = ore2(godute);
    prenotate = ore2(prenotate);
    const oggiSaldo = centesimi(scritto + maturate - godute);
    return { tenuto: true, scritto, scrittoIl, maturate, godute, oggi: oggiSaldo, prenotate, restano: centesimi(oggiSaldo - prenotate) };
  }

  function costoOrarioDaAnno(costoAnno, oreAnno) {
    const o = numero(oreAnno);
    if (!(o > 0)) return null;
    return centesimi(numero(costoAnno) / o);
  }

  // ------------------------------------------------------------------ mezzi e strumenti (casi-mezzi.json)

  function statoTaratura(x, oggi, preavviso) {
    const c = testo(x && x.controllo);
    if (!c) return null;
    const dpi = c === 'verifica';
    const T = dpi ? 'Verifica' : 'Taratura';
    const ultima = x.ultima || null;
    const scade = ultima && testo(ultima.scade) ? testo(ultima.scade) : '';
    if (testo(x.fuoriUso) === 'non_conforme' || (ultima && ultima.esito === 'non_conforme')) return { stato: 'non_conforme', parola: 'Non conforme', giorni: null, scade };
    if (x.inLaboratorio) return { stato: 'laboratorio', parola: dpi ? 'In verifica' : 'In taratura', giorni: null, scade };
    if (!ultima) return { stato: 'senza', parola: T + ' non scritta', giorni: null, scade: '' };
    if (!scade) return { stato: 'valida', parola: dpi ? 'Verificato' : 'Tarato', giorni: null, scade: '' };
    const g = giorniTra(oggi, scade);
    if (g < 0) return { stato: 'scaduta', parola: T + ' scaduta da ' + (-g === 1 ? '1 giorno' : -g + ' giorni'), giorni: -g, scade };
    if (g <= numero(preavviso)) return { stato: 'in_scadenza', parola: g === 0 ? T + ' scade oggi' : T + ' fra ' + (g === 1 ? '1 giorno' : g + ' giorni'), giorni: g, scade };
    return { stato: 'valida', parola: (dpi ? 'Verificato' : 'Tarato') + ' fino al ' + dataIt(scade), giorni: g, scade };
  }

  function scadenzaRevisione(immatricolazione, ultimaRevisione) {
    if (testo(ultimaRevisione)) return fineMese(piuMesi(testo(ultimaRevisione), 24));
    if (testo(immatricolazione)) return fineMese(piuMesi(testo(immatricolazione), 48));
    return '';
  }

  function kmAlTagliando({ tagliandoKm, tagliandoUltimoKm, km }) {
    if (tagliandoKm === null || tagliandoKm === undefined || tagliandoKm === '' || !(numero(tagliandoKm) > 0)) return null;
    if (km === null || km === undefined || km === '') return null;
    return Math.round(numero(tagliandoUltimoKm) + numero(tagliandoKm) - numero(km));
  }

  // ------------------------------------------------------------------ incarichi (casi-incarichi.json)

  function contiIncarico(x) {
    const corpo = testo(x.modo) !== 'ore';
    const tetto = x.tetto !== null && x.tetto !== undefined && x.tetto !== '' && numero(x.tetto) > 0 ? numero(x.tetto) : null;
    let pattuito;
    let maturato;
    if (corpo) {
      pattuito = centesimi(numero(x.compenso));
      maturato = centesimi(numero(x.compenso) * numero(x.avanzamento) / 100);
    } else {
      pattuito = centesimi(numero(x.orePreviste) * numero(x.tariffa));
      if (tetto !== null && tetto < pattuito) pattuito = centesimi(tetto);
      maturato = centesimi(numero(x.oreApprovate) * numero(x.tariffa));
      if (tetto !== null && maturato > tetto) maturato = centesimi(tetto);
    }
    if (x.speseComprese === false || x.speseComprese === 0) maturato = centesimi(maturato + numero(x.speseDaRiconoscere));
    let fatturato = 0;
    let costo = 0;
    let daPagare = 0;
    for (const r of x.ricevute || []) {
      const segno = testo(r.tipo) === 'TD04' ? -1 : 1;
      fatturato += segno * numero(r.imponibile);
      costo += segno * (numero(r.imponibile) + numero(r.contributo) + numero(r.bollo));
      if (segno > 0) daPagare += numero(r.daPagare);
    }
    return { pattuito, maturato, fatturato: centesimi(fatturato), costo: centesimi(costo), daFatturare: centesimi(Math.max(0, maturato - centesimi(fatturato))), daPagare: centesimi(daPagare) };
  }

  // ------------------------------------------------------------------ parole fisse (fase6.md §12)

  const RAPPORTI = [['titolare', 'Titolare'], ['socio', 'Socio'], ['dipendente', 'Dipendente'], ['apprendista', 'Apprendista'],
    ['tirocinante', 'Tirocinante'], ['autonomo', 'A partita IVA nello studio'], ['altro', 'Altro']];
  const CONTRATTI = [['indeterminato', 'Tempo indeterminato'], ['determinato', 'Tempo determinato'], ['apprendistato', 'Apprendistato'],
    ['stage', 'Tirocinio'], ['parasubordinato', 'Collaborazione'], ['partita_iva', 'Partita IVA']];
  const TIPI_ASSENZA = { ferie: 'Ferie', permesso: 'Permesso', malattia: 'Malattia', infortunio: 'Infortunio', congedo: 'Congedo', legge104: 'Legge 104', altro: 'Altro' };
  const STATI_ASSENZA = { bozza: 'Bozza', da_approvare: 'Da approvare', approvata: 'Approvata', respinta: 'Respinta', annullata: 'Annullata' };
  const TIPI_VISITA = [['preventiva', 'Preventiva'], ['periodica', 'Periodica'], ['richiesta', 'Su richiesta'], ['cambio_mansione', 'Cambio di mansione'], ['rientro', 'Rientro'], ['cessazione', 'Fine del rapporto']];
  const GIUDIZI = [['idoneo', 'Idoneo'], ['idoneo_prescrizioni', 'Idoneo con prescrizioni'], ['non_idoneo_temporaneo', 'Non idoneo per ora'], ['non_idoneo', 'Non idoneo']];
  const CATEGORIE_ATTREZZATURA = [['strumento', 'Strumenti di misura'], ['attrezzo', 'Attrezzi'], ['informatica', 'Informatica'], ['dpi', 'DPI'], ['altro', 'Altro']];
  const TIPI_MEZZO = [['auto', 'Auto'], ['furgone', 'Furgone'], ['moto', 'Moto'], ['altro', 'Altro']];
  const TIPI_MANUTENZIONE = [['tagliando', 'Tagliando'], ['revisione', 'Revisione'], ['gomme', 'Gomme'], ['riparazione', 'Riparazione'], ['manutenzione', 'Manutenzione'], ['guasto', 'Guasto'], ['altro', 'Altro']];
  const STATI_MANUTENZIONE = { aperta: 'Segnalato', in_officina: 'In officina', chiusa: 'Risolto' };
  const TIPI_COLLABORATORE = [['impresa', 'Impresa'], ['professionista', 'Professionista'], ['occasionale', 'Occasionale']];
  const STATI_INCARICO = { bozza: 'Bozza', affidato: 'Affidato', concluso: 'Concluso', annullato: 'Annullato' };
  const VALUTAZIONI = [['bene', 'Bene'], ['problemi', 'Con qualche problema'], ['male', 'Male']];
  const DOCUMENTI_COLLABORATORE = [['durc', 'DURC'], ['visura', 'Visura'], ['idoneita', 'Autocertificazione di idoneità'], ['polizza', 'Polizza'], ['albo', 'Iscrizione all\'albo'], ['', 'Altro']];
  const PROPOSTE_DPI = ['Guanti isolanti', 'Elmetto con visiera', 'Calzature di sicurezza', 'Occhiali', 'Imbracatura anticaduta', 'Tuta', 'Otoprotettori', 'Altro'];
  const NON_COLLEGATO = 'Non collegato';

  const nomeDi = (lista, k) => { const x = lista.find(y => y[0] === k); return x ? x[1] : ''; };
  const nomeRapporto = r => (r ? nomeDi(RAPPORTI, r) || r : 'Da completare');

  /**
   * Il colore di una parola di stato (fase6.md §12): sempre con la parola, mai il colore da solo.
   * Torna una delle classi di B.pillola: rosso, ambra, giallo, blu, verde, grigio.
   */
  function colore(parola) {
    const p = testo(parola).toLowerCase();
    if (!p) return 'grigio';
    if (/^(taratura scaduta|verifica scaduta|non conforme|fuori uso|fermo|scaduta|scaduto|respinta|respinto|documenti scaduti|non idoneo|male\b|oltre il rientro|sotto zero)/.test(p)) return 'rosso';
    if (/^(scade|taratura fra|verifica fra|taratura scade|verifica scade|in officina|manca qualcosa|idoneo con prescrizioni|con qualche problema|nel preavviso)/.test(p)) return 'ambra';
    if (/^(da approvare|bozza|da completare|da firmare)/.test(p)) return 'giallo';
    if (/^(assegnat|in prestito|in taratura|in verifica|in riparazione|affidato|permesso|a ore\b)/.test(p)) return 'blu';
    if (/^(disponibile|tarato|verificato|valida|approvata|in regola|idoneo|concluso|bene|ferie|firmata|risolto)/.test(p)) return 'verde';
    return 'grigio';
  }

  /** Il colore dello stato della taratura dal codice del server. */
  function coloreTaratura(t) {
    if (!t) return 'grigio';
    return { valida: 'verde', in_scadenza: 'ambra', scaduta: 'rosso', non_conforme: 'rosso', laboratorio: 'blu', senza: 'grigio' }[t.stato] || 'grigio';
  }

  /** Il colore dello stato di un mezzo (stato del server). */
  function coloreMezzo(stato) {
    return { fermo: 'rosso', officina: 'ambra', prestito: 'blu', assegnato: 'blu', disponibile: 'verde', persona: 'grigio', dismesso: 'grigio' }[stato] || 'grigio';
  }

  /** Il colore dello stato di un'attrezzatura (stato del server: fuori, laboratorio, riparazione, scaduta, prestito, assegnato, disponibile). */
  function coloreAttrezzatura(stato) {
    return { fuori: 'rosso', fuori_uso: 'rosso', scaduta: 'rosso', laboratorio: 'blu', riparazione: 'blu', prestito: 'blu', assegnato: 'blu', disponibile: 'verde', dismesso: 'grigio' }[stato] || 'grigio';
  }

  const coloreIdoneita = s => ({ in_regola: 'verde', manca: 'ambra', scaduti: 'rosso' }[s] || 'grigio');
  const coloreIncarico = s => ({ bozza: 'giallo', affidato: 'blu', concluso: 'verde', annullato: 'grigio' }[s] || 'grigio');
  const coloreValutazione = v => ({ bene: 'verde', problemi: 'ambra', male: 'rosso' }[v] || 'grigio');
  const coloreAssenza = s => ({ bozza: 'grigio', da_approvare: 'giallo', approvata: 'verde', respinta: 'rosso', annullata: 'grigio' }[s] || 'grigio');
  const coloreGiudizio = g => ({ idoneo: 'verde', idoneo_prescrizioni: 'ambra', non_idoneo_temporaneo: 'rosso', non_idoneo: 'rosso' }[g] || 'grigio');

  // ------------------------------------------------------------------ strumenti nel rapportino (fase6.md §3.8, §3.9)

  /**
   * Si può scegliere uno strumento nel rapportino? taratura = {stato, parola, scade} (del server, o ricalcolata),
   * fuoriUso, rientro (al laboratorio), blocco = TARATURA_BLOCCO ("avviso" | "blocco").
   *  { si: true }                                    tarato, in scadenza, taratura non scritta, senza controllo
   *  { si: true, conferma: true, titolo, frase }     scaduto con "avviso": si usa confermando, e la conferma resta scritta
   *  { si: false, motivo }                           non conforme, al laboratorio, guasto, perso, scaduto con "blocco"
   */
  function sceltaStrumento(s, blocco) {
    const t = s && s.taratura;
    const nome = (s && s.nome) || 'Lo strumento';
    if (s && (s.fuoriUso === 'non_conforme' || (t && t.stato === 'non_conforme'))) {
      return { si: false, motivo: 'Non conforme' + (s.fuoriUsoIl ? ' dal ' + dataIt(s.fuoriUsoIl).slice(0, 5) : '') + ': non si usa finché non è tarato di nuovo' };
    }
    if (s && (s.fuoriUso === 'guasto' || s.fuoriUso === 'perso')) return { si: false, motivo: 'Fuori uso' + (s.fuoriUsoMotivo ? ': ' + s.fuoriUsoMotivo : '') };
    if (s && (s.stato === 'laboratorio' || (t && t.stato === 'laboratorio'))) return { si: false, motivo: 'È al laboratorio' + (s.rientro ? ' fino al ' + dataIt(s.rientro).slice(0, 5) : '') };
    if (s && s.stato === 'riparazione') return { si: false, motivo: 'È in riparazione' + (s.rientro ? ' fino al ' + dataIt(s.rientro).slice(0, 5) : '') };
    if (t && t.stato === 'scaduta') {
      const dpi = /^Verifica/.test(t.parola || '');
      if (blocco === 'blocco') return { si: false, motivo: (dpi ? 'Verifica' : 'Taratura') + ' scaduta: per le regole dello studio non si usa finché non è ' + (dpi ? 'verificato' : 'tarato') };
      return { si: true, conferma: true, titolo: 'Il ' + nome + ' ha la ' + (dpi ? 'verifica' : 'taratura') + ' scaduta',
        frase: 'Scaduta il ' + dataIt(t.scade) + ': le misure potrebbero non valere.' };
    }
    return { si: true };
  }

  /** Lo stato di quel giorno di uno strumento usato (congelato nel rapportino): la parola e il colore. */
  function statoAllora(u) {
    const dpi = !!(u && u.verifica);
    const T = dpi ? 'Verifica' : 'Taratura';
    switch (u && u.statoAllora) {
      case 'valida': return { parola: (dpi ? 'Verificato' : 'Tarato') + (u.scadeAllora ? ' fino al ' + dataIt(u.scadeAllora) : ''), colore: 'verde' };
      case 'scaduta': return { parola: T + ' scaduta' + (u.confermato ? ' · confermato' : ''), colore: 'rosso' };
      case 'non_conforme': return { parola: 'Non conforme', colore: 'rosso' };
      case 'laboratorio': return { parola: dpi ? 'In verifica' : 'In taratura', colore: 'blu' };
      case 'senza': return { parola: T + ' non scritta', colore: 'grigio' };
      default: return { parola: '', colore: 'grigio' };
    }
  }

  /** Gli strumenti dell'ultimo rapportino per lo stesso impianto (luogo) o, se non c'è, per lo stesso cliente: "Come l'ultima volta qui". */
  function comeUltimaVolta(rapportini, idCliente, luogo, escludi) {
    const conStrumenti = (rapportini || []).filter(r => r && (r.strumenti || []).length && r.stato !== 'ANNULLATO' && (!escludi || (r.id !== escludi && r.idLocale !== escludi)))
      .sort((a, b) => (String(a.data) < String(b.data) ? 1 : String(a.data) > String(b.data) ? -1 : 0));
    const l = testo(luogo).toLowerCase();
    const x = (l && conStrumenti.find(r => r.idCliente === idCliente && testo(r.luogo).toLowerCase() === l)) || conStrumenti.find(r => r.idCliente === idCliente);
    return x ? x.strumenti.map(s => s.idAttrezzatura) : [];
  }

  // ------------------------------------------------------------------ assenze: parole e conti dell'anteprima

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const dataD = iso => new Date(iso + 'T12:00:00');
  const giornoMese = iso => dataD(iso).getDate() + ' ' + MESI[dataD(iso).getMonth()];
  const giornoLungo = iso => GIORNI[dataD(iso).getDay()] + ' ' + giornoMese(iso);
  const maiuscola = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /** "Dal 2 al 6 novembre", "Venerdì 30 ottobre · 15:00-18:00", "Lunedì 9 novembre · mattina". */
  function quandoAssenza(a) {
    if (!a || !a.dal) return '';
    const al = a.al || a.dal;
    if (a.dal === al) {
      const extra = a.dalle && a.alle ? ' · ' + a.dalle + '-' + a.alle : a.mezza ? ' · ' + (a.mezza === 'mattina' ? 'mattina' : 'pomeriggio') : '';
      return maiuscola(giornoLungo(a.dal)) + extra;
    }
    const stessoMese = a.dal.slice(0, 7) === al.slice(0, 7);
    return 'Dal ' + (stessoMese ? String(dataD(a.dal).getDate()) : giornoMese(a.dal)) + ' al ' + giornoMese(al) + (a.dal.slice(0, 4) !== al.slice(0, 4) ? ' ' + al.slice(0, 4) : '');
  }

  const numIt = n => String(Math.round(numero(n) * 100) / 100).replace('.', ',');
  const giorni1 = n => (numero(n) === 1 ? '1 giorno' : numIt(n) + ' giorni');
  const ore1 = n => (numero(n) === 1 ? '1 ora' : numIt(n) + ' ore');

  /** "5 giorni · 40 ore" (ferie e assenze a giorni) o "3 ore" (permessi). */
  function contoAssenza(x) {
    if (!x) return '';
    if (numero(x.giorni) > 0) return giorni1(x.giorni) + ' · ' + ore1(x.ore);
    return ore1(x.ore);
  }

  /** Le ore del saldo in giorni della persona: ore / ore del giorno, arrotondato al mezzo giorno in basso (prudente). */
  function giorniDaOre(ore, oreGiorno) {
    const og = numero(oreGiorno) || 8;
    const g = numero(ore) / og;
    return g >= 0 ? Math.floor(g * 2) / 2 : -Math.floor(-g * 2) / 2;
  }

  /**
   * Il conto dell'anteprima di Chiedi ferie: giorni e ore dell'assenza e quanto resta del saldo dopo la richiesta.
   * saldi = quelli del server per la persona ({ferie, permessi}); il saldo "restano" del server conta già le
   * richieste aperte (prudente): questa si toglie in più.
   */
  function anteprimaAssenza(assenza, persona, saldi, patrono) {
    const a = assenza || {};
    if (!a.dal) return null;
    const fest = festiviTra(a.dal, a.al || a.dal, patrono);
    const conto = oreAssenza(a, persona, fest);
    const tipoSaldo = a.tipo === 'ferie' ? 'ferie' : a.tipo === 'permesso' ? 'permessi' : '';
    const s = tipoSaldo && saldi ? saldi[tipoSaldo] : null;
    if (!s || !s.tenuto) return { conto, saldo: null };
    const oreGiorno = numero(s.oreGiorno) || oreGiornoPersona(persona);
    const restano = centesimi(numero(s.restano) - conto.ore);
    return { conto, saldo: { tipo: tipoSaldo, restano, giorni: tipoSaldo === 'ferie' ? giorniDaOre(restano, oreGiorno) : null, sottoZero: restano < 0 } };
  }

  /** "Ti restano 8 giorni di ferie" / "Ti restano 21 ore di permesso" / con −. */
  function fraseRestano(saldo, perAltri) {
    if (!saldo) return '';
    const chi = perAltri ? 'Restano ' : 'Ti restano ';
    if (saldo.tipo === 'ferie') return chi + (saldo.giorni < 0 ? '−' + giorni1(-saldo.giorni) : giorni1(saldo.giorni)) + ' di ferie';
    return chi + (saldo.restano < 0 ? '−' + ore1(-saldo.restano) : ore1(saldo.restano)) + ' di permesso';
  }

  /** La parola del tipo di un'assenza: quella del server (tipoVisto), che per chi non vede il tipo è "Assente". */
  const tipoVisto = a => (a && (a.tipoVisto || (a.tipo ? (a.tipo === 'altro' && a.causale ? a.causale : TIPI_ASSENZA[a.tipo]) : ''))) || 'Assente';

  // ------------------------------------------------------------------ la griglia del mese delle assenze (computer)

  /**
   * Le celle della griglia delle assenze: per ogni persona e giorno { tipo: 'festa'|'weekend'|'chiuso'|'', assenza }.
   * persone: [{id, nome, giorniSettimana?}], assenze: quelle del server (con idPersona, dal, al, stato, tipoVisto),
   * chiusure: [{dal, al, nome}], festivi: ['aaaa-mm-gg']. Solo approvate e da approvare.
   */
  function grigliaAssenze(persone, assenze, giorni, festiviElenco, chiusure) {
    const fest = new Set(festiviElenco || []);
    return (persone || []).map(p => ({
      persona: p,
      celle: giorni.map(g => {
        const gs = Array.isArray(p.giorniSettimana) && p.giorniSettimana.length ? p.giorniSettimana : [1, 2, 3, 4, 5];
        const tipo = fest.has(g) ? 'festa' : gs.indexOf(giornoSettimana(g)) < 0 ? 'weekend' : '';
        const chiusa = (chiusure || []).find(c => c.dal <= g && (c.al || c.dal) >= g);
        const a = (assenze || []).find(x => String(x.idPersona) === String(p.id) && x.dal <= g && (x.al || x.dal) >= g && (x.stato === 'approvata' || x.stato === 'da_approvare'));
        return { data: g, tipo: tipo || (chiusa ? 'chiuso' : ''), chiusura: chiusa || null, assenza: tipo ? null : a || null };
      }),
    }));
  }

  /** Le classi di una barra della griglia: ferie verde, permesso blu, "Assente" grigio, da approvare tratteggiata. */
  function classeAssenza(a) {
    if (!a) return '';
    if (a.stato === 'da_approvare') return 'da-approvare';
    const t = tipoVisto(a);
    return t === 'Ferie' ? 'ferie' : t === 'Permesso' ? 'perm' : 'altra';
  }

  // ------------------------------------------------------------------ la scheda della persona: cosa si mostra

  /**
   * Le sezioni della scheda della persona, decise SOLO da quello che il server ha mandato (fase6.md §3.2):
   * una chiave che non c'è vuol dire "non la vedi", e la sezione non si disegna (nemmeno il titolo).
   * Le competenze e i documenti di un collega arrivano come elenco vuoto: senza righe la sezione non c'è.
   */
  function sezioniPersona(p) {
    const x = p || {};
    const ha = k => Object.prototype.hasOwnProperty.call(x, k);
    const pieno = k => Array.isArray(x[k]) && x[k].length > 0;
    return {
      lavoro: true,
      ferie: ha('saldi') || ha('assenze'),
      competenze: pieno('qualifiche') || (x.puoScrivere === true && ha('qualifiche')),
      visite: ha('visite') && (pieno('visite') || x.puoScrivere === true),
      giudizio: ha('visite') && (x.visite || []).some(v => Object.prototype.hasOwnProperty.call(v, 'giudizio')),
      inUso: pieno('mezzi') || pieno('attrezzature') || pieno('dpi') || (x.puoScrivere === true && ha('dpi')),
      dpi: ha('dpi'),
      documenti: pieno('documenti') || (x.puoScrivere === true && ha('documenti')),
      costo: ha('costoOrario') || ha('costi'),
      costoAnno: ha('costoAnno'),
      personali: ha('codiceFiscale') || ha('iban') || ha('telefonoPersonale'),
      riservati: ha('ccnl') || ha('livello') || ha('noteRiservate'),
      scadenze: pieno('scadenze'),
      accesso: x.puoScrivere === true,
    };
  }

  /**
   * Il pulsante giallo della scheda della persona (fase6.md §12.1), uno solo: una richiesta di questa persona da
   * approvare (chi approva) → Approva le ferie; altrimenti nessuno. Per sé (Io) → Chiedi ferie o permesso.
   */
  function gialloPersona(p, idPersonaIo, puoApprovare) {
    if (!p) return null;
    if (idPersonaIo && String(p.id) === String(idPersonaIo)) return { azione: 'chiedi', testo: 'Chiedi ferie o permesso' };
    const da = (p.assenze || []).find(a => a.stato === 'da_approvare' && a.daApprovare !== false);
    if (da && puoApprovare && p.puoApprovare !== false) return { azione: 'approva', testo: da.tipo === 'permesso' ? 'Approva il permesso' : 'Approva le ferie', assenza: da };
    return null;
  }

  /** La categoria di un documento personale dal nome del file (fase6.md §5.6): si propone, si cambia. */
  function categoriaDaNomeFile(nome) {
    const n = testo(nome).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (/cedolin|busta ?paga/.test(n)) return 'Cedolini';
    if (/contratt|assunzion/.test(n)) return 'Contratti di lavoro';
    if (/idoneit|giudizi|medic/.test(n)) return 'Idoneità sanitarie';
    if (/attestat|corso|pes\b|pav\b|abilitaz|formazion/.test(n)) return 'Attestati e abilitazioni';
    if (/dpi|consegn/.test(n)) return 'Consegne DPI';
    return '';
  }

  /** "13 giorni di ferie" e la riga sotto, dal saldo del server. */
  function righeSaldo(saldi) {
    const f = saldi && saldi.ferie;
    const p = saldi && saldi.permessi;
    if (!(f && f.tenuto) && !(p && p.tenuto)) return null;
    const mese = f && f.scrittoIl ? MESI[Number(f.scrittoIl.slice(5, 7)) - 1] : '';
    return {
      ferie: f && f.tenuto ? { grande: giorni1(f.giorniOggi !== undefined ? f.giorniOggi : giorniDaOre(f.oggi, f.oreGiorno)), sotto: 'di ferie (' + ore1(f.oggi) + ')' } : null,
      permessi: p && p.tenuto ? { grande: ore1(p.oggi), sotto: 'di permesso' } : null,
      riga: (mese ? 'Dal cedolino di ' + mese : 'Senza cedolino scritto') + (f && f.tenuto ? ' · dopo le richieste restano ' + giorni1(f.giorniRestano !== undefined ? f.giorniRestano : giorniDaOre(f.restano, f.oreGiorno)) : ''),
    };
  }

  // ------------------------------------------------------------------ l'esterno

  /** Il nome della voce del menu: per l'esterno Collaboratori esterni è "La tua scheda" (fase6.md §12.7). */
  function nomeVoce(voce, esterno) {
    if (esterno && voce.modulo === 'collaboratori') return 'La tua scheda';
    return voce.nome;
  }

  /** Il menu dell'esterno: Dashboard · Commesse · Progetti · Rapportini · Attività e calendario · Spese e trasferte · Documenti · Ticket e assistenza · La tua scheda. */
  const MENU_ESTERNO = ['dashboard', 'commesse', 'progetti', 'rapportini', 'attivita', 'spese', 'documenti', 'ticket', 'collaboratori'];

  /** Dove porta un collegamento a una persona: la propria scheda è "Io". */
  function hashPersona(id, idPersonaIo) {
    return idPersonaIo && String(id) === String(idPersonaIo) ? '#persone/io' : '#persone/p/' + encodeURIComponent(id);
  }

  const Regole = {
    numero, centesimi, giorniDopo, fineMese, piuMesi, pasqua, minutiDa, giorniTra, dataIt,
    festivi, festiviTra, giorniLavorativiElenco, giorniLavorativi, oreGiornoPersona, SANITARIE, assenzaAOre, oreAssenza, saldoAssenze,
    costoOrarioDaAnno, statoTaratura, scadenzaRevisione, kmAlTagliando, contiIncarico,
    RAPPORTI, CONTRATTI, TIPI_ASSENZA, STATI_ASSENZA, TIPI_VISITA, GIUDIZI, CATEGORIE_ATTREZZATURA, TIPI_MEZZO, TIPI_MANUTENZIONE, STATI_MANUTENZIONE,
    TIPI_COLLABORATORE, STATI_INCARICO, VALUTAZIONI, DOCUMENTI_COLLABORATORE, PROPOSTE_DPI, NON_COLLEGATO, MESI,
    nomeDi, nomeRapporto, colore, coloreTaratura, coloreMezzo, coloreAttrezzatura, coloreIdoneita, coloreIncarico, coloreValutazione, coloreAssenza, coloreGiudizio,
    sceltaStrumento, statoAllora, comeUltimaVolta,
    quandoAssenza, contoAssenza, giorniDaOre, anteprimaAssenza, fraseRestano, tipoVisto, giorni1, ore1, numIt, giornoLungo, giornoMese, maiuscola,
    grigliaAssenze, classeAssenza, sezioniPersona, gialloPersona, categoriaDaNomeFile, righeSaldo,
    nomeVoce, MENU_ESTERNO, hashPersona,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperRegolePersone = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
