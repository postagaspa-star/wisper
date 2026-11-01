// Fase 8 (fase8.md §9.8-9.10, §16): la prova automatica delle copie (buona, rovinata, con meno righe, un file cambiato,
// la copia fuori casa diversa da quella mandata) e la cifratura della copia fuori casa (AES-256-GCM): la copia cifrata
// si ripristina con la chiave giusta, con quella sbagliata si ferma senza toccare niente; i file tornano al loro posto con
// ripristina-file.js. Tutto col postino finto (scrive su disco), mai Google.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, postinoFinto, giornoDeiPrototipi, cartellaNuova, SEGRETO, PNG } = require('./aiuto');
const { ripristina } = require('../strumenti/ripristina');
const { ripristinaFile } = require('../strumenti/ripristina-file');
const { MAGIA, eCifrato } = require('../src/cifra');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let postino;
let manuel;
test.before(async () => {
  postino = await postinoFinto();
  s = await serverDiProva({ env: { WISPER_POSTINO_URL: postino.url, WISPER_POSTINO_SEGRETO: SEGRETO } });
  manuel = await s.come('manuel@esempio.it');
});
test.after(async () => {
  await s.ferma();
  await postino.ferma();
});

const cartellaFuori = sotto => path.join(postino.cartella, 'copie', sotto);
const ultimaCopia = () => s.wisper.db.riga('SELECT * FROM copie ORDER BY id DESC LIMIT 1');

test('la copia salva conteggi e impronta; la prova automatica di una copia buona: integrita\', righe, 20 file, impronta fuori casa giusta', async () => {
  const c = ok(await manuel('copiaAdesso')).copia;
  assert.match(c.fuori, /^ok/);
  const riga = ultimaCopia();
  const conteggi = JSON.parse(riga.conteggi);
  assert.ok(conteggi.rapportini > 0 && conteggi.soggetti > 0);
  assert.match(riga.md5, /^[0-9a-f]{32}$/);
  assert.equal(riga.cifrata, 0);
  assert.ok(fs.existsSync(path.join(cartellaFuori('database'), riga.file + '.gz')), 'la copia in chiaro (cifratura spenta) col suo nome');
  const p = ok(await manuel('provaCopia')).prova;
  assert.deepEqual([p.esito, p.integrita, p.problemi], ['ok', 'ok', []]);
  assert.equal(p.conteggi.rapportini[0], conteggi.rapportini);
  assert.ok(p.file.provati > 0 && p.file.provati <= 20);
  assert.equal(p.file.giusti, p.file.provati);
  assert.equal(p.fuori.md5, 'giusto');
  assert.ok(postino.richieste.some(r => r.azione === 'postinoImpronta' && r.nome === riga.file + '.gz'));
  const copie = ok(await manuel('copie'));
  assert.equal(copie.prove[0].esito, 'ok');
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'prova della copia: tutto torna'"));
  const marco = await s.come('marco@esempio.it');
  assert.equal((await marco('provaCopia')).permesso, false);
});

