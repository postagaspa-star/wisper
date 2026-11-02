// WisperUfficio.exe contro la porta Google di prova (porta-di-prova.js: finto Google con Porta.gs e il rimbalzo
// 302, server di prova collegato, casa finta). Senza installarlo e senza toccare i dati veri: cartelle di dati a
// parte, e la WebView2 del programma guidata dalla sua porta di DevTools (solo per questo processo).
// Prova le regole di Server.cs (docs/gestionale/porta-google.md) sull'exe vero:
//
//   node pc/prove/prova-porta-exe.js --exe <WisperUfficio.exe di una build Debug> [--uscita <schermate>]
//
//  A. fuori casa (casa spenta): accedi da Google, letture, scritture, un PDF su e giù, il limite dei 26 MB,
//     il server spento da poco ("attesa": stesso id, una volta) e da tanto ("spento" subito, poi una volta);
//  B. in casa (exe riaperto con la chiave salvata): la firma sceglie casa, idRichiesta nelle POST, una risposta
//     persa a casa riparte da Google con lo stesso id (una volta sola); un altro apparecchio allo stesso indirizzo
//     non riceve il token;
//  C. il file .wisper dell'email (anche quello della 0.4): l'indirizzo Google si salva cifrato, il file sparisce.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { avviaPorta } = require('./porta-di-prova.js');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const EXE = path.resolve(opz('--exe', ''));
const USCITA = opz('--uscita', '');
const GIRO = crypto.randomBytes(3).toString('hex');
const aspetta = ms => new Promise(r => setTimeout(r, ms));
let passi = 0;
const passo = msg => { passi++; console.log('ok  ' + msg); };

