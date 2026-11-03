// Le regole di WhatsApp e comunicazioni e del portale lato studio di Wisper Ufficio (fase 7), provate con Node.
// Il numero per WhatsApp coi casi condivisi col server e col telefono (server/prove/casi-whatsapp.json):
// ogni risultato va ritrovato uguale.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const R = require('../ui/regole.js');
global.WisperRegole = R;
const K = require('../ui/regole-comunicazioni.js');
const E = require('../ui/esempio.js');

const CASI = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'prove', 'casi-whatsapp.json'), 'utf8'));

// ------------------------------------------------------------------ casi-whatsapp.json

test('casi-whatsapp.json: il numero per WhatsApp, caso per caso (valido, numero, fisso, come si mostra)', () => {
  assert.equal(CASI.casi.length, 17);
  CASI.casi.forEach(c => {
    const r = K.numeroWhatsapp(c.testo);
    assert.equal(r.valido, c.valido, c.nome + ': valido');
    if (!c.valido) return;
    assert.equal(r.numero, c.numero, c.nome + ': numero');
    assert.equal(r.fisso, c.fisso, c.nome + ': fisso');
    assert.equal(r.visto, c.visto, c.nome + ': visto');
    assert.equal(K.numeroVisto(c.numero), c.visto, c.nome + ': numeroVisto');
  });
});

test('casi-whatsapp.json: il link wa.me col testo codificato (accenti, a capo, il punto in mezzo)', () => {
  CASI.link.forEach(l => {
    assert.equal(K.linkWhatsapp(l.numero, l.testo), l.link);
    assert.ok(K.linkWhatsappValido(l.link));
  });
});

test('il link che il programma accetta di aprire: solo https://wa.me/ con le cifre e ?text=', () => {
  assert.ok(K.linkWhatsappValido('https://wa.me/393330001122'));
  assert.ok(K.linkWhatsappValido('https://wa.me/393330001122?text=Buongiorno%20Sig.%20Ferretti'));
  ['http://wa.me/393330001122', 'https://wa.me.example.com/393330001122', 'https://wa.me/39333?text=x', 'https://wa.me/393330001122/altro',
    'https://wa.me/393330001122?text=a b', 'https://wa.me/393330001122?phone=1', 'whatsapp://send?phone=393330001122', 'https://example.com/?u=https://wa.me/393330001122', '']
    .forEach(u => assert.ok(!K.linkWhatsappValido(u), u));
});

// ------------------------------------------------------------------ parole, colori, filtri

test('parole fisse e colori di §12: stati delle comunicazioni, canali, colori dei referenti', () => {
  assert.deepEqual(K.statoComunicazione({ stato: 'mandato' }), { parola: 'Mandato', colore: 'verde' });
  assert.deepEqual(K.statoComunicazione({ stato: 'preparato' }), { parola: 'Preparato', colore: 'blu' });
  assert.deepEqual(K.statoComunicazione({ stato: 'errore' }), { parola: 'Errore', colore: 'rosso' });
  assert.deepEqual(K.statoComunicazione({ stato: 'non_mandato' }), { parola: 'Non mandato', colore: 'grigio' });
  assert.deepEqual(K.statoComunicazione({ stato: 'ricevuto' }), { parola: 'Ricevuto', colore: 'grigio' });
  assert.equal(K.statoComunicazione({ stato: 'mandato', statoVisto: 'Mandato' }).parola, 'Mandato');
  assert.equal(K.nomeCanale('telefonata'), 'Telefonata');
  assert.deepEqual(K.iconaCanale('whatsapp'), ['whatsapp', 'ico-verde']);
  assert.deepEqual(K.iconaCanale('email'), ['email', 'ico-blu']);
  assert.equal(K.coloreReferente('Attivo'), 'verde');
  assert.equal(K.coloreReferente('Invitato'), 'blu');
  assert.equal(K.coloreReferente('Tolto'), 'grigio');
  assert.equal(K.nomeTipo({ tipo: 'promemoria_appuntamento' }), 'Promemoria appuntamento');
  assert.equal(K.nomeTipo({ tipo: 'avviso_portale' }), 'Avviso del portale');
  assert.equal(K.nomeTipo({ tipo: 'x', tipoNome: 'Dal server' }), 'Dal server');
});

