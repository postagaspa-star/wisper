/*
 * Le viste del portale (fase7.md §3.5, §7): ogni risposta e' costruita COPIANDO solo i campi del suo elenco, mai
 * togliendo campi da un oggetto interno. Un campo nuovo in una tabella non arriva al cliente finche' qualcuno non lo
 * aggiunge qui (e a fase7.md §7). Mai costi, margini, note interne, nomi dello studio fuori dal documento consegnato,
 * cronologia interna, bozze, cose di altri clienti.
 *
 * vedibile() e' il punto solo che decide se una cosa si vede (§3.5): pubblicazione aperta, del cliente della sessione
 * (ricontrollato sull'oggetto), stato che si puo' mostrare, permesso del referente per quel tipo, sede tra le sue.
 * Tutto il resto risponde 404, uguale a una cosa che non esiste.
 */
'use strict';

const { testo, numero, centesimi, oggi, piuGiorni, dataIso, dataOraIso, adessoMs } = require('../utili');
const C = require('../conti');
const K = require('../comunicazioni');
const F = require('./file');

const PERMESSO_DI = { preventivo: 'preventivi', contratto: 'preventivi', rapportino: 'rapportini', fattura: 'fatture', documento: 'documenti', ticket: 'richieste' };
const STATI_RICHIESTA = { aperto: 'Ricevuta', in_carico: 'Presa in carico', in_attesa: 'In attesa', risolto: 'Risolta', chiuso: 'Chiusa', annullato: 'Annullata' };
const ORIGINI = { telefono: 'Telefono', email: 'Email', sopralluogo: 'Sopralluogo', ufficio: 'Ufficio', scadenza: 'Da una scadenza', portale: 'Portale', whatsapp: 'Telefono' };
const FERMO = { fermo: 'Sì, è fermo', ridotto: 'Va a metà', nessuno: 'Funziona' };
const QUANDO = { subito: 'Subito', presto: 'Entro domani', quando_si_puo: 'Quando si può' };
const euro = n => C.euroIt(n) + ' €';
/** Le frasi del registro degli accessi per il cliente (Il mio accesso). */
const FRASI = {
  link_chiesto: 'Ha chiesto un link', entrato: 'Entrato', codice_sbagliato: 'Codice sbagliato', link_scaduto: 'Link scaduto', bloccato: 'Bloccato dai limiti',
  visto: 'Ha visto', scaricato: 'Ha scaricato', accettato: 'Ha accettato', rifiutato: 'Non ha accettato', domanda: 'Ha fatto una domanda su', firmato: 'Ha firmato',
  segnalato: 'Ha segnalato un problema su', caricato: 'Ha mandato', richiesta: 'Ha aperto', messaggio: 'Ha scritto un messaggio su',
  uscito: 'Uscito', scaduta: 'Sessione scaduta', negato: 'Accesso negato', azienda: 'Ha cambiato azienda',
};

/** La riga del preventivo, coi conti (sezioni, voci, scadenze) fatti da contiPreventivo della fase 2. */
function contenuto(w, r, scelte) {
  const c = w.contenutiDi([r.id])[r.id] || { sezioni: [], scadenze: [] };
  if (scelte) {
    c.sezioni = c.sezioni.map(s => Object.assign({}, s, { voci: s.voci.map(v => ((v.facoltativa || v.alternativa) && scelte[v.id] !== undefined ? Object.assign({}, v, { scelta: !!scelte[v.id] }) : v)) }));
  }
  return w.contenutoPreventivo(r, c);
}

// ------------------------------------------------------------------ vedibile (§3.5)

/**
 * La pubblicazione idP si vede in questa sessione? Torna {p, info} o null. tipi: i tipi che la strada accetta
 * (un id di preventivo chiesto come rapportino e' un 404).
 */
