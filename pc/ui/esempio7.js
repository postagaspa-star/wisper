/*
 * Wisper Ufficio: i dati di esempio della fase 7 (portale clienti, WhatsApp e comunicazioni; fase7.md §10, §11).
 *
 * Si aggiungono a quelli di esempio.js (lo stesso studio, gli stessi clienti): Rossi Impianti Srl ha il portale
 * acceso con Sig. Ferretti (entrato, ha detto sì a WhatsApp) e Anna Rossi (invitata, paga le fatture); Mario
 * Bianchi, cliente privato, ha il portale da solo; Elettrodinamica no. Le risposte hanno la forma di quelle del
 * server (§10.1-10.4). Il portale di esempio è "Collegato" a studiogm-portale.netlify.app, ma niente esce da qui:
 * nessuna email, nessun WhatsApp, nessun link vero.
 */
(function (radice) {
  'use strict';

  const K = radice.WisperRegoleComunicazioni || (typeof require === 'function' ? require('./regole-comunicazioni.js') : null);
  const copia = o => JSON.parse(JSON.stringify(o));
  const due = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const giorno = (oggi, delta) => { const d = new Date(oggi + 'T12:00:00'); d.setDate(d.getDate() + delta); return iso(d); };
  const istante = (oggi, delta, ora) => giorno(oggi, delta) + 'T' + ora + ':00';
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const giornoLungo = g => { const d = new Date(g + 'T12:00:00'); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()]; };
  const dataIt = g => String(g || '').slice(8, 10) + '/' + String(g || '').slice(5, 7) + '/' + String(g || '').slice(0, 4);
  const PORTALE = 'https://studiogm-portale.netlify.app';

  /** Le azioni della fase 7 che rispondono i dati di esempio, col modulo e il livello che servono (come il server, §10). */
  const SERVE7 = {
    portale: ['portale', 1], segnaVistoPortale: ['portale', 2], portaleCliente: ['portale', 1], salvaPortaleCliente: ['portale', 2], invitaReferente: ['portale', 2],
    salvaAccessoReferente: ['portale', 2], togliAccessoReferente: ['portale', 2], pubblica: ['portale', 2], togliDalPortale: ['portale', 2], pubblicaPrima: ['portale', 2],
    pubblicati: ['portale', 1], caricamentiPortale: ['portale', 1], accettaCaricamento: ['portale', 2], rifiutaCaricamento: ['portale', 2], accessiPortale: ['portale', 1],
    anteprimaPortale: ['portale', 1], rispondiNelPortale: ['ticket', 2], mostraNelPortale: ['ticket', 2], controllaPortale: ['portale', 1], spegniPortale: ['amministrazione', 2],
    comunicazioni: ['comunicazioni', 1], daMandare: ['comunicazioni', 1], preparaMessaggio: ['comunicazioni', 1], salvaMessaggio: ['comunicazioni', 2], segnaMandato: ['comunicazioni', 2],
    mandaEmail: ['comunicazioni', 2], nonMandare: ['comunicazioni', 2], segnaWhatsapp: null, modelliMessaggi: ['comunicazioni', 1], salvaModelloMessaggio: ['comunicazioni', 2],
    togliModelloMessaggio: ['comunicazioni', 2], nonSollecitare: ['fatturazione', 2], notifiche: null, segnaLette: null, salvaPreferenzeNotifiche: null, allegaCopiaFattura: ['fatturazione', 2],
  };

  const MODELLI = [
    ['promemoria_appuntamento', 'tutti', 'appuntamento', 'Promemoria: {giorno} alle {ora}', 'Buongiorno {nome}, le ricordo l\'appuntamento di {giorno} alle {ora} presso {luogo}: {cosa}. Se non va più bene mi scriva pure. {mittente}'],
    ['intervento_fissato', 'tutti', 'intervento', 'Intervento fissato per {giorno}', 'Buongiorno {nome}, l\'intervento per {cosa} è fissato per {giorno} alle {ora} presso {luogo}.\nLo trova anche nel portale: {portale}\n{mittente}'],
    ['preventivo_mandato', 'tutti', 'preventivo', 'Preventivo {preventivo}', 'Buongiorno {nome}, le ho mandato per email il preventivo {preventivo} per {oggetto}.\nLo trova anche nel portale, dove può accettarlo: {portale}\nResto a disposizione per qualsiasi domanda. {mittente}'],
    ['rapportino_da_firmare', 'tutti', 'rapportino', 'Rapportino del {data} da firmare', 'Buongiorno {nome}, il rapportino del {data} ({lavoro}) è ancora da firmare.\nPuò firmarlo nel portale: {portale}\nAltrimenti lo firmiamo alla prossima visita. {mittente}'],
    ['promemoria_pagamento', 'tutti', 'pagamento', 'Promemoria: fattura {fattura}', 'Buongiorno {nome}, le scrivo per un promemoria: la fattura {fattura} del {data_fattura}, di {importo}, risultava da saldare entro il {scadenza}. Se il pagamento è già partito, non tenga conto di questo messaggio. Grazie. {mittente}'],
    ['secondo_promemoria_pagamento', 'tutti', 'pagamento', 'Fattura {fattura}', 'Buongiorno {nome}, torno a scriverle per la fattura {fattura} del {data_fattura}, di {importo}, con scadenza il {scadenza}. Mi può dire quando è previsto il pagamento? Se è già partito, mi scusi per il disturbo. Grazie. {mittente}'],
    ['invito_portale', 'whatsapp', 'portale', '', 'Buongiorno {nome}, da oggi preventivi, rapportini e documenti dello studio li trova anche nel portale: {portale}\nPer entrare basta la sua email: le arriva un link. {mittente}'],
    ['libero', 'tutti', 'libero', '', 'Buongiorno {nome}, '],
  ].map((x, i) => ({ chiave: x[0], nome: K.NOMI_MODELLI[x[0]], canale: x[1], uso: x[2], oggetto: x[3], testo: x[4], attivo: true, sistema: true, ordine: i + 1 }));

  /** I dati della fase 7, creati la prima volta che servono (anche le anagrafiche li vogliono: referenti e portale). */
  function prepara(dati) {
    if (dati.f7) return dati.f7;
    const oggi = dati.oggi;
    const a = dati.ana;
    const rossi = a.soggetti.find(s => s.id === 'C002');
    // I referenti nuovi di Rossi (§10.1): Sig. Ferretti dell'ufficio tecnico e Anna Rossi dell'amministrazione; Mario Bianchi privato.
    if (!a.referenti.some(r => r.id === 51)) {
      a.referenti.push({ id: 51, idSoggetto: 'C002', nome: 'Sig. Ferretti', ruolo: 'Ufficio tecnico', telefono: '333 000 1122', email: 'f.ferretti@rossi.example', note: '', ordine: 2 });
      a.referenti.push({ id: 52, idSoggetto: 'C002', nome: 'Anna Rossi', ruolo: 'Amministrazione', telefono: '0445 000004', email: 'amministrazione@rossi.example', note: '', ordine: 3 });
      a.referenti.push({ id: 53, idSoggetto: 'C003', nome: 'Mario Bianchi', ruolo: 'Cliente privato', telefono: '347 000 1122', email: 'mario.bianchi@esempio.it', note: '', ordine: 1 });
    }
    const piu = {
      1: { whatsappOk: false }, 2: { pagamenti: true }, 3: { whatsappOk: false },
      51: { portale: true, statoPortale: 'Attivo', whatsappOk: true, whatsappOkIl: istante(oggi, -30, '10:00'), permessi: { preventivi: 2, rapportini: 2, fatture: 1, documenti: 2, richieste: 2 }, sedi: null, avvisiEmail: true, ultimoAccesso: istante(oggi, 0, '09:58'), invitatoIl: istante(oggi, -8, '11:00') },
      52: { portale: true, statoPortale: 'Invitato', pagamenti: true, permessi: { preventivi: 1, rapportini: 1, fatture: 1, documenti: 1, richieste: 0 }, sedi: null, avvisiEmail: true, ultimoAccesso: '', invitatoIl: istante(oggi, -2, '15:30') },
      53: { portale: true, statoPortale: 'Attivo', pagamenti: true, whatsappOk: true, permessi: { preventivi: 2, rapportini: 2, fatture: 1, documenti: 2, richieste: 2 }, sedi: null, avvisiEmail: true, ultimoAccesso: istante(oggi, -1, '18:02'), invitatoIl: istante(oggi, -20, '09:00') },
    };
    a.referenti.forEach(r => Object.assign(r, { portale: false, statoPortale: 'Senza accesso', pagamenti: false, whatsapp: '', whatsappOk: false, permessi: K.permessiBase(false), sedi: null, avvisiEmail: true, ultimoAccesso: '', invitatoIl: '' }, piu[r.id] || {}));
    const clienti = {
      C001: { portale: false, importi: false, regole: regoleBase() },
      C002: { portale: true, importi: false, regole: regoleBase() },
      C003: { portale: true, importi: true, regole: Object.assign(regoleBase(), { fatture: true }) },
    };
    const rapRossi = dati.rapportini.find(r => r.idCliente === 'C002' && r.stato === 'BOZZA');
    const f7 = {
      stato: { attivo: true, indirizzo: PORTALE, collegato: 'si', controllatoIl: istante(oggi, 0, '10:00'), script: 'attivo', emailRimaste: 71 },
      clienti,
      pubblicati: [
        { id: 12, soggetto: 'C002', tipo: 'preventivo', rif: 12, titolo: 'Preventivo PR/2026/012 rev. 1', pubblicataIl: istante(oggi, -9, '11:20'), origine: 'regola', vistoIl: istante(oggi, -1, '17:40'), vistoDa: 'Sig. Ferretti', daFirmare: false },
        { id: 7, soggetto: 'C002', tipo: 'preventivo', rif: 7, titolo: 'Preventivo PR/2026/007', pubblicataIl: istante(oggi, -46, '09:00'), origine: 'regola', vistoIl: istante(oggi, -45, '08:12'), vistoDa: 'Sig. Ferretti', daFirmare: false },
        rapRossi ? { id: 21, soggetto: 'C002', tipo: 'rapportino', rif: rapRossi.id, titolo: 'Rapportino del ' + dataIt(rapRossi.data), pubblicataIl: istante(oggi, -1, '16:00'), origine: 'mano', vistoIl: '', vistoDa: '', daFirmare: false } : null,
        { id: 15, soggetto: 'C003', tipo: 'preventivo', rif: 10, titolo: 'Preventivo PR/2026/010', pubblicataIl: istante(oggi, -20, '09:00'), origine: 'regola', vistoIl: istante(oggi, -19, '20:15'), vistoDa: 'Mario Bianchi', daFirmare: false },
      ].filter(Boolean),
      prossimaPub: 30,
      caricamenti: [
        { id: 31, soggetto: 'C002', referente: 'Sig. Ferretti', titolo: 'Schema quadro QG2', nota: 'Versione aggiornata dal nostro ufficio', nome: 'Schema quadro QG2.pdf', byte: 1258291, creato: istante(oggi, 0, '09:20'), stato: 'da_guardare', ticket: null, idFile: 'esempioportale31' },
        { id: 32, soggetto: 'C003', referente: 'Mario Bianchi', titolo: 'Foto targa inverter', nota: '', nome: 'Foto targa inverter.jpg', byte: 2516582, creato: istante(oggi, -1, '18:05'), stato: 'da_guardare', ticket: null, idFile: 'esempioportale32' },
      ],
      daGuardare: [
        { id: 41, tipo: 'richiesta', titolo: 'Richiesta urgente: TK/2026/0016', dettaglio: 'Rossi Impianti Srl · Capannone · Sig. Ferretti · alle 9:12', quando: istante(oggi, 0, '09:12'), collegamento: { pagina: 'ticket', id: 16 } },
        { id: 42, tipo: 'caricamento', titolo: 'Schema quadro QG2.pdf', dettaglio: 'Rossi Impianti Srl · Sig. Ferretti · 1,2 MB', quando: istante(oggi, 0, '09:20'), collegamento: { pagina: 'caricamento', id: 31 } },
        { id: 43, tipo: 'messaggio', titolo: 'Messaggio di Sig. Ferretti su TK/2026/0014', dettaglio: 'Va bene, vi aspetta il custode al cancello nord.', quando: istante(oggi, 0, '08:15'), collegamento: { pagina: 'ticket', id: 14 } },
        { id: 44, tipo: 'caricamento', titolo: 'Foto targa inverter.jpg', dettaglio: 'Mario Bianchi · 2,4 MB', quando: istante(oggi, -1, '18:05'), collegamento: { pagina: 'caricamento', id: 32 } },
      ],
      accessi: [
        { quando: istante(oggi, 0, '09:58'), soggetto: 'C002', referente: 'Sig. Ferretti', frase: 'Entrato', oggetto: '', esito: 'ok', dispositivo: 'Chrome · Android' },
        { quando: istante(oggi, 0, '09:20'), soggetto: 'C002', referente: 'Sig. Ferretti', frase: 'Ha mandato il file Schema quadro QG2.pdf', oggetto: 'Schema quadro QG2.pdf', esito: 'ok', dispositivo: 'Chrome · Android' },
        { quando: istante(oggi, 0, '09:12'), soggetto: 'C002', referente: 'Sig. Ferretti', frase: 'Ha aperto la richiesta TK/2026/0016', oggetto: 'ticket:16', esito: 'ok', dispositivo: 'Chrome · Android' },
        { quando: istante(oggi, -1, '18:02'), soggetto: 'C003', referente: 'Mario Bianchi', frase: 'Entrato', oggetto: '', esito: 'ok', dispositivo: 'Edge · Windows' },
        { quando: istante(oggi, -1, '17:40'), soggetto: 'C002', referente: 'Sig. Ferretti', frase: 'Ha visto il preventivo PR/2026/012 rev. 1', oggetto: 'preventivo:12', esito: 'ok', dispositivo: 'Edge · Windows' },
        { quando: istante(oggi, -2, '07:31'), soggetto: '', referente: '', frase: 'Codice sbagliato', oggetto: '', esito: 'no', dispositivo: 'Safari · iPhone' },
      ],
      comunicazioni: [
        com(57, istante(oggi, 0, '09:12'), 'portale', 'entrata', 'messaggio', 'C002', 51, '', 'Da stamattina alle 8 scatta ogni dieci minuti, la linea 4 è ferma.', 'ricevuto', { tipo: 'ticket', id: 16, etichetta: 'TK/2026/0016' }, ''),
        com(56, istante(oggi, 0, '08:15'), 'portale', 'entrata', 'messaggio', 'C002', 51, '', 'Va bene, vi aspetta il custode al cancello nord.', 'ricevuto', { tipo: 'ticket', id: 14, etichetta: 'TK/2026/0014' }, ''),
        com(55, istante(oggi, -1, '16:42'), 'portale', 'uscita', 'messaggio', 'C002', 51, '', 'Veniamo giovedì alle 9 con il misuratore.', 'mandato', { tipo: 'ticket', id: 14, etichetta: 'TK/2026/0014' }, 'Manuel Gasparotto'),
        com(54, istante(oggi, -2, '08:02'), 'whatsapp', 'uscita', 'promemoria_appuntamento', 'C003', 53, '+39 347 000 1122', 'Buongiorno Mario Bianchi, le ricordo l\'appuntamento di domani alle 15:00 presso Via Montegrappa 8: Rilievo fotovoltaico Bianchi. Se non va più bene mi scriva pure. Manuel Gasparotto · Studio Tecnico GM', 'mandato', { tipo: 'attivita', id: 10, etichetta: 'Rilievo fotovoltaico Bianchi' }, 'Manuel Gasparotto'),
        com(53, istante(oggi, -2, '07:55'), 'whatsapp', 'uscita', 'libero', 'C001', 1, '+39 0445123456', 'Buongiorno Giulia, le mando nel pomeriggio lo schema aggiornato. Manuel Gasparotto · Studio Tecnico GM', 'preparato', null, 'Manuel Gasparotto'),
        com(52, istante(oggi, -3, '11:45'), 'email', 'uscita', 'rapportino', 'C003', 53, 'mario.bianchi@esempio.it', 'In allegato il rapportino del sopralluogo.', 'mandato', null, 'Manuel Gasparotto', 'Rapportino del sopralluogo'),
        com(51, istante(oggi, -4, '17:20'), 'telefonata', 'entrata', 'libero', 'C002', 3, '', 'Chiede se il collaudo si può spostare alla settimana prossima: detto di sì, da confermare.', 'mandato', null, 'Manuel Gasparotto'),
        com(50, istante(oggi, -9, '11:20'), 'email', 'uscita', 'preventivo', 'C002', 51, 'f.ferretti@rossi.example', 'In allegato il preventivo per l\'adeguamento dell\'impianto elettrico del capannone.', 'mandato', { tipo: 'preventivo', id: 12, etichetta: 'PR/2026/012 rev. 1' }, 'Manuel Gasparotto', 'Preventivo PR/2026/012 rev. 1'),
        com(49, istante(oggi, -10, '18:20'), 'email', 'uscita', 'avviso_portale', 'C002', 51, 'f.ferretti@rossi.example', 'Nel portale di Studio Tecnico GM ci sono novità per Rossi Impianti Srl.', 'errore', null, '', 'Studio Tecnico GM: novità nel portale', 'La casella del destinatario è piena'),
      ],
      prossimaCom: 60,
      modelli: copia(MODELLI),
      notifiche: [
        { id: 3, tipo: 'richiesta_portale', titolo: 'Richiesta dal portale: TK/2026/0016', dettaglio: 'Rossi Impianti Srl · Scatta il differenziale del quadro QG2 · Urgente', collegamento: { pagina: 'ticket', id: 16 }, creata: istante(oggi, 0, '09:12'), letta: false },
        { id: 2, tipo: 'file_portale', titolo: 'File dal portale: Schema quadro QG2.pdf', dettaglio: 'Rossi Impianti Srl · 1,2 MB', collegamento: { pagina: 'caricamento', id: 31 }, creata: istante(oggi, 0, '09:20'), letta: false },
        { id: 1, tipo: 'da_mandare', titolo: '1 messaggio da mandare oggi', dettaglio: 'Sig. Ferretti', collegamento: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } }, creata: istante(oggi, 0, '08:00'), letta: true },
      ],
      usate: {},
      sollecitiNo: {},
      prossimoRef: 60,
    };
    dati.f7 = f7;
    // Le impostazioni della fase 7 (§5.1), coi valori iniziali dell'accordo; il portale di esempio è acceso e collegato.
    const base = { PORTALE_ATTIVO: true, PORTALE_INDIRIZZO: PORTALE, PORTALE_LINK_MINUTI: 10, PORTALE_LINK_AVVISO_ORE: 72, PORTALE_SESSIONE_MINUTI: 30, PORTALE_SESSIONE_ORE: 8,
      PORTALE_FILE_MAX_MB: 20, PORTALE_FILE_GIORNO: 20, PORTALE_TIPI_FILE: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'], PORTALE_EMAIL_RISERVA: 20, PORTALE_EMAIL_MAX_GIORNO: 40,
      PORTALE_INFORMATIVA: 'Questo portale è di Studio Tecnico GM, titolare dei dati. Lo usiamo per mostrarti i documenti del lavoro che facciamo per la tua azienda, per raccogliere accettazioni, firme e richieste.',
      PORTALE_INFORMATIVA_DATA: '2026-10-22', WHATSAPP_APP: 'chiedi', WHATSAPP_TESTO_MAX: 1000, PROMEMORIA_GIORNI_PRIMA: 1, SOLLECITO_DOPO_GIORNI: 7, SOLLECITO_SECONDO_GIORNI: 30 };
    Object.keys(base).forEach(k => { if (a.impostazioni[k] === undefined) a.impostazioni[k] = base[k]; });
    if (rossi) rossi.portale = true;
    const bianchi = a.soggetti.find(s => s.id === 'C003');
    if (bianchi) bianchi.portale = true;
    return f7;
  }

  function regoleBase() { return { preventivi: true, contratti: true, rapportiniFirmati: true, rapportiniDaFirmare: false, fatture: false, richieste: 'portale' }; }

  function com(id, quando, canale, direzione, tipo, cliente, referente, a, testo, stato, riferimento, chi, oggetto, errore) {
    return { id, quando, canale, direzione, tipo, cliente, referente, a, testo, stato, riferimento, chi, oggetto: oggetto || '', errore: errore || '' };
  }

  // ------------------------------------------------------------------ risposte

  const nomeCliente = (dati, id) => (dati.ana.soggetti.find(s => s.id === id) || { nome: '' }).nome;
  const referente = (dati, id) => dati.ana.referenti.find(r => String(r.id) === String(id));
  const pubblico = r => ({ id: r.id, nome: r.nome, ruolo: r.ruolo, email: r.email, telefono: r.telefono, portale: !!r.portale, statoVisto: r.statoPortale, permessi: copia(r.permessi),
    sedi: r.sedi, avvisiEmail: r.avvisiEmail, ultimoAccesso: r.ultimoAccesso, invitatoIl: r.invitatoIl, pagamenti: !!r.pagamenti, whatsappOk: !!r.whatsappOk });

  function rigaCom(dati, c) {
    const r = referente(dati, c.referente);
    return { id: c.id, quando: c.quando, canale: c.canale, direzione: c.direzione, tipo: c.tipo, tipoNome: K.nomeTipo({ tipo: c.tipo }), cliente: nomeCliente(dati, c.cliente), idCliente: c.cliente,
      referente: r ? r.nome : '', a: c.a, oggetto: c.oggetto, testo: c.testo, stato: c.stato, statoVisto: K.statoComunicazione({ stato: c.stato }).parola,
      riferimento: c.riferimento, chi: c.chi, errore: c.errore, motivo: c.motivo || '' };
  }

  function contatto(dati, r, idCliente) {
    const cli = dati.ana.soggetti.find(s => s.id === (r ? r.idSoggetto : idCliente)) || {};
    const tel = r ? (r.whatsapp || r.telefono) : cli.telefono;
    const n = K.numeroWhatsapp(tel || '');
    return { idReferente: r ? r.id : null, nome: r ? r.nome : cli.nome, cliente: cli.nome || '', numero: n.valido ? n.numero : '', numeroVisto: n.valido ? n.visto : '',
      email: (r && r.email) || cli.email || '', whatsappOk: !!(r && r.whatsappOk), fisso: !!n.fisso };
  }

  function valoriDi(dati, b, r) {
    const imp = dati.ana.impostazioni;
    const f7 = prepara(dati);
    const idCli = r ? r.idSoggetto : b.idCliente;
    const cliPortale = f7.clienti[idCli] && f7.clienti[idCli].portale && f7.stato.collegato === 'si';
    const v = { nome: r ? r.nome : nomeCliente(dati, idCli), cliente: nomeCliente(dati, idCli), studio: imp.RAGIONE_SOCIALE, mittente: (dati.io.nome || imp.TECNICO) + ' · ' + imp.RAGIONE_SOCIALE,
      telefono_studio: imp.TELEFONO, oggi: dataIt(dati.oggi), portale: K.host(f7.stato.indirizzo) };
    if (b.idAttivita) {
      const x = (dati.attivita || []).find(y => String(y.id) === String(b.idAttivita));
      if (x) Object.assign(v, { giorno: giornoLungo(String(x.inizio || x.scadenza).slice(0, 10)), ora: x.inizio ? Number(x.inizio.slice(11, 13)) + ':' + x.inizio.slice(14, 16) : '', cosa: x.titolo, luogo: x.luogo, commessa: x.idCommessa });
    }
    if (b.idPreventivo) {
      const p = (dati.preventivi || []).find(y => String(y.id) === String(b.idPreventivo));
      if (p) Object.assign(v, { preventivo: p.numero + (p.revisione ? ' rev. ' + p.revisione : ''), oggetto: p.oggetto, scadenza: dataIt(p.scadenza) });
    }
    if (b.idRapportino) {
      const x = dati.rapportini.find(y => y.id === b.idRapportino);
      if (x) Object.assign(v, { data: dataIt(x.data), lavoro: String(x.descrizione || '').slice(0, 80), rapportino: x.id });
    }
    if (b.idFattura && dati.f4) {
      const f = dati.f4.fatture.find(y => String(y.id) === String(b.idFattura));
      if (f) Object.assign(v, { fattura: f.numero, data_fattura: dataIt(f.data), importo: (Math.round(f.residuo * 100) / 100).toFixed(2).replace('.', ',') + ' €', scadenza: dataIt(f.scadenze && f.scadenze[0] ? f.scadenze[0].data : f.data) });
    }
    return { v, portale: !!cliPortale };
  }

  function prepara1(dati, b) {
    const f7 = prepara(dati);
    const m = f7.modelli.find(x => x.chiave === (b.modello || 'libero'));
    if (!m) return { ok: false, errore: 'Modello sconosciuto: ' + b.modello };
    const r = b.idReferente ? referente(dati, b.idReferente) : null;
    const a = contatto(dati, r, b.idCliente);
    if ((b.canale || 'whatsapp') === 'whatsapp' && !a.numero) {
      if (!(r ? r.whatsapp || r.telefono : '')) return { ok: false, errore: a.nome + ' non ha un numero di telefono' };
      return { ok: false, errore: 'Il numero ' + (r.whatsapp || r.telefono) + ' non sembra un numero di telefono' };
    }
    const { v, portale } = valoriDi(dati, b, r);
    const t = K.riempi(m.testo, v, { portale });
    const o = K.riempi(m.oggetto, v, { portale });
    const ris = { ok: true, testo: t.testo, oggetto: o.testo, a, link: a.numero ? K.linkWhatsapp(a.numero, t.testo) : '', mancano: t.mancano };
    if (m.uso === 'pagamento') ris.ultimoMovimento = giorno(dati.oggi, -10);
    return ris;
  }

  function proposta(dati, chiave, tipo, dettaglio, canale, r, rif) {
    const b = Object.assign({ modello: tipo, canale, idReferente: r.id }, rif);
    const p = prepara1(dati, b);
    return { proposta: chiave, tipo, titolo: K.NOMI_MODELLI[tipo], dettaglio, canale, a: p.a || contatto(dati, r), riferimento: rif.idAttivita ? { tipo: 'attivita', id: rif.idAttivita } : rif.idFattura ? { tipo: 'fattura', id: rif.idFattura } : rif.idRapportino ? { tipo: 'rapportino', id: rif.idRapportino } : null,
      modello: tipo, testo: p.testo || '', oggetto: p.oggetto || '', mancano: p.mancano || [], ultimoMovimento: p.ultimoMovimento };
  }

  function daMandare(dati) {
    const f7 = prepara(dati);
    const io = dati.io;
    const coll = io.ruolo === 'collaboratore';
    const usate = f7.usate;
    const oggi = dati.oggi;
    const ora = x => Number(x.slice(11, 13)) + ':' + x.slice(14, 16);
    const out = { ok: true, oggi: [], domani: [], proposti: [], preparati: [] };
    (dati.attivita || []).filter(x => ['appuntamento', 'sopralluogo', 'intervento'].indexOf(x.tipo) >= 0 && x.idCliente && x.stato !== 'fatta' && x.inizio).forEach(x => {
      const g = x.inizio.slice(0, 10);
      const gruppo = g === giorno(oggi, 1) ? 'oggi' : g === giorno(oggi, 2) ? 'domani' : '';
      if (!gruppo || (coll && x.assegnataA !== io.id)) return;
      const chiave = 'attivita:' + x.id + ':' + g;
      if (usate[chiave]) return;
      const refs = dati.ana.referenti.filter(r => r.idSoggetto === x.idCliente);
      const r = refs.find(y => y.whatsappOk) || refs.find(y => y.email) || refs[0];
      if (!r) return;
      out[gruppo].push(proposta(dati, chiave, 'promemoria_appuntamento', (gruppo === 'oggi' ? 'Domani' : 'Dopodomani') + ' alle ' + ora(x.inizio) + ' · ' + x.titolo + (x.luogo ? ' · ' + x.luogo : ''), r.whatsappOk ? 'whatsapp' : 'email', r, { idAttivita: x.id }));
    });
    // I rapportini da firmare da più di 7 giorni: dal 06/11/2026 niente firma, niente più proposte (come il server,
    // server/src/azioni/comunicazioni.js; il modello resta per un messaggio scritto a mano).
    // Il promemoria di pagamento (§3.15): solo con fatturazione 2 e costi, al referente che paga.
    const vedePag = Number(dati.permessiIo.fatturazione) >= 2 && Number(dati.permessiIo.costi) >= 1;
    if (vedePag && dati.f4) {
      dati.f4.fatture.filter(f => f.tipo === 'fattura' && f.stato === 'emessa' && f.residuo > 0 && f.scaduta && !f7.sollecitiNo[f.id]).forEach(f => {
        const chiave = 'fattura:' + f.id + ':1';
        if (usate[chiave]) return;
        const refs = dati.ana.referenti.filter(r => r.idSoggetto === f.idCliente);
        const r = refs.find(y => y.pagamenti) || refs[0];
        if (r) out.proposti.push(Object.assign(proposta(dati, chiave, 'promemoria_pagamento', 'Fattura ' + f.numero + ' · scaduta', r.pagamenti && r.whatsappOk ? 'whatsapp' : 'email', r, { idFattura: f.id }), { importoResiduo: f.residuo }));
      });
    }
    out.preparati = f7.comunicazioni.filter(c => c.canale === 'whatsapp' && c.stato === 'preparato' && (!coll || c.chi === io.nome)).map(c => rigaCom(dati, c));
    return out;
  }

  function portaleCliente(dati, id) {
    const f7 = prepara(dati);
    const c = f7.clienti[id] || (f7.clienti[id] = { portale: false, importi: false, regole: regoleBase() });
    const refs = dati.ana.referenti.filter(r => r.idSoggetto === id);
    return { ok: true, cliente: { id, nome: nomeCliente(dati, id), portale: c.portale, importi: c.importi, regole: copia(c.regole) },
      referenti: refs.map(pubblico),
      pubblicati: f7.pubblicati.filter(p => p.soggetto === id && !p.tolta).map(p => rigaPub(dati, p)),
      caricamenti: f7.caricamenti.filter(x => x.soggetto === id).map(x => rigaCar(dati, x)),
      accessi: f7.accessi.filter(x => x.soggetto === id).map(x => rigaAcc(dati, x)) };
  }
  const rigaPub = (dati, p) => ({ id: p.id, tipo: p.tipo, rif: p.rif, titolo: p.titolo, pubblicataIl: p.pubblicataIl, origine: p.origine, vistoIl: p.vistoIl, vistoDa: p.vistoDa, daFirmare: p.daFirmare, cliente: nomeCliente(dati, p.soggetto), idCliente: p.soggetto });
  const rigaCar = (dati, x) => ({ id: x.id, titolo: x.titolo, nota: x.nota, nome: x.nome, byte: x.byte, referente: x.referente, creato: x.creato, stato: x.stato, motivo: x.motivo || '', cliente: nomeCliente(dati, x.soggetto), idCliente: x.soggetto, ticket: x.ticket, idFile: x.idFile });
  const rigaAcc = (dati, x) => ({ quando: x.quando, cliente: nomeCliente(dati, x.soggetto), referente: x.referente || 'Email non riconosciuta', frase: x.frase, oggetto: x.oggetto, esito: x.esito, dispositivo: x.dispositivo });

  function esegui(dati, azione, b) {
    const f7 = prepara(dati);
    const oggi = dati.oggi;
    const adesso = oggi + 'T' + new Date().toTimeString().slice(0, 8);
    const coll = dati.io.ruolo === 'collaboratore';
    const nonCollegato = f7.stato.collegato === 'non_collegato';
    switch (azione) {
      // ------------------------------------------------------------- portale
      case 'portale':
        return { ok: true, stato: copia(f7.stato), conteggi: { daGuardare: f7.daGuardare.length, clienti: Object.keys(f7.clienti).filter(k => f7.clienti[k].portale).length,
          referenti: dati.ana.referenti.filter(r => r.portale).length, pubblicati: f7.pubblicati.filter(p => !p.tolta).length, accessiOggi: f7.accessi.filter(x => x.quando.slice(0, 10) === oggi).length },
          daGuardare: copia(f7.daGuardare) };
      case 'segnaVistoPortale': f7.daGuardare = f7.daGuardare.filter(x => String(x.id) !== String(b.id)); return { ok: true };
      case 'portaleCliente': return portaleCliente(dati, b.idCliente);
      case 'salvaPortaleCliente': {
        const c = f7.clienti[b.idCliente] || (f7.clienti[b.idCliente] = { portale: false, importi: false, regole: regoleBase() });
        if (b.portale !== undefined) c.portale = !!b.portale;
        if (b.importi !== undefined) c.importi = !!b.importi;
        if (b.regole) Object.assign(c.regole, b.regole);
        const s = dati.ana.soggetti.find(x => x.id === b.idCliente);
        if (s) s.portale = c.portale;
        return portaleCliente(dati, b.idCliente);
      }
      case 'invitaReferente': {
        if (nonCollegato) return { ok: false, errore: 'Il portale non è collegato: manca l\'indirizzo', nonCollegato: true };
        if (!f7.stato.attivo) return { ok: false, errore: 'Il portale è spento', spento: true };
        let r = b.idReferente ? referente(dati, b.idReferente) : null;
        if (!r && b.idCliente) {
          const cli = dati.ana.soggetti.find(x => x.id === b.idCliente) || {};
          r = { id: ++f7.prossimoRef, idSoggetto: b.idCliente, nome: cli.nome, ruolo: 'Cliente privato', telefono: cli.telefono || '', email: cli.email || '', note: '', ordine: 9, whatsappOk: false, pagamenti: true };
          dati.ana.referenti.push(r);
        }
        if (!r) return { ok: false, errore: 'Referente non trovato' };
        if (!r.email) return { ok: false, errore: 'Il referente non ha l\'email: scrivila prima' };
        Object.assign(r, { portale: true, statoPortale: r.statoPortale === 'Attivo' ? 'Attivo' : 'Invitato', permessi: b.permessi || r.permessi || K.permessiBase(false), sedi: b.sedi === undefined ? r.sedi : b.sedi, invitatoIl: adesso });
        const c = f7.clienti[r.idSoggetto] || (f7.clienti[r.idSoggetto] = { portale: true, importi: false, regole: regoleBase() });
        c.portale = true;
        return { ok: true, referente: pubblico(r), email: 'mandata' };
      }
      case 'salvaAccessoReferente': {
        const r = referente(dati, b.idReferente);
        if (!r) return { ok: false, errore: 'Referente non trovato' };
        if (b.permessi) r.permessi = Object.assign({}, r.permessi, b.permessi);
        if (b.sedi !== undefined) r.sedi = b.sedi;
        if (b.avvisiEmail !== undefined) r.avvisiEmail = !!b.avvisiEmail;
        return { ok: true, referente: pubblico(r) };
      }
      case 'togliAccessoReferente': {
        const r = referente(dati, b.idReferente);
        if (r) Object.assign(r, { portale: false, statoPortale: 'Tolto' });
        return { ok: true };
      }
      case 'pubblica': {
        if (nonCollegato) return { ok: false, errore: 'Il portale non è collegato: manca l\'indirizzo', nonCollegato: true };
        const g = trovaCosa(dati, b.tipo, b.id);
        if (!g) return { ok: false, errore: 'Non trovato' };
        const c = f7.clienti[g.idCliente];
        if (!c || !c.portale) return { ok: false, errore: nomeCliente(dati, g.idCliente) + ' non ha il portale acceso' };
        if (g.bozza) return { ok: false, errore: g.bozza };
        if (f7.pubblicati.some(p => !p.tolta && p.tipo === b.tipo && String(p.rif) === String(b.id))) return { ok: false, errore: 'È già nel portale' };
        const vedranno = dati.ana.referenti.filter(r => r.idSoggetto === g.idCliente && r.portale && Number((r.permessi || {})[{ preventivo: 'preventivi', rapportino: 'rapportini', fattura: 'fatture', documento: 'documenti', ticket: 'richieste', contratto: 'preventivi' }[b.tipo]]) > 0).map(r => r.nome);
        if (!vedranno.length && !b.conferma) return { ok: false, serveConferma: true, frase: 'Nessun referente di ' + nomeCliente(dati, g.idCliente) + ' può vedere ' + (K.NOMI_PUBBLICAZIONE[b.tipo] || 'questa cosa').toLowerCase() };
        const p = { id: ++f7.prossimaPub, soggetto: g.idCliente, tipo: b.tipo, rif: b.id, titolo: g.titolo, pubblicataIl: adesso, origine: 'mano', vistoIl: '', vistoDa: '', daFirmare: !!b.daFirmare };
        f7.pubblicati.unshift(p);
        return { ok: true, pubblicazione: rigaPub(dati, p), vedranno };
      }
      case 'togliDalPortale': {
        const p = f7.pubblicati.find(x => String(x.id) === String(b.id));
        if (p) p.tolta = !b.annulla;
        return { ok: true };
      }
      case 'pubblicaPrima': return { ok: true, proposte: [] };
      case 'pubblicati': return { ok: true, pagina: 1, pagine: 1, pubblicati: f7.pubblicati.filter(p => !p.tolta && (!b.idCliente || p.soggetto === b.idCliente) && (!b.tipo || p.tipo === b.tipo) && (b.visto === undefined || b.visto === '' || (String(b.visto) === 'false' || b.visto === false ? !p.vistoIl : !!p.vistoIl))).map(p => rigaPub(dati, p)) };
      case 'caricamentiPortale': return { ok: true, caricamenti: f7.caricamenti.filter(x => (!b.stato || x.stato === b.stato) && (!b.idCliente || x.soggetto === b.idCliente)).map(x => rigaCar(dati, x)) };
      case 'accettaCaricamento': {
        const x = f7.caricamenti.find(y => String(y.id) === String(b.id));
        if (!x) return { ok: false, errore: 'Il file non c\'è più' };
        if (!b.soloTicket && !b.idCategoria) return { ok: false, errore: 'Scegli la categoria' };
        Object.assign(x, { stato: 'accettato' });
        f7.daGuardare = f7.daGuardare.filter(d => !(d.tipo === 'caricamento' && d.collegamento && String(d.collegamento.id) === String(x.id)));
        return { ok: true, documento: { id: 900 + x.id, titolo: b.titolo || x.titolo } };
      }
      case 'rifiutaCaricamento': {
        if (!String(b.motivo || '').trim()) return { ok: false, errore: 'Scrivi il motivo: lo vede il cliente' };
        const x = f7.caricamenti.find(y => String(y.id) === String(b.id));
        if (x) Object.assign(x, { stato: 'rifiutato', motivo: b.motivo });
        f7.daGuardare = f7.daGuardare.filter(d => !(d.tipo === 'caricamento' && d.collegamento && String(d.collegamento.id) === String(b.id)));
        return { ok: true };
      }
      case 'accessiPortale': return { ok: true, pagina: 1, pagine: 1, accessi: f7.accessi.filter(x => !b.idCliente || x.soggetto === b.idCliente).map(x => rigaAcc(dati, x)) };
      case 'anteprimaPortale': return { ok: false, errore: 'Nei dati di esempio il portale non si apre: provalo coi dati veri' };
      case 'controllaPortale': return { ok: true, collegato: f7.stato.collegato, ms: 412 };
      case 'spegniPortale':
        if (!b.conferma) return { ok: false, serveConferma: true, frase: 'Il portale si spegne per tutti i clienti: chi è dentro esce subito. Si riaccende da qui.' };
        f7.stato.attivo = false;
        dati.ana.impostazioni.PORTALE_ATTIVO = false;
        return { ok: true };
      case 'rispondiNelPortale': {
        const c = com(++f7.prossimaCom, adesso, 'portale', 'uscita', 'messaggio', 'C002', 51, '', b.testo, 'mandato', { tipo: 'ticket', id: b.idTicket, etichetta: 'TK/2026/' + String(b.idTicket).padStart(4, '0') }, dati.io.nome);
        f7.comunicazioni.unshift(c);
        return { ok: true, messaggio: rigaCom(dati, c) };
      }
      case 'mostraNelPortale': return { ok: true, ticket: { id: b.idTicket, portale: { visibile: !!b.visibile } } };

      // ------------------------------------------------------------- comunicazioni
      case 'comunicazioni': {
        let l = f7.comunicazioni.filter(c => (!b.idCliente || c.cliente === b.idCliente) && (!b.canale || c.canale === b.canale) && (!b.stato || c.stato === b.stato)
          && (!b.idCommessa || (c.riferimento && c.riferimento.commessa === b.idCommessa)) && (!coll || c.chi === dati.io.nome));
        if (b.testo) { const t = String(b.testo).toLowerCase(); l = l.filter(c => (c.testo + ' ' + c.oggetto).toLowerCase().indexOf(t) >= 0); }
        const r = { ok: true, pagina: 1, pagine: 1, quante: l.length, comunicazioni: l.map(c => rigaCom(dati, c)) };
        if (b.conAccessi && b.idCliente) r.accessi = f7.pubblicati.filter(p => p.soggetto === b.idCliente && p.vistoIl).map(p => ({ quando: p.vistoIl, frase: p.vistoDa + ' ha visto il ' + p.titolo.charAt(0).toLowerCase() + p.titolo.slice(1) }));
        return r;
      }
      case 'daMandare': return daMandare(dati);
      case 'preparaMessaggio': return prepara1(dati, b);
      case 'salvaMessaggio': {
        const m = b.messaggio || {};
        const gia = f7.comunicazioni.find(c => c.idLocale && c.idLocale === m.idLocale);
        if (gia) return { ok: true, comunicazione: rigaCom(dati, gia) };
        const r = m.idReferente ? referente(dati, m.idReferente) : null;
        if (m.canale === 'whatsapp' && r && !r.whatsappOk) {
          if (!m.segnaSi) return { ok: false, errore: r.nome + ' non ha detto di sì a WhatsApp', serveConferma: true, segnaSi: true };
          r.whatsappOk = true;
        }
        if (m.canale === 'whatsapp' && String(m.testo || '').length > 1000) return { ok: false, errore: 'Il messaggio è più lungo di 1.000 caratteri: accorcialo' };
        const c = com(++f7.prossimaCom, m.quando || adesso, m.canale, m.direzione || 'uscita', m.tipo || m.modello || 'libero', r ? r.idSoggetto : m.idCliente, r ? r.id : null, m.a || '', m.testo, m.stato || 'preparato', null, dati.io.nome);
        c.idLocale = m.idLocale;
        f7.comunicazioni.unshift(c);
        if (m.proposta) f7.usate[m.proposta] = true;
        return { ok: true, comunicazione: rigaCom(dati, c) };
      }
      case 'segnaMandato': {
        const c = f7.comunicazioni.find(x => String(x.id) === String(b.id));
        if (!c) return { ok: false, errore: 'Messaggio non trovato' };
        if (b.mandato) { c.stato = 'mandato'; c.mandatoIl = adesso; }
        return { ok: true, comunicazione: rigaCom(dati, c) };
      }
      case 'mandaEmail': {
        const m = b.messaggio || {};
        const r = m.idReferente ? referente(dati, m.idReferente) : null;
        const c = com(++f7.prossimaCom, adesso, 'email', 'uscita', m.modello || 'libero', r ? r.idSoggetto : m.idCliente, r ? r.id : null, m.a, m.testo, 'mandato', null, dati.io.nome, m.oggetto);
        f7.comunicazioni.unshift(c);
        if (m.proposta) f7.usate[m.proposta] = true;
        return { ok: true, comunicazione: rigaCom(dati, c) };
      }
      case 'nonMandare': if (b.annulla) delete f7.usate[b.proposta]; else f7.usate[b.proposta] = true; return { ok: true };
      case 'segnaWhatsapp': {
        const r = referente(dati, b.idReferente);
        if (!r) return { ok: false, errore: 'Referente non trovato' };
        r.whatsappOk = !!b.ok;
        r.whatsappOkIl = b.ok ? adesso : '';
        return { ok: true, referente: Object.assign({}, r) };
      }
      case 'modelliMessaggi': return { ok: true, modelli: copia(f7.modelli).sort((x, y) => x.ordine - y.ordine), segnaposti: copia(K.SEGNAPOSTI) };
      case 'salvaModelloMessaggio': {
        const m = b.modello || {};
        const e = K.erroreModello(m);
        if (e) return { ok: false, errore: e.errore };
        let x = m.chiave ? f7.modelli.find(y => y.chiave === m.chiave) : null;
        if (!x) { x = { chiave: 'modello_' + (f7.modelli.length + 1), sistema: false, attivo: true, ordine: f7.modelli.length + 1 }; f7.modelli.push(x); }
        Object.assign(x, { nome: m.nome, canale: m.canale, uso: m.uso, oggetto: m.oggetto || '', testo: m.testo, attivo: m.attivo === undefined ? x.attivo : !!m.attivo, modificato: adesso, modificatoDa: dati.io.id });
        return { ok: true, modello: copia(x) };
      }
      case 'togliModelloMessaggio': {
        const x = f7.modelli.find(y => y.chiave === b.chiave);
        if (x && x.sistema) return { ok: false, errore: 'I modelli di Wisper non si tolgono: si spengono' };
        f7.modelli = f7.modelli.filter(y => y.chiave !== b.chiave);
        return { ok: true };
      }
      case 'nonSollecitare': if (b.motivo) f7.sollecitiNo[b.idFattura] = b.motivo; else delete f7.sollecitiNo[b.idFattura]; return { ok: true, fattura: { id: b.idFattura, sollecitiNo: b.motivo || '' } };
      case 'allegaCopiaFattura': return { ok: true, fattura: { id: b.id, copia: { id: 'esempiocopia' + b.id, url: '', nome: b.nome || 'copia.pdf' } } };

      // ------------------------------------------------------------- notifiche
      case 'notifiche': {
        const l = f7.notifiche.filter(n => !b.soloNuove || !n.letta);
        return { ok: true, nuove: f7.notifiche.filter(n => !n.letta).length, notifiche: copia(l) };
      }
      case 'segnaLette':
        f7.notifiche.forEach(n => { if (b.tutte || (b.ids || []).map(String).indexOf(String(n.id)) >= 0) n.letta = true; });
        return { ok: true, nuove: f7.notifiche.filter(n => !n.letta).length };
      case 'salvaPreferenzeNotifiche': return { ok: true };
      default: return null;
    }
  }

  /** La cosa da pubblicare nei dati di esempio: cliente, titolo, e se è una bozza. */
  function trovaCosa(dati, tipo, id) {
    if (tipo === 'preventivo') {
      const p = (dati.preventivi || []).find(x => String(x.id) === String(id));
      if (!p) return null;
      const et = p.numero + (p.revisione ? ' rev. ' + p.revisione : '');
      return { idCliente: p.idCliente, titolo: 'Preventivo ' + et, bozza: p.stato === 'BOZZA' ? 'Il preventivo ' + et + ' è in bozza: si pubblica quando lo mandi' : '' };
    }
    if (tipo === 'rapportino') {
      const r = dati.rapportini.find(x => x.id === id);
      return r ? { idCliente: r.idCliente, titolo: 'Rapportino del ' + dataIt(r.data) } : null;
    }
    if (tipo === 'fattura' && dati.f4) {
      const f = dati.f4.fatture.find(x => String(x.id) === String(id));
      return f ? { idCliente: f.idCliente, titolo: 'Fattura ' + f.numero, bozza: f.stato !== 'emessa' ? 'La fattura non è emessa: si pubblica dopo' : '' } : null;
    }
    return null;
  }

  /** In più sulle risposte di sempre (§10.4): io, anagrafiche, i preventivi e i rapportini pubblicati, la Dashboard. */
  function arricchisci(dati, azione, risposta) {
    if (!risposta || risposta.ok === false) return risposta;
    const f7 = prepara(dati);
    const p = dati.permessiIo;
    if (azione === 'io' && risposta.interfaccia) {
      Object.assign(risposta.interfaccia, { portaleCollegato: f7.stato.collegato === 'si', portaleAttivo: f7.stato.attivo, whatsappApp: 'chiedi', whatsappTestoMax: 1000,
        notificheNuove: f7.notifiche.filter(n => !n.letta).length });
    }
    if (azione === 'anagrafiche') {
      risposta.referenti = (risposta.referenti || []).map(r => { const x = Object.assign({}, r); if (!(Number(p.portale) >= 1)) delete x.statoPortale; return x; });
      risposta.clienti = (risposta.clienti || []).map(c => Object.assign({}, c, { portale: !!(f7.clienti[c.id] && f7.clienti[c.id].portale) }));
    }
    if (azione === 'preventivo' && risposta.preventivo) {
      risposta.preventivo = Object.assign({}, risposta.preventivo);
      const pub = f7.pubblicati.find(x => x.tipo === 'preventivo' && String(x.rif) === String(risposta.preventivo.id) && !x.tolta);
      risposta.preventivo.portale = pub ? { pubblicato: true, id: pub.id, vistoIl: pub.vistoIl, vistoDa: pub.vistoDa } : { pubblicato: false };
    }
    if (azione === 'rapportini' && risposta.rapportini) {
      risposta.rapportini = risposta.rapportini.map(r0 => {
        const r = Object.assign({}, r0);
        const pub = f7.pubblicati.find(x => x.tipo === 'rapportino' && x.rif === r.id && !x.tolta);
        r.portale = pub ? { pubblicato: true, id: pub.id, daFirmare: pub.daFirmare, vistoIl: pub.vistoIl } : { pubblicato: false };
        return r;
      });
    }
    if (azione === 'salvaImpostazioni') {
      const imp = dati.ana.impostazioni;
      f7.stato.attivo = imp.PORTALE_ATTIVO === true || imp.PORTALE_ATTIVO === 'true';
      f7.stato.indirizzo = imp.PORTALE_INDIRIZZO || '';
      f7.stato.collegato = imp.PORTALE_INDIRIZZO ? 'si' : 'non_collegato';
    }
    if (azione === 'dashboard') {
      const n = risposta.numeri = risposta.numeri || {};
      const dm = Number(p.comunicazioni) >= 1 ? daMandare(dati) : null;
      if (dm) n.comunicazioni = { daMandareOggi: dm.oggi.length, preparati: dm.preparati.length, proposti: dm.proposti.length };
      if (Number(p.portale) >= 1) {
        n.portale = { daGuardare: f7.daGuardare.length, richiesteNuove: f7.daGuardare.filter(x => x.tipo === 'richiesta').length, accettati: 0, firmati: 0,
          caricamenti: f7.caricamenti.filter(x => x.stato === 'da_guardare').length, messaggi: f7.daGuardare.filter(x => x.tipo === 'messaggio').length,
          clienti: Object.keys(f7.clienti).filter(k => f7.clienti[k].portale).length, referenti: dati.ana.referenti.filter(r => r.portale).length, collegato: f7.stato.collegato };
        risposta.urgenti = (risposta.urgenti || []).concat(f7.daGuardare.filter(x => x.tipo === 'richiesta' && /urgente/i.test(x.titolo)).map(x => ({ gravita: 'urgente', tipo: 'portale',
          titolo: 'Richiesta urgente dal portale: ' + x.titolo.replace(/^Richiesta urgente:\s*/, ''), dettaglio: x.dettaglio, collegamento: x.collegamento })));
        const car = f7.caricamenti.filter(x => x.stato === 'da_guardare');
        if (car.length) risposta.pianificare = (risposta.pianificare || []).concat([{ gravita: 'attenzione', tipo: 'portale', unita: 'file', quanto: car.length,
          titolo: car.length === 1 ? '1 file dai clienti da guardare' : car.length + ' file dai clienti da guardare', dettaglio: car.map(x => x.nome + ' · ' + nomeCliente(dati, x.soggetto)).join(', '),
          collegamento: { pagina: 'portale', filtro: { segmento: 'daguardare' } } }]);
        f7.daGuardare.filter(x => x.tipo === 'messaggio').forEach(x => { risposta.settimana = (risposta.settimana || []).concat([{ gravita: 'attenzione', tipo: 'messaggio', titolo: x.titolo, dettaglio: x.dettaglio, collegamento: x.collegamento }]); });
      }
      if (dm && dm.oggi.length) risposta.settimana = [{ gravita: 'attenzione', tipo: 'messaggio', unita: 'messaggi', quanto: dm.oggi.length,
        titolo: dm.oggi.length === 1 ? '1 messaggio da mandare oggi' : dm.oggi.length + ' messaggi da mandare oggi', dettaglio: dm.oggi.map(x => 'Promemoria a ' + x.a.nome).join(', '),
        collegamento: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } } }].concat(risposta.settimana || []);
      if (dm && dm.proposti.some(x => x.tipo === 'promemoria_pagamento')) {
        const x = dm.proposti.find(y => y.tipo === 'promemoria_pagamento');
        risposta.pianificare = (risposta.pianificare || []).concat([{ gravita: 'soldi', tipo: 'pagamento', titolo: 'Promemoria di pagamento da preparare: ' + x.dettaglio.split(' · ')[0].toLowerCase(),
          dettaglio: x.a.cliente + ' · scaduta', collegamento: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } } }]);
      }
    }
    return risposta;
  }

  const Esempio7 = { SERVE7, prepara, esegui, arricchisci, MODELLI };
  if (typeof module !== 'undefined' && module.exports) module.exports = Esempio7;
  else radice.WisperEsempio7 = Esempio7;
})(typeof window !== 'undefined' ? window : globalThis);
