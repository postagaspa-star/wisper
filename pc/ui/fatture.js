/*
 * Wisper Ufficio: Fatturazione (docs/gestionale/fase4.md §13.1 e §13.3, prototipo
 * docs/prototipo/Gestionale-fase4.html vista Computer; risposte in architettura.md §15).
 *
 * Segmenti Da fatturare · Fatture · Ricevute · Scadenze di pagamento · Riepilogo, con la
 * fascia "Regole delle fatture da confermare col commercialista" finché il titolare non le
 * segna confermate. Wisper prepara, il programma di Manuel emette: una bozza non è una
 * fattura (niente numero, mai la parola "fattura" da sola), "Passa al programma" dà il
 * prospetto da copiare e l'XML da completare, e il ritorno dell'XML emesso (anche .p7m e
 * .zip) si abbina alla bozza solo con una conferma esplicita, riga per riga.
 *
 * I conti li fa il server: qui si mostrano i suoi numeri. Le regole di regole-fatture.js
 * servono solo all'anteprima mentre si cambia una bozza; salvando tornano quelli del server.
 *
 * Il fine mese di prima (una scheda per chi paga, Prepara riepilogo) vive dentro Da fatturare:
 * i rapportini di un mese sono una voce, col suo "Prepara riepilogo" e "Riepilogo inviato il …".
 */
