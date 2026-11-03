// Fase 6: ferie, permessi e assenze (fase6.md §6). Richiesta, approvazione con lo schema della fase 3 (approva,
// respingi col motivo, Annulla), annullare prima e dopo l'inizio, accorciare; nessuno approva le proprie tranne il
// titolare; le anomalie; la malattia che nasce approvata; la sovrapposizione; la chiusura con le ferie per tutti; i
// giorni senza rapportino che saltano assenze, festivi (anche il 4 ottobre) e chiusure; l'attivita' per un assente con
// serveConferma; il saldo dal cedolino. Le date sono relative a oggi (i dati di prova nascono attorno a oggi).
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva } = require('./aiuto');
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
const MARCO = 3;
const LAURA = 2;

const dow = g => new Date(g + 'T12:00:00').getDay();
const feriale = g => dow(g) !== 0 && dow(g) !== 6 && C.festivi(Number(g.slice(0, 4)), '').indexOf(g) < 0;
/** Il primo giorno feriale da g (compreso) in avanti, o all'indietro con passo -1. */
function feriali(g, passo) { let x = g; while (!feriale(x)) x = piuGiorni(x, passo || 1); return x; }
/** Il lunedi' da g in avanti. */
function lunedi(g) { let x = g; while (dow(x) !== 1) x = piuGiorni(x, 1); return x; }

test.before(async () => {
  s = await serverDiProva();
  manuel = await s.come('manuel@esempio.it');
  laura = await s.come('laura@esempio.it');
  marco = await s.come('marco@esempio.it');
  lettura = await s.come('lettura@esempio.it');
  luca = await s.come('luca@esempio.it');
});
test.after(() => s.ferma());

const assenza = id => s.wisper.db.riga('SELECT * FROM assenze WHERE id = ?', id);
const voceDi = (d, id) => d.persone.flatMap(p => p.voci).find(v => v.tipo === 'assenza' && v.id === id);

test('la richiesta di Marco tra le cose da approvare: dettaglio, saldo che resta; approva, Annulla, respingi col motivo', async () => {
  const richiesta = s.wisper.db.riga("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'da_approvare'", MARCO);
  const d = ok(await manuel('daApprovare'));
  const v = voceDi(d, richiesta.id);
  assert.deepEqual([v.cosa, v.quanto, v.unita, v.idUtente, v.idPersona], ['Ferie', 40, 'ore', 3, MARCO]);
  // Il saldo dal cedolino della fine del mese scorso (104 ore) meno le 40 della richiesta: 8 giorni. L'ultimo giorno del mese
  // matura anche il mese che finisce oggi (208 ore l'anno: 17,33 in piu', 81,33 ore = 10,2 giorni).
  const restano = piuGiorni(T, 1).slice(8) === '01' ? '10,2' : '8';
  assert.match(v.dettaglio, new RegExp('^Da lunedì \\d+ a venerdì \\d+ \\w+ · 5 giorni · restano ' + restano + ' giorni$'));
  assert.ok(voceDi(ok(await laura('daApprovare')), richiesta.id), 'amministrazione (persone 2) le approva');
  assert.equal((await marco('approva', { voci: [{ tipo: 'assenza', id: richiesta.id }] })).permesso, false);
  assert.equal((await lettura('approva', { voci: [{ tipo: 'assenza', id: richiesta.id }] })).permesso, false);
  // Approva.
  const a = ok(await manuel('approva', { voci: [{ tipo: 'assenza', id: richiesta.id }] }));
  assert.deepEqual(a.voci, [{ tipo: 'assenza', id: richiesta.id, stato: 'approvata' }]);
  assert.deepEqual([assenza(richiesta.id).stato, assenza(richiesta.id).approvata_da], ['approvata', 1]);
  assert.ok(s.wisper.db.riga("SELECT id FROM registro WHERE tabella = 'assenze' AND id_riga = ? AND nota = 'ferie approvate'", String(richiesta.id)));
  // Ripetuta: niente di nuovo.
  assert.equal(ok(await manuel('approva', { voci: [{ tipo: 'assenza', id: richiesta.id }] })).fatte, 0);
  // Annulla (l'avviso della fase 3): torna da approvare.
  ok(await manuel('annullaApprovazione', { voci: [{ tipo: 'assenza', id: richiesta.id }] }));
  assert.equal(assenza(richiesta.id).stato, 'da_approvare');
  // Respingi: il motivo serve e arriva a chi ha chiesto.
  assert.equal((await manuel('respingi', { voci: [{ tipo: 'assenza', id: richiesta.id }] })).errore, 'Scrivi il motivo: arriva a chi l\'ha scritta');
  ok(await laura('respingi', { voci: [{ tipo: 'assenza', id: richiesta.id }], motivo: 'Quella settimana c\'è il collaudo di Batokyo' }));
  const sua = ok(await marco('assenze', { stato: 'tutte' })).assenze.find(x => x.id === richiesta.id);
  assert.deepEqual([sua.stato, sua.statoVisto, sua.motivoRifiuto], ['respinta', 'Respinta', 'Quella settimana c\'è il collaudo di Batokyo']);
  // Rimessa da approvare per le prove dopo.
  ok(await manuel('annullaApprovazione', { voci: [{ tipo: 'assenza', id: richiesta.id }] }));
  assert.equal(assenza(richiesta.id).stato, 'da_approvare');
});

