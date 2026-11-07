package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * Oggetto e frase dell'email dei rapportini (06/11/2026): tutti i casi di server/prove/casi-invio.json, letti dal file
 * così com'è, gli stessi del computer.
 */
class PeriodoInvioTest {

    private fun file(): File? = listOf("../server/prove/casi-invio.json", "server/prove/casi-invio.json").map(::File).firstOrNull { it.exists() }

    @Test
    fun `oggetto e frase uguali al computer su ogni caso di casi-invio json`() {
        val f = file()
        assumeTrue("Manca server/prove/casi-invio.json", f != null)
        val casi = JSONObject(f!!.readText(Charsets.UTF_8)).getJSONArray("casi")
        assertTrue("ci sono dei casi", casi.length() >= 10)
        var provati = 0
        for (i in 0 until casi.length()) {
            val caso = casi.getJSONObject(i)
            val nome = caso.getString("nome")
            val date = caso.getJSONArray("date").let { a -> (0 until a.length()).map { a.getString(it) } }
            val t = PeriodoInvio.periodoInvio(date, caso.optString("numero"))
            assertEquals("$nome: oggetto", caso.getString("oggetto"), t.oggetto)
            assertEquals("$nome: frase", caso.getString("frase"), t.frase)
            // Le stesse date come LocalDate danno lo stesso testo.
            assertEquals("$nome: con le date", t, PeriodoInvio.periodoInvio(date.map(LocalDate::parse), caso.optString("numero")))
            provati++
        }
        assertEquals("tutti i casi", casi.length(), provati)
    }

    @Test
    fun `il primo del mese, le elisioni e i mesi che cominciano con la a`() {
        assertEquals("dal 1°", PeriodoInvio.conPreposizione("dal", 1))
        assertEquals("dell'8", PeriodoInvio.conPreposizione("del", 8))
        assertEquals("all'11", PeriodoInvio.conPreposizione("al", 11))
        assertEquals("al 18", PeriodoInvio.conPreposizione("al", 18))
        assertEquals(
            "Rapportini della settimana dal 1° al 4 marzo 2027",
            PeriodoInvio.periodoInvio(listOf(LocalDate.of(2027, 3, 1), LocalDate.of(2027, 3, 4))).oggetto,
        )
        assertEquals("Rapportini da luglio ad agosto 2026", PeriodoInvio.periodoInvio(listOf(LocalDate.of(2026, 7, 2), LocalDate.of(2026, 8, 20))).oggetto)
        // Un rapportino senza numero (ancora sul telefono): come prima, "Rapportino del …".
        assertEquals("Rapportino del 05/11/2026", PeriodoInvio.periodoInvio(listOf(LocalDate.of(2026, 11, 5))).oggetto)
    }
}
