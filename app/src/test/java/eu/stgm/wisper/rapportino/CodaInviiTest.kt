package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDate

/**
 * La coda e' l'unico posto in cui una modifica fatta sul telefono vive finche'
 * il foglio non risponde. Qui dentro non si deve perdere niente: ne' fra un
 * riavvio e l'altro, ne' con un file rovinato, ne' con i tentativi.
 */
class CodaInviiTest {

    @get:Rule
    val cartella = TemporaryFolder()

    private val file: File get() = File(cartella.root, "coda-invii.json")

    private val completo = Rapportino(
        idLocale = "W-prova",
        data = LocalDate.of(2026, 10, 15),
        tecnico = "Manuel Gasparotto",
        idCliente = "C001",
        cliente = "Batokyo",
        idCommessa = "P2601",
        commessa = "Nuovo magazzino automatico",
        descrizione = "Collaudo quadro elettrico",
        oreLavoro = 6.5,
        oreExtra = 1.0,
        oreViaggio = 1.5,
        km = 120.0,
        spese = 12.5,
        noteSpese = "Pranzo",
        tariffa = null,
        noteInterne = "Richiamare per la seconda linea",
    )

    @Test
    fun `sopravvive a un riavvio con tutti i campi`() {
        CodaInvii(file).salva(completo)

        val riletta = CodaInvii(file).tutte()   // un'altra istanza: come dopo un riavvio
        assertEquals(1, riletta.size)
        assertEquals(CodaInvii.Tipo.SALVA, riletta[0].tipo)
        assertEquals(completo, riletta[0].rapportino)
    }

    @Test
    fun `la tariffa scritta a mano resta, quella vuota resta vuota`() {
        val privato = completo.copy(idLocale = "W-privato", tariffa = 42.0)
        CodaInvii(file).salva(privato)
        CodaInvii(file).salva(completo)
        val r = CodaInvii(file).tutte()
        assertEquals(42.0, r[0].rapportino!!.tariffa!!, 0.0)
        assertNull(r[1].rapportino!!.tariffa)
    }

    @Test
    fun `due salvataggi dello stesso rapportino occupano un posto solo, con l'ultima versione`() {
        val coda = CodaInvii(file)
        coda.salva(completo)
        coda.foto("W-prova", "f1", "/foto/f1.jpg")
        coda.salva(completo.copy(oreLavoro = 7.0))

        val tutte = coda.tutte()
        assertEquals(2, tutte.size)
        // Il salvataggio resta PRIMA della foto: la foto ha bisogno della riga.
        assertEquals(CodaInvii.Tipo.SALVA, tutte[0].tipo)
        assertEquals(7.0, tutte[0].rapportino!!.oreLavoro, 0.0)
        assertEquals(CodaInvii.Tipo.FOTO, tutte[1].tipo)
    }

    @Test
    fun `un salvataggio rifiutato non assorbe quello nuovo`() {
        val coda = CodaInvii(file)
        val primo = coda.salva(completo)
        coda.aggiorna(primo.copy(errore = "Codice sbagliato"))
        coda.salva(completo.copy(oreLavoro = 7.0))
        assertEquals(2, coda.tutte().size)
    }

    @Test
    fun `l'ordine e' quello in cui le cose sono state fatte`() {
        val coda = CodaInvii(file)
        coda.salva(completo)
        coda.foto("W-prova", "f1", "/foto/f1.jpg")
        coda.firma("W-prova", "s1", "/firme/s1.png", "Mario Bianchi", "2026-10-15T17:30:00")
        coda.stato("W-prova", Stato.BOZZA)
        assertEquals(
            listOf(CodaInvii.Tipo.SALVA, CodaInvii.Tipo.FOTO, CodaInvii.Tipo.FIRMA, CodaInvii.Tipo.STATO),
            CodaInvii(file).tutte().map { it.tipo },
        )
        val firma = CodaInvii(file).tutte()[2]
        assertEquals("Mario Bianchi", firma.firmatario)
        assertEquals(Stato.BOZZA, CodaInvii(file).tutte()[3].stato)
    }

    @Test
    fun `i tentativi e il rifiuto sopravvivono a un riavvio`() {
        val op = CodaInvii(file).salva(completo)
        CodaInvii(file).aggiorna(op.copy(tentativi = 3, errore = "Il rapportino e' gia' firmato"))
        val riletta = CodaInvii(file).tutte().single()
        assertEquals(3, riletta.tentativi)
        assertTrue(riletta.rifiutata)
    }

    @Test
    fun `togliere un'operazione non tocca le altre`() {
        val coda = CodaInvii(file)
        val a = coda.salva(completo)
        coda.salva(completo.copy(idLocale = "W-altro"))
        coda.togli(a.idOp)
        assertEquals(listOf("W-altro"), coda.tutte().map { it.idLocale })
    }

    @Test
    fun `un file rovinato non si sovrascrive e non blocca la coda`() {
        file.writeText("{ questo non e' json")
        val coda = CodaInvii(file)
        assertTrue(coda.tutte().isEmpty())
        // Il file rovinato e' stato messo da parte, non cancellato.
        assertTrue(cartella.root.listFiles()!!.any { it.name.startsWith("coda-invii.json.illeggibile-") })
        coda.salva(completo)
        assertEquals(1, CodaInvii(file).tutte().size)
    }
}