function vedibile(ctx, idP, tipi) {
  const id = Number(idP);
  if (!(id > 0) || !/^\d{1,10}$/.test(String(idP))) return null;
  const p = ctx.w.db.riga('SELECT * FROM portale_pubblicazioni WHERE id = ?', id);
  if (!p || p.tolta_il || p.soggetto_id !== ctx.sog.id) return null;
  if (tipi && tipi.indexOf(p.tipo) < 0) return null;
  if ((ctx.perm[PERMESSO_DI[p.tipo]] || 0) < 1) return null;
  const info = ctx.w.infoOggetto(p.tipo, p.rif, p.da_firmare === 1);
  if (!info.mostrabile) return null;
  // Il cliente si ricontrolla sull'oggetto, non ci si fida della pubblicazione.
  if (p.tipo === 'documento') { if (info.clienti.length && info.clienti.some(c => c !== ctx.sog.id)) return null; }
  else if (info.soggettoId !== ctx.sog.id) return null;
  const sede = info.sedeId || p.sede_id || null;
  if (ctx.sedi && sede && ctx.sedi.indexOf(Number(sede)) < 0) return null;
  return { p, info };
}

/** Tutte le pubblicazioni di questi tipi che si vedono in questa sessione (le piu' recenti prima). */
function vedibili(ctx, tipi) {
  return ctx.w.db.righe('SELECT id FROM portale_pubblicazioni WHERE soggetto_id = ? AND tolta_il IS NULL AND tipo IN (' + tipi.map(() => '?').join(',') + ') ORDER BY pubblicata_il DESC, id DESC',
    ctx.sog.id, ...tipi).map(r => vedibile(ctx, r.id, tipi)).filter(Boolean);
}

/** Visto da questo referente? (il registro degli accessi del portale: azione visto con l'oggetto "tipo:id"). */
function vistoDa(ctx, p) {
  return !!ctx.w.db.riga("SELECT id FROM portale_accessi WHERE referente_id = ? AND azione = 'visto' AND oggetto = ? LIMIT 1", ctx.ref.id, p.tipo + ':' + p.id);
}

/** La chiave di un file mostrato (§7.8). */
function chiaveDi(ctx, idFile, idP) {
  return F.chiave(ctx.w.portaleSegreto(), ctx.s.id, idFile, idP, 600);
}

// ------------------------------------------------------------------ io, casa (§7.2)

function studio(imp) {
  return { nome: imp.studio.nome, telefono: imp.studio.telefono, email: imp.studio.email, indirizzo: imp.studio.indirizzo, partitaIva: imp.studio.partitaIva };
}

/** L'informativa completa coi dati dello studio (e il cliente, se c'e'). */
function testoInformativa(imp, cliente) {
  return K.riempi(imp.informativa, { studio: imp.studio.nome, indirizzo: imp.studio.indirizzo, partita_iva: imp.studio.partitaIva, cliente: cliente || 'il cliente',
    email_studio: imp.studio.email, portale: 'x' }).testo;
}

function io(ctx) {
  const w = ctx.w;
  const imp = ctx.imp;
  const tutte = ctx.aziende;
  const sedi = w.db.righe('SELECT * FROM sedi WHERE soggetto_id = ? AND archiviata = 0 ORDER BY id', ctx.sog.id)
    .filter(x => !ctx.sedi || ctx.sedi.indexOf(x.id) >= 0).map(x => ({ id: x.id, nome: x.nome, tipo: x.tipo }));
  const ultimoMs = Date.parse(ctx.s.ultimo_uso);
  return {
    ok: true, stato: 200,
    studio: studio(imp),
    referente: { nome: ctx.ref.nome, email: ctx.ref.email, avvisiEmail: ctx.ref.avvisi_email === 1 },
    azienda: ctx.sog.nome,
    aziende: tutte.filter(a => a.idReferente !== ctx.ref.id).map(a => ({ n: a.n, azienda: a.azienda })),
    puo: { preventivi: ctx.perm.preventivi, rapportini: ctx.perm.rapportini, fatture: ctx.perm.fatture, documenti: ctx.perm.documenti, richieste: ctx.perm.richieste },
    sedi,
    informativa: { daLeggere: ctx.ref.informativa_versione !== imp.informativaData, data: imp.informativaData, testo: testoInformativa(imp, ctx.sog.nome) },
    sessione: {
      scadeSenzaUso: dataOraIso(new Date(ultimoMs + imp.sessioneMinuti * 60000)), scadeComunque: dataOraIso(ctx.s.scade_il), anteprima: !!ctx.s.anteprima_utente_id,
    },
    tipiFile: imp.tipiFile.slice(), fileMaxMb: imp.fileMaxMb,
  };
}