test('la prova trova: meno righe di quelle contate, un file cambiato, la copia fuori casa diversa, la copia rovinata (con la notifica)', async () => {
  const riga = ultimaCopia();
  // Le righe: al momento della copia ce n'era una in piu' (come se la copia ne avesse perse).
  const conteggi = JSON.parse(riga.conteggi);
  s.wisper.db.esegui('UPDATE copie SET conteggi = ? WHERE id = ?', JSON.stringify(Object.assign({}, conteggi, { rapportini: conteggi.rapportini + 1 })), riga.id);
  let p = ok(await manuel('provaCopia')).prova;
  assert.equal(p.esito, 'errore');
  assert.ok(p.problemi.includes('rapportini: ' + conteggi.rapportini + ' righe nella copia, ' + (conteggi.rapportini + 1) + ' al momento della copia'), JSON.stringify(p.problemi));
  s.wisper.db.esegui('UPDATE copie SET conteggi = ? WHERE id = ?', riga.conteggi, riga.id);

  // Un file sul disco non e' piu' quello caricato (gli altri tolti per un momento dalla scelta a caso).
  const uno = s.wisper.db.righe('SELECT id, percorso, sha256 FROM file WHERE percorso IS NOT NULL AND sha256 IS NOT NULL AND svuotato IS NULL')
    .find(f => fs.existsSync(s.wisper.percorsoFile(f.percorso)));
  const altri = s.wisper.db.righe('SELECT id, sha256 FROM file WHERE sha256 IS NOT NULL AND id <> ?', uno.id);
  s.wisper.db.esegui('UPDATE file SET sha256 = NULL WHERE id <> ?', uno.id);
  const percorso = s.wisper.percorsoFile(uno.percorso);
  const originale = fs.readFileSync(percorso);
  fs.writeFileSync(percorso, Buffer.concat([originale, Buffer.from('cambiato')]));
  try {
    p = ok(await manuel('provaCopia')).prova;
    assert.deepEqual([p.esito, p.file.provati, p.file.giusti], ['errore', 1, 0]);
    assert.ok(p.problemi.includes('un file non è più quello caricato'));
  } finally {
    fs.writeFileSync(percorso, originale);
    for (const f of altri) s.wisper.db.esegui('UPDATE file SET sha256 = ? WHERE id = ?', f.sha256, f.id);
  }

  // La copia fuori casa non e' piu' quella mandata (Drive ha un file diverso).
  const fuori = path.join(cartellaFuori('database'), riga.file + '.gz');
  const mandata = fs.readFileSync(fuori);
  fs.writeFileSync(fuori, Buffer.from('un altro file'));
  p = ok(await manuel('provaCopia')).prova;
  assert.equal(p.fuori.md5, 'diverso');
  assert.ok(p.problemi.some(x => /^la copia fuori casa del \d{2}\/\d{2} è diversa da quella mandata$/.test(x)), JSON.stringify(p.problemi));
  fs.writeFileSync(fuori, mandata);

  // La copia del NAS rovinata: non si apre, notifica copia_non_riuscita a chi riceve gli avvisi.
  const nas = path.join(s.wisper.cartellaCopie, riga.file);
  const buona = fs.readFileSync(nas);
  fs.writeFileSync(nas, Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(4096, 7)]));
  try {
    p = ok(await manuel('provaCopia')).prova;
    assert.equal(p.esito, 'errore');
    assert.ok(/rovinata|non si apre/.test(p.problemi[0]), JSON.stringify(p.problemi));
    const idManuel = s.wisper.db.riga("SELECT id FROM utenti WHERE email = 'manuel@esempio.it'").id;
    assert.ok(s.wisper.db.riga("SELECT id FROM notifiche WHERE utente_id = ? AND tipo = 'copia_non_riuscita'", idManuel), 'la notifica del sistema');
  } finally {
    fs.writeFileSync(nas, buona);
  }
  assert.equal(ok(await manuel('provaCopia')).prova.esito, 'ok', 'rimesso tutto a posto, la prova torna');
});

test('il ripristino a mano si segna coi cinque controlli; senza i cinque no', async () => {
  assert.equal((await manuel('segnaRipristino', { copia: 'wisper-20261022.db', da: 'drive', controlli: [true, true] })).errore, 'I cinque controlli: spunta quelli che tornano');
  const r = ok(await manuel('segnaRipristino', { copia: 'wisper-20261022.db', da: 'drive', conChiave: true, controlli: [true, true, true, true, true], note: 'sul PC di Andrea' }));
  assert.deepEqual([r.prova.tipo, r.prova.esito, r.prova.conChiave, r.prova.da], ['a_mano', 'ok', true, 'drive']);
  assert.equal(ok(await manuel('segnaRipristino', { copia: 'wisper-20261022.db', da: 'nas', controlli: [true, false, true, true, true] })).prova.esito, 'errore');
});

