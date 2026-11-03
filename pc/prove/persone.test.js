// Fase 6 di Wisper Ufficio (persone, mezzi e attrezzature, collaboratori esterni), provata con Node:
// i conti condivisi col server (server/prove/casi-persone.json, casi-mezzi.json, casi-incarichi.json: stessi numeri al
// centesimo), le regole di ferie e saldi, delle tarature nel rapportino, di cosa si mostra per ruolo (i tre livelli di
// dati della persona: solo quello che il server manda), la riga Strumenti del PDF del rapportino.
//   node --test "pc/prove/*.test.js"
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const C = require('../ui/conti.js');
global.WisperConti = C;
const R = require('../ui/regole.js');
global.WisperRegole = R;
const P = require('../ui/regole-persone.js');
const D = require('../ui/documenti.js');
global.WisperRegolePreventivi = require('../ui/regole-preventivi.js');
global.WisperRegoleAttivita = require('../ui/regole-attivita.js');
const RO = require('../ui/regole-ore-spese.js');

const casi = nome => require(path.join(__dirname, '..', '..', 'server', 'prove', nome));
const PERSONE = casi('casi-persone.json');
const MEZZI = casi('casi-mezzi.json');
const INCARICHI = casi('casi-incarichi.json');

// ------------------------------------------------------------------ i conti condivisi col server

test('casi-persone.json: festivi (Pasquetta, 4 ottobre dal 2026, patrono) come il server', () => {
  for (const c of PERSONE.festivi) assert.deepEqual(P.festivi(c.anno, c.patrono), c.atteso, c.nome);
});

test('casi-persone.json: giorni lavorativi (a cavallo dell\'anno, part time, patrono)', () => {
  for (const c of PERSONE.giorniLavorativi) assert.equal(P.giorniLavorativi(c.dal, c.al, c.giorni, P.festiviTra(c.dal, c.al, c.patrono)), c.atteso, c.nome);
});

test('casi-persone.json: giorni e ore di un\'assenza (mezza giornata, permesso, malattia a calendario, Legge 104 a ore)', () => {
  for (const c of PERSONE.oreAssenza) assert.deepEqual(P.oreAssenza(c.assenza, c.persona, P.festiviTra(c.assenza.dal, c.assenza.al || c.assenza.dal, '')), c.atteso, c.nome);
});

test('casi-persone.json: il saldo di ferie e permessi dal cedolino (prudente: le richieste aperte si tolgono)', () => {
  for (const c of PERSONE.saldoAssenze) {
    const r = P.saldoAssenze({ annue: c.annue, saldi: c.saldi, assenze: c.assenze, oggi: c.oggi, entrata: c.entrata, uscita: c.uscita });
    if (!c.atteso.tenuto) assert.deepEqual(r, { tenuto: false }, c.nome);
    else assert.deepEqual(r, c.atteso, c.nome);
  }
});

test('casi-persone.json: il costo orario proposto dal costo dell\'anno', () => {
  for (const c of PERSONE.costoOrarioDaAnno) assert.equal(P.costoOrarioDaAnno(c.costoAnno, c.oreAnno), c.atteso);
  assert.equal(P.costoOrarioDaAnno(1000, 0), null, 'senza ore niente proposta');
});

test('casi-mezzi.json: revisione proposta, km al tagliando, stato della taratura con la parola', () => {
  for (const c of MEZZI.scadenzaRevisione) assert.equal(P.scadenzaRevisione(c.immatricolazione, c.ultimaRevisione), c.atteso, c.nome);
  for (const c of MEZZI.kmAlTagliando) assert.equal(P.kmAlTagliando({ tagliandoKm: c.tagliandoKm, tagliandoUltimoKm: c.tagliandoUltimoKm, km: c.km }), c.atteso, c.nome);
  for (const c of MEZZI.statoTaratura) assert.deepEqual(P.statoTaratura(c.x, c.oggi, c.preavviso), c.atteso, c.nome);
});

test('casi-incarichi.json: pattuito, maturato, fatturato, costo, da fatturare', () => {
  for (const c of INCARICHI.incarichi) {
    const r = P.contiIncarico(c);
    for (const k of Object.keys(c.atteso)) assert.equal(r[k], c.atteso[k], c.nome + ' · ' + k);
  }
});

