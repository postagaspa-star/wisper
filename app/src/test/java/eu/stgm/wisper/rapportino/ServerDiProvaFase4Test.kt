package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.time.LocalDate

/**
 * La fase 4 contro il server di prova vero (architettura.md §15), come
 * ServerDiProvaFase3Test:
 *
 *     node server/src/avvio.js --prova --porta 8431 --dati <cartella temporanea nuova>
 *     WISPER_SERVER_PROVA=http://localhost:8431 ./gradlew :app:testDebugUnitTest
 *
 * Senza la variabile si saltano. Scrivono sul database di prova (ogni volta un server nuovo).
 * Il flusso intero: da fatturare → bozza → doppia fatturazione rifiutata → passaggio →
 * l'XML di ritorno (server/prove/xml) → emessa col numero vero → incasso in parte → nota di credito.
 */
class ServerDiProvaFase4Test {
    private val indirizzo = System.getenv("WISPER_SERVER_PROVA").orEmpty()

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-4", "dispNome" to "prove unitarie", "app" to "telefono prove") })

    private fun entra(email: String): Fase4 = runBlocking { Fase4(ponte(ponte("").accedi(email, "prova").token)) }

    private fun xml(nome: String): Pair<String, ByteArray> {
        val f = listOf("../server/prove/xml/$nome", "server/prove/xml/$nome").map(::File).first { it.exists() }
        return nome to f.readBytes()
    }

    /** I conti di una fattura rifatti sul telefono dalle sue righe: devono essere quelli del server. */
    private fun controllaConti(f: Fattura) {
        val k = RegoleFattura.calcola(f.parametri, f.righe.map { it.perConti(false) })
        val s = f.conti!!
        assertEquals("${f.riferimento}: compenso", s.compenso, k.compenso, 0.0)
        assertEquals("${f.riferimento}: contributo", s.contributo, k.contributo, 0.0)
        assertEquals("${f.riferimento}: iva", s.iva, k.iva, 0.0)
        assertEquals("${f.riferimento}: anticipazioni", s.anticipazioni, k.anticipazioni, 0.0)
        assertEquals("${f.riferimento}: bollo", s.bolloAddebitato, k.bolloAddebitato, 0.0)
        assertEquals("${f.riferimento}: totale", s.totale, k.totale, 0.0)
        assertEquals("${f.riferimento}: ritenuta", s.ritenuta, k.ritenuta, 0.0)
        assertEquals("${f.riferimento}: netto", s.netto, k.netto, 0.0)
    }

    @Test
    fun `il flusso intero della fattura, dalla bozza all'incasso in parte e alla nota di credito`() = runBlocking {
        val f4 = entra("manuel@esempio.it")

        // 1. Da fatturare: il rapportino di Rossi con le sue spese.
        val d = f4.daFatturare()
        val rossi = d.gruppi.first { it.idCliente == "C002" }
        val rap = rossi.voci.first { it.tipo == "rapportino" }
        val insieme = SceltaDaFatturare.insieme(rap, d.tutte).mapNotNull { k -> d.tutte.firstOrNull { it.chiave == k } }
        assertTrue("le spese vanno col rapportino", insieme.size >= 2)

        // 2. La bozza: i conti del server sono quelli del telefono.
        val bozza = f4.preparaFattura("C002", insieme, "rapportino")
        assertEquals("bozza", bozza.stato)
        assertEquals("", bozza.numero)
        assertTrue(bozza.riferimento.startsWith("W-"))
        controllaConti(bozza)
        assertFalse("la bozza non ha numero fiscale", bozza.numeroVisto.matches(Regex("""\d+/\d{4}""")))

        // 3. La stessa cosa due volte: la rifiuta il database.
        try {
            f4.preparaFattura("C002", listOf(rap), "rapportino")
            fail("doveva dire che è già in una bozza")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message, e.message!!.contains("è già nella bozza ${bozza.riferimento}"))
        }
        // E non compare più in Da fatturare.
        assertTrue(f4.daFatturare().tutte.none { it.chiave == rap.chiave })