test('la cifratura: la chiave una volta sola (mai nel registro); la copia fuori casa cifrata (WISPERC1); ripristino con la chiave giusta, sbagliata, senza', async () => {
  const laura = await s.come('laura@esempio.it');
  assert.equal((await laura('accendiCifratura')).ok, false, 'solo il titolare');
  const a = ok(await manuel('accendiCifratura'));
  assert.match(a.chiave, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/);
  assert.equal(a.nuova, true);
  const registro = s.wisper.db.righe('SELECT prima, dopo, nota FROM registro').map(r => [r.prima, r.dopo, r.nota].join(' ')).join('\n');
  assert.equal(registro.indexOf(a.chiave.replace(/-/g, '')), -1, 'la chiave non e\' nel registro');
  assert.equal(registro.indexOf(a.chiave), -1);
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'cifratura della copia accesa'"));
  assert.equal(ok(await manuel('sicurezza')).copiaCifrata, true);
  assert.equal(JSON.stringify(ok(await manuel('sicurezza'))).indexOf(a.chiave), -1, 'e nemmeno nelle risposte dopo');
  // Un file nuovo (il logo) dopo l'accensione: parte cifrato anche lui.
  const png = Buffer.from(PNG);
  png.writeUInt32BE(400, 16);
  png.writeUInt32BE(400, 20);
  const logo = ok(await manuel('caricaFile', { tipo: 'logo', base64: png.toString('base64'), mime: 'image/png' })).file;
  const c = ok(await manuel('copiaAdesso')).copia;
  assert.match(c.fuori, /^ok/);
  const riga = ultimaCopia();
  assert.equal(riga.cifrata, 1);
  const cifrata = path.join(cartellaFuori('database'), riga.file + '.gz.cifrato');
  assert.ok(fs.existsSync(cifrata), 'nome con .cifrato');
  const byte = fs.readFileSync(cifrata);
  assert.equal(byte.subarray(0, 8).toString('latin1'), 'WISPERC1');
  assert.deepEqual(byte.subarray(0, 8), Buffer.from(MAGIA));
  assert.equal(eCifrato(byte), true);
  assert.ok(fs.readdirSync(cartellaFuori('file')).some(n => n.startsWith(logo.id + ' ') && n.endsWith('.cifrato')), 'il file nuovo e\' cifrato');
  assert.equal(ok(await manuel('provaCopia')).prova.fuori.md5, 'giusto', 'l\'impronta della copia cifrata');
  const conteggi = JSON.parse(riga.conteggi);

  // Senza chiave e con la chiave sbagliata non si tocca niente (il database che c'e' resta com'era).
  const dati = cartellaNuova('ripristino');
  fs.writeFileSync(path.join(dati, 'wisper.db'), 'il database di prima');
  assert.throws(() => ripristina(cifrata, dati, {}), /La copia è cifrata: serve la chiave scritta su carta/);
  assert.throws(() => ripristina(cifrata, dati, { chiave: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH' }), /La chiave non apre questa copia: controlla di averla scritta giusta/);
  assert.equal(fs.readFileSync(path.join(dati, 'wisper.db'), 'utf8'), 'il database di prima');
  assert.deepEqual(fs.readdirSync(dati), ['wisper.db'], 'niente messo da parte, niente scritto');

  // Con la chiave giusta (anche scritta in minuscolo e con gli spazi, come la si ricopia dalla carta).
  const scritta = a.chiave.toLowerCase().replace(/-/g, ' ');
  const r = ripristina(cifrata, dati, { chiave: scritta });
  assert.equal(r.cifrata, true);
  assert.match(r.descrizione, /^Copia del \d{2}\/\d{2}\/\d{4} · cifrata · versione dello schema 8$/);
  assert.equal(r.rapportini, conteggi.rapportini);
  assert.equal(r.soggetti, conteggi.soggetti);
  assert.ok(r.messoDaParte && fs.readFileSync(r.messoDaParte, 'utf8') === 'il database di prima', 'quello di prima messo da parte');

  // I file: tornano quelli che sono fuori casa (in chiaro e cifrati), col controllo dello SHA-256.
  const senza = ripristinaFile({ da: cartellaFuori('file'), dati });
  assert.ok(senza.senzaChiave >= 1, 'quelli cifrati senza chiave restano fuori');
  const conChiave = ripristinaFile({ da: cartellaFuori('file'), dati, chiave: a.chiave });
  assert.deepEqual(conChiave.sbagliati, []);
  assert.equal(conChiave.senzaChiave, 0);
  assert.ok(fs.existsSync(path.join(dati, 'file')));
  const rimesso = s.wisper.db.riga('SELECT percorso, sha256 FROM file WHERE id = ?', logo.id);
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(dati, 'file', path.basename(rimesso.percorso)))).digest('hex'), rimesso.sha256);
  const ancora = ripristinaFile({ da: cartellaFuori('file'), dati, chiave: a.chiave });
  assert.equal(ancora.rimessi, 0, 'la seconda volta sono gia\' tutti a posto');
  assert.ok(ancora.gia >= conChiave.rimessi + senza.rimessi);

  // Un file arrivato rovinato non si rimette.
  const nome = fs.readdirSync(cartellaFuori('file')).find(n => !n.endsWith('.cifrato'));
  const id = nome.split(' ')[0];
  const f = s.wisper.db.riga('SELECT percorso FROM file WHERE id = ?', id);
  fs.rmSync(path.join(dati, 'file', path.basename(f.percorso)));
  fs.writeFileSync(path.join(cartellaFuori('file'), nome), 'rovinato');
  assert.deepEqual(ripristinaFile({ da: cartellaFuori('file'), dati, chiave: a.chiave }).sbagliati, [id]);

  // Spenta: serve la conferma; le copie di prima restano cifrate.
  assert.equal((await manuel('spegniCifratura', {})).conferma, true);
  ok(await manuel('spegniCifratura', { conferma: true }));
  assert.equal(s.wisper.leggiImpostazioni().COPIA_CIFRATA, false);
  assert.ok(fs.existsSync(cifrata));
});

test('la cifratura accesa senza la chiave sul disco: la copia fuori casa non parte in chiaro (quella sul NAS si\')', async () => {
  ok(await manuel('accendiCifratura'));
  const fileChiave = require('../src/cifra').fileChiave(s.wisper.dati);
  const chiave = fs.readFileSync(fileChiave);
  fs.rmSync(fileChiave);
  const prima = fs.readdirSync(cartellaFuori('database')).length;
  try {
    const c = ok(await manuel('copiaAdesso')).copia;
    assert.equal(c.locale, 'ok');
    assert.match(c.fuori, /^errore: la cifratura è accesa ma manca la chiave/);
    assert.equal(fs.readdirSync(cartellaFuori('database')).length, prima, 'niente in chiaro su Drive');
  } finally {
    fs.writeFileSync(fileChiave, chiave);
    ok(await manuel('spegniCifratura', { conferma: true }));
  }
});
