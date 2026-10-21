package eu.stgm.wisper.rapportino

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDate

/**
 * Lo storico dell'ufficio e le immagini dei PDF restano sul telefono: si apre
 * coi dati dell'ultima volta, e una firma gia' scaricata non si chiede due volte.
 */
class CopiaLocaleTest {

    @get:Rule
    val cartella = TemporaryFolder()

    @Test
    fun `lo storico sopravvive a un riavvio, coi campi dell'ufficio`() {
        val r = Rapportino(
            idLocale = "W-1", data = LocalDate.of(2026, 7, 2), id = "RAP/2026/0001", stato = Stato.FATTURATO,
            inviatoIl = "2026-07-03T09:00:00", fatturatoIl = "2026-07-31T09:00:00", creato = "2026-07-02T18:00:00",
            costoOrario = 22.0, conto = Conto(9.0, 30.0, 240.0, 91.2, 341.2, euroKm = 0.76),
        )
        CopiaLocale(cartella.root).scriviStorico(listOf(r))
        val riletto = CopiaLocale(cartella.root).storico().single()
        assertEquals(r, riletto)
    }

    @Test
    fun `un file scaricato si ritrova, col suo tipo`() {
        val copia = CopiaLocale(cartella.root)
        assertNull(copia.fileDelFoglio("1AbCdEfGhIjK"))
        copia.scriviFileDelFoglio("1AbCdEfGhIjK", byteArrayOf(1, 2, 3), "image/png")
        val (dati, mime) = CopiaLocale(cartella.root).fileDelFoglio("1AbCdEfGhIjK")!!
        assertArrayEquals(byteArrayOf(1, 2, 3), dati)
        assertEquals("image/png", mime)
        // Un id strano non esce dalla cartella.
        assertNull(copia.fileDelFoglio("../anagrafiche"))
    }

    @Test
    fun `le anagrafiche complete sopravvivono a un riavvio`() {
        val a = Anagrafiche(
            clienti = listOf(Cliente("C001", "Elettrodinamica", tariffaFissa = 30.0, telefono = "0445123456", partitaIva = "01234567890", costoFisso = 22.0)),
            commesse = listOf(
                Commessa(
                    "26ST001", "C001", "Magazzino", budgetOre = 120.0, costoOrario = 25.0, inizio = LocalDate.of(2026, 9, 1),
                    codicePrecedente = "P2601", note = "Chiavi dal custode",
                ),
            ),
            impostazioni = mapOf("EURO_KM" to "0.76", "PARTITA_IVA" to "01234567890"),
        )
        CopiaLocale(cartella.root).scriviAnagrafiche(a)
        val riletta = CopiaLocale(cartella.root).anagrafiche()
        assertEquals(a, riletta)
        // Un rapportino rimasto in coda col codice di prima trova la sua commessa.
        assertEquals("26ST001", riletta.commessa("p2601")?.id)
    }
}
