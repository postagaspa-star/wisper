package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * Il telefono deve fare lo stesso conto del foglio, al centesimo: il numero che
 * si vede mentre si compila e' quello che poi si trova sul PDF.
 *
 * I casi sono gli stessi dei test dello script (apps-script/prove), letti dallo
 * stesso file: se uno dei due cambia formula senza l'altro, qui si rompe.
 */
class CalcoloTest {

    private val casi: List<JSONObject> = run {
        // I test girano dalla cartella del modulo app/.
        val file = listOf(File("../apps-script/prove/casi-calcolo.json"), File("apps-script/prove/casi-calcolo.json"))
            .first { it.exists() }
        val a = JSONArray(file.readText())
        (0 until a.length()).map { a.getJSONObject(it) }
    }

    @Test
    fun `stessi conti dello script`() {
        for (c in casi) {
            val r = c.getJSONObject("rapportino")
            val g = c.getJSONObject("regole")
            val atteso = c.getJSONObject("atteso")
            val conto = Calcolo.calcola(
                oreLavoro = r.optDouble("oreLavoro", 0.0),
                oreExtra = r.optDouble("oreExtra", 0.0),
                oreViaggio = r.optDouble("oreViaggio", 0.0),
                km = r.optDouble("km", 0.0),
                spese = r.optDouble("spese", 0.0),
                tariffa = if (r.isNull("tariffa")) null else r.getDouble("tariffa"),
                regole = Regole(
                    tariffaFissa = if (g.isNull("tariffaFissa")) null else g.getDouble("tariffaFissa"),
                    pagaViaggio = g.getBoolean("pagaViaggio"),
                    kmRimborsati = g.getBoolean("kmRimborsati"),
                    maggExtra = g.optDouble("maggExtra", 0.0),
                    euroKm = g.optDouble("euroKm", 0.0),
                ),
            )
            val nome = c.getString("nome")
            assertEquals(nome, atteso.getDouble("oreTotali"), conto.oreTotali, 0.0)
            assertEquals(nome, atteso.getDouble("tariffa"), conto.tariffa, 0.0)
            assertEquals(nome, atteso.getDouble("compensoOre"), conto.compensoOre, 0.0)
            assertEquals(nome, atteso.getDouble("rimborsoKm"), conto.rimborsoKm, 0.0)
            assertEquals(nome, atteso.getDouble("totale"), conto.totale, 0.0)
        }
    }

    @Test
    fun `le regole vengono dalla scheda del cliente, i km dalla commessa`() {
        val ana = Anagrafiche(
            clienti = listOf(
                Cliente("C001", "Elettrodinamica", tariffaFissa = 30.0, pagaViaggio = false, kmRimborsati = true),
                Cliente("C002", "Rossi", ultimaTariffa = 42.0),
                Cliente("C003", "Bianchi", pagaViaggio = true),
                // Un cliente dei fogli di prima della 0.3.5, ancora in un gruppo.
                Cliente("C004", "Vecchio", gruppo = "Elettrodinamica"),
            ),
            commesse = listOf(Commessa("26ST001", "C002", "Lontana", euroKm = 0.9)),
            gruppi = listOf(Gruppo("Elettrodinamica", tariffaFissa = 30.0)),
            impostazioni = mapOf("EURO_KM" to "0,76"),
        )
        val elettro = ana.regoleDi(ana.cliente("C001"))
        assertEquals(30.0, elettro.tariffaFissa!!, 0.0)
        assertEquals(0.76, elettro.euroKm, 0.0)
        assertEquals(null, ana.regoleDi(ana.cliente("C002")).tariffaFissa)
        assertEquals(false, ana.regoleDi(ana.cliente("C002")).pagaViaggio)
        assertEquals(true, ana.regoleDi(ana.cliente("C003")).pagaViaggio)
        assertEquals(null, ana.regoleDi(null).tariffaFissa)
        assertEquals(30.0, ana.regoleDi(ana.cliente("C004")).tariffaFissa!!, 0.0)
        assertEquals(0.9, ana.regoleDi(ana.cliente("C002"), ana.commessa("26st001")).euroKm, 0.0)
        // Un cliente scritto a mano si riconosce anche con maiuscole e punti diversi.
        assertEquals("C002", ana.cliente("", "rossi")?.id)
    }

    @Test
    fun `codice della commessa nuova come nello script`() {
        val ana = Anagrafiche(commesse = listOf(Commessa("P2601", "C1", "a"), Commessa("26ST009", "C1", "b"), Commessa("25ST120", "C1", "c")))
        assertEquals("26ST121", ana.prossimoCodiceCommessa(2026))
        assertEquals("27ST121", ana.prossimoCodiceCommessa(2027))
        assertEquals("26ST001", Anagrafiche().prossimoCodiceCommessa(2026))
    }
}
