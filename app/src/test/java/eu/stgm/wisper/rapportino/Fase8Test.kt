package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * La fase 8 sul telefono senza server (fase8.md, la §0 sopra a tutto): le risposte di §13
 * lette campo per campo, le parole fisse di §15, le regole pure (segmenti delle integrazioni,
 * estratto della ricerca, riquadri e Altre N, il codice delle commesse coi casi condivisi).
 */
class Fase8Test {
    private val oggi = LocalDate.of(2026, 10, 22)

    private fun casi(nome: String): Any? =
        listOf("../server/prove/$nome", "server/prove/$nome").map(::File).firstOrNull { it.exists() }?.readText()?.trim()?.let { if (it.startsWith("[")) JSONArray(it) else JSONObject(it) }

    // ---------------------------------------------------------------------------- integrazioni (§4, §13.1)

    private val elenco = JSONObject("""{"ok": true, "integrazioni": [
        {"chiave": "postino", "nome": "Postino", "cosa": "Email, copie su Drive e foglio di ogni notte", "gruppo": "collegati", "stato": "collegato",
         "controllato": "2026-10-22T10:00:00", "millisecondi": 412, "esito": "Risponde", "account": "il Gmail del foglio di Wisper", "provaAdesso": true},
        {"chiave": "vies", "nome": "Verifica della partita IVA", "gruppo": "collegati", "stato": "errore", "controllato": "2026-10-22T08:30:00", "provaAdesso": true},
        {"chiave": "aggiornamenti", "nome": "Aggiornamenti delle app", "gruppo": "collegati", "stato": "collegato", "ultimoNonRiuscito": true, "vecchio": true},
        {"chiave": "porta", "nome": "Accesso da fuori casa (porta Google)", "gruppo": "collegati", "stato": "da_configurare"},
        {"chiave": "link", "nome": "Link che scade per i documenti", "gruppo": "collegati", "stato": "da_configurare", "segue": "portale", "provaAdesso": false},
        {"chiave": "onedrive", "nome": "Sfogliare OneDrive e SharePoint", "gruppo": "scelta", "stato": "dipende", "dipende": "Dipende da una scelta: è nelle domande della fase 8"},
        {"chiave": "sdi", "nome": "Invio allo SDI", "gruppo": "noncollegati", "stato": "non_collegato", "perche": "Le fatture le emette il programma di Manuel: Wisper le prepara",
         "costo": "Aruba circa 30 € l'anno più il Premium"}
    ], "numeri": {"collegati": 2, "daSistemare": 4, "noncollegati": 1, "errori": 1}, "fascia": ""}""")

    @Test
    fun `integrazioni come fase8 md 13 1, con le parole e i segmenti di 4 3`() {
        val e = ElencoIntegrazioni.daJson(elenco)
        assertEquals(7, e.integrazioni.size)
        val p = e.integrazioni.first()
        assertEquals("Collegato", p.parola)
        assertEquals("il Gmail del foglio di Wisper", p.account)
        assertEquals(412L, p.millisecondi)
        assertEquals("Errore", e.integrazioni[1].parola)
        assertEquals("Da configurare", e.integrazioni[3].parola)
        assertEquals("Dipende da una scelta", e.integrazioni[5].parola)
        assertEquals("Non collegato", e.integrazioni[6].parola)
        assertTrue("un solo controllo fallito resta Collegato, con la frase sotto", e.integrazioni[2].ultimoFallito)
        assertTrue(e.integrazioni[2].vecchio)
        // Collegati = gruppo collegati senza Errore; Da sistemare = Errore + Da configurare + quelli di Andrea (§4.3).
        assertEquals(7, e.di(SegmentoIntegrazioni.TUTTI).size)
        assertEquals(listOf("postino", "aggiornamenti", "porta", "link"), e.di(SegmentoIntegrazioni.COLLEGATI).map { it.chiave })
        assertEquals(listOf("vies", "porta", "link", "onedrive"), e.di(SegmentoIntegrazioni.DA_SISTEMARE).map { it.chiave })
        assertEquals(listOf("sdi"), e.di(SegmentoIntegrazioni.NON_COLLEGATI).map { it.chiave })
        assertEquals("si apre su Da sistemare se c'è un Errore", SegmentoIntegrazioni.DA_SISTEMARE, e.segmentoIniziale)
        assertEquals(SegmentoIntegrazioni.TUTTI, ElencoIntegrazioni(e.integrazioni.filter { !it.inErrore }).segmentoIniziale)
        // Niente controlli né Prova adesso per Non collegato e Dipende da una scelta.
        assertTrue(e.integrazioni[5].senzaControlli && e.integrazioni[6].senzaControlli)
        assertFalse(e.integrazioni[0].senzaControlli)
        assertFalse("link segue il portale: niente Prova adesso", e.integrazioni[4].provaAdesso)
    }

