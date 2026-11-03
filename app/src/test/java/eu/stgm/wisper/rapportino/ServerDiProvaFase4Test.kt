package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
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
import java.time.temporal.ChronoUnit

/**
 * La fase 4 contro il server di prova vero (architettura.md §15). Si lanciano in un modo solo, con un server
 * nuovo fermo al 22/10/2026 (ServerDiProva.kt):
 *
 *     node server/prove/telefono.js            (--giri 2: due giri di fila sullo stesso server)
 *
 * Senza WISPER_SERVER_PROVA si saltano. Ogni prova fa le sue fatture, coi numeri fiscali liberi del server, e le
 * date sono quelle del server: passano anche due volte di fila sullo stesso server.
 * Il flusso intero: da fatturare → bozza → doppia fatturazione rifiutata → passaggio →
 * l'XML di ritorno (server/prove/xml) → emessa col numero vero → incasso in parte → nota di credito.
 */
class ServerDiProvaFase4Test {
    private val indirizzo = ServerDiProva.indirizzo

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-4", "dispNome" to "prove unitarie", "app" to "telefono prove") })

    private fun ponteDi(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }

    private fun entra(email: String): Fase4 = Fase4(ponteDi(email))

    /** Il giorno del server: il server di prova ha l'orologio fermo (WISPER_OGGI_PROVA) e le date si scrivono sul suo. */
    private val oggi: LocalDate get() = ServerDiProva.oggi

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

    /** Una bozza nuova di questo giro, con righe libere (le righe dei dati di esempio sono già fatturate). */
    private suspend fun nuovaBozza(f4: Fase4, idCliente: String, causale: String, vararg righe: RigaFattura): Fattura {
        val vuota = f4.nuovaFattura(idCliente)
        val (bozza, _) = f4.salvaFattura(JSONObject().put("id", PonteServer.idJson(vuota.id)).put("causale", causale).put("righe", JSONArray().apply {
            righe.forEachIndexed { i, r -> put(r.copy(id = PonteServer.NUOVO + (i + 1)).perSalvare()) }
        }))
        return bozza
    }

    /**
     * Numeri fiscali liberi nell'anno del server, come quelli del programma di Manuel: una fattura emessa non si
     * emette due volte (allo stesso numero il server dice "C'è già la fattura"). Quello [preferiti] se è ancora libero
     * (sul server nuovo i numeri degli XML di esempio), se no ("" o già usato) il prossimo dopo il più alto.
     */
    private suspend fun numeriLiberi(f4: Fase4, vararg preferiti: String): List<String> {
        val anno = oggi.year
        val usati = f4.fatture().map { it.numero.replace(" ", "") }.filter { it.isNotBlank() }.toMutableSet()
        var prossimo = (usati.mapNotNull { Regex("""(\d+)/$anno""").matchEntire(it)?.groupValues?.get(1)?.toInt() }.maxOrNull() ?: 0) + 1
        return preferiti.map { p ->
            val n = if (p.endsWith("/$anno") && p !in usati) p else {
                while ("$prossimo/$anno" in usati) prossimo++
                "$prossimo/$anno"
            }
            usati += n
            n
        }
    }

    /**
     * La bozza di Mario Bianchi per l'XML 46 (l'abbinamento certo, col riferimento): la W-14 dei dati di esempio
     * finché non è emessa (sul server nuovo), se no una uguale fatta adesso. Passata al programma, come la W-14.
     */
    private suspend fun bozzaDiBianchi(f4: Fase4): Fattura {
        val w14 = f4.fattura("W-14")
        val f = if (w14.stato == "bozza" || w14.stato == "pronta") w14
        else nuovaBozza(f4, "C003", "Sopralluogo e rilievo, impianto fotovoltaico", RigaFattura(descrizione = "Sopralluogo e rilievo: Impianto fotovoltaico", prezzo = 250.0))
        return if (f.stato == "pronta") f else f4.passaAlProgramma(f.id, conferma = true).first
    }