/** Apre l'exe con quegli argomenti e si collega alla sua WebView. */
async function apri(argomenti) {
  const porta = 9500 + Math.floor(Math.random() * 300);
  const exe = spawn(EXE, argomenti, {
    env: Object.assign({}, process.env, { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + porta }),
    stdio: 'ignore',
  });
  let pagina = null;
  for (let i = 0; i < 100 && !pagina; i++) {
    await aspetta(250);
    const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
    pagina = (lista || []).find(x => x.type === 'page' && /^https:\/\/wisper\.locale\//.test(x.url));
  }
  if (!pagina) { exe.kill(); throw new Error('La finestra del programma non si è aperta (o la porta di DevTools non risponde)'); }
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let n = 0;
  const attese = new Map();
  const errori = [];
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
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await valuta("localStorage.setItem('wisper-visita-2', '1'); true");
  const foto = async nome => {
    if (!USCITA) return;
    fs.mkdirSync(USCITA, { recursive: true });
    const f = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(USCITA, 'exe-porta-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
  };
  const chiudi = async () => {
    ws.close();
    exe.kill();
    for (let i = 0; i < 40 && exe.exitCode === null && exe.signalCode === null; i++) await aspetta(100);
    await aspetta(800);
    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
  };
  const aspettaChe = async (espr, ms, cosa) => {
    const fine = Date.now() + ms;
    while (Date.now() < fine) { if (await valuta(espr)) return; await aspetta(250); }
    throw new Error('non succede: ' + cosa);
  };
  return { valuta, foto, chiudi, aspettaChe, cdp };
}

const scrivi = (azione, corpo) => `fetch('/server/${azione}', { method: 'POST', body: JSON.stringify(${JSON.stringify(corpo)}) }).then(r => r.json())`;
const leggi = azione => `fetch('/server/${azione}').then(r => r.json())`;

async function main() {
  if (!fs.existsSync(EXE)) throw new Error('Manca --exe');
  const p = await avviaPorta();
  const conta = (sql, ...x) => p.wisper.db.riga(sql, ...x).n;
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-exe-porta-'));
  const dati2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-exe-wisper-'));
  const conf = path.join(dati, 'configurazione.json');
  const conProva = ['--no-installa', '--dati', dati, '--google', p.google, '--server', p.casa];
  let w = null;
  try {
    // Un file di configurazione come lo scriveva la 0.4: indirizzo dello script (finto) e codice.
    fs.writeFileSync(conf, JSON.stringify({ url: 'https://script.google.com/macros/s/FINTO_04/exec', codice: 'non-un-codice-vero', dispositivo: 'disp-porta-' + GIRO }));

    // ================================================================ A. fuori casa
    p.modoCasa('spento');
    w = await apri(conProva);
    await aspetta(1500);
    const scritto = JSON.parse(fs.readFileSync(conf, 'utf8'));
    assert.equal(scritto.codice, undefined, 'il codice della 0.4 sparisce');
    assert.equal(scritto.url, undefined);
    assert.ok(scritto.google && scritto.google.length > 60, 'l\'indirizzo dello script della 0.4 resta, cifrato');
    assert.ok(!fs.readFileSync(conf, 'utf8').includes('script.google'), 'nel file non c\'è in chiaro');
    passo('file della 0.4: codice tolto, indirizzo dello script tenuto cifrato (DPAPI)');

    const stato0 = await w.valuta("fetch('/locale/stato').then(r => r.json())");
    assert.equal(stato0.google, true);
    assert.equal(stato0.casa, p.casa);
    assert.ok(!JSON.stringify(stato0).includes(new URL(p.google).host), 'l\'indirizzo Google non arriva alla pagina');
    const riga = await w.valuta("document.querySelector('.riga-server') ? document.querySelector('.riga-server').innerText : ''");
    assert.match(riga, /^Da fuori: Google · In casa: 127\.0\.0\.1:\d+/);
    await w.valuta("[...document.querySelectorAll('.riga-server button')].find(b => b.textContent === 'Cambia').click(); true");
    await aspetta(300);
    assert.equal(await w.valuta("[...document.querySelectorAll('.accesso label')].map(l => l.textContent).join('|')"), 'In casa|Da fuori, l\'indirizzo Google|Email|Password');
    assert.equal(await w.valuta("document.querySelectorAll('.accesso input')[1].placeholder"), 'Già salvato');
    assert.equal(await w.valuta("document.querySelectorAll('.btn.giallo, .btn-entra').length"), 1, 'un solo pulsante giallo');
    await w.foto('accesso-cambia');
    passo('pagina di accesso: "' + riga.split('\n')[0] + '"; Cambia mostra In casa e Da fuori (già salvato), Usa il file dell\'email');

    await w.valuta("location.reload(); true");
    await aspetta(1500);
    await w.valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = 'manuel@esempio.it'; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
    await w.aspettaChe("!!document.querySelector('h1') && /Manuel/.test(document.querySelector('h1').textContent)", 25000, 'la Dashboard');
    assert.deepEqual(p.statoCasa.visti.filter(v => v.metodo === 'POST' || v.conChiave), [], 'né la password né il token a casa');
    const stato1 = await w.valuta("fetch('/locale/stato').then(r => r.json())");
    assert.equal(stato1.strada, 'google');
    assert.equal(stato1.ultimaStrada, 'google');
    assert.match(stato1.ultimoContatto, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.equal(p.rimbalzi.postSulRimbalzo, 0, 'il rimbalzo 302 seguito con una GET');
    await w.foto('dashboard-google');
    passo('entrato da Google con la casa spenta: Dashboard, strada "google", ' + p.rimbalzi.post + ' richieste col rimbalzo 302');

    for (const hash of ['#clienti', '#commesse', '#rapportini/elenco', '#documenti']) {
      await w.valuta("location.hash = '" + hash + "'; true");
      await aspetta(2000);
      const t = await w.valuta("document.querySelector('#principale').innerText.slice(0, 60).replace(/\\s+/g, ' ')");
      assert.ok(!/non risponde/.test(t), hash + ': ' + t);
    }
    const idLocale = 'exe-porta-' + GIRO;
    const s = await w.valuta(scrivi('salvaRapportino', { rapportino: { idLocale, data: '2026-10-30', idCliente: 'C002', descrizione: 'Dall\'exe fuori casa', oreLavoro: 2, tariffa: 40 } }));
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.equal(conta('SELECT COUNT(*) n FROM rapportini WHERE id_locale = ?', idLocale), 1);
    passo('letture e un rapportino salvato da Google (' + s.rapportino.id + ')');

    const pdf = await w.valuta(`(async () => {
      const byte = new Uint8Array(600 * 1024); for (let i = 0; i < byte.length; i += 65536) crypto.getRandomValues(byte.subarray(i, i + 65536));
      byte.set(new TextEncoder().encode('%PDF-1.4\\n'), 0);
      const su = await fetch('/locale/carica-corpo?nome=' + encodeURIComponent('Schema exe.pdf') + '&mime=application/pdf&per=documento&idFile=exe-${GIRO}', { method: 'POST', body: new Blob([byte]) }).then(r => r.json());
      if (!su.ok) return su;
      const giu = new Uint8Array(await (await fetch('/file/' + su.file.id)).arrayBuffer());
      return { ok: true, byte: su.file.byte, uguale: giu.length === byte.length && giu.every((x, i) => x === byte[i]) };
    })()`);
    assert.equal(pdf.ok, true, JSON.stringify(pdf));
    assert.equal(pdf.uguale, true, 'il PDF torna uguale');
    passo('un PDF di ' + Math.round(pdf.byte / 1024) + ' KB su (strada "carica") e giù (strada "file"), uguale');

    const enorme = await w.valuta(`fetch('/locale/carica-corpo?nome=enorme.bin&mime=application/octet-stream&per=documento', { method: 'POST', body: new Blob([new Uint8Array(27 * 1000 * 1000)]) }).then(r => r.json())`);
    assert.equal(enorme.ok, false);
    assert.match(enorme.errore, /troppo grande per passare da Google \(al massimo 26 MB\): mandala quando sei in ufficio/);
    assert.ok(!enorme.rete, 'riprovare uguale non serve');
    passo('un file da 27 MB non parte da Google: "' + enorme.errore + '"');

    // Il server spento da poco: lo script risponde "attesa", il programma richiede con lo stesso id.
    p.attesaApp(1500);
    await p.spegniNas();
    const nome1 = 'Referente exe attesa ' + GIRO;
    const inCorso = w.valuta(scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: nome1 } }));
    await aspetta(4500);
    assert.equal(conta('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome1), 0);
    p.accendiNas();
    const r1 = await inCorso;
    p.attesaApp(0);
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal(conta('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome1), 1);
    passo('server spento da poco e riacceso: la scrittura arriva una volta (il programma ha aspettato con lo stesso id)');

    // Spento da tanto: "spento" subito, con l'ora; poi riacceso, la stessa scrittura passa una volta.
    await p.spegniNas();
    p.nasMutoDa(5 * 60000);
    const nome2 = 'Referente exe spento ' + GIRO;
    const t0 = Date.now();
    const no = await w.valuta(scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: nome2 } }));
    assert.ok(Date.now() - t0 < 5000, 'non aspetta');
    assert.equal(no.ok, false);
    assert.equal(no.rete, true);
    assert.equal(no.porta, 'spento');
    assert.match(no.errore, /Il server dello studio non risponde dalle \d{2}:\d{2}/);
    p.accendiNas();
    await aspetta(1000);
    const si = await w.valuta(scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: nome2 } }));
    assert.equal(si.ok, true, JSON.stringify(si));
    assert.equal(conta('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome2), 1);
    passo('server spento da tanto: "' + no.errore + '", poi Riprova: una volta');

    await w.valuta("location.hash = '#amministrazione/app'; true");
    await aspetta(1500);
    const frase = await w.valuta("document.querySelector('.frase-collegamento').textContent");
    assert.match(frase, /^Da fuori: Google · In casa: 127\.0\.0\.1:\d+ · ultimo contatto alle \d{1,2}:\d{2} via Google$/);
    await w.foto('amministrazione-google');
    passo('Amministrazione › L\'app: "' + frase + '"');
    await w.chiudi();
    w = null;

    // ================================================================ B. in casa (riaperto: la chiave è salvata, cifrata)
    p.modoCasa('passa');
    const vistiPrima = p.statoCasa.visti.length;
    w = await apri(conProva);
    await w.aspettaChe("!!document.querySelector('h1') && /Manuel/.test(document.querySelector('h1').textContent)", 25000, 'la Dashboard da casa');
    const stato2 = await w.valuta("fetch('/locale/stato').then(r => r.json())");
    assert.equal(stato2.strada, 'casa', JSON.stringify(stato2));
    const visti = p.statoCasa.visti.slice(vistiPrima);
    assert.equal(visti[0].percorso, '/salute');
    assert.equal(visti[0].conChiave, false, 'la prova non manda il token');
    assert.ok(visti.slice(1).every(v => v.conChiave), 'dopo la firma, le richieste a casa col Bearer');
    const provePrima = visti.filter(v => v.percorso === '/salute').length;
    passo('riaperto in casa: la firma di /salute sceglie casa (' + visti.length + ' richieste a casa, ' + provePrima + ' prova)');

    const nome3 = 'Referente exe casa ' + GIRO;
    const r3 = await w.valuta(scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: nome3 } }));
    assert.equal(r3.ok, true);
    const ultima = p.statoCasa.visti.slice(-1)[0];
    assert.equal(ultima.metodo, 'POST');
    assert.match(String(ultima.idRichiesta), /^[A-Za-z0-9_-]{16}$/, 'la POST di casa porta idRichiesta');
    passo('una scrittura da casa con idRichiesta (' + ultima.idRichiesta.length + ' caratteri)');

    const nome4 = 'Referente exe persa ' + GIRO;
    const persePrima = p.statoCasa.perse;
    p.modoCasa('perdiRisposta');
    const r4 = await w.valuta(scrivi('salvaReferente', { referente: { idSoggetto: 'C002', nome: nome4 } }));
    assert.equal(r4.ok, true, JSON.stringify(r4));
    assert.equal(p.statoCasa.perse - persePrima, 1, 'la risposta di casa si è persa');
    assert.equal(conta('SELECT COUNT(*) n FROM referenti WHERE nome = ?', nome4), 1, 'fatta una volta: da Google il server ha riconosciuto l\'id');
    const idCasa = p.statoCasa.visti.slice(-1)[0].idRichiesta;
    assert.equal(conta('SELECT COUNT(*) n FROM richieste_fatte WHERE id = ?', idCasa), 1, 'lo stesso id, da casa e da Google');
    assert.equal((await w.valuta("fetch('/locale/stato').then(r => r.json())")).strada, 'google', 'dopo l\'errore di casa: Google');
    passo('risposta persa a casa: la stessa richiesta (id ' + idCasa + ') riparte da Google e il referente c\'è una volta');
    await w.chiudi();
    w = null;

    p.modoCasa('impostore');
    const vistiImp = p.statoCasa.visti.length;
    w = await apri(conProva);
    await w.aspettaChe("!!document.querySelector('h1') && /Manuel/.test(document.querySelector('h1').textContent)", 25000, 'la Dashboard col finto apparecchio');
    assert.equal((await w.valuta("fetch('/locale/stato').then(r => r.json())")).strada, 'google');
    const vistiDaImp = p.statoCasa.visti.slice(vistiImp);
    assert.ok(vistiDaImp.length >= 1 && vistiDaImp.every(v => v.percorso === '/salute' && !v.conChiave), 'all\'altro apparecchio solo la prova, senza token');
    passo('un altro apparecchio allo stesso indirizzo: niente firma, niente token, tutto da Google');
    await w.chiudi();
    w = null;
    p.modoCasa('spento');

    // ================================================================ C. il file .wisper dell'email
    const file = path.join(dati2, 'Collega Wisper Ufficio.wisper');
    fs.writeFileSync(file, JSON.stringify({ tipo: 'wisper-collegamento', versione: 2, google: p.google, casa: p.casa }));
    w = await apri(['--no-installa', '--dati', dati2, file]);
    await aspetta(1500);
    assert.equal(fs.existsSync(file), false, 'il file dell\'email si cancella');
    const conf2 = JSON.parse(fs.readFileSync(path.join(dati2, 'configurazione.json'), 'utf8'));
    assert.equal(conf2.server, p.casa);
    assert.ok(conf2.google.length > 60 && !JSON.stringify(conf2).includes(new URL(p.google).host), 'l\'indirizzo Google salvato cifrato');
    assert.match(await w.valuta("document.querySelector('#avvisi').innerText"), /Collegato: da fuori casa Wisper Ufficio passa da Google/);
    // Dal 02/11/2026 la pagina di accesso si apre sul codice per il telefono: si passa a email e password come una persona.
    for (let i = 0; i < 25 && !(await w.valuta("!!document.querySelector('.accesso') || (b => { if (b) b.click(); return false; })([...document.querySelectorAll('.pagina-accesso button')].find(x => x.textContent.trim() === 'Entra con email e password'))")); i++) await aspetta(200);
    await w.valuta(`(() => { const f = document.querySelector('.accesso'); f.querySelector('input[type=email]').value = 'laura@esempio.it'; f.querySelector('input[type=password]').value = 'prova'; f.requestSubmit(); return true; })()`);
    await w.aspettaChe("!!document.querySelector('h1') && /Laura/.test(document.querySelector('h1').textContent)", 25000, 'la Dashboard di Laura');
    assert.equal((await w.valuta("fetch('/locale/stato').then(r => r.json())")).strada, 'google');
    passo('file .wisper col doppio clic: indirizzi salvati (Google cifrato), file cancellato, Laura entra da Google');
    await w.chiudi();
    w = null;

    console.log('TUTTO BENE (' + passi + ' passi)');
  } finally {
    if (w) await w.chiudi().catch(() => null);
    await p.ferma();
    for (const d of [dati, dati2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* WebView2 tiene ancora un file */ } }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('NO: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
