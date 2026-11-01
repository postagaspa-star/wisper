// Fase 6: le persone e i tre livelli di dati (fase6.md §3.2, §5). Per ogni ruolo e per la persona stessa, campo per
// campo, i campi che arrivano e quelli che non arrivano (persona, persone, assenze, presenze, documenti, /file,
// esportazioni); il registro di chi apre i dati riservati scritto e non cancellabile; "(riservato)" nel registro delle
// modifiche; chi cambia cosa della scheda; il costo orario della persona che vale solo per le righe nuove; l'uscita e
// l'anonimizzazione (solo il titolare, file tolti dal disco, rapportini intatti).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverDiProva } = require('./aiuto');
const { oggi, piuGiorni } = require('../src/utili');
const C = require('../src/conti');

let s;
const chi = {};
const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const T = oggi();
const MARCO = 3;
const LAURA = 2;

test.before(async () => {
  s = await serverDiProva();
  for (const [k, e] of [['manuel', 'manuel@esempio.it'], ['laura', 'laura@esempio.it'], ['marco', 'marco@esempio.it'], ['lettura', 'lettura@esempio.it'], ['luca', 'luca@esempio.it']]) chi[k] = await s.come(e);
});
test.after(() => s.ferma());

// I campi della scheda per livello (fase6.md §5.1).
const LAVORO = ['id', 'nome', 'rapporto', 'rapportoNome', 'ruoloStudio', 'mansione', 'emailLavoro', 'telefonoLavoro', 'entrataIl', 'uscitaIl',
  'oreSettimana', 'giorniSettimana', 'oreGiorno', 'idUtente', 'ruoloWisper', 'accessoAttivo', 'assenteOggi', 'mezzi', 'attrezzature'];
const PERSONALI = ['codiceFiscale', 'nascitaData', 'nascitaLuogo', 'indirizzo', 'cap', 'citta', 'provincia', 'telefonoPersonale', 'emailPersonale',
  'iban', 'emergenzaNome', 'emergenzaTelefono', 'contrattoTipo', 'contrattoScade', 'motivoUscita', 'ferieAnnueOre', 'permessiAnnuiOre',
  'prossimaVisita', 'dpi', 'saldi', 'assenze', 'visite'];
const RISERVATI = ['ccnl', 'livello', 'noteRiservate'];
const DEL_COSTO = ['costoAnno', 'oreAnno', 'notaCosto'];
const COSTI = ['costoOrario', 'costoDal'];
const RISERVATI_VISITA = ['giudizio', 'giudizioVisto', 'prescrizioni', 'validoFino'];

function ha(o, campi, dove) { for (const k of campi) assert.ok(Object.prototype.hasOwnProperty.call(o, k), dove + ': manca ' + k); }
function nonHa(o, campi, dove) { for (const k of campi) assert.ok(!Object.prototype.hasOwnProperty.call(o, k), dove + ': non doveva esserci ' + k); }

test('persona: il titolare vede tutto (anche il costo dell\'anno e i giudizi), con i valori di prova', async () => {
  const p = ok(await chi.manuel('persona', { id: MARCO })).persona;
  ha(p, LAVORO.concat(PERSONALI, RISERVATI, DEL_COSTO, COSTI), 'titolare');
  assert.deepEqual([p.nome, p.codiceFiscale, p.ccnl, p.livello, p.costoOrario, p.costoDal, p.costoAnno, p.oreAnno],
    // Il costo dei dati di esempio vale dal 1 gennaio dell'anno di ieri (il 1 gennaio: dell'anno prima).
    ['Marco Rossato', 'RSSMRC90A01L157X', 'Studi professionali', '3', 28.5, piuGiorni(T, -1).slice(0, 4) + '-01-01', 47025, 1650]);
  ha(p.visite[0], RISERVATI_VISITA, 'visita (titolare)');
  assert.equal(p.visite[0].giudizioVisto, 'Idoneo con prescrizioni');
  assert.ok(p.documenti.some(d => d.titolo === 'Cedolino del mese scorso' && d.vede === 'riservati'));
  assert.deepEqual([p.puoScrivere, p.puoVedereRiservati, p.programmaPaghe], [true, true, 'non collegato']);
  // Mai la diagnosi: la visita non ha un campo per la malattia, e nemmeno le assenze.
  nonHa(p.visite[0], ['diagnosi', 'patologia', 'malattia'], 'visita');
});

