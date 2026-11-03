package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.LocalDateTime

/**
 * La fase 6 contro il server di prova vero (architettura.md §17). Si lanciano in un modo solo, con un server
 * nuovo fermo al 22/10/2026 (ServerDiProva.kt):
 *
 *     node server/prove/telefono.js            (--giri 2: due giri di fila sullo stesso server)
 *
 * Senza WISPER_SERVER_PROVA si saltano. I giri senza rete passano dalla coda del telefono
 * (InvioFase6, come quando torna la rete), ripetendo apposta gli invii: il server deve
 * riconoscerli (idLocale, idFile). Le prove cambiano i dati, ma ognuna parte da quello che trova
 * (un giorno di ferie ancora libero, i km dell'ultima lettura) e usa il giorno del server.
 */
class ServerDiProvaFase6Test {
    @get:Rule val cartella = TemporaryFolder()
    private val indirizzo = ServerDiProva.indirizzo

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-6", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }
    private val unico = System.nanoTime().toString().takeLast(6)

    @Test
    fun `Marco chiede le ferie senza rete, Manuel le approva e poi annulla, e la richiesta torna da approvare`() = runBlocking {
        val marco = entra("marco@esempio.it")
        val manuel = entra("manuel@esempio.it")
        val f6 = Fase6(marco)
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        val invio = InvioFase6(f6)
        // Un giorno lavorativo fra cinque settimane (lontano dalle ferie di esempio della settimana dopo la prossima),
        // senza chiusure e senza un'assenza di Marco (quelle dei giri prima restano: si va al primo giorno libero).
        val prima = ElencoAssenze.daJson(f6.assenzeJson(listOf("stato" to "tutte")))
        val giaChieste = prima.assenze.filter { it.idPersona == "3" && it.stato in listOf("bozza", "da_approvare", "approvata") }
        var giorno = ServerDiProva.oggi.plusWeeks(5)
        while (giorno.dayOfWeek.value > 5 || ContiPersone.festivi(giorno.year).contains(giorno) || prima.chiusure.any { it.copre(giorno) } ||
            giaChieste.any { a -> dataDi(a.dal)?.let { giorno >= it } == true && dataDi(a.al)?.let { giorno <= it } == true }
        ) giorno = giorno.plusDays(1)
        val idLocale = "A-prova$unico"
        val op = coda.assenza(idLocale, JSONObject().put("tipo", "ferie").put("dal", giorno.toString()).put("al", giorno.toString()).put("nota", "Prova $unico"))
        invio.esegui(op); invio.esegui(op)
        val mie = ElencoAssenze.daJson(f6.assenzeJson()).assenze.filter { it.idLocale == idLocale }
        assertEquals("rimandata due volte = una sola", 1, mie.size)
        val a = mie.single()
        assertEquals("da_approvare", a.stato)
        assertEquals(8.0, a.ore, 0.0)

        // Manuel la vede fra le cose da approvare (tipo assenza) e la approva; poi Annulla.
        val voce = manuel.daApprovare().voci.firstOrNull { it.tipo == "assenza" && it.id == a.id }
        assertNotNull("la richiesta è fra quelle da approvare", voce)
        manuel.approva(listOf(voce!!))
        assertEquals("approvata", stato(f6, idLocale))
        manuel.annullaApprovazione(listOf(voce))
        assertEquals("con Annulla torna da approvare", "da_approvare", stato(f6, idLocale))
        manuel.approva(listOf(voce))
        assertEquals("approvata", stato(f6, idLocale))
        // Marco non approva (nemmeno le sue): il server dice di no.
        try {
            marco.approva(listOf(voce)); fail("il collaboratore non approva")
        } catch (e: PonteServer.Rifiutato) { /* ok */ }
    }

    private suspend fun stato(f6: Fase6, idLocale: String) = ElencoAssenze.daJson(f6.assenzeJson(listOf("stato" to "tutte"))).assenze.first { it.idLocale == idLocale }.stato