// ------------------------------------------------------------------ ferie e permessi: l'anteprima di Chiedi ferie

const SALDI_MARCO = { ferie: { tenuto: true, scritto: 104, scrittoIl: '2026-09-30', maturate: 0, godute: 0, oggi: 104, prenotate: 40, restano: 64, oreGiorno: 8, giorniOggi: 13, giorniRestano: 8 },
  permessi: { tenuto: true, scritto: 24, scrittoIl: '2026-09-30', oggi: 24, prenotate: 0, restano: 24, oreGiorno: 8 } };
const MARCO = { oreSettimana: 40, giorniSettimana: [1, 2, 3, 4, 5] };

test('chiedi ferie: il conto grande e quanto resta dopo la richiesta (in giorni della persona)', () => {
  const a = P.anteprimaAssenza({ tipo: 'ferie', dal: '2026-11-16', al: '2026-11-20' }, MARCO, SALDI_MARCO, '');
  assert.deepEqual(a.conto, { giorni: 5, ore: 40 });
  assert.equal(P.contoAssenza(a.conto), '5 giorni · 40 ore');
  assert.equal(a.saldo.restano, 24);
  assert.equal(a.saldo.giorni, 3);
  assert.equal(P.fraseRestano(a.saldo), 'Ti restano 3 giorni di ferie');
  assert.equal(P.fraseRestano(a.saldo, true), 'Restano 3 giorni di ferie');
  // Sotto zero: la parola e il meno.
  const b = P.anteprimaAssenza({ tipo: 'ferie', dal: '2026-11-09', al: '2026-11-27' }, MARCO, SALDI_MARCO, '');
  assert.equal(b.conto.giorni, 15);
  assert.ok(b.saldo.sottoZero);
  assert.equal(P.fraseRestano(b.saldo), 'Ti restano −7 giorni di ferie');
  // Il permesso resta in ore.
  const p = P.anteprimaAssenza({ tipo: 'permesso', dal: '2026-10-30', al: '2026-10-30', dalle: '15:00', alle: '18:00' }, MARCO, SALDI_MARCO, '');
  assert.equal(P.contoAssenza(p.conto), '3 ore');
  assert.equal(P.fraseRestano(p.saldo), 'Ti restano 21 ore di permesso');
  // Malattia: si segnala, nessun saldo; senza saldo tenuto, niente frase.
  assert.equal(P.anteprimaAssenza({ tipo: 'malattia', dal: '2026-10-09', al: '2026-10-13' }, MARCO, SALDI_MARCO, '').saldo, null);
  assert.equal(P.anteprimaAssenza({ tipo: 'ferie', dal: '2026-11-02' }, MARCO, { ferie: { tenuto: false } }, '').saldo, null);
  // Il patrono è festa anche nell'anteprima.
  assert.equal(P.anteprimaAssenza({ tipo: 'ferie', dal: '2026-06-29', al: '2026-07-03' }, MARCO, null, '07-01').conto.giorni, 4);
});

test('assenze a parole: quando, il tipo che si vede ("Assente" se il server non dice il tipo), gli stati', () => {
  assert.equal(P.quandoAssenza({ dal: '2026-11-02', al: '2026-11-06' }), 'Dal 2 al 6 novembre');
  assert.equal(P.quandoAssenza({ dal: '2026-10-30', al: '2026-11-03' }), 'Dal 30 ottobre al 3 novembre');
  assert.equal(P.quandoAssenza({ dal: '2026-10-30', al: '2026-10-30', dalle: '15:00', alle: '18:00' }), 'Venerdì 30 ottobre · 15:00-18:00');
  assert.equal(P.quandoAssenza({ dal: '2026-11-09', al: '2026-11-09', mezza: 'mattina' }), 'Lunedì 9 novembre · mattina');
  assert.equal(P.quandoAssenza({ dal: '2026-12-28', al: '2027-01-05' }), 'Dal 28 dicembre al 5 gennaio 2027');
  assert.equal(P.tipoVisto({ tipoVisto: 'Assente', dal: '2026-10-22' }), 'Assente', 'il collaboratore vede un collega');
  assert.equal(P.tipoVisto({ dal: '2026-10-22' }), 'Assente', 'senza tipo né tipoVisto: Assente, mai indovinato');
  assert.equal(P.tipoVisto({ tipo: 'altro', causale: 'Lutto' }), 'Lutto');
  assert.equal(P.giorniDaOre(104, 8), 13);
  assert.equal(P.giorniDaOre(42, 6), 7);
  assert.equal(P.giorniDaOre(-56, 8), -7);
  assert.equal(P.coloreAssenza('da_approvare'), 'giallo');
  assert.equal(P.coloreAssenza('approvata'), 'verde');
  assert.equal(P.coloreAssenza('respinta'), 'rosso');
});

