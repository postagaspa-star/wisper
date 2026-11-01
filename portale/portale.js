/*
 * Il portale clienti di Studio Tecnico GM (fase 7): la pagina che vedono i clienti dello studio, su Netlify.
 * Accordo: docs/gestionale/fase7.md. La §0 (01/11/2026, il portale passa da Google) vale sopra a tutto; le risposte
 * campo per campo sono in §7, le schermate con le parole esatte in §12.5.
 *
 * - Ogni richiesta è una POST JSON allo script Google del portale (§0.2):
 *   {portale: 1, v: 1, id, strada, metodo, sessione, pre, corpo, agente}. L'id è nuovo per ogni operazione e lo
 *   STESSO quando si riprova la stessa (una POST ripetuta non si fa due volte).
 * - Niente cookie (§0.4): sessione e pre-sessione stanno in sessionStorage (si perdono chiudendo la scheda); in
 *   localStorage solo l'ultima risposta della strada "studio" (dati pubblici), per dare il telefono dello studio quando
 *   il portale non risponde.
 * - Rotte dopo "#" (#/preventivi/12). Il token dei link (#/entra/<token>, #/condiviso/<token>) si toglie dall'indirizzo
 *   appena letto (history.replaceState).
 * - I testi vanno nella pagina SEMPRE con textContent: niente innerHTML con dati, niente script in linea, niente risorse
 *   esterne (CSP in portale/_headers).
 *
 * Le parti senza browser (rotte, formati, agente, id, ripetizioni con lo stesso id, scelte del preventivo, stampa) si
 * provano con node: portale/prove/portale.test.js.
 */