    @Test
    fun `Manuel apre la scheda riservata di Marco e resta scritto, Laura non vede i riservati, Marco non vede i colleghi`() = runBlocking {
        val manuel = Fase6(entra("manuel@esempio.it"))
        val laura = Fase6(entra("laura@esempio.it"))
        val marcoP = entra("marco@esempio.it")
        val marco = Fase6(marcoP)

        val perManuel = manuel.persona("3")
        assertNotNull("il titolare vede i riservati", perManuel.ccnl)
        assertNotNull(perManuel.costoAnno)
        assertTrue(perManuel.visite!!.any { it.giudizioVisto != null })
        assertTrue(perManuel.documenti.any { it.vede == "riservati" })
        // Resta scritto nel registro di chi apre i dati riservati (lo legge anche Marco, per i suoi).
        val registro = manuel.accessiRiservati("3")
        assertTrue("una riga 'visto' di Manuel", registro.any { it.utente == "Manuel Gasparotto" })
        assertTrue(marco.accessiRiservati("3").any { it.utente == "Manuel Gasparotto" })

        val perLaura = laura.persona("3")
        assertNull("Laura non vede il CCNL", perLaura.ccnl)
        assertNull(perLaura.livello)
        assertNull("né il costo dell'anno", perLaura.costoAnno)
        assertTrue("ma il costo orario sì (costi)", perLaura.costoVisto)
        assertTrue(perLaura.visite.orEmpty().all { it.giudizio == null && it.prescrizioni == null })
        assertTrue("il cedolino non c'è", perLaura.documenti.none { it.vede == "riservati" })
        assertTrue("i dati personali sì (persone 2)", perLaura.conPersonali)
        // Nemmeno col link diretto: 403.
        val cedolino = marco.persona(null).documenti.first { it.vede == "riservati" }
        val idFile = FileRemoto.idDaUrl(cedolino.url)
        try {
            entra("laura@esempio.it").file(idFile); fail("Laura non scarica il cedolino di Marco")
        } catch (e: PonteServer.PermessoNegato) { /* ok */ }
        // Marco vede il suo (anche riservato), non il suo costo.
        val io = marco.persona(null)
        assertNotNull(io.ccnl)
        assertFalse(io.costoVisto)
        assertNull(io.costoAnno)
        assertTrue(marcoP.file(idFile).first.isNotEmpty())
        // Marco che apre Laura: solo il lavoro, "Assente" senza tipo.
        val collega = marco.persona("2")
        assertNull(collega.codiceFiscale)
        assertNull(collega.saldi)
        assertFalse(collega.conPersonali)
        collega.assenteOggi?.let { assertEquals("Assente", it.tipoVisto) }
        // Sul disco del telefono di Manuel le assenze dei colleghi restano "Assente" (PrivacyDisco).
        val disco = PrivacyDisco.assenze(manuel.assenzeJson(), "1")
        assertTrue(ElencoAssenze.daJson(disco).assenze.filter { it.idPersona != "1" }.all { it.tipoVisto == "Assente" && it.tipo == null && it.nota == null })
    }

    @Test
    fun `lo strumento scaduto nel rapportino con la conferma, il non conforme non si sceglie e il server non rifiuta mai`() = runBlocking {
        val manuelP = entra("manuel@esempio.it")
        val marcoP = entra("marco@esempio.it")
        val marco = Fase6(marcoP)
        val ana = marcoP.anagrafiche()
        val oggi = ServerDiProva.oggi
        val multimetro = ana.mieiStrumenti.first { it.nome.startsWith("Multimetro") }
        val stato = multimetro.statoOggi(oggi)
        assertEquals("scaduta", stato!!.stato)
        assertEquals(StrumentoUsato.Scelta.CONFERMA, StrumentoUsato.sceltaDi(stato, "avviso"))
        // "Lo uso lo stesso": la conferma va col rapportino e resta scritta.
        val cliente = ana.clienti.first()
        val r = marcoP.salva(Rapportino.nuovo("Marco Rossato", oggi).copy(idCliente = cliente.id, cliente = cliente.nome, descrizione = "Misure $unico", oreLavoro = 2.0, km = 10.0,
            strumenti = listOf(StrumentoUsato(multimetro.id, multimetro.codice, multimetro.nome, multimetro.matricola, stato.scade, "scaduta", confermato = true))))
        val s = r.strumenti!!.single()
        assertEquals("scaduta", s.statoAllora)
        assertTrue(s.confermato)

        // Manuel registra una taratura non conforme sulla pinza: per il telefono non si sceglie più.
        val pinza = Fase6(manuelP).attrezzatureJson().optJSONArray("attrezzature").oggetti().map(Attrezzatura::daJson).first { it.nome.startsWith("Pinza") }
        Fase6(manuelP).registraTaratura(JSONObject().put("idAttrezzatura", PonteServer.idJson(pinza.id)).put("data", oggi.toString()).put("esito", "non_conforme"))
        val pinzaDopo = marco.attrezzatureJson().optJSONArray("attrezzature").oggetti().map(Attrezzatura::daJson).first { it.id == pinza.id }
        assertEquals("non_conforme", pinzaDopo.taratura!!.stato)
        assertEquals(StrumentoUsato.Scelta.NO_NON_CONFORME, StrumentoUsato.sceltaDi(pinzaDopo.taratura, "avviso"))
        // Se arrivasse lo stesso (dalla coda di un telefono che non lo sapeva) il server lo salva col suo stato vero.
        val r2 = marcoP.salva(Rapportino.nuovo("Marco Rossato", oggi).copy(idCliente = cliente.id, cliente = cliente.nome, descrizione = "Prova coda $unico", oreLavoro = 1.0,
            strumenti = listOf(StrumentoUsato(pinza.id))))
        assertEquals("non_conforme", r2.strumenti!!.single().statoAllora)
    }

