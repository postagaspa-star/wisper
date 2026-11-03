package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * I progetti del telefono contro il server di prova vero (progetti.md §2-§6): creare con i nomi giusti
 * (codiceProgetto), il codice proposto uguale fra telefono e server, il rapportino col progetto scelto e con quello
 * nato sul telefono (una volta sola), la scheda, chiudi e riapri, togli solo senza rapportini, i permessi, e le
 * versioni in ogni risposta. Si lanciano con `node server/prove/telefono.js` (ServerDiProva.kt); ogni giro usa codici
 * suoi, cosi' passa anche due volte di fila.
 */
class ServerDiProvaProgettiTest {
    private val indirizzo = ServerDiProva.indirizzo

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-progetti", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }
    private val unico = System.nanoTime().toString().takeLast(6)

    private suspend fun <T> rifiutato(cosa: String, lavoro: suspend () -> T): PonteServer.Rifiutato {
        try {
            lavoro()
        } catch (e: PonteServer.Rifiutato) {
            return e
        }
        fail("$cosa: doveva dire di no")
        throw IllegalStateException()
    }

    @Test
    fun `progetti dal telefono come progetti md, col codice proposto uguale al server`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val a = AzioniProgetti(p)
        val ana0 = p.anagrafiche()
        val commessa = ana0.commessa("26ST001") ?: ana0.commesse.first { it.aperta && !it.modello }
        val cliente = ana0.cliente(commessa.idCliente)!!
        val pre = "Q$unico-"
        val p1 = a.crea(commessa.id, pre + "001", false, "Rossi Srl", "Quadro QE1 $unico").dato
        assertEquals(listOf(pre + "001", "Rossi Srl", "APERTO", commessa.id), listOf(p1.codice, p1.intestatoA, p1.stato, p1.idCommessa))
        val p2 = a.crea(commessa.id, pre + "002", false, "", "Cabina $unico").dato
        // Il server propone il terzo; il telefono, con le anagrafiche, propone lo stesso (anche senza rete).
        val server = a.codice(commessa.id)
        assertEquals(pre + "003", server.codice)
        val ana = p.anagrafiche()
        assertTrue(ana.progetti.any { it.id == p1.id && it.codice == pre + "001" })
        assertEquals(server.codice, RegoleProgetti.codiceProposto(ana, emptyList(), commessa.id, cliente.id, ServerDiProva.oggi))
        // Una commessa che nasce col rapportino (non c'e' ancora): il server non rifiuta e propone dal cliente, come il telefono.
        val nuovaCommessa = "NUOVA$unico"
        assertEquals(pre + "003", a.codice(nuovaCommessa, cliente.id).codice)
        assertEquals(pre + "003", RegoleProgetti.codiceProposto(ana, emptyList(), nuovaCommessa, cliente.id, ServerDiProva.oggi))
        // Gia' preso per questo cliente: no, con la frase del server.
        val doppio = rifiutato("codice gia' preso") { a.crea(commessa.id, (pre + "002").lowercase(), false, "", "X") }
        assertEquals("Il codice ${(pre + "002").lowercase()} è già di un altro progetto di questo cliente", doppio.message)

        // Il rapportino col progetto scelto: torna con codice, descrizione e intestatario.
        val base = Rapportino.nuovo("Manuel Gasparotto", ServerDiProva.oggi).copy(
            idCliente = cliente.id, cliente = cliente.nome, idCommessa = commessa.id, commessa = commessa.descrizione,
            descrizione = "Cablaggio $unico", oreLavoro = 3.0, tariffa = 40.0,
        )
        val r1 = p.salva(base.copy(idLocale = "prog-r1-$unico", idProgetto = p1.id, progetto = p1.codice))
        assertEquals(listOf(p1.id, pre + "001", "Quadro QE1 $unico", "Rossi Srl"), listOf(r1.idProgetto, r1.progetto, r1.progettoDescrizione, r1.progettoIntestatoA))

