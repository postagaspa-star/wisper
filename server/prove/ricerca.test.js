// Fase 8 (fase8.md §6, §16): cercare dentro i file. I file finti di server/prove/file-testo/ (un PDF fatto da Word, uno
// da LibreOffice con ToUnicode, una scansione, un DOCX, un XLSX, un DXF, un DOC vecchio) con gli stati giusti; "perche"
// trova "perché"; la sintassi di FTS nelle parole non rompe niente; un documento che la persona non vede non da' ne'
// risultato ne' estratto; i documenti riservati non si leggono; senza FTS5 Errore e ricerca sui titoli.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const { leggiTesto } = require('../src/lettura');
const { terminiFts } = require('../src/azioni/ricerca');

giornoDeiPrototipi();

const CARTELLA = path.join(__dirname, 'file-testo');
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let w;
let manuel;
const doc = {};
const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dxf: 'application/dxf', doc: 'application/msword' };

/** Un documento col file dato, come il titolare (salvaDocumento coi suoi permessi). */
function documento(titolo, nome, x) {
  const b = Buffer.isBuffer(nome) ? nome : fs.readFileSync(path.join(CARTELLA, nome));
  const nomeFile = Buffer.isBuffer(nome) ? titolo + '.pdf' : nome;
  return w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, () => w.db.transazione(() => {
    const f = w.salvaFile({ dati: b, nome: nomeFile, mime: MIME[nomeFile.split('.').pop()] || 'application/octet-stream', tipo: 'caricato' });
    w.db.esegui('UPDATE file SET caricato_da = ? WHERE id = ?', w.titolare().id, f.id);
    const cat = w.db.riga("SELECT id FROM documento_categorie WHERE nome = 'Da classificare'").id;
    return w.salvaDocumento({ documento: Object.assign({ titolo, idCategoria: cat, origine: 'file', idFile: f.id }, x || {}) }).documento;
  }));
}

test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  manuel = await s.come('manuel@esempio.it');
  for (const nome of fs.readdirSync(CARTELLA).filter(f => !f.endsWith('.js'))) doc[nome] = documento('Prova ' + nome, nome);
  await w.attendiLetture();
});
test.after(() => s.ferma());

