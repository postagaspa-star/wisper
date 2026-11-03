// Il finto portale: parla il protocollo di docs/gestionale/fase7.md §0.2 come lo script del portale, con i dati di
// esempio di §7 (Rossi Impianti Srl, Sig. Ferretti). Serve SOLO a provare la pagina (portale/) senza il server vero:
// le prove vere si fanno contro `node server/src/avvio.js --prova --porta-portale <n>`.
//
//   node portale/prove/finto-portale.js --porta 8425
//
// Per le prove ha anche qualche strada sua, fuori dal protocollo (GET):
//   /prova/posta              le email finte (codice e link) mandate da "entra" e "link-nuovo"
//   /prova/registro           le richieste arrivate: strada, metodo, id, quante volte è stata fatta davvero
//   /prova/link?tipo=anteprima|avviso&dest=preventivi/12   un link nuovo (come lo manderebbe lo studio)
//   /prova/condiviso          un link condiviso della fase 5
//   /prova/modo?m=normale|spento|attesa|portale-spento     per provare le pagine "non risponde" e "spento"
//   /prova/dati               i dati di adesso (per controllare dopo un'azione)
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const path = require('node:path');
const C = require(path.join(__dirname, '..', '..', 'pc', 'ui', 'conti.js'));

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8425));

// ------------------------------------------------------------------------------------------------- un PNG di firma
function png(larghezza, altezza, disegna) {
  const px = Buffer.alloc(larghezza * altezza * 4, 255);
  const punto = (x, y) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= larghezza || yy >= altezza) continue;
      const i = (yy * larghezza + xx) * 4;
      px[i] = 27; px[i + 1] = 27; px[i + 2] = 31; px[i + 3] = 255;
    }
  };
  disegna(punto);
  const righe = Buffer.alloc((larghezza * 4 + 1) * altezza);
  for (let y = 0; y < altezza; y++) { righe[y * (larghezza * 4 + 1)] = 0; px.copy(righe, y * (larghezza * 4 + 1) + 1, y * larghezza * 4, (y + 1) * larghezza * 4); }
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const pezzo = (tipo, dati) => { const l = Buffer.alloc(4); l.writeUInt32BE(dati.length); const td = Buffer.concat([Buffer.from(tipo), dati]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(larghezza, 0); ihdr.writeUInt32BE(altezza, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pezzo('IHDR', ihdr), pezzo('IDAT', zlib.deflateSync(righe)), pezzo('IEND', Buffer.alloc(0))]);
}
const FIRMA_ESEMPIO = png(600, 220, punto => {
  for (let t = 0; t < 1; t += 0.0008) {
    const x = 60 + t * 470;
    const y = 130 - Math.sin(t * 14) * 38 * (1 - t * 0.6) - t * 20;
    punto(x, y);
  }
});
const PDF_ESEMPIO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

// ------------------------------------------------------------------------------------------------- i dati di esempio
const STUDIO = { nome: 'Studio Tecnico GM', telefono: '0445 000100', email: 'ufficio@studiogm.example', indirizzo: "Via dell'Esempio 1, 36016 Thiene (VI)", partitaIva: '02345678901' };
const FILE = new Map();   // id → {nome, mime, byte(Buffer)}
const nuovoFile = (nome, mime, byte) => { const id = crypto.randomBytes(14).toString('hex'); FILE.set(id, { nome, mime, byte }); return id; };
const FIRMA16 = nuovoFile('firma.png', 'image/png', FIRMA_ESEMPIO);
const PDF12 = nuovoFile('PR-2026-012 rev1 Rossi Impianti Srl.pdf', 'application/pdf', PDF_ESEMPIO);
const PDF9 = nuovoFile('Schema unifilare cabina rev2.pdf', 'application/pdf', PDF_ESEMPIO);
const PDF10 = nuovoFile('Verbale terra 2026.pdf', 'application/pdf', PDF_ESEMPIO);
const XML18 = nuovoFile('IT02345678901_00045.xml.p7m', 'application/pkcs7-mime', Buffer.from('<xml/>'));

const AZIENDE = {
  rossi: { nome: 'Rossi Impianti Srl', sedi: [{ id: 3, nome: 'Capannone di Thiene', tipo: 'sede' }, { id: 4, nome: 'Cabina MT di Zanè', tipo: 'impianto' }] },
  edilnord: { nome: 'Edilnord Srl', sedi: [{ id: 11, nome: 'Cantiere di Bassano', tipo: 'sede' }] },
};
const REFERENTI = [
  { id: 3, azienda: 'rossi', nome: 'Sig. Ferretti', email: 'f.ferretti@rossi.example', avvisiEmail: true, puo: { preventivi: 2, rapportini: 2, fatture: 1, documenti: 2, richieste: 2 }, informativa: false },
  { id: 8, azienda: 'rossi', nome: 'Paolo Consulente', email: 'consulente@esempio.it', avvisiEmail: true, puo: { preventivi: 1, rapportini: 1, fatture: 0, documenti: 1, richieste: 0 }, informativa: true },
  { id: 9, azienda: 'edilnord', nome: 'Paolo Consulente', email: 'consulente@esempio.it', avvisiEmail: true, puo: { preventivi: 1, rapportini: 1, fatture: 0, documenti: 1, richieste: 0 }, informativa: true },
  { id: 10, azienda: 'rossi', nome: 'Anna Rossi', email: 'amministrazione@rossi.example', avvisiEmail: true, puo: { preventivi: 2, rapportini: 2, fatture: 1, documenti: 2, richieste: 2 }, informativa: false, nuovo: true },
];