test('lo Storico: Telefonate prende anche le note; Tutti tutto', () => {
  const l = [{ canale: 'whatsapp' }, { canale: 'email' }, { canale: 'telefonata' }, { canale: 'nota' }, { canale: 'portale' }];
  assert.equal(K.filtraStorico(l, 'tutti').length, 5);
  assert.deepEqual(K.filtraStorico(l, 'telefonata').map(c => c.canale), ['telefonata', 'nota']);
  assert.deepEqual(K.filtraStorico(l, 'portale').map(c => c.canale), ['portale']);
  assert.deepEqual(K.perGiorno([{ quando: '2026-10-22T09:12:00' }, { quando: '2026-10-22T08:15:00' }, { quando: '2026-10-21T16:42:00' }]).map(g => [g.giorno, g.righe.length]),
    [['2026-10-22', 2], ['2026-10-21', 1]]);
});

test('date delle righe: oggi, ieri, giorno e mese; visto e non ancora visto', () => {
  const adesso = new Date('2026-10-22T11:00:00');
  assert.equal(K.quando('2026-10-22T09:12:00', adesso), 'oggi alle 9:12');
  assert.equal(K.quando('2026-10-21T16:42:00', adesso), 'ieri alle 16:42');
  assert.equal(K.quando('2026-10-20T08:02:00', adesso), '20/10 alle 8:02');
  assert.equal(K.quando('2025-12-20T08:02:00', adesso), '20/12/2025 alle 8:02');
  assert.equal(K.quando('2026-10-20', adesso), '20/10');
  assert.equal(K.quando('', adesso), '');
  assert.equal(K.vistoTesto('2026-10-23T10:12:00', adesso), 'Visto il 23/10 alle 10:12');
  assert.equal(K.vistoTesto('2026-10-22T10:12:00', adesso), 'Visto oggi alle 10:12');
  assert.equal(K.vistoTesto('', adesso), 'Non ancora visto');
});

// ------------------------------------------------------------------ segnaposti e modelli

test('segnaposti: quelli di sempre più quelli dell\'uso; uno sconosciuto o di un altro uso si rifiuta', () => {
  assert.ok(K.segnapostiDi('appuntamento').indexOf('{giorno}') >= 0);
  assert.ok(K.segnapostiDi('appuntamento').indexOf('{nome}') >= 0);
  assert.ok(K.segnapostiDi('libero').indexOf('{giorno}') < 0);
  assert.deepEqual(K.segnapostiSconosciuti('Buongiorno {nome}, {cleinte}', 'libero'), ['{cleinte}']);
  assert.deepEqual(K.segnapostiSconosciuti('La fattura {fattura}', 'appuntamento'), ['{fattura}']);
  assert.deepEqual(K.segnapostiSconosciuti('La fattura {fattura} del {data_fattura}', 'pagamento'), []);
  // Quelli che manda il server vincono.
  assert.deepEqual(K.segnapostiSconosciuti('{nuovo}', 'libero', { sempre: ['{nuovo}'] }), []);
});