    /**
     * La bozza di Rossi per l'XML 48 (l'abbinamento probabile: stesso cliente, stesso totale, data vicina): il 40% di
     * 26ST003 con la pratica anticipata e il bollo, 2.069,12. Dev'essere una sola: con due bozze uguali l'abbinamento
     * non si conferma da solo, chiede quale. È la W-15 dei dati di esempio (fatta dalle cose da fatturare) finché non è
     * emessa, se no una uguale con righe libere; le altre uguali, lasciate da un giro fermato a metà, si scartano.
     * Torna in bozza: la prova passa lei al programma.
     */
    private suspend fun bozzaDiRossi(f4: Fase4): Fattura {
        val uguali = f4.fatture(FiltroFatture(stato = "da_emettere", idCliente = "C002"))
            .filter { it.tipo == "fattura" && it.conti?.totale == 2069.12 }.sortedBy { it.id.toInt() }
        uguali.drop(1).forEach { f4.scartaFattura(it.id, "prova: un'altra uguale", conferma = true) }
        val gia = uguali.firstOrNull() ?: return nuovaBozza(f4, "C002", "40% a fine progetto, commessa 26ST003",
            RigaFattura(descrizione = "40% a fine progetto: Adeguamento impianto elettrico capannone (commessa 26ST003, contratto PR/2026/012 rev. 1)", prezzo = 1520.0),
            RigaFattura(tipo = "anticipazione", descrizione = "Spesa anticipata per conto del cliente: Pratica di connessione al distributore del 14/10/2026", prezzo = 120.0))
        return f4.tornaInBozza(gia.id)
    }

    /** Lo scadenziario come lo chiede il telefono (Fase4.scadenziario, 90 giorni), ma da oggi del server: il telefono conta dal suo giorno. */
    private suspend fun scadenziario(p: PonteServer): Scadenziario =
        Scadenziario.daJson(p.leggiAzione("scadenziario", listOf("da" to oggi.toString(), "a" to oggi.plusDays(90).toString())))

