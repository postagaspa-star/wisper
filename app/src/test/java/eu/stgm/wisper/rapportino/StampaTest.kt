package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Le parti di Stampa che non hanno bisogno della WebView: i nomi dei file come sul
 * computer (nomeFile di app.js + NomeFilePulito di Ponte.cs), intestatario e periodo
 * del riepilogo come intestatarioRiepilogo/periodoDi di app.js, i margini di @page.
 */
class StampaTest {

    private val ana = JSONObject(
        """
        {"clienti":[
          {"id":"CL001","nome":"Elettrodinamica Srl","indirizzo":"Via Roma 1, Thiene","partitaIva":"01234567890","email":"amm@elettro.it"},
          {"id":"CL002","nome":"Batokyo","indirizzo":null,"partitaIva":"","email":""}
        ],"commesse":[],"impostazioni":{"RAGIONE_SOCIALE":"Studio Tecnico GM"}}
        """
    )

    private fun r(id: String, data: String, idCliente: String?, cliente: String) = JSONObject()
        .put("id", id).put("data", data).put("idCliente", idCliente ?: JSONObject.NULL).put("cliente", cliente)

    // ------------------------------------------------------------ nomi

    @Test
    fun `il pulsante PDF chiama il file come il computer`() {
        assertEquals("RAP-2026-0003 Batokyo 05-07-2026", Stampa.nomeRapportino(r("RAP/2026/0003", "2026-07-05", "CL002", "Batokyo")))
        assertEquals("RAP-2026-0003 Batokyo", Stampa.nomeInvio(r("RAP/2026/0003", "2026-07-05", "CL002", "Batokyo")))
    }

    @Test
    fun `senza numero il rapportino si chiama Rapportino`() {
        assertEquals("Rapportino Batokyo 05-07-2026", Stampa.nomeRapportino(r("", "2026-07-05", "CL002", "Batokyo")))
    }

    @Test
    fun `i caratteri vietati diventano un trattino solo e i bordi si puliscono`() {
        assertEquals("A -B-C", Stampa.nomeFile("A", "//B:*?C"))
        // Ponte.cs toglie punti e trattini ai bordi: "S.r.l." perde l'ultimo punto, come sul computer.
        assertEquals("Riepilogo Rossi S.r.l", Stampa.nomeFile("Riepilogo", "Rossi S.r.l."))
        assertEquals("Riepilogo", Stampa.nomeFile("Riepilogo", "  "))
        // I caratteri di controllo li toglie solo Ponte.cs, uno per uno.
        assertEquals("a b-c", Stampa.nomeFile("a", "b\u0001c"))
    }

    @Test
    fun `il nome non supera 120 caratteri`() {
        val nome = Stampa.nomeFile("Riepilogo", "x".repeat(300))
        assertEquals(120, nome.length)
        assertTrue(nome.startsWith("Riepilogo xxx"))
    }

    @Test
    fun `il riepilogo prende cliente e periodo`() {
        val lista = JSONArray().put(r("RAP/2026/0010", "2026-10-02", "CL001", "Elettrodinamica"))
            .put(r("RAP/2026/0011", "2026-10-20", "CL001", "Elettrodinamica"))
        assertEquals("Riepilogo Elettrodinamica Srl Ottobre 2026", Stampa.nomeRiepilogo(lista, ana))
    }

    // ------------------------------------------------------------ intestatario

    @Test
    fun `un cliente solo dà la sua scheda`() {
        val lista = JSONArray().put(r("1", "2026-10-02", "CL001", "Elettrodinamica"))
            .put(r("2", "2026-10-03", "CL001", "Elettrodinamica"))
        val chi = Stampa.intestatario(lista, ana)
        assertEquals("Elettrodinamica Srl", chi.nome)
        assertEquals(listOf("Via Roma 1, Thiene", "P.IVA 01234567890", "amm@elettro.it"), chi.righe)
        assertEquals("amm@elettro.it", chi.email)
        assertFalse(chi.mostraCliente)
    }

