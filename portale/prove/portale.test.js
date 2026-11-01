// Le parti del portale che non hanno bisogno del browser (docs/gestionale/fase7.md §0, §7, §12.5, §13.2 punto 8).
//   node --test portale/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RADICE = path.resolve(__dirname, '..', '..');
const P = require('../portale.js');
const D = require('../../pc/ui/documenti.js');
const leggi = f => fs.readFileSync(path.join(RADICE, f), 'utf8');

// ------------------------------------------------------------------------------------------------------- rotte

test('rotte: le pagine dopo # e quello che non c\'è', () => {
  const casi = {
    '': { pagina: 'casa' }, '#': { pagina: 'casa' }, '#/': { pagina: 'casa' }, '#/casa': { pagina: 'casa' },
    '#/entra': { pagina: 'entra' }, '#/posta': { pagina: 'posta' }, '#/link': { pagina: 'link' }, '#/azienda': { pagina: 'azienda' },
    '#/informativa': { pagina: 'informativa' }, '#/accesso': { pagina: 'accesso' },
    '#/preventivi': { pagina: 'preventivi' }, '#/preventivi/12': { pagina: 'preventivo', id: '12' },
    '#/preventivi/12/accetta': { pagina: 'accetta', id: '12' }, '#/preventivi/12/accettato': { pagina: 'accettato', id: '12' },
    '#/rapportini': { pagina: 'rapportini' }, '#/rapportini/15': { pagina: 'rapportino', id: '15' }, '#/rapportini/15/firma': { pagina: 'firmarap', id: '15' },
    '#/documenti': { pagina: 'documenti' }, '#/documenti/manda': { pagina: 'carica' },
    '#/fatture': { pagina: 'fatture' }, '#/fatture/18': { pagina: 'fattura', id: '18' },
    '#/richieste': { pagina: 'richieste' }, '#/richieste/nuova': { pagina: 'nuovarichiesta' }, '#/richieste/21': { pagina: 'richiesta', id: '21' },
    '#/preventivi/12/': { pagina: 'preventivo', id: '12' },
  };
  for (const [h, atteso] of Object.entries(casi)) assert.deepEqual(P.leggiRotta(h), atteso, h);
  const tok = 'q7Kp2xRw9sLm4tVbX2abcdEFGH_-1234567890abcde';
  assert.deepEqual(P.leggiRotta('#/entra/' + tok), { pagina: 'link', token: tok });
  assert.deepEqual(P.leggiRotta('#/condiviso/' + tok), { pagina: 'condiviso', token: tok });
  for (const h of ['#/exec', '#/preventivi/abc', '#/preventivi/12345678901', '#/preventivi/12/rifiuta', '#/../exec', '#/entra/corto', '#/entra/<script>', '#/io', '#/rapportini/1/2/3',
    '#/condiviso/a b', '#/documenti/9', '#/richieste/nuova/1', '#/%2e%2e']) {
    assert.equal(P.leggiRotta(h).pagina, 'nontrovato', h);
  }
});

test('rotte: indirizzi, indietro, sezione del menu, destinazioni dal server', () => {
  for (const h of ['#/preventivi/12', '#/preventivi/12/accetta', '#/rapportini/15/firma', '#/fatture/18', '#/richieste/21', '#/documenti/manda', '#/richieste/nuova', '#/accesso']) {
    const r = P.leggiRotta(h);
    assert.equal(P.indirizzo(r.pagina, r.id), h, h);
  }
  assert.equal(P.padreDi({ pagina: 'accetta', id: '12' }), '#/preventivi/12');
  assert.equal(P.padreDi({ pagina: 'firmarap', id: '15' }), '#/rapportini/15');
  assert.equal(P.padreDi({ pagina: 'casa' }), null);
  assert.equal(P.sezioneDi('accetta'), 'preventivi');
  assert.equal(P.sezioneDi('nuovarichiesta'), 'richieste');
  assert.equal(P.indirizzoDaDestinazione('preventivi/12'), '#/preventivi/12');
  assert.equal(P.indirizzoDaDestinazione(''), '#/casa');
  assert.equal(P.indirizzoDaDestinazione('entra'), '#/casa', 'mai verso una pagina di fuori');
  assert.equal(P.indirizzoDaDestinazione('../exec'), '#/casa');
  assert.equal(P.indirizzoDaDestinazione('https://cattivo.example'), '#/casa');
  assert.equal(P.destinazioneDa('#/rapportini/15'), 'rapportini/15');
  assert.equal(P.destinazioneDa('#/entra/' + 'x'.repeat(43)), '', 'un token non diventa mai una destinazione');
  assert.equal(P.indirizzoDiCosa('documento', 9), '#/documenti');
  assert.equal(P.indirizzoDiCosa('richiesta', 21), '#/richieste/21');
});