function casa(ctx) {
  const w = ctx.w;
  const daFare = [];
  const novita = [];
  const trentaGiorni = new Date(adessoMs() - 30 * 86400000).toISOString();
  const tutte = vedibili(ctx, ['preventivo', 'contratto', 'rapportino', 'fattura', 'documento', 'ticket']);
  for (const x of tutte) {
    const p = x.p;
    if (p.tipo === 'preventivo' && ctx.perm.preventivi >= 2) {
      const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(p.rif));
      if (statoPreventivo(r) === 'da_accettare') daFare.push({ tipo: 'preventivo', id: p.id, titolo: 'Preventivo ' + x.info.etichetta, dettaglio: 'Da accettare · scade il ' + K.dataIt(r.scadenza) });
    }
    if (p.tipo === 'rapportino' && p.da_firmare === 1 && ctx.perm.rapportini >= 2) {
      const r = w.db.riga('SELECT * FROM rapportini WHERE id = ?', p.rif);
      if (r && (testo(r.stato).toUpperCase() || 'BOZZA') === 'BOZZA') daFare.push({ tipo: 'rapportino', id: p.id, titolo: x.info.titolo, dettaglio: 'Da firmare' + (luogoRapportino(w, r, x.info) ? ' · ' + luogoRapportino(w, r, x.info) : '') });
    }
  }
  for (const x of tutte) {
    const p = x.p;
    const quando = p.tipo === 'ticket' && p.avviso_da ? p.avviso_da : p.pubblicata_il;
    if (new Date(quando).toISOString() < trentaGiorni) continue;
    if (p.tipo !== 'ticket' && vistoDa(ctx, p)) continue;
    if (p.tipo === 'ticket') {
      const t = w.db.riga('SELECT * FROM ticket WHERE id = ?', Number(p.rif));
      const st = statoRichiesta(w, t);
      novita.push({ tipo: 'richiesta', id: p.id, titolo: 'Richiesta ' + t.numero, dettaglio: st.statoVisto + (st.dettaglio ? ' · ' + st.dettaglio : ''), quando: dataOraIso(quando) });
    } else {
      const dett = p.tipo === 'documento' ? (w.db.riga('SELECT c.nome FROM documenti d JOIN documento_categorie c ON c.id = d.categoria_id WHERE d.id = ?', Number(p.rif)) || {}).nome || ''
        : p.tipo === 'preventivo' ? 'Preventivo' : p.tipo === 'fattura' ? 'Fattura' : p.tipo === 'contratto' ? 'Contratto' : 'Rapportino';
      novita.push({ tipo: p.tipo, id: p.id, titolo: x.info.titolo, dettaglio: dett, quando: dataOraIso(quando) });
    }
  }
  novita.sort((a, b) => (a.quando < b.quando ? 1 : -1));
  const conta = tipi => tutte.filter(x => tipi.indexOf(x.p.tipo) >= 0).length;
  return {
    ok: true, stato: 200, daFare, novita: novita.slice(0, 10),
    conteggi: { preventivi: conta(['preventivo']), rapportini: conta(['rapportino']), documenti: conta(['documento']), fatture: conta(['fattura']), richieste: conta(['ticket']) },
  };
}

// ------------------------------------------------------------------ preventivi e contratti (§7.3)

function statoPreventivo(r) {
  if (r.stato === 'ACCETTATO') return 'accettato';
  if (r.stato === 'RIFIUTATO') return 'rifiutato';
  return r.scadenza && r.scadenza < oggi() ? 'scaduto' : 'da_accettare';
}
const STATI_PREV = { da_accettare: 'Da accettare', scaduto: 'Scaduto', accettato: 'Accettato', rifiutato: 'Non accettato' };
const etichetta = r => r.numero + (r.revisione ? ' rev. ' + r.revisione : '');

