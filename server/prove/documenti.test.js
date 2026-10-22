// Fase 5: i documenti (fase5.md §5). I casi dei collegamenti (casi-collegamenti.json); /carica in byte (49 MB
// passa, 51 MB no e non resta niente su disco, anche senza Content-Length; lo stesso idFile; il doppione per
// SHA-256; il tipo controllato sui primi byte); le revisioni con l'approvazione (approvata, da approvare, respinta col
// motivo, Annulla; la valida che non cambia; il nome "superata" scaricando); chi vede ("costi": il collaboratore non
// lo trova, nemmeno con /file: 403); la ricerca con accenti e piu' parole; la cartella principale; Da Wisper; i
// modelli e i segnaposti; Manda per email e la copia di quello che parte; il link che scade (Non collegato, poi
// collegato sulla seconda porta: revocato e scaduto = 404 "Questo link non vale più"); lo spazio sul NAS.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, postinoFinto, ascolta, chiudi, SEGRETO, PNG } = require('./aiuto');
const { creaServerCondivisione } = require('../src/http');
const { tipoCollegamento } = require('../src/documenti');
const { oggi } = require('../src/utili');
const CASI = require('./casi-collegamenti.json');

let s;
let postino;
let manuel;
let laura;
let marco;
let lettura;
test.before(async () => {
  postino = await postinoFinto();
  s = await serverDiProva({ env: { WISPER_POSTINO_URL: postino.url, WISPER_POSTINO_SEGRETO: SEGRETO } });
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
});
test.after(async () => { await s.ferma(); await postino.ferma(); });

const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const MB = 1024 * 1024;
const PDF = testo => Buffer.from('%PDF-1.4\n% ' + testo + '\n%%EOF\n');

/** POST /carica con i byte nel corpo (Buffer, o uno stream senza Content-Length). */
async function carica(chi, dati, q) {
  const parametri = new URLSearchParams(Object.assign({ nome: 'file.pdf', mime: 'application/pdf', per: 'documento' }, q || {})).toString();
  const corpo = typeof dati === 'function' ? { body: dati(), duplex: 'half' } : { body: dati };
  const r = await fetch(s.url + '/carica?' + parametri, Object.assign({ method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, chi ? { Authorization: 'Bearer ' + chi.token } : {}) }, corpo));
  assert.equal(r.status, 200);
  return r.json();
}
const categoria = async nome => ok(await manuel('categorieDocumenti')).categorie.find(c => c.nome === nome).id;
const restiSuDisco = () => fs.readdirSync(path.join(s.dati, 'file')).filter(f => f.endsWith('.scrivendo'));

// ------------------------------------------------------------------ collegamenti

test('casi-collegamenti.json: il tipo dall\'indirizzo, la cartella proposta, i rifiutati', () => {
  assert.ok(CASI.casi.length >= 15);
  for (const c of CASI.casi) {
    const r = tipoCollegamento(c.url);
    assert.deepEqual({ tipo: r.tipo, cartella: r.cartella, pillola: r.pillola, url: r.url }, { tipo: c.tipo, cartella: c.cartella, pillola: c.pillola, url: c.salvato || c.url }, c.nome);
  }
  for (const c of CASI.rifiutati) assert.throws(() => tipoCollegamento(c.url), e => e.message === CASI.frase, c.nome);
});

// ------------------------------------------------------------------ /carica

test('/carica: 49 MB passano, 51 MB no (anche senza Content-Length) e non resta niente su disco', async () => {
  const grande = Buffer.alloc(49 * MB, 0x20);
  PDF('grande').copy(grande);
  const r = await carica(manuel, grande, { nome: 'Rilievo laser capannone.pdf', idFile: 'grande-49' });
  assert.equal(r.ok, true, r.errore);
  assert.deepEqual([r.file.byte, r.file.mime, r.file.nome], [49 * MB, 'application/pdf', 'Rilievo laser capannone.pdf']);
  assert.match(r.file.sha256, /^[0-9a-f]{64}$/);
  const troppo = Buffer.alloc(51 * MB, 0x20);
  PDF('troppo').copy(troppo);
  const prima = fs.readdirSync(path.join(s.dati, 'file')).length;
  const no = await carica(manuel, troppo, { nome: 'Troppo.pdf' });
  assert.deepEqual(no, { ok: false, errore: 'Il file è più grande di 50 MB: non si carica' });
  // Senza Content-Length (a pezzi): si ferma a meta' e toglie quello che aveva scritto.
  const aPezzi = () => new ReadableStream({
    start(c) { for (let i = 0; i < 51; i++) c.enqueue(i === 0 ? Buffer.concat([PDF('pezzi'), Buffer.alloc(MB - 30, 0x20)]) : Buffer.alloc(MB, 0x20)); c.close(); },
  });
  const no2 = await carica(manuel, aPezzi, { nome: 'Troppo a pezzi.pdf' });
  assert.deepEqual(no2, { ok: false, errore: 'Il file è più grande di 50 MB: non si carica' });
  assert.deepEqual(restiSuDisco(), []);
  assert.equal(fs.readdirSync(path.join(s.dati, 'file')).length, prima, 'nessun file nuovo');
});

