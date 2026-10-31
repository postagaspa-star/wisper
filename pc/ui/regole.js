/*
 * Wisper Ufficio: le regole dell'interfaccia, senza niente di grafico.
 *
 * Permessi (chi vede quale voce e quale pulsante), formati (date del registro,
 * saluto, numerazioni), controlli dei campi (partita IVA, CAP...), ordinamenti
 * (prestazioni trascinate, commesse e anagrafiche filtrate). Stanno qui da sole
 * perché si provano con Node (prove/regole.test.js), come i conti.
 *
 * Le app nascondono quello che un ruolo non può fare, ma la garanzia è il server
 * (docs/gestionale/architettura.md §3): qui si decide solo cosa mostrare.
 */
(function (radice) {
  'use strict';

  // ------------------------------------------------------------------ ruoli e permessi

  /** I quattro ruoli, con la frase che li spiega (guida §7). */
  const RUOLI = {
    titolare: { nome: 'Titolare', frase: 'Vede e cambia tutto, anche utenti e permessi.' },
    amministrazione: { nome: 'Amministrazione', frase: 'Clienti, commesse, fatture e soldi. Non cambia utenti e permessi.' },
    collaboratore: { nome: 'Collaboratore', frase: 'Scrive i suoi rapportini e vede le commesse, senza importi.' },
    lettura: { nome: 'Lettura', frase: 'Vede tutto, non cambia niente. Per il commercialista.' },
    // Fase 6 (fase6.md §8.4): un collaboratore esterno, legato al suo fornitore; si invita dalla sua scheda.
    esterno: { nome: 'Esterno', frase: 'Un collaboratore esterno: vede solo le commesse dei suoi incarichi, i suoi rapportini e i suoi compensi.' },
  };
  const ORDINE_RUOLI = ['titolare', 'amministrazione', 'collaboratore', 'lettura'];
  /** Ruoli e permessi ha anche la colonna dell'esterno (fase6.md §12.8). */
  const ORDINE_RUOLI_PERMESSI = ORDINE_RUOLI.concat(['esterno']);
  /** I moduli che a un esterno non si possono dare (il server lo rifiuta: architettura §17.16). */
  const VIETATI_ESTERNO = ['persone', 'mezzi', 'clienti', 'preventivi', 'fatturazione', 'banche', 'comunicazioni', 'portale', 'integrazioni', 'amministrazione', 'costi', 'riservati'];

  /**
   * Le voci del menu che funzionano oggi, nell'ordine delle specifiche. Le voci delle
   * fasi dopo si aggiungono qui, al loro posto, quando funzionano.
   */
  const VOCI_MENU = [
    { modulo: 'dashboard', nome: 'Dashboard', spiega: 'La pagina iniziale', icona: 'dashboard' },
    { modulo: 'clienti', nome: 'Clienti e fornitori', spiega: 'Anagrafiche, referenti, sedi', icona: 'clienti' },
    { modulo: 'commesse', nome: 'Progetti e commesse', spiega: 'Commesse e prestazioni', icona: 'commesse' },
    // Fase 2 (docs/gestionale/fase2.md §5): voci 4 e 5 del menu.
    { modulo: 'preventivi', nome: 'Preventivi e contratti', spiega: 'Preventivi, listino, incarichi', icona: 'preventivo' },
    { modulo: 'attivita', nome: 'Attività e calendario', spiega: 'Le attività di tutti o solo le sue', icona: 'calendario' },
    { modulo: 'rapportini', nome: 'Ore e rapportini', spiega: 'Ore, timer, rapportini e approvazioni', icona: 'rapportini' },
    // Fase 3 (docs/gestionale/fase3.md §5): voce 7, tra Ore e rapportini e Fatturazione.
    { modulo: 'spese', nome: 'Spese e trasferte', spiega: 'Spese, trasferte, rimborsi', icona: 'scontrino' },
    { modulo: 'fatturazione', nome: 'Fatturazione', spiega: 'Da fatturare, fatture, ricevute, riepilogo', icona: 'fatturazione' },
    // Fase 4 (docs/gestionale/fase4.md §12): voce 9, subito dopo Fatturazione.
    { modulo: 'banche', nome: 'Banche e scadenze', spiega: 'Scadenziario, movimenti, tributi, conti', icona: 'banca' },
    // Fase 6 (fase6.md §12): voce 10, dopo Banche e scadenze.
    { modulo: 'persone', nome: 'Persone e risorse umane', spiega: 'Organico, ferie e permessi, presenze, formazione', icona: 'persona' },
    // Fase 5 (docs/gestionale/fase5.md §12): voci 11 e 12, dopo Banche e scadenze.
    { modulo: 'documenti', nome: 'Documenti', spiega: 'Archivio, revisioni, scadenze, modelli', icona: 'file' },
    { modulo: 'ticket', nome: 'Ticket e assistenza', spiega: "Richieste d'intervento, contratti, statistiche", icona: 'chiaveInglese' },
    // Fase 6: voce 13 dopo Ticket, voce 16 dopo Mezzi.
    { modulo: 'mezzi', nome: 'Mezzi e attrezzature', spiega: 'Mezzi, strumenti e tarature, DPI, prestiti, guasti', icona: 'furgone' },
    { modulo: 'collaboratori', nome: 'Collaboratori esterni', spiega: 'Imprese e professionisti, incarichi, compensi', icona: 'collaboratori' },
    { modulo: 'amministrazione', nome: 'Amministrazione', spiega: 'Studio, utenti, permessi, copie', icona: 'amministrazione' },
  ];

  /** Le righe di Ruoli e permessi: i moduli del menu più i soldi. */
  const RIGHE_PERMESSI = VOCI_MENU.map(v => ({ modulo: v.modulo, nome: v.nome, spiega: v.spiega }))
    .concat([{ modulo: 'costi', nome: 'Soldi', spiega: 'Tariffe, totali, costi e margini' },
      // Fase 6 (fase6.md §3.2): costo dell'anno, CCNL, giudizi di idoneità, documenti riservati, tipo delle assenze sanitarie.
      { modulo: 'riservati', nome: 'Dati riservati', spiega: 'Costo dell\'anno, contratti e cedolini, giudizi del medico, malattie' }]);

  const LIVELLI = ['Niente', 'Vede', 'Modifica'];

  /**
   * Con la versione vecchia (il foglio, senza utenti) non c'è nessun permesso da
   * leggere: chi apre il programma può tutto, come prima.
   */
  function permessiTutti() {
    const p = {};
    RIGHE_PERMESSI.forEach(r => { p[r.modulo] = 2; });
    p.riservati = 2;
    return p;
  }

  /** 0 niente, 1 vede, 2 modifica. Un modulo che non c'è vale niente. */
  function livello(permessi, modulo) {
    const v = permessi ? Number(permessi[modulo]) : 0;
    return v === 1 || v === 2 ? v : 0;
  }

  function puo(permessi, modulo, minimo) {
    return livello(permessi, modulo) >= (minimo || 1);
  }

  /** Le voci della barra laterale per questi permessi. */
  /** Fatturazione e Banche si vedono solo col modulo e anche il permesso dei soldi (fase4.md §12). */
  const CON_SOLDI = ['fatturazione', 'banche'];
  const vede = (permessi, modulo) => puo(permessi, modulo, 1) && (CON_SOLDI.indexOf(modulo) < 0 || puo(permessi, 'costi', 1));

  /** Per l'esterno il menu ridotto, nel suo ordine (fase6.md §12.7): Ore e rapportini prima di Attività. */
  const ORDINE_ESTERNO = ['dashboard', 'commesse', 'rapportini', 'attivita', 'spese', 'documenti', 'ticket', 'collaboratori'];
  function vociMenu(permessi, esterno) {
    const voci = VOCI_MENU.filter(v => vede(permessi, v.modulo));
    if (!esterno) return voci;
    return voci.filter(v => ORDINE_ESTERNO.indexOf(v.modulo) >= 0).sort((a, b) => ORDINE_ESTERNO.indexOf(a.modulo) - ORDINE_ESTERNO.indexOf(b.modulo));
  }

  /**
   * Il modulo che serve per una pagina (il primo pezzo dell'indirizzo, "#commesse/26ST044"
   * -> "commesse"). L'app (tema, visita, versione) è di tutti: null = nessun permesso.
   */
  function moduloDi(percorso) {
    const pezzi = String(percorso || '').replace(/^#/, '').split('/');
    const nome = pezzi[0] || 'dashboard';
    if (nome === 'amministrazione' && pezzi[1] === 'app') return null;
    if (nome === 'accesso') return null;
    return VOCI_MENU.some(v => v.modulo === nome) ? nome : 'dashboard';
  }

  function paginaPermessa(permessi, percorso) {
    const m = moduloDi(percorso);
    return m === null || vede(permessi, m);
  }

  /** La prima pagina che questi permessi lasciano vedere (di solito la Dashboard). */
  function primaPagina(permessi) {
    const v = vociMenu(permessi)[0];
    return v ? v.modulo : 'amministrazione/app';
  }

  /** Il nome del titolare da citare in "Chiedi a ...": il primo titolare attivo. */
  function titolareDi(utenti) {
    const t = (utenti || []).find(u => u.ruolo === 'titolare' && u.attivo !== false);
    return t ? String(t.nome || '').split(' ')[0] : 'al titolare';
  }

  /** Gli utenti attivi con quel ruolo (per "l'ultimo titolare non si toglie"). */
  function quantiAttivi(utenti, ruolo) {
    return (utenti || []).filter(u => u.ruolo === ruolo && u.attivo !== false).length;
  }

  /** È l'ultimo titolare attivo: non si disattiva e non cambia ruolo. */
  function ultimoTitolare(utenti, utente) {
    return !!utente && utente.ruolo === 'titolare' && utente.attivo !== false && quantiAttivi(utenti, 'titolare') <= 1;
  }

  /**
   * Cosa vedrà e cosa no chi passa a un ruolo: la frase della conferma.
   * "Vedrà Dashboard, Progetti e commesse, Ore e rapportini (solo da leggere: ...), senza importi.
   *  Non vedrà Fatturazione, Amministrazione."
   */
  function descriviRuolo(permessiRuolo) {
    const vede = [];
    const legge = [];
    const no = [];
    VOCI_MENU.forEach(v => {
      const l = livello(permessiRuolo, v.modulo);
      if (l === 2) vede.push(v.nome);
      else if (l === 1) legge.push(v.nome);
      else no.push(v.nome);
    });
    const parti = [];
    if (vede.length) parti.push('Potrà cambiare: ' + vede.join(', ') + '.');
    if (legge.length) parti.push('Solo da leggere: ' + legge.join(', ') + '.');
    if (no.length) parti.push('Non vedrà: ' + no.join(', ') + '.');
    parti.push(puo(permessiRuolo, 'costi') ? 'Vede gli importi.' : 'Senza importi.');
    return parti.join(' ');
  }

  // ------------------------------------------------------------------ date e saluti

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
    'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const due = n => String(n).padStart(2, '0');

  /** Un istante (Date o testo ISO) nell'ora del computer. */
  function comeData(v) {
    if (v instanceof Date) return v;
    const s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function isoGiorno(d) {
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  }

  /** Buongiorno fino alle 13, Buon pomeriggio fino alle 18, poi Buonasera. */
  function saluto(ora) {
    const h = typeof ora === 'number' ? ora : new Date().getHours();
    if (h >= 5 && h < 13) return 'Buongiorno';
    if (h >= 13 && h < 18) return 'Buon pomeriggio';
    return 'Buonasera';
  }

  /** "Giovedì 23 ottobre" (con l'anno solo se non è quello di oggi). */
  function dataTitolo(v, oggi) {
    const d = comeData(v);
    if (!d) return '';
    const o = comeData(oggi || new Date());
    const testo = GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (o && o.getFullYear() !== d.getFullYear() ? ' ' + d.getFullYear() : '');
    return testo.charAt(0).toUpperCase() + testo.slice(1);
  }

  function giorniFra(a, b) {
    const da = comeData(isoGiorno(a));
    const al = comeData(isoGiorno(b));
    return Math.round((al - da) / 86400000);
  }

  /** Il giorno di una voce del registro: "Oggi", "Ieri", "lunedì 20 ottobre". */
  function giornoRegistro(istante, oggi) {
    const d = comeData(istante);
    const o = comeData(oggi || new Date());
    if (!d || !o) return '';
    const diff = giorniFra(d, o);
    if (diff === 0) return 'Oggi';
    if (diff === 1) return 'Ieri';
    return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + (d.getFullYear() !== o.getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /** "oggi alle 16:20", "ieri alle 9:31", "20 ottobre alle 11:10". */
  function quando(istante, oggi) {
    const d = comeData(istante);
    const o = comeData(oggi || new Date());
    if (!d || !o) return '';
    const ora = d.getHours() + ':' + due(d.getMinutes());
    const diff = giorniFra(d, o);
    if (diff === 0) return 'oggi alle ' + ora;
    if (diff === 1) return 'ieri alle ' + ora;
    return d.getDate() + ' ' + MESI[d.getMonth()] + (d.getFullYear() !== o.getFullYear() ? ' ' + d.getFullYear() : '') + ' alle ' + ora;
  }

  /** Le voci del registro divise per giorno, nell'ordine in cui arrivano (le più nuove prima). */
  function raggruppaPerGiorno(voci, oggi) {
    const gruppi = [];
    (voci || []).forEach(v => {
      const g = giornoRegistro(v.quando, oggi);
      const ultimo = gruppi[gruppi.length - 1];
      if (ultimo && ultimo.giorno === g) ultimo.voci.push(v);
      else gruppi.push({ giorno: g, voci: [v] });
    });
    return gruppi;
  }

  /** Il periodo di un filtro del registro: da / a come "aaaa-mm-gg" (a = oggi). */
  function periodo(scelta, oggi) {
    const o = comeData(oggi || new Date());
    const a = isoGiorno(o);
    const indietro = n => { const d = new Date(o); d.setDate(d.getDate() - n); return isoGiorno(d); };
    if (scelta === 'oggi') return { da: a, a };
    if (scelta === '7') return { da: indietro(6), a };
    if (scelta === '30') return { da: indietro(29), a };
    return { da: '', a: '' };
  }

  // ------------------------------------------------------------------ controlli dei campi

  const soloCifre = s => String(s || '').replace(/\s+/g, '');

  /**
   * La partita IVA italiana: 11 cifre e l'ultima che torna col calcolo di controllo.
   * Quelle estere (con le lettere del paese davanti, tranne IT) non si controllano qui.
   */
  function errorePartitaIva(valore) {
    let s = soloCifre(valore).toUpperCase();
    if (!s) return '';
    if (/^IT/.test(s)) s = s.slice(2);
    else if (/^[A-Z]{2}/.test(s)) return '';
    if (!/^\d+$/.test(s)) return 'La partita IVA ha solo cifre';
    if (s.length !== 11) return 'La partita IVA ha 11 cifre';
    let somma = 0;
    for (let i = 0; i < 10; i++) {
      let c = s.charCodeAt(i) - 48;
      if (i % 2 === 1) { c *= 2; if (c > 9) c -= 9; }
      somma += c;
    }
    if ((10 - (somma % 10)) % 10 !== s.charCodeAt(10) - 48) return 'La partita IVA non torna: controlla le cifre';
    return '';
  }

  function erroreCodiceFiscale(valore) {
    const s = soloCifre(valore).toUpperCase();
    if (!s) return '';
    if (/^\d{11}$/.test(s)) return '';
    if (!/^[A-Z0-9]{16}$/.test(s)) return 'Il codice fiscale ha 16 caratteri (11 cifre per le ditte)';
    return '';
  }

  function erroreSdi(valore) {
    const s = soloCifre(valore).toUpperCase();
    if (!s) return '';
    return /^[A-Z0-9]{7}$/.test(s) ? '' : 'Il codice SDI ha 7 caratteri';
  }

  function erroreEmail(valore) {
    const s = String(valore || '').trim();
    if (!s) return '';
    if (s.indexOf('@') < 0) return 'Manca la @: controlla l\'indirizzo';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? '' : 'L\'indirizzo non è scritto giusto';
  }

  function erroreCap(valore) {
    const s = soloCifre(valore);
    if (!s) return '';
    return /^\d{5}$/.test(s) ? '' : 'Il CAP ha 5 cifre';
  }

  function erroreProvincia(valore) {
    const s = String(valore || '').trim();
    if (!s) return '';
    return /^[A-Za-z]{2}$/.test(s) ? '' : 'La provincia sono 2 lettere, come VI';
  }

  /** Tutti gli errori del modulo cliente/fornitore: { campo: frase }. Vuoto = si può salvare. */
  function validaSoggetto(c) {
    const e = {};
    if (!String(c.nome || '').trim()) e.nome = 'Scrivi il nome o la ragione sociale';
    if (!c.cliente && !c.fornitore) e.tipo = 'Scegli se è un cliente, un fornitore o tutti e due';
    const controlli = { partitaIva: errorePartitaIva, codiceFiscale: erroreCodiceFiscale, codiceSdi: erroreSdi,
      pec: erroreEmail, email: erroreEmail, cap: erroreCap, provincia: erroreProvincia };
    Object.keys(controlli).forEach(k => { const x = controlli[k](c[k]); if (x) e[k] = x; });
    return e;
  }

  // ------------------------------------------------------------------ clienti e fornitori

  function norm(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase()
      .normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/\./g, '')
      .replace(/\b(srl|srls|spa|snc|sas)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function aliasDi(s) {
    if (Array.isArray(s.alias)) return s.alias;
    return String(s.alias || '').split(',').map(x => x.trim()).filter(Boolean);
  }

  /**
   * Il doppione di un cliente o fornitore: stesso nome o altro nome (senza badare a
   * maiuscole, accenti, Srl), o stessa partita IVA se scritta. Null se non c'è.
   */
  function trovaDoppione(soggetti, campi, idEscluso) {
    const nomi = [campi.nome].concat(aliasDi(campi)).map(norm).filter(Boolean);
    const iva = soloCifre(campi.partitaIva).toUpperCase().replace(/^IT/, '');
    return (soggetti || []).find(s => {
      if (idEscluso && s.id === idEscluso) return false;
      const suoi = [s.nome].concat(aliasDi(s)).map(norm).filter(Boolean);
      if (nomi.some(n => suoi.indexOf(n) >= 0)) return true;
      const suaIva = soloCifre(s.partitaIva).toUpperCase().replace(/^IT/, '');
      return !!iva && iva === suaIva;
    }) || null;
  }

  /** Clienti o fornitori (chi è tutti e due compare in tutte e due), cercati e in ordine di nome. */
  function filtraSoggetti(soggetti, f) {
    const testo = norm(f.testo);
    return (soggetti || []).filter(s => {
      if (f.tipo === 'fornitori' ? !s.fornitore : !s.cliente) return false;
      if (!!s.archiviato !== !!f.archiviati) return false;
      if (!testo) return true;
      return norm([s.id, s.nome, aliasDi(s).join(' '), s.citta, s.partitaIva, s.email].join(' ')).indexOf(testo) >= 0;
    }).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
  }

  function contaSoggetti(soggetti) {
    const attivi = (soggetti || []).filter(s => !s.archiviato);
    return {
      clienti: attivi.filter(s => s.cliente).length,
      fornitori: attivi.filter(s => s.fornitore).length,
      archiviatiClienti: (soggetti || []).filter(s => s.archiviato && s.cliente).length,
      archiviatiFornitori: (soggetti || []).filter(s => s.archiviato && s.fornitore).length,
    };
  }

  /** "Via Nuova 3, 36061 Bassano del Grappa (VI)" */
  function indirizzoCompleto(x) {
    const luogo = [x.cap, x.citta].filter(Boolean).join(' ') + (x.provincia ? ' (' + String(x.provincia).toUpperCase() + ')' : '');
    return [x.indirizzo, luogo.trim()].filter(Boolean).join(', ');
  }

  // ------------------------------------------------------------------ commesse e prestazioni

  function oggiIso() {
    return isoGiorno(new Date());
  }

  /** Aperta e oltre la fine prevista. */
  function inRitardo(m, oggi) {
    return m.stato === 'APERTA' && !!m.finePrevista && String(m.finePrevista) < (oggi || oggiIso());
  }

  /** Le commesse normali (niente modelli). Archivio = le archiviate, di qualunque stato. */
  function filtraCommesse(commesse, f, nomeCliente) {
    const testo = norm(f.testo);
    return (commesse || []).filter(m => {
      if (m.modello) return false;
      if (f.stato === 'ARCHIVIO') { if (!m.archiviata) return false; } else if (m.archiviata || (f.stato && m.stato !== f.stato)) return false;
      if (f.cliente && m.idCliente !== f.cliente) return false;
      if (f.ritardo && !inRitardo(m, f.oggi)) return false;
      if (f.responsabile === 'nessuno' && (m.responsabileId || m.idResponsabile)) return false;
      if (testo && norm([m.id, m.descrizione, nomeCliente ? nomeCliente(m.idCliente) : '', m.indirizzo].join(' ')).indexOf(testo) < 0) return false;
      return true;
    }).sort((a, b) => (String(a.id) < String(b.id) ? 1 : -1));
  }

  function contaCommesse(commesse, oggi) {
    const normali = (commesse || []).filter(m => !m.modello);
    const vive = normali.filter(m => !m.archiviata);
    return {
      aperte: vive.filter(m => m.stato === 'APERTA').length,
      sospese: vive.filter(m => m.stato === 'SOSPESA').length,
      chiuse: vive.filter(m => m.stato === 'CHIUSA').length,
      inRitardo: vive.filter(m => inRitardo(m, oggi)).length,
      archivio: normali.filter(m => m.archiviata).length,
    };
  }

  /** Lo stato segue l'avanzamento: 0 da fare, 1-99 in corso, 100 fatta. */
  function statoPrestazione(avanzamento) {
    const a = Number(avanzamento) || 0;
    return a >= 100 ? 'fatta' : a > 0 ? 'in_corso' : 'da_fare';
  }
  const NOMI_STATO_PRESTAZIONE = { da_fare: 'Da fare', in_corso: 'In corso', fatta: 'Fatta' };

  /** L'avanzamento a passi di 5, fra 0 e 100. */
  function avanzamento(valore, aggiungi) {
    const v = Math.round(((Number(valore) || 0) + (Number(aggiungi) || 0)) / 5) * 5;
    return Math.max(0, Math.min(100, v));
  }

  function ordinaPrestazioni(lista) {
    return (lista || []).slice().sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0) || String(a.id).localeCompare(String(b.id)));
  }

  /** Sposta un elemento da una posizione a un'altra (trascinando): una lista nuova. */
  function sposta(lista, da, a) {
    const out = (lista || []).slice();
    if (da < 0 || da >= out.length) return out;
    const [x] = out.splice(da, 1);
    out.splice(Math.max(0, Math.min(out.length, a)), 0, x);
    return out;
  }

  /** Fatto e totale delle prestazioni: il fatto è il valore per l'avanzamento. */
  function totaliPrestazioni(lista) {
    let totale = 0;
    let fatto = 0;
    (lista || []).forEach(p => {
      const v = Number(p.valore) || 0;
      totale += v;
      fatto += v * (Number(p.avanzamento) || 0) / 100;
    });
    totale = Math.round(totale * 100) / 100;
    fatto = Math.round(fatto * 100) / 100;
    return { totale, fatto, perc: totale > 0 ? Math.round(fatto / totale * 100) : 0 };
  }

  // ------------------------------------------------------------------ numerazioni

  /** "{AA}ST{NNN}" -> [{anno 2}, {testo ST}, {numero 3}] */
  function pezziFormato(formato) {
    const out = [];
    const re = /\{(A{2,4}|N+)\}/g;
    let ultimo = 0;
    let m;
    const s = String(formato || '');
    while ((m = re.exec(s))) {
      if (m.index > ultimo) out.push({ tipo: 'testo', testo: s.slice(ultimo, m.index) });
      if (m[1][0] === 'A') out.push({ tipo: 'anno', cifre: m[1].length >= 4 ? 4 : 2 });
      else out.push({ tipo: 'numero', cifre: m[1].length });
      ultimo = re.lastIndex;
    }
    if (ultimo < s.length) out.push({ tipo: 'testo', testo: s.slice(ultimo) });
    return out;
  }

  function formatoDaPezzi(pezzi) {
    return (pezzi || []).map(p => p.tipo === 'anno' ? (p.cifre === 4 ? '{AAAA}' : '{AA}')
      : p.tipo === 'numero' ? '{' + 'N'.repeat(Math.max(1, Math.min(8, p.cifre || 3))) + '}'
        : String(p.testo || '').replace(/[{}]/g, '')).join('');
  }

  /** Il numero n col formato: 48 nel 2026 con "{AA}ST{NNN}" -> "26ST048". */
  function formattaNumero(formato, n, anno) {
    return pezziFormato(formato).map(p => p.tipo === 'anno' ? (p.cifre === 4 ? String(anno) : String(anno % 100).padStart(2, '0'))
      : p.tipo === 'numero' ? String(n).padStart(p.cifre, '0') : p.testo).join('');
  }

  /** "anno a due cifre, ST, numero di 3 cifre" */
  function formatoAParole(formato) {
    return pezziFormato(formato).map(p => p.tipo === 'anno' ? (p.cifre === 4 ? 'anno a quattro cifre' : 'anno a due cifre')
      : p.tipo === 'numero' ? 'numero di ' + p.cifre + ' cifre' : (p.testo.replace(/[\s/._-]+/g, ' ').trim() || null))
      .filter(Boolean).join(', ');
  }

  /** Il formato è usabile: ci vuole il numero, e se riparte a gennaio anche l'anno. */
  function erroreFormato(formato, annuale) {
    const pezzi = pezziFormato(formato);
    if (!pezzi.some(p => p.tipo === 'numero')) return 'Manca il numero';
    if (pezzi.filter(p => p.tipo === 'numero').length > 1) return 'Il numero va messo una volta sola';
    if (annuale && !pezzi.some(p => p.tipo === 'anno')) return 'Se il numero riparte a gennaio serve anche l\'anno';
    return '';
  }

  // ------------------------------------------------------------------ dashboard

  /** Dove porta una riga della Dashboard: l'indirizzo della pagina e il filtro da mettere. */
  function destinazione(collegamento) {
    const c = collegamento || {};
    const id = c.id ? encodeURIComponent(c.id) : '';
    switch (c.pagina) {
      case 'commessa': return { hash: '#commesse/' + id, filtro: c.filtro || null };
      case 'commesse': return { hash: '#commesse', filtro: c.filtro || null };
      case 'cliente': case 'soggetto': case 'fornitore': return { hash: '#clienti/' + id, filtro: null };
      case 'clienti': return { hash: '#clienti', filtro: c.filtro || null };
      case 'rapportini': return { hash: '#rapportini', filtro: c.filtro || null };
      case 'rapportino': return { hash: '#rapportini', filtro: Object.assign({ apri: c.id }, c.filtro || {}) };
      case 'fatturazione': return { hash: '#fatturazione', filtro: c.filtro || null };
      case 'amministrazione': return { hash: '#amministrazione' + (c.id ? '/' + id : c.filtro && c.filtro.sezione ? '/' + encodeURIComponent(c.filtro.sezione) : ''), filtro: null };
      // Fase 3: Spese e trasferte (filtro.segmento spese | trasferte | rimborsi, e id).
      case 'spese': return { hash: '#spese', filtro: c.filtro || null };
      // Fase 2: preventivi, attività, calendario.
      case 'preventivi': return { hash: '#preventivi', filtro: c.filtro || null };
      case 'preventivo': return { hash: '#preventivi/' + id, filtro: null };
      case 'listino': return { hash: '#preventivi/listino', filtro: null };
      case 'contratti': return { hash: '#preventivi/contratti', filtro: null };
      case 'attivita': return { hash: '#attivita' + (c.id ? '/' + id : ''), filtro: c.filtro || null };
      case 'calendario': return { hash: '#attivita/calendario', filtro: c.filtro || null };
      case 'pianificazione': return { hash: '#attivita/pianificazione', filtro: c.filtro || null };
      // Fase 4: fatture, ricevute, banche e scadenze (architettura.md §15.16).
      case 'fatture': return { hash: '#fatturazione/fatture', filtro: c.filtro || null };
      case 'fattura': return { hash: '#fatturazione/fatture', filtro: Object.assign({ apri: c.id }, c.filtro || {}) };
      case 'ricevute': return { hash: '#fatturazione/ricevute', filtro: c.filtro || null };
      case 'ricevuta': return { hash: '#fatturazione/ricevute', filtro: Object.assign({ apri: c.id }, c.filtro || {}) };
      case 'scadenziario': return { hash: '#banche', filtro: c.filtro || null };
      case 'movimenti': return { hash: '#banche/movimenti', filtro: c.filtro || null };
      case 'impegni': return { hash: '#banche/tributi', filtro: Object.assign(c.id ? { id: c.id } : {}, c.filtro || {}) };
      case 'conti': return { hash: '#banche/conti', filtro: c.id ? { id: c.id } : (c.filtro || null) };
      case 'situazione': return { hash: '#banche/situazione', filtro: null };
      // Fase 5: ticket, contratti di assistenza, documenti, scadenze, impianti (architettura.md §16.18).
      case 'tickets': {
        const seg = c.filtro && c.filtro.segmento;
        return { hash: '#ticket' + (seg && seg !== 'aperti' ? '/' + seg : ''), filtro: c.filtro || null };
      }
      case 'ticket': return { hash: '#ticket/tk/' + id, filtro: null };
      case 'contratto': return { hash: '#ticket/contratto/' + id, filtro: null };
      case 'impianto': return { hash: '#ticket/impianto/' + id, filtro: null };
      case 'documenti': {
        const seg = c.filtro && c.filtro.segmento;
        return { hash: '#documenti' + (seg && seg !== 'archivio' ? '/' + seg : ''), filtro: c.filtro || null };
      }
      case 'documento': return { hash: '#documenti/doc/' + id, filtro: null };
      case 'scadenza': return { hash: '#documenti/scadenza/' + id, filtro: null };
      // Fase 6: persone, mezzi e attrezzature, collaboratori esterni (architettura.md §17.17).
      case 'persone': {
        const seg = c.filtro && c.filtro.segmento;
        return { hash: '#persone' + (seg && seg !== 'organico' ? '/' + seg : ''), filtro: c.filtro || null };
      }
      case 'persona': return { hash: '#persone/p/' + id, filtro: null };
      case 'mezzi': {
        const seg = c.filtro && c.filtro.segmento;
        return { hash: '#mezzi' + (seg && seg !== 'mezzi' ? '/' + seg : ''), filtro: c.filtro || null };
      }
      case 'mezzo': return { hash: '#mezzi/mezzo/' + id, filtro: null };
      case 'attrezzatura': return { hash: '#mezzi/at/' + id, filtro: null };
      case 'collaboratori': {
        const seg = c.filtro && c.filtro.segmento;
        return { hash: '#collaboratori' + (seg && seg !== 'elenco' ? '/' + seg : ''), filtro: c.filtro || null };
      }
      case 'collaboratore': return { hash: '#collaboratori/c/' + id, filtro: null };
      case 'incarico': return { hash: '#collaboratori/in/' + id, filtro: null };
      default: return { hash: '#dashboard', filtro: null };
    }
  }

  /** Il pulsante della cosa più urgente: dice la cosa da fare. */
  function testoAzione(collegamento) {
    const p = (collegamento || {}).pagina;
    if (p === 'attivita' && collegamento.id) return 'Apri l\'attività';
    const seg = collegamento && collegamento.filtro ? collegamento.filtro.segmento : '';
    if (p === 'rapportini' && seg === 'daApprovare') return 'Apri Da approvare';
    if (p === 'rapportini' && seg === 'ore') return 'Apri le ore';
    if (p === 'spese' && seg === 'rimborsi') return 'Apri i rimborsi';
    if (p === 'amministrazione' && collegamento.filtro && collegamento.filtro.sezione === 'veicoli') return 'Apri i veicoli';
    return {
      fatturazione: 'Apri Da fatturare', commessa: 'Apri la commessa', commesse: 'Apri le commesse',
      cliente: 'Apri la scheda', soggetto: 'Apri la scheda', clienti: 'Apri i clienti',
      rapportini: 'Apri i rapportini', rapportino: 'Apri il rapportino', amministrazione: 'Apri',
      preventivi: 'Apri i preventivi', preventivo: 'Apri il preventivo', attivita: 'Apri le attività', calendario: 'Apri il calendario',
      spese: 'Apri le spese',
      fattura: 'Apri la fattura', fatture: 'Apri le fatture', ricevute: 'Apri le ricevute', ricevuta: 'Apri la ricevuta', scadenziario: 'Apri lo scadenziario',
      movimenti: 'Apri i movimenti', impegni: 'Apri i tributi', conti: 'Apri i conti', situazione: 'Apri la situazione',
      // fase 5
      ticket: 'Apri il ticket', tickets: 'Apri i ticket', contratto: 'Apri il contratto', documento: 'Apri il documento', documenti: 'Apri i documenti',
      scadenza: 'Apri la scadenza', impianto: "Apri l'impianto",
      // fase 6
      persone: 'Apri Persone', persona: 'Apri la scheda', mezzi: 'Apri Mezzi e attrezzature', mezzo: 'Apri il mezzo', attrezzatura: 'Apri lo strumento',
      collaboratori: 'Apri i collaboratori', collaboratore: 'Apri la scheda', incarico: "Apri l'incarico",
    }[p] || 'Apri';
  }

  /** Il colore del quadrato dell'icona: urgente rosso, attenzione giallo, soldi blu, info grigio. */
  function classeGravita(g) {
    return { urgente: 'ico-rosso', attenzione: 'ico-giallo', soldi: 'ico-blu' }[g] || 'ico-grigio';
  }

  // ------------------------------------------------------------------ registro

  /**
   * I nomi dei campi come si leggono ("partita_iva" -> "la partita IVA"). Il server
   * scrive nel registro le colonne del database (partita_iva, ultima_tariffa...);
   * ci sono anche i nomi delle risposte (partitaIva...) per i dati di esempio.
   */
  const NOMI_CAMPI = {
    nome: 'il nome', alias: 'gli altri nomi', email: 'l\'email', pec: 'la PEC', telefono: 'il telefono',
    partita_iva: 'la partita IVA', partitaIva: 'la partita IVA', codice_fiscale: 'il codice fiscale', codiceFiscale: 'il codice fiscale',
    codice_sdi: 'il codice SDI', codiceSdi: 'il codice SDI', indirizzo: 'l\'indirizzo', cap: 'il CAP', citta: 'la città', provincia: 'la provincia',
    nazione: 'la nazione', tariffa_fissa: 'la tariffa', tariffaFissa: 'la tariffa', ultima_tariffa: 'la tariffa', ultimaTariffa: 'la tariffa',
    tariffa: 'la tariffa', costo_fisso: 'il costo orario', costoFisso: 'il costo orario', paga_viaggio: 'il viaggio pagato', pagaViaggio: 'il viaggio pagato',
    km_rimborsati: 'i km rimborsati', kmRimborsati: 'i km rimborsati', magg_extra: 'la maggiorazione delle ore extra', note: 'le note',
    archiviato: 'l\'archiviazione', archiviata: 'l\'archiviazione', cliente: 'il cliente', fornitore: 'il fornitore',
    descrizione: 'la descrizione', stato: 'lo stato', budget_ore: 'le ore previste', budgetOre: 'le ore previste',
    budget_euro: 'il budget', budgetEuro: 'il budget', prezzo_orario: 'il prezzo orario', prezzoOrario: 'il prezzo orario',
    costo_orario: 'il costo orario', costoOrario: 'il costo orario', euro_km: 'il rimborso km', euroKm: 'il rimborso km',
    fine_prevista: 'la fine prevista', finePrevista: 'la fine prevista', inizio: 'l\'inizio', cliente_id: 'il cliente',
    responsabile_id: 'il responsabile', responsabileId: 'il responsabile', sede_id: 'la sede', sedeId: 'la sede',
    importo_contratto: 'l\'importo del contratto', importoContratto: 'l\'importo del contratto', persone: 'le persone', modello: 'il modello',
    valore: 'il valore', avanzamento: 'l\'avanzamento', ordine: 'l\'ordine', ruolo: 'il ruolo', attivo: 'l\'accesso', livello: 'il permesso',
    password_hash: 'la password', formato: 'il formato', annuale: 'la ripartenza a gennaio', revocata: 'il collegamento',
    tipo: 'il tipo', cestinato: 'il cestino',
    EURO_KM: 'il rimborso km', COSTO_ORARIO: 'il costo orario', RAGIONE_SOCIALE: 'la ragione sociale', TECNICO: 'chi firma i rapportini',
    INDIRIZZO: 'l\'indirizzo dello studio', PARTITA_IVA: 'la partita IVA dello studio', EMAIL: 'l\'email dello studio', TELEFONO: 'il telefono dello studio',
    PEC: 'la PEC dello studio', AUTO: 'l\'auto', TICKET_ATTIVO: 'il campo ticket', FIRMA_TECNICO: 'la firma', EMAIL_AVVISI: 'l\'email degli avvisi',
    ore_lavoro: 'le ore', oreLavoro: 'le ore', km: 'i km', spese: 'le spese',
  };

  /** Campi che il registro non mostra: date di servizio, ordine tecnico. */
  const CAMPI_RUMORE = ['modificato', 'creato', 'id', 'soggetto_id', 'commessa_id', 'utente_id'];

  /** Cosa è una riga di una tabella, per la frase ("ha archiviato il cliente ..."). */
  const COSA = {
    soggetti: 'il cliente', clienti: 'il cliente', fornitori: 'il fornitore', commesse: 'la commessa',
    rapportini: 'il rapportino', prestazioni: 'la prestazione', referenti: 'il referente', sedi: 'la sede',
    utenti: 'l\'utente', permessi: 'i permessi', impostazioni: 'le impostazioni', numerazioni: 'la numerazione', file: 'il file',
    sessioni: 'il dispositivo', commessa_persone: 'le persone della commessa', tentativi_accesso: 'l\'accesso',
    // fase 2
    preventivi: 'il preventivo', preventivo_voci: 'le voci del preventivo', listino: 'la voce del listino', attivita: 'l\'attività',
    attivita_checklist: 'la checklist', scadenze_pagamento: 'le scadenze di pagamento', ricorrenze: 'la ricorrenza',
    // fase 3
    ore: 'le ore', timer: 'il timer', spese: 'la spesa', trasferte: 'la trasferta', veicoli: 'il mezzo',
    // fase 6
    persone: 'la scheda di', persona_costi: 'il costo orario di', assenze: 'l\'assenza', assenze_saldi: 'il saldo di', chiusure: 'la chiusura',
    qualifiche: 'la formazione', qualifica_tipi: 'il tipo di formazione', visite_mediche: 'la visita medica', dpi_consegne: 'la consegna di un DPI',
    attrezzature: 'lo strumento', tarature: 'la taratura', assegnazioni: 'l\'assegnazione', manutenzioni: 'la manutenzione', mezzo_letture: 'i km',
    collaboratori: 'il collaboratore', incarichi: 'l\'incarico',
  };

  function valoreLeggibile(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v === true) return 'sì';
    if (v === false) return 'no';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  const PAROLE_STATO = { BOZZA: 'Da firmare', FIRMATO: 'Firmato', INVIATO: 'Inviato', FATTURATO: 'Fatturato', ANNULLATO: 'Annullato',
    APERTA: 'Aperta', SOSPESA: 'Sospesa', CHIUSA: 'Chiusa', da_fare: 'Da fare', in_corso: 'In corso', fatta: 'Fatta' };
  const SI_NO = ['archiviato', 'archiviata', 'attivo', 'paga_viaggio', 'pagaViaggio', 'km_rimborsati', 'kmRimborsati', 'cliente', 'fornitore', 'modello', 'annuale'];

  /** Un valore come si legge: gli stati a parole, i ruoli col loro nome, i numeri con la virgola. */
  function valoreCampo(campo, v) {
    if (campo === 'stato' && PAROLE_STATO[String(v).toUpperCase()]) return PAROLE_STATO[String(v).toUpperCase()];
    if (campo === 'stato' && PAROLE_STATO[v]) return PAROLE_STATO[v];
    if (campo === 'ruolo' && RUOLI[v]) return RUOLI[v].nome;
    if (campo === 'livello' && LIVELLI[v] !== undefined) return LIVELLI[v];
    if (SI_NO.indexOf(campo) >= 0 && (v === 1 || v === 0 || v === true || v === false)) return v === 1 || v === true ? 'sì' : 'no';
    if (campo === 'avanzamento' && typeof v === 'number') return v + '%';
    if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
    return valoreLeggibile(v);
  }

  /** I campi cambiati fra prima e dopo: [{ campo, nome, prima, dopo }]. Le impostazioni hanno un campo solo, "valore". */
  function campiCambiati(prima, dopo, tabella, idRiga) {
    const p = prima && typeof prima === 'object' ? prima : {};
    const d = dopo && typeof dopo === 'object' ? dopo : {};
    const chiavi = Array.from(new Set(Object.keys(p).concat(Object.keys(d)))).filter(k => CAMPI_RUMORE.indexOf(k) < 0);
    return chiavi.filter(k => valoreLeggibile(p[k]) !== valoreLeggibile(d[k])).map(k => {
      const nomeCampo = tabella === 'impostazioni' && k === 'valore' && NOMI_CAMPI[idRiga] ? NOMI_CAMPI[idRiga] : (NOMI_CAMPI[k] || k);
      return {
        campo: k,
        nome: nomeCampo.replace(/^(il |lo |la |le |gli |i |l')/, '').replace(/^./, x => x.toUpperCase()),
        prima: valoreCampo(k, p[k]),
        dopo: valoreCampo(k, d[k]),
      };
    });
  }

  const NOMI_MODULI = {};
  RIGHE_PERMESSI.forEach(r => { NOMI_MODULI[r.modulo] = r.nome; });

  /**
   * La frase di una voce del registro, a pezzi ({ testo, forte }) così l'interfaccia
   * mette il grassetto senza HTML: "Laura" "ha cambiato la tariffa di" "Rossi Impianti Srl".
   * nomeDi(voce) dà il nome della riga (il server scrive solo il suo codice). Se il
   * server manda già la frase, vale quella.
   */
  function fraseRegistro(v, nomeDi) {
    const chi = (v.utente && (v.utente.nome || v.utente)) || v.chi || 'Qualcuno';
    const pezzi = [{ testo: String(chi).split(' ')[0], forte: true }];
    if (v.frase) { pezzi.push({ testo: ' ' + v.frase }); return pezzi; }
    const p = v.prima && typeof v.prima === 'object' ? v.prima : null;
    const d = v.dopo && typeof v.dopo === 'object' ? v.dopo : null;
    const nome = (nomeDi && nomeDi(v)) || v.nome || (d && d.nome) || (p && p.nome) || v.idRiga || '';
    const dici = (verbo, chiNome) => {
      pezzi.push({ testo: ' ' + verbo + (chiNome ? ' ' : '') });
      if (chiNome) pezzi.push({ testo: String(chiNome), forte: true });
      return pezzi;
    };
    const cambiati = campiCambiati(p, d, v.tabella, v.idRiga);
    const az = String(v.azione || '').toLowerCase();
    const nota = String(v.nota || '').toLowerCase();
    let cosa = COSA[v.tabella] || 'la riga';
    // I codici dei fornitori cominciano con F (F001), quelli dei clienti con C.
    if (v.tabella === 'soggetti' && String(v.idRiga).charAt(0) === 'F') cosa = 'il fornitore';

    if (v.tabella === 'impostazioni') return dici('ha cambiato ' + (NOMI_CAMPI[v.idRiga] || 'l\'impostazione ' + v.idRiga));
    if (v.tabella === 'permessi') {
      const [ruolo, modulo] = String(v.idRiga || '').split(/[./]/);
      pezzi.push({ testo: ' ha cambiato il permesso di ' }, { testo: (RUOLI[ruolo] || { nome: ruolo || '' }).nome, forte: true });
      if (modulo) pezzi.push({ testo: ' su ' }, { testo: NOMI_MODULI[modulo] || modulo, forte: true });
      return pezzi;
    }
    if (v.tabella === 'sessioni') return dici('ha scollegato un dispositivo', nome && nome !== v.idRiga ? 'di ' + nome : '');
    if (v.tabella === 'tentativi_accesso') return dici(v.nota || 'troppe password sbagliate per', v.idRiga);
    // La password nel registro è sempre "(cambiata)", prima e dopo: basta che ci sia.
    if (v.tabella === 'utenti' && p && d && 'password_hash' in d && cambiati.filter(c => c.campo !== 'password_hash').length === 0) return dici('ha cambiato la password di', nome);
    const attivo = cambiati.find(c => c.campo === 'attivo');
    if (v.tabella === 'utenti' && attivo && cambiati.length === 1) return dici(attivo.dopo === 'sì' ? 'ha riattivato' : 'ha disattivato', nome);
    if (v.tabella === 'commessa_persone') return dici('ha cambiato le persone di', nome);
    const arch = cambiati.find(c => c.campo === 'archiviato' || c.campo === 'archiviata');
    if (arch && cambiati.length === 1) return dici((arch.dopo === 'sì' ? 'ha archiviato ' : 'ha ripristinato ') + cosa, nome);
    if (/archivia/.test(az)) return dici('ha archiviato ' + cosa, nome);
    if (/ripristina/.test(az)) return dici('ha ripristinato ' + cosa, nome);
    if (/^tol/.test(nota) || /togli/.test(az) || (p && !d)) return dici('ha tolto ' + cosa, nome);
    if (/duplica/.test(az) && !p) return dici('ha duplicato ' + cosa + ' in', nome);
    if (!p || !Object.keys(p).length) return dici('ha creato ' + cosa, nome);
    if (cambiati.length === 1 && NOMI_CAMPI[cambiati[0].campo]) return dici('ha cambiato ' + NOMI_CAMPI[cambiati[0].campo] + ' di', nome);
    return dici('ha modificato ' + cosa, nome);
  }

  /** Prima e dopo da mostrare sotto la frase: solo se è cambiato un campo solo, che non sia già nella frase. */
  function primaDopo(v) {
    if (/archivia|ripristina/i.test(String(v.azione || ''))) return null;
    const c = campiCambiati(v.prima, v.dopo, v.tabella, v.idRiga);
    if (c.length !== 1) return null;
    if (['archiviato', 'archiviata', 'password_hash', 'revocata', 'persone', 'attivo'].indexOf(c[0].campo) >= 0) return null;
    // Una riga nuova con un campo solo: si vede quel valore (es. "400 €" di una prestazione).
    return { prima: c[0].prima, dopo: c[0].dopo };
  }

  // ------------------------------------------------------------------ numeri nei campi

  /**
   * Un numero da scrivere in un campo da modificare: la virgola per i decimali e
   * NIENTE punto delle migliaia. "2.500" (come lo scrive C.numero per leggere) riletto
   * da C.num diventa 2,5: un budget di 2.500 € salvato senza toccarlo diventava 2,50 €.
   */
  /**
   * Il costo orario da scrivere accanto alle ore nel costo della commessa: quello che il conto ha usato davvero
   * (ogni rapportino tiene il suo, congelato), cioè costo del lavoro diviso ore, se torna al centesimo; altrimenti
   * niente, per non scrivere un numero diverso dal conto. Prima si scriveva il costo orario di oggi.
   */
  function costoOrarioDelConto(ore, lavoro) {
    const o = Number(ore) || 0, l = Number(lavoro) || 0;
    if (o <= 0) return null;
    const orario = Math.round(l / o * 100) / 100;
    return Math.round(orario * o * 100) === Math.round(l * 100) ? orario : null;
  }

  function numeroCampo(n) {
    if (n === null || n === undefined || n === '') return '';
    const x = Number(n);
    if (!isFinite(x)) return '';
    return String(Math.round(x * 100) / 100).replace('.', ',');
  }

  // ------------------------------------------------------------------ password e CSV

  /** Una password iniziale da dire a voce: XXXX-XXXX-XXXX, senza lettere che si confondono. */
  function passwordIniziale(casuale) {
    const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const n = 12;
    let numeri;
    if (casuale) numeri = casuale(n);
    else if (typeof crypto !== 'undefined' && crypto.getRandomValues) numeri = Array.from(crypto.getRandomValues(new Uint32Array(n)));
    else numeri = Array.from({ length: n }, () => Math.floor(Math.random() * 1e9));
    let s = '';
    for (let i = 0; i < n; i++) {
      if (i && i % 4 === 0) s += '-';
      s += alfabeto[numeri[i] % alfabeto.length];
    }
    return s;
  }

  /** Il CSV che Excel apre così com'è: ";" fra le colonne, numeri con la virgola, BOM UTF-8. */
  function csv(intestazioni, righe) {
    const cella = v => {
      let s = typeof v === 'number' ? String(v).replace('.', ',') : valoreLeggibile(v);
      if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    return String.fromCharCode(0xFEFF) + [intestazioni].concat(righe).map(r => r.map(cella).join(';')).join('\r\n') + '\r\n';
  }

  /** Il nome del file da salvare: "Wisper registro 2026-10-23.csv". */
  function nomeEsportazione(cosa, oggi) {
    const nomi = { rapportini: 'rapportini', clienti: 'clienti e fornitori', fornitori: 'fornitori', commesse: 'commesse', registro: 'registro',
      preventivi: 'preventivi', attivita: 'attività', ore: 'ore', spese: 'spese', trasferte: 'trasferte', rimborsi: 'rimborsi',
      fatture: 'fatture', ricevute: 'fatture ricevute', daFatturare: 'da fatturare', riepilogo: 'riepilogo del fatturato', movimenti: 'movimenti', scadenziario: 'scadenziario', impegni: 'tributi e rate',
      persone: 'persone', qualifiche: 'formazione', assenze: 'assenze', presenze: 'presenze', mezzi: 'mezzi', attrezzature: 'attrezzature', tarature: 'tarature',
      manutenzioni: 'manutenzioni', assegnazioni: 'assegnazioni', km: 'km', collaboratori: 'collaboratori', incarichi: 'incarichi', compensi: 'compensi' };
    return 'Wisper ' + (nomi[cosa] || cosa) + ' ' + (oggi || oggiIso()) + '.csv';
  }

  const Regole = {
    RUOLI, ORDINE_RUOLI, ORDINE_RUOLI_PERMESSI, VIETATI_ESTERNO, VOCI_MENU, RIGHE_PERMESSI, LIVELLI,
    permessiTutti, livello, puo, vociMenu, moduloDi, paginaPermessa, primaPagina, titolareDi, ultimoTitolare, quantiAttivi, descriviRuolo,
    saluto, dataTitolo, giornoRegistro, quando, raggruppaPerGiorno, periodo, isoGiorno, oggiIso,
    errorePartitaIva, erroreCodiceFiscale, erroreSdi, erroreEmail, erroreCap, erroreProvincia, validaSoggetto,
    norm, aliasDi, trovaDoppione, filtraSoggetti, contaSoggetti, indirizzoCompleto,
    inRitardo, filtraCommesse, contaCommesse, statoPrestazione, NOMI_STATO_PRESTAZIONE, avanzamento, ordinaPrestazioni, sposta, totaliPrestazioni,
    pezziFormato, formatoDaPezzi, formattaNumero, formatoAParole, erroreFormato,
    destinazione, testoAzione, classeGravita,
    NOMI_CAMPI, campiCambiati, fraseRegistro, primaDopo, valoreLeggibile, valoreCampo,
    passwordIniziale, csv, nomeEsportazione, numeroCampo, costoOrarioDelConto,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperRegole = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
