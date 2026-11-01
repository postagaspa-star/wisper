// Fase 6: collaboratori esterni, incarichi e il ruolo "esterno" (fase6.md §3.10, §3.11, §8). Il fornitore che diventa
// collaboratore (doppione per partita IVA); l'idoneita' coi documenti e le scadenze; affidare con l'idoneita' non in
// regola (conferma, nota nel registro); la ricevuta collegata all'incarico dall'XML; il costo della commessa con
// collaboratori e altre ricevute; l'esterno che vede solo le sue commesse e i suoi compensi e non trova le altre cose
// (prova su ogni azione), che scrive rapportini con l'incarico messo da solo; le spese dell'esterno fuori dai rimborsi.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva } = require('./aiuto');
const { oggi, piuGiorni } = require('../src/utili');
const { AZIONI, AZIONI_ESTERNO } = require('../src/richieste');

let s;
let manuel;
let laura;
let marco;
let lettura;
let luca;
const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const T = oggi();
const IV = 'F006';

test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
  luca = await s.come('luca@esempio.it');
});
test.after(() => s.ferma());

const PDF = t => Buffer.from('%PDF-1.4\n% ' + t + '\n%%EOF\n');
async function carica(chi, nome, per) {
  const r = await fetch(s.url + '/carica?' + new URLSearchParams({ nome, mime: 'application/pdf', per: per || 'collaboratore' }), {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + chi.token }, body: PDF(nome),
  });
  return r.json();
}

test('la scheda: idoneita\' coi documenti, incarichi, compensi; chi la vede (i soldi con costi); il collaboratore no', async () => {
  const c = ok(await manuel('collaboratore', { id: IV })).collaboratore;
  assert.deepEqual([c.nome, c.tipo, c.idoneita.stato, c.idoneita.parola, c.idoneita.prossima.tipo, c.programmaDurc], ['Impianti Veneti di Sartori Luca', 'impresa', 'in_regola', 'In regola', 'durc', 'non collegato']);
  assert.deepEqual(c.idoneita.servono, ['durc', 'visura', 'idoneita', 'polizza']);
  assert.equal(c.documenti.length, 4);
  assert.deepEqual([c.tariffa, c.compensi.daFatturare], [32, 720]);
  assert.ok(c.accessi.some(a => a.email === 'luca@esempio.it'));
  const l = ok(await lettura('collaboratori', {})).collaboratori.find(x => x.idSoggetto === IV);
  assert.equal(l.daFatturare, 720, 'lettura ha costi 1');
  assert.equal((await marco('collaboratori', {})).permesso, false);
  assert.equal((await marco('incarichi', {})).permesso, false);
  // Il fornitore ha collaboratore: true nelle anagrafiche.
  assert.equal(ok(await manuel('anagrafiche')).fornitori.find(f => f.id === IV).collaboratore, true);
});

test('nuovo collaboratore: un doppione per partita IVA torna il fornitore che c\'e\'; senza documenti "Manca il DURC"; l\'occasionale e\' in regola', async () => {
  const forn = ok(await manuel('anagrafiche')).fornitori.find(f => f.id === 'F001');
  const dopp = ok(await manuel('salvaCollaboratore', { collaboratore: { soggetto: { nome: 'Un altro nome', partitaIva: forn.partitaIva }, tipo: 'impresa', mestiere: 'Forniture' } })).collaboratore;
  assert.equal(dopp.idSoggetto, 'F001', 'stessa partita IVA: lo stesso fornitore');
  assert.equal(dopp.idoneita.stato, 'manca');
  assert.match(dopp.idoneita.frase, /^Manca il DURC/);
  const occ = ok(await manuel('salvaCollaboratore', { collaboratore: { soggetto: { nome: 'Giulio Esempio', codiceFiscale: 'SMPGLI80A01L840X' }, tipo: 'occasionale', mestiere: 'Disegnatore' } })).collaboratore;
  assert.match(occ.idSoggetto, /^F\d{3}$/);
  assert.deepEqual([occ.idoneita.stato, occ.comunicazioneIspettorato], ['in_regola', 'non collegato']);
  // La tariffa vuole costi 2: Laura si', Marco non scrive proprio.
  assert.equal((await marco('salvaCollaboratore', { collaboratore: { idSoggetto: occ.idSoggetto, tipo: 'occasionale' } })).permesso, false);
  ok(await laura('salvaCollaboratore', { collaboratore: { idSoggetto: occ.idSoggetto, tipo: 'occasionale', tariffa: 25 } }));
  // Il DURC caricato: la scadenza proposta (120 giorni) e l'idoneita' che cambia frase.
  const f = ok(await carica(manuel, 'durc-f001.pdf')).file;
  const cat = ok(await manuel('categorieDocumenti')).categorie.find(x => x.nome === 'Documenti dei collaboratori');
  const doc = ok(await manuel('salvaDocumento', { documento: { titolo: 'DURC', idCategoria: cat.id, idSoggetto: 'F001', dataDocumento: T, idFile: f.id, tipoScadenza: 'durc' } })).documento;
  assert.equal(doc.scadenza.data, piuGiorni(T, 120));
  const dopo = ok(await manuel('collaboratore', { id: 'F001' })).collaboratore;
  assert.equal(dopo.idoneita.mancano.includes('DURC'), false);
});

