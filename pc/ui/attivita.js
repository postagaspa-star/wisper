/*
 * Wisper Ufficio: Attività e calendario (docs/gestionale/fase2.md §5, prototipo
 * docs/prototipo/Gestionale-fase2.html, vista Computer).
 *
 *  - Attività: Mie · Squadra · Non assegnate; gruppi Scadute, Oggi, Prossimi giorni,
 *    Senza data; il cerchio si spunta (con Annulla); il modulo completo con le
 *    ricorrenze ("solo questa / da questa in poi / tutte"), la checklist, gli allegati;
 *  - Calendario: la settimana a sette colonne con le ore, il mese, il giorno; un
 *    appuntamento che si sovrappone a un altro della stessa persona chiede conferma;
 *  - Pianificazione della settimana: persone × giorni, le non assegnate a sinistra
 *    da trascinare su una persona e un giorno.
 * Tutto quello che si vede viene dal server (azione "attivita"); ogni cambio va al server.
 */
(function (radice) {
  'use strict';

  radice.WisperAttivita = function (W) {
    const { S, C, R, B, Rete } = W;
    const RA = radice.WisperRegoleAttivita;
    const { h, aggiungi, svuota, icona, tondo, pillola, avviso, lavora, finestra, conferma, apriMenu, campo, selezione, segmenti, segnaposto } = B;
    const puo = W.puo;
    const scrive = () => puo('attivita', 2);

    // aperte = l'elenco (senza date: le aperte di ogni giorno, scadute e senza data comprese);
    // periodo = il calendario e la pianificazione (con da e a: ogni stato tranne le annullate).
    // piuAvanti: il gruppo "Più avanti" parte chiuso e si apre con un clic (come sul telefono).
    const M = { aperte: null, periodo: null, da: '', a: '', segmento: 'mie', vistaCal: 'settimana', giorno: '', soloMiei: false, settimanaPian: '', piuAvanti: false };
    const oggi = () => C.oggiIso();
    const io = () => (S.io && S.io.utente && S.io.utente.id) || null;
    const utenteDi = id => S.ana.utenti.find(u => String(u.id) === String(id));
    const nomeUtente = id => (utenteDi(id) || { nome: '' }).nome;
    const persone = () => S.ana.utenti.filter(u => u.attivo !== false && u.ruolo !== 'lettura');

    async function leggiAperte() {
      const r = await Rete.get('/server/attivita');
      M.aperte = (r.attivita || []).map(RA.normalizzaAttivita);
      W.attivitaLette(M.aperte);
    }
    async function leggiPeriodo(da, a) {
      const r = await Rete.get('/server/attivita?da=' + da + '&a=' + a);
      M.periodo = (r.attivita || []).map(RA.normalizzaAttivita);
      M.da = da;
      M.a = a;
    }
    /** Rilegge il periodo solo se quello da vedere esce da quello già letto. */
    function servePeriodo(da, a) {
      if (M.periodo && da >= M.da && a <= M.a) return Promise.resolve();
      return leggiPeriodo(M.periodo && M.da < da ? M.da : da, M.periodo && M.a > a ? M.a : a);
    }
    const serveAperte = () => (M.aperte ? Promise.resolve() : leggiAperte());
    /** Dopo un cambio che tocca più righe (una ricorrenza, gli allegati): si rilegge tutto alla prossima pagina. */
    function daRileggere() { M.aperte = null; M.periodo = null; }
    /** Le aperte e quelle del periodo insieme, una volta sola ciascuna (per le sovrapposizioni e la pianificazione). */
    function tutte() {
      const visti = new Map();
      (M.aperte || []).concat(M.periodo || []).forEach(a => visti.set(String(a.id), a));
      return Array.from(visti.values());
    }
    /** Solo i campi che il modulo cambia: §13.7, "con id cambia solo i campi mandati". */
    function perSalvare(a) {
      const x = {};
      ['id', 'titolo', 'descrizione', 'tipo', 'idCliente', 'idCommessa', 'idPrestazione', 'assegnataA', 'priorita', 'scadenza', 'inizio', 'fine',
        'tuttoIlGiorno', 'luogo', 'promemoriaMinuti', 'checklist', 'ricorrenza'].forEach(k => { if (a[k] !== undefined) x[k] = a[k]; });
      return x;
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

    function vista(pagina, a1, filtro) {
      if (filtro && filtro.segmento) M.segmento = filtro.segmento;
      if (filtro && filtro.giorno) { M.giorno = filtro.giorno; M.vistaCal = 'giorno'; }
      if (a1 === 'calendario') {
        const g = M.giorno || oggi();
        const [da, a] = periodoCalendario(g);
        return conDati(pagina, () => servePeriodo(da, a), () => calendario(pagina));
      }
      if (a1 === 'pianificazione') {
        const giorni = RA.settimanaDi(M.settimanaPian || oggi());
        return conDati(pagina, () => Promise.all([servePeriodo(giorni[0], giorni[6]), serveAperte()]), () => pianificazione(pagina));
      }
      return conDati(pagina, serveAperte, () => {
        elenco(pagina);
        // "#attivita/12" (dalla Dashboard): l'elenco e il modulo di quell'attività.
        if (a1) { const x = M.aperte.find(y => String(y.id) === String(a1)); if (x) modulo(x); }
      });
    }

    // ===================================================================== elenco

    function testata(titolo, conVista) {
      return h('div', { class: 'testata alta' },
        h('div', { class: 'titoli' }, h('span', { class: 'dove' }, 'Attività e calendario'), h('h1', null, titolo)),
        conVista !== 'elenco' ? h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#attivita') }, icona('lista', 18, 2.2), 'Attività') : null,
        conVista !== 'calendario' ? h('button', { type: 'button', class: 'btn', 'data-visita': 'vai-calendario', onclick: () => { W.vai('#attivita/calendario'); W.Visita.azione('vai-calendario'); } }, icona('calendario', 18, 2.2), 'Calendario') : null,
        conVista !== 'pianificazione' ? h('button', { type: 'button', class: 'btn', onclick: () => W.vai('#attivita/pianificazione') }, icona('persone', 18, 2.2), 'Pianificazione') : null,
        scrive() ? h('button', { type: 'button', class: 'btn giallo', onclick: () => modulo(null, conVista === 'calendario' ? { tipo: 'appuntamento', giorno: M.giorno || oggi() } : null) }, icona('piu', 18, 2.6),
          conVista === 'calendario' ? 'Nuovo appuntamento' : 'Nuova attività') : null);
    }

    function elenco(pagina) {
      const area = h('div', { class: 'stretta-820 sezione' });
      // Quante si vedono davvero: di una ricorrenza conta solo la prossima volta.
      const n = s => RA.raggruppa(RA.filtraAttivita(M.aperte, s, io(), oggi()).filter(a => a.stato !== 'fatta'), oggi()).reduce((t, g) => t + g.voci.length, 0);
      aggiungi(pagina, [testata('Attività', 'elenco'),
        h('div', null, segmenti([['mie', 'Mie · ' + n('mie')], ['squadra', 'Squadra · ' + n('squadra')], ['libere', 'Non assegnate · ' + n('libere')]], M.segmento,
          x => { M.segmento = x; W.disegnaPagina(); })),
        area]);
      disegnaGruppi(area);
    }

    function disegnaGruppi(area) {
      svuota(area);
      const gruppi = RA.raggruppa(RA.filtraAttivita(M.aperte, M.segmento, io(), oggi()), oggi());
      if (!gruppi.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), M.segmento === 'libere' ? 'Nessuna attività da assegnare' : 'Niente da fare qui')]); return; }
      let prima = true;
      gruppi.forEach(g => {
        const chiuso = g.chiave === 'piuAvanti' && !M.piuAvanti;
        // "Più avanti" si apre e si richiude dall'etichetta; gli altri gruppi sono sempre aperti.
        const etichetta = g.chiave === 'piuAvanti'
          ? h('button', { type: 'button', class: 'etichetta apri-gruppo', 'aria-expanded': chiuso ? 'false' : 'true', onclick: () => { M.piuAvanti = !M.piuAvanti; disegnaGruppi(area); } },
            icona(chiuso ? 'avanti' : 'giu', 14, 2.6), g.nome + ' · ' + g.voci.length)
          : h('span', { class: 'etichetta' + (g.chiave === 'scadute' ? ' rossa' : '') }, g.nome + ' · ' + g.voci.length);
        aggiungi(area, [h('div', { class: 'sezione-dash' }, etichetta,
          chiuso ? null : h('div', { class: 'scheda righe' }, g.voci.map(a => { const r = rigaAttivita(a, prima); prima = false; return r; })))]);
      });
    }

    const NOMI_TIPO = Object.fromEntries(RA.TIPI);

    function rigaAttivita(a, prima) {
      const fatta = a.stato === 'fatta';
      const ric = a.ricorrenza && a.ricorrenza.regola ? a.ricorrenza : null;
      const sotto = [a.tipo !== 'attivita' ? NOMI_TIPO[a.tipo] : '', RA.dettaglio(Object.assign({}, a, { cliente: a.idCliente ? (W.cliente(a.idCliente) || {}).nome : '' }), oggi()),
        ric ? RA.ricorrenzaAParole(ric) : (a.idRicorrenza ? 'si ripete' : ''), a.checklist.length ? a.checklist.filter(c => c.fatta).length + ' di ' + a.checklist.length : ''].filter(Boolean).join(' · ');
      const cerchio = h('button', { type: 'button', class: 'spunta-attivita' + (fatta ? ' fatta' : ''), 'aria-label': fatta ? 'Segna da fare: ' + a.titolo : 'Segna fatta: ' + a.titolo,
        'aria-pressed': fatta ? 'true' : 'false', disabled: !puoCambiare(a), 'data-visita': prima ? 'spunta-attivita' : null,
        onclick: e => { e.stopPropagation(); spunta(a, !fatta); } }, fatta ? icona('spunta', 16, 3) : null);
      return h('div', { class: 'riga riga-attivita' + (fatta ? ' fatta' : ''), role: 'button', tabindex: '0', onclick: () => modulo(a), onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) modulo(a); } },
        cerchio,
        h('span', { class: 'corpo' }, h('span', { class: 't1' }, a.titolo), h('span', { class: 't2' }, sotto)),
        a.priorita === 'alta' && !fatta ? pillola('Alta', 'rosso') : null,
        a.assegnataA ? h('span', { class: 'cerchio-io piccolo', title: nomeUtente(a.assegnataA) }, RA.iniziali(nomeUtente(a.assegnataA))) : pillola('libera', 'grigio'));
    }

    /** Il collaboratore cambia le sue e quelle libere; chi ha attività in scrittura le altre. Decide il server: qui si nasconde. */
    function puoCambiare(a) {
      if (!scrive()) return false;
      if (a && typeof a.puoScrivere === 'boolean') return a.puoScrivere;
      if (S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore') return !a.assegnataA || String(a.assegnataA) === String(io());
      return true;
    }

    async function spunta(a, fatta) {
      const ris = await lavora(fatta ? 'Segno fatta' : 'Rimetto da fare', () => Rete.post('/server/faiAttivita', { id: a.id, fatta }));
      if (!ris) return;
      accogli(ris.attivita, a);
      W.ridisegna();
      W.caricaDashboard();
      if (fatta) {
        avviso('Fatta: ' + a.titolo, false, null, { testo: 'Annulla', fn: () => spunta(a, false) });
        W.Visita.azione('spunta-attivita');
      }
    }

    /** Rimette nell'elenco l'attività come l'ha salvata il server. */
    function accogli(nuova, vecchia) {
      if (!nuova) return;
      const x = RA.normalizzaAttivita(nuova);
      const id = String(x.id || (vecchia && vecchia.id));
      [M.aperte, M.periodo].forEach((lista, n) => {
        if (!lista) return;
        const i = lista.findIndex(y => String(y.id) === id);
        if (i >= 0) lista[i] = x;
        else if (n === 0 ? x.stato !== 'annullata' : (RA.giornoDi(x) >= M.da && RA.giornoDi(x) <= M.a)) lista.push(x);
      });
      W.attivitaLette(M.aperte || []);
    }

    // ===================================================================== modulo

    /**
     * Il modulo completo (nuova e modifica): titolo, tipo, quando, chi, cliente,
     * commessa, prestazione, priorità, promemoria, ripeti, luogo, checklist, note,
     * allegati. Per un sopralluogo o un appuntamento c'è "Scrivi il rapportino".
     */
    function modulo(esistente, base) {
      const p0 = base || {};
      const a = esistente ? JSON.parse(JSON.stringify(esistente)) : RA.normalizzaAttivita({
        titolo: '', tipo: p0.tipo || 'attivita', assegnataA: M.segmento === 'libere' ? null : io(), priorita: 'normale',
        scadenza: p0.tipo && p0.tipo !== 'attivita' ? '' : (p0.giorno || ''),
        inizio: p0.tipo && p0.tipo !== 'attivita' ? (p0.giorno || oggi()) + 'T' + (p0.ora || '09:00') + ':00' : '',
        fine: p0.tipo && p0.tipo !== 'attivita' ? (p0.giorno || oggi()) + 'T' + (p0.oraFine || (p0.ora ? String(Math.min(23, Number(p0.ora.slice(0, 2)) + 1)).padStart(2, '0') + p0.ora.slice(2) : '10:00')) + ':00' : '',
        idCommessa: p0.idCommessa || '', idCliente: p0.idCliente || '',
      });
      const sola = esistente ? !puoCambiare(esistente) : !scrive();
      const ricEsistente = a.ricorrenza && a.ricorrenza.regola ? a.ricorrenza : null;
      let ripeti = '';
      let personalizzata = { regola: 'settimane', ogni: 1, giorniSettimana: [], fine: '' };
      const allegatiNuovi = [];
      const v = {
        titolo: h('input', { type: 'text', value: a.titolo || '', disabled: sola }),
        scadenza: h('input', { type: 'date', value: a.scadenza || '', disabled: sola }),
        giorno: h('input', { type: 'date', value: String(a.inizio || '').slice(0, 10) || oggi(), disabled: sola }),
        inizio: h('input', { type: 'time', value: String(a.inizio || '').slice(11, 16) || '09:00', disabled: sola, step: 900 }),
        fine: h('input', { type: 'time', value: String(a.fine || '').slice(11, 16) || '10:00', disabled: sola, step: 900 }),
        tuttoIlGiorno: h('input', { type: 'checkbox', checked: !!a.tuttoIlGiorno, disabled: sola }),
        luogo: h('input', { type: 'text', value: a.luogo || '', disabled: sola }),
        descrizione: h('textarea', { rows: 3, disabled: sola }),
        nuovaVoce: h('input', { type: 'text', placeholder: 'Una cosa da spuntare', disabled: sola, 'aria-label': 'Nuova voce della checklist' }),
        fineRic: h('input', { type: 'date', value: '', disabled: sola }),
      };
      v.descrizione.value = a.descrizione || '';
      const zone = { tipo: h('div'), quando: h('div', { class: 'fila' }), chi: h('div'), legami: h('div', { class: 'riga-campi' }), priorita: h('div'), ripeti: h('div', { class: 'fila' }), checklist: h('div', { class: 'fila' }), allegati: h('div', { class: 'fila' }) };
      let errori = {};

      const disegnaTipo = () => aggiungi(svuota(zone.tipo), [h('div', { class: 'campo' }, h('label', null, 'Tipo'),
        segmenti(RA.TIPI, a.tipo, x => { if (sola) return; a.tipo = x; disegnaTipo(); disegnaQuando(); }))]);
      const disegnaQuando = () => {
        const orario = a.tipo !== 'attivita';
        aggiungi(svuota(zone.quando), orario ? [
          h('div', { class: 'riga-campi' }, campo('Giorno', v.giorno, errori.quando), v.tuttoIlGiorno.checked ? null : campo('Dalle', v.inizio), v.tuttoIlGiorno.checked ? null : campo('Alle', v.fine, errori.fine)),
          h('label', { class: 'spunta-campo piccola' }, v.tuttoIlGiorno, 'Tutto il giorno'),
          campo('Luogo', v.luogo),
        ] : [campo('Scadenza', v.scadenza)]);
      };
      v.tuttoIlGiorno.addEventListener('change', disegnaQuando);
      const disegnaChi = () => aggiungi(svuota(zone.chi), [h('div', { class: 'campo' }, h('label', null, 'Chi'),
        h('div', { class: 'pillole' }, [h('button', { type: 'button', class: 'pillola' + (!a.assegnataA ? ' scelta' : ''), 'aria-pressed': !a.assegnataA ? 'true' : 'false', disabled: sola,
          onclick: () => { a.assegnataA = null; disegnaChi(); } }, 'Nessuno')].concat(persone().filter(u => !(S.io.utente.ruolo === 'collaboratore' && String(u.id) !== String(io()))).map(u =>
          h('button', { type: 'button', class: 'pillola' + (String(a.assegnataA) === String(u.id) ? ' scelta' : ''), 'aria-pressed': String(a.assegnataA) === String(u.id) ? 'true' : 'false', disabled: sola,
            onclick: () => { a.assegnataA = u.id; disegnaChi(); } }, u.nome)))))]);
      const disegnaLegami = () => {
        const clienti = W.clientiAttivi().slice().sort((x, y) => x.nome.localeCompare(y.nome, 'it'));
        const commesse = S.ana.commesse.filter(m => !m.modello && !m.archiviata && (m.stato === 'APERTA' || m.id === a.idCommessa) && (!a.idCliente || m.idCliente === a.idCliente));
        const prestazioni = S.ana.prestazioni.filter(x => x.idCommessa === a.idCommessa);
        aggiungi(svuota(zone.legami), [
          campo('Cliente', selezione([['', 'Studio, senza cliente']].concat(clienti.map(c => [c.id, c.nome])), a.idCliente || '', x => { a.idCliente = x; if (a.idCommessa && (W.commessa(a.idCommessa) || {}).idCliente !== x) a.idCommessa = ''; disegnaLegami(); }, { disabled: sola })),
          campo('Commessa', selezione([['', 'Nessuna']].concat(commesse.map(m => [m.id, m.id + ' · ' + m.descrizione])), a.idCommessa || '', x => {
            a.idCommessa = x; a.idPrestazione = null; const m = W.commessa(x); if (m && !a.idCliente) a.idCliente = m.idCliente; disegnaLegami();
          }, { disabled: sola })),
          prestazioni.length ? campo('Prestazione', selezione([['', 'Nessuna']].concat(prestazioni.map(x => [x.id, x.nome])), a.idPrestazione || '', x => { a.idPrestazione = x ? Number(x) || x : null; }, { disabled: sola })) : null]);
      };
      const disegnaPriorita = () => aggiungi(svuota(zone.priorita), [h('div', { class: 'riga-campi' },
        h('div', { class: 'campo' }, h('label', null, 'Priorità'), segmenti(RA.PRIORITA, a.priorita, x => { if (sola) return; a.priorita = x; disegnaPriorita(); })),
        campo('Promemoria', selezione(RA.PROMEMORIA, a.promemoriaMinuti === null || a.promemoriaMinuti === undefined ? '' : String(a.promemoriaMinuti), x => { a.promemoriaMinuti = x === '' ? null : Number(x); }, { disabled: sola })))]);
      const disegnaRipeti = () => {
        svuota(zone.ripeti);
        if (esistente) {
          // La serie c'è già: si dice com'è; cambiarla vuol dire toglierla e rifarla.
          if (a.idRicorrenza) aggiungi(zone.ripeti, [h('div', { class: 'riga-ripete' }, icona('ripeti', 18, 2.2), h('span', null, 'Si ripete ' + (ricEsistente ? RA.ricorrenzaAParole(ricEsistente) : '')))]);
          return;
        }
        const giornoBase = a.tipo === 'attivita' ? v.scadenza.value : v.giorno.value;
        aggiungi(zone.ripeti, [campo('Ripeti', selezione(RA.RIPETI, ripeti, x => { ripeti = x; disegnaRipeti(); }, { disabled: sola }))]);
        if (ripeti === 'personalizzato') {
          const ogni = h('input', { type: 'number', min: 1, max: 99, value: personalizzata.ogni, 'aria-label': 'Ogni quanti' });
          ogni.addEventListener('input', () => { personalizzata.ogni = Math.max(1, Number(ogni.value) || 1); });
          // 1 lunedì … 7 domenica, come li scrive il server.
          const giorni = (personalizzata.giorniSettimana || []).map(String);
          aggiungi(zone.ripeti, [h('div', { class: 'riga-campi' }, campo('Ogni', ogni),
            campo('Cosa', selezione([['giorni', 'giorni'], ['settimane', 'settimane'], ['mesi', 'mesi'], ['anni', 'anni']], personalizzata.regola, x => { personalizzata.regola = x; disegnaRipeti(); }))),
          personalizzata.regola === 'settimane' ? h('div', { class: 'pillole' }, [1, 2, 3, 4, 5, 6, 7].map(g => h('button', { type: 'button', class: 'pillola' + (giorni.indexOf(String(g)) >= 0 ? ' scelta' : ''),
            'aria-pressed': giorni.indexOf(String(g)) >= 0 ? 'true' : 'false', onclick: () => {
              const i = giorni.indexOf(String(g)); if (i >= 0) giorni.splice(i, 1); else giorni.push(String(g));
              personalizzata.giorniSettimana = giorni.map(Number).sort(); disegnaRipeti();
            } }, RA.GIORNI_BREVI[g % 7]))) : null]);
        }
        if (ripeti) {
          aggiungi(zone.ripeti, [h('div', { class: 'riga-campi' }, campo('Fino al', v.fineRic))]);
          const r = RA.ricorrenzaDa(ripeti, giornoBase, personalizzata);
          const prossime = giornoBase ? RA.prossimeDate(Object.assign({}, r, { fine: v.fineRic.value }), giornoBase, 4) : [];
          if (prossime.length) aggiungi(zone.ripeti, [h('div', { class: 'secondario' }, 'Le prossime: ' + prossime.map(g => RA.quandoBreve(g, oggi())).join(', '))]);
        }
      };
      v.fineRic.addEventListener('change', disegnaRipeti);
      v.scadenza.addEventListener('change', disegnaRipeti);
      v.giorno.addEventListener('change', disegnaRipeti);
      const disegnaChecklist = () => aggiungi(svuota(zone.checklist), [
        a.checklist.map((c, i) => {
          const casella = h('input', { type: 'checkbox', checked: !!c.fatta, disabled: sola, 'aria-label': c.testo });
          casella.addEventListener('change', async () => {
            c.fatta = casella.checked;
            if (esistente && c.id && !/^[a-z]+-/.test(String(c.id))) {
              const ris = await lavora('Segno', () => Rete.post('/server/spuntaChecklist', { id: c.id, fatta: c.fatta }));
              if (ris && ris.attivita) accogli(ris.attivita, a);
            }
          });
          const testo = h('input', { type: 'text', value: c.testo, disabled: sola, 'aria-label': 'Voce della checklist' });
          testo.addEventListener('input', () => { c.testo = testo.value; });
          return h('div', { class: 'riga-checklist' + (c.fatta ? ' fatta' : '') }, casella, testo, sola ? null : tondo('chiudi', 'Togli', () => { a.checklist.splice(i, 1); disegnaChecklist(); }, 'piccolo'));
        }),
        sola ? null : h('div', { class: 'campo-con-pulsante' }, v.nuovaVoce, h('button', { type: 'button', class: 'btn', onclick: aggiungiVoce }, 'Aggiungi'))]);
      const aggiungiVoce = () => {
        const t = v.nuovaVoce.value.trim();
        if (!t) { v.nuovaVoce.focus(); return; }
        a.checklist.push({ id: 'c-' + Date.now().toString(36), testo: t, fatta: false });
        v.nuovaVoce.value = '';
        disegnaChecklist();
        setTimeout(() => v.nuovaVoce.focus(), 20);
      };
      v.nuovaVoce.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aggiungiVoce(); } });
      const disegnaAllegati = () => aggiungi(svuota(zone.allegati), [
        (a.allegati || []).concat(allegatiNuovi).map(f => h('div', { class: 'riga-allegato' }, icona('graffetta', 18, 2.2),
          h('button', { type: 'button', class: 'btn collegamento', onclick: () => { if (f.id) W.apriFile(f); } }, f.nome || 'file'),
          sola ? null : tondo('chiudi', 'Togli l\'allegato', async () => {
            if (!f.id) { allegatiNuovi.splice(allegatiNuovi.indexOf(f), 1); disegnaAllegati(); return; }
            const ris = await lavora('Tolgo l\'allegato', () => Rete.post('/server/togliAllegato', { id: f.id }));
            if (ris) { a.allegati = a.allegati.filter(x => x.id !== f.id); if (ris.attivita) accogli(ris.attivita, a); disegnaAllegati(); }
          }, 'piccolo'))),
        sola ? null : h('div', null, h('button', { type: 'button', class: 'btn piccolo', onclick: async () => {
          const f = await Rete.post('/locale/scegli-file', { filtro: 'tutti' }).catch(() => null);
          if (!f || !f.ok) return;
          if (!esistente) { allegatiNuovi.push({ nome: f.nome, mime: f.mime, base64: f.base64 }); disegnaAllegati(); return; }
          const ris = await lavora('Carico ' + f.nome, () => Rete.post('/server/caricaFile', { tipo: 'attivita', idAttivita: a.id, nome: f.nome, mime: f.mime, base64: f.base64, idFile: 'pc' + Date.now().toString(36) }));
          if (ris && ris.file) { a.allegati.push(Object.assign({ nome: f.nome }, ris.file)); disegnaAllegati(); }
        } }, icona('graffetta', 16, 2.2), 'Allega un file'))]);

      disegnaTipo(); disegnaQuando(); disegnaChi(); disegnaLegami(); disegnaPriorita(); disegnaRipeti(); disegnaChecklist(); disegnaAllegati();

      /** Il modulo nella forma di salvaAttivita. */
      const leggiModulo = () => {
        const x = Object.assign({}, a, { titolo: v.titolo.value.trim(), descrizione: v.descrizione.value.trim(), luogo: v.luogo.value.trim(), tuttoIlGiorno: v.tuttoIlGiorno.checked });
        if (a.tipo === 'attivita') { x.scadenza = v.scadenza.value; x.inizio = ''; x.fine = ''; } else {
          x.scadenza = '';
          x.inizio = v.giorno.value + 'T' + (v.tuttoIlGiorno.checked ? '00:00' : v.inizio.value || '09:00') + ':00';
          x.fine = v.tuttoIlGiorno.checked ? '' : v.giorno.value + 'T' + (v.fine.value || v.inizio.value || '10:00') + ':00';
        }
        x.checklist = a.checklist.map((c, i) => ({ id: /^[a-z]+-/.test(String(c.id)) ? undefined : c.id, testo: c.testo, fatta: !!c.fatta, ordine: i + 1 })).filter(c => String(c.testo || '').trim());
        delete x.allegati;
        // La serie di un'attività che c'è già non si rimanda: cambiarla rifarebbe le occorrenze.
        if (esistente) delete x.ricorrenza;
        if (!esistente && ripeti) x.ricorrenza = Object.assign(RA.ricorrenzaDa(ripeti, x.scadenza || String(x.inizio).slice(0, 10), personalizzata), { fine: v.fineRic.value || '' });
        return x;
      };

      let chiudi;
      const salva = async () => {
        const x = leggiModulo();
        errori = {};
        if (!x.titolo) errori.titolo = 'Scrivi cosa c\'è da fare';
        if (a.tipo !== 'attivita' && !v.giorno.value) errori.quando = 'Scegli il giorno';
        if (a.tipo !== 'attivita' && x.fine && x.fine <= x.inizio) errori.fine = 'Finisce prima di cominciare';
        if (Object.keys(errori).length) { ridisegnaTutto(); avviso('Mancano dei dati: sono segnati in rosso', true); return; }
        // Una ricorrenza: solo questa, da questa in poi, tutte.
        let perRicorrenza;
        if (esistente && esistente.idRicorrenza) {
          perRicorrenza = await sceltaRicorrenza('Cambiare anche le altre volte?');
          if (!perRicorrenza) return;
        }
        // Lo stesso tempo della stessa persona: il server si ferma e chiede conferma (serveConferma).
        const corpo = perRicorrenza ? { attivita: perSalvare(x), perRicorrenza } : { attivita: perSalvare(x) };
        const ris = await W.scriviConConferma('Salvo l\'attività', '/server/salvaAttivita', corpo, domandaSovrapposte);
        if (!ris) return;
        const salvata = ris.attivita ? RA.normalizzaAttivita(ris.attivita) : null;
        // Gli allegati scelti prima di salvare partono adesso che l'attività ha il suo numero.
        for (const f of allegatiNuovi) {
          if (!salvata) break;
          await lavora('Carico ' + f.nome, () => Rete.post('/server/caricaFile', { tipo: 'attivita', idAttivita: salvata.id, nome: f.nome, mime: f.mime, base64: f.base64, idFile: 'pc' + Date.now().toString(36) }));
        }
        chiudi();
        // Una ricorrenza nuova o cambiata tocca più righe: si rilegge tutto.
        if (x.ricorrenza || perRicorrenza || allegatiNuovi.length) daRileggere(); else accogli(ris.attivita, esistente);
        W.caricaDashboard();
        avviso(esistente ? 'Attività salvata' : (x.ricorrenza ? 'Attività creata: si ripete ' + RA.ricorrenzaAParole(x.ricorrenza) : 'Attività creata'));
        W.ridisegna();
      };
      const togli = async () => {
        let perRicorrenza;
        if (esistente.idRicorrenza) { perRicorrenza = await sceltaRicorrenza('Togliere anche le altre volte?'); if (!perRicorrenza) return; } else if (!(await conferma('Togliere l\'attività?', esistente.titolo + ' sparisce dagli elenchi e dal calendario.', 'Togli', true))) return;
        const ris = await lavora('Tolgo l\'attività', () => Rete.post('/server/togliAttivita', perRicorrenza ? { id: esistente.id, perRicorrenza } : { id: esistente.id }));
        if (!ris) return;
        chiudi();
        daRileggere();
        W.caricaDashboard();
        avviso(ris.tolte > 1 ? ris.tolte + ' attività tolte' : 'Attività tolta');
        W.ridisegna();
      };

      const rapportino = esistente && a.tipo !== 'attivita' && puo('rapportini', 2)
        ? h('button', { type: 'button', class: 'btn grande', onclick: () => { chiudi(); W.moduloRapportino(null, { data: String(a.inizio).slice(0, 10), idCliente: a.idCliente, idCommessa: a.idCommessa }); } }, 'Scrivi il rapportino') : null;
      const corpo = h('div', { class: 'modulo modulo-attivita' });
      const ridisegnaTutto = () => aggiungi(svuota(corpo), [
        h('div', { class: 'col' }, campo('Titolo', v.titolo, errori.titolo), zone.tipo, zone.quando, zone.chi, zone.legami, zone.priorita, zone.ripeti),
        h('div', { class: 'col' }, h('h3', null, 'Checklist'), zone.checklist, campo('Note', v.descrizione), h('h3', null, 'Allegati'), zone.allegati)]);
      ridisegnaTutto();
      chiudi = finestra({
        titolo: esistente ? (sola ? esistente.titolo : 'Modifica l\'attività') : (a.tipo === 'attivita' ? 'Nuova attività' : 'Nuovo ' + NOMI_TIPO[a.tipo].toLowerCase()), larghezza: 'larga', corpo, fuoco: !esistente,
        pulsanti: [esistente && !sola ? h('button', { type: 'button', class: 'btn testo grande pericolo', onclick: togli }, 'Togli') : null, rapportino, 'spazio',
          h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, sola ? 'Chiudi' : 'Annulla'),
          sola ? null : h('button', { type: 'button', class: 'btn giallo grande', 'data-visita': 'salva-attivita', onclick: salva }, 'Salva')].filter(Boolean),
      });
    }

    /** "Solo questa / da questa in poi / tutte": la risposta, o null se si annulla. */
    function sceltaRicorrenza(titolo) {
      return new Promise(risolvi => {
        let scelta = 'questa';
        let detto = false;
        const rispondi = x => { if (!detto) { detto = true; risolvi(x); } };
        const zona = h('div', { class: 'scelte-ruolo' });
        const disegna = () => aggiungi(svuota(zona), RA.PER_RICORRENZA.map(x => h('button', { type: 'button', class: 'scelta-ruolo' + (scelta === x[0] ? ' scelto' : ''), 'aria-pressed': scelta === x[0] ? 'true' : 'false',
          onclick: () => { scelta = x[0]; disegna(); } }, h('span', { class: 'pallino-scelta' }), h('span', { class: 'testi' }, h('b', null, x[1])))));
        disegna();
        let chiudi;
        chiudi = finestra({ titolo, corpo: zona, fuoco: false, allaChiusura: () => rispondi(null),
          pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => { rispondi(null); chiudi(); } }, 'Annulla'),
            h('button', { type: 'button', class: 'btn giallo grande', onclick: () => { rispondi(scelta); chiudi(); } }, 'Conferma')] });
      });
    }

    // ===================================================================== calendario

    const ORE = { da: 7, a: 20, alta: 46 };

    function periodoCalendario(g) {
      if (M.vistaCal === 'mese') { const s = RA.grigliaMese(g.slice(0, 7)); return [s[0][0], s[s.length - 1][6]]; }
      const sett = RA.settimanaDi(g);
      return [sett[0], sett[6]];
    }

    /** Il colore di una persona nel calendario: io in giallo tenue, gli altri a turno. */
    function colorePersona(id) {
      if (!id) return 'c-libera';
      if (String(id) === String(io())) return 'c-io';
      const i = persone().findIndex(u => String(u.id) === String(id));
      return 'c-' + ['blu', 'verde', 'viola', 'ambra'][(i < 0 ? 0 : i) % 4];
    }

    function delCalendario() {
      return (M.periodo || []).filter(a => a.stato !== 'annullata' && (!M.soloMiei || String(a.assegnataA) === String(io())));
    }

    function calendario(pagina) {
      const g = M.giorno || oggi();
      const sett = RA.settimanaDi(g);
      const sposta = d => {
        const passo = M.vistaCal === 'mese' ? null : (M.vistaCal === 'giorno' ? 1 : 7) * d;
        if (passo === null) { const x = new Date(g.slice(0, 7) + '-15T12:00:00'); x.setMonth(x.getMonth() + d); M.giorno = R.isoGiorno(x).slice(0, 8) + '01'; } else M.giorno = RA.piuGiorni(g, passo);
        W.disegnaPagina();
      };
      const titolo = M.vistaCal === 'mese' ? RA.nomeMese(g) : M.vistaCal === 'giorno' ? R.dataTitolo(g) : RA.nomeMese(sett[3]).split(' ')[0] + ', settimana ' + RA.numeroSettimana(g);
      const area = h('div', { class: 'area-calendario' });
      aggiungi(pagina, [testata('Calendario', 'calendario'),
        h('div', { class: 'testa-calendario' },
          tondo('indietro', M.vistaCal === 'mese' ? 'Mese prima' : M.vistaCal === 'giorno' ? 'Giorno prima' : 'Settimana prima', () => sposta(-1)),
          tondo('avanti', M.vistaCal === 'mese' ? 'Mese dopo' : M.vistaCal === 'giorno' ? 'Giorno dopo' : 'Settimana dopo', () => sposta(1)),
          h('h2', { class: 'titolo-calendario' }, titolo),
          h('button', { type: 'button', class: 'btn piccolo', onclick: () => { M.giorno = oggi(); W.disegnaPagina(); } }, 'Oggi'),
          h('label', { class: 'spunta-campo piccola' }, h('input', { type: 'checkbox', checked: M.soloMiei, onchange: e => { M.soloMiei = e.target.checked; W.disegnaPagina(); } }), 'Solo i miei'),
          segmenti([['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese']], M.vistaCal, x => { M.vistaCal = x; M.giorno = g; W.disegnaPagina(); })),
        area]);
      if (M.vistaCal === 'mese') mese(area, g);
      else griglia(area, M.vistaCal === 'giorno' ? [g] : sett);
    }

    /** La griglia delle ore: sette colonne (o una sola per il giorno), le attività con la sola scadenza in cima. */
    function griglia(area, giorni) {
      const lista = delCalendario();
      const col = '60px repeat(' + giorni.length + ', minmax(0, 1fr))';
      const ore = [];
      for (let o = ORE.da; o < ORE.a; o++) ore.push(o);
      const testa = h('div', { class: 'cal-testa', style: { gridTemplateColumns: col } }, h('span'),
        giorni.map(gi => h('button', { type: 'button', class: 'cal-giorno' + (gi === oggi() ? ' oggi' : ''), onclick: () => { M.giorno = gi; M.vistaCal = 'giorno'; W.disegnaPagina(); } }, RA.nomeGiorno(gi, true))));
      const blocchi = giorni.map(gi => RA.blocchiDelGiorno(lista, gi));
      const tuttoIlGiorno = h('div', { class: 'cal-tutto', style: { gridTemplateColumns: col } }, h('span', { class: 'piccolo' }, 'giorno'),
        blocchi.map((b, i) => h('div', { class: 'cal-cella-tutto', 'data-giorno': giorni[i] }, b.tuttoIlGiorno.map(a => chip(a)))));
      const corpo = h('div', { class: 'cal-corpo', style: { gridTemplateColumns: col } });
      aggiungi(corpo, [h('div', { class: 'cal-ore' }, ore.map(o => h('div', { class: 'cal-ora', style: { height: ORE.alta + 'px' } }, o + ':00')))]);
      giorni.forEach((gi, i) => {
        const colonna = h('div', { class: 'cal-colonna' + (gi === oggi() ? ' oggi' : ''), style: { height: (ore.length * ORE.alta) + 'px' } },
          ore.map(o => h('button', { type: 'button', class: 'cal-slot', style: { height: ORE.alta + 'px' }, 'aria-label': 'Nuovo appuntamento ' + RA.nomeGiorno(gi) + ' alle ' + o, tabindex: '-1',
            onclick: () => { if (scrive()) modulo(null, { tipo: 'appuntamento', giorno: gi, ora: String(o).padStart(2, '0') + ':00' }); } })));
        blocchi[i].conOra.forEach(b => {
          const top = Math.max(0, (b.da - ORE.da) * ORE.alta);
          const alto = Math.max(22, (Math.min(ORE.a, b.a2) - Math.max(ORE.da, b.da)) * ORE.alta - 3);
          const largo = 100 / b.colonne;
          aggiungi(colonna, [h('button', { type: 'button', class: 'cal-blocco ' + colorePersona(b.a.assegnataA) + (b.a.stato === 'fatta' ? ' fatta' : ''),
            style: { top: top + 'px', height: alto + 'px', left: 'calc(' + (largo * b.colonna) + '% + 3px)', width: 'calc(' + largo + '% - 6px)' }, onclick: () => modulo(b.a) },
          h('b', null, b.a.titolo), h('span', null, RA.ora(b.a.inizio) + (b.a.fine ? '-' + RA.ora(b.a.fine) : '') + (b.a.assegnataA ? ' · ' + RA.iniziali(nomeUtente(b.a.assegnataA)) : '')),
          giorni.length === 1 && b.a.luogo ? h('span', null, b.a.luogo) : null)]);
        });
        if (gi === oggi()) {
          const adesso = new Date();
          const x = adesso.getHours() + adesso.getMinutes() / 60;
          if (x >= ORE.da && x <= ORE.a) aggiungi(colonna, [h('div', { class: 'cal-adesso', style: { top: ((x - ORE.da) * ORE.alta) + 'px' } })]);
        }
        aggiungi(corpo, [colonna]);
      });
      aggiungi(area, [h('div', { class: 'tab calendario-settimana' + (giorni.length === 1 ? ' un-giorno' : ''), 'data-visita': 'calendario' }, testa, tuttoIlGiorno, corpo)]);
    }

    function chip(a) {
      return h('button', { type: 'button', class: 'cal-chip ' + colorePersona(a.assegnataA) + (a.stato === 'fatta' ? ' fatta' : ''), title: a.titolo, onclick: e => { e.stopPropagation(); modulo(a); } },
        a.priorita === 'alta' ? h('i', { class: 'pallino-alta' }) : null, a.titolo);
    }

    function mese(area, g) {
      const lista = delCalendario();
      const settimane = RA.grigliaMese(g.slice(0, 7));
      aggiungi(area, [h('div', { class: 'tab calendario-mese' },
        h('div', { class: 'mese-testa' }, [1, 2, 3, 4, 5, 6, 0].map(x => h('span', null, RA.GIORNI_BREVI[x]))),
        settimane.map(s => h('div', { class: 'mese-riga' }, s.map(gi => {
          const del = RA.ordina(lista.filter(a => RA.giornoDi(a) === gi));
          return h('div', { class: 'mese-cella' + (gi.slice(0, 7) !== g.slice(0, 7) ? ' fuori' : '') + (gi === oggi() ? ' oggi' : ''), role: 'button', tabindex: '0',
            onclick: () => { M.giorno = gi; M.vistaCal = 'giorno'; W.disegnaPagina(); }, onkeydown: e => { if (e.key === 'Enter') { M.giorno = gi; M.vistaCal = 'giorno'; W.disegnaPagina(); } } },
          h('span', { class: 'num-giorno' }, String(Number(gi.slice(8)))),
          del.slice(0, 3).map(a => h('span', { class: 'cal-chip ' + colorePersona(a.assegnataA) + (a.stato === 'fatta' ? ' fatta' : '') }, (RA.conOrario(a) && a.inizio && !a.tuttoIlGiorno ? RA.ora(a.inizio) + ' ' : '') + a.titolo)),
          del.length > 3 ? h('span', { class: 'piccolo' }, 'e altre ' + (del.length - 3)) : null);
        }))))]);
    }

    // ===================================================================== pianificazione

    /**
     * La settimana per persona (computer): righe = persone, colonne = giorni da
     * lunedì a venerdì; a sinistra le non assegnate da trascinare su una persona e
     * un giorno. Anche quelle già assegnate si spostano trascinando.
     */
    function pianificazione(pagina) {
      const giorni = RA.settimanaDi(M.settimanaPian || oggi()).slice(0, 5);
      const p = RA.pianificazione(tutte(), giorni, persone());
      const sposta = d => { M.settimanaPian = RA.piuGiorni(giorni[0], 7 * d); W.disegnaPagina(); };
      const col = '150px repeat(' + giorni.length + ', minmax(0, 1fr))';
      // Il collaboratore sposta solo quelle che può cambiare, e solo sulla sua riga (il resto il server lo rifiuta).
      const collaboratore = S.io && S.io.utente && S.io.utente.ruolo === 'collaboratore';
      const scheda = a => h('div', { class: 'card-pian ' + (a.assegnataA ? colorePersona(a.assegnataA) : 'libera'), draggable: puoCambiare(a) ? 'true' : null, role: 'button', tabindex: '0', title: a.titolo,
        'data-attivita': a.id, onclick: () => modulo(a), ondragstart: e => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(a.id)); } catch (x) { /* niente */ } trascinata = a; } },
      h('b', null, a.titolo), h('span', null, [RA.conOrario(a) && a.inizio && !a.tuttoIlGiorno ? RA.ora(a.inizio) : '', a.idCommessa, !a.assegnataA && RA.giornoDi(a) ? RA.quandoBreve(RA.giornoDi(a), oggi()) : ''].filter(Boolean).join(' · ')));
      const cella = (u, gi, lista) => {
        const c = h('div', { class: 'cella-pian' + (gi === oggi() ? ' oggi' : ''), 'data-giorno': gi, 'data-utente': u.id }, lista.map(scheda));
        if (scrive() && (!collaboratore || String(u.id) === String(io()))) {
          c.addEventListener('dragover', e => { if (trascinata) { e.preventDefault(); c.classList.add('accoglie'); } });
          c.addEventListener('dragleave', () => c.classList.remove('accoglie'));
          c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('accoglie'); if (trascinata) assegna(trascinata, u.id, gi); trascinata = null; });
        }
        return c;
      };
      aggiungi(pagina, [testata('Pianificazione della settimana', 'pianificazione'),
        h('div', { class: 'testa-calendario' }, tondo('indietro', 'Settimana prima', () => sposta(-1)), tondo('avanti', 'Settimana dopo', () => sposta(1)),
          h('h2', { class: 'titolo-calendario' }, 'Dal ' + RA.nomeGiorno(giorni[0]) + ' al ' + RA.nomeGiorno(giorni[4]))),
        h('div', { class: 'griglia-pian' },
          h('div', { class: 'scheda libere-pian', 'data-visita': 'non-assegnate' }, h('span', { class: 'etichetta' }, 'Non assegnate · ' + p.libere.length),
            p.libere.length ? p.libere.map(scheda) : h('div', { class: 'piccolo' }, 'Tutte assegnate')),
          h('div', { class: 'tab tab-pian' },
            h('div', { class: 'testa-pian', style: { gridTemplateColumns: col } }, h('span'), giorni.map(gi => h('span', { class: gi === oggi() ? 'oggi' : '' }, RA.nomeGiorno(gi, true)))),
            p.righe.map(r => h('div', { class: 'riga-pian', style: { gridTemplateColumns: col } },
              h('div', { class: 'chi-pian' }, h('span', { class: 'cerchio-io piccolo' }, RA.iniziali(r.utente.nome)), h('b', null, r.utente.nome.split(' ')[0])),
              r.giorni.map((lista, i) => cella(r.utente, giorni[i], lista))))))]);
    }

    let trascinata = null;

    /** Trascinata su una persona e un giorno: si assegna e, se serve, cambia giorno (l'ora resta). */
    async function assegna(a, idUtente, giorno) {
      // Solo quello che cambia: chi, e il giorno (l'ora resta).
      const x = { id: a.id, assegnataA: idUtente };
      if (RA.conOrario(a) && a.inizio) {
        x.inizio = giorno + String(a.inizio).slice(10);
        if (a.fine) x.fine = giorno + String(a.fine).slice(10);
      } else x.scadenza = giorno;
      const corpo = a.idRicorrenza ? { attivita: x, perRicorrenza: 'questa' } : { attivita: x };
      const ris = await W.scriviConConferma('Assegno', '/server/salvaAttivita', corpo, domandaSovrapposte);
      if (!ris) return;
      accogli(ris.attivita, a);
      W.caricaDashboard();
      avviso(a.titolo + ' a ' + nomeUtente(idUtente).split(' ')[0] + ', ' + RA.quandoBreve(giorno, oggi()), false, null, { testo: 'Annulla', fn: async () => {
        const prima = { id: a.id, assegnataA: a.assegnataA, scadenza: a.scadenza, inizio: a.inizio, fine: a.fine };
        const indietro = await lavora('Rimetto com\'era', () => Rete.post('/server/salvaAttivita', Object.assign({ attivita: prima, conferma: true }, a.idRicorrenza ? { perRicorrenza: 'questa' } : {})));
        if (indietro) { accogli(indietro.attivita, a); W.ridisegna(); }
      } });
      W.ridisegna();
      W.Visita.azione('assegna-attivita');
    }

    /** La domanda quando il server dice che un appuntamento si sovrappone a un altro della stessa persona. */
    function domandaSovrapposte(d) {
      const chi = d.sovrapposte && d.sovrapposte[0] ? (d.sovrapposte[0].assegnata || nomeUtente(d.sovrapposte[0].assegnataA)).split(' ')[0] + ' ha già ' : 'C\'è già ';
      const quali = (d.sovrapposte || []).map(y => y.titolo + ' (' + RA.ora(y.inizio) + (y.fine ? '-' + RA.ora(y.fine) : '') + ')').join(', ');
      return conferma('Si sovrappone a un altro appuntamento', quali ? chi + quali + '. Salvarlo lo stesso?' : (d.errore || 'Si sovrappone a un altro appuntamento') + '. Salvarlo lo stesso?', 'Salva lo stesso');
    }

    return { vista, modulo, M, daRileggere };
  };
})(window);