test('i file finti si leggono senza librerie: PDF di Word e di LibreOffice, DOCX, XLSX, DXF; la scansione e il DOC vecchio senza testo', () => {
  const stato = n => leggiTesto(fs.readFileSync(path.join(CARTELLA, n)), n, MIME[n.split('.').pop()]);
  const word = stato('verbale-word.pdf');
  assert.equal(word.stato, 'letto');
  assert.match(word.testo, /La verifica dell'impianto di terra è stata eseguita il 12\/03\/2026 con/);
  const lo = stato('relazione-libreoffice.pdf');
  assert.equal(lo.stato, 'letto');
  assert.match(lo.testo, /selettività verso valle\. Più avanti/, 'la tabella ToUnicode (bfchar e bfrange) coi caratteri accentati');
  assert.equal(stato('scansione.pdf').stato, 'senza_testo');
  assert.match(stato('capitolato.docx').testo, /Impianto di illuminazione di emergenza del capannone\./, 'i pezzi di un paragrafo insieme');
  assert.match(stato('capitolato.docx').testo, /Studio Tecnico di esempio · Commessa 26ST002/, 'anche l\'intestazione');
  const xl = stato('computo.xlsx');
  assert.match(xl.testo, /Computo metrico\nCavi & sezioni/, 'i nomi dei fogli');
  assert.match(xl.testo, /Cavo FG16OR16 5G10/, 'le stringhe condivise');
  assert.match(xl.testo, /Sezionatore sottocarico/, 'le stringhe in linea');
  const dxf = stato('schema.dxf');
  assert.match(dxf.testo, /^QUADRO GENERALE QG1\nLinea di alimentazione dal trasformatore\n/, 'TEXT e MTEXT senza i comandi di formato');
  assert.doesNotMatch(dxf.testo, /\\P|\\f|[{}]/);
  assert.equal(stato('vecchio.doc').stato, 'senza_testo');
  // Un PDF col testo illeggibile (poche parole o simboli): "non si legge".
  const pochi = leggiTesto(require('../src/prova').pdfConTesto(['@@ ## %%']), 'x.pdf', 'application/pdf');
  assert.equal(pochi.stato, 'non_si_legge');
});

test('dopo il caricamento i file si leggono da soli (in sottofondo); letturaFile e la riga della pagina del documento', async () => {
  const st = n => w.db.riga('SELECT * FROM file_lettura WHERE file_id = (SELECT file_id FROM documento_versioni WHERE documento_id = ?)', doc[n].id);
  assert.deepEqual(['verbale-word.pdf', 'relazione-libreoffice.pdf', 'capitolato.docx', 'computo.xlsx', 'schema.dxf'].map(n => st(n).stato), ['letto', 'letto', 'letto', 'letto', 'letto']);
  assert.deepEqual(['scansione.pdf', 'vecchio.doc'].map(n => st(n).stato), ['senza_testo', 'senza_testo']);
  const idFile = w.db.riga('SELECT file_id FROM documento_versioni WHERE documento_id = ?', doc['verbale-word.pdf'].id).file_id;
  const l = ok(await manuel('letturaFile', { idFile }));
  assert.equal(l.stato, 'letto');
  assert.equal(l.pagine, 1);
  assert.ok(l.caratteri > 200);
  assert.match(l.letto, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  const pagina = ok(await manuel('documento', { id: doc['verbale-word.pdf'].id })).documento;
  assert.equal(pagina.lettura.stato, 'letto');
  assert.equal(pagina.lettura.pagine, 1);
});

test('la ricerca: prima i titoli, poi quelli trovati dentro (bm25) con l\'estratto; "perche" trova "perché"; tutte le parole devono esserci', async () => {
  const r = ok(await manuel('documenti', { archivio: true, testo: 'verifica terra' }));
  const nel = r.documenti.filter(d => d.trovato);
  assert.ok(nel.some(d => d.id === doc['verbale-word.pdf'].id), 'trovato dentro');
  const v = nel.find(d => d.id === doc['verbale-word.pdf'].id).trovato;
  assert.equal(v.revisione, 0);
  assert.equal(v.superata, false);
  assert.match(v.estratto, /\[verifica\]|\[terra\]/, 'le parole fra parentesi quadre');
  // I titoli prima di quelli trovati dentro.
  const primoDentro = r.documenti.findIndex(d => d.trovato);
  assert.ok(r.documenti.slice(0, primoDentro).every(d => !d.trovato));
  assert.ok(r.documenti.slice(primoDentro).every(d => d.trovato));
  // Senza accento.
  const p = ok(await manuel('documenti', { archivio: true, testo: 'perche dispersore' }));
  assert.ok(p.documenti.some(d => d.id === doc['verbale-word.pdf'].id && d.trovato));
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'selettivita' })).documenti.some(d => d.id === doc['relazione-libreoffice.pdf'].id));
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'FG16OR16' })).documenti.some(d => d.id === doc['computo.xlsx'].id));
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'trasformatore' })).documenti.some(d => d.id === doc['schema.dxf'].id));
  // Tutte le parole: una che non c'e' toglie il risultato.
  assert.ok(!ok(await manuel('documenti', { archivio: true, testo: 'dispersore elicottero' })).documenti.some(d => d.trovato));
  // dentro: false resta sui titoli.
  assert.ok(!ok(await manuel('documenti', { archivio: true, testo: 'dispersore', dentro: false })).documenti.some(d => d.trovato));
});

