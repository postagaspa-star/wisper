/*
 * Wisper Ufficio: la ricerca nelle impostazioni (riunione del 06/11/2026).
 *
 * In cima all'elenco di Amministrazione c'è "Cerca nelle impostazioni": trova le pagine (titolo, gruppo, riga sotto) e le
 * singole impostazioni (Dati dello studio, Impostazioni generali, fiscali, numerazioni, notifiche, sicurezza, portale,
 * comunicazioni, tariffe e rimborsi, veicoli, persone, mezzi e collaboratori, funzioni), senza badare a maiuscole e
 * accenti. Qui ci sono solo l'indice e il confronto, così si provano senza interfaccia (pc/prove/ricerca-impostazioni.test.js).
 * Ogni impostazione dice in che pagina sta e come ritrovarla lì: l'attributo (data-chiave, data-tipo, data-modulo) e il valore.
 */
(function (radice) {
  'use strict';

  /** Il testo da confrontare: minuscolo, senza accenti, gli apostrofi come spazi ("all'albo" -> "all albo"). */
  function piano(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[’'`´]/g, ' ').replace(/[^a-z0-9@.,:/%€ -]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const parole = testo => piano(testo).split(' ').filter(Boolean);

  /**
   * Le impostazioni delle pagine fatte a mano (le Impostazioni generali, le numerazioni e le funzioni arrivano dal server).
   * [chiave, etichetta, unità] per pagina; la chiave è il data-chiave del campo nella pagina.
   */
  const VOCI_PAGINE = {
    studio: [['RAGIONE_SOCIALE', 'Ragione sociale'], ['STUDIO_NOME_BREVE', 'Nome breve'], ['STUDIO_QUALIFICA', 'Qualifica'], ['TECNICO', 'Chi compila i rapportini'], ['PARTITA_IVA', 'Partita IVA'],
      ['CODICE_FISCALE', 'Codice fiscale'], ['INDIRIZZO', 'Indirizzo'], ['STUDIO_CAP', 'CAP'], ['STUDIO_COMUNE', 'Comune'], ['STUDIO_PROVINCIA', 'Provincia'],
      ['STUDIO_SDI', 'Codice SDI'], ['EMAIL', 'Email per le risposte'], ['TELEFONO', 'Telefono'], ['PEC', 'PEC'], ['STUDIO_SITO', 'Sito'],
      ['PDF_PIEDE', 'Riga in fondo ai PDF'], ['ALBO', 'Albo'], ['ALBO_PROVINCIA', 'Provincia dell\'albo'], ['ALBO_NUMERO', 'Numero di iscrizione all\'albo'],
      ['ALBO_DATA', 'Iscritto all\'albo dal'], ['POLIZZA_COMPAGNIA', 'Compagnia della polizza professionale'], ['POLIZZA_NUMERO', 'Numero della polizza'],
      ['POLIZZA_MASSIMALE', 'Massimale della polizza'], ['TITOLI', 'Titoli e specializzazioni'], ['STUDIO_LOGO', 'Logo dello studio'], ['PDF_LOGO', 'Logo sui PDF'],
      ['PDF_NOME', 'Nome dello studio accanto al logo'], ['FIRMA_TECNICO', 'La tua firma']],
    fiscale: [['IVA', 'IVA', '%'], ['EPPI_INTEGRATIVO', 'Contributo integrativo EPPI', '%'], ['RITENUTA', 'Ritenuta', '%'], ['RITENUTA_TIPO', 'Codice della ritenuta'],
      ['RITENUTA_CAUSALE', 'Causale della ritenuta'], ['EPPI_TIPO_CASSA', 'Cassa nella fattura'], ['SOGLIA_CASSA', 'Soglia del saldo', '€'],
      ['BOLLO_SOGLIA', 'Il bollo scatta sopra', '€'], ['BOLLO_IMPORTO', 'Importo del bollo', '€'], ['BOLLO_RIVALSA', 'Il bollo lo riaddebito al cliente'],
      ['TIPO_DOCUMENTO', 'Tipo di documento: fattura o parcella'], ['REGIME_FISCALE', 'Regime fiscale'], ['GIORNI_PAGAMENTO', 'Giorni di pagamento', 'giorni'],
      ['PAGAMENTO_FINE_MESE', 'Pagamento a fine mese'], ['MODALITA_PAGAMENTO', 'Modo di pagamento']],
    tariffe: [['EURO_KM', 'Rimborso km (tabella ACI)', '€/km'], ['AUTO', 'Auto'], ['COSTO_ORARIO', 'Quanto costa un\'ora', '€/h'], ['TICKET_ATTIVO', 'Campo ticket nei rapportini']],
    fisco: [['PREVENTIVO_VALIDITA_GIORNI', 'Validità di un preventivo', 'giorni'], ['PREVENTIVO_CONDIZIONI', 'Condizioni che si propongono nei preventivi']],
    veicoli: [['ACI_ANNO', 'Anno delle tabelle ACI'], ['INDENNITA_TRASFERTA', 'Indennità di trasferta al giorno', '€']],
    persone: [['FESTA_PATRONO', 'Santo patrono'], ['PERSONE_CONSERVA_ANNI', 'Conservazione dopo l\'uscita', 'anni'], ['SALDO_AVVISO_GIORNI', 'Saldo da aggiornare dopo', 'giorni'],
      ['TARATURA_OGNI_MESI', 'Taratura ogni, per gli strumenti nuovi', 'mesi'], ['TARATURA_PREAVVISO_GIORNI', 'Preavviso della taratura', 'giorni'],
      ['TARATURA_BLOCCO', 'Con la taratura scaduta'], ['DURC_GIORNI', 'Un DURC vale', 'giorni'], ['VISURA_MESI', 'La visura al massimo di', 'mesi'],
      ['ACCESSO_ESTERNI_GIORNI', 'Accesso degli esterni senza incarichi', 'giorni'], ['COLLAB_DOCUMENTI', 'I documenti che servono per l\'idoneità'],
      ['KM_TAGLIANDO_AVVISO', 'Avviso del tagliando a km', 'km prima']],
    portale: [['PORTALE_INDIRIZZO', 'Indirizzo del portale'], ['PORTALE_ATTIVO', 'Portale acceso'], ['PORTALE_LINK_MINUTI', 'Link e codice valgono', 'minuti'],
      ['PORTALE_LINK_AVVISO_ORE', 'Link negli avvisi', 'ore'], ['PORTALE_SESSIONE_MINUTI', 'Sessione senza uso', 'minuti'], ['PORTALE_SESSIONE_ORE', 'Sessione al massimo', 'ore'],
      ['PORTALE_FILE_MAX_MB', 'File dal cliente al massimo', 'MB'], ['PORTALE_EMAIL_RISERVA', 'Email lasciate allo studio', 'al giorno'],
      ['PORTALE_TIPI_FILE', 'Tipi di file dal cliente'], ['PORTALE_INFORMATIVA', 'Informativa per i clienti']],
    comunicazioni: [['WHATSAPP_APP', 'WhatsApp sul telefono'], ['PROMEMORIA_GIORNI_PRIMA', 'Promemoria degli appuntamenti', 'giorni lavorativi prima'],
      ['SOLLECITO_DOPO_GIORNI', 'Promemoria di pagamento dopo', 'giorni'], ['SOLLECITO_SECONDO_GIORNI', 'Il secondo promemoria di pagamento dopo', 'giorni']],
    sicurezza: [['SESSIONE_GIORNI', 'Durata degli accessi: un dispositivo esce da solo dopo', 'giorni senza uso']],
    notifiche: [['EMAIL_AVVISI', 'Avvisi del server a'], ['NOTIFICHE_ORA', 'Ora del riepilogo del mattino']],
  };

  /**
   * L'indice di quello che si vede. o: {
   *   pagine: [{ k, titolo, gruppo, sotto, icona }]   le pagine che la persona può aprire (k: "studio", o "#integrazioni"),
   *   gruppi: [{ nome, voci: [{ chiave, etichetta, unita }] }]   le Impostazioni generali dal server (se lette),
   *   numerazioni: [{ tipo, nome }], funzioni: [{ modulo, nome }] }.
   * Una chiave che sta in più pagine si tiene una volta sola: nella pagina fatta per lei (prima), se no nelle generali.
   * Torna { pagine, voci }: ogni voce { pagina, titoloPagina, gruppo, etichetta, attributo, valore, cerca, nome }.
   */
  function costruisciIndice(o) {
    const x = o || {};
    const pagine = (x.pagine || []).filter(p => p && p.k).map(p => Object.assign({}, p, { cerca: piano([p.titolo, p.gruppo, p.sotto].filter(Boolean).join(' ')) }));
    const titoli = {};
    pagine.forEach(p => { titoli[p.k] = p.titolo; });
    const voci = [];
    const viste = new Set();
    const metti = (pagina, attributo, valore, etichetta, unita, gruppo) => {
      if (!titoli[pagina] || !etichetta) return;
      const id = attributo + '=' + valore;
      if (attributo === 'data-chiave' && viste.has(id)) return;
      viste.add(id);
      voci.push({ pagina, titoloPagina: titoli[pagina], gruppo: gruppo || '', etichetta, unita: unita || '', attributo, valore: String(valore),
        nome: piano(etichetta), cerca: piano([etichetta, unita, titoli[pagina], gruppo].filter(Boolean).join(' ')) });
    };
    Object.keys(VOCI_PAGINE).forEach(k => VOCI_PAGINE[k].forEach(([chiave, etichetta, unita]) => metti(k, 'data-chiave', chiave, etichetta, unita)));
    (x.numerazioni || []).forEach(n => metti('numerazioni', 'data-tipo', n.tipo, 'Numerazione: ' + (n.nome || n.tipo)));
    (x.funzioni || []).forEach(f => metti('funzioni', 'data-modulo', f.modulo, f.nome));
    (x.gruppi || []).forEach(g => (g.voci || []).forEach(v => metti('impostazioni', 'data-chiave', v.chiave, v.etichetta, v.unita, g.nome)));
    return { pagine, voci };
  }

  /**
   * Cerca nell'indice: tutte le parole scritte devono esserci come inizio di una parola (in qualunque ordine, anche a metà:
   * "rimb" trova "Rimborso", "logo" non trova "riepilogo");
   * per un'impostazione almeno una parola deve stare nel suo nome (così "studio" non tira fuori ogni campo di Dati dello
   * studio). Prima chi comincia con la prima parola. null se il testo è vuoto (si vede l'elenco di sempre).
   */
  function cerca(indice, testo, massimo) {
    const p = parole(testo);
    if (!p.length) return null;
    const haParola = (s, w) => (' ' + s).indexOf(' ' + w) >= 0;
    const ci = s => p.every(w => haParola(s, w));
    const posto = nome => (nome.indexOf(p[0]) === 0 ? 0 : haParola(nome, p[0]) ? 1 : 2);
    const ordina = (lista, nomeDi) => lista.map((v, i) => ({ v, i, r: posto(nomeDi(v)) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.v);
    const i = indice || { pagine: [], voci: [] };
    const pagine = ordina(i.pagine.filter(x => ci(x.cerca)), x => piano(x.titolo));
    const voci = ordina(i.voci.filter(x => ci(x.cerca) && p.some(w => haParola(x.nome, w))), x => x.nome);
    return { pagine, voci: voci.slice(0, massimo || 40), tante: voci.length > (massimo || 40) };
  }

  /** Il selettore CSS per ritrovare l'impostazione nella pagina aperta. */
  function selettore(voce) {
    return '[' + voce.attributo + '="' + String(voce.valore).replace(/["\\]/g, '\\$&') + '"]';
  }

  const esporta = { piano, VOCI_PAGINE, costruisciIndice, cerca, selettore };
  radice.WisperRegoleImpostazioni = esporta;
  if (typeof module !== 'undefined' && module.exports) module.exports = esporta;
})(typeof window !== 'undefined' ? window : globalThis);
