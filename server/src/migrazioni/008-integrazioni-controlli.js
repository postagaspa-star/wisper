/*
 * La seconda meta' della migrazione 008 (fase 8, fase8.md §12.5):
 *  - la tabella della ricerca dentro i file (FTS5) solo se il SQLite di Node la sa fare: senza, la migrazione passa lo
 *    stesso e la ricerca resta sui titoli (il controllo "ricerca" lo dice in Integrazioni, §4.2);
 *  - le righe di "integrazioni" dei collegamenti che hanno un controllo vero (§4.2), tutte Da configurare finche' il
 *    primo controllo non gira (pochi minuti dopo l'avvio);
 *  - le righe della lista di controllo (§11.2, §11.3 e il gruppo Il cambio di §10), tutte Da fare (la M15.2 "in attesa
 *    di una scelta" finche' il portale non e' acceso, §0.4);
 *  - ogni file dei documenti che c'erano prende una riga "da leggere" (la lettura parte di notte). Non i documenti delle
 *    persone ne' quelli riservati (§6.1: un errore nei filtri non puo' mostrarne un pezzo), non le revisioni tolte.
 * Le password iniziali: password_iniziale = 0 per tutti (non si sa chi l'ha cambiata), gia' cosi' dalla colonna.
 * Ogni riga nuova di integrazioni e della lista lascia la sua riga nel registro (utente "sistema", azione "migrazione").
 */
'use strict';

const { adesso } = require('../utili');

/** I collegamenti con un controllo vero (§4.2, §0.2: "tailnet" e' diventato "porta"). */
const CON_CONTROLLO = ['postino', 'vies', 'aggiornamenti', 'porta', 'portale', 'calendariofile', 'calendario', 'ricerca', 'copiafuori', 'internetinterno'];

/**
 * Le righe della lista di controllo: [chiave, gruppo, testo, tipo, chi]. tipo: automatica | server | a_mano |
 * prova_generale. Le righe "A + M" dell'accordo sono a_mano: la parte automatica sta gia' nel rapporto delle prove, la
 * riga la segna chi ha fatto anche quella a mano (§18).
 */
