package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * Servizi e indennità (1.4.0, docs/gestionale/servizi.md §1-§2): l'importo di un'indennità come importoDi del server
 * (centesimi(quantità × prezzo), quantità vuota = 1), la somma nel totale del lavoro, il JSON in andata e in ritorno, e
 * un server di prima che non conosce le indennità.
 */
class ServiziTest {

    private fun ind(q: Double?, prezzo: Double?, descrizione: String = "Indennità di trasferta") =
        Indennita(idServizio = "9", codice = "IND1", descrizione = descrizione, quantita = q, unita = "Giorni", prezzo = prezzo)

    // ------------------------------------------------------------------ i conti

    @Test
    fun `importo di un'indennita, quantita vuota vale 1, al centesimo come Math round`() {
        assertEquals(30.0, Servizi.importo(null, 30.0), 0.0)
        assertEquals(92.96, Servizi.importo(2.0, 46.48), 0.0)
        assertEquals(0.0, Servizi.importo(3.0, null), 0.0)
        // 3 × 0,335 = 1,005: il mezzo centesimo va in su, come centesimi() del server.
        assertEquals(1.01, Servizi.importo(3.0, 0.335), 0.0)
        assertEquals(1.01, ind(3.0, 0.335).importo, 0.0)
    }

    @Test
    fun `la somma delle indennita entra nel totale del lavoro`() {
        val lista = listOf(ind(2.0, 46.48), ind(null, 30.0, "Indennità di reperibilità"), ind(3.0, 0.335))
        assertEquals(123.97, Servizi.somma(lista), 0.0)
        assertEquals(0.0, Servizi.somma(null), 0.0)
        assertEquals(0.0, Servizi.somma(emptyList()), 0.0)

        val regole = Regole(tariffaFissa = null, pagaViaggio = false, kmRimborsati = true, maggExtra = 0.0, euroKm = 0.5)
        val senza = Rapportino.nuovo("Manuel", LocalDate.of(2026, 11, 12)).copy(oreLavoro = 4.0, km = 20.0, spese = 12.5, tariffa = 40.0)
        val conto0 = Calcolo.calcola(senza, regole)
        assertEquals(0.0, conto0.indennita, 0.0)
        val con = senza.copy(indennita = lista)
        val conto = Calcolo.calcola(con, regole)
        assertEquals(123.97, conto.indennita, 0.0)
        assertEquals(Servizi.centesimi(conto0.totale + 123.97), conto.totale, 0.0)
        // Il resto del conto non cambia.
        assertEquals(conto0.compensoOre, conto.compensoOre, 0.0)
        assertEquals(conto0.rimborsoKm, conto.rimborsoKm, 0.0)
    }

    // ------------------------------------------------------------------ il JSON

    @Test
    fun `un'indennita va e torna dal JSON con tutti i campi`() {
        val i = Indennita(
            idServizio = "12", codice = "IND-TR", descrizione = "Indennità di trasferta", quantita = 2.0, unita = "Giorni",
            prezzo = 300.0, aliquotaIva = 22.0, tipo = Servizi.SERVIZIO, prezzoAcquisto = 10.0, aliquotaAcquisto = 10.0,
            fornitore = "Rossi Srl", tag = listOf("cantiere", "trasferta"), note = "solo fuori provincia", immagine = FileRemoto("77", "/file/77"),
        )
        val o = i.perServer()
        assertEquals(12L, o.get("idServizio"))
        assertEquals(2.0, o.getDouble("quantita"), 0.0)
        assertEquals(2, o.getJSONArray("tag").length())
        assertEquals("77", o.getJSONObject("immagine").getString("id"))
        assertFalse("verso il server l'importo lo fa lui", o.has("importo"))
        assertEquals(i, Indennita.daJson(JSONObject(o.toString())))

        val copia = i.aJson()
        assertEquals(600.0, copia.getDouble("importo"), 0.0)
        val tornata = Indennita.daJson(JSONObject(copia.toString()))
        assertEquals(600.0, tornata.importoServer!!, 0.0)
        assertEquals(i, tornata.copy(importoServer = null))
    }

