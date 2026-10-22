package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

/**
 * Le azioni della fase 3 (architettura.md §14) contro un server finto: cosa
 * parte, con quali nomi, GET per leggere e POST per scrivere.
 */
class PonteServerFase3Test {
    private lateinit var server: MockWebServer
    private lateinit var ponte: PonteServer

    @Before
    fun accendi() {
        server = MockWebServer()
        server.start()
        ponte = PonteServer({ server.url("/").toString() }, { "token-di-prova" }, { mapOf("disp" to "prova") })
    }

    @After
    fun spegni() = server.shutdown()

    private fun risponde(json: String) = server.enqueue(MockResponse().setBody(json).setHeader("Content-Type", "application/json"))
    private fun corpo(r: RecordedRequest): JSONObject = JSONObject(r.body.readUtf8())

    @Test
    fun `le ore si leggono con una GET col periodo e la persona`() = runBlocking {
        risponde("""{"ok":true,"da":"2026-10-19","a":"2026-10-25","ore":[],"giorni":[],"totali":{}}""")
        val e = ponte.ore(LocalDate.of(2026, 10, 19), LocalDate.of(2026, 10, 25), utente = "3")
        assertEquals(LocalDate.of(2026, 10, 25), e.a)
        val r = server.takeRequest()
        assertEquals("GET", r.method)
        assertEquals("ore", r.requestUrl!!.queryParameter("azione"))
        assertEquals("2026-10-19", r.requestUrl!!.queryParameter("da"))
        assertEquals("3", r.requestUrl!!.queryParameter("utente"))
        assertEquals("Bearer token-di-prova", r.getHeader("Authorization"))
    }

    @Test
    fun `salvaOre togliOre e il timer sono POST coi nomi del server`() = runBlocking {
        risponde("""{"ok":true,"riga":{"id":14,"data":"2026-10-22","inizio":"00:10","fine":"01:41","ore":1.52,"stato":"bozza","dalTimer":true}}""")
        val riga = ponte.salvaOre(RigaOre(id = "14", data = LocalDate.of(2026, 10, 22), inizio = "00:10", fine = "01:41").perSalvare())
        assertEquals(1.52, riga.ore, 0.0)
        val c1 = corpo(server.takeRequest())
        assertEquals("salvaOre", c1.getString("azione"))
        assertEquals(14L, c1.getJSONObject("riga").getLong("id"))

        risponde("""{"ok":true,"riga":{"id":14,"data":"2026-10-22","ore":1.52,"tolta":"2026-10-22T01:41:11"}}""")
        assertEquals("2026-10-22T01:41:11", ponte.togliOre("14").tolta)
        val c2 = corpo(server.takeRequest())
        assertEquals("togliOre", c2.getString("azione"))
        assertFalse(c2.has("annulla"))
        risponde("""{"ok":true,"riga":{"id":14,"data":"2026-10-22","ore":1.52,"tolta":""}}""")
        ponte.togliOre("14", annulla = true)
        assertTrue(corpo(server.takeRequest()).getBoolean("annulla"))

        risponde("""{"ok":true,"adesso":"2026-10-22T01:41:11","timer":{"partitoIl":"2026-10-22T01:41:11","idCommessa":"26ST001","secondi":0}}""")
        val t = ponte.avviaTimer("26ST001", "Cablaggio", oraMs = 500)
        assertEquals(500L, t.lettoAlMs)
        val c3 = corpo(server.takeRequest())
        assertEquals("avviaTimer", c3.getString("azione"))
        assertEquals("26ST001", c3.getString("idCommessa"))
        assertFalse("fatturabile di base lo decide il server", c3.has("fatturabile"))

        // Già acceso: il messaggio del server, così com'è.
        risponde("""{"ok":false,"errore":"Il timer è già acceso dalle 00:10 (26ST001): fermalo prima di avviarne un altro","timer":{"partitoIl":"2026-10-22T00:10:39"}}""")
        try {
            ponte.avviaTimer("26ST002")
            fail("doveva dire di no")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message!!.startsWith("Il timer è già acceso dalle 00:10"))
        }
        server.takeRequest()

