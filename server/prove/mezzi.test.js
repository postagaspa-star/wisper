// Fase 6: mezzi, assegnazioni, prestiti e DPI (fase6.md §7.1-7.4, §7.7, §5.5). Mezzo dello studio: trasferta senza
// rimborso; auto di una persona: come oggi; km piu' bassi rifiutati, salto grande con conferma, idLocale ripetuto;
// tagliando a km e revisione proposta (casi-mezzi.json); guasto con fermo che blocca "Lo prendo io"; costi del mezzo
// senza doppioni; una sola assegnazione in corso; "Lo prendo io" e "Restituisci" dalla coda; prestito in ritardo nella
// Dashboard; le consegne dei DPI firmate. Le date sono relative a oggi.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, PNG } = require('./aiuto');
const { oggi, piuGiorni } = require('../src/utili');
const C = require('../src/conti');

let s;
let manuel;
let laura;
let marco;
let lettura;
let luca;
const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const T = oggi();
const DOBLO = 2;
const VOLVO = 1;

test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
  luca = await s.come('luca@esempio.it');
});
test.after(() => s.ferma());

const voci = d => d.urgenti.concat(d.settimana, d.pianificare);

test('i mezzi: dello studio o di una persona, chi ce l\'ha, km, tagliando, scadenze; il collaboratore vede prima i suoi; l\'esterno no', async () => {
  const m = ok(await manuel('mezzi', {}));
  const doblo = m.mezzi.find(x => x.id === DOBLO);
  assert.deepEqual([doblo.titolo, doblo.proprieta, doblo.proprietaVista, doblo.statoVisto, doblo.chi.nome, doblo.euroKm],
    ['Fiat Doblò GA123BC', 'studio', 'Dello studio', 'Assegnato a Marco Rossato', 'Marco Rossato', null]);
  assert.equal(doblo.kmAlTagliando, C.kmAlTagliando({ tagliandoKm: 15000, tagliandoUltimoKm: 75000, km: doblo.km }));
  assert.equal(doblo.prossimaScadenza.tipo, 'assicurazione');
  const volvo = m.mezzi.find(x => x.id === VOLVO);
  assert.deepEqual([volvo.proprieta, volvo.statoVisto, volvo.euroKm], ['persona', 'Auto di Manuel Gasparotto', 0.76]);
  const suoi = ok(await marco('mezzi', {}));
  assert.equal(suoi.mezzi[0].id, DOBLO, 'prima quelli che ha lui');
  assert.equal(suoi.mezzi[0].mio, true);
  assert.equal((await luca('mezzi', {})).permesso, false);
  assert.equal((await luca('mezzo', { id: DOBLO })).permesso, false);
  // La scheda: le scadenze del mezzo (assicurazione, bollo, revisione, tagliando).
  const scheda = ok(await manuel('mezzo', { id: DOBLO })).mezzo;
  assert.deepEqual(scheda.scadenze.map(x => x.tipo).sort(), ['assicurazione', 'bollo', 'revisione'], "il tagliando del Doblo' e' a km: niente data");
  // Il Doblo' dei dati di esempio e' immatricolato 3 anni e 7 mesi fa: la prima revisione a 4 anni, a fine mese.
  assert.equal(scheda.scadenze.find(x => x.tipo === 'revisione').data, C.scadenzaRevisione(C.piuMesi(T, -43), ''));
  // Per il telefono senza rete: i mezzi e i miei strumenti nelle anagrafiche.
  const ana = ok(await marco('anagrafiche', {}));
  assert.ok(ana.mezzi.some(x => x.id === DOBLO && x.mio === true));
  assert.ok(ana.mieiStrumenti.some(x => x.nome === 'Multimetro 87V' && x.ultimaTaratura.scade && x.taratura.stato === 'scaduta'));
  assert.equal(ana.numerazioni.find(n => n.tipo === 'attrezzatura').formato, 'AT{NNN}');
});