test('nessuno approva le proprie assenze tranne il titolare; quelle del titolare nascono approvate (APPROVAZIONE collaboratori)', async () => {
  const g = feriali(piuGiorni(T, 40));
  const sua = ok(await laura('salvaAssenza', { assenza: { tipo: 'ferie', dal: g, al: g } })).assenza;
  assert.equal(sua.stato, 'da_approvare');
  assert.equal((await laura('approva', { voci: [{ tipo: 'assenza', id: sua.id }] })).errore, 'Le tue ferie le approva il titolare');
  assert.equal(voceDi(ok(await laura('daApprovare')), sua.id), undefined, 'non le vede nemmeno tra le sue da approvare');
  assert.ok(voceDi(ok(await manuel('daApprovare')), sua.id));
  const tit = ok(await manuel('salvaAssenza', { assenza: { tipo: 'ferie', dal: g, al: g } })).assenza;
  assert.equal(tit.stato, 'approvata');
  // Marco non chiede per gli altri; lettura nemmeno; l'esterno non ha le assenze.
  assert.equal((await marco('salvaAssenza', { assenza: { idPersona: LAURA, tipo: 'ferie', dal: g } })).permesso, false);
  assert.equal((await luca('salvaAssenza', { assenza: { tipo: 'ferie', dal: g } })).permesso, false);
  // Ripetuta dalla coda del telefono con lo stesso idLocale: la stessa.
  const g2 = feriali(piuGiorni(g, 1));
  const c1 = ok(await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: g2, dalle: '15:00', alle: '18:00', idLocale: 'marco-permesso-1' } }));
  const c2 = ok(await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: g2, dalle: '15:00', alle: '18:00', idLocale: 'marco-permesso-1' } }));
  assert.deepEqual([c2.assenza.id, c2.giaArrivata, c1.assenza.ore, c1.assenza.giorni], [c1.assenza.id, true, 3, 0]);
});

