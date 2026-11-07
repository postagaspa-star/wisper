/*
 * La Dashboard della fase 6 (fase6.md §11.1): persone e assenze, mezzi e strumenti, collaboratori esterni, e la
 * Dashboard dell'esterno. Le voci entrano nelle tre sezioni di dashboard.js prima di ordinarle. Una cosa, una voce
 * sola: le scadenze che qui diventano una voce (la taratura scaduta di uno strumento in uso, il mezzo fermo, la
 * formazione scaduta, il DURC scaduto di chi ha un incarico) vanno in "gia" e la parte della fase 5 non le ripete.
 */
'use strict';

const { testo, numero, centesimi, oggi, piuGiorni, dataIso, dataOraIso } = require('../utili');
const C = require('../conti');
const { periodoFrase } = require('./assenze');

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const nomeGiorno = iso => GIORNI[new Date(iso + 'T12:00:00').getDay()] + ' ' + Number(iso.slice(8, 10));
const dataBreve = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const giorniTra = (da, a) => Math.round((Date.parse(a + 'T12:00:00') - Date.parse(da + 'T12:00:00')) / 86400000);
const plurale = (n, uno, tanti) => n + ' ' + (n === 1 ? uno : tanti);
const kmIt = n => String(Math.round(numero(n))).replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const elenco = l => (l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1]);
/** "scaduto" accordato alla prima parola del titolo: "Primo soccorso ... scaduto", "Visura camerale ... scaduta", "Lavori in quota ... scaduti". */
function scaduto(titolo) {
  const p = String(titolo || '').split(' ')[0].toLowerCase();
  if (['formazione', 'patente', 'abilitazione', 'visita', 'visura', 'autocertificazione', 'polizza', 'iscrizione', 'verifica', 'taratura', 'assicurazione', 'revisione'].indexOf(p) >= 0) return 'scaduta';
  if (['piattaforme'].indexOf(p) >= 0) return 'scadute';
  if (['lavori'].indexOf(p) >= 0) return 'scaduti';
  return 'scaduto';
}

