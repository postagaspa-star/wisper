// Le regole della fase 8 di Wisper Ufficio (integrazioni, calendario in altre app, ricerca dentro i file, importa ed
// esporta, Dashboard, funzioni accese, numerazioni, impostazioni generali, notifiche, lista di controllo, stato e copie),
// i dati di esempio della fase 8 e il logo sui PDF, provati con Node. Le parole sono quelle di docs/gestionale/fase8.md.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const C = require('../ui/conti.js');
global.WisperConti = C;
const R = require('../ui/regole.js');
global.WisperRegole = R;
const Q = require('../ui/regole-fase8.js');
const D = require('../ui/documenti.js');
const E = require('../ui/esempio.js');
const E8 = require('../ui/esempio8.js');

const OGGI = new Date('2026-10-22T10:05:00');
const CASI_NUMERAZIONI = path.join(__dirname, '..', '..', 'server', 'prove', 'casi-numerazioni.json');

// ------------------------------------------------------------------ integrazioni (§4)

test('integrazioni: le parole dello stato coi loro colori, e "Dipende da una scelta" per quelli di Andrea (§4.1, §15)', () => {
  assert.deepEqual(Q.pillola({ stato: 'collegato' }), { parola: 'Collegato', colore: 'verde' });
  assert.deepEqual(Q.pillola({ stato: 'da_configurare' }), { parola: 'Da configurare', colore: 'giallo' });
  assert.deepEqual(Q.pillola({ stato: 'errore' }), { parola: 'Errore', colore: 'rosso' });
  assert.deepEqual(Q.pillola({ stato: 'non_collegato' }), { parola: 'Non collegato', colore: 'tratteggiata' });
  assert.deepEqual(Q.pillola({ stato: 'in_corso' }), { parola: 'In corso', colore: 'blu' });
  assert.deepEqual(Q.pillola({ stato: 'non_collegato', gruppo: 'scelta' }), { parola: 'Dipende da una scelta', colore: 'grigio' });
  assert.equal(Q.statoVisto({ stato: 'inventato' }), 'non_collegato', 'uno stato che non si conosce non diventa verde');
  assert.equal(Q.statoVisto({}), 'non_collegato');
});

test('integrazioni: "controllato oggi alle 10:00", ieri, il 18/10; niente data per i Non collegato; da allora nessun controllo', () => {
  assert.equal(Q.quandoControllato({ stato: 'collegato', controllato: '2026-10-22T10:00:00' }, OGGI), 'controllato oggi alle 10:00');
  assert.equal(Q.quandoControllato({ stato: 'errore', controllato: '2026-10-21T02:31:00' }, OGGI), 'controllato ieri alle 2:31');
  assert.equal(Q.quandoControllato({ stato: 'collegato', controllato: '2026-10-18T06:00:00' }, OGGI), 'controllato il 18/10');
  assert.equal(Q.quandoControllato({ stato: 'collegato', controllato: '2025-12-18T06:00:00' }, OGGI), 'controllato il 18/12/2025');
  assert.equal(Q.quandoControllato({ stato: 'non_collegato', controllato: '2026-10-22T10:00:00' }, OGGI), '');
  assert.equal(Q.quandoControllato({ stato: 'non_collegato', gruppo: 'scelta' }, OGGI), '');
  assert.equal(Q.vecchio({ stato: 'collegato', controllato: '2026-10-22T07:00:00', ogniMinuti: 60 }, OGGI), 'da allora nessun controllo', 'più vecchio del doppio della frequenza');
  assert.equal(Q.vecchio({ stato: 'collegato', controllato: '2026-10-22T09:00:00', ogniMinuti: 60 }, OGGI), '');
  assert.equal(Q.vecchio({ stato: 'collegato', controllato: '2026-10-01T09:00:00' }, OGGI), '', 'senza la frequenza dal server, niente frase inventata');
  assert.ok(Q.unoFallito({ stato: 'collegato', erroriDiFila: 1 }), 'uno solo fallito: resta Collegato con la frase');
  assert.ok(!Q.unoFallito({ stato: 'errore', erroriDiFila: 2 }));
  assert.equal(Q.tempo(412), '412 ms');
  assert.equal(Q.tempo(8000), '8 s');
  assert.equal(Q.tempo(1500), '1,5 s');
  assert.equal(Q.tempo(null), '');
});

test('integrazioni: i campi del server (stato "dipende", vecchio, ultimoNonRiuscito, frequenza) si leggono come le parole di §4.1', () => {
  assert.equal(Q.statoVisto({ stato: 'dipende', gruppo: 'scelta' }), 'scelta');
  assert.deepEqual(Q.pillola({ stato: 'dipende' }), { parola: 'Dipende da una scelta', colore: 'grigio' });
  assert.equal(Q.vecchio({ stato: 'collegato', controllato: '2026-10-22T09:00:00', vecchio: true }, OGGI), 'da allora nessun controllo', 'lo dice il server');
  assert.equal(Q.vecchio({ stato: 'collegato', controllato: '2026-10-22T07:00:00', frequenza: 60 }, OGGI), 'da allora nessun controllo', 'o la frequenza del catalogo');
  assert.ok(Q.unoFallito({ stato: 'collegato', ultimoNonRiuscito: true }));
  assert.equal(Q.campiDaCompletare(['Codice destinatario', 'PEC']), 'Si aggiunge il codice destinatario e la PEC: il resto c\'è già');
  assert.equal(Q.campiDaCompletare(['codiceSdi']), 'Si aggiunge il codice SDI: il resto c\'è già');
  assert.equal(Q.campiDaCompletare([]), 'Si completano solo i campi vuoti');
});

test('integrazioni: segmenti coi numeri, si apre su Da sistemare se c\'è un Errore, la fascia rossa (§4.3)', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const lista = E.gestisci(dati, 'GET', '/server/integrazioni', {}).integrazioni;
  assert.equal(lista.length, 26, 'i 26 collegamenti dell\'elenco unico');
  const n = Q.numeriIntegrazioni(lista);
  assert.equal(n.tutti, 26);
  assert.equal(n.errori, 1);
  assert.equal(n.noncollegati, 10);
  assert.equal(n.collegati + n.sistemare + n.noncollegati, n.tutti, 'ogni collegamento sta in un segmento solo');
  assert.equal(Q.segmentoIniziale(lista), 'sistemare');
  assert.equal(Q.segmentoIniziale(lista.filter(i => i.stato !== 'errore')), 'tutti');
  assert.deepEqual(Q.fascia(lista), { chiave: 'vies', testo: 'Verifica della partita IVA · Il servizio europeo non risponde: riprova più tardi', provaAdesso: true });
  assert.ok(lista.filter(i => i.gruppo === 'noncollegati').every(i => i.perche && i.servirebbe), 'ogni Non collegato ha il motivo e cosa servirebbe');
  assert.ok(Q.provaGialla({ stato: 'errore' }) && !Q.provaGialla({ stato: 'collegato' }), 'il giallo è Prova adesso solo in Errore');
});