test('modelli: nome, testo, segnaposto sconosciuto e i 1.000 caratteri di WhatsApp (le frasi del server)', () => {
  assert.equal(K.erroreModello({ nome: '', testo: 'x' }).errore, 'Nome: scrivi come si chiama');
  assert.equal(K.erroreModello({ nome: 'X', testo: ' ' }).errore, 'Testo: scrivi il messaggio');
  assert.match(K.erroreModello({ nome: 'X', testo: 'Ciao {cleinte}', uso: 'libero', canale: 'whatsapp' }).errore, /^Segnaposto sconosciuto: \{cleinte\}\. Si possono usare \{nome\}, \{cliente\}/);
  const lungo = 'a'.repeat(1001);
  assert.equal(K.erroreModello({ nome: 'X', testo: lungo, uso: 'libero', canale: 'whatsapp' }).errore, 'Il messaggio è più lungo di 1.000 caratteri: accorcialo');
  assert.equal(K.erroreModello({ nome: 'X', testo: lungo, uso: 'libero', canale: 'email' }), null);
  assert.equal(K.erroreModello({ nome: 'X', testo: 'Buongiorno {nome}', uso: 'libero', canale: 'tutti' }), null);
});

test('riempire: i segnaposti senza valore restano scritti e tornano in mancano; la riga di {portale} sparisce senza portale', () => {
  const t = 'Buongiorno {nome}, l\'intervento è fissato per {giorno} presso {luogo}.\nLo trova anche nel portale: {portale}\n{mittente}';
  const con = K.riempi(t, { nome: 'Sig. Ferretti', giorno: 'giovedì 23 ottobre', portale: 'studiogm-portale.netlify.app', mittente: 'Manuel Gasparotto · Studio Tecnico GM' }, { portale: true });
  assert.equal(con.testo, 'Buongiorno Sig. Ferretti, l\'intervento è fissato per giovedì 23 ottobre presso {luogo}.\nLo trova anche nel portale: studiogm-portale.netlify.app\nManuel Gasparotto · Studio Tecnico GM');
  assert.deepEqual(con.mancano, ['{luogo}']);
  const senza = K.riempi(t, { nome: 'Sig. Ferretti', giorno: 'giovedì 23 ottobre', luogo: 'Cabina MT di Zanè', mittente: 'M' }, { portale: false });
  assert.equal(senza.testo.indexOf('portale'), -1);
  assert.equal(senza.testo.split('\n').length, 2);
  assert.deepEqual(senza.mancano, []);
  assert.equal(K.fraseManca('{luogo}'), 'manca il luogo');
  // L'anteprima dei modelli riempie tutto coi valori di esempio.
  assert.deepEqual(K.riempi('{nome} {cliente} {fattura} {importo} {scadenza} {data_fattura}', K.VALORI_ESEMPIO, { portale: true }).mancano, []);
});

test('i modelli per il Messaggio: attivi, del canale o di tutti e due, dell\'uso (più il libero)', () => {
  const m = [{ chiave: 'a', canale: 'tutti', uso: 'appuntamento', attivo: true }, { chiave: 'b', canale: 'email', uso: 'appuntamento', attivo: true },
    { chiave: 'c', canale: 'tutti', uso: 'pagamento', attivo: true }, { chiave: 'libero', canale: 'tutti', uso: 'libero', attivo: true }, { chiave: 'd', canale: 'tutti', uso: 'appuntamento', attivo: false }];
  assert.deepEqual(K.modelliPer(m, 'whatsapp', 'appuntamento').map(x => x.chiave), ['a', 'libero']);
  assert.deepEqual(K.modelliPer(m, 'email', 'appuntamento').map(x => x.chiave), ['a', 'b', 'libero']);
  assert.equal(K.nomeCanaleModello('tutti'), 'Tutti e due');
});

// ------------------------------------------------------------------ Da mandare, numerini, permessi

test('Da mandare: Oggi sempre (anche vuoto), gli altri gruppi solo se ci sono', () => {
  assert.deepEqual(K.gruppiDaMandare({ oggi: [], domani: [], proposti: [{}], preparati: [] }).map(g => g.chiave), ['oggi', 'proposti']);
  assert.deepEqual(K.gruppiDaMandare({ oggi: [{}], domani: [{}], proposti: [], preparati: [{}] }).map(g => g.nome), ['Oggi', 'Domani', 'Preparati, non mandati']);
  assert.deepEqual(K.gruppiDaMandare(null).map(g => g.chiave), ['oggi']);
});