test('la sintassi di FTS scritta dalla persona non rompe niente: virgolette, asterischi, OR, NEAR, parentesi', async () => {
  assert.equal(terminiFts('terra "OR" NEAR(x* y)'), '"terra"* "OR"* "NEAR"* "x"* "y"*');
  for (const t of ['"terra', 'terra*', 'terra OR', 'NEAR(terra impianto)', '"', '*', 'AND NOT', '(((', 'col:valore']) {
    const r = await manuel('documenti', { archivio: true, testo: t });
    assert.equal(r.ok, true, t + ': ' + r.errore);
  }
});

test('una revisione superata: "nella rev. 1 (superata)"', async () => {
  const d = documento('Relazione con due revisioni', require('../src/prova').pdfConTesto(['Prima emissione della relazione: il quadro QG7 ha il sezionatore rotativo da 160 A',
    'con le protezioni coordinate e la verifica funzionale fatta in cantiere insieme al collaudatore della ditta e al responsabile della sicurezza']));
  await w.attendiLetture();
  w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, () => w.db.transazione(() => {
    const f = w.salvaFile({ dati: require('../src/prova').pdfConTesto(['Seconda emissione: tutto rifatto con un altro testo che non contiene la parola cercata, per la prova delle revisioni superate',
      'con abbastanza parole da essere letto davvero dal lettore dei PDF, come un documento vero dello studio tecnico di esempio']), nome: 'rev1.pdf', mime: 'application/pdf', tipo: 'caricato' });
    w.db.esegui('UPDATE file SET caricato_da = ? WHERE id = ?', w.titolare().id, f.id);
    w.caricaVersione({ id: d.id, idFile: f.id, nota: 'rifatta' });
  }));
  await w.attendiLetture();
  const r = ok(await manuel('documenti', { archivio: true, testo: 'sezionatore rotativo' }));
  const x = r.documenti.find(y => y.id === d.id);
  assert.ok(x && x.trovato, 'trovato nella revisione vecchia');
  assert.deepEqual([x.trovato.revisione, x.trovato.superata], [0, true]);
});

test('prima i permessi, poi l\'estratto: il collaboratore non vede il contratto (vede: costi), ne\' risultato ne\' estratto; il conteggio non lo conta', async () => {
  const cat = w.db.riga("SELECT id FROM documento_categorie WHERE vede = 'costi' ORDER BY id LIMIT 1");
  assert.ok(cat, 'una categoria coi soldi');
  const contratto = w.come({ utente: w.titolare(), permessi: w.permessiDi('titolare') }, () => w.db.transazione(() => {
    const f = w.salvaFile({ dati: require('../src/prova').pdfConTesto(['Contratto riservato: il canone annuo di manutenzione della cabina elicoidale e il compenso pattuito',
      'per le verifiche periodiche, con le condizioni di pagamento e le penali, firmato dalle parti nella sede dello studio tecnico di esempio']), nome: 'contratto.pdf', mime: 'application/pdf', tipo: 'caricato' });
    w.db.esegui('UPDATE file SET caricato_da = ? WHERE id = ?', w.titolare().id, f.id);
    return w.salvaDocumento({ documento: { titolo: 'Contratto di manutenzione', idCategoria: cat.id, origine: 'file', idFile: f.id } }).documento;
  }));
  await w.attendiLetture();
  assert.ok(ok(await manuel('documenti', { archivio: true, testo: 'elicoidale' })).documenti.some(d => d.id === contratto.id && d.trovato), 'il titolare lo trova');
  const marco = await s.come('marco@esempio.it');
  const r = ok(await marco('documenti', { archivio: true, testo: 'elicoidale' }));
  assert.equal(r.quanti, 0, 'nemmeno nel numero dei risultati');
  assert.equal(JSON.stringify(r).indexOf('elicoidale'), -1, 'nessun estratto');
});