test('permessi: il menu ha solo le voci col permesso, le pagine si aprono col livello giusto', () => {
  const tutto = { preventivi: 2, rapportini: 2, fatture: 1, documenti: 2, richieste: 2 };
  assert.deepEqual(P.vociMenu(tutto).map(v => v.nome), ['Casa', 'Preventivi e contratti', 'Rapportini', 'Documenti', 'Fatture', "Richieste d'intervento", 'Il mio accesso']);
  assert.deepEqual(P.vociMenu({ preventivi: 1, rapportini: 0, fatture: 0, documenti: 1, richieste: 0 }).map(v => v.chiave), ['casa', 'preventivi', 'documenti', 'accesso']);
  assert.equal(P.puoAprire('fattura', { fatture: 0 }), false);
  assert.equal(P.puoAprire('fattura', { fatture: 1 }), true);
  assert.equal(P.puoAprire('carica', { documenti: 1 }), false, 'mandare file vuole documenti 2');
  assert.equal(P.puoAprire('nuovarichiesta', { richieste: 2 }), true);
  assert.equal(P.puoAprire('casa', {}), true);
});

// ------------------------------------------------------------------------------------------------------- formati

test('formati: importi, numeri, date, ore', () => {
  assert.equal(P.euro(4291.35), '4.291,35 €');
  assert.equal(P.euro(1830.5), '1.830,50 €');
  assert.equal(P.euro(45), '45,00 €');
  assert.equal(P.euro(0), '0,00 €');
  assert.equal(P.euro(1234567.891), '1.234.567,89 €');
  assert.equal(P.euro(-304), '−304,00 €');
  assert.equal(P.euro('x'), '0,00 €');
  assert.equal(P.numero(0.5), '0,5');
  assert.equal(P.numero(16), '16');
  assert.equal(P.numero(1830.5), '1.830,5');
  assert.equal(P.numero(2.25), '2,25');
  assert.equal(P.dataIt('2026-10-22'), '22/10/2026');
  assert.equal(P.dataIt('2026-10-22T10:07:00'), '22/10/2026');
  assert.equal(P.dataIt(''), '');
  assert.equal(P.oraIt('2026-10-22T09:05:00'), '9:05');
  assert.equal(P.oraIt('2026-10-22'), '');
  assert.equal(P.dataOraIt('2026-10-21T17:30:00'), '21/10/2026 17:30');
  assert.equal(P.quandoIt('2026-10-22T09:58:00', '2026-10-22'), 'oggi alle 9:58');
  assert.equal(P.quandoIt('2026-10-21T17:40:00', '2026-10-22'), 'ieri alle 17:40');
  assert.equal(P.quandoIt('2026-10-20T08:40:00', '2026-10-22'), '20/10/2026 alle 8:40');
  assert.equal(P.quandoIt('2026-11-01T08:00:00', '2026-11-02'), 'ieri alle 8:00', 'a cavallo del mese');
  assert.equal(P.quandoIt('2026-03-28', '2026-03-29'), 'ieri', 'a cavallo dell\'ora legale');
  assert.equal(P.grandezza(1258291), '1,2 MB');
  assert.equal(P.grandezza(87000), '85 KB');
  assert.equal(P.grandezza(0), '1 KB');
  assert.equal(P.saluto(9), 'Buongiorno');
  assert.equal(P.saluto(15), 'Buon pomeriggio');
  assert.equal(P.saluto(21), 'Buonasera');
  assert.equal(P.saluto(2), 'Buonasera');
});

test('formati: telefono ed email nei collegamenti, solo nella forma giusta', () => {
  assert.equal(P.collegamentoTelefono('0445 000100'), 'tel:+390445000100');
  assert.equal(P.collegamentoTelefono('+39 333 000 1122'), 'tel:+393330001122');
  assert.equal(P.collegamentoTelefono('0041 79 000 11 22'), 'tel:+41790001122');
  assert.equal(P.collegamentoTelefono('javascript:alert(1)'), '', 'niente che non sia un numero');
  assert.equal(P.collegamentoTelefono(''), '');
  assert.equal(P.collegamentoEmail('ufficio@studiogm.example'), 'mailto:ufficio@studiogm.example');
  assert.equal(P.collegamentoEmail('a@b.it?subject=x'), '');
  assert.equal(P.collegamentoEmail('javascript:alert(1)'), '');
  assert.equal(P.iniziali('Sig. Ferretti'), 'F');
  assert.equal(P.iniziali('Giulia Neri'), 'GN');
  assert.equal(P.iniziali(''), '·');
});