function elencoPreventivi(ctx) {
  const w = ctx.w;
  const preventivi = vedibili(ctx, ['preventivo']).map(x => {
    const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(x.p.rif));
    const st = statoPreventivo(r);
    return { id: x.p.id, etichetta: etichetta(r), oggetto: r.oggetto, data: r.data, scadenza: r.scadenza, stato: st, statoVisto: STATI_PREV[st],
      totale: contenuto(w, r).conti.totale, nuovo: !vistoDa(ctx, x.p) };
  });
  const contratti = vedibili(ctx, ['contratto']).map(x => {
    const c = w.db.riga('SELECT * FROM contratti WHERE id = ?', Number(x.p.rif));
    return { id: x.p.id, numero: c.numero, titolo: c.titolo, dal: c.dal, al: c.al, statoVisto: c.stato === 'disdetto' ? 'Disdetto' : c.stato === 'chiuso' ? 'Chiuso' : 'Attivo' };
  });
  return { ok: true, stato: 200, preventivi, contratti };
}

/** I conti come li vede il cliente (le chiavi di §7.3). */
function contiPortale(c) {
  return { sommaVoci: c.sommaVoci, scontoDaPercentuale: c.scontoDaPercentuale, scontoEuro: c.scontoEuro, imponibile: c.imponibile, eppiPercentuale: c.eppiPercentuale,
    contributo: c.contributo, baseIva: c.baseIva, ivaPercentuale: c.ivaPercentuale, iva: c.iva, totale: c.totale };
}

function preventivo(ctx, x, scelte) {
  const w = ctx.w;
  const r = w.db.riga('SELECT * FROM preventivi WHERE id = ?', Number(x.p.rif));
  const cont = contenuto(w, r, scelte);
  const st = statoPreventivo(r);
  const imp = ctx.imp.imp;
  const polizza = [testo(imp.POLIZZA_COMPAGNIA), testo(imp.POLIZZA_NUMERO) ? 'polizza ' + testo(imp.POLIZZA_NUMERO) : '', testo(imp.POLIZZA_MASSIMALE) ? 'massimale ' + testo(imp.POLIZZA_MASSIMALE) : ''].filter(Boolean).join(' · ');
  let accettazione = null;
  if (r.stato === 'ACCETTATO') {
    accettazione = { il: dataOraIso(r.accettato_il), da: r.accettato_da, modo: r.accettazione_modo };
    if (r.firma_file_id) accettazione.firma = { chiave: chiaveDi(ctx, r.firma_file_id, x.p.id) };
  }
  const file = x.p.file_id ? w.db.riga('SELECT id, nome FROM file WHERE id = ? AND cestinato IS NULL', x.p.file_id) : null;
  return {
    id: x.p.id, etichetta: etichetta(r), numero: r.numero, revisione: r.revisione, oggetto: r.oggetto, data: r.data, scadenza: r.scadenza,
    stato: st, statoVisto: STATI_PREV[st], versione: dataOraIso(r.modificato), introduzione: r.introduzione, complessita: r.complessita,
    oneriPrevisti: r.oneri_previsti, condizioni: r.condizioni,
    studio: { titoli: testo(imp.TITOLI), polizza },
    sezioni: cont.sezioni.map(s => ({
      titolo: s.titolo, subtotale: s.subtotale,
      voci: s.voci.map(v => ({ id: v.id, descrizione: v.descrizione, modo: v.modo, quantita: v.quantita, unita: v.unita, prezzo: v.prezzo, scontoPercentuale: v.scontoPercentuale,
        importo: v.importo, facoltativa: v.facoltativa, alternativa: v.alternativa, scelta: v.scelta })),
    })),
    scontoPercentuale: numero(r.sconto_percentuale), scontoEuro: numero(r.sconto_euro),
    conti: contiPortale(cont.conti),
    scadenzePagamento: cont.scadenze.map(s => ({ descrizione: s.descrizione, importo: s.importo })),
    accettazione,
    puoAccettare: st === 'da_accettare' && ctx.perm.preventivi >= 2 && !ctx.s.anteprima_utente_id,
    pdf: file ? { chiave: chiaveDi(ctx, file.id, x.p.id), nome: file.nome } : null,
  };
}

/**
 * L'impronta del preventivo come l'ha visto (§3.8): SHA-256 del JSON ordinato di voci, scelte, conti, condizioni e
 * scadenze. Sta nella prova dell'accettazione.
 */
