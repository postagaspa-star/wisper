/*
 * Wisper Ufficio: Amministrazione (guida della fase 1, §7), al posto delle Impostazioni.
 *
 * Un elenco di pagine: Dati dello studio, Utenti, Ruoli e permessi, Numerazioni,
 * Tariffe e rimborsi, Registro attività, Copie ed esportazioni, Cestino, L'app.
 * Chi ha "amministrazione" in lettura vede tutto senza i pulsanti per cambiare;
 * L'app (tema, visita guidata, versione) è di tutti.
 */
(function (radice) {
  'use strict';

  radice.WisperAmministrazione = function (W) {
    const { S, C, R, B, Rete, Api } = W;
    const { h, aggiungi, svuota, icona, tondo, iniziali, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, conSuffisso, segmenti, riga, quadrato, segnaposto, copiaTesto } = B;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('amministrazione', 2);

    // Quello che si legge solo qui, tenuto finché non si cambia pagina.
    const M = { utenti: null, permessi: null, copie: null, cestino: null, sessioni: {}, ruoloPerm: 'collaboratore', filtri: { utente: '', tabella: '', periodo: '7' } };

    const PAGINE = [
      { k: 'studio', titolo: 'Dati dello studio', icona: 'studio' },
      // fase 4: le regole delle fatture e la conferma del commercialista (fase4.md §3.4, §13.6)
      { k: 'fiscale', titolo: 'Impostazioni fiscali', icona: 'scudo', soldi: true },
      { k: 'utenti', titolo: 'Utenti', icona: 'clienti' },
      { k: 'permessi', titolo: 'Ruoli e permessi', icona: 'scudo' },
      { k: 'numerazioni', titolo: 'Numerazioni', icona: 'numero' },
      { k: 'tariffe', titolo: 'Tariffe e rimborsi', icona: 'fatturazione', soldi: true },
      // fase 2: IVA, contributo EPPI, validità e condizioni dei preventivi
      { k: 'fisco', titolo: 'Fisco e preventivi', icona: 'preventivo', soldi: true },
      // fase 3: il veicolo, il suo euro al km (tabelle ACI dell'anno), l'indennità di trasferta
      { k: 'veicoli', titolo: 'Veicoli e rimborso km', icona: 'auto', modulo: 'spese' },
      // fase 6: patrono, conservazione, tarature, DURC e visura, documenti dei collaboratori, esterni; i tipi di formazione
      { k: 'persone', titolo: 'Persone, mezzi e collaboratori', icona: 'persona', modulo: 'persone' },
      { k: 'formazione', titolo: 'Tipi di formazione', icona: 'libro', modulo: 'persone' },
      // fase 7: le impostazioni del portale clienti e delle comunicazioni (fase7.md §0.5, §12.6)
      { k: 'portale', titolo: 'Portale clienti', icona: 'globo' },
      { k: 'comunicazioni', titolo: 'Comunicazioni', icona: 'fumetto' },
      { k: 'registro', titolo: 'Registro attività', icona: 'lista' },
      { k: 'copie', titolo: 'Copie ed esportazioni', icona: 'scarica' },
      { k: 'cestino', titolo: 'Cestino', icona: 'cestino', scrive: true },
      // fase 5: le categorie dei documenti e lo spazio sul NAS (fase5.md §12.4)
      { k: 'categorie', titolo: 'Categorie dei documenti', icona: 'file', modulo: 'documenti' },
      { k: 'spazio', titolo: 'Spazio sul NAS', icona: 'disco' },
      { k: 'app', titolo: 'L\'app', icona: 'app' },
    ];

    // Fase 8 (fase8.md §9): le pagine nuove stanno in amministrazione8.js (studio, impostazioni generali, funzioni accese,
    // numerazioni, notifiche, aspetto) e sistema8.js (sicurezza, copie e ripristino, importa ed esporta, stato, lista di controllo).
    const A8 = radice.WisperAmministrazione8(W, { modificaNumerazione: n => modificaNumerazione(n) });
    W.A8 = A8;
    const S8 = radice.WisperSistema8(W);
    W.Sistema8 = S8;

    function vista(pagina, sotto, id) {
      // Cambiando pagina si rilegge: utenti, copie e cestino possono essere cambiati da un altro computer.
      const dove = sotto + '/' + (id || '');
      if (M.dove !== dove) {
        M.utenti = null; M.permessi = null; M.copie = null; M.cestino = null; M.veicoli = null; M.tipi = null; M.sessioni = {}; M.dove = dove;
        // Fase 8: l'elenco si completa coi numeri del server; le pagine si rileggono entrando.
        if (sotto) { A8.daRileggere(); S8.daRileggere(); }
        S8.chiudiPannello(true);
      }
      // 03/11/2026 (progetti.md §5): con Amministrazione spenta il titolare vede solo Funzioni accese, per riaccenderla.
      const soloFunzioni = W.funzioneAccesa && !W.funzioneAccesa('amministrazione') && W.eTitolare && W.eTitolare();
      if (soloFunzioni && sotto !== 'app' && sotto !== 'notifiche' && sotto !== 'funzioni') { location.replace('#amministrazione/funzioni'); return; }
      if (soloFunzioni && sotto === 'funzioni') { A8.funzioni(pagina); return; }
      if (sotto && sotto !== 'app' && sotto !== 'notifiche' && !puo('amministrazione')) { aggiungi(pagina, [h('div', { class: 'calmo grande' }, icona('scudo', 22, 2.2), 'Non hai il permesso per vedere questa pagina. Chiedi a ' + W.titolare() + '.')]); return; }
      if (((sotto === 'tariffe' || sotto === 'fisco' || sotto === 'fiscale') && !soldi()) || (sotto === 'cestino' && !scrive()) || (sotto === 'veicoli' && !puo('spese')) || (sotto === 'categorie' && !puo('documenti'))) { aggiungi(pagina, [h('div', { class: 'calmo grande' }, icona('scudo', 22, 2.2), 'Non hai il permesso per vedere questa pagina. Chiedi a ' + W.titolare() + '.')]); return; }
      if ((sotto === 'persone' || sotto === 'formazione') && !puo('persone')) { aggiungi(pagina, [h('div', { class: 'calmo grande' }, icona('scudo', 22, 2.2), 'Non hai il permesso per vedere questa pagina. Chiedi a ' + W.titolare() + '.')]); return; }
      const fn = { studio: A8.studio, fiscale, utenti: id ? paginaUtente : elencoUtenti, permessi, numerazioni: A8.numerazioni, tariffe, fisco, veicoli, registro, copie: S8.copie, cestino, app: A8.aspetto,
        persone: impostazioniFase6, formazione: tipiFormazione, portale: impostazioniPortale, comunicazioni: impostazioniComunicazioni,
        categorie: p => W.Archivio.paginaCategorie(p), spazio: p => W.Archivio.paginaSpazio(p),
        // fase 8
        impostazioni: A8.impostazioni, funzioni: A8.funzioni, formato: A8.formato, notifiche: A8.notifiche,
        sicurezza: S8.sicurezza, importa: S8.importa, stato: S8.stato, controlli: S8.controlli }[sotto];
      if (!fn) { A8.elenco(pagina); return; }
      // Aspetto, Notifiche (di tutti) e il formato della commessa mettono da soli la riga Indietro.
      if (sotto !== 'app' && sotto !== 'notifiche' && sotto !== 'formato') {
        aggiungi(pagina, [h('div', { class: 'indietro-riga' },
          tondo('indietro', 'Indietro', () => W.vai(sotto === 'utenti' && id ? '#amministrazione/utenti' : '#amministrazione')),
          h('span', { class: 'dove' }, sotto === 'utenti' && id ? 'Utenti' : 'Amministrazione'))]);
      }
      fn(pagina, id);
    }

    /** Legge qualcosa dal server mostrando i segnaposto, poi disegna. */
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

    // ===================================================================== l'elenco

    function elenco(pagina) {
      const imp = S.ana.impostazioni;
      const utenti = S.ana.utenti;
      const attivi = utenti.filter(u => u.attivo !== false).length;
      const num = tipo => S.ana.numerazioni.find(n => n.tipo === tipo);
      const prossimo = tipo => { const n = num(tipo); return n ? (n.prossimo || R.formattaNumero(n.formato, (Number(n.ultimo) || 0) + 1, new Date().getFullYear())) : ''; };
      const stato = {
        studio: [imp.RAGIONE_SOCIALE, idFirma(imp.FIRMA_TECNICO) ? 'la tua firma c\'è' : 'manca la tua firma'].filter(Boolean).join(' · '),
        utenti: utenti.length ? (utenti.length === 1 ? '1 persona' : utenti.length + ' persone') + ' · ' + (attivi === 1 ? '1 attiva' : attivi + ' attive') : 'Chi entra in Wisper',
        permessi: 'Titolare, Amministrazione, Collaboratore, Lettura',
        numerazioni: [num('commessa') ? 'Commesse ' + prossimo('commessa') : '', num('rapportino') ? 'Rapportini ' + prossimo('rapportino') : '',
          num('preventivo') ? 'Preventivi ' + prossimo('preventivo') : ''].filter(Boolean).join(' · ') || 'Codici di commesse e rapportini',
        fisco: 'IVA ' + (imp.IVA !== undefined && imp.IVA !== '' ? C.numero(imp.IVA) + '%' : 'da scrivere') + ' · contributo EPPI ' + (imp.EPPI_INTEGRATIVO !== undefined && imp.EPPI_INTEGRATIVO !== '' ? C.numero(imp.EPPI_INTEGRATIVO) + '%' : 'da scrivere') +
          ' · preventivi validi ' + (imp.PREVENTIVO_VALIDITA_GIORNI || 30) + ' giorni',
        tariffe: 'Rimborso km ' + (imp.EURO_KM !== undefined && imp.EURO_KM !== '' ? C.numero(imp.EURO_KM) + ' €' : 'da scrivere') + ' · costo orario ' + (imp.COSTO_ORARIO ? C.numero(imp.COSTO_ORARIO) + ' €' : 'da scrivere'),
        veicoli: 'Rimborso km delle trasferte · tabelle ACI ' + (imp.ACI_ANNO || new Date().getFullYear()),
        registro: 'Chi ha cambiato cosa',
        copie: ultimaCopia(M.copie) ? descriviCopia(ultimaCopia(M.copie)) : 'Copie di ogni notte, file per Excel',
        cestino: M.cestino ? (M.cestino.file || []).length ? (M.cestino.file.length === 1 ? '1 file tolto' : M.cestino.file.length + ' file tolti') + ', recuperabili' : 'Vuoto' : 'File tolti, recuperabili',
        categorie: 'Approvazione, chi vede, scadenza proposta',
        persone: 'Santo patrono, conservazione, tarature, DURC e visura',
        formazione: 'PES, PAV, PEI, primo soccorso: ogni quanto e il preavviso',
        portale: (imp.PORTALE_INDIRIZZO ? radice.WisperRegoleComunicazioni.host(imp.PORTALE_INDIRIZZO) : 'Non collegato') + ' · ' + (imp.PORTALE_ATTIVO === true || imp.PORTALE_ATTIVO === 'true' || imp.PORTALE_ATTIVO === 1 ? 'acceso' : 'spento'),
        comunicazioni: 'WhatsApp, promemoria degli appuntamenti e di pagamento',
        spazio: 'Dove va lo spazio, copia fuori casa, cestino vecchio',
        app: 'Tema, visita guidata, versione' + (S.versione ? ' ' + S.versione : ''),
        fiscale: regoleConfermate() ? 'Confermate dal commercialista il ' + C.data(regoleConfermate().data) : 'Regole delle fatture da confermare col commercialista',
      };
      const lista = h('div', { class: 'scheda righe' }, PAGINE.filter(p => (!p.soldi || soldi()) && (!p.scrive || scrive()) && (!p.modulo || puo(p.modulo)) && (p.k === 'app' || puo('amministrazione'))).map(p => riga({
        sinistra: quadrato(p.icona, p.k === 'fiscale' && !regoleConfermate() ? 'ico-giallo' : null), titolo: p.titolo, sotto: stato[p.k], onclick: () => W.vai('#amministrazione/' + p.k),
        attr: { 'data-pagina': p.k },
      })));
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Amministrazione')), h('div', { class: 'stretta-720' }, lista)]);
      // Le righe di copie e cestino si completano quando il server risponde.
      if (puo('amministrazione')) {
        if (!M.copie) Rete.get('/server/copie').then(x => { M.copie = x; const r = lista.querySelector('[data-pagina="copie"] .t2'); if (r && ultimaCopia(x)) r.textContent = descriviCopia(ultimaCopia(x)); }).catch(() => null);
        if (!M.cestino && scrive()) Rete.get('/server/cestino').then(x => { M.cestino = x; const r = lista.querySelector('[data-pagina="cestino"] .t2'); if (r) r.textContent = (x.file || []).length ? ((x.file.length === 1 ? '1 file tolto' : x.file.length + ' file tolti') + ', recuperabili') : 'Vuoto'; }).catch(() => null);
      }
    }

    /** L'id del file della firma: "/file/<id>" (server) o un indirizzo di Drive (foglio vecchio). */
    function idFirma(v) {
      const s = String(v || '');
      const m = s.match(/^\/file\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : W.D.idDaUrl(s);
    }

    // ===================================================================== dati dello studio

    function studio(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const campi = {};
      const input = (chiave, etichetta) => {
        const valore = imp[chiave] === undefined || imp[chiave] === null ? '' : imp[chiave];
        campi[chiave] = h('input', { type: 'text', value: String(valore), disabled: sola });
        return campo(etichetta, campi[chiave]);
      };
      const firma = idFirma(imp.FIRMA_TECNICO);
      const areaTitoli = h('textarea', { rows: 3, disabled: sola });
      areaTitoli.value = imp.TITOLI || '';
      campi.TITOLI = areaTitoli;
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Dati dello studio')),
        h('div', { class: 'stretta-820 sezione' },
          h('div', { class: 'scheda' }, h('h2', null, 'Intestazione dei PDF'),
            h('div', { class: 'fila' },
              h('div', { class: 'riga-campi' }, input('RAGIONE_SOCIALE', 'Ragione sociale'), input('TECNICO', 'Chi firma i rapportini')),
              h('div', { class: 'riga-campi' }, input('INDIRIZZO', 'Indirizzo'), input('PARTITA_IVA', 'Partita IVA')),
              h('div', { class: 'riga-campi' }, input('EMAIL', 'Email per le risposte'), input('TELEFONO', 'Telefono'), input('PEC', 'PEC')),
              sola ? null : h('div', null, h('button', { type: 'button', class: 'btn giallo', onclick: () => salvaImpostazioni(campi, ['RAGIONE_SOCIALE', 'TECNICO', 'INDIRIZZO', 'PARTITA_IVA', 'EMAIL', 'TELEFONO', 'PEC']) }, 'Salva')))),
          // Fase 4 (§4.1): i dati che servono alla fattura, separati (l'indirizzo qui sopra è via e numero).
          h('div', { class: 'scheda' }, h('h2', null, 'Per le fatture'),
            h('div', { class: 'fila' },
              h('div', { class: 'riga-campi' }, input('CODICE_FISCALE', 'Codice fiscale'), input('STUDIO_CAP', 'CAP'), input('STUDIO_COMUNE', 'Comune'), input('STUDIO_PROVINCIA', 'Provincia')),
              h('div', { class: 'riga-campi' }, input('ALBO', 'Albo'), input('ALBO_PROVINCIA', 'Provincia dell\'albo'), input('ALBO_NUMERO', 'Numero di iscrizione'), input('ALBO_DATA', 'Iscritto dal')),
              sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salvaImpostazioni(campi, ['CODICE_FISCALE', 'STUDIO_CAP', 'STUDIO_COMUNE', 'STUDIO_PROVINCIA', 'ALBO', 'ALBO_PROVINCIA', 'ALBO_NUMERO', 'ALBO_DATA'],
                'Salvato: vale per le fatture che passi al programma da adesso') }, 'Salva')))),
          h('div', { class: 'scheda' }, h('h2', null, 'Polizza e titoli'),
            h('div', { class: 'fila' },
              h('div', { class: 'riga-campi' }, input('POLIZZA_COMPAGNIA', 'Compagnia della polizza professionale'), input('POLIZZA_NUMERO', 'Numero della polizza'), input('POLIZZA_MASSIMALE', 'Massimale')),
              campo('Titoli e specializzazioni', areaTitoli),
              sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salvaImpostazioni(campi, ['POLIZZA_COMPAGNIA', 'POLIZZA_NUMERO', 'POLIZZA_MASSIMALE', 'TITOLI'],
                'Salvato: polizza e titoli vanno nei preventivi nuovi') }, 'Salva')))),
          h('div', { class: 'scheda' }, h('h2', null, 'La tua firma'),
            h('div', { class: 'fila' },
              firma ? h('img', { class: 'firma-tecnico', src: '/file/' + firma, alt: 'La tua firma' }) : h('div', { class: 'secondario' }, 'Non ancora caricata: sui rapportini resta lo spazio vuoto.'),
              sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: async () => {
                const scelto = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
                if (!scelto || !scelto.ok) return;
                const ris = await lavora('Carico la firma', () => Rete.post('/server/caricaFile', { tipo: 'firmaTecnico', mime: scelto.mime, base64: scelto.base64 }));
                if (ris) { await W.ricaricaAnagrafiche(); avviso('Firma caricata'); W.ridisegna(); }
              } }, firma ? 'Cambia la firma' : 'Carica la firma')))))]);
    }

    async function salvaImpostazioni(campi, chiavi, conferma) {
      const valori = {};
      chiavi.forEach(k => {
        let x = campi[k].type === 'checkbox' ? (campi[k].checked ? 'SI' : 'NO') : campi[k].value.trim();
        if (['EURO_KM', 'COSTO_ORARIO', 'IVA', 'EPPI_INTEGRATIVO', 'RITENUTA', 'PREVENTIVO_VALIDITA_GIORNI', 'ACI_ANNO', 'INDENNITA_TRASFERTA', 'ORE_GIORNALIERE'].indexOf(k) >= 0 && x !== '') x = C.num(x);
        valori[k] = x;
      });
      const ris = await lavora('Salvo', () => Rete.post('/server/salvaImpostazioni', { valori }));
      if (ris) { S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni || valori); avviso(conferma || 'Salvato'); W.disegnaPagina(); }
    }

    // ===================================================================== tariffe e rimborsi

    function tariffe(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const campi = {};
      const input = (chiave, etichetta, suffisso) => {
        const valore = imp[chiave] === undefined || imp[chiave] === null ? '' : imp[chiave];
        // I numeri alla italiana: 0,76 e non 0.76.
        campi[chiave] = h('input', { type: 'text', value: typeof valore === 'number' ? R.numeroCampo(valore) : String(valore), disabled: sola, inputmode: suffisso ? 'decimal' : null });
        return campo(etichetta, suffisso ? conSuffisso(campi[chiave], suffisso) : campi[chiave]);
      };
      campi.TICKET_ATTIVO = h('input', { type: 'checkbox', checked: imp.TICKET_ATTIVO === 'SI', disabled: sola });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Tariffe e rimborsi')),
        h('div', { class: 'stretta-820' }, h('div', { class: 'scheda' }, h('h2', null, 'Rimborso km e costi'),
          h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, input('EURO_KM', 'Rimborso km (tabella ACI)', '€/km'), input('AUTO', 'Auto'), input('COSTO_ORARIO', 'Quanto costa un\'ora', '€/h')),
            h('label', { class: 'spunta-campo' }, campi.TICKET_ATTIVO, 'Campo ticket nei rapportini'),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn giallo', onclick: () => salvaImpostazioni(campi, ['EURO_KM', 'AUTO', 'COSTO_ORARIO', 'TICKET_ATTIVO'],
              'Salvato. Vale per i rapportini nuovi: quelli già scritti tengono il rimborso con cui sono nati') }, 'Salva')))))]);
    }

    // ===================================================================== fisco e preventivi

    /**
     * IVA, contributo integrativo EPPI (dei periti industriali: entra nella base IVA,
     * da confermare col commercialista), ritenuta (dalla fase 4), validità e condizioni
     * dei preventivi. Valgono per i preventivi nuovi: quelli già scritti tengono i loro.
     */
    function fisco(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const campi = {};
      const input = (chiave, etichetta, suffisso) => {
        const valore = imp[chiave] === undefined || imp[chiave] === null ? '' : imp[chiave];
        campi[chiave] = h('input', { type: 'text', value: typeof valore === 'number' ? R.numeroCampo(valore) : String(valore), disabled: sola, inputmode: suffisso ? 'decimal' : null });
        return campo(etichetta, suffisso ? conSuffisso(campi[chiave], suffisso) : campi[chiave]);
      };
      campi.PREVENTIVO_CONDIZIONI = h('textarea', { rows: 4, disabled: sola });
      campi.PREVENTIVO_CONDIZIONI.value = imp.PREVENTIVO_CONDIZIONI || '';
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Fisco e preventivi')),
        h('div', { class: 'stretta-820 sezione' },
          // Fase 4: IVA, contributo e ritenuta sono regole fiscali: stanno in Impostazioni fiscali (cambiarle toglie la conferma del commercialista).
          soldi() ? h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('scudo'), titolo: 'IVA ' + C.numero(imp.IVA !== undefined && imp.IVA !== '' ? imp.IVA : 22) + '% · contributo EPPI ' +
            C.numero(imp.EPPI_INTEGRATIVO !== undefined && imp.EPPI_INTEGRATIVO !== '' ? imp.EPPI_INTEGRATIVO : 5) + '% · ritenuta ' + C.numero(imp.RITENUTA !== undefined && imp.RITENUTA !== '' ? imp.RITENUTA : 20) + '%',
          sotto: 'Si cambiano in Impostazioni fiscali', onclick: () => W.vai('#amministrazione/fiscale') })) : null,
          h('div', { class: 'scheda' }, h('h2', null, 'Preventivi'),
            h('div', { class: 'fila' },
              h('div', { class: 'riga-campi' }, input('PREVENTIVO_VALIDITA_GIORNI', 'Validità di un preventivo', 'giorni'), h('span')),
              campo('Condizioni che si propongono', campi.PREVENTIVO_CONDIZIONI),
              sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salvaImpostazioni(campi, ['PREVENTIVO_VALIDITA_GIORNI', 'PREVENTIVO_CONDIZIONI'],
                'Salvato: vale per i preventivi nuovi') }, 'Salva')))))]);
    }

    // ===================================================================== veicoli e rimborso km (fase 3)

    /** L'euro al km con tutti i decimali (fino a 4, come le tabelle ACI): 0,5432 e non 0,54. */
    const euroKmCampo = n => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 10000) / 10000).replace('.', ','));

    /**
     * I veicoli con cui si fanno le trasferte: il nome, l'alimentazione, l'euro al km
     * delle tabelle ACI e il loro anno. Le trasferte tengono l'euro al km con cui sono
     * nate: cambiarlo qui vale per quelle nuove. In cima l'anno delle tabelle, il sito
     * dell'ACI e l'indennità di trasferta per ogni giorno.
     */
    function veicoli(pagina) {
      const imp = S.ana.impostazioni;
      const area = h('div', { class: 'stretta-820 sezione' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Veicoli e rimborso km'),
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => moduloVeicolo(null) }, icona('piu', 18, 2.6), 'Nuovo veicolo') : null), area]);
      leggi(area, 'veicoli', '/server/veicoli?tutti=1', ris => {
        const campi = {
          ACI_ANNO: h('input', { type: 'text', inputmode: 'numeric', value: String(imp.ACI_ANNO || ris.aciAnno || ''), disabled: !scrive() }),
          INDENNITA_TRASFERTA: h('input', { type: 'text', inputmode: 'decimal', value: imp.INDENNITA_TRASFERTA === '' || imp.INDENNITA_TRASFERTA === null || imp.INDENNITA_TRASFERTA === undefined ? '' : R.numeroCampo(imp.INDENNITA_TRASFERTA), disabled: !scrive() }),
        };
        const lista = ris.veicoli || [];
        aggiungi(area, [
          // Fase 6: i veicoli sono diventati i mezzi, con la loro scheda completa (scadenze, km, guasti, costi).
          puo('mezzi') ? h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'corpo' }, h('b', null, 'I mezzi hanno la loro pagina'), h('span', { class: 't2' }, 'Scadenze, km, guasti e costi in Mezzi e attrezzature')),
            h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#mezzi/mezzi') }, 'Apri i mezzi')) : null,
          h('div', { class: 'scheda' }, h('h2', null, 'Tabelle ACI e trasferte'),
            h('div', { class: 'fila' },
              h('div', { class: 'riga-campi' }, campo('Anno delle tabelle ACI', campi.ACI_ANNO), campo('Indennità di trasferta al giorno', conSuffisso(campi.INDENNITA_TRASFERTA, '€'))),
              h('div', { class: 'pillole' },
                ris.paginaAci ? h('a', { class: 'btn', href: ris.paginaAci, target: '_blank', rel: 'noopener' }, 'Apri le tabelle ACI') : null,
                scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => salvaImpostazioni(campi, ['ACI_ANNO', 'INDENNITA_TRASFERTA'], 'Salvato: vale per le trasferte nuove') }, 'Salva') : null))),
          lista.length ? h('div', { class: 'scheda righe' }, lista.map(v => riga({
            sinistra: quadrato('auto'), titolo: v.nome,
            sotto: [v.alimentazione, 'tabelle ACI ' + (v.annoAci || '—'), v.trasferte ? (v.trasferte === 1 ? '1 trasferta' : v.trasferte + ' trasferte') : 'nessuna trasferta'].filter(Boolean).join(' · '),
            destra: h('span', { class: 'pillole-destra' }, h('span', { class: 'quanto' }, euroKmCampo(v.euroKm) + ' €/km'), v.attivo === false ? pillola('Non più in uso', 'grigio') : null),
            onclick: scrive() ? () => moduloVeicolo(v) : null,
          }))) : h('div', { class: 'calmo' }, icona('auto', 20, 2.2), 'Nessun veicolo: le trasferte con i km ne chiedono uno.')]);
      });
    }

    function moduloVeicolo(v0) {
      const v = v0 || { nome: '', alimentazione: '', euroKm: '', annoAci: S.ana.impostazioni.ACI_ANNO || new Date().getFullYear(), attivo: true };
      const c = {
        nome: h('input', { type: 'text', value: v.nome || '', autocomplete: 'off' }),
        alimentazione: h('input', { type: 'text', value: v.alimentazione || '', autocomplete: 'off', placeholder: 'benzina, gasolio, ibrida, elettrica' }),
        euroKm: h('input', { type: 'text', inputmode: 'decimal', value: euroKmCampo(v.euroKm), autocomplete: 'off' }),
        annoAci: h('input', { type: 'text', inputmode: 'numeric', value: String(v.annoAci || ''), autocomplete: 'off' }),
        attivo: h('input', { type: 'checkbox', checked: v.attivo !== false }),
      };
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [campo('Nome', c.nome, errori.nome), campo('Alimentazione', c.alimentazione),
        h('div', { class: 'riga-campi' }, campo('Euro al km', conSuffisso(c.euroKm, '€/km'), errori.euroKm), campo('Anno delle tabelle ACI', c.annoAci, errori.annoAci)),
        v0 ? h('label', { class: 'spunta-campo' }, c.attivo, 'In uso') : null]);
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        const euro = C.numONull(c.euroKm.value);
        if (!c.nome.value.trim()) errori.nome = 'Nome: scrivi il nome del veicolo';
        if (euro === null) errori.euroKm = 'Euro al km: scrivi quanto, per esempio 0,76';
        if (c.annoAci.value.trim() && !/^\d{4}$/.test(c.annoAci.value.trim())) errori.annoAci = 'Anno ACI: scrivi l\'anno delle tabelle, per esempio 2026';
        if (Object.keys(errori).length) { disegna(); return; }
        const corpo = { nome: c.nome.value.trim(), alimentazione: c.alimentazione.value.trim(), euroKm: euro, annoAci: c.annoAci.value.trim() ? Number(c.annoAci.value.trim()) : undefined, attivo: c.attivo.checked };
        if (v0) corpo.id = v0.id;
        const ris = await lavora('Salvo il veicolo', () => Rete.post('/server/salvaVeicolo', { veicolo: corpo }));
        if (!ris) return;
        chiudi();
        M.veicoli = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        avviso(v0 && C.num(v0.euroKm) !== euro ? 'Salvato. Vale per le trasferte nuove: quelle già scritte tengono il rimborso con cui sono nate' : 'Veicolo salvato');
        W.disegnaPagina();
      };
      chiudi = finestra({ titolo: v0 ? v0.nome : 'Nuovo veicolo', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    // ===================================================================== fase 6: persone, mezzi e collaboratori

    /**
     * Le impostazioni della fase 6 (fase6.md §4.1, §12.8), ognuna col suo Salva col bordo: santo patrono, conservazione,
     * saldo, taratura (preavviso, ogni quanto, "Con la taratura scaduta: Avviso e conferma · Non si usa"), DURC e
     * visura, documenti che servono ai collaboratori, giorni senza incarichi degli esterni, tagliando.
     */
    function impostazioniFase6(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const inp = (k, extra) => h('input', Object.assign({ type: 'text', value: imp[k] === undefined || imp[k] === null ? '' : String(imp[k]), disabled: sola }, extra || {}));
      const salvaValori = async (valori, frase) => {
        const ris = await lavora('Salvo', () => Rete.post('/server/salvaImpostazioni', { valori }));
        if (ris) { S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni || valori); avviso(frase || 'Salvato'); W.disegnaPagina(); }
      };
      const num = i => (i.value.trim() === '' ? '' : C.num(i.value));
      const c = { patrono: inp('FESTA_PATRONO', { placeholder: 'mm-gg, per esempio 07-01' }), conserva: inp('PERSONE_CONSERVA_ANNI', { inputmode: 'numeric' }), saldo: inp('SALDO_AVVISO_GIORNI', { inputmode: 'numeric' }),
        ogni: inp('TARATURA_OGNI_MESI', { inputmode: 'numeric' }), preavviso: inp('TARATURA_PREAVVISO_GIORNI', { inputmode: 'numeric' }), durc: inp('DURC_GIORNI', { inputmode: 'numeric' }),
        visura: inp('VISURA_MESI', { inputmode: 'numeric' }), esterni: inp('ACCESSO_ESTERNI_GIORNI', { inputmode: 'numeric' }), tagliando: inp('KM_TAGLIANDO_AVVISO', { inputmode: 'numeric' }) };
      let blocco = imp.TARATURA_BLOCCO === 'blocco' ? 'blocco' : 'avviso';
      let docs = {};
      try { docs = typeof imp.COLLAB_DOCUMENTI === 'string' ? JSON.parse(imp.COLLAB_DOCUMENTI) : (imp.COLLAB_DOCUMENTI || {}); } catch (e) { docs = {}; }
      docs = { impresa: (docs.impresa || []).slice(), professionista: (docs.professionista || []).slice(), occasionale: (docs.occasionale || []).slice() };
      const zonaBlocco = h('div');
      const disegnaBlocco = () => aggiungi(svuota(zonaBlocco), [segmenti([['avviso', 'Avviso e conferma'], ['blocco', 'Non si usa']], blocco, k => { if (!sola) { blocco = k; disegnaBlocco(); } })]);
      disegnaBlocco();
      const zonaDocs = h('div', { class: 'fila' });
      const disegnaDocs = () => aggiungi(svuota(zonaDocs), [['impresa', 'Impresa'], ['professionista', 'Professionista'], ['occasionale', 'Occasionale']].map(([t, nome]) => h('div', { class: 'campo' }, h('label', null, nome),
        h('div', { class: 'pillole' }, [['durc', 'DURC'], ['visura', 'Visura'], ['idoneita', 'Autocertificazione di idoneità'], ['polizza', 'Polizza'], ['albo', 'Iscrizione all\'albo']].map(([k, n]) => h('button', { type: 'button', class: 'pillola piccola' + (docs[t].indexOf(k) >= 0 ? ' scelta' : ''), disabled: sola,
          onclick: () => { const i = docs[t].indexOf(k); if (i >= 0) docs[t].splice(i, 1); else docs[t].push(k); disegnaDocs(); } }, n))))));
      disegnaDocs();
      const salvaBtn = fn => (sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: fn }, 'Salva')));
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Persone, mezzi e collaboratori')),
        h('div', { class: 'stretta-820 sezione imp-f6' },
          h('div', { class: 'scheda' }, h('h2', null, 'Persone'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, campo('Santo patrono', c.patrono), campo('Conservazione dopo l\'uscita', conSuffisso(c.conserva, 'anni')), campo('Saldo da aggiornare dopo', conSuffisso(c.saldo, 'giorni'))),
            salvaBtn(() => { if (c.patrono.value.trim() && !/^\d{2}-\d{2}$/.test(c.patrono.value.trim())) { avviso('Santo patrono: scrivi mese e giorno, per esempio 07-01', true); return; } salvaValori({ FESTA_PATRONO: c.patrono.value.trim(), PERSONE_CONSERVA_ANNI: num(c.conserva), SALDO_AVVISO_GIORNI: num(c.saldo) }, 'Salvato: vale per i conti di ferie e presenze'); }))),
          h('div', { class: 'scheda' }, h('h2', null, 'Tarature e verifiche'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, campo('Ogni, per gli strumenti nuovi', conSuffisso(c.ogni, 'mesi')), campo('Preavviso', conSuffisso(c.preavviso, 'giorni'))),
            h('div', { class: 'campo' }, h('label', null, 'Con la taratura scaduta'), zonaBlocco),
            salvaBtn(() => salvaValori({ TARATURA_OGNI_MESI: num(c.ogni), TARATURA_PREAVVISO_GIORNI: num(c.preavviso), TARATURA_BLOCCO: blocco }, blocco === 'blocco' ? 'Salvato: uno strumento scaduto non si sceglie più nei rapportini' : 'Salvato: uno strumento scaduto si usa solo confermando')))),
          h('div', { class: 'scheda' }, h('h2', null, 'Collaboratori esterni'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, campo('Un DURC vale', conSuffisso(c.durc, 'giorni')), campo('La visura al massimo di', conSuffisso(c.visura, 'mesi')), campo('Accesso degli esterni senza incarichi', conSuffisso(c.esterni, 'giorni'))),
            h('h3', null, 'I documenti che servono per l\'idoneità'), zonaDocs,
            salvaBtn(() => salvaValori({ DURC_GIORNI: num(c.durc), VISURA_MESI: num(c.visura), ACCESSO_ESTERNI_GIORNI: num(c.esterni), COLLAB_DOCUMENTI: JSON.stringify(docs) }, 'Salvato: l\'idoneità si rifà coi documenti nuovi')))),
          h('div', { class: 'scheda' }, h('h2', null, 'Mezzi'), h('div', { class: 'fila' },
            campo('Avviso del tagliando a km', conSuffisso(c.tagliando, 'km prima')),
            salvaBtn(() => salvaValori({ KM_TAGLIANDO_AVVISO: num(c.tagliando) }, 'Salvato'))))) ]);
    }

    // ===================================================================== fase 7: portale clienti e comunicazioni

    const vero = v => v === true || v === 'true' || v === 1 || v === '1' || v === 'SI';
    async function salvaValori7(valori, frase) {
      const ris = await lavora('Salvo', () => Rete.post('/server/salvaImpostazioni', { valori }));
      if (ris) { S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni || valori); if (W.Portale) W.Portale.daRileggere(); avviso(frase || 'Salvato'); W.disegnaPagina(); }
      return ris;
    }

    /**
     * Amministrazione › Impostazioni › Portale clienti (§0.5, §12.6): l'indirizzo con lo stato e Prova adesso, lo script del
     * portale, Portale acceso, le durate, i file dal cliente, le email lasciate allo studio, l'informativa, Spegni il portale adesso.
     */
    function impostazioniPortale(pagina) {
      const K = radice.WisperRegoleComunicazioni;
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      // I valori iniziali dell'accordo (§5.1), se il server non li ha ancora.
      const BASE = { PORTALE_LINK_MINUTI: 10, PORTALE_LINK_AVVISO_ORE: 72, PORTALE_SESSIONE_MINUTI: 30, PORTALE_SESSIONE_ORE: 8, PORTALE_FILE_MAX_MB: 20, PORTALE_EMAIL_RISERVA: 20 };
      const inp = (k, extra) => h('input', Object.assign({ type: 'text', value: imp[k] === undefined || imp[k] === null || imp[k] === '' ? (BASE[k] !== undefined ? String(BASE[k]) : '') : String(imp[k]), disabled: sola }, extra || {}));
      const num = i => (i.value.trim() === '' ? '' : C.num(i.value));
      const c = { indirizzo: inp('PORTALE_INDIRIZZO', { type: 'url', placeholder: 'https://studiogm-portale.netlify.app', spellcheck: 'false' }),
        link: inp('PORTALE_LINK_MINUTI', { inputmode: 'numeric' }), avviso: inp('PORTALE_LINK_AVVISO_ORE', { inputmode: 'numeric' }),
        sessMin: inp('PORTALE_SESSIONE_MINUTI', { inputmode: 'numeric' }), sessOre: inp('PORTALE_SESSIONE_ORE', { inputmode: 'numeric' }),
        mb: inp('PORTALE_FILE_MAX_MB', { inputmode: 'numeric' }), riserva: inp('PORTALE_EMAIL_RISERVA', { inputmode: 'numeric' }) };
      const TIPI = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'];
      let tipi = [];
      try { tipi = Array.isArray(imp.PORTALE_TIPI_FILE) ? imp.PORTALE_TIPI_FILE.slice() : JSON.parse(imp.PORTALE_TIPI_FILE || '[]'); } catch (e) { tipi = []; }
      if (!tipi.length) tipi = TIPI.slice();
      const attivo = vero(imp.PORTALE_ATTIVO);
      const zonaStato = h('div', { class: 'stato-portale' }, segnaposto(1, 26));
      const zonaTipi = h('div', { class: 'pillole' });
      // Si può solo togliere (§5.1): il server non accetta tipi fuori dall'elenco.
      const disegnaTipi = () => aggiungi(svuota(zonaTipi), TIPI.map(t => h('button', { type: 'button', class: 'pillola piccola' + (tipi.indexOf(t) >= 0 ? ' scelta' : ''), disabled: sola,
        onclick: () => { const i = tipi.indexOf(t); if (i >= 0) tipi.splice(i, 1); else tipi.push(t); disegnaTipi(); } }, t.toUpperCase())));
      disegnaTipi();
      const statoDa = st => {
        const s = K.statoPortale(Object.assign({ attivo: true }, st || {}));
        const sc = st && st.script ? K.statoScript(st.script) : null;
        aggiungi(svuota(zonaStato), [h('span', { class: 'pill p-' + s.colore }, s.spento ? 'Spento' : s.parola),
          st && st.controllatoIl ? h('span', { class: 'secondario' }, 'provato ' + K.quando(st.controllatoIl, new Date())) : null,
          !sola || W.puo('portale') ? h('button', { type: 'button', class: 'btn piccolo', onclick: provaAdesso }, 'Prova adesso') : null]);
        aggiungi(zonaScript, sc ? [h('span', { class: 'pill p-' + sc.colore }, sc.parola), sc.frase ? h('span', { class: 'secondario' }, sc.frase) : null] : [h('span', { class: 'pill p-grigio' }, 'Non collegato'), h('span', { class: 'secondario' }, 'mancano WISPER_PORTALE_URL e SEGRETO_PORTALE sul NAS')]);
      };
      const zonaScript = h('div', { class: 'stato-portale' });
      const leggiStato = () => (W.puo('portale') ? Rete.get('/server/portale').then(r => r.stato) : Promise.resolve({ collegato: imp.PORTALE_INDIRIZZO ? (S.io.interfaccia.portaleCollegato ? 'si' : 'no') : 'non_collegato', indirizzo: imp.PORTALE_INDIRIZZO }));
      leggiStato().then(st => { svuota(zonaScript); statoDa(st); }).catch(() => { svuota(zonaScript); statoDa({ collegato: imp.PORTALE_INDIRIZZO ? 'no' : 'non_collegato' }); });
      async function provaAdesso() {
        const r = await lavora('Provo il portale da fuori', () => Rete.post('/server/controllaPortale', {}));
        if (!r) return;
        avviso(r.collegato === 'si' ? 'Raggiunto da fuori' + (r.ms ? ' in ' + r.ms + ' ms' : '') : r.collegato === 'no' ? 'Il portale non si raggiunge da fuori' : 'Il portale non è collegato: manca l\'indirizzo', r.collegato === 'no');
        leggiStato().then(st => { svuota(zonaScript); statoDa(st); }).catch(() => null);
      }
      const accendi = async v => {
        if (v) { await salvaValori7({ PORTALE_ATTIVO: true }, 'Portale acceso'); return; }
        spegni();
      };
      async function spegni() {
        const prova = c2 => lavora('Spengo il portale', () => Rete.post('/server/spegniPortale', c2 ? { conferma: true } : {}).catch(e => { if (e && e.dati && e.dati.serveConferma) return { serveConferma: e.dati.frase || e.message }; throw e; }));
        const r = await prova(false);
        if (!r) return;
        if (r.serveConferma && !(await conferma('Spegnere il portale adesso?', r.serveConferma, 'Spegni il portale', true))) return;
        const r2 = r.serveConferma ? await prova(true) : r;
        if (!r2 || r2.serveConferma) return;
        S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, { PORTALE_ATTIVO: false });
        if (W.Portale) W.Portale.daRileggere();
        avviso('Portale spento: nessun cliente può entrare. Si riaccende da qui.');
        W.disegnaPagina();
      }
      const cambiaInformativa = () => {
        const t = h('textarea', { rows: 14, disabled: sola });
        t.value = imp.PORTALE_INFORMATIVA || '';
        let chiudi;
        chiudi = finestra({ titolo: 'Informativa per i clienti', corpo: campo('Testo dell\'informativa', t), larghezza: 'media', fuoco: false,
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, sola ? 'Chiudi' : 'Annulla'),
            sola ? null : h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
              if (!t.value.trim()) { avviso('Scrivi il testo dell\'informativa', true); return; }
              // Cambiando la data, al prossimo ingresso tutti i referenti la rivedono (§3.19).
              const r = await salvaValori7({ PORTALE_INFORMATIVA: t.value.trim(), PORTALE_INFORMATIVA_DATA: C.oggiIso() }, 'Informativa cambiata: al prossimo ingresso i clienti la rivedono');
              if (r) chiudi();
            } }, 'Salva l\'informativa')].filter(Boolean) });
      };
      const interr = W.Portale ? W.Portale.interruttore('Portale acceso', attivo ? 'I clienti col portale possono entrare' : 'Nessun cliente può entrare', attivo, accendi, sola) : null;
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Portale clienti')),
        h('div', { class: 'stretta-820 sezione imp-f6' },
          h('div', { class: 'scheda scheda-indirizzo' }, h('h2', null, 'Su internet'), h('div', { class: 'fila' },
            campo('Indirizzo del portale', c.indirizzo), zonaStato,
            h('div', { class: 'campo' }, h('label', null, 'Script del portale'), zonaScript),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => {
              const v = c.indirizzo.value.trim();
              if (v && !/^https:\/\/[^\s/]+/.test(v)) { avviso('L\'indirizzo del portale comincia con https://', true); return; }
              salvaValori7({ PORTALE_INDIRIZZO: v.replace(/\/+$/, '') }, v ? 'Salvato: provo il portale da fuori' : 'Salvato: il portale è Non collegato').then(r => { if (r && v) provaAdesso(); });
            } }, 'Salva')))),
          h('div', { class: 'scheda righe' }, interr),
          h('div', { class: 'scheda' }, h('h2', null, 'Ingresso e file'), h('div', { class: 'fila' },
            h('div', { class: 'riga-campi' }, campo('Link e codice valgono', conSuffisso(c.link, 'minuti')), campo('Link negli avvisi', conSuffisso(c.avviso, 'ore'))),
            h('div', { class: 'riga-campi' }, campo('Sessione senza uso', conSuffisso(c.sessMin, 'minuti')), campo('Sessione al massimo', conSuffisso(c.sessOre, 'ore'))),
            h('div', { class: 'riga-campi' }, campo('File dal cliente al massimo', conSuffisso(c.mb, 'MB')), campo('Email lasciate allo studio', conSuffisso(c.riserva, 'al giorno'))),
            h('div', { class: 'campo' }, h('label', null, 'Tipi di file dal cliente'), zonaTipi),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => {
              if (!tipi.length) { avviso('Lascia almeno un tipo di file', true); return; }
              salvaValori7({ PORTALE_LINK_MINUTI: num(c.link), PORTALE_LINK_AVVISO_ORE: num(c.avviso), PORTALE_SESSIONE_MINUTI: num(c.sessMin), PORTALE_SESSIONE_ORE: num(c.sessOre),
                PORTALE_FILE_MAX_MB: num(c.mb), PORTALE_EMAIL_RISERVA: num(c.riserva), PORTALE_TIPI_FILE: TIPI.filter(t => tipi.indexOf(t) >= 0) }, 'Salvato: vale per i prossimi ingressi');
            } }, 'Salva')))),
          h('div', { class: 'scheda' }, h('h2', null, 'Informativa per i clienti'), h('div', { class: 'fila' },
            h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Versione'), h('span', { class: 'v' }, imp.PORTALE_INFORMATIVA_DATA ? 'versione del ' + C.data(imp.PORTALE_INFORMATIVA_DATA) : 'da scrivere')),
            h('div', null, h('button', { type: 'button', class: 'btn', onclick: cambiaInformativa }, sola ? 'Leggi' : 'Cambia')))),
          K.Permessi.impostazioniPortale(W.perm()) && attivo ? h('div', null, h('button', { type: 'button', class: 'btn grande bordo-rosso', onclick: spegni }, 'Spegni il portale adesso')) : null)]);
    }

    /** Amministrazione › Impostazioni › Comunicazioni (§12.6): WhatsApp sul telefono, i promemoria, le righe Non collegato col perché (§3.17). */
    function impostazioniComunicazioni(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const inp = (k, d) => h('input', { type: 'text', inputmode: 'numeric', value: imp[k] === undefined || imp[k] === null || imp[k] === '' ? String(d) : String(imp[k]), disabled: sola });
      const num = i => (i.value.trim() === '' ? '' : C.num(i.value));
      let app = ['business', 'normale', 'chiedi'].indexOf(imp.WHATSAPP_APP) >= 0 ? imp.WHATSAPP_APP : 'chiedi';
      const c = { prima: inp('PROMEMORIA_GIORNI_PRIMA', 1), dopo: inp('SOLLECITO_DOPO_GIORNI', 7), secondo: inp('SOLLECITO_SECONDO_GIORNI', 30) };
      const zonaApp = h('div');
      const disegnaApp = () => aggiungi(svuota(zonaApp), [segmenti([['business', 'Business'], ['normale', 'Normale'], ['chiedi', 'Chiedi']], app, k => { if (!sola) { app = k; disegnaApp(); } }, 'piccoli')]);
      disegnaApp();
      const nc = (titolo, perche, ico) => riga({ sinistra: quadrato(ico), titolo, sotto: perche, destra: h('span', { class: 'pill p-grigio' }, 'Non collegato') });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Comunicazioni')),
        h('div', { class: 'stretta-820 sezione imp-f6' },
          h('div', { class: 'scheda' }, h('h2', null, 'WhatsApp e promemoria'), h('div', { class: 'fila' },
            h('div', { class: 'campo' }, h('label', null, 'WhatsApp sul telefono'), zonaApp),
            h('div', { class: 'riga-campi' }, campo('Promemoria degli appuntamenti', conSuffisso(c.prima, 'giorni lavorativi prima')),
              campo('Promemoria di pagamento dopo', conSuffisso(c.dopo, 'giorni')), campo('Il secondo dopo', conSuffisso(c.secondo, 'giorni'))),
            sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salvaValori7({ WHATSAPP_APP: app, PROMEMORIA_GIORNI_PRIMA: num(c.prima), SOLLECITO_DOPO_GIORNI: num(c.dopo), SOLLECITO_SECONDO_GIORNI: num(c.secondo) },
              'Salvato: vale per le proposte di Da mandare da adesso') }, 'Salva')))),
          h('div', { class: 'scheda righe' },
            nc('WhatsApp Business', 'Costa a messaggio (circa 0,036 $ un promemoria) e vuole un indirizzo aperto su internet per le risposte: per ora i messaggi li manda Manuel', 'whatsapp'),
            nc('Ore e spese via messaggio', 'Con WhatsApp servirebbe l\'API a pagamento; l\'app lo fa già in meno di un minuto, anche senza rete', 'scontrino'),
            nc('Assistente operativo', 'I dati dei clienti andrebbero a un fornitore fuori dall\'Europa; un modello sul NAS è troppo lento', 'fumetto')))]);
    }

    /** I tipi di formazione e abilitazione (§5.3): ogni quanto e il preavviso; Nuovo tipo col bordo. */
    function tipiFormazione(pagina) {
      const area = h('div', { class: 'stretta-820 sezione' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Tipi di formazione'), scrive() ? h('button', { type: 'button', class: 'btn', onclick: () => moduloTipo(null) }, icona('piu', 18, 2.6), 'Nuovo tipo') : null), area]);
      leggi(area, 'tipi', '/server/qualificheTipi', ris => {
        const gruppi = { elettrico: 'Lavori elettrici', sicurezza: 'Sicurezza', emergenza: 'Emergenza', altro: 'Altro' };
        aggiungi(area, [h('div', { class: 'scheda righe' }, (ris.tipi || []).map(t => riga({
          sinistra: quadrato(t.gruppo === 'elettrico' ? 'fulmine' : t.gruppo === 'emergenza' ? 'scudo' : 'libro'), titolo: t.nome,
          sotto: [gruppi[t.gruppo] || t.gruppo, t.ogniMesi ? 'ogni ' + t.ogniMesi + ' mesi' : 'non scade', t.preavvisoGiorni ? 'preavviso ' + t.preavvisoGiorni + ' giorni' : ''].filter(Boolean).join(' · '),
          destra: t.attivo === false ? pillola('Non in uso', 'grigio') : null, onclick: scrive() ? () => moduloTipo(t) : null })))]);
      });
    }

    function moduloTipo(t0) {
      const t = t0 || { nome: '', gruppo: 'sicurezza', ogniMesi: '', preavvisoGiorni: 60, attivo: true };
      const v = { nome: h('input', { type: 'text', value: t.nome || '' }), ogni: h('input', { type: 'text', inputmode: 'numeric', value: t.ogniMesi || '' }), preavviso: h('input', { type: 'text', inputmode: 'numeric', value: t.preavvisoGiorni || '' }) };
      let gruppo = t.gruppo || 'sicurezza';
      let attivo = t.attivo !== false;
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [campo('Nome', v.nome), h('div', { class: 'campo' }, h('label', null, 'Gruppo'), segmenti([['elettrico', 'Lavori elettrici'], ['sicurezza', 'Sicurezza'], ['emergenza', 'Emergenza'], ['altro', 'Altro']], gruppo, k => { gruppo = k; disegna(); })),
        h('div', { class: 'riga-campi' }, campo('Ogni', conSuffisso(v.ogni, 'mesi')), campo('Preavviso', conSuffisso(v.preavviso, 'giorni'))),
        t0 ? h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: attivo, onchange: e => { attivo = e.target.checked; } }), 'In uso') : null]);
      disegna();
      let chiudi;
      const salva = async () => {
        if (!v.nome.value.trim()) { v.nome.focus(); avviso('Nome: scrivi il nome della formazione o abilitazione', true); return; }
        const tipo = { nome: v.nome.value.trim(), gruppo, ogniMesi: v.ogni.value.trim() ? Number(v.ogni.value) : null, preavvisoGiorni: v.preavviso.value.trim() ? Number(v.preavviso.value) : null, attivo };
        if (t0) tipo.chiave = t0.chiave;
        const r = await lavora('Salvo', () => Rete.post('/server/salvaQualificaTipo', { tipo }));
        if (!r) return;
        chiudi();
        M.tipi = null;
        avviso('Salvato: vale per la formazione nuova');
        W.disegnaPagina();
      };
      chiudi = finestra({ titolo: t0 ? t0.nome : 'Nuovo tipo', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    // ===================================================================== utenti

    function nomeRuolo(r) { return (R.RUOLI[r] || { nome: r || '' }).nome; }

    function elencoUtenti(pagina) {
      const area = h('div', { class: 'stretta-820' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Utenti'),
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: nuovoUtente }, icona('piu', 18, 2.6), 'Nuovo utente') : null), area]);
      leggi(area, 'utenti', '/server/utenti', ris => {
        const lista = (ris.utenti || []).slice().sort((a, b) => R.ORDINE_RUOLI_PERMESSI.indexOf(a.ruolo) - R.ORDINE_RUOLI_PERMESSI.indexOf(b.ruolo) || String(a.nome).localeCompare(String(b.nome), 'it'));
        aggiungi(area, [h('div', { class: 'scheda righe' }, lista.map(u => riga({
          sinistra: iniziali(u.nome, true),
          titolo: u.nome,
          sotto: [u.email, u.ultimoAccesso ? 'ultimo accesso ' + R.quando(u.ultimoAccesso) : 'mai entrato'].filter(Boolean).join(' · '),
          destra: h('span', { class: 'pillole-destra' }, pillola(nomeRuolo(u.ruolo), 'grigio'), u.attivo === false ? pillola('Disattivato', 'grigio') : null),
          onclick: () => W.vai('#amministrazione/utenti/' + encodeURIComponent(u.id)),
        })))]);
      });
    }

    /** Le quattro scelte del ruolo, ognuna con la sua frase. */
    function scelteRuolo(scelto, onscelta, bloccate) {
      const ordine = ['amministrazione', 'collaboratore', 'lettura', 'titolare'];
      return h('div', { class: 'scelte-ruolo', role: 'radiogroup' }, ordine.map(k => h('button', {
        type: 'button', class: 'scelta-ruolo' + (scelto === k ? ' scelto' : ''), role: 'radio', 'aria-checked': scelto === k ? 'true' : 'false',
        disabled: bloccate, onclick: () => onscelta(k),
      }, h('span', { class: 'pallino-scelta' }), h('span', { class: 'testi' }, h('b', null, R.RUOLI[k].nome), h('span', null, R.RUOLI[k].frase)))));
    }

    function nuovoUtente() {
      const v = { nome: h('input', { type: 'text', autocomplete: 'off' }), email: h('input', { type: 'email', autocomplete: 'off', spellcheck: 'false' }) };
      let ruolo = 'collaboratore';
      let errori = {};
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [campo('Nome', v.nome, errori.nome), campo('Email', v.email, errori.email),
        h('div', { class: 'etichetta' }, 'Ruolo'), scelteRuolo(ruolo, k => { ruolo = k; disegna(); })]);
      disegna();
      const piede = h('div', { class: 'piede-f' });
      let chiudi;
      const crea = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = 'Scrivi il nome';
        if (!v.email.value.trim()) errori.email = 'Scrivi l\'email: serve per entrare';
        else if (R.erroreEmail(v.email.value)) errori.email = R.erroreEmail(v.email.value);
        if (Object.keys(errori).length) { disegna(); return; }
        // La password iniziale la sceglie il server: torna una volta sola, in questa risposta.
        const ris = await lavora('Creo l\'utente', () => Rete.post('/server/salvaUtente', { utente: { nome: v.nome.value.trim(), email: v.email.value.trim(), ruolo, attivo: true } }));
        if (!ris) return;
        M.utenti = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        // La password si vede una volta sola: si copia e si dice a voce.
        aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, (ris.utente && ris.utente.nome) || v.nome.value.trim(), ' entra con ', h('b', null, v.email.value.trim()), ' e questa password:'),
          scatolaPassword(ris.passwordIniziale || '')]);
        aggiungi(svuota(piede), [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Fatto')]);
      };
      aggiungi(piede, [h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
        h('button', { type: 'button', class: 'btn giallo grande', onclick: crea }, 'Crea l\'utente')]);
      chiudi = finestra({
        contenuto: [h('div', { class: 'testa-f' }, h('h2', null, 'Nuovo utente'), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')), h('div', { class: 'corpo-f' }, zona), piede],
        titolo: 'Nuovo utente', allaChiusura: () => { if (W.S && location.hash.indexOf('#amministrazione/utenti') === 0) W.disegnaPagina(); },
      });
    }

    /** "Password iniziale: XXXX-XXXX-XXXX · Copia · comunicala a voce, la cambierà lui". */
    function scatolaPassword(password) {
      const copia = h('button', { type: 'button', class: 'btn', onclick: async () => {
        const ok = await copiaTesto(password);
        avviso(ok ? 'Password copiata' : 'Non sono riuscito a copiarla: scrivila a mano', !ok);
      } }, 'Copia');
      return h('div', { class: 'scatola-password' },
        h('div', { class: 'etichetta' }, 'Password iniziale'),
        h('div', { class: 'riga-password' }, h('code', null, password), copia),
        h('div', { class: 'secondario' }, 'Comunicala a voce: la cambierà lui.'));
    }

    function paginaUtente(pagina, id) {
      const area = h('div', { class: 'stretta-820 sezione' });
      aggiungi(pagina, [area]);
      leggi(area, 'utenti', '/server/utenti', ris => {
        const u = (ris.utenti || []).find(x => String(x.id) === String(id));
        if (!u) { aggiungi(area, [h('p', { class: 'vuoto' }, 'Utente non trovato.')]); return; }
        const ultimo = R.ultimoTitolare(ris.utenti, u);
        const puoCambiare = scrive() && !ultimo;
        const io = S.io && S.io.utente && String(S.io.utente.id) === String(u.id);
        aggiungi(area, [
          h('div', { class: 'testa-soggetto' }, iniziali(u.nome, false, 'grande'),
            h('div', { class: 'titoli' }, h('h1', { class: 'titolo-scheda' }, u.nome),
              h('div', { class: 'pillole-testa' }, pillola(nomeRuolo(u.ruolo), 'grigio'), u.attivo === false ? pillola('Disattivato', 'grigio') : null,
                h('span', { class: 'sotto-titolo' }, [u.email, u.ultimoAccesso ? 'ultimo accesso ' + R.quando(u.ultimoAccesso) : 'mai entrato'].filter(Boolean).join(' · '))))),
          // Fase 6 (§5.2): la scheda della persona (o del collaboratore, per un esterno).
          schedaLegata(u),
          h('div', { class: 'scheda' }, h('h2', null, 'Ruolo'),
            h('div', { class: 'fila' }, u.ruolo === 'esterno' ? h('div', { class: 'scelta-ruolo scelto' }, h('span', { class: 'pallino-scelta' }), h('span', { class: 'testi' }, h('b', null, R.RUOLI.esterno.nome), h('span', null, R.RUOLI.esterno.frase)))
              : scelteRuolo(u.ruolo, k => cambiaRuolo(u, k), !puoCambiare),
              ultimo ? h('div', { class: 'secondario' }, 'È l\'ultimo titolare: non si può disattivare né cambiare ruolo.') : null)),
          scrive() ? h('div', { class: 'scheda righe' },
            riga({ sinistra: quadrato('chiave'), titolo: 'Password', destra: h('button', { type: 'button', class: 'btn', onclick: () => nuovaPassword(u) }, 'Nuova password') }),
            ultimo || io ? null : riga({ sinistra: quadrato('esci'), titolo: u.attivo === false ? 'Disattivato' : 'Accesso attivo',
              sotto: u.attivo === false ? 'Non può entrare' : (u.dispositivi ? (u.dispositivi === 1 ? 'Collegato da 1 dispositivo' : 'Collegato da ' + u.dispositivi + ' dispositivi') : 'Nessun dispositivo collegato'),
              destra: h('button', { type: 'button', class: 'btn', onclick: () => attiva(u, u.attivo === false) }, u.attivo === false ? 'Riattiva' : 'Disattiva') })) : null,
          scrive() ? h('div', { class: 'sezione' }, h('h2', null, 'Dispositivi collegati'), dispositivi(u)) : null]);
      });
    }

    /** La riga "Scheda della persona" (o "Scheda del collaboratore" per un esterno), se l'utente l'ha e la si può aprire. */
    function schedaLegata(u) {
      const a = S.ana.utenti.find(x => String(x.id) === String(u.id)) || {};
      const idPersona = u.idPersona || a.idPersona;
      const idSoggetto = u.idSoggetto || a.idSoggetto;
      if (u.ruolo === 'esterno' && idSoggetto && puo('collaboratori')) return h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('collaboratori'), titolo: 'Scheda del collaboratore', sotto: (W.cliente(idSoggetto) || {}).nome || idSoggetto, onclick: () => W.vai('#collaboratori/c/' + encodeURIComponent(idSoggetto)) }));
      if (idPersona && puo('persone')) return h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('persona'), titolo: 'Scheda della persona', sotto: 'Lavoro, ferie, formazione, costo', onclick: () => W.vai('#persone/p/' + encodeURIComponent(idPersona)) }));
      return null;
    }

    function dispositivi(u) {
      const zona = h('div');
      const disegna = () => {
        svuota(zona);
        const lista = (M.sessioni[u.id] && M.sessioni[u.id].sessioni) || [];
        if (!lista.length) { aggiungi(zona, [h('div', { class: 'calmo' }, 'Nessun dispositivo collegato.')]); return; }
        aggiungi(zona, [h('div', { class: 'scheda righe' }, lista.map(s => riga({
          sinistra: quadrato(/telefono|android/i.test(s.app || '') ? 'telefono' : 'app'),
          titolo: (s.dispNome || s.disp || 'Dispositivo') + (s.questa ? ' (questo computer)' : ''), sotto: [s.app, s.ultimoUso ? 'usato ' + R.quando(s.ultimoUso) : ''].filter(Boolean).join(' · '),
          destra: scrive() ? h('button', { type: 'button', class: 'btn', onclick: async () => {
            const ok = await conferma('Scollegare ' + (s.dispNome || 'il dispositivo') + '?', 'Per usare Wisper da lì ' + u.nome.split(' ')[0] + ' dovrà entrare di nuovo con email e password.', 'Scollega', true);
            if (!ok) return;
            const ris = await lavora('Scollego', () => Rete.post('/server/revocaSessione', { id: s.id }));
            if (!ris) return;
            M.sessioni[u.id] = null;
            avviso('Dispositivo scollegato');
            carica();
          } }, 'Scollega') : null,
        })))]);
      };
      const carica = async () => {
        aggiungi(svuota(zona), [segnaposto(2, 64)]);
        try {
          M.sessioni[u.id] = await Rete.get('/server/sessioni?idUtente=' + encodeURIComponent(u.id));
        } catch (e) {
          aggiungi(svuota(zona), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e)))]);
          return;
        }
        disegna();
      };
      if (M.sessioni[u.id]) disegna(); else carica();
      return zona;
    }

    async function permessiRuoli() {
      if (!M.permessi) M.permessi = await Rete.get('/server/permessi');
      return M.permessi.permessi || {};
    }

    async function cambiaRuolo(u, ruolo) {
      if (ruolo === u.ruolo) return;
      let tabella = {};
      try { tabella = await permessiRuoli(); } catch (e) { tabella = {}; }
      const ok = await conferma('Cambiare il ruolo di ' + u.nome.split(' ')[0] + '?',
        'Diventa ' + nomeRuolo(ruolo) + '. ' + (tabella[ruolo] ? R.descriviRuolo(tabella[ruolo]) : R.RUOLI[ruolo].frase), 'Cambia il ruolo');
      if (!ok) return;
      const prima = u.ruolo;
      const ris = await lavora('Cambio il ruolo', () => Rete.post('/server/salvaUtente', { utente: { id: u.id, ruolo } }));
      if (!ris) return;
      M.utenti = null;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso('Ruolo cambiato: vale da subito', false, null, { testo: 'Annulla', fn: async () => {
        if (await lavora('Rimetto com\'era', () => Rete.post('/server/salvaUtente', { utente: { id: u.id, ruolo: prima } }))) { M.utenti = null; W.disegnaPagina(); }
      } });
      W.disegnaPagina();
    }

    async function nuovaPassword(u) {
      const ok = await conferma('Fare una password nuova per ' + u.nome.split(' ')[0] + '?', 'Quella di adesso smette di funzionare. La nuova si vede una volta sola.', 'Fai la password');
      if (!ok) return;
      const ris = await lavora('Faccio la password', () => Rete.post('/server/nuovaPassword', { idUtente: u.id }));
      if (!ris) return;
      M.sessioni[u.id] = null;
      let chiudi;
      chiudi = finestra({ titolo: 'Password nuova', corpo: scatolaPassword(ris.passwordIniziale || ''), fuoco: false,
        allaChiusura: () => W.disegnaPagina(),
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Fatto')] });
    }

    async function attiva(u, si) {
      if (!si) {
        const ok = await conferma('Disattivare ' + u.nome + '?', 'Non entra più in Wisper da nessun dispositivo. I suoi rapportini restano. Si riattiva da qui.', 'Disattiva', true);
        if (!ok) return;
      }
      const ris = await lavora(si ? 'Riattivo' : 'Disattivo', () => Rete.post('/server/salvaUtente', { utente: { id: u.id, attivo: si } }));
      if (!ris) return;
      M.utenti = null;
      M.sessioni[u.id] = null;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso(si ? u.nome + ' riattivato' : u.nome + ' disattivato', false, null, si ? null : { testo: 'Annulla', fn: () => attiva(u, true) });
      W.disegnaPagina();
    }

    // ===================================================================== ruoli e permessi

    function permessi(pagina) {
      const area = h('div', { class: 'stretta-820 sezione' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Ruoli e permessi')), area]);
      leggi(area, 'permessi', '/server/permessi', ris => {
        const tabella = ris.permessi || {};
        const r = M.ruoloPerm;
        const bloccato = r === 'titolare' || !scrive();
        // Fase 6 (§12.8): la colonna dell'esterno, con le righe bloccate dove a un esterno non si può dare niente.
        const ruoli = (ris.ruoli || R.ORDINE_RUOLI).indexOf('esterno') >= 0 ? R.ORDINE_RUOLI_PERMESSI : R.ORDINE_RUOLI;
        aggiungi(area, [
          segmenti(ruoli.map(k => [k, R.RUOLI[k].nome]), r, k => { M.ruoloPerm = k; W.disegnaPagina(); }),
          h('div', { class: 'scheda intro-ruolo' }, h('b', null, R.RUOLI[r].nome), h('span', { class: 'sotto-titolo' }, R.RUOLI[r].frase + (r === 'titolare' ? ' Il titolare ha sempre tutto.' : ''))),
          h('div', { class: 'scheda righe-permessi' }, R.RIGHE_PERMESSI.map(m => {
            const l = R.livello(tabella[r], m.modulo);
            const vietato = r === 'esterno' && R.VIETATI_ESTERNO.indexOf(m.modulo) >= 0;
            return h('div', { class: 'riga-perm' },
              h('div', { class: 'testi' }, h('div', { class: 'nome-m' }, m.nome), h('div', { class: 'spiega' }, vietato ? 'A un esterno non si dà' : m.spiega)),
              h('div', { class: 'liv' + (bloccato || vietato ? ' bloccato' : ''), role: 'group', 'aria-label': m.nome },
                R.LIVELLI.map((t, i) => h('button', { type: 'button', class: 'l' + i, 'aria-pressed': l === i ? 'true' : 'false', disabled: bloccato || vietato,
                  onclick: () => cambiaPermesso(r, m.modulo, i, l) }, t))));
          }))]);
      });
    }

    async function cambiaPermesso(ruolo, modulo, livello, prima) {
      if (livello === prima) return;
      const salva = l => lavora('Cambio il permesso', () => Rete.post('/server/salvaPermessi', { permessi: { [ruolo]: { [modulo]: l } } }));
      const ris = await salva(livello);
      if (!ris) return;
      if (ris.permessi) M.permessi = { permessi: ris.permessi }; else if (M.permessi) (M.permessi.permessi[ruolo] || (M.permessi.permessi[ruolo] = {}))[modulo] = livello;
      W.disegnaPagina();
      avviso('Permesso cambiato: vale da subito', false, null, { testo: 'Annulla', fn: async () => {
        const indietro = await salva(prima);
        if (!indietro) return;
        if (indietro.permessi) M.permessi = { permessi: indietro.permessi }; else M.permessi.permessi[ruolo][modulo] = prima;
        W.disegnaPagina();
      } });
    }

    // ===================================================================== numerazioni

    const NOMI_NUMERAZIONE = { commessa: 'Commesse', rapportino: 'Rapportini', preventivo: 'Preventivi' };

    function prossimoNumero(n) {
      const m = String(n.prossimo || '').match(/(\d+)\D*$/);
      return (Number(n.ultimo) || 0) + 1 || (m ? Number(m[1]) : 1);
    }

    function numerazioni(pagina) {
      const anno = new Date().getFullYear();
      const lista = S.ana.numerazioni.length ? S.ana.numerazioni : [];
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Numerazioni')),
        lista.length ? h('div', { class: 'due-colonne stretta-900' }, lista.map(n => {
          const prossimo = n.prossimo || R.formattaNumero(n.formato, prossimoNumero(n), anno);
          return h('div', { class: 'scheda numerazione' },
            h('span', { class: 'etichetta' }, NOMI_NUMERAZIONE[n.tipo] || n.tipo),
            h('div', { class: 'prossimo' }, h('span', { class: 'codice grande' }, prossimo), h('span', { class: 'sotto-titolo' }, 'la prossima')),
            h('div', { class: 'coppie' },
              h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Formato'), h('span', { class: 'v' }, R.formatoAParole(n.formato))),
              h('div', { class: 'coppia' }, h('span', { class: 'k' }, 'Numero'), h('span', { class: 'v' }, n.annuale ? 'riparte a gennaio' : 'continua da un anno all\'altro'))),
            scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => modificaNumerazione(n) }, 'Modifica')) : null);
        })) : h('p', { class: 'vuoto' }, 'Il server non ha ancora mandato le numerazioni.'),
      // Fase 4 (§4.1): le fatture non hanno una numerazione in Wisper.
      soldi() && puo('fatturazione') ? h('div', { class: 'calmo stretta-900' }, icona('fatturazione', 20, 2.2), 'Le fatture le numera il tuo programma: Wisper usa solo il riferimento W-15 per riconoscerle.') : null]);
    }

    // ===================================================================== impostazioni fiscali (fase 4)

    /** La conferma del commercialista ({data, commercialista, da}) o null. */
    function regoleConfermate() {
      const r = S.ana.impostazioni.REGOLE_FISCALI_CONFERMATE;
      return r && typeof r === 'object' && r.data ? r : null;
    }

    /**
     * Impostazioni fiscali (fase4.md §13.6): la scheda "Regole confermate dal commercialista"
     * (Non ancora / Confermate il … da …) col giallo Segna confermate (solo il titolare); le schede
     * Aliquote, Bollo, Documento, Pagamento, ognuna col suo Salva col bordo. Cambiare una regola
     * toglie la conferma (lo fa il server, qui si dice).
     */
    function fiscale(pagina) {
      const imp = S.ana.impostazioni;
      const sola = !scrive();
      const titolare = !!(S.io && S.io.utente && S.io.utente.ruolo === 'titolare') && scrive();
      const conf = regoleConfermate();
      const v = (k, d) => (imp[k] === undefined || imp[k] === null || imp[k] === '' ? d : imp[k]);
      const numero = (k, d) => h('input', { type: 'text', inputmode: 'decimal', value: R.numeroCampo(Number(v(k, d))), disabled: sola });
      const testo = (k, d) => h('input', { type: 'text', value: String(v(k, d)), disabled: sola });
      const scelte = { BOLLO_RIVALSA: v('BOLLO_RIVALSA', true) !== false && v('BOLLO_RIVALSA', true) !== 'NO', PAGAMENTO_FINE_MESE: v('PAGAMENTO_FINE_MESE', false) === true || v('PAGAMENTO_FINE_MESE', false) === 'SI',
        TIPO_DOCUMENTO: v('TIPO_DOCUMENTO', 'TD01'), REGIME_FISCALE: v('REGIME_FISCALE', 'RF01'), MODALITA_PAGAMENTO: v('MODALITA_PAGAMENTO', 'MP05') };
      const c = {
        IVA: numero('IVA', 22), EPPI_INTEGRATIVO: numero('EPPI_INTEGRATIVO', 5), RITENUTA: numero('RITENUTA', 20),
        RITENUTA_TIPO: testo('RITENUTA_TIPO', 'RT01'), RITENUTA_CAUSALE: testo('RITENUTA_CAUSALE', 'A'), EPPI_TIPO_CASSA: testo('EPPI_TIPO_CASSA', 'TC17'),
        BOLLO_SOGLIA: numero('BOLLO_SOGLIA', 77.47), BOLLO_IMPORTO: numero('BOLLO_IMPORTO', 2), GIORNI_PAGAMENTO: numero('GIORNI_PAGAMENTO', 30), SOGLIA_CASSA: numero('SOGLIA_CASSA', 3000),
      };
      const salva = async chiavi => {
        const valori = {};
        chiavi.forEach(k => {
          if (c[k]) valori[k] = ['RITENUTA_TIPO', 'RITENUTA_CAUSALE', 'EPPI_TIPO_CASSA'].indexOf(k) >= 0 ? c[k].value.trim() : C.num(c[k].value);
          else valori[k] = scelte[k];
        });
        const prima = regoleConfermate();
        const ris = await lavora('Salvo', () => Rete.post('/server/salvaImpostazioni', { valori }));
        if (!ris) return;
        S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni || valori);
        if (!ris.impostazioni) await W.ricaricaAnagrafiche();
        avviso(prima && !regoleConfermate() ? 'Fatto. La conferma del commercialista va rifatta' : 'Salvato');
        W.disegnaPagina();
      };
      const scheda = (titolo, corpo, chiavi) => h('div', { class: 'scheda' }, h('h2', null, titolo), h('div', { class: 'fila' }, corpo,
        sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salva(chiavi) }, 'Salva'))));
      const disegnaScelte = (k, voci) => {
        const zona = h('div');
        const rifai = () => aggiungi(svuota(zona), [segmenti(voci, scelte[k], x => { if (sola) return; scelte[k] = x; rifai(); }, 'piccoli')]);
        rifai();
        return zona;
      };
      const siNoZona = k => {
        const zona = h('div');
        const rifai = () => aggiungi(svuota(zona), [segmenti([['si', 'Sì'], ['no', 'No']], scelte[k] ? 'si' : 'no', x => { if (sola) return; scelte[k] = x === 'si'; rifai(); }, 'piccoli')]);
        rifai();
        return zona;
      };
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('h1', null, 'Impostazioni fiscali'),
        !conf && titolare ? h('button', { type: 'button', class: 'btn giallo', onclick: segnaConfermate }, 'Segna confermate') : null),
      h('div', { class: 'stretta-900 sezione' },
        h('div', { class: 'scheda conferma-regole' + (conf ? ' confermate' : '') }, h('span', { class: 'etichetta' }, 'Regole confermate dal commercialista'),
          conf ? h('div', { class: 'pillole-testa' }, pillola('Confermate', 'verde'), h('b', null, 'il ' + C.data(conf.data) + ' da ' + conf.commercialista))
            : h('div', { class: 'pillole-testa' }, pillola('Non ancora', 'giallo'), h('b', null, 'Contributo EPPI, ritenuta, bollo e tipo di documento vanno confermati')),
          conf && titolare ? h('button', { type: 'button', class: 'btn collegamento', style: { alignSelf: 'flex-start' }, onclick: togliConferma }, 'Togli la conferma') : null),
        h('div', { class: 'due-colonne' },
          h('div', { class: 'sezione' },
            scheda('Aliquote', [h('div', { class: 'riga-campi' }, campo('IVA', conSuffisso(c.IVA, '%')), campo('Contributo integrativo EPPI', conSuffisso(c.EPPI_INTEGRATIVO, '%')), campo('Ritenuta', conSuffisso(c.RITENUTA, '%'))),
              h('div', { class: 'riga-campi' }, campo('Codice della ritenuta', c.RITENUTA_TIPO), campo('Causale', c.RITENUTA_CAUSALE), campo('Cassa nella fattura', c.EPPI_TIPO_CASSA))],
            ['IVA', 'EPPI_INTEGRATIVO', 'RITENUTA', 'RITENUTA_TIPO', 'RITENUTA_CAUSALE', 'EPPI_TIPO_CASSA']),
            scheda('Saldo e scadenziario', [campo('Soglia del saldo: sotto, il giorno è rosso', conSuffisso(c.SOGLIA_CASSA, '€'))], ['SOGLIA_CASSA'])),
          h('div', { class: 'sezione' },
            scheda('Bollo', [h('div', { class: 'riga-campi' }, campo('Scatta sopra (senza IVA)', conSuffisso(c.BOLLO_SOGLIA, '€')), campo('Importo', conSuffisso(c.BOLLO_IMPORTO, '€'))),
              h('div', { class: 'campo' }, h('label', null, 'Lo riaddebito al cliente'), siNoZona('BOLLO_RIVALSA'))], ['BOLLO_SOGLIA', 'BOLLO_IMPORTO', 'BOLLO_RIVALSA']),
            scheda('Documento', [h('div', { class: 'campo' }, h('label', null, 'Tipo'), disegnaScelte('TIPO_DOCUMENTO', [['TD01', 'Fattura (TD01)'], ['TD06', 'Parcella (TD06)']])),
              h('div', { class: 'campo' }, h('label', null, 'Regime'), disegnaScelte('REGIME_FISCALE', [['RF01', 'Ordinario (RF01)'], ['RF19', 'Forfettario (RF19)']]))], ['TIPO_DOCUMENTO', 'REGIME_FISCALE']),
            scheda('Pagamento', [h('div', { class: 'riga-campi' }, campo('Giorni', conSuffisso(c.GIORNI_PAGAMENTO, 'giorni')), h('div', { class: 'campo' }, h('label', null, 'Fine mese'), siNoZona('PAGAMENTO_FINE_MESE'))),
              h('div', { class: 'campo' }, h('label', null, 'Modo'), disegnaScelte('MODALITA_PAGAMENTO', [['MP05', 'Bonifico'], ['MP12', 'RIBA'], ['MP02', 'Assegno'], ['MP01', 'Contanti']]))], ['GIORNI_PAGAMENTO', 'PAGAMENTO_FINE_MESE', 'MODALITA_PAGAMENTO']))))]);
    }

    function segnaConfermate() {
      const data = h('input', { type: 'date', value: C.oggiIso(), max: C.oggiIso() });
      const nome = h('input', { type: 'text', autocomplete: 'off' });
      const zonaNome = h('div', null, campo('Commercialista', nome));
      let chiudi;
      const vai = async () => {
        if (!nome.value.trim()) { aggiungi(svuota(zonaNome), [campo('Commercialista', nome, 'Commercialista: scrivi chi ha controllato le regole')]); nome.focus(); return; }
        const ris = await lavora('Segno confermate', () => Rete.post('/server/confermaRegoleFiscali', { data: data.value || C.oggiIso(), commercialista: nome.value.trim() }));
        if (!ris) return;
        if (ris.impostazioni) S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni);
        S.ana.impostazioni.REGOLE_FISCALI_CONFERMATE = ris.regoleConfermate;
        chiudi();
        W.caricaDashboard();
        avviso('Regole confermate: le pillole Da confermare spariscono');
        W.disegnaPagina();
      };
      const imp = S.ana.impostazioni;
      chiudi = finestra({ titolo: 'Regole confermate', corpo: [h('p', { class: 'sotto-titolo', style: { margin: 0 } }, 'Contributo EPPI ' + C.numero(imp.EPPI_INTEGRATIVO !== undefined ? imp.EPPI_INTEGRATIVO : 5) + '%, ritenuta ' +
        C.numero(imp.RITENUTA !== undefined ? imp.RITENUTA : 20) + '% sul compenso, bollo oltre ' + C.euro(imp.BOLLO_SOGLIA !== undefined ? imp.BOLLO_SOGLIA : 77.47) + ' senza IVA, ' +
        ((imp.TIPO_DOCUMENTO || 'TD01') === 'TD06' ? 'parcella TD06' : 'fattura TD01') + '.'), zonaNome, campo('Il giorno', data)],
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: vai }, 'Segna confermate')] });
    }

    async function togliConferma() {
      if (!(await conferma('Togliere la conferma?', 'Su ogni conto torna la pillola Da confermare, finché non le segni confermate di nuovo.', 'Togli la conferma'))) return;
      const ris = await lavora('Tolgo la conferma', () => Rete.post('/server/confermaRegoleFiscali', { data: null }));
      if (!ris) return;
      if (ris.impostazioni) S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, ris.impostazioni);
      S.ana.impostazioni.REGOLE_FISCALI_CONFERMATE = null;
      W.caricaDashboard();
      avviso('Conferma tolta');
      W.disegnaPagina();
    }

    /** Il formato coi pezzi da toccare: anno a 4 o 2 cifre, testo fisso, numero con N cifre. */
    function modificaNumerazione(n) {
      const anno = new Date().getFullYear();
      let pezzi = R.pezziFormato(n.formato);
      let annuale = !!n.annuale;
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => {
        const formato = R.formatoDaPezzi(pezzi);
        const anteprima = R.formattaNumero(formato, prossimoNumero(n), anno);
        aggiungi(svuota(zona), [
          h('div', { class: 'anteprima-numero' }, h('span', { class: 'etichetta' }, 'Anteprima'), h('span', { class: 'codice grande' }, anteprima || '—')),
          h('div', { class: 'pezzi' }, pezzi.map((p, i) => h('div', { class: 'pezzo' },
            h('span', { class: 'nome-pezzo' }, p.tipo === 'anno' ? 'Anno' : p.tipo === 'numero' ? 'Numero' : 'Testo'),
            p.tipo === 'anno' ? segmenti([[4, '4 cifre'], [2, '2 cifre']], p.cifre, x => { p.cifre = Number(x); disegna(); }, 'piccoli')
              : p.tipo === 'numero' ? h('span', { class: 'stepper' }, tondo('meno', 'Una cifra in meno', () => { p.cifre = Math.max(1, p.cifre - 1); disegna(); }, 'piccolo'),
                h('span', { class: 'valore piccolo' }, p.cifre + ' cifre'), tondo('piu', 'Una cifra in più', () => { p.cifre = Math.min(8, p.cifre + 1); disegna(); }, 'piccolo'))
                : h('input', { type: 'text', class: 'campo-solo', value: p.testo, maxlength: '12', 'aria-label': 'Testo fisso', oninput: e => { p.testo = e.target.value; aggiorna(); } }),
            h('span', { class: 'spazio' }),
            i > 0 ? tondo('indietro', 'Sposta prima', () => { pezzi = R.sposta(pezzi, i, i - 1); disegna(); }, 'piccolo') : null,
            i < pezzi.length - 1 ? tondo('avanti', 'Sposta dopo', () => { pezzi = R.sposta(pezzi, i, i + 1); disegna(); }, 'piccolo') : null,
            tondo('chiudi', 'Togli', () => { pezzi.splice(i, 1); disegna(); }, 'piccolo')))),
          h('div', { class: 'pillole' },
            pezzi.some(p => p.tipo === 'anno') ? null : h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { pezzi.push({ tipo: 'anno', cifre: 4 }); disegna(); } }, '+ Anno'),
            h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { pezzi.push({ tipo: 'testo', testo: '/' }); disegna(); } }, '+ Testo'),
            pezzi.some(p => p.tipo === 'numero') ? null : h('button', { type: 'button', class: 'pillola tratteggiata', onclick: () => { pezzi.push({ tipo: 'numero', cifre: 3 }); disegna(); } }, '+ Numero')),
          h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: annuale, onchange: e => { annuale = e.target.checked; disegna(); } }), 'Il numero riparte a gennaio'),
          errore ? h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errore)) : null,
          h('div', { class: 'secondario' }, 'Vale solo per i numeri nuovi: quelli già dati non cambiano.')]);
      };
      // Scrivendo nel testo si aggiorna solo l'anteprima, senza perdere il cursore.
      const aggiorna = () => {
        const a = zona.querySelector('.anteprima-numero .codice');
        if (a) a.textContent = R.formattaNumero(R.formatoDaPezzi(pezzi), prossimoNumero(n), anno) || '—';
      };
      disegna();
      let chiudi;
      const salva = async () => {
        const formato = R.formatoDaPezzi(pezzi);
        errore = R.erroreFormato(formato, annuale);
        if (errore) { disegna(); return; }
        const ris = await lavora('Salvo la numerazione', () => Rete.post('/server/salvaNumerazione', { tipo: n.tipo, formato, annuale }));
        if (!ris) return;
        await W.ricaricaAnagrafiche().catch(() => null);
        chiudi();
        avviso('Numerazione salvata: vale per i numeri nuovi');
        W.disegnaPagina();
      };
      chiudi = finestra({ titolo: NOMI_NUMERAZIONE[n.tipo] || n.tipo, corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    // ===================================================================== registro attività

    const TABELLE = [['', 'Tutto'], ['soggetti', 'Clienti e fornitori'], ['commesse', 'Commesse'], ['progetti', 'Progetti'], ['prestazioni', 'Prestazioni'], ['rapportini', 'Rapportini'],
      ['ore', 'Ore'], ['spese', 'Spese'], ['trasferte', 'Trasferte'], ['veicoli', 'Veicoli'],
      ['utenti', 'Utenti'], ['permessi', 'Permessi'], ['impostazioni', 'Impostazioni'],
      // Fase 7 (§12.6): il filtro Portale (pubblicazioni, file dal cliente, accessi dati, da guardare).
      ['portale', 'Portale']];
    const PERIODI = [['oggi', 'Oggi'], ['7', 'Ultimi 7 giorni'], ['30', 'Ultimi 30 giorni'], ['', 'Da sempre']];

    /** Fase 6 (§5.7): il filtro "Dati riservati" del registro, solo per il titolare: chi ha visto, scaricato, cambiato o esportato dati riservati. */
    const vedeRegistroRiservati = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'titolare' && S.io.interfaccia && S.io.interfaccia.vedeRiservati);
    function domandaRegistro(pagina) {
      const f = M.filtri;
      const p = R.periodo(f.periodo);
      if (f.tabella === 'riservati') return '/server/accessiRiservati?' + ['da=' + p.da, 'a=' + p.a, 'utente=' + encodeURIComponent(f.utente), 'pagina=' + pagina].join('&');
      const q = ['da=' + p.da, 'a=' + p.a, 'utente=' + encodeURIComponent(f.utente), 'tabella=' + encodeURIComponent(f.tabella), 'pagina=' + pagina];
      return '/server/registro?' + q.join('&');
    }

    function registro(pagina) {
      const f = M.filtri;
      const utenti = S.ana.utenti;
      const nomeUtente = id => { const u = utenti.find(x => String(x.id) === String(id)); return u ? u.nome : 'Tutte le persone'; };
      const filtro = (testo, voci, scelto, fn) => {
        const b = h('button', { type: 'button', class: 'btn piccolo filtro' + (scelto ? ' acceso' : '') }, testo);
        b.addEventListener('click', () => apriMenu(b, voci.map(v => ({ testo: v[1], scelta: String(v[0]) === String(scelto), fn: () => fn(v[0]) }))));
        return b;
      };
      const area = h('div', { class: 'sezione' });
      const esporta = h('button', { type: 'button', class: 'btn collegamento', onclick: async () => {
        const p = R.periodo(f.periodo);
        const ris = await lavora('Preparo il file', () => Rete.post('/server/esporta', { cosa: 'registro', da: p.da, a: p.a, utente: f.utente, tabella: f.tabella }));
        if (ris) salvaEsportazione(ris, 'registro');
      } }, 'Esporta per Excel');
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Registro attività'), esporta),
        h('div', { class: 'stretta-820 sezione' },
          h('div', { class: 'filtri' },
            filtro(f.utente ? nomeUtente(f.utente) : 'Tutte le persone', [['', 'Tutte le persone']].concat(utenti.map(u => [u.id, u.nome])), f.utente, x => { f.utente = x; W.disegnaPagina(); }),
            filtro((TABELLE.concat([['riservati', 'Dati riservati']]).find(t => t[0] === f.tabella) || TABELLE[0])[1], vedeRegistroRiservati() ? TABELLE.concat([['riservati', 'Dati riservati']]) : TABELLE, f.tabella, x => { f.tabella = x; W.disegnaPagina(); }),
            filtro((PERIODI.find(t => t[0] === f.periodo) || PERIODI[1])[1], PERIODI, f.periodo, x => { f.periodo = x; W.disegnaPagina(); })),
          area)]);
      const voci = [];
      let numero = 0;
      const altri = async () => {
        const fondo = area.querySelector('.fondo-registro');
        if (fondo) fondo.remove();
        if (numero === 0) aggiungi(area, [segnaposto(4, 70)]);
        let ris;
        try {
          ris = await Rete.get(domandaRegistro(numero + 1));
        } catch (e) {
          if (e.accesso === false) return;
          aggiungi(svuota(area), [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e)),
            h('button', { type: 'button', class: 'btn piccolo', onclick: () => { numero = 0; voci.length = 0; svuota(area); altri(); } }, 'Riprova'))]);
          return;
        }
        // Le righe degli accessi ai dati riservati hanno già la frase: "Manuel ha visto i dati riservati della scheda di Marco Rossato".
        const righe = f.tabella === 'riservati' ? (ris.righe || []).map(x => ({ quando: x.quando, utente: x.utente, frase: String(x.frase || '').replace(/^./, c => c.toLowerCase()) + (x.persona ? ' di ' + x.persona : '') + (x.disp ? ' · ' + x.disp : ''), riservato: true }))
          : (ris.righe || ris.voci || []);
        voci.push.apply(voci, righe);
        numero += 1;
        disegnaRegistro(area, voci, ris.altre !== undefined ? !!ris.altre : (ris.pagina || 1) < (ris.pagine || 1), altri);
      };
      altri();
    }

    function disegnaRegistro(area, voci, ancora, altri) {
      svuota(area);
      if (!voci.length) { aggiungi(area, [h('p', { class: 'vuoto' }, 'Niente per questi filtri.')]); return; }
      R.raggruppaPerGiorno(voci).forEach(g => {
        aggiungi(area, [h('div', { class: 'giorno-registro' }, h('span', { class: 'etichetta' }, g.giorno),
          h('div', { class: 'scheda voci-registro' }, g.voci.map(v => {
            const pezzi = R.fraseRegistro(v, nomeRiga);
            const pd = R.primaDopo(v);
            const chi = (v.utente && (v.utente.nome || v.utente)) || v.chi || '?';
            return h('button', { type: 'button', class: 'voce-reg', onclick: () => dettaglio(v) },
              h('span', { class: 'cerchio-io piccolo' }, B.lettere(chi)),
              h('span', { class: 'testi' },
                h('span', { class: 'frase' }, pezzi.map(p => p.forte ? h('b', null, p.testo) : p.testo)),
                pd ? h('span', { class: 'prima-dopo' }, pd.prima ? [h('s', null, pd.prima), icona('freccia', 14, 2.4)] : null, h('ins', null, pd.dopo || '—')) : null,
                h('span', { class: 'quando' }, R.quando(v.quando))));
          })))]);
      });
      aggiungi(area, [ancora
        ? h('div', { class: 'fondo-registro' }, h('button', { type: 'button', class: 'btn', onclick: altri }, 'Mostra altri'))
        : h('div', { class: 'fondo-registro inizio' }, 'Inizio del registro')]);
    }

    /**
     * Il nome della riga di una voce del registro: il server scrive solo il codice
     * (C002, 26ST044, 3): il nome lo si legge dalle anagrafiche che si hanno.
     */
    function nomeRiga(v) {
      const id = String(v.idRiga || '');
      const x = (v.dopo && typeof v.dopo === 'object' ? v.dopo : null) || (v.prima && typeof v.prima === 'object' ? v.prima : null) || {};
      const trova = (lista, campo) => (lista.find(r => String(r.id) === id) || {})[campo || 'nome'];
      switch (v.tabella) {
        case 'soggetti': return trova(S.ana.soggetti) || x.nome || id;
        case 'commesse': case 'commessa_persone': { const m = W.commessa(id); return m ? m.descrizione + ' (' + m.id + ')' : x.descrizione || id; }
        case 'progetti': { const p = (S.ana.progetti || []).find(r => String(r.id) === id); return p ? p.codice + ' · ' + p.descrizione : x.codice || id; }
        case 'prestazioni': return trova(S.ana.prestazioni) || x.nome || id;
        case 'referenti': return trova(S.ana.referenti) || x.nome || id;
        case 'sedi': return trova(S.ana.sedi) || x.nome || id;
        case 'utenti': return trova(S.ana.utenti) || x.nome || id;
        case 'sessioni': { const u = S.ana.utenti.find(r => String(r.id) === String(x.utente_id)); return u ? u.nome : ''; }
        case 'numerazioni': return ({ commessa: 'Commesse', rapportino: 'Rapportini' })[id] || id;
        case 'file': return x.nome || id;
        default: return id;
      }
    }

    /** Tutti i campi cambiati in una voce: prima e dopo. */
    function dettaglio(v) {
      const campi = R.campiCambiati(v.prima, v.dopo, v.tabella, v.idRiga);
      const pezzi = R.fraseRegistro(v, nomeRiga);
      let chiudi;
      chiudi = finestra({
        titolo: 'Cosa è cambiato', fuoco: false,
        corpo: [h('p', { class: 'testo-forte' }, pezzi.map(p => p.forte ? h('b', null, p.testo) : p.testo)),
          h('div', { class: 'secondario' }, [R.quando(v.quando), v.disp || v.dispNome || ''].filter(Boolean).join(' · ')),
          campi.length ? h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: '1fr 1fr 1fr' } }, h('span', null, 'Campo'), h('span', null, 'Prima'), h('span', null, 'Dopo')),
            campi.map(c => h('div', { class: 'r', style: { gridTemplateColumns: '1fr 1fr 1fr' } }, h('span', { class: 'forte' }, c.nome),
              h('span', { class: 't2' }, c.prima ? h('s', null, c.prima) : '—'), h('span', null, c.dopo || '—')))) : null],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn giallo grande', onclick: () => chiudi() }, 'Chiudi')],
      });
    }

    // ===================================================================== copie ed esportazioni

    /** L'ultima copia: la prima dell'elenco del server. */
    function ultimaCopia(ris) {
      return ris ? ris.ultima || (ris.copie || [])[0] || null : null;
    }

    /** Una copia è andata male se la copia sul NAS o quella fuori casa dicono "errore". */
    function copiaMale(c) {
      return !!c && (/^errore/.test(String(c.locale || '')) || /^errore/.test(String(c.fuori || '')) || (c.esito && c.esito !== 'ok'));
    }

    /** "Sul NAS e fuori casa, su Drive · il foglio è aggiornato" */
    function doveCopia(c) {
      if (c.dove) return [c.dove, c.foglio === true ? 'il foglio è aggiornato' : ''].filter(Boolean).join(' · ');
      const ok = x => /^ok/.test(String(x || ''));
      const parti = [ok(c.locale) ? (ok(c.fuori) ? 'Sul NAS e fuori casa, su Drive' : 'Sul NAS') : ''];
      if (!ok(c.fuori) && /non collegato/.test(String(c.fuori || ''))) parti.push('la copia fuori casa non è collegata');
      if (ok(c.foglio)) parti.push('il foglio è aggiornato');
      return parti.filter(Boolean).join(' · ');
    }

    /** Cosa non ha funzionato, a parole. */
    function erroreCopia(c) {
      const e = [/^errore/.test(String(c.locale || '')) ? 'Sul NAS: ' + String(c.locale).replace(/^errore:\s*/, '') : '',
        /^errore/.test(String(c.fuori || '')) ? 'Fuori casa: ' + String(c.fuori).replace(/^errore:\s*/, '') : ''].filter(Boolean);
      return e.join(' · ') || c.messaggio || 'La copia non è riuscita';
    }

    function descriviCopia(u) {
      if (!u || !u.quando) return 'Nessuna copia ancora';
      if (copiaMale(u)) return 'L\'ultima copia non è riuscita';
      const d = new Date(u.quando);
      const ora = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
      const oggi = R.isoGiorno(new Date()) === R.isoGiorno(d);
      return oggi && d.getHours() < 7 ? 'Copia di stanotte fatta alle ' + ora : 'Copia fatta ' + R.quando(u.quando);
    }

    /** Il CSV del server si salva con la finestra Salva di Windows. */
    async function salvaEsportazione(ris, cosa) {
      if (S.esempio) { avviso('Nella visita non si salva niente'); return; }
      const nome = ris.nome || R.nomeEsportazione(cosa);
      const fatto = await lavora('Salvo il file', () => Api.post('/locale/salva-file', { nome, testo: ris.csv || ris.testo || '', base64: ris.base64 || '' }));
      if (fatto && fatto.ok) avviso('Salvato in ' + fatto.percorso);
    }

    function copie(pagina) {
      const area = h('div', { class: 'stretta-720 sezione' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Copie ed esportazioni')), area]);
      leggi(area, 'copie', '/server/copie', ris => {
        const u = ultimaCopia(ris);
        const male = copiaMale(u);
        const quando = u && u.quando ? descriviCopia(u).replace('Copia di stanotte fatta alle', 'Stanotte alle').replace('Copia fatta ', '') : '';
        aggiungi(area, [
          h('div', { class: 'scheda ultima-copia' + (male ? ' male' : '') },
            h('span', { class: 'etichetta' }, 'Ultima copia'),
            u ? h('div', { class: 'grande' }, h('span', { class: 'scudo' }, icona(male ? 'avviso' : 'scudo', 22, 2.2)), male ? 'Non è riuscita' : quando.charAt(0).toUpperCase() + quando.slice(1)) : h('div', { class: 'grande' }, 'Nessuna copia ancora'),
            u ? h('span', { class: 'sotto-titolo' }, male ? erroreCopia(u) : doveCopia(u)) : null,
            male && scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: copiaAdesso }, 'Riprova')) : null),
          scrive() ? h('div', null, h('button', { type: 'button', class: 'btn grande', onclick: copiaAdesso }, 'Fai una copia adesso')) : null,
          (ris.copie || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Le copie'), h('div', { class: 'scheda righe' }, ris.copie.slice(0, 12).map(c => riga({
            sinistra: quadrato('scudo'), titolo: R.quando(c.quando).replace(/^./, x => x.toUpperCase()),
            sotto: [c.file || c.nome, c.byte ? C.numero(Math.round(c.byte / 100000) / 10) + ' MB' : '', copiaMale(c) ? 'non riuscita' : c.nota === 'a mano' ? 'fatta a mano' : c.nota || c.dove].filter(Boolean).join(' · '),
          })))) : null,
          h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Esporta per Excel'), h('div', { class: 'scheda righe' },
            [puo('rapportini') ? ['rapportini', 'Rapportini', W.nRapportini(W.attivi().length)] : null,
              puo('clienti') ? ['clienti', 'Clienti', S.ana.clienti.filter(c => !c.archiviato).length + ' clienti'] : null,
              puo('clienti') ? ['fornitori', 'Fornitori', S.ana.fornitori.filter(c => !c.archiviato).length + ' fornitori'] : null,
              puo('commesse') ? ['commesse', 'Commesse', S.ana.commesse.filter(m => !m.modello).length + ' commesse'] : null,
              // fase 2 e 3: lo stesso CSV, coi periodi di base degli elenchi
              puo('preventivi') ? ['preventivi', 'Preventivi', 'Tutti i preventivi'] : null,
              puo('attivita') ? ['attivita', 'Attività', 'Le attività aperte'] : null,
              puo('rapportini') ? ['ore', 'Ore', 'Le ore di questa settimana'] : null,
              puo('spese') ? ['spese', 'Spese', 'Le spese di questo mese'] : null,
              puo('spese') ? ['trasferte', 'Trasferte', 'Le trasferte di questo mese'] : null,
              puo('spese') ? ['rimborsi', 'Rimborsi', 'I rimborsi da fare'] : null].filter(Boolean).map(x => riga({
              sinistra: quadrato('scarica'), titolo: x[1], sotto: x[2], onclick: () => W.esporta(x[0]), freccia: false,
            }))))]);
      });
    }

    async function copiaAdesso() {
      const ris = await lavora('Faccio la copia', () => Rete.post('/server/copiaAdesso'));
      if (!ris) return;
      M.copie = null;
      avviso('Copia fatta');
      W.disegnaPagina();
    }

    // ===================================================================== cestino

    function cestino(pagina) {
      const area = h('div', { class: 'stretta-720 sezione' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Cestino')), area]);
      leggi(area, 'cestino', '/server/cestino', ris => {
        const lista = ris.file || [];
        if (!lista.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Il cestino è vuoto.')]); return; }
        aggiungi(area, [h('div', { class: 'scheda righe' }, lista.map(f => riga({
          sinistra: quadrato('cestino'), titolo: f.nome || f.id,
          sotto: [f.idRapportino ? 'da ' + f.idRapportino : f.idCommessa ? 'da ' + f.idCommessa : '', f.cestinato ? 'tolto ' + R.quando(f.cestinato) : ''].filter(Boolean).join(' · '),
          destra: scrive() ? h('button', { type: 'button', class: 'btn', onclick: async () => {
            const r = await lavora('Ripristino', () => Rete.post('/server/ripristinaFile', { id: f.id }));
            if (!r) return;
            M.cestino = null;
            avviso((f.nome || 'Il file') + ' è tornato al suo posto');
            W.disegnaPagina();
          } }, 'Ripristina') : null,
        })))]);
      });
    }

    // ===================================================================== l'app

    function app(pagina) {
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
      // "Da fuori: Google · In casa: 192.168.1.51 · ultimo contatto alle 10:42 in ufficio" (porta-google.md §8.6). La
      // strada cambia mentre si lavora: si richiede al programma aprendo la pagina.
      const Coll = window.WisperCollegamento;
      const fraseCollegamento = h('span', { class: 'frase-collegamento' }, Coll.frase(loc));
      if (!S.esempio) Api.get('/locale/stato').then(st => { S.locale = st; fraseCollegamento.textContent = Coll.frase(st); }).catch(() => null);
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'L\'app')),
        h('div', { class: 'stretta-820' }, h('div', { class: 'scheda' },
          h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Tema')), zonaTema),
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

    return { vista };
  };
})(window);
