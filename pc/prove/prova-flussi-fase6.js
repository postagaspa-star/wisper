// I flussi della fase 6 (persone, mezzi e attrezzature, collaboratori esterni) fatti con l'interfaccia vera, cliccando come una
// persona, contro il server di prova; dopo ogni passo si controlla col server che sia successo davvero.
// Edge senza finestra, profilo temporaneo (mai il browser di chi lavora).
//
//   node server/src/avvio.js --prova --porta 8447 --dati <cartella temporanea NUOVA>
//   node pc/prove/finto-ponte.js 8794 --server http://localhost:8447
//   node pc/prove/prova-flussi-fase6.js --porta 8794 [--uscita <schermate>]
//
// Usa i dati di esempio del server così come nascono: va lanciata su un server appena acceso.
// Il finto ponte fa la parte del programma: "Scegli un file" dà un PDF di prova, che va al server con /carica.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const PORTA = Number(opz('--porta', 8794));
const USCITA = opz('--uscita', '');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:' + PORTA;
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-edge-flussi6-'));
  const porta = 9800 + Math.floor(Math.random() * 150);
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + profilo, '--remote-debugging-port=' + porta, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const errori = [];
  let passi = 0;
  try {
    let pagina = null;
    for (let i = 0; i < 50 && !pagina; i++) {
      await aspetta(200);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page');
    }
    ws = new WebSocket(pagina.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    let n = 0;
    const attese = new Map();
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { attese.get(d.id)(d); attese.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errori.push(d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text);
    };
    const cdp = (method, params) => new Promise(ok => { const id = ++n; attese.set(id, ok); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const valuta = async espr => {
      const r = await cdp('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(espr.slice(0, 160) + '\n' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text));
      return r.result.result.value;
    };
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'flusso6-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    // Clic su un pulsante (o una riga, una voce di menu, una scheda) col testo dato, dentro "dove" (l'ultimo che c'è).
    const clicca = async (testo, dove, attesa) => {
      const ok = await valuta(`(() => {
        const radice = ${dove ? `[...document.querySelectorAll(${JSON.stringify(dove)})].pop()` : 'document'};
        if (!radice) return 'manca ' + ${JSON.stringify(dove || '')};
        const tutti = [...radice.querySelectorAll('button, a.btn, [role=button], [role=menuitem]')].filter(x => x.offsetParent !== null || x.closest('.menu'));
        const pulito = x => x.textContent.replace(/\\s+/g, ' ').trim();
        const t = ${JSON.stringify(testo)};
        const b = tutti.find(x => pulito(x) === t || x.getAttribute('aria-label') === t) || tutti.find(x => pulito(x).startsWith(t)) || tutti.find(x => pulito(x).indexOf(t) >= 0);
        if (!b) return 'non trovo il pulsante fra: ' + tutti.map(pulito).filter(Boolean).slice(0, 40).join(' | ');
        if (b.disabled) return 'il pulsante è spento';
        b.click();
        return true;
      })()`);
      if (ok !== true) throw new Error('Clic su "' + testo + '": ' + ok);
      await aspetta(attesa || 900);
    };
    const scrivi = async (etichetta, valore, dove) => {
      const ok = await valuta(`(() => {
        const radice = [...document.querySelectorAll(${JSON.stringify(dove || '.finestra')})].pop();
        if (!radice) return 'non trovo ' + ${JSON.stringify(dove || '.finestra')};
        const c = [...radice.querySelectorAll('.campo')].find(x => x.querySelector('label') && x.querySelector('label').textContent.trim() === ${JSON.stringify(etichetta)});
        if (!c) return 'non trovo il campo';
        const i = c.querySelector('input, textarea, select');
        i.value = ${JSON.stringify(valore)};
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      if (ok !== true) throw new Error('Campo "' + etichetta + '": ' + ok);
      await aspetta(200);
    };
    const server = async (azione, corpo) => valuta(corpo
      ? `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`
      : `fetch('/server/${azione}').then(r => r.json())`);
    const vai = async hash => { await valuta(`location.hash = ${JSON.stringify(hash)}; true`); await aspetta(1600); };
    const testoPagina = () => valuta("document.querySelector('#principale').innerText");
    const testoPannello = sel => valuta(`(document.querySelector(${JSON.stringify(sel)}) || {}).innerText || ''`);
    const testoFinestra = () => valuta("([...document.querySelectorAll('.velo .finestra')].pop() || {}).innerText || ''");
    const testoAvvisi = () => valuta("document.querySelector('#avvisi').innerText");
    // Un solo pulsante giallo visibile per schermata (pagina + pannello, oppure la finestra in cima).
    const unGiallo = async nome => {
      const k = await valuta(`(() => {
        const vis = x => x.offsetParent !== null;
        const finestre = [...document.querySelectorAll('.velo .finestra')];
        if (finestre.length) return [...finestre.pop().querySelectorAll('.btn.giallo')].filter(vis).length;
        return [...document.querySelectorAll('#principale .btn.giallo, .pannello .btn.giallo')].filter(vis).length;
      })()`);
      assert.ok(k <= 1, nome + ': ' + k + ' pulsanti gialli');
    };
    const passo = msg => { passi++; console.log('ok  ' + msg); };
    const entra = async email => {
      await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' })");
      await cdp('Page.navigate', { url: BASE + '/?g=' + Date.now() + '#dashboard' });
      await aspetta(1200);
      await valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = ${JSON.stringify(email)}; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
      await aspetta(2600);
    };
    const oggi = new Date();
    const due = x => String(x).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '/vuota' });
    await aspetta(400);
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");
    const P = require('../ui/regole-persone.js');
    const oggiIso = iso(oggi);
    const lunedi = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    // Le ferie di prova: lunedì e martedì fra quattro settimane (lontane dalle assenze dei dati di esempio).
    const l4 = lunedi(oggi); l4.setDate(l4.getDate() + 28);
    const m4 = new Date(l4); m4.setDate(m4.getDate() + 1);
    const dal = iso(l4);
    const al = iso(m4);

    // ------------------------------------------------------------- 1. Marco chiede le ferie
    await entra('marco@esempio.it');
    const menuMarco = await valuta("[...document.querySelectorAll('#voci .voce')].map(v => v.dataset.nome)");
    assert.ok(menuMarco.indexOf('Persone e risorse umane') >= 0 && menuMarco.indexOf('Mezzi e attrezzature') >= 0 && menuMarco.indexOf('Collaboratori esterni') < 0, 'menu di Marco: ' + menuMarco.join(', '));
    await vai('#persone');
    let testo = await testoPagina();
    assert.match(testo, /La tua scheda/, 'il collaboratore entra in Persone sulla sua scheda (Io)');
    assert.ok(testo.indexOf('Costo') < 0 || testo.indexOf('l\'ora dal') < 0, 'Marco non vede il suo costo');
    await unGiallo('Io');
    await clicca('Chiedi ferie o permesso', '#principale', 900);
    await scrivi('Dal', dal);
    await scrivi('Al', al);
    await aspetta(500);
    testo = await testoFinestra();
    assert.match(testo, /2 giorni · 16 ore/, 'il conto grande della richiesta');
    assert.match(testo, /Ti restano/, 'il saldo dopo la richiesta');
    await unGiallo('Chiedi ferie');
    await foto('1-chiedi');
    await clicca('Manda la richiesta', '.finestra', 1800);
    let ass = (await server('assenze')).assenze.find(a => a.dal === dal && a.al === al);
    assert.ok(ass, 'la richiesta c\'è sul server');
    assert.equal(ass.stato, 'da_approvare');
    assert.equal(ass.tipo, 'ferie');
    passo('Marco chiede le ferie dal ' + dal + ' al ' + al + ': da approvare (2 giorni, 16 ore)');

    // ------------------------------------------------------------- 2. Manuel approva, Annulla, approva di nuovo: la pianificazione
    await entra('manuel@esempio.it');
    testo = await testoPagina();
    // Fase 8 (§8.4): la Dashboard ha i quattro riquadri della persona (il titolare: Da fatturare, Scaduto, Ticket aperti,
    // Da approvare); i numeri della fase 6 restano nel server e nella pagina di Persone.
    const dash6 = await server('dashboard');
    if (Array.isArray(dash6.riquadri)) {
      assert.match(testo, /da approvare/, 'il riquadro Da approvare (ferie comprese)');
      assert.ok(dash6.numeri && dash6.numeri.persone && typeof dash6.numeri.persone.assentiOggi === 'number', 'i numeri della fase 6 ci sono');
    } else {
      assert.match(testo, /assenti oggi/, 'la Dashboard ha i riquadri della fase 6');
      assert.match(testo, /ferie da approvare/);
    }
    const quando = P.quandoAssenza({ dal, al });
    const apriRichiesta = async () => {
      await vai('#persone/ferie');
      const ok = await valuta(`(() => { const r = [...document.querySelectorAll('.colonna-f6 .riga')].find(x => x.textContent.indexOf(${JSON.stringify(quando)}) >= 0 && /Marco/.test(x.textContent)); if (!r) return false; r.click(); return true; })()`);
      assert.ok(ok, 'la richiesta di Marco è fra quelle da approvare');
      await aspetta(1500);
    };
    await apriRichiesta();
    testo = await testoFinestra();
    assert.match(testo, /Approva la richiesta/);
    assert.match(testo, /2 giorni · 16 ore/);
    assert.match(testo, /Saldo di oggi/, 'chi approva vede il saldo');
    await unGiallo('Approva');
    await foto('2-approva');
    await clicca('Approva', '.finestra', 1600);
    ass = (await server('assenze?da=' + dal + '&a=' + al)).assenze.find(a => a.id === ass.id);
    assert.equal(ass.stato, 'approvata');
    assert.match(await testoAvvisi(), /approvate/);
    await clicca('Annulla', '#avvisi', 1600);
    ass = (await server('assenze?da=' + dal + '&a=' + al)).assenze.find(a => a.id === ass.id);
    assert.equal(ass.stato, 'da_approvare', 'Annulla la rimette da approvare');
    await apriRichiesta();
    await clicca('Approva', '.finestra', 1600);
    ass = (await server('assenze?da=' + dal + '&a=' + al)).assenze.find(a => a.id === ass.id);
    assert.equal(ass.stato, 'approvata');
    passo('Manuel approva, Annulla (torna da approvare), approva di nuovo');

    await vai('#attivita/pianificazione');
    const settimane = Math.round((lunedi(l4) - lunedi(oggi)) / (7 * 86400000));
    for (let i = 0; i < settimane; i++) await clicca('Settimana dopo', '#principale', 1300);
    const fasce = await valuta("(() => { const r = [...document.querySelectorAll('.riga-pian')].find(x => /Marco/.test(x.querySelector('.chi-pian').textContent)); return r ? [...r.querySelectorAll('.fascia-ass')].map(f => f.textContent) : null; })()");
    assert.ok(fasce && fasce.filter(t => t === 'Ferie').length === 2, 'le ferie di Marco nella pianificazione: ' + JSON.stringify(fasce));
    await foto('3-pianificazione');
    passo('Le ferie approvate compaiono nella pianificazione della settimana (' + settimane + ' settimane avanti)');

    // ------------------------------------------------------------- 3. Manuel apre la scheda riservata di Marco: il server lo registra
    const vistiPrima = ((await server('accessiRiservati?idPersona=3')).righe || []).filter(r => r.azione === 'visto' && r.utente === 'Manuel Gasparotto' && String(r.quando).slice(0, 10) === oggiIso).length;
    await vai('#persone/p/3');
    await aspetta(800);
    // I dati personali sono chiusi: si aprono (come farebbe Manuel) per leggere anche i riservati.
    await valuta("document.querySelectorAll('.pannello-f6 details').forEach(d => { d.open = true; }); true");
    testo = await testoPannello('.pannello-f6');
    assert.match(testo, /CCNL/, 'il titolare vede i riservati');
    assert.match(testo, /Costo dell'anno/);
    assert.match(testo, /Idoneo con prescrizioni/);
    assert.match(testo, /Qui va solo il giudizio del medico, non la diagnosi/);
    await unGiallo('Scheda di Marco');
    await foto('4-scheda-riservata');
    const accessi = ((await server('accessiRiservati?idPersona=3')).righe || []).filter(r => r.azione === 'visto' && r.utente === 'Manuel Gasparotto' && String(r.quando).slice(0, 10) === oggiIso);
    assert.ok(accessi.length > vistiPrima, 'aprendo la scheda il server scrive chi ha visto i riservati (' + vistiPrima + ' -> ' + accessi.length + ')');
    await vai('#persone/accessi/3');
    assert.match(await testoPagina(), /Ha visto i dati riservati della scheda/);
    passo('Manuel apre la scheda di Marco: riservati in vista, il registro degli accessi ha la riga "visto" (' + accessi.map(r => r.cosa).join(', ') + ')');

    // ------------------------------------------------------------- 4. Laura (amministrazione) non vede i riservati
    await entra('laura@esempio.it');
    await vai('#persone/p/3');
    await aspetta(800);
    await valuta("document.querySelectorAll('.pannello-f6 details').forEach(d => { d.open = true; }); true");
    testo = await testoPannello('.pannello-f6');
    assert.match(testo, /Codice fiscale/, 'i dati personali sì (persone 2)');
    assert.ok(testo.length > 50, 'il pannello di Marco si apre per Laura');
    for (const vietato of ['CCNL', 'Costo dell\'anno', 'Idoneo con prescrizioni', 'Prescrizioni', 'Cedolino', 'Riservati', 'Note riservate']) assert.ok(testo.indexOf(vietato) < 0, 'Laura non deve vedere: ' + vietato);
    assert.match(testo, /28,50 € l'ora/, 'il costo orario sì (soldi)');
    assert.match(testo, /Visita del/, 'della visita solo le date');
    const perLaura = (await server('persona?id=3')).persona;
    for (const k of ['ccnl', 'livello', 'noteRiservate', 'costoAnno', 'oreAnno', 'notaCosto']) assert.ok(!(k in perLaura), 'il server non manda a Laura ' + k);
    assert.ok((perLaura.visite || []).every(v => !('giudizio' in v)), 'niente giudizio nelle visite');
    const regLaura = await server('accessiRiservati?idPersona=3');
    assert.equal(regLaura.ok, false);
    assert.equal(regLaura.permesso, false);
    await foto('5-laura');
    passo('Laura apre Marco: costo orario e date della visita sì; CCNL, costo dell\'anno, giudizio, cedolino no (anche nel server)');

    // ------------------------------------------------------------- 5. tarature: non conforme (Manuel), scaduto con conferma nel rapportino (Marco)
    await entra('manuel@esempio.it');
    await vai('#mezzi/at/3');
    await aspetta(800);
    await clicca('Registra la taratura', '.pannello-f6', 700);
    await clicca('Non conforme', '.finestra', 300);
    await clicca('Salva la taratura', '.finestra', 2200);
    const pinza = (await server('attrezzatura?id=3')).attrezzatura;
    assert.equal(pinza.fuoriUso, 'non_conforme', 'la pinza è fuori uso: non conforme');
    passo('Manuel registra la Pinza amperometrica non conforme: fuori uso');

    await entra('marco@esempio.it');
    await vai('#rapportini/elenco');
    await clicca('Nuovo rapportino', '#principale', 700);
    await valuta("document.querySelector('.finestra .scelta-card').click(); true");
    await aspetta(500);
    await clicca('4 h', '.finestra', 300);
    await scrivi('Cosa hai fatto', 'Misure di terra di prova');
    await clicca('+ Strumenti usati', '.finestra', 500);
    await clicca('AT004 · Multimetro 87V', '.finestra', 600);
    testo = await testoFinestra();
    assert.match(testo, /Il Multimetro 87V ha la taratura scaduta/, 'la conferma per lo scaduto');
    assert.match(testo, /le misure potrebbero non valere/);
    await unGiallo('Taratura scaduta');
    await foto('6-scaduto');
    await clicca('Lo uso lo stesso', '.finestra', 500);
    const scelti = await valuta("[...document.querySelectorAll('.finestra .chip-str[aria-pressed=true]')].map(c => c.textContent)");
    assert.ok(scelti.some(t => /Multimetro 87V/.test(t) && /confermato/.test(t)), 'scelto, con la conferma scritta: ' + JSON.stringify(scelti));
    await clicca('Altro strumento', '.finestra', 900);
    await valuta("(() => { const i = [...document.querySelectorAll('.finestra')].pop().querySelector('input[type=search]'); i.value = 'Pinza'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await aspetta(300);
    await clicca('Pinza amperometrica', '.finestra', 500);
    assert.match(await testoAvvisi(), /Non conforme.*non si usa finché non è tarato di nuovo/, 'il non conforme non si sceglie');
    await valuta("document.querySelectorAll('.avviso.errore button[aria-label=Chiudi]').forEach(b => b.click()); [...document.querySelectorAll('.velo')].pop().chiudi(); true");
    await aspetta(400);
    const sceltiDopo = await valuta("[...document.querySelectorAll('.finestra .chip-str[aria-pressed=true]')].map(c => c.textContent)");
    assert.ok(!sceltiDopo.some(t => /Pinza/.test(t)), 'la pinza non è entrata');
    await clicca('Salva', '.finestra', 2200);
    const rap = (await server('rapportini')).rapportini.find(r => r.descrizione === 'Misure di terra di prova');
    assert.ok(rap, 'il rapportino c\'è sul server');
    assert.equal(rap.strumenti.length, 1);
    assert.equal(rap.strumenti[0].codice, 'AT004');
    assert.equal(rap.strumenti[0].statoAllora, 'scaduta');
    assert.equal(rap.strumenti[0].confermato, true, 'la conferma resta scritta');
    testo = await testoPannello('.pannello');
    assert.match(testo, /Strumenti usati/i);
    assert.match(testo, /Taratura scaduta · confermato/, 'l\'avviso nel rapportino');
    await foto('7-rapportino-strumenti');
    passo('Marco sceglie il Multimetro scaduto confermando (' + rap.id + ': statoAllora scaduta, confermato); la Pinza non conforme non si sceglie');

    // ------------------------------------------------------------- 6. km e guasto del mezzo (Marco)
    const primaKm = (await server('mezzo?id=2')).mezzo.km;
    await vai('#mezzi/miei');
    await clicca('Segna i km', '#principale', 700);
    await scrivi('Km del contachilometri', String(primaKm + 120));
    await unGiallo('Segna i km');
    await clicca('Salva i km', '.finestra', 1800);
    let doblo = (await server('mezzo?id=2')).mezzo;
    assert.equal(doblo.km, primaKm + 120, 'i km nuovi');
    assert.equal(doblo.letture[0].utente, 'Marco Rossato');
    await clicca('Segnala un guasto', '#principale', 700);
    await scrivi('Cosa succede', 'Rumore dai freni di prova');
    await clicca('Fotografa', '.finestra', 700);
    await foto('8-guasto');
    await clicca('Segnala il guasto', '.finestra', 2200);
    const guasto = (await server('manutenzioni?idVeicolo=2')).manutenzioni.find(m => m.titolo === 'Rumore dai freni di prova');
    assert.ok(guasto, 'il guasto c\'è sul server');
    assert.equal(guasto.stato, 'aperta');
    assert.equal(guasto.segnalataDaNome, 'Marco Rossato');
    assert.equal((guasto.foto || []).length, 1, 'con la foto');
    passo('Marco segna i km del Doblò (' + primaKm + ' -> ' + (primaKm + 120) + ') e segnala un guasto con la foto');

    // ------------------------------------------------------------- 7. incarico a Impianti Veneti con la fattura ricevuta legata (Manuel)
    await entra('manuel@esempio.it');
    const ric = await server('salvaRicevuta', { ricevuta: { idFornitore: 'F006', numero: '27/2026 prova', data: oggiIso, imponibile: 500, iva: 110, totale: 610, categoria: 'servizi', descrizione: 'Verifica quadri di prova' } });
    assert.ok(ric.ok, 'la fattura ricevuta di prova: ' + (ric.errore || ''));
    await vai('#collaboratori/c/F006');
    await aspetta(800);
    await clicca('Nuovo incarico', '.pannello-f6', 900);
    await clicca('26ST002', '.finestra', 400);
    await scrivi('Cosa deve fare', 'Verifica quadri di prova');
    await scrivi('Compenso', '800');
    await unGiallo('Nuovo incarico');
    await clicca('Salva l\'incarico', '.finestra', 2400);
    let inc = (await server('incarichi?stato=tutti&idSoggetto=F006')).incarichi.find(i => i.titolo === 'Verifica quadri di prova');
    assert.ok(inc, 'l\'incarico c\'è sul server');
    assert.equal(inc.stato, 'bozza');
    await aspetta(600);
    await clicca('Affida l\'incarico', '.pannello-f6', 1600);
    if (/Affidalo lo stesso/.test(await testoFinestra())) await clicca('Affidalo lo stesso', '.finestra', 1600);
    inc = (await server('incarico?id=' + inc.id)).incarico;
    assert.equal(inc.stato, 'affidato');
    await clicca('Collega una fattura ricevuta', '.pannello-f6', 1200);
    await clicca('Fattura 27/2026 prova', '.finestra', 2000);
    inc = (await server('incarico?id=' + inc.id)).incarico;
    assert.ok(inc.ricevute.some(r => r.numero === '27/2026 prova'), 'la fattura ricevuta è legata all\'incarico');
    assert.equal(inc.conti.pattuito, 800);
    assert.equal(inc.conti.fatturato, 500);
    testo = await testoPannello('.pannello-f6');
    assert.match(testo, /Fattura 27\/2026 prova/);
    const cc = (await server('costoCommessa?idCommessa=26ST002')).costoCommessa;
    assert.equal(cc.collaboratori, 500, 'il costo del collaboratore entra nella commessa (la sua fattura)');
    assert.equal(cc.collaboratoriPrevisto, 800, 'il costo atteso sa del pattuito');
    await foto('9-incarico');
    passo('Incarico ' + inc.numero + ' a Impianti Veneti (a corpo 800): affidato, fattura 27/2026 legata (fatturato 500), costo della commessa 26ST002 con i collaboratori');

    // ------------------------------------------------------------- 8. Luca, esterno: vede solo il suo
    await entra('luca@esempio.it');
    const menuLuca = await valuta("[...document.querySelectorAll('#voci .voce')].map(v => v.dataset.nome)");
    assert.deepEqual(menuLuca, ['Dashboard', 'Progetti e commesse', 'Ore e rapportini', 'Attività e calendario', 'Spese e trasferte', 'Documenti', 'Ticket e assistenza', 'La tua scheda'], 'il menu ridotto dell\'esterno');
    testo = await testoPagina();
    assert.match(testo, /Esterno · Impianti Veneti di Sartori Luca/, 'la pillola dell\'esterno');
    assert.match(testo, /Scrivi il rapportino/);
    await vai('#collaboratori');
    testo = await testoPagina();
    assert.match(testo, /La tua scheda/);
    assert.match(testo, /IN\/\d{4}\/001/);
    assert.ok(testo.indexOf(inc.numero) >= 0, 'il suo incarico nuovo');
    assert.match(testo, /I tuoi compensi/, 'i suoi compensi (soldi suoi)');
    for (const vietato of ['Valutazioni', 'Accesso a Wisper', 'Note dello studio', 'Materiale Elettrico']) assert.ok(testo.indexOf(vietato) < 0, 'Luca non deve vedere: ' + vietato);
    await unGiallo('La tua scheda');
    await foto('10-luca');
    const collLuca = await server('collaboratori');
    assert.deepEqual((collLuca.collaboratori || []).map(c => c.idSoggetto), ['F006'], 'solo il suo collaboratore');
    const altro = await server('collaboratore?id=F001');
    assert.equal(altro.ok, false, 'gli altri collaboratori non si trovano');
    const persLuca = await server('persone');
    assert.equal(persLuca.permesso, false, 'niente persone');
    assert.equal((await server('mezzi')).permesso, false, 'niente mezzi');
    assert.ok(((await server('incarichi?stato=tutti')).incarichi || []).every(i => i.idSoggetto === 'F006'), 'solo i suoi incarichi');
    const anaLuca = await server('anagrafiche');
    const sueCommesse = new Set(((await server('incarichi?stato=tutti')).incarichi || []).filter(i => i.stato === 'affidato' || i.stato === 'concluso').map(i => i.idCommessa));
    assert.ok((anaLuca.commesse || []).every(m => sueCommesse.has(m.id)), 'solo le commesse dei suoi incarichi: ' + (anaLuca.commesse || []).map(m => m.id).join(', '));
    await vai('#persone');
    assert.match(await testoPagina(), /Non hai il permesso/);
    passo('Luca (esterno): menu ridotto, la sua scheda coi suoi incarichi e compensi; niente persone, mezzi, altri collaboratori; commesse solo le sue (' + Array.from(sueCommesse).join(', ') + ')');

    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('\n' + passi + ' passi, tutto a posto.');
  } finally {
    if (ws) ws.close();
    edge.kill();
    await aspetta(500);
    try { fs.rmSync(profilo, { recursive: true, force: true }); } catch (e) { /* Edge tiene un file ancora un attimo */ }
  }
}

main().catch(e => { console.error('NO  ' + (e && e.stack ? e.stack : e)); process.exit(1); });