test('persona: amministrazione (persone 2, costi 2, riservati 0) vede i personali e il costo orario, non i riservati', async () => {
  const p = ok(await chi.laura('persona', { id: MARCO })).persona;
  ha(p, LAVORO.concat(PERSONALI, COSTI), 'amministrazione');
  nonHa(p, RISERVATI.concat(DEL_COSTO), 'amministrazione');
  nonHa(p.visite[0], RISERVATI_VISITA, 'visita (amministrazione)');
  assert.equal(p.visite[0].prossima, piuGiorni(T, 13), 'la data della prossima visita e\' un dato personale: c\'e\'');
  assert.equal(p.documenti.length, 0, 'il cedolino riservato non c\'e\'');
  p.costi.forEach(c => nonHa(c, DEL_COSTO, 'costi (amministrazione)'));
  assert.equal(p.puoVedereRiservati, false);
});

test('persona: la persona stessa vede i suoi riservati (giudizi, cedolino, CCNL) ma non il suo costo', async () => {
  const p = ok(await chi.marco('persona', { id: MARCO })).persona;
  ha(p, LAVORO.concat(PERSONALI, RISERVATI), 'Marco su di se\'');
  nonHa(p, DEL_COSTO.concat(COSTI, ['costi']), 'Marco su di se\'');
  ha(p.visite[0], RISERVATI_VISITA, 'la sua visita');
  assert.ok(p.documenti.some(d => d.titolo === 'Cedolino del mese scorso'), 'il suo cedolino');
  assert.deepEqual([p.puoScrivere, p.puoCambiareContatti], [false, true]);
  // Senza id: la propria scheda.
  assert.equal(ok(await chi.marco('persona', {})).persona.id, MARCO);
});

test('persona: il collaboratore apre una collega solo coi dati di lavoro, assente oggi come "Assente", senza competenze', async () => {
  const p = ok(await chi.marco('persona', { id: LAURA })).persona;
  ha(p, LAVORO, 'collega');
  nonHa(p, PERSONALI.concat(RISERVATI, DEL_COSTO, COSTI, ['costi', 'scadenze']), 'collega');
  assert.deepEqual(p.assenteOggi, { dal: T, al: p.assenteOggi.al, tipoVisto: 'Assente' }, 'Laura e\' in ferie oggi');
  assert.deepEqual(p.qualifiche, [], 'Laura ha la formazione generale, ma il collaboratore non vede le competenze degli altri');
  assert.deepEqual(p.documenti, []);
});

test('persona: lettura vede il lavoro e il costo orario (costi 1), niente personali; l\'esterno non vede l\'organico', async () => {
  const p = ok(await chi.lettura('persona', { id: MARCO })).persona;
  ha(p, LAVORO.concat(COSTI), 'lettura');
  nonHa(p, PERSONALI.concat(RISERVATI, DEL_COSTO), 'lettura');
  assert.equal(p.qualifiche.length, 2, 'le competenze sono dati di lavoro');
  assert.equal((await chi.luca('persona', { id: MARCO })).permesso, false);
  assert.equal((await chi.luca('persone', {})).permesso, false);
});

test('persone: l\'organico per ruolo (le ferie di Laura: "Ferie" per chi ha persone 2, "Assente" per gli altri)', async () => {
  const titolare = ok(await chi.manuel('persone', {}));
  const laura = titolare.persone.find(p => p.id === LAURA);
  assert.equal(laura.assenteOggi.tipoVisto, 'Ferie');
  assert.equal(laura.costoOrario, 22.4);
  assert.deepEqual(Object.keys(titolare.conteggi).sort(), ['assentiOggi', 'attive', 'daCompletare', 'senzaAccesso']);
  const marco = ok(await chi.marco('persone', {}));
  assert.equal(marco.persone.find(p => p.id === LAURA).assenteOggi.tipoVisto, 'Assente');
  marco.persone.forEach(p => nonHa(p, COSTI.concat(PERSONALI), 'rubrica del collaboratore'));
  const lettura = ok(await chi.lettura('persone', {}));
  assert.equal(lettura.persone.find(p => p.id === LAURA).assenteOggi.tipoVisto, 'Assente');
  assert.equal(lettura.persone.find(p => p.id === LAURA).costoOrario, 22.4);
  // Anche nella Dashboard, qualunque giorno sia (in ferie da oggi anche di sabato o in un giorno di festa): assentiOggi e i
  // numeri non hanno il limite di 20 voci per sezione (la voce con la frase la prova permessi-fase6.test.js).
  const d = ok(await chi.manuel('dashboard', { tutto: true }));
  assert.deepEqual(d.assentiOggi.map(a => [a.idPersona, a.tipoVisto]), [[LAURA, 'Ferie']]);
  assert.deepEqual(d.numeri.persone.assentiOggiNomi, ['Laura Bianchi']);
  assert.deepEqual(ok(await chi.marco('dashboard', { tutto: true })).assentiOggi.map(a => [a.idPersona, a.tipoVisto]), [[LAURA, 'Assente']]);
});