test('la griglia del mese: festivi e fine settimana grigi, chiusure, assenze approvate e da approvare (non le respinte)', () => {
  const giorni = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
  const persone = [{ id: 2, nome: 'Laura Bianchi' }, { id: 3, nome: 'Marco Rossato' }];
  const assenze = [{ id: 1, idPersona: 2, dal: '2026-10-05', al: '2026-10-06', stato: 'approvata', tipoVisto: 'Ferie' },
    { id: 2, idPersona: 3, dal: '2026-10-05', al: '2026-10-05', stato: 'respinta', tipoVisto: 'Ferie' },
    { id: 3, idPersona: 3, dal: '2026-10-06', al: '2026-10-06', stato: 'da_approvare', tipoVisto: 'Permesso' }];
  const g = P.grigliaAssenze(persone, assenze, giorni, P.festivi(2026, ''), [{ dal: '2026-10-07', al: '2026-10-07', nome: 'Inventario' }]);
  assert.equal(g[0].celle[1].tipo, 'weekend');
  assert.equal(g[0].celle[2].tipo, 'festa', 'il 4 ottobre è festa dal 2026');
  assert.equal(g[0].celle[3].assenza.id, 1);
  assert.equal(g[1].celle[3].assenza, null, 'la respinta non si vede');
  assert.equal(P.classeAssenza(g[1].celle[4].assenza), 'da-approvare');
  assert.equal(P.classeAssenza(g[0].celle[3].assenza), 'ferie');
  assert.equal(P.classeAssenza({ stato: 'approvata', tipoVisto: 'Assente' }), 'altra');
  assert.equal(g[0].celle[5].tipo, 'chiuso');
  assert.equal(g[0].celle[5].chiusura.nome, 'Inventario');
});

// ------------------------------------------------------------------ tarature nel rapportino

test('strumenti nel rapportino: tarato sì, scaduto solo confermando (con "blocco" mai), non conforme e al laboratorio mai', () => {
  const tar = (stato, scade) => ({ stato, parola: { valida: 'Tarato fino al 15/11/2026', in_scadenza: 'Taratura fra 24 giorni', scaduta: 'Taratura scaduta da 10 giorni', senza: 'Taratura non scritta', non_conforme: 'Non conforme', laboratorio: 'In taratura' }[stato], scade: scade || '' });
  assert.deepEqual(P.sceltaStrumento({ nome: 'Misuratore di terra MT-500', taratura: tar('valida') }, 'avviso'), { si: true });
  assert.deepEqual(P.sceltaStrumento({ nome: 'Misuratore di terra MT-500', taratura: tar('in_scadenza') }, 'avviso'), { si: true });
  assert.deepEqual(P.sceltaStrumento({ nome: 'Pinza amperometrica', taratura: tar('senza') }, 'avviso'), { si: true }, 'taratura non scritta: si sceglie (pillola grigia)');
  const s = P.sceltaStrumento({ nome: 'Multimetro 87V', taratura: tar('scaduta', '2026-10-16') }, 'avviso');
  assert.equal(s.si, true);
  assert.equal(s.conferma, true);
  assert.equal(s.titolo, 'Il Multimetro 87V ha la taratura scaduta');
  assert.equal(s.frase, 'Scaduta il 16/10/2026: le misure potrebbero non valere.');
  const b = P.sceltaStrumento({ nome: 'Multimetro 87V', taratura: tar('scaduta', '2026-10-16') }, 'blocco');
  assert.equal(b.si, false);
  const nc = P.sceltaStrumento({ nome: 'Analizzatore di rete AR-6', fuoriUso: 'non_conforme', fuoriUsoIl: '2026-10-02', taratura: tar('non_conforme') }, 'avviso');
  assert.deepEqual(nc, { si: false, motivo: 'Non conforme dal 02/10: non si usa finché non è tarato di nuovo' });
  assert.equal(P.sceltaStrumento({ nome: 'X', taratura: tar('non_conforme') }, 'blocco').si, false);
  assert.deepEqual(P.sceltaStrumento({ nome: 'Analizzatore di rete AR-6', stato: 'laboratorio', rientro: '2026-10-29', taratura: tar('laboratorio') }, 'avviso'), { si: false, motivo: 'È al laboratorio fino al 29/10' });
  assert.equal(P.sceltaStrumento({ nome: 'Y', fuoriUso: 'guasto', fuoriUsoMotivo: 'Il display non si accende' }, 'avviso').motivo, 'Fuori uso: Il display non si accende');
  assert.deepEqual(P.sceltaStrumento({ nome: 'Scala', taratura: null }, 'avviso'), { si: true }, 'senza controllo periodico');
  // La verifica dei DPI dice "verifica".
  assert.equal(P.sceltaStrumento({ nome: 'Imbracatura', taratura: { stato: 'scaduta', parola: 'Verifica scaduta da 2 giorni', scade: '2026-10-20' } }, 'avviso').titolo, 'Il Imbracatura ha la verifica scaduta');
});

