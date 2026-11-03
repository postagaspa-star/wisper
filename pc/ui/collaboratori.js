/*
 * Wisper Ufficio, fase 6: Collaboratori esterni (docs/gestionale/fase6.md §12.6 e §12.7, risposte in architettura.md
 * §17.14-17.16).
 *
 * Un collaboratore è un fornitore con la scheda in più: tipo, mestiere, documenti e scadenze con l'idoneità,
 * incarichi per commessa (pattuito, maturato, fatturato, pagato: il fatturato e il pagato sono le fatture ricevute
 * della fase 4), valutazioni, accesso a Wisper col ruolo "esterno".
 *
 * L'esterno (ruolo esterno) vede solo "La tua scheda": i suoi documenti, i suoi incarichi, i suoi compensi; mai gli
 * altri collaboratori, le note e le valutazioni dello studio (il server non le manda).
 */
(function (radice) {
  'use strict';

  radice.WisperCollaboratori = function (W) {
    const { S, C, R, B, Rete } = W;
    const P = radice.WisperRegolePersone;
    const { h, aggiungi, svuota, icona, iniziali, pillola, avviso, lavora, finestra, conferma, campo, conSuffisso, selezione, segmenti, riga, quadrato, segnaposto } = B;
    const F = () => W.F6;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('collaboratori', 2);
    const esterno = () => W.eEsterno();
    const mioSoggetto = () => (S.io && S.io.interfaccia && S.io.interfaccia.esterno && S.io.interfaccia.esterno.idSoggetto) || '';
    const oggi = () => C.oggiIso();
    const dataIt = iso => (iso ? C.data(iso) : '');
    const pill = (parola, colore) => pillola(parola, colore || P.colore(parola));

    const M = { segmento: '', lista: null, incarichi: null, compensi: null, anno: '', documenti: null, aperto: null, scheda: null, incarico: null, mia: null, filtroI: 'aperti' };
    function daRileggere() { Object.assign(M, { lista: null, incarichi: null, compensi: null, documenti: null, aperto: null, scheda: null, incarico: null, mia: null }); }

    function segmentiColl() {
      return [['elenco', 'Collaboratori'], ['incarichi', 'Incarichi']].concat(soldi() ? [['compensi', 'Compensi']] : []).concat([['documenti', 'Documenti']]);
    }

    function vista(pagina, a1, a2, filtro) {
      if (esterno()) { laTuaScheda(pagina, a1 === 'in' ? a2 : null); return; }
      const voci = segmentiColl();
      let seg = a1 && a1 !== 'c' && a1 !== 'in' ? a1 : '';
      if (filtro && filtro.segmento) seg = filtro.segmento;
      if (a1 === 'c') seg = 'elenco';
      if (a1 === 'in') seg = 'incarichi';
      if (!seg) seg = M.segmento && voci.some(v => v[0] === M.segmento) ? M.segmento : 'elenco';
      if (!voci.some(v => v[0] === seg)) seg = 'elenco';
      M.segmento = seg;
      ({ elenco, incarichi, compensi, documenti })[seg](pagina, voci);
      if (a1 === 'c' && a2) apriCollaboratore(a2);
      if (a1 === 'in' && a2) apriIncarico(a2);
    }

    function barra(voci, seg) {
      return h('div', null, segmenti(voci, seg, x => { M.segmento = x; F().chiudiPannello(true); W.vai(x === 'elenco' ? '#collaboratori/elenco' : '#collaboratori/' + x); }));
    }

    async function leggiLista() { if (!M.lista) M.lista = await Rete.get('/server/collaboratori?stato=tutti'); }
    async function leggiIncarichi() { if (!M.incarichi) M.incarichi = await Rete.get('/server/incarichi?stato=tutti'); }

    // ===================================================================== elenco

    function elenco(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Collaboratori esterni', 'Collaboratori esterni', scrive() ? F6.gialloPagina('Nuovo collaboratore', () => nuovoCollaboratore(), 'piu') : null), barra(voci, 'elenco')]);
      F6.conDati(pagina, leggiLista, () => {
        const lista = M.lista.collaboratori || [];
        const conSoldi = lista.some(c => Object.prototype.hasOwnProperty.call(c, 'daFatturare'));
        const col = 'minmax(0, 1.5fr) 130px minmax(0, 1.2fr) 170px 100px ' + (conSoldi ? '130px ' : '') + '170px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Nome'), h('span', null, 'Tipo'), h('span', null, 'Mestiere'), h('span', null, 'Idoneità'),
          h('span', { class: 'n' }, 'In corso'), conSoldi ? h('span', { class: 'n' }, 'Da fatturare') : null, h('span', null, 'Valutazioni')));
        lista.forEach(c => {
          const v = c.valutazioni || {};
          const val = [v.bene ? v.bene + ' bene' : '', v.problemi ? v.problemi + ' con problemi' : '', v.male ? v.male + ' male' : ''].filter(Boolean).join(' · ');
          aggiungi(tab, [h('div', { class: 'r cliccabile' + (String(M.aperto) === String(c.idSoggetto) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-coll': c.idSoggetto,
            onclick: () => apriCollaboratore(c.idSoggetto), onkeydown: e => { if (e.key === 'Enter') apriCollaboratore(c.idSoggetto); } },
          h('span', { class: 'con-cerchio' }, iniziali(c.nome, true), h('span', { class: 'doppia' }, h('span', null, c.nome), c.attivo === false ? h('span', null, 'non più attivo') : null)),
          h('span', null, c.tipoNome || P.nomeDi(P.TIPI_COLLABORATORE, c.tipo)),
          h('span', { class: 't2 taglia' }, c.mestiere || '—'),
          h('span', null, c.idoneita ? pill(c.idoneita.parola, P.coloreIdoneita(c.idoneita.stato)) : null),
          h('span', { class: 'n' }, String(c.incarichiInCorso || 0)),
          conSoldi ? h('span', { class: 'n' }, c.daFatturare ? C.euro(c.daFatturare) : '—') : null,
          h('span', { class: 't2' }, val || '—'))]);
        });
        aggiungi(pagina, [lista.length ? tab : h('p', { class: 'vuoto' }, 'Ancora nessun collaboratore esterno.')]);
      });
    }

    // ===================================================================== la scheda

    async function apriCollaboratore(id) {
      M.aperto = id;
      document.querySelectorAll('.tab .r[data-coll]').forEach(x => x.classList.toggle('scelta', String(x.dataset.coll) === String(id)));
      F().pannello({ dove: 'Collaboratore', corpo: segnaposto(4, 64) });
      try {
        const r = await Rete.get('/server/collaboratore?id=' + encodeURIComponent(id));
        if (String(M.aperto) !== String(id)) return;
        M.scheda = r.collaboratore;
        const c = corpoCollaboratore(M.scheda, false);
        F().pannello({ dove: 'Collaboratore', titolo: M.scheda.nome, corpo: c.corpo, menu: c.menu, giallo: c.giallo });
      } catch (e) {
        if (e && e.accesso === false) return;
        F().pannello({ dove: 'Collaboratore', corpo: h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e))) });
      }
    }

    /** Il contenuto della scheda (pannello per lo studio, pagina per l'esterno). Le sezioni ci sono solo coi dati del server. */
    function corpoCollaboratore(c, suaPagina) {
      const F6 = F();
      const lui = esterno();
      const id = c.idoneita || {};
      const out = [h('div', { class: 'pillole-testa' }, pill(c.tipoNome || P.nomeDi(P.TIPI_COLLABORATORE, c.tipo), 'grigio'), id.parola ? pill(id.parola, P.coloreIdoneita(id.stato)) : null, c.attivo === false ? pill('Non più attivo', 'grigio') : null),
        suaPagina ? null : h('h2', { class: 'titolo-scheda' }, c.nome), h('span', { class: 'sotto-titolo' }, [c.mestiere, c.abilitazioni].filter(Boolean).join(' · '))];
      if (id.frase && id.stato !== 'in_regola') out.push(h('div', { class: id.stato === 'scaduti' ? 'banda' : 'mancano-f6' }, icona('avviso', 16, 2.4), h('span', null, id.frase)));

      // Idoneità: i documenti che servono, con lo stato; quelli che mancano in ambra.
      const docs = c.documenti || [];
      const servono = id.servono || [];
      const mancano = servono.filter(t => !docs.some(d => d.tipoScadenza === t));
      const righeIdo = docs.map(d => riga({ sinistra: quadrato('file', d.statoVisto === 'Scaduta' ? 'ico-rosso' : /^Scade/.test(d.statoVisto) ? 'ico-giallo' : 'ico-grigio'),
        titolo: d.titolo || d.tipoNome, sotto: [d.tipoNome && d.tipoNome !== d.titolo ? d.tipoNome : '', d.data ? 'del ' + dataIt(d.data) : '', d.scade ? 'fino al ' + dataIt(d.scade) : ''].filter(Boolean).join(' · '),
        destra: d.statoVisto ? pill(d.statoVisto === 'Prossima' ? 'Valido' : d.statoVisto, d.statoVisto === 'Prossima' ? 'verde' : P.colore(d.statoVisto)) : null,
        onclick: d.url ? () => W.Archivio.apriFile(d.url, d.titolo) : null }))
        .concat(mancano.map(t => riga({ sinistra: quadrato('file', 'ico-giallo'), titolo: P.nomeDi(P.DOCUMENTI_COLLABORATORE, t) || t, sotto: 'Manca', destra: pill('Manca', 'ambra') })))
        .concat(c.tipo === 'impresa' ? [h('div', { class: 'riga riga-non-collegata' }, h('span', { class: 'corpo' }, h('b', null, 'Scarica il DURC dal portale DURC On Line')), F6.nonCollegato())] : [])
        .concat(c.tipo === 'occasionale' ? [riga({ sinistra: quadrato('spunta', 'ico-verde'), titolo: 'Niente documenti da chiedere', sotto: 'Prestazione occasionale' })] : []);
      out.push(F6.sez('Idoneità', F6.righe(righeIdo, 'Nessun documento.'), (c.puoCaricareDocumenti || (scrive() && !lui)) && !suaPagina ? F6.piccolo('Aggiungi un documento', () => aggiungiDocumento(c), 'piu') : null));

      // Incarichi.
      const el = (c.elencoIncarichi || []).filter(i => !lui || i.stato !== 'bozza');
      out.push(F6.sez('Incarichi', F6.righe(el.map(i => rigaIncarico(i)), 'Nessun incarico.')));

      // Compensi (coi soldi; all'esterno i suoi).
      if (c.compensi) {
        const k = c.compensi;
        out.push(F6.sez(lui ? 'I tuoi compensi' : 'Compensi', h('div', { class: 'scheda fila-f6' }, [['Pattuito', k.pattuito], ['Maturato', k.maturato], ['Fatturato', k.fatturato], ['Da fatturare', k.daFatturare], ['Da pagare', k.daPagare]]
          .map(x => h('div', { class: 'rc-f6' + (x[0] === 'Da fatturare' ? ' tot' : '') }, h('span', null, x[0]), h('b', null, C.euro(x[1] || 0)))))));
      }

      // Valutazioni (dello studio: all'esterno il server non le manda).
      if (c.valutazioni && !lui) {
        const v = c.valutazioni;
        const tot = (v.bene || 0) + (v.problemi || 0) + (v.male || 0);
        const note = el.filter(i => i.valutazioneNota).map(i => h('span', { class: 'sotto-titolo' }, i.numero + ': ' + i.valutazioneNota));
        out.push(F6.sez('Valutazioni', h('div', { class: 'scheda fila-f6' }, tot ? h('div', { class: 'pillole-testa' }, P.VALUTAZIONI.filter(x => v[x[0]]).map(x => pill(v[x[0]] + ' ' + x[1].toLowerCase(), P.coloreValutazione(x[0]))))
          : h('span', { class: 'sotto-titolo' }, 'Ancora nessuna valutazione.'), note)));
      }

      // Accesso a Wisper (le persone del collaboratore con l'accesso esterno).
      if (c.accessi && !lui) {
        out.push(F6.sez('Accesso a Wisper', F6.righe((c.accessi || []).map(a => riga({ sinistra: iniziali(a.nome, true), titolo: a.nome, sotto: ['Esterno', a.email, a.ultimoAccesso ? 'ultimo accesso ' + R.quando(a.ultimoAccesso) : 'mai entrato', a.attivo === false ? 'spento' : ''].filter(Boolean).join(' · ') })), 'Nessuno di loro entra in Wisper.'),
          puo('amministrazione', 2) ? F6.piccolo('Dai l\'accesso a Wisper', () => invitaEsterno(c), 'esci') : null));
      }

      // Contatti (dal fornitore).
      out.push(F6.sez('Contatti', F6.coppie([['Telefono', F6.se(c, 'telefono')], ['Email', F6.se(c, 'email')], ['PEC', c.pec ? c.pec : null], ['Partita IVA', F6.se(c, 'partitaIva')],
        ['Indirizzo', c.indirizzo || c.citta ? R.indirizzoCompleto(c) : null], ['Chi lo segue nello studio', F6.se(c, 'referente')],
        ['Tariffa proposta', Object.prototype.hasOwnProperty.call(c, 'tariffa') && c.tariffa !== null && c.tariffa !== undefined ? C.euro(c.tariffa) + ' l\'ora' : null], ['Note', !lui && c.note ? c.note : null]])));

      const giallo = lui ? F6.gialloPannello('Carica un documento', () => aggiungiDocumento(c))
        : c.puoAffidare !== false && scrive() && soldi() ? F6.gialloPannello('Nuovo incarico', () => nuovoIncarico({ idSoggetto: c.idSoggetto, nome: c.nome, tariffa: c.tariffa, tipo: c.tipo })) : null;
      const menu = scrive() && !lui ? [{ testo: 'Cambia', fn: () => moduloCollaboratore(c) },
        puo('clienti') ? { testo: 'Apri il fornitore', fn: () => W.vai('#clienti/' + encodeURIComponent(c.idSoggetto)) } : null,
        c.attivo === false ? { testo: 'Di nuovo attivo', fn: () => attiva(c, true) } : { testo: 'Non più attivo', fn: () => attiva(c, false) }] : null;
      return { corpo: out, menu, giallo };
    }

    function rigaIncarico(i) {
      return riga({ sinistra: h('span', { class: 'codice' }, i.idCommessa), titolo: i.numero + ' · ' + i.titolo, sotto: [i.commessa, i.modo === 'corpo' ? 'a corpo' : 'a ore', i.al ? 'fino al ' + dataIt(i.al) : ''].filter(Boolean).join(' · '),
        destra: h('span', { class: 'pillole-destra' }, i.modo === 'corpo' && i.stato === 'affidato' ? h('span', { class: 'barra-incarico' }, h('span', { class: 'barra sottile' }, h('i', { style: { width: Math.max(0, Math.min(100, Number(i.avanzamento) || 0)) + '%' } })), h('b', null, (Number(i.avanzamento) || 0) + '%')) : null,
          pill(i.statoVisto || P.STATI_INCARICO[i.stato], P.coloreIncarico(i.stato)), i.valutazione ? pill(i.valutazioneVista || P.nomeDi(P.VALUTAZIONI, i.valutazione), P.coloreValutazione(i.valutazione)) : null),
        onclick: () => apriIncarico(i.id) });
    }

    // ===================================================================== la tua scheda (l'esterno)

    function laTuaScheda(pagina, apriInc) {
      const zonaGiallo = h('span');
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Collaboratori esterni'), h('h1', null, 'La tua scheda')), zonaGiallo)]);
      F().conDati(pagina, async () => { if (!M.mia) M.mia = (await Rete.get('/server/collaboratore')).collaboratore; }, () => {
        const c = M.mia;
        M.scheda = c;
        aggiungi(zonaGiallo, [h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => aggiungiDocumento(c) }, icona('carica', 18, 2.4), 'Carica un documento')]);
        const k = corpoCollaboratore(c, true);
        aggiungi(pagina, [h('div', { class: 'stretta-820 sezione scheda-io' }, h('h2', { class: 'titolo-scheda' }, c.nome), k.corpo)]);
        if (apriInc) apriIncarico(apriInc);
      });
    }

    // ===================================================================== nuovo collaboratore e scheda

    /** Nuovo collaboratore: chi è (un fornitore che c'è, o nome e partita IVA), tipo, mestiere, abilitazioni, tariffa, chi lo segue. */
    function nuovoCollaboratore() {
      const x = { modo: 'cerca', idSoggetto: '', tipo: 'impresa', referenteId: (S.io && S.io.utente && S.io.utente.id) || '' };
      const v = { cerca: h('input', { type: 'search', placeholder: 'Scrivi il nome del fornitore', 'aria-label': 'Cerca tra i fornitori' }), nome: h('input', { type: 'text' }), partitaIva: h('input', { type: 'text', inputmode: 'numeric' }),
        mestiere: h('input', { type: 'text', placeholder: 'Impianti elettrici civili e industriali' }), abilitazioni: h('input', { type: 'text', placeholder: 'DM 37/2008, lettere A e B' }), tariffa: h('input', { type: 'text', inputmode: 'decimal' }),
        email: h('input', { type: 'email' }), telefono: h('input', { type: 'text' }) };
      const referenti = S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'esterno' && u.ruolo !== 'lettura');
      let errori = {};
      let proposta = null;
      const zona = h('div', { class: 'modulo' });
      const disegna = () => {
        const testo = v.cerca.value.trim();
        const fornitori = S.ana.fornitori.filter(f => !f.archiviato && !f.collaboratore && (!testo || R.norm(f.nome + ' ' + (f.partitaIva || '')).indexOf(R.norm(testo)) >= 0)).slice(0, 6);
        const scelto = x.idSoggetto ? S.ana.soggetti.find(s => s.id === x.idSoggetto) : null;
        aggiungi(svuota(zona), [
          h('div', { class: 'col' }, h('h3', null, 'Chi è'), segmenti([['cerca', 'Tra i fornitori'], ['nuovo', 'Nuovo']], x.modo, k => { x.modo = k; x.idSoggetto = ''; disegna(); }),
            x.modo === 'cerca' ? [scelto ? h('div', { class: 'scelta-card scelta' }, iniziali(scelto.nome, true), h('span', { class: 'testi' }, h('b', null, scelto.nome), h('span', null, scelto.partitaIva || scelto.citta || '')),
              h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.idSoggetto = ''; disegna(); } }, 'Cambia'))
              : [h('label', { class: 'cerca' }, icona('cerca', 18), v.cerca), fornitori.map(f => h('button', { type: 'button', class: 'scelta-card', onclick: () => { x.idSoggetto = f.id; disegna(); } }, iniziali(f.nome, true),
                h('span', { class: 'testi' }, h('b', null, f.nome), h('span', null, 'Fanne un collaboratore'))))], errori.chi ? h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.chi)) : null]
              : [campo('Nome o ragione sociale', v.nome, errori.nome),
                h('div', { class: 'campo' + (errori.partitaIva ? ' sbagliato' : '') }, h('label', null, 'Partita IVA'), h('div', { class: 'campo-con-pulsante' }, v.partitaIva, h('button', { type: 'button', class: 'btn', onclick: cercaIva }, 'Cerca la partita IVA')),
                  errori.partitaIva ? h('div', { class: 'errore' }, errori.partitaIva) : null),
                proposta ? h('div', { class: 'proposta' }, h('div', { class: 'testi' }, h('b', null, proposta.nome || ''), h('span', null, R.indirizzoCompleto(proposta))),
                  h('button', { type: 'button', class: 'btn', onclick: () => { if (proposta.nome) v.nome.value = proposta.nome; disegna(); } }, 'Usa questi dati')) : null,
                h('div', { class: 'riga-campi' }, campo('Email', v.email), campo('Telefono', v.telefono))]),
          h('div', { class: 'col' }, h('h3', null, 'Che collaboratore è'),
            h('div', { class: 'pillole' }, P.TIPI_COLLABORATORE.map(t => h('button', { type: 'button', class: 'pillola' + (x.tipo === t[0] ? ' scelta' : ''), onclick: () => { x.tipo = t[0]; disegna(); } }, t[1]))),
            campo('Mestiere', v.mestiere), campo('Abilitazioni', v.abilitazioni),
            soldi() && puo('costi', 2) ? campo('Tariffa proposta', conSuffisso(v.tariffa, '€/h')) : null,
            campo('Chi lo segue nello studio', selezione([['', 'Nessuno']].concat(referenti.map(u => [u.id, u.nome])), x.referenteId, k => { x.referenteId = k; })))]);
      };
      const cercaIva = async () => {
        const iva = v.partitaIva.value.replace(/\s+/g, '');
        const sbagliata = R.errorePartitaIva(iva);
        if (!iva || sbagliata) { errori.partitaIva = iva ? sbagliata : 'Scrivi la partita IVA'; disegna(); return; }
        const ris = await lavora('Controllo la partita IVA', () => Rete.post('/server/controllaPartitaIva', { partitaIva: iva }));
        if (!ris) return;
        delete errori.partitaIva;
        if (ris.valida === false) errori.partitaIva = 'Questa partita IVA non risulta attiva';
        proposta = ris.nome ? ris : null;
        if (!proposta && ris.valida !== false) avviso('La partita IVA è valida');
        disegna();
      };
      v.cerca.addEventListener('input', () => { const pos = v.cerca.selectionStart; disegna(); v.cerca.focus(); try { v.cerca.setSelectionRange(pos, pos); } catch (e) { /* search */ } });
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (x.modo === 'cerca' && !x.idSoggetto) errori.chi = 'Scegli il fornitore, o scrivine uno nuovo';
        if (x.modo === 'nuovo' && !v.nome.value.trim()) errori.nome = 'Scrivi il nome o la ragione sociale';
        if (Object.keys(errori).length) { disegna(); return; }
        const coll = { tipo: x.tipo, mestiere: v.mestiere.value.trim(), abilitazioni: v.abilitazioni.value.trim(), referenteId: x.referenteId ? Number(x.referenteId) : null };
        if (soldi() && puo('costi', 2) && v.tariffa.value.trim()) coll.tariffa = C.numONull(v.tariffa.value);
        if (x.modo === 'cerca') coll.idSoggetto = x.idSoggetto;
        else coll.soggetto = { nome: v.nome.value.trim(), partitaIva: v.partitaIva.value.replace(/\s+/g, ''), email: v.email.value.trim(), telefono: v.telefono.value.trim(), fornitore: true };
        const r = await lavora('Salvo il collaboratore', () => Rete.post('/server/salvaCollaboratore', { collaboratore: coll }));
        if (!r) return;
        chiudi();
        M.lista = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        avviso(r.giaEsisteva ? 'C\'era già: ' + r.collaboratore.nome + ', ora è un collaboratore' : 'Collaboratore salvato: ' + r.collaboratore.nome);
        W.vai('#collaboratori/c/' + encodeURIComponent(r.collaboratore.idSoggetto));
      };
      chiudi = finestra({ titolo: 'Nuovo collaboratore', larghezza: 'larga', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva il collaboratore')] });
    }

    function moduloCollaboratore(c) {
      const x = { tipo: c.tipo, referenteId: c.referenteId || '' };
      const v = { mestiere: h('input', { type: 'text', value: c.mestiere || '' }), abilitazioni: h('input', { type: 'text', value: c.abilitazioni || '' }), note: h('textarea', { rows: 2 }),
        tariffa: h('input', { type: 'text', inputmode: 'decimal', value: c.tariffa !== null && c.tariffa !== undefined ? R.numeroCampo(c.tariffa) : '' }) };
      v.note.value = c.note || '';
      const referenti = S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'esterno' && u.ruolo !== 'lettura');
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('div', { class: 'pillole' }, P.TIPI_COLLABORATORE.map(t => h('button', { type: 'button', class: 'pillola' + (x.tipo === t[0] ? ' scelta' : ''), onclick: () => { x.tipo = t[0]; disegna(); } }, t[1]))),
        campo('Mestiere', v.mestiere), campo('Abilitazioni', v.abilitazioni), Object.prototype.hasOwnProperty.call(c, 'tariffa') && puo('costi', 2) ? campo('Tariffa proposta', conSuffisso(v.tariffa, '€/h')) : null,
        campo('Chi lo segue nello studio', selezione([['', 'Nessuno']].concat(referenti.map(u => [u.id, u.nome])), x.referenteId, k => { x.referenteId = k; })), campo('Note dello studio', v.note)]);
      disegna();
      let chiudi;
      const salva = async () => {
        const coll = { idSoggetto: c.idSoggetto, tipo: x.tipo, mestiere: v.mestiere.value.trim(), abilitazioni: v.abilitazioni.value.trim(), referenteId: x.referenteId ? Number(x.referenteId) : null, note: v.note.value.trim() };
        if (Object.prototype.hasOwnProperty.call(c, 'tariffa') && puo('costi', 2)) coll.tariffa = C.numONull(v.tariffa.value);
        const r = await lavora('Salvo', () => Rete.post('/server/salvaCollaboratore', { collaboratore: coll }));
        if (!r) return;
        chiudi();
        M.lista = null;
        avviso('Salvato');
        W.disegnaPagina();
        apriCollaboratore(c.idSoggetto);
      };
      chiudi = finestra({ titolo: 'Cambia ' + c.nome, corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    async function attiva(c, si) {
      const r = await lavora('Salvo', () => Rete.post('/server/salvaCollaboratore', { collaboratore: { idSoggetto: c.idSoggetto, tipo: c.tipo, attivo: si } }));
      if (!r) return;
      M.lista = null;
      avviso(si ? 'Di nuovo attivo' : 'Non più attivo');
      W.disegnaPagina();
      apriCollaboratore(c.idSoggetto);
    }

    /** Aggiungi un documento del collaboratore: il tipo a pillole, la data, la scadenza proposta (DURC 120 giorni, visura 6 mesi, gli altri 12). */
    async function aggiungiDocumento(c) {
      const F6 = F();
      const cats = await lavora('Leggo le categorie', () => F6.categorie().catch(() => []));
      const scelto = await W.Archivio.scegliFile('documenti');
      if (!scelto) return;
      const x = { tipo: 'durc' };
      const v = { data: h('input', { type: 'date', value: oggi() }), titolo: h('input', { type: 'text', value: 'DURC' }) };
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, c.nome + ' · ' + scelto.nome),
        h('div', { class: 'campo' }, h('label', null, 'Che documento è'), h('div', { class: 'pillole' }, P.DOCUMENTI_COLLABORATORE.map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.tipo === t[0] ? ' scelta' : ''),
          onclick: () => { x.tipo = t[0]; v.titolo.value = t[0] ? t[1] : String(scelto.nome || '').replace(/\.[a-z0-9]+$/i, ''); disegna(); } }, t[1])))),
        campo('Titolo', v.titolo), campo(x.tipo === 'durc' ? 'Emesso il' : 'Del', v.data)]);
      disegna();
      let chiudi;
      const salva = async () => {
        const idFile = 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const r = await lavora('Carico il documento', async () => {
          const up = await W.Archivio.carica(scelto, 'collaboratore', idFile);
          const doc = { titolo: v.titolo.value.trim() || scelto.nome, idCategoria: F6.idCategoria(cats || [], 'Documenti dei collaboratori'), origine: 'file', idFile: up.file.id, idSoggetto: c.idSoggetto,
            dataDocumento: v.data.value || oggi(), idLocale: 'pc-' + idFile };
          if (x.tipo) doc.tipoScadenza = x.tipo;
          return Rete.post('/server/salvaDocumento', { documento: doc });
        });
        if (!r) return;
        chiudi();
        M.mia = null;
        M.lista = null;
        M.documenti = null;
        W.caricaDashboard();
        avviso('Documento caricato' + (r.documento && r.documento.scadenza ? ': scade il ' + dataIt(r.documento.scadenza.data) : ''));
        W.disegnaPagina();
        if (!esterno() && c.idSoggetto) apriCollaboratore(c.idSoggetto);
      };
      chiudi = finestra({ titolo: esterno() ? 'Carica un documento' : 'Aggiungi un documento', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Carica')] });
    }

    function invitaEsterno(c) {
      const v = { nome: h('input', { type: 'text' }), email: h('input', { type: 'email', value: c.email || '', spellcheck: 'false' }) };
      const zona = h('div', { class: 'fila' }, h('p', { class: 'testo-forte' }, c.nome), campo('Nome di chi entra', v.nome), campo('Email per entrare', v.email));
      const piede = h('div', { class: 'piede-f' });
      let chiudi;
      const vai = async () => {
        if (!v.nome.value.trim()) { v.nome.focus(); avviso('Scrivi il nome', true); return; }
        if (!v.email.value.trim() || R.erroreEmail(v.email.value)) { v.email.focus(); avviso(R.erroreEmail(v.email.value) || 'Scrivi l\'email: serve per entrare', true); return; }
        const r = await lavora('Do l\'accesso', () => Rete.post('/server/invitaEsterno', { idSoggetto: c.idSoggetto, nome: v.nome.value.trim(), email: v.email.value.trim() }));
        if (!r) return;
        aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, v.nome.value.trim() + ' entra come Esterno con ', h('b', null, v.email.value.trim()), ' e questa password:'), F().scatolaPassword(r.passwordIniziale || '')]);
        aggiungi(svuota(piede), [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Fatto')]);
      };
      aggiungi(piede, [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Dai l\'accesso')]);
      chiudi = finestra({ contenuto: [h('div', { class: 'testa-f' }, h('h2', null, 'Dai l\'accesso a Wisper'), B.tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')), h('div', { class: 'corpo-f' }, zona), piede],
        titolo: 'Dai l\'accesso a Wisper', allaChiusura: () => apriCollaboratore(c.idSoggetto) });
    }

    // ===================================================================== incarichi

    function incarichi(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Collaboratori esterni', 'Incarichi', scrive() && soldi() ? F6.gialloPagina('Nuovo incarico', () => nuovoIncarico(null), 'piu') : null), barra(voci, 'incarichi')]);
      F6.conDati(pagina, leggiIncarichi, () => {
        const tutti = M.incarichi.incarichi || [];
        const filtri = [['aperti', 'In corso'], ['bozze', 'Bozze'], ['conclusi', 'Conclusi'], ['valutare', 'Da valutare'], ['tutti', 'Tutti']];
        const conta = { aperti: tutti.filter(i => i.stato === 'affidato').length, bozze: tutti.filter(i => i.stato === 'bozza').length, conclusi: tutti.filter(i => i.stato === 'concluso').length,
          valutare: tutti.filter(i => i.stato === 'concluso' && !i.valutazione).length, tutti: tutti.length };
        const l = tutti.filter(i => M.filtroI === 'tutti' || (M.filtroI === 'aperti' && i.stato === 'affidato') || (M.filtroI === 'bozze' && i.stato === 'bozza') || (M.filtroI === 'conclusi' && i.stato === 'concluso') || (M.filtroI === 'valutare' && i.stato === 'concluso' && !i.valutazione));
        const conSoldi = tutti.some(i => i.conti);
        const col = '112px minmax(0, 1fr) 96px minmax(0, 1.3fr) 112px ' + (conSoldi ? '104px 104px ' : '') + '108px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Numero'), h('span', null, 'Collaboratore'), h('span', null, 'Commessa'), h('span', null, 'Cosa'),
          h('span', null, 'Avanzamento'), conSoldi ? h('span', { class: 'n' }, 'Maturato') : null, conSoldi ? h('span', { class: 'n' }, 'Fatturato') : null, h('span', null, 'Stato')));
        l.forEach(i => aggiungi(tab, [h('div', { class: 'r cliccabile' + (String(M.aperto) === String(i.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-incarico': i.id,
          onclick: () => apriIncarico(i.id), onkeydown: e => { if (e.key === 'Enter') apriIncarico(i.id); } },
        h('b', { class: 'taglia' }, i.numero), h('span', { class: 'taglia' }, i.collaboratore), h('span', null, h('span', { class: 'codice' }, i.idCommessa)), h('span', { class: 'taglia' }, i.titolo),
        h('span', null, i.modo === 'corpo' ? (Number(i.avanzamento) || 0) + '%' : (i.conti && i.conti.oreApprovate !== undefined ? P.numIt(i.conti.oreApprovate) + ' ore' : 'a ore')),
        conSoldi ? h('span', { class: 'n' }, i.conti ? C.euro(i.conti.maturato) : '—') : null, conSoldi ? h('span', { class: 'n' }, i.conti ? C.euro(i.conti.fatturato) : '—') : null,
        h('span', null, pill(i.statoVisto || P.STATI_INCARICO[i.stato], P.coloreIncarico(i.stato))))]));
        aggiungi(pagina, [h('div', { class: 'pillole' }, filtri.map(f => h('button', { type: 'button', class: 'pillola piccola' + (M.filtroI === f[0] ? ' scelta' : ''), onclick: () => { M.filtroI = f[0]; W.disegnaPagina(); } }, f[1] + ' · ' + conta[f[0]]))),
          l.length ? tab : h('p', { class: 'vuoto' }, 'Nessun incarico qui.')]);
      });
    }

    async function apriIncarico(id) {
      M.aperto = id;
      document.querySelectorAll('.tab .r[data-incarico]').forEach(x => x.classList.toggle('scelta', String(x.dataset.incarico) === String(id)));
      F().pannello({ dove: 'Incarico', corpo: segnaposto(4, 64) });
      try {
        const r = await Rete.get('/server/incarico?id=' + encodeURIComponent(id));
        if (String(M.aperto) !== String(id)) return;
        M.incarico = r.incarico;
        disegnaIncarico();
      } catch (e) {
        if (e && e.accesso === false) return;
        F().pannello({ dove: 'Incarico', corpo: h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e))) });
      }
    }

    function disegnaIncarico() {
      const F6 = F();
      const i = M.incarico;
      const lui = esterno();
      const k = i.conti;
      const id = i.idoneita || {};
      const out = [h('div', { class: 'pillole-testa' }, h('span', { class: 'codice' }, i.idCommessa), pill(i.statoVisto || P.STATI_INCARICO[i.stato], P.coloreIncarico(i.stato)), pill(i.modoVisto || (i.modo === 'corpo' ? 'A corpo' : 'A ore'), 'grigio'),
        i.valutazione ? pill(i.valutazioneVista || P.nomeDi(P.VALUTAZIONI, i.valutazione), P.coloreValutazione(i.valutazione)) : null),
        h('h2', { class: 'titolo-scheda' }, i.titolo), h('span', { class: 'sotto-titolo' }, [i.numero, i.collaboratore, i.commessa, i.cliente].filter(Boolean).join(' · '))];
      if ((i.stato === 'bozza' || i.stato === 'affidato') && id.stato && id.stato !== 'in_regola') out.push(h('div', { class: 'mancano-f6' }, icona('allarme', 16, 2.4), h('span', null, id.frase || id.parola)));
      if (i.occasionale || i.tipoCollaboratore === 'occasionale') out.push(h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'corpo' }, h('b', null, 'Comunicazione all\'Ispettorato del lavoro'), h('span', { class: 't2' }, 'Va fatta prima che cominci, dal portale dell\'Ispettorato')), F6.nonCollegato()));
      if (i.descrizione) out.push(h('div', { class: 'lavoro' }, i.descrizione));
      if (i.modo === 'corpo') {
        out.push(F6.sez('Avanzamento', h('div', { class: 'scheda fila-f6' }, h('div', { class: 'rc-f6' }, h('b', { class: 'grande-f6' }, (Number(i.avanzamento) || 0) + '%'), h('span', { class: 'sotto-titolo' }, [i.dal ? 'dal ' + dataIt(i.dal) : '', i.al ? 'al ' + dataIt(i.al) : ''].filter(Boolean).join(' '))),
          h('span', { class: 'barra' }, h('i', { style: { width: Math.max(0, Math.min(100, Number(i.avanzamento) || 0)) + '%' } })))));
      }
      if (k) {
        out.push(F6.sez(lui ? 'I tuoi soldi' : 'Soldi', h('div', { class: 'scheda fila-f6' }, [['Pattuito', k.pattuito, i.modo === 'corpo' ? 'a corpo' : (i.tariffa ? C.euro(i.tariffa) + ' l\'ora × ' + P.numIt(i.orePreviste) + ' ore' : '')],
          ['Maturato', k.maturato, ''], ['Fatturato', k.fatturato, ''], ['Da fatturare', k.daFatturare, ''], ['Da pagare', k.daPagare, '']]
          .map(x => h('div', { class: 'rc-f6' + (x[0] === 'Da fatturare' ? ' tot' : '') }, h('span', null, x[0] + (x[2] ? ' · ' + x[2] : '')), h('b', null, C.euro(x[1] || 0)))))));
      }
      const ore = (i.ore || []).map(o => riga({ sinistra: quadrato('orologio'), titolo: P.ore1(o.ore) + ' · ' + dataIt(o.data), sotto: [o.descrizione, o.statoVisto || o.stato].filter(Boolean).join(' · ') }))
        .concat((i.rapportini || []).map(r => riga({ sinistra: quadrato('rapportini'), titolo: (r.id || 'Rapportino') + ' · ' + dataIt(r.data), sotto: [r.descrizione, C.ore(r.oreTotali || 0)].filter(Boolean).join(' · '),
          onclick: () => W.vaiA({ pagina: 'rapportino', id: r.id }) })));
      out.push(F6.sez('Ore e rapportini', F6.righe(ore, 'Ancora nessuna ora.'), !lui && scrive() && i.stato === 'affidato' && i.collaboratoreHaAccesso === false && i.modo === 'ore' ? F6.piccolo('Ore del collaboratore', () => oreCollaboratore(i), 'piu') : null));
      if ((i.spese || []).length) out.push(F6.sez('Spese', F6.righe(i.spese.map(s => riga({ sinistra: quadrato('scontrino'), titolo: s.descrizione || s.categoria || 'Spesa', sotto: dataIt(s.data), destra: s.importo !== undefined ? h('span', { class: 'quanto' }, C.euro(s.importo)) : null })))));
      out.push(F6.sez('Fatture ricevute', F6.righe((i.ricevute || []).map(r => riga({ sinistra: quadrato('fatturazione'), titolo: 'Fattura ' + r.numero + ' · ' + dataIt(r.data),
        sotto: r.imponibile !== undefined ? 'Imponibile ' + C.euro(r.imponibile) + (r.totale !== undefined ? ' · totale ' + C.euro(r.totale) : '') : '',
        destra: pill(r.statoPagamento, r.statoPagamento === 'Pagata' ? 'verde' : /Scadut/.test(r.statoPagamento) ? 'rosso' : 'ambra'),
        onclick: puo('fatturazione') && soldi() ? () => W.vaiA({ pagina: 'ricevuta', id: r.id }) : null })), 'Ancora nessuna fattura.'),
      !lui && scrive() && puo('fatturazione', 2) && i.stato !== 'annullato' ? F6.piccolo('Collega una fattura ricevuta', () => collegaRicevuta(i), 'link') : null));
      out.push(F6.sez('Documenti', F6.righe((i.documenti || []).map(d => riga({ sinistra: quadrato('file'), titolo: d.titolo, sotto: d.categoria || '', onclick: () => W.Archivio.apriFile(d.url, d.titolo) })), 'Nessun documento.'),
        !lui && scrive() && puo('documenti', 2) ? F6.piccolo('Prepara la lettera d\'incarico', () => letteraIncarico(i), 'preventivo') : null));
      if (i.stato === 'concluso' && i.valutazione && !lui) out.push(F6.sez('Valutazione', h('div', { class: 'scheda fila-f6' }, pill(i.valutazioneVista || P.nomeDi(P.VALUTAZIONI, i.valutazione), P.coloreValutazione(i.valutazione)), i.valutazioneNota ? h('span', { class: 'sotto-titolo' }, i.valutazioneNota) : null)));
      if ((i.cronologia || []).length && !lui) out.push(F6.sez('Cronologia', h('div', { class: 'righe-calme' }, i.cronologia.slice(-8).map(x => h('span', null, R.quando(x.quando) + ' · ' + x.chi + ' · ' + x.testo)))));

      let giallo = null;
      if (!lui && scrive()) {
        if (i.stato === 'bozza') giallo = F6.gialloPannello('Affida l\'incarico', () => affida(i));
        else if (i.stato === 'affidato' && i.modo === 'corpo' && (Number(i.avanzamento) || 0) < 100) giallo = F6.gialloPannello('Aggiorna l\'avanzamento', () => aggiornaAvanzamento(i));
        else if (i.stato === 'affidato') giallo = F6.gialloPannello('Segna concluso', () => concludi(i));
        else if (i.stato === 'concluso' && !i.valutazione) giallo = F6.gialloPannello('Com\'è andato?', () => valuta(i));
      }
      const menu = !lui && scrive() ? [i.stato === 'bozza' || i.stato === 'affidato' ? { testo: 'Cambia', fn: () => nuovoIncarico(null, i) } : null,
        i.stato === 'affidato' && !(i.modo === 'corpo' && (Number(i.avanzamento) || 0) < 100) ? null : i.stato === 'affidato' ? { testo: 'Segna concluso', fn: () => concludi(i) } : null,
        i.stato === 'concluso' ? { testo: 'Riapri', fn: () => riapri(i) } : null,
        i.stato === 'concluso' && i.valutazione ? { testo: 'Cambia la valutazione', fn: () => valuta(i) } : null,
        i.stato === 'bozza' || i.stato === 'affidato' ? '-' : null,
        i.stato === 'bozza' || i.stato === 'affidato' ? { testo: 'Annulla l\'incarico', fn: () => annulla(i), pericolo: true } : null] : null;
      F6.pannello({ dove: 'Incarico', titolo: i.numero, corpo: out, menu, giallo });
    }

    async function dopoIncarico(frase, id) {
      M.incarichi = null;
      M.lista = null;
      M.compensi = null;
      W.caricaDashboard();
      if (frase) avviso(frase);
      W.disegnaPagina();
      if (id) apriIncarico(id);
    }

    async function affida(i) {
      const r = await W.scriviConConferma('Affido l\'incarico', '/server/affidaIncarico', { id: i.id }, d => conferma('Idoneità non in regola', d.errore || 'Manca qualcosa: lo affido lo stesso?', 'Affidalo lo stesso'));
      if (r) dopoIncarico('Incarico affidato', i.id);
    }

    function aggiornaAvanzamento(i) {
      let av = Number(i.avanzamento) || 0;
      const valore = h('b', { class: 'grande-f6' }, av + '%');
      const barraEl = h('span', { class: 'barra' }, h('i', { style: { width: av + '%' } }));
      const passo = d => { av = Math.max(0, Math.min(100, av + d)); valore.textContent = av + '%'; barraEl.firstChild.style.width = av + '%'; };
      let chiudi;
      const salva = async () => {
        const r = await lavora('Salvo', () => Rete.post('/server/aggiornaAvanzamento', { id: i.id, avanzamento: av }));
        if (!r) return;
        chiudi();
        dopoIncarico('Avanzamento ' + av + '%', i.id);
      };
      chiudi = finestra({ titolo: 'Aggiorna l\'avanzamento', fuoco: false, corpo: h('div', { class: 'fila' }, h('p', { class: 'testo-forte' }, i.numero + ' · ' + i.titolo),
        h('div', { class: 'riga-stepper' }, h('span', { class: 'nome' }, valore), h('span', { class: 'stepper' }, B.tondo('meno', 'Meno', () => passo(-10)), B.tondo('piu', 'Più', () => passo(10)))), barraEl,
        h('div', { class: 'pillole' }, [25, 50, 75, 100].map(n => h('button', { type: 'button', class: 'pillola piccola', onclick: () => passo(n - av) }, n + '%')))),
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    async function concludi(i) {
      const ok = await conferma('Segnare concluso?', i.numero + ' · ' + i.titolo + (i.modo === 'corpo' ? ': l\'avanzamento va a 100%.' : '.'), 'Segna concluso');
      if (!ok) return;
      const r = await lavora('Concludo', () => Rete.post('/server/concludiIncarico', { id: i.id }));
      if (r) dopoIncarico('Incarico concluso', i.id);
    }

    function riapri(i) {
      const motivo = h('input', { type: 'text' });
      let chiudi;
      chiudi = finestra({ titolo: 'Riaprire l\'incarico?', corpo: campo('Motivo', motivo), pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { if (!motivo.value.trim()) { motivo.focus(); return; } const r = await lavora('Riapro', () => Rete.post('/server/riapriIncarico', { id: i.id, motivo: motivo.value.trim() })); if (r) { chiudi(); dopoIncarico('Riaperto', i.id); } } }, 'Riapri')] });
    }

    function annulla(i) {
      const motivo = h('input', { type: 'text' });
      let chiudi;
      chiudi = finestra({ titolo: 'Annullare l\'incarico?', corpo: [h('p', null, i.numero + ' · ' + i.titolo), campo('Motivo', motivo)], pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Indietro'),
        h('button', { type: 'button', class: 'btn grande pericolo', onclick: async () => { if (!motivo.value.trim()) { motivo.focus(); avviso('Scrivi il motivo', true); return; } const r = await lavora('Annullo', () => Rete.post('/server/annullaIncarico', { id: i.id, motivo: motivo.value.trim() })); if (r) { chiudi(); dopoIncarico('Incarico annullato', i.id); } } }, 'Annulla l\'incarico')] });
    }

    function valuta(i) {
      let scelta = i.valutazione || '';
      const nota = h('textarea', { rows: 2 });
      nota.value = i.valutazioneNota || '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, i.numero + ' · ' + i.collaboratore), h('div', { class: 'pillole' }, P.VALUTAZIONI.map(v => h('button', { type: 'button', class: 'pillola' + (scelta === v[0] ? ' scelta' : ''), onclick: () => { scelta = v[0]; disegna(); } }, v[1]))), campo('Nota', nota)]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Com\'è andato?', corpo: zona, fuoco: false, pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { if (!scelta) { avviso('Scegli: bene, con qualche problema o male', true); return; } const r = await lavora('Salvo', () => Rete.post('/server/valutaIncarico', { id: i.id, valutazione: scelta, nota: nota.value.trim() })); if (r) { chiudi(); dopoIncarico('Valutato', i.id); } } }, 'Salva')] });
    }

    /** Le ore di un collaboratore senza accesso: le scrive chi segue l'incarico (righe di ore senza utente, con l'incarico). */
    function oreCollaboratore(i) {
      const v = { data: h('input', { type: 'date', value: oggi() }), ore: h('input', { type: 'text', inputmode: 'decimal' }), descrizione: h('input', { type: 'text' }) };
      let chiudi;
      chiudi = finestra({ titolo: 'Ore del collaboratore', corpo: h('div', { class: 'fila' }, h('p', { class: 'testo-forte' }, i.collaboratore + ' · ' + i.numero), h('div', { class: 'riga-campi' }, campo('Il', v.data), campo('Ore', conSuffisso(v.ore, 'ore'))), campo('Cosa ha fatto', v.descrizione)),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
          const n = C.numONull(v.ore.value);
          if (!n) { v.ore.focus(); avviso('Ore: scrivi quante', true); return; }
          const r = await lavora('Salvo le ore', () => Rete.post('/server/salvaOre', { ore: { idIncarico: i.id, idCommessa: i.idCommessa, data: v.data.value || oggi(), ore: n, descrizione: v.descrizione.value.trim(), idLocale: 'pc-o-' + Date.now().toString(36) } }));
          if (r) { chiudi(); dopoIncarico('Ore salvate', i.id); }
        } }, 'Salva le ore')] });
    }

    /** Collega una fattura ricevuta: quelle del collaboratore senza incarico. */
    async function collegaRicevuta(i) {
      const r = await lavora('Leggo le fatture ricevute', () => Rete.get('/server/ricevute'));
      if (!r) return;
      const libere = (r.ricevute || []).filter(x => x.idFornitore === i.idSoggetto && !x.idIncarico && x.stato !== 'annullata');
      let chiudi;
      chiudi = finestra({ titolo: 'Collega una fattura ricevuta', fuoco: false, corpo: F().righe(libere.map(x => riga({ sinistra: quadrato('fatturazione'), titolo: 'Fattura ' + x.numero + ' · ' + dataIt(x.data),
        sotto: [x.descrizione, 'imponibile ' + C.euro(x.imponibile)].filter(Boolean).join(' · '), destra: B.pillola(x.statoVisto, P.colore(x.statoVisto)),
        onclick: async () => { const ok = await lavora('Collego', () => Rete.post('/server/salvaRicevuta', { ricevuta: { id: x.id, idIncarico: i.id } })); if (ok) { chiudi(); dopoIncarico('Fattura ' + x.numero + ' collegata a ' + i.numero, i.id); } } })),
      'Nessuna fattura di ' + i.collaboratore + ' senza incarico.'),
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    /** La lettera d'incarico dal modello LETTERA_INCARICO (fase 5 §5.7): si compone, si salva nell'archivio legata all'incarico. */
    async function letteraIncarico(i) {
      const ris = await lavora('Preparo la lettera', () => Rete.post('/server/componiModello', { chiave: 'LETTERA_INCARICO', idIncarico: i.id }));
      if (!ris) return;
      const testo = ris.testo || '';
      const titolo = ris.titolo || 'Lettera d\'incarico ' + i.numero;
      const area = h('textarea', { rows: 14 });
      area.value = testo;
      let chiudi;
      const salva = async () => {
        const cats = await F().categorie().catch(() => []);
        const r = await lavora('Salvo nell\'archivio', async () => {
          if (S.esempio) throw new Error('Nella visita non si salva niente');
          const html = W.D.lettera({ titolo, testo: area.value, cliente: { nome: i.collaboratore, righe: [] } }, S.ana.impostazioni);
          const pdf = await Rete.post('/locale/pdf', { html, nome: W.nomeFile('Lettera d\'incarico', i.numero), base64: true });
          if (!pdf || !pdf.base64) throw new Error('Il PDF non si è fatto');
          const byte = Uint8Array.from(atob(pdf.base64), ch => ch.charCodeAt(0));
          const c = await W.Archivio.carica({ file: new Blob([byte], { type: 'application/pdf' }), nome: pdf.nome || 'lettera.pdf', mime: 'application/pdf' }, 'documento', 'pc' + Date.now().toString(36));
          return Rete.post('/server/salvaDocumento', { documento: { titolo: 'Lettera d\'incarico ' + i.numero, idCategoria: F().idCategoria(cats, 'Lettere d\'incarico'), origine: 'file', idFile: c.file.id, idIncarico: i.id, idCommessa: i.idCommessa } });
        });
        if (!r) return;
        chiudi();
        dopoIncarico('Lettera salvata nell\'archivio', i.id);
      };
      chiudi = finestra({ titolo: 'Lettera d\'incarico ' + i.numero, larghezza: 'media', corpo: area, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva nell\'archivio')] });
    }

    /** Nuovo incarico (finestra a due colonne): collaboratore, commessa, cosa deve fare, come si paga, spese, date, chi lo segue. */
    async function nuovoIncarico(coll0, i0) {
      if (!M.lista) { if (!(await lavora('Leggo i collaboratori', () => leggiLista().then(() => true)))) return; }
      const lista = (M.lista.collaboratori || []).filter(c => c.attivo !== false);
      const x = { idSoggetto: i0 ? i0.idSoggetto : coll0 ? coll0.idSoggetto : (lista[0] && lista[0].idSoggetto), idCommessa: i0 ? i0.idCommessa : '', modo: i0 ? i0.modo : 'corpo', speseComprese: i0 ? i0.speseComprese !== false : true,
        referenteId: i0 ? i0.referenteId || '' : (S.io && S.io.utente && S.io.utente.id) || '', tetto: !!(i0 && i0.tetto) };
      const affidato = i0 && i0.stato === 'affidato';
      const val = (o, k) => (o && o[k] !== null && o[k] !== undefined ? String(o[k]) : '');
      const v = { cerca: h('input', { type: 'search', placeholder: 'Cerca la commessa', 'aria-label': 'Cerca la commessa' }), titolo: h('input', { type: 'text', value: val(i0, 'titolo') }), descrizione: h('textarea', { rows: 3 }),
        compenso: h('input', { type: 'text', inputmode: 'decimal', value: i0 && i0.compenso ? R.numeroCampo(i0.compenso) : '' }),
        tariffa: h('input', { type: 'text', inputmode: 'decimal', value: i0 && i0.tariffa ? R.numeroCampo(i0.tariffa) : coll0 && coll0.tariffa ? R.numeroCampo(coll0.tariffa) : '' }),
        orePreviste: h('input', { type: 'text', inputmode: 'decimal', value: i0 && i0.orePreviste ? R.numeroCampo(i0.orePreviste) : '' }), tettoV: h('input', { type: 'text', inputmode: 'decimal', value: i0 && i0.tetto ? R.numeroCampo(i0.tetto) : '' }),
        dal: h('input', { type: 'date', value: val(i0, 'dal') }), al: h('input', { type: 'date', value: val(i0, 'al') }) };
      v.descrizione.value = i0 ? i0.descrizione || '' : '';
      const referenti = S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'esterno' && u.ruolo !== 'lettura');
      const recenti = W.attivi().slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).map(r => r.idCommessa).filter(Boolean);
      const aperte = S.ana.commesse.filter(m => m.stato === 'APERTA' && !m.archiviata && !m.modello);
      const ordinate = Array.from(new Set(recenti.concat(aperte.map(m => m.id)))).map(id => aperte.find(m => m.id === id)).filter(Boolean);
      let errori = {};
      const zona = h('div', { class: 'modulo' });
      const disegna = () => {
        const t = v.cerca.value.trim();
        const scelta = x.idCommessa ? S.ana.commesse.find(m => m.id === x.idCommessa) : null;
        const trovate = ordinate.filter(m => !t || R.norm(m.id + ' ' + m.descrizione + ' ' + ((W.cliente(m.idCliente) || {}).nome || '')).indexOf(R.norm(t)) >= 0).slice(0, t ? 6 : 4);
        aggiungi(svuota(zona), [
          h('div', { class: 'col' },
            campo('Collaboratore', selezione(lista.map(c => [c.idSoggetto, c.nome]), x.idSoggetto, k => { x.idSoggetto = k; const c = lista.find(y => y.idSoggetto === k); if (c && c.tariffa && !v.tariffa.value) v.tariffa.value = R.numeroCampo(c.tariffa); }, { disabled: affidato })),
            h('div', { class: 'campo' }, h('label', null, 'Commessa'), scelta ? h('div', { class: 'scelta-card scelta' }, h('span', { class: 'codice' }, scelta.id), h('span', { class: 'testi' }, h('b', null, scelta.descrizione), h('span', null, (W.cliente(scelta.idCliente) || {}).nome || '')),
              affidato ? null : h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.idCommessa = ''; disegna(); } }, 'Cambia'))
              : [h('label', { class: 'cerca' }, icona('cerca', 18), v.cerca), trovate.map(m => h('button', { type: 'button', class: 'scelta-card', onclick: () => { x.idCommessa = m.id; disegna(); } }, h('span', { class: 'codice' }, m.id),
                h('span', { class: 'testi' }, h('b', null, m.descrizione), h('span', null, (W.cliente(m.idCliente) || {}).nome || ''))))], errori.commessa ? h('div', { class: 'errore' }, errori.commessa) : null),
            campo('Cosa deve fare', v.titolo, errori.titolo), campo('Più dettagli', v.descrizione)),
          h('div', { class: 'col' },
            h('div', { class: 'campo' }, h('label', null, 'Come si paga'), segmenti([['corpo', 'A corpo'], ['ore', 'A ore']], x.modo, k => { if (!affidato) { x.modo = k; disegna(); } })),
            x.modo === 'corpo' ? campo('Compenso', conSuffisso(v.compenso, '€'), errori.compenso)
              : [h('div', { class: 'riga-campi' }, campo('Tariffa all\'ora', conSuffisso(v.tariffa, '€/h'), errori.tariffa), campo('Ore previste', conSuffisso(v.orePreviste, 'ore'))),
                x.tetto ? campo('Al massimo', conSuffisso(v.tettoV, '€')) : h('button', { type: 'button', class: 'pillola tratteggiata', style: { alignSelf: 'flex-start' }, onclick: () => { x.tetto = true; disegna(); } }, '+ Un tetto')],
            h('div', { class: 'campo' }, h('label', null, 'Le spese sono comprese'), segmenti([['si', 'Sì'], ['no', 'No']], x.speseComprese ? 'si' : 'no', k => { x.speseComprese = k === 'si'; disegna(); })),
            h('div', { class: 'riga-campi' }, campo('Dal', v.dal), campo('Al', v.al)),
            campo('Chi lo segue nello studio', selezione([['', 'Nessuno']].concat(referenti.map(u => [u.id, u.nome])), x.referenteId, k => { x.referenteId = k; })))]);
      };
      v.cerca.addEventListener('input', () => { const pos = v.cerca.selectionStart; disegna(); v.cerca.focus(); try { v.cerca.setSelectionRange(pos, pos); } catch (e) { /* search */ } });
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!x.idCommessa) errori.commessa = 'Commessa: scegli la commessa';
        if (!v.titolo.value.trim()) errori.titolo = 'Titolo: scrivi cosa deve fare';
        if (x.modo === 'corpo' && !C.numONull(v.compenso.value)) errori.compenso = 'Compenso: scrivi quanto';
        if (x.modo === 'ore' && !C.numONull(v.tariffa.value)) errori.tariffa = 'Tariffa: scrivi quanto all\'ora';
        if (Object.keys(errori).length) { disegna(); return; }
        const inc = { idSoggetto: x.idSoggetto, idCommessa: x.idCommessa, titolo: v.titolo.value.trim(), descrizione: v.descrizione.value.trim(), modo: x.modo, speseComprese: x.speseComprese,
          dal: v.dal.value || '', al: v.al.value || '', referenteId: x.referenteId ? Number(x.referenteId) : null };
        if (x.modo === 'corpo') inc.compenso = C.numONull(v.compenso.value);
        else { inc.tariffa = C.numONull(v.tariffa.value); inc.orePreviste = C.numONull(v.orePreviste.value); if (x.tetto) inc.tetto = C.numONull(v.tettoV.value); }
        if (i0) inc.id = i0.id;
        const r = await lavora('Salvo l\'incarico', () => Rete.post('/server/salvaIncarico', { incarico: inc }));
        if (!r) return;
        chiudi();
        M.segmento = 'incarichi';
        M.filtroI = r.incarico && r.incarico.stato === 'bozza' ? 'bozze' : M.filtroI;
        M.incarichi = null;
        W.caricaDashboard();
        avviso(i0 ? 'Incarico salvato' : 'Incarico ' + (r.incarico && r.incarico.numero) + ' in bozza: affidalo quando è pronto');
        if (r.incarico) W.vai('#collaboratori/in/' + r.incarico.id); else W.disegnaPagina();
      };
      chiudi = finestra({ titolo: i0 ? 'Cambia ' + i0.numero : 'Nuovo incarico', larghezza: 'larga', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva l\'incarico')] });
    }

    // ===================================================================== compensi e documenti

    function compensi(pagina, voci) {
      const F6 = F();
      const anno = M.anno || oggi().slice(0, 4);
      aggiungi(pagina, [F6.testata('Collaboratori esterni', 'Compensi ' + anno), barra(voci, 'compensi')]);
      F6.conDati(pagina, async () => { if (!M.compensi || M.compensi.anno !== Number(anno)) M.compensi = await Rete.get('/server/compensi?anno=' + anno); }, () => {
        const righe = M.compensi.righe || [];
        const tot = M.compensi.totale || {};
        const col = 'minmax(0, 1.5fr) repeat(5, 120px)';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Collaboratore'), h('span', { class: 'n' }, 'Pattuito'), h('span', { class: 'n' }, 'Maturato'),
          h('span', { class: 'n' }, 'Fatturato'), h('span', { class: 'n' }, 'Da fatturare'), h('span', { class: 'n' }, 'Da pagare')),
        righe.map(x => h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', onclick: () => { M.segmento = 'elenco'; W.vai('#collaboratori/c/' + encodeURIComponent(x.idSoggetto)); } },
          h('b', { class: 'taglia' }, x.nome), h('span', { class: 'n' }, C.euro(x.pattuito)), h('span', { class: 'n' }, C.euro(x.maturato)), h('span', { class: 'n' }, C.euro(x.fatturato)), h('span', { class: 'n forte' }, C.euro(x.daFatturare)), h('span', { class: 'n' }, C.euro(x.daPagare)))),
        righe.length ? h('div', { class: 'r piede', style: { gridTemplateColumns: col } }, h('span', null, 'Totale'), h('span', { class: 'n' }, C.euro(tot.pattuito || 0)), h('span', { class: 'n' }, C.euro(tot.maturato || 0)),
          h('span', { class: 'n' }, C.euro(tot.fatturato || 0)), h('span', { class: 'n' }, C.euro(tot.daFatturare || 0)), h('span', { class: 'n' }, C.euro(tot.daPagare || 0))) : null);
        const max = Math.max(1, ...righe.map(x => Math.max(x.maturato || 0, x.fatturato || 0)));
        aggiungi(pagina, [h('div', { class: 'filtri' }, h('span', { class: 'etichetta' }, 'Anno'), selezione([0, 1, 2].map(d => { const a = String(Number(oggi().slice(0, 4)) - d); return [a, a]; }), anno, k => { M.anno = k; W.disegnaPagina(); }),
          h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn', onclick: () => W.esporta('compensi', { anno }) }, icona('scarica', 18, 2.2), 'Esporta')),
        righe.length ? tab : h('p', { class: 'vuoto' }, 'Nessun compenso nel ' + anno + '.'),
        righe.length ? h('div', { class: 'scheda fila-f6' }, h('div', { class: 'legenda-f6' }, h('span', null, h('i', { class: 'maturato' }), 'Maturato'), h('span', null, h('i', { class: 'fatturato' }), 'Fatturato')),
          righe.map(x => h('div', { class: 'barra-h-f6' }, h('span', { class: 'nome taglia' }, x.nome),
            h('span', { class: 'bin' }, h('i', { class: 'maturato', style: { width: (100 * (x.maturato || 0) / max) + '%' } }), h('i', { class: 'fatturato', style: { width: (100 * (x.fatturato || 0) / max) + '%' } })),
            h('span', { class: 'val' }, C.euro(x.daFatturare || 0) + ' da fatturare')))) : null]);
      });
    }

    function documenti(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Collaboratori esterni', 'Documenti dei collaboratori', scrive() ? F6.gialloPagina('Aggiungi un documento', scegliEAggiungi, 'piu') : null), barra(voci, 'documenti')]);
      F6.conDati(pagina, async () => { if (!M.documenti) M.documenti = await Rete.get('/server/scadenze?gruppo=collaboratori'); }, () => {
        aggiungi(pagina, F6.tabellaScadenze(M.documenti, 'Collaboratore'));
      });
    }

    async function scegliEAggiungi() {
      if (!(await lavora('Leggo i collaboratori', () => leggiLista().then(() => true)))) return;
      let chiudi;
      chiudi = finestra({ titolo: 'Di chi è il documento?', fuoco: false, corpo: h('div', { class: 'scelte-ruolo' }, (M.lista.collaboratori || []).map(c => h('button', { type: 'button', class: 'scelta-ruolo', onclick: () => { chiudi(); aggiungiDocumento(c); } },
        iniziali(c.nome, true), h('span', { class: 'testi' }, h('b', null, c.nome), h('span', null, c.tipoNome || ''))))),
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Annulla')] });
    }

    return { vista, M, daRileggere, apriCollaboratore, apriIncarico, nuovoIncarico };
  };
})(window);
