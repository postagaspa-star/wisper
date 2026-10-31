/*
 * Wisper Ufficio, fase 6: Mezzi e attrezzature (docs/gestionale/fase6.md §12.4, risposte in architettura.md §17.10-17.12).
 *
 * Segmenti Mezzi · Strumenti · Attrezzature · DPI · Assegnazioni · Manutenzioni · Scadenze; il collaboratore ha in più
 * "Il mio" (il mezzo che usa, i suoi strumenti). Un clic apre il pannello del mezzo o dello strumento (440).
 *
 * Lo stato della taratura è sempre con la parola; lo strumento non conforme non si usa; quello scaduto si usa solo
 * confermando (nel rapportino). I costi dei mezzi si vedono solo col permesso dei soldi.
 */
(function (radice) {
  'use strict';

  radice.WisperMezzi = function (W) {
    const { S, C, R, B, Rete } = W;
    const P = radice.WisperRegolePersone;
    const { h, aggiungi, svuota, icona, iniziali, pillola, avviso, lavora, finestra, conferma, campo, conSuffisso, selezione, segmenti, riga, quadrato, segnaposto } = B;
    const F = () => W.F6;
    const puo = W.puo;
    const soldi = W.soldi;
    const scrive = () => puo('mezzi', 2);
    const interfaccia = () => (S.io && S.io.interfaccia) || {};
    const idPersonaIo = () => interfaccia().idPersona || null;
    const collaboratore = () => (S.io && S.io.utente && S.io.utente.ruolo) === 'collaboratore';
    const oggi = () => C.oggiIso();
    const dataIt = iso => (iso ? C.data(iso) : '');
    const pill = (parola, colore) => pillola(parola, colore || P.colore(parola));
    const numKm = n => (n === null || n === undefined || n === '' ? '—' : C.numero(n));

    const M = { segmento: '', filtroS: 'tutti', mezzi: null, attrezzature: null, assegnazioni: null, storico: null, manutenzioni: null, scadenze: null, dpi: null, persone: null, aperto: null, scheda: null, tipoAperto: '' };
    function daRileggere() { Object.assign(M, { mezzi: null, attrezzature: null, assegnazioni: null, storico: null, manutenzioni: null, scadenze: null, dpi: null, persone: null, aperto: null, scheda: null }); }

    function segmentiMezzi() {
      const v = [['mezzi', 'Mezzi'], ['strumenti', 'Strumenti'], ['attrezzature', 'Attrezzature'], ['dpi', 'DPI'], ['assegnazioni', 'Assegnazioni'], ['manutenzioni', 'Manutenzioni'], ['scadenze', 'Scadenze']];
      return collaboratore() ? [['miei', 'Il mio']].concat(v) : v;
    }

    function vista(pagina, a1, a2, filtro) {
      const voci = segmentiMezzi();
      let seg = a1 && a1 !== 'mezzo' && a1 !== 'at' ? a1 : '';
      if (filtro && filtro.segmento) seg = filtro.segmento;
      if (filtro && filtro.taratura === 'scadute') M.filtroS = 'scaduta';
      if (a1 === 'mezzo') seg = 'mezzi';
      if (a1 === 'at') seg = M.tipoAperto || 'strumenti';
      if (!seg) seg = M.segmento && voci.some(v => v[0] === M.segmento) ? M.segmento : voci[0][0];
      if (!voci.some(v => v[0] === seg)) seg = voci[0][0];
      M.segmento = seg;
      ({ miei, mezzi, strumenti, attrezzature, dpi, assegnazioni, manutenzioni, scadenze })[seg](pagina, voci);
      if (a1 === 'mezzo' && a2) apriMezzo(a2);
      if (a1 === 'at' && a2) apriAttrezzatura(a2);
    }

    function barra(voci, seg) {
      return h('div', null, segmenti(voci, seg, x => { M.segmento = x; F().chiudiPannello(true); W.vai('#mezzi/' + x); }));
    }

    // ===================================================================== dati

    async function leggiMezzi() { if (!M.mezzi) M.mezzi = await Rete.get('/server/mezzi'); }
    async function leggiAttrezzature() { if (!M.attrezzature) M.attrezzature = await Rete.get('/server/attrezzature'); }
    async function leggiPersone() {
      if (M.persone) return;
      if (puo('persone')) { try { M.persone = ((await Rete.get('/server/persone')).persone || []).map(p => ({ id: p.id, nome: p.nome })); return; } catch (e) { /* sotto */ } }
      M.persone = S.ana.utenti.filter(u => u.idPersona && u.attivo !== false).map(u => ({ id: u.idPersona, nome: u.nome }));
    }

    // ===================================================================== il mio (il collaboratore)

    function miei(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Quello che hai', F6.gialloPagina('Prendi uno strumento', prendiDaElenco, 'misura')), barra(voci, 'miei')]);
      F6.conDati(pagina, () => Promise.all([leggiMezzi(), leggiAttrezzature()]), () => {
        const m = (M.mezzi.mezzi || []).find(x => x.mio && x.proprieta === 'studio') || (M.mezzi.mezzi || []).find(x => x.mio);
        const mie = (M.attrezzature.attrezzature || []).filter(a => a.mio);
        if (m) {
          aggiungi(pagina, [h('div', { class: 'scheda stretta-820 fila-f6' }, h('span', { class: 'etichetta' }, 'Il mezzo che usi'),
            riga({ sinistra: quadrato('furgone', m.fermo ? 'ico-rosso' : 'ico-blu'), titolo: m.titolo, sotto: m.km !== null && m.km !== undefined ? numKm(m.km) + ' km · letti il ' + dataIt(m.kmIl).slice(0, 5) : 'Km non ancora letti', onclick: () => apriMezzo(m.id) }),
            h('div', { class: 'pillole-testa' }, pill(m.statoVisto, P.coloreMezzo(m.stato)), m.prossimaScadenza ? pill(nomeScadenza(m.prossimaScadenza.tipo) + ': ' + m.prossimaScadenza.statoVisto.toLowerCase(), P.colore(m.prossimaScadenza.statoVisto)) : null,
              m.guastiAperti ? pill(m.guastiAperti === 1 ? '1 guasto aperto' : m.guastiAperti + ' guasti aperti', 'ambra') : null),
            m.proprieta === 'studio' ? h('div', { class: 'pillole' }, h('button', { type: 'button', class: 'btn', onclick: () => segnaKm(m) }, icona('km', 18, 2.2), 'Segna i km'),
              h('button', { type: 'button', class: 'btn', onclick: () => segnalaGuasto({ idVeicolo: m.id, nome: m.titolo, km: m.km }) }, icona('allarme', 18, 2.2), 'Segnala un guasto')) : null)]);
        }
        aggiungi(pagina, [F6.sez('I tuoi strumenti', tabellaAttrezzature(mie.filter(a => a.categoria === 'strumento'), true)),
          F6.sez('Attrezzature e DPI', F6.righe(mie.filter(a => a.categoria !== 'strumento').map(rigaAttrezzatura), 'Nessuna attrezzatura.'))]);
        if (!m && !mie.length) aggiungi(pagina, [h('div', { class: 'calmo' }, 'Non hai mezzi né strumenti assegnati')]);
      });
    }

    // ===================================================================== mezzi

    const nomeScadenza = t => ({ assicurazione: 'Assicurazione', bollo: 'Bollo', revisione: 'Revisione', tagliando: 'Tagliando' }[t] || P.maiuscola(String(t || '')));

    function mezzi(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Mezzi', scrive() ? F6.gialloPagina('Aggiungi un mezzo', () => moduloMezzo(null), 'piu') : null), barra(voci, 'mezzi')]);
      F6.conDati(pagina, leggiMezzi, () => {
        const lista = M.mezzi.mezzi || [];
        const n = M.mezzi.conteggi || {};
        aggiungi(pagina, [F6.riquadri([[n.mezzi !== undefined ? n.mezzi : lista.length, 'mezzi'], [n.fermi, 'fermi', null, true], [n.guastiAperti, 'guasti aperti', () => W.vai('#mezzi/manutenzioni')], [n.scadenzeVicine, 'scadenze vicine', () => W.vai('#mezzi/scadenze')]])]);
        const col = 'minmax(0, 1.4fr) 170px 170px 100px 130px minmax(0, 1.2fr)';
        const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Mezzo'), h('span', null, 'Di chi è'), h('span', null, 'Chi ce l\'ha'),
          h('span', { class: 'n' }, 'Km'), h('span', { class: 'n' }, 'Tagliando'), h('span', null, 'Prossima scadenza')));
        lista.forEach(m => aggiungi(tab, [h('div', { class: 'r cliccabile' + (M.tipoAperto === 'mezzi' && String(M.aperto) === String(m.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-mezzo': m.id,
          onclick: () => apriMezzo(m.id), onkeydown: e => { if (e.key === 'Enter') apriMezzo(m.id); } },
        h('span', { class: 'doppia' }, h('span', null, m.titolo), h('span', null, P.nomeDi(P.TIPI_MEZZO, m.tipo) + (m.fermo ? ' · fermo' : ''))),
        h('span', { class: 't2 taglia' }, m.proprieta === 'studio' ? 'Dello studio' : m.proprietaVista),
        h('span', null, pill(m.statoVisto, P.coloreMezzo(m.stato))),
        h('span', { class: 'n' }, numKm(m.km)),
        h('span', { class: 'n' }, m.kmAlTagliando !== null && m.kmAlTagliando !== undefined ? (m.kmAlTagliando < 0 ? 'passato di ' + C.numero(-m.kmAlTagliando) + ' km' : 'fra ' + C.numero(m.kmAlTagliando) + ' km') : '—'),
        h('span', null, m.prossimaScadenza ? pill(nomeScadenza(m.prossimaScadenza.tipo) + ': ' + m.prossimaScadenza.statoVisto.toLowerCase(), P.colore(m.prossimaScadenza.statoVisto))
          : m.proprieta === 'persona' && m.euroKm !== null && m.euroKm !== undefined ? h('span', { class: 't2' }, 'Rimborso ' + C.numero(m.euroKm) + ' €/km') : h('span', { class: 't2' }, '—')))]));
        aggiungi(pagina, [lista.length ? tab : h('p', { class: 'vuoto' }, 'Nessun mezzo.')]);
      });
    }

    async function apriMezzo(id) {
      M.aperto = id;
      M.tipoAperto = 'mezzi';
      document.querySelectorAll('.tab .r[data-mezzo]').forEach(x => x.classList.toggle('scelta', String(x.dataset.mezzo) === String(id)));
      F().pannello({ dove: 'Mezzo', corpo: segnaposto(4, 64) });
      try {
        const r = await Rete.get('/server/mezzo?id=' + encodeURIComponent(id));
        if (String(M.aperto) !== String(id)) return;
        M.scheda = r.mezzo;
        disegnaMezzo();
      } catch (e) {
        if (e && e.accesso === false) return;
        F().pannello({ dove: 'Mezzo', corpo: h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e))) });
      }
    }

    function disegnaMezzo() {
      const F6 = F();
      const m = M.scheda;
      const out = [h('div', { class: 'pillole-testa' }, pill(m.statoVisto, P.coloreMezzo(m.stato)), pill(m.proprietaVista || (m.proprieta === 'studio' ? 'Dello studio' : 'Auto di una persona'), 'grigio')),
        h('h2', { class: 'titolo-scheda' }, m.titolo),
        h('span', { class: 'sotto-titolo' }, [P.nomeDi(P.TIPI_MEZZO, m.tipo), m.alimentazione, m.immatricolazione ? 'immatricolato il ' + dataIt(m.immatricolazione) : ''].filter(Boolean).join(' · '))];
      if (m.fermo && m.motivoFermo) out.push(h('div', { class: 'banda' }, icona('allarme', 18), h('span', { class: 'spazio' }, m.motivoFermo)));
      const mio = !!m.mio;
      if (m.proprieta === 'studio' && (mio || scrive() || m.puoSegnareKm)) {
        out.push(h('div', { class: 'pillole' }, h('button', { type: 'button', class: 'btn', onclick: () => segnalaGuasto({ idVeicolo: m.id, nome: m.titolo, km: m.km }) }, icona('allarme', 18, 2.2), 'Segnala un guasto'),
          !mio && m.puoSegnareKm ? h('button', { type: 'button', class: 'btn', onclick: () => segnaKm(m) }, icona('km', 18, 2.2), 'Segna i km') : null));
      }
      if (m.proprieta === 'persona') {
        out.push(F6.coppie([['Di chi è', (m.chi && m.chi.nome) || ''], ['Rimborso km', m.euroKm !== null && m.euroKm !== undefined ? C.numero(m.euroKm) + ' € al km' + (m.annoAci ? ' · tabelle ACI ' + m.annoAci : '') : ''],
          ['Trasferte dell\'anno', m.trasferte ? (m.trasferte.quante || 0) + ' · ' + C.numero(m.trasferte.km || 0) + ' km' : null]]));
      }
      if (m.proprieta === 'studio') {
        const c = m.chi;
        out.push(F6.sez('Chi ce l\'ha', F6.righe([riga({ sinistra: c && c.nome ? iniziali(c.nome, true) : quadrato('spunta', 'ico-verde'), titolo: c && c.nome ? c.nome : 'Disponibile',
          sotto: c && c.nome ? (c.tipo === 'prestito' ? 'In prestito' : c.tipo === 'laboratorio' ? 'In officina' : 'Assegnato') + (c.dal ? ' dal ' + dataIt(c.dal) : '') + (c.rientro ? ' · rientro il ' + dataIt(c.rientro) : '') : 'Nessuno ce l\'ha',
          onclick: scrive() ? () => assegna({ idVeicolo: m.id, nome: m.titolo }, c && c.nome ? 'prestito' : 'assegnato') : null })])));
      }
      if ((m.scadenze || []).length || m.proprieta === 'studio') {
        out.push(F6.sez('Scadenze', F6.righe((m.scadenze || []).map(x => riga({ sinistra: quadrato('bandiera', x.statoVisto === 'Scaduta' ? 'ico-rosso' : /^Scade/.test(x.statoVisto) ? 'ico-giallo' : 'ico-grigio'), titolo: x.titolo,
          sotto: dataIt(x.data), destra: pill(x.statoVisto === 'Scaduta' ? 'Scaduta ' + (x.statoDettaglio || '') : x.statoVisto, x.statoVisto === 'Prossima' ? 'grigio' : P.colore(x.statoVisto)), onclick: () => W.Archivio.apriScadenza(x.id, x) })), m.proprieta === 'persona' ? 'Non tenute: è un\'auto personale.' : 'Nessuna scadenza scritta.')));
      }
      if (m.proprieta === 'studio') {
        out.push(F6.sez('Km', h('div', { class: 'scheda fila-f6' }, h('b', { class: 'grande-f6' }, m.km !== null && m.km !== undefined ? numKm(m.km) + ' km' : 'Km non ancora letti'),
          h('span', { class: 'sotto-titolo' }, [m.kmIl ? 'Letti il ' + dataIt(m.kmIl) : '', m.kmAlTagliando !== null && m.kmAlTagliando !== undefined ? (m.kmAlTagliando < 0 ? 'tagliando passato di ' + C.numero(-m.kmAlTagliando) + ' km' : 'tagliando fra ' + C.numero(m.kmAlTagliando) + ' km') : ''].filter(Boolean).join(' · ')),
          (m.letture || []).slice(0, 5).map(l => h('div', { class: 'rc-f6' }, h('span', null, dataIt(l.data) + ' · ' + (l.utente || '') + (l.origine !== 'mano' ? ' · ' + ({ rifornimento: 'rifornimento', manutenzione: 'manutenzione' }[l.origine] || l.origine) : '')), h('b', null, C.numero(l.km)))))));
      }
      out.push(sezioneGuasti(m.manutenzioni || [], { idVeicolo: m.id, nome: m.titolo }));
      if (soldi() && m.costi) out.push(sezioneCosti(m.costi));
      if ((m.documenti || []).length || scrive()) out.push(sezioneDocumenti(m.documenti || [], 'mezzo', { idVeicolo: m.id }, 'Documenti dei mezzi'));
      if ((m.assegnazioni || []).length) out.push(F6.sez('Storico', F6.righe(m.assegnazioni.map(a => riga({ sinistra: quadrato('storia'), titolo: a.chi || '',
        sotto: (a.tipoVisto || '') + ' dal ' + dataIt(a.dal) + (a.al ? ' al ' + dataIt(a.al) : ' · in corso') })))));
      const guastoFermo = (m.manutenzioni || []).find(x => x.stato !== 'chiusa' && x.fermo);
      const giallo = guastoFermo && scrive() ? F6.gialloPannello('Chiudi il guasto', () => chiudiManutenzione(guastoFermo))
        : mio && m.proprieta === 'studio' ? F6.gialloPannello('Segna i km', () => segnaKm(m))
          : m.puoPrendere ? F6.gialloPannello('Lo prendo io', () => prendo({ idVeicolo: m.id, nome: m.titolo })) : null;
      const menu = scrive() ? [{ testo: 'Cambia', fn: () => moduloMezzo(m) },
        m.proprieta === 'studio' ? { testo: 'Assegna', fn: () => assegna({ idVeicolo: m.id, nome: m.titolo }, 'assegnato') } : null,
        m.proprieta === 'studio' ? { testo: 'Presta', fn: () => assegna({ idVeicolo: m.id, nome: m.titolo }, 'prestito') } : null,
        m.chi && m.chi.idAssegnazione && m.proprieta === 'studio' ? { testo: 'Segna restituito', fn: () => restituisci({ idAssegnazione: m.chi.idAssegnazione, nome: m.titolo }) } : null,
        { testo: 'Nuova manutenzione', fn: () => moduloManutenzione({ idVeicolo: m.id, nome: m.titolo, km: m.km }) },
        '-', { testo: 'Dismetti', fn: () => dismetti('mezzo', m), pericolo: true }] : null;
      F6.pannello({ dove: 'Mezzo', titolo: m.titolo, corpo: out, menu, giallo });
    }

    function sezioneGuasti(lista, ogg) {
      const F6 = F();
      const ordinate = lista.slice().sort((a, b) => (a.stato === 'chiusa') - (b.stato === 'chiusa'));
      return F6.sez(ogg.idVeicolo ? 'Guasti e manutenzioni' : 'Guasti', F6.righe(ordinate.map(g => riga({
        sinistra: quadrato(g.stato === 'chiusa' ? 'spunta' : 'allarme', g.stato === 'chiusa' ? 'ico-verde' : g.fermo ? 'ico-rosso' : 'ico-giallo'),
        titolo: g.titolo, sotto: [dataIt(g.data), g.segnalataDaNome, g.km ? C.numero(g.km) + ' km' : '', g.esito].filter(Boolean).join(' · '),
        destra: h('span', { class: 'pillole-destra' }, pill(g.statoVisto || P.STATI_MANUTENZIONE[g.stato] || '', g.stato === 'chiusa' ? 'verde' : g.stato === 'in_officina' ? 'ambra' : 'giallo'),
          g.fermo && g.stato !== 'chiusa' ? pill('Fermo', 'rosso') : null, (g.foto || []).length ? pill((g.foto.length === 1 ? '1 foto' : g.foto.length + ' foto'), 'grigio') : null),
        onclick: g.stato !== 'chiusa' && (scrive() || (g.segnalataDa && S.io && S.io.utente && String(g.segnalataDa) === String(S.io.utente.id))) ? () => chiudiManutenzione(g) : (g.foto || []).length ? () => W.Archivio.apriFile(g.foto[0].url || '/file/' + g.foto[0].id, 'Foto del guasto') : null,
      })), 'Nessun guasto.'));
    }

    function sezioneCosti(c) {
      const F6 = F();
      return F6.sez('Costi dell\'anno', h('div', { class: 'scheda fila-f6' },
        (c.voci || []).length ? c.voci.map(v => h('div', { class: 'rc-f6' }, h('span', null, v.nome + (v.quante ? ' · ' + v.quante : '')), h('b', null, C.euro(v.importo)))) : h('span', { class: 'sotto-titolo' }, 'Nessun costo nel ' + (c.anno || '')),
        h('div', { class: 'rc-f6 tot' }, h('span', null, 'Totale' + (c.km && c.km.anno ? ' · ' + C.numero(c.km.anno) + ' km' : '')), h('b', null, C.euro(c.totale || 0))),
        c.euroKm !== null && c.euroKm !== undefined && (c.voci || []).length ? h('div', { class: 'rc-f6' }, h('span', null, 'Al km'), h('b', null, C.euro(c.euroKm))) : null));
    }

    function sezioneDocumenti(lista, per, legami, categoria) {
      const F6 = F();
      return F6.sez('Documenti', F6.righe(lista.map(d => riga({ sinistra: quadrato('file'), titolo: d.titolo, sotto: [d.categoria, d.dataDocumento ? dataIt(d.dataDocumento) : ''].filter(Boolean).join(' · '),
        onclick: () => W.Archivio.apriFile(d.url, d.nomeFile || d.titolo) })), 'Nessun documento.'), scrive() ? F6.piccolo('Carica', () => caricaDocumento(per, legami, categoria), 'carica') : null);
    }

    async function caricaDocumento(per, legami, categoria) {
      const F6 = F();
      const cats = await lavora('Leggo le categorie', () => F6.categorie());
      if (!cats) return;
      const scelto = await W.Archivio.scegliFile('documenti');
      if (!scelto) return;
      const idFile = 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const r = await lavora('Carico il documento', async () => {
        const c = await W.Archivio.carica(scelto, per, idFile);
        return Rete.post('/server/salvaDocumento', { documento: Object.assign({ titolo: String(scelto.nome || '').replace(/\.[a-z0-9]+$/i, ''), idCategoria: F6.idCategoria(cats, categoria), origine: 'file', idFile: c.file.id, idLocale: 'pc-' + idFile }, legami) });
      });
      if (!r) return;
      avviso('Documento caricato');
      riapri();
    }

    /** Aggiungi un mezzo (finestra: dati a sinistra, scadenze e tagliando a destra). */
    async function moduloMezzo(m0) {
      if (!(await lavora('Preparo', () => leggiPersone().then(() => true)))) return;
      const m = m0 || { nome: '', targa: '', tipo: 'furgone', proprieta: 'studio' };
      const inp = (k, tipo, extra) => h('input', Object.assign({ type: tipo || 'text', value: m[k] === null || m[k] === undefined ? '' : String(m[k]), autocomplete: 'off' }, extra || {}));
      const scad = k => { const s = (m.scadenze || []).find(x => x.tipo === k && x.stato === 'aperta'); return s ? s.data : ''; };
      const v = { nome: inp('nome'), targa: inp('targa'), immatricolazione: inp('immatricolazione', 'date'), alimentazione: inp('alimentazione', 'text', { placeholder: 'benzina, gasolio, ibrida, elettrica' }),
        euroKm: h('input', { type: 'text', inputmode: 'decimal', value: m.euroKm ? R.numeroCampo(m.euroKm) : '' }), annoAci: inp('annoAci', 'text', { inputmode: 'numeric' }), note: h('textarea', { rows: 2 }),
        assicurazione: h('input', { type: 'date', value: scad('assicurazione') }), bollo: h('input', { type: 'date', value: scad('bollo') }), revisione: h('input', { type: 'date', value: scad('revisione') }), tagliando: h('input', { type: 'date', value: scad('tagliando') }),
        tagliandoKm: inp('tagliandoKm', 'text', { inputmode: 'numeric' }), tagliandoUltimoKm: inp('tagliandoUltimoKm', 'text', { inputmode: 'numeric' }), tagliandoOgniMesi: inp('tagliandoOgniMesi', 'text', { inputmode: 'numeric' }) };
      v.note.value = m.note || '';
      const x = { tipo: m.tipo || 'furgone', proprieta: m.proprieta || 'studio', idPersona: m.idPersona || (M.persone[0] && M.persone[0].id) };
      v.immatricolazione.addEventListener('change', () => { if (!v.revisione.value && v.immatricolazione.value) v.revisione.value = P.scadenzaRevisione(v.immatricolazione.value, ''); });
      let errori = {};
      const zona = h('div', { class: 'modulo' });
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'col' }, h('div', { class: 'riga-campi' }, campo('Nome', v.nome, errori.nome), campo('Targa', v.targa, errori.targa)),
          h('div', { class: 'campo' }, h('label', null, 'Tipo'), h('div', { class: 'pillole' }, P.TIPI_MEZZO.map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.tipo === t[0] ? ' scelta' : ''), onclick: () => { x.tipo = t[0]; disegna(); } }, t[1])))),
          h('div', { class: 'campo' }, h('label', null, 'Di chi è'), segmenti([['studio', 'Dello studio'], ['persona', 'Auto di una persona']], x.proprieta, k => { x.proprieta = k; disegna(); })),
          x.proprieta === 'persona' ? h('div', { class: 'pillole' }, M.persone.map(p => h('button', { type: 'button', class: 'pillola piccola' + (String(x.idPersona) === String(p.id) ? ' scelta' : ''), onclick: () => { x.idPersona = p.id; disegna(); } }, p.nome))) : null,
          h('div', { class: 'riga-campi' }, campo('Immatricolato il', v.immatricolazione), campo('Alimentazione', v.alimentazione)),
          x.proprieta === 'persona' ? h('div', { class: 'riga-campi' }, campo('Euro al km', conSuffisso(v.euroKm, '€/km'), errori.euroKm), campo('Anno delle tabelle ACI', v.annoAci)) : null,
          campo('Note', v.note)),
        h('div', { class: 'col' }, h('h3', null, 'Scadenze'), h('div', { class: 'riga-campi' }, campo('Assicurazione', v.assicurazione), campo('Bollo', v.bollo)),
          h('div', { class: 'riga-campi' }, campo('Revisione', v.revisione), campo('Tagliando', v.tagliando)),
          h('h3', null, 'Tagliando'), h('div', { class: 'riga-campi tre' }, campo('Ogni', conSuffisso(v.tagliandoKm, 'km')), campo('L\'ultimo a', conSuffisso(v.tagliandoUltimoKm, 'km')), campo('Oppure ogni', conSuffisso(v.tagliandoOgniMesi, 'mesi'))))]);
      disegna();
      let chiudi;
      const num = i => (i.value.trim() === '' ? null : C.num(i.value));
      const salva = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = 'Nome: scrivi il nome del mezzo';
        if (v.targa.value.trim() && !/^[A-Za-z0-9]+$/.test(v.targa.value.trim())) errori.targa = 'Targa: lettere e cifre, senza spazi';
        if (Object.keys(errori).length) { disegna(); return; }
        const mezzo = { nome: v.nome.value.trim(), targa: v.targa.value.trim().toUpperCase(), tipo: x.tipo, proprieta: x.proprieta, immatricolazione: v.immatricolazione.value || '', alimentazione: v.alimentazione.value.trim(),
          note: v.note.value.trim(), tagliandoKm: num(v.tagliandoKm), tagliandoUltimoKm: num(v.tagliandoUltimoKm), tagliandoOgniMesi: num(v.tagliandoOgniMesi), scadenze: {} };
        if (x.proprieta === 'persona') { mezzo.idPersona = x.idPersona; mezzo.euroKm = C.numONull(v.euroKm.value); if (v.annoAci.value.trim()) mezzo.annoAci = Number(v.annoAci.value.trim()); }
        ['assicurazione', 'bollo', 'revisione', 'tagliando'].forEach(k => { if (v[k].value) mezzo.scadenze[k] = v[k].value; });
        if (m0) mezzo.id = m0.id;
        const r = await lavora('Salvo il mezzo', () => Rete.post('/server/salvaMezzo', { mezzo }));
        if (!r) return;
        chiudi();
        M.mezzi = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        W.caricaDashboard();
        avviso(m0 ? 'Mezzo salvato' : 'Mezzo aggiunto: ' + (r.mezzo && r.mezzo.titolo));
        M.segmento = 'mezzi';
        if (r.mezzo) W.vai('#mezzi/mezzo/' + r.mezzo.id); else W.disegnaPagina();
      };
      chiudi = finestra({ titolo: m0 ? 'Cambia ' + m0.titolo : 'Aggiungi un mezzo', larghezza: 'larga', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, m0 ? 'Salva' : 'Salva il mezzo')] });
    }

    // ===================================================================== strumenti, attrezzature, DPI

    /** Una tabella di attrezzature: codice, nome, matricola, chi ce l'ha, taratura (pillola e data), dove, stato. */
    function tabellaAttrezzature(lista, compatta) {
      if (!lista.length) return h('p', { class: 'vuoto sinistra' }, 'Niente qui.');
      const col = compatta ? '80px minmax(0, 1.4fr) minmax(0, 1fr) 240px' : '80px minmax(0, 1.4fr) 110px minmax(0, 1fr) 220px minmax(0, 0.9fr)';
      const tab = h('div', { class: 'tab' }, h('div', { class: 'r testa', style: { gridTemplateColumns: col } }, h('span', null, 'Codice'), h('span', null, 'Nome'),
        compatta ? null : h('span', null, 'Matricola'), h('span', null, 'Chi ce l\'ha'), h('span', null, 'Taratura'), compatta ? null : h('span', null, 'Dove')));
      lista.forEach(a => {
        const t = a.taratura;
        aggiungi(tab, [h('div', { class: 'r cliccabile' + (M.tipoAperto !== 'mezzi' && String(M.aperto) === String(a.id) ? ' scelta' : ''), style: { gridTemplateColumns: col }, role: 'button', tabindex: '0', 'data-attrezzatura': a.id,
          onclick: () => apriAttrezzatura(a.id), onkeydown: e => { if (e.key === 'Enter') apriAttrezzatura(a.id); } },
        h('span', null, h('span', { class: 'codice' }, a.codice)),
        h('span', { class: 'doppia' }, h('span', null, a.nome), h('span', null, [a.marca, a.modello].filter(Boolean).join(' ') || a.categoriaNome)),
        compatta ? null : h('span', { class: 't2' }, a.matricola || '—'),
        h('span', null, chiPill(a)),
        h('span', null, t ? pill(t.parola, P.coloreTaratura(t)) : h('span', { class: 't2' }, '—')),
        compatta ? null : h('span', { class: 't2 taglia' }, a.chi && a.chi.tipo === 'laboratorio' ? a.chi.nome : a.posizione || '—'))]);
      });
      return tab;
    }

    /** "Chi ce l'ha": la persona, la commessa, il collaboratore o il laboratorio (lo stato della taratura sta nella sua colonna). */
    function chiPill(a) {
      const c = a.chi;
      if (a.stato === 'fuori' || a.stato === 'fuori_uso') return pill(a.statoVisto, 'rosso');
      if (c && c.nome) return pill((c.tipo === 'prestito' ? 'In prestito a ' : c.tipo === 'assegnato' ? 'Assegnato a ' : '') + c.nome, 'blu');
      if (a.stato === 'disponibile' || (a.stato === 'scaduta' && !c)) return pill('Disponibile', 'verde');
      return pill(a.statoVisto, P.coloreAttrezzatura(a.stato));
    }

    function rigaAttrezzatura(a) {
      const t = a.taratura;
      return riga({ sinistra: quadrato(a.categoria === 'dpi' ? 'scudo' : a.categoria === 'informatica' ? 'laptop' : a.categoria === 'strumento' ? 'misura' : 'attrezzo', t && (t.stato === 'scaduta' || t.stato === 'non_conforme') ? 'ico-rosso' : 'ico-grigio'),
        titolo: a.nome, sotto: [a.codice, a.matricola ? 'matr. ' + a.matricola : '', a.statoVisto].filter(Boolean).join(' · '), destra: t ? pill(t.parola, P.coloreTaratura(t)) : null, onclick: () => apriAttrezzatura(a.id) });
    }

    function strumenti(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Strumenti di misura', scrive() ? F6.gialloPagina('Aggiungi uno strumento', () => moduloAttrezzatura(null, 'strumento'), 'piu') : null), barra(voci, 'strumenti')]);
      F6.conDati(pagina, leggiAttrezzature, () => {
        const tutti = (M.attrezzature.attrezzature || []).filter(a => a.categoria === 'strumento');
        const n = M.attrezzature.conteggi || {};
        aggiungi(pagina, [F6.riquadri([[n.strumenti !== undefined ? n.strumenti : tutti.length, 'strumenti', () => { M.filtroS = 'tutti'; W.disegnaPagina(); }],
          [n.tarateScadute, 'taratura scaduta', () => { M.filtroS = 'scaduta'; W.disegnaPagina(); }, true], [n.inScadenza, 'in scadenza'], [n.alLaboratorio, 'al laboratorio']])]);
        const filtri = [['tutti', 'Tutti'], ['miei', 'Miei'], ['scaduta', 'Taratura scaduta'], ['disponibili', 'Disponibili']];
        let l = tutti;
        if (M.filtroS === 'miei') l = l.filter(a => a.mio);
        if (M.filtroS === 'scaduta') l = l.filter(a => a.taratura && (a.taratura.stato === 'scaduta' || a.taratura.stato === 'non_conforme'));
        if (M.filtroS === 'disponibili') l = l.filter(a => a.stato === 'disponibile');
        aggiungi(pagina, [h('div', { class: 'pillole' }, filtri.map(f => h('button', { type: 'button', class: 'pillola piccola' + (M.filtroS === f[0] ? ' scelta' : ''), onclick: () => { M.filtroS = f[0]; W.disegnaPagina(); } }, f[1]))),
          tabellaAttrezzature(l)]);
      });
    }

    function attrezzature(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Attrezzature', scrive() ? F6.gialloPagina('Aggiungi un\'attrezzatura', () => moduloAttrezzatura(null, 'attrezzo'), 'piu') : null), barra(voci, 'attrezzature')]);
      F6.conDati(pagina, leggiAttrezzature, () => {
        aggiungi(pagina, [tabellaAttrezzature((M.attrezzature.attrezzature || []).filter(a => a.categoria !== 'strumento' && a.categoria !== 'dpi'))]);
      });
    }

    function dpi(pagina, voci) {
      const F6 = F();
      const puoConsegnare = scrive() || puo('persone', 2);
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'DPI', puoConsegnare ? F6.gialloPagina('Consegna un DPI', consegnaDaQui, 'scudo') : null), barra(voci, 'dpi')]);
      F6.conDati(pagina, async () => { await leggiAttrezzature(); if (!M.dpi) M.dpi = await Rete.get('/server/dpi'); }, () => {
        const cons = M.dpi.consegne || [];
        aggiungi(pagina, [F6.sez('Consegne', F6.righe(cons.map(d => riga({ sinistra: iniziali(d.persona || '', true), titolo: d.cosa + (d.taglia ? ' · taglia ' + d.taglia : ''),
          sotto: [d.persona, 'consegnato il ' + dataIt(d.data), d.restituitoIl ? 'restituito il ' + dataIt(d.restituitoIl) : ''].filter(Boolean).join(' · '),
          destra: d.restituitoIl ? pill('Restituito', 'grigio') : d.firmata ? pill('Firmata', 'verde') : pill('Da firmare', 'giallo') })), 'Nessuna consegna.')),
        F6.sez('DPI con verifica', tabellaAttrezzature((M.attrezzature.attrezzature || []).filter(a => a.categoria === 'dpi')))]);
      });
    }

    async function consegnaDaQui() {
      if (!(await lavora('Leggo le persone', () => leggiPersone().then(() => true)))) return;
      let scelta = null;
      let chiudi;
      chiudi = finestra({ titolo: 'A chi consegni il DPI?', fuoco: false, corpo: h('div', { class: 'scelte-ruolo' }, M.persone.map(p => h('button', { type: 'button', class: 'scelta-ruolo', onclick: () => { scelta = p; chiudi(); W.Persone.consegnaDpi(p); } },
        iniziali(p.nome, true), h('span', { class: 'testi' }, h('b', null, p.nome))))),
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Annulla')] });
      return scelta;
    }

    async function apriAttrezzatura(id) {
      M.aperto = id;
      document.querySelectorAll('.tab .r[data-attrezzatura]').forEach(x => x.classList.toggle('scelta', String(x.dataset.attrezzatura) === String(id)));
      F().pannello({ dove: 'Strumento', corpo: segnaposto(4, 64) });
      try {
        const r = await Rete.get('/server/attrezzatura?id=' + encodeURIComponent(id));
        if (String(M.aperto) !== String(id)) return;
        M.scheda = r.attrezzatura;
        const seg = r.attrezzatura.categoria === 'strumento' ? 'strumenti' : r.attrezzatura.categoria === 'dpi' ? 'dpi' : 'attrezzature';
        // Arrivando da un collegamento (#mezzi/at/4) si va nel segmento della sua categoria.
        if (M.tipoAperto !== seg || M.segmento !== seg) {
          M.tipoAperto = seg;
          if (M.segmento !== seg && location.hash.indexOf('#mezzi/at/') === 0) { M.segmento = seg; W.disegnaPagina(); return; }
        }
        disegnaAttrezzatura(r.usiDaControllare);
      } catch (e) {
        if (e && e.accesso === false) return;
        F().pannello({ dove: 'Strumento', corpo: h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, e.message || String(e))) });
      }
    }

    function disegnaAttrezzatura() {
      const F6 = F();
      const a = M.scheda;
      const t = a.taratura;
      const dpiC = a.controllo === 'verifica';
      // Lo stato e la taratura: una pillola sola quando dicono la stessa cosa ("Taratura scaduta").
      const doppia = t && (t.parola === a.statoVisto || (/^(Taratura|Verifica)/.test(a.statoVisto) && t.parola.indexOf(a.statoVisto) === 0) || (a.stato === 'laboratorio' && t.stato === 'laboratorio'));
      const out = [h('div', { class: 'pillole-testa' }, h('span', { class: 'codice' }, a.codice), doppia ? pill(t.parola, P.coloreTaratura(t)) : pill(a.statoVisto, P.coloreAttrezzatura(a.stato)), t && !doppia ? pill(t.parola, P.coloreTaratura(t)) : null),
        h('h2', { class: 'titolo-scheda' }, a.nome),
        h('span', { class: 'sotto-titolo' }, [a.categoriaNome, [a.marca, a.modello].filter(Boolean).join(' '), a.matricola ? 'matr. ' + a.matricola : '', a.posizione].filter(Boolean).join(' · '))];
      const usiC = a.usiDaControllare || [];
      if (usiC.length || (a.fuoriUso === 'non_conforme' && a.fraseUsi)) {
        out.push(h('div', { class: 'banda fascia-f6' }, icona('allarme', 20), h('span', { class: 'spazio' }, a.fraseUsi || ('Usato in ' + usiC.length + ' interventi: controlla se le misure valgono'))));
        out.push(F6.righe(usiC.map(u => riga({ sinistra: quadrato('firma', 'ico-rosso'), titolo: (u.idRapportino || u.ticket || '') + ' · ' + dataIt(u.data), sotto: [u.cliente, u.impianto, u.chi].filter(Boolean).join(' · '),
          onclick: u.idRapportino ? () => W.vaiA({ pagina: 'rapportino', id: u.idRapportino }) : null }))));
      }
      if (a.mio && a.chi && a.chi.idAssegnazione) out.push(h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => restituisci({ idAssegnazione: a.chi.idAssegnazione, nome: a.nome }) }, 'Restituisci')));
      else if (scrive() && a.chi && a.chi.tipo === 'prestito') out.push(h('div', null, h('button', { type: 'button', class: 'btn', onclick: () => restituisci({ idAssegnazione: a.chi.idAssegnazione, nome: a.nome }) }, 'Segna restituito')));
      if (a.controllo) {
        const ult = (a.tarature || [])[0];
        out.push(F6.sez(dpiC ? 'Verifica' : 'Taratura', h('div', { class: 'scheda fila-f6' },
          h('b', null, ult ? ult.frase : (dpiC ? 'Verifica non scritta' : 'Taratura non scritta')),
          h('span', { class: 'sotto-titolo' }, ['ogni ' + (a.controlloOgniMesi || 12) + ' mesi', a.laboratorio ? 'di solito ' + a.laboratorio : ''].filter(Boolean).join(' · ')),
          ult && ult.idDocumento ? h('div', null, F6.piccolo('Apri il certificato', () => W.Archivio.apriFile('/file/' + ult.idDocumento, 'Certificato ' + (ult.certificato || '')), 'file')) : null,
          (a.tarature || []).length > 1 ? h('div', { class: 'righe-calme' }, a.tarature.slice(1, 5).map(x => h('span', null, dataIt(x.data) + ' · ' + x.esitoVisto + (x.certificato ? ' · ' + x.certificato : '')))) : null)));
      }
      const c = a.chi;
      const come = c ? ({ assegnato: 'assegnato', prestito: 'in prestito', laboratorio: 'al laboratorio', riparazione: 'in riparazione' }[c.tipo] || '') : '';
      out.push(F6.sez('Chi ce l\'ha', F6.coppie([['Adesso', c && c.nome ? c.nome + (come ? ' · ' + come : '') : 'Nessuno: è disponibile'], ['Da', c && c.dal ? dataIt(c.dal) : ''], ['Rientro', c && c.rientro ? dataIt(c.rientro) : ''], ['Posizione', a.posizione || '']])));
      out.push(F6.sez('Usato in', F6.righe((a.usi || []).slice(0, 10).map(u => { const s = P.statoAllora(Object.assign({ verifica: dpiC }, u)); return riga({ sinistra: quadrato('firma'), titolo: (u.idRapportino || u.ticket || '') + ' · ' + dataIt(u.data),
        sotto: [u.cliente, u.impianto, u.chi].filter(Boolean).join(' · '), destra: s.parola ? pill(s.parola, s.colore) : null, onclick: u.idRapportino ? () => W.vaiA({ pagina: 'rapportino', id: u.idRapportino }) : null }); }), 'Mai usato in un intervento.')));
      out.push(sezioneGuasti(a.manutenzioni || [], { idAttrezzatura: a.id, nome: a.nome }));
      if ((a.documenti || []).length || scrive()) out.push(sezioneDocumenti(a.documenti || [], 'attrezzatura', { idAttrezzatura: a.id }, a.controllo === 'taratura' ? 'Certificati di taratura' : 'Documenti dei mezzi'));
      if (soldi() && a.costi && (a.costi.totale || a.costi.spese || a.costi.fattureRicevute)) {
        out.push(F6.sez('Costi', h('div', { class: 'scheda fila-f6' }, h('div', { class: 'rc-f6' }, h('span', null, 'Spese'), h('b', null, C.euro(a.costi.spese || 0))),
          h('div', { class: 'rc-f6' }, h('span', null, 'Fatture ricevute'), h('b', null, C.euro(a.costi.fattureRicevute || 0))), h('div', { class: 'rc-f6 tot' }, h('span', null, 'Totale'), h('b', null, C.euro(a.costi.totale || 0))))));
      }
      const daTarare = t && ['scaduta', 'in_scadenza', 'non_conforme', 'laboratorio', 'senza'].indexOf(t.stato) >= 0;
      const giallo = scrive() && daTarare ? F6.gialloPannello(dpiC ? 'Registra la verifica' : 'Registra la taratura', () => registraTaratura(a))
        : a.puoPrendere ? F6.gialloPannello('Lo prendo io', () => prendo({ idAttrezzatura: a.id, nome: a.nome })) : null;
      const menu = scrive() ? [{ testo: 'Cambia', fn: () => moduloAttrezzatura(a) },
        a.controllo ? { testo: dpiC ? 'Manda in verifica' : 'Manda in taratura', fn: () => assegna({ idAttrezzatura: a.id, nome: a.nome }, 'laboratorio') } : null,
        a.controllo && !daTarare ? { testo: dpiC ? 'Registra la verifica' : 'Registra la taratura', fn: () => registraTaratura(a) } : null,
        { testo: 'Assegna', fn: () => assegna({ idAttrezzatura: a.id, nome: a.nome }, 'assegnato') },
        { testo: 'Presta', fn: () => assegna({ idAttrezzatura: a.id, nome: a.nome }, 'prestito') },
        { testo: 'Segnala un guasto', fn: () => segnalaGuasto({ idAttrezzatura: a.id, nome: a.nome }) },
        { testo: 'Nuova manutenzione', fn: () => moduloManutenzione({ idAttrezzatura: a.id, nome: a.nome }) },
        '-', { testo: 'Dismetti', fn: () => dismetti('attrezzatura', a), pericolo: true }]
        : a.mio ? [{ testo: 'Segnala un guasto', fn: () => segnalaGuasto({ idAttrezzatura: a.id, nome: a.nome }) }] : null;
      F6.pannello({ dove: a.categoria === 'strumento' ? 'Strumento' : a.categoriaNome || 'Attrezzatura', titolo: a.nome, corpo: out, menu, giallo });
    }

    /** Aggiungi uno strumento (o un'attrezzatura, un DPI): il codice proposto, la taratura ogni N mesi. */
    async function moduloAttrezzatura(a0, categoria) {
      if (!M.attrezzature) { if (!(await lavora('Preparo', () => leggiAttrezzature().then(() => true)))) return; }
      const a = a0 || { categoria: categoria || 'strumento', proprieta: 'studio', controllo: categoria === 'strumento' ? 'taratura' : categoria === 'dpi' ? 'verifica' : '', controlloOgniMesi: Number(S.ana.impostazioni.TARATURA_OGNI_MESI) || 12 };
      const inp = (k, tipo, extra) => h('input', Object.assign({ type: tipo || 'text', value: a[k] === null || a[k] === undefined ? '' : String(a[k]), autocomplete: 'off' }, extra || {}));
      const v = { codice: inp('codice', 'text', { placeholder: (M.attrezzature && M.attrezzature.prossimoCodice) || '' }), nome: inp('nome'), marca: inp('marca'), modello: inp('modello'), matricola: inp('matricola'),
        acquistatoIl: inp('acquistatoIl', 'date'), posizione: inp('posizione', 'text', { placeholder: 'Armadio dell\'ufficio' }), ogni: inp('controlloOgniMesi', 'text', { inputmode: 'numeric' }), note: h('textarea', { rows: 2 }),
        ultimaData: h('input', { type: 'date' }), ultimaScade: h('input', { type: 'date' }), certificato: h('input', { type: 'text' }) };
      v.note.value = a.note || '';
      const fornitori = S.ana.fornitori.filter(f => !f.archiviato);
      const x = { categoria: a.categoria, proprieta: a.proprieta || 'studio', controllo: a.controllo || '', idLaboratorio: a.idLaboratorio || '' };
      v.ultimaData.addEventListener('change', () => { if (v.ultimaData.value && !v.ultimaScade.value) v.ultimaScade.value = P.piuMesi(v.ultimaData.value, C.num(v.ogni.value) || 12); });
      let errori = {};
      const zona = h('div', { class: 'modulo' });
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'col' }, h('div', { class: 'riga-campi tre' }, campo('Codice', v.codice, errori.codice), campo('Nome', v.nome, errori.nome), campo('Matricola', v.matricola)),
          h('div', { class: 'campo' }, h('label', null, 'Categoria'), h('div', { class: 'pillole' }, P.CATEGORIE_ATTREZZATURA.map(c => h('button', { type: 'button', class: 'pillola piccola' + (x.categoria === c[0] ? ' scelta' : ''),
            onclick: () => { x.categoria = c[0]; if (!a0) x.controllo = c[0] === 'strumento' ? 'taratura' : c[0] === 'dpi' ? 'verifica' : ''; disegna(); } }, c[1])))),
          h('div', { class: 'riga-campi' }, campo('Marca', v.marca), campo('Modello', v.modello)),
          h('div', { class: 'campo' }, h('label', null, 'Di chi è'), h('div', { class: 'pillole' }, [['studio', 'Dello studio'], ['noleggio', 'A noleggio'], ['persona', 'Di una persona'], ['cliente', 'Del cliente']].map(c => h('button', { type: 'button', class: 'pillola piccola' + (x.proprieta === c[0] ? ' scelta' : ''), onclick: () => { x.proprieta = c[0]; disegna(); } }, c[1])))),
          h('div', { class: 'riga-campi' }, campo('Acquistato il', v.acquistatoIl), campo('Posizione', v.posizione)), campo('Note', v.note)),
        h('div', { class: 'col' }, h('h3', null, 'Controllo periodico'), segmenti([['taratura', 'Taratura'], ['verifica', 'Verifica'], ['', 'Niente']], x.controllo, k => { x.controllo = k; disegna(); }),
          x.controllo ? [campo('Ogni', conSuffisso(v.ogni, 'mesi'), errori.ogni),
            campo('Laboratorio di solito', selezione([['', 'Nessuno']].concat(fornitori.map(f => [f.id, f.nome])), x.idLaboratorio, k => { x.idLaboratorio = k; })),
            !a0 ? [h('h3', null, x.controllo === 'verifica' ? 'L\'ultima verifica' : 'L\'ultima taratura'), h('div', { class: 'riga-campi' }, campo('Il', v.ultimaData), campo('Fino al', v.ultimaScade)), campo('Numero del certificato', v.certificato)] : null] : null)]);
      disegna();
      let chiudi;
      const salva = async () => {
        errori = {};
        if (!v.nome.value.trim()) errori.nome = 'Nome: scrivi cos\'è';
        const ogni = C.num(v.ogni.value);
        if (x.controllo && v.ogni.value.trim() && (ogni < 1 || ogni > 120)) errori.ogni = 'Ogni: da 1 a 120 mesi';
        if (Object.keys(errori).length) { disegna(); return; }
        const at = { nome: v.nome.value.trim(), categoria: x.categoria, marca: v.marca.value.trim(), modello: v.modello.value.trim(), matricola: v.matricola.value.trim(), proprieta: x.proprieta,
          acquistatoIl: v.acquistatoIl.value || '', posizione: v.posizione.value.trim(), controllo: x.controllo, controlloOgniMesi: x.controllo ? (ogni || 12) : null, idLaboratorio: x.idLaboratorio || '', note: v.note.value.trim() };
        if (v.codice.value.trim()) at.codice = v.codice.value.trim().toUpperCase();
        if (!a0 && x.controllo && v.ultimaData.value) at.ultimaTaratura = { data: v.ultimaData.value, scade: v.ultimaScade.value || '', certificato: v.certificato.value.trim() };
        if (a0) at.id = a0.id;
        const r = await lavora('Salvo', () => Rete.post('/server/salvaAttrezzatura', { attrezzatura: at }));
        if (!r) return;
        chiudi();
        M.attrezzature = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        W.caricaDashboard();
        avviso(a0 ? 'Salvato' : 'Aggiunto: ' + (r.attrezzatura ? r.attrezzatura.codice + ' ' + r.attrezzatura.nome : at.nome));
        if (r.attrezzatura) W.vai('#mezzi/at/' + r.attrezzatura.id); else W.disegnaPagina();
      };
      chiudi = finestra({ titolo: a0 ? 'Cambia ' + a0.codice : (x.categoria === 'strumento' ? 'Aggiungi uno strumento' : 'Aggiungi un\'attrezzatura'), larghezza: 'larga', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    /** Registra la taratura: data, esito, scade il (proposta), laboratorio, certificato; con non conforme, dopo, gli usi da controllare. */
    function registraTaratura(a) {
      const dpiC = a.controllo === 'verifica';
      const fornitori = S.ana.fornitori.filter(f => !f.archiviato);
      const x = { esito: 'conforme', idLaboratorio: a.idLaboratorio || (a.chi && a.chi.tipo === 'laboratorio' ? a.chi.idSoggetto : '') || '', file: null, tornaA: true };
      const v = { data: h('input', { type: 'date', value: oggi() }), scade: h('input', { type: 'date', value: P.piuMesi(oggi(), a.controlloOgniMesi || 12) }), certificato: h('input', { type: 'text' }) };
      v.data.addEventListener('change', () => { v.scade.value = P.piuMesi(v.data.value || oggi(), a.controlloOgniMesi || 12); });
      const zona = h('div', { class: 'fila' });
      const usati = Array.from(new Set([x.idLaboratorio].filter(Boolean)));
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, a.codice + ' · ' + a.nome),
        h('div', { class: 'campo' }, h('label', null, 'Esito'), h('div', { class: 'pillole' }, [['conforme', 'Conforme'], ['regolato', 'Regolato'], ['non_conforme', 'Non conforme']].map(e => h('button', { type: 'button', class: 'pillola' + (x.esito === e[0] ? ' scelta' : ''), onclick: () => { x.esito = e[0]; disegna(); } }, e[1])))),
        h('div', { class: 'riga-campi' }, campo('Il', v.data), x.esito !== 'non_conforme' ? campo('Scade il', v.scade) : null),
        h('div', { class: 'campo' }, h('label', null, 'Laboratorio'), usati.length ? h('div', { class: 'pillole' }, usati.map(id => { const f = fornitori.find(y => y.id === id); return f ? h('button', { type: 'button', class: 'pillola piccola' + (x.idLaboratorio === id ? ' scelta' : ''), onclick: () => { x.idLaboratorio = id; disegna(); } }, f.nome) : null; })) : null,
          selezione([['', 'Scegli']].concat(fornitori.map(f => [f.id, f.nome])), x.idLaboratorio, k => { x.idLaboratorio = k; })),
        campo('Numero del certificato', v.certificato),
        h('div', { class: 'pillole' }, h('button', { type: 'button', class: 'btn', onclick: async () => { const f = await W.Archivio.scegliFile('documenti'); if (f) { x.file = f; disegna(); } } }, icona('carica', 18, 2.2), x.file ? x.file.nome : 'Carica il certificato')),
        a.chi && a.chi.tipo === 'laboratorio' && x.esito !== 'non_conforme' ? h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: x.tornaA, onchange: e => { x.tornaA = e.target.checked; } }), 'Torna a chi l\'aveva') : null]);
      disegna();
      let chiudi;
      const salva = async () => {
        const t = { idAttrezzatura: a.id, data: v.data.value || oggi(), esito: x.esito, idLaboratorio: x.idLaboratorio || '', certificato: v.certificato.value.trim() };
        if (x.esito !== 'non_conforme' && v.scade.value) t.scade = v.scade.value;
        const r = await lavora('Salvo la ' + (dpiC ? 'verifica' : 'taratura'), async () => {
          if (x.file) { const c = await W.Archivio.carica(x.file, 'attrezzatura', 'pc' + Date.now().toString(36)); t.idFile = c.file.id; }
          return Rete.post('/server/registraTaratura', { taratura: t, tornaA: !!x.tornaA });
        });
        if (!r) return;
        chiudi();
        M.attrezzature = null;
        W.caricaDashboard();
        avviso(x.esito === 'non_conforme' ? 'Fuori uso: non conforme' : (dpiC ? 'Verifica' : 'Taratura') + ' salvata');
        if (r.attrezzatura) { M.scheda = Object.assign({}, M.scheda, r.attrezzatura, { usiDaControllare: r.usiDaControllare || [], fraseUsi: r.fraseUsi || '' }); }
        W.disegnaPagina();
        apriAttrezzatura(a.id);
      };
      chiudi = finestra({ titolo: dpiC ? 'Registra la verifica' : 'Registra la taratura', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, dpiC ? 'Salva la verifica' : 'Salva la taratura')] });
    }

    // ===================================================================== assegnare, prestare, prendere, restituire

    /** Assegna o presta (a una persona, una commessa, un collaboratore), o manda al laboratorio o in riparazione. */
    async function assegna(ogg, tipo0) {
      if (!(await lavora('Preparo', () => leggiPersone().then(() => true)))) return;
      const x = { tipo: tipo0 || 'assegnato', chi: 'persona', idPersona: '', idCommessa: '', idSoggetto: '' };
      const v = { rientro: h('input', { type: 'date', value: tipo0 === 'prestito' || tipo0 === 'laboratorio' ? P.giorniDopo(oggi(), 7) : '' }), nota: h('input', { type: 'text' }) };
      const fornitori = S.ana.fornitori.filter(f => !f.archiviato);
      const commesse = S.ana.commesse.filter(m => m.stato === 'APERTA' && !m.archiviata && !m.modello);
      const zona = h('div', { class: 'fila' });
      const disegna = () => {
        const fornitore = x.tipo === 'laboratorio' || x.tipo === 'riparazione';
        if (fornitore) x.chi = 'soggetto';
        aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, ogg.nome),
          segmenti([['assegnato', 'Assegna'], ['prestito', 'Presta'], ogg.idAttrezzatura ? ['laboratorio', 'Al laboratorio'] : ['laboratorio', 'In officina'], ['riparazione', 'In riparazione']], x.tipo, k => { x.tipo = k; disegna(); }),
          !fornitore && x.tipo === 'prestito' ? segmenti([['persona', 'A una persona'], ['commessa', 'A una commessa'], ['soggetto', 'A un collaboratore']], x.chi, k => { x.chi = k; disegna(); }) : null,
          x.chi === 'persona' && !fornitore ? h('div', { class: 'pillole' }, M.persone.map(p => h('button', { type: 'button', class: 'pillola piccola' + (String(x.idPersona) === String(p.id) ? ' scelta' : ''), onclick: () => { x.idPersona = p.id; disegna(); } }, p.nome))) : null,
          x.chi === 'commessa' && !fornitore ? campo('Commessa', selezione([['', 'Scegli']].concat(commesse.map(m => [m.id, m.id + ' · ' + m.descrizione])), x.idCommessa, k => { x.idCommessa = k; })) : null,
          x.chi === 'soggetto' ? campo(fornitore ? 'Laboratorio o officina' : 'Collaboratore', selezione([['', 'Scegli']].concat(fornitori.map(f => [f.id, f.nome])), x.idSoggetto, k => { x.idSoggetto = k; })) : null,
          x.tipo !== 'assegnato' ? campo('Rientro', v.rientro) : null, campo('Nota', v.nota)]);
      };
      disegna();
      let chiudi;
      const salva = async () => {
        const corpo = Object.assign({ tipo: x.tipo, nota: v.nota.value.trim(), idLocale: 'pc-' + Date.now().toString(36) }, ogg.idVeicolo ? { idVeicolo: ogg.idVeicolo } : { idAttrezzatura: ogg.idAttrezzatura });
        if (x.tipo !== 'assegnato' && v.rientro.value) corpo.rientro = v.rientro.value;
        if (x.chi === 'persona' && x.tipo !== 'laboratorio' && x.tipo !== 'riparazione') corpo.idPersona = x.idPersona;
        else if (x.chi === 'commessa') corpo.idCommessa = x.idCommessa;
        else corpo.idSoggetto = x.idSoggetto;
        const r = await lavora('Salvo', () => Rete.post('/server/assegna', corpo));
        if (!r) return;
        chiudi();
        dopo('Fatto: ' + ((r.attrezzatura || r.mezzo || {}).statoVisto || 'salvato'));
      };
      chiudi = finestra({ titolo: 'Assegna o presta', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    /** Lo prendo io: una cosa disponibile diventa in prestito a me (rientra oggi). */
    async function prendo(ogg) {
      const corpo = Object.assign({ tipo: 'prestito', idPersona: idPersonaIo(), idLocale: 'pc-' + Date.now().toString(36) }, ogg.idVeicolo ? { idVeicolo: ogg.idVeicolo } : { idAttrezzatura: ogg.idAttrezzatura });
      const r = await lavora('Lo prendo', () => Rete.post('/server/assegna', corpo));
      if (r) dopo(ogg.nome + ' in prestito a te', { testo: 'Annulla', fn: () => restituisci(Object.assign({}, ogg, { senzaConferma: true })) });
    }

    async function restituisci(ogg) {
      if (!ogg.senzaConferma && !(await conferma('Restituire ' + ogg.nome + '?', 'Torna disponibile (o a chi l\'aveva assegnato).', 'Restituisci'))) return;
      const corpo = Object.assign({ idLocale: 'pc-r-' + Date.now().toString(36) }, ogg.idAssegnazione ? { idAssegnazione: ogg.idAssegnazione } : ogg.idVeicolo ? { idVeicolo: ogg.idVeicolo } : { idAttrezzatura: ogg.idAttrezzatura });
      const r = await lavora('Restituisco', () => Rete.post('/server/restituisci', corpo));
      if (r) dopo('Restituito');
    }

    async function prendiDaElenco() {
      if (!(await lavora('Leggo gli strumenti', () => leggiAttrezzature().then(() => true)))) return;
      const liberi = (M.attrezzature.attrezzature || []).filter(a => a.stato === 'disponibile');
      let chiudi;
      chiudi = finestra({ titolo: 'Prendi uno strumento', fuoco: false, corpo: F().righe(liberi.map(a => riga({ sinistra: quadrato(a.categoria === 'dpi' ? 'scudo' : 'misura'), titolo: a.codice + ' · ' + a.nome,
        sotto: a.taratura ? a.taratura.parola : a.categoriaNome, onclick: () => { chiudi(); const s = P.sceltaStrumento(a, interfaccia().taraturaBlocco); if (!s.si) { avviso(s.motivo, true); return; } prendo({ idAttrezzatura: a.id, nome: a.nome }); } })), 'Nessuno strumento disponibile.'),
      pulsanti: ['spazio', h('button', { type: 'button', class: 'btn grande', onclick: () => chiudi() }, 'Chiudi')] });
    }

    function dopo(frase, azione) {
      M.mezzi = null;
      M.attrezzature = null;
      M.assegnazioni = null;
      M.storico = null;
      M.manutenzioni = null;
      M.scadenze = null;
      W.caricaDashboard();
      W.ricaricaAnagrafiche().catch(() => null);
      if (frase) avviso(frase, false, null, azione || null);
      riapri();
    }
    function riapri() {
      const id = M.aperto;
      const tipo = M.tipoAperto;
      W.disegnaPagina();
      if (id && document.querySelector('.pannello-f6') === null) { if (tipo === 'mezzi') apriMezzo(id); else apriAttrezzatura(id); }
      else if (id) { if (tipo === 'mezzi') apriMezzo(id); else apriAttrezzatura(id); }
    }

    // ===================================================================== km, guasti, manutenzioni

    /** Segna i km: il valore di adesso (già scritto l'ultimo), la foto del contachilometri facoltativa. */
    function segnaKm(m) {
      const km = h('input', { type: 'text', inputmode: 'numeric', class: 'importo-grande', value: m.km !== null && m.km !== undefined ? String(m.km) : '' });
      let foto = null;
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, m.titolo), campo('Km del contachilometri', conSuffisso(km, 'km')),
        m.km !== null && m.km !== undefined ? h('span', { class: 'sotto-titolo' }, 'Ultima lettura: ' + C.numero(m.km) + ' il ' + dataIt(m.kmIl).slice(0, 5)) : null,
        h('button', { type: 'button', class: 'zona-foto-f6', onclick: async () => { const f = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null); if (f && f.ok) { foto = f; disegna(); } } },
          icona('foto', 22, 2.2), foto ? 'Foto scelta: ' + (foto.nome || 'contachilometri') : 'Fotografa il contachilometri')]);
      disegna();
      let chiudi;
      const salva = async () => {
        const n = C.numONull(km.value);
        if (n === null) { km.focus(); avviso('Km: scrivi i km del contachilometri', true); return; }
        const corpo = { idVeicolo: m.id, km: Math.round(n), data: oggi(), idLocale: 'pc-km-' + Date.now().toString(36) };
        const r = await W.scriviConConferma('Salvo i km', '/server/segnaKm', corpo, d => conferma('È giusto?', d.errore, 'Sì, salva'));
        if (!r) return;
        if (foto && r.lettura) await lavora('Carico la foto', () => Rete.post('/server/caricaFile', { tipo: 'km', idLettura: r.lettura.id, mime: foto.mime, base64: foto.base64, idFile: 'pc' + Date.now().toString(36) }));
        chiudi();
        dopo('Km salvati: ' + C.numero(Math.round(n)));
      };
      chiudi = finestra({ titolo: 'Segna i km', corpo: zona, fuoco: true,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva i km')] });
    }

    /** Segnala un guasto: cosa succede (una riga), le foto, si può usare? Sì · No, è fermo, i km. */
    function segnalaGuasto(ogg) {
      const titolo = h('input', { type: 'text' });
      const descrizione = h('textarea', { rows: 2 });
      const km = h('input', { type: 'text', inputmode: 'numeric', value: ogg.km !== null && ogg.km !== undefined ? String(ogg.km) : '' });
      const x = { fermo: false, foto: [] };
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, ogg.nome), campo('Cosa succede', titolo), campo('Più dettagli', descrizione),
        h('div', { class: 'campo' }, h('label', null, 'Foto'), h('div', { class: 'foto-fila-f6' }, x.foto.map((f, i) => h('span', { class: 'foto-mini-f6' }, h('img', { src: 'data:' + f.mime + ';base64,' + f.base64, alt: 'Foto del guasto ' + (i + 1) }))),
          h('button', { type: 'button', class: 'foto-nuova-f6', onclick: async () => { const f = await Rete.post('/locale/scegli-file', { filtro: 'immagini' }).catch(() => null); if (f && f.ok) { x.foto.push(f); disegna(); } } }, icona('foto', 22, 2.2), 'Fotografa'))),
        h('div', { class: 'campo' }, h('label', null, 'Si può usare?'), segmenti([['si', 'Sì'], ['no', 'No, è fermo']], x.fermo ? 'no' : 'si', k => { x.fermo = k === 'no'; disegna(); })),
        ogg.idVeicolo ? campo('Km', conSuffisso(km, 'km')) : null]);
      disegna();
      let chiudi;
      const salva = async () => {
        if (!titolo.value.trim()) { titolo.focus(); avviso('Scrivi in poche parole cosa succede', true); return; }
        const guasto = Object.assign({ titolo: titolo.value.trim(), descrizione: descrizione.value.trim(), fermo: x.fermo, idLocale: 'pc-g-' + Date.now().toString(36) }, ogg.idVeicolo ? { idVeicolo: ogg.idVeicolo } : { idAttrezzatura: ogg.idAttrezzatura });
        if (ogg.idVeicolo && C.numONull(km.value) !== null) guasto.km = Math.round(C.num(km.value));
        const r = await lavora('Segnalo il guasto', async () => {
          const ris = await Rete.post('/server/segnalaGuasto', { guasto });
          for (const f of x.foto) await Rete.post('/server/caricaFile', { tipo: 'guasto', idManutenzione: ris.manutenzione.id, mime: f.mime, base64: f.base64, idFile: 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) });
          return ris;
        });
        if (!r) return;
        chiudi();
        dopo('Guasto segnalato' + (x.fermo ? ': non si usa finché non è sistemato' : ''));
      };
      chiudi = finestra({ titolo: 'Segnala un guasto', corpo: zona, fuoco: true,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Segnala il guasto')] });
    }

    /** Chiudi il guasto (o la manutenzione): com'è finita, i km, il costo come fattura ricevuta (mai un importo scritto qui). */
    async function chiudiManutenzione(g) {
      let ricevute = [];
      if (puo('fatturazione') && soldi()) { try { ricevute = ((await Rete.get('/server/ricevute')).ricevute || []).slice(0, 30); } catch (e) { ricevute = []; } }
      const v = { esito: h('input', { type: 'text', placeholder: 'Era la valvola, sistemato' }), km: h('input', { type: 'text', inputmode: 'numeric', value: g.km ? String(g.km) : '' }), data: h('input', { type: 'date', value: oggi() }) };
      let idRicevuta = '';
      const corpo = h('div', { class: 'fila' }, h('p', { class: 'testo-forte' }, g.titolo), campo('Com\'è finita', v.esito), h('div', { class: 'riga-campi' }, campo('Il', v.data), g.idVeicolo ? campo('Km', conSuffisso(v.km, 'km')) : null),
        ricevute.length ? campo('Il costo (la fattura dell\'officina)', selezione([['', 'Nessuna, o dopo']].concat(ricevute.map(r => [r.id, [r.numero, r.fornitore || r.nomeFornitore, C.data(r.data)].filter(Boolean).join(' · ')])), '', k => { idRicevuta = k; })) : null,
        (g.foto || []).length ? h('div', { class: 'foto-fila-f6' }, g.foto.map(f => h('a', { href: '#', class: 'foto-mini-f6', onclick: e => { e.preventDefault(); W.Archivio.apriFile(f.url || '/file/' + f.id, 'Foto del guasto'); } }, h('img', { src: '/file/' + f.id, alt: 'Foto del guasto' })))) : null);
      let chiudi;
      const salva = async () => {
        const c = { id: g.id, esito: v.esito.value.trim(), data: v.data.value || oggi() };
        if (g.idVeicolo && C.numONull(v.km.value) !== null) c.km = Math.round(C.num(v.km.value));
        if (idRicevuta) c.idRicevuta = Number(idRicevuta) || idRicevuta;
        const r = await lavora('Chiudo', () => Rete.post('/server/chiudiManutenzione', c));
        if (!r) return;
        chiudi();
        dopo('Risolto');
      };
      chiudi = finestra({ titolo: g.tipo === 'guasto' ? 'Chiudi il guasto' : 'Chiudi la manutenzione', corpo, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Segna risolto')] });
    }

    function moduloManutenzione(ogg) {
      const x = { tipo: ogg.idVeicolo ? 'tagliando' : 'riparazione', stato: 'aperta', fermo: false };
      const v = { titolo: h('input', { type: 'text' }), data: h('input', { type: 'date', value: oggi() }), km: h('input', { type: 'text', inputmode: 'numeric', value: ogg.km ? String(ogg.km) : '' }), descrizione: h('textarea', { rows: 2 }) };
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte' }, ogg.nome),
        h('div', { class: 'pillole' }, P.TIPI_MANUTENZIONE.filter(t => ogg.idVeicolo || ['riparazione', 'manutenzione', 'altro'].indexOf(t[0]) >= 0).map(t => h('button', { type: 'button', class: 'pillola piccola' + (x.tipo === t[0] ? ' scelta' : ''), onclick: () => { x.tipo = t[0]; disegna(); } }, t[1]))),
        campo('Che cosa', v.titolo), h('div', { class: 'riga-campi' }, campo('Il', v.data), ogg.idVeicolo ? campo('Km', conSuffisso(v.km, 'km')) : null),
        segmenti([['aperta', 'Da fare'], ['in_officina', ogg.idVeicolo ? 'In officina' : 'In riparazione']], x.stato, k => { x.stato = k; disegna(); }),
        h('label', { class: 'spunta-campo' }, h('input', { type: 'checkbox', checked: x.fermo, onchange: e => { x.fermo = e.target.checked; } }), 'Non si usa finché non è finita'), campo('Note', v.descrizione)]);
      disegna();
      let chiudi;
      const salva = async () => {
        if (!v.titolo.value.trim()) { v.titolo.focus(); avviso('Scrivi in poche parole cosa si fa', true); return; }
        const man = Object.assign({ tipo: x.tipo, stato: x.stato, fermo: x.fermo, data: v.data.value || oggi(), titolo: v.titolo.value.trim(), descrizione: v.descrizione.value.trim() }, ogg.idVeicolo ? { idVeicolo: ogg.idVeicolo } : { idAttrezzatura: ogg.idAttrezzatura });
        if (ogg.idVeicolo && C.numONull(v.km.value) !== null) man.km = Math.round(C.num(v.km.value));
        const r = await lavora('Salvo', () => Rete.post('/server/salvaManutenzione', { manutenzione: man }));
        if (!r) return;
        chiudi();
        dopo('Manutenzione salvata');
      };
      chiudi = finestra({ titolo: 'Nuova manutenzione', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva')] });
    }

    function dismetti(tipo, o) {
      const motivo = h('input', { type: 'text' });
      let chiudi;
      const vai = async () => {
        if (!motivo.value.trim()) { motivo.focus(); avviso('Motivo: scrivi perché lo dismetti', true); return; }
        const r = await lavora('Dismetto', () => Rete.post(tipo === 'mezzo' ? '/server/dismettiMezzo' : '/server/dismettiAttrezzatura', { id: o.id, motivo: motivo.value.trim() }));
        if (!r) return;
        chiudi();
        F().chiudiPannello(true);
        M.aperto = null;
        dopo('Dismesso: esce dagli elenchi');
      };
      chiudi = finestra({ titolo: 'Dismettere ' + (o.titolo || o.nome) + '?', corpo: [h('p', null, 'Esce dagli elenchi; lo storico resta.'), campo('Motivo', motivo)],
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn grande pericolo', onclick: vai }, 'Dismetti')] });
    }

    // ===================================================================== assegnazioni, manutenzioni, scadenze

    function assegnazioni(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Assegnazioni e prestiti'), barra(voci, 'assegnazioni')]);
      F6.conDati(pagina, async () => { if (!M.assegnazioni) M.assegnazioni = await Rete.get('/server/assegnazioni?inCorso=1'); if (!M.storico) M.storico = await Rete.get('/server/assegnazioni'); }, () => {
        const inCorso = M.assegnazioni.assegnazioni || [];
        const storico = (M.storico.assegnazioni || []).filter(a => !a.inCorso).slice(0, 30);
        const riga1 = a => riga({ sinistra: quadrato(a.idVeicolo ? 'furgone' : 'misura', a.inRitardo ? 'ico-rosso' : 'ico-grigio'), titolo: a.oggetto,
          sotto: [(a.tipoVisto || '') + ' · ' + (a.chi || ''), 'dal ' + dataIt(a.dal), a.rientro ? 'rientro il ' + dataIt(a.rientro) : '', a.al ? 'al ' + dataIt(a.al) : ''].filter(Boolean).join(' · '),
          destra: a.inRitardo ? pill('Oltre il rientro', 'rosso') : a.inCorso ? pill(a.tipoVisto || 'In corso', 'blu') : null,
          onclick: () => (a.idVeicolo ? W.vai('#mezzi/mezzo/' + a.idVeicolo) : W.vai('#mezzi/at/' + a.idAttrezzatura)) });
        aggiungi(pagina, [F6.sez('In corso · ' + inCorso.length, F6.righe(inCorso.map(riga1), 'Niente in corso.')), F6.sez('Storico', F6.righe(storico.map(riga1), 'Ancora nessuno storico.'))]);
      });
    }

    function manutenzioni(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Guasti e manutenzioni'), barra(voci, 'manutenzioni')]);
      F6.conDati(pagina, async () => { if (!M.manutenzioni) M.manutenzioni = await Rete.get('/server/manutenzioni'); }, () => {
        const l = (M.manutenzioni.manutenzioni || []).slice().sort((a, b) => (a.stato === 'chiusa') - (b.stato === 'chiusa') || String(b.data).localeCompare(String(a.data)));
        aggiungi(pagina, [F6.righe(l.map(g => riga({ sinistra: quadrato(g.stato === 'chiusa' ? 'spunta' : 'allarme', g.stato === 'chiusa' ? 'ico-verde' : g.fermo ? 'ico-rosso' : 'ico-giallo'),
          titolo: g.titolo, sotto: [g.oggetto, dataIt(g.data), g.segnalataDaNome, g.esito].filter(Boolean).join(' · '),
          destra: h('span', { class: 'pillole-destra' }, pill(g.statoVisto || '', g.stato === 'chiusa' ? 'verde' : g.stato === 'in_officina' ? 'ambra' : 'giallo'), g.fermo && g.stato !== 'chiusa' ? pill('Fermo', 'rosso') : null,
            (g.foto || []).length ? pill(g.foto.length + ' foto', 'grigio') : null),
          onclick: () => (g.idVeicolo ? W.vai('#mezzi/mezzo/' + g.idVeicolo) : W.vai('#mezzi/at/' + g.idAttrezzatura)) })), 'Nessun guasto né manutenzione.')]);
      });
    }

    function scadenze(pagina, voci) {
      const F6 = F();
      aggiungi(pagina, [F6.testata('Mezzi e attrezzature', 'Scadenze di mezzi e strumenti', scrive() ? F6.gialloPagina('Nuova scadenza', nuovaScadenza, 'piu') : null), barra(voci, 'scadenze')]);
      F6.conDati(pagina, async () => { if (!M.scadenze) M.scadenze = await Rete.get('/server/scadenze?gruppo=mezzi'); }, () => {
        aggiungi(pagina, F6.tabellaScadenze(M.scadenze, 'Mezzo o strumento'));
      });
    }

    async function nuovaScadenza() {
      if (!(await lavora('Preparo', () => Promise.all([leggiMezzi(), leggiAttrezzature()]).then(() => true)))) return;
      const ogg = [].concat((M.mezzi.mezzi || []).filter(m => m.proprieta === 'studio').map(m => ['v' + m.id, m.titolo]), (M.attrezzature.attrezzature || []).map(a => ['a' + a.id, a.codice + ' · ' + a.nome]));
      const x = { ogg: ogg[0] ? ogg[0][0] : '', tipo: 'assicurazione' };
      const v = { titolo: h('input', { type: 'text', placeholder: 'Lo propone Wisper dal tipo' }), data: h('input', { type: 'date' }) };
      const zona = h('div', { class: 'fila' });
      const tipiPer = k => (k.charAt(0) === 'v' ? [['assicurazione', 'Assicurazione'], ['bollo', 'Bollo'], ['revisione', 'Revisione'], ['tagliando', 'Tagliando']] : [['taratura', 'Taratura'], ['verifica_dpi', 'Verifica del DPI']]);
      const disegna = () => aggiungi(svuota(zona), [campo('Di cosa', selezione(ogg, x.ogg, k => { x.ogg = k; x.tipo = tipiPer(k)[0][0]; disegna(); })),
        campo('Che cosa scade', selezione(tipiPer(x.ogg || 'v'), x.tipo, k => { x.tipo = k; })), campo('Titolo', v.titolo), campo('Il', v.data)]);
      disegna();
      let chiudi;
      const salva = async () => {
        if (!v.data.value) { v.data.focus(); avviso('Data: scrivi quando scade', true); return; }
        const sc = { tipo: x.tipo, data: v.data.value };
        if (x.ogg.charAt(0) === 'v') sc.idVeicolo = Number(x.ogg.slice(1)); else sc.idAttrezzatura = Number(x.ogg.slice(1));
        if (v.titolo.value.trim()) sc.titolo = v.titolo.value.trim();
        const r = await lavora('Salvo la scadenza', () => Rete.post('/server/salvaScadenza', { scadenza: sc }));
        if (!r) return;
        chiudi();
        M.scadenze = null;
        W.caricaDashboard();
        avviso('Scadenza salvata: ' + r.scadenza.titolo + ', ' + C.data(r.scadenza.data));
        W.disegnaPagina();
      };
      chiudi = finestra({ titolo: 'Nuova scadenza', corpo: zona, fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), h('button', { type: 'button', class: 'btn giallo grande', onclick: salva }, 'Salva la scadenza')] });
    }

    return { vista, M, daRileggere, apriMezzo, apriAttrezzatura, segnaKm, segnalaGuasto };
  };
})(window);