test('lo stato di quel giorno di uno strumento usato: la parola e il colore (congelati nel rapportino)', () => {
  assert.deepEqual(P.statoAllora({ statoAllora: 'valida', scadeAllora: '2026-11-15' }), { parola: 'Tarato fino al 15/11/2026', colore: 'verde' });
  assert.deepEqual(P.statoAllora({ statoAllora: 'scaduta', confermato: true }), { parola: 'Taratura scaduta · confermato', colore: 'rosso' });
  assert.deepEqual(P.statoAllora({ statoAllora: 'scaduta', confermato: false }), { parola: 'Taratura scaduta', colore: 'rosso' });
  assert.deepEqual(P.statoAllora({ statoAllora: 'senza' }), { parola: 'Taratura non scritta', colore: 'grigio' });
  assert.deepEqual(P.statoAllora({ statoAllora: 'valida', scadeAllora: '2026-12-31', verifica: true }), { parola: 'Verificato fino al 31/12/2026', colore: 'verde' });
  assert.equal(P.statoAllora({ statoAllora: 'non_conforme' }).colore, 'rosso');
  assert.equal(P.statoAllora({ statoAllora: 'laboratorio' }).parola, 'In taratura');
});

test('"Come l\'ultima volta qui": gli strumenti dell\'ultimo rapportino per lo stesso impianto, o lo stesso cliente', () => {
  const rap = [
    { id: 'RAP/2026/0001', data: '2026-10-01', idCliente: 'C002', luogo: 'Cabina MT Acme', strumenti: [{ idAttrezzatura: 1 }, { idAttrezzatura: 4 }] },
    { id: 'RAP/2026/0002', data: '2026-10-10', idCliente: 'C002', luogo: 'Magazzino', strumenti: [{ idAttrezzatura: 3 }] },
    { id: 'RAP/2026/0003', data: '2026-10-12', idCliente: 'C001', luogo: '', strumenti: [{ idAttrezzatura: 2 }] },
    { id: 'RAP/2026/0004', data: '2026-10-15', idCliente: 'C002', luogo: 'Cabina MT Acme', strumenti: [] },
    { id: 'RAP/2026/0005', data: '2026-10-20', idCliente: 'C002', luogo: 'Cabina MT Acme', stato: 'ANNULLATO', strumenti: [{ idAttrezzatura: 9 }] },
  ];
  assert.deepEqual(P.comeUltimaVolta(rap, 'C002', 'cabina mt acme'), [1, 4], 'stesso impianto: il più recente con strumenti, non l\'annullato');
  assert.deepEqual(P.comeUltimaVolta(rap, 'C002', 'Ufficio'), [3], 'impianto nuovo: l\'ultimo del cliente');
  assert.deepEqual(P.comeUltimaVolta(rap, 'C009', ''), []);
  assert.deepEqual(P.comeUltimaVolta(rap, 'C002', 'Magazzino', 'RAP/2026/0002'), [1, 4], 'il rapportino che si sta scrivendo non conta');
});

