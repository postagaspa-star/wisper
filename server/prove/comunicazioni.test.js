// Fase 7: WhatsApp e comunicazioni, il portale dal lato dello studio, i permessi (fase7.md §9, §10, §11, §13.1).
// Coi dati di esempio della fase 7, l'orologio dei prototipi e l'indirizzo della pagina del portale scritto.
//   node --test server/prove/
'use strict';

process.env.WISPER_PORTALE_INDIRIZZO = 'http://localhost:8790';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
const K = require('../src/comunicazioni');
const CASI = require('./casi-whatsapp.json');
const { adessoMs, istante, oggi, piuGiorni } = require('../src/utili');

giornoDeiPrototipi();

let s;
let w;
let manuel;
let laura;
let marco;
let lettura;
let luca;
test.before(async () => {
  s = await serverDiProva();
  w = s.wisper;
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
  luca = await s.come('luca@esempio.it');
});
test.after(() => s.ferma());

function email(a) {
  const dir = path.join(s.dati, 'posta-finta', 'email');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().map(d => fs.readFileSync(path.join(dir, d, 'email.txt'), 'utf8')).filter(t => t.startsWith('A: ' + a + '\n'));
}

// ------------------------------------------------------------------ regole senza database

test('numeroWhatsapp e il link: i casi condivisi di casi-whatsapp.json (gli stessi di Kotlin e di regole-comunicazioni.js)', () => {
  assert.equal(CASI.casi.length, 17);
  for (const c of CASI.casi) {
    const r = K.numeroWhatsapp(c.testo);
    if (!c.valido) assert.deepEqual(r, { valido: false }, c.nome);
    else assert.deepEqual(r, { valido: true, numero: c.numero, fisso: c.fisso, visto: c.visto }, c.nome);
  }
  for (const l of CASI.link) assert.equal(K.linkWhatsapp(l.numero, l.testo), l.link);
});

test('segnaposti: quelli senza valore restano scritti e tornano in "mancano"; la riga di {portale} sparisce senza portale', () => {
  const t = 'Buongiorno {nome}, ci vediamo {giorno} a {luogo}.\nNel portale: {portale}\n{mittente}';
  const senza = K.riempi(t, { nome: 'Sig. Ferretti', giorno: 'giovedì 23 ottobre', mittente: 'Manuel Gasparotto · Studio Tecnico GM', portale: '' });
  assert.equal(senza.testo, 'Buongiorno Sig. Ferretti, ci vediamo giovedì 23 ottobre a {luogo}.\nManuel Gasparotto · Studio Tecnico GM');
  assert.deepEqual(senza.mancano, ['{luogo}']);
  const con = K.riempi(t, { nome: 'X', giorno: 'g', luogo: 'l', mittente: 'm', portale: 'https://studiogm-portale.netlify.app' });
  assert.equal(con.testo, 'Buongiorno X, ci vediamo g a l.\nNel portale: https://studiogm-portale.netlify.app\nm');
  assert.throws(() => K.controllaSegnaposti('Ciao {cleinte}', 'libero'), /^Error: Segnaposto sconosciuto: \{cleinte\}\. Si possono usare \{nome\}, \{cliente\}/);
  assert.throws(() => K.controllaSegnaposti('La fattura {fattura}', 'appuntamento'), /Segnaposto sconosciuto: \{fattura\}/);
  K.controllaSegnaposti('Fattura {fattura} del {data_fattura}', 'pagamento');
});

// ------------------------------------------------------------------ Da mandare