function improntaPreventivo(ctx, x, scelte) {
  const v = preventivo(ctx, x, scelte);
  const ordina = o => (Array.isArray(o) ? o.map(ordina) : o && typeof o === 'object' ? Object.keys(o).sort().reduce((a, k) => { a[k] = ordina(o[k]); return a; }, {}) : o);
  const dentro = { numero: v.numero, revisione: v.revisione, oggetto: v.oggetto, sezioni: v.sezioni, conti: v.conti, condizioni: v.condizioni, oneriPrevisti: v.oneriPrevisti,
    complessita: v.complessita, scadenzePagamento: v.scadenzePagamento, scadenza: v.scadenza, versione: v.versione };
  return require('node:crypto').createHash('sha256').update(JSON.stringify(ordina(dentro))).digest('hex');
}

// ------------------------------------------------------------------ rapportini (§7.4)

function luogoRapportino(w, r, info) {
  if (testo(r.luogo)) return testo(r.luogo);
  const sede = info && info.sedeId ? w.db.riga('SELECT nome FROM sedi WHERE id = ?', info.sedeId) : null;
  return sede ? sede.nome : '';
}

function statoVistoRapportino(r, p) {
  const st = testo(r.stato).toUpperCase() || 'BOZZA';
  return st === 'BOZZA' && p.da_firmare === 1 ? 'Da firmare' : 'Firmato';
}

function elencoRapportini(ctx) {
  const w = ctx.w;
  const righe = vedibili(ctx, ['rapportino']).map(x => {
    const r = w.db.riga('SELECT * FROM rapportini WHERE id = ?', x.p.rif);
    const sv = statoVistoRapportino(r, x.p);
    return { id: x.p.id, numero: r.id, data: dataIso(r.data), luogo: luogoRapportino(w, r, x.info), lavoro: testo(r.descrizione), statoVisto: sv, daFirmare: sv === 'Da firmare', nuovo: !vistoDa(ctx, x.p) };
  });
  righe.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  return { ok: true, stato: 200, rapportini: righe };
}

function rapportino(ctx, x) {
  const w = ctx.w;
  const r = w.db.riga('SELECT * FROM rapportini WHERE id = ?', x.p.rif);
  const sv = statoVistoRapportino(r, x.p);
  const tk = r.ticket_id ? w.db.riga('SELECT numero FROM ticket WHERE id = ?', r.ticket_id) : null;
  const m = r.id_commessa ? w.db.riga('SELECT id, descrizione FROM commesse WHERE id = ?', r.id_commessa) : null;
  let importi = null;
  if (ctx.sog.portale_importi === 1) {
    const speseCliente = numero(r.spese);
    importi = { tariffa: numero(r.tariffa), compensoOre: numero(r.compenso_ore), km: numero(r.km), euroKm: numero(r.euro_km), rimborsoKm: numero(r.rimborso_km),
      spese: speseCliente, totale: numero(r.totale) };
  }
  const firmato = sv === 'Firmato' && testo(r.firma);
  return {
    id: x.p.id, numero: r.id, data: dataIso(r.data), luogo: luogoRapportino(w, r, x.info), commessa: m ? m.id + (m.descrizione ? ' · ' + m.descrizione : '') : '',
    tecnico: testo(r.tecnico), lavoro: testo(r.descrizione), oreLavoro: numero(r.ore_lavoro), oreExtra: numero(r.ore_extra), oreViaggio: numero(r.ore_viaggio),
    km: numero(r.km), ticket: tk ? tk.numero : '', statoVisto: sv, daFirmare: sv === 'Da firmare', versione: dataOraIso(r.modificato),
    firma: firmato ? { chiave: chiaveDi(ctx, r.firma, x.p.id) } : null, firmatario: firmato ? testo(r.firmatario) : '', firmatoIl: firmato ? dataOraIso(r.firmato_il) : '',
    firmaModo: firmato ? (r.firma_modo || '') : '', importi, puoFirmare: sv === 'Da firmare' && ctx.perm.rapportini >= 2 && !ctx.s.anteprima_utente_id,
  };
}

// ------------------------------------------------------------------ documenti e file mandati (§7.5)

const STATI_TUOI = { da_guardare: 'Ricevuto', accettato: 'Accettato', rifiutato: 'Non accettato' };