test('integrazioni: nessun segreto in pagina (§4.4): indirizzi e chiavi diventano parole', () => {
  assert.equal(Q.senzaSegreti('Risponde da https://script.google.com/macros/s/AKfycbx/exec'), 'Risponde da (indirizzo)');
  assert.equal(Q.senzaSegreti('chiave ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678 tolta'), 'chiave (chiave) tolta');
  assert.equal(Q.senzaSegreti('Il servizio europeo non risponde'), 'Il servizio europeo non risponde');
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const tutto = JSON.stringify(E.gestisci(dati, 'GET', '/server/integrazioni', {}));
  assert.ok(!/https?:\/\//.test(tutto) && !/SEGRETO_|TOKEN|password/i.test(tutto), 'le risposte di esempio non hanno indirizzi né segreti');
});

test('integrazioni nei dati di esempio: Prova adesso una volta al minuto; un Non collegato non si prova; il collaboratore non vede', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const r = E.gestisci(dati, 'POST', '/server/provaIntegrazione', { chiave: 'vies' });
  assert.equal(r.ok, true);
  assert.equal(r.integrazione.stato, 'collegato');
  assert.equal(E.gestisci(dati, 'POST', '/server/provaIntegrazione', { chiave: 'vies' }).errore, 'Hai appena provato: riprova fra un minuto');
  assert.equal(E.gestisci(dati, 'POST', '/server/provaIntegrazione', { chiave: 'sdi' }).errore, 'Non è collegato: non c\'è niente da provare');
  assert.equal(E.gestisci(E.crea({ chi: 'marco', oggi: '2026-10-22' }), 'GET', '/server/integrazioni', {}).permesso, false);
  assert.equal(E.gestisci(E.crea({ chi: 'lettura', oggi: '2026-10-22' }), 'POST', '/server/provaIntegrazione', { chiave: 'vies' }).permesso, false, 'la lettura vede ma non prova');
});

// ------------------------------------------------------------------ il calendario in altre app (§5)

test('calendario: il nome dell\'app che legge, cosa c\'è dentro, l\'ultima lettura, il nome e i 5 indirizzi', () => {
  assert.equal(Q.nomeAgente('ICSx5/2.4.3 (ical4j/3.2)'), 'ICSx⁵');
  assert.equal(Q.nomeAgente('Microsoft Office/16.0 (Outlook)'), 'Microsoft Outlook');
  assert.equal(Q.nomeAgente('Google-Calendar-Importer'), 'Google Calendar');
  assert.equal(Q.nomeAgente(''), '');
  assert.equal(Q.cosaFeed({ attivita: 'mie', assenze: true, scadenze: false }), 'Le mie cose · ferie e assenze');
  assert.equal(Q.cosaFeed({ attivita: 'studio', assenze: true, scadenze: true }), 'Tutto lo studio · ferie e assenze · scadenze');
  assert.equal(Q.letturaFeed({ ultimoUso: '2026-10-22T09:40:00', agente: 'ICSx5/2.4.3' }, OGGI), 'letto oggi alle 9:40 · ICSx⁵');
  assert.equal(Q.letturaFeed({ ultimoUso: '' }, OGGI), 'Mai letto');
  assert.equal(Q.erroreNomeFeed('  ', []), 'Nome: scrivi un nome per riconoscerlo');
  assert.equal(Q.erroreNomeFeed('Tablet', [1, 2, 3, 4, 5].map(id => ({ id }))), 'Hai già 5 indirizzi: togline uno');
  assert.equal(Q.erroreNomeFeed('Tablet', [{ id: 1, revocatoIl: '2026-10-01' }]), '');
});

test('calendario nei dati di esempio: nuovo indirizzo una volta sola, al massimo 5, fuori casa solo se acceso, il file da scaricare', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const r = E.gestisci(dati, 'POST', '/server/nuovoFeed', { nome: 'Tablet di Manuel', cosa: { attivita: 'mie', assenze: true, scadenze: false }, dettagli: true });
  assert.equal(r.ok, true);
  assert.match(r.indirizzo, /\/calendario\/.+\.ics$/);
  assert.equal(r.webcal.indexOf('webcal://'), 0);
  const lista = E.gestisci(dati, 'GET', '/server/feedCalendario', {}).feed;
  assert.ok(lista.every(f => !f.indirizzo && !f.chiave), 'l\'indirizzo si vede solo alla creazione');
  assert.equal(E.gestisci(dati, 'POST', '/server/nuovoFeed', { nome: 'Fuori', pubblico: true }).errore, 'Il calendario fuori casa non è acceso');
  for (let i = 0; i < 2; i++) E.gestisci(dati, 'POST', '/server/nuovoFeed', { nome: 'Altro ' + i });
  assert.equal(E.gestisci(dati, 'POST', '/server/nuovoFeed', { nome: 'Sesto' }).errore, 'Hai già 5 indirizzi: togline uno');
  const f = E.gestisci(dati, 'POST', '/server/esportaCalendario', { cosa: 'mie', assenze: true });
  assert.match(f.nome, /^wisper-calendario-manuel-2026-10-22\.ics$/);
  assert.match(Buffer.from(f.base64, 'base64').toString('utf8'), /^BEGIN:VCALENDAR\r\n/);
  assert.equal(E.gestisci(E.crea({ chi: 'marco', oggi: '2026-10-22' }), 'POST', '/server/esportaCalendario', { cosa: 'studio' }).permesso, false, 'Tutto lo studio non è del collaboratore');
});

// ------------------------------------------------------------------ cercare dentro i file (§6)

test('ricerca: l\'estratto con le parole in grassetto, la revisione superata, la riga calma della lettura', () => {
  assert.deepEqual(Q.pezziEstratto('…la verifica dell\'impianto di [terra] è stata eseguita…'),
    [{ testo: '…la verifica dell\'impianto di ', forte: false }, { testo: 'terra', forte: true }, { testo: ' è stata eseguita…', forte: false }]);
  assert.deepEqual(Q.pezziEstratto('[QG-PE] e [terra]').filter(p => p.forte).map(p => p.testo), ['QG-PE', 'terra']);
  assert.deepEqual(Q.pezziEstratto('senza parentesi'), [{ testo: 'senza parentesi', forte: false }]);
  assert.equal(Q.doveTrovato({ revisione: 1, superata: true }), 'nella rev. 1 (superata)');
  assert.equal(Q.doveTrovato({ revisione: 2, superata: false }), '');
  assert.equal(Q.statoLettura({ stato: 'letto', pagine: 12, letto: '2026-10-21T16:40:00' }, OGGI), 'Testo letto il 21/10 · 12 pagine');
  assert.equal(Q.statoLettura({ stato: 'senza_testo' }), 'Senza testo: è una scansione o un disegno');
  assert.equal(Q.statoLettura({ stato: 'non_si_legge' }), 'Non si legge');
  assert.equal(Q.statoLettura({ stato: 'in_parte' }), 'Letto in parte: è molto lungo');
  assert.equal(Q.statoLettura({ stato: 'da_leggere' }), 'Da leggere');
  assert.equal(Q.statoLettura({}), '');
});

