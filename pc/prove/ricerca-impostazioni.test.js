'use strict';
// La ricerca nelle impostazioni di Amministrazione (riunione del 06/11/2026): indice e confronto, senza interfaccia.
const test = require('node:test');
const assert = require('node:assert');
const T = require('../ui/regole-impostazioni.js');

const PAGINE = [
  { k: 'studio', titolo: 'Dati dello studio', gruppo: 'Lo studio', sotto: 'Studio Tecnico Esempio · logo sui PDF', icona: 'immagine' },
  { k: 'app', titolo: 'Aspetto', gruppo: 'Lo studio', sotto: 'Tema automatico', icona: 'pennello' },
  { k: 'funzioni', titolo: 'Funzioni accese', gruppo: 'Lo studio', sotto: '19 funzioni', icona: 'interruttore' },
  { k: 'sicurezza', titolo: 'Sicurezza', gruppo: 'Persone e accessi', sotto: 'È tutto a posto?', icona: 'scudo' },
  { k: 'notifiche', titolo: 'Notifiche', gruppo: 'Persone e accessi', sotto: 'Quali, sul telefono', icona: 'campana' },
  { k: 'impostazioni', titolo: 'Impostazioni generali', gruppo: 'Regole', sotto: '62 impostazioni in 11 gruppi', icona: 'amministrazione' },
  { k: 'fiscale', titolo: 'Impostazioni fiscali', gruppo: 'Regole', sotto: 'Da confermare col commercialista', icona: 'fatturazione' },
  { k: 'numerazioni', titolo: 'Numerazioni', gruppo: 'Regole', sotto: 'Prossima commessa 26ST001', icona: 'numero' },
  { k: 'registro', titolo: 'Registro attività', gruppo: 'Dati', sotto: 'Chi ha cambiato cosa', icona: 'storia' },
  { k: 'tariffe', titolo: 'Tariffe e rimborsi', gruppo: 'Regole', sotto: 'Rimborso km, costo orario, ticket', icona: 'fatturazione' },
  { k: 'persone', titolo: 'Persone, mezzi e collaboratori', gruppo: 'Regole', sotto: 'Santo patrono, tarature, DURC e visura', icona: 'persona' },
  { k: 'portale', titolo: 'Portale clienti', gruppo: 'Regole', sotto: 'Indirizzo, durate, file dai clienti', icona: 'globo' },
  { k: '#integrazioni', titolo: 'Integrazioni', gruppo: 'Sistema', sotto: 'Nessuno in Errore', icona: 'spina' },
];
const GRUPPI = [
  { nome: 'Ore e rapportini', voci: [{ chiave: 'ORE_GIORNALIERE', etichetta: 'Ore di lavoro al giorno', unita: 'ore' }, { chiave: 'EURO_KM', etichetta: 'Rimborso km', unita: '€/km' }] },
  { nome: 'Ticket', voci: [{ chiave: 'TICKET_TEMPI', etichetta: 'Tempi dei ticket' }] },
];
const indice = () => T.costruisciIndice({ pagine: PAGINE, gruppi: GRUPPI,
  numerazioni: [{ tipo: 'commessa', nome: 'Commesse' }, { tipo: 'rapportino', nome: 'Rapportini' }],
  funzioni: [{ modulo: 'fatturazione', nome: 'Fatture' }, { modulo: 'portale', nome: 'Portale clienti' }] });
const etichette = r => r.voci.map(v => v.etichetta);

test('il testo vuoto non cerca: si vede l\'elenco di sempre', () => {
  assert.strictEqual(T.cerca(indice(), ''), null);
  assert.strictEqual(T.cerca(indice(), '   '), null);
  assert.strictEqual(T.cerca(indice(), undefined), null);
});

test('senza badare a maiuscole e accenti', () => {
  const r = T.cerca(indice(), 'ATTIVITA');
  assert.deepStrictEqual(r.pagine.map(p => p.k), ['registro']);
  assert.deepStrictEqual(T.cerca(indice(), 'validità').voci.map(v => v.valore), T.cerca(indice(), 'VALIDITA').voci.map(v => v.valore));
  assert.ok(T.cerca(indice(), 'pec').voci.some(v => v.valore === 'PEC'));
  assert.ok(T.cerca(indice(), 'IDONEITA').voci.some(v => v.valore === 'COLLAB_DOCUMENTI'));
  assert.strictEqual(T.piano('Iscrizione all\'albo'), 'iscrizione all albo');
});

test('trova le pagine per titolo, gruppo e riga sotto', () => {
  assert.ok(T.cerca(indice(), 'sicurezza').pagine.some(p => p.k === 'sicurezza'));
  // il gruppo
  assert.ok(T.cerca(indice(), 'persone e accessi').pagine.some(p => p.k === 'notifiche'));
  // la riga sotto
  assert.ok(T.cerca(indice(), 'commercialista').pagine.some(p => p.k === 'fiscale'));
  assert.ok(T.cerca(indice(), 'integrazioni').pagine.some(p => p.k === '#integrazioni'));
});