function elencoDocumenti(ctx) {
  const w = ctx.w;
  const documenti = vedibili(ctx, ['documento']).map(x => {
    const d = w.db.riga('SELECT * FROM documenti WHERE id = ?', Number(x.p.rif));
    const v = d.versione_valida_id ? w.db.riga('SELECT * FROM documento_versioni WHERE id = ?', d.versione_valida_id) : null;
    const cat = w.db.riga('SELECT nome FROM documento_categorie WHERE id = ?', d.categoria_id);
    const sede = d.sede_id ? w.db.riga('SELECT nome FROM sedi WHERE id = ?', d.sede_id) : null;
    return { id: x.p.id, titolo: d.titolo, categoria: cat ? cat.nome : '', data: d.data_documento, revisione: v ? 'rev. ' + v.numero : '', nomeFile: v ? v.nome_file : '',
      byte: v ? v.byte : 0, luogo: sede ? sede.nome : '', nuovo: !vistoDa(ctx, x.p), file: v ? { chiave: chiaveDi(ctx, v.file_id, x.p.id) } : null };
  });
  const tuoi = ctx.perm.documenti >= 1 ? w.db.righe("SELECT * FROM portale_caricamenti WHERE soggetto_id = ? AND per = 'documento' AND stato <> 'caricato' ORDER BY creato DESC, id DESC LIMIT 100", ctx.sog.id)
    .map(tuo) : [];
  return { ok: true, stato: 200, documenti, tuoi };
}

function tuo(c) {
  return { id: c.id, titolo: c.titolo, nomeFile: c.nome_originale, byte: c.byte, inviatoIl: dataOraIso(c.creato), statoVisto: STATI_TUOI[c.stato] || 'Ricevuto', motivo: c.stato === 'rifiutato' ? c.motivo : '' };
}

// ------------------------------------------------------------------ fatture (§7.6)

function statoFattura(w, f, aiuti) {
  if (f.tipo === 'nota') return { statoVisto: 'Nota di credito', dettaglio: '', daPagare: 0, p: null };
  if (f.stato === 'annullata') return { statoVisto: 'Annullata', dettaglio: '', daPagare: 0, p: null };
  const p = w.pagamentoDi(f, aiuti);
  if (p.residuo <= 0) return { statoVisto: 'Pagata', dettaglio: '', daPagare: 0, p };
  if (p.incassato > 0) return { statoVisto: 'Pagata in parte', dettaglio: 'restano ' + euro(p.residuo), daPagare: p.residuo, p };
  if (p.scaduta) return { statoVisto: 'Scadenza passata', dettaglio: 'il ' + K.dataIt(p.primaScoperta), daPagare: p.residuo, p };
  return { statoVisto: 'Da pagare', dettaglio: p.primaScoperta ? 'entro il ' + K.dataIt(p.primaScoperta) : '', daPagare: p.residuo, p };
}

function elencoFatture(ctx) {
  const w = ctx.w;
  return {
    ok: true, stato: 200,
    fatture: vedibili(ctx, ['fattura']).map(x => {
      const f = w.db.riga('SELECT * FROM fatture WHERE id = ?', Number(x.p.rif));
      const st = statoFattura(w, f);
      return { id: x.p.id, numero: f.numero || f.riferimento, tipo: f.tipo === 'nota' ? 'Nota di credito' : 'Fattura', data: f.data, totale: numero(f.totale), daPagare: st.daPagare,
        statoVisto: st.statoVisto, dettaglioStato: st.dettaglio, nuovo: !vistoDa(ctx, x.p) };
    }),
  };
}

