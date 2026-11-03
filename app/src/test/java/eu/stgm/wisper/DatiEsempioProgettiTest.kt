package eu.stgm.wisper

import eu.stgm.wisper.rapportino.ProgettoNuovo
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.RegoleProgetti
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * I progetti della visita guidata (progetti.md §4.8): due o tre progetti d'esempio coi loro rapportini, il servizio
 * finto che risponde come il server (codice proposto, gia' preso, togli solo senza rapportini) e il progetto nato in
 * un rapportino che diventa un progetto vero. La visita parte ancora dal recente di Elettrodinamica, col suo progetto.
 */
class DatiEsempioProgettiTest {
    private val oggi = LocalDate.of(2026, 10, 22)

    @Test
    fun `tre progetti d'esempio coi conti dei rapportini, e il primo recente ha il progetto`() {
        val d = DatiEsempio(oggi)
        val p = d.anagrafiche.value.progetti
        assertEquals(listOf("ED-001", "ED-002", "RS-01"), p.map { it.codice })
        assertTrue(p.all { it.rapportini > 0 && it.ore > 0 })
        val r = Riepiloghi.recenti(d.viste.value, d.anagrafiche.value, conProgetti = true)
        assertEquals("26ST044", r.first().idCommessa)
        assertEquals("ED-001", r.first().progetto?.codice)
    }

    @Test
    fun `con Commesse spenta i recenti del rapportino sono i clienti, uno per cliente e senza commessa`() {
        val d = DatiEsempio(oggi)
        val conCommesse = Riepiloghi.recenti(d.viste.value, d.anagrafiche.value)
        val r = Riepiloghi.recenti(d.viste.value, d.anagrafiche.value, soloClienti = true)
        assertTrue(r.isNotEmpty() && r.size <= 4)
        assertTrue(r.all { it.idCommessa.isBlank() && it.commessa.isBlank() && it.progetto == null })
        assertEquals(r.size, r.map { it.idCliente.ifBlank { it.cliente } }.distinct().size)
        assertEquals(conCommesse.first().cliente, r.first().cliente)
    }

    @Test
    fun `il servizio d'esempio propone il codice, rifiuta i doppioni e toglie solo senza rapportini`() = runBlocking<Unit> {
        val d = DatiEsempio(oggi)
        assertEquals("ED-003", d.progetti.codice("26ST044").getOrThrow().codice)
        assertEquals("ED-003", RegoleProgetti.codiceProposto(d.anagrafiche.value, emptyList(), "26ST044", "C001", oggi))
        val nuovo = d.progetti.crea("26ST044", "ED-003", true, "", "Illuminazione").getOrThrow().dato
        assertEquals("ED-003", nuovo.codice)
        assertTrue(nuovo.codiceAutomatico)
        assertEquals(4, d.anagrafiche.value.progetti.size)
        assertEquals("Il codice ed-001 è già di un altro progetto di questo cliente",
            d.progetti.crea("26ST044", "ed-001", false, "", "X").exceptionOrNull()?.message)
        assertEquals("Il progetto ha dei rapportini: non si toglie, si chiude", d.progetti.togli("1").exceptionOrNull()?.message)
        d.progetti.chiudi("1", true).getOrThrow()
        assertTrue(!d.anagrafiche.value.progetto("1")!!.aperto)
        d.progetti.togli(nuovo.id).getOrThrow()
        assertEquals(3, d.anagrafiche.value.progetti.size)
        val (scheda, rapportini) = d.progetti.scheda("2").getOrThrow()
        assertEquals("ED-002", scheda.codice)
        assertEquals(scheda.rapportini, rapportini.size)
    }

    @Test
    fun `un progetto nato nel rapportino diventa un progetto della commessa`() {
        val d = DatiEsempio(oggi)
        val n = ProgettoNuovo("P-esempio", "ED-003", true, "Bianchi Spa", "Linea 2")
        val r = Rapportino.nuovo("Manuel Gasparotto", oggi).copy(
            idLocale = "esempio-nuovo", idCliente = "C001", cliente = "Elettrodinamica", idCommessa = "26ST044", commessa = "Nuovo magazzino automatico",
            descrizione = "Prova", oreLavoro = 2.0, progetto = "ED-003", progettoDescrizione = "Linea 2", progettoNuovo = n,
        )
        d.salva(r)
        val p = d.anagrafiche.value.progetti.single { it.idLocale == "P-esempio" }
        assertEquals("ED-003", p.codice)
        assertEquals("Bianchi Spa", p.intestatoA)
        assertEquals(1, p.rapportini)
        val salvato = d.viste.value.single { it.rapportino.idLocale == "esempio-nuovo" }.rapportino
        assertEquals(p.id, salvato.idProgetto)
    }
}