test('assenze: la malattia di un collega arriva "Assente" senza tipo, causale, nota e protocollo; chi ha riservati la vede', async () => {
  // Un giorno da lavorare attorno a 20 giorni fa (di domenica o in un festivo le ore sarebbero 0).
  let dal = piuGiorni(T, -20);
  while (C.giorniLavorativi(dal, dal, [1, 2, 3, 4, 5], C.festivi(Number(dal.slice(0, 4)), '')) === 0) dal = piuGiorni(dal, -1);
  const mal = ok(await chi.manuel('salvaAssenza', { assenza: { idPersona: MARCO, tipo: 'malattia', dal, al: dal, protocollo: '987654321', nota: 'Certificato inviato' } })).assenza;
  assert.deepEqual([mal.stato, mal.tipoVisto, mal.protocollo], ['approvata', 'Malattia', '987654321'], 'la malattia nasce approvata');
  const periodo = { da: dal, a: dal };
  for (const k of ['laura', 'lettura']) {
    const a = ok(await chi[k]('assenze', periodo)).assenze.find(x => x.id === mal.id);
    assert.equal(a.tipoVisto, 'Assente', k);
    nonHa(a, ['tipo', 'causale', 'protocollo', 'tipoSanitario'].concat(k === 'lettura' ? ['nota'] : []), k);
    assert.equal(a.ore, 8, k + ': le ore si vedono (servono al calendario)');
  }
  // Marco vede la sua con tutto.
  const sua = ok(await chi.marco('assenze', periodo)).assenze.find(x => x.id === mal.id);
  assert.deepEqual([sua.tipoVisto, sua.protocollo], ['Malattia', '987654321']);
  // L'esterno no.
  assert.equal((await chi.luca('assenze', periodo)).permesso, false);
  // Il titolare la vede, e lascia la riga "visto" (una al giorno per persona e cosa).
  const prima = s.wisper.db.riga("SELECT COUNT(*) n FROM accessi_riservati WHERE utente_id = 1 AND persona_id = ? AND cosa = 'assenza' AND azione = 'visto'", MARCO).n;
  ok(await chi.manuel('assenze', periodo));
  ok(await chi.manuel('assenze', periodo));
  const dopo = s.wisper.db.riga("SELECT COUNT(*) n FROM accessi_riservati WHERE utente_id = 1 AND persona_id = ? AND cosa = 'assenza' AND azione = 'visto'", MARCO).n;
  assert.equal(dopo, Math.max(prima, 1));
});

// La malattia di Laura dei dati di esempio: la settimana scorsa (nei primi giorni del mese cade nel mese prima).
const malattiaDiLaura = () => s.wisper.db.riga("SELECT dal FROM assenze WHERE persona_id = ? AND tipo = 'malattia' ORDER BY id LIMIT 1", LAURA).dal;

test('presenze: chi non ha riservati vede "Assente" e niente totale di malattia; il collaboratore solo le sue', async () => {
  const mese = malattiaDiLaura().slice(0, 7);
  const tit = ok(await chi.manuel('presenze', { mese }));
  const laura = tit.persone.find(p => p.idPersona === LAURA);
  assert.ok(laura.totali.malattia, 'il titolare vede le ore di malattia');
  const giorno = laura.giorni.find(g => g.assenza && g.assenza.tipoVisto === 'Malattia');
  assert.ok(giorno, 'la malattia di Laura del mese');
  assert.equal(tit.programmaPaghe, 'non collegato');
  const let_ = ok(await chi.lettura('presenze', { mese })).persone.find(p => p.idPersona === LAURA);
  nonHa(let_.totali, ['malattia'], 'lettura');
  assert.equal(let_.giorni.find(g => g.data === giorno.data).assenza.tipoVisto, 'Assente');
  const mie = ok(await chi.marco('presenze', { mese }));
  assert.deepEqual(mie.persone.map(p => p.idPersona), [MARCO]);
  // Niente timbrature ne' posizione: le presenze sono ricavate.
  for (const g of laura.giorni) nonHa(g, ['entrata', 'uscita', 'posizione', 'timbratura'], 'giorno');
  assert.ok(s.wisper.db.riga("SELECT id FROM accessi_riservati WHERE utente_id = 1 AND persona_id = ? AND cosa = 'assenza' AND azione = 'visto'", LAURA),
    'il titolare che vede la malattia di Laura nelle presenze lascia la riga "visto"');
});

