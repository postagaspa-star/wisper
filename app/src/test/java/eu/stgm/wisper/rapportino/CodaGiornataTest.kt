package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDate

/**
 * Il rapportino con più lavori in coda (rapportino-lavori.md §3): un'operazione per rapportino, coi suoi lavori.
 * Salvato più volte senza rete resta UNA operazione con l'ultima versione; partito e cambiato mentre era in viaggio
 * resta in coda col numero del server e riparte; partito com'era esce dalla coda.
 */
class CodaGiornataTest {

    @get:Rule
    val cartella = TemporaryFolder()

    private val file: File get() = File(cartella.root, "coda-invii.json")

    private val giorno = LocalDate.of(2026, 11, 5)

    private fun lavoro(idLocale: String, cliente: String, ore: Double) = Rapportino(
        idLocale = idLocale, data = giorno, tecnico = "Manuel Gasparotto", idCliente = "C-$cliente", cliente = cliente,
        descrizione = "Lavoro per $cliente", oreLavoro = ore,
    )

    private val tre = Giornata(
        "G-prova", data = giorno, tecnico = "Manuel Gasparotto",
        lavori = listOf(lavoro("W-a", "Elettrodinamica", 4.0), lavoro("W-b", "Rossi Impianti Srl", 2.0), lavoro("W-c", "Rossi Impianti Srl", 1.5)),
    )

    @Test
    fun `senza rete, salvato tre volte, resta un'operazione sola con l'ultima versione`() {
        val coda = CodaInvii(file)
        coda.giornata(tre.copy(lavori = tre.lavori.take(1)))
        coda.giornata(tre.copy(lavori = tre.lavori.take(2)))
        coda.giornata(tre)
        val tutte = CodaInvii(file).tutte()   // come dopo un riavvio
        assertEquals(1, tutte.size)
        assertEquals(CodaInvii.Tipo.GIORNATA, tutte[0].tipo)
        val g = tutte[0].giornata()
        assertNotNull(g)
        assertEquals("G-prova", g!!.idLocale)
        assertEquals(listOf("W-a", "W-b", "W-c"), g.lavori.map { it.idLocale })
        assertEquals(listOf(1, 2, 3), g.lavori.map { it.posizione })
        assertTrue(g.lavori.all { it.idLocaleGiornata == "G-prova" })
        assertEquals(tutte[0], coda.giornataInCoda("G-prova"))
        // Quello che parte è la forma nuova di salvaRapportino, coi tre lavori.
        assertEquals(3, g.perIlServer().getJSONArray("lavori").length())
    }

    @Test
    fun `partito com'era esce dalla coda`() {
        val coda = CodaInvii(file)
        val op = coda.giornata(tre)
        coda.completaGiornata(op.idOp, op.corpo, "RAP/2026/0160")
        assertTrue(coda.tutte().isEmpty())
        assertNull(coda.giornataInCoda("G-prova"))
    }

    @Test
    fun `cambiato mentre partiva resta, col numero del server, e riparte una volta`() {
        val coda = CodaInvii(file)
        val inViaggio = coda.giornata(tre)
        // Mentre il server risponde, si aggiunge un quarto lavoro: stessa operazione, corpo nuovo.
        coda.giornata(tre.copy(lavori = tre.lavori + lavoro("W-d", "Mario Bianchi", 1.0)))
        coda.completaGiornata(inViaggio.idOp, inViaggio.corpo, "RAP/2026/0160")
        val resta = coda.tutte()
        assertEquals(1, resta.size)
        assertEquals(inViaggio.idOp, resta[0].idOp)
        assertEquals(0, resta[0].tentativi)
        val g = resta[0].giornata()!!
        // Col numero: al secondo giro il server aggiorna lo stesso rapportino invece di crearne un altro.
        assertEquals("RAP/2026/0160", g.id)
        assertEquals("RAP/2026/0160", JSONObject(resta[0].corpo).getString("id"))
        assertEquals(4, g.lavori.size)
        // Partito anche il secondo, esce.
        coda.completaGiornata(resta[0].idOp, resta[0].corpo, "RAP/2026/0160")
        assertTrue(coda.tutte().isEmpty())
    }

    @Test
    fun `due rapportini diversi sono due operazioni`() {
        val coda = CodaInvii(file)
        coda.giornata(tre)
        coda.giornata(Giornata("G-altro", data = giorno.plusDays(1), lavori = listOf(lavoro("W-z", "Mario Bianchi", 3.0))))
        assertEquals(listOf("G-prova", "G-altro"), coda.tutte().map { it.idLocale })
    }
}