function datiIniziali() {
  return {
    preventivi: [
      { id: 12, azienda: 'rossi', etichetta: 'PR/2026/012 rev. 1', numero: 'PR/2026/012', revisione: 1, oggetto: 'Adeguamento impianto elettrico capannone', data: '2026-10-15', scadenza: '2026-11-28',
        stato: 'da_accettare', versione: '2026-10-15T10:00:00', nuovo: false, pdf: PDF12,
        introduzione: "Come concordato al sopralluogo, ecco la proposta per l'adeguamento dell'impianto elettrico del capannone.",
        complessita: 'media', oneriPrevisti: 'Pratiche presso il distributore di energia e il Comune, a carico del cliente',
        condizioni: 'Il compenso è quello delle voci, a corpo o a ore come scritto. Sono escluse le spese non elencate. I pagamenti seguono le scadenze indicate.',
        studio: { titoli: "Perito industriale, iscritto all'albo di Vicenza", polizza: 'Compagnia Esempio · polizza 123456 · massimale 1.000.000 €' },
        sezioni: [
          { titolo: 'Progettazione', voci: [
            { id: 11, descrizione: 'Sopralluogo e rilievo', modo: 'corpo', quantita: 1, unita: '', prezzo: 350, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false },
            { id: 12, descrizione: 'Progetto definitivo ed esecutivo', modo: 'corpo', quantita: 1, unita: '', prezzo: 1900, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false }] },
          { titolo: 'Cantiere', voci: [
            { id: 13, descrizione: 'Direzione lavori', modo: 'ore', quantita: 16, unita: 'ore', prezzo: 45, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false },
            { id: 14, descrizione: 'Dichiarazione di rispondenza', modo: 'corpo', quantita: 1, unita: '', prezzo: 450, scontoPercentuale: 0, facoltativa: true, alternativa: '', scelta: false },
            { id: 15, descrizione: 'Collaudo con strumenti propri', modo: 'corpo', quantita: 1, unita: '', prezzo: 380, scontoPercentuale: 0, facoltativa: false, alternativa: 'collaudo', scelta: true },
            { id: 16, descrizione: 'Collaudo con laboratorio esterno', modo: 'corpo', quantita: 1, unita: '', prezzo: 620, scontoPercentuale: 0, facoltativa: false, alternativa: 'collaudo', scelta: false }] }],
        scontoPercentuale: 0, scontoEuro: 0, eppi: 5, iva: 22,
        scadenze: [['30% alla firma', 30], ['40% a fine progetto', 40], ['Saldo a fine lavori', 30]], accettazione: null },
      { id: 7, azienda: 'rossi', etichetta: 'PR/2026/007', numero: 'PR/2026/007', revisione: 0, oggetto: 'Quadro di cantiere', data: '2026-09-06', scadenza: '2026-10-06', stato: 'scaduto',
        versione: '2026-09-06T09:00:00', nuovo: false, pdf: null, introduzione: '', complessita: 'bassa', oneriPrevisti: '', condizioni: 'Il preventivo vale fino alla data di scadenza.',
        studio: { titoli: "Perito industriale, iscritto all'albo di Vicenza", polizza: '' },
        sezioni: [{ titolo: 'Quadro', voci: [{ id: 21, descrizione: 'Quadro di cantiere ASC', modo: 'corpo', quantita: 1, unita: '', prezzo: 1450, scontoPercentuale: 0, facoltativa: false, alternativa: '', scelta: false }] }],
        scontoPercentuale: 0, scontoEuro: 0, eppi: 5, iva: 22, scadenze: [['Alla consegna', 100]], accettazione: null },
    ],
    contratti: [{ id: 8, azienda: 'rossi', numero: 'CA/2026/002', titolo: 'Manutenzione cabina MT di Zanè', dal: '2026-01-01', al: '2026-12-31', statoVisto: 'Attivo' }],
    rapportini: [
      { id: 15, azienda: 'rossi', numero: 'RAP/2026/0153', data: '2026-10-21', luogo: 'Capannone di Thiene', commessa: '26ST046 · Quadri del capannone', tecnico: 'Manuel Gasparotto',
        lavoro: 'Ricerca guasto sul quadro QG2, sostituito il differenziale della linea 4', oreLavoro: 3, oreExtra: 0, oreViaggio: 0.5, km: 24, ticket: 'TK/2026/0016',
        daFirmare: true, versione: '2026-10-21T17:12:00', firma: null, firmatario: '', firmatoIl: '', firmaModo: '', nuovo: true },
      { id: 16, azienda: 'rossi', numero: 'RAP/2026/0142', data: '2026-10-14', luogo: 'Cabina MT di Zanè', commessa: '26ST041 · Assistenza cabina MT', tecnico: 'Manuel Gasparotto',
        lavoro: 'Verifica dei serraggi e pulizia della cabina MT, prova delle protezioni', oreLavoro: 4, oreExtra: 0, oreViaggio: 0.5, km: 32, ticket: '',
        daFirmare: false, versione: '2026-10-14T16:05:00', firma: FIRMA16, firmatario: 'Roberto Ferretti', firmatoIl: '2026-10-14T16:05:00', firmaModo: '', nuovo: false },
    ],
    documenti: [
      { id: 9, azienda: 'rossi', titolo: 'Schema unifilare cabina MT', categoria: 'Progetti e schemi', data: '2026-06-18', revisione: 'rev. 2', nomeFile: 'Schema unifilare cabina rev2.pdf', byte: 1830211, luogo: 'Cabina MT di Zanè', nuovo: true, file: PDF9 },
      { id: 10, azienda: 'rossi', titolo: 'Verbale verifica impianto di terra 2026', categoria: 'Verbali di verifica', data: '2026-03-12', revisione: 'rev. 0', nomeFile: 'Verbale terra 2026.pdf', byte: 612000, luogo: 'Capannone di Thiene', nuovo: false, file: PDF10 },
    ],
    tuoi: [{ id: 31, azienda: 'rossi', titolo: 'Schema quadro QG2', nomeFile: 'Schema quadro QG2.pdf', byte: 1258291, inviatoIl: '2026-10-22T09:20:00', statoVisto: 'Ricevuto', motivo: '' }],
    fatture: [
      { id: 18, azienda: 'rossi', numero: '45/2026', tipo: 'Fattura', data: '2026-10-10', causale: '40% a fine progetto, commessa 26ST003',
        righe: [{ descrizione: '40% a fine progetto: adeguamento impianto elettrico capannone', quantita: 1, importo: 1520 }, { descrizione: 'Pratica di connessione al distributore (spesa anticipata)', quantita: 1, importo: 120 }, { descrizione: 'Imposta di bollo', quantita: 1, importo: 2 }],
        conti: { compenso: 1520, contributo: 76, iva: 351.12, anticipazioni: 120, bollo: 2, totale: 2069.12, ritenuta: 304, netto: 1765.12 },
        scadenze: [{ data: '2026-11-09', importo: 1765.12, pagata: false }], totale: 2069.12, daPagare: 1765.12, statoVisto: 'Da pagare', dettaglioStato: 'entro il 09/11/2026',
        pagamento: { iban: 'IT60X0542811101000000123456', intestatario: 'Studio Tecnico GM', causale: 'Fattura 45/2026' }, xml: XML18, copia: null, nuovo: true },
      { id: 19, azienda: 'rossi', numero: '39/2026', tipo: 'Fattura', data: '2026-09-15', causale: '30% alla firma, commessa 26ST003',
        righe: [{ descrizione: '30% alla firma: adeguamento impianto elettrico capannone', quantita: 1, importo: 810 }],
        conti: { compenso: 810, contributo: 40.5, iva: 187.11, anticipazioni: 0, bollo: 0, totale: 1037.61, ritenuta: 162, netto: 875.61 },
        scadenze: [{ data: '2026-10-15', importo: 875.61, pagata: true }], totale: 1037.61, daPagare: 0, statoVisto: 'Pagata', dettaglioStato: '', pagamento: null, xml: null, copia: null, nuovo: false },
    ],
    richieste: [
      { id: 21, azienda: 'rossi', numero: 'TK/2026/0014', titolo: 'Scatta il generale MT', descrizione: '', luogo: 'Cabina MT di Zanè', apertaIl: '2026-10-20T08:40:00', statoVisto: 'Intervento fissato',
        dettaglioStato: 'giovedì 23 ottobre alle 9:00', risposte: { fermo: 'Sì, è fermo', quando: 'Subito' }, rifCliente: '4471', apertaDa: 'Telefono',
        tempo: [{ quando: '2026-10-20T08:40:00', testo: 'Ricevuta' }, { quando: '2026-10-20T09:05:00', testo: 'Presa in carico' }, { quando: '2026-10-21T16:40:00', testo: 'Intervento fissato per giovedì 23 ottobre alle 9:00' }],
        messaggi: [{ quando: '2026-10-21T16:42:00', da: 'Studio Tecnico GM', testo: 'Veniamo giovedì alle 9 con il misuratore.', file: [] },
          { quando: '2026-10-22T08:15:00', da: 'Sig. Ferretti', testo: 'Va bene, vi aspetta il custode al cancello nord.', file: [] }],
        rapportini: [], puoDireNonRisolto: false, nuovo: false },
      { id: 23, azienda: 'rossi', numero: 'TK/2026/0016', titolo: 'Scatta il differenziale del quadro QG2', descrizione: 'Da stamattina alle 8 scatta ogni dieci minuti, la linea 4 è ferma.',
        luogo: 'Capannone di Thiene', apertaIl: '2026-10-22T09:12:00', statoVisto: 'Risolta', dettaglioStato: '', risposte: { fermo: 'Sì, è fermo', quando: 'Subito' }, rifCliente: '', apertaDa: 'Portale',
        tempo: [{ quando: '2026-10-22T09:12:00', testo: 'Ricevuta' }, { quando: '2026-10-22T09:30:00', testo: 'Presa in carico' }, { quando: '2026-10-22T15:10:00', testo: 'Risolta' }],
        messaggi: [], rapportini: [{ id: 15 }], puoDireNonRisolto: true, nuovo: false },
    ],
    accessi: [],
  };
}
let D = datiIniziali();
let MODO = 'normale';
const POSTA = [];
const REGISTRO = [];
const SESSIONI = new Map();   // token → {referente, anteprima}
const LINK = new Map();       // token → {email, referente, destinazione, usato, tipo, anteprima}
const CODICI = new Map();     // email → {codice, pre, tentativi}
const FATTE = new Map();      // sessione|id → risposta (le POST rifatte con lo stesso id)
const CHIAVI = new Map();     // chiave → {file, sessione}
const CARICAMENTI = new Map();
let prossimo = 100;
const CONDIVISI = new Map();