test('ricerca nei dati di esempio: "terra" trova il verbale per titolo e due documenti dentro il testo, coi loro estratti', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const r = E.gestisci(dati, 'GET', '/server/documenti?archivio=1&testo=terra', {});
  const titoli = r.documenti.map(d => d.titolo);
  assert.ok(titoli.indexOf('Verbale verifica impianto di terra 2026') === 0, 'prima quello col titolo');
  const dentro = r.documenti.filter(d => d.trovato);
  assert.equal(dentro.length, 2);
  assert.ok(dentro.every(d => /\[terra\]/i.test(d.trovato.estratto)));
  assert.ok(!titoli.includes('Verbale DPR 462 del 2019'), 'una scansione non si trova dentro');
});

// ------------------------------------------------------------------ importa ed esporta (§7)

test('importa: il giallo "Importa 42 e completa 7", l\'esito, le colonne che servono', () => {
  assert.equal(Q.testoImporta(42, 7), 'Importa 42 e completa 7');
  assert.equal(Q.testoImporta(42, 0), 'Importa 42');
  assert.equal(Q.testoImporta(0, 7), 'Completa 7');
  assert.equal(Q.esitoImport({ nuovi: 42, completati: 7, saltati: 3 }, 'clienti'), 'Importati 42 clienti, completati 7, saltati 3');
  assert.equal(Q.esitoImport({ nuovi: 2, completati: 0, saltati: 0 }, 'fornitori'), 'Importati 2 fornitori, completati 0, saltati 0');
  assert.equal(Q.erroreColonne([{ campo: 'partitaIva' }], 'clienti'), 'Scegli quale colonna è il nome');
  assert.equal(Q.erroreColonne([{ campo: 'nome' }], 'colonna'), 'Scegli quale colonna dice se è cliente o fornitore');
  assert.equal(Q.erroreColonne([{ campo: 'nome' }, { campo: 'pec' }, { campo: 'pec' }], 'clienti'), 'PEC: l\'hai scelto per due colonne');
  assert.equal(Q.erroreColonne([{ campo: 'nome' }, { campo: '' }], 'clienti'), '');
  assert.equal(Q.grandezza(3480112), '3,5 MB');
});

test('importa nei dati di esempio: le colonne proposte dai nomi, nuovi, già in Wisper (solo i campi vuoti), da sistemare; poi l\'archivio', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const csv = 'Ragione sociale;P.IVA;Cod. destinatario;PEC;Città;Fax\r\nVerdi Impianti Snc;;ABC1234;verdi@pec.esempio.it;Thiene;0445\r\nRossi Impianti Srl;;XYZ9876;;Bassano;\r\nBianchi Elettro;12345678901;;;Marostica;\r\n;;;;Vicenza;\r\n';
  const l = E.gestisci(dati, 'POST', '/server/leggiImport', { nome: 'clienti-fatture.csv', base64: Buffer.from(csv).toString('base64') });
  assert.equal(l.righe, 4);
  assert.deepEqual(l.colonne.map(c => c.campo), ['nome', 'partitaIva', 'codiceSdi', 'pec', 'citta', ''], 'Fax non si importa');
  const k = E.gestisci(dati, 'POST', '/server/controllaImport', { idLettura: l.idLettura, colonne: l.colonne, tipo: 'clienti' });
  assert.equal(k.nuovi, 1);
  assert.equal(k.completati, 1);
  assert.deepEqual(k.daSistemare.map(x => x.errore), ['Partita IVA: il numero non torna, controlla le cifre', 'Nome: scrivi il nome o la ragione sociale']);
  const rossiPrima = JSON.parse(JSON.stringify(dati.ana.soggetti.find(s => s.id === 'C002')));
  const i = E.gestisci(dati, 'POST', '/server/importaSoggetti', { idLettura: l.idLettura, colonne: l.colonne, tipo: 'clienti' });
  assert.deepEqual(i.importazione && [i.importazione.nuovi, i.importazione.completati, i.importazione.saltati], [1, 1, 2]);
  const rossi = dati.ana.soggetti.find(s => s.id === 'C002');
  assert.equal(rossi.citta, rossiPrima.citta, 'un campo pieno non si sovrascrive mai');
  assert.equal(rossi.codiceSdi, rossiPrima.codiceSdi || 'XYZ9876', 'si completano solo i vuoti');
  const a = E.gestisci(dati, 'POST', '/server/archiviaImportati', { idImportazione: i.importazione.id });
  assert.equal(a.archiviati, 1);
  assert.equal(E.gestisci(E.crea({ chi: 'laura', oggi: '2026-10-22' }), 'POST', '/server/esportaTutto', {}).permesso, false, 'Esporta tutto è solo del titolare');
});

// ------------------------------------------------------------------ Dashboard (§8)

test('Dashboard: Altre N, i riquadri per ruolo, il numero e il rosso, Cambia i riquadri (§8.2-§8.4)', () => {
  assert.equal(Q.altre(7, 13), 6);
  assert.equal(Q.altre(5, 5), 0);
  assert.deepEqual(Q.RIQUADRI_BASE.titolare, ['daFatturare', 'scaduto', 'ticketAperti', 'daApprovare']);
  assert.deepEqual(Q.RIQUADRI_BASE.collaboratore, ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'daMandareOggi']);
  const lett = Q.riquadriPossibili(E.permessiDi('lettura'), { ruolo: 'lettura', approva: false });
  assert.ok(lett.indexOf('daApprovare') < 0, 'la lettura non ha cose da approvare');
  assert.ok(Q.RIQUADRI_BASE.lettura.every(k => lett.indexOf(k) >= 0), 'i quattro di base della lettura si possono scegliere');
  const coll = Q.riquadriPossibili(E.permessiDi('collaboratore'), { ruolo: 'collaboratore', approva: false });
  assert.ok(coll.indexOf('daFatturare') < 0 && coll.indexOf('tarateScadute') < 0, 'niente soldi né tarature di tutti');
  assert.ok(Q.RIQUADRI_BASE.collaboratore.every(k => coll.indexOf(k) >= 0));
  assert.deepEqual(Q.riquadriPossibili({}, {}, ['scaduto', { chiave: 'ticketAperti' }, 'inventato']), ['scaduto', 'ticketAperti'], 'se il server manda la lista, vale quella');
  assert.equal(Q.numeroRiquadro({ numero: 2180.4, unita: 'euro' }), C.euro(2180.4));
  assert.equal(Q.numeroRiquadro({ numero: 31.5, unita: 'ore' }), '31,5 h');
  assert.equal(Q.numeroRiquadro({ numero: 5 }), '5');
  assert.ok(Q.rossoRiquadro({ chiave: 'scaduto', numero: 10 }) && !Q.rossoRiquadro({ chiave: 'scaduto', numero: 0 }) && !Q.rossoRiquadro({ chiave: 'daFatturare', numero: 9 }));
  assert.equal(Q.erroreRiquadri(['a', 'b', 'c']), 'Scegline 4: ne hai scelti 3');
  assert.equal(Q.erroreRiquadri(['a', 'b', 'c', 'd']), '');
  assert.deepEqual(Q.toccaRiquadro(['a', 'b', 'c'], 'd'), ['a', 'b', 'c', 'd'], 'l\'ordine è quello del tocco');
  assert.deepEqual(Q.toccaRiquadro(['a', 'b', 'c', 'd'], 'e'), ['a', 'b', 'c', 'd'], 'oltre 4 non si aggiunge');
  assert.deepEqual(Q.toccaRiquadro(['a', 'b', 'c', 'd'], 'b'), ['a', 'c', 'd']);
});

