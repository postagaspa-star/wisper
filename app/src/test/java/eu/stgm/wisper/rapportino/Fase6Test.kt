package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDate

/**
 * La fase 6 sul telefono senza server: cosa si mostra per ruolo (i campi che il server
 * non manda non ci sono), cosa resta sul disco (mai i dati personali dei colleghi, e
 * niente dopo l'uscita dall'account), la coda senza rete (idLocale, niente doppioni, le
 * frasi che non dicono il tipo di un'assenza), lo strumento nel rapportino.
 */
class Fase6Test {
    @get:Rule val cartella = TemporaryFolder()

    // ---------------------------------------------------------------------------- cosa si mostra per ruolo

    /** Marco su di sé (vera, §17.3, accorciata): lavoro, personali e riservati; niente costo. */
    private val marcoSuDiSe = """{"id":3,"nome":"Marco Rossato","rapporto":"dipendente","ruoloStudio":"Tecnico elettrico","oreSettimana":40,"giorniSettimana":[1,2,3,4,5],"oreGiorno":8,
        "idUtente":3,"accessoAttivo":true,"codiceFiscale":"RSSMRC90A01L157X","indirizzo":"Via dell'Esempio 22","telefonoPersonale":"333 0000301","iban":"IT60X0542811101000000123456",
        "emergenzaNome":"Giulia Rossato","emergenzaTelefono":"333 0000302","contrattoTipo":"indeterminato","ccnl":"Studi professionali","livello":"3","noteRiservate":"",
        "visite":[{"id":1,"data":"2025-11-04","giudizio":"idoneo_prescrizioni","giudizioVisto":"Idoneo con prescrizioni","prescrizioni":"Niente carichi oltre 15 kg","prossima":"2026-11-04"}],
        "saldi":{"ferie":{"tenuto":true,"scritto":104,"oggi":104,"prenotate":40,"restano":64,"giorniOggi":13,"giorniRestano":8},"permessi":{"tenuto":true,"oggi":24,"restano":24}},
        "assenze":[],"documenti":[{"id":14,"titolo":"Cedolino del mese scorso","categoria":"Cedolini","vede":"riservati","url":"/file/ZSG"}],"puoCambiareContatti":true}"""

    /** Laura (amministrazione) su Marco: personali e costo orario; niente riservati (§17.3). */
    private val lauraSuMarco = """{"id":3,"nome":"Marco Rossato","codiceFiscale":"RSSMRC90A01L157X","telefonoPersonale":"333 0000301","iban":"IT60X","emergenzaNome":"Giulia Rossato",
        "costoOrario":28.5,"costoDal":"2026-01-01","costi":[{"id":2,"dal":"2026-01-01","costoOrario":28.5}],
        "visite":[{"id":1,"data":"2025-11-04","prossima":"2026-11-04","riga":"Visita del 04/11/2025 · prossima il 04/11/2026"}],"documenti":[]}"""

    /** Marco che apre Laura (vera): solo il lavoro, "Assente" senza il tipo. */
    private val marcoSuLaura = """{"id":2,"nome":"Laura Bianchi","ruoloStudio":"Amministrazione","telefonoLavoro":"0445 000302","assenteOggi":{"dal":"2026-10-22","al":"2026-10-23","tipoVisto":"Assente"},
        "mezzi":[],"attrezzature":[],"qualifiche":[],"documenti":[],"puoScrivere":false,"puoCambiareContatti":false}"""

