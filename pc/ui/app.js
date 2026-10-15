/*
 * Wisper Ufficio: l'interfaccia.
 *
 * Quattro sezioni: Rapportini, Commesse, Clienti, Impostazioni. Da Pleya si sono
 * presi i Progetti (qui Commesse, come le chiama chi lo usa) e i Rapportini del
 * team, adattati a una persona sola; il resto viene da quello che è stato chiesto:
 * gruppi e tariffe, rimborso ACI, filtri per cliente e mese coi totali, PDF.
 *
 * Tutto quello che si vede viene dal foglio, e ogni modifica va al foglio subito:
 * i conti li fa lo script, qui si mostrano.
 */
(function () {
  'use strict';

  const C = window.WisperConti;
  const D = window.WisperDocumenti;
  const Api = window.WisperApi;

  // ======================================================================= stato

  const S = {
    configurato: false,
    caricato: false,
    ana: { clienti: [], commesse: [], gruppi: [], impostazioni: {} },
    rapportini: [],
    ultimaLettura: null,
    filtri: { testo: '', cliente: '', gruppo: '', mese: C.oggiIso().slice(0, 7), stato: '', commessa: '' },
    ordine: { campo: 'data', verso: -1 },
    scelti: new Set(),
    filtriCommesse: { testo: '', stato: 'APERTA', cliente: '' },
    filtriClienti: { testo: '', gruppo: '' },
  };

  const $ = sel => document.querySelector(sel);

  /** Crea un elemento: h('div', { class: 'x', onclick: f }, figli...) */
  function h(tag, attr) {
    const el = document.createElement(tag);
    if (attr) {
      Object.keys(attr).forEach(k => {
        const v = attr[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (let i = 2; i < arguments.length; i++) aggiungi(el, arguments[i]);
    return el;
  }

  function aggiungi(el, f) {
    if (f === null || f === undefined || f === false) return;
    if (Array.isArray(f)) { f.forEach(x => aggiungi(el, x)); return; }
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }

  function svuota(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // ======================================================================= avvisi

  function avviso(testo, errore) {
    const a = h('div', { class: 'avviso' + (errore ? ' errore' : '') }, testo);
    $('#avvisi').append(a);
    setTimeout(() => a.remove(), errore ? 7000 : 3500);
  }

  let inAttesa = 0;
  /** Esegue un'operazione col foglio mostrando "un momento" e gli errori a parole. */
  async function lavora(testo, fn) {
    inAttesa++;
    let etichetta = $('.attesa');
    if (!etichetta) { etichetta = h('div', { class: 'attesa' }); document.body.append(etichetta); }
    etichetta.textContent = testo + '…';
    try {
      return await fn();
    } catch (e) {
      avviso(e.message || String(e), true);
      return undefined;
    } finally {
      inAttesa--;
      if (inAttesa === 0 && etichetta) etichetta.remove();
    }
  }

  // ======================================================================= finestre

  function modale(titolo, corpo, pulsanti, larga) {
    const velo = h('div', { class: 'velo' });
    const chiudi = () => velo.remove();
    const piede = h('div', { class: 'modale-piede' });
    (pulsanti || []).forEach(p => aggiungi(piede, p === 'spazio' ? h('div', { class: 'spazio' }) : p));
    velo.append(h('div', { class: 'modale' + (larga ? ' larga' : ''), role: 'dialog', 'aria-label': titolo },
      h('div', { class: 'modale-testa' }, h('h2', null, titolo), h('button', { class: 'chiudi', title: 'Chiudi', onclick: chiudi }, '×')),
      h('div', { class: 'modale-corpo' }, corpo),
      pulsanti && pulsanti.length ? piede : null));
    velo.addEventListener('mousedown', e => { if (e.target === velo) chiudi(); });
    $('#sovrapposti').append(velo);
    const primo = velo.querySelector('input, select, textarea');
    if (primo) setTimeout(() => primo.focus(), 30);
    return chiudi;
  }

  function conferma(titolo, testo, siTesto, pericolo) {
    return new Promise(risolvi => {
      let chiudi;
      const no = h('button', { class: 'btn', onclick: () => { chiudi(); risolvi(false); } }, 'Annulla');
      const si = h('button', { class: 'btn ' + (pericolo ? 'pericolo' : 'primario'), onclick: () => { chiudi(); risolvi(true); } }, siTesto || 'Conferma');
      chiudi = modale(titolo, h('p', null, testo), [no, si]);
    });
  }

  let chiudiPannello = null;
  function pannello(contenuto, azioni) {
    if (chiudiPannello) chiudiPannello();
    const velo = h('div', { class: 'pannello-velo' });
    const p = h('aside', { class: 'pannello' },
      h('div', { class: 'pannello-corpo' }, contenuto),
      azioni && azioni.length ? h('div', { class: 'azioni' }, azioni) : null);
    const chiudi = () => { velo.remove(); p.remove(); chiudiPannello = null; };
    velo.addEventListener('click', chiudi);
    $('#sovrapposti').append(velo, p);
    chiudiPannello = chiudi;
    return chiudi;
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const veli = document.querySelectorAll('.velo');
    if (veli.length) veli[veli.length - 1].remove();
    else if (chiudiPannello) chiudiPannello();
  });

  // ======================================================================= campi

  function campo(etichetta, controllo, aiuto, errore) {
    return h('div', { class: 'campo' + (errore ? ' sbagliato' : '') },
      h('label', null, etichetta), controllo,
      errore ? h('div', { class: 'errore' }, errore) : aiuto ? h('div', { class: 'aiuto' }, aiuto) : null);
  }

  function select(opzioni, valore, onchange, attr) {
    const s = h('select', Object.assign({ onchange: e => onchange && onchange(e.target.value) }, attr || {}),
      opzioni.map(o => h('option', { value: o[0], selected: String(o[0]) === String(valore) }, o[1])));
    return s;
  }

  function chip(stato) {
    return h('span', { class: 'chip ' + stato }, C.ETICHETTE_STATO[stato] || (stato.charAt(0) + stato.slice(1).toLowerCase()));
  }

  // ======================================================================= dati

  async function carica(silenzioso) {
    const stato = await Api.get('/locale/stato').catch(() => ({ configurato: false }));
    S.configurato = !!stato.configurato;
    S.cartellaPdf = stato.cartellaPdf;
    S.versione = stato.versione;
    if (!S.configurato) {
      S.caricato = false;
      if (location.hash !== '#impostazioni') location.hash = '#impostazioni';
      mostra();
      return;
    }
    const fatto = await lavora(silenzioso ? 'Aggiorno' : 'Leggo il foglio', async () => {
      const [ana, rap] = await Promise.all([Api.get('/foglio/anagrafiche'), Api.get('/foglio/rapportini')]);
      S.ana = { clienti: ana.clienti || [], commesse: ana.commesse || [], gruppi: ana.gruppi || [], impostazioni: ana.impostazioni || {} };
      S.rapportini = rap.rapportini || [];
      S.caricato = true;
      S.ultimaLettura = new Date();
      return true;
    });
    $('#ultima-lettura').textContent = S.ultimaLettura
      ? 'Letto alle ' + S.ultimaLettura.toTimeString().slice(0, 5) : (fatto ? '' : 'Foglio non raggiunto');
    mostra();
  }

  async function ricaricaAnagrafiche() {
    const ana = await Api.get('/foglio/anagrafiche');
    S.ana = { clienti: ana.clienti || [], commesse: ana.commesse || [], gruppi: ana.gruppi || [], impostazioni: ana.impostazioni || {} };
  }

  /** Mette (o rimette) nell'elenco i rapportini che il foglio ha appena restituito. */
  function accogli(lista) {
    (lista || []).forEach(r => {
      if (!r) return;
      const i = S.rapportini.findIndex(x => (r.idLocale && x.idLocale === r.idLocale) || (r.id && x.id === r.id));
      if (r.stato === 'ANNULLATO') { if (i >= 0) S.rapportini.splice(i, 1); return; }
      if (i >= 0) S.rapportini[i] = r; else S.rapportini.unshift(r);
    });
  }

  const cliente = id => S.ana.clienti.find(c => c.id === id);
  const commessa = id => S.ana.commesse.find(m => m.id === id);
  const gruppo = nome => S.ana.gruppi.find(g => C.normalizza(g.nome) === C.normalizza(nome));

  // ======================================================================= navigazione

  function sezione() {
    const h0 = (location.hash || '#rapportini').slice(1);
    return h0 || 'rapportini';
  }

  window.addEventListener('hashchange', () => mostra());

  function mostra() {
    const [nome, arg] = sezione().split('/');
    document.querySelectorAll('.lato a').forEach(a => a.classList.toggle('attivo', a.dataset.sezione === nome));
    if (chiudiPannello) chiudiPannello();
    const main = svuota($('#principale'));
    if (!S.configurato && nome !== 'impostazioni') {
      main.append(h('p', { class: 'vuoto' }, 'Prima collega il foglio da Impostazioni.'));
      return;
    }
    if (S.configurato && !S.caricato && nome !== 'impostazioni') {
      main.append(h('div', { class: 'banda errore' }, 'Il foglio non risponde. ',
        h('button', { class: 'btn piccolo', onclick: () => carica() }, 'Riprova')));
      return;
    }
    if (nome === 'commesse' && arg) vistaCommessa(main, decodeURIComponent(arg));
    else if (nome === 'commesse') vistaCommesse(main);
    else if (nome === 'clienti') vistaClienti(main);
    else if (nome === 'impostazioni') vistaImpostazioni(main);
    else vistaRapportini(main);
  }

  $('#aggiorna').addEventListener('click', () => carica(true));

  // ======================================================================= RAPPORTINI

  function vistaRapportini(main) {
    const f = S.filtri;
    const mesi = Array.from(new Set(S.rapportini.map(r => String(r.data).slice(0, 7)).concat([C.oggiIso().slice(0, 7)])))
      .filter(Boolean).sort().reverse();
    const clientiOrdinati = S.ana.clienti.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const commesseCliente = S.ana.commesse.filter(m => !f.cliente || m.idCliente === f.cliente);

    const area = h('div');
    const ridisegna = () => { S.scelti.clear(); tabellaRapportini(area); };

    main.append(
      h('div', { class: 'testata' },
        h('h1', null, 'Rapportini'),
        h('div', { class: 'spazio' }),
        h('button', { class: 'btn', onclick: () => apriRiepilogo() }, 'PDF riepilogo'),
        h('button', { class: 'btn giallo', onclick: () => moduloRapportino(null) }, 'Nuovo rapportino')),
      h('div', { class: 'filtri' },
        h('input', { class: 'cerca', type: 'search', placeholder: 'Cerca numero, cliente, commessa, lavoro…', value: f.testo,
          oninput: e => { f.testo = e.target.value; ridisegna(); } }),
        select([['', 'Tutti i mesi']].concat(mesi.map(m => [m, C.nomeMese(m)])), f.mese, v => { f.mese = v; ridisegna(); }),
        select([['', 'Tutti i gruppi']].concat(S.ana.gruppi.map(g => [g.nome, g.nome])), f.gruppo, v => { f.gruppo = v; ridisegna(); }),
        select([['', 'Tutti i clienti']].concat(clientiOrdinati.map(c => [c.id, c.nome])), f.cliente,
          v => { f.cliente = v; f.commessa = ''; mostra(); }),
        select([['', 'Tutte le commesse']].concat(commesseCliente.map(m => [m.id, m.id + ' · ' + m.descrizione])), f.commessa,
          v => { f.commessa = v; ridisegna(); }),
        select([['', 'Tutti gli stati'], ['dafatturare', 'Da fatturare'], ['BOZZA', 'Bozza'], ['FIRMATO', 'Firmato'],
          ['INVIATO', 'Inviato'], ['FATTURATO', 'Fatturato']], f.stato, v => { f.stato = v; ridisegna(); }),
        (f.testo || f.cliente || f.gruppo || f.commessa || f.stato)
          ? h('button', { class: 'btn collegamento', onclick: () => { Object.assign(f, { testo: '', cliente: '', gruppo: '', commessa: '', stato: '' }); mostra(); } }, 'Togli i filtri')
          : null),
      area);
    tabellaRapportini(area);
  }

  function filtrati() {
    return C.ordina(C.filtra(S.rapportini, S.filtri), S.ordine.campo, S.ordine.verso);
  }

  function tabellaRapportini(area, lista, opzioni) {
    const o = opzioni || {};
    svuota(area);
    const righe = lista || filtrati();
    const t = C.totali(righe);
    if (!o.senzaTotali) {
      area.append(h('div', { class: 'totali-riga' },
        totale('Rapportini', String(t.n)),
        totale('Ore', C.numero(t.ore)),
        totale('Km', C.numero(t.km)),
        totale('Spese', C.euro(t.spese)),
        totale('Compenso ore', C.euro(t.compenso)),
        totale('Rimborso km', C.euro(t.rimborso)),
        totale('Totale', C.euro(t.totale), true)));
    }
    if (!righe.length) {
      area.append(h('p', { class: 'vuoto' }, S.rapportini.length ? 'Nessun rapportino con questi filtri.' : 'Ancora nessun rapportino.'));
      return;
    }

    const scelti = S.scelti;
    const barraScelti = h('div', { class: 'filtri' });
    const aggiornaBarra = () => {
      svuota(barraScelti);
      if (!scelti.size || o.senzaAzioni) return;
      const sel = righe.filter(r => scelti.has(r.id));
      barraScelti.append(
        h('span', { class: 'conteggio' }, sel.length === 1 ? '1 scelto' : sel.length + ' scelti · ' + C.euro(C.totali(sel).totale)),
        h('button', { class: 'btn piccolo', onclick: () => apriRiepilogo(sel) }, 'PDF riepilogo'),
        // I fatturati restano fatturati: "inviato" viene prima.
        h('button', { class: 'btn piccolo', onclick: () => cambiaStato(sel.filter(r => r.stato !== 'FATTURATO'), 'INVIATO') }, 'Segna inviati'),
        h('button', { class: 'btn piccolo', onclick: () => cambiaStato(sel, 'FATTURATO') }, 'Segna fatturati'),
        h('button', { class: 'btn collegamento', onclick: () => { scelti.clear(); tabellaRapportini(area, lista, o); } }, 'Deseleziona'));
    };

    const intest = (testo, campo, num) => {
      if (o.senzaOrdine) return h('th', { class: num ? 'n' : '' }, testo);
      const attivo = S.ordine.campo === campo;
      return h('th', {
        class: 'ordinabile' + (num ? ' n' : ''),
        onclick: () => { S.ordine = { campo, verso: attivo ? -S.ordine.verso : (num ? -1 : 1) }; tabellaRapportini(area, lista, o); },
      }, testo + (attivo ? (S.ordine.verso > 0 ? ' ↑' : ' ↓') : ''));
    };

    const tutti = h('input', { type: 'checkbox', title: 'Scegli tutti', checked: righe.every(r => scelti.has(r.id)),
      onclick: e => { e.stopPropagation(); righe.forEach(r => e.target.checked ? scelti.add(r.id) : scelti.delete(r.id)); tabellaRapportini(area, lista, o); } });

    const corpo = h('tbody');
    righe.forEach(r => {
      const tr = h('tr', { class: scelti.has(r.id) ? 'scelta' : '', onclick: () => dettaglioRapportino(r.id || r.idLocale) },
        o.senzaAzioni ? null : h('td', { class: 'spunta' }, h('input', {
          type: 'checkbox', checked: scelti.has(r.id),
          onclick: e => { e.stopPropagation(); e.target.checked ? scelti.add(r.id) : scelti.delete(r.id); tr.classList.toggle('scelta', e.target.checked); aggiornaBarra(); },
        })),
        h('td', null, C.data(r.data)),
        h('td', null, r.id),
        h('td', null, r.cliente, r.gruppo ? h('div', { class: 'secondario' }, r.gruppo) : null),
        h('td', null, r.commessa || h('span', { class: 'secondario' }, '—'), r.idCommessa ? h('div', { class: 'secondario' }, r.idCommessa) : null),
        h('td', { class: 'tronca', title: r.descrizione }, r.descrizione),
        h('td', { class: 'n' }, C.numero(r.oreTotali)),
        h('td', { class: 'n' }, C.numero(r.km)),
        h('td', { class: 'n' }, r.spese ? C.euro(r.spese) : '', (r.foto || []).length ? h('div', { class: 'secondario' }, r.foto.length + ' foto') : null),
        h('td', { class: 'n' }, C.euro(r.totale)),
        h('td', null, chip(r.stato)));
      corpo.append(tr);
    });

    area.append(barraScelti, h('div', { class: 'tabella-scheda' }, h('table', { class: 'dati' },
      h('thead', null, h('tr', null,
        o.senzaAzioni ? null : h('th', { class: 'spunta' }, tutti),
        intest('Data', 'data'), intest('N°', 'id'), intest('Cliente', 'cliente'), intest('Commessa', 'commessa'),
        h('th', null, 'Lavoro svolto'), intest('Ore', 'oreTotali', true), intest('Km', 'km', true),
        intest('Spese', 'spese', true), intest('Totale', 'totale', true), intest('Stato', 'stato'))),
      corpo,
      h('tfoot', null, h('tr', null,
        o.senzaAzioni ? null : h('td'),
        h('td', { colspan: 5 }, 'Totale · ' + (t.n === 1 ? '1 rapportino' : t.n + ' rapportini')),
        h('td', { class: 'n' }, C.numero(t.ore)), h('td', { class: 'n' }, C.numero(t.km)),
        h('td', { class: 'n' }, C.euro(t.spese)), h('td', { class: 'n' }, C.euro(t.totale)), h('td'))))));
    aggiornaBarra();
  }

  function totale(etichetta, valore, forte) {
    return h('div', { class: forte ? 'forte' : '' }, h('div', { class: 'etichetta' }, etichetta), h('div', { class: 'valore' }, valore));
  }

  // ----------------------------------------------------------------------- dettaglio

  const FRASI_STATO = {
    BOZZA: 'Si può ancora modificare. Quando è giusto, va firmato dal cliente o mandato.',
    FIRMATO: 'Firmato dal cliente. Il lavoro non si modifica più: si manda e poi si fattura.',
    INVIATO: 'Mandato al cliente. Manca solo la fattura.',
    FATTURATO: 'Fatturato.',
  };

  function passi(stato) {
    const tutti = ['BOZZA', 'FIRMATO', 'INVIATO', 'FATTURATO'];
    const i = Math.max(0, tutti.indexOf(stato));
    const out = h('div', { class: 'passi' });
    tutti.forEach((s, k) => {
      if (k > 0) out.append(h('div', { class: 'linea' + (k <= i ? ' fatta' : '') }));
      out.append(h('div', { class: 'passo' + (k <= i ? ' fatto' : '') + (k === i ? ' ora' : '') }, h('span', { class: 'punto' }), C.ETICHETTE_STATO[s]));
    });
    return h('div', null, out, h('div', { class: 'frase-stato' }, FRASI_STATO[stato] || ''));
  }

  function dettaglioRapportino(chiave) {
    const r = S.rapportini.find(x => x.id === chiave || x.idLocale === chiave);
    if (!r) return;
    const bloccato = ['FIRMATO', 'INVIATO', 'FATTURATO'].indexOf(r.stato) >= 0;
    const datoGriglia = (et, val) => h('div', null, h('div', { class: 'etichetta' }, et), h('div', { class: 'valore' }, val || '—'));

    const contenuto = h('div', null,
      h('div', { class: 'testata' }, h('h1', null, r.id || 'Rapportino'), chip(r.stato)),
      h('div', { class: 'sottotitolo' }, C.data(r.data) + ' · ' + r.cliente + (r.gruppo ? ' (' + r.gruppo + ')' : '')),
      passi(r.stato),
      h('div', { class: 'dati-griglia' },
        datoGriglia('Commessa', r.idCommessa ? r.idCommessa + ' · ' + r.commessa : ''),
        datoGriglia('Tecnico', r.tecnico),
        datoGriglia('Luogo', r.luogo),
        datoGriglia('Ticket', r.ticket),
        datoGriglia('Ore di lavoro', C.ore(r.oreLavoro)),
        datoGriglia('Ore extra', C.ore(r.oreExtra)),
        datoGriglia('Ore di viaggio', C.ore(r.oreViaggio) + (r.pagaViaggio ? '' : ' (non pagate)')),
        datoGriglia('Chilometri', C.numero(r.km) + ' km')),
      h('div', { class: 'etichetta' }, 'Lavoro svolto'),
      h('div', { class: 'testo-lungo' }, r.descrizione || '—'),
      h('h3', { class: 'etichetta', style: { marginTop: '16px' } }, 'Conto'),
      h('div', { class: 'conto-anteprima' },
        rigaConto('Compenso ore', C.euro(r.compensoOre), C.ore(C.num(r.oreLavoro) + (r.pagaViaggio ? C.num(r.oreViaggio) : 0)) + ' × ' + C.euro(r.tariffa) +
          (C.num(r.oreExtra) ? ' + ' + C.ore(r.oreExtra) + ' extra' + (C.num(r.maggExtra) ? ' (+' + C.numero(r.maggExtra) + '%)' : '') : '')),
        rigaConto('Rimborso km', C.euro(r.rimborsoKm), r.kmRimborsati ? C.numero(r.km) + ' km × ' + C.numero(r.euroKm) + ' €' : 'non rimborsati'),
        rigaConto('Spese', C.euro(r.spese), r.noteSpese),
        h('div', { class: 'riga tot' }, h('span', null, 'Totale'), h('span', null, C.euro(r.totale)))),
      h('h3', { class: 'etichetta', style: { marginTop: '16px' } }, 'Scontrini'),
      (r.foto || []).length
        ? h('div', { class: 'foto-griglia' }, r.foto.map(f => h('a', { href: f.url, target: '_blank', title: 'Apri su Drive' }, h('img', { src: '/file/' + f.id, alt: 'Scontrino' }))))
        : h('div', { class: 'secondario' }, 'Nessuna foto.'),
      h('h3', { class: 'etichetta', style: { marginTop: '16px' } }, 'Firma del cliente'),
      r.firma
        ? h('div', null, h('img', { class: 'firma-img', src: '/file/' + r.firma.id, alt: 'Firma' }),
          h('div', { class: 'secondario' }, (r.firmatario || '') + (r.firmatoIl ? ' · ' + C.dataOra(r.firmatoIl) : '')))
        : h('div', { class: 'secondario' }, 'Non ancora firmato.'),
      r.noteInterne ? h('div', null, h('h3', { class: 'etichetta', style: { marginTop: '16px' } }, 'Note interne (non vanno sul PDF)'),
        h('div', { class: 'testo-lungo' }, r.noteInterne)) : null);

    const azioni = [];
    if (!bloccato) azioni.push(h('button', { class: 'btn primario', onclick: () => moduloRapportino(r) }, 'Modifica'));
    azioni.push(h('button', { class: 'btn', onclick: () => pdfRapportino(r, { apri: true }) }, 'PDF'));
    if (r.stato !== 'FATTURATO') azioni.push(h('button', { class: 'btn', onclick: () => apriEmail({ rapportini: [r] }) }, 'Invia al cliente'));
    if (r.stato === 'BOZZA' || r.stato === 'FIRMATO') azioni.push(h('button', { class: 'btn', onclick: () => cambiaStato([r], 'INVIATO') }, 'Segna inviato senza email'));
    if (r.stato === 'BOZZA') azioni.push(h('button', { class: 'btn', onclick: () => caricaFirmato(r) }, 'Carica foglio firmato'));
    if (r.stato !== 'FATTURATO') azioni.push(h('button', { class: 'btn', onclick: () => cambiaStato([r], 'FATTURATO') }, 'Segna fatturato'));
    if (r.stato === 'FATTURATO') azioni.push(h('button', { class: 'btn', onclick: () => cambiaStato([r], 'INVIATO') }, 'Non ancora fatturato'));
    azioni.push(h('button', { class: 'btn', onclick: () => aggiungiFoto(r) }, 'Aggiungi scontrino'));
    if (bloccato) azioni.push(h('button', { class: 'btn', onclick: () => riportaInBozza(r) }, 'Riporta in bozza'));
    if (r.stato === 'BOZZA') azioni.push(h('button', { class: 'btn pericolo', onclick: () => annulla(r) }, 'Elimina'));
    pannello(contenuto, azioni);
  }

  function rigaConto(etichetta, valore, sotto) {
    return h('div', { class: 'riga' }, h('span', null, etichetta, sotto ? h('div', { class: 'secondario' }, sotto) : null), h('span', null, valore));
  }

  async function cambiaStato(lista, stato) {
    if (!lista.length) { avviso('Niente da cambiare', true); return; }
    const ids = lista.map(r => r.id || r.idLocale);
    const fatto = await lavora('Aggiorno lo stato', async () => {
      const ris = await Api.post('/foglio/stato', { ids, stato });
      accogli(ris.rapportini);
      return true;
    });
    if (fatto) {
      avviso(ids.length === 1 ? 'Segnato ' + C.ETICHETTE_STATO[stato].toLowerCase() : ids.length + ' rapportini segnati ' + C.ETICHETTE_STATO[stato].toLowerCase());
      mostra();
    }
  }

  async function riportaInBozza(r) {
    const ok = await conferma('Riportare in bozza?',
      r.firma ? 'La firma del cliente viene tolta: ha firmato il rapportino com\'era. Dopo la correzione va rifirmato.' : 'Il rapportino torna modificabile.',
      'Riporta in bozza');
    if (ok) cambiaStato([r], 'BOZZA');
  }

  async function annulla(r) {
    const ok = await conferma('Eliminare il rapportino?', 'Sul foglio resta, segnato come annullato: si recupera da lì.', 'Elimina', true);
    if (ok) cambiaStato([r], 'ANNULLATO');
  }

  async function aggiungiFoto(r) {
    const scelto = await Api.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
    if (!scelto || !scelto.ok) return;
    const fatto = await lavora('Carico lo scontrino', async () => {
      const ris = await Api.post('/foglio/caricaFile', {
        tipo: 'spesa', id: r.id, idLocale: r.idLocale, idFile: 'pc' + Date.now().toString(36), mime: scelto.mime, base64: scelto.base64,
      });
      r.foto = (r.foto || []).concat([ris.file]);
      return true;
    });
    if (fatto) { avviso('Scontrino aggiunto'); mostra(); dettaglioRapportino(r.id || r.idLocale); }
  }

  /** La scansione di un rapportino firmato a mano: vale come firma. */
  function caricaFirmato(r) {
    const nome = h('input', { type: 'text', placeholder: 'Chi ha firmato' });
    let chiudi;
    const vai = async () => {
      if (!nome.value.trim()) { nome.focus(); return; }
      const scelto = await Api.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
      if (!scelto || !scelto.ok) return;
      const fatto = await lavora('Carico la firma', async () => {
        await Api.post('/foglio/caricaFile', {
          tipo: 'firma', id: r.id, idLocale: r.idLocale, idFile: 'pc' + Date.now().toString(36),
          mime: scelto.mime, base64: scelto.base64, firmatario: nome.value.trim(),
        });
        const ris = await Api.get('/foglio/rapportini?da=' + r.data + '&a=' + r.data);
        accogli(ris.rapportini);
        return true;
      });
      if (fatto) { chiudi(); avviso('Firma caricata'); mostra(); dettaglioRapportino(r.id); }
    };
    chiudi = modale('Carica il foglio firmato', h('div', null,
      h('p', null, 'La foto o la scansione del rapportino firmato a mano. Il rapportino diventa firmato.'),
      campo('Nome di chi ha firmato', nome)),
    [h('button', { class: 'btn', onclick: () => chiudi() }, 'Annulla'), h('button', { class: 'btn primario', onclick: vai }, 'Scegli il file')]);
  }

  // ----------------------------------------------------------------------- modulo

  /**
   * Il rapportino da compilare o correggere dal computer: gli stessi campi del
   * telefono, con l'anteprima del conto mentre si scrive.
   */
  function moduloRapportino(esistente, predefiniti) {
    const p = predefiniti || { idCliente: S.filtri.cliente, idCommessa: S.filtri.commessa };
    const r = esistente ? Object.assign({}, esistente) : {
      idLocale: 'U-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      data: C.oggiIso(), tecnico: S.ana.impostazioni.TECNICO || '', idCliente: p.idCliente || '', cliente: '',
      idCommessa: p.idCommessa || '', commessa: '', oreLavoro: '', oreExtra: '', oreViaggio: '', km: '', spese: '',
      tariffa: null, descrizione: '', luogo: '', ticket: '', noteSpese: '', noteInterne: '',
    };
    if (r.idCliente && !r.cliente) r.cliente = (cliente(r.idCliente) || {}).nome || '';
    if (r.idCommessa && !r.commessa) r.commessa = (commessa(r.idCommessa) || {}).descrizione || '';
    let tariffaToccata = !!esistente;
    let gruppoNuovo = 'Privato';
    let errori = {};

    const corpo = h('div');
    let chiudi;

    const valori = {
      data: h('input', { type: 'date', value: r.data }),
      cliente: h('input', { type: 'text', list: 'elenco-clienti', value: r.cliente, autocomplete: 'off' }),
      commessa: h('input', { type: 'text', list: 'elenco-commesse', value: r.idCommessa ? r.idCommessa + ' · ' + r.commessa : r.commessa, autocomplete: 'off' }),
      ticket: h('input', { type: 'text', value: r.ticket }),
      luogo: h('input', { type: 'text', value: r.luogo }),
      descrizione: h('textarea', { rows: 4 }),
      oreLavoro: h('input', { type: 'text', inputmode: 'decimal', value: esistente ? C.numero(r.oreLavoro) : '' }),
      oreExtra: h('input', { type: 'text', inputmode: 'decimal', value: esistente && r.oreExtra ? C.numero(r.oreExtra) : '' }),
      oreViaggio: h('input', { type: 'text', inputmode: 'decimal', value: esistente && r.oreViaggio ? C.numero(r.oreViaggio) : '' }),
      km: h('input', { type: 'text', inputmode: 'decimal', value: esistente && r.km ? C.numero(r.km) : '' }),
      tariffa: h('input', { type: 'text', inputmode: 'decimal', value: r.tariffa ? C.numero(r.tariffa) : '' }),
      spese: h('input', { type: 'text', inputmode: 'decimal', value: esistente && r.spese ? C.numero(r.spese) : '' }),
      noteSpese: h('input', { type: 'text', value: r.noteSpese }),
      noteInterne: h('textarea', { rows: 2 }),
    };
    valori.descrizione.value = r.descrizione || '';
    valori.noteInterne.value = r.noteInterne || '';

    const elencoClienti = h('datalist', { id: 'elenco-clienti' }, S.ana.clienti.map(c => h('option', { value: c.nome }, c.gruppo)));
    const elencoCommesse = h('datalist', { id: 'elenco-commesse' });

    /** Il cliente scelto: per codice se lo conosciamo, altrimenti per nome. */
    const clienteScelto = () => {
      const nome = valori.cliente.value.trim();
      return S.ana.clienti.find(c => C.normalizza(c.nome) === C.normalizza(nome)) || null;
    };
    const commessaScelta = (c) => {
      const testo = valori.commessa.value.trim();
      if (!testo) return null;
      const codice = testo.split(' · ')[0].trim().toUpperCase();
      return S.ana.commesse.find(m => m.id.toUpperCase() === codice && (!c || m.idCliente === c.id)) ||
        S.ana.commesse.find(m => c && m.idCliente === c.id && C.normalizza(m.descrizione) === C.normalizza(testo)) || null;
    };

    const zonaGruppo = h('div');
    const zonaTariffa = h('div');
    const zonaConto = h('div');
    const zonaErrori = {};

    function aggiornaCommesse() {
      const c = clienteScelto();
      svuota(elencoCommesse);
      if (c) S.ana.commesse.filter(m => m.idCliente === c.id && m.stato === 'APERTA')
        .forEach(m => elencoCommesse.append(h('option', { value: m.id + ' · ' + m.descrizione }, m.indirizzo || '')));
    }

    function regoleAttuali() {
      const c = clienteScelto();
      return C.regoleDi(c || { gruppo: gruppoNuovo }, S.ana.gruppi, S.ana.impostazioni);
    }

    function aggiornaDipendenti(daCliente) {
      const c = clienteScelto();
      svuota(zonaGruppo);
      if (!c && valori.cliente.value.trim()) {
        zonaGruppo.append(campo('Cliente nuovo: di che gruppo è?',
          select(S.ana.gruppi.map(g => [g.nome, g.nome]).concat(S.ana.gruppi.length ? [] : [['Privato', 'Privato']]), gruppoNuovo,
            v => { gruppoNuovo = v; aggiornaDipendenti(); }),
          'Lo aggiungo al foglio quando salvi.'));
      }
      const regole = regoleAttuali();
      svuota(zonaTariffa);
      if (regole.tariffaFissa !== null) {
        zonaTariffa.append(campo('Tariffa oraria', h('input', { type: 'text', value: C.numero(regole.tariffaFissa) + ' €/h', disabled: true }),
          'Tariffa fissa ' + regole.gruppo));
      } else {
        const proposta = C.tariffaProposta(c, S.rapportini);
        if (daCliente && !tariffaToccata) valori.tariffa.value = proposta ? C.numero(proposta) : '';
        const aiuto = proposta && C.num(valori.tariffa.value) === proposta ? 'L\'ultima usata per ' + (c ? c.nome : 'questo cliente')
          : proposta ? 'L\'ultima volta era ' + C.numero(proposta) + ' €/h'
            : 'Prima volta per questo cliente: la ricordo per la prossima';
        zonaTariffa.append(campo('Tariffa oraria (€/h)', valori.tariffa, aiuto, errori.tariffa));
      }
      aggiornaConto();
    }

    function leggiModulo() {
      const c = clienteScelto();
      const m = commessaScelta(c);
      const testoCommessa = valori.commessa.value.trim();
      return {
        idLocale: r.idLocale,
        id: r.id || '',
        data: valori.data.value,
        tecnico: r.tecnico || S.ana.impostazioni.TECNICO || '',
        idCliente: c ? c.id : '',
        cliente: c ? c.nome : valori.cliente.value.trim(),
        gruppo: c ? '' : gruppoNuovo,
        idCommessa: m ? m.id : '',
        commessa: m ? m.descrizione : testoCommessa,
        ticket: valori.ticket.value.trim(),
        luogo: valori.luogo.value.trim(),
        descrizione: valori.descrizione.value.trim(),
        oreLavoro: C.num(valori.oreLavoro.value),
        oreExtra: C.num(valori.oreExtra.value),
        oreViaggio: C.num(valori.oreViaggio.value),
        km: C.num(valori.km.value),
        spese: C.num(valori.spese.value),
        noteSpese: valori.noteSpese.value.trim(),
        tariffa: C.numONull(valori.tariffa.value),
        noteInterne: valori.noteInterne.value.trim(),
      };
    }

    function aggiornaConto() {
      const dati = leggiModulo();
      const regole = regoleAttuali();
      const conto = C.calcola(dati, regole);
      svuota(zonaConto).append(h('div', { class: 'conto-anteprima' },
        rigaConto('Compenso ore', C.euro(conto.compensoOre), C.ore(dati.oreLavoro + (regole.pagaViaggio ? dati.oreViaggio : 0)) + ' × ' + C.euro(conto.tariffa) +
          (dati.oreExtra ? ' + ' + C.ore(dati.oreExtra) + ' extra' : '') + (!regole.pagaViaggio && dati.oreViaggio ? ' · il viaggio non si paga' : '')),
        rigaConto('Rimborso km', C.euro(conto.rimborsoKm), regole.kmRimborsati ? C.numero(dati.km) + ' km × ' + C.numero(regole.euroKm) + ' €' : 'questo cliente non rimborsa i km'),
        rigaConto('Spese', C.euro(dati.spese)),
        h('div', { class: 'riga tot' }, h('span', null, 'Totale'), h('span', null, C.euro(conto.totale))),
        h('div', { class: 'nota' }, 'Anteprima: il conto vero lo fa il foglio quando salvi.')));
    }

    function valida(dati) {
      const e = {};
      if (!dati.cliente) e.cliente = 'Scegli il cliente';
      if (!dati.descrizione) e.descrizione = 'Scrivi che lavoro hai fatto';
      if (!dati.data) e.data = 'Manca la data';
      ['oreLavoro', 'oreExtra', 'oreViaggio', 'km', 'spese', 'tariffa'].forEach(k => {
        const t = valori[k].value.trim();
        if (t && C.numONull(t) === null) e[k] = 'Non è un numero';
      });
      if (dati.oreLavoro + dati.oreExtra + dati.oreViaggio <= 0 && !e.oreLavoro) e.oreLavoro = 'Mancano le ore';
      if (regoleAttuali().tariffaFissa === null && !(dati.tariffa > 0) && !e.tariffa) e.tariffa = 'Scrivi la tariffa oraria';
      return e;
    }

    function disegna() {
      svuota(corpo);
      Object.keys(zonaErrori).forEach(k => delete zonaErrori[k]);
      const conErrore = (k, controllo, et, aiuto) => campo(et, controllo, aiuto, errori[k]);
      // aggiungi() e non append(): append scriverebbe "null" al posto dei campi assenti.
      aggiungi(corpo, [elencoClienti, elencoCommesse,
        h('div', { class: 'riga-campi' },
          conErrore('data', valori.data, 'Data'),
          conErrore('cliente', valori.cliente, 'Cliente', 'Scrivi per cercare, o un nome nuovo per aggiungerlo')),
        zonaGruppo,
        h('div', { class: 'riga-campi' },
          campo('Commessa', valori.commessa, 'Facoltativa. Un nome nuovo crea la commessa, col suo codice'),
          campo('Luogo', valori.luogo, 'Facoltativo')),
        S.ana.impostazioni.TICKET_ATTIVO === 'SI' || r.ticket ? campo('Ticket', valori.ticket) : null,
        conErrore('descrizione', valori.descrizione, 'Lavoro svolto'),
        h('div', { class: 'riga-campi' },
          conErrore('oreLavoro', valori.oreLavoro, 'Ore di lavoro'),
          conErrore('oreExtra', valori.oreExtra, 'Ore extra'),
          conErrore('oreViaggio', valori.oreViaggio, 'Ore di viaggio'),
          conErrore('km', valori.km, 'Chilometri')),
        zonaTariffa,
        h('div', { class: 'riga-campi' },
          conErrore('spese', valori.spese, 'Spese extra (€)'),
          campo('Di cosa', valori.noteSpese)),
        campo('Note interne', valori.noteInterne, 'Non finiscono sul PDF del cliente'),
        zonaConto]);
      aggiornaDipendenti(false);
    }

    valori.cliente.addEventListener('input', () => { aggiornaCommesse(); aggiornaDipendenti(true); });
    valori.cliente.addEventListener('change', () => { aggiornaCommesse(); aggiornaDipendenti(true); });
    valori.tariffa.addEventListener('input', () => { tariffaToccata = true; aggiornaConto(); });
    ['oreLavoro', 'oreExtra', 'oreViaggio', 'km', 'spese'].forEach(k => valori[k].addEventListener('input', aggiornaConto));

    async function salva() {
      const dati = leggiModulo();
      errori = valida(dati);
      if (Object.keys(errori).length) { disegna(); avviso('Mancano dei dati: sono segnati in rosso', true); return; }
      const nuovaAnagrafica = !dati.idCliente || (dati.commessa && !dati.idCommessa);
      const ris = await lavora('Salvo il rapportino', () => Api.post('/foglio/salvaRapportino', { rapportino: dati }));
      if (!ris) return;
      accogli([ris.rapportino]);
      if (nuovaAnagrafica) await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      avviso('Salvato: ' + ris.rapportino.id + ' · ' + C.euro(ris.rapportino.totale));
      mostra();
      dettaglioRapportino(ris.rapportino.id);
    }

    aggiornaCommesse();
    disegna();
    chiudi = modale(esistente ? 'Modifica ' + (r.id || 'rapportino') : 'Nuovo rapportino', corpo,
      [h('button', { class: 'btn', onclick: () => chiudi() }, 'Annulla'), h('button', { class: 'btn giallo', onclick: salva }, 'Salva')], true);
  }

  // ----------------------------------------------------------------------- PDF ed email

  function nomeFile(prefisso, testo) {
    return (prefisso + ' ' + testo).replace(/[\\/:*?"<>|]+/g, '-').trim();
  }

  async function pdfRapportino(r, opzioni) {
    const o = opzioni || {};
    const html = D.rapportino(r, S.ana, { conImporti: !!o.conImporti, conFoto: !!o.conFoto });
    return lavora('Preparo il PDF', () => Api.post('/locale/pdf', {
      html, nome: nomeFile(r.id || 'Rapportino', r.cliente + ' ' + C.data(r.data).replace(/\//g, '-')), apri: !!o.apri, base64: !!o.base64,
    }));
  }

  /**
   * Per chi è il riepilogo, cioè a chi si fattura. I clienti di un gruppo come
   * Elettrodinamica si fatturano al gruppo, anche se nel mese c'è un cliente
   * solo; i privati a sé stessi.
   */
  function intestatarioRiepilogo(lista) {
    const clienti = Array.from(new Set(lista.map(r => r.idCliente)));
    const gruppi = Array.from(new Set(lista.map(r => r.gruppo || '')));
    if (gruppi.length === 1 && gruppi[0] && C.normalizza(gruppi[0]) !== 'privato') {
      const g = gruppo(gruppi[0]) || { nome: gruppi[0] };
      return { nome: g.nome, righe: [g.email], email: g.email || '', mostraCliente: true };
    }
    if (clienti.length === 1) {
      const c = cliente(clienti[0]) || { nome: lista[0].cliente };
      return { nome: c.nome, righe: [c.indirizzo, c.partitaIva ? 'P.IVA ' + c.partitaIva : '', c.email], email: c.email || '' };
    }
    return { nome: 'Vari clienti', righe: [], email: '', mostraCliente: true };
  }

  function periodoDi(lista) {
    const mesi = Array.from(new Set(lista.map(r => String(r.data).slice(0, 7)))).sort();
    if (!mesi.length) return '';
    if (mesi.length === 1) return C.nomeMese(mesi[0]);
    return C.nomeMese(mesi[0]) + ' – ' + C.nomeMese(mesi[mesi.length - 1]);
  }

  /** Il riepilogo di quello che si vede (o di quello che si è scelto): il PDF da cui si fa la fattura. */
  function apriRiepilogo(scelti) {
    const lista = (scelti && scelti.length ? scelti : filtrati()).slice();
    if (!lista.length) { avviso('Non c\'è niente da mettere nel riepilogo', true); return; }
    const intestatario = intestatarioRiepilogo(lista);
    const periodo = periodoDi(lista);
    const conImporti = h('input', { type: 'checkbox', checked: true });
    const conFoto = h('input', { type: 'checkbox' });
    const t = C.totali(lista);
    let chiudi;
    const crea = async (base64) => {
      const html = D.riepilogo(lista, S.ana, intestatario, periodo, { conImporti: conImporti.checked, conFoto: conFoto.checked });
      return lavora('Preparo il PDF', () => Api.post('/locale/pdf', {
        html, nome: nomeFile('Riepilogo', intestatario.nome + ' ' + periodo), apri: !base64, base64: !!base64,
      }));
    };
    const daFatturare = lista.filter(r => r.stato !== 'FATTURATO');
    chiudi = modale('Riepilogo · ' + intestatario.nome + ' · ' + periodo, h('div', null,
      h('p', null, (t.n === 1 ? '1 rapportino' : t.n + ' rapportini') + ' · ' + C.numero(t.ore) + ' ore · ' + C.numero(t.km) + ' km · totale ' + C.euro(t.totale)),
      h('label', { class: 'spunta-campo' }, conImporti, 'Con gli importi (tariffa, rimborso km, totale)'),
      h('label', { class: 'spunta-campo' }, conFoto, 'Con le foto degli scontrini in fondo')),
    [
      daFatturare.length ? h('button', { class: 'btn', onclick: () => { chiudi(); cambiaStato(daFatturare, 'FATTURATO'); } }, 'Segna tutti fatturati') : null,
      'spazio',
      h('button', { class: 'btn', onclick: () => { chiudi(); apriEmail({ riepilogo: { lista, intestatario, periodo, conImporti: conImporti.checked, conFoto: conFoto.checked } }); } }, 'Invia per email…'),
      h('button', { class: 'btn primario', onclick: async () => { const ok = await crea(false); if (ok) { chiudi(); avviso('PDF salvato in ' + ok.percorso); } } }, 'Crea il PDF'),
    ]);
  }

  /**
   * Invia al cliente, come in Pleya: email precompilata, copia a qualcuno,
   * messaggio, PDF allegato (spuntato), importi (non spuntati: il cliente di
   * solito vuole il lavoro, non il conto), anteprima a sé stessi, e "segna come
   * inviato senza email" per quando il PDF lo si consegna in altro modo.
   */
  function apriEmail(cosa) {
    const singolo = cosa.rapportini && cosa.rapportini.length === 1 ? cosa.rapportini[0] : null;
    const rip = cosa.riepilogo;
    const lista = singolo ? [singolo] : rip.lista;
    const intest = singolo ? intestatarioRiepilogo([singolo]) : rip.intestatario;
    const imp = S.ana.impostazioni;
    const a = h('input', { type: 'email', value: intest.email || '' });
    const cc = h('input', { type: 'text', placeholder: 'amministrazione@…' });
    const oggetto = h('input', { type: 'text', value: singolo
      ? 'Rapportino ' + singolo.id + ' del ' + C.data(singolo.data)
      : 'Rapportini ' + rip.periodo + (intest.nome !== 'Vari clienti' ? ' · ' + intest.nome : '') });
    const messaggio = h('textarea', { rows: 5 });
    messaggio.value = (singolo
      ? 'Buongiorno,\nin allegato il rapportino del ' + C.data(singolo.data) + '.'
      : 'Buongiorno,\nin allegato il riepilogo dei rapportini di ' + rip.periodo.toLowerCase() + '.') +
      '\n\nCordiali saluti\n' + (imp.TECNICO || imp.RAGIONE_SOCIALE || '');
    const allega = h('input', { type: 'checkbox', checked: true });
    const importi = h('input', { type: 'checkbox', checked: singolo ? false : !!rip.conImporti });
    let chiudi;

    async function manda(aMe) {
      if (!aMe && !a.value.trim()) { a.focus(); avviso('Manca l\'indirizzo del cliente', true); return; }
      const fatto = await lavora(aMe ? 'Mando l\'anteprima' : 'Mando l\'email', async () => {
        const allegati = [];
        if (allega.checked) {
          const html = singolo
            ? D.rapportino(singolo, S.ana, { conImporti: importi.checked })
            : D.riepilogo(rip.lista, S.ana, rip.intestatario, rip.periodo, { conImporti: importi.checked, conFoto: rip.conFoto });
          const nome = singolo ? nomeFile(singolo.id, singolo.cliente) : nomeFile('Riepilogo', intest.nome + ' ' + rip.periodo);
          const pdf = await Api.post('/locale/pdf', { html, nome, base64: true });
          allegati.push({ nome: pdf.nome, base64: pdf.base64, mime: 'application/pdf' });
        }
        const ris = await Api.post('/foglio/inviaEmail', {
          a: a.value.trim(), cc: cc.value.trim(), oggetto: oggetto.value, messaggio: messaggio.value,
          allegati, ids: lista.map(r => r.id), aMe: !!aMe,
        });
        accogli(ris.rapportini);
        return true;
      });
      if (fatto) {
        avviso(aMe ? 'Anteprima mandata alla tua casella' : 'Email mandata');
        if (!aMe) { chiudi(); mostra(); }
      }
    }

    chiudi = modale(singolo ? 'Invia il rapportino al cliente' : 'Invia il riepilogo', h('div', null,
      campo('Email del cliente', a, intest.email ? null : 'Non è sulla scheda del cliente: scrivila (la puoi salvare in Clienti)'),
      campo('Copia anche a', cc, 'Più indirizzi separati da virgola'),
      campo('Oggetto', oggetto),
      campo('Messaggio', messaggio),
      h('label', { class: 'spunta-campo' }, allega, 'Allega il PDF'),
      h('label', { class: 'spunta-campo' }, importi, 'Con gli importi (mandali solo se al cliente servono)'),
      h('p', { class: 'secondario' }, 'La mail parte dal tuo account Google, quello del foglio.')),
    [
      h('button', { class: 'btn', onclick: async () => { chiudi(); await cambiaStato(lista.filter(r => r.stato !== 'FATTURATO'), 'INVIATO'); } }, 'Segna come inviato senza email'),
      'spazio',
      h('button', { class: 'btn', onclick: () => manda(true) }, 'Anteprima a me'),
      h('button', { class: 'btn primario', onclick: () => manda(false) }, 'Invia email'),
    ]);
  }

  // ======================================================================= COMMESSE

  function vistaCommesse(main) {
    const f = S.filtriCommesse;
    const area = h('div');
    const disegna = () => tabellaCommesse(area);
    const clientiOrdinati = S.ana.clienti.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    main.append(
      h('div', { class: 'testata' }, h('h1', null, 'Commesse'), h('div', { class: 'spazio' }),
        h('button', { class: 'btn giallo', onclick: () => moduloCommessa(null) }, 'Nuova commessa')),
      h('div', { class: 'sottotitolo' }, 'I lavori presso i clienti: ore, costi e quanto rendono.'),
      h('div', { class: 'filtri' },
        h('input', { class: 'cerca', type: 'search', placeholder: 'Cerca codice, commessa, cliente…', value: f.testo,
          oninput: e => { f.testo = e.target.value; disegna(); } }),
        select([['APERTA', 'Aperte'], ['SOSPESA', 'Sospese'], ['CHIUSA', 'Chiuse'], ['', 'Tutte']], f.stato, v => { f.stato = v; disegna(); }),
        select([['', 'Tutti i clienti']].concat(clientiOrdinati.map(c => [c.id, c.nome])), f.cliente, v => { f.cliente = v; disegna(); })),
      area);
    disegna();
  }

  function tabellaCommesse(area) {
    svuota(area);
    const f = S.filtriCommesse;
    const testo = C.normalizza(f.testo);
    const tutte = S.ana.commesse.filter(m => {
      if (f.cliente && m.idCliente !== f.cliente) return false;
      if (testo) {
        const c = cliente(m.idCliente);
        if (C.normalizza([m.id, m.descrizione, c ? c.nome : '', m.indirizzo].join(' ')).indexOf(testo) < 0) return false;
      }
      return true;
    });
    const mostrate = tutte.filter(m => !f.stato || m.stato === f.stato)
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    // Come in Pleya, ma detto: quante ce ne sono che il filtro nasconde.
    const nascoste = tutte.length - mostrate.length;
    area.append(h('div', { class: 'conteggio', style: { marginBottom: '8px' } },
      mostrate.length + ' di ' + tutte.length + (nascoste ? ' · ' : ''),
      nascoste ? h('button', { class: 'btn collegamento', onclick: () => { f.stato = ''; mostra(); } }, 'mostra anche le ' + nascoste + ' nascoste') : null));
    if (!mostrate.length) { area.append(h('p', { class: 'vuoto' }, 'Nessuna commessa.')); return; }
    const corpo = h('tbody');
    mostrate.forEach(m => {
      const c = cliente(m.idCliente);
      const k = C.cruscotto(m, S.rapportini, S.ana.impostazioni);
      corpo.append(h('tr', { onclick: () => { location.hash = '#commesse/' + encodeURIComponent(m.id); } },
        h('td', null, h('span', { class: 'chip codice' }, m.id)),
        h('td', null, m.descrizione, k.livelloOre === 'sforato' ? h('span', { class: 'pallino', title: 'Oltre le ore a budget' }) : null,
          h('div', { class: 'secondario' }, c ? c.nome : m.idCliente)),
        h('td', null, chip(m.stato)),
        h('td', { style: { minWidth: '150px' } },
          C.numero(k.ore) + ' h' + (k.budgetOre ? ' di ' + C.numero(k.budgetOre) : ''),
          k.budgetOre ? h('div', { class: 'barra-fondo', style: { marginTop: '4px' } },
            h('div', { class: 'barra-pieno ' + k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } })) : null),
        h('td', { class: 'n' }, k.costo.lavoroNoto ? C.euro(k.costo.totale) : h('span', { class: 'secondario', title: 'Manca il costo orario in Impostazioni' }, '—')),
        h('td', { class: 'n' }, C.euro(k.valoreAtteso)),
        h('td', { class: 'n' }, k.costo.lavoroNoto ? C.euro(k.margine) : '—')));
    });
    area.append(h('div', { class: 'tabella-scheda' }, h('table', { class: 'dati' },
      h('thead', null, h('tr', null, h('th', null, 'Codice'), h('th', null, 'Commessa'), h('th', null, 'Stato'),
        h('th', null, 'Ore'), h('th', { class: 'n' }, 'Costo'), h('th', { class: 'n' }, 'Valore atteso'), h('th', { class: 'n' }, 'Margine'))),
      corpo)));
  }

  let schedaCommessa = 'panoramica';

  function vistaCommessa(main, id) {
    const m = commessa(id);
    if (!m) { main.append(h('p', { class: 'vuoto' }, 'Commessa ' + id + ' non trovata.')); return; }
    const c = cliente(m.idCliente);
    const k = C.cruscotto(m, S.rapportini, S.ana.impostazioni);
    const area = h('div');

    const azioni = [];
    if (m.stato === 'APERTA') {
      azioni.push(h('button', { class: 'btn', onclick: () => statoCommessa(m, 'SOSPESA') }, 'Sospendi'));
      azioni.push(h('button', { class: 'btn', onclick: () => statoCommessa(m, 'CHIUSA') }, 'Chiudi commessa'));
    } else {
      azioni.push(h('button', { class: 'btn', onclick: () => statoCommessa(m, 'APERTA') }, 'Riapri'));
    }
    azioni.push(h('button', { class: 'btn primario', onclick: () => moduloCommessa(m) }, 'Modifica'));

    main.append(
      h('button', { class: 'indietro', onclick: () => { location.hash = '#commesse'; } }, '← Commesse'),
      h('div', { class: 'testata' }, h('span', { class: 'chip codice' }, m.id), h('h1', null, m.descrizione), chip(m.stato),
        h('div', { class: 'spazio' }), azioni),
      h('div', { class: 'sottotitolo' }, [c ? c.nome : m.idCliente, m.indirizzo,
        m.inizio ? 'dal ' + C.data(m.inizio) + (m.finePrevista ? ' al ' + C.data(m.finePrevista) : '') : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'schede' }, [
        ['panoramica', 'Panoramica'], ['rapportini', 'Rapportini (' + k.totali.n + ')'], ['costi', 'Costi'],
        ['dafatturare', 'Da fatturare'], ['documenti', 'Documenti'],
      ].map(([chiave, nome]) => h('button', {
        class: schedaCommessa === chiave ? 'attiva' : '',
        onclick: () => { schedaCommessa = chiave; mostra(); },
      }, nome))),
      area);

    if (schedaCommessa === 'rapportini') {
      area.append(h('div', { class: 'testata' }, h('div', { class: 'spazio' }),
        h('button', { class: 'btn giallo', onclick: () => moduloRapportino(null, { idCliente: m.idCliente, idCommessa: m.id }) }, 'Nuovo rapportino')));
      const tab = h('div');
      area.append(tab);
      tabellaRapportini(tab, C.ordina(k.rapportini, 'data', -1));
    } else if (schedaCommessa === 'costi') {
      costiCommessa(area, m, k);
    } else if (schedaCommessa === 'dafatturare') {
      const da = k.rapportini.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
      const inBozza = k.rapportini.filter(r => r.stato === 'BOZZA');
      area.append(h('div', { class: 'griglia-3', style: { marginBottom: '14px' } },
        cifra('Pronto da fatturare', C.euro(k.prontoDaFatturare), da.length + ' rapportini firmati o inviati'),
        cifra('In bozza', C.euro(k.inBozza), inBozza.length ? inBozza.length + ' da far firmare o mandare' : 'nessuno'),
        cifra('Già fatturato', C.euro(k.fatturato), '')));
      if (da.length) {
        area.append(h('div', { class: 'testata' }, h('div', { class: 'spazio' }),
          h('button', { class: 'btn', onclick: () => apriRiepilogo(da) }, 'PDF riepilogo'),
          h('button', { class: 'btn primario', onclick: () => cambiaStato(da, 'FATTURATO') }, 'Segna tutti fatturati')));
        const tab = h('div');
        area.append(tab);
        tabellaRapportini(tab, C.ordina(da, 'data', 1), { senzaAzioni: true });
      } else {
        area.append(h('p', { class: 'vuoto' }, 'Niente da fatturare: i rapportini entrano qui quando sono firmati o mandati.'));
      }
    } else if (schedaCommessa === 'documenti') {
      documentiCommessa(area, m);
    } else {
      panoramicaCommessa(area, m, k);
    }
  }

  function cifra(etichetta, valore, sotto, negativo) {
    return h('div', { class: 'cifra' + (negativo ? ' negativo' : '') },
      h('div', { class: 'etichetta' }, etichetta), h('div', { class: 'numero-grande' }, valore), sotto ? h('div', { class: 'sotto' }, sotto) : null);
  }

  function panoramicaCommessa(area, m, k) {
    const perc = x => x === null ? '' : Math.round(x * 100) + '%';
    area.append(h('div', { class: 'griglia-3', style: { marginBottom: '14px' } },
      cifra('Valore atteso', C.euro(k.valoreAtteso),
        m.budgetEuro && m.budgetEuro >= k.valoreMaturato ? 'Il budget della commessa' : 'Quello che i rapportini hanno maturato'),
      k.costo.lavoroNoto
        ? cifra('Costo sostenuto', C.euro(k.costo.totale), (k.valoreAtteso > 0 ? perc(k.costo.totale / k.valoreAtteso) + ' del valore atteso' : ''))
        : cifra('Costo sostenuto', '—', 'Manca il tuo costo orario: mettilo in Impostazioni'),
      k.costo.lavoroNoto
        ? cifra('Margine atteso', C.euro(k.margine), k.percMargine === null ? '' : perc(k.percMargine) + (k.margine < 0 ? ': costa più di quanto vale' : ''), k.margine < 0)
        : cifra('Margine atteso', '—', '')));

    const tot = k.fatturato + k.prontoDaFatturare + k.inBozza;
    const pezzo = (v, classe) => tot > 0 && v > 0 ? h('div', { class: 'barra-pieno ' + classe, style: { width: (v / tot * 100) + '%' } }) : null;
    area.append(h('div', { class: 'scheda' },
      h('h2', null, 'Fatturazione'),
      h('div', { class: 'barra-fondo' }, pezzo(k.fatturato, 'fatturato'), pezzo(k.prontoDaFatturare, 'pronto'), pezzo(k.inBozza, 'bozza')),
      h('div', { class: 'legenda' },
        h('span', null, h('i', { style: { background: 'var(--giallo)' } }), 'Fatturato ' + C.euro(k.fatturato)),
        h('span', null, h('i', { style: { background: 'var(--verde)' } }), 'Pronto da fatturare ' + C.euro(k.prontoDaFatturare)),
        h('span', null, h('i', { style: { background: '#b9c0cb' } }), 'In bozza ' + C.euro(k.inBozza)))));

    const ore = h('div', { class: 'scheda' }, h('h2', null, 'Ore'));
    if (k.budgetOre) {
      ore.append(h('div', null, C.numero(k.ore) + ' ore su ' + C.numero(k.budgetOre) + ' a budget · ' + perc(k.percOre) +
        (k.livelloOre === 'sforato' ? ' · oltre le ore previste' : k.livelloOre === 'attenzione' ? ' · vicino al budget' : '')),
      h('div', { class: 'barra-fondo', style: { margin: '8px 0' } },
        h('div', { class: 'barra-pieno ' + k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } })));
    } else {
      ore.append(h('div', null, C.numero(k.ore) + ' ore registrate · nessun budget in ore (si mette con Modifica)'));
    }
    if (k.percTempo !== null) {
      ore.append(h('div', { class: 'secondario', style: { marginTop: '8px' } },
        'Tempo: ' + perc(k.percTempo) + (k.giorniMancanti >= 0 ? ' · mancano ' + k.giorniMancanti + ' giorni' : ' · scaduta da ' + (-k.giorniMancanti) + ' giorni')),
      h('div', { class: 'barra-fondo', style: { marginTop: '4px' } }, h('div', { class: 'barra-pieno bozza', style: { width: Math.round(k.percTempo * 100) + '%' } })));
    }
    const massimo = Math.max(1, ...k.settimane.map(s => s.ore));
    ore.append(h('h3', null, 'Settimana per settimana'),
      h('div', { class: 'settimane' }, k.settimane.map(s => h('div', { class: 'settimana', title: 'Settimana del ' + C.data(s.inizio) + ': ' + C.numero(s.ore) + ' ore' },
        h('span', null, s.ore ? C.numero(s.ore) : ''),
        h('div', { class: 'colonna' + (s.ore ? ' piena' : ''), style: { height: Math.round(s.ore / massimo * 80) + 'px' } }),
        h('span', null, C.data(s.inizio).slice(0, 5))))));
    area.append(ore);
    if (m.note) area.append(h('div', { class: 'scheda' }, h('h2', null, 'Note'), h('div', { class: 'testo-lungo' }, m.note)));
  }

  function costiCommessa(area, m, k) {
    const imp = S.ana.impostazioni;
    const conSpese = k.rapportini.filter(r => C.num(r.spese) > 0 || (r.foto || []).length);
    area.append(h('div', { class: 'scheda' },
      h('h2', null, 'Da dove viene il costo · ' + (k.costo.lavoroNoto ? C.euro(k.costo.totale) : 'incompleto')),
      h('div', { class: 'conto-anteprima' },
        rigaConto('Il tuo lavoro', k.costo.lavoroNoto ? C.euro(k.costo.lavoro) : '—',
          C.numero(k.ore) + ' ore × ' + (imp.COSTO_ORARIO ? C.euro(imp.COSTO_ORARIO) + '/h di costo orario' : 'costo orario da impostare')),
        rigaConto('Auto', C.euro(k.costo.auto), C.numero(k.totali.km) + ' km al costo ACI'),
        rigaConto('Spese', C.euro(k.costo.spese), conSpese.length + ' rapportini con spese')),
      h('p', { class: 'secondario' }, 'Il costo orario è quanto costa a te un\'ora (non quanto la fai pagare): serve solo a vedere il margine.')));
    if (conSpese.length) {
      const corpo = h('tbody');
      conSpese.forEach(r => corpo.append(h('tr', { onclick: () => dettaglioRapportino(r.id) },
        h('td', null, C.data(r.data)), h('td', null, r.id), h('td', null, r.noteSpese || '—'),
        h('td', null, (r.foto || []).length ? h('div', { class: 'foto-griglia' }, r.foto.slice(0, 4).map(f =>
          h('a', { href: f.url, target: '_blank', style: { width: '54px', height: '54px' }, onclick: e => e.stopPropagation() }, h('img', { src: '/file/' + f.id, alt: '' })))) : '—'),
        h('td', { class: 'n' }, C.euro(r.spese)))));
      area.append(h('div', { class: 'tabella-scheda' }, h('table', { class: 'dati' },
        h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'N°'), h('th', null, 'Di cosa'), h('th', null, 'Scontrini'), h('th', { class: 'n' }, 'Importo'))),
        corpo)));
    }
  }

  async function documentiCommessa(area, m) {
    const lista = h('div', null, h('p', { class: 'vuoto' }, 'Leggo la cartella…'));
    let cartella = m.cartella;
    const carica = async () => {
      const ris = await Api.get('/foglio/documenti?idCommessa=' + encodeURIComponent(m.id)).catch(e => { avviso(e.message, true); return null; });
      svuota(lista);
      if (!ris) return;
      cartella = ris.cartella;
      if (!ris.documenti.length) { lista.append(h('p', { class: 'vuoto' }, 'Nessun documento. La cartella su Drive è pronta.')); return; }
      const corpo = h('tbody');
      ris.documenti.forEach(d => corpo.append(h('tr', { onclick: () => window.open(d.url, '_blank') },
        h('td', null, d.nome), h('td', null, C.dataOra(d.data)))));
      lista.append(h('div', { class: 'tabella-scheda' }, h('table', { class: 'dati' },
        h('thead', null, h('tr', null, h('th', null, 'Documento'), h('th', null, 'Ultima modifica'))), corpo)));
    };
    area.append(h('div', { class: 'testata' },
      h('div', { class: 'secondario' }, 'Disegni, offerte, verbali: tutto nella cartella della commessa su Drive.'),
      h('div', { class: 'spazio' }),
      h('button', { class: 'btn', onclick: () => { if (cartella) window.open(cartella, '_blank'); } }, 'Apri la cartella su Drive'),
      h('button', { class: 'btn primario', onclick: async () => {
        const scelto = await Api.post('/locale/scegli-file', { filtro: 'tutti' }).catch(() => null);
        if (!scelto || !scelto.ok) return;
        const fatto = await lavora('Carico ' + scelto.nome, () => Api.post('/foglio/caricaFile', {
          tipo: 'documento', idCommessa: m.id, nome: scelto.nome, mime: scelto.mime, base64: scelto.base64,
        }));
        if (fatto) { avviso('Caricato ' + scelto.nome); carica(); }
      } }, 'Carica un documento')),
    lista);
    carica();
  }

  async function statoCommessa(m, stato) {
    const frasi = {
      SOSPESA: ['Sospendere la commessa?', 'Non si propone più nei rapportini nuovi finché non la riapri.'],
      CHIUSA: ['Chiudere la commessa?', 'Il lavoro è finito: non si propone più nei rapportini nuovi. Ore, costi e rapportini restano, e si può riaprire.'],
      APERTA: ['Riaprire la commessa?', 'Torna fra quelle proposte nei rapportini.'],
    };
    const ok = await conferma(frasi[stato][0], frasi[stato][1], stato === 'APERTA' ? 'Riapri' : stato === 'CHIUSA' ? 'Chiudi' : 'Sospendi');
    if (!ok) return;
    const ris = await lavora('Aggiorno la commessa', () => Api.post('/foglio/aggiornaCommessa', { id: m.id, campi: { stato } }));
    if (ris) { Object.assign(m, ris.commessa); avviso('Commessa ' + ris.commessa.stato.toLowerCase()); mostra(); }
  }

  function moduloCommessa(esistente) {
    const m = esistente || {};
    const anno = new Date().getFullYear();
    const prossimo = C.prossimoCodiceCommessa(S.ana.commesse.map(x => x.id), S.ana.impostazioni.PREFISSO_COMMESSA, anno);
    const clientiOrdinati = S.ana.clienti.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const v = {
      cliente: select([['', '— scegli —']].concat(clientiOrdinati.map(c => [c.id, c.nome])), m.idCliente || S.filtriCommesse.cliente || ''),
      descrizione: h('input', { type: 'text', value: m.descrizione || '' }),
      codice: h('input', { type: 'text', value: esistente ? m.id : '', placeholder: 'Vuoto: sarà ' + prossimo, disabled: !!esistente }),
      indirizzo: h('input', { type: 'text', value: m.indirizzo || '' }),
      inizio: h('input', { type: 'date', value: m.inizio || (esistente ? '' : C.oggiIso()) }),
      fine: h('input', { type: 'date', value: m.finePrevista || '' }),
      budgetOre: h('input', { type: 'text', inputmode: 'decimal', value: m.budgetOre ? C.numero(m.budgetOre) : '' }),
      budgetEuro: h('input', { type: 'text', inputmode: 'decimal', value: m.budgetEuro ? C.numero(m.budgetEuro) : '' }),
      note: h('textarea', { rows: 3 }),
    };
    v.note.value = m.note || '';
    let chiudi;
    const salva = async () => {
      if (!v.cliente.value) { v.cliente.focus(); avviso('Scegli il cliente', true); return; }
      if (!v.descrizione.value.trim()) { v.descrizione.focus(); avviso('Scrivi la descrizione', true); return; }
      const campi = {
        idCliente: v.cliente.value, descrizione: v.descrizione.value.trim(), indirizzo: v.indirizzo.value.trim(),
        inizio: v.inizio.value, finePrevista: v.fine.value,
        budgetOre: C.numONull(v.budgetOre.value), budgetEuro: C.numONull(v.budgetEuro.value), note: v.note.value.trim(),
      };
      const ris = await lavora('Salvo la commessa', () => esistente
        ? Api.post('/foglio/aggiornaCommessa', { id: m.id, campi })
        : Api.post('/foglio/creaCommessa', Object.assign({ id: v.codice.value.trim() }, campi)));
      if (!ris) return;
      await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      if (!esistente && ris.commessa.giaEsisteva) avviso('C\'era già: ' + ris.commessa.id, true);
      else avviso((esistente ? 'Salvata ' : 'Creata ') + ris.commessa.id);
      location.hash = '#commesse/' + encodeURIComponent(ris.commessa.id);
      mostra();
    };
    chiudi = modale(esistente ? 'Modifica ' + m.id : 'Nuova commessa', h('div', null,
      h('div', { class: 'riga-campi' }, campo('Cliente', v.cliente), campo('Codice', v.codice, esistente ? 'Il codice non cambia' : 'Si numera da solo')),
      campo('Descrizione', v.descrizione, 'Come la chiami tu: "Nuovo magazzino automatico"'),
      campo('Indirizzo del cantiere', v.indirizzo, 'Facoltativo'),
      h('div', { class: 'riga-campi' }, campo('Inizio', v.inizio), campo('Fine prevista', v.fine)),
      h('div', { class: 'riga-campi' },
        campo('Budget in ore', v.budgetOre, 'Dall\'85% ti avviso, dal 100% è sforato'),
        campo('Budget in euro', v.budgetEuro, 'Il valore della commessa, se lo sai')),
      campo('Note', v.note)),
    [h('button', { class: 'btn', onclick: () => chiudi() }, 'Annulla'), h('button', { class: 'btn giallo', onclick: salva }, 'Salva')]);
  }

  // ======================================================================= CLIENTI

  function vistaClienti(main) {
    const f = S.filtriClienti;
    const area = h('div');
    const disegna = () => {
      svuota(area);
      const testo = C.normalizza(f.testo);
      const lista = S.ana.clienti.filter(c => (!f.gruppo || C.normalizza(c.gruppo) === C.normalizza(f.gruppo)) &&
        (!testo || C.normalizza([c.id, c.nome, c.alias.join(' '), c.email, c.partitaIva].join(' ')).indexOf(testo) >= 0))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      if (!lista.length) { area.append(h('p', { class: 'vuoto' }, 'Nessun cliente.')); return; }
      const corpo = h('tbody');
      const mese = C.oggiIso().slice(0, 7);
      lista.forEach(c => {
        const g = gruppo(c.gruppo);
        const tariffa = g && g.tariffaFissa !== null ? C.numero(g.tariffaFissa) + ' €/h fissa'
          : c.ultimaTariffa ? C.numero(c.ultimaTariffa) + ' €/h (ultima)' : '—';
        const aperte = S.ana.commesse.filter(m => m.idCliente === c.id && m.stato === 'APERTA').length;
        const delMese = C.totali(S.rapportini.filter(r => r.idCliente === c.id && String(r.data).slice(0, 7) === mese && r.stato !== 'ANNULLATO'));
        corpo.append(h('tr', { onclick: () => moduloCliente(c) },
          h('td', null, c.id), h('td', null, c.nome, c.alias.length ? h('div', { class: 'secondario' }, c.alias.join(', ')) : null),
          h('td', null, c.gruppo || '—'), h('td', null, tariffa), h('td', null, c.email || h('span', { class: 'secondario' }, '—')),
          h('td', { class: 'n' }, String(aperte)), h('td', { class: 'n' }, delMese.n ? C.numero(delMese.ore) + ' h · ' + C.euro(delMese.totale) : '')));
      });
      area.append(h('div', { class: 'tabella-scheda' }, h('table', { class: 'dati' },
        h('thead', null, h('tr', null, h('th', null, 'Codice'), h('th', null, 'Cliente'), h('th', null, 'Gruppo'), h('th', null, 'Tariffa'),
          h('th', null, 'Email'), h('th', { class: 'n' }, 'Commesse aperte'), h('th', { class: 'n' }, C.nomeMese(mese)))),
        corpo)));
    };
    main.append(
      h('div', { class: 'testata' }, h('h1', null, 'Clienti'), h('div', { class: 'spazio' }),
        h('button', { class: 'btn giallo', onclick: () => moduloCliente(null) }, 'Nuovo cliente')),
      h('div', { class: 'filtri' },
        h('input', { class: 'cerca', type: 'search', placeholder: 'Cerca nome, codice, email, P.IVA…', value: f.testo,
          oninput: e => { f.testo = e.target.value; disegna(); } }),
        select([['', 'Tutti i gruppi']].concat(S.ana.gruppi.map(g => [g.nome, g.nome])), f.gruppo, x => { f.gruppo = x; disegna(); })),
      area);
    disegna();
  }

  function moduloCliente(esistente) {
    const c = esistente || { alias: [] };
    const triplo = val => val === true ? 'SI' : val === false ? 'NO' : '';
    const v = {
      nome: h('input', { type: 'text', value: c.nome || '' }),
      gruppo: select(S.ana.gruppi.map(g => [g.nome, g.nome]), c.gruppo || 'Privato'),
      email: h('input', { type: 'email', value: c.email || '' }),
      telefono: h('input', { type: 'text', value: c.telefono || '' }),
      indirizzo: h('input', { type: 'text', value: c.indirizzo || '' }),
      partitaIva: h('input', { type: 'text', value: c.partitaIva || '' }),
      alias: h('input', { type: 'text', value: (c.alias || []).join(', ') }),
      pagaViaggio: select([['', 'Come il gruppo'], ['SI', 'Sì'], ['NO', 'No']], triplo(c.pagaViaggio)),
      kmRimborsati: select([['', 'Come il gruppo'], ['SI', 'Sì'], ['NO', 'No']], triplo(c.kmRimborsati)),
      ultimaTariffa: h('input', { type: 'text', inputmode: 'decimal', value: c.ultimaTariffa ? C.numero(c.ultimaTariffa) : '' }),
      note: h('textarea', { rows: 2 }),
    };
    v.note.value = c.note || '';
    let chiudi;
    const daTriplo = s => s === 'SI' ? true : s === 'NO' ? false : null;
    const salva = async () => {
      if (!v.nome.value.trim()) { v.nome.focus(); return; }
      const campi = {
        nome: v.nome.value.trim(), gruppo: v.gruppo.value, email: v.email.value.trim(), telefono: v.telefono.value.trim(),
        indirizzo: v.indirizzo.value.trim(), partitaIva: v.partitaIva.value.trim(),
        alias: v.alias.value.split(',').map(s => s.trim()).filter(Boolean),
        pagaViaggio: daTriplo(v.pagaViaggio.value), kmRimborsati: daTriplo(v.kmRimborsati.value),
        ultimaTariffa: C.numONull(v.ultimaTariffa.value), note: v.note.value.trim(),
      };
      const ris = await lavora('Salvo il cliente', async () => {
        if (esistente) return Api.post('/foglio/aggiornaCliente', { id: c.id, campi });
        const nuovo = await Api.post('/foglio/creaCliente', campi);
        if (nuovo.cliente.giaEsisteva) return nuovo;
        // creaCliente scrive nome e gruppo; il resto (eccezioni, tariffa) con un aggiornamento.
        return Api.post('/foglio/aggiornaCliente', { id: nuovo.cliente.id, campi });
      });
      if (!ris) return;
      await ricaricaAnagrafiche().catch(() => null);
      chiudi();
      avviso(ris.cliente && ris.cliente.giaEsisteva ? 'C\'era già: ' + ris.cliente.nome : 'Salvato ' + v.nome.value.trim());
      mostra();
    };
    chiudi = modale(esistente ? c.nome : 'Nuovo cliente', h('div', null,
      h('div', { class: 'riga-campi' }, campo('Ragione sociale', v.nome), campo('Gruppo', v.gruppo, 'Decide tariffa e rimborsi')),
      h('div', { class: 'riga-campi' }, campo('Email', v.email, 'Per mandare rapportini e riepiloghi'), campo('Telefono', v.telefono)),
      h('div', { class: 'riga-campi' }, campo('Indirizzo', v.indirizzo), campo('Partita IVA', v.partitaIva)),
      campo('Altri nomi', v.alias, 'Come lo chiami a volte, separati da virgola: aiutano a ritrovarlo'),
      h('h3', { class: 'etichetta' }, 'Eccezioni alle regole del gruppo'),
      h('div', { class: 'riga-campi' },
        campo('Tempo di viaggio pagato', v.pagaViaggio),
        campo('Km rimborsati', v.kmRimborsati),
        campo('Ultima tariffa usata (€/h)', v.ultimaTariffa, 'Si aggiorna da sola a ogni rapportino')),
      campo('Note', v.note)),
    [h('button', { class: 'btn', onclick: () => chiudi() }, 'Annulla'), h('button', { class: 'btn giallo', onclick: salva }, 'Salva')]);
  }

  // ======================================================================= IMPOSTAZIONI

  function vistaImpostazioni(main) {
    const imp = S.ana.impostazioni;
    main.append(h('div', { class: 'testata' }, h('h1', null, 'Impostazioni')));

    // --- collegamento
    const url = h('input', { type: 'text', placeholder: 'https://script.google.com/macros/s/…/exec' });
    const codice = h('input', { type: 'password', placeholder: S.configurato ? 'Lascia vuoto per non cambiarlo' : 'Il CODICE scritto da preparaFoglio()' });
    Api.get('/locale/stato').then(s => { url.value = s.url || ''; }).catch(() => null);
    main.append(h('div', { class: 'scheda' }, h('h2', null, 'Collegamento al foglio'),
      !S.configurato ? h('div', { class: 'banda' }, 'Per cominciare: nello script del foglio lancia preparaFoglio(), pubblica come app web per "Chiunque", e copia qui indirizzo e codice.') : null,
      campo('Indirizzo dello script', url),
      campo('Codice', codice, 'Resta cifrato su questo computer'),
      h('button', { class: 'btn primario', onclick: async () => {
        const ok = await lavora('Provo il collegamento', () => Api.post('/locale/configura', { url: url.value.trim(), codice: codice.value.trim() }));
        if (ok) { codice.value = ''; await carica(); if (S.caricato) avviso('Collegato'); }
      } }, 'Salva e prova'),
      S.cartellaPdf ? h('p', { class: 'secondario' }, 'I PDF finiscono in ', S.cartellaPdf, ' ',
        h('button', { class: 'btn collegamento', onclick: () => Api.post('/locale/cartella-pdf') }, 'Apri la cartella')) : null));

    if (!S.caricato) return;

    // --- dati dello studio
    const campiImp = {};
    const inputImp = (chiave, etichetta, aiuto, tipo) => {
      campiImp[chiave] = h('input', { type: tipo || 'text', value: imp[chiave] === undefined ? '' : String(imp[chiave]) });
      return campo(etichetta, campiImp[chiave], aiuto);
    };
    const salvaImp = chiavi => async () => {
      const valori = {};
      chiavi.forEach(k => {
        let x = campiImp[k].type === 'checkbox' ? (campiImp[k].checked ? 'SI' : 'NO') : campiImp[k].value.trim();
        if (['EURO_KM', 'COSTO_ORARIO'].indexOf(k) >= 0 && x !== '') x = C.num(x);
        valori[k] = x;
      });
      const ris = await lavora('Salvo', () => Api.post('/foglio/salvaImpostazioni', { valori }));
      if (ris) { S.ana.impostazioni = ris.impostazioni; avviso('Salvato'); }
    };

    main.append(h('div', { class: 'scheda' }, h('h2', null, 'Lo studio (intestazione dei PDF)'),
      h('div', { class: 'riga-campi' }, inputImp('RAGIONE_SOCIALE', 'Ragione sociale'), inputImp('TECNICO', 'Chi compila', 'Il nome sotto la firma')),
      h('div', { class: 'riga-campi' }, inputImp('INDIRIZZO', 'Indirizzo'), inputImp('PARTITA_IVA', 'Partita IVA')),
      h('div', { class: 'riga-campi' }, inputImp('EMAIL', 'Email', 'Le risposte dei clienti arrivano qui'), inputImp('TELEFONO', 'Telefono'), inputImp('PEC', 'PEC')),
      h('button', { class: 'btn primario', onclick: salvaImp(['RAGIONE_SOCIALE', 'TECNICO', 'INDIRIZZO', 'PARTITA_IVA', 'EMAIL', 'TELEFONO', 'PEC']) }, 'Salva')));

    // --- firma del tecnico
    const idFirma = D.idDaUrl(imp.FIRMA_TECNICO);
    main.append(h('div', { class: 'scheda' }, h('h2', null, 'La tua firma'),
      h('p', { class: 'secondario' }, 'Si mette da sola come firma del compilatore su ogni rapportino.'),
      idFirma ? h('img', { class: 'firma-img', src: '/file/' + idFirma, alt: 'Firma del tecnico' }) : h('p', null, 'Non ancora caricata.'),
      h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn', onclick: async () => {
        const scelto = await Api.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
        if (!scelto || !scelto.ok) return;
        const ris = await lavora('Carico la firma', () => Api.post('/foglio/caricaFile', { tipo: 'firmaTecnico', mime: scelto.mime, base64: scelto.base64 }));
        if (ris) { await ricaricaAnagrafiche(); avviso('Firma caricata'); mostra(); }
      } }, idFirma ? 'Cambia la firma' : 'Carica la firma (foto o scansione)'))));

    // --- tariffe
    main.append(tariffeGruppi());

    // --- rimborsi e costi
    campiImp.TICKET_ATTIVO = h('input', { type: 'checkbox', checked: imp.TICKET_ATTIVO === 'SI' });
    main.append(h('div', { class: 'scheda' }, h('h2', null, 'Rimborso km, costi e numerazione'),
      h('div', { class: 'riga-campi' },
        inputImp('EURO_KM', 'Rimborso km (€/km)', 'Dalla tabella ACI: da controllare ogni gennaio'),
        inputImp('AUTO', 'Auto', 'Il modello su cui si legge la tabella ACI'),
        inputImp('COSTO_ORARIO', 'Il tuo costo orario (€/h)', 'Quanto costa a te un\'ora, non quanto la fai pagare: serve al margine'),
        inputImp('PREFISSO_COMMESSA', 'Prefisso delle commesse', 'P → P2601, P2602…')),
      h('label', { class: 'spunta-campo' }, campiImp.TICKET_ATTIVO, 'Mostra il campo ticket nei rapportini'),
      h('p', { class: 'secondario' }, 'Cambiare il rimborso km vale per i rapportini nuovi: quelli già scritti tengono la tariffa con cui sono nati.'),
      h('button', { class: 'btn primario', onclick: salvaImp(['EURO_KM', 'AUTO', 'COSTO_ORARIO', 'PREFISSO_COMMESSA', 'TICKET_ATTIVO']) }, 'Salva')));

    if (S.versione) main.append(h('p', { class: 'secondario' }, 'Wisper Ufficio ' + S.versione));
  }

  /** I gruppi e le loro regole: Elettrodinamica a 30 €/h fissi, i privati a tariffa libera. */
  function tariffeGruppi() {
    const scheda = h('div', { class: 'scheda' }, h('h2', null, 'Gruppi e tariffe'),
      h('p', { class: 'secondario' }, 'Ogni cliente sta in un gruppo. Con la tariffa fissa vale per tutti i clienti del gruppo; vuota, la tariffa si scrive nel rapportino e si propone l\'ultima usata per quel cliente.'));
    const corpo = h('tbody');
    const riga = g => {
      const v = {
        nome: h('input', { type: 'text', value: g.nome || '', disabled: !!g.nome, style: { width: '160px' } }),
        tariffa: h('input', { type: 'text', inputmode: 'decimal', value: g.tariffaFissa !== null && g.tariffaFissa !== undefined ? C.numero(g.tariffaFissa) : '', placeholder: 'libera', style: { width: '90px' } }),
        viaggio: h('input', { type: 'checkbox', checked: !!g.pagaViaggio }),
        km: h('input', { type: 'checkbox', checked: g.kmRimborsati !== false }),
        magg: h('input', { type: 'text', inputmode: 'decimal', value: g.maggExtra ? C.numero(g.maggExtra) : '', placeholder: '0', style: { width: '60px' } }),
        email: h('input', { type: 'email', value: g.email || '', placeholder: 'per il riepilogo del mese', style: { width: '220px' } }),
      };
      const salva = h('button', { class: 'btn piccolo', onclick: async () => {
        if (!v.nome.value.trim()) { v.nome.focus(); return; }
        const ris = await lavora('Salvo il gruppo', () => Api.post('/foglio/salvaGruppo', { gruppo: {
          nome: v.nome.value.trim(), tariffaFissa: C.numONull(v.tariffa.value), pagaViaggio: v.viaggio.checked,
          kmRimborsati: v.km.checked, maggExtra: C.num(v.magg.value), email: v.email.value.trim(),
        } }));
        if (ris) { await ricaricaAnagrafiche(); avviso('Salvato ' + ris.gruppo.nome); mostra(); }
      } }, 'Salva');
      return h('tr', { style: { cursor: 'default' } }, h('td', null, v.nome), h('td', null, v.tariffa, ' €/h'), h('td', null, v.viaggio), h('td', null, v.km),
        h('td', null, v.magg, ' %'), h('td', null, v.email), h('td', null, salva));
    };
    S.ana.gruppi.forEach(g => corpo.append(riga(g)));
    scheda.append(h('div', { class: 'tabella-scheda' }, h('table', { class: 'dati' },
      h('thead', null, h('tr', null, h('th', null, 'Gruppo'), h('th', null, 'Tariffa fissa'), h('th', null, 'Viaggio pagato'),
        h('th', null, 'Km rimborsati'), h('th', null, 'Ore extra'), h('th', null, 'Email'), h('th'))),
      corpo)),
    h('button', { class: 'btn collegamento', style: { marginTop: '8px' }, onclick: e => { corpo.append(riga({})); e.target.remove(); } }, '+ Aggiungi un gruppo'));
    return scheda;
  }

  // ======================================================================= avvio

  carica();
})();
