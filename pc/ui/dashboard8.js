/*
 * Wisper Ufficio: la Dashboard con le regole della fase 8 (docs/gestionale/fase8.md §8, §15.2).
 *
 * Le regole stanno nel server (una cosa una voce, ordine fisso, tetti, raggruppamenti): qui si mostrano. I quattro
 * riquadri della persona in fila, Urgenti e Questa settimana a sinistra, Da pianificare a destra, al massimo 7 · 7 · 5
 * righe con "Altre N" che apre Tutto quello che c'è da fare; in fondo Tutto quello che c'è da fare e Cambia i riquadri
 * (testi gialli scuri). Le voci informative di Da pianificare si nascondono per 30 giorni dal menu ⋯.
 * Con un server di prima (senza "riquadri") la Dashboard resta quella delle fasi 1-7 (app.js).
 */
(function (radice) {
  'use strict';

  radice.WisperDashboard8 = function (W) {
    const { S, B, Rete } = W;
    const Q = radice.WisperRegoleFase8;
    const { h, aggiungi, svuota, icona, tondo, avviso, lavora, finestra, apriMenu, segmenti, riga, quadrato, segnaposto } = B;

    const M = { tutto: null, sezione: 'urgenti', area: 'tutto' };
    const attiva = () => !!(S.dash && Array.isArray(S.dash.riquadri));

    /** Chi approva qualcosa (ore e spese, ferie, documenti): può scegliere il riquadro Da approvare. */
    function approva() {
      const i = (S.io && S.io.interfaccia) || {};
      return !!(i.puoApprovare || i.puoApprovareAssenze || i.puoApprovareDocumenti);
    }

    // ===================================================================== i quattro riquadri (§8.4)

    function riquadri() {
      const lista = (S.dash && S.dash.riquadri) || [];
      if (!lista.length) return null;
      return h('div', { class: 'quattro-num', 'data-visita': 'riquadri' }, lista.map(r => {
        const def = Q.RIQUADRI[r.chiave] || {};
        // Sotto il numero la parola minuscola, come i riquadri delle fasi 1-7 e il prototipo ("da fatturare").
        const nome = def.nome || (r.nome ? r.nome.charAt(0).toLowerCase() + r.nome.slice(1) : r.chiave);
        return h('button', { type: 'button', class: 'num-box' + (Q.rossoRiquadro(r) ? ' rosso' : ''), 'data-riquadro': r.chiave, onclick: () => toccaRiquadro(r) },
          h('b', null, Q.numeroRiquadro(r)), h('span', null, nome));
      }));
    }

    function toccaRiquadro(r) {
      const c = r.collegamento || {};
      if (r.chiave === 'daApprovare' || c.pagina === 'approvare') { foglioApprovare(); return; }
      if (r.collegamento) W.vaiA(r.collegamento);
    }

    /** "7 cose da approvare": il foglio con le tre righe, ognuna col suo numero (§8.2 punto 5). */
    function foglioApprovare(voce) {
      // La voce "7 cose da approvare" del server ha le sue righe ({nome, numero, collegamento}); dal riquadro la si cerca fra le voci.
      const daVoce = voce || [].concat((S.dash && S.dash.urgenti) || [], (S.dash && S.dash.settimana) || [], (S.dash && S.dash.pianificare) || []).find(v => v.tipo === 'approvare' && (v.righe || v.parti));
      const a = (daVoce && (daVoce.righe || daVoce.parti) && { righe: daVoce.righe || daVoce.parti, quante: daVoce.quanto }) || (S.dash && S.dash.approvare) || null;
      const righe = ((a && a.righe) || []).filter(x => x.numero === undefined || Number(x.numero) > 0);
      const quante = (a && a.quante) || righe.reduce((s, x) => s + (Number(x.n !== undefined ? x.n : x.numero) || 0), 0);
      if (!righe.length) { W.vaiA({ pagina: 'rapportini', filtro: { segmento: 'daApprovare' } }); return; }
      let chiudi;
      chiudi = finestra({ titolo: quante === 1 ? '1 cosa da approvare' : quante + ' cose da approvare', fuoco: false,
        corpo: h('div', { class: 'scheda righe interna' }, righe.map(x => riga({ sinistra: quadrato('spunta', 'ico-giallo'),
          titolo: x.testo || x.nome, sotto: x.dove || (x.numero !== undefined ? (Number(x.numero) === 1 ? '1 da approvare' : x.numero + ' da approvare') : ''),
          onclick: () => { chiudi(); W.vaiA(x.collegamento); } }))),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    // ===================================================================== le sezioni coi tetti (§8.2)

    /** Una riga della Dashboard: quella di sempre, più il ⋯ per nascondere le voci informative di Da pianificare. */
    function rigaVoce(v) {
      const r = W.rigaDashboard(v, () => apriVoce(v));
      if (!v.nascondibile) return r;
      const altro = h('button', { type: 'button', class: 'tondo piccolo altro-voce', 'aria-label': 'Altro', title: 'Altro', onclick: e => {
        e.stopPropagation();
        apriMenu(altro, [{ testo: 'Nascondi per 30 giorni', fn: () => nascondi(v) }]);
      } }, icona('altro', 18, 2.6));
      return h('div', { class: 'riga-con-altro' }, r, altro);
    }

    function nascondi(v) {
      let chiudi;
      chiudi = finestra({ titolo: 'Nascondi per 30 giorni', fuoco: false,
        corpo: [h('p', { class: 'testo-forte', style: { margin: 0 } }, v.titolo), h('span', { class: 'secondario' }, 'Torna da sola dopo 30 giorni, o da Tutto quello che c\'è da fare.')],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande', onclick: async () => {
            const r = await lavora('Nascondo', () => Rete.post('/server/nascondiVoce', { oggetto: v.oggetto, giorni: 30 }));
            if (!r) return;
            chiudi();
            M.tutto = null;
            await W.caricaDashboard();
            avviso('Nascosta per 30 giorni');
            W.ridisegna();
          } }, 'Nascondi per 30 giorni')] });
    }

    /**
     * Il corpo della Dashboard: la cosa più urgente, poi Urgenti e Questa settimana a sinistra, Da pianificare a
     * destra, al massimo 7 · 7 · 5 righe, "Altre N" sotto le sezioni con di più (il numero lo dice "quante" del server).
     */
    /** La cosa più urgente (urgenti[0] del server, piuUrgente): una scheda gialla col suo pulsante; sotto non si ripete. */
    function piuUrgente() {
      const prima = ((S.dash && S.dash.urgenti) || [])[0];
      if (!prima) return null;
      return h('div', { class: 'piu-urgente', 'data-visita': 'dashboard' },
        h('span', { class: 'etichetta' }, 'La cosa più urgente'), h('div', { class: 'titolo-urgente' }, prima.titolo),
        prima.dettaglio ? h('div', { class: 'sotto-titolo' }, prima.dettaglio) : null,
        h('button', { type: 'button', class: 'btn', onclick: () => apriVoce(prima) }, prima.azione || W.R.testoAzione(prima.collegamento)));
    }

    function corpo(contenitore, senzaPrima) {
      const urgenti = (S.dash.urgenti || []).slice();
      const quante = S.dash.quante || {};
      const prima = urgenti.shift();
      const sezione = (k, nome, lista, conPrima) => {
        const tetto = Q.TETTI[k];
        const vis = lista.slice(0, tetto);
        const totale = quante[k] !== undefined ? Number(quante[k]) : lista.length + (conPrima ? 1 : 0);
        const resto = Q.altre(vis.length + (conPrima ? 1 : 0), totale);
        if (!vis.length && !resto) return null;
        return h('div', { class: 'sezione-dash' }, h('span', { class: 'etichetta' }, nome + ' · ' + totale),
          h('div', { class: 'scheda righe' }, vis.map(rigaVoce),
            resto ? h('button', { type: 'button', class: 'riga altre-righe', onclick: () => apriTutto(k) }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Altre ' + resto)), h('span', { class: 'freccia' }, icona('freccia', 18, 2.2))) : null));
      };
      const settimana = S.dash.settimana || [];
      const pianificare = S.dash.pianificare || [];
      if (!prima && !settimana.length && !pianificare.length && !(quante.urgenti || quante.settimana || quante.pianificare)) {
        aggiungi(contenitore, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da sistemare oggi')]);
      } else {
        // Col prototipo la cosa più urgente sta in cima, sopra i riquadri (app.js la mette lì con piuUrgente()).
        const inCima = senzaPrima ? null : piuUrgente();
        aggiungi(contenitore, [h('div', { class: 'griglia-dash' },
          h('div', { class: 'colonna-dash' }, inCima, sezione('urgenti', 'Urgenti', urgenti, !!prima), sezione('settimana', 'Questa settimana', settimana)),
          h('div', { class: 'colonna-dash' }, sezione('pianificare', 'Da pianificare', pianificare)))]);
      }
      aggiungi(contenitore, [h('div', { class: 'piede-dash' },
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => apriTutto('urgenti') }, 'Tutto quello che c\'è da fare'),
        h('button', { type: 'button', class: 'btn collegamento', onclick: cambiaRiquadri }, 'Cambia i riquadri'))]);
    }

    function apriVoce(v) {
      if (v.tipo === 'approvare' && (v.righe || v.parti)) { foglioApprovare(v); return; }
      W.vaiA(v.collegamento);
    }

    function apriTutto(sezione) {
      M.sezione = sezione || 'urgenti';
      M.area = 'tutto';
      M.tutto = null;
      W.vai('#dashboard/tutto');
    }

    // ===================================================================== Tutto quello che c'è da fare (§8.5)

    function paginaTutto(pagina, filtro) {
      if (filtro && filtro.sezione) M.sezione = filtro.sezione;
      if (filtro && filtro.area) M.area = filtro.area;
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai('#dashboard')), h('span', { class: 'dove' }, 'Casa')),
        h('div', { class: 'testata' }, h('h1', null, 'Tutto quello che c\'è da fare'),
          S.dash && S.dash.riquadri ? h('button', { type: 'button', class: 'btn collegamento', onclick: cambiaRiquadri }, 'Cambia i riquadri') : null)]);
      // Il design Fai (fai.md §2): i numeri non stanno più in casa, stanno qui.
      aggiungi(pagina, [riquadri()]);
      const zona = h('div', { class: 'sezione stretta-900' }, segnaposto(4, 64));
      aggiungi(pagina, [zona]);
      const leggi = M.tutto ? Promise.resolve() : Rete.get('/server/dashboard?tutto=1').then(r => { M.tutto = r; });
      leggi.then(() => disegnaTutto(zona)).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => { M.tutto = null; W.disegnaPagina(); } }, 'Riprova'))]);
      });
    }

    function disegnaTutto(zona) {
      svuota(zona);
      const t = M.tutto || {};
      // Senza tetti né raggruppamenti: le voci di gruppo, se il server le manda, si aprono una per una.
      const piatte = lista => [].concat.apply([], (lista || []).map(v => (Array.isArray(v.voci) && v.voci.length ? v.voci : [v])));
      const per = { urgenti: piatte(t.urgenti), settimana: piatte(t.settimana), pianificare: piatte(t.pianificare) };
      const lista = per[M.sezione] || [];
      const aree = Q.AREE.filter(a => a[0] === 'tutto' || lista.some(v => v.area === a[0]));
      if (!aree.some(a => a[0] === M.area)) M.area = 'tutto';
      const visibili = lista.filter(v => M.area === 'tutto' || v.area === M.area);
      aggiungi(zona, [segmenti(Q.SEZIONI.map(([k, nome]) => [k, nome + ' · ' + per[k].length]), M.sezione, x => { M.sezione = x; M.area = 'tutto'; disegnaTutto(zona); }),
        aree.length > 2 ? h('div', { class: 'pillole' }, aree.map(([k, nome]) => h('button', { type: 'button', class: 'pillola piccola' + (M.area === k ? ' scelta' : ''), 'aria-pressed': M.area === k ? 'true' : 'false',
          onclick: () => { M.area = k; disegnaTutto(zona); } }, nome))) : null,
        visibili.length ? h('div', { class: 'scheda righe' }, visibili.map(rigaVoce)) : h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente qui')]);
      const nascoste = Number(t.nascoste !== undefined ? t.nascoste : (S.dash && S.dash.nascoste)) || 0;
      if (nascoste) {
        aggiungi(zona, [h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'corpo' }, h('b', null, 'Nascoste · ' + nascoste), h('span', { class: 't2' }, 'Tornano da sole dopo 30 giorni')),
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const r = await lavora('Un momento', () => Rete.post('/server/mostraNascoste', {}));
            if (!r) return;
            M.tutto = null;
            await W.caricaDashboard();
            W.disegnaPagina();
          } }, 'Mostrale'))]);
      }
    }

    // ===================================================================== Cambia i riquadri (§8.4)

    function cambiaRiquadri() {
      const ruolo = (S.io && S.io.utente && S.io.utente.ruolo) || '';
      const possibili = Q.riquadriPossibili(W.perm(), { ruolo, approva: approva() }, S.dash && (S.dash.riquadriDaScegliere || S.dash.riquadriPossibili));
      let scelti = ((S.dash && S.dash.riquadri) || []).map(r => r.chiave).filter(k => possibili.indexOf(k) >= 0);
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('span', { class: 'secondario' }, 'Scegline 4 · ' + scelti.length + (scelti.length === 1 ? ' scelto' : ' scelti')),
        h('div', { class: 'scelte-riquadri' }, possibili.map(k => {
          const i = scelti.indexOf(k);
          return h('button', { type: 'button', class: 'scelta-riquadro' + (i >= 0 ? ' scelta' : ''), 'aria-pressed': i >= 0 ? 'true' : 'false', 'data-riquadro': k,
            onclick: () => { scelti = Q.toccaRiquadro(scelti, k); errore = ''; disegna(); } },
          h('b', null, (Q.RIQUADRI[k] || {}).titolo || k), h('span', { class: 'ordine' }, i >= 0 ? (i + 1) + '°' : ''));
        })),
        errore ? h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errore)) : null]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Cambia i riquadri', corpo: zona, larghezza: 'media', fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            errore = Q.erroreRiquadri(scelti);
            if (errore) { disegna(); return; }
            const r = await lavora('Salvo i riquadri', () => Rete.post('/server/salvaRiquadri', { riquadri: scelti }));
            if (!r) return;
            chiudi();
            await W.caricaDashboard();
            avviso('Riquadri cambiati');
            W.ridisegna();
          } }, 'Salva i riquadri')] });
    }

    return { attiva, riquadri, piuUrgente, corpo, paginaTutto, cambiaRiquadri, foglioApprovare, apriVoce, apriTutto, M };
  };
})(window);