test('annullare: chi ha chiesto finche\' non comincia; una ferie in corso si accorcia, non si annulla; chi approva col motivo', async () => {
  // Una futura: Marco la annulla da solo.
  const g = feriali(piuGiorni(T, 50));
  const fut = ok(await marco('salvaAssenza', { assenza: { tipo: 'ferie', dal: g, al: g } })).assenza;
  assert.equal(ok(await marco('annullaAssenza', { id: fut.id })).assenza.stato, 'annullata');
  // Una in corso (da un giorno feriale prima di oggi a uno dopo), approvata dal titolare.
  const dal = feriali(piuGiorni(T, -1), -1);
  const al = feriali(piuGiorni(T, 1));
  const inCorso = ok(await manuel('salvaAssenza', { assenza: { idPersona: MARCO, tipo: 'ferie', dal, al, nota: 'Fiera di esempio' } })).assenza;
  ok(await manuel('approva', { voci: [{ tipo: 'assenza', id: inCorso.id }] }));
  assert.equal((await marco('annullaAssenza', { id: inCorso.id })).errore, 'L\'assenza è già cominciata: per cambiarla chiedi a chi approva');
  assert.equal((await manuel('annullaAssenza', { id: inCorso.id })).errore, 'Scrivi il motivo: arriva a chi l\'ha chiesta');
  assert.equal((await manuel('annullaAssenza', { id: inCorso.id, motivo: 'Errore' })).errore, 'Le ferie sono in corso: accorciale fino a ieri, non si annullano');
  assert.equal((await manuel('annullaApprovazione', { voci: [{ tipo: 'assenza', id: inCorso.id }] })).errore, 'Le ferie sono già cominciate: annullale dal giorno di oggi');
  assert.equal((await marco('salvaAssenza', { assenza: { id: inCorso.id, al: piuGiorni(T, -1) } })).errore, 'È già approvata: per cambiarla chiedi a chi approva');
  // Accorciata fino a ieri: le ore si rifanno.
  const corta = ok(await manuel('salvaAssenza', { assenza: { id: inCorso.id, al: piuGiorni(T, -1) } })).assenza;
  assert.equal(corta.stato, 'approvata');
  assert.equal(corta.al, piuGiorni(T, -1));
  assert.equal(corta.ore, C.giorniLavorativi(dal, piuGiorni(T, -1), [1, 2, 3, 4, 5], C.festiviTra(dal, T, '')) * 8);
  // Una tutta passata, chi approva la annulla col motivo (un errore da correggere).
  ok(await manuel('annullaAssenza', { id: inCorso.id, motivo: 'Non era in ferie: ha lavorato in ufficio' }));
  assert.deepEqual([assenza(inCorso.id).stato, assenza(inCorso.id).motivo_annullo], ['annullata', 'Non era in ferie: ha lavorato in ufficio']);
});

test('le anomalie in giallo scuro: saldo sotto zero, colleghi assenti, attivita\' in quei giorni, ore gia\' scritte', async () => {
  // Saldo: Marco ha 64 ore che restano; 15 giorni di ferie lo portano sotto zero.
  const dal = lunedi(piuGiorni(T, 70));
  const al = piuGiorni(dal, 18);
  // Un'attivita' assegnata a Marco in quei giorni (scritta prima della richiesta).
  const giorno = feriali(piuGiorni(dal, 1));
  ok(await manuel('salvaAttivita', { attivita: { titolo: 'Sopralluogo quadri di prova', tipo: 'sopralluogo', assegnataA: 3, inizio: giorno + 'T09:00', fine: giorno + 'T11:00' } }));
  // Laura assente negli stessi giorni.
  const gl = feriali(piuGiorni(dal, 2));
  ok(await manuel('salvaAssenza', { assenza: { idPersona: LAURA, tipo: 'ferie', dal: gl, al: gl } }));
  const r = ok(await marco('salvaAssenza', { assenza: { tipo: 'ferie', dal, al } }));
  const tipi = r.anomalie.map(x => x.tipo);
  assert.ok(tipi.includes('saldoNegativo') && tipi.includes('colleghiAssenti') && tipi.includes('impegni'), JSON.stringify(r.anomalie));
  assert.match(r.anomalie.find(x => x.tipo === 'saldoNegativo').testo, /^Dopo questa richiesta restano −\d+(,\d+)? ore di ferie$/);
  assert.equal(r.anomalie.find(x => x.tipo === 'colleghiAssenti').testo, 'Negli stessi giorni è assente anche Laura Bianchi');
  assert.match(r.anomalie.find(x => x.tipo === 'impegni').testo, /^Ha 1 attività in quei giorni: Sopralluogo quadri di prova \S+ \d+$/);
  // Le stesse nella voce da approvare.
  assert.ok(voceDi(ok(await manuel('daApprovare')), r.assenza.id).anomalie.some(x => x.tipo === 'impegni'));
  ok(await marco('annullaAssenza', { id: r.assenza.id }));
  // Ore gia' scritte: un giorno con un rapportino di Marco.
  const rap = s.wisper.db.righe("SELECT data FROM rapportini WHERE utente_id = 3 AND UPPER(stato) <> 'ANNULLATO'").map(x => x.data).find(g => feriale(g)
    && !s.wisper.db.riga("SELECT id FROM assenze WHERE persona_id = 3 AND stato IN ('approvata', 'da_approvare') AND dal <= ? AND al >= ?", g, g));
  const conOre = ok(await marco('salvaAssenza', { assenza: { tipo: 'ferie', dal: rap, al: rap } }));
  assert.ok(conOre.anomalie.some(x => x.tipo === 'oreRegistrate' && x.testo === 'Ha già ore o rapportini in quei giorni'));
  // E' nel passato: la annulla chi approva, col motivo.
  ok(await manuel('annullaAssenza', { id: conOre.assenza.id, motivo: 'Prova' }));
});