test('trasferta col mezzo dello studio: niente rimborso (euro al km 0, mezzoDelloStudio); con l\'auto di una persona come oggi', async () => {
  const conDoblo = ok(await marco('salvaTrasferta', { trasferta: { dal: T, destinazione: 'Schio, Batokyo', km: 30, andataRitorno: true, idVeicolo: DOBLO } })).trasferta;
  assert.deepEqual([conDoblo.euroKm, conDoblo.rimborsoKm, conDoblo.totale, conDoblo.mezzoDelloStudio], [0, 0, 0, true]);
  const conVolvo = ok(await manuel('salvaTrasferta', { trasferta: { dal: T, destinazione: 'Thiene', km: 30, andataRitorno: true, idVeicolo: VOLVO } })).trasferta;
  assert.deepEqual([conVolvo.euroKm, conVolvo.rimborsoKm, conVolvo.mezzoDelloStudio], [0.76, 45.6, false]);
  // Il mezzo dello studio non ha l'euro al km (si ignora).
  const v = ok(await manuel('salvaMezzo', { mezzo: { id: DOBLO, euroKm: 0.5 } })).mezzo;
  assert.equal(v.euroKm, null);
  // veicoli (fase 3) con proprieta e la pillola Fermo.
  const veic = ok(await marco('veicoli', {})).veicoli.find(x => x.id === DOBLO);
  assert.deepEqual([veic.proprieta, veic.fermo], ['studio', false]);
});

test('segna i km: non meno dell\'ultima lettura, salto grande con conferma, ripetuta dalla coda la stessa; solo chi ce l\'ha', async () => {
  const ultima = s.wisper.db.riga('SELECT km, data FROM mezzo_letture WHERE veicolo_id = ? ORDER BY data DESC, km DESC LIMIT 1', DOBLO);
  const kmIt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  assert.equal((await marco('segnaKm', { idVeicolo: DOBLO, km: ultima.km - 100 })).errore,
    'Km: l\'ultima lettura era ' + kmIt(ultima.km) + ' il ' + ultima.data.slice(8, 10) + '/' + ultima.data.slice(5, 7));
  const salto = await marco('segnaKm', { idVeicolo: DOBLO, km: ultima.km + 6200 });
  assert.equal(salto.serveConferma, true);
  assert.match(salto.errore, /^Sono 6\.200 km in \d+ giorn[oi]: è giusto\?$/);
  const l1 = ok(await marco('segnaKm', { idVeicolo: DOBLO, km: ultima.km + 150, idLocale: 'km-prova-1' }));
  const l2 = ok(await marco('segnaKm', { idVeicolo: DOBLO, km: ultima.km + 150, idLocale: 'km-prova-1' }));
  assert.deepEqual([l2.lettura.id, l2.giaArrivata, l1.mezzo.km], [l1.lettura.id, true, ultima.km + 150]);
  assert.equal((await marco('segnaKm', { idVeicolo: VOLVO, km: 100 })).permesso, false, 'la Volvo non e\' sua');
  assert.equal((await lettura('segnaKm', { idVeicolo: DOBLO, km: ultima.km + 200 })).permesso, false);
  // Una spesa di carburante coi km fa una lettura "rifornimento".
  const sp = ok(await marco('salvaSpesa', { spesa: { data: T, importo: 70, categoria: 'carburante', idVeicolo: DOBLO, km: ultima.km + 180, descrizione: 'Gasolio' } })).spesa;
  assert.equal(sp.idVeicolo, DOBLO);
  assert.ok(s.wisper.db.riga("SELECT id FROM mezzo_letture WHERE veicolo_id = ? AND km = ? AND origine = 'rifornimento'", DOBLO, ultima.km + 180));
});