    @Test
    fun `un'indennita scritta a mano manda idServizio null, la quantita vuota resta null`() {
        val o = Indennita(descrizione = "Indennità a mano", quantita = null, unita = "Nr", prezzo = 15.0).perServer()
        assertTrue(o.isNull("idServizio"))
        assertTrue(o.isNull("quantita"))
        assertTrue(o.isNull("immagine"))
        val tornata = Indennita.daJson(o)
        assertNull(tornata.quantita)
        assertEquals(15.0, tornata.importo, 0.0)
    }

    @Test
    fun `l'immagine si legge come oggetto o come id`() {
        assertEquals(FileRemoto("5", "/file/5"), Indennita.daJson(JSONObject().put("immagine", "5")).immagine)
        assertEquals(FileRemoto("6", "/file/6"), Indennita.daJson(JSONObject().put("immagine", JSONObject().put("id", "6").put("url", "/file/6"))).immagine)
        assertNull(Indennita.daJson(JSONObject().put("immagine", JSONObject.NULL)).immagine)
    }

    @Test
    fun `il lavoro manda le indennita solo se le conosce`() {
        val base = Rapportino.nuovo("Manuel", LocalDate.of(2026, 11, 12)).copy(cliente = "Rossi Impianti Srl", oreLavoro = 2.0)
        // Da un server di prima (o una copia vecchia): non si sa niente, non si manda niente (il server tiene le sue).
        assertFalse(base.perIlFoglio().has("indennita"))
        // Un elenco, anche vuoto, si manda intero: vuoto = toglile.
        assertEquals(0, base.copy(indennita = emptyList()).perIlFoglio().getJSONArray("indennita").length())
        val con = base.copy(indennita = listOf(ind(2.0, 46.48)))
        val a = con.perIlFoglio().getJSONArray("indennita")
        assertEquals(1, a.length())
        assertEquals("IND1", a.getJSONObject(0).getString("codice"))
        assertFalse(a.getJSONObject(0).has("importo"))
    }

    @Test
    fun `la risposta del server porta indennita, importo per riga e importoIndennita`() {
        val o = Rapportino.nuovo("Manuel", LocalDate.of(2026, 11, 12)).copy(cliente = "Rossi Impianti Srl").perIlFoglio()
            .put("totale", 192.96).put("compensoOre", 100.0).put("rimborsoKm", 0.0).put("importoIndennita", 92.96)
            .put("indennita", JSONArray().put(ind(2.0, 46.48).perServer().put("importo", 92.96)))
        val r = Rapportino.daJson(JSONObject(o.toString()))
        assertEquals(1, r.indennita!!.size)
        assertEquals(92.96, r.indennita!![0].importoServer!!, 0.0)
        assertEquals(92.96, r.conto!!.indennita, 0.0)

        // Un server di prima: niente indennita (null, non vuoto) e importoIndennita 0.
        val vecchio = JSONObject(o.toString()).apply { remove("indennita"); remove("importoIndennita") }
        val v = Rapportino.daJson(vecchio)
        assertNull(v.indennita)
        assertEquals(0.0, v.conto!!.indennita, 0.0)
    }

    @Test
    fun `la copia sul telefono tiene le indennita e il lavoro cambiato si riconosce`() {
        val r = Rapportino.nuovo("Manuel", LocalDate.of(2026, 11, 12)).copy(cliente = "Rossi Impianti Srl", indennita = listOf(ind(1.0, 30.0)))
        val copia = Rapportino.daJson(JSONObject(r.aJson().toString()))
        assertEquals(r.indennita!!.map { it.copy(importoServer = null) }, copia.indennita!!.map { it.copy(importoServer = null) })
        // L'importo mandato dal server non fa sembrare cambiato il lavoro.
        assertEquals(r.soloCompilato(), copia.soloCompilato())
        assertFalse(r.soloCompilato() == r.copy(indennita = listOf(ind(2.0, 30.0))).soloCompilato())
    }

    // ------------------------------------------------------------------ i servizi

