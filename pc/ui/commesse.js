/*
 * Wisper Ufficio: le Commesse (guida della fase 1, §5). Dal 03/11/2026 i progetti hanno la loro voce (progetti.js) e una
 * scheda Progetti dentro la commessa.
 *
 * L'elenco con Aperte, Sospese, Chiuse e Archivio; la pagina della commessa con
 * chi la segue, le prestazioni (valore, avanzamento, +10%, Segna fatta, ordine
 * trascinando), i rapportini, i documenti, i costi e cosa c'è da fatturare; il
 * menu ⋯ per duplicarla, farne un modello, sospenderla, chiuderla, archiviarla.
 * Panoramica, Rapportini, Documenti, Costi e Da fatturare sono quelli della 0.4.0.
 */
(function (radice) {
  'use strict';

  radice.WisperCommesse = function (W) {
    const { S, C, R, B, Rete } = W;
    const { h, aggiungi, svuota, icona, tondo, iniziali, stato, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, conSuffisso, segmenti, cerca, riga, quadrato, segnaposto } = B;
    const puo = W.puo;
    const soldi = W.soldi;
    const RO = radice.WisperRegoleOreSpese;

    /*
     * Fase 3 (architettura.md §14.11): il costo della commessa con le ore registrate, le
     * spese fuori dai rapportini e le trasferte lo sa il server (costoCommessa). Si legge
     * entrando nella pagina della commessa; finché non arriva valgono i numeri della fase 1.
     */
    let costi = {};
    window.addEventListener('hashchange', () => { costi = {}; });
    function costoDi(m) {
      if (!soldi()) return null;
      const c = costi[m.id];
      if (c) return c.dati;
      costi[m.id] = { dati: null };
      Rete.get('/server/costoCommessa?idCommessa=' + encodeURIComponent(m.id)).then(r => {
        costi[m.id] = { dati: (r && r.costoCommessa) || null };
        if (r && r.costoCommessa && location.hash === '#commesse/' + encodeURIComponent(m.id)) W.ridisegna();
      }).catch(() => { costi[m.id] = { dati: null }; });
      return null;
    }

    // ===================================================================== elenco

    function vista(pagina) {
      const f = S.filtriCommesse;
      const n = R.contaCommesse(S.ana.commesse);
      const area = h('div', { class: 'sezione' });
      const chip = (testo, togli) => h('span', { class: 'filtro-attivo' }, testo,
        h('button', { type: 'button', 'aria-label': 'Togli il filtro ' + testo, onclick: togli }, icona('chiudi', 14, 2.6)));
      aggiungi(pagina, [
        h('div', { class: 'testata' }, h('div', { class: 'titoli' }, h('h1', null, 'Commesse')),
          puo('commesse', 2) ? h('button', { type: 'button', class: 'btn giallo', onclick: () => modulo(null) }, icona('piu', 18, 2.6), 'Nuova commessa') : null),
        h('div', { class: 'filtri' },
          segmenti([['APERTA', 'Aperte · ' + n.aperte], ['SOSPESA', 'Sospese · ' + n.sospese], ['CHIUSA', 'Chiuse · ' + n.chiuse], ['ARCHIVIO', 'Archivio · ' + n.archivio]],
            f.stato || 'APERTA', x => { f.stato = x; W.disegnaPagina(); }),
          cerca(f.testo, 'Codice, commessa, cliente', x => { f.testo = x; tabella(area); }),
          f.cliente ? chip((W.cliente(f.cliente) || { nome: f.cliente }).nome, () => { f.cliente = ''; W.disegnaPagina(); }) : null,
          f.ritardo ? chip('In ritardo', () => { f.ritardo = false; W.disegnaPagina(); }) : null,
          f.responsabile === 'nessuno' ? chip('Senza responsabile', () => { f.responsabile = ''; W.disegnaPagina(); }) : null),
        area]);
      tabella(area);
    }

    const COLONNE = () => '110px minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1.2fr) minmax(150px, 1.6fr)' + (soldi() ? ' 110px' : '');

    function tabella(area) {
      svuota(area);
      const f = S.filtriCommesse;
      const lista = R.filtraCommesse(S.ana.commesse, Object.assign({}, f, { stato: f.stato || 'APERTA' }), id => (W.cliente(id) || {}).nome || '');
      if (!lista.length) {
        aggiungi(area, [h('p', { class: 'vuoto' }, f.stato === 'ARCHIVIO' ? 'Nessuna commessa archiviata.' : 'Nessuna commessa.')]);
        return;
      }
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: COLONNE() } },
        h('span', null, 'Codice'), h('span', null, 'Commessa'), h('span', null, 'Cliente'), h('span', null, 'Responsabile'), h('span', null, 'Ore sul budget'),
        soldi() ? h('span', { class: 'n' }, 'Margine') : null));
      lista.forEach(m => {
        const c = W.cliente(m.idCliente);
        const k = C.cruscotto(m, S.rapportini, S.ana.impostazioni, null, c);
        const resp = m.responsabileId ? W.utente(m.responsabileId) : null;
        const perc = k.budgetOre ? Math.min(100, Math.round(k.percOre * 100)) : 0;
        aggiungi(tab, [h('div', { class: 'r cliccabile alta', style: { gridTemplateColumns: COLONNE() }, role: 'button', tabindex: '0',
          onclick: () => W.vai('#commesse/' + encodeURIComponent(m.id)), onkeydown: e => { if (e.key === 'Enter') W.vai('#commesse/' + encodeURIComponent(m.id)); } },
        h('span', null, h('span', { class: 'codice' }, m.id)),
        h('span', { class: 'forte taglia' }, m.descrizione),
        h('span', { class: 'taglia t2' }, c ? c.nome : m.idCliente),
        h('span', { class: 'taglia' }, resp ? resp.nome : h('span', { class: 'da-scegliere' }, 'da scegliere')),
        h('span', { class: 'ore-budget' }, h('span', { class: 'piccolo' }, k.budgetOre ? C.numero(k.ore) + ' di ' + C.numero(k.budgetOre) + ' h' : C.numero(k.ore) + ' h, senza budget'),
          k.budgetOre ? h('span', { class: 'barra sottile' }, h('i', { class: k.livelloOre, style: { width: perc + '%' } })) : null),
        soldi() ? h('span', { class: 'n forte' + (k.costo.lavoroNoto && k.margine < 0 ? ' negativo' : '') }, k.costo.lavoroNoto ? C.euro(k.margine) : '—') : null)]);
      });
      aggiungi(area, [tab]);
    }

    // ===================================================================== pagina

    function pagina(contenitore, id) {
      const m = W.commessa(id);
      if (!m) { aggiungi(contenitore, [h('p', { class: 'vuoto' }, 'Commessa ' + id + ' non trovata.')]); return; }
      const c = W.cliente(m.idCliente);
      const k = C.cruscotto(m, S.rapportini, S.ana.impostazioni, null, c);
      const sede = S.ana.sedi.find(s => String(s.id) === String(m.sedeId));
      const prestazioni = S.ana.prestazioni.filter(p => p.idCommessa === m.id);
      const scrive = puo('commesse', 2);
      const area = h('div', { class: 'sezione stretta-820' });

      const altro = scrive ? h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, vociMenu(m)));
      aggiungi(contenitore, [
        h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna alle commesse', () => W.vai('#commesse')), h('span', { class: 'dove' }, 'Commesse')),
        h('div', { class: 'testata in-alto' },
          h('div', { class: 'titoli' },
            h('div', { class: 'pillole-testa' }, h('span', { class: 'codice' }, m.id), stato(m.stato, true),
              m.archiviata ? pillola('Archiviata', 'grigio') : null, m.modello ? pillola('Modello', 'grigio') : null,
              // Fase 5: la commessa di un contratto di assistenza, col contratto linkato.
              m.idContratto ? (puo('ticket') ? h('button', { type: 'button', class: 'pill p-blu pill-fattura', title: 'Apri il contratto', onclick: () => W.vai('#ticket/contratto/' + m.idContratto) }, 'Assistenza') : pillola('Assistenza', 'blu')) : null,
              soldi() && puo('fatturazione') && m.modoFatturazione ? pillola({ ore: 'A ore', corpo: 'A corpo', misto: 'Misto' }[m.modoFatturazione] || m.modoFatturazione, 'grigio') : null),
            h('h1', { class: 'titolo-scheda' }, m.descrizione),
            h('span', { class: 'sotto-titolo' }, [c ? c.nome : m.idCliente, sede ? sede.nome : m.indirizzo].filter(Boolean).join(' · '))),
          altro,
          scrive ? h('button', { type: 'button', class: 'btn giallo', onclick: () => modulo(m) }, 'Modifica') : null),
        schedaPersone(m),
        segmenti([['panoramica', 'Panoramica']].concat(conProgetti() ? [['progetti', 'Progetti · ' + progettiDi(m).length]] : [])
          .concat([['prestazioni', 'Prestazioni · ' + prestazioni.length], ['rapportini', 'Rapportini']]).concat(puoDocumenti(1) ? [['documenti', 'Documenti']] : [])
          .concat(soldi() ? [['costi', 'Costi'], ['dafatturare', 'Da fatturare']] : [])
          // Fase 6 (§12.8): gli incarichi ai collaboratori esterni sulla commessa (con collaboratori 1).
          .concat(puo('collaboratori') && !(W.eEsterno && W.eEsterno()) ? [['incarichi', 'Incarichi' + (S.conteIncarichi && typeof S.conteIncarichi[m.id] === 'number' ? ' · ' + S.conteIncarichi[m.id] : ''), { 'data-conta': 'incarichi' }]] : [])
          // Fase 7 (§12.6): lo storico delle comunicazioni della commessa.
          .concat(puo('comunicazioni') && W.Comunicazioni ? [['comunicazioni', 'Comunicazioni' + (S.conteComunicazioni && typeof S.conteComunicazioni[m.id] === 'number' ? ' · ' + S.conteComunicazioni[m.id] : ''), { 'data-conta': 'comunicazioni' }]] : []),
        schedaDi(m), x => { S.schedaCommessa[m.id] = x; W.disegnaPagina(); }),
        area]);

      const scheda = schedaDi(m);
      if (scheda === 'prestazioni') prestazioniCommessa(area, m);
      // 03/11/2026 (progetti.md §4): i progetti della commessa, con "Nuovo progetto".
      else if (scheda === 'progetti' && conProgetti()) W.Progetti.schedaCommessa(area, m);
      else if (scheda === 'rapportini') {
        if (puo('rapportini', 2)) {
          aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
            h('button', { type: 'button', class: 'btn', onclick: () => W.moduloRapportino(null, { idCliente: m.idCliente, idCommessa: m.id }) }, icona('piu', 18, 2.6), 'Nuovo rapportino'))]);
        }
        aggiungi(area, [W.tabellaRapportini(C.ordina(k.rapportini, 'data', -1))]);
      } else if (scheda === 'costi' && soldi()) costiCommessa(area, m, k, costoDi(m));
      else if (scheda === 'dafatturare' && soldi()) { if (puo('fatturazione') && W.Fatture) W.Fatture.incorporaDaFatturare(area, m.id); else daFatturare(area, k); }
      // Fase 5: la scheda Documenti è l'archivio filtrato (cartella in cima, documenti, "Da Wisper"); con un server vecchio quella di prima.
      else if (scheda === 'documenti' && puoDocumenti(1)) { if (W.Archivio && W.perm().documenti !== undefined) W.Archivio.schedaDocumenti(area, { idCommessa: m.id }); else documentiCommessa(area, m); }
      else if (scheda === 'incarichi' && puo('collaboratori')) incarichiCommessa(area, m);
      else if (scheda === 'comunicazioni' && puo('comunicazioni') && W.Comunicazioni) W.Comunicazioni.schedaCommessa(area, m.id, m.idCliente);
      else { panoramica(area, m, k, soldi() ? RO.costiConFase3(k, costoDi(m)) : null); inPrestito(area, m); }
      // Fase 7: il numero delle comunicazioni della commessa arriva dal server mentre la scheda è aperta.
      if (puo('comunicazioni') && W.Comunicazioni && !(S.conteComunicazioni && typeof S.conteComunicazioni[m.id] === 'number')) {
        Rete.get('/server/comunicazioni?idCommessa=' + encodeURIComponent(m.id)).then(r => {
          S.conteComunicazioni = S.conteComunicazioni || {};
          S.conteComunicazioni[m.id] = typeof r.quante === 'number' ? r.quante : (r.comunicazioni || []).length;
          const b = document.querySelector('[data-conta="comunicazioni"]');
          if (b) b.textContent = 'Comunicazioni · ' + S.conteComunicazioni[m.id];
        }).catch(() => null);
      }
      // Il numero degli incarichi arriva dal server mentre la scheda è aperta.
      if (puo('collaboratori') && !(W.eEsterno && W.eEsterno()) && !(S.conteIncarichi && typeof S.conteIncarichi[m.id] === 'number')) {
        Rete.get('/server/incarichi?stato=tutti&idCommessa=' + encodeURIComponent(m.id)).then(r => {
          S.conteIncarichi = S.conteIncarichi || {};
          S.conteIncarichi[m.id] = (r.incarichi || []).filter(i => i.stato !== 'annullato').length;
          const b = document.querySelector('[data-conta="incarichi"]');
          if (b) b.textContent = 'Incarichi · ' + S.conteIncarichi[m.id];
        }).catch(() => null);
      }
    }

    /** Fase 6: gli incarichi della commessa (collaboratore, cosa, stato, avanzamento; i soldi con costi), ognuno apre la sua scheda. */
    async function incarichiCommessa(area, m) {
      aggiungi(area, [segnaposto(2, 64)]);
      let r;
      try { r = await Rete.get('/server/incarichi?stato=tutti&idCommessa=' + encodeURIComponent(m.id)); } catch (e) { svuota(area); if (e.accesso !== false) aggiungi(area, [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message))]); return; }
      svuota(area);
      const P6 = radice.WisperRegolePersone;
      const lista = r.incarichi || [];
      if (puo('collaboratori', 2) && soldi() && W.Collaboratori) aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn', onclick: () => W.Collaboratori.nuovoIncarico(null) }, icona('piu', 18, 2.6), 'Nuovo incarico'))]);
      aggiungi(area, [lista.length ? h('div', { class: 'scheda righe' }, lista.map(i => riga({
        sinistra: quadrato('collaboratori', i.stato === 'affidato' ? 'ico-blu' : i.stato === 'bozza' ? 'ico-giallo' : 'ico-grigio'),
        titolo: i.numero + ' · ' + i.titolo, sotto: [i.collaboratore, i.modo === 'corpo' ? 'a corpo · ' + (Number(i.avanzamento) || 0) + '%' : 'a ore', i.conti ? 'maturato ' + C.euro(i.conti.maturato) + ' · fatturato ' + C.euro(i.conti.fatturato) : ''].filter(Boolean).join(' · '),
        destra: pillola(i.statoVisto || P6.STATI_INCARICO[i.stato], P6.coloreIncarico(i.stato)), onclick: () => W.vai('#collaboratori/in/' + i.id),
      }))) : h('p', { class: 'vuoto' }, 'Nessun incarico su questa commessa.')]);
    }

    /** Fase 6: gli strumenti e i mezzi in prestito alla commessa (lasciati in cantiere), in fondo alla panoramica. */
    function inPrestito(area, m) {
      if (!puo('mezzi')) return;
      const zona = h('div');
      aggiungi(area, [zona]);
      Rete.get('/server/assegnazioni?inCorso=1&idCommessa=' + encodeURIComponent(m.id)).then(r => {
        const l = r.assegnazioni || [];
        if (!l.length) return;
        aggiungi(zona, [h('div', { class: 'sezione' }, h('h2', null, 'In prestito alla commessa'), h('div', { class: 'scheda righe' }, l.map(a => riga({ sinistra: quadrato(a.idVeicolo ? 'furgone' : 'misura', a.inRitardo ? 'ico-rosso' : 'ico-grigio'), titolo: a.oggetto,
          sotto: 'dal ' + C.data(a.dal) + (a.rientro ? ' · rientro il ' + C.data(a.rientro) : ''), destra: a.inRitardo ? pillola('Oltre il rientro', 'rosso') : null,
          onclick: () => W.vai(a.idVeicolo ? '#mezzi/mezzo/' + a.idVeicolo : '#mezzi/at/' + a.idAttrezzatura) }))))]);
      }).catch(() => null);
    }

    /** La scheda Progetti c'è con la funzione accesa e il permesso di vederli. */
    const conProgetti = () => !!(W.progettiAccesi && W.progettiAccesi() && puo('progetti') && W.Progetti);
    const progettiDi = m => (S.ana.progetti || []).filter(p => String(p.idCommessa).toUpperCase() === String(m.id).toUpperCase());

    /** Si apre su Prestazioni se ce ne sono, altrimenti su Panoramica. */
    function schedaDi(m) {
      const scelta = S.schedaCommessa[m.id];
      const valide = ['panoramica', 'prestazioni', 'rapportini', 'documenti'].concat(conProgetti() ? ['progetti'] : []).concat(soldi() ? ['costi', 'dafatturare'] : [])
        // Fase 7: Comunicazioni; con lei anche Incarichi (fase 6), che qui mancava e riportava alla panoramica.
        .concat(puo('collaboratori') ? ['incarichi'] : []).concat(puo('comunicazioni') ? ['comunicazioni'] : []);
      if (scelta && valide.indexOf(scelta) >= 0) return scelta;
      return S.ana.prestazioni.some(p => p.idCommessa === m.id) ? 'prestazioni' : 'panoramica';
    }

    function schedaPersone(m) {
      const resp = m.responsabileId ? W.utente(m.responsabileId) : null;
      const persone = (m.persone || []).map(id => W.utente(id)).filter(Boolean);
      return h('div', { class: 'scheda persone-commessa' },
        h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Responsabile'), h('span', { class: 'v' }, resp ? resp.nome : h('span', { class: 'da-scegliere' }, 'da scegliere'))),
        h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Persone'),
          persone.length ? h('span', { class: 'cerchi' }, persone.map(u => h('span', { class: 'cerchio-io piccolo', title: u.nome }, B.lettere(u.nome)))) : h('span', { class: 'v' }, '—')),
        h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Fine prevista'), h('span', { class: 'v' }, m.finePrevista ? R.dataTitolo(m.finePrevista) : '—')));
    }

    function vociMenu(m) {
      const voci = [
        { testo: 'Duplica', fn: () => duplica(m, false) },
        { testo: 'Duplica come modello', fn: () => duplica(m, true) },
        '-',
      ];
      if (m.stato === 'APERTA') {
        voci.push({ testo: 'Sospendi', fn: () => cambiaStato(m, 'SOSPESA') }, { testo: 'Chiudi', fn: () => cambiaStato(m, 'CHIUSA') });
      } else {
        voci.push({ testo: 'Riapri', fn: () => cambiaStato(m, 'APERTA') });
      }
      voci.push('-', m.archiviata ? { testo: 'Ripristina', fn: () => archivia(m, false) } : { testo: 'Archivia', fn: () => archivia(m, true), pericolo: true });
      return voci;
    }

    async function duplica(m, comeModello) {
      const ris = await lavora(comeModello ? 'Creo il modello' : 'Duplico la commessa', () => Rete.post('/server/duplicaCommessa', { id: m.id, comeModello }));
      if (!ris) return;
      await W.ricaricaAnagrafiche().catch(() => null);
      if (comeModello) {
        avviso('Modello creato: lo trovi in Nuova commessa, «Da un modello»');
        W.ridisegna();
      } else {
        avviso('Creata ' + ris.commessa.id + ', copia di ' + m.id);
        W.vai('#commesse/' + encodeURIComponent(ris.commessa.id));
      }
    }

    async function cambiaStato(m, st) {
      const frasi = {
        SOSPESA: ['Sospendere la commessa?', 'Non si propone più nei rapportini nuovi finché non la riapri.'],
        CHIUSA: ['Chiudere la commessa?', 'Il lavoro è finito: non si propone più nei rapportini nuovi. Ore, costi e rapportini restano, e si può riaprire.'],
        APERTA: ['Riaprire la commessa?', 'Torna fra quelle proposte nei rapportini.'],
      };
      const ok = await conferma(frasi[st][0], frasi[st][1], st === 'APERTA' ? 'Riapri' : st === 'CHIUSA' ? 'Chiudi' : 'Sospendi');
      if (!ok) return;
      const prima = m.stato;
      const ris = await lavora('Aggiorno la commessa', () => Rete.post('/server/aggiornaCommessa', { id: m.id, campi: { stato: st } }));
      if (!ris) return;
      Object.assign(m, ris.commessa);
      W.caricaDashboard();
      avviso('Commessa ' + String(ris.commessa.stato).toLowerCase(), false, null, { testo: 'Annulla', fn: async () => {
        const indietro = await lavora('Rimetto com\'era', () => Rete.post('/server/aggiornaCommessa', { id: m.id, campi: { stato: prima } }));
        if (indietro) { Object.assign(m, indietro.commessa); W.ridisegna(); }
      } });
      W.ridisegna();
    }

    async function archivia(m, si) {
      if (si) {
        const ok = await conferma('Archiviare ' + m.id + '?', 'Non comparirà più negli elenchi e nei rapportini nuovi. Rapportini e documenti restano. Si ripristina dall\'Archivio.', 'Archivia');
        if (!ok) return;
      }
      const ris = await lavora(si ? 'Archivio la commessa' : 'Ripristino la commessa', () => Rete.post(si ? '/server/archiviaCommessa' : '/server/ripristinaCommessa', { id: m.id }));
      if (!ris) return;
      Object.assign(m, ris.commessa || { archiviata: si });
      m.archiviata = !!m.archiviata;
      W.caricaDashboard();
      avviso(si ? 'Commessa archiviata' : 'Commessa ripristinata', false, null, si ? { testo: 'Annulla', fn: () => archivia(m, false) } : null);
      W.ridisegna();
    }

    // ===================================================================== prestazioni

    function prestazioniCommessa(area, m) {
      const lista = R.ordinaPrestazioni(S.ana.prestazioni.filter(p => p.idCommessa === m.id));
      const scrive = puo('commesse', 2);
      if (lista.length && soldi()) {
        const t = R.totaliPrestazioni(lista);
        aggiungi(area, [h('div', { class: 'scheda fatto-prestazioni' },
          h('div', { class: 'alto' }, h('span', { class: 'numero-grande' }, C.euro(t.fatto)),
            h('span', { class: 'sotto-titolo' }, 'fatto su ' + C.euro(t.totale) + (C.num(m.importoContratto) ? ' · contratto ' + C.euro(m.importoContratto) : ''))),
          h('div', { class: 'barra' }, h('i', { style: { width: t.perc + '%' } })))]);
      }
      if (!lista.length) {
        aggiungi(area, [h('div', { class: 'scheda' }, h('p', { class: 'vuoto sinistra' }, 'Dividi la commessa in prestazioni (sopralluogo, progetto, direzione lavori…) per seguirne valore e avanzamento.'))]);
      } else {
        const scheda = h('div', { class: 'scheda righe prestazioni' });
        lista.forEach((p, i) => aggiungi(scheda, [rigaPrestazione(m, p, i, lista, scrive)]));
        aggiungi(area, [scheda]);
      }
      if (scrive) {
        aggiungi(area, [h('div', null, h('button', { type: 'button', class: 'btn grande', onclick: () => moduloPrestazione(m, null) }, icona('piu', 18, 2.6), 'Aggiungi una prestazione'))]);
      }
    }

    const COLORE_STATO = { da_fare: 'grigio', in_corso: 'giallo', fatta: 'verde' };

    function rigaPrestazione(m, p, indice, lista, scrive) {
      const av = Number(p.avanzamento) || 0;
      const st = R.statoPrestazione(av);
      const el = h('div', { class: 'prestazione' + (scrive ? ' modificabile' : ''), 'data-indice': indice, draggable: scrive ? 'true' : null,
        role: scrive ? 'button' : null, tabindex: scrive ? '0' : null, 'aria-label': scrive ? 'Modifica ' + p.nome : null,
        onclick: e => { if (scrive && !e.target.closest('button')) moduloPrestazione(m, p); },
        onkeydown: e => { if (scrive && e.key === 'Enter' && e.target === el) moduloPrestazione(m, p); } },
      scrive ? h('span', { class: 'maniglia', title: 'Trascina per cambiare l\'ordine', 'aria-hidden': 'true' }, icona('trascina', 18)) : null,
      h('div', { class: 'corpo-prestazione' },
        h('div', { class: 'alto' }, h('span', { class: 't1' }, p.nome), soldi() && p.valore !== undefined ? h('span', { class: 'quanto' }, C.euro(p.valore)) : null),
        p.descrizione ? h('div', { class: 't2' }, p.descrizione) : null,
        h('div', { class: 'medio' }, h('span', { class: 'barra' }, h('i', { style: { width: av + '%' } })), h('span', { class: 'perc' }, av + '%'),
          pillola(R.NOMI_STATO_PRESTAZIONE[st], COLORE_STATO[st])),
        scrive && av < 100 ? h('div', { class: 'basso' },
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => avanza(p, R.avanzamento(av, 10)) }, '+10%'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => avanza(p, 100, true) }, 'Segna fatta')) : null));
      if (scrive) trascinabile(el, m, lista);
      return el;
    }

    async function avanza(p, valore, fatta) {
      const prima = Number(p.avanzamento) || 0;
      const ris = await salvaPrestazione({ id: p.id, idCommessa: p.idCommessa, avanzamento: valore, stato: R.statoPrestazione(valore) }, 'Aggiorno');
      if (!ris) return;
      W.ridisegna();
      if (fatta) {
        avviso(p.nome + ': fatta', false, null, { testo: 'Annulla', fn: async () => {
          if (await salvaPrestazione({ id: p.id, idCommessa: p.idCommessa, avanzamento: prima, stato: R.statoPrestazione(prima) }, 'Rimetto com\'era')) W.ridisegna();
        } });
      }
    }

    /** Salva una prestazione e la rimette nell'elenco con quello che risponde il server. */
    async function salvaPrestazione(campi, testo) {
      const ris = await lavora(testo || 'Salvo la prestazione', () => Rete.post('/server/salvaPrestazione', { prestazione: campi }));
      if (!ris) return null;
      const nuova = ris.prestazione || campi;
      const i = S.ana.prestazioni.findIndex(x => String(x.id) === String(nuova.id));
      if (i >= 0) S.ana.prestazioni[i] = Object.assign({}, S.ana.prestazioni[i], nuova); else S.ana.prestazioni.push(nuova);
      return nuova;
    }

    /** L'ordine si cambia trascinando le righe: si salva subito. */
    let trascinata = null;
    function trascinabile(el, m, lista) {
      el.addEventListener('dragstart', e => {
        trascinata = Number(el.dataset.indice);
        el.classList.add('trascinata');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(trascinata)); } catch (x) { /* qualche motore non vuole */ }
      });
      el.addEventListener('dragend', () => { el.classList.remove('trascinata'); document.querySelectorAll('.prestazione.sopra, .prestazione.sotto').forEach(x => x.classList.remove('sopra', 'sotto')); });
      el.addEventListener('dragover', e => {
        if (trascinata === null) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const sopra = e.clientY < r.top + r.height / 2;
        el.classList.toggle('sopra', sopra);
        el.classList.toggle('sotto', !sopra);
      });
      el.addEventListener('dragleave', () => el.classList.remove('sopra', 'sotto'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        if (trascinata === null) return;
        const qui = Number(el.dataset.indice);
        const r = el.getBoundingClientRect();
        let a = e.clientY < r.top + r.height / 2 ? qui : qui + 1;
        if (trascinata < a) a -= 1;
        const da = trascinata;
        trascinata = null;
        if (a !== da) ordina(m, R.sposta(lista, da, a));
      });
    }

    async function ordina(m, nuovoOrdine) {
      const prima = nuovoOrdine.map(p => ({ id: p.id, ordine: p.ordine }));
      nuovoOrdine.forEach((p, i) => { const x = S.ana.prestazioni.find(y => y.id === p.id); if (x) x.ordine = i + 1; });
      W.ridisegna();
      const ris = await lavora('Salvo l\'ordine', () => Rete.post('/server/ordinaPrestazioni', { idCommessa: m.id, ids: nuovoOrdine.map(p => p.id) }));
      if (!ris) {
        prima.forEach(p => { const x = S.ana.prestazioni.find(y => y.id === p.id); if (x) x.ordine = p.ordine; });
        W.ridisegna();
      }
    }

    function moduloPrestazione(m, p) {
      const esistente = !!p;
      const x = p ? Object.assign({}, p) : { idCommessa: m.id, nome: '', descrizione: '', valore: null, avanzamento: 0 };
      const v = {
        nome: h('input', { type: 'text', value: x.nome || '' }),
        descrizione: h('textarea', { rows: 3 }),
        valore: h('input', { type: 'text', inputmode: 'decimal', value: x.valore !== null && x.valore !== undefined && x.valore !== '' ? R.numeroCampo(x.valore) : '' }),
      };
      v.descrizione.value = x.descrizione || '';
      let av = Number(x.avanzamento) || 0;
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const zonaAv = h('div', { class: 'riga-stepper' });
      const disegnaAv = () => {
        const st = R.statoPrestazione(av);
        aggiungi(svuota(zonaAv), [h('span', { class: 'nome' }, h('b', null, 'Avanzamento'), pillola(R.NOMI_STATO_PRESTAZIONE[st], COLORE_STATO[st])),
          h('span', { class: 'stepper' }, tondo('meno', 'Meno 5%', () => { av = R.avanzamento(av, -5); disegnaAv(); }),
            h('span', { class: 'valore' }, av + '%'), tondo('piu', 'Più 5%', () => { av = R.avanzamento(av, 5); disegnaAv(); }))]);
      };
      const disegna = () => aggiungi(svuota(zona), [
        campo('Nome', v.nome, errori.nome),
        campo('Descrizione', v.descrizione),
        soldi() ? campo('Valore', conSuffisso(v.valore, '€'), errori.valore) : null,
        zonaAv]);
      disegnaAv();
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = 'Scrivi come si chiama la prestazione';
        if (v.valore.value.trim() && C.numONull(v.valore.value) === null) errori.valore = 'Non è un numero';
        if (Object.keys(errori).length) { disegna(); return; }
        const campi = { idCommessa: m.id, nome: v.nome.value.trim(), descrizione: v.descrizione.value.trim(), avanzamento: av, stato: R.statoPrestazione(av) };
        if (esistente) campi.id = p.id;
        if (soldi()) campi.valore = C.num(v.valore.value);
        if (await salvaPrestazione(campi)) { chiudi(); avviso(esistente ? 'Prestazione salvata' : 'Prestazione aggiunta'); W.ridisegna(); }
      };
      const lista = R.ordinaPrestazioni(S.ana.prestazioni.filter(y => y.idCommessa === m.id));
      const pos = esistente ? lista.findIndex(y => y.id === p.id) : -1;
      const sposta = d => { chiudi(); ordina(m, R.sposta(lista, pos, pos + d)); };
      chiudi = finestra({
        titolo: esistente ? p.nome : 'Nuova prestazione', corpo: zona,
        pulsanti: [
          esistente ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: async () => {
            const ok = await conferma('Togliere la prestazione?', p.nome + ' sparisce dalla commessa.', 'Togli', true);
            if (!ok) return;
            const ris = await lavora('Tolgo la prestazione', () => Rete.post('/server/togliPrestazione', { id: p.id }));
            if (!ris) return;
            S.ana.prestazioni = S.ana.prestazioni.filter(y => y.id !== p.id);
            chiudi();
            avviso('Prestazione tolta');
            W.ridisegna();
          } }, 'Togli') : null,
          // Anche con la tastiera, non solo trascinando.
          esistente && pos > 0 ? h('button', { type: 'button', class: 'btn testo grande', onclick: () => sposta(-1) }, 'Sposta su') : null,
          esistente && pos < lista.length - 1 ? h('button', { type: 'button', class: 'btn testo grande', onclick: () => sposta(1) }, 'Sposta giù') : null,
          'spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')].filter(Boolean),
      });
    }

    // ===================================================================== le schede della 0.4.0

    function panoramica(area, m, k, x) {
      const perc = v => v === null ? '' : Math.round(v * 100) + '%';
      const riquadro = W.riquadro;
      // Con la risposta del server (fase 3) costo e margine contano anche ore registrate, spese e trasferte.
      const noto = x ? x.lavoroNoto : k.costo.lavoroNoto;
      const sostenuto = x ? x.costoSostenuto : k.costo.totale;
      const margine = x ? x.margine : k.margine;
      const percMargine = x ? x.percMargine : k.percMargine;
      const daBudget = x ? x.margineDaBudget : k.margineDaBudget;
      const costoAtteso = x ? x.costoAtteso : k.costoAtteso;
      if (soldi()) {
        const b = k.previsto;
        if ((b && (b.ore !== null || b.euro !== null || b.prezzo !== null)) || C.num(m.importoContratto)) {
          const voce = (che, quanto, nota) => h('div', { class: 'voce-budget' }, h('span', { class: 'piccolo' }, che), h('b', null, quanto), nota ? h('span', { class: 'piccolo' }, nota) : null);
          const tratt = '—';
          aggiungi(area, [h('div', { class: 'scheda' }, h('h2', null, 'Budget'),
            h('div', { class: 'griglia-budget' },
              voce('Ore previste', b.ore !== null ? C.ore(b.ore) : tratt, k.ore ? C.ore(k.ore) + ' fatte' : null),
              voce('Prezzo orario', b.prezzo !== null ? C.numero(b.prezzo) + ' €/h' : tratt),
              voce('Costo orario', b.costo !== null ? C.numero(b.costo) + ' €/h' : tratt),
              voce('Margine orario', b.margineOrario !== null ? C.numero(b.margineOrario) + ' €/h' : tratt),
              voce('Budget', b.euro !== null ? C.euro(b.euro) : tratt),
              voce('Costo previsto', b.costoPrevisto !== null ? C.euro(b.costoPrevisto) : tratt),
              voce('Margine previsto', b.margine !== null ? C.euro(b.margine) : tratt, b.euro && b.margine !== null ? perc(b.margine / b.euro) : null),
              voce('Contratto', C.num(m.importoContratto) ? C.euro(m.importoContratto) : tratt)))]);
        }
        aggiungi(area, [h('div', { class: 'tre-colonne' },
          riquadro('Valore atteso', C.euro(k.valoreAtteso), (m.budgetEuro || (k.previsto && k.previsto.euro)) && (m.budgetEuro || k.previsto.euro) >= k.valoreMaturato ? 'il budget della commessa' : 'quello che i rapportini hanno maturato'),
          riquadro('Costo sostenuto', noto ? C.euro(sostenuto) : '—',
            noto ? (k.valoreAtteso > 0 ? perc(sostenuto / k.valoreAtteso) + ' del valore atteso' : '') : 'manca il costo orario in Amministrazione'),
          riquadro('Margine atteso', noto ? C.euro(margine) : '—',
            noto && percMargine !== null ? perc(percMargine) + (margine < 0 ? ': costa più di quanto vale'
              : daBudget ? ', dopo ' + C.euro(costoAtteso) + ' di costi previsti' : ', dopo i costi') : '', null, noto && margine < 0))]);

        if (puo('fatturazione') && W.Fatture) { aggiungi(area, [fatturazioneCommessa(m)]); } else {
        const tot = k.fatturato + k.prontoDaFatturare + k.inBozza;
        const pezzo = (x, classe) => tot > 0 && x > 0 ? h('i', { class: classe, style: { width: (x / tot * 100) + '%' } }) : null;
        aggiungi(area, [h('div', { class: 'scheda' },
          h('h2', null, 'Fatturazione'),
          h('div', { class: 'barra' }, pezzo(k.fatturato, 'fatturato'), pezzo(k.prontoDaFatturare, 'pronto'), pezzo(k.inBozza, 'bozza')),
          h('div', { class: 'legenda' },
            h('span', null, h('i', { style: { background: 'var(--testo)' } }), 'Fatturato ' + C.euro(k.fatturato)),
            h('span', null, h('i', { style: { background: 'var(--firmato)' } }), 'Pronto da fatturare ' + C.euro(k.prontoDaFatturare)),
            h('span', null, h('i', { style: { background: 'var(--bordo-campo)' } }), 'Da far firmare ' + C.euro(k.inBozza))))]);
        }
      }

      const ore = h('div', { class: 'scheda' }, h('h2', null, 'Ore'));
      const corpoOre = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' } });
      if (k.budgetOre) {
        aggiungi(corpoOre, [h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: '700' } },
          h('span', null, C.numero(k.ore) + ' ore di ' + C.numero(k.budgetOre) + ' a budget'),
          h('span', { class: k.livelloOre === 'sforato' ? 'stato pericolo' : k.livelloOre === 'attenzione' ? 'stato avviso' : 'tenue' },
            k.livelloOre === 'sforato' ? 'Oltre il budget' : k.livelloOre === 'attenzione' ? 'Vicina al budget' : perc(k.percOre))),
        h('div', { class: 'barra' }, h('i', { class: k.livelloOre, style: { width: Math.min(100, Math.round(k.percOre * 100)) + '%' } }))]);
      } else {
        aggiungi(corpoOre, [h('div', { style: { fontWeight: '700' } }, C.numero(k.ore) + ' ore')]);
      }
      if (k.percTempo !== null) {
        aggiungi(corpoOre, [h('div', { class: 'secondario' }, 'Tempo ' + perc(k.percTempo) + (k.giorniMancanti >= 0 ? ' · mancano ' + k.giorniMancanti + ' giorni' : ' · scaduta da ' + (-k.giorniMancanti) + ' giorni')),
          h('div', { class: 'barra sottile' }, h('i', { class: 'bozza', style: { width: Math.round(k.percTempo * 100) + '%' } }))]);
      }
      const massimo = Math.max(1, ...k.settimane.map(s => s.ore));
      aggiungi(corpoOre, [h('div', { class: 'etichetta', style: { marginTop: '8px' } }, 'Settimana per settimana'),
        h('div', { class: 'settimane' }, k.settimane.map(s => h('div', { class: 'settimana', title: 'Settimana del ' + C.data(s.inizio) + ': ' + C.numero(s.ore) + ' ore' },
          h('span', null, s.ore ? C.numero(s.ore) : ''),
          h('div', { class: 'colonna' + (s.ore ? ' piena' : ''), style: { height: Math.round(s.ore / massimo * 80) + 'px' } }),
          h('span', null, W.dataBreve(s.inizio)))))]);
      aggiungi(ore, [corpoOre]);
      aggiungi(area, [ore]);
      if (m.note) aggiungi(area, [h('div', { class: 'scheda' }, h('h2', null, 'Note'), h('div', { class: 'lavoro' }, m.note))]);
    }

    /**
     * La fatturazione della commessa (fase4.md §13.1, architettura.md §15.12): dal server
     * (fatturazioneCommessa) contratto, fatturato, incassato, da fatturare, in bozza e previsto,
     * con la barra; accanto le scadenze di pagamento del contratto con lo stato (Prevista ·
     * In bozza W-15 · Fatturata 45/2026 · Incassata), ognuna col collegamento alla sua fattura.
     */
    function fatturazioneCommessa(m) {
      const zona = h('div', { class: 'due-colonne fatturazione-commessa' }, B.segnaposto(1, 120));
      Rete.get('/server/fatturazioneCommessa?id=' + encodeURIComponent(m.id)).then(x => {
        svuota(zona);
        const RF = radice.WisperRegoleFatture;
        const base = C.num(x.contratto) || (C.num(x.fatturato) + C.num(x.inBozza) + C.num(x.daFatturare) + C.num(x.previsto));
        const pezzo = (v, classe) => base > 0 && C.num(v) > 0 ? h('i', { class: classe, style: { width: Math.min(100, C.num(v) / base * 100) + '%' } }) : null;
        const voce = (colore, testo, v) => h('span', null, h('i', { class: colore }), testo + ' ' + C.euro(v));
        aggiungi(zona, [h('div', { class: 'scheda' },
          h('div', { class: 'testa-fatt-commessa' }, h('span', { class: 'etichetta' }, 'Fatturazione'),
            h('b', null, C.num(x.contratto) ? C.euro(x.contratto) + ' di contratto' : x.modoFatturazione === 'corpo' ? 'senza importo del contratto' : 'a ore')),
          h('div', { class: 'barra barra-fatt' }, pezzo(x.fatturato, 'fatt'), pezzo(x.inBozza, 'bozza-f'), pezzo(x.daFatturare, 'pronto-f'), pezzo(x.previsto, 'previsto-f')),
          h('div', { class: 'legenda' }, voce('fatt', 'Fatturato', x.fatturato), voce('bozza-f', 'In bozza', x.inBozza), voce('pronto-f', 'Da fatturare', x.daFatturare), voce('previsto-f', 'Previsto', x.previsto)),
          h('div', { class: 'secondario' }, 'Incassato ' + C.euro(x.incassato) + ' · importi del compenso, senza contributo e IVA'),
          C.num(x.daFatturare) > 0 ? h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start', marginTop: '6px' }, onclick: () => { S.schedaCommessa[m.id] = 'dafatturare'; W.disegnaPagina(); } }, 'Vai a Da fatturare') : null),
        h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Scadenze di pagamento'),
          (x.scadenze || []).length ? h('div', { class: 'scheda righe' }, x.scadenze.map(sc => {
            const parola = RF.parolaScadenzaPagamento(sc);
            const quando = sc.quando === 'data' ? (sc.data ? 'il ' + C.data(sc.data) : 'a una data') : ({ firma: 'alla firma', avanzamento: 'ad avanzamento', fine: 'a fine lavori' }[sc.quando] || '');
            return riga({ titolo: sc.descrizione, sotto: quando + ' · ' + C.euro(sc.importo),
              destra: pillola(parola, sc.stato === 'prevista' ? 'grigio' : RF.coloreStato(parola)),
              onclick: sc.idFattura ? () => (sc.stato === 'in_bozza' && /^W-/.test(sc.fattura || '') ? W.vai('#fatturazione/bozza/' + sc.idFattura) : W.Fatture.apriPannello(sc.idFattura)) : null });
          })) : h('div', { class: 'calmo' }, icona('fatturazione', 20, 2.2), x.modoFatturazione === 'corpo' ? 'Nessuna scadenza nel contratto.' : 'Si fattura a ore: rapportini, ore e spese.'))]);
      }).catch(e => { if (e && e.accesso === false) return; aggiungi(svuota(zona), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)))]); });
      return zona;
    }

    function costiCommessa(area, m, k, cc) {
      const conSpese = k.rapportini.filter(r => C.num(r.spese) > 0 || (r.foto || []).length);
      const noto = cc ? cc.lavoroNoto !== false : k.costo.lavoroNoto;
      const rc = (a, b) => h('div', { class: 'rc' }, h('span', null, a), h('span', null, b));
      // Il costo orario della riga è quello del conto (congelato in ogni rapportino), non quello di oggi in Amministrazione.
      const lavoro = cc ? cc.lavoro : k.costo.lavoro;
      const orario = R.costoOrarioDelConto(k.ore, lavoro);
      aggiungi(area, [h('div', { class: 'scheda' },
        h('h2', null, 'Il costo · ' + (noto ? C.euro(cc ? cc.totale : k.costo.totale) : 'incompleto')),
        h('div', { class: 'conto', style: { borderTop: 'none' } },
          rc('Il lavoro dei rapportini · ' + C.numero(k.ore) + ' ore' + (!noto ? ' · costo orario da mettere in Amministrazione' : orario !== null ? ' × ' + C.euro(orario) : ''), noto ? C.euro(lavoro) : '—'),
          // Fase 3: le ore registrate senza rapportino, al costo orario congelato nella riga.
          cc && C.num(cc.oreRegistrate) ? rc('Le ore registrate · ' + C.numero(cc.oreRegistrate) + ' ore', C.euro(cc.costoOreRegistrate)) : null,
          rc('Auto · ' + C.numero(k.totali.km) + ' km al costo ACI', C.euro(cc ? cc.auto : k.costo.auto)),
          rc('Spese dei rapportini · ' + W.nRapportini(conSpese.length), C.euro(cc ? cc.speseRapportini : k.costo.spese)),
          cc && C.num(cc.speseFuoriRapportini) ? rc('Le altre spese, al cliente e allo studio', C.euro(cc.speseFuoriRapportini)) : null,
          cc && C.num(cc.trasferte) ? rc('Trasferte · ' + C.numero(cc.kmTrasferte) + ' km e indennità', C.euro(cc.trasferte)) : null,
          // Fase 6 (§17.15): i collaboratori esterni (le loro fatture, col previsto dell'incarico) e le altre fatture ricevute della commessa.
          cc && (C.num(cc.collaboratori) || C.num(cc.collaboratoriPrevisto)) ? rc('Collaboratori esterni · previsto ' + C.euro(cc.collaboratoriPrevisto || 0), C.euro(cc.collaboratori || 0)) : null,
          cc && C.num(cc.altreRicevute) ? rc('Altre fatture ricevute', C.euro(cc.altreRicevute)) : null))]);
      if (conSpese.length) {
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: '70px 130px minmax(0,1fr) 240px 110px' } },
          h('span', null, 'Data'), h('span', null, 'N°'), h('span', null, 'Di cosa'), h('span', null, 'Scontrini'), h('span', { class: 'n' }, 'Importo')));
        conSpese.forEach(r => aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: '70px 130px minmax(0,1fr) 240px 110px', minHeight: '72px' }, onclick: () => W.apriPannello(r.id) },
          h('span', { class: 'forte' }, W.dataBreve(r.data)), h('span', { class: 't2' }, r.id), h('span', { class: 'taglia' }, r.noteSpese || '—'),
          h('span', { class: 'miniature' }, (r.foto || []).slice(0, 3).map(f => h('a', { href: '#', title: 'Apri lo scontrino', style: { width: '52px', height: '52px' }, onclick: e => { e.preventDefault(); e.stopPropagation(); W.apriFile(f); } }, h('img', { src: '/file/' + f.id, alt: '' })))),
          h('span', { class: 'n forte' }, C.euro(r.spese)))]));
        aggiungi(area, [tab]);
      }
    }

    function daFatturare(area, k) {
      const da = k.rapportini.filter(r => r.stato === 'FIRMATO' || r.stato === 'INVIATO');
      const inBozza = k.rapportini.filter(r => r.stato === 'BOZZA');
      aggiungi(area, [h('div', { class: 'tre-colonne' },
        W.riquadro('Pronto da fatturare', C.euro(k.prontoDaFatturare), da.length ? W.nRapportini(da.length) + ' firmati o inviati' : 'niente'),
        W.riquadro('Da far firmare', C.euro(k.inBozza), inBozza.length ? W.nRapportini(inBozza.length) : 'nessuno'),
        W.riquadro('Già fatturato', C.euro(k.fatturato), null))]);
      if (da.length) {
        if (puo('fatturazione', 2)) {
          aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
            h('button', { type: 'button', class: 'btn', onclick: () => W.cambiaStato(da, 'FATTURATO') }, 'Segna fatturati'),
            h('button', { type: 'button', class: 'btn', onclick: () => W.preparaInvio(da) }, 'Prepara riepilogo'))]);
        }
        aggiungi(area, [W.tabellaRapportini(C.ordina(da, 'data', 1))]);
      } else {
        aggiungi(area, [h('p', { class: 'vuoto' }, 'Niente da fatturare.')]);
      }
    }

    async function documentiCommessa(area, m) {
      const lista = h('div', null, B.segnaposto(2, 58));
      let cartella = m.cartella;
      const apri = d => {
        // I documenti del server si aprono col programma (li scarica e li passa a Windows); quelli di Drive nel browser.
        if (/^\/file\//.test(d.url || '') || (!d.url && d.id)) Rete.post('/locale/apri-documento', { id: d.id || String(d.url).replace(/^\/file\//, ''), nome: d.nome }).catch(e => avviso(e.message, true));
        else if (d.url) window.open(d.url, '_blank');
      };
      const leggi = async () => {
        const ris = await Rete.get('/server/documenti?idCommessa=' + encodeURIComponent(m.id)).catch(e => { avviso(e.message, true); return null; });
        svuota(lista);
        if (!ris) return;
        cartella = ris.cartella || cartella;
        if (!(ris.documenti || []).length) { aggiungi(lista, [h('p', { class: 'vuoto' }, 'Nessun documento.')]); return; }
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: 'minmax(0,1fr) 200px' } }, h('span', null, 'Documento'), h('span', null, 'Ultima modifica')));
        ris.documenti.forEach(d => aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: 'minmax(0,1fr) 200px' }, onclick: () => apri(d) },
          h('span', { class: 'forte taglia' }, d.nome), h('span', { class: 't2' }, C.dataOra(d.data)))]));
        aggiungi(lista, [tab]);
      };
      aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
        cartella && /^https?:/.test(cartella) ? h('button', { type: 'button', class: 'btn', onclick: () => window.open(cartella, '_blank') }, 'Apri la cartella su Drive') : null,
        puoDocumenti(2) ? h('button', { type: 'button', class: 'btn', onclick: async () => {
          const scelto = await Rete.post('/locale/scegli-file', { filtro: 'tutti' }).catch(() => null);
          if (!scelto || !scelto.ok) return;
          const fatto = await lavora('Carico ' + scelto.nome, () => Rete.post('/server/caricaFile', {
            tipo: 'documento', idCommessa: m.id, nome: scelto.nome, mime: scelto.mime, base64: scelto.base64,
          }));
          if (fatto) { avviso('Caricato ' + scelto.nome); leggi(); }
        } }, icona('piu', 18, 2.6), 'Carica un documento') : null),
      lista]);
      leggi();
    }

    /** I documenti hanno il loro permesso ("documenti"); con un server che non lo dice valgono le commesse. */
    function puoDocumenti(livello) {
      return W.perm().documenti === undefined ? puo('commesse', livello) : puo('documenti', livello);
    }

    // ===================================================================== modulo

    function modulo(esistente) {
      const m = esistente || {};
      const anno = new Date().getFullYear();
      const modelli = esistente ? [] : S.ana.commesse.filter(x => x.modello && !x.archiviata);
      let daModello = null;
      const clienti = W.clientiAttivi().concat(esistente && W.cliente(m.idCliente) && W.cliente(m.idCliente).archiviato ? [W.cliente(m.idCliente)] : [])
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      const utenti = S.ana.utenti.filter(u => u.attivo !== false);
      let persone = (m.persone || []).map(String);
      // Fase 4 (§15.2): come si fattura. A corpo = solo le scadenze del contratto; a ore = rapportini, ore e spese; misto = tutto.
      let modo = m.modoFatturazione || 'ore';
      const zonaModo = h('div');
      const disegnaModo = () => aggiungi(svuota(zonaModo), [segmenti([['ore', 'A ore'], ['corpo', 'A corpo'], ['misto', 'Misto']], modo, x => { modo = x; disegnaModo(); }, 'piccoli')]);
      disegnaModo();
      const v = {
        cliente: h('select', null, [h('option', { value: '' }, 'Scegli il cliente')].concat(clienti.map(c => h('option', { value: c.id, selected: c.id === (m.idCliente || S.filtriCommesse.cliente) }, c.nome)))),
        descrizione: h('input', { type: 'text', value: m.descrizione || '' }),
        codice: h('input', { type: 'text', value: esistente ? m.id : '', disabled: !!esistente }),
        sede: h('select'),
        indirizzo: h('input', { type: 'text', value: m.indirizzo || '' }),
        responsabile: h('select', null, [h('option', { value: '' }, 'Da scegliere')].concat(utenti.map(u => h('option', { value: String(u.id), selected: String(u.id) === String(m.responsabileId) }, u.nome)))),
        inizio: h('input', { type: 'date', value: m.inizio || (esistente ? '' : C.oggiIso()) }),
        fine: h('input', { type: 'date', value: m.finePrevista || '' }),
        budgetOre: h('input', { type: 'text', inputmode: 'decimal', value: m.budgetOre ? R.numeroCampo(m.budgetOre) : '' }),
        prezzoOrario: h('input', { type: 'text', inputmode: 'decimal', value: m.prezzoOrario ? R.numeroCampo(m.prezzoOrario) : '' }),
        budgetEuro: h('input', { type: 'text', inputmode: 'decimal', value: m.budgetEuro ? R.numeroCampo(m.budgetEuro) : '' }),
        costoOrario: h('input', { type: 'text', inputmode: 'decimal', value: m.costoOrario ? R.numeroCampo(m.costoOrario) : '' }),
        importo: h('input', { type: 'text', inputmode: 'decimal', value: m.importoContratto ? R.numeroCampo(m.importoContratto) : '' }),
        // Vuoto = quello delle impostazioni, che si vede in grigio.
        euroKm: h('input', { type: 'text', inputmode: 'decimal', value: m.euroKm !== null && m.euroKm !== undefined ? R.numeroCampo(m.euroKm) : '', placeholder: C.numero(C.num(S.ana.impostazioni.EURO_KM)) }),
        note: h('textarea', { rows: 3 }),
      };
      v.note.value = m.note || '';
      // Il codice si vede subito (Amministrazione › Numerazioni). Si può cambiare prima di salvare.
      const prossimo = esistente ? m.id : prossimoCodice(anno);
      if (!esistente) v.codice.value = prossimo;

      // La sede o l'impianto: quelli del cliente scelto.
      const disegnaSedi = scelta => {
        const sedi = S.ana.sedi.filter(s => s.idSoggetto === v.cliente.value && (!s.archiviata || String(s.id) === String(scelta)));
        svuota(v.sede);
        aggiungi(v.sede, [h('option', { value: '' }, sedi.length ? 'Nessuna' : 'Il cliente non ha sedi')].concat(sedi.map(s =>
          h('option', { value: s.id, selected: String(s.id) === String(scelta) }, s.nome + (s.tipo === 'impianto' ? ' (impianto)' : '')))));
      };
      disegnaSedi(m.sedeId);

      const zonaPersone = h('div', { class: 'pillole' });
      const disegnaPersone = () => aggiungi(svuota(zonaPersone), utenti.map(u => h('button', {
        type: 'button', class: 'pillola' + (persone.indexOf(String(u.id)) >= 0 ? ' scelta' : ''), 'aria-pressed': persone.indexOf(String(u.id)) >= 0 ? 'true' : 'false',
        onclick: () => { const i = persone.indexOf(String(u.id)); if (i >= 0) persone.splice(i, 1); else persone.push(String(u.id)); disegnaPersone(); },
      }, u.nome)));
      disegnaPersone();

      // Il budget come lo scrive lo studio: ore previste × prezzo orario = budget; il costo
      // orario dà il margine. Ne bastano due fra ore, prezzo e budget: il terzo si calcola.
      // Un cliente a tariffa fissa (Elettrodinamica) ha già prezzo e, se scritto, costo:
      // qui si vedono ma non si cambiano.
      const sottoBudget = h('div', { class: 'secondario' });
      const clienteSel = () => W.cliente(v.cliente.value) || null;
      const fisso = (c, k) => c && c[k] !== null && c[k] !== undefined && c[k] !== '';
      const aggiornaFissi = () => {
        const c = clienteSel();
        v.prezzoOrario.disabled = fisso(c, 'tariffaFissa');
        if (v.prezzoOrario.disabled) v.prezzoOrario.value = R.numeroCampo(c.tariffaFissa);
        v.costoOrario.disabled = fisso(c, 'costoFisso');
        if (v.costoOrario.disabled) v.costoOrario.value = R.numeroCampo(c.costoFisso);
        const costoImp = C.numONull(S.ana.impostazioni.COSTO_ORARIO);
        v.costoOrario.placeholder = costoImp !== null ? C.numero(costoImp) : '';
      };
      const ricalcola = cambiato => {
        const ore = C.numONull(v.budgetOre.value);
        const prezzo = C.numONull(v.prezzoOrario.value);
        const euro = C.numONull(v.budgetEuro.value);
        if ((cambiato === 'ore' || cambiato === 'prezzo') && ore && prezzo) v.budgetEuro.value = R.numeroCampo(Math.round(ore * prezzo * 100) / 100);
        if (cambiato === 'euro' && euro && prezzo) v.budgetOre.value = R.numeroCampo(Math.round(euro / prezzo * 10) / 10);
        if (cambiato === 'prezzo' && !ore && euro && prezzo) v.budgetOre.value = R.numeroCampo(Math.round(euro / prezzo * 10) / 10);
        const b = C.budgetDi({ budgetOre: C.numONull(v.budgetOre.value), budgetEuro: C.numONull(v.budgetEuro.value),
          prezzoOrario: C.numONull(v.prezzoOrario.value), costoOrario: C.numONull(v.costoOrario.value) }, clienteSel(), S.ana.impostazioni);
        const pezzi = [];
        if (b.margineOrario !== null) pezzi.push('Margine ' + C.numero(b.margineOrario) + ' €/h');
        if (b.costoPrevisto !== null) pezzi.push('costo previsto ' + C.euro(b.costoPrevisto));
        if (b.margine !== null) pezzi.push('margine previsto ' + C.euro(b.margine));
        sottoBudget.textContent = pezzi.join(' · ');
        sottoBudget.classList.toggle('errore', b.margineOrario !== null && b.margineOrario < 0);
      };
      v.budgetOre.addEventListener('input', () => ricalcola('ore'));
      v.prezzoOrario.addEventListener('input', () => ricalcola('prezzo'));
      v.budgetEuro.addEventListener('input', () => ricalcola('euro'));
      v.costoOrario.addEventListener('input', () => ricalcola('costo'));
      v.cliente.addEventListener('change', () => { aggiornaFissi(); ricalcola('prezzo'); disegnaSedi(''); });
      aggiornaFissi();
      ricalcola('');

      // Da un modello: si copiano nome, budget e (al salvataggio) le prestazioni.
      const zonaModelli = modelli.length ? h('div', { class: 'da-modello' }) : null;
      const disegnaModelli = () => {
        if (!zonaModelli) return;
        aggiungi(svuota(zonaModelli), [h('div', { class: 'etichetta' }, 'Da un modello'),
          h('div', { class: 'pillole' }, modelli.map(x => h('button', { type: 'button', class: 'pillola' + (daModello === x.id ? ' scelta' : ''), 'aria-pressed': daModello === x.id ? 'true' : 'false', onclick: () => {
            daModello = daModello === x.id ? null : x.id;
            if (daModello) {
              if (!v.descrizione.value.trim()) v.descrizione.value = x.descrizione;
              if (x.budgetOre) v.budgetOre.value = R.numeroCampo(x.budgetOre);
              if (x.prezzoOrario && !v.prezzoOrario.disabled) v.prezzoOrario.value = R.numeroCampo(x.prezzoOrario);
              if (x.budgetEuro) v.budgetEuro.value = R.numeroCampo(x.budgetEuro);
              if (x.importoContratto) v.importo.value = R.numeroCampo(x.importoContratto);
              if (x.note && !v.note.value) v.note.value = x.note;
              ricalcola('ore');
            }
            disegnaModelli();
          } }, x.descrizione)))]);
      };
      disegnaModelli();

      let chiudi;
      const salva = async () => {
        if (!v.cliente.value) { v.cliente.focus(); avviso('Scegli il cliente', true); return; }
        if (!v.descrizione.value.trim()) { v.descrizione.focus(); avviso('Scrivi come si chiama la commessa', true); return; }
        const campi = {
          idCliente: v.cliente.value, descrizione: v.descrizione.value.trim(), indirizzo: v.indirizzo.value.trim(),
          sedeId: v.sede.value ? Number(v.sede.value) : null, responsabileId: v.responsabile.value ? Number(v.responsabile.value) : null,
          persone: persone.map(Number),
          inizio: v.inizio.value, finePrevista: v.fine.value, budgetOre: C.numONull(v.budgetOre.value), note: v.note.value.trim(),
        };
        if (soldi()) {
          campi.budgetEuro = C.numONull(v.budgetEuro.value);
          campi.euroKm = C.numONull(v.euroKm.value);
          campi.importoContratto = C.numONull(v.importo.value);
          if (W.puo('fatturazione')) campi.modoFatturazione = modo;
          // Prezzo e costo fissi del cliente restano sulla sua scheda, non si copiano sulla commessa.
          if (!v.prezzoOrario.disabled) campi.prezzoOrario = C.numONull(v.prezzoOrario.value);
          if (!v.costoOrario.disabled) campi.costoOrario = C.numONull(v.costoOrario.value);
        }
        const codice = v.codice.value.trim().toUpperCase() === prossimo ? '' : v.codice.value.trim().toUpperCase();
        const ris = await lavora('Salvo la commessa', async () => {
          if (esistente) return Rete.post('/server/aggiornaCommessa', { id: m.id, campi });
          if (daModello) {
            // La copia del modello porta con sé le prestazioni; poi si scrivono i dati del modulo.
            const copia = await Rete.post('/server/duplicaCommessa', { id: daModello, comeModello: false, idCliente: campi.idCliente });
            return Rete.post('/server/aggiornaCommessa', { id: copia.commessa.id, campi });
          }
          return Rete.post('/server/creaCommessa', Object.assign({ id: codice }, campi));
        });
        if (!ris) return;
        await W.ricaricaAnagrafiche().catch(() => null);
        W.caricaDashboard();
        chiudi();
        if (!esistente && ris.commessa.giaEsisteva) avviso('C\'era già: ' + ris.commessa.id, true);
        else avviso((esistente ? 'Salvata ' : 'Creata ') + ris.commessa.id);
        W.vai('#commesse/' + encodeURIComponent(ris.commessa.id));
      };
      chiudi = finestra({
        titolo: esistente ? 'Modifica ' + m.id : 'Nuova commessa',
        corpo: [
          zonaModelli,
          h('div', { class: 'riga-campi' }, campo('Cliente', v.cliente), campo('Codice', v.codice)),
          campo('Come si chiama', v.descrizione),
          h('div', { class: 'riga-campi' }, campo('Sede o impianto', v.sede), campo('Indirizzo del cantiere', v.indirizzo)),
          h('div', { class: 'riga-campi' }, campo('Responsabile', v.responsabile), campo('Inizio', v.inizio), campo('Fine prevista', v.fine)),
          h('div', { class: 'campo' }, h('label', null, 'Persone'), zonaPersone),
          h('div', { class: 'etichetta' }, 'Budget'),
          soldi()
            ? [h('div', { class: 'riga-campi' }, campo('Ore previste', v.budgetOre), campo('Prezzo orario (€/h)', v.prezzoOrario), campo('Budget (€)', v.budgetEuro)),
              h('div', { class: 'riga-campi' }, campo('Costo orario (€/h)', v.costoOrario), campo('Importo del contratto (€)', v.importo), campo('Rimborso km (€/km)', v.euroKm)),
              sottoBudget, W.puo('fatturazione') ? h('div', { class: 'campo' }, h('label', null, 'Come si fattura'), zonaModo) : null]
            : h('div', { class: 'riga-campi' }, campo('Ore previste', v.budgetOre), h('span')),
          campo('Note', v.note)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')],
      });
    }

    /** Il prossimo codice: come lo dà il server (Numerazioni), altrimenti 26ST + il numero dopo l'ultimo. */
    function prossimoCodice(anno) {
      const n = S.ana.numerazioni.find(x => x.tipo === 'commessa');
      if (n && n.formato) {
        const usati = S.ana.commesse.map(x => { const y = String(x.id).match(/(\d+)$/); return y ? Number(y[1]) : 0; });
        return R.formattaNumero(n.formato, Math.max(Number(n.ultimo) || 0, ...usati, 0) + 1, anno);
      }
      return C.prossimoCodiceCommessa(S.ana.commesse.map(x => x.id), anno);
    }

    return { vista, pagina, modulo };
  };
})(window);