test('documenti e /file: il cedolino di Marco lo vedono e scaricano solo il titolare e Marco; lo scarico del titolare va nel registro', async () => {
  const doc = s.wisper.db.riga("SELECT d.id, v.file_id FROM documenti d JOIN documento_versioni v ON v.id = d.versione_valida_id WHERE d.persona_id = ? AND d.vede = 'riservati'", MARCO);
  for (const [k, vede] of [['manuel', true], ['laura', false], ['marco', true], ['lettura', false], ['luca', false]]) {
    const r = await chi[k]('documenti', { idPersona: MARCO });
    assert.equal(r.ok ? r.documenti.some(d => d.id === doc.id) : false, vede, 'documenti ' + k);
    assert.equal((await chi[k].file(doc.file_id)).status, vede ? 200 : 403, '/file ' + k);
    // Chi non lo vede non lo trova neanche per id.
    if (!vede) assert.equal((await chi[k]('documento', { id: doc.id })).ok, false, 'documento ' + k);
  }
  const righe = s.wisper.db.righe("SELECT utente_id, azione, riferimento FROM accessi_riservati WHERE persona_id = ? AND cosa = 'documento' AND azione = 'scaricato'", MARCO);
  assert.deepEqual(righe.map(r => [r.utente_id, r.riferimento]), [[1, String(doc.id)]], 'una riga per lo scarico del titolare, nessuna per Marco (e\' suo)');
});

test('accessi_riservati: non si cambia e non si cancella; lo legge il titolare (tutto) e la persona (i suoi)', async () => {
  assert.throws(() => s.wisper.db.esegui('DELETE FROM accessi_riservati'), /non si/);
  assert.throws(() => s.wisper.db.esegui("UPDATE accessi_riservati SET azione = 'visto'"), /non si/);
  const tutti = ok(await chi.manuel('accessiRiservati', {}));
  assert.ok(tutti.quanti >= 3);
  assert.ok(tutti.righe.some(r => r.azione === 'scaricato' && r.idPersona === MARCO && /^Ha scaricato/.test(r.frase)));
  const suoi = ok(await chi.marco('accessiRiservati', {}));
  assert.ok(suoi.righe.length > 0 && suoi.righe.every(r => r.idPersona === MARCO));
  assert.equal((await chi.marco('accessiRiservati', { idPersona: LAURA })).permesso, false);
  assert.ok(ok(await chi.laura('accessiRiservati', {})).righe.every(r => r.idPersona === LAURA));
  assert.equal((await chi.luca('accessiRiservati', {})).permesso, false);
  assert.deepEqual(Object.keys(tutti.righe[0]).sort(), ['azione', 'cosa', 'disp', 'frase', 'idPersona', 'idUtente', 'persona', 'quando', 'riferimento', 'utente']);
});

test('chi cambia la scheda: la persona solo i suoi contatti; amministrazione i personali ma non i riservati; il registro scrive "(riservato)"', async () => {
  const mio = ok(await chi.marco('salvaPersona', { persona: { id: MARCO, telefonoPersonale: '333 1112223', emergenzaNome: 'Giulia Rossato' } })).persona;
  assert.equal(mio.telefonoPersonale, '333 1112223');
  assert.equal((await chi.marco('salvaPersona', { persona: { id: MARCO, ruoloStudio: 'Capo' } })).errore, 'Puoi cambiare solo i tuoi contatti, l\'indirizzo, l\'IBAN e il contatto di emergenza');
  assert.equal((await chi.marco('salvaPersona', { persona: { id: LAURA, telefonoPersonale: '1' } })).permesso, false);
  assert.equal((await chi.laura('salvaPersona', { persona: { id: MARCO, ccnl: 'Metalmeccanici' } })).permesso, false);
  ok(await chi.laura('salvaPersona', { persona: { id: MARCO, indirizzo: 'Via Nuova 1' } }));
  assert.equal((await chi.luca('salvaPersona', { persona: { id: MARCO, indirizzo: 'X' } })).permesso, false);
  ok(await chi.manuel('salvaPersona', { persona: { id: MARCO, noteRiservate: 'Nota di prova' } }));
  const righe = s.wisper.db.righe("SELECT prima, dopo FROM registro WHERE tabella = 'persone' AND id_riga = ? AND azione = 'salvaPersona'", String(MARCO));
  assert.ok(righe.length >= 3);
  for (const r of righe) {
    for (const lato of [r.prima, r.dopo]) {
      const o = JSON.parse(lato || '{}');
      for (const k of ['telefono_personale', 'indirizzo', 'emergenza_nome', 'note_riservate']) if (k in o && o[k] !== '') assert.equal(o[k], '(riservato)', k);
    }
  }
  assert.equal(JSON.stringify(righe).includes('Via Nuova 1') || JSON.stringify(righe).includes('333 1112223') || JSON.stringify(righe).includes('Nota di prova'), false);
  // La nota riservata cambiata dal titolare: riga "cambiato" per Marco.
  assert.ok(s.wisper.db.riga("SELECT id FROM accessi_riservati WHERE utente_id = 1 AND persona_id = ? AND azione = 'cambiato'", MARCO));
  // Anche dalla lettura del registro (amministrazione).
  const reg = ok(await chi.laura('registro', { tabella: 'persone' }));
  assert.equal(JSON.stringify(reg).includes('Via Nuova 1'), false);
  // Le assenze: il tipo e la nota nel registro sono "(riservato)".
  const ass = s.wisper.db.righe("SELECT dopo FROM registro WHERE tabella = 'assenze' AND prima IS NULL").map(r => JSON.parse(r.dopo));
  assert.ok(ass.length >= 3 && ass.every(a => a.tipo === '(riservato)'));
  assert.equal(JSON.stringify(ass).includes('Matrimonio'), false);
});