test('numerini del menu (§11.1): da mandare oggi più preparati; da guardare', () => {
  const n = { comunicazioni: { daMandareOggi: 2, preparati: 1, proposti: 2 }, portale: { daGuardare: 4, richiesteNuove: 1 } };
  assert.equal(K.numerino(n, 'comunicazioni'), 3);
  assert.equal(K.numerino(n, 'portale'), 4);
  assert.equal(K.numerino({}, 'portale'), 0);
  assert.equal(K.numerino(null, 'comunicazioni'), 0);
});

test('permessi (§11.2): i quattro ruoli sulle pagine nuove, pagamenti, pubblica, file, impostazioni', () => {
  const P = K.Permessi;
  const tit = E.permessiDi('titolare');
  const amm = E.permessiDi('amministrazione');
  const col = E.permessiDi('collaboratore');
  const let_ = E.permessiDi('lettura');
  assert.deepEqual([tit, amm, col, let_].map(p => [p.comunicazioni, p.portale]), [[2, 2], [2, 2], [2, 0], [1, 1]]);
  assert.ok(P.scriveComunicazioni(col) && !P.vedePortale(col), 'il collaboratore scrive le sue comunicazioni, il portale no');
  assert.ok(P.vedePortale(let_) && !P.scrivePortale(let_) && !P.scriveComunicazioni(let_), 'lettura vede e basta');
  assert.ok(P.pagamenti(tit) && P.pagamenti(amm) && !P.pagamenti(col) && !P.pagamenti(let_), 'pagamenti: fatturazione 2 e costi');
  assert.ok(P.pubblica(tit, 'preventivi') && !P.pubblica(let_, 'preventivi') && !P.pubblica(col, 'rapportini'));
  assert.ok(P.accettaFile(amm) && !P.accettaFile(let_));
  assert.ok(P.rispondeNelPortale(col), 'Rispondi nel portale col ticket 2, senza il portale');
  assert.ok(P.impostazioniPortale(tit) && !P.impostazioniPortale(amm), 'le impostazioni del portale vogliono amministrazione 2');
  assert.ok(P.segnaWhatsapp(col) && !P.segnaWhatsapp(let_));
  assert.equal(K.MODULO_DI.contratto, 'ticket');
  assert.equal(K.MODULO_DI.fattura, 'fatturazione');
});

test('menu (§12): WhatsApp e comunicazioni e Portale clienti dopo Mezzi, prima di Collaboratori; solo col permesso', () => {
  const tit = R.vociMenu(E.permessiDi('titolare')).map(v => v.modulo);
  assert.deepEqual(tit.slice(tit.indexOf('mezzi'), tit.indexOf('collaboratori') + 1), ['mezzi', 'comunicazioni', 'portale', 'collaboratori']);
  const nomi = R.vociMenu(E.permessiDi('titolare')).map(v => v.nome);
  assert.ok(nomi.indexOf('WhatsApp e comunicazioni') >= 0 && nomi.indexOf('Portale clienti') >= 0);
  const col = R.vociMenu(E.permessiDi('collaboratore')).map(v => v.modulo);
  assert.ok(col.indexOf('comunicazioni') >= 0 && col.indexOf('portale') < 0);
  assert.ok(R.vociMenu({ dashboard: 1, comunicazioni: 0, portale: 0 }).every(v => v.modulo === 'dashboard'));
  // Le notifiche sono di tutti (ognuno le sue): la pagina si apre anche senza il modulo.
  assert.ok(R.paginaPermessa({ dashboard: 1 }, '#comunicazioni/notifiche'));
  assert.ok(!R.paginaPermessa({ dashboard: 1 }, '#comunicazioni/storico'));
  assert.ok(!R.paginaPermessa(E.permessiDi('collaboratore'), '#portale'));
  assert.ok(R.VIETATI_ESTERNO.indexOf('comunicazioni') >= 0 && R.VIETATI_ESTERNO.indexOf('portale') >= 0);
});

