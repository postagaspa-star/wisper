/*
 * L'ingresso: ogni richiesta passa di qui, come in Code.gs passava da
 * rispondi(). Qui, e solo qui, si controllano accesso e permessi: ogni azione
 * dice di quale modulo ha bisogno e a che livello, e se manca il server dice di
 * no prima di fare qualunque cosa.
 *
 * Le risposte sono sempre {ok: true, ...} o {ok: false, errore: "frase da
 * mostrare"}; in piu' accesso:false (rientrare) e permesso:false (chiedere).
 * Chi non ha "costi" riceve le risposte senza i campi dei soldi.
 */
'use strict';

const { Rifiuto, senzaPermesso, testo, messaggio, oggi } = require('./utili');
const { provenienza } = require('./provenienza');
const { togliCosti } = require('./permessi');

const scrive = (modulo, cosa, fn) => ({ modulo, livello: 2, cosa, scrive: true, fn });
const legge = (modulo, cosa, fn) => ({ modulo, livello: 1, cosa, fn });
// Fase 4: tutte le azioni di Fatturazione e di Banche vogliono anche il permesso dei soldi ("costi").
const conCosti = v => Object.assign(v, { costi: true });

/** La frase quando manca il permesso dei soldi (fase4.md §11). */
const SENZA_COSTI = {
  fatturazione: 'Per vedere le fatture serve anche il permesso dei soldi: chiedi al titolare',
  banche: 'Per vedere banche e scadenze serve anche il permesso dei soldi: chiedi al titolare',
};
const nonServePiu = { fn: () => { throw new Rifiuto('Non serve più'); } };
const siVuole = v => v === true || v === '1' || v === 'true';

/**
 * Tutte le azioni: quelle di oggi (stessi nomi, stesse risposte di Code.gs) e
 * quelle nuove delle fasi 1, 2 e 3. "scrive": tutto in una transazione, o niente.
 */
