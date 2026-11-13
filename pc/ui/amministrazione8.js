/*
 * Wisper Ufficio: Amministrazione completa, prima parte (fase 8, docs/gestionale/fase8.md §9.1-§9.7, §9.9, §15.2).
 *
 * L'elenco a cinque gruppi (Lo studio · Persone e accessi · Regole · Dati · Sistema), Dati dello studio col logo e
 * l'anteprima dell'intestazione in bianco e nero, Impostazioni generali (tutte le chiavi delle fasi 1-8 in undici
 * schede, coi nomi, le unità e i limiti che manda il server), Funzioni accese, Numerazioni col formato del codice
 * commessa, Notifiche, Aspetto. La seconda parte (Sicurezza, Copie e ripristino, Importa ed esporta, Stato del
 * sistema, Lista di controllo) sta in sistema8.js. Le pagine di prima (Utenti, Ruoli e permessi, Impostazioni
 * fiscali, Registro, Cestino...) restano in amministrazione.js.
 */
(function (radice) {
  'use strict';

  radice.WisperAmministrazione8 = function (W, aiuti) {
    const { S, C, R, B, Rete, Api } = W;
    const Q = radice.WisperRegoleFase8;
    const T = radice.WisperRegoleImpostazioni;
    const { h, aggiungi, svuota, icona, tondo, iniziali, avviso, lavora, finestra, conferma, campo, conSuffisso, segmenti, riga, quadrato, segnaposto } = B;
    const scrive = () => W.puo('amministrazione', 2);
    const titolare = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'titolare');
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
    const vero = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'SI';

    const M = { funzioni: null, sicurezza: null, gruppi: null, copie: null, stato: null, controlli: null, notifiche: null, cerca: '', trova: '', formato: null };
    function daRileggere() { Object.assign(M, { funzioni: null, sicurezza: null, gruppi: null, copie: null, stato: null, controlli: null, notifiche: null, formato: null }); }

    /** Legge qualcosa dal server coi segnaposti, poi disegna (come amministrazione.js). */
    async function leggi(area, chiave, percorso, disegna) {
      if (M[chiave] === null || M[chiave] === undefined) {
        aggiungi(area, [segnaposto(3, 64)]);
        try {
          M[chiave] = await Rete.get(percorso);
        } catch (e) {
          if (e.accesso === false) return;
          aggiungi(svuota(area), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e)),
            h('button', { type: 'button', class: 'btn piccolo', onclick: () => { svuota(area); leggi(area, chiave, percorso, disegna); } }, 'Riprova'))]);
          return;
        }
        svuota(area);
      }
      disegna(M[chiave]);
    }

    function interruttore(nome, sotto, acceso, cambia, spento) {
      const b = h('button', { type: 'button', class: 'interruttore' + (acceso ? ' acceso' : ''), role: 'switch', 'aria-checked': acceso ? 'true' : 'false', 'aria-label': nome, disabled: !!spento,
        onclick: () => { if (!spento) cambia(!acceso); } }, h('i'));
      return h('div', { class: 'riga riga-int' }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, nome), sotto ? h('span', { class: 't2' }, sotto) : null), b);
    }

    async function salvaValori(valori, frase) {
      const ris = await lavora('Salvo', () => Rete.post('/server/salvaImpostazioni', { valori }));
      if (ris) { S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni || valori); avviso(frase || 'Salvato'); }
      return ris;
    }

    // ===================================================================== l'elenco a cinque gruppi (§9.2)

    function elenco(pagina) {
      const imp = S.ana.impostazioni;
      const amm = W.puo('amministrazione');
      const num = S.ana.numerazioni.find(n => n.tipo === 'commessa');
      const prossimaCommessa = num ? (num.prossimo || Q.codiceDa(num.formato, new Date().getFullYear(), Q.prossimoNumero(num.ultimo, []))) : '';
      let tema = 'auto';
      try { tema = localStorage.getItem('wisper-tema') || 'auto'; } catch (e) { /* senza memoria */ }
      const attivi = S.ana.utenti.filter(u => u.attivo !== false).length;
      const emailAvvisi = String(imp.EMAIL_AVVISI || '').split(/[,;\s]+/).filter(Boolean);
      const conferme = imp.REGOLE_FISCALI_CONFERMATE && typeof imp.REGOLE_FISCALI_CONFERMATE === 'object' && imp.REGOLE_FISCALI_CONFERMATE.data ? imp.REGOLE_FISCALI_CONFERMATE : null;
      const logo = !!idFile(imp.STUDIO_LOGO);
      const v = (k, titolo, ic, sotto, opz) => Object.assign({ k, titolo, icona: ic, sotto }, opz || {});
      const gruppi = [
        ['Lo studio', [
          amm && v('studio', 'Dati dello studio', 'immagine', [imp.RAGIONE_SOCIALE, logo ? (imp.PDF_LOGO === false ? 'logo, non sui PDF' : 'logo sui PDF') : 'senza logo'].filter(Boolean).join(' · ')),
          v('app', 'Aspetto', 'pennello', 'Tema ' + ({ auto: 'automatico', chiaro: 'chiaro', scuro: 'scuro' }[tema] || 'automatico')),
          amm && v('funzioni', 'Funzioni accese', 'interruttore', M.funzioni ? Q.rigaFunzioni(M.funzioni.funzioni) : 'Le funzioni che lo studio usa')]],
        ['Persone e accessi', [
          amm && v('utenti', 'Utenti', 'clienti', attivi === 1 ? '1 attivo' : attivi + ' attivi'),
          amm && v('permessi', 'Ruoli e permessi', 'chiave', 'Quattro ruoli più l\'esterno'),
          amm && v('sicurezza', 'Sicurezza', 'scudo', M.sicurezza ? W.Sistema8.rigaSicurezza(M.sicurezza).testo : 'È tutto a posto?', { colore: M.sicurezza ? W.Sistema8.rigaSicurezza(M.sicurezza).colore : null }),
          v('notifiche', 'Notifiche', 'campana', scrive() && emailAvvisi.length ? 'Avvisi del server a ' + emailAvvisi[0] + (emailAvvisi.length > 1 ? ' e altri ' + (emailAvvisi.length - 1) : '') : 'Quali, sul telefono, silenzio la sera')]],
        ['Regole', [
          amm && v('impostazioni', 'Impostazioni generali', 'amministrazione', M.gruppi ? Q.rigaImpostazioni(M.gruppi.gruppi) : 'Tutte le regole dello studio in un posto'),
          amm && W.soldi() && v('fiscale', 'Impostazioni fiscali', 'fatturazione', conferme ? 'Confermate il ' + C.data(conferme.data) : 'Da confermare col commercialista', { colore: conferme ? null : 'ico-giallo' }),
          amm && v('numerazioni', 'Numerazioni', 'numero', prossimaCommessa ? 'Prossima commessa ' + prossimaCommessa : 'Codici di commesse, rapportini, preventivi'),
          amm && W.puo('documenti') && v('categorie', 'Categorie dei documenti', 'file', 'Approvazione, chi vede, scadenza proposta'),
          amm && W.puo('persone') && v('formazione', 'Tipi di formazione', 'libro', 'PES, PAV, PEI, primo soccorso'),
          amm && W.puo('spese') && v('veicoli', 'Veicoli e rimborso km', 'auto', 'Tabelle ACI ' + (imp.ACI_ANNO || new Date().getFullYear()))]],
        ['Dati', [
          amm && v('copie', 'Copie e ripristino', 'disco', M.copie ? W.Sistema8.rigaCopie(M.copie) : 'Copie di ogni notte e ripristino provato'),
          (titolare() || W.puo('clienti')) && v('importa', 'Importa ed esporta', 'importa', 'Clienti da un file, tutti i dati in uno ZIP'),
          amm && v('registro', 'Registro attività', 'storia', 'Chi ha cambiato cosa'),
          amm && scrive() && v('cestino', 'Cestino', 'cestino', 'File tolti, recuperabili'),
          amm && v('spazio', 'Spazio sul NAS', 'disco', 'Dove va lo spazio, copia fuori casa')]],
        ['Sistema', [
          amm && v('stato', 'Stato del sistema', 'server', M.stato ? W.Sistema8.rigaStato(M.stato) : 'Il server sta bene?'),
          W.puo('integrazioni') && v('#integrazioni', 'Integrazioni', 'spina', W.Integrazioni.M.lista ? (Q.numeriIntegrazioni(W.Integrazioni.M.lista).errori ? Q.numeriIntegrazioni(W.Integrazioni.M.lista).errori + ' in Errore' : 'Nessuno in Errore') : 'Lo stato vero di ogni collegamento',
            { colore: W.Integrazioni.M.lista && Q.numeriIntegrazioni(W.Integrazioni.M.lista).errori ? 'ico-rosso' : null }),
          amm && v('controlli', 'Lista di controllo', 'lista', M.controlli ? W.Sistema8.rigaControlli(M.controlli) : 'Il gestionale è completo?')]],
      ].map(([nome, voci]) => [nome, voci.filter(Boolean)]).filter(g => g[1].length);
      const blocco = ([nome, voci]) => h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, nome), h('div', { class: 'scheda righe' }, voci.map(x => riga({
        sinistra: quadrato(x.icona, x.colore), titolo: x.titolo, sotto: x.sotto, attr: { 'data-pagina': x.k },
        onclick: () => W.vai(x.k[0] === '#' ? x.k : '#amministrazione/' + x.k),
      }))));
      const meta = gruppi.findIndex(g => g[0] === 'Regole');
      const sx = meta > 0 ? gruppi.slice(0, meta) : gruppi;
      const dx = meta > 0 ? gruppi.slice(meta) : [];
      const lista = h('div', { class: 'due-colonne stretta-1100 elenco-amm' }, h('div', { class: 'sezione' }, sx.map(blocco)), dx.length ? h('div', { class: 'sezione' }, dx.map(blocco)) : null);
      // 06/11/2026: "Cerca nelle impostazioni" in cima. Trova anche le pagine di prima che non stanno nei cinque gruppi.
      const altre = [['Regole', [
        amm && W.soldi() && v('tariffe', 'Tariffe e rimborsi', 'fatturazione', 'Rimborso km, costo orario, ticket'),
        amm && W.soldi() && v('fisco', 'Fisco e preventivi', 'preventivo', 'Validità e condizioni dei preventivi'),
        amm && W.puo('persone') && v('persone', 'Persone, mezzi e collaboratori', 'persona', 'Santo patrono, tarature, DURC e visura'),
        amm && v('portale', 'Portale clienti', 'globo', 'Indirizzo, durate, file dai clienti'),
        amm && v('comunicazioni', 'Comunicazioni', 'fumetto', 'WhatsApp e promemoria')].filter(Boolean)]];
      const risultati = h('div', { class: 'stretta-1100 sezione risultati-amm' });
      const mostra = () => {
        const tutte = gruppi.concat(altre).reduce((l, [nome, voci]) => l.concat(voci.map(x => ({ k: x.k, titolo: x.titolo, gruppo: nome, sotto: x.sotto, icona: x.icona }))), []);
        const icone = {};
        tutte.forEach(x => { icone[x.k] = x.icona; });
        const indice = T.costruisciIndice({ pagine: tutte,
          gruppi: amm && M.gruppi ? M.gruppi.gruppi || [] : [],
          numerazioni: amm ? S.ana.numerazioni.map(n => ({ tipo: n.tipo, nome: Q.NOMI_NUMERAZIONI[n.tipo] || n.tipo })) : [],
          funzioni: amm && M.funzioni ? (M.funzioni.funzioni || []).map(f => ({ modulo: f.modulo, nome: f.nome })) : [] });
        // Le email degli avvisi e l'ora del riepilogo le vede solo chi scrive in Amministrazione.
        if (!scrive()) indice.voci = indice.voci.filter(x => x.pagina !== 'notifiche');
        const r = T.cerca(indice, M.trova);
        lista.hidden = !!r;
        risultati.hidden = !r;
        svuota(risultati);
        if (!r) return;
        if (!r.pagine.length && !r.voci.length) { aggiungi(risultati, [h('div', { class: 'vuoto' }, 'Niente con «' + String(M.trova).trim() + '»')]); return; }
        aggiungi(risultati, [
          r.pagine.length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Pagine'), h('div', { class: 'scheda righe' }, r.pagine.map(x => riga({
            sinistra: quadrato(x.icona), titolo: x.titolo, sotto: x.gruppo, attr: { 'data-pagina': x.k }, onclick: () => W.vai(x.k[0] === '#' ? x.k : '#amministrazione/' + x.k) })))) : null,
          r.voci.length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Impostazioni'), h('div', { class: 'scheda righe' }, r.voci.map(x => riga({
            sinistra: quadrato(icone[x.pagina] || 'amministrazione'), titolo: x.etichetta, sotto: x.titoloPagina + (x.gruppo ? ' · ' + x.gruppo : ''),
            attr: { 'data-trovata': x.valore }, onclick: () => apriTrovata(x) }))),
          r.tante ? h('div', { class: 'secondario' }, 'Ce ne sono altre: scrivi qualche lettera in più') : null) : null]);
      };
      const campoCerca = B.cerca(M.trova || '', 'Cerca nelle impostazioni', t => { M.trova = t; mostra(); });
      campoCerca.querySelector('input').setAttribute('aria-label', 'Cerca nelle impostazioni');
      // 13/11/2026: la versione e "Controlla aggiornamenti" subito in vista (mentre si cerca si toglie di mezzo).
      const versione = W.schedaVersione();
      const zonaVersione = h('div', { class: 'stretta-1100 zona-versione' }, versione);
      const mostraLista = mostra;
      const mostraTutto = () => { mostraLista(); zonaVersione.hidden = !versione || !!String(M.trova || '').trim(); };
      campoCerca.querySelector('input').addEventListener('input', () => setTimeout(() => { zonaVersione.hidden = !versione || !!String(M.trova || '').trim(); }, 0));
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Amministrazione')), h('div', { class: 'ricerca-amm stretta-1100' }, campoCerca), zonaVersione, lista, risultati]);
      mostraTutto();
      // Le righe di stato si completano quando il server risponde (una volta per apertura di Amministrazione).
      if (!amm) return;
      // Mentre si cerca non si ridisegna (si perderebbe il cursore): si rifanno solo i risultati.
      const cercando = () => !!String(M.trova || '').trim() || !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ricerca-amm'));
      const dopo = () => { if (location.hash !== '#amministrazione') return; if (cercando()) mostra(); else W.ridisegna(); };
      const completa = (chiave, percorso) => { if (M[chiave]) return; Rete.get(percorso).then(x => { M[chiave] = x; dopo(); }).catch(() => null); };
      completa('funzioni', '/server/funzioni');
      completa('sicurezza', '/server/sicurezza');
      completa('gruppi', '/server/impostazioniGenerali');
      completa('copie', '/server/copie');
      completa('stato', '/server/statoSistema?oraDispositivo=' + encodeURIComponent(oraLocale()));
      completa('controlli', '/server/controlliFinali');
      if (W.puo('integrazioni') && !W.Integrazioni.M.lista) Rete.get('/server/integrazioni').then(x => { W.Integrazioni.M.lista = x.integrazioni || []; dopo(); }).catch(() => null);
    }

    /**
     * Un'impostazione trovata: si apre la sua pagina, si scorre fino al campo e lo si colora di giallo chiaro per un
     * secondo e mezzo (la pagina può arrivare dopo, quando il server risponde: si riprova per qualche secondo).
     */
    function apriTrovata(x) {
      if (x.pagina === 'impostazioni') M.cerca = '';
      const dove = '#amministrazione/' + x.pagina;
      W.vai(dove);
      const sel = '#principale ' + T.selettore(x);
      let volte = 0;
      const prova = () => {
        const el = location.hash === dove ? document.querySelector(sel) : null;
        if (!el) { if (++volte < 50) setTimeout(prova, 100); return; }
        let piano = false;
        try { piano = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { piano = false; }
        el.scrollIntoView({ block: 'center', behavior: piano ? 'auto' : 'smooth' });
        el.classList.add('trovato-qui');
        setTimeout(() => el.classList.remove('trovato-qui'), 1500);
        const c = el.querySelector('input:not([disabled]):not([type=checkbox]), textarea:not([disabled])');
        if (c) c.focus({ preventScroll: true });
      };
      setTimeout(prova, 50);
    }

    /** "2026-10-22T10:05:12" in ora di qui (il server la confronta con la sua, §9.11). */
    function oraLocale() {
      const d = new Date();
      const due = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds());
    }

    /** L'id di un file: "/file/<id>" o l'id da solo. */
    function idFile(v) {
      const s = String(v || '');
      const m = s.match(/^\/file\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : /^[A-Za-z0-9_-]{4,}$/.test(s) ? s : '';
    }

    // ===================================================================== dati dello studio, logo, PDF (§9.3)

    /** Il Codice SDI dello studio: vuoto o 7 lettere o numeri, in maiuscolo (anche nelle Impostazioni generali, tipo codice_sdi). */
    const leggiSdi = t => {
      const s = String(t || '').trim().toUpperCase();
      if (!s) return { valore: '' };
      return /^[A-Z0-9]{7}$/.test(s) ? { valore: s } : { errore: 'Codice SDI: 7 lettere o numeri' };
    };

    /** true/false come PDF_LOGO: spento solo con false, 'false', 0 o 'NO'; di base acceso. */
    const acceso = v => !(v === false || v === 'false' || v === 0 || v === 'NO');

    /**
     * Salva una o più chiavi delle impostazioni (salvaImpostazioni) e le tiene in memoria. Rifiuta con la frase del server:
     * chi chiama (B.salvaDaSolo, B.salvaOra) la mostra. Niente "Salvo…" né avviso: le impostazioni si salvano da sole.
     */
    async function salvaChiavi(valori) {
      const ris = await Rete.post('/server/salvaImpostazioni', { valori });
      S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, (ris && ris.impostazioni) || valori);
      return ris;
    }

    /** Un interruttore che si salva da solo (subito) e cambia sul posto; se il server rifiuta torna com'era. */
    function interruttoreVivo(nome, sotto, valore, salva, spento, attr, frase) {
      let si = !!valore;
      const b = h('button', { type: 'button', class: 'interruttore' + (si ? ' acceso' : ''), role: 'switch', 'aria-checked': si ? 'true' : 'false', 'aria-label': nome, disabled: !!spento  }, h('i'));
      const metti = v => { si = v; b.classList.toggle('acceso', v); b.setAttribute('aria-checked', v ? 'true' : 'false'); };
      b.addEventListener('click', async () => {
        if (spento) return;
        const nuovo = !si;
        metti(nuovo);
        const ok = await B.salvaOra(b, () => salva(nuovo), frase);
        if (!ok) metti(!nuovo);
      });
      return h('div', Object.assign({ class: 'riga riga-int' }, attr || {}), h('span', { class: 'corpo' }, h('span', { class: 't1' }, nome), sotto ? h('span', { class: 't2' }, sotto) : null), b);
    }

    function studio(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const campi = {};
      /**
       * Un campo dei dati dello studio: si salva da solo (B.salvaDaSolo), una chiave alla volta. leggi: il controllo del
       * valore (il Codice SDI); data-chiave serve alla ricerca nelle impostazioni (regole-impostazioni.js).
       */
      const input = (chiave, etichetta, extra, leggi) => {
        const valore = imp[chiave] === undefined || imp[chiave] === null ? '' : imp[chiave];
        const el = extra && extra.area ? h('textarea', { rows: 3, disabled: sola }) : h('input', Object.assign({ type: 'text', value: String(valore), disabled: sola }, extra || {}));
        if (extra && extra.area) el.value = String(valore);
        campi[chiave] = el;
        if (!sola) B.salvaDaSolo(el, { leggi, salva: v => salvaChiavi({ [chiave]: v }), dopo: v => { if (typeof v === 'string' && el.value !== v && document.activeElement !== el) el.value = v; disegnaAnteprima(); } });
        const c = campo(etichetta, el);
        c.setAttribute('data-chiave', chiave);
        return c;
      };
      const firma = idFile(imp.FIRMA_TECNICO) || W.D.idDaUrl(imp.FIRMA_TECNICO);
      const logo = idFile(imp.STUDIO_LOGO);
      const anteprima = h('div', { class: 'anteprima-pdf', 'aria-label': 'Come esce il PDF' });
      const disegnaAnteprima = () => {
        const i = S.ana.impostazioni;
        const nome = (campi.RAGIONE_SOCIALE && campi.RAGIONE_SOCIALE.value) || i.RAGIONE_SOCIALE || '';
        const piva = (campi.PARTITA_IVA && campi.PARTITA_IVA.value) || i.PARTITA_IVA || '';
        const piede = (campi.PDF_PIEDE && campi.PDF_PIEDE.value) || '';
        const conLogo = logo && acceso(i.PDF_LOGO);
        // 06/11/2026 (PDF_NOME): col logo, il nome dello studio accanto si può togliere; senza logo il nome c'è sempre.
        const conNome = !conLogo || acceso(i.PDF_NOME);
        aggiungi(svuota(anteprima), [
          h('div', { class: 'ap-testa' }, h('div', { class: 'ap-studio' }, conLogo ? h('img', { class: 'ap-logo', src: '/file/' + logo, alt: 'Logo' }) : null, conNome ? h('b', null, nome) : null),
            h('div', { class: 'ap-tipo' }, h('span', null, 'RAPPORTINO DI LAVORO'), h('b', null, 'RAP/' + new Date().getFullYear() + '/0001'))),
          h('div', { class: 'ap-righe' }, h('i', { style: { width: '60%' } }), h('i'), h('i', { style: { width: '80%' } }), h('i', { style: { width: '70%' } })),
          h('div', { class: 'ap-piede' }, h('span', null, [nome, piva ? 'P.IVA ' + piva : ''].filter(Boolean).join(' · '), piede ? h('br') : null, piede || null),
            h('span', { class: 'ap-pagina' }, simbolo(), 'Pagina 1 / 2'))]);
      };
      const coppia = (...x) => h('div', { class: 'riga-campi' }, x);
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('h1', null, 'Dati dello studio')),
      h('div', { class: 'due-colonne stretta-1100' },
        h('div', { class: 'sezione' },
          // Riunione del 06/11/2026: tutti i dati dello studio in una scheda sola, nell'ordine in cui si leggono.
          h('div', { class: 'scheda', 'data-scheda': 'studio' }, h('h2', null, 'Lo studio'), h('div', { class: 'fila' },
            coppia(input('RAGIONE_SOCIALE', 'Ragione sociale'), input('STUDIO_NOME_BREVE', 'Nome breve')),
            // 1.4.0 (servizi.md §3): sotto il nome nel Mittente di preventivi e parcelle ("Perito industriale").
            input('STUDIO_QUALIFICA', 'Qualifica'),
            input('TECNICO', 'Chi compila i rapportini'),
            coppia(input('PARTITA_IVA', 'Partita IVA'), input('CODICE_FISCALE', 'Codice fiscale')),
            input('INDIRIZZO', 'Indirizzo'),
            coppia(input('STUDIO_CAP', 'CAP'), input('STUDIO_COMUNE', 'Comune'), input('STUDIO_PROVINCIA', 'Provincia')),
            coppia(input('STUDIO_SDI', 'Codice SDI', { maxlength: '7', spellcheck: 'false', autocomplete: 'off' }, leggiSdi), h('span')),
            coppia(input('EMAIL', 'Email per le risposte'), input('TELEFONO', 'Telefono')),
            coppia(input('PEC', 'PEC'), input('STUDIO_SITO', 'Sito')),
            input('PDF_PIEDE', 'Riga in fondo ai PDF'))),
          h('div', { class: 'scheda', 'data-scheda': 'albo' }, h('h2', null, 'Iscrizione all\'albo'), h('div', { class: 'fila' },
            coppia(input('ALBO', 'Albo'), input('ALBO_PROVINCIA', 'Provincia dell\'albo')),
            coppia(input('ALBO_NUMERO', 'Numero di iscrizione'), input('ALBO_DATA', 'Iscritto dal')))),
          h('div', { class: 'scheda', 'data-scheda': 'polizza' }, h('h2', null, 'Polizza e titoli'), h('div', { class: 'fila' },
            coppia(input('POLIZZA_COMPAGNIA', 'Compagnia della polizza professionale'), input('POLIZZA_NUMERO', 'Numero della polizza'), input('POLIZZA_MASSIMALE', 'Massimale')),
            input('TITOLI', 'Titoli e specializzazioni', { area: true })))),
        h('div', { class: 'sezione' },
          h('div', { class: 'scheda', 'data-scheda': 'logo', 'data-chiave': 'STUDIO_LOGO' }, h('h2', null, 'Logo'), h('div', { class: 'fila' },
            h('div', { class: 'logo-riga' }, logo ? h('img', { class: 'logo-studio', src: '/file/' + logo, alt: 'Il logo dello studio' }) : h('span', { class: 'logo-vuoto' }, '—'),
              h('span', { class: 'secondario' }, logo ? 'Il logo dello studio' : 'Nessun logo')),
            sola ? null : h('div', { class: 'pillole' }, h('button', { type: 'button', class: 'btn', onclick: scegliLogo }, logo ? 'Cambia il logo' : 'Scegli il logo'),
              logo ? h('button', { type: 'button', class: 'btn', onclick: togliLogo }, 'Togli il logo') : null),
            h('div', { class: 'scheda righe interna' },
              interruttoreVivo('Logo sui PDF', '', acceso(imp.PDF_LOGO), async v => { await salvaChiavi({ PDF_LOGO: v }); disegnaAnteprima(); }, sola, { 'data-chiave': 'PDF_LOGO' }),
              // 06/11/2026: col logo, il nome dello studio accanto si può togliere (PDF_NOME, di base sì).
              logo ? interruttoreVivo('Nome dello studio accanto al logo', '', acceso(imp.PDF_NOME), async v => { await salvaChiavi({ PDF_NOME: v }); disegnaAnteprima(); }, sola, { 'data-chiave': 'PDF_NOME' }) : null))),
          h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Come esce il PDF'), anteprima),
          h('div', { class: 'scheda', 'data-chiave': 'FIRMA_TECNICO' }, h('h2', null, 'La tua firma'), h('div', { class: 'fila' },
            firma ? h('img', { class: 'firma-tecnico', src: '/file/' + firma, alt: 'La tua firma' }) : h('div', { class: 'secondario' }, 'Non ancora caricata: sui rapportini resta lo spazio vuoto.'),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: async () => {
              const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
              if (!scelto || !scelto.ok) return;
              const ris = await lavora('Carico la firma', () => Rete.post('/server/caricaFile', { tipo: 'firmaTecnico', mime: scelto.mime, base64: scelto.base64 }));
              if (ris) { await W.ricaricaAnagrafiche(); avviso('Firma caricata'); W.ridisegna(); }
            } }, firma ? 'Cambia la firma' : 'Carica la firma'))))))]);
      disegnaAnteprima();
      ['RAGIONE_SOCIALE', 'PARTITA_IVA', 'PDF_PIEDE'].forEach(k => campi[k].addEventListener('input', disegnaAnteprima));
    }

    function simbolo() {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('width', 10);
      s.setAttribute('height', 10);
      s.setAttribute('viewBox', '0 0 32 32');
      s.innerHTML = '<rect width="32" height="32" rx="9" fill="#1B1B1F"/>' + [[16, 7.5], [22, 10], [24.5, 16], [22, 22], [16, 24.5], [10, 22], [7.5, 16], [10, 10]].map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#8A8A92"/>').join('') + '<circle cx="16" cy="16" r="3.2" fill="#F2F4F7"/>';
      return s;
    }

    /** Il logo: PNG o JPG fino a 1 MB, almeno 300 px di lato (§9.3); lo controlla anche il server. */
    async function scegliLogo() {
      const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(e => { avviso(e.message, true); return null; });
      if (!scelto || !scelto.ok) return;
      const mime = String(scelto.mime || '').toLowerCase();
      const byte = Math.floor(String(scelto.base64 || '').length * 3 / 4);
      if (!/^image\/(png|jpeg)$/.test(mime) || byte > 1024 * 1024) { avviso('Il logo deve essere un PNG o un JPG di al massimo 1 MB', true); return; }
      const lato = await new Promise(ok => { const img = new Image(); img.onload = () => ok(Math.min(img.naturalWidth, img.naturalHeight)); img.onerror = () => ok(0); img.src = 'data:' + mime + ';base64,' + scelto.base64; });
      if (lato && lato < 300) { avviso('Il logo è piccolo: serve almeno 300 px di lato, se no sui PDF si vede sgranato', true); return; }
      const ris = await lavora('Carico il logo', () => Rete.post('/server/caricaFile', { tipo: 'logo', nome: scelto.nome, mime, base64: scelto.base64 }));
      if (!ris) return;
      if (ris.file && ris.file.id && !idFile(S.ana.impostazioni.STUDIO_LOGO)) S.ana.impostazioni.STUDIO_LOGO = ris.file.id;
      await W.ricaricaAnagrafiche().catch(() => null);
      if (ris.file && ris.file.id && !idFile(S.ana.impostazioni.STUDIO_LOGO)) S.ana.impostazioni.STUDIO_LOGO = ris.file.id;
      avviso('Logo caricato: va sui PDF nuovi');
      W.disegnaPagina();
    }

    async function togliLogo() {
      if (!(await conferma('Togliere il logo?', 'I PDF nuovi escono senza logo, come prima. Quelli già fatti restano come sono.', 'Togli il logo'))) return;
      const r = await salvaValori({ STUDIO_LOGO: '' }, 'Logo tolto');
      if (r) W.disegnaPagina();
    }

    // ===================================================================== impostazioni generali (§9.4)

    const VALE_PER_NUOVE = ['EURO_KM', 'COSTO_ORARIO', 'INDENNITA_TRASFERTA', 'APPROVAZIONE', 'PREVENTIVO_VALIDITA_GIORNI', 'AUTO'];

    function impostazioni(pagina) {
      const area = h('div', { class: 'sezione' });
      const ricerca = B.cerca(M.cerca, 'Cerca un\'impostazione', v => { M.cerca = v; disegnaSchede(); });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Impostazioni generali')), h('div', { class: 'filtri' }, ricerca), area]);
      let disegnaSchede = () => {};
      leggi(area, 'gruppi', '/server/impostazioniGenerali', ris => {
        disegnaSchede = () => {
          svuota(area);
          const gruppi = Q.filtraGruppi(ris.gruppi || [], M.cerca);
          if (!gruppi.length) { aggiungi(area, [h('div', { class: 'vuoto' }, 'Nessuna impostazione con queste parole.')]); return; }
          const meta = Math.ceil(gruppi.length / 2);
          aggiungi(area, [h('div', { class: 'due-colonne stretta-1100' }, h('div', { class: 'sezione' }, gruppi.slice(0, meta).map(schedaGruppo)), h('div', { class: 'sezione' }, gruppi.slice(meta).map(schedaGruppo)))]);
        };
        disegnaSchede();
      });
    }

    /**
     * Più campi che fanno un valore solo (le due tendine del giorno e del mese, la griglia dei tempi dei ticket) e si
     * salvano da soli come un campo (base.js, salvaDaSolo): il testo 800 ms dopo l'ultima lettera, le tendine subito;
     * l'errore si dice solo uscendo dal gruppo (passare dal giorno al mese non è un errore).
     * o: { leggi() -> { valore } | { errore }, salva(valore) -> Promise, frase }.
     */
    function vivoInsieme(controlli, o) {
      const primo = o.leggi();
      let ultimo = primo.errore ? undefined : JSON.stringify(primo.valore);
      let timer = null;
      const prova = async (uscendo, el) => {
        clearTimeout(timer);
        const letto = o.leggi();
        if (letto.errore) {
          if (uscendo) { B.segnaSbagliato(el, true); avviso(letto.errore, true); }
          return;
        }
        controlli.forEach(c => B.segnaSbagliato(c, false));
        if (JSON.stringify(letto.valore) === ultimo) return;
        const ok = await B.salvaOra(el, () => o.salva(letto.valore), o.frase);
        if (ok) ultimo = JSON.stringify(letto.valore);
      };
      controlli.forEach(c => {
        if (c.tagName === 'SELECT') c.addEventListener('change', () => prova(false, c));
        else c.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => prova(false, c), 800); });
        c.addEventListener('blur', e => prova(!(e.relatedTarget && controlli.indexOf(e.relatedTarget) >= 0), c));
      });
    }

    /**
     * Una scheda delle impostazioni generali coi tipi che manda il server (§13.6): numero {min, max, unita, decimali},
     * scelta {scelte}, si_no, testo {max}, testo_lungo, giorno_mese ("MM-GG"), elenco {scelte} (si tolgono), tempi_ticket
     * {righe, colonne}, documenti_collaboratori {righe, scelte}, sola_lettura; più i collegamenti alle altre pagine e le
     * azioni (Spegni il portale adesso). Dal 06/11/2026 ogni voce si salva da sola (una chiave per volta): testi e numeri
     * quando smetti di scrivere e uscendo dal campo, scelte, interruttori e tendine subito.
     */
    function schedaGruppo(g) {
      const sola = !scrive();
      const tipoDi = v => ({ si: 'si_no', sola: 'sola_lettura', tempi: 'tempi_ticket' }[v.tipo] || v.tipo);
      const fraseDi = v => (VALE_PER_NUOVE.indexOf(v.chiave) >= 0 || v.vale === 'nuove' ? 'Salvato: vale per le cose nuove' : undefined);
      // Salva una voce e tiene il valore nuovo (la ricerca ridisegna le schede dagli stessi oggetti).
      const salvaVoce = (v, valore) => salvaChiavi({ [v.chiave]: valore }).then(r => { v.valore = valore; return r; });
      const pillole = (scelte, attive, cambia) => h('div', { class: 'pillole' }, (scelte || []).map(([k, nome]) => h('button', { type: 'button', class: 'pillola piccola' + (attive.indexOf(k) >= 0 ? ' scelta' : ''),
        'aria-pressed': attive.indexOf(k) >= 0 ? 'true' : 'false', disabled: sola, onclick: () => cambia(k) }, nome)));
      // Togli o metti una pillola e salva subito; se il server rifiuta torna com'era.
      const alterna = async (l, k, zona, rifai, salva, frase) => {
        const prima = l.slice();
        const i = l.indexOf(k);
        if (i >= 0) l.splice(i, 1); else l.push(k);
        rifai();
        const ok = await B.salvaOra(zona, salva, frase);
        if (!ok) { l.splice(0, l.length, ...prima); rifai(); }
      };
      const righe = (g.voci || []).map(v => {
        const tipo = tipoDi(v);
        const frase = fraseDi(v);
        if (tipo === 'scelta') {
          let scelto = v.valore;
          const zona = h('div');
          const rifai = () => aggiungi(svuota(zona), [segmenti(v.scelte || [], scelto, async x => {
            if (sola || String(x) === String(scelto)) return;
            const prima = scelto;
            scelto = x;
            rifai();
            const ok = await B.salvaOra(zona, () => salvaVoce(v, x), frase);
            if (!ok) { scelto = prima; rifai(); }
          }, 'piccoli')]);
          rifai();
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), zona);
        }
        if (tipo === 'si_no') {
          let si = vero(v.valore);
          const b = h('button', { type: 'button', class: 'interruttore' + (si ? ' acceso' : ''), role: 'switch', 'aria-checked': si ? 'true' : 'false', 'aria-label': v.etichetta, disabled: sola  }, h('i'));
          const metti = x => { si = x; b.classList.toggle('acceso', x); b.setAttribute('aria-checked', x ? 'true' : 'false'); };
          b.addEventListener('click', async () => {
            if (sola) return;
            const nuovo = !si;
            metti(nuovo);
            const ok = await B.salvaOra(b, () => salvaVoce(v, nuovo), frase);
            if (!ok) metti(!nuovo);
          });
          return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), b);
        }
        if (tipo === 'sola_lettura') return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), h('span', { class: 'val secondario' }, String(v.valore === undefined ? '' : v.valore) + (v.chiave === 'WISPER_ORA_COPIA' ? ' (si cambia sul NAS)' : '')));
        if (tipo === 'elenco') {
          const l = (Array.isArray(v.valore) ? v.valore : []).slice();
          const zona = h('div');
          const rifai = () => aggiungi(svuota(zona), [pillole(v.scelte, l, k => alterna(l, k, zona, rifai, () => salvaVoce(v, l.slice()), frase))]);
          rifai();
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), zona);
        }
        if (tipo === 'documenti_collaboratori') {
          const base = v.valore && typeof v.valore === 'object' ? v.valore : {};
          const tutti = {};
          (v.righe || []).forEach(([k]) => { tutti[k] = (base[k] || []).slice(); });
          const copia = () => { const o = {}; Object.keys(tutti).forEach(k => { o[k] = tutti[k].slice(); }); return o; };
          const zona = h('div', { class: 'fila' });
          const rifai = () => aggiungi(svuota(zona), (v.righe || []).map(([k, nome]) => h('div', { class: 'campo' }, h('label', null, nome),
            pillole(v.scelte, tutti[k], d => alterna(tutti[k], d, zona, rifai, () => salvaVoce(v, copia()), frase)))));
          rifai();
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), zona);
        }
        if (tipo === 'tempi_ticket') {
          const t = typeof v.valore === 'string' ? (() => { try { return JSON.parse(v.valore); } catch (e) { return {}; } })() : (v.valore || {});
          const righeT = v.righe || Q.PRIORITA;
          const colonne = v.colonne || [['presa', 'Presa in carico entro'], ['intervento', 'Intervento entro']];
          const celle = {};
          const tutte = [];
          const griglia = h('div', { class: 'tab-tempi' }, h('span', { class: 'k' }, 'Priorità'), colonne.map(c => h('span', { class: 'k' }, c[1])),
            righeT.map(([k, nome]) => {
              const r = t[k] || {};
              celle[k] = {};
              return [h('span', null, nome)].concat(colonne.map(([c, cNome]) => {
                const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'num-in', value: Q.numeroCampo(r[c]), disabled: sola, 'aria-label': nome + ': ' + cNome.toLowerCase() + ', ' + (v.unita || 'ore') });
                celle[k][c] = inp;
                tutte.push(inp);
                return conSuffisso(inp, v.unita || 'ore');
              }));
            }));
          if (!sola) vivoInsieme(tutte, { frase, salva: x => salvaVoce(v, x), leggi: () => {
            const x = {};
            Object.keys(celle).forEach(k => { x[k] = {}; Object.keys(celle[k]).forEach(c => { x[k][c] = Q.numeroScritto(celle[k][c].value); }); });
            const e = Q.erroreTempi(x, v.righe);
            return e ? { errore: e } : { valore: x };
          } });
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), griglia);
        }
        if (tipo === 'testo_lungo') {
          const ta = h('textarea', { rows: 5, disabled: sola, 'aria-label': v.etichetta, maxlength: v.max ? String(v.max) : null });
          ta.value = String(v.valore === undefined || v.valore === null ? '' : v.valore);
          if (!sola) B.salvaDaSolo(ta, { frase, salva: x => salvaVoce(v, x) });
          return h('div', { class: 'imp-riga colonna campo', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), ta);
        }
        if (tipo === 'giorno_mese') {
          // Giorno e mese con due tendine ("7" "luglio"), non un testo da scrivere in un formato.
          const m = String(v.valore || '').match(/^(\d{2})-(\d{2})$/);
          const giorno = h('select', { class: 'scelta', disabled: sola, 'aria-label': v.etichetta + ': giorno' },
            [h('option', { value: '' }, '—')].concat(Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1).padStart(2, '0') }, String(i + 1)))));
          const mese = h('select', { class: 'scelta', disabled: sola, 'aria-label': v.etichetta + ': mese' },
            [h('option', { value: '' }, '—')].concat(Q.MESI_ANNO.map((n, i) => h('option', { value: String(i + 1).padStart(2, '0') }, n))));
          if (m) { mese.value = m[1]; giorno.value = m[2]; }
          if (!sola) vivoInsieme([giorno, mese], { frase, salva: x => salvaVoce(v, x), leggi: () => {
            const x = Q.giornoMeseDa(giorno.value, mese.value);
            const e = Q.erroreGiornoMese(x, v.etichetta);
            return e ? { errore: e } : { valore: x || '' };
          } });
          return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), h('span', { class: 'giorno-mese' }, giorno, mese));
        }
        const input = h('input', { type: 'text', class: tipo === 'numero' ? 'num-in' : 'testo-in', inputmode: tipo === 'numero' ? 'decimal' : null,
          value: tipo === 'numero' ? Q.numeroCampo(v.valore) : String(v.valore === undefined || v.valore === null ? '' : v.valore),
          disabled: sola, 'aria-label': v.etichetta, placeholder: v.segnaposto || null, maxlength: v.max ? String(v.max) : null });
        if (!sola) {
          const vuoto = v.vuoto !== undefined ? v.vuoto : v.valore === '' || v.valore === null;
          const leggiOra = t => {
            const m = String(t || '').trim().match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
            return m ? { valore: m[1].padStart(2, '0') + ':' + m[2] } : { errore: v.etichetta + ': scrivi l\'ora, per esempio 8:00' };
          };
          B.salvaDaSolo(input, { frase, salva: x => salvaVoce(v, x),
            leggi: tipo === 'numero' ? t => {
              const e = B.numeroAMeta(t) ? (v.nomeBreve || v.etichetta) + ': scrivi un numero' : Q.erroreVoce(Object.assign({}, v, { vuoto }), t);
              return e ? { errore: e } : { valore: String(t).trim() === '' ? '' : Q.numeroScritto(t) };
            } : tipo === 'codice_sdi' ? leggiSdi : tipo === 'ora' ? leggiOra : null });
        }
        return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), v.unita ? conSuffisso(input, v.unita) : input);
      });
      const collegamenti = (g.collegamenti || []).map(c => h('button', { type: 'button', class: 'imp-riga collegamento-imp', onclick: () => apriCollegamento(c) },
        h('span', { class: 'lab' }, c.nome), h('span', { class: 'val secondario' }, c.valore || '', icona('freccia', 16, 2.2))));
      const azioni = sola ? [] : (g.azioni || []).map(a => h('button', { type: 'button', class: 'btn bordo-rosso', onclick: () => azione(a) }, a.nome));
      return h('div', { class: 'scheda scheda-imp', 'data-gruppo': g.chiave }, h('h2', null, g.nome), righe, collegamenti,
        azioni.length ? h('div', { class: 'piede-scheda pillole' }, azioni) : null);
    }

    /** Le azioni di una scheda (Spegni il portale adesso): la conferma del server, poi di nuovo con conferma: true. */
    async function azione(a) {
      const prova = c2 => lavora(a.nome, () => Rete.post('/server/' + a.azione, c2 ? { conferma: true } : {}).catch(e => { if (e && e.dati && (e.dati.serveConferma || e.dati.conferma)) return { serveConferma: e.dati.frase || e.message }; throw e; }));
      const r = await prova(false);
      if (!r) return;
      if (r.serveConferma && !(await conferma(a.nome + '?', r.serveConferma, a.nome, true))) return;
      const r2 = r.serveConferma ? await prova(true) : r;
      if (!r2 || r2.serveConferma) return;
      M.gruppi = null;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso('Fatto');
      W.disegnaPagina();
    }

    function apriCollegamento(c) {
      const sez = c.sezione || '';
      if (c.pagina === 'amministrazione') { W.vai('#amministrazione' + (sez ? '/' + sez : '')); return; }
      if (c.pagina === 'documenti') { W.vai('#documenti' + (sez ? '/' + sez : '')); return; }
      if (c.pagina === 'banche') { W.vai('#banche' + (sez ? '/' + sez : '')); return; }
      if (c.pagina === 'integrazioni' || c.pagina === 'integrazione') { W.vai('#integrazioni' + (c.id ? '/' + c.id : '')); return; }
      W.vaiA(c);
    }

    // ===================================================================== funzioni accese (§9.5)

    function funzioni(pagina) {
      const area = h('div', { class: 'stretta-820 sezione' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Funzioni accese')), area]);
      leggi(area, 'funzioni', '/server/funzioni', ris => {
        const t = titolare();
        aggiungi(area, [h('div', { class: 'scheda righe' }, (ris.funzioni || []).map(f => {
          if (!f.spegnibile) return h('div', { class: 'riga riga-int', 'data-modulo': f.modulo }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, f.nome)), pill('Sempre accesa', 'grigio'));
          const frase = String(f.cosaCambia || (Q.SPEGNIBILI[f.modulo] || {}).cosaCambia || '').split('. ')[0];
          if (!t) return h('div', { class: 'riga riga-int', 'data-modulo': f.modulo }, h('span', { class: 'corpo' }, h('span', { class: 't1' }, f.nome), h('span', { class: 't2' }, frase)), pill(f.accesa ? 'Accesa' : 'Spenta', f.accesa ? 'verde' : 'grigio'));
          const r = interruttore(f.nome, frase, f.accesa !== false, v => cambiaFunzione(f, v, ris.funzioni || []));
          r.setAttribute('data-modulo', f.modulo);
          return r;
        }))]);
      });
    }

    /**
     * Accendere o spegnere una funzione (accordo progetti.md §5). Spegnendo, il foglio di conferma dice cosa cambia e quali
     * funzioni si spengono con lei ("Si spengono anche: …", dalle serveA ancora accese); accendendo, il foglio c'è solo se se
     * ne accendono anche altre ("Si accendono anche: …", dalle richiede spente). Dopo si rileggono io (menu e permessi),
     * anagrafiche e rapportini: una funzione riaccesa riporta dati che prima non si leggevano.
     */
    async function cambiaFunzione(f, accesa, funzioni) {
      const d = Q.domandaCambio(f, accesa, funzioni);
      if (!accesa || d.anche.length) {
        const ok = await new Promise(risolvi => {
          let detto = false;
          const rispondi = v => { if (!detto) { detto = true; risolvi(v); } };
          let chiudi;
          chiudi = finestra({ titolo: d.titolo, fuoco: false, allaChiusura: () => rispondi(false),
            corpo: h('div', { class: 'foglio-funzione' }, h('p', { class: 'testo-forte', style: { margin: 0 } }, d.testo),
              d.fraseAnche ? h('p', { class: 'anche', style: { margin: '12px 0 0', fontWeight: '800' } }, d.fraseAnche) : null),
            pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => { rispondi(false); chiudi(); } }, 'Annulla'),
              h('button', { type: 'button', class: 'btn grande ' + (accesa ? 'giallo' : 'bordo-rosso'), onclick: () => { rispondi(true); chiudi(); } }, d.pulsante)] });
        });
        if (!ok) return;
      }
      const r = await lavora(accesa ? 'Accendo ' + f.nome : 'Spengo ' + f.nome, () => Rete.post('/server/salvaFunzioni', { modulo: f.modulo, accesa: !!accesa }));
      if (!r) return;
      M.funzioni = null;
      await W.rileggiIo();
      await Promise.all([W.ricaricaAnagrafiche().catch(() => null), W.rileggiRapportini()]);
      if (W.Progetti) W.Progetti.daRileggere();
      W.caricaDashboard();
      avviso(Q.avvisoCambio(f.nome, accesa, r.anche || []));
      W.disegnaPagina();
    }

    // ===================================================================== numerazioni e il formato del codice commessa (§9.6)

    function numerazioni(pagina) {
      const anno = new Date().getFullYear();
      const lista = Q.ORDINE_NUMERAZIONI.map(t => S.ana.numerazioni.find(n => n.tipo === t)).filter(Boolean)
        .concat(S.ana.numerazioni.filter(n => Q.ORDINE_NUMERAZIONI.indexOf(n.tipo) < 0));
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Numerazioni')),
        lista.length ? h('div', { class: 'scheda righe stretta-820' }, lista.map(n => {
          const prossimo = n.prossimo || Q.codiceDa(n.formato, anno, (Number(n.ultimo) || 0) + 1);
          const apre = scrive() ? (n.tipo === 'commessa' ? () => W.vai('#amministrazione/formato') : () => aiuti.modificaNumerazione(n)) : null;
          return riga({ sinistra: quadrato('numero'), titolo: Q.NOMI_NUMERAZIONI[n.tipo] || n.tipo, sotto: (n.parole || R.formatoAParole(n.formato)) + ' · ' + Q.comeContinua({ annuale: n.riparte !== undefined ? n.riparte : n.annuale }),
            destra: h('span', { class: 'codice' }, prossimo), onclick: apre, attr: { 'data-tipo': n.tipo } });
        })) : h('p', { class: 'vuoto' }, 'Il server non ha ancora mandato le numerazioni.'),
        h('div', { class: 'scheda righe stretta-820' }, riga({ sinistra: quadrato('fatturazione'), titolo: 'Fatture', sotto: 'Il numero lo dà il programma delle fatture' }))]);
    }

    /** I codici delle commesse di prima, dal più basso al più alto ("26ST001 … 26ST047"). */
    function codiciDiPrima() {
      const codici = S.ana.commesse.filter(m => !m.modello).map(m => String(m.id)).filter(c => Q.numeroDa(c) > 0)
        .sort((a, b) => Q.numeroDa(a) - Q.numeroDa(b));
      return { primo: codici[0] || '', ultimo: codici[codici.length - 1] || '', numeri: codici };
    }

    /**
     * Il formato del codice delle commesse. Dal 06/11/2026 si salva da solo: le scelte subito, il testo uscendo dal campo,
     * e accanto al titolo compare "Formato salvato: vale per le commesse nuove". Niente foglio di conferma: la prossima
     * commessa si vede già nell'anteprima, con le commesse di prima.
     */
    function formato(pagina) {
      const n = S.ana.numerazioni.find(x => x.tipo === 'commessa');
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai('#amministrazione/numerazioni')), h('span', { class: 'dove' }, 'Numerazioni')),
        h('div', { class: 'testata' }, h('h1', null, 'Il codice delle commesse'))]);
      if (!n) { aggiungi(pagina, [h('p', { class: 'vuoto' }, 'Il server non ha mandato la numerazione delle commesse.')]); return; }
      const pezzi = Q.pezziCommessa(n.formato);
      if (!pezzi) {
        aggiungi(pagina, [h('div', { class: 'scheda stretta-820 fila' }, h('p', { class: 'testo-forte', style: { margin: 0 } }, 'Il formato di adesso (' + R.formatoAParole(n.formato) + ') non si fa con questi pezzi.'),
          scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => aiuti.modificaNumerazione(n) }, 'Cambialo coi pezzi')) : null)]);
        return;
      }
      if (!M.formato) M.formato = Object.assign({}, pezzi);
      const f = M.formato;
      const anno = new Date().getFullYear();
      const prima = codiciDiPrima();
      // Il prossimo numero lo dice il server (numeroProssimo); se no, dal più alto fra l'ultimo e i codici di prima.
      const prossimo = Math.max(Number(n.numeroProssimo) || 0, Q.prossimoNumero(n.ultimo, prima.numeri));
      const salvato = { formato: n.formato };
      const testo = h('input', { type: 'text', value: f.testo, maxlength: '8', disabled: !scrive(), 'aria-label': 'Testo' });
      const anteprima = h('span', { class: 'formato-grande', id: 'anteprima-formato' });
      const aggiorna = () => { anteprima.textContent = Q.codiceDa(Q.formatoCommessa(f), anno, prossimo); };
      const salvaSeCambiato = async dove => {
        if (!scrive()) return;
        const nuovo = Q.formatoCommessa(f);
        const errore = R.erroreFormato(nuovo, false);
        if (errore) { B.segnaSbagliato(dove, true); avviso(errore, true); return; }
        B.segnaSbagliato(dove, false);
        if (nuovo === salvato.formato) return;
        const ok = await B.salvaOra(dove, () => Rete.post('/server/salvaNumerazione', { tipo: 'commessa', formato: nuovo, annuale: false }), 'Formato salvato: vale per le commesse nuove');
        if (ok) { salvato.formato = nuovo; W.ricaricaAnagrafiche().catch(() => null); }
      };
      testo.addEventListener('input', () => { f.testo = testo.value.replace(/[{}\s]/g, ''); aggiorna(); });
      testo.addEventListener('blur', () => salvaSeCambiato(testo));
      const domanda = (nome, voci, chiave) => {
        const zona = h('div');
        const rifai = () => aggiungi(svuota(zona), [segmenti(voci, String(f[chiave]), x => {
          if (!scrive() || String(x) === String(f[chiave])) return;
          f[chiave] = chiave === 'cifre' ? Number(x) : x;
          rifai();
          aggiorna();
          salvaSeCambiato(zona);
        }, 'piccoli')]);
        rifai();
        return h('div', { class: 'campo' }, h('label', null, nome), zona);
      };
      aggiungi(pagina, [h('div', { class: 'due-colonne stretta-1100' },
        h('div', { class: 'scheda fila' }, h('h2', null, 'Come si scrive'),
          domanda('Anno', [['26', String(anno % 100).padStart(2, '0')], ['2026', String(anno)], ['', 'Niente']], 'anno'),
          campo('Testo', testo),
          domanda('Ordine', [['anno', 'Anno prima'], ['testo', 'Testo prima']], 'ordine'),
          domanda('Separatore', [['', 'Niente'], ['-', '-'], ['/', '/']], 'sep'),
          domanda('Cifre del numero', [['3', '3'], ['4', '4']], 'cifre')),
        h('div', { class: 'sezione' },
          h('div', { class: 'scheda fila anteprima-formato' }, h('span', { class: 'etichetta' }, 'La prossima sarà'), anteprima,
            h('span', { class: 'secondario' }, Q.frasePrima(prima.primo, prima.ultimo, prossimo)))))]);
      aggiorna();
    }

    // ===================================================================== notifiche (§9.7)

    /**
     * Le notifiche di chi entra (interruttori che si salvano subito: al server va tutto l'insieme) e, per chi scrive in
     * Amministrazione, le email degli avvisi del server e l'ora del riepilogo, che si salvano da sole (06/11/2026).
     */
    function notifiche(pagina) {
      const amm = W.puo('amministrazione');
      if (amm) aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai('#amministrazione')), h('span', { class: 'dove' }, 'Amministrazione'))]);
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Notifiche'))]);
      const sinistra = h('div', { class: 'sezione' });
      const destra = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'due-colonne stretta-1100' }, sinistra, destra)]);
      leggi(sinistra, 'notifiche', '/server/notifichePreferenze', ris => {
        const s = { telefono: ris.telefono !== false, silenzioSera: ris.silenzioSera !== false, tipi: Object.assign({}, ris.tipi || {}) };
        const manda = () => Rete.post('/server/salvaNotifichePreferenze', { telefono: s.telefono, silenzioSera: s.silenzioSera, tipi: s.tipi })
          .then(r => { Object.assign(ris, { telefono: s.telefono, silenzioSera: s.silenzioSera, tipi: Object.assign({}, s.tipi) }); return r; });
        // Un interruttore: cambia sul posto, salva l'insieme; se il server rifiuta torna com'era.
        const vivo = (nome, sotto, leggiV, scriviV, frase) => interruttoreVivo(nome, sotto, leggiV(), x => { const prima = leggiV(); scriviV(x); return manda().catch(e => { scriviV(prima); throw e; }); }, false, null, frase);
        aggiungi(sinistra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Le tue notifiche'), h('div', { class: 'fila' },
          h('div', { class: 'scheda righe interna' },
            vivo('Avvisami sul telefono', '', () => s.telefono, x => { s.telefono = x; }),
            vivo('Di sera e nei festivi niente avvisi sul telefono', 'Dalle 20 alle 7: restano nella campanella', () => s.silenzioSera, x => { s.silenzioSera = x; })),
          Q.gruppiNotifiche(s.tipi).map(g => [h('span', { class: 'etichetta' }, g.nome), h('div', { class: 'scheda righe interna' },
            g.tipi.map(t => vivo(t.nome, '', () => s.tipi[t.chiave] !== false, x => { s.tipi[t.chiave] = x; }, 'Salvato: una notifica spenta non arriva più')))])))]);
      });
      if (!scrive()) return;
      const imp = S.ana.impostazioni;
      const email = h('input', { type: 'text', value: String(imp.EMAIL_AVVISI || ''), autocomplete: 'off', spellcheck: 'false' });
      const ora = h('input', { type: 'text', value: String(imp.NOTIFICHE_ORA || '08:00').replace(/^0(\d):/, '$1:'), inputmode: 'numeric' });
      B.salvaDaSolo(email, { leggi: t => { const e = Q.erroreEmailAvvisi(t); return e ? { errore: e } : { valore: String(t).split(/[,;\s]+/).filter(Boolean).join(', ') }; },
        salva: x => salvaChiavi({ EMAIL_AVVISI: x }) });
      B.salvaDaSolo(ora, { leggi: t => { const e = Q.erroreOra(t); return e ? { errore: e } : { valore: String(t).trim().replace('.', ':').padStart(5, '0') }; },
        salva: x => salvaChiavi({ NOTIFICHE_ORA: x }) });
      const campoEmail = campo('Avvisi del server a', email);
      campoEmail.setAttribute('data-chiave', 'EMAIL_AVVISI');
      const campoOra = campo('Ora del riepilogo del mattino', ora);
      campoOra.setAttribute('data-chiave', 'NOTIFICHE_ORA');
      aggiungi(destra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Per lo studio'), campoEmail, campoOra,
        h('div', { class: 'pillole' },
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const r = await lavora('Mando la prova', () => Rete.post('/server/provaAvvisi', {}));
            if (r) avviso('Prova degli avvisi mandata a ' + ((r.a || []).join(', ') || 'gli indirizzi salvati'));
          } }, 'Manda una prova')))]);
    }

    // ===================================================================== aspetto (§9.9)

    function aspetto(pagina) {
      let tema = 'auto';
      try { tema = localStorage.getItem('wisper-tema') || 'auto'; } catch (e) { /* senza memoria */ }
      const zonaTema = h('div');
      const disegnaTema = () => aggiungi(svuota(zonaTema), [segmenti([['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']], tema, x => {
        tema = x;
        try { localStorage.setItem('wisper-tema', x); } catch (e) { /* resta per questa volta */ }
        document.documentElement.setAttribute('data-tema', x);
        disegnaTema();
      })]);
      disegnaTema();
      const a = S.aggiornamento;
      const loc = S.locale || {};
      const Coll = window.WisperCollegamento;
      const fraseCollegamento = h('span', { class: 'frase-collegamento' }, Coll.frase(loc));
      if (!S.esempio) Api.get('/locale/stato').then(st => { S.locale = st; fraseCollegamento.textContent = Coll.frase(st); }).catch(() => null);
      const zonaMenu = h('div');
      const disegnaMenu = () => aggiungi(svuota(zonaMenu), [interruttore('Menu richiuso a sole icone', '', !!S.latoChiuso, () => { W.richiudiLato(); disegnaMenu(); })]);
      disegnaMenu();
      if (W.puo('amministrazione')) aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai('#amministrazione')), h('span', { class: 'dove' }, 'Amministrazione'))]);
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Aspetto')),
        h('div', { class: 'stretta-820 sezione' },
          h('div', { class: 'scheda' }, h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Tema')), zonaTema)),
          h('div', { class: 'scheda righe' }, zonaMenu),
          h('div', { class: 'scheda' },
            h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Visita guidata'), h('span', null, 'Da capo, coi dati di esempio')),
              h('button', { type: 'button', class: 'btn', onclick: () => W.iniziaVisita() }, 'Rifai la visita guidata')),
            loc.cartellaPdf ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'I PDF'), h('span', null, loc.cartellaPdf)),
              h('button', { type: 'button', class: 'btn', onclick: () => Api.post('/locale/cartella-pdf').catch(() => null) }, 'Apri la cartella')) : null,
            loc.server || loc.google ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Collegamento'), fraseCollegamento),
              h('button', { type: 'button', class: 'btn', onclick: () => W.esci() }, 'Esci')) : null,
            h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Licenze'), h('span', null, 'Caratteri Plus Jakarta Sans e Figtree, SIL OFL 1.1')),
              h('button', { type: 'button', class: 'btn', onclick: W.mostraLicenza }, 'Leggi')),
            S.versione ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Versione ' + S.versione), h('span', null, W.statoAggiornamenti())),
              a && a.stato === 'pronto'
                ? h('button', { type: 'button', class: 'btn giallo', onclick: W.riavvia }, 'Riavvia adesso')
                : a && a.attivi ? h('button', { type: 'button', class: 'btn', onclick: W.cercaAggiornamenti }, 'Controlla aggiornamenti') : null) : null))]);
    }

    return { elenco, studio, impostazioni, funzioni, numerazioni, formato, notifiche, aspetto, daRileggere, M, idFile, oraLocale };
  };
})(window);
