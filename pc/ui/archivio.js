/*
 * Wisper Ufficio: Documenti (fase 5, docs/gestionale/fase5.md §5, §6, §12.4; risposte architettura.md §16.3-16.10).
 *
 * Archivio · Da approvare · Scadenze · Modelli. L'archivio ha le categorie a sinistra, la ricerca, i filtri
 * per cliente, commessa e impianto, la tabella; un tocco apre il pannello del documento (anteprima, revisioni,
 * a cosa è legato, scadenza, condividi, cronologia). Un documento è un file caricato sul NAS (in byte con
 * /carica: il programma lo legge dal disco e lo manda, la pagina non vede il file) oppure un collegamento a
 * OneDrive, SharePoint, Google Drive o al computer dello studio: si apre e basta, Wisper non lo copia.
 * Sfogliare OneDrive e Drive da qui e il link per i clienti sono "Non collegato" (fase 8, domanda 3).
 *
 * Qui stanno anche le pagine di Amministrazione › Categorie dei documenti e › Spazio sul NAS, e la scheda
 * Documenti della commessa e del cliente (schedaDocumenti). Permessi e conti li decide il server.
 */
(function (radice) {
  'use strict';

  radice.WisperArchivio = function (W) {
    const { S, C, R, B, Rete, Api } = W;
    const T = radice.WisperRegoleTicket;
    const D = W.D;
    const { h, aggiungi, svuota, icona, tondo, iniziali, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, selezione, segmenti, cerca, riga, quadrato, segnaposto, copiaTesto } = B;
    const puo = W.puo;
    const scrive = () => puo('documenti', 2);
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const approva = () => !!interfaccia().puoApprovareDocumenti;
    const titolare = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'titolare');
    const lettura = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'lettura');

    // Quello che si legge qui, tenuto finché non cambia: si rilegge entrando nella pagina.
    const M = {
      lista: null, chiave: '', categorie: null, scadenze: null, modelli: null, approvare: null, spazio: null,
      filtri: { testo: '', idCategoria: '', idCliente: '', idCommessa: '', idSede: '', daClassificare: false },
      aperto: null, doc: null,
    };
    function daRileggere() { M.lista = null; M.scadenze = null; M.modelli = null; M.approvare = null; M.spazio = null; M.categorie = null; }

    const qs = o => Object.keys(o).filter(k => o[k] !== '' && o[k] !== null && o[k] !== undefined && o[k] !== false)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k] === true ? '1' : o[k])).join('&');
    const idFileNuovo = () => 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const idDaUrl = url => String(url || '').replace(/^\/file\//, '');
    const giornoBreve = iso => {
      const s = String(iso || '').slice(0, 10);
      if (!s) return '';
      const g = T.giornoA(T.istante(s));
      return g === 'oggi' || g === 'ieri' ? g : C.data(s);
    };
    const dataLunga = iso => {
      const d = T.istante(iso);
      return d ? T.GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + T.MESI[d.getMonth()] + ' ' + d.getFullYear() : '';
    };
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
    /** "22/10 13:31" (con l'anno se non è quest'anno): la colonna stretta della cronologia. */
    const quandoBreve = iso => { const s = String(iso || ''); const anno = s.slice(0, 4) !== C.oggiIso().slice(0, 4); return C.data(s.slice(0, 10)).slice(0, anno ? 10 : 5) + (s.length > 11 ? ' ' + s.slice(11, 16) : ''); };

    // ===================================================================== aperture comuni

    /** Un file del server: il programma lo scarica e lo apre col programma di Windows (come i documenti di prima). */
    function apriFile(url, nome, salva) {
      if (S.esempio) { avviso('Nella visita i file non si aprono'); return; }
      const id = idDaUrl(url);
      if (!id) return;
      Rete.post('/locale/apri-documento', { id, nome: nome || id, salva: !!salva }).then(r => { if (r && r.percorso && salva) avviso('Salvato in ' + r.percorso); }).catch(e => avviso(e.message, true));
    }

    /** Un collegamento: un link nel browser, un percorso in Esplora file (dal computer dello studio). */
    function apriCollegamento(url) {
      if (S.esempio) { avviso('Nella visita i collegamenti non si aprono'); return; }
      Rete.post('/locale/apri-collegamento', { url }).catch(e => avviso(e.message, true));
    }

    function apri(d) {
      if (!d) return;
      if (d.origine === 'collegamento') apriCollegamento(d.url);
      else apriFile(d.url, d.nomeFile || d.titolo);
    }

    /**
     * Carica un file con /carica (in byte): scelto è { rif } (dalla finestra di Windows, il programma lo
     * legge dal disco) oppure { file } (trascinato sulla pagina). Torna la risposta del server: { file, gia }.
     */
    async function carica(scelto, per, idFile) {
      if (scelto.file) {
        const q = '?' + qs({ nome: scelto.nome, mime: scelto.mime || T.mimeDi(scelto.nome), per, idFile });
        return Api.postFile('/locale/carica-corpo' + q, scelto.file);
      }
      return Rete.post('/locale/carica', { rif: scelto.rif, per, idFile });
    }

    /** Sceglie un file dal computer (la finestra di Windows): { rif, nome, mime, byte } senza leggerlo. */
    async function scegliFile(filtro) {
      const r = await Rete.post('/locale/scegli-file', { filtro: filtro || 'documenti', percorso: true }).catch(e => { avviso(e.message, true); return null; });
      return r && r.ok ? { rif: r.rif, nome: r.nome, mime: r.mime, byte: r.byte } : null;
    }

    // ===================================================================== la pagina

    function vista(pagina, a1, a2, filtro) {
      const f = filtro || {};
      if (f.idCategoria !== undefined) M.filtri.idCategoria = f.idCategoria;
      if (f.daClassificare) { M.filtri.daClassificare = true; M.filtri.idCategoria = ''; }
      if (f.segmento === 'archivio' && !f.daClassificare && f.idCategoria === undefined) Object.assign(M.filtri, { daClassificare: false });
      const seg = a1 === 'approvare' ? 'approvare' : (a1 === 'scadenze' || a1 === 'scadenza') ? 'scadenze' : a1 === 'modelli' ? 'modelli' : 'archivio';
      if (seg === 'archivio') return paginaArchivio(pagina, a1 === 'doc' ? a2 : null);
      if (seg === 'approvare') return paginaApprovare(pagina);
      if (seg === 'scadenze') return paginaScadenze(pagina, a1 === 'scadenza' ? a2 : null);
      return paginaModelli(pagina, a2 || null);
    }

    function testata(titolo, giallo) {
      return h('div', { class: 'testata alta' },
        h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Documenti'), h('h1', null, titolo)), giallo || null);
    }

    function segmentiDoc(seg) {
      const n = (M.lista && M.lista.conteggi) || {};
      const voci = [['archivio', 'Archivio']];
      if (approva() || (n.daApprovare > 0)) voci.push(['approvare', 'Da approvare' + (n.daApprovare ? ' · ' + n.daApprovare : '')]);
      voci.push(['scadenze', 'Scadenze' + (n.scaduti ? ' · ' + n.scaduti + ' scadute' : '')], ['modelli', 'Modelli']);
      return segmenti(voci, seg, x => W.vai(x === 'archivio' ? '#documenti' : '#documenti/' + x));
    }

    function conDati(contenitore, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 58));
      aggiungi(contenitore, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    async function leggiCategorie() {
      if (M.categorie) return;
      const r = await Rete.get('/server/categorieDocumenti');
      M.categorie = r.categorie || [];
    }

    function filtriServer() {
      const f = M.filtri;
      return { archivio: true, testo: f.testo.trim(), idCategoria: f.daClassificare ? '' : f.idCategoria, idCliente: f.idCliente, idCommessa: f.idCommessa, idSede: f.idSede, daClassificare: f.daClassificare };
    }

    async function leggiArchivio() {
      const chiave = qs(filtriServer());
      const r = await Rete.get('/server/documenti?' + chiave);
      M.lista = r;
      M.chiave = chiave;
    }

    // ===================================================================== archivio

    function paginaArchivio(pagina, apriId) {
      const giallo = scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: () => aggiungiDocumento() }, icona('piu', 18, 2.6), 'Aggiungi un documento') : null;
      const zonaSeg = h('div');
      aggiungi(pagina, [testata('Archivio', giallo), zonaSeg]);
      conDati(pagina, () => Promise.all([leggiCategorie(), M.lista && M.chiave === qs(filtriServer()) ? Promise.resolve() : leggiArchivio()]), () => {
        aggiungi(zonaSeg, [segmentiDoc('archivio')]);
        corpoArchivio(pagina);
        if (apriId && !document.querySelector('.pannello-doc')) apriPannello(apriId);
        else if (M.aperto && !document.querySelector('.pannello-doc')) apriPannello(M.aperto);
        else if (M.aperto) gialloPagina(true);
      });
    }

    function corpoArchivio(pagina) {
      const lato = h('nav', { class: 'categorie-doc', 'aria-label': 'Categorie' });
      const destra = h('div', { class: 'sezione colonna-archivio' });
      const area = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'griglia-archivio' }, lato, destra)]);

      const f = M.filtri;
      const cat = (M.categorie || []).slice().sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
      const daClass = cat.find(c => c.sistema && /classificare/i.test(c.nome));
      const tutte = cat.reduce((t, c) => t + (c.documenti || 0), 0);
      const voceCat = (testo, n, scelta, fn) => h('button', { type: 'button', class: 'voce-cat' + (scelta ? ' scelta' : ''), 'aria-pressed': scelta ? 'true' : 'false', onclick: fn },
        h('span', null, testo), h('b', null, String(n || 0)));
      const scegliCat = (id, daClassificare) => { f.idCategoria = id; f.daClassificare = !!daClassificare; M.lista = null; chiudiPannello(true); W.disegnaPagina(); };
      aggiungi(lato, [voceCat('Tutte', tutte, !f.idCategoria && !f.daClassificare, () => scegliCat('', false))]);
      cat.filter(c => c !== daClass && (c.documenti > 0 || String(c.id) === String(f.idCategoria))).forEach(c =>
        aggiungi(lato, [voceCat(c.nome, c.documenti, String(c.id) === String(f.idCategoria) && !f.daClassificare, () => scegliCat(c.id, false))]));
      if (daClass) aggiungi(lato, [voceCat('Da classificare', daClass.documenti, f.daClassificare, () => scegliCat('', true))]);

      // Ricerca (nel server: titolo, cliente, commessa, impianto, riferimento, nome del file) e filtri.
      let attesa = null;
      // Fase 8 (§6): con la ricerca dentro i file accesa si cerca anche nel testo.
      const dentro = S.ana.impostazioni.RICERCA_FILE !== false && S.ana.impostazioni.RICERCA_FILE !== 'false';
      const ricerca = cerca(f.testo, dentro ? 'Cerca titolo, cliente, commessa, testo dei file' : 'Cerca titolo, cliente, commessa, impianto', v => {
        f.testo = v;
        clearTimeout(attesa);
        attesa = setTimeout(async () => { try { await leggiArchivio(); tabella(area); } catch (e) { avviso(e.message, true); } }, 300);
      });
      const chip = (testo, togli) => h('span', { class: 'filtro-attivo' }, testo, h('button', { type: 'button', 'aria-label': 'Togli il filtro ' + testo, onclick: togli }, icona('chiudi', 14, 2.6)));
      const rifiltra = () => { M.lista = null; W.disegnaPagina(); };
      const pillFiltro = (testo, attiva, fn, attr) => h('button', Object.assign({ type: 'button', class: 'pillola' + (attiva ? ' scelta' : ''), 'aria-pressed': attiva ? 'true' : 'false', onclick: fn }, attr || {}), testo);
      const nessuno = !f.idCliente && !f.idCommessa && !f.idSede && !f.daClassificare;
      aggiungi(destra, [ricerca, h('div', { class: 'pillole filtri-doc' },
        pillFiltro('Tutti', nessuno, () => { Object.assign(f, { idCliente: '', idCommessa: '', idSede: '', daClassificare: false }); rifiltra(); }),
        f.idCliente ? chip((W.cliente(f.idCliente) || { nome: f.idCliente }).nome, () => { f.idCliente = ''; rifiltra(); })
          : pillFiltro('Per cliente', false, () => scegliLegame('cliente', {}, x => { f.idCliente = x.id; rifiltra(); })),
        f.idCommessa ? chip(f.idCommessa, () => { f.idCommessa = ''; rifiltra(); })
          : pillFiltro('Per commessa', false, () => scegliLegame('commessa', {}, x => { f.idCommessa = x.id; rifiltra(); })),
        f.idSede ? chip((S.ana.sedi.find(s => String(s.id) === String(f.idSede)) || { nome: 'Impianto ' + f.idSede }).nome, () => { f.idSede = ''; rifiltra(); })
          : pillFiltro('Per impianto', false, () => scegliLegame('impianto', {}, x => { f.idSede = x.id; rifiltra(); })),
        pillFiltro('Da classificare', f.daClassificare, () => { f.daClassificare = !f.daClassificare; f.idCategoria = ''; rifiltra(); }),
        h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.esporta('documenti', filtriServer()) }, 'Esporta per Excel')),
      area,
      rigaNonCollegata('Sfoglia OneDrive e Google Drive', 'Per ora si incolla il collegamento')]);
      tabella(area);
      accogliTrascinati(area);
    }

    function rigaNonCollegata(titolo, sotto) {
      return h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'ico-riga ico-grigio' }, icona('scollegato', 20, 2.2)),
        h('span', { class: 'corpo' }, h('b', null, titolo), sotto ? h('span', { class: 'secondario' }, sotto) : null), pillNonCollegato());
    }
    const pillNonCollegato = () => h('span', { class: 'pill p-tratteggiata' }, icona('scollegato', 14, 2.2), 'Non collegato');

    /** Sulla tabella si trascinano file (Aggiungi con il file) o un link dal browser (Aggiungi con l'indirizzo). */
    function accogliTrascinati(area) {
      if (!scrive()) return;
      area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('accoglie'); });
      area.addEventListener('dragleave', e => { if (!area.contains(e.relatedTarget)) area.classList.remove('accoglie'); });
      area.addEventListener('drop', e => {
        e.preventDefault();
        area.classList.remove('accoglie');
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length) {
          const file = dt.files[0];
          aggiungiDocumento({ trascinato: { file, nome: file.name, mime: file.type || T.mimeDi(file.name), byte: file.size } });
          if (dt.files.length > 1) avviso('Si aggiunge un file alla volta: ho preso il primo');
          return;
        }
        const url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/\r?\n/).find(x => x && x[0] !== '#');
        if (url) aggiungiDocumento({ url: url.trim() });
      });
    }

    // La revisione sta nella pillola dello stato ("Valida rev. 2"): una colonna in meno, più spazio al titolo.
    // Le colonne dell'archivio stanno in stile.css (.tab-archivio): nella tabella stretta (1024) la colonna Modif. lascia
    // il posto al titolo (07/11/2026, niente puntini e niente titoli su quattro righe).

    function iconaDoc(d) {
      if (d.origine === 'collegamento') return h('span', { class: 'ico-riga piccola ico-blu' }, icona(d.cartella ? 'cartella' : 'link', 18, 2.2));
      if (/^image\//.test(d.mime || '')) return h('span', { class: 'ico-riga piccola ico-grigio' }, icona('foto', 18, 2.2));
      return h('span', { class: 'ico-riga piccola ico-grigio' }, icona('file', 18, 2.2));
    }

    function pillStatoDoc(d, piccola) {
      const p = piccola ? (t, c) => h('span', { class: 'pill piccola p-' + c }, t) : pill;
      if (d.origine === 'collegamento') return p(d.collegamentoNome || T.COLLEGAMENTI[d.collegamentoTipo] || 'Collegamento', 'blu');
      if (d.statoVisto === 'Valida') return p('Valida rev. ' + d.revisione, 'verde');
      return p(d.statoVisto + (d.revisione !== null && d.revisione !== undefined && d.origine !== 'collegamento' ? ' rev. ' + d.revisione : ''), T.coloreDocumento(d.statoVisto));
    }

    function legatoA(d) {
      return [d.cliente, d.idCommessa, d.impianto, d.ticket, d.contratto].filter(Boolean).join(' · ');
    }

    function tabella(area) {
      svuota(area);
      const lista = (M.lista && M.lista.documenti) || [];
      if (!lista.length) {
        aggiungi(area, [h('div', { class: 'vuoto zona-vuota' }, M.filtri.testo ? 'Nessun documento con queste parole.' : 'Nessun documento qui.',
          scrive() ? h('span', { class: 'piccolo' }, 'Trascina qui un file o un link per aggiungerlo') : null)]);
        return;
      }
      const tab = h('div', { class: 'tab tab-archivio' }, h('div', { class: 'r testa' },
        h('span', null, 'Titolo'), h('span', null, 'Categoria'), h('span', null, 'Legato a'), h('span', null, 'Stato'), h('span', null, 'Scadenza'), h('span', { class: 'c-modif' }, 'Modif.')));
      lista.forEach(d => aggiungi(tab, [h('div', {
        class: 'r cliccabile' + (String(M.aperto) === String(d.id) ? ' scelta' : ''), role: 'button', tabindex: '0', 'data-id': d.id,
        onclick: () => apriPannello(d.id), onkeydown: e => { if (e.key === 'Enter') apriPannello(d.id); },
      },
      h('span', { class: 'titolo-doc' }, iconaDoc(d), h('span', { class: 'doppia' }, h('span', { title: d.titolo }, d.titolo),
        // Fase 8 (§6.3): trovato dentro il file, la pillola Nel testo qui e l'estratto su una riga sua, larga quanto la tabella.
        d.trovato ? h('span', { class: 'pill piccola p-giallo' }, 'Nel testo') : h('span', null, d.origine === 'collegamento' ? (d.cartella ? 'Cartella' : 'Collegamento') : [T.tipoFile(d.mime, d.nomeFile), T.grandezza(d.byte), d.riferimento].filter(Boolean).join(' · ')))),
      d.daClassificare ? h('span', null, h('span', { class: 'pill piccola p-ambra' }, 'Da classificare')) : h('span', { class: 't2 taglia', title: d.categoria }, d.categoria),
      h('span', { class: 't2 legato', title: legatoA(d) }, legatoA(d) || '—'),
      h('span', { class: 'stato-doppio' }, pillStatoDoc(d, true), d.daApprovare !== null && d.daApprovare !== undefined && d.statoVisto === 'Valida' ? h('span', { class: 'pill piccola p-giallo' }, 'rev. ' + d.daApprovare + ' da approvare') : null),
      h('span', null, d.scadenza ? h('span', { class: 'pill piccola p-' + T.coloreScadenza(d.scadenza.statoVisto), title: d.scadenza.statoVisto }, d.scadenza.statoVisto) : h('span', { class: 't2' }, '—')),
      h('span', { class: 't2 c-modif' }, C.data(String(d.modificato || d.creato || '').slice(0, 10)).slice(0, 5)),
      d.trovato ? h('span', { class: 'estratto-riga' }, estratto(d.trovato)) : null)]));
      aggiungi(area, [tab]);
      if (M.lista.pagine > 1) aggiungi(area, [h('p', { class: 'piccolo' }, 'Si vedono i 50 più recenti di ' + M.lista.quanti + ': cerca per trovare gli altri.')]);
    }

    /** L'estratto di un documento trovato dentro il file: una riga, le parole cercate in grassetto (§6.2-§6.3). */
    function estratto(t) {
      const Q = radice.WisperRegoleFase8;
      const dove = Q.doveTrovato(t);
      return h('span', { class: 'estratto-doc', title: String(t.estratto || '').replace(/[[\]]/g, '') },
        Q.pezziEstratto(t.estratto).map(p => (p.forte ? h('b', null, p.testo) : p.testo)), dove ? ' · ' + dove : '');
    }

    // ===================================================================== il pannello del documento

    function gialloPagina(spento) {
      // Con il pannello aperto il giallo della pagina diventa col bordo (fase5.md §12): uno solo per schermata.
      document.querySelectorAll('[data-giallo-pagina]').forEach(b => b.classList.toggle('giallo', !spento));
    }

    async function apriPannello(id) {
      M.aperto = id;
      document.querySelectorAll('.tab-archivio .r[data-id], .tab-approvare .r[data-id]').forEach(x => x.classList.toggle('scelta', String(x.dataset.id) === String(id)));
      const r = await lavora('Apro il documento', () => Rete.get('/server/documento?id=' + encodeURIComponent(id)));
      if (!r || !r.documento) { if (r === undefined) M.aperto = null; return; }
      if (String(M.aperto) !== String(id)) return;
      M.doc = r.documento;
      disegnaPannello();
    }

    function chiudiPannello(subito) {
      const p = document.querySelector('.pannello-doc');
      M.aperto = null;
      M.doc = null;
      gialloPagina(false);
      document.querySelectorAll('.tab .r.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }

    function versioneAperta(d) {
      return (d.versioni || []).find(v => v.statoVisto === 'Valida') || (d.versioni || []).find(v => v.statoVisto === 'Da approvare') || (d.versioni || [])[0] || null;
    }

    function anteprima(d) {
      if (d.origine === 'collegamento') return null;
      const v = versioneAperta(d);
      const url = v ? v.url : d.url;
      const mime = (v && v.mime) || d.mime || '';
      if (/^image\//.test(mime) && url) return h('div', { class: 'anteprima-doc' }, h('img', { src: url, alt: 'Anteprima di ' + d.titolo }));
      if (mime === 'application/pdf' && url && !S.esempio) return h('div', { class: 'anteprima-doc pdf' }, h('iframe', { src: url + '#toolbar=0&navpanes=0&view=FitH', title: 'Anteprima di ' + d.titolo, tabindex: '-1' }));
      return h('div', { class: 'anteprima-doc vuota' }, icona('file', 36, 1.8),
        h('b', null, (v && v.nomeFile) || d.nomeFile || d.titolo), h('span', { class: 'secondario' }, [T.tipoFile(mime, d.nomeFile), T.grandezza((v && v.byte) || d.byte)].filter(Boolean).join(' · ')));
    }

    function disegnaPannello() {
      const d = M.doc;
      const vecchio = document.querySelector('.pannello-doc');
      if (!d) { if (vecchio) vecchio.remove(); return; }
      const scriveQui = scrive() && d.puoScrivere !== false && !d.archiviato;
      const daApprovare = (d.versioni || []).find(v => v.statoVisto === 'Da approvare');
      const vChe = versioneAperta(d);
      const collegamento = d.origine === 'collegamento';

      const legami = [
        d.idCliente ? riga({ sinistra: iniziali(d.cliente, true), titolo: d.cliente, sotto: 'Cliente', onclick: () => { chiudiPannello(true); W.vai('#clienti/' + encodeURIComponent(d.idCliente)); } }) : null,
        d.idCommessa ? riga({ sinistra: h('span', { class: 'codice' }, d.idCommessa), titolo: d.commessa || d.idCommessa, sotto: 'Commessa', onclick: () => { chiudiPannello(true); W.vai('#commesse/' + encodeURIComponent(d.idCommessa)); } }) : null,
        d.idSede ? riga({ sinistra: quadrato('fulmine', 'ico-blu'), titolo: d.impianto, sotto: 'Impianto · storico', onclick: () => { chiudiPannello(true); W.vai('#ticket/impianto/' + d.idSede); } }) : null,
        d.idTicket ? riga({ sinistra: quadrato('chiaveInglese'), titolo: d.ticket, sotto: 'Ticket', onclick: () => { chiudiPannello(true); W.vai('#ticket/tk/' + d.idTicket); } }) : null,
        d.idContratto ? riga({ sinistra: quadrato('contratto'), titolo: d.contratto, sotto: 'Contratto di assistenza', onclick: () => { chiudiPannello(true); W.vai('#ticket/contratto/' + d.idContratto); } }) : null,
      ].filter(Boolean);

      const revisioni = !collegamento && (d.versioni || []).length ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Revisioni'),
        h('div', { class: 'scheda righe' }, d.versioni.map(v => riga({
          sinistra: quadrato('file', v.statoVisto === 'Valida' ? 'ico-verde' : v.statoVisto === 'Da approvare' ? 'ico-giallo' : v.statoVisto === 'Respinta' ? 'ico-rosso' : 'ico-grigio'),
          titolo: 'rev. ' + v.numero + (v.nota ? ' · ' + v.nota : ''),
          sotto: h('span', { class: 'sotto-pill' }, pill(v.statoVisto, T.coloreDocumento(v.statoVisto)), [v.caricataDa, giornoBreve(v.caricataIl)].filter(Boolean).join(' · '),
            v.motivoRifiuto ? h('span', { class: 'rosso-testo' }, v.motivoRifiuto) : null),
          destra: v.puoTogliere && scrive() ? h('button', { type: 'button', class: 'btn collegamento piccolo', onclick: e => { e.stopPropagation(); togliVersione(d, v); } }, 'Togli') : null,
          freccia: false,
          onclick: () => apriFile(v.url, v.nomeDaScaricare || v.nomeFile),
        }))),
        scriveQui && d.origine === 'file' ? h('button', { type: 'button', class: 'btn', onclick: () => caricaRevisione(d) }, icona('carica', 18, 2.2), 'Carica una revisione') : null) : null;

      const sorgente = collegamento ? h('div', { class: 'scheda collegamento-doc' },
        h('div', { class: 'riga-indirizzo' }, h('span', { class: 'indirizzo', title: d.url }, T.accorcia(d.url, 50)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: async () => { if (await copiaTesto(d.url)) avviso('Indirizzo copiato'); } }, icona('copia', 16, 2.2), 'Copia')),
        h('div', { class: 'secondario' }, T.rigaCollegamento(d.collegamentoTipo))) : null;

      const sc = d.scadenza;
      const scadenza = sc ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Scadenza'),
        h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('bandiera', T.coloreScadenza(sc.statoVisto) === 'rosso' ? 'ico-rosso' : 'ico-giallo'),
          titolo: C.data(sc.data), sotto: T.ogni(sc.ogniMesi), destra: pill(sc.statoVisto, T.coloreScadenza(sc.statoVisto)), onclick: () => apriScadenza(sc.id) }))) : null;

      const coll = !!interfaccia().condivisioneCollegata;
      const percorso = d.collegamentoTipo === 'percorso';
      const condividi = h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Condividi'),
        h('div', { class: 'scheda righe' },
          riga({ sinistra: quadrato('email'), titolo: 'Manda per email', sotto: percorso ? 'Un percorso del computer non si può mandare' : collegamento ? 'Manda il collegamento' : 'Allegato, fino a ' + (S.ana.impostazioni.EMAIL_ALLEGATI_MAX_MB || 15) + ' MB',
            onclick: percorso || !scriveQui ? null : () => mandaPerEmail(d), freccia: !percorso && scriveQui }),
          coll && !collegamento && scriveQui ? riga({ sinistra: quadrato('link'), titolo: 'Link che scade', sotto: 'Il cliente scarica la revisione valida', onclick: () => creaLink(d) })
            : h('div', { class: 'riga' }, quadrato('link'), h('span', { class: 'corpo' }, h('span', { class: 't1' }, 'Link che scade'),
              h('span', { class: 't2' }, percorso ? 'Un percorso del computer non si condivide' : collegamento ? 'Si condivide da ' + (d.collegamentoNome || 'lì') : 'Per ora si manda per email')), pillNonCollegato()),
          (d.condivisioni || []).map(x => riga({ sinistra: quadrato('link', x.revocata || x.scaduta ? 'ico-grigio' : 'ico-blu'), titolo: x.perChi,
            sotto: (x.revocata ? 'revocato' : x.scaduta ? 'scaduto il ' + C.data(x.scade) : 'fino al ' + C.data(x.scade)) + ' · aperto ' + (x.aperture === 1 ? '1 volta' : (x.aperture || 0) + ' volte'),
            destra: !x.revocata && !x.scaduta && scriveQui ? h('button', { type: 'button', class: 'btn collegamento piccolo', onclick: e => { e.stopPropagation(); revocaLink(d, x); } }, 'Revoca') : null }))));

      const cronologia = (d.cronologia || []).length ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'Cronologia'),
        h('div', { class: 'cronologia' }, d.cronologia.slice().reverse().map(x => h('div', { class: 'voce-cron' }, h('span', { class: 'quando' }, quandoBreve(x.quando)), h('span', null, x.testo))))) : null;

      const respinte = (d.mieRespinte || []).map(x => h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'La tua rev. ' + x.numero + ' è stata respinta: ' + x.motivo)));

      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, 'Documento'), h('span', { class: 'spazio' }), altro(d, scriveQui), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
        h('div', { class: 'pillole-testa' }, pillStatoDoc(d),
          daApprovare && d.statoVisto === 'Valida' ? pill('rev. ' + daApprovare.numero + ' da approvare', 'giallo') : null,
          d.archiviato ? pill('Archiviato', 'grigio') : null, d.vede === 'costi' ? pill('Chi vede i prezzi', 'grigio') : d.vede === 'riservati' ? pill('Riservato', 'grigio') : null,
          d.portale && W.Portale ? W.Portale.pillola(d.portale) : null),
        h('h2', { class: 'titolo-pannello' }, d.titolo),
        h('span', { class: 'sotto-titolo' }, [d.categoria, d.dataDocumento ? C.data(d.dataDocumento) : '', d.riferimento].filter(Boolean).join(' · ')),
        rigaLettura(d),
        respinte,
        d.descrizione ? h('div', { class: 'testo-forte' }, d.descrizione) : null,
        anteprima(d), sorgente, revisioni,
        legami.length ? h('div', { class: 'sezione-pannello' }, h('span', { class: 'etichetta' }, 'A cosa è legato'), h('div', { class: 'scheda righe' }, legami)) : null,
        scadenza, condividi, cronologia);

      // UN giallo: approvare (chi approva, con una revisione in attesa), altrimenti aprire. Lettura: nessun giallo.
      const gialloOk = !lettura();
      let piede;
      if (d.puoApprovare && daApprovare && approva()) {
        piede = [h('button', { type: 'button', class: 'btn grande', onclick: () => respingi(d, daApprovare) }, 'Respingi'),
          h('button', { type: 'button', class: 'btn grande giallo', onclick: () => approvaRev(d, daApprovare) }, 'Approva la rev. ' + daApprovare.numero)];
      } else if (collegamento) {
        piede = [h('button', { type: 'button', class: 'btn grande' + (percorso || !gialloOk ? '' : ' giallo'), onclick: () => apriCollegamento(d.url) },
          percorso ? icona('cartella', 18, 2.2) : null, T.testoApriCollegamento(d.collegamentoTipo))];
      } else {
        piede = [h('button', { type: 'button', class: 'btn grande' + (gialloOk ? ' giallo' : ''), onclick: () => apriFile(vChe ? vChe.url : d.url, vChe ? (vChe.nomeDaScaricare || vChe.nomeFile) : d.nomeFile) }, 'Apri')];
      }
      const p = h('aside', { class: 'pannello pannello-doc', 'aria-label': 'Il documento ' + d.titolo }, corpo, h('div', { class: 'piede' }, piede));
      gialloPagina(true);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
    }

    /**
     * Fase 8 (§6.3): "Testo letto il 21/10 · 12 pagine", "Senza testo: è una scansione o un disegno"... Si chiede al server
     * per il file della revisione valida (letturaFile); se il server non lo sa (una versione di prima), niente riga.
     */
    function rigaLettura(d) {
      if (d.origine === 'collegamento' || !radice.WisperRegoleFase8) return null;
      const v = versioneAperta(d) || {};
      const idFile = v.idFile || d.idFile || W.D.idDaUrl(v.url || d.url);
      if (!idFile) return null;
      const zona = h('span', { class: 'secondario riga-lettura' });
      M.letture = M.letture || {};
      const mostra = l => { zona.textContent = radice.WisperRegoleFase8.statoLettura(l, new Date()); };
      // Il server della fase 8 la manda già nel documento (lettura); se no la si chiede.
      if (d.lettura && d.lettura.stato) mostra(d.lettura);
      else if (M.letture[idFile]) mostra(M.letture[idFile]);
      else Rete.get('/server/letturaFile?idFile=' + encodeURIComponent(idFile)).then(l => { M.letture[idFile] = l; mostra(l); }).catch(() => null);
      return zona;
    }

    function altro(d, scriveQui) {
      const voci = [
        scriveQui ? { testo: 'Cambia', fn: () => aggiungiDocumento({ esistente: d }) } : null,
        d.origine !== 'collegamento' ? { testo: 'Scarica', fn: () => { const v = versioneAperta(d); apriFile(v ? v.url : d.url, v ? (v.nomeDaScaricare || v.nomeFile) : d.nomeFile, true); } } : null,
        scrive() && d.puoScrivere !== false ? (d.archiviato ? { testo: 'Rimetti nell\'archivio', fn: () => archivia(d, false) } : { testo: 'Archivia', fn: () => archivia(d, true), pericolo: true }) : null,
        // Fase 7 (§8.1-8.2, §12.6): un documento si pubblica solo a mano; mai riservato, mai un collegamento, mai archiviato.
        W.Portale && W.Portale.puoPubblicare('documento') && d.origine !== 'collegamento' && d.vede !== 'riservati' && !d.archiviato
          ? (d.portale && d.portale.pubblicato ? { testo: 'Togli dal portale', fn: () => W.Portale.togli(d.portale.pubblicazione || { tipo: 'documento', rif: d.id, idCliente: d.idCliente || '' }, () => aggiorna(null)) }
            : { testo: 'Pubblica nel portale', fn: async () => { const r = await W.Portale.pubblica('documento', d.id, { idCliente: d.idCliente || undefined, nomeCliente: d.cliente, titolo: d.titolo }); if (r) aggiorna(null); } }) : null,
      ].filter(Boolean);
      if (!voci.length) return null;
      const b = h('button', { type: 'button', class: 'tondo piccolo', 'aria-label': 'Altre azioni', title: 'Altre azioni' }, icona('altro', 18));
      b.addEventListener('click', () => apriMenu(b, voci));
      return b;
    }

    /** Dopo un cambio: il documento nel pannello e la riga nell'elenco (si rilegge). */
    async function aggiorna(documento, messaggio, annulla) {
      if (documento) M.doc = documento;
      M.lista = null;
      M.approvare = null;
      W.caricaDashboard();
      if (messaggio) avviso(messaggio, false, null, annulla || null);
      const sopra = M.aperto;
      try { await leggiArchivio(); } catch (e) { /* alla prossima */ }
      W.ridisegna();
      if (sopra && M.doc) { M.aperto = sopra; disegnaPannello(); }
    }

    async function approvaRev(d, v) {
      const r = await lavora('Approvo', () => Rete.post('/server/approvaVersione', { id: v.id }));
      if (!r) return;
      aggiorna(r.documento, 'rev. ' + v.numero + ' approvata', { testo: 'Annulla', fn: async () => { const x = await lavora('Annullo', () => Rete.post('/server/annullaDecisione', { id: v.id })); if (x) aggiorna(x.documento, 'Di nuovo da approvare'); } });
    }

    function respingi(d, v) {
      const motivo = h('textarea', { rows: 3 });
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, d.titolo + ' · rev. ' + v.numero + (v.caricataDa ? ' di ' + v.caricataDa : '')), campo('Motivo', motivo, errore)]);
      disegna();
      let chiudi;
      const vai = async () => {
        if (!motivo.value.trim()) { errore = 'Scrivi il motivo: arriva a chi l\'ha caricata'; disegna(); motivo.focus(); return; }
        const r = await lavora('Respingo', () => Rete.post('/server/respingiVersione', { id: v.id, motivo: motivo.value.trim() }));
        if (!r) return;
        chiudi();
        aggiorna(r.documento, 'rev. ' + v.numero + ' respinta', { testo: 'Annulla', fn: async () => { const x = await lavora('Annullo', () => Rete.post('/server/annullaDecisione', { id: v.id })); if (x) aggiorna(x.documento, 'Di nuovo da approvare'); } });
      };
      chiudi = finestra({ titolo: 'Respingi la rev. ' + v.numero, corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Respingi')] });
    }

    async function togliVersione(d, v) {
      const ok = await conferma('Togliere la rev. ' + v.numero + '?', 'Va nel cestino: la revisione valida resta quella di prima.', 'Togli');
      if (!ok) return;
      const r = await lavora('Tolgo la revisione', () => Rete.post('/server/togliVersione', { id: v.id }));
      if (r) aggiorna(r.documento, 'rev. ' + v.numero + ' tolta', { testo: 'Annulla', fn: async () => { const x = await lavora('Rimetto', () => Rete.post('/server/togliVersione', { id: v.id, annulla: true })); if (x) aggiorna(x.documento, 'Rimessa'); } });
    }

    async function archivia(d, si, togliScadenza) {
      const corpo = { id: d.id, archiviato: si };
      if (togliScadenza !== undefined) corpo.togliScadenza = togliScadenza;
      let r;
      try {
        r = await lavora(si ? 'Archivio' : 'Rimetto', async () => {
          try { return await Rete.post('/server/archiviaDocumento', corpo); } catch (e) { if (e.dati && e.dati.serveConferma) return { domanda: e.dati }; throw e; }
        });
      } catch (e) { return; }
      if (!r) return;
      if (r.domanda) {
        const togli = await conferma('Il documento ha una scadenza aperta', r.domanda.errore, 'Sì, togli la scadenza');
        archivia(d, si, togli);
        return;
      }
      if (si) { chiudiPannello(); aggiorna(null, 'Archiviato: si ritrova cercando fra gli archiviati', { testo: 'Annulla', fn: () => archivia(d, false) }); } else aggiorna(r.documento, 'Rimesso nell\'archivio');
    }

    // ===================================================================== aggiungere e cambiare

    /**
     * Aggiungi un documento (finestra a due colonne): a sinistra il file o l'indirizzo, a destra i dati.
     * opzioni: { esistente, trascinato, url, legami: {idCliente, idCommessa, idSede, idTicket, idContratto}, categoria, dopo(documento) }.
     */
    async function aggiungiDocumento(opzioni) {
      const o = opzioni || {};
      try { await leggiCategorie(); } catch (e) { avviso(e.message, true); return; }
      const d0 = o.esistente || null;
      const x = {
        modo: d0 ? d0.origine : o.url ? 'link' : (o.trascinato ? 'file' : ''),
        file: o.trascinato || null,
        url: d0 && d0.origine === 'collegamento' ? d0.url : (o.url || ''),
        cartella: d0 ? !!d0.cartella : null,
        principale: d0 ? !!d0.principale : false,
        idCategoria: d0 ? d0.idCategoria : (o.categoria ? ((M.categorie.find(c => c.nome === o.categoria) || {}).id || '') : ''),
        legami: d0 ? { idCliente: d0.idCliente || '', idCommessa: d0.idCommessa || '', idSede: d0.idSede || '', idTicket: d0.idTicket || null, ticket: d0.ticket || '', idContratto: d0.idContratto || null, contratto: d0.contratto || '' }
          : Object.assign({ idCliente: '', idCommessa: '', idSede: '', idTicket: null, ticket: '', idContratto: null, contratto: '' }, o.legami || {}),
        scade: d0 ? !!d0.scadenza : false, rifAperto: d0 ? !!(d0.riferimento || d0.dataDocumento) : false,
        vede: d0 ? d0.vede : '', idFile: idFileNuovo(), titoloToccato: !!d0,
      };
      if (x.modo === 'link') x.modo = 'collegamento';
      const v = {
        titolo: h('input', { type: 'text', value: d0 ? d0.titolo : '' }),
        url: h('input', { type: 'text', value: x.url, placeholder: 'https://… oppure \\\\server\\cartella', spellcheck: 'false', autocomplete: 'off' }),
        riferimento: h('input', { type: 'text', value: d0 ? d0.riferimento || '' : '' }),
        data: h('input', { type: 'date', value: d0 ? d0.dataDocumento || '' : '' }),
        scadData: h('input', { type: 'date', value: d0 && d0.scadenza ? d0.scadenza.data : '' }),
        descrizione: h('textarea', { rows: 2 }),
      };
      v.descrizione.value = d0 ? d0.descrizione || '' : '';
      let ogniMesi = d0 && d0.scadenza ? (d0.scadenza.ogniMesi || '') : '';
      let errori = {};
      const sinistra = h('div', { class: 'colonna-f' });
      const destra = h('div', { class: 'colonna-f' });

      const proponiTitolo = () => {
        if (x.titoloToccato) return;
        v.titolo.value = x.modo === 'file' && x.file ? T.titoloProposto(x.file.nome) : x.modo === 'collegamento' ? T.titoloProposto(v.url.value) : '';
      };
      v.titolo.addEventListener('input', () => { x.titoloToccato = true; });
      v.url.addEventListener('input', () => { delete errori.url; x.cartella = null; proponiTitolo(); disegnaSinistra(true); });

      function disegnaSinistra(soloTipo) {
        const tipo = x.modo === 'collegamento' && v.url.value.trim() ? T.tipoCollegamento(v.url.value) : null;
        if (tipo && !tipo.errore && x.cartella === null) x.cartella = tipo.cartella;
        if (soloTipo) { const z = sinistra.querySelector('.tipo-coll'); if (z) z.replaceWith(zonaTipo(tipo)); const zf = sinistra.querySelector('.errore-url'); if (zf) zf.textContent = ''; return; }
        svuota(sinistra);
        if (!d0) {
          const scelta = (modo, ic, titolo, sotto) => h('button', { type: 'button', class: 'scelta-ruolo grande-doc' + (x.modo === modo ? ' scelto' : ''), 'aria-pressed': x.modo === modo ? 'true' : 'false',
            onclick: () => { x.modo = modo; proponiTitolo(); disegnaSinistra(); disegnaDestra(); if (modo === 'collegamento') setTimeout(() => v.url.focus(), 30); } },
          h('span', { class: 'ico-riga ' + (modo === 'file' ? 'ico-grigio' : 'ico-blu') }, icona(ic, 20, 2.2)), h('span', { class: 'testi' }, h('b', null, titolo), h('span', null, sotto)));
          aggiungi(sinistra, [h('div', { class: 'due-scelte' }, scelta('file', 'carica', 'Carica un file', 'Scegli dal computer'), scelta('collegamento', 'link', 'Collega un file o una cartella', 'OneDrive, Drive, il computer'))]);
        }
        if (x.modo === 'file' && !d0) {
          aggiungi(sinistra, [x.file
            ? h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('file'), titolo: x.file.nome, sotto: [T.tipoFile(x.file.mime, x.file.nome), T.grandezza(x.file.byte), 'diventa la rev. 0'].filter(Boolean).join(' · '),
              destra: h('button', { type: 'button', class: 'btn collegamento', onclick: scegli }, 'Cambia') }))
            : h('button', { type: 'button', class: 'btn grande largo', onclick: scegli }, icona('carica', 18, 2.2), 'Scegli un file dal computer'),
          errori.file ? h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errori.file)) : null]);
        }
        if (x.modo === 'collegamento') {
          aggiungi(sinistra, [h('div', { class: 'campo' + (errori.url ? ' sbagliato' : '') }, h('label', null, 'Collegamento'),
            h('div', { class: 'campo-con-pulsante' }, v.url, h('button', { type: 'button', class: 'btn', onclick: incolla }, 'Incolla')),
            h('div', { class: 'errore errore-url' }, errori.url || '')),
          zonaTipo(tipo)]);
        }
        if (!d0) {
          aggiungi(sinistra, [rigaNonCollegata('Sfoglia OneDrive e Google Drive', null),
            h('div', { class: 'zona-file' }, icona('importa', 26, 2), h('span', null, 'Trascina qui un file o un link'))]);
          const zona = sinistra.querySelector('.zona-file');
          zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('accoglie'); });
          zona.addEventListener('dragleave', () => zona.classList.remove('accoglie'));
          zona.addEventListener('drop', e => {
            e.preventDefault();
            zona.classList.remove('accoglie');
            const dt = e.dataTransfer;
            if (dt.files && dt.files.length) { const f = dt.files[0]; x.modo = 'file'; x.file = { file: f, nome: f.name, mime: f.type || T.mimeDi(f.name), byte: f.size }; }
            else { const u = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/\r?\n/).find(y => y && y[0] !== '#'); if (u) { x.modo = 'collegamento'; v.url.value = u.trim(); x.cartella = null; } }
            delete errori.file;
            proponiTitolo(); disegnaSinistra(); disegnaDestra();
          });
        }
      }

      function zonaTipo(tipo) {
        if (!tipo || tipo.errore) return h('div', { class: 'tipo-coll' });
        return h('div', { class: 'tipo-coll pillole' }, pill(tipo.pillola, 'blu'),
          h('label', { class: 'spunta-campo piccola' }, h('input', { type: 'checkbox', checked: !!x.cartella, onchange: e => { x.cartella = e.target.checked; disegnaDestra(); } }), 'È una cartella'));
      }

      async function scegli() {
        const f = await scegliFile('documenti');
        if (!f) return;
        x.file = f;
        delete errori.file;
        proponiTitolo(); disegnaSinistra(); disegnaDestra();
      }

      async function incolla() {
        try {
          const t = await navigator.clipboard.readText();
          if (t) { v.url.value = t.trim(); x.cartella = null; delete errori.url; proponiTitolo(); disegnaSinistra(); return; }
        } catch (e) { /* la WebView può non dare gli appunti: si incolla con Ctrl+V */ }
        v.url.focus();
        avviso('Incolla con Ctrl+V nel campo del collegamento');
      }

      const categorieScegliibili = () => M.categorie.filter(c => (c.attiva && !c.sistema) || String(c.id) === String(x.idCategoria) || (c.sistema && /classificare/i.test(c.nome) && d0));

      function disegnaDestra() {
        svuota(destra);
        if (!x.modo) { aggiungi(destra, [h('div', { class: 'vuoto' }, 'Prima scegli il file o il collegamento.')]); return; }
        const cat = M.categorie.find(c => String(c.id) === String(x.idCategoria));
        const vedeBase = cat ? cat.vede : 'tutti';
        const vede = x.vede || vedeBase;
        const leg = x.legami;
        const cli = leg.idCliente ? W.cliente(leg.idCliente) : null;
        const sede = leg.idSede ? S.ana.sedi.find(s => String(s.id) === String(leg.idSede)) : null;
        const cartellaPrincipale = x.modo === 'collegamento' && x.cartella && (leg.idCommessa || leg.idCliente);
        aggiungi(destra, [
          campo('Titolo', v.titolo, errori.titolo),
          h('div', { class: 'campo' + (errori.categoria ? ' sbagliato' : '') }, h('label', null, 'Categoria'),
            h('div', { class: 'pillole' }, categorieScegliibili().map(c => h('button', { type: 'button', class: 'pillola' + (String(c.id) === String(x.idCategoria) ? ' scelta' : ''), 'aria-pressed': String(c.id) === String(x.idCategoria) ? 'true' : 'false',
              onclick: () => { x.idCategoria = c.id; delete errori.categoria; if (!x.vede || x.vede === vedeBase) x.vede = ''; if (c.scadenzaMesi && !x.scade && !d0) { x.scade = false; } disegnaDestra(); } }, c.nome))),
            errori.categoria ? h('div', { class: 'errore' }, errori.categoria) : null),
          h('div', { class: 'campo' }, h('label', null, 'A cosa è legato'),
            h('div', { class: 'scheda righe legami-f' },
              riga({ sinistra: cli ? iniziali(cli.nome, true) : quadrato('clienti'), titolo: cli ? cli.nome : 'Nessun cliente', sotto: [leg.idCommessa, sede ? sede.nome : '', leg.ticket].filter(Boolean).join(' · ') || 'Cliente, commessa, impianto',
                onclick: () => cambiaLegami(x.legami, nuovi => { x.legami = nuovi; disegnaDestra(); }) }))),
          errori.legami ? h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errori.legami)) : null,
          cartellaPrincipale ? h('label', { class: 'spunta-campo riquadrata' }, h('input', { type: 'checkbox', checked: x.principale, onchange: e => { x.principale = e.target.checked; } }),
            'È la cartella principale di ' + (leg.idCommessa ? 'questa commessa' : 'questo cliente')) : null,
          x.rifAperto ? h('div', { class: 'riga-campi' }, campo('Riferimento', v.riferimento), campo('Data del documento', v.data))
            : h('div', null, h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { x.rifAperto = true; disegnaDestra(); v.riferimento.focus(); } }, '+ Riferimento e data')),
          h('div', { class: 'campo' }, h('label', null, 'Scade'), segmenti([['no', 'No'], ['si', 'Sì']], x.scade ? 'si' : 'no', s => {
            x.scade = s === 'si';
            if (x.scade && !v.scadData.value && cat && cat.scadenzaMesi) { const oggi = C.oggiIso(); v.scadData.value = piuMesi(oggi, cat.scadenzaMesi); if (!ogniMesi) ogniMesi = cat.scadenzaMesi; }
            disegnaDestra();
          }, 'piccoli')),
          x.scade ? h('div', { class: 'riga-campi' }, campo('Il', v.scadData, errori.scadenza),
            campo('Ogni', selezione([['', 'Una volta'], ['6', '6 mesi'], ['12', '1 anno'], ['24', '2 anni'], ['36', '3 anni'], ['60', '5 anni']], String(ogniMesi || ''), y => { ogniMesi = y; }))) : null,
          h('div', { class: 'campo' }, h('label', null, 'Chi lo vede'), segmenti([['tutti', 'Tutti'], ['costi', 'Chi vede i prezzi']].concat(titolare() ? [['riservati', 'Solo il titolare']] : []), vede, s => { x.vede = s; disegnaDestra(); }, 'piccoli')),
        ]);
      }

      function piuMesi(iso, n) {
        const [a, m, g] = iso.split('-').map(Number);
        const tot = m - 1 + Number(n);
        const anno = a + Math.floor(tot / 12);
        const mese = ((tot % 12) + 12) % 12;
        const ultimo = new Date(anno, mese + 1, 0, 12).getDate();
        return anno + '-' + String(mese + 1).padStart(2, '0') + '-' + String(Math.min(g, ultimo)).padStart(2, '0');
      }

      let chiudi;
      const salva = async () => {
        errori = {};
        if (!x.modo) { avviso('Scegli il file o il collegamento', true); return; }
        if (!v.titolo.value.trim()) errori.titolo = 'Titolo: scrivi di cosa si tratta';
        if (!x.idCategoria) errori.categoria = 'Categoria: scegli la categoria';
        if (x.modo === 'file' && !d0 && !x.file) errori.file = 'Carica il file o incolla il collegamento';
        if (x.modo === 'collegamento') { const t = T.tipoCollegamento(v.url.value); if (t.errore) errori.url = t.errore; }
        if (x.scade && !v.scadData.value) errori.scadenza = 'Data: scrivi quando scade';
        if (Object.keys(errori).length) { disegnaSinistra(); disegnaDestra(); return; }
        const doc = {
          titolo: v.titolo.value.trim(), idCategoria: x.idCategoria, descrizione: v.descrizione.value.trim(), riferimento: v.riferimento.value.trim(), dataDocumento: v.data.value || '',
          idCliente: x.legami.idCliente || '', idCommessa: x.legami.idCommessa || '', idSede: x.legami.idSede || null, idTicket: x.legami.idTicket || null, idContratto: x.legami.idContratto || null,
        };
        if (x.vede) doc.vede = x.vede;
        if (x.scade) doc.scadenza = { data: v.scadData.value, ogniMesi: ogniMesi ? Number(ogniMesi) : null };
        else if (d0 && d0.scadenza) doc.scadenza = null;
        if (x.modo === 'collegamento') Object.assign(doc, { origine: 'collegamento', url: v.url.value.trim(), cartella: !!x.cartella, principale: !!(x.principale && x.cartella) });
        if (d0) doc.id = d0.id;
        else doc.idLocale = 'pc-' + x.idFile;
        const ris = await lavora(d0 ? 'Salvo' : 'Salvo il documento', async () => {
          if (x.modo === 'file' && !d0) {
            const c = await carica(x.file, 'documento', x.idFile);
            if (c.gia) {
              const ok = await conferma('Questo file c\'è già', 'Questo file c\'è già: «' + c.gia.titolo + '» rev. ' + c.gia.revisione + '. Lo carico lo stesso?', 'Caricalo lo stesso');
              if (!ok) return { annullato: true };
            }
            Object.assign(doc, { origine: 'file', idFile: c.file.id });
          }
          return Rete.post('/server/salvaDocumento', { documento: doc });
        });
        if (!ris || ris.annullato) return;
        chiudi();
        M.lista = null;
        W.caricaDashboard();
        avviso(d0 ? 'Salvato' : 'Documento aggiunto: ' + ris.documento.titolo);
        if (o.dopo) { o.dopo(ris.documento); }
        if (ris.chiudeScadenza && !o.dopo) {
          const sc = ris.chiudeScadenza;
          const si = await conferma('Chiude una scadenza?', 'È la verifica che chiude la scadenza del ' + C.data(sc.data) + ' (' + sc.titolo + ')?', 'Sì, segna fatta');
          if (si) await faiScadenza(sc.id, { idDocumento: ris.documento.id });
        }
        if (o.dopo) return;
        if (W.percorso().indexOf('documenti') === 0 && !W.percorso().startsWith('documenti/scadenz') && !W.percorso().startsWith('documenti/modelli')) {
          try { await leggiArchivio(); } catch (e) { /* alla prossima */ }
          W.ridisegna();
          apriPannello(ris.documento.id);
        } else W.ridisegna();
      };

      disegnaSinistra(); proponiTitolo(); disegnaDestra();
      chiudi = finestra({
        titolo: d0 ? 'Cambia il documento' : 'Aggiungi un documento', larghezza: 'larga', fuoco: false,
        corpo: h('div', { class: 'due-colonne-f' }, sinistra, destra),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva il documento')],
      });
      if (x.modo === 'collegamento' && !v.url.value) setTimeout(() => v.url.focus(), 40);
    }

    /** A cosa è legato: cliente, commessa, impianto (e il ticket, se c'era), in una finestra. */
    function cambiaLegami(leg0, fatto) {
      const leg = Object.assign({}, leg0);
      const zona = h('div', { class: 'fila' });
      const disegna = () => {
        const cli = leg.idCliente ? W.cliente(leg.idCliente) : null;
        const commesse = S.ana.commesse.filter(m => (!leg.idCliente || m.idCliente === leg.idCliente) && !m.archiviata && !m.modello && (m.stato !== 'CHIUSA' || m.id === leg.idCommessa));
        const impianti = S.ana.sedi.filter(s => (!leg.idCliente || s.idSoggetto === leg.idCliente) && !s.archiviata);
        aggiungi(svuota(zona), [
          h('div', { class: 'campo' }, h('label', null, 'Cliente'), cli
            ? h('div', { class: 'scelta-card scelta' }, iniziali(cli.nome, true), h('span', { class: 'testi' }, h('b', null, cli.nome), h('span', null, cli.citta || '')),
              h('button', { type: 'button', class: 'btn collegamento', onclick: () => { leg.idCliente = ''; leg.idCommessa = ''; leg.idSede = ''; disegna(); } }, 'Togli'))
            : sceltaCliente(c => { leg.idCliente = c.id; disegna(); })),
          leg.idCliente ? h('div', { class: 'campo' }, h('label', null, 'Commessa'), h('div', { class: 'pillole' },
            h('button', { type: 'button', class: 'pillola' + (!leg.idCommessa ? ' scelta' : ''), onclick: () => { leg.idCommessa = ''; disegna(); } }, 'Nessuna'),
            commesse.map(m => h('button', { type: 'button', class: 'pillola' + (leg.idCommessa === m.id ? ' scelta' : ''), onclick: () => { leg.idCommessa = m.id; disegna(); } }, m.id + ' · ' + m.descrizione)))) : null,
          leg.idCliente && impianti.length ? h('div', { class: 'campo' }, h('label', null, 'Impianto o sede'), h('div', { class: 'pillole' },
            h('button', { type: 'button', class: 'pillola' + (!leg.idSede ? ' scelta' : ''), onclick: () => { leg.idSede = ''; disegna(); } }, 'Nessuno in particolare'),
            impianti.map(s => h('button', { type: 'button', class: 'pillola' + (String(leg.idSede) === String(s.id) ? ' scelta' : ''), onclick: () => { leg.idSede = s.id; disegna(); } }, s.nome)))) : null,
          leg.ticket ? h('div', { class: 'secondario' }, 'Del ticket ' + leg.ticket) : null]);
      };
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'A cosa è legato', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: () => { chiudi(); fatto(leg); } }, 'Fatto')] });
    }

    /** La ricerca di un cliente in una finestra: i clienti come schede, filtrati mentre si scrive. */
    function sceltaCliente(fatto) {
      const box = h('div', { class: 'fila' });
      const input = h('input', { type: 'search', placeholder: 'Scrivi il nome', 'aria-label': 'Cerca il cliente' });
      const elenco = h('div', { class: 'fila' });
      const disegna = () => {
        const t = C.normalizza(input.value);
        const lista = W.clientiAttivi().filter(c => !t || C.normalizza([c.nome].concat(c.alias || []).join(' ')).indexOf(t) >= 0).sort((a, b) => a.nome.localeCompare(b.nome, 'it')).slice(0, 6);
        aggiungi(svuota(elenco), lista.map(c => h('button', { type: 'button', class: 'scelta-card', onclick: () => fatto(c) }, iniziali(c.nome, true), h('span', { class: 'testi' }, h('b', null, c.nome), h('span', null, c.citta || '')))));
      };
      input.addEventListener('input', disegna);
      disegna();
      aggiungi(box, [h('label', { class: 'cerca' }, icona('cerca', 18), input), elenco]);
      setTimeout(() => input.focus(), 40);
      return box;
    }

    /** I filtri "per cliente", "per commessa", "per impianto": una finestra di scelta. */
    function scegliLegame(tipo, _x, fatto) {
      const input = h('input', { type: 'search', placeholder: 'Scrivi per cercare', 'aria-label': 'Cerca' });
      const elenco = h('div', { class: 'scheda righe' });
      let chiudi;
      const voci = () => {
        const t = C.normalizza(input.value);
        const passa = s => !t || C.normalizza(s).indexOf(t) >= 0;
        if (tipo === 'cliente') return W.clientiAttivi().filter(c => passa(c.nome)).sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map(c => ({ id: c.id, t1: c.nome, t2: c.citta || '' }));
        if (tipo === 'commessa') return S.ana.commesse.filter(m => !m.modello && !m.archiviata && passa(m.id + ' ' + m.descrizione + ' ' + ((W.cliente(m.idCliente) || {}).nome || ''))).map(m => ({ id: m.id, t1: m.id + ' · ' + m.descrizione, t2: (W.cliente(m.idCliente) || {}).nome || '' }));
        return S.ana.sedi.filter(s => !s.archiviata && passa(s.nome + ' ' + ((W.cliente(s.idSoggetto) || {}).nome || ''))).map(s => ({ id: s.id, t1: s.nome, t2: [(W.cliente(s.idSoggetto) || {}).nome, s.categoriaNome].filter(Boolean).join(' · ') }));
      };
      const disegna = () => {
        const lista = voci().slice(0, 12);
        aggiungi(svuota(elenco), lista.length ? lista.map(y => riga({ titolo: y.t1, sotto: y.t2, onclick: () => { chiudi(); fatto(y); } })) : [h('p', { class: 'vuoto sinistra' }, 'Nessuno.')]);
      };
      input.addEventListener('input', disegna);
      disegna();
      chiudi = finestra({ titolo: { cliente: 'Per cliente', commessa: 'Per commessa', impianto: 'Per impianto' }[tipo], corpo: [h('label', { class: 'cerca' }, icona('cerca', 18), input), elenco],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla')] });
    }

    /** Carica una revisione: il file e cosa cambia (obbligatorio dalla rev. 1). */
    function caricaRevisione(d) {
      const nota = h('input', { type: 'text' });
      let file = null;
      let errori = {};
      const idFile = idFileNuovo();
      const zona = h('div', { class: 'fila' });
      const prossima = Math.max(-1, ...(d.versioni || []).map(v => v.numero)) + 1;
      const disegna = () => aggiungi(svuota(zona), [
        file ? h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('file'), titolo: file.nome, sotto: [T.tipoFile(file.mime, file.nome), T.grandezza(file.byte), 'diventa la rev. ' + prossima].join(' · '),
          destra: h('button', { type: 'button', class: 'btn collegamento', onclick: scegli }, 'Cambia') }))
          : h('button', { type: 'button', class: 'btn grande largo', onclick: scegli }, icona('carica', 18, 2.2), 'Scegli un file dal computer'),
        errori.file ? h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errori.file)) : null,
        campo('Cosa cambia', nota, errori.nota),
        approva() ? null : h('div', { class: 'banda calma' }, icona('orologio', 20), h('span', { class: 'spazio' }, 'In questa categoria la revisione va approvata: fino ad allora vale la rev. ' + d.revisione))]);
      async function scegli() { const f = await scegliFile('documenti'); if (f) { file = f; delete errori.file; disegna(); } }
      disegna();
      let chiudi;
      const vai = async () => {
        errori = {};
        if (!file) errori.file = 'Scegli il file della revisione';
        if (!nota.value.trim() && prossima > 0) errori.nota = 'Scrivi cosa cambia in questa revisione';
        if (Object.keys(errori).length) { disegna(); return; }
        const r = await lavora('Carico la revisione', async () => {
          const c = await carica(file, 'documento', idFile);
          return Rete.post('/server/caricaVersione', { id: d.id, idFile: c.file.id, nota: nota.value.trim() });
        });
        if (!r) return;
        chiudi();
        const nuova = (r.documento.versioni || [])[0];
        aggiorna(r.documento, nuova && nuova.statoVisto === 'Da approvare' ? 'rev. ' + nuova.numero + ' caricata: va approvata' : 'rev. ' + (nuova ? nuova.numero : prossima) + ' caricata');
      };
      chiudi = finestra({ titolo: 'Carica una revisione', corpo: [h('p', { class: 'testo-forte' }, d.titolo), zona], fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Carica la revisione')] });
    }

    /** Manda per email: il file della revisione valida in allegato, o il collegamento nel messaggio. */
    function mandaPerEmail(d) {
      // Il cliente del documento; senza, quello della sua commessa (06/11/2026: l'email del cliente è già nel campo A).
      const clienteDoc = () => (d.idCliente && W.cliente(d.idCliente)) || (d.idCommessa && W.commessa(d.idCommessa) && W.cliente(W.commessa(d.idCommessa).idCliente)) || null;
      const cli = clienteDoc();
      const a = h('input', { type: 'email', value: (cli && cli.email) || '', placeholder: cli ? 'email di ' + cli.nome : 'indirizzo email' });
      W.emailFresca(a, () => (clienteDoc() || {}).email || '');
      const cc = h('input', { type: 'text' });
      const oggetto = h('input', { type: 'text', placeholder: 'Quello dello studio' });
      const messaggio = h('textarea', { rows: 5, placeholder: 'Quello dello studio' });
      let errore = '';
      const zonaA = h('div');
      const disegnaA = () => aggiungi(svuota(zonaA), [campo('A', a, errore)]);
      disegnaA();
      const messaggioZona = h('div', { class: 'fila nascosto' }, campo('Oggetto', oggetto), campo('Copia anche a', cc), campo('Messaggio', messaggio));
      const cambia = h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start' }, onclick: () => { messaggioZona.classList.remove('nascosto'); cambia.remove(); oggetto.focus(); } }, 'Cambia il messaggio');
      const v = versioneAperta(d);
      const collegamento = d.origine === 'collegamento';
      let chiudi;
      const manda = async () => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.value.trim())) { errore = 'Manca l\'indirizzo del cliente'; disegnaA(); a.focus(); return; }
        const corpo = { id: d.id, a: a.value.trim() };
        if (v && !collegamento) corpo.idVersione = v.id;
        if (cc.value.trim()) corpo.cc = cc.value.trim();
        if (oggetto.value.trim()) corpo.oggetto = oggetto.value.trim();
        if (messaggio.value.trim()) corpo.messaggio = messaggio.value.trim();
        const r = await lavora('Mando l\'email', () => Rete.post('/server/inviaDocumento', corpo));
        if (!r) return;
        chiudi();
        avviso('Mandato a ' + corpo.a);
        const x = await Rete.get('/server/documento?id=' + d.id).catch(() => null);
        if (x && x.documento && String(M.aperto) === String(d.id)) { M.doc = x.documento; disegnaPannello(); }
      };
      chiudi = finestra({
        titolo: 'Manda per email', fuoco: false,
        corpo: [h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato(collegamento ? 'link' : 'file'), titolo: d.titolo,
          sotto: collegamento ? 'Il collegamento va nel messaggio' : [v ? 'rev. ' + v.numero : '', v ? v.nomeFile : d.nomeFile, T.grandezza(v ? v.byte : d.byte)].filter(Boolean).join(' · ') })),
        collegamento ? h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Il cliente lo apre solo se in ' + (d.collegamentoNome || 'OneDrive') + ' è condiviso anche fuori dallo studio')) : null,
        zonaA, cambia, messaggioZona],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: manda }, icona('email', 18, 2.2), 'Manda')],
      });
    }

    /** Il link che scade (solo se il server lo dice collegato: CONDIVISIONE_INDIRIZZO scritto). */
    function creaLink(d) {
      const perChi = h('input', { type: 'text', value: d.cliente || '' });
      const giorni = h('input', { type: 'text', inputmode: 'numeric', value: String(S.ana.impostazioni.CONDIVISIONE_GIORNI || 14) });
      let chiudi;
      const vai = async () => {
        const r = await lavora('Preparo il link', () => Rete.post('/server/condividiDocumento', { id: d.id, perChi: perChi.value.trim(), giorni: Number(giorni.value) || undefined }));
        if (!r) return;
        chiudi();
        if (r.link && await copiaTesto(r.link)) avviso('Link copiato: vale fino al ' + C.data(r.condivisione.scade));
        else avviso('Link pronto: vale fino al ' + C.data(r.condivisione.scade));
        const x = await Rete.get('/server/documento?id=' + d.id).catch(() => null);
        if (x && x.documento) { M.doc = x.documento; disegnaPannello(); }
      };
      chiudi = finestra({ titolo: 'Link che scade', corpo: [campo('Per chi', perChi), campo('Quanti giorni vale', B.conSuffisso(giorni, 'giorni'))],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Crea e copia il link')] });
    }

    async function revocaLink(d, x) {
      const ok = await conferma('Revocare il link?', 'Chi l\'ha ricevuto non potrà più scaricare il documento.', 'Revoca', true);
      if (!ok) return;
      const r = await lavora('Revoco', () => Rete.post('/server/revocaCondivisione', { id: x.id }));
      if (r) { M.doc = r.documento || M.doc; avviso('Link revocato'); disegnaPannello(); }
    }

    // ===================================================================== da approvare

    function paginaApprovare(pagina) {
      const zonaSeg = h('div');
      aggiungi(pagina, [testata('Da approvare'), zonaSeg]);
      conDati(pagina, async () => {
        const [att, resp] = await Promise.all([Rete.get('/server/documenti?' + qs({ archivio: true, stato: 'da_approvare' })), Rete.get('/server/documenti?' + qs({ archivio: true, stato: 'respinti' }))]);
        if (!M.lista) M.lista = { conteggi: att.conteggi, documenti: [] };
        // Chi ha caricato, quando e la nota sono nella revisione: si leggono i documenti in attesa (di solito pochi).
        const dettagli = await Promise.all(att.documenti.slice(0, 20).map(d => Rete.get('/server/documento?id=' + d.id).then(r => r.documento).catch(() => d)));
        M.approvare = { attesa: dettagli, respinti: resp.documenti || [], conteggi: att.conteggi };
      }, () => {
        aggiungi(zonaSeg, [segmentiDoc('approvare')]);
        const a = M.approvare;
        if (!a.attesa.length && !a.respinti.length) { aggiungi(pagina, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da approvare')]); return; }
        const col = 'minmax(0, 2fr) 80px minmax(0, 1.2fr) 110px minmax(0, 1.6fr)';
        const tabellaRev = (lista, respinte) => {
          const tab = h('div', { class: 'tab tab-approvare' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Documento'), h('span', null, 'Rev.'), h('span', null, 'Caricata da'), h('span', null, 'Quando'), h('span', null, respinte ? 'Motivo' : 'Cosa cambia')));
          lista.forEach(d => {
            const v = (d.versioni || []).find(x => x.statoVisto === (respinte ? 'Respinta' : 'Da approvare')) || {};
            aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-id': d.id, onclick: () => apriPannello(d.id) },
              h('span', { class: 'titolo-doc' }, iconaDoc(d), h('span', { class: 'doppia' }, h('span', null, d.titolo), h('span', null, [d.categoria, legatoA(d)].filter(Boolean).join(' · ')))),
              h('span', null, pill('rev. ' + (v.numero !== undefined ? v.numero : d.daApprovare), respinte ? 'rosso' : 'giallo')),
              h('span', { class: 't2 taglia' }, v.caricataDa || ''), h('span', { class: 't2' }, giornoBreve(v.caricataIl)),
              h('span', { class: 't2 taglia', title: respinte ? v.motivoRifiuto : v.nota }, (respinte ? v.motivoRifiuto : v.nota) || '—'))]);
          });
          return tab;
        };
        if (a.attesa.length) aggiungi(pagina, [h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, (approva() ? 'Da approvare' : 'Le tue in attesa') + ' · ' + a.attesa.length), tabellaRev(a.attesa, false))]);
        if (a.respinti.length) aggiungi(pagina, [h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Le tue respinte · ' + a.respinti.length), tabellaRev(a.respinti.map(d => d), true))]);
        // Le respinte hanno bisogno del dettaglio per il motivo: si completano dopo.
        Promise.all(a.respinti.map(d => Rete.get('/server/documento?id=' + d.id).then(r => r.documento).catch(() => d))).then(dett => {
          if (!dett.length || !document.body.contains(pagina)) return;
          a.respinti = dett;
          const vecchia = pagina.querySelectorAll('.tab-approvare');
          if (vecchia.length) vecchia[vecchia.length - 1].replaceWith(tabellaRev(dett, true));
        });
      });
    }

    // ===================================================================== scadenze

    async function leggiScadenze() {
      M.scadenze = await Rete.get('/server/scadenze');
    }

    function paginaScadenze(pagina, apriId) {
      const puoNuova = scrive() || puo('ticket', 2);
      const giallo = puoNuova ? h('button', { type: 'button', class: 'btn giallo', onclick: () => nuovaScadenza() }, icona('piu', 18, 2.6), 'Nuova scadenza') : null;
      const zonaSeg = h('div');
      aggiungi(pagina, [testata('Scadenze', giallo), zonaSeg]);
      conDati(pagina, () => Promise.all([M.scadenze ? Promise.resolve() : leggiScadenze(), M.lista ? Promise.resolve() : leggiArchivio().catch(() => null)]), () => {
        aggiungi(zonaSeg, [segmentiDoc('scadenze')]);
        const s = M.scadenze;
        const gruppi = [['scadute', 'Scadute'], ['entro', 'Nel preavviso'], ['piuAvanti', 'Più avanti']];
        if (!gruppi.some(g => (s[g[0]] || []).length)) aggiungi(pagina, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Nessuna scadenza aperta')]);
        const col = '64px minmax(0, 2fr) minmax(0, 1.6fr) 110px minmax(0, 1.3fr) 150px';
        gruppi.forEach(([k, nome]) => {
          const lista = s[k] || [];
          if (!lista.length) return;
          const tab = h('div', { class: 'tab tab-scadenze' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } },
            h('span', null, 'Data'), h('span', null, 'Titolo'), h('span', null, 'Cliente e impianto'), h('span', null, 'Ogni'), h('span', null, 'Documento'), h('span', null, 'Stato')));
          lista.forEach(x => {
            const gg = T.giornoGrande(x.data);
            const colore = T.coloreScadenza(x.statoVisto);
            aggiungi(tab, [h('div', { class: 'r cliccabile', style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', onclick: () => apriScadenza(x.id, x), onkeydown: e => { if (e.key === 'Enter') apriScadenza(x.id, x); } },
              h('span', { class: 'giorno-scad gs-' + colore }, h('b', null, gg.g), h('span', null, gg.m)),
              h('span', { class: 'doppia' }, h('span', null, x.titolo), h('span', null, x.tipoNome || '')),
              h('span', { class: 't2 taglia' }, [x.cliente || 'Studio', x.impianto].filter(Boolean).join(' · ')),
              h('span', { class: 't2' }, T.ogni(x.ogniMesi)),
              h('span', { class: 't2 taglia' }, x.documento || (x.ticket ? 'Ticket ' + x.ticket : '—')),
              h('span', null, pill(x.statoVisto === 'Scaduta' ? 'Scaduta ' + x.statoDettaglio : x.statoVisto === 'Prossima' ? 'Prossima' : x.statoVisto, colore)))]);
          });
          aggiungi(pagina, [h('div', { class: 'sezione' }, h('span', { class: 'etichetta' + (k === 'scadute' ? ' rossa' : '') }, nome + ' · ' + lista.length), tab)]);
        });
        aggiungi(pagina, [h('div', { class: 'filtri' }, h('span', { class: 'secondario' }, 'Le scadenze si vedono anche nel calendario, nel loro giorno.'), h('span', { class: 'spazio' }),
          h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.esporta('scadenze', {}) }, 'Esporta per Excel'))]);
        if (apriId) apriScadenza(apriId);
      });
    }

    /** Cerca una scadenza fra quelle lette, o la chiede al server (anche fatte e annullate). */
    async function trovaScadenza(id) {
      const tutte = M.scadenze ? [].concat(M.scadenze.scadute || [], M.scadenze.entro || [], M.scadenze.piuAvanti || []) : [];
      const x = tutte.find(s => String(s.id) === String(id));
      if (x) return x;
      const r = await Rete.get('/server/scadenze?stato=tutte');
      return (r.scadenze || []).find(s => String(s.id) === String(id)) || null;
    }

    /** La finestra della scadenza: i dati, Segna fatta (giallo), il verbale, la lettera, Rimanda, Togli. */
    async function apriScadenza(id, gia) {
      const x = gia || await lavora('Apro la scadenza', () => trovaScadenza(id));
      if (!x) { if (x === null) avviso('Scadenza ' + id + ' non trovata', true); return; }
      const aperta = x.stato === 'aperta';
      const puoScrivere = x.puoScrivere !== false && aperta && (scrive() || puo('ticket', 2));
      const verifica = /^verifica_/.test(x.tipo);
      const coppia = (k, v) => v ? h('div', { class: 'coppia' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v)) : null;
      let chiudi;
      const dopo = async messaggio => { chiudi(); M.scadenze = null; M.lista = null; W.caricaDashboard(); if (messaggio) avviso(messaggio); W.ridisegna(); };
      const corpo = [
        h('div', { class: 'pillole-testa' }, pill(x.statoVisto === 'Scaduta' ? 'Scaduta ' + x.statoDettaglio : x.statoVisto === 'Prossima' || x.statoVisto === 'Fatta' ? x.statoVisto + ' ' + x.statoDettaglio : x.statoVisto, T.coloreScadenza(x.statoVisto)), x.tipoNome ? pill(x.tipoNome, 'grigio') : null),
        h('div', { class: 'scheda coppie' },
          coppia('Data', dataLunga(x.data)),
          coppia('Ogni', x.ogniMesi ? T.ogni(x.ogniMesi).replace(/^ogni /, '') + (x.dallaFatta ? ', da quando si fa' : ', dalla data prevista') : 'Una volta'),
          coppia('Cliente', x.cliente || 'Studio'), coppia('Impianto', x.impianto),
          coppia('Documento', x.documento), coppia('Preavviso', x.preavvisoGiorni ? x.preavvisoGiorni + ' giorni' : ''),
          coppia('Contratto', x.contratto), coppia('Ticket', x.ticket), coppia('Chi la segue', x.assegnata), coppia('Note', x.note),
          coppia('Fatta il', x.fattaIl ? C.data(x.fattaIl) : ''), coppia('Motivo', x.motivo)),
        puoScrivere && scrive() ? h('button', { type: 'button', class: 'btn grande largo', onclick: () => {
          chiudi();
          aggiungiDocumento({ categoria: verifica ? 'Verbali di verifica' : null, legami: { idCliente: x.idCliente || '', idSede: x.idSede || '', idContratto: x.idContratto || null },
            dopo: async doc => { await faiScadenza(x.id, { idDocumento: doc.id }); W.ridisegna(); } });
        } }, icona('carica', 18, 2.2), verifica ? 'Carica il verbale e segna fatta' : 'Carica il documento e segna fatta') : null,
        verifica && x.idCliente ? h('button', { type: 'button', class: 'btn grande largo', onclick: () => { chiudi(); nuovaLettera({ chiave: 'LETTERA_VERIFICA_TERRA', idCliente: x.idCliente, idSede: x.idSede, idScadenza: x.id }); } }, 'Prepara la lettera per il cliente') : null,
        puoScrivere ? h('div', { class: 'pillole' },
          h('button', { type: 'button', class: 'btn collegamento', onclick: () => { chiudi(); rimanda(x); } }, 'Rimanda'),
          h('button', { type: 'button', class: 'btn collegamento', onclick: () => { chiudi(); togliScadenza(x); } }, 'Togli')) : null,
      ];
      chiudi = finestra({ titolo: x.titolo, corpo, fuoco: false,
        pulsanti: puoScrivere ? ['spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => { const p = await faiScadenza(x.id, {}); if (p !== undefined) dopo(); } }, 'Segna fatta')]
          : ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    /** Segna fatta: se si ripete nasce la prossima (lo dice l'avviso). */
    async function faiScadenza(id, extra) {
      const r = await lavora('Segno fatta', () => Rete.post('/server/faiScadenza', Object.assign({ id }, extra || {})));
      if (!r) return undefined;
      M.scadenze = null;
      M.lista = null;
      W.caricaDashboard();
      avviso(r.prossima ? 'Fatta: la prossima è il ' + C.data(r.prossima.data) : 'Fatta');
      return r;
    }

    function rimanda(x) {
      const data = h('input', { type: 'date', value: x.data });
      let chiudi;
      const vai = async () => {
        if (!data.value) { data.focus(); return; }
        const r = await lavora('Sposto la scadenza', () => Rete.post('/server/salvaScadenza', { scadenza: { id: x.id, tipo: x.tipo, data: data.value } }));
        if (!r) return;
        chiudi(); M.scadenze = null; W.caricaDashboard(); avviso('Spostata al ' + C.data(data.value)); W.ridisegna();
      };
      chiudi = finestra({ titolo: 'Rimanda', corpo: [h('p', { class: 'testo-forte' }, x.titolo), campo('Nuova data', data)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Sposta')] });
    }

    function togliScadenza(x) {
      const motivo = h('input', { type: 'text' });
      const anche = h('input', { type: 'checkbox' });
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, x.titolo + ' · ' + C.data(x.data)), campo('Motivo', motivo, errore),
        x.ogniMesi ? h('label', { class: 'spunta-campo riquadrata' }, anche, 'Togli anche le prossime (non si ripete più)') : null]);
      disegna();
      let chiudi;
      const vai = async () => {
        if (!motivo.value.trim()) { errore = 'Scrivi il motivo'; disegna(); motivo.focus(); return; }
        const r = await lavora('Tolgo la scadenza', () => Rete.post('/server/togliScadenza', { id: x.id, motivo: motivo.value.trim(), ancheProssime: !!anche.checked }));
        if (!r) return;
        chiudi(); M.scadenze = null; W.caricaDashboard();
        avviso(r.prossima ? 'Tolta: la prossima è il ' + C.data(r.prossima.data) : 'Scadenza tolta');
        W.ridisegna();
      };
      chiudi = finestra({ titolo: 'Togli la scadenza', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: vai }, 'Togli')] });
    }

    /** Nuova scadenza: il tipo, a chi e a che impianto, la data; ogni quanto e il preavviso li propone Wisper se non si scrivono. */
    function nuovaScadenza(base) {
      const b = base || {};
      const x = { tipo: b.tipo || 'verifica_terra', idCliente: b.idCliente || '', idSede: b.idSede || '', ogni: '', preavviso: '' };
      const v = { titolo: h('input', { type: 'text', placeholder: 'Lo propone Wisper dal tipo' }), data: h('input', { type: 'date', value: b.data || '' }), note: h('input', { type: 'text' }) };
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const disegna = () => {
        const cli = x.idCliente ? W.cliente(x.idCliente) : null;
        const impianti = S.ana.sedi.filter(s => s.idSoggetto === x.idCliente && !s.archiviata);
        const tipi = T.TIPI_SCADENZA.filter(t => scrive() ? t[0] !== 'contratto' : t[0] === 'manutenzione');
        aggiungi(svuota(zona), [
          campo('Che cosa scade', selezione(tipi, x.tipo, y => { x.tipo = y; })),
          campo('Titolo', v.titolo, errori.titolo),
          h('div', { class: 'campo' }, h('label', null, 'Cliente'), cli
            ? h('div', { class: 'scelta-card scelta' }, iniziali(cli.nome, true), h('span', { class: 'testi' }, h('b', null, cli.nome), h('span', null, cli.citta || '')),
              h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.idCliente = ''; x.idSede = ''; disegna(); } }, 'Togli'))
            : sceltaCliente(c => { x.idCliente = c.id; disegna(); })),
          impianti.length ? h('div', { class: 'campo' }, h('label', null, 'Impianto'), h('div', { class: 'pillole' },
            h('button', { type: 'button', class: 'pillola' + (!x.idSede ? ' scelta' : ''), onclick: () => { x.idSede = ''; disegna(); } }, 'Nessuno in particolare'),
            impianti.map(s => h('button', { type: 'button', class: 'pillola' + (String(x.idSede) === String(s.id) ? ' scelta' : ''), onclick: () => { x.idSede = s.id; disegna(); } }, s.nome)))) : null,
          h('div', { class: 'riga-campi tre' }, campo('Il', v.data, errori.data),
            campo('Ogni', selezione([['', 'Lo propone Wisper'], ['0', 'Una volta'], ['6', '6 mesi'], ['12', '1 anno'], ['24', '2 anni'], ['36', '3 anni'], ['60', '5 anni']], x.ogni, y => { x.ogni = y; })),
            campo('Preavviso', selezione([['', 'Lo propone Wisper'], ['30', '30 giorni'], ['60', '60 giorni'], ['90', '90 giorni']], x.preavviso, y => { x.preavviso = y; }))),
          campo('Note', v.note)]);
      };
      disegna();
      let chiudi;
      const vai = async () => {
        errori = {};
        if (!v.data.value) errori.data = 'Data: scrivi quando scade';
        if (Object.keys(errori).length) { disegna(); return; }
        const sc = { tipo: x.tipo, data: v.data.value };
        if (v.titolo.value.trim()) sc.titolo = v.titolo.value.trim();
        if (x.idCliente) sc.idCliente = x.idCliente;
        if (x.idSede) sc.idSede = x.idSede;
        if (x.ogni !== '') sc.ogniMesi = Number(x.ogni) || null;
        if (x.preavviso !== '') sc.preavvisoGiorni = Number(x.preavviso);
        if (v.note.value.trim()) sc.note = v.note.value.trim();
        const r = await lavora('Salvo la scadenza', () => Rete.post('/server/salvaScadenza', { scadenza: sc }));
        if (!r) return;
        chiudi(); M.scadenze = null; W.caricaDashboard();
        avviso('Scadenza salvata: ' + r.scadenza.titolo + ', ' + C.data(r.scadenza.data));
        W.ridisegna();
      };
      chiudi = finestra({ titolo: 'Nuova scadenza', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Salva la scadenza')] });
    }

    // ===================================================================== modelli e testi

    async function leggiModelli() { M.modelli = await Rete.get('/server/modelli'); }

    function paginaModelli(pagina, apriChiave) {
      const giallo = scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => nuovaLettera({}) }, icona('piu', 18, 2.6), 'Nuova lettera') : null;
      const zonaSeg = h('div');
      aggiungi(pagina, [testata('Modelli', giallo), zonaSeg]);
      conDati(pagina, () => Promise.all([M.modelli ? Promise.resolve() : leggiModelli(), M.lista ? Promise.resolve() : leggiArchivio().catch(() => null)]), () => {
        aggiungi(zonaSeg, [segmentiDoc('modelli')]);
        const m = M.modelli;
        aggiungi(pagina, [h('div', { class: 'sezione stretta-900' }, h('span', { class: 'etichetta' }, 'Modelli di Wisper'),
          h('div', { class: 'scheda righe' }, (m.wisper || []).map(x => riga({
            sinistra: quadrato('file'), titolo: x.nome,
            sotto: ['impaginazione fissa'].concat((x.testi || []).length ? [(x.testi || []).map(t => nomeBreveTesto(t.nome)).filter((y, i, a) => a.indexOf(y) === i).join(', ')] : []).join(' · '),
            onclick: (x.testi || []).length ? () => testiModello(x) : null, freccia: (x.testi || []).length > 0,
          }))))]);
        aggiungi(pagina, [h('div', { class: 'sezione stretta-900' }, h('span', { class: 'etichetta' }, 'Modelli dello studio'),
          (m.studio || []).length ? h('div', { class: 'scheda righe' }, m.studio.map(d => riga({
            sinistra: quadrato('file', 'ico-blu'), titolo: d.titolo, sotto: [T.tipoFile(d.mime, d.nomeFile), T.grandezza(d.byte)].filter(Boolean).join(' · '),
            destra: h('button', { type: 'button', class: 'btn piccolo', onclick: e => { e.stopPropagation(); apri(d); } }, 'Apri'),
            onclick: () => { W.vai('#documenti/doc/' + d.id); },
          }))) : h('p', { class: 'vuoto sinistra' }, 'Nessun modello dello studio: si mettono nell\'archivio, nella categoria Modelli dello studio.'))]);
        if (apriChiave) { const x = (m.wisper || []).find(y => y.chiave === apriChiave); if (x) testiModello(x); }
      });
    }

    function nomeBreveTesto(nome) {
      const s = String(nome || '');
      if (/email/i.test(s)) return 'testo dell\'email';
      if (/condizioni/i.test(s)) return 'condizioni';
      if (/introduzione/i.test(s)) return 'introduzione';
      return s.replace(/^Lettera\s+/i, '').replace(/"/g, '').toLowerCase();
    }

    /** I testi di un modello: uno sotto l'altro, i segnaposti come pillole da inserire; Salva per ognuno (amministrazione 2). */
    function testiModello(modello) {
      const puoCambiare = puo('amministrazione', 2);
      const segnaposti = (M.modelli && M.modelli.segnaposti) || [];
      const foglio = h('div', { class: 'foglio-a4 anteprima-testo', 'aria-hidden': 'true' });
      const mostraAnteprima = (t, testo) => {
        aggiungi(svuota(foglio), [h('div', { class: 'testa-a4' }, h('span', null, S.ana.impostazioni.RAGIONE_SOCIALE || 'Lo studio'), h('span', null, modello.nome)),
          h('div', { class: 'linea-a4' }), h('div', { class: 'piccolo' }, t.nome),
          h('div', { class: 'testo-a4' }, String(testo || '').split(/(\{[a-z_]+\})/g).map(p => /^\{[a-z_]+\}$/.test(p) ? h('mark', null, p) : p))]);
      };
      const blocchi = (modello.testi || []).map((t, i) => {
        const area = h('textarea', { rows: /OGGETTO/.test(t.chiave) ? 1 : 5, disabled: !puoCambiare });
        area.value = t.testo || '';
        let errore = '';
        const zona = h('div', { class: 'campo' });
        const disegna = () => aggiungi(svuota(zona), [h('label', null, t.nome), area, errore ? h('div', { class: 'errore' }, errore) : null,
          puoCambiare ? h('div', { class: 'pillole segnaposti-modello' }, (t.segnaposti && t.segnaposti.length ? t.segnaposti : segnaposti).map(s => h('button', { type: 'button', class: 'pillola piccola', onclick: () => {
            const p = area.selectionStart || area.value.length;
            area.value = area.value.slice(0, p) + '{' + s + '}' + area.value.slice(area.selectionEnd || p);
            area.focus(); mostraAnteprima(t, area.value);
          } }, '{' + s + '}')),
          h('span', { class: 'spazio' }),
          h('button', { type: 'button', class: 'btn piccolo', onclick: async () => {
            errore = '';
            try {
              const r = await lavora('Salvo il testo', async () => {
                try { return await Rete.post('/server/salvaTestoModello', { chiave: t.chiave, testo: area.value }); } catch (e) { errore = e.message; disegna(); return null; }
              });
              if (r) { M.modelli = r.wisper ? r : M.modelli; avviso('Testo salvato'); }
            } catch (e) { /* già detto */ }
          } }, 'Salva')) : null]);
        disegna();
        area.addEventListener('focus', () => mostraAnteprima(t, area.value));
        area.addEventListener('input', () => mostraAnteprima(t, area.value));
        if (i === 0) mostraAnteprima(t, t.testo);
        return zona;
      });
      let chiudi;
      chiudi = finestra({ titolo: 'Testi: ' + modello.nome, larghezza: 'larga', fuoco: false,
        corpo: h('div', { class: 'due-colonne-f' }, h('div', { class: 'colonna-f' },
          puoCambiare ? null : h('div', { class: 'banda calma' }, icona('lucchetto', 20, 2.2), h('span', { class: 'spazio' }, 'Li cambia l\'amministrazione: qui si leggono')),
          blocchi, h('p', { class: 'piccolo' }, 'Un testo vuoto vuol dire quello che Wisper scrive da solo. L\'impaginazione del PDF resta quella di Wisper.')), h('div', { class: 'colonna-f' }, foglio)),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    /**
     * Nuova lettera: il modello, il cliente e l'impianto; il testo coi segnaposti riempiti dal server
     * (quelli che mancano in giallo scuro), poi Crea il PDF (giallo) o Salva nell'archivio.
     */
    async function nuovaLettera(base) {
      const b = base || {};
      if (!M.modelli) { const ok = await lavora('Leggo i modelli', leggiModelli); if (ok === undefined && !M.modelli) return; }
      const lettere = (M.modelli.lettere || []).length ? M.modelli.lettere : [{ chiave: 'LETTERA_VERIFICA_TERRA', nome: 'Verifica impianto di terra' }, { chiave: 'LETTERA_LIBERA', nome: 'Lettera libera' }];
      const x = { chiave: b.chiave || lettere[0].chiave, idCliente: b.idCliente || '', idSede: b.idSede || '', idScadenza: b.idScadenza || null, composta: null };
      const testo = h('textarea', { rows: 12 });
      const zona = h('div', { class: 'fila' });
      const nomeLettera = l => /libera/i.test(l.nome || l.chiave) ? 'Lettera libera' : String(l.nome || '').replace(/^Lettera\s+"?/i, '').replace(/"$/, '');
      async function componi() {
        if (!x.idCliente && x.chiave !== 'LETTERA_LIBERA') { x.composta = null; disegna(); return; }
        const corpo = { chiave: x.chiave };
        if (x.idCliente) corpo.idCliente = x.idCliente;
        if (x.idSede) corpo.idSede = x.idSede;
        if (x.idScadenza) corpo.idScadenza = x.idScadenza;
        const r = await lavora('Preparo il testo', () => Rete.post('/server/componiModello', corpo));
        if (!r) return;
        x.composta = r;
        testo.value = r.testo || '';
        disegna();
      }
      function disegna() {
        const cli = x.idCliente ? W.cliente(x.idCliente) : null;
        const impianti = S.ana.sedi.filter(s => s.idSoggetto === x.idCliente && !s.archiviata);
        const mancano = x.composta ? (x.composta.mancano || []).filter(m => testo.value.indexOf(m) >= 0) : [];
        aggiungi(svuota(zona), [
          h('div', { class: 'pillole' }, lettere.map(l => h('button', { type: 'button', class: 'pillola' + (x.chiave === l.chiave ? ' scelta' : ''), onclick: () => { x.chiave = l.chiave; componi(); } }, nomeLettera(l)))),
          h('div', { class: 'due-colonne' },
            h('div', { class: 'campo' }, h('label', null, 'Cliente'), cli
              ? h('div', { class: 'scelta-card scelta' }, iniziali(cli.nome, true), h('span', { class: 'testi' }, h('b', null, cli.nome)),
                h('button', { type: 'button', class: 'btn collegamento', onclick: () => { x.idCliente = ''; x.idSede = ''; x.idScadenza = null; x.composta = null; disegna(); } }, 'Cambia'))
              : sceltaCliente(c => { x.idCliente = c.id; x.idSede = ''; componi(); })),
            impianti.length ? h('div', { class: 'campo' }, h('label', null, 'Impianto'), h('div', { class: 'pillole' }, impianti.map(s => h('button', { type: 'button', class: 'pillola' + (String(x.idSede) === String(s.id) ? ' scelta' : ''),
              onclick: () => { x.idSede = s.id; x.idScadenza = null; componi(); } }, s.nome)))) : h('span')),
          x.composta ? campo(x.composta.titolo || 'Il testo', testo) : h('p', { class: 'vuoto sinistra' }, 'Scegli il cliente: il testo si riempie da solo.'),
          mancano.length ? h('div', { class: 'banda giallina' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Manca: ' + mancano.join(', ') + '. Scrivilo nella lettera o nel cliente.')) : null]);
      }
      testo.addEventListener('input', () => { const b2 = zona.querySelector('.banda.giallina'); const m = x.composta ? (x.composta.mancano || []).filter(y => testo.value.indexOf(y) >= 0) : []; if (b2 && !m.length) b2.remove(); });
      const html = () => {
        const cli = x.idCliente ? W.cliente(x.idCliente) : null;
        const sede = x.idSede ? S.ana.sedi.find(s => String(s.id) === String(x.idSede)) : null;
        return D.lettera({ titolo: x.composta.titolo || 'Lettera', testo: testo.value, cliente: cli ? { nome: cli.nome, righe: [R.indirizzoCompleto(cli), cli.partitaIva ? 'P.IVA ' + cli.partitaIva : ''] } : null,
          impianto: sede ? sede.nome : '' }, S.ana.impostazioni);
      };
      const nomePdf = () => W.nomeFile((x.composta && x.composta.titolo) || 'Lettera', ((W.cliente(x.idCliente) || {}).nome || '') + ' ' + C.data(C.oggiIso()).replace(/\//g, '-'));
      let chiudi;
      const creaPdf = async () => {
        if (!x.composta) { avviso('Scegli prima il cliente', true); return; }
        if (S.esempio) { avviso('Nella visita il PDF non si crea'); return; }
        const r = await lavora('Preparo il PDF', () => Rete.post('/locale/pdf', { html: html(), nome: nomePdf(), apri: true }));
        if (r) avviso('PDF salvato in ' + r.percorso);
      };
      const salvaArchivio = async () => {
        if (!x.composta) { avviso('Scegli prima il cliente', true); return; }
        if (S.esempio) { avviso('Nella visita non si salva niente'); return; }
        await leggiCategorie().catch(() => null);
        const cat = (M.categorie || []).find(c => c.nome === 'Corrispondenza');
        const r = await lavora('Salvo nell\'archivio', async () => {
          const pdf = await Rete.post('/locale/pdf', { html: html(), nome: nomePdf(), apri: false, base64: true });
          const byte = Uint8Array.from(atob(pdf.base64), c => c.charCodeAt(0));
          const nome = nomePdf() + '.pdf';
          const c = await carica({ file: new Blob([byte], { type: 'application/pdf' }), nome, mime: 'application/pdf' }, 'documento', idFileNuovo());
          return Rete.post('/server/salvaDocumento', { documento: { titolo: x.composta.titolo || 'Lettera', idCategoria: cat ? cat.id : null, origine: 'file', idFile: c.file.id,
            idCliente: x.idCliente || '', idSede: x.idSede || null, dataDocumento: C.oggiIso() } });
        });
        if (r) { M.lista = null; avviso('Salvata nell\'archivio: ' + r.documento.titolo); }
      };
      disegna();
      if (x.idCliente || x.chiave === 'LETTERA_LIBERA') componi();
      chiudi = finestra({ titolo: 'Nuova lettera', larghezza: 'media', corpo: zona, fuoco: false,
        pulsanti: ['spazio', scrive() ? h('button', { type: 'button', class: 'btn grande', onclick: salvaArchivio }, 'Salva nell\'archivio') : null,
          h('button', { type: 'button', class: 'btn giallo grande', onclick: creaPdf }, 'Crea il PDF')].filter(Boolean) });
    }

    // ===================================================================== la scheda Documenti di commessa e cliente

    /**
     * La scheda Documenti (commessa, cliente): la cartella principale in cima con Apri la cartella, i documenti
     * dell'archivio filtrati, e "Da Wisper" (preventivi, rapportini firmati, fatture: aprono la loro pagina).
     * filtro: { idCommessa } o { idCliente }. I documenti di prima (fase 1) sono nell'archivio con lo stesso file.
     */
    async function schedaDocumenti(area, filtro) {
      const lista = h('div', { class: 'sezione' }, segnaposto(2, 58));
      const legami = filtro.idCommessa ? { idCommessa: filtro.idCommessa, idCliente: (W.commessa(filtro.idCommessa) || {}).idCliente || '' } : { idCliente: filtro.idCliente };
      aggiungi(area, [h('div', { class: 'testata' }, h('span', { class: 'spazio' }),
        scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => aggiungiDocumento({ legami, dopo: () => leggi() }) }, icona('piu', 18, 2.6), 'Aggiungi un documento') : null), lista]);
      const leggi = async () => {
        let r;
        try { r = await Rete.get('/server/documenti?' + qs(Object.assign({ archivio: true }, filtro))); } catch (e) { if (e.accesso !== false) aggiungi(svuota(lista), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message))]); return; }
        svuota(lista);
        const docs = r.documenti || [];
        const cartella = docs.find(d => d.principale && d.cartella);
        if (cartella) {
          aggiungi(lista, [h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('cartella', 'ico-blu'), titolo: cartella.titolo, sotto: (cartella.collegamentoNome || '') + ' · ' + T.accorcia(cartella.url, 46),
            destra: h('button', { type: 'button', class: 'btn', onclick: e => { e.stopPropagation(); apriCollegamento(cartella.url); } }, icona('cartella', 18, 2.2), 'Apri la cartella'),
            onclick: () => W.vai('#documenti/doc/' + cartella.id) }))]);
        }
        const altri = docs.filter(d => d !== cartella);
        aggiungi(lista, [h('span', { class: 'etichetta' }, 'Documenti · ' + altri.length), altri.length ? h('div', { class: 'scheda righe' }, altri.map(d => riga({
          sinistra: iconaDoc(d), titolo: d.titolo, sotto: [d.categoria, d.impianto, d.origine === 'collegamento' ? d.collegamentoNome : 'rev. ' + d.revisione, C.data(String(d.modificato || '').slice(0, 10))].filter(Boolean).join(' · '),
          destra: h('span', { class: 'pillole-destra' }, pillStatoDoc(d), d.scadenza ? pill(d.scadenza.statoVisto, T.coloreScadenza(d.scadenza.statoVisto)) : null),
          onclick: () => apri(d),
        }))) : h('p', { class: 'vuoto sinistra' }, 'Nessun documento.')]);
        if ((r.daWisper || []).length) {
          aggiungi(lista, [h('span', { class: 'etichetta' }, 'Da Wisper · ' + r.daWisper.length), h('div', { class: 'scheda righe' }, r.daWisper.map(x => riga({
            sinistra: quadrato(T.iconaVoce(x.tipo)), titolo: x.titolo, sotto: x.dettaglio, onclick: () => apriDaWisper(x),
          })))]);
        }
      };
      leggi();
    }

    function apriDaWisper(x) {
      if (x.tipo === 'rapportino') W.vaiA({ pagina: 'rapportino', id: x.id });
      else if (x.tipo === 'preventivo') W.vai('#preventivi/' + encodeURIComponent(x.id));
      else if (x.tipo === 'fattura') W.vaiA({ pagina: 'fattura', id: x.id });
      else if (x.tipo === 'contratto') W.vai('#ticket/contratto/' + x.id);
    }

    /** Quanti documenti ha un cliente (per il segmento "Documenti · N" della sua scheda). */
    const conteDocumenti = {};
    function quantiDocumenti(idCliente) {
      if (conteDocumenti[idCliente]) return conteDocumenti[idCliente];
      conteDocumenti[idCliente] = Rete.get('/server/documenti?' + qs({ archivio: true, idCliente })).then(r => r.quanti || (r.documenti || []).length).catch(() => null);
      setTimeout(() => { delete conteDocumenti[idCliente]; }, 30000);
      return conteDocumenti[idCliente];
    }

    // ===================================================================== amministrazione: categorie e spazio

    function paginaCategorie(pagina) {
      const puoCambiare = puo('amministrazione', 2);
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Categorie dei documenti'), h('span', { class: 'spazio' }),
        puoCambiare ? h('button', { type: 'button', class: 'btn', onclick: () => moduloCategoria(null) }, icona('piu', 18, 2.6), 'Nuova categoria') : null)]);
      const area = h('div', { class: 'stretta-820' });
      aggiungi(pagina, [area]);
      M.categorie = null;
      conDati(area, leggiCategorie, () => {
        const lista = M.categorie.slice().sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
        aggiungi(area, [h('div', { class: 'scheda righe' }, lista.map(c => riga({
          sinistra: quadrato('file', c.attiva ? null : 'ico-grigio'), titolo: c.nome,
          sotto: [c.approvazione ? 'Da approvare' : 'Senza approvazione', ({ tutti: 'tutti', costi: 'chi vede i prezzi', riservati: 'solo il titolare' })[c.vede] || c.vede,
            c.scadenzaMesi ? 'scade dopo ' + c.scadenzaMesi + ' mesi' : '', c.attiva ? '' : 'non si usa più', c.sistema ? 'serve a Wisper' : ''].filter(Boolean).join(' · '),
          destra: h('span', { class: 'quanto t2' }, T.quanti(c.documenti, 'documento', 'documenti')),
          onclick: puoCambiare ? () => moduloCategoria(c) : null, freccia: puoCambiare,
        })))]);
      });
    }

    function moduloCategoria(c0) {
      const c = c0 || { nome: '', approvazione: false, vede: 'tutti', scadenzaMesi: null, attiva: true };
      const x = { approvazione: !!c.approvazione, vede: c.vede || 'tutti', attiva: c.attiva !== false };
      const v = { nome: h('input', { type: 'text', value: c.nome || '' }), mesi: h('input', { type: 'text', inputmode: 'numeric', value: c.scadenzaMesi ? String(c.scadenzaMesi) : '' }) };
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [
        campo('Nome', v.nome, errore),
        campo('Le revisioni', segmenti([['no', 'Senza approvazione'], ['si', 'Da approvare']], x.approvazione ? 'si' : 'no', y => { x.approvazione = y === 'si'; disegna(); }, 'piccoli')),
        campo('Chi la vede', segmenti([['tutti', 'Tutti'], ['costi', 'Chi vede i prezzi'], ['riservati', 'Solo il titolare']], x.vede, y => { x.vede = y; disegna(); }, 'piccoli')),
        campo('Scadenza proposta', B.conSuffisso(v.mesi, 'mesi')),
        c0 && !c0.sistema ? campo('Si usa', segmenti([['si', 'Sì'], ['no', 'Non più']], x.attiva ? 'si' : 'no', y => { x.attiva = y === 'si'; disegna(); }, 'piccoli')) : null]);
      let chiudi;
      if (c0) {
        // Una categoria che c'è già (06/11/2026): ogni campo si salva da solo, la finestra ha solo Chiudi.
        // Al server va la categoria intera, con gli ultimi valori salvati degli altri campi.
        const ora = { id: c0.id, nome: c0.nome || '', approvazione: x.approvazione, vede: x.vede, scadenzaMesi: c0.scadenzaMesi || null, attiva: x.attiva };
        const manda = cambi => Rete.post('/server/salvaCategoria', { categoria: Object.assign({}, ora, cambi) }).then(r => { Object.assign(ora, cambi); M.categorie = (r && r.categorie) || null; return r; });
        const scelta = (voci, chiave, da, a) => {
          const z = h('div');
          const rifai = () => aggiungi(svuota(z), [segmenti(voci, da(x[chiave]), async y => {
            if (String(y) === String(da(x[chiave]))) return;
            const prima = x[chiave];
            x[chiave] = a(y);
            rifai();
            const ok = await B.salvaOra(z, () => manda({ [chiave]: x[chiave] }));
            if (!ok) { x[chiave] = prima; rifai(); }
          }, 'piccoli')]);
          rifai();
          return z;
        };
        const siNo = b => (b ? 'si' : 'no');
        const comeE = y => y;
        B.salvaDaSolo(v.nome, { leggi: t => (String(t || '').trim() ? { valore: String(t).trim() } : { errore: 'Nome: scrivi il nome della categoria' }), salva: n => manda({ nome: n }) });
        B.salvaDaSolo(v.mesi, { leggi: B.leggiNumero({ nome: 'Scadenza proposta', intero: true, min: 0 }), salva: n => manda({ scadenzaMesi: n === '' || n === 0 ? null : n }) });
        aggiungi(zona, [campo('Nome', v.nome),
          campo('Le revisioni', scelta([['no', 'Senza approvazione'], ['si', 'Da approvare']], 'approvazione', siNo, y => y === 'si')),
          campo('Chi la vede', scelta([['tutti', 'Tutti'], ['costi', 'Chi vede i prezzi'], ['riservati', 'Solo il titolare']], 'vede', comeE, comeE)),
          campo('Scadenza proposta', B.conSuffisso(v.mesi, 'mesi')),
          !c0.sistema ? campo('Si usa', scelta([['si', 'Sì'], ['no', 'Non più']], 'attiva', siNo, y => y === 'si')) : null]);
        chiudi = finestra({ titolo: c0.nome, corpo: zona, fuoco: false, allaChiusura: () => B.inCoda(() => null).then(() => W.ridisegna()),
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
        return;
      }
      disegna();
      const vai = async () => {
        errore = '';
        if (!v.nome.value.trim()) { errore = 'Nome: scrivi il nome della categoria'; disegna(); return; }
        const cat = { nome: v.nome.value.trim(), approvazione: x.approvazione, vede: x.vede, scadenzaMesi: v.mesi.value.trim() ? Number(v.mesi.value.trim()) : null, attiva: x.attiva };
        if (c0) cat.id = c0.id;
        const r = await lavora('Salvo la categoria', () => Rete.post('/server/salvaCategoria', { categoria: cat }));
        if (!r) return;
        chiudi();
        M.categorie = r.categorie || null;
        avviso('Categoria salvata');
        W.ridisegna();
      };
      chiudi = finestra({ titolo: c0 ? c0.nome : 'Nuova categoria', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Salva')] });
    }

    const mbTesto = mb => {
      const n = Number(mb) || 0;
      if (n >= 1024) return String(Math.round(n / 1024 * 10) / 10).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' GB';
      return String(Math.round(n * 10) / 10).replace('.', ',') + ' MB';
    };

    function paginaSpazio(pagina) {
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Spazio sul NAS'))]);
      const area = h('div', { class: 'sezione stretta-900' });
      aggiungi(pagina, [area]);
      M.spazio = null;
      conDati(area, async () => { M.spazio = await Rete.get('/server/spazio'); }, () => {
        const s = M.spazio;
        const cestino = (s.perTipo || []).find(t => t.tipo === 'cestino') || { mb: 0, quanti: 0 };
        const troppo = (s.fuori && s.fuori.troppoGrandi) || [];
        const box = (quanto, che, rosso) => h('div', { class: 'num-box' + (rosso ? ' rosso' : '') }, h('b', null, quanto), h('span', null, che));
        aggiungi(area, [h('div', { class: 'quattro-num' },
          box(mbTesto(s.disco.liberoMb), 'liberi', s.disco.liberoMb < s.disco.avvisoMb),
          box(mbTesto(s.file.mb), 'usati da Wisper'),
          box(mbTesto(cestino.mb), 'nel cestino'),
          box(String(troppo.length), troppo.length === 1 ? 'file solo sul NAS' : 'file solo sul NAS', troppo.length > 0))]);
        if (s.disco.liberoMb < s.disco.minimoMb) aggiungi(area, [h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Il disco è quasi pieno: i documenti nuovi non si caricano finché non si libera spazio. Le foto dei rapportini sì.'))]);
        const massimo = Math.max(1, ...(s.perTipo || []).map(t => t.mb));
        aggiungi(area, [h('div', { class: 'scheda' }, h('span', { class: 'etichetta' }, 'Dove va lo spazio'),
          h('div', { class: 'barre-spazio' }, (s.perTipo || []).map(t => h('div', { class: 'barra-spazio' }, h('span', { class: 'nome' }, t.nome),
            h('span', { class: 'barra' }, h('i', { style: { width: Math.max(1, Math.round(t.mb / massimo * 100)) + '%' } })), h('span', { class: 'quanto' }, mbTesto(t.mb) + ' · ' + t.quanti)))))]);
        aggiungi(area, [h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('disco', troppo.length ? 'ico-giallo' : null), titolo: 'Copia fuori casa',
          sotto: (s.fuori.ultima ? 'Ultima ' + C.dataOra(s.fuori.ultima) : 'Non ancora fatta') + ' · ' + (s.fuori.daCopiare === 1 ? '1 file da copiare' : (s.fuori.daCopiare || 0) + ' file da copiare') +
            (troppo.length ? ' · ' + troppo.length + ' troppo grandi (oltre ' + (S.ana.impostazioni.COPIA_FUORI_MAX_MB || 25) + ' MB)' : '') })),
        troppo.length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Solo sul NAS'), h('div', { class: 'scheda righe' }, troppo.map(f => riga({
          sinistra: quadrato('disco', 'ico-giallo'), titolo: f.nome, sotto: mbTesto(f.mb) + ' · troppo grande per la copia fuori casa', destra: pill('Solo sul NAS', 'ambra') })))) : null,
        (s.piuGrandi || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'I file più grandi'), h('div', { class: 'scheda righe' }, s.piuGrandi.slice(0, 8).map(f => riga({
          sinistra: quadrato('file'), titolo: f.nome, sotto: mbTesto(f.mb) + (f.fuori ? ' · ' + f.fuori : ''),
          onclick: f.documento ? () => W.vai('#documenti/doc/' + f.documento) : null })))) : null,
        h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('cestino'), titolo: 'Nel cestino da più di 90 giorni',
          sotto: (s.cestinoVecchio.quanti || 0) === 1 ? '1 file · ' + mbTesto(s.cestinoVecchio.mb) : (s.cestinoVecchio.quanti || 0) + ' file · ' + mbTesto(s.cestinoVecchio.mb),
          destra: titolare() && puo('amministrazione', 2) ? h('button', { type: 'button', class: 'btn', disabled: !s.cestinoVecchio.quanti, onclick: svuotaCestino }, 'Svuota il cestino') : null })),
        h('p', { class: 'piccolo' }, 'File fino a ' + (interfaccia().fileMaxMb || S.ana.impostazioni.FILE_MAX_MB || 50) + ' MB. Sotto ' + mbTesto(s.disco.avvisoMb) + ' liberi la Dashboard avvisa; sotto ' + mbTesto(s.disco.minimoMb) + ' i documenti nuovi non si caricano.')]);
      });
    }

    async function svuotaCestino() {
      let prima;
      try { prima = await Rete.post('/server/svuotaCestino', {}); } catch (e) {
        if (!(e.dati && e.dati.serveConferma)) { avviso(e.message, true); return; }
        const ok = await conferma('Svuotare il cestino?', e.dati.errore, 'Togli per sempre', true);
        if (!ok) return;
        const r = await lavora('Svuoto il cestino', () => Rete.post('/server/svuotaCestino', { conferma: true }));
        if (r) { avviso(r.tolti === 1 ? '1 file tolto per sempre' : r.tolti + ' file tolti per sempre'); W.ridisegna(); }
        return;
      }
      if (prima) avviso(prima.tolti ? prima.tolti + ' file tolti per sempre' : 'Niente da togliere');
    }

    return {
      vista, M, daRileggere, aggiungiDocumento, apriPannello, chiudiPannello, apriScadenza, schedaDocumenti, quantiDocumenti, nuovaLettera,
      paginaCategorie, paginaSpazio, apriCollegamento, apriFile, carica, scegliFile, iconaDoc, pillStatoDoc,
    };
  };
})(window);