    @Test
    fun `un servizio va e torna dal JSON coi campi di Flextaxa`() {
        val v = VoceListino(
            id = "3", nome = "Sopralluogo", codice = "SOP", modo = ModoVoce.ORE, unita = "Ore", prezzo = 45.0, ordine = 2,
            tipo = Servizi.PRODOTTO, aliquotaIva = 10.0, prezzoAcquisto = 20.0, aliquotaAcquisto = 4.0, fornitore = "Rossi Srl",
            tag = listOf("trasferta", "cantiere"), note = "non nei documenti", immagine = FileRemoto("8", "/file/8"),
        )
        val o = JSONObject(v.aJson().toString())
        assertEquals("trasferta", o.getJSONArray("tag").getString(0))
        assertEquals(v, VoceListino.daJson(o))
        assertEquals("45,00 €/h", v.prezzoPerUnita())
        assertEquals("30,00 €/giorno", v.copy(prezzo = 30.0, unita = "Giorni").prezzoPerUnita())
        assertEquals("12,00 €", v.copy(prezzo = 12.0, unita = "Nr").prezzoPerUnita())
        assertEquals("350,00 €", v.copy(prezzo = 350.0, unita = "A corpo").prezzoPerUnita())
        assertNull(v.copy(prezzo = null).prezzoPerUnita())
    }

    @Test
    fun `un servizio di prima senza i campi nuovi prende quelli di base`() {
        val v = VoceListino.daJson(JSONObject("""{"id":"1","nome":"Collaudo","modo":"corpo","prezzo":350}"""))
        assertEquals(Servizi.SERVIZIO, v.tipo)
        assertEquals(22.0, v.aliquotaIva, 0.0)
        assertEquals(emptyList<String>(), v.tag)
        assertNull(v.immagine)
        assertNull(v.prezzoAcquisto)
        // I tag scritti come testo (dati di prima) diventano un elenco senza doppioni.
        assertEquals(listOf("eppi", "Trasferta"), VoceListino.daJson(JSONObject().put("id", "2").put("tag", "eppi, Trasferta; EPPI")).tag)
    }

    @Test
    fun `la ricerca guarda descrizione, codice e tag, senza accenti`() {
        val voci = listOf(
            VoceListino("1", "Collaudo quadro", codice = "COL", ordine = 1),
            VoceListino("2", "Indennità di trasferta", codice = "IND1", ordine = 2, tag = listOf("viaggio")),
            VoceListino("3", "Sopralluogo", codice = "SOP", ordine = 3, attivo = false),
            VoceListino("4", "Indennità di reperibilità", codice = "IND2", ordine = 4),
        )
        assertEquals(listOf("1", "2", "4"), Servizi.elenco(voci, "").map { it.id })
        assertEquals(listOf("3"), Servizi.elenco(voci, "", attivi = false).map { it.id })
        assertEquals(listOf("2", "4"), Servizi.elenco(voci, "indennita").map { it.id })
        assertEquals(listOf("2"), Servizi.elenco(voci, "VIAGGIO").map { it.id })
        assertEquals(listOf("1"), Servizi.elenco(voci, "col").map { it.id })
        // Nella schermata Indennità prima quelle che si chiamano "Indennità…", poi gli altri; mai gli archiviati.
        assertEquals(listOf("2", "4", "1"), Servizi.perIndennita(voci, "").map { it.id })
    }

    @Test
    fun `unita, modo e tag come il server`() {
        assertEquals(ModoVoce.ORE, Servizi.modoDaUnita("Ore"))
        assertEquals(ModoVoce.CORPO, Servizi.modoDaUnita("A corpo"))
        assertEquals(ModoVoce.CORPO, Servizi.modoDaUnita(""))
        assertEquals(ModoVoce.QUANTITA, Servizi.modoDaUnita("Km"))
        assertEquals(listOf("trasferta", "cantiere"), Servizi.tagDa(" trasferta ,cantiere,, Trasferta"))
        assertEquals("22%", Servizi.aliquota(22.0))
        assertEquals("2 Giorni × 30,00 € = 60,00 €", Indennita(quantita = 2.0, unita = "Giorni", prezzo = 30.0).dettaglio(true))
        assertEquals("2 Giorni", ind(2.0, 46.48).dettaglio(false))
    }
}
