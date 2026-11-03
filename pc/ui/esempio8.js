/*
 * Wisper Ufficio: i dati di esempio della fase 8 (integrazioni, amministrazione completa, controlli finali;
 * docs/gestionale/fase8.md, §0 sopra a tutto).
 *
 * Si aggiungono a quelli di esempio.js e esempio7.js (lo stesso studio). Lo stato dei collegamenti è quello del
 * prototipo: la Verifica della partita IVA in Errore (il servizio europeo non risponde), il postino e la copia fuori
 * casa Collegati, la porta Google e il portale Da configurare (§0.1: finché Andrea non fa i passi). Niente esce da qui:
 * Prova adesso, Manda una prova, l'indirizzo del calendario e Esporta tutto rispondono come il server, senza rete.
 */
(function (radice) {
  'use strict';

  const R = radice.WisperRegole || (typeof require === 'function' ? require('./regole.js') : null);
  // 03/11/2026: le 19 funzioni con le dipendenze (come server/src/azioni/amministrazione8.js).
  const Q8 = radice.WisperRegoleFase8 || (typeof require === 'function' ? require('./regole-fase8.js') : null);
  const copia = o => JSON.parse(JSON.stringify(o));
  const due = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const giorno = (oggi, delta) => { const d = new Date(oggi + 'T12:00:00'); d.setDate(d.getDate() + delta); return iso(d); };
  const istante = (oggi, delta, ora) => giorno(oggi, delta) + 'T' + ora + ':00';
  const adesso = () => { const d = new Date(); return iso(d) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes()) + ':' + due(d.getSeconds()); };
  const titolare = d => d.io.ruolo === 'titolare';
  const NONPERMESSO = cosa => ({ ok: false, errore: 'Non hai il permesso per ' + cosa + ': chiedi al titolare', permesso: false });

  /** Le azioni della fase 8 che rispondono i dati di esempio, col modulo e il livello (come il server, §13). 'titolare' = solo lui. */
  const SERVE8 = {
    integrazioni: ['integrazioni', 1], integrazione: ['integrazioni', 1], provaIntegrazione: ['integrazioni', 2], salvaIntegrazione: ['integrazioni', 2],
    esportaCalendario: ['attivita', 1], feedCalendario: ['attivita', 1], nuovoFeed: ['attivita', 1], revocaFeed: ['attivita', 1],
    letturaFile: ['documenti', 1], rileggiFile: ['documenti', 2],
    esportaTutto: 'titolare', esportazioni: 'titolare',
    leggiImport: ['clienti', 2], controllaImport: ['clienti', 2], importaSoggetti: ['clienti', 2], archiviaImportati: ['clienti', 2], importazioni: ['clienti', 1],
    salvaRiquadri: null, nascondiVoce: null, mostraNascoste: null,
    impostazioniGenerali: ['amministrazione', 1], funzioni: null, salvaFunzioni: 'titolare',
    notifichePreferenze: null, salvaNotifichePreferenze: null, provaAvvisi: ['amministrazione', 2],
    sicurezza: ['amministrazione', 1], scollegaTutti: 'titolare', accendiCifratura: 'titolare', spegniCifratura: 'titolare',
    provaCopia: ['amministrazione', 2], segnaRipristino: ['amministrazione', 2], statoSistema: ['amministrazione', 1],
    controlliFinali: ['amministrazione', 1], segnaControllo: ['amministrazione', 2], segnaCambio: 'titolare',
  };

  // Il catalogo dei collegamenti (§3.1, §4.2, §0.1-0.2): le frasi le manda il server, qui quelle del prototipo.
  function catalogo(oggi) {
    const c = (dg, ora, esito, ms, testo) => ({ quando: istante(oggi, dg, ora), esito, millisecondi: ms, testo });
    return [
      { chiave: 'postino', nome: 'Postino', cosa: 'Email, copie su Drive e foglio di ogni notte', gruppo: 'collegati', stato: 'collegato', controllato: istante(oggi, 0, '10:00'), millisecondi: 412, ogniMinuti: 60,
        esito: 'Risponde · Google lascia mandare ancora 86 email oggi', account: 'il Gmail del foglio di Wisper', esce: 'Email e PDF ai clienti; la copia del database; le schede del foglio',
        costo: '0 € (Gmail: 100 destinatari al giorno)', regole: 'Google · per il Gmail gratuito nessun accordo sul trattamento dei dati trovato', provaAdesso: true,
        controlli: [c(0, '10:00', 'ok', 412, 'Risponde'), c(0, '09:00', 'ok', 388, 'Risponde'), c(0, '08:00', 'ok', 455, 'Risponde'), c(0, '07:00', 'ok', 401, 'Risponde')] },
      { chiave: 'vies', nome: 'Verifica della partita IVA', cosa: 'Controlla le partite IVA e propone nome e indirizzo', gruppo: 'collegati', stato: 'errore', controllato: istante(oggi, 0, '08:30'), millisecondi: 8000, ogniMinuti: 1440, erroriDiFila: 2,
        esito: 'Il servizio europeo non risponde: riprova più tardi', account: 'nessun account', esce: 'Solo la partita IVA cercata', costo: '0 €', regole: 'Servizio pubblico della Commissione europea', provaAdesso: true,
        controlli: [c(0, '08:30', 'errore', 8000, 'Il servizio europeo non risponde'), c(0, '06:00', 'errore', 8000, 'Il servizio europeo non risponde'), c(-1, '06:00', 'ok', 640, 'Partita IVA dello studio valida')] },
      { chiave: 'copiafuori', nome: 'Copia fuori casa', cosa: 'La copia di ogni notte su Drive', gruppo: 'collegati', stato: 'collegato', controllato: istante(oggi, 0, '02:31'), millisecondi: 52000, ogniMinuti: 1440,
        esito: 'Database e 3 file nuovi su Drive · cartella Wisper/Copie NAS', account: 'il Gmail del foglio di Wisper', esce: 'La copia del database e i file nuovi, non cifrati', costo: '0 € (spazio del Drive del foglio)', regole: 'Google', provaAdesso: true,
        controlli: [c(0, '02:31', 'ok', 52000, 'ok · 3 file'), c(-1, '02:30', 'ok', 49000, 'ok · 5 file')] },
      { chiave: 'aggiornamenti', nome: 'Aggiornamenti delle app', cosa: 'Le app si aggiornano da sole da GitHub', gruppo: 'collegati', stato: 'collegato', controllato: istante(oggi, 0, '06:00'), millisecondi: 310, ogniMinuti: 1440,
        esito: 'Ultima versione: telefono 0.9.0, computer 0.9.0 · 1 dispositivo è indietro', account: 'il repository pubblico di Wisper', esce: 'Niente: le app scaricano', costo: '0 €', regole: 'GitHub', provaAdesso: true,
        controlli: [c(0, '06:00', 'ok', 310, 'Elenco firmato letto'), c(-1, '06:00', 'ok', 295, 'Elenco firmato letto')] },
      { chiave: 'calendario', nome: 'Calendario in altre app', cosa: 'File da scaricare e indirizzo per il calendario del telefono', gruppo: 'collegati', stato: 'collegato', controllato: istante(oggi, 0, '09:40'), millisecondi: 38,
        esito: 'Letto dal telefono di Manuel con ICSx⁵ · 2 indirizzi', account: 'nessun account', esce: 'Niente fuori dal NAS: il telefono legge in casa', costo: '0 € (ICSx⁵: 0 € da F-Droid, circa 2 € dal Play Store)', regole: 'Formato ICS, standard RFC 5545', provaAdesso: false,
        controlli: [c(0, '09:40', 'ok', 38, 'Letto da ICSx⁵'), c(0, '08:40', 'ok', 41, 'Letto da ICSx⁵')] },
      { chiave: 'ricerca', nome: 'Cerca dentro i file', cosa: 'Cerca nel testo di PDF, Word, Excel e DXF', gruppo: 'collegati', stato: 'collegato', controllato: istante(oggi, 0, '02:52'), millisecondi: 0,
        esito: '1.240 file letti · 37 senza testo · 2 da leggere', account: 'nessun account', esce: 'Niente: il testo resta nel database del NAS', costo: '0 €', regole: 'Nessun servizio esterno', provaAdesso: true,
        controlli: [c(0, '02:52', 'ok', 0, '14 file letti'), c(-1, '02:50', 'ok', 0, '9 file letti')] },
      { chiave: 'porta', nome: 'Accesso da fuori casa (porta Google)', cosa: 'Telefoni e computer dello studio entrano da fuori casa passando dallo script del foglio', gruppo: 'collegati', stato: 'da_configurare',
        esito: 'Spenta nel .env del NAS: si accende quando lo script del foglio ha Porta.gs', account: 'il Gmail del foglio di Wisper', esce: 'Le richieste delle app passano da Google; a casa nessuna porta aperta', costo: '0 €', regole: 'Google', provaAdesso: true, controlli: [] },
      { chiave: 'portale', nome: 'Portale su internet', cosa: 'I clienti entrano nel portale da internet', gruppo: 'collegati', stato: 'da_configurare',
        esito: 'Mancano l\'indirizzo dello script del portale e il suo segreto nel .env del NAS', account: 'il Gmail del foglio di Wisper e Netlify', esce: 'Le pagine e i documenti pubblicati per ogni cliente, passando da Google', costo: '0 € (Netlify gratuito, script Google)', regole: 'Google, Netlify', provaAdesso: true, controlli: [] },
      { chiave: 'link', nome: 'Link che scade per i documenti', cosa: 'Un documento al cliente con un link di 14 giorni', gruppo: 'collegati', stato: 'da_configurare', esito: 'Si accende col portale', account: 'come il portale', esce: 'Il documento scelto', costo: '0 €', regole: 'come il portale', provaAdesso: false },
      { chiave: 'ponte', nome: 'Ponte per le versioni vecchie', cosa: 'Nelle settimane del cambio le app 0.4.0 lavorano col server', gruppo: 'collegati', stato: 'da_configurare', esito: 'Si accende la sera del cambio con PONTE_PORTA nello script del foglio', account: 'il Gmail del foglio di Wisper', esce: 'Solo le richieste delle app vecchie, dalla coda della porta Google', costo: '0 €', regole: 'Google', provaAdesso: false },
      { chiave: 'calpub', nome: 'Calendario per Google e Outlook', cosa: 'Gli impegni di Wisper in Google Calendar e in Outlook', gruppo: 'scelta', stato: 'non_collegato', esce: 'Titoli e luoghi degli appuntamenti (di base senza dettagli)', perche: 'Li leggono i server di Google e Microsoft: l\'indirizzo passa dallo script del portale', servirebbe: 'Il portale Collegato e l\'interruttore del calendario fuori casa', costo: '0 €', regole: 'Google, Microsoft' },
      { chiave: 'onedrive', nome: 'Sfogliare OneDrive e SharePoint', cosa: 'Scegliere i file di OneDrive da dentro Wisper', gruppo: 'scelta', stato: 'non_collegato', esce: 'Niente in più: Wisper legge', perche: 'Servirebbe un\'app nel Microsoft 365 di Manuel e una chiave sul NAS che legge i suoi file. I link incollati funzionano già.', servirebbe: 'App in Microsoft Entra, consenso di un amministratore, chiave da rinnovare ogni 90 giorni', costo: '0 €', regole: 'Microsoft' },
      { chiave: 'drive', nome: 'Sfogliare Google Drive', cosa: 'Scegliere i file di Drive da dentro Wisper', gruppo: 'scelta', stato: 'non_collegato', esce: 'Niente in più: Wisper legge', perche: 'Servirebbe un progetto Google Cloud e il selettore di Google, che è una pagina web. I link incollati funzionano già.', servirebbe: 'Progetto Google Cloud, verifica dell\'app', costo: '0 €', regole: 'Google' },
      { chiave: 'programma', nome: 'Programma delle fatture di Manuel', cosa: 'La bozza nasce nel programma invece di copiarla', gruppo: 'scelta', stato: 'non_collegato', esce: 'La bozza della fattura', perche: 'Prima bisogna sapere quale programma usa Manuel', servirebbe: 'Il nome del programma e la sua API', costo: 'di solito compreso nel suo piano', regole: 'del programma' },
      { chiave: 'posta365', nome: 'Email dalla posta di Manuel', cosa: 'Le email di Wisper partono dalla casella Microsoft 365 di Manuel', gruppo: 'scelta', stato: 'non_collegato', esce: 'Email e PDF ai clienti', perche: 'Dipende dal consulente privacy e da una chiave che manda posta a nome dello studio', servirebbe: 'App in Microsoft Entra col permesso di mandare posta', costo: '0 € in più · 10.000 destinatari al giorno', regole: 'Microsoft' },
      { chiave: 'workspace', nome: 'Google Workspace', cosa: 'Il postino su un account con l\'accordo sul trattamento dei dati', gruppo: 'scelta', stato: 'non_collegato', esce: 'come il postino', perche: 'Dipende dal consulente privacy', servirebbe: 'Spostare foglio e script su un account Workspace', costo: '6,80 € a utente al mese (annuale) o 8,10 € (flessibile)', regole: 'Google' },
      { chiave: 'sync', nome: 'Calendario a due vie', cosa: 'Scrivere in Wisper anche dal calendario di Google o Outlook', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Vorrebbe un indirizzo su internet per gli avvisi e due calendari che si scrivono a vicenda. Si scrive solo in Wisper.', servirebbe: 'App registrate da Google e Microsoft, verifica di Google, regole per i conflitti', costo: '0 €' },
      { chiave: 'sdi', nome: 'Invio allo SDI', cosa: 'Mandare le fatture all\'Agenzia delle Entrate da Wisper', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Le fatture le emette il programma di Manuel: Wisper le prepara', servirebbe: 'Un intermediario e la numerazione fiscale in Wisper', costo: 'Aruba circa 30 € l\'anno più il Premium; Openapi circa 0,10-0,15 € a fattura' },
      { chiave: 'banca', nome: 'Movimenti della banca', cosa: 'Leggere i movimenti del conto', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Banche e scadenze è solo scadenziario: incassi e pagamenti si segnano a mano', servirebbe: 'Un fornitore autorizzato a leggere i conti; il consenso si rifà ogni 180 giorni', costo: 'Da 0 € (solo i propri conti) a un contratto' },
      { chiave: 'estratto', nome: 'Importa l\'estratto conto', cosa: 'Leggere il file dei movimenti della banca', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Banche e scadenze è solo scadenziario', servirebbe: 'Il file della banca (CSV o CBI)', costo: '0 €' },
      { chiave: 'whatsapp', nome: 'WhatsApp Business dal server', cosa: 'Messaggi mandati e ricevuti da Wisper', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'I messaggi li manda Manuel dal suo WhatsApp: Wisper li prepara', servirebbe: 'Un numero sulla piattaforma di Meta, modelli approvati, un indirizzo su internet', costo: 'circa 0,036 $ a promemoria' },
      { chiave: 'messaggi', nome: 'Ore e spese via messaggio', cosa: 'Scrivere ore e spese in chat', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'L\'app lo fa già in meno di un minuto, anche senza rete', servirebbe: 'WhatsApp dal server o un bot Telegram', costo: 'WhatsApp come sopra; Telegram 0 €' },
      { chiave: 'assistente', nome: 'Assistente operativo', cosa: 'Domande sul gestionale scritte a parole', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'I dati dei clienti andrebbero fuori dall\'Europa; un modello sul NAS è troppo lento', servirebbe: 'Un modello in rete e un accordo sui dati', costo: 'circa 1-1,5 $ al mese per 500 domande' },
      { chiave: 'firebase', nome: 'Notifiche immediate', cosa: 'Avvisi sul telefono nello stesso istante', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Il telefono controlla ogni 15 minuti: basta, senza progetti Google né chiavi', servirebbe: 'Un progetto Firebase e una chiave sul NAS', costo: '0 €' },
      { chiave: 'paghe', nome: 'Programma paghe del consulente', cosa: 'Mandare presenze e assenze al consulente', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Non esiste un formato comune: si esporta il file per il consulente', servirebbe: 'Un formato comune', costo: '0 €' },
      { chiave: 'durc', nome: 'DURC On Line e Ispettorato', cosa: 'Scaricare il DURC, comunicare gli occasionali', gruppo: 'noncollegati', stato: 'non_collegato', perche: 'Si entra solo con SPID, CIE o CNS: un programma non può', servirebbe: 'Un accesso per i programmi, che non c\'è', costo: '0 €' },
    ];
  }

  // Le impostazioni generali (§9.4): le schede con le etichette, le unità e i limiti come li manda il server (§13.6).
  function gruppiImpostazioni(imp) {
    const v = (k, d) => (imp[k] === undefined || imp[k] === null || imp[k] === '' ? d : imp[k]);
    const n = (chiave, etichetta, unita, min, max, d, extra) => Object.assign({ chiave, etichetta, tipo: 'numero', unita, min, max, valore: v(chiave, d) }, extra || {});
    return [
      { chiave: 'lavoro', nome: 'Lavoro e approvazioni', voci: [
        { chiave: 'APPROVAZIONE', etichetta: 'Cosa va approvato', tipo: 'scelta', scelte: [['collaboratori', 'Le cose dei collaboratori'], ['tutti', 'Tutto'], ['nessuno', 'Niente']], valore: v('APPROVAZIONE', 'collaboratori'), vale: 'nuove' },
        n('ORE_GIORNALIERE', 'Ore di lavoro al giorno', 'ore', 1, 12, 8, { nomeBreve: 'Ore al giorno' }),
        { chiave: 'FESTA_PATRONO', etichetta: 'Santo patrono', tipo: 'testo', valore: v('FESTA_PATRONO', '07-01'), segnaposto: 'mm-gg' }] },
      { chiave: 'rimborsi', nome: 'Rapportini e rimborsi', voci: [
        n('EURO_KM', 'Prezzo al km per il cliente', '€/km', 0, 5, 0.76, { vale: 'nuove' }), { chiave: 'AUTO', etichetta: 'Auto', tipo: 'testo', valore: v('AUTO', '') },
        n('COSTO_ORARIO', 'Costo orario dello studio', '€/h', 0, 500, 28, { vale: 'nuove' }), n('INDENNITA_TRASFERTA', 'Indennità di trasferta al giorno', '€', 0, 500, '', { vuoto: true, vale: 'nuove' })],
        collegamenti: [{ nome: 'Veicoli e rimborso km', valore: 'Tabelle ACI ' + v('ACI_ANNO', new Date().getFullYear()), pagina: 'amministrazione', sezione: 'veicoli' }] },
      { chiave: 'preventivi', nome: 'Preventivi', voci: [n('PREVENTIVO_VALIDITA_GIORNI', 'Un preventivo vale', 'giorni', 1, 365, 30, { vale: 'nuove' })],
        collegamenti: [{ nome: 'Condizioni e testi', valore: 'Documenti › Modelli', pagina: 'documenti', sezione: 'modelli' }] },
      { chiave: 'fisco', nome: 'Fatture e banca', voci: [n('SOGLIA_CASSA', 'Saldo sotto cui il giorno è rosso', '€', 0, 1000000, 3000)],
        collegamenti: [{ nome: 'Impostazioni fiscali', valore: 'Da confermare col commercialista', pagina: 'amministrazione', sezione: 'fiscale' }, { nome: 'Conti', valore: 'Banche e scadenze', pagina: 'banche', sezione: 'conti' }] },
      { chiave: 'documenti', nome: 'Documenti e file', voci: [n('FILE_MAX_MB', 'Grandezza massima di un file', 'MB', 1, 200, 50), n('EMAIL_ALLEGATI_MAX_MB', 'Allegati per email al massimo', 'MB', 1, 25, 15),
        { chiave: 'COPIA_INVIATI', etichetta: 'Tieni una copia dei PDF mandati', tipo: 'si', valore: v('COPIA_INVIATI', true) }, n('PREAVVISO_GIORNI', 'Preavviso proposto delle scadenze', 'giorni', 1, 365, 60),
        n('CONDIVISIONE_GIORNI', 'Un link per i clienti dura', 'giorni', 1, 90, 14)] },
      { chiave: 'ticket', nome: 'Ticket e assistenza', voci: [{ chiave: 'TICKET_TEMPI', etichetta: 'Tempi dei ticket, in ore', tipo: 'tempi',
        valore: v('TICKET_TEMPI', { urgente: { presa: 1, intervento: 4 }, alta: { presa: 2, intervento: 24 }, normale: { presa: 8, intervento: 72 }, bassa: { presa: 24, intervento: 240 } }) },
      n('ANTICIPO_TICKET_GIORNI', 'Il ticket programmato nasce prima della scadenza di', 'giorni', 1, 120, 30)] },
      { chiave: 'persone', nome: 'Persone, mezzi e collaboratori', voci: [n('TARATURA_OGNI_MESI', 'Taratura proposta ogni', 'mesi', 1, 60, 12), n('TARATURA_PREAVVISO_GIORNI', 'Preavviso delle tarature', 'giorni', 1, 180, 30),
        { chiave: 'TARATURA_BLOCCO', etichetta: 'Con la taratura scaduta', tipo: 'scelta', scelte: [['avviso', 'Avviso e conferma'], ['blocco', 'Non si usa']], valore: v('TARATURA_BLOCCO', 'avviso') },
        n('DURC_GIORNI', 'Un DURC vale', 'giorni', 30, 365, 120), n('KM_TAGLIANDO_AVVISO', 'Avviso prima del tagliando', 'km', 100, 10000, 1000), n('PERSONE_CONSERVA_ANNI', 'Dati delle persone uscite tenuti per', 'anni', 1, 20, 10)],
        collegamenti: [{ nome: 'Documenti dei collaboratori, visura, esterni', valore: 'Tutte le impostazioni della fase 6', pagina: 'amministrazione', sezione: 'persone' }] },
      { chiave: 'portale', nome: 'Portale clienti', voci: [n('PORTALE_LINK_MINUTI', 'Link e codice valgono', 'minuti', 5, 60, 10), n('PORTALE_EMAIL_RISERVA', 'Email lasciate allo studio', 'al giorno', 0, 80, 20)],
        collegamenti: [{ nome: 'Indirizzo, informativa e Spegni il portale adesso', valore: imp.PORTALE_ATTIVO === false ? 'Il portale è spento' : 'Il portale è acceso', pagina: 'amministrazione', sezione: 'portale' }] },
      { chiave: 'comunicazioni', nome: 'Comunicazioni', voci: [
        { chiave: 'WHATSAPP_APP', etichetta: 'WhatsApp sul telefono', tipo: 'scelta', scelte: [['business', 'Business'], ['normale', 'Normale'], ['chiedi', 'Chiedi']], valore: v('WHATSAPP_APP', 'chiedi') },
        n('PROMEMORIA_GIORNI_PRIMA', 'Promemoria degli appuntamenti', 'giorni lavorativi prima', 0, 10, 1), n('SOLLECITO_DOPO_GIORNI', 'Primo promemoria di pagamento dopo', 'giorni', 1, 120, 7),
        n('SOLLECITO_SECONDO_GIORNI', 'Il secondo promemoria dopo', 'giorni', 1, 180, 30)] },
      { chiave: 'copie', nome: 'Spazio e copie', voci: [n('SPAZIO_AVVISO_MB', 'Avviso con lo spazio libero sotto', 'MB', 100, 1000000, 10240), n('SPAZIO_MINIMO_MB', 'Niente documenti nuovi sotto', 'MB', 100, 100000, 2048),
        n('COPIA_FUORI_MAX_MB', 'File più grandi restano solo sul NAS oltre', 'MB', 1, 25, 25), n('PROVA_COPIA_GIORNI', 'Prova automatica della copia ogni', 'giorni', 7, 90, 30),
        n('PROVA_RIPRISTINO_GIORNI', 'Ripristino a mano ogni', 'giorni', 30, 365, 90), n('ESPORTAZIONI_GIORNI', 'Il file di Esporta tutto resta', 'giorni', 1, 30, 7),
        { chiave: 'WISPER_ORA_COPIA', etichetta: 'Ora della copia', tipo: 'sola', valore: '2:30 (si cambia sul NAS)' }] },
      { chiave: 'calricerca', nome: 'Calendario e ricerca', voci: [n('CALENDARIO_GIORNI_PRIMA', 'Giorni passati nel calendario', 'giorni', 0, 365, 30), n('CALENDARIO_MESI_DOPO', 'Mesi futuri nel calendario', 'mesi', 1, 36, 12),
        { chiave: 'RICERCA_FILE', etichetta: 'Cerca anche dentro i file', tipo: 'si', valore: v('RICERCA_FILE', true) }, n('RICERCA_FILE_MAX_MB', 'Grandezza massima di un file da leggere', 'MB', 1, 100, 20)] },
    ];
  }

  // La lista di controllo (§11.2-§11.3 e Il cambio): le righe della migrazione, coi segni del prototipo.
  function controlli(oggi) {
    const f = (chiave, gruppo, testo, tipo, chi, stato, il, nota, utente) => ({ chiave, gruppo, testo, tipo, chi, stato, il: il ? giorno(oggi, il) : '', nota: nota || '', utente: utente || (stato === 'fatto' && tipo !== 'server' ? 'Andrea Gasparotto' : ''), versione: stato === 'fatto' ? 'esempio' : '' });
    return [
      f('M01.1', '01 Dashboard', 'Ogni ruolo vede le sue voci e i suoi quattro riquadri; una cosa, una voce; tetti e Tutto quello che c\'è da fare', 'automatica', 'Andrea', 'fatto', -1, 'controlli-finali.html: 1.204 prove, 0 fallite'),
      f('M01.2', '01 Dashboard', 'Ogni voce apre la pagina giusta già filtrata', 'automatica', 'Andrea', 'fatto', -1),
      f('M02.1', '02 Clienti e fornitori', 'Nuovo, cambia, archivia e ripristina; doppione per nome e partita IVA; Controlla la partita IVA', 'automatica', 'Andrea', 'fatto', -1),
      f('M02.2', '02 Clienti e fornitori', 'Importa da un file CSV ed Excel: nuovi, già presenti, da sistemare; Archivia quelli importati', 'automatica', 'Andrea', 'da_fare'),
      f('M03.1', '03 Commesse', 'Codice che continua; formato cambiato senza ricodificare; prestazioni; duplica come modello; archivia', 'automatica', 'Andrea', 'fatto', -1),
      f('M03.2', '03 Commesse', 'Costi e margine uguali alla 0.4.0 coi dati della prova generale', 'prova_generale', 'Andrea e Manuel', 'da_fare'),
      f('M05.2', '05 Attività e calendario', 'Il file importato in Google Calendar e nel classico Outlook; ICSx⁵ sull\'emulatore che si aggiorna', 'a_mano', 'Andrea', 'da_fare'),
      f('M06.2', '06 Ore e rapportini', 'Riepiloghi del mese scorso uguali ai PDF mandati', 'prova_generale', 'Andrea e Manuel', 'da_fare'),
      f('M08.2', '08 Fatturazione', 'Regole fiscali confermate dal commercialista', 'server', '', 'non_va', '', 'Non ancora confermate'),
      f('M08.3', '08 Fatturazione', 'Il prospetto passato al programma di Manuel e l\'XML emesso tornato in Wisper', 'a_mano', 'Manuel', 'da_fare'),
      f('M11.1', '11 Documenti', 'Revisioni; collegamenti OneDrive; cerca dentro i file; un file non visto non dà estratti', 'automatica', 'Andrea', 'fatto', -1),
      f('M15.2', '15 Portale clienti', 'Dal telefono in 4G: la pagina del portale su Netlify si apre e risponde; il NAS non ha porte aperte', 'a_mano', 'Andrea', 'attesa', '', 'In attesa finché il portale non è acceso'),
      f('M17.1', '17 Integrazioni', 'Nessuna integrazione in Errore', 'server', '', 'non_va', '', 'Errore: Verifica della partita IVA'),
      f('M18.1', '18 Amministrazione', 'Dati dello studio completi (partita IVA, codice fiscale, indirizzo, albo, polizza)', 'server', '', 'fatto'),
      f('M18.3', '18 Amministrazione', 'Senza logo i PDF sono identici a prima; col logo l\'intestazione è giusta in bianco e nero', 'automatica', 'Andrea', 'da_fare'),
      f('T01', 'Permessi', 'Ogni azione del server ha modulo e livello dichiarati', 'automatica', 'Andrea', 'fatto', -1),
      f('T02', 'Permessi', 'Cinque ruoli, ogni azione: non deve vedere, non deve scrivere; senza costi nessun campo dei soldi', 'automatica', 'Andrea', 'fatto', -1),
      f('T04', 'Senza rete', 'Telefono in modalità aereo: coda, letture, Serve la rete', 'a_mano', 'Andrea', 'da_fare'),
      f('T05', 'Tema scuro', 'Ogni schermata di telefono e computer in chiaro e in scuro confrontata coi prototipi', 'a_mano', 'Andrea', 'da_fare'),
      f('T11', 'Sicurezza', 'Il server interno non è su internet; copia fuori casa cifrata; nessuna password iniziale vecchia di più di 7 giorni', 'server', '', 'non_va', '', 'Copia fuori casa non cifrata'),
      f('T13', 'Copie', 'Ultima copia riuscita nelle ultime 26 ore; prova automatica degli ultimi 30 giorni riuscita', 'server', '', 'fatto'),
      f('T14', 'Copie', 'Ripristino a mano negli ultimi 90 giorni', 'server', '', 'non_va', '', 'Ultimo 92 giorni fa'),
      f('C01', 'Il cambio', 'Seconda prova generale: Tutto torna e i 10 controlli spuntati', 'prova_generale', 'Andrea e Manuel', 'da_fare'),
      f('C02', 'Il cambio', 'Code.gs col ponte incollato e Nuova versione del deployment', 'a_mano', 'Andrea', 'da_fare'),
      f('C03', 'Il cambio', 'Riepiloghi del mese mandati, niente in coda sul telefono', 'a_mano', 'Manuel', 'da_fare'),
    ];
  }

  /** I dati della fase 8, creati la prima volta che servono. */
  function prepara(dati) {
    if (dati.f8) return dati.f8;
    const oggi = dati.oggi;
    const imp = dati.ana.impostazioni;
    Object.assign(imp, Object.assign({ STUDIO_LOGO: '', STUDIO_NOME_BREVE: 'Studio GM', STUDIO_SITO: 'www.studiogm.example', PDF_LOGO: true, PDF_PIEDE: 'Iscritto al Collegio dei Periti Industriali di Vicenza n. 0000',
      MODULI_SPENTI: [], NOTIFICHE_ORA: '08:00', SESSIONE_GIORNI: 180, COPIA_CIFRATA: false, PROVA_COPIA_GIORNI: 30, PROVA_RIPRISTINO_GIORNI: 90, ESPORTAZIONI_GIORNI: 7,
      CALENDARIO_GIORNI_PRIMA: 30, CALENDARIO_MESI_DOPO: 12, CALENDARIO_PUBBLICO: false, RICERCA_FILE: true, RICERCA_FILE_MAX_MB: 20, EMAIL_AVVISI: 'manuel@esempio.it', CAMBIO: { stato: 'prima' } }, imp));
    // Tutte le numerazioni (§9.6): quelle che esempio.js non ha si aggiungono, coi loro formati.
    const num = dati.ana.numerazioni;
    [['ticket', 'TK/{AAAA}/{NNNN}', 17, true], ['contratto', 'CA/{AAAA}/{NNN}', 2, true], ['incarico', 'IN/{AAAA}/{NNN}', 4, true], ['attrezzatura', 'AT{NNN}', 12, false]].forEach(([tipo, formato, ultimo, annuale]) => {
      if (!num.some(n => n.tipo === tipo)) num.push({ tipo, formato, ultimo, annuale });
    });
    const persona = id => (dati.ana.utenti.find(u => u.id === id) || {}).nome || '';
    dati.f8 = {
      integrazioni: catalogo(oggi),
      ultimaProva: {},
      feed: [
        { id: 1, idUtente: 1, nome: 'Telefono di Manuel', cosa: { attivita: 'mie', assenze: true, scadenze: false }, dettagli: true, pubblico: false, creato: istante(oggi, -10, '10:05'), ultimoUso: istante(oggi, 0, '09:40'), agente: 'ICSx5/2.4.3 (ical4j/3.2)', letture: 214 },
        { id: 2, idUtente: 1, nome: 'Outlook in ufficio', cosa: { attivita: 'studio', assenze: true, scadenze: true }, dettagli: true, pubblico: false, creato: istante(oggi, -3, '15:20'), ultimoUso: '', agente: '', letture: 0 },
        { id: 3, idUtente: 3, nome: 'Telefono di Marco', cosa: { attivita: 'mie', assenze: false, scadenze: false }, dettagli: true, pubblico: false, creato: istante(oggi, -8, '08:00'), ultimoUso: istante(oggi, 0, '09:15'), agente: 'ICSx5/2.4.3', letture: 96 },
      ],
      prossimoFeed: 4,
      documenti: [
        { id: 101, titolo: 'Verbale verifica impianto di terra 2026', categoria: 'Verbali di verifica', idCliente: 'C002', cliente: 'Rossi Impianti Srl', statoVisto: 'Valida', revisione: 1, origine: 'file', mime: 'application/pdf', nomeFile: 'verbale-terra-2026.pdf', byte: 412000, modificato: istante(oggi, -40, '10:00'),
          testo: 'Verbale di verifica periodica. La misura della resistenza di terra è stata eseguita il 12/03/2026 con il metodo voltamperometrico.', lettura: { stato: 'letto', caratteri: 6200, pagine: 4, letto: istante(oggi, -40, '10:05') } },
        { id: 102, titolo: 'Relazione tecnica cabina MT', categoria: 'Relazioni', idCliente: 'C002', cliente: 'Rossi Impianti Srl', statoVisto: 'Valida', revisione: 2, origine: 'file', mime: 'application/pdf', nomeFile: 'relazione-cabina-mt.pdf', byte: 1840000, modificato: istante(oggi, -60, '09:00'),
          testo: 'Relazione tecnica. La verifica dell\'impianto di terra è stata eseguita il 12/03/2026 con il metodo voltamperometrico e ha dato esito positivo.', lettura: { stato: 'letto', caratteri: 18420, pagine: 12, letto: istante(oggi, -60, '09:10') } },
        { id: 103, titolo: 'Schema unifilare cabina MT rev. 2', categoria: 'Progetti e schemi', idCliente: 'C002', cliente: 'Rossi Impianti Srl', statoVisto: 'Valida', revisione: 2, origine: 'file', mime: 'image/vnd.dxf', nomeFile: 'unifilare-mt.dxf', byte: 930000, modificato: istante(oggi, -30, '16:00'),
          testo: 'QG-PE collettore di terra principale QG-PE. Interruttore generale MT.', lettura: { stato: 'letto', caratteri: 900, pagine: 0, letto: istante(oggi, -30, '16:05') } },
        { id: 104, titolo: 'Verbale DPR 462 del 2019', categoria: 'Verbali di verifica', idCliente: 'C001', cliente: 'Elettrodinamica', statoVisto: 'Valida', revisione: 1, origine: 'file', mime: 'application/pdf', nomeFile: 'dpr462-2019.pdf', byte: 2400000, modificato: istante(oggi, -300, '11:00'),
          testo: '', lettura: { stato: 'senza_testo', caratteri: 0, pagine: 0, letto: istante(oggi, -300, '11:05') } },
      ],
      esportazioni: [],
      importazioni: [{ id: 3, nomeFile: 'clienti-fatture.csv', quando: istante(oggi, -17, '15:10'), righe: 52, nuovi: 42, completati: 7, saltati: 3, utente: 'Manuel Gasparotto', archiviatiIl: '' }],
      letture: {},
      riquadri: {},
      nascoste: {},
      funzioniSpente: Array.isArray(imp.MODULI_SPENTI) ? imp.MODULI_SPENTI.slice() : [],
      notifiche: {},
      copie: [
        { nome: 'wisper-' + giorno(oggi, 0).replace(/-/g, '') + '.db', quando: istante(oggi, 0, '02:30'), byte: 86000000, provata: false },
        { nome: 'wisper-' + giorno(oggi, -1).replace(/-/g, '') + '.db', quando: istante(oggi, -1, '02:30'), byte: 85900000, provata: false },
        { nome: 'wisper-' + giorno(oggi, -31).replace(/-/g, '') + '.db', quando: istante(oggi, -31, '02:30'), byte: 84000000, provata: true },
      ],
      prove: [
        { id: 7, tipo: 'automatica', quando: istante(oggi, -31, '02:40'), copia: 'wisper-' + giorno(oggi, -31).replace(/-/g, '') + '.db', da: 'nas', esito: 'ok',
          dettagli: { integrita: 'ok', conteggi: { rapportini: [1532, 1532], soggetti: [212, 212] }, file: { provati: 20, giusti: 20 }, fuori: { md5: 'giusto' } } },
        { id: 5, tipo: 'a_mano', quando: istante(oggi, -92, '18:00'), copia: 'wisper-' + giorno(oggi, -93).replace(/-/g, '') + '.db', da: 'drive', esito: 'ok', utente: 'Andrea Gasparotto', conChiave: false, dettagli: { controlli: [true, true, true, true, true] } },
      ],
      cifrata: !!imp.COPIA_CIFRATA,
      dispositivi: [
        { id: 1, persona: 'Manuel Gasparotto', nome: 'motorola edge 60', app: 'telefono 0.9.0', ultimoUso: istante(oggi, 0, '09:58') },
        { id: 2, persona: 'Manuel Gasparotto', nome: 'PC dello studio', app: 'computer 0.9.0', ultimoUso: istante(oggi, 0, '08:12') },
        { id: 3, persona: 'Laura Bianchi', nome: 'Portatile di Laura', app: 'computer 0.9.0', ultimoUso: istante(oggi, -1, '17:40') },
        { id: 4, persona: 'Marco Rossato', nome: 'Galaxy A54', app: 'telefono 0.8.2', ultimoUso: istante(oggi, 0, '09:15'), vecchia: true },
        { id: 5, persona: 'Paola Rossi', nome: 'PC dello studio Rossi', app: 'computer 0.9.0', ultimoUso: istante(oggi, -91, '11:00') },
      ],
      controlli: controlli(oggi),
      cambio: { stato: 'prima' },
      letturaImport: null,
      persona,
    };
    return dati.f8;
  }

  // ------------------------------------------------------------------------- utili

  function daBase64(b64) {
    if (typeof Buffer !== 'undefined') return Buffer.from(String(b64 || ''), 'base64').toString('utf8');
    const bin = atob(String(b64 || ''));
    const byte = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) byte[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(byte);
  }
  function aBase64(testo) {
    if (typeof Buffer !== 'undefined') return Buffer.from(testo, 'utf8').toString('base64');
    const byte = new TextEncoder().encode(testo);
    let bin = '';
    byte.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  /** Un CSV con ; o , (le virgolette doppie come Excel). */
  function leggiCsv(testo) {
    const righe = String(testo || '').replace(/^﻿/, '').split(/\r?\n/).filter(r => r.trim());
    if (!righe.length) return [];
    const sep = (righe[0].match(/;/g) || []).length >= (righe[0].match(/,/g) || []).length ? ';' : ',';
    return righe.map(r => {
      const celle = [];
      let c = '';
      let tra = false;
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '"') { if (tra && r[i + 1] === '"') { c += '"'; i++; } else tra = !tra; } else if (ch === sep && !tra) { celle.push(c); c = ''; } else c += ch;
      }
      celle.push(c);
      return celle.map(x => x.trim());
    });
  }

  /** L'abbinamento proposto dai nomi delle intestazioni, senza badare a maiuscole, spazi e punti (§7.2). */
  function campoDa(intestazione) {
    const k = String(intestazione || '').toLowerCase().replace(/[\s._-]+/g, '');
    const m = { ragionesociale: 'nome', denominazione: 'nome', nome: 'nome', partitaiva: 'partitaIva', piva: 'partitaIva', codicefiscale: 'codiceFiscale', cf: 'codiceFiscale',
      codicedestinatario: 'codiceSdi', coddestinatario: 'codiceSdi', sdi: 'codiceSdi', pec: 'pec', email: 'email', mail: 'email', telefono: 'telefono', tel: 'telefono',
      indirizzo: 'indirizzo', cap: 'cap', citta: 'citta', città: 'citta', comune: 'citta', provincia: 'provincia', prov: 'provincia', nazione: 'nazione', note: 'note', tipo: 'tipo' };
    return m[k] || '';
  }

  function controllaRighe(dati, l, colonne, tipo) {
    const campi = colonne.map(c => c.campo || '');
    const nuovi = [];
    const completati = [];
    const daSistemare = [];
    l.righe.forEach((celle, i) => {
      const s = {};
      campi.forEach((c, j) => { if (c) s[c] = celle[j] || ''; });
      const riga = i + 2;
      if (!String(s.nome || '').trim()) { daSistemare.push({ riga, nome: '', errore: 'Nome: scrivi il nome o la ragione sociale' }); return; }
      if (s.partitaIva && R.errorePartitaIva(s.partitaIva)) { daSistemare.push({ riga, nome: s.nome, errore: 'Partita IVA: il numero non torna, controlla le cifre' }); return; }
      if (s.cap && !/^\d{5}$/.test(s.cap)) { daSistemare.push({ riga, nome: s.nome, errore: 'CAP: deve avere 5 cifre' }); return; }
      const gia = dati.ana.soggetti.find(x => (s.partitaIva && x.partitaIva === s.partitaIva) || R.norm(x.nome) === R.norm(s.nome));
      if (gia) {
        const vuoti = Object.keys(s).filter(k => k !== 'nome' && k !== 'tipo' && s[k] && !gia[k]);
        completati.push({ riga, nome: gia.nome, id: gia.id, campi: vuoti, valori: s });
      } else nuovi.push({ riga, nome: s.nome, valori: s, tipo: tipo === 'colonna' ? (/forn/i.test(s.tipo || '') ? 'fornitori' : 'clienti') : tipo });
    });
    return { nuovi, completati, daSistemare };
  }

  /** Le voci di sistema e le cose della fase 8 nella Dashboard (§8.7), coi campi nuovi (§13.5). */
  function vociFase8(dati, f8) {
    const p = dati.permessiIo;
    const sistema = titolare(dati) || R.puo(p, 'amministrazione', 2);
    const out = { urgenti: [], settimana: [], pianificare: [] };
    if (!sistema) return out;
    f8.integrazioni.filter(i => i.stato === 'errore').forEach(i => out.settimana.push({ gravita: 'attenzione', tipo: 'sistema', oggetto: 'integrazione:' + i.chiave, famiglia: 'sistema', area: 'sistema',
      titolo: 'Errore: ' + i.nome, dettaglio: i.esito, collegamento: { pagina: 'integrazione', id: i.chiave } }));
    const aMano = f8.prove.filter(x => x.tipo === 'a_mano')[0];
    const giorni = aMano ? Math.round((new Date(dati.oggi + 'T12:00:00') - new Date(aMano.quando.slice(0, 10) + 'T12:00:00')) / 86400000) : null;
    if (giorni === null || giorni >= 90) out.pianificare.push({ gravita: 'info', tipo: 'sistema', oggetto: 'ripristino', famiglia: 'sistema', area: 'sistema',
      titolo: 'Prova il ripristino di una copia: l\'ultima volta è stata ' + giorni + ' giorni fa', dettaglio: 'Copie e ripristino · la fa Andrea sul suo computer', collegamento: { pagina: 'amministrazione', filtro: { sezione: 'copie' } } });
    const vecchie = f8.dispositivi.filter(d => d.vecchia);
    if (vecchie.length) out.pianificare.push({ gravita: 'info', tipo: 'sistema', oggetto: 'versioni', famiglia: 'sistema', area: 'sistema',
      titolo: vecchie.length === 1 ? '1 dispositivo ha una versione vecchia di Wisper' : vecchie.length + ' dispositivi hanno una versione vecchia di Wisper',
      dettaglio: vecchie.map(d => d.nome + ': ' + d.app.split(' ')[1]).join(', ') + ' · ultima 0.9.0', collegamento: { pagina: 'amministrazione', filtro: { sezione: 'stato' } } });
    if (f8.cambio.stato === 'prima' || f8.cambio.stato === 'prova') {
      const n = f8.controlli.filter(c => c.gruppo === 'Il cambio' && c.stato !== 'fatto').length;
      if (n) out.pianificare.push({ gravita: 'info', tipo: 'sistema', oggetto: 'controlli', famiglia: 'sistema', area: 'sistema', titolo: n + ' controlli della lista prima del cambio da fare',
        dettaglio: 'Amministrazione › Lista di controllo', collegamento: { pagina: 'amministrazione', filtro: { sezione: 'controlli' } } });
    }
    return out;
  }

  const AREE_TIPO = { ticket: 'documenti', intervento: 'documenti', documento: 'documenti', scadenza: 'documenti', contratto: 'documenti', fattura: 'soldi', fatturare: 'soldi', fatturazione: 'soldi', cassa: 'soldi', rimborsi: 'soldi',
    impegno: 'soldi', pagamento: 'soldi', fiscale: 'soldi', conto: 'soldi', ricevuta: 'soldi', persona: 'persone', assenza: 'persone', mezzo: 'persone', strumento: 'persone', prestito: 'persone', guasto: 'persone', qualifica: 'persone',
    visita: 'persone', collaboratore: 'persone', incarico: 'persone', veicoli: 'persone', portale: 'clienti', messaggio: 'clienti', preventivo: 'clienti', preventivi: 'clienti', sdi: 'clienti', cliente: 'clienti', sistema: 'sistema' };

  /** Il numero di un riquadro dai numeri che la Dashboard di esempio ha già (le fasi 1-7), o quelli del prototipo. */
  function numeroRiquadro(chiave, numeri, dati) {
    const n = numeri || {};
    const s = n.soldi || {};
    const t = n.ticket || {};
    const pe = n.persone || {};
    const me = n.mezzi || {};
    const co = n.commesse || {};
    const euro = (x, d) => ({ numero: typeof x === 'number' ? x : d, unita: 'euro' });
    const conta = (x, d) => ({ numero: typeof x === 'number' ? x : d, unita: '' });
    switch (chiave) {
      case 'daFatturare': return euro(s.daFatturare, 2180.4);
      case 'daIncassare': return euro(s.daIncassare, 6140.48);
      case 'scaduto': return euro(s.scaduto, 634.9);
      case 'nelConto': return euro(s.saldoConti, 18420.1);
      case 'ticketAperti': return conta(t.aperti, 5);
      case 'interventiOggi': return conta(t.interventiOggi, 1);
      case 'scadenzeVicine': return conta((n.scadenze && n.scadenze.vicine) || pe.scadenzeVicine, 6);
      case 'assentiOggi': return conta(pe.assentiOggi, 1);
      case 'daApprovare': return conta(undefined, 10);
      case 'tarateScadute': return conta(me.tarateScadute, 1);
      case 'dalPortale': return conta(n.portale && n.portale.daGuardare, 4);
      case 'daMandareOggi': return conta(n.comunicazioni && n.comunicazioni.daMandareOggi, 2);
      case 'commesseAperte': return conta(co.aperte, 12);
      case 'commesseInRitardo': return conta(co.inRitardo, 1);
      case 'oreSettimana': return { numero: 31.5, unita: 'ore' };
      case 'attivitaOggi': return conta(undefined, (dati.attivita || []).filter(a => a.assegnataA === dati.io.id && String(a.scadenza || a.inizio || '').slice(0, 10) === dati.oggi).length);
      case 'mieiTicket': return conta(undefined, 2);
      case 'preventiviInAttesa': return euro(undefined, 4291.35);
      default: return conta(0, 0);
    }
  }

  const COLLEGAMENTI_RIQUADRI = {
    daFatturare: { pagina: 'fatturazione' }, daIncassare: { pagina: 'fatture', filtro: { pagamento: 'aperta' } }, scaduto: { pagina: 'fatture', filtro: { scadute: true } }, nelConto: { pagina: 'conti' },
    ticketAperti: { pagina: 'tickets', filtro: { segmento: 'aperti' } }, interventiOggi: { pagina: 'calendario' }, scadenzeVicine: { pagina: 'documenti', filtro: { segmento: 'scadenze' } },
    assentiOggi: { pagina: 'persone', filtro: { segmento: 'ferie' } }, daApprovare: { pagina: 'approvare' }, tarateScadute: { pagina: 'mezzi', filtro: { segmento: 'strumenti', taratura: 'scadute' } },
    dalPortale: { pagina: 'portale', filtro: { segmento: 'daguardare' } }, daMandareOggi: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } },
    commesseAperte: { pagina: 'commesse', filtro: { stato: 'APERTA' } }, commesseInRitardo: { pagina: 'commesse', filtro: { stato: 'APERTA', ritardo: true } },
    oreSettimana: { pagina: 'rapportini', filtro: { segmento: 'ore' } }, attivitaOggi: { pagina: 'attivita' }, mieiTicket: { pagina: 'tickets', filtro: { segmento: 'aperti' } }, preventiviInAttesa: { pagina: 'preventivi', filtro: { segmento: 'inviati' } },
  };

  // ------------------------------------------------------------------------- le risposte

  function esegui(dati, azione, b) {
    const f8 = prepara(dati);
    const p = dati.permessiIo;
    const imp = dati.ana.impostazioni;
    const integrazione = k => f8.integrazioni.find(i => i.chiave === k);
    const vista = i => { const x = copia(i); delete x.controlli; return x; };
    switch (azione) {
      // --------------------------------------------------------------- integrazioni
      case 'integrazioni': {
        const lista = f8.integrazioni.map(vista);
        const n = { collegati: lista.filter(i => i.stato === 'collegato').length, daSistemare: lista.filter(i => i.stato === 'errore' || i.stato === 'da_configurare' || i.gruppo === 'scelta').length,
          noncollegati: lista.filter(i => i.gruppo === 'noncollegati').length, errori: lista.filter(i => i.stato === 'errore').length };
        return { ok: true, integrazioni: lista, numeri: n };
      }
      case 'integrazione': {
        const i = integrazione(b.chiave);
        if (!i) return { ok: false, errore: 'Collegamento non trovato' };
        const x = copia(i);
        if (i.chiave === 'calendario') x.impostazioni = { CALENDARIO_GIORNI_PRIMA: imp.CALENDARIO_GIORNI_PRIMA, CALENDARIO_MESI_DOPO: imp.CALENDARIO_MESI_DOPO, CALENDARIO_PUBBLICO: !!imp.CALENDARIO_PUBBLICO };
        if (i.chiave === 'ricerca') x.impostazioni = { RICERCA_FILE: imp.RICERCA_FILE !== false, RICERCA_FILE_MAX_MB: imp.RICERCA_FILE_MAX_MB };
        if (i.chiave === 'portale') x.impostazioni = { PORTALE_ATTIVO: imp.PORTALE_ATTIVO !== false };
        return Object.assign({ ok: true }, x);
      }
      case 'provaIntegrazione': {
        const i = integrazione(b.chiave);
        if (!i) return { ok: false, errore: 'Collegamento non trovato' };
        if (i.stato === 'non_collegato') return { ok: false, errore: 'Non è collegato: non c\'è niente da provare' };
        const ora = Date.now();
        if (f8.ultimaProva[i.chiave] && ora - f8.ultimaProva[i.chiave] < 60000) return { ok: false, errore: 'Hai appena provato: riprova fra un minuto' };
        f8.ultimaProva[i.chiave] = ora;
        // Nei dati di esempio la prova riesce (il servizio "è tornato"): niente rete, niente servizi veri.
        const quando = adesso();
        const ok = i.stato !== 'da_configurare';
        i.controlli = [{ quando, esito: ok ? 'ok' : 'errore', millisecondi: ok ? 520 : 0, testo: ok ? 'Risponde' : i.esito }].concat(i.controlli || []).slice(0, 20);
        if (ok) Object.assign(i, { stato: 'collegato', controllato: quando, millisecondi: 520, erroriDiFila: 0, esito: i.chiave === 'vies' ? 'Partita IVA dello studio valida' : 'Risponde' });
        return { ok: true, integrazione: vista(i) };
      }
      case 'salvaIntegrazione': {
        const i = integrazione(b.chiave);
        if (!i) return { ok: false, errore: 'Collegamento non trovato' };
        const v = b.impostazioni || {};
        if ((v.CALENDARIO_PUBBLICO !== undefined || v.PORTALE_ATTIVO !== undefined) && !R.puo(p, 'amministrazione', 2)) return NONPERMESSO('fare questa modifica');
        if (v.CALENDARIO_PUBBLICO === true && (integrazione('portale') || {}).stato !== 'collegato') return { ok: false, errore: 'Il calendario fuori casa si accende quando il portale è Collegato' };
        Object.assign(imp, v);
        if (b.account !== undefined) i.account = String(b.account);
        return { ok: true, integrazione: vista(i) };
      }

      // --------------------------------------------------------------- calendario
      case 'esportaCalendario': {
        if (b.cosa === 'studio' && !(R.puo(p, 'attivita', 2) && dati.io.ruolo !== 'collaboratore')) return NONPERMESSO('vedere il calendario dello studio');
        const nome = 'wisper-calendario-' + String(dati.io.nome || '').split(' ')[0].toLowerCase() + '-' + dati.oggi + '.ics';
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Studio Tecnico GM//Wisper//IT', 'METHOD:PUBLISH', 'X-WR-CALNAME:Wisper · ' + dati.io.nome, 'END:VCALENDAR', ''].join('\r\n');
        return { ok: true, nome, mime: 'text/calendar;charset=utf-8', eventi: 12, base64: aBase64(ics) };
      }
      case 'feedCalendario':
        return { ok: true, feed: copia(f8.feed.filter(f => f.idUtente === dati.io.id && !f.revocatoIl).map(f => { const x = Object.assign({}, f); delete x.idUtente; return x; })) };
      case 'nuovoFeed': {
        const miei = f8.feed.filter(f => f.idUtente === dati.io.id && !f.revocatoIl);
        if (!String(b.nome || '').trim()) return { ok: false, errore: 'Nome: scrivi un nome per riconoscerlo' };
        if (miei.length >= 5) return { ok: false, errore: 'Hai già 5 indirizzi: togline uno' };
        if (b.pubblico && !imp.CALENDARIO_PUBBLICO) return { ok: false, errore: 'Il calendario fuori casa non è acceso' };
        const cosa = Object.assign({ attivita: 'mie', assenze: false, scadenze: false }, b.cosa || {});
        if (cosa.attivita === 'studio' && !(R.puo(p, 'attivita', 2) && dati.io.ruolo !== 'collaboratore')) cosa.attivita = 'mie';
        const f = { id: f8.prossimoFeed++, idUtente: dati.io.id, nome: String(b.nome).trim(), cosa, dettagli: b.pubblico ? false : b.dettagli !== false, pubblico: !!b.pubblico, creato: adesso(), ultimoUso: '', agente: '', letture: 0 };
        f8.feed.push(f);
        // Una chiave finta, uguale per forma a quella vera (32 byte in base64url): nei dati di esempio non apre niente.
        const chiave = 'ESEMPIO-' + f.id + '-chiave-di-esempio-non-vera-0000';
        const indirizzo = b.pubblico ? 'https://script.google.com/esempio?calendario=' + chiave : 'http://192.168.1.51:8400/calendario/' + chiave + '.ics';
        const x = Object.assign({}, f);
        delete x.idUtente;
        return { ok: true, feed: x, indirizzo, webcal: indirizzo.replace(/^https?:\/\//, 'webcal://') };
      }
      case 'revocaFeed': {
        const f = f8.feed.find(x => String(x.id) === String(b.id));
        if (!f || (f.idUtente !== dati.io.id && !R.puo(p, 'amministrazione', 2))) return { ok: false, errore: 'Indirizzo non trovato' };
        f.revocatoIl = adesso();
        return { ok: true };
      }

      // --------------------------------------------------------------- documenti: la lettura
      case 'letturaFile': {
        const d = f8.documenti.find(x => String(x.idFile || 'file' + x.id) === String(b.idFile) || String(x.id) === String(b.idFile));
        if (!d) return { ok: true, stato: 'da_leggere' };
        return Object.assign({ ok: true }, copia(d.lettura));
      }
      case 'rileggiFile':
        if (!b.idFile && !R.puo(p, 'amministrazione', 2)) return NONPERMESSO('rileggere tutti i file');
        return { ok: true, daLeggere: b.idFile ? 1 : 1240 };

      // --------------------------------------------------------------- importa ed esporta
      case 'esportaTutto': {
        const e = { id: f8.esportazioni.length + 4, stato: 'pronta', byte: 3480112, creato: adesso(), scade: istante(giorno(dati.oggi, 7), 0, '10:05'), nome: 'wisper-tutto-' + dati.oggi + '.zip' };
        f8.esportazioni.unshift(e);
        return { ok: true, esportazione: { id: e.id, stato: 'in_corso' } };
      }
      case 'esportazioni': return { ok: true, esportazioni: copia(f8.esportazioni) };
      case 'importazioni': return { ok: true, importazioni: copia(f8.importazioni) };
      case 'leggiImport': {
        const nome = String(b.nome || 'clienti.csv');
        if (!/\.(csv|txt)$/i.test(nome)) return { ok: false, errore: 'Nei dati di esempio si legge solo un CSV' };
        const righe = leggiCsv(daBase64(b.base64));
        if (righe.length < 2) return { ok: false, errore: 'Il file non ha righe da importare' };
        const testa = righe[0];
        f8.letturaImport = { id: 'lettura-esempio', nome, testa, righe: righe.slice(1) };
        return { ok: true, idLettura: 'lettura-esempio', righe: righe.length - 1,
          colonne: testa.map((t, j) => ({ intestazione: t, campo: campoDa(t), esempi: righe.slice(1, 3).map(r => r[j] || '').filter(Boolean) })) };
      }
      case 'controllaImport': {
        const l = f8.letturaImport;
        if (!l || l.id !== b.idLettura) return { ok: false, errore: 'Il file letto è scaduto: sceglilo di nuovo' };
        const r = controllaRighe(dati, l, b.colonne || [], b.tipo);
        return { ok: true, nuovi: r.nuovi.length, completati: r.completati.length, daSistemare: r.daSistemare,
          anteprima: r.nuovi.concat(r.completati).slice(0, 20).map(x => ({ riga: x.riga, nome: x.nome, gia: !!x.id, campi: x.campi || [], partitaIva: (x.valori || {}).partitaIva || '', citta: (x.valori || {}).citta || '' })) };
      }
      case 'importaSoggetti': {
        const l = f8.letturaImport;
        if (!l || l.id !== b.idLettura) return { ok: false, errore: 'Il file letto è scaduto: sceglilo di nuovo' };
        const r = controllaRighe(dati, l, b.colonne || [], b.tipo);
        const ids = [];
        r.nuovi.forEach(x => {
          const forn = x.tipo === 'fornitori';
          const id = (forn ? 'F' : 'C') + String(dati.ana.soggetti.filter(s => (forn ? /^F/ : /^C/).test(s.id)).length + 1 + ids.length).padStart(3, '0');
          dati.ana.soggetti.push(Object.assign({ alias: [], email: '', pec: '', telefono: '', partitaIva: '', codiceFiscale: '', codiceSdi: '', indirizzo: '', cap: '', citta: '', provincia: '', nazione: 'IT', note: '' },
            x.valori, { id, cliente: !forn, fornitore: forn, archiviato: false, tipo: undefined }));
          ids.push(id);
        });
        r.completati.forEach(x => { const s = dati.ana.soggetti.find(y => y.id === x.id); (x.campi || []).forEach(k => { if (!s[k]) s[k] = x.valori[k]; }); });
        const imp2 = { id: f8.importazioni.length + 3 + 1, nomeFile: l.nome, quando: adesso(), righe: l.righe.length, nuovi: r.nuovi.length, completati: r.completati.length, saltati: r.daSistemare.length, utente: dati.io.nome, archiviatiIl: '', ids };
        f8.importazioni.unshift(imp2);
        f8.letturaImport = null;
        return { ok: true, importazione: { id: imp2.id, nuovi: imp2.nuovi, completati: imp2.completati, saltati: imp2.saltati } };
      }
      case 'archiviaImportati': {
        const x = f8.importazioni.find(i => String(i.id) === String(b.idImportazione));
        if (!x) return { ok: false, errore: 'Importazione non trovata' };
        let archiviati = 0;
        (x.ids || []).forEach(id => { const s = dati.ana.soggetti.find(y => y.id === id); if (s && !s.archiviato) { s.archiviato = true; archiviati++; } });
        x.archiviatiIl = adesso();
        return { ok: true, archiviati, restano: Math.max(0, (x.nuovi || 0) - archiviati - ((x.ids || []).length ? 0 : x.nuovi || 0)) };
      }

      // --------------------------------------------------------------- dashboard
      case 'salvaRiquadri': {
        const scelti = b.riquadri || [];
        if (scelti.length !== 4) return { ok: false, errore: 'Scegli 4 riquadri' };
        f8.riquadri[dati.io.id] = scelti.slice();
        return { ok: true };
      }
      case 'nascondiVoce': f8.nascoste[dati.io.id] = Object.assign(f8.nascoste[dati.io.id] || {}, { [b.oggetto]: giorno(dati.oggi, Number(b.giorni) || 30) }); return { ok: true };
      case 'mostraNascoste': f8.nascoste[dati.io.id] = {}; return { ok: true };

      // --------------------------------------------------------------- amministrazione
      case 'impostazioniGenerali': return { ok: true, gruppi: gruppiImpostazioni(imp) };
      case 'funzioni': {
        // 03/11/2026 (progetti.md §5): si spengono tutte e 19; il titolare le vede sempre, gli altri con amministrazione 1.
        if (!titolare(dati) && !R.puo(dati.permessiIo, 'amministrazione', 1)) return NONPERMESSO('vedere questa pagina');
        return { ok: true, funzioni: Q8.FUNZIONI.map(x => ({ modulo: x.modulo, nome: x.nome, accesa: f8.funzioniSpente.indexOf(x.modulo) < 0, spegnibile: true,
          cosaCambia: x.cosaCambia, richiede: Q8.diCosaHaBisogno(x.modulo), serveA: Q8.chiLaUsa(x.modulo) })) };
      }
      case 'salvaFunzioni': {
        const x = Q8.SPEGNIBILI[b.modulo];
        if (!x) return { ok: false, errore: 'Funzione sconosciuta: ' + b.modulo };
        const accesa = b.accesa === true || b.accesa === 'true';
        // Spegnendo si spengono anche quelle che ne hanno bisogno; accendendo si accendono quelle di cui ha bisogno.
        const altre = (accesa ? Q8.diCosaHaBisogno(b.modulo).filter(m => f8.funzioniSpente.indexOf(m) >= 0)
          : Q8.chiLaUsa(b.modulo).filter(m => f8.funzioniSpente.indexOf(m) < 0));
        const tocca = [b.modulo].concat(altre);
        f8.funzioniSpente = f8.funzioniSpente.filter(m => tocca.indexOf(m) < 0).concat(accesa ? [] : tocca);
        imp.MODULI_SPENTI = f8.funzioniSpente.slice();
        if (tocca.indexOf('portale') >= 0 && !accesa) imp.PORTALE_ATTIVO = false;
        return { ok: true, modulo: b.modulo, accesa, anche: altre.map(m => ({ modulo: m, nome: Q8.SPEGNIBILI[m].nome })) };
      }
      case 'notifichePreferenze': {
        const mie = f8.notifiche[dati.io.id] || {};
        const tipi = {};
        ['assegnato', 'da_mandare'].forEach(k => { tipi[k] = true; });
        if (R.puo(p, 'portale') || R.puo(p, 'preventivi')) ['richiesta_portale', 'messaggio_portale', 'file_portale', 'preventivo_accettato', 'preventivo_rifiutato', 'rapportino_firmato'].forEach(k => { tipi[k] = true; });
        if (titolare(dati) || R.puo(p, 'amministrazione', 2)) ['portale_irraggiungibile', 'integrazione_errore', 'copia_non_riuscita', 'ripristino_da_provare'].forEach(k => { tipi[k] = true; });
        if (titolare(dati)) tipi.esportazione_pronta = true;
        if (R.puo(p, 'clienti', 2)) tipi.importazione_finita = true;
        Object.keys(mie.tipi || {}).forEach(k => { if (tipi[k] !== undefined) tipi[k] = !!mie.tipi[k]; });
        tipi.file_portale = mie.tipi && mie.tipi.file_portale !== undefined ? !!mie.tipi.file_portale : tipi.file_portale !== undefined ? false : undefined;
        if (tipi.file_portale === undefined) delete tipi.file_portale;
        return { ok: true, telefono: mie.telefono !== false, silenzioSera: mie.silenzioSera !== false, tipi };
      }
      case 'salvaNotifichePreferenze': {
        const mie = f8.notifiche[dati.io.id] = f8.notifiche[dati.io.id] || {};
        if (b.telefono !== undefined) mie.telefono = !!b.telefono;
        if (b.silenzioSera !== undefined) mie.silenzioSera = !!b.silenzioSera;
        if (b.tipi) mie.tipi = Object.assign({}, mie.tipi || {}, b.tipi);
        return { ok: true };
      }
      case 'provaAvvisi': return { ok: true, a: String(imp.EMAIL_AVVISI || '').split(/[,;\s]+/).filter(Boolean) };
      case 'sicurezza':
        return { ok: true, internetInterno: { ok: true, ultimo: null }, copiaCifrata: f8.cifrata, accessiSbagliati: { giorni: 30, quanti: 3, blocchi: 0 },
          dispositiviFermi: f8.dispositivi.filter(d => d.ultimoUso < istante(dati.oggi, -60, '00:00')).map(d => ({ id: d.id, nome: d.nome, persona: d.persona, ultimoUso: d.ultimoUso })),
          utentiFermi: [], passwordIniziali: [{ idUtente: 3, nome: 'Marco Rossato', data: istante(dati.oggi, -2, '09:00'), da: 'Manuel Gasparotto' }], sessioneGiorni: Number(imp.SESSIONE_GIORNI) || 180,
          dispositivi: copia(f8.dispositivi), feed: f8.feed.filter(f => !f.revocatoIl).map(f => Object.assign({}, f, { persona: f8.persona(f.idUtente) })) };
      case 'scollegaTutti':
        if (b.password !== 'prova') return { ok: false, errore: 'La password non è giusta' };
        return { ok: true, scollegati: f8.dispositivi.length };
      case 'accendiCifratura':
        f8.cifrata = true;
        imp.COPIA_CIFRATA = true;
        return { ok: true, chiave: 'K7QM-XR4T-9HVB-2NWE-PD6S-ACJ8-UY3F-MZ5G' };
      case 'spegniCifratura':
        if (!b.conferma) return { ok: false, errore: 'Conferma per spegnere la cifratura', serveConferma: true };
        f8.cifrata = false;
        imp.COPIA_CIFRATA = false;
        return { ok: true };
      case 'provaCopia': {
        const c = f8.copie[0];
        const prova = { id: f8.prove.length + 8, tipo: 'automatica', quando: adesso(), copia: c.nome, da: 'nas', esito: 'ok', integrita: 'ok', conteggi: { rapportini: [1532, 1532], soggetti: [212, 212] }, file: { provati: 20, giusti: 20 }, fuori: { md5: 'giusto' } };
        f8.prove.unshift({ id: prova.id, tipo: 'automatica', quando: prova.quando, copia: c.nome, da: 'nas', esito: 'ok', dettagli: { integrita: 'ok', conteggi: prova.conteggi, file: prova.file, fuori: prova.fuori } });
        c.provata = true;
        return { ok: true, prova };
      }
      case 'segnaRipristino': {
        const ctrl = b.controlli || [];
        if (ctrl.length !== 5 || ctrl.some(x => !x)) return { ok: false, errore: 'Spunta i cinque controlli: servono tutti' };
        const c = f8.copie.find(x => x.nome === b.copia) || f8.copie[0];
        const prova = { id: f8.prove.length + 8, tipo: 'a_mano', quando: adesso(), copia: c.nome, da: b.da === 'nas' ? 'nas' : 'drive', esito: 'ok', utente: dati.io.nome, conChiave: !!b.conChiave, note: b.note || '', dettagli: { controlli: ctrl } };
        f8.prove.unshift(prova);
        c.provata = true;
        return { ok: true, prova };
      }
      case 'statoSistema': {
        const o = new Date();
        return { ok: true, server: { versione: 'esempio', acceso: istante(giorno(dati.oggi, -12), 0, '07:12'), schema: 8, node: '24.12.0', ora: adesso(), differenzaSecondi: 0 },
          database: { mb: 86, integrita: 'ok', controllato: istante(dati.oggi, 0, '02:40'), righe: { rapportini: 1532, soggetti: 212, commesse: 47, documenti: 1279 } },
          disco: { liberoMb: 1843200, usatoMb: 2150 },
          lavori: [{ nome: 'Copia', quando: istante(dati.oggi, 0, '02:30'), esito: 'ok', nota: '' }, { nome: 'Foglio riscritto', quando: istante(dati.oggi, 0, '02:31'), esito: 'ok', nota: '' },
            { nome: 'Copia fuori casa', quando: istante(dati.oggi, 0, '02:31'), esito: 'ok', nota: '3 file' }, { nome: 'Ricorrenze', quando: istante(dati.oggi, 0, '00:05'), esito: 'ok', nota: '14 nuove' },
            { nome: 'Pulizie', quando: istante(dati.oggi, 0, '03:00'), esito: 'ok', nota: '212 notifiche vecchie tolte' }, { nome: 'Lettura dei file', quando: istante(dati.oggi, 0, '02:52'), esito: 'ok', nota: '14 letti' },
            { nome: 'Controlli delle integrazioni', quando: istante(dati.oggi, 0, '08:30'), esito: 'errore', nota: 'Verifica della partita IVA non risponde' }],
          collegamenti: { collegati: f8.integrazioni.filter(i => i.stato === 'collegato').length, errori: f8.integrazioni.filter(i => i.stato === 'errore').map(i => i.nome) },
          versioni: { ultime: { telefono: '0.9.0', computer: '0.9.0' }, dispositivi: copia(f8.dispositivi) }, adesso: o.toISOString() };
      }
      case 'controlliFinali': {
        const gruppi = [];
        f8.controlli.forEach(c => { let g = gruppi.find(x => x.nome === c.gruppo); if (!g) { g = { nome: c.gruppo, righe: [] }; gruppi.push(g); } g.righe.push(copia(c)); });
        const st = f8.controlli.map(c => c.stato);
        return { ok: true, riassunto: { fatti: st.filter(s => s === 'fatto').length, totale: st.length, nonVanno: st.filter(s => s === 'non_va').length, attesa: st.filter(s => s === 'attesa').length }, gruppi, cambio: copia(f8.cambio), versioneServer: 'esempio' };
      }
      case 'segnaControllo': {
        const c = f8.controlli.find(x => x.chiave === b.chiave);
        if (!c) return { ok: false, errore: 'Controllo non trovato' };
        if (c.tipo === 'server') return { ok: false, errore: 'Questa riga la controlla il server da solo' };
        if (['fatto', 'non_va', 'da_fare'].indexOf(b.stato) < 0) return { ok: false, errore: 'Scegli Fatto, Non va o Da fare' };
        if (b.stato === 'non_va' && !String(b.nota || '').trim()) return { ok: false, errore: 'Nota: scrivi cosa non va' };
        Object.assign(c, { stato: b.stato, nota: String(b.nota || ''), il: b.stato === 'da_fare' ? '' : dati.oggi, utente: b.stato === 'da_fare' ? '' : dati.io.nome, versione: 'esempio' });
        return { ok: true, riga: copia(c) };
      }
      case 'segnaCambio':
        f8.cambio = Object.assign({}, f8.cambio, { stato: b.stato });
        return { ok: true, cambio: copia(f8.cambio) };
      default: return null;
    }
  }

  /** In più sulle risposte di sempre (§13.7): io, anagrafiche, documenti, dashboard, copie, caricaFile. */
  function arricchisci(dati, azione, b, risposta) {
    if (!risposta || risposta.ok === false) return risposta;
    const f8 = prepara(dati);
    const imp = dati.ana.impostazioni;
    if (azione === 'io' && risposta.interfaccia) {
      Object.assign(risposta.interfaccia, { funzioniSpente: f8.funzioniSpente.slice(), nomeBreve: imp.STUDIO_NOME_BREVE || '', logo: imp.STUDIO_LOGO ? '/file/' + imp.STUDIO_LOGO : '', oraServer: adesso(),
        puoApprovareAssenze: risposta.interfaccia.puoApprovareAssenze !== undefined ? risposta.interfaccia.puoApprovareAssenze : dati.io.ruolo !== 'collaboratore' && dati.io.ruolo !== 'lettura' });
      // Un modulo spento ha il livello 0 per tutti (§9.5): il menu e le pagine lo sanno dai permessi.
      f8.funzioniSpente.forEach(m => { if (risposta.permessi) risposta.permessi[m] = 0; });
    }
    if (azione === 'caricaFile' && b.tipo === 'logo') { imp.STUDIO_LOGO = risposta.file && risposta.file.id ? risposta.file.id : 'esempio-logo'; }
    if (azione === 'documenti' && b.archivio) {
      const t = String(b.testo || '').trim().toLowerCase();
      const parole = t.split(/\s+/).filter(Boolean);
      const lista = [];
      f8.documenti.forEach(d => {
        const nelTitolo = parole.length && parole.every(w => (d.titolo + ' ' + d.cliente).toLowerCase().indexOf(w) >= 0);
        const nelTesto = parole.length && imp.RICERCA_FILE !== false && b.dentro !== false && b.dentro !== '0' && parole.every(w => d.testo.toLowerCase().indexOf(w) >= 0);
        if (parole.length && !nelTitolo && !nelTesto) return;
        const x = copia(d);
        delete x.testo;
        delete x.lettura;
        x.idFile = 'file' + d.id;
        x.url = '/file/file' + d.id;
        x.versioni = [{ id: d.id * 10, numero: d.revisione, statoVisto: 'Valida', url: x.url, nomeFile: d.nomeFile, idFile: x.idFile }];
        if (parole.length && !nelTitolo && nelTesto) {
          const i = d.testo.toLowerCase().indexOf(parole[0]);
          const da = Math.max(0, i - 40);
          let pezzo = (da > 0 ? '…' : '') + d.testo.slice(da, i) + '[' + d.testo.slice(i, i + parole[0].length) + ']' + d.testo.slice(i + parole[0].length, i + parole[0].length + 60) + '…';
          x.trovato = { revisione: d.revisione, superata: false, estratto: pezzo };
        }
        lista.push(x);
      });
      if (lista.length || parole.length) return Object.assign({}, risposta, { documenti: lista.concat(risposta.documenti || []), quanti: lista.length + (risposta.quanti || 0) });
    }
    if (azione === 'copie') {
      risposta.prove = copia(f8.prove).map(x => Object.assign({}, x, x.dettagli || {}));
      risposta.prossimaProva = istante(giorno(dati.oggi, -31 + (Number(imp.PROVA_COPIA_GIORNI) || 30)), 0, '02:40');
      risposta.copie = (risposta.copie && risposta.copie.length ? risposta.copie : f8.copie.map(c => ({ quando: c.quando, file: c.nome, byte: c.byte, locale: 'ok', fuori: 'ok', foglio: 'ok' })))
        .map(c => Object.assign({}, c, { provata: f8.copie.some(x => x.nome === (c.file || c.nome) && x.provata), cifrata: f8.cifrata }));
      if (risposta.copie[0] && !risposta.ultima) risposta.ultima = risposta.copie[0];
    }
    if (azione === 'dashboard') {
      const io = dati.io;
      const r8 = vociFase8(dati, f8);
      const nascoste = f8.nascoste[io.id] || {};
      const conCampi = (v, sez) => Object.assign({}, v, {
        oggetto: v.oggetto || (v.tipo || 'voce') + ':' + (v.collegamento && (v.collegamento.id || JSON.stringify(v.collegamento.filtro || {})) || v.titolo),
        famiglia: v.famiglia || v.tipo, area: v.area || AREE_TIPO[v.tipo] || 'lavoro', nascondibile: sez === 'pianificare' && v.gravita === 'info',
      });
      // Le voci di sistema sempre per prime, una per una (§8.2 punto 4, §8.3).
      const sezione = sez => r8[sez].concat(risposta[sez] || []).map(v => conCampi(v, sez)).filter(v => !nascoste[v.oggetto]);
      const tutte = { urgenti: sezione('urgenti'), settimana: sezione('settimana'), pianificare: sezione('pianificare') };
      const TETTI = { urgenti: 7, settimana: 7, pianificare: 5 };
      ['urgenti', 'settimana', 'pianificare'].forEach(sez => {
        risposta[sez] = b.tutto ? tutte[sez] : tutte[sez].slice(0, TETTI[sez] + (sez === 'urgenti' ? 1 : 0));
      });
      risposta.quante = { urgenti: tutte.urgenti.length, settimana: tutte.settimana.length, pianificare: tutte.pianificare.length };
      risposta.nascoste = Object.keys(nascoste).length;
      const BASE = { titolare: ['daFatturare', 'scaduto', 'ticketAperti', 'daApprovare'], amministrazione: ['daFatturare', 'daIncassare', 'scaduto', 'scadenzeVicine'],
        collaboratore: ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'daMandareOggi'], lettura: ['commesseAperte', 'daFatturare', 'daIncassare', 'scaduto'] };
      const scelti = f8.riquadri[io.id] || BASE[io.ruolo] || BASE.lettura;
      risposta.riquadri = scelti.map(k => Object.assign({ chiave: k, rosso: ['scaduto', 'commesseInRitardo', 'tarateScadute'].indexOf(k) >= 0, collegamento: COLLEGAMENTI_RIQUADRI[k] || null }, numeroRiquadro(k, risposta.numeri, dati)));
      risposta.numeri = Object.assign({}, risposta.numeri, { integrazioni: { errori: f8.integrazioni.filter(i => i.stato === 'errore').length } });
      // Da approvare in una voce sola (§8.2 punto 5): il foglio con le tre righe.
      risposta.approvare = { quante: 10, righe: [{ testo: '8 ore e spese di Marco Rossato', dove: 'Ore e rapportini › Da approvare', n: 8, collegamento: { pagina: 'rapportini', filtro: { segmento: 'daApprovare' } } },
        { testo: '1 richiesta di ferie', dove: 'Persone › Ferie da approvare', n: 1, collegamento: { pagina: 'persone', filtro: { segmento: 'ferie', daApprovare: true } } },
        { testo: '1 documento', dove: 'Documenti › Da approvare', n: 1, collegamento: { pagina: 'documenti', filtro: { segmento: 'approvare' } } }] };
    }
    return risposta;
  }

  const Esempio8 = { SERVE8, prepara, esegui, arricchisci, leggiCsv, campoDa, gruppiImpostazioni };
  if (typeof module !== 'undefined' && module.exports) module.exports = Esempio8;
  else radice.WisperEsempio8 = Esempio8;
})(typeof window !== 'undefined' ? window : globalThis);
