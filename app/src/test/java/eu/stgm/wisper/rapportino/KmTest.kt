package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** I km da proporre (12/11/2026): gli stessi casi del computer (pc/prove/casi-km.json, pc/prove/km.test.js). */
class KmTest {
    private val casi = run {
        val file = listOf(File("../pc/prove/casi-km.json"), File("pc/prove/casi-km.json")).first { it.exists() }
        JSONObject(file.readText(Charsets.UTF_8)).getJSONArray("casi")
    }

    /** Un valore del JSON come testo: numeri e testi uguali ("3" e 3), null o assente = "". */
    private fun JSONObject?.t(k: String): String = if (this == null || !has(k) || isNull(k)) "" else get(k).toString()
    private fun JSONObject?.n(k: String): Double? = if (this == null || !has(k) || isNull(k)) null else getDouble(k)

    @Test
    fun casiCondivisi() {
        assertTrue(casi.length() >= 12)
        for (i in 0 until casi.length()) {
            val caso = casi.getJSONObject(i)
            val nome = caso.getString("nome")
            val x = caso.getJSONObject("x")
            val l = x.optJSONObject("lavoro")
            val p = x.optJSONObject("progetto")
            val storico = x.optJSONArray("storico")?.let { a ->
                (0 until a.length()).map { j ->
                    val s = a.getJSONObject(j)
                    Km.Storia(s.getString("data"), s.t("idCliente"), s.t("idCommessa"), s.t("idProgetto"), s.optDouble("km", 0.0))
                }
            }.orEmpty()
            val r = Km.proposte(
                Km.Lavoro(l.t("idCliente"), l.t("idCommessa"), l.t("idProgetto")),
                p?.let { Km.Luogo(it.t("intestatoA"), it.t("dove"), it.n("kmStudio")) },
                x.optJSONObject("commessa").n("kmStudio"), x.optJSONObject("cliente").n("kmStudio"), storico,
                kmPrima = x.optBoolean("kmPrima", false),
            )
            val a = caso.getJSONObject("atteso")
            val pa = a.optJSONObject("proposta")
            assertEquals(nome, pa?.let { Km.Proposta(it.getDouble("km"), it.getString("da")) }, r.proposta)
            assertEquals(nome, a.n("ultima"), r.ultima)
            assertEquals(nome, a.n("studio"), r.studio)
        }
    }

    @Test
    fun doveDiIntestato() {
        val lista = listOf(
            Progetto(id = "1", idCommessa = "26ST001", codice = "A", intestatoA = "Batokyo Srl", dove = "Via dei Mulini 4, Schio", creato = "2026-11-01T08:00:00"),
            Progetto(id = "2", idCommessa = "26ST001", codice = "B", intestatoA = "  batokyo   SRL ", dove = "Via dei Mulini 6, Schio", creato = "2026-11-05T08:00:00"),
            Progetto(id = "3", idCommessa = "26ST001", codice = "C", intestatoA = "Batokyo Srl", dove = "", creato = "2026-11-08T08:00:00"),
        )
        assertEquals("Via dei Mulini 6, Schio", Km.doveDiIntestato(lista, "Batokyo srl"))
        assertEquals("Via dei Mulini 4, Schio", Km.doveDiIntestato(lista, "Batokyo Srl", tranneId = "2"))
        assertEquals("", Km.doveDiIntestato(lista, "Altra Srl"))
    }
}
