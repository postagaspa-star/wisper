/*
 * Wisper Ufficio: Spese e trasferte (docs/gestionale/fase3.md §5, prototipo
 * docs/prototipo/Gestionale-fase3.html, vista Computer; risposte in architettura.md §14.8-14.10).
 *
 *  - il mese con ‹ ›, tre riquadri (Al cliente · Allo studio · Da rimborsare),
 *    segmenti Spese · Trasferte · Rimborsi; righe con l'icona della categoria e la
 *    pillola di A chi va (Al cliente blu, Allo studio grigia, Mia viola);
 *  - Nuova spesa: una finestra con la foto dello scontrino a sinistra (da un file o
 *    trascinandola), importo, categoria, data, commessa, A chi va, "Il documento è
 *    intestato al cliente", L'ho pagata io, descrizione;
 *  - Trasferta: dal/al, destinazione, motivo, commessa, km con Andata e ritorno,
 *    veicolo col suo euro al km, indennità; il rimborso si vede subito;
 *  - Rimborsi per persona con Segna rimborsato (titolare e amministrazione);
 *  - Riepiloghi (#spese/riepiloghi) per persona, commessa, categoria, del mese o
 *    dell'anno, con le esportazioni.
 * I soldi della persona (importi delle spese, rimborsi) si vedono anche senza "costi":
 * li manda il server (§14.1).
 */