    @Test
    fun `la pagina di un collegamento con i controlli e le impostazioni del server`() {
        val i = Integrazione.daJson(JSONObject("""{"chiave": "calendario", "nome": "Calendario: abbonamento dal telefono", "gruppo": "collegati", "stato": "collegato",
            "controlli": [{"quando": "2026-10-22T09:40:00", "esito": "ok", "millisecondi": 38, "testo": "Letto da ICSx5"}, {"quando": "2026-10-22T08:40:00", "esito": "errore", "millisecondi": 8000, "testo": "Non risponde"}],
            "impostazioni": [{"chiave": "CALENDARIO_GIORNI_PRIMA", "etichetta": "Giorni passati nel calendario", "tipo": "numero", "min": 0, "max": 365, "unita": "giorni", "valore": 30},
                             {"chiave": "CALENDARIO_PUBBLICO", "etichetta": "Anche fuori casa (passa da Google)", "tipo": "si_no", "valore": false}]}"""))
        assertEquals(2, i.controlli.size)
        assertTrue(i.controlli[0].ok)
        assertFalse(i.controlli[1].ok)
        assertEquals(8000L, i.controlli[1].millisecondi)
        assertEquals("30", i.impostazioni[0].testo)
        assertFalse(i.impostazioni[1].acceso)
        assertEquals("Giorni passati nel calendario: da 0 a 365", i.impostazioni[0].errore("400"))
        assertNull(i.impostazioni[0].errore("30"))
        // Le impostazioni anche come oggetto chiave → valore (le parole allora sono quelle del telefono).
        val o = VoceImpostazione.elenco(JSONObject().put("RICERCA_FILE", true).put("RICERCA_FILE_MAX_MB", 20))
        assertEquals("Cerca anche dentro i file", o.first { it.chiave == "RICERCA_FILE" }.etichetta)
        assertEquals("MB", o.first { it.chiave == "RICERCA_FILE_MAX_MB" }.unita)
    }

    @Test
    fun `le parole del quando, del tempo e degli stati di 4 1`() {
        assertEquals("controllato oggi alle 10:00", Parole8.controllato("2026-10-22T10:00:00", oggi))
        assertEquals("controllato ieri alle 2:31", Parole8.controllato("2026-10-21T02:31:00", oggi))
        assertEquals("controllato il 18/10", Parole8.controllato("2026-10-18T06:00:00", oggi))
        assertEquals("nella storia dei controlli anche l'ora", "il 18/10 alle 6:00", Parole8.quando("2026-10-18T06:00:00", oggi, sempreOra = true))
        assertEquals("", Parole8.controllato("", oggi))
        assertEquals("in 412 ms", Parole8.tempo(412))
        assertEquals("in 8 s", Parole8.tempo(8000))
        assertEquals("", Parole8.tempo(0))
        assertEquals("In corso", Parole8.stato("in_corso"))
        assertEquals("Dipende da una scelta", Parole8.stato("non_collegato", "scelta"))
    }

    // ---------------------------------------------------------------------------- impostazioni generali (§9.4, §13.6)

