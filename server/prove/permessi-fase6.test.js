// Fase 6: permessi per ruolo (fase6.md §11.2) su ogni azione nuova, la tabella dei permessi coi moduli nuovi e il
// ruolo esterno, "io" e "anagrafiche" coi campi nuovi, la Dashboard di ogni ruolo con le voci nuove (una cosa, una
// voce sola). Chi non puo' riceve permesso:false prima che il server cerchi qualunque cosa.
//   node --test server/prove/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serverDiProva, giornoDeiPrototipi } = require('./aiuto');
// La Dashboard intera del titolare contiene anche la storia a date fisse delle fasi 4 e 5: dal 2027 quella storia
// invecchia (fatture scadute da mesi, decine di pagamenti scaduti) e riempie le sezioni prima delle voci cercate qui
// (20 voci al massimo per sezione, come vuole l'accordo): queste prove la guardano dal giorno del prototipo, giovedi' 22/10/2026,
// qualunque giorno sia (anche con WISPER_OGGI_PROVA). Le altre prove girano sul giorno vero.
giornoDeiPrototipi();
const { iniziali } = require('../src/permessi');

let s;
const chi = {};
const ok = r => { assert.equal(r.ok, true, r.errore); return r; };
const RUOLI = ['titolare', 'amministrazione', 'collaboratore', 'lettura', 'esterno'];
const EMAIL = { titolare: 'manuel@esempio.it', amministrazione: 'laura@esempio.it', collaboratore: 'marco@esempio.it', lettura: 'lettura@esempio.it', esterno: 'luca@esempio.it' };

test.before(async () => {
  s = await serverDiProva();
  for (const r of RUOLI) chi[r] = await s.come(EMAIL[r]);
});
test.after(() => s.ferma());

test('la tabella dei permessi: i moduli della fase 6 e il ruolo esterno come nell\'accordo', () => {
  const atteso = {
    titolare: { persone: 2, mezzi: 2, collaboratori: 2, costi: 2, riservati: 2 },
    amministrazione: { persone: 2, mezzi: 2, collaboratori: 2, costi: 2, riservati: 0 },
    collaboratore: { persone: 1, mezzi: 1, collaboratori: 0, costi: 0, riservati: 0 },
    lettura: { persone: 1, mezzi: 1, collaboratori: 1, costi: 1, riservati: 0 },
    esterno: { persone: 0, mezzi: 0, collaboratori: 1, costi: 0, riservati: 0, dashboard: 1, commesse: 1, rapportini: 2, attivita: 2, spese: 2, ticket: 2, documenti: 1,
      clienti: 0, preventivi: 0, fatturazione: 0, banche: 0, amministrazione: 0 },
  };
  for (const r of RUOLI) {
    const p = s.wisper.permessiDi(r);
    for (const [m, l] of Object.entries(atteso[r])) assert.equal(p[m], l, r + '.' + m);
    assert.deepEqual(iniziali(r), Object.fromEntries(Object.keys(iniziali(r)).map(m => [m, p[m]])), r + ': i valori del database sono quelli iniziali');
  }
});

