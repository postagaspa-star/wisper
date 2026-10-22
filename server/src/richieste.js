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
  esci: { soloPost: true, fn: w => w.esci() },
  io: { fn: w => w.io() },
  cambiaPassword: { asincrona: true, soloPost: true, fn: (w, d) => w.cambiaPassword(d) },

  // --- le azioni di oggi
  anagrafiche: { fn: (w, d) => w.rispostaAnagrafiche(d) },
  rapportini: legge('rapportini', 'vedere i rapportini', (w, d) => ({
    ok: true,
    rapportini: w.leggiRapportini(d.da, d.a, siVuole(d.tutti), { idCliente: d.idCliente, idCommessa: d.idCommessa, statoApprovazione: d.statoApprovazione }),
  })),
  file: { fn: (w, d) => ({ ok: true, file: w.leggiFile(d.id) }) },
  documenti: legge('documenti', 'vedere i documenti', (w, d) => w.documentiCommessa(d.idCommessa)),
  salvaRapportino: scrive('rapportini', 'scrivere i rapportini', (w, d) => ({ ok: true, rapportino: w.salvaRapportino(d.rapportino || {}) })),
  caricaFile: {
    scrive: true,
    // Il permesso dipende da cosa si carica.
    controllo: d => (d.tipo === 'documento' ? ['documenti', 2, 'caricare documenti']
      : d.tipo === 'firmaTecnico' ? ['amministrazione', 2, 'cambiare la firma del tecnico']
        : d.tipo === 'attivita' ? ['attivita', 2, 'caricare allegati sulle attività']
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
  // Il nome che usava il primo Wisper: resta valido.
  statoCommessa: scrive('commesse', 'cambiare le commesse', (w, d) => ({ ok: true, commessa: w.aggiornaCommessa(d.idCommessa, { stato: d.stato }) })),
  salvaImpostazioni: scrive('amministrazione', 'cambiare le impostazioni', (w, d) => ({ ok: true, impostazioni: w.salvaImpostazioni(d.valori || {}) })),
  inviaEmail: { modulo: 'rapportini', livello: 2, cosa: 'mandare email', asincrona: true, soloPost: true, fn: async (w, d) => ({ ok: true, rapportini: await w.inviaEmail(d) }) },
  salvaGruppo: nonServePiu,
  collegaComputer: nonServePiu,

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
  numerazioni: legge('amministrazione', 'vedere le numerazioni', w => ({ ok: true, numerazioni: w.leggiNumerazioni() })),
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
  salvaReferente: scrive('clienti', 'cambiare i referenti', (w, d) => ({ ok: true, referente: w.salvaReferente(d.referente || {}) })),
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
  esporta: { fn: (w, d) => w.esporta(d) },

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
  daApprovare: { fn: w => w.daApprovare() },
  approva: { scrive: true, fn: (w, d) => w.decidi(d, 'approva') },
  respingi: { scrive: true, fn: (w, d) => w.decidi(d, 'respingi') },
  annullaApprovazione: { scrive: true, fn: (w, d) => w.decidi(d, 'annulla') },

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
};

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

  const chi = {
    utente, permessi, sessione, ponte: !!opzioni.ponte, azione,
    disp: testo(perRegistro.disp), dispNome: testo(perRegistro.dispNome), app: testo(perRegistro.app),
  };
  return w.come(chi, async () => {
    let risposta;
    let esito = 'ok';
    try {
      const serve = voce.modulo ? [voce.modulo, voce.livello, voce.cosa] : voce.controllo ? voce.controllo(d) : null;
      if (serve && permessi && (permessi[serve[0]] || 0) < serve[1]) throw senzaPermesso(serve[2]);
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
    if (permessi && !permessi.costi) risposta = togliCosti(risposta);
    if (opzioni.ponte) risposta = perIlPonte(risposta);
    const chiE = utente || (azione === 'accedi' && risposta.ok ? risposta.utente : null);
    w.registraAccesso(perRegistro, opzioni.ponte && esito === 'ok' ? 'ponte' : esito, chiE);
    return risposta;
  });
}

module.exports = { esegui, AZIONI, perIlPonte };
