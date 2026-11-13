/*
 * Wisper Ufficio: Servizi (docs/gestionale/servizi.md §1-§2). È il listino dei preventivi della fase 2 coi campi
 * dell'anagrafica prodotti/servizi di Flextaxa, con la sua voce nel menu laterale subito dopo Preventivi.
 *
 *  - l'elenco con Tutti, Servizi e Prodotti (dal 13/11/2026 senza il segmento Indennità), la ricerca, gli archiviati;
 *  - la scheda del servizio coi campi della foto di Andrea: Descrizione, Prezzo di vendita, Aliquota IVA, poi i
 *    Dettagli (Codice articolo, Costo di acquisto, Aliquota IVA acquisto, Tipo, Unità di misura, Fornitore, Tag,
 *    Immagine) e le Note personali;
 *  - la finestra Indennità del rapportino: gli stessi campi più la Quantità, con la scelta di un servizio in cima
 *    (prima le indennità) che li riempie.
 * Il listino lo legge chi ha Preventivi, Rapportini o Fatture; lo cambia chi ha Preventivi da modificare. I prezzi
 * solo con i soldi (li toglie anche il server).
 */
(function (radice) {
  'use strict';

  radice.WisperServizi = function (W) {
    const { S, C, B, R, Rete } = W;
    const RS = radice.WisperRegoleServizi;
    const { h, aggiungi, svuota, icona, avviso, lavora, finestra, campo, conSuffisso, segmenti, cerca, segnaposto } = B;
    const soldi = W.soldi;
    const scrive = () => W.puo('preventivi', 2);

    const M = { lista: null, archiviati: false, filtri: { segmento: 'tutti', testo: '' } };

    async function leggi(archiviati) {
      const li = await Rete.get('/server/listino' + (archiviati ? '?tutte=1' : ''));
      M.lista = li.listino || [];
      return M.lista;
    }

    /** Gli attivi, per la scelta delle indennità (si rileggono se mancano). */
    async function attivi() {
      if (!M.lista || M.archiviati) await leggi(false).catch(() => null);
      return (M.lista || []).filter(s => s.attivo !== false);
    }

    // ===================================================================== l'elenco

    function vista(pagina) {
      const zona = h('div', { class: 'sezione' }, segnaposto(5, 56));
      aggiungi(pagina, [zona]);
      leggi(M.archiviati).then(() => { zona.remove(); elenco(pagina); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    function elenco(pagina) {
      const f = M.filtri;
      const n = RS.contaServizi((M.lista || []).filter(s => s.attivo !== false));
      const area = h('div', { class: 'sezione' });
      const nomi = { tutti: 'Tutti', servizi: 'Servizi', prodotti: 'Prodotti' };
      if (['tutti', 'servizi', 'prodotti'].indexOf(f.segmento) < 0) f.segmento = 'tutti';
      aggiungi(pagina, [
        h('div', { class: 'testata alta' },
          h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Il listino dello studio'), h('h1', null, 'Servizi e prodotti')),
          scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-visita': 'nuovo-servizio', onclick: () => modulo(null) }, icona('piu', 18, 2.6), 'Nuovo') : null),
        h('div', { class: 'filtri' },
          segmenti(Object.keys(n).map(k => [k, nomi[k] + ' · ' + n[k]]), f.segmento, x => { f.segmento = x; W.disegnaPagina(); }),
          cerca(f.testo, 'Codice, descrizione, tag', x => { f.testo = x; tabella(area); }),
          h('button', { type: 'button', class: 'btn collegamento', onclick: async () => { M.archiviati = !M.archiviati; W.disegnaPagina(); } },
            M.archiviati ? 'Nascondi gli archiviati' : 'Mostra gli archiviati')),
        area]);
      tabella(area);
    }

    function tabella(area) {
      svuota(area);
      const tutti = RS.ordinaServizi(RS.filtraServizi(M.lista, M.filtri));
      const attivi = tutti.filter(s => s.attivo !== false);
      const archiviati = M.archiviati ? tutti.filter(s => s.attivo === false) : [];
      if (!attivi.length && !archiviati.length) {
        aggiungi(area, [h('p', { class: 'vuoto' }, (M.lista || []).length ? 'Niente con questi filtri.' : 'Ancora nessun servizio o prodotto.')]);
        return;
      }
      const conSoldi = soldi();
      const testa = () => h('div', { class: 'r testa' }, h('span', null, 'Codice'), h('span', null, 'Descrizione'), h('span', null, 'U.M.'),
        h('span', { class: 'n' }, 'IVA'), conSoldi ? h('span', { class: 'n' }, 'Prezzo') : null);
      const rigaDi = (s, i) => {
        const apri = scrive() ? () => modulo(s) : null;
        const tag = RS.tagDa(s.tag);
        return h('div', Object.assign({ class: 'r' + (apri ? ' cliccabile' : '') + (s.attivo === false ? ' spenta' : ''), 'data-visita': i === 0 ? 'riga-servizio' : null },
          apri ? { role: 'button', tabindex: '0', onclick: apri, onkeydown: e => { if (e.key === 'Enter') apri(); } } : {}),
        h('span', null, s.codice ? h('span', { class: 'codice' }, s.codice) : h('span', { class: 't2' }, '—')),
        h('span', { class: 'cella-due' }, h('span', { class: 'forte' }, s.nome),
          tag.length || s.fornitore ? h('span', { class: 't2' }, [s.fornitore, tag.join(', ')].filter(Boolean).join(' · ')) : null),
        h('span', { class: 't2' }, RS.unitaDi(s) || '—'),
        h('span', { class: 'n t2' }, C.numero(s.aliquotaIva === undefined ? 22 : s.aliquotaIva) + '%'),
        conSoldi ? h('span', { class: 'n forte' }, s.prezzo === null || s.prezzo === undefined ? h('span', { class: 'da-scegliere' }, 'senza prezzo') : C.euro(s.prezzo)) : null);
      };
      aggiungi(area, [h('div', { class: 'tab tab-servizi' + (conSoldi ? ' con-soldi' : '') }, testa(), attivi.map(rigaDi))]);
      if (archiviati.length) {
        aggiungi(area, [h('span', { class: 'etichetta' }, 'Archiviati'), h('div', { class: 'tab tab-servizi' + (conSoldi ? ' con-soldi' : '') }, testa(), archiviati.map(rigaDi))]);
      }
    }

    // ===================================================================== i campi della foto

    /**
     * I campi di un servizio (o di un'indennità, con conQuantita): la parte in alto, i Dettagli, le Note personali.
     * x: { nome|descrizione, prezzo, aliquotaIva, quantita, codice, prezzoAcquisto, aliquotaAcquisto, tipo, unita,
     * fornitore, tag, note, immagine }. Torna { el, leggi(), errori(e), riempi(x) }.
     */
    function campiServizio(x0, o) {
      const opz = o || {};
      const x = Object.assign({}, x0);
      const testoDi = v => (v === undefined || v === null ? '' : String(v));
      const numeroDi = v => (v === undefined || v === null || v === '' ? '' : R.numeroCampo(v));
      const input = (v, extra) => h('input', Object.assign({ type: 'text', value: testoDi(v) }, extra || {}));
      const c = {
        nome: input(opz.conQuantita ? x.descrizione : x.nome, { 'data-visita': 'campo-descrizione' }),
        prezzo: input(numeroDi(x.prezzo), { inputmode: 'decimal' }),
        quantita: input(numeroDi(x.quantita === undefined || x.quantita === null ? 1 : x.quantita), { inputmode: 'decimal' }),
        codice: input(x.codice),
        prezzoAcquisto: input(numeroDi(x.prezzoAcquisto), { inputmode: 'decimal' }),
        fornitore: input(x.fornitore),
        tag: input(RS.tagDa(x.tag).join(', ')),
        note: h('textarea', { rows: 3 }),
      };
      c.note.value = testoDi(x.note);
      const aliquota = (v, onc) => h('select', { class: 'scelta', onchange: e => onc(Number(e.target.value)) },
        RS.ALIQUOTE.concat(RS.ALIQUOTE.indexOf(Number(v)) < 0 && v !== undefined && v !== null && v !== '' ? [Number(v)] : []).map(a => h('option', { value: a, selected: Number(v === undefined || v === null || v === '' ? 22 : v) === a }, a + '%')));
      const unitaSelect = () => {
        const u = RS.unitaDi(x) || '';
        const voci = RS.UNITA.concat(u && RS.UNITA.indexOf(u) < 0 ? [u] : []);
        return h('select', { class: 'scelta', onchange: e => { x.unita = e.target.value; } },
          [h('option', { value: '', selected: !u }, 'Scegli')].concat(voci.map(v => h('option', { value: v, selected: v === u }, v))));
      };
      let errori = {};
      const zona = h('div', { class: 'fila servizio-campi' });
      const zonaImmagine = h('div', { class: 'immagine-servizio' });
      const disegnaImmagine = () => {
        const id = x.immagine && x.immagine.id ? x.immagine.id : (typeof x.immagine === 'string' ? x.immagine : '');
        aggiungi(svuota(zonaImmagine), [
          id ? h('img', { src: '/file/' + id, alt: 'Immagine del servizio' }) : h('span', { class: 'immagine-vuota' }, icona('immagine', 22, 2)),
          opz.soloLettura ? null : h('button', { type: 'button', class: 'btn piccolo', onclick: scegliImmagine }, id ? 'Cambia' : 'Carica'),
          id && !opz.soloLettura ? h('button', { type: 'button', class: 'btn piccolo testo', onclick: () => { x.immagine = null; disegnaImmagine(); } }, 'Togli') : null]);
      };
      async function scegliImmagine() {
        const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(e => { avviso(e.message, true); return null; });
        if (!scelto || !scelto.ok) return;
        const mime = String(scelto.mime || '').toLowerCase();
        const byte = Math.floor(String(scelto.base64 || '').length * 3 / 4);
        if (!/^image\/(png|jpeg)$/.test(mime) || byte > 1024 * 1024) { avviso('L\'immagine deve essere un JPG o un PNG di al massimo 1 MB', true); return; }
        const ris = await lavora('Carico l\'immagine', () => Rete.post('/server/caricaFile', {
          tipo: 'servizio', per: opz.conQuantita ? 'indennita' : undefined, nome: scelto.nome, mime, base64: scelto.base64, idFile: 'pc' + Date.now().toString(36),
        }));
        if (!ris) return;
        const f = ris.file || ris;
        x.immagine = { id: f.id, url: f.url || '/file/' + f.id };
        disegnaImmagine();
      }
      const disegna = () => {
        const conSoldi = soldi();
        aggiungi(svuota(zona), [
          h('div', { class: 'riga-campi servizio-testa' + (opz.conQuantita ? ' con-quantita' : '') },
            campo('Descrizione', c.nome, errori.nome || errori.descrizione),
            conSoldi ? campo('Prezzo di vendita, IVA esclusa', conSuffisso(c.prezzo, '€'), errori.prezzo) : null,
            campo('Aliquota IVA', aliquota(x.aliquotaIva, v => { x.aliquotaIva = v; })),
            opz.conQuantita ? campo('Quantità', c.quantita, errori.quantita) : null),
          h('h3', { class: 'sotto-titolo' }, 'Dettagli'),
          h('div', { class: 'riga-campi' },
            campo('Codice articolo', c.codice),
            conSoldi ? campo('Costo di acquisto, IVA esclusa', conSuffisso(c.prezzoAcquisto, '€'), errori.prezzoAcquisto) : null,
            campo('Aliquota IVA acquisto', aliquota(x.aliquotaAcquisto, v => { x.aliquotaAcquisto = v; }))),
          h('div', { class: 'riga-campi' },
            h('div', { class: 'campo' }, h('label', null, 'Tipo'), segmenti(RS.TIPI, x.tipo === 'prodotto' ? 'prodotto' : 'servizio', v => { x.tipo = v; disegna(); }, 'piccoli')),
            campo('Unità di misura', unitaSelect(), errori.unita),
            campo('Fornitore', c.fornitore)),
          h('div', { class: 'riga-campi' }, campo('Tag per la ricerca', c.tag), h('div', { class: 'campo' }, h('label', null, 'Immagine'), zonaImmagine)),
          campo('Note personali, non vanno nei documenti', c.note)]);
        disegnaImmagine();
        if (opz.soloLettura) zona.querySelectorAll('input, select, textarea, .segmenti button').forEach(e => { e.disabled = true; });
      };
      disegna();
      return {
        el: zona,
        leggi: () => Object.assign({}, x, {
          nome: c.nome.value, descrizione: opz.conQuantita ? c.nome.value : x.descrizione, prezzo: c.prezzo.value, quantita: c.quantita.value, codice: c.codice.value,
          prezzoAcquisto: c.prezzoAcquisto.value, fornitore: c.fornitore.value, tag: c.tag.value, note: c.note.value,
          unita: x.unita !== undefined ? x.unita : RS.unitaDi(x),
        }),
        errori: e => { errori = e || {}; disegna(); const primo = zona.querySelector('.campo.sbagliato input, .campo.sbagliato select'); if (primo) primo.focus(); },
        riempi: nuovo => {
          Object.keys(x).forEach(k => delete x[k]);
          Object.assign(x, nuovo);
          c.nome.value = testoDi(opz.conQuantita ? x.descrizione : x.nome);
          c.prezzo.value = numeroDi(x.prezzo);
          c.quantita.value = numeroDi(x.quantita === undefined || x.quantita === null ? 1 : x.quantita);
          c.codice.value = testoDi(x.codice);
          c.prezzoAcquisto.value = numeroDi(x.prezzoAcquisto);
          c.fornitore.value = testoDi(x.fornitore);
          c.tag.value = RS.tagDa(x.tag).join(', ');
          c.note.value = testoDi(x.note);
          errori = {};
          disegna();
        },
      };
    }

    // ===================================================================== la scheda del servizio

    function modulo(s) {
      const x0 = s ? Object.assign({}, s, { unita: RS.unitaDi(s) }) : { nome: '', codice: '', unita: 'Nr', tipo: 'servizio', aliquotaIva: 22, aliquotaAcquisto: 22, prezzo: null, tag: [] };
      const campi = campiServizio(x0, {});
      let chiudi;
      const salva = async () => {
        const x = campi.leggi();
        const e = RS.erroreServizio(x, soldi());
        if (Object.keys(e).length) { campi.errori(e); return; }
        const voce = RS.servizioPerSalvare(Object.assign({}, x, { id: s ? s.id : undefined }), soldi());
        const ris = await lavora('Salvo il servizio', () => Rete.post('/server/salvaVoceListino', { voce }));
        if (!ris) return;
        chiudi();
        await leggi(M.archiviati).catch(() => null);
        avviso(s ? 'Servizio salvato' : 'Servizio aggiunto');
        W.disegnaPagina();
      };
      const archivia = async si => {
        const ris = await lavora(si ? 'Archivio' : 'Ripristino', () => Rete.post('/server/archiviaVoceListino', { id: s.id, archiviata: si }));
        if (!ris) return;
        chiudi();
        await leggi(M.archiviati).catch(() => null);
        avviso(si ? 'Servizio archiviato: non si propone più' : 'Servizio ripristinato', false, null, si ? { testo: 'Annulla', fn: () => archivia(false) } : null);
        W.disegnaPagina();
      };
      chiudi = finestra({
        titolo: s ? s.nome : 'Nuovo servizio o prodotto', corpo: campi.el, larghezza: 'media',
        pulsanti: [s ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: () => archivia(s.attivo !== false) }, s.attivo !== false ? 'Archivia' : 'Ripristina') : null,
          'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')].filter(Boolean),
      });
    }

    // ===================================================================== l'indennità del rapportino

    /**
     * La finestra Indennità (servizi.md §2): in cima la scelta del servizio che riempie i campi (prima le indennità),
     * poi i campi della foto con la Quantità. dentro = l'indennità da cambiare (null = nuova). Torna una Promise con
     * { indennita } (salvata), { togli: true } o null (annullato).
     */
    async function finestraIndennita(dentro) {
      const lista = RS.perIndennita(await attivi());
      return new Promise(risolvi => {
        let detto = false;
        const rispondi = v => { if (!detto) { detto = true; risolvi(v); } };
        // 13/11/2026: un elenco solo, senza "prima le indennità": si parte da niente e si sceglie.
        const x0 = dentro ? Object.assign({}, dentro) : RS.indennitaVuota();
        const campi = campiServizio(x0, { conQuantita: true });
        const etichetta = s => [s.codice, s.nome].filter(Boolean).join(' · ') + (soldi() && s.prezzo !== null && s.prezzo !== undefined ? ' · ' + C.euro(s.prezzo) : '');
        const scelta = h('select', { class: 'scelta', 'aria-label': 'Da Servizi e prodotti', 'data-visita': 'scelta-servizio', onchange: e => {
          const s = lista.find(v => String(v.id) === e.target.value);
          campi.riempi(s ? Object.assign(RS.indennitaDaServizio(s), { quantita: campi.leggi().quantita || 1 }) : RS.indennitaVuota());
        } },
        h('option', { value: '' }, 'Nessuno, la scrivo io'),
        lista.map(s => h('option', { value: s.id, selected: String(x0.idServizio) === String(s.id) }, etichetta(s))));
        const corpo = h('div', { class: 'fila' }, campo('Da Servizi e prodotti', scelta), campi.el);
        let chiudi;
        const salva = () => {
          const x = campi.leggi();
          const e = RS.erroreIndennita(x, soldi());
          if (Object.keys(e).length) { campi.errori(e); return; }
          const s = lista.find(v => String(v.id) === scelta.value);
          rispondi({ indennita: RS.indennitaPerSalvare(Object.assign({}, x, { idServizio: s ? s.id : null }), soldi()) });
          chiudi();
        };
        chiudi = finestra({
          titolo: dentro ? 'Indennità' : 'Aggiungi un\'indennità', corpo, larghezza: 'media', fuoco: false,
          allaChiusura: () => rispondi(null),
          pulsanti: [dentro ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: () => { rispondi({ togli: true }); chiudi(); } }, 'Togli') : null,
            'spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => { rispondi(null); chiudi(); } }, 'Annulla'),
            h('button', { type: 'button', class: 'btn giallo grande', 'data-visita': 'salva-indennita', onclick: salva }, dentro ? 'Salva' : 'Aggiungi')].filter(Boolean),
        });
      });
    }

    /**
     * 13/11/2026: la scelta da Servizi e prodotti sotto un pulsante (per una riga della bozza della fattura): la ricerca
     * per codice e descrizione, un clic sceglie. alScelto(servizio).
     */
    async function scegli(ancora, alScelto) {
      B.chiudiMenu();
      const tutti = RS.perIndennita(await attivi());
      const lista = h('div', { class: 'lista-listino' });
      const input = h('input', { type: 'search', placeholder: 'Codice o descrizione', 'aria-label': 'Cerca in Servizi e prodotti' });
      const m = h('div', { class: 'menu listino-menu', role: 'dialog', 'aria-label': 'Servizi e prodotti' }, h('label', { class: 'cerca piccola' }, icona('cerca', 16), input), lista);
      const chiudi = () => { m.remove(); document.removeEventListener('mousedown', fuori, true); document.removeEventListener('keydown', esc, true); };
      const fuori = e => { if (!m.contains(e.target) && e.target !== ancora) chiudi(); };
      const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); chiudi(); } };
      const disegna = () => {
        const voci = RS.filtraServizi(tutti, { testo: input.value });
        aggiungi(svuota(lista), voci.length ? voci.map(s => h('button', { type: 'button', role: 'menuitem', onclick: () => { chiudi(); alScelto(s); } },
          h('span', { class: 'nome-listino' }, [s.codice, s.nome].filter(Boolean).join(' · ')),
          h('span', { class: 'piccolo' }, [RS.unitaDi(s), soldi() ? (s.prezzo === null || s.prezzo === undefined ? 'senza prezzo' : C.euro(s.prezzo)) : ''].filter(Boolean).join(' · ')))) :
          [h('div', { class: 'vuoto piccolo' }, tutti.length ? 'Niente con questo nome' : 'Ancora nessun servizio o prodotto')]);
      };
      input.addEventListener('input', disegna);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { const p = lista.querySelector('button'); if (p) p.click(); } });
      disegna();
      document.body.append(m);
      const r = ancora.getBoundingClientRect();
      m.style.left = Math.max(12, Math.min(r.left, window.innerWidth - m.offsetWidth - 12)) + 'px';
      m.style.top = (r.bottom + 6 + m.offsetHeight < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - m.offsetHeight - 6)) + 'px';
      setTimeout(() => { document.addEventListener('mousedown', fuori, true); document.addEventListener('keydown', esc, true); input.focus(); }, 0);
    }

    return { vista, M, leggi, finestraIndennita, campiServizio, scegli };
  };
}(typeof self !== 'undefined' ? self : this));