        // 4. Cambiare una riga libera e toglierla: i conti tornano dal server.
        val (conLibera, _) = f4.salvaFattura(org.json.JSONObject().put("id", PonteServer.idJson(bozza.id)).put("righe", org.json.JSONArray().apply {
            bozza.righe.filter { !it.bollo }.forEach { put(it.perSalvare()) }
            put(RigaFattura(id = PonteServer.NUOVO + "1", descrizione = "Relazione tecnica", quantita = 2.0, prezzo = 61.15).perSalvare())
        }))
        assertEquals(bozza.righe.count { !it.bollo } + 1, conLibera.righe.count { !it.bollo })
        controllaConti(conLibera)

        // 5. Scartare libera le sorgenti.
        f4.scartaFattura(bozza.id)
        assertTrue(f4.daFatturare().tutte.any { it.chiave == rap.chiave })

        // 6. Il passaggio al programma della W-15: le regole non confermate chiedono conferma.
        val w15 = f4.fattura("W-15")
        try {
            f4.passaAlProgramma(w15.id)
            fail("doveva chiedere conferma")
        } catch (e: PonteServer.DaConfermare) {
            assertTrue(e.message!!.contains("non sono ancora confermate"))
        }
        val (pronta, pacchetto) = f4.passaAlProgramma(w15.id, conferma = true)
        assertEquals("pronta", pronta.stato)
        assertNotNull(pacchetto)
        assertTrue(pacchetto!!.conXml)
        assertTrue(Pacchetto.nomeXmlSicuro(pacchetto.xmlNome, pronta.riferimento).contains("non inviare"))
        assertEquals("Cliente", pacchetto.sezioni.first().titolo)
        assertTrue(pacchetto.testo.contains("Rif. W-15"))
        assertTrue(java.util.Base64.getMimeDecoder().decode(pacchetto.xmlBase64).toString(Charsets.ISO_8859_1).contains("<Numero>BOZZA</Numero>"))

        // 7. L'XML di ritorno: la 46 (busta DER) è la W-14 sicura, la 48 (busta BER in base64) è la W-15 probabile.
        val l = f4.leggiXml(listOf(xml("IT00000000000_00046.xml.p7m"), xml("IT00000000000_00048.xml.p7m")))
        val d46 = l.documenti.first { it.numero == "46/2026" }
        val d48 = l.documenti.first { it.numero == "48/2026" }
        assertEquals("certa", d46.proposta.certezza)
        assertEquals("W-14", d46.proposta.riferimento)
        assertEquals("probabile", d48.proposta.certezza)
        assertEquals(w15.id, d48.proposta.idFattura)
        val scelte = l.documenti.map { SceltaXml.iniziale(it) }
        assertTrue(scelte.all { it.confermata })
        val esito = f4.confermaXml(l.idLettura, SceltaXml.daMandare(scelte))
        assertEquals(2, esito.abbinate)

        // 8. Emessa col numero vero, i conti dell'XML (uguali alla bozza).
        val emessa = f4.fattura(w15.id)
        assertEquals("emessa", emessa.stato)
        assertEquals("48/2026", emessa.numero)
        assertEquals("xml", emessa.numeroDa)
        assertEquals(2069.12, emessa.conti!!.totale, 0.0)
        assertEquals(1765.12, emessa.conti.netto, 0.0)