    @Test
    fun `impostazioni generali a schede, cerca senza accenti`() {
        val g = GruppoImpostazioni.elenco(JSONObject("""{"ok": true, "gruppi": [
            {"chiave": "lavoro", "nome": "Lavoro e approvazioni", "voci": [
                {"chiave": "APPROVAZIONE", "etichetta": "Cosa va approvato", "tipo": "scelta", "scelte": [["collaboratori", "Le cose dei collaboratori"], ["tutti", "Tutto"], ["nessuno", "Niente"]], "valore": "collaboratori"},
                {"chiave": "ORE_GIORNALIERE", "etichetta": "Ore di lavoro al giorno", "tipo": "numero", "min": 1, "max": 12, "unita": "ore", "valore": 8}]},
            {"chiave": "fisco", "nome": "Fatture e banca", "collegamenti": [{"nome": "Impostazioni fiscali", "pagina": "amministrazione", "sezione": "fiscale"}], "voci": []},
            {"chiave": "portale", "nome": "Portale clienti", "azioni": [{"nome": "Spegni il portale adesso", "azione": "spegniPortale"}], "voci": [
                {"chiave": "PORTALE_TIPI_FILE", "etichetta": "Tipi di file accettati", "tipo": "elenco", "scelte": [["pdf", "PDF"], ["jpg", "JPG"]], "valore": ["pdf"]}]},
            {"chiave": "ticket", "nome": "Ticket e assistenza", "voci": [
                {"chiave": "TICKET_TEMPI", "etichetta": "Tempi dei ticket", "tipo": "tempi_ticket", "unita": "ore", "min": 1, "max": 720,
                 "righe": [["urgente", "Urgente"], ["alta", "Alta"]], "colonne": [["presa", "Presa in carico entro"], ["intervento", "Intervento entro"]],
                 "valore": {"urgente": {"presa": 1, "intervento": 4}, "alta": {"presa": 2, "intervento": 24}}},
                {"chiave": "WISPER_ORA_COPIA", "etichetta": "Ora della copia", "tipo": "sola_lettura", "valore": "2:30"}]}
        ]}"""))
        assertEquals(4, g.size)
        assertEquals(listOf("collaboratori" to "Le cose dei collaboratori", "tutti" to "Tutto", "nessuno" to "Niente"), g[0].voci[0].scelte)
        assertEquals("Ore di lavoro al giorno: da 1 a 12", g[0].voci[1].errore("13"))
        assertEquals("Ore di lavoro al giorno: scrivi un numero", g[0].voci[1].errore("otto"))
        assertEquals("fiscale", g[1].collegamenti.single().sezione)
        assertFalse("solo collegamenti: niente Salva", g[1].salvabile)
        assertEquals("spegniPortale", g[2].azioni.single().second)
        assertEquals(listOf("urgente" to "Urgente", "alta" to "Alta"), g[3].voci[0].righe)
        assertEquals(2, g[3].voci[0].colonne.size)
        // Cerca un'impostazione: nel nome del gruppo o nelle etichette, senza maiuscole e accenti.
        assertEquals(listOf("lavoro"), GruppoImpostazioni.filtra(g, "approvato").map { it.chiave })
        assertEquals(listOf("ORE_GIORNALIERE"), GruppoImpostazioni.filtra(g, "ORE di LAVORO").single().voci.map { it.chiave })
        assertEquals("Ticket e assistenza: tutto il gruppo", 2, GruppoImpostazioni.filtra(g, "ticket").single().voci.size)
        assertEquals(4, GruppoImpostazioni.filtra(g, "  ").size)
        assertEquals(listOf("fisco"), GruppoImpostazioni.filtra(g, "fiscali").map { it.chiave })
    }

    // ---------------------------------------------------------------------------- calendario (§0.3, §5)

    @Test
    fun `gli indirizzi del calendario, letto e mai letto, e il webcal`() {
        val e = ElencoFeed.daJson(JSONObject("""{"ok": true, "feed": [
            {"id": 2, "nome": "Telefono di Manuel", "cosa": {"attivita": "mie", "assenze": true, "scadenze": false}, "dettagli": true, "pubblico": false,
             "creato": "2026-10-22T10:05:00", "ultimoUso": "2026-10-22T09:40:00", "agente": "ICSx5/2.4.3", "letture": 214},
            {"id": 3, "nome": "Outlook in ufficio", "cosa": {"attivita": "studio", "assenze": false, "scadenze": true}, "dettagli": false}]}"""))
        assertFalse(e.fuoriCasaAcceso)
        val f = e.feed[0]
        assertEquals("letto oggi alle 9:40 · ICSx⁵", f.letto(oggi))
        assertEquals("Le mie cose · ferie e assenze", f.cosa.visto)
        assertEquals("Con i dettagli", f.parolaDettagli)
        assertEquals("Mai letto", e.feed[1].letto(oggi))
        assertEquals("Tutto lo studio · scadenze", e.feed[1].cosa.visto)
        assertEquals("Senza dettagli", e.feed[1].parolaDettagli)
        assertEquals("Outlook", FeedCalendario.appDa("Microsoft Outlook 16.0"))
        assertTrue(ElencoFeed.daJson(JSONObject().put("feed", JSONArray()).put("calendarioPubblico", true)).fuoriCasaAcceso)
        val n = FeedCreato.daJson(JSONObject("""{"ok": true, "feed": {"id": 4, "nome": "Telefono"}, "indirizzo": "http://10.0.2.2:8720/calendario/Q2hp.ics"}"""))
        assertEquals("webcal://10.0.2.2:8720/calendario/Q2hp.ics", n.webcal)
        assertEquals(JSONObject("""{"attivita":"studio","assenze":true,"scadenze":false}""").toString(), CosaCalendario("studio", true, false).aJson().toString())
    }

    // ---------------------------------------------------------------------------- ricerca dentro i file (§6)