test('tagliando a km: la Dashboard avvisa sotto KM_TAGLIANDO_AVVISO; chiuso coi km aggiorna l\'ultimo tagliando e segna fatta la scadenza', async () => {
  const m = ok(await manuel('mezzo', { id: DOBLO })).mezzo;
  const kmVicino = m.tagliandoUltimoKm + m.tagliandoKm - 700;
  // Anche la data del tagliando (ogni 12 mesi): una scadenza del mezzo.
  ok(await manuel('salvaMezzo', { mezzo: { id: DOBLO, scadenze: { tagliando: piuGiorni(T, 60) } } }));
  assert.ok(ok(await manuel('mezzo', { id: DOBLO })).mezzo.scadenze.some(x => x.tipo === 'tagliando'));
  ok(await manuel('segnaKm', { idVeicolo: DOBLO, km: kmVicino, conferma: true }));
  const d = ok(await manuel('dashboard'));
  assert.ok(voci(d).some(v => v.titolo === 'Fiat Doblò GA123BC: tagliando fra 700 km' && v.collegamento.pagina === 'mezzo'), JSON.stringify(voci(d).filter(v => v.tipo === 'mezzo' || /Dobl/.test(v.titolo)).map(v => v.titolo)));
  const tag = ok(await manuel('salvaManutenzione', { manutenzione: { idVeicolo: DOBLO, tipo: 'tagliando', titolo: 'Tagliando dei 90.000', stato: 'in_officina' } })).manutenzione;
  assert.equal(ok(await manuel('mezzo', { id: DOBLO })).mezzo.statoVisto, 'In officina');
  ok(await manuel('chiudiManutenzione', { id: tag.id, km: kmVicino + 20, esito: 'Fatto, cambiato anche il filtro' }));
  const dopo = ok(await manuel('mezzo', { id: DOBLO })).mezzo;
  assert.equal(dopo.tagliandoUltimoKm, kmVicino + 20);
  assert.equal(dopo.kmAlTagliando, 15000);
  assert.ok(s.wisper.db.riga("SELECT id FROM scadenze WHERE veicolo_id = ? AND tipo = 'tagliando' AND stato = 'fatta'", DOBLO));
});

test('revisione proposta: immatricolato il 05/11/2021 senza revisioni -> 30/11/2025: il mezzo e\' Fermo; la trasferta si salva lo stesso', async () => {
  const nuovo = ok(await manuel('salvaMezzo', { mezzo: { nome: 'Furgone di prova', targa: 'AB000CD', tipo: 'furgone', proprieta: 'studio', immatricolazione: '2021-11-05' } })).mezzo;
  const rev = nuovo.scadenze.find(x => x.tipo === 'revisione');
  assert.equal(rev.data, '2025-11-30');
  assert.deepEqual([nuovo.stato, nuovo.fermo], ['fermo', true]);
  assert.match(nuovo.statoVisto, /^Fermo/);
  assert.match(nuovo.motivoFermo, /revisione scaduta/);
  // Fermo: non lo si prende.
  assert.match((await manuel('assegna', { idVeicolo: nuovo.id, tipo: 'assegnato', idPersona: 3 })).errore, /^È fermo: /);
  // La trasferta e' il racconto di quello che e' successo: si salva, e il veicolo ha la pillola Fermo.
  ok(await manuel('salvaTrasferta', { trasferta: { dal: T, destinazione: 'Vicenza', km: 10, idVeicolo: nuovo.id } }));
  assert.equal(ok(await manuel('veicoli', {})).veicoli.find(x => x.id === nuovo.id).fermo, true);
  // Revisione fatta: la prossima e' fine mese + 24 mesi.
  const r = ok(await manuel('salvaManutenzione', { manutenzione: { idVeicolo: nuovo.id, tipo: 'revisione', titolo: 'Revisione' } })).manutenzione;
  ok(await manuel('chiudiManutenzione', { id: r.id, data: T }));
  const dopo = ok(await manuel('mezzo', { id: nuovo.id })).mezzo;
  assert.equal(dopo.scadenze.find(x => x.tipo === 'revisione').data, C.scadenzaRevisione('2021-11-05', T));
  assert.equal(dopo.fermo, false);
  // Dismesso: esce dagli elenchi, le sue trasferte restano.
  ok(await manuel('dismettiMezzo', { id: nuovo.id, motivo: 'Venduto' }));
  assert.equal(ok(await manuel('mezzi', {})).mezzi.some(x => x.id === nuovo.id), false);
  assert.ok(ok(await manuel('mezzi', { tutti: true })).mezzi.some(x => x.id === nuovo.id));
});

