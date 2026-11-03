package eu.stgm.wisper.rapportino

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * La fase 8 del telefono contro il server di prova vero (fase8.md §13, con la §0): le
 * integrazioni (Prova adesso una volta al minuto, i permessi), il calendario (file e
 * indirizzo letto davvero via HTTP, poi tolto), la ricerca dentro i file, la Dashboard coi
 * riquadri e le voci nascoste, le impostazioni generali, le funzioni spente e riaccese, le
 * notifiche, la sicurezza, le copie, lo stato del sistema, la lista di controllo, importa ed
 * esporta. Si lanciano con `node server/prove/telefono.js` (ServerDiProva.kt): ognuna crea
 * quello che le serve o rimette com'era, e passa anche due volte di fila.
 */
class ServerDiProvaFase8Test {
    private val indirizzo = ServerDiProva.indirizzo

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-8", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }
    private val unico = System.nanoTime().toString().takeLast(7)

    private suspend fun <T> rifiutato(cosa: String, lavoro: suspend () -> T): PonteServer.Rifiutato {
        try {
            lavoro()
        } catch (e: PonteServer.Rifiutato) {
            return e
        }
        fail("$cosa: doveva dire di no")
        throw IllegalStateException()
    }

    // ---------------------------------------------------------------------------- integrazioni (§4, §13.1)