function fattura(ctx, x) {
  const w = ctx.w;
  const f = w.db.riga('SELECT * FROM fatture WHERE id = ?', Number(x.p.rif));
  const aiuti = w.aiutiFatture([f]);
  const st = statoFattura(w, f, aiuti);
  const righe = w.righeVisibili(f.id);
  const scad = aiuti.scadenze[f.id] || [];
  const cop = st.p ? st.p.coperture : scad.map(() => 0);
  let pagamento = null;
  const conto = f.conto_id ? w.db.riga('SELECT * FROM conti WHERE id = ?', f.conto_id) : null;
  if (st.daPagare > 0 && conto && testo(conto.iban)) {
    pagamento = { iban: testo(conto.iban).replace(/\s/g, ''), intestatario: ctx.imp.studio.nome, causale: 'Fattura ' + (f.numero || f.riferimento) };
  }
  const xmlFile = f.file_id ? w.db.riga('SELECT id, nome FROM file WHERE id = ? AND cestinato IS NULL', f.file_id) : null;
  const copiaId = f.copia_file_id || x.p.file_id;
  const copia = copiaId ? w.db.riga('SELECT id, nome FROM file WHERE id = ? AND cestinato IS NULL', copiaId) : null;
  return {
    id: x.p.id, numero: f.numero || f.riferimento, tipo: f.tipo === 'nota' ? 'Nota di credito' : 'Fattura', data: f.data, causale: f.causale,
    righe: righe.map(r => ({ descrizione: r.descrizione, quantita: r.quantita, importo: r.importo })),
    conti: { compenso: numero(f.compenso), contributo: numero(f.contributo), iva: numero(f.iva), anticipazioni: numero(f.anticipazioni), bollo: numero(f.bollo),
      totale: numero(f.totale), ritenuta: numero(f.ritenuta), netto: numero(f.netto) },
    scadenze: scad.map((s, i) => ({ data: s.data, importo: numero(s.importo), pagata: centesimi(cop[i] || 0) >= centesimi(numero(s.importo)) })),
    daPagare: st.daPagare, statoVisto: st.statoVisto, dettaglioStato: st.dettaglio, pagamento,
    xml: xmlFile ? { chiave: chiaveDi(ctx, xmlFile.id, x.p.id), nome: f.nome_file_sdi || xmlFile.nome } : null,
    copia: copia ? { chiave: chiaveDi(ctx, copia.id, x.p.id), nome: copia.nome } : null,
  };
}

// ------------------------------------------------------------------ richieste (§7.7)

/** Lo stato con le parole del cliente: in carico con un intervento in calendario e' "Intervento fissato". */
function statoRichiesta(w, t) {
  let statoVisto = STATI_RICHIESTA[t.stato] || 'Ricevuta';
  let dettaglio = '';
  if (t.stato === 'in_carico') {
    const a = w.db.riga("SELECT inizio FROM attivita WHERE ticket_id = ? AND stato NOT IN ('fatta', 'annullata') AND inizio <> '' ORDER BY inizio LIMIT 1", t.id);
    if (a) {
      statoVisto = 'Intervento fissato';
      dettaglio = K.giornoLungo(dataIso(a.inizio)) + ' alle ' + K.oraBreve(dataOraIso(a.inizio));
    }
  }
  return { statoVisto, dettaglio };
}

function luogoTicket(w, t) {
  const s = t.sede_id ? w.db.riga('SELECT nome FROM sedi WHERE id = ?', t.sede_id) : null;
  return s ? s.nome : '';
}

function elencoRichieste(ctx) {
  const w = ctx.w;
  return {
    ok: true, stato: 200,
    richieste: vedibili(ctx, ['ticket']).map(x => {
      const t = w.db.riga('SELECT * FROM ticket WHERE id = ?', Number(x.p.rif));
      const st = statoRichiesta(w, t);
      return { id: x.p.id, numero: t.numero, titolo: t.titolo, luogo: luogoTicket(w, t), apertaIl: dataOraIso(t.aperto_il), statoVisto: st.statoVisto, dettaglioStato: st.dettaglio,
        nuovo: !vistoDa(ctx, x.p) };
    }),
  };
}