test('/carica: lo stesso idFile restituisce lo stesso file; il doppione per SHA-256; il tipo dai primi byte; accesso e permessi', async () => {
  const a = await carica(manuel, PDF('uno'), { nome: 'Uno.pdf', idFile: 'coda-1' });
  const b = await carica(manuel, PDF('uno'), { nome: 'Uno.pdf', idFile: 'coda-1' });
  assert.equal(b.file.id, a.file.id, 'la coda che ripete');
  // Lo stesso contenuto gia' revisione di un documento: "gia'".
  const doc = ok(await manuel('salvaDocumento', { documento: { titolo: 'Documento uno', idCategoria: await categoria('Corrispondenza'), origine: 'file', idFile: a.file.id } })).documento;
  const c = await carica(manuel, PDF('uno'), { nome: 'Uno di nuovo.pdf', idFile: 'coda-2' });
  assert.notEqual(c.file.id, a.file.id);
  assert.deepEqual(c.gia, { idDocumento: doc.id, titolo: 'Documento uno', revisione: 0 });
  // Il tipo: un PDF che non lo e', un programma, una pagina web.
  assert.equal((await carica(manuel, Buffer.from('non sono un pdf'), { mime: 'application/pdf' })).errore, 'Il file dice di essere un PDF ma dentro non lo è: controlla di aver scelto il file giusto');
  assert.equal((await carica(manuel, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), { nome: 'virus.exe', mime: 'application/octet-stream' })).errore, 'Questo file non si carica: è un programma per Windows: i programmi non si caricano');
  assert.equal((await carica(manuel, Buffer.from('<!DOCTYPE html><html><script>x</script>'), { nome: 'pagina.html', mime: 'text/html' })).errore, 'Questo file non si carica: è una pagina web: per una pagina web si incolla il collegamento');
  assert.equal((await carica(manuel, PNG, { nome: 'foto.jpg', mime: 'image/jpeg' })).file.mime, 'image/png', 'il tipo vero dai primi byte');
  // Accesso e permessi: come /exec.
  assert.deepEqual(await carica(null, PDF('x')), { ok: false, errore: 'Accesso scaduto: entra di nuovo', accesso: false });
  const m = await carica(marco, PDF('x'), { per: 'documento' });
  assert.deepEqual([m.ok, m.permesso], [false, false], 'il collaboratore non carica documenti');
  assert.equal((await carica(marco, PNG, { per: 'ticket', mime: 'image/png', nome: 'foto.png' })).ok, true, 'le foto dei ticket si');
  assert.equal((await carica(lettura, PDF('x'))).permesso, false);
  // Il file caricato e non legato: lo vede solo chi l'ha caricato, e lo lega solo lui.
  assert.equal((await manuel.file(c.file.id)).status, 200);
  assert.equal((await laura.file(c.file.id)).status, 403);
  assert.equal((await laura('salvaDocumento', { documento: { titolo: 'X', idCategoria: await categoria('Corrispondenza'), origine: 'file', idFile: c.file.id } })).errore, 'File ' + c.file.id + ' non trovato: caricalo di nuovo');
  // Dopo 24 ore senza legame va nel cestino.
  s.wisper.db.esegui('UPDATE file SET creato = ? WHERE id = ?', '2026-01-01T10:00:00+01:00', c.file.id);
  assert.ok(s.wisper.pulisciCaricati() >= 1);
  assert.ok(s.wisper.db.riga('SELECT cestinato FROM file WHERE id = ?', c.file.id).cestinato);
});

// ------------------------------------------------------------------ revisioni e approvazione