test('la malattia nasce approvata, non si approva ne\' si respinge; la sovrapposizione; due permessi in ore diverse si\'', async () => {
  const g = feriali(piuGiorni(T, 90));
  const mal = ok(await marco('salvaAssenza', { assenza: { tipo: 'malattia', dal: g, al: g, protocollo: '111222333' } })).assenza;
  assert.deepEqual([mal.stato, mal.tipoVisto, mal.giorni], ['approvata', 'Malattia', 1]);
  assert.equal((await manuel('respingi', { voci: [{ tipo: 'assenza', id: mal.id }], motivo: 'x' })).errore, 'Questa assenza non si approva: è nata approvata');
  // Nel registro degli accessi: "cambiato" (scritta da lui: no, e' la sua; scritta dal titolare per lui: si').
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM accessi_riservati WHERE persona_id = 3 AND cosa = 'assenza' AND riferimento = ?", String(mal.id)).n, 0);
  // Un permesso nello stesso giorno: no.
  assert.equal((await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: g, dalle: '15:00', alle: '18:00' } })).errore,
    'Il ' + g.slice(8, 10) + '/' + g.slice(5, 7) + ' sei già assente: cambia quella richiesta');
  // Due permessi nello stesso giorno in ore diverse si', accavallati no.
  const g2 = feriali(piuGiorni(g, 1));
  ok(await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: g2, dalle: '08:00', alle: '10:00' } }));
  ok(await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: g2, dalle: '15:00', alle: '17:00' } }));
  assert.match((await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: g2, dalle: '09:00', alle: '11:00' } })).errore, /sei già in permesso: cambia quella richiesta$/);
  // I controlli.
  const no = async (x, frase) => assert.equal((await marco('salvaAssenza', { assenza: x })).errore, frase);
  await no({ tipo: 'vacanza', dal: g }, 'Tipo: ferie, permesso, malattia, infortunio, congedo, legge104 o altro');
  await no({ tipo: 'ferie' }, 'Dal: scrivi il primo giorno');
  await no({ tipo: 'ferie', dal: g2, al: g }, 'Al: non può venire prima di Dal');
  await no({ tipo: 'altro', dal: g2 }, 'Altro: scrivi la causale');
  await no({ tipo: 'permesso', dal: g2, dalle: '18:00', alle: '15:00' }, 'Alle: deve venire dopo dalle');
  await no({ tipo: 'ferie', dal: lunedi(piuGiorni(T, 100)) && piuGiorni(lunedi(piuGiorni(T, 100)), -2), al: piuGiorni(lunedi(piuGiorni(T, 100)), -1) }, 'In quei giorni non lavori: niente da chiedere');
  // La malattia di Marco: per chi non ha "riservati" e' "Assente" (anche per Laura, che le approva).
  assert.equal(ok(await laura('assenze', { da: g, a: g })).assenze.find(x => x.id === mal.id).tipoVisto, 'Assente');
});