    @Test
    fun `l'estratto della ricerca col grassetto tra parentesi quadre`() {
        assertEquals(
            listOf("…la verifica dell'impianto di " to false, "terra" to true, " è stata eseguita…" to false),
            TrovatoNelTesto.pezzi("…la verifica dell'impianto di [terra] è stata eseguita…"),
        )
        assertEquals(listOf("[" to false, "terra" to true), TrovatoNelTesto.pezzi("[[terra]"))
        assertEquals(listOf("niente" to false), TrovatoNelTesto.pezzi("niente"))
        // Una riga sola: si comincia poco prima della parola trovata.
        val lungo = "Verbale di verifica periodica - Magazzino automatico di Schio La verifica dell'impianto di [terra]…"
        assertEquals("…La verifica dell'impianto di [terra]…", TrovatoNelTesto.vicino(lungo))
        assertEquals("…la verifica di [terra]", TrovatoNelTesto.vicino("…la verifica di [terra]"))
        assertEquals("nella rev. 1 (superata)", TrovatoNelTesto(1, true, "x").nota)
        assertEquals("", TrovatoNelTesto(2, false, "x").nota)
        val d = DocArchivio.daJson(JSONObject("""{"id": 7, "titolo": "Relazione tecnica cabina MT", "trovato": {"revisione": 2, "superata": false, "estratto": "di [terra] è"}}"""))
        assertEquals("di [terra] è", d.trovato!!.estratto)
        assertNull(DocArchivio.daJson(JSONObject("""{"id": 8, "titolo": "Senza"}""")).trovato)
        assertTrue(FiltroArchivio(testo = "terra", dentro = false).parametri().contains("dentro" to "false"))
        assertTrue("di base decide il server", FiltroArchivio(testo = "terra").parametri().none { it.first == "dentro" })
    }

    @Test
    fun `la riga calma di come è stato letto un file`() {
        assertEquals("Testo letto il 21/10 · 12 pagine", LetturaFile.daJson(JSONObject("""{"stato": "letto", "caratteri": 18420, "pagine": 12, "letto": "2026-10-21T16:40:00"}""")).frase)
        assertEquals("Senza testo: è una scansione o un disegno", LetturaFile("senza_testo").frase)
        assertEquals("Letto in parte: è molto lungo", LetturaFile("in_parte").frase)
        assertEquals("Non si legge", LetturaFile("non_si_legge").frase)
        assertEquals("Da leggere", LetturaFile("da_leggere").frase)
    }

    // ---------------------------------------------------------------------------- importa ed esporta (§7)

    @Test
    fun `importa clienti e fornitori, le risposte dei quattro passi`() {
        val l = LetturaImport.daJson(JSONObject("""{"ok": true, "idLettura": "L1", "colonne": [{"intestazione": "Ragione sociale", "campo": "nome", "esempi": ["Rossi Impianti Srl", "Verdi Snc"]},
            {"intestazione": "Fax", "campo": "", "esempi": []}], "righe": 52}"""))
        assertEquals(52, l.righe)
        assertEquals("nome", l.colonne[0].campo)
        assertEquals("Non importare", ColonnaImport.nomeCampo(l.colonne[1].campo))
        val k = ControlloImport.daJson(JSONObject("""{"ok": true, "nuovi": 42, "completati": 7, "daSistemare": [{"riga": 14, "errore": "Partita IVA: il numero non torna, controlla le cifre"}], "anteprima": []}"""))
        assertEquals("Importa 42 e completa 7", k.azione)
        assertEquals(14, k.daSistemare.single().riga)
        assertEquals("Importa 3", ControlloImport(3, 0, emptyList(), emptyList()).azione)
        val x = Importazione.daJson(JSONObject("""{"id": 3, "nuovi": 42, "completati": 7, "saltati": 3, "nomeFile": "clienti-fatture.csv"}"""))
        assertEquals("Importati 42 clienti, completati 7, saltati 3", x.frase())
        assertFalse(x.archiviata)
        val e = Esportazione.daJson(JSONObject("""{"id": 4, "stato": "pronta", "byte": 3480112, "creato": "2026-10-22T10:05:00", "scade": "2026-10-29T10:05:00"}"""))
        assertTrue(e.pronta)
        assertEquals("wisper-tutto-2026-10-22.zip", e.nome)
        assertEquals("3,3 MB", Testi8.peso(e.byte))
    }

    // ---------------------------------------------------------------------------- dashboard (§8, §13.5)

