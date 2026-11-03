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
    const { h, aggiungi, svuota, icona, tondo, iniziali, avviso, lavora, finestra, conferma, campo, conSuffisso, segmenti, riga, quadrato, segnaposto } = B;
    const scrive = () => W.puo('amministrazione', 2);
    const titolare = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'titolare');
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
    const vero = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'SI';

    const M = { funzioni: null, sicurezza: null, gruppi: null, copie: null, stato: null, controlli: null, notifiche: null, cerca: '', formato: null };
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
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Amministrazione')),
        h('div', { class: 'due-colonne stretta-1100 elenco-amm' }, h('div', { class: 'sezione' }, sx.map(blocco)), dx.length ? h('div', { class: 'sezione' }, dx.map(blocco)) : null)]);
      // Le righe di stato si completano quando il server risponde (una volta per apertura di Amministrazione).
      if (!amm) return;
      const completa = (chiave, percorso) => { if (M[chiave]) return; Rete.get(percorso).then(x => { M[chiave] = x; if (location.hash === '#amministrazione') W.ridisegna(); }).catch(() => null); };
      completa('funzioni', '/server/funzioni');
      completa('sicurezza', '/server/sicurezza');
      completa('gruppi', '/server/impostazioniGenerali');
      completa('copie', '/server/copie');
      completa('stato', '/server/statoSistema?oraDispositivo=' + encodeURIComponent(oraLocale()));
      completa('controlli', '/server/controlliFinali');
      if (W.puo('integrazioni') && !W.Integrazioni.M.lista) Rete.get('/server/integrazioni').then(x => { W.Integrazioni.M.lista = x.integrazioni || []; if (location.hash === '#amministrazione') W.ridisegna(); }).catch(() => null);
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

    function studio(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const campi = {};
      const input = (chiave, etichetta, extra) => {
        const valore = imp[chiave] === undefined || imp[chiave] === null ? '' : imp[chiave];
        campi[chiave] = h('input', Object.assign({ type: 'text', value: String(valore), disabled: sola }, extra || {}));
        return campo(etichetta, campi[chiave]);
      };
      const firma = idFile(imp.FIRMA_TECNICO) || W.D.idDaUrl(imp.FIRMA_TECNICO);
      const logo = idFile(imp.STUDIO_LOGO);
      const logoSuiPdf = imp.PDF_LOGO !== false && imp.PDF_LOGO !== 'false';
      const areaTitoli = h('textarea', { rows: 3, disabled: sola });
      areaTitoli.value = imp.TITOLI || '';
      campi.TITOLI = areaTitoli;
      const salva = (chiavi, frase) => {
        const valori = {};
        chiavi.forEach(k => { valori[k] = campi[k].value.trim(); });
        salvaValori(valori, frase).then(r => { if (r) W.disegnaPagina(); });
      };
      const anteprima = h('div', { class: 'anteprima-pdf', 'aria-label': 'Come esce il PDF' });
      const disegnaAnteprima = () => {
        const nome = (campi.RAGIONE_SOCIALE && campi.RAGIONE_SOCIALE.value) || imp.RAGIONE_SOCIALE || '';
        const piva = (campi.PARTITA_IVA && campi.PARTITA_IVA.value) || imp.PARTITA_IVA || '';
        const piede = (campi.PDF_PIEDE && campi.PDF_PIEDE.value) || '';
        aggiungi(svuota(anteprima), [
          h('div', { class: 'ap-testa' }, h('div', { class: 'ap-studio' }, logo && logoSuiPdf ? h('img', { class: 'ap-logo', src: '/file/' + logo, alt: 'Logo' }) : null, h('b', null, nome)),
            h('div', { class: 'ap-tipo' }, h('span', null, 'RAPPORTINO DI LAVORO'), h('b', null, 'RAP/' + new Date().getFullYear() + '/0001'))),
          h('div', { class: 'ap-righe' }, h('i', { style: { width: '60%' } }), h('i'), h('i', { style: { width: '80%' } }), h('i', { style: { width: '70%' } })),
          h('div', { class: 'ap-piede' }, h('span', null, [nome, piva ? 'P.IVA ' + piva : ''].filter(Boolean).join(' · '), piede ? h('br') : null, piede || null),
            h('span', { class: 'ap-pagina' }, simbolo(), 'Pagina 1 / 2'))]);
      };
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('h1', null, 'Dati dello studio'),
        sola ? null : h('button', { type: 'button', class: 'btn giallo', onclick: () => salva(['RAGIONE_SOCIALE', 'STUDIO_NOME_BREVE', 'TECNICO', 'INDIRIZZO', 'PARTITA_IVA', 'EMAIL', 'TELEFONO', 'PEC', 'STUDIO_SITO', 'PDF_PIEDE'], 'Salvato: vale per i PDF nuovi') }, 'Salva')),
      h('div', { class: 'due-colonne stretta-1100' },
        h('div', { class: 'sezione' },
          h('div', { class: 'scheda' }, h('h2', null, 'Lo studio'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, input('RAGIONE_SOCIALE', 'Ragione sociale'), input('STUDIO_NOME_BREVE', 'Nome breve')),
            h('div', { class: 'riga-campi' }, input('TECNICO', 'Chi firma i rapportini'), input('PARTITA_IVA', 'Partita IVA')),
            input('INDIRIZZO', 'Indirizzo'),
            h('div', { class: 'riga-campi' }, input('EMAIL', 'Email per le risposte'), input('TELEFONO', 'Telefono')),
            h('div', { class: 'riga-campi' }, input('PEC', 'PEC'), input('STUDIO_SITO', 'Sito')),
            input('PDF_PIEDE', 'Riga in fondo ai PDF'))),
          h('div', { class: 'scheda' }, h('h2', null, 'Per le fatture'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, input('CODICE_FISCALE', 'Codice fiscale'), input('STUDIO_CAP', 'CAP'), input('STUDIO_COMUNE', 'Comune'), input('STUDIO_PROVINCIA', 'Provincia')),
            h('div', { class: 'riga-campi' }, input('ALBO', 'Albo'), input('ALBO_PROVINCIA', 'Provincia dell\'albo'), input('ALBO_NUMERO', 'Numero di iscrizione'), input('ALBO_DATA', 'Iscritto dal')),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salva(['CODICE_FISCALE', 'STUDIO_CAP', 'STUDIO_COMUNE', 'STUDIO_PROVINCIA', 'ALBO', 'ALBO_PROVINCIA', 'ALBO_NUMERO', 'ALBO_DATA'],
              'Salvato: vale per le fatture che passi al programma da adesso') }, 'Salva')))),
          h('div', { class: 'scheda' }, h('h2', null, 'Polizza e titoli'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, input('POLIZZA_COMPAGNIA', 'Compagnia della polizza professionale'), input('POLIZZA_NUMERO', 'Numero della polizza'), input('POLIZZA_MASSIMALE', 'Massimale')),
            campo('Titoli e specializzazioni', areaTitoli),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salva(['POLIZZA_COMPAGNIA', 'POLIZZA_NUMERO', 'POLIZZA_MASSIMALE', 'TITOLI'], 'Salvato: polizza e titoli vanno nei preventivi nuovi') }, 'Salva'))))),
        h('div', { class: 'sezione' },
          h('div', { class: 'scheda' }, h('h2', null, 'Logo'), h('div', { class: 'fila' },
            h('div', { class: 'logo-riga' }, logo ? h('img', { class: 'logo-studio', src: '/file/' + logo, alt: 'Il logo dello studio' }) : h('span', { class: 'logo-vuoto' }, '—'),
              h('span', { class: 'secondario' }, logo ? 'Il logo dello studio' : 'Nessun logo')),
            sola ? null : h('div', { class: 'pillole' }, h('button', { type: 'button', class: 'btn', onclick: scegliLogo }, logo ? 'Cambia il logo' : 'Scegli il logo'),
              logo ? h('button', { type: 'button', class: 'btn', onclick: togliLogo }, 'Togli il logo') : null),
            h('div', { class: 'scheda righe interna' }, interruttore('Logo sui PDF', '', logoSuiPdf, async v => { const r = await salvaValori({ PDF_LOGO: v }, v ? 'Il logo va sui PDF nuovi' : 'I PDF nuovi escono senza logo'); if (r) W.disegnaPagina(); }, sola)))),
          h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Come esce il PDF'), anteprima),
          h('div', { class: 'scheda' }, h('h2', null, 'La tua firma'), h('div', { class: 'fila' },
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
     * Una scheda delle impostazioni generali coi tipi che manda il server (§13.6): numero {min, max, unita, decimali},
     * scelta {scelte}, si_no, testo {max}, testo_lungo, giorno_mese ("MM-GG"), elenco {scelte} (si tolgono), tempi_ticket
     * {righe, colonne}, documenti_collaboratori {righe, scelte}, sola_lettura; più i collegamenti alle altre pagine e le
     * azioni (Spegni il portale adesso). Il Salva è col bordo e salva solo quello che è cambiato.
     */
    function schedaGruppo(g) {
      const sola = !scrive();
      const valori = {};
      const controlli = {};
      const zonaErrore = h('div');
      const tipoDi = v => ({ si: 'si_no', sola: 'sola_lettura', tempi: 'tempi_ticket' }[v.tipo] || v.tipo);
      const pillole = (scelte, attive, cambia) => h('div', { class: 'pillole' }, (scelte || []).map(([k, nome]) => h('button', { type: 'button', class: 'pillola piccola' + (attive.indexOf(k) >= 0 ? ' scelta' : ''),
        'aria-pressed': attive.indexOf(k) >= 0 ? 'true' : 'false', disabled: sola, onclick: () => cambia(k) }, nome)));
      const righe = (g.voci || []).map(v => {
        const tipo = tipoDi(v);
        if (tipo === 'scelta') {
          valori[v.chiave] = v.valore;
          const zona = h('div');
          const rifai = () => aggiungi(svuota(zona), [segmenti(v.scelte || [], valori[v.chiave], x => { if (!sola) { valori[v.chiave] = x; rifai(); } }, 'piccoli')]);
          rifai();
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), zona);
        }
        if (tipo === 'si_no') {
          valori[v.chiave] = vero(v.valore);
          const b = h('button', { type: 'button', class: 'interruttore' + (valori[v.chiave] ? ' acceso' : ''), role: 'switch', 'aria-checked': valori[v.chiave] ? 'true' : 'false', 'aria-label': v.etichetta, disabled: sola,
            onclick: () => { valori[v.chiave] = !valori[v.chiave]; b.classList.toggle('acceso', valori[v.chiave]); b.setAttribute('aria-checked', valori[v.chiave] ? 'true' : 'false'); } }, h('i'));
          return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), b);
        }
        if (tipo === 'sola_lettura') return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), h('span', { class: 'val secondario' }, String(v.valore === undefined ? '' : v.valore) + (v.chiave === 'WISPER_ORA_COPIA' ? ' (si cambia sul NAS)' : '')));
        if (tipo === 'elenco') {
          valori[v.chiave] = (Array.isArray(v.valore) ? v.valore : []).slice();
          const zona = h('div');
          const rifai = () => aggiungi(svuota(zona), [pillole(v.scelte, valori[v.chiave], k => { const l = valori[v.chiave]; const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k); rifai(); })]);
          rifai();
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), zona);
        }
        if (tipo === 'documenti_collaboratori') {
          const base = v.valore && typeof v.valore === 'object' ? v.valore : {};
          valori[v.chiave] = {};
          (v.righe || []).forEach(([k]) => { valori[v.chiave][k] = (base[k] || []).slice(); });
          const zona = h('div', { class: 'fila' });
          const rifai = () => aggiungi(svuota(zona), (v.righe || []).map(([k, nome]) => h('div', { class: 'campo' }, h('label', null, nome),
            pillole(v.scelte, valori[v.chiave][k], d => { const l = valori[v.chiave][k]; const i = l.indexOf(d); if (i >= 0) l.splice(i, 1); else l.push(d); rifai(); }))));
          rifai();
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), zona);
        }
        if (tipo === 'tempi_ticket') {
          const t = typeof v.valore === 'string' ? (() => { try { return JSON.parse(v.valore); } catch (e) { return {}; } })() : (v.valore || {});
          const righeT = v.righe || Q.PRIORITA;
          const colonne = v.colonne || [['presa', 'Presa in carico entro'], ['intervento', 'Intervento entro']];
          controlli[v.chiave] = {};
          const griglia = h('div', { class: 'tab-tempi' }, h('span', { class: 'k' }, 'Priorità'), colonne.map(c => h('span', { class: 'k' }, c[1])),
            righeT.map(([k, nome]) => {
              const r = t[k] || {};
              controlli[v.chiave][k] = {};
              return [h('span', null, nome)].concat(colonne.map(([c, cNome]) => {
                const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'num-in', value: Q.numeroCampo(r[c]), disabled: sola, 'aria-label': nome + ': ' + cNome.toLowerCase() + ', ' + (v.unita || 'ore') });
                controlli[v.chiave][k][c] = inp;
                return conSuffisso(inp, v.unita || 'ore');
              }));
            }));
          return h('div', { class: 'imp-riga colonna', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), griglia);
        }
        if (tipo === 'testo_lungo') {
          const ta = h('textarea', { rows: 5, disabled: sola, 'aria-label': v.etichetta, maxlength: v.max ? String(v.max) : null });
          ta.value = String(v.valore === undefined || v.valore === null ? '' : v.valore);
          controlli[v.chiave] = ta;
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
          controlli[v.chiave] = { get value() { return Q.giornoMeseDa(giorno.value, mese.value); } };
          return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), h('span', { class: 'giorno-mese' }, giorno, mese));
        }
        const input = h('input', { type: 'text', class: tipo === 'numero' ? 'num-in' : 'testo-in', inputmode: tipo === 'numero' ? 'decimal' : null,
          value: tipo === 'numero' ? Q.numeroCampo(v.valore) : String(v.valore === undefined || v.valore === null ? '' : v.valore),
          disabled: sola, 'aria-label': v.etichetta, placeholder: v.segnaposto || null, maxlength: v.max ? String(v.max) : null });
        controlli[v.chiave] = input;
        return h('div', { class: 'imp-riga', 'data-chiave': v.chiave }, h('span', { class: 'lab' }, v.etichetta), v.unita ? conSuffisso(input, v.unita) : input);
      });
      const collegamenti = (g.collegamenti || []).map(c => h('button', { type: 'button', class: 'imp-riga collegamento-imp', onclick: () => apriCollegamento(c) },
        h('span', { class: 'lab' }, c.nome), h('span', { class: 'val secondario' }, c.valore || '', icona('freccia', 16, 2.2))));
      const azioni = sola ? [] : (g.azioni || []).map(a => h('button', { type: 'button', class: 'btn bordo-rosso', onclick: () => azione(a) }, a.nome));
      const modificabili = (g.voci || []).some(v => tipoDi(v) !== 'sola_lettura');
      const salva = async () => {
        const nuovi = {};
        let errore = '';
        (g.voci || []).forEach(v => {
          if (errore) return;
          const tipo = tipoDi(v);
          if (tipo === 'sola_lettura') return;
          if (valori[v.chiave] !== undefined) { nuovi[v.chiave] = valori[v.chiave]; return; }
          if (tipo === 'tempi_ticket') {
            const t = {};
            Object.keys(controlli[v.chiave]).forEach(k => { t[k] = {}; Object.keys(controlli[v.chiave][k]).forEach(c => { t[k][c] = Q.numeroScritto(controlli[v.chiave][k][c].value); }); });
            errore = Q.erroreTempi(t, v.righe);
            nuovi[v.chiave] = t;
            return;
          }
          const testo = controlli[v.chiave].value;
          if (tipo === 'numero') {
            errore = Q.erroreVoce(Object.assign({}, v, { vuoto: v.vuoto !== undefined ? v.vuoto : v.valore === '' || v.valore === null }), testo);
            nuovi[v.chiave] = String(testo).trim() === '' ? '' : Q.numeroScritto(testo);
          } else if (tipo === 'giorno_mese') {
            errore = Q.erroreGiornoMese(testo, v.etichetta);
            nuovi[v.chiave] = testo || '';
          } else nuovi[v.chiave] = String(testo).trim();
        });
        if (errore) { aggiungi(svuota(zonaErrore), [h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errore))]); return; }
        svuota(zonaErrore);
        // Solo quello che è cambiato: un salvataggio non riscrive le chiavi che non si toccano.
        const cambiati = {};
        (g.voci || []).forEach(v => {
          if (nuovi[v.chiave] === undefined) return;
          const prima = typeof v.valore === 'string' && /^[[{]/.test(v.valore) ? (() => { try { return JSON.parse(v.valore); } catch (e) { return v.valore; } })() : v.valore;
          if (JSON.stringify(nuovi[v.chiave]) !== JSON.stringify(prima === undefined || prima === null ? '' : prima)) cambiati[v.chiave] = nuovi[v.chiave];
        });
        if (!Object.keys(cambiati).length) { avviso('Niente da salvare: è tutto come prima'); return; }
        const perNuove = Object.keys(cambiati).some(k => VALE_PER_NUOVE.indexOf(k) >= 0 || ((g.voci || []).find(v => v.chiave === k) || {}).vale === 'nuove');
        const r = await salvaValori(cambiati, perNuove ? 'Fatto. Vale per le cose nuove: quelle già scritte restano come sono' : 'Salvato');
        if (!r) return;
        (g.voci || []).forEach(v => { if (cambiati[v.chiave] !== undefined) v.valore = cambiati[v.chiave]; });
      };
      return h('div', { class: 'scheda scheda-imp', 'data-gruppo': g.chiave }, h('h2', null, g.nome), righe, collegamenti, zonaErrore,
        modificabili && !sola ? h('div', { class: 'piede-scheda pillole' }, h('button', { type: 'button', class: 'btn', onclick: salva }, 'Salva'), azioni) : azioni.length ? h('div', { class: 'piede-scheda pillole' }, azioni) : null);
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
          const r = interruttore(f.nome, frase, f.accesa !== false, v => cambiaFunzione(f, v));
          r.setAttribute('data-modulo', f.modulo);
          return r;
        }))]);
      });
    }

    async function cambiaFunzione(f, accesa) {
      if (!accesa) {
        const d = Q.domandaSpegni(f);
        const ok = await new Promise(risolvi => {
          let detto = false;
          const rispondi = v => { if (!detto) { detto = true; risolvi(v); } };
          let chiudi;
          chiudi = finestra({ titolo: d.titolo, corpo: h('p', { class: 'testo-forte', style: { margin: 0 } }, d.testo), fuoco: false, allaChiusura: () => rispondi(false),
            pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => { rispondi(false); chiudi(); } }, 'Annulla'),
              h('button', { type: 'button', class: 'btn grande bordo-rosso', onclick: () => { rispondi(true); chiudi(); } }, 'Spegni')] });
        });
        if (!ok) return;
      }
      const r = await lavora(accesa ? 'Accendo ' + f.nome : 'Spengo ' + f.nome, () => Rete.post('/server/salvaFunzioni', { modulo: f.modulo, accesa: !!accesa }));
      if (!r) return;
      M.funzioni = null;
      await W.rileggiIo();
      W.caricaDashboard();
      avviso(accesa ? f.nome + ' riaccesa: i dati sono come prima' : f.nome + ' spenta: i dati restano');
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
      const testo = h('input', { type: 'text', value: f.testo, maxlength: '8', disabled: !scrive(), 'aria-label': 'Testo' });
      const anteprima = h('span', { class: 'formato-grande', id: 'anteprima-formato' });
      const aggiorna = () => { anteprima.textContent = Q.codiceDa(Q.formatoCommessa(f), anno, prossimo); };
      testo.addEventListener('input', () => { f.testo = testo.value.replace(/[{}\s]/g, ''); aggiorna(); });
      const domanda = (nome, voci, chiave) => {
        const zona = h('div');
        const rifai = () => aggiungi(svuota(zona), [segmenti(voci, String(f[chiave]), x => { if (!scrive()) return; f[chiave] = chiave === 'cifre' ? Number(x) : x; rifai(); aggiorna(); }, 'piccoli')]);
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
            h('span', { class: 'secondario' }, Q.frasePrima(prima.primo, prima.ultimo, prossimo))),
          scrive() ? h('div', { class: 'riga-destra' }, h('button', { type: 'button', class: 'btn giallo grande', onclick: () => salvaFormato(n, prossimo, prima) }, 'Salva il formato')) : null))]);
      aggiorna();
    }

    async function salvaFormato(n, prossimo, prima) {
      const formatoNuovo = Q.formatoCommessa(M.formato);
      const errore = R.erroreFormato(formatoNuovo, false);
      if (errore) { avviso(errore, true); return; }
      if (formatoNuovo === n.formato) { avviso('È già questo il formato'); return; }
      const anno = new Date().getFullYear();
      const ok = await conferma('Salvare il formato?', 'La prossima sarà ' + Q.codiceDa(formatoNuovo, anno, prossimo) + '. ' + Q.frasePrima(prima.primo, prima.ultimo, prossimo), 'Salva il formato');
      if (!ok) return;
      const r = await lavora('Salvo il formato', () => Rete.post('/server/salvaNumerazione', { tipo: 'commessa', formato: formatoNuovo, annuale: false }));
      if (!r) return;
      M.formato = null;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso('Formato salvato: vale per le commesse nuove');
      W.vai('#amministrazione/numerazioni');
    }

    // ===================================================================== notifiche (§9.7)

    function notifiche(pagina) {
      const amm = W.puo('amministrazione');
      if (amm) aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Indietro', () => W.vai('#amministrazione')), h('span', { class: 'dove' }, 'Amministrazione'))]);
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Notifiche'))]);
      const sinistra = h('div', { class: 'sezione' });
      const destra = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'due-colonne stretta-1100' }, sinistra, destra)]);
      leggi(sinistra, 'notifiche', '/server/notifichePreferenze', ris => {
        const s = { telefono: ris.telefono !== false, silenzioSera: ris.silenzioSera !== false, tipi: Object.assign({}, ris.tipi || {}) };
        const zona = h('div', { class: 'fila' });
        const disegna = () => aggiungi(svuota(zona), [h('div', { class: 'scheda righe interna' },
          interruttore('Avvisami sul telefono', '', s.telefono, v => { s.telefono = v; disegna(); }),
          interruttore('Di sera e nei festivi niente avvisi sul telefono', 'Dalle 20 alle 7: restano nella campanella', s.silenzioSera, v => { s.silenzioSera = v; disegna(); })),
        Q.gruppiNotifiche(s.tipi).map(g => [h('span', { class: 'etichetta' }, g.nome), h('div', { class: 'scheda righe interna' }, g.tipi.map(t => interruttore(t.nome, '', t.acceso, v => { s.tipi[t.chiave] = v; disegna(); })))])]);
        disegna();
        aggiungi(sinistra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Le tue notifiche'), zona,
          h('div', null, h('button', { type: 'button', class: 'btn', onclick: async () => {
            const r = await lavora('Salvo', () => Rete.post('/server/salvaNotifichePreferenze', { telefono: s.telefono, silenzioSera: s.silenzioSera, tipi: s.tipi }));
            if (!r) return;
            M.notifiche = null;
            avviso('Salvato: una notifica spenta non arriva più');
          } }, 'Salva')))]);
      });
      if (!scrive()) return;
      const imp = S.ana.impostazioni;
      const email = h('input', { type: 'text', value: String(imp.EMAIL_AVVISI || ''), autocomplete: 'off', spellcheck: 'false' });
      const ora = h('input', { type: 'text', value: String(imp.NOTIFICHE_ORA || '08:00').replace(/^0(\d):/, '$1:'), inputmode: 'numeric' });
      const errori = h('div');
      const controlla = () => {
        const e = Q.erroreEmailAvvisi(email.value) || Q.erroreOra(ora.value);
        aggiungi(svuota(errori), e ? [h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, e))] : []);
        return !e;
      };
      aggiungi(destra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Per lo studio'), campo('Avvisi del server a', email), campo('Ora del riepilogo del mattino', ora), errori,
        h('div', { class: 'pillole' },
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const r = await lavora('Mando la prova', () => Rete.post('/server/provaAvvisi', {}));
            if (r) avviso('Prova degli avvisi mandata a ' + ((r.a || []).join(', ') || 'gli indirizzi salvati'));
          } }, 'Manda una prova'),
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            if (!controlla()) return;
            const o = ora.value.trim().replace('.', ':');
            await salvaValori({ EMAIL_AVVISI: email.value.split(/[,;\s]+/).filter(Boolean).join(', '), NOTIFICHE_ORA: o.padStart(5, '0') }, 'Salvato');
          } }, 'Salva')))]);
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
            h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Licenze'), h('span', null, 'Carattere Figtree, SIL OFL 1.1')),
              h('button', { type: 'button', class: 'btn', onclick: W.mostraLicenza }, 'Leggi')),
            S.versione ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Versione ' + S.versione), h('span', null, W.statoAggiornamenti())),
              a && a.stato === 'pronto'
                ? h('button', { type: 'button', class: 'btn giallo', onclick: W.riavvia }, 'Riavvia')
                : a && a.attivi ? h('button', { type: 'button', class: 'btn', onclick: W.cercaAggiornamenti }, 'Cerca aggiornamenti') : null) : null))]);
    }

    return { elenco, studio, impostazioni, funzioni, numerazioni, formato, notifiche, aspetto, daRileggere, M, idFile, oraLocale };
  };
})(window);