        // Nato sul telefono senza rete, col codice proposto: il server lo crea; rimandato, non ne fa un secondo.
        val n = ProgettoNuovo(ProgettoNuovo.nuovoIdLocale(), server.codice, true, "Bianchi Spa", "Linea 2 $unico")
        val r2 = p.salva(base.copy(idLocale = "prog-r2-$unico", progetto = n.codice, progettoNuovo = n))
        assertEquals(pre + "003", r2.progetto)
        assertEquals("Bianchi Spa", r2.progettoIntestatoA)
        val ancora = p.salva(base.copy(idLocale = "prog-r2-$unico", progetto = n.codice, progettoNuovo = n))
        assertEquals(r2.idProgetto, ancora.idProgetto)
        // Un secondo rapportino in coda con lo stesso progetto nato sul telefono: lo stesso progetto.
        val r3 = p.salva(base.copy(idLocale = "prog-r3-$unico", progetto = n.codice, progettoNuovo = n))
        assertEquals(r2.idProgetto, r3.idProgetto)
        assertEquals(1, a.elenco(commessa.id).count { it.idLocale == n.idLocale })

        // La scheda: i rapportini del progetto; chiudi e riapri; togli solo senza rapportini.
        val (scheda, suoi) = a.scheda(p1.id)
        assertEquals(1, scheda.rapportini)
        assertEquals(listOf("prog-r1-$unico"), suoi.map { it.idLocale })
        assertEquals("CHIUSO", a.aggiorna(p1.id, mapOf("stato" to Progetto.CHIUSO)).stato)
        assertEquals("APERTO", a.aggiorna(p1.id, mapOf("stato" to Progetto.APERTO)).stato)
        assertEquals("Il progetto ha dei rapportini: non si toglie, si chiude", rifiutato("togli con rapportini") { a.togli(p1.id) }.message)
        assertEquals("Il progetto ha già dei rapportini: la commessa non si cambia",
            rifiutato("commessa cambiata con rapportini") { a.aggiorna(p1.id, mapOf("idCommessa" to (ana.commesse.firstOrNull { it.id != commessa.id && it.aperta }?.id ?: "26ST002"))) }.message)
        a.togli(p2.id)
        assertTrue(a.elenco(commessa.id).none { it.id == p2.id })
        assertTrue(a.elenco(cerca = "Bianchi Spa").any { it.idLocale == n.idLocale })
    }

    @Test
    fun `lettura e collaboratore vedono i progetti ma non li creano, nemmeno dal rapportino`() = runBlocking<Unit> {
        val lettura = entra("lettura@esempio.it")
        AzioniProgetti(lettura).elenco()
        val e = rifiutato("lettura che crea") { AzioniProgetti(lettura).crea("26ST001", "L-$unico", false, "", "X") }
        assertTrue(e is PonteServer.PermessoNegato)
        val marco = entra("marco@esempio.it")
        assertEquals(1, marco.io().permessi.livello(Moduli.PROGETTI))
        val ana = marco.anagrafiche()
        val commessa = ana.commessa("26ST001") ?: ana.commesse.first()
        val cl = ana.cliente(commessa.idCliente)
        val r = Rapportino.nuovo("Marco Rossato", ServerDiProva.oggi).copy(
            idLocale = "marco-prog-$unico", idCliente = commessa.idCliente, cliente = cl?.nome ?: "Cliente", idCommessa = commessa.id,
            descrizione = "Prova $unico", oreLavoro = 1.0, progettoNuovo = ProgettoNuovo(ProgettoNuovo.nuovoIdLocale(), "M-$unico", false, "", "Nuovo"),
        )
        assertTrue(rifiutato("collaboratore che crea dal rapportino") { marco.salva(r) } is PonteServer.PermessoNegato)
    }

    @Test
    fun `ogni risposta del server di prova porta le versioni (se il server le ha lette)`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val grezzo = p.leggiAzione("io")
        // Senza elenco delle versioni (il server di prova non va su GitHub) il pezzo puo' mancare: allora niente annuncio.
        val v = grezzo.optJSONObject("versioni")
        if (v != null) {
            assertNotNull(Versioni.daJson(v))
            assertEquals(v.optInt("giro"), AnnuncioVersioni.ultime?.giro)
        }
    }
}