    @Test
    fun `la Dashboard con le regole nuove, quante, riquadri e numerini`() {
        val d = Dashboard.daJson(JSONObject("""{"ok": true,
            "urgenti": [{"tipo": "ticket", "titolo": "TK/2026/0016 urgente", "gravita": "urgente", "oggetto": "ticket:23", "famiglia": "ticket", "area": "documenti",
                          "dettaglio": "Rossi Impianti Srl · dal portale", "collegamento": {"pagina": "ticket", "id": 16}}],
            "settimana": [], "pianificare": [{"tipo": "persona", "titolo": "Saldo delle ferie", "gravita": "info", "nascondibile": true, "oggetto": "persona:2", "area": "persone"},
              {"tipo": "approvare", "titolo": "7 cose da approvare", "collegamento": {"pagina": "approvare"}, "righe": [
                 {"nome": "Ore e rapportini › Da approvare", "numero": 4, "collegamento": {"pagina": "rapportini", "filtro": {"segmento": "daApprovare"}}}]}],
            "quante": {"urgenti": 9, "settimana": 0, "pianificare": 2},
            "riquadri": [{"chiave": "daFatturare", "numero": 2180.4, "unita": "euro", "rosso": false, "collegamento": {"pagina": "fatturazione"}, "nome": "Da fatturare"},
                         {"chiave": "scaduto", "numero": 634.9, "unita": "euro", "rosso": true}, {"chiave": "ticketAperti", "numero": 5, "unita": "ticket"},
                         {"chiave": "oreSettimana", "numero": 31.5, "unita": "ore"}],
            "riquadriDaScegliere": [{"chiave": "daFatturare", "nome": "Da fatturare"}, {"chiave": "scaduto", "nome": "Scaduto"}],
            "nascoste": 3, "numerini": {"rapportini": 8, "integrazioni": 1}}"""))
        assertTrue(d.regoleNuove)
        assertEquals(9, d.quante["urgenti"])
        assertEquals("ticket:23", d.urgenti[0].oggetto)
        assertEquals("documenti", d.urgenti[0].area)
        assertTrue(d.pianificare[0].nascondibile)
        assertEquals(4, d.pianificare[1].pezzi.single().numero)
        assertEquals("Ore e rapportini › Da approvare", d.pianificare[1].pezzi.single().titolo)
        assertEquals(listOf("daFatturare", "scaduto"), d.riquadriPossibili)
        assertEquals(3, d.nascoste)
        assertEquals(1, d.integrazioniErrore)
        assertEquals(8, d.numerini!!["rapportini"])
        val r = d.riquadri!!
        assertEquals("2.180,40 €", r[0].visto)
        assertEquals("da fatturare", r[0].nome)
        assertTrue(r[1].rosso)
        assertEquals("5", r[2].visto)
        assertEquals("ticket aperti", r[2].nome)
        assertEquals("31,5 h", r[3].visto)
        assertEquals("fatturazione", r[0].collegamento!!.pagina)
        // Altre N: quante del server meno quelle arrivate (mai sotto zero).
        assertEquals(6, Sezioni8.altre(13, 7))
        assertEquals(0, Sezioni8.altre(5, 5))
        assertEquals(0, Sezioni8.altre(null, 4))
        // Un server di prima: niente riquadri, le regole di sempre.
        assertFalse(Dashboard.daJson(JSONObject("""{"urgenti": [], "settimana": [], "pianificare": []}""")).regoleNuove)
        assertNull(Dashboard.daJson(JSONObject("""{"urgenti": []}""")).numerini)
    }

    // ---------------------------------------------------------------------------- amministrazione (§9)