const RIGHE = [
  ['M01.1', '01 Dashboard', 'Ogni ruolo vede le sue voci e i suoi quattro riquadri; una cosa, una voce; tetti e Tutto quello che c\'è da fare', 'automatica', 'Andrea'],
  ['M01.2', '01 Dashboard', 'Ogni voce apre la pagina giusta già filtrata (tutte le pagine delle fasi 1-8)', 'automatica', 'Andrea'],
  ['M02.1', '02 Clienti e fornitori', 'Nuovo, cambia, archivia e ripristina; doppione per nome e partita IVA; Controlla la partita IVA', 'automatica', 'Andrea'],
  ['M02.2', '02 Clienti e fornitori', 'Importa da un file CSV ed Excel: nuovi, già presenti, da sistemare; Archivia quelli importati', 'a_mano', 'Andrea'],
  ['M03.1', '03 Commesse', 'Codice che continua; formato cambiato senza ricodificare; prestazioni; duplica come modello; archivia', 'automatica', 'Andrea'],
  ['M03.2', '03 Commesse', 'Costi e margine uguali alla 0.4.0 coi dati della prova generale', 'prova_generale', 'Andrea e Manuel'],
  ['M04.1', '04 Preventivi', 'I 16 casi al centesimo in server, Kotlin e computer; revisione; accettazione; commessa una volta sola', 'automatica', 'Andrea'],
  ['M05.1', '05 Attività e calendario', 'Ricorrenze questa/future/tutte; sovrapposizioni; file ICS valido (righe, UID, ore, giorni interi)', 'automatica', 'Andrea'],
  ['M05.2', '05 Attività e calendario', 'Il file importato in Google Calendar e nel classico Outlook; ICSx⁵ sull\'emulatore che si aggiorna dopo uno spostamento e un annullamento', 'a_mano', 'Andrea'],
  ['M06.1', '06 Ore e rapportini', 'Rapportino a tre passi con firma, coda senza rete, stati che non tornano indietro, approvazioni', 'automatica', 'Andrea'],
  ['M06.2', '06 Ore e rapportini', 'Riepiloghi del mese scorso uguali ai PDF mandati', 'prova_generale', 'Andrea e Manuel'],
  ['M07.1', '07 Spese e trasferte', 'Casi delle ore e spese; rimborsi; foto dello scontrino', 'automatica', 'Andrea'],
  ['M08.1', '08 Fatturazione', 'Casi delle fatture; una cosa fatturata una volta; XML di ritorno; note di credito', 'automatica', 'Andrea'],
  ['M08.2', '08 Fatturazione', 'Regole fiscali confermate dal commercialista', 'server', ''],
  ['M08.3', '08 Fatturazione', 'Il prospetto passato al programma di Manuel e l\'XML emesso tornato in Wisper, con una fattura vera di prova del programma', 'a_mano', 'Manuel'],
  ['M09.1', '09 Banche e scadenze', 'Saldo previsto prudente, sotto soglia, impegni ricorrenti, proposte 1040 e bollo', 'automatica', 'Andrea'],
  ['M10.1', '10 Persone', 'Ferie e saldi, presenze, riservati solo al titolare, registro dei dati riservati', 'automatica', 'Andrea'],
  ['M11.1', '11 Documenti', 'Revisioni con approvazione; collegamenti OneDrive; cerca dentro i file (PDF, DOCX, XLSX, DXF); un file non visto non dà estratti', 'automatica', 'Andrea'],
  ['M12.1', '12 Ticket', 'Priorità, tempi, rapportino del ticket, da ticket a Da fatturare, contratti', 'automatica', 'Andrea'],
  ['M13.1', '13 Mezzi e attrezzature', 'Tarature (avviso e blocco), prestiti, strumenti nel rapportino', 'automatica', 'Andrea'],
  ['M14.1', '14 WhatsApp e comunicazioni', 'Casi di WhatsApp uguali in server, Kotlin e computer; proposte di Da mandare; notifiche alla persona giusta', 'automatica', 'Andrea'],
  ['M15.1', '15 Portale clienti', 'Le 13 prove di sicurezza della fase 7 (le prime 11 automatiche)', 'automatica', 'Andrea'],
  ['M15.2', '15 Portale clienti', 'Dal telefono in 4G: la pagina del portale su Netlify si apre e risponde; il NAS non ha porte aperte', 'a_mano', 'Andrea'],
  ['M16.1', '16 Collaboratori esterni', 'L\'esterno vede solo le sue cose; compensi; DURC', 'automatica', 'Andrea'],
  ['M17.1', '17 Integrazioni', 'Nessuna integrazione in Errore', 'server', ''],
  ['M17.2', '17 Integrazioni', 'Ogni Non collegato ha il motivo in pagina; nessuno stato senza controllo', 'automatica', 'Andrea'],
  ['M18.1', '18 Amministrazione', 'Dati dello studio completi (partita IVA, codice fiscale, indirizzo, albo, polizza)', 'server', ''],
  ['M18.2', '18 Amministrazione', 'Ogni impostazione delle fasi 1-8 ha una schermata o è nell\'elenco di quelle nascoste', 'automatica', 'Andrea'],
  ['M18.3', '18 Amministrazione', 'Senza logo i PDF sono identici a prima; col logo l\'intestazione è giusta in bianco e nero', 'a_mano', 'Andrea'],
  ['T01', 'Permessi', 'Ogni azione del server ha modulo e livello dichiarati (una prova legge l\'elenco delle azioni dal codice)', 'automatica', 'Andrea'],
  ['T02', 'Permessi', 'Per ognuno dei cinque ruoli e per ogni azione: non deve vedere, non deve scrivere; senza costi nessun campo dei soldi', 'automatica', 'Andrea'],
  ['T03', 'Permessi', 'Le quattro persone di prova provano a mano telefono e computer: menu, Dashboard, una scrittura vietata per ruolo', 'a_mano', 'Andrea'],
  ['T04', 'Senza rete', 'Telefono in modalità aereo: quello che si fa senza rete va in coda e parte; quello che si legge si legge; il resto dice "Serve la rete"', 'a_mano', 'Andrea'],
  ['T05', 'Tema scuro', 'Ogni schermata di telefono e computer in chiaro e in scuro confrontata coi prototipi delle fasi 1-8', 'a_mano', 'Andrea'],
  ['T06', 'Accessibilità', 'Contrasto del testo e di bordi e icone; tocchi di almeno 48 dp; bersagli di almeno 24 px sul computer', 'a_mano', 'Andrea'],
  ['T07', 'Accessibilità', 'TalkBack e Narratore nei cinque percorsi principali; fuoco visibile col Tab; testo al 200%; meno animazioni', 'a_mano', 'Andrea'],
  ['T08', 'Privacy', 'Nessun dato vero nel repository e nelle schermate (rilascio.ps1 cerca anche email, IBAN, partite IVA)', 'automatica', 'Andrea'],
  ['T09', 'Privacy', 'Informative, tempi di conservazione, fornitori fuori UE, Gmail o Workspace: confermati col consulente privacy', 'a_mano', 'Andrea e Manuel'],
  ['T10', 'Privacy', 'Le pulizie di conservazione girano (notifiche, accessi del portale, sessioni)', 'server', ''],
  ['T11', 'Sicurezza', 'Il server interno non è su internet; copia fuori casa cifrata; nessuna password iniziale vecchia di più di 7 giorni', 'server', ''],
  ['T12', 'Versioni', 'Tutti i dispositivi usati negli ultimi 30 giorni hanno l\'ultima versione', 'server', ''],
  ['T13', 'Copie', 'Ultima copia riuscita (locale, fuori casa, foglio) nelle ultime 26 ore; prova automatica degli ultimi 30 giorni riuscita', 'server', ''],
  ['T14', 'Copie', 'Ripristino a mano negli ultimi 90 giorni', 'server', ''],
  ['T15', 'Carico', 'Prova di carico con dieci anni di dati finti dentro i tempi (sul NAS la fa Andrea)', 'a_mano', 'Andrea'],
  // Il cambio (§10): prima del cambio (§10.4, con la §0.4), i dieci controlli della prova generale (§10.3), i passi della
  // sera (§10.5), il ritorno chiuso (§10.7).
  ['C01', 'Il cambio', 'Prima: la seconda prova generale ha detto Tutto torna e i 10 controlli sono spuntati', 'a_mano', 'Andrea'],
  ['C02', 'Il cambio', 'Prima: le prove automatiche della versione da installare passano tutte e le righe prima del cambio sono Fatte', 'automatica', 'Andrea'],
  ['C03', 'Il cambio', 'Prima: la versione nuova delle app è pubblicata, o gli APK e l\'exe sono pronti da installare a mano', 'a_mano', 'Andrea'],
  ['C04', 'Il cambio', 'Prima: il server sul NAS ha la versione giusta, risponde a /salute, ha fatto una copia riuscita (locale e fuori casa) e la prova di ripristino di quella copia è riuscita', 'a_mano', 'Andrea'],
  ['C05', 'Il cambio', 'Prima: Code.gs col ponte e il postino e Porta.gs sono incollati, c\'è la Nuova versione del deployment, la porta Google è accesa e PONTE_PORTA non è ancora impostato', 'a_mano', 'Andrea'],
  ['C06', 'Il cambio', 'Prima: Manuel ha mandato i riepiloghi del mese e segnato i fatturati; sul suo telefono non ci sono rapportini in coda', 'a_mano', 'Manuel'],
  ['C07', 'Il cambio', 'Prima: Andrea ha 3 ore libere (la seconda prova generale dice quanto serve: si prende il doppio)', 'a_mano', 'Andrea'],
  ['G01', 'Il cambio', 'Prova generale: il riepilogo del mese scorso di ogni cliente ha lo stesso totale del PDF che Manuel ha mandato', 'prova_generale', 'Andrea e Manuel'],
  ['G02', 'Il cambio', 'Prova generale: Elettrodinamica, ore, km e totale del mese corrente uguali alla Fine mese di Wisper Ufficio 0.3.6', 'prova_generale', 'Andrea e Manuel'],
  ['G03', 'Il cambio', 'Prova generale: commesse, codici, budget, ore e margine uguali (le commesse con la barra rossa sono le stesse)', 'prova_generale', 'Andrea e Manuel'],
  ['G04', 'Il cambio', 'Prova generale: l\'ultimo rapportino scritto c\'è, con la firma e le foto che si aprono', 'prova_generale', 'Andrea e Manuel'],
  ['G05', 'Il cambio', 'Prova generale: un rapportino di un anno fa c\'è, con lo stato giusto (Fatturato)', 'prova_generale', 'Andrea e Manuel'],
  ['G06', 'Il cambio', 'Prova generale: i clienti sono gli stessi, con partite IVA e telefoni con lo zero davanti', 'prova_generale', 'Andrea e Manuel'],
  ['G07', 'Il cambio', 'Prova generale: le impostazioni (rimborso km, costo orario, dati dello studio) sono quelle del foglio', 'prova_generale', 'Andrea e Manuel'],
  ['G08', 'Il cambio', 'Prova generale: la Dashboard non ha voci strane (giorni senza rapportino veri, non inventati)', 'prova_generale', 'Andrea e Manuel'],
  ['G09', 'Il cambio', 'Prova generale: il PDF di un rapportino rifatto da Wisper nuovo è uguale a quello di prima', 'prova_generale', 'Andrea e Manuel'],
  ['G10', 'Il cambio', 'Prova generale: i tempi, importazione e copia dei file, in minuti', 'prova_generale', 'Andrea e Manuel'],
  ['E01', 'Il cambio', 'Sera, 18:00: Manuel smette di scrivere in Wisper; sul telefono la pillola della rete è sparita; Wisper Ufficio chiuso', 'a_mano', 'Manuel'],
  ['E02', 'Il cambio', 'Sera, 18:05: la fotografia del prima (Fine mese di questo mese e del mese scorso, Commesse, Clienti) fuori da OneDrive', 'a_mano', 'Andrea'],
  ['E03', 'Il cambio', 'Sera, 18:15: il foglio vero scaricato in Excel e copiato sul NAS nella cartella del cambio', 'a_mano', 'Andrea'],
  ['E04', 'Il cambio', 'Sera, 18:25: server fermo; la cartella dei dati di prova messa da parte (non si cancella)', 'a_mano', 'Andrea'],
  ['E05', 'Il cambio', 'Sera, 18:30: importazione in una cartella nuova', 'a_mano', 'Andrea'],
  ['E06', 'Il cambio', 'Sera, 18:45: controllo.html dice Tutto torna, "Da sapere" uguale alla seconda prova', 'a_mano', 'Andrea'],
  ['E07', 'Il cambio', 'Sera, 18:50: i file copiati da Drive (quelli che mancano annotati)', 'a_mano', 'Andrea'],
  ['E08', 'Il cambio', 'Sera, 19:30: l\'utente del titolare (la password la scrive Manuel) e quello di Andrea', 'a_mano', 'Andrea e Manuel'],
  ['E09', 'Il cambio', 'Sera, 19:40: server acceso, /salute risponde, nei log la migrazione 008 e la copia pianificata', 'a_mano', 'Andrea'],
  ['E10', 'Il cambio', 'Sera, 19:45: PONTE_PORTA = si nelle proprietà dello script del foglio; da qui il foglio non si scrive più', 'a_mano', 'Andrea'],
  ['E11', 'Il cambio', 'Sera, 19:50: nuovo export del foglio e importa.js --confronta: zero differenze', 'a_mano', 'Andrea'],
  ['E12', 'Il cambio', 'Sera, 20:00: Fai una copia adesso riuscita (locale, fuori casa, foglio); Postino e VIES Collegato; Manda una prova degli avvisi', 'a_mano', 'Andrea'],
  ['E13', 'Il cambio', 'Sera, 20:15: prove di fumo col telefono e col computer di Manuel (Dashboard, Fine mese, ultimo rapportino, un PDF)', 'a_mano', 'Andrea e Manuel'],
  ['E14', 'Il cambio', 'Sera, 20:30: stasera nessuna scrittura di prova nei dati veri; il primo rapportino vero domani', 'a_mano', 'Manuel'],
  ['E15', 'Il cambio', 'Sera, 20:30: Cambio fatto (segnato nella lista di controllo)', 'a_mano', 'Andrea'],
  ['R01', 'Il cambio', 'Ritorno chiuso: la prima fine mese col gestionale torna e la finestra del ritorno indietro si chiude', 'a_mano', 'Andrea'],
];