// ------------------------------------------------------------------ cosa si mostra per ruolo (solo quello che il server manda)

// Le schede come le manda il server di prova (architettura.md §17.3, accorciate): Manuel, Laura, Marco su di sé, Marco su Laura.
const LAVORO = { id: 3, nome: 'Marco Rossato', rapporto: 'dipendente', rapportoNome: 'Dipendente', ruoloStudio: 'Tecnico elettrico', mansione: 'Verifiche', emailLavoro: 'marco@esempio.it',
  telefonoLavoro: '0445 000301', entrataIl: '2023-05-02', oreSettimana: 40, giorniSettimana: [1, 2, 3, 4, 5], oreGiorno: 8, idUtente: 3, assenteOggi: null,
  mezzi: [{ tipo: 'mezzo', id: 2, nome: 'Fiat Doblò GA123BC', come: 'assegnato' }], attrezzature: [] };
const PERSONALI = { codiceFiscale: 'RSSMRC90A01L157X', indirizzo: 'Via dell\'Esempio 22', telefonoPersonale: '333 0000301', iban: 'IT60X0542811101000000123456', emergenzaNome: 'Giulia Rossato',
  contrattoTipo: 'indeterminato', contrattoScade: '', saldi: SALDI_MARCO, assenze: [{ id: 1, tipo: 'ferie', stato: 'da_approvare', dal: '2026-11-02', al: '2026-11-06', daApprovare: true }],
  dpi: [], scadenze: [{ id: 11, titolo: 'Primo soccorso di Marco Rossato' }], prossimaVisita: '2026-11-04' };
const QUAL = { qualifiche: [{ id: 1, tipo: 'pes', statoVisto: 'Valida' }] };
const MANUEL_SU_MARCO = Object.assign({}, LAVORO, PERSONALI, QUAL, { ccnl: 'Studi professionali', livello: '3', noteRiservate: '', costoOrario: 28.5, costoDal: '2026-01-01', costoAnno: 47025, oreAnno: 1650,
  costi: [{ dal: '2026-01-01', costoOrario: 28.5, costoAnno: 47025, oreAnno: 1650 }], visite: [{ id: 1, giudizio: 'idoneo_prescrizioni', giudizioVisto: 'Idoneo con prescrizioni' }],
  documenti: [{ id: 14, titolo: 'Cedolino', documentoRiservato: true }], puoScrivere: true, puoApprovare: true });
const LAURA_SU_MARCO = Object.assign({}, LAVORO, PERSONALI, QUAL, { costoOrario: 28.5, costoDal: '2026-01-01', costi: [{ dal: '2026-01-01', costoOrario: 28.5 }],
  visite: [{ id: 1, data: '2025-11-04', prossima: '2026-11-04', riga: 'Visita del 04/11/2025 · prossima il 04/11/2026' }], documenti: [], puoScrivere: true, puoApprovare: true });
const MARCO_SU_DI_SE = Object.assign({}, LAVORO, PERSONALI, QUAL, { ccnl: 'Studi professionali', livello: '3', noteRiservate: '', visite: [{ id: 1, giudizio: 'idoneo_prescrizioni' }],
  documenti: [{ id: 14, documentoRiservato: true }], puoScrivere: false, puoCambiareContatti: true, puoApprovare: false });
const MARCO_SU_LAURA = { id: 2, nome: 'Laura Bianchi', rapporto: 'dipendente', ruoloStudio: 'Amministrazione', emailLavoro: 'laura@esempio.it', idUtente: 2,
  assenteOggi: { dal: '2026-10-22', al: '2026-10-23', tipoVisto: 'Assente' }, mezzi: [], attrezzature: [], qualifiche: [], documenti: [], puoScrivere: false, puoApprovare: false };

test('la scheda del titolare: tutte le sezioni, i riservati, il costo dell\'anno, il giudizio', () => {
  const s = P.sezioniPersona(MANUEL_SU_MARCO);
  for (const k of ['lavoro', 'ferie', 'competenze', 'visite', 'giudizio', 'inUso', 'documenti', 'costo', 'costoAnno', 'personali', 'riservati', 'scadenze', 'accesso']) assert.equal(s[k], true, k);
});