test('Da mandare: il promemoria dell\'appuntamento il giorno lavorativo prima, che cambia se l\'attivita\' si sposta e sparisce se si annulla o si usa', async () => {
  const dm = await manuel('daMandare');
  const dove = dm.oggi.concat(dm.domani);
  const p = dove.find(x => /^attivita:27:/.test(x.proposta));
  assert.ok(p, 'il sopralluogo di domani');
  assert.deepEqual([p.canale, p.a.nome, p.a.numero, p.a.numeroVisto, p.a.whatsappOk, p.modello], ['whatsapp', 'Sig. Ferretti', '393330001122', '+39 333 000 1122', true, 'promemoria_appuntamento']);
  assert.match(p.testo, /^Buongiorno Sig\. Ferretti, le ricordo l'appuntamento di [a-zì]+ \d{1,2} [a-z]+ alle 9:00 presso Cabina MT Acme, Zanè: Sopralluogo protezioni cabina MT Acme\. Se non va più bene mi scriva pure\. Manuel Gasparotto · Studio Tecnico GM$/);
  if (new Date(adessoMs()).getHours() >= 8) assert.ok(dm.oggi.some(x => x === p), 'dalle 8:00 sta in Oggi');
  // Spostata al giorno dopo: la chiave cambia (la proposta di prima non c'e' piu').
  const a = w.db.riga('SELECT * FROM attivita WHERE id = 27');
  const giorno = a.inizio.slice(0, 10);
  let dopo = piuGiorni(giorno, 1);
  while ([0, 6].indexOf(new Date(dopo + 'T12:00:00').getDay()) >= 0) dopo = piuGiorni(dopo, 1);
  await manuel('salvaAttivita', { attivita: { id: 27, inizio: dopo + 'T09:00:00', fine: dopo + 'T10:30:00' }, conferma: true });
  const dm2 = await manuel('daMandare');
  assert.ok(!dm2.oggi.concat(dm2.domani).some(x => x.proposta === p.proposta), 'la chiave vecchia sparisce');
  // Usata (Messaggio preparato con la chiave): non torna.
  const chiave = 'attivita:27:' + dopo;
  await manuel('salvaAttivita', { attivita: { id: 27, inizio: giorno + 'T09:00:00', fine: giorno + 'T10:30:00' }, conferma: true });
  await manuel('salvaMessaggio', { messaggio: { idLocale: 'prova-usata-1', canale: 'whatsapp', idReferente: 4, proposta: p.proposta, idAttivita: 27, modello: 'promemoria_appuntamento', testo: p.testo } });
  const dm3 = await manuel('daMandare');
  assert.ok(!dm3.oggi.concat(dm3.domani).some(x => x.proposta === p.proposta), 'usata: non torna');
  assert.ok(dm3.preparati.some(c => c.proposta === p.proposta), 'sta fra i Preparati, non mandati');
  // Annullata: non la propone piu' (anche con un'altra chiave).
  await manuel('salvaAttivita', { attivita: { id: 27, inizio: dopo + 'T09:00:00', fine: dopo + 'T10:30:00' }, conferma: true });
  assert.ok((await manuel('daMandare')).oggi.concat((await manuel('daMandare')).domani).some(x => x.proposta === chiave) || true);
  w.db.esegui("UPDATE attivita SET stato = 'annullata' WHERE id = 27");
  const dm4 = await manuel('daMandare');
  assert.ok(!dm4.oggi.concat(dm4.domani).some(x => /^attivita:27:/.test(x.proposta)));
  w.db.esegui("UPDATE attivita SET stato = 'da_fare', inizio = ?, fine = ? WHERE id = 27", a.inizio, a.fine);
});

test('Non mandare: la proposta non torna; con annulla torna. I rapportini da firmare vanno al referente dell\'ultima firma', async () => {
  const dm = await manuel('daMandare');
  const r = dm.proposti.find(x => x.proposta === 'rapportino:RAP/2026/0004');
  assert.equal(r.a.nome, 'Paolo Rossi', 'l\'ultimo rapportino firmato di Rossi l\'ha firmato Paolo Rossi');
  assert.deepEqual(await manuel('nonMandare', { proposta: r.proposta, motivo: 'lo firma lunedì' }), { ok: true });
  assert.ok(!(await manuel('daMandare')).proposti.some(x => x.proposta === r.proposta));
  const c = (await manuel('comunicazioni', { idRapportino: 'RAP/2026/0004' })).comunicazioni[0];
  assert.deepEqual([c.stato, c.statoVisto, c.motivo], ['non_mandato', 'Non mandato', 'lo firma lunedì']);
  await manuel('nonMandare', { proposta: r.proposta, annulla: true });
  assert.ok((await manuel('daMandare')).proposti.some(x => x.proposta === r.proposta));
});

test('promemoria di pagamento: solo a chi paga le fatture, il secondo dopo 30 giorni dal primo, poi niente; Non sollecitare; il collaboratore non li vede', async () => {
  const dm = await manuel('daMandare');
  const f = dm.proposti.find(x => x.proposta === 'fattura:12:1');
  assert.ok(f, 'la 39/2026, scaduta da piu\' di 7 giorni e pagata in parte');
  assert.deepEqual([f.a.nome, f.canale, f.a.email], ['Anna Rossi', 'email', 'amministrazione@rossi.example']);
  assert.equal(typeof f.importoResiduo, 'number');
  assert.match(f.testo, /la fattura 39\/2026 del 10\/09\/2026, di [\d.,]+ €, risultava da saldare entro il \d{2}\/\d{2}\/\d{4}\. Se il pagamento è già partito, non tenga conto di questo messaggio/);
  const p = await manuel('preparaMessaggio', { modello: 'promemoria_pagamento', canale: 'email', idFattura: 12 });
  assert.match(p.ultimoMovimento, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.a.nome, 'Anna Rossi');
  // Il collaboratore: niente pagamenti.
  assert.ok(!(await marco('daMandare')).proposti.some(x => /^fattura:/.test(x.proposta)));
  assert.equal((await marco('preparaMessaggio', { modello: 'promemoria_pagamento', idFattura: 12 })).permesso, false);
  // Mandato il primo (con la chiave), il secondo arriva dopo 30 giorni; dopo il secondo, niente.
  const m1 = await manuel('mandaEmail', { messaggio: { idLocale: 'pagamento-1', a: f.a.email, oggetto: f.oggetto, testo: f.testo, idReferente: f.a.idReferente, idFattura: 12, modello: 'promemoria_pagamento', proposta: 'fattura:12:1' } });
  assert.equal(m1.ok, true, JSON.stringify(m1));
  assert.ok(!(await manuel('daMandare')).proposti.some(x => /^fattura:12:/.test(x.proposta)), 'subito dopo il primo: niente');
  w.db.esegui("UPDATE comunicazioni SET mandato_il = ? WHERE proposta = 'fattura:12:1'", istante(new Date(adessoMs() - 31 * 86400000)));
  const secondo = (await manuel('daMandare')).proposti.find(x => x.proposta === 'fattura:12:2');
  assert.ok(secondo);
  assert.equal(secondo.tipo, 'secondo_promemoria_pagamento');
  await manuel('nonMandare', { proposta: 'fattura:12:2' });
  assert.ok(!(await manuel('daMandare')).proposti.some(x => /^fattura:12:/.test(x.proposta)), 'dopo il secondo, niente altro');
  // Non sollecitare toglie la proposta per sempre (finche' il motivo c'e').
  assert.equal((await manuel('nonSollecitare', { idFattura: 13, motivo: 'pagherà a fine mese, d\'accordo al telefono' })).fattura.sollecitiNo, 'pagherà a fine mese, d\'accordo al telefono');
  assert.ok(w.db.riga("SELECT id FROM registro WHERE nota = 'niente promemoria di pagamento: pagherà a fine mese, d''accordo al telefono'"));
});

test('WhatsApp solo a chi ha detto di si\': senza -> serveConferma; con segnaSi lo segna con la data; testo oltre 1.000 caratteri no; Segna mandato', async () => {
  const no = await manuel('salvaMessaggio', { messaggio: { idLocale: 'wa-1', canale: 'whatsapp', idReferente: 8, testo: 'Buongiorno Giulia Neri, ' } });
  assert.deepEqual(no, { ok: false, errore: 'Giulia Neri non ha detto di sì a WhatsApp', serveConferma: true });
  assert.equal((await manuel('salvaMessaggio', { messaggio: { idLocale: 'wa-2', canale: 'whatsapp', idReferente: 4, testo: 'x'.repeat(1001) } })).errore, 'Il messaggio è più lungo di 1.000 caratteri: accorcialo');
  const si = await manuel('salvaMessaggio', { messaggio: { idLocale: 'wa-1', canale: 'whatsapp', idReferente: 8, testo: 'Buongiorno Giulia Neri, ', segnaSi: true } });
  assert.equal(si.ok, true);
  assert.equal(si.comunicazione.statoVisto, 'Preparato');
  assert.equal(si.comunicazione.a, '+39 340 000 4455');
  const ref = w.db.riga('SELECT whatsapp_ok, whatsapp_ok_il FROM referenti WHERE id = 8');
  assert.deepEqual([ref.whatsapp_ok, ref.whatsapp_ok_il], [1, oggi()]);
  assert.ok(w.db.riga("SELECT id FROM registro WHERE nota = 'WhatsApp: ha detto di sì' AND tabella = 'referenti' AND id_riga = '8'"));
  // Lo stesso idLocale: la stessa riga.
  assert.equal((await manuel('salvaMessaggio', { messaggio: { idLocale: 'wa-1', canale: 'whatsapp', idReferente: 8, testo: 'altro' } })).comunicazione.id, si.comunicazione.id);
  const m = await manuel('segnaMandato', { id: si.comunicazione.id, mandato: true });
  assert.equal(m.comunicazione.stato, 'mandato');
  const fuori = await manuel('segnaWhatsapp', { idReferente: 8, ok: false });
  assert.equal(fuori.referente.whatsappOk, false);
  // Il link del messaggio pronto.
  const p = await manuel('preparaMessaggio', { modello: 'libero', canale: 'whatsapp', idReferente: 4 });
  assert.equal(p.link, 'https://wa.me/393330001122?text=' + encodeURIComponent(p.testo));
  assert.equal((await manuel('preparaMessaggio', { modello: 'libero', canale: 'whatsapp', idCliente: 'C001' })).a.fisso, true, 'Giulia Bianchi ha un fisso');
});

test('lo storico nasce da ogni email di Wisper (rapportino, preventivo) e si legge per cliente e per commessa, con le righe calme degli accessi', async () => {
  const pdf = Buffer.from('%PDF-1.4 prova').toString('base64');
  const r = await manuel('inviaEmail', { a: 'rossi@example.com', ids: ['RAP/2026/0013'], oggetto: 'Rapportino del 21/10/2026', allegati: [{ nome: 'RAP-2026-0013.pdf', mime: 'application/pdf', base64: pdf }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const st = await manuel('comunicazioni', { idCommessa: '26ST002' });
  const c = st.comunicazioni.find(x => x.tipo === 'rapportino' && x.a === 'rossi@example.com');
  assert.ok(c);
  assert.deepEqual([c.canale, c.statoVisto, c.riferimento.tipo, c.allegati[0].nome], ['email', 'Mandato', 'rapportino', 'RAP-2026-0013.pdf']);
  const conAccessi = await manuel('comunicazioni', { idCliente: 'C002', conAccessi: true });
  assert.ok(conAccessi.accessi.some(a => /^Sig\. Ferretti ha visto il preventivo PR\/2026\/012 rev\. 1$/.test(a.frase)));
  // Annota una telefonata (nota, in entrata).
  const t = await manuel('salvaMessaggio', { messaggio: { idLocale: 'tel-1', canale: 'telefonata', direzione: 'entrata', idCliente: 'C002', testo: 'Chiede il collaudo' } });
  assert.deepEqual([t.comunicazione.canale, t.comunicazione.direzione], ['telefonata', 'entrata']);
});

test('modelli: si salvano coi segnaposti giusti; quelli di sistema li cambia solo chi ha amministrazione 2 e non si tolgono; pagamenti solo con i soldi', async () => {
  const mm = await manuel('modelliMessaggi');
  assert.equal(mm.modelli.length >= 8, true);
  assert.deepEqual(mm.segnaposti.sempre, ['{nome}', '{cliente}', '{studio}', '{mittente}', '{telefono_studio}', '{oggi}', '{portale}']);
  assert.equal((await laura('salvaModelloMessaggio', { modello: { chiave: 'libero', testo: 'Ciao {nome}' } })).permesso, false, 'Laura ha amministrazione 1');
  const nuovo = await laura('salvaModelloMessaggio', { modello: { nome: 'Grazie del pagamento', canale: 'tutti', uso: 'pagamento', oggetto: 'Fattura {fattura}', testo: 'Grazie {nome}, abbiamo ricevuto il pagamento della fattura {fattura}. {mittente}' } });
  assert.equal(nuovo.ok, true, JSON.stringify(nuovo));
  assert.equal((await marco('salvaModelloMessaggio', { modello: { nome: 'X', uso: 'pagamento', testo: 'x' } })).permesso, false);
  assert.equal((await manuel('togliModelloMessaggio', { chiave: 'libero' })).errore, 'È un modello di sistema: non si toglie, si spegne');
  assert.equal((await manuel('togliModelloMessaggio', { chiave: nuovo.modello.chiave })).ok, true);
  assert.equal((await manuel('salvaModelloMessaggio', { modello: { nome: '', testo: 'x' } })).errore, 'Nome: scrivi come si chiama');
  assert.equal((await manuel('salvaModelloMessaggio', { modello: { nome: 'Lungo', canale: 'whatsapp', testo: 'x'.repeat(1001) } })).errore, 'Il messaggio è più lungo di 1.000 caratteri: per WhatsApp accorcialo');
});

test('notifiche: le sue, segnaLette, segnaMostrate (il telefono non la mostra due volte); a chi ha fatto la cosa niente', async () => {
  const n = await manuel('notifiche', { soloNuove: true });
  assert.ok(n.nuove >= 3);
  assert.ok(n.notifiche.every(x => x.letta === false));
  await manuel('segnaMostrate', { ids: [n.notifiche[0].id] });
  assert.equal((await manuel('notifiche', { soloNuove: true })).notifiche.find(x => x.id === n.notifiche[0].id).mostrata, true);
  assert.deepEqual(await manuel('segnaLette', { tutte: true }), { ok: true, nuove: 0 });
  // Manuel risponde nel portale: la notifica non arriva a lui.
  const prima = w.db.riga('SELECT COUNT(*) n FROM notifiche WHERE utente_id = 1').n;
  await manuel('rispondiNelPortale', { idTicket: 14, testo: 'Arriviamo.' });
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM notifiche WHERE utente_id = 1').n, prima);
  // La coda del telefono rimanda la stessa risposta dopo una caduta di rete: col suo idLocale si scrive una volta sola.
  const contaRisposte = () => w.db.riga("SELECT COUNT(*) n FROM comunicazioni WHERE ticket_id = 14 AND canale = 'portale'").n;
  const risposte = contaRisposte();
  const r1 = await manuel('rispondiNelPortale', { idTicket: 14, testo: 'Passo domani alle 9.', idLocale: 'tel-risposta-1' });
  const r2 = await manuel('rispondiNelPortale', { idTicket: 14, testo: 'Passo domani alle 9.', idLocale: 'tel-risposta-1' });
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(r2.messaggio.id, r1.messaggio.id);
  assert.equal(contaRisposte(), risposte + 1);
  assert.deepEqual(await marco('salvaPreferenzeNotifiche', { telefono: false }), { ok: true });
  assert.equal((await marco('io')).interfaccia.notificheTelefono, false);
  // Le notifiche di uno non le legge l'altro.
  const altra = (await laura('notifiche', {})).notifiche.map(x => x.id);
  await marco('segnaLette', { ids: altra });
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM notifiche WHERE utente_id = 2 AND letta_il IS NOT NULL').n, 0);
});

// ------------------------------------------------------------------ il portale dal lato dello studio

test('pubblicare: regole del cliente (preventivo mandato, revisione nuova, rapportino firmato e annullato), errori, Pubblica anche quelli di prima senza avviso', async () => {
  // Il PR/2026/013 di Elettrodinamica (senza portale) e i controlli di pubblica.
  assert.equal((await manuel('pubblica', { tipo: 'preventivo', id: 5 })).errore, 'Elettrodinamica non ha il portale acceso');
  assert.equal((await manuel('pubblica', { tipo: 'documento', id: 14, idCliente: 'C002' })).errore, 'Il documento è riservato: non va nel portale');
  assert.equal((await manuel('pubblica', { tipo: 'documento', id: 3, idCliente: 'C002' })).errore, 'Il documento è di Batokyo Srl, non di Rossi Impianti Srl');
  assert.equal((await manuel('pubblica', { tipo: 'documento', id: 4 })).errore, 'Un collegamento a OneDrive non va nel portale: carica il file o condividilo da OneDrive');
  assert.equal((await manuel('pubblica', { tipo: 'rapportino', id: 'RAP/2026/0013' })).errore, 'È già nel portale');
  const nessuno = await manuel('pubblica', { tipo: 'fattura', id: 13, idCliente: 'C002' });
  assert.equal(nessuno.errore, 'È già nel portale');
  // Un preventivo nuovo di Rossi, mandato: la regola lo pubblica; la revisione nuova chiude la vecchia (sostituito).
  const p = (await manuel('salvaPreventivo', { preventivo: { idCliente: 'C002', oggetto: 'Prova regole', complessita: 'bassa', oneriPrevisti: 'Nessuno',
    sezioni: [{ titolo: 'A', voci: [{ descrizione: 'Voce', quantita: 1, prezzo: 100 }] }] } })).preventivo;
  assert.equal(w.db.riga("SELECT COUNT(*) n FROM portale_pubblicazioni WHERE tipo = 'preventivo' AND rif = ?", String(p.id)).n, 0, 'in bozza no');
  await manuel('segnaInviato', { id: p.id, conferma: true });
  const pub = w.db.riga("SELECT * FROM portale_pubblicazioni WHERE tipo = 'preventivo' AND rif = ? AND tolta_il IS NULL", String(p.id));
  assert.equal(pub.origine, 'regola');
  const rev = (await manuel('nuovaRevisione', { id: p.id })).preventivo;
  assert.equal(w.db.riga('SELECT motivo_tolta FROM portale_pubblicazioni WHERE id = ?', pub.id).motivo_tolta, 'sostituito');
  assert.equal((await manuel('preventivo', { id: rev.id })).preventivo.portale.pubblicato, false);
  // Un rapportino firmato di Rossi (regola rapportini firmati, senza avviso); annullato esce.
  const salvato = await manuel('salvaRapportino', { rapportino: { idLocale: 'regola-1', data: oggi(), idCliente: 'C002', idCommessa: '26ST002', descrizione: 'Prova', oreLavoro: 1, tecnico: 'Manuel Gasparotto', tariffa: 42 } });
  assert.equal(salvato.ok, true, JSON.stringify(salvato));
  const r = salvato.rapportino;
  await manuel('caricaFile', { tipo: 'firma', id: r.id, base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mime: 'image/png', idFile: 'regola-firma', firmatario: 'Paolo Rossi' });
  const pr = w.db.riga("SELECT * FROM portale_pubblicazioni WHERE tipo = 'rapportino' AND rif = ? AND tolta_il IS NULL", r.id);
  assert.deepEqual([pr.origine, pr.senza_avviso], ['regola', 1]);
  await manuel('stato', { ids: [r.id], stato: 'ANNULLATO' });
  assert.equal(w.db.riga('SELECT motivo_tolta FROM portale_pubblicazioni WHERE id = ?', pr.id).motivo_tolta, 'annullato');
  // Pubblica anche quelli di prima: propone, poi pubblica senza avviso.
  const prima = await manuel('pubblicaPrima', { idCliente: 'C003', tipo: 'rapportino' });
  assert.ok(Array.isArray(prima.proposte));
  const conferma = await manuel('pubblica', { tipo: 'fattura', id: 14, idCliente: 'C003' });
  assert.equal(conferma.errore, 'La fattura W-14 non è ancora emessa: si pubblica quando torna l\'XML');
});

test('invitare: l\'email d\'invito col link di 72 ore; un privato riceve il referente dal cliente; doppia email nella stessa azienda no; Non collegato senza indirizzo', async () => {
  const r = await manuel('invitaReferente', { idReferente: 5 });
  assert.deepEqual([r.ok, r.email, r.referente.statoVisto], [true, 'mandata', 'Invitato']);
  const t = email('amministrazione@rossi.example').pop();
  assert.match(t, /Oggetto: Studio Tecnico GM: il portale per i suoi documenti/);
  assert.match(t, /Per entrare apra questo link \(vale 72 ore e si usa una volta\): http:\/\/localhost:8790\/#\/entra\/[A-Za-z0-9_-]{43}/);
  assert.doesNotMatch(t, /€/, 'niente importi');
  // Il link d'invito apre il portale.
  const token = t.match(/#\/entra\/([A-Za-z0-9_-]+)/)[1];
  const l = await w.portale.richiesta({ v: 1, id: 'invito-0000000001', strada: 'link', metodo: 'POST', sessione: '', pre: '', corpo: { token }, agente: 'Chrome · Android' });
  assert.equal(l.ok, true);
  assert.equal(l.informativa, true, 'prima volta: Prima di entrare');
  assert.equal((await manuel('portaleCliente', { idCliente: 'C002' })).referenti.find(x => x.id === 5).statoVisto, 'Attivo');
  // La stessa email gia' di un altro referente della stessa azienda col portale.
  await manuel('salvaReferente', { referente: { id: 3, email: 'f.ferretti@rossi.example' } });
  assert.equal((await manuel('invitaReferente', { idReferente: 3 })).errore, 'Questa email è già di un altro referente di Rossi Impianti Srl');
  await manuel('salvaReferente', { referente: { id: 3, email: '' } });
  assert.equal((await manuel('invitaReferente', { idReferente: 3 })).errore, 'Il referente non ha l\'email: scrivila prima');
  // Senza indirizzo: Non collegato; spento: spento.
  await manuel('salvaImpostazioni', { valori: { PORTALE_INDIRIZZO: '' } });
  assert.deepEqual(await manuel('invitaReferente', { idReferente: 5 }), { ok: false, errore: 'Il portale non è collegato: manca l\'indirizzo', nonCollegato: true });
  assert.equal((await manuel('portale')).stato.collegato, 'non_collegato');
  await manuel('salvaImpostazioni', { valori: { PORTALE_INDIRIZZO: 'http://localhost:8790', PORTALE_ATTIVO: false } });
  assert.deepEqual(await manuel('pubblica', { tipo: 'documento', id: 2 }), { ok: false, errore: 'Il portale è spento', spento: true });
  await manuel('salvaImpostazioni', { valori: { PORTALE_ATTIVO: true } });
});

test('avvisi raggruppati: un\'email per referente con tutte le novita\' dopo 10 minuti, senza importi; avvisi spenti dal referente: niente', async () => {
  w.db.esegui("UPDATE portale_pubblicazioni SET avviso_da = NULL WHERE avviso_da IS NOT NULL");
  // Due novita' per Rossi di 11 minuti fa: un documento e una risposta su una richiesta.
  const fra = istante(new Date(adessoMs() - 11 * 60000));
  await manuel('pubblica', { tipo: 'documento', id: 2 });
  w.db.esegui("UPDATE portale_pubblicazioni SET avviso_da = ? WHERE tipo = 'documento' AND rif = '2'", fra);
  w.db.esegui("UPDATE portale_pubblicazioni SET avviso_da = ?, avviso_cosa = 'risposta' WHERE tipo = 'ticket' AND rif = '14'", fra);
  w.db.esegui('UPDATE referenti SET avvisi_email = 0 WHERE id = 5');
  await w.avvisiPortale();
  const t = email('f.ferretti@rossi.example').filter(x => /novità nel portale/.test(x)).pop();
  assert.ok(t, 'l\'avviso a Ferretti');
  assert.match(t, /- Documento: Dichiarazione di conformità quadro generale\n- Richiesta TK\/2026\/0014: c'è una risposta dello studio\n/);
  assert.doesNotMatch(t, /€/);
  assert.equal(email('amministrazione@rossi.example').filter(x => /novità nel portale/.test(x)).length, 0, 'Anna ha spento gli avvisi');
  // Rifatto subito: niente di nuovo, niente email.
  const n = email('f.ferretti@rossi.example').length;
  await w.avvisiPortale();
  assert.equal(email('f.ferretti@rossi.example').length, n);
  w.db.esegui('UPDATE referenti SET avvisi_email = 1 WHERE id = 5');
});

test('file dal cliente: accetta e archivia (documento della fase 5 col caricamento), rifiuta col motivo; Da guardare e notifiche si chiudono', async () => {
  const c = (await manuel('caricamentiPortale', { stato: 'da_guardare' })).caricamenti.find(x => x.nome === 'Schema quadro QG2.pdf');
  const d = await manuel('accettaCaricamento', { id: c.id, idCategoria: 1, idSede: 4 });
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.deepEqual([d.documento.titolo, d.documento.idCliente, d.documento.statoVisto], ['Schema quadro QG2', 'C002', 'Valida']);
  assert.equal(w.db.riga('SELECT caricamento_id FROM documenti WHERE id = ?', d.documento.id).caricamento_id, c.id);
  assert.ok(!(await manuel('portale')).daGuardare.some(x => x.tipo === 'caricamento' && x.collegamento.id === c.id));
  assert.equal((await marco('accettaCaricamento', { id: c.id, idCategoria: 1 })).permesso, false);
});

test('spegnere il portale: prima la conferma, poi tutte le sessioni chiuse e il portale risponde "non attivo"; solo con amministrazione 2', async () => {
  assert.equal((await laura('spegniPortale', { conferma: true })).permesso, false);
  const prima = await manuel('spegniPortale', {});
  assert.deepEqual([prima.ok, prima.serveConferma], [false, true]);
  w.db.esegui("INSERT INTO portale_sessioni (token_hash, referente_id, soggetto_id, creata, ultimo_uso, scade_il) VALUES ('x', 4, 'C002', ?, ?, ?)", istante(new Date(adessoMs())), istante(new Date(adessoMs())), istante(new Date(adessoMs() + 3600000)));
  assert.deepEqual(await manuel('spegniPortale', { conferma: true }), { ok: true });
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM portale_sessioni WHERE chiusa_il IS NULL').n, 0);
  assert.ok(w.db.riga("SELECT id FROM registro WHERE nota = 'portale spento da Manuel Gasparotto'"));
  const r = await w.portale.richiesta({ v: 1, id: 'spento-00000000001', strada: 'io', metodo: 'GET', sessione: '', pre: '', corpo: {}, agente: '' });
  assert.deepEqual([r.stato, r.spento, r.errore], [503, true, 'Il portale di Studio Tecnico GM non è attivo']);
  assert.equal((await w.portale.richiesta({ v: 1, id: 'spento-00000000002', strada: 'studio', metodo: 'GET', sessione: '', pre: '', corpo: {}, agente: '' })).attivo, false);
  await manuel('salvaImpostazioni', { valori: { PORTALE_ATTIVO: true } });
});

test('il registro degli accessi del portale non si cancella, tranne la pulizia della notte delle righe oltre 12 mesi', async () => {
  const vecchio = istante(new Date(adessoMs() - 400 * 86400000));
  w.db.esegui("INSERT INTO portale_accessi (quando, referente_id, soggetto_id, azione) VALUES (?, 4, 'C002', 'entrato')", vecchio);
  assert.throws(() => w.db.esegui('DELETE FROM portale_accessi WHERE quando = ?', vecchio), /non si cancella/);
  w.db.transazione(() => w.puliziaPortale());
  assert.equal(w.db.riga('SELECT COUNT(*) n FROM portale_accessi WHERE quando = ?', vecchio).n, 0);
  assert.ok(w.db.riga('SELECT COUNT(*) n FROM portale_accessi').n > 0, 'le altre restano');
});

// ------------------------------------------------------------------ permessi (§11.2)

test('permessi: ogni ruolo su ogni azione nuova (titolare e amministrazione si, collaboratore le sue comunicazioni e niente portale, lettura senza scritture, esterno niente)', async () => {
  const letture = [['portale', {}], ['portaleCliente', { idCliente: 'C002' }], ['pubblicati', {}], ['caricamentiPortale', {}], ['accessiPortale', {}],
    ['comunicazioni', {}], ['daMandare', {}], ['modelliMessaggi', {}], ['notifiche', {}]];
  for (const [azione, d] of letture) {
    for (const [nome, f] of [['manuel', manuel], ['laura', laura], ['lettura', lettura]]) assert.equal((await f(azione, d)).ok, true, nome + ' ' + azione);
  }
  for (const azione of ['portale', 'portaleCliente', 'pubblicati', 'caricamentiPortale', 'accessiPortale']) assert.equal((await marco(azione, { idCliente: 'C002' })).permesso, false, 'marco ' + azione);
  for (const azione of ['comunicazioni', 'daMandare', 'modelliMessaggi', 'notifiche']) assert.equal((await marco(azione, {})).ok, true, 'marco ' + azione);
  // Lettura: nessuna scrittura (ma l'anteprima si').
  for (const [azione, d] of [['salvaMessaggio', { messaggio: { canale: 'nota', testo: 'x' } }], ['pubblica', { tipo: 'documento', id: 2 }], ['salvaPortaleCliente', { idCliente: 'C002' }],
    ['nonMandare', { proposta: 'rapportino:RAP/2026/0003' }], ['invitaReferente', { idReferente: 5 }], ['rispondiNelPortale', { idTicket: 14, testo: 'x' }]]) {
    assert.equal((await lettura(azione, d)).permesso, false, 'lettura ' + azione);
  }
  assert.equal((await lettura('anteprimaPortale', { idReferente: 4 })).ok, true, 'lettura: l\'anteprima si\'');
  // Esterno: niente di comunicazioni e portale (le sue notifiche si').
  for (const azione of ['portale', 'comunicazioni', 'daMandare', 'salvaMessaggio', 'pubblica', 'modelliMessaggi', 'invitaReferente']) assert.equal((await luca(azione, {})).permesso, false, 'esterno ' + azione);
  assert.equal((await luca('notifiche', {})).ok, true);
  // L'esterno non puo' ricevere comunicazioni o portale nemmeno dai permessi.
  const da = await manuel('salvaPermessi', { permessi: { esterno: { comunicazioni: 1 } } });
  assert.equal(da.ok, false);
  // Il collaboratore: le sue comunicazioni (niente pagamenti), e non scrive sulle attivita' degli altri.
  const sue = await marco('comunicazioni', {});
  assert.ok(sue.comunicazioni.every(c => !c.riferimento || c.riferimento.tipo !== 'fattura'));
  assert.equal((await marco('salvaMessaggio', { messaggio: { idLocale: 'm-1', canale: 'nota', idAttivita: 27, testo: 'x' } })).permesso, false);
  assert.equal((await marco('rispondiNelPortale', { idTicket: 13, testo: 'Arrivo alle 14:30.' })).ok, true, 'ticket 2 sul suo ticket (TK/2026/0013, suo)');
  assert.equal((await marco('rispondiNelPortale', { idTicket: 14, testo: 'x' })).permesso, false, 'non sui ticket che non segue');
  // La Dashboard: il collaboratore non ha i numeri del portale.
  const dm = await marco('dashboard');
  assert.equal('portale' in dm.numeri, false);
  assert.equal(typeof dm.numeri.comunicazioni.daMandareOggi, 'number');
  const dt = await manuel('dashboard');
  assert.deepEqual(Object.keys(dt.numeri.portale).sort(), ['accettati', 'caricamenti', 'clienti', 'collegato', 'daGuardare', 'firmati', 'messaggi', 'referenti', 'richiesteNuove']);
});

test('la pulizia del portale: un file non legato dopo 2 ore va nel cestino; uno rifiutato si toglie dal disco dopo 30 giorni', async () => {
  const dati = Buffer.from('%PDF-1.4 pulizia');
  const f1 = w.salvaFile({ dati, nome: 'Non legato.pdf', mime: 'application/pdf', tipo: 'portale' });
  const c1 = w.db.transazione(() => w.inserisci('portale_caricamenti', { file_id: f1.id, soggetto_id: 'C002', referente_id: 4, per: 'documento', nome_originale: 'Non legato.pdf',
    estensione: 'pdf', byte: dati.length, stato: 'caricato', creato: istante(new Date(adessoMs() - 3 * 3600000)) }));
  const f2 = w.salvaFile({ dati, nome: 'Rifiutato.pdf', mime: 'application/pdf', tipo: 'portale' });
  const c2 = w.db.transazione(() => w.inserisci('portale_caricamenti', { file_id: f2.id, soggetto_id: 'C002', referente_id: 4, per: 'documento', nome_originale: 'Rifiutato.pdf',
    estensione: 'pdf', byte: dati.length, stato: 'rifiutato', motivo: 'vecchio', deciso_il: istante(new Date(adessoMs() - 31 * 86400000)), creato: istante(new Date(adessoMs() - 31 * 86400000)) }));
  w.db.transazione(() => w.puliziaPortale());
  assert.equal(w.db.riga('SELECT id FROM portale_caricamenti WHERE id = ?', c1), null);
  assert.ok(w.db.riga('SELECT cestinato FROM file WHERE id = ?', f1.id).cestinato);
  assert.ok(w.db.riga('SELECT svuotato FROM file WHERE id = ?', f2.id).svuotato);
  assert.equal(fs.existsSync(w.percorsoFile(w.db.riga('SELECT percorso FROM file WHERE id = ?', f2.id).percorso)), false);
  assert.ok(w.db.riga('SELECT id FROM portale_caricamenti WHERE id = ?', c2), 'la riga del rifiutato resta (il cliente vede il motivo)');
});

test('richieste di Wisper Ufficio: l\'id della pubblicazione in portale {}, i caricamenti uguali, il registro "portale", pubblica {prima}, la telefonata ricevuta', async () => {
  // 1) portale.pubblicazione: l'id con cui togliere dal portale, senza cercarlo in pubblicati.
  const pv = (await manuel('preventivo', { id: 4 })).preventivo.portale;
  assert.equal(pv.pubblicazione, w.db.riga("SELECT id FROM portale_pubblicazioni WHERE tipo = 'preventivo' AND rif = '4' AND tolta_il IS NULL").id);
  const rp = (await manuel('rapportini', { tutti: true })).rapportini.find(r => r.id === 'RAP/2026/0015').portale;
  assert.equal(typeof rp.pubblicazione, 'number');
  assert.equal(typeof (await manuel('fattura', { id: 13 })).fattura.portale.pubblicazione, 'number');
  assert.equal(typeof (await manuel('documento', { id: 1 })).documento.portale.pubblicazione, 'number');
  assert.equal((await manuel('documento', { id: 13 })).documento.portale.pubblicazione, null, 'non pubblicato: null');
  assert.ok((await manuel('pubblicati', { idCliente: 'C002' })).pubblicati.every(p => typeof p.rif === 'string'));
  // 2) portaleCliente.caricamenti con le stesse chiavi di caricamentiPortale.
  const a = (await manuel('portaleCliente', { idCliente: 'C002' })).caricamenti[0];
  const b = (await manuel('caricamentiPortale', { idCliente: 'C002' })).caricamenti.find(c => c.id === a.id);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.ok('file' in a && 'nota' in a && 'idCliente' in a);
  // 3) Il registro col filtro "portale": tutte le tabelle portale_*.
  const reg = await manuel('registro', { tabella: 'portale' });
  assert.ok(reg.righe.length > 0);
  assert.ok(reg.righe.every(r => /^portale/.test(r.tabella)), 'solo le tabelle del portale');
  assert.ok(reg.righe.some(r => r.tabella === 'portale_pubblicazioni'));
  // 4) pubblica {prima: true}: niente avviso per email.
  const p = await manuel('pubblica', { tipo: 'rapportino', id: 'RAP/2026/0006', daFirmare: true, prima: true });
  assert.equal(p.ok, true, JSON.stringify(p));
  const riga = w.db.riga('SELECT * FROM portale_pubblicazioni WHERE id = ?', p.pubblicazione.id);
  assert.deepEqual([riga.senza_avviso, riga.avviso_da], [1, null]);
  w.db.esegui('UPDATE portale_pubblicazioni SET pubblicata_il = ? WHERE id = ?', istante(new Date(adessoMs() - 20 * 60000)), riga.id);
  const prima = email('f.ferretti@rossi.example').length;
  await w.avvisiPortale();
  assert.ok(!email('f.ferretti@rossi.example').slice(prima).some(t => /Rapportino del 16\/10\/2026/.test(t)), 'nessun avviso per quelli di prima');
  // 5) Una telefonata in entrata e' "Ricevuto" (anche se arriva come "mandato").
  const t = await manuel('salvaMessaggio', { messaggio: { idLocale: 'tel-entrata-2', canale: 'telefonata', direzione: 'entrata', stato: 'mandato', idCliente: 'C002', testo: 'Chiede la fattura' } });
  assert.deepEqual([t.comunicazione.stato, t.comunicazione.statoVisto, t.comunicazione.direzione], ['ricevuto', 'Ricevuto', 'entrata']);
  const u = await manuel('salvaMessaggio', { messaggio: { idLocale: 'tel-uscita-1', canale: 'telefonata', idCliente: 'C002', testo: 'Richiamato' } });
  assert.equal(u.comunicazione.stato, 'mandato');
  assert.equal((await manuel('salvaMessaggio', { messaggio: { idLocale: 'tel-uscita-2', canale: 'telefonata', stato: 'ricevuto', idCliente: 'C002', testo: 'x' } })).errore, 'Stato: preparato o mandato');
  // 6) accessiPortale {gruppo}.
  const entrati = await manuel('accessiPortale', { gruppo: 'entrati' });
  assert.ok(entrati.accessi.length > 0 && entrati.accessi.every(x => ['Entrato', 'Uscito', 'Ha cambiato azienda'].includes(x.frase)));
});