/** Le righe "in attesa di una scelta" alla nascita: M15.2 finche' il portale non e' acceso (§0.4). */
const IN_ATTESA = ['M15.2'];

function annota(db, ora, tabella, id, dopo, nota) {
  db.esegui(
    'INSERT INTO registro (quando, utente_id, utente, disp, azione, tabella, id_riga, prima, dopo, nota) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ora, null, 'sistema', '', 'migrazione', tabella, String(id), null, dopo ? JSON.stringify(dopo) : null, nota || '');
}

/** SQLite ha FTS5? (Il Node 24 del server si', provato il 22/10; la prova senza FTS5 la imita con WISPER_SENZA_FTS5.) */
function haFts5(db) {
  try {
    return db.righe('PRAGMA compile_options').some(r => Object.values(r)[0] === 'ENABLE_FTS5');
  } catch (e) {
    return false;
  }
}

module.exports = function migrazione008(db) {
  const ora = adesso();

  // ---- la ricerca dentro i file (§6, §12.4)
  if (haFts5(db)) {
    db.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS file_testo USING fts5(testo, file_id UNINDEXED, tokenize='unicode61 remove_diacritics 2')");
  }

  // ---- integrazioni (§12.5)
  for (const chiave of CON_CONTROLLO) {
    if (db.riga('SELECT chiave FROM integrazioni WHERE chiave = ?', chiave)) continue;
    db.esegui("INSERT INTO integrazioni (chiave, stato, modificato) VALUES (?, 'da_configurare', ?)", chiave, ora);
    annota(db, ora, 'integrazioni', chiave, { chiave, stato: 'da_configurare' }, 'migrazione 008: collegamento con un controllo');
  }

  // ---- la lista di controllo (§11)
  RIGHE.forEach(([chiave, gruppo, testo, tipo, chi], i) => {
    if (db.riga('SELECT chiave FROM controlli_finali WHERE chiave = ?', chiave)) return;
    const stato = IN_ATTESA.indexOf(chiave) >= 0 ? 'attesa' : 'da_fare';
    db.esegui('INSERT INTO controlli_finali (chiave, gruppo, ordine, testo, tipo, chi, stato) VALUES (?, ?, ?, ?, ?, ?, ?)', chiave, gruppo, i + 1, testo, tipo, chi, stato);
    annota(db, ora, 'controlli_finali', chiave, { chiave, gruppo, tipo, stato }, 'migrazione 008: riga della lista di controllo');
  });

  // ---- i file dei documenti di prima: da leggere (non quelli delle persone, non i riservati, non le revisioni tolte)
  const daLeggere = db.righe(
    'SELECT DISTINCT v.file_id FROM documento_versioni v JOIN documenti d ON d.id = v.documento_id JOIN file f ON f.id = v.file_id ' +
    "WHERE v.file_id IS NOT NULL AND v.tolta IS NULL AND d.persona_id IS NULL AND d.vede <> 'riservati' AND f.svuotato IS NULL ORDER BY v.file_id");
  for (const r of daLeggere) db.esegui("INSERT OR IGNORE INTO file_lettura (file_id, stato) VALUES (?, 'da_leggere')", r.file_id);
  return daLeggere.length;
};

Object.defineProperties(module.exports, {
  CON_CONTROLLO: { value: CON_CONTROLLO },
  RIGHE_CONTROLLI: { value: RIGHE },
  haFts5: { value: haFts5 },
});