test('numerini del menu (§8.6): una regola sola, oltre 99 "99+", zero niente', () => {
  assert.equal(Q.numerino(0), '');
  assert.equal(Q.numerino(3), '3');
  assert.equal(Q.numerino(99), '99');
  assert.equal(Q.numerino(100), '99+');
  assert.equal(Q.numerino(undefined), '');
});

test('Dashboard nei dati di esempio: tetti 7 · 7 · 5, quante, campi nuovi, voci di sistema solo a chi può, riquadri della persona', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const d = E.gestisci(dati, 'GET', '/server/dashboard', {});
  assert.ok(d.settimana.length <= 7 && d.pianificare.length <= 5, 'i tetti');
  assert.ok(d.quante.settimana >= d.settimana.length && d.quante.pianificare >= d.pianificare.length);
  assert.ok([].concat(d.urgenti, d.settimana, d.pianificare).every(v => v.oggetto && v.area && v.famiglia), 'ogni voce ha oggetto, famiglia e area');
  assert.ok(d.pianificare.every(v => v.nascondibile === (v.gravita === 'info')), 'nascondibili solo le info di Da pianificare');
  const tutto = E.gestisci(dati, 'GET', '/server/dashboard?tutto=1', {});
  assert.equal(tutto.pianificare.length, tutto.quante.pianificare, 'con tutto: true nessun tetto');
  assert.ok([].concat(d.settimana, d.pianificare).some(v => v.tipo === 'sistema'), 'il titolare ha le voci di sistema');
  assert.deepEqual(d.riquadri.map(r => r.chiave), Q.RIQUADRI_BASE.titolare);
  const marco = E.gestisci(E.crea({ chi: 'marco', oggi: '2026-10-22' }), 'GET', '/server/dashboard', {});
  assert.ok(![].concat(marco.urgenti, marco.settimana, marco.pianificare).some(v => v.tipo === 'sistema'), 'il collaboratore no');
  assert.deepEqual(marco.riquadri.map(r => r.chiave), Q.RIQUADRI_BASE.collaboratore);
  E.gestisci(dati, 'POST', '/server/salvaRiquadri', { riquadri: ['commesseAperte', 'daIncassare', 'scaduto', 'assentiOggi'] });
  assert.deepEqual(E.gestisci(dati, 'GET', '/server/dashboard', {}).riquadri.map(r => r.chiave), ['commesseAperte', 'daIncassare', 'scaduto', 'assentiOggi']);
  const v = d.pianificare.find(x => x.nascondibile);
  if (v) {
    E.gestisci(dati, 'POST', '/server/nascondiVoce', { oggetto: v.oggetto });
    const dopo = E.gestisci(dati, 'GET', '/server/dashboard?tutto=1', {});
    assert.ok(!dopo.pianificare.some(x => x.oggetto === v.oggetto) && dopo.nascoste === 1, 'nascosta per 30 giorni');
    E.gestisci(dati, 'POST', '/server/mostraNascoste', {});
    assert.equal(E.gestisci(dati, 'GET', '/server/dashboard', {}).nascoste, 0);
  }
});

// ------------------------------------------------------------------ funzioni accese (§9.5)

test('funzioni accese: le cinque che si spengono, la frase, la riga dell\'elenco, il menu senza le spente', () => {
  assert.deepEqual(Object.keys(Q.SPEGNIBILI), ['portale', 'comunicazioni', 'collaboratori', 'mezzi', 'banche']);
  assert.deepEqual(Q.domandaSpegni({ modulo: 'mezzi', nome: 'Mezzi e attrezzature' }),
    { titolo: 'Spegnere Mezzi e attrezzature?', testo: 'Sparisce dal menu di tutti. Nei rapportini non si scelgono più gli strumenti. I dati restano.' });
  assert.equal(Q.rigaFunzioni([{ nome: 'A', accesa: true }, { nome: 'Portale clienti', accesa: false }, { nome: 'C' }]), '2 di 3 · Portale clienti spento');
  const voci = R.vociMenu(E.permessiDi('titolare'));
  assert.ok(Q.senzaSpente(voci, ['mezzi']).every(v => v.modulo !== 'mezzi'));
  assert.equal(Q.senzaSpente(voci, undefined).length, voci.length);
});

test('funzioni accese nei dati di esempio: solo il titolare spegne; spenta = livello 0 e via dal menu; riaccesa uguale', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  assert.equal(E.gestisci(E.crea({ chi: 'laura', oggi: '2026-10-22' }), 'POST', '/server/salvaFunzioni', { modulo: 'mezzi', accesa: false }).permesso, false);
  assert.equal(E.gestisci(dati, 'POST', '/server/salvaFunzioni', { modulo: 'rapportini', accesa: false }).errore, 'Questa funzione resta sempre accesa');
  E.gestisci(dati, 'POST', '/server/salvaFunzioni', { modulo: 'mezzi', accesa: false });
  const io = E.gestisci(dati, 'GET', '/server/io', {});
  assert.deepEqual(io.interfaccia.funzioniSpente, ['mezzi']);
  assert.equal(io.permessi.mezzi, 0);
  assert.ok(R.vociMenu(io.permessi).every(v => v.modulo !== 'mezzi'));
  E.gestisci(dati, 'POST', '/server/salvaFunzioni', { modulo: 'mezzi', accesa: true });
  assert.deepEqual(E.gestisci(dati, 'GET', '/server/io', {}).interfaccia.funzioniSpente, []);
  const f = E.gestisci(dati, 'GET', '/server/funzioni', {}).funzioni;
  assert.equal(f.length, 18);
  assert.equal(f.filter(x => x.spegnibile).length, 5);
});

// ------------------------------------------------------------------ numerazioni e il codice commessa (§9.6)

test('numerazioni: codiceDa coi casi di §9.6 (26ST047, 26ST1000, ST26-0048, anno che cambia, solo numero, 48 e 49)', () => {
  assert.equal(Q.codiceDa('{AA}ST{NNN}', 2026, 47), '26ST047');
  assert.equal(Q.codiceDa('{AA}ST{NNN}', 2026, 1000), '26ST1000', 'il numero non si taglia');
  assert.equal(Q.codiceDa('ST{AA}-{NNNN}', 2026, 48), 'ST26-0048');
  assert.equal(Q.codiceDa('{AAAA}/{NN}', 2026, 5), '2026/05');
  assert.equal(Q.codiceDa('RAP/{AAAA}/{NNNN}', 2026, 156), 'RAP/2026/0156');
  assert.equal(Q.codiceDa('{AA}ST{NNN}', 2027, 48), '27ST048', 'a gennaio cambia l\'anno, il numero continua');
  assert.equal(Q.codiceDa('{NNNN}', 2026, 48), '0048');
  assert.equal(Q.prossimoNumero(47, []), 48);
  assert.equal(Q.prossimoNumero(47, ['26ST047', '26ST048']), 49, 'due di fila senza rete: 48 e 49');
  assert.equal(Q.prossimoNumero(10, ['26ST047', 'ST26-0012']), 48, 'continua dal più alto, anche col formato di prima');
  assert.equal(Q.numeroDa('ST26-0048'), 48);
});