        // 9. Un incasso in parte: residuo al centesimo, "Pagata in parte"; Annulla lo toglie.
        val conti = f4.conti()
        val (mov, dopo) = f4.segnaIncasso(emessa.id, 500.0, LocalDate.now(), conti.first { it.predefinito }.id, verificato = false)
        assertEquals(500.0, mov.importo!!, 0.0)
        assertEquals("in_parte", dopo!!.pagamento)
        assertEquals("Pagata in parte", dopo.statoVisto)
        assertEquals(1265.12, dopo.residuo!!, 0.0)
        // Più del residuo: no.
        try {
            f4.segnaIncasso(emessa.id, 2000.0, LocalDate.now(), "", false)
            fail("oltre il residuo")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message, e.message!!.contains("ha ancora da incassare 1.265,12"))
        }
        f4.annullaMovimento(mov.id, "prova")
        assertEquals(1765.12, f4.fattura(emessa.id).residuo!!, 0.0)
        val (_, ancora) = f4.segnaIncasso(emessa.id, 500.0, LocalDate.now(), "", verificato = true)
        assertEquals(1265.12, ancora!!.residuo!!, 0.0)

        // 10. La nota di credito di 200 sulla 45/2026: il caso 12 dei conti condivisi.
        val f45 = f4.fattura("45/2026")
        val riga = f45.righe.first { !it.bollo && it.tipo == "compenso" }
        val nota = f4.preparaNotaCredito(f45.id, tutta = false, righe = mapOf(riga.id to 200.0), motivo = "sconto concordato")
        assertTrue(nota.nota)
        assertEquals("TD04", nota.tipoDocumento)
        assertEquals(256.2, nota.conti!!.totale, 0.0)
        assertEquals(216.2, nota.conti.netto, 0.0)
        controllaConti(nota)

        // 11. Lo scadenziario rifatto sul telefono torna con quello del server.
        val sc = f4.scadenziario()
        val rifatto = sc.ricalcola()
        sc.giorni.forEachIndexed { i, g ->
            assertEquals(g.data, g.saldo!!, rifatto[i].first, 0.005)
            assertEquals(g.data, g.sottoSoglia, rifatto[i].second)
        }
        assertTrue(sc.giorni.flatMap { it.righe }.any { it.tipo == "fattura" && it.id == emessa.id && it.importo == 1265.12 })
    }

    private fun ponteDi(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }

    @Test
    fun `sostituto d'imposta e pagamento del cliente si salvano senza toccare gli altri campi`() = runBlocking {
        val p = ponteDi("manuel@esempio.it")
        val prima = p.anagrafiche().cliente("C002")!!
        assertTrue("il server manda i campi della fatturazione", prima.fatturazioneLetta)
        // Dal modulo del telefono: sostituto no, 60 giorni, fine mese sì.
        val salvato = p.salvaSoggetto(prima.copy(sostitutoImposta = false, pagamentoGiorni = 60, pagamentoFineMese = true), nuovo = false, costi = true, fatturazione = true).dato
        assertEquals(false, salvato.sostitutoImposta)
        assertEquals(60, salvato.pagamentoGiorni)
        assertEquals(true, salvato.pagamentoFineMese)
        val dopo = p.anagrafiche().cliente("C002")!!
        // Tutti gli altri campi come prima.
        assertEquals(prima.copy(sostitutoImposta = false, pagamentoGiorni = 60, pagamentoFineMese = true), dopo)
        // Una copia vecchia (senza i campi letti) o chi non vede le fatture: non si mandano, restano.
        p.salvaSoggetto(dopo.copy(sostitutoImposta = null, pagamentoGiorni = null, pagamentoFineMese = null, fatturazioneLetta = false), nuovo = false, costi = true, fatturazione = true)
        p.salvaSoggetto(dopo.copy(sostitutoImposta = null, pagamentoGiorni = null), nuovo = false, costi = true, fatturazione = false)
        assertEquals(dopo, p.anagrafiche().cliente("C002")!!)
        // Di nuovo automatico.
        val auto = p.salvaSoggetto(dopo.copy(sostitutoImposta = null, pagamentoGiorni = null, pagamentoFineMese = null), nuovo = false, costi = true, fatturazione = true).dato
        assertEquals(null, auto.sostitutoImposta)
        assertEquals(prima, p.anagrafiche().cliente("C002")!!)
    }

    @Test
    fun `come si fattura la commessa si salva senza toccare gli altri campi`() = runBlocking {
        val p = ponteDi("manuel@esempio.it")
        val ana = p.anagrafiche()
        val prima = ana.commesse.first { it.id == "26ST002" }
        assertEquals("misto", prima.modoFatturazione)
        val dopo = p.aggiornaCommessa(prima.copy(modoFatturazione = "ore"), ana.cliente(prima.idCliente), costi = true, fatturazione = true)
        assertEquals("ore", dopo.modoFatturazione)
        assertEquals(prima.copy(modoFatturazione = "ore"), p.anagrafiche().commesse.first { it.id == "26ST002" })
        // Senza sapere il modo (copia vecchia) non si manda: resta.
        p.aggiornaCommessa(prima.copy(modoFatturazione = null), ana.cliente(prima.idCliente), costi = true, fatturazione = true)
        assertEquals("ore", p.anagrafiche().commesse.first { it.id == "26ST002" }.modoFatturazione)
        p.aggiornaCommessa(prima, ana.cliente(prima.idCliente), costi = true, fatturazione = true)
        assertEquals(prima, p.anagrafiche().commesse.first { it.id == "26ST002" })
    }

    @Test
    fun `l'XML da completare non si importa, BOZZA non è un numero, e i soldi da restituire dopo una nota`() = runBlocking {
        val f4 = entra("manuel@esempio.it")
        // L'XML da completare torna indietro per sbaglio: il server lo scarta (e il telefono lo salterebbe comunque).
        val vuota = f4.nuovaFattura("C003")
        val (bozza, _) = f4.salvaFattura(org.json.JSONObject().put("id", PonteServer.idJson(vuota.id))
            .put("righe", org.json.JSONArray().put(RigaFattura(id = PonteServer.NUOVO + "1", descrizione = "Sopralluogo di prova", quantita = 1.0, prezzo = 100.0).perSalvare())))
        val pac = f4.pacchetto(bozza.id)
        assertTrue("il pacchetto di una bozza ha l'XML da completare", pac.conXml)
        val l = f4.leggiXml(listOf(pac.xmlNome to java.util.Base64.getMimeDecoder().decode(pac.xmlBase64)))
        assertTrue(l.documenti.isEmpty() || l.documenti.all { it.bozzaDiWisper })
        assertTrue(l.scartati.any { it.motivo.contains("XML da completare") })
        try {
            f4.segnaEmessa(bozza.id, "BOZZA", LocalDate.now(), conferma = true)
            fail("BOZZA non è un numero")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message, e.message!!.contains("BOZZA non è un numero"))
        }
        f4.scartaFattura(bozza.id)
        // La 38/2026 è pagata: una nota di credito emessa su tutta la fattura lascia soldi da restituire.
        val f38 = f4.fattura("38/2026")
        assertEquals(0.0, f38.daRestituire ?: 0.0, 0.0)
        val nota = f4.preparaNotaCredito(f38.id, tutta = true, righe = emptyMap(), motivo = "prova")
        f4.segnaEmessa(nota.id, "9/2026", LocalDate.now(), conferma = true)
        val dopo = f4.fattura(f38.id)
        assertEquals(RegoleFattura.centesimi((dopo.incassato ?: 0.0) + nota.conti!!.netto - dopo.conti!!.netto), dopo.daRestituire!!, 0.005)
        assertTrue(dopo.daRestituire!! > 0)
        val d = Dashboard.daJson(ponteDi("manuel@esempio.it").dashboard())
        assertTrue(d.urgenti.any { it.tipo == "fattura" && it.collegamento?.id == f38.id && it.titolo.contains("da restituire") })
    }

    @Test
    fun `il collaboratore non vede le fatture, chi legge non scrive`() = runBlocking {
        val marco = entra("marco@esempio.it")
        try {
            marco.fatture()
            fail("il collaboratore non vede le fatture")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message!!.isNotBlank())
        }
        try {
            marco.scadenziario()
            fail("il collaboratore non vede le banche")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message!!.isNotBlank())
        }
        val lettura = entra("lettura@esempio.it")
        assertTrue(lettura.fatture().isNotEmpty())
        // L'IBAN intero solo a chi scrive le banche.
        assertTrue(lettura.conti().all { it.iban.isBlank() })
        try {
            lettura.preparaFattura("C002", listOf(VoceDaFatturare("ore", "10")), null)
            fail("chi legge non scrive")
        } catch (e: PonteServer.PermessoNegato) {
            assertTrue(e.message!!.isNotBlank())
        }
    }
}
