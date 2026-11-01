package eu.stgm.wisper.rapportino

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** I campi della fase 7 nelle pagine che c'erano già (fase7.md §10.4, §12.6): letti dal server e mandati com'è scritto. */
class Fase7PagineTest {

    @Test
    fun `il ticket dal portale con la conversazione pubblica e le foto del cliente`() {
        val t = Ticket.daJson(JSONObject("""{"id": 16, "numero": "TK/2026/0016", "titolo": "Scatta il differenziale del quadro QG2", "origine": "portale", "cronologia": [],
            "portale": {"visibile": true, "messaggiNuovi": 1},
            "messaggi": [{"quando": "2026-10-21T16:42:00", "da": "Studio Tecnico GM", "chi": "Manuel Gasparotto", "testo": "Veniamo giovedì alle 9 con il misuratore.", "file": []},
                         {"quando": "2026-10-22T08:15:00", "da": "Sig. Ferretti", "testo": "Va bene, vi aspetta il custode al cancello nord.", "file": [{"nome": "cancello.jpg", "byte": 200}]}],
            "foto": [{"id": "FQ2", "url": "/file/FQ2", "nome": "Foto quadro QG2.jpg", "tipo": "portale"}, {"id": "FT1", "url": "/file/FT1"}]}"""))
        assertTrue(t.dalPortale)
        val p = t.portale!!
        assertTrue(p.visibile)
        assertEquals(1, p.messaggiNuovi)
        assertFalse("lo studio a sinistra", p.messaggi[0].dalCliente)
        assertTrue("il cliente a destra", p.messaggi[1].dalCliente)
        assertEquals(listOf("cancello.jpg"), p.messaggi[1].file)
        assertEquals(listOf(true, false), t.foto.map { it.dalCliente })
        assertNull("un ticket senza portale non ne ha il pezzo", Ticket.daJson(JSONObject("""{"id": 3, "origine": "telefono"}""")).portale)
    }

    @Test
    fun `il rapportino firmato nel portale resta anche nella copia sul telefono, e non va al server`() {
        val r = Rapportino.daJson(JSONObject("""{"idLocale": "W-1", "id": "RAP/2026/0153", "data": "2026-10-21", "stato": "FIRMATO", "firmatario": "Roberto Ferretti",
            "firmatoIl": "2026-10-22T10:15:00", "firmaModo": "portale", "firmaReferente": "Sig. Ferretti", "portale": {"pubblicato": true, "daFirmare": false, "vistoIl": "2026-10-22T10:10:00"}}"""), dalFoglio = true)
        assertEquals("portale", r.firmaModo)
        assertEquals("Sig. Ferretti", r.firmaReferente)
        assertTrue(r.portalePubblicato)
        assertEquals("2026-10-22T10:10:00", r.portaleVistoIl)
        val copia = Rapportino.daJson(r.aJson())
        assertEquals("portale", copia.firmaModo)
        assertTrue(copia.portalePubblicato)
        assertFalse("salvaRapportino non manda i campi del portale", r.perIlFoglio().has("firmaModo") || r.perIlFoglio().has("portale"))
    }

    @Test
    fun `l'attività manda Avvisa il cliente solo se è stato toccato`() {
        val a = Attivita(titolo = "Intervento TK/2026/0014", tipo = TipoAttivita.APPUNTAMENTO, idCliente = "C002")
        assertFalse("non toccato: vale la regola di base del server", a.perSalvare(false).has("avvisaCliente"))
        val w = a.copy(avvisaCliente = "whatsapp", idReferenteAvviso = "3").perSalvare(false)
        assertEquals("whatsapp", w.getString("avvisaCliente"))
        assertEquals(3, w.getInt("idReferenteAvviso"))
        assertEquals("", a.copy(avvisaCliente = "").perSalvare(false).getString("avvisaCliente"))
        val letta = Attivita.daJson(JSONObject("""{"id": 31, "titolo": "x", "tipo": "appuntamento", "avvisaCliente": "email", "idReferenteAvviso": 6}"""))
        assertEquals("email", letta.avvisaCliente)
        assertEquals("6", letta.idReferenteAvviso)
        assertNull(Attivita.daJson(JSONObject("""{"id": 32, "titolo": "y"}""")).avvisaCliente)
    }

    @Test
    fun `il documento e la fattura nel portale, il preventivo accettato nel portale con la prova senza IP`() {
        val d = DocArchivio.daJson(JSONObject("""{"id": 9, "titolo": "Schema unifilare cabina MT", "portale": {"pubblicato": true, "vistoIl": ""}}"""))
        assertTrue(d.portale!!.pubblicato)
        assertNull(DocArchivio.daJson(JSONObject("""{"id": 10, "titolo": "x"}""")).portale)

        val acc = Accettazione7.daJson(JSONObject("""{"modo": "portale", "da": "Roberto Ferretti", "il": "2026-10-22T10:07:00", "referente": {"nome": "Sig. Ferretti"},
            "prova": {"via": "google", "agente": "Chrome · Android", "impronta": "3f9a…c21e"}}"""))!!
        assertTrue(acc.nelPortale)
        assertEquals("Sig. Ferretti", acc.referente)
        assertEquals("google", acc.prova!!.getString("via"))
        assertFalse("l'IP non c'è", acc.prova!!.has("ip"))

        val info = InfoPortale.daJson(JSONObject("""{"pubblicato": true, "vistoIl": "2026-10-23T10:12:00", "vistoDa": "Sig. Ferretti", "idPubblicazione": 12}"""))!!
        assertEquals("12", info.id)
        assertEquals("Sig. Ferretti", info.vistoDa)

        // §15: il nome deciso è portale.pubblicazione (numero, null se non è nel portale).
        assertEquals("14", InfoPortale.daJson(JSONObject("""{"pubblicato": true, "pubblicazione": 14}"""))!!.id)
        assertEquals("", InfoPortale.daJson(JSONObject("""{"pubblicato": false, "pubblicazione": null}"""))!!.id)
    }

    @Test
    fun `il rapportino ricorda l'id della pubblicazione anche nella copia su disco`() {
        val r = Rapportino.daJson(JSONObject("""{"id": "RAP/2026/0004", "idLocale": "r4", "cliente": "Rossi Impianti Srl", "data": "2026-10-20",
            "portale": {"pubblicato": true, "daFirmare": true, "vistoIl": "", "pubblicazione": 9}}"""))
        assertEquals("9", r.portaleId)
        assertTrue(r.portaleDaFirmare)
        assertEquals("9", Rapportino.daJson(r.aJson()).portaleId)
    }

    @Test
    fun `il referente salvato porta chi paga, il numero WhatsApp e il sì`() {
        val r = Referente("6", "C002", "Anna Rossi", pagamenti = true, whatsapp = "347 000 5566", whatsappOk = false)
        val o = r.aJson()
        assertTrue(o.getBoolean("pagamenti"))
        assertEquals("347 000 5566", o.getString("whatsapp"))
        assertFalse(o.getBoolean("whatsappOk"))
    }
}