const token = () => crypto.randomBytes(32).toString('base64url');
const adesso = () => { const d = new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':00'; };
const ref = id => REFERENTI.find(r => r.id === id);
const chiave = (file, sessione) => { const k = crypto.randomBytes(24).toString('base64url') + '.' + crypto.randomBytes(16).toString('base64url'); CHIAVI.set(k, { file, sessione }); return k; };
const no = (stato, errore, altro) => Object.assign({ ok: false, stato, errore }, altro || {});
const si = x => Object.assign({ ok: true, stato: 200 }, x || {});

function contoDi(p, scelte) {
  const voci = C.applicaScelte(p.sezioni.reduce((a, s, i) => a.concat(s.voci.map(v => Object.assign({ idSezione: 's' + i }, v))), []), scelte || {});
  const k = C.contiPreventivo({ sezioni: p.sezioni.map((s, i) => ({ id: 's' + i })), scontoPercentuale: p.scontoPercentuale, scontoEuro: p.scontoEuro, eppiPercentuale: p.eppi, ivaPercentuale: p.iva }, voci);
  return {
    conti: { sommaVoci: k.sommaVoci, scontoDaPercentuale: k.scontoDaPercentuale, scontoEuro: k.scontoEuro, imponibile: k.imponibile, eppiPercentuale: k.eppiPercentuale, contributo: k.contributo,
      baseIva: k.baseIva, ivaPercentuale: k.ivaPercentuale, iva: k.iva, totale: k.totale },
    scadenzePagamento: p.scadenze.map(x => ({ descrizione: x[0], importo: C.centesimi(k.imponibile * x[1] / 100) })),
    voci,
  };
}
function vistaPreventivo(p, s) {
  const k = contoDi(p, null);
  const r = ref(s.referente);
  const statoVisto = { da_accettare: 'Da accettare', scaduto: 'Scaduto', accettato: 'Accettato', rifiutato: 'Non accettato' }[p.stato];
  return { id: p.id, etichetta: p.etichetta, numero: p.numero, revisione: p.revisione, oggetto: p.oggetto, data: p.data, scadenza: p.scadenza, stato: p.stato, statoVisto, versione: p.versione,
    introduzione: p.introduzione, complessita: p.complessita, oneriPrevisti: p.oneriPrevisti, condizioni: p.condizioni, studio: p.studio,
    sezioni: p.sezioni.map(se => ({ titolo: se.titolo, subtotale: 0, voci: se.voci.map(v => Object.assign({}, v, { importo: C.importoVoce(v) })) })),
    scontoPercentuale: p.scontoPercentuale, scontoEuro: p.scontoEuro, conti: k.conti, scadenzePagamento: k.scadenzePagamento,
    accettazione: p.accettazione ? Object.assign({}, p.accettazione, { firma: p.accettazione.firma ? { chiave: chiave(p.accettazione.firma, s.token) } : undefined }) : null,
    puoAccettare: p.stato === 'da_accettare' && r.puo.preventivi >= 2 && !s.anteprima,
    pdf: p.pdf ? { chiave: chiave(p.pdf, s.token), nome: FILE.get(p.pdf).nome } : null };
}
function vistaRapportino(x, s) {
  const r = ref(s.referente);
  return { id: x.id, numero: x.numero, data: x.data, luogo: x.luogo, commessa: x.commessa, tecnico: x.tecnico, lavoro: x.lavoro, oreLavoro: x.oreLavoro, oreExtra: x.oreExtra, oreViaggio: x.oreViaggio,
    km: x.km, ticket: x.ticket, statoVisto: x.daFirmare ? 'Da firmare' : 'Firmato', daFirmare: x.daFirmare, versione: x.versione, firma: x.firma ? { chiave: chiave(x.firma, s.token) } : null,
    firmatario: x.firmatario, firmatoIl: x.firmatoIl, firmaModo: x.firmaModo, importi: null, puoFirmare: x.daFirmare && r.puo.rapportini >= 2 && !s.anteprima };
}
function vistaRichiesta(x, s) {
  const r = ref(s.referente);
  return { id: x.id, numero: x.numero, titolo: x.titolo, descrizione: x.descrizione, luogo: x.luogo, apertaIl: x.apertaIl, statoVisto: x.statoVisto, dettaglioStato: x.dettaglioStato,
    risposte: x.risposte, rifCliente: x.rifCliente, apertaDa: x.apertaDa, tempo: x.tempo,
    messaggi: x.messaggi.map(m => Object.assign({}, m, { file: (m.file || []).map(f => ({ nome: f.nome, byte: f.byte, chiave: chiave(f.id, s.token) })) })),
    rapportini: x.rapportini.map(rp => { const q = D.rapportini.find(y => y.id === rp.id); return { id: q.id, numero: q.numero, data: q.data, statoVisto: q.daFirmare ? 'Da firmare' : 'Firmato' }; }),
    puoScrivere: r.puo.richieste >= 2 && !['Chiusa', 'Annullata'].includes(x.statoVisto), puoDireNonRisolto: x.statoVisto === 'Risolta' && r.puo.richieste >= 2 };
}
const accesso = (s, frase) => { if (!s.anteprima) D.accessi.unshift({ quando: adesso(), frase, dispositivo: s.agente || '', referente: s.referente }); };