test('stati: le parole del cliente coi loro colori, mai rosso', () => {
  const attesi = { verde: ['Accettato', 'Firmato', 'Pagata', 'Risolta', 'Attivo'], blu: ['Presa in carico', 'Intervento fissato', 'Da pagare'],
    giallo: ['Da accettare', 'Da firmare', 'Nuovo'], ambra: ['Scaduto', 'Scadenza passata', 'Pagata in parte', 'In attesa'],
    grigio: ['Ricevuta', 'Chiusa', 'Annullata', 'Non accettato', 'Ricevuto', 'Nota di credito', 'Chiuso'] };
  for (const [colore, parole] of Object.entries(attesi)) for (const p of parole) assert.equal(P.coloreStato(p), colore, p);
  assert.equal(P.coloreStato('Una parola nuova'), 'grigio');
  assert.ok(!Object.values(P.COLORE_STATO).includes('rosso'));
  assert.ok(!/p-rosso|--rosso/.test(leggi('portale/portale.css') + leggi('portale/portale.js')), 'niente rosso nel portale');
});

// ------------------------------------------------------------------------------------------------------- agente e id

test('agente: browser e sistema, al massimo 40 caratteri', () => {
  const casi = [
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome · Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge · Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge · Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1', 'Chrome · iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'Safari · Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0', 'Firefox · Windows'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36', 'Samsung Internet · Android'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 EdgA/130.0', 'Edge · Android'],
    ['', 'Browser'],
  ];
  for (const [ua, atteso] of casi) assert.equal(P.agenteDa(ua), atteso, ua);
  assert.ok(P.agenteDa('x'.repeat(500) + ' Windows').length <= 40);
});

const casuali = n => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256); return b; };