    @Test
    fun `la scheda mostra solo i campi che il server ha mandato`() {
        val io = Persona.daJson(JSONObject(marcoSuDiSe))
        assertTrue(io.conPersonali)
        assertTrue(io.conRiservati)
        assertEquals("Studi professionali", io.ccnl)
        assertFalse("la persona non vede il suo costo", io.costoVisto)
        assertNull(io.costoOrario)
        assertNull(io.costoAnno)
        assertEquals("Idoneo con prescrizioni", io.visite!!.single().giudizioVisto)
        assertTrue(io.visite!!.single().conGiudizio)
        assertEquals(13.0, io.saldi!!.ferie!!.giorniOggi!!, 0.0)
        assertEquals("riservati", io.documenti.single().vede)

        val laura = Persona.daJson(JSONObject(lauraSuMarco))
        assertTrue(laura.conPersonali)
        assertFalse("Laura non vede i riservati", laura.conRiservati)
        assertNull(laura.ccnl)
        assertNull(laura.livello)
        assertTrue(laura.costoVisto)
        assertEquals(28.5, laura.costoOrario!!, 0.0)
        assertNull("il costo dell'anno è riservato", laura.costi!!.single().costoAnno)
        val visita = laura.visite!!.single()
        assertFalse(visita.conGiudizio)
        assertNull(visita.giudizio)
        assertNull(visita.prescrizioni)
        assertEquals("Visita del 04/11/2025 · prossima il 04/11/2026", visita.riga)

        val collega = Persona.daJson(JSONObject(marcoSuLaura))
        assertFalse(collega.conPersonali)
        assertFalse(collega.conRiservati)
        assertNull(collega.codiceFiscale)
        assertNull(collega.iban)
        assertNull("saldi: dati personali", collega.saldi)
        assertNull(collega.assenze)
        assertNull(collega.visite)
        assertNull(collega.dpi)
        assertEquals("Assente", collega.assenteOggi!!.tipoVisto)
        assertFalse(collega.costoVisto)
    }

    @Test
    fun `un'assenza di un collega arriva come Assente, senza tipo, nota e protocollo`() {
        val a = Assenza.daJson(JSONObject("""{"id":2,"idPersona":2,"persona":"Laura Bianchi","tipoVisto":"Assente","dal":"2026-10-22","al":"2026-10-23","giorni":2,"ore":12,"stato":"approvata"}"""))
        assertNull(a.tipo)
        assertNull(a.nota)
        assertNull(a.protocollo)
        assertEquals("Assente", a.tipoVisto)
        assertTrue(a.copre(LocalDate.parse("2026-10-23")))
        assertFalse(a.copre(LocalDate.parse("2026-10-24")))
    }

    @Test
    fun `i permessi iniziali del collaboratore e dell'esterno`() {
        val coll = Permessi.iniziali(Ruoli.COLLABORATORE)
        assertTrue(coll.vede(Moduli.PERSONE))
        assertFalse(coll.modifica(Moduli.PERSONE))
        assertTrue(coll.vede(Moduli.MEZZI))
        assertFalse(coll.vede(Moduli.COLLABORATORI))
        assertFalse(coll.vede(Moduli.RISERVATI))
        val est = Permessi.iniziali(Ruoli.ESTERNO)
        assertTrue(est.vede(Moduli.COLLABORATORI))
        assertTrue(est.modifica(Moduli.RAPPORTINI))
        for (m in listOf(Moduli.PERSONE, Moduli.MEZZI, Moduli.CLIENTI, Moduli.PREVENTIVI, Moduli.FATTURAZIONE, Moduli.BANCHE, Moduli.AMMINISTRAZIONE)) assertFalse(m, est.vede(m))
        assertFalse(est.costi)
        assertEquals("Esterno", Ruoli.nome(Ruoli.ESTERNO))
        // L'interfaccia dell'esterno (vera, Luca): il collaboratore di cui fa parte, niente persona.
        val i = Interfaccia.daJson(JSONObject("""{"idPersona":null,"puoApprovareAssenze":false,"vedeRiservati":false,"taraturaBlocco":"avviso","esterno":{"idSoggetto":"F006","nome":"Impianti Veneti di Sartori Luca"}}"""))
        assertEquals("F006", i.esternoId)
        assertEquals("", i.idPersona)
        val s = Sessione(Utente("5", "Luca Sartori", ruolo = Ruoli.ESTERNO), est, interfaccia = Interfaccia.daJson(i.aJson()))
        assertTrue(s.esterno)
        assertEquals("Impianti Veneti di Sartori Luca", s.interfaccia.esternoNome)
        assertFalse(s.puoApprovareAssenze)
        // Chi approva le assenze: titolare e amministrazione con le persone in scrittura (se il server non lo dice).
        assertTrue(Sessione(Utente("2", "Laura", ruolo = Ruoli.AMMINISTRAZIONE), Permessi.iniziali(Ruoli.AMMINISTRAZIONE)).puoApprovareAssenze)
        assertFalse(Sessione(Utente("3", "Marco", ruolo = Ruoli.COLLABORATORE), coll).puoApprovareAssenze)
    }

