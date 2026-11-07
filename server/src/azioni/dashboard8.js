/*
 * La Dashboard con tutte le fasi insieme (fase 8, fase8.md §8): le voci di sette fasi messe una dopo l'altra non stanno
 * piu' in una pagina. Un passaggio finale, uguale per tutte le fasi, dopo che ognuna ha scritto le sue voci:
 *  1. una cosa, una voce: ogni voce ha un "oggetto" (ticket:23, fattura:43, rapportino:RAP/2026/0153...); se due regole
 *     fanno una voce per lo stesso oggetto resta la piu' grave, col dettaglio dell'altra in coda ("· dal portale");
 *  2. ordine fisso: per gravita' (urgente, attenzione, soldi, info), poi per tipo nell'ordine di §8.3, poi per data;
 *  3. tetti: 7 Urgenti, 7 Questa settimana, 5 Da pianificare, con "quante" per sezione (Altre N);
 *  4. da 3 voci della stessa famiglia in una sezione se ne fa una (le voci di sistema mai);
 *  5. Da approvare in una voce sola (rapportini e spese, ferie, documenti), con le sue righe;
 *  6. la piu' urgente = la prima di Urgenti (le app non la ripetono sotto);
 *  7. le voci "info" di Da pianificare si nascondono per 30 giorni (dashboard_nascoste);
 *  8. quattro riquadri per persona (utenti.riquadri, o quelli del ruolo).
 * Con tutto: true niente tetti e niente gruppi (Tutto quello che c'e' da fare), ma sempre una cosa una voce.
 * Le funzioni spente (§9.5) non hanno voci; la Lettura non ha le voci che chiedono di fare qualcosa (§8.5).
 */
'use strict';

const { Rifiuto, testo, adesso, adessoMs, oggi, dataOraIso, dataIso, istante, numero } = require('../utili');

const GRAVITA = { urgente: 0, attenzione: 1, soldi: 2, info: 3 };
const TETTI = { urgenti: 7, settimana: 7, pianificare: 5 };
const SEZIONI = ['urgenti', 'settimana', 'pianificare'];

/** L'ordine fisso dei tipi dentro la stessa gravita' (§8.3). Un tipo fuori elenco va in fondo (la prova lo trova). */
const ORDINE_TIPI = [
  ['sistema', 'integrazione', 'ripristino', 'versione', 'controlli'],
  ['ticket', 'intervento'],
  ['timer'],   // 07/11/2026: nessuna voce "timer" esce piu' (Ore tolte); il posto resta per non spostare l'ordine
  ['mezzo', 'strumento'],
  ['attivita', 'appuntamento', 'sopralluogo'],
  ['respinta'],
  ['approvare'],
  ['fattura', 'cassa'],
  ['impegno'],
  ['scadenza', 'qualifica', 'visita', 'collaboratore'],
  ['prestito'],
  ['preventivo'],
  ['rapportini', 'giorni'],
  ['fatturazione', 'rimborsi'],
  ['commessa'],
  ['portale', 'messaggio', 'pagamento'],
  ['assenza'],
  ['documento', 'contratto', 'guasto', 'incarico', 'persona', 'veicoli', 'conto', 'fiscale', 'spazio', 'copia', 'cliente', 'ricevuta'],
];
const RANGO = {};
ORDINE_TIPI.forEach((l, i) => l.forEach(t => { RANGO[t] = i; }));

/** L'area di ogni tipo (le pillole di Tutto quello che c'e' da fare). */
const AREA = {
  sistema: 'sistema', integrazione: 'sistema', ripristino: 'sistema', versione: 'sistema', controlli: 'sistema', spazio: 'sistema', copia: 'sistema',
  ticket: 'documenti', intervento: 'documenti', documento: 'documenti', scadenza: 'documenti', contratto: 'documenti',
  timer: 'lavoro', attivita: 'lavoro', appuntamento: 'lavoro', sopralluogo: 'lavoro', respinta: 'lavoro', approvare: 'lavoro', rapportini: 'lavoro', giorni: 'lavoro',
  commessa: 'lavoro',
  fattura: 'soldi', cassa: 'soldi', impegno: 'soldi', fatturazione: 'soldi', rimborsi: 'soldi', conto: 'soldi', fiscale: 'soldi', ricevuta: 'soldi',
  mezzo: 'persone', strumento: 'persone', prestito: 'persone', guasto: 'persone', persona: 'persone', assenza: 'persone', veicoli: 'persone',
  qualifica: 'persone', visita: 'persone', collaboratore: 'persone', incarico: 'persone',
  portale: 'clienti', messaggio: 'clienti', pagamento: 'clienti', preventivo: 'clienti', cliente: 'clienti',
};

/** Le funzioni che si spengono (§9.5) e i tipi delle loro voci. */
const TIPI_DEL_MODULO = {
  mezzi: ['mezzo', 'strumento', 'prestito', 'guasto'],
  collaboratori: ['collaboratore', 'incarico'],
  portale: ['portale'],
  comunicazioni: ['messaggio', 'pagamento'],
  banche: ['cassa', 'impegno', 'conto'],
};

/**
 * L'oggetto dalla pagina del collegamento, solo per le pagine che SONO la cosa (un ticket, una fattura, una scadenza).
 * Le pagine che contengono tante cose (una persona, un mezzo, una commessa, un cliente) no: due scadenze diverse di Marco
 * restano due voci. Dove due regole parlano della stessa cosa con pagine diverse, la voce porta il suo "oggetto".
 */