test('revisioni: rev. 0 -> 1 -> 2; approvata da chi approva, da approvare da chi non approva, respinta col motivo, Annulla', async () => {
  const progetti = await categoria('Progetti e schemi');
  const f0 = (await carica(manuel, PDF('quadro rev0'), { nome: 'Quadro rev0.pdf' })).file;
  const d0 = ok(await manuel('salvaDocumento', { documento: { titolo: 'Schema del quadro di prova', idCategoria: progetti, idCommessa: '26ST002', idFile: f0.id } }));
  const doc = d0.documento;
  assert.deepEqual([doc.revisione, doc.statoVisto, doc.idCliente, doc.cliente, doc.origine, doc.vede], [0, 'Valida', 'C002', 'Rossi Impianti Srl', 'file', 'tutti'], 'chi approva: nasce approvata; il cliente dalla commessa');
  assert.equal(d0.chiudeScadenza, null);
  // La rev. 1 vuole la nota.
  const f1 = (await carica(manuel, PDF('quadro rev1'), { nome: 'Quadro rev1.pdf' })).file;
  assert.equal((await manuel('caricaVersione', { id: doc.id, idFile: f1.id })).errore, 'Scrivi cosa cambia in questa revisione');
  const d1 = ok(await manuel('caricaVersione', { id: doc.id, idFile: f1.id, nota: 'Aggiunte le protezioni' })).documento;
  assert.deepEqual([d1.revisione, d1.versioni.map(v => v.statoVisto)], [1, ['Valida', 'Superata']]);
  assert.equal(d1.versioni[1].nomeDaScaricare, 'Quadro rev0 (rev. 0, superata).pdf');
  const superata = await manuel.file(f0.id);
  assert.equal(superata.status, 200);
  assert.match(decodeURIComponent(superata.headers.get('content-disposition')), /Quadro rev0 \(rev\. 0, superata\)\.pdf$/);
  // Un collaboratore con documenti 2 su un suo documento: la sua revisione nella categoria con approvazione va da approvare.
  ok(await manuel('salvaPermessi', { permessi: { collaboratore: { documenti: 2 } } }));
  try {
    const fm = (await carica(marco, PDF('suo rev0'), { nome: 'Suo rev0.pdf' })).file;
    const suo = ok(await marco('salvaDocumento', { documento: { titolo: 'Rilievo di Marco', idCategoria: progetti, idCommessa: '26ST001', idFile: fm.id } })).documento;
    assert.deepEqual([suo.statoVisto, suo.daApprovare, suo.revisione], ['Da approvare', 0, 0], 'senza nessuna approvata si apre la sua unica revisione');
    assert.equal((await marco('caricaVersione', { id: doc.id, idFile: (await carica(marco, PDF('altro'), { nome: 'x.pdf' })).file.id, nota: 'x' })).permesso, false, 'solo i documenti creati da lui');
    const ok2 = ok(await manuel('approvaVersione', { id: ok(await manuel('documento', { id: suo.id })).documento.versioni[0].id })).documento;
    assert.deepEqual([ok2.statoVisto, ok2.daApprovare], ['Valida', null]);
    const fm1 = (await carica(marco, PDF('suo rev1'), { nome: 'Suo rev1.pdf' })).file;
    const att = ok(await marco('caricaVersione', { id: suo.id, idFile: fm1.id, nota: 'Corrette le quote' })).documento;
    assert.deepEqual([att.statoVisto, att.revisione, att.daApprovare], ['Valida', 0, 1], 'la nuova non sostituisce la valida finche\' non e\' approvata');
    assert.equal(att.versioni[0].statoVisto, 'Da approvare');
    assert.equal(att.versioni[0].puoTogliere, true);
    const versione = att.versioni[0].id;
    assert.equal((await marco('approvaVersione', { id: versione })).permesso, false, 'il collaboratore non approva');
    assert.equal((await manuel('respingiVersione', { id: versione })).errore, 'Scrivi il motivo: arriva a chi l\'ha caricata');
    const resp = ok(await manuel('respingiVersione', { id: versione, motivo: 'Manca il cartiglio' })).documento;
    assert.deepEqual([resp.versioni[0].statoVisto, resp.versioni[0].motivoRifiuto, resp.revisione], ['Respinta', 'Manca il cartiglio', 0]);
    const d = ok(await marco('dashboard'));
    assert.ok(d.urgenti.some(v => v.titolo === 'Rilievo di Marco rev. 1 respinta' && v.dettaglio === 'Motivo: Manca il cartiglio · Manuel Gasparotto'));
    assert.equal(ok(await manuel('annullaDecisione', { id: versione })).documento.versioni[0].statoVisto, 'Da approvare', 'Annulla dell\'avviso');
    assert.ok(ok(await manuel('dashboard')).settimana.some(v => v.tipo === 'documento' && /documenti? da approvare$/.test(v.titolo)));
    const appr = ok(await manuel('approvaVersione', { id: versione })).documento;
    assert.deepEqual([appr.revisione, appr.statoVisto], [1, 'Valida']);
    assert.equal((await manuel('approvaVersione', { id: versione })).errore, 'La rev. 1 è già approvata');
    assert.equal((await marco('togliVersione', { id: versione })).errore, 'Una revisione approvata non si toglie: carica una revisione nuova');
    assert.ok(appr.cronologia.some(e => e.testo === 'rev. 1 caricata da Marco Collaboratore'));
    assert.ok(appr.cronologia.some(e => e.testo === 'rev. 1 respinta da Manuel Gasparotto: Manca il cartiglio'));
    assert.ok(appr.cronologia.some(e => e.testo === 'rev. 1 approvata da Manuel Gasparotto'));
  } finally {
    ok(await manuel('salvaPermessi', { permessi: { collaboratore: { documenti: 1 } } }));
  }
  // I dati di esempio: lo schema della cabina con la rev. 3 da approvare.
  const elenco = ok(await manuel('documenti', { archivio: true, stato: 'da_approvare' }));
  const schema = elenco.documenti.find(x => x.titolo === 'Schema unifilare cabina MT');
  assert.deepEqual([schema.revisione, schema.statoVisto, schema.daApprovare, schema.impianto], [2, 'Valida', 3, 'Cabina MT Acme']);
});

// ------------------------------------------------------------------ chi vede