test('l\'amministrazione (senza riservati): il costo orario sì, il costo dell\'anno, i riservati e il giudizio no', () => {
  const s = P.sezioniPersona(LAURA_SU_MARCO);
  assert.equal(s.costo, true);
  assert.equal(s.costoAnno, false);
  assert.equal(s.riservati, false);
  assert.equal(s.giudizio, false, 'vede solo "Visita del ... · prossima il ..."');
  assert.equal(s.visite, true);
  assert.equal(s.personali, true);
  assert.equal(s.documenti, true, 'può caricare: la sezione c\'è, ma senza il cedolino riservato');
});

test('la persona su di sé: i suoi personali e riservati, il giudizio, i documenti riservati; mai il suo costo', () => {
  const s = P.sezioniPersona(MARCO_SU_DI_SE);
  assert.equal(s.costo, false);
  assert.equal(s.costoAnno, false);
  assert.equal(s.riservati, true);
  assert.equal(s.giudizio, true);
  assert.equal(s.documenti, true);
  assert.equal(s.accesso, false, 'l\'accesso a Wisper lo vede chi scrive le schede');
  // Il suo giallo: Chiedi ferie o permesso.
  assert.deepEqual(P.gialloPersona(MARCO_SU_DI_SE, 3, false), { azione: 'chiedi', testo: 'Chiedi ferie o permesso' });
});

test('il collaboratore che apre un collega: solo il lavoro, niente etichette vuote (competenze e documenti degli altri non ci sono)', () => {
  const s = P.sezioniPersona(MARCO_SU_LAURA);
  assert.deepEqual(Object.keys(s).filter(k => s[k]), ['lavoro'], 'niente ferie, competenze, visite, documenti, costo, personali');
  assert.equal(P.tipoVisto(MARCO_SU_LAURA.assenteOggi), 'Assente');
  assert.equal(P.gialloPersona(MARCO_SU_LAURA, 3, false), null, 'nessun giallo');
});

test('il giallo della scheda: chi approva vede "Approva le ferie" sulla richiesta aperta; chi non approva niente', () => {
  const g = P.gialloPersona(MANUEL_SU_MARCO, 1, true);
  assert.equal(g.azione, 'approva');
  assert.equal(g.testo, 'Approva le ferie');
  assert.equal(g.assenza.id, 1);
  assert.equal(P.gialloPersona(MANUEL_SU_MARCO, 1, false), null);
  assert.equal(P.gialloPersona(Object.assign({}, MANUEL_SU_MARCO, { assenze: [] }), 1, true), null);
});

test('i colori sempre con la parola (fase6.md §12)', () => {
  const casiColore = { 'Taratura scaduta da 10 giorni': 'rosso', 'Non conforme': 'rosso', 'Fuori uso': 'rosso', Fermo: 'rosso', 'Documenti scaduti': 'rosso', 'Non idoneo': 'rosso', Male: 'rosso',
    'Scade fra 14 giorni': 'ambra', 'Taratura fra 24 giorni': 'ambra', 'In officina': 'ambra', 'Manca qualcosa': 'ambra', 'Idoneo con prescrizioni': 'ambra', 'Con qualche problema': 'ambra',
    'Da approvare': 'giallo', 'Da completare': 'giallo', 'Assegnato a Marco Rossato': 'blu', 'In prestito a Impianti Veneti di Sartori Luca': 'blu', 'In taratura': 'blu', Affidato: 'blu', Permesso: 'blu',
    Disponibile: 'verde', 'Tarato fino al 08/04/2027': 'verde', Valida: 'verde', Approvata: 'verde', 'In regola': 'verde', Idoneo: 'verde', Concluso: 'verde', Bene: 'verde', Ferie: 'verde',
    Assente: 'grigio', Annullata: 'grigio' };
  for (const [parola, atteso] of Object.entries(casiColore)) assert.equal(P.colore(parola), atteso, parola);
  assert.equal(P.coloreTaratura({ stato: 'scaduta' }), 'rosso');
  assert.equal(P.coloreMezzo('fermo'), 'rosso');
  assert.equal(P.coloreIdoneita('manca'), 'ambra');
  assert.equal(P.coloreIncarico('bozza'), 'giallo');
});

