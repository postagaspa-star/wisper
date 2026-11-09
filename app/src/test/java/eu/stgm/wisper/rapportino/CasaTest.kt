package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** La casa del design Fai: gli stessi casi del computer (pc/prove/casi-casa.json, pc/prove/casa.test.js). */
class CasaTest {
    private val casi: JSONObject = run {
        val file = listOf(File("../pc/prove/casi-casa.json"), File("pc/prove/casi-casa.json")).first { it.exists() }
        JSONObject(file.readText(Charsets.UTF_8))
    }

    @Test
    fun schedaGialla() {
        val elenco = casi.getJSONArray("schedaImportante")
        for (i in 0 until elenco.length()) {
            val k = elenco.getJSONObject(i)
            val nome = k.getString("nome")
            val s = Casa.schedaImportante(VoceDashboard.daJson(k.getJSONObject("voce")))
            val a = k.getJSONObject("atteso")
            assertEquals(nome, a.getString("titolo"), s.titolo)
            assertEquals(nome, a.getString("dettaglio"), s.dettaglio)
            assertEquals(nome, a.getString("pillola"), s.pillola)
            assertEquals(nome, a.getString("nota"), s.nota)
            if (a.isNull("importo")) assertNull(nome, s.importo) else assertEquals(nome, a.getDouble("importo"), s.importo!!, 0.001)
            assertEquals(nome, a.getBoolean("promemoria"), s.idFattura != null)
        }
    }

    @Test
    fun azioni() {
        assertEquals(
            listOf("Scrivi un rapportino", "Aggiungi una spesa", "Nuova commessa", "Nuovo cliente", "Prepara un preventivo", "Invia un rapportino"),
            Casa.AZIONI.map { it.testo },
        )
        assertEquals(listOf("rapportino", "invia"), Casa.azioniDi { it == Moduli.RAPPORTINI }.map { it.chiave })
        assertEquals(emptyList<String>(), Casa.azioniDi { false }.map { it.chiave })
    }

    @Test
    fun daSistemare() {
        fun v(n: String) = VoceDashboard("x", n)
        val s = Casa.daSistemare(listOf(v("a"), v("b")), listOf(v("c")), listOf(v("d"), v("e")), mapOf("urgenti" to 2, "settimana" to 1, "pianificare" to 9), 3)
        assertEquals("a", s.prima?.titolo)
        assertEquals(listOf("b", "c", "d"), s.righe.map { it.titolo })
        assertEquals(8, s.altre)
        assertEquals("x", Casa.daSistemare(emptyList(), listOf(v("x")), emptyList(), emptyMap(), 3).prima?.titolo)
        assertNull(Casa.daSistemare(emptyList(), emptyList(), emptyList(), emptyMap(), 3).prima)
    }
}