test('guasto con fermo: blocca "Lo prendo io"; chi l\'ha segnalato lo chiude; foto e idLocale dalla coda', async () => {
  // La pinza AT003 e' disponibile: Marco la prende (Lo prendo io), poi la restituisce dalla coda due volte.
  const preso = ok(await marco('assegna', { idAttrezzatura: 3, tipo: 'prestito', idLocale: 'prendo-1' }));
  assert.match(preso.attrezzatura.statoVisto, /^In prestito a Marco Rossato/);
  assert.equal(preso.attrezzatura.rientro, T, 'senza data: rientra oggi');
  assert.equal(ok(await marco('assegna', { idAttrezzatura: 3, tipo: 'prestito', idLocale: 'prendo-1' })).giaArrivata, true);
  assert.equal(s.wisper.db.riga('SELECT COUNT(*) n FROM assegnazioni WHERE attrezzatura_id = 3').n, 1);
  ok(await marco('restituisci', { idAttrezzatura: 3, idLocale: 'rientro-1' }));
  assert.equal(ok(await marco('restituisci', { idAttrezzatura: 3, idLocale: 'rientro-1' })).giaArrivata, true);
  assert.equal(ok(await manuel('attrezzatura', { id: 3 })).attrezzatura.statoVisto, 'Disponibile');
  // Marco non assegna agli altri.
  assert.equal((await marco('assegna', { idAttrezzatura: 3, tipo: 'prestito', idPersona: 2 })).permesso, false);
  // Guasto con fermo (segnalato da Manuel): nessuno la prende.
  const g = ok(await manuel('segnalaGuasto', { guasto: { idAttrezzatura: 3, titolo: 'Il display non si accende', fermo: true, idLocale: 'guasto-1' } })).manutenzione;
  assert.equal(ok(await manuel('segnalaGuasto', { guasto: { idAttrezzatura: 3, titolo: 'Il display non si accende', fermo: true, idLocale: 'guasto-1' } })).giaArrivata, true);
  assert.equal((await marco('assegna', { idAttrezzatura: 3, tipo: 'prestito' })).errore, 'È fuori uso: Guasto: Il display non si accende');
  ok(await manuel('chiudiManutenzione', { id: g.id, esito: 'Cambiate le pile' }));
  // Il guasto del Doblo' segnalato da Marco (dati di prova): lo chiude lui (mezzi 1, suo).
  const suo = s.wisper.db.riga("SELECT id FROM manutenzioni WHERE veicolo_id = ? AND tipo = 'guasto' AND stato = 'aperta'", DOBLO).id;
  assert.equal((await lettura('chiudiManutenzione', { id: suo })).permesso, false);
  ok(await marco('chiudiManutenzione', { id: suo, esito: 'Gonfiate le gomme' }));
  // Una foto del guasto dalla coda (caricaFile tipo manutenzione, con l'idLocale del guasto).
  const g2 = ok(await marco('segnalaGuasto', { guasto: { idVeicolo: DOBLO, titolo: 'Graffio sul paraurti', idLocale: 'guasto-2' } })).manutenzione;
  const carica = () => marco('caricaFile', { tipo: 'guasto', idLocaleManutenzione: 'guasto-2', mime: 'image/png', base64: PNG.toString('base64'), idFile: 'foto-guasto-2' });
  const foto = await carica();
  assert.equal(foto.ok, true, foto.errore);
  assert.equal(ok(await carica()).file.id, foto.file.id, 'lo stesso idFile: nessun doppione');
  assert.equal((await lettura('caricaFile', { tipo: 'guasto', idManutenzione: g2.id, mime: 'image/png', base64: PNG.toString('base64') })).permesso, false);
  assert.equal(ok(await manuel('manutenzioni', { idVeicolo: DOBLO, aperte: true })).manutenzioni.find(x => x.id === g2.id).foto.length, 1);
});

