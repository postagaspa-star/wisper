package eu.stgm.wisper

import eu.stgm.wisper.rapportino.FiltroArchivio
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** La visita guidata della fase 5 gira sui dati di esempio: l'urgente in cima, il giallo del ticket, i documenti. */
class DatiEsempioFase5Test {
    private val dati = DatiEsempio(LocalDate.of(2026, 10, 22))

    @Test
    fun `l'elenco dei ticket comincia con l'urgente da prendere`() = runBlocking {
        val l = dati.fase5.tickets().getOrThrow()
        val primo = l.ticket.first()
        assertEquals("TK/2026/0014", primo.numero)
        assertEquals("urgente", primo.priorita)
        assertTrue(primo.responsabileId.isBlank())
        assertEquals(1, l.conteggi.urgenti)
    }

    @Test
    fun `il ticket urgente ha il giallo Prendo io, e scrivere dice che e un esempio`() = runBlocking {
        val t = dati.fase5.ticket("14").getOrThrow()
        assertEquals("prendi", t.giallo)
        assertTrue(t.dettaglio)
        val r = dati.fase5.chiudi("14", "ticket", null, "", false)
        assertTrue(r.isFailure)
        assertTrue(r.exceptionOrNull()!!.message!!.contains("esempio"))
    }

    @Test
    fun `documenti, scadenze e contratti di esempio`() = runBlocking {
        assertTrue(dati.fase5.documenti(FiltroArchivio()).getOrThrow().documenti.any { it.collegamento && it.collegamentoTipo == "onedrive" })
        assertEquals(1, dati.fase5.scadenze().getOrThrow().scadute.size)
        assertEquals("CA/2026/002", dati.fase5.contratti().getOrThrow().single().numero)
    }
}