    @Test
    fun `funzioni accese, notifiche, sicurezza, prove delle copie, stato del sistema, lista di controllo`() {
        val f = Funzione.elenco(JSONObject("""{"funzioni": [{"modulo": "portale", "nome": "Portale clienti", "accesa": false, "spegnibile": true, "cosaCambia": "Sparisce dal menu di tutti."},
            {"modulo": "rapportini", "nome": "Ore e rapportini", "accesa": true, "spegnibile": false}, {"modulo": "mezzi", "nome": "Mezzi e attrezzature", "accesa": true, "spegnibile": true}]}"""))
        assertEquals(listOf("Spenta", "Sempre accesa", "Accesa"), f.map { it.parola })
        assertEquals("2 di 3 accese · spente: Portale clienti", Funzione.riassunto(f))
        // Dal 03/11/2026 si spengono tutte, con le dipendenze (progetti.md §5): il foglio di conferma dice le altre.
        val tutte = Funzione.elenco(JSONObject("""{"funzioni": [
            {"modulo": "clienti", "nome": "Clienti e fornitori", "accesa": false, "spegnibile": true, "richiede": [], "serveA": ["commesse", "progetti"]},
            {"modulo": "commesse", "nome": "Commesse", "accesa": false, "spegnibile": true, "richiede": ["clienti"], "serveA": ["progetti"]},
            {"modulo": "progetti", "nome": "Progetti", "accesa": false, "spegnibile": true, "richiede": ["clienti", "commesse"], "serveA": []}]}"""))
        val progetti = tutte.last()
        assertEquals(listOf("clienti", "commesse"), progetti.richiede)
        assertEquals("Si accendono anche: Clienti e fornitori, Commesse.", Funzione.fraseAnche(progetti, true, tutte))
        val accese = tutte.map { it.copy(accesa = true) }
        assertEquals("Si spengono anche: Commesse, Progetti.", Funzione.fraseAnche(accese.first(), false, accese))
        assertEquals("", Funzione.fraseAnche(accese.last(), false, accese))
        // L'avviso dopo il salvataggio, con le parole del computer (regole-fase8.js, avvisoCambio).
        assertEquals("Commesse spenta, e anche Progetti e Collaboratori esterni: i dati restano",
            Funzione.avvisoCambio("Commesse", false, listOf("Progetti", "Collaboratori esterni")))
        assertEquals("Progetti riaccesa, e anche Commesse: i dati sono come prima", Funzione.avvisoCambio("Progetti", true, listOf("Commesse")))
        assertEquals("Mezzi e attrezzature spenta: i dati restano", Funzione.avvisoCambio("Mezzi e attrezzature", false, emptyList()))

        val n = PreferenzeNotifiche.daJson(JSONObject("""{"telefono": true, "silenzioSera": false, "tipi": {"assegnato": true, "file_portale": false, "esportazione_pronta": true}}"""))
        assertFalse(n.silenzioSera)
        assertEquals(listOf("Lavoro", "Clienti e portale", "Per te"), PreferenzeNotifiche.gruppiDi(n.tipi).map { it.first })
        assertFalse(n.tipi["file_portale"]!!)

        val s = Sicurezza.daJson(JSONObject("""{"internetInterno": {"ok": true, "ultimo": null}, "copiaCifrata": false, "accessiSbagliati": {"giorni": 30, "quanti": 3, "blocchi": 0, "chi": []},
            "dispositiviFermi": [{"id": 9, "utente": "Paola Rossi", "dispNome": "PC dello studio Rossi", "app": "computer 0.9.0", "ultimoUso": "2026-08-02T10:00:00"}],
            "utentiFermi": [], "passwordIniziali": [{"idUtente": 3, "nome": "Marco Rossato"}], "sessioneGiorni": 180, "tuttoAPosto": false, "primaCosa": "Marco Rossato non ha ancora cambiato la password iniziale"}"""))
        assertEquals("Marco Rossato non ha ancora cambiato la password iniziale", s.riassunto)
        assertFalse(s.tuttoAPosto)
        assertEquals("PC dello studio Rossi", s.dispositiviFermi.single().nome)
        assertEquals("Paola Rossi", s.dispositiviFermi.single().persona)
        assertEquals("", s.bloccatoChi)
        assertTrue(Sicurezza.chiaveBenScritta("K7QM-XR4T-9HVB-2NWE-PD6S-ACJ8-UY3F-MZ5G"))
        assertFalse("niente 0, O, 1, I, L", Sicurezza.chiaveBenScritta("K7QM-XR4T-9HVB-2NWE-PD6S-ACJ8-UY3F-MZ5L"))
        assertTrue(Sicurezza.daJson(JSONObject("""{"internetInterno": {"ok": true}, "copiaCifrata": true}""")).tuttoAPosto)

        val k = CopieERipristino.daJson(JSONObject("""{"copie": [{"quando": "2026-10-22T02:30:00", "nome": "wisper-20261022.db", "locale": "ok", "fuori": "ok · 3 file", "foglio": "ok"}],
            "prove": [{"id": 7, "tipo": "automatica", "copia": "wisper-20261022.db", "esito": "ok", "quando": "2026-10-22T02:45:00", "integrita": "ok",
                       "conteggi": {"rapportini": [1532, 1532]}, "file": {"provati": 20, "giusti": 20}, "fuori": {"md5": "giusto"}}], "prossimaProva": "2026-11-21"}"""))
        assertEquals("Tutto torna", k.ultimaAutomatica!!.parola)
        assertEquals(true, k.ultimaAutomatica!!.righeGiuste)
        assertEquals(20, k.ultimaAutomatica!!.fileGiusti)
        assertTrue(k.provata("wisper-20261022.db"))
        assertNull(k.ultimaAMano)
        assertEquals(5, CopieERipristino.CONTROLLI.size)

        val st = StatoSistema.daJson(JSONObject("""{"server": {"versione": "1.0.0", "acceso": "2026-10-10T07:12:00", "schema": 8, "node": "24.12.0", "ora": "2026-10-22T10:05:12",
            "differenzaSecondi": -360, "avvisoOra": "L'ora del NAS è indietro di 6 minuti: i rapportini prendono l'ora del NAS"},
            "database": {"mb": 86, "integrita": "ok"}, "lavori": [{"nome": "Copia", "quando": "2026-10-22T02:30:00", "esito": "ok"}, {"nome": "Foglio", "esito": "errore"}]}"""))
        assertEquals(8, st.schema)
        assertEquals("L'ora del NAS è indietro di 6 minuti: i rapportini prendono l'ora del NAS", st.fraseOra)
        assertEquals(listOf(true, false), st.lavoriOk)
        assertEquals("12 giorni", st.accesoDa(java.time.LocalDateTime.of(2026, 10, 22, 10, 0)))
        assertNull(StatoSistema.daJson(JSONObject("""{"server": {"differenzaSecondi": 30}}""")).fraseOra)

        val c = ControlliFinali.daJson(JSONObject("""{"riassunto": {"fatti": 41, "totale": 58, "nonVanno": 2, "attesa": 3}, "gruppi": [
            {"nome": "01 Dashboard", "righe": [{"chiave": "M01.1", "testo": "Ogni ruolo vede le sue voci", "tipo": "automatica", "chi": "Andrea", "stato": "fatto"},
                                              {"chiave": "M01.2", "testo": "Ogni voce apre la pagina giusta", "tipo": "automatica", "stato": "da_rifare"}]},
            {"nome": "17 Integrazioni", "righe": [{"chiave": "M17.1", "testo": "Nessuna integrazione in Errore", "tipo": "server", "stato": "non_va"}]}]}"""))
        assertEquals("41 di 58 fatti · 2 non vanno · 3 in attesa di una scelta", c.frase)
        assertEquals(70, c.percento)
        assertEquals("Da rifare", c.gruppi[0].righe[1].parola)
        assertEquals(listOf("M01.2"), c.filtra("dafare").flatMap { it.righe }.map { it.chiave })
        assertEquals(listOf("M17.1"), c.filtra("nonvanno").flatMap { it.righe }.map { it.chiave })
        assertTrue(c.gruppi[1].righe[0].dalServer)
        assertEquals("Dal server", c.gruppi[1].righe[0].tipoVisto)
        // Il cambio: senza "cambio" nella risposta si è prima; con la data, la frase la dice.
        assertEquals("Prima del cambio", c.cambio.frase())
        val fatto = StatoCambio.daJson(JSONObject("""{"stato": "fatto", "provaIl": "2026-11-01T18:00", "cambioIl": "2026-11-05T20:30"}"""))
        assertEquals("Cambio fatto il 05/11 alle 20:30", fatto.frase(java.time.LocalDate.of(2026, 11, 8)))
        assertEquals("Cambio fatto oggi alle 20:30", fatto.frase(java.time.LocalDate.of(2026, 11, 5)))
        assertEquals(listOf("prima", "prova", "fatto", "chiuso"), StatoCambio.STATI.map { it.first })
    }