test('documento personale da /carica: il nome del file nel registro e\' "(riservato)"; lo carica chi ha persone 2', async () => {
  const carica = async (c, nome) => {
    const r = await fetch(s.url + '/carica?' + new URLSearchParams({ nome, mime: 'application/pdf', per: 'persona' }), {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + c.token }, body: Buffer.from('%PDF-1.4\n% contratto\n%%EOF\n'),
    });
    return r.json();
  };
  assert.equal((await carica(chi.marco, 'contratto-marco.pdf')).permesso, false, 'la persona non carica i suoi documenti personali');
  const f = ok(await carica(chi.laura, 'contratto-marco-rossato.pdf')).file;
  const riga = s.wisper.db.riga("SELECT dopo FROM registro WHERE tabella = 'file' AND id_riga = ?", f.id);
  assert.equal(JSON.parse(riga.dopo).nome, '(riservato)');
  const cat = ok(await chi.manuel('categorieDocumenti')).categorie.find(c => c.nome === 'Contratti di lavoro');
  assert.equal(cat.vede, 'riservati');
  // Laura (senza riservati) non puo' metterlo in una categoria riservata: lo carica e lo mette il titolare.
  const no = await chi.laura('salvaDocumento', { documento: { titolo: 'Contratto di Marco', idCategoria: cat.id, idPersona: MARCO, idFile: f.id } });
  assert.deepEqual([no.ok, no.permesso], [false, false], no.errore);
  const f2 = ok(await carica(chi.manuel, 'contratto-marco-rossato.pdf')).file;
  const doc = ok(await chi.manuel('salvaDocumento', { documento: { titolo: 'Contratto di Marco', idCategoria: cat.id, idPersona: MARCO, idFile: f2.id } })).documento;
  assert.deepEqual([doc.idPersona, doc.vede], [MARCO, 'riservati']);
  assert.equal(ok(await chi.laura('documenti', { idPersona: MARCO })).documenti.length, 0);
});