test('chi vede: un documento "costi" il collaboratore non lo trova (nemmeno con /file: 403); lettura si', async () => {
  const contratto = ok(await manuel('documenti', { archivio: true, testo: 'contratto firmato' })).documenti[0];
  assert.deepEqual([contratto.titolo, contratto.vede], ['Contratto CA/2026/002 firmato', 'costi']);
  assert.equal(ok(await marco('documenti', { archivio: true, testo: 'contratto firmato' })).quanti, 0);
  assert.equal((await marco('documento', { id: contratto.id })).errore, 'Documento ' + contratto.id + ' non trovato');
  const id = contratto.url.slice(6);
  assert.equal((await marco.file(id)).status, 403);
  assert.equal((await lettura.file(id)).status, 200, 'lettura ha costi 1');
  assert.equal(ok(await lettura('documento', { id: contratto.id })).documento.puoScrivere, false);
  assert.equal((await lettura('salvaDocumento', { documento: { id: contratto.id, titolo: 'X' } })).permesso, false);
  // Il collaboratore legge l'archivio e scarica, non carica.
  const d = ok(await marco('documenti', { archivio: true }));
  assert.ok(d.documenti.length > 5);
  assert.ok(d.documenti.every(x => x.vede === 'tutti'));
  assert.equal((await marco('salvaDocumento', { documento: { titolo: 'X', idCategoria: 1, url: 'https://www.esempio.example' } })).permesso, false);
});

// ------------------------------------------------------------------ collegamenti, cartella, ricerca, Da Wisper

test('collegamenti: il tipo, la cartella principale (una sola), le righe della pagina; ricerca e Da Wisper', async () => {
  const cat = await categoria('Documenti dello studio');
  const od = ok(await manuel('salvaDocumento', { documento: { titolo: 'Cartella di Batokyo', idCategoria: cat, idCliente: 'C004', url: 'https://esempio-my.sharepoint.com/:f:/g/personal/studio/Clienti/Batokyo  ', principale: true } })).documento;
  assert.deepEqual([od.origine, od.collegamentoTipo, od.collegamentoNome, od.cartella, od.principale, od.statoVisto, od.url],
    ['collegamento', 'onedrive', 'OneDrive', true, true, 'Collegamento', 'https://esempio-my.sharepoint.com/:f:/g/personal/studio/Clienti/Batokyo']);
  assert.deepEqual(od.righe, ['Le revisioni le tiene OneDrive']);
  const doppia = await manuel('salvaDocumento', { documento: { titolo: 'Altra', idCategoria: cat, idCommessa: '26ST003', url: 'https://drive.google.com/drive/folders/1Xyz', principale: true } });
  assert.equal(doppia.errore, 'La commessa 26ST003 ha già la sua cartella: «Cartella della commessa 26ST003»');
  assert.equal((await manuel('salvaDocumento', { documento: { titolo: 'X', idCategoria: cat, url: 'http://non.sicuro' } })).errore, CASI.frase);
  assert.equal((await manuel('salvaDocumento', { documento: { titolo: 'X', idCategoria: cat } })).errore, 'Carica il file o incolla il collegamento');
  assert.equal((await manuel('salvaDocumento', { documento: { idCategoria: cat, url: 'https://x.example' } })).errore, 'Titolo: scrivi di cosa si tratta');
  assert.equal((await manuel('salvaDocumento', { documento: { titolo: 'X', url: 'https://x.example' } })).errore, 'Categoria: scegli la categoria');
  assert.equal((await manuel('salvaDocumento', { documento: { titolo: 'X', idCategoria: cat, idSede: 4, idCliente: 'C004', url: 'https://x.example' } })).errore, 'L\'impianto 4 è di Rossi Impianti Srl, non di Batokyo Srl');
  const percorso = ok(await manuel('documenti', { archivio: true, testo: 'archivio 2019' })).documenti[0];
  assert.deepEqual([percorso.collegamentoTipo, percorso.cartella], ['percorso', true]);
  assert.deepEqual(ok(await manuel('documento', { id: percorso.id })).documento.righe, ['Si apre dal computer dello studio']);
  // Cambiare l'indirizzo e' un salvataggio, nel registro.
  ok(await manuel('salvaDocumento', { documento: { id: od.id, url: 'https://esempio-my.sharepoint.com/:f:/g/personal/studio/Clienti/Batokyo-2' } }));
  assert.ok(ok(await manuel('documento', { id: od.id })).documento.cronologia.some(e => e.testo === 'Collegamento cambiato da Manuel Gasparotto'));
  // La ricerca: senza badare a maiuscole e accenti, tutte le parole; nel nome del cliente, nell'impianto, nel riferimento.
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'CONFORMITA  quadro' })).documenti.some(x => x.titolo === 'Dichiarazione di conformità quadro generale'));
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'dico 7/2019' })).documenti.length >= 1, 'nel riferimento');
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'batokyo verbale' })).documenti.some(x => x.titolo === 'Verbale verifica impianto di terra 2022'), 'cliente e titolo');
  assert.equal(ok(await manuel('documenti', { archivio: true, testo: 'batokyo dico' })).quanti, 0, 'tutte le parole');
  const prima = ok(await manuel('documenti', { archivio: true, testo: 'schema' })).documenti[0];
  assert.match(prima.titolo, /^Schema/, 'prima i titoli che cominciano con la parola');
  // Per impianto, con "Da Wisper"; i conteggi.
  const imp = ok(await manuel('documenti', { archivio: true, idSede: 8 }));
  assert.ok(imp.documenti.some(x => x.collegamentoTipo === 'gdrive'));
  assert.ok(imp.documenti.some(x => x.collegamentoTipo === 'web'));
  const com = ok(await manuel('documenti', { archivio: true, idCommessa: '26ST002' }));
  assert.ok(com.daWisper.some(x => x.tipo === 'preventivo'));
  assert.ok(com.daWisper.some(x => x.tipo === 'rapportino' && x.pagina === 'rapportino'));
  assert.ok(com.daWisper.some(x => x.tipo === 'fattura'), 'le fatture emesse, per chi vede le fatture');
  assert.equal(ok(await marco('documenti', { archivio: true, idCommessa: '26ST002' })).daWisper.some(x => x.tipo === 'fattura'), false);
  const tutti = ok(await manuel('documenti', { archivio: true }));
  for (const k of ['daApprovare', 'inScadenza', 'scaduti', 'daClassificare']) assert.equal(typeof tutti.conteggi[k], 'number', k);
  assert.ok(tutti.conteggi.daClassificare >= 3);
  assert.equal(ok(await manuel('documenti', { archivio: true, daClassificare: true })).quanti, tutti.conteggi.daClassificare);
  assert.ok(ok(await manuel('documenti', { archivio: true, scadenza: 'entro' })).documenti.some(x => x.titolo === 'Certificato di taratura del misuratore di terra'));
  // L'azione di Code.gs con solo idCommessa risponde come prima (cartella e file della commessa).
  const vecchia = ok(await manuel('documenti', { idCommessa: '26ST002' }));
  assert.deepEqual(Object.keys(vecchia).sort(), ['cartella', 'documenti', 'ok']);
  assert.deepEqual(Object.keys(vecchia.documenti[0]).sort(), ['data', 'id', 'mime', 'nome', 'url']);
  assert.ok(vecchia.documenti.some(x => x.nome === 'Offerta materiali quadro.pdf'));
});