// Prima delle scritture (che fanno nascere richieste e chiusure): la Dashboard dei dati di prova.
test('Dashboard: le voci nuove per ruolo, con le frasi dell\'accordo; una cosa, una voce sola', async () => {
  const voci = d => d.urgenti.concat(d.settimana, d.pianificare);
  const unaVolta = (d, r) => {
    const visti = new Set();
    for (const v of voci(d)) {
      const k = v.titolo + '|' + JSON.stringify(v.collegamento);
      assert.ok(!visti.has(k), r + ': due volte ' + k);
      visti.add(k);
    }
    // Una scadenza di un mezzo, uno strumento, una persona o un collaboratore non torna come voce "scadenza" generica.
    const perOggetto = voci(d).filter(v => v.collegamento && ['mezzo', 'attrezzatura', 'persona', 'collaboratore'].includes(v.collegamento.pagina)).map(v => v.titolo);
    assert.equal(new Set(perOggetto).size, perOggetto.length, r);
  };
  const t = ok(await chi.titolare('dashboard', { tutto: true }));
  unaVolta(t, 'titolare');
  const titoli = voci(t).map(v => v.titolo);
  // "Oggi è assente" e' una voce "info", l'ultima per gravita', e le voci "info" scritte prima (rapportini, attivita') le
  // passano davanti: nelle ore in cui "questa settimana" e' piena (20 voci al massimo, come vuole l'accordo: finche' ci
  // sono anche il sopralluogo e l'intervento di oggi alle 14:30) per il titolare resta fuori. Allora la sezione dev'essere
  // piena davvero, fino all'ultima voce "info"; Laura resta tra gli assenti di oggi (assentiOggi, qui sotto) e la frase si
  // controlla sempre sulla Dashboard del collaboratore.
  const settimanaPiena = t.settimana.length === 20 && t.settimana[19].gravita === 'info';
  for (const frase of ['Primo soccorso di Marco Rossato scaduto da 32 giorni', 'Imbracatura anticaduta AT006: doveva rientrare ieri', 'Oggi è assente Laura Bianchi',
    '1 richiesta di ferie da approvare', 'DURC di Impianti Veneti di Sartori Luca scade fra 7 giorni', 'Visita medica di Marco Rossato fra 13 giorni',
    'Fiat Doblò GA123BC: assicurazione scade fra 14 giorni', 'Misuratore di terra MT-500: taratura fra 24 giorni', 'Fiat Doblò GA123BC: Spia della pressione delle gomme accesa',
    'Pinza amperometrica: taratura non scritta', 'Impianti Veneti di Sartori Luca: 720,00 € maturati da fatturare']) {
    if (frase === 'Oggi è assente Laura Bianchi' && settimanaPiena && !titoli.includes(frase)) continue;
    assert.ok(titoli.includes(frase), 'titolare: manca "' + frase + '"');
  }
  assert.ok(titoli.some(x => /^Multimetro 87V: taratura scaduta da \d+ giorn/.test(x)));
  assert.deepEqual(Object.keys(t.numeri.persone).sort(), ['assentiOggi', 'assentiOggiNomi', 'attive', 'daApprovare', 'scadenzeVicine', 'scadute']);
  assert.deepEqual(Object.keys(t.numeri.mezzi).sort(), ['fermi', 'guastiAperti', 'prestitiInRitardo', 'scadenzeVicine', 'tarateInScadenza', 'tarateScadute']);
  assert.deepEqual(Object.keys(t.numeri.collaboratori).sort(), ['daValutare', 'documentiInScadenza', 'incarichiInCorso', 'nonInRegola']);
  assert.equal(t.numeri.soldi.compensiDaFatturare, 720);
  assert.deepEqual(t.assentiOggi.map(a => [a.idPersona, a.tipoVisto]), [[2, 'Ferie']]);
  // Il collaboratore: le sue cose, gli assenti come "Assente", niente soldi.
  const m = ok(await chi.collaboratore('dashboard', { tutto: true }));
  unaVolta(m, 'collaboratore');
  const tm = voci(m).map(v => v.titolo);
  assert.ok(tm.includes('Primo soccorso di Marco Rossato scaduto da 32 giorni'));
  assert.ok(tm.some(x => /^Il tuo Multimetro 87V ha la taratura scaduta da \d+ giorn/.test(x)));
  assert.ok(tm.includes('Il Fiat Doblò che usi: assicurazione scade fra 14 giorni'));
  assert.ok(tm.includes('Firma la consegna: Elmetto con visiera'));
  assert.ok(tm.some(x => /^Le tue ferie dal \d+ al \d+ \w+ aspettano l'approvazione$/.test(x)));
  assert.equal(voci(m).find(v => v.titolo === 'Oggi è assente Laura Bianchi').dettaglio.startsWith('Assente fino a'), true);
  assert.equal(tm.some(x => /maturati da fatturare|richiesta di ferie da approvare|Imbracatura/.test(x)), false);
  assert.equal(m.numeri.soldi, undefined);
  assert.equal('collaboratori' in m.numeri, false);
  assert.deepEqual(m.assentiOggi.map(a => a.tipoVisto), ['Assente']);
  // Lettura: niente dati personali (la visita di Marco), niente approvazioni.
  const l = ok(await chi.lettura('dashboard', { tutto: true }));
  unaVolta(l, 'lettura');
  const tl = voci(l).map(v => v.titolo);
  assert.equal(tl.some(x => /Visita medica|Primo soccorso|richiesta di ferie/.test(x)), false);
  assert.ok(tl.includes('Misuratore di terra MT-500: taratura fra 24 giorni'));
  // I rientri dal laboratorio dei prossimi 7 giorni (il titolare ne ha tante: la sua sezione si ferma al massimo di voci).
  assert.ok(tl.some(x => /^Analizzatore di rete AR-6 rientra dal laboratorio \S+ \d+$/.test(x)), JSON.stringify(tl));
  // Amministrazione: le persone (con persone 2), la ferie da approvare; non le cose del solo titolare.
  const a = ok(await chi.amministrazione('dashboard', { tutto: true }));
  unaVolta(a, 'amministrazione');
  assert.ok(voci(a).some(v => v.titolo === '1 richiesta di ferie da approvare'));
  // L'esterno: la sua.
  const e = ok(await chi.esterno('dashboard', { tutto: true }));
  assert.equal(e.per, 'esterno');
});

// Le letture: chi riceve ok (true) e chi permesso:false (false).
const LETTURE = [
  ['persone', {}, [1, 1, 1, 1, 0]],
  ['persona', { id: 1 }, [1, 1, 1, 1, 0]],
  ['assenze', {}, [1, 1, 1, 1, 0]],
  ['presenze', {}, [1, 1, 1, 1, 0]],
  ['chiusure', {}, [1, 1, 1, 1, 0]],
  ['qualificheTipi', {}, [1, 1, 1, 1, 0]],
  ['dpi', {}, [1, 1, 1, 1, 0]],
  ['accessiRiservati', {}, [1, 1, 1, 1, 0]],
  ['mezzi', {}, [1, 1, 1, 1, 0]],
  ['mezzo', { id: 2 }, [1, 1, 1, 1, 0]],
  ['manutenzioni', {}, [1, 1, 1, 1, 0]],
  ['costiMezzo', { id: 2 }, [1, 1, 0, 1, 0]],
  ['attrezzature', {}, [1, 1, 1, 1, 0]],
  ['attrezzatura', { id: 1 }, [1, 1, 1, 1, 0]],
  ['assegnazioni', {}, [1, 1, 1, 1, 0]],
  ['usiStrumento', { idAttrezzatura: 4 }, [1, 1, 1, 1, 0]],
  ['collaboratori', {}, [1, 1, 0, 1, 1]],
  ['collaboratore', { id: 'F006' }, [1, 1, 0, 1, 1]],
  ['incarichi', {}, [1, 1, 0, 1, 1]],
  ['incarico', { id: 1 }, [1, 1, 0, 1, 1]],
  ['compensi', {}, [1, 1, 0, 1, 1]],
];

test('le letture nuove per ruolo (titolare, amministrazione, collaboratore, lettura, esterno)', async () => {
  for (const [azione, dati, attesi] of LETTURE) {
    for (let i = 0; i < RUOLI.length; i++) {
      const r = await chi[RUOLI[i]](azione, dati);
      if (attesi[i]) assert.equal(r.ok, true, azione + ' ' + RUOLI[i] + ': ' + r.errore);
      else assert.equal(r.permesso, false, azione + ' ' + RUOLI[i] + ': ' + JSON.stringify(r).slice(0, 100));
    }
  }
});

// Le scritture: chi passa il permesso (true: la risposta non e' permesso:false, anche se poi un campo manca) e chi no.
const SCRITTURE = [
  ['salvaCostoPersona', { idPersona: 5, dal: '2026-01-01', costoOrario: 20 }, [1, 1, 0, 0, 0]],
  ['salvaQualifica', { qualifica: { idPersona: 5, tipo: 'pes', data: '2026-01-10' } }, [1, 1, 0, 0, 0]],
  ['salvaVisita', { visita: { idPersona: 5, data: '2026-01-10', tipo: 'preventiva' } }, [1, 1, 0, 0, 0]],
  ['salvaSaldo', { idPersona: 5, tipo: 'ferie', data: '2026-09-30', ore: 10 }, [1, 1, 0, 0, 0]],
  ['salvaChiusura', { chiusura: { nome: 'Prova', dal: '2027-08-09', al: '2027-08-13' } }, [1, 1, 0, 0, 0]],
  ['salvaQualificaTipo', { tipo: { nome: 'Corso di prova', gruppo: 'altro' } }, [1, 0, 0, 0, 0]],
  ['daiAccesso', { idPersona: 5, email: 'elena@esempio.it', ruolo: 'collaboratore' }, [1, 0, 0, 0, 0]],
  ['segnaUscita', { idPersona: 5, data: '2027-01-31' }, [1, 1, 0, 0, 0]],
  ['anonimizzaPersona', { idPersona: 5 }, [1, 0, 0, 0, 0]],
  ['salvaMezzo', { mezzo: { nome: 'Furgone', proprieta: 'studio' } }, [1, 1, 0, 0, 0]],
  ['salvaAttrezzatura', { attrezzatura: { nome: 'Trapano', categoria: 'attrezzo' } }, [1, 1, 0, 0, 0]],
  ['registraTaratura', { taratura: { idAttrezzatura: 3, esito: 'conforme' } }, [1, 1, 0, 0, 0]],
  ['salvaManutenzione', { manutenzione: { idVeicolo: 2, tipo: 'gomme', titolo: 'Gomme invernali' } }, [1, 1, 0, 0, 0]],
  ['salvaCollaboratore', { collaboratore: { idSoggetto: 'F006', tipo: 'impresa' } }, [1, 1, 0, 0, 0]],
  ['salvaIncarico', { incarico: { idSoggetto: 'F006', idCommessa: '26ST002', titolo: 'Prova', modo: 'corpo', compenso: 100 } }, [1, 1, 0, 0, 0]],
  ['invitaEsterno', { idSoggetto: 'F006', nome: 'Prova', email: 'prova-esterno@esempio.it' }, [1, 0, 0, 0, 0]],
  ['salvaAssenza', { assenza: { tipo: 'ferie', dal: '2027-03-01' } }, [1, 1, 1, 1, 0]],
];

test('le scritture nuove per ruolo: chi passa il permesso e chi riceve permesso:false', async () => {
  for (const [azione, dati, attesi] of SCRITTURE) {
    for (let i = RUOLI.length - 1; i >= 0; i--) {
      const r = await chi[RUOLI[i]](azione, dati);
      if (attesi[i]) assert.notEqual(r.permesso, false, azione + ' ' + RUOLI[i] + ': ' + r.errore);
      else assert.equal(r.permesso, false, azione + ' ' + RUOLI[i] + ': ' + JSON.stringify(r).slice(0, 100));
    }
  }
});

test('io: idPersona, puoApprovareAssenze, vedeRiservati, taraturaBlocco, versioneServer; l\'esterno col suo collaboratore', async () => {
  const atteso = { titolare: [1, true, true], amministrazione: [2, true, false], collaboratore: [3, false, false], lettura: [4, false, false], esterno: [null, false, false] };
  for (const r of RUOLI) {
    const i = ok(await chi[r]('io')).interfaccia;
    assert.deepEqual([i.idPersona, i.puoApprovareAssenze, i.vedeRiservati], atteso[r], r);
    assert.equal(i.taraturaBlocco, 'avviso');
    assert.equal(i.versioneServer, require('../package.json').version);
    assert.equal('esterno' in i, r === 'esterno');
  }
  assert.deepEqual(ok(await chi.esterno('io')).interfaccia.esterno, { idSoggetto: 'F006', nome: 'Impianti Veneti di Sartori Luca' });
});

test('anagrafiche: utenti con idPersona, fornitori con collaboratore, numerazioni incarico e attrezzatura, mezzi e miei strumenti con mezzi 1', async () => {
  const a = ok(await chi.titolare('anagrafiche'));
  assert.equal(a.utenti.find(u => u.id === 3).idPersona, 3);
  assert.equal(a.utenti.find(u => u.id === 5).idPersona, null, 'l\'esterno non e\' una persona dello studio');
  assert.deepEqual(a.fornitori.filter(f => f.collaboratore).map(f => f.id), ['F006']);
  assert.ok(['incarico', 'attrezzatura'].every(t => a.numerazioni.some(n => n.tipo === t)));
  assert.ok(Array.isArray(a.mezzi) && Array.isArray(a.mieiStrumenti));
  const e = ok(await chi.esterno('anagrafiche'));
  assert.equal('mezzi' in e, false);
  assert.equal('mieiStrumenti' in e, false);
});