const AZIONI = {
  // --- accesso
  accedi: { pubblica: true, asincrona: true, soloPost: true, fn: (w, d) => w.accedi(d) },
  esci: { soloPost: true, libera: 'ognuno esce dal suo dispositivo', fn: w => w.esci() },
  io: { libera: 'ognuno legge chi e\' e cosa puo\' fare', fn: (w, d) => w.io(d) },
  cambiaPassword: { asincrona: true, soloPost: true, libera: 'ognuno la sua password', fn: (w, d) => w.cambiaPassword(d) },

  // --- collegare il computer col QR (docs/gestionale/collega-qr.md §4): ognuno collega un computer per se', coi suoi
  // permessi. attesaComputer e' senza token (il computer non e' ancora entrato) e solo da casa (lo controlla lei); le
  // risposte "attesa" (ogni 2 secondi) e "pronto" (la riga la scrive lei, "accedi col QR") non lasciano righe negli accessi.
  autorizzaComputer: { scrive: true, soloPost: true, libera: 'ognuno collega un computer per se\'', fn: (w, d) => w.autorizzaComputer(d) },
  attesaComputer: { pubblica: true, soloPost: true, registra: r => !(r && r.ok && (r.stato === 'attesa' || r.stato === 'pronto')), fn: (w, d) => w.attesaComputer(d) },
  statoComputer: { libera: 'ognuno i computer che ha collegato lui', fn: (w, d) => w.statoComputer(d) },

  // --- le azioni di oggi
  anagrafiche: { libera: 'ognuno i clienti e le commesse che vede (lo decide rispostaAnagrafiche)', fn: (w, d) => w.rispostaAnagrafiche(d) },
  rapportini: legge('rapportini', 'vedere i rapportini', (w, d) => ({
    ok: true,
    rapportini: w.leggiRapportini(d.da, d.a, siVuole(d.tutti), { idCliente: d.idCliente, idCommessa: d.idCommessa, idProgetto: d.idProgetto, statoApprovazione: d.statoApprovazione, idTicket: d.idTicket }),
  })),
  file: { libera: 'chi puo\' leggere il file lo decide puoLeggereFile', fn: (w, d) => ({ ok: true, file: w.leggiFile(d.id) }) },
  // Il nome di Code.gs: con solo idCommessa risponde come prima (cartella e file della commessa, per le versioni vecchie);
  // con archivio: true (o un filtro della fase 5) e' l'elenco dell'archivio (fase5.md §10.1).
  documenti: legge('documenti', 'vedere i documenti', (w, d) => (w.elencoNuovo(d) ? w.leggiDocumenti(d) : w.documentiCommessa(d.idCommessa))),
  salvaRapportino: scrive('rapportini', 'scrivere i rapportini', (w, d) => ({ ok: true, rapportino: w.salvaRapportino(d.rapportino || {}) })),
  caricaFile: {
    scrive: true,
    // Il permesso dipende da cosa si carica.
    controllo: d => (d.tipo === 'documento' ? ['documenti', 2, 'caricare documenti']
      : d.tipo === 'firmaTecnico' ? ['amministrazione', 2, 'cambiare la firma del tecnico']
        : d.tipo === 'attivita' ? ['attivita', 2, 'caricare allegati sulle attività']
          : d.tipo === 'ticket' ? ['ticket', 2, 'caricare le foto dei ticket']
          // Fase 6: la foto dei km e le foto dei guasti (chi ha la cosa, con mezzi 1: lo controlla caricaFotoMezzo).
          : d.tipo === 'km' || d.tipo === 'guasto' ? ['mezzi', 1, 'caricare le foto dei mezzi']
          : d.tipo === 'spesa' && testo(d.idSpesa) ? ['spese', 2, 'caricare le foto delle spese']
            : ['rapportini', 2, 'caricare foto e firme dei rapportini']),
    fn: (w, d) => ({ ok: true, file: w.caricaFile(d) }),
  },
  togliFile: scrive('rapportini', 'togliere le foto dei rapportini', (w, d) => ({ ok: true, rapportino: w.togliFile(d.id, d.fileId) })),
  stato: scrive('rapportini', 'cambiare lo stato dei rapportini', (w, d) => ({ ok: true, rapportini: w.cambiaStato(d.ids || [d.id], d.stato) })),
  creaCliente: scrive('clienti', 'creare clienti', (w, d) => ({ ok: true, cliente: w.creaCliente(d) })),
  aggiornaCliente: scrive('clienti', 'cambiare i clienti', (w, d) => ({ ok: true, cliente: w.aggiornaCliente(d.id, d.campi || {}) })),
  creaCommessa: scrive('commesse', 'creare commesse', (w, d) => ({ ok: true, commessa: w.creaCommessa(d) })),
  aggiornaCommessa: scrive('commesse', 'cambiare le commesse', (w, d) => ({ ok: true, commessa: w.aggiornaCommessa(d.id, d.campi || {}) })),
  // 03/11/2026: i progetti, sotto le commesse (azioni/progetti.js).
  progetti: legge('progetti', 'vedere i progetti', (w, d) => ({ ok: true, progetti: w.leggiProgetti(d) })),
  progetto: legge('progetti', 'vedere i progetti', (w, d) => w.schedaProgetto(d)),
  codiceProgetto: legge('progetti', 'vedere i progetti', (w, d) => w.codiceProgetto(d)),
  creaProgetto: scrive('progetti', 'creare progetti', (w, d) => ({ ok: true, progetto: w.creaProgetto(d) })),
  aggiornaProgetto: scrive('progetti', 'cambiare i progetti', (w, d) => ({ ok: true, progetto: w.aggiornaProgetto(d.id, d.campi || {}) })),
  togliProgetto: scrive('progetti', 'togliere i progetti', (w, d) => w.togliProgetto(d.id)),
  // Il nome che usava il primo Wisper: resta valido.
  statoCommessa: scrive('commesse', 'cambiare le commesse', (w, d) => ({ ok: true, commessa: w.aggiornaCommessa(d.idCommessa, { stato: d.stato }) })),
  salvaImpostazioni: scrive('amministrazione', 'cambiare le impostazioni', (w, d) => ({ ok: true, impostazioni: w.salvaImpostazioni(d.valori || {}) })),
  inviaEmail: { modulo: 'rapportini', livello: 2, cosa: 'mandare email', asincrona: true, soloPost: true, fn: async (w, d) => ({ ok: true, rapportini: await w.inviaEmail(d) }) },
  salvaGruppo: Object.assign({ libera: 'non serve piu\'' }, nonServePiu),
  collegaComputer: Object.assign({ libera: 'non serve piu\'' }, nonServePiu),

  // --- amministrazione
  utenti: legge('amministrazione', 'vedere gli utenti', w => ({ ok: true, utenti: w.leggiUtenti() })),
  salvaUtente: { modulo: 'amministrazione', livello: 2, cosa: 'cambiare gli utenti', asincrona: true, soloPost: true, fn: (w, d) => w.salvaUtente(d.utente || d) },
  nuovaPassword: { modulo: 'amministrazione', livello: 2, cosa: 'cambiare le password degli altri', asincrona: true, soloPost: true, fn: (w, d) => w.nuovaPassword(d.idUtente) },
  sessioni: { modulo: 'amministrazione', livello: 2, cosa: 'vedere i dispositivi collegati', fn: (w, d) => ({ ok: true, sessioni: w.leggiSessioni(d.idUtente) }) },
  revocaSessione: scrive('amministrazione', 'scollegare i dispositivi', (w, d) => w.revocaSessione(d.id)),
  permessi: legge('amministrazione', 'vedere i permessi', w => w.leggiPermessi()),
  salvaPermessi: scrive('amministrazione', 'cambiare i permessi', (w, d) => w.salvaPermessi(d)),
  registro: legge('amministrazione', 'vedere il registro', (w, d) => w.leggiRegistro(d)),
  accessi: legge('amministrazione', 'vedere gli accessi', (w, d) => w.leggiAccessi(d)),
  numerazioni: legge('amministrazione', 'vedere le numerazioni', w => ({ ok: true, numerazioni: w.leggiNumerazioni(), fatture: 'Fatture: il numero lo dà il programma delle fatture' })),
  salvaNumerazione: scrive('amministrazione', 'cambiare le numerazioni', (w, d) => ({ ok: true, numerazione: w.salvaNumerazione(d) })),
  cestino: { modulo: 'amministrazione', livello: 2, cosa: 'vedere il cestino', fn: w => ({ ok: true, file: w.cestino() }) },
  ripristinaFile: scrive('amministrazione', 'ripristinare i file', (w, d) => ({ ok: true, file: w.ripristinaFile(d.id) })),
  copie: legge('amministrazione', 'vedere le copie', w => w.leggiCopie()),
  copiaAdesso: { modulo: 'amministrazione', livello: 2, cosa: 'fare una copia', asincrona: true, soloPost: true, fn: async w => ({ ok: true, copia: await w.copiaDiSicurezza('a mano') }) },

  // --- dashboard
  dashboard: legge('dashboard', 'vedere la dashboard', (w, d) => w.dashboard(d)),

  // --- clienti e fornitori
  salvaSoggetto: scrive('clienti', 'cambiare clienti e fornitori', (w, d) => ({ ok: true, soggetto: w.salvaSoggetto(d.soggetto || {}) })),
  archiviaSoggetto: scrive('clienti', 'archiviare clienti e fornitori', (w, d) => ({ ok: true, soggetto: w.archiviaSoggetto(d.id, true) })),
  ripristinaSoggetto: scrive('clienti', 'ripristinare clienti e fornitori', (w, d) => ({ ok: true, soggetto: w.archiviaSoggetto(d.id, false) })),
  // Fase 7: l'email cambiata di uno col portale lo dice nella risposta ("avviso").
  salvaReferente: scrive('clienti', 'cambiare i referenti', (w, d) => {
    const referente = w.salvaReferente(d.referente || {});
    const o = { ok: true, referente };
    if (referente.avviso) { o.avviso = referente.avviso; delete referente.avviso; }
    return o;
  }),
  togliReferente: scrive('clienti', 'togliere i referenti', (w, d) => { w.togliReferente(d.id); return { ok: true }; }),
  salvaSede: scrive('clienti', 'cambiare sedi e impianti', (w, d) => ({ ok: true, sede: w.salvaSede(d.sede || {}) })),
  archiviaSede: scrive('clienti', 'archiviare sedi e impianti', (w, d) => ({ ok: true, sede: w.archiviaSede(d.id, d.archiviata) })),
  controllaPartitaIva: { modulo: 'clienti', livello: 1, cosa: 'controllare le partite IVA', asincrona: true, fn: (w, d) => w.controllaPartitaIva(d) },

  // --- commesse
  salvaPrestazione: scrive('commesse', 'cambiare le prestazioni', (w, d) => ({ ok: true, prestazione: w.salvaPrestazione(d.prestazione || {}) })),
  togliPrestazione: scrive('commesse', 'togliere le prestazioni', (w, d) => { w.togliPrestazione(d.id); return { ok: true }; }),
  ordinaPrestazioni: scrive('commesse', 'cambiare le prestazioni', (w, d) => ({ ok: true, prestazioni: w.ordinaPrestazioni(d.idCommessa, d.ids) })),
  duplicaCommessa: scrive('commesse', 'creare commesse', (w, d) => ({ ok: true, commessa: w.duplicaCommessa(d) })),
  archiviaCommessa: scrive('commesse', 'archiviare le commesse', (w, d) => ({ ok: true, commessa: w.archiviaCommessa(d.id, true) })),
  ripristinaCommessa: scrive('commesse', 'ripristinare le commesse', (w, d) => ({ ok: true, commessa: w.archiviaCommessa(d.id, false) })),

  // --- rapportini
  ripristinaRapportino: scrive('rapportini', 'ripristinare i rapportini', (w, d) => ({ ok: true, rapportino: w.ripristinaRapportino(d.id) })),

  // --- esportazione: il permesso dipende da cosa (lo controlla esporta)
  esporta: { libera: 'il modulo dipende da cosa si esporta (MODULO di esporta.js)', fn: (w, d) => w.esporta(d) },

  // --- preventivi e listino (fase 2)
  listino: legge('preventivi', 'vedere il listino', (w, d) => ({ ok: true, listino: w.leggiListino(siVuole(d.tutte)) })),
  salvaVoceListino: scrive('preventivi', 'cambiare il listino', (w, d) => ({ ok: true, voce: w.salvaVoceListino(d.voce || {}) })),
  archiviaVoceListino: scrive('preventivi', 'cambiare il listino', (w, d) => ({ ok: true, voce: w.archiviaVoceListino(d.id, d.archiviata) })),
  preventivi: legge('preventivi', 'vedere i preventivi', (w, d) => ({ ok: true, oggi: oggi(), preventivi: w.leggiPreventivi(d) })),
  preventivo: legge('preventivi', 'vedere i preventivi', (w, d) => ({ ok: true, preventivo: w.preventivoCompleto(w.rigaPreventivo(d.id)) })),
  salvaPreventivo: scrive('preventivi', 'scrivere i preventivi', (w, d) => ({ ok: true, preventivo: w.salvaPreventivo(d.preventivo || {}) })),
  duplicaPreventivo: scrive('preventivi', 'scrivere i preventivi', (w, d) => ({ ok: true, preventivo: w.duplicaPreventivo(d) })),
  nuovaRevisione: scrive('preventivi', 'scrivere i preventivi', (w, d) => ({ ok: true, preventivo: w.nuovaRevisione(d.id) })),
  segnaInviato: scrive('preventivi', 'segnare inviati i preventivi', (w, d) => ({ ok: true, preventivo: w.segnaInviato(d) })),
  inviaPreventivo: { modulo: 'preventivi', livello: 2, cosa: 'mandare i preventivi', asincrona: true, soloPost: true, fn: (w, d) => w.inviaPreventivo(d) },
  accettaPreventivo: scrive('preventivi', 'segnare accettati i preventivi', (w, d) => ({ ok: true, preventivo: w.accettaPreventivo(d) })),
  rifiutaPreventivo: scrive('preventivi', 'segnare rifiutati i preventivi', (w, d) => ({ ok: true, preventivo: w.rifiutaPreventivo(d) })),
  riapriPreventivo: scrive('preventivi', 'riaprire i preventivi', (w, d) => ({ ok: true, preventivo: w.riapriPreventivo(d) })),
  creaCommessaDaPreventivo: scrive('commesse', 'creare commesse', (w, d) => w.creaCommessaDaPreventivo(d)),

  // --- attivita' e calendario (fase 2)
  attivita: legge('attivita', 'vedere le attività', (w, d) => ({ ok: true, oggi: oggi(), attivita: w.leggiAttivita(d) })),
  salvaAttivita: scrive('attivita', 'scrivere le attività', (w, d) => w.salvaAttivita(d)),
  faiAttivita: scrive('attivita', 'scrivere le attività', (w, d) => w.faiAttivita(d)),
  togliAttivita: scrive('attivita', 'togliere le attività', (w, d) => w.togliAttivita(d)),
  spuntaChecklist: scrive('attivita', 'scrivere le attività', (w, d) => w.spuntaChecklist(d)),
  togliAllegato: scrive('attivita', 'togliere gli allegati delle attività', (w, d) => w.togliAllegato(d)),

  // --- ore, timer, approvazioni (fase 3): le ore sono del modulo rapportini (voce 6, Ore e rapportini)
  ore: legge('rapportini', 'vedere le ore', (w, d) => w.leggiOre(d)),
  salvaOre: scrive('rapportini', 'registrare le ore', (w, d) => w.salvaOre(d)),
  togliOre: scrive('rapportini', 'togliere le ore', (w, d) => w.togliOre(d)),
  timer: legge('rapportini', 'usare il timer', w => w.statoTimer()),
  avviaTimer: scrive('rapportini', 'usare il timer', (w, d) => w.avviaTimer(d)),
  fermaTimer: scrive('rapportini', 'usare il timer', w => w.fermaTimer()),
  statisticheOre: legge('rapportini', 'vedere le statistiche delle ore', (w, d) => w.statisticheOre(d)),
  costoCommessa: legge('commesse', 'vedere le commesse', (w, d) => w.costoDellaCommessa(d)),
  // Chi approva lo decide il server voce per voce (titolare e amministrazione, col modulo in scrittura).
  daApprovare: { libera: 'chi approva lo decide il server voce per voce', fn: w => w.daApprovare() },
  approva: { scrive: true, libera: 'chi approva lo decide il server voce per voce', fn: (w, d) => w.decidi(d, 'approva') },
  respingi: { scrive: true, libera: 'chi approva lo decide il server voce per voce', fn: (w, d) => w.decidi(d, 'respingi') },
  annullaApprovazione: { scrive: true, libera: 'chi approva lo decide il server voce per voce', fn: (w, d) => w.decidi(d, 'annulla') },

  // --- spese, trasferte, rimborsi, veicoli (fase 3)
  spese: legge('spese', 'vedere le spese', (w, d) => w.leggiSpese(d)),
  salvaSpesa: scrive('spese', 'scrivere le spese', (w, d) => ({ ok: true, spesa: w.salvaSpesa(d.spesa || {}) })),
  togliSpesa: scrive('spese', 'togliere le spese', (w, d) => ({ ok: true, spesa: w.togliSpesa(d) })),
  togliFotoSpesa: scrive('spese', 'togliere le foto delle spese', (w, d) => ({ ok: true, spesa: w.togliFotoSpesa(d) })),
  trasferte: legge('spese', 'vedere le trasferte', (w, d) => w.leggiTrasferte(d)),
  salvaTrasferta: scrive('spese', 'scrivere le trasferte', (w, d) => ({ ok: true, trasferta: w.salvaTrasferta(d.trasferta || {}) })),
  togliTrasferta: scrive('spese', 'togliere le trasferte', (w, d) => ({ ok: true, trasferta: w.togliTrasferta(d) })),
  rimborsi: legge('spese', 'vedere i rimborsi', (w, d) => w.rimborsi(d)),
  segnaRimborsato: scrive('spese', 'segnare i rimborsi', (w, d) => w.segnaRimborsato(d)),
  riepilogoSpese: legge('spese', 'vedere i riepiloghi delle spese', (w, d) => w.riepilogoSpese(d)),
  veicoli: legge('spese', 'vedere i veicoli', (w, d) => w.leggiVeicoli(d)),
  salvaVeicolo: scrive('amministrazione', 'cambiare i veicoli', (w, d) => ({ ok: true, veicolo: w.salvaVeicolo(d.veicolo || {}) })),

  // --- fatturazione (fase 4): Da fatturare, bozze, passaggio al programma, ritorno dell'XML, note, ricevute
  daFatturare: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => w.daFatturare(d))),
  preparaFattura: conCosti(scrive('fatturazione', 'preparare le fatture', (w, d) => w.preparaFattura(d))),
  nuovaFattura: conCosti(scrive('fatturazione', 'preparare le fatture', (w, d) => w.nuovaFattura(d))),
  fatture: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => ({ ok: true, oggi: oggi(), fatture: w.leggiFatture(d) }))),
  fattura: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => ({ ok: true, fattura: w.fatturaCompleta(w.rigaFattura(d.numero && !d.id ? { numero: d.numero, anno: d.anno } : d.id)) }))),
  salvaFattura: conCosti(scrive('fatturazione', 'preparare le fatture', (w, d) => w.salvaFattura(d))),
  scartaFattura: conCosti(scrive('fatturazione', 'scartare le bozze', (w, d) => w.scartaFattura(d))),
  passaAlProgramma: conCosti(scrive('fatturazione', 'passare le fatture al programma', (w, d) => w.passaAlProgramma(d))),
  pacchetto: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => w.pacchetto(d))),
  tornaInBozza: conCosti(scrive('fatturazione', 'preparare le fatture', (w, d) => w.tornaInBozza(d))),
  segnaEmessa: conCosti(scrive('fatturazione', 'segnare emesse le fatture', (w, d) => w.segnaEmessa(d))),
  inviaAvviso: conCosti({ modulo: 'fatturazione', livello: 2, cosa: 'mandare gli avvisi di parcella', asincrona: true, soloPost: true, fn: (w, d) => w.inviaAvviso(d) }),
  leggiXml: conCosti({ modulo: 'fatturazione', livello: 2, cosa: 'importare gli XML delle fatture', scrive: true, soloPost: true, fn: (w, d) => w.leggiXml(d) }),
  confermaXml: conCosti(scrive('fatturazione', 'importare gli XML delle fatture', (w, d) => w.confermaXml(d))),
  preparaNotaCredito: conCosti(scrive('fatturazione', 'preparare le note di credito', (w, d) => w.preparaNotaCredito(d))),
  segnaFatturataFuori: conCosti(scrive('fatturazione', 'segnare le cose fatturate fuori da Wisper', (w, d) => w.segnaFatturataFuori(d))),
  ricevute: conCosti(legge('fatturazione', 'vedere le fatture ricevute', (w, d) => ({ ok: true, ricevute: w.leggiRicevute(d) }))),
  ricevuta: conCosti(legge('fatturazione', 'vedere le fatture ricevute', (w, d) => ({ ok: true, ricevuta: w.ricevutaCompleta(w.rigaRicevuta(d.id)) }))),
  salvaRicevuta: conCosti(scrive('fatturazione', 'scrivere le fatture ricevute', (w, d) => w.salvaRicevuta(d))),
  annullaRicevuta: conCosti(scrive('fatturazione', 'annullare le fatture ricevute', (w, d) => w.annullaRicevuta(d))),
  scadenzePagamento: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => w.scadenzePagamento(d))),
  fatturazioneCommessa: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => w.fatturazioneCommessa(d))),
  riepilogoFatturato: conCosti(legge('fatturazione', 'vedere le fatture', (w, d) => w.riepilogoFatturato(d))),
  // Confermare le regole fiscali: solo il titolare (lo controlla l'azione).
  confermaRegoleFiscali: scrive('amministrazione', 'confermare le regole fiscali', (w, d) => w.confermaRegoleFiscali(d)),

  // --- banche e scadenze (fase 4)
  conti: conCosti(legge('banche', 'vedere banche e scadenze', (w, d) => ({ ok: true, conti: w.leggiConti(d), collegamento: 'non_collegato' }))),
  salvaConto: conCosti(scrive('banche', 'cambiare i conti', (w, d) => w.salvaConto(d))),
  aggiornaSaldo: conCosti(scrive('banche', 'aggiornare il saldo', (w, d) => w.aggiornaSaldo(d))),
  movimenti: conCosti(legge('banche', 'vedere banche e scadenze', (w, d) => w.leggiMovimenti(d))),
  salvaMovimento: conCosti(scrive('banche', 'scrivere i movimenti', (w, d) => w.salvaMovimento(d))),
  segnaIncasso: conCosti(scrive('banche', 'segnare gli incassi', (w, d) => w.segnaIncasso(d))),
  segnaPagamento: conCosti(scrive('banche', 'segnare i pagamenti', (w, d) => w.segnaPagamento(d))),
  verificaMovimenti: conCosti(scrive('banche', 'scrivere i movimenti', (w, d) => w.verificaMovimenti(d))),
  annullaMovimento: conCosti(scrive('banche', 'annullare i movimenti', (w, d) => w.annullaMovimento(d))),
  scadenziario: conCosti(legge('banche', 'vedere banche e scadenze', (w, d) => w.scadenziario(d))),
  impegni: conCosti(legge('banche', 'vedere banche e scadenze', (w, d) => ({ ok: true, impegni: w.leggiImpegni(d) }))),
  salvaImpegno: conCosti(scrive('banche', 'scrivere tributi e scadenze', (w, d) => w.salvaImpegno(d))),
  confermaImpegno: conCosti(scrive('banche', 'scrivere tributi e scadenze', (w, d) => w.confermaImpegno(d))),
  togliImpegno: conCosti(scrive('banche', 'togliere tributi e scadenze', (w, d) => w.togliImpegno(d))),
  situazione: conCosti(legge('banche', 'vedere banche e scadenze', (w, d) => w.situazione(d))),

  // --- documenti (fase 5): archivio, revisioni, collegamenti, modelli, spazio
  documento: legge('documenti', 'vedere i documenti', (w, d) => ({ ok: true, documento: w.documentoCompleto(w.rigaDocumento(d.id)) })),
  // Fase 6: l'esterno (documenti 1) carica i suoi documenti (DURC, polizza): lo controlla salvaDocumento.
  salvaDocumento: { scrive: true, controllo: (d, u) => ['documenti', u && u.ruolo === 'esterno' ? 1 : 2, 'scrivere i documenti'], fn: (w, d) => w.salvaDocumento(d) },
  caricaVersione: scrive('documenti', 'caricare le revisioni dei documenti', (w, d) => w.caricaVersione(d)),
  // Chi approva lo decide il server (titolare e amministrazione con documenti 2).
  approvaVersione: { scrive: true, modulo: 'documenti', livello: 1, cosa: 'vedere i documenti', fn: (w, d) => w.decidiVersione(d, 'approva') },
  respingiVersione: { scrive: true, modulo: 'documenti', livello: 1, cosa: 'vedere i documenti', fn: (w, d) => w.decidiVersione(d, 'respingi') },
  annullaDecisione: { scrive: true, modulo: 'documenti', livello: 1, cosa: 'vedere i documenti', fn: (w, d) => w.decidiVersione(d, 'annulla') },
  togliVersione: scrive('documenti', 'togliere le revisioni dei documenti', (w, d) => w.togliVersione(d)),
  archiviaDocumento: scrive('documenti', 'archiviare i documenti', (w, d) => w.archiviaDocumento(d)),
  inviaDocumento: { modulo: 'documenti', livello: 2, cosa: 'mandare i documenti', asincrona: true, soloPost: true, fn: (w, d) => w.inviaDocumento(d) },
  condividiDocumento: scrive('documenti', 'condividere i documenti', (w, d) => w.condividiDocumento(d)),
  revocaCondivisione: scrive('documenti', 'revocare i link dei documenti', (w, d) => w.revocaCondivisione(d)),
  categorieDocumenti: legge('documenti', 'vedere i documenti', w => ({ ok: true, categorie: w.leggiCategorie() })),
  salvaCategoria: scrive('amministrazione', 'cambiare le categorie dei documenti', (w, d) => w.salvaCategoria(d)),
  modelli: legge('documenti', 'vedere i modelli', w => w.leggiModelli()),
  salvaTestoModello: scrive('amministrazione', 'cambiare i testi dei modelli', (w, d) => w.salvaTestoModello(d)),
  componiModello: legge('documenti', 'vedere i modelli', (w, d) => w.componiModello(d)),
  spazio: legge('amministrazione', 'vedere lo spazio sul NAS', w => w.leggiSpazio()),
  svuotaCestino: scrive('amministrazione', 'svuotare il cestino', (w, d) => w.svuotaCestino(d)),

  // --- scadenze (fase 5): documenti 1 o ticket 1 per leggere; per scrivere lo decide la scadenza (documenti 2, o ticket 2 per i contratti)
  // Fase 6: anche quelle di persone, mezzi e collaboratori (chi vede cosa lo decide vedeScadenza).
  scadenze: { vede: ['documenti', 'ticket', 'persone', 'mezzi', 'collaboratori'], cosa: 'vedere le scadenze', fn: (w, d) => w.leggiScadenze(d) },
  salvaScadenza: { scrive: true, vede: ['documenti', 'ticket', 'persone', 'mezzi', 'collaboratori'], cosa: 'scrivere le scadenze', fn: (w, d) => w.salvaScadenza(d) },
  faiScadenza: { scrive: true, vede: ['documenti', 'ticket', 'persone', 'mezzi', 'collaboratori'], cosa: 'scrivere le scadenze', fn: (w, d) => w.faiScadenza(d) },
  togliScadenza: { scrive: true, vede: ['documenti', 'ticket', 'persone', 'mezzi', 'collaboratori'], cosa: 'scrivere le scadenze', fn: (w, d) => w.togliScadenza(d) },

  // --- ticket e assistenza (fase 5)
  tickets: legge('ticket', 'vedere i ticket', (w, d) => w.leggiTicket(d)),
  ticket: legge('ticket', 'vedere i ticket', (w, d) => ({ ok: true, ticket: w.ticketCompleto(w.rigaTicket(d.id)) })),
  salvaTicket: scrive('ticket', 'scrivere i ticket', (w, d) => w.salvaTicket(d)),
  prendiTicket: scrive('ticket', 'prendere i ticket', (w, d) => w.prendiTicket(d)),
  assegnaTicket: scrive('ticket', 'assegnare i ticket', (w, d) => w.assegnaTicket(d)),
  sospendiTicket: scrive('ticket', 'cambiare i ticket', (w, d) => w.sospendiTicket(d)),
  riprendiTicket: scrive('ticket', 'cambiare i ticket', (w, d) => w.riprendiTicket(d)),
  risolviTicket: scrive('ticket', 'cambiare i ticket', (w, d) => w.risolviTicket(d)),
  altroIntervento: scrive('ticket', 'cambiare i ticket', (w, d) => w.altroIntervento(d)),
  riapriTicket: scrive('ticket', 'riaprire i ticket', (w, d) => w.riapriTicket(d)),
  annullaTicket: scrive('ticket', 'annullare i ticket', (w, d) => w.annullaTicket(d)),
  pianificaTicket: scrive('ticket', 'pianificare i ticket', (w, d) => w.pianificaTicket(d)),
  chiudiTicket: scrive('ticket', 'chiudere i ticket', (w, d) => w.chiudiTicket(d)),
  legaRapportino: scrive('rapportini', 'legare i rapportini ai ticket', (w, d) => w.legaRapportino(d)),
  togliFotoTicket: scrive('ticket', 'togliere le foto dei ticket', (w, d) => w.togliFotoTicket(d)),
  storicoImpianto: { vede: ['clienti', 'ticket'], cosa: 'vedere gli impianti', fn: (w, d) => w.storicoImpianto(d) },
  statisticheTicket: legge('ticket', 'vedere le statistiche dei ticket', (w, d) => w.statisticheTicket(d)),

  // --- contratti di assistenza (fase 5): leggere con ticket 1 (senza canone chi non ha i soldi); scrivere con ticket 2 e costi 2
  contratti: legge('ticket', 'vedere i contratti', (w, d) => w.leggiContratti(d)),
  contratto: legge('ticket', 'vedere i contratti', (w, d) => ({ ok: true, contratto: w.contrattoDaRiga(w.rigaContratto(d.id), true) })),
  salvaContratto: scrive('ticket', 'scrivere i contratti di assistenza', (w, d) => w.salvaContratto(d)),
  attivaContratto: scrive('ticket', 'scrivere i contratti di assistenza', (w, d) => w.attivaContratto(d)),
  rinnovaContratto: scrive('ticket', 'scrivere i contratti di assistenza', (w, d) => w.rinnovaContratto(d)),
  disdiciContratto: scrive('ticket', 'scrivere i contratti di assistenza', (w, d) => w.disdiciContratto(d)),
  chiudiContratto: scrive('ticket', 'scrivere i contratti di assistenza', (w, d) => w.chiudiContratto(d)),

  // --- persone e risorse umane (fase 6): i tre livelli di dati li toglie togliDatiPersona su ogni risposta
  persone: legge('persone', 'vedere l\'organico', (w, d) => w.leggiPersone(d)),
  persona: legge('persone', 'vedere l\'organico', (w, d) => ({ ok: true, persona: w.personaCompleta(w.rigaPersona(testo(d.id) ? d.id : w.miaPersonaId())) })),
  // La persona stessa cambia i suoi contatti anche con persone 1: il resto lo decide salvaPersona.
  salvaPersona: { scrive: true, modulo: 'persone', livello: 1, cosa: 'cambiare le schede delle persone', fn: (w, d) => w.salvaPersona(d) },
  salvaCostoPersona: scrive('persone', 'scrivere i costi delle persone', (w, d) => w.salvaCostoPersona(d)),
  togliCostoPersona: scrive('persone', 'scrivere i costi delle persone', (w, d) => w.togliCostoPersona(d)),
  daiAccesso: { modulo: 'amministrazione', livello: 2, cosa: 'dare l\'accesso a Wisper', asincrona: true, soloPost: true, fn: (w, d) => w.daiAccesso(d) },
  qualificheTipi: legge('persone', 'vedere i tipi di formazione', w => w.qualificheTipi()),
  salvaQualificaTipo: scrive('amministrazione', 'cambiare i tipi di formazione', (w, d) => w.salvaQualificaTipo(d)),
  salvaQualifica: scrive('persone', 'scrivere la formazione delle persone', (w, d) => w.salvaQualifica(d)),
  togliQualifica: scrive('persone', 'scrivere la formazione delle persone', (w, d) => w.togliQualifica(d)),
  salvaVisita: scrive('persone', 'scrivere le visite mediche', (w, d) => w.salvaVisita(d)),
  togliVisita: scrive('persone', 'scrivere le visite mediche', (w, d) => w.togliVisita(d)),
  dpi: { vede: ['persone', 'mezzi'], cosa: 'vedere i DPI consegnati', fn: (w, d) => w.leggiDpi(d) },
  salvaConsegnaDpi: { scrive: true, vede: ['persone', 'mezzi'], cosa: 'consegnare i DPI', fn: (w, d) => w.salvaConsegnaDpi(d) },
  firmaConsegna: { scrive: true, vede: ['persone', 'mezzi'], cosa: 'firmare le consegne', fn: (w, d) => w.firmaConsegna(d) },
  restituisciDpi: { scrive: true, vede: ['persone', 'mezzi'], cosa: 'segnare i DPI restituiti', fn: (w, d) => w.restituisciDpi(d) },
  segnaUscita: scrive('persone', 'segnare l\'uscita delle persone', (w, d) => w.segnaUscita(d)),
  annullaUscita: scrive('persone', 'segnare l\'uscita delle persone', (w, d) => w.annullaUscita(d)),
  anonimizzaPersona: scrive('persone', 'rendere anonima una scheda (lo fa solo il titolare)', (w, d) => w.anonimizzaPersona(d)),
  accessiRiservati: legge('persone', 'vedere chi ha aperto i dati riservati', (w, d) => w.leggiAccessiRiservati(d)),
  // --- ferie, permessi, assenze, chiusure, presenze (fase 6)
  assenze: legge('persone', 'vedere le assenze', (w, d) => w.leggiAssenze(d)),
  salvaAssenza: { scrive: true, modulo: 'persone', livello: 1, cosa: 'chiedere ferie e permessi', fn: (w, d) => w.salvaAssenza(d) },
  annullaAssenza: { scrive: true, modulo: 'persone', livello: 1, cosa: 'annullare ferie e permessi', fn: (w, d) => w.annullaAssenza(d) },
  saldi: legge('persone', 'vedere il saldo delle ferie', (w, d) => w.leggiSaldi(d)),
  salvaSaldo: scrive('persone', 'aggiornare il saldo delle ferie', (w, d) => w.salvaSaldo(d)),
  chiusure: legge('persone', 'vedere le chiusure dello studio', (w, d) => w.leggiChiusure(d)),
  salvaChiusura: scrive('persone', 'scrivere le chiusure dello studio', (w, d) => w.salvaChiusura(d)),
  togliChiusura: scrive('persone', 'scrivere le chiusure dello studio', (w, d) => w.togliChiusura(d)),
  presenze: legge('persone', 'vedere le presenze', (w, d) => w.presenze(d)),
  // --- mezzi e attrezzature (fase 6): km, guasti, Lo prendo io e Restituisci anche con mezzi 1 (le cose che ho io)
  mezzi: legge('mezzi', 'vedere i mezzi', (w, d) => w.leggiMezzi(d)),
  mezzo: legge('mezzi', 'vedere i mezzi', (w, d) => ({ ok: true, mezzo: w.mezzoCompleto(w.rigaMezzo(d.id)) })),
  salvaMezzo: scrive('mezzi', 'cambiare i mezzi', (w, d) => w.salvaMezzo(d)),
  dismettiMezzo: scrive('mezzi', 'dismettere i mezzi', (w, d) => w.dismettiMezzo(d)),
  segnaKm: { scrive: true, modulo: 'mezzi', livello: 1, cosa: 'segnare i km', fn: (w, d) => w.segnaKm(d) },
  segnalaGuasto: { scrive: true, modulo: 'mezzi', livello: 1, cosa: 'segnalare i guasti', fn: (w, d) => w.segnalaGuasto(d) },
  salvaManutenzione: scrive('mezzi', 'scrivere le manutenzioni', (w, d) => w.salvaManutenzione(d)),
  chiudiManutenzione: { scrive: true, modulo: 'mezzi', livello: 1, cosa: 'chiudere le manutenzioni', fn: (w, d) => w.chiudiManutenzione(d) },
  manutenzioni: legge('mezzi', 'vedere guasti e manutenzioni', (w, d) => w.leggiManutenzioni(d)),
  costiMezzo: legge('mezzi', 'vedere i costi dei mezzi', (w, d) => w.costiMezzo(d)),
  attrezzature: legge('mezzi', 'vedere le attrezzature', (w, d) => w.leggiAttrezzature(d)),
  attrezzatura: legge('mezzi', 'vedere le attrezzature', (w, d) => ({ ok: true, attrezzatura: w.attrezzaturaCompleta(w.rigaAttrezzatura(d.id)) })),
  salvaAttrezzatura: scrive('mezzi', 'cambiare le attrezzature', (w, d) => w.salvaAttrezzatura(d)),
  dismettiAttrezzatura: scrive('mezzi', 'dismettere le attrezzature', (w, d) => w.dismettiAttrezzatura(d)),
  registraTaratura: scrive('mezzi', 'registrare le tarature', (w, d) => w.registraTaratura(d)),
  assegna: { scrive: true, modulo: 'mezzi', livello: 1, cosa: 'assegnare mezzi e attrezzature', fn: (w, d) => w.assegna(d) },
  restituisci: { scrive: true, modulo: 'mezzi', livello: 1, cosa: 'restituire mezzi e attrezzature', fn: (w, d) => w.restituisci(d) },
  assegnazioni: legge('mezzi', 'vedere assegnazioni e prestiti', (w, d) => w.leggiAssegnazioni(d)),
  usiStrumento: legge('mezzi', 'vedere gli usi degli strumenti', (w, d) => w.usiStrumento(d)),
  // --- collaboratori esterni (fase 6): i soldi con "costi"; l'esterno solo la sua scheda e i suoi incarichi
  collaboratori: legge('collaboratori', 'vedere i collaboratori esterni', (w, d) => w.leggiCollaboratori(d)),
  collaboratore: legge('collaboratori', 'vedere i collaboratori esterni', (w, d) => ({ ok: true, collaboratore: w.collaboratoreCompleto(w.rigaCollaboratore(testo(d.id || d.idSoggetto) || w.mioSoggetto())) })),
  salvaCollaboratore: scrive('collaboratori', 'scrivere i collaboratori esterni', (w, d) => w.salvaCollaboratore(d)),
  invitaEsterno: { modulo: 'amministrazione', livello: 2, cosa: 'dare l\'accesso agli esterni', asincrona: true, soloPost: true, fn: (w, d) => w.invitaEsterno(d) },
  incarichi: legge('collaboratori', 'vedere gli incarichi', (w, d) => w.leggiIncarichi(d)),
  incarico: legge('collaboratori', 'vedere gli incarichi', (w, d) => ({ ok: true, incarico: w.incaricoCompleto(w.rigaIncarico(d.id)) })),
  salvaIncarico: scrive('collaboratori', 'scrivere gli incarichi', (w, d) => w.salvaIncarico(d)),
  affidaIncarico: scrive('collaboratori', 'affidare gli incarichi', (w, d) => w.affidaIncarico(d)),
  aggiornaAvanzamento: scrive('collaboratori', 'scrivere gli incarichi', (w, d) => w.aggiornaAvanzamento(d)),
  concludiIncarico: scrive('collaboratori', 'scrivere gli incarichi', (w, d) => w.concludiIncarico(d)),
  riapriIncarico: scrive('collaboratori', 'scrivere gli incarichi', (w, d) => w.riapriIncarico(d)),
  annullaIncarico: scrive('collaboratori', 'scrivere gli incarichi', (w, d) => w.annullaIncarico(d)),
  valutaIncarico: scrive('collaboratori', 'valutare gli incarichi', (w, d) => w.valutaIncarico(d)),
  compensi: legge('collaboratori', 'vedere i compensi', (w, d) => w.compensi(d)),

  // --- portale clienti, dal lato dello studio (fase 7, fase7.md §10.1): le scritture vogliono il portale collegato e
  // acceso (nonCollegato / spento), tranne salvaPortaleCliente; spegniPortale e le impostazioni con amministrazione 2.
  portale: legge('portale', 'vedere il portale clienti', w => w.portaleStato()),
  segnaVistoPortale: scrive('portale', 'segnare viste le cose del portale', (w, d) => w.segnaVistoPortale(d)),
  portaleCliente: legge('portale', 'vedere il portale clienti', (w, d) => w.portaleCliente(d)),
  salvaPortaleCliente: scrive('portale', 'cambiare il portale dei clienti', (w, d) => w.salvaPortaleCliente(d)),
  invitaReferente: { modulo: 'portale', livello: 2, cosa: 'invitare i referenti nel portale', asincrona: true, soloPost: true, fn: (w, d) => w.invitaReferente(d) },
  salvaAccessoReferente: scrive('portale', 'cambiare gli accessi al portale', (w, d) => { w.controllaPortaleScrive(); return w.salvaAccessoReferente(d); }),
  togliAccessoReferente: scrive('portale', 'togliere gli accessi al portale', (w, d) => w.togliAccessoReferente(d)),
  pubblica: scrive('portale', 'pubblicare nel portale', (w, d) => w.pubblicaAzione(d)),
  togliDalPortale: scrive('portale', 'togliere le cose dal portale', (w, d) => w.togliDalPortale(d)),
  pubblicaPrima: legge('portale', 'pubblicare nel portale', (w, d) => w.pubblicaPrima(d)),
  pubblicati: legge('portale', 'vedere il portale clienti', (w, d) => w.leggiPubblicati(d)),
  caricamentiPortale: legge('portale', 'vedere i file dei clienti', (w, d) => w.caricamentiPortale(d)),
  accettaCaricamento: { scrive: true, controllo: () => ['portale', 2, 'accettare i file dei clienti'], vede: ['documenti'], cosa: 'archiviare i file dei clienti',
    fn: (w, d) => { if (w.livello('documenti') < 2) throw senzaPermesso('archiviare i file dei clienti'); return w.accettaCaricamento(d); } },
  rifiutaCaricamento: scrive('portale', 'rifiutare i file dei clienti', (w, d) => w.rifiutaCaricamento(d)),
  accessiPortale: legge('portale', 'vedere gli accessi al portale', (w, d) => w.accessiPortale(d)),
  anteprimaPortale: { modulo: 'portale', livello: 1, cosa: 'vedere il portale come il cliente', scrive: true, soloPost: true, fn: (w, d) => w.anteprimaPortale(d) },
  rispondiNelPortale: scrive('ticket', 'rispondere nel portale', (w, d) => w.rispondiNelPortale(d)),
  mostraNelPortale: scrive('ticket', 'mostrare i ticket nel portale', (w, d) => w.mostraNelPortale(d)),
  controllaPortale: { modulo: 'portale', livello: 1, cosa: 'controllare il portale', asincrona: true, fn: w => w.controllaPortale() },
  spegniPortale: scrive('amministrazione', 'spegnere il portale', (w, d) => w.spegniPortale(d)),
  allegaCopiaFattura: conCosti(scrive('fatturazione', 'allegare la copia delle fatture', (w, d) => w.allegaCopiaFattura(d))),

  // --- WhatsApp e comunicazioni (fase 7, §10.2): il collaboratore solo le sue, mai i pagamenti (lo decide il server)
  comunicazioni: legge('comunicazioni', 'vedere le comunicazioni', (w, d) => w.leggiComunicazioni(d)),
  daMandare: legge('comunicazioni', 'vedere i messaggi da mandare', w => w.daMandare()),
  preparaMessaggio: legge('comunicazioni', 'preparare i messaggi', (w, d) => w.preparaMessaggio(d)),
  salvaMessaggio: scrive('comunicazioni', 'scrivere le comunicazioni', (w, d) => w.salvaMessaggio(d)),
  segnaMandato: scrive('comunicazioni', 'segnare i messaggi mandati', (w, d) => w.segnaMandato(d)),
  mandaEmail: { modulo: 'comunicazioni', livello: 2, cosa: 'mandare email ai clienti', asincrona: true, soloPost: true, fn: (w, d) => w.mandaEmail(d) },
  nonMandare: scrive('comunicazioni', 'scartare i messaggi da mandare', (w, d) => w.nonMandare(d)),
  segnaWhatsapp: { scrive: true, vede: ['clienti', 'comunicazioni'], cosa: 'segnare il sì a WhatsApp', fn: (w, d) => w.segnaWhatsapp(d) },
  modelliMessaggi: legge('comunicazioni', 'vedere i modelli dei messaggi', w => w.leggiModelliMessaggi()),
  salvaModelloMessaggio: scrive('comunicazioni', 'scrivere i modelli dei messaggi', (w, d) => w.salvaModelloMessaggio(d)),
  togliModelloMessaggio: scrive('comunicazioni', 'togliere i modelli dei messaggi', (w, d) => w.togliModelloMessaggio(d)),
  nonSollecitare: conCosti(scrive('fatturazione', 'cambiare i promemoria di pagamento', (w, d) => w.nonSollecitare(d))),

  // --- notifiche (fase 7, §10.3): ognuno le sue
  notifiche: { libera: 'ognuno le sue', fn: (w, d) => w.leggiNotifiche(d) },
  segnaLette: { scrive: true, libera: 'ognuno le sue', fn: (w, d) => w.segnaLette(d) },
  segnaMostrate: { scrive: true, libera: 'ognuno le sue', fn: (w, d) => w.segnaMostrate(d) },
  salvaPreferenzeNotifiche: { scrive: true, libera: 'ognuno le sue', fn: (w, d) => w.salvaPreferenzeNotifiche(d) },

  // --- integrazioni (fase 8, fase8.md §13.1): le impostazioni che toccano internet vogliono anche amministrazione 2 (le controlla salvaIntegrazione)
  integrazioni: legge('integrazioni', 'vedere le integrazioni', w => w.integrazioniElenco()),
  integrazione: legge('integrazioni', 'vedere le integrazioni', (w, d) => w.integrazioneUna(d)),
  provaIntegrazione: { modulo: 'integrazioni', livello: 2, cosa: 'provare i collegamenti', asincrona: true, soloPost: true, fn: (w, d) => w.provaIntegrazione(d) },
  salvaIntegrazione: scrive('integrazioni', 'cambiare i collegamenti', (w, d) => w.salvaIntegrazione(d)),

  // --- calendario in altre app (fase 8, §13.2): il proprio file e i propri indirizzi con attivita 1 (anche il collaboratore e l'esterno)
  esportaCalendario: legge('attivita', 'scaricare il calendario', (w, d) => w.esportaCalendario(d)),
  feedCalendario: legge('attivita', 'vedere gli indirizzi del calendario', w => w.feedCalendario()),
  nuovoFeed: { scrive: true, modulo: 'attivita', livello: 1, cosa: 'creare gli indirizzi del calendario', fn: (w, d) => w.nuovoFeed(d) },
  revocaFeed: { scrive: true, modulo: 'attivita', livello: 1, cosa: 'togliere gli indirizzi del calendario', fn: (w, d) => w.revocaFeed(d) },

  // --- cercare dentro i file (fase 8, §13.3); "documenti {testo, dentro}" e' l'azione documenti di sempre
  letturaFile: legge('documenti', 'vedere i documenti', (w, d) => w.letturaFile(d)),
  rileggiFile: scrive('documenti', 'rileggere i file', (w, d) => w.rileggiFile(d)),

  // --- importa ed esporta (fase 8, §13.4): Esporta tutto solo il titolare (lo controlla l'azione)
  esportaTutto: scrive('amministrazione', 'esportare tutti i dati', w => w.esportaTutto()),
  esportazioni: legge('amministrazione', 'esportare tutti i dati', w => w.esportazioni()),
  leggiImport: { modulo: 'clienti', livello: 2, cosa: 'importare clienti e fornitori', soloPost: true, fn: (w, d) => w.leggiImport(d) },
  controllaImport: scrive('clienti', 'importare clienti e fornitori', (w, d) => w.controllaImport(d)),
  importaSoggetti: scrive('clienti', 'importare clienti e fornitori', (w, d) => w.importaSoggetti(d)),
  archiviaImportati: scrive('clienti', 'archiviare clienti e fornitori', (w, d) => w.archiviaImportati(d)),
  importazioni: legge('clienti', 'vedere le importazioni', w => w.importazioni()),

  // --- Dashboard (fase 8, §13.5): ognuno i suoi riquadri e le sue voci nascoste
  salvaRiquadri: { scrive: true, modulo: 'dashboard', livello: 1, cosa: 'scegliere i riquadri', fn: (w, d) => w.salvaRiquadri(d) },
  nascondiVoce: { scrive: true, modulo: 'dashboard', livello: 1, cosa: 'nascondere le voci', fn: (w, d) => w.nascondiVoce(d) },
  mostraNascoste: { scrive: true, modulo: 'dashboard', livello: 1, cosa: 'nascondere le voci', fn: w => w.mostraNascoste() },

  // --- amministrazione (fase 8, §13.6): funzioni accese, Scollega tutti, cifratura e cambio solo il titolare (lo controllano le azioni)
  impostazioniGenerali: legge('amministrazione', 'vedere le impostazioni', w => w.impostazioniGenerali()),
  // 03/11/2026: anche Amministrazione si spegne; il titolare raggiunge sempre le funzioni, per riaccenderla.
  funzioni: { controllo: (d, u) => (u && u.ruolo === 'titolare' ? null : ['amministrazione', 1, 'vedere le funzioni accese']), fn: w => w.funzioni() },
  salvaFunzioni: { scrive: true, controllo: (d, u) => (u && u.ruolo === 'titolare' ? null : ['amministrazione', 2, 'accendere e spegnere le funzioni']), fn: (w, d) => w.salvaFunzioni(d) },
  notifichePreferenze: { libera: 'ognuno le sue', fn: w => w.notifichePreferenze() },
  salvaNotifichePreferenze: { scrive: true, libera: 'ognuno le sue', fn: (w, d) => w.salvaNotifichePreferenze(d) },
  provaAvvisi: { modulo: 'amministrazione', livello: 2, cosa: 'mandare la prova degli avvisi', asincrona: true, soloPost: true, fn: w => w.provaAvvisi() },
  sicurezza: legge('amministrazione', 'vedere la sicurezza', w => w.sicurezza()),
  scollegaTutti: { modulo: 'amministrazione', livello: 2, cosa: 'scollegare tutti i dispositivi', asincrona: true, soloPost: true, fn: (w, d) => w.scollegaTutti(d) },
  accendiCifratura: scrive('amministrazione', 'accendere la cifratura della copia', w => w.accendiCifratura()),
  spegniCifratura: scrive('amministrazione', 'spegnere la cifratura della copia', (w, d) => w.spegniCifratura(d)),
  provaCopia: { modulo: 'amministrazione', livello: 2, cosa: 'provare le copie', asincrona: true, soloPost: true, fn: w => w.provaCopia() },
  segnaRipristino: scrive('amministrazione', 'segnare il ripristino provato', (w, d) => w.segnaRipristino(d)),
  statoSistema: legge('amministrazione', 'vedere lo stato del sistema', (w, d) => w.statoSistema(d)),
  controlliFinali: legge('amministrazione', 'vedere la lista di controllo', w => w.controlliFinali()),
  segnaControllo: scrive('amministrazione', 'segnare la lista di controllo', (w, d) => w.segnaControllo(d)),
  segnaCambio: scrive('amministrazione', 'segnare il cambio', (w, d) => w.segnaCambio(d)),
};