test('chiusura dello studio: prima serveConferma con le persone; le ferie nascono approvate per chi le tiene; togliendola si tolgono', async () => {
  const dal = lunedi(piuGiorni(T, 120));
  const al = piuGiorni(dal, 4);
  // Marco ha gia' un permesso il mercoledi': quel giorno si salta.
  ok(await marco('salvaAssenza', { assenza: { tipo: 'permesso', dal: piuGiorni(dal, 2), dalle: '08:00', alle: '10:00' } }));
  const prima = await manuel('salvaChiusura', { chiusura: { nome: 'Ponte di prova', dal, al, ferie: true } });
  assert.equal(prima.serveConferma, true);
  assert.match(prima.errore, /^Nascono le ferie di Ponte di prova per \d persone: /);
  const marcoP = prima.persone.find(p => p.idPersona === MARCO);
  const lauraP = prima.persone.find(p => p.idPersona === LAURA);
  assert.deepEqual([marcoP.giorni, marcoP.ore, lauraP.giorni, lauraP.ore], [4, 32, 5, 30]);
  assert.equal(prima.persone.some(p => p.idPersona === 1), false, 'Manuel non tiene le ferie');
  assert.equal((await laura('salvaChiusura', { chiusura: { nome: 'X', dal, al } })).ok, true, 'amministrazione scrive le chiusure');
  assert.equal((await marco('salvaChiusura', { chiusura: { nome: 'X', dal, al } })).permesso, false);
  const ch = ok(await manuel('salvaChiusura', { chiusura: { nome: 'Ponte di prova', dal, al, ferie: true }, conferma: true })).chiusura;
  assert.equal(ch.frase, 'Studio chiuso: Ponte di prova');
  const nate = s.wisper.db.righe('SELECT * FROM assenze WHERE chiusura_id = ? ORDER BY persona_id, dal', ch.id);
  assert.ok(nate.every(a => a.stato === 'approvata' && a.tipo === 'ferie'));
  assert.deepEqual(nate.filter(a => a.persona_id === MARCO).map(a => [a.dal, a.al]), [[dal, piuGiorni(dal, 1)], [piuGiorni(dal, 3), al]], 'a pezzi, saltando il mercoledi\'');
  // Le chiusure nel calendario, e il giorno chiuso non e' da lavorare.
  assert.ok(ok(await marco('chiusure', { anno: dal.slice(0, 4) })).chiusure.some(c => c.id === ch.id));
  assert.equal(s.wisper.come({ utente: s.wisper.titolare(), permessi: s.wisper.permessiDi('titolare') }, () => s.wisper.giornoNonLavorato(null, dal)), 'chiuso');
  // Togliendola, prima la conferma, poi le ferie nate da lei spariscono.
  const via = await manuel('togliChiusura', { id: ch.id });
  assert.equal(via.serveConferma, true);
  ok(await manuel('togliChiusura', { id: ch.id, conferma: true }));
  assert.equal(s.wisper.db.riga("SELECT COUNT(*) n FROM assenze WHERE chiusura_id = ? AND stato = 'approvata'", ch.id).n, 0);
});

test('giorni senza rapportino: un giorno di assenza, un festivo (anche il 4 ottobre dal 2026) o una chiusura non mancano', async () => {
  const come = fn => s.wisper.come({ utente: s.wisper.titolare(), permessi: s.wisper.permessiDi('titolare') }, fn);
  assert.equal(come(() => s.wisper.giornoNonLavorato(null, '2027-10-04')), 'festa', 'San Francesco, lunedi\' 4 ottobre 2027');
  assert.equal(come(() => s.wisper.giornoNonLavorato(null, '2025-10-06')), '', 'un lunedi\' qualunque');
  // Un giorno feriale recente senza rapportino di Marco: manca; con la malattia segnata non manca piu'.
  const conRap = new Set(s.wisper.db.righe('SELECT data FROM rapportini WHERE utente_id = 3').map(r => r.data));
  let senza = '';
  for (let i = 1; i <= 6 && !senza; i++) {
    const g = piuGiorni(T, -i);
    if (feriale(g) && !conRap.has(g) && !s.wisper.db.riga("SELECT id FROM assenze WHERE persona_id = 3 AND stato = 'approvata' AND dal <= ? AND al >= ?", g, g)) senza = g;
  }
  if (!senza) return; // nessun giorno libero negli ultimi 6: niente da provare
  assert.ok(ok(await marco('dashboard', { tutto: true })).numeri.giorniSenzaRapportino.includes(senza));
  ok(await marco('salvaAssenza', { assenza: { tipo: 'malattia', dal: senza, al: senza } }));
  assert.equal(ok(await marco('dashboard', { tutto: true })).numeri.giorniSenzaRapportino.includes(senza), false);
  // Anche nelle ore: il giorno ha l'assenza ("Malattia" per lui).
});

