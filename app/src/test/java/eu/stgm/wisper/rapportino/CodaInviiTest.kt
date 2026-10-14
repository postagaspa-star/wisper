package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * La coda e' l'unico posto in cui un rapportino confermato vive finche' il
 * foglio non risponde. Qui dentro non si deve perdere niente: ne' fra un
 * riavvio e l'altro, ne' con un file rovinato, ne' con i tentativi.
 */
class CodaInviiTest {

    @get:Rule
    val cartella = TemporaryFolder()

    private val file: File get() = File(cartella.root, "coda-invii.json")

    private val completo = Rapportino(
        cliente = "Rossi Impianti Srl",
        commessa = "M001",
        descrizione = "Manutenzione ordinaria impianto",
        ore = 4.0,
        km = 15.0,
        spese = 0.0,
        statoCommessa = StatoCommessa.CHIUSA,
    )

    @Test
    fun `sopravvive a un riavvio con tutti i campi`() {
        CodaInvii(file).aggiungi(completo)

        val riletta = CodaInvii(file).tutte()   // un'altra istanza: come dopo un riavvio
        assertEquals(1, riletta.size)
        assertEquals(completo, riletta.first().rapportino)
        assertEquals(0, riletta.first().tentativi)
    }

    @Test
    fun `i campi mai detti restano vuoti, non diventano zero`() {
        CodaInvii(file).aggiungi(Rapportino(cliente = "SPM Srl"))

        val r = CodaInvii(file).tutte().first().rapportino
        assertEquals("SPM Srl", r.cliente)
        assertEquals(null, r.km)       // "non ne ha parlato" non e' "zero chilometri"
        assertEquals(null, r.spese)
        assertEquals(null, r.statoCommessa)
    }

    @Test
    fun `la data e' quella in cui e' stato detto`() {
        val lunedi = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ITALY).parse("21/09/2026 18:40")!!
        val voce = CodaInvii(file).aggiungi(completo, ora = lunedi)
        assertEquals("21/09/2026", voce.data)
    }

    @Test
    fun `ognuno ha il suo id e l'ordine e' quello in cui sono stati detti`() {
        val coda = CodaInvii(file)
        val primo = coda.aggiungi(completo.copy(cliente = "Primo"))
        val secondo = coda.aggiungi(completo.copy(cliente = "Secondo"))

        assertNotEquals(primo.idLocale, secondo.idLocale)
        assertEquals(listOf("Primo", "Secondo"), coda.tutte().map { it.rapportino.cliente })
    }

    @Test
    fun `i tentativi si contano e il codice nuovo della commessa resta`() {
        val coda = CodaInvii(file)
        val voce = coda.aggiungi(completo.copy(commessa = "manutenzione caldaia"))

        coda.aggiorna(voce.copy(rapportino = voce.rapportino.copy(commessa = "M005"), tentativi = 2))

        val riletta = CodaInvii(file).tutte().single()
        assertEquals("M005", riletta.rapportino.commessa)
        assertEquals(2, riletta.tentativi)
        assertEquals(voce.idLocale, riletta.idLocale)   // stesso rapportino per il foglio
    }

    @Test
    fun `esce solo quello arrivato`() {
        val coda = CodaInvii(file)
        val arrivato = coda.aggiungi(completo.copy(cliente = "Arrivato"))
        coda.aggiungi(completo.copy(cliente = "In attesa"))

        coda.togli(arrivato.idLocale)

        assertEquals(listOf("In attesa"), CodaInvii(file).tutte().map { it.rapportino.cliente })
    }

    @Test
    fun `un file rovinato non si sovrascrive, si mette da parte`() {
        file.writeText("{ questo non e' json")

        assertTrue(CodaInvii(file).tutte().isEmpty())

        val messiDaParte = cartella.root.listFiles()!!.filter { it.name.contains("illeggibile") }
        assertEquals(1, messiDaParte.size)
        assertEquals("{ questo non e' json", messiDaParte.first().readText())
    }
}