/** Fase 8 (§9.5): il nome della funzione spenta per la frase "La funzione ... e' spenta". */
const NOMI_FUNZIONI = require('./azioni/amministrazione8').NOMI_MODULI;

/**
 * Fase 6: le sole azioni che un esterno puo' chiamare (fase6.md §8.4). Tutto il resto risponde permesso:false prima di
 * cercare qualunque cosa: clienti, fornitori, preventivi, fatture, banche, persone, mezzi, amministrazione, costi. Le
 * azioni qui filtrano a loro volta: solo le commesse dei suoi incarichi, le sue cose, la sua scheda.
 */
const AZIONI_ESTERNO = new Set([
  'io', 'esci', 'cambiaPassword', 'anagrafiche', 'dashboard', 'esporta',
  // Collegare il proprio computer col QR: come entrare con email e password, che un esterno puo' fare.
  'autorizzaComputer', 'statoComputer',
  'rapportini', 'file', 'documenti', 'salvaRapportino', 'caricaFile', 'togliFile', 'stato', 'inviaEmail', 'legaRapportino',
  // 03/11/2026: i progetti delle commesse dei suoi incarichi, solo da leggere.
  'progetti', 'progetto', 'codiceProgetto',
  'ore', 'salvaOre', 'togliOre', 'timer', 'avviaTimer', 'fermaTimer', 'statisticheOre',
  'spese', 'salvaSpesa', 'togliSpesa', 'togliFotoSpesa', 'trasferte', 'rimborsi', 'riepilogoSpese', 'veicoli',
  'attivita', 'salvaAttivita', 'faiAttivita', 'togliAttivita', 'spuntaChecklist', 'togliAllegato',
  'documento', 'salvaDocumento', 'caricaVersione', 'togliVersione', 'categorieDocumenti', 'scadenze',
  'tickets', 'ticket', 'sospendiTicket', 'riprendiTicket', 'risolviTicket', 'altroIntervento', 'pianificaTicket', 'togliFotoTicket',
  'collaboratori', 'collaboratore', 'incarichi', 'incarico', 'compensi',
  // Fase 7: le sue notifiche (niente comunicazioni e niente portale: fase6.md §8.4, fase7.md §11.2).
  'notifiche', 'segnaLette', 'segnaMostrate', 'salvaPreferenzeNotifiche',
  // Fase 8: il suo calendario in altre app, le sue preferenze delle notifiche, i suoi riquadri e le sue voci nascoste.
  'esportaCalendario', 'feedCalendario', 'nuovoFeed', 'revocaFeed', 'notifichePreferenze', 'salvaNotifichePreferenze', 'salvaRiquadri', 'nascondiVoce', 'mostraNascoste',
]);

