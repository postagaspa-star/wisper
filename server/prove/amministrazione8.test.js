// Fase 8 (fase8.md §9, §11, §16): Amministrazione completa. Ogni chiave di ogni fase o nelle impostazioni generali o
// nell'elenco di quelle con una pagina loro o nascoste (le chiavi lette dalle migrazioni); i limiti; le funzioni spente
// (menu, Dashboard, azioni "spenta", eccezioni, dati uguali dopo la riaccensione); casi-numerazioni.json; il logo; le
// notifiche spente che non nascono; scollega tutti (la coda del telefono resta); sicurezza, stato del sistema, la lista
// di controllo e il cambio.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, giornoDeiPrototipi, PNG } = require('./aiuto');
const G = require('../src/impostazioni-generali');
const { IMPOSTAZIONI_INIZIALI } = require('../src/wisper');
const { codiceDa, prossimoDa } = require('../src/formati');
const CASI = require('./casi-numerazioni.json');

giornoDeiPrototipi();

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };

let s;
let manuel;
test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
});
test.after(() => s.ferma());

/** Le chiavi delle impostazioni scritte dalle migrazioni (gli INSERT INTO impostazioni) e quelle iniziali del server. */
function chiaviDalleMigrazioni() {
  const cartella = path.join(__dirname, '..', 'src', 'migrazioni');
  const k = new Set(IMPOSTAZIONI_INIZIALI.map(r => r[0]));
  for (const f of fs.readdirSync(cartella).filter(x => x.endsWith('.sql'))) {
    const t = fs.readFileSync(path.join(cartella, f), 'utf8');
    for (const blocco of t.match(/INSERT OR IGNORE INTO impostazioni[\s\S]*?;\s*$/gm) || []) {
      for (const m of blocco.matchAll(/^\s*\('([A-Z0-9_]+)'/gm)) k.add(m[1]);
    }
  }
  return k;
}

test('ogni impostazione delle fasi 1-8 ha una schermata (impostazioni generali o la sua pagina) o e\' nell\'elenco di quelle nascoste', async () => {
  const chiavi = chiaviDalleMigrazioni();
  assert.ok(chiavi.size >= 100, 'lette ' + chiavi.size + ' chiavi');
  const conosciute = G.chiaviConosciute();
  const senza = Array.from(chiavi).filter(k => !conosciute.has(k));
  assert.deepEqual(senza, [], 'chiavi senza schermata: ' + senza.join(', '));
  const r = ok(await manuel('impostazioniGenerali'));
  assert.equal(r.gruppi.length, 11);
  assert.deepEqual(r.gruppi.map(g => g.nome), ['Lavoro e approvazioni', 'Rapportini e rimborsi', 'Preventivi', 'Fatture e banca', 'Documenti e file', 'Ticket e assistenza',
    'Persone, mezzi e collaboratori', 'Portale clienti', 'Comunicazioni', 'Spazio e copie', 'Calendario e ricerca']);
  const ore = r.gruppi[0].voci.find(v => v.chiave === 'ORE_GIORNALIERE');
  assert.deepEqual([ore.tipo, ore.min, ore.max, ore.unita, ore.valore], ['numero', 1, 12, 'ore', 8]);
  for (const k of ['APPROVAZIONE', 'INDENNITA_TRASFERTA', 'PREVENTIVO_VALIDITA_GIORNI', 'TICKET_TEMPI', 'FILE_MAX_MB', 'SPAZIO_AVVISO_MB', 'CALENDARIO_MESI_DOPO']) {
    assert.ok(r.gruppi.some(g => g.voci.some(v => v.chiave === k)), k + ' ha la sua schermata');
  }
  assert.ok(r.gruppi.find(g => g.chiave === 'fisco').collegamenti.some(c => c.sezione === 'fiscale'));
  assert.equal(r.gruppi.find(g => g.chiave === 'spazio').voci.find(v => v.chiave === 'WISPER_ORA_COPIA').tipo, 'sola_lettura');
});

test('i limiti si controllano quando si salva (con errori che cominciano col nome); TICKET_TEMPI con l\'intervento non prima della presa in carico', async () => {
  assert.equal((await manuel('salvaImpostazioni', { valori: { ORE_GIORNALIERE: 14 } })).errore, 'Ore di lavoro al giorno: da 1 a 12 ore');
  assert.equal((await manuel('salvaImpostazioni', { valori: { APPROVAZIONE: 'boh' } })).errore, 'Cosa va approvato: le cose dei collaboratori, tutto, niente');
  assert.equal((await manuel('salvaImpostazioni', { valori: { FESTA_PATRONO: '31-02' } })).errore, 'Festa del patrono: mese e giorno, per esempio 07-25');
  const tempi = { urgente: { presa: 1, intervento: 4 }, alta: { presa: 2, intervento: 24 }, normale: { presa: 8, intervento: 4 }, bassa: { presa: 24, intervento: 240 } };
  assert.equal((await manuel('salvaImpostazioni', { valori: { TICKET_TEMPI: tempi } })).errore, 'Tempi dei ticket: Normale: l\'intervento non può venire prima della presa in carico');
  tempi.normale.intervento = 72;
  ok(await manuel('salvaImpostazioni', { valori: { TICKET_TEMPI: tempi, ORE_GIORNALIERE: '7,5' } }));
  assert.equal(s.wisper.leggiImpostazioni().ORE_GIORNALIERE, 7.5);
  ok(await manuel('salvaImpostazioni', { valori: { ORE_GIORNALIERE: 8 } }));
  assert.match((await manuel('salvaImpostazioni', { valori: { COPIA_CIFRATA: true } })).errore, /Sicurezza/);
  assert.match((await manuel('salvaImpostazioni', { valori: { SPAZIO_MINIMO_MB: 20000, SPAZIO_AVVISO_MB: 10000 } })).errore, /non può essere più dell'avviso/);
  // Le chiavi che non hanno una voce si salvano come prima (le regole fiscali, i dati dello studio).
  ok(await manuel('salvaImpostazioni', { valori: { STUDIO_NOME_BREVE: 'Studio GM', PDF_PIEDE: 'Iscritto al Collegio dei Periti Industriali di Vicenza n. 0000' } }));
  assert.equal(ok(await manuel('io')).interfaccia.nomeBreve, 'Studio GM');
});

test('le funzioni accese: solo il titolare; spenta = via dal menu (permessi 0), dalla Dashboard e dalle azioni ("spenta"); i dati restano; le eccezioni', async () => {
  const f = ok(await manuel('funzioni'));
  assert.deepEqual(f.funzioni.filter(x => x.spegnibile).map(x => x.modulo), ['banche', 'mezzi', 'comunicazioni', 'portale', 'collaboratori']);
  assert.equal(f.funzioni.find(x => x.modulo === 'rapportini').spegnibile, false);
  const laura = await s.come('laura@esempio.it');
  assert.equal((await laura('salvaFunzioni', { modulo: 'mezzi', accesa: false })).permesso, false);
  assert.equal((await manuel('salvaFunzioni', { modulo: 'rapportini', accesa: false })).errore, 'Ore e rapportini resta sempre accesa');
  const prima = ok(await manuel('mezzi', {}));
  ok(await manuel('salvaFunzioni', { modulo: 'mezzi', accesa: false }));
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'funzione spenta: Mezzi e attrezzature'"));
  const io = ok(await manuel('io'));
  assert.deepEqual(io.interfaccia.funzioniSpente, ['mezzi']);
  assert.equal(io.permessi.mezzi, 0, 'anche per il titolare');
  const r = await manuel('mezzi', {});
  assert.deepEqual([r.ok, r.errore, r.spenta], [false, 'La funzione Mezzi e attrezzature è spenta: si accende in Amministrazione', true]);
  const d = ok(await manuel('dashboard', { tutto: true }));
  assert.ok(![].concat(d.urgenti, d.settimana, d.pianificare).some(v => ['mezzo', 'strumento', 'prestito', 'guasto'].includes(v.tipo)));
  assert.equal(d.numerini.mezzi, undefined);
  // Le scadenze restano leggibili dagli altri moduli (documenti), i dati dei mezzi restano.
  ok(await manuel('scadenze', {}));
  ok(await manuel('salvaFunzioni', { modulo: 'mezzi', accesa: true }));
  const dopo = ok(await manuel('mezzi', {}));
  assert.deepEqual(dopo, prima, 'i dati tornano uguali');
  // Banche spenta: segnare l'incasso da una fattura funziona lo stesso.
  ok(await manuel('salvaFunzioni', { modulo: 'banche', accesa: false }));
  assert.equal((await manuel('conti', {})).spenta, true);
  const f12 = s.wisper.db.righe("SELECT * FROM fatture WHERE stato = 'emessa' AND tipo = 'fattura' ORDER BY id").find(f => s.wisper.pagamentoDi(f).residuo > 1);
  assert.ok(f12, 'una fattura emessa da incassare nei dati di esempio');
  const inc = await manuel('segnaIncasso', { idFattura: f12.id, importo: 1 });
  assert.equal(inc.ok, true, JSON.stringify(inc));
  ok(await manuel('salvaFunzioni', { modulo: 'banche', accesa: true }));
  // Comunicazioni spenta: la campanella apre lo stesso le notifiche. Portale spento: fa anche Spegni il portale adesso.
  ok(await manuel('salvaFunzioni', { modulo: 'comunicazioni', accesa: false }));
  ok(await manuel('notifiche', {}));
  ok(await manuel('salvaFunzioni', { modulo: 'comunicazioni', accesa: true }));
  s.wisper.db.transazione(() => s.wisper.salvaImpostazioni({ PORTALE_ATTIVO: true }));
  ok(await manuel('salvaFunzioni', { modulo: 'portale', accesa: false }));
  assert.equal(s.wisper.leggiImpostazioni().PORTALE_ATTIVO, false);
  ok(await manuel('salvaFunzioni', { modulo: 'portale', accesa: true }));
  assert.deepEqual(ok(await manuel('io')).interfaccia.funzioniSpente, []);
});

test('casi-numerazioni.json: codiceDa e il prossimo numero coi formati di prima; uguali a quelli del server (prossimoNumero)', async () => {
  assert.equal(CASI.codiceDa.length + CASI.prossimo.length, 12);
  for (const c of CASI.codiceDa) assert.equal(codiceDa(c.formato, c.anno, c.numero), c.atteso, c.nome);
  for (const c of CASI.prossimo) {
    const codici = c.codici.slice();
    const usciti = [];
    for (let i = 0; i < c.nuove; i++) {
      const p = prossimoDa({ formato: c.formato, precedenti: c.precedenti, annuale: c.annuale, ultimo: c.ultimo }, codici, c.anno);
      usciti.push(p.codice);
      codici.push(p.codice);
    }
    assert.deepEqual(usciti, c.attesi, c.nome);
  }
  // Il server da' lo stesso numero col formato cambiato (Numerazioni: il formato vale solo per i numeri nuovi).
  ok(await manuel('salvaNumerazione', { tipo: 'commessa', formato: 'ST{AA}-{NNNN}' }));
  const n = ok(await manuel('numerazioni')).numerazioni.find(x => x.tipo === 'commessa');
  assert.match(n.prossimo, /^ST26-\d{4}$/);
  assert.equal(codiceDa(n.formato, 2026, n.numeroProssimo), n.prossimo);
  assert.equal(n.parole, 'ST, anno a due cifre, -, numero a 4 cifre');
  assert.equal(ok(await manuel('numerazioni')).fatture, 'Fatture: il numero lo dà il programma delle fatture');
  ok(await manuel('salvaNumerazione', { tipo: 'commessa', formato: '{AA}ST{NNN}' }));
});

test('il logo: PNG o JPG fino a 1 MB, almeno 300 px; va in STUDIO_LOGO, si vede in io; "Togli il logo"; nel registro', async () => {
  const piccolo = await manuel('caricaFile', { tipo: 'logo', base64: PNG.toString('base64'), mime: 'image/png' });
  assert.equal(piccolo.errore, 'Il logo è troppo piccolo: serve almeno 300 px di lato');
  // Un PNG di 400 x 100 (solo l'intestazione conta per il lato).
  const png = Buffer.from(PNG);
  png.writeUInt32BE(400, 16);
  png.writeUInt32BE(100, 20);
  const r = ok(await manuel('caricaFile', { tipo: 'logo', base64: png.toString('base64'), mime: 'image/png' }));
  assert.equal(s.wisper.leggiImpostazioni().STUDIO_LOGO, r.file.id);
  assert.equal(ok(await manuel('io')).interfaccia.logo, '/file/' + r.file.id);
  assert.equal((await manuel.file(r.file.id)).status, 200);
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'logo cambiato'"));
  const pdf = await manuel('caricaFile', { tipo: 'logo', base64: Buffer.from('%PDF-1.4 niente').toString('base64'), mime: 'application/pdf' });
  assert.equal(pdf.errore, 'Il logo deve essere un PNG o un JPG di al massimo 1 MB');
  const laura = await s.come('laura@esempio.it');
  assert.equal((await laura('caricaFile', { tipo: 'logo', base64: png.toString('base64'), mime: 'image/png' })).ok, false, 'amministrazione 1 non cambia il logo');
  ok(await manuel('salvaImpostazioni', { valori: { STUDIO_LOGO: '' } }));
  assert.equal(ok(await manuel('io')).interfaccia.logo, '');
});

test('le notifiche: preferenze per persona; una notifica spenta non nasce; Sistema solo per chi riceve gli avvisi; silenzio di sera', async () => {
  const marco = await s.come('marco@esempio.it');
  const p = ok(await marco('notifichePreferenze'));
  assert.ok(p.tipi.assegnato === true);
  assert.ok(!p.gruppi.some(g => g.nome === 'Sistema'), 'il collaboratore non riceve gli avvisi del server');
  assert.ok(ok(await manuel('notifichePreferenze')).gruppi.some(g => g.nome === 'Sistema'));
  ok(await marco('salvaNotifichePreferenze', { tipi: { assegnato: false }, silenzioSera: false }));
  const idMarco = s.wisper.db.riga("SELECT id FROM utenti WHERE email = 'marco@esempio.it'").id;
  const prima = s.wisper.db.riga("SELECT COUNT(*) n FROM notifiche WHERE utente_id = ? AND tipo = 'assegnato'", idMarco).n;
  ok(await manuel('salvaAttivita', { attivita: { titolo: 'Controllare il quadro', scadenza: '2026-10-30', assegnataA: idMarco } }));
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM notifiche WHERE utente_id = ? AND tipo = 'assegnato'", idMarco).n, prima, 'spenta: non nasce');
  ok(await marco('salvaNotifichePreferenze', { tipi: { assegnato: true } }));
  ok(await manuel('salvaAttivita', { attivita: { titolo: 'Controllare il quadro 2', scadenza: '2026-10-30', assegnataA: idMarco } }));
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM notifiche WHERE utente_id = ? AND tipo = 'assegnato'", idMarco).n, prima + 1);
  assert.equal(typeof ok(await marco('notifiche', {})).silenzio, 'boolean');
  assert.match((await marco('salvaNotifichePreferenze', { tipi: { boh: false } })).errore, /^Tipo di notifica sconosciuto/);
  // La prova degli avvisi (amministrazione 2): un'email dal postino.
  ok(await manuel('salvaImpostazioni', { valori: { EMAIL_AVVISI: 'avvisi@esempio.it' } }));
  const a = ok(await manuel('provaAvvisi'));
  assert.deepEqual(a.a, ['il proprietario del foglio', 'avvisi@esempio.it']);
  const laura = await s.come('laura@esempio.it');
  assert.equal((await laura('provaAvvisi')).permesso, false);
});

test('sicurezza: le schede; la password iniziale (salvaUtente la mette, cambiaPassword la toglie); Scollega tutti col la password del titolare', async () => {
  let sic = ok(await manuel('sicurezza'));
  assert.deepEqual(Object.keys(sic).sort(), ['accessiSbagliati', 'copiaCifrata', 'dispositivi', 'dispositiviFermi', 'feed', 'internetInterno', 'ok', 'passwordIniziali', 'primaCosa', 'sessioneGiorni', 'tuttoAPosto', 'utentiFermi']);
  assert.equal(sic.sessioneGiorni, 180);
  assert.equal(sic.copiaCifrata, false);
  const nuovo = ok(await manuel('salvaUtente', { utente: { nome: 'Paolo Nuovo', email: 'paolo@esempio.it', ruolo: 'collaboratore' } }));
  sic = ok(await manuel('sicurezza'));
  assert.ok(sic.passwordIniziali.some(p => p.nome === 'Paolo Nuovo'));
  assert.match(sic.primaCosa, /Paolo Nuovo non ha ancora cambiato la password iniziale/);
  const paolo = await s.come('paolo@esempio.it', nuovo.passwordIniziale);
  ok(await paolo('cambiaPassword', { vecchia: nuovo.passwordIniziale, nuova: 'una-password-nuova' }));
  assert.ok(!ok(await manuel('sicurezza')).passwordIniziali.some(p => p.nome === 'Paolo Nuovo'));
  // Gli accessi sbagliati degli ultimi 30 giorni.
  await s.chiama(null, { azione: 'accedi', email: 'laura@esempio.it', password: 'sbagliata' });
  assert.ok(ok(await manuel('sicurezza')).accessiSbagliati.quanti >= 1);
  // La Lettura non vede la sicurezza; Laura (amministrazione 1) la vede senza dispositivi e feed.
  const lettura = await s.come('lettura@esempio.it');
  assert.equal((await lettura('sicurezza')).permesso, false);
  const laura = await s.come('laura@esempio.it');
  const sl = ok(await laura('sicurezza'));
  assert.deepEqual([sl.dispositivi, sl.feed], [[], undefined]);
  // Scollega tutti: solo il titolare, con la sua password; tutti escono, compreso chi chiede.
  assert.equal((await laura('scollegaTutti', { password: 'prova' })).ok, false);
  assert.equal((await manuel('scollegaTutti', { password: 'sbagliata' })).errore, 'La password è sbagliata');
  const marco = await s.come('marco@esempio.it');
  const r = ok(await manuel('scollegaTutti', { password: 'prova' }));
  assert.ok(r.scollegati >= 3);
  assert.equal((await manuel('io')).accesso, false);
  assert.equal((await marco('io')).accesso, false);
  // La coda del telefono resta: dopo l'accesso il rapportino in coda parte (una volta sola, con l'idLocale).
  const m2 = await s.come('marco@esempio.it');
  const rap = { idLocale: 'coda-dopo-scollega', data: '2026-10-21', idCliente: 'C001', idCommessa: '26ST001', descrizione: 'Dalla coda', oreLavoro: 2, km: 0 };
  const a = ok(await m2('salvaRapportino', { rapportino: rap }));
  const b = ok(await m2('salvaRapportino', { rapportino: rap }));
  assert.equal(a.rapportino.id, b.rapportino.id);
  manuel = await s.come('manuel@esempio.it');
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'scollegati tutti i dispositivi'"));
});

test('SESSIONE_GIORNI: da 30 a 365; un dispositivo fermo da piu\' giorni esce', async () => {
  assert.equal((await manuel('salvaImpostazioni', { valori: { SESSIONE_GIORNI: 10 } })).errore, 'Un dispositivo esce da solo dopo: da 30 a 365 giorni senza uso');
  ok(await manuel('salvaImpostazioni', { valori: { SESSIONE_GIORNI: 30 } }));
  const lettura = await s.come('lettura@esempio.it');
  s.wisper.db.esegui('UPDATE sessioni SET ultimo_uso = ? WHERE token_hash = ?', require('../src/utili').istante(new Date(require('../src/utili').adessoMs() - 40 * 86400000)), require('../src/utili').sha256(lettura.token));
  s.wisper.cacheSessione = null;
  assert.equal((await lettura('io')).accesso, false);
  ok(await manuel('salvaImpostazioni', { valori: { SESSIONE_GIORNI: 180 } }));
  s.wisper.cacheSessione = null;
});

test('stato del sistema: server, database, disco, lavori, collegamenti, versioni; l\'ora del NAS confrontata con quella del dispositivo', async () => {
  const st = ok(await manuel('statoSistema', { oraDispositivo: new Date(Date.now() - 6 * 60000).toISOString() }));
  assert.deepEqual([st.server.versione, st.server.schema, st.server.node], ['0.11.2', 8, process.versions.node]);
  assert.match(st.server.avvisoOra, /^L'ora del NAS è avanti di 6 minuti: i rapportini prendono l'ora del NAS$/);
  assert.ok(st.database.righe.rapportini > 0);
  assert.ok(Array.isArray(st.lavori) && st.lavori.some(l => l.nome === 'Copia'));
  assert.ok(typeof st.collegamenti.collegati === 'number');
  const pari = ok(await manuel('statoSistema', { oraDispositivo: new Date().toISOString() }));
  assert.equal(pari.server.avvisoOra, undefined);
  const marco = await s.come('marco@esempio.it');
  assert.equal((await marco('statoSistema')).permesso, false);
});

test('la lista di controllo: le righe dal server verdi o rosse da sole; Segna (Non va vuole la nota); una riga automatica invecchia col server nuovo; il cambio', async () => {
  const c = ok(await manuel('controlliFinali'));
  assert.equal(c.riassunto.totale, 77);
  const riga = k => c.gruppi.reduce((x, g) => x || g.righe.find(y => y.chiave === k), null);
  assert.equal(riga('M17.1').tipo, 'server');
  assert.equal(riga('M17.1').stato, 'non_va', 'VIES in Errore nei dati di esempio');
  assert.match(riga('M17.1').nota, /Verifica della partita IVA/);
  assert.equal(riga('M04.1').stato, 'fatto');
  assert.equal((await manuel('segnaControllo', { chiave: 'M17.1', stato: 'fatto' })).errore, 'Questa riga la controlla il server da solo');
  assert.equal((await manuel('segnaControllo', { chiave: 'T03', stato: 'non_va' })).errore, 'Nota: scrivi cosa non va');
  const r = ok(await manuel('segnaControllo', { chiave: 'M01.1', stato: 'fatto', nota: 'controlli-finali.html: 1.204 prove, 0 fallite' }));
  assert.deepEqual([r.riga.stato, r.riga.versione, r.riga.utente], ['fatto', '0.11.2', 'Manuel Gasparotto']);
  // Il server cambia versione: la riga automatica torna "da rifare".
  s.wisper.db.esegui("UPDATE controlli_finali SET versione = '0.10.9' WHERE chiave = 'M01.1'");
  const dopo = ok(await manuel('controlliFinali'));
  assert.equal(dopo.gruppi.reduce((x, g) => x || g.righe.find(y => y.chiave === 'M01.1'), null).stato, 'da_rifare');
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE nota = 'controllo segnato: M01.1 fatto'"));
  const laura = await s.come('laura@esempio.it');
  assert.equal((await laura('segnaControllo', { chiave: 'T03', stato: 'fatto' })).permesso, false);
  // Il cambio: solo il titolare.
  assert.equal((await laura('segnaCambio', { stato: 'prova' })).ok, false);
  const cb = ok(await manuel('segnaCambio', { stato: 'fatto' }));
  assert.equal(cb.cambio.stato, 'fatto');
  assert.ok(cb.cambio.cambioIl);
  const d = ok(await manuel('dashboard', { tutto: true }));
  assert.ok(!d.pianificare.some(v => v.tipo === 'controlli'), 'dopo il cambio la voce della lista prima del cambio sparisce');
  ok(await manuel('segnaCambio', { stato: 'prima' }));
});
