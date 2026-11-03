/*
 * Wisper Ufficio: le regole di fatture, banche e scadenze (fase 4), senza niente di grafico.
 *
 * I conti della fattura (docs/gestionale/fase4.md §6, architettura.md §15.18): li fa il
 * server (server/src/conti.js, contiFattura) e l'interfaccia mostra i suoi numeri. Qui
 * c'è la stessa funzione, con gli stessi casi (server/prove/casi-fattura.json, provati
 * al centesimo in prove/fatture.test.js), solo per l'anteprima mentre si cambia una bozza:
 * salvando, i numeri tornano quelli del server.
 *
 * Poi le parole e i colori fissi delle pagine (fase4.md §13): gli stati delle fatture,
 * delle ricevute, degli impegni e delle righe dello scadenziario, le righe dei conti
 * coi loro nomi ("Contributo integrativo EPPI 5%", "Netto da incassare"...), l'IBAN
 * coperto, le voci di Da fatturare raggruppate come le mostra il computer.
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);

  const centesimi = n => Math.round(n * 100) / 100;
  const numero = v => (v === null || v === undefined || v === '' ? 0 : (typeof v === 'number' ? (isNaN(v) ? 0 : v) : C.num(v)));
  const vuoto = v => v === undefined || v === null || v === '';

  // ------------------------------------------------------------------ i conti (§6)

  /** L'importo di una riga: quello scritto (righe raggruppate) o quantità × prezzo (quantità mancante = 1). */
  function importoRiga(r) {
    if (!vuoto(r.importo)) return centesimi(numero(r.importo));
    const q = vuoto(r.quantita) ? 1 : numero(r.quantita);
    return centesimi(q * numero(r.prezzo));
  }

  /**
   * I conti di una fattura, come il server. Ogni pezzo arrotondato al centesimo prima di
   * sommare. Una riga "bollo" si salta (la aggiunge il server).
   * f = {regime, ivaPercentuale, eppiPercentuale, ritenutaPercentuale, ritenuta, bolloSoglia, bolloImporto, bolloRivalsa, righe}
   */
  function contiFattura(f) {
    const forfettario = f.regime === 'forfettario';
    let compenso = 0;
    let anticipazioni = 0;
    let perIlBollo = 0;
    const righe = [];
    (f.righe || []).forEach(r => {
      if (r.tipo === 'bollo') return;
      const importo = importoRiga(r);
      righe.push(importo);
      if (r.tipo === 'anticipazione') {
        anticipazioni = centesimi(anticipazioni + importo);
        if (!r.tributoCliente) perIlBollo = centesimi(perIlBollo + importo);
      } else {
        compenso = centesimi(compenso + importo);
      }
    });
    const contributo = centesimi(compenso * numero(f.eppiPercentuale) / 100);
    const baseIva = forfettario ? 0 : centesimi(compenso + contributo);
    const iva = forfettario ? 0 : centesimi(baseIva * numero(f.ivaPercentuale) / 100);
    const parteSenzaIva = forfettario ? centesimi(compenso + contributo + perIlBollo) : perIlBollo;
    const bollo = parteSenzaIva > numero(f.bolloSoglia) ? centesimi(numero(f.bolloImporto)) : 0;
    const bolloAddebitato = f.bolloRivalsa ? bollo : 0;
    const totale = forfettario
      ? centesimi(compenso + contributo + anticipazioni + bolloAddebitato)
      : centesimi(baseIva + iva + anticipazioni + bolloAddebitato);
    const ritenuta = !forfettario && f.ritenuta ? centesimi(compenso * numero(f.ritenutaPercentuale) / 100) : 0;
    return { righe, compenso, contributo, baseIva, iva, anticipazioni, parteSenzaIva, bollo, bolloAddebitato, totale, ritenuta, netto: centesimi(totale - ritenuta) };
  }

  /**
   * I parametri per l'anteprima di una bozza: quelli congelati nella fattura del server.
   * Soglia e importo del bollo non arrivano con la fattura: si prendono dalle impostazioni
   * (l'importo, se la bozza ha già il bollo, è quello). È solo l'anteprima: il server rifà tutto.
   */
  function parametriDi(fattura, impostazioni, righe) {
    const imp = impostazioni || {};
    const k = fattura.conti || {};
    return {
      regime: fattura.regime || 'ordinario',
      ivaPercentuale: fattura.ivaPercentuale, eppiPercentuale: fattura.eppiPercentuale, ritenutaPercentuale: fattura.ritenutaPercentuale,
      ritenuta: !!fattura.ritenuta,
      bolloSoglia: vuoto(imp.BOLLO_SOGLIA) ? 77.47 : numero(imp.BOLLO_SOGLIA),
      bolloImporto: numero(k.bollo) > 0 ? numero(k.bollo) : (vuoto(imp.BOLLO_IMPORTO) ? 2 : numero(imp.BOLLO_IMPORTO)),
      bolloRivalsa: fattura.bolloRivalsa !== false,
      righe: (righe || fattura.righe || []).filter(r => r.tipo !== 'bollo').map(r => ({ tipo: r.tipo, quantita: r.quantita, prezzo: r.prezzo, importo: r.importoFisso, tributoCliente: !!r.tributoCliente })),
    };
  }

  const percento = n => C.numero(n) + '%';

  /**
   * Le righe dei conti da mostrare, con le parole di §13. "daConfermare" = la pillola
   * Da confermare (contributo, ritenuta, bollo) finché le regole non sono confermate.
   * Una nota di credito dice "Totale della nota" e "Netto stornato".
   */
  function righeConti(k, fattura, opzioni) {
    const o = opzioni || {};
    const f = fattura || {};
    const nota = f.tipo === 'nota';
    const daConfermare = !o.confermate;
    const forfettario = f.regime === 'forfettario';
    const out = [{ chiave: 'compenso', etichetta: 'Compenso', valore: k.compenso }];
    out.push({ chiave: 'contributo', etichetta: 'Contributo integrativo EPPI ' + percento(f.eppiPercentuale), valore: k.contributo, daConfermare });
    if (!forfettario) out.push({ chiave: 'iva', etichetta: 'IVA ' + percento(f.ivaPercentuale), valore: k.iva });
    if (numero(k.anticipazioni) > 0) out.push({ chiave: 'anticipazioni', etichetta: 'Spese anticipate (senza IVA)', valore: k.anticipazioni });
    if (numero(k.bollo) > 0) {
      out.push({ chiave: 'bollo', etichetta: k.bolloAddebitato > 0 ? 'Marca da bollo' : 'Marca da bollo (a carico dello studio)', valore: k.bolloAddebitato > 0 ? k.bolloAddebitato : 0, daConfermare });
    }
    out.push({ chiave: 'totale', etichetta: nota ? 'Totale della nota' : 'Totale della fattura', valore: k.totale, totale: true });
    if (numero(k.ritenuta) > 0) {
      out.push({ chiave: 'ritenuta', etichetta: 'Ritenuta ' + percento(f.ritenutaPercentuale) + ' (la trattiene il cliente)', valore: -numero(k.ritenuta), daConfermare });
    } else if (!forfettario) {
      out.push({ chiave: 'ritenuta', etichetta: o.privato ? 'Ritenuta: no, è un privato' : 'Ritenuta: no', valore: null, daConfermare });
    }
    out.push({ chiave: 'netto', etichetta: nota ? 'Netto stornato' : 'Netto da incassare', valore: k.netto, netto: true });
    return out;
  }

  // ------------------------------------------------------------------ parole e colori (§13)

  /** Il colore della pillola di uno stato (sempre con la parola). */
  function coloreStato(parola) {
    const p = String(parola || '');
    if (/^Scadut/.test(p) || p === 'Sotto soglia') return 'rosso';
    if (/^Pagat[ao] in parte|^In parte|^Pagato in parte/.test(p)) return 'ambra';
    if (/^Pagat[ao]|^Incassat|^Verificato|^Confermate/.test(p)) return 'verde';
    if (/^Pronta|^Emessa|^Da emettere|^Registrato|^Fatturata|^Ricevuta|^Probabile/.test(p)) return 'blu';
    if (/^Da pagare/.test(p)) return 'blu';
    if (/^Proposta|^Da confermare|^Diversa|^Senza bozza|^Non ancora/.test(p)) return 'giallo';
    return 'grigio';
  }

  /** La parola della riga dello scadenziario (§15.14). */
  function parolaScadenziario(stato) {
    return { previsto: 'Previsto', in_parte: 'In parte', scaduto: 'Scaduto', da_emettere: 'Da emettere', proposto: 'Proposta' }[stato] || 'Previsto';
  }

  /** La parola dello stato di una scadenza di pagamento della commessa (§15.12). */
  function parolaScadenzaPagamento(s) {
    if (s.stato === 'fatturata') return s.fuoriDaWisper ? 'Fatturata fuori da Wisper' : 'Fatturata' + (s.fattura ? ' ' + s.fattura : '');
    if (s.stato === 'incassata') return 'Incassata' + (s.fattura ? ' · ' + s.fattura : '');
    if (s.stato === 'in_bozza') return 'In bozza' + (s.fattura ? ' ' + s.fattura : '');
    return 'Prevista';
  }

  /** La pillola della certezza dell'abbinamento di un XML (§15.7). */
  function pillolaCertezza(doc) {
    const p = doc.proposta || {};
    if (doc.tipo === 'esito') return { testo: 'Esito dello SDI', colore: doc.esito === 'scartata' ? 'rosso' : 'grigio' };
    if (p.azione === 'gia') return { testo: 'Già importata', colore: 'grigio' };
    if (p.azione === 'salta') return { testo: 'Da saltare', colore: 'grigio' };
    if (doc.tipo === 'ricevuta') return { testo: 'Ricevuta', colore: 'blu' };
    return {
      certa: { testo: 'Sicura', colore: 'verde' }, probabile: { testo: 'Probabile', colore: 'blu' },
      diversa: { testo: 'Diversa', colore: 'giallo' }, nessuna: { testo: 'Senza bozza', colore: 'giallo' },
    }[p.certezza] || { testo: 'Senza bozza', colore: 'giallo' };
  }

  /**
   * La scelta già fatta per un documento letto: solo quelle sicure (fase4.md §9.3: il "certa"
   * è già scelto, ma si conferma col pulsante), i doppioni (si saltano), gli esiti che hanno
   * la loro fattura e le fatture ricevute nuove. Probabile, diversa e senza bozza aspettano
   * una scelta esplicita, riga per riga: senza scelta il server le salta.
   */
  function sceltaIniziale(doc) {
    const p = doc.proposta || {};
    if (p.azione === 'gia' || p.azione === 'salta') return 'salta';
    if (doc.tipo === 'esito') return p.azione === 'abbina' ? 'abbina' : 'salta';
    if (doc.tipo === 'ricevuta') return 'nuova';
    if (p.azione === 'abbina' && p.certezza === 'certa') return 'abbina';
    return '';
  }

  /** "IT60X0542811101000000123456" -> "…3456"; "IT…3456" resta. */
  function ibanCoperto(iban) {
    const s = String(iban || '').replace(/\s+/g, '');
    if (!s) return '';
    return '…' + s.slice(-4);
  }

  /** L'IBAN a gruppi di 4 (per leggerlo e copiarlo senza sbagliare). */
  function ibanAGruppi(iban) {
    return String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
  }

  /** Controllo dell'IBAN (modulo 97), come il server: solo per dirlo prima di salvare. */
  function ibanValido(iban) {
    const s = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (s.slice(0, 2) === 'IT' && s.length !== 27) return false;
    const giro = s.slice(4) + s.slice(0, 4);
    let resto = 0;
    for (const ch of giro) {
      const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
      for (const c of v) resto = (resto * 10 + Number(c)) % 97;
    }
    return resto === 1;
  }

  // ------------------------------------------------------------------ Da fatturare: come la mostra il computer

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const nomeMese = aaaamm => { const m = MESI[Number(String(aaaamm).slice(5, 7)) - 1] || ''; return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + String(aaaamm).slice(0, 4); };
  const nRap = n => n === 1 ? '1 rapportino' : n + ' rapportini';

  /**
   * Le righe di un gruppo di Da fatturare come le mostra il computer: i rapportini dello
   * stesso mese diventano UNA voce ("Settembre 2026 · 6 rapportini") con dentro i rapportini
   * e le loro spese (vanno con lui: §15.3); le altre voci restano una per una.
   * Ogni riga ha "voci" = le voci del server che sceglie (tipo, id) e "importo" = la loro somma.
   */
  function righeVista(gruppo) {
    const voci = (gruppo && gruppo.voci) || [];
    const spesePer = {};
    voci.forEach(v => { if (v.tipo === 'spesa' && v.idRapportino) (spesePer[v.idRapportino] = spesePer[v.idRapportino] || []).push(v); });
    const out = [];
    const mesi = {};
    // Fase 5: le spese anticipate di un ticket chiuso "una riga" seguono la voce del ticket (scegliere uno porta l'altro).
    const delTicket = id => voci.filter(v => v.tipo === 'spesa' && v.idTicket && String(v.idTicket) === String(id));
    voci.forEach(v => {
      if (v.tipo === 'spesa' && v.idRapportino && voci.some(x => x.tipo === 'rapportino' && x.id === v.idRapportino)) return;
      if (v.tipo === 'spesa' && v.idTicket && voci.some(x => x.tipo === 'ticket' && String(x.id) === String(v.idTicket))) return;
      if (v.tipo === 'ticket') {
        const spese = delTicket(v.id);
        out.push({ chiave: 'ticket:' + v.id, tipo: 'ticket', voce: v, titolo: v.titolo, spese, voci: [{ tipo: 'ticket', id: v.id }].concat(spese.map(s => ({ tipo: 'spesa', id: s.id }))),
          importo: centesimi(numero(v.importo) + spese.reduce((a, s) => a + numero(s.importo), 0)), pronta: v.pronta !== false, anticipazione: false });
        return;
      }
      if (v.tipo === 'rapportino') {
        const mese = String(v.data).slice(0, 7);
        let m = mesi[mese];
        if (!m) {
          m = { chiave: 'mese:' + gruppo.idCliente + ':' + mese, tipo: 'mese', mese, titolo: '', rapportini: [], voci: [], importo: 0, pronta: true, anticipazione: false };
          mesi[mese] = m;
          out.push(m);
        }
        const spese = spesePer[v.id] || [];
        const conSpese = centesimi(numero(v.importo) + spese.reduce((a, s) => a + numero(s.importo), 0));
        m.rapportini.push({ voce: v, spese, importo: conSpese });
        m.voci.push({ tipo: 'rapportino', id: v.id });
        m.importo = centesimi(m.importo + conSpese);
        m.pronta = m.pronta && v.pronta !== false;
        return;
      }
      out.push({ chiave: v.tipo + ':' + v.id, tipo: v.tipo, voce: v, titolo: v.titolo, voci: [{ tipo: v.tipo, id: v.id }], importo: numero(v.importo), pronta: v.pronta !== false, anticipazione: !!v.anticipazione });
    });
    out.forEach(r => { if (r.tipo === 'mese') r.titolo = nomeMese(r.mese) + ' · ' + nRap(r.rapportini.length); });
    // Ordine del server: scadenze, spese della commessa, rapportini per data, ore. Il mese sta dove c'era il primo rapportino.
    return out;
  }

  /** Quante cose e quanti soldi ci sono fra le voci scelte (le chiavi "tipo:id" dei rapportini, delle spese...). */
  function sommaScelte(righe, scelte) {
    let n = 0;
    let totale = 0;
    righe.forEach(r => {
      if (r.tipo === 'mese') {
        r.rapportini.forEach(x => { if (scelte.has('rapportino:' + x.voce.id)) { n++; totale = centesimi(totale + x.importo); } });
      } else if (scelte.has(r.chiave)) { n++; totale = centesimi(totale + r.importo); }
    });
    return { n, totale };
  }

  /** "Ritenuta sì" / "ritenuta no, privato" del cliente, dalle parole del prototipo. */
  function testoRitenuta(sostituto, privato) {
    return sostituto ? 'ritenuta sì' : (privato ? 'ritenuta no, privato' : 'ritenuta no');
  }

  /** Giorni fra due date aaaa-mm-gg (b - a). */
  function giorniFra(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  }

  /** La fattura che si vede: numero, oppure "W-15" (in grigio) per bozze e pronte. */
  function numeroVisto(f) {
    return f.numero || f.riferimento || ('W-' + f.id);
  }

  /** Le 13 settimane della situazione: l'altezza delle barre fra lo zero (o il minimo) e il massimo. */
  function scalaBarre(valori, soglia) {
    const tutti = valori.concat([numero(soglia), 0]);
    const max = Math.max.apply(null, tutti);
    const min = Math.min.apply(null, tutti);
    const ampiezza = max - min || 1;
    return { max, min, altezza: v => (numero(v) - min) / ampiezza };
  }

  /** "500" e "500,50": un importo scritto come lo scrivono le persone; null se non è un numero. */
  function leggiImporto(testo) {
    const s = String(testo === null || testo === undefined ? '' : testo).trim().replace(/€/g, '').replace(/\s+/g, '');
    if (!s) return null;
    if (!/^-?[\d.,]+$/.test(s)) return null;
    const n = C.num(s);
    return isNaN(n) ? null : centesimi(n);
  }

  /** Una quantità o un prezzo unitario scritto a mano: senza arrotondare (0,7612 €/km resta così); null se non è un numero. */
  function leggiNumero(testo) {
    const s = String(testo === null || testo === undefined ? '' : testo).trim().replace(/€/g, '').replace(/\s+/g, '');
    if (!s || !/^-?[\d.,]+$/.test(s)) return null;
    const n = C.num(s);
    return isNaN(n) ? null : n;
  }

  const RegoleFatture = {
    importoRiga, contiFattura, parametriDi, righeConti,
    coloreStato, parolaScadenziario, parolaScadenzaPagamento, pillolaCertezza, sceltaIniziale,
    ibanCoperto, ibanAGruppi, ibanValido,
    righeVista, sommaScelte, testoRitenuta, giorniFra, numeroVisto, scalaBarre, leggiImporto, leggiNumero, nomeMese,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RegoleFatture;
  else radice.WisperRegoleFatture = RegoleFatture;
})(typeof window !== 'undefined' ? window : globalThis);