test('Dashboard: dove portano i collegamenti nuovi (§11.1)', () => {
  assert.deepEqual(R.destinazione({ pagina: 'comunicazioni', filtro: { segmento: 'damandare' } }), { hash: '#comunicazioni', filtro: { segmento: 'damandare' } });
  assert.equal(R.destinazione({ pagina: 'comunicazioni', filtro: { segmento: 'storico', idCliente: 'C002' } }).hash, '#comunicazioni/storico');
  assert.equal(R.destinazione({ pagina: 'comunicazioni', filtro: { segmento: 'notifiche' } }).hash, '#comunicazioni/notifiche');
  assert.equal(R.destinazione({ pagina: 'portale', filtro: { segmento: 'daguardare' } }).hash, '#portale');
  assert.equal(R.destinazione({ pagina: 'portale', filtro: { segmento: 'pubblicati' } }).hash, '#portale/pubblicati');
  assert.equal(R.destinazione({ pagina: 'portaleCliente', id: 'C002' }).hash, '#portale/cliente/C002');
  assert.equal(R.destinazione({ pagina: 'caricamento', id: 31 }).hash, '#portale/file/31');
  assert.equal(R.destinazione({ pagina: 'modello', chiave: 'libero' }).hash, '#comunicazioni/modelli/libero');
  assert.equal(R.destinazione({ pagina: 'amministrazione', filtro: { sezione: 'portale' } }).hash, '#amministrazione/portale');
  assert.equal(R.testoAzione({ pagina: 'portale' }), 'Apri il portale');
  assert.equal(R.testoAzione({ pagina: 'comunicazioni' }), 'Apri le comunicazioni');
  assert.equal(R.moduloDi('#portale/cliente/C002'), 'portale');
});

// ------------------------------------------------------------------ portale lato studio

test('la riga dello stato del portale (§0.5): Collegato, Non si raggiunge, Non collegato con la frase, Spento', () => {
  assert.deepEqual(K.statoPortale({ attivo: true, indirizzo: 'https://studiogm-portale.netlify.app', collegato: 'si' }), { parola: 'Collegato', colore: 'verde', dopo: 'studiogm-portale.netlify.app' });
  assert.equal(K.statoPortale({ attivo: true, indirizzo: 'https://studiogm-portale.netlify.app/', collegato: 'no' }).parola, 'Non si raggiunge');
  const nc = K.statoPortale({ attivo: false, indirizzo: '', collegato: 'non_collegato' });
  assert.equal(nc.parola, 'Non collegato');
  assert.equal(nc.dopo, 'Il portale non è ancora su internet: Amministrazione › Impostazioni › Portale clienti');
  assert.equal(K.statoPortale({ attivo: false, indirizzo: 'https://studiogm-portale.netlify.app', collegato: 'si' }).parola, 'Spento');
  assert.equal(K.statoScript('attivo').parola, 'Attivo');
  assert.equal(K.statoScript('non risponde').parola, 'Non risponde');
  assert.equal(K.statoScript('non collegato').frase, 'mancano WISPER_PORTALE_URL e SEGRETO_PORTALE sul NAS');
  assert.equal(K.host('https://studiogm-portale.netlify.app/#/entra'), 'studiogm-portale.netlify.app');
});

test('accesso del referente (§3.6): i permessi di base, il testo dei permessi o delle sedi', () => {
  assert.deepEqual(K.permessiBase(false), { preventivi: 2, rapportini: 2, fatture: 0, documenti: 2, richieste: 2 });
  assert.equal(K.permessiBase(true).fatture, 1);
  assert.equal(K.testoPermessi({ permessi: { preventivi: 2, rapportini: 2, fatture: 0, documenti: 2, richieste: 2 }, sedi: null }), 'Preventivi · Rapportini · Documenti · Richieste');
  assert.equal(K.testoPermessi({ permessi: { preventivi: 1 }, sedi: [7] }, [{ id: 7, nome: 'Magazzino automatico di Schio' }]), 'Solo Magazzino automatico di Schio');
  assert.equal(K.testoPermessi({ permessi: {} }), 'Niente');
  assert.deepEqual(K.TIPI_PERMESSI.map(t => t[2]), ['Accetta', 'Firma', '', 'Manda file', 'Apre']);
});