(function (radice) {
  'use strict';

  radice.WisperFatture = function (W) {
    const { S, C, D, B, Rete, Api } = W;
    const RF = radice.WisperRegoleFatture;
    const { h, aggiungi, svuota, icona, tondo, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, selezione, segmenti, cerca, riga, quadrato, segnaposto, iniziali } = B;
    const puo = W.puo;
    const scrive = () => puo('fatturazione', 2) && W.soldi();
    const scriveBanche = () => puo('banche', 2) && W.soldi();
    const imp = () => S.ana.impostazioni || {};
    const confermate = () => { const r = imp().REGOLE_FISCALI_CONFERMATE; return !!(r && typeof r === 'object' && r.data); };
    const oggi = () => C.oggiIso();
    const euro = n => C.euro(n);
    const meno = n => '− ' + C.euro(Math.abs(C.num(n)));
    const giornoBreve = iso => (iso ? W.dataBreve(iso) : '');

    const M = {
      df: null, dfChiave: '', scelte: new Map(), cliente: null, raggruppa: {}, aperti: new Set(),
      fatture: null, riepMese: null, filtri: { tipo: 'fattura', pill: 'tutte', testo: '' }, aperta: null,
      ricevute: null, scadenze: null, riep: null, anno: Number(oggi().slice(0, 4)), per: 'cliente', conti: null, preselezione: null,
    };

    function daRileggere() { M.df = null; M.fatture = null; M.ricevute = null; M.scadenze = null; M.riep = null; M.riepMese = null; }

    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => { daRileggere(); W.disegnaPagina(); } }, 'Riprova'))]);
      });
    }

    async function leggiConti() {
      if (M.conti || !puo('banche')) return M.conti || { conti: [] };
      try { M.conti = await Rete.get('/server/conti'); } catch (e) { M.conti = { conti: [] }; }
      return M.conti;
    }

    // ===================================================================== pezzi comuni

    /** La fascia gialla tenue finché le regole non sono confermate (fase4.md §3.4). */
    function fasciaRegole() {
      if (confermate()) return null;
      return h('div', { class: 'fascia-regole', role: 'note' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Regole delle fatture da confermare col commercialista'),
        puo('amministrazione') ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.vai('#amministrazione/fiscale') }, 'Apri') : null);
    }

    const pillStato = parola => pillola(parola, RF.coloreStato(parola));

    /** La pillola Non collegato (fase4.md §2.10): si vede che non c'è, nessun pulsante. */
    const nonCollegato = () => h('span', { class: 'pill non-collegato' }, icona('scollegato', 14, 2.2), 'Non collegato');

    /** Le righe dei conti (§13): Da confermare in giallo scuro accanto a contributo, ritenuta e bollo. */
    function schedaConti(k, f, opzioni) {
      const o = opzioni || {};
      const c = W.cliente(f.idCliente);
      const righe = RF.righeConti(k, f, { confermate: o.confermate !== undefined ? o.confermate : (f.regoleConfermate !== undefined && f.stato !== 'bozza' ? !!f.regoleConfermate : confermate()), privato: c ? !c.partitaIva : false });
      return h('div', { class: 'conti-fattura' + (o.anteprima ? ' anteprima' : '') },
        o.titolo ? h('span', { class: 'etichetta' }, o.titolo) : null,
        righe.map(r => {
          if (r.netto) return h('div', { class: 'rc-netto' }, h('span', null, r.etichetta), h('b', null, euro(r.valore)));
          if (r.totale) return h('div', { class: 'rc-totale' }, h('span', null, r.etichetta), h('b', null, euro(r.valore)));
          return h('div', { class: 'rc' }, h('span', null, r.etichetta, r.daConfermare ? h('span', { class: 'pill piccola p-giallo da-confermare' }, 'Da confermare') : null),
            h('span', null, r.valore === null ? '' : (r.valore < 0 ? meno(r.valore) : euro(r.valore))));
        }));
    }

    function testataFatt(titolo, destra) {
      return h('div', { class: 'testata alta' }, h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Fatturazione'), h('h1', null, titolo)),
        destra ? h('div', { class: 'azioni-testa' }, destra) : null);
    }

    function segmentiFatt(seg) {
      return segmenti([['dafatturare', 'Da fatturare'], ['fatture', 'Fatture'], ['ricevute', 'Ricevute'], ['scadenze', 'Scadenze di pagamento'], ['riepilogo', 'Riepilogo']], seg,
        x => W.vai(x === 'dafatturare' ? '#fatturazione' : '#fatturazione/' + x), 'segmenti-fatt');
    }

    const QUANDO = { firma: 'Alla firma', avanzamento: 'Ad avanzamento', fine: 'A fine lavori' };
    const quandoDi = v => v.tipo === 'scadenza' ? (v.quando === 'data' ? (v.data ? 'Il ' + C.data(v.data) : 'A una data') : QUANDO[v.quando] || '') : '';

    // ===================================================================== la pagina

    function vista(pagina, a1, a2, filtro) {
      const f = filtro || {};
      if (f.apri) M.aperta = f.apri;
      if (f.stato === 'pronta' || f.stato === 'da_emettere') M.filtri.pill = 'emettere';
      if (f.pagamento === 'aperta') M.filtri.pill = 'incassare';
      if (f.scadute) M.filtri.pill = 'scadute';
      if (f.preseleziona) M.preselezione = f.preseleziona;
      if (a1 === 'bozza') { paginaBozza(pagina, decodeURIComponent(a2 || '')); return; }
      const seg = ['fatture', 'ricevute', 'scadenze', 'riepilogo'].indexOf(a1) >= 0 ? a1 : 'dafatturare';
      if (seg === 'fatture') paginaFatture(pagina, f);
      else if (seg === 'ricevute') paginaRicevute(pagina, f);
      else if (seg === 'scadenze') paginaScadenze(pagina);
      else if (seg === 'riepilogo') paginaRiepilogo(pagina);
      else paginaDaFatturare(pagina, f);
    }

    // ===================================================================== DA FATTURARE

    async function leggiDaFatturare(filtro) {
      const q = filtro && filtro.idCommessa ? '?idCommessa=' + encodeURIComponent(filtro.idCommessa) : '';
      const lavori = [Rete.get('/server/daFatturare' + q).then(r => { M.df = r; M.dfChiave = q; })];
      if (!q && !M.fatture) lavori.push(Rete.get('/server/fatture').then(r => { M.fatture = r; }));
      await Promise.all(lavori);
    }

    /** Le voci del server dietro una chiave scelta ("rapportino:RAP/2026/0007", "spesa:6"...). */
    function tutteLeVoci() {
      const m = new Map();
      ((M.df && M.df.gruppi) || []).forEach(g => (g.voci || []).forEach(v => m.set(v.tipo + ':' + v.id, Object.assign({ idCliente: g.idCliente }, v))));
      ((M.df && M.df.piuAvanti) || []).forEach(v => m.set(v.tipo + ':' + v.id, v));
      return m;
    }

    function paginaDaFatturare(pagina, filtro) {
      const zonaBottone = h('span');
      aggiungi(pagina, [testataFatt('Da fatturare', zonaBottone), fasciaRegole(), segmentiFatt('dafatturare')]);
      conDati(pagina, () => (M.df && !M.dfChiave ? Promise.resolve() : leggiDaFatturare(null)), () => {
        if (M.preselezione) { preseleziona(M.preselezione); M.preselezione = null; }
        corpoDaFatturare(pagina, zonaBottone, { filtro });
      });
    }

    /** Arrivando da un rapportino ("Prepara la bozza"): la sua voce è già scelta. */
    function preseleziona(chiave) {
      const voci = tutteLeVoci();
      const v = voci.get(chiave);
      if (!v) return;
      M.scelte.clear();
      M.cliente = v.idCliente;
      M.scelte.set(chiave, { tipo: v.tipo, id: v.id });
      const mese = 'mese:' + v.idCliente + ':' + String(v.data).slice(0, 7);
      M.aperti.add(mese);
    }

    /**
     * Il corpo di Da fatturare. opzioni.incorporata = dentro la pagina di una commessa (il
     * giallo della pagina è già "Modifica": Prepara la bozza diventa col bordo).
     */
    function corpoDaFatturare(contenitore, zonaBottone, opzioni) {
      const o = opzioni || {};
      const df = M.df || { gruppi: [], piuAvanti: [], inBozza: [], daFirmare: [] };
      const zona = h('div', { class: 'sezione' });
      aggiungi(contenitore, [zona]);
      // Le scelte di prima che nel frattempo non sono più da fatturare (fatturate da un'altra parte) si tolgono.
      const presenti = tutteLeVoci();
      Array.from(M.scelte.keys()).forEach(k => { if (!presenti.has(k)) M.scelte.delete(k); });
      if (!M.scelte.size) M.cliente = null;
      // Dalla Dashboard ("Da fatturare dei mesi scorsi"): i rapportini di quel mese si vedono aperti.
      if (o.filtro && o.filtro.mese) (df.gruppi || []).forEach(g => M.aperti.add('mese:' + g.idCliente + ':' + o.filtro.mese));

      const ridisegna = () => { svuota(zona); svuota(zonaBottone); disegnaTutto(); };
      const scegli = (chiave, voce, idCliente, si) => {
        if (si && M.cliente && M.cliente !== idCliente && M.scelte.size) {
          M.scelte.clear();
          avviso('Una fattura è per un cliente solo: ho tolto le altre');
        }
        if (si) { M.scelte.set(chiave, { tipo: voce.tipo, id: voce.id }); M.cliente = idCliente; } else M.scelte.delete(chiave);
        if (!M.scelte.size) M.cliente = null;
        ridisegna();
      };

      function bottonePrepara() {
        const voci = Array.from(M.scelte.values());
        const righe = M.cliente ? RF.righeVista((df.gruppi || []).find(g => g.idCliente === M.cliente) || { voci: [] }) : [];
        let totale = RF.sommaScelte(righe, new Set(M.scelte.keys())).totale;
        // Le voci scelte da Più avanti non sono nelle schede.
        (df.piuAvanti || []).forEach(v => { if (M.scelte.has(v.tipo + ':' + v.id)) totale = Math.round((totale + C.num(v.importo)) * 100) / 100; });
        const testo = 'Prepara la bozza (' + voci.length + ')' + (voci.length ? ' · ' + euro(totale) : '');
        return h('button', { type: 'button', class: 'btn' + (o.incorporata ? '' : ' giallo'), disabled: !voci.length, 'data-visita': 'prepara-bozza', onclick: preparaBozza }, testo);
      }

      async function preparaBozza() {
        const voci = Array.from(M.scelte.values());
        if (!voci.length || !M.cliente) { avviso('Scegli almeno una cosa da fatturare', true); return; }
        const corpo = { idCliente: M.cliente, voci };
        if (M.raggruppa[M.cliente]) corpo.raggruppa = M.raggruppa[M.cliente];
        const ris = await lavora('Preparo la bozza', () => Rete.post('/server/preparaFattura', corpo));
        if (!ris || !ris.fattura) return;
        M.scelte.clear();
        M.cliente = null;
        daRileggere();
        W.caricaDashboard();
        W.Visita.azione('prepara-bozza');
        avviso('Bozza ' + ris.fattura.riferimento + ' pronta: controlla i conti');
        W.vai('#fatturazione/bozza/' + ris.fattura.id);
      }

      function disegnaTutto() {
        if (scrive()) aggiungi(zonaBottone, [bottonePrepara()]);
        if (!o.incorporata) {
          const inBozza = df.inBozza || [];
          const fatture = (M.fatture && M.fatture.fatture) || [];
          const daIncassare = fatture.filter(f => f.tipo === 'fattura' && f.stato === 'emessa').reduce((a, f) => Math.round((a + C.num(f.residuo)) * 100) / 100, 0);
          aggiungi(zona, [h('div', { class: 'tre-colonne' },
            W.riquadro('Da fatturare', euro(df.totale), df.clienti ? (df.clienti === 1 ? '1 cliente' : df.clienti + ' clienti') : 'niente di pronto', { 'data-visita': 'da-fatturare' }),
            h('button', { type: 'button', class: 'riquadro cliccabile', onclick: () => { M.filtri.pill = 'emettere'; W.vai('#fatturazione/fatture'); } },
              h('span', { class: 'che' }, 'In bozza'), h('span', { class: 'quanto' }, euro(inBozza.reduce((a, x) => a + C.num(x.totale), 0))),
              h('span', { class: 'nota' }, inBozza.length === 1 ? '1 in bozza o pronta' : inBozza.length + ' in bozza o pronte')),
            h('button', { type: 'button', class: 'riquadro cliccabile', onclick: () => { M.filtri.pill = 'incassare'; W.vai('#fatturazione/fatture'); } },
              h('span', { class: 'che' }, 'Da incassare'), h('span', { class: 'quanto' }, euro(daIncassare)), h('span', { class: 'nota' }, 'fatture emesse')))]);
        }
        const gruppi = df.gruppi || [];
        if (!gruppi.length) aggiungi(zona, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), o.incorporata ? 'Niente da fatturare per questa commessa.' : 'Niente da fatturare.')]);
        gruppi.forEach((g, i) => aggiungi(zona, [schedaCliente(g, i === 0)]));

        if (o.incorporata) return;
        const piu = (df.piuAvanti || []).length ? sezionePiuAvanti(df.piuAvanti) : null;
        const bozze = (df.inBozza || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'In bozza · ' + df.inBozza.length),
          h('div', { class: 'scheda righe' }, df.inBozza.map(x => riga({
            titolo: [h('span', { class: 'tenue' }, 'Rif. ' + x.riferimento), ' · ' + x.cliente],
            sotto: x.stato === 'pronta' ? 'passata al programma' : 'bozza' + (x.voci ? ' · ' + (x.voci === 1 ? '1 cosa' : x.voci + ' cose') + ' da fatturare' : ''),
            destra: h('span', { class: 'pillole-destra' }, h('span', { class: 'quanto' }, euro(x.totale)), pillStato(x.stato === 'pronta' ? 'Pronta' : 'Bozza')),
            onclick: () => (x.stato === 'bozza' ? W.vai('#fatturazione/bozza/' + x.idFattura) : apriDaElenco(x.idFattura)),
          })))) : null;
        const firmare = h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Da far firmare · non si fatturano finché non sono firmati'),
          (df.daFirmare || []).length ? h('div', { class: 'scheda righe' }, df.daFirmare.slice(0, 8).map(x => riga({
            sinistra: quadrato('firma', 'ico-giallo'), titolo: x.cliente, sotto: [W.dataBreve(x.data), x.descrizione, C.ore(x.ore)].filter(Boolean).join(' · '),
            onclick: () => W.vaiA({ pagina: 'rapportino', id: x.id }),
          }))) : h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Tutti firmati'));
        aggiungi(zona, [h('div', { class: 'due-colonne' }, h('div', { class: 'sezione' }, piu, bozze), firmare)]);
      }

      function schedaCliente(g, prima) {
        const righe = RF.righeVista(g);
        const sogg = W.cliente(g.idCliente);
        const privato = sogg ? !sogg.partitaIva : false;
        const chiavi = [];
        righe.forEach(r => { if (r.tipo === 'mese') r.rapportini.forEach(x => chiavi.push(['rapportino:' + x.voce.id, x.voce])); else chiavi.push([r.chiave, r.voce]); });
        const tutte = chiavi.length && chiavi.every(([k]) => M.scelte.has(k));
        const haRapportini = righe.some(r => r.tipo === 'mese');
        const ragg = M.raggruppa[g.idCliente] || (df.raggruppa || {})[g.idCliente] || 'rapportino';
        const altro = scrive() ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18)) : null;
        if (altro) altro.addEventListener('click', () => apriMenu(altro, [
          { testo: 'Le scelte sono già fatturate fuori da Wisper', fn: () => fatturateFuori(g) },
        ]));
        const colonne = '28px minmax(0, 2.4fr) 92px 64px 128px 132px';
        const tab = h('div', { class: 'tab tab-df' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
          h('span'), h('span', null, 'Cosa'), h('span', null, 'Commessa'), h('span', null, 'Data'), h('span', null, 'Quando'), h('span', { class: 'n' }, 'Importo')));
        righe.forEach(r => aggiungi(tab, rigaVoce(g, r, colonne)));
        return h('div', { class: 'scheda scheda-cliente-df' + (M.cliente === g.idCliente ? ' scelta' : '') },
          h('div', { class: 'testa-cliente-df' }, iniziali(g.cliente),
            h('div', { class: 'chi' }, h('b', null, g.cliente),
              h('span', { class: 'secondario' }, (chiavi.length === 1 ? '1 cosa pronta' : chiavi.length + ' cose pronte') + ' · ' + RF.testoRitenuta(g.sostituto, privato)),
              (g.mancano || []).length ? h('span', { class: 'manca-df' }, 'Per passarla al programma manca: ' + g.mancano.map(x => x.testo.charAt(0).toLowerCase() + x.testo.slice(1)).join('; ')) : null),
            h('span', { class: 'quanto-grande' }, euro(g.totale)), altro),
          h('div', { class: 'comandi-df' },
            scrive() ? h('button', { type: 'button', class: 'btn collegamento', 'data-visita': prima ? 'scegli-tutto' : null, onclick: () => {
              W.Visita.azione('scegli-tutto');
              if (tutte) chiavi.forEach(([k]) => M.scelte.delete(k));
              else {
                if (M.cliente && M.cliente !== g.idCliente && M.scelte.size) { M.scelte.clear(); avviso('Una fattura è per un cliente solo: ho tolto le altre'); }
                chiavi.forEach(([k, v]) => M.scelte.set(k, { tipo: v.tipo, id: v.id }));
                M.cliente = g.idCliente;
              }
              if (!M.scelte.size) M.cliente = null;
              ridisegna();
            } }, tutte ? 'Togli la scelta' : 'Scegli tutto') : h('span'),
            haRapportini && scrive() ? segmenti([['rapportino', 'Una riga per rapportino'], ['mese', 'Una riga per il mese']], ragg, x => { M.raggruppa[g.idCliente] = x; ridisegna(); }, 'piccoli') : null),
          tab);
      }

      function casella(chiave, voce, idCliente, stato) {
        const c = h('input', { type: 'checkbox', class: 'casella-df', 'aria-label': 'Scegli ' + (voce.titolo || voce.id), checked: stato === true, disabled: !scrive(),
          onclick: e => { e.stopPropagation(); scegli(chiave, voce, idCliente, e.target.checked); } });
        if (stato === 'in parte') c.indeterminate = true;
        return c;
      }

      function rigaVoce(g, r, colonne) {
        if (r.tipo === 'mese') return rigaMese(g, r, colonne);
        const v = r.voce;
        const tipo = { scadenza: quandoDi(v) || 'Scadenza di pagamento', spesa: v.anticipazione ? 'Spesa anticipata' : 'Spesa', ore: 'Ore registrate', rapportino: 'Rapportino', ticket: 'Intervento ' + v.id }[v.tipo];
        // Fase 5: il ticket chiuso "una riga per l'intervento" è una voce sola; le sue spese anticipate vanno con lui (righe a parte, senza IVA).
        const anticipate = r.tipo === 'ticket' && (r.spese || []).length ? ' · anticipate ' + (r.spese || []).map(s => euro(s.importo)).join(', ') : '';
        return [h('div', { class: 'r' + (M.scelte.has(r.chiave) ? ' scelta' : ''), style: { gridTemplateColumns: colonne } },
          h('span', null, casella(r.chiave, v, g.idCliente, M.scelte.has(r.chiave))),
          r.tipo === 'ticket' && v.idTicket && W.puo('ticket')
            ? h('button', { type: 'button', class: 'doppia apri-rap', onclick: () => W.vai('#ticket/tk/' + v.idTicket) }, h('span', null, v.titolo), h('span', null, tipo + (v.dettaglio ? ' · ' + v.dettaglio : '') + anticipate))
            : h('span', { class: 'doppia' }, h('span', null, v.titolo), h('span', null, tipo + (v.dettaglio ? ' · ' + v.dettaglio : '') + anticipate)),
          h('span', { class: 't2' }, v.idCommessa || ''),
          h('span', { class: 't2' }, giornoBreve(v.data)),
          h('span', { class: 't2' }, v.tipo === 'scadenza' ? quandoDi(v) : (v.pronta === false ? 'più avanti' : 'pronta')),
          h('span', { class: 'n importo-df' }, h('b', null, euro(r.tipo === 'ticket' ? r.importo : v.importo)), v.anticipazione ? pillola('Senza IVA', 'grigio') : null, v.senzaPrezzo ? pillola('Senza prezzo', 'giallo') : null, v.aCorpo ? pillola('A corpo', 'grigio') : null))];
      }

      function rigaMese(g, r, colonne) {
        const scelti = r.rapportini.filter(x => M.scelte.has('rapportino:' + x.voce.id)).length;
        const stato = scelti === 0 ? false : scelti === r.rapportini.length ? true : 'in parte';
        const aperto = M.aperti.has(r.chiave);
        const riepilogo = (df.riepiloghi || []).find(x => x.idCliente === g.idCliente && x.mese === r.mese);
        const casellaMese = h('input', { type: 'checkbox', class: 'casella-df', 'aria-label': 'Scegli ' + r.titolo, checked: stato === true, disabled: !scrive(),
          onclick: e => {
            e.stopPropagation();
            const si = e.target.checked;
            if (si && M.cliente && M.cliente !== g.idCliente && M.scelte.size) { M.scelte.clear(); avviso('Una fattura è per un cliente solo: ho tolto le altre'); }
            r.rapportini.forEach(x => { const k = 'rapportino:' + x.voce.id; if (si) M.scelte.set(k, { tipo: 'rapportino', id: x.voce.id }); else M.scelte.delete(k); });
            if (si) M.cliente = g.idCliente;
            if (!M.scelte.size) M.cliente = null;
            ridisegna();
          } });
        if (stato === 'in parte') casellaMese.indeterminate = true;
        const lista = r.rapportini.map(x => W.attivi().find(z => z.id === x.voce.id)).filter(Boolean);
        const out = [h('div', { class: 'r riga-mese' + (stato === true ? ' scelta' : ''), style: { gridTemplateColumns: colonne } },
          h('span', null, casellaMese),
          h('span', { class: 'doppia' },
            h('button', { type: 'button', class: 'apri-mese', 'aria-expanded': aperto ? 'true' : 'false', onclick: () => { if (aperto) M.aperti.delete(r.chiave); else M.aperti.add(r.chiave); ridisegna(); } },
              icona(aperto ? 'giu' : 'avanti', 16, 2.6), r.titolo),
            h('span', null, 'Rapportini del mese' + (scelti && stato !== true ? ' · ' + scelti + ' scelti' : ''))),
          h('span', { class: 't2' }, Array.from(new Set(r.rapportini.map(x => x.voce.idCommessa).filter(Boolean))).join(', ')),
          h('span'),
          h('span', { class: 't2' }, 'pronti'),
          h('span', { class: 'n importo-df' }, h('b', null, euro(r.importo)))),
        h('div', { class: 'r riga-riepilogo-mese', style: { gridTemplateColumns: colonne } }, h('span'),
          h('span', { class: 'fila-riepilogo' },
            riepilogo && riepilogo.inviatoIl ? h('span', { class: 'esito' }, icona('spunta', 16, 2.8), 'Riepilogo inviato il ' + giornoBreve(String(riepilogo.inviatoIl).slice(0, 10))) : null,
            scrive() && lista.length ? h('button', { type: 'button', class: 'btn piccolo', 'data-visita': 'prepara-riepilogo', onclick: () => { W.preparaInvio(lista); W.Visita.azione('prepara-riepilogo'); } }, 'Prepara riepilogo') : null))];
        if (aperto) {
          r.rapportini.forEach(x => {
            const v = x.voce;
            const k = 'rapportino:' + v.id;
            const spese = x.spese.map(s => (s.anticipazione ? 'anticipata ' : '') + s.titolo.toLowerCase() + ' ' + euro(s.importo)).join(', ');
            out.push(h('div', { class: 'r riga-rapportino-df' + (M.scelte.has(k) ? ' scelta' : ''), style: { gridTemplateColumns: colonne } },
              h('span', null, casella(k, v, g.idCliente, M.scelte.has(k))),
              h('button', { type: 'button', class: 'doppia apri-rap', onclick: () => W.vaiA({ pagina: 'rapportino', id: v.id }) }, h('span', null, v.id + ' · ' + v.titolo),
                h('span', null, (v.dettaglio || '') + (spese ? ' · ' + spese : ''))),
              h('span', { class: 't2' }, v.idCommessa || ''),
              h('span', { class: 't2' }, giornoBreve(v.data)),
              h('span'),
              h('span', { class: 'n' }, euro(x.importo))));
          });
        }
        return out;
      }

      function sezionePiuAvanti(lista) {
        const d = h('details', { class: 'scheda piu-avanti' });
        if (lista.some(v => M.scelte.has(v.tipo + ':' + v.id))) d.open = true;
        aggiungi(d, [h('summary', null, h('span', null, 'Più avanti · ' + lista.length), icona('giu', 18, 2.4)),
          h('div', { class: 'righe-piu' }, lista.map(v => {
            const k = v.tipo + ':' + v.id;
            return h('label', { class: 'voce-piu' }, casella(k, v, v.idCliente, M.scelte.has(k)),
              h('span', { class: 'corpo' }, h('span', { class: 't1' }, v.titolo + ' · ' + (v.cliente || '')), h('span', { class: 't2' }, [quandoDi(v), v.dettaglio, v.perche].filter(Boolean).join(' · '))),
              h('span', { class: 'quanto' }, euro(v.importo)));
          }))]);
        return d;
      }

      async function fatturateFuori(g) {
        const voci = Array.from(M.scelte.values());
        if (!voci.length || M.cliente !== g.idCliente) { avviso('Scegli prima le voci di ' + g.cliente + ' già fatturate fuori da Wisper', true); return; }
        const ok = await conferma('Già fatturate fuori da Wisper?', (voci.length === 1 ? 'La voce scelta esce' : 'Le ' + voci.length + ' voci scelte escono') +
          ' da Da fatturare e diventa fatturata senza una fattura in Wisper. Fallo solo per il lavoro fatturato prima di Wisper.', 'Sì, già fatturate');
        if (!ok) return;
        const ris = await lavora('Segno fatturate', () => Rete.post('/server/segnaFatturataFuori', { voci, nota: 'segnate da Da fatturare' }));
        if (!ris) return;
        M.scelte.clear();
        M.cliente = null;
        await W.rileggiRapportini();
        avviso((ris.fatte === 1 ? '1 voce segnata' : ris.fatte + ' voci segnate') + ' come già fatturata fuori da Wisper');
        daRileggere();
        W.caricaDashboard();
        W.disegnaPagina();
      }

      disegnaTutto();
    }

    /** Da fatturare dentro la pagina di una commessa (fase4.md §13.1: "la stessa pagina filtrata"). */
    function incorporaDaFatturare(area, idCommessa) {
      const zonaBottone = h('div', { class: 'azioni-testa' });
      aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }), zonaBottone)]);
      conDati(area, () => leggiDaFatturare({ idCommessa }), () => corpoDaFatturare(area, zonaBottone, { incorporata: true }));
    }

    // ===================================================================== LA BOZZA

    function paginaBozza(pagina, id) {
      const zona = h('div', { class: 'sezione' });
      aggiungi(pagina, [zona]);
      let fattura = null;
      conDati(zona, () => Promise.all([Rete.get('/server/fattura?id=' + encodeURIComponent(id)).then(r => { fattura = r.fattura; }), leggiConti()]), () => editorBozza(zona, fattura));
    }

    /**
     * L'editor della bozza (fase4.md §13.3): a sinistra le righe in tabella (trascinabili, le
     * righe di un gruppo col segno del gruppo e "era 317,88" se cambiate, Aggiungi una riga);
     * a destra i conti, data, scadenza, conto, causale, ritenuta e cosa manca; giallo Passa al
     * programma. Le modifiche restano qui finché non si salva (l'anteprima dei conti lo dice);
     * togliere una riga di un gruppo chiede conferma e salva subito (le sorgenti tornano libere).
     */
    function editorBozza(zona, f0) {
      if (!f0) { aggiungi(zona, [h('p', { class: 'vuoto' }, 'Bozza non trovata.')]); return; }
      if (f0.stato !== 'bozza') { M.aperta = f0.id; W.vai('#fatturazione/fatture'); return; }
      let f = f0;
      const modificabile = () => scrive() && f.modificabile !== false;
      const nota = f.tipo === 'nota';
      let righe = [];
      let campi = {};
      let sporca = false;
      const carica = x => {
        f = x;
        righe = (x.righe || []).filter(r => r.tipo !== 'bollo').map(r => Object.assign({}, r, { quantita: r.quantita, prezzo: r.prezzo, importoFisso: null }));
        campi = { data: x.data, scadenza: (x.scadenze && x.scadenze[0] && x.scadenze[0].data) || '', scadenzaAMano: !!x.scadenzaAMano, idConto: x.idConto, causale: x.causale || '',
          noteInterne: x.noteInterne || '', ritenuta: !!x.ritenuta, tipoDocumento: x.tipoDocumento };
        sporca = false;
      };
      carica(f0);
      const cliente = W.cliente(f.idCliente);
      const privato = cliente ? !cliente.partitaIva : false;

      const corpoPagina = h('div', { class: 'sezione' });
      aggiungi(zona, [corpoPagina]);

      function disegna() {
        svuota(corpoPagina);
        zonaBanda = h('div');
        aggiornaBanda();
        const altro = h('button', { type: 'button', class: 'btn grande', 'aria-label': 'Altre azioni', title: 'Altre azioni', style: { width: '52px', padding: '0' } }, icona('altro', 20));
        altro.addEventListener('click', () => apriMenu(altro, [
          { testo: 'Il prospetto (anteprima)', fn: () => apriPassaggio(f, { soloVedere: true }) },
          !nota ? { testo: 'Avviso di parcella per il cliente', fn: () => avvisoParcella(f) } : null,
          modificabile() ? '-' : null,
          modificabile() ? { testo: 'Scarta la bozza', pericolo: true, fn: () => scarta(f, () => W.vai('#fatturazione')) } : null,
        ]));
        aggiungi(corpoPagina, [
          h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna a Fatturazione', () => W.vai('#fatturazione')), h('span', { class: 'dove' }, 'Fatturazione')),
          h('div', { class: 'testata alta' },
            h('div', { class: 'titoli' },
              h('div', { class: 'pillole-testa' }, pillStato('Bozza'), h('span', { class: 'sotto-titolo' }, 'Rif. ' + f.riferimento + ' · non è ancora una fattura')),
              h('h1', null, (nota ? 'Nota di credito per ' : 'Bozza per ') + f.cliente)),
            h('div', { class: 'azioni-testa' }, altro,
              scrive() ? h('button', { type: 'button', class: 'btn giallo grande', 'data-visita': 'passa-al-programma', onclick: passa }, 'Passa al programma') : null)),
          fasciaRegole(),
          zonaBanda,
          nota && f.fatturaCollegata ? h('div', { class: 'banda calma' }, icona('fatturazione', 20), h('span', { class: 'spazio' }, 'Corregge la fattura ' + f.fatturaCollegata.numero + ' del ' + C.data(f.fatturaCollegata.data))) : null,
          (f.tornanoDaFatturare || []).length ? h('div', { class: 'banda calma' }, icona('ripeti', 20), h('span', { class: 'spazio' }, 'Quando la nota sarà emessa tornano da fatturare: ' +
            f.tornanoDaFatturare.map(g => (g.sorgenti || []).map(s => s.descrizione).join(', ')).join('; '))) : null,
          h('div', { class: 'griglia-editor' }, colonnaRighe(), colonnaConti())]);
      }

      function colonnaRighe() {
        const colonne = '22px minmax(0, 1fr) 40px';
        const tab = h('div', { class: 'tab tab-bozza' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
          h('span'), h('span', { class: 'numeri-riga testa-righe' }, h('span', null, 'Descrizione'), h('span', { class: 'gruppo-numeri' }, h('span', { class: 'num-fisso q' }, 'Quantità'), h('span', { class: 'num-fisso unita' }, 'Unità'),
            h('span', { class: 'num-fisso p' }, 'Prezzo'), h('span', { class: 'importo-riga' }, 'Importo'))), h('span')));
        const anteprima = RF.contiFattura(RF.parametriDi(f, imp(), righe));
        righe.forEach((r, i) => aggiungi(tab, [rigaBozza(r, i, colonne, anteprima.righe[i])]));
        const bollo = (f.righe || []).find(r => r.tipo === 'bollo');
        if (bollo && !sporca) {
          aggiungi(tab, [h('div', { class: 'r riga-bozza riga-bollo', style: { gridTemplateColumns: colonne } }, h('span'),
            h('span', { class: 'cella-desc' }, h('span', { class: 'desc-fissa' }, 'Imposta di bollo'),
              h('span', { class: 'numeri-riga' }, pillola('Senza IVA', 'grigio'), h('span', { class: 'segno-gruppo' }, 'la mette e la toglie Wisper'),
                h('span', { class: 'gruppo-numeri' }, h('span', { class: 'num-fisso q' }, '1'), h('span', { class: 'num-fisso unita' }), h('span', { class: 'num-fisso p' }, euro(bollo.prezzo)), h('span', { class: 'importo-riga' }, euro(bollo.importo))))), h('span'))]);
        }
        if (!righe.length) aggiungi(tab, [h('p', { class: 'vuoto' }, 'Nessuna riga.')]);
        return h('div', { class: 'sezione' }, tab,
          modificabile() ? h('div', { class: 'fila-azioni' },
            h('button', { type: 'button', class: 'btn', onclick: () => { righe.push({ id: null, gruppo: '', tipo: 'compenso', descrizione: '', quantita: 1, unita: '', prezzo: 0, nuova: true }); sporca = true; disegna(); } },
              icona('piu', 18, 2.6), 'Aggiungi una riga')) : null);
      }

      function rigaBozza(r, i, colonne, importoAnteprima) {
        const sola = !modificabile();
        const cambiata = r.gruppo && r.importoSorgenti !== null && r.importoSorgenti !== undefined && Math.abs(C.num(importoAnteprima) - C.num(r.importoSorgenti)) > 0.004;
        const segna = () => { sporca = true; disegnaConti(); disegnaBanda(); };
        const desc = h('textarea', { rows: 2, class: 'desc-riga', 'aria-label': 'Descrizione della riga ' + (i + 1), disabled: sola, oninput: e => { r.descrizione = e.target.value; segna(); } });
        desc.value = r.descrizione || '';
        const numeroIn = (valore, chiave, etichetta) => h('input', { type: 'text', inputmode: 'decimal', class: 'num-riga ' + (chiave === 'quantita' ? 'q' : 'p'), value: valore === null || valore === undefined ? '' : C.numero(valore), disabled: sola, 'aria-label': etichetta,
          onchange: e => { const v = RF.leggiNumero(e.target.value); r[chiave] = v === null ? 0 : v; sporca = true; disegna(); } });
        const unita = h('input', { type: 'text', class: 'unita-riga', value: r.unita || '', disabled: sola, 'aria-label': 'Unità di misura', oninput: e => { r.unita = e.target.value; segna(); } });
        const tipo = r.gruppo || sola
          ? pillola(r.tipo === 'anticipazione' ? 'Spesa anticipata, senza IVA' : 'Compenso', r.tipo === 'anticipazione' ? 'grigio' : 'blu')
          : h('button', { type: 'button', class: 'pill ' + (r.tipo === 'anticipazione' ? 'p-grigio' : 'p-blu') + ' cambia-tipo', title: 'Cambia: compenso o spesa anticipata',
            onclick: () => { r.tipo = r.tipo === 'anticipazione' ? 'compenso' : 'anticipazione'; sporca = true; disegna(); } }, r.tipo === 'anticipazione' ? 'Spesa anticipata, senza IVA' : 'Compenso');
        const el = h('div', { class: 'r riga-bozza' + (r.gruppo ? ' di-gruppo' : ''), style: { gridTemplateColumns: colonne }, 'data-indice': String(i) },
          sola ? h('span') : h('span', { class: 'maniglia', title: 'Trascina per spostare', draggable: 'true' }, icona('trascina', 18, 2)),
          h('span', { class: 'cella-desc' }, desc, h('span', { class: 'numeri-riga' }, tipo,
            r.gruppo ? h('span', { class: 'segno-gruppo', title: 'Nata dal lavoro da fatturare: toglierla lo fa tornare da fatturare' }, icona('graffetta', 13, 2.2), 'da fatturare') : null,
            cambiata ? h('span', { class: 'era' }, 'era ' + euro(r.importoSorgenti)) : null,
            h('span', { class: 'gruppo-numeri' }, numeroIn(r.quantita, 'quantita', 'Quantità'), unita, numeroIn(r.prezzo, 'prezzo', 'Prezzo'),
              h('span', { class: 'importo-riga' }, euro(importoAnteprima))))),
          sola ? h('span') : h('button', { type: 'button', class: 'tondo piccolo togli-riga', 'aria-label': 'Togli la riga', title: 'Togli dalla bozza', onclick: () => togliRiga(i) }, icona('chiudi', 16, 2.6)));
        if (!sola) trascinabile(el, i);
        return el;
      }

      function trascinabile(el, i) {
        const maniglia = el.querySelector('.maniglia');
        maniglia.addEventListener('dragstart', e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); el.classList.add('trascinata'); });
        maniglia.addEventListener('dragend', () => el.classList.remove('trascinata'));
        el.addEventListener('dragover', e => { if (Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) return; e.preventDefault(); el.classList.add('sopra'); });
        el.addEventListener('dragleave', () => el.classList.remove('sopra'));
        el.addEventListener('drop', e => {
          e.preventDefault();
          el.classList.remove('sopra');
          const da = Number(e.dataTransfer.getData('text/plain'));
          if (isNaN(da) || da === i) return;
          const [x] = righe.splice(da, 1);
          righe.splice(i, 0, x);
          sporca = true;
          disegna();
        });
      }

      async function togliRiga(i) {
        const r = righe[i];
        if (r.gruppo) {
          const sorgenti = (f.sorgenti || []).filter(s => s.attiva && s.gruppo === r.gruppo);
          const altre = righe.filter((x, j) => j !== i && x.gruppo === r.gruppo).length;
          const testo = (sorgenti.length ? 'Tornano da fatturare: ' + sorgenti.map(s => s.descrizione).join(', ') + '.' : 'La riga torna da fatturare.') +
            (altre ? ' Con lei si tolgono le altre ' + (altre === 1 ? 'riga' : altre + ' righe') + ' nate dallo stesso lavoro.' : '');
          if (!(await conferma('Togliere dalla bozza?', testo, 'Togli'))) return;
          const prima = righe;
          righe = righe.filter(x => x.gruppo !== r.gruppo);
          // Se il server dice no, le righe tornano com'erano: niente sparisce solo da qui.
          if (!(await salva('Tolgo dalla bozza'))) { righe = prima; disegna(); }
        } else {
          righe.splice(i, 1);
          sporca = true;
          disegna();
        }
      }

      let zonaConti = null;
      let zonaBanda = null;
      /** La banda "modifiche non salvate": si aggiorna da sola, senza ridisegnare i campi (il cursore resta dov'è). */
      function aggiornaBanda() {
        if (!zonaBanda) return;
        svuota(zonaBanda);
        if (!sporca) return;
        aggiungi(zonaBanda, [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Modifiche non ancora salvate: i conti a destra sono un\'anteprima'),
          h('button', { type: 'button', class: 'btn piccolo testo', onclick: () => { carica(f); disegna(); } }, 'Annulla'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => salva() }, 'Salva'))]);
      }
      const disegnaBanda = aggiornaBanda;
      function disegnaConti() {
        if (!zonaConti) return;
        const k = sporca ? RF.contiFattura(RF.parametriDi(Object.assign({}, f, { ritenuta: campi.ritenuta }), imp(), righe)) : f.conti;
        aggiungi(svuota(zonaConti), [schedaConti(k, Object.assign({}, f, { ritenuta: campi.ritenuta }), { titolo: sporca ? 'I conti · anteprima' : 'I conti', anteprima: sporca })]);
      }

      function colonnaConti() {
        zonaConti = h('div', { class: 'scheda' });
        disegnaConti();
        const sola = !modificabile();
        const conti = (M.conti && M.conti.conti) || [];
        const giorni = f.scadenze && f.scadenze[0] && campi.data ? RF.giorniFra(campi.data, campi.scadenza || f.scadenze[0].data) : null;
        const inData = h('input', { type: 'date', value: campi.data || '', disabled: sola, onchange: e => { campi.data = e.target.value; sporca = true; disegna(); } });
        const inScad = h('input', { type: 'date', value: campi.scadenza || '', disabled: sola, onchange: e => { campi.scadenza = e.target.value; campi.scadenzaAMano = true; sporca = true; disegna(); } });
        const causale = h('input', { type: 'text', value: campi.causale, disabled: sola, oninput: e => { campi.causale = e.target.value; sporca = true; disegnaBanda(); } });
        const noteInt = h('textarea', { rows: 2, disabled: sola, oninput: e => { campi.noteInterne = e.target.value; sporca = true; disegnaBanda(); } });
        noteInt.value = campi.noteInterne;
        const sostituto = cliente ? (cliente.sostitutoImposta === true || (cliente.sostitutoImposta !== false && !!cliente.partitaIva)) : f.ritenuta;
        const dati = h('div', { class: 'scheda dati-bozza' },
          h('div', { class: 'riga-campi' }, campo('Data proposta', inData),
            campo('Scadenza' + (giorni !== null && !campi.scadenzaAMano ? ' · ' + giorni + ' giorni' : ''), inScad)),
          campi.scadenzaAMano && !sola ? h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start' }, onclick: () => { campi.scadenza = ''; campi.scadenzaAMano = false; campi.tornaCalcolata = true; sporca = true; disegna(); } }, 'Torna alla scadenza calcolata') : null,
          conti.length ? campo('Pagamento', selezione(conti.filter(c => c.attivo !== false).map(c => [c.id, 'Bonifico su ' + c.nome + (c.ultimeCifre ? ' …' + c.ultimeCifre : '')]), campi.idConto,
            x => { campi.idConto = Number(x); sporca = true; disegnaBanda(); }, { disabled: sola })) : h('div', { class: 'coppia' }, h('span', { class: 'piccolo' }, 'Pagamento'), h('b', null, f.conto ? 'Bonifico su ' + f.conto : 'Conto da scrivere in Banche e scadenze')),
          campo('Causale', causale),
          h('div', { class: 'riga-ritenuta' }, h('span', { class: 'corpo' }, h('span', { class: 'piccolo' }, 'Ritenuta'),
            h('b', null, campi.ritenuta ? 'sì' + (sostituto ? ' (' + f.cliente + ' è sostituto d\'imposta)' : ' (scritta a mano)') : (privato ? 'no, è un privato' : 'no'))),
          sola ? null : h('button', { type: 'button', class: 'btn piccolo', onclick: () => { campi.ritenuta = !campi.ritenuta; sporca = true; disegna(); } }, 'Cambia')),
          !nota ? h('div', { class: 'campo' }, h('label', null, 'Documento'), segmenti([['TD01', 'Fattura (TD01)'], ['TD06', 'Parcella (TD06)']], campi.tipoDocumento, x => { if (sola) return; campi.tipoDocumento = x; sporca = true; disegna(); }, 'piccoli')) : null,
          campo('Nota per te, non va al cliente', noteInt),
          (f.mancano || []).length ? h('div', { class: 'mancano-bozza' }, h('b', null, 'Per passarla al programma manca'), f.mancano.map(x => h('span', null, x.testo))) : null);
        return h('div', { class: 'sezione destra-ferma' }, zonaConti, dati);
      }

      function corpoSalva() {
        const x = { id: f.id, data: campi.data, idConto: campi.idConto || undefined, causale: campi.causale, noteInterne: campi.noteInterne, ritenuta: campi.ritenuta,
          righe: righe.map(r => {
            const o = { tipo: r.tipo, descrizione: r.descrizione, quantita: r.quantita, unita: r.unita || '', prezzo: r.prezzo, tributoCliente: !!r.tributoCliente };
            if (r.id) o.id = r.id;
            if (r.gruppo) o.gruppo = r.gruppo;
            return o;
          }) };
        if (!nota) x.tipoDocumento = campi.tipoDocumento;
        if (campi.scadenzaAMano && campi.scadenza) x.scadenza = campi.scadenza;
        else if (campi.tornaCalcolata) x.scadenza = null;
        return x;
      }

      async function salva(testo) {
        const ris = await lavora(testo || 'Salvo la bozza', () => Rete.post('/server/salvaFattura', { fattura: corpoSalva() }));
        if (!ris || !ris.fattura) { disegna(); return false; }
        carica(ris.fattura);
        campi.tornaCalcolata = false;
        daRileggere();
        if ((ris.liberate || []).length) avviso('Tornano da fatturare: ' + ris.liberate.map(x => x.descrizione || x.id).join(', '));
        else avviso('Bozza salvata');
        disegna();
        return true;
      }

      async function passa() {
        if (sporca && !(await salva())) return;
        apriPassaggio(f, { dopo: () => { daRileggere(); M.aperta = f.id; W.vai('#fatturazione/fatture'); } });
      }

      disegna();
    }

    // ===================================================================== PASSA AL PROGRAMMA

    /**
     * La finestra del passaggio (fase4.md §13.3): a sinistra il prospetto per sezioni, ogni
     * campo col suo Copia ("Copiato" per due secondi); a destra Scarica il prospetto (PDF),
     * Scarica l'XML da completare (solo se l'uscita c'è), Copia tutto, Invio allo SDI · Non
     * collegato, la fascia delle regole; giallo Segna come passata al programma. Con qualcosa
     * in "mancano" non si passa: lo dice, e il giallo non c'è.
     */
    async function apriPassaggio(f, opzioni) {
      const o = opzioni || {};
      const p = await lavora('Preparo il prospetto', () => Rete.get('/server/pacchetto?id=' + f.id));
      if (!p) return;
      const modello = p.modello || {};
      const prospetto = p.prospetto || { sezioni: [], testo: '' };
      const uscite = p.uscite || [];
      const mancano = p.mancano || [];
      let chiudi;
      const copia = async (testo, bottone) => {
        const ok = await B.copiaTesto(testo);
        if (!ok) { avviso('Non riesco a copiare: seleziona il testo e copialo a mano', true); return; }
        const prima = bottone.innerHTML;
        bottone.classList.add('copiato');
        svuota(bottone);
        aggiungi(bottone, [icona('spunta', 16, 2.8), 'Copiato']);
        setTimeout(() => { bottone.classList.remove('copiato'); bottone.innerHTML = prima; }, 2000);
      };
      const sinistra = h('div', { class: 'prospetto-campi' }, prospetto.sezioni.map(s => h('div', { class: 'sez-prospetto' },
        h('span', { class: 'etichetta' }, s.titolo),
        s.campi.map(c => {
          const b = h('button', { type: 'button', class: 'btn piccolo copia', 'aria-label': 'Copia ' + c.etichetta }, icona('copia', 16, 2.2), 'Copia');
          b.addEventListener('click', () => copia(c.valore, b));
          return h('div', { class: 'campo-prospetto' }, h('span', { class: 'k' }, c.etichetta), h('span', { class: 'v' }, c.valore), b);
        }))));
      const tuttoBtn = h('button', { type: 'button', class: 'btn grande largo' }, icona('copia', 18, 2.2), 'Copia tutto');
      tuttoBtn.addEventListener('click', () => copia(prospetto.testo, tuttoBtn));
      const k = f.conti || {};
      const passabile = scrive() && !o.soloVedere && (f.stato === 'bozza') && !mancano.length;
      const destra = h('div', { class: 'prospetto-azioni' },
        h('span', { class: 'etichetta' }, 'Prospetto per il programma'),
        uscite.indexOf('prospetto') >= 0 ? h('button', { type: 'button', class: 'btn grande largo', onclick: () => pdfProspetto(f, modello) }, icona('scarica', 18, 2.2), 'Scarica il prospetto (PDF)') : null,
        uscite.indexOf('xml') >= 0 && p.xml ? h('button', { type: 'button', class: 'btn grande largo', onclick: () => salvaXml(p.xml) }, icona('file', 18, 2.2), 'Scarica l\'XML da completare') : null,
        tuttoBtn,
        // L'avviso di parcella (fase4.md §8.3, facoltativo): per chi fattura all'incasso. Non cambia lo stato.
        scrive() && f.tipo !== 'nota' && (f.stato === 'bozza' || f.stato === 'pronta') ? h('button', { type: 'button', class: 'btn grande largo', onclick: () => avvisoParcella(f) }, icona('email', 18, 2.2), 'Avviso di parcella per il cliente') : null,
        h('div', { class: 'scheda totali-prospetto' },
          h('div', { class: 'rc' }, h('span', null, f.tipo === 'nota' ? 'Totale della nota' : 'Totale della fattura'), h('b', null, euro(modello.totaleDocumento !== undefined ? modello.totaleDocumento : k.totale))),
          h('div', { class: 'rc' }, h('span', null, f.tipo === 'nota' ? 'Netto stornato' : 'Netto da incassare'), h('b', null, euro(modello.nettoAPagare !== undefined ? modello.nettoAPagare : k.netto)))),
        h('div', { class: 'riga-sdi' }, h('span', { class: 'corpo' }, h('b', null, 'Invio allo SDI'), h('span', { class: 'tenue' }, 'Lo fa il tuo programma')), nonCollegato()),
        mancano.length ? h('div', { class: 'mancano-bozza' }, h('b', null, 'Prima di passarla al programma manca'), mancano.map(x => h('span', null, x.testo))) : null,
        passabile ? h('button', { type: 'button', class: 'btn giallo grande largo', 'data-visita': 'segna-passata', onclick: async () => {
          const ris = await W.scriviConConferma('Segno passata al programma', '/server/passaAlProgramma', { id: f.id },
            d => conferma('Regole non confermate', d.errore || 'Le regole delle fatture non sono ancora confermate dal commercialista: passala lo stesso?', 'Passala lo stesso'));
          if (!ris || !ris.fattura) return;
          chiudi();
          W.caricaDashboard();
          avviso(ris.fattura.riferimento + ' passata al programma: quando il programma l\'ha emessa, importa l\'XML');
          if (o.dopo) o.dopo(ris.fattura);
        } }, 'Segna come passata al programma') : null);
      const contenuto = h('div', { class: 'finestra-passaggio' },
        h('div', { class: 'testa-f' }, h('h2', null, (o.soloVedere || f.stato !== 'bozza' ? 'Il prospetto: ' : 'Passa al programma: ') + f.cliente), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')),
        h('div', { class: 'corpo-f' },
          h('p', { class: 'sotto-titolo', style: { margin: 0 } }, 'Copia i campi nel programma delle fatture, oppure importa l\'XML se il programma lo accetta. Rif. ' + f.riferimento + '.'),
          prospetto.avviso ? h('div', { class: 'fascia-regole' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Regole non ancora confermate dal commercialista: controlla i conti prima di emetterla')) : null,
          h('div', { class: 'griglia-passaggio' }, sinistra, destra)));
      chiudi = finestra({ contenuto, larghezza: 'larga', titolo: 'Passa al programma', fuoco: false });
    }

    async function pdfProspetto(f, modello) {
      if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
      const conf = imp().REGOLE_FISCALI_CONFERMATE;
      const html = D.prospettoFattura(modello, { oggi: oggi(), confermateIl: conf && conf.data ? conf.data : '' });
      const ris = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', { html, nome: W.nomeFile('Prospetto ' + f.riferimento, f.cliente), apri: true }));
      if (ris) avviso('PDF salvato in ' + ris.percorso);
    }

    /** L'XML da completare: si salva col nome che dice di non inviarlo ("Bozza W-15 Rossi Impianti Srl - non inviare.xml"). */
    async function salvaXml(x) {
      if (S.esempio) { avviso('Nella visita non si salva niente'); return; }
      const ris = await lavora('Salvo l\'XML', () => Api.post('/locale/salva-file', { nome: x.nome, base64: x.base64 }));
      if (ris && ris.ok) avviso('Salvato in ' + ris.percorso + ': completalo nel programma, non inviarlo così');
    }

    /** L'avviso di parcella: un PDF senza valore fiscale, per email al cliente (inviaAvviso) o solo il PDF. */
    async function avvisoParcella(f) {
      const p = await lavora('Preparo l\'avviso', () => Rete.get('/server/pacchetto?id=' + f.id));
      if (!p) return;
      const c = W.cliente(f.idCliente) || {};
      const a = h('input', { type: 'email', value: c.email || '', placeholder: 'email di ' + f.cliente });
      const oggetto = h('input', { type: 'text', value: 'Avviso di parcella · ' + (imp().RAGIONE_SOCIALE || '') });
      const messaggio = h('textarea', { rows: 5 });
      messaggio.value = 'Buongiorno,\nin allegato l\'avviso di parcella. La fattura arriva al pagamento.\n\nCordiali saluti\n' + (imp().TECNICO || imp().RAGIONE_SOCIALE || '');
      const html = () => D.avvisoParcella(p.modello, { oggi: oggi() });
      let chiudi;
      const zonaA = h('div', null, campo('A', a));
      const manda = async () => {
        if (!a.value.trim()) { aggiungi(svuota(zonaA), [campo('A', a, 'Manca l\'indirizzo: scrivilo qui (lo puoi salvare in Clienti)')]); a.focus(); return; }
        if (S.esempio) { chiudi(); avviso('Avviso inviato (esempio: non è partito niente)'); return; }
        const ris = await lavora('Mando l\'avviso', async () => {
          const pdf = await Rete.post('/locale/pdf', { html: html(), nome: W.nomeFile('Avviso di parcella ' + f.riferimento, f.cliente), apri: false, base64: true });
          return Rete.post('/server/inviaAvviso', { id: f.id, a: a.value.trim(), oggetto: oggetto.value, messaggio: messaggio.value,
            allegati: pdf && pdf.base64 ? [{ nome: pdf.nome, mime: 'application/pdf', base64: pdf.base64 }] : [] });
        });
        if (!ris) return;
        chiudi();
        avviso('Avviso di parcella inviato a ' + a.value.trim());
        W.disegnaPagina();
      };
      chiudi = finestra({
        titolo: 'Avviso di parcella', corpo: [h('p', { class: 'sotto-titolo', style: { margin: 0 } }, f.cliente + ' · ' + euro((p.modello || {}).nettoAPagare) + ' da pagare · non è una fattura'), zonaA, campo('Oggetto', oggetto), campo('Messaggio', messaggio)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande', onclick: async () => {
            if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
            const r = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', { html: html(), nome: W.nomeFile('Avviso di parcella ' + f.riferimento, f.cliente), apri: true }));
            if (r) { chiudi(); avviso('PDF salvato in ' + r.percorso); }
          } }, 'Solo il PDF'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: manda }, 'Invia per email')],
      });
    }

    async function scarta(f, dopo) {
      const motivo = h('input', { type: 'text' });
      let chiudi;
      const vai = async () => {
        chiudi();
        const ris = await W.scriviConConferma('Scarto', '/server/scartaFattura', { id: f.id, motivo: motivo.value.trim() },
          d => conferma('Scartarla?', d.errore, 'Scartala', true));
        if (!ris) return;
        daRileggere();
        W.caricaDashboard();
        avviso(f.riferimento + ' scartata: quello che aveva dentro torna da fatturare');
        if (dopo) dopo(); else W.disegnaPagina();
      };
      chiudi = finestra({ titolo: 'Scartare ' + f.riferimento + '?', corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'Le cose che aveva dentro tornano da fatturare. Resta nell\'archivio, segnata come scartata.'), campo('Perché', motivo)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: vai }, 'Scarta')] });
    }

    // ===================================================================== FATTURE

    async function leggiFatture() {
      const anno = oggi().slice(0, 4);
      await Promise.all([
        Rete.get('/server/fatture').then(r => { M.fatture = r; }),
        M.riepMese ? Promise.resolve() : Rete.get('/server/riepilogoFatturato?anno=' + anno + '&per=mese').then(r => { M.riepMese = r; }).catch(() => { M.riepMese = { righe: [] }; }),
      ]);
    }

    let bottoneImporta = null;

    function paginaFatture(pagina) {
      bottoneImporta = scrive() ? h('button', { type: 'button', class: 'btn' + (M.aperta ? '' : ' giallo'), onclick: () => importaXml() }, icona('importa', 18, 2.4), 'Importa XML') : null;
      aggiungi(pagina, [testataFatt('Fatture', [scrive() ? h('button', { type: 'button', class: 'btn', onclick: nuovaFattura }, icona('piu', 18, 2.6), 'Nuova fattura') : null, bottoneImporta]),
        fasciaRegole(), segmentiFatt('fatture')]);
      conDati(pagina, leggiFatture, () => corpoFatture(pagina));
    }

    function filtraFatture(lista) {
      const f = M.filtri;
      const t = C.normalizza(f.testo || '');
      return lista.filter(x => (f.tipo === 'nota' ? x.tipo === 'nota' : x.tipo !== 'nota'))
        .filter(x => f.pill === 'emettere' ? (x.stato === 'bozza' || x.stato === 'pronta')
          : f.pill === 'incassare' ? (x.stato === 'emessa' && C.num(x.residuo) > 0.004)
            : f.pill === 'scadute' ? !!x.scaduta : true)
        .filter(x => !t || C.normalizza([x.numero, x.riferimento, x.cliente, x.causale].join(' ')).indexOf(t) >= 0);
    }

    function corpoFatture(pagina) {
      const tutte = (M.fatture && M.fatture.fatture) || [];
      const fatt = tutte.filter(x => x.tipo === 'fattura');
      const daEmettere = fatt.filter(x => x.stato === 'bozza' || x.stato === 'pronta');
      const somma = (l, k) => l.reduce((a, x) => Math.round((a + C.num(typeof k === 'function' ? k(x) : x[k])) * 100) / 100, 0);
      const daIncassare = fatt.filter(x => x.stato === 'emessa');
      const scadute = fatt.filter(x => x.scaduta);
      const mese = oggi().slice(0, 7);
      const rigaMese = ((M.riepMese && M.riepMese.righe) || []).find(r => r.chiave === mese);
      const box = (che, quanto, nota, pill, rosso) => h('button', { type: 'button', class: 'riquadro cliccabile' + (rosso ? ' negativo' : '') + (M.filtri.pill === pill ? ' attivo' : ''), onclick: () => { M.filtri.pill = M.filtri.pill === pill ? 'tutte' : pill; M.filtri.tipo = 'fattura'; W.disegnaPagina(); } },
        h('span', { class: 'che' }, che), h('span', { class: 'quanto' }, quanto), nota ? h('span', { class: 'nota' }, nota) : null);
      aggiungi(pagina, [h('div', { class: 'quattro-riquadri' },
        box('Da emettere', String(daEmettere.length), euro(somma(daEmettere, x => x.conti && x.conti.netto)) + ' di netto', 'emettere'),
        box('Da incassare', euro(somma(daIncassare, 'residuo')), daIncassare.filter(x => C.num(x.residuo) > 0.004).length + ' fatture emesse', 'incassare'),
        box('Scadute', euro(somma(scadute, 'residuo')), scadute.length === 1 ? '1 fattura' : scadute.length + ' fatture', 'scadute', scadute.length > 0),
        W.riquadro('Incassato a ' + W.meseMinuscolo(mese), euro(rigaMese ? rigaMese.incassato : 0), 'movimenti abbinati alle fatture'))]);

      const area = h('div', { class: 'sezione' });
      const ricerca = cerca(M.filtri.testo, 'Numero, cliente, causale', v => { M.filtri.testo = v; elenco(area); });
      aggiungi(pagina, [h('div', { class: 'filtri' },
        segmenti([['fattura', 'Fatture'], ['nota', 'Note di credito']], M.filtri.tipo, x => { M.filtri.tipo = x; W.disegnaPagina(); }),
        ricerca,
        h('div', { class: 'pillole' }, [['tutte', 'Tutte'], ['emettere', 'Da emettere'], ['incassare', 'Da incassare'], ['scadute', 'Scadute']].map(p =>
          h('button', { type: 'button', class: 'pillola' + (M.filtri.pill === p[0] ? ' scelta' : ''), 'aria-pressed': M.filtri.pill === p[0] ? 'true' : 'false', onclick: () => { M.filtri.pill = p[0]; W.disegnaPagina(); } }, p[1]))),
        h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn collegamento', onclick: esportaFatture }, 'Esporta per Excel')),
      area]);
      elenco(area);
      if (M.aperta) apriPannello(M.aperta);
    }

    function esportaFatture() {
      const f = M.filtri;
      const filtri = { tipo: f.tipo };
      if (f.pill === 'emettere') filtri.stato = 'da_emettere';
      if (f.pill === 'incassare') filtri.pagamento = 'aperta';
      if (f.pill === 'scadute') filtri.scadute = true;
      if (f.testo) filtri.testo = f.testo;
      W.esporta('fatture', filtri);
    }

    const COLONNE_FATTURE = '132px 104px 64px minmax(0, 1.2fr) minmax(0, 1.4fr) 112px 60px 112px';

    function elenco(area) {
      svuota(area);
      const lista = filtraFatture((M.fatture && M.fatture.fatture) || []);
      if (!lista.length) { aggiungi(area, [h('p', { class: 'vuoto' }, M.filtri.tipo === 'nota' ? 'Nessuna nota di credito.' : 'Nessuna fattura con questi filtri.')]); return; }
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: COLONNE_FATTURE } },
        h('span', null, 'Stato'), h('span', null, 'Numero'), h('span', null, 'Data'), h('span', null, 'Cliente'), h('span', null, 'Causale'),
        h('span', { class: 'n' }, M.filtri.tipo === 'nota' ? 'Totale' : 'Netto'), h('span', null, 'Scade'), h('span', { class: 'n' }, 'Residuo')));
      lista.forEach(x => {
        const k = x.conti || {};
        const scadenza = x.scadenze && x.scadenze[0] ? x.scadenze[0].data : '';
        const bozza = x.stato === 'bozza' || x.stato === 'pronta' || x.stato === 'scartata';
        aggiungi(tab, [h('div', { class: 'r cliccabile' + (String(M.aperta) === String(x.id) ? ' scelta' : ''), style: { gridTemplateColumns: COLONNE_FATTURE }, role: 'button', tabindex: '0', 'data-id': String(x.id),
          onclick: () => (x.stato === 'bozza' ? W.vai('#fatturazione/bozza/' + x.id) : apriPannello(x.id)),
          onkeydown: e => { if (e.key === 'Enter') (x.stato === 'bozza' ? W.vai('#fatturazione/bozza/' + x.id) : apriPannello(x.id)); } },
        h('span', null, pillStato(x.statoVisto)),
        bozza ? h('span', { class: 'tenue forte' }, x.riferimento) : h('span', { class: 'forte' }, x.numero || x.etichetta),
        h('span', null, giornoBreve(x.data)),
        h('span', { class: 'taglia' }, x.cliente),
        h('span', { class: 'taglia t2', title: x.causale }, x.causale),
        h('span', { class: 'n' }, euro(x.tipo === 'nota' ? k.totale : k.netto)),
        h('span', { class: x.scaduta ? 'rosso-testo' : '' }, x.tipo === 'nota' ? '—' : giornoBreve(scadenza)),
        h('span', { class: 'n forte' + (x.scaduta ? ' rosso-testo' : '') }, x.tipo === 'nota' ? '—' : euro(x.residuo)))]);
      });
      aggiungi(area, [tab]);
    }

    function apriDaElenco(id) { M.aperta = id; W.vai('#fatturazione/fatture'); }

    // ----------------------------------------------------------------------- il pannello della fattura

    function chiudiPannello() {
      M.aperta = null;
      const p = document.querySelector('.pannello.pannello-fattura');
      if (p) { p.classList.add('via'); setTimeout(() => p.remove(), 200); }
      document.querySelectorAll('.tab .r.scelta[data-id]').forEach(x => x.classList.remove('scelta'));
      if (bottoneImporta) bottoneImporta.classList.add('giallo');
    }

    async function apriPannello(id) {
      M.aperta = id;
      document.querySelectorAll('.tab .r[data-id]').forEach(x => x.classList.toggle('scelta', x.dataset.id === String(id)));
      if (bottoneImporta) bottoneImporta.classList.remove('giallo');
      let f = null;
      try { f = (await Rete.get('/server/fattura?id=' + encodeURIComponent(id))).fattura; } catch (e) { if (e.accesso !== false) avviso(e.message, true); chiudiPannello(); return; }
      if (String(M.aperta) !== String(id)) return;
      if (f.stato === 'bozza') { W.vai('#fatturazione/bozza/' + f.id); return; }
      disegnaPannello(f);
    }

    function passiFattura(f) {
      const nomi = ['Bozza', 'Pronta', 'Emessa', 'Pagata'];
      const i = f.stato === 'pronta' ? 1 : f.stato === 'emessa' ? (f.pagamento === 'pagata' ? 3 : 2) : f.stato === 'annullata' ? 2 : 0;
      return h('div', { class: 'passi', 'aria-label': 'A che punto è' }, nomi.map((n, k) => h('span', { class: (k <= i ? 'fatto' : '') + (k === i ? ' ora' : '') }, h('i'), h('em', null, n))));
    }

    function disegnaPannello(f) {
      const vecchio = document.querySelector('.pannello.pannello-fattura');
      const nota = f.tipo === 'nota';
      const k = f.conti || {};
      const scad = f.scadenze && f.scadenze[0] ? f.scadenze[0].data : '';
      const titolo = nota ? 'Nota di credito ' + (f.numero || f.riferimento) : f.stato === 'emessa' || f.stato === 'annullata' ? 'Fattura ' + f.numero : f.etichetta;
      const avvisi = (f.avvisi || []).map(a => h('div', { class: a.tipo === 'scarto' ? 'banda' : 'banda giallina' }, icona('avviso', 20), h('span', { class: 'spazio' }, a.testo)));
      if (f.scaduta) avvisi.unshift(h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Scaduta da ' + f.giorniScaduta + (f.giorniScaduta === 1 ? ' giorno' : ' giorni') + ': restano ' + euro(f.residuo))));
      // Correzione del 22/10 (architettura.md): soldi già incassati da restituire o compensare dopo una nota di credito.
      if (C.num(f.daRestituire) > 0.004) avvisi.unshift(h('div', { class: 'banda da-restituire', role: 'alert' }, icona('avviso', 20), h('span', { class: 'spazio' }, euro(f.daRestituire) + ' da restituire o compensare')));
      const incassi = !nota ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Incassi'),
        h('div', { class: 'scheda righe' },
          (f.incassi || []).length ? f.incassi.map(x => riga({
            sinistra: quadrato('entrata', 'ico-blu'), titolo: euro(x.importo), sotto: C.data(x.data) + (x.conto ? ' · ' + x.conto : ''),
            destra: pillStato(x.verificato ? 'Verificato in banca' : 'Registrato'),
          })) : h('div', { class: 'riga' }, h('span', { class: 'corpo' }, h('span', { class: 't2' }, 'Nessun incasso.'))),
          f.stato !== 'annullata' ? h('div', { class: 'riga' }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Restano')), h('span', { class: 'quanto' }, euro(f.residuo))) : null)) : null;
      const righe = h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Righe'),
        h('div', { class: 'scheda righe' }, (f.righe || []).map(r => h('div', { class: 'riga' }, h('span', { class: 'corpo' }, h('span', { class: 't1 piccolo-15' }, r.descrizione),
          r.tipo === 'anticipazione' || r.tipo === 'bollo' ? h('span', { class: 't2' }, 'senza IVA') : null), h('span', { class: 'quanto' }, euro(r.importo))))));
      const sdi = h('div', { class: 'scheda righe' },
        h('div', { class: 'riga' }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Invio allo SDI'), h('span', { class: 't2' }, f.esitoSdi ? { consegnata: 'Consegnata', non_consegnata: 'Non consegnata: è nell\'area riservata del cliente', scartata: 'Scartata dallo SDI' }[f.esitoSdi] + (f.esitoIl ? ' il ' + C.data(f.esitoIl) : '') : 'Lo fa il tuo programma')), nonCollegato()),
        f.file ? h('button', { type: 'button', class: 'riga', onclick: () => W.apriFile({ id: f.file.id, nome: f.file.nome }) }, quadrato('file'), h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'XML emesso'), h('span', { class: 't2' }, f.file.nome))) : null,
        f.fatturaCollegata ? h('button', { type: 'button', class: 'riga', onclick: () => apriPannello(f.fatturaCollegata.id) }, quadrato('fatturazione'), h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Corregge la fattura ' + f.fatturaCollegata.numero), h('span', { class: 't2' }, 'del ' + C.data(f.fatturaCollegata.data)))) : null,
        (f.note || []).map(n => h('button', { type: 'button', class: 'riga', onclick: () => apriPannello(n.id) }, quadrato('fatturazione'), h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Nota di credito ' + (n.numero || '')), h('span', { class: 't2' }, euro(n.totale) + ' · ' + (n.stato === 'emessa' ? 'emessa' : n.stato))))));

      // UN giallo secondo lo stato (§13.2): pronta → Importa l'XML emesso; emessa da incassare → Segna un incasso.
      let principale = null;
      if (scrive() && f.stato === 'pronta') principale = h('button', { type: 'button', class: 'btn grande giallo', onclick: () => importaXml() }, icona('importa', 18, 2.4), 'Importa l\'XML emesso');
      else if (scriveBanche() && !nota && f.stato === 'emessa' && C.num(f.residuo) > 0.004) principale = h('button', { type: 'button', class: 'btn grande giallo', onclick: () => W.Banche.segnaIncasso(f, ricarica) }, 'Segna un incasso');
      const voci = [
        { testo: 'Prospetto (PDF)', fn: async () => { const p = await lavora('Preparo il prospetto', () => Rete.get('/server/pacchetto?id=' + f.id)); if (p) pdfProspetto(f, p.modello); } },
        f.stato === 'pronta' ? { testo: 'Rivedi il prospetto e l\'XML da completare', fn: () => apriPassaggio(f, { soloVedere: true }) } : null,
        f.file ? { testo: 'XML emesso', fn: () => W.apriFile({ id: f.file.id, nome: f.file.nome }) } : null,
        scrive() && f.stato === 'pronta' && !nota ? { testo: 'Avviso di parcella', fn: () => avvisoParcella(f) } : null,
        scriveBanche() && f.stato === 'pronta' && !nota && C.num(f.residuo) > 0.004 ? { testo: 'Segna un incasso (ha già pagato)', fn: () => W.Banche.segnaIncasso(f, ricarica) } : null,
        scrive() && f.stato === 'pronta' ? { testo: 'Torna in bozza', fn: () => tornaInBozza(f) } : null,
        scrive() && f.stato === 'pronta' ? { testo: 'Segna emessa senza XML', fn: () => segnaEmessa(f) } : null,
        scrive() && f.stato === 'emessa' && !nota ? { testo: 'Prepara una nota di credito', fn: () => notaCredito(f) } : null,
        scrive() && f.stato === 'pronta' ? '-' : null,
        scrive() && f.stato === 'pronta' ? { testo: 'Scarta', pericolo: true, fn: () => scarta(f, () => { chiudiPannello(); W.disegnaPagina(); }) } : null,
      ].filter(Boolean);
      if (voci[voci.length - 1] === '-') voci.pop();
      const altro = h('button', { type: 'button', class: 'tondo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 20));
      altro.addEventListener('click', () => apriMenu(altro, voci));
      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'dove spazio' }, nota ? 'Nota di credito' : 'Fattura'), altro, tondo('chiudi', 'Chiudi', chiudiPannello, 'piccolo')),
        h('div', null, pillStato(f.statoVisto)),
        h('div', { class: 'titolo-pannello' }, titolo),
        h('div', { class: 'sotto-titolo' }, [f.cliente, f.data ? (f.stato === 'emessa' || f.stato === 'annullata' ? 'del ' : 'data proposta ') + C.data(f.data) : '', !nota && scad ? 'scade il ' + C.data(scad) : ''].filter(Boolean).join(' · ')),
        f.stato === 'pronta' && f.prontaIl ? h('div', { class: 'tenue' }, 'Passata al programma il ' + C.data(String(f.prontaIl).slice(0, 10))) : null,
        avvisi, nota ? null : passiFattura(f),
        h('div', { class: 'scheda' }, schedaConti(k, f)),
        incassi, righe, sdi);
      const piede = principale ? h('div', { class: 'piede' }, principale) : null;
      const p = h('aside', { class: 'pannello pannello-fattura', 'aria-label': titolo }, corpo, piede);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    async function ricarica() {
      M.fatture = null;
      M.riepMese = null;
      W.caricaDashboard();
      W.disegnaPagina();
    }

    async function tornaInBozza(f) {
      if (!(await conferma('Tornare in bozza?', 'La ' + f.riferimento + ' torna modificabile. Fallo solo se nel programma non l\'hai emessa.', 'Torna in bozza'))) return;
      const ris = await lavora('Torno in bozza', () => Rete.post('/server/tornaInBozza', { id: f.id }));
      if (!ris) return;
      chiudiPannello();
      daRileggere();
      W.vai('#fatturazione/bozza/' + f.id);
    }

    function segnaEmessa(f) {
      const numero = h('input', { type: 'text', placeholder: 'es. 46/2026', autocomplete: 'off' });
      const data = h('input', { type: 'date', value: oggi() });
      let chiudi;
      const vai = async () => {
        if (!numero.value.trim()) { numero.focus(); avviso('Scrivi il numero che ha dato il programma', true); return; }
        const ris = await W.scriviConConferma('Segno emessa', '/server/segnaEmessa', { id: f.id, numero: numero.value.trim(), data: data.value },
          d => conferma('Il numero lo scrivi tu', d.errore, 'Segna emessa'));
        if (!ris) return;
        chiudi();
        avviso((f.tipo === 'nota' ? 'Nota di credito ' : 'Fattura ') + numero.value.trim() + ' segnata emessa');
        ricarica();
      };
      chiudi = finestra({ titolo: 'Segna emessa senza XML', corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'Il numero e la data che ha dato il tuo programma. Gli importi restano quelli della bozza finché non importi l\'XML.'),
        h('div', { class: 'riga-campi' }, campo('Numero', numero), campo('Data', data))],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Segna emessa')] });
    }

    /** Prepara una nota di credito (fase4.md §9.5): tutta o righe scelte con l'importo, il motivo, cosa torna da fatturare. */
    function notaCredito(f) {
      const righe = (f.righe || []).filter(r => r.tipo !== 'bollo');
      const scelte = new Map();
      let tutta = true;
      const motivo = h('input', { type: 'text', autocomplete: 'off' });
      const zona = h('div', { class: 'fila' });
      let chiudi;
      const tornano = () => {
        const gruppi = {};
        righe.forEach(r => { if (r.gruppo) (gruppi[r.gruppo] = gruppi[r.gruppo] || []).push(r); });
        const sorg = g => (f.sorgenti || []).filter(s => s.attiva && s.gruppo === g).map(s => s.descrizione);
        if (tutta) return Array.from(new Set((f.sorgenti || []).filter(s => s.attiva).map(s => s.descrizione)));
        const out = [];
        Object.keys(gruppi).forEach(g => {
          const intere = gruppi[g].every(r => scelte.has(r.id) && Math.abs(C.num(scelte.get(r.id)) - C.num(r.importo)) < 0.005);
          if (intere) out.push(...sorg(g));
        });
        return out;
      };
      const disegna = () => {
        svuota(zona);
        aggiungi(zona, [segmenti([['tutta', 'Tutta la fattura'], ['righe', 'Righe scelte']], tutta ? 'tutta' : 'righe', x => { tutta = x === 'tutta'; disegna(); })]);
        if (!tutta) {
          aggiungi(zona, [h('div', { class: 'scheda righe' }, righe.map(r => {
            const si = scelte.has(r.id);
            const imp = h('input', { type: 'text', inputmode: 'decimal', class: 'num-riga importo-storno', value: si ? C.numero(scelte.get(r.id)) : C.numero(r.importo), disabled: !si, 'aria-label': 'Importo da stornare',
              onchange: e => { const v = RF.leggiImporto(e.target.value); scelte.set(r.id, v === null ? r.importo : Math.min(v, r.importo)); disegna(); } });
            return h('div', { class: 'riga' }, h('input', { type: 'checkbox', class: 'casella-df', checked: si, 'aria-label': 'Storna la riga', onclick: e => { if (e.target.checked) scelte.set(r.id, r.importo); else scelte.delete(r.id); disegna(); } }),
              h('span', { class: 'corpo' }, h('span', { class: 't1 piccolo-15' }, r.descrizione), h('span', { class: 't2' }, 'era ' + euro(r.importo))), imp);
          }))]);
        }
        const t = tornano();
        aggiungi(zona, [campo('Motivo', motivo), t.length ? h('div', { class: 'mancano-bozza calma' }, h('b', null, 'Tornano da fatturare quando la nota è emessa'), t.map(x => h('span', null, x))) : h('div', { class: 'tenue' }, 'Non torna niente da fatturare: si storna solo una parte.')]);
      };
      const vai = async () => {
        if (!motivo.value.trim()) { motivo.focus(); avviso('Motivo: scrivi perché la correggi', true); return; }
        const corpo = { idFattura: f.id, motivo: motivo.value.trim() };
        if (tutta) corpo.tutta = true;
        else {
          if (!scelte.size) { avviso('Scegli le righe da stornare, o tutta la fattura', true); return; }
          corpo.righe = Array.from(scelte.entries()).map(([idRiga, importo]) => { const r = righe.find(x => x.id === idRiga); return Math.abs(C.num(importo) - C.num(r.importo)) < 0.005 ? { idRiga } : { idRiga, importo }; });
        }
        const ris = await lavora('Preparo la nota di credito', () => Rete.post('/server/preparaNotaCredito', corpo));
        if (!ris || !ris.fattura) return;
        chiudi();
        chiudiPannello();
        daRileggere();
        avviso('Nota di credito ' + ris.fattura.riferimento + ' in bozza: controllala e passala al programma');
        W.vai('#fatturazione/bozza/' + ris.fattura.id);
      };
      disegna();
      chiudi = finestra({ titolo: 'Nota di credito per la fattura ' + f.numero, corpo: [zona],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Prepara la nota')] });
    }

    async function nuovaFattura() {
      const clienti = W.clientiAttivi().slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      const scelta = selezione([['', 'Scegli il cliente']].concat(clienti.map(c => [c.id, c.nome])), '', () => null);
      let chiudi;
      const vai = async () => {
        if (!scelta.value) { avviso('Scegli il cliente', true); return; }
        const ris = await lavora('Preparo la bozza', () => Rete.post('/server/nuovaFattura', { idCliente: scelta.value }));
        if (!ris || !ris.fattura) return;
        chiudi();
        daRileggere();
        W.vai('#fatturazione/bozza/' + ris.fattura.id);
      };
      chiudi = finestra({ titolo: 'Nuova fattura', corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'Una bozza vuota, con le righe da scrivere. Quello che è già pronto da fatturare si prepara da Da fatturare.'), campo('Cliente', scelta)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Prepara la bozza')] });
    }

    // ===================================================================== IMPORTA XML

    /** Legge un File del browser come {nome, base64}. */
    function leggiFile(file) {
      return new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => { const s = String(r.result || ''); ok({ nome: file.name, base64: s.slice(s.indexOf(',') + 1), dim: file.size }); };
        r.onerror = () => no(new Error('Non riesco a leggere ' + file.name));
        r.readAsDataURL(file);
      });
    }

    /** I file trascinati, anche dentro una cartella (si aprono le cartelle, non gli zip: quelli li apre il server). */
    async function fileTrascinati(dt) {
      const out = [];
      const voci = Array.from(dt.items || []).map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
      if (!voci.length) return Array.from(dt.files || []);
      const leggiCartella = dir => new Promise(ok => {
        const lettore = dir.createReader();
        const tutte = [];
        const giro = () => lettore.readEntries(lotto => { if (!lotto.length) ok(tutte); else { tutte.push(...lotto); giro(); } }, () => ok(tutte));
        giro();
      });
      const visita = async e => {
        if (out.length > 400) return;
        if (e.isFile) out.push(await new Promise(ok => e.file(ok, () => ok(null))));
        else if (e.isDirectory) for (const x of await leggiCartella(e)) await visita(x);
      };
      for (const e of voci) await visita(e);
      return out.filter(Boolean);
    }

    /**
     * Importa XML (fase4.md §13.3, architettura.md §15.7): si trascinano file o una cartella
     * (anche zip) o si scelgono; il server legge senza cambiare niente (leggiXml) e propone;
     * la tabella "Cosa ho trovato" mostra la proposta con la certezza; niente si abbina senza
     * una scelta: le sicure sono già scelte, le altre aspettano un clic riga per riga.
     */
    function importaXml() {
      if (!scrive()) return;
      let chiudi;
      const corpo = h('div', { class: 'corpo-f' });
      const piede = h('div', { class: 'piede-f' });
      const contenuto = h('div', null, h('div', { class: 'testa-f' }, h('h2', null, 'Importa XML'), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')), corpo, piede);
      chiudi = finestra({ contenuto, larghezza: 'larga', titolo: 'Importa XML', fuoco: false });

      const leggi = async file => {
        if (!file.length) return;
        const pesanti = file.reduce((a, x) => a + (x.dim || (x.base64 || '').length * 0.75), 0);
        if (pesanti > 30 * 1024 * 1024) { avviso('File troppo grandi: al massimo 30 MB per volta', true); return; }
        const ris = await lavora('Leggo i file', () => Rete.post('/server/leggiXml', { file: file.map(x => ({ nome: x.nome, base64: x.base64 })) }));
        if (ris) mostraLettura(ris, file.length);
      };

      const scegli = async () => {
        const r = await Rete.post('/locale/scegli-file', { filtro: 'fatture', piu: true }).catch(e => { avviso(e.message, true); return null; });
        if (!r || !r.ok) return;
        leggi(r.file || [{ nome: r.nome, base64: r.base64 }]);
      };

      const zonaDrop = h('div', { class: 'zona-xml', role: 'button', tabindex: '0', onclick: scegli, onkeydown: e => { if (e.key === 'Enter') scegli(); } },
        icona('importa', 30, 2), h('b', null, 'Trascina qui i file o una cartella'), h('span', { class: 'tenue' }, '.xml, .p7m, .zip · fino a 300 file'),
        h('span', { class: 'btn' }, 'Scegli i file'));
      zonaDrop.addEventListener('dragover', e => { e.preventDefault(); zonaDrop.classList.add('accoglie'); });
      zonaDrop.addEventListener('dragleave', () => zonaDrop.classList.remove('accoglie'));
      zonaDrop.addEventListener('drop', async e => {
        e.preventDefault();
        zonaDrop.classList.remove('accoglie');
        try {
          const file = await fileTrascinati(e.dataTransfer);
          leggi(await Promise.all(file.map(leggiFile)));
        } catch (x) { avviso(x.message, true); }
      });
      aggiungi(corpo, [zonaDrop, h('p', { class: 'tenue', style: { margin: 0 } }, 'Fatture emesse dal tuo programma, note di credito, fatture ricevute dai fornitori ed esiti dello SDI.')]);

      function mostraLettura(ris, nFile) {
        const docs = (ris.documenti || []).map(d => Object.assign({}, d, {
          scelta: RF.sceltaIniziale(d),
          idFattura: d.proposta && d.proposta.idFattura ? d.proposta.idFattura : null,
          collega: new Set(((d.proposta && d.proposta.collegabili) || []).filter(c => c.spuntato).map(c => c.gruppo)),
          libera: new Set((d.proposta && d.proposta.libera) || []),
          creaCliente: !(d.controparte && d.controparte.idSoggetto),
          idCliente: d.controparte && d.controparte.idSoggetto ? d.controparte.idSoggetto : '',
          categoria: (d.proposta && d.proposta.categoria) || 'altro',
          idSpesa: d.proposta && d.proposta.idSpesa ? d.proposta.idSpesa : null,
        }));
        const disegna = () => {
          svuota(corpo);
          svuota(piede);
          aggiungi(corpo, [h('p', { class: 'sotto-titolo', style: { margin: 0 } }, (docs.length === 1 ? '1 documento' : docs.length + ' documenti') + ' in ' + (nFile === 1 ? '1 file' : nFile + ' file') + ' · niente cambia finché non confermi')]);
          const colonne = 'minmax(0, 1.25fr) 112px minmax(0, 2fr) 120px 200px';
          const tab = h('div', { class: 'tab tab-xml' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
            h('span', null, 'Cosa'), h('span', { class: 'n' }, 'Totale'), h('span', null, 'Cosa propongo'), h('span', null, 'Certezza'), h('span', null, 'Cosa faccio')));
          docs.forEach(d => aggiungi(tab, [rigaDoc(d, colonne, disegna)]));
          if (!docs.length) aggiungi(tab, [h('p', { class: 'vuoto' }, 'Nessuna fattura nei file caricati.')]);
          aggiungi(corpo, [tab]);
          // Il motivo dello scarto si mostra com'è, con la frase del server.
          (ris.scartati || []).forEach(s => aggiungi(corpo, [h('div', { class: 'scartato-xml' }, h('b', null, 'Scartato ' + s.nomeFile + ': '), s.motivo)]));
          const n = docs.filter(d => d.scelta && d.scelta !== 'salta').length;
          aggiungi(piede, [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Annulla'),
            h('button', { type: 'button', class: 'btn giallo grande', onclick: () => confermaLettura(ris, docs) }, 'Conferma (' + n + ')')]);
        };
        disegna();
      }

      function rigaDoc(d, colonne, ridisegna) {
        const p = d.proposta || {};
        const k = d.conti || {};
        const certezza = RF.pillolaCertezza(d);
        const tipoNome = d.tipo === 'esito' ? 'Esito dello SDI' : d.tipo === 'ricevuta' ? (d.tipoDocumento === 'TD04' ? 'Nota di credito ricevuta ' : 'Fattura ricevuta ') + (d.numero || '')
          : (d.tipoDocumento === 'TD04' ? 'Nota di credito ' : 'Fattura ') + (d.numero || '');
        const cosa = h('span', { class: 'cosa-xml' }, h('b', null, tipoNome), h('span', null, d.tipo === 'esito' ? (d.nomeFileFattura || '') : (d.controparte && d.controparte.nome) || ''), h('span', { class: 'nome-file' }, d.nomeFile || ''));
        const proposta = h('div', { class: 'proposta-xml' });
        const testoScelta = { abbina: d.tipo === 'esito' ? 'Segna l\'esito' : 'Abbina alla ' + (riferimentoDi(d) || 'bozza'), senzaBozza: 'Registra senza bozza', nuova: 'Aggiungi alle ricevute', salta: 'Salta' };
        // Cosa propongo
        if (d.tipo === 'esito') {
          aggiungi(proposta, [h('b', null, p.azione === 'abbina' ? ({ consegnata: 'Consegnata', non_consegnata: 'Non consegnata (vale lo stesso)', scartata: 'Scartata dallo SDI: torna pronta' }[d.esito] || d.esito) + ': la segno sulla fattura ' + (p.numero || p.riferimento || '') : 'Esito per un file che Wisper non ha: lo salto')]);
          (d.errori || []).forEach(x => aggiungi(proposta, [h('span', { class: 'rosso-testo' }, x.descrizione || x.codice)]));
        } else if (d.tipo === 'ricevuta') {
          const scad = (d.scadenze || [])[0];
          aggiungi(proposta, [h('b', null, p.azione === 'gia' ? 'Già importata: la salto' : 'La aggiungo alle fatture ricevute' + (scad ? ', da pagare entro il ' + giornoBreve(scad.data) : '')),
            d.fornitoreNuovo && d.scelta === 'nuova' ? h('span', { class: 'tenue' }, 'Fornitore nuovo: lo creo dai dati dell\'XML') : null,
            d.scelta === 'nuova' ? h('label', { class: 'campo-in-riga' }, h('span', null, 'Categoria'), selezione([['materiale', 'Materiale'], ['consulenze', 'Consulenze'], ['servizi', 'Servizi'], ['utenze', 'Utenze'], ['affitto', 'Affitto'], ['altro', 'Altro']], d.categoria, x => { d.categoria = x; })) : null,
            p.idSpesa && d.scelta === 'nuova' ? h('label', { class: 'spunta-campo piccola' }, h('input', { type: 'checkbox', checked: !!d.idSpesa, onchange: e => { d.idSpesa = e.target.checked ? p.idSpesa : null; } }), 'Collegala alla spesa già fotografata') : null]);
        } else if (p.azione === 'gia') {
          aggiungi(proposta, [h('b', null, (d.avvisi && d.avvisi[0] ? d.avvisi[0].replace(/\.$/, '') : 'Già importata') + ': la salto')]);
        } else {
          const rif = riferimentoDi(d);
          const testi = {
            certa: 'È la ' + rif + ': ho trovato «Rif. Wisper ' + rif + '»',
            probabile: 'Probabilmente è la ' + rif + ': stesso cliente e stesso totale',
            diversa: 'Somiglia alla ' + rif + ', ma gli importi sono diversi',
            nessuna: d.fatturaCollegata ? 'Nota di credito per la fattura ' + d.fatturaCollegata.numero + ', senza bozza in Wisper' : 'Fatta fuori da Wisper: nessuna bozza combacia',
          };
          aggiungi(proposta, [h('b', null, testi[p.certezza] || testi.nessuna)]);
          if ((p.alternative || []).length && d.scelta === 'abbina') {
            aggiungi(proposta, [h('label', { class: 'campo-in-riga' }, h('span', null, 'Bozza'), selezione([[p.idFattura, p.riferimento]].concat(p.alternative.map(a => [a.idFattura || a.id, a.riferimento])), d.idFattura, x => { d.idFattura = Number(x); ridisegna(); }))]);
          }
          if (p.certezza === 'diversa' && (p.differenze || []).length) {
            const NOMI = { totale: 'Totale', compenso: 'Compenso', contributo: 'Contributo', iva: 'IVA', ritenuta: 'Ritenuta', anticipazioni: 'Spese anticipate', bollo: 'Bollo' };
            aggiungi(proposta, [h('div', { class: 'differenze' }, h('span', { class: 'etichetta' }, 'Bozza'), h('span', { class: 'etichetta' }, 'XML'), h('span'),
              p.differenze.map(x => [h('span', null, euro(x.bozza)), h('span', null, euro(x.xml)), h('span', { class: 'tenue' }, NOMI[x.campo] || x.campo)]))]);
            if ((p.righeMancanti || []).length && d.scelta === 'abbina') {
              const gruppi = Array.from(new Set(p.righeMancanti.map(r => r.gruppo).filter(Boolean)));
              aggiungi(proposta, [h('span', { class: 'etichetta' }, 'Tornano da fatturare'),
                gruppi.filter(g => (p.libera || []).indexOf(g) >= 0).map(g => h('label', { class: 'spunta-campo piccola' },
                  h('input', { type: 'checkbox', checked: d.libera.has(g), onchange: e => { if (e.target.checked) d.libera.add(g); else d.libera.delete(g); } }),
                  p.righeMancanti.filter(r => r.gruppo === g).map(r => r.descrizione + ' · ' + euro(r.importo)).join('; '))),
                p.righeMancanti.some(r => !r.gruppo || (p.libera || []).indexOf(r.gruppo) < 0) ? h('span', { class: 'tenue' }, 'Le altre righe mancanti restano fatturate: la parte che manca si fattura con una riga libera.') : null]);
            }
          }
          if ((d.scelta === 'senzaBozza' || (!d.scelta && p.azione === 'senzaBozza')) && d.tipoDocumento !== 'TD04') {
            if (d.clienteNuovo || !(d.controparte && d.controparte.idSoggetto)) {
              const clienti = W.clientiAttivi();
              aggiungi(proposta, [h('label', { class: 'campo-in-riga' }, h('span', null, 'Cliente'), selezione([['', 'Nuovo: lo creo dai dati dell\'XML']].concat(clienti.map(c => [c.id, c.nome])), d.creaCliente ? '' : d.idCliente,
                x => { d.creaCliente = !x; d.idCliente = x; }))]);
            }
            if ((p.collegabili || []).length) {
              aggiungi(proposta, [h('span', { class: 'etichetta' }, 'Era da fatturare in Wisper?'),
                p.collegabili.map(c => h('label', { class: 'spunta-campo piccola collegabile' }, h('input', { type: 'checkbox', checked: d.collega.has(c.gruppo), onchange: e => { if (e.target.checked) d.collega.add(c.gruppo); else d.collega.delete(c.gruppo); } }),
                  h('span', null, h('b', null, c.titolo + ' · ' + euro(c.importo)), c.spuntato ? h('span', { class: 'tenue' }, ' Stessi importi del compenso: spuntato, esce da Da fatturare') : null)))]);
            }
          }
          if (d.tipoDocumento === 'TD04' && (p.gruppiFattura || []).length) {
            aggiungi(proposta, [h('span', { class: 'etichetta' }, 'Cosa torna da fatturare?'),
              p.gruppiFattura.map(g => h('label', { class: 'spunta-campo piccola' }, h('input', { type: 'checkbox', checked: d.libera.has(g.gruppo), onchange: e => { if (e.target.checked) d.libera.add(g.gruppo); else d.libera.delete(g.gruppo); } }),
                (g.descrizione || g.gruppo) + ' · ' + euro(g.importo)))]);
          }
        }
        (d.avvisi || []).filter(a => p.azione !== 'gia').forEach(a => aggiungi(proposta, [h('span', { class: 'avviso-xml' }, a)]));

        // Cosa faccio: un pulsante che apre le scelte possibili.
        const opzioni = [];
        if (d.tipo === 'esito') { if (p.azione === 'abbina') opzioni.push('abbina'); opzioni.push('salta'); }
        else if (d.tipo === 'ricevuta') { if (p.azione !== 'gia') opzioni.push('nuova'); opzioni.push('salta'); }
        else if (p.azione === 'gia') opzioni.push('salta');
        else { if (p.idFattura) opzioni.push('abbina'); opzioni.push('senzaBozza', 'salta'); }
        const btn = h('button', { type: 'button', class: 'btn piccolo scelta-xml' + (d.scelta ? '' : ' da-scegliere'), 'aria-haspopup': 'menu' }, d.scelta ? testoScelta[d.scelta] : 'Scegli cosa fare', icona('giu', 16, 2.4));
        btn.addEventListener('click', () => apriMenu(btn, opzioni.map(x => ({ testo: testoScelta[x], scelta: d.scelta === x, fn: () => { d.scelta = x; ridisegna(); } }))));
        return h('div', { class: 'r riga-xml' + (d.scelta && d.scelta !== 'salta' ? ' scelta' : ''), style: { gridTemplateColumns: colonne } },
          cosa, h('span', { class: 'n forte' }, d.tipo === 'esito' ? '' : euro(k.totale)), proposta, h('span', null, pillola(certezza.testo, certezza.colore)), h('span', null, btn));
      }

      function riferimentoDi(d) {
        const p = d.proposta || {};
        if (!d.idFattura || d.idFattura === p.idFattura) return p.riferimento || '';
        const alt = (p.alternative || []).find(a => (a.idFattura || a.id) === d.idFattura);
        return alt ? alt.riferimento : p.riferimento || '';
      }

      async function confermaLettura(ris, docs) {
        const scelte = docs.filter(d => d.scelta && d.scelta !== 'salta').map(d => {
          const s = { chiave: d.chiave, azione: d.scelta };
          const p = d.proposta || {};
          if (d.scelta === 'abbina' && d.idFattura) s.idFattura = d.idFattura;
          if (d.scelta === 'abbina' && d.libera.size) s.libera = Array.from(d.libera);
          if (d.scelta === 'senzaBozza') {
            if (d.tipoDocumento !== 'TD04') {
              if (d.creaCliente) s.creaCliente = true; else if (d.idCliente) s.idCliente = d.idCliente;
              const voci = [];
              (p.collegabili || []).forEach(c => { if (d.collega.has(c.gruppo)) voci.push(...(c.voci || [])); });
              if (voci.length) s.collega = voci;
            } else if (d.libera.size) s.libera = Array.from(d.libera);
          }
          if (d.tipo === 'ricevuta') {
            s.categoria = d.categoria;
            if (d.idSpesa) s.idSpesa = d.idSpesa;
          }
          return s;
        });
        if (!scelte.length) { avviso('Scegli cosa fare con almeno un documento', true); return; }
        const r = await lavora('Confermo', () => Rete.post('/server/confermaXml', { idLettura: ris.idLettura, scelte }));
        if (!r) return;
        chiudi();
        const c = r.conteggi || {};
        const parti = [[c.abbinate, 'abbinata', 'abbinate'], [c.nuove, 'senza bozza', 'senza bozza'], [c.ricevute, 'ricevuta', 'ricevute'], [c.note, 'nota di credito', 'note di credito'], [c.esiti, 'esito', 'esiti']]
          .filter(x => x[0]).map(x => x[0] + ' ' + (x[0] === 1 ? x[1] : x[2]));
        avviso('Fatto: ' + (parti.join(', ') || 'niente di nuovo') + (c.saltate ? ', ' + c.saltate + (c.saltate === 1 ? ' saltata' : ' saltate') : ''));
        (r.avvisi || []).forEach(a => avviso(a, false, 8000));
        daRileggere();
        await W.rileggiRapportini();
        W.caricaDashboard();
        if (M.aperta) chiudiPannello();
        W.disegnaPagina();
      }
    }

    // ===================================================================== RICEVUTE

    function paginaRicevute(pagina, filtro) {
      aggiungi(pagina, [testataFatt('Fatture ricevute', [scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => moduloRicevuta(null) }, 'Nuova ricevuta senza XML') : null,
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => importaXml() }, icona('importa', 18, 2.4), 'Importa XML') : null]), fasciaRegole(), segmentiFatt('ricevute')]);
      conDati(pagina, () => Promise.all([Rete.get('/server/ricevute?stato=tutte').then(r => { M.ricevute = r; }), leggiConti()]), () => {
        const lista = (M.ricevute && M.ricevute.ricevute) || [];
        if (!lista.length) { aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Nessuna fattura ricevuta.')]); return; }
        const colonne = 'minmax(0, 1.6fr) 110px 64px 112px 100px 112px 60px 150px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
          h('span', null, 'Fornitore'), h('span', null, 'Numero'), h('span', null, 'Data'), h('span', { class: 'n' }, 'Totale'), h('span', { class: 'n' }, 'Ritenuta'),
          h('span', { class: 'n' }, 'Da pagare'), h('span', null, 'Scade'), h('span', null, 'Stato')));
        lista.forEach(x => {
          const scad = (x.scadenze || []).find(s => C.num(s.coperta) < C.num(s.importo) - 0.004) || (x.scadenze || [])[0];
          aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: colonne }, role: 'button', tabindex: '0', onclick: () => moduloRicevuta(x), onkeydown: e => { if (e.key === 'Enter') moduloRicevuta(x); } },
            h('span', { class: 'doppia' }, h('span', null, x.fornitore), h('span', null, [CATEGORIE[x.categoria] || '', x.idCommessa || ''].filter(Boolean).join(' · '))),
            h('span', { class: 'taglia' }, x.numero), h('span', null, giornoBreve(x.data)), h('span', { class: 'n' }, euro(x.totale)),
            h('span', { class: 'n t2' }, C.num(x.ritenuta) ? euro(x.ritenuta) : '—'), h('span', { class: 'n forte' }, euro(x.daPagare)),
            h('span', { class: x.scaduta ? 'rosso-testo' : '' }, scad ? giornoBreve(scad.data) : ''), h('span', null, pillStato(x.statoVisto), x.scadenzaStimata ? h('span', { class: 'pill piccola p-giallo', title: 'Scadenza non scritta nella fattura: messa a 30 giorni' }, 'stimata') : null))]);
        });
        aggiungi(pagina, [tab]);
        if (filtro && filtro.apri) { const x = lista.find(r => String(r.id) === String(filtro.apri)); if (x) moduloRicevuta(x); }
      });
    }

    const CATEGORIE = { materiale: 'Materiale', consulenze: 'Consulenze', servizi: 'Servizi', utenze: 'Utenze', affitto: 'Affitto', altro: 'Altro' };

    /** Una fattura ricevuta: i conti, categoria e commessa, Segna pagata (giallo). Senza id: una ricevuta scritta a mano. */
    function moduloRicevuta(x0) {
      const nuova = !x0;
      const x = x0 ? JSON.parse(JSON.stringify(x0)) : { idFornitore: '', numero: '', data: oggi(), totale: '', imponibile: '', iva: '', ritenuta: '', categoria: 'materiale', idCommessa: '', descrizione: '', note: '', scadenze: [] };
      const daXml = x.origine === 'xml';
      const sola = !scrive() || x.stato === 'annullata';
      let chiudi;
      const zona = h('div', { class: 'fila' });
      const v = {
        fornitore: selezione([['', 'Scegli il fornitore']].concat(S.ana.fornitori.filter(f => !f.archiviato).map(f => [f.id, f.nome])), x.idFornitore, val => { x.idFornitore = val; }, { disabled: sola || !nuova }),
        numero: h('input', { type: 'text', value: x.numero || '', disabled: sola || !nuova }),
        data: h('input', { type: 'date', value: x.data || oggi(), disabled: sola || !nuova }),
        totale: h('input', { type: 'text', inputmode: 'decimal', value: x.totale !== '' ? C.numero(x.totale) : '', disabled: sola || !nuova }),
        imponibile: h('input', { type: 'text', inputmode: 'decimal', value: x.imponibile !== '' && x.imponibile !== undefined ? C.numero(x.imponibile) : '', disabled: sola || !nuova }),
        iva: h('input', { type: 'text', inputmode: 'decimal', value: x.iva !== '' && x.iva !== undefined ? C.numero(x.iva) : '', disabled: sola || !nuova }),
        ritenuta: h('input', { type: 'text', inputmode: 'decimal', value: C.num(x.ritenuta) ? C.numero(x.ritenuta) : '', disabled: sola || !nuova }),
        scadenza: h('input', { type: 'date', value: (x.scadenze[0] && x.scadenze[0].data) || '', disabled: sola || (daXml && !x.scadenzaStimata) || (!nuova && !x.scadenzaStimata) }),
        descrizione: h('input', { type: 'text', value: x.descrizione || '', disabled: sola || !nuova }),
        note: h('textarea', { rows: 2, disabled: sola }),
      };
      v.note.value = x.note || '';
      const commesse = S.ana.commesse.filter(m => !m.archiviata && !m.modello);
      const disegna = () => {
        svuota(zona);
        if (!nuova) {
          aggiungi(zona, [h('div', { class: 'pillole-testa' }, pillStato(x.statoVisto), x.origine === 'xml' ? pillola('Dall\'XML', 'grigio') : pillola('Scritta a mano', 'grigio'), x.scadenzaStimata ? pillola('Scadenza stimata', 'giallo') : null),
            h('div', { class: 'scheda conti-fattura conti-ricevuta' },
              [['Imponibile', x.imponibile], ['IVA', x.iva], ['Contributo', x.contributo], ['Bollo', x.bollo]].filter(r => C.num(r[1])).map(r => h('div', { class: 'rc' }, h('span', null, r[0]), h('span', null, euro(r[1])))),
              h('div', { class: 'rc-totale' }, h('span', null, 'Totale della fattura'), h('b', null, euro(x.totale))),
              C.num(x.ritenuta) ? h('div', { class: 'rc' }, h('span', null, 'Ritenuta (la versi tu con l\'F24, codice 1040)'), h('span', null, meno(x.ritenuta))) : null,
              h('div', { class: 'rc-netto' }, h('span', null, 'Da pagare'), h('b', null, euro(x.daPagare)))),
            (x.pagamenti || []).length ? h('div', { class: 'scheda righe' }, x.pagamenti.map(p => riga({ sinistra: quadrato('uscita', 'ico-grigio'), titolo: euro(p.importo), sotto: C.data(p.data) + (p.conto ? ' · ' + p.conto : ''), destra: pillStato(p.verificato ? 'Verificato in banca' : 'Registrato') }))) : null]);
        }
        if (nuova) {
          aggiungi(zona, [campo('Fornitore', v.fornitore), h('div', { class: 'riga-campi' }, campo('Numero', v.numero), campo('Data', v.data)),
            h('div', { class: 'riga-campi' }, campo('Totale', v.totale), campo('Imponibile', v.imponibile), campo('IVA', v.iva), campo('Ritenuta', v.ritenuta)),
            campo('Di cosa', v.descrizione)]);
        }
        aggiungi(zona, [h('div', { class: 'campo' }, h('label', null, 'Categoria'), h('div', { class: 'pillole' }, Object.keys(CATEGORIE).map(c => h('button', { type: 'button', class: 'pillola' + (x.categoria === c ? ' scelta' : ''), disabled: sola,
          'aria-pressed': x.categoria === c ? 'true' : 'false', onclick: () => { x.categoria = c; disegna(); } }, CATEGORIE[c])))),
        h('div', { class: 'riga-campi' }, campo('Commessa', selezione([['', 'Nessuna']].concat(commesse.map(m => [m.id, m.id + ' · ' + m.descrizione])), x.idCommessa || '', val => { x.idCommessa = val; }, { disabled: sola })),
          nuova || x.scadenzaStimata ? campo('Scadenza', v.scadenza) : null),
        campo('Note', v.note)]);
      };
      disegna();
      const salva = async () => {
        const r = {
          idFornitore: x.idFornitore, numero: v.numero.value.trim(), data: v.data.value, totale: RF.leggiImporto(v.totale.value), categoria: x.categoria, idCommessa: x.idCommessa || '', note: v.note.value,
        };
        if (!nuova) Object.assign(r, { id: x.id, idFornitore: x.idFornitore, numero: x.numero, data: x.data, totale: x.totale });
        if (nuova) {
          if (v.imponibile.value.trim()) r.imponibile = RF.leggiImporto(v.imponibile.value);
          if (v.iva.value.trim()) r.iva = RF.leggiImporto(v.iva.value);
          if (v.ritenuta.value.trim()) r.ritenuta = RF.leggiImporto(v.ritenuta.value);
          r.descrizione = v.descrizione.value.trim();
        }
        if ((nuova || x.scadenzaStimata) && v.scadenza.value) {
          const netto = nuova ? Math.round((C.num(r.totale) - C.num(r.ritenuta)) * 100) / 100 : C.num(x.netto);
          if (nuova || v.scadenza.value !== ((x.scadenze[0] && x.scadenze[0].data) || '')) r.scadenze = [{ data: v.scadenza.value, importo: netto }];
        }
        const ris = await lavora('Salvo la ricevuta', () => Rete.post('/server/salvaRicevuta', { ricevuta: r }));
        if (!ris) return;
        chiudi();
        avviso(nuova ? 'Fattura ricevuta aggiunta' : 'Ricevuta salvata');
        M.ricevute = null;
        W.disegnaPagina();
      };
      const annulla = async () => {
        const campoMotivo = h('input', { type: 'text' });
        let chiudi2;
        chiudi2 = finestra({ titolo: 'Annullare la ricevuta?', corpo: [h('p', { style: { margin: 0, fontSize: '16px' } }, 'Non si cancella: resta nell\'archivio, segnata come annullata, e non conta più nei pagamenti.'), campo('Perché', campoMotivo)],
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi2() }, 'Lascia'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: async () => {
            const r = await lavora('Annullo', () => Rete.post('/server/annullaRicevuta', { id: x.id, motivo: campoMotivo.value.trim() }));
            if (!r) return;
            chiudi2(); chiudi(); M.ricevute = null; avviso('Ricevuta annullata'); W.disegnaPagina();
          } }, 'Annulla la ricevuta')] });
      };
      const altro = !nuova && scrive() && x.stato !== 'annullata' ? h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18)) : null;
      if (altro) altro.addEventListener('click', () => apriMenu(altro, [x.file ? { testo: 'XML ricevuto', fn: () => W.apriFile({ id: x.file.id, nome: x.file.nome }) } : null, { testo: 'Annulla la ricevuta', pericolo: true, fn: annulla }]));
      const pagabile = !nuova && scriveBanche() && x.stato !== 'annullata' && C.num(x.daPagare) > 0.004;
      chiudi = finestra({
        titolo: nuova ? 'Nuova fattura ricevuta' : x.fornitore + ' · fattura ' + x.numero, testaExtra: altro, corpo: [zona],
        pulsanti: sola ? ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] : ['spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande' + (pagabile ? '' : ' giallo'), onclick: salva }, 'Salva'),
          pagabile ? h('button', { type: 'button', class: 'btn grande giallo', onclick: () => { chiudi(); W.Banche.segnaPagamento({ ricevuta: x }, () => { M.ricevute = null; W.disegnaPagina(); }); } }, 'Segna pagata') : null],
      });
    }

    // ===================================================================== SCADENZE DI PAGAMENTO

    function paginaScadenze(pagina) {
      aggiungi(pagina, [testataFatt('Scadenze di pagamento', null), fasciaRegole(), segmentiFatt('scadenze')]);
      conDati(pagina, () => Rete.get('/server/scadenzePagamento').then(r => { M.scadenze = r; }), () => {
        const commesse = (M.scadenze && M.scadenze.commesse) || [];
        if (!commesse.length) { aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Nessuna commessa con le scadenze di pagamento del contratto.')]); return; }
        commesse.forEach(m => {
          const tab = h('div', { class: 'tab' }, h('button', { type: 'button', class: 'r testa-commessa', onclick: () => W.vai('#commesse/' + encodeURIComponent(m.idCommessa)) },
            h('span', { class: 'codice' }, m.idCommessa), h('b', { class: 'spazio' }, m.commessa + ' · ' + m.cliente),
            h('span', { class: 'forte' }, euro(m.fatturato) + ' fatturati su ' + euro(m.contratto))));
          (m.scadenze || []).forEach(s => {
            const parola = RF.parolaScadenzaPagamento(s);
            aggiungi(tab, [h('div', { class: 'r' + (s.idFattura ? ' cliccabile' : ''), style: { gridTemplateColumns: 'minmax(0, 2fr) 160px 120px 220px' },
              onclick: s.idFattura ? () => (s.stato === 'in_bozza' && /^W-/.test(s.fattura || '') ? W.vai('#fatturazione/bozza/' + s.idFattura) : apriDaElenco(s.idFattura)) : null },
            h('span', null, s.descrizione), h('span', { class: 't2' }, s.quando === 'data' ? (s.data ? 'il ' + C.data(s.data) : 'a una data') : (QUANDO[s.quando] || '').toLowerCase()),
            h('span', { class: 'n' }, euro(s.importo)), h('span', null, pillola(parola, s.stato === 'prevista' ? 'grigio' : RF.coloreStato(parola))))]);
          });
          aggiungi(pagina, [tab]);
        });
      });
    }

    // ===================================================================== RIEPILOGO

    function paginaRiepilogo(pagina) {
      const anno = M.anno;
      const sposta = d => { M.anno = anno + d; M.riep = null; W.disegnaPagina(); };
      aggiungi(pagina, [h('div', { class: 'testata alta' },
        h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Fatturazione'),
          h('div', { class: 'titolo-mese' }, h('h1', null, 'Riepilogo del ' + anno), tondo('indietro', 'Anno prima', () => sposta(-1)), tondo('avanti', 'Anno dopo', () => sposta(1)))),
        h('div', { class: 'azioni-testa' }, h('button', { type: 'button', class: 'btn', onclick: () => W.esporta('riepilogo', { anno, per: M.per }) }, icona('scarica', 18, 2.4), 'Esporta'))),
      fasciaRegole(), segmentiFatt('riepilogo')]);
      let mesi = null;
      let per = null;
      conDati(pagina, () => Promise.all([
        Rete.get('/server/riepilogoFatturato?anno=' + anno + '&per=mese').then(r => { mesi = r; }),
        Rete.get('/server/riepilogoFatturato?anno=' + anno + '&per=' + M.per).then(r => { per = r; }),
      ]), () => {
        aggiungi(pagina, [h('div', { class: 'tre-colonne' },
          W.riquadro('Fatturato nel ' + anno, euro(mesi.fatturato), 'compenso delle fatture emesse, meno le note'),
          W.riquadro('Incassato nel ' + anno, euro(mesi.incassato), 'movimenti abbinati alle fatture'),
          W.riquadro('Fatture emesse', String((mesi.totali && mesi.totali.fatture) || 0), null))]);
        const righe = mesi.righe || [];
        const massimo = Math.max(1, ...righe.map(r => Math.max(C.num(r.compenso), C.num(r.incassato))));
        const grafico = h('div', { class: 'scheda grafico-mesi' }, h('div', { class: 'legenda' }, h('span', null, h('i', { class: 'col-fatturato' }), 'Fatturato (compenso)'), h('span', null, h('i', { class: 'col-incassato' }), 'Incassato')),
          h('div', { class: 'barre-mesi' }, righe.map(r => h('button', { type: 'button', class: 'mese-barre', title: r.nome + ': fatturato ' + euro(r.compenso) + ', incassato ' + euro(r.incassato) + ' · apri i rapportini del mese',
            onclick: () => W.vaiARapportini({ mese: r.chiave }) },
          h('span', { class: 'coppia-barre' }, h('i', { class: 'col-fatturato', style: { height: Math.round(C.num(r.compenso) / massimo * 150) + 'px' } }), h('i', { class: 'col-incassato', style: { height: Math.round(C.num(r.incassato) / massimo * 150) + 'px' } })),
          h('span', { class: 'nome-mese' }, String(r.nome).slice(0, 3))))));
        const colonne = 'minmax(110px, 1fr) 56px 108px 108px';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } }, h('span', null, M.per === 'cliente' ? 'Cliente' : 'Commessa'), h('span', { class: 'n' }, 'Fatture'),
          h('span', { class: 'n' }, 'Fatturato'), h('span', { class: 'n' }, 'Incassato')));
        (per.righe || []).forEach(r => aggiungi(tab, [h('div', { class: 'r', style: { gridTemplateColumns: colonne }, title: 'Totale delle fatture ' + euro(r.totale) }, h('span', { class: 'taglia forte' }, r.nome || (M.per === 'commessa' ? 'Più commesse o nessuna' : r.chiave)),
          h('span', { class: 'n' }, String(r.fatture)), h('span', { class: 'n' }, euro(r.compenso)), h('span', { class: 'n' }, euro(r.incassato)))]));
        if (!(per.righe || []).length) aggiungi(tab, [h('p', { class: 'vuoto' }, 'Nessuna fattura emessa nel ' + anno + '.')]);
        aggiungi(pagina, [h('div', { class: 'due-colonne' }, grafico, h('div', { class: 'sezione' },
          segmenti([['cliente', 'Per cliente'], ['commessa', 'Per commessa']], M.per, x => { M.per = x; W.disegnaPagina(); }), tab))]);
        const colM = 'minmax(0, 1fr) 70px 120px 120px 150px';
        const tabM = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colM } }, h('span', null, 'Mese'), h('span', { class: 'n' }, 'Fatture'), h('span', { class: 'n' }, 'Fatturato'), h('span', { class: 'n' }, 'Incassato'), h('span')));
        righe.slice().reverse().forEach(r => aggiungi(tabM, [h('div', { class: 'r', style: { gridTemplateColumns: colM } }, h('span', { class: 'forte' }, r.nome.charAt(0).toUpperCase() + r.nome.slice(1)), h('span', { class: 'n' }, String(r.fatture)),
          h('span', { class: 'n' }, euro(r.compenso)), h('span', { class: 'n' }, euro(r.incassato)), h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.vaiARapportini({ mese: r.chiave }) }, 'Rapportini del mese'))]));
        aggiungi(pagina, [h('span', { class: 'etichetta' }, 'Mese per mese'), tabM]);
      });
    }

    return { vista, M, daRileggere, incorporaDaFatturare, apriPannello: apriDaElenco, fasciaRegole, schedaConti, importaXml };
  };
})(window);