test('un documento caricato da un\'app vecchia (caricaFile tipo documento) entra nell\'archivio, Da classificare', async () => {
  const f = ok(await manuel('caricaFile', { tipo: 'documento', idCommessa: '26ST001', nome: 'Verbale vecchio.pdf', mime: 'application/pdf', base64: PDF('vecchio').toString('base64'), idFile: 'vecchio-1' })).file;
  const vecchia = ok(await manuel('documenti', { idCommessa: '26ST001' }));
  assert.equal(vecchia.documenti[0].id, f.id, 'stesso id del file, il piu\' recente prima');
  const nuovo = ok(await manuel('documenti', { archivio: true, idCommessa: '26ST001', testo: 'verbale vecchio' })).documenti[0];
  assert.deepEqual([nuovo.categoria, nuovo.daClassificare, nuovo.url], ['Da classificare', true, '/file/' + f.id]);
  assert.equal(ok(await manuel('caricaFile', { tipo: 'documento', idCommessa: '26ST001', nome: 'Verbale vecchio.pdf', mime: 'application/pdf', base64: PDF('vecchio').toString('base64'), idFile: 'vecchio-1' })).file.id, f.id, 'ripetuto');
});

test('scadenza del documento, verbale che chiude la scadenza, archiviare con la scadenza aperta', async () => {
  const verbali = await categoria('Verbali di verifica');
  const f = (await carica(manuel, PDF('verbale 2027'), { nome: 'Verbale terra 2027.pdf' })).file;
  const r = ok(await manuel('salvaDocumento', { documento: { titolo: 'Verbale verifica impianto di terra 2027', idCategoria: verbali, idSede: 7, idFile: f.id, dataDocumento: '2027-01-10' } }));
  assert.deepEqual([r.chiudeScadenza.titolo, r.chiudeScadenza.data], ['Verifica impianto di terra (DPR 462)', '2027-01-12']);
  const fatta = ok(await manuel('faiScadenza', { id: r.chiudeScadenza.id, data: '2027-01-10', idDocumento: r.documento.id }));
  assert.deepEqual([fatta.scadenza.idDocumentoFatto, fatta.prossima.data, fatta.prossima.idDocumento], [r.documento.id, '2032-01-10', r.documento.id]);
  // Archiviare un documento con la scadenza aperta: prima chiede, poi la toglie o la tiene.
  const cert = ok(await manuel('documenti', { archivio: true, testo: 'taratura' })).documenti[0];
  const chiede = await manuel('archiviaDocumento', { id: cert.id });
  assert.deepEqual([chiede.ok, chiede.serveConferma, chiede.errore], [false, true, 'Ha una scadenza aperta il 15/11/2026: la tolgo?']);
  ok(await manuel('archiviaDocumento', { id: cert.id, togliScadenza: false }));
  assert.equal(ok(await manuel('documenti', { archivio: true, testo: 'taratura' })).quanti, 0);
  assert.equal(ok(await manuel('documenti', { archivio: true, archiviati: true, testo: 'taratura' })).documenti[0].statoVisto, 'Archiviato');
  ok(await manuel('archiviaDocumento', { id: cert.id, archiviato: false }));
});

// ------------------------------------------------------------------ modelli

