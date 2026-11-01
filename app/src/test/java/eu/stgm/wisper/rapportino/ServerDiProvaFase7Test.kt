package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * La fase 7 del telefono contro il server di prova vero (fase7.md §10): Da mandare, il
 * WhatsApp preparato e segnato mandato (anche passando dalla coda), lo storico, i modelli,
 * le notifiche, il portale visto dallo studio (stato, cliente, togli e rimetti, rispondi nel
 * portale, il file del cliente, l'invito), i permessi di Marco e della lettura.
 * Si lanciano con `node server/prove/telefono.js` (ServerDiProva.kt): ognuna crea quello che le
 * serve o rimette com'era, e passa anche due volte di fila.
 */
class ServerDiProvaFase7Test {
    private val indirizzo = ServerDiProva.indirizzo

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-7", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }
    private val unico = System.nanoTime().toString().takeLast(7)

    /** Sig. Ferretti di Rossi Impianti Srl (C002), col sì a WhatsApp (i dati di esempio della fase 7). */
    private suspend fun ferretti(p: PonteServer): Referente = p.anagrafiche().referentiDi("C002").first { it.nome == "Sig. Ferretti" }

    private suspend fun rifiutato(cosa: String, lavoro: suspend () -> Unit): String {
        try {
            lavoro()
        } catch (e: PonteServer.Rifiutato) {
            return e.message.orEmpty()
        }
        fail("$cosa: doveva dire di no")
        return ""
    }

    @Test
    fun `modelli, Da mandare e notifiche rispondono come fase7 md 10`() = runBlocking {
        val f = Fase7(entra("manuel@esempio.it"))
        val m = ModelliMessaggi.daJson(f.modelliJson())
        val chiavi = m.modelli.map { it.chiave }
        assertTrue("gli 8 modelli di sistema", chiavi.containsAll(listOf("promemoria_appuntamento", "intervento_fissato", "preventivo_mandato", "rapportino_da_firmare",
            "promemoria_pagamento", "secondo_promemoria_pagamento", "invito_portale", "libero")))
        assertTrue("i segnaposti di sempre", Segnaposti.per("libero", m.segnaposti).contains("{nome}"))
        assertTrue("i modelli si salvano col telefono: nessun segnaposto sconosciuto", m.modelli.all { Segnaposti.sconosciuto(it.testo + " " + it.oggetto, it.uso, m.segnaposti) == null })

        val d = DaMandare.daJson(f.daMandareJson())
        (d.tutte).forEach { p ->
            assertTrue("ogni proposta ha la sua chiave: ${p.proposta}", p.proposta.isNotBlank())
            assertTrue("e il testo già composto", p.testo.isNotBlank())
        }
        d.preparati.forEach { assertEquals("whatsapp", it.canale) }

        val n = Notifiche7.daJson(f.notificheJson())
        assertTrue(n.nuove >= 0)
        n.notifiche.forEach { assertTrue(it.titolo.isNotBlank()) }
    }

    @Test
    fun `un WhatsApp preparato a Sig Ferretti, ripetuto uguale, poi segnato mandato, nello storico`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f = Fase7(p)
        val r = ferretti(p)
        assertTrue("ha detto sì a WhatsApp", r.whatsappOk)
        val pronto = f.preparaMessaggio("libero", "whatsapp", mapOf("idReferente" to r.id))
        assertTrue(pronto.testo.startsWith("Buongiorno"))
        assertEquals("393330001122", pronto.a.numero)
        assertTrue(pronto.link.startsWith("https://wa.me/393330001122?text="))

        val idLocale = "M-prova$unico"
        val m = JSONObject().put("idLocale", idLocale).put("canale", "whatsapp").put("tipo", "libero").put("modello", "libero")
            .put("idReferente", PonteServer.idJson(r.id)).put("idCliente", "C002").put("testo", pronto.testo + "prova $unico").put("stato", "preparato").put("a", pronto.a.numeroVisto)
        val prima = Comunicazione.daJson(f.salvaMessaggio(m).getJSONObject("comunicazione"))
        assertEquals("preparato", prima.stato)
        val ancora = Comunicazione.daJson(f.salvaMessaggio(m).getJSONObject("comunicazione"))
        assertEquals("ripetuto con lo stesso idLocale: la stessa riga", prima.id, ancora.id)

        val mandata = Comunicazione.daJson(f.segnaMandato(prima.id, true).let { it.optJSONObject("comunicazione") ?: it })
        assertEquals("mandato", mandata.stato)
        val storico = Storico7.daJson(f.comunicazioniJson(listOf("canale" to "whatsapp", "idCliente" to "C002")))
        val riga = storico.comunicazioni.firstOrNull { it.id == prima.id }
        assertNotNull("è nello storico del cliente", riga)
        assertEquals("Mandato", riga!!.parolaStato)
    }

    @Test
    fun `dalla coda come senza rete, il preparato parte e poi il segnato mandato trova l id`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val r = ferretti(p)
        val coda = mutableListOf<CodaInvii.Operazione>()
        val perServizio = object : CodaFase7 {
            override fun azione(chiave: String, corpo: JSONObject) {
                coda.removeAll { it.idLocale == chiave }
                coda += CodaInvii.Operazione("op$unico${coda.size}", CodaInvii.Tipo.AZIONE7, chiave, corpo = corpo.toString())
            }
            override fun presente(chiave: String) = coda.any { it.idLocale == chiave }
            override fun togli(chiave: String) = coda.removeAll { it.idLocale == chiave }
        }
        val s = ServizioFase7(p, Scaffale(null, "f7-"), object : EsecutoreFase4 {
            override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = runCatching { lavoro() }
        }, perServizio)
        val invio = InvioFase7(p, Scaffale(null, "f7id-"))
        val id = s.preparaWhatsapp(JSONObject().put("canale", "whatsapp").put("tipo", "libero").put("modello", "libero").put("idReferente", PonteServer.idJson(r.id))
            .put("testo", "Buongiorno Sig. Ferretti, prova dalla coda $unico").put("stato", "preparato").put("_referente", r.nome))
        invio.esegui(coda.removeAt(0))
        s.segnaMandato(Comunicazione(idLocale = id, stato = "preparato"))
        val op = coda.single()
        assertEquals("segnaMandato", op.corpoJson().getString("azione"))
        invio.esegui(op)
        val storico = Storico7.daJson(Fase7(p).comunicazioniJson(listOf("canale" to "whatsapp", "testo" to "prova dalla coda $unico")))
        assertEquals("mandato", storico.comunicazioni.first { it.testo.contains(unico) }.stato)
    }

    @Test
    fun `una telefonata annotata è nello storico del cliente`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f = Fase7(p)
        val r = ferretti(p)
        val c = Comunicazione.daJson(f.salvaMessaggio(JSONObject().put("idLocale", "M-tel$unico").put("canale", "telefonata").put("direzione", "entrata").put("tipo", "libero")
            .put("idReferente", PonteServer.idJson(r.id)).put("testo", "Ha chiamato per il collaudo $unico").put("stato", "mandato")).getJSONObject("comunicazione"))
        assertEquals("telefonata", c.canale)
        val s = Storico7.daJson(f.comunicazioniJson(listOf("idCliente" to "C002", "canale" to "telefonata")))
        assertTrue(s.comunicazioni.any { it.id == c.id })
    }

    @Test
    fun `il portale dello studio, il cliente nel portale, togli e rimetti una cosa pubblicata`() = runBlocking {
        val ponte = entra("manuel@esempio.it")
        val f = Fase7(ponte)
        val p = Portale7.daJson(f.portaleJson())
        // Con WISPER_PORTALE_INDIRIZZO il portale è "su internet"; senza, è Non collegato (come sul NAS appena acceso).
        if (p.stato.nonCollegato) assertEquals("Non collegato", p.stato.parola) else assertTrue(p.stato.host.isNotBlank())
        assertTrue("da guardare: il messaggio, il file o la domanda dei dati di esempio", p.daGuardare.isNotEmpty() || p.conteggi["daGuardare"] == 0)

        val c = ClientePortale.daJson(f.portaleClienteJson("C002"))
        assertTrue(c.portale)
        val fer = c.referenti.first { it.nome == "Sig. Ferretti" }
        assertTrue(fer.portale)
        assertEquals("Attivo", fer.statoVisto)

        val pubblicati = (f.pubblicatiJson("C002").let { it.optJSONArray("pubblicati") ?: it.optJSONArray("righe") }).oggetti().map(Pubblicazione::daJson)
        val doc = pubblicati.firstOrNull { it.tipo == "documento" } ?: pubblicati.first()
        f.togliDalPortale(doc.id)
        val dopo = f.pubblicatiJson("C002").optJSONArray("pubblicati").oggetti().map(Pubblicazione::daJson)
        assertTrue("tolta subito", dopo.none { it.id == doc.id })
        f.togliDalPortale(doc.id, annulla = true)
        val rimessa = f.pubblicatiJson("C002").optJSONArray("pubblicati").oggetti().map(Pubblicazione::daJson)
        assertTrue("l'Annulla la rimette", rimessa.any { it.id == doc.id || (it.tipo == doc.tipo && it.rif == doc.rif) })
        assertTrue("ogni riga di pubblicati porta rif (§10.1)", rimessa.all { it.rif.isNotBlank() })

        // §15: il documento stesso dice l'id della pubblicazione aperta (portale.pubblicazione), quello che usa Togli dal portale.
        if (doc.tipo == "documento") {
            val d = Fase5(ponte).documento(doc.rif)
            val aperta = rimessa.first { it.tipo == "documento" && it.rif == doc.rif }
            assertEquals(aperta.id, d.portale?.id)
        }

        // Pubblica ripetuta su una cosa già nel portale: ok o "È già nel portale" (la coda la tratta come fatta);
        // col portale Non collegato: "Il portale non è collegato".
        val pre = rimessa.firstOrNull { it.tipo == "preventivo" && it.rif.isNotBlank() }
        if (pre != null) {
            try {
                f.pubblica(JSONObject().put("tipo", "preventivo").put("id", PonteServer.idJson(pre.rif)))
                assertFalse("senza indirizzo non si pubblica", p.stato.nonCollegato)
            } catch (e: PonteServer.Rifiutato) {
                assertTrue(e.message!!, e.message!!.contains("già") || (p.stato.nonCollegato && e.message!!.contains("non è collegato")))
            }
        }
    }

    @Test
    fun `rispondere nel portale a una richiesta, e la risposta torna nei messaggi del ticket`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f = Fase7(p)
        val richieste = f.pubblicatiJson("C002", "ticket").optJSONArray("pubblicati").oggetti().map(Pubblicazione::daJson)
        val tk = richieste.firstOrNull { it.titolo.contains("0014") } ?: richieste.firstOrNull()
        assumeTrue("Nessuna richiesta nel portale di Rossi", tk != null && tk.rif.isNotBlank())
        val testo = "Veniamo giovedì alle 9 con il misuratore ($unico)"
        p.scriviAzione(JSONObject().put("azione", "rispondiNelPortale").put("idTicket", PonteServer.idJson(tk!!.rif)).put("testo", testo).put("idLocale", "P-prova$unico"))
        val t = Fase5(p).ticket(tk.rif)
        val m = t.portale?.messaggi.orEmpty()
        assertTrue("la risposta è fra i messaggi col cliente", m.any { it.testo == testo && !it.dalCliente })
        assertTrue(t.portale!!.visibile)
    }

    @Test
    fun `il file dal cliente, accettato e archiviato in una categoria`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f = Fase7(p)
        val cars = f.caricamentiJson("da_guardare").optJSONArray("caricamenti").oggetti().map(Caricamento::daJson)
        assumeTrue("Nessun file da guardare (già accettato in un giro di prima)", cars.isNotEmpty())
        val car = cars.first()
        assertTrue("c'è il file da scaricare", car.idFile.isNotBlank())
        val cat = Fase5(p).categorie().first()
        p.scriviAzione(JSONObject().put("azione", "accettaCaricamento").put("id", PonteServer.idJson(car.id)).put("idCategoria", PonteServer.idJson(cat.id))
            .put("titolo", car.titolo.ifBlank { car.nome }).put("idLocale", "C-prova$unico"))
        val dopo = f.caricamentiJson().optJSONArray("caricamenti").oggetti().map(Caricamento::daJson).first { it.id == car.id }
        assertEquals("accettato", dopo.stato)
        assertTrue("non è più da guardare", Portale7.daJson(f.portaleJson()).daGuardare.none { it.tipo == "caricamento" && it.collegamento?.id == car.id })
    }

    @Test
    fun `l invito rimandato ad Anna Rossi parte, e il suo accesso si salva`() = runBlocking {
        val p = entra("manuel@esempio.it")
        val f = Fase7(p)
        val anna = p.anagrafiche().referentiDi("C002").first { it.nome == "Anna Rossi" }
        if (Portale7.daJson(f.portaleJson()).stato.nonCollegato) {
            val e = rifiutato("l'invito senza l'indirizzo del portale") { f.invitaReferente(anna.id, null, null, null) }
            assertTrue(e, e.contains("non è collegato"))
            return@runBlocking
        }
        val (ref, email) = f.invitaReferente(anna.id, null, null, null)
        assertTrue("mandata o domani (quota)", email == "mandata" || email == "domani")
        assertTrue(ref == null || ref.portale)
        val salvato = f.salvaAccessoReferente(anna.id, mapOf("preventivi" to 1, "rapportini" to 1, "fatture" to 1, "documenti" to 1, "richieste" to 0), null, true, true)
        if (salvato != null) assertEquals(1, salvato.livello("fatture"))
        val errore = rifiutato("permesso fuori misura") { f.salvaAccessoReferente(anna.id, mapOf("fatture" to 2), null, true, null) }
        assertTrue(errore.isNotBlank())
    }

    @Test
    fun `Marco vede le sue comunicazioni e non il portale, la lettura vede e non scrive`() = runBlocking {
        val marco = Fase7(entra("marco@esempio.it"))
        DaMandare.daJson(marco.daMandareJson()).tutte.forEach { assertFalse("mai i pagamenti al collaboratore", it.pagamento) }
        rifiutato("Marco nel portale") { marco.portaleJson() }

        val lettura = Fase7(entra("lettura@esempio.it"))
        Portale7.daJson(lettura.portaleJson())
        ModelliMessaggi.daJson(lettura.modelliJson())
        rifiutato("la lettura che scrive") {
            lettura.salvaMessaggio(JSONObject().put("idLocale", "M-lett$unico").put("canale", "nota").put("testo", "prova").put("stato", "mandato"))
        }
        rifiutato("la lettura che toglie dal portale") { lettura.togliDalPortale("1") }
        Unit
    }

    @Test
    fun `le notifiche si segnano lette e mostrate`() = runBlocking {
        val f = Fase7(entra("manuel@esempio.it"))
        val n = Notifiche7.daJson(f.notificheJson(soloNuove = true))
        val una = n.notifiche.firstOrNull()
        assumeTrue("Nessuna notifica nuova per Manuel", una != null)
        f.segnaMostrate(listOf(una!!.id))
        assertTrue(Notifiche7.daJson(f.notificheJson(soloNuove = true)).notifiche.first { it.id == una.id }.mostrata)
        val nuove = f.segnaLette(listOf(una.id))
        assertTrue(nuove < n.nuove || n.nuove == 0)
    }
}