    @Test
    fun `il flusso intero della fattura, dalla bozza all'incasso in parte e alla nota di credito`() = runBlocking {
        val p = ponteDi("manuel@esempio.it")
        val f4 = Fase4(p)

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
        val (conLibera, _) = f4.salvaFattura(JSONObject().put("id", PonteServer.idJson(bozza.id)).put("righe", JSONArray().apply {
            bozza.righe.filter { !it.bollo }.forEach { put(it.perSalvare()) }
            put(RigaFattura(id = PonteServer.NUOVO + "1", descrizione = "Relazione tecnica", quantita = 2.0, prezzo = 61.15).perSalvare())
        }))
        assertEquals(bozza.righe.count { !it.bollo } + 1, conLibera.righe.count { !it.bollo })
        controllaConti(conLibera)

        // 5. Scartare libera le sorgenti.
        f4.scartaFattura(bozza.id)
        assertTrue(f4.daFatturare().tutte.any { it.chiave == rap.chiave })

        // 6. Le bozze per l'XML di ritorno: la W-14 di Mario Bianchi, passata al programma, e la W-15 di Rossi, il 40% di
        //    26ST003 con la pratica anticipata e il bollo (sul server nuovo quelle dei dati di esempio; ai giri dopo, emesse
        //    quelle, due uguali fatte adesso).
        val prima = bozzaDiBianchi(f4)
        assertEquals("pronta", prima.stato)
        val seconda = bozzaDiRossi(f4)
        assertEquals("bozza", seconda.stato)
        assertTrue("il bollo sulla pratica anticipata", seconda.righe.any { it.bollo })
        assertEquals("i conti della W-15", 2069.12, seconda.conti!!.totale, 0.0)
        controllaConti(seconda)
        // Il passaggio al programma: le regole non confermate chiedono conferma.
        try {
            f4.passaAlProgramma(seconda.id)
            fail("doveva chiedere conferma")
        } catch (e: PonteServer.DaConfermare) {
            assertTrue(e.message!!.contains("non sono ancora confermate"))
        }
        val (pronta, pacchetto) = f4.passaAlProgramma(seconda.id, conferma = true)
        assertEquals("pronta", pronta.stato)
        assertNotNull(pacchetto)
        assertTrue(pacchetto!!.conXml)
        assertTrue(Pacchetto.nomeXmlSicuro(pacchetto.xmlNome, pronta.riferimento).contains("non inviare"))
        assertEquals("Cliente", pacchetto.sezioni.first().titolo)
        assertTrue(pacchetto.testo.contains("Rif. ${seconda.riferimento}"))
        assertTrue(java.util.Base64.getMimeDecoder().decode(pacchetto.xmlBase64).toString(Charsets.ISO_8859_1).contains("<Numero>BOZZA</Numero>"))

        // 7. L'XML di ritorno: gli esempi di server/prove/xml nelle stesse buste (la 46 in DER, la 48 in BER in base64),
        //    coi numeri ancora liberi (sul server nuovo proprio 46 e 48), il giorno del server e il riferimento della W-14
        //    di questo giro. La 46 porta il riferimento: certa; la 48 no: è la W-15 per cliente, importo e data, probabile.
        val (n46, n48) = numeriLiberi(f4, "46/2026", "48/2026")
        val l = f4.leggiXml(listOf(
            Busta.esempio("IT00000000000_00046.xml.p7m", "46/2026", n46, oggi, "W-14" to prima.riferimento),
            Busta.esempio("IT00000000000_00048.xml.p7m", "48/2026", n48, oggi),
        ))
        val d46 = l.documenti.first { it.numero == n46 }
        val d48 = l.documenti.first { it.numero == n48 }
        assertEquals("certa", d46.proposta.certezza)
        assertEquals(prima.riferimento, d46.proposta.riferimento)
        assertEquals("probabile", d48.proposta.certezza)
        assertEquals(seconda.id, d48.proposta.idFattura)
        val scelte = l.documenti.map { SceltaXml.iniziale(it) }
        assertTrue(scelte.all { it.confermata })
        val esito = f4.confermaXml(l.idLettura, SceltaXml.daMandare(scelte))
        assertEquals(2, esito.abbinate)

        // 8. Emessa col numero vero, i conti dell'XML (uguali alla bozza).
        val emessa = f4.fattura(seconda.id)
        assertEquals("emessa", emessa.stato)
        assertEquals(n48, emessa.numero)
        assertEquals("xml", emessa.numeroDa)
        assertEquals(2069.12, emessa.conti!!.totale, 0.0)
        assertEquals(1765.12, emessa.conti.netto, 0.0)
        assertEquals(n46, f4.fattura(prima.id).numero)

        // 9. Un incasso in parte: residuo al centesimo, "Pagata in parte"; Annulla lo toglie.
        val conti = f4.conti()
        val (mov, dopo) = f4.segnaIncasso(emessa.id, 500.0, oggi, conti.first { it.predefinito }.id, verificato = false)
        assertEquals(500.0, mov.importo!!, 0.0)
        assertEquals("in_parte", dopo!!.pagamento)
        assertEquals("Pagata in parte", dopo.statoVisto)
        assertEquals(1265.12, dopo.residuo!!, 0.0)
        // Più del residuo: no.
        try {
            f4.segnaIncasso(emessa.id, 2000.0, oggi, "", false)
            fail("oltre il residuo")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message, e.message!!.contains("ha ancora da incassare 1.265,12"))
        }
        f4.annullaMovimento(mov.id, "prova")
        assertEquals(1765.12, f4.fattura(emessa.id).residuo!!, 0.0)
        val (_, ancora) = f4.segnaIncasso(emessa.id, 500.0, oggi, "", verificato = true)
        assertEquals(1265.12, ancora!!.residuo!!, 0.0)

        // 10. La nota di credito di 200 sulla 45/2026: il caso 12 dei conti condivisi. Resta una bozza: si scarta.
        val f45 = f4.fattura("45/2026")
        val riga = f45.righe.first { !it.bollo && it.tipo == "compenso" }
        val nota = f4.preparaNotaCredito(f45.id, tutta = false, righe = mapOf(riga.id to 200.0), motivo = "sconto concordato")
        assertTrue(nota.nota)
        assertEquals("TD04", nota.tipoDocumento)
        assertEquals(256.2, nota.conti!!.totale, 0.0)
        assertEquals(216.2, nota.conti.netto, 0.0)
        controllaConti(nota)
        assertEquals("scartata", f4.scartaFattura(nota.id, "prova").stato)