test('esportazioni: le colonne dipendono da chi esporta; l\'esportazione coi riservati va nel registro degli accessi', async () => {
  const intestazione = async (c, cosa, d) => {
    const r = ok(await c('esporta', Object.assign({ cosa }, d || {})));
    return Buffer.from(r.base64, 'base64').toString('utf8').replace(/^﻿/, '').split('\r\n');
  };
  const tit = (await intestazione(chi.manuel, 'persone'))[0].split(';');
  assert.ok(['Codice fiscale', 'IBAN', 'CCNL', 'Livello', 'Costo orario'].every(c => tit.includes(c)));
  const amm = (await intestazione(chi.laura, 'persone'))[0].split(';');
  assert.ok(amm.includes('IBAN') && amm.includes('Costo orario') && !amm.includes('CCNL') && !amm.includes('Livello'));
  const col = (await intestazione(chi.marco, 'persone'))[0].split(';');
  assert.ok(!col.includes('IBAN') && !col.includes('Costo orario') && !col.includes('CCNL') && col.includes('Telefono di lavoro'));
  const let_ = (await intestazione(chi.lettura, 'persone'))[0].split(';');
  assert.ok(!let_.includes('IBAN') && let_.includes('Costo orario'));
  assert.equal((await chi.luca('esporta', { cosa: 'persone' })).permesso, false);
  // Le assenze: la malattia "Assente" per chi non ha riservati.
  const mese = { da: malattiaDiLaura().slice(0, 7) + '-01', a: T };
  const assLettura = (await intestazione(chi.lettura, 'assenze', mese)).join('\n');
  assert.equal(/Malattia/.test(assLettura), false);
  assert.match(assLettura, /Laura Bianchi;Assente/);
  assert.match((await intestazione(chi.manuel, 'assenze', mese)).join('\n'), /Laura Bianchi;Malattia/);
  assert.ok(s.wisper.db.riga("SELECT id FROM accessi_riservati WHERE utente_id = 1 AND azione = 'esportato' AND riferimento = 'assenze'"));
  assert.ok(s.wisper.db.riga("SELECT id FROM accessi_riservati WHERE utente_id = 1 AND azione = 'esportato' AND riferimento = 'persone'"));
  // Le presenze: la riga del programma paghe "Non collegato".
  assert.match((await intestazione(chi.manuel, 'presenze', { mese: T.slice(0, 7) })).join('\n'), /Programma paghe del consulente;Non collegato/);
});

test('costo orario: la persona alla data del lavoro, per le righe nuove; quelle gia\' scritte tengono il loro; l\'esterno 0', async () => {
  // Laura ha 22,40 dal 1 gennaio. Una riga di ore di oggi lo prende.
  const o1 = ok(await chi.laura('salvaOre', { ore: { data: T, inizio: '08:00', fine: '10:00', idCommessa: '26ST001', descrizione: 'Prova costo', idLocale: 'laura-costo-1' } })).riga;
  const riga = id => s.wisper.db.riga('SELECT costo_orario FROM ore WHERE id = ?', id).costo_orario;
  assert.equal(riga(o1.id), 22.4);
  // Costo nuovo da oggi: la riga di prima resta, quella nuova prende il nuovo.
  const nuovo = ok(await chi.manuel('salvaCostoPersona', { idPersona: LAURA, dal: T, costoOrario: 24 }));
  assert.match(nuovo.frase, /^Vale per le ore e i rapportini nuovi dal \d\d\/\d\d\/\d{4}: quelli già scritti tengono il loro costo$/);
  const o2 = ok(await chi.laura('salvaOre', { ore: { data: T, inizio: '10:00', fine: '11:00', idCommessa: '26ST001', descrizione: 'Prova costo 2', idLocale: 'laura-costo-2' } })).riga;
  assert.deepEqual([riga(o1.id), riga(o2.id)], [22.4, 24]);
  // Una riga di ieri scritta oggi prende il costo di ieri (22,40).
  const o3 = ok(await chi.laura('salvaOre', { ore: { data: piuGiorni(T, -1), inizio: '14:00', fine: '15:00', idCommessa: '26ST001', descrizione: 'Ieri', idLocale: 'laura-costo-3' } })).riga;
  assert.equal(riga(o3.id), 22.4);
  // Senza costo (Manuel): la regola di oggi, come prima della fase 6.
  const imp = s.wisper.leggiImpostazioni();
  const o4 = ok(await chi.manuel('salvaOre', { ore: { data: T, inizio: '15:00', fine: '16:00', idCommessa: '26ST001', descrizione: 'Manuel', idLocale: 'manuel-costo-1' } })).riga;
  const commessa = s.wisper.db.riga("SELECT cm.costo_orario c, s.costo_fisso f FROM commesse cm JOIN soggetti s ON s.id = cm.cliente_id WHERE cm.id = '26ST001'");
  assert.equal(riga(o4.id), commessa.f !== null && commessa.f !== '' ? commessa.f : commessa.c !== null ? commessa.c : Number(imp.COSTO_ORARIO));
  // Il costo e' dei costi e del titolare: Laura non lo scrive senza costi 2? Ha costi 2 e persone 2: si'. Marco e lettura no.
  assert.equal((await chi.marco('salvaCostoPersona', { idPersona: MARCO, dal: T, costoOrario: 99 })).permesso, false);
  assert.equal((await chi.lettura('salvaCostoPersona', { idPersona: MARCO, dal: T, costoOrario: 99 })).permesso, false);
  // Il costo dell'anno: proposta del costo orario, ed e' riservato (Laura senza riservati non lo scrive).
  assert.equal((await chi.laura('salvaCostoPersona', { idPersona: MARCO, dal: T, costoAnno: 50000, oreAnno: 1650 })).permesso, false);
  // Tolto il costo di oggi, le righe gia' scritte non cambiano.
  const idCosto = s.wisper.db.riga('SELECT id FROM persona_costi WHERE persona_id = ? AND dal = ?', LAURA, T).id;
  ok(await chi.manuel('togliCostoPersona', { id: idCosto }));
  assert.equal(riga(o2.id), 24);
  // L'esterno: le sue ore sull'incarico hanno costo 0 (non null).
  const inc = s.wisper.db.riga("SELECT commessa_id FROM incarichi WHERE soggetto_id = 'F006' AND stato = 'affidato'");
  const o5 = ok(await chi.luca('salvaOre', { ore: { data: T, inizio: '08:00', fine: '12:00', idCommessa: inc.commessa_id, descrizione: 'Quadro', idLocale: 'luca-costo-1' } })).riga;
  assert.strictEqual(riga(o5.id), 0);
  nonHa(o5, ['costoOrario', 'costo'], 'l\'esterno non vede costi');
});