    @Test
    fun `campi vuoti o null non fanno righe`() {
        val chi = Stampa.intestatario(JSONArray().put(r("1", "2026-10-02", "CL002", "Batokyo")), ana)
        assertEquals("Batokyo", chi.nome)
        assertEquals(emptyList<String>(), chi.righe)
    }

    @Test
    fun `più clienti fanno Vari clienti con il cliente in ogni riga`() {
        val lista = JSONArray().put(r("1", "2026-10-02", "CL001", "Elettrodinamica"))
            .put(r("2", "2026-10-03", "CL002", "Batokyo"))
        val chi = Stampa.intestatario(lista, ana)
        assertEquals("Vari clienti", chi.nome)
        assertTrue(chi.mostraCliente)
        assertEquals(emptyList<String>(), chi.righe)
    }

    @Test
    fun `senza codice cliente conta il nome scritto, maiuscole e spazi a parte`() {
        val lista = JSONArray().put(r("1", "2026-10-02", null, "Rossi Srl"))
            .put(r("2", "2026-10-03", "", "rossi  srl"))
        val chi = Stampa.intestatario(lista, ana)
        assertEquals("Rossi Srl", chi.nome)
        assertFalse(chi.mostraCliente)
    }

    // ------------------------------------------------------------ periodo

    @Test
    fun `periodo di uno o più mesi`() {
        assertEquals("Ottobre 2026", Stampa.periodo(JSONArray().put(r("1", "2026-10-02", "CL001", "E"))))
        assertEquals(
            "Settembre 2026 – Ottobre 2026",
            Stampa.periodo(JSONArray().put(r("1", "2026-10-02", "CL001", "E")).put(r("2", "2026-09-30", "CL001", "E")).put(r("3", "2026-10-05", "CL001", "E"))),
        )
        assertEquals("Dicembre 2025 – Gennaio 2026", Stampa.periodo(JSONArray().put(r("1", "2026-01-02", "CL001", "E")).put(r("2", "2025-12-30", "CL001", "E"))))
        assertEquals("", Stampa.periodo(JSONArray()))
    }

    // ------------------------------------------------------------ margini e immagini

    @Test
    fun `i margini arrivano da @page di documenti js`() {
        val css = "<style>@font-face { src: url(\"/font/Figtree.ttf\"); }@page { size: A4; margin: 14mm 14mm 18mm 14mm;" +
            "  @bottom-left { content: \"Studio\"; } }</style>"
        // sinistra, sopra, destra, sotto in millesimi di pollice: 14 mm = 551, 18 mm = 709.
        assertArrayEquals(intArrayOf(551, 551, 551, 709), Stampa.margini(css))
        assertArrayEquals(intArrayOf(394, 394, 394, 394), Stampa.margini("@page { margin: 1cm }"))
        // Se il CSS non si capisce, quelli di documenti.js di oggi.
        assertArrayEquals(intArrayOf(551, 551, 551, 709), Stampa.margini("@page { margin: auto }"))
        assertArrayEquals(intArrayOf(551, 551, 551, 709), Stampa.margini("<p>niente</p>"))
    }

    @Test
    fun `le immagini da scaricare sono quelle di file`() {
        val html = "<img class=\"sig\" src=\"/file/1AbC_d-EfGhIjK\" alt=\"\"><img src=\"/file/1AbC_d-EfGhIjK\">" +
            "<img src=\"/file/2ZZZZZZZZZZZZ\"><img src=\"data:image/svg+xml;utf8,x\"><img src=\"/file/corto\">"
        assertEquals(setOf("1AbC_d-EfGhIjK", "2ZZZZZZZZZZZZ"), Stampa.idImmagini(html))
    }

    @Test
    fun `date e mesi come conti js`() {
        assertEquals("05/07/2026", Stampa.data("2026-07-05"))
        assertEquals("", Stampa.data(""))
        assertEquals("Luglio 2026", Stampa.nomeMese("2026-07"))
        assertEquals("", Stampa.nomeMese("2026-13"))
    }
}