test('trova le singole impostazioni, con la pagina e come ritrovarle', () => {
  const r = T.cerca(indice(), 'codice sdi');
  assert.strictEqual(r.voci.length, 1);
  assert.deepStrictEqual({ pagina: r.voci[0].pagina, titoloPagina: r.voci[0].titoloPagina, sel: T.selettore(r.voci[0]) },
    { pagina: 'studio', titoloPagina: 'Dati dello studio', sel: '[data-chiave="STUDIO_SDI"]' });
  const n = T.cerca(indice(), 'numerazione rapportini');
  assert.deepStrictEqual(n.voci.map(v => [v.pagina, T.selettore(v)]), [['numerazioni', '[data-tipo="rapportino"]']]);
  const f = T.cerca(indice(), 'fatture');
  assert.ok(f.voci.some(v => v.pagina === 'funzioni' && T.selettore(v) === '[data-modulo="fatturazione"]'));
  const g = T.cerca(indice(), 'ore al giorno');
  assert.deepStrictEqual(g.voci.map(v => [v.pagina, v.gruppo, v.valore]), [['impostazioni', 'Ore e rapportini', 'ORE_GIORNALIERE']]);
});

test('una chiave in più pagine si vede una volta sola, nella pagina fatta per lei', () => {
  const r = T.cerca(indice(), 'rimborso km');
  const km = r.voci.filter(v => v.valore === 'EURO_KM');
  assert.strictEqual(km.length, 1);
  assert.strictEqual(km[0].pagina, 'tariffe');
});

test('le parole in qualunque ordine e anche a metà; almeno una nel nome dell\'impostazione', () => {
  assert.ok(etichette(T.cerca(indice(), 'rimb')).indexOf('Rimborso km (tabella ACI)') >= 0);
  assert.ok(T.cerca(indice(), 'studio email').voci.some(v => v.valore === 'EMAIL'));
  assert.ok(T.cerca(indice(), 'email studio').voci.some(v => v.valore === 'EMAIL'));
  // "studio" da solo non tira fuori ogni campo di Dati dello studio, ma la pagina sì
  const s = T.cerca(indice(), 'studio');
  assert.ok(s.pagine.some(p => p.k === 'studio'));
  assert.ok(!s.voci.some(v => v.valore === 'TELEFONO'));
  assert.ok(s.voci.some(v => v.valore === 'STUDIO_LOGO' || v.valore === 'PDF_NOME'), 'le impostazioni con "studio" nel nome sì');
});

test('prima chi comincia con la parola scritta', () => {
  const r = T.cerca(indice(), 'logo');
  // "Logo dello studio" e "Logo sui PDF" cominciano con "logo"; "Nome dello studio accanto al logo" viene dopo.
  assert.deepStrictEqual(r.voci.map(v => v.valore), ['STUDIO_LOGO', 'PDF_LOGO', 'PDF_NOME']);
});

test('niente: risultati vuoti (la pagina dice «Niente con …»)', () => {
  const r = T.cerca(indice(), 'zzzqqq');
  assert.deepStrictEqual([r.pagine.length, r.voci.length], [0, 0]);
});

test('solo le pagine che la persona vede: le impostazioni di una pagina nascosta non escono', () => {
  const senzaSoldi = T.costruisciIndice({ pagine: PAGINE.filter(p => p.k !== 'tariffe' && p.k !== 'fiscale'), gruppi: [] });
  const r = T.cerca(senzaSoldi, 'iva');
  assert.ok(!r.voci.some(v => v.pagina === 'fiscale'));
  assert.ok(r.voci.some(v => v.valore === 'PARTITA_IVA'), 'la Partita IVA dello studio resta');
  assert.ok(!T.cerca(senzaSoldi, 'costa un ora').voci.length);
});

test('tante: al massimo 40 impostazioni, e lo dice', () => {
  const tante = T.costruisciIndice({ pagine: [{ k: 'impostazioni', titolo: 'Impostazioni generali', gruppo: 'Regole' }],
    gruppi: [{ nome: 'Prova', voci: Array.from({ length: 50 }, (_, i) => ({ chiave: 'K' + i, etichetta: 'Voce di prova ' + i })) }] });
  const r = T.cerca(tante, 'voce');
  assert.strictEqual(r.voci.length, 40);
  assert.strictEqual(r.tante, true);
  assert.strictEqual(T.cerca(tante, 'voce di prova 4').tante, false);
});

test('ogni impostazione delle pagine fatte a mano ha chiave ed etichetta, senza doppioni nella stessa pagina', () => {
  Object.keys(T.VOCI_PAGINE).forEach(k => {
    const chiavi = T.VOCI_PAGINE[k].map(v => v[0]);
    assert.strictEqual(new Set(chiavi).size, chiavi.length, k);
    T.VOCI_PAGINE[k].forEach(v => { assert.match(v[0], /^[A-Z_]+$/); assert.ok(v[1] && !/sotto-cliente|!/i.test(v[1]), v[1]); });
  });
});

test('il selettore regge le virgolette', () => {
  assert.strictEqual(T.selettore({ attributo: 'data-chiave', valore: 'A"B' }), '[data-chiave="A\\"B"]');
});
