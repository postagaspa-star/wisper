/*
 * Wisper Ufficio: l'interfaccia (docs/gestionale/fase1-schermate.md, docs/aspetto.md).
 *
 * Si entra con email e password (la pagina di accesso), poi la barra laterale
 * con le voci che il proprio ruolo può vedere, nell'ordine delle specifiche:
 * Dashboard (la casa: cosa fare adesso), Clienti e fornitori, Progetti e
 * commesse, Ore e rapportini, Fatturazione (la vecchia Fine mese), Amministrazione.
 *
 * Tutto quello che si vede viene dal server, e ogni modifica va al server
 * subito: i conti e i permessi li decide lui, qui si mostrano. Le pagine dei
 * moduli stanno in clienti.js, commesse.js e amministrazione.js; qui ci sono
 * la navigazione, la Dashboard, i rapportini e la fatturazione. Durante la visita
 * guidata le stesse pagine girano sui dati di esempio (esempio.js).
 */
(function () {
  'use strict';

  const C = window.WisperConti;
  const D = window.WisperDocumenti;
  const R = window.WisperRegole;
  const B = window.WisperBase;
  const Api = window.WisperApi;
  const Visita = window.WisperVisita;
  const Esempio = window.WisperEsempio;
  const { $, h, aggiungi, svuota, icona, tondo, iniziali, stato, avviso, lavora, finestra, conferma, apriMenu, chiudiMenu,
    campo, conSuffisso, selezione, segmenti, cerca, riga, quadrato, segnaposto } = B;

  // ======================================================================= stato

  const meseDiOggi = () => C.oggiIso().slice(0, 7);
  const filtriRapportini = f => Object.assign({ testo: '', mese: meseDiOggi(), quali: 'tutti', stato: '', chi: '', cliente: '', commessa: '' }, f || {});
  const filtriCommesse = f => Object.assign({ testo: '', stato: 'APERTA', cliente: '', ritardo: false, responsabile: '' }, f || {});

  function leggiLato() {
    try { return localStorage.getItem('wisper-lato') === 'chiuso'; } catch (e) { return false; }
  }

  const S = {
    // null = non lo so ancora; false = serve l'accesso; true = dentro.
    entrato: null,
    erroreAccesso: '',
    uscito: false,
    caricato: false,
    erroreLettura: '',
    io: null,
    ana: anaVuota(),
    rapportini: [],
    ultimaLettura: null,
    dash: null,
    dashErrore: '',
    mese: meseDiOggi(),
    filtri: filtriRapportini(),
    scelti: new Set(),
    aperto: null,
    apriDopo: null,
    filtriCommesse: filtriCommesse(),
    filtriSoggetti: { tipo: 'clienti', testo: '', archiviati: false },
    schedaCommessa: {},
    schedaSoggetto: {},
    esempio: null,
    veri: null,
    latoChiuso: leggiLato(),
  };

  function anaVuota() {
    return { soggetti: [], clienti: [], fornitori: [], commesse: [], referenti: [], sedi: [], prestazioni: [], utenti: [], numerazioni: [], gruppi: [], impostazioni: {} };
  }

  /** I permessi di chi è entrato. */
  const perm = () => (S.io && S.io.permessi) || {};
  const puo = (modulo, minimo) => R.puo(perm(), modulo, minimo);
  const soldi = () => puo('costi');

  // ======================================================================= rete

  /** Le chiamate: al server (tramite il programma), oppure ai dati di esempio durante la visita. */
  const copia = o => JSON.parse(JSON.stringify(o));

  function daEsempio(metodo, percorso, corpo) {
    const r = copia(Esempio.gestisci(S.esempio, metodo, percorso, corpo || {}));
    if (r && r.ok === false) {
      const e = new Error(r.errore || 'Non si può');
      e.permesso = r.permesso;
      return Promise.reject(e);
    }
    return Promise.resolve(r);
  }

  /** Accesso scaduto o revocato: si torna alla pagina di accesso (i dati restano dove sono). */
  function errore(e, scrittura) {
    if (e && e.accesso === false && !S.esempio) {
      S.entrato = false;
      S.uscito = true;
      chiudiPannello(true);
      document.querySelectorAll('.velo').forEach(x => x.remove());
      mostra();
    } else if (e && e.rete && scrittura) {
      e.message = 'Serve la rete per salvare: riprova quando c\'è';
    }
    throw e;
  }

  const Rete = {
    get(percorso) {
      if (S.esempio && percorso.indexOf('/server/') === 0) return daEsempio('GET', percorso);
      return Api.get(percorso).catch(e => errore(e, false));
    },
    post(percorso, corpo) {
      if (S.esempio) {
        if (percorso.indexOf('/server/') === 0) return daEsempio('POST', percorso, corpo);
        if (percorso === '/locale/pdf') return Promise.resolve({ ok: true, percorso: '', nome: 'esempio.pdf', base64: '' });
        if (percorso === '/locale/scegli-file' || percorso === '/locale/salva-file') return Promise.resolve({ ok: false });
      }
      return Api.post(percorso, corpo).catch(e => errore(e, percorso.indexOf('/server/') === 0));
    },
  };

  // ======================================================================= dati

  /**
   * Le anagrafiche come le manda il server: clienti e fornitori diventano
   * un'anagrafica sola (soggetti), come nel database; "clienti" resta per le
   * pagine dei rapportini e delle commesse.
   */
  function normalizzaAna(ana) {
    const a = ana || {};
    const perId = new Map();
    const metti = (lista, chiave) => (lista || []).forEach(x => {
      const s = Object.assign({}, perId.get(x.id) || {}, x);
      if (s[chiave] === undefined || s[chiave] === null) s[chiave] = true;
      if (s.cliente === undefined) s.cliente = false;
      if (s.fornitore === undefined) s.fornitore = false;
      s.cliente = !!s.cliente;
      s.fornitore = !!s.fornitore;
      s.archiviato = !!s.archiviato;
      if (!Array.isArray(s.alias)) s.alias = R.aliasDi(s);
      perId.set(x.id, s);
    });
    metti(a.clienti, 'cliente');
    metti(a.fornitori, 'fornitore');
    const soggetti = Array.from(perId.values());
    return {
      soggetti,
      clienti: soggetti.filter(s => s.cliente),
      fornitori: soggetti.filter(s => s.fornitore),
      commesse: (a.commesse || []).map(m => Object.assign({ persone: [], archiviata: false, modello: false }, m, { archiviata: !!m.archiviata, modello: !!m.modello, persone: m.persone || [] })),
      referenti: a.referenti || [],
      sedi: a.sedi || [],
      prestazioni: a.prestazioni || [],
      utenti: a.utenti || [],
      numerazioni: a.numerazioni || [],
      gruppi: a.gruppi || [],
      impostazioni: a.impostazioni || {},
    };
  }

  async function caricaAnagrafiche() {
    S.ana = normalizzaAna(await Rete.get('/server/anagrafiche?archiviati=1'));
  }
  const ricaricaAnagrafiche = caricaAnagrafiche;

  /** Chi sono e cosa posso fare: si rilegge a ogni apertura (i permessi possono essere cambiati). */
  async function caricaIo() {
    const ris = await Rete.get('/server/io');
    S.io = { utente: ris.utente || {}, permessi: ris.permessi || {}, titolare: ris.titolare || '', ragioneSociale: ris.ragioneSociale || '', interfaccia: ris.interfaccia || {} };
  }

  async function caricaDashboard() {
    if (!puo('dashboard')) return;
    try {
      S.dash = await Rete.get('/server/dashboard');
      S.dashErrore = '';
    } catch (e) {
      if (e.accesso === false) return;
      S.dashErrore = e.message || String(e);
    }
  }

  /** Avvio: il programma sa se su questo computer si è già entrati. */
  async function carica(silenzioso) {
    if (S.esempio) return;
    const st = await Api.get('/locale/stato').catch(() => ({ entrato: false, rete: true }));
    S.locale = st;
    S.versione = st.versione;
    S.aggiornamento = st.aggiornamento || null;
    mostraAggiornamento();
    if (st.appenaInstallato && !S.dettoInstallato) {
      S.dettoInstallato = true;
      avviso('Wisper Ufficio è installato: lo trovi in Start e sul Desktop. Il file scaricato si può cancellare.', false, 10000);
    }
    if (!st.entrato) {
      S.entrato = false;
      S.caricato = false;
      aggiornaStatoServer();
      mostra();
      return;
    }
    S.entrato = true;
    await leggiTutto(silenzioso);
  }

  async function leggiTutto(silenzioso) {
    S.erroreLettura = '';
    const fatto = await lavora(silenzioso ? 'Rileggo' : 'Leggo i dati', async () => {
      try {
        await caricaIo();
        const voglioRapportini = puo('rapportini') || puo('fatturazione') || puo('commesse');
        const [, rap] = await Promise.all([caricaAnagrafiche(), voglioRapportini ? Rete.get('/server/rapportini') : Promise.resolve({ rapportini: [] })]);
        S.rapportini = rap.rapportini || [];
        S.caricato = true;
        S.ultimaLettura = new Date();
        return true;
      } catch (e) {
        if (e.accesso === false) throw e;
        S.erroreLettura = e.message || String(e);
        S.rete = !!e.rete;
        throw e;
      }
    });
    if (fatto) await caricaDashboard();
    aggiornaStatoServer();
    if (silenzioso) ridisegna(); else mostra();
    if (fatto && !S.esempio && !visitaVista()) setTimeout(iniziaVisita, 400);
  }

  /** Mette (o rimette) nell'elenco i rapportini che il server ha appena restituito. */
  function accogli(lista) {
    (lista || []).forEach(r => {
      if (!r) return;
      const i = S.rapportini.findIndex(x => (r.idLocale && x.idLocale === r.idLocale) || (r.id && x.id === r.id));
      if (r.stato === 'ANNULLATO') { if (i >= 0) S.rapportini.splice(i, 1); return; }
      if (i >= 0) S.rapportini[i] = r; else S.rapportini.unshift(r);
    });
    // I numeri della Dashboard cambiano con i rapportini: si rileggono senza fretta.
    caricaDashboard();
  }

  const cliente = id => S.ana.soggetti.find(c => c.id === id);
  const commessa = id => S.ana.commesse.find(m => m.id === id);
  const utente = id => S.ana.utenti.find(u => String(u.id) === String(id));
  /** I clienti che si possono scegliere in un rapportino o in una commessa nuova: niente archiviati. */
  const clientiAttivi = () => S.ana.clienti.filter(c => !c.archiviato);
  const trova = chiave => S.rapportini.find(x => x.id === chiave || x.idLocale === chiave);
  const attivi = () => S.rapportini.filter(r => r.stato !== 'ANNULLATO');
  const somma = lista => C.totali(lista).totale;
  const nRapportini = n => n === 1 ? '1 rapportino' : n + ' rapportini';
  const meseMinuscolo = m => C.nomeMese(m).split(' ')[0].toLowerCase();
  const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const giornoSett = iso => GIORNI[new Date(iso + 'T12:00:00').getDay()];
  const dataBreve = iso => C.data(iso).slice(0, 5);
  const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const dataLunga = iso => { const d = new Date(iso + 'T12:00:00'); return GIORNI_LUNGHI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_LUNGHI[d.getMonth()]; };

  /**
   * Chi paga un rapportino, cioè a chi si fattura: il suo cliente. Elettrodinamica
   * è un cliente come gli altri (a tariffa fissa); il cliente finale presso cui si
   * lavora per lei non conta. È lo stesso raggruppamento del telefono.
   */
  function chiPaga(r) {
    const c = cliente(r.idCliente) || { nome: r.cliente };
    return {
      chiave: 'c:' + (r.idCliente || C.normalizza(r.cliente)), nome: c.nome, email: c.email || '',
      righe: [R.indirizzoCompleto(c), c.partitaIva ? 'P.IVA ' + c.partitaIva : '', c.email],
    };
  }

  function perChiPaga(lista) {
    const gruppi = new Map();
    lista.forEach(r => {
      const chi = chiPaga(r);
      if (!gruppi.has(chi.chiave)) gruppi.set(chi.chiave, Object.assign(chi, { lista: [] }));
      gruppi.get(chi.chiave).lista.push(r);
    });
    return Array.from(gruppi.values()).sort((a, b) => somma(b.lista) - somma(a.lista));
  }

  function intestatarioRiepilogo(lista) {
    const gruppi = perChiPaga(lista);
    if (gruppi.length === 1) return { nome: gruppi[0].nome, righe: gruppi[0].righe, email: gruppi[0].email, mostraCliente: false };
    return { nome: 'Vari clienti', righe: [], email: '', mostraCliente: true };
  }

  function periodoDi(lista) {
    const mesi = Array.from(new Set(lista.map(r => String(r.data).slice(0, 7)))).sort();
    if (!mesi.length) return '';
    if (mesi.length === 1) return C.nomeMese(mesi[0]);
    return C.nomeMese(mesi[0]) + ' – ' + C.nomeMese(mesi[mesi.length - 1]);
  }

  // ======================================================================= navigazione

  /** L'indirizzo della pagina: "commesse/26ST044", "amministrazione/utenti/3"... */
  function percorso() {
    return (location.hash || '#dashboard').slice(1) || 'dashboard';
  }

  window.addEventListener('hashchange', () => {
    mostra();
    const nome = percorso().split('/')[0];
    if (nome === 'rapportini') Visita.azione('nav-rapportini');
    if (nome === 'fatturazione') Visita.azione('nav-fatturazione');
  });

  /** Cambio di pagina: si chiude il pannello e si ridisegna da capo. */
  function mostra() {
    chiudiPannello(true);
    disegnaPagina(true);
    $('#principale').scrollTop = 0;
  }

  /** Dopo un'azione: la stessa pagina coi dati nuovi, il pannello resta aperto. */
  function ridisegna() {
    const scorri = $('#principale').scrollTop;
    disegnaPagina();
    $('#principale').scrollTop = scorri;
    if (S.aperto) disegnaPannello();
  }

  function vai(hash) {
    if (location.hash === hash) mostra(); else location.hash = hash;
  }

  /** Dove porta una riga della Dashboard (o un numero): l'elenco giusto, già filtrato. */
  function vaiA(collegamento) {
    const c = collegamento || {};
    if (c.pagina === 'nuovoRapportino') { moduloRapportino(null, { data: c.data }); return; }
    const d = R.destinazione(c);
    const f = d.filtro;
    // I giorni senza rapportino: si scrive quello del giorno più recente che manca.
    if (d.hash === '#rapportini' && f && f.senzaRapportino && puo('rapportini', 2)) {
      const giorni = ((S.dash && S.dash.numeri && S.dash.numeri.giorniSenzaRapportino) || []).slice().sort();
      if (giorni.length) { moduloRapportino(null, { data: giorni[giorni.length - 1] }); return; }
    }
    if (d.hash === '#commesse') S.filtriCommesse = filtriCommesse(f || {});
    if (c.pagina === 'commessa' && f && f.sezione) S.schedaCommessa[c.id] = f.sezione;
    if (d.hash === '#rapportini') {
      const x = f || {};
      // "stato": BOZZA è il segmento Da firmare; gli altri stati una pillola col filtro. Di tutti i mesi.
      const quali = x.quali || (x.stato === 'BOZZA' ? 'firmare' : 'tutti');
      S.filtri = filtriRapportini({ quali, stato: x.stato && x.stato !== 'BOZZA' ? x.stato : '',
        mese: x.stato || x.quali === 'firmare' ? '' : (x.mese !== undefined ? x.mese : meseDiOggi()),
        cliente: x.idCliente || x.cliente || '', commessa: x.idCommessa || x.commessa || '' });
      S.scelti.clear();
      S.apriDopo = x.apri || null;
    }
    if (d.hash === '#fatturazione' && f && f.mese) S.mese = f.mese;
    if (d.hash === '#clienti' && f) S.filtriSoggetti = Object.assign({ tipo: 'clienti', testo: '', archiviati: false }, f);
    vai(d.hash);
  }

  function disegnaPagina(entra) {
    const p = percorso();
    const [nome, a1, a2] = p.split('/');
    // I vecchi indirizzi della 0.4.0.
    if (nome === 'finemese') { location.replace('#fatturazione'); return; }
    if (nome === 'impostazioni') { location.replace('#amministrazione'); return; }
    chiudiMenu();
    document.body.classList.toggle('fuori', S.entrato === false && !S.esempio);
    disegnaLato();
    const main = svuota($('#principale'));
    const pagina = h('div', { class: 'pagina' + (entra ? ' entra' : '') });
    aggiungi(main, [pagina]);

    if (S.entrato === false && !S.esempio) { vistaAccesso(pagina); return; }
    if (S.entrato === null) { aggiungi(pagina, [segnaposto(3, 90)]); return; }
    if (!S.caricato) {
      if (S.erroreLettura) {
        aggiungi(pagina, [h('div', { class: S.rete ? 'banda calma' : 'banda' }, icona('avviso', 20),
          h('span', { class: 'spazio' }, S.rete ? 'Il server non risponde: controlla la rete e riprova.' : S.erroreLettura),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => leggiTutto() }, 'Riprova'))]);
      } else {
        aggiungi(pagina, [segnaposto(4, 80)]);
      }
      return;
    }
    if (!R.paginaPermessa(perm(), p)) { senzaPermesso(pagina); return; }

    if (nome === 'clienti') a1 ? Clienti.scheda(pagina, decodeURIComponent(a1)) : Clienti.vista(pagina);
    else if (nome === 'commesse') a1 ? Commesse.pagina(pagina, decodeURIComponent(a1)) : Commesse.vista(pagina);
    else if (nome === 'rapportini') vistaRapportini(pagina);
    else if (nome === 'fatturazione') vistaFatturazione(pagina);
    else if (nome === 'amministrazione') Amministrazione.vista(pagina, a1 || '', a2 ? decodeURIComponent(a2) : '');
    else vistaDashboard(pagina);
  }

  /** Il nome del titolare da citare: quello che dice il server, altrimenti il primo titolare attivo. */
  function titolare() {
    return S.io && S.io.titolare ? S.io.titolare.split(' ')[0] : R.titolareDi(S.ana.utenti);
  }

  /** La scheda calma di chi non ha il permesso per una pagina. */
  function senzaPermesso(pagina) {
    aggiungi(pagina, [h('div', { class: 'calmo grande' }, icona('scudo', 22, 2.2),
      h('span', null, 'Non hai il permesso per vedere questa pagina. Chiedi a ' + titolare() + '.'))]);
  }

  // ======================================================================= barra laterale

  /** Quanti clienti hanno qualcosa da fatturare nel mese: il numerino giallo su Fatturazione. */
  function clientiDaFatturare() {
    const mese = meseDiOggi();
    return perChiPaga(attivi().filter(r => (r.stato === 'FIRMATO' || r.stato === 'INVIATO') && String(r.data).slice(0, 7) === mese)).length;
  }

  function disegnaLato() {
    const lato = $('#lato');
    lato.classList.toggle('chiuso', S.latoChiuso);
    const studio = (S.io && S.io.ragioneSociale) || S.ana.impostazioni.RAGIONE_SOCIALE || (S.locale && S.locale.studio) || 'Ufficio';
    $('#lato-studio').textContent = S.esempio ? 'Studio Tecnico GM' : studio;
    const voci = svuota($('#voci'));
    if (S.entrato === false && !S.esempio) return;
    const attiva = R.moduloDi(percorso());
    R.vociMenu(perm()).forEach(v => {
      const n = v.modulo === 'fatturazione' && S.caricato ? clientiDaFatturare() : 0;
      const sua = attiva === v.modulo;
      aggiungi(voci, [h('a', {
        href: '#' + v.modulo, class: 'voce' + (sua ? ' attiva' : ''), 'aria-current': sua ? 'page' : null,
        'data-nome': v.nome, 'data-visita': 'nav-' + v.modulo,
      }, icona(v.icona, 22, 2.2), h('span', { class: 'lab' }, v.nome), n ? h('span', { class: 'num-v', 'aria-label': n + ' da fatturare' }, String(n)) : null)]);
    });
    disegnaChi();
    aggiornaStatoServer();
    $('#richiudi .lab').textContent = S.latoChiuso ? 'Apri il menu' : 'Richiudi il menu';
    $('#richiudi').setAttribute('data-nome', S.latoChiuso ? 'Apri il menu' : 'Richiudi il menu');
  }

  function disegnaChi() {
    const b = svuota($('#chi'));
    const u = (S.io && S.io.utente) || {};
    if (!u.nome) { b.classList.add('nascosto'); return; }
    b.classList.remove('nascosto');
    b.setAttribute('data-nome', u.nome);
    aggiungi(b, [h('span', { class: 'cerchio-io' }, B.lettere(u.nome)),
      h('span', { class: 'lab' }, h('b', null, u.nome), h('span', null, (R.RUOLI[u.ruolo] || { nome: u.ruolo || '' }).nome))]);
  }

  function aggiornaStatoServer() {
    const b = svuota($('#stato-server'));
    b.classList.remove('male');
    if (S.esempio) { aggiungi(b, [h('i', { class: 'pallino-stato' }), h('span', { class: 'lab' }, 'Dati di esempio')]); return; }
    if (S.entrato === false) { b.classList.add('nascosto'); return; }
    b.classList.remove('nascosto');
    if (S.erroreLettura || !S.caricato) {
      if (!S.erroreLettura) { aggiungi(b, [h('span', { class: 'lab' }, 'Leggo…')]); return; }
      b.classList.add('male');
      b.setAttribute('data-nome', 'Server non raggiunto · Riprova');
      aggiungi(b, [h('i', { class: 'pallino-stato' }), h('span', { class: 'lab' }, 'Server non raggiunto', h('span', { class: 'riprova' }, ' · Riprova'))]);
      return;
    }
    const ora = S.ultimaLettura ? S.ultimaLettura.getHours() + ':' + String(S.ultimaLettura.getMinutes()).padStart(2, '0') : '';
    b.setAttribute('data-nome', 'Collegato · letto alle ' + ora);
    aggiungi(b, [h('i', { class: 'pallino-stato' }), h('span', { class: 'lab' }, 'Collegato · letto alle ' + ora)]);
  }

  function richiudiLato() {
    S.latoChiuso = !S.latoChiuso;
    try { localStorage.setItem('wisper-lato', S.latoChiuso ? 'chiuso' : 'aperto'); } catch (e) { /* resta per questa volta */ }
    nascondiNome();
    disegnaLato();
  }

  $('#richiudi').addEventListener('click', richiudiLato);
  $('#stato-server').addEventListener('click', () => { if (!S.esempio && S.entrato) leggiTutto(true); });
  $('#chi').addEventListener('click', () => apriMenu($('#chi'), [
    { testo: 'L\'app: tema, visita guidata, versione', fn: () => vai('#amministrazione/app') },
    S.esempio ? null : { testo: 'Cambia la password', fn: cambiaPassword },
    S.esempio ? null : '-',
    S.esempio ? null : { testo: 'Esci', fn: esci },
  ]));
  document.addEventListener('keydown', e => {
    // Ctrl+B richiude e riapre il menu (come nelle app con la barra laterale).
    if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B') && !document.body.classList.contains('fuori')) {
      e.preventDefault();
      richiudiLato();
    }
  });

  // Richiusa, la barra mostra il nome della voce al passaggio del mouse e al fuoco.
  const nomeVoce = h('div', { class: 'nome-voce', role: 'tooltip' });
  document.body.append(nomeVoce);
  function mostraNome(el) {
    if (!S.latoChiuso || !el || !el.dataset.nome) return;
    const r = el.getBoundingClientRect();
    nomeVoce.textContent = el.dataset.nome;
    nomeVoce.style.top = (r.top + r.height / 2) + 'px';
    nomeVoce.style.left = (r.right + 10) + 'px';
    nomeVoce.classList.add('visto');
  }
  function nascondiNome() { nomeVoce.classList.remove('visto'); }
  ['mouseover', 'focusin'].forEach(t => $('#lato').addEventListener(t, e => { const el = e.target.closest('[data-nome]'); if (el) mostraNome(el); else nascondiNome(); }));
  ['mouseleave', 'focusout'].forEach(t => $('#lato').addEventListener(t, nascondiNome));

  // ======================================================================= aggiornamenti

  /**
   * Il programma controlla da solo ogni ora se c'è una versione nuova, la scarica
   * e la mette al suo posto. Qui si mostra soltanto: un riquadro tranquillo nella
   * barra laterale, "Riavvia" per aprirla subito, altrimenti parte alla prossima apertura.
   */
  function mostraAggiornamento() {
    const a = S.aggiornamento;
    const zona = svuota($('#aggiornamento'));
    const pronto = a && a.stato === 'pronto';
    zona.classList.toggle('nascosto', !pronto);
    if (!pronto) return;
    aggiungi(zona, [h('b', null, 'Versione ' + a.nuova + ' pronta'), h('span', null, 'Parte alla prossima apertura, o subito:'),
      h('button', { type: 'button', class: 'btn giallo', onclick: riavvia }, 'Riavvia Wisper Ufficio')]);
  }

  async function riavvia() {
    await lavora('Riapro Wisper Ufficio', () => Api.post('/locale/riavvia'));
  }

  async function cercaAggiornamenti() {
    const ris = await lavora('Cerco aggiornamenti', () => Api.post('/locale/aggiorna'));
    if (!ris) return;
    S.aggiornamento = ris.aggiornamento || S.aggiornamento;
    mostraAggiornamento();
    if (S.aggiornamento) avviso(S.aggiornamento.stato === 'errore' ? S.aggiornamento.messaggio : (S.aggiornamento.messaggio || 'Hai l’ultima versione'), S.aggiornamento.stato === 'errore');
    if (percorso() === 'amministrazione/app') ridisegna();
  }

  // Il programma lo dice da solo quando la versione nuova è pronta.
  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', e => {
      const m = e.data || {};
      if (m.tipo !== 'aggiornamento') return;
      S.aggiornamento = Object.assign({}, S.aggiornamento || {}, { stato: 'pronto', nuova: m.versione });
      mostraAggiornamento();
      avviso('È pronta la versione ' + m.versione + ' di Wisper Ufficio');
    });
  }

  // ======================================================================= ACCESSO

  /**
   * La pagina di accesso (guida §2): email, password con l'occhio, Entra. Il
   * programma parla col server e tiene la chiave d'accesso per sé: la pagina
   * non la vede mai.
   */
  function vistaAccesso(pagina) {
    const st = S.locale || {};
    let cambiaServer = !st.server;
    const v = {
      server: h('input', { type: 'url', value: st.server || '', placeholder: 'https://…', autocomplete: 'url', spellcheck: 'false' }),
      email: h('input', { type: 'email', value: S.emailAccesso || st.email || '', autocomplete: 'username', spellcheck: 'false' }),
      password: h('input', { type: 'password', autocomplete: 'current-password' }),
    };
    const zonaServer = h('div');
    const zonaErrore = h('div', { 'aria-live': 'polite' });
    const occhio = h('button', { type: 'button', class: 'occhio', 'aria-label': 'Mostra la password', title: 'Mostra la password', onclick: () => {
      const vedi = v.password.type === 'password';
      v.password.type = vedi ? 'text' : 'password';
      occhio.setAttribute('aria-label', vedi ? 'Nascondi la password' : 'Mostra la password');
      occhio.classList.toggle('acceso', vedi);
      v.password.focus();
    } }, icona('occhio', 22, 2.2));
    const entra = h('button', { type: 'submit', class: 'btn-entra' }, 'Entra');

    const disegnaServer = () => {
      svuota(zonaServer);
      if (cambiaServer) aggiungi(zonaServer, [campo('Indirizzo del server', v.server)]);
    };
    const mostraErrore = (testo, calmo) => {
      aggiungi(svuota(zonaErrore), testo ? [h('div', { class: calmo ? 'avviso-calmo' : 'avviso-errore', role: 'alert' }, testo)] : []);
    };
    disegnaServer();
    if (S.erroreAccesso) mostraErrore(S.erroreAccesso.testo, S.erroreAccesso.calmo);
    else if (S.uscito) mostraErrore('Sei uscito da questo dispositivo: entra di nuovo.', true);

    const modulo = h('form', { class: 'accesso', novalidate: true, onsubmit: async e => {
      e.preventDefault();
      const corpo = { email: v.email.value.trim(), password: v.password.value };
      if (cambiaServer) corpo.server = v.server.value.trim();
      if (cambiaServer && !corpo.server) { mostraErrore('Scrivi l\'indirizzo del server.'); v.server.focus(); return; }
      if (!corpo.email) { mostraErrore('Scrivi la tua email.'); v.email.focus(); return; }
      if (!corpo.password) { mostraErrore('Scrivi la password.'); v.password.focus(); return; }
      entra.disabled = true;
      entra.textContent = 'Entro…';
      S.emailAccesso = corpo.email;
      try {
        const ris = await Api.post('/locale/accedi', corpo);
        S.erroreAccesso = '';
        S.uscito = false;
        S.io = { utente: ris.utente || {}, permessi: ris.permessi || {} };
        S.entrato = true;
        if (location.hash !== '#dashboard' && location.hash !== '') history.replaceState(null, '', '#dashboard');
        await carica();
      } catch (x) {
        entra.disabled = false;
        entra.textContent = 'Entra';
        // Senza rete il riquadro è grigio: non è colpa di nessuno.
        S.erroreAccesso = { testo: x.rete ? 'Il server non risponde: controlla la rete e riprova.' : (x.message || 'Non sono riuscito a entrare.'), calmo: !!x.rete };
        mostraErrore(S.erroreAccesso.testo, S.erroreAccesso.calmo);
        v.password.select();
        v.password.focus();
      }
    } },
    h('div', { class: 'simbolo-accesso', 'aria-hidden': 'true' }, simbolo(64)),
    h('div', { class: 'titoli-accesso' }, h('h1', null, 'Entra in Wisper'), st.studio ? h('p', { class: 'sotto-titolo' }, st.studio) : null),
    zonaErrore,
    zonaServer,
    campo('Email', v.email),
    campo('Password', h('div', { class: 'con-occhio' }, v.password, occhio)),
    entra,
    st.server && !cambiaServer ? h('div', { class: 'riga-server' }, h('span', null, 'Server · ' + st.server.replace(/^https?:\/\//, '')),
      h('button', { type: 'button', class: 'btn collegamento', onclick: e => { cambiaServer = true; disegnaServer(); e.target.parentNode.remove(); v.server.focus(); } }, 'Cambia')) : null);
    aggiungi(pagina, [h('div', { class: 'pagina-accesso' }, modulo)]);
    setTimeout(() => (cambiaServer && !v.server.value ? v.server : v.email.value ? v.password : v.email).focus(), 60);
  }

  /** Il simbolo di Wisper (lo stesso dell'icona del programma). */
  function simbolo(dim) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', dim);
    s.setAttribute('height', dim);
    s.setAttribute('viewBox', '0 0 32 32');
    s.innerHTML = '<rect width="32" height="32" rx="9" fill="#1B1B1F"/>' +
      [[16, 7.5], [22, 10], [24.5, 16], [22, 22], [16, 24.5], [10, 22], [7.5, 16], [10, 10]].map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.2" fill="#FFC53D"/>').join('') +
      '<circle cx="16" cy="16" r="3.2" fill="#F2F4F7"/>';
    return s;
  }

  async function esci() {
    await lavora('Esco', () => Api.post('/locale/esci'));
    S.entrato = false;
    S.uscito = false;
    S.caricato = false;
    S.io = null;
    S.ana = anaVuota();
    S.rapportini = [];
    S.dash = null;
    S.erroreAccesso = '';
    history.replaceState(null, '', '#dashboard');
    mostra();
  }

  function cambiaPassword() {
    const v = { vecchia: h('input', { type: 'password', autocomplete: 'current-password' }), nuova: h('input', { type: 'password', autocomplete: 'new-password' }), ancora: h('input', { type: 'password', autocomplete: 'new-password' }) };
    const zona = h('div', { class: 'fila' });
    let errori = {};
    const disegna = () => aggiungi(svuota(zona), [campo('Password di adesso', v.vecchia, errori.vecchia), campo('Password nuova', v.nuova, errori.nuova), campo('Ancora la password nuova', v.ancora, errori.ancora)]);
    disegna();
    let chiudi;
    const salva = async () => {
      errori = {};
      if (!v.vecchia.value) errori.vecchia = 'Scrivi la password che usi adesso';
      if (v.nuova.value.length < 8) errori.nuova = 'Almeno 8 caratteri';
      else if (v.nuova.value !== v.ancora.value) errori.ancora = 'Le due password nuove non sono uguali';
      if (Object.keys(errori).length) { disegna(); return; }
      const ok = await lavora('Cambio la password', () => Rete.post('/server/cambiaPassword', { vecchia: v.vecchia.value, nuova: v.nuova.value }));
      if (ok) { chiudi(); avviso('Password cambiata'); }
    };
    chiudi = finestra({ titolo: 'Cambia la password', corpo: zona,
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Cambia la password')] });
  }

  // ======================================================================= DASHBOARD

  /** L'icona di una riga della Dashboard, dal tipo che manda il server. */
  function iconaVoce(v) {
    if (v.tipo === 'commessa') return v.gravita === 'urgente' ? 'allarme' : 'commesse';
    return { budget: 'allarme', scadenza: 'calendario', firma: 'firma', giorno: 'calendario', giorni: 'calendario', fatturare: 'fatturazione',
      fatturazione: 'fatturazione', responsabile: 'clienti', sdi: 'fatturazione', cliente: 'clienti', rapportini: 'firma', rapportino: 'rapportini',
      prestazioni: 'lista' }[v.tipo] ||
      ({ urgente: 'allarme', attenzione: 'calendario', soldi: 'fatturazione' }[v.gravita] || 'lista');
  }

  function rigaDashboard(v) {
    return riga({
      sinistra: quadrato(iconaVoce(v), R.classeGravita(v.gravita)),
      titolo: v.titolo, sotto: v.dettaglio,
      // A destra solo gli importi (guida §3): i conteggi sono già nel titolo.
      destra: (v.unita === 'euro' || (!v.unita && v.gravita === 'soldi')) && typeof v.quanto === 'number' && soldi() ? h('span', { class: 'quanto' }, C.euro(v.quanto)) : null,
      onclick: () => vaiA(v.collegamento),
    });
  }

  function vistaDashboard(pagina) {
    const u = (S.io && S.io.utente) || {};
    const nome = String(u.nome || '').split(' ')[0];
    aggiungi(pagina, [h('div', { class: 'testata alta' },
      h('div', { class: 'titoli' }, h('span', { class: 'sotto-titolo' }, R.dataTitolo(new Date())),
        h('h1', null, R.saluto() + (nome ? ', ' + nome : ''))),
      puo('rapportini', 2) ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloRapportino(null) }, icona('piu', 18, 2.6), 'Nuovo rapportino') : null)]);

    // I numeri delle commesse: ognuno apre Commesse sul filtro giusto.
    if (puo('commesse')) {
      const n = (S.dash && S.dash.numeri && S.dash.numeri.commesse) || (S.dash && S.dash.commesse) || R.contaCommesse(S.ana.commesse);
      const box = (quanti, che, filtro, rosso) => h('button', { type: 'button', class: 'num-box' + (rosso && quanti > 0 ? ' rosso' : ''), onclick: () => vaiA({ pagina: 'commesse', filtro }) },
        h('b', null, String(quanti || 0)), h('span', null, che));
      aggiungi(pagina, [h('div', { class: 'quattro-num' },
        box(n.aperte, n.aperte === 1 ? 'aperta' : 'aperte', { stato: 'APERTA' }),
        box(n.sospese, n.sospese === 1 ? 'sospesa' : 'sospese', { stato: 'SOSPESA' }),
        box(n.inRitardo, 'in ritardo', { stato: 'APERTA', ritardo: true }, true),
        box(n.chiuse, n.chiuse === 1 ? 'chiusa' : 'chiuse', { stato: 'CHIUSA' }))]);
    }

    const corpo = h('div', { class: 'dash-corpo', 'data-visita': 'dashboard' });
    aggiungi(pagina, [corpo]);
    if (S.dashErrore) {
      aggiungi(corpo, [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'La Dashboard non si è caricata: ' + S.dashErrore),
        h('button', { type: 'button', class: 'btn piccolo', onclick: async () => { await caricaDashboard(); ridisegna(); } }, 'Riprova'))]);
      return;
    }
    if (!S.dash) { aggiungi(corpo, [segnaposto(4, 64)]); return; }

    const urgenti = (S.dash.urgenti || []).slice();
    const settimana = S.dash.settimana || [];
    const pianificare = S.dash.pianificare || [];
    // La cosa più urgente è la prima voce urgente: in grande, e non si ripete sotto.
    const prima = urgenti.shift();
    const sezione = (nomeSez, lista) => lista.length ? h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, nomeSez + ' · ' + lista.length),
      h('div', { class: 'scheda righe' }, lista.map(rigaDashboard))) : null;
    if (!prima && !settimana.length && !pianificare.length) {
      aggiungi(corpo, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da sistemare oggi')]);
      return;
    }
    // La visita illumina la cosa più urgente (se c'è): è lì che si legge "cosa fare adesso".
    if (prima) corpo.removeAttribute('data-visita');
    const piuUrgente = prima ? h('div', { class: 'piu-urgente', 'data-visita': 'dashboard' },
      h('span', { class: 'etichetta' }, 'La cosa più urgente'),
      h('div', { class: 'titolo-urgente' }, prima.titolo),
      prima.dettaglio ? h('div', { class: 'sotto-titolo' }, prima.dettaglio) : null,
      h('button', { type: 'button', class: 'btn', onclick: () => vaiA(prima.collegamento) }, prima.azione || R.testoAzione(prima.collegamento))) : null;
    aggiungi(corpo, [h('div', { class: 'griglia-dash' },
      h('div', { class: 'colonna-dash' }, piuUrgente, sezione('Urgenti', urgenti), sezione('Questa settimana', settimana)),
      h('div', { class: 'colonna-dash' }, sezione('Da pianificare', pianificare)))]);
  }

  // ======================================================================= FATTURAZIONE

  function vistaFatturazione(pagina) {
    const mese = S.mese;
    const scrive = puo('fatturazione', 2);
    const delMese = attivi().filter(r => String(r.data).slice(0, 7) === mese);
    const t = C.totali(delMese);
    const daFatturare = delMese.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
    const bozze = delMese.filter(r => r.stato === 'BOZZA');
    const fatturati = delMese.filter(r => r.stato === 'FATTURATO');
    const spostaMese = d => {
      const [a, m] = mese.split('-').map(Number);
      const x = new Date(a, m - 1 + d, 1);
      S.mese = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
      disegnaPagina();
    };

    aggiungi(pagina, [h('div', { class: 'testata' },
      h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Fatturazione'), h('h1', null, 'Da fatturare'),
        h('span', { class: 'sotto-titolo' }, C.nomeMese(mese) + ' · ' + nRapportini(t.n) + ' · ' + C.numero(t.ore) + ' ore · ' + C.numero(t.km) + ' km')),
      tondo('indietro', 'Mese prima', () => spostaMese(-1)),
      tondo('avanti', 'Mese dopo', () => spostaMese(1)),
      puo('rapportini', 2) ? h('button', { type: 'button', class: 'btn', onclick: () => moduloRapportino(null) }, 'Nuovo rapportino') : null)]);

    const clientiDi = lista => Array.from(new Set(lista.map(r => r.cliente))).join(', ');
    aggiungi(pagina, [h('div', { class: 'tre-colonne' },
      riquadro('Da fatturare', C.euro(somma(daFatturare)), daFatturare.length ? nRapportini(daFatturare.length) + (daFatturare.length === 1 ? ' firmato o inviato' : ' firmati o inviati') : 'niente in attesa', { 'data-visita': 'da-fatturare' }),
      riquadro('Da far firmare', C.euro(somma(bozze)), bozze.length ? nRapportini(bozze.length) + ' di ' + clientiDi(bozze) : 'nessuno'),
      riquadro('Fatturato', C.euro(somma(fatturati)), mese === meseDiOggi() ? 'questo mese' : 'a ' + meseMinuscolo(mese)))]);

    // Da fatturare: una scheda per chi paga.
    const sez = h('div', { class: 'sezione' }, h('h2', null, 'Da fatturare'));
    const gruppi = perChiPaga(daFatturare);
    if (!gruppi.length) {
      aggiungi(sez, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da fatturare a ' + meseMinuscolo(mese))]);
    }
    gruppi.forEach((g, i) => aggiungi(sez, [schedaChiPaga(g, i === 0, scrive)]));
    const prima = attivi().filter(r => (r.stato === 'FIRMATO' || r.stato === 'INVIATO') && String(r.data).slice(0, 7) < mese);
    if (prima.length) {
      const ultimoMese = prima.map(r => String(r.data).slice(0, 7)).sort().reverse()[0];
      aggiungi(sez, [h('div', { class: 'secondario' }, 'Restano da fatturare anche ' + nRapportini(prima.length) + ' dei mesi prima. ',
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => { S.mese = ultimoMese; disegnaPagina(); } }, 'Vai a ' + meseMinuscolo(ultimoMese)))]);
    }
    aggiungi(pagina, [sez]);

    // Da far firmare e commesse da guardare.
    const firmare = h('div', { class: 'sezione' }, h('h2', null, 'Da far firmare'));
    if (bozze.length) {
      aggiungi(firmare, [h('div', { class: 'scheda stretta righe' }, C.ordina(bozze, 'data', -1).slice(0, 6).map(r =>
        h('div', { class: 'riga-el', role: 'button', tabindex: '0', onclick: () => apriPannello(r.id || r.idLocale), onkeydown: e => { if (e.key === 'Enter') apriPannello(r.id || r.idLocale); } },
          h('span', { class: 'giorno' }, h('b', null, String(Number(String(r.data).slice(8, 10)))), h('span', null, giornoSett(r.data))),
          h('span', { class: 'testi' }, h('span', { class: 'titolo' }, r.cliente), h('span', { class: 'sotto' }, [r.descrizione || r.commessa, C.ore(r.oreTotali)].filter(Boolean).join(' · '))),
          soldi() ? h('span', { class: 'valore' }, C.euro(r.totale)) : null)))]);
      if (bozze.length > 6) aggiungi(firmare, [h('button', { type: 'button', class: 'btn collegamento', onclick: () => vaiARapportini({ mese, quali: 'firmare' }) }, 'Vedi tutti i ' + bozze.length)]);
    } else {
      aggiungi(firmare, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Tutti firmati')]);
    }

    const guardare = h('div', { class: 'sezione' }, h('h2', null, 'Commesse da guardare'));
    const daGuardare = S.ana.commesse.filter(m => m.stato === 'APERTA' && !m.archiviata && !m.modello).map(m => ({ m, k: C.cruscotto(m, S.rapportini, S.ana.impostazioni, null, cliente(m.idCliente)) }))
      .filter(x => x.k.livelloOre === 'attenzione' || x.k.livelloOre === 'sforato' || (x.k.giorniMancanti !== null && x.k.giorniMancanti < 0));
    if (daGuardare.length) {
      aggiungi(guardare, [h('div', { class: 'scheda stretta' }, daGuardare.map(({ m, k }) => {
        const scaduta = k.giorniMancanti !== null && k.giorniMancanti < 0;
        const etichetta = k.livelloOre === 'sforato' ? ['Oltre il budget', 'pericolo'] : k.livelloOre === 'attenzione' ? ['Vicina al budget', 'avviso'] : ['Scaduta', 'pericolo'];
        return h('div', { class: 'guarda', role: 'button', tabindex: '0', onclick: () => { location.hash = '#commesse/' + encodeURIComponent(m.id); } },
          h('div', { class: 'alto' }, h('span', { class: 'codice' }, m.id), h('b', null, m.descrizione), h('span', { class: 'stato ' + etichetta[1] }, etichetta[0])),
          k.budgetOre ? h('div', { class: 'barra' }, h('i', { class: k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } })) : null,
          h('div', { class: 'basso' },
            h('span', null, k.budgetOre ? C.numero(k.ore) + ' di ' + C.numero(k.budgetOre) + ' ore' : (scaduta ? 'Fine prevista il ' + C.data(m.finePrevista) : C.numero(k.ore) + ' ore')),
            k.costo.lavoroNoto && soldi() ? h('span', null, 'Margine ' + C.euro(k.margine) + (k.percMargine !== null ? ' · ' + Math.round(k.percMargine * 100) + '%' : '')) : null));
      }))]);
    } else {
      aggiungi(guardare, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nessuna commessa vicina al budget')]);
    }
    aggiungi(pagina, [h('div', { class: 'due-colonne' }, firmare, guardare)]);
  }

  function riquadro(che, quanto, nota, attr, negativo) {
    return h('div', Object.assign({ class: 'riquadro' + (negativo ? ' negativo' : '') }, attr || {}),
      h('span', { class: 'che' }, che), h('span', { class: 'quanto' }, quanto), nota ? h('span', { class: 'nota' }, nota) : null);
  }

  function schedaChiPaga(g, prima, scrive) {
    const t = C.totali(g.lista);
    const tuttiInviati = g.lista.every(r => r.stato === 'INVIATO');
    const quando = g.lista.map(r => r.inviatoIl).filter(Boolean).sort().reverse()[0];
    const azioni = h('div', { class: 'azioni' },
      h('button', { type: 'button', class: 'btn grande', onclick: () => vaiARapportini({ mese: S.mese, quali: 'fatturare', chi: g.chiave }) }, 'Vedi rapportini'),
      !scrive ? null : tuttiInviati
        ? h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': prima ? 'segna-fatturati' : null, onclick: async () => {
          const fatto = await cambiaStato(g.lista, 'FATTURATO');
          if (fatto) Visita.azione('segna-fatturati');
        } }, 'Segna fatturati')
        : h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': prima ? 'prepara-riepilogo' : null, onclick: () => {
          preparaInvio(g.lista);
          Visita.azione('prepara-riepilogo');
        } }, 'Prepara riepilogo'));
    let esito = null;
    if (tuttiInviati) {
      esito = h('span', { class: 'esito' }, icona('spunta', 16, 2.8), 'Riepilogo inviato' + (g.email ? ' a ' + g.email : '') + (quando ? ' il ' + dataBreve(quando) : ''));
    }
    return h('div', { class: 'chi-paga' },
      iniziali(g.nome),
      h('div', { class: 'chi' }, h('b', null, g.nome),
        h('span', { class: 'secondario' }, nRapportini(t.n) + ' · ' + C.ore(t.ore) + ' · ' + C.numero(t.km) + ' km'),
        esito),
      h('span', { class: 'quanto' }, C.euro(t.totale)),
      azioni);
  }

  /** Il codice che avrà una commessa nuova: quello che dice il server (Numerazioni), o 26ST + il numero dopo l'ultimo. */
  function prossimoCodiceCommessa(anno) {
    const n = S.ana.numerazioni.find(x => x.tipo === 'commessa');
    if (n && n.formato) {
      const usati = S.ana.commesse.map(m => { const x = String(m.id).match(/(\d+)$/); return x ? Number(x[1]) : 0; });
      const prossimo = Math.max(Number(n.ultimo) || 0, ...usati, 0) + 1;
      return R.formattaNumero(n.formato, prossimo, anno || new Date().getFullYear());
    }
    return C.prossimoCodiceCommessa(S.ana.commesse.map(x => x.id), anno || new Date().getFullYear());
  }

  function vaiARapportini(filtri) {
    S.filtri = filtriRapportini(filtri);
    S.scelti.clear();
    vai('#rapportini');
  }

  // ======================================================================= RAPPORTINI

  function vistaRapportini(pagina) {
    const f = S.filtri;
    const mesi = Array.from(new Set(attivi().map(r => String(r.data).slice(0, 7)).concat([meseDiOggi()])))
      .filter(Boolean).sort().reverse();
    const area = h('div', { class: 'sezione' });

    const chip = (testo, togli) => h('span', { class: 'filtro-attivo' }, testo,
      h('button', { type: 'button', 'aria-label': 'Togli il filtro ' + testo, onclick: togli }, icona('chiudi', 14, 2.6)));
    const attiviFiltri = [];
    if (f.chi) {
      const g = perChiPaga(attivi()).find(x => x.chiave === f.chi);
      attiviFiltri.push(chip(g ? g.nome : 'Chi paga', () => { f.chi = ''; disegnaPagina(); }));
    }
    if (f.cliente) attiviFiltri.push(chip((cliente(f.cliente) || { nome: f.cliente }).nome, () => { f.cliente = ''; disegnaPagina(); }));
    if (f.commessa) attiviFiltri.push(chip(f.commessa, () => { f.commessa = ''; disegnaPagina(); }));
    if (f.stato) attiviFiltri.push(chip({ FIRMATO: 'Firmati', INVIATO: 'Inviati', FATTURATO: 'Fatturati' }[f.stato] || f.stato, () => { f.stato = ''; disegnaPagina(); }));

    aggiungi(pagina, [
      h('div', { class: 'testata' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Ore e rapportini'), h('h1', null, 'Rapportini')),
        puo('rapportini', 2) ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloRapportino(null) }, icona('piu', 18, 2.6), 'Nuovo rapportino') : null),
      h('div', { class: 'filtri' },
        cerca(f.testo, 'Cliente, commessa, lavoro, numero', v => { f.testo = v; S.scelti.clear(); elencoRapportini(area); }),
        selezione([['', 'Tutti i mesi']].concat(mesi.map(m => [m, C.nomeMese(m)])), f.mese, v => { f.mese = v; S.scelti.clear(); elencoRapportini(area); }),
        segmenti([['tutti', 'Tutti'], ['fatturare', 'Da fatturare'], ['firmare', 'Da firmare', { 'data-visita': 'segmento-firmare' }]], f.quali, v => {
          f.quali = v;
          f.stato = '';
          S.scelti.clear();
          disegnaPagina();
          if (v === 'firmare') Visita.azione('segmento-firmare');
        }),
        attiviFiltri),
      area]);
    elencoRapportini(area);
    // Arrivando dalla Dashboard su un rapportino preciso: si apre il suo pannello.
    if (S.apriDopo) { const k = S.apriDopo; S.apriDopo = null; if (trova(k)) apriPannello(k); }
  }

  function filtrati() {
    const f = S.filtri;
    const stato0 = f.stato || (f.quali === 'fatturare' ? 'dafatturare' : f.quali === 'firmare' ? 'BOZZA' : '');
    let lista = C.filtra(S.rapportini, { testo: f.testo, mese: f.mese, cliente: f.cliente, commessa: f.commessa, stato: stato0 });
    if (f.chi) lista = lista.filter(r => chiPaga(r).chiave === f.chi);
    return C.ordina(lista, 'data', -1);
  }

  /** Le colonne della tabella dei rapportini: senza il permesso dei soldi niente spese e totale. */
  function colonneRapportini(conCasella) {
    return (conCasella ? '22px ' : '') + '112px minmax(0, 1.3fr) minmax(0, 2fr) 54px 54px ' + (soldi() ? '84px 100px ' : '') + '104px';
  }

  function elencoRapportini(area) {
    svuota(area);
    const lista = filtrati();
    // Scegliere più righe serve ai riepiloghi e agli stati della fatturazione.
    const sceglie = puo('fatturazione', 2) && soldi();
    const colonne = colonneRapportini(sceglie);
    if (!lista.length) {
      aggiungi(area, [h('p', { class: 'vuoto' }, S.rapportini.length ? 'Nessun rapportino con questi filtri.' : 'Ancora nessun rapportino.')]);
      return;
    }
    let primaRiga = true;
    perChiPaga(lista).sort((a, b) => a.nome.localeCompare(b.nome, 'it')).forEach(g => {
      const t = C.totali(g.lista);
      const daFatturare = g.lista.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
      const intesta = h('div', { class: 'intesta' }, h('b', null, g.nome),
        h('span', { class: 'riassunto' }, nRapportini(t.n) + ' · ' + C.ore(t.ore) + ' · ' + C.numero(t.km) + ' km'),
        soldi() ? h('span', { class: 'totale' }, C.euro(t.totale)) : null,
        daFatturare.length && sceglie ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => preparaInvio(daFatturare) }, 'Prepara riepilogo') : null);
      const tab = h('div', { class: 'tab' + (S.scelti.size ? ' con-scelti' : '') },
        h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } }, sceglie ? h('span') : null, h('span', null, 'Data · N°'), h('span', null, 'Commessa'),
          h('span', null, 'Lavoro svolto'), h('span', { class: 'n' }, 'Ore'), h('span', { class: 'n' }, 'Km'),
          soldi() ? h('span', { class: 'n' }, 'Spese') : null, soldi() ? h('span', { class: 'n' }, 'Totale') : null, h('span', null, 'Stato')));
      g.lista.forEach(r => {
        const chiave = r.id || r.idLocale;
        const casella = sceglie ? h('input', { type: 'checkbox', class: 'casella', 'aria-label': 'Scegli ' + (r.id || 'il rapportino'), checked: S.scelti.has(chiave),
          onclick: e => { e.stopPropagation(); if (e.target.checked) S.scelti.add(chiave); else S.scelti.delete(chiave); elencoRapportini(area); } }) : null;
        aggiungi(tab, [h('div', {
          class: 'r cliccabile' + (S.aperto === chiave ? ' scelta' : ''), style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0', 'data-chiave': chiave,
          'data-visita': primaRiga ? 'riga-rapportino' : null,
          onclick: () => { apriPannello(chiave); Visita.azione('riga-rapportino'); },
          onkeydown: e => { if (e.key === 'Enter') apriPannello(chiave); },
        },
        sceglie ? h('span', null, casella) : null,
        // La data e sotto il numero: una colonna in meno, più spazio a commessa e lavoro.
        h('span', { class: 'doppia' }, h('span', { class: 'forte' }, dataBreve(r.data)), h('span', { class: 'num' }, r.id || 'in arrivo')),
        h('span', { class: 'doppia' }, h('span', null, r.idCommessa || r.commessa || 'Senza commessa'), r.idCommessa && r.commessa ? h('span', null, r.commessa) : null),
        h('span', { class: 'taglia t2', title: r.descrizione }, r.descrizione),
        h('span', { class: 'n' }, C.numero(r.oreTotali)),
        h('span', { class: 'n' }, C.numero(r.km)),
        soldi() ? h('span', { class: 'n t2' }, C.num(r.spese) ? C.euro(r.spese) : '') : null,
        soldi() ? h('span', { class: 'n forte' }, C.euro(r.totale)) : null,
        h('span', null, stato(r.stato)))]);
        primaRiga = false;
      });
      aggiungi(area, [h('div', { class: 'gruppo-tab' }, intesta, tab)]);
    });
    const t = C.totali(lista);
    aggiungi(area, [h('div', { class: 'totali-fondo' }, h('span', null, C.ore(t.ore)), h('span', null, C.numero(t.km) + ' km'), soldi() ? h('b', null, 'Totale ' + C.euro(t.totale)) : null)]);

    if (S.scelti.size && sceglie) {
      const sel = lista.filter(r => S.scelti.has(r.id || r.idLocale));
      aggiungi(area, [h('div', { class: 'barra-scelti' },
        h('b', null, (sel.length === 1 ? '1 scelto' : sel.length + ' scelti') + ' · ' + C.euro(somma(sel))),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => preparaInvio(sel) }, 'Riepilogo'),
        // I fatturati restano fatturati: "inviato" viene prima.
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => cambiaStato(sel.filter(r => r.stato !== 'FATTURATO'), 'INVIATO') }, 'Segna inviati'),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => cambiaStato(sel, 'FATTURATO') }, 'Segna fatturati'),
        h('button', { type: 'button', class: 'btn piccolo', onclick: () => { S.scelti.clear(); elencoRapportini(area); } }, 'Deseleziona'))]);
    }
  }

  // ----------------------------------------------------------------------- pannello

  function apriPannello(chiave) {
    S.aperto = chiave;
    disegnaPannello();
    document.querySelectorAll('.tab .r[data-chiave]').forEach(x => x.classList.toggle('scelta', x.dataset.chiave === chiave));
  }

  function chiudiPannello(subito) {
    const p = $('.pannello');
    S.aperto = null;
    document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
    if (!p) return;
    if (subito) { p.remove(); return; }
    p.classList.add('via');
    setTimeout(() => p.remove(), 200);
  }

  function passi(st) {
    const tutti = ['BOZZA', 'FIRMATO', 'INVIATO', 'FATTURATO'];
    const nomi = ['Da firmare', 'Firmato', 'Inviato', 'Fatturato'];
    const i = Math.max(0, tutti.indexOf(st));
    return h('div', { class: 'passi', 'aria-label': 'A che punto è' },
      nomi.map((n, k) => h('span', { class: (k <= i ? 'fatto' : '') + (k === i ? ' ora' : '') }, h('i'), h('em', null, n))));
  }

  function rigaConto(sinistra, destra) {
    return h('div', { class: 'rc' }, h('span', null, sinistra), h('span', null, destra));
  }

  function righeDelConto(r, regole) {
    const pagaViaggio = regole ? regole.pagaViaggio : r.pagaViaggio;
    const kmRimborsati = regole ? regole.kmRimborsati : r.kmRimborsati;
    const euroKm = regole ? regole.euroKm : r.euroKm;
    const orePagate = C.num(r.oreLavoro) + (pagaViaggio ? C.num(r.oreViaggio) : 0);
    let ore = C.ore(orePagate) + ' × ' + C.numero(r.tariffa) + ' €';
    if (C.num(r.oreExtra) > 0) ore = C.ore(orePagate) + ' + ' + C.ore(r.oreExtra) + ' extra × ' + C.numero(r.tariffa) + ' €';
    if (!pagaViaggio && C.num(r.oreViaggio) > 0) ore += ' (viaggio non pagato)';
    return [
      rigaConto(ore, C.euro(r.compensoOre)),
      rigaConto(kmRimborsati ? C.numero(r.km) + ' km × ' + C.numero(euroKm) + ' €' : 'Km non rimborsati', C.euro(r.rimborsoKm)),
      C.num(r.spese) > 0 ? rigaConto('Spese' + (r.noteSpese ? ' · ' + r.noteSpese : ''), C.euro(r.spese)) : null,
    ];
  }

  function disegnaPannello() {
    const r = trova(S.aperto);
    const vecchio = $('.pannello');
    if (!r) { if (vecchio) vecchio.remove(); S.aperto = null; return; }
    const bloccato = ['FIRMATO', 'INVIATO', 'FATTURATO'].indexOf(r.stato) >= 0;
    const commessaLunga = r.idCommessa ? r.idCommessa + ' ' + (r.commessa || '') : (r.commessa || 'Senza commessa');

    const corpo = h('div', { class: 'corpo' },
      h('div', { class: 'alto' }, h('span', { class: 'numero' }, r.id || 'Rapportino'), stato(r.stato, true), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
      passi(r.stato),
      h('div', null, h('div', { style: { fontSize: '18px', fontWeight: '800' } }, r.cliente),
        h('div', { class: 't2', style: { fontSize: '15px', color: 'var(--testo2)' } }, commessaLunga + ' · ' + dataLunga(r.data))),
      h('div', { class: 'lavoro' }, r.descrizione || '—'),
      h('div', { class: 'tre-dati' },
        h('span', null, h('em', null, 'Ore'), h('b', null, C.ore(r.oreTotali))),
        h('span', null, h('em', null, 'Km'), h('b', null, C.numero(r.km) + ' km')),
        h('span', null, h('em', null, 'Spese'), h('b', null, C.num(r.spese) ? C.euro(r.spese) : '—'))),
      soldi() ? h('div', { class: 'conto' }, righeDelConto(r),
        h('div', { class: 'tot' }, h('span', null, 'Totale'), h('span', null, C.euro(r.totale)))) : null,
      r.firma ? h('div', { class: 'firma-box' }, h('img', { src: '/file/' + r.firma.id, alt: 'Firma del cliente' }),
        h('div', null, h('b', null, r.firmatario || 'Firmato'), h('span', { class: 'tenue' }, r.firmatoIl ? 'firmato il ' + C.dataOra(r.firmatoIl).replace(' ', ' alle ') : 'firmato'))) : null,
      (r.foto || []).length ? h('div', null, h('div', { class: 'etichetta', style: { marginBottom: '8px' } }, 'Scontrini'),
        h('div', { class: 'miniature' }, r.foto.map(f => h('a', { href: '#', title: 'Apri lo scontrino', onclick: e => { e.preventDefault(); apriFile(f); } }, h('img', { src: '/file/' + f.id, alt: 'Scontrino' }))))) : null,
      r.luogo ? h('div', null, h('div', { class: 'etichetta' }, 'Luogo'), h('div', null, r.luogo)) : null,
      r.noteInterne ? h('div', null, h('div', { class: 'etichetta' }, 'Nota per te'), h('div', { class: 't2' }, r.noteInterne)) : null);

    const pdf = giallo => h('button', { type: 'button', class: 'btn grande' + (giallo ? ' giallo' : ''), 'data-visita': giallo ? 'azione-gialla' : null, onclick: () => pdfRapportino(r, { apri: true }) }, 'PDF');
    // Chi scrive rapportini li corregge; invii e stati della fatturazione sono di chi fattura.
    const scrive = puo('rapportini', 2);
    const fattura = puo('fatturazione', 2) && soldi();
    const voci = [
      bloccato || !scrive ? null : (r.stato !== 'BOZZA' ? { testo: 'Modifica', fn: () => moduloRapportino(r) } : null),
      fattura && (r.stato === 'BOZZA' || r.stato === 'INVIATO') ? { testo: r.stato === 'INVIATO' ? 'Invia di nuovo al cliente' : 'Invia al cliente', fn: () => preparaInvio([r], true) } : null,
      scrive && r.stato === 'BOZZA' ? { testo: 'Carica il foglio firmato', fn: () => caricaFirmato(r) } : null,
      scrive ? { testo: 'Aggiungi uno scontrino', fn: () => aggiungiFoto(r) } : null,
      fattura && (r.stato === 'BOZZA' || r.stato === 'FIRMATO') ? { testo: 'Segna inviato senza email', fn: () => cambiaStato([r], 'INVIATO') } : null,
      fattura && (r.stato === 'BOZZA' || r.stato === 'FIRMATO') ? { testo: 'Segna fatturato', fn: () => cambiaStato([r], 'FATTURATO') } : null,
      fattura && r.stato === 'FATTURATO' ? { testo: 'Non ancora fatturato', fn: () => cambiaStato([r], 'INVIATO') } : null,
      bloccato && (r.stato === 'FIRMATO' ? scrive : fattura) ? { testo: 'Riporta in bozza', fn: () => riportaInBozza(r) } : null,
      scrive && r.stato === 'BOZZA' ? '-' : null,
      scrive && r.stato === 'BOZZA' ? { testo: 'Elimina', fn: () => annulla(r), pericolo: true } : null,
    ].filter(Boolean);
    if (voci[0] === '-') voci.shift();
    const altro = voci.length ? h('button', { type: 'button', class: 'btn grande', 'aria-label': 'Altre azioni', title: 'Altre azioni', style: { width: '52px', padding: '0' } }, icona('altro', 20)) : null;
    if (altro) altro.addEventListener('click', () => apriMenu(altro, voci));
    // UN pulsante giallo: la cosa da fare adesso (quella che il proprio ruolo può fare).
    const principale = {
      BOZZA: scrive ? h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'azione-gialla', onclick: () => moduloRapportino(r) }, 'Modifica') : null,
      FIRMATO: fattura ? h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'azione-gialla', onclick: () => preparaInvio([r], true) }, 'Invia al cliente') : null,
      INVIATO: fattura ? h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'azione-gialla', onclick: () => cambiaStato([r], 'FATTURATO') }, 'Segna fatturato') : null,
    }[r.stato];
    const piede = h('div', { class: 'piede' }, principale ? [pdf(false), altro, principale] : [altro, pdf(true)]);

    const p = h('aside', { class: 'pannello', 'aria-label': 'Il rapportino ' + (r.id || '') }, corpo, piede);
    if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi($('#sovrapposti'), [p]);
  }

  /**
   * Una foto o un documento: il programma lo scarica dal server e lo apre col
   * programma di Windows (i file del server non si aprono nel browser: vogliono la chiave).
   */
  function apriFile(f) {
    if (S.esempio) { avviso('Nella visita i file non si aprono'); return; }
    const nome = f.nome || ('scontrino' + ({ 'image/png': '.png', 'application/pdf': '.pdf' }[f.mime] || '.jpg'));
    Rete.post('/locale/apri-documento', { id: f.id, nome }).catch(e => avviso(e.message, true));
  }

  async function cambiaStato(lista, st) {
    if (!lista.length) { avviso('Niente da cambiare', true); return false; }
    const ids = lista.map(r => r.id || r.idLocale);
    const fatto = await lavora('Aggiorno', async () => {
      const ris = await Rete.post('/server/stato', { ids, stato: st });
      accogli(ris.rapportini);
      return true;
    });
    if (fatto) {
      const nomi = { BOZZA: 'in bozza', INVIATO: 'inviato', FATTURATO: 'fatturato', ANNULLATO: 'eliminato' };
      const parola = nomi[st] || st.toLowerCase();
      // Un rapportino eliminato resta sul server come annullato: Annulla lo rimette com'era.
      const rimetti = st === 'ANNULLATO' && ids.length === 1 && lista[0].id ? { testo: 'Annulla', fn: () => ripristinaRapportino(lista[0].id) } : null;
      avviso(ids.length === 1 ? (st === 'ANNULLATO' ? 'Rapportino eliminato' : 'Segnato ' + parola) : ids.length + ' rapportini segnati ' + parola.replace(/o$/, 'i'), false, null, rimetti);
      S.scelti.clear();
      if (st === 'ANNULLATO') chiudiPannello();
      ridisegna();
    }
    return !!fatto;
  }

  async function riportaInBozza(r) {
    const ok = await conferma('Riportare in bozza?',
      r.firma ? 'La firma del cliente viene tolta: ha firmato il rapportino com\'era. Dopo la correzione va rifirmato.' : 'Il rapportino torna modificabile.',
      'Riporta in bozza');
    if (ok) cambiaStato([r], 'BOZZA');
  }

  async function annulla(r) {
    const ok = await conferma('Eliminare il rapportino?', 'Sparisce dagli elenchi. Resta nell\'archivio, segnato come annullato.', 'Elimina', true);
    if (ok) cambiaStato([r], 'ANNULLATO');
  }

  async function ripristinaRapportino(id) {
    const ris = await lavora('Rimetto il rapportino', () => Rete.post('/server/ripristinaRapportino', { id }));
    if (!ris) return;
    accogli(ris.rapportino ? [ris.rapportino] : ris.rapportini);
    avviso('Rapportino rimesso com\'era');
    ridisegna();
  }

  async function aggiungiFoto(r) {
    const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
    if (!scelto || !scelto.ok) return;
    const fatto = await lavora('Carico lo scontrino', async () => {
      const ris = await Rete.post('/server/caricaFile', {
        tipo: 'spesa', id: r.id, idLocale: r.idLocale, idFile: 'pc' + Date.now().toString(36), mime: scelto.mime, base64: scelto.base64,
      });
      r.foto = (r.foto || []).concat([ris.file]);
      return true;
    });
    if (fatto) { avviso('Scontrino aggiunto'); ridisegna(); }
  }

  /** La scansione di un rapportino firmato a mano: vale come firma. */
  function caricaFirmato(r) {
    const nome = h('input', { type: 'text' });
    let chiudi;
    const vai = async () => {
      if (!nome.value.trim()) { nome.focus(); avviso('Scrivi il nome di chi ha firmato', true); return; }
      const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
      if (!scelto || !scelto.ok) return;
      const fatto = await lavora('Carico la firma', async () => {
        await Rete.post('/server/caricaFile', {
          tipo: 'firma', id: r.id, idLocale: r.idLocale, idFile: 'pc' + Date.now().toString(36),
          mime: scelto.mime, base64: scelto.base64, firmatario: nome.value.trim(),
        });
        const ris = await Rete.get('/server/rapportini?da=' + r.data + '&a=' + r.data);
        accogli(ris.rapportini);
        return true;
      });
      if (fatto) { chiudi(); avviso('Firma caricata: il rapportino è firmato'); ridisegna(); }
    };
    chiudi = finestra({
      titolo: 'Carica il foglio firmato',
      corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'La foto o la scansione del rapportino firmato a mano.'), campo('Nome di chi ha firmato', nome)],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Scegli il file')],
    });
  }

  // ----------------------------------------------------------------------- PDF e invio

  function nomeFile(prefisso, testo) {
    return (prefisso + ' ' + testo).replace(/[\\/:*?"<>|]+/g, '-').trim();
  }

  async function pdfRapportino(r, opzioni) {
    const o = opzioni || {};
    if (S.esempio) { avviso('Nella visita il PDF non si crea'); return null; }
    const html = D.rapportino(r, S.ana, { conImporti: !!o.conImporti, conFoto: !!o.conFoto });
    const ris = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', {
      html, nome: nomeFile(r.id || 'Rapportino', r.cliente + ' ' + C.data(r.data).replace(/\//g, '-')), apri: !!o.apri, base64: !!o.base64,
    }));
    if (ris && o.apri) avviso('PDF salvato in ' + ris.percorso);
    return ris;
  }

  /**
   * Prepara riepilogo (e Invia al cliente per un rapportino solo): a sinistra la
   * pagina com'è, a destra a chi va e cosa contiene, poi Invia per email, Solo il
   * PDF o "Segna come inviato senza email" per quando il PDF lo si consegna in
   * altro modo. Gli importi ci sono nel riepilogo (serve per la fattura), non nel
   * rapportino singolo (al cliente di solito serve il lavoro, non il conto).
   */
  function preparaInvio(lista0, singolo) {
    const lista = C.ordina(lista0, 'data', 1);
    if (!lista.length) { avviso('Non c\'è niente da mettere nel riepilogo', true); return; }
    const r0 = singolo ? lista[0] : null;
    // Il rapportino singolo va al cliente (o, senza la sua email, a chi paga); il riepilogo a chi paga.
    const intest = r0
      ? { nome: r0.cliente, email: (cliente(r0.idCliente) || {}).email || chiPaga(r0).email, righe: [], mostraCliente: false }
      : intestatarioRiepilogo(lista);
    const periodo = periodoDi(lista);
    const imp = S.ana.impostazioni;
    const t = C.totali(lista);
    let chiudi;

    const conImporti = h('input', { type: 'checkbox', checked: !singolo });
    const conFoto = h('input', { type: 'checkbox' });
    const a = h('input', { type: 'email', value: intest.email || '', placeholder: 'email di ' + intest.nome });
    const cc = h('input', { type: 'text' });
    const oggetto = h('input', { type: 'text', value: r0 ? 'Rapportino ' + r0.id + ' del ' + C.data(r0.data) : 'Rapportini ' + periodo + (intest.nome !== 'Vari clienti' ? ' · ' + intest.nome : '') });
    const messaggio = h('textarea', { rows: 5 });
    messaggio.value = (r0
      ? 'Buongiorno,\nin allegato il rapportino del ' + C.data(r0.data) + '.'
      : 'Buongiorno,\nin allegato il riepilogo dei rapportini di ' + periodo.toLowerCase() + '.') +
      '\n\nCordiali saluti\n' + (imp.TECNICO || imp.RAGIONE_SOCIALE || '');
    const campoA = h('div', null, campo('A', a));
    const messaggioZona = h('div', { class: 'fila nascosto', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      campo('Oggetto', oggetto), campo('Copia anche a', cc), campo('Messaggio', messaggio));
    const cambiaMessaggio = h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start' }, onclick: () => { messaggioZona.classList.remove('nascosto'); cambiaMessaggio.remove(); oggetto.focus(); } }, 'Cambia il messaggio');

    // L'anteprima della pagina: com'è fatta, coi numeri veri.
    const foglioA4 = h('div', { class: 'foglio-a4', 'aria-hidden': 'true' });
    const disegnaAnteprima = () => {
      aggiungi(svuota(foglioA4), [
        h('div', { class: 'testa-a4' }, h('span', null, imp.RAGIONE_SOCIALE || 'Lo studio'), h('span', null, r0 ? r0.id : periodo)),
        h('div', { class: 'linea-a4' }),
        h('div', { class: 'parti-a4' }, h('span', null, imp.RAGIONE_SOCIALE || ''), h('span', null, intest.nome)),
        lista.slice(0, 10).map(r => h('div', { class: 'riga-a4' }, h('span', null, dataBreve(r.data) + '  ' + (r0 ? r.descrizione : (r.commessa || r.descrizione))),
          h('span', null, conImporti.checked ? C.euro(r.totale) : C.ore(r.oreTotali)))),
        lista.length > 10 ? h('div', { class: 'riga-a4' }, h('span', null, '… e altri ' + (lista.length - 10))) : null,
        conImporti.checked ? h('div', { class: 'tot-a4' }, C.euro(t.totale)) : h('div', { class: 'tot-a4' }, C.ore(t.ore))]);
    };
    conImporti.addEventListener('change', disegnaAnteprima);
    disegnaAnteprima();

    const creaPdf = async base64 => {
      const html = r0
        ? D.rapportino(r0, S.ana, { conImporti: conImporti.checked, conFoto: conFoto.checked })
        : D.riepilogo(lista, S.ana, intest, periodo, { conImporti: conImporti.checked, conFoto: conFoto.checked });
      const nome = r0 ? nomeFile(r0.id, r0.cliente) : nomeFile('Riepilogo', intest.nome + ' ' + periodo);
      return Rete.post('/locale/pdf', { html, nome, apri: !base64, base64: !!base64 });
    };

    async function manda(aMe) {
      if (!aMe && !a.value.trim()) {
        aggiungi(svuota(campoA), [campo('A', a, 'Manca l\'indirizzo: scrivilo qui (lo puoi salvare in Clienti)')]);
        a.focus();
        return;
      }
      const fatto = await lavora(aMe ? 'Mando la copia' : 'Mando l\'email', async () => {
        const pdf = await creaPdf(true);
        const ris = await Rete.post('/server/inviaEmail', {
          a: a.value.trim(), cc: cc.value.trim(), oggetto: oggetto.value, messaggio: messaggio.value,
          allegati: pdf && pdf.base64 ? [{ nome: pdf.nome, base64: pdf.base64, mime: 'application/pdf' }] : [],
          ids: lista.map(r => r.id), aMe: !!aMe,
        });
        accogli(ris.rapportini);
        return true;
      });
      if (!fatto) return;
      if (aMe) { avviso('Copia mandata alla tua casella'); return; }
      chiudi();
      avviso((r0 ? 'Rapportino' : 'Riepilogo') + ' inviato a ' + a.value.trim() + (S.esempio ? ' (esempio: non è partito niente)' : ''));
      ridisegna();
      Visita.azione('invia-email');
    }

    const altro = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18));
    altro.addEventListener('click', () => apriMenu(altro, [{ testo: 'Mandane una copia a me', fn: () => manda(true) }]));
    const daSegnare = lista.filter(r => r.stato !== 'FATTURATO');

    const contenuto = h('div', { class: 'riepilogo-f' },
      h('div', { class: 'anteprima' }, foglioA4),
      h('div', { class: 'scelte' },
        h('div', { class: 'titolo-r' },
          h('div', null, h('span', { class: 'secondario' }, r0 ? 'Rapportino ' + r0.id : 'Riepilogo di ' + periodo.toLowerCase()),
            h('b', null, intest.nome + ' · ' + C.euro(t.totale))),
          altro, tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')),
        campoA,
        h('label', { class: 'spunta-campo' }, conImporti, 'Con gli importi'),
        h('label', { class: 'spunta-campo' }, conFoto, 'Con le foto degli scontrini'),
        cambiaMessaggio, messaggioZona,
        h('div', { class: 'bottoni' },
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande', onclick: async () => {
            if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
            const ok = await lavora('Preparo il PDF', () => creaPdf(false));
            if (ok) { chiudi(); avviso('PDF salvato in ' + ok.percorso); }
          } }, 'Solo il PDF'),
          h('button', { type: 'button', class: 'btn grande giallo', 'data-visita': 'invia-email', onclick: () => manda(false) }, 'Invia per email')),
        daSegnare.length ? h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'center' }, onclick: async () => {
          chiudi();
          await cambiaStato(daSegnare, 'INVIATO');
        } }, 'Segna come inviato senza email') : null));
    chiudi = finestra({ contenuto, larghezza: 'media', titolo: r0 ? 'Invia il rapportino' : 'Prepara il riepilogo', fuoco: false });
  }

  // ----------------------------------------------------------------------- modulo

  /** Le ultime coppie cliente-commessa usate: le schede da toccare per prime. */
  function recenti(quante) {
    const visti = new Set();
    const out = [];
    C.ordina(attivi(), 'data', -1).forEach(r => {
      const k = (r.idCliente || r.cliente) + '|' + (r.idCommessa || r.commessa);
      if (visti.has(k) || out.length >= quante || !r.cliente) return;
      visti.add(k);
      out.push(r);
    });
    return out;
  }

  function ultimiKm(idCommessa, idCliente, escludi) {
    const lista = C.ordina(attivi().filter(r => r.idLocale !== escludi && C.num(r.km) > 0), 'data', -1);
    const x = (idCommessa && lista.find(r => r.idCommessa === idCommessa)) || (idCliente && lista.find(r => r.idCliente === idCliente));
    return x ? C.num(x.km) : null;
  }

  /**
   * Il rapportino da compilare o correggere dal computer: la stessa sequenza
   * del telefono in una finestra larga. A sinistra per chi, ore e strada; a
   * destra il lavoro, le spese e il conto che si aggiorna mentre si scrive.
   */
  function moduloRapportino(esistente, predefiniti) {
    const p = predefiniti || {};
    const r = esistente ? Object.assign({}, esistente) : {
      idLocale: 'U-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      data: p.data || C.oggiIso(), tecnico: (S.io && S.io.utente && S.io.utente.nome) || S.ana.impostazioni.TECNICO || '', idCliente: p.idCliente || '', cliente: '',
      idCommessa: p.idCommessa || '', commessa: '', oreLavoro: 0, oreExtra: 0, oreViaggio: 0, km: '', spese: '',
      tariffa: null, descrizione: '', luogo: '', ticket: '', noteSpese: '', noteInterne: '',
    };
    if (r.idCliente && !r.cliente) r.cliente = (cliente(r.idCliente) || {}).nome || '';
    if (r.idCommessa && !r.commessa) r.commessa = (commessa(r.idCommessa) || {}).descrizione || '';

    const m = {
      idCliente: r.idCliente, cliente: r.cliente, idCommessa: r.idCommessa, commessa: r.commessa, codiceProposto: '',
      sceltaFatta: !!r.cliente, commessaFatta: !!esistente || !!r.idCommessa,
      oreLavoro: C.num(r.oreLavoro), oreExtra: C.num(r.oreExtra), oreViaggio: C.num(r.oreViaggio),
      extraAperto: C.num(r.oreExtra) > 0, tariffaToccata: !!esistente, nuovoCliente: false,
    };
    let errori = {};

    const v = {
      data: h('input', { type: 'date', value: r.data }),
      ricerca: h('input', { type: 'search', placeholder: 'Scrivi il nome', 'aria-label': 'Cerca il cliente' }),
      nuovaCommessa: h('input', { type: 'text', placeholder: 'Come la chiami tu' }),
      km: h('input', { type: 'text', inputmode: 'decimal', value: r.km !== '' && r.km !== null && r.km !== undefined && (esistente || C.num(r.km)) ? R.numeroCampo(r.km) : '' }),
      tariffa: h('input', { type: 'text', inputmode: 'decimal', value: r.tariffa ? R.numeroCampo(r.tariffa) : '' }),
      descrizione: h('textarea', { rows: 5 }),
      spese: h('input', { type: 'text', inputmode: 'decimal', value: C.num(r.spese) ? R.numeroCampo(r.spese) : '' }),
      noteSpese: h('input', { type: 'text', value: r.noteSpese || '' }),
      luogo: h('input', { type: 'text', value: r.luogo || '' }),
      ticket: h('input', { type: 'text', value: r.ticket || '' }),
      noteInterne: h('textarea', { rows: 2 }),
    };
    v.descrizione.value = r.descrizione || '';
    v.noteInterne.value = r.noteInterne || '';

    const clienteScelto = () => (m.idCliente && cliente(m.idCliente)) || null;
    const regoleAttuali = () => C.regoleDi(clienteScelto(), S.ana.gruppi, S.ana.impostazioni, commessa(m.idCommessa));
    // Il codice che avrà una commessa nuova: si vede subito, come vuole lo studio.
    const codiceNuovo = () => prossimoCodiceCommessa(new Date(v.data.value || Date.now()).getFullYear());
    const sottoCliente = c => (c && c.tariffaFissa !== null && c.tariffaFissa !== undefined) ? 'Tariffa fissa ' + C.numero(c.tariffaFissa) + ' €/h' : 'Tariffa libera';

    const zonaPerChi = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    const zonaOre = h('div');
    const zonaKm = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
    const zonaTariffa = h('div');
    const zonaConto = h('div', { class: 'conto-vivo' });
    const zonaAltro = h('div', { class: 'fila', style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const campoDescrizione = h('div');
    let luogoAperto = !!r.luogo;
    let notaAperta = !!r.noteInterne;

    /** Il prezzo della commessa scelta (o l'ultima tariffa del cliente), se la tariffa non l'ha scritta la persona. */
    function proponiTariffa() {
      if (m.tariffaToccata) return;
      const proposta = C.tariffaProposta(clienteScelto(), S.rapportini, commessa(m.idCommessa));
      v.tariffa.value = proposta ? R.numeroCampo(proposta) : '';
    }

    function scegliCliente(c, nuovo) {
      m.idCliente = c ? c.id : '';
      m.cliente = c ? c.nome : nuovo;
      m.sceltaFatta = true;
      m.commessaFatta = false;
      m.idCommessa = '';
      m.commessa = '';
      m.codiceProposto = '';
      delete errori.cliente;
      if (!m.tariffaToccata) {
        const proposta = C.tariffaProposta(c, S.rapportini, null);
        v.tariffa.value = proposta ? R.numeroCampo(proposta) : '';
      }
      disegnaPerChi();
      disegnaKm();
      disegnaTariffa();
      aggiornaConto();
    }

    function disegnaPerChi() {
      svuota(zonaPerChi);
      if (!m.sceltaFatta) {
        const rec = recenti(4);
        if (rec.length) {
          aggiungi(zonaPerChi, [h('div', { class: 'griglia-scelte' }, rec.map(x => h('button', {
            type: 'button', class: 'scelta-card', onclick: () => {
              const c = cliente(x.idCliente);
              scegliCliente(c, x.cliente);
              m.idCommessa = x.idCommessa; m.commessa = x.commessa; m.commessaFatta = true;
              proponiTariffa(); disegnaPerChi(); disegnaKm(); disegnaTariffa(); aggiornaConto();
            },
          }, iniziali(x.cliente, true), h('span', { class: 'testi' }, h('b', null, x.cliente), h('span', null, x.commessa || 'Senza commessa')))))]);
        }
        aggiungi(zonaPerChi, [h('label', { class: 'cerca' }, icona('cerca', 18), v.ricerca)]);
        const testo = v.ricerca.value.trim();
        if (testo) {
          const trovati = clientiAttivi().filter(c => C.normalizza([c.nome].concat(c.alias || []).join(' ')).indexOf(C.normalizza(testo)) >= 0)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'it')).slice(0, 6);
          trovati.forEach(c => aggiungi(zonaPerChi, [h('button', { type: 'button', class: 'scelta-card', onclick: () => scegliCliente(c) },
            iniziali(c.nome, true), h('span', { class: 'testi' }, h('b', null, c.nome), h('span', null, sottoCliente(c))))]));
          if (!trovati.some(c => C.normalizza(c.nome) === C.normalizza(testo))) {
            // Un cliente nuovo ha la tariffa libera: Elettrodinamica, l'unica fissa, c'è già.
            aggiungi(zonaPerChi, [h('button', { type: 'button', class: 'pillola tratteggiata', style: { alignSelf: 'flex-start' }, onclick: () => scegliCliente(null, testo) }, '+ Cliente nuovo «' + testo + '»')]);
          }
        }
        if (errori.cliente) aggiungi(zonaPerChi, [h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.cliente))]);
        return;
      }
      aggiungi(zonaPerChi, [h('div', { class: 'scelta-card scelta' }, iniziali(m.cliente, true),
        h('span', { class: 'testi' }, h('b', null, m.cliente), h('span', null, m.idCliente ? sottoCliente(clienteScelto()) : 'Cliente nuovo · tariffa libera')),
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => { m.sceltaFatta = false; disegnaPerChi(); } }, 'Cambia'))]);
      const aperte = m.idCliente ? S.ana.commesse.filter(x => x.idCliente === m.idCliente && !x.modello && ((x.stato === 'APERTA' && !x.archiviata) || x.id === m.idCommessa)) : [];
      const pill = (testo, scelta, fn) => h('button', { type: 'button', class: 'pillola' + (scelta ? ' scelta' : ''), onclick: fn }, testo);
      aggiungi(zonaPerChi, [h('div', { class: 'etichetta' }, 'Commessa'),
        h('div', { class: 'pillole' },
          aperte.map(x => pill(x.id + ' · ' + x.descrizione, m.idCommessa === x.id, () => { m.idCommessa = x.id; m.commessa = x.descrizione; m.codiceProposto = ''; m.commessaFatta = true; proponiTariffa(); disegnaPerChi(); disegnaKm(); disegnaTariffa(); aggiornaConto(); })),
          m.commessa && !m.idCommessa ? pill(m.codiceProposto + ' · ' + m.commessa + ' (nuova)', true, () => {}) : null,
          pill('Senza commessa', m.commessaFatta && !m.commessa, () => { m.idCommessa = ''; m.commessa = ''; m.codiceProposto = ''; m.commessaFatta = true; disegnaPerChi(); disegnaKm(); aggiornaConto(); })),
        h('div', { style: { display: 'flex', gap: '8px' } }, h('div', { style: { flex: '1' } }, campo(null, v.nuovaCommessa)),
          h('button', { type: 'button', class: 'btn', onclick: () => {
            const n = v.nuovaCommessa.value.trim();
            if (!n) { v.nuovaCommessa.focus(); return; }
            m.idCommessa = ''; m.commessa = n; m.codiceProposto = codiceNuovo(); m.commessaFatta = true; v.nuovaCommessa.value = ''; disegnaPerChi(); disegnaKm(); aggiornaConto();
          } }, 'Commessa nuova'))]);
    }

    function stepper(nome, chiave, sotto) {
      const valore = h('span', { class: 'valore' }, C.ore(m[chiave]));
      const cambia = d => { m[chiave] = Math.max(0, Math.round((m[chiave] + d) * 2) / 2); delete errori.oreLavoro; disegnaOre(); aggiornaConto(); };
      return h('div', { class: 'riga-stepper' },
        h('span', { class: 'nome' }, h('b', null, nome), sotto ? h('span', { class: 'piccolo' }, sotto) : null),
        h('span', { class: 'stepper' }, tondo('meno', 'Meno ' + nome.toLowerCase(), () => cambia(-0.5)), valore, tondo('piu', 'Più ' + nome.toLowerCase(), () => cambia(0.5))));
    }

    function disegnaOre() {
      const regole = regoleAttuali();
      aggiungi(svuota(zonaOre), [
        stepper('Lavoro', 'oreLavoro'),
        h('div', { class: 'pillole', style: { padding: '0 0 12px' } }, [4, 6, 8].map(n => h('button', {
          type: 'button', class: 'pillola' + (m.oreLavoro === n ? ' scelta' : ''), onclick: () => { m.oreLavoro = n; delete errori.oreLavoro; disegnaOre(); aggiornaConto(); },
        }, C.ore(n)))),
        stepper('Viaggio', 'oreViaggio', regole.pagaViaggio ? 'pagato' : 'non pagato'),
        m.extraAperto ? stepper('Extra', 'oreExtra', regole.maggExtra ? '+' + C.numero(regole.maggExtra) + '%' : null)
          : h('div', { style: { paddingTop: '10px' } }, h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { m.extraAperto = true; disegnaOre(); } }, '+ Ore extra')),
        errori.oreLavoro ? h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.oreLavoro)) : null]);
    }

    function disegnaKm() {
      const ultimi = ultimiKm(m.idCommessa, m.idCliente, r.idLocale);
      aggiungi(svuota(zonaKm), [
        campo('Chilometri', conSuffisso(v.km, 'km'), errori.km),
        h('div', { class: 'pillole' },
          ultimi !== null ? h('button', { type: 'button', class: 'pillola', onclick: () => impostaKm(ultimi) }, 'Ultima volta · ' + C.numero(ultimi) + ' km') : null,
          h('button', { type: 'button', class: 'pillola', onclick: () => impostaKm(0) }, 'Senza auto'))]);
    }
    function impostaKm(n) { v.km.value = R.numeroCampo(n); if (errori.km) { delete errori.km; disegnaKm(); } aggiornaConto(); }

    function disegnaTariffa() {
      const regole = regoleAttuali();
      svuota(zonaTariffa);
      // Senza il permesso dei soldi la tariffa non si vede: la mette il server (l'ultima del cliente).
      if (!soldi()) return;
      if (regole.tariffaFissa !== null) {
        aggiungi(zonaTariffa, [h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Tariffa fissa ' + (m.cliente || ''))),
          h('span', { style: { fontSize: '18px', fontWeight: '800' } }, C.numero(regole.tariffaFissa) + ' €/h'))]);
        return;
      }
      const c = clienteScelto();
      const mc = commessa(m.idCommessa);
      const proposta = C.tariffaProposta(c, S.rapportini, mc);
      const daCommessa = mc && mc.prezzoOrario > 0;
      const nota = daCommessa ? (C.num(v.tariffa.value) === proposta ? 'il prezzo della commessa ' + mc.id : 'la commessa ' + mc.id + ' è a ' + C.numero(proposta) + ' €/h')
        : proposta && C.num(v.tariffa.value) === proposta ? 'l\'ultima usata per ' + (c ? c.nome : 'questo cliente')
        : proposta ? 'l\'ultima volta era ' + C.numero(proposta) + ' €/h' : 'prima volta per questo cliente';
      aggiungi(zonaTariffa, [h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, h('b', null, 'Tariffa oraria'), h('span', { class: 'piccolo' }, nota)),
        h('div', { style: { width: '150px' } }, campo(null, conSuffisso(v.tariffa, '€/h'), errori.tariffa)))]);
    }

    function disegnaAltro() {
      const ticket = S.ana.impostazioni.TICKET_ATTIVO === 'SI' || r.ticket;
      aggiungi(svuota(zonaAltro), [
        h('div', { class: 'riga-campi' }, campo('Spese', conSuffisso(v.spese, '€'), errori.spese), campo('Di cosa', v.noteSpese)),
        (!luogoAperto || !notaAperta) ? h('div', { class: 'pillole' },
          !luogoAperto ? h('button', { type: 'button', class: 'pillola', onclick: () => { luogoAperto = true; disegnaAltro(); v.luogo.focus(); } }, '+ Luogo') : null,
          !notaAperta ? h('button', { type: 'button', class: 'pillola', onclick: () => { notaAperta = true; disegnaAltro(); v.noteInterne.focus(); } }, '+ Una nota per te') : null) : null,
        luogoAperto ? campo('Luogo', v.luogo) : null,
        ticket ? campo('Ticket', v.ticket) : null,
        notaAperta ? campo('Nota per te, non va al cliente', v.noteInterne) : null]);
    }

    function leggiModulo() {
      return {
        idLocale: r.idLocale,
        id: r.id || '',
        data: v.data.value,
        tecnico: r.tecnico || S.ana.impostazioni.TECNICO || '',
        idCliente: m.idCliente,
        cliente: m.cliente,
        idCommessa: m.idCommessa,
        commessa: m.commessa,
        codiceProposto: m.idCommessa ? '' : m.codiceProposto,
        ticket: v.ticket.value.trim(),
        luogo: v.luogo.value.trim(),
        descrizione: v.descrizione.value.trim(),
        oreLavoro: m.oreLavoro,
        oreExtra: m.oreExtra,
        oreViaggio: m.oreViaggio,
        km: C.num(v.km.value),
        spese: C.num(v.spese.value),
        noteSpese: v.noteSpese.value.trim(),
        tariffa: C.numONull(v.tariffa.value),
        noteInterne: v.noteInterne.value.trim(),
      };
    }

    function aggiornaConto() {
      const dati = leggiModulo();
      const regole = regoleAttuali();
      const conto = C.calcola(dati, regole);
      const x = Object.assign({}, dati, conto);
      aggiungi(svuota(zonaConto), [h('div', { class: 'conto' }, righeDelConto(x, regole),
        h('div', { class: 'tot' }, h('span', null, 'Totale'), h('span', null, C.euro(conto.totale))))]);
    }

    function disegnaDescrizione() {
      aggiungi(svuota(campoDescrizione), [campo('Cosa hai fatto', v.descrizione, errori.descrizione)]);
    }

    function valida(dati) {
      const e = {};
      if (!dati.cliente) e.cliente = 'Scegli il cliente';
      if (!dati.descrizione) e.descrizione = 'Scrivi che lavoro hai fatto';
      if (!dati.data) e.data = 'Manca la data';
      ['km', 'spese', 'tariffa'].forEach(k => {
        const t = v[k].value.trim();
        if (t && C.numONull(t) === null) e[k] = 'Non è un numero';
      });
      if (dati.oreLavoro + dati.oreExtra + dati.oreViaggio <= 0) e.oreLavoro = 'Mancano le ore';
      if (soldi() && regoleAttuali().tariffaFissa === null && !(dati.tariffa > 0) && !e.tariffa) e.tariffa = 'Scrivi la tariffa';
      return e;
    }

    v.ricerca.addEventListener('input', () => { m.nuovoCliente = false; const pos = v.ricerca.selectionStart; disegnaPerChi(); v.ricerca.focus(); try { v.ricerca.setSelectionRange(pos, pos); } catch (e) { /* tipo search */ } });
    v.tariffa.addEventListener('input', () => { m.tariffaToccata = true; delete errori.tariffa; aggiornaConto(); });
    v.tariffa.addEventListener('change', disegnaTariffa);
    ['km', 'spese'].forEach(k => v[k].addEventListener('input', aggiornaConto));
    v.descrizione.addEventListener('input', () => { if (errori.descrizione) { delete errori.descrizione; disegnaDescrizione(); v.descrizione.focus(); } });

    async function salva() {
      const dati = leggiModulo();
      errori = valida(dati);
      if (Object.keys(errori).length) {
        disegnaPerChi(); disegnaOre(); disegnaKm(); disegnaTariffa(); disegnaAltro(); disegnaDescrizione();
        avviso('Mancano dei dati: sono segnati in rosso', true);
        return;
      }
      const nuovaAnagrafica = !dati.idCliente || (dati.commessa && !dati.idCommessa);
      const ris = await lavora('Salvo il rapportino', () => Rete.post('/server/salvaRapportino', { rapportino: dati }));
      if (!ris) return;
      accogli([ris.rapportino]);
      if (nuovaAnagrafica) await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      avviso('Salvato: ' + ris.rapportino.id + ' · ' + C.euro(ris.rapportino.totale));
      S.aperto = ris.rapportino.id || ris.rapportino.idLocale;
      ridisegna();
    }

    disegnaPerChi(); disegnaOre(); disegnaKm(); disegnaTariffa(); disegnaAltro(); disegnaDescrizione(); aggiornaConto();
    const corpo = h('div', { class: 'modulo' },
      h('div', { class: 'col' }, campo('Data', v.data), h('h3', null, 'Per chi'), zonaPerChi, h('h3', null, 'Ore e strada'),
        zonaOre, zonaKm, zonaTariffa),
      h('div', { class: 'col' }, h('h3', null, 'Il lavoro'), campoDescrizione, zonaAltro, soldi() ? h('h3', null, 'Il conto') : null, soldi() ? zonaConto : null));
    const chiudi = finestra({
      titolo: esistente ? 'Modifica ' + (r.id || 'il rapportino') : 'Nuovo rapportino', larghezza: 'larga', corpo, fuoco: false,
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', style: { minWidth: '180px' }, onclick: salva }, 'Salva')],
    });
    if (!m.sceltaFatta) setTimeout(() => v.ricerca.focus(), 40);
  }

  /** I rapportini di una commessa: la stessa tabella, senza gruppi. */
  function tabellaRapportini(lista) {
    if (!lista.length) return h('p', { class: 'vuoto' }, 'Ancora nessun rapportino.');
    const colonne = colonneRapportini(false);
    const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } }, h('span', null, 'Data · N°'), h('span', null, 'Cliente'),
      h('span', null, 'Lavoro svolto'), h('span', { class: 'n' }, 'Ore'), h('span', { class: 'n' }, 'Km'),
      soldi() ? h('span', { class: 'n' }, 'Spese') : null, soldi() ? h('span', { class: 'n' }, 'Totale') : null, h('span', null, 'Stato')));
    lista.forEach(r => {
      const chiave = r.id || r.idLocale;
      aggiungi(tab, [h('div', { class: 'r cliccabile' + (S.aperto === chiave ? ' scelta' : ''), style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0', 'data-chiave': chiave, onclick: () => apriPannello(chiave) },
        h('span', { class: 'doppia' }, h('span', { class: 'forte' }, dataBreve(r.data)), h('span', { class: 'num' }, r.id)),
        h('span', { class: 'doppia' }, h('span', null, r.cliente), h('span', null, r.idCommessa)),
        h('span', { class: 'taglia t2', title: r.descrizione }, r.descrizione),
        h('span', { class: 'n' }, C.numero(r.oreTotali)), h('span', { class: 'n' }, C.numero(r.km)),
        soldi() ? h('span', { class: 'n t2' }, C.num(r.spese) ? C.euro(r.spese) : '') : null, soldi() ? h('span', { class: 'n forte' }, C.euro(r.totale)) : null, h('span', null, stato(r.stato)))]);
    });
    const t = C.totali(lista);
    aggiungi(tab, [h('div', { class: 'r piede', style: { gridTemplateColumns: colonne } }, h('span', { style: { gridColumn: 'span 3' } }, 'Totale · ' + nRapportini(t.n)),
      h('span', { class: 'n' }, C.numero(t.ore)), h('span', { class: 'n' }, C.numero(t.km)),
      soldi() ? h('span', { class: 'n' }, C.euro(t.spese)) : null, soldi() ? h('span', { class: 'n' }, C.euro(t.totale)) : null, h('span'))]);
    return tab;
  }

  // ======================================================================= i moduli

  /**
   * Quello che le pagine dei moduli (clienti.js, commesse.js, amministrazione.js)
   * usano di qui: lo stato, la rete, i rapportini, la navigazione.
   */
  const W = {
    S, C, D, R, B, Rete, Api, Visita,
    puo, soldi, perm, cliente, commessa, utente, clientiAttivi, attivi, somma, nRapportini, dataBreve, meseMinuscolo,
    mostra, ridisegna, disegnaPagina, vai, vaiA, vaiARapportini, ricaricaAnagrafiche, caricaDashboard, accogli,
    riquadro, apriPannello, moduloRapportino, preparaInvio, cambiaStato, tabellaRapportini, apriFile,
    iniziaVisita, cercaAggiornamenti, riavvia, statoAggiornamenti, mostraLicenza, esci, filtriCommesse, titolare,
  };
  const Clienti = window.WisperClienti(W);
  const Commesse = window.WisperCommesse(W);
  const Amministrazione = window.WisperAmministrazione(W);

  function statoAggiornamenti() {
    const a = S.aggiornamento;
    if (!a || !a.attivi) return 'Wisper Ufficio';
    if (a.stato === 'pronto') return 'La ' + a.nuova + ' è pronta: parte alla prossima apertura';
    if (a.stato === 'errore') return a.messaggio;
    return 'Si aggiorna da solo' + (a.controllato ? ' · controllato alle ' + a.controllato : '');
  }

  async function mostraLicenza() {
    let testo = 'Figtree, SIL Open Font License 1.1.';
    try { testo = await (await fetch('font/figtree-OFL.txt', { cache: 'no-store' })).text(); } catch (e) { /* resta la riga corta */ }
    let chiudi;
    chiudi = finestra({ titolo: 'Licenze', corpo: h('pre', { class: 'licenza' }, testo), fuoco: false,
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Chiudi')] });
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (chiudiMenu()) return;
    const veli = document.querySelectorAll('.velo');
    if (veli.length) { const v = veli[veli.length - 1]; if (v.chiudi) v.chiudi(); else v.remove(); } else if (S.aperto) chiudiPannello();
  });

  // ======================================================================= visita guidata

  // La visita è cambiata con la fase 1 (barra laterale, Dashboard): si ripropone una volta.
  const CHIAVE_VISITA = 'wisper-visita-2';

  function visitaVista() {
    try { return localStorage.getItem(CHIAVE_VISITA) === '1'; } catch (e) { return true; }
  }

  function iniziaVisita() {
    // Gira sui dati di esempio, con i permessi veri di chi la fa: i passi che il suo ruolo non può fare si saltano.
    if (Visita.attiva || !S.io) return;
    const chi = { titolare: 'manuel', amministrazione: 'laura', collaboratore: 'marco', lettura: 'lettura' }[S.io.utente.ruolo] || 'manuel';
    Visita.inizia({
      puo: serve => !serve || puo(serve[0], serve[1]),
      inizio: () => {
        S.veri = { ana: S.ana, rapportini: S.rapportini, mese: S.mese, filtri: S.filtri, dash: S.dash, dashErrore: S.dashErrore, filtriCommesse: S.filtriCommesse, filtriSoggetti: S.filtriSoggetti };
        S.esempio = Esempio.crea({ chi, permessi: perm() });
        S.ana = normalizzaAna(Esempio.gestisci(S.esempio, 'GET', '/server/anagrafiche?archiviati=1'));
        S.rapportini = Esempio.gestisci(S.esempio, 'GET', '/server/rapportini').rapportini;
        S.dash = Esempio.gestisci(S.esempio, 'GET', '/server/dashboard');
        S.dashErrore = '';
        S.mese = meseDiOggi();
        S.filtri = filtriRapportini();
        S.filtriCommesse = filtriCommesse();
        document.querySelectorAll('.velo').forEach(x => x.remove());
        vai('#dashboard');
      },
      fine: () => {
        try { localStorage.setItem(CHIAVE_VISITA, '1'); } catch (e) { /* la ripropone la prossima volta */ }
        document.querySelectorAll('.velo').forEach(x => x.remove());
        chiudiMenu();
        S.esempio = null;
        if (S.veri) { Object.assign(S, S.veri); S.veri = null; }
        vai('#dashboard');
        if (S.entrato) leggiTutto(true);
      },
    });
  }

  // ======================================================================= avvio

  disegnaLato();
  carica();
})();