test('i documenti delle persone e quelli riservati non si leggono; il cestino svuotato toglie il testo', async () => {
  const persona = w.db.riga('SELECT id FROM persone ORDER BY id LIMIT 1').id;
  const d = documento('Cedolino di prova', require('../src/prova').pdfConTesto(['Cedolino di settembre: stipendio, contributi e trattenute della persona',
    'con tutte le voci del mese e il netto in busta, documento personale che nessuna ricerca deve mai mostrare a chi non lo vede']), { idPersona: persona });
  await w.attendiLetture();
  const idFile = w.db.riga('SELECT file_id FROM documento_versioni WHERE documento_id = ?', d.id).file_id;
  assert.equal(w.db.riga('SELECT * FROM file_lettura WHERE file_id = ?', idFile), null, 'nessuna riga di lettura');
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM file_testo WHERE file_id = ?', idFile).n, 0);
  assert.equal(ok(await manuel('letturaFile', { idFile })).stato, 'non_si_legge_qui');
  assert.ok(!ok(await manuel('documenti', { archivio: true, testo: 'trattenute' })).documenti.some(x => x.trovato));
  // Il cestino svuotato: il file esce dalla lettura e dalla ricerca.
  const idVerbale = w.db.riga('SELECT file_id FROM documento_versioni WHERE documento_id = ?', doc['schema.dxf'].id).file_id;
  w.togliLettura(idVerbale);
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM file_testo WHERE file_id = ?', idVerbale).n, 0);
});

test('rileggiFile: uno (documenti 2) o tutti (amministrazione 2); troppo grande; ci mette troppo -> non si legge', async () => {
  const idFile = w.db.riga('SELECT file_id FROM documento_versioni WHERE documento_id = ?', doc['capitolato.docx'].id).file_id;
  const r = ok(await manuel('rileggiFile', { idFile }));
  assert.ok(r.daLeggere >= 1);
  await w.attendiLetture();
  assert.equal(w.db.riga('SELECT stato FROM file_lettura WHERE file_id = ?', idFile).stato, 'letto');
  const laura = await s.come('laura@esempio.it');
  const no = await laura('rileggiFile', {});
  assert.deepEqual([no.ok, no.permesso], [false, false], 'tutti solo con amministrazione 2');
  // Piu' grande di RICERCA_FILE_MAX_MB: "troppo_grande".
  ok(await manuel('salvaImpostazioni', { valori: { RICERCA_FILE_MAX_MB: 1 } }));
  const grande = documento('File grande', Buffer.concat([require('../src/prova').pdfConTesto(['testo']), Buffer.alloc(1100000, 32)]));
  await w.attendiLetture();
  assert.equal(w.db.riga('SELECT stato FROM file_lettura WHERE file_id = (SELECT file_id FROM documento_versioni WHERE documento_id = ?)', grande.id).stato, 'troppo_grande');
  ok(await manuel('salvaImpostazioni', { valori: { RICERCA_FILE_MAX_MB: 20 } }));
  // Oltre il tempo massimo il worker si ferma: "non si legge" (qui il tempo e' di un millisecondo).
  w.secondiLettura = 0.001;
  ok(await manuel('rileggiFile', { idFile }));
  await w.attendiLetture();
  const l = w.db.riga('SELECT * FROM file_lettura WHERE file_id = ?', idFile);
  w.secondiLettura = undefined;
  assert.equal(l.stato, 'non_si_legge');
  assert.match(l.motivo, /ci mette troppo/);
});

test('senza FTS5 (solo per le prove): Integrazioni in Errore e la ricerca resta sui titoli, senza errori', async () => {
  w.senzaFts5 = true;
  const r = ok(await manuel('documenti', { archivio: true, testo: 'dispersore' }));
  assert.ok(!r.documenti.some(d => d.trovato));
  const st = await w.controllaIntegrazione('ricerca');
  assert.deepEqual([st.stato, st.esito], ['errore', 'Il database del NAS non sa cercare dentro i file: la ricerca resta sui titoli']);
  w.senzaFts5 = false;
});