    // ---------------------------------------------------------------------------- cosa resta sul disco

    @Test
    fun `sul disco le assenze dei colleghi restano come Assente, le mie intere`() {
        val letta = JSONObject("""{"ok":true,"assenze":[
            {"id":7,"idPersona":2,"persona":"Laura Bianchi","tipo":"malattia","tipoVisto":"Malattia","tipoSanitario":true,"protocollo":"PROT-123","nota":"febbre","causale":"","dal":"2026-10-12","al":"2026-10-13","giorni":2,"ore":12,"stato":"approvata"},
            {"id":1,"idPersona":3,"persona":"Marco Rossato","tipo":"ferie","tipoVisto":"Ferie","nota":"Matrimonio di mio fratello","dal":"2026-11-02","al":"2026-11-06","giorni":5,"ore":40,"stato":"da_approvare"}]}""")
        val disco = PrivacyDisco.assenze(letta, idPersonaMia = "3")
        val testo = disco.toString()
        assertFalse("niente tipo sanitario sul disco", testo.contains("Malattia") || testo.contains("malattia"))
        assertFalse("niente protocollo", testo.contains("PROT-123"))
        assertFalse("niente nota del collega", testo.contains("febbre"))
        val l = ElencoAssenze.daJson(disco).assenze
        assertEquals("Assente", l.first { it.idPersona == "2" }.tipoVisto)
        assertNull(l.first { it.idPersona == "2" }.tipo)
        assertEquals("le mie restano intere", "Matrimonio di mio fratello", l.first { it.idPersona == "3" }.nota)
        assertEquals(2.0, l.first { it.idPersona == "2" }.giorni, 0.0)
    }

    @Test
    fun `sul disco la Dashboard non dice le malattie né i giudizi di idoneità`() {
        val d = JSONObject("""{"assentiOggi":[{"idPersona":2,"nome":"Laura Bianchi","tipoVisto":"Malattia","fino":"2026-10-23"}],
            "urgenti":[{"tipo":"visita","titolo":"Marco Rossato non è idoneo alla mansione fino al 30/11","gravita":"urgente"},{"tipo":"qualifica","titolo":"Primo soccorso di Marco Rossato scaduto da 32 giorni"}],
            "settimana":[{"tipo":"assenza","titolo":"Oggi è assente Laura Bianchi","dettaglio":"Malattia fino a venerdì 23"}],"pianificare":[]}""")
        val disco = PrivacyDisco.dashboard(d).toString()
        assertFalse(disco.contains("Malattia"))
        assertFalse(disco.contains("idoneo"))
        assertTrue(disco.contains("Assente fino a venerdì 23"))
        assertTrue("il resto resta", disco.contains("Primo soccorso"))
        assertEquals("Assente", Dashboard.daJson(JSONObject(disco)).assentiOggi.single().tipoVisto)
    }

    @Test
    fun `all'uscita dall'account le copie della fase 6 e i documenti personali aperti si tolgono`() {
        val cache = cartella.newFolder("cache")
        val scaffale = Scaffale(cartella.newFolder("fase6"), prefisso = "f6-")
        val s = ServizioFase6(TrasportoVuoto(), scaffale, Esegui, CodaFinta(), { "3" }, cache)
        scaffale.scrivi("io", JSONObject().put("persona", JSONObject().put("nome", "Marco Rossato").put("iban", "IT60X")))
        scaffale.scrivi("assenze", JSONObject().put("assenze", JSONArray()))
        File(cache, "pdf").apply { mkdirs() }.resolve("riservato-cedolino.pdf").writeText("%PDF")
        File(cache, "pdf").resolve("rapportino.pdf").writeText("%PDF")
        assertEquals(2, scaffale.nomiSulDisco().size)
        s.togliRiservati()
        assertTrue(scaffale.nomiSulDisco().isEmpty())
        assertNull("niente nemmeno in memoria", scaffale.leggi("io"))
        assertFalse(File(cache, "pdf/riservato-cedolino.pdf").exists())
        assertTrue("gli altri PDF restano", File(cache, "pdf/rapportino.pdf").exists())
    }