test('id e pre-sessione: base64url, 22 e 43 caratteri, sempre diversi', () => {
  const visti = new Set();
  for (let i = 0; i < 200; i++) {
    const id = P.nuovoId(casuali);
    assert.match(id, /^[A-Za-z0-9_-]{22}$/);
    visti.add(id);
  }
  assert.equal(visti.size, 200);
  assert.match(P.nuovaPre(casuali), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(P.jsonOrdinato({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  assert.equal(P.impronta('abc'), P.impronta('abc'));
  assert.notEqual(P.impronta('abc'), P.impronta('abd'));
});

// ------------------------------------------------------------------------------------------------------- chiamate

function finto(risposte) {
  const mandate = [];
  let i = 0;
  const trasporto = async (testo, ms) => {
    mandate.push({ q: JSON.parse(testo), ms });
    const r = risposte[Math.min(i++, risposte.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  const stato = { sessione: '', pre: 'PRE'.padEnd(43, 'x') };
  const c = P.creaChiamate({ trasporto, casuali, agente: 'Edge · Windows', leggiSessione: () => stato.sessione, leggiPre: () => stato.pre });
  return { c, mandate, stato };
}

test('chiamate: la richiesta ha la forma di §0.2', async () => {
  const { c, mandate, stato } = finto([{ ok: true, stato: 200 }]);
  stato.sessione = 'SESS';
  await c.chiama('preventivi/12/accetta', 'POST', { nome: 'Roberto Ferretti', scelte: { 14: true } });
  const q = mandate[0].q;
  assert.deepEqual(Object.keys(q).sort(), ['agente', 'corpo', 'id', 'metodo', 'portale', 'pre', 'sessione', 'strada', 'v']);
  assert.equal(q.portale, 1);
  assert.equal(q.v, 1);
  assert.match(q.id, /^[A-Za-z0-9_-]{16,80}$/);
  assert.equal(q.strada, 'preventivi/12/accetta');
  assert.equal(q.metodo, 'POST');
  assert.equal(q.sessione, 'SESS');
  assert.equal(q.pre, '', 'la pre-sessione solo con entra e codice');
  assert.equal(q.agente, 'Edge · Windows');
  assert.deepEqual(q.corpo, { nome: 'Roberto Ferretti', scelte: { 14: true } });
  assert.equal(mandate[0].ms, P.ATTESA_MS);
});

test('chiamate: la pre-sessione va con entra e codice (e azienda senza sessione), mai con le altre', async () => {
  const { c, mandate, stato } = finto([{ ok: true, stato: 200 }]);
  await c.chiama('entra', 'POST', { email: 'a@b.it' });
  await c.chiama('codice', 'POST', { email: 'a@b.it', codice: '123456' });
  await c.chiama('azienda', 'POST', { n: 2 });
  await c.chiama('studio', 'GET');
  stato.sessione = 'S';
  await c.chiama('azienda', 'POST', { n: 1 });
  await c.chiama('io', 'GET');
  assert.deepEqual(mandate.map(m => m.q.pre ? m.q.strada : '-'), ['entra', 'codice', 'azienda', '-', '-', '-']);
  assert.deepEqual(mandate.map(m => m.q.metodo), ['POST', 'POST', 'POST', 'GET', 'POST', 'GET']);
});

test('chiamate: la stessa operazione riprovata dopo "non risponde" riparte con lo STESSO id', async () => {
  const rete = { ok: false, rete: true, porta: 'attesa', errore: 'Il server dello studio non ha risposto in tempo: riprova fra poco' };
  const { c, mandate } = finto([rete, null, new Error('rete giù'), { ok: false, stato: 503, errore: 'difficoltà' }, { ok: true, stato: 200 }, { ok: true, stato: 200 }]);
  const corpo = { nome: 'Roberto Ferretti', firma: 'data:image/png;base64,AAAA', versione: '2026-10-21T17:12:00' };
  const r1 = await c.chiama('rapportini/15/firma', 'POST', corpo);
  assert.equal(r1.ok, false);
  assert.equal(r1.rete, true);
  assert.equal(r1.errore, P.TESTO_RETE, 'la pagina dice la sua frase, non quella della porta');
  const r2 = await c.chiama('rapportini/15/firma', 'POST', Object.assign({}, corpo));      // null: pagina HTML, quota
  assert.equal(r2.rete, true);
  await c.chiama('rapportini/15/firma', 'POST', { versione: corpo.versione, firma: corpo.firma, nome: corpo.nome });   // eccezione, chiavi in un altro ordine
  await c.chiama('rapportini/15/firma', 'POST', corpo);    // 503: si potrà riprovare
  const r5 = await c.chiama('rapportini/15/firma', 'POST', corpo);
  assert.equal(r5.ok, true);
  const ids = mandate.map(m => m.q.id);
  assert.equal(new Set(ids).size, 1, 'sempre lo stesso id finché non arriva una risposta vera: ' + ids.join(' '));
  await c.chiama('rapportini/15/firma', 'POST', corpo);
  assert.notEqual(mandate[5].q.id, ids[0], 'dopo la risposta vera la stessa cosa rifatta è un\'operazione nuova');
  assert.equal(c.inSospeso(), 0);
});

test('chiamate: un rifiuto vero libera l\'id; corpi diversi, id diversi; le letture hanno sempre un id nuovo', async () => {
  const { c, mandate } = finto([{ ok: false, stato: 400, errore: 'Manca la firma' }, { ok: false, rete: true }, { ok: false, rete: true }, { ok: true }, { ok: true }, { ok: true }]);
  await c.chiama('preventivi/12/accetta', 'POST', { nome: 'X' });
  await c.chiama('preventivi/12/accetta', 'POST', { nome: 'X' });
  assert.notEqual(mandate[0].q.id, mandate[1].q.id, 'dopo un 400 si riparte da capo');
  await c.chiama('preventivi/12/accetta', 'POST', { nome: 'Y' });
  assert.notEqual(mandate[1].q.id, mandate[2].q.id, 'un corpo diverso è un\'altra operazione');
  await c.chiama('io', 'GET');
  await c.chiama('io', 'GET');
  assert.notEqual(mandate[3].q.id, mandate[4].q.id);
  assert.equal(c.inSospeso(), 2, 'restano in sospeso le due POST rimaste senza risposta');
});

test('chiamate: strade fuori forma non partono; i file hanno più tempo', async () => {
  const { c, mandate } = finto([{ ok: true }]);
  for (const s of ['../exec', 'preventivi/../../exec', 'Preventivi', 'a/b/c/d/e', 'scarica/' + 'x'.repeat(201), 'exec?azione=io', '']) {
    const r = await c.chiama(s, 'GET');
    assert.equal(r.stato, 404, s);
  }
  assert.equal(mandate.length, 0);
  await c.chiama('carica', 'POST', { nome: 'a.pdf', per: 'documento', base64: 'JVBERi0=' }, { attesa: P.ATTESA_CARICA_MS });
  assert.equal(mandate[0].ms, P.ATTESA_CARICA_MS);
  assert.ok(P.FORMA_STRADA.test('scarica/eyJzIjoxfQ.k3J-_x'));
  assert.ok(P.FORMA_STRADA.test('condiviso/abc_DEF-123/scarica'));
});

// ------------------------------------------------------------------------------------------------------- preventivo

const PREV = { id: 12, sezioni: [
  { titolo: 'Progettazione', voci: [{ id: 11, descrizione: 'Sopralluogo', modo: 'corpo', quantita: 1, prezzo: 350, facoltativa: false, alternativa: '', scelta: false }] },
  { titolo: 'Cantiere', voci: [
    { id: 13, descrizione: 'Direzione lavori', modo: 'ore', quantita: 16, unita: 'ore', prezzo: 45, facoltativa: false, alternativa: '', scelta: false },
    { id: 14, descrizione: 'Dichiarazione di rispondenza', modo: 'corpo', quantita: 1, prezzo: 450, facoltativa: true, alternativa: '', scelta: false },
    { id: 15, descrizione: 'Collaudo con strumenti propri', modo: 'corpo', quantita: 1, prezzo: 380, facoltativa: false, alternativa: 'collaudo', scelta: true },
    { id: 16, descrizione: 'Collaudo con laboratorio esterno', modo: 'corpo', quantita: 1, prezzo: 620, facoltativa: false, alternativa: 'collaudo', scelta: false }] }] };

test('preventivo: le scelte partono come le ha messe lo studio, un\'alternativa toglie le altre, "Nessuna di queste"', () => {
  const s0 = P.scelteIniziali(PREV);
  assert.deepEqual(s0, { 14: false, 15: true, 16: false });
  const s1 = P.scegli(PREV, s0, 14, true);
  assert.deepEqual(s1, { 14: true, 15: true, 16: false });
  const s2 = P.scegli(PREV, s1, 16, true);
  assert.deepEqual(s2, { 14: true, 15: false, 16: true });
  const s3 = P.scegli(PREV, s2, null, false, 'collaudo');
  assert.deepEqual(s3, { 14: true, 15: false, 16: false });
  assert.deepEqual(P.scegli(PREV, s3, 13, false), s3, 'una voce normale non si sceglie');
  assert.deepEqual(s0, { 14: false, 15: true, 16: false }, 'le scelte di prima non cambiano');
  assert.equal(P.inclusa(PREV.sezioni[1].voci[0], s3), true);
  assert.equal(P.inclusa(PREV.sezioni[1].voci[1], s3), true);
  assert.equal(P.inclusa(PREV.sezioni[1].voci[2], s3), false);
  assert.deepEqual(P.riassuntoScelte(PREV, s2), [{ testo: 'Dichiarazione di rispondenza', stato: 'inclusa' }, { testo: 'Collaudo con laboratorio esterno', stato: 'scelto' }]);
  assert.deepEqual(P.riassuntoScelte(PREV, s0)[0], { testo: 'Dichiarazione di rispondenza', stato: 'non inclusa' });
  assert.deepEqual(P.riassuntoScelte(PREV, s3)[1], { testo: 'Nessuna di queste · collaudo', stato: 'scelto' });
  const doppie = { sezioni: [{ voci: [{ id: 1, alternativa: 'g', scelta: true }, { id: 2, alternativa: 'g', scelta: true }] }] };
  assert.deepEqual(P.scelteIniziali(doppie), { 1: true, 2: false }, 'di un gruppo vale solo la prima scelta');
  assert.equal(P.dettaglioVoce(PREV.sezioni[1].voci[0]), '16 ore × 45,00 €');
  assert.equal(P.dettaglioVoce(PREV.sezioni[1].voci[1]), 'a corpo');
  assert.equal(P.dettaglioVoce({ modo: 'quantita', quantita: 3, unita: 'm', prezzo: 12, scontoPercentuale: 10 }), '3 m × 12,00 € · sconto 10%');
});

// ------------------------------------------------------------------------------------------------------- file

test('file: estensione (l\'ultima), tipi ammessi, grandezza', () => {
  assert.equal(P.estensioneDi('Schema quadro QG2.PDF'), 'pdf');
  assert.equal(P.estensioneDi('fattura.pdf.exe'), 'exe');
  assert.equal(P.estensioneDi('senza'), '');
  const tipi = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'];
  assert.equal(P.erroreFile('foto.heic', 3e6, tipi, 20), '');
  assert.equal(P.erroreFile('quadro.svg', 100, tipi, 20), 'Questo tipo di file non si può caricare: PDF, foto, DWG, DXF, Word o Excel');
  assert.equal(P.erroreFile('macro.docm', 100, tipi, 20), P.ERRORE_TIPO);
  assert.equal(P.erroreFile('a.pdf.exe', 100, tipi, 20), P.ERRORE_TIPO);
  assert.equal(P.erroreFile('grande.pdf', 21 * 1048576, tipi, 20), 'Il file è più grande di 20 MB: non si carica');
  assert.equal(P.erroreFile('a.pdf', 100, ['jpg'], 20), P.ERRORE_TIPO, 'lo studio può togliere tipi');
  assert.equal(P.acceptDi(['pdf', 'png']), '.pdf,.png');
});

// ------------------------------------------------------------------------------------------------------- informativa

test('informativa: il riassunto di §9.8 con i cambi di §0.6 (Google e Netlify, niente IP, niente cookie)', () => {
  const st = { nome: 'Studio Tecnico GM', indirizzo: "Via dell'Esempio 1, 36016 Thiene (VI)", partitaIva: '02345678901', email: 'ufficio@studiogm.example' };
  const t = P.testoInformativa(st, 'Rossi Impianti Srl');
  for (const pezzo of ["Questo portale è di Studio Tecnico GM (Via dell'Esempio 1, 36016 Thiene (VI), P. IVA 02345678901), titolare dei dati.",
    'del lavoro che facciamo per Rossi Impianti Srl,', 'un registro degli accessi (data, ora, browser) per 12 mesi.',
    'Le email e il collegamento passano da Google; la pagina è ospitata da Netlify: tutti e due possono trattare dati negli Stati Uniti.',
    'Usiamo solo la memoria del browser che serve a tenerti dentro, e si cancella chiudendo la scheda: niente statistiche, niente pubblicità.',
    'scrivendo a ufficio@studiogm.example; puoi anche rivolgerti al Garante per la protezione dei dati personali.']) {
    assert.ok(t.includes(pezzo), 'manca: ' + pezzo);
  }
  assert.ok(!/Tailscale|Cloudflare|cookie|indirizzo IP/i.test(t));
  assert.ok(P.testoInformativa(st, '').includes('per la tua azienda'));
});

// ------------------------------------------------------------------------------------------------------- stampa

const STUDIO = { nome: 'Studio Tecnico GM', indirizzo: "Via dell'Esempio 1, 36016 Thiene (VI)", partitaIva: '02345678901', email: 'ufficio@studiogm.example', telefono: '0445 000100' };

test('stampa: il rapportino della vista con documenti.js, firmato nel portale, senza stati interni', () => {
  const vista = { id: 15, numero: 'RAP/2026/0153', data: '2026-10-21', luogo: 'Capannone di Thiene', commessa: '26ST046 · Quadri del capannone', tecnico: 'Manuel Gasparotto',
    lavoro: 'Ricerca guasto sul quadro QG2 <b>', oreLavoro: 3, oreExtra: 0, oreViaggio: 0.5, km: 24, ticket: 'TK/2026/0016', statoVisto: 'Firmato', daFirmare: false,
    versione: '2026-10-21T17:12:00', firma: { chiave: 'k' }, firmatario: 'Roberto Ferretti', firmatoIl: '2026-10-22T10:15:00', firmaModo: 'portale', importi: null, puoFirmare: false };
  const d = P.perStampaRapportino(vista, STUDIO, 'Rossi Impianti Srl');
  let html = D.rapportino(d.rapportino, d.ana, d.opzioni);
  for (const pezzo of ['RAP/2026/0153', 'Studio Tecnico GM', 'Rossi Impianti Srl', '26ST046', 'Capannone di Thiene', 'Manuel Gasparotto', '3 h', '0,5 h', '24 km',
    'Ricerca guasto sul quadro QG2 &lt;b&gt;', 'Firma per accettazione · Roberto Ferretti', 'Firmato nel portale da Roberto Ferretti · 22/10/2026 10:15']) {
    assert.ok(html.includes(pezzo), 'manca: ' + pezzo);
  }
  assert.ok(!/Bozza|Fatturato|Inviato|undefined|Quadri del capannone/.test(html), 'niente stati interni né campi fuori vista');
  assert.ok(!html.includes('Compenso ore'), 'senza importi');
  assert.ok(html.includes('src="/file/' + P.SEGNAPOSTO_FIRMA + '"'));
  const firmato = P.mettiFirma(html, 'data:image/png;base64,iVBORw0KGgo=');
  assert.ok(firmato.includes('src="data:image/png;base64,iVBORw0KGgo="') && !firmato.includes(P.SEGNAPOSTO_FIRMA));
  const senza = P.mettiFirma(html, 'data:text/html;base64,PHNjcmlwdD4=');
  assert.ok(!senza.includes(P.SEGNAPOSTO_FIRMA) && !senza.includes('text/html'), 'un\'immagine che non è PNG o JPEG non entra');
  const daFirmare = P.perStampaRapportino(Object.assign({}, vista, { statoVisto: 'Da firmare', daFirmare: true, firma: null, firmaModo: '', firmatario: '', firmatoIl: '' }), STUDIO, 'Rossi');
  html = D.rapportino(daFirmare.rapportino, daFirmare.ana, daFirmare.opzioni);
  assert.ok(html.includes('Da firmare') && !html.includes('Firmato nel portale') && !html.includes('/file/'));
  const conImporti = P.perStampaRapportino(Object.assign({}, vista, { importi: { tariffa: 45, compensoOre: 135, km: 24, euroKm: 0.76, rimborsoKm: 18.24, spese: 0, totale: 153.24 } }), STUDIO, 'Rossi');
  html = D.rapportino(conImporti.rapportino, conImporti.ana, conImporti.opzioni);
  assert.ok(html.includes('Compenso ore') && html.includes('153,24 €') && html.includes('3 h × 45,00 €'));
});

test('stampa: il preventivo accettato nel portale, con la riga dell\'accettazione e le voci non scelte "non inclusa"', () => {
  const vista = Object.assign({}, PREV, { etichetta: 'PR/2026/012 rev. 1', numero: 'PR/2026/012', revisione: 1, oggetto: 'Adeguamento impianto elettrico capannone', data: '2026-10-15',
    scadenza: '2026-10-28', stato: 'accettato', statoVisto: 'Accettato', complessita: 'media', oneriPrevisti: 'Pratiche', condizioni: 'Condizioni di esempio',
    studio: { titoli: "Perito industriale, iscritto all'albo di Vicenza", polizza: 'Compagnia Esempio · polizza 123456 · massimale 1.000.000 €' },
    sezioni: [PREV.sezioni[0], { titolo: 'Cantiere', voci: PREV.sezioni[1].voci.map(v => Object.assign({}, v, { scelta: v.id === 16 })) }],
    conti: { eppiPercentuale: 5, ivaPercentuale: 22, totale: 0 }, scadenzePagamento: [{ descrizione: '30% alla firma', importo: 1005 }],
    accettazione: { il: '2026-10-22T10:07:00', da: 'Roberto Ferretti', modo: 'portale', firma: { chiave: 'k' } } });
  const d = P.perStampaPreventivo(vista, STUDIO, 'Rossi Impianti Srl', { 14: true }, null);
  assert.deepEqual(d.opzioni, {}, 'accettato: valgono le scelte salvate, non quelle della pagina');
  const html = D.preventivo(d.preventivo, d.ana, d.opzioni);
  for (const pezzo of ['PR/2026/012 rev. 1', 'Rossi Impianti Srl', 'Accettato nel portale da Roberto Ferretti il 22/10/2026 alle 10:07', 'non inclusa',
    'Collaudo con laboratorio esterno', 'Perito industriale', 'Compagnia Esempio', '30% alla firma', '1.005,00 €', 'Media']) {
    assert.ok(html.includes(pezzo), 'manca: ' + pezzo);
  }
  assert.ok(!/undefined|NaN/.test(html));
  // Da accettare: il conto della stampa segue le scelte del cliente sulla pagina.
  const aperto = Object.assign({}, vista, { stato: 'da_accettare', accettazione: null, sezioni: [PREV.sezioni[0], PREV.sezioni[1]] });
  const d2 = P.perStampaPreventivo(aperto, STUDIO, 'Rossi', { 14: true, 15: false, 16: true }, [{ descrizione: 'Alla firma', importo: 10 }]);
  const html2 = D.preventivo(d2.preventivo, d2.ana, d2.opzioni);
  assert.ok(!html2.includes('Accettato nel portale'));
  assert.ok(html2.includes('facoltativa, compresa'), 'la DiRi scelta dal cliente è nel conto');
  assert.ok(html2.includes('Alla firma'));
});

// ------------------------------------------------------------------------------------------------------- sicurezza dei file

/** Netlify: blocchi "percorso" con le righe rientrate "Nome: valore". */
function intestazioni(testo) {
  const out = {};
  let c = null;
  testo.split(/\r?\n/).forEach(r => {
    if (!r.trim()) return;
    if (!/^\s/.test(r)) { c = r.trim(); out[c] = {}; return; }
    const i = r.indexOf(':');
    out[c][r.slice(0, i).trim()] = r.slice(i + 1).trim();
  });
  return out;
}

test('_headers: esattamente le intestazioni di §0.4', () => {
  const h = intestazioni(leggi('portale/_headers'));
  assert.deepEqual(h['/*'], {
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src https://script.google.com https://script.googleusercontent.com; form-action 'none'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  assert.deepEqual(h['/index.html'], { 'Cache-Control': 'no-cache' });
  assert.deepEqual(h['/config.js'], { 'Cache-Control': 'no-cache' });
  assert.deepEqual(h['/'], { 'Cache-Control': 'no-cache' });
  assert.deepEqual(Object.keys(h).sort(), ['/', '/*', '/config.js', '/index.html']);
});

test('pagina: nessuno script in linea, nessuna risorsa esterna, il segno del portale, niente HTML dai dati', () => {
  const html = leggi('portale/index.html');
  assert.ok(html.includes('<meta name="wisper-portale" content="1">'), 'il controllo di §0.5 cerca questo meta');
  const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(script.map(m => (m[1].match(/src="([^"]+)"/) || [])[1]), ['config.js', 'conti.js', 'documenti.js', 'portale.js']);
  assert.ok(script.every(m => !m[2].trim()), 'nessuno script in linea');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'nessun gestore in linea');
  assert.ok(!/style\s*=/.test(html), 'nessuno stile in linea nella pagina');
  assert.ok(html.includes('Per usare il portale serve JavaScript acceso'));
  const tutti = ['portale/index.html', 'portale/portale.css', 'portale/portale.js', 'pc/ui/documenti.js', 'pc/ui/conti.js'];
  for (const f of tutti) {
    const t = leggi(f);
    const esterni = [...t.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"')]*/gi)].map(m => m[0]).filter(u => !/^https?:\/\/www\.w3\.org\/2000\/svg/.test(u) && !/^\/\/ /.test(u));
    assert.deepEqual(esterni.filter(u => /^https?:/.test(u) || /^\/\/[a-z]/.test(u)), [], f + ': risorse esterne');
    assert.ok(!/@import|fonts\.googleapis|fonts\.gstatic/.test(t), f);
  }
  const js = leggi('portale/portale.js');
  assert.ok(!/\.innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setTimeout\(\s*['"]/.test(js), 'mai HTML dai dati, mai codice da testo');
  assert.ok(!/localStorage\.setItem\(\s*['"]wisper\.(sessione|pre)/.test(js), 'la sessione mai in localStorage');
  assert.ok(/sessionStorage/.test(js) && /history\.replaceState/.test(js));
  assert.ok(/sandbox: 'allow-same-origin allow-modals'/.test(js), 'la stampa in un iframe senza script');
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
  for (const f of ['portale/index.html', 'portale/portale.css', 'portale/portale.js']) assert.ok(!emoji.test(leggi(f)), f + ': niente emoji');
  // Niente punti esclamativi nei testi: nelle stringhe tra apici del portale.
  const stringhe = [...js.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)].map(m => m[1] || m[2] || '').filter(s => /[a-zà-ù] /i.test(s));
  assert.deepEqual(stringhe.filter(s => /!(\s|$)/.test(s)), []);
});

test('config: l\'esempio non ha indirizzi veri; config.js non sta nel repository', () => {
  const es = leggi('portale/config.esempio.js');
  assert.ok(es.includes('ESEMPIO'));
  assert.ok(!fs.existsSync(path.join(RADICE, 'portale', 'config.js')));
  assert.ok(leggi('.gitignore').split(/\r?\n/).includes('/portale/config.js'));
});

test('prepara-portale: la cartella pronta per Netlify, solo con lo script di Google', () => {
  const pp = path.join(RADICE, 'strumenti', 'prepara-portale.js');
  const { controllaScript } = require(pp);
  assert.equal(controllaScript('https://script.google.com/macros/s/AKfycbxESEMPIO1234567890/exec'), '');
  for (const s of ['', 'http://script.google.com/macros/s/AKfycbxESEMPIO1234567890/exec', 'https://evil.example/macros/s/AKfycbx/exec',
    'https://script.google.com/macros/s/AKfycbxESEMPIO1234567890/exec?x=1', 'https://script.google.com/macros/s/corto/exec', 'https://script.google.com/a/b']) {
    assert.notEqual(controllaScript(s), '', s);
  }
  const uscita = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-prepara-'));
  const dest = path.join(uscita, 'portale');
  execFileSync(process.execPath, [pp, '--script', 'https://script.google.com/macros/s/AKfycbxESEMPIO1234567890/exec', '--uscita', dest]);
  const file = fs.readdirSync(dest).sort();
  assert.deepEqual(file, ['_headers', 'config.js', 'conti.js', 'documenti.js', 'font', 'index.html', 'portale.css', 'portale.js']);
  assert.deepEqual(fs.readdirSync(path.join(dest, 'font')).sort(), ['Figtree.ttf', 'figtree-OFL.txt']);
  assert.equal(fs.readFileSync(path.join(dest, 'documenti.js'), 'utf8'), leggi('pc/ui/documenti.js'), 'lo stesso documenti.js delle app');
  assert.match(fs.readFileSync(path.join(dest, 'config.js'), 'utf8'), /window\.WISPER_PORTALE = \{ script: "https:\/\/script\.google\.com\/macros\/s\/AKfycbxESEMPIO1234567890\/exec" \};/);
  // Rifatta nella stessa cartella va bene; con un file estraneo dentro no (Netlify lo pubblicherebbe).
  execFileSync(process.execPath, [pp, '--script', 'https://script.google.com/macros/s/AKfycbxESEMPIO1234567890/exec', '--uscita', dest]);
  fs.writeFileSync(path.join(dest, 'appunti.txt'), 'x');
  assert.throws(() => execFileSync(process.execPath, [pp, '--script', 'https://script.google.com/macros/s/AKfycbxESEMPIO1234567890/exec', '--uscita', dest], { stdio: 'pipe' }));
  assert.throws(() => execFileSync(process.execPath, [pp, '--script', 'https://evil.example/x', '--uscita', path.join(uscita, 'altra')], { stdio: 'pipe' }));
  fs.rmSync(uscita, { recursive: true, force: true });
});
