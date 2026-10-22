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
      { k: 'utenti', titolo: 'Utenti', icona: 'clienti' },
      { k: 'permessi', titolo: 'Ruoli e permessi', icona: 'scudo' },
      { k: 'numerazioni', titolo: 'Numerazioni', icona: 'numero' },
      { k: 'tariffe', titolo: 'Tariffe e rimborsi', icona: 'fatturazione', soldi: true },
      // fase 2: IVA, contributo EPPI, validità e condizioni dei preventivi
      { k: 'fisco', titolo: 'Fisco e preventivi', icona: 'preventivo', soldi: true },
      // fase 3: il veicolo, il suo euro al km (tabelle ACI dell'anno), l'indennità di trasferta
      { k: 'veicoli', titolo: 'Veicoli e rimborso km', icona: 'auto', modulo: 'spese' },
      { k: 'registro', titolo: 'Registro attività', icona: 'lista' },
      { k: 'copie', titolo: 'Copie ed esportazioni', icona: 'scarica' },
      { k: 'cestino', titolo: 'Cestino', icona: 'cestino', scrive: true },
      { k: 'app', titolo: 'L\'app', icona: 'app' },
    ];

    function vista(pagina, sotto, id) {
      // Cambiando pagina si rilegge: utenti, copie e cestino possono essere cambiati da un altro computer.
      const dove = sotto + '/' + (id || '');
      if (M.dove !== dove) { M.utenti = null; M.permessi = null; M.copie = null; M.cestino = null; M.veicoli = null; M.sessioni = {}; M.dove = dove; }
      if (sotto && sotto !== 'app' && !puo('amministrazione')) { aggiungi(pagina, [h('div', { class: 'calmo grande' }, icona('scudo', 22, 2.2), 'Non hai il permesso per vedere questa pagina. Chiedi a ' + W.titolare() + '.')]); return; }
      if (((sotto === 'tariffe' || sotto === 'fisco') && !soldi()) || (sotto === 'cestino' && !scrive()) || (sotto === 'veicoli' && !puo('spese'))) { aggiungi(pagina, [h('div', { class: 'calmo grande' }, icona('scudo', 22, 2.2), 'Non hai il permesso per vedere questa pagina. Chiedi a ' + W.titolare() + '.')]); return; }
      const fn = { studio, utenti: id ? paginaUtente : elencoUtenti, permessi, numerazioni, tariffe, fisco, veicoli, registro, copie, cestino, app }[sotto];
      if (!fn) { elenco(pagina); return; }
      if (sotto !== 'app' || puo('amministrazione')) {
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
        app: 'Tema, visita guidata, versione' + (S.versione ? ' ' + S.versione : ''),
      };
      const lista = h('div', { class: 'scheda righe' }, PAGINE.filter(p => (!p.soldi || soldi()) && (!p.scrive || scrive()) && (!p.modulo || puo(p.modulo)) && (p.k === 'app' || puo('amministrazione'))).map(p => riga({
        sinistra: quadrato(p.icona), titolo: p.titolo, sotto: stato[p.k], onclick: () => W.vai('#amministrazione/' + p.k),
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
          h('div', { class: 'scheda' }, h('h2', null, 'Imposte e contributi'),
            h('div', { class: 'fila' },
              h('div', { class: 'riga-campi' }, input('IVA', 'IVA', '%'), input('EPPI_INTEGRATIVO', 'Contributo integrativo EPPI', '%'), input('RITENUTA', 'Ritenuta d\'acconto', '%')),
              sola ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => salvaImpostazioni(campi, ['IVA', 'EPPI_INTEGRATIVO', 'RITENUTA'],
                'Salvato. Vale per i preventivi nuovi: quelli già scritti tengono IVA e contributo con cui sono nati') }, 'Salva')))),
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

    // ===================================================================== utenti

    function nomeRuolo(r) { return (R.RUOLI[r] || { nome: r || '' }).nome; }

    function elencoUtenti(pagina) {
      const area = h('div', { class: 'stretta-820' });
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', { class: 'spazio' }, 'Utenti'),
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: nuovoUtente }, icona('piu', 18, 2.6), 'Nuovo utente') : null), area]);
      leggi(area, 'utenti', '/server/utenti', ris => {
        const lista = (ris.utenti || []).slice().sort((a, b) => R.ORDINE_RUOLI.indexOf(a.ruolo) - R.ORDINE_RUOLI.indexOf(b.ruolo) || String(a.nome).localeCompare(String(b.nome), 'it'));
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
          h('div', { class: 'scheda' }, h('h2', null, 'Ruolo'),
            h('div', { class: 'fila' }, scelteRuolo(u.ruolo, k => cambiaRuolo(u, k), !puoCambiare),
              ultimo ? h('div', { class: 'secondario' }, 'È l\'ultimo titolare: non si può disattivare né cambiare ruolo.') : null)),
          scrive() ? h('div', { class: 'scheda righe' },
            riga({ sinistra: quadrato('chiave'), titolo: 'Password', destra: h('button', { type: 'button', class: 'btn', onclick: () => nuovaPassword(u) }, 'Nuova password') }),
            ultimo || io ? null : riga({ sinistra: quadrato('esci'), titolo: u.attivo === false ? 'Disattivato' : 'Accesso attivo',
              sotto: u.attivo === false ? 'Non può entrare' : (u.dispositivi ? (u.dispositivi === 1 ? 'Collegato da 1 dispositivo' : 'Collegato da ' + u.dispositivi + ' dispositivi') : 'Nessun dispositivo collegato'),
              destra: h('button', { type: 'button', class: 'btn', onclick: () => attiva(u, u.attivo === false) }, u.attivo === false ? 'Riattiva' : 'Disattiva') })) : null,
          scrive() ? h('div', { class: 'sezione' }, h('h2', null, 'Dispositivi collegati'), dispositivi(u)) : null]);
      });
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
        aggiungi(area, [
          segmenti(R.ORDINE_RUOLI.map(k => [k, R.RUOLI[k].nome]), r, k => { M.ruoloPerm = k; W.disegnaPagina(); }),
          h('div', { class: 'scheda intro-ruolo' }, h('b', null, R.RUOLI[r].nome), h('span', { class: 'sotto-titolo' }, R.RUOLI[r].frase + (r === 'titolare' ? ' Il titolare ha sempre tutto.' : ''))),
          h('div', { class: 'scheda righe-permessi' }, R.RIGHE_PERMESSI.map(m => {
            const l = R.livello(tabella[r], m.modulo);
            return h('div', { class: 'riga-perm' },
              h('div', { class: 'testi' }, h('div', { class: 'nome-m' }, m.nome), h('div', { class: 'spiega' }, m.spiega)),
              h('div', { class: 'liv' + (bloccato ? ' bloccato' : ''), role: 'group', 'aria-label': m.nome },
                R.LIVELLI.map((t, i) => h('button', { type: 'button', class: 'l' + i, 'aria-pressed': l === i ? 'true' : 'false', disabled: bloccato,
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
        })) : h('p', { class: 'vuoto' }, 'Il server non ha ancora mandato le numerazioni.')]);
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

    const TABELLE = [['', 'Tutto'], ['soggetti', 'Clienti e fornitori'], ['commesse', 'Commesse'], ['prestazioni', 'Prestazioni'], ['rapportini', 'Rapportini'],
      ['ore', 'Ore'], ['spese', 'Spese'], ['trasferte', 'Trasferte'], ['veicoli', 'Veicoli'],
      ['utenti', 'Utenti'], ['permessi', 'Permessi'], ['impostazioni', 'Impostazioni']];
    const PERIODI = [['oggi', 'Oggi'], ['7', 'Ultimi 7 giorni'], ['30', 'Ultimi 30 giorni'], ['', 'Da sempre']];

    function domandaRegistro(pagina) {
      const f = M.filtri;
      const p = R.periodo(f.periodo);
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
            filtro((TABELLE.find(t => t[0] === f.tabella) || TABELLE[0])[1], TABELLE, f.tabella, x => { f.tabella = x; W.disegnaPagina(); }),
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
        voci.push.apply(voci, ris.righe || ris.voci || []);
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
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'L\'app')),
        h('div', { class: 'stretta-820' }, h('div', { class: 'scheda' },
          h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Tema')), zonaTema),
          h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Visita guidata'), h('span', null, 'Da capo, coi dati di esempio')),
            h('button', { type: 'button', class: 'btn', onclick: () => W.iniziaVisita() }, 'Rifai la visita guidata')),
          loc.cartellaPdf ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'I PDF'), h('span', null, loc.cartellaPdf)),
            h('button', { type: 'button', class: 'btn', onclick: () => Api.post('/locale/cartella-pdf').catch(() => null) }, 'Apri la cartella')) : null,
          loc.server ? h('div', { class: 'voce-imp' }, h('span', { class: 'testi' }, h('b', null, 'Server'), h('span', null, loc.server.replace(/^https?:\/\//, ''))),
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