    @Test
    fun `la scheda di un collega non resta sul telefono, la mia sì`() = runBlocking {
        val t = TrasportoVuoto()
        val scaffale = Scaffale(cartella.newFolder("f6"), prefisso = "f6-")
        val s = ServizioFase6(t, scaffale, Esegui, CodaFinta(), { "3" }, null)
        t.risposte["persona"] = JSONObject().put("ok", true).put("persona", JSONObject(marcoSuLaura))
        s.scheda("2")
        assertTrue("la scheda di un altro non si scrive", scaffale.nomiSulDisco().isEmpty())
        t.risposte["persona"] = JSONObject().put("ok", true).put("persona", JSONObject(marcoSuDiSe))
        s.scheda(null)
        assertEquals(listOf("f6-io.json"), scaffale.nomiSulDisco())
    }

    // ---------------------------------------------------------------------------- la coda senza rete

    @Test
    fun `una richiesta salvata due volte prima di partire occupa un posto solo`() {
        val coda = CodaInvii(cartella.newFile("coda.json").apply { delete() })
        coda.assenza("A-1", JSONObject().put("tipo", "ferie").put("dal", "2026-11-02").put("al", "2026-11-05"))
        coda.assenza("A-1", JSONObject().put("tipo", "ferie").put("dal", "2026-11-02").put("al", "2026-11-06"))
        val l = coda.tutte()
        assertEquals(1, l.size)
        assertEquals("2026-11-06", l.single().corpoJson().testo("al"))
        assertTrue(l.single().fase6)
        assertFalse(l.single().fase3 || l.single().fase5)
    }

    @Test
    fun `le frasi della coda non dicono il tipo di un'assenza`() {
        val coda = CodaInvii(cartella.newFile("coda2.json").apply { delete() })
        coda.assenza("A-1", JSONObject().put("tipo", "malattia").put("dal", "2026-10-22"))
        assertEquals("1 richiesta parte appena c'è rete", TestiCoda.inAttesa(coda.tutte()))
        assertFalse(TestiCoda.rifiutata(CodaInvii.Tipo.ASSENZA).contains("malattia", ignoreCase = true))
        assertTrue(CodaInvii.Tipo.ASSENZA in CodaInvii.PERSONALI)
        val ferie = CodaInvii(cartella.newFile("coda3.json").apply { delete() })
        ferie.assenza("A-2", JSONObject().put("tipo", "ferie").put("dal", "2026-11-02"))
        ferie.km("K-1", JSONObject().put("idVeicolo", 2).put("km", 84600))
        ferie.fotoKm("K-1", "F-1", "/tmp/km.jpg")
        ferie.km("K-2", JSONObject().put("idVeicolo", 2).put("km", 84700))
        assertEquals("1 richiesta di ferie e 2 letture dei km partono appena c'è rete", TestiCoda.inAttesa(ferie.tutte()))
        ferie.guasto("G-1", JSONObject().put("titolo", "Rumore dai freni"))
        ferie.fotoGuasto("G-1", "F-2", "/tmp/g1.jpg")
        ferie.fotoGuasto("G-1", "F-3", "/tmp/g2.jpg")
        assertTrue("un guasto con due foto conta una volta", TestiCoda.inAttesa(ferie.tutte())!!.contains("1 guasto"))
        assertEquals("Modifiche non ancora partite", TestiCoda.titoloNonPartite(ferie.tutte()))
    }

