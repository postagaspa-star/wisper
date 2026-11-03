/*
 * Wisper Ufficio: le regole della fase 8, senza niente di grafico (docs/gestionale/fase8.md, §0 sopra a tutto).
 *
 * Le parole e i colori dello stato dei collegamenti (§4.1, §15), i segmenti di Integrazioni (§4.3), il calendario in
 * altre app (§5), l'estratto della ricerca dentro i file (§6), l'importazione di clienti e fornitori (§7.2), le regole
 * della Dashboard (§8: tetti, riquadri, numerini), le funzioni accese (§9.5), il formato del codice commessa
 * (§9.6, casi condivisi in server/prove/casi-numerazioni.json), le impostazioni generali (§9.4), le notifiche (§9.7),
 * la lista di controllo (§11), lo stato del sistema (§9.11) e la prova delle copie (§9.10).
 * Stanno qui da sole perché si provano con Node (prove/fase8.test.js), come le regole delle altre fasi.
 *
 * Le app mostrano; i permessi veri, i controlli e i conti li fa il server.
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);
  const R = radice.WisperRegole || (typeof require === 'function' ? require('./regole.js') : null);

  const due = n => String(n).padStart(2, '0');
  const comeData = x => {
    if (!x) return null;
    if (x instanceof Date) return x;
    const s = String(x);
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00' : s);
    return isNaN(d.getTime()) ? null : d;
  };
  const isoGiorno = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const giorniFra = (a, b) => Math.round((new Date(isoGiorno(b) + 'T12:00:00') - new Date(isoGiorno(a) + 'T12:00:00')) / 86400000);
  const numeroIt = n => String(Math.round(Number(n) * 10) / 10).replace('.', ',');
  const migliaia = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  /** "oggi alle 10:00", "ieri alle 2:31", "il 18/10" (fase8.md §4.1); con l'anno se non è quest'anno. */
  function quandoBreve(istante, oggi) {
    const d = comeData(istante);
    const o = comeData(oggi || new Date());
    if (!d || !o) return '';
    const ora = d.getHours() + ':' + due(d.getMinutes());
    const diff = giorniFra(d, o);
    if (diff === 0) return 'oggi alle ' + ora;
    if (diff === 1) return 'ieri alle ' + ora;
    return 'il ' + due(d.getDate()) + '/' + due(d.getMonth() + 1) + (d.getFullYear() !== o.getFullYear() ? '/' + d.getFullYear() : '');
  }

  /** "stanotte alle 2:30" per le cose della notte (prima delle 7 di oggi), altrimenti come quandoBreve. */
  function quandoNotte(istante, oggi) {
    const d = comeData(istante);
    const o = comeData(oggi || new Date());
    if (!d || !o) return '';
    if (giorniFra(d, o) === 0 && d.getHours() < 7) return 'stanotte alle ' + d.getHours() + ':' + due(d.getMinutes());
    return quandoBreve(istante, oggi);
  }

  /** "01/10" (giorno e mese) o "01/10/2025" se non è quest'anno. */
  function giornoMese(istante, oggi) {
    const d = comeData(istante);
    const o = comeData(oggi || new Date());
    if (!d) return '';
    return due(d.getDate()) + '/' + due(d.getMonth() + 1) + (o && d.getFullYear() !== o.getFullYear() ? '/' + d.getFullYear() : '');
  }

  // ======================================================================= integrazioni (§4)

  /** Le parole dello stato, sempre con il loro colore (§4.1, §15). */
  const STATI = {
    collegato: { parola: 'Collegato', colore: 'verde' },
    da_configurare: { parola: 'Da configurare', colore: 'giallo' },
    errore: { parola: 'Errore', colore: 'rosso' },
    non_collegato: { parola: 'Non collegato', colore: 'tratteggiata' },
    in_corso: { parola: 'In corso', colore: 'blu' },
    scelta: { parola: 'Dipende da una scelta', colore: 'grigio' },
  };

  /** I tre gruppi della pagina (§4.3). */
  const GRUPPI = [['collegati', 'Collegati a Wisper'], ['scelta', 'Dipendono da una scelta'], ['noncollegati', 'Non collegati']];

  /**
   * Lo stato come si mostra: quelli che dipendono da una risposta di Andrea non hanno controlli, quindi hanno la
   * pillola "Dipende da una scelta" (§4.2), a meno che il server non dica altro.
   */
  function statoVisto(i) {
    const s = String((i && i.stato) || 'non_collegato');
    // Il server chiama "dipende" quelli che aspettano una scelta di Andrea (§3.4).
    if (s === 'dipende') return 'scelta';
    if (i && i.gruppo === 'scelta' && (s === 'non_collegato' || s === 'scelta' || s === '')) return 'scelta';
    return STATI[s] ? s : 'non_collegato';
  }

  function pillola(i) { return STATI[statoVisto(i)]; }

  /** Ha un controllo vero dietro: solo allora si scrive "controllato ..." (§4.1: per i Non collegato niente data). */
  const conControllo = i => { const s = statoVisto(i); return s !== 'non_collegato' && s !== 'scelta'; };

  /** "controllato oggi alle 10:00"; vuoto se non c'è un controllo. */
  function quandoControllato(i, oggi) {
    if (!conControllo(i) || !i.controllato) return '';
    return 'controllato ' + quandoBreve(i.controllato, oggi);
  }

  /**
   * "da allora nessun controllo" se l'ultimo controllo è più vecchio del doppio della sua frequenza (§4.1). La frequenza
   * la dice il server (ogniMinuti); senza, niente frase: meglio niente che una frase inventata.
   */
  function vecchio(i, adesso) {
    if (i && i.vecchio === true && conControllo(i)) return 'da allora nessun controllo';
    const ogni = Number(i && (i.ogniMinuti || i.frequenzaMinuti || i.frequenza));
    if (!conControllo(i) || !i.controllato || !(ogni > 0)) return '';
    const d = comeData(i.controllato);
    const a = comeData(adesso || new Date());
    if (!d || !a) return '';
    return (a - d) / 60000 > 2 * ogni ? 'da allora nessun controllo' : '';
  }

  /** Uno solo fallito: resta Collegato, con la frase sotto (§4.1). */
  function unoFallito(i) {
    if (!i || i.stato !== 'collegato') return false;
    if (i.ultimoNonRiuscito === true || Number(i.erroriDiFila) === 1) return true;
    const ultimo = (i.controlli || [])[0];
    return !!(ultimo && ultimo.esito === 'errore');
  }

  /** "412 ms", "8 s", "1,5 s" (tempo di un controllo). */
  function tempo(ms) {
    const n = Number(ms);
    if (!(n >= 0) || ms === null || ms === undefined || ms === '') return '';
    return n < 1000 ? Math.round(n) + ' ms' : numeroIt(n / 1000) + ' s';
  }

  /** Tutti · Collegati · Da sistemare · Non collegati (§4.3). Da sistemare = Errore + Da configurare + Dipende da una scelta. */
  function nelSegmento(i, seg) {
    const s = statoVisto(i);
    if (seg === 'collegati') return s === 'collegato' || (s === 'in_corso' && i.gruppo === 'collegati');
    if (seg === 'sistemare') return s === 'errore' || s === 'da_configurare' || s === 'scelta';
    if (seg === 'noncollegati') return i.gruppo === 'noncollegati' || (s === 'non_collegato' && i.gruppo !== 'scelta');
    return true;
  }

  function numeriIntegrazioni(lista) {
    const l = lista || [];
    return {
      tutti: l.length,
      collegati: l.filter(i => nelSegmento(i, 'collegati')).length,
      sistemare: l.filter(i => nelSegmento(i, 'sistemare')).length,
      noncollegati: l.filter(i => nelSegmento(i, 'noncollegati')).length,
      errori: l.filter(i => statoVisto(i) === 'errore').length,
    };
  }

  /** Si apre su Da sistemare se ce n'è almeno uno in Errore, altrimenti su Tutti (§4.3). */
  function segmentoIniziale(lista) {
    return (lista || []).some(i => statoVisto(i) === 'errore') ? 'sistemare' : 'tutti';
  }

  /** La fascia rossa in cima: il primo in Errore con la sua frase (§4.3). */
  function fascia(lista) {
    const e = (lista || []).find(i => statoVisto(i) === 'errore');
    return e ? { chiave: e.chiave, testo: e.nome + ' · ' + (e.esito || 'gli ultimi due controlli non sono riusciti'), provaAdesso: e.provaAdesso !== false } : null;
  }

  /** Il giallo della pagina di un collegamento: Prova adesso solo se in Errore (§4.3). */
  const provaGialla = i => statoVisto(i) === 'errore';

  /**
   * Nessuna chiave, segreto, token o indirizzo in pagina (§4.4): i testi che il server manda passano di qui. Un
   * indirizzo web o una stringa che sembra una chiave diventano "c'è"; il resto resta com'è.
   */
  function senzaSegreti(testo) {
    return String(testo === null || testo === undefined ? '' : testo)
      .replace(/https?:\/\/[^\s)]+/gi, '(indirizzo)')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '(chiave)');
  }

  // ======================================================================= calendario in altre app (§5)

  /** "ICSx⁵", "Microsoft Outlook", "Google Calendar" dai primi caratteri dello User-Agent (§5.5). */
  function nomeAgente(agente) {
    const a = String(agente || '');
    if (!a) return '';
    if (/icsx/i.test(a)) return 'ICSx⁵';
    if (/outlook|microsoft/i.test(a)) return 'Microsoft Outlook';
    if (/google/i.test(a)) return 'Google Calendar';
    if (/thunderbird/i.test(a)) return 'Thunderbird';
    if (/davx/i.test(a)) return 'DAVx⁵';
    return a.split(/[\s/;(]/)[0].slice(0, 24);
  }

  /** "Le mie cose · ferie e assenze · scadenze". */
  function cosaFeed(cosa) {
    const c = cosa || {};
    return [c.attivita === 'studio' ? 'Tutto lo studio' : 'Le mie cose', c.assenze ? 'ferie e assenze' : '', c.scadenze ? 'scadenze' : ''].filter(Boolean).join(' · ');
  }

  /** "letto oggi alle 9:40 · ICSx⁵" oppure "Mai letto". */
  function letturaFeed(f, oggi) {
    if (!f || !f.ultimoUso) return 'Mai letto';
    return ['letto ' + quandoBreve(f.ultimoUso, oggi), nomeAgente(f.agente)].filter(Boolean).join(' · ');
  }

  const MAX_FEED = 5;

  function erroreNomeFeed(nome, feedMiei) {
    if (!String(nome || '').trim()) return 'Nome: scrivi un nome per riconoscerlo';
    if ((feedMiei || []).filter(f => !f.revocato && !f.revocatoIl).length >= MAX_FEED) return 'Hai già 5 indirizzi: togline uno';
    return '';
  }

  // ======================================================================= ricerca dentro i file (§6)

  /** "…la verifica dell'impianto di [terra] è stata…" -> pezzi, con forte le parole tra parentesi quadre (§6.2). */
  function pezziEstratto(estratto) {
    const s = String(estratto || '');
    const out = [];
    const re = /\[([^\]]*)\]/g;
    let ultimo = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m.index > ultimo) out.push({ testo: s.slice(ultimo, m.index), forte: false });
      if (m[1]) out.push({ testo: m[1], forte: true });
      ultimo = re.lastIndex;
    }
    if (ultimo < s.length) out.push({ testo: s.slice(ultimo), forte: false });
    return out;
  }

  /** "nella rev. 1 (superata)" quando l'ha trovato solo in una revisione superata. */
  function doveTrovato(t) {
    return t && t.superata ? 'nella rev. ' + t.revisione + ' (superata)' : '';
  }

  /** La riga calma della pagina del documento (§6.3). */
  function statoLettura(l, oggi) {
    const x = l || {};
    switch (x.stato) {
      case 'letto': return 'Testo letto il ' + giornoMese(x.letto, oggi) + (x.pagine ? ' · ' + (x.pagine === 1 ? '1 pagina' : x.pagine + ' pagine') : '');
      case 'in_parte': return 'Letto in parte: è molto lungo';
      case 'senza_testo': return 'Senza testo: è una scansione o un disegno';
      case 'non_si_legge': return 'Non si legge';
      case 'troppo_grande': return 'Non letto: il file è troppo grande';
      case 'da_leggere': return 'Da leggere';
      default: return '';
    }
  }

  // ======================================================================= importa ed esporta (§7)

  /** I campi a cui si può abbinare una colonna (§7.2): l'ultima tendina c'è solo con "Lo dice una colonna". */
  const CAMPI_IMPORT = [
    ['', 'Non importare'], ['nome', 'Nome o ragione sociale'], ['partitaIva', 'Partita IVA'], ['codiceFiscale', 'Codice fiscale'],
    ['codiceSdi', 'Codice SDI'], ['pec', 'PEC'], ['email', 'Email'], ['telefono', 'Telefono'], ['indirizzo', 'Indirizzo'], ['cap', 'CAP'],
    ['citta', 'Città'], ['provincia', 'Provincia'], ['nazione', 'Nazione'], ['note', 'Note'], ['tipo', 'Cliente o fornitore'],
  ];
  const TIPI_IMPORT = [['clienti', 'Sono clienti'], ['fornitori', 'Sono fornitori'], ['colonna', 'Lo dice una colonna']];

  /** Il giallo del passo 4: "Importa 42 e completa 7" (§7.2). */
  function testoImporta(nuovi, completati) {
    const n = Number(nuovi) || 0;
    const c = Number(completati) || 0;
    if (n && c) return 'Importa ' + n + ' e completa ' + c;
    if (n) return 'Importa ' + n;
    if (c) return 'Completa ' + c;
    return 'Importa';
  }

  /** "Importati 42 clienti, completati 7, saltati 3". */
  function esitoImport(imp, tipo) {
    const x = imp || {};
    const chi = tipo === 'fornitori' ? 'fornitori' : tipo === 'colonna' ? 'clienti e fornitori' : 'clienti';
    return 'Importati ' + (Number(x.nuovi) || 0) + ' ' + chi + ', completati ' + (Number(x.completati) || 0) + ', saltati ' + (Number(x.saltati) || 0);
  }

  /** L'importazione si fa solo se il nome c'è fra le colonne (e la colonna del tipo, se lo dice una colonna). */
  function erroreColonne(colonne, tipo) {
    const campi = (colonne || []).map(c => c.campo).filter(Boolean);
    if (campi.indexOf('nome') < 0) return 'Scegli quale colonna è il nome';
    if (tipo === 'colonna' && campi.indexOf('tipo') < 0) return 'Scegli quale colonna dice se è cliente o fornitore';
    const doppi = campi.filter((c, i) => campi.indexOf(c) !== i);
    if (doppi.length) return (CAMPI_IMPORT.find(x => x[0] === doppi[0]) || ['', doppi[0]])[1] + ': l\'hai scelto per due colonne';
    return '';
  }

  // Il campo con l'articolo, dalla chiave (i dati di esempio) o dal nome che manda il server ("Codice destinatario").
  const ARTICOLI_CAMPI = { partitaIva: 'la partita IVA', codiceFiscale: 'il codice fiscale', codiceSdi: 'il codice SDI', pec: 'la PEC', email: "l'email", telefono: 'il telefono',
    indirizzo: "l'indirizzo", cap: 'il CAP', citta: 'la città', provincia: 'la provincia', nazione: 'la nazione', note: 'le note',
    'partita iva': 'la partita IVA', 'codice fiscale': 'il codice fiscale', 'codice destinatario': 'il codice destinatario', 'codice sdi': 'il codice SDI', 'città': 'la città' };

  /** "Si aggiunge il codice SDI e la PEC: il resto c'è già" (campi del server già a parole, o le chiavi). */
  function campiDaCompletare(campi) {
    const l = (campi || []).map(c => ARTICOLI_CAMPI[c] || ARTICOLI_CAMPI[String(c).toLowerCase()] || String(c).toLowerCase()).filter(Boolean);
    if (!l.length) return 'Si completano solo i campi vuoti';
    return 'Si aggiunge ' + (l.length === 1 ? l[0] : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1]) + ": il resto c'è già";
  }

  /** "3,3 MB", "640 KB". */
  function grandezza(byte) {
    const b = Number(byte) || 0;
    if (b >= 1000000) return numeroIt(b / 1000000) + ' MB';
    if (b >= 1000) return Math.round(b / 1000) + ' KB';
    return b + ' byte';
  }

  // ======================================================================= Dashboard (§8)

  const TETTI = { urgenti: 7, settimana: 7, pianificare: 5 };
  const SEZIONI = [['urgenti', 'Urgenti'], ['settimana', 'Questa settimana'], ['pianificare', 'Da pianificare']];
  const AREE = [['tutto', 'Tutto'], ['lavoro', 'Lavoro'], ['soldi', 'Soldi'], ['persone', 'Persone e mezzi'], ['documenti', 'Documenti e ticket'], ['clienti', 'Clienti e portale'], ['sistema', 'Sistema']];

  /** Quante voci restano sotto la sezione ("Altre 6"): il server dà le prime e quante sono in tutto (§8.2 punto 3). */
  function altre(mostrate, quante) {
    const n = (Number(quante) || 0) - (Number(mostrate) || 0);
    return n > 0 ? n : 0;
  }

  /**
   * I riquadri tra cui scegliere (§8.4), col nome e la regola di permesso della loro fase. Il server controlla di nuovo
   * ("Questo riquadro non è per il tuo ruolo"): qui si mostra solo quello che ha senso proporre.
   */
  const RIQUADRI = {
    commesseAperte: { nome: 'commesse aperte', titolo: 'Commesse aperte', puo: p => p('commesse') },
    commesseInRitardo: { nome: 'commesse in ritardo', titolo: 'Commesse in ritardo', puo: p => p('commesse'), rosso: true },
    daFatturare: { nome: 'da fatturare', titolo: 'Da fatturare', puo: p => p('fatturazione') && p('costi') },
    daIncassare: { nome: 'da incassare', titolo: 'Da incassare', puo: p => p('fatturazione') && p('costi') },
    scaduto: { nome: 'scaduto', titolo: 'Scaduto', puo: p => p('fatturazione') && p('costi'), rosso: true },
    nelConto: { nome: 'nel conto', titolo: 'Nel conto', puo: p => p('banche') && p('costi') },
    ticketAperti: { nome: 'ticket aperti', titolo: 'Ticket aperti', puo: p => p('ticket') },
    interventiOggi: { nome: 'interventi oggi', titolo: 'Interventi oggi', puo: p => p('ticket') },
    scadenzeVicine: { nome: 'scadenze vicine', titolo: 'Scadenze vicine', puo: p => p('documenti') || p('persone') },
    assentiOggi: { nome: 'assenti oggi', titolo: 'Assenti oggi', puo: p => p('persone') },
    daApprovare: { nome: 'da approvare', titolo: 'Da approvare', puo: (p, io) => !!io.approva },
    tarateScadute: { nome: 'tarature scadute', titolo: 'Tarature scadute', puo: (p, io) => p('mezzi') && io.ruolo !== 'collaboratore', rosso: true },
    dalPortale: { nome: 'dal portale', titolo: 'Dal portale', puo: p => p('portale') },
    daMandareOggi: { nome: 'da mandare oggi', titolo: 'Da mandare oggi', puo: p => p('comunicazioni') },
    oreSettimana: { nome: 'ore della settimana', titolo: 'Ore della settimana', puo: p => p('rapportini', 2) },
    attivitaOggi: { nome: 'attività di oggi', titolo: 'Attività di oggi', puo: p => p('attivita') },
    mieiTicket: { nome: 'i miei ticket', titolo: 'I miei ticket', puo: p => p('ticket', 2) },
    preventiviInAttesa: { nome: 'preventivi in attesa', titolo: 'Preventivi in attesa', puo: p => p('preventivi') },
  };
  const ORDINE_RIQUADRI = Object.keys(RIQUADRI);

  /** I quattro di base per ruolo (§8.4). */
  const RIQUADRI_BASE = {
    titolare: ['daFatturare', 'scaduto', 'ticketAperti', 'daApprovare'],
    amministrazione: ['daFatturare', 'daIncassare', 'scaduto', 'scadenzeVicine'],
    collaboratore: ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'daMandareOggi'],
    lettura: ['commesseAperte', 'daFatturare', 'daIncassare', 'scaduto'],
  };

  /** Quelli che la persona può scegliere: la lista del server se c'è, altrimenti le regole qui sopra. */
  function riquadriPossibili(permessi, io, dalServer) {
    if (Array.isArray(dalServer) && dalServer.length) return dalServer.map(x => (typeof x === 'string' ? x : x.chiave)).filter(k => RIQUADRI[k]);
    const p = (m, l) => R.puo(permessi, m, l);
    const chi = Object.assign({ ruolo: '', approva: false }, io || {});
    return ORDINE_RIQUADRI.filter(k => RIQUADRI[k].puo(p, chi));
  }

  /** Il numero del riquadro: euro, ore o un conteggio. */
  function numeroRiquadro(r) {
    const x = r || {};
    if (x.unita === 'euro') return C.euro(x.numero);
    if (x.unita === 'ore') return C.numero(x.numero) + ' h';
    return String(Number(x.numero) || 0);
  }

  /** Il rosso solo per Scaduto, Commesse in ritardo, Tarature scadute, sopra zero (§8.4). */
  function rossoRiquadro(r) {
    const x = r || {};
    if (x.rosso !== undefined) return !!x.rosso && Number(x.numero) > 0;
    return !!(RIQUADRI[x.chiave] && RIQUADRI[x.chiave].rosso) && Number(x.numero) > 0;
  }

  function erroreRiquadri(scelti) {
    const s = scelti || [];
    if (s.length !== 4) return 'Scegline 4: ne hai scelti ' + s.length;
    if (new Set(s).size !== 4) return 'Scegline 4 diversi';
    return '';
  }

  /** Un tocco: se c'è lo toglie, se non c'è e ce ne sono meno di 4 lo aggiunge in fondo (l'ordine è quello del tocco). */
  function toccaRiquadro(scelti, chiave) {
    const s = (scelti || []).slice();
    const i = s.indexOf(chiave);
    if (i >= 0) s.splice(i, 1);
    else if (s.length < 4) s.push(chiave);
    return s;
  }

  /** Il numerino: le cose che aspettano te, oltre 99 "99+" (§8.6); zero = niente. */
  function numerino(n) {
    const x = Number(n) || 0;
    if (x <= 0) return '';
    return x > 99 ? '99+' : String(x);
  }

  /** "7 cose da approvare" con le tre righe (§8.2 punto 5): dal dettaglio del server o dai numeri che ha. */
  function righeApprovare(v) {
    const parti = (v && v.parti) || [];
    if (parti.length) return parti;
    return [];
  }

  // ======================================================================= funzioni accese (§9.5)

  /**
   * Le funzioni e cosa cambia se si spengono (§9.5). Dal 03/11/2026 si spengono tutte e 19 (Manuel: "nessuna obbligatoria"),
   * con le dipendenze del server (amministrazione8.js): richiede = senza quelle non lavora (una commessa vuole un cliente, un
   * progetto una commessa). Le frasi le manda il server (cosaCambia); queste servono solo se non le manda.
   */
  const FUNZIONI = [
    { modulo: 'dashboard', nome: 'Dashboard', richiede: [], cosaCambia: 'Sparisce dal menu di tutti: Wisper si apre sulla prima voce accesa. I dati restano.' },
    { modulo: 'clienti', nome: 'Clienti e fornitori', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; non si creano clienti nuovi. I dati restano.' },
    { modulo: 'commesse', nome: 'Commesse', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti; i rapportini non chiedono più la commessa. I dati restano.' },
    { modulo: 'progetti', nome: 'Progetti', richiede: ['commesse'], cosaCambia: 'Sparisce dal menu di tutti; i rapportini non chiedono più il progetto. I dati restano.' },
    { modulo: 'preventivi', nome: 'Preventivi', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
    { modulo: 'attivita', nome: 'Attività e calendario', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; niente promemoria delle attività. I dati restano.' },
    { modulo: 'rapportini', nome: 'Ore e rapportini', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti; non si scrivono rapportini né ore. I dati restano.' },
    { modulo: 'spese', nome: 'Spese e trasferte', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
    { modulo: 'fatturazione', nome: 'Fatturazione', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
    { modulo: 'banche', nome: 'Banche e scadenze', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. Segnare un incasso da una fattura funziona lo stesso. I dati restano.' },
    { modulo: 'persone', nome: 'Persone', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
    { modulo: 'documenti', nome: 'Documenti', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
    { modulo: 'ticket', nome: 'Ticket e assistenza', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti. I dati restano.' },
    { modulo: 'mezzi', nome: 'Mezzi e attrezzature', richiede: [], cosaCambia: 'Sparisce dal menu di tutti. Nei rapportini non si scelgono più gli strumenti. I dati restano.' },
    { modulo: 'comunicazioni', nome: 'WhatsApp e comunicazioni', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti; niente proposte di messaggi. La campanella apre lo stesso le notifiche. I dati restano.' },
    { modulo: 'portale', nome: 'Portale clienti', richiede: ['clienti'], cosaCambia: 'Sparisce dal menu di tutti e il portale si spegne subito per i clienti. I dati restano.' },
    { modulo: 'collaboratori', nome: 'Collaboratori esterni', richiede: ['commesse'], cosaCambia: 'Sparisce dal menu di tutti; gli esterni non vedono più le loro cose. I dati restano.' },
    { modulo: 'integrazioni', nome: 'Integrazioni', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; i collegamenti già fatti continuano a lavorare. I dati restano.' },
    { modulo: 'amministrazione', nome: 'Amministrazione', richiede: [], cosaCambia: 'Sparisce dal menu di tutti; al titolare resta Funzioni, per riaccenderla. I dati restano.' },
  ];
  /** Le funzioni per modulo: {nome, cosaCambia, richiede}. */
  const SPEGNIBILI = {};
  FUNZIONI.forEach(f => { SPEGNIBILI[f.modulo] = { nome: f.nome, cosaCambia: f.cosaCambia, richiede: f.richiede.slice() }; });
  const ORDINE_FUNZIONI = FUNZIONI.map(f => f.modulo);
  const nelleFunzioni = lista => ORDINE_FUNZIONI.filter(m => lista.indexOf(m) >= 0);

  /** Le funzioni che hanno bisogno di questa (anche passando da un'altra): si spengono con lei (come serveA del server). */
  function chiLaUsa(modulo) {
    const out = [];
    const giro = m => FUNZIONI.forEach(f => { if (f.richiede.indexOf(m) >= 0 && out.indexOf(f.modulo) < 0) { out.push(f.modulo); giro(f.modulo); } });
    giro(modulo);
    return nelleFunzioni(out);
  }

  /** Le funzioni di cui questa ha bisogno (anche passando da un'altra): si accendono con lei (come richiede del server). */
  function diCosaHaBisogno(modulo) {
    const out = [];
    const giro = m => { const f = FUNZIONI.find(x => x.modulo === m); (f ? f.richiede : []).forEach(r => { if (out.indexOf(r) < 0) { out.push(r); giro(r); } }); };
    giro(modulo);
    return nelleFunzioni(out);
  }

  function domandaSpegni(f) {
    const x = f || {};
    const s = SPEGNIBILI[x.modulo] || {};
    const nome = x.nome || s.nome || x.modulo;
    return { titolo: 'Spegnere ' + nome + '?', testo: x.cosaCambia || s.cosaCambia || 'Sparisce dal menu di tutti. I dati restano.' };
  }

  /**
   * Il foglio di conferma prima di cambiare una funzione (accordo §5): spegnendo, cosaCambia e "Si spengono anche: …" (le
   * serveA ancora accese); accendendo, "Si accendono anche: …" (le richiede ancora spente). funzioni: l'elenco del server
   * (accesa, serveA, richiede, nome); senza serveA/richiede valgono le dipendenze scritte qui.
   * -> {titolo, testo, anche: [nomi], fraseAnche, pulsante}
   */
  function domandaCambio(f, accesa, funzioni) {
    const x = f || {};
    const l = funzioni || [];
    const s = SPEGNIBILI[x.modulo] || {};
    const nome = x.nome || s.nome || x.modulo;
    const nomeDi = m => { const y = l.find(z => z.modulo === m); return (y && y.nome) || (SPEGNIBILI[m] || {}).nome || m; };
    const accesaOra = m => { const y = l.find(z => z.modulo === m); return !y || y.accesa !== false; };
    if (accesa) {
      const servono = (Array.isArray(x.richiede) ? x.richiede : diCosaHaBisogno(x.modulo)).filter(m => !accesaOra(m));
      const anche = servono.map(nomeDi);
      return { titolo: 'Accendere ' + nome + '?', testo: 'Torna nel menu di chi ha il permesso. I dati sono come prima.', anche,
        fraseAnche: anche.length ? 'Si accendono anche: ' + anche.join(', ') : '', pulsante: 'Accendi' };
    }
    const usano = (Array.isArray(x.serveA) ? x.serveA : chiLaUsa(x.modulo)).filter(accesaOra);
    const anche = usano.map(nomeDi);
    return { titolo: 'Spegnere ' + nome + '?', testo: x.cosaCambia || s.cosaCambia || 'Sparisce dal menu di tutti. I dati restano.', anche,
      fraseAnche: anche.length ? 'Si spengono anche: ' + anche.join(', ') : '', pulsante: 'Spegni' };
  }

  /** L'avviso dopo il salvataggio: "Commesse spenta, e anche Progetti e Collaboratori esterni: i dati restano". */
  function avvisoCambio(nome, accesa, anche) {
    const altri = (anche || []).map(a => (typeof a === 'string' ? a : a.nome || a.modulo)).filter(Boolean);
    const con = altri.length ? ', e anche ' + (altri.length === 1 ? altri[0] : altri.slice(0, -1).join(', ') + ' e ' + altri[altri.length - 1]) : '';
    return accesa ? nome + ' riaccesa' + con + ': i dati sono come prima' : nome + ' spenta' + con + ': i dati restano';
  }

  /** "13 di 18 · Portale clienti spento" (§9.2). */
  function rigaFunzioni(funzioni) {
    const l = funzioni || [];
    const spente = l.filter(f => f.accesa === false);
    const accese = l.length - spente.length;
    return accese + ' di ' + l.length + (spente.length ? ' · ' + spente.map(f => f.nome).join(', ') + (spente.length === 1 ? ' spento' : ' spenti') : '');
  }

  /** Le voci del menu senza i moduli spenti (io.interfaccia.funzioniSpente). */
  function senzaSpente(voci, spente) {
    const s = Array.isArray(spente) ? spente : [];
    return (voci || []).filter(v => s.indexOf(v.modulo) < 0);
  }

  // ======================================================================= numerazioni (§9.6)

  /**
   * Il codice dal formato: {AA} anno a due cifre, {AAAA} a quattro, {N...} il numero con almeno tante cifre (non si
   * taglia mai: col 1000 e {NNN} viene 1000). È la stessa funzione del server e del telefono (casi-numerazioni.json).
   */
  function codiceDa(formato, anno, numero) {
    if (R && R.codiceDa) return R.codiceDa(formato, anno, numero);
    return String(formato || '').replace(/\{(A{2,4}|N+)\}/g, (_, p) => {
      if (p[0] === 'A') return p.length >= 4 ? String(anno) : String(Number(anno) % 100).padStart(2, '0');
      return String(numero).padStart(p.length, '0');
    });
  }

  /** Il numero dentro un codice fatto con un formato (anche di prima): "26ST047" -> 47, "ST26-0048" -> 48. */
  function numeroDa(codice) {
    const m = String(codice || '').match(/(\d+)\D*$/);
    return m ? Number(m[1]) : 0;
  }

  /**
   * Il prossimo numero: continua dal più alto, anche se i codici di prima hanno un altro formato (§9.6: "il numero
   * continua da 48"); due commesse di fila senza rete prendono 48 e 49.
   */
  function prossimoNumero(ultimo, usati) {
    const max = (usati || []).reduce((m, c) => Math.max(m, typeof c === 'number' ? c : numeroDa(c)), Number(ultimo) || 0);
    return max + 1;
  }

  /**
   * Il formato del codice commessa dai pezzi della pagina (§9.6): Anno (26 · 2026 · niente), Testo, Ordine (anno prima
   * · testo prima), Separatore (niente · - · /), Cifre (3 · 4). Senza anno l'ordine non conta.
   */
  function formatoCommessa(p) {
    const x = Object.assign({ anno: '26', testo: 'ST', ordine: 'anno', sep: '', cifre: 3 }, p || {});
    const a = x.anno === '2026' || x.anno === 4 || x.anno === 'AAAA' ? '{AAAA}' : x.anno === '' || x.anno === null || x.anno === 'niente' ? '' : '{AA}';
    const t = String(x.testo || '').replace(/[{}]/g, '');
    const testa = x.ordine === 'testo' ? t + a : a + t;
    const sep = x.sep === '-' || x.sep === '/' ? x.sep : '';
    return testa + (testa && sep ? sep : '') + '{' + 'N'.repeat(Number(x.cifre) === 4 ? 4 : 3) + '}';
  }

  /** Il contrario: i pezzi da un formato; null se il formato non si fa con questi pezzi (allora si cambia altrove). */
  function pezziCommessa(formato) {
    const pezzi = R.pezziFormato(formato);
    if (!pezzi.length) return null;
    const ultimo = pezzi[pezzi.length - 1];
    if (ultimo.tipo !== 'numero' || (ultimo.cifre !== 3 && ultimo.cifre !== 4)) return null;
    const prima = pezzi.slice(0, -1).map(p => Object.assign({}, p));
    let sep = '';
    const coda = prima[prima.length - 1];
    if (coda && coda.tipo === 'testo' && /[-/]$/.test(coda.testo)) {
      sep = coda.testo.slice(-1);
      coda.testo = coda.testo.slice(0, -1);
      if (!coda.testo) prima.pop();
    }
    const anni = prima.filter(p => p.tipo === 'anno');
    const testi = prima.filter(p => p.tipo === 'testo');
    if (anni.length > 1 || testi.length > 1 || prima.length > 2) return null;
    const x = { anno: anni.length ? (anni[0].cifre === 4 ? '2026' : '26') : '', testo: testi.length ? testi[0].testo : '', ordine: prima.length === 2 && prima[0].tipo === 'testo' ? 'testo' : 'anno', sep, cifre: ultimo.cifre };
    return formatoCommessa(x) === formato ? x : null;
  }

  /** "Le commesse di prima restano come sono: 26ST001 … 26ST047. Il numero continua da 48." */
  function frasePrima(primo, ultimo, prossimo) {
    if (!ultimo) return 'Il numero parte da ' + prossimo + '.';
    return 'Le commesse di prima restano come sono: ' + (primo && primo !== ultimo ? primo + ' … ' : '') + ultimo + '. Il numero continua da ' + prossimo + '.';
  }

  /** "continua" / "riparte a gennaio" (§9.6). */
  const comeContinua = n => (n && n.annuale ? 'riparte a gennaio' : 'continua');

  const NOMI_NUMERAZIONI = { commessa: 'Commesse', rapportino: 'Rapportini', preventivo: 'Preventivi', ticket: 'Ticket', contratto: 'Contratti di assistenza', incarico: 'Incarichi agli esterni', attrezzatura: 'Attrezzature' };
  const ORDINE_NUMERAZIONI = ['commessa', 'rapportino', 'preventivo', 'ticket', 'contratto', 'incarico', 'attrezzatura'];

  // ======================================================================= impostazioni generali (§9.4)

  /** Un numero scritto alla italiana: "0,76" -> 0.76, "3.000" -> 3000; null se non è un numero. */
  function numeroScritto(t) {
    const s = String(t === null || t === undefined ? '' : t).trim().replace(/\s/g, '');
    if (!s) return null;
    const pulito = /,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
    const n = Number(pulito);
    return isFinite(n) ? n : null;
  }

  /** Il valore come si scrive nel campo: 0.76 -> "0,76", 3000 -> "3000". */
  function numeroCampo(v) {
    if (v === null || v === undefined || v === '') return '';
    const n = Number(v);
    return isFinite(n) ? String(n).replace('.', ',') : String(v);
  }

  /** L'errore di una voce col nome davanti ("Ore al giorno: da 1 a 12"), vuoto se va bene. */
  function erroreVoce(v, testo) {
    const x = v || {};
    const nome = x.nomeBreve || x.etichetta || x.chiave;
    if (x.tipo !== 'numero') return '';
    const s = String(testo === null || testo === undefined ? '' : testo).trim();
    if (!s) return x.vuoto ? '' : nome + ': scrivi un numero';
    const n = numeroScritto(s);
    if (n === null) return nome + ': scrivi un numero';
    const min = x.min !== undefined && x.min !== null ? Number(x.min) : null;
    const max = x.max !== undefined && x.max !== null ? Number(x.max) : null;
    if ((min !== null && n < min) || (max !== null && n > max)) {
      return nome + ': ' + (min !== null && max !== null ? 'da ' + numeroCampo(min) + ' a ' + numeroCampo(max) : min !== null ? 'almeno ' + numeroCampo(min) : 'al massimo ' + numeroCampo(max));
    }
    if (x.intero && Math.round(n) !== n) return nome + ': scrivi un numero intero';
    return '';
  }

  const PRIORITA = [['urgente', 'Urgente'], ['alta', 'Alta'], ['normale', 'Normale'], ['bassa', 'Bassa']];

  /** TICKET_TEMPI: l'intervento non prima della presa in carico (§9.4). */
  function erroreTempi(t, righe) {
    const x = t || {};
    for (const [k, nome] of (Array.isArray(righe) && righe.length ? righe : PRIORITA)) {
      const r = x[k] || {};
      const presa = Number(r.presa);
      const intervento = Number(r.intervento);
      if (!(presa > 0) || !(intervento > 0)) return 'Tempi dei ticket: scrivi le ore di ' + nome;
      if (intervento < presa) return 'Tempi dei ticket: per ' + nome + ' l\'intervento non può venire prima della presa in carico';
    }
    return '';
  }

  /** Cerca un'impostazione: per etichetta o per nome della scheda, senza badare a maiuscole e accenti. */
  function filtraGruppi(gruppi, testo) {
    const piano = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const t = piano(testo).trim();
    if (!t) return gruppi || [];
    return (gruppi || []).map(g => {
      const tutto = piano(g.nome).indexOf(t) >= 0;
      const voci = (g.voci || []).filter(v => tutto || piano(v.etichetta).indexOf(t) >= 0);
      const coll = (g.collegamenti || []).filter(c => tutto || piano(c.nome).indexOf(t) >= 0);
      return voci.length || coll.length ? Object.assign({}, g, { voci, collegamenti: coll }) : null;
    }).filter(Boolean);
  }

  /** "62 impostazioni in 11 gruppi". */
  function rigaImpostazioni(gruppi) {
    const g = gruppi || [];
    const n = g.reduce((s, x) => s + (x.voci || []).length, 0);
    return n + (n === 1 ? ' impostazione' : ' impostazioni') + ' in ' + g.length + (g.length === 1 ? ' gruppo' : ' gruppi');
  }

  // ======================================================================= notifiche (§9.7)

  const NOMI_NOTIFICHE = {
    assegnato: 'Ti hanno assegnato qualcosa', da_mandare: 'Messaggi da mandare oggi',
    richiesta_portale: 'Richieste dal portale', messaggio_portale: 'Messaggi dal portale', file_portale: 'File dai clienti',
    preventivo_accettato: 'Preventivi accettati', preventivo_rifiutato: 'Preventivi non accettati', domanda: 'Domande dei clienti',
    rapportino_firmato: 'Rapportini firmati nel portale', segnalazione: 'Segnalazioni dei clienti',
    portale_irraggiungibile: 'Il portale non si raggiunge', integrazione_errore: 'Un collegamento in Errore', copia_non_riuscita: 'La copia non è riuscita',
    ripristino_da_provare: 'Prova il ripristino', esportazione_pronta: 'Il file con tutti i dati è pronto', importazione_finita: 'Importazione finita',
  };
  const GRUPPI_NOTIFICHE = [
    ['Lavoro', ['assegnato', 'da_mandare']],
    ['Clienti e portale', ['richiesta_portale', 'messaggio_portale', 'file_portale', 'preventivo_accettato', 'preventivo_rifiutato', 'domanda', 'rapportino_firmato', 'segnalazione']],
    ['Sistema', ['portale_irraggiungibile', 'integrazione_errore', 'copia_non_riuscita', 'ripristino_da_provare']],
    ['Per te', ['esportazione_pronta', 'importazione_finita']],
  ];

  /** Si vedono solo i tipi che la persona può ricevere: quelli che il server mette in "tipi" (§9.7). */
  function gruppiNotifiche(tipi) {
    const t = tipi || {};
    const noti = GRUPPI_NOTIFICHE.map(([nome, chiavi]) => ({ nome, tipi: chiavi.filter(k => Object.prototype.hasOwnProperty.call(t, k)).map(k => ({ chiave: k, nome: NOMI_NOTIFICHE[k], acceso: t[k] !== false })) }));
    const conosciuti = new Set([].concat.apply([], GRUPPI_NOTIFICHE.map(g => g[1])));
    const altri = Object.keys(t).filter(k => !conosciuti.has(k));
    if (altri.length) noti.push({ nome: 'Altro', tipi: altri.map(k => ({ chiave: k, nome: NOMI_NOTIFICHE[k] || k.replace(/_/g, ' '), acceso: t[k] !== false })) });
    return noti.filter(g => g.tipi.length);
  }

  /** Le email degli avvisi: una o più, separate da virgole; vuoto = nessun errore. */
  function erroreEmailAvvisi(testo) {
    const lista = String(testo || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    if (!lista.length) return 'Avvisi del server a: scrivi almeno un\'email';
    const sbagliata = lista.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    return sbagliata ? 'Avvisi del server a: ' + sbagliata + ' non è un\'email' : '';
  }

  function erroreOra(testo) {
    return /^([01]?\d|2[0-3])[:.][0-5]\d$/.test(String(testo || '').trim()) ? '' : 'Ora del riepilogo: scrivi l\'ora, per esempio 8:00';
  }

  // Un giorno dell'anno senza l'anno (tipo "giorno_mese" del server, "MM-GG"): la Festa del patrono.
  const MESI_ANNO = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI_MESE = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /** Dalle due tendine al valore del server: '' se nessuna delle due, null se ne manca una. */
  function giornoMeseDa(giorno, mese) {
    const g = String(giorno || ''), m = String(mese || '');
    if (!g && !m) return '';
    if (!g || !m) return null;
    return m.padStart(2, '0') + '-' + g.padStart(2, '0');
  }

  /** '' = va bene (anche vuoto); il 29 febbraio c'è, il 31 aprile no. */
  function erroreGiornoMese(valore, etichetta) {
    if (valore === '' || valore === undefined) return '';
    const m = String(valore === null ? '' : valore).match(/^(\d{2})-(\d{2})$/);
    const mese = m ? Number(m[1]) : 0;
    const giorno = m ? Number(m[2]) : 0;
    if (!m || !GIORNI_MESE[mese - 1] || giorno < 1) return etichetta + ': scegli il giorno e il mese';
    if (giorno > GIORNI_MESE[mese - 1]) return etichetta + ': il ' + giorno + ' ' + MESI_ANNO[mese - 1] + ' non c\'è';
    return '';
  }

  // ======================================================================= lista di controllo (§11)

  const STATI_CONTROLLO = {
    da_fare: { parola: 'Da fare', colore: 'giallo' },
    fatto: { parola: 'Fatto', colore: 'verde' },
    non_va: { parola: 'Non va', colore: 'rosso' },
    da_rifare: { parola: 'Da rifare', colore: 'ambra' },
    attesa: { parola: 'In attesa di una scelta', colore: 'grigio' },
  };
  const TIPI_CONTROLLO = { automatica: 'Automatica', server: 'Dal server', a_mano: 'A mano', prova_generale: 'Prova generale' };

  /** Una riga automatica segnata con un server di versione diversa torna Da rifare (§11.1). */
  function statoControllo(r, versioneServer) {
    const x = r || {};
    if (x.stato === 'da_rifare' || x.daRifare) return 'da_rifare';
    if (x.stato === 'fatto' && x.tipo === 'automatica' && versioneServer && x.versione && x.versione !== versioneServer) return 'da_rifare';
    return STATI_CONTROLLO[x.stato] ? x.stato : 'da_fare';
  }

  /** "41 di 58 fatti · 2 non vanno · 3 in attesa di una scelta". */
  function riassuntoControlli(r) {
    const x = r || {};
    const nv = Number(x.nonVanno) || 0;
    const at = Number(x.attesa) || 0;
    return (Number(x.fatti) || 0) + ' di ' + (Number(x.totale) || 0) + ' fatti · ' + nv + (nv === 1 ? ' non va' : ' non vanno') + ' · ' + at + ' in attesa di una scelta';
  }

  /** Il riassunto contato dalle righe (se il server non lo manda). */
  function contaControlli(gruppi, versioneServer) {
    const righe = [].concat.apply([], (gruppi || []).map(g => g.righe || []));
    const st = righe.map(r => statoControllo(r, versioneServer));
    return { fatti: st.filter(s => s === 'fatto').length, totale: righe.length, nonVanno: st.filter(s => s === 'non_va').length, attesa: st.filter(s => s === 'attesa').length };
  }

  /** Tutte · Da fare · Non vanno · Fatte (§15.1). */
  function filtraControlli(gruppi, seg, versioneServer) {
    const ok = r => {
      const s = statoControllo(r, versioneServer);
      if (seg === 'dafare') return s === 'da_fare' || s === 'da_rifare';
      if (seg === 'nonvanno') return s === 'non_va';
      if (seg === 'fatte') return s === 'fatto';
      return true;
    };
    return (gruppi || []).map(g => Object.assign({}, g, { righe: (g.righe || []).filter(ok) })).filter(g => g.righe.length);
  }

  /** "Andrea · 05/11" sotto un Fatto (§11.1). */
  function chiQuando(r, oggi) {
    const x = r || {};
    return [x.utente ? String(x.utente).split(' ')[0] : x.chi || '', x.il ? giornoMese(x.il, oggi) : ''].filter(Boolean).join(' · ');
  }

  const segnabile = r => !!r && r.tipo !== 'server';

  // ======================================================================= stato del sistema e copie (§9.10, §9.11)

  /** "12 giorni", "1 giorno", "3 ore", "pochi minuti". */
  function accesoDa(istante, adesso) {
    const d = comeData(istante);
    const a = comeData(adesso || new Date());
    if (!d || !a) return '';
    const min = (a - d) / 60000;
    if (min < 60) return 'pochi minuti';
    if (min < 60 * 24) { const o = Math.floor(min / 60); return o === 1 ? '1 ora' : o + ' ore'; }
    const g = Math.floor(min / 1440);
    return g === 1 ? '1 giorno' : g + ' giorni';
  }

  /**
   * L'ora del NAS confrontata con quella di questo dispositivo (§9.11): oltre 2 minuti la frase ambra. diffSecondi =
   * ora del NAS meno ora del dispositivo (negativo: il NAS è indietro).
   */
  function fraseOra(diffSecondi, oraNas) {
    const d = Number(diffSecondi) || 0;
    const ora = oraNas ? (() => { const x = comeData(oraNas); return x ? x.getHours() + ':' + due(x.getMinutes()) : ''; })() : '';
    if (Math.abs(d) <= 120) return { ambra: false, testo: (ora ? ora + ', ' : '') + 'uguale a questo dispositivo' };
    const min = Math.round(Math.abs(d) / 60);
    const quanto = min < 60 ? (min === 1 ? '1 minuto' : min + ' minuti') : (Math.round(min / 6) / 10 === 1 ? '1 ora' : numeroIt(min / 60) + ' ore');
    return { ambra: true, testo: 'L\'ora del NAS è ' + (d < 0 ? 'indietro' : 'avanti') + ' di ' + quanto + ': i rapportini prendono l\'ora del NAS' };
  }

  /** "Provata il 01/10: tutto torna" (verde) o "Non torna" (rosso tenue) con cosa (§9.10). */
  function esitoProva(p, oggi) {
    if (!p) return { parola: 'Mai provata', colore: 'grigio', frase: 'Nessuna prova ancora' };
    const quando = giornoMese(p.quando, oggi);
    if (p.esito === 'ok') return { parola: 'Tutto torna', colore: 'verde', frase: 'Provata il ' + quando + ': tutto torna' };
    if (p.esito === 'in_corso') return { parola: 'In corso', colore: 'blu', frase: 'La prova sta girando' };
    const cosa = p.cosa || p.testo || (Array.isArray(p.problemi) && p.problemi.length ? p.problemi.join('; ') : '');
    return { parola: 'Non torna', colore: 'rosso', frase: 'Provata il ' + quando + ': ' + (cosa || 'non torna') };
  }

  /** I quattro controlli della prova automatica, a parole (§9.10). */
  function dettagliProva(p) {
    const x = p || {};
    const out = [];
    if (x.integrita) out.push(['Integrità', x.integrita === 'ok' ? 'ok' : String(x.integrita)]);
    const c = x.conteggi || {};
    const chiavi = Object.keys(c);
    if (chiavi.length) {
      const male = chiavi.filter(k => Array.isArray(c[k]) && c[k][0] !== c[k][1]);
      const k0 = chiavi.indexOf('rapportini') >= 0 ? 'rapportini' : chiavi[0];
      out.push(['Righe', male.length ? male.map(k => k + ': ' + c[k][0] + ' invece di ' + c[k][1]).join(', ') : migliaia(Array.isArray(c[k0]) ? c[k0][0] : c[k0]) + ' ' + k0 + ' come nella copia']);
    }
    if (x.file) out.push(['File', x.file.provati + ' provati, ' + x.file.giusti + ' giusti']);
    if (x.fuori) out.push(['Copia su Drive', x.fuori.md5 === 'giusto' ? 'uguale a quella mandata' : x.fuori.md5 === 'non_provato' || !x.fuori.md5 ? 'non provata' : 'diversa da quella mandata']);
    return out;
  }

  /** I cinque controlli del ripristino a mano (§11.4, punto 5). */
  const CONTROLLI_RIPRISTINO = ['L\'ultimo rapportino di ieri c\'è', 'Il riepilogo del mese ha lo stesso totale', 'Una foto e un documento si aprono', 'La prossima commessa è uguale', 'L\'ultima riga del registro è di ieri sera'];

  /** I sei passi del ripristino a mano (§9.10, §11.4), scritti in pagina. */
  const PASSI_RIPRISTINO = [
    'Da Drive, cartella Wisper/Copie NAS/database, scarica la copia più recente (.db.gz o .db.gz.cifrato) e la cartella file',
    'Sul tuo computer, in una cartella fuori da OneDrive: node server/strumenti/ripristina.js <copia> --dati C:\\WisperRipristino\\dati (con la cifratura chiede la chiave scritta su carta)',
    'node server/strumenti/ripristina-file.js --da <cartella file scaricata> --dati C:\\WisperRipristino\\dati',
    'node server/src/avvio.js --dati C:\\WisperRipristino\\dati --porta 8499, ed entra col tuo utente',
    'Controlla: l\'ultimo rapportino di ieri, il riepilogo del mese, una foto e un documento, la prossima commessa, l\'ultima riga del registro',
    'Torna qui e segna il ripristino provato, poi cancella C:\\WisperRipristino',
  ];

  /** La chiave della copia in 8 gruppi di 4 ("K7QM-…"): si mostra com'è, si controlla solo la forma. */
  const formaChiave = k => /^[A-HJ-KM-NP-Z2-9]{4}(-[A-HJ-KM-NP-Z2-9]{4}){7}$/.test(String(k || ''));

  const Regole8 = {
    quandoBreve, quandoNotte, giornoMese, grandezza, migliaia,
    STATI, GRUPPI, statoVisto, pillola, conControllo, quandoControllato, vecchio, unoFallito, tempo, nelSegmento, numeriIntegrazioni, segmentoIniziale, fascia, provaGialla, senzaSegreti,
    nomeAgente, cosaFeed, letturaFeed, MAX_FEED, erroreNomeFeed,
    pezziEstratto, doveTrovato, statoLettura,
    CAMPI_IMPORT, TIPI_IMPORT, testoImporta, esitoImport, erroreColonne, campiDaCompletare,
    TETTI, SEZIONI, AREE, altre, RIQUADRI, ORDINE_RIQUADRI, RIQUADRI_BASE, riquadriPossibili, numeroRiquadro, rossoRiquadro, erroreRiquadri, toccaRiquadro, numerino, righeApprovare,
    SPEGNIBILI, FUNZIONI, ORDINE_FUNZIONI, chiLaUsa, diCosaHaBisogno, domandaSpegni, domandaCambio, avvisoCambio, rigaFunzioni, senzaSpente,
    codiceDa, numeroDa, prossimoNumero, formatoCommessa, pezziCommessa, frasePrima, comeContinua, NOMI_NUMERAZIONI, ORDINE_NUMERAZIONI,
    numeroScritto, numeroCampo, erroreVoce, PRIORITA, erroreTempi, filtraGruppi, rigaImpostazioni,
    NOMI_NOTIFICHE, GRUPPI_NOTIFICHE, gruppiNotifiche, erroreEmailAvvisi, erroreOra, MESI_ANNO, giornoMeseDa, erroreGiornoMese,
    STATI_CONTROLLO, TIPI_CONTROLLO, statoControllo, riassuntoControlli, contaControlli, filtraControlli, chiQuando, segnabile,
    accesoDa, fraseOra, esitoProva, dettagliProva, CONTROLLI_RIPRISTINO, PASSI_RIPRISTINO, formaChiave,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole8;
  else radice.WisperRegoleFase8 = Regole8;
})(typeof window !== 'undefined' ? window : globalThis);