test('uscita: serveConferma con cosa succede; accesso disattivato, assenze future annullate, attivita\' e ticket liberati, contatti tolti', async () => {
  const s2 = await serverDiProva();
  try {
    const manuel = await s2.come('manuel@esempio.it');
    const marco = await s2.come('marco@esempio.it');
    const laura = await s2.come('laura@esempio.it');
    const ieri = piuGiorni(T, -1);
    assert.equal((await laura('segnaUscita', { idPersona: MARCO, data: ieri })).serveConferma, true, 'amministrazione puo\' segnare l\'uscita');
    const prima = await manuel('segnaUscita', { idPersona: MARCO, data: ieri, motivo: 'Dimissioni' });
    assert.equal(prima.serveConferma, true);
    assert.equal(prima.daFare.accesso, 'L\'accesso a Wisper si disattiva adesso');
    assert.ok(prima.daFare.daRestituire.some(x => x.nome === 'Fiat Doblò GA123BC'));
    assert.ok(prima.daFare.daRestituire.some(x => x.nome === 'Multimetro 87V'));
    assert.equal(prima.daFare.assenzeFuture, 1, 'le ferie di novembre');
    assert.deepEqual(prima.daFare.contattiTolti, ['telefono personale', 'contatto di emergenza']);
    const fatto = ok(await manuel('segnaUscita', { idPersona: MARCO, data: ieri, motivo: 'Dimissioni', conferma: true }));
    assert.deepEqual([fatto.persona.uscitaIl, fatto.persona.motivoUscita, fatto.persona.telefonoPersonale, fatto.persona.emergenzaNome, fatto.persona.accessoAttivo],
      [ieri, 'Dimissioni', '', '', false]);
    // L'accesso: il token di Marco non vale piu'.
    assert.equal((await marco('io')).accesso, false);
    // Le ferie di novembre annullate col motivo.
    assert.deepEqual(Object.assign({}, s2.wisper.db.riga("SELECT stato, motivo_annullo FROM assenze WHERE persona_id = ? AND tipo = 'ferie'", MARCO)), { stato: 'annullata', motivo_annullo: 'Uscita' });
    // Niente attivita' future assegnate a lui, niente ticket in carico.
    assert.equal(s2.wisper.db.riga("SELECT COUNT(*) n FROM attivita WHERE assegnata_a = 3 AND stato IN ('da_fare', 'in_corso') AND (inizio IS NULL OR substr(inizio, 1, 10) > ?)", ieri).n, 0);
    assert.equal(s2.wisper.db.riga("SELECT COUNT(*) n FROM ticket WHERE responsabile_id = 3 AND stato IN ('in_carico', 'in_attesa', 'aperto')").n, 0);
    // Le sue scadenze (formazione, visita) annullate.
    assert.equal(s2.wisper.db.riga("SELECT COUNT(*) n FROM scadenze WHERE persona_id = ? AND stato = 'aperta'", MARCO).n, 0);
    // I rapportini e le ore restano.
    assert.ok(s2.wisper.db.riga('SELECT COUNT(*) n FROM rapportini WHERE utente_id = 3').n > 0);
    // Fuori dall'organico di chi ha persone 1 (le attive).
    assert.equal(ok(await manuel('persone', {})).persone.some(p => p.id === MARCO), false);
    assert.ok(ok(await manuel('persone', { stato: 'uscite' })).persone.some(p => p.id === MARCO));
    // Annullare l'uscita: la scheda torna, l'accesso no (da dare di nuovo).
    const annullata = ok(await manuel('annullaUscita', { idPersona: MARCO }));
    assert.deepEqual([annullata.persona.uscitaIl, annullata.persona.accessoAttivo], ['', false]);
  } finally {
    await s2.ferma();
  }
});

