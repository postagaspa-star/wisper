package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** I campi della fase 6 nelle pagine che c'erano già (fase6.md §12.8): letti dal server e mandati com'è scritto. */
class Fase6PagineTest {

    @Test
    fun `il mezzo della spesa si manda solo per carburante, pedaggio e parcheggio, e i km solo col carburante`() {
        val base = Spesa(data = LocalDate.of(2026, 10, 22), importo = 40.0, categoria = "carburante", idVeicolo = "2", km = 84500, mezzoChiesto = true)
        val c = base.perSalvare()
        assertEquals(2, c.getInt("idVeicolo"))
        assertEquals(84500L, c.getLong("km"))

        val nessuno = base.copy(idVeicolo = "").perSalvare()
        assertTrue("Nessuno toglie il mezzo", nessuno.has("idVeicolo") && nessuno.isNull("idVeicolo"))
        assertFalse(nessuno.has("km"))

        val pedaggio = base.copy(categoria = "pedaggio").perSalvare()
        assertEquals(2, pedaggio.getInt("idVeicolo"))
        assertFalse("i km solo col carburante", pedaggio.has("km"))

        assertFalse("il vitto non ha mezzo", base.copy(categoria = "vitto").perSalvare().has("idVeicolo"))
        assertFalse("senza mezzi fra le anagrafiche non si manda", base.copy(mezzoChiesto = false).perSalvare().has("idVeicolo"))
    }

    @Test
    fun `la spesa letta dal server tiene mezzo e km, e quella in coda anche`() {
        val s = Spesa.daJson(JSONObject("""{"id": 7, "categoria": "carburante", "importo": 50, "data": "2026-10-22", "idVeicolo": 2, "km": 84470}"""))
        assertEquals("2", s.idVeicolo)
        assertEquals(84470L, s.km)
        val inCoda = Spesa.daCorpo(JSONObject().put("categoria", "carburante").put("idVeicolo", 2).put("km", 84600), "S-1", "", s, Anagrafiche(), StatoVoce.BOZZA, false)
        assertEquals("2", inCoda.idVeicolo)
        assertEquals(84600L, inCoda.km)
    }

    @Test
    fun `veicolo dello studio e trasferta senza rimborso km`() {
        val v = Veicolo.daJson(JSONObject("""{"id": 2, "nome": "Fiat Doblò", "titolo": "Fiat Doblò GA123BC", "proprieta": "studio", "fermo": true, "euroKm": null}"""))
        assertTrue(v.delloStudio)
        assertTrue(v.fermo)
        assertEquals("Fiat Doblò GA123BC", v.titolo)
        assertFalse("senza proprietà è di una persona, come prima", Veicolo.daJson(JSONObject("""{"id": 1, "nome": "Volvo XC40"}""")).delloStudio)
        val t = Trasferta.daJson(JSONObject("""{"id": 3, "dal": "2026-10-22", "al": "2026-10-22", "destinazione": "Schio", "idVeicolo": 2, "euroKm": 0, "mezzoDelloStudio": true}"""))
        assertTrue(t.mezzoDelloStudio)
    }

    @Test
    fun `incarico con rapportini, spese e documenti, ricevuta con incarico, mezzo e strumento`() {
        val i = Incarico.daJson(JSONObject("""{"id": 2, "numero": "IN/2026/002", "stato": "affidato", "modo": "ore",
            "rapportini": [{"id": "RAP/2026/0020", "data": "2026-10-20", "descrizione": "Cablaggio", "oreTotali": 6}],
            "spese": [{"categoria": "materiale", "data": "2026-10-21", "importo": 12.5}],
            "documenti": [{"id": 9, "titolo": "Lettera d'incarico IN/2026/002"}]}"""))
        assertEquals("RAP/2026/0020", i.rapportini.single().id)
        assertEquals(6.0, i.rapportini.single().ore, 0.0)
        assertEquals("Materiale", i.spese.single().descrizione)
        assertEquals("Lettera d'incarico IN/2026/002", i.documenti.single().titolo)

        val r = Ricevuta.daJson(JSONObject("""{"id": 5, "numero": "27/2026", "idIncarico": 2, "incarico": "IN/2026/002", "idVeicolo": null, "idAttrezzatura": 4}"""))
        assertEquals("2", r.idIncarico)
        assertEquals("IN/2026/002", r.incarico)
        assertEquals("", r.idVeicolo)
        assertEquals("4", r.idAttrezzatura)
    }

    @Test
    fun `fornitore collaboratore, utente con la sua persona, tipo di formazione col preavviso`() {
        val f = Cliente.daJson(JSONObject("""{"id": "F003", "nome": "Impianti Veneti di Sartori Luca", "fornitore": true, "cliente": false, "collaboratore": true}"""))
        assertTrue(f.collaboratore)
        assertTrue("resta nella copia sul telefono", Cliente.daJson(f.aJson()).collaboratore)
        val u = Utente.daJson(JSONObject("""{"id": 7, "nome": "Luca Sartori", "ruolo": "esterno", "idSoggetto": "F003"}"""))
        assertEquals("F003", u.idSoggetto)
        assertEquals("F003", Utente.daJson(u.aJson()).idSoggetto)
        assertEquals("3", Utente.daJson(JSONObject("""{"id": 3, "nome": "Marco Rossato", "idPersona": 3}""")).idPersona)
        val t = TipoQualifica.daJson(JSONObject("""{"chiave": "pes", "nome": "PES", "gruppo": "elettrico", "ogniMesi": 60, "preavvisoGiorni": 90}"""))
        assertEquals(90, t.preavvisoGiorni)
    }
}
