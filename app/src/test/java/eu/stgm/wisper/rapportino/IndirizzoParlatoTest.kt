package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * L'indirizzo scritto e l'indirizzo detto sono due cose diverse.
 * "Via Roma 47, 36016 Thiene (VI)" letto da una voce sintetica diventa
 * "via roma quarantasette virgola trentaseimilasedici thiene vi": rumore.
 * Detto serve solo a capire QUALE lavoro, quindi bastano via e citta'.
 */
class IndirizzoParlatoTest {

    private fun parlato(indirizzo: String) =
        Commessa(id = "M001", idCliente = "C001", descrizione = "x", stato = "APERTA", indirizzo = indirizzo)
            .indirizzoParlato

    @Test
    fun `toglie civico cap e provincia`() {
        assertEquals("Via Roma a Thiene", parlato("Via Roma 47, 36016 Thiene (VI)"))
    }

    @Test
    fun `provincia come sigla senza parentesi`() {
        assertEquals("Via Roma a Thiene", parlato("Via Roma 47, 36016 Thiene VI"))
    }

    @Test
    fun `senza cap`() {
        assertEquals("Via Trento a Marostica", parlato("Via Trento 12, Marostica"))
    }

    @Test
    fun `senza numero civico`() {
        assertEquals("Contra' Porti a Vicenza", parlato("Contra' Porti, 36100 Vicenza"))
    }

    /**
     * Senza virgola non si sa che formato sia, quindi non si tocca: meglio
     * leggere un civico di troppo che storpiare "lotto 7" in "lotto".
     */
    @Test
    fun `senza virgola resta com'e'`() {
        assertEquals("Via Roma 47", parlato("Via Roma 47"))
    }

    @Test
    fun `indirizzo vuoto non produce niente`() {
        assertEquals("", parlato(""))
    }

    @Test
    fun `formato imprevisto si restituisce intero invece di rovinarlo`() {
        assertEquals("Zona industriale lotto 7", parlato("Zona industriale lotto 7"))
    }
}