    @Test
    fun `io dice le funzioni spente, il nome breve e il logo`() {
        val i = Interfaccia.daJson(JSONObject("""{"funzioniSpente": ["mezzi", "portale"], "nomeBreve": "Studio GM", "logo": "/file/L1", "oraServer": "2026-10-22T10:05:00"}"""))
        assertEquals(listOf("mezzi", "portale"), i.funzioniSpente)
        assertEquals("Studio GM", i.nomeBreve)
        assertEquals(i, Interfaccia.daJson(i.aJson()))
        assertTrue(Interfaccia.daJson(null).funzioniSpente.isEmpty())
    }

    @Test
    fun `Integrazioni nel menu e nei permessi iniziali come l'architettura`() {
        fun l(ruolo: String) = Permessi.iniziali(ruolo).livello(Moduli.INTEGRAZIONI)
        assertEquals(2, l(Ruoli.TITOLARE))
        assertEquals(2, l(Ruoli.AMMINISTRAZIONE))
        assertEquals(0, l(Ruoli.COLLABORATORE))
        assertEquals(1, l(Ruoli.LETTURA))
        assertEquals(0, l(Ruoli.ESTERNO))
        val ordine = Moduli.FUNZIONANTI
        assertEquals("dopo Collaboratori esterni, prima di Amministrazione", ordine.indexOf(Moduli.COLLABORATORI) + 1, ordine.indexOf(Moduli.INTEGRAZIONI))
        assertEquals(ordine.indexOf(Moduli.INTEGRAZIONI) + 1, ordine.indexOf(Moduli.AMMINISTRAZIONE))
    }

