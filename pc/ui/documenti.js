/*
 * Wisper Ufficio: i documenti da stampare in PDF.
 *
 * Due documenti:
 *  - il rapportino singolo, impaginato come quello di Pleya (che a chi lo deve
 *    usare piace): intestazione, mittente e cliente affiancati, la commessa, i
 *    dati in griglia, il lavoro, le firme. Gli importi solo se richiesti.
 *  - il riepilogo di un periodo per un cliente: le righe del mese
 *    con i totali, quello da cui si fa la fattura.
 *
 * Sono HTML fisso: il programma lo stampa con una WebView senza script. Il
 * formato della pagina (A4, margini, "Pagina X / Y") lo decide il CSS qui sotto.
 * Ogni testo che viene dal foglio passa da esc(): un cliente che si chiama
 * "<b>Rossi</b>" resta un nome, non diventa grassetto.
 */
(function (radice) {
  'use strict';

  const C = radice.WisperConti || (typeof require === 'function' ? require('./conti.js') : null);

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Testo dentro una stringa CSS ("..."): niente virgolette né a capo che la spezzino. */
  function escCss(s) {
    return String(s || '').replace(/[\\"]/g, '').replace(/[\r\n]+/g, ' ');
  }

  /**
   * L'id di un file dal suo indirizzo: quello di Drive (".../d/<id>/view", il foglio)
   * o quello del server ("/file/<id>", dalla 0.5: per esempio la firma del tecnico).
   */
  function idDaUrl(url) {
    const s = String(url || '');
    const m = s.match(/\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/^\/file\/([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }

  function immagine(id, classe) {
    return id ? '<img class="' + classe + '" src="/file/' + encodeURIComponent(id) + '" alt="">' : '';
  }

  // Il simbolo di Wisper, piccolo, accanto al numero di pagina.
  const SIMBOLO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#1B1B1F"/>' +
    [[16, 7.5], [22, 10], [24.5, 16], [22, 22], [16, 24.5], [10, 22], [7.5, 16], [10, 10]].map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="#FFC53D"/>').join('') +
    '<circle cx="16" cy="16" r="3.2" fill="#F2F4F7"/></svg>');

  /**
   * Fase 8 (fase8.md §9.3): il logo dello studio in cima ai PDF, se c'è (STUDIO_LOGO, l'id del file) e se è acceso
   * (PDF_LOGO, di base sì). Senza logo, o con PDF_LOGO spento, i PDF restano identici a prima, carattere per carattere.
   */
  function logoDi(imp) {
    const x = imp || {};
    if (x.PDF_LOGO === false || x.PDF_LOGO === 'false' || x.PDF_LOGO === 0 || x.PDF_LOGO === 'NO') return '';
    const v = String(x.STUDIO_LOGO || '');
    const m = v.match(/^\/file\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : /^[A-Za-z0-9_-]{4,}$/.test(v) ? v : '';
  }

  /** La riga in fondo ai PDF (PDF_PIEDE), sotto quella di sempre; vuota = il piè di prima. */
  const pieDi = imp => String((imp && imp.PDF_PIEDE) || '').trim();

  /**
   * Il formato: A4, Figtree, i grigi di docs/aspetto.md. Niente giallo pieno:
   * si stampa anche in bianco e nero.
   */
  function stile(imp, extra) {
    const piede = [imp.RAGIONE_SOCIALE, imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : ''].filter(Boolean).join(' · ');
    const carattere = '"Figtree", "Segoe UI", Arial, sans-serif';
    // Fase 8: con la riga in fondo ai PDF il piè ha due righe; senza, la regola di prima com'era.
    const sotto = pieDi(imp);
    const bassoSinistra = sotto
      ? '  @bottom-left { content: "' + escCss(piede) + '\\A ' + escCss(sotto) + '"; white-space: pre; font: 500 8.5px ' + carattere + '; color: #8A8A92; }'
      : '  @bottom-left { content: "' + escCss(piede) + '"; font: 500 8.5px ' + carattere + '; color: #8A8A92; }';
    return '<style>' +
      '@font-face { font-family: "Figtree"; src: url("/font/Figtree.ttf") format("truetype"); font-weight: 300 900; font-display: block; }' +
      '@page { size: A4; margin: 14mm 14mm 18mm 14mm;' +
      bassoSinistra +
      '  @bottom-right { content: url("' + SIMBOLO + '") "  Pagina " counter(page) " / " counter(pages); font: 500 8.5px ' + carattere + '; color: #8A8A92; } }' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; font: 500 10.5px/1.45 ' + carattere + '; color: #1B1B1F; }' +
      '.testa { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1B1B1F; padding-bottom: 10px; margin-bottom: 14px; }' +
      '.azienda { font-size: 17px; font-weight: 800; letter-spacing: -0.2px; }' +
      '.tipo { text-align: right; } .tipo .etichetta { font-size: 8.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #5F5F67; }' +
      '.tipo .numero { font-size: 19px; font-weight: 800; letter-spacing: -0.3px; } .tipo .sotto { color: #5F5F67; font-weight: 600; }' +
      '.parti { display: flex; gap: 12px; margin-bottom: 12px; }' +
      '.parte { flex: 1; background: #F4F4F2; border-radius: 8px; padding: 9px 11px; }' +
      '.parte .etichetta, .cella .etichetta, .blocco .etichetta { font-size: 8.5px; font-weight: 700; letter-spacing: .1em; color: #5F5F67; text-transform: uppercase; margin-bottom: 3px; }' +
      '.parte .nome { font-weight: 800; font-size: 12px; }' +
      '.barra { border: 1.5px solid #1B1B1F; border-radius: 8px; padding: 7px 11px; font-weight: 700; font-size: 11.5px; margin-bottom: 12px; }' +
      '.barra .cod { font-family: Consolas, monospace; font-weight: 700; background: #1B1B1F; color: #FFFFFF; border-radius: 4px; padding: 1px 6px; margin-right: 8px; }' +
      '.griglia { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 12px; margin-bottom: 12px; }' +
      '.cella .valore { font-size: 12px; font-weight: 700; }' +
      '.blocco { border: 1px solid #E6E5E1; border-radius: 8px; padding: 9px 11px; margin-bottom: 10px; break-inside: avoid; }' +
      '.blocco .testo { white-space: pre-wrap; font-size: 11px; }' +
      'table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }' +
      'th { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5F5F67; text-align: left; border-bottom: 1.5px solid #1B1B1F; padding: 5px 4px; }' +
      'td { border-bottom: 1px solid #EFEEEB; padding: 5px 4px; vertical-align: top; }' +
      'tr { break-inside: avoid; }' +
      '.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }' +
      'tfoot td { font-weight: 800; border-top: 1.5px solid #1B1B1F; border-bottom: none; }' +
      '.conto { margin-left: auto; width: 55%; } .conto td { border: none; padding: 3px 4px; } .conto .tot td { font-size: 13px; font-weight: 800; border-top: 1.5px solid #1B1B1F; padding-top: 6px; }' +
      '.sotto-riga { color: #5F5F67; font-size: 9px; }' +
      '.firme { display: flex; gap: 24px; margin-top: 22px; break-inside: avoid; }' +
      '.firma { flex: 1; } .firma .spazio { height: 62px; display: flex; align-items: flex-end; border-bottom: 1px solid #1B1B1F; }' +
      '.firma img { max-height: 60px; max-width: 100%; } .firma .chi { margin-top: 3px; color: #5F5F67; font-size: 9.5px; }' +
      '.allegati { break-before: page; } .allegati h2 { font-size: 13px; font-weight: 800; margin: 0 0 10px; }' +
      '.foto { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
      '.foto figure { margin: 0; break-inside: avoid; border: 1px solid #E6E5E1; border-radius: 8px; padding: 6px; }' +
      '.foto img { width: 100%; max-height: 330px; object-fit: contain; } .foto figcaption { font-size: 9px; color: #5F5F67; margin-top: 4px; }' +
      // Preventivo e incarico (fase 2): sezioni con il subtotale, voci facoltative e alternative marcate.
      'h3.sez { font-size: 11.5px; font-weight: 800; margin: 14px 0 4px; letter-spacing: -0.1px; }' +
      'table.voci td.desc { width: 52%; } table.voci tfoot td { font-weight: 700; border-top: 1px solid #1B1B1F; }' +
      'tr.fuori td { color: #8A8A92; } tr.fuori td.n { text-decoration: line-through; }' +
      '.segno { display: inline-block; font-size: 8px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border: 1px solid #8A8A92; color: #3F3F46; border-radius: 4px; padding: 0 4px; margin-left: 4px; }' +
      '.articolo { margin-bottom: 10px; break-inside: avoid; } .articolo h3 { font-size: 11.5px; font-weight: 800; margin: 0 0 3px; }' +
      '.articolo .testo { white-space: pre-wrap; font-size: 10.5px; }' +
      '.due-blocchi { display: flex; gap: 12px; } .due-blocchi .blocco { flex: 1; }' +
      (logoDi(imp) ? STILE_LOGO : '') +
      (extra || '') +
      '</style>';
  }

  // 03/11/2026 (progetti.md §4): la riga del progetto sotto la commessa, solo nei rapportini che ne hanno uno (gli altri restano identici).
  const STILE_PROGETTO = '.riga-progetto { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin-bottom: 12px; }';

  /** Il progetto di un rapportino: {codice, descrizione, intestatoA} o null (dal rapportino, altrimenti dall'elenco dei progetti). */
  function progettoDi(r, ana) {
    const id = r.idProgetto;
    const p = id !== undefined && id !== null && id !== '' ? ((ana && ana.progetti) || []).find(x => String(x.id) === String(id)) : null;
    const codice = String(r.progetto || (p && p.codice) || '').trim();
    if (!codice && !p) return null;
    return { codice, descrizione: String(r.progettoDescrizione || (p && p.descrizione) || '').trim(), intestatoA: String(r.progettoIntestatoA || (p && p.intestatoA) || '').trim() };
  }

  // Fase 8: il logo a sinistra, alto 14 mm, accanto alla ragione sociale (solo quando c'è).
  const STILE_LOGO = '.studio-logo { display: flex; align-items: center; gap: 4mm; } .studio-logo img { height: 14mm; max-width: 50mm; object-fit: contain; }';

  /**
   * 06/11/2026: col logo in cima, il nome dello studio accanto si può togliere (PDF_NOME, di base sì; spento come
   * PDF_LOGO: false, 'false', 0 o 'NO'). Il Mittente e il piè di pagina tengono il nome.
   */
  function nomeAccantoAlLogo(imp) {
    const v = (imp || {}).PDF_NOME;
    return !(v === false || v === 'false' || v === 0 || v === 'NO');
  }

  /** La ragione sociale in cima, col logo davanti se c'è (senza nome se conNome è false). */
  function aziendaInTesta(nome, idLogo, conNome) {
    const azienda = '<div class="azienda">' + esc(nome || '') + '</div>';
    return idLogo ? '<div class="studio-logo"><img src="/file/' + encodeURIComponent(idLogo) + '" alt="">' + (conNome === false ? '' : azienda) + '</div>' : azienda;
  }

  function intestazione(imp, etichetta, numero, sotto) {
    if (logoDi(imp)) {
      return '<div class="testa">' + aziendaInTesta(imp.RAGIONE_SOCIALE, logoDi(imp), nomeAccantoAlLogo(imp)) +
        '<div class="tipo"><div class="etichetta">' + esc(etichetta) + '</div>' +
        '<div class="numero">' + esc(numero) + '</div><div class="sotto">' + esc(sotto) + '</div></div></div>';
    }
    return '<div class="testa"><div class="azienda">' + esc(imp.RAGIONE_SOCIALE || '') + '</div>' +
      '<div class="tipo"><div class="etichetta">' + esc(etichetta) + '</div>' +
      '<div class="numero">' + esc(numero) + '</div><div class="sotto">' + esc(sotto) + '</div></div></div>';
  }

  /** "Commessa 26ST001" o "Commesse 26ST001, 26ST004" ('' senza commesse), per la parte del Mittente. */
  function rigaCommesse(codici) {
    const l = [];
    (Array.isArray(codici) ? codici : codici ? [codici] : []).forEach(c => { const x = String(c || '').trim(); if (x && l.indexOf(x) < 0) l.push(x); });
    if (!l.length) return '';
    return (l.length === 1 ? 'Commessa ' : 'Commesse ') + l.join(', ');
  }

  /**
   * La parte del Mittente. commesse: i codici delle commesse del documento (06/11/2026, riunione con Manuel: il codice
   * della commessa sta qui, dove prima c'era quello del progetto c'è il progetto); senza, il Mittente resta com'era.
   */
  function mittente(imp, commesse) {
    const righe = [
      imp.INDIRIZZO,
      imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : '',
      [imp.EMAIL, imp.TELEFONO].filter(Boolean).join(' · '),
      imp.PEC ? 'PEC ' + imp.PEC : '',
      rigaCommesse(commesse),
    ].filter(Boolean);
    return '<div class="parte"><div class="etichetta">Mittente</div><div class="nome">' + esc(imp.RAGIONE_SOCIALE || '') + '</div>' +
      righe.map(r => '<div>' + esc(r) + '</div>').join('') + '</div>';
  }

  function destinatario(nome, righe) {
    return '<div class="parte"><div class="etichetta">Spett.le</div><div class="nome">' + esc(nome) + '</div>' +
      righe.filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div>';
  }

  function cella(etichetta, valore) {
    return '<div class="cella"><div class="etichetta">' + esc(etichetta) + '</div><div class="valore">' + esc(valore) + '</div></div>';
  }

  function pagina(imp, titolo, corpo, extra) {
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + esc(titolo) + '</title>' +
      stile(imp, extra) + '</head><body>' + corpo + '</body></html>';
  }

  function righeConto(r) {
    const orePagate = C.num(r.oreLavoro) + (r.pagaViaggio ? C.num(r.oreViaggio) : 0);
    let dettaglioOre = C.ore(orePagate) + ' × ' + C.euro(r.tariffa);
    if (C.num(r.oreExtra) > 0) {
      dettaglioOre += ' + ' + C.ore(r.oreExtra) + ' extra' + (C.num(r.maggExtra) > 0 ? ' (+' + C.numero(r.maggExtra) + '%)' : '');
    }
    return '<table class="conto"><tbody>' +
      '<tr><td>Compenso ore<div class="sotto-riga">' + esc(dettaglioOre) + '</div></td><td class="n">' + esc(C.euro(r.compensoOre)) + '</td></tr>' +
      '<tr><td>Rimborso km<div class="sotto-riga">' +
      esc(r.kmRimborsati ? C.numero(r.km) + ' km × ' + C.numero(r.euroKm) + ' €' : 'non rimborsati') +
      '</div></td><td class="n">' + esc(C.euro(r.rimborsoKm)) + '</td></tr>' +
      '<tr><td>Spese</td><td class="n">' + esc(C.euro(r.spese)) + '</td></tr>' +
      '<tr class="tot"><td>Totale</td><td class="n">' + esc(C.euro(r.totale)) + '</td></tr>' +
      '</tbody></table>';
  }

  /**
   * Fase 6: la riga "Strumenti" del rapportino, dagli strumenti congelati quel giorno (nome, matricola, scadenza
   * della taratura di allora, anche se passata): "Misuratore di terra MT-500 matr. 22-0451, tarato fino al
   * 15/11/2026 · Multimetro 87V matr. 6011-2381, tarato fino al 16/10/2026". Vuota senza strumenti.
   */
  function rigaStrumenti(strumenti) {
    return (Array.isArray(strumenti) ? strumenti : []).map(s => {
      const verifica = !!s.verifica;
      const nome = String(s.nome || '') + (s.matricola ? ' matr. ' + s.matricola : '');
      let stato;
      if (s.statoAllora === 'non_conforme') stato = 'non conforme';
      else if (s.scadeAllora) stato = (verifica ? 'verificato' : 'tarato') + ' fino al ' + C.data(s.scadeAllora);
      else if (s.statoAllora === 'senza') stato = (verifica ? 'verifica' : 'taratura') + ' non scritta';
      else stato = '';
      return nome + (stato ? ', ' + stato : '');
    }).filter(Boolean).join(' · ');
  }

  // 06/11/2026 (rapportino-lavori.md): il rapportino con più lavori, una riga per lavoro nella tabella.
  const STILE_LAVORI = 'table.lavori td.prog { width: 26%; } table.lavori td.desc { width: 34%; } table.lavori .cod-l { font-family: Consolas, monospace; font-weight: 700; }' +
    'table.lavori td .nome-l { font-weight: 700; } table.lavori tfoot td:first-child { white-space: nowrap; }';

  /** Le parole dello stato sul PDF: niente "da firmare" (06/11/2026); un lavoro da inviare non scrive niente. */
  const STATO_PDF = { INVIATO: 'Inviato', FATTURATO: 'Fatturato' };

  /** "4 h" com'è nelle tabelle: "" per lo zero (le colonne vuote si leggono meglio). */
  const oreCella = n => (C.num(n) ? C.numero(n) : '');

  /**
   * Il rapportino con i suoi lavori (06/11/2026): g = { id (il numero del rapportino), data, tecnico, lavori: [i lavori
   * dello stesso rapportino e dello STESSO destinatario] }. Una riga per lavoro: progetto (codice e descrizione, a chi è
   * intestato), commessa, cosa si è fatto, ore di lavoro, extra e viaggio, km, spese, l'importo con "Con gli importi"; in
   * fondo il totale del giorno. I codici delle commesse nel Mittente. Niente riquadro per la firma del cliente: solo un
   * lavoro di prima che ha la firma la mostra ancora.
   */
  function rapportinoLavori(g, ana, o) {
    const imp = ana.impostazioni || {};
    const lavori = (g.lavori || []).map((l, i) => ({ l, i }))
      .sort((a, b) => ((Number(a.l.posizione) || 0) - (Number(b.l.posizione) || 0)) || a.i - b.i).map(x => x.l);
    const primo = lavori[0] || {};
    const idCliente = g.idCliente || primo.idCliente;
    const nomeCliente = g.cliente || primo.cliente || '';
    const cliente = (ana.clienti || []).find(c => c.id === idCliente) || (ana.soggetti || []).find(c => c.id === idCliente) || { nome: nomeCliente };
    const data = String(g.data || primo.data || '').slice(0, 10);
    const tecnico = g.tecnico || primo.tecnico || imp.TECNICO || '';
    const n = lavori.length;
    const conImporti = !!o.conImporti;
    let corpo = intestazione(imp, 'Rapportino di lavoro', g.id || primo.idGiornata || primo.id || 'Rapportino', 'del ' + C.data(data) + ' · ' + (n === 1 ? '1 lavoro' : n + ' lavori'));
    corpo += '<div class="parti">' + mittente(imp, lavori.map(l => l.idCommessa)) + destinatario(cliente.nome || nomeCliente, [
      cliente.indirizzo,
      cliente.partitaIva ? 'P.IVA ' + cliente.partitaIva : '',
      cliente.email,
    ]) + '</div>';
    const t = C.totali(lavori);
    const oreGiorno = C.centesimi(t.oreLavoro + t.oreExtra + t.oreViaggio);
    const luoghi = Array.from(new Set(lavori.map(l => String(l.luogo || '').trim()).filter(Boolean)));
    corpo += '<div class="griglia">' +
      cella('Data', C.data(data)) +
      cella('Tecnico', tecnico) +
      cella('Luogo', luoghi.length === 1 ? luoghi[0] : luoghi.length ? 'vedi i lavori' : '—') +
      cella('Ore', C.ore(oreGiorno)) +
      '</div>';
    corpo += '<table class="lavori"><thead><tr><th>Progetto · Commessa</th><th>Lavoro svolto</th>' +
      '<th class="n">Lavoro</th><th class="n">Extra</th><th class="n">Viaggio</th><th class="n">Km</th><th class="n">Spese</th>' +
      (conImporti ? '<th class="n">Importo</th>' : '') + '</tr></thead><tbody>';
    lavori.forEach(l => {
      const p = progettoDi(l, ana);
      const commessa = (ana.commesse || []).find(m => m.id === l.idCommessa);
      const nomeCommessa = l.idCommessa ? 'Commessa ' + l.idCommessa : (l.commessa ? 'Commessa ' + l.commessa : '');
      const sottoLavoro = [
        luoghi.length > 1 && l.luogo ? 'Luogo: ' + l.luogo : '',
        rigaStrumenti(l.strumenti) ? 'Strumenti: ' + rigaStrumenti(l.strumenti) : '',
        l.ticket ? 'Ticket ' + l.ticket : '',
      ].filter(Boolean);
      corpo += '<tr><td class="prog">' +
        (p && p.codice ? '<div><span class="cod-l">' + esc(p.codice) + '</span>' + (p.descrizione ? ' · ' + esc(p.descrizione) : '') + '</div>' : '') +
        (p && p.intestatoA ? '<div class="sotto-riga">Intestato a ' + esc(p.intestatoA) + '</div>' : '') +
        (nomeCommessa ? '<div' + (p && p.codice ? ' class="sotto-riga"' : ' class="nome-l"') + '>' + esc(nomeCommessa) + '</div>' : '') +
        (commessa && commessa.descrizione && !(p && p.codice) ? '<div class="sotto-riga">' + esc(commessa.descrizione) + '</div>' : '') +
        (!(p && p.codice) && !nomeCommessa ? '—' : '') + '</td>' +
        '<td class="desc"><div class="testo-l">' + esc(l.descrizione || '') + '</div>' +
        sottoLavoro.map(x => '<div class="sotto-riga">' + esc(x) + '</div>').join('') + '</td>' +
        '<td class="n">' + esc(oreCella(l.oreLavoro)) + '</td><td class="n">' + esc(oreCella(l.oreExtra)) + '</td>' +
        '<td class="n">' + esc(oreCella(l.oreViaggio)) + '</td><td class="n">' + esc(C.num(l.km) ? C.numero(l.km) : '') + '</td>' +
        '<td class="n">' + esc(C.num(l.spese) ? C.euro(l.spese) : '') + (l.noteSpese && C.num(l.spese) ? '<div class="sotto-riga">' + esc(l.noteSpese) + '</div>' : '') + '</td>' +
        (conImporti ? '<td class="n">' + esc(C.euro(l.totale)) + '</td>' : '') + '</tr>';
    });
    corpo += '</tbody><tfoot><tr><td colspan="2">Totale del giorno</td>' +
      '<td class="n">' + esc(C.numero(t.oreLavoro)) + '</td><td class="n">' + esc(C.numero(t.oreExtra)) + '</td>' +
      '<td class="n">' + esc(C.numero(t.oreViaggio)) + '</td><td class="n">' + esc(C.numero(t.km)) + '</td>' +
      '<td class="n">' + esc(C.euro(t.spese)) + '</td>' + (conImporti ? '<td class="n">' + esc(C.euro(t.totale)) + '</td>' : '') +
      '</tr></tfoot></table>';
    if (conImporti) {
      corpo += '<table class="conto"><tbody>' +
        '<tr><td>Compenso ore<div class="sotto-riga">' + esc(C.ore(oreGiorno)) + '</div></td><td class="n">' + esc(C.euro(t.compenso)) + '</td></tr>' +
        '<tr><td>Rimborso km<div class="sotto-riga">' + esc(C.numero(t.km)) + ' km</div></td><td class="n">' + esc(C.euro(t.rimborso)) + '</td></tr>' +
        '<tr><td>Spese</td><td class="n">' + esc(C.euro(t.spese)) + '</td></tr>' +
        '<tr class="tot"><td>Totale del giorno</td><td class="n">' + esc(C.euro(t.totale)) + '</td></tr>' +
        '</tbody></table>';
    }
    // Le note per sé (noteInterne) non ci vanno MAI.
    const firmaTecnico = idDaUrl(imp.FIRMA_TECNICO);
    // Solo un lavoro di prima con la firma del cliente la mostra ancora (il primo che ce l'ha).
    const vecchio = lavori.find(l => l.firma && l.firma.id);
    corpo += '<div class="firme">' +
      '<div class="firma"><div class="spazio">' + immagine(firmaTecnico, 'sig') + '</div>' +
      '<div class="chi">Firma del compilatore · ' + esc(tecnico) + '</div></div>' +
      (vecchio ? '<div class="firma"><div class="spazio">' + immagine(vecchio.firma.id, 'sig') + '</div>' +
        '<div class="chi">Firma per accettazione' + (vecchio.firmatario ? ' · ' + esc(vecchio.firmatario) : '') +
        (vecchio.firmatoIl ? ' · firmato il ' + esc(C.data(vecchio.firmatoIl)) : '') + '</div></div>' : '<div class="firma"></div>') +
      '</div>';
    const conFoto = lavori.filter(l => (l.foto || []).length);
    if (o.conFoto && conFoto.length) {
      corpo += '<div class="allegati"><h2>Scontrini · ' + esc(g.id || '') + '</h2><div class="foto">' +
        conFoto.map(l => l.foto.map((f, i) => '<figure>' + immagine(f.id, '') + '<figcaption>' +
          esc((l.cliente || '') + (l.noteSpese ? ' · ' + l.noteSpese : '') + (l.foto.length > 1 ? ' · ' + (i + 1) : '')) +
          '</figcaption></figure>').join('')).join('') +
        '</div></div>';
    }
    return pagina(imp, 'Rapportino ' + (g.id || ''), corpo, STILE_LAVORI);
  }

  /**
   * Il rapportino. Con r.lavori (06/11/2026) è il rapportino con più lavori (rapportinoLavori: r = { id, data, tecnico,
   * lavori }); senza, il rapportino di un lavoro solo come prima.
   * opzioni: conImporti (il conto, di solito no: al cliente serve il lavoro), conFoto (gli scontrini in fondo).
   */
  function rapportino(r, ana, opzioni) {
    const o = opzioni || {};
    if (r && Array.isArray(r.lavori)) return rapportinoLavori(r, ana, o);
    const imp = ana.impostazioni || {};
    const cliente = (ana.clienti || []).find(c => c.id === r.idCliente) || { nome: r.cliente };
    const commessa = (ana.commesse || []).find(m => m.id === r.idCommessa);
    // 06/11/2026: niente firma, quindi niente "Bozza" o "Firmato" sul foglio; Inviato e Fatturato restano.
    const stato = STATO_PDF[String(r.stato || '').toUpperCase()] || '';
    let corpo = intestazione(imp, 'Rapportino di lavoro', r.id || 'Rapportino', 'del ' + C.data(r.data) + (stato ? ' · ' + stato : ''));
    // 06/11/2026 (riunione con Manuel): il codice della commessa va nel Mittente ("Commessa 26ST001"); nella barra, dove
    // c'era la commessa, il codice del progetto (niente barra senza progetto). La descrizione del progetto resta nella sua cella.
    corpo += '<div class="parti">' + mittente(imp, r.idCommessa ? [r.idCommessa] : []) + destinatario(cliente.nome || r.cliente, [
      cliente.indirizzo,
      cliente.partitaIva ? 'P.IVA ' + cliente.partitaIva : '',
      cliente.email,
    ]) + '</div>';
    // 03/11/2026: il progetto (codice e descrizione) e, se c'è, a chi è intestato.
    const progetto = progettoDi(r, ana);
    if (progetto && progetto.codice) corpo += '<div class="barra"><span class="cod">' + esc(progetto.codice) + '</span></div>';
    if (progetto) {
      corpo += '<div class="riga-progetto">' + cella('Progetto', [progetto.codice, progetto.descrizione].filter(Boolean).join(' · ')) +
        (progetto.intestatoA ? cella('Intestato a', progetto.intestatoA) : '') + '</div>';
    }
    corpo += '<div class="griglia">' +
      cella('Data', C.data(r.data)) +
      cella('Tecnico', r.tecnico || imp.TECNICO || '') +
      cella('Luogo', r.luogo || (commessa && commessa.indirizzo) || '—') +
      (r.ticket ? cella('Ticket', r.ticket) : stato ? cella('Stato', stato) : '<div class="cella"></div>') +
      cella('Ore di lavoro', C.ore(r.oreLavoro)) +
      cella('Ore extra', C.ore(r.oreExtra)) +
      cella('Ore di viaggio', C.ore(r.oreViaggio)) +
      cella('Chilometri', C.numero(r.km) + ' km') +
      '</div>';
    corpo += '<div class="blocco"><div class="etichetta">Attività svolte</div><div class="testo">' + esc(r.descrizione || '') + '</div></div>';
    // Fase 6 (fase6.md §3.9): la riga Strumenti solo quando ce ne sono; i rapportini senza strumenti restano identici.
    const strumenti = rigaStrumenti(r.strumenti);
    if (strumenti) corpo += '<div class="blocco"><div class="etichetta">Strumenti</div><div class="testo">' + esc(strumenti) + '</div></div>';
    if (C.num(r.spese) > 0 || r.noteSpese) {
      corpo += '<div class="blocco"><div class="etichetta">Spese</div><div class="testo">' +
        esc(C.euro(r.spese) + (r.noteSpese ? ' · ' + r.noteSpese : '')) +
        ((r.foto || []).length ? ' · ' + (r.foto.length === 1 ? '1 scontrino' : r.foto.length + ' scontrini') + ' in allegato' : '') +
        '</div></div>';
    }
    // Le note interne non ci vanno MAI: in Pleya si chiamano "non visibili al
    // cliente" e poi finiscono sul foglio stampato.
    if (o.conImporti) corpo += righeConto(r);

    const firmaTecnico = idDaUrl(imp.FIRMA_TECNICO);
    const firmaCliente = r.firma && r.firma.id;
    // 06/11/2026: il riquadro della firma del cliente solo per un rapportino di prima che la firma ce l'ha.
    corpo += '<div class="firme">' +
      '<div class="firma"><div class="spazio">' + immagine(firmaTecnico, 'sig') + '</div>' +
      '<div class="chi">Firma del compilatore · ' + esc(r.tecnico || imp.TECNICO || '') + '</div></div>' +
      (firmaCliente ? '<div class="firma"><div class="spazio">' + immagine(firmaCliente, 'sig') + '</div>' +
        '<div class="chi">Firma per accettazione' + (r.firmatario ? ' · ' + esc(r.firmatario) : '') +
        (r.firmatoIl ? ' · firmato il ' + esc(C.data(r.firmatoIl)) : '') + '</div>' +
        // Fase 7 (fase7.md §3.7): firmato a distanza nel portale. Solo allora: i rapportini firmati sul telefono restano identici.
        (r.firmaModo === 'portale' ? '<div class="chi">Firmato nel portale da ' + esc(r.firmatario || '') + ' · ' + esc(C.dataOra(r.firmatoIl)) + '</div>' : '') +
        '</div>' : '<div class="firma"></div>') +
      '</div>';

    if (o.conFoto && (r.foto || []).length) {
      corpo += '<div class="allegati"><h2>Scontrini · ' + esc(r.id) + '</h2><div class="foto">' +
        r.foto.map((f, i) => '<figure>' + immagine(f.id, '') + '<figcaption>Scontrino ' + (i + 1) +
          (r.noteSpese ? ' · ' + esc(r.noteSpese) : '') + '</figcaption></figure>').join('') +
        '</div></div>';
    }
    return pagina(imp, 'Rapportino ' + (r.id || ''), corpo, progetto ? STILE_PROGETTO : '');
  }

  /**
   * Il riepilogo di un periodo: le righe e i totali, per fare la fattura.
   * destinatario: { nome, righe[] }  (il cliente, per esempio Elettrodinamica)
   * opzioni: conImporti (di solito sì), conFoto
   */
  function riepilogo(lista, ana, intestatario, periodo, opzioni) {
    const o = opzioni || {};
    const imp = ana.impostazioni || {};
    const righe = C.ordina(lista, 'data', 1);
    const t = C.totali(righe);
    // 06/11/2026: una riga per lavoro; il N° è quello del rapportino (numero / idGiornata), che più lavori condividono.
    const numeroDi = r => r.numero || r.idGiornata || r.id || '';
    const nr = new Set(righe.map(numeroDi)).size;
    let corpo = intestazione(imp, 'Riepilogo rapportini', periodo || '', intestatario.nome + ' · ' +
      (nr === t.n ? (t.n === 1 ? '1 rapportino' : t.n + ' rapportini') : t.n + ' lavori in ' + (nr === 1 ? '1 rapportino' : nr + ' rapportini')));
    // 06/11/2026: le commesse dei rapportini nel Mittente; nella tabella, al posto della commessa, il progetto.
    corpo += '<div class="parti">' + mittente(imp, righe.map(r => r.idCommessa)) + destinatario(intestatario.nome, intestatario.righe || []) + '</div>';

    const conImporti = !!o.conImporti;
    corpo += '<table><thead><tr><th>Data</th><th>N°</th><th>Progetto</th><th>Lavoro svolto</th>' +
      '<th class="n">Lavoro</th><th class="n">Extra</th><th class="n">Viaggio</th><th class="n">Km</th><th class="n">Spese</th>' +
      (conImporti ? '<th class="n">Importo</th>' : '') + '</tr></thead><tbody>';
    righe.forEach(r => {
      const progetto = progettoDi(r, ana);
      corpo += '<tr><td>' + esc(C.data(r.data)) + '</td><td>' + esc(numeroDi(r)) + '</td>' +
        '<td>' + esc((progetto && progetto.codice) || '—') +
        (intestatario.mostraCliente ? '<div class="sotto-riga">' + esc(r.cliente) + '</div>' : '') + '</td>' +
        '<td>' + esc(r.descrizione || '') + '</td>' +
        '<td class="n">' + esc(C.numero(r.oreLavoro)) + '</td><td class="n">' + esc(C.numero(r.oreExtra)) + '</td>' +
        '<td class="n">' + esc(C.numero(r.oreViaggio)) + '</td><td class="n">' + esc(C.numero(r.km)) + '</td>' +
        '<td class="n">' + esc(C.num(r.spese) ? C.euro(r.spese) : '') + '</td>' +
        (conImporti ? '<td class="n">' + esc(C.euro(r.totale)) + '</td>' : '') + '</tr>';
    });
    corpo += '</tbody><tfoot><tr><td colspan="4">Totale</td>' +
      '<td class="n">' + esc(C.numero(t.oreLavoro)) + '</td><td class="n">' + esc(C.numero(t.oreExtra)) + '</td>' +
      '<td class="n">' + esc(C.numero(t.oreViaggio)) + '</td><td class="n">' + esc(C.numero(t.km)) + '</td>' +
      '<td class="n">' + esc(C.euro(t.spese)) + '</td>' + (conImporti ? '<td class="n">' + esc(C.euro(t.totale)) + '</td>' : '') +
      '</tr></tfoot></table>';

    if (conImporti) {
      corpo += '<table class="conto"><tbody>' +
        '<tr><td>Ore totali</td><td class="n">' + esc(C.ore(t.ore)) + '</td></tr>' +
        '<tr><td>Compenso ore</td><td class="n">' + esc(C.euro(t.compenso)) + '</td></tr>' +
        '<tr><td>Rimborso km<div class="sotto-riga">' + esc(C.numero(t.km)) + ' km</div></td><td class="n">' + esc(C.euro(t.rimborso)) + '</td></tr>' +
        '<tr><td>Spese</td><td class="n">' + esc(C.euro(t.spese)) + '</td></tr>' +
        '<tr class="tot"><td>Totale</td><td class="n">' + esc(C.euro(t.totale)) + '</td></tr>' +
        '</tbody></table>';
    }

    if (o.conFoto) {
      const conFoto = righe.filter(r => (r.foto || []).length);
      if (conFoto.length) {
        corpo += '<div class="allegati"><h2>Scontrini</h2><div class="foto">' +
          conFoto.map(r => r.foto.map((f, i) => '<figure>' + immagine(f.id, '') + '<figcaption>' +
            esc(numeroDi(r) + ' · ' + C.data(r.data) + (r.noteSpese ? ' · ' + r.noteSpese : '') + (r.foto.length > 1 ? ' · ' + (i + 1) : '')) +
            '</figcaption></figure>').join('')).join('') +
          '</div></div>';
      }
    }
    return pagina(imp, 'Riepilogo ' + (periodo || ''), corpo);
  }

  // ======================================================================= preventivo e incarico (fase 2)

  const COMPLESSITA = { bassa: 'Bassa', media: 'Media', alta: 'Alta' };
  const QUANDO_PAGARE = { firma: 'alla firma', avanzamento: 'ad avanzamento dei lavori', fine: 'a fine lavori', data: 'alla data' };

  /** Il numero con la revisione: "PR/2026/012 rev. 1". */
  function numeroPreventivo(p) {
    return (p.numero || 'Preventivo') + (Number(p.revisione) > 0 ? ' rev. ' + p.revisione : '');
  }

  /** Le sezioni con le loro voci, in ordine (accetta anche le voci in un elenco solo, con idSezione). */
  function sezioniDi(p) {
    const ordina = l => (l || []).slice().sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0));
    const sezioni = ordina(p.sezioni).map(s => Object.assign({}, s, { voci: ordina(s.voci) }));
    if (Array.isArray(p.voci) && p.voci.length) {
      sezioni.forEach(s => { s.voci = ordina(p.voci.filter(v => String(v.idSezione) === String(s.id))); });
      const sciolte = ordina(p.voci.filter(v => !sezioni.some(s => String(s.id) === String(v.idSezione))));
      if (sciolte.length) sezioni.push({ id: '', titolo: '', voci: sciolte });
    }
    return sezioni;
  }

  function quantitaVoce(v) {
    const q = C.num(v.quantita === undefined || v.quantita === null || v.quantita === '' ? 1 : v.quantita);
    if (v.modo === 'ore') return C.numero(q) + ' h';
    if (v.modo === 'quantita') return C.numero(q) + (v.unita ? ' ' + v.unita : '');
    return 'a corpo';
  }

  /** La tabella di una sezione: le voci che non contano (facoltative non scelte, alternative scartate) in grigio. */
  function tabellaSezione(s, conti, accettato, contaDi, nelPortale) {
    let righe = '';
    s.voci.forEach(v => {
      const conta = contaDi(v);
      const segni = [];
      // Fase 7 (§3.7): accettato nel portale, le voci non scelte dal cliente dicono "non inclusa" (in grigio, come le altre fuori).
      if (nelPortale && !conta && (C.gruppoAlternativa(v) || v.facoltativa === true || v.facoltativa === 1)) segni.push('non inclusa');
      else if (C.gruppoAlternativa(v)) segni.push(conta ? 'scelta' : 'in alternativa');
      else if (v.facoltativa === true || v.facoltativa === 1) segni.push(conta ? 'facoltativa, compresa' : (accettato ? 'facoltativa, non scelta' : 'facoltativa'));
      const sconto = C.num(v.scontoPercentuale);
      const prezzo = v.modo === 'corpo' || !v.modo ? C.euro(v.prezzo) : C.euro(v.prezzo) + (v.modo === 'ore' ? '/h' : (v.unita ? '/' + v.unita : ''));
      righe += '<tr class="' + (conta ? '' : 'fuori') + '"><td class="desc">' + esc(v.descrizione || '') +
        segni.map(x => '<span class="segno">' + esc(x) + '</span>').join('') + '</td>' +
        '<td class="n">' + esc(quantitaVoce(v)) + '</td><td class="n">' + esc(prezzo) + '</td>' +
        '<td class="n">' + (sconto ? esc('−' + C.numero(sconto) + '%') : '') + '</td>' +
        '<td class="n">' + esc(C.euro(C.importoVoce(v))) + '</td></tr>';
    });
    const sub = conti.perSezione[String(s.id === undefined ? '' : s.id)] || 0;
    return (s.titolo ? '<h3 class="sez">' + esc(s.titolo) + '</h3>' : '') +
      '<table class="voci"><thead><tr><th>Prestazione</th><th class="n">Quantità</th><th class="n">Prezzo</th><th class="n">Sconto</th><th class="n">Importo</th></tr></thead>' +
      '<tbody>' + righe + '</tbody><tfoot><tr><td colspan="4">' + esc(s.titolo ? 'Totale ' + s.titolo.toLowerCase() : 'Totale') + '</td><td class="n">' + esc(C.euro(sub)) + '</td></tr></tfoot></table>';
  }

  function tabellaConto(p, k) {
    const righe = [];
    if (k.sconto > 0) {
      righe.push(['Totale delle prestazioni', k.sommaVoci]);
      if (k.scontoDaPercentuale > 0) righe.push(['Sconto ' + C.numero(p.scontoPercentuale) + '%', -k.scontoDaPercentuale]);
      if (k.scontoEuro > 0) righe.push(['Sconto', -k.scontoEuro]);
    }
    righe.push(['Imponibile', k.imponibile]);
    righe.push(['Contributo integrativo EPPI ' + C.numero(p.eppiPercentuale) + '%', k.contributo]);
    righe.push(['IVA ' + C.numero(p.ivaPercentuale) + '% su ' + C.euro(k.baseIva), k.iva]);
    return '<table class="conto"><tbody>' + righe.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(C.euro(r[1])) + '</td></tr>').join('') +
      '<tr class="tot"><td>Totale</td><td class="n">' + esc(C.euro(k.totale)) + '</td></tr></tbody></table>';
  }

  function tabellaScadenze(p, k) {
    const lista = p.scadenzePagamento || [];
    if (!lista.length) return '';
    return '<table><thead><tr><th>Pagamento</th><th>Quando</th><th class="n">Quota</th><th class="n">Importo</th></tr></thead><tbody>' +
      lista.map(s => '<tr><td>' + esc(s.descrizione || '') + '</td><td>' + esc(s.quando === 'data' && s.data ? 'il ' + C.data(s.data) : (QUANDO_PAGARE[s.quando] || '')) + '</td>' +
        '<td class="n">' + esc(s.tipo === 'importo' ? '' : C.numero(s.valore) + '%') + '</td>' +
        '<td class="n">' + esc(C.euro(s.importo !== undefined && s.importo !== null && s.importo !== '' ? s.importo : C.importoScadenza(s, k.imponibile))) + '</td></tr>').join('') +
      '</tbody></table>';
  }

  /** "Polizza Compagnia n. 123, massimale 1.000.000 €" e i titoli: li chiede la legge (L. 124/2017). */
  function polizzaETitoli(imp) {
    const polizza = [imp.POLIZZA_COMPAGNIA, imp.POLIZZA_NUMERO ? 'n. ' + imp.POLIZZA_NUMERO : '',
      imp.POLIZZA_MASSIMALE !== undefined && imp.POLIZZA_MASSIMALE !== null && imp.POLIZZA_MASSIMALE !== '' ? 'massimale ' + (typeof imp.POLIZZA_MASSIMALE === 'number' ? C.euro(imp.POLIZZA_MASSIMALE) : imp.POLIZZA_MASSIMALE) : '']
      .filter(Boolean).join(', ');
    return { polizza, titoli: String(imp.TITOLI || '').trim() };
  }

  function clienteDi(p, ana) {
    return (ana.clienti || ana.soggetti || []).find(c => c.id === p.idCliente) || { nome: p.cliente || '' };
  }

  function righeCliente(c, ana, p) {
    const sede = (ana.sedi || []).find(s => String(s.id) === String(p.idSede !== undefined ? p.idSede : p.sedeId));
    const referente = (ana.referenti || []).find(r => String(r.id) === String(p.idReferente !== undefined ? p.idReferente : p.referenteId));
    const indirizzo = [c.indirizzo, [c.cap, c.citta].filter(Boolean).join(' ') + (c.provincia ? ' (' + c.provincia + ')' : '')].filter(x => String(x || '').trim()).join(', ');
    return [indirizzo, c.partitaIva ? 'P.IVA ' + c.partitaIva : (c.codiceFiscale ? 'C.F. ' + c.codiceFiscale : ''),
      c.pec ? 'PEC ' + c.pec : c.email, sede ? 'Presso: ' + sede.nome + (sede.citta ? ', ' + sede.citta : '') : '',
      referente ? 'Alla cortese attenzione di ' + referente.nome : ''];
  }

  function firmeDocumento(p, imp, etichettaStudio, rigaPortale) {
    const firmaTecnico = idDaUrl(imp.FIRMA_TECNICO);
    const firmaCliente = p.firma && (p.firma.id || idDaUrl(p.firma.url));
    return '<div class="firme">' +
      '<div class="firma"><div class="spazio">' + immagine(firmaTecnico, 'sig') + '</div>' +
      '<div class="chi">' + esc(etichettaStudio) + ' · ' + esc(imp.TECNICO || imp.RAGIONE_SOCIALE || '') + '</div></div>' +
      '<div class="firma"><div class="spazio">' + immagine(firmaCliente, 'sig') + '</div>' +
      '<div class="chi">Per accettazione' + (p.accettatoDa ? ' · ' + esc(p.accettatoDa) : '') +
      (p.accettatoIl ? ' · il ' + esc(C.data(p.accettatoIl)) : ' · data') + '</div>' +
      (rigaPortale ? '<div class="chi">' + esc(rigaPortale) + '</div>' : '') + '</div></div>';
  }

  /**
   * Fase 7 (§3.7): "Accettato nel portale da Roberto Ferretti il 22/10/2026 alle 10:07", solo per un preventivo
   * accettato nel portale (accettazioneModo, o l'oggetto accettazione delle risposte nuove); altrimenti ''.
   */
  function rigaAccettatoNelPortale(p) {
    const a = p.accettazione || {};
    if (p.stato !== 'ACCETTATO' || (p.accettazioneModo || a.modo) !== 'portale') return '';
    const quando = C.dataOra(p.accettatoIl || a.il);
    const giorno = quando.slice(0, 10);
    const ora = quando.length > 10 ? quando.slice(11) : '';
    return 'Accettato nel portale da ' + (p.accettatoDa || a.da || '') + (giorno ? ' il ' + giorno : '') + (ora ? ' alle ' + ora : '');
  }

  /**
   * Il preventivo (docs/gestionale/fase2.md §5): intestazione, cliente, oggetto,
   * complessità, sezioni e voci con gli importi (facoltative e alternative marcate),
   * il conto con il contributo EPPI e l'IVA, le scadenze di pagamento, gli oneri
   * previsti, le condizioni, la validità, polizza e titoli, lo spazio per la firma.
   * Tutto quello che chiede la legge per i professionisti (DL 1/2012 art. 9, L. 124/2017).
   * opzioni: scelte { idVoce: true|false } per mostrare il conto con le scelte del cliente.
   */
  function preventivo(p0, ana, opzioni) {
    const o = opzioni || {};
    const imp = ana.impostazioni || {};
    const sezioni0 = sezioniDi(p0);
    const tutte = C.applicaScelte(sezioni0.reduce((a, s) => a.concat(s.voci.map(v => Object.assign({ idSezione: s.id }, v))), []), o.scelte);
    const sezioni = sezioni0.map(s => Object.assign({}, s, { voci: tutte.filter(v => String(v.idSezione) === String(s.id)) }));
    const p = p0;
    const k = C.contiPreventivo(p, tutte);
    const cliente = clienteDi(p, ana);
    const accettato = p.stato === 'ACCETTATO';
    const validita = p.scadenza ? 'valido fino al ' + C.data(p.scadenza) : '';
    let corpo = intestazione(imp, 'Preventivo', numeroPreventivo(p), ['del ' + C.data(p.data), validita].filter(Boolean).join(' · '));
    corpo += '<div class="parti">' + mittente(imp) + destinatario(cliente.nome || '', righeCliente(cliente, ana, p)) + '</div>';
    corpo += '<div class="barra">Oggetto: ' + esc(p.oggetto || '') + '</div>';
    if (p.introduzione) corpo += '<div class="blocco"><div class="testo">' + esc(p.introduzione) + '</div></div>';
    corpo += '<div class="griglia">' +
      cella('Grado di complessità', COMPLESSITA[p.complessita] || '—') +
      cella('Data', C.data(p.data)) +
      cella('Validità', p.scadenza ? 'fino al ' + C.data(p.scadenza) : '—') +
      cella('Totale', C.euro(k.totale)) +
      '</div>';
    if (p.complessitaNota) corpo += '<div class="blocco"><div class="etichetta">La complessità dell\'incarico</div><div class="testo">' + esc(p.complessitaNota) + '</div></div>';
    const contano = C.vociCheContano(tutte);
    const contaDi = v => contano[tutte.indexOf(v)];
    const nelPortale = rigaAccettatoNelPortale(p);
    sezioni.forEach(s => { if (s.voci.length) corpo += tabellaSezione(s, k, accettato, contaDi, !!nelPortale); });
    corpo += tabellaConto(p, k);
    corpo += '<div class="sotto-riga" style="margin:-6px 0 12px">Importi comprensivi di spese. Contributo integrativo e IVA come indicati; le voci facoltative non scelte e le alternative scartate non sono nel totale.</div>';
    if ((p.scadenzePagamento || []).length) corpo += '<h3 class="sez">Pagamenti</h3>' + tabellaScadenze(p, k);
    const pt = polizzaETitoli(imp);
    corpo += '<div class="due-blocchi">' +
      '<div class="blocco"><div class="etichetta">Oneri ipotizzabili dal conferimento alla conclusione</div><div class="testo">' + esc(p.oneriPrevisti || 'Nessun onere oltre a quelli indicati.') + '</div></div>' +
      '<div class="blocco"><div class="etichetta">Polizza professionale e titoli</div><div class="testo">' + esc(
        (pt.polizza ? 'Polizza: ' + pt.polizza : 'Polizza: —') + '\n' + (pt.titoli || 'Titoli: —')) + '</div></div></div>';
    if (p.condizioni) corpo += '<div class="blocco"><div class="etichetta">Condizioni</div><div class="testo">' + esc(p.condizioni) + '</div></div>';
    if (p.scadenza) corpo += '<div class="blocco"><div class="etichetta">Validità dell\'offerta</div><div class="testo">' + esc('Questa offerta vale fino al ' + C.data(p.scadenza) + '. Dopo l\'accettazione i prezzi non cambiano.') + '</div></div>';
    corpo += firmeDocumento(p, imp, 'Per lo studio', nelPortale);
    return pagina(imp, 'Preventivo ' + numeroPreventivo(p), corpo);
  }

  /**
   * L'incarico professionale, dal preventivo accettato: le parti, l'oggetto, le
   * prestazioni scelte con i loro importi, il compenso, i pagamenti, gli oneri, le
   * condizioni, la polizza e i titoli, e le firme.
   */
  function incarico(p, ana, opzioni) {
    const imp = ana.impostazioni || {};
    const sezioni = sezioniDi(p);
    const voci = sezioni.reduce((a, s) => a.concat(s.voci.map(v => Object.assign({ idSezione: s.id }, v))), []);
    const k = C.contiPreventivo(p, voci);
    const contano = C.vociCheContano(voci);
    const contate = voci.filter((v, i) => contano[i]);
    const cliente = clienteDi(p, ana);
    const pt = polizzaETitoli(imp);
    const MODI = { firma: 'firmato dal cliente', email: 'accettato per email', documento: 'con il documento firmato', voce: 'accettato a voce' };
    let corpo = intestazione(imp, 'Incarico professionale', numeroPreventivo(p),
      ['dal preventivo del ' + C.data(p.data), p.accettatoIl ? 'accettato il ' + C.data(p.accettatoIl) : ''].filter(Boolean).join(' · '));
    corpo += '<div class="parti">' +
      '<div class="parte"><div class="etichetta">Il professionista</div><div class="nome">' + esc(imp.RAGIONE_SOCIALE || '') + '</div>' +
      [imp.TECNICO, imp.INDIRIZZO, imp.PARTITA_IVA ? 'P.IVA ' + imp.PARTITA_IVA : '', imp.PEC ? 'PEC ' + imp.PEC : imp.EMAIL].filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div>' +
      '<div class="parte"><div class="etichetta">Il committente</div><div class="nome">' + esc(cliente.nome || '') + '</div>' +
      righeCliente(cliente, ana, p).filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div></div>';
    let n = 0;
    const articolo = (titolo, html) => '<div class="articolo"><h3>' + (++n) + '. ' + esc(titolo) + '</h3>' + html + '</div>';
    corpo += articolo('Oggetto dell\'incarico', '<div class="testo">' + esc(p.oggetto || '') + (p.introduzione ? '\n' + p.introduzione : '') + '</div>' +
      '<div class="sotto-riga">Grado di complessità: ' + esc((COMPLESSITA[p.complessita] || '—').toLowerCase()) + (p.complessitaNota ? ' · ' + esc(p.complessitaNota) : '') + '</div>');
    corpo += articolo('Prestazioni', '<table class="voci"><thead><tr><th>Prestazione</th><th class="n">Quantità</th><th class="n">Importo</th></tr></thead><tbody>' +
      contate.map(v => '<tr><td class="desc">' + esc(v.descrizione || '') + '</td><td class="n">' + esc(quantitaVoce(v)) + '</td><td class="n">' + esc(C.euro(C.importoVoce(v))) + '</td></tr>').join('') +
      '</tbody></table>');
    corpo += articolo('Compenso', tabellaConto(p, k));
    if ((p.scadenzePagamento || []).length) corpo += articolo('Pagamenti', tabellaScadenze(p, k));
    corpo += articolo('Oneri ipotizzabili', '<div class="testo">' + esc(p.oneriPrevisti || 'Nessun onere oltre a quelli indicati.') + '</div>');
    if (p.condizioni) corpo += articolo('Condizioni', '<div class="testo">' + esc(p.condizioni) + '</div>');
    corpo += articolo('Polizza professionale e titoli', '<div class="testo">' + esc((pt.polizza ? 'Polizza: ' + pt.polizza : 'Polizza: —') + '\n' + (pt.titoli || 'Titoli: —')) + '</div>');
    corpo += '<div class="sotto-riga">L\'incarico riprende il preventivo ' + esc(numeroPreventivo(p)) +
      (p.accettazioneModo ? ', ' + esc(MODI[p.accettazioneModo] || '') : '') + (p.accettatoDa ? ' da ' + esc(p.accettatoDa) : '') + '.</div>';
    corpo += firmeDocumento(p, imp, 'Il professionista');
    return pagina(imp, 'Incarico ' + numeroPreventivo(p), corpo);
  }

  // ======================================================================= fase 4: il prospetto e l'avviso di parcella

  /*
   * Il prospetto per il programma delle fatture (fase4.md §8.3, architettura.md §15.6):
   * tutti i campi della fattura, sezione per sezione, nell'ordine in cui un programma li
   * chiede. Nasce dal MODELLO del server (pacchetto.modello), lo stesso per telefono e
   * computer. Le sezioni sono quelle di server/src/passaggio/prospetto.js, riga per riga
   * (la prova fatture.test.js le confronta): niente numeri ricalcolati qui.
   */
  const AVVISO_REGOLE = 'Conti da verificare: regole non confermate dal commercialista';
  const TIPI_DOCUMENTO = { TD01: 'Fattura', TD06: 'Parcella', TD04: 'Nota di credito', TD05: 'Nota di debito', TD02: 'Acconto su fattura', TD03: 'Acconto su parcella' };
  const MODALITA_PAGAMENTO = { MP01: 'Contanti', MP02: 'Assegno', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP12: 'RIBA', MP19: 'SEPA Direct Debit', MP23: 'PagoPA' };
  const CASSE = { TC17: 'EPPI', TC04: 'Inarcassa' };
  const numIt = v => { const n = typeof v === 'number' ? v : Number(v); return isNaN(n) ? 0 : n; };
  const numeroIt = (n, minimo, massimo) => numIt(n).toLocaleString('it-IT', {
    minimumFractionDigits: minimo === undefined ? 0 : minimo, maximumFractionDigits: massimo === undefined ? 2 : massimo, useGrouping: true,
  });
  const euroIt = n => numeroIt(n, 2, 2);
  const dataIt = iso => (iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '');
  const percentoIt = n => numeroIt(n, 0, 2) + '%';
  const ivaRiga = r => (r.natura === 'N1' ? 'Senza IVA (N1, art. 15)' : r.natura ? 'Senza IVA (' + r.natura + ')' : percentoIt(r.aliquotaIva));

  /** Le sezioni del prospetto: [{titolo, campi: [{etichetta, valore}]}], come il server. */
  function sezioniProspetto(m) {
    const c = m.committente || {};
    const sede = c.sede || {};
    const sezioni = [];
    const sezione = (titolo, campi) => sezioni.push({ titolo, campi: campi.filter(x => x && x.valore !== undefined && x.valore !== null && x.valore !== '') });
    const campo = (etichetta, valore) => ({ etichetta, valore: valore === undefined || valore === null ? '' : String(valore) });
    sezione('Cliente', [
      c.denominazione ? campo('Denominazione', c.denominazione) : campo('Nome', c.nome),
      c.denominazione ? null : campo('Cognome', c.cognome),
      campo('Partita IVA', c.partitaIva), campo('Codice fiscale', c.codiceFiscale), campo('Indirizzo', sede.indirizzo), campo('CAP', sede.cap),
      campo('Comune', sede.comune), campo('Provincia', sede.provincia), campo('Codice destinatario', c.codiceDestinatario), campo('PEC', c.pec),
    ]);
    const collegata = (m.fattureCollegate || [])[0];
    sezione('Documento', [
      campo('Tipo', (TIPI_DOCUMENTO[m.tipoDocumento] || 'Documento') + ' (' + m.tipoDocumento + ')'),
      campo(m.numero ? 'Data' : 'Data proposta', dataIt(m.data || m.dataProposta)),
      campo('Numero', m.numero || 'lo dà il programma'),
      collegata ? campo('Fattura collegata', collegata.idDocumento + (collegata.data ? ' del ' + dataIt(collegata.data) : '')) : null,
      campo('Causale', (m.causale || []).join(' ')),
    ]);
    const righe = [];
    (m.righe || []).forEach(r => {
      const n = 'Riga ' + r.numero + ' · ';
      righe.push(campo(n + 'Descrizione', r.descrizione));
      righe.push(campo(n + 'Quantità', r.quantita === null || r.quantita === undefined ? '' : numeroIt(r.quantita, 0, 8)));
      if (r.unitaMisura) righe.push(campo(n + 'Unità di misura', r.unitaMisura));
      righe.push(campo(n + 'Prezzo', euroIt(r.prezzoUnitario)));
      righe.push(campo(n + 'Totale', euroIt(r.prezzoTotale)));
      righe.push(campo(n + 'IVA', ivaRiga(r)));
      righe.push(campo(n + 'Ritenuta', r.ritenuta ? 'sì' : 'no'));
    });
    sezione('Righe', righe);
    if (m.cassa) {
      sezione('Cassa previdenziale', [
        campo('Cassa', (CASSE[m.cassa.tipo] || 'Cassa') + ' (' + m.cassa.tipo + ')'), campo('Aliquota', percentoIt(m.cassa.aliquota)),
        campo('Imponibile', euroIt(m.cassa.imponibile)), campo('Importo', euroIt(m.cassa.importo)),
        campo('IVA', m.cassa.natura ? 'Senza IVA (' + m.cassa.natura + ')' : percentoIt(m.cassa.aliquotaIva)),
      ]);
    }
    sezione('Ritenuta', m.ritenuta ? [
      campo('Tipo', m.ritenuta.tipo), campo('Aliquota', percentoIt(m.ritenuta.aliquota)), campo('Causale', m.ritenuta.causale), campo('Importo', euroIt(m.ritenuta.importo)),
    ] : [campo('Ritenuta', c.partitaIva ? 'no' : 'no, è un privato')]);
    sezione('Bollo', m.bollo ? [
      campo('Bollo', m.bollo.virtuale ? 'virtuale' : 'sì'), campo('Importo', euroIt(m.bollo.importo)),
      campo('Riaddebitato al cliente', (m.righe || []).some(r => /bollo/i.test(r.descrizione) && r.natura === 'N1') ? 'sì' : 'no'),
    ] : [campo('Bollo', 'no')]);
    sezione('Riepilogo IVA', (m.riepilogo || []).map(r => campo(
      r.natura ? 'Senza IVA (' + r.natura + (r.natura === 'N1' ? ', art. 15' : '') + ')' : 'IVA ' + percentoIt(r.aliquotaIva),
      r.natura ? euroIt(r.imponibile) + (r.riferimentoNormativo ? ' · ' + r.riferimentoNormativo : '') : 'imponibile ' + euroIt(r.imponibile) + ' · imposta ' + euroIt(r.imposta))));
    sezione('Totali', [
      campo(m.tipoDocumento === 'TD04' ? 'Totale della nota' : 'Totale della fattura', euroIt(m.totaleDocumento)),
      campo(m.tipoDocumento === 'TD04' ? 'Netto stornato' : 'Netto da incassare', euroIt(m.nettoAPagare)),
    ]);
    const pagamenti = [];
    ((m.pagamento && m.pagamento.dettagli) || []).forEach((p, i, tutti) => {
      const n = tutti.length > 1 ? 'Rata ' + (i + 1) + ' · ' : '';
      pagamenti.push(campo(n + 'Modalità', (MODALITA_PAGAMENTO[p.modalita] || 'Pagamento') + ' (' + p.modalita + ')'));
      pagamenti.push(campo(n + 'Scadenza', dataIt(p.scadenza)));
      pagamenti.push(campo(n + 'Importo', euroIt(p.importo)));
      pagamenti.push(campo(n + 'IBAN', p.iban));
      pagamenti.push(campo(n + 'Banca', p.istituto));
    });
    sezione('Pagamento', pagamenti);
    return sezioni;
  }

  /** "Preparato da Wisper il 22/10/2026 · regole fiscali ..." (il piede di ogni pagina). */
  function piedeProspetto(m, o) {
    const oggi = o.oggi || new Date().toISOString().slice(0, 10);
    return 'Preparato da Wisper il ' + dataIt(oggi) + (m.regoleConfermate
      ? ' · regole fiscali confermate dal commercialista' + (o.confermateIl ? ' il ' + dataIt(o.confermateIl) : '')
      : ' · regole fiscali NON ancora confermate dal commercialista: conti da verificare');
  }

  const STILE_PROSPETTO = '<style>' +
    '.sez-p { margin: 0 0 10px; break-inside: auto; } .sez-p h3 { font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #5F5F67; margin: 0 0 3px; padding-bottom: 3px; border-bottom: 1.5px solid #1B1B1F; }' +
    '.sez-p table { margin: 0; } .sez-p td { padding: 4px 4px; } .sez-p td.k { width: 34%; color: #3F3F46; font-weight: 600; } .sez-p td.v { font-weight: 700; }' +
    '.avviso-p { border: 1.5px solid #1B1B1F; border-radius: 8px; padding: 7px 11px; font-weight: 800; margin-bottom: 12px; }' +
    '</style>';

  /**
   * Il PDF del prospetto. opzioni: oggi (aaaa-mm-gg), confermateIl (data della conferma
   * delle regole). L'intestazione dice che non è una fattura.
   */
  function prospettoFattura(modello, opzioni) {
    const m = modello || {};
    const o = opzioni || {};
    const studio = (m.prestatore && m.prestatore.denominazione) || '';
    const sezioni = sezioniProspetto(m);
    const nota = m.tipoDocumento === 'TD04';
    let corpo = '<div class="testa">' + (o.logo ? aziendaInTesta(studio, o.logo, o.conNome) : '<div class="azienda">' + esc(studio) + '</div>') + '<div class="tipo"><div class="etichetta">Prospetto per il programma delle fatture · non è una fattura</div>' +
      '<div class="numero">Rif. ' + esc(m.riferimento || '') + '</div><div class="sotto">' + esc((nota ? 'Nota di credito' : TIPI_DOCUMENTO[m.tipoDocumento] || 'Fattura') + ' · ' + (m.numero ? m.numero + ' del ' + dataIt(m.data) : 'data proposta ' + dataIt(m.dataProposta))) + '</div></div></div>';
    if (!m.regoleConfermate) corpo += '<div class="avviso-p">' + esc(AVVISO_REGOLE) + '</div>';
    sezioni.forEach(s => {
      if (!s.campi.length) return;
      corpo += '<div class="sez-p"><h3>' + esc(s.titolo) + '</h3><table><tbody>' +
        s.campi.map(x => '<tr><td class="k">' + esc(x.etichetta) + '</td><td class="v">' + esc(x.valore) + '</td></tr>').join('') + '</tbody></table></div>';
    });
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + esc('Prospetto ' + (m.riferimento || '')) + '</title>' +
      stile(o.logo ? { RAGIONE_SOCIALE: piedeProspetto(m, o), STUDIO_LOGO: o.logo } : { RAGIONE_SOCIALE: piedeProspetto(m, o) }) + STILE_PROSPETTO + '</head><body>' + corpo + '</body></html>';
  }

  /**
   * L'avviso di parcella (fase4.md §8.3): cliente, righe, totali, netto, IBAN; non è una
   * fattura ("Documento senza valore fiscale: la fattura si emette al pagamento").
   */
  function avvisoParcella(modello, opzioni) {
    const m = modello || {};
    const p = m.prestatore || {};
    const c = m.committente || {};
    const sp = p.sede || {};
    const sc = c.sede || {};
    const piede = 'Documento senza valore fiscale: la fattura si emette al pagamento';
    const indirizzo = s => [s.indirizzo, [s.cap, s.comune, s.provincia ? '(' + s.provincia + ')' : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const o = opzioni || {};
    let corpo = '<div class="testa">' + (o.logo ? aziendaInTesta(p.denominazione, o.logo, o.conNome) : '<div class="azienda">' + esc(p.denominazione || '') + '</div>') + '<div class="tipo"><div class="etichetta">Avviso di parcella</div>' +
      '<div class="numero">Rif. ' + esc(m.riferimento || '') + '</div><div class="sotto">' + esc('del ' + dataIt(m.dataProposta || m.data)) + '</div></div></div>';
    corpo += '<div class="parti"><div class="parte"><div class="etichetta">Da</div><div class="nome">' + esc(p.denominazione || '') + '</div>' +
      // 06/11/2026: le commesse della fattura nella parte di chi manda, solo se il modello le porta (m.commesse, codici).
      [indirizzo(sp), p.partitaIva ? 'P.IVA ' + p.partitaIva : '', p.pec ? 'PEC ' + p.pec : p.email, rigaCommesse(m.commesse)].filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div>' +
      '<div class="parte"><div class="etichetta">Spett.le</div><div class="nome">' + esc(c.denominazione || [c.nome, c.cognome].filter(Boolean).join(' ')) + '</div>' +
      [indirizzo(sc), c.partitaIva ? 'P.IVA ' + c.partitaIva : c.codiceFiscale ? 'C.F. ' + c.codiceFiscale : ''].filter(Boolean).map(r => '<div>' + esc(r) + '</div>').join('') + '</div></div>';
    corpo += '<table class="voci"><thead><tr><th>Descrizione</th><th class="n">Quantità</th><th class="n">Prezzo</th><th class="n">Importo</th></tr></thead><tbody>' +
      (m.righe || []).map(r => '<tr><td class="desc">' + esc(r.descrizione) + (r.natura ? '<div class="sotto-riga">' + esc(ivaRiga(r)) + '</div>' : '') + '</td><td class="n">' + esc(numeroIt(r.quantita === null || r.quantita === undefined ? 1 : r.quantita, 0, 8) + (r.unitaMisura ? ' ' + r.unitaMisura : '')) +
        '</td><td class="n">' + esc(euroIt(r.prezzoUnitario)) + ' €</td><td class="n">' + esc(euroIt(r.prezzoTotale)) + ' €</td></tr>').join('') + '</tbody></table>';
    const riga = (k, v, classe) => '<tr' + (classe ? ' class="' + classe + '"' : '') + '><td>' + esc(k) + '</td><td class="n">' + esc(v) + '</td></tr>';
    let conto = '';
    if (m.cassa) conto += riga('Contributo integrativo ' + (CASSE[m.cassa.tipo] || '') + ' ' + percentoIt(m.cassa.aliquota), euroIt(m.cassa.importo) + ' €');
    (m.riepilogo || []).forEach(r => { if (!r.natura) conto += riga('IVA ' + percentoIt(r.aliquotaIva), euroIt(r.imposta) + ' €'); });
    conto += riga('Totale', euroIt(m.totaleDocumento) + ' €', 'tot');
    if (m.ritenuta) conto += riga('Ritenuta ' + percentoIt(m.ritenuta.aliquota) + ' (la trattiene il cliente)', '− ' + euroIt(m.ritenuta.importo) + ' €');
    conto += riga('Netto da pagare', euroIt(m.nettoAPagare) + ' €', 'tot');
    corpo += '<table class="conto"><tbody>' + conto + '</tbody></table>';
    const pag = ((m.pagamento && m.pagamento.dettagli) || [])[0];
    if (pag) {
      corpo += '<div class="blocco"><div class="etichetta">Pagamento</div><div class="testo">' + esc([
        (MODALITA_PAGAMENTO[pag.modalita] || 'Pagamento') + (pag.scadenza ? ' entro il ' + dataIt(pag.scadenza) : ''),
        pag.iban ? 'IBAN ' + pag.iban : '', pag.istituto || ''].filter(Boolean).join('\n')) + '</div></div>';
    }
    corpo += '<div class="blocco"><div class="testo">' + esc(piede) + '</div></div>';
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + esc('Avviso di parcella ' + (m.riferimento || '')) + '</title>' +
      stile(o.logo ? { RAGIONE_SOCIALE: piede, PARTITA_IVA: '', STUDIO_LOGO: o.logo } : { RAGIONE_SOCIALE: piede, PARTITA_IVA: '' }) + '</head><body>' + corpo + '</body></html>';
  }

  /**
   * Fase 5 (fase5.md §5.7): la lettera, impaginata qui come gli altri documenti (uguale su telefono e computer).
   * x: { titolo, testo, cliente (nome, oppure { nome, righe }), impianto? }. Il testo è quello del modello coi
   * segnaposti già riempiti dal server (componiModello) e corretto dalla persona: si stampa com'è.
   */
  /** "1 ora", "4 ore", "1,5 ore". */
  const ore = n => C.numero(n) + (Number(n) === 1 ? ' ora' : ' ore');

  function lettera(x, imp0) {
    const imp = imp0 || {};
    const o = x || {};
    const cliente = typeof o.cliente === 'string' ? { nome: o.cliente, righe: [] } : (o.cliente || { nome: '', righe: [] });
    const oggi = C.data(C.oggiIso());
    let corpo = intestazione(imp, 'Lettera', '', [imp.INDIRIZZO ? String(imp.INDIRIZZO).split(',').pop().trim() : '', oggi].filter(Boolean).join(', '));
    corpo += '<div class="parti">' + mittente(imp) + destinatario(cliente.nome || '', (cliente.righe || []).filter(Boolean)) + '</div>';
    corpo += '<div class="barra">Oggetto: ' + esc(o.titolo || '') + (o.impianto ? ' · ' + esc(o.impianto) : '') + '</div>';
    corpo += '<div class="lettera-testo">' + esc(o.testo || '') + '</div>';
    corpo += '<div class="firme"><div class="firma"></div><div class="firma"><div class="spazio">' + immagine(idDaUrl(imp.FIRMA_TECNICO), 'sig') + '</div>' +
      '<div class="chi">' + esc(imp.TECNICO || imp.RAGIONE_SOCIALE || '') + '</div></div></div>';
    return pagina(imp, o.titolo || 'Lettera', corpo).replace('</style>', '.lettera-testo { white-space: pre-wrap; font-size: 11.5px; line-height: 1.6; margin: 18px 2px 8px; }</style>');
  }

  /**
   * Fase 5: il contratto di assistenza (dal contratto del server, contratto {id}), con le condizioni
   * (il testo CONTRATTO_CONDIZIONI riempito) e le firme. Il canone si stampa solo se c'è nei dati
   * (chi non vede i soldi non lo riceve dal server).
   */
  function contrattoAssistenza(k0, imp0) {
    const imp = imp0 || {};
    const k = k0 || {};
    const rate = { annuale: ', una rata all\'anno', semestrale: ', rate semestrali', trimestrale: ', rate trimestrali', mensile: ', rate mensili' };
    let corpo = intestazione(imp, 'Contratto di assistenza', k.numero || '', 'dal ' + C.data(k.dal) + ' al ' + C.data(k.al));
    corpo += '<div class="parti">' + mittente(imp) + destinatario(k.cliente || '', []) + '</div>';
    corpo += '<div class="barra">Oggetto: ' + esc(k.titolo || '') + '</div>';
    corpo += '<div class="griglia">' +
      cella('Periodo', 'dal ' + C.data(k.dal) + ' al ' + C.data(k.al)) +
      cella('Rinnovo', k.rinnovo === 'tacito' ? 'Tacito, disdetta ' + (k.disdettaGiorni || 0) + ' giorni prima' : 'Senza rinnovo') +
      cella('Copre', (k.copre === 'visite_guasti' ? 'Visite e guasti' : 'Visite programmate') + (k.materialiInclusi ? ', materiali compresi' : ', materiali esclusi')) +
      cella('Canone', k.canone !== undefined && k.canone !== null ? C.euro(k.canone) + ' all\'anno' + (rate[k.fatturazioneCanone] || '') : '—') +
      '</div>';
    const impianti = k.impianti || [];
    if (impianti.length) {
      corpo += '<h3 class="sez">Impianti e visite</h3><table><thead><tr><th>Impianto</th><th>Visite</th><th>Prima visita</th></tr></thead><tbody>' +
        impianti.map(i => '<tr><td>' + esc(i.nome || '') + '</td><td>' + esc(i.ogniMesi ? 'ogni ' + i.ogniMesi + ' mesi' : 'nessuna programmata') + '</td><td>' +
          esc(i.primaVisita ? C.data(i.primaVisita) : (i.prossimaVisita ? C.data(i.prossimaVisita) : '—')) + '</td></tr>').join('') + '</tbody></table>';
    }
    if (k.tariffaExtra !== undefined && k.tariffaExtra !== null) corpo += '<div class="blocco"><div class="etichetta">Lavoro fuori contratto</div><div class="testo">' + esc(C.euro(k.tariffaExtra) + ' all\'ora') + '</div></div>';
    if (k.tempi) {
      const nomi = { urgente: 'Urgente', alta: 'Alta', normale: 'Normale', bassa: 'Bassa' };
      corpo += '<div class="blocco"><div class="etichetta">Tempi d\'intervento</div><div class="testo">' + esc(Object.keys(k.tempi).map(p => nomi[p] + ': presa in carico entro ' +
        ore(k.tempi[p].presa) + ', intervento entro ' + ore(k.tempi[p].intervento)).join('\n')) + '</div></div>';
    }
    if (k.condizioni) corpo += '<div class="blocco"><div class="etichetta">Condizioni</div><div class="testo">' + esc(k.condizioni) + '</div></div>';
    corpo += firmeDocumento({}, imp, 'Per lo studio');
    return pagina(imp, 'Contratto di assistenza ' + (k.numero || ''), corpo);
  }

  const Documenti = { rapportino, rigaStrumenti, riepilogo, preventivo, incarico, numeroPreventivo, esc, idDaUrl, sezioniProspetto, prospettoFattura, avvisoParcella, lettera, contrattoAssistenza, logoDi, nomeAccantoAlLogo, rigaCommesse };
  if (typeof module !== 'undefined' && module.exports) module.exports = Documenti;
  else radice.WisperDocumenti = Documenti;
})(typeof window !== 'undefined' ? window : globalThis);