    @Test
    fun `km e guasto senza rete, rimandati due volte, arrivano una volta sola`() = runBlocking {
        val marcoP = entra("marco@esempio.it")
        val f6 = Fase6(marcoP)
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        val invio = InvioFase6(f6)
        val doblo = marcoP.anagrafiche().mezzi.first { it.mio }
        val prima = Mezzo.daJson(f6.mezzoJson(doblo.id).getJSONObject("mezzo"))
        val oggi = ServerDiProva.oggi
        val km = (prima.km ?: 0L) + 150
        when (val e = ControlloKm.controlla(km, oggi, prima.km, dataDi(prima.kmIl))) {
            is ControlloKm.Esito.No -> fail(e.messaggio)
            else -> {}
        }
        val k = coda.km("K-prova$unico", JSONObject().put("idVeicolo", PonteServer.idJson(doblo.id)).put("km", km).put("data", oggi.toString()))
        invio.esegui(k); invio.esegui(k)
        val fotoKm = cartella.newFile("km.jpg").apply { writeBytes(JPG) }
        val fk = coda.fotoKm("K-prova$unico", "F-km$unico", fotoKm.path)
        invio.esegui(fk); invio.esegui(fk)
        val g = coda.guasto("G-prova$unico", JSONObject().put("idVeicolo", PonteServer.idJson(doblo.id)).put("titolo", "Rumore dai freni $unico").put("fermo", false).put("km", km))
        invio.esegui(g); invio.esegui(g)
        val foto = cartella.newFile("guasto.jpg").apply { writeBytes(JPG) }
        val fg = coda.fotoGuasto("G-prova$unico", "F-g$unico", foto.path)
        invio.esegui(fg); invio.esegui(fg)

        val dopo = Mezzo.daJson(f6.mezzoJson(doblo.id).getJSONObject("mezzo"))
        assertEquals(km, dopo.km)
        assertEquals("una lettura sola", 1, dopo.letture.count { it.idLocale == "K-prova$unico" })
        assertTrue("con la foto del contachilometri", dopo.letture.first { it.idLocale == "K-prova$unico" }.conFoto)
        val guasti = dopo.manutenzioni.filter { it.idLocale == "G-prova$unico" }
        assertEquals("un guasto solo", 1, guasti.size)
        assertEquals("una foto sola", 1, guasti.single().foto.size)
        assertEquals("Segnalato", guasti.single().statoVisto)
        // Km più bassi dell'ultima lettura: il telefono li ferma prima, come il server.
        assertTrue(ControlloKm.controlla(km - 1000, oggi, dopo.km, dataDi(dopo.kmIl)) is ControlloKm.Esito.No)
    }

    @Test
    fun `Luca esterno vede solo le sue cose`() = runBlocking {
        val lucaP = entra("luca@esempio.it")
        val luca = Fase6(lucaP)
        val io = lucaP.io()
        assertEquals(Ruoli.ESTERNO, io.utente.ruolo)
        assertEquals("F006", io.interfaccia.esternoId)
        assertTrue(io.permessi.vede(Moduli.COLLABORATORI))
        assertFalse(io.permessi.vede(Moduli.PERSONE))
        // Solo la sua scheda, i suoi incarichi; coi suoi compensi (soldi suoi), senza le valutazioni dello studio.
        assertEquals(listOf("F006"), luca.collaboratori().map { it.idSoggetto })
        val sua = Collaboratore.daJson(luca.collaboratoreJson(null).getJSONObject("collaboratore"))
        assertEquals("F006", sua.idSoggetto)
        assertNotNull("i suoi compensi", sua.compensi)
        assertNull("le valutazioni sono dello studio", sua.valutazioni)
        val incarichi = luca.incarichiJson().optJSONArray("incarichi").oggetti().map(Incarico::daJson)
        assertTrue(incarichi.isNotEmpty() && incarichi.all { it.idSoggetto == "F006" })
        // Le commesse solo dei suoi incarichi; niente fornitori, niente mezzi.
        val ana = lucaP.anagrafiche()
        assertTrue(ana.commesse.all { k -> incarichi.any { it.idCommessa == k.id } })
        assertTrue(ana.fornitori.isEmpty())
        assertTrue(ana.mezzi.isEmpty())
        // Le persone, i mezzi e gli altri collaboratori non li trova (permesso:false prima di cercare).
        for (azione in listOf<suspend () -> Unit>({ luca.persone() }, { luca.mezziJson() }, { luca.assenzeJson() }, { luca.persona(null) })) {
            try { azione(); fail("l'esterno non vede persone e mezzi") } catch (e: PonteServer.Rifiutato) { /* ok */ }
        }
        try { luca.collaboratoreJson("F001"); fail("l'esterno non vede gli altri collaboratori") } catch (e: PonteServer.Rifiutato) { /* ok */ }
        // La sua Dashboard: i suoi incarichi.
        val d = Dashboard.daJson(lucaP.dashboard())
        assertTrue(d.incarichiEsterno.isNotEmpty())
        assertTrue(d.incarichiEsterno.all { i -> incarichi.any { it.id == i.id } })
    }

    private companion object {
        /** Un JPEG minuscolo (un punto): basta per le foto. */
        val JPG: ByteArray = java.util.Base64.getDecoder().decode(
            "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
        )
    }
}