    @Test
    fun `dalla coda km, guasto, prestito e richiesta partono sempre col loro idLocale`() = runBlocking {
        val t = TrasportoVuoto()
        val invio = InvioFase6(Fase6(t))
        val coda = CodaInvii(cartella.newFile("coda4.json").apply { delete() })
        val km = coda.km("K-abc", JSONObject().put("idVeicolo", 2).put("km", 84600).put("data", "2026-10-22"))
        val guasto = coda.guasto("G-abc", JSONObject().put("idVeicolo", 2).put("titolo", "Rumore dai freni"))
        val ferie = coda.assenza("A-abc", JSONObject().put("tipo", "ferie").put("dal", "2026-11-02"))
        val prendo = coda.prestito("P-abc", JSONObject().put("tipo", "prestito").put("idAttrezzatura", 3))
        // Ripetuti (la risposta persa, la rete che torna): lo stesso idLocale ogni volta.
        listOf(km, km, guasto, guasto, ferie, ferie, prendo, prendo).forEach { invio.esegui(it) }
        val km2 = t.scritte.filter { it.testo("azione") == "segnaKm" }
        assertEquals(2, km2.size)
        assertTrue(km2.all { it.testo("idLocale") == "K-abc" })
        assertTrue(t.scritte.filter { it.testo("azione") == "segnalaGuasto" }.all { it.getJSONObject("guasto").testo("idLocale") == "G-abc" })
        assertTrue(t.scritte.filter { it.testo("azione") == "salvaAssenza" }.all { it.getJSONObject("assenza").testo("idLocale") == "A-abc" })
        assertTrue(t.scritte.filter { it.testo("azione") == "assegna" }.all { it.testo("idLocale") == "P-abc" })
        // La foto del contachilometri parte con l'idLocale della lettura e lo stesso idFile.
        val foto = cartella.newFile("km.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        val op = coda.fotoKm("K-abc", "F-km1", foto.path)
        invio.esegui(op); invio.esegui(op)
        val f = t.scritte.filter { it.testo("azione") == "caricaFile" }
        assertTrue(f.all { it.testo("tipo") == "km" && it.testo("idLocaleLettura") == "K-abc" && it.testo("idFile") == "F-km1" })
    }

    @Test
    fun `le cose in coda si vedono subito`() {
        val coda = CodaInvii(cartella.newFile("coda5.json").apply { delete() })
        coda.assenza("A-9", JSONObject().put("tipo", "ferie").put("dal", "2026-11-02").put("al", "2026-11-06"))
        coda.annullaAssenza("5", JSONObject())
        val lette = listOf(Assenza("5", idPersona = "3", persona = "Marco Rossato", tipo = "permesso", tipoVisto = "Permesso", dal = "2026-11-10", stato = "da_approvare"))
        val l = InCoda6.applicaAssenze(lette, coda.tutte()) { op -> InCoda6.assenzaDaCorpo(op, "3", "Marco Rossato", 40.0, listOf(1, 2, 3, 4, 5), "", "da_approvare") }
        val nuova = l.first { it.idLocale == "A-9" }
        assertTrue(nuova.inCoda)
        assertEquals(5.0, nuova.giorni, 0.0)
        assertEquals(40.0, nuova.ore, 0.0)
        assertEquals("da_approvare", nuova.stato)
        assertEquals("annullata", l.first { it.id == "5" }.stato)
        // Una malattia nasce approvata anche sul telefono.
        val coda2 = CodaInvii(cartella.newFile("coda6.json").apply { delete() })
        coda2.assenza("A-10", JSONObject().put("tipo", "malattia").put("dal", "2026-10-09").put("al", "2026-10-13"))
        val m = InCoda6.assenzaDaCorpo(coda2.tutte().single(), "3", "Marco", 40.0, listOf(1, 2, 3, 4, 5), "", "da_approvare")
        assertEquals("approvata", m.stato)
        assertEquals("giorni di calendario", 5.0, m.giorni, 0.0)

        // I km in coda sul mio mezzo; un guasto in coda in cima, con le sue foto.
        val mezzo = Mezzo("2", "Fiat Doblò", "GA123BC", "Fiat Doblò GA123BC", proprieta = "studio", km = 84320, kmIl = "2026-10-18", kmAlTagliando = 5680)
        val c3 = CodaInvii(cartella.newFile("coda7.json").apply { delete() })
        c3.km("K-1", JSONObject().put("idVeicolo", 2).put("km", 84600).put("data", "2026-10-22"))
        c3.guasto("G-1", JSONObject().put("idVeicolo", 2).put("titolo", "Rumore dai freni").put("fermo", true))
        c3.fotoGuasto("G-1", "F-1", "/x/foto.jpg")
        val m2 = InCoda6.applicaMezzo(mezzo, c3.tutte())
        assertEquals(84600L, m2.km)
        assertEquals(5400L, m2.kmAlTagliando)
        assertEquals("Rumore dai freni", m2.manutenzioni.first().titolo)
        assertTrue(m2.manutenzioni.first().inCoda && m2.manutenzioni.first().fermo)
        assertEquals(1, m2.manutenzioni.first().fotoInAttesa.size)

        // Lo prendo io e Restituisci in coda.
        val attr = listOf(Attrezzatura("3", "AT003", "Pinza amperometrica", "strumento", stato = "disponibile"), Attrezzatura("4", "AT004", "Multimetro 87V", "strumento", stato = "prestito", mio = true))
        val c4 = CodaInvii(cartella.newFile("coda8.json").apply { delete() })
        c4.prestito("P-1", JSONObject().put("idAttrezzatura", 3))
        c4.restituisci("R-1", JSONObject().put("idAttrezzatura", 4))
        val a2 = InCoda6.applicaAttrezzature(attr, c4.tutte(), "3", "Marco Rossato")
        assertTrue(a2.first { it.id == "3" }.mio)
        assertEquals("In prestito a Marco Rossato", a2.first { it.id == "3" }.statoVisto)
        assertFalse(a2.first { it.id == "4" }.mio)
        assertEquals("Disponibile", a2.first { it.id == "4" }.statoVisto)
    }

    @Test
    fun `i km si controllano sul telefono come sul server`() {
        val il18 = LocalDate.parse("2026-10-18")
        assertEquals(ControlloKm.Esito.No("Km: l'ultima lettura era 84.320 il 18/10"), ControlloKm.controlla(84000, LocalDate.parse("2026-10-22"), 84320, il18))
        assertEquals(ControlloKm.Esito.Conferma("Sono 6.200 km in 3 giorni: è giusto?"), ControlloKm.controlla(90520, LocalDate.parse("2026-10-21"), 84320, il18))
        assertEquals(ControlloKm.Esito.Va, ControlloKm.controlla(84600, LocalDate.parse("2026-10-22"), 84320, il18))
        assertEquals(ControlloKm.Esito.Va, ControlloKm.controlla(84600, LocalDate.parse("2026-10-22"), null, null))
        assertTrue(ControlloKm.controlla(null, LocalDate.parse("2026-10-22"), 84320, il18) is ControlloKm.Esito.No)
    }

    // ---------------------------------------------------------------------------- lo strumento nel rapportino

    @Test
    fun `lo scaduto si sceglie confermando, il non conforme e quello al laboratorio mai`() {
        fun st(s: String) = ContiMezzi.StatoTaratura(s, s, null, "2026-10-12")
        assertEquals(StrumentoUsato.Scelta.SI, StrumentoUsato.sceltaDi(st("valida"), "avviso"))
        assertEquals(StrumentoUsato.Scelta.SI, StrumentoUsato.sceltaDi(st("in_scadenza"), "avviso"))
        assertEquals(StrumentoUsato.Scelta.SI, StrumentoUsato.sceltaDi(st("senza"), "avviso"))
        assertEquals(StrumentoUsato.Scelta.CONFERMA, StrumentoUsato.sceltaDi(st("scaduta"), "avviso"))
        assertEquals(StrumentoUsato.Scelta.NO_BLOCCO, StrumentoUsato.sceltaDi(st("scaduta"), "blocco"))
        assertEquals(StrumentoUsato.Scelta.NO_NON_CONFORME, StrumentoUsato.sceltaDi(st("non_conforme"), "avviso"))
        assertEquals(StrumentoUsato.Scelta.NO_LABORATORIO, StrumentoUsato.sceltaDi(st("laboratorio"), "avviso"))
        assertEquals(StrumentoUsato.Scelta.SI, StrumentoUsato.sceltaDi(null, "avviso"))
    }

    @Test
    fun `gli strumenti vanno al server solo se toccati, la conferma resta scritta`() {
        val r = Rapportino.nuovo("Marco Rossato", LocalDate.parse("2026-10-22"))
        assertFalse("senza la chiave il server non cambia niente", r.perIlFoglio().has("strumenti"))
        val conMulti = r.copy(strumenti = listOf(
            StrumentoUsato("4", "AT004", "Multimetro 87V", "6011-2381", "2026-10-12", "scaduta", confermato = true),
            StrumentoUsato("1", "AT001", "Misuratore di terra MT-500", "22-0451", "2026-11-15", "valida"),
        ))
        val s = conMulti.perIlFoglio().getJSONArray("strumenti")
        assertEquals(2, s.length())
        assertEquals(4, s.getJSONObject(0).getInt("idAttrezzatura"))
        assertTrue(s.getJSONObject(0).getBoolean("confermato"))
        assertFalse(s.getJSONObject(1).has("confermato"))
        // Una lista vuota (tolti tutti) si manda: il server li toglie.
        assertEquals(0, r.copy(strumenti = emptyList()).perIlFoglio().getJSONArray("strumenti").length())
        // La copia sul telefono li tiene interi; il PDF li ha nella forma dello script.
        val copia = Rapportino.daJson(conMulti.aJson())
        assertEquals(conMulti.strumenti, copia.strumenti)
        assertEquals("Multimetro 87V (taratura scaduta, confermato)", copia.strumenti!!.first().riga)
        assertEquals("6011-2381", conMulti.comeDalFoglio().getJSONArray("strumenti").getJSONObject(0).testo("matricola"))
        assertEquals("senza strumenti il PDF ha un elenco vuoto", 0, r.comeDalFoglio().getJSONArray("strumenti").length())
        // Dal server arrivano sempre (anche vuoti): la risposta letta li ha.
        val dalServer = Rapportino.daJson(JSONObject("""{"id":"RAP/2026/0016","idLocale":"W-1","data":"2026-10-22","strumenti":[{"idAttrezzatura":4,"codice":"AT004","nome":"Multimetro 87V","matricola":"6011-2381","scadeAllora":"2026-10-12","statoAllora":"scaduta","confermato":true,"verifica":false}]}"""), dalFoglio = true)
        assertEquals("scaduta", dalServer.strumenti!!.single().statoAllora)
        assertTrue(dalServer.strumenti!!.single().confermato)
    }

    // ---------------------------------------------------------------------------- aiuti

    private object Esegui : EsecutoreFase4 {
        override suspend fun <T> esegui(lavoro: suspend () -> T): Result<T> = try { Result.success(lavoro()) } catch (e: Exception) { Result.failure(e) }
    }

    private class CodaFinta : CodaFase6 {
        override fun assenza(chiave: String, corpo: JSONObject) = Unit
        override fun annullaAssenza(id: String, corpo: JSONObject) = Unit
        override fun togliAssenzaInCoda(chiave: String) = false
        override fun km(chiave: String, corpo: JSONObject) = Unit
        override fun fotoKm(chiave: String, file: File) = Unit
        override fun guasto(chiave: String, corpo: JSONObject) = Unit
        override fun fotoGuasto(chiave: String, file: File) = Unit
        override fun prestito(chiave: String, corpo: JSONObject) = Unit
        override fun restituisci(chiave: String, corpo: JSONObject) = Unit
        override fun firmaDpi(id: String, file: File) = Unit
    }

    /** Un server finto che ricorda cosa gli si scrive e risponde come quello vero a quel poco che serve. */
    private class TrasportoVuoto : TrasportoFase5 {
        val scritte = mutableListOf<JSONObject>()
        val risposte = mutableMapOf<String, JSONObject>()
        override suspend fun leggiAzione(azione: String, parametri: List<Pair<String, String>>): JSONObject = risposte[azione] ?: JSONObject().put("ok", true)
        override suspend fun scriviAzione(corpo: JSONObject): JSONObject {
            scritte.add(JSONObject(corpo.toString()))
            return when (corpo.testo("azione")) {
                "salvaAssenza" -> JSONObject().put("ok", true).put("assenza", JSONObject(corpo.getJSONObject("assenza").toString()).put("id", 9))
                "segnalaGuasto" -> JSONObject().put("ok", true).put("manutenzione", JSONObject(corpo.getJSONObject("guasto").toString()).put("id", 4))
                "caricaFile" -> JSONObject().put("ok", true).put("file", JSONObject().put("id", "F").put("url", "/file/F"))
                else -> JSONObject().put("ok", true)
            }
        }
        override suspend fun file(id: String): Pair<ByteArray, String> = ByteArray(0) to "application/pdf"
        override suspend fun carica(nome: String, mime: String, idFile: String, per: String, dati: ByteArray): JSONObject = JSONObject().put("ok", true)
    }
}
