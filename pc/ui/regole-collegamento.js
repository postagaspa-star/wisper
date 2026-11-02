/*
 * Wisper Ufficio: come si dice, a parole, dove sta il server e da che strada si arriva
 * (docs/gestionale/porta-google.md §8), e le regole per entrare col telefono (il QR,
 * docs/gestionale/collega-qr.md). Niente di grafico: le prove sono in
 * pc/prove/porta-ufficio.test.js e pc/prove/collega-qr.test.js.
 *
 * Il programma dice alla pagina (/locale/stato) l'indirizzo del server di casa, se c'è
 * la porta Google (solo sì o no: l'indirizzo dello script la pagina non lo vede mai),
 * la strada di adesso e l'ultimo contatto riuscito.
 *   "Da fuori: Google · In casa: 192.168.1.51 · ultimo contatto alle 10:42 in ufficio"
 */
(function (radice) {
  'use strict';

  const due = n => String(n).padStart(2, '0');

  /** "http://192.168.1.51:8400" -> "192.168.1.51"; la porta si scrive solo se non è quella di sempre (8400). */
  function casaBreve(indirizzo) {
    return String(indirizzo || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/:8400$/, '');
  }

  /** "alle 10:42" oggi, "ieri alle 18:03", "il 29/10 alle 18:03". */
  function quando(iso, adesso) {
    const d = new Date(String(iso || ''));
    if (isNaN(d.getTime())) return '';
    const ora = 'alle ' + d.getHours() + ':' + due(d.getMinutes());
    const oggi = adesso ? new Date(adesso) : new Date();
    const giorno = x => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate();
    if (giorno(d) === giorno(oggi)) return ora;
    const ieri = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 1);
    if (giorno(d) === giorno(ieri)) return 'ieri ' + ora;
    return 'il ' + due(d.getDate()) + '/' + due(d.getMonth() + 1) + ' ' + ora;
  }

  /** "in ufficio" / "via Google": da dove è passato l'ultimo contatto. */
  function strada(s) {
    return s === 'casa' ? 'in ufficio' : s === 'google' ? 'via Google' : '';
  }

  /**
   * La frase del collegamento. st: {casa, google (sì/no), ultimoContatto, ultimaStrada}.
   * Con ultimo:false senza l'ultimo contatto (la pagina di accesso, prima di entrare).
   */
  function frase(st, opzioni) {
    st = st || {};
    const conUltimo = !opzioni || opzioni.ultimo !== false;
    const parti = ['Da fuori: ' + (st.google ? 'Google' : 'non collegato'), 'In casa: ' + (st.casa ? casaBreve(st.casa) : 'non collegato')];
    const q = conUltimo ? quando(st.ultimoContatto, opzioni && opzioni.adesso) : '';
    if (q) parti.push(['ultimo contatto', q, strada(st.ultimaStrada)].filter(Boolean).join(' '));
    return parti.join(' · ');
  }

  /**
   * Il messaggio della pagina di accesso quando non si entra. Gli errori di rete della porta
   * Google hanno già le parole giuste ("Il server dello studio non risponde dalle 10:42"):
   * si mostrano così come sono (porta-google.md §4).
   */
  function erroreAccesso(e) {
    if (!e) return 'Non sono riuscito a entrare.';
    if (e.rete) return e.dati && e.dati.porta && e.message ? e.message : 'Il server non risponde: controlla la rete e riprova.';
    return e.message || 'Non sono riuscito a entrare.';
  }

  // ------------------------------------------------------------------ entrare col telefono (QR)

  /**
   * Entrare col telefono, come WhatsApp (docs/gestionale/collega-qr.md §3 e §6). Il programma crea le chiavi e dà il
   * testo del QR (/locale/collega-qr); la pagina lo disegna (qr.js) e chiede lo stato ogni 2 secondi
   * (/locale/collega-qr-stato) finché il telefono non lo collega. Qui solo i tempi, il testo e le frasi.
   */
  const QR = {
    PREFISSO: 'wisper-collega:1:',
    /** Un codice vale 2 minuti, poi la pagina ne mostra uno nuovo da sola. */
    DURATA_MS: 120000,
    /** Dopo 5 codici si ferma: "Mostra un codice nuovo" (niente richieste per ore se nessuno c'è). */
    CODICI: 5,
    /** Lo stato si chiede ogni 2 secondi, solo mentre la pagina si vede. */
    OGNI_MS: 2000,
    /** La spunta "Entrato come …" resta 1,2 secondi, poi la Dashboard. */
    ENTRATO_MS: 1200,
    /** "Il server dell'ufficio non risponde" dopo tante risposte "lontano" di fila (alla prima domanda ne basta una). */
    LONTANO_DOPO: 2,
    /** Il nome nel QR: al massimo 32 caratteri e 128 byte scritti (il QR sta nella versione 10). */
    NOME_MASSIMO: 32,
    NOME_SCRITTO_MASSIMO: 128,
  };

  /**
   * Il nome del computer per il QR, come CollegaQr.NomeQr in C#: senza caratteri di controllo né di formato, al
   * massimo 32 caratteri (contati come il server) e 128 byte scritti con encodeURIComponent. Vuoto: "Computer".
   */
  function nomeQr(nome) {
    let pezzi = [...String(nome === undefined || nome === null ? '' : nome)].filter(c => !/[\p{Cc}\p{Cf}]/u.test(c));
    const pulito = pezzi.join('').trim();
    if (!pulito) return 'Computer';
    pezzi = [...pulito];
    let n = Math.min(QR.NOME_MASSIMO, pezzi.length);
    while (n > 1 && encodeURIComponent(pezzi.slice(0, n).join('')).length > QR.NOME_SCRITTO_MASSIMO) n--;
    return pezzi.slice(0, n).join('').trimEnd();
  }

  /** Il testo del QR: "wisper-collega:1:<id>:<chiave>:<nome>" (id 22 caratteri, chiave compressa 44, base64url). */
  function testoQr(id, chiave, nome) {
    return QR.PREFISSO + id + ':' + chiave + ':' + encodeURIComponent(nomeQr(nome));
  }

  /**
   * Il testo letto dal telefono: {id, chiave, nome} o null se non è un codice di Wisper Ufficio (un altro testo, una
   * versione diversa da 1, id o chiave della lunghezza sbagliata). Le stesse regole le ha il telefono.
   */
  function leggiTestoQr(testo) {
    const m = /^wisper-collega:1:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{44}):([^:]+)$/.exec(String(testo || ''));
    if (!m) return null;
    // 16 byte in base64url: l'ultimo carattere ha i 4 bit bassi a zero (A, Q, g, w). La chiave compressa comincia col
    // byte 02 o 03: in base64url "A" e poi un carattere da "g" a "_".
    if (!/[AQgw]$/.test(m[1]) || !/^A[g-z0-9_-]/.test(m[2])) return null;
    let nome;
    try { nome = decodeURIComponent(m[3]); } catch (e) { return null; }
    const n = [...nome];
    if (!n.length || n.length > QR.NOME_MASSIMO || /[\p{Cc}\p{Cf}]/u.test(nome)) return null;
    return { id: m[1], chiave: m[2], nome };
  }

  /**
   * Il codice di adesso: "resta", "nuovo" (sono passati 2 minuti: se ne mostra un altro) o "fermo" (erano già 5:
   * sfocato con "Mostra un codice nuovo"). creato: quando è comparso; codici: quanti se ne sono mostrati, questo compreso.
   */
  function codiceDopo(creato, codici, adesso) {
    if (adesso - creato < QR.DURATA_MS) return 'resta';
    return codici >= QR.CODICI ? 'fermo' : 'nuovo';
  }

  /**
   * Cosa mostra la pagina dopo una risposta di /locale/collega-qr-stato. m: {lontani: "lontano" di fila, domande:
   * quante risposte sono già arrivate}. Torna {vista: 'qr' | 'lontano' | 'entrato' | 'rifiutato', lontani}.
   * Un singhiozzo della rete non fa sparire il codice: servono 2 "lontano" di fila, tranne alla prima domanda
   * (aprendo la pagina fuori ufficio si dice subito, senza far vedere un codice che non può funzionare).
   */
  function vistaDopo(m, stato) {
    m = m || { lontani: 0, domande: 0 };
    if (stato === 'entrato' || stato === 'rifiutato') return { vista: stato, lontani: 0 };
    if (stato === 'lontano') {
      const lontani = (m.lontani || 0) + 1;
      return { vista: lontani >= QR.LONTANO_DOPO || !m.domande ? 'lontano' : 'qr', lontani };
    }
    return { vista: 'qr', lontani: 0 };
  }

  /** Le parole della pagina di accesso col QR (prototipo docs/prototipo/Collega-QR.html). */
  const FRASI_QR = {
    titolo: 'Entra col telefono',
    passi: [['Apri ', 'Wisper', ' sul telefono'], ['Nel menu tocca ', 'Collega un computer', ''], ['Inquadra questo codice', '', '']],
    altraStrada: 'Entra con email e password',
    tornaAlCodice: 'Torna al codice del telefono',
    nuovoCodice: 'Mostra un codice nuovo',
    lontanoTitolo: 'Il server dell\'ufficio non risponde',
    lontanoTesto: 'Il codice per il telefono funziona solo quando questo computer è in ufficio, sulla stessa rete del server.',
    riprova: 'Riprova',
    entrato: nome => 'Entrato come ' + (String(nome || '').trim() || 'te'),
    aproDashboard: 'Apro la Dashboard…',
    rifiutato: 'Il telefono che ha inquadrato il codice non può più entrare: chiedi al titolare. Qui sotto c\'è un codice nuovo.',
    descrizioneQr: 'Codice da inquadrare col telefono',
  };

  const Regole = { casaBreve, quando, strada, frase, erroreAccesso, QR, nomeQr, testoQr, leggiTestoQr, codiceDopo, vistaDopo, FRASI_QR };

  if (typeof module !== 'undefined' && module.exports) module.exports = Regole;
  else radice.WisperCollegamento = Regole;
})(typeof window !== 'undefined' ? window : globalThis);
