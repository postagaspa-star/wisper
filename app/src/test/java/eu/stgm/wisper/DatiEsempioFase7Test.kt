package eu.stgm.wisper

import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Segnaposti
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Comunicazioni e portale della visita guidata (EsempioFase7): le pagine nuove hanno da
 * mostrare coi nomi dell'accordo, solo dati di esempio, e scrivere dice che è un esempio.
 */
class DatiEsempioFase7Test {
    private val dati = DatiEsempio(LocalDate.of(2026, 10, 22))

    @Test
    fun `Da mandare, storico, modelli e notifiche di esempio`() = runBlocking {
        val d = dati.fase7.daMandare().getOrThrow()
        val p = d.oggi.single()
        assertEquals("Sig. Ferretti", p.a.nome)
        assertEquals("+39 333 000 1122", p.a.numeroVisto)
        assertTrue("il testo è già composto: niente segnaposti", Segnaposti.mancano(p.testo).isEmpty())
        assertTrue(d.proposti.any { it.pagamento })
        assertEquals(1, d.preparati.size)

        val s = dati.fase7.storico().getOrThrow()
        assertTrue(s.comunicazioni.any { it.canale == "whatsapp" } && s.comunicazioni.any { it.entrata })
        assertTrue("filtrato per email", dati.fase7.storico(listOf("canale" to "email")).getOrThrow().comunicazioni.all { it.canale == "email" })

        val m = dati.fase7.modelli().getOrThrow()
        assertEquals(8, m.modelli.size)
        assertTrue(m.modelli.all { Segnaposti.sconosciuto(it.testo + " " + it.oggetto, it.uso, m.segnaposti) == null })
        assertEquals(2, dati.fase7.notifiche().getOrThrow().nuove)

        val pronto = dati.fase7.prepara("libero", "whatsapp", mapOf("idReferente" to "7")).getOrThrow()
        assertEquals("Buongiorno Mario Bianchi, ", pronto.testo)
        assertTrue(pronto.link.startsWith("https://wa.me/393400004455?text="))
    }

    @Test
    fun `il portale di esempio collegato, da guardare, il cliente, senza IP`() = runBlocking {
        val p = dati.fase7.portale().getOrThrow()
        assertEquals("Collegato", p.stato.parola)
        assertTrue(p.daGuardare.first().urgente)
        val c = dati.fase7.portaleCliente("C002").getOrThrow()
        assertEquals("Rossi Impianti Srl", c.nome)
        assertEquals(listOf("Attivo", "Invitato"), c.referenti.map { it.statoVisto })
        assertTrue(c.caricamenti.isNotEmpty())
        assertTrue(dati.fase7.accessi().getOrThrow().any { it.errore })
        assertTrue("scrivere è un esempio", dati.fase7.controlla().isFailure)
    }

    @Test
    fun `la sessione della visita vede il menu nuovo, la Dashboard ha i numeri, le anagrafiche il portale`() {
        val sessione = dati.sessione.value
        assertTrue(sessione.permessi.vede(Moduli.COMUNICAZIONI))
        assertTrue(sessione.permessi.vede(Moduli.PORTALE))
        assertTrue(sessione.interfaccia.portaleCollegato)
        dati.aggiornaDashboard()
        val d = dati.dashboard.value!!
        assertEquals(4, d.fase7.portaleDaGuardare)
        assertEquals(2, d.fase7.numerinoComunicazioni)
        assertTrue(d.urgenti.any { it.titolo.startsWith("Richiesta urgente dal portale") })
        val ana = dati.anagrafiche.value
        assertTrue(ana.cliente("C002", "")!!.portale)
        assertFalse(ana.cliente("C001", "")!!.portale)
        val ferretti = ana.referentiDi("C002").first { it.nome == "Sig. Ferretti" }
        assertTrue(ferretti.portale && ferretti.whatsappOk)
        assertTrue(ana.referentiDi("C002").any { it.pagamenti })
    }
}