function controllaFile(nome, b) {
  const ext = (String(nome).match(/\.([A-Za-z0-9]+)$/) || [])[1];
  const e = ext ? ext.toLowerCase() : '';
  if (!['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'].includes(e)) return 'Questo tipo di file non si può caricare: PDF, foto, DWG, DXF, Word o Excel';
  const inizia = (x) => b.slice(0, x.length).equals(Buffer.from(x));
  const giusto = e === 'pdf' ? inizia('%PDF-') : (e === 'jpg' || e === 'jpeg') ? inizia([0xFF, 0xD8, 0xFF]) : e === 'png' ? inizia([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) : true;
  if (!giusto) return 'Il file non è quello che dice il nome: non si carica';
  if (b.length > 20 * 1048576) return 'Il file è più grande di 20 MB: non si carica';
  return '';
}

// ------------------------------------------------------------------------------------------------- le strade
const STRADE = [];
const strada = (metodo, forma, fare, libera) => STRADE.push({ metodo, forma, fare, libera: !!libera });

strada('GET', /^studio$/, () => si({ studio: STUDIO, attivo: MODO !== 'portale-spento' }), true);
strada('POST', /^entra$/, (c, q) => {
  const email = String(c.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return no(400, "Scrivi un'email intera, per esempio nome@azienda.it");
  const conosciuti = REFERENTI.filter(r => r.email === email);
  if (conosciuti.length && q.pre) {
    const codice = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const t = token();
    CODICI.set(email, { codice, pre: q.pre, tentativi: 0, destinazione: String(c.destinazione || '') });
    LINK.set(t, { email, tipo: 'accesso', destinazione: String(c.destinazione || ''), usato: false });
    POSTA.push({ a: email, oggetto: 'Entra nel portale di ' + STUDIO.nome, codice, link: '/#/entra/' + t, quando: adesso() });
  }
  return si({ frase: 'Se ' + email + " è tra gli indirizzi abilitati, ti è arrivata un'email con un link e un codice. Valgono 10 minuti." });
}, true);
function apriSessione(r, agente, anteprima) {
  const t = token();
  SESSIONI.set(t, { token: t, referente: r.id, anteprima: !!anteprima, agente });
  return t;
}
function esitoIngresso(email, destinazione, agente, anteprima, refId) {
  const lista = refId ? [ref(refId)] : REFERENTI.filter(r => r.email === email);
  if (lista.length > 1) {
    const t = token();
    SESSIONI.set(t, { token: t, provvisoria: lista.map(r => r.id), agente, destinazione });
    return si({ scegli: lista.map((r, i) => ({ n: i + 1, azienda: AZIENDE[r.azienda].nome })), sessione: t });
  }
  const r = lista[0];
  const t = apriSessione(r, agente, anteprima);
  accesso(SESSIONI.get(t), 'Entrato');
  return si({ sessione: t, destinazione: destinazione || '', informativa: !r.informativa && !anteprima });
}
strada('POST', /^codice$/, (c, q) => {
  const email = String(c.email || '').trim().toLowerCase();
  const x = CODICI.get(email);
  if (!x || x.pre !== q.pre || String(c.codice) !== x.codice) {
    if (x) { x.tentativi++; if (x.tentativi >= 5) CODICI.delete(email); }
    return no(401, "Il codice non è giusto o non vale più: chiedi un'email nuova");
  }
  CODICI.delete(email);
  return esitoIngresso(email, x.destinazione, q.agente);
}, true);
strada('POST', /^link$/, (c, q) => {
  const l = LINK.get(String(c.token || ''));
  if (!l || l.usato) return no(401, 'Questo link non vale più', { nuovo: !!l });
  l.usato = true;
  return esitoIngresso(l.email, l.destinazione, q.agente, l.anteprima, l.referente);
}, true);
strada('POST', /^link-nuovo$/, c => {
  const l = LINK.get(String(c.token || ''));
  if (!l) return no(401, 'Questo link non vale più');
  const t = token();
  LINK.set(t, { email: l.email, tipo: 'accesso', destinazione: l.destinazione, usato: false });
  POSTA.push({ a: l.email, oggetto: 'Entra nel portale di ' + STUDIO.nome, codice: '', link: '/#/entra/' + t, quando: adesso() });
  return si({ frase: 'Ti abbiamo mandato un link nuovo a ' + l.email.charAt(0) + '•••••••' + l.email.slice(l.email.indexOf('@')) });
}, true);
strada('POST', /^azienda$/, (c, q, s0) => {
  const s = s0 || SESSIONI.get(q.sessione);
  if (!s) return no(401, 'La sessione è scaduta: entra di nuovo', { accesso: false });
  const lista = s.provvisoria || REFERENTI.filter(r => r.email === ref(s.referente).email).map(r => r.id);
  const id = lista[Number(c.n) - 1];
  if (!id) return no(400, 'Scegli una delle aziende');
  SESSIONI.delete(q.sessione);
  const r = ref(id);
  const t = apriSessione(r, q.agente);
  return si({ sessione: t, destinazione: s.destinazione || '', informativa: !r.informativa });
}, true);
strada('POST', /^informativa$/, (c, q, s) => { ref(s.referente).informativa = true; return si(); });
strada('POST', /^esci$/, (c, q, s) => {
  if (c.tutti) [...SESSIONI].forEach(([k, v]) => { if (v.referente === s.referente) SESSIONI.delete(k); }); else SESSIONI.delete(q.sessione);
  return si();
});
strada('GET', /^io$/, (c, q, s) => {
  const r = ref(s.referente);
  const altre = REFERENTI.filter(x => x.email === r.email && x.id !== r.id);
  return si({ studio: STUDIO, referente: { nome: r.nome, email: r.email, avvisiEmail: r.avvisiEmail }, azienda: AZIENDE[r.azienda].nome,
    aziende: altre.map(x => ({ n: REFERENTI.filter(y => y.email === r.email).indexOf(x) + 1, azienda: AZIENDE[x.azienda].nome })),
    puo: r.puo, sedi: AZIENDE[r.azienda].sedi, informativa: { daLeggere: !r.informativa && !s.anteprima, data: '2026-10-22' },
    sessione: { scadeSenzaUso: adesso(), scadeComunque: adesso(), anteprima: s.anteprima }, tipiFile: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'], fileMaxMb: 20 });
});
const suo = (lista, s) => lista.filter(x => x.azienda === ref(s.referente).azienda);
strada('GET', /^casa$/, (c, q, s) => {
  const r = ref(s.referente);
  const daFare = [];
  if (r.puo.preventivi >= 2) suo(D.preventivi, s).filter(p => p.stato === 'da_accettare').forEach(p => daFare.push({ tipo: 'preventivo', id: p.id, titolo: 'Preventivo ' + p.etichetta, dettaglio: 'Da accettare · scade il ' + p.scadenza.split('-').reverse().join('/') }));
  if (r.puo.rapportini >= 2) suo(D.rapportini, s).filter(x => x.daFirmare).forEach(x => daFare.push({ tipo: 'rapportino', id: x.id, titolo: 'Rapportino del ' + x.data.split('-').reverse().join('/'), dettaglio: 'Da firmare · ' + x.luogo }));
  const novita = [];
  suo(D.richieste, s).slice(0, 1).forEach(x => novita.push({ tipo: 'richiesta', id: x.id, titolo: 'Richiesta ' + x.numero, dettaglio: x.statoVisto + (x.dettaglioStato ? ' · ' + x.dettaglioStato : ''), quando: x.tempo[x.tempo.length - 1].quando }));
  suo(D.documenti, s).filter(d => d.nuovo).forEach(d => novita.push({ tipo: 'documento', id: d.id, titolo: d.titolo + ' ' + d.revisione, dettaglio: d.categoria, quando: d.data + 'T11:02:00' }));
  const conteggi = {};
  if (r.puo.preventivi) conteggi.preventivi = suo(D.preventivi, s).length + suo(D.contratti, s).length;
  if (r.puo.rapportini) conteggi.rapportini = suo(D.rapportini, s).length;
  if (r.puo.documenti) conteggi.documenti = suo(D.documenti, s).length;
  if (r.puo.fatture) conteggi.fatture = suo(D.fatture, s).length;
  if (r.puo.richieste) conteggi.richieste = suo(D.richieste, s).length;
  return si({ daFare, novita, conteggi });
});
strada('GET', /^preventivi$/, (c, q, s) => si({
  preventivi: suo(D.preventivi, s).map(p => { const v = vistaPreventivo(p, s); return { id: p.id, etichetta: p.etichetta, oggetto: p.oggetto, data: p.data, scadenza: p.scadenza, stato: p.stato, statoVisto: v.statoVisto, totale: v.conti.totale, nuovo: p.nuovo }; }),
  contratti: suo(D.contratti, s).map(k => ({ id: k.id, numero: k.numero, titolo: k.titolo, dal: k.dal, al: k.al, statoVisto: k.statoVisto })) }));
const trovaPrev = (id, s) => suo(D.preventivi, s).find(p => p.id === Number(id));
strada('GET', /^preventivi\/(\d+)$/, (c, q, s, m) => {
  const p = trovaPrev(m[1], s);
  if (!p) return no(404, 'Non trovato');
  accesso(s, 'Ha visto il preventivo ' + p.etichetta);
  return si({ preventivo: vistaPreventivo(p, s) });
});
function controllaScelte(p, scelte) {
  const gruppi = {};
  p.sezioni.forEach(se => se.voci.forEach(v => { if (v.alternativa && scelte[v.id]) gruppi[v.alternativa] = (gruppi[v.alternativa] || 0) + 1; }));
  const g = Object.keys(gruppi).find(k => gruppi[k] > 1);
  return g ? 'Di «' + g + '» se ne sceglie una sola' : '';
}
strada('POST', /^preventivi\/(\d+)\/anteprima$/, (c, q, s, m) => {
  const p = trovaPrev(m[1], s);
  if (!p) return no(404, 'Non trovato');
  const e = controllaScelte(p, c.scelte || {});
  if (e) return no(400, e);
  const k = contoDi(p, c.scelte || {});
  return si({ conti: k.conti, scadenzePagamento: k.scadenzePagamento });
});
strada('POST', /^preventivi\/(\d+)\/accetta$/, (c, q, s, m) => {
  const p = trovaPrev(m[1], s);
  if (!p) return no(404, 'Non trovato');
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  if (ref(s.referente).puo.preventivi < 2) return no(403, 'Non puoi accettare i preventivi: chiedi allo studio');
  if (p.stato === 'accettato') return no(400, 'È già accettato');
  if (!String(c.nome || '').trim()) return no(400, 'Scrivi il nome e cognome di chi accetta');
  if (!/^data:image\/png;base64,/.test(String(c.firma || ''))) return no(400, 'Manca la firma');
  if (c.letto !== true) return no(400, 'Spunta «Ho letto le condizioni»');
  if (c.versione !== p.versione) return no(409, 'Il preventivo è stato aggiornato: guarda la versione nuova', { cambiato: true });
  const e = controllaScelte(p, c.scelte || {});
  if (e) return no(400, e);
  const k = contoDi(p, c.scelte || {});
  p.sezioni.forEach((se, i) => se.voci.forEach(v => { const w = k.voci.find(x => x.id === v.id); v.scelta = !!(w && w.scelta); }));
  p.stato = 'accettato';
  p.accettazione = { il: adesso(), da: String(c.nome).trim(), modo: 'portale', firma: nuovoFile('firma.png', 'image/png', Buffer.from(String(c.firma).split(',')[1], 'base64')) };
  accesso(s, 'Ha accettato il preventivo ' + p.etichetta);
  POSTA.push({ a: ref(s.referente).email, oggetto: 'Preventivo ' + p.etichetta + ' accettato', quando: adesso() });
  return si({ preventivo: vistaPreventivo(p, s) });
});
strada('POST', /^preventivi\/(\d+)\/rifiuta$/, (c, q, s, m) => {
  const p = trovaPrev(m[1], s);
  if (!p) return no(404, 'Non trovato');
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  p.stato = 'rifiutato';
  return si({ preventivo: vistaPreventivo(p, s) });
});
strada('POST', /^preventivi\/(\d+)\/domanda$/, (c, q, s, m) => {
  if (!trovaPrev(m[1], s)) return no(404, 'Non trovato');
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  if (!String(c.testo || '').trim()) return no(400, 'Scrivi la domanda');
  return si();
});
strada('GET', /^rapportini$/, (c, q, s) => si({ rapportini: suo(D.rapportini, s).map(x => ({ id: x.id, numero: x.numero, data: x.data, luogo: x.luogo, lavoro: x.lavoro, statoVisto: x.daFirmare ? 'Da firmare' : 'Firmato', daFirmare: x.daFirmare, nuovo: x.nuovo })) }));
const trovaRap = (id, s) => suo(D.rapportini, s).find(x => x.id === Number(id));
strada('GET', /^rapportini\/(\d+)$/, (c, q, s, m) => { const x = trovaRap(m[1], s); if (!x) return no(404, 'Non trovato'); accesso(s, 'Ha visto il rapportino ' + x.numero); return si({ rapportino: vistaRapportino(x, s) }); });
strada('POST', /^rapportini\/(\d+)\/firma$/, (c, q, s, m) => {
  const x = trovaRap(m[1], s);
  if (!x) return no(404, 'Non trovato');
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  if (!x.daFirmare) return no(400, 'È già firmato');
  if (!String(c.nome || '').trim()) return no(400, 'Scrivi il nome di chi firma');
  if (!/^data:image\/png;base64,/.test(String(c.firma || ''))) return no(400, 'Manca la firma');
  if (c.versione !== x.versione) return no(409, 'Il rapportino è cambiato: guardalo di nuovo prima di firmare', { cambiato: true });
  Object.assign(x, { daFirmare: false, firma: nuovoFile('firma.png', 'image/png', Buffer.from(String(c.firma).split(',')[1], 'base64')), firmatario: String(c.nome).trim(), firmatoIl: adesso(), firmaModo: 'portale' });
  accesso(s, 'Ha firmato il rapportino ' + x.numero);
  return si({ rapportino: vistaRapportino(x, s) });
});
strada('POST', /^rapportini\/(\d+)\/segnala$/, (c, q, s, m) => { if (!trovaRap(m[1], s)) return no(404, 'Non trovato'); if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma"); return si(); });
strada('GET', /^documenti$/, (c, q, s) => si({
  documenti: suo(D.documenti, s).map(d => ({ id: d.id, titolo: d.titolo, categoria: d.categoria, data: d.data, revisione: d.revisione, nomeFile: d.nomeFile, byte: d.byte, luogo: d.luogo, nuovo: d.nuovo, file: { chiave: chiave(d.file, s.token) } })),
  tuoi: suo(D.tuoi, s).map(t => ({ id: t.id, titolo: t.titolo, nomeFile: t.nomeFile, byte: t.byte, inviatoIl: t.inviatoIl, statoVisto: t.statoVisto, motivo: t.motivo })) }));
strada('POST', /^carica$/, (c, q, s) => {
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  const b = Buffer.from(String(c.base64 || ''), 'base64');
  const e = controllaFile(c.nome, b);
  if (e) return no(e.indexOf('MB') > 0 ? 413 : 400, e);
  const id = ++prossimo;
  const nome = String(c.nome).replace(/[\\/\x00-\x1f]/g, '').slice(0, 120);
  CARICAMENTI.set(id, { id, nome, byte: b.length, per: c.per, file: nuovoFile(nome, 'application/octet-stream', b), referente: s.referente });
  return si({ caricamento: { id, nome, byte: b.length } });
});
strada('POST', /^documenti$/, (c, q, s) => {
  const k = CARICAMENTI.get(Number(c.caricamento));
  if (!k) return no(400, "Il file non c'è più: caricalo di nuovo");
  if (!String(c.titolo || '').trim()) return no(400, 'Scrivi di cosa si tratta');
  const t = { id: ++prossimo, azienda: ref(s.referente).azienda, titolo: String(c.titolo).trim(), nomeFile: k.nome, byte: k.byte, inviatoIl: adesso(), statoVisto: 'Ricevuto', motivo: '' };
  D.tuoi.unshift(t);
  accesso(s, 'Ha mandato il file ' + k.nome);
  return si({ tuo: t });
});
strada('GET', /^fatture$/, (c, q, s) => ref(s.referente).puo.fatture < 1 ? no(404, 'Non trovato') : si({ fatture: suo(D.fatture, s).map(f => ({ id: f.id, numero: f.numero, tipo: f.tipo, data: f.data, totale: f.totale, daPagare: f.daPagare, statoVisto: f.statoVisto, dettaglioStato: f.dettaglioStato, nuovo: f.nuovo })) }));
strada('GET', /^fatture\/(\d+)$/, (c, q, s, m) => {
  const f = suo(D.fatture, s).find(x => x.id === Number(m[1]));
  if (!f || ref(s.referente).puo.fatture < 1) return no(404, 'Non trovato');
  return si({ fattura: { id: f.id, numero: f.numero, tipo: f.tipo, data: f.data, causale: f.causale, righe: f.righe, conti: f.conti, scadenze: f.scadenze, daPagare: f.daPagare, statoVisto: f.statoVisto,
    dettaglioStato: f.dettaglioStato, pagamento: f.pagamento, xml: f.xml ? { chiave: chiave(f.xml, s.token), nome: FILE.get(f.xml).nome } : null, copia: null } });
});
strada('GET', /^richieste$/, (c, q, s) => si({ richieste: suo(D.richieste, s).map(x => ({ id: x.id, numero: x.numero, titolo: x.titolo, luogo: x.luogo, apertaIl: x.apertaIl, statoVisto: x.statoVisto, dettaglioStato: x.dettaglioStato, nuovo: x.nuovo })) }));
const trovaRic = (id, s) => suo(D.richieste, s).find(x => x.id === Number(id));
strada('GET', /^richieste\/(\d+)$/, (c, q, s, m) => { const x = trovaRic(m[1], s); if (!x) return no(404, 'Non trovato'); return si({ richiesta: vistaRichiesta(x, s) }); });
strada('POST', /^richieste$/, (c, q, s) => {
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  const r = ref(s.referente);
  if (!String(c.titolo || '').trim()) return no(400, 'Scrivi in poche parole cosa succede');
  const sedi = AZIENDE[r.azienda].sedi;
  if (sedi.length > 1 && !sedi.some(x => x.id === Number(c.idSede))) return no(400, "Scegli l'impianto o la sede");
  const sede = sedi.find(x => x.id === Number(c.idSede)) || sedi[0];
  const n = D.richieste.length + 15;
  const parole = { fermo: 'Sì, è fermo', ridotto: 'Va a metà', nessuno: 'Funziona', subito: 'Subito', presto: 'Entro domani', quando_si_puo: 'Quando si può' };
  const x = { id: ++prossimo, azienda: r.azienda, numero: 'TK/2026/' + String(n).padStart(4, '0'), titolo: String(c.titolo).trim(), descrizione: String(c.descrizione || ''), luogo: sede.nome, apertaIl: adesso(),
    statoVisto: 'Ricevuta', dettaglioStato: '', risposte: c.impatto && c.urgenza ? { fermo: parole[c.impatto], quando: parole[c.urgenza] } : null, rifCliente: String(c.rifCliente || ''), apertaDa: 'Portale',
    tempo: [{ quando: adesso(), testo: 'Ricevuta' }], messaggi: [], rapportini: [], puoDireNonRisolto: false, nuovo: false, caricamenti: c.caricamenti || [] };
  D.richieste.unshift(x);
  accesso(s, 'Ha aperto la richiesta ' + x.numero);
  return si(Object.assign({ richiesta: vistaRichiesta(x, s) }, c.impatto === 'fermo' && c.urgenza === 'subito' ? { telefono: STUDIO.telefono } : {}));
});
strada('POST', /^richieste\/(\d+)\/messaggio$/, (c, q, s, m) => {
  const x = trovaRic(m[1], s);
  if (!x) return no(404, 'Non trovato');
  if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma");
  if (['Chiusa', 'Annullata'].includes(x.statoVisto)) return no(400, 'La richiesta è chiusa: per un problema nuovo apri una richiesta nuova');
  if (!String(c.testo || '').trim()) return no(400, 'Scrivi il messaggio');
  const file = (c.caricamenti || []).map(id => CARICAMENTI.get(Number(id))).filter(Boolean).map(k => ({ nome: k.nome, byte: k.byte, id: k.file }));
  x.messaggi.push({ quando: adesso(), da: ref(s.referente).nome, testo: String(c.testo).slice(0, 2000), file });
  return si({ richiesta: vistaRichiesta(x, s) });
});
strada('GET', /^accessi$/, (c, q, s) => si({ accessi: D.accessi.filter(a => a.referente === s.referente).slice(0, 20).map(a => ({ quando: a.quando, frase: a.frase, dispositivo: a.dispositivo })) }));
strada('POST', /^avvisi$/, (c, q, s) => { if (s.anteprima) return no(403, "È un'anteprima: qui non si accetta e non si firma"); ref(s.referente).avvisiEmail = !!c.email; return si(); });
function file(k, s, soloImmagini) {
  const x = CHIAVI.get(k);
  if (!x || x.sessione !== s.token) return no(404, 'Non trovato');
  const f = FILE.get(x.file);
  if (!f) return no(404, 'Non trovato');
  if (soloImmagini && !/^image\/(png|jpeg)$/.test(f.mime)) return no(404, 'Non trovato');
  return si({ nome: f.nome, mime: f.mime, byte: f.byte.length, base64: f.byte.toString('base64') });
}
strada('GET', /^scarica\/([A-Za-z0-9_.-]+)$/, (c, q, s, m) => file(m[1], s, false));
strada('GET', /^immagine\/([A-Za-z0-9_.-]+)$/, (c, q, s, m) => file(m[1], s, true));
strada('GET', /^condiviso\/([A-Za-z0-9_-]+)$/, (c, q, s, m) => { const d = CONDIVISI.get(m[1]); return d ? si({ studio: STUDIO.nome, documento: { titolo: d.titolo, nomeFile: d.nomeFile, revisione: d.revisione, byte: d.byte } }) : no(404, 'Questo link non vale più'); }, true);
strada('GET', /^condiviso\/([A-Za-z0-9_-]+)\/scarica$/, (c, q, s, m) => { const d = CONDIVISI.get(m[1]); if (!d) return no(404, 'Questo link non vale più'); const f = FILE.get(d.file); return si({ nome: f.nome, mime: f.mime, byte: f.byte.length, base64: f.byte.toString('base64') }); }, true);

function rispondi(q) {
  if (q.portale !== 1 || q.v !== 1) return no(426, 'Il portale è stato aggiornato: ricarica la pagina', { ricarica: true });
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(String(q.id || '')) || typeof q.strada !== 'string' || !/^[a-z-]+(\/[A-Za-z0-9_.-]{1,200}){0,3}$/.test(q.strada) || q.strada.includes('..')) return no(404, 'Non trovato');
  if (MODO === 'spento') return { ok: false, rete: true, porta: 'spento', errore: 'Il server dello studio non risponde dalle 10:42: riprova più tardi' };
  if (MODO === 'attesa') return { ok: false, rete: true, porta: 'attesa', errore: 'Il server dello studio non ha risposto in tempo: riprova fra poco' };
  if (MODO === 'portale-spento' && q.strada !== 'studio') return no(503, 'Il portale di Studio Tecnico GM non è attivo', { spento: true });
  const s = STRADE.find(x => x.metodo === q.metodo && x.forma.test(q.strada));
  if (!s) return no(404, 'Non trovato');
  const m = q.strada.match(s.forma);
  const sess = SESSIONI.get(q.sessione);
  if (!s.libera && (!sess || sess.provvisoria)) return no(401, 'La sessione è scaduta: entra di nuovo', { accesso: false });
  if (sess) sess.agente = q.agente;
  const chiaveFatta = q.sessione + '|' + q.id;
  if (q.metodo === 'POST' && FATTE.has(chiaveFatta)) { REGISTRO.push({ strada: q.strada, id: q.id, ripetuta: true }); return FATTE.get(chiaveFatta); }
  const r = s.fare(q.corpo || {}, q, sess, m);
  REGISTRO.push({ strada: q.strada, metodo: q.metodo, id: q.id, ripetuta: false, ok: r.ok, agente: q.agente });
  if (q.metodo === 'POST' && r.ok && !['entra', 'codice', 'link', 'link-nuovo', 'azienda'].includes(q.strada)) FATTE.set(chiaveFatta, r);
  return r;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (x, codice) => { res.writeHead(codice || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(x)); };
  if (req.method === 'GET' && url.pathname.startsWith('/prova/')) {
    const p = url.pathname.slice(7);
    if (p === 'posta') return json(POSTA);
    if (p === 'registro') return json(REGISTRO);
    if (p === 'dati') return json(D);
    if (p === 'modo') { MODO = url.searchParams.get('m') || 'normale'; return json({ ok: true, modo: MODO }); }
    if (p === 'azzera') { D = datiIniziali(); REGISTRO.length = 0; POSTA.length = 0; SESSIONI.clear(); FATTE.clear(); REFERENTI.forEach(r => { r.informativa = r.id === 3 ? false : r.informativa; }); return json({ ok: true }); }
    if (p === 'link') {
      const t = token();
      const refId = Number(url.searchParams.get('ref') || 3);
      LINK.set(t, { email: ref(refId).email, referente: refId, tipo: url.searchParams.get('tipo') || 'avviso', destinazione: url.searchParams.get('dest') || '', usato: false, anteprima: url.searchParams.get('tipo') === 'anteprima' });
      return json({ ok: true, token: t, link: '/#/entra/' + t });
    }
    if (p === 'condiviso') { const t = token(); CONDIVISI.set(t, { titolo: 'Schema unifilare cabina MT', nomeFile: 'Schema unifilare cabina rev2.pdf', revisione: 2, byte: 1830211, file: PDF9 }); return json({ ok: true, token: t, link: '/#/condiviso/' + t }); }
    return json({ ok: false }, 404);
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  if (req.method !== 'POST') return json(no(404, 'Non trovato'));
  const pezzi = [];
  let n = 0;
  req.on('data', d => { n += d.length; if (n < 40 * 1048576) pezzi.push(d); });
  req.on('end', () => {
    let q;
    try { q = JSON.parse(Buffer.concat(pezzi).toString('utf8')); } catch (e) { return json({ ok: false, errore: 'Richiesta non valida' }); }
    // come lo script: aspetta un poco (Google non risponde mai subito)
    setTimeout(() => json(rispondi(q)), q.strada === 'anteprima' ? 50 : 120);
  });
});
server.listen(PORTA, '127.0.0.1', () => console.log('Finto portale su http://127.0.0.1:' + PORTA + ' (solo per provare la pagina)'));