test('i documenti personali: la categoria si propone dal nome del file', () => {
  assert.equal(P.categoriaDaNomeFile('cedolino-settembre-2026.pdf'), 'Cedolini');
  assert.equal(P.categoriaDaNomeFile('Contratto firmato.pdf'), 'Contratti di lavoro');
  assert.equal(P.categoriaDaNomeFile('giudizio idoneità 2025.pdf'), 'Idoneità sanitarie');
  assert.equal(P.categoriaDaNomeFile('Attestato PES.pdf'), 'Attestati e abilitazioni');
  assert.equal(P.categoriaDaNomeFile('foto.jpg'), '');
});

test('il saldo nella scheda: i numeri grandi e la riga sotto, o niente senza saldo', () => {
  const r = P.righeSaldo(SALDI_MARCO);
  assert.equal(r.ferie.grande, '13 giorni');
  assert.equal(r.ferie.sotto, 'di ferie (104 ore)');
  assert.equal(r.permessi.grande, '24 ore');
  assert.equal(r.riga, 'Dal cedolino di settembre · dopo le richieste restano 8 giorni');
  assert.equal(P.righeSaldo({ ferie: { tenuto: false }, permessi: { tenuto: false } }), null);
});

// ------------------------------------------------------------------ menu, collegamenti, esterno

test('l\'esterno: "La tua scheda" al posto di Collaboratori esterni; i collegamenti della Dashboard della fase 6', () => {
  const voce = R.VOCI_MENU.find(v => v.modulo === 'collaboratori');
  assert.equal(P.nomeVoce(voce, true), 'La tua scheda');
  assert.equal(P.nomeVoce(voce, false), 'Collaboratori esterni');
  assert.equal(P.hashPersona(3, 3), '#persone/io');
  assert.equal(P.hashPersona(2, 3), '#persone/p/2');
  assert.deepEqual(R.destinazione({ pagina: 'persone', filtro: { segmento: 'ferie', daApprovare: true } }), { hash: '#persone/ferie', filtro: { segmento: 'ferie', daApprovare: true } });
  assert.equal(R.destinazione({ pagina: 'persone', filtro: { segmento: 'organico' } }).hash, '#persone');
  assert.equal(R.destinazione({ pagina: 'persona', id: 3 }).hash, '#persone/p/3');
  assert.equal(R.destinazione({ pagina: 'mezzo', id: 2 }).hash, '#mezzi/mezzo/2');
  assert.equal(R.destinazione({ pagina: 'attrezzatura', id: 4 }).hash, '#mezzi/at/4');
  assert.equal(R.destinazione({ pagina: 'mezzi', filtro: { segmento: 'strumenti', taratura: 'scadute' } }).hash, '#mezzi/strumenti');
  assert.equal(R.destinazione({ pagina: 'collaboratore', id: 'F006' }).hash, '#collaboratori/c/F006');
  assert.equal(R.destinazione({ pagina: 'incarico', id: 1 }).hash, '#collaboratori/in/1');
  assert.equal(R.destinazione({ pagina: 'collaboratori', filtro: { segmento: 'compensi' } }).hash, '#collaboratori/compensi');
  assert.equal(R.testoAzione({ pagina: 'attrezzatura', id: 4 }), 'Apri lo strumento');
  assert.equal(R.moduloDi('#mezzi/at/4'), 'mezzi');
  assert.equal(R.RUOLI.esterno.nome, 'Esterno');
  assert.ok(R.ORDINE_RUOLI.indexOf('esterno') < 0, 'un utente esterno non si crea da Utenti: si invita dal collaboratore');
  assert.ok(R.VIETATI_ESTERNO.indexOf('riservati') >= 0 && R.VIETATI_ESTERNO.indexOf('costi') >= 0);
});

// ------------------------------------------------------------------ PDF del rapportino e costo della commessa