test('anonimizzazione: solo il titolare, dopo l\'uscita, con conferma; file tolti dal disco; rapportini, ore e registro degli accessi restano', async () => {
  const s2 = await serverDiProva();
  try {
    const manuel = await s2.come('manuel@esempio.it');
    const laura = await s2.come('laura@esempio.it');
    assert.equal((await manuel('anonimizzaPersona', { idPersona: MARCO })).errore, 'Prima segna l\'uscita di Marco Rossato');
    ok(await manuel('segnaUscita', { idPersona: MARCO, data: piuGiorni(T, -1), conferma: true }));
    // Il nome nuovo dice l'anno dell'uscita (ieri: il 1 gennaio e' l'anno prima).
    assert.equal((await laura('anonimizzaPersona', { idPersona: MARCO, conferma: true })).permesso, false, 'amministrazione no: solo il titolare');
    const fileDoc = s2.wisper.db.righe('SELECT f.* FROM file f JOIN documento_versioni v ON v.file_id = f.id JOIN documenti d ON d.id = v.documento_id WHERE d.persona_id = ?', MARCO);
    const firme = s2.wisper.db.righe('SELECT f.* FROM file f JOIN dpi_consegne c ON c.firma_file_id = f.id WHERE c.persona_id = ?', MARCO);
    assert.ok(fileDoc.length >= 1 && firme.length >= 1);
    const percorsi = fileDoc.concat(firme).map(f => path.join(s2.dati, 'file', f.percorso));
    percorsi.forEach(p => assert.ok(fs.existsSync(p), p));
    const domanda = await manuel('anonimizzaPersona', { idPersona: MARCO });
    assert.equal(domanda.serveConferma, true);
    assert.equal(domanda.frase, 'Non si torna indietro');
    assert.equal(domanda.nomeNuovo, 'Persona uscita nel ' + piuGiorni(T, -1).slice(0, 4));
    const rapportini = s2.wisper.db.righe('SELECT * FROM rapportini WHERE utente_id = 3 ORDER BY id').map(r => Object.assign({}, r));
    const ore = s2.wisper.db.riga('SELECT COUNT(*) n FROM ore WHERE utente_id = 3').n;
    const accessi = s2.wisper.db.riga('SELECT COUNT(*) n FROM accessi_riservati WHERE persona_id = ?', MARCO).n;
    const p = ok(await manuel('anonimizzaPersona', { idPersona: MARCO, conferma: true })).persona;
    assert.deepEqual([p.nome, p.anonimizzata, p.codiceFiscale, p.iban, p.ccnl], ['Persona uscita nel ' + piuGiorni(T, -1).slice(0, 4), true, '', '', '']);
    percorsi.forEach(x => assert.equal(fs.existsSync(x), false, 'tolto dal disco: ' + x));
    for (const t of ['persona_costi', 'assenze', 'assenze_saldi', 'visite_mediche', 'qualifiche', 'dpi_consegne', 'documenti', 'scadenze']) {
      assert.equal(s2.wisper.db.riga('SELECT COUNT(*) n FROM ' + t + ' WHERE persona_id = ?', MARCO).n, 0, t);
    }
    assert.equal(s2.wisper.db.riga('SELECT nome FROM utenti WHERE id = 3').nome, p.nome);
    // Il lavoro dello studio resta identico.
    assert.deepEqual(s2.wisper.db.righe('SELECT * FROM rapportini WHERE utente_id = 3 ORDER BY id').map(r => Object.assign({}, r)), rapportini);
    assert.equal(s2.wisper.db.riga('SELECT COUNT(*) n FROM ore WHERE utente_id = 3').n, ore);
    assert.equal(s2.wisper.db.riga('SELECT COUNT(*) n FROM accessi_riservati WHERE persona_id = ?', MARCO).n, accessi);
    // Non si rifa' e non si annulla l'uscita di una scheda anonima.
    assert.equal(ok(await manuel('anonimizzaPersona', { idPersona: MARCO, conferma: true })).persona.anonimizzata, true);
    assert.equal((await manuel('annullaUscita', { idPersona: MARCO })).errore, 'La scheda è stata resa anonima');
  } finally {
    await s2.ferma();
  }
});