function richiesta(ctx, x) {
  const w = ctx.w;
  const t = w.db.riga('SELECT * FROM ticket WHERE id = ?', Number(x.p.rif));
  const st = statoRichiesta(w, t);
  const tempo = [{ quando: dataOraIso(t.aperto_il), testo: 'Ricevuta' }];
  if (t.preso_il) tempo.push({ quando: dataOraIso(t.preso_il), testo: 'Presa in carico' });
  for (const a of w.db.righe("SELECT * FROM attivita WHERE ticket_id = ? AND stato <> 'annullata' AND inizio <> '' ORDER BY inizio", t.id)) {
    tempo.push({ quando: dataOraIso(a.creato), testo: 'Intervento fissato per ' + K.giornoLungo(dataIso(a.inizio)) + ' alle ' + K.oraBreve(dataOraIso(a.inizio)) });
  }
  if (t.risolto_il) tempo.push({ quando: dataOraIso(t.risolto_il), testo: 'Risolta' });
  if (t.chiuso_il) tempo.push({ quando: dataOraIso(t.chiuso_il), testo: 'Chiusa' });
  if (t.annullato_il) tempo.push({ quando: dataOraIso(t.annullato_il), testo: 'Annullata' });
  tempo.sort((a, b) => (a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : 0));
  const messaggi = w.db.righe("SELECT * FROM comunicazioni WHERE canale = 'portale' AND pubblica = 1 AND ticket_id = ? ORDER BY quando, id", t.id).map(c => {
    let allegati = [];
    try { allegati = JSON.parse(c.allegati || '[]'); } catch (e) { allegati = []; }
    const ref = c.referente_id ? w.db.riga('SELECT nome FROM referenti WHERE id = ?', c.referente_id) : null;
    return { quando: dataOraIso(c.quando), da: c.direzione === 'uscita' ? 'Studio Tecnico GM' : (ref ? ref.nome : ''), testo: c.testo,
      file: allegati.filter(a => a.id).map(a => ({ nome: a.nome, byte: a.byte, chiave: chiaveDi(ctx, a.id, x.p.id) })) };
  });
  const pubblicati = vedibili(ctx, ['rapportino']).filter(r => {
    const rr = w.db.riga('SELECT ticket_id FROM rapportini WHERE id = ?', r.p.rif);
    return rr && rr.ticket_id === t.id;
  }).map(r => {
    const rr = w.db.riga('SELECT * FROM rapportini WHERE id = ?', r.p.rif);
    return { id: r.p.id, numero: rr.id, data: dataIso(rr.data), statoVisto: statoVistoRapportino(rr, r.p) };
  });
  const o = {
    id: x.p.id, numero: t.numero, titolo: t.titolo, descrizione: t.origine === 'portale' ? t.descrizione : '', luogo: luogoTicket(w, t), apertaIl: dataOraIso(t.aperto_il),
    statoVisto: st.statoVisto, dettaglioStato: st.dettaglio,
    risposte: t.impatto && t.urgenza ? { fermo: FERMO[t.impatto], quando: QUANDO[t.urgenza] } : null,
    rifCliente: t.rif_cliente, apertaDa: ORIGINI[t.origine] || 'Telefono', tempo, messaggi, rapportini: pubblicati,
    puoScrivere: ctx.perm.richieste >= 2 && ['chiuso', 'annullato'].indexOf(t.stato) < 0 && !ctx.s.anteprima_utente_id,
    puoDireNonRisolto: t.stato === 'risolto' && ctx.perm.richieste >= 2 && !ctx.s.anteprima_utente_id,
  };
  return o;
}

// ------------------------------------------------------------------ il mio accesso (§7.9, senza "da": §0.6)

function accessi(ctx) {
  const w = ctx.w;
  const frasi = FRASI;
  return {
    ok: true, stato: 200,
    accessi: w.db.righe('SELECT * FROM portale_accessi WHERE referente_id = ? ORDER BY quando DESC, id DESC LIMIT 20', ctx.ref.id).map(a => {
      let oggetto = '';
      const m = String(a.oggetto || '').match(/^(preventivo|contratto|rapportino|fattura|documento|ticket):(\d+)$/);
      if (m) {
        const p = w.db.riga('SELECT * FROM portale_pubblicazioni WHERE id = ?', Number(m[2]));
        oggetto = p ? w.descrizionePubblicazione(p, true) : '';
      } else oggetto = a.oggetto ? a.oggetto : '';
      const frase = ((frasi[a.azione] || a.azione) + (oggetto ? ' ' + oggetto : '')).replace(/ su il /, ' sul ').replace(/ su la /, ' sulla ');
      return { quando: dataOraIso(a.quando), frase, dispositivo: a.agente };
    }),
  };
}

module.exports = {
  vedibile, vedibili, vistoDa, chiaveDi, studio, testoInformativa, io, casa, statoPreventivo, elencoPreventivi, preventivo, contiPortale, improntaPreventivo,
  contenuto, elencoRapportini, rapportino, elencoDocumenti, tuo, elencoFatture, fattura, statoFattura, elencoRichieste, richiesta, statoRichiesta, accessi,
  PERMESSO_DI, STATI_RICHIESTA,
};
