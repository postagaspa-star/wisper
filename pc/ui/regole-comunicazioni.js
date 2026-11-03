/*
 * Wisper Ufficio: le regole di WhatsApp e comunicazioni e del portale clienti lato studio (fase 7,
 * docs/gestionale/fase7.md §3.13-3.16, §9, §11, §12), senza niente di grafico.
 *
 * Il numero per WhatsApp è lo stesso del server (server/src/comunicazioni.js) e del telefono: i casi
 * condivisi stanno in server/prove/casi-whatsapp.json e la prova è pc/prove/comunicazioni.test.js.
 * Qui ci sono anche le parole fisse di §12 (canali, stati, colori), i segnaposti dei modelli (§9.2),
 * i permessi delle pagine nuove (§11.2) e le piccole regole delle schermate dello studio.
 * I conti, le proposte di Da mandare e i permessi veri li decide il server: qui si mostra.
 */
(function (radice) {
  'use strict';

  // ------------------------------------------------------------------ il numero per WhatsApp (§9.3)

  /**
   * "333 000 1122" -> { valido: true, numero: "393330001122", fisso: false, visto: "+39 333 000 1122" }.
   * 1) solo cifre e un + iniziale; 2) via + o 00 davanti; 3-4) solo senza prefisso: cellulare (3, 9-10 cifre) o
   * fisso (0, 6-11 cifre) italiano col 39 davanti; 5) 39 e 11-12 cifre così (fisso se dopo il 39 c'è uno 0);
   * 6) da 8 a 15 cifre così (estero); fuori da questi casi non è un numero.
   */
  function numeroWhatsapp(testo) {
    const t = String(testo === null || testo === undefined ? '' : testo).trim();
    let cifre = t.replace(/\D/g, '');
    let prefisso = false;
    if (t.charAt(0) === '+') prefisso = true;
    else if (cifre.slice(0, 2) === '00') { cifre = cifre.slice(2); prefisso = true; }
    let numero = null;
    let fisso = false;
    if (!prefisso && cifre.charAt(0) === '3' && cifre.length >= 9 && cifre.length <= 10) numero = '39' + cifre;
    else if (!prefisso && cifre.charAt(0) === '0' && cifre.length >= 6 && cifre.length <= 11) { numero = '39' + cifre; fisso = true; }
    else if (cifre.slice(0, 2) === '39' && cifre.length >= 11 && cifre.length <= 12) { numero = cifre; fisso = cifre.charAt(2) === '0'; }
    else if (cifre.length >= 8 && cifre.length <= 15) numero = cifre;
    if (!numero) return { valido: false };
    return { valido: true, numero, fisso, visto: numeroVisto(numero) };
  }

  /** Come si mostra: cellulare italiano "+39 333 000 1122", fisso italiano "+39 0445000100", estero "+41790001122". */
  function numeroVisto(numero) {
    const n = String(numero || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.slice(0, 2) === '39' && n.charAt(2) === '3') {
      const r = n.slice(2);
      return '+39 ' + [r.slice(0, 3), r.slice(3, 6), r.slice(6)].filter(Boolean).join(' ');
    }
    if (n.slice(0, 2) === '39') return '+39 ' + n.slice(2);
    return '+' + n;
  }

  /** Il messaggio pronto (§9.4): https://wa.me/<numero>?text=<testo con encodeURIComponent>. */
  function linkWhatsapp(numero, testo) {
    const n = String(numero || '').replace(/\D/g, '');
    return 'https://wa.me/' + n + (testo ? '?text=' + encodeURIComponent(String(testo)) : '');
  }

  /**
   * Un indirizzo che si può aprire come WhatsApp (lo stesso controllo del programma, Ponte.cs): solo https://wa.me/,
   * le cifre del numero e al massimo ?text=. Niente altro esce dalla pagina con questa strada.
   */
  function linkWhatsappValido(url) {
    const u = String(url || '');
    return u.length <= 12000 && /^https:\/\/wa\.me\/[0-9]{8,15}(\?text=[A-Za-z0-9%\-_.!~*'()]*)?$/.test(u);
  }

  // ------------------------------------------------------------------ parole fisse e colori (§12)

  const CANALI = { whatsapp: 'WhatsApp', email: 'Email', portale: 'Portale', telefonata: 'Telefonata', nota: 'Nota' };
  /** L'icona e il colore di un canale: WhatsApp verde scuro, Email blu, Portale viola, telefonate e note grigie. */
  const ICONE_CANALE = { whatsapp: ['whatsapp', 'ico-verde'], email: ['email', 'ico-blu'], portale: ['globo', 'ico-viola'], telefonata: ['telefono', 'ico-grigio'], nota: ['lista', 'ico-grigio'] };
  const STATI = {
    da_mandare: ['Da mandare', 'giallo'], preparato: ['Preparato', 'blu'], mandato: ['Mandato', 'verde'],
    non_mandato: ['Non mandato', 'grigio'], errore: ['Errore', 'rosso'], ricevuto: ['Ricevuto', 'grigio'],
  };
  function statoComunicazione(c) {
    const s = STATI[(c && c.stato) || ''] || [(c && c.statoVisto) || '', 'grigio'];
    return { parola: (c && c.statoVisto) || s[0], colore: s[1] };
  }
  const nomeCanale = c => CANALI[c] || c || '';
  const iconaCanale = c => ICONE_CANALE[c] || ['lista', 'ico-grigio'];

  /** Le pillole-filtro dello Storico (§12.1): Telefonate prende anche le note. */
  const FILTRI_STORICO = [['tutti', 'Tutti'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['portale', 'Portale'], ['telefonata', 'Telefonate']];
  function filtraStorico(lista, filtro) {
    if (!filtro || filtro === 'tutti') return lista || [];
    return (lista || []).filter(c => c.canale === filtro || (filtro === 'telefonata' && c.canale === 'nota'));
  }

  // ------------------------------------------------------------------ modelli e segnaposti (§9.2)

  const NOMI_MODELLI = {
    promemoria_appuntamento: 'Promemoria appuntamento', intervento_fissato: 'Intervento fissato', preventivo_mandato: 'Preventivo mandato',
    rapportino_da_firmare: 'Rapportino da firmare', promemoria_pagamento: 'Promemoria di pagamento', secondo_promemoria_pagamento: 'Secondo promemoria di pagamento',
    invito_portale: 'Invito al portale', libero: 'Messaggio libero',
  };
  /** I tipi dello storico che non sono modelli (§5.4), con le parole per le righe. */
  const NOMI_TIPI = {
    rapportino: 'Rapportino', riepilogo: 'Riepilogo', preventivo: 'Preventivo', documento: 'Documento', avviso_parcella: 'Avviso di parcella',
    invito_portale: 'Invito al portale', avviso_portale: 'Avviso del portale', conferma_portale: 'Conferma del portale', messaggio: 'Messaggio',
    domanda: 'Domanda', segnalazione: 'Segnalazione', libero: 'Messaggio libero',
  };
  const nomeTipo = c => (c && c.tipoNome) || NOMI_MODELLI[c && c.tipo] || NOMI_TIPI[c && c.tipo] || 'Messaggio';

  const USI = [['appuntamento', 'Appuntamento'], ['intervento', 'Intervento'], ['preventivo', 'Preventivo'], ['rapportino', 'Rapportino'], ['pagamento', 'Pagamento'], ['portale', 'Portale'], ['libero', 'Libero']];
  const SEGNAPOSTI = {
    sempre: ['{nome}', '{cliente}', '{studio}', '{mittente}', '{telefono_studio}', '{oggi}', '{portale}'],
    appuntamento: ['{giorno}', '{ora}', '{cosa}', '{luogo}', '{impianto}', '{commessa}', '{ticket}'],
    intervento: ['{giorno}', '{ora}', '{cosa}', '{luogo}', '{impianto}', '{commessa}', '{ticket}'],
    preventivo: ['{preventivo}', '{oggetto}', '{scadenza}', '{totale}'],
    rapportino: ['{data}', '{lavoro}', '{rapportino}'],
    pagamento: ['{fattura}', '{data_fattura}', '{importo}', '{scadenza}'],
    portale: [], libero: [],
  };
  /** I segnaposti che si possono usare con un uso: sempre + quelli dell'uso (dal server, se li manda). */
  function segnapostiDi(uso, dalServer) {
    const s = dalServer && dalServer.sempre ? dalServer : SEGNAPOSTI;
    return (s.sempre || []).concat(s[uso] || []);
  }
  /** I segnaposti scritti nel testo che non vanno con quell'uso: "{cleinte}". */
  function segnapostiSconosciuti(testo, uso, dalServer) {
    const ok = segnapostiDi(uso, dalServer);
    const visti = String(testo || '').match(/\{[a-z_]+\}/gi) || [];
    return visti.filter((x, i) => ok.indexOf(x) < 0 && visti.indexOf(x) === i);
  }
  const TESTO_MAX = 1000;

  /** L'errore del modello prima di salvarlo (le parole del server, §10.2), o "". */
  function erroreModello(m, dalServer, max) {
    const x = m || {};
    if (!String(x.nome || '').trim()) return { campo: 'nome', errore: 'Nome: scrivi come si chiama' };
    if (!String(x.testo || '').trim()) return { campo: 'testo', errore: 'Testo: scrivi il messaggio' };
    const sc = segnapostiSconosciuti(x.testo, x.uso || 'libero', dalServer).concat(segnapostiSconosciuti(x.oggetto, x.uso || 'libero', dalServer));
    if (sc.length) return { campo: 'testo', errore: 'Segnaposto sconosciuto: ' + sc[0] + '. Si possono usare ' + segnapostiDi(x.uso || 'libero', dalServer).join(', ') };
    if ((x.canale === 'whatsapp' || x.canale === 'tutti') && String(x.testo).length > (max || TESTO_MAX)) return { campo: 'testo', errore: 'Il messaggio è più lungo di ' + migliaia(max || TESTO_MAX) + ' caratteri: accorcialo' };
    return null;
  }

  const migliaia = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  /**
   * Riempie i segnaposti: quelli senza valore restano scritti e tornano in "mancano"; la riga che contiene
   * {portale} sparisce se il portale non c'è per quel cliente (portale: false).
   */
  function riempi(testo, valori, opzioni) {
    const o = opzioni || {};
    const v = valori || {};
    let righe = String(testo || '').split('\n');
    if (!o.portale) righe = righe.filter(r => r.indexOf('{portale}') < 0);
    const mancano = [];
    const fuori = righe.join('\n').replace(/\{([a-z_]+)\}/gi, (tutto, k) => {
      const x = v[k];
      if (x === undefined || x === null || x === '') { if (mancano.indexOf(tutto) < 0) mancano.push(tutto); return tutto; }
      return String(x);
    });
    return { testo: fuori, mancano };
  }

  /** I valori di esempio dell'anteprima dei modelli (§12.2: "un cliente di esempio"), dalle frasi dell'accordo. */
  const VALORI_ESEMPIO = {
    nome: 'Sig. Ferretti', cliente: 'Rossi Impianti Srl', studio: 'Studio Tecnico GM', mittente: 'Manuel Gasparotto · Studio Tecnico GM',
    telefono_studio: '0445 000100', oggi: '22/10/2026', portale: 'studiogm-portale.netlify.app',
    giorno: 'giovedì 23 ottobre', ora: '9:00', cosa: 'Intervento TK/2026/0014', luogo: 'Cabina MT di Zanè', impianto: 'Cabina MT di Zanè',
    commessa: '26ST046', ticket: 'TK/2026/0014', preventivo: 'PR/2026/012 rev. 1', oggetto: 'Adeguamento impianto elettrico capannone',
    scadenza: '28/10/2026', totale: '4.291,35 €', data: '21/10/2026', lavoro: 'Ricerca guasto sul quadro QG2', rapportino: 'RAP/2026/0153',
    fattura: '45/2026', data_fattura: '10/10/2026', importo: '1.765,12 €',
  };

  /** "manca il luogo": il nome di un segnaposto senza valore, come lo dicono le schermate. */
  const NOMI_SEGNAPOSTI = {
    '{nome}': 'il nome', '{cliente}': 'il cliente', '{giorno}': 'il giorno', '{ora}': "l'ora", '{cosa}': 'cosa', '{luogo}': 'il luogo',
    '{impianto}': "l'impianto", '{commessa}': 'la commessa', '{ticket}': 'il ticket', '{preventivo}': 'il preventivo', '{oggetto}': "l'oggetto",
    '{scadenza}': 'la scadenza', '{totale}': 'il totale', '{data}': 'la data', '{lavoro}': 'il lavoro', '{rapportino}': 'il rapportino',
    '{fattura}': 'la fattura', '{data_fattura}': 'la data della fattura', '{importo}': "l'importo", '{portale}': "l'indirizzo del portale",
  };
  const fraseManca = s => 'manca ' + (NOMI_SEGNAPOSTI[s] || s);

  /** Il canale di un modello come si legge: WhatsApp, Email, Tutti e due. */
  const CANALI_MODELLO = [['whatsapp', 'WhatsApp'], ['email', 'Email'], ['tutti', 'Tutti e due']];
  const nomeCanaleModello = c => (CANALI_MODELLO.find(x => x[0] === c) || [c, c])[1];
  /** I modelli che vanno bene per un canale e un uso (le pillole del Messaggio): attivi, di quel canale o di tutti e due. */
  function modelliPer(modelli, canale, uso) {
    return (modelli || []).filter(m => m.attivo !== false && m.attivo !== 0 && (m.canale === 'tutti' || m.canale === canale) && (!uso || m.uso === uso || m.uso === 'libero'));
  }

  // ------------------------------------------------------------------ Da mandare (§9.5)

  /** I gruppi di Da mandare, nell'ordine dell'accordo; i vuoti non si mostrano (tranne Oggi, che dice "Niente da mandare oggi"). */
  function gruppiDaMandare(r) {
    const x = r || {};
    return [['oggi', 'Oggi'], ['domani', 'Domani'], ['proposti', 'Proposti'], ['preparati', 'Preparati, non mandati']]
      .map(([k, nome]) => ({ chiave: k, nome, voci: x[k] || [] }))
      .filter(g => g.chiave === 'oggi' || g.voci.length);
  }

  /** Il numerino giallo del menu (§11.1): WhatsApp e comunicazioni = da mandare oggi + preparati; Portale clienti = da guardare. */
  function numerino(numeri, modulo) {
    const n = numeri || {};
    if (modulo === 'comunicazioni') { const c = n.comunicazioni || {}; return (Number(c.daMandareOggi) || 0) + (Number(c.preparati) || 0); }
    if (modulo === 'portale') { const p = n.portale || {}; return Number(p.daGuardare) || 0; }
    return 0;
  }

  // ------------------------------------------------------------------ permessi (§11.2)

  const liv = (p, m) => { const v = p ? Number(p[m]) : 0; return v === 1 || v === 2 ? v : 0; };
  const Permessi = {
    vedeComunicazioni: p => liv(p, 'comunicazioni') >= 1,
    scriveComunicazioni: p => liv(p, 'comunicazioni') >= 2,
    vedePortale: p => liv(p, 'portale') >= 1,
    scrivePortale: p => liv(p, 'portale') >= 2,
    /** Pagamenti (proposte, modelli pagamento, nonSollecitare): fatturazione 2 e costi ≥ 1. */
    pagamenti: p => liv(p, 'fatturazione') >= 2 && liv(p, 'costi') >= 1,
    /** Pubblica: portale 2 e il modulo della cosa ≥ 1. */
    pubblica: (p, modulo) => liv(p, 'portale') >= 2 && liv(p, modulo) >= 1,
    /** Accettare un file del cliente: portale 2 e documenti 2. */
    accettaFile: p => liv(p, 'portale') >= 2 && liv(p, 'documenti') >= 2,
    /** Rispondi e Mostra nel portale: ticket 2 sul ticket, senza bisogno di portale. */
    rispondeNelPortale: p => liv(p, 'ticket') >= 2,
    /** Spegnere il portale e le sue impostazioni: amministrazione 2. */
    impostazioniPortale: p => liv(p, 'amministrazione') >= 2,
    /** Segnare il sì a WhatsApp: clienti 2 o comunicazioni 2. */
    segnaWhatsapp: p => liv(p, 'clienti') >= 2 || liv(p, 'comunicazioni') >= 2,
  };
  /** Il modulo dei permessi di una cosa da pubblicare (§10.1: i contratti col modulo ticket, le fatture con fatturazione). */
  const MODULO_DI = { preventivo: 'preventivi', contratto: 'ticket', rapportino: 'rapportini', fattura: 'fatturazione', documento: 'documenti', ticket: 'ticket' };

  // ------------------------------------------------------------------ il portale lato studio (§0.5, §3.6, §10.1, §12.3)

  /** "https://studiogm-portale.netlify.app/" -> "studiogm-portale.netlify.app". */
  function host(indirizzo) {
    return String(indirizzo || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }

  /**
   * La riga dello stato (§0.5): Spento (portale spento), Collegato · host, Non si raggiunge · host,
   * Non collegato con la frase che dice dove si fa.
   */
  function statoPortale(stato) {
    const s = stato || {};
    if (s.attivo === false && s.collegato !== 'non_collegato') return { parola: 'Spento', colore: 'grigio', dopo: host(s.indirizzo), spento: true };
    if (s.collegato === 'si') return { parola: 'Collegato', colore: 'verde', dopo: host(s.indirizzo) };
    if (s.collegato === 'no') return { parola: 'Non si raggiunge', colore: 'rosso', dopo: host(s.indirizzo) };
    return { parola: 'Non collegato', colore: 'grigio', dopo: 'Il portale non è ancora su internet: Amministrazione › Impostazioni › Portale clienti', nonCollegato: true };
  }
  /** Lo script del portale (§0.5): Attivo, Non risponde, Non collegato (mancano le due variabili sul NAS). */
  function statoScript(script) {
    if (script === 'attivo') return { parola: 'Attivo', colore: 'verde' };
    if (script === 'non risponde') return { parola: 'Non risponde', colore: 'rosso' };
    return { parola: 'Non collegato', colore: 'grigio', frase: 'mancano WISPER_PORTALE_URL e SEGRETO_PORTALE sul NAS' };
  }

  const STATI_REFERENTE = { Attivo: 'verde', Invitato: 'blu', 'Senza accesso': 'grigio', Tolto: 'grigio' };
  const coloreReferente = st => STATI_REFERENTE[st] || 'grigio';

  /** I cinque tipi di §3.6: nome, e la parola del livello 2 (fatture solo No · Vede). */
  const TIPI_PERMESSI = [['preventivi', 'Preventivi', 'Accetta'], ['rapportini', 'Rapportini', 'Firma'], ['fatture', 'Fatture', ''], ['documenti', 'Documenti', 'Manda file'], ['richieste', 'Richieste', 'Apre']];
  /** I permessi di base all'invito (§3.6): tutto a 2 tranne le fatture a 0; un cliente privato le fatture a 1. */
  function permessiBase(privato) {
    return { preventivi: 2, rapportini: 2, fatture: privato ? 1 : 0, documenti: 2, richieste: 2 };
  }
  /** "Preventivi · Rapportini · Documenti · Richieste" o "Solo Magazzino automatico di Schio" (§12.3). */
  function testoPermessi(r, sediCliente) {
    const x = r || {};
    if (Array.isArray(x.sedi) && x.sedi.length) {
      const nomi = x.sedi.map(id => { const s = (sediCliente || []).find(y => String(y.id) === String(id)); return s ? s.nome : ''; }).filter(Boolean);
      if (nomi.length) return 'Solo ' + nomi.join(', ');
    }
    const p = x.permessi || {};
    return TIPI_PERMESSI.filter(t => Number(p[t[0]]) > 0).map(t => t[1]).join(' · ') || 'Niente';
  }

  const NOMI_PUBBLICAZIONE = { preventivo: 'Preventivi', contratto: 'Contratti', rapportino: 'Rapportini', documento: 'Documenti', fattura: 'Fatture', ticket: 'Richieste' };
  const FILTRI_PUBBLICATI = [['tutti', 'Tutti'], ['preventivo', 'Preventivi'], ['rapportino', 'Rapportini'], ['documento', 'Documenti'], ['fattura', 'Fatture'], ['ticket', 'Richieste']];
  const ICONE_PUBBLICAZIONE = { preventivo: 'preventivo', contratto: 'contratto', rapportino: 'firma', documento: 'file', fattura: 'fatturazione', ticket: 'chiaveInglese' };

  /** Le schede di Da guardare (§12.3): nome, icona e colore; la richiesta urgente è rossa tenue. */
  const DA_GUARDARE = {
    richiesta: ['Richiesta dal portale', 'chiaveInglese', 'ico-blu'], accettato: ['Accettato nel portale', 'preventivo', 'ico-verde'],
    rifiutato: ['Non accettato', 'preventivo', 'ico-grigio'], firmato: ['Firmato nel portale', 'firma', 'ico-verde'],
    caricamento: ['File dal cliente', 'importa', 'ico-grigio'], messaggio: ['Messaggio', 'fumetto', 'ico-blu'],
    domanda: ['Domanda', 'fumetto', 'ico-blu'], segnalato: ['Segnalazione', 'avviso', 'ico-giallo'],
  };
  function schedaDaGuardare(x) {
    const d = DA_GUARDARE[(x && x.tipo) || ''] || ['Dal portale', 'globo', 'ico-grigio'];
    const urgente = !!(x && x.tipo === 'richiesta' && (x.urgente || /urgente/i.test(String(x.titolo || ''))));
    return { nome: d[0], icona: d[1], colore: urgente ? 'ico-rosso' : d[2], urgente, titolo: String((x && x.titolo) || '').replace(/^Richiesta urgente:\s*/i, '').replace(/^Richiesta urgente dal portale:\s*/i, '') };
  }

  /** Le pillole degli Accessi (§12.3): Tutti · Entrati · Azioni · Errori, sulle frasi del server. */
  const FILTRI_ACCESSI = [['tutti', 'Tutti'], ['entrati', 'Entrati'], ['azioni', 'Azioni'], ['errori', 'Errori']];
  function filtraAccessi(lista, filtro) {
    const l = lista || [];
    const entrato = a => /^(Entrat|Uscit)/i.test(String(a.frase || ''));
    if (filtro === 'entrati') return l.filter(a => entrato(a) && a.esito !== 'no');
    if (filtro === 'errori') return l.filter(a => a.esito === 'no');
    if (filtro === 'azioni') return l.filter(a => !entrato(a) && a.esito !== 'no');
    return l;
  }

  // ------------------------------------------------------------------ file dal cliente (§3.11)

  /** Le immagini si guardano come immagini; tutto il resto si scarica, e il primo apri chiede conferma. */
  function fileImmagine(nome) {
    return /\.(png|jpe?g)$/i.test(String(nome || ''));
  }
  /** La domanda prima di aprire un file del portale che non è un'immagine. */
  function domandaFile(cliente) {
    return 'Arriva dal portale di ' + (cliente || 'un cliente') + ': aprilo solo se te lo aspettavi';
  }
  /** 1258291 -> "1,2 MB"; sotto il mega in kB. */
  function grandezza(byte) {
    const b = Number(byte) || 0;
    if (b >= 1048576) return (Math.round(b / 104857.6) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' kB';
    return b + ' byte';
  }

  // ------------------------------------------------------------------ date e ore delle righe

  const due = n => String(n).padStart(2, '0');
  const isoGiorno = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  /** "2026-10-22T09:12:00" -> "oggi alle 9:12", "ieri alle 16:42", "20/10 alle 8:02", "20/10/2025 alle 8:02". */
  function quando(iso, adesso) {
    const s = String(iso || '');
    if (!/^\d{4}-\d\d-\d\d/.test(s)) return '';
    const g = s.slice(0, 10);
    const ora = s.length >= 16 ? Number(s.slice(11, 13)) + ':' + s.slice(14, 16) : '';
    const oggi = adesso ? new Date(adesso) : new Date();
    const ieri = new Date(oggi); ieri.setDate(ieri.getDate() - 1);
    const giorno = g === isoGiorno(oggi) ? 'oggi' : g === isoGiorno(ieri) ? 'ieri'
      : g.slice(8, 10) + '/' + g.slice(5, 7) + (g.slice(0, 4) === String(oggi.getFullYear()) ? '' : '/' + g.slice(0, 4));
    return ora ? giorno + ' alle ' + ora : giorno;
  }
  /** "Visto il 23/10 alle 10:12" o "Non ancora visto" (§8.2). */
  function vistoTesto(vistoIl, adesso) {
    if (!vistoIl) return 'Non ancora visto';
    const q = quando(vistoIl, adesso);
    return 'Visto ' + (/^(oggi|ieri)/.test(q) ? q : 'il ' + q);
  }
  /** Le righe dello storico per giorno: [{ giorno, righe }], come arrivano (le più recenti prima). */
  function perGiorno(lista) {
    const g = [];
    (lista || []).forEach(c => {
      const k = String(c.quando || '').slice(0, 10);
      const ultimo = g[g.length - 1];
      if (ultimo && ultimo.giorno === k) ultimo.righe.push(c); else g.push({ giorno: k, righe: [c] });
    });
    return g;
  }

  // ------------------------------------------------------------------ attività: Avvisa il cliente (§3.14)

  const TIPI_CON_AVVISO = ['appuntamento', 'sopralluogo', 'intervento'];
  /** La proposta di base per un'attività nuova: WhatsApp se ha detto sì, se no email se c'è, se no niente. */
  function avvisaDiBase(referente, cliente) {
    const r = referente || {};
    const c = cliente || {};
    if (r.whatsappOk || c.whatsappOk) return 'whatsapp';
    if (r.email || c.email) return 'email';
    return '';
  }

  /** Un id locale per le scritture che si possono ripetere (salvaMessaggio, mandaEmail): mai due uguali. */
  function idLocale(prefisso, casuale) {
    const c = casuale || (() => Math.random().toString(36).slice(2, 10));
    return (prefisso || 'pc') + '-' + Date.now().toString(36) + '-' + c();
  }

  const Regole = {
    numeroWhatsapp, numeroVisto, linkWhatsapp, linkWhatsappValido,
    CANALI, STATI, statoComunicazione, nomeCanale, iconaCanale, FILTRI_STORICO, filtraStorico,
    NOMI_MODELLI, NOMI_TIPI, nomeTipo, USI, SEGNAPOSTI, segnapostiDi, segnapostiSconosciuti, TESTO_MAX, erroreModello, riempi, VALORI_ESEMPIO,
    NOMI_SEGNAPOSTI, fraseManca, CANALI_MODELLO, nomeCanaleModello, modelliPer, migliaia,
    gruppiDaMandare, numerino, Permessi, MODULO_DI,
    host, statoPortale, statoScript, coloreReferente, TIPI_PERMESSI, permessiBase, testoPermessi,
    NOMI_PUBBLICAZIONE, FILTRI_PUBBLICATI, ICONE_PUBBLICAZIONE, schedaDaGuardare, FILTRI_ACCESSI, filtraAccessi,
    fileImmagine, domandaFile, grandezza, quando, vistoTesto, perGiorno,
    TIPI_CON_AVVISO, avvisaDiBase, idLocale,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperRegoleComunicazioni = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