test('assegnazioni: una sola in corso (lo storico resta); il prestito interrompe l\'assegnazione e poi torna; prestito in ritardo nella Dashboard', async () => {
  // AT003 assegnato a Marco, poi a Laura: quello di Marco si chiude.
  ok(await manuel('assegna', { idAttrezzatura: 3, tipo: 'assegnato', idPersona: 3 }));
  ok(await manuel('assegna', { idAttrezzatura: 3, tipo: 'assegnato', idPersona: 2 }));
  const righe = s.wisper.db.righe("SELECT * FROM assegnazioni WHERE attrezzatura_id = 3 AND tipo = 'assegnato' ORDER BY id");
  assert.equal(righe.filter(r => r.al === null).length, 1);
  assert.equal(righe[righe.length - 1].persona_id, 2);
  // Il database stesso non ne accetta due in corso.
  assert.throws(() => s.wisper.db.esegui("INSERT INTO assegnazioni (attrezzatura_id, tipo, persona_id, dal, creato) VALUES (3, 'prestito', 3, 'x', 'x')"), /UNIQUE/);
  // Prestito a Marco di una cosa assegnata a Laura: alla restituzione torna a Laura.
  ok(await manuel('assegna', { idAttrezzatura: 3, tipo: 'prestito', idPersona: 3, rientro: piuGiorni(T, 2) }));
  ok(await marco('restituisci', { idAttrezzatura: 3 }));
  assert.equal(ok(await manuel('attrezzatura', { id: 3 })).attrezzatura.statoVisto, 'Assegnato a Laura Bianchi');
  // Rientro nel passato no.
  assert.equal((await manuel('assegna', { idAttrezzatura: 3, tipo: 'prestito', idPersona: 3, rientro: piuGiorni(T, -1) })).errore, 'Rientro: deve venire dopo oggi');
  // L'auto di una persona non si assegna.
  assert.equal((await manuel('assegna', { idVeicolo: VOLVO, tipo: 'assegnato', idPersona: 3 })).errore, 'È l\'auto di una persona: non si assegna');
  // L'imbracatura prestata a Impianti Veneti doveva rientrare ieri.
  const d = ok(await manuel('dashboard'));
  assert.ok(voci(d).some(v => v.tipo === 'prestito' && v.titolo === 'Imbracatura anticaduta AT006: doveva rientrare ieri'));
  assert.ok(ok(await manuel('assegnazioni', { inRitardo: true })).assegnazioni.some(a => a.idAttrezzatura === 6 && a.inRitardo));
  assert.equal(d.numeri.mezzi.prestitiInRitardo, 1);
});