test('numerazioni: casi-numerazioni.json del server ritrovati uguali (codiceDa e prossimoDa di regole.js, §9.6)', { skip: !fs.existsSync(CASI_NUMERAZIONI) && 'il server non ha ancora scritto casi-numerazioni.json' }, () => {
  const casi = JSON.parse(fs.readFileSync(CASI_NUMERAZIONI, 'utf8'));
  assert.equal(casi.codiceDa.length + casi.prossimo.length, 12, 'i 12 casi');
  casi.codiceDa.forEach(c => {
    assert.equal(R.codiceDa(c.formato, c.anno, c.numero), c.atteso, c.nome);
    assert.equal(Q.codiceDa(c.formato, c.anno, c.numero), c.atteso, c.nome + ' (regole-fase8)');
  });
  casi.prossimo.forEach(c => {
    // Più commesse di fila senza rete: ognuna conta quelle già scritte prima di lei.
    const codici = c.codici.slice();
    const fatti = [];
    for (let i = 0; i < c.nuove; i++) {
      const n = R.prossimoDa({ formato: c.formato, precedenti: c.precedenti, annuale: c.annuale, ultimo: c.ultimo, codici, anno: c.anno });
      const codice = R.codiceDa(c.formato, c.anno, n);
      fatti.push(codice);
      codici.push(codice);
    }
    assert.deepEqual(fatti, c.attesi, c.nome);
  });
  assert.deepEqual(R.numeroDaFormato('ST{AA}-{NNNN}', 'ST26-0048'), { numero: 48, anno: 2026 });
  assert.equal(R.numeroDaFormato('{AA}ST{NNN}', 'ST26-0048'), null, 'un codice di un altro formato non conta');
  assert.equal(R.prossimoDa({ formato: 'RAP/{AAAA}/{NNNN}', annuale: true, ultimo: 0, codici: ['RAP/2025/0153', 'RAP/2026/0002'], anno: 2026 }), 3, "annuale: solo quelli dell'anno");
});

test('il formato del codice commessa coi pezzi (Anno, Testo, Ordine, Separatore, Cifre) e ritorno', () => {
  assert.equal(Q.formatoCommessa({ anno: '26', testo: 'ST', ordine: 'anno', sep: '', cifre: 3 }), '{AA}ST{NNN}');
  assert.equal(Q.formatoCommessa({ anno: '26', testo: 'ST', ordine: 'testo', sep: '-', cifre: 4 }), 'ST{AA}-{NNNN}');
  assert.equal(Q.formatoCommessa({ anno: '2026', testo: '', ordine: 'anno', sep: '/', cifre: 3 }), '{AAAA}/{NNN}');
  assert.equal(Q.formatoCommessa({ anno: '', testo: '', sep: '-', cifre: 4 }), '{NNNN}', 'senza anno né testo il separatore non serve');
  ['{AA}ST{NNN}', 'ST{AA}-{NNNN}', '{AAAA}/{NNN}', 'RAP/{AAAA}/{NNNN}', '{NNN}', '{AA}ST-{NNN}'].forEach(f => {
    const p = Q.pezziCommessa(f);
    assert.ok(p, f + ' si fa coi pezzi');
    assert.equal(Q.formatoCommessa(p), f);
  });
  assert.equal(Q.pezziCommessa('{NNN}/{AA}'), null, 'il numero in mezzo non si fa con questi pezzi');
  assert.equal(Q.pezziCommessa('{AA}{NNNNN}'), null, 'cinque cifre non ci sono fra le scelte');
  assert.equal(Q.frasePrima('26ST001', '26ST047', 48), 'Le commesse di prima restano come sono: 26ST001 … 26ST047. Il numero continua da 48.');
  assert.equal(Q.comeContinua({ annuale: true }), 'riparte a gennaio');
  assert.equal(Q.comeContinua({ annuale: false }), 'continua');
});

// ------------------------------------------------------------------ impostazioni generali (§9.4)

test('impostazioni generali: numeri alla italiana, errori col nome davanti ("Ore al giorno: da 1 a 12"), tempi dei ticket', () => {
  assert.equal(Q.numeroScritto('0,76'), 0.76);
  assert.equal(Q.numeroScritto('3.000'), 3000);
  assert.equal(Q.numeroScritto('1.234,5'), 1234.5);
  assert.equal(Q.numeroScritto('abc'), null);
  assert.equal(Q.numeroScritto(''), null);
  assert.equal(Q.numeroCampo(0.76), '0,76');
  const ore = { chiave: 'ORE_GIORNALIERE', etichetta: 'Ore di lavoro al giorno', nomeBreve: 'Ore al giorno', tipo: 'numero', min: 1, max: 12 };
  assert.equal(Q.erroreVoce(ore, '13'), 'Ore al giorno: da 1 a 12');
  assert.equal(Q.erroreVoce(ore, '0'), 'Ore al giorno: da 1 a 12');
  assert.equal(Q.erroreVoce(ore, '8'), '');
  assert.equal(Q.erroreVoce(ore, ''), 'Ore al giorno: scrivi un numero');
  assert.equal(Q.erroreVoce(Object.assign({}, ore, { vuoto: true }), ''), '', 'dove il vuoto è permesso');
  assert.equal(Q.erroreVoce({ tipo: 'testo' }, 'x'), '');
  const tempi = { urgente: { presa: 1, intervento: 4 }, alta: { presa: 2, intervento: 24 }, normale: { presa: 8, intervento: 72 }, bassa: { presa: 24, intervento: 240 } };
  assert.equal(Q.erroreTempi(tempi), '');
  assert.equal(Q.erroreTempi(Object.assign({}, tempi, { alta: { presa: 24, intervento: 2 } })), 'Tempi dei ticket: per Alta l\'intervento non può venire prima della presa in carico');
  assert.equal(Q.erroreTempi(Object.assign({}, tempi, { bassa: { presa: null, intervento: 4 } })), 'Tempi dei ticket: scrivi le ore di Bassa');
});