/**
 * Le URL dei file per le versioni vecchie (ponte): telefono e computer di
 * prima ricavano l'id dal link di Drive (".../d/<id>/view"). Gli id dei file
 * copiati da Drive sono quelli di Drive, quindi per loro il link e' vero; per
 * i nuovi serve solo a leggere l'id, che poi chiedono con l'azione "file".
 */
function perIlPonte(x) {
  if (typeof x === 'string') {
    const m = x.match(/^\/file\/([A-Za-z0-9_-]+)$/);
    return m ? 'https://drive.google.com/file/d/' + m[1] + '/view' : x;
  }
  if (Array.isArray(x)) return x.map(perIlPonte);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) o[k] = perIlPonte(x[k]);
    return o;
  }
  return x;
}

/**
 * Esegue una richiesta e torna la risposta (sempre un oggetto).
 * @param d        la richiesta: {azione, ...}
 * @param opzioni  {token, get} oppure {ponte: true} (le versioni vecchie, come il titolare)
 */
async function esegui(w, d, opzioni) {
  d = d && typeof d === 'object' ? d : {};
  opzioni = opzioni || {};
  const azione = testo(d.azione) || 'anagrafiche';
  const voce = Object.prototype.hasOwnProperty.call(AZIONI, azione) ? AZIONI[azione] : null;
  const perRegistro = Object.assign({}, d, { azione });
  // Con una GET solo le letture, come doGet() dello script: una password o una scrittura
  // in un indirizzo finirebbero nei registri di chiunque stia in mezzo.
  if (opzioni.get && voce && (voce.scrive || voce.soloPost)) {
    return { ok: false, errore: 'Questa azione vuole una POST' };
  }
  delete perRegistro.codice;

  let utente = null;
  let sessione = null;
  let permessi = null;
  if (!voce || !voce.pubblica) {
    if (opzioni.ponte) {
      utente = w.titolare();
      if (!utente) {
        w.registraAccesso(perRegistro, 'rifiutato', null);
        return { ok: false, errore: 'Nessun titolare attivo sul server: crealo con node server/strumenti/utente.js --titolare' };
      }
    } else {
      const s = w.utenteDaToken(opzioni.token);
      if (!s) {
        w.registraAccesso(perRegistro, 'accesso negato', null);
        return { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false };
      }
      utente = s.utente;
      sessione = s.sessione;
      // Il dispositivo l'ha detto all'accesso: vale anche per le richieste che non lo ripetono.
      if (!testo(perRegistro.disp)) perRegistro.disp = s.disp;
      if (!testo(perRegistro.dispNome)) perRegistro.dispNome = s.dispNome;
      if (!testo(perRegistro.app)) perRegistro.app = s.app;
    }
    permessi = w.permessiDi(utente.ruolo);
  }
  if (!voce) {
    w.registraAccesso(perRegistro, 'errore', utente);
    return { ok: false, errore: 'Azione sconosciuta: ' + azione };
  }

  // Fase 8 (§0.2): la sessione arrivata dalla porta Google (sessioni.da_fuori, per "ultimo accesso da fuori casa").
  if (sessione && provenienza().ip === 'google') w.segnaDaFuori(sessione);
  const chi = {
    utente, permessi, sessione, ponte: !!opzioni.ponte, azione,
    disp: testo(perRegistro.disp), dispNome: testo(perRegistro.dispNome), app: testo(perRegistro.app),
    // Fase 8 (§0.3): schema e Host della richiesta, per l'indirizzo del calendario in casa.
    richiesta: opzioni.richiesta || null,
  };
  return w.come(chi, async () => {
    let risposta;
    let esito = 'ok';
    try {
      // Fase 6: l'esterno chiama solo le sue azioni (le altre non sa nemmeno che ci sono).
      if (utente && utente.ruolo === 'esterno' && !AZIONI_ESTERNO.has(azione)) throw senzaPermesso(voce.cosa || 'usare questa parte di Wisper');
      const serve = voce.modulo ? [voce.modulo, voce.livello, voce.cosa] : voce.controllo ? voce.controllo(d, utente) : null;
      // Fase 8 (§9.5): un'azione di una funzione spenta risponde "spenta" (i dati restano). Eccezione: l'incasso segnato da
      // una fattura scrive il movimento anche con Banche spenta (serve a "Pagata"), coi permessi veri della persona.
      const spenti = permessi ? w.moduliSpenti() : [];
      if (spenti.length) {
        const spento = serve && spenti.indexOf(serve[0]) >= 0 ? serve[0] : (!serve && voce.vede && voce.vede.every(m => spenti.indexOf(m) >= 0) ? voce.vede[0] : '');
        if (spento === 'banche' && azione === 'segnaIncasso' && testo(d.idFattura)) {
          const veri = w.permessiDi(utente.ruolo, { veri: true });
          if ((veri.fatturazione || 0) < 2 || (veri.banche || 0) < 2) throw senzaPermesso(serve[2]);
          w.chi().permessi = permessi = veri;
        } else if (spento) {
          throw new Rifiuto('La funzione ' + NOMI_FUNZIONI[spento] + ' è spenta: si accende in Amministrazione', { spenta: true });
        }
      }
      if (serve && permessi && (permessi[serve[0]] || 0) < serve[1]) throw senzaPermesso(serve[2]);
      // Fase 5: basta uno di questi moduli in lettura (scadenze: documenti o ticket; storico dell'impianto: clienti o ticket).
      if (voce.vede && permessi && !voce.vede.some(m => (permessi[m] || 0) >= 1)) throw senzaPermesso(voce.cosa);
      if (voce.costi && permessi && !permessi.costi) throw new Rifiuto(SENZA_COSTI[voce.modulo] || SENZA_COSTI.fatturazione, { permesso: false });
      if (voce.asincrona) risposta = await voce.fn(w, d);
      else if (voce.scrive) risposta = w.db.transazione(() => voce.fn(w, d));
      else risposta = voce.fn(w, d);
    } catch (err) {
      if (err instanceof Rifiuto) {
        risposta = Object.assign({ ok: false, errore: err.message }, err.extra);
        esito = err.esito || (err.extra.permesso === false ? 'permesso negato' : 'errore');
      } else {
        console.error('[errore] ' + azione + ': ' + (err && err.stack ? err.stack : err));
        risposta = { ok: false, errore: 'Errore del server: ' + messaggio(err) };
        esito = 'errore';
      }
    }
    // Fase 6: i dati personali e riservati delle persone che chi chiede non vede (prima dei soldi: togliCosti ricopia
    // gli oggetti e non porta con se' i segni di chi sono i dati).
    if (permessi) {
      try {
        risposta = w.togliDatiPersona(risposta);
      } catch (err) {
        console.error('[errore] dati della persona: ' + (err && err.stack ? err.stack : err));
        risposta = { ok: false, errore: 'Errore del server: ' + messaggio(err) };
      }
    }
    if (permessi && !permessi.costi) risposta = togliCosti(risposta);
    if (opzioni.ponte) risposta = perIlPonte(risposta);
    const chiE = utente || (azione === 'accedi' && risposta.ok ? risposta.utente : null);
    // Il collegamento col QR: le attese ogni 2 secondi riempirebbero gli accessi (voce.registra decide).
    if (!voce.registra || voce.registra(risposta)) w.registraAccesso(perRegistro, opzioni.ponte && esito === 'ok' ? 'ponte' : esito, chiE);
    return risposta;
  });
}

module.exports = { esegui, AZIONI, AZIONI_ESTERNO, perIlPonte };