const OGGETTO_DI_PAGINA = {
  ticket: 'ticket', fattura: 'fattura', rapportino: 'rapportino', preventivo: 'preventivo', scadenza: 'scadenza', attivita: 'attivita',
  documento: 'documento', contratto: 'contratto', incarico: 'incarico', impegni: 'impegno', integrazione: 'integrazione',
};

/** Le famiglie che si raggruppano da 3 (§8.2, 4): [famiglia, plurale, collegamento]. */
const FAMIGLIE = {
  scadenze: ['scadenze', { pagina: 'documenti', filtro: { segmento: 'scadenze' } }],
  attivita: ['attività', { pagina: 'attivita' }],
  rapportini: ['lavori da inviare', { pagina: 'rapportini', filtro: { quali: 'inviare' } }],
  preventivi: ['preventivi da seguire', { pagina: 'preventivi' }],
  ticket: ['ticket da seguire', { pagina: 'tickets', filtro: { segmento: 'aperti' } }],
  fatture: ['fatture scadute', { pagina: 'fatture', filtro: { scadute: true } }],
  documenti: ['cose dei documenti', { pagina: 'documenti' }],
  guasti: ['guasti', { pagina: 'mezzi', filtro: { segmento: 'guasti' } }],
  file: ['file dai clienti da guardare', { pagina: 'portale', filtro: { segmento: 'daguardare' } }],
  messaggi: ['messaggi dei clienti', { pagina: 'portale', filtro: { segmento: 'daguardare' } }],
  approvare: ['cose da approvare', { pagina: 'approvare' }],
};

/** Il riquadri tra cui scegliere (§8.4): [chiave, nome]. */
const RIQUADRI = [
  ['commesseAperte', 'Commesse aperte'], ['commesseInRitardo', 'Commesse in ritardo'], ['daFatturare', 'Da fatturare'], ['daIncassare', 'Da incassare'],
  ['scaduto', 'Scaduto'], ['nelConto', 'Nel conto'], ['ticketAperti', 'Ticket aperti'], ['interventiOggi', 'Interventi oggi'], ['scadenzeVicine', 'Scadenze vicine'],
  ['assentiOggi', 'Assenti oggi'], ['daApprovare', 'Da approvare'], ['tarateScadute', 'Tarature scadute'], ['dalPortale', 'Dal portale'],
  ['daMandareOggi', 'Da mandare oggi'], ['oreSettimana', 'Ore della settimana'], ['attivitaOggi', 'Attività di oggi'], ['mieiTicket', 'I miei ticket'],
  ['preventiviInAttesa', 'Preventivi in attesa'],
];
const RIQUADRI_DI_BASE = {
  titolare: ['daFatturare', 'scaduto', 'ticketAperti', 'daApprovare'],
  amministrazione: ['daFatturare', 'daIncassare', 'scaduto', 'scadenzeVicine'],
  collaboratore: ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'daMandareOggi'],
  lettura: ['commesseAperte', 'daFatturare', 'daIncassare', 'scaduto'],
  esterno: ['oreSettimana', 'attivitaOggi', 'mieiTicket', 'commesseAperte'],
};

const plurale = (n, uno, tanti) => n + ' ' + (n === 1 ? uno : tanti);
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

function famigliaDi(v, sezione) {
  if (v.tipo === 'sistema' || AREA[v.tipo] === 'sistema') return '';
  if (['scadenza', 'qualifica', 'visita'].indexOf(v.tipo) >= 0) return 'scadenze';
  // Solo le attivita' da fare: un appuntamento o un sopralluogo di oggi resta una voce sua (ha l'ora).
  if (v.tipo === 'attivita') return 'attivita';
  if (v.tipo === 'rapportini' && /da inviare/.test(v.titolo)) return 'rapportini';
  if (v.tipo === 'preventivo') return 'preventivi';
  if (v.tipo === 'ticket' && v.gravita !== 'urgente') return 'ticket';
  if (v.tipo === 'fattura' && /scadut/.test(v.titolo)) return 'fatture';
  if (v.tipo === 'documento') return 'documenti';
  if (v.tipo === 'guasto') return 'guasti';
  if (v.tipo === 'portale' && /file dai clienti|caricat/i.test(v.titolo)) return 'file';
  if (v.tipo === 'portale' && v.collegamento && v.collegamento.pagina === 'ticket' && sezione !== 'urgenti') return 'messaggi';
  if (v.tipo === 'approvare') return 'approvare';
  return '';
}

function oggettoDi(v, sezione) {
  if (v.oggetto) return v.oggetto;
  const c = v.collegamento || {};
  if (c.id !== undefined && c.id !== null && c.id !== '' && OGGETTO_DI_PAGINA[c.pagina]) return OGGETTO_DI_PAGINA[c.pagina] + ':' + c.id;
  // Le voci di gruppo o senza una cosa sola: uniche per tipo, sezione e titolo.
  return 'voce:' + v.tipo + ':' + sezione + ':' + v.titolo;
}

/** La coda del dettaglio della voce che sparisce (§8.2, 1). */
function codaDi(v) {
  if (v.tipo === 'pagamento') return 'promemoria pronto';
  if (v.tipo === 'portale') {
    if (/firmare/.test(v.titolo)) return 'da firmare nel portale';
    if (/accettato/.test(v.titolo)) return 'accettato nel portale';
    return 'dal portale';
  }
  return '';
}