    // ---------------------------------------------------------------------------- il codice delle commesse (§9.6)

    @Test
    fun `il codice delle commesse coi casi di fase8 md 9 6, anche senza il file`() {
        assertEquals("26ST047", CodiceCommessa.codiceDa("{AA}ST{NNN}", 2026, 47))
        assertEquals("26ST1000", CodiceCommessa.codiceDa("{AA}ST{NNN}", 2026, 1000))
        assertEquals("ST26-0048", CodiceCommessa.codiceDa("ST{AA}-{NNNN}", 2026, 48))
        assertEquals("2026/05", CodiceCommessa.codiceDa("{AAAA}/{NN}", 2026, 5))
        assertEquals("RAP/2027/0001", CodiceCommessa.codiceDa("RAP/{AAAA}/{NNNN}", 2027, 1))
        assertEquals("048", CodiceCommessa.codiceDa("{NNN}", 2026, 48))
        // I pezzi del formato (Anno · Testo · Ordine · Separatore · Cifre) e ritorno.
        assertEquals("{AA}ST{NNN}", FormatoCommessa().formato)
        assertEquals("ST{AA}-{NNNN}", FormatoCommessa("AA", "ST", annoPrima = false, separatore = "-", cifre = 4).formato)
        assertEquals("{AAAA}/{NNN}", FormatoCommessa("AAAA", "", true, "/", 3).formato)
        assertEquals("ST{NNN}", FormatoCommessa("", "ST", false, "", 3).formato)
        for (f in listOf("{AA}ST{NNN}", "ST{AA}-{NNNN}", "{AAAA}/{NNN}", "ST{NNN}", "{AA}-{NNNN}")) assertEquals(f, FormatoCommessa.da(f).formato)
        // Il numero continua dal più alto, anche col formato di prima; due commesse di fila senza rete → 48 e 49.
        assertEquals(47, CodiceCommessa.numeroDa("{AA}ST{NNN}", "26ST047"))
        assertNull(CodiceCommessa.numeroDa("{AA}ST{NNN}", "ST26-0048"))
        assertEquals(48, CodiceCommessa.numeroDa("ST{AA}-{NNNN}", "ST26-0048"))
        val codici = listOf("26ST001", "26ST047", "25ST118")
        assertEquals(119, CodiceCommessa.prossimo(listOf("ST{AA}-{NNNN}", "{AA}ST{NNN}"), codici))
        assertEquals(48, CodiceCommessa.prossimo(listOf("{AA}ST{NNN}"), listOf("26ST001", "26ST047")))
        assertEquals(49, CodiceCommessa.prossimo(listOf("ST{AA}-{NNNN}", "{AA}ST{NNN}"), listOf("26ST047", "ST26-0048")))
    }

    @Test
    fun `il codice delle commesse coi casi condivisi di server prove casi-numerazioni json`() {
        val c = casi("casi-numerazioni.json")
        assumeTrue("Manca server/prove/casi-numerazioni.json", c != null)
        val elenco = when (c) {
            is JSONArray -> c.oggetti()
            is JSONObject -> (c.optJSONArray("casi") ?: c.optJSONArray("codiceDa") ?: JSONArray()).oggetti()
            else -> emptyList()
        }
        var provati = 0
        elenco.forEach { x ->
            val atteso = x.testo("codice").ifBlank { x.testo("atteso") }
            val formato = x.testo("formato")
            val anno = x.numero("anno")?.toInt()
            val numero = x.numero("numero")?.toInt()
            if (atteso.isNotBlank() && formato.isNotBlank() && anno != null && numero != null) {
                assertEquals(x.testo("nome").ifBlank { formato }, atteso, CodiceCommessa.codiceDa(formato, anno, numero))
                provati++
            }
            // Senza rete: il prossimo dal più alto tra i codici già scritti (col formato di adesso o di prima).
            val codici = x.optJSONArray("codici")?.stringhe()
            val formati = x.optJSONArray("formati")?.stringhe() ?: listOfNotNull(formato.ifBlank { null })
            val prossimi = x.optJSONArray("prossimi")?.stringhe()
            if (codici != null && prossimi != null && anno != null && formati.isNotEmpty()) {
                var gia: List<String> = codici
                prossimi.forEach { p ->
                    val n = CodiceCommessa.prossimo(formati, gia)
                    assertEquals(x.testo("nome"), p, CodiceCommessa.codiceDa(formati.first(), anno, n))
                    gia = gia + p
                }
                provati++
            }
        }
        assertTrue("almeno 6 casi provati, ne ho provati $provati", provati >= 6)
    }
}