        risponde("""{"ok":true,"timer":null,"riga":{"id":15,"data":"2026-10-21","inizio":"09:00","fine":"","ore":0,"stato":"bozza","dalTimer":true},"avviso":"Il timer era acceso da più di un giorno: scrivi tu le ore giuste"}""")
        val f = ponte.fermaTimer()
        assertEquals("15", f.riga.id)
        assertTrue(f.avviso.startsWith("Il timer era acceso"))
        assertEquals("fermaTimer", corpo(server.takeRequest()).getString("azione"))
    }

    @Test
    fun `approva respingi e annulla mandano le voci, il rapportino col suo numero`() = runBlocking {
        val voci = listOf(VoceDaApprovare("ore", "7"), VoceDaApprovare("rapportino", "RAP/2026/0006"))
        risponde("""{"ok":true,"fatte":2,"voci":[{"tipo":"ore","id":7,"stato":"approvata"},{"tipo":"rapportino","id":"RAP/2026/0006","stato":"approvato"}]}""")
        assertEquals(2, ponte.approva(voci).fatte)
        val c = corpo(server.takeRequest())
        assertEquals("approva", c.getString("azione"))
        assertEquals(7L, c.getJSONArray("voci").getJSONObject(0).getLong("id"))
        assertEquals("RAP/2026/0006", c.getJSONArray("voci").getJSONObject(1).getString("id"))
        assertFalse(c.has("motivo"))

        risponde("""{"ok":true,"fatte":1,"voci":[]}""")
        ponte.respingi(voci.take(1), "  13 ore in un giorno: controlla ")
        val r = corpo(server.takeRequest())
        assertEquals("respingi", r.getString("azione"))
        assertEquals("13 ore in un giorno: controlla", r.getString("motivo"))

        risponde("""{"ok":true,"fatte":1,"voci":[]}""")
        ponte.annullaApprovazione(voci.take(1))
        assertEquals("annullaApprovazione", corpo(server.takeRequest()).getString("azione"))

        // Il collaboratore: permesso negato, prima di cercare la voce.
        risponde("""{"ok":false,"errore":"Non hai il permesso per approvare ore, rapportini e spese: chiedi al titolare","permesso":false}""")
        try {
            ponte.daApprovare()
            fail("doveva dire di no")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message!!.contains("approvare"))
        }
    }

    @Test
    fun `spese, trasferte, rimborsi, veicoli e riepilogo`() = runBlocking {
        risponde("""{"ok":true,"spesa":{"id":13,"data":"2026-10-21","importo":8.4,"stato":"da_approvare"}}""")
        ponte.salvaSpesa(Spesa(data = LocalDate.of(2026, 10, 21), importo = 8.4, pagataDaMe = true).perSalvare())
        val s = corpo(server.takeRequest())
        assertEquals("salvaSpesa", s.getString("azione"))
        assertTrue(s.getJSONObject("spesa").getBoolean("pagataDaMe"))

        risponde("""{"ok":true,"spesa":{"id":13,"tolta":"2026-10-22T01:00:00"}}""")
        ponte.togliSpesa("13")
        assertEquals("togliSpesa", corpo(server.takeRequest()).getString("azione"))

        risponde("""{"ok":true,"trasferta":{"id":3,"dal":"2026-10-22","km":11,"andataRitorno":true,"kmTotali":22,"euroKm":0.76,"rimborsoKm":16.72,"totale":16.72}}""")
        val t = ponte.salvaTrasferta(Trasferta(dal = LocalDate.of(2026, 10, 22), destinazione = "Zanè", km = 11.0, idVeicolo = "1").perSalvare())
        assertEquals(16.72, t.rimborsoKm, 0.0)
        val ct = corpo(server.takeRequest()).getJSONObject("trasferta")
        assertEquals("Zanè", ct.getString("destinazione"))
        assertEquals(1L, ct.getLong("idVeicolo"))

        risponde("""{"ok":true,"fatte":1,"totale":9.8}""")
        val (fatte, totale) = ponte.segnaRimborsato(listOf(VoceRimborso("spesa", "4")), annulla = true)
        assertEquals(1, fatte)
        assertEquals(9.8, totale, 0.0)
        val cr = corpo(server.takeRequest())
        assertEquals("segnaRimborsato", cr.getString("azione"))
        assertTrue(cr.getBoolean("annulla"))
        assertEquals("spesa", cr.getJSONArray("voci").getJSONObject(0).getString("tipo"))

        risponde("""{"ok":true,"veicolo":{"id":2,"nome":"Furgone di prova","euroKm":0.5432,"annoAci":2026,"attivo":true}}""")
        ponte.salvaVeicolo(Veicolo(nome = "Furgone di prova", alimentazione = "gasolio", euroKm = 0.5432))
        val cv = corpo(server.takeRequest()).getJSONObject("veicolo")
        assertEquals(0.5432, cv.getDouble("euroKm"), 0.0)
        assertFalse(cv.has("id"))

        risponde("""{"ok":true,"veicoli":[],"aciAnno":2026,"paginaAci":"https://www.aci.it/"}""")
        ponte.veicoli(tutti = true)
        assertEquals("1", server.takeRequest().requestUrl!!.queryParameter("tutti"))

        risponde("""{"ok":true,"per":"categoria","righe":[],"totale":{}}""")
        ponte.riepilogoSpese(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), "categoria")
        val rr = server.takeRequest()
        assertEquals("riepilogoSpese", rr.requestUrl!!.queryParameter("azione"))
        assertEquals("categoria", rr.requestUrl!!.queryParameter("per"))
    }

    @Test
    fun `statistiche delle ore, esportazioni del periodo e lo scontrino tolto`() = runBlocking {
        risponde(
            """{"ok":true,"da":"2026-10-01","a":"2026-10-31","per":"commessa",
              "righe":[{"chiave":"26ST001","nome":"Nuovo magazzino","ore":52,"fatturabili":50.5,"percentuale":97,"oreRapportini":26,"oreRegistrate":26,
                        "costo":1111,"costoNoto":true,"idCliente":"C001","cliente":"Elettrodinamica"},
                       {"chiave":"","nome":"Attività dello studio","ore":9,"fatturabili":0,"percentuale":0,"oreRapportini":0,"oreRegistrate":9,"idCliente":"","cliente":""}],
              "totale":{"ore":61,"fatturabili":50.5,"percentuale":83,"oreRapportini":26,"oreRegistrate":35,"costo":1111,"costoNoto":false}}""",
        )
        val s = ponte.statisticheOre(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), "commessa")
        assertEquals("commessa", s.per)
        assertEquals(2, s.righe.size)
        assertEquals(97, s.righe[0].percentuale)
        assertEquals(1111.0, s.righe[0].costo!!, 0.0)
        assertEquals("Elettrodinamica", s.righe[0].cliente)
        assertEquals("senza i soldi il costo non c'è", null, s.righe[1].costo)
        assertEquals(52.0, s.massimo, 0.0)
        assertEquals(0.97f, s.righe[0].quotaFatturabile, 0.01f)
        assertFalse("il costo del totale è incompleto", s.totale!!.costoNoto)
        assertEquals("Totale", s.totale!!.nome)
        val rs = server.takeRequest()
        assertEquals("GET", rs.method)
        assertEquals("statisticheOre", rs.requestUrl!!.queryParameter("azione"))
        assertEquals("2026-10-01", rs.requestUrl!!.queryParameter("da"))
        assertEquals("2026-10-31", rs.requestUrl!!.queryParameter("a"))
        assertEquals("commessa", rs.requestUrl!!.queryParameter("per"))
        assertEquals(97, RigaStatisticaOre.percentuale(50.5, 52.0))
        assertEquals(null, RigaStatisticaOre.percentuale(0.0, 0.0))

        val csv = java.util.Base64.getEncoder().encodeToString("Data;Ore\r\n2026-10-21;7,5".toByteArray())
        risponde("""{"ok":true,"nome":"wisper-ore-2026-10-19.csv","mime":"text/csv","base64":"$csv"}""")
        val (nome, _, byte) = ponte.esporta("ore", null, listOf("da" to "2026-10-19", "a" to "2026-10-25", "utente" to "3"))
        assertEquals("wisper-ore-2026-10-19.csv", nome)
        assertTrue(String(byte).startsWith("Data;Ore"))
        val re = server.takeRequest().requestUrl!!
        assertEquals("esporta", re.queryParameter("azione"))
        assertEquals("ore", re.queryParameter("cosa"))
        assertEquals("2026-10-19", re.queryParameter("da"))
        assertEquals("2026-10-25", re.queryParameter("a"))
        assertEquals("3", re.queryParameter("utente"))
        assertEquals("solo per i rapportini si chiede tutto", null, re.queryParameter("tutti"))

        risponde("""{"ok":true,"spesa":{"id":13,"data":"2026-10-21","importo":8.4,"foto":[{"id":"f-2","url":"/file/f-2"}]}}""")
        val sp = ponte.togliFotoSpesa("f-1")
        assertEquals(listOf("f-2"), sp.foto.map { it.id })
        val ct = corpo(server.takeRequest())
        assertEquals("togliFotoSpesa", ct.getString("azione"))
        assertEquals("f-1", ct.getString("id"))
    }

    @Test
    fun `io dice chi approva e chi segna i rimborsi`() = runBlocking {
        risponde(
            """{"ok":true,"utente":{"id":3,"nome":"Marco Collaboratore","ruolo":"collaboratore"},"permessi":{"rapportini":2,"spese":2,"costi":0},
              "interfaccia":{"ticketAttivo":false,"tecnico":"Marco Collaboratore","soloSuoi":true,"versioneServer":"0.6.0","puoApprovare":false,
              "puoSegnareRimborsi":false,"approvazione":"collaboratori","oreGiornaliere":8}}""",
        )
        val io = ponte.io()
        assertEquals(false, io.interfaccia.puoApprovare)
        assertEquals("collaboratori", io.interfaccia.approvazione)
        assertTrue(io.permessi.modifica(Moduli.SPESE))
        assertFalse(io.permessi.costi)
    }
}