test('impostazioni generali nei dati di esempio: undici schede, ogni chiave una volta sola, cerca senza accenti', () => {
  const g = E.gestisci(E.crea({ chi: 'manuel', oggi: '2026-10-22' }), 'GET', '/server/impostazioniGenerali', {}).gruppi;
  assert.equal(g.length, 11);
  const chiavi = [].concat(...g.map(x => x.voci.map(v => v.chiave)));
  assert.equal(new Set(chiavi).size, chiavi.length, 'una chiave sta in una scheda sola');
  ['TICKET_ATTIVO', 'TECNICO', 'PASSAGGIO_USCITE', 'REGOLE_FISCALI_CONFERMATE', 'PORTALE_INFORMATIVA_DATA', 'CAMBIO'].forEach(k => assert.ok(chiavi.indexOf(k) < 0, k + ' non si mostra'));
  ['APPROVAZIONE', 'ORE_GIORNALIERE', 'INDENNITA_TRASFERTA', 'PREVENTIVO_VALIDITA_GIORNI', 'TICKET_TEMPI', 'FILE_MAX_MB', 'CALENDARIO_GIORNI_PRIMA', 'RICERCA_FILE'].forEach(k => assert.ok(chiavi.indexOf(k) >= 0, k + ' ha la sua schermata'));
  assert.deepEqual(Q.filtraGruppi(g, 'citta').length, 0);
  const f = Q.filtraGruppi(g, 'attivita');
  assert.ok(f.length >= 0);
  const ticket = Q.filtraGruppi(g, 'TICKET');
  assert.ok(ticket.some(x => x.chiave === 'ticket'), 'cercando il nome della scheda si vede tutta');
  assert.ok(Q.filtraGruppi(g, 'patrono').every(x => x.voci.length === 1), 'una voce trovata, solo lei');
  assert.match(Q.rigaImpostazioni(g), /^\d+ impostazioni in 11 gruppi$/);
});

// ------------------------------------------------------------------ notifiche (§9.7)

test('notifiche: solo i tipi che la persona può ricevere, a gruppi; le email degli avvisi; l\'ora del riepilogo', () => {
  const g = Q.gruppiNotifiche({ assegnato: true, da_mandare: false, integrazione_errore: true, esportazione_pronta: true });
  assert.deepEqual(g.map(x => x.nome), ['Lavoro', 'Sistema', 'Per te']);
  assert.deepEqual(g[0].tipi.map(t => [t.nome, t.acceso]), [['Ti hanno assegnato qualcosa', true], ['Messaggi da mandare oggi', false]]);
  assert.deepEqual(Q.gruppiNotifiche({}), []);
  assert.equal(Q.erroreEmailAvvisi('manuel@esempio.it, laura@esempio.it'), '');
  assert.equal(Q.erroreEmailAvvisi(''), 'Avvisi del server a: scrivi almeno un\'email');
  assert.equal(Q.erroreEmailAvvisi('manuel@esempio'), 'Avvisi del server a: manuel@esempio non è un\'email');
  assert.equal(Q.erroreOra('8:00'), '');
  assert.equal(Q.erroreOra('08.30'), '');
  assert.equal(Q.erroreOra('25:00'), 'Ora del riepilogo: scrivi l\'ora, per esempio 8:00');
  // La Festa del patrono: due tendine (giorno, mese) -> "MM-GG" del server.
  assert.equal(Q.giornoMeseDa('07', '07'), '07-07');
  assert.equal(Q.giornoMeseDa('', ''), '');
  assert.equal(Q.giornoMeseDa('07', ''), null);
  assert.equal(Q.erroreGiornoMese('', 'Festa del patrono'), '');
  assert.equal(Q.erroreGiornoMese('02-29', 'Festa del patrono'), '');
  assert.equal(Q.erroreGiornoMese('04-31', 'Festa del patrono'), 'Festa del patrono: il 31 aprile non c\'è');
  assert.equal(Q.erroreGiornoMese(null, 'Festa del patrono'), 'Festa del patrono: scegli il giorno e il mese');
  const marco = E.gestisci(E.crea({ chi: 'marco', oggi: '2026-10-22' }), 'GET', '/server/notifichePreferenze', {});
  assert.ok(!Object.keys(marco.tipi).some(k => /copia|integrazione|esportazione/.test(k)), 'il collaboratore non riceve gli avvisi del server');
});

// ------------------------------------------------------------------ lista di controllo (§11)

test('lista di controllo: Da fare · Fatto · Non va · Da rifare · In attesa di una scelta, il riassunto, i segmenti', () => {
  assert.deepEqual(Q.STATI_CONTROLLO.da_rifare, { parola: 'Da rifare', colore: 'ambra' });
  assert.equal(Q.statoControllo({ stato: 'fatto', tipo: 'automatica', versione: '0.9.0' }, '1.0.0'), 'da_rifare', 'una riga automatica invecchia col server nuovo');
  assert.equal(Q.statoControllo({ stato: 'fatto', tipo: 'a_mano', versione: '0.9.0' }, '1.0.0'), 'fatto', 'le righe a mano no');
  assert.equal(Q.statoControllo({ stato: 'attesa' }), 'attesa');
  assert.equal(Q.riassuntoControlli({ fatti: 41, totale: 58, nonVanno: 2, attesa: 3 }), '41 di 58 fatti · 2 non vanno · 3 in attesa di una scelta');
  assert.equal(Q.riassuntoControlli({ fatti: 1, totale: 2, nonVanno: 1, attesa: 0 }), '1 di 2 fatti · 1 non va · 0 in attesa di una scelta');
  const gruppi = [{ nome: 'A', righe: [{ stato: 'fatto' }, { stato: 'da_fare' }] }, { nome: 'B', righe: [{ stato: 'non_va' }] }];
  assert.deepEqual(Q.filtraControlli(gruppi, 'nonvanno').map(g => g.nome), ['B']);
  assert.equal(Q.filtraControlli(gruppi, 'tutte').length, 2);
  assert.deepEqual(Q.contaControlli(gruppi), { fatti: 1, totale: 3, nonVanno: 1, attesa: 0 });
  assert.equal(Q.chiQuando({ utente: 'Andrea Gasparotto', il: '2026-11-05' }, OGGI), 'Andrea · 05/11');
  assert.ok(!Q.segnabile({ tipo: 'server' }) && Q.segnabile({ tipo: 'a_mano' }), 'le righe dal server non si segnano');
});

test('lista di controllo nei dati di esempio: segnare Fatto e Non va (con la nota), non le righe del server', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  assert.equal(E.gestisci(dati, 'POST', '/server/segnaControllo', { chiave: 'M17.1', stato: 'fatto' }).errore, 'Questa riga la controlla il server da solo');
  assert.equal(E.gestisci(dati, 'POST', '/server/segnaControllo', { chiave: 'T04', stato: 'non_va', nota: '' }).errore, 'Nota: scrivi cosa non va');
  const r = E.gestisci(dati, 'POST', '/server/segnaControllo', { chiave: 'T04', stato: 'fatto', nota: 'Provato in aereo' });
  assert.equal(r.riga.stato, 'fatto');
  assert.equal(r.riga.utente, 'Manuel Gasparotto');
  assert.equal(E.gestisci(E.crea({ chi: 'laura', oggi: '2026-10-22' }), 'POST', '/server/segnaControllo', { chiave: 'T04', stato: 'fatto' }).permesso, false, 'amministrazione 1 vede e basta');
});