(function (radice) {
  'use strict';

  // =====================================================================================================================
  // Parti senza browser
  // =====================================================================================================================

  const PROTOCOLLO = 1;
  const FORMA_STRADA = /^[a-z-]+(\/[A-Za-z0-9_.-]{1,200}){0,3}$/;
  const FORMA_TOKEN = /^[A-Za-z0-9_-]{16,200}$/;
  const ATTESA_MS = 45000;          // la pagina aspetta 45 s (lo script aspetta il server 20 s: §0.2)
  const ATTESA_CARICA_MS = 180000;  // un file di 20 MB sono 27 MB di testo: col telefono ci vuole di più
  const PUNTI_MINIMI = 30;          // punti di tratto prima di accettare una firma (§7.3)
  const TESTO_RETE = 'Il portale non risponde adesso: riprova fra qualche minuto';
  const TESTO_ANTEPRIMA = "È un'anteprima: qui non si accetta e non si firma";
  const TIPI_BASE = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'dwg', 'dxf', 'docx', 'xlsx'];
  const ERRORE_TIPO = 'Questo tipo di file non si può caricare: PDF, foto, DWG, DXF, Word o Excel';
  const SEGNAPOSTO_FIRMA = 'FIRMAPORTALE0000';

  // ------------------------------------------------------------------------------------------------------- le rotte

  const PAGINE_FUORI = ['entra', 'posta', 'link', 'azienda', 'condiviso'];

  /** "#/preventivi/12" → {pagina: "preventivo", id: "12"}. Quello che non è nell'elenco è "nontrovato". */
  function leggiRotta(hash) {
    const testo = String(hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    if (!testo || testo === 'casa') return { pagina: 'casa' };
    const p = testo.split('/');
    const id = /^\d{1,10}$/.test(p[1] || '') ? p[1] : null;
    switch (p[0]) {
      case 'entra':
        if (p.length === 1) return { pagina: 'entra' };
        if (p.length === 2 && FORMA_TOKEN.test(p[1])) return { pagina: 'link', token: p[1] };
        break;
      case 'condiviso':
        if (p.length === 1) return { pagina: 'condiviso' };
        if (p.length === 2 && FORMA_TOKEN.test(p[1])) return { pagina: 'condiviso', token: p[1] };
        break;
      case 'link': case 'posta': case 'azienda': case 'informativa': case 'accesso':
        if (p.length === 1) return { pagina: p[0] };
        break;
      case 'preventivi':
        if (p.length === 1) return { pagina: 'preventivi' };
        if (id && p.length === 2) return { pagina: 'preventivo', id };
        if (id && p.length === 3 && p[2] === 'accetta') return { pagina: 'accetta', id };
        if (id && p.length === 3 && p[2] === 'accettato') return { pagina: 'accettato', id };
        break;
      case 'rapportini':
        if (p.length === 1) return { pagina: 'rapportini' };
        if (id && p.length === 2) return { pagina: 'rapportino', id };
        if (id && p.length === 3 && p[2] === 'firma') return { pagina: 'firmarap', id };
        break;
      case 'documenti':
        if (p.length === 1) return { pagina: 'documenti' };
        if (p.length === 2 && p[1] === 'manda') return { pagina: 'carica' };
        break;
      case 'fatture':
        if (p.length === 1) return { pagina: 'fatture' };
        if (id && p.length === 2) return { pagina: 'fattura', id };
        break;
      case 'richieste':
        if (p.length === 1) return { pagina: 'richieste' };
        if (p.length === 2 && p[1] === 'nuova') return { pagina: 'nuovarichiesta' };
        if (id && p.length === 2) return { pagina: 'richiesta', id };
        break;
      default:
    }
    return { pagina: 'nontrovato' };
  }

  /** L'indirizzo (dopo #) di una pagina: indirizzo("preventivo", 12) → "#/preventivi/12". */
  function indirizzo(pagina, id) {
    const conId = (base, coda) => '#/' + base + '/' + id + (coda ? '/' + coda : '');
    switch (pagina) {
      case 'preventivo': return conId('preventivi');
      case 'accetta': return conId('preventivi', 'accetta');
      case 'accettato': return conId('preventivi', 'accettato');
      case 'rapportino': return conId('rapportini');
      case 'firmarap': return conId('rapportini', 'firma');
      case 'fattura': return conId('fatture');
      case 'richiesta': return conId('richieste');
      case 'carica': return '#/documenti/manda';
      case 'nuovarichiesta': return '#/richieste/nuova';
      default: return '#/' + pagina;
    }
  }

  const SEZIONE = { preventivo: 'preventivi', accetta: 'preventivi', accettato: 'preventivi', rapportino: 'rapportini', firmarap: 'rapportini', carica: 'documenti',
    fattura: 'fatture', nuovarichiesta: 'richieste', richiesta: 'richieste', informativa: 'accesso' };
  /** La voce del menu accesa per una pagina. */
  const sezioneDi = pagina => SEZIONE[pagina] || pagina;

  /** Dove porta "Indietro" (null nelle pagine del menu). */
  function padreDi(r) {
    switch (r.pagina) {
      case 'preventivo': case 'accettato': return '#/preventivi';
      case 'accetta': return indirizzo('preventivo', r.id);
      case 'rapportino': return '#/rapportini';
      case 'firmarap': return indirizzo('rapportino', r.id);
      case 'carica': return '#/documenti';
      case 'fattura': return '#/fatture';
      case 'richiesta': case 'nuovarichiesta': return '#/richieste';
      default: return null;
    }
  }

  /** La destinazione che dà il server ("preventivi/12", "" = la casa) diventa un indirizzo, solo verso le pagine di dentro. */
  function indirizzoDaDestinazione(d) {
    const r = leggiRotta('#/' + String(d || ''));
    if (PAGINE_FUORI.indexOf(r.pagina) >= 0 || r.pagina === 'nontrovato' || r.pagina === 'informativa') return '#/casa';
    return '#/' + (String(d || '') || 'casa');
  }

  /** Il contrario: la pagina di dentro dove si voleva andare, da ricordare quando la sessione manca o scade. */
  function destinazioneDa(hash) {
    const r = leggiRotta(hash);
    if (PAGINE_FUORI.indexOf(r.pagina) >= 0 || r.pagina === 'nontrovato' || r.pagina === 'informativa' || r.pagina === 'casa') return '';
    return String(hash).replace(/^#\/?/, '').replace(/\/+$/, '');
  }

  /** Dove porta una cosa della casa (daFare, novita): {tipo, id}. */
  function indirizzoDiCosa(tipo, id) {
    switch (tipo) {
      case 'preventivo': return indirizzo('preventivo', id);
      case 'contratto': return '#/preventivi';
      case 'rapportino': return indirizzo('rapportino', id);
      case 'documento': return '#/documenti';
      case 'fattura': return indirizzo('fattura', id);
      case 'richiesta': case 'ticket': return indirizzo('richiesta', id);
      default: return '#/casa';
    }
  }

  // ------------------------------------------------------------------------------------------------------- i permessi

  /** Le voci del menu, solo quelle col permesso ≥ 1 (§12.5). */
  function vociMenu(puo) {
    const p = puo || {};
    return [
      { chiave: 'casa', nome: 'Casa', breve: 'Casa', icona: 'casa' },
      p.preventivi >= 1 && { chiave: 'preventivi', nome: 'Preventivi e contratti', breve: 'Preventivi', icona: 'preventivo' },
      p.rapportini >= 1 && { chiave: 'rapportini', nome: 'Rapportini', breve: 'Rapportini', icona: 'firma' },
      p.documenti >= 1 && { chiave: 'documenti', nome: 'Documenti', breve: 'Documenti', icona: 'doc' },
      p.fatture >= 1 && { chiave: 'fatture', nome: 'Fatture', breve: 'Fatture', icona: 'fattura' },
      p.richieste >= 1 && { chiave: 'richieste', nome: "Richieste d'intervento", breve: 'Richieste', icona: 'chiave' },
      { chiave: 'accesso', nome: 'Il mio accesso', breve: 'Il mio accesso', icona: 'persona' },
    ].filter(Boolean);
  }

  const PERMESSO_DI = { preventivi: 'preventivi', preventivo: 'preventivi', accetta: 'preventivi', accettato: 'preventivi', rapportini: 'rapportini', rapportino: 'rapportini',
    firmarap: 'rapportini', documenti: 'documenti', carica: 'documenti', fatture: 'fatture', fattura: 'fatture', richieste: 'richieste', richiesta: 'richieste', nuovarichiesta: 'richieste' };
  const LIVELLO_DI = { carica: 2, nuovarichiesta: 2 };
  /** La pagina si può aprire con questi permessi? (il server decide comunque: questa è solo la porta della pagina). */
  function puoAprire(pagina, puo) {
    const t = PERMESSO_DI[pagina];
    return !t || ((puo || {})[t] || 0) >= (LIVELLO_DI[pagina] || 1);
  }

  // ------------------------------------------------------------------------------------------------------- i formati

  const migliaia = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  /** 4291.35 → "4.291,35 €" (il meno è quello tipografico). */
  function euro(n) {
    const x = Number(n) || 0;
    const parti = Math.abs(x).toFixed(2).split('.');
    return (x < -0.004 ? '−' : '') + migliaia(parti[0]) + ',' + parti[1] + ' €';
  }
  /** 0.5 → "0,5"; 16 → "16"; 1830.5 → "1.830,5". */
  function numero(n) {
    const x = Math.round((Number(n) || 0) * 100) / 100;
    const parti = Math.abs(x).toFixed(2).split('.');
    const dec = parti[1].replace(/0+$/, '');
    return (x < 0 ? '−' : '') + migliaia(parti[0]) + (dec ? ',' + dec : '');
  }
  /** "2026-10-22" (o un istante) → "22/10/2026". */
  function dataIt(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  /** "2026-10-22T09:05:00" → "9:05". */
  function oraIt(iso) {
    const m = /T(\d{2}):(\d{2})/.exec(String(iso || ''));
    return m ? String(Number(m[1])) + ':' + m[2] : '';
  }
  /** "2026-10-21T17:30:00" → "21/10/2026 17:30". */
  function dataOraIt(iso) {
    const o = oraIt(iso);
    return dataIt(iso) + (o ? ' ' + o : '');
  }
  function isoGiorno(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function giornoPrima(iso) {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return isoGiorno(d);
  }
  /** "oggi alle 9:58", "ieri alle 17:40", "20/10/2026 alle 8:40" (oggi = "aaaa-mm-gg"). */
  function quandoIt(iso, oggi) {
    const g = String(iso || '').slice(0, 10);
    if (!g) return '';
    const giorno = g === oggi ? 'oggi' : g === giornoPrima(oggi) ? 'ieri' : dataIt(g);
    const o = oraIt(iso);
    return o ? giorno + ' alle ' + o : giorno;
  }
  /** Grandezza di un file: "85 KB", "1,7 MB". */
  function grandezza(byte) {
    const n = Number(byte) || 0;
    if (n < 102400) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
  }
  /** "Buongiorno" fino alle 13, "Buon pomeriggio" fino alle 18, poi "Buonasera". */
  function saluto(ora) {
    return ora >= 5 && ora < 13 ? 'Buongiorno' : ora >= 13 && ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  }
  /** "0445 000100" → "tel:+390445000100" (solo cifre: nient'altro finisce nel collegamento). */
  function collegamentoTelefono(t) {
    let s = String(t || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (!/\d{5,}/.test(s)) return '';
    if (s.indexOf('00') === 0) s = '+' + s.slice(2);
    if (s.charAt(0) !== '+') s = '+39' + s;
    return 'tel:' + s;
  }
  /** Un'email da mettere in un collegamento mailto:, solo se ha la forma giusta. */
  function collegamentoEmail(e) {
    const s = String(e || '').trim();
    return /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(s) ? 'mailto:' + s : '';
  }
  /** Le iniziali per il cerchio: "Sig. Ferretti" → "F", "Giulia Neri" → "GN". */
  function iniziali(nome) {
    const parole = String(nome || '').replace(/^(Sig\.ra|Sig\.|Dott\.ssa|Dott\.|Ing\.|Geom\.|Arch\.)\s+/i, '').split(/\s+/).filter(Boolean);
    return parole.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') || '·';
  }
  const COMPLESSITA = { bassa: 'Bassa', media: 'Media', alta: 'Alta' };

  // ------------------------------------------------------------------------------------------------------- stati

  /** Il colore di ogni parola di stato (§12): mai rosso al cliente, anche una scadenza passata è ambra. */
  const COLORE_STATO = {
    'Accettato': 'verde', 'Firmato': 'verde', 'Pagata': 'verde', 'Risolta': 'verde', 'Attivo': 'verde',
    'Presa in carico': 'blu', 'Intervento fissato': 'blu', 'Da pagare': 'blu',
    'Da accettare': 'giallo', 'Da firmare': 'giallo', 'Nuovo': 'giallo',
    'Scaduto': 'ambra', 'Scadenza passata': 'ambra', 'Pagata in parte': 'ambra', 'In attesa': 'ambra',
    'Ricevuta': 'grigio', 'Chiusa': 'grigio', 'Annullata': 'grigio', 'Non accettato': 'grigio', 'Ricevuto': 'grigio',
    'Nota di credito': 'grigio', 'Disdetto': 'grigio', 'Chiuso': 'grigio',
  };
  const coloreStato = parola => COLORE_STATO[parola] || 'grigio';
  const RICHIESTE_CHIUSE = ['Risolta', 'Chiusa', 'Annullata'];

  // ------------------------------------------------------------------------------------------------------- agente, id

  /** "Chrome · Android", "Edge · Windows", "Safari · iPhone": quello che finisce nel registro come dispositivo (§0.2). */
  function agenteDa(ua) {
    const u = String(ua || '');
    let b = 'Browser';
    if (/Edg(e|A|iOS)?\//.test(u)) b = 'Edge';
    else if (/OPR\/|Opera/.test(u)) b = 'Opera';
    else if (/SamsungBrowser\//.test(u)) b = 'Samsung Internet';
    else if (/Firefox\/|FxiOS\//.test(u)) b = 'Firefox';
    else if (/CriOS\/|Chrome\//.test(u)) b = 'Chrome';
    else if (/Safari\//.test(u) && /Version\//.test(u)) b = 'Safari';
    let s = '';
    if (/Android/.test(u)) s = 'Android';
    else if (/iPhone|iPod/.test(u)) s = 'iPhone';
    else if (/iPad/.test(u)) s = 'iPad';
    else if (/Windows/.test(u)) s = 'Windows';
    else if (/CrOS/.test(u)) s = 'ChromeOS';
    else if (/Macintosh|Mac OS X/.test(u)) s = 'Mac';
    else if (/Linux/.test(u)) s = 'Linux';
    return (s ? b + ' · ' + s : b).slice(0, 40);
  }

  function base64url(byte) {
    let s = '';
    for (let i = 0; i < byte.length; i++) s += String.fromCharCode(byte[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /** Un id nuovo per una richiesta: 16 byte casuali, 22 caratteri base64url (§0.2: 16-80 caratteri). */
  const nuovoId = casuali => base64url(casuali(16));
  /** La pre-sessione: 32 byte casuali (§0.4). */
  const nuovaPre = casuali => base64url(casuali(32));

  /** JSON con le chiavi in ordine: lo stesso corpo dà sempre lo stesso testo. */
  function jsonOrdinato(x) {
    if (Array.isArray(x)) return '[' + x.map(jsonOrdinato).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + jsonOrdinato(x[k])).join(',') + '}';
    return JSON.stringify(x === undefined ? null : x);
  }
  /** Un'impronta corta di un testo (due FNV-1a a 32 bit e la lunghezza): riconosce "la stessa operazione". */
  function impronta(testo) {
    let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
    for (let i = 0; i < testo.length; i++) {
      const c = testo.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995);
    }
    return testo.length.toString(36) + '.' + (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36);
  }

  // ------------------------------------------------------------------------------------------------------- le chiamate

  /**
   * Le chiamate allo script del portale (§0.2). o = {trasporto(testo, ms) → Promise<JSON letto o null>, casuali(n),
   * agente, leggiSessione(), leggiPre()}. Una POST rimasta senza risposta (rete, script che non risponde, server in
   * difficoltà) tiene il suo id: rifatta con lo stesso corpo riparte con lo STESSO id, e lo script o il server ridanno la
   * risposta di prima invece di rifarla. Una risposta vera (ok, o un rifiuto 4xx) libera l'id. Le letture hanno sempre un
   * id nuovo (porta-google.md §5).
   */
  function creaChiamate(o) {
    const sospese = new Map();
    async function chiama(strada, metodo, corpo, opz) {
      const op = opz || {};
      const m = metodo === 'POST' ? 'POST' : 'GET';
      if (!FORMA_STRADA.test(strada) || strada.indexOf('..') >= 0) return { ok: false, stato: 404, errore: 'Non trovato' };
      const c = corpo && typeof corpo === 'object' ? corpo : {};
      const chiave = m === 'POST' ? strada + '|' + impronta(jsonOrdinato(c)) : '';
      let id = chiave ? sospese.get(chiave) : '';
      if (!id) {
        id = nuovoId(o.casuali);
        if (chiave) sospese.set(chiave, id);
      }
      const sessione = String(o.leggiSessione() || '');
      // La pre-sessione va con entra e codice; e con azienda quando la sessione non c'è ancora (scelta dopo il codice).
      const conPre = strada === 'entra' || strada === 'codice' || (strada === 'azienda' && !sessione);
      const richiesta = { portale: PROTOCOLLO, v: PROTOCOLLO, id, strada, metodo: m, sessione, pre: conPre ? String(o.leggiPre() || '') : '', corpo: c, agente: o.agente };
      let r = null;
      try {
        r = await o.trasporto(JSON.stringify(richiesta), op.attesa || ATTESA_MS);
      } catch (e) {
        r = null;
      }
      if (!r || typeof r !== 'object' || typeof r.ok !== 'boolean') r = { ok: false, rete: true, errore: TESTO_RETE };
      else if (r.rete) r = Object.assign({}, r, { errore: TESTO_RETE });
      const definitiva = r.ok || (!r.rete && Number(r.stato) >= 400 && Number(r.stato) < 500);
      if (chiave && definitiva) sospese.delete(chiave);
      return r;
    }
    return { chiama, inSospeso: () => sospese.size };
  }

  // ------------------------------------------------------------------------------------------------------- preventivo

  const vociDi = p => ((p && p.sezioni) || []).reduce((a, s) => a.concat(s.voci || []), []);
  const gruppoDi = v => String((v && v.alternativa) || '').trim();
  const daScegliere = v => !!(v && (v.facoltativa || gruppoDi(v)));

  /** Le scelte come le ha messe lo studio: {idVoce: true|false} per facoltative e alternative (una sola per gruppo). */
  function scelteIniziali(p) {
    const s = {};
    const presi = {};
    vociDi(p).forEach(v => {
      if (!daScegliere(v)) return;
      const g = gruppoDi(v);
      let si = !!v.scelta;
      if (g && si) { if (presi[g]) si = false; presi[g] = true; }
      s[String(v.id)] = si;
    });
    return s;
  }
  /** Una scelta nuova: un'alternativa scelta toglie le altre del gruppo; idVoce = null con gruppo = "Nessuna di queste". */
  function scegli(p, scelte, idVoce, valore, gruppo) {
    const n = Object.assign({}, scelte);
    const voci = vociDi(p);
    if (idVoce === null || idVoce === undefined) {
      voci.forEach(x => { if (gruppoDi(x) === gruppo) n[String(x.id)] = false; });
      return n;
    }
    const v = voci.find(x => String(x.id) === String(idVoce));
    if (!v || !daScegliere(v)) return n;
    const g = gruppoDi(v);
    if (g) {
      voci.forEach(x => { if (gruppoDi(x) === g) n[String(x.id)] = false; });
      if (valore) n[String(v.id)] = true;
    } else n[String(v.id)] = !!valore;
    return n;
  }
  const inclusa = (v, scelte) => !daScegliere(v) || !!scelte[String(v.id)];
  /** Le righe del riassunto sulla pagina della firma: [{testo, stato: "inclusa" | "non inclusa" | "scelto"}]. */
  function riassuntoScelte(p, scelte) {
    const righe = [];
    const visti = {};
    vociDi(p).forEach(v => {
      const g = gruppoDi(v);
      if (g) {
        if (visti[g]) return;
        visti[g] = true;
        const scelta = vociDi(p).find(x => gruppoDi(x) === g && scelte[String(x.id)]);
        righe.push(scelta ? { testo: scelta.descrizione, stato: 'scelto' } : { testo: 'Nessuna di queste · ' + g, stato: 'scelto' });
      } else if (v.facoltativa) righe.push({ testo: v.descrizione, stato: scelte[String(v.id)] ? 'inclusa' : 'non inclusa' });
    });
    return righe;
  }
  /** "16 ore × 45,00 €", "3 m × 12,00 €", "a corpo", con lo sconto della voce. */
  function dettaglioVoce(v) {
    let t;
    if (v.modo === 'ore') t = numero(v.quantita) + (Number(v.quantita) === 1 ? ' ora × ' : ' ore × ') + euro(v.prezzo);
    else if (v.modo === 'quantita') t = numero(v.quantita) + (v.unita ? ' ' + v.unita : '') + ' × ' + euro(v.prezzo);
    else t = 'a corpo';
    if (Number(v.scontoPercentuale) > 0) t += ' · sconto ' + numero(v.scontoPercentuale) + '%';
    return t;
  }

  // ------------------------------------------------------------------------------------------------------- file

  function estensioneDi(nome) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(nome || ''));
    return m ? m[1].toLowerCase() : '';
  }
  /** Il primo controllo, prima di mandare (il server rifà tutto sui byte: §6.7). '' = va bene. */
  function erroreFile(nome, byte, tipi, maxMb) {
    const ammessi = Array.isArray(tipi) && tipi.length ? tipi : TIPI_BASE;
    if (ammessi.indexOf(estensioneDi(nome)) < 0) return ERRORE_TIPO;
    const max = Number(maxMb) || 20;
    if (Number(byte) > max * 1048576) return 'Il file è più grande di ' + max + ' MB: non si carica';
    return '';
  }
  /** Il testo dell'attributo accept del campo file: ".pdf,.jpg,...". */
  const acceptDi = tipi => (Array.isArray(tipi) && tipi.length ? tipi : TIPI_BASE).map(t => '.' + t).join(',');

  // ------------------------------------------------------------------------------------------------------- informativa

  /**
   * Il riassunto di "Prima di entrare" (§9.8 con i cambi di §0.6). Senza sessione (piè di pagina dell'ingresso)
   * l'azienda non si sa: "la tua azienda".
   */
  function testoInformativa(studio, azienda) {
    const s = studio || {};
    return 'Questo portale è di ' + (s.nome || 'lo studio') + ' (' + [s.indirizzo, s.partitaIva ? 'P. IVA ' + s.partitaIva : ''].filter(Boolean).join(', ') + '), titolare dei dati. ' +
      'Lo usiamo per mostrarti i documenti del lavoro che facciamo per ' + (azienda || 'la tua azienda') + ', per raccogliere accettazioni, firme e richieste. ' +
      'Teniamo il tuo nome, la tua email, il telefono se ce l\'hai dato, le firme e un registro degli accessi (data, ora, browser) per 12 mesi. ' +
      'I documenti e le firme li conserviamo come le altre carte dello studio, per 10 anni. ' +
      'Le email e il collegamento passano da Google; la pagina è ospitata da Netlify: tutti e due possono trattare dati negli Stati Uniti. ' +
      'Usiamo solo la memoria del browser che serve a tenerti dentro, e si cancella chiudendo la scheda: niente statistiche, niente pubblicità. ' +
      'Puoi chiedere di vedere, correggere o cancellare i tuoi dati scrivendo a ' + (s.email || 'lo studio') + '; puoi anche rivolgerti al Garante per la protezione dei dati personali.';
  }

  // ------------------------------------------------------------------------------------------------------- stampa

  /** Le impostazioni che documenti.js usa per intestazione e piè di pagina, dai dati pubblici dello studio. */
  function impostazioniStampa(studio) {
    const s = studio || {};
    return { RAGIONE_SOCIALE: s.nome || '', INDIRIZZO: s.indirizzo || '', PARTITA_IVA: s.partitaIva || '', EMAIL: s.email || '', TELEFONO: s.telefono || '' };
  }

  /**
   * Il rapportino della vista (§7.4) nella forma di documenti.js, SOLO coi campi della vista. Lo stato si scrive con la
   * parola del cliente ("Da firmare", "Firmato"): mai BOZZA o FATTURATO sul foglio stampato dal portale.
   */
  function perStampaRapportino(r, studio, azienda) {
    const rap = {
      id: r.numero || '', data: r.data, cliente: azienda || '', luogo: r.luogo || '', tecnico: r.tecnico || '', ticket: r.ticket || '',
      idCommessa: String(r.commessa || '').split(' · ')[0], oreLavoro: r.oreLavoro, oreExtra: r.oreExtra, oreViaggio: r.oreViaggio, km: r.km,
      descrizione: r.lavoro || '', stato: r.statoVisto || (r.daFirmare ? 'Da firmare' : 'Firmato'),
      firmatario: r.firmatario || '', firmatoIl: r.firmatoIl || '', firmaModo: r.firmaModo || '', firma: r.firma ? { id: SEGNAPOSTO_FIRMA } : null,
    };
    const i = r.importi;
    if (i) {
      const ore = (Number(r.oreLavoro) || 0) + (Number(r.oreViaggio) || 0);
      Object.assign(rap, {
        tariffa: i.tariffa, compensoOre: i.compensoOre, euroKm: i.euroKm, rimborsoKm: i.rimborsoKm, kmRimborsati: Number(i.rimborsoKm) > 0, spese: i.spese, totale: i.totale,
        pagaViaggio: Number(r.oreViaggio) > 0 && Math.abs((Number(i.tariffa) || 0) * ore - (Number(i.compensoOre) || 0)) < 0.01,
      });
    }
    return { rapportino: rap, ana: { impostazioni: impostazioniStampa(studio), clienti: [] }, opzioni: { conImporti: !!i } };
  }

  /** Il preventivo della vista (§7.3) nella forma di documenti.js; scelte = quelle del cliente (se non è accettato). */
  function perStampaPreventivo(p, studio, azienda, scelte, scadenze) {
    const a = p.accettazione || null;
    const conti = p.conti || {};
    const prev = {
      numero: p.numero || p.etichetta || '', revisione: p.revisione || 0, data: p.data, scadenza: p.scadenza, oggetto: p.oggetto || '', introduzione: p.introduzione || '',
      complessita: p.complessita || '', oneriPrevisti: p.oneriPrevisti || '', condizioni: p.condizioni || '', cliente: azienda || '',
      stato: p.stato === 'accettato' ? 'ACCETTATO' : p.stato === 'rifiutato' ? 'RIFIUTATO' : 'INVIATO',
      eppiPercentuale: conti.eppiPercentuale, ivaPercentuale: conti.ivaPercentuale, scontoPercentuale: p.scontoPercentuale || 0, scontoEuro: p.scontoEuro || 0,
      sezioni: (p.sezioni || []).map((s, i) => ({ id: 's' + i, titolo: s.titolo || '', ordine: i,
        voci: (s.voci || []).map((v, j) => ({ id: v.id, ordine: j, descrizione: v.descrizione || '', modo: v.modo, quantita: v.quantita, unita: v.unita || '', prezzo: v.prezzo,
          scontoPercentuale: v.scontoPercentuale || 0, facoltativa: !!v.facoltativa, alternativa: v.alternativa || '', scelta: !!v.scelta })) })),
      scadenzePagamento: (scadenze || p.scadenzePagamento || []).map(s => ({ descrizione: s.descrizione || '', importo: s.importo, tipo: 'importo' })),
      accettatoDa: a ? a.da || '' : '', accettatoIl: a ? a.il || '' : '', accettazioneModo: a ? a.modo || '' : '', firma: a && a.firma ? { id: SEGNAPOSTO_FIRMA } : null,
    };
    const imp = impostazioniStampa(studio);
    if (p.studio) { imp.TITOLI = p.studio.titoli || ''; imp.POLIZZA_COMPAGNIA = p.studio.polizza || ''; }
    return { preventivo: prev, ana: { impostazioni: imp, clienti: [] }, opzioni: !a && scelte ? { scelte } : {} };
  }

  /** Mette l'immagine della firma (data: PNG o JPEG) al posto del segnaposto; senza immagine toglie il segnaposto. */
  function mettiFirma(html, datiImmagine) {
    const pezzo = 'src="/file/' + SEGNAPOSTO_FIRMA + '"';
    const buona = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(datiImmagine || ''));
    if (buona) return html.split(pezzo).join('src="' + datiImmagine + '"');
    return html.split('<img class="sig" ' + pezzo + ' alt="">').join('');
  }

  const P = {
    PROTOCOLLO, FORMA_STRADA, PUNTI_MINIMI, TESTO_RETE, TESTO_ANTEPRIMA, ERRORE_TIPO, SEGNAPOSTO_FIRMA, ATTESA_MS, ATTESA_CARICA_MS,
    leggiRotta, indirizzo, sezioneDi, padreDi, indirizzoDaDestinazione, destinazioneDa, indirizzoDiCosa, vociMenu, puoAprire,
    euro, numero, dataIt, oraIt, dataOraIt, quandoIt, giornoPrima, grandezza, saluto, collegamentoTelefono, collegamentoEmail, iniziali,
    coloreStato, COLORE_STATO, agenteDa, nuovoId, nuovaPre, jsonOrdinato, impronta, creaChiamate,
    vociDi, scelteIniziali, scegli, inclusa, riassuntoScelte, dettaglioVoce, estensioneDi, erroreFile, acceptDi, testoInformativa,
    perStampaRapportino, perStampaPreventivo, mettiFirma,
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = P; return; }
  if (typeof document === 'undefined') return;

  // =====================================================================================================================
  // La pagina
  // =====================================================================================================================

  const CONFIG = radice.WISPER_PORTALE || {};
  const AGENTE = agenteDa(navigator.userAgent);

  // ------------------------------------------------------------------------------------------------------- memoria
  const memoriaDiRiserva = {};
  function leggiDa(spazio, k) {
    try { return radice[spazio].getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(memoriaDiRiserva, spazio + k) ? memoriaDiRiserva[spazio + k] : null; }
  }
  function scriviIn(spazio, k, v) {
    try {
      if (v === null || v === undefined) radice[spazio].removeItem(k); else radice[spazio].setItem(k, String(v));
    } catch (e) {
      if (v === null || v === undefined) delete memoriaDiRiserva[spazio + k]; else memoriaDiRiserva[spazio + k] = String(v);
    }
  }
  /** sessionStorage: sessione, pre, e i passaggi dell'ingresso (si perdono chiudendo la scheda). */
  const sess = { get: k => leggiDa('sessionStorage', 'wisper.' + k), set: (k, v) => scriviIn('sessionStorage', 'wisper.' + k, v) };
  /** localStorage: solo l'ultima "studio" (nome, telefono, email, indirizzo, partita IVA: già pubblici). */
  const loc = { get: k => leggiDa('localStorage', 'wisper.' + k), set: (k, v) => scriviIn('localStorage', 'wisper.' + k, v) };

  const casuali = n => crypto.getRandomValues(new Uint8Array(n));
  function pre() {
    let p = sess.get('pre');
    if (!p) { p = nuovaPre(casuali); sess.set('pre', p); }
    return p;
  }

  // ------------------------------------------------------------------------------------------------------- trasporto
  async function trasportoFetch(testo, ms) {
    if (!CONFIG.script) return null;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(CONFIG.script, { method: 'POST', body: testo, redirect: 'follow', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal });
      if (res.status !== 200) return null;
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (e) { return null; }
    } finally {
      clearTimeout(t);
    }
  }
  const chiamate = creaChiamate({ trasporto: trasportoFetch, casuali, agente: AGENTE, leggiSessione: () => sess.get('sessione'), leggiPre: () => sess.get('pre') });
  const api = (strada, metodo, corpo, opz) => chiamate.chiama(strada, metodo, corpo, opz);

  // ------------------------------------------------------------------------------------------------------- stato
  const S = {
    io: null, studio: null, studioLetto: false, rotta: { pagina: 'casa' }, giro: 0, ultimoIndirizzo: '',
    cache: new Map(), immagini: new Map(), scelte: {}, versioni: {}, conti: {}, accettati: {}, moduli: {}, filtroRap: '', ricChiuse: false,
  };
  try { S.studio = JSON.parse(loc.get('studio') || 'null'); } catch (e) { S.studio = null; }
  const anteprima = () => !!(S.io && S.io.sessione && S.io.sessione.anteprima);
  const nomeStudio = () => (S.studio && S.studio.nome) || 'Studio Tecnico';
  const oggi = () => isoGiorno(new Date());

  function salvaStudio(st) {
    if (!st || typeof st !== 'object') return;
    S.studio = { nome: st.nome || '', telefono: st.telefono || '', email: st.email || '', indirizzo: st.indirizzo || '', partitaIva: st.partitaIva || '' };
    loc.set('studio', JSON.stringify(S.studio));
  }

  // ------------------------------------------------------------------------------------------------------- DOM
  const NS = 'http://www.w3.org/2000/svg';
  const PROPRIETA = { value: 1, checked: 1, disabled: 1, hidden: 1, srcdoc: 1, multiple: 1 };
  /** h('a', {href, class, onclick}, figli...): i figli testo diventano nodi di testo (mai HTML). */
  function h(tag, attr) {
    const el = document.createElement(tag);
    if (attr) {
      Object.keys(attr).forEach(k => {
        const v = attr[k];
        if (v === null || v === undefined || v === false) return;
        if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (PROPRIETA[k]) el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (let i = 2; i < arguments.length; i++) metti(el, arguments[i]);
    return el;
  }
/** Svuota un nodo e ci rimette i figli (elenchi e null compresi: replaceChildren scriverebbe il loro testo). */
  function rimetti(el) {
    el.textContent = '';
    for (let i = 1; i < arguments.length; i++) metti(el, arguments[i]);
  }
  function metti(el, f) {
    if (f === null || f === undefined || f === false || f === '') return;
    if (Array.isArray(f)) { f.forEach(x => metti(el, x)); return; }
    el.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
  }

  const ICONE = {
    menu: 'M4 6h16M4 12h16M4 18h10', casa: 'M4 11l8-7 8 7v9H4zM10 20v-5h4v5',
    preventivo: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5', doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
    firma: 'M3 17c3-2 5-8 7-8s-1 8 2 8 3-4 5-4 2 3 4 3', fattura: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4',
    chiave: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
    persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', indietro: 'M15 18l-6-6 6-6', freccia: 'M9 18l6-6-6-6',
    scarica: 'M12 3v12M7 10l5 5 5-5M5 21h14', importa: 'M12 21V9M7 14l5-5 5 5M5 3h14',
    esci: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3', spunta: 'M5 12l5 5L19 7', chiudi: 'M6 6l12 12M18 6 6 18',
    foto: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    graffetta: 'M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7',
    invia: 'M4 12l16-8-6 16-2.5-6.5z', copia: 'M9 9h11v11H9zM5 15H4V4h11v1',
    telefono: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
    occhio: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', piu: 'M12 5v14M5 12h14',
    storia: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2', stampa: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  };
  function icona(nome, dim, spessore) {
    const s = document.createElementNS(NS, 'svg');
    const d = String(dim || 22);
    [['width', d], ['height', d], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', String(spessore || 2.2)],
      ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true'], ['focusable', 'false']].forEach(a => s.setAttribute(a[0], a[1]));
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONE[nome] || '');
    s.appendChild(p);
    return s;
  }

  const pill = (parola, colore) => h('span', { class: 'pill p-' + (colore || coloreStato(parola)) }, parola);
  const pillNuovo = () => pill('Nuovo', 'giallo');
  const sez = (nome, ...corpo) => h('section', { class: 'sez', 'aria-label': nome }, h('h2', { class: 'etichetta' }, nome), corpo);
  const schedaRighe = (righe, vuoto) => h('div', { class: 'scheda righe' }, righe.length ? righe : h('div', { class: 'vuoto' }, vuoto || 'Niente qui'));
  /** Una riga: o = {href | onclick, icona, coloreIcona, t1, t2, t3, pills, quanto, dx}. */
  function riga(o) {
    const corpo = h('span', { class: 'corpo' }, h('span', { class: 't1' }, o.t1), o.t2 && h('span', { class: 't2' }, o.t2), o.t3 && h('span', { class: 't2' }, o.t3),
      o.pills && o.pills.length ? h('span', { class: 'pillole-riga' }, o.pills) : null);
    const figli = [o.icona && h('span', { class: 'ico-riga' + (o.coloreIcona ? ' ' + o.coloreIcona : '') }, icona(o.icona, 20)), corpo,
      o.quanto && h('span', { class: 'quanto' }, o.quanto), o.dx || ((o.href || o.onclick) && h('span', { class: 'freccia' }, icona('freccia', 18)))];
    if (o.href) return h('a', { class: 'riga', href: o.href }, figli);
    if (o.onclick) return h('button', { type: 'button', class: 'riga', onclick: o.onclick, 'aria-label': o.etichetta || null }, figli);
    return h('div', { class: 'riga' }, figli);
  }
  const coppie = lista => h('div', { class: 'coppie' }, lista.filter(x => x && x[1]).map(x => h('div', { class: 'coppia' }, h('span', { class: 'k' }, x[0]), h('span', { class: 'v' }, x[1]))));
  const contiRiga = (k, v, classe) => h('div', { class: 'conti-r' + (classe ? ' ' + classe : '') }, h('span', null, k), h('b', null, v));
  const bordo = (testo, fare, ico) => h('button', { type: 'button', class: 'bordo', onclick: fare }, ico && icona(ico, 18), testo);
  const testoLink = (testo, fare, attr) => h('button', Object.assign({ type: 'button', class: 'testo-link', onclick: fare }, attr || {}), testo);
  const gialloLink = (testo, href) => h('a', { class: 'principale', href }, testo);
  const segnaposto = () => h('div', { class: 'segnaposto', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  function errore(id) {
    const p = h('p', { class: 'errore', id, hidden: true, role: 'alert' });
    return { el: p, metti(t) { p.textContent = t || ''; p.hidden = !t; }, };
  }
  function linkTelefono(tel) {
    const l = collegamentoTelefono(tel);
    return l ? h('a', { href: l }, tel) : tel || '';
  }
  /** Mette un avviso nel suo posto del modulo e lo porta in vista (sul telefono il giallo in basso lo coprirebbe). */
  function inBox(box) {
    rimetti(box, Array.prototype.slice.call(arguments, 1));
    if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  /** Il riquadro "il portale non risponde" (o un altro errore) dentro un modulo: niente rosso. */
  function boxErrore(r) {
    const tel = S.studio && S.studio.telefono;
    if (!r || r.rete || (Number(r.stato) >= 500 && !r.spento)) {
      return h('div', { class: 'avviso-box', role: 'alert' }, TESTO_RETE, tel && h('span', null, 'Oppure chiama lo studio allo ', linkTelefono(tel)));
    }
    return h('div', { class: 'avviso-box', role: 'alert' }, r.errore || 'Qualcosa non è andato');
  }

  // ------------------------------------------------------------------------------------------------------- impalcatura
  const D = {};
  function costruisci() {
    const app = document.getElementById('app');
    D.fascia = h('div', { class: 'fascia-ant', role: 'note', hidden: true }, icona('occhio', 18), 'Anteprima dello studio: niente di quello che fai arriva al cliente');
    D.lato = h('nav', { class: 'lato', 'aria-label': 'Menu' });
    D.nomeTel = h('div', { class: 'nome-st' });
    D.menuBtn = h('button', { type: 'button', class: 'btn-menu', 'aria-label': 'Apri il menu', 'aria-expanded': 'false', 'aria-controls': 'cassetto', onclick: apriCassetto }, icona('menu'), 'Menu');
    D.testa = h('header', { class: 'testa-tel' }, D.nomeTel, D.menuBtn);
    D.main = h('main', { class: 'contenuto', id: 'contenuto', tabindex: '-1' });
    D.colonna = h('div', { class: 'colonna' }, h('div', { class: 'cima' }, D.fascia, D.testa), D.main);
    app.replaceChildren(D.lato, D.colonna);
    D.velo = h('div', { class: 'velo', onclick: chiudiCassetto });
    D.cassetto = h('nav', { class: 'cassetto', id: 'cassetto', 'aria-label': 'Menu', 'aria-hidden': 'true' });
    D.avviso = h('div', { class: 'avviso', role: 'status', 'aria-live': 'polite' });
    document.body.append(D.velo, D.cassetto, D.avviso);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && D.cassetto.classList.contains('aperto')) chiudiCassetto(); });
  }

  function nomeStudioNodo(grande) {
    return h('div', { class: 'nome-st' }, h('b', grande ? { style: 'font-size:30px;letter-spacing:-0.6px' } : null, nomeStudio()), h('span', null, 'Portale clienti'));
  }
  function vociNodi(chiudi) {
    const att = sezioneDi(S.rotta.pagina);
    return vociMenu(S.io && S.io.puo).map(v => h('a', { class: 'voce' + (att === v.chiave ? ' attiva' : ''), href: '#/' + v.chiave, 'aria-current': att === v.chiave ? 'page' : null, onclick: chiudi || null },
      icona(v.icona), h('span', null, v.nome)));
  }
  function chiNodo() {
    const r = (S.io && S.io.referente) || {};
    return [h('span', { class: 'cerchio' }, iniziali(r.nome)), h('div', { class: 'chi-testo', style: 'min-width:0' }, h('b', null, r.nome || ''), h('span', null, (S.io && S.io.azienda) || ''))];
  }
  /** Aggiorna menu, testa e fascia: dentro = col menu (sessione e informativa letta), altrimenti senza. */
  function aggiornaTelaio(dentro) {
    D.nomeTel.replaceChildren(h('b', null, nomeStudio()), h('span', null, 'Portale clienti'));
    D.menuBtn.hidden = !dentro;
    D.fascia.hidden = !(dentro && anteprima());
    D.lato.classList.toggle('nascosto', !dentro);
    if (!dentro) { D.lato.replaceChildren(); D.cassetto.replaceChildren(); return; }
    D.lato.replaceChildren(nomeStudioNodo(), h('div', { class: 'voci' }, vociNodi()),
      h('div', { class: 'piede-menu' }, h('div', { class: 'riga-chi chi' }, chiNodo()), h('button', { type: 'button', class: 'voce', onclick: esci }, icona('esci', 20), h('span', null, 'Esci'))));
    D.cassetto.replaceChildren(h('div', { class: 'chi' }, chiNodo().map((x, i) => (i === 0 ? (x.classList.add('grande'), x) : x))), h('div', { class: 'voci' }, vociNodi(chiudiCassetto)),
      h('div', { class: 'piede-menu' }, h('span', null, nomeStudio() + (S.studio && S.studio.telefono ? ' · ' + S.studio.telefono : '')),
        h('button', { type: 'button', class: 'voce', onclick: () => { chiudiCassetto(); esci(); } }, icona('esci', 20), h('span', null, 'Esci'))));
  }
  function apriCassetto() {
    D.cassetto.classList.add('aperto'); D.velo.classList.add('aperto');
    D.cassetto.setAttribute('aria-hidden', 'false'); D.menuBtn.setAttribute('aria-expanded', 'true');
    D.colonna.inert = true;
    const primo = D.cassetto.querySelector('.voce');
    if (primo) primo.focus();
  }
  function chiudiCassetto() {
    if (!D.cassetto || !D.cassetto.classList.contains('aperto')) return;
    D.cassetto.classList.remove('aperto'); D.velo.classList.remove('aperto');
    D.cassetto.setAttribute('aria-hidden', 'true'); D.menuBtn.setAttribute('aria-expanded', 'false');
    D.colonna.inert = false;
    D.menuBtn.focus();
  }

  function piedeNodo() {
    const s = S.studio || {};
    const tel = s.telefono ? linkTelefono(s.telefono) : null;
    const mail = collegamentoEmail(s.email) ? h('a', { href: collegamentoEmail(s.email) }, s.email) : s.email || null;
    const riga1 = [s.nome, s.indirizzo, s.partitaIva ? 'P. IVA ' + s.partitaIva : ''].filter(Boolean).join(' · ');
    const riga2 = [tel, mail].filter(Boolean);
    const parti2 = [];
    riga2.forEach((x, i) => { if (i) parti2.push(' · '); parti2.push(x); });
    if (parti2.length) parti2.push(' · ');
    parti2.push(h('a', { class: 'testo-link', href: '#/informativa' }, 'Informativa sulla privacy'));
    return h('footer', { class: 'piede' }, riga1 && h('div', null, riga1), h('div', null, parti2));
  }

  /** Mette una pagina nel contenuto: titolo della scheda, fuoco sul titolo quando si arriva da un'altra pagina. */
  function mettiPagina(nodo, titolo, opz) {
    const o = opz || {};
    const nuova = S.ultimoIndirizzo !== location.hash || o.fuoco;
    const alto = window.scrollY;
    const a = document.activeElement;
    D.main.replaceChildren(nodo, piedeNodo());
    D.nomeTel.replaceChildren(h('b', null, nomeStudio()), h('span', null, 'Portale clienti'));
    document.body.classList.toggle('con-azione', !!nodo.querySelector('.azione-pagina'));
    document.title = (titolo ? titolo + ' · ' : '') + nomeStudio();
    // Il fuoco va sul titolo quando si arriva su una pagina nuova, o quando quello di prima è sparito col ridisegno.
    const perso = !a || a === document.body || !document.contains(a);
    if (nuova) { S.ultimoIndirizzo = location.hash; window.scrollTo(0, 0); } else window.scrollTo(0, alto);
    const t = nodo.querySelector('h1');
    if (t && o.fuoco !== false && (nuova || perso)) t.focus({ preventScroll: true });
  }

  /** La pagina con titolo, "dove", indietro, sottotitolo e il pulsante giallo (in alto sul computer, in basso sul telefono). */
  function pagina(o) {
    const corpo = Array.prototype.slice.call(arguments, 1);
    const dove = (o.indietro || o.dove) && h('div', { class: 'dove' }, o.indietro && h('a', { class: 'tondo', href: o.indietro, 'aria-label': 'Indietro' }, icona('indietro')), o.dove || null);
    const titolo = h('h1', { class: 'titolo', tabindex: '-1' }, o.titolo);
    const azione = o.giallo ? h('div', { class: 'azione-pagina' }, o.giallo) : null;
    const testata = h('div', { class: 'testata' }, h('div', { class: 'sx' }, dove, titolo, o.sotto && h('p', { class: 'sottotitolo' }, o.sotto)), o.gialloSotto ? null : azione);
    return h('div', { class: 'pagina entra' + (o.stretta ? ' stretta' : '') }, testata, corpo, o.gialloSotto ? azione : null);
  }

  let tempoAvviso = null;
  function avviso(testo) {
    clearTimeout(tempoAvviso);
    D.avviso.textContent = testo;
    D.avviso.classList.add('visto');
    tempoAvviso = setTimeout(() => D.avviso.classList.remove('visto'), 3500);
  }
  /** Nell'anteprima dello studio niente parte: l'avviso e basta (il server risponde comunque 403). */
  function fermaAnteprima() {
    if (!anteprima()) return false;
    avviso(TESTO_ANTEPRIMA);
    return true;
  }
  /** Un pulsante occupato non riparte (un doppio tocco non manda due volte). */
  async function occupato(btn, fare) {
    if (btn.getAttribute('aria-disabled') === 'true') return;
    btn.setAttribute('aria-disabled', 'true'); btn.setAttribute('aria-busy', 'true');
    try { await fare(); } finally { btn.removeAttribute('aria-disabled'); btn.removeAttribute('aria-busy'); }
  }

  function foglio(titolo) {
    const corpo = Array.prototype.slice.call(arguments, 1);
    const d = h('dialog', { class: 'foglio', 'aria-labelledby': 'foglio-titolo' });
    d.appendChild(h('div', { class: 'dentro' }, h('div', { class: 'testa-f' }, h('h2', { id: 'foglio-titolo' }, titolo),
      h('button', { type: 'button', class: 'tondo', 'aria-label': 'Chiudi', onclick: () => d.close() }, icona('chiudi', 20))), corpo));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    document.body.appendChild(d);
    d.showModal();
    return d;
  }
  function chiudiFogli() { document.querySelectorAll('dialog.foglio').forEach(d => d.close()); }

  /** Il foglio con un testo da mandare allo studio (domanda, segnalazione, motivo). */
  function foglioTesto(o) {
    const area = h('textarea', { id: 'foglio-testo', maxlength: String(o.max || 2000) });
    area.value = o.valore || '';
    const err = errore('foglio-err');
    let d = null;
    const btn = h('button', { type: 'button', class: 'principale' }, o.giallo);
    btn.addEventListener('click', () => occupato(btn, async () => {
      const t = area.value.trim();
      if (!t && o.vuoto) { err.metti(o.vuoto); area.setAttribute('aria-invalid', 'true'); area.focus(); return; }
      if (fermaAnteprima()) return;
      const r = await o.manda(t);
      if (r.ok) { d.close(); avviso(o.fatto); if (o.dopo) o.dopo(r); return; }
      if (gestioneGenerale(r, false)) { d.close(); return; }
      err.metti(r.rete ? TESTO_RETE : r.errore);
    }));
    d = foglio(o.titolo, h('div', { class: 'campo' }, h('label', { for: 'foglio-testo' }, o.etichetta), area), err.el, btn);
    area.setAttribute('aria-describedby', 'foglio-err');
    area.focus();
  }

  // ------------------------------------------------------------------------------------------------------- esiti generali

  /** Le risposte che cambiano pagina da sole. Per le letture anche "il portale non risponde". true = gestita. */
  function gestioneGenerale(r, lettura, riprova) {
    if (r.ok) return false;
    if (r.spento || (Number(r.stato) === 503 && r.spento)) { pSpento(); return true; }
    if (Number(r.stato) === 426 || r.ricarica) { pRicarica(r.errore); return true; }
    if (Number(r.stato) === 401 && r.accesso === false) { sessioneScaduta(r.errore); return true; }
    if (lettura && (r.rete || Number(r.stato) >= 500)) { pRete(riprova); return true; }
    return false;
  }
  function dimentica() {
    sess.set('sessione', null);
    S.io = null;
    S.cache.clear();
    S.scelte = {}; S.versioni = {}; S.conti = {}; S.accettati = {}; S.moduli = {};
    S.immagini.forEach(x => URL.revokeObjectURL(x.url));
    S.immagini.clear();
  }
  function sessioneScaduta(testo) {
    const dest = destinazioneDa(location.hash);
    dimentica();
    sess.set('dopo', dest || null);
    sess.set('scaduta', testo || 'La sessione è scaduta: entra di nuovo');
    vai('#/entra');
  }
  function vai(hash) {
    if (location.hash === hash) mostra(); else location.hash = hash;
  }
  async function esci(tutti) {
    if (tutti === true) {
      const r = await api('esci', 'POST', { tutti: true });
      if (!r.ok && !gestioneGenerale(r, false)) { avviso(r.rete ? TESTO_RETE : r.errore); return; }
    } else {
      api('esci', 'POST', { tutti: false });
    }
    dimentica();
    sess.set('dopo', null);
    avviso('Sei uscito');
    vai('#/entra');
  }

  /** La strada "studio" (pubblica): nome, telefono, email, indirizzo, partita IVA e se il portale è acceso (§0.3). */
  async function caricaStudio(giro) {
    if (S.studioLetto) return S.studio || {};
    const r = await api('studio', 'GET');
    if (giro !== S.giro) return null;
    if (!r.ok) {
      if (gestioneGenerale(r, true, () => mostra())) return null;
      S.studioLetto = true;               // una risposta 4xx: si va avanti coi dati dell'ultima volta
      return S.studio || {};
    }
    salvaStudio(r.studio);
    S.studioLetto = true;
    if (typeof r.informativa === 'string') S.informativaPubblica = r.informativa;
    if (r.attivo === false) { pSpento(); return null; }
    return S.studio;
  }

  // ------------------------------------------------------------------------------------------------------- il giro delle pagine

  window.addEventListener('hashchange', () => mostra());

  async function mostra() {
    const giro = ++S.giro;
    chiudiCassetto();
    chiudiFogli();
    let rotta = leggiRotta(location.hash);
    // Il token dei link si toglie subito dall'indirizzo (resta in sessionStorage solo finché serve).
    if (rotta.pagina === 'link' && rotta.token) { sess.set('link', rotta.token); history.replaceState(null, '', '#/link'); }
    if (rotta.pagina === 'condiviso' && rotta.token) { sess.set('condiviso', rotta.token); history.replaceState(null, '', '#/condiviso'); }
    S.rotta = rotta;
    // La firma del rapportino è chiara anche col tema scuro (aspetto.md §5).
    if (rotta.pagina === 'firmarap') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    if (!CONFIG.script) return pRete(() => location.reload());
    const sessione = sess.get('sessione');

    if (rotta.pagina === 'condiviso') { aggiornaTelaio(false); return pCondiviso(rotta, giro); }
    if (PAGINE_FUORI.indexOf(rotta.pagina) >= 0) {
      if (sessione && (rotta.pagina === 'entra' || rotta.pagina === 'posta')) return vai('#/casa');
      aggiornaTelaio(false);
      return PAGINE[rotta.pagina](rotta, giro);
    }
    if (rotta.pagina === 'informativa' && !sessione) { aggiornaTelaio(false); return pInformativa(rotta, giro); }
    if (!sessione) {
      sess.set('dopo', destinazioneDa(location.hash) || null);
      return vai('#/entra');
    }
    if (!S.io) {
      aggiornaTelaio(false);
      mettiPagina(h('div', { class: 'pagina' }, segnaposto()), '', { fuoco: false });
      const r = await api('io', 'GET');
      if (giro !== S.giro) return undefined;
      if (!r.ok) {
        if (gestioneGenerale(r, true, () => mostra())) return undefined;
        return pErrore(r.errore);
      }
      S.io = r;
      salvaStudio(r.studio);
    }
    if (S.io.informativa && S.io.informativa.daLeggere && rotta.pagina !== 'informativa') {
      sess.set('dopo', destinazioneDa(location.hash) || sess.get('dopo') || null);
      return vai('#/informativa');
    }
    const dentro = !(rotta.pagina === 'informativa' && S.io.informativa && S.io.informativa.daLeggere);
    aggiornaTelaio(dentro);
    if (!puoAprire(rotta.pagina, S.io.puo)) rotta = { pagina: 'nontrovato' };
    return PAGINE[rotta.pagina](rotta, giro);
  }

  /**
   * Una pagina che legge: mostra subito l'ultima lettura (se ha meno di 5 minuti), poi quella nuova se è cambiata.
   * Le chiavi dei file cambiano a ogni lettura: per decidere se ridisegnare non contano.
   */
  async function leggiPagina(strada, giro, titolo, disegna, opz) {
    const o = opz || {};
    const vecchia = S.cache.get(strada);
    if (vecchia && Date.now() - vecchia.quando < 300000) disegna(vecchia.r);
    else mettiPagina(pagina({ titolo, dove: o.dove, indietro: o.indietro }, segnaposto()), titolo);
    const r = await api(strada, 'GET');
    if (giro !== S.giro) return null;
    if (!r.ok) {
      if (Number(r.stato) === 404) { S.cache.delete(strada); pNonTrovato(); return null; }
      if (gestioneGenerale(r, true, () => mostra())) return null;
      pErrore(r.errore);
      return null;
    }
    S.cache.set(strada, { quando: Date.now(), r });
    const senzaChiavi = x => JSON.stringify(x, (k, v) => (k === 'chiave' ? undefined : v));
    if (!vecchia || senzaChiavi(vecchia.r) !== senzaChiavi(r) || Date.now() - vecchia.quando >= 300000) disegna(r);
    return r;
  }
  function dimenticaLetture() { Array.prototype.slice.call(arguments).forEach(s => S.cache.delete(s)); }

  // ------------------------------------------------------------------------------------------------------- pagine di servizio

  function paginaFuori(nodi, titolo, gialloNodo, stretta) {
    return pagina({ titolo, giallo: gialloNodo, gialloSotto: true, stretta: stretta !== false }, nodi);
  }
  function pSpento() {
    aggiornaTelaio(false);
    const tel = S.studio && S.studio.telefono;
    const titolo = 'Il portale di ' + nomeStudio() + ' non è attivo';
    mettiPagina(pagina({ titolo, stretta: true }, tel && h('p', { class: 'sottotitolo' }, 'Per i documenti chiama lo studio allo ', linkTelefono(tel), '.')), titolo, { fuoco: true });
  }
  function pRete(riprova) {
    aggiornaTelaio(false);
    const tel = S.studio && S.studio.telefono;
    mettiPagina(pagina({ titolo: TESTO_RETE, stretta: true },
      tel && h('p', { class: 'sottotitolo' }, 'Oppure chiama lo studio allo ', linkTelefono(tel)),
      h('div', { class: 'azioni' }, bordo('Riprova', () => (riprova ? riprova() : mostra())))), 'Il portale non risponde', { fuoco: true });
  }
  function pRicarica(testo) {
    aggiornaTelaio(false);
    const t = testo || 'Il portale è stato aggiornato: ricarica la pagina';
    mettiPagina(pagina({ titolo: t, stretta: true }, h('div', { class: 'azioni' }, bordo('Ricarica la pagina', () => location.reload()))), t, { fuoco: true });
  }
  function pErrore(testo) {
    mettiPagina(pagina({ titolo: testo || 'Qualcosa non è andato' }, h('div', { class: 'azioni' }, bordo('Riprova', () => mostra()))), testo, { fuoco: true });
  }
  function pNonTrovato() {
    if (S.io) aggiornaTelaio(true);
    mettiPagina(pagina({ titolo: 'Non trovato' }, h('p', { class: 'sottotitolo' }, "Questa pagina non c'è, o non è per te."),
      h('div', { class: 'azioni' }, h('a', { class: 'bordo', href: '#/casa' }, 'Torna alla casa'))), 'Non trovato', { fuoco: true });
  }

  // ------------------------------------------------------------------------------------------------------- entrare

  /** Dopo codice, link o azienda: la sessione nuova, poi l'informativa se va letta, poi dove si voleva andare. */
  function entrato(r) {
    const dest = r.destinazione !== undefined && r.destinazione !== null && r.destinazione !== '' ? r.destinazione : sess.get('dopo') || '';
    dimentica();
    sess.set('sessione', r.sessione);
    ['scegli', 'link', 'frase', 'inviataIl', 'scaduta', 'pre'].forEach(k => sess.set(k, null));
    sess.set('dopo', dest || null);
    if (r.informativa) return vai('#/informativa');
    sess.set('dopo', null);
    return vai(indirizzoDaDestinazione(dest));
  }
  /** Con più aziende per la stessa email: la scelta (§3.6). La sessione provvisoria, se il server la dà, si tiene. */
  function scegliAzienda(r) {
    if (r.sessione) sess.set('sessione', r.sessione);
    sess.set('scegli', JSON.stringify(r.scegli || []));
    if (r.destinazione) sess.set('dopo', r.destinazione);
    vai('#/azienda');
  }
  function esitoIngresso(r) {
    if (r.ok && Array.isArray(r.scegli) && r.scegli.length) { scegliAzienda(r); return true; }
    if (r.ok && r.sessione) { entrato(r); return true; }
    return false;
  }

  async function pEntra(rotta, giro) {
    const studio = await caricaStudio(giro);
    if (!studio) return;
    const err = errore('err-email');
    const box = h('div');
    const campo = h('input', { id: 'c-email', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', 'aria-describedby': 'err-email', value: sess.get('email') || '' });
    const scaduta = sess.get('scaduta');
    sess.set('scaduta', null);
    const btn = h('button', { type: 'submit', class: 'principale', form: 'f-entra' }, 'Mandami il link');
    const manda = () => occupato(btn, async () => {
      const email = campo.value.trim();
      err.metti(''); rimetti(box); campo.removeAttribute('aria-invalid');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.metti("Scrivi un'email intera, per esempio nome@azienda.it"); campo.setAttribute('aria-invalid', 'true'); campo.focus(); return; }
      pre();
      const r = await api('entra', 'POST', { email, destinazione: sess.get('dopo') || '' });
      if (giro !== S.giro) return;
      if (r.ok) {
        sess.set('email', email); sess.set('frase', r.frase || ''); sess.set('inviataIl', String(Date.now()));
        vai('#/posta');
        return;
      }
      if (gestioneGenerale(r, false)) return;
      if (Number(r.stato) === 400) { err.metti(r.errore); campo.setAttribute('aria-invalid', 'true'); return; }
      inBox(box, boxErrore(r));
    });
    const form = h('form', { id: 'f-entra', novalidate: true, onsubmit: e => { e.preventDefault(); manda(); } },
      h('div', { class: 'campo' }, h('label', { for: 'c-email' }, 'La tua email'), campo), err.el);
    const titolo = nomeStudio();
    mettiPagina(pagina({ titolo, sotto: 'Portale clienti', giallo: btn, gialloSotto: true, stretta: true },
      scaduta && h('div', { class: 'fascia giallo', role: 'status' }, scaduta), form, box), 'Entra');
    if (!telefonoTouch()) campo.focus();
  }

  async function pPosta(rotta, giro) {
    const email = sess.get('email');
    if (!email) return vai('#/entra');
    const studio = await caricaStudio(giro);
    if (!studio) return;
    const frase = sess.get('frase') || ('Se ' + email + " è tra gli indirizzi abilitati, ti è arrivata un'email con un link e un codice. Valgono 10 minuti.");
    const fraseNodo = h('p', { class: 'sottotitolo' }, frase);
    const err = errore('err-codice');
    const box = h('div');
    const campo = h('input', { id: 'c-codice', class: 'codice-in', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', 'aria-describedby': 'err-codice' });
    campo.addEventListener('input', () => { const v = campo.value.replace(/\D/g, '').slice(0, 6); if (v !== campo.value) campo.value = v; });
    const btn = h('button', { type: 'submit', class: 'principale', form: 'f-codice' }, 'Entra');
    const manda = () => occupato(btn, async () => {
      err.metti(''); rimetti(box); campo.removeAttribute('aria-invalid');
      const codice = campo.value.trim();
      if (!/^\d{6}$/.test(codice)) { err.metti('Il codice ha 6 cifre: lo trovi nell\'email'); campo.setAttribute('aria-invalid', 'true'); campo.focus(); return; }
      const r = await api('codice', 'POST', { email, codice });
      if (giro !== S.giro) return;
      if (esitoIngresso(r)) return;
      if (r.ok) { inBox(box, boxErrore({ errore: 'Qualcosa non è andato: chiedi un\'email nuova' })); return; }
      if (gestioneGenerale(r, false)) return;
      if (Number(r.stato) === 401 || Number(r.stato) === 429 || Number(r.stato) === 400) { err.metti(r.errore); campo.setAttribute('aria-invalid', 'true'); campo.select(); return; }
      inBox(box, boxErrore(r));
    });
    // "Non è arrivata? Mandala di nuovo": attivo 60 secondi dopo l'ultima email chiesta.
    const nuova = testoLink('Non è arrivata? Mandala di nuovo', () => occupato(nuova, async () => {
      const r = await api('entra', 'POST', { email, destinazione: sess.get('dopo') || '' });
      if (r.ok) { sess.set('frase', r.frase || frase); fraseNodo.textContent = r.frase || frase; sess.set('inviataIl', String(Date.now())); aggiornaNuova(); avviso('Fatto: controlla la posta'); return; }
      if (gestioneGenerale(r, false)) return;
      inBox(box, boxErrore(r));
    }));
    function aggiornaNuova() {
      const passati = Date.now() - Number(sess.get('inviataIl') || 0);
      nuova.disabled = passati < 60000;
      if (nuova.disabled) setTimeout(() => { if (giro === S.giro) aggiornaNuova(); }, Math.max(500, 60000 - passati));
    }
    aggiornaNuova();
    const form = h('form', { id: 'f-codice', novalidate: true, onsubmit: e => { e.preventDefault(); manda(); } },
      h('div', { class: 'campo' }, h('label', { for: 'c-codice' }, 'Codice'), campo), err.el);
    mettiPagina(pagina({ titolo: 'Controlla la posta', giallo: btn, gialloSotto: true, stretta: true }, fraseNodo, form, box,
      h('div', { class: 'azioni', style: 'justify-content:space-between' }, nuova, h('a', { class: 'testo-link', href: '#/entra' }, "Usa un'altra email"))), 'Controlla la posta');
    if (!telefonoTouch()) campo.focus();
  }

  async function pLink(rotta, giro) {
    const token = sess.get('link');
    if (!token) return vai('#/entra');
    const studio = await caricaStudio(giro);
    if (!studio) return;
    const box = h('div');
    const btn = h('button', { type: 'button', class: 'principale' }, 'Entra nel portale');
    btn.addEventListener('click', () => occupato(btn, async () => {
      rimetti(box);
      const r = await api('link', 'POST', { token });
      if (giro !== S.giro) return;
      if (esitoIngresso(r)) return;
      if (gestioneGenerale(r, false)) return;
      if (Number(r.stato) === 401) return linkScaduto(r, token, giro);
      inBox(box, boxErrore(r));
    }));
    const titolo = 'Entra nel portale di ' + nomeStudio();
    mettiPagina(paginaFuori([box], titolo, btn), titolo);
  }
  function linkScaduto(r, token, giro) {
    const box = h('div');
    const titolo = r.errore || 'Questo link non vale più';
    let g;
    if (r.nuovo) {
      g = h('button', { type: 'button', class: 'principale' }, 'Mandami un link nuovo');
      g.addEventListener('click', () => occupato(g, async () => {
        rimetti(box);
        const x = await api('link-nuovo', 'POST', { token });
        if (giro !== S.giro) return;
        if (x.ok) {
          sess.set('link', null);
          g.parentNode.remove();
          document.body.classList.remove('con-azione');
          inBox(box, h('div', { class: 'fascia verde', role: 'status' }, icona('spunta', 18), x.frase || 'Ti abbiamo mandato un link nuovo'),
            h('div', { class: 'azioni' }, h('a', { class: 'testo-link', href: '#/entra' }, "Torna all'ingresso")));
          return;
        }
        if (gestioneGenerale(x, false)) return;
        inBox(box, boxErrore(x));
      }));
    } else {
      sess.set('link', null);
      g = gialloLink("Torna all'ingresso", '#/entra');
    }
    mettiPagina(paginaFuori([box], titolo, g), titolo, { fuoco: true });
  }

  async function pAzienda(rotta, giro) {
    let lista = [];
    try { lista = JSON.parse(sess.get('scegli') || '[]'); } catch (e) { lista = []; }
    if (!lista.length) return vai('#/entra');
    const st = await caricaStudio(giro);
    if (!st) return;
    const box = h('div');
    const righe = lista.map(a => {
      const b = riga({ icona: 'casa', t1: a.azienda, onclick: () => occupato(b, async () => {
        rimetti(box);
        const r = await api('azienda', 'POST', { n: a.n });
        if (giro !== S.giro) return;
        if (r.ok && r.sessione) { sess.set('scegli', null); entrato(r); return; }
        if (gestioneGenerale(r, false)) return;
        inBox(box, boxErrore(r));
      }) });
      return b;
    });
    mettiPagina(paginaFuori([schedaRighe(righe), box], 'Per quale azienda?'), 'Per quale azienda?');
  }

  async function pInformativa(rotta, giro) {
    const dentro = !!S.io;
    const daLeggere = dentro && S.io.informativa && S.io.informativa.daLeggere;
    if (!dentro) { const st = await caricaStudio(giro); if (!st) return; }
    // L'informativa completa (PORTALE_INFORMATIVA, scritta dal consulente) la dà il server: io.informativa.testo, o
    // senza sessione la strada "studio". Se è uguale al riassunto (il testo di partenza) il collegamento non serve.
    const riassunto = testoInformativa(S.studio, dentro ? S.io.azienda : '');
    const grezzo = dentro ? S.io.informativa && S.io.informativa.testo : S.informativaPubblica;
    const pulito = t => String(t || '').replace(/\s+/g, ' ').trim();
    const completa = typeof grezzo === 'string' && pulito(grezzo) && pulito(grezzo) !== pulito(riassunto) ? grezzo : '';
    const tutta = h('div', { class: 'scheda', hidden: true }, h('p', { class: 'testo', style: 'white-space:pre-wrap' }, completa));
    const corpo = [h('div', { class: 'scheda' }, h('p', { class: 'testo' }, riassunto)),
      completa ? testoLink("Leggi l'informativa completa", e => { tutta.hidden = false; e.currentTarget.remove(); }) : null, tutta];
    if (!daLeggere) {
      return mettiPagina(pagina({ titolo: 'Informativa sulla privacy', stretta: !dentro }, corpo), 'Informativa sulla privacy');
    }
    const box = h('div');
    const btn = h('button', { type: 'button', class: 'principale' }, 'Ho letto, entra');
    btn.addEventListener('click', () => occupato(btn, async () => {
      rimetti(box);
      const r = await api('informativa', 'POST', {});
      if (giro !== S.giro) return;
      if (r.ok) {
        S.io.informativa.daLeggere = false;
        const dest = sess.get('dopo') || '';
        sess.set('dopo', null);
        vai(indirizzoDaDestinazione(dest));
        return;
      }
      if (gestioneGenerale(r, false)) return;
      inBox(box, boxErrore(r));
    }));
    corpo.push(box);
    mettiPagina(pagina({ titolo: 'Prima di entrare', giallo: btn, gialloSotto: true, stretta: true }, corpo), 'Prima di entrare');
  }

  // ------------------------------------------------------------------------------------------------------- la casa

  async function pCasa(rotta, giro) {
    const io = S.io;
    const titolo = saluto(new Date().getHours()) + ', ' + ((io.referente && io.referente.nome) || '');
    await leggiPagina('casa', giro, titolo, r => {
      const iconaDi = t => ({ preventivo: 'preventivo', contratto: 'doc', rapportino: 'firma', documento: 'doc', fattura: 'fattura', richiesta: 'chiave', ticket: 'chiave' })[t] || 'doc';
      const daFare = (r.daFare || []).map(x => riga({ icona: iconaDi(x.tipo), coloreIcona: 'giallo', t1: x.titolo, t2: x.dettaglio, href: indirizzoDiCosa(x.tipo, x.id) }));
      const novita = (r.novita || []).map(x => riga({ icona: iconaDi(x.tipo), t1: x.titolo, t2: [x.dettaglio, quandoIt(x.quando, oggi())].filter(Boolean).join(' · '), pills: [pillNuovo()], href: indirizzoDiCosa(x.tipo, x.id) }));
      const conteggi = r.conteggi || {};
      const riquadri = vociMenu(io.puo).filter(v => v.chiave !== 'casa' && v.chiave !== 'accesso').map(v =>
        h('a', { class: 'num-box', href: '#/' + v.chiave }, h('b', null, String(conteggi[v.chiave] || 0)), h('span', null, v.breve)));
      const g = io.puo && io.puo.richieste >= 2 ? gialloLink("Nuova richiesta d'intervento", '#/richieste/nuova') : null;
      mettiPagina(pagina({ titolo, sotto: io.azienda, giallo: g },
        daFare.length ? sez('Da fare', schedaRighe(daFare)) : null,
        novita.length ? sez('Novità', schedaRighe(novita)) : null,
        riquadri.length ? h('div', { class: 'riquadri' }, riquadri) : null), 'Casa');
    });
  }

  // ------------------------------------------------------------------------------------------------------- preventivi

  async function pPreventivi(rotta, giro) {
    await leggiPagina('preventivi', giro, 'Preventivi e contratti', r => {
      const pv = (r.preventivi || []).map(p => riga({ icona: 'preventivo', t1: p.etichetta, t2: p.oggetto, t3: [dataIt(p.data), euro(p.totale)].join(' · '),
        pills: [pill(p.statoVisto), p.nuovo ? pillNuovo() : null], href: indirizzo('preventivo', p.id) }));
      const ct = (r.contratti || []).map(c => riga({ icona: 'doc', t1: c.numero, t2: c.titolo,
        t3: c.statoVisto === 'Disdetto' ? 'fino al ' + dataIt(c.al) : 'dal ' + dataIt(c.dal) + (c.al ? ' al ' + dataIt(c.al) : ''), pills: [pill(c.statoVisto)] }));
      mettiPagina(pagina({ titolo: 'Preventivi e contratti' }, schedaRighe(pv, 'Nessun preventivo'), ct.length ? sez('Contratti', schedaRighe(ct)) : null), 'Preventivi e contratti');
    });
  }

  /** Il conto che si vede: quello del server per le scelte di adesso (anteprima), se no quello della lettura. */
  function contoAttuale(p) {
    const c = S.conti[p.id];
    const scelte = S.scelte[p.id];
    if (c && scelte && jsonOrdinato(c.scelte) === jsonOrdinato(scelte)) return c;
    return { conti: p.conti || {}, scadenzePagamento: p.scadenzePagamento || [], scelte: scelteIniziali(p) };
  }
  function nodoConti(conto) {
    const k = conto.conti || {};
    const righe = [];
    if (Number(k.scontoDaPercentuale) > 0 || Number(k.scontoEuro) > 0) {
      righe.push(contiRiga('Totale delle voci', euro(k.sommaVoci)));
      if (Number(k.scontoDaPercentuale) > 0) righe.push(contiRiga('Sconto', '−' + euro(k.scontoDaPercentuale)));
      if (Number(k.scontoEuro) > 0) righe.push(contiRiga('Sconto', '−' + euro(k.scontoEuro)));
    }
    righe.push(contiRiga('Imponibile', euro(k.imponibile)));
    righe.push(contiRiga('Contributo integrativo ' + numero(k.eppiPercentuale) + '%', euro(k.contributo)));
    righe.push(contiRiga('IVA ' + numero(k.ivaPercentuale) + '%', euro(k.iva)));
    righe.push(h('div', { class: 'conti-r tot', 'aria-live': 'polite' }, h('span', null, 'Totale'), h('b', null, euro(k.totale))));
    return righe;
  }
  function nodoPagamenti(conto) {
    const l = conto.scadenzePagamento || [];
    return l.length ? sez('Pagamenti', schedaRighe(l.map(s => riga({ t1: s.descrizione, quanto: euro(s.importo) })))) : null;
  }
  /** Chiede al server il conto per le scelte di adesso (§7.3: i conti li fa solo lui). */
  async function chiediConto(p) {
    const scelte = Object.assign({}, S.scelte[p.id] || scelteIniziali(p));
    const r = await api('preventivi/' + p.id + '/anteprima', 'POST', { scelte });
    if (r.ok) S.conti[p.id] = { scelte, conti: r.conti || {}, scadenzePagamento: r.scadenzePagamento || [] };
    return r;
  }

  async function pPreventivo(rotta, giro) {
    const strada = 'preventivi/' + rotta.id;
    await leggiPagina(strada, giro, 'Preventivo', r => disegnaPreventivo(r.preventivo, giro), { dove: 'Preventivi e contratti', indietro: '#/preventivi' });
  }
  function disegnaPreventivo(p, giro) {
    if (!p) return pNonTrovato();
    const daAccettare = p.stato === 'da_accettare';
    // Le scelte del cliente restano finché il preventivo è lo stesso (versione); accettato o cambiato: quelle vere.
    if (!daAccettare || !S.scelte[p.id] || S.versioni[p.id] !== p.versione) { S.scelte[p.id] = scelteIniziali(p); S.versioni[p.id] = p.versione; delete S.conti[p.id]; }
    const contiBox = h('div', { class: 'scheda conti' });
    const pagamentiBox = h('div');
    const vociNodi = new Map();
    const rinfresca = () => {
      const conto = contoAttuale(p);
      rimetti(contiBox, nodoConti(conto));
      rimetti(pagamentiBox, nodoPagamenti(conto));
      vociNodi.forEach((nodo, v) => {
        const dentro = inclusa(v, S.scelte[p.id]);
        nodo.el.classList.toggle('esclusa', !dentro);
        if (nodo.input) nodo.input.checked = dentro;
        if (nodo.stato) nodo.stato.textContent = dentro ? '' : ' · non inclusa';
      });
      gruppiNessuna.forEach((inp, g) => { inp.checked = !vociDi(p).some(x => gruppoDi(x) === g && S.scelte[p.id][String(x.id)]); });
    };
    let giroConto = 0;
    const cambia = async nuove => {
      S.scelte[p.id] = nuove;
      rinfresca();
      contiBox.classList.add('aspetta');
      const n = ++giroConto;
      const r = await chiediConto(p);
      if (n !== giroConto || giro !== S.giro) return;
      contiBox.classList.remove('aspetta');
      if (r.ok) rinfresca();
      else if (!gestioneGenerale(r, false)) avviso(r.rete ? TESTO_RETE : r.errore);
    };
    const gruppiNessuna = new Map();
    const sezioni = (p.sezioni || []).map((s, i) => {
      const nodi = [];
      const voci = s.voci || [];
      voci.forEach((v, j) => {
        const g = gruppoDi(v);
        const dentro = inclusa(v, S.scelte[p.id]);
        const idv = 'v-' + v.id;
        const statoSpan = h('span', null, dentro ? '' : ' · non inclusa');
        let input = null;
        let scelta = null;
        if (g && (j === 0 || gruppoDi(voci[j - 1]) !== g)) nodi.push(h('div', { class: 'gruppo-alt' }, 'Una di queste · ' + g));
        if (daAccettare && v.facoltativa && !g) {
          input = h('input', { type: 'checkbox', class: 'casella', id: idv, checked: dentro, onchange: e => cambia(scegli(p, S.scelte[p.id], v.id, e.target.checked)) });
          scelta = h('label', { class: 'scelta', for: idv }, input, 'La voglio');
        } else if (daAccettare && g) {
          input = h('input', { type: 'radio', class: 'cerchio-sc', name: 'alt-' + i + '-' + g, id: idv, checked: dentro, 'aria-label': 'Scegli: ' + (v.descrizione || ''),
            onchange: e => { if (e.target.checked) cambia(scegli(p, S.scelte[p.id], v.id, true)); } });
        }
        const el = h('div', { class: 'voce-pv' + (dentro ? '' : ' esclusa') },
          daAccettare && g ? h('label', { class: 'segno-alt', for: idv }, input) : null,
          h('span', { class: 'corpo' }, h('label', { class: 't1', for: daAccettare && g ? idv : null }, v.descrizione),
            h('span', { class: 't2' }, dettaglioVoce(v), v.facoltativa && !g ? ' · facoltativa' : '', statoSpan), scelta),
          h('span', { class: 'quanto' }, euro(v.importo)));
        vociNodi.set(v, { el, input, stato: statoSpan });
        nodi.push(el);
        if (daAccettare && g && (j === voci.length - 1 || gruppoDi(voci[j + 1]) !== g)) {
          const idn = 'nessuna-' + i + '-' + j;
          const inp = h('input', { type: 'radio', class: 'cerchio-sc', name: 'alt-' + i + '-' + g, id: idn, onchange: e => { if (e.target.checked) cambia(scegli(p, S.scelte[p.id], null, false, g)); } });
          gruppiNessuna.set(g, inp);
          nodi.push(h('div', { class: 'voce-pv' }, h('label', { class: 'segno-alt', for: idn }, inp), h('span', { class: 'corpo' }, h('label', { class: 't1', for: idn }, 'Nessuna di queste'))));
        }
      });
      return sez(s.titolo || 'Voci', h('div', { class: 'scheda', style: 'padding:4px 18px;gap:0' }, nodi));
    });
    rinfresca();

    const studio = p.studio || {};
    const chiuse = [
      p.condizioni && ['Condizioni', p.condizioni],
      p.complessita && ['Complessità', COMPLESSITA[p.complessita] || p.complessita],
      p.oneriPrevisti && ['Oneri', p.oneriPrevisti],
      (studio.titoli || studio.polizza) && ['Titoli e polizza', [studio.titoli, studio.polizza].filter(Boolean).join('\n')],
    ].filter(Boolean).map(x => h('details', { class: 'chiuso' }, h('summary', null, x[0], icona('freccia', 18)), h('p', { class: 'testo' }, x[1])));

    const puo = (S.io && S.io.puo) || {};
    const stato = h('div', { class: 'stato-riga' }, pill(p.statoVisto), daAccettare && p.scadenza ? h('span', { class: 'calmo' }, 'scade il ' + dataIt(p.scadenza)) : null);
    let accettazione = null;
    if (p.accettazione) {
      const a = p.accettazione;
      accettazione = h('div', { class: 'scheda', style: 'border-color:var(--verde-t)' },
        h('b', { style: 'color:var(--verde-t)' }, 'Accettato il ' + dataIt(a.il) + (oraIt(a.il) ? ' alle ' + oraIt(a.il) : '') + (a.da ? ' da ' + a.da : '')),
        a.firma && a.firma.chiave ? vistaFirma(a.firma.chiave, 'Firma di ' + (a.da || 'chi ha accettato')) : null);
    }
    const scaduto = p.stato === 'scaduto' ? h('div', { class: 'fascia ambra' }, 'Scaduto il ' + dataIt(p.scadenza)) : null;
    const domanda = (titolo) => foglioTesto({ titolo, etichetta: 'La tua domanda allo studio', giallo: 'Manda la domanda', vuoto: 'Scrivi la domanda', fatto: 'Domanda mandata allo studio',
      manda: t => api('preventivi/' + p.id + '/domanda', 'POST', { testo: t }) });
    const azioni = h('div', { class: 'azioni' },
      p.pdf && p.pdf.chiave ? bordo('Scarica il PDF', e => occupato(e.currentTarget, () => scarica(p.pdf.chiave, p.pdf.nome)), 'scarica')
        : bordo('Stampa o salva in PDF', e => occupato(e.currentTarget, () => stampaPreventivo(p)), 'stampa'),
      p.stato === 'scaduto' ? bordo('Chiedi un aggiornamento', () => domanda('Chiedi un aggiornamento')) : null,
      daAccettare ? testoLink('Ho una domanda', () => domanda('Ho una domanda')) : null,
      daAccettare && puo.preventivi >= 2 ? testoLink('Non mi interessa', () => foglioTesto({ titolo: 'Non mi interessa', etichetta: 'Perché, se vuoi dirlo allo studio', giallo: 'Non mi interessa',
        fatto: 'Fatto: lo studio lo sa', max: 500, manda: t => api('preventivi/' + p.id + '/rifiuta', 'POST', { motivo: t }),
        dopo: () => { dimenticaLetture('preventivi', 'casa', 'preventivi/' + p.id); mostra(); } })) : null);
    // Nell'anteprima dello studio il giallo c'è, ma il tocco dice solo che è un'anteprima (§12.5).
    const g = p.puoAccettare && !anteprima() ? gialloLink('Accetta il preventivo', indirizzo('accetta', p.id))
      : anteprima() && daAccettare && puo.preventivi >= 2 ? h('button', { type: 'button', class: 'principale', onclick: fermaAnteprima }, 'Accetta il preventivo') : null;
    mettiPagina(pagina({ titolo: p.etichetta, dove: 'Preventivi e contratti', indietro: '#/preventivi', sotto: p.oggetto, giallo: g },
      stato, accettazione, scaduto, p.introduzione ? h('p', { class: 'testo' }, p.introduzione) : null, sezioni, contiBox, pagamentiBox, chiuse, azioni), p.etichetta);
    // Le scelte cambiate prima (si torna sulla pagina): il conto giusto lo dà il server.
    if (daAccettare && jsonOrdinato(S.scelte[p.id]) !== jsonOrdinato(scelteIniziali(p)) && !(S.conti[p.id] && jsonOrdinato(S.conti[p.id].scelte) === jsonOrdinato(S.scelte[p.id]))) cambia(S.scelte[p.id]);
  }

  async function pAccetta(rotta, giro) {
    const strada = 'preventivi/' + rotta.id;
    const vecchia = S.cache.get(strada);
    let p = vecchia && Date.now() - vecchia.quando < 300000 ? vecchia.r.preventivo : null;
    if (!p) {
      mettiPagina(pagina({ titolo: 'Accetta il preventivo', indietro: indirizzo('preventivo', rotta.id) }, segnaposto()), 'Accetta il preventivo');
      const r = await api(strada, 'GET');
      if (giro !== S.giro) return;
      if (!r.ok) {
        if (Number(r.stato) === 404) return pNonTrovato();
        if (gestioneGenerale(r, true, () => mostra())) return;
        return pErrore(r.errore);
      }
      S.cache.set(strada, { quando: Date.now(), r });
      p = r.preventivo;
    }
    if (!p || !p.puoAccettare) return vai(indirizzo('preventivo', rotta.id));
    if (!S.scelte[p.id]) S.scelte[p.id] = scelteIniziali(p);
    const scelte = S.scelte[p.id];
    const mod = S.moduli['accetta' + p.id] || (S.moduli['accetta' + p.id] = { nome: (S.io.referente && S.io.referente.nome) || '', letto: false, firma: { tratti: [], punti: 0 } });
    const totaleNodo = h('b', null, euro(contoAttuale(p).conti.totale));
    if (!(S.conti[p.id] && jsonOrdinato(S.conti[p.id].scelte) === jsonOrdinato(scelte))) {
      totaleNodo.style.opacity = '.45';
      chiediConto(p).then(r => { if (giro !== S.giro) return; totaleNodo.style.opacity = ''; if (r.ok) totaleNodo.textContent = euro(r.conti.totale); });
    }
    const errNome = errore('err-nome');
    const errLetto = errore('err-letto');
    const errFirma = errore('err-firma');
    const box = h('div');
    const nome = h('input', { id: 'a-nome', autocomplete: 'name', value: mod.nome, 'aria-describedby': 'err-nome', oninput: e => { mod.nome = e.target.value; } });
    const letto = h('input', { type: 'checkbox', class: 'casella', id: 'a-letto', checked: mod.letto, 'aria-describedby': 'err-letto', onchange: e => { mod.letto = e.target.checked; } });
    const firma = creaFirma(mod.firma);
    const btn = h('button', { type: 'button', class: 'principale' }, 'Firma e accetta');
    btn.addEventListener('click', () => occupato(btn, async () => {
      [errNome, errLetto, errFirma].forEach(x => x.metti('')); rimetti(box);
      let primo = null;
      if (!mod.nome.trim()) { errNome.metti('Scrivi il nome e cognome di chi accetta'); primo = primo || nome; }
      if (!mod.letto) { errLetto.metti('Spunta «Ho letto le condizioni»'); primo = primo || letto; }
      if (firma.punti() < PUNTI_MINIMI) { errFirma.metti('Manca la firma'); primo = primo || firma.el; }
      if (primo) { if (primo === firma.el) firma.focus(); else primo.focus(); return; }
      if (fermaAnteprima()) return;
      const r = await api('preventivi/' + p.id + '/accetta', 'POST', { scelte: Object.assign({}, scelte), nome: mod.nome.trim(), firma: firma.png(), letto: true, versione: p.versione });
      if (giro !== S.giro) return;
      if (r.ok) {
        S.accettati[p.id] = r.preventivo || null;
        delete S.moduli['accetta' + p.id];
        dimenticaLetture('preventivi', 'casa', strada);
        vai(indirizzo('accettato', p.id));
        return;
      }
      if (gestioneGenerale(r, false)) return;
      if (r.cambiato || Number(r.stato) === 409) {
        dimenticaLetture(strada);
        inBox(box, boxErrore(r), h('div', { class: 'azioni' }, h('a', { class: 'bordo', href: indirizzo('preventivo', p.id) }, 'Guarda la versione nuova')));
        return;
      }
      const t = r.errore || '';
      if (/nome/i.test(t) && !/preventivo/i.test(t)) errNome.metti(t);
      else if (/Ho letto/.test(t)) errLetto.metti(t);
      else if (/firma/i.test(t)) errFirma.metti(t);
      else inBox(box, boxErrore(r));
    }));
    const riassunto = riassuntoScelte(p, scelte).map(x => riga({ t1: x.testo, t2: x.stato }));
    mettiPagina(pagina({ titolo: 'Accetta il preventivo', dove: p.etichetta, indietro: indirizzo('preventivo', p.id), giallo: btn },
      h('div', { class: 'scheda' }, h('div', { class: 'conti-r tot', style: 'border:none;margin:0;padding:0' }, h('span', null, p.etichetta + ' · Totale'), totaleNodo),
        riassunto.length ? h('div', { class: 'righe' }, riassunto) : null),
      h('div', { class: 'campo' }, h('label', { for: 'a-nome' }, 'Nome e cognome di chi accetta'), nome), errNome.el,
      h('label', { class: 'casella-riga', for: 'a-letto' }, letto, h('span', null, 'Ho letto le condizioni e accetto il preventivo ' + p.etichetta)), errLetto.el,
      firma.el, h('div', { class: 'azioni', style: 'justify-content:flex-end' }, bordo('Cancella', () => firma.cancella())), errFirma.el, box), 'Accetta il preventivo');
  }

  async function pAccettato(rotta, giro) {
    let p = S.accettati[rotta.id];
    if (!p) {
      const r = await api('preventivi/' + rotta.id, 'GET');
      if (giro !== S.giro) return;
      if (!r.ok) { if (Number(r.stato) === 404) return pNonTrovato(); if (gestioneGenerale(r, true, () => mostra())) return; return pErrore(r.errore); }
      p = r.preventivo;
    }
    const a = (p && p.accettazione) || {};
    mettiPagina(pagina({ titolo: 'Preventivo accettato' },
      h('div', { class: 'ok-grande' }, icona('spunta', 36, 3)),
      a.il ? h('p', { class: 'sottotitolo' }, (p.etichetta || '') + ' accettato il ' + dataIt(a.il) + (oraIt(a.il) ? ' alle ' + oraIt(a.il) : '') + (a.da ? ' da ' + a.da : '') + '.') : null,
      h('p', { class: 'sottotitolo' }, "Ti abbiamo mandato un'email di conferma"),
      h('div', { class: 'azioni' }, h('a', { class: 'bordo', href: '#/casa' }, 'Torna alla casa'))), 'Preventivo accettato');
  }

  // ------------------------------------------------------------------------------------------------------- rapportini

  async function pRapportini(rotta, giro) {
    await leggiPagina('rapportini', giro, 'Rapportini', r => {
      const sedi = (S.io.sedi || []);
      const lista = (r.rapportini || []).filter(x => !S.filtroRap || x.luogo === S.filtroRap);
      const filtri = sedi.length > 1 ? h('div', { class: 'pillole', role: 'group', 'aria-label': 'Sede' },
        [{ nome: '' }].concat(sedi).map(s => h('button', { type: 'button', 'aria-pressed': String(S.filtroRap === s.nome), onclick: () => { S.filtroRap = s.nome; mostra(); } }, s.nome || 'Tutte'))) : null;
      const righe = lista.map(x => riga({ icona: 'firma', coloreIcona: x.daFirmare ? 'giallo' : 'verde', t1: dataIt(x.data), t2: x.lavoro, t3: [x.luogo, x.numero].filter(Boolean).join(' · '),
        pills: [pill(x.statoVisto), x.nuovo ? pillNuovo() : null], href: indirizzo('rapportino', x.id) }));
      mettiPagina(pagina({ titolo: 'Rapportini' }, filtri, schedaRighe(righe, 'Nessun rapportino')), 'Rapportini');
    });
  }

  function testoOre(x) {
    const ore = n => numero(n) + (Number(n) === 1 ? ' ora' : ' ore');
    return [ore(x.oreLavoro) + ' di lavoro', numero(x.oreViaggio) + ' di viaggio', Number(x.oreExtra) > 0 ? numero(x.oreExtra) + ' extra' : '', numero(x.km) + ' km'].filter(Boolean).join(' · ');
  }

  async function pRapportino(rotta, giro) {
    await leggiPagina('rapportini/' + rotta.id, giro, 'Rapportino', r => {
      const x = r.rapportino;
      if (!x) return pNonTrovato();
      const titolo = 'Rapportino del ' + dataIt(x.data);
      const box = (v, k) => h('div', { class: 'num-box' }, h('b', null, v), h('span', null, k));
      const numeri = [box(numero(x.oreLavoro) + ' h', 'lavoro'), box(numero(x.oreViaggio) + ' h', 'viaggio'), Number(x.oreExtra) > 0 ? box(numero(x.oreExtra) + ' h', 'extra') : null, box(numero(x.km), 'km')].filter(Boolean);
      const i = x.importi;
      const importi = i ? h('div', { class: 'scheda' },
        contiRiga('Ore · ' + euro(i.tariffa) + " all'ora", euro(i.compensoOre)),
        contiRiga('Km · ' + numero(i.km !== undefined ? i.km : x.km) + ' × ' + euro(i.euroKm), euro(i.rimborsoKm)),
        contiRiga('Spese', euro(i.spese)), contiRiga('Totale', euro(i.totale), 'tot')) : null;
      const firma = x.firma ? sez('Firma', h('div', { class: 'scheda' }, x.firma.chiave ? vistaFirma(x.firma.chiave, 'Firma di ' + (x.firmatario || 'chi ha firmato')) : null,
        h('span', { class: 'calmo' }, [x.firmatario, dataOraIt(x.firmatoIl), x.firmaModo === 'portale' ? 'Firmato nel portale' : ''].filter(Boolean).join(' · ')))) : null;
      const azioni = h('div', { class: 'azioni' },
        bordo('Stampa o salva in PDF', e => occupato(e.currentTarget, () => stampaRapportino(x)), 'stampa'),
        testoLink('Segnala un problema', () => foglioTesto({ titolo: 'Segnala un problema', etichetta: 'Cosa non torna', giallo: 'Manda allo studio', vuoto: 'Scrivi cosa non torna',
          fatto: 'Mandato allo studio', manda: t => api('rapportini/' + x.id + '/segnala', 'POST', { testo: t }) })));
      const g = x.puoFirmare && !anteprima() ? gialloLink('Firma il rapportino', indirizzo('firmarap', x.id))
        : anteprima() && x.daFirmare && (S.io.puo || {}).rapportini >= 2 ? h('button', { type: 'button', class: 'principale', onclick: fermaAnteprima }, 'Firma il rapportino') : null;
      mettiPagina(pagina({ titolo, dove: 'Rapportini', indietro: '#/rapportini', giallo: g },
        h('div', { class: 'stato-riga' }, pill(x.statoVisto), h('span', { class: 'calmo' }, x.numero)),
        h('div', { class: 'scheda' }, coppie([['Luogo', x.luogo], ['Commessa', x.commessa], ['Tecnico', x.tecnico], ['Richiesta', x.ticket]])),
        sez('Lavoro', h('div', { class: 'riquadro-grigio' }, x.lavoro)),
        sez('Ore', h('div', { class: 'tre', style: 'grid-template-columns:repeat(' + numeri.length + ',minmax(0,1fr))' }, numeri)),
        importi, firma, azioni), titolo);
    }, { dove: 'Rapportini', indietro: '#/rapportini' });
  }

  async function pFirmaRap(rotta, giro) {
    const strada = 'rapportini/' + rotta.id;
    mettiPagina(pagina({ titolo: 'Firma il rapportino', indietro: indirizzo('rapportino', rotta.id) }, segnaposto()), 'Firma il rapportino');
    const vecchia = S.cache.get(strada);
    let x = vecchia && Date.now() - vecchia.quando < 300000 ? vecchia.r.rapportino : null;
    if (!x) {
      const r = await api(strada, 'GET');
      if (giro !== S.giro) return;
      if (!r.ok) { if (Number(r.stato) === 404) return pNonTrovato(); if (gestioneGenerale(r, true, () => mostra())) return; return pErrore(r.errore); }
      S.cache.set(strada, { quando: Date.now(), r });
      x = r.rapportino;
    }
    if (!x || !x.puoFirmare) return vai(indirizzo('rapportino', rotta.id));
    const mod = S.moduli['firma' + x.id] || (S.moduli['firma' + x.id] = { nome: '', firma: { tratti: [], punti: 0 } });
    const errNome = errore('err-nome');
    const errFirma = errore('err-firma');
    const box = h('div');
    const nome = h('input', { id: 'f-nome', autocomplete: 'name', value: mod.nome, 'aria-describedby': 'err-nome', oninput: e => { mod.nome = e.target.value; } });
    const firma = creaFirma(mod.firma);
    const btn = h('button', { type: 'button', class: 'principale' }, icona('spunta', 22, 2.6), 'Conferma firma');
    btn.addEventListener('click', () => occupato(btn, async () => {
      errNome.metti(''); errFirma.metti(''); rimetti(box);
      if (!mod.nome.trim()) { errNome.metti('Scrivi il nome di chi firma'); nome.focus(); return; }
      if (firma.punti() < PUNTI_MINIMI) { errFirma.metti('Manca la firma'); firma.focus(); return; }
      if (fermaAnteprima()) return;
      const r = await api(strada + '/firma', 'POST', { nome: mod.nome.trim(), firma: firma.png(), versione: x.versione });
      if (giro !== S.giro) return;
      if (r.ok) {
        delete S.moduli['firma' + x.id];
        dimenticaLetture('rapportini', 'casa');
        if (r.rapportino) S.cache.set(strada, { quando: Date.now(), r: { ok: true, rapportino: r.rapportino } }); else dimenticaLetture(strada);
        avviso("Firmato: ti abbiamo mandato un'email di conferma");
        vai(indirizzo('rapportino', x.id));
        return;
      }
      if (gestioneGenerale(r, false)) return;
      if (r.cambiato || Number(r.stato) === 409) {
        dimenticaLetture(strada);
        inBox(box, boxErrore(r), h('div', { class: 'azioni' }, h('a', { class: 'bordo', href: indirizzo('rapportino', x.id) }, 'Guarda di nuovo il rapportino')));
        return;
      }
      const t = r.errore || '';
      if (/nome/i.test(t)) errNome.metti(t); else if (/firma/i.test(t) && !/firmato/i.test(t)) errFirma.metti(t); else inBox(box, boxErrore(r));
    }));
    mettiPagina(pagina({ titolo: 'Firma il rapportino', dove: x.numero, indietro: indirizzo('rapportino', x.id), sotto: [x.luogo, dataIt(x.data)].filter(Boolean).join(' · '), giallo: btn },
      h('div', { class: 'riquadro-grigio' }, x.lavoro, h('br'), h('b', null, testoOre(x))),
      h('div', { class: 'campo' }, h('label', { for: 'f-nome' }, 'Nome di chi firma'), nome), errNome.el,
      firma.el, h('span', { class: 'calmo' }, 'Firmando confermi lavoro e ore del rapportino'), errFirma.el,
      h('div', { class: 'azioni' }, bordo('Cancella', () => firma.cancella())), box), 'Firma il rapportino');
  }

  // ------------------------------------------------------------------------------------------------------- la firma

  /**
   * Il riquadro della firma: dito, penna o mouse (pointer events), bianco anche col tema scuro, alto 220. I tratti stanno
   * in stato (punti normalizzati 0-1) e restano se la pagina si ridisegna. Il PNG si rifà sempre uguale dagli stessi
   * tratti (così "Riprova" manda la stessa richiesta con lo stesso id).
   */
  function creaFirma(stato) {
    const tela = h('canvas', { role: 'img', 'aria-label': 'Riquadro della firma: disegna col dito o col mouse', tabindex: '0' });
    const vuota = h('span', { class: 'vuota', 'aria-hidden': 'true' }, 'Firma qui col dito o col mouse');
    const voce = h('span', { class: 'sr', 'aria-live': 'polite' });
    const el = h('div', { class: 'firma-box' }, h('span', { class: 'linea' }), h('span', { class: 'x', 'aria-hidden': 'true' }, '×'), vuota, tela, voce);
    let attivo = null;
    let dpr = 1;
    const traccia = (c, t, w, a) => {
      c.beginPath();
      t.forEach((q, i) => (i ? c.lineTo(q[0] * w, q[1] * a) : c.moveTo(q[0] * w, q[1] * a)));
      if (t.length === 1) c.lineTo(t[0][0] * w + 0.5, t[0][1] * a + 0.5);
      c.stroke();
    };
    const pennello = (c, spessore) => { c.lineWidth = spessore; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#1B1B1F'; };
    function ridisegna() {
      const c = tela.getContext('2d');
      c.clearRect(0, 0, tela.width, tela.height);
      pennello(c, 2.6 * dpr);
      stato.tratti.forEach(t => traccia(c, t, tela.width, tela.height));
      vuota.hidden = stato.punti > 0;
    }
    function misura() {
      const r = tela.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      tela.width = Math.round(r.width * dpr);
      tela.height = Math.round(r.height * dpr);
      if (!stato.rapporto) stato.rapporto = r.width / r.height;
      ridisegna();
    }
    const punto = e => {
      const r = tela.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    };
    tela.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { tela.setPointerCapture(e.pointerId); } catch (x) { /* niente */ }
      const r = tela.getBoundingClientRect();
      stato.rapporto = r.width / r.height;
      attivo = [punto(e)];
      stato.tratti.push(attivo);
      stato.punti++;
      ridisegna();
    });
    tela.addEventListener('pointermove', e => {
      if (!attivo) return;
      e.preventDefault();
      const tutti = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (tutti.length ? tutti : [e]).forEach(ev => { attivo.push(punto(ev)); stato.punti++; });
      ridisegna();
    });
    const fine = () => {
      if (!attivo) return;
      attivo = null;
      if (stato.punti >= PUNTI_MINIMI) voce.textContent = 'Firma disegnata';
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => tela.addEventListener(n, fine));
    if (window.ResizeObserver) new ResizeObserver(misura).observe(tela); else setTimeout(misura, 0);
    return {
      el,
      focus: () => tela.focus(),
      punti: () => stato.punti,
      cancella() { stato.tratti = []; stato.punti = 0; ridisegna(); voce.textContent = 'Riquadro della firma vuoto'; },
      png() {
        const alto = 220;
        const largo = Math.max(300, Math.min(1000, Math.round(alto * (stato.rapporto || 2.7))));
        const c = document.createElement('canvas');
        c.width = largo; c.height = alto;
        const x = c.getContext('2d');
        x.fillStyle = '#FFFFFF';
        x.fillRect(0, 0, largo, alto);
        pennello(x, 3);
        stato.tratti.forEach(t => traccia(x, t, largo, alto));
        return c.toDataURL('image/png');
      },
    };
  }

  // ------------------------------------------------------------------------------------------------------- file: scaricare, immagini, stampa

  function byteDaBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const MIME_BUONO = /^[a-z]+\/[a-z0-9.+-]{1,100}$/i;
  /** Scarica un file del portale (§0.2): la risposta in base64 diventa un Blob, e un collegamento con download. */
  async function scarica(chiave, nome, strada) {
    const r = await api(strada || 'scarica/' + chiave, 'GET');
    if (!r.ok) {
      if (gestioneGenerale(r, false)) return;
      if (Number(r.stato) === 404) { avviso('Il file non si scarica più da qui: ricarica la pagina'); S.cache.clear(); return; }
      avviso(r.rete ? TESTO_RETE : r.errore);
      return;
    }
    const b64 = String(r.base64 || '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]*$/.test(b64)) { avviso('Il file non si scarica adesso'); return; }
    const blob = new Blob([byteDaBase64(b64)], { type: MIME_BUONO.test(r.mime || '') ? r.mime : 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: r.nome || nome || 'documento' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  /** Un'immagine del portale (firme, foto) da immagine/<chiave>: blob: per la pagina, data: per la stampa. */
  async function immagine(chiave) {
    if (!chiave) return null;
    if (S.immagini.has(chiave)) return S.immagini.get(chiave);
    const r = await api('immagine/' + chiave, 'GET');
    const b64 = String((r && r.base64) || '').replace(/\s+/g, '');
    if (!r.ok || !/^image\/(png|jpeg)$/.test(r.mime || '') || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
    const x = { url: URL.createObjectURL(new Blob([byteDaBase64(b64)], { type: r.mime })), dati: 'data:' + r.mime + ';base64,' + b64 };
    S.immagini.set(chiave, x);
    return x;
  }
  function vistaFirma(chiave, alt) {
    const img = h('img', { alt });
    const box = h('div', { class: 'firma-vista' }, img);
    immagine(chiave).then(x => { if (x) img.src = x.url; else rimetti(box, h('span', { class: 'calmo' }, 'La firma non si vede adesso: ricarica la pagina')); });
    return box;
  }
  /**
   * "Stampa o salva in PDF" (§3.7): lo stesso documenti.js delle app, in un iframe nascosto senza script
   * (sandbox="allow-same-origin allow-modals"), solo coi campi della vista. Il cliente sceglie "Salva come PDF".
   */
  function stampa(html) {
    const vecchia = document.getElementById('cornice-stampa');
    if (vecchia) vecchia.remove();
    const f = h('iframe', { id: 'cornice-stampa', class: 'cornice-stampa', sandbox: 'allow-same-origin allow-modals', title: 'Stampa', 'aria-hidden': 'true', tabindex: '-1' });
    f.addEventListener('load', () => {
      const vai = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { avviso('La stampa non parte da qui: usa Scarica o chiedi il PDF allo studio'); } };
      try { f.contentDocument.fonts.ready.then(vai, vai); } catch (e) { vai(); }
    }, { once: true });
    f.srcdoc = html;
    document.body.appendChild(f);
  }
  function stampaPronta() {
    if (radice.WisperDocumenti && radice.WisperConti) return true;
    avviso('La stampa non è pronta: ricarica la pagina');
    return false;
  }
  async function stampaRapportino(x) {
    if (!stampaPronta()) return;
    const d = perStampaRapportino(x, S.studio, S.io && S.io.azienda);
    let html = radice.WisperDocumenti.rapportino(d.rapportino, d.ana, d.opzioni);
    const im = x.firma && x.firma.chiave ? await immagine(x.firma.chiave) : null;
    html = mettiFirma(html, im && im.dati);
    stampa(html);
  }
  async function stampaPreventivo(p) {
    if (!stampaPronta()) return;
    const conto = contoAttuale(p);
    const d = perStampaPreventivo(p, S.studio, S.io && S.io.azienda, p.stato === 'da_accettare' ? S.scelte[p.id] : null, p.stato === 'da_accettare' ? conto.scadenzePagamento : null);
    let html = radice.WisperDocumenti.preventivo(d.preventivo, d.ana, d.opzioni);
    const a = p.accettazione;
    const im = a && a.firma && a.firma.chiave ? await immagine(a.firma.chiave) : null;
    html = mettiFirma(html, im && im.dati);
    stampa(html);
  }

  /** Legge un file scelto in base64 (senza il "data:...;base64,"). */
  function leggiBase64(file) {
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result || ''); ok(s.slice(s.indexOf(',') + 1)); };
      r.onerror = () => no(r.error);
      r.readAsDataURL(file);
    });
  }
  /** Manda un file allo studio con la strada carica (§0.2, §6.7). Ritorna la risposta del server. */
  async function caricaFile(file, per) {
    let base64;
    try { base64 = await leggiBase64(file); } catch (e) { return { ok: false, errore: 'Non riesco a leggere il file: sceglilo di nuovo' }; }
    return api('carica', 'POST', { nome: file.name, per, base64 }, { attesa: ATTESA_CARICA_MS });
  }
  const telefonoTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  /** Un pulsante che apre la scelta dei file (label + input nascosto, si usa anche con la tastiera). */
  function sceltaFile(o) {
    const input = h('input', { type: 'file', class: 'sr', accept: o.accept, multiple: !!o.multipli, capture: o.capture || null, 'aria-label': o.testo,
      onchange: e => { const l = Array.prototype.slice.call(e.target.files || []); e.target.value = ''; if (l.length) o.scelti(l); } });
    return h('label', { class: o.classe || 'bordo' }, input, o.icona ? icona(o.icona, o.classe === 'zona-file' ? 28 : 18) : null, o.testo, o.sotto || null);
  }
  function miniatura(file, togli) {
    const immagineVera = /^image\/(png|jpeg|gif|webp)$/.test(file.type || '');
    const url = immagineVera ? URL.createObjectURL(file) : '';
    return h('div', { class: 'mini' }, url ? h('img', { src: url, alt: file.name }) : [icona('doc', 22), h('span', null, file.name.length > 18 ? file.name.slice(0, 16) + '…' : file.name)],
      h('button', { type: 'button', class: 'togli', 'aria-label': 'Togli ' + file.name, onclick: () => { if (url) URL.revokeObjectURL(url); togli(); } }, icona('chiudi', 16, 2.6)));
  }

  // ------------------------------------------------------------------------------------------------------- documenti

  async function pDocumenti(rotta, giro) {
    await leggiPagina('documenti', giro, 'Documenti', r => {
      const docs = (r.documenti || []).map(d => riga({ icona: 'doc', t1: d.titolo, t2: [d.categoria, d.revisione, grandezza(d.byte)].filter(Boolean).join(' · '), t3: d.luogo || '',
        pills: d.nuovo ? [pillNuovo()] : null, etichetta: 'Scarica ' + (d.titolo || ''), dx: h('span', { class: 'freccia' }, icona('scarica', 20)),
        onclick: e => { const b = e.currentTarget; if (d.file && d.file.chiave) occupato(b, () => scarica(d.file.chiave, d.nomeFile)); } }));
      const tuoi = (r.tuoi || []).map(t => riga({ icona: 'importa', t1: t.titolo, t2: [t.nomeFile, grandezza(t.byte), quandoIt(t.inviatoIl, oggi())].filter(Boolean).join(' · '),
        t3: t.motivo ? 'Motivo: ' + t.motivo : '', pills: [pill(t.statoVisto)] }));
      const g = S.io.puo && S.io.puo.documenti >= 2 ? gialloLink('Manda un file allo studio', '#/documenti/manda') : null;
      mettiPagina(pagina({ titolo: 'Documenti', giallo: g }, schedaRighe(docs, 'Nessun documento'), sez('Mandati da voi', schedaRighe(tuoi, 'Nessun file mandato'))), 'Documenti');
    });
  }

  function pCarica(rotta, giro) {
    const io = S.io;
    const m = S.moduli.carica || (S.moduli.carica = { file: null, caricamento: null, titolo: '', sede: null, nota: '', notaAperta: false });
    if (m.fatto) {
      delete S.moduli.carica;
      return mettiPagina(pagina({ titolo: 'File mandato', dove: 'Documenti', indietro: '#/documenti' }, h('div', { class: 'ok-grande' }, icona('spunta', 36, 3)),
        h('p', { class: 'sottotitolo' }, 'Ricevuto: lo studio lo guarda e ti dice se lo archivia.'),
        h('div', { class: 'azioni' }, h('a', { class: 'bordo', href: '#/documenti' }, 'Torna ai documenti'))), 'File mandato', { fuoco: true });
    }
    const errFile = errore('err-file');
    const errTitolo = errore('err-titolo');
    const box = h('div');
    const stato = h('p', { class: 'calmo', role: 'status', hidden: true }, 'Sto mandando il file: può volerci un minuto');
    const zona = h('div');
    const scelto = l => {
      const f = l[0];
      const e = erroreFile(f.name, f.size, io.tipiFile, io.fileMaxMb);
      m.file = e ? null : f;
      m.caricamento = null;
      disegnaZona();
      errFile.metti(e);
    };
    function disegnaZona() {
      if (m.file) {
        rimetti(zona, h('div', { class: 'file-scelto' }, icona(/^image\//.test(m.file.type) ? 'foto' : 'doc', 22),
          h('span', { class: 'corpo' }, h('b', null, m.file.name), h('span', { class: 'calmo' }, grandezza(m.file.size))),
          testoLink('Scegli un altro file', () => { m.file = null; m.caricamento = null; disegnaZona(); })));
      } else {
        rimetti(zona, sceltaFile({ classe: 'zona-file', icona: 'importa', testo: 'Scegli il file', accept: acceptDi(io.tipiFile), scelti: scelto }),
          telefonoTouch() ? h('div', { class: 'azioni', style: 'margin-top:10px' }, sceltaFile({ icona: 'foto', testo: 'Fotografa', accept: 'image/*', capture: 'environment', scelti: scelto })) : null);
      }
    }
    disegnaZona();
    const titolo = h('input', { id: 'k-titolo', value: m.titolo, maxlength: '200', 'aria-describedby': 'err-titolo', oninput: e => { m.titolo = e.target.value; } });
    const sedi = io.sedi || [];
    const pillSedi = sedi.length ? h('fieldset', { class: 'domanda' }, h('legend', null, 'Per quale impianto'), h('div', { class: 'pillole' }, sedi.map(s =>
      h('button', { type: 'button', 'aria-pressed': String(m.sede === s.id), onclick: e => { m.sede = m.sede === s.id ? null : s.id; e.currentTarget.parentNode.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(m.sede === sedi[i].id))); } }, s.nome)))) : null;
    const nota = h('div', { class: 'campo', hidden: !m.notaAperta }, h('label', { for: 'k-nota' }, 'Una nota'),
      h('textarea', { id: 'k-nota', maxlength: '2000', value: m.nota, oninput: e => { m.nota = e.target.value; } }));
    const apriNota = testoLink('+ Una nota', e => { m.notaAperta = true; nota.hidden = false; e.currentTarget.remove(); nota.querySelector('textarea').focus(); });
    const btn = h('button', { type: 'button', class: 'principale' }, 'Manda il file');
    btn.addEventListener('click', () => occupato(btn, async () => {
      errFile.metti(''); errTitolo.metti(''); rimetti(box);
      if (!m.file) { errFile.metti('Scegli il file'); return; }
      if (!m.titolo.trim()) { errTitolo.metti('Scrivi di cosa si tratta'); titolo.focus(); return; }
      if (fermaAnteprima()) return;
      stato.hidden = false;
      try {
        if (!m.caricamento) {
          const r1 = await caricaFile(m.file, 'documento');
          if (giro !== S.giro) return;
          if (!r1.ok) {
            if (gestioneGenerale(r1, false)) return;
            if (!r1.rete && /file|tipo|nome|MB|spazio/i.test(r1.errore || '')) errFile.metti(r1.errore); else inBox(box, boxErrore(r1));
            return;
          }
          m.caricamento = r1.caricamento && r1.caricamento.id;
        }
        const r2 = await api('documenti', 'POST', { caricamento: m.caricamento, titolo: m.titolo.trim(), idSede: m.sede, nota: m.nota.trim() });
        if (giro !== S.giro) return;
        if (r2.ok) { m.fatto = true; dimenticaLetture('documenti', 'casa'); pCarica(rotta, giro); return; }
        if (gestioneGenerale(r2, false)) return;
        if (/non c'è più/.test(r2.errore || '')) m.caricamento = null;
        if (/Scrivi/.test(r2.errore || '')) errTitolo.metti(r2.errore); else inBox(box, boxErrore(r2));
      } finally { stato.hidden = true; }
    }));
    mettiPagina(pagina({ titolo: 'Manda un file allo studio', dove: 'Documenti', indietro: '#/documenti', giallo: btn },
      zona, errFile.el, h('div', { class: 'campo' }, h('label', { for: 'k-titolo' }, 'Di cosa si tratta'), titolo), errTitolo.el,
      pillSedi, m.notaAperta ? null : apriNota, nota, stato, box), 'Manda un file allo studio');
  }

  // ------------------------------------------------------------------------------------------------------- fatture

  async function pFatture(rotta, giro) {
    await leggiPagina('fatture', giro, 'Fatture', r => {
      const righe = (r.fatture || []).map(f => riga({ icona: 'fattura', t1: (f.tipo || 'Fattura') + ' ' + f.numero, t2: [dataIt(f.data), euro(f.totale)].join(' · '),
        pills: [pill(f.statoVisto), f.dettaglioStato ? h('span', { class: 'calmo' }, f.dettaglioStato) : null, f.nuovo ? pillNuovo() : null], href: indirizzo('fattura', f.id) }));
      mettiPagina(pagina({ titolo: 'Fatture' }, schedaRighe(righe, 'Nessuna fattura')), 'Fatture');
    });
  }

  async function pFattura(rotta, giro) {
    await leggiPagina('fatture/' + rotta.id, giro, 'Fattura', r => {
      const f = r.fattura;
      if (!f) return pNonTrovato();
      const titolo = (f.tipo || 'Fattura') + ' ' + f.numero;
      const k = f.conti || {};
      const conti = h('div', { class: 'scheda' },
        contiRiga('Compenso', euro(k.compenso)),
        Number(k.contributo) ? contiRiga('Contributo integrativo', euro(k.contributo)) : null,
        Number(k.iva) ? contiRiga('IVA', euro(k.iva)) : null,
        Number(k.anticipazioni) ? contiRiga('Spese anticipate', euro(k.anticipazioni)) : null,
        Number(k.bollo) ? contiRiga('Bollo', euro(k.bollo)) : null,
        contiRiga('Totale', euro(k.totale), 'tot'),
        Number(k.ritenuta) ? contiRiga("Ritenuta d'acconto", '−' + euro(k.ritenuta)) : null,
        contiRiga('Da pagare', euro(f.daPagare), 'netto'));
      const scadenze = (f.scadenze || []).length ? sez('Scadenze', schedaRighe(f.scadenze.map(s => riga({ t1: 'Entro il ' + dataIt(s.data), quanto: euro(s.importo), pills: [pill(s.pagata ? 'Pagata' : 'Da pagare')] })))) : null;
      const pg = f.pagamento;
      const pagare = pg ? sez('Come pagare', h('div', { class: 'scheda' }, coppie([['IBAN', pg.iban], ['Intestatario', pg.intestatario], ['Causale', pg.causale]]),
        h('div', { class: 'azioni' }, bordo('Copia', () => copia(pg.iban, 'IBAN copiato'), 'copia')))) : null;
      const file = h('div', { class: 'azioni' },
        f.xml && f.xml.chiave ? bordo('Scarica la fattura (XML)', e => occupato(e.currentTarget, () => scarica(f.xml.chiave, f.xml.nome)), 'scarica') : null,
        f.copia && f.copia.chiave ? bordo('Copia PDF', e => occupato(e.currentTarget, () => scarica(f.copia.chiave, f.copia.nome)), 'scarica') : null);
      mettiPagina(pagina({ titolo, dove: 'Fatture', indietro: '#/fatture', sotto: f.causale },
        h('div', { class: 'stato-riga' }, pill(f.statoVisto), f.dettaglioStato ? h('span', { class: 'calmo' }, f.dettaglioStato) : null, h('span', { class: 'calmo' }, 'del ' + dataIt(f.data))),
        sez('Righe', schedaRighe((f.righe || []).map(x => riga({ t1: x.descrizione, t2: Number(x.quantita) !== 1 ? 'quantità ' + numero(x.quantita) : '', quanto: euro(x.importo) })))),
        conti, scadenze, pagare, file, f.copia ? h('p', { class: 'calmo' }, 'Copia di cortesia: la fattura valida è quella del Sistema di Interscambio') : null), titolo);
    }, { dove: 'Fatture', indietro: '#/fatture' });
  }
  function copia(testo, fatto) {
    const ok = () => avviso(fatto);
    const no = () => avviso('Non riesco a copiare: tieni premuto sul testo per copiarlo');
    try { navigator.clipboard.writeText(testo).then(ok, no); } catch (e) { no(); }
  }

  // ------------------------------------------------------------------------------------------------------- richieste

  async function pRichieste(rotta, giro) {
    await leggiPagina('richieste', giro, "Richieste d'intervento", r => {
      const chiuse = S.ricChiuse;
      const filtri = h('div', { class: 'pillole', role: 'group', 'aria-label': 'Quali richieste' },
        [['Aperte', false], ['Chiuse', true]].map(x => h('button', { type: 'button', 'aria-pressed': String(chiuse === x[1]), onclick: () => { S.ricChiuse = x[1]; mostra(); } }, x[0])));
      const righe = (r.richieste || []).filter(x => (RICHIESTE_CHIUSE.indexOf(x.statoVisto) >= 0) === chiuse).map(x => riga({ icona: 'chiave', t1: x.numero + ' · ' + x.titolo, t2: x.luogo,
        pills: [pill(x.statoVisto), x.dettaglioStato ? h('span', { class: 'calmo' }, x.dettaglioStato) : null, x.nuovo ? pillNuovo() : null], href: indirizzo('richiesta', x.id) }));
      const g = S.io.puo && S.io.puo.richieste >= 2 ? gialloLink('Nuova richiesta', '#/richieste/nuova') : null;
      mettiPagina(pagina({ titolo: "Richieste d'intervento", giallo: g }, filtri, schedaRighe(righe, chiuse ? 'Nessuna richiesta chiusa' : 'Nessuna richiesta aperta')), "Richieste d'intervento");
    });
  }

  /** Carica i file scelti uno alla volta (quelli già arrivati non ripartono). Ritorna {ok, ids} o la risposta sbagliata. */
  async function caricaTutti(lista, per) {
    for (const x of lista) {
      if (x.caricamento) continue;
      const r = await caricaFile(x.file, per);
      if (!r.ok) return r;
      x.caricamento = r.caricamento && r.caricamento.id;
    }
    return { ok: true, ids: lista.map(x => x.caricamento).filter(Boolean) };
  }

  function pNuovaRichiesta(rotta, giro) {
    const io = S.io;
    const sedi = io.sedi || [];
    const m = S.moduli.nr || (S.moduli.nr = { sede: sedi.length === 1 ? sedi[0].id : null, titolo: '', desc: '', impatto: '', urgenza: '', rif: '', rifAperto: false, file: [], fatta: null });
    if (m.fatta) {
      const f = m.fatta;
      delete S.moduli.nr;
      const fine = null;
      const titolo = 'Richiesta ' + (f.numero || '') + ' ricevuta';
      return mettiPagina(pagina({ titolo, dove: "Richieste d'intervento", indietro: '#/richieste' }, h('div', { class: 'ok-grande' }, icona('spunta', 36, 3)),
        f.telefono ? h('div', { class: 'fascia giallo' }, icona('telefono', 18), h('span', null, 'Se è urgente chiama anche lo ', linkTelefono(f.telefono))) : null,
        h('div', { class: 'azioni' }, f.id ? h('a', { class: 'bordo', href: indirizzo('richiesta', f.id), onclick: fine }, 'Apri la richiesta') : null,
          h('a', { class: 'bordo', href: '#/richieste', onclick: fine }, 'Torna alle richieste'))), titolo, { fuoco: true });
    }
    const errTitolo = errore('err-titolo');
    const errSede = errore('err-sede');
    const errFile = errore('err-file');
    const box = h('div');
    const stato = h('p', { class: 'calmo', role: 'status', hidden: true }, 'Sto mandando la richiesta');
    const gruppoPillole = (legenda, voci, chiave, idErr) => h('fieldset', { class: 'domanda', 'aria-describedby': idErr || null }, h('legend', null, legenda), h('div', { class: 'pillole' }, voci.map(v =>
      h('button', { type: 'button', 'aria-pressed': String(m[chiave] === v[0]), onclick: e => { m[chiave] = m[chiave] === v[0] && chiave !== 'sede' ? '' : v[0]; e.currentTarget.parentNode.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(m[chiave] === voci[i][0]))); } }, v[1]))));
    const miniature = h('div', { class: 'miniature' });
    const aggiungi = l => {
      errFile.metti('');
      l.forEach(f => { const e = erroreFile(f.name, f.size, io.tipiFile, io.fileMaxMb); if (e) errFile.metti(e); else m.file.push({ file: f, caricamento: null }); });
      disegnaFile();
    };
    function disegnaFile() {
      rimetti(miniature, m.file.map((x, i) => miniatura(x.file, () => { m.file.splice(i, 1); disegnaFile(); })),
        telefonoTouch() ? sceltaFile({ classe: 'nuova-foto', icona: 'foto', testo: 'Fotografa', accept: 'image/*', capture: 'environment', scelti: aggiungi }) : null,
        sceltaFile({ classe: 'nuova-foto', icona: 'graffetta', testo: 'Scegli i file', accept: acceptDi(io.tipiFile), multipli: true, scelti: aggiungi }));
    }
    disegnaFile();
    const titolo = h('input', { id: 'n-titolo', maxlength: '120', value: m.titolo, 'aria-describedby': 'err-titolo', oninput: e => { m.titolo = e.target.value; } });
    const desc = h('textarea', { id: 'n-desc', maxlength: '4000', value: m.desc, oninput: e => { m.desc = e.target.value; } });
    const rif = h('div', { class: 'campo', hidden: !m.rifAperto }, h('label', { for: 'n-rif' }, 'Vostro riferimento'), h('input', { id: 'n-rif', maxlength: '60', value: m.rif, oninput: e => { m.rif = e.target.value.replace(/[\r\n]+/g, ' '); } }));
    const apriRif = testoLink('+ Vostro riferimento', e => { m.rifAperto = true; rif.hidden = false; e.currentTarget.remove(); rif.querySelector('input').focus(); });
    const btn = h('button', { type: 'button', class: 'principale' }, 'Manda la richiesta');
    btn.addEventListener('click', () => occupato(btn, async () => {
      errTitolo.metti(''); errSede.metti(''); rimetti(box);
      if (sedi.length > 1 && !m.sede) { errSede.metti("Scegli l'impianto o la sede"); return; }
      if (!m.titolo.trim()) { errTitolo.metti('Scrivi in poche parole cosa succede'); titolo.focus(); return; }
      if (fermaAnteprima()) return;
      stato.hidden = false;
      try {
        const c = await caricaTutti(m.file, 'richiesta');
        if (giro !== S.giro) return;
        if (!c.ok) { if (gestioneGenerale(c, false)) return; if (!c.rete && /file|tipo|MB|nome/i.test(c.errore || '')) errFile.metti(c.errore); else inBox(box, boxErrore(c)); return; }
        const r = await api('richieste', 'POST', { idSede: m.sede, titolo: m.titolo.trim(), descrizione: m.desc.trim(), impatto: m.impatto, urgenza: m.urgenza, rifCliente: m.rif.trim(), caricamenti: c.ids });
        if (giro !== S.giro) return;
        if (r.ok) {
          m.fatta = { numero: r.richiesta && r.richiesta.numero, id: r.richiesta && r.richiesta.id, telefono: r.telefono || '' };
          dimenticaLetture('richieste', 'casa');
          pNuovaRichiesta(rotta, giro);
          return;
        }
        if (gestioneGenerale(r, false)) return;
        const t = r.errore || '';
        if (/cosa succede/.test(t)) errTitolo.metti(t); else if (/impianto o la sede/.test(t)) errSede.metti(t); else inBox(box, boxErrore(r));
      } finally { stato.hidden = true; }
    }));
    mettiPagina(pagina({ titolo: 'Nuova richiesta', dove: "Richieste d'intervento", indietro: '#/richieste', giallo: btn },
      sedi.length ? gruppoPillole('Dove', sedi.map(s => [s.id, s.nome]), 'sede', 'err-sede') : null, errSede.el,
      h('div', { class: 'campo' }, h('label', { for: 'n-titolo' }, 'Cosa succede'), titolo), errTitolo.el,
      h('div', { class: 'campo' }, h('label', { for: 'n-desc' }, 'Racconta'), desc),
      gruppoPillole("L'impianto è fermo?", [['fermo', 'Sì, è fermo'], ['ridotto', 'Va a metà'], ['nessuno', 'Funziona']], 'impatto'),
      gruppoPillole('Per quando?', [['subito', 'Subito'], ['presto', 'Entro domani'], ['quando_si_puo', 'Quando si può']], 'urgenza'),
      h('fieldset', { class: 'domanda' }, h('legend', null, 'Foto o file'), miniature), errFile.el,
      m.rifAperto ? null : apriRif, rif, stato, box), 'Nuova richiesta');
  }

  async function pRichiesta(rotta, giro) {
    const strada = 'richieste/' + rotta.id;
    await leggiPagina(strada, giro, 'Richiesta', r => disegnaRichiesta(r.richiesta, strada, giro), { dove: "Richieste d'intervento", indietro: '#/richieste' });
  }
  function disegnaRichiesta(x, strada, giro) {
    if (!x) return pNonTrovato();
    const io = S.io;
    const mio = (io.referente && io.referente.nome) || '';
    const m = S.moduli['msg' + x.id] || (S.moduli['msg' + x.id] = { testo: '', file: [] });
    const bolle = (x.messaggi || []).map(ms => {
      const studio = ms.da === nomeStudio() || ms.da === 'Studio Tecnico GM';
      return h('div', { class: 'bolla ' + (studio ? 'studio' : 'cliente') }, h('span', { class: 'chi-b' }, (ms.da === mio ? 'Tu' : ms.da) + ' · ' + quandoIt(ms.quando, oggi())), ms.testo,
        (ms.file || []).map(f => h('span', { class: 'file-msg' }, testoLink(f.nome + ' · ' + grandezza(f.byte), e => occupato(e.currentTarget, () => scarica(f.chiave, f.nome))))));
    });
    const tempo = (x.tempo || []).map(t => h('div', { class: 'pt' }, h('i'), h('div', null, h('b', null, t.testo), h('span', null, quandoIt(t.quando, oggi())))));
    const risposte = x.risposte ? [x.risposte.fermo, x.risposte.quando].filter(Boolean).join(' · ') : '';
    let compositore = null;
    if (x.puoScrivere) {
      const errMsg = errore('err-msg');
      const box = h('div');
      const area = h('textarea', { id: 'm-testo', maxlength: '2000', value: m.testo, 'aria-describedby': 'err-msg', oninput: e => { m.testo = e.target.value; } });
      const miniature = h('div', { class: 'miniature' });
      const disegnaAllegati = () => rimetti(miniature, m.file.map((f, i) => miniatura(f.file, () => { m.file.splice(i, 1); disegnaAllegati(); })));
      disegnaAllegati();
      const allega = sceltaFile({ icona: 'graffetta', testo: 'Allega', accept: acceptDi(io.tipiFile), multipli: true, scelti: l => {
        errMsg.metti('');
        l.forEach(f => { const e = erroreFile(f.name, f.size, io.tipiFile, io.fileMaxMb); if (e) errMsg.metti(e); else m.file.push({ file: f, caricamento: null }); });
        disegnaAllegati();
      } });
      const manda = h('button', { type: 'button', class: 'bordo' }, icona('invia', 18), 'Manda');
      manda.addEventListener('click', () => occupato(manda, async () => {
        errMsg.metti(''); rimetti(box);
        if (!m.testo.trim()) { errMsg.metti('Scrivi il messaggio'); area.focus(); return; }
        if (fermaAnteprima()) return;
        const c = await caricaTutti(m.file, 'messaggio');
        if (giro !== S.giro) return;
        if (!c.ok) { if (gestioneGenerale(c, false)) return; inBox(box, boxErrore(c)); return; }
        const r = await api(strada + '/messaggio', 'POST', { testo: m.testo.trim(), caricamenti: c.ids });
        if (giro !== S.giro) return;
        if (r.ok) {
          delete S.moduli['msg' + x.id];
          dimenticaLetture('richieste', 'casa');
          if (r.richiesta) { S.cache.set(strada, { quando: Date.now(), r: { ok: true, richiesta: r.richiesta } }); disegnaRichiesta(r.richiesta, strada, giro); } else mostra();
          avviso('Messaggio mandato allo studio');
          return;
        }
        if (gestioneGenerale(r, false)) return;
        inBox(box, boxErrore(r));
      }));
      const nonRisolto = x.puoDireNonRisolto ? bordo('Non è risolto', () => { if (!area.value.trim()) { area.value = "Il problema c'è ancora: "; m.testo = area.value; } area.focus(); area.setSelectionRange(area.value.length, area.value.length); }) : null;
      compositore = h('div', { class: 'scheda' }, h('div', { class: 'campo' }, h('label', { for: 'm-testo' }, 'Scrivi allo studio'), area), errMsg.el, miniature,
        h('div', { class: 'azioni' }, allega, manda, nonRisolto), box);
    }
    mettiPagina(pagina({ titolo: x.numero, dove: "Richieste d'intervento", indietro: '#/richieste', sotto: x.titolo },
      h('div', { class: 'stato-riga' }, pill(x.statoVisto), x.dettaglioStato ? h('span', { class: 'calmo' }, x.dettaglioStato) : null),
      h('div', { class: 'scheda' }, coppie([['Dove', x.luogo], ['Aperta il', dataOraIt(x.apertaIl)], ['Arrivata da', x.apertaDa], ['Le tue risposte', risposte], ['Vostro riferimento', x.rifCliente]])),
      x.descrizione ? sez('Cosa hai scritto', h('div', { class: 'riquadro-grigio' }, x.descrizione)) : null,
      tempo.length ? sez('Come va', h('div', { class: 'scheda' }, h('div', { class: 'tempo-r' }, tempo))) : null,
      sez('Messaggi', h('div', { class: 'scheda' }, bolle.length ? h('div', { class: 'bolle' }, bolle) : h('span', { class: 'calmo' }, 'Nessun messaggio'))),
      (x.rapportini || []).length ? sez('Rapportini', schedaRighe(x.rapportini.map(rp => riga({ icona: 'firma', t1: rp.numero, t2: dataIt(rp.data), pills: [pill(rp.statoVisto)], href: indirizzo('rapportino', rp.id) })))) : null,
      compositore), x.numero);
  }

  // ------------------------------------------------------------------------------------------------------- il mio accesso

  async function pAccesso(rotta, giro) {
    await leggiPagina('accessi', giro, 'Il mio accesso', r => {
      const io = S.io;
      const ref = io.referente || {};
      const avvisi = h('button', { type: 'button', class: 'interr', role: 'switch', 'aria-checked': String(!!ref.avvisiEmail), 'aria-labelledby': 'lab-avvisi' });
      avvisi.addEventListener('click', () => occupato(avvisi, async () => {
        if (fermaAnteprima()) return;
        const nuovo = avvisi.getAttribute('aria-checked') !== 'true';
        const x = await api('avvisi', 'POST', { email: nuovo });
        if (x.ok) { ref.avvisiEmail = nuovo; avvisi.setAttribute('aria-checked', String(nuovo)); avviso(nuovo ? 'Ti avvisiamo per email' : 'Niente più avvisi per email'); return; }
        if (!gestioneGenerale(x, false)) avviso(x.rete ? TESTO_RETE : x.errore);
      }));
      const aziende = io.aziende || [];
      const cambia = aziende.length ? testoLink('Cambia azienda', () => {
        if (fermaAnteprima()) return;
        const righe = aziende.map(a => {
          const b = riga({ icona: 'casa', t1: a.azienda, onclick: () => occupato(b, async () => {
            const x = await api('azienda', 'POST', { n: a.n });
            if (x.ok && x.sessione) { chiudiFogli(); entrato(x); return; }
            if (!gestioneGenerale(x, false)) avviso(x.rete ? TESTO_RETE : x.errore);
          }) });
          return b;
        });
        foglio('Cambia azienda', schedaRighe(righe));
      }) : null;
      const accessi = (r.accessi || []).map(a => riga({ icona: 'storia', t1: a.frase, t2: [quandoIt(a.quando, oggi()), a.dispositivo].filter(Boolean).join(' · ') }));
      mettiPagina(pagina({ titolo: 'Il mio accesso' },
        h('div', { class: 'scheda' }, coppie([['Nome', ref.nome], ['Email', ref.email], ['Azienda', io.azienda]]), cambia),
        h('div', { class: 'scheda', style: 'padding:4px 18px' }, h('div', { class: 'riga-int' }, h('span', { id: 'lab-avvisi' }, "Avvisami per email quando c'è qualcosa di nuovo"), avvisi)),
        sez('Ultimi accessi', schedaRighe(accessi, 'Nessun accesso')),
        h('div', { style: 'display:flex;flex-direction:column;align-items:flex-start' },
          testoLink('Esci da tutti i dispositivi', e => occupato(e.currentTarget, () => esci(true))),
          h('a', { class: 'testo-link', href: '#/informativa' }, 'Informativa sulla privacy')),
        h('div', { class: 'azioni' }, bordo('Esci', () => esci(false), 'esci'))), 'Il mio accesso');
    });
  }

  // ------------------------------------------------------------------------------------------------------- link condiviso (fase 5)

  async function pCondiviso(rotta, giro) {
    const token = sess.get('condiviso');
    const studio = await caricaStudio(giro);
    if (!studio) return;
    const nonVale = () => mettiPagina(paginaFuori([h('p', { class: 'sottotitolo' }, 'È scaduto o è stato revocato. Chiedi allo studio di mandarti il documento di nuovo.')], 'Questo link non vale più'), 'Questo link non vale più', { fuoco: true });
    if (!token) return nonVale();
    mettiPagina(paginaFuori([segnaposto()], nomeStudio()), nomeStudio());
    const r = await api('condiviso/' + token, 'GET');
    if (giro !== S.giro) return;
    if (!r.ok) {
      if (gestioneGenerale(r, true, () => mostra())) return;
      return nonVale();
    }
    const d = r.documento || r;
    const titolo = d.titolo || 'Documento';
    const btn = h('button', { type: 'button', class: 'principale' }, icona('scarica', 22), 'Scarica');
    btn.addEventListener('click', () => occupato(btn, () => scarica('', d.nomeFile || d.nome, 'condiviso/' + token + '/scarica')));
    const studioNome = typeof r.studio === 'string' ? r.studio : (r.studio && r.studio.nome) || nomeStudio();
    mettiPagina(pagina({ titolo, dove: studioNome, giallo: btn, gialloSotto: true, stretta: true },
      h('p', { class: 'sottotitolo' }, [d.nomeFile || d.nome, d.revisione !== undefined && d.revisione !== '' ? (/^rev/.test(String(d.revisione)) ? d.revisione : 'rev. ' + d.revisione) : '', d.byte ? grandezza(d.byte) : ''].filter(Boolean).join(' · '))), titolo);
  }

  const PAGINE = {
    entra: pEntra, posta: pPosta, link: pLink, azienda: pAzienda, informativa: pInformativa, condiviso: pCondiviso,
    casa: pCasa, preventivi: pPreventivi, preventivo: pPreventivo, accetta: pAccetta, accettato: pAccettato,
    rapportini: pRapportini, rapportino: pRapportino, firmarap: pFirmaRap, documenti: pDocumenti, carica: pCarica,
    fatture: pFatture, fattura: pFattura, richieste: pRichieste, nuovarichiesta: pNuovaRichiesta, richiesta: pRichiesta,
    accesso: pAccesso, nontrovato: pNonTrovato,
  };

  function avvia() {
    costruisci();
    mostra();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})(typeof window !== 'undefined' ? window : globalThis);