    @Test
    fun `integrazioni come fase8 md 13 1, senza segreti, e la pagina di un collegamento`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val f = Fase8(p)
        val grezzo = p.leggiAzione("integrazioni")
        val e = ElencoIntegrazioni.daJson(grezzo)
        assertEquals("l'elenco unico di §3.1", 26, e.integrazioni.size)
        assertTrue(e.integrazioni.all { it.nome.isNotBlank() && it.gruppo in setOf("collegati", "scelta", "noncollegati") })
        assertTrue(e.integrazioni.filter { it.gruppo == "noncollegati" }.all { it.perche.isNotBlank() && it.parola == "Non collegato" })
        assertTrue(e.integrazioni.filter { it.gruppo == "scelta" }.all { it.parola == "Dipende da una scelta" || it.stato == "collegato" || it.stato == "da_configurare" })
        // Nessun segreto, indirizzo del foglio o del NAS nelle risposte (§4.4).
        val testo = grezzo.toString()
        assertFalse(testo.contains("/exec"))
        assertFalse(testo.contains("script.google.com"))
        // I nomi delle chiavi del .env si possono dire ("manca SEGRETO_SERVER", §0.2), i valori no.
        assertFalse(Regex("""[A-Za-z0-9_-]{40,}""").containsMatchIn(testo))
        // I segmenti si contano come si filtrano.
        assertEquals(e.integrazioni.size, e.di(SegmentoIntegrazioni.TUTTI).size)
        assertTrue(e.di(SegmentoIntegrazioni.DA_SISTEMARE).all { it.daSistemare })
        val v = f.integrazione("vies")
        assertEquals("vies", v.chiave)
        assertTrue(v.controlli.size <= 20)
        val r = f.integrazione("ricerca")
        assertTrue("la ricerca ha le sue impostazioni", r.impostazioni.any { it.chiave == "RICERCA_FILE" })
        assertTrue(r.impostazioni.all { it.etichetta.isNotBlank() })
    }

    @Test
    fun `Prova adesso al massimo una volta al minuto, mai su un Non collegato`() = runBlocking<Unit> {
        val f = Fase8(entra("manuel@esempio.it"))
        // La prima può trovare la prova del giro di prima (meno di un minuto fa): allora dice di aspettare.
        try {
            val n = f.provaIntegrazione("ricerca")
            assertEquals("ricerca", n.chiave)
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message, e.message.orEmpty().contains("minuto"))
        }
        val di = rifiutato("di nuovo entro un minuto") { f.provaIntegrazione("ricerca") }
        assertTrue(di.message, di.message.orEmpty().contains("minuto"))
        val nc = rifiutato("un Non collegato") { f.provaIntegrazione("sdi") }
        assertTrue(nc.message, nc.message.orEmpty().contains("Non è collegato"))
    }

    @Test
    fun `Marco non vede le integrazioni, la lettura le vede ma non prova`() = runBlocking<Unit> {
        rifiutato("collaboratore") { Fase8(entra("marco@esempio.it")).integrazioni() }.let { assertTrue(it is PonteServer.PermessoNegato) }
        val l = Fase8(entra("lettura@esempio.it"))
        assertTrue(l.integrazioni().integrazioni.isNotEmpty())
        rifiutato("lettura che prova") { l.provaIntegrazione("vies") }.let { assertTrue(it is PonteServer.PermessoNegato) }
    }

    // ---------------------------------------------------------------------------- calendario (§0.3, §5)

    @Test
    fun `il file del calendario e un indirizzo letto davvero, poi tolto`() = runBlocking<Unit> {
        val f = Fase8(entra("manuel@esempio.it"))
        val (nome, _, byte) = f.esportaCalendario("mie", assenze = true, scadenze = false)
        assertTrue(nome.endsWith(".ics"))
        val ics = String(byte, Charsets.UTF_8)
        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\n"))
        assertTrue("niente soldi nel calendario", !ics.contains("€"))

        val creato = f.nuovoFeed("Prova telefono $unico", CosaCalendario("mie", true, false), dettagli = true, pubblico = false)
        assertTrue(creato.indirizzo.contains("/calendario/") && creato.indirizzo.endsWith(".ics"))
        assertTrue(creato.webcal.startsWith("webcal://"))
        assertFalse("fuori casa è spento: nasce in casa", creato.feed.pubblico)
        val mio = f.feedCalendario().feed.firstOrNull { it.nome == "Prova telefono $unico" }
        assertNotNull(mio)
        assertEquals("Mai letto", mio!!.letto())
        // L'app del calendario lo legge senza Authorization (§5.5): la chiave è il permesso.
        val http = OkHttpClient()
        http.newCall(Request.Builder().url(creato.indirizzo).header("User-Agent", "ICSx5/2.4.3 prove").get().build()).execute().use { r ->
            assertEquals(200, r.code)
            assertTrue(r.header("Content-Type").orEmpty().startsWith("text/calendar"))
            assertTrue(r.body!!.string().startsWith("BEGIN:VCALENDAR"))
        }
        val letto = f.feedCalendario().feed.first { it.id == mio.id }
        assertEquals("ICSx⁵", letto.app)
        assertTrue(letto.letture >= 1)
        f.revocaFeed(mio.id)
        http.newCall(Request.Builder().url(creato.indirizzo).get().build()).execute().use { r -> assertEquals("tolto: 404 come una chiave sbagliata", 404, r.code) }
        assertTrue(f.feedCalendario().feed.none { it.id == mio.id })
        val senzaNome = rifiutato("senza nome") { f.nuovoFeed(" ", CosaCalendario(), true, false) }
        assertTrue(senzaNome.message, senzaNome.message.orEmpty().startsWith("Nome"))
    }

    @Test
    fun `Marco scarica le sue cose, non quelle dello studio`() = runBlocking<Unit> {
        val f = Fase8(entra("marco@esempio.it"))
        assertTrue(String(f.esportaCalendario("mie", true, false).third, Charsets.UTF_8).startsWith("BEGIN:VCALENDAR"))
        rifiutato("tutto lo studio") { f.esportaCalendario("studio", true, false) }.let { assertTrue(it is PonteServer.PermessoNegato) }
    }

    // ---------------------------------------------------------------------------- ricerca dentro i file (§6)

    @Test
    fun `cerca dentro i file, gli estratti tra parentesi quadre e come è stato letto un file`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val l = Fase5(p).documenti(FiltroArchivio(testo = "terra", dentro = true)).documenti
        l.mapNotNull { it.trovato }.forEach { t -> assertTrue(t.estratto, t.estratto.contains("[") && t.estratto.contains("]")) }
        // La sintassi della ricerca nelle parole non rompe niente (§16).
        Fase5(p).documenti(FiltroArchivio(testo = "\"terra* OR NEAR(", dentro = true))
        l.firstOrNull { it.idFile.isNotBlank() }?.let { d ->
            val s = Fase8(p).letturaFile(d.idFile)
            assertTrue(s.stato, s.stato in setOf("da_leggere", "letto", "in_parte", "senza_testo", "non_si_legge", "troppo_grande"))
        }
    }

    // ---------------------------------------------------------------------------- dashboard (§8, §13.5)

    @Test
    fun `la Dashboard coi quattro riquadri, quante, e Cambia i riquadri rimesso com'era`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val f = Fase8(p)
        val d = Dashboard.daJson(p.dashboard())
        assertTrue("il server della fase 8 manda i riquadri", d.regoleNuove)
        assertEquals(4, d.riquadri!!.size)
        assertTrue(d.urgenti.size <= 7 && d.settimana.size <= 7 && d.pianificare.size <= 5)
        listOf("urgenti" to d.urgenti, "settimana" to d.settimana, "pianificare" to d.pianificare).forEach { (k, l) -> assertTrue(k, (d.quante[k] ?: l.size) >= l.size) }
        val oggetti = (d.urgenti + d.settimana + d.pianificare).map { it.oggetto }.filter { it.isNotBlank() }
        assertEquals("una cosa, una voce", oggetti.size, oggetti.toSet().size)
        val tutto = f.dashboardTutto()
        assertEquals(d.quante["urgenti"] ?: d.urgenti.size, tutto.urgenti.size)

        val prima = d.riquadri!!.map { it.chiave }
        val possibili = d.riquadriPossibili.ifEmpty { prima }
        val nuovi = (possibili.reversed() + prima).distinct().take(4)
        try {
            f.salvaRiquadri(nuovi)
            assertEquals(nuovi, Dashboard.daJson(p.dashboard()).riquadri!!.map { it.chiave })
            val no = rifiutato("un riquadro inventato") { f.salvaRiquadri(listOf("inventato", nuovi[1], nuovi[2], nuovi[3])) }
            assertTrue(no.message.orEmpty().isNotBlank())
        } finally {
            f.salvaRiquadri(prima)
        }
        assertEquals(prima, Dashboard.daJson(p.dashboard()).riquadri!!.map { it.chiave })
    }

    @Test
    fun `nascondi per 30 giorni una voce info di Da pianificare, poi Mostrale`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val f = Fase8(p)
        val v = f.dashboardTutto().pianificare.firstOrNull { it.nascondibile && it.oggetto.isNotBlank() }
        assumeTrue("Nessuna voce nascondibile nei dati di prova", v != null)
        try {
            f.nascondiVoce(v!!.oggetto)
            val dopo = f.dashboardTutto()
            assertTrue(dopo.pianificare.none { it.oggetto == v.oggetto })
            assertTrue(dopo.nascoste >= 1)
        } finally {
            f.mostraNascoste()
        }
        assertTrue(f.dashboardTutto().pianificare.any { it.oggetto == v!!.oggetto })
    }

    // ---------------------------------------------------------------------------- amministrazione (§9, §13.6)

    @Test
    fun `impostazioni generali in undici schede, coi limiti del server`() = runBlocking<Unit> {
        val f = Fase8(entra("manuel@esempio.it"))
        val g = f.impostazioniGenerali()
        assertEquals(11, g.size)
        val ore = g.flatMap { it.voci }.first { it.chiave == "ORE_GIORNALIERE" }
        assertEquals(12.0, ore.max!!, 0.0)
        val no = rifiutato("13 ore al giorno") { f.salvaImpostazioni(mapOf("ORE_GIORNALIERE" to 13)) }
        assertTrue(no.message, no.message.orEmpty().contains("12"))
        // Lo stesso valore di adesso si salva (e non cambia niente).
        f.salvaImpostazioni(mapOf("ORE_GIORNALIERE" to (Numeri.leggi(ore.testo) ?: 8.0)))
        rifiutato("lettura che salva") { Fase8(entra("lettura@esempio.it")).salvaImpostazioni(mapOf("ORE_GIORNALIERE" to 8)) }
    }

    @Test
    fun `spegnere Mezzi e attrezzature lo toglie a tutti, riaccenderlo lo rimette coi dati uguali`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val f = Fase8(p)
        val l = f.funzioni()
        assertEquals(setOf("portale", "comunicazioni", "collaboratori", "mezzi", "banche"), l.filter { it.spegnibile }.map { it.modulo }.toSet())
        assertTrue(l.first { it.modulo == "rapportini" }.parola == "Sempre accesa")
        rifiutato("Marco che spegne") { Fase8(entra("marco@esempio.it")).salvaFunzioni("mezzi", false) }
        val primaMezzi = p.leggiAzione("mezzi").toString().length
        try {
            f.salvaFunzioni("mezzi", false)
            val io = p.io()
            assertTrue(io.interfaccia.funzioniSpente.contains("mezzi"))
            assertEquals("per una funzione spenta il livello è 0 per tutti", 0, io.permessi.livello(Moduli.MEZZI))
            val e = rifiutato("un'azione di Mezzi spenta") { p.leggiAzione("mezzi") }
            assertTrue(e.message, e.message.orEmpty().contains("spenta"))
        } finally {
            f.salvaFunzioni("mezzi", true)
        }
        assertFalse(p.io().interfaccia.funzioniSpente.contains("mezzi"))
        assertEquals("i dati tornano uguali", primaMezzi, p.leggiAzione("mezzi").toString().length)
    }

    @Test
    fun `le notifiche di ognuno si salvano e tornano com'erano`() = runBlocking<Unit> {
        val f = Fase8(entra("marco@esempio.it"))
        val n = f.notifichePreferenze()
        assertTrue(n.tipi.isNotEmpty())
        val k = n.tipi.keys.first()
        try {
            f.salvaNotifichePreferenze(null, !n.silenzioSera, mapOf(k to !(n.tipi[k] ?: true)))
            val d = f.notifichePreferenze()
            assertEquals(!n.silenzioSera, d.silenzioSera)
            assertEquals(!(n.tipi[k] ?: true), d.tipi[k])
        } finally {
            f.salvaNotifichePreferenze(n.telefono, n.silenzioSera, n.tipi)
        }
        assertEquals(n, f.notifichePreferenze())
    }

    @Test
    fun `sicurezza, copie con le prove, stato del sistema e lista di controllo`() = runBlocking<Unit> {
        val f = Fase8(entra("manuel@esempio.it"))
        val s = f.sicurezza()
        assertTrue(s.sessioneGiorni in 30..365)
        assertTrue(s.riassunto.isNotBlank())
        rifiutato("Marco in Sicurezza") { Fase8(entra("marco@esempio.it")).sicurezza() }
        val k = f.copie()
        assertTrue(k.prossimaProva.isNotBlank())
        val st = f.statoSistema(java.time.LocalDateTime.now())
        assertTrue(st.versione.isNotBlank())
        assertTrue((st.schema ?: 0) >= 8)

        val c = f.controlliFinali()
        assertTrue(c.totale > 0)
        val riga = c.gruppi.flatMap { it.righe }.first { it.tipo == "a_mano" }
        val primaStato = riga.stato.takeIf { it in setOf("fatto", "non_va", "da_fare") } ?: "da_fare"
        try {
            val r = f.segnaControllo(riga.chiave, "non_va", "Prova del telefono $unico")
            assertEquals("non_va", r.stato)
            assertTrue(f.controlliFinali().gruppi.flatMap { it.righe }.first { it.chiave == riga.chiave }.nota.contains(unico))
        } finally {
            f.segnaControllo(riga.chiave, primaStato, riga.nota)
        }
        val server = c.gruppi.flatMap { it.righe }.firstOrNull { it.dalServer }
        if (server != null) rifiutato("una riga dal server") { f.segnaControllo(server.chiave, "fatto", "") }

        // Segna il cambio: solo il titolare; si rimette com'era (il giro dopo trova lo stesso stato).
        val cambioPrima = c.cambio.stato
        try {
            val p = f.segnaCambio("prova")
            assertEquals("prova", p.stato)
            assertTrue(p.provaIl.isNotBlank())
            assertEquals("prova", f.controlliFinali().cambio.stato)
            rifiutato("Laura segna il cambio") { Fase8(entra("laura@esempio.it")).segnaCambio("fatto") }
        } finally {
            f.segnaCambio(cambioPrima)
        }
    }

    // ---------------------------------------------------------------------------- importa ed esporta (§7)

    @Test
    fun `importa clienti da un CSV, nuovi e da sistemare, poi archivia quelli importati`() = runBlocking<Unit> {
        val f = Fase8(entra("manuel@esempio.it"))
        val csv = "Ragione sociale;P.IVA;Città;PEC\r\nProva Import $unico Srl;;Thiene;prova$unico@pec.esempio.it\r\nSeconda Prova $unico Snc;;Schio;\r\n;;Senza nome;\r\n"
        val l = f.leggiImport("clienti-prova-$unico.csv", csv.toByteArray(Charsets.UTF_8))
        assertEquals(3, l.righe)
        assertEquals("nome", l.colonne.first { it.intestazione == "Ragione sociale" }.campo)
        val k = f.controllaImport(l.idLettura, l.colonne, "clienti")
        assertEquals(2, k.nuovi)
        assertEquals(1, k.daSistemare.size)
        val x = f.importaSoggetti(l.idLettura, l.colonne, "clienti")
        assertEquals(2, x.nuovi)
        assertEquals(1, x.saltati)
        assertTrue(f.importazioni().any { it.id == x.id })
        val (archiviati, restano) = f.archiviaImportati(x.id)
        assertEquals(2, archiviati)
        assertEquals(0, restano)
        rifiutato("la lettura che importa") { Fase8(entra("lettura@esempio.it")).leggiImport("x.csv", csv.toByteArray()) }
    }

    @Test
    fun `esporta tutto prepara lo ZIP per il titolare, che lo scarica`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val f = Fase8(p)
        val e = f.esportaTutto()
        assertTrue(e.id.isNotBlank())
        var pronta: Esportazione? = null
        val fine = System.currentTimeMillis() + 30_000
        while (pronta == null && System.currentTimeMillis() < fine) {
            pronta = f.esportazioni().firstOrNull { it.id == e.id && it.pronta }
            if (pronta == null) delay(300)
        }
        assertNotNull("pronta entro 30 secondi", pronta)
        val zip = p.esportazione(e.id)
        assertTrue("è uno ZIP", zip.size > 4 && zip[0] == 'P'.code.toByte() && zip[1] == 'K'.code.toByte())
        rifiutato("Laura (amministrazione) che esporta tutto") { Fase8(entra("laura@esempio.it")).esportaTutto() }
    }
}