module.exports = {
  // ------------------------------------------------------------------ le voci nuove della fase 8 (§8.7)

  /** Le voci di sistema e le altre della fase 8: titolare e chi ha amministrazione 2, mai il collaboratore. */
  vociFase8({ mie, voce, urgenti, settimana, pianificare }) {
    const c = this.chi();
    const ruolo = c.utente ? c.utente.ruolo : 'titolare';
    if (mie || !(ruolo === 'titolare' || (this.livello('amministrazione') >= 2 && ruolo !== 'lettura'))) return;
    const sicurezza = { pagina: 'amministrazione', filtro: { sezione: 'sicurezza' } };
    const copie = { pagina: 'amministrazione', filtro: { sezione: 'copie' } };
    // Il server interno su internet.
    const interno = this.ultimaRichiestaInterna ? this.ultimaRichiestaInterna() : null;
    if (interno) voce(urgenti, { tipo: 'sistema', gravita: 'urgente', titolo: 'Il server interno si raggiunge da internet', dettaglio: this.fraseInternetInterno(interno), collegamento: sicurezza, oggetto: 'sistema:internetinterno' });
    // La copia fuori casa che non riesce da 2 notti (prima era solo email).
    const ultime = this.db.righe('SELECT * FROM copie ORDER BY id DESC LIMIT 2');
    if (ultime.length === 2 && ultime.every(x => /^errore/.test(x.fuori || ''))) {
      voce(urgenti, { tipo: 'sistema', gravita: 'urgente', titolo: 'La copia fuori casa non riesce da 2 notti', dettaglio: String(ultime[0].fuori).replace(/^errore: /, ''), collegamento: copie, oggetto: 'sistema:copiafuori' });
    }
    // La prova automatica della copia non riuscita (l'ultima).
    const prova = this.db.riga("SELECT * FROM copie_prove WHERE tipo = 'automatica' ORDER BY id DESC LIMIT 1");
    if (prova && prova.esito === 'errore') {
      const g = /wisper-(\d{4})(\d{2})(\d{2})/.exec(prova.copia || '');
      voce(urgenti, { tipo: 'sistema', gravita: 'urgente', titolo: 'La prova automatica della copia non è riuscita',
        dettaglio: (g ? 'La copia del ' + g[3] + '/' + g[2] : 'L\'ultima copia') + ' non torna: guarda Copie e ripristino', collegamento: copie, oggetto: 'sistema:provacopia' });
    }
    // Il postino che non risponde da 3 ore.
    const p = this.db.riga("SELECT * FROM integrazioni WHERE chiave = 'postino'");
    if (p && p.stato === 'errore') {
      const da = p.riuscito_il ? (adessoMs() - Date.parse(p.riuscito_il)) / 3600000 : Infinity;
      if (da >= 3) voce(urgenti, { tipo: 'sistema', gravita: 'urgente', titolo: 'Il postino non risponde da ' + (isFinite(da) ? Math.floor(da) + ' ore' : 'quando è acceso il server'),
        dettaglio: 'Le email e la copia fuori casa aspettano', collegamento: { pagina: 'integrazione', id: 'postino' }, oggetto: 'integrazione:postino' });
    }
    // Gli altri collegamenti in Errore: non fermano il lavoro (questa settimana).
    for (const x of this.integrazioniInErrore()) {
      if (['internetinterno', 'copiafuori'].indexOf(x.v.chiave) >= 0) continue;
      if (x.v.chiave === 'postino' && urgenti.some(u => u.oggetto === 'integrazione:postino')) continue;
      voce(settimana, { tipo: 'integrazione', gravita: 'attenzione', titolo: 'Errore: ' + x.v.nome, dettaglio: x.s.esito, collegamento: { pagina: 'integrazione', id: x.v.chiave }, oggetto: 'integrazione:' + x.v.chiave });
    }
    // Il ripristino a mano da provare (dopo PROVA_RIPRISTINO_GIORNI), solo quando c'e' gia' una copia da provare.
    const imp = this.leggiImpostazioni();
    const giorni = numero(imp.PROVA_RIPRISTINO_GIORNI) || 90;
    if (this.db.riga("SELECT id FROM copie WHERE locale = 'ok' LIMIT 1")) {
      const ultima = this.db.riga("SELECT quando FROM copie_prove WHERE tipo = 'a_mano' AND esito = 'ok' ORDER BY id DESC LIMIT 1");
      const fa = ultima ? Math.floor((adessoMs() - Date.parse(ultima.quando)) / 86400000) : null;
      if (fa === null || fa >= giorni) {
        voce(pianificare, { tipo: 'ripristino', gravita: 'info', titolo: 'Prova il ripristino di una copia: ' + (fa === null ? 'non è ancora mai stato provato' : 'l\'ultima volta è stata ' + fa + ' giorni fa'),
          dettaglio: 'Sul tuo computer, con una copia presa da Drive', collegamento: copie, oggetto: 'sistema:ripristino' });
      }
    }
    // I dispositivi con una versione vecchia (quando si sa l'ultima: controllo "aggiornamenti").
    const vecchi = this.dispositiviIndietro();
    if (vecchi.length) {
      const u = this.versioniUltime || {};
      voce(pianificare, { tipo: 'versione', gravita: 'info', titolo: plurale(vecchi.length, 'dispositivo ha una versione vecchia di Wisper', 'dispositivi hanno una versione vecchia di Wisper'),
        dettaglio: vecchi.slice(0, 2).map(d => d.nome + ': ' + d.versione + ' · ultima ' + (d.tipo === 'telefono' ? u.telefono : u.computer)).join(', '),
        collegamento: { pagina: 'amministrazione', filtro: { sezione: 'stato' } }, oggetto: 'sistema:versioni' });
    }
    // La lista prima del cambio, finche' il cambio non e' fatto.
    const cambio = this.statoCambio();
    if (cambio.stato === 'prima' || cambio.stato === 'prova') {
      const n = this.db.riga("SELECT COUNT(*) n FROM controlli_finali WHERE chiave LIKE 'C%' AND stato <> 'fatto'").n;
      if (n) voce(pianificare, { tipo: 'controlli', gravita: 'info', titolo: plurale(n, 'controllo della lista prima del cambio da fare', 'controlli della lista prima del cambio da fare'),
        dettaglio: 'Amministrazione › Lista di controllo', collegamento: { pagina: 'amministrazione', filtro: { sezione: 'controlli' } }, oggetto: 'sistema:controlli' });
    }
  },

  /** I dispositivi usati negli ultimi 30 giorni con una versione piu' vecchia dell'ultima (sessioni.app = "telefono 0.9.0"). */
  dispositiviIndietro() {
    const u = this.versioniUltime || this.versioniDaEsito();
    if (!u || (!u.telefono && !u.computer)) return [];
    const da = istante(new Date(adessoMs() - 30 * 86400000));
    const out = [];
    const visti = new Set();
    for (const s of this.db.righe("SELECT s.app, s.disp, s.disp_nome, s.ultimo_uso, u.nome FROM sessioni s JOIN utenti u ON u.id = s.utente_id WHERE s.revocata IS NULL AND s.ultimo_uso >= ? ORDER BY s.ultimo_uso DESC", da)) {
      const m = /^(telefono|ufficio)\s+(\d+\.\d+\.\d+)/.exec(s.app || '');
      if (!m || visti.has(s.disp || s.disp_nome)) continue;
      visti.add(s.disp || s.disp_nome);
      const tipo = m[1] === 'telefono' ? 'telefono' : 'computer';
      const ultima = u[tipo];
      if (ultima && confrontaVersioni(m[2], ultima) < 0) out.push({ nome: (s.disp_nome || (tipo === 'telefono' ? 'Telefono' : 'Computer')) + (s.nome ? ' di ' + s.nome.split(' ')[0] : ''), versione: m[2], tipo, ultimoUso: dataOraIso(s.ultimo_uso) });
    }
    return out;
  },

  /** Le ultime versioni lette dall'esito del controllo "aggiornamenti" (dopo un riavvio, prima del controllo nuovo). */
  versioniDaEsito() {
    const r = this.db.riga("SELECT esito FROM integrazioni WHERE chiave = 'aggiornamenti' AND stato = 'collegato'");
    if (!r) return null;
    const t = /telefono (\d+\.\d+\.\d+)/.exec(r.esito || '');
    const c = /computer (\d+\.\d+\.\d+)/.exec(r.esito || '');
    if (!t && !c) return null;
    this.versioniUltime = { telefono: t ? t[1] : '', computer: c ? c[1] : '' };
    return this.versioniUltime;
  },

  // ------------------------------------------------------------------ il passaggio finale (§8.2)

  /** Mette in ordine la risposta della Dashboard: la chiama dashboard() di ogni fase, alla fine. */
  dashboardFinale(risposta, d, o) {
    d = d || {};
    const tutto = d.tutto === true || d.tutto === 'true' || d.tutto === '1' || d.tutto === 1;
    const c = this.chi();
    const io = c.utente ? c.utente.id : null;
    const ruolo = c.utente ? c.utente.ruolo : 'titolare';
    const spenti = new Set(this.moduliSpenti());
    const tipiSpenti = new Set();
    for (const m of spenti) (TIPI_DEL_MODULO[m] || []).forEach(t => tipiSpenti.add(t));
    const nascoste = new Set(io ? this.db.righe('SELECT oggetto FROM dashboard_nascoste WHERE utente_id = ? AND fino > ?', io, adesso()).map(r => r.oggetto) : []);
    // Tutte le voci con la loro sezione, i campi nuovi e i filtri.
    let tutte = [];
    for (const sezione of SEZIONI) {
      (risposta[sezione] || []).forEach((v, i) => {
        if (v.tipo === 'spazio' && v.gravita === 'urgente') v = Object.assign({}, v, { tipo: 'sistema' });
        if (tipiSpenti.has(v.tipo)) return;
        if (ruolo === 'lettura' && this.vocePerChiAgisce(v)) return;
        const x = Object.assign({}, v);
        x.oggetto = oggettoDi(v, sezione);
        x.area = AREA[v.tipo] || 'lavoro';
        x.nascondibile = sezione === 'pianificare' && v.gravita === 'info';
        x.sezione = sezione;
        x.n = i;
        tutte.push(x);
      });
    }
    // 1. Una cosa, una voce: resta la piu' grave, l'altra lascia la sua coda.
    const peso = v => SEZIONI.indexOf(v.sezione) * 100 + (GRAVITA[v.gravita] === undefined ? 9 : GRAVITA[v.gravita]) * 10 + (RANGO[v.tipo] === undefined ? 99 : RANGO[v.tipo]) / 100;
    const perOggetto = new Map();
    for (const v of tutte) {
      const prima = perOggetto.get(v.oggetto);
      if (!prima) { perOggetto.set(v.oggetto, v); continue; }
      const [resta, va] = peso(v) < peso(prima) ? [v, prima] : [prima, v];
      const coda = codaDi(va);
      if (coda && String(resta.dettaglio || '').indexOf(coda) < 0) resta.dettaglio = (resta.dettaglio ? resta.dettaglio + ' · ' : '') + coda;
      perOggetto.set(v.oggetto, resta);
    }
    tutte = Array.from(perOggetto.values());
    // Le voci di gruppo che portano i loro oggetti (oggetti: [...]) assorbono le voci singole meno gravi delle stesse cose.
    for (const g of tutte.filter(v => Array.isArray(v.oggetti))) {
      const dentro = new Set(g.oggetti);
      tutte = tutte.filter(v => {
        if (v === g || !dentro.has(v.oggetto) || peso(v) < peso(g)) return true;
        const coda = codaDi(v);
        if (coda && String(g.dettaglio || '').indexOf(coda) < 0) g.dettaglio = (g.dettaglio ? g.dettaglio + ' · ' : '') + coda;
        return false;
      });
    }
    // 5. Da approvare in una voce sola, per chi approva (rapportini e spese, ferie, documenti). In Tutto quello che c'e' da fare no:
    // li' niente raggruppamenti, ogni cosa da approvare con la sua riga.
    if (!tutto && (!o || !o.mie)) tutte = this.unaVoceDaApprovare(tutte);
    const nNascoste = tutte.filter(v => v.nascondibile && nascoste.has(v.oggetto)).length;
    tutte = tutte.filter(v => !(v.nascondibile && nascoste.has(v.oggetto)));
    // 2. Ordine fisso.
    const ordine = (a, b) => (GRAVITA[a.gravita] - GRAVITA[b.gravita]) || ((RANGO[a.tipo] === undefined ? 99 : RANGO[a.tipo]) - (RANGO[b.tipo] === undefined ? 99 : RANGO[b.tipo])) ||
      (a.sezione === 'urgenti' && a.unita === 'giorni' && b.unita === 'giorni' ? (b.quanto || 0) - (a.quanto || 0) : 0) || (a.n - b.n);
    const out = Object.assign({}, risposta);
    out.quante = {};
    for (const sezione of SEZIONI) {
      let lista = tutte.filter(v => v.sezione === sezione).sort(ordine);
      if (!tutto) lista = this.raggruppa(lista, sezione).sort(ordine);
      out.quante[sezione] = lista.length;
      out[sezione] = (tutto ? lista : lista.slice(0, TETTI[sezione])).map(pulisciVoce);
    }
    out.piuUrgente = out.urgenti.length ? out.urgenti[0] : null;
    out.nascoste = io ? this.db.riga('SELECT COUNT(*) n FROM dashboard_nascoste WHERE utente_id = ? AND fino > ?', io, adesso()).n : 0;
    out.nascosteQui = nNascoste;
    out.tutto = tutto;
    out.riquadri = this.riquadriDi(risposta);
    // Cambia i riquadri: quelli che la persona puo' scegliere (§8.4).
    out.riquadriPossibili = this.riquadriDaScegliere(risposta);
    out.numerini = this.numeriniDelMenu(risposta);
    return out;
  },

  /** La Lettura non vede le voci che chiedono di fare qualcosa che non puo' fare (§8.5). */
  vocePerChiAgisce(v) {
    if (v.tipo === 'approvare' || v.tipo === 'respinta' || v.tipo === 'timer') return true;
    if (AREA[v.tipo] === 'sistema') return true;
    if (v.tipo === 'portale' || v.tipo === 'messaggio' || v.tipo === 'pagamento') return !(v.gravita === 'info' && /firmato/.test(v.titolo));
    return false;
  },

  /** Da 3 voci della stessa famiglia in una sezione se ne fa una (§8.2, 4): "4 scadenze nei prossimi 30 giorni". */
  raggruppa(lista, sezione) {
    const per = new Map();
    for (const v of lista) {
      const f = famigliaDi(v, sezione);
      if (!f) continue;
      (per.get(f) || per.set(f, []).get(f)).push(v);
    }
    let out = lista.slice();
    for (const [f, voci] of per) {
      if (voci.length < 3) continue;
      const [nome, collegamento] = FAMIGLIE[f];
      const conta = voci.reduce((t, v) => t + (v.oggetti ? v.oggetti.length : (v.unita && v.quanto && /voci|ticket|scadenze|documenti|attivita|rapportini|preventivi|file|messaggi/.test(v.unita) ? v.quanto : 1)), 0);
      const fase = f === 'scadenze' ? (sezione === 'urgenti' ? ' scadute' : sezione === 'settimana' ? ' nei prossimi 30 giorni' : ' più avanti') : '';
      const nomi = voci.slice(0, 3).map(v => v.titolo.replace(/ (scade|è scaduta|scaduta).*$/, ''));
      const altre = voci.length - 3;
      const gruppo = {
        tipo: voci[0].tipo, gravita: voci.reduce((g, v) => (GRAVITA[v.gravita] < GRAVITA[g] ? v.gravita : g), 'info'),
        titolo: conta + ' ' + nome + fase, dettaglio: nomi.join(', ') + (altre > 0 ? ' e ' + plurale(altre, 'altra', 'altre') : ''),
        quanto: conta, unita: 'voci', collegamento, oggetto: 'gruppo:' + f + ':' + sezione, famiglia: f, area: voci[0].area,
        nascondibile: voci.every(v => v.nascondibile), sezione, n: voci[0].n, oggetti: [].concat(...voci.map(v => v.oggetti || [v.oggetto])),
      };
      out = out.filter(v => voci.indexOf(v) < 0);
      out.push(gruppo);
    }
    return out;
  },

  /**
   * Rapportini e spese, ferie e documenti da approvare: una voce sola con le sue tre righe (§8.2, 5).
   * 07/11/2026 (Ore tolte): la prima parte erano "ore e spese" in "Ore e rapportini › Da approvare"; ora le ore registrate
   * non si approvano piu' da qui, e la riga si chiama "Rapportini › Da approvare".
   */
  unaVoceDaApprovare(tutte) {
    const lavori = tutte.filter(v => v.tipo === 'approvare');
    const ferie = tutte.filter(v => v.tipo === 'assenza' && / da approvare/.test(v.titolo));
    const doc = tutte.filter(v => v.tipo === 'documento' && /da approvare$/.test(v.titolo) && !/aspetta/.test(v.titolo));
    if (!lavori.length && !ferie.length && !doc.length) return tutte;
    const n = l => l.reduce((t, v) => t + (v.unita === 'voci' || v.unita === 'documenti' ? Number(v.quanto) || 1 : 1), 0);
    const quantiLavori = n(lavori);
    const quanteFerie = n(ferie);
    const quantiDoc = n(doc);
    const totale = quantiLavori + quanteFerie + quantiDoc;
    const pezzi = [];
    if (quantiLavori) pezzi.push(quantiLavori + ' rapportini e spese' + (lavori.length === 1 && / di /.test(lavori[0].titolo) ? ' di ' + lavori[0].titolo.split(' di ').pop() : ''));
    if (quanteFerie) pezzi.push(plurale(quanteFerie, 'ferie', 'ferie'));
    if (quantiDoc) pezzi.push(plurale(quantiDoc, 'documento', 'documenti'));
    const voce = {
      tipo: 'approvare', gravita: 'attenzione', titolo: plurale(totale, 'cosa da approvare', 'cose da approvare'), dettaglio: pezzi.join(', '),
      quanto: totale, unita: 'voci', collegamento: { pagina: 'approvare' }, oggetto: 'approvare', area: 'lavoro', nascondibile: false, sezione: 'urgenti', n: -1,
      righe: [
        { nome: 'Rapportini › Da approvare', numero: quantiLavori, collegamento: { pagina: 'rapportini', filtro: { segmento: 'daApprovare' } } },
        { nome: 'Persone › Ferie da approvare', numero: quanteFerie, collegamento: { pagina: 'persone', filtro: { segmento: 'ferie', daApprovare: true } } },
        { nome: 'Documenti › Da approvare', numero: quantiDoc, collegamento: { pagina: 'documenti', filtro: { segmento: 'approvare' } } },
      ].filter(r => r.numero),
    };
    const via = new Set(lavori.concat(ferie, doc));
    return tutte.filter(v => !via.has(v)).concat([voce]);
  },

  // ------------------------------------------------------------------ i riquadri (§8.4)

  /** I riquadri che chi lavora puo' vedere, coi numeri di adesso. */
  riquadriVisibili(risposta) {
    const nr = (risposta && risposta.numeri) || {};
    const s = nr.soldi || {};
    const soldiFatture = this.vedeCosti() && this.livello('fatturazione') >= 1 && s.daIncassare !== undefined;
    const io = this.chi().utente ? this.chi().utente.id : null;
    const spenti = new Set(this.moduliSpenti());
    const v = {};
    if (this.livello('commesse') >= 1 && nr.commesse) {
      v.commesseAperte = { numero: nr.commesse.aperte, unita: 'commesse', collegamento: { pagina: 'commesse', filtro: { stato: 'APERTA' } } };
      v.commesseInRitardo = { numero: nr.commesse.inRitardo, unita: 'commesse', rosso: nr.commesse.inRitardo > 0, collegamento: { pagina: 'commesse', filtro: { inRitardo: true } } };
    }
    if (this.vedeCosti() && this.livello('fatturazione') >= 1 && s.daFatturare !== undefined) v.daFatturare = { numero: s.daFatturare, unita: 'euro', collegamento: { pagina: 'fatturazione' } };
    if (soldiFatture) {
      v.daIncassare = { numero: s.daIncassare, unita: 'euro', collegamento: { pagina: 'fatture', filtro: { stato: 'emessa' } } };
      v.scaduto = { numero: s.scaduto || 0, unita: 'euro', rosso: (s.scaduto || 0) > 0, collegamento: { pagina: 'fatture', filtro: { scadute: true } } };
    }
    if (this.vedeCosti() && this.livello('banche') >= 1 && !spenti.has('banche') && s.saldoConti !== undefined) v.nelConto = { numero: s.saldoConti, unita: 'euro', collegamento: { pagina: 'conti' } };
    if (this.livello('ticket') >= 1 && nr.ticket) {
      v.ticketAperti = { numero: nr.ticket.aperti, unita: 'ticket', collegamento: { pagina: 'tickets', filtro: { segmento: 'aperti' } } };
      v.interventiOggi = { numero: nr.ticket.interventiOggi, unita: 'interventi', collegamento: { pagina: 'calendario', filtro: { giorno: oggi() } } };
      if (io) v.mieiTicket = { numero: this.db.riga("SELECT COUNT(*) n FROM ticket WHERE responsabile_id = ? AND stato IN ('aperto', 'in_carico', 'in_attesa')", io).n, unita: 'ticket',
        collegamento: { pagina: 'tickets', filtro: { segmento: 'miei' } } };
    }
    if (nr.scadenze) v.scadenzeVicine = { numero: nr.scadenze.vicine, unita: 'scadenze', collegamento: { pagina: 'documenti', filtro: { segmento: 'scadenze' } } };
    if (this.livello('persone') >= 1 && nr.persone) v.assentiOggi = { numero: nr.persone.assentiOggi || 0, unita: 'persone', collegamento: { pagina: 'persone', filtro: { segmento: 'presenze' } } };
    const approva = this.puoApprovare('rapportini') || this.puoApprovare('spese') || this.puoApprovareAssenze() || (this.puoApprovareDocumenti() && this.livello('documenti') >= 2);
    if (approva && !this.soloSuoi()) {
      const n = ((nr.approvare && nr.approvare.voci) || 0) + ((nr.persone && nr.persone.daApprovare) || 0) + ((nr.documenti && nr.documenti.daApprovare) || 0);
      v.daApprovare = { numero: n, unita: 'voci', collegamento: { pagina: 'approvare' } };
    }
    if (this.livello('mezzi') >= 1 && !spenti.has('mezzi') && nr.mezzi) v.tarateScadute = { numero: nr.mezzi.tarateScadute, unita: 'strumenti', rosso: nr.mezzi.tarateScadute > 0, collegamento: { pagina: 'mezzi', filtro: { segmento: 'strumenti', taratura: 'scaduta' } } };
    if (this.livello('portale') >= 1 && !spenti.has('portale') && nr.portale) v.dalPortale = { numero: nr.portale.daGuardare, unita: 'cose', collegamento: { pagina: 'portale', filtro: { segmento: 'daguardare' } } };
    if (this.livello('comunicazioni') >= 1 && !spenti.has('comunicazioni') && nr.comunicazioni) v.daMandareOggi = { numero: nr.comunicazioni.daMandareOggi, unita: 'messaggi', collegamento: { pagina: 'comunicazioni', filtro: { segmento: 'damandare' } } };
    // 07/11/2026 (Ore tolte): le ore della settimana sono quelle dei rapportini (prima le ore registrate), e portano ai Rapportini.
    if (this.livello('rapportini') >= 1) v.oreSettimana = { numero: (nr.rapportini && nr.rapportini.oreSettimana) || 0, unita: 'ore', collegamento: { pagina: 'rapportini' } };
    if (this.livello('attivita') >= 1 && nr.attivita) v.attivitaOggi = { numero: nr.attivita.oggi, unita: 'attività', collegamento: { pagina: 'attivita', filtro: { gruppo: 'oggi' } } };
    if (this.livello('preventivi') >= 1 && nr.preventivi) v.preventiviInAttesa = { numero: nr.preventivi.inviati, unita: 'preventivi', collegamento: { pagina: 'preventivi', filtro: { stato: 'INVIATO' } } };
    return v;
  },

  /** I quattro della persona: quelli scelti che vede ancora, completati con quelli del ruolo e poi con gli altri. */
  riquadriDi(risposta) {
    const vis = this.riquadriVisibili(risposta);
    const c = this.chi();
    const ruolo = c.utente ? c.utente.ruolo : 'titolare';
    let scelti = [];
    if (c.utente) {
      const r = this.db.riga('SELECT riquadri FROM utenti WHERE id = ?', c.utente.id);
      try { scelti = r && r.riquadri ? JSON.parse(r.riquadri) : []; } catch (e) { scelti = []; }
    }
    const lista = [];
    for (const k of scelti.concat(RIQUADRI_DI_BASE[ruolo] || RIQUADRI_DI_BASE.titolare, RIQUADRI.map(x => x[0]))) {
      if (lista.length >= 4) break;
      if (vis[k] && lista.indexOf(k) < 0) lista.push(k);
    }
    const nomi = Object.fromEntries(RIQUADRI);
    return lista.map(k => Object.assign({ chiave: k, nome: nomi[k], rosso: false }, vis[k]));
  },

  /** salvaRiquadri {riquadri: [4 chiavi]}: tra quelli che la persona puo' vedere. */
  salvaRiquadri(d) {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('I riquadri sono di una persona');
    const l = Array.isArray(d.riquadri) ? d.riquadri.map(testo) : [];
    if (l.length !== 4 || new Set(l).size !== 4) throw new Rifiuto('Scegli quattro riquadri');
    const vis = this.riquadriVisibili(this.dashboardGrezza({}));
    for (const k of l) if (!vis[k]) throw new Rifiuto('Questo riquadro non è per il tuo ruolo');
    this.db.esegui('UPDATE utenti SET riquadri = ? WHERE id = ?', JSON.stringify(l), c.utente.id);
    return { ok: true, riquadri: l };
  },

  /** L'elenco di quelli che la persona puo' scegliere (Cambia i riquadri). */
  riquadriDaScegliere(risposta) {
    const vis = this.riquadriVisibili(risposta);
    return RIQUADRI.filter(([k]) => vis[k]).map(([chiave, nome]) => ({ chiave, nome }));
  },

  // ------------------------------------------------------------------ nascondi per 30 giorni (§8.2, 7)

  /** nascondiVoce {oggetto, giorni?: 30}: solo le voci "info" di Da pianificare, per chi le vede. */
  nascondiVoce(d) {
    const c = this.chi();
    if (!c.utente) throw new Rifiuto('Le voci nascoste sono di una persona');
    const oggetto = testo(d.oggetto);
    const giorni = Math.max(1, Math.min(30, Math.round(Number(d.giorni) || 30)));
    const r = this.dashboard({ tutto: true });
    const v = (r.pianificare || []).find(x => x.oggetto === oggetto);
    if (!v || !v.nascondibile) throw new Rifiuto('Questa voce non si può nascondere');
    const fino = istante(new Date(adessoMs() + giorni * 86400000));
    this.db.esegui('INSERT INTO dashboard_nascoste (utente_id, oggetto, tipo, fino, creato) VALUES (?, ?, ?, ?, ?) ON CONFLICT(utente_id, oggetto) DO UPDATE SET fino = excluded.fino, tipo = excluded.tipo',
      c.utente.id, oggetto, v.tipo, fino, adesso());
    return { ok: true, fino: dataOraIso(fino) };
  },

  /** mostraNascoste {}: tornano tutte. */
  mostraNascoste() {
    const c = this.chi();
    if (c.utente) this.db.esegui('DELETE FROM dashboard_nascoste WHERE utente_id = ?', c.utente.id);
    return { ok: true };
  },

  // ------------------------------------------------------------------ i numerini del menu (§8.6)

  /** Il numerino conta le cose che aspettano te (un'azione tua), mai un totale. Le app scrivono "99+" oltre 99. */
  numeriniDelMenu(risposta) {
    const nr = (risposta && risposta.numeri) || {};
    const spenti = new Set(this.moduliSpenti());
    const mie = this.soloSuoi();
    const out = {};
    const metti = (k, n) => { if (n > 0) out[k] = n; };
    if (!mie && this.vedeCosti() && this.livello('fatturazione') >= 1 && nr.soldi) metti('fatturazione', nr.soldi.clientiDaFatturare || 0);
    if (!mie && nr.approvare) metti('rapportini', nr.approvare.voci || 0);
    if (nr.ticket) metti('ticket', (nr.ticket.nonAssegnati || 0) + (mie && this.chi().utente ? this.db.riga("SELECT COUNT(*) n FROM ticket WHERE responsabile_id = ? AND stato IN ('aperto', 'in_carico')", this.chi().utente.id).n : 0));
    if (!mie && nr.documenti && this.puoApprovareDocumenti() && this.livello('documenti') >= 2) metti('documenti', nr.documenti.daApprovare || 0);
    if (!mie && nr.persone) metti('persone', nr.persone.daApprovare || 0);
    if (!spenti.has('mezzi') && nr.mezzi) metti('mezzi', (nr.mezzi.tarateScadute || 0) + (nr.mezzi.fermi || 0) + (nr.mezzi.prestitiInRitardo || 0));
    if (!spenti.has('collaboratori') && nr.collaboratori) metti('collaboratori', nr.collaboratori.nonInRegola || 0);
    if (!spenti.has('comunicazioni') && nr.comunicazioni) metti('comunicazioni', (nr.comunicazioni.daMandareOggi || 0) + (nr.comunicazioni.preparati || 0));
    if (!spenti.has('portale') && nr.portale) metti('portale', nr.portale.daGuardare || 0);
    const ruolo = this.chi().utente ? this.chi().utente.ruolo : 'titolare';
    if (ruolo === 'titolare' || (this.livello('amministrazione') >= 2 && ruolo !== 'lettura')) metti('integrazioni', this.integrazioniInErrore().length);
    return out;
  },
};

/** "0.9.0" contro "0.10.0": -1, 0, 1. */
function confrontaVersioni(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  }
  return 0;
}

/** Una voce come la vedono le app: i campi di sempre e quelli di §13.5 (non quelli di lavoro del passaggio). */
function pulisciVoce(v) {
  const o = Object.assign({}, v);
  delete o.n;
  delete o.sezione;
  o.famiglia = v.famiglia || famigliaDi(v, v.sezione) || '';
  if (o.oggetti === undefined) delete o.oggetti;
  return o;
}

Object.defineProperties(module.exports, {
  ORDINE_TIPI: { value: ORDINE_TIPI },
  RANGO_TIPI: { value: RANGO },
  AREA_TIPI: { value: AREA },
  RIQUADRI: { value: RIQUADRI },
  RIQUADRI_DI_BASE: { value: RIQUADRI_DI_BASE },
  confrontaVersioni: { value: confrontaVersioni },
  TETTI_DASHBOARD: { value: TETTI },
});
