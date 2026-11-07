/*
 * Wisper Ufficio: Amministrazione completa, seconda parte (fase 8, docs/gestionale/fase8.md §7, §9.8, §9.10, §9.11,
 * §11, §15.2).
 *
 * Sicurezza (schede vere: server interno, copia cifrata, accessi sbagliati, dispositivi fermi, password iniziali;
 * Scollega tutti), Copie e ripristino (ultima copia, prova automatica, ripristino a mano coi sei passi, giallo Segna il
 * ripristino provato), Importa ed esporta (Esporta tutto per il titolare, Importa clienti e fornitori in una finestra
 * larga a due colonne), Stato del sistema (da leggere), Lista di controllo (tabella col pannello della riga).
 * La chiave della copia cifrata si vede una volta sola e non passa mai di qui una seconda volta.
 */
(function (radice) {
  'use strict';

  radice.WisperSistema8 = function (W) {
    const { S, C, R, B, Rete, Api } = W;
    const Q = radice.WisperRegoleFase8;
    const { h, aggiungi, svuota, icona, tondo, avviso, lavora, finestra, conferma, campo, segmenti, riga, quadrato, segnaposto, copiaTesto } = B;
    const scrive = () => W.puo('amministrazione', 2);
    const titolare = () => !!(S.io && S.io.utente && S.io.utente.ruolo === 'titolare');
    const pill = (testo, colore) => h('span', { class: 'pill p-' + (colore || 'grigio') }, testo);
    const oggi = () => new Date();

    const M = { sicurezza: null, copie: null, stato: null, controlli: null, esportazioni: null, importazioni: null, seg: 'tutte', aperta: null, chiusi: {} };
    function daRileggere() { Object.assign(M, { sicurezza: null, copie: null, stato: null, controlli: null, esportazioni: null, importazioni: null }); }

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

    const coppie = (lista, dueColonne) => h('div', { class: dueColonne ? 'coppie' : 'coppie una' }, lista.filter(x => x && x[1] !== undefined && x[1] !== null && x[1] !== '').map(x => h('div', { class: 'coppia' + (x[2] ? ' ' + x[2] : '') }, h('span', { class: 'k' }, x[0]), h('span', { class: 'v' }, x[1]))));
    const scheda = (titolo, corpo) => h('div', { class: 'scheda fila' }, h('h2', null, titolo), corpo);
    const due = (sx, dx) => h('div', { class: 'due-colonne stretta-1100' }, h('div', { class: 'sezione' }, sx), h('div', { class: 'sezione' }, dx));

    // ===================================================================== sicurezza (§9.8)

    /** Le schede di "è tutto a posto?", ognuna verde o rossa tenue con la parola. */
    function controlliSicurezza(s) {
      const x = s || {};
      const out = [];
      const ii = x.internetInterno || {};
      out.push({ ok: ii.ok !== false, chiave: 'internet', titolo: 'Il server interno non è su internet',
        testo: ii.frase ? ii.frase : ii.ok !== false ? 'Nessuna richiesta da internet sull\'ingresso del NAS' : 'Una richiesta è arrivata da internet sull\'ingresso del NAS ' + (ii.ultimo ? 'il ' + Q.giornoMese(ii.ultimo, oggi()) + ' alle ' + String(ii.ultimo).slice(11, 16).replace(/^0/, '') : '') + ': con la porta Google l\'ingresso va spento' });
      out.push({ ok: !!x.copiaCifrata, chiave: 'cifrata', titolo: x.copiaCifrata ? 'La copia fuori casa è cifrata' : 'La copia fuori casa non è cifrata', testo: x.copiaCifrata ? 'Sì: senza la chiave scritta su carta non si apre' : 'No: la copia su Drive si apre senza chiave' });
      const a = x.accessiSbagliati || {};
      out.push({ ok: !(Number(a.blocchi) > 0), chiave: 'accessi', titolo: 'Accessi sbagliati negli ultimi ' + (a.giorni || 30) + ' giorni: ' + (Number(a.quanti) || 0),
        testo: Number(a.blocchi) > 0 ? (a.blocchi === 1 ? '1 blocco di 15 minuti' : a.blocchi + ' blocchi di 15 minuti') + (a.chi && String(a.chi) ? ' per ' + [].concat(a.chi).join(', ') : '') : 'Nessun blocco' });
      (x.passwordIniziali || []).forEach(p => out.push({ ok: false, chiave: 'pwd' + p.idUtente, titolo: p.nome + ' non ha ancora cambiato la password iniziale', testo: [p.data || p.dal ? 'Data il ' + Q.giornoMese(p.data || p.dal, oggi()) : '', p.da ? 'da ' + p.da : ''].filter(Boolean).join(' ') }));
      const fermi = x.dispositiviFermi || [];
      if (fermi.length) out.push({ ok: false, chiave: 'fermi', titolo: fermi.length === 1 ? '1 dispositivo non si usa da più di 60 giorni' : fermi.length + ' dispositivi non si usano da più di 60 giorni', dispositivi: fermi });
      const ut = x.utentiFermi || [];
      if (ut.length) out.push({ ok: false, chiave: 'utenti', titolo: ut.length === 1 ? '1 utente non entra da 90 giorni' : ut.length + ' utenti non entrano da 90 giorni', utenti: ut });
      return out;
    }

    /** La riga dell'elenco: "Tutto a posto" verde o la prima cosa da sistemare in rosso tenue (§9.2). */
    function rigaSicurezza(s) {
      if (s && s.tuttoAPosto === true && s.copiaCifrata) return { testo: 'Tutto a posto', colore: 'ico-verde' };
      const male = controlliSicurezza(s).find(c => !c.ok);
      return male ? { testo: male.titolo, colore: 'ico-rosso' } : { testo: 'Tutto a posto', colore: 'ico-verde' };
    }

    function sicurezza(pagina) {
      const area = h('div');
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Sicurezza')), area]);
      leggi(area, 'sicurezza', '/server/sicurezza', s => {
        const schede = controlliSicurezza(s).map(c => h('div', { class: 'scheda scheda-controllo' + (c.ok ? '' : ' male'), 'data-controllo': c.chiave },
          h('span', { class: 'ico-riga ' + (c.ok ? 'ico-verde' : 'ico-rosso') }, icona(c.ok ? 'spunta' : 'allarme', 20, 2.4)),
          h('span', { class: 'corpo' }, h('b', null, c.titolo), c.testo ? h('span', { class: 'secondario' }, c.testo) : null,
            c.chiave === 'internet' && !c.ok ? h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: () => avviso('Sul NAS: docker compose stop wisper-ingresso, e sul router si toglie la regola della porta 443') }, 'Come si spegne')) : null,
            c.chiave === 'cifrata' && titolare() ? h('div', null, s.copiaCifrata ? h('button', { type: 'button', class: 'btn', onclick: spegniCifratura }, 'Spegni la cifratura') : h('button', { type: 'button', class: 'btn', onclick: accendiCifratura }, 'Accendi la cifratura')) : null,
            (c.dispositivi || []).map(d => h('div', { class: 'riga-mini' }, h('span', null, [d.nome || d.dispNome, d.persona || d.utente, d.ultimoUso ? Q.quandoBreve(d.ultimoUso, oggi()) : ''].filter(Boolean).join(' · ')),
              scrive() ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => scollega(d) }, 'Scollega') : null)),
            (c.utenti || []).map(u => h('div', { class: 'riga-mini' }, h('span', null, [u.nome, u.ultimoAccesso ? 'ultimo accesso ' + Q.quandoBreve(u.ultimoAccesso, oggi()) : 'mai entrato'].join(' · ')),
              titolare() ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => disattiva(u) }, 'Disattiva') : null)))));
        const dispositivi = s.dispositivi || (s.sessioni || []);
        const listaDisp = dispositivi.length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Dispositivi collegati · ' + dispositivi.length),
          h('div', { class: 'scheda righe' }, dispositivi.map(d => riga({ sinistra: quadrato(/telefono|android/i.test(d.app || '') ? 'telefono' : 'laptop'), titolo: d.nome || d.dispNome || 'Dispositivo',
            sotto: [d.persona || d.utente, d.app, d.ultimoUso ? Q.quandoBreve(d.ultimoUso, oggi()) : ''].filter(Boolean).join(' · '),
            destra: h('span', { class: 'pillole-destra' }, d.vecchia ? pill('Versione vecchia', 'ambra') : null, scrive() && d.id ? h('button', { type: 'button', class: 'btn piccolo', onclick: e => { e.stopPropagation(); scollega(d); } }, 'Scollega') : null) })))) : null;
        const feed = s.feed || [];
        const listaFeed = feed.length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Indirizzi del calendario · ' + feed.length),
          h('div', { class: 'scheda righe' }, feed.map(f => riga({ sinistra: quadrato('calendario'), titolo: f.nome, sotto: [f.persona, Q.letturaFeed(f, oggi())].filter(Boolean).join(' · '),
            destra: scrive() ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => togliFeed(f) }, 'Togli') : null })))) : null;
        const giorni = h('input', { type: 'text', inputmode: 'numeric', class: 'num-in', value: String(s.sessioneGiorni || 180), disabled: !scrive(), 'aria-label': 'Un dispositivo esce da solo dopo' });
        // Dal 06/11/2026 si salva da solo, quando smetti di scrivere e uscendo dal campo.
        if (scrive()) B.salvaDaSolo(giorni, {
          leggi: t => { const e = B.numeroAMeta(t) ? 'Durata degli accessi: scrivi un numero' : Q.erroreVoce({ tipo: 'numero', etichetta: 'Durata degli accessi', min: 30, max: 365 }, t); return e ? { errore: e } : { valore: Q.numeroScritto(t) }; },
          salva: n => Rete.post('/server/salvaImpostazioni', { valori: { SESSIONE_GIORNI: n } }).then(r => {
            s.sessioneGiorni = n;
            S.ana.impostazioni = Object.assign({}, S.ana.impostazioni, (r && r.impostazioni) || { SESSIONE_GIORNI: n });
            return r;
          }),
        });
        const durata = h('div', { class: 'scheda fila' }, h('h2', null, 'Durata degli accessi'),
          h('div', { class: 'imp-riga', 'data-chiave': 'SESSIONE_GIORNI' }, h('span', { class: 'lab' }, 'Un dispositivo esce da solo dopo'), B.conSuffisso(giorni, 'giorni senza uso')));
        aggiungi(area, [due([schede], [listaDisp, listaFeed, durata,
          titolare() ? h('div', null, h('button', { type: 'button', class: 'btn grande bordo-rosso', onclick: scollegaTutti }, 'Scollega tutti i dispositivi')) : null])]);
      });
    }

    async function scollega(d) {
      if (!(await conferma('Scollegare ' + (d.nome || 'il dispositivo') + '?', 'Per usare Wisper da lì bisognerà entrare di nuovo con email e password.', 'Scollega', true))) return;
      const r = await lavora('Scollego', () => Rete.post('/server/revocaSessione', { id: d.id }));
      if (!r) return;
      M.sicurezza = null;
      avviso('Dispositivo scollegato');
      W.disegnaPagina();
    }

    async function disattiva(u) {
      if (!(await conferma('Disattivare ' + u.nome + '?', 'Non entra più in Wisper da nessun dispositivo. Quello che ha scritto resta. Si riattiva da Utenti.', 'Disattiva', true))) return;
      const r = await lavora('Disattivo', () => Rete.post('/server/salvaUtente', { utente: { id: u.idUtente || u.id, attivo: false } }));
      if (!r) return;
      M.sicurezza = null;
      avviso(u.nome + ' disattivato');
      W.disegnaPagina();
    }

    async function togliFeed(f) {
      if (!(await conferma('Togliere l\'indirizzo?', f.nome + (f.persona ? ' di ' + f.persona : '') + ': il calendario che lo usa non si aggiorna più.', 'Togli l\'indirizzo', true))) return;
      const r = await lavora('Tolgo l\'indirizzo', () => Rete.post('/server/revocaFeed', { id: f.id }));
      if (!r) return;
      M.sicurezza = null;
      avviso('Indirizzo tolto');
      W.disegnaPagina();
    }

    function scollegaTutti() {
      const pwd = h('input', { type: 'password', autocomplete: 'current-password' });
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const disegna = () => aggiungi(svuota(zona), [h('p', { class: 'testo-forte', style: { margin: 0 } }, 'Tutti, anche tu, dovranno entrare di nuovo. I rapportini in coda sui telefoni restano e partono dopo l\'accesso.'),
        campo('La tua password', pwd, errore)]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Scollega tutti i dispositivi', corpo: zona,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn grande bordo-rosso', onclick: async () => {
            if (!pwd.value) { errore = 'La tua password: scrivila per confermare'; disegna(); pwd.focus(); return; }
            const r = await lavora('Scollego tutti', () => Rete.post('/server/scollegaTutti', { password: pwd.value }));
            if (!r) return;
            chiudi();
            avviso('Scollegati ' + (r.scollegati || 0) + ' dispositivi: entra di nuovo');
            setTimeout(() => W.leggiTutto(true), 800);
          } }, 'Scollega tutti')] });
    }

    async function accendiCifratura() {
      if (!(await conferma('Accendere la cifratura?', 'Il server crea una chiave che si vede una volta sola, adesso. Tieni pronti carta e penna: senza la chiave, se si perde il NAS, le copie su Drive non si aprono.', 'Accendi la cifratura'))) return;
      const r = await lavora('Creo la chiave', () => Rete.post('/server/accendiCifratura', {}));
      if (!r) return;
      M.sicurezza = null;
      const chiave = String(r.chiave || '');
      let scritta = false;
      const zona = h('div', { class: 'fila' });
      const fatto = h('button', { type: 'button', class: 'btn giallo grande', disabled: true }, 'Fatto');
      const disegna = () => aggiungi(svuota(zona), [h('div', { class: 'chiave-copia' }, chiave),
        h('span', { class: 'secondario' }, 'Si mostra solo adesso. Da stanotte la copia fuori casa è cifrata.'),
        h('div', null, h('button', { type: 'button', class: 'btn', onclick: async () => { const ok = await copiaTesto(chiave); avviso(ok ? 'Chiave copiata: scrivila su carta e poi svuota gli appunti' : 'Non sono riuscito a copiarla: scrivila a mano', !ok); } }, icona('copia', 18, 2.2), 'Copia')),
        h('button', { type: 'button', class: 'casella-riga', role: 'checkbox', 'aria-checked': scritta ? 'true' : 'false', onclick: () => { scritta = !scritta; fatto.disabled = !scritta; disegna(); } },
          h('span', { class: 'casella' + (scritta ? ' si' : '') }, scritta ? icona('spunta', 16, 3) : null), 'L\'ho scritta su carta, in due posti')]);
      disegna();
      let chiudi;
      fatto.addEventListener('click', () => { chiudi(); avviso('Cifratura accesa'); W.disegnaPagina(); });
      chiudi = finestra({ titolo: 'La chiave della copia', corpo: zona, fuoco: false, allaChiusura: () => W.disegnaPagina(), pulsanti: ['spazio', fatto] });
    }

    async function spegniCifratura() {
      if (!(await conferma('Spegnere la cifratura?', 'Da stanotte la copia su Drive si apre senza chiave. Le copie già cifrate restano cifrate: per aprirle serve la chiave scritta.', 'Spegni la cifratura', true))) return;
      const r = await lavora('Spengo la cifratura', () => Rete.post('/server/spegniCifratura', { conferma: true }));
      if (!r) return;
      M.sicurezza = null;
      avviso('Cifratura spenta');
      W.disegnaPagina();
    }

    // ===================================================================== copie e ripristino provato (§9.10)

    const ultimaCopia = c => (c ? c.ultima || (c.copie || [])[0] || null : null);
    const copiaMale = c => !!c && (/^errore/.test(String(c.locale || '')) || /^errore/.test(String(c.fuori || '')) || (c.esito && c.esito !== 'ok'));
    const ultimaProva = (c, tipo) => ((c && c.prove) || []).find(p => p.tipo === tipo) || null;

    /** "Stanotte alle 2:30 · provata il 01/10" (§9.2). */
    function rigaCopie(c) {
      const u = ultimaCopia(c);
      const p = ultimaProva(c, 'automatica');
      if (!u) return 'Nessuna copia ancora';
      if (copiaMale(u)) return 'L\'ultima copia non è riuscita';
      return Q.quandoNotte(u.quando, oggi()).replace(/^./, x => x.toUpperCase()) + (p ? ' · provata il ' + Q.giornoMese(p.quando, oggi()) : '');
    }

    function copie(pagina) {
      const area = h('div');
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Copie e ripristino')), area]);
      leggi(area, 'copie', '/server/copie', c => {
        const u = ultimaCopia(c);
        const male = copiaMale(u);
        const ok = x => /^ok/.test(String(x || ''));
        const dove = u ? (u.dove || [ok(u.locale) || !u.locale ? (ok(u.fuori) ? 'Sul NAS e fuori casa, su Drive' : 'Sul NAS') : '', ok(u.foglio) ? 'il foglio è aggiornato' : '', u.cifrata || c.cifrata ? 'cifrata' : ''].filter(Boolean).join(' · ')) : '';
        const ultima = h('div', { class: 'scheda fila ultima-copia' + (male ? ' male' : '') }, h('span', { class: 'etichetta' }, 'Ultima copia'),
          u ? h('div', { class: 'grande' }, h('span', { class: 'scudo' }, icona(male ? 'avviso' : 'scudo', 22, 2.2)), male ? 'Non è riuscita' : Q.quandoNotte(u.quando, oggi()).replace(/^./, x => x.toUpperCase())) : h('div', { class: 'grande' }, 'Nessuna copia ancora'),
          u ? h('span', { class: 'sotto-titolo' }, male ? (u.messaggio || 'La copia non è riuscita') : dove) : null,
          scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: copiaAdesso }, 'Fai una copia adesso')) : null);
        const pa = ultimaProva(c, 'automatica');
        const e = Q.esitoProva(pa ? Object.assign({}, pa, pa.dettagli || {}) : null, oggi());
        const auto = h('div', { class: 'scheda fila' }, h('h2', null, 'Prova automatica'),
          h('div', { class: 'pillole-testa' }, pill(e.parola, e.colore), h('span', { class: 'secondario' }, (pa ? 'Provata il ' + Q.giornoMese(pa.quando, oggi()) : 'Mai provata') + (c.prossimaProva ? ' · prossima il ' + Q.giornoMese(c.prossimaProva, oggi()) : ''))),
          pa ? coppie(Q.dettagliProva(Object.assign({}, pa, pa.dettagli || {}))) : null,
          pa && pa.esito !== 'ok' ? h('div', { class: 'banda calma' }, h('span', { class: 'spazio' }, e.frase)) : null,
          scrive() ? h('div', null, h('button', { type: 'button', class: 'btn', onclick: provaCopia }, 'Prova adesso')) : null);
        const elenco = (c.copie || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Copie sul NAS'), h('div', { class: 'scheda righe' }, c.copie.slice(0, 12).map(x => riga({
          sinistra: quadrato('disco'), titolo: x.file || x.nome || 'Copia', sotto: [Q.quandoNotte(x.quando, oggi()).replace(/^./, y => y.toUpperCase()), x.byte ? Q.grandezza(x.byte) : '', copiaMale(x) ? 'non riuscita' : x.nota === 'a mano' ? 'fatta a mano' : ''].filter(Boolean).join(' · '),
          destra: x.provata || provataDa(c, x) ? pill('Provata', 'verde') : null })))) : null;
        const pm = ultimaProva(c, 'a_mano');
        const limite = Number(S.ana.impostazioni.PROVA_RIPRISTINO_GIORNI) || 90;
        const giorni = pm ? Math.round((oggi() - new Date(pm.quando)) / 86400000) : null;
        const fresca = giorni !== null && giorni < limite;
        const amano = h('div', { class: 'scheda fila' }, h('h2', null, 'Ripristino a mano'),
          h('div', { class: 'pillole-testa' }, pm ? (fresca ? pill('Provata', 'verde') : pill('Da rifare', 'ambra')) : pill('Mai provata', 'ambra'),
            h('span', { class: 'secondario' }, pm ? 'Provato a mano il ' + Q.giornoMese(pm.quando, oggi()) + (pm.utente ? ' da ' + String(pm.utente).split(' ')[0] : '') + ' · ' + (giorni === 0 ? 'oggi' : giorni === 1 ? 'ieri' : giorni + ' giorni fa') : 'Ogni ' + limite + ' giorni, sul tuo computer')),
          h('ol', { class: 'passi-ripristino' }, Q.PASSI_RIPRISTINO.map(p => h('li', null, p))));
        aggiungi(area, [due([ultima, auto, elenco], [amano,
          scrive() ? h('div', { class: 'riga-destra' }, h('button', { type: 'button', class: 'btn giallo grande', onclick: () => segnaRipristino(c) }, 'Segna il ripristino provato')) : null])]);
      });
    }

    const provataDa = (c, x) => ((c && c.prove) || []).some(p => p.copia && p.copia === (x.file || x.nome));

    async function copiaAdesso() {
      const r = await lavora('Faccio la copia', () => Rete.post('/server/copiaAdesso', {}));
      if (!r) return;
      M.copie = null;
      avviso('Copia fatta');
      W.disegnaPagina();
    }

    async function provaCopia() {
      const r = await lavora('Provo l\'ultima copia', () => Rete.post('/server/provaCopia', {}));
      if (!r) return;
      M.copie = null;
      const e = Q.esitoProva(r.prova, oggi());
      avviso('Prova della copia: ' + e.parola.toLowerCase(), r.prova && r.prova.esito !== 'ok');
      W.disegnaPagina();
    }

    function segnaRipristino(c) {
      const copieL = (c.copie || []).map(x => x.file || x.nome).filter(Boolean);
      const s = { copia: copieL[0] || '', da: 'drive', conChiave: true, controlli: [false, false, false, false, false] };
      const note = h('textarea', { rows: 3 });
      const cifrata = !!(c.cifrata || (ultimaCopia(c) || {}).cifrata || S.ana.impostazioni.COPIA_CIFRATA === true);
      let errore = '';
      const zona = h('div', { class: 'fila' });
      const casella = (testo, acceso, cambia) => h('button', { type: 'button', class: 'casella-riga', role: 'checkbox', 'aria-checked': acceso ? 'true' : 'false', onclick: () => cambia(!acceso) },
        h('span', { class: 'casella' + (acceso ? ' si' : '') }, acceso ? icona('spunta', 16, 3) : null), testo);
      const disegna = () => aggiungi(svuota(zona), [
        h('div', { class: 'campo' }, h('label', null, 'Quale copia'), h('div', { class: 'pillole' }, copieL.slice(0, 6).map(n => h('button', { type: 'button', class: 'pillola piccola' + (s.copia === n ? ' scelta' : ''), onclick: () => { s.copia = n; disegna(); } }, n)))),
        h('div', { class: 'campo' }, h('label', null, 'Da dove'), segmenti([['drive', 'Da Drive'], ['nas', 'Dal NAS']], s.da, x => { s.da = x; disegna(); }, 'piccoli')),
        cifrata ? casella('Con la chiave scritta su carta', s.conChiave, v => { s.conChiave = v; disegna(); }) : null,
        h('span', { class: 'etichetta' }, 'I cinque controlli'),
        Q.CONTROLLI_RIPRISTINO.map((t, i) => casella(t, s.controlli[i], v => { s.controlli[i] = v; errore = ''; disegna(); })),
        campo('Note', note), errore ? h('div', { class: 'campo sbagliato' }, h('div', { class: 'errore' }, errore)) : null]);
      disegna();
      let chiudi;
      chiudi = finestra({ titolo: 'Segna il ripristino provato', corpo: zona, larghezza: 'media', fuoco: false,
        pulsanti: ['spazio', h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'),
          h('button', { type: 'button', class: 'btn giallo grande', onclick: async () => {
            if (s.controlli.some(x => !x)) { errore = 'Spunta i cinque controlli: se uno non va, il ripristino non è provato'; disegna(); return; }
            const corpo = { copia: s.copia, da: s.da, conChiave: cifrata ? !!s.conChiave : false, controlli: s.controlli, note: note.value.trim() };
            const r = await lavora('Salvo', () => Rete.post('/server/segnaRipristino', corpo));
            if (!r) return;
            chiudi();
            M.copie = null;
            avviso('Ripristino provato: la Dashboard lo richiede fra ' + (Number(S.ana.impostazioni.PROVA_RIPRISTINO_GIORNI) || 90) + ' giorni');
            W.caricaDashboard();
            W.disegnaPagina();
          } }, 'Salva')] });
    }

    // ===================================================================== importa ed esporta (§7)

    function importa(pagina) {
      const tit = titolare();
      const imp2 = W.puo('clienti', 2);
      aggiungi(pagina, [h('div', { class: 'testata alta' }, h('h1', null, 'Importa ed esporta'),
        imp2 ? h('button', { type: 'button', class: 'btn giallo', 'data-giallo-pagina': '1', onclick: importaClienti }, icona('importa', 18, 2.2), 'Importa clienti e fornitori') : null)]);
      const sinistra = h('div', { class: 'sezione' });
      const destra = h('div', { class: 'sezione' });
      aggiungi(pagina, [h('div', { class: 'due-colonne stretta-1100' }, sinistra, destra)]);
      if (tit) {
        const zona = h('div', { class: 'fila' });
        aggiungi(sinistra, [h('div', { class: 'scheda fila' }, h('h2', null, 'Esporta tutto'), h('span', { class: 'secondario' }, 'Un file ZIP con un elenco per foglio, per Excel. I file restano nelle copie.'), zona)]);
        leggi(zona, 'esportazioni', '/server/esportazioni', r => disegnaEsportazioni(zona, r));
      }
      aggiungi(sinistra, [h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Esporta per Excel'), h('div', { class: 'scheda righe' },
        [W.puo('rapportini') ? ['rapportini', 'Rapportini', W.nRapportini(W.attivi().length)] : null,
          W.puo('clienti') ? ['clienti', 'Clienti', S.ana.clienti.filter(c => !c.archiviato).length + ' clienti'] : null,
          W.puo('clienti') ? ['fornitori', 'Fornitori', S.ana.fornitori.filter(c => !c.archiviato).length + ' fornitori'] : null,
          W.puo('commesse') ? ['commesse', 'Commesse', S.ana.commesse.filter(m => !m.modello).length + ' commesse'] : null,
          W.puo('preventivi') ? ['preventivi', 'Preventivi', 'Tutti i preventivi'] : null,
          W.puo('attivita') ? ['attivita', 'Attività', 'Le attività aperte'] : null,
          // 07/11/2026: niente più Ore, quindi niente "Le ore di questa settimana".
          W.puo('spese') ? ['spese', 'Spese', 'Le spese di questo mese'] : null].filter(Boolean).map(x => riga({ sinistra: quadrato('scarica'), titolo: x[1], sotto: x[2], onclick: () => W.esporta(x[0]), freccia: false }))))]);
      if (W.puo('clienti')) {
        const zonaImp = h('div', { class: 'sezione' });
        aggiungi(destra, [zonaImp]);
        leggi(zonaImp, 'importazioni', '/server/importazioni', r => {
          const lista = r.importazioni || [];
          aggiungi(zonaImp, [h('span', { class: 'etichetta' }, 'Importazioni' + (lista.length ? ' · ' + lista.length : '')),
            lista.length ? h('div', { class: 'scheda righe' }, lista.map(x => riga({ sinistra: quadrato('importa', x.archiviatiIl ? 'ico-grigio' : null), titolo: x.nomeFile || x.nome || 'File',
              sotto: [x.quando ? Q.quandoBreve(x.quando, oggi()) : '', (x.nuovi || 0) + ' nuovi, ' + (x.completati || 0) + ' completati, ' + (x.saltati || 0) + ' saltati', x.utente ? String(x.utente).split(' ')[0] : ''].filter(Boolean).join(' · '),
              destra: x.archiviatiIl ? pill('Archiviati', 'grigio') : imp2 && x.nuovi ? h('button', { type: 'button', class: 'btn piccolo', onclick: () => archiviaImportati(x) }, 'Archivia quelli importati') : null })))
              : h('div', { class: 'scheda' }, h('span', { class: 'secondario' }, 'Nessuna importazione ancora.'))]);
        });
      }
    }

    function disegnaEsportazioni(zona, r) {
      const lista = (r.esportazioni || []).slice(0, 3);
      svuota(zona);
      lista.forEach(e => aggiungi(zona, [h('div', { class: 'scheda righe interna' }, riga({ sinistra: quadrato(e.stato === 'pronta' ? 'scarica' : e.stato === 'errore' ? 'allarme' : 'orologio', e.stato === 'pronta' ? 'ico-verde' : e.stato === 'errore' ? 'ico-rosso' : 'ico-blu'),
        titolo: e.nome || 'wisper-tutto-' + String(e.creato || '').slice(0, 10) + '.zip',
        sotto: e.stato === 'pronta' ? 'Pronto · ' + Q.grandezza(e.byte) + (e.scade ? ' · si toglie il ' + Q.giornoMese(e.scade, oggi()) : '') : e.stato === 'errore' ? (e.errore || 'Non è riuscito') : 'In preparazione',
        destra: e.stato === 'pronta' ? pill('Pronta', 'verde') : e.stato === 'in_corso' ? pill('In corso', 'blu') : null,
        onclick: e.stato === 'pronta' ? () => scaricaEsportazione(e) : null }))]));
      aggiungi(zona, [h('div', null, h('button', { type: 'button', class: 'btn', onclick: esportaTutto }, lista.some(e => e.stato === 'pronta') ? 'Preparane uno nuovo' : 'Prepara il file'))]);
    }

    async function esportaTutto() {
      const r = await lavora('Preparo il file', () => Rete.post('/server/esportaTutto', {}));
      if (!r) return;
      avviso('Il file si prepara: quando è pronto arriva la notifica');
      // Si guarda ogni 2 secondi per un minuto (con dieci anni di dati ci vogliono meno di 30 secondi, §11.5).
      const id = r.esportazione && r.esportazione.id;
      for (let i = 0; i < 30; i++) {
        await new Promise(ok => setTimeout(ok, i ? 2000 : 600));
        let x;
        try { x = await Rete.get('/server/esportazioni'); } catch (e) { break; }
        M.esportazioni = x;
        const e = (x.esportazioni || []).find(y => String(y.id) === String(id));
        if (!e || e.stato !== 'in_corso') break;
      }
      if (location.hash === '#amministrazione/importa') W.disegnaPagina();
      const e = ((M.esportazioni && M.esportazioni.esportazioni) || []).find(y => String(y.id) === String(id));
      if (e && e.stato === 'pronta') avviso('Il file con tutti i dati è pronto', false, 8000, { testo: 'Scarica', fn: () => scaricaEsportazione(e) });
    }

    async function scaricaEsportazione(e) {
      if (S.esempio) { avviso('Nella visita non si salva niente'); return; }
      const fatto = await lavora('Scarico il file', () => Api.post('/locale/scarica-esportazione', { id: e.id, nome: e.nome || 'wisper-tutto-' + String(e.creato || '').slice(0, 10) + '.zip' }));
      if (fatto && fatto.ok) avviso('Salvato in ' + fatto.percorso);
    }

    async function archiviaImportati(x) {
      if (!(await conferma('Archiviare quelli importati da ' + (x.nomeFile || 'questo file') + '?', 'Si archiviano le anagrafiche nate da quel file che non hanno ancora commesse, rapportini, preventivi o fatture. I campi completati restano: si vedono nel registro.', 'Archivia'))) return;
      const r = await lavora('Archivio', () => Rete.post('/server/archiviaImportati', { idImportazione: x.id }));
      if (!r) return;
      M.importazioni = null;
      await W.ricaricaAnagrafiche().catch(() => null);
      avviso('Archiviati ' + (r.archiviati || 0) + (r.restano ? ', ne restano ' + r.restano + ' che hanno già lavori' : ''));
      W.disegnaPagina();
    }

    /**
     * Importa clienti e fornitori (§7.2, §15.2): una finestra larga a due colonne. A sinistra le colonne del file con la
     * tendina del campo (l'unica tendina della fase: le scelte sono più di dieci) e Sono clienti · fornitori · Lo dice
     * una colonna; a destra il controllo che si aggiorna (Nuovi · Già in Wisper · Da sistemare). Niente è scritto finché
     * non si tocca il giallo.
     */
    async function importaClienti() {
      const scelto = await Rete.post('/locale/scegli-file', { filtro: 'importa' }).catch(e => { avviso(e.message, true); return null; });
      if (!scelto || !scelto.ok) return;
      if (Math.floor(String(scelto.base64 || '').length * 3 / 4) > 5 * 1024 * 1024) { avviso('Il file è troppo grande: al massimo 5 MB', true); return; }
      const letto = await lavora('Leggo il file', () => Rete.post('/server/leggiImport', { nome: scelto.nome, base64: scelto.base64 }));
      if (!letto) return;
      const s = { colonne: (letto.colonne || []).map(c => Object.assign({}, c)), tipo: 'clienti', controllo: null, errore: '', attesa: null };
      const campiImport = Array.isArray(letto.campi) && letto.campi.length
        ? [['', 'Non importare']].concat(letto.campi.map(x => [x.chiave, x.nome])).concat(letto.campi.some(x => x.chiave === 'tipo') ? [] : [['tipo', 'Cliente o fornitore']])
        : Q.CAMPI_IMPORT;
      const sinistra = h('div', { class: 'fila colonne-import' });
      const destra = h('div', { class: 'fila controllo-import' });
      const gialloImporta = h('button', { type: 'button', class: 'btn giallo grande', disabled: true }, 'Importa');
      const disegnaSinistra = () => {
        aggiungi(svuota(sinistra), [h('div', { class: 'file-import' }, icona('file', 22, 2.2), h('span', { class: 'corpo' }, h('b', null, scelto.nome), h('span', { class: 'secondario' }, (letto.righe || 0) + ' righe · ' + s.colonne.length + ' colonne'))),
          h('div', { class: 'campo' }, h('label', null, 'Sono'), segmenti(Q.TIPI_IMPORT, s.tipo, x => { s.tipo = x; disegnaSinistra(); controlla(); }, 'piccoli')),
          h('div', { class: 'scheda righe interna' }, s.colonne.map((c, i) => h('div', { class: 'col-import' },
            h('span', { class: 'corpo' }, h('b', null, c.intestazione || 'Colonna ' + (i + 1)), h('span', { class: 't2 taglia' }, (c.esempi || []).length ? 'es. ' + c.esempi.slice(0, 2).join(', ') : 'vuota')),
            B.selezione(campiImport.filter(x => x[0] !== 'tipo' || s.tipo === 'colonna'), c.campo || '', v => { c.campo = v; controlla(); }, { 'aria-label': 'Campo di ' + (c.intestazione || 'colonna ' + (i + 1)) }))))]);
      };
      const disegnaDestra = () => {
        svuota(destra);
        const k = s.controllo;
        if (s.errore) { aggiungi(destra, [h('div', { class: 'banda calma' }, icona('avviso', 20), h('span', { class: 'spazio' }, s.errore))]); }
        if (!k) { if (!s.errore) aggiungi(destra, [segnaposto(3, 56)]); gialloImporta.disabled = true; gialloImporta.textContent = 'Importa'; return; }
        const anteprima = k.anteprima || [];
        const nuovi = anteprima.filter(x => (x.gruppo ? x.gruppo === 'nuovo' : !x.gia));
        const gia = anteprima.filter(x => (x.gruppo ? x.gruppo === 'gia' : x.gia));
        const quantiGia = k.gia !== undefined ? Number(k.gia) || 0 : k.completati || 0;
        const gruppo = (nome, n, righe, resto) => h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, nome + ' · ' + n),
          h('div', { class: 'scheda righe interna' }, righe, resto > 0 ? h('div', { class: 'riga' }, h('span', { class: 'corpo' }, h('span', { class: 't2' }, 'e altri ' + resto))) : null, !n ? h('div', { class: 'riga' }, h('span', { class: 'corpo' }, h('span', { class: 't2' }, 'Nessuno'))) : null));
        aggiungi(destra, [h('h3', null, 'Il controllo'),
          gruppo('Nuovi', k.nuovi || 0, nuovi.slice(0, 4).map(x => riga({ sinistra: quadrato('piu', 'ico-verde'), titolo: x.nome, sotto: ['Riga ' + x.riga, x.partitaIva ? 'Partita IVA ' + x.partitaIva : '', x.citta].filter(Boolean).join(' · ') })), (k.nuovi || 0) - Math.min(4, nuovi.length)),
          gruppo('Già in Wisper', quantiGia, gia.slice(0, 3).map(x => riga({ sinistra: quadrato('spunta', 'ico-blu'), titolo: x.nome, sotto: (x.completa || x.campi || []).length ? Q.campiDaCompletare(x.completa || x.campi) : 'C\u2019è già tutto: non si cambia niente' })), quantiGia - Math.min(3, gia.length)),
          gruppo('Da sistemare', (k.daSistemare || []).length, (k.daSistemare || []).slice(0, 5).map(x => {
            // Il nome della riga, se c'è, dall'anteprima del server (daSistemare ha solo riga ed errore).
            const nome = x.nome || (anteprima.find(a => a.gruppo === 'sistemare' && Number(a.riga) === Number(x.riga) && a.nome) || {}).nome || '';
            const n = x.riga || (String(x.errore || '').match(/^Riga (\d+) · /) || [])[1] || '';
            return riga({ sinistra: quadrato('allarme', 'ico-rosso'), titolo: [n ? 'Riga ' + n : '', nome].filter(Boolean).join(' · ') || 'Una riga del file',
              sotto: String(x.errore || '').replace(/^Riga \d+ · /, '') });
          }), (k.daSistemare || []).length - 5),
          (k.daSistemare || []).length ? h('span', { class: 'secondario' }, 'Le righe da sistemare si saltano.') : null]);
        gialloImporta.textContent = Q.testoImporta(k.nuovi, k.completati);
        gialloImporta.disabled = !(k.nuovi || k.completati);
      };
      const controlla = () => {
        clearTimeout(s.attesa);
        s.errore = Q.erroreColonne(s.colonne, s.tipo);
        if (s.errore) { s.controllo = null; disegnaDestra(); return; }
        s.controllo = null;
        disegnaDestra();
        s.attesa = setTimeout(async () => {
          try {
            s.controllo = await Rete.post('/server/controllaImport', { idLettura: letto.idLettura, colonne: s.colonne.map(c => ({ intestazione: c.intestazione, campo: c.campo || '' })), tipo: s.tipo });
            s.errore = '';
          } catch (e) {
            if (e && e.accesso === false) return;
            s.errore = e.message || String(e);
          }
          disegnaDestra();
        }, 250);
      };
      disegnaSinistra();
      controlla();
      let chiudi;
      gialloImporta.addEventListener('click', async () => {
        const r = await lavora('Importo', () => Rete.post('/server/importaSoggetti', { idLettura: letto.idLettura, colonne: s.colonne.map(c => ({ intestazione: c.intestazione, campo: c.campo || '' })), tipo: s.tipo }));
        if (!r) return;
        chiudi();
        M.importazioni = null;
        await W.ricaricaAnagrafiche().catch(() => null);
        avviso(Q.esitoImport(r.importazione || r, s.tipo), false, 8000);
        W.disegnaPagina();
      });
      chiudi = finestra({ contenuto: [h('div', { class: 'testa-f' }, h('h2', null, 'Importa clienti e fornitori'), tondo('chiudi', 'Chiudi', () => chiudi(), 'piccolo')),
        h('div', { class: 'corpo-f' }, h('div', { class: 'due-colonne import-due' }, sinistra, destra)),
        h('div', { class: 'piede-f' }, h('span', { class: 'spazio' }), h('button', { type: 'button', class: 'btn testo grande', onclick: () => chiudi() }, 'Annulla'), gialloImporta)],
      titolo: 'Importa clienti e fornitori', larghezza: 'larga', fuoco: false });
    }

    // ===================================================================== stato del sistema (§9.11)

    /** "Server 1.0.0 · acceso da 12 giorni" (§9.2). */
    function rigaStato(st) {
      const s = (st && st.server) || {};
      return ['Server ' + (s.versione || ''), s.acceso ? 'acceso da ' + Q.accesoDa(s.acceso, s.ora || oggi()) : ''].filter(Boolean).join(' · ');
    }

    function stato(pagina) {
      const area = h('div');
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Stato del sistema')), area]);
      M.stato = null;
      leggi(area, 'stato', '/server/statoSistema?oraDispositivo=' + encodeURIComponent(W.A8.oraLocale()), st => {
        const s = st.server || {};
        const diff = s.differenzaSecondi !== undefined ? s.differenzaSecondi : st.differenzaSecondi !== undefined ? st.differenzaSecondi : (s.ora ? Math.round((new Date(s.ora) - new Date()) / 1000) : 0);
        const ora = s.avvisoOra ? { ambra: true, testo: s.avvisoOra } : Q.fraseOra(diff, s.ora);
        const db = st.database || {};
        const disco = st.disco || {};
        const mb = n => (n === undefined || n === null ? '' : Number(n) >= 1024 * 1024 ? String(Math.round(Number(n) / 1024 / 1024 * 10) / 10).replace('.', ',') + ' TB' : Number(n) >= 1024 ? String(Math.round(Number(n) / 1024 * 10) / 10).replace('.', ',') + ' GB' : Math.round(Number(n)) + ' MB');
        const righeDb = db.righe ? Object.keys(db.righe).slice(0, 4).map(k => [k.charAt(0).toUpperCase() + k.slice(1), Q.migliaia(db.righe[k])]) : [];
        const server = scheda('Server', coppie([['Versione', s.versione], ['Acceso da', s.acceso ? Q.accesoDa(s.acceso, s.ora || oggi()) : ''], ['Schema', s.schema ? 'migrazione ' + String(s.schema).padStart(3, '0') : ''],
          ['Node', s.node], ['Ora del NAS', ora.testo, ora.ambra ? 'ambra' : '']], true));
        const database = scheda('Database', coppie([['Grandezza', db.mb !== undefined && db.mb !== null && db.mb !== '' ? String(db.mb).replace('.', ',') + ' MB' : ''], ['Controllo d\'integrità', db.controllato ? Q.quandoNotte(db.controllato, oggi()) + ' · ' + (db.integrita === 'ok' ? 'ok' : db.integrita || '') : '']].concat(righeDb), true));
        const discoS = scheda('Disco', [coppie([['Libero', mb(disco.liberoMb !== undefined ? disco.liberoMb : disco.libero)], ['Grandezza del disco', mb(disco.totaleMb)],
          ['Usato da Wisper', mb(disco.usatoMb !== undefined ? disco.usatoMb : disco.usato)]], true),
          h('div', null, h('button', { type: 'button', class: 'btn collegamento', onclick: () => W.vai('#amministrazione/spazio') }, 'Spazio sul NAS'))]);
        const lavori = (st.lavori || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Lavori della notte'), h('div', { class: 'scheda righe' }, st.lavori.map(l => riga({
          sinistra: quadrato(l.esito === 'ok' ? 'spunta' : 'allarme', l.esito === 'ok' ? 'ico-verde' : 'ico-rosso'), titolo: l.nome,
          sotto: [l.quando ? Q.quandoNotte(l.quando, oggi()) : 'mai', l.esito === 'ok' ? 'ok' : l.esito === 'errore' ? 'non riuscito' : l.esito, Q.senzaSegreti(l.nota || '')].filter(Boolean).join(' · ') })))) : null;
        const coll = st.collegamenti || {};
        const nErr = Array.isArray(coll.errori) ? coll.errori.length : Number(coll.errori) || 0;
        const collS = h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Collegamenti'), h('div', { class: 'scheda righe' }, riga({ sinistra: quadrato('spina', nErr ? 'ico-rosso' : 'ico-verde'),
          titolo: (coll.collegati || 0) + ' collegati, ' + nErr + ' in Errore', sotto: Array.isArray(coll.errori) && coll.errori.length ? coll.errori.map(e => (e && e.nome) || e).join(', ') : 'Apri le Integrazioni', onclick: W.puo('integrazioni') ? () => W.vai('#integrazioni') : null })));
        const v = st.versioni || {};
        const ultime = v.ultime || {};
        const disp = (v.dispositivi || []).length ? h('div', { class: 'sezione' }, h('span', { class: 'etichetta' }, 'Dispositivi e versioni'),
          ultime.telefono || ultime.computer ? h('span', { class: 'secondario' }, 'Ultima versione: ' + [ultime.telefono ? 'telefono ' + ultime.telefono : '', ultime.computer ? 'computer ' + ultime.computer : ''].filter(Boolean).join(', ')) : null,
          h('div', { class: 'scheda righe' }, v.dispositivi.map(d => riga({ sinistra: quadrato(/telefono/i.test(d.app || '') ? 'telefono' : 'laptop'), titolo: [d.nome, d.app].filter(Boolean).join(' · '),
            sotto: [d.persona, d.ultimoUso ? Q.quandoBreve(d.ultimoUso, oggi()) : ''].filter(Boolean).join(' · '),
            destra: d.vecchia || d.indietro ? pill('Ultima ' + (/telefono/i.test(d.app || '') ? ultime.telefono : ultime.computer || ''), 'ambra') : null })))) : null;
        aggiungi(area, [due([server, database, discoS], [lavori, collS, disp])]);
      });
    }

    // ===================================================================== lista di controllo (§11)

    /** "41 di 58 fatti" (§9.2). */
    function rigaControlli(c) {
      const r = (c && c.riassunto) || Q.contaControlli(c && c.gruppi, c && c.versioneServer);
      return (r.fatti || 0) + ' di ' + (r.totale || 0) + ' fatti';
    }

    function controlli(pagina) {
      const area = h('div');
      aggiungi(pagina, [h('div', { class: 'testata' }, h('h1', null, 'Lista di controllo')), area]);
      leggi(area, 'controlli', '/server/controlliFinali', c => {
        const ver = c.versioneServer || (S.io && S.io.interfaccia && S.io.interfaccia.versioneServer) || '';
        const r = c.riassunto || Q.contaControlli(c.gruppi, ver);
        const perc = r.totale ? Math.round((r.fatti || 0) / r.totale * 100) : 0;
        aggiungi(area, [h('div', { class: 'scheda fila riassunto-controlli' }, h('b', { class: 'grande-18' }, Q.riassuntoControlli(r)),
          h('div', { class: 'barra' }, h('i', { style: { width: perc + '%' } }))),
        cambio(c),
        segmenti([['tutte', 'Tutte'], ['dafare', 'Da fare'], ['nonvanno', 'Non vanno'], ['fatte', 'Fatte']], M.seg, x => { M.seg = x; W.ridisegna(); })]);
        const gruppi = Q.filtraControlli(c.gruppi || [], M.seg, ver);
        if (!gruppi.length) { aggiungi(area, [h('div', { class: 'calmo' }, icona('spunta', 20, 2.8), 'Niente qui')]); return; }
        // Le colonne stanno in stile.css (.tab-controlli): il testo va a capo, e nella tabella stretta (1024) Tipo e Nota
        // lasciano il posto al resto (si leggono nel pannello della riga). 07/11/2026: niente più testi coi puntini.
        gruppi.forEach(g => {
          const chiuso = !!M.chiusi[g.nome];
          const tab = h('div', { class: 'tab tab-controlli' }, h('div', { class: 'r testa' },
            h('span', null, 'Chiave'), h('span', null, 'Controllo'), h('span', { class: 'c-tipo' }, 'Tipo'), h('span', null, 'Chi'), h('span', null, 'Stato'), h('span', null, 'Il'), h('span', { class: 'c-nota' }, 'Nota')));
          g.righe.forEach(x => {
            const st = Q.STATI_CONTROLLO[Q.statoControllo(x, ver)];
            aggiungi(tab, [h('div', { class: 'r cliccabile' + (M.aperta === x.chiave ? ' scelta' : ''), role: 'button', tabindex: '0', 'data-chiave': x.chiave,
              onclick: () => apriRiga(x, ver), onkeydown: e => { if (e.key === 'Enter') apriRiga(x, ver); } },
            h('span', { class: 'chiave-c' }, x.chiave), h('span', { class: 'a-capo' }, x.testo), h('span', { class: 't2 c-tipo' }, Q.TIPI_CONTROLLO[x.tipo] || x.tipo),
            h('span', { class: 't2 a-capo' }, x.chi || '—'), h('span', null, pill(st.parola, st.colore)), h('span', { class: 't2' }, x.il ? Q.giornoMese(x.il, oggi()) : '—'),
            h('span', { class: 't2 a-capo c-nota' }, x.nota || ''))]);
          });
          aggiungi(area, [h('div', { class: 'sezione gruppo-controlli' },
            h('button', { type: 'button', class: 'testa-gruppo', 'aria-expanded': chiuso ? 'false' : 'true', onclick: () => { M.chiusi[g.nome] = !chiuso; W.ridisegna(); } },
              icona(chiuso ? 'avanti' : 'giu', 18, 2.4), h('span', { class: 'etichetta' }, g.nome + ' · ' + g.righe.length)),
            chiuso ? null : tab)]);
        });
        if (M.aperta) { const x = [].concat.apply([], (c.gruppi || []).map(g => g.righe || [])).find(y => y.chiave === M.aperta); if (x) apriRiga(x, ver, true); }
      });
    }

    /** Il cambio (§10.5, §10.7): lo stato e il passo dopo, solo per il titolare. */
    function cambio(c) {
      const k = c.cambio || null;
      if (!k || !titolare()) return null;
      const nomi = { prima: 'Prima del cambio', prova: 'Prova generale fatta', fatto: 'Cambio fatto', chiuso: 'Ritorno chiuso' };
      const dopo = { prima: ['prova', 'Segna la prova generale fatta'], prova: ['fatto', 'Segna il cambio fatto'], fatto: ['chiuso', 'Segna il ritorno chiuso'] }[k.stato];
      const quando = k.chiusoIl || k.cambioIl || k.provaIl;
      return h('div', { class: 'scheda riga-non-collegata' }, h('span', { class: 'ico-riga ico-grigio' }, icona('ripeti', 20, 2.2)),
        h('span', { class: 'corpo' }, h('b', null, 'Il cambio: ' + (nomi[k.stato] || k.stato)), quando ? h('span', { class: 't2' }, Q.quandoBreve(quando, oggi())) : null),
        dopo ? h('button', { type: 'button', class: 'btn', onclick: async () => {
          if (!(await conferma(dopo[1] + '?', dopo[0] === 'fatto' ? 'Da adesso il foglio non si scrive più: le versioni vecchie passano dal ponte o restano in coda.' : dopo[0] === 'chiuso' ? 'Dopo, non si torna più al foglio: i problemi si correggono nel server.' : 'Le due prove generali hanno detto Tutto torna.', dopo[1]))) return;
          const r = await lavora('Un momento', () => Rete.post('/server/segnaCambio', { stato: dopo[0] }));
          if (!r) return;
          M.controlli = null;
          W.disegnaPagina();
        } }, dopo[1]) : null);
    }

    function apriRiga(x, ver, gia) {
      M.aperta = x.chiave;
      document.querySelectorAll('.tab-controlli .r[data-chiave]').forEach(el => el.classList.toggle('scelta', el.dataset.chiave === x.chiave));
      const vecchio = document.querySelector('.pannello-controllo');
      const stato = Q.statoControllo(x, ver);
      const st = Q.STATI_CONTROLLO[stato];
      const puoSegnare = Q.segnabile(x) && scrive();
      const s = { stato: stato === 'fatto' ? 'fatto' : stato === 'non_va' ? 'non_va' : 'fatto', documento: x.documento || x.idDocumento || null };
      const nota = h('textarea', { rows: 4 });
      nota.value = x.nota || '';
      const zonaEsito = h('div');
      const disegnaEsito = () => aggiungi(svuota(zonaEsito), [segmenti([['fatto', 'Fatto'], ['non_va', 'Non va'], ['da_fare', 'Da fare']], s.stato, v => { s.stato = v; disegnaEsito(); }, 'piccoli')]);
      disegnaEsito();
      const zonaAllegato = h('div');
      const disegnaAllegato = () => aggiungi(svuota(zonaAllegato), [s.documento ? h('span', { class: 'secondario' }, 'Allegato: documento ' + (s.nomeDocumento || s.documento)) : null,
        h('button', { type: 'button', class: 'btn', onclick: () => allega(x, s, disegnaAllegato) }, icona('graffetta', 18, 2.2), 'Allega')]);
      disegnaAllegato();
      const corpo = h('div', { class: 'corpo' },
        h('div', { class: 'alto' }, h('span', { class: 'etichetta-pannello' }, x.chiave + ' · ' + (x.gruppo || '')), h('span', { class: 'spazio' }), tondo('chiudi', 'Chiudi', () => chiudiPannello(), 'piccolo')),
        h('h2', { class: 'titolo-pannello' }, x.testo),
        h('div', { class: 'pillole-testa' }, pill(st.parola, st.colore), x.il ? h('span', { class: 'secondario' }, Q.chiQuando(x, oggi())) : null),
        x.tipo === 'server'
          ? coppie([['Come', 'La controlla il server da solo, coi dati veri'], ['Adesso', x.nota || (stato === 'fatto' ? 'Va bene' : '')]])
          : coppie([['Come', Q.TIPI_CONTROLLO[x.tipo] || x.tipo], ['Chi', x.chi], ['Ultima volta', x.il ? Q.giornoMese(x.il, oggi()) + (x.utente ? ' · ' + x.utente : '') : 'mai'], ['Versione', x.versione], ['Nota', !puoSegnare ? x.nota : '']]),
        puoSegnare ? h('div', { class: 'fila' }, h('div', { class: 'campo' }, h('label', null, 'Esito'), zonaEsito), campo('Nota', nota), zonaAllegato) : null);
      const piede = puoSegnare ? h('div', { class: 'piede' }, h('button', { type: 'button', class: 'btn grande giallo', onclick: async () => {
        if (s.stato === 'non_va' && !nota.value.trim()) { avviso('Nota: scrivi cosa non va', true); nota.focus(); return; }
        const corpoR = { chiave: x.chiave, stato: s.stato, nota: nota.value.trim() };
        if (s.documento) corpoR.idDocumento = s.documento;
        const r = await lavora('Salvo', () => Rete.post('/server/segnaControllo', corpoR));
        if (!r) return;
        M.controlli = null;
        W.caricaDashboard();
        avviso(x.chiave + ': ' + Q.STATI_CONTROLLO[s.stato].parola);
        W.disegnaPagina();
      } }, 'Salva')) : null;
      const p = h('aside', { class: 'pannello pannello-controllo', 'aria-label': 'Il controllo ' + x.chiave }, corpo, piede);
      if (vecchio) { p.style.animation = 'none'; vecchio.replaceWith(p); } else aggiungi(B.$('#sovrapposti'), [p]);
      if (gia) p.style.animation = 'none';
    }

    function chiudiPannello(subito) {
      const p = document.querySelector('.pannello-controllo');
      M.aperta = null;
      document.querySelectorAll('.tab-controlli .r.scelta').forEach(x => x.classList.remove('scelta'));
      if (!p) return;
      if (subito) { p.remove(); return; }
      p.classList.add('via');
      setTimeout(() => p.remove(), 200);
    }

    /** Allega il rapporto o una schermata: va nell'archivio, categoria Collaudo di Wisper (§11.1). */
    async function allega(x, s, ridisegna) {
      if (!W.puo('documenti', 2)) { avviso('Per allegare serve il permesso di scrivere nei Documenti', true); return; }
      const scelto = await Rete.post('/locale/scegli-file', { filtro: 'documenti', percorso: true }).catch(e => { avviso(e.message, true); return null; });
      if (!scelto || !scelto.ok) return;
      const r = await lavora('Allego', async () => {
        const cat = ((await Rete.get('/server/categorieDocumenti')).categorie || []).find(c => /collaudo/i.test(c.nome || ''));
        const idFile = 'collaudo-' + x.chiave.replace(/\W/g, '') + '-' + Date.now();
        const c = await Rete.post('/locale/carica', { rif: scelto.rif, per: 'documento', idFile });
        return Rete.post('/server/salvaDocumento', { documento: { titolo: 'Collaudo di Wisper · ' + x.chiave + ' · ' + scelto.nome, idCategoria: cat ? cat.id : null, origine: 'file', idFile: c.file.id, idLocale: 'pc-' + idFile } });
      });
      if (!r || !r.documento) return;
      s.documento = r.documento.id;
      s.nomeDocumento = r.documento.titolo || scelto.nome;
      ridisegna();
      avviso('Allegato: si salva con la riga');
    }

    return { sicurezza, copie, importa, stato, controlli, chiudiPannello, daRileggere, rigaSicurezza, rigaCopie, rigaStato, rigaControlli, controlliSicurezza, M };
  };
})(window);
