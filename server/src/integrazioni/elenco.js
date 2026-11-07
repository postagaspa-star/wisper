/*
 * L'elenco unico delle integrazioni (fase 8, fase8.md §3.1, letto con la §0.1: la porta Google al posto del tailnet,
 * tutto gratuito). Nomi, frasi, costi e motivi stanno qui, nel codice, e il server li manda alle app (§12.4): telefono e
 * computer dicono le stesse parole. Lo stato vero sta nella tabella "integrazioni" (solo per chi ha un controllo, §4.2).
 *
 * gruppo: "collegati" (Collegati a Wisper, §0.2: 1-9 e 14), "scelta" (Dipendono da una scelta di Andrea),
 * "noncollegati" (Non collegati, col motivo di §3.3). controllo: la chiave del controllo vero (azioni/integrazioni.js);
 * senza, la riga ha uno stato che deriva da un altro (link, ponte) o la frase del motivo. frequenza: minuti fra un
 * controllo e l'altro (per "da allora nessun controllo", §4.1).
 *
 * Mai qui chiavi, segreti, indirizzi del foglio o del NAS (§4.4): le pagine dicono "c'e'" o "manca".
 */
'use strict';

const DIPENDE = 'Dipende da una scelta: è nelle domande della fase 8';

const ELENCO = [
  { numero: 1, chiave: 'postino', nome: 'Postino', gruppo: 'collegati', controllo: 'postino', frequenza: 60,
    cosa: 'Email, copie su Drive e foglio di ogni notte', account: 'il Gmail del foglio di Wisper',
    esce: 'Email e PDF ai clienti; la copia del database; il foglio di ogni notte', costo: '0 € (Gmail: 100 destinatari al giorno)', regole: 'Google' },
  { numero: 2, chiave: 'vies', nome: 'Verifica della partita IVA', gruppo: 'collegati', controllo: 'vies', frequenza: 24 * 60,
    cosa: 'Controlla le partite IVA nel servizio europeo VIES', account: 'servizio pubblico, senza account',
    esce: 'Solo la partita IVA da controllare', costo: '0 €', regole: 'Servizio pubblico dell\'Unione europea' },
  { numero: 3, chiave: 'aggiornamenti', nome: 'Aggiornamenti delle app', gruppo: 'collegati', controllo: 'aggiornamenti', frequenza: 24 * 60,
    cosa: 'Le versioni nuove di telefono e computer, firmate, da GitHub: il NAS guarda ogni 10 minuti e avvisa le app', account: 'il progetto di Wisper su GitHub',
    esce: 'Niente: le app scaricano quando il NAS le avvisa', costo: '0 €', regole: 'GitHub' },
  { numero: 4, chiave: 'porta', nome: 'Accesso da fuori casa (porta Google)', gruppo: 'collegati', controllo: 'porta', frequenza: 10,
    cosa: 'Telefoni e computer lavorano anche fuori casa: il NAS va a prendere le richieste dallo script del foglio',
    account: 'lo script del foglio di Wisper', esce: 'Le richieste di telefoni e computer passano da Google; il NAS non ha porte aperte',
    costo: '0 €', regole: 'Google' },
  { numero: 5, chiave: 'portale', nome: 'Portale clienti su internet', gruppo: 'collegati', controllo: 'portale', frequenza: 60,
    cosa: 'La pagina del portale su Netlify e lo script del portale', account: 'lo script del portale e il sito su Netlify',
    esce: 'Quello che lo studio pubblica nel portale; le richieste dei clienti', costo: '0 €', regole: 'Google e Netlify', impostazioni: ['PORTALE_ATTIVO', 'PORTALE_INDIRIZZO'] },
  { numero: 6, chiave: 'link', nome: 'Link che scade per i documenti', gruppo: 'collegati', segue: 'portale',
    cosa: 'Un documento mandato con un link che vale qualche giorno', account: 'il portale clienti',
    esce: 'Il documento condiviso, a chi ha il link', costo: '0 €', regole: 'Google e Netlify (come il portale)' },
  { numero: 7, chiave: 'ponte', nome: 'Ponte per le versioni vecchie', gruppo: 'collegati', segue: 'porta',
    cosa: 'Nelle settimane del cambio le app 0.4.0 lavorano attraverso lo script del foglio', account: 'lo script del foglio di Wisper',
    esce: 'Le richieste delle app vecchie passano da Google per 4 settimane', costo: '0 €', regole: 'Google' },
  { numero: 8, chiave: 'calendariofile', nome: 'Calendario: file da scaricare', gruppo: 'collegati', controllo: 'calendariofile', frequenza: 24 * 60,
    cosa: 'Gli impegni di Wisper in un file .ics per Outlook, Google Calendar o il telefono', account: 'nessuno',
    esce: 'Niente: il file lo porta chi lo scarica', costo: '0 €', regole: 'Standard RFC 5545' },
  { numero: 9, chiave: 'calendario', nome: 'Calendario: abbonamento dal telefono', gruppo: 'collegati', controllo: 'calendario', frequenza: 60,
    cosa: 'Un indirizzo che ICSx⁵ legge ogni ora e mette nel calendario del telefono, in casa', account: 'nessuno',
    esce: 'Niente: i dati restano tra il NAS e il telefono', costo: '0 € da F-Droid, circa 2 € una volta dal Play Store', regole: 'ICSx⁵: GPL',
    impostazioni: ['CALENDARIO_GIORNI_PRIMA', 'CALENDARIO_MESI_DOPO', 'CALENDARIO_PUBBLICO'] },
  { numero: 10, chiave: 'calendariopubblico', nome: 'Calendario anche fuori casa (Google Calendar, Outlook)', gruppo: 'scelta',
    cosa: 'Lo stesso indirizzo, letto dai server di Google o di Microsoft attraverso lo script del portale', account: 'lo script del portale',
    esce: 'Gli impegni passano da Google o Microsoft (di base senza dettagli)', costo: '0 €', regole: 'Google, Microsoft',
    servirebbe: 'Il portale collegato e "Anche fuori casa" acceso in Integrazioni › Calendario' },
  { numero: 11, chiave: 'duevie', nome: 'Sincronizzazione a due vie con Google Calendar o Outlook', gruppo: 'noncollegati',
    cosa: 'Gli appuntamenti spostati in Outlook che tornano in Wisper',
    perche: 'Gli avvisi di Outlook arrivano solo a un indirizzo pubblico e un\'app che chiede il calendario va verificata da Google; due calendari che si scrivono a vicenda vogliono regole per i conflitti. Il calendario di Wisper resta l\'unico posto dove si scrive.',
    servirebbe: 'Un\'app registrata da Google o Microsoft, un indirizzo pubblico per gli avvisi, le regole per i conflitti', costo: '0 €' },
  { numero: 12, chiave: 'onedrive', nome: 'Sfogliare OneDrive e SharePoint', gruppo: 'scelta',
    cosa: 'Scegliere i file di OneDrive da dentro Wisper', esce: 'Una chiave sul NAS che legge i file di Manuel', costo: '0 € (i link incollati funzionano già)', regole: 'Microsoft',
    servirebbe: 'Un\'app nel Microsoft 365 di Manuel col consenso di un amministratore e una chiave sul NAS da rinnovare ogni 90 giorni' },
  { numero: 13, chiave: 'drive', nome: 'Sfogliare Google Drive', gruppo: 'scelta',
    cosa: 'Scegliere i file di Drive da dentro Wisper', esce: 'Una chiave che legge i file scelti', costo: '0 € (i link funzionano già)', regole: 'Google',
    servirebbe: 'Un progetto Google Cloud col Picker; per tutto Drive una verifica di Google' },
  { numero: 14, chiave: 'ricerca', nome: 'Cerca dentro i file', gruppo: 'collegati', controllo: 'ricerca', frequenza: 24 * 60,
    cosa: 'La ricerca dei documenti guarda anche dentro PDF, Word, Excel e DXF', account: 'nessuno',
    esce: 'Niente esce dal NAS', costo: '0 €', regole: '—', impostazioni: ['RICERCA_FILE', 'RICERCA_FILE_MAX_MB'] },
  { numero: 15, chiave: 'sdi', nome: 'Invio allo SDI', gruppo: 'noncollegati',
    cosa: 'Mandare le fatture all\'Agenzia delle Entrate da Wisper',
    perche: 'Le fatture le emette il programma di Manuel: Wisper le prepara e l\'XML emesso torna in Wisper.',
    servirebbe: 'Un contratto con un intermediario e la numerazione fiscale in Wisper (Wisper diventerebbe il programma delle fatture)',
    costo: 'Aruba circa 30 € l\'anno più il Premium; Openapi circa 0,10-0,15 € a fattura' },
  { numero: 16, chiave: 'programmafatture', nome: 'Programma delle fatture di Manuel', gruppo: 'scelta',
    cosa: 'Creare la bozza della fattura direttamente nel programma di Manuel', esce: 'I dati della bozza (ci andrebbero comunque)',
    costo: 'probabilmente compreso nel suo piano (non verificato)', regole: 'Del programma',
    servirebbe: 'Sapere quale programma usa Manuel; se ha un\'API (come Fatture in Cloud), un\'app privata' },
  { numero: 17, chiave: 'openbanking', nome: 'Banca: leggere i movimenti', gruppo: 'noncollegati',
    cosa: 'I movimenti del conto che arrivano da soli',
    perche: 'Si è scelto lo scadenziario a mano (decisione 6); un terzo vedrebbe tutti i movimenti e il consenso va rifatto ogni 180 giorni. GoCardless non accetta più clienti nuovi.',
    servirebbe: 'Un fornitore autorizzato (per esempio Enable Banking) e il consenso della banca ogni 180 giorni', costo: 'da 0 € (modalità ristretta) a un contratto' },
  { numero: 18, chiave: 'estrattoconto', nome: 'Importa l\'estratto conto', gruppo: 'noncollegati',
    cosa: 'Leggere il file CSV o CBI della banca',
    perche: 'Si è scelto lo scadenziario a mano (decisione 6). Si potrà fare senza servizi esterni.',
    servirebbe: 'Il file della banca', costo: '0 €' },
  { numero: 19, chiave: 'whatsappapi', nome: 'WhatsApp Business Platform', gruppo: 'noncollegati',
    cosa: 'Mandare i messaggi dal server e ricevere le risposte in Wisper',
    perche: 'Il messaggio pronto si apre nel WhatsApp di Manuel (decisione 7): niente numeri dei clienti a Meta, niente modelli da far approvare.',
    servirebbe: 'Un numero sulla piattaforma di Meta, la verifica dell\'azienda, i modelli approvati, un indirizzo pubblico', costo: 'circa 0,036 $ a promemoria, 0,08 $ marketing' },
  { numero: 20, chiave: 'messaggi', nome: 'Spese via messaggio', gruppo: 'noncollegati',
    cosa: 'Scrivere le spese in un messaggio',
    perche: 'L\'app lo fa già, anche senza rete, senza testo libero da indovinare.',
    servirebbe: 'WhatsApp come la riga 19, oppure un bot Telegram', costo: 'WhatsApp come la 19; Telegram 0 €' },
  { numero: 21, chiave: 'assistente', nome: 'Assistente intelligente', gruppo: 'noncollegati',
    cosa: 'Domande in italiano sui dati dello studio',
    perche: 'I dati dei clienti uscirebbero dall\'Unione europea; un modello sul NAS sarebbe troppo lento.',
    servirebbe: 'Un modello in rete', costo: 'circa 1-1,5 $ al mese per 500 domande' },
  { numero: 22, chiave: 'firebase', nome: 'Notifiche immediate', gruppo: 'noncollegati',
    cosa: 'Le notifiche sul telefono nello stesso istante',
    perche: 'Il telefono guarda ogni 15 minuti e basta, senza progetti Google né chiavi. Se servisse l\'immediato, il messaggio direbbe solo "Hai 2 notifiche nuove".',
    servirebbe: 'Un progetto Firebase, la chiave dell\'account di servizio sul NAS, il Play Store sul telefono', costo: '0 €' },
  { numero: 23, chiave: 'postams', nome: 'Email dalla posta Microsoft 365 di Manuel', gruppo: 'scelta',
    cosa: 'Le email di Wisper dalla casella dello studio invece che dal Gmail del postino', esce: 'Una chiave sul NAS che manda posta a nome dello studio',
    costo: '0 € in più (10.000 destinatari al giorno)', regole: 'Microsoft',
    servirebbe: 'Un\'app nel Microsoft 365 di Manuel col permesso di mandare posta' },
  { numero: 24, chiave: 'workspace', nome: 'Google Workspace', gruppo: 'scelta',
    cosa: 'Il foglio e lo script su un account con l\'accordo sul trattamento dei dati', esce: 'Come il postino, con l\'accordo',
    costo: '6,80 € a utente al mese (annuale) o 8,10 € (flessibile)', regole: 'Google',
    servirebbe: 'Spostare il foglio e lo script su un account Workspace' },
  { numero: 25, chiave: 'paghe', nome: 'Programma paghe del consulente', gruppo: 'noncollegati',
    cosa: 'Passare presenze e assenze al programma delle paghe',
    perche: 'Non esiste un formato comune: si esporta il CSV, che c\'è già.',
    servirebbe: 'Un formato comune col consulente', costo: '0 €' },
  { numero: 26, chiave: 'durc', nome: 'DURC On Line e comunicazione all\'Ispettorato', gruppo: 'noncollegati',
    cosa: 'Chiedere il DURC e mandare le comunicazioni da Wisper',
    perche: 'Si entra solo con SPID, CIE o CNS, riservato ai soggetti legittimati: non c\'è un modo per un programma privato. Si fa dai portali.',
    servirebbe: 'Un\'interfaccia per i privati (non esiste)', costo: '0 €' },
];

/**
 * Il controllo di sicurezza (§4.2, §0.2): in pagina sta in Amministrazione › Sicurezza, non nell'elenco delle
 * integrazioni (§9.8), ma risponde a integrazione {chiave: "internetinterno"}.
 */
const SICUREZZA = [
  { numero: null, chiave: 'internetinterno', nome: 'Il server interno non è su internet', gruppo: 'sicurezza', controllo: 'internetinterno', frequenza: 60,
    cosa: 'Nessuna richiesta da internet sulla porta di casa (8400) né sull\'ingresso del NAS (8402)', account: 'nessuno',
    esce: 'Niente', costo: '0 €', regole: '—' },
];

const PER_CHIAVE = new Map(ELENCO.concat(SICUREZZA).map(x => [x.chiave, x]));

function voce(chiave) {
  return PER_CHIAVE.get(chiave) || null;
}

module.exports = { ELENCO, SICUREZZA, voce, DIPENDE };