test('Da guardare: nome e colore della scheda, la richiesta urgente rossa tenue', () => {
  const u = K.schedaDaGuardare({ tipo: 'richiesta', titolo: 'Richiesta urgente: TK/2026/0016' });
  assert.deepEqual([u.nome, u.colore, u.urgente, u.titolo], ['Richiesta dal portale', 'ico-rosso', true, 'TK/2026/0016']);
  const f = K.schedaDaGuardare({ tipo: 'caricamento', titolo: 'Schema quadro QG2.pdf' });
  assert.deepEqual([f.nome, f.colore, f.urgente], ['File dal cliente', 'ico-grigio', false]);
  assert.equal(K.schedaDaGuardare({ tipo: 'accettato' }).nome, 'Accettato nel portale');
  assert.equal(K.schedaDaGuardare({ tipo: 'segnalato' }).nome, 'Segnalazione');
});

test('Accessi: Entrati, Azioni, Errori', () => {
  const l = [{ frase: 'Entrato', esito: 'ok' }, { frase: 'Ha visto il preventivo PR/2026/012 rev. 1', esito: 'ok' }, { frase: 'Codice sbagliato', esito: 'no' }, { frase: 'Uscito', esito: 'ok' }];
  assert.equal(K.filtraAccessi(l, 'tutti').length, 4);
  assert.deepEqual(K.filtraAccessi(l, 'entrati').map(a => a.frase), ['Entrato', 'Uscito']);
  assert.deepEqual(K.filtraAccessi(l, 'azioni').map(a => a.frase), ['Ha visto il preventivo PR/2026/012 rev. 1']);
  assert.deepEqual(K.filtraAccessi(l, 'errori').map(a => a.frase), ['Codice sbagliato']);
});

test('file dal cliente (§3.11): le immagini si guardano, il resto chiede conferma; la grandezza', () => {
  assert.ok(K.fileImmagine('Foto targa inverter.jpg') && K.fileImmagine('a.PNG') && K.fileImmagine('b.jpeg'));
  ['Schema quadro QG2.pdf', 'pianta.dwg', 'foto.heic', 'x.docx', 'a.pdf.png.exe', ''].forEach(n => assert.ok(!K.fileImmagine(n), n));
  assert.equal(K.domandaFile('Rossi Impianti Srl'), 'Arriva dal portale di Rossi Impianti Srl: aprilo solo se te lo aspettavi');
  assert.equal(K.grandezza(1258291), '1,2 MB');
  assert.equal(K.grandezza(2516582), '2,4 MB');
  assert.equal(K.grandezza(1048576), '1 MB');
  assert.equal(K.grandezza(5000), '5 kB');
});

test('Avvisa il cliente (§3.14): WhatsApp col sì, se no email, se no niente; id locali tutti diversi', () => {
  assert.equal(K.avvisaDiBase({ whatsappOk: true, email: 'a@b.it' }), 'whatsapp');
  assert.equal(K.avvisaDiBase({ whatsappOk: false, email: 'a@b.it' }), 'email');
  assert.equal(K.avvisaDiBase(null, { email: 'c@d.it' }), 'email');
  assert.equal(K.avvisaDiBase({}, {}), '');
  assert.deepEqual(K.TIPI_CON_AVVISO, ['appuntamento', 'sopralluogo', 'intervento']);
  const ids = new Set(Array.from({ length: 50 }, () => K.idLocale('wa')));
  assert.equal(ids.size, 50);
});
