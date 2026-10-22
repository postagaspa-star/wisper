// Prova dal vivo di WisperUfficio.exe contro il server di prova, senza installarlo e
// senza toccare i dati veri: cartella di dati a parte, server di prova, e la WebView2
// del programma guidata dalla sua porta di DevTools (solo per questo processo).
//
//   node server/src/avvio.js --prova --porta 8400 --dati <cartella temporanea>
//   node pc/prove/prova-exe.js --exe <WisperUfficio.exe> --dati <cartella di prova> [--uscita <schermate>]
//
// Controlla: il file della 0.4 (indirizzo e codice del foglio) si riscrive senza il codice;
// si entra da /locale/accedi e il token non arriva mai alla pagina; il token sul disco è
// cifrato; le pagine si aprono senza errori; /locale/esci butta la chiave.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const arg = process.argv.slice(2);
const opz = (n, d) => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : d; };
const EXE = path.resolve(opz('--exe', ''));
const DATI = path.resolve(opz('--dati', fs.mkdtempSync(path.join(os.tmpdir(), 'wisper-exe-'))));
const USCITA = opz('--uscita', '');
const SERVER = opz('--server', 'http://localhost:8400');
const aspetta = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(EXE)) throw new Error('Manca --exe');
  fs.mkdirSync(DATI, { recursive: true });
  // Un file di configurazione come lo scriveva la 0.4: indirizzo del foglio e codice (finti).
  const conf = path.join(DATI, 'configurazione.json');
  fs.writeFileSync(conf, JSON.stringify({ url: 'https://script.google.com/macros/s/FINTO/exec', codice: 'non-un-codice-vero', dispositivo: 'disp-di-prova-04' }));

  const porta = 9500 + Math.floor(Math.random() * 300);
  const exe = spawn(EXE, ['--no-installa', '--dati', DATI, '--server', SERVER], {
    env: Object.assign({}, process.env, { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + porta }),
    stdio: 'ignore',
  });
  let ws = null;
  const errori = [];
  try {
    let pagina = null;
    for (let i = 0; i < 80 && !pagina; i++) {
      await aspetta(250);
      const lista = await fetch('http://127.0.0.1:' + porta + '/json/list').then(r => r.json()).catch(() => null);
      pagina = (lista || []).find(x => x.type === 'page' && /^https:\/\/wisper\.locale\//.test(x.url));
    }
    if (!pagina) throw new Error('La finestra del programma non si è aperta (o la porta di DevTools non risponde)');
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
      if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    const foto = async nome => {
      if (!USCITA) return;
      fs.mkdirSync(USCITA, { recursive: true });
      const f = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(USCITA, 'exe-' + nome + '.png'), Buffer.from(f.result.data, 'base64'));
    };
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await valuta("localStorage.setItem('wisper-visita-2', '1'); true");
    await aspetta(1500);

    // 1. Il file della 0.4 si è riscritto: niente codice né indirizzo del foglio, stesso dispositivo.
    const scritto = JSON.parse(fs.readFileSync(conf, 'utf8'));
    assert.equal(scritto.codice, undefined, 'il codice del foglio non deve restare sul disco');
    assert.equal(scritto.url, undefined, 'l\'indirizzo del foglio non deve restare sul disco');
    assert.equal(scritto.dispositivo, 'disp-di-prova-04', 'il dispositivo resta lo stesso');
    console.log('ok  il file della 0.4 si è riscritto senza codice, col dispositivo di prima');

    // 2. Fuori: la pagina di accesso.
    const stato0 = await valuta("fetch('/locale/stato').then(r => r.json())");
    assert.equal(stato0.entrato, false);
    assert.equal(await valuta("document.body.classList.contains('fuori') && !!document.querySelector('.accesso')"), true, 'si vede la pagina di accesso');
    await foto('accesso');
    console.log('ok  pagina di accesso');

    // 3. Password sbagliata: errore del server, e il server non è "giù".
    const no = await valuta("fetch('/locale/accedi', { method: 'POST', body: JSON.stringify({ email: 'manuel@esempio.it', password: 'sbagliata' }) }).then(r => r.json())");
    assert.equal(no.ok, false);
    assert.match(no.errore, /Email o password sbagliate/);
    console.log('ok  password sbagliata: ' + no.errore);

    // 4. Si entra dal modulo vero, come una persona.
    await valuta(`(() => {
      const f = document.querySelector('.accesso');
      const [email, password] = f.querySelectorAll('input[type=email], input[type=password]');
      email.value = 'laura@esempio.it'; password.value = 'prova';
      f.requestSubmit();
      return true;
    })()`);
    await aspetta(3500);
    const stato1 = await valuta("fetch('/locale/stato').then(r => r.json())");
    assert.equal(stato1.entrato, true, 'entrata');
    assert.ok(!JSON.stringify(stato1).includes('token'), 'il token non arriva alla pagina');
    const titolo = await valuta("document.querySelector('h1') && document.querySelector('h1').textContent");
    assert.match(titolo, /Laura/, 'la Dashboard saluta chi è entrato');
    await foto('dashboard');
    console.log('ok  entrata come Laura: ' + titolo);

    // 5. Il token sul disco è cifrato (DPAPI), non in chiaro.
    const dopo = JSON.parse(fs.readFileSync(conf, 'utf8'));
    assert.ok(dopo.token && dopo.token.length > 60, 'il token è salvato');
    assert.equal(dopo.server, '', 'col server di prova (--server) l\'indirizzo non si salva');
    assert.equal(dopo.email, 'laura@esempio.it');
    console.log('ok  token salvato cifrato (' + dopo.token.length + ' caratteri), indirizzo di prova non salvato');

    // 6. Le pagine, una per una, senza errori; Laura (amministrazione in lettura) non vede i pulsanti per cambiare utenti.
    // Dalla fase 2 anche preventivi, listino, contratti, attività, calendario e pianificazione.
    for (const hash of ['#clienti', '#clienti/C002', '#commesse', '#commesse/26ST001', '#rapportini', '#fatturazione', '#amministrazione', '#amministrazione/utenti', '#amministrazione/permessi', '#amministrazione/registro', '#amministrazione/copie',
      '#preventivi', '#preventivi/' + encodeURIComponent('PR/' + new Date().getFullYear() + '/012'), '#preventivi/listino', '#preventivi/contratti', '#attivita', '#attivita/calendario', '#attivita/pianificazione',
      // fase 3: ore, timer, approvazioni, statistiche, spese e trasferte, veicoli
      '#rapportini/ore', '#rapportini/elenco', '#rapportini/approvare', '#rapportini/statistiche', '#spese', '#spese/riepiloghi', '#amministrazione/veicoli']) {
      await valuta("location.hash = '" + hash + "'; true");
      await aspetta(900);
      const testo = await valuta("document.querySelector('#principale').innerText.slice(0, 80).replace(/\\s+/g, ' ')");
      console.log('ok  ' + hash + ' · ' + testo);
      if (hash === '#amministrazione/utenti') {
        assert.equal(await valuta("[...document.querySelectorAll('button')].some(b => /Nuovo utente/.test(b.textContent))"), false, 'amministrazione in lettura: niente Nuovo utente');
        await foto('utenti-laura');
      }
      if (hash === '#commesse/26ST001') await foto('commessa');
    }
    // 7. Un file passa dal ponte col Bearer: la firma del tecnico o una foto, se ci sono; altrimenti un 404 pulito.
    const file = await valuta("fetch('/file/abcdefghijklmnop').then(r => r.status)");
    assert.ok([404, 403].indexOf(file) >= 0, 'un file che non c\'è: ' + file);
    console.log('ok  /file/<id> risponde ' + file + ' per un file che non c\'è');

    // 8. Esci: la chiave sparisce dal disco e si torna alla pagina di accesso.
    // Fase 2: il promemoria come notifica di Windows (l'icona accanto all'orologio). Qui si guarda solo la risposta.
    const notifica = await valuta("fetch('/locale/notifica', { method: 'POST', body: JSON.stringify({ titolo: 'Wisper · promemoria', testo: 'Prova del promemoria (Wisper Ufficio di prova)' }) }).then(r => r.json())");
    if (!notifica || notifica.ok !== true) throw new Error('La notifica non è partita: ' + JSON.stringify(notifica));
    const senzaTesto = await valuta("fetch('/locale/notifica', { method: 'POST', body: '{}' }).then(r => r.status)");
    if (senzaTesto !== 400) throw new Error('Una notifica senza testo deve dire 400, non ' + senzaTesto);
    console.log('ok  notifica di Windows: il programma risponde, senza testo la rifiuta');
    await valuta("fetch('/locale/esci', { method: 'POST', body: '{}' }).then(r => r.json())");
    const fuori = JSON.parse(fs.readFileSync(conf, 'utf8'));
    assert.equal(fuori.token, '', 'dopo Esci il token non c\'è più');
    const accesso = await valuta("fetch('/server/io').then(r => r.json())");
    assert.equal(accesso.accesso, false, 'dopo Esci il server risponde accesso:false');
    console.log('ok  uscita: token tolto, /server/io dice accesso:false');
    if (errori.length) throw new Error('Errori di JavaScript nella pagina:\n' + errori.join('\n'));
    console.log('TUTTO BENE');
  } finally {
    if (ws) ws.close();
    exe.kill();
    await aspetta(800);
  }
}

main().catch(e => { console.error('NO: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