const ANA = { impostazioni: { RAGIONE_SOCIALE: 'Studio Tecnico GM', TECNICO: 'Manuel Gasparotto' }, clienti: [{ id: 'C002', nome: 'Rossi Impianti Srl' }], commesse: [] };
const RAP = { id: 'RAP/2026/0006', data: '2026-10-16', stato: 'BOZZA', idCliente: 'C002', cliente: 'Rossi Impianti Srl', idCommessa: '26ST002', descrizione: 'Verifica impianto di terra',
  oreLavoro: 4, oreExtra: 0, oreViaggio: 1, km: 40, spese: 0, tecnico: 'Marco Rossato' };

test('PDF del rapportino: senza strumenti identico a prima (anche con strumenti: []), con la riga Strumenti quando ci sono', () => {
  const prima = D.rapportino(RAP, ANA, {});
  assert.equal(D.rapportino(Object.assign({}, RAP, { strumenti: [] }), ANA, {}), prima, 'elenco vuoto: il PDF non cambia di un carattere');
  assert.ok(prima.indexOf('Strumenti') < 0);
  const con = D.rapportino(Object.assign({}, RAP, { strumenti: [
    { idAttrezzatura: 1, codice: 'AT001', nome: 'Misuratore di terra MT-500', matricola: '22-0451', scadeAllora: '2026-11-15', statoAllora: 'valida', confermato: false },
    { idAttrezzatura: 4, codice: 'AT004', nome: 'Multimetro 87V', matricola: '6011-2381', scadeAllora: '2026-10-12', statoAllora: 'scaduta', confermato: true }] }), ANA, {});
  assert.ok(con.indexOf('<div class="etichetta">Strumenti</div>') > 0);
  assert.ok(con.indexOf('Misuratore di terra MT-500 matr. 22-0451, tarato fino al 15/11/2026 · Multimetro 87V matr. 6011-2381, tarato fino al 12/10/2026') > 0, 'le date vere, anche passate');
  assert.equal(D.rigaStrumenti([{ nome: 'Guanti isolanti classe 0', matricola: 'G0-112', scadeAllora: '2026-12-31', statoAllora: 'valida', verifica: true }]), 'Guanti isolanti classe 0 matr. G0-112, verificato fino al 31/12/2026');
  assert.equal(D.rigaStrumenti([{ nome: 'Pinza amperometrica', statoAllora: 'senza' }]), 'Pinza amperometrica, taratura non scritta');
  assert.equal(D.rigaStrumenti([{ nome: '<b>X</b>', statoAllora: 'non_conforme' }]), '<b>X</b>, non conforme', 'il testo si scappa nel PDF, non qui');
  assert.ok(D.rapportino(Object.assign({}, RAP, { strumenti: [{ nome: '<b>X</b>', statoAllora: 'non_conforme' }] }), ANA, {}).indexOf('&lt;b&gt;X&lt;/b&gt;, non conforme') > 0);
});

test('costo della commessa (§17.15): il costo atteso sa dei collaboratori (previsto) e delle altre ricevute; senza, i numeri di prima', () => {
  const k = { previsto: { costoPrevisto: 500 }, valoreAtteso: 5000 };
  const fase3 = { lavoro: 671, lavoroNoto: true, auto: 291.84, speseRapportini: 14.5, costoOreRegistrate: 572, speseFuoriRapportini: 245.9, trasferte: 209.76, totale: 2005 };
  const prima = RO.costiConFase3(k, fase3);
  const dopo = RO.costiConFase3(k, Object.assign({}, fase3, { totale: 3205, collaboratori: 1200, collaboratoriPrevisto: 3200, altreRicevute: 0 }));
  assert.equal(dopo.costoSostenuto, 3205, 'il sostenuto è quello del server (con le fatture del collaboratore)');
  assert.equal(Math.round((dopo.costoAtteso - prima.costoAtteso) * 100) / 100, 3200, 'l\'atteso aggiunge il più grande fra pattuito e fatturato');
  assert.equal(RO.costiConFase3(k, Object.assign({}, fase3, { altreRicevute: 398.36 })).costoAtteso, Math.round((prima.costoAtteso + 398.36) * 100) / 100);
  assert.deepEqual(RO.costiConFase3(k, Object.assign({}, fase3, { collaboratori: 0, collaboratoriPrevisto: 0, altreRicevute: 0 })), prima, 'con zero, identico');
});
