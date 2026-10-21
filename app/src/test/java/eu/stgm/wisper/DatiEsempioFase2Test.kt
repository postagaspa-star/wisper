package eu.stgm.wisper

import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.StatoPreventivo
import eu.stgm.wisper.rapportino.TipoAttivita
import eu.stgm.wisper.rapportino.Attivita
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * I dati della visita guidata della fase 2 (DatiEsempio.kt): il preventivo del
 * prototipo con i suoi conti, l'accettazione con le scelte, la commessa che nasce,
 * le attività e le loro regole, come le farebbe il server.
 */
class DatiEsempioFase2Test {
    private val oggi = LocalDate.of(2026, 10, 22)

    @Test
    fun `il PR 012 del prototipo, accettato con le scelte, diventa una commessa una volta sola`() = runBlocking {
        val d = DatiEsempio(oggi)
        val p = d.preventivo("P5").getOrThrow()
        assertEquals(4291.35, p.conto().totale, 0.0)
        assertEquals(2, p.revisioni.size)
        assertEquals(StatoPreventivo.INVIATO, p.statoVisto(oggi))
        // Il cliente vuole la DiRi e il collaudo esterno: come l'esempio vero della §13.5.
        val accettato = d.accettaPreventivo("P5", "voce", "Andrea Rossi", mapOf("V4" to true, "V6" to true)).getOrThrow()
        assertEquals(StatoPreventivo.ACCETTATO, accettato.stato)
        val k = accettato.conto()
        assertEquals(4040.0, k.imponibile, 0.0)
        assertEquals(5175.24, k.totale, 0.0)
        val m = d.creaCommessaDaPreventivo("P5").getOrThrow()
        assertEquals(4040.0, m.importoContratto!!, 0.0)
        assertEquals(16.0, m.budgetOre!!, 0.0)
        val prestazioni = d.anagrafiche.value.prestazioniDi(m.id)
        assertEquals(5, prestazioni.size)
        assertEquals(4040.0, prestazioni.sumOf { it.valore ?: 0.0 }, 0.01)
        assertTrue(d.creaCommessaDaPreventivo("P5").isFailure)
    }

    @Test
    fun `il testo del promemoria dice quando e dove`() {
        val app = Attivita("1", "Sopralluogo", tipo = TipoAttivita.SOPRALLUOGO, inizio = oggi.atTime(14, 30), fine = oggi.atTime(16, 0), luogo = "Zanè")
        assertEquals("Alle 14:30 · Zanè", Promemoria.testoDi(app, oggi))
        assertEquals("Domani alle 14:30 · Zanè", Promemoria.testoDi(app.copy(inizio = oggi.plusDays(1).atTime(14, 30)), oggi))
        assertEquals("Scade oggi", Promemoria.testoDi(Attivita("2", "Polizza", scadenza = oggi), oggi))
        assertEquals("Scade domani", Promemoria.testoDi(Attivita("2", "Polizza", scadenza = oggi.plusDays(1)), oggi))
    }

    @Test
    fun `una bozza senza complessità chiede conferma prima di partire`() = runBlocking {
        val d = DatiEsempio(oggi)
        val e = d.segnaInviato("P6").exceptionOrNull()
        assertTrue(e is PonteServer.DaConfermare)
        assertEquals(StatoPreventivo.INVIATO, d.segnaInviato("P6", conferma = true).getOrThrow().stato)
    }

    @Test
    fun `una revisione nuova sostituisce la vecchia, che resta da consultare`() = runBlocking {
        val d = DatiEsempio(oggi)
        val nuova = d.nuovaRevisione("P5").getOrThrow()
        assertEquals(2, nuova.revisione)
        assertTrue(nuova.bozza)
        assertEquals(3, nuova.revisioni.size)
        assertTrue(d.preventivi.value.none { it.id == "P5" })
        assertTrue(d.salvaPreventivo(d.preventivo("P5").getOrThrow()).isFailure)
    }

    @Test
    fun `attività, un appuntamento sovrapposto chiede conferma, fatta e di nuovo da fare`() = runBlocking {
        val d = DatiEsempio(oggi)
        val nuovo = Attivita("", "Telefonata", tipo = TipoAttivita.APPUNTAMENTO, inizio = oggi.atTime(9, 0), fine = oggi.atTime(9, 30), assegnataA = "1")
        assertTrue(d.salvaAttivita(nuovo).exceptionOrNull() is PonteServer.DaConfermare)
        val salvata = d.salvaAttivita(nuovo, conferma = true).getOrThrow()
        assertTrue(salvata.id.isNotBlank())
        assertTrue(d.faiAttivita("A3", true).getOrThrow().fatta)
        assertTrue(!d.faiAttivita("A3", false).getOrThrow().fatta)
        // La dashboard della visita ha le voci della fase 2.
        val dash = d.dashboard.value!!
        assertTrue(dash.urgenti.any { it.collegamento?.pagina == "attivita" })
        assertTrue(dash.settimana.any { it.collegamento?.pagina == "preventivo" })
    }
}