test('costi del mezzo: spese, fatture ricevute e impegni pagati col mezzo; una spesa legata a una ricevuta si conta una volta; solo con costi', async () => {
  const anno = T.slice(0, 4);
  const prima = ok(await manuel('costiMezzo', { id: DOBLO, anno })).totale;
  const sp = ok(await manuel('salvaSpesa', { spesa: { data: T, importo: 100, categoria: 'pedaggio', idVeicolo: DOBLO, descrizione: 'Autostrada' } })).spesa;
  const c1 = ok(await manuel('costiMezzo', { id: DOBLO, anno }));
  assert.equal(c1.totale, Math.round((prima + 100) * 100) / 100);
  assert.ok(c1.voci.some(v => v.chiave === 'pedaggi'));
  // Una fattura ricevuta col mezzo, legata a quella spesa (come fa l'XML con la proposta della spesa): non si conta due volte.
  const ric = s.wisper.db.riga("SELECT * FROM fatture_ricevute WHERE stato = 'attiva' AND substr(data, 1, 4) = ? AND incarico_id IS NULL ORDER BY id LIMIT 1", anno);
  if (ric) {
    ok(await manuel('salvaRicevuta', { ricevuta: { id: ric.id, idVeicolo: DOBLO } }));
    const c2 = ok(await manuel('costiMezzo', { id: DOBLO, anno }));
    assert.equal(c2.totale, Math.round((c1.totale + ric.imponibile + ric.contributo + ric.bollo) * 100) / 100, 'la ricevuta col mezzo conta (senza IVA)');
    s.wisper.db.esegui('UPDATE fatture_ricevute SET spesa_id = ? WHERE id = ?', sp.id, ric.id);
    assert.equal(ok(await manuel('costiMezzo', { id: DOBLO, anno })).totale, c1.totale, 'legata alla spesa: una volta sola');
    s.wisper.db.esegui('UPDATE fatture_ricevute SET spesa_id = NULL, veicolo_id = NULL WHERE id = ?', ric.id);
  }
  assert.equal((await marco('costiMezzo', { id: DOBLO })).permesso, false);
  assert.ok(ok(await lettura('costiMezzo', { id: DOBLO })).voci, 'lettura ha costi 1');
});

test('DPI: la consegna con la firma di chi riceve; la persona firma le sue dopo; chi vede le consegne; la restituzione', async () => {
  const dpiMarco = ok(await marco('dpi', {})).consegne;
  assert.ok(Array.isArray(dpiMarco) && dpiMarco.length >= 2 && dpiMarco.every(x => x.idPersona === 3), 'il collaboratore vede le sue');
  assert.equal((await marco('dpi', { idPersona: 2 })).permesso, false, 'le consegne sono dati personali: non quelle dei colleghi');
  const lista = ok(await laura('dpi', {})).consegne;
  assert.ok(lista.some(x => x.idPersona === 3), 'amministrazione (persone 2) le vede tutte');
  // L'elmetto da firmare: lo firma Marco dal suo telefono.
  const elmetto = dpiMarco.find(x => x.daFirmare);
  assert.ok(elmetto);
  const firmata = ok(await marco('firmaConsegna', { id: elmetto.id, base64: PNG.toString('base64'), mime: 'image/png' }));
  const c = firmata.consegna || firmata.dpi;
  assert.deepEqual([c.firmata, c.daFirmare], [true, false]);
  // Una consegna nuova con la firma, ripetuta dalla coda: la stessa.
  const nuova = { consegna: { idPersona: 3, cosa: 'Scarpe antinfortunistiche', taglia: '43', idLocale: 'dpi-1' }, firma: { base64: PNG.toString('base64'), mime: 'image/png' } };
  const n1 = ok(await laura('salvaConsegnaDpi', nuova));
  const n2 = ok(await laura('salvaConsegnaDpi', nuova));
  assert.equal((n2.consegna || n2.dpi).id, (n1.consegna || n1.dpi).id);
  assert.equal((n1.consegna || n1.dpi).firmata, true);
  assert.equal((await marco('salvaConsegnaDpi', { consegna: { idPersona: 3, cosa: 'X' } })).permesso, false);
  assert.equal((await luca('dpi', {})).permesso, false);
  // La restituzione dei guanti del catalogo (AT005): tornano disponibili.
  const guanti = dpiMarco.find(x => x.idAttrezzatura === 5);
  ok(await laura('restituisciDpi', { id: guanti.id }));
  assert.equal(ok(await manuel('attrezzatura', { id: 5 })).attrezzatura.statoVisto, 'Disponibile');
});