test('un\'attivita\' per una persona assente quel giorno chiede conferma, con gli assenti; con conferma si salva', async () => {
  // Le ferie di Laura dei dati di esempio: cominciano oggi; l'attivita' va nel loro primo giorno da lavorare.
  const ferie = s.wisper.db.riga("SELECT dal, al FROM assenze WHERE persona_id = 2 AND tipo = 'ferie' AND stato = 'approvata' AND dal <= ? AND al >= ? ORDER BY id LIMIT 1", T, T);
  assert.equal(ferie.dal, T, 'Laura e\' in ferie da oggi');
  const g = feriali(ferie.dal);
  assert.ok(g <= ferie.al);
  const att = { titolo: 'Riunione di prova', tipo: 'appuntamento', assegnataA: 2, inizio: g + 'T10:00', fine: g + 'T11:00' };
  const r = await manuel('salvaAttivita', { attivita: att });
  assert.equal(r.serveConferma, true);
  assert.match(r.errore, /^Laura Bianchi è in ferie quel giorno \(/);
  assert.deepEqual(Object.keys(r.assenti[0]).sort(), ['al', 'dal', 'idPersona', 'idUtente', 'nome', 'tipoVisto']);
  assert.equal(r.assenti[0].tipoVisto, 'Ferie');
  ok(await manuel('salvaAttivita', { attivita: att, conferma: true }));
  // Un permesso a ore che non si accavalla: niente domanda.
  const g2 = feriali(piuGiorni(T, 140));
  ok(await manuel('salvaAssenza', { assenza: { idPersona: LAURA, tipo: 'permesso', dal: g2, dalle: '15:00', alle: '17:00' } }));
  const p = s.wisper.db.riga("SELECT id FROM assenze WHERE persona_id = 2 AND dal = ? AND tipo = 'permesso'", g2).id;
  ok(await manuel('approva', { voci: [{ tipo: 'assenza', id: p }] }));
  ok(await manuel('salvaAttivita', { attivita: { titolo: 'Mattina', tipo: 'appuntamento', assegnataA: 2, inizio: g2 + 'T09:00', fine: g2 + 'T10:00' } }));
  assert.equal((await manuel('salvaAttivita', { attivita: { titolo: 'Pomeriggio', tipo: 'appuntamento', assegnataA: 2, inizio: g2 + 'T16:00', fine: g2 + 'T17:00' } })).serveConferma, true);
});

test('il saldo dal cedolino: chi lo scrive, chi lo vede; quello nuovo vale da quel giorno', async () => {
  const s3 = ok(await marco('saldi', { idPersona: MARCO })).saldi;
  assert.deepEqual([s3.ferie.tenuto, s3.ferie.scritto, s3.permessi.scritto], [true, 104, 24]);
  assert.equal((await marco('saldi', { idPersona: LAURA })).permesso, false);
  assert.equal((await marco('salvaSaldo', { idPersona: MARCO, tipo: 'ferie', data: T, ore: 200 })).permesso, false);
  assert.equal((await luca('saldi', { idPersona: MARCO })).permesso, false);
  const nuovo = ok(await laura('salvaSaldo', { idPersona: MARCO, tipo: 'ferie', data: piuGiorni(T, -1), ore: 96.5, nota: 'Cedolino di prova' }));
  const f = ok(await manuel('saldi', { idPersona: MARCO })).saldi.ferie;
  assert.deepEqual([f.scritto, f.scrittoIl], [96.5, piuGiorni(T, -1)]);
  assert.ok(nuovo.saldi || nuovo.saldo);
  // Il collaboratore non vede il saldo dei colleghi nemmeno nella scheda.
  assert.equal(Object.prototype.hasOwnProperty.call(ok(await marco('persona', { id: LAURA })).persona, 'saldi'), false);
});