(function (radice) {
  'use strict';

  radice.WisperSpese = function (W) {
    const { S, C, B, Rete } = W;
    const RO = radice.WisperRegoleOreSpese;
    const { h, aggiungi, svuota, icona, tondo, pillola, avviso, lavora, finestra, campo, conSuffisso, selezione, segmenti, segnaposto, riga, quadrato } = B;
    const puo = W.puo;
    const scrive = () => puo('spese', 2);
    const oggi = () => C.oggiIso();
    const io = () => (S.io && S.io.utente && S.io.utente.id) || null;
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const soloSuoi = () => !!interfaccia().soloSuoi || !!(S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore');

    const M = {
      segmento: 'spese', mese: '', persona: '', spese: null, trasferte: null, chiave: '', rimborsi: null, veicoli: null,
      riep: null, riepChiave: '', per: 'persona', periodo: 'mese', apri: null,
    };

    const persone = () => S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'lettura');
    const nomeDi = id => (S.ana.utenti.find(u => String(u.id) === String(id)) || { nome: '' }).nome;
    const primo = nome => String(nome || '').split(' ')[0];
    const meseVisto = () => M.mese || oggi().slice(0, 7);
    const commesseAperte = () => S.ana.commesse.filter(m => m.stato === 'APERTA' && !m.archiviata && !m.modello);
    const mostraPersona = () => !soloSuoi() && !M.persona;

    // Uno scontrino trascinato fuori dalla sua zona non deve far aprire il file al posto di Wisper.
    document.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) e.preventDefault(); });
    document.addEventListener('drop', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) e.preventDefault(); });

    // ===================================================================== dati

    function daRileggere() { M.spese = null; M.trasferte = null; M.rimborsi = null; M.riep = null; }

    async function leggiMese() {
      const mese = meseVisto();
      const p = RO.periodoMese(mese);
      const chiave = mese + '|' + M.persona;
      const q = 'da=' + p.da + '&a=' + p.a + (M.persona ? '&utente=' + encodeURIComponent(M.persona) : '');
      const lavori = [];
      if (!M.spese || !M.trasferte || M.chiave !== chiave) {
        lavori.push(Promise.all([Rete.get('/server/spese?' + q), Rete.get('/server/trasferte?' + q)]).then(([s, t]) => { M.spese = s; M.trasferte = t; M.chiave = chiave; }));
      }
      if (M.segmento === 'rimborsi' && !M.rimborsi) lavori.push(Rete.get('/server/rimborsi' + (M.persona ? '?utente=' + encodeURIComponent(M.persona) : '')).then(r => { M.rimborsi = r; }));
      await Promise.all(lavori);
    }

    async function leggiVeicoli() {
      if (M.veicoli) return M.veicoli;
      try { M.veicoli = await Rete.get('/server/veicoli'); } catch (e) { M.veicoli = { veicoli: [] }; }
      return M.veicoli;
    }

    function conDati(pagina, prepara, disegna) {
      const zona = h('div', { class: 'sezione' }, segnaposto(4, 64));
      aggiungi(pagina, [zona]);
      prepara().then(() => { zona.remove(); disegna(); }).catch(e => {
        if (e && e.accesso === false) return;
        aggiungi(svuota(zona), [h('div', { class: e && e.rete ? 'banda calma' : 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, (e && e.message) || String(e)),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.disegnaPagina() }, 'Riprova'))]);
      });
    }

    // ===================================================================== la pagina

    function vista(pagina, a1, filtro) {
      if (filtro) {
        if (filtro.segmento) M.segmento = filtro.segmento;
        if (filtro.id) M.apri = { segmento: filtro.segmento || 'spese', id: filtro.id };
      }
      if (a1 === 'riepiloghi') { conDati(pagina, leggiRiepilogo, () => riepiloghi(pagina)); return; }
      const mese = meseVisto();
      const sposta = d => { M.mese = RO.spostaMese(mese, d); W.disegnaPagina(); };
      aggiungi(pagina, [h('div', { class: 'testata alta' },
        h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Spese e trasferte'),
          h('div', { class: 'titolo-mese' }, h('h1', null, C.nomeMese(mese)), tondo('indietro', 'Mese prima', () => sposta(-1)), tondo('avanti', 'Mese dopo', () => sposta(1)))),
        h('div', { class: 'azioni-testa' },
          h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#spese/riepiloghi') }, 'Riepiloghi'),
          scrive() ? h('button', { type: 'button', class: 'btn giallo', 'data-visita': 'nuova-spesa', onclick: () => moduloSpesa(null) }, icona('foto', 18, 2.4), 'Nuova spesa') : null))]);
      conDati(pagina, leggiMese, () => corpo(pagina));
    }

    function corpo(pagina) {
      const ts = (M.spese && M.spese.totali) || {};
      const tt = (M.trasferte && M.trasferte.totali) || {};
      const daRimborsare = Math.round((C.num(ts.daRimborsare) + C.num(tt.daRimborsare)) * 100) / 100;
      const nSpese = d => (M.spese.spese || []).filter(s => s.destinazione === d && s.stato !== 'respinta').length;
      const conta = n => (n === 1 ? '1 spesa' : n + ' spese');
      aggiungi(pagina, [h('div', { class: 'tre-colonne' },
        W.riquadro('Al cliente', C.euro(ts.cliente), conta(nSpese('cliente')) + (ts.senzaFoto ? ' · ' + ts.senzaFoto + ' senza scontrino' : '')),
        W.riquadro('Allo studio', C.euro(ts.studio), conta(nSpese('studio'))),
        W.riquadro('Da rimborsare', C.euro(daRimborsare), C.num(tt.daRimborsare) ? 'spese e trasferte' : 'spese pagate di tasca propria', { 'data-visita': 'da-rimborsare' }))]);

      const filtri = h('div', { class: 'filtri' },
        segmenti([['spese', 'Spese · ' + (M.spese.spese || []).length], ['trasferte', 'Trasferte · ' + (M.trasferte.trasferte || []).length], ['rimborsi', 'Rimborsi']], M.segmento, x => { M.segmento = x; W.disegnaPagina(); }),
        !soloSuoi() && persone().length > 1 ? selezione([['', 'Tutte le persone']].concat(persone().map(u => [u.id, u.nome])), M.persona, x => { M.persona = x; daRileggere(); W.disegnaPagina(); }, { 'aria-label': 'Di chi' }) : null,
        h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn collegamento', onclick: esportaSegmento }, 'Esporta per Excel'));
      const area = h('div', { class: 'sezione stretta-900' });
      aggiungi(pagina, [filtri, area]);
      if (M.segmento === 'trasferte') elencoTrasferte(area);
      else if (M.segmento === 'rimborsi') elencoRimborsi(area);
      else elencoSpese(area);

      // Arrivando dalla Dashboard su una spesa o una trasferta precisa: si apre.
      if (M.apri) {
        const a = M.apri;
        M.apri = null;
        const x = a.segmento === 'trasferte' ? (M.trasferte.trasferte || []).find(t => String(t.id) === String(a.id)) : (M.spese.spese || []).find(s => String(s.id) === String(a.id));
        if (x) { if (a.segmento === 'trasferte') moduloTrasferta(x); else moduloSpesa(x); }
      }
    }

    function esportaSegmento() {
      const p = RO.periodoMese(meseVisto());
      const filtri = M.segmento === 'rimborsi' ? {} : { da: p.da, a: p.a };
      if (M.persona) filtri.utente = M.persona;
      W.esporta(M.segmento === 'trasferte' ? 'trasferte' : M.segmento === 'rimborsi' ? 'rimborsi' : 'spese', filtri);
    }

    // ===================================================================== spese

    function elencoSpese(area) {
      const lista = M.spese.spese || [];
      if (!lista.length) {
        aggiungi(area, [h('p', { class: 'vuoto' }, 'Nessuna spesa a ' + C.nomeMese(meseVisto()).split(' ')[0].toLowerCase() + '.')]);
        return;
      }
      aggiungi(area, [h('div', { class: 'scheda righe', 'data-visita': 'elenco-spese' }, lista.map(rigaSpesa))]);
    }

    function rigaSpesa(s) {
      const cat = RO.categoria(s.categoria);
      const dest = RO.destinazione(s.destinazione);
      const st = RO.pillolaStato(s);
      const mia = String(s.idUtente) === String(io());
      const sotto = [mostraPersona() ? primo(s.utente || nomeDi(s.idUtente)) : '', s.idCommessa || s.cliente || 'Senza commessa', RO.giornoBreve(s.data).toLowerCase(),
        s.idRapportino ? 'nel ' + s.idRapportino : '', s.idTrasferta ? 'trasferta' : '',
        s.pagataDaMe ? 'pagata da ' + (mia ? 'me' : primo(s.utente || nomeDi(s.idUtente))) : '', s.anticipazione ? 'anticipazione' : '',
        !(s.foto || []).length ? 'senza scontrino' : '', s.rimborsataIl ? 'rimborsata il ' + C.data(s.rimborsataIl) : ''].filter(Boolean).join(' · ');
      const respinta = s.stato === 'respinta';
      return riga({
        sinistra: quadrato(cat.icona), titolo: s.descrizione || cat.nome,
        sotto: respinta && s.motivoRifiuto ? [sotto, h('span', { class: 'motivo-rifiuto' }, 'Motivo: ' + s.motivoRifiuto)] : sotto,
        destra: h('span', { class: 'pillole-destra' }, h('span', { class: 'quanto' }, C.euro(s.importo)), pillola(dest.parola, dest.colore), st ? pillola(respinta ? 'Respinta' : st.testo, st.colore) : null),
        onclick: () => moduloSpesa(s), freccia: false,
      });
    }

    /** Legge un file trascinato (o scelto) come base64. */
    function leggiFile(file) {
      return new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => { const s = String(r.result || ''); ok({ nome: file.name, mime: file.type || 'image/jpeg', base64: s.slice(s.indexOf(',') + 1), anteprima: s }); };
        r.onerror = () => no(new Error('Non riesco a leggere il file'));
        r.readAsDataURL(file);
      });
    }

    /**
     * Nuova spesa (e correggi): la foto a sinistra, i campi a destra. Di una spesa di un
     * rapportino già firmato si cambiano solo categoria, descrizione e chi l'ha pagata
     * (soloCampi del server); una spesa rimborsata, fatturata o approvata (per il
     * collaboratore) è bloccata.
     */
    function moduloSpesa(esistente, base) {
      const b = base || {};
      const s = esistente ? JSON.parse(JSON.stringify(esistente)) : {
        id: null, data: b.data || oggi(), importo: '', categoria: b.categoria || 'altro', descrizione: '', idCommessa: b.idCommessa || '', idCliente: b.idCliente || '',
        idTrasferta: b.idTrasferta || null, idRapportino: '', destinazione: b.destinazione || null, anticipazione: false, pagataDaMe: true, foto: [], idUtente: b.idUtente || null,
      };
      const soloCampi = esistente && Array.isArray(esistente.soloCampi) ? esistente.soloCampi : null;
      const sola = esistente ? (!scrive() || esistente.puoScrivere === false || (!!esistente.bloccata && !soloCampi)) : !scrive();
      const spento = campoNome => sola || (soloCampi ? soloCampi.indexOf(campoNome) < 0 : false);
      const m = {
        categoria: s.categoria || 'altro', idCommessa: s.idCommessa || '', idCliente: s.idCommessa ? '' : (s.idCliente || ''),
        destinazione: s.destinazione || RO.destinazioneDiBase(s), destToccata: !!esistente, anticipazione: !!s.anticipazione, pagataDaMe: !!s.pagataDaMe,
        foto: (s.foto || []).slice(), togliere: [], nuova: null, idUtente: s.idUtente || io(),
      };
      const v = {
        importo: h('input', { type: 'text', inputmode: 'decimal', class: 'importo-grande', value: s.importo !== '' && s.importo !== null && s.importo !== undefined && C.num(s.importo) ? C.num(s.importo).toFixed(2).replace('.', ',') : '', disabled: spento('importo'), autocomplete: 'off', 'aria-label': 'Importo' }),
        data: h('input', { type: 'date', value: s.data || oggi(), disabled: spento('data') }),
        descrizione: h('input', { type: 'text', value: s.descrizione || '', disabled: spento('descrizione'), autocomplete: 'off' }),
      };
      let errori = {};
      const zone = { foto: h('div', { class: 'foto-spesa' }), categoria: h('div'), legami: h('div', { class: 'riga-campi' }), dest: h('div', { class: 'fila' }), chi: h('div'), importo: h('div') };

      // ---- la foto dello scontrino: da un file o trascinata qui
      const prendi = async f => {
        if (!f) return;
        if (!/^image\/|^application\/pdf$/.test(f.mime || '')) { avviso('Lo scontrino deve essere una foto o un PDF', true); return; }
        m.nuova = f;
        disegnaFoto();
      };
      const scegli = async () => {
        const f = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null);
        if (!f || !f.ok) return;
        prendi({ nome: f.nome, mime: f.mime, base64: f.base64, anteprima: 'data:' + f.mime + ';base64,' + f.base64 });
      };
      const disegnaFoto = () => {
        const z = svuota(zone.foto);
        const viste = m.foto.filter(f => m.togliere.indexOf(f.id) < 0);
        if (m.nuova || viste.length) {
          const principale = m.nuova ? (/^image\//.test(m.nuova.mime) ? h('img', { src: m.nuova.anteprima, alt: 'Lo scontrino' }) : h('div', { class: 'pdf-spesa' }, icona('scontrino', 40, 2), m.nuova.nome || 'PDF'))
            : h('img', { src: '/file/' + viste[0].id, alt: 'Lo scontrino' });
          aggiungi(z, [h('div', { class: 'foto-grande' }, principale),
            viste.length > (m.nuova ? 0 : 1) ? h('div', { class: 'miniature' }, viste.slice(m.nuova ? 0 : 1).map(f => h('a', { href: '#', title: 'Apri lo scontrino', onclick: e => { e.preventDefault(); W.apriFile(f); } }, h('img', { src: '/file/' + f.id, alt: '' })))) : null,
            spento('foto') ? null : h('div', { class: 'pillole' },
              h('button', { type: 'button', class: 'btn piccolo', onclick: scegli }, m.nuova || viste.length ? 'Cambia' : 'Scegli il file'),
              h('button', { type: 'button', class: 'btn piccolo testo pericolo', onclick: () => { if (m.nuova) m.nuova = null; else if (viste[0]) m.togliere.push(viste[0].id); disegnaFoto(); } }, 'Togli la foto'))]);
        } else {
          const drop = h('div', { class: 'zona-scontrino' + (spento('foto') ? ' spenta' : ''), role: spento('foto') ? null : 'button', tabindex: spento('foto') ? null : '0', 'data-visita': 'foto-spesa',
            onclick: spento('foto') ? null : scegli, onkeydown: e => { if (e.key === 'Enter' && !spento('foto')) scegli(); } },
          icona('foto', 34, 2), h('b', null, spento('foto') ? 'Senza scontrino' : 'Trascina qui lo scontrino'), spento('foto') ? null : h('span', { class: 'btn piccolo' }, 'Scegli il file'));
          if (!spento('foto')) {
            drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('accoglie'); });
            drop.addEventListener('dragleave', () => drop.classList.remove('accoglie'));
            drop.addEventListener('drop', async e => {
              e.preventDefault();
              drop.classList.remove('accoglie');
              const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
              if (!f) return;
              if (f.size > 20000000) { avviso('File troppo grande (più di 20 MB)', true); return; }
              try { prendi(await leggiFile(f)); } catch (x) { avviso(x.message, true); }
            });
          }
          aggiungi(z, [drop]);
        }
      };

      const disegnaImporto = () => aggiungi(svuota(zone.importo), [campo('Importo', conSuffisso(v.importo, '€'), errori.importo)]);
      v.importo.addEventListener('input', () => { if (errori.importo) { delete errori.importo; disegnaImporto(); v.importo.focus(); } });
      // Fase 6 (§7.4): per carburante, pedaggio e parcheggio "Per quale mezzo" (prima quelli che ho io) e, per il carburante, i km del contachilometri.
      m.idVeicolo = s.idVeicolo || null;
      const kmCont = h('input', { type: 'text', inputmode: 'numeric', value: s.km ? String(s.km) : '', disabled: spento('km') });
      const mezziSpesa = () => (S.ana.mezzi || []).slice().sort((a, b2) => (b2.mio ? 1 : 0) - (a.mio ? 1 : 0));
      const disegnaCategoria = () => aggiungi(svuota(zone.categoria), [h('div', { class: 'campo' }, h('label', null, 'Categoria'),
        h('div', { class: 'pillole' }, RO.CATEGORIE.map(c => h('button', { type: 'button', class: 'pillola' + (m.categoria === c[0] ? ' scelta' : ''), 'aria-pressed': m.categoria === c[0] ? 'true' : 'false',
          disabled: spento('categoria'), onclick: () => { m.categoria = c[0]; disegnaCategoria(); } }, c[1])))),
        ['carburante', 'pedaggio', 'parcheggio'].indexOf(m.categoria) >= 0 && mezziSpesa().length ? h('div', { class: 'campo' }, h('label', null, 'Per quale mezzo'),
          h('div', { class: 'pillole' }, mezziSpesa().map(x => h('button', { type: 'button', class: 'pillola piccola' + (String(m.idVeicolo) === String(x.id) ? ' scelta' : ''), disabled: spento('idVeicolo'), onclick: () => { m.idVeicolo = x.id; disegnaCategoria(); } }, x.titolo, x.fermo ? ' · fermo' : '')),
            h('button', { type: 'button', class: 'pillola piccola' + (!m.idVeicolo ? ' scelta' : ''), disabled: spento('idVeicolo'), onclick: () => { m.idVeicolo = null; disegnaCategoria(); } }, 'Nessuno'))) : null,
        m.categoria === 'carburante' && m.idVeicolo ? campo('Km del contachilometri', conSuffisso(kmCont, 'km')) : null]);
      const disegnaLegami = () => {
        const aperte = commesseAperte();
        const elenco = aperte.slice();
        if (m.idCommessa && !elenco.some(x => x.id === m.idCommessa) && W.commessa(m.idCommessa)) elenco.unshift(W.commessa(m.idCommessa));
        aggiungi(svuota(zone.legami), [campo('Giorno', v.data),
          campo('Commessa', selezione([['', 'Senza commessa']].concat(elenco.map(x => [x.id, x.id + ' · ' + x.descrizione])), m.idCommessa, x => {
            m.idCommessa = x;
            if (x) m.idCliente = '';
            if (!m.destToccata) m.destinazione = RO.destinazioneDiBase({ idCommessa: x, idCliente: m.idCliente, idRapportino: s.idRapportino });
            disegnaLegami(); disegnaDest();
          }, { disabled: spento('idCommessa') || !!s.idRapportino })),
          !m.idCommessa && m.destinazione === 'cliente' ? campo('Cliente', selezione([['', 'Scegli il cliente']].concat(W.clientiAttivi().slice().sort((a, b2) => a.nome.localeCompare(b2.nome, 'it')).map(c => [c.id, c.nome])), m.idCliente, x => { m.idCliente = x; delete errori.dest; disegnaDest(); }, { disabled: spento('idCliente') }), null) : null]);
      };
      const disegnaDest = () => {
        aggiungi(svuota(zone.dest), [h('div', { class: 'campo' }, h('label', null, 'A chi va'),
          segmenti(RO.DESTINAZIONI.map(d => [d[0], d[1]]), m.destinazione, x => { if (spento('destinazione')) return; m.destinazione = x; m.destToccata = true; delete errori.dest; disegnaLegami(); disegnaDest(); })),
        m.destinazione === 'cliente' ? h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: m.anticipazione, disabled: spento('anticipazione'), onchange: e => { m.anticipazione = e.target.checked; } }), 'Il documento è intestato al cliente') : null,
        h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: m.pagataDaMe, disabled: spento('pagataDaMe'), onchange: e => { m.pagataDaMe = e.target.checked; } }),
          // Fase 6 (§12.8): l'esterno non ha rimborsi dallo studio: la mette nella sua fattura.
          W.eEsterno && W.eEsterno() ? 'La metto nella mia fattura' : !soloSuoi() && m.idUtente && String(m.idUtente) !== String(io()) ? 'L\'ha pagata ' + primo(nomeDi(m.idUtente)) : 'L\'ho pagata io'),
        errori.dest ? h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori.dest)) : null]);
      };
      const disegnaChi = () => {
        svuota(zone.chi);
        if (esistente || soloSuoi() || !scrive() || persone().length < 2 || s.idTrasferta) return;
        aggiungi(zone.chi, [campo('Di chi', selezione(persone().map(u => [u.id, u.nome]), m.idUtente, x => { m.idUtente = Number(x) || x; disegnaDest(); }))]);
      };
      disegnaFoto(); disegnaImporto(); disegnaCategoria(); disegnaLegami(); disegnaDest(); disegnaChi();

      let chiudi;
      const salva = async () => {
        errori = {};
        const importo = C.numONull(v.importo.value);
        if (!soloCampi && !(importo > 0)) errori.importo = 'Importo: scrivi quanto hai speso';
        if (!soloCampi && m.destinazione === 'cliente' && !m.idCommessa && !m.idCliente && !s.idRapportino) errori.dest = 'Al cliente: scegli la commessa o il cliente';
        if (Object.keys(errori).length) { disegnaImporto(); disegnaDest(); disegnaLegami(); return; }
        let x;
        if (soloCampi) {
          x = { id: esistente.id };
          soloCampi.forEach(k => { x[k] = k === 'categoria' ? m.categoria : k === 'descrizione' ? v.descrizione.value.trim() : k === 'pagataDaMe' ? m.pagataDaMe : esistente[k]; });
        } else {
          x = { importo, categoria: m.categoria, data: v.data.value, idCommessa: m.idCommessa, destinazione: m.destinazione, anticipazione: m.destinazione === 'cliente' && m.anticipazione,
            pagataDaMe: m.pagataDaMe, descrizione: v.descrizione.value.trim() };
          if (!m.idCommessa && m.idCliente) x.idCliente = m.idCliente;
          if (['carburante', 'pedaggio', 'parcheggio'].indexOf(m.categoria) >= 0 && (S.ana.mezzi || []).length) {
            x.idVeicolo = m.idVeicolo || null;
            if (m.categoria === 'carburante' && m.idVeicolo && C.numONull(kmCont.value) !== null) x.km = Math.round(C.num(kmCont.value));
          }
          if (esistente) x.id = esistente.id;
          else {
            if (s.idTrasferta) x.idTrasferta = s.idTrasferta;
            // Fase 5: il materiale e le spese di un ticket (+ Materiale o spesa nel ticket).
            if (b.idTicket) x.idTicket = b.idTicket;
            if (!soloSuoi() && m.idUtente && String(m.idUtente) !== String(io()) && !s.idTrasferta) x.idUtente = m.idUtente;
          }
        }
        const fatto = await lavora('Salvo la spesa', async () => {
          const ris = await Rete.post('/server/salvaSpesa', { spesa: x });
          let spesa = ris.spesa;
          // La foto parte quando la spesa ha il suo numero; quelle tolte vanno nel cestino.
          for (const id of m.togliere) { const r = await Rete.post('/server/togliFotoSpesa', { id }); if (r && r.spesa) spesa = r.spesa; }
          if (m.nuova && spesa) {
            await Rete.post('/server/caricaFile', { tipo: 'spesa', idSpesa: spesa.id, base64: m.nuova.base64, mime: m.nuova.mime, nome: m.nuova.nome || 'scontrino', idFile: 'pc' + Date.now().toString(36) });
          }
          return spesa || true;
        });
        if (!fatto) return;
        chiudi();
        daRileggere();
        const st = fatto && fatto.stato;
        avviso(st === 'da_approvare' ? 'Spesa salvata: va in approvazione' : 'Spesa salvata');
        if (b.dopo) b.dopo(); else W.ridisegna();
        W.caricaDashboard();
        W.Visita.azione('salva-spesa');
      };
      const togli = async () => {
        const ris = await lavora('Tolgo la spesa', () => Rete.post('/server/togliSpesa', { id: esistente.id }));
        if (!ris) return;
        chiudi();
        daRileggere();
        avviso('Spesa tolta', false, null, { testo: 'Annulla', fn: async () => { if (await lavora('Rimetto la spesa', () => Rete.post('/server/togliSpesa', { id: esistente.id, annulla: true }))) { daRileggere(); W.ridisegna(); } } });
        if (b.dopo) b.dopo(); else W.ridisegna();
        W.caricaDashboard();
      };

      const trasferta = s.idTrasferta && M.trasferte ? (M.trasferte.trasferte || []).find(t => String(t.id) === String(s.idTrasferta)) : null;
      const bande = [
        esistente && esistente.stato === 'respinta' ? h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Respinta' + (esistente.approvataDaNome ? ' da ' + esistente.approvataDaNome : '') + ': ' + (esistente.motivoRifiuto || ''))) : null,
        esistente && esistente.bloccata ? h('div', { class: 'banda calma' }, icona('scudo', 20), h('span', { class: 'spazio' }, esistente.bloccata)) : null,
        s.idRapportino && !(esistente && esistente.bloccata) ? h('div', { class: 'secondario' }, 'Nel rapportino ' + s.idRapportino) : null,
        s.idTrasferta ? h('div', { class: 'secondario' }, 'Della trasferta' + (trasferta ? ' a ' + trasferta.destinazione : '')) : null,
      ];
      const contenuto = h('div', { class: 'modulo-spesa' },
        h('div', { class: 'col-foto' }, zone.foto),
        h('div', { class: 'col-campi' }, bande, zone.chi, zone.importo, zone.categoria, zone.legami, zone.dest, campo('Descrizione', v.descrizione)));
      const titolo = esistente ? (sola ? 'Spesa del ' + C.data(s.data) : 'Correggi la spesa') : 'Nuova spesa';
      chiudi = finestra({
        titolo, larghezza: 'larga', corpo: contenuto, fuoco: false,
        pulsanti: [esistente && !sola && !esistente.bloccata ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: togli }, 'Togli') : null, 'spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, sola ? 'Chiudi' : 'Annulla'),
          sola ? null : h('button', { type: 'button', class: 'btn giallo grande', style: { minWidth: '160px' }, 'data-visita': 'salva-spesa', onclick: salva }, 'Salva')].filter(Boolean),
      });
      if (!sola && !soloCampi) setTimeout(() => v.importo.focus(), 40);
    }

    // ===================================================================== trasferte

    function elencoTrasferte(area) {
      const lista = M.trasferte.trasferte || [];
      aggiungi(area, [scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => moduloTrasferta(null) }, icona('piu', 18, 2.6), 'Nuova trasferta')) : null]);
      if (!lista.length) { aggiungi(area, [h('p', { class: 'vuoto' }, 'Nessuna trasferta a ' + C.nomeMese(meseVisto()).split(' ')[0].toLowerCase() + '.')]); return; }
      aggiungi(area, [h('div', { class: 'scheda righe' }, lista.map(t => {
        const st = RO.pillolaStato(t);
        const quando = t.al && t.al !== t.dal ? RO.giornoBreve(t.dal).toLowerCase() + '–' + RO.giornoBreve(t.al).toLowerCase() : RO.giornoBreve(t.dal).toLowerCase();
        const sotto = [mostraPersona() ? primo(t.utente || nomeDi(t.idUtente)) : '', t.idCommessa || t.cliente || 'Senza commessa', quando,
          C.num(t.kmTotali) ? C.numero(t.kmTotali) + ' km × ' + C.numero(t.euroKm) + ' €' : '', C.num(t.indennita) ? 'indennità ' + C.euro(t.indennita) : '',
          C.num(t.speseTotale) ? 'spese ' + C.euro(t.speseTotale) : '', t.rimborsataIl ? 'rimborsata il ' + C.data(t.rimborsataIl) : ''].filter(Boolean).join(' · ');
        const respinta = t.stato === 'respinta';
        return riga({
          sinistra: quadrato('auto', 'ico-blu'), titolo: t.destinazione || 'Trasferta',
          sotto: respinta && t.motivoRifiuto ? [sotto, h('span', { class: 'motivo-rifiuto' }, 'Motivo: ' + t.motivoRifiuto)] : sotto,
          destra: h('span', { class: 'pillole-destra' }, h('span', { class: 'quanto' }, C.euro(t.totale)), st ? pillola(respinta ? 'Respinta' : st.testo, st.colore) : null),
          onclick: () => moduloTrasferta(t), freccia: false,
        });
      }))]);
    }

    /**
     * La trasferta: il rimborso km si calcola subito (RO.rimborsoTrasferta, come il
     * server). L'euro al km è quello congelato nella trasferta finché non si cambia
     * veicolo; un veicolo nuovo porta il suo euro al km di adesso.
     */
    async function moduloTrasferta(esistente) {
      const ve = await leggiVeicoli();
      const veicoli = (ve.veicoli || []).filter(x => x.attivo !== false || (esistente && String(x.id) === String(esistente.idVeicolo)));
      const t = esistente ? JSON.parse(JSON.stringify(esistente)) : {
        id: null, dal: oggi(), al: oggi(), destinazione: '', motivo: '', idCommessa: '', km: '', andataRitorno: true,
        idVeicolo: veicoli[0] ? veicoli[0].id : null, euroKm: veicoli[0] ? veicoli[0].euroKm : null, indennita: null, idUtente: null, spese: [],
      };
      const sola = esistente ? (!scrive() || esistente.puoScrivere === false || !!esistente.bloccata) : !scrive();
      const indennitaGiorno = C.numONull(S.ana.impostazioni.INDENNITA_TRASFERTA);
      const m = { idCommessa: t.idCommessa || '', andataRitorno: t.andataRitorno !== false, idVeicolo: t.idVeicolo, indennitaToccata: !!esistente, idUtente: t.idUtente || io() };
      const v = {
        dal: h('input', { type: 'date', value: t.dal || oggi(), disabled: sola }),
        al: h('input', { type: 'date', value: t.al || t.dal || oggi(), disabled: sola }),
        destinazione: h('input', { type: 'text', value: t.destinazione || '', disabled: sola, autocomplete: 'off' }),
        motivo: h('input', { type: 'text', value: t.motivo || '', disabled: sola, autocomplete: 'off' }),
        km: h('input', { type: 'text', inputmode: 'decimal', value: C.num(t.km) ? String(t.km).replace('.', ',') : '', disabled: sola, autocomplete: 'off' }),
        indennita: h('input', { type: 'text', inputmode: 'decimal', value: t.indennita !== null && t.indennita !== undefined && C.num(t.indennita) ? String(t.indennita).replace('.', ',') : '', disabled: sola, autocomplete: 'off' }),
      };
      let errori = {};
      const zone = { conto: h('div', { class: 'conto-vivo' }), veicolo: h('div'), errori: h('div'), spese: h('div', { class: 'fila' }), chi: h('div') };
      const giorni = () => { const a = v.dal.value; const b = v.al.value || a; return a && b && b >= a ? Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1 : 1; };
      /** L'euro al km da usare: quello congelato, finché il veicolo resta lo stesso. */
      const euroKm = () => {
        if (esistente && String(m.idVeicolo) === String(esistente.idVeicolo)) return C.num(esistente.euroKm);
        const x = veicoli.find(y => String(y.id) === String(m.idVeicolo));
        // Fase 6 (§3.7): con un mezzo dello studio niente rimborso km (carburante e manutenzione li paga lo studio).
        if (x && x.proprieta === 'studio') return 0;
        return x ? C.num(x.euroKm) : 0;
      };
      const delloStudio = () => { const x = veicoli.find(y => String(y.id) === String(m.idVeicolo)); return !!(x && x.proprieta === 'studio') || !!(esistente && String(m.idVeicolo) === String(esistente.idVeicolo) && esistente.mezzoDelloStudio); };
      const proponiIndennita = () => {
        if (m.indennitaToccata || indennitaGiorno === null || sola) return;
        v.indennita.value = String(Math.round(indennitaGiorno * giorni() * 100) / 100).replace('.', ',');
      };
      const aggiornaConto = () => {
        const r = RO.rimborsoTrasferta({ km: C.num(v.km.value), andataRitorno: m.andataRitorno, euroKm: euroKm(), indennita: C.num(v.indennita.value) });
        aggiungi(svuota(zone.conto), [h('div', { class: 'conto' },
          delloStudio() ? h('div', { class: 'rc' }, h('span', null, 'Mezzo dello studio: niente rimborso km'), h('span', null, C.euro(0)))
            : h('div', { class: 'rc' }, h('span', null, C.numero(r.kmTotali) + ' km × ' + C.numero(euroKm()) + ' €'), h('span', null, C.euro(r.rimborsoKm))),
          h('div', { class: 'rc' }, h('span', null, 'Indennità'), h('span', null, C.euro(r.indennita))),
          h('div', { class: 'tot' }, h('span', null, 'Rimborso'), h('span', null, C.euro(r.totale))))]);
      };
      const disegnaVeicolo = () => {
        svuota(zone.veicolo);
        if (!veicoli.length) { aggiungi(zone.veicolo, [h('div', { class: 'secondario' }, 'Nessun veicolo: si aggiungono in Amministrazione › Veicoli e rimborso km')]); return; }
        const anno = x => (x.annoAci ? ' (ACI ' + x.annoAci + ')' : '');
        // Fase 6: il mezzo dello studio senza euro al km, e "Fermo" accanto a quello che non si dovrebbe usare.
        aggiungi(zone.veicolo, [campo('Veicolo', selezione(veicoli.map(x => [x.id, (x.titolo || x.nome) + (x.proprieta === 'studio' ? ' · dello studio' : ' · ' + C.numero(x.euroKm) + ' €/km' + anno(x)) + (x.fermo ? ' · Fermo' : '')]), m.idVeicolo, x => { m.idVeicolo = Number(x) || x; aggiornaConto(); }, { disabled: sola }))]);
      };
      const disegnaErrori = () => aggiungi(svuota(zone.errori), Object.keys(errori).map(k => h('div', { class: 'campo' }, h('div', { class: 'errore' }, errori[k]))));
      const disegnaChi = () => {
        svuota(zone.chi);
        if (esistente || soloSuoi() || !scrive() || persone().length < 2) return;
        aggiungi(zone.chi, [campo('Di chi', selezione(persone().map(u => [u.id, u.nome]), m.idUtente, x => { m.idUtente = Number(x) || x; }))]);
      };
      let chiudi;
      const disegnaSpese = () => {
        svuota(zone.spese);
        if (!esistente) return;
        const lista = (t.spese || []).filter(x => !x.tolta);
        aggiungi(zone.spese, [h('h3', null, 'Le spese della trasferta'),
          lista.length ? h('div', { class: 'scheda righe' }, lista.map(x => riga({ sinistra: quadrato(RO.categoria(x.categoria).icona), titolo: x.descrizione || RO.categoria(x.categoria).nome,
            sotto: RO.giornoBreve(x.data).toLowerCase(), destra: h('span', { class: 'quanto' }, C.euro(x.importo)), onclick: () => { chiudi(); moduloSpesa(x); }, freccia: false }))) : null,
          sola || !scrive() ? null : h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => { chiudi(); moduloSpesa(null, { idTrasferta: t.id, idCommessa: t.idCommessa, data: t.dal }); } }, icona('piu', 18, 2.6), 'Aggiungi una spesa'))]);
      };
      [v.km, v.indennita].forEach(i => i.addEventListener('input', () => { if (i === v.indennita) m.indennitaToccata = true; aggiornaConto(); }));
      [v.dal, v.al].forEach(i => i.addEventListener('change', () => { proponiIndennita(); aggiornaConto(); }));
      proponiIndennita();
      disegnaVeicolo(); aggiornaConto(); disegnaSpese(); disegnaChi();

      const salva = async () => {
        errori = {};
        const km = C.numONull(v.km.value);
        if (!v.destinazione.value.trim()) errori.destinazione = 'Destinazione: scrivi dove sei andato';
        if (v.al.value && v.dal.value && v.al.value < v.dal.value) errori.al = 'Al: non può venire prima della partenza';
        if (v.km.value.trim() && km === null) errori.km = 'Km: scrivi un numero';
        if (v.indennita.value.trim() && C.numONull(v.indennita.value) === null) errori.indennita = 'Indennità: scrivi un numero';
        if (Object.keys(errori).length) { disegnaErrori(); return; }
        const x = { dal: v.dal.value, al: v.al.value || v.dal.value, destinazione: v.destinazione.value.trim(), motivo: v.motivo.value.trim(), idCommessa: m.idCommessa,
          km: km || 0, andataRitorno: m.andataRitorno, idVeicolo: m.idVeicolo || null, indennita: C.num(v.indennita.value) };
        if (esistente) x.id = esistente.id;
        else if (!soloSuoi() && m.idUtente && String(m.idUtente) !== String(io())) x.idUtente = m.idUtente;
        const ris = await lavora('Salvo la trasferta', () => Rete.post('/server/salvaTrasferta', { trasferta: x }));
        if (!ris) return;
        chiudi();
        daRileggere();
        const tr = ris.trasferta || {};
        avviso('Trasferta salvata · rimborso ' + C.euro(tr.totale) + (tr.stato === 'da_approvare' ? ': va in approvazione' : ''));
        M.segmento = 'trasferte';
        W.ridisegna();
        W.caricaDashboard();
        W.Visita.azione('salva-trasferta');
      };
      const togli = async () => {
        const ris = await lavora('Tolgo la trasferta', () => Rete.post('/server/togliTrasferta', { id: esistente.id }));
        if (!ris) return;
        chiudi();
        daRileggere();
        avviso('Trasferta tolta', false, null, { testo: 'Annulla', fn: async () => { if (await lavora('Rimetto la trasferta', () => Rete.post('/server/togliTrasferta', { id: esistente.id, annulla: true }))) { daRileggere(); W.ridisegna(); } } });
        W.ridisegna();
        W.caricaDashboard();
      };

      const elencoCommesse = commesseAperte().slice();
      if (m.idCommessa && !elencoCommesse.some(x => x.id === m.idCommessa) && W.commessa(m.idCommessa)) elencoCommesse.unshift(W.commessa(m.idCommessa));
      const bande = [
        esistente && esistente.stato === 'respinta' ? h('div', { class: 'banda' }, icona('avviso', 20), h('span', { class: 'spazio' }, 'Respinta' + (esistente.approvataDaNome ? ' da ' + esistente.approvataDaNome : '') + ': ' + (esistente.motivoRifiuto || ''))) : null,
        esistente && esistente.bloccata ? h('div', { class: 'banda calma' }, icona('scudo', 20), h('span', { class: 'spazio' }, esistente.bloccata)) : null,
      ];
      const corpo = h('div', { class: 'modulo' },
        h('div', { class: 'col' }, bande, zone.chi, h('div', { class: 'riga-campi' }, campo('Dal', v.dal), campo('Al', v.al)), campo('Destinazione', v.destinazione), campo('Motivo', v.motivo),
          campo('Commessa', selezione([['', 'Senza commessa']].concat(elencoCommesse.map(x => [x.id, x.id + ' · ' + x.descrizione])), m.idCommessa, x => { m.idCommessa = x; }, { disabled: sola })),
          zone.spese),
        h('div', { class: 'col' }, h('div', { class: 'riga-campi' }, campo('Km', conSuffisso(v.km, 'km')), campo('Indennità', conSuffisso(v.indennita, '€'))),
          h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: m.andataRitorno, disabled: sola, onchange: e => { m.andataRitorno = e.target.checked; aggiornaConto(); } }), 'Andata e ritorno'),
          zone.veicolo, zone.conto, zone.errori));
      chiudi = finestra({
        titolo: esistente ? (sola ? 'Trasferta del ' + C.data(t.dal) : 'Correggi la trasferta') : 'Nuova trasferta', larghezza: 'larga', corpo, fuoco: false,
        pulsanti: [esistente && !sola ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: togli }, 'Togli') : null, 'spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, sola ? 'Chiudi' : 'Annulla'),
          sola ? null : h('button', { type: 'button', class: 'btn giallo grande', style: { minWidth: '160px' }, onclick: salva }, 'Salva')].filter(Boolean),
      });
      if (!sola) setTimeout(() => v.destinazione.focus(), 40);
    }

    // ===================================================================== rimborsi

    function elencoRimborsi(area) {
      const d = M.rimborsi || { persone: [] };
      const lista = (d.persone || []).filter(p => C.num(p.totale) > 0 || C.num(p.inAttesa) > 0);
      if (!lista.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente da rimborsare')]); return; }
      const puoSegnare = d.puoSegnare === true || interfaccia().puoSegnareRimborsi === true;
      aggiungi(area, [h('div', { class: 'due-colonne' }, lista.map(p => {
        const nome = p.nome || nomeDi(p.idUtente);
        const sotto = [p.spese ? (p.spese === 1 ? '1 spesa pagata da ' : p.spese + ' spese pagate da ') + primo(nome) : '', C.num(p.km) ? C.numero(p.km) + ' km di trasferte' : '',
          C.num(p.inAttesa) ? C.euro(p.inAttesa) + ' ancora da approvare' : ''].filter(Boolean).join(' · ');
        return h('div', { class: 'scheda rimborso' },
          h('div', { class: 'alto' }, h('b', null, nome), h('span', { class: 'quanto' }, C.euro(p.totale))),
          sotto ? h('span', { class: 'secondario' }, sotto) : null,
          (p.voci || []).length ? h('div', { class: 'voci-rimborso' }, p.voci.map(x => h('div', { class: 'rc' },
            h('span', null, RO.giornoBreve(x.data).toLowerCase() + ' · ' + (x.descrizione || (x.tipo === 'trasferta' ? 'Trasferta' : RO.categoria(x.categoria).nome)) + (x.km ? ' · ' + C.numero(x.km) + ' km' : '')),
            h('span', null, C.euro(x.importo))))) : null,
          puoSegnare && C.num(p.totale) > 0 ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => segnaRimborsato(p) }, 'Segna rimborsato')) : null);
      }))]);
    }

    async function segnaRimborsato(p) {
      const voci = (p.voci || []).map(x => ({ tipo: x.tipo, id: x.id }));
      const ris = await lavora('Segno rimborsato', () => Rete.post('/server/segnaRimborsato', voci.length ? { voci } : { idUtente: p.idUtente }));
      if (!ris) return;
      daRileggere();
      avviso('Rimborsato a ' + primo(p.nome || nomeDi(p.idUtente)) + ': ' + C.euro(typeof ris.totale === 'number' ? ris.totale : p.totale), false, null, voci.length ? { testo: 'Annulla', fn: async () => {
        if (await lavora('Tolgo il rimborsato', () => Rete.post('/server/segnaRimborsato', { voci, annulla: true }))) { daRileggere(); W.ridisegna(); W.caricaDashboard(); }
      } } : null);
      W.ridisegna();
      W.caricaDashboard();
      W.Visita.azione('segna-rimborsato');
    }

    // ===================================================================== riepiloghi

    function periodoRiepilogo() {
      const mese = meseVisto();
      if (M.periodo === 'anno') return { da: mese.slice(0, 4) + '-01-01', a: mese.slice(0, 4) + '-12-31', nome: mese.slice(0, 4) };
      const p = RO.periodoMese(mese);
      return { da: p.da, a: p.a, nome: C.nomeMese(mese) };
    }

    async function leggiRiepilogo() {
      const p = periodoRiepilogo();
      const chiave = p.da + '|' + p.a + '|' + M.per;
      if (M.riep && M.riepChiave === chiave) return;
      M.riep = await Rete.get('/server/riepilogoSpese?da=' + p.da + '&a=' + p.a + '&per=' + M.per);
      M.riepChiave = chiave;
    }

    function riepiloghi(pagina) {
      const p = periodoRiepilogo();
      const mese = meseVisto();
      const sposta = d => { M.mese = M.periodo === 'anno' ? (Number(mese.slice(0, 4)) + d) + mese.slice(4) : RO.spostaMese(mese, d); W.disegnaPagina(); };
      aggiungi(pagina, [h('div', { class: 'indietro-riga' }, tondo('indietro', 'Torna alle spese', () => W.vai('#spese')), h('span', { class: 'dove' }, 'Spese e trasferte')),
        h('div', { class: 'testata' }, h('h1', null, 'Riepiloghi'), h('span', { class: 'spazio' }),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.esporta('spese', { da: p.da, a: p.a }) }, icona('scarica', 16, 2.4), 'Spese'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.esporta('trasferte', { da: p.da, a: p.a }) }, icona('scarica', 16, 2.4), 'Trasferte'),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => W.esporta('rimborsi', {}) }, icona('scarica', 16, 2.4), 'Rimborsi da fare')),
        h('div', { class: 'filtri' },
          segmenti([['persona', 'Per persona'], ['commessa', 'Per commessa'], ['categoria', 'Per categoria']], M.per, x => { M.per = x; W.disegnaPagina(); }),
          segmenti([['mese', 'Mese'], ['anno', 'Anno']], M.periodo, x => { M.periodo = x; W.disegnaPagina(); }, 'piccoli'),
          tondo('indietro', M.periodo === 'anno' ? 'Anno prima' : 'Mese prima', () => sposta(-1)),
          h('h2', { class: 'titolo-periodo' }, p.nome),
          tondo('avanti', M.periodo === 'anno' ? 'Anno dopo' : 'Mese dopo', () => sposta(1)))]);
      const r = M.riep || { righe: [], totale: {} };
      const conTrasferte = M.per !== 'categoria';
      const colonne = 'minmax(0, 1.6fr) 64px repeat(' + (conTrasferte ? 7 : 6) + ', minmax(84px, 1fr))';
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: colonne } },
        h('span', null, M.per === 'persona' ? 'Persona' : M.per === 'commessa' ? 'Commessa' : 'Categoria'), h('span', { class: 'n' }, 'Spese'),
        h('span', { class: 'n' }, 'Al cliente'), h('span', { class: 'n' }, 'Anticipaz.'), h('span', { class: 'n' }, 'Allo studio'), h('span', { class: 'n' }, 'Mie'),
        conTrasferte ? h('span', { class: 'n' }, 'Trasferte') : null, h('span', { class: 'n' }, 'Da rimborsare'), h('span', { class: 'n' }, 'Totale')));
      const eu = n => (C.num(n) ? C.euro(n) : '—');
      const nomeRiga = x => {
        if (M.per === 'commessa') return h('span', { class: 'doppia' }, h('span', null, x.chiave ? x.chiave + ' · ' + (x.nome || '') : 'Senza commessa'), x.nomeCliente ? h('span', null, x.nomeCliente) : null);
        return h('span', { class: 'forte taglia' }, x.nome || (x.chiave === 'nessuno' ? 'Senza persona' : String(x.chiave)));
      };
      (r.righe || []).forEach(x => aggiungi(tab, [h('div', { class: 'r', style: { gridTemplateColumns: colonne } }, nomeRiga(x), h('span', { class: 'n' }, String(x.quante || 0)),
        h('span', { class: 'n' }, eu(x.cliente)), h('span', { class: 'n t2' }, eu(x.anticipazioni)), h('span', { class: 'n' }, eu(x.studio)), h('span', { class: 'n t2' }, eu(x.personale)),
        conTrasferte ? h('span', { class: 'n', title: C.num(x.km) ? C.numero(x.km) + ' km' : null }, eu(C.num(x.rimborsoKm) + C.num(x.indennita))) : null,
        h('span', { class: 'n' }, eu(x.daRimborsare)), h('span', { class: 'n forte' }, eu(x.totale)))]));
      if (!(r.righe || []).length) aggiungi(tab, [h('div', { class: 'r' }, h('span', { class: 'tenue' }, 'Nessuna spesa e nessuna trasferta in questo periodo.'))]);
      else {
        const t = r.totale || {};
        aggiungi(tab, [h('div', { class: 'r piede', style: { gridTemplateColumns: colonne } }, h('span', null, 'Totale'), h('span', { class: 'n' }, String(t.quante || 0)),
          h('span', { class: 'n' }, eu(t.cliente)), h('span', { class: 'n' }, eu(t.anticipazioni)), h('span', { class: 'n' }, eu(t.studio)), h('span', { class: 'n' }, eu(t.personale)),
          conTrasferte ? h('span', { class: 'n' }, eu(C.num(t.rimborsoKm) + C.num(t.indennita))) : null, h('span', { class: 'n' }, eu(t.daRimborsare)), h('span', { class: 'n' }, eu(t.totale)))]);
      }
      aggiungi(pagina, [tab]);
    }

    return { vista, M, moduloSpesa, moduloTrasferta, daRileggere };
  };
})(window);