        // 11. Lo scadenziario rifatto sul telefono torna con quello del server.
        val sc = scadenziario(p)
        val rifatto = sc.ricalcola()
        sc.giorni.forEachIndexed { i, g ->
            assertEquals(g.data, g.saldo!!, rifatto[i].first, 0.005)
            assertEquals(g.data, g.sottoSoglia, rifatto[i].second)
        }
        assertTrue(sc.giorni.flatMap { it.righe }.any { it.tipo == "fattura" && it.id == emessa.id && it.importo == 1265.12 })
    }

    @Test
    fun `sostituto d'imposta e pagamento del cliente si salvano senza toccare gli altri campi`() = runBlocking {
        val p = ponteDi("manuel@esempio.it")
        val prima = p.anagrafiche().cliente("C002")!!
        assertTrue("il server manda i campi della fatturazione", prima.fatturazioneLetta)
        try {
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
        } finally {
            // Rossi torna com'era anche se la prova si ferma a metà: le altre prove fatturano a Rossi (la ritenuta).
            p.salvaSoggetto(prima, nuovo = false, costi = true, fatturazione = true)
        }
    }

    @Test
    fun `come si fattura la commessa si salva senza toccare gli altri campi`() = runBlocking {
        val p = ponteDi("manuel@esempio.it")
        val ana = p.anagrafiche()
        val prima = ana.commesse.first { it.id == "26ST002" }
        assertEquals("misto", prima.modoFatturazione)
        try {
            val dopo = p.aggiornaCommessa(prima.copy(modoFatturazione = "ore"), ana.cliente(prima.idCliente), costi = true, fatturazione = true)
            assertEquals("ore", dopo.modoFatturazione)
            assertEquals(prima.copy(modoFatturazione = "ore"), p.anagrafiche().commesse.first { it.id == "26ST002" })
            // Senza sapere il modo (copia vecchia) non si manda: resta.
            p.aggiornaCommessa(prima.copy(modoFatturazione = null), ana.cliente(prima.idCliente), costi = true, fatturazione = true)
            assertEquals("ore", p.anagrafiche().commesse.first { it.id == "26ST002" }.modoFatturazione)
            p.aggiornaCommessa(prima, ana.cliente(prima.idCliente), costi = true, fatturazione = true)
            assertEquals(prima, p.anagrafiche().commesse.first { it.id == "26ST002" })
        } finally {
            // 26ST002 torna "misto" anche se la prova si ferma a metà.
            p.aggiornaCommessa(prima, ana.cliente(prima.idCliente), costi = true, fatturazione = true)
        }
    }

    @Test
    fun `l'XML da completare non si importa, BOZZA non è un numero, e i soldi da restituire dopo una nota`() = runBlocking {
        val f4 = entra("manuel@esempio.it")
        // L'XML da completare torna indietro per sbaglio: il server lo scarta (e il telefono lo salterebbe comunque).
        val bozza = nuovaBozza(f4, "C003", "", RigaFattura(descrizione = "Sopralluogo di prova", quantita = 1.0, prezzo = 100.0))
        val pac = f4.pacchetto(bozza.id)
        assertTrue("il pacchetto di una bozza ha l'XML da completare", pac.conXml)
        val l = f4.leggiXml(listOf(pac.xmlNome to java.util.Base64.getMimeDecoder().decode(pac.xmlBase64)))
        assertTrue(l.documenti.isEmpty() || l.documenti.all { it.bozzaDiWisper })
        assertTrue(l.scartati.any { it.motivo.contains("XML da completare") })
        try {
            f4.segnaEmessa(bozza.id, "BOZZA", oggi, conferma = true)
            fail("BOZZA non è un numero")
        } catch (e: PonteServer.Rifiutato) {
            assertTrue(e.message, e.message!!.contains("BOZZA non è un numero"))
        }
        f4.scartaFattura(bozza.id)
        // Una fattura di questo giro emessa e pagata tutta (come la 38/2026 dei dati di esempio): una nota di credito
        // emessa su tutta la fattura lascia soldi da restituire.
        val (nFattura, nNota) = numeriLiberi(f4, "", "")
        val daPagare = nuovaBozza(f4, "C001", "Prestazioni di prova",
            RigaFattura(descrizione = "Prestazioni professionali di prova", quantita = 6.0, unita = "ore", prezzo = 30.0))
        val emessa = f4.segnaEmessa(daPagare.id, nFattura, oggi, conferma = true)
        assertEquals("emessa", emessa.stato)
        val (incasso, pagata) = f4.segnaIncasso(emessa.id, null, oggi, "", verificato = true)
        assertEquals("pagata", pagata!!.pagamento)
        assertEquals(0.0, pagata.daRestituire ?: 0.0, 0.0)
        val nota = f4.preparaNotaCredito(emessa.id, tutta = true, righe = emptyMap(), motivo = "prova")
        f4.segnaEmessa(nota.id, nNota, oggi, conferma = true)
        val dopo = f4.fattura(emessa.id)
        assertEquals(RegoleFattura.centesimi((dopo.incassato ?: 0.0) + nota.conti!!.netto - dopo.conti!!.netto), dopo.daRestituire!!, 0.005)
        assertTrue(dopo.daRestituire!! > 0)
        // Dalla fase 8 la Dashboard mostra al massimo 7 urgenti: al secondo giro la voce può essere fra le "Altre N",
        // quindi si guarda in Tutto quello che c'è da fare (dashboard {tutto: true}, senza tetti).
        val d = Fase8(ponteDi("manuel@esempio.it")).dashboardTutto()
        assertTrue(d.urgenti.any { it.tipo == "fattura" && it.collegamento?.id == emessa.id && it.titolo.contains("da restituire") })
        // Annulla l'incasso: niente più da restituire, e la Dashboard del prossimo giro non si riempie di queste voci.
        f4.annullaMovimento(incasso.id, "prova")
        assertEquals(0.0, f4.fattura(emessa.id).daRestituire ?: 0.0, 0.0)
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

/**
 * Le fatture elettroniche di esempio (server/prove/xml, fatte da genera.js) rifatte per un giro: lo stesso XML
 * con un altro numero, le date spostate sul giorno del server e, se serve, un altro riferimento di Wisper,
 * nella stessa busta .p7m (DER, o BER in base64) che fa genera.js, con la sua firma finta.
 */
private object Busta {
    /** Il giorno degli esempi (le date fisse degli XML: 22/10/2026, il giorno dei prototipi). */
    private val GIORNO_DEGLI_ESEMPI: LocalDate = LocalDate.of(2026, 10, 22)

    fun esempio(nome: String, numero: String, nuovoNumero: String, oggi: LocalDate, riferimento: Pair<String, String>? = null): Pair<String, ByteArray> {
        val f = listOf("../server/prove/xml/$nome", "server/prove/xml/$nome").map(::File).first { it.exists() }
        val originale = f.readBytes()
        val ber = originale[0] != 0x30.toByte()
        var xml = String(apri(originale), Charsets.UTF_8)
        val numeroPrima = Regex("""(<(?:\w+:)?Numero>)${Regex.escape(numero)}(</(?:\w+:)?Numero>)""")
        assertTrue("$nome: il numero $numero", numeroPrima.containsMatchIn(xml))
        xml = numeroPrima.replace(xml) { it.groupValues[1] + nuovoNumero + it.groupValues[2] }
        val spostamento = ChronoUnit.DAYS.between(GIORNO_DEGLI_ESEMPI, oggi)
        xml = Regex("""\d{4}-\d{2}-\d{2}""").replace(xml) { LocalDate.parse(it.value).plusDays(spostamento).toString() }
        if (riferimento != null) {
            assertTrue("$nome: il riferimento ${riferimento.first}", xml.contains(riferimento.first))
            xml = Regex("""\b${Regex.escape(riferimento.first)}\b""").replace(xml, riferimento.second)
        }
        val contenuto = xml.toByteArray(Charsets.UTF_8)
        return nome to if (ber) base64Righe(bustaBer(contenuto)) else bustaDer(contenuto)
    }

    // ---------------------------------------------- aprire: ContentInfo -> [0] -> SignedData -> encapContentInfo -> [0]

    private class Pezzo(val tag: Int, val inizio: Int, val fine: Int, val dopo: Int, val figli: List<Pezzo>?)

    private fun pezzo(b: ByteArray, p: Int): Pezzo {
        val tag = b[p].toInt() and 0xFF
        var q = p + 1
        val l = b[q++].toInt() and 0xFF
        if (l == 0x80) {
            val figli = mutableListOf<Pezzo>()
            var r = q
            while (!(b[r].toInt() == 0 && b[r + 1].toInt() == 0)) pezzo(b, r).also { figli += it; r = it.dopo }
            return Pezzo(tag, q, r, r + 2, figli)
        }
        var lunghezza = l
        if (l > 0x80) {
            lunghezza = 0
            repeat(l and 0x7F) { lunghezza = lunghezza * 256 + (b[q++].toInt() and 0xFF) }
        }
        return Pezzo(tag, q, q + lunghezza, q + lunghezza, null)
    }

    private fun figli(b: ByteArray, x: Pezzo): List<Pezzo> = x.figli ?: buildList {
        var r = x.inizio
        while (r < x.fine) pezzo(b, r).also { add(it); r = it.dopo }
    }

    private fun ottetti(b: ByteArray, x: Pezzo): ByteArray =
        if (x.tag == 0x04) b.copyOfRange(x.inizio, x.fine) else figli(b, x).fold(ByteArray(0)) { a, f -> a + ottetti(b, f) }

    private fun apri(file: ByteArray): ByteArray {
        val b = if (file[0] == 0x30.toByte()) file else java.util.Base64.getMimeDecoder().decode(file)
        val signed = figli(b, figli(b, pezzo(b, 0))[1])[0]
        val encap = figli(b, signed)[2]
        return figli(b, figli(b, encap)[1]).fold(ByteArray(0)) { a, f -> a + ottetti(b, f) }
    }

    // ---------------------------------------------- chiudere: come bustaDer, bustaBer e base64Righe di genera.js

    private fun lunghezzaDer(n: Int): ByteArray {
        if (n < 128) return byteArrayOf(n.toByte())
        val b = mutableListOf<Byte>()
        var x = n
        while (x > 0) { b.add(0, (x % 256).toByte()); x /= 256 }
        return byteArrayOf((0x80 or b.size).toByte()) + b.toByteArray()
    }

    private fun unisci(c: Array<out ByteArray>) = c.fold(ByteArray(0)) { a, x -> a + x }
    private fun der(tag: Int, vararg c: ByteArray): ByteArray = unisci(c).let { byteArrayOf(tag.toByte()) + lunghezzaDer(it.size) + it }
    private fun ber(tag: Int, vararg c: ByteArray): ByteArray = byteArrayOf(tag.toByte(), 0x80.toByte()) + unisci(c) + byteArrayOf(0, 0)
    private fun oid(hex: String) = der(0x06, hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray())

    private val NULLA = byteArrayOf(0x05, 0x00)
    private val UNO = der(0x02, byteArrayOf(1))
    private val SHA256 = der(0x30, oid("608648016503040201"), NULLA)
    private val FIRMATARIO = der(0x30,
        UNO,
        der(0x30, der(0x30, der(0x31, der(0x30, oid("550403"), der(0x0C, "Firma finta di prova".toByteArray())))), UNO),
        SHA256,
        der(0x30, oid("2a864886f70d010101"), NULLA),
        der(0x04, ByteArray(32) { 0x5A }))

    private fun bustaDer(contenuto: ByteArray): ByteArray {
        val encap = der(0x30, oid("2a864886f70d010701"), der(0xA0, der(0x04, contenuto)))
        val signed = der(0x30, UNO, der(0x31, SHA256), encap, der(0x31, FIRMATARIO))
        return der(0x30, oid("2a864886f70d010702"), der(0xA0, signed))
    }

    private fun bustaBer(contenuto: ByteArray): ByteArray {
        val pezzi = (contenuto.indices step 1000).map { der(0x04, contenuto.copyOfRange(it, minOf(it + 1000, contenuto.size))) }.toTypedArray()
        val encap = ber(0x30, oid("2a864886f70d010701"), ber(0xA0, ber(0x24, *pezzi)))
        val signed = ber(0x30, UNO, der(0x31, SHA256), encap, der(0x31, FIRMATARIO))
        return ber(0x30, oid("2a864886f70d010702"), ber(0xA0, signed))
    }

    private fun base64Righe(b: ByteArray): ByteArray =
        (java.util.Base64.getEncoder().encodeToString(b).chunked(64).joinToString("\n") + "\n").toByteArray(Charsets.US_ASCII)
}