// ------------------------------------------------------------------ stato del sistema, copie, sicurezza (§9.8-§9.11)

test('stato e copie: acceso da, l\'ora del NAS (oltre 2 minuti in ambra), la prova della copia, i suoi controlli', () => {
  assert.equal(Q.accesoDa('2026-10-10T07:12:00', OGGI), '12 giorni');
  assert.equal(Q.accesoDa('2026-10-21T09:00:00', OGGI), '1 giorno');
  assert.equal(Q.accesoDa('2026-10-22T07:00:00', OGGI), '3 ore');
  assert.deepEqual(Q.fraseOra(-360), { ambra: true, testo: 'L\'ora del NAS è indietro di 6 minuti: i rapportini prendono l\'ora del NAS' });
  assert.equal(Q.fraseOra(60, '2026-10-22T10:05:12').testo, '10:05, uguale a questo dispositivo');
  assert.equal(Q.fraseOra(60).ambra, false);
  assert.deepEqual(Q.esitoProva({ esito: 'ok', quando: '2026-10-01T02:40:00' }, OGGI), { parola: 'Tutto torna', colore: 'verde', frase: 'Provata il 01/10: tutto torna' });
  assert.equal(Q.esitoProva({ esito: 'errore', quando: '2026-10-01T02:40:00', cosa: 'la copia fuori casa del 01/10 è diversa da quella mandata' }, OGGI).frase,
    'Provata il 01/10: la copia fuori casa del 01/10 è diversa da quella mandata');
  assert.deepEqual(Q.dettagliProva({ integrita: 'ok', conteggi: { rapportini: [1532, 1532] }, file: { provati: 20, giusti: 20 }, fuori: { md5: 'giusto' } }),
    [['Integrità', 'ok'], ['Righe', '1.532 rapportini come nella copia'], ['File', '20 provati, 20 giusti'], ['Copia su Drive', 'uguale a quella mandata']]);
  assert.equal(Q.dettagliProva({ conteggi: { rapportini: [1530, 1532] } })[0][1], 'rapportini: 1530 invece di 1532');
  assert.equal(Q.CONTROLLI_RIPRISTINO.length, 5);
  assert.equal(Q.PASSI_RIPRISTINO.length, 6);
  assert.ok(Q.formaChiave('K7QM-XR4T-9HVB-2NWE-PD6S-ACJ8-UY3F-MZ5G'));
  assert.ok(!Q.formaChiave('K7QM-XR4T'), 'otto gruppi di quattro');
  assert.ok(!Q.formaChiave('O0IL-XR4T-9HVB-2NWE-PD6S-ACJ8-UY3F-MZ5G'), 'senza 0, O, 1, I, L');
});

test('copie e sicurezza nei dati di esempio: prova automatica, ripristino coi cinque controlli, scollega tutti con la password', () => {
  const dati = E.crea({ chi: 'manuel', oggi: '2026-10-22' });
  const c = E.gestisci(dati, 'GET', '/server/copie', {});
  assert.ok(c.prove.length >= 2 && c.prossimaProva);
  assert.equal(E.gestisci(dati, 'POST', '/server/provaCopia', {}).prova.esito, 'ok');
  assert.equal(E.gestisci(dati, 'POST', '/server/segnaRipristino', { copia: c.copie[0].file, da: 'drive', controlli: [true, true, true, true, false] }).errore, 'Spunta i cinque controlli: servono tutti');
  assert.equal(E.gestisci(dati, 'POST', '/server/segnaRipristino', { copia: c.copie[0].file, da: 'drive', controlli: [true, true, true, true, true] }).ok, true);
  assert.equal(E.gestisci(dati, 'POST', '/server/scollegaTutti', { password: 'sbagliata' }).errore, 'La password non è giusta');
  assert.equal(E.gestisci(E.crea({ chi: 'laura', oggi: '2026-10-22' }), 'POST', '/server/accendiCifratura', {}).permesso, false, 'solo il titolare');
  const k = E.gestisci(dati, 'POST', '/server/accendiCifratura', {});
  assert.ok(Q.formaChiave(k.chiave));
  assert.equal(E.gestisci(dati, 'GET', '/server/sicurezza', {}).copiaCifrata, true);
  assert.ok(!JSON.stringify(E.gestisci(dati, 'GET', '/server/sicurezza', {})).includes(k.chiave), 'la chiave si vede solo quando si accende');
});

// ------------------------------------------------------------------ il logo e il piè sui PDF (§9.3, §16)