test('affidare: con l\'idoneita\' non in regola chiede conferma e lo scrive nel registro; i conti dell\'incarico (casi-incarichi.json)', async () => {
  const inc = ok(await manuel('salvaIncarico', { incarico: { idSoggetto: 'F001', idCommessa: '26ST002', titolo: 'Fornitura e posa canaline', modo: 'ore', tariffa: 32, orePreviste: 16, tetto: 500 } })).incarico;
  assert.match(inc.numero, /^IN\/\d{4}\/\d{3}$/);
  assert.equal(inc.stato, 'bozza');
  assert.deepEqual([inc.conti.pattuito, inc.conti.maturato], [500, 0]);
  const domanda = await manuel('affidaIncarico', { id: inc.id });
  assert.equal(domanda.serveConferma, true);
  assert.match(domanda.errore, /: lo affido lo stesso\?$/);
  assert.equal((await lettura('affidaIncarico', { id: inc.id, conferma: true })).permesso, false);
  const aff = ok(await manuel('affidaIncarico', { id: inc.id, conferma: true })).incarico;
  assert.equal(aff.stato, 'affidato');
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'incarichi' AND id_riga = ? AND nota LIKE 'incarico affidato con l''idoneità non in regola:%'", String(inc.id)));
  // A ore: l'avanzamento no.
  assert.equal((await manuel('aggiornaAvanzamento', { id: inc.id, avanzamento: 50 })).errore, 'L\'avanzamento è degli incarichi a corpo: a ore contano le ore');
  // Annullare un incarico con una ricevuta collegata no.
  assert.match((await manuel('annullaIncarico', { id: 1, motivo: 'Prova' })).errore, /^L'incarico ha la fattura 18\/\d{4}: scollegala prima$/);
  // Concludere e valutare.
  ok(await manuel('concludiIncarico', { id: inc.id }));
  const val = ok(await manuel('valutaIncarico', { id: inc.id, valutazione: 'bene', nota: 'Puntuale' })).incarico;
  assert.deepEqual([val.stato, val.valutazione, val.valutazioneVista], ['concluso', 'bene', 'Bene']);
});

test('la fattura ricevuta del collaboratore dall\'XML: la proposta dell\'incarico; collegata, entra nei compensi e nel costo della commessa', async () => {
  const prima = ok(await manuel('incarico', { id: 1 })).incarico.conti;
  const commessaPrima = s.wisper.db.riga("SELECT id FROM commesse WHERE id = '26ST001'");
  assert.ok(commessaPrima);
  const costoPrima = ok(await manuel('costoCommessa', { idCommessa: '26ST001' })).costoCommessa;
  // L'XML di un professionista (prove/xml) col cedente cambiato negli Impianti Veneti.
  const piva = s.wisper.db.riga('SELECT partita_iva FROM soggetti WHERE id = ?', IV).partita_iva.replace(/^IT/, '');
  let xml = fs.readFileSync(path.join(__dirname, 'xml', 'IT01122334459_00015.xml'), 'utf8');
  xml = xml.split('01122334459').join(piva).split('Ing. Paolo Verdi').join('Impianti Veneti di Sartori Luca').split('<Numero>15</Numero>').join('<Numero>27</Numero>');
  const l = ok(await manuel('leggiXml', { file: [{ nome: 'IT' + piva + '_00027.xml', base64: Buffer.from(xml, 'utf8').toString('base64') }] }));
  const d = l.documenti[0];
  assert.deepEqual([d.tipo, d.controparte.idSoggetto, d.proposta.idIncarico, d.proposta.idCommessa], ['ricevuta', IV, 1, '26ST001']);
  assert.ok(d.avvisi.some(a => /720,00/.test(a)), JSON.stringify(d.avvisi));
  const r = ok(await manuel('confermaXml', { idLettura: l.idLettura, scelte: [{ chiave: d.chiave, azione: 'nuova', idIncarico: 1 }] }));
  const ric = r.ricevute[0];
  assert.deepEqual([ric.idIncarico, ric.idCommessa], [1, '26ST001']);
  const dopo = ok(await manuel('incarico', { id: 1 })).incarico.conti;
  assert.equal(dopo.fatturato, Math.round((prima.fatturato + ric.imponibile) * 100) / 100);
  assert.equal(dopo.costo, Math.round((prima.costo + ric.imponibile + ric.contributo + ric.bollo) * 100) / 100);
  // Nel costo della commessa: "collaboratori" sale, il totale anche; le altre ricevute no.
  const costoDopo = ok(await manuel('costoCommessa', { idCommessa: '26ST001' })).costoCommessa;
  assert.equal(costoDopo.collaboratori, dopo.costo);
  assert.equal(costoDopo.altreRicevute, costoPrima.altreRicevute);
  assert.equal(costoDopo.totale, Math.round((costoPrima.totale + (dopo.costo - prima.costo)) * 100) / 100);
  assert.equal(costoDopo.collaboratoriPrevisto, Math.max(3200, dopo.fatturato));
  // L'incarico di un altro fornitore non si collega.
  assert.match((await manuel('salvaRicevuta', { ricevuta: { id: ric.id, idIncarico: s.wisper.db.riga("SELECT id FROM incarichi WHERE soggetto_id = 'F001'").id } })).errore || '', /./);
});

test('il costo della commessa: le fatture ricevute con la commessa e senza incarico (e senza spesa) in "altre ricevute"', async () => {
  const prima = ok(await manuel('costoCommessa', { idCommessa: '26ST003' })).costoCommessa;
  const ric = s.wisper.db.riga("SELECT * FROM fatture_ricevute WHERE stato = 'attiva' AND incarico_id IS NULL AND spesa_id IS NULL AND (commessa_id = '' OR commessa_id IS NULL) ORDER BY id LIMIT 1");
  ok(await manuel('salvaRicevuta', { ricevuta: { id: ric.id, idCommessa: '26ST003' } }));
  const dopo = ok(await manuel('costoCommessa', { idCommessa: '26ST003' })).costoCommessa;
  const quanto = Math.round((ric.imponibile + ric.contributo + ric.bollo) * 100) / 100;
  assert.equal(dopo.altreRicevute, Math.round((prima.altreRicevute + quanto) * 100) / 100);
  assert.equal(dopo.totale, Math.round((prima.totale + quanto) * 100) / 100);
  // Solo con costi: senza, la risposta ha solo idCommessa.
  assert.equal('costoCommessa' in ok(await marco('costoCommessa', { idCommessa: '26ST001' })), false);
  assert.equal((await luca('costoCommessa', { idCommessa: '26ST001' })).permesso, false);
});

test('l\'esterno: ogni azione fuori dalla sua lista risponde "non hai il permesso" prima di cercare qualunque cosa', async () => {
  const fuori = Object.keys(AZIONI).filter(a => !AZIONI_ESTERNO.has(a) && !AZIONI[a].pubblica);
  assert.ok(fuori.length > 150, 'quasi tutto e\' fuori: ' + fuori.length);
  for (const azione of fuori) {
    const r = await luca(azione, { id: 1, idPersona: 3, idSoggetto: 'F001', idCommessa: '26ST002' });
    assert.equal(r.permesso, false, azione + ': ' + JSON.stringify(r).slice(0, 120));
  }
  // Le cose dello studio che un esterno non deve vedere, una per una.
  for (const a of ['clienti', 'fornitori', 'preventivi', 'fatture', 'ricevute', 'movimenti', 'persone', 'persona', 'mezzi', 'attrezzature', 'registro', 'utenti', 'permessi', 'impostazioni', 'daApprovare', 'statoServer']) {
    if (AZIONI[a]) assert.equal((await luca(a, {})).permesso, false, a);
  }
});

test('l\'esterno: vede solo la commessa del suo incarico (senza budget ne\' note), il cliente col nome, i suoi rapportini, documenti, scadenze, compensi', async () => {
  const a = ok(await luca('anagrafiche'));
  assert.deepEqual(a.commesse.map(m => m.id), ['26ST001']);
  assert.deepEqual([a.commesse[0].budgetOre, a.commesse[0].note, a.commesse[0].persone, a.commesse[0].responsabileId], [null, '', [], null]);
  for (const k of ['budgetEuro', 'prezzoOrario', 'costoOrario', 'margine']) assert.equal(k in a.commesse[0], false, k);
  assert.deepEqual(a.clienti.map(c => Object.keys(c).sort()), [['alias', 'cliente', 'fornitore', 'gruppo', 'id', 'nome']]);
  assert.deepEqual([a.fornitori, a.referenti], [[], []]);
  assert.deepEqual(a.utenti.map(u => u.id), [5]);
  // Le sue cose.
  assert.deepEqual(ok(await luca('collaboratori', {})).collaboratori.map(c => c.idSoggetto), [IV]);
  const scheda = ok(await luca('collaboratore', {})).collaboratore;
  assert.equal(scheda.idSoggetto, IV);
  for (const k of ['note', 'valutazioni']) assert.equal(k in scheda, false, k + ': il giudizio dello studio non e\' suo');
  assert.deepEqual(scheda.accessi, []);
  assert.deepEqual(scheda.compensi, ok(await manuel('collaboratore', { id: IV })).collaboratore.compensi, 'i suoi compensi: soldi suoi');
  assert.equal((await luca('collaboratore', { id: 'F001' })).ok, false, 'un altro collaboratore non lo trova');
  const inc = ok(await luca('incarichi', {})).incarichi;
  assert.ok(inc.length >= 1 && inc.every(i => i.idSoggetto === IV));
  inc.forEach(i => ['valutazione', 'valutazioneVista', 'daValutare'].forEach(k => assert.equal(k in i, false, k)));
  const altro = s.wisper.db.riga("SELECT id FROM incarichi WHERE soggetto_id <> ?", IV);
  assert.equal((await luca('incarico', { id: altro.id })).ok, false);
  assert.deepEqual(ok(await luca('compensi', {})).righe.map(r => r.idSoggetto), [IV]);
  const docs = ok(await luca('documenti', {})).documenti;
  assert.ok(docs.length && docs.every(d => d.idCliente === IV || d.idCommessa === '26ST001'));
  assert.ok(docs.every(d => d.vede === 'tutti'));
  const sc = ok(await luca('scadenze', {}));
  assert.ok(sc.scadute.concat(sc.entro, sc.piuAvanti).every(x => x.idSoggetto === IV || x.idCliente === IV));
  // Attivita': solo le sue (nessuna), non quelle libere dello studio.
  assert.deepEqual(ok(await luca('attivita', {})).attivita, []);
  assert.deepEqual(ok(await luca('tickets', {})).ticket, []);
  // La sua Dashboard.
  const d = ok(await luca('dashboard', { tutto: true }));
  assert.equal(d.per, 'esterno');
  assert.ok(d.settimana.some(v => v.titolo === 'Il DURC scade fra 7 giorni: carica quello nuovo'));
  assert.deepEqual(d.incarichi.map(i => i.id), inc.filter(i => i.stato === 'affidato').map(i => i.id));
  assert.equal('soldi' in d.numeri, false);
  // Esporta: solo rapportini, ore, spese.
  ok(await luca('esporta', { cosa: 'rapportini' }));
  assert.equal((await luca('esporta', { cosa: 'commesse' })).permesso, false);
  assert.equal((await luca('esporta', { cosa: 'compensi' })).permesso, false);
});

test('l\'esterno scrive: rapportino e ore sulla commessa del suo incarico (l\'incarico da solo, costo 0); altrove no; le sue spese fuori dai rimborsi', async () => {
  const r = ok(await luca('salvaRapportino', { rapportino: { idLocale: 'luca-1', data: T, tecnico: 'Luca Sartori', idCliente: 'C001', idCommessa: '26ST001', descrizione: 'Cablaggio quadro 4', oreLavoro: 4 } })).rapportino;
  assert.equal(r.idIncarico, 1);
  for (const k of ['tariffa', 'totale', 'costoOrario', 'importo']) assert.equal(k in r, false, k);
  assert.strictEqual(s.wisper.db.riga('SELECT costo_orario FROM rapportini WHERE id = ?', r.id).costo_orario, 0);
  assert.equal((await luca('salvaRapportino', { rapportino: { idLocale: 'luca-2', data: T, tecnico: 'Luca Sartori', idCliente: 'C002', idCommessa: '26ST002', oreLavoro: 1 } })).errore,
    'Non hai un incarico su 26ST002: chiedi allo studio');
  assert.equal((await luca('salvaRapportino', { rapportino: { idLocale: 'luca-3', data: T, tecnico: 'Luca Sartori', cliente: 'Cliente Nuovo Srl', oreLavoro: 1 } })).permesso, false);
  const ore = ok(await luca('salvaOre', { riga: { data: T, idCommessa: '26ST001', ore: 2, descrizione: 'Collaudo', idLocale: 'luca-ore-1' } })).riga;
  assert.equal(ore.idIncarico, 1);
  assert.equal((await luca('salvaOre', { riga: { data: T, idCommessa: '26ST003', ore: 2, idLocale: 'luca-ore-2' } })).errore, 'Non hai un incarico su 26ST003: chiedi allo studio');
  // I suoi rapportini e solo quelli.
  assert.ok(ok(await luca('rapportini', { tutti: true })).rapportini.every(x => x.idUtente === 5));
  const altrui = s.wisper.db.riga('SELECT id FROM rapportini WHERE utente_id = 3');
  assert.equal((await luca('stato', { id: altrui.id, stato: 'INVIATO' })).ok, false);
  // La spesa pagata da lui: nell'incarico, non nei rimborsi dello studio.
  const sp = ok(await luca('salvaSpesa', { spesa: { data: T, importo: 12.5, categoria: 'pedaggio', idCommessa: '26ST001', pagataDaMe: true } })).spesa;
  assert.equal(sp.idIncarico, 1);
  ok(await manuel('approva', { voci: [{ tipo: 'spesa', id: sp.id }] }));
  assert.equal(ok(await manuel('rimborsi', {})).persone.some(p => p.idUtente === 5), false);
  // Le ore approvate dell'esterno su un incarico a ore maturano il compenso (qui a corpo: niente cambia).
  ok(await manuel('approva', { voci: [{ tipo: 'ore', id: ore.id }] }));
  assert.equal(ok(await manuel('incarico', { id: 1 })).incarico.conti.oreApprovate, 2);
  // Un documento suo (DURC nuovo): lo carica lui con per=collaboratore.
  const f = ok(await carica(luca, 'durc-nuovo.pdf')).file;
  const cat = ok(await manuel('categorieDocumenti')).categorie.find(x => x.nome === 'Documenti dei collaboratori');
  const doc = ok(await luca('salvaDocumento', { documento: { titolo: 'DURC nuovo', idCategoria: cat.id, idSoggetto: IV, dataDocumento: T, idFile: f.id, tipoScadenza: 'durc' } })).documento;
  assert.equal(doc.idSoggetto, IV);
  assert.equal((await carica(luca, 'x.pdf', 'persona')).permesso, false);
});

test('invitaEsterno: un utente "esterno" legato al collaboratore; un esterno non ha mai i moduli vietati', async () => {
  assert.equal((await laura('invitaEsterno', { idSoggetto: IV, nome: 'Anna Sartori', email: 'anna@esempio.it' })).permesso, false, 'amministrazione 1: no');
  const r = ok(await manuel('invitaEsterno', { idSoggetto: IV, nome: 'Anna Sartori', email: 'anna@esempio.it' }));
  assert.ok(r.password || r.passwordIniziale || r.utente);
  const u = s.wisper.db.riga("SELECT * FROM utenti WHERE email = 'anna@esempio.it'");
  assert.deepEqual([u.ruolo, u.soggetto_id], ['esterno', IV]);
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM persone WHERE utente_id = ?', u.id).n, 0, 'un esterno non e\' una persona dello studio');
  // salvaPermessi non da' a esterno i moduli vietati.
  const no = await manuel('salvaPermessi', { permessi: { esterno: { persone: 1 } } });
  assert.equal(no.ok, false);
  assert.match(no.errore, /Un esterno non può vedere i soldi, le persone e l'amministrazione dello studio/);
});
