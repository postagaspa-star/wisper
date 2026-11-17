package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** I modelli e i loro codici (1.5.0): lo stesso elenco e gli stessi casi del computer (pc/prove/casi-modelli.json, pc/prove/modelli.test.js). */
class ModelliDocumentiTest {
    private val casi = run {
        val file = listOf(File("../pc/prove/casi-modelli.json"), File("pc/prove/casi-modelli.json")).first { it.exists() }
        JSONObject(file.readText(Charsets.UTF_8))
    }

    private fun JSONObject.t(k: String): String = if (!has(k) || isNull(k)) "" else get(k).toString()

    @Test
    fun elencoUgualeAlComputer() {
        val a = casi.getJSONArray("modelli")
        assertEquals(a.length(), ModelliDocumenti.TUTTI.size)
        for (i in 0 until a.length()) {
            val m = a.getJSONObject(i)
            assertEquals(ModelliDocumenti.Modello(m.t("codice"), m.t("famiglia"), m.t("nome"), m.t("quando"), m.t("dove"), m.t("testi")), ModelliDocumenti.TUTTI[i])
        }
        // I codici non si ripetono e hanno tutti la forma famiglia-numero.
        assertEquals(ModelliDocumenti.TUTTI.size, ModelliDocumenti.TUTTI.map { it.codice }.toSet().size)
        assertTrue(ModelliDocumenti.TUTTI.all { Regex("^[A-Z]{3}-[0-9]{2}$").matches(it.codice) })
        assertEquals(listOf("Rapportini", "Preventivi", "Fatture", "Lettere e contratti"), ModelliDocumenti.FAMIGLIE)
        assertEquals("Mod. RAP-01", ModelliDocumenti.sigla("RAP-01"))
    }

    @Test
    fun regolaDelRapportino() {
        val a = casi.getJSONArray("rapportino")
        assertTrue(a.length() >= 12)
        for (i in 0 until a.length()) {
            val caso = a.getJSONObject(i)
            val l = caso.getJSONArray("lavori")
            val lavori = (0 until l.length()).map { j -> l.getJSONObject(j).let { ModelliDocumenti.Lavoro(it.t("data"), it.t("idCommessa")) } }
            assertEquals(caso.getString("nome"), caso.getString("modello"), ModelliDocumenti.rapportino(lavori, caso.t("data")))
        }
    }

    @Test
    fun invio() {
        val stessa = listOf(ModelliDocumenti.Lavoro("2026-11-05", "26ST014"), ModelliDocumenti.Lavoro("2026-11-05", "26ST014"))
        assertEquals("RAP-01", ModelliDocumenti.invio(true, stessa, "2026-11-05"))
        assertEquals("RAP-03", ModelliDocumenti.invio(false, stessa, "2026-11-05"))
    }
}