const IMP = { RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto', INDIRIZZO: 'Via Roma 1, 36063 Marostica (VI)', PARTITA_IVA: '03123456786', EMAIL: 'studio@esempio.it', FIRMA_TECNICO: '/file/abcdefghijkl' };
const ANA = imp => ({ impostazioni: imp, clienti: [{ id: 'C002', nome: 'Rossi Impianti Srl' }], commesse: [], soggetti: [{ id: 'C002', nome: 'Rossi Impianti Srl' }] });
const RAP = { id: 'RAP/2026/0006', data: '2026-10-16', stato: 'FIRMATO', idCliente: 'C002', cliente: 'Rossi Impianti Srl', idCommessa: '26ST002', descrizione: 'Verifica', oreLavoro: 4, oreExtra: 0, oreViaggio: 1, km: 40, spese: 0, totale: 200, tariffa: 45 };
const PREV = { id: 12, numero: 'PR/2026/012', revisione: 0, data: '2026-10-15', scadenza: '2026-11-14', oggetto: 'Adeguamento quadro', idCliente: 'C002', stato: 'INVIATO', sezioni: [{ titolo: 'Progetto', voci: [{ id: 1, descrizione: 'Progetto', modo: 'corpo', quantita: 1, prezzo: 900 }] }], oneriPrevisti: 'Nessuno', condizioni: 'Pagamento a 30 giorni' };
const impronta = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const DOCUMENTI = imp => ({
  rapportino: () => D.rapportino(RAP, ANA(imp), {}),
  riepilogo: () => D.riepilogo([RAP], ANA(imp), { nome: 'Rossi', righe: ['Via 1'] }, 'ottobre 2026', {}),
  preventivo: () => D.preventivo(PREV, ANA(imp), {}),
  contratto: () => D.contrattoAssistenza({ numero: 'CA/2026/001', dal: '2026-01-01', al: '2026-12-31', cliente: 'Rossi', titolo: 'Assistenza' }, imp),
});
// Le impronte dei PDF fatti col documenti.js di prima della fase 8 (stessi dati): senza logo devono restare queste.
const PRIMA = { rapportino: '632fcc2a972891b5', riepilogo: 'bbcd34dd76670835', preventivo: '7c3df56de6a778b9', contratto: '3e004ffec6b44883', prospetto: '939e05a0d0fc89c3', avviso: '4da87281faef8a62' };

test('PDF senza logo identici a prima della fase 8, carattere per carattere (§9.3, §16, M18.3)', () => {
  const senza = [IMP, Object.assign({}, IMP, { STUDIO_LOGO: '', PDF_PIEDE: '', PDF_LOGO: true, STUDIO_NOME_BREVE: 'GM', STUDIO_SITO: 'www.esempio.it' }),
    Object.assign({}, IMP, { STUDIO_LOGO: 'logoDiProva123', PDF_LOGO: false })];
  senza.forEach((imp, i) => {
    const docs = DOCUMENTI(imp);
    Object.keys(docs).forEach(k => assert.equal(impronta(docs[k]()), PRIMA[k], k + ' (caso ' + i + ')'));
  });
  const prospetto = { prestatore: { denominazione: 'Studio' }, riferimento: 'W-1', tipoDocumento: 'TD01', dataProposta: '2026-10-22', righe: [] };
  assert.equal(impronta(D.prospettoFattura(prospetto, { oggi: '2026-10-22' })), PRIMA.prospetto);
  assert.equal(impronta(D.prospettoFattura(prospetto, { oggi: '2026-10-22', logo: '' })), PRIMA.prospetto);
  const avviso = { prestatore: { denominazione: 'Studio' }, committente: { denominazione: 'Rossi' }, riferimento: 'W-1', righe: [], riepilogo: [] };
  assert.equal(impronta(D.avvisoParcella(avviso, { oggi: '2026-10-22' })), PRIMA.avviso);
});

test('PDF col logo: in cima a sinistra, alto 14 mm, accanto alla ragione sociale; la riga in fondo sotto quella di sempre', () => {
  const imp = Object.assign({}, IMP, { STUDIO_LOGO: 'logoDiProva123', PDF_LOGO: true });
  const html = D.rapportino(RAP, ANA(imp), {});
  assert.ok(html.indexOf('<div class="studio-logo"><img src="/file/logoDiProva123" alt=""><div class="azienda">Studio Tecnico GM</div></div>') > 0);
  assert.ok(html.indexOf('.studio-logo img { height: 14mm;') > 0);
  assert.equal(D.logoDi({ STUDIO_LOGO: '/file/logoDiProva123' }), 'logoDiProva123', 'anche scritto come /file/<id>');
  assert.equal(D.logoDi({ STUDIO_LOGO: '../x' }), '', 'niente percorsi');
  ['riepilogo', 'preventivo', 'contratto'].forEach(k => assert.ok(DOCUMENTI(imp)[k]().indexOf('src="/file/logoDiProva123"') > 0, k + ' col logo'));
  assert.ok(D.lettera({ titolo: 'Verifica', testo: 'Testo', cliente: 'Rossi' }, imp).indexOf('src="/file/logoDiProva123"') > 0, 'la lettera col logo');
  assert.ok(D.prospettoFattura({ prestatore: { denominazione: 'Studio' }, riferimento: 'W-1', tipoDocumento: 'TD01', righe: [] }, { oggi: '2026-10-22', logo: 'logoDiProva123' }).indexOf('src="/file/logoDiProva123"') > 0);
  assert.ok(D.avvisoParcella({ prestatore: { denominazione: 'Studio' }, committente: {}, righe: [], riepilogo: [] }, { logo: 'logoDiProva123' }).indexOf('src="/file/logoDiProva123"') > 0);
  const piede = D.rapportino(RAP, ANA(Object.assign({}, IMP, { PDF_PIEDE: 'Iscritto al Collegio dei Periti Industriali di Vicenza n. 0000' })), {});
  assert.ok(piede.indexOf('@bottom-left { content: "Studio Tecnico GM · P.IVA 03123456786\\A Iscritto al Collegio dei Periti Industriali di Vicenza n. 0000"; white-space: pre;') > 0, 'due righe nel piè');
  assert.ok(D.rapportino(RAP, ANA(Object.assign({}, IMP, { PDF_PIEDE: 'a"b' })), {}).indexOf('\\A ab"') > 0, 'le virgolette non rompono il CSS');
  assert.ok(D.rapportino(RAP, ANA(Object.assign({}, IMP, { RAGIONE_SOCIALE: '<b>X</b>', STUDIO_LOGO: 'logoDiProva123' })), {}).indexOf('&lt;b&gt;X&lt;/b&gt;') > 0, 'il nome resta un nome');
});

// ------------------------------------------------------------------ menu e collegamenti (§13.5, §15)

test('menu e collegamenti della fase 8: Integrazioni dopo Collaboratori esterni, Notifiche di tutti, le pagine nuove', () => {
  const voci = R.vociMenu(E.permessiDi('titolare')).map(v => v.modulo);
  assert.deepEqual(voci.slice(-3), ['collaboratori', 'integrazioni', 'amministrazione']);
  assert.ok(R.vociMenu(E.permessiDi('collaboratore')).every(v => v.modulo !== 'integrazioni'), 'il collaboratore non ha Integrazioni (§4.3)');
  assert.equal(R.moduloDi('#amministrazione/notifiche'), null, 'Tu › Notifiche è di tutti');
  assert.ok(R.paginaPermessa(E.permessiDi('collaboratore'), '#amministrazione/notifiche'));
  assert.ok(R.paginaPermessa(E.permessiDi('collaboratore'), '#attivita/altreapp'));
  assert.ok(!R.paginaPermessa(E.permessiDi('collaboratore'), '#amministrazione/sicurezza'));
  assert.deepEqual(R.destinazione({ pagina: 'integrazione', id: 'vies' }), { hash: '#integrazioni/vies', filtro: null });
  assert.deepEqual(R.destinazione({ pagina: 'integrazioni', filtro: { segmento: 'sistemare' } }), { hash: '#integrazioni', filtro: { segmento: 'sistemare' } });
  assert.deepEqual(R.destinazione({ pagina: 'tutto', filtro: { sezione: 'pianificare' } }), { hash: '#dashboard/tutto', filtro: { sezione: 'pianificare' } });
  assert.deepEqual(R.destinazione({ pagina: 'amministrazione', filtro: { sezione: 'copie' } }), { hash: '#amministrazione/copie', filtro: null });
  assert.equal(R.testoAzione({ pagina: 'integrazione', id: 'vies' }), 'Apri il collegamento');
  // "7 cose da approvare" in cima come la cosa più urgente: il pulsante dice dove porta, come nella fase 3.
  assert.equal(R.testoAzione({ pagina: 'approvare' }), 'Apri Da approvare');
});

test('i dati di esempio della fase 8 non hanno dati veri: solo indirizzi di esempio, nessuna chiave', () => {
  const testo = fs.readFileSync(path.join(__dirname, '..', 'ui', 'esempio8.js'), 'utf8');
  const email = (testo.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).filter(x => !/@(esempio\.it|studiogm\.example|rossi\.example|pec\.esempio\.it)$/.test(x));
  assert.deepEqual(email, [], 'solo email di esempio');
  assert.ok(!/AKfyc|script\.google\.com\/macros/.test(testo), 'nessun indirizzo vero di uno script');
  assert.ok(E8.leggiCsv('a;b\r\n"x;y";2').length === 2 && E8.leggiCsv('a;b\r\n"x;y";2')[1][0] === 'x;y', 'il CSV con le virgolette');
});