module.exports = {
  /**
   * Il titolo di una scadenza della fase 6 nella Dashboard (scaduta, oggi, fra N giorni, data lontana), con le frasi
   * dell'accordo: "Fiat Doblò GA123BC: assicurazione scade fra 14 giorni", "Misuratore di terra MT-500: taratura fra 24
   * giorni", "Visita medica di Marco Rossato fra 13 giorni", "DURC di ... scade fra 7 giorni". null per le altre.
   */
  titoloScadenza6(s, g) {
    const scaduta = g < 0;
    const quando = g === 0 ? ' oggi' : g === 1 ? ' domani' : ' fra ' + g + ' giorni';
    const da = ' da ' + plurale(-g, 'giorno', 'giorni');
    if (['assicurazione', 'bollo', 'revisione', 'tagliando'].indexOf(s.tipo) >= 0 && s.veicolo_id) {
      const v = this.db.riga('SELECT * FROM veicoli WHERE id = ?', s.veicolo_id);
      const parola = { assicurazione: 'assicurazione', bollo: 'bollo', revisione: 'revisione', tagliando: 'tagliando' }[s.tipo];
      const m = s.tipo === 'bollo' || s.tipo === 'tagliando';
      return (v ? this.titoloMezzo(v) : s.titolo) + ': ' + parola + (scaduta ? (m ? ' scaduto' : ' scaduta') + da : ' scade' + quando);
    }
    if ((s.tipo === 'taratura' || s.tipo === 'verifica_dpi') && s.attrezzatura_id) {
      const a = this.db.riga('SELECT nome FROM attrezzature WHERE id = ?', s.attrezzatura_id);
      const T = s.tipo === 'taratura' ? 'taratura' : 'verifica';
      return (a ? a.nome : s.titolo) + ': ' + T + (scaduta ? ' scaduta' + da : g === 0 ? ' scade oggi' : ' fra ' + plurale(g, 'giorno', 'giorni'));
    }
    if (s.tipo === 'visita_medica') return s.titolo + (scaduta ? ' scaduta' + da : quando);
    if (s.tipo === 'formazione' || s.tipo === 'abilitazione') return s.titolo + (scaduta ? ' ' + scaduto(s.titolo) + da : ' scade' + quando);
    if (s.tipo === 'contratto_lavoro') return s.titolo + (scaduta ? da : quando);
    if (['durc', 'visura', 'idoneita', 'albo'].indexOf(s.tipo) >= 0 || (s.tipo === 'polizza' && this.gruppoDiScadenza(s) === 'collaboratori')) {
      return s.titolo + (scaduta ? ' ' + scaduto(s.titolo) + ' il ' + dataBreve(s.data) : ' scade' + quando);
    }
    return null;
  },

  /** Dove porta una scadenza della fase 6: la persona, il mezzo, lo strumento, il collaboratore (o la scadenza). */
  collegamentoScadenza6(s) {
    if (s.persona_id) return { pagina: 'persona', id: s.persona_id };
    if (s.veicolo_id) return { pagina: 'mezzo', id: s.veicolo_id };
    if (s.attrezzatura_id) return { pagina: 'attrezzatura', id: s.attrezzatura_id };
    if (this.gruppoDiScadenza(s) === 'collaboratori') return { pagina: 'collaboratore', id: s.cliente_id };
    return { pagina: 'scadenza', id: s.id };
  },

  /** Le voci e i numeri della fase 6 (fase6.md §11.1). gia: gli id delle scadenze gia' diventate una voce qui. */
  dashboardFase6({ mie, costi, io, adesso, voce, urgenti, settimana, pianificare, gia }) {
    const out = {};
    const mia = this.miaPersonaId();
    const imp = this.leggiImpostazioni();
    const titolare = this.ruoloTitolare();
    const tipoIn = a => (this.vedeTipoAssenza(a) && a.tipo === 'ferie' ? 'in ferie' : this.vedeTipoAssenza(a) && a.tipo === 'permesso' ? 'in permesso' : 'assente');

    // ------------------------------------------------------------ persone e assenze
    if (this.livello('persone') >= 1) {
      const attive = this.personeAttive(adesso);
      const assentiOggi = [];
      for (const p of attive) {
        const a = this.db.riga("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'approvata' AND dal <= ? AND al >= ? ORDER BY dal LIMIT 1", p.id, adesso, adesso);
        if (a) assentiOggi.push({ p, a });
      }
      out.oggiAssenti = assentiOggi.map(x => ({ idPersona: x.p.id, nome: x.p.nome, tipoVisto: this.tipoVistoAssenza(x.a), fino: x.a.al }));
      const approva = this.puoApprovareAssenze() && !mie;
      const daApprovare = approva ? this.vociAssenzeDaApprovare() : [];
      const numeri = { attive: attive.length, assentiOggi: assentiOggi.length, assentiOggiNomi: assentiOggi.map(x => x.p.nome) };
      if (approva) numeri.daApprovare = daApprovare.length;
      const scadPersone = this.db.righe("SELECT * FROM scadenze WHERE persona_id IS NOT NULL AND stato = 'aperta' ORDER BY data")
        .filter(s => this.vedeScadenza(s) && (!mie || s.persona_id === mia));
      numeri.scadenzeVicine = scadPersone.filter(s => s.data >= adesso && giorniTra(adesso, s.data) <= s.preavviso_giorni).length;
      numeri.scadute = scadPersone.filter(s => s.data < adesso).length;
      out.persone = numeri;

      // Chi e' assente oggi: una voce sola.
      if (assentiOggi.length) {
        const nomi = assentiOggi.map(x => x.p.nome);
        const fino = x => { const parola = this.tipoVistoAssenza(x.a); return (parola === 'Assente' ? 'Assente' : parola) + ' fino a ' + (x.a.al === adesso ? 'oggi' : nomeGiorno(x.a.al)); };
        voce(settimana, {
          tipo: 'assenza', gravita: 'info', titolo: (nomi.length === 1 ? 'Oggi è assente ' : 'Oggi sono assenti ') + elenco(nomi),
          dettaglio: assentiOggi.length === 1 ? fino(assentiOggi[0]) : assentiOggi.map(x => x.p.nome.split(' ')[0] + ': ' + fino(x).toLowerCase()).join(' · '),
          quanto: nomi.length, unita: 'persone', collegamento: { pagina: 'persone', filtro: { segmento: 'ferie' } },
        });
      }
      // Ferie da approvare: quelle che cominciano entro 7 giorni sono urgenti; le altre una voce in settimana.
      if (daApprovare.length) {
        const vicine = daApprovare.filter(v => v.data <= piuGiorni(adesso, 7));
        for (const v of vicine) {
          voce(urgenti, {
            tipo: 'assenza', gravita: 'attenzione', titolo: v.cosa + ' da approvare: ' + this.nomePersona(v.idPersona) + ' ' + periodoFrase(v.data, (this.db.riga('SELECT al FROM assenze WHERE id = ?', v.id) || {}).al || v.data),
            dettaglio: v.data <= adesso ? 'Comincia oggi' : 'Comincia ' + nomeGiorno(v.data), quanto: null, unita: null,
            collegamento: { pagina: 'persone', filtro: { segmento: 'ferie', daApprovare: true } },
          });
        }
        const altre = daApprovare.filter(v => vicine.indexOf(v) < 0);
        if (altre.length) {
          const ferie = altre.filter(v => v.cosa === 'Ferie').length;
          const titolo = altre.length === ferie ? plurale(altre.length, 'richiesta di ferie da approvare', 'richieste di ferie da approvare') : plurale(altre.length, 'richiesta di ferie o permesso da approvare', 'richieste di ferie o permesso da approvare');
          voce(settimana, {
            tipo: 'assenza', gravita: 'attenzione', titolo, dettaglio: this.nomePersona(altre[0].idPersona) + ' · ' + altre[0].dettaglio.charAt(0).toLowerCase() + altre[0].dettaglio.slice(1),
            quanto: altre.length, unita: 'voci', collegamento: { pagina: 'persone', filtro: { segmento: 'ferie', daApprovare: true } },
          });
        }
      }
      // Le proprie richieste: respinte (urgenti, col motivo) e in attesa.
      if (mia !== null) {
        for (const a of this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'respinta' AND al >= ? ORDER BY dal LIMIT 3", mia, adesso)) {
          const parola = a.tipo === 'ferie' ? 'Ferie ' : a.tipo === 'permesso' ? 'Permesso ' : 'Assenza ';
          voce(urgenti, {
            tipo: 'assenza', gravita: 'attenzione', titolo: parola + periodoFrase(a.dal, a.al) + (a.tipo === 'ferie' ? ' respinte' : a.tipo === 'permesso' ? ' respinto' : ' respinta'),
            dettaglio: 'Motivo: ' + a.motivo_rifiuto + (a.approvata_da ? ' · ' + this.nomeUtente(a.approvata_da) : ''), collegamento: { pagina: 'persone', filtro: { segmento: 'ferie' } },
          });
        }
        for (const a of this.db.righe("SELECT * FROM assenze WHERE persona_id = ? AND stato = 'da_approvare' ORDER BY dal LIMIT 3", mia)) {
          if (approva && titolare) continue;
          const parola = a.tipo === 'ferie' ? 'Le tue ferie ' : a.tipo === 'permesso' ? 'Il tuo permesso ' : 'La tua richiesta ';
          voce(settimana, {
            tipo: 'assenza', gravita: 'info', titolo: parola + periodoFrase(a.dal, a.al) + (a.tipo === 'ferie' ? ' aspettano l\'approvazione' : ' aspetta l\'approvazione'),
            dettaglio: '', collegamento: { pagina: 'persone', filtro: { segmento: 'ferie' } },
          });
        }
        // I DPI da firmare (la consegna compare nella Dashboard di chi li ha ricevuti).
        for (const c of this.db.righe("SELECT * FROM dpi_consegne WHERE persona_id = ? AND firma_file_id IS NULL AND restituito_il = '' ORDER BY data LIMIT 5", mia)) {
          voce(settimana, { tipo: 'persona', gravita: 'attenzione', titolo: 'Firma la consegna: ' + c.cosa, dettaglio: 'Consegnato il ' + dataBreve(c.data),
            collegamento: { pagina: 'persona', id: mia } });
        }
      }
      // Formazione o visita scaduta (titolare e amministrazione; la persona per la sua), e i contratti a termine.
      const vedeTutte = !mie && this.livello('persone') >= 2;
      for (const s of scadPersone) {
        if (!vedeTutte && s.persona_id !== mia) continue;
        const g = giorniTra(adesso, s.data);
        if ((s.tipo === 'formazione' || s.tipo === 'abilitazione' || s.tipo === 'visita_medica') && g < 0) {
          voce(urgenti, { tipo: s.tipo === 'visita_medica' ? 'visita' : 'qualifica', gravita: 'urgente', titolo: s.titolo + ' ' + scaduto(s.titolo) + ' da ' + plurale(-g, 'giorno', 'giorni'),
            dettaglio: '', quanto: -g, unita: 'giorni', collegamento: { pagina: 'persona', id: s.persona_id } });
          gia.add(s.id);
        } else if (mie && (s.tipo === 'formazione' || s.tipo === 'abilitazione' || s.tipo === 'visita_medica') && g <= Math.min(30, s.preavviso_giorni)) {
          voce(settimana, { tipo: s.tipo === 'visita_medica' ? 'visita' : 'qualifica', gravita: 'attenzione', titolo: this.titoloScadenza6(s, g), dettaglio: '',
            quanto: g, unita: 'giorni', collegamento: { pagina: 'persona', id: s.persona_id } });
          gia.add(s.id);
        } else if (s.tipo === 'contratto_lavoro' && g >= 0 && g <= 60 && vedeTutte) {
          voce(pianificare, { tipo: 'persona', gravita: 'info', titolo: this.titoloScadenza6(s, g), dettaglio: dataBreve(s.data) + '/' + s.data.slice(0, 4),
            quanto: g, unita: 'giorni', collegamento: { pagina: 'persona', id: s.persona_id } });
          gia.add(s.id);
        }
      }
      // Non idoneo alla mansione (solo con "riservati").
      if (!mie && this.livello('riservati') >= 1) {
        for (const v of this.db.righe("SELECT v.*, p.nome FROM visite_mediche v JOIN persone p ON p.id = v.persona_id WHERE v.giudizio IN ('non_idoneo', 'non_idoneo_temporaneo') AND p.anonimizzata_il = '' AND (p.uscita_il = '' OR p.uscita_il >= ?) ORDER BY v.data DESC", adesso)) {
          const ultima = this.db.riga('SELECT id FROM visite_mediche WHERE persona_id = ? ORDER BY data DESC, id DESC LIMIT 1', v.persona_id);
          if (!ultima || ultima.id !== v.id) continue;
          if (v.giudizio === 'non_idoneo_temporaneo' && v.valido_fino && v.valido_fino < adesso) continue;
          voce(urgenti, { tipo: 'visita', gravita: 'urgente', titolo: v.nome + ' non è idoneo alla mansione' + (v.valido_fino ? ' fino al ' + dataBreve(v.valido_fino) + '/' + v.valido_fino.slice(0, 4) : ''),
            dettaglio: 'Visita del ' + dataBreve(v.data) + '/' + v.data.slice(0, 4), collegamento: { pagina: 'persona', id: v.persona_id } });
        }
      }
      if (!mie && this.livello('persone') >= 2) {
        // Assenze approvate sopra attivita' gia' assegnate (a chi approva e a chi ha creato l'attivita').
        for (const a of this.db.righe("SELECT * FROM assenze WHERE stato = 'approvata' AND al >= ? ORDER BY dal", adesso)) {
          const p = this.db.riga('SELECT * FROM persone WHERE id = ?', a.persona_id);
          if (!p || !p.utente_id) continue;
          for (const x of this.attivitaTra(p.utente_id, a.dal > adesso ? a.dal : adesso, a.al).slice(0, 2)) {
            if (C.assenzaAOre(a) && a.dalle && x.inizio) continue;
            const g = x.inizio ? dataIso(x.inizio) : x.scadenza;
            voce(pianificare, { tipo: 'assenza', gravita: 'info', titolo: p.nome + ' è ' + tipoIn(a) + ' ' + nomeGiorno(g) + ': ha il ' + x.titolo,
              dettaglio: 'Assegnalo a qualcun altro o sposta il giorno', collegamento: { pagina: 'attivita', id: x.id } });
          }
        }
        // Saldo non aggiornato dal cedolino e ferie arretrate (solo per chi ha le ore all'anno).
        const giorniAvviso = numero(imp.SALDO_AVVISO_GIORNI) || 60;
        for (const p of attive.filter(x => x.ferie_annue_ore !== null)) {
          const ultimo = this.db.riga("SELECT data FROM assenze_saldi WHERE persona_id = ? AND tipo = 'ferie' ORDER BY data DESC LIMIT 1", p.id);
          if (!ultimo || giorniTra(ultimo.data, adesso) > giorniAvviso) {
            voce(pianificare, { tipo: 'persona', gravita: 'info', titolo: 'Saldo delle ferie di ' + p.nome + ': ' + (ultimo ? 'l\'ultimo cedolino scritto è di ' + C.MESI[Number(ultimo.data.slice(5, 7)) - 1] : 'nessun cedolino scritto'),
              dettaglio: 'Aggiorna dal cedolino', collegamento: { pagina: 'persona', id: p.id } });
          }
          const s = this.saldiPersona(p).ferie;
          if (s && s.tenuto && s.oggi > numero(p.ferie_annue_ore)) {
            voce(pianificare, { tipo: 'persona', gravita: 'info', titolo: p.nome + ' ha ' + plurale(Math.round(s.giorniOggi || 0), 'giorno', 'giorni') + ' di ferie da smaltire',
              dettaglio: 'Più delle ferie di un anno', collegamento: { pagina: 'persona', id: p.id } });
          }
        }
        // Le persone uscite da piu' del tempo di conservazione: la proposta di renderle anonime (solo il titolare).
        if (titolare) {
          for (const p of this.daRendereAnonime()) {
            voce(pianificare, { tipo: 'persona', gravita: 'info', titolo: 'Dati di ' + p.nome + ': uscita nel ' + p.uscita_il.slice(0, 4) + ', conservazione finita',
              dettaglio: 'Rendi anonima la scheda', collegamento: { pagina: 'persona', id: p.id } });
          }
        }
      }
      // Chi non ha il costo orario e ha scritto ore o rapportini nell'ultimo mese (a chi ha "costi").
      if (!mie && this.vedeCosti()) {
        const mese = piuGiorni(adesso, -31);
        for (const p of attive.filter(x => x.utente_id && x.rapporto !== 'titolare')) {
          if (this.costoDiOggi(p.id)) continue;
          // Fase 8 (prova di carico): due letture da una riga invece della UNION, che le contava tutte prima del LIMIT.
          const usa = this.db.riga('SELECT 1 x FROM ore WHERE utente_id = ? AND tolta IS NULL AND data >= ? LIMIT 1', p.utente_id, mese)
            || this.db.riga("SELECT 1 x FROM rapportini WHERE utente_id = ? AND UPPER(stato) <> 'ANNULLATO' AND data >= ? LIMIT 1", p.utente_id, mese);
          if (!usa) continue;
          voce(pianificare, { tipo: 'persona', gravita: 'info', titolo: p.nome + ' non ha il costo orario: le sue ore usano il costo dello studio',
            dettaglio: 'Persone › Costi', collegamento: { pagina: 'persone', filtro: { segmento: 'costi' } } });
        }
      }
    }

    // ------------------------------------------------------------ mezzi e strumenti
    if (this.livello('mezzi') >= 1) {
      const mezzi = this.db.righe("SELECT * FROM veicoli WHERE dismesso_il = '' AND attivo = 1 ORDER BY id");
      const attr = this.db.righe("SELECT * FROM attrezzature WHERE dismesso_il = '' ORDER BY codice");
      const suoMezzo = v => this.eMio('veicolo_id', v);
      const suaAtt = a => this.eMio('attrezzatura_id', a);
      const mezziVisti = mie ? mezzi.filter(suoMezzo) : mezzi;
      const attVisti = mie ? attr.filter(suaAtt) : attr;
      const stati = mezziVisti.map(v => ({ v, st: this.statoMezzo(v) }));
      const tar = attVisti.map(a => ({ a, t: this.taraturaDi(a) }));
      const assegnaz = this.db.righe("SELECT * FROM assegnazioni WHERE al IS NULL AND rientro <> '' ORDER BY rientro")
        .filter(x => !mie || x.persona_id === mia);
      const inRitardo = assegnaz.filter(x => x.rientro < adesso);
      const scadMezzi = this.db.righe("SELECT * FROM scadenze WHERE (veicolo_id IS NOT NULL OR attrezzatura_id IS NOT NULL) AND stato = 'aperta' ORDER BY data")
        .filter(s => !mie || (s.veicolo_id && mezziVisti.some(v => v.id === s.veicolo_id)) || (s.attrezzatura_id && attVisti.some(a => a.id === s.attrezzatura_id)));
      out.mezzi = {
        fermi: stati.filter(x => x.st.fermo).length,
        guastiAperti: this.db.righe("SELECT veicolo_id, attrezzatura_id FROM manutenzioni WHERE tipo = 'guasto' AND stato <> 'chiusa'")
          .filter(m => !mie || (m.veicolo_id && mezziVisti.some(v => v.id === m.veicolo_id)) || (m.attrezzatura_id && attVisti.some(a => a.id === m.attrezzatura_id))).length,
        tarateScadute: tar.filter(x => x.t && x.t.stato === 'scaduta').length,
        tarateInScadenza: tar.filter(x => x.t && x.t.stato === 'in_scadenza').length,
        prestitiInRitardo: inRitardo.length,
        scadenzeVicine: scadMezzi.filter(s => giorniTra(adesso, s.data) <= s.preavviso_giorni).length,
      };
      const settegiorni = piuGiorni(adesso, -7);
      // Strumenti con la taratura scaduta ancora assegnati o usati negli ultimi 7 giorni.
      for (const x of tar.filter(y => y.t && y.t.stato === 'scaduta')) {
        const ass = this.assegnazioneInCorso('attrezzatura_id', x.a.id);
        const uso = this.db.riga('SELECT * FROM strumenti_usati WHERE attrezzatura_id = ? AND data >= ? ORDER BY data DESC, id DESC LIMIT 1', x.a.id, settegiorni);
        if (!ass && !uso) continue;
        const chi = ass ? this.chiDiAssegnazione(ass) : null;
        const usato = uso ? 'usato ' + (uso.data === adesso ? 'oggi' : uso.data === piuGiorni(adesso, -1) ? 'ieri' : 'il ' + dataBreve(uso.data)) + (uso.rapportino_id ? ' in ' + uso.rapportino_id : '') : '';
        voce(urgenti, {
          tipo: 'strumento', gravita: 'urgente', titolo: mie ? 'Il tuo ' + x.a.nome + ' ha la taratura scaduta da ' + plurale(x.t.giorni, 'giorno', 'giorni') : x.a.nome + ': taratura scaduta da ' + plurale(x.t.giorni, 'giorno', 'giorni'),
          dettaglio: [chi && chi.idPersona ? 'Ce l\'ha ' + chi.nome : chi ? 'In prestito a ' + chi.nome : '', usato].filter(Boolean).join(' · '),
          quanto: x.t.giorni, unita: 'giorni', collegamento: { pagina: 'attrezzatura', id: x.a.id },
        });
        this.db.righe("SELECT id FROM scadenze WHERE attrezzatura_id = ? AND stato = 'aperta'", x.a.id).forEach(s => gia.add(s.id));
      }
      // Strumenti non conformi usati (da quando sono non conformi).
      if (!mie) {
        for (const u of this.db.righe("SELECT u.*, a.nome, a.fuori_uso_il FROM strumenti_usati u JOIN attrezzature a ON a.id = u.attrezzatura_id WHERE (u.stato_allora = 'non_conforme' OR (a.fuori_uso = 'non_conforme' AND a.fuori_uso_il <> '' AND u.data >= a.fuori_uso_il)) AND u.data >= ? ORDER BY u.data DESC LIMIT 5", piuGiorni(adesso, -60))) {
          voce(urgenti, { tipo: 'strumento', gravita: 'urgente', titolo: (u.rapportino_id || 'Un intervento') + ' ha usato ' + (/^[AEIOU]/i.test(u.nome) ? 'l\'' : 'il ') + u.nome + ', non conforme',
            dettaglio: 'Il ' + dataBreve(u.data) + ': controlla se le misure valgono', collegamento: u.rapportino_id ? { pagina: 'rapportini', filtro: { segmento: 'rapportini', id: u.rapportino_id } } : { pagina: 'attrezzatura', id: u.attrezzatura_id } });
        }
      }
      // Mezzi fermi per assicurazione o revisione scadute.
      for (const x of stati.filter(y => y.st.fermo)) {
        const scad = this.scadenzeMezzo(x.v.id).filter(s => (s.tipo === 'assicurazione' || s.tipo === 'revisione') && s.data < adesso);
        if (!scad.length) continue;
        voce(urgenti, { tipo: 'mezzo', gravita: 'urgente', titolo: (mie ? 'Il ' + x.v.nome + ' che usi' : this.titoloMezzo(x.v)) + ': ' + scad.map(s => s.tipo + ' scaduta').join(' e ') + ', non si usa',
          dettaglio: 'Dal ' + dataBreve(scad[0].data), collegamento: { pagina: 'mezzo', id: x.v.id } });
        scad.forEach(s => gia.add(s.id));
      }
      // Prestiti oltre il rientro.
      for (const x of inRitardo) {
        const o = x.veicolo_id ? this.db.riga('SELECT * FROM veicoli WHERE id = ?', x.veicolo_id) : this.db.riga('SELECT * FROM attrezzature WHERE id = ?', x.attrezzatura_id);
        if (!o) continue;
        const nome = x.veicolo_id ? this.titoloMezzo(o) : o.nome + ' ' + o.codice;
        const chi = this.chiDiAssegnazione(x);
        const quando = x.rientro === piuGiorni(adesso, -1) ? 'ieri' : 'il ' + dataBreve(x.rientro);
        voce(urgenti, { tipo: 'prestito', gravita: 'urgente', titolo: nome + ': doveva rientrare ' + (x.tipo === 'laboratorio' ? 'dal laboratorio ' : x.tipo === 'riparazione' ? 'dalla riparazione ' : '') + quando,
          dettaglio: (x.tipo === 'laboratorio' ? 'In taratura da ' : x.tipo === 'riparazione' ? 'In riparazione da ' : 'In prestito a ') + chi.nome + ' dal ' + dataBreve(dataIso(x.dal)),
          collegamento: x.veicolo_id ? { pagina: 'mezzo', id: x.veicolo_id } : { pagina: 'attrezzatura', id: x.attrezzatura_id } });
      }
      // Il tagliando a km.
      const avvisoKm = numero(imp.KM_TAGLIANDO_AVVISO) || 1000;
      for (const v of mezziVisti) {
        const k = C.kmAlTagliando({ tagliandoKm: v.tagliando_km, tagliandoUltimoKm: v.tagliando_ultimo_km, km: v.km });
        if (k === null || k > avvisoKm) continue;
        voce(settimana, { tipo: 'mezzo', gravita: 'attenzione', titolo: (mie ? 'Il ' + v.nome + ' che usi' : this.titoloMezzo(v)) + ': ' + (k >= 0 ? 'tagliando fra ' + kmIt(k) + ' km' : 'tagliando passato di ' + kmIt(k) + ' km'),
          dettaglio: 'Ultima lettura ' + kmIt(v.km) + ' km', quanto: k, unita: 'km', collegamento: { pagina: 'mezzo', id: v.id } });
      }
      // I rientri previsti nei prossimi 7 giorni.
      for (const x of assegnaz.filter(y => y.rientro >= adesso && y.rientro <= piuGiorni(adesso, 7) && (y.tipo === 'laboratorio' || y.tipo === 'riparazione' || mie))) {
        const o = x.veicolo_id ? this.db.riga('SELECT * FROM veicoli WHERE id = ?', x.veicolo_id) : this.db.riga('SELECT * FROM attrezzature WHERE id = ?', x.attrezzatura_id);
        if (!o) continue;
        const nome = x.veicolo_id ? this.titoloMezzo(o) : o.nome;
        voce(settimana, { tipo: 'prestito', gravita: 'info', titolo: nome + (x.tipo === 'laboratorio' ? ' rientra dal laboratorio ' : x.tipo === 'riparazione' ? ' rientra dalla riparazione ' : ' va restituito ') + (x.rientro === adesso ? 'oggi' : nomeGiorno(x.rientro)),
          dettaglio: '', collegamento: x.veicolo_id ? { pagina: 'mezzo', id: x.veicolo_id } : { pagina: 'attrezzatura', id: x.attrezzatura_id } });
      }
      // Le scadenze del mezzo che uso e dei miei strumenti (il collaboratore: per gli altri sono nella parte delle scadenze).
      if (mie) {
        for (const s of scadMezzi) {
          if (gia.has(s.id)) continue;
          const g = giorniTra(adesso, s.data);
          if (g > Math.min(30, s.preavviso_giorni)) continue;
          let titolo = this.titoloScadenza6(s, g);
          if (s.veicolo_id) {
            const v = mezziVisti.find(m => m.id === s.veicolo_id);
            titolo = 'Il ' + v.nome + ' che usi: ' + titolo.slice(titolo.indexOf(': ') + 2);
          } else if (s.attrezzatura_id) titolo = 'Il tuo ' + titolo.replace(': ', ': ');
          voce(g < 0 ? urgenti : settimana, { tipo: s.veicolo_id ? 'mezzo' : 'strumento', gravita: g < 0 ? 'urgente' : 'attenzione', titolo, dettaglio: '',
            quanto: Math.abs(g), unita: 'giorni', collegamento: this.collegamentoScadenza6(s) });
          gia.add(s.id);
        }
      }
      if (!mie) {
        // Guasti aperti.
        for (const m of this.db.righe("SELECT * FROM manutenzioni WHERE tipo = 'guasto' AND stato <> 'chiusa' ORDER BY data DESC LIMIT 10")) {
          const o = m.veicolo_id ? this.db.riga('SELECT * FROM veicoli WHERE id = ?', m.veicolo_id) : this.db.riga('SELECT * FROM attrezzature WHERE id = ?', m.attrezzatura_id);
          if (!o) continue;
          voce(pianificare, { tipo: 'guasto', gravita: 'info', titolo: (m.veicolo_id ? this.titoloMezzo(o) : o.nome) + ': ' + m.titolo,
            dettaglio: (m.segnalata_da ? 'Segnalato da ' + this.nomeUtente(m.segnalata_da) + ' il ' : 'Segnalato il ') + dataBreve(m.data) + (m.fermo ? ' · fermo' : ''),
            collegamento: m.veicolo_id ? { pagina: 'mezzo', id: m.veicolo_id } : { pagina: 'attrezzatura', id: m.attrezzatura_id } });
        }
        // Strumenti senza la data della taratura.
        const senza = tar.filter(x => x.t && x.t.stato === 'senza');
        if (senza.length) {
          voce(pianificare, { tipo: 'strumento', gravita: 'info', titolo: senza.length === 1 ? senza[0].a.nome + ': taratura non scritta' : plurale(senza.length, 'strumento senza la data della taratura', 'strumenti senza la data della taratura'),
            dettaglio: senza.slice(0, 3).map(x => x.a.codice + ' ' + x.a.nome).join(', '), collegamento: senza.length === 1 ? { pagina: 'attrezzatura', id: senza[0].a.id } : { pagina: 'mezzi', filtro: { segmento: 'strumenti' } } });
        }
      }
    }

    // ------------------------------------------------------------ collaboratori esterni
    if (this.livello('collaboratori') >= 1 && !mie) {
      const incarichi = this.db.righe("SELECT * FROM incarichi WHERE stato IN ('affidato', 'concluso')");
      const affidati = incarichi.filter(i => i.stato === 'affidato');
      const coll = this.db.righe('SELECT * FROM collaboratori WHERE attivo = 1');
      const idon = {};
      coll.forEach(c => { idon[c.soggetto_id] = this.idoneitaDi(c.soggetto_id, c.tipo); });
      const nomi = {};
      this.db.righe('SELECT id, nome FROM soggetti').forEach(s => { nomi[s.id] = s.nome; });
      const conAffidato = new Set(affidati.map(i => i.soggetto_id));
      const scadColl = this.db.righe("SELECT * FROM scadenze WHERE stato = 'aperta' AND cliente_id <> '' ORDER BY data").filter(s => this.gruppoDiScadenza(s) === 'collaboratori');
      out.collaboratori = {
        incarichiInCorso: affidati.length, nonInRegola: coll.filter(c => conAffidato.has(c.soggetto_id) && idon[c.soggetto_id].stato !== 'in_regola').length,
        documentiInScadenza: scadColl.filter(s => s.data >= adesso && giorniTra(adesso, s.data) <= s.preavviso_giorni).length,
        daValutare: incarichi.filter(i => i.stato === 'concluso' && !i.valutazione).length,
      };
      // DURC o documento scaduto di chi ha un incarico affidato.
      for (const s of scadColl.filter(x => x.data < adesso && conAffidato.has(x.cliente_id))) {
        const i = affidati.find(x => x.soggetto_id === s.cliente_id);
        // Fase 8 (§8.1): "DURC scaduto" e "idoneita' non in regola" dello stesso collaboratore sono una cosa sola (oggetto).
        voce(urgenti, { tipo: 'collaboratore', gravita: 'urgente', titolo: s.titolo + ' ' + scaduto(s.titolo) + ' il ' + dataBreve(s.data), dettaglio: 'Incarico ' + i.numero + ' in corso',
          collegamento: { pagina: 'collaboratore', id: s.cliente_id }, oggetto: 'idoneita:' + s.cliente_id });
        gia.add(s.id);
      }
      // Idoneita' non in regola (manca un documento) con un incarico affidato.
      for (const c of coll.filter(x => conAffidato.has(x.soggetto_id) && idon[x.soggetto_id].stato === 'manca')) {
        voce(pianificare, { tipo: 'collaboratore', gravita: 'info', titolo: nomi[c.soggetto_id] + ': ' + idon[c.soggetto_id].frase.charAt(0).toLowerCase() + idon[c.soggetto_id].frase.slice(1),
          dettaglio: 'Ha un incarico in corso', collegamento: { pagina: 'collaboratore', id: c.soggetto_id }, oggetto: 'idoneita:' + c.soggetto_id });
      }
      // Incarichi conclusi da valutare.
      for (const i of incarichi.filter(x => x.stato === 'concluso' && !x.valutazione).slice(0, 5)) {
        voce(pianificare, { tipo: 'incarico', gravita: 'info', titolo: i.numero + ' concluso: com\'è andato?', dettaglio: (nomi[i.soggetto_id] || '') + ' · ' + i.titolo,
          collegamento: { pagina: 'incarico', id: i.id } });
      }
      // Compensi maturati non fatturati (con i soldi).
      if (costi) {
        let totale = 0;
        const per = {};
        for (const i of incarichi) {
          const k = this.contiDellIncarico(i);
          if (!(k.daFatturare > 0)) continue;
          per[i.soggetto_id] = centesimi((per[i.soggetto_id] || 0) + k.daFatturare);
          totale = centesimi(totale + k.daFatturare);
        }
        out.compensiDaFatturare = totale;
        if (this.livello('collaboratori') >= 2) {
          for (const id of Object.keys(per)) {
            voce(pianificare, { tipo: 'collaboratore', gravita: 'soldi', titolo: (nomi[id] || id) + ': ' + C.euroIt(per[id]) + ' € maturati da fatturare',
              dettaglio: 'Aspetta la sua fattura', quanto: per[id], unita: 'euro', collegamento: { pagina: 'collaboratore', id } });
          }
        }
      }
      // Esterni senza incarichi in corso da tanto: togli l'accesso? (non si toglie da solo).
      if (this.livello('amministrazione') >= 2) {
        const giorni = numero(imp.ACCESSO_ESTERNI_GIORNI) || 90;
        for (const u of this.db.righe("SELECT * FROM utenti WHERE ruolo = 'esterno' AND attivo = 1")) {
          if (affidati.some(i => i.soggetto_id === u.soggetto_id)) continue;
          const ultimo = this.db.riga("SELECT MAX(COALESCE(NULLIF(concluso_il, ''), NULLIF(annullato_il, ''), creato)) q FROM incarichi WHERE soggetto_id = ?", u.soggetto_id);
          const da = ultimo && ultimo.q ? dataIso(ultimo.q) : dataIso(u.creato);
          if (!da || giorniTra(da, adesso) < giorni) continue;
          voce(pianificare, { tipo: 'collaboratore', gravita: 'info', titolo: u.nome + ' non ha incarichi in corso da ' + giorni + ' giorni: togli l\'accesso?',
            dettaglio: 'Togli l\'accesso', collegamento: { pagina: 'collaboratore', id: u.soggetto_id } });
        }
      }
    }
    return out;
  },

  /**
   * La Dashboard dell'esterno (fase6.md §8.4 e §12.7): i suoi incarichi in corso con l'avanzamento, i suoi documenti in
   * scadenza ("Il DURC scade fra 7 giorni: carica quello nuovo"), i suoi lavori da inviare da piu' di una settimana
   * (06/11/2026: niente firma), le sue cose respinte. Niente soldi dello studio, niente clienti, niente persone.
   */
  dashboardEsterno() {
    const c = this.chi();
    const io = c.utente.id;
    const adesso = oggi();
    const sog = this.mioSoggetto();
    const urgenti = [];
    const settimana = [];
    const pianificare = [];
    const voce = (l, v) => l.push(Object.assign({ quanto: null, unita: null, dettaglio: '' }, v));
    const incarichi = sog ? this.db.righe("SELECT * FROM incarichi WHERE soggetto_id = ? AND stato = 'affidato' ORDER BY affidato_il", sog) : [];
    const commesse = {};
    this.db.righe('SELECT id, descrizione FROM commesse').forEach(m => { commesse[String(m.id).toUpperCase()] = m.descrizione; });
    for (const d of sog ? this.documentiInScadenzaDi(sog) : []) {
      const nome = d.tipoNome;
      voce(d.giorni < 0 ? urgenti : settimana, { tipo: 'collaboratore', gravita: d.giorni < 0 ? 'urgente' : 'attenzione',
        titolo: (scaduto(nome) === 'scaduta' ? 'La ' : 'Il ') + nome + (d.giorni < 0 ? ' è ' + scaduto(nome) + ' il ' + dataBreve(d.scade) : ' scade ' + (d.giorni === 0 ? 'oggi' : 'fra ' + plurale(d.giorni, 'giorno', 'giorni'))) + ': carica ' + (scaduto(nome) === 'scaduta' ? 'quella nuova' : 'quello nuovo'),
        dettaglio: '', collegamento: { pagina: 'collaboratore', id: sog } });
    }
    const rapportini = this.db.righe("SELECT * FROM rapportini WHERE utente_id = ? AND UPPER(stato) IN ('BOZZA', 'FIRMATO') AND stato_approvazione NOT IN ('da_approvare', 'respinto')", io);
    const settimanaFa = piuGiorni(adesso, -7);
    const vecchi = rapportini.filter(r => r.data && r.data < settimanaFa);
    if (vecchi.length) {
      voce(settimana, { tipo: 'rapportini', gravita: 'info', titolo: plurale(vecchi.length, 'lavoro da inviare', 'lavori da inviare') + ' da più di una settimana',
        dettaglio: vecchi.slice(0, 3).map(r => r.id).join(', '), quanto: vecchi.length, unita: 'lavori', collegamento: { pagina: 'rapportini', filtro: { quali: 'inviare', a: settimanaFa } } });
    }
    // 07/11/2026 (Ore tolte): le ore respinte non sono piu' una voce; restano i rapportini e le spese respinte.
    const respinte = [].concat(
      this.db.righe("SELECT 'rapportino' t, id, data, motivo m FROM rapportini WHERE utente_id = ? AND stato_approvazione = 'respinto'", io),
      this.db.righe("SELECT 'spesa' t, id, data, motivo m FROM spese WHERE utente_id = ? AND stato = 'respinta' AND tolta IS NULL", io));
    for (const r of respinte.slice(0, 5)) {
      voce(urgenti, { tipo: 'respinta', gravita: 'attenzione', titolo: (r.t === 'rapportino' ? r.id + ' respinto' : 'Spesa del ' + dataBreve(r.data) + ' respinta'),
        dettaglio: 'Motivo: ' + r.m, collegamento: { pagina: r.t === 'spesa' ? 'spese' : 'rapportini', filtro: { segmento: r.t === 'rapportino' ? 'rapportini' : 'spese' } } });
    }
    // 07/11/2026: le ore della settimana (riquadro "Ore della settimana") dai suoi rapportini, come per chi lavora nello studio.
    const lunedi = piuGiorni(adesso, -((new Date(adesso + 'T12:00:00').getDay() + 6) % 7));
    const oreSettimana = Math.round(this.db.righe("SELECT ore_lavoro, ore_extra, ore_viaggio, ore_totali FROM rapportini WHERE utente_id = ? AND UPPER(stato) <> 'ANNULLATO' AND data >= ? AND data <= ?", io, lunedi, adesso)
      .reduce((t, r) => t + (numero(r.ore_totali) || numero(r.ore_lavoro) + numero(r.ore_extra) + numero(r.ore_viaggio)), 0) * 100) / 100;
    const ordine = { urgente: 0, soldi: 1, attenzione: 2, info: 3 };
    const ordina = l => l.sort((a, b) => ordine[a.gravita] - ordine[b.gravita]).slice(0, 20);
    return {
      ok: true, per: 'esterno', oggi: adesso,
      numeri: { incarichi: { inCorso: incarichi.length }, rapportini: { daFirmare: 0, daInviare: rapportini.length, oreSettimana } },
      incarichi: incarichi.map(i => ({ id: i.id, numero: i.numero, idCommessa: i.commessa_id, commessa: commesse[String(i.commessa_id).toUpperCase()] || '', titolo: i.titolo,
        modo: i.modo, avanzamento: i.avanzamento, dal: i.dal, al: i.al })),
      urgenti: ordina(urgenti), settimana: ordina(settimana), pianificare: ordina(pianificare),
      giallo: 'rapportino',
    };
  },
};