test('modelli: i modelli di Wisper coi loro testi, i segnaposti, comporre una lettera, il segnaposto sconosciuto', async () => {
  const m = ok(await manuel('modelli'));
  assert.deepEqual(m.wisper.map(x => x.nome), ['Rapportino', 'Riepilogo del mese', 'Preventivo', 'Prospetto per il programma delle fatture', 'Avviso di parcella', 'Lettera', 'Contratto di assistenza']);
  assert.ok(m.wisper.every(x => x.impaginazione === 'fissa'));
  assert.ok(m.studio.some(d => d.titolo === 'Modulo della dichiarazione di conformità'));
  assert.ok(m.segnaposti.includes('ultima_verifica'));
  const lettera = m.wisper.find(x => x.chiave === 'lettera').testi.find(t => t.chiave === 'LETTERA_VERIFICA_TERRA');
  assert.match(lettera.testo, /^Gentile \{cliente\},/);
  const scad = ok(await manuel('scadenze', {})).piuAvanti.concat(ok(await manuel('scadenze', {})).entro).find(x => x.idSede === 7 && x.tipo === 'verifica_terra');
  const c = ok(await manuel('componiModello', { chiave: 'LETTERA_VERIFICA_TERRA', idScadenza: scad.id }));
  assert.equal(c.titolo, 'Verifica periodica dell\'impianto di terra');
  assert.match(c.testo, /^Gentile Batokyo Srl,\nl'impianto di terra di Impianto di terra stabilimento è stato verificato il \d{2}\/\d{2}\/\d{4}: la prossima verifica periodica va fatta entro il /);
  assert.deepEqual(c.mancano, []);
  const senza = ok(await manuel('componiModello', { chiave: 'LETTERA_VERIFICA_TERRA', idCliente: 'C002' }));
  assert.deepEqual(senza.mancano, ['{impianto}', '{ultima_verifica}', '{scadenza}']);
  const contratto = ok(await manuel('componiModello', { chiave: 'CONTRATTO_CONDIZIONI', idContratto: 2 }));
  assert.match(contratto.testo, /Il canone annuo è di 1\.200,00 euro/);
  assert.equal(ok(await marco('componiModello', { chiave: 'CONTRATTO_CONDIZIONI', idContratto: 2 })).mancano.includes('{canone}'), true, 'senza i soldi il canone non si riempie');
  assert.ok((await manuel('salvaTestoModello', { chiave: 'LETTERA_LIBERA', testo: 'Gentile {cleinte}' })).errore.startsWith('Segnaposto sconosciuto: {cleinte}. Si possono usare {cliente}, {indirizzo_cliente}'));
  assert.equal((await laura('salvaTestoModello', { chiave: 'LETTERA_LIBERA', testo: 'x' })).permesso, false, 'amministrazione ha amministrazione 1');
  const salvato = ok(await manuel('salvaTestoModello', { chiave: 'LETTERA_LIBERA', testo: 'Gentile {cliente},\n\nCordiali saluti\n{studio}' }));
  assert.equal(salvato.wisper.find(x => x.chiave === 'lettera').testi.find(t => t.chiave === 'LETTERA_LIBERA').modificatoDa, 'Manuel Gasparotto');
  ok(await manuel('salvaTestoModello', { chiave: 'PREVENTIVO_CONDIZIONI', testo: 'Condizioni nuove' }));
  assert.equal(ok(await manuel('anagrafiche')).impostazioni.PREVENTIVO_CONDIZIONI, 'Condizioni nuove', 'resta un\'impostazione');
});

// ------------------------------------------------------------------ mandare e condividere

test('Manda per email: l\'allegato o il collegamento; la copia dei PDF mandati (Mandati ai clienti)', async () => {
  const dico = ok(await manuel('documenti', { archivio: true, testo: 'dichiarazione conformita' })).documenti[0];
  ok(await manuel('inviaDocumento', { id: dico.id, a: 'ufficio@rossi.example' }));
  const mail = postino.richieste.filter(x => x.azione === 'postinoEmail').pop();
  assert.equal(mail.oggetto, 'Dichiarazione di conformità quadro generale');
  assert.ok(ok(await manuel('documento', { id: dico.id })).documento.cronologia.some(e => e.testo === 'Mandato a ufficio@rossi.example da Manuel Gasparotto'));
  const percorso = ok(await manuel('documenti', { archivio: true, testo: 'archivio 2019' })).documenti[0];
  assert.equal((await manuel('inviaDocumento', { id: percorso.id, a: 'x@y.example' })).errore, 'Un percorso del computer non si può mandare');
  assert.equal((await marco('inviaDocumento', { id: dico.id, a: 'x@y.example' })).permesso, false);
  // inviaEmail dei rapportini: la copia del PDF nell'archivio, legata al cliente.
  const prima = ok(await manuel('documenti', { archivio: true, origine: 'inviato' })).quanti;
  const rap = ok(await manuel('rapportini', { tutti: true })).rapportini.find(r => r.stato === 'FIRMATO' && r.idCliente === 'C002');
  ok(await manuel('inviaEmail', { a: 'rossi@example.com', ids: [rap.id], oggetto: 'Rapportino', allegati: [{ nome: 'Rapportino ' + rap.id.replace(/\//g, '-') + '.pdf', mime: 'application/pdf', base64: PDF('rapportino').toString('base64') }] }));
  const inviati = ok(await manuel('documenti', { archivio: true, origine: 'inviato' }));
  assert.equal(inviati.quanti, prima + 1);
  const copia = ok(await manuel('documento', { id: inviati.documenti[0].id })).documento;
  assert.deepEqual([copia.categoria, copia.idCliente, copia.vede, copia.versioni[0].nota], ['Mandati ai clienti', 'C002', 'costi', 'mandato a rossi@example.com il ' + oggi().split('-').reverse().join('/')]);
  assert.equal(ok(await marco('documenti', { archivio: true, origine: 'inviato' })).quanti, 0, 'le copie mandate: chi vede i prezzi');
});

test('il link che scade: Non collegato; collegato sulla seconda porta (aperture, revoca, scadenza = 404)', async () => {
  const dico = ok(await manuel('documenti', { archivio: true, testo: 'dichiarazione conformita' })).documenti[0];
  assert.deepEqual(await manuel('condividiDocumento', { id: dico.id, perChi: 'Rossi' }), { ok: false, errore: 'I link per i clienti non sono collegati: manda il documento per email', nonCollegato: true });
  assert.equal(ok(await manuel('io')).interfaccia.condivisioneCollegata, false);
  const porta = creaServerCondivisione(s.wisper);
  const base = await ascolta(porta);
  ok(await manuel('salvaImpostazioni', { valori: { CONDIVISIONE_INDIRIZZO: base } }));
  try {
    const r = ok(await manuel('condividiDocumento', { id: dico.id, perChi: 'Rossi Impianti Srl, ufficio tecnico', giorni: 14 }));
    assert.ok(r.link.startsWith(base + '/condiviso/'));
    assert.deepEqual([r.condivisione.perChi, r.condivisione.aperture], ['Rossi Impianti Srl, ufficio tecnico', 0]);
    assert.equal((await manuel('condividiDocumento', { id: dico.id, perChi: 'x', giorni: 91 })).errore, 'Giorni: da 1 a 90');
    const pagina = await fetch(r.link);
    assert.equal(pagina.status, 200);
    const html = await pagina.text();
    assert.ok(html.includes('Studio Tecnico GM') && html.includes('Dichiarazione di conformità quadro generale') && html.includes('Scarica'));
    const file = await fetch(r.link + '/scarica');
    assert.equal(file.status, 200);
    assert.ok(Buffer.from(await file.arrayBuffer()).toString().startsWith('%PDF'));
    assert.equal(ok(await manuel('documento', { id: dico.id })).documento.condivisioni[0].aperture, 1);
    // La porta della condivisione non risponde a nient'altro; quella del server non risponde ai link.
    assert.equal((await fetch(base + '/exec?azione=io')).status, 404);
    assert.equal((await fetch(s.url + '/condiviso/' + r.link.split('/').pop())).status, 404);
    // Revocato: "Questo link non vale più".
    ok(await manuel('revocaCondivisione', { id: r.condivisione.id }));
    const revocato = await fetch(r.link);
    assert.equal(revocato.status, 404);
    assert.ok((await revocato.text()).includes('Questo link non vale più'));
    // Scaduto.
    const r2 = ok(await manuel('condividiDocumento', { id: dico.id, perChi: 'Prova' }));
    s.wisper.db.esegui("UPDATE documento_condivisioni SET scade = '2026-01-01' WHERE id = ?", r2.condivisione.id);
    assert.equal((await fetch(r2.link)).status, 404);
    // Non si salva il token: solo il suo SHA-256; nel registro niente token.
    const token = r2.link.split('/').pop();
    assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM registro WHERE dopo LIKE ?', '%' + token + '%').n, 0);
  } finally {
    ok(await manuel('salvaImpostazioni', { valori: { CONDIVISIONE_INDIRIZZO: '' } }));
    await chiudi(porta);
  }
});

// ------------------------------------------------------------------ categorie, spazio, cestino

test('categorie: le 16 dell\'accordo; una nuova; quelle di sistema si rinominano, non si tolgono', async () => {
  const c = ok(await manuel('categorieDocumenti')).categorie;
  assert.deepEqual(c.slice(0, 3).map(x => [x.nome, x.approvazione, x.vede]), [['Progetti e schemi', true, 'tutti'], ['Dichiarazioni di conformità', true, 'tutti'], ['Dichiarazioni di rispondenza', true, 'tutti']]);
  assert.equal(c.length, 16, 'il titolare vede anche Documenti personali');
  assert.equal(ok(await marco('categorieDocumenti')).categorie.length, 12, 'senza costi e riservati: non Contratti, Polizze e assicurazioni, Mandati ai clienti, Documenti personali');
  const n = ok(await manuel('salvaCategoria', { categoria: { nome: 'Verbali di collaudo', approvazione: true, vede: 'tutti' } })).categoria;
  assert.deepEqual([n.nome, n.approvazione, n.sistema, n.attiva], ['Verbali di collaudo', true, false, true]);
  const dc = c.find(x => x.nome === 'Da classificare');
  assert.equal((await manuel('salvaCategoria', { categoria: { id: dc.id, attiva: false } })).errore, '«Da classificare» serve a Wisper: si rinomina, non si toglie');
  assert.equal((await laura('salvaCategoria', { categoria: { nome: 'X' } })).permesso, false);
});

test('spazio sul NAS: disco quasi pieno (finto) = niente documenti nuovi, foto del rapportino si; sotto 200 MB niente', async () => {
  const w = s.wisper;
  w.spazioFintoMb = 1600;
  try {
    const no = await carica(manuel, PDF('pieno'), { nome: 'Pieno.pdf' });
    assert.deepEqual(no, { ok: false, errore: 'Il disco del NAS è quasi pieno (restano 1,6 GB): il file non è stato caricato. Avvisa il titolare', spazio: true });
    const vecchio = await manuel('caricaFile', { tipo: 'documento', idCommessa: '26ST001', nome: 'x.pdf', mime: 'application/pdf', base64: PDF('x').toString('base64') });
    assert.equal(vecchio.spazio, true, 'anche dalle app vecchie');
    const r = ok(await manuel('salvaRapportino', { rapportino: { idLocale: 'spazio-1', idCliente: 'C002', data: oggi(), tariffa: 42, oreLavoro: 1 } })).rapportino;
    ok(await manuel('caricaFile', { tipo: 'spesa', id: r.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'spazio-foto' }));
    const d = ok(await manuel('dashboard'));
    assert.ok(d.urgenti.some(v => v.tipo === 'spazio' && v.titolo === 'Il disco del NAS è quasi pieno: restano 1,6 GB'));
    assert.deepEqual(d.numeri.spazio, { liberoMb: 1600, avviso: true });
    assert.equal('spazio' in ok(await marco('dashboard')).numeri, false);
    w.spazioFintoMb = 150;
    const foto = await manuel('caricaFile', { tipo: 'spesa', id: r.id, base64: PNG.toString('base64'), mime: 'image/png', idFile: 'spazio-foto-2' });
    assert.equal(foto.spazio, true, 'sotto 200 MB nessun file');
  } finally {
    w.spazioFintoMb = undefined;
  }
  const sp = ok(await manuel('spazio'));
  for (const k of ['totaleMb', 'liberoMb', 'avvisoMb', 'minimoMb']) assert.equal(typeof sp.disco[k], 'number', k);
  assert.deepEqual(sp.perTipo.slice(0, 4).map(x => x.nome), ['Documenti', 'Foto e firme dei rapportini', 'Foto dei ticket', 'Mandati ai clienti']);
  assert.ok(sp.piuGrandi[0].mb >= 49, 'il file da 49 MB caricato prima');
  assert.equal(sp.piuGrandi[0].fuori, 'troppo grande');
  assert.equal((await marco('spazio')).permesso, false);
});

test('svuota il cestino: solo il titolare, solo i file nel cestino da più di 90 giorni, con la conferma', async () => {
  const w = s.wisper;
  const f = (await carica(manuel, PDF('vecchio cestino'), { nome: 'Vecchio.pdf' })).file;
  w.db.esegui("UPDATE file SET cestinato = '2026-01-10T10:00:00+01:00' WHERE id = ?", f.id);
  const g = (await carica(manuel, PDF('cestino recente'), { nome: 'Recente.pdf' })).file;
  w.db.esegui('UPDATE file SET cestinato = ? WHERE id = ?', new Date().toISOString(), g.id);
  assert.equal((await laura('svuotaCestino', { conferma: true })).permesso, false, 'amministrazione no');
  const chiede = await manuel('svuotaCestino', {});
  assert.equal(chiede.serveConferma, true);
  assert.match(chiede.errore, /^Tolgo per sempre \d+ file \([\d,]+ (MB|GB)\) messi nel cestino prima del \d{2}\/\d{2}: non si potranno più recuperare$/);
  const fatto = ok(await manuel('svuotaCestino', { conferma: true }));
  assert.ok(fatto.tolti >= 1);
  assert.equal(fs.existsSync(path.join(s.dati, 'file', f.id)), false);
  assert.equal(fs.existsSync(path.join(s.dati, 'file', g.id)), true, 'quello recente resta');
  assert.equal(ok(await manuel('cestino')).file.some(x => x.id === f.id), false);
  assert.equal((await manuel('ripristinaFile', { id: f.id })).errore, 'Il file ' + f.id + ' è stato tolto per sempre col cestino svuotato');
  assert.ok(ok(await manuel('registro', { tabella: 'file' })).righe.some(r => /^cestino svuotato: \d+ file$/.test(r.nota)));
});

test('esporta documenti: le colonne dell\'accordo', async () => {
  const csv = Buffer.from(ok(await manuel('esporta', { cosa: 'documenti' })).base64, 'base64').toString('utf8');
  assert.equal(csv.split('\r\n')[0], '\ufeffTitolo;Categoria;Cliente;Commessa;Impianto;Ticket;Origine;Tipo di collegamento;Indirizzo;Revisione valida;Stato;Riferimento;Data del documento;Scadenza;Caricato da;Modificato');
  assert.ok(csv.includes('Schema unifilare cabina MT'));
  assert.equal(Buffer.from(ok(await marco('esporta', { cosa: 'documenti' })).base64, 'base64').toString('utf8').includes('Contratto CA/2026/002 firmato'), false);
});
