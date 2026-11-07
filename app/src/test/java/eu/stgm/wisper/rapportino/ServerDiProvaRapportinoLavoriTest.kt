package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Il rapportino con più lavori dal telefono contro il server di prova vero (rapportino-lavori.md §3): tre lavori di due
 * clienti salvati senza rete partono una volta sola anche se la risposta si perde; togliere un lavoro da inviare sì,
 * uno inviato no; il no di un lavoro dice quale. Si lanciano con `node server/prove/telefono.js` (ServerDiProva.kt);
 * ogni giro usa idLocale suoi, cosi' passa anche due volte di fila.
 */
class ServerDiProvaRapportinoLavoriTest {
    private val indirizzo = ServerDiProva.indirizzo

    @get:Rule
    val cartella = TemporaryFolder()

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-lavori", "dispNome" to "prove unitarie", "app" to "telefono prove") })
    private fun entra(email: String): PonteServer = runBlocking { ponte(ponte("").accedi(email, "prova").token) }
    private val unico = System.nanoTime().toString().takeLast(7)

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
    fun `tre lavori di due clienti, senza rete e con la risposta persa, fanno un rapportino solo`() = runBlocking<Unit> {
        val p = entra("manuel@esempio.it")
        val ana = p.anagrafiche()
        // Due commesse aperte di due clienti diversi che non vogliono il progetto (Elettrodinamica lo vuole).
        val commesse = ana.commesse
            .filter { it.aperta && !it.modello && ana.cliente(it.idCliente)?.let { c -> !RegoleProgetti.progettoObbligatorio(c.nome) } == true }
            .distinctBy { it.idCliente }.take(2)
        assumeTrue("Servono due clienti senza progetto obbligatorio", commesse.size == 2)
        val (a, b) = commesse
        fun lavoro(n: Int, m: Commessa, ore: Double) = Rapportino.nuovo("Manuel Gasparotto", ServerDiProva.oggi).copy(
            idLocale = "GL-$unico-$n", idCliente = m.idCliente, cliente = ana.cliente(m.idCliente)!!.nome,
            idCommessa = m.id, commessa = m.descrizione, descrizione = "Lavoro $n $unico", oreLavoro = ore, tariffa = 40.0,
        )
        val g = Giornata("G-$unico", data = ServerDiProva.oggi, tecnico = "Manuel Gasparotto", lavori = listOf(lavoro(1, a, 3.0), lavoro(2, b, 2.0), lavoro(3, b, 1.0)))

        // Senza rete: salvato due volte, in coda un'operazione sola.
        val coda = CodaInvii(File(cartella.root, "coda.json"))
        coda.giornata(g.copy(lavori = g.lavori.take(2)))
        coda.giornata(g)
        val op = coda.tutte().single()
        val daMandare = op.giornata()!!

        // Torna la rete: parte; la risposta si perde e riparte uguale. Il server lo riconosce dall'idLocale.
        val primo = p.salvaGiornata(daMandare)
        val secondo = p.salvaGiornata(daMandare)
        assertTrue(primo.id.isNotBlank())
        assertEquals(primo.id, secondo.id)
        assertEquals(listOf("GL-$unico-1", "GL-$unico-2", "GL-$unico-3"), secondo.lavori.map { it.idLocale })
        assertEquals(listOf(1, 2, 3), secondo.lavori.map { it.posizione })
        // I lavori di un rapportino nuovo: <numero>-1, -2, -3 (rapportini.js).
        assertEquals(listOf(primo.id + "-1", primo.id + "-2", primo.id + "-3"), secondo.lavori.map { it.id })
        coda.completaGiornata(op.idOp, op.corpo, secondo.id)
        assertTrue(coda.tutte().isEmpty())
        // Letti come li legge il telefono: un rapportino con tre lavori, raggruppati dal numero.
        val delGiorno = p.rapportini(ServerDiProva.oggi, ServerDiProva.oggi).filter { it.idGiornata == primo.id && it.stato != Stato.ANNULLATO }
        assertEquals(3, delGiorno.size)
        val gruppo = Giornate.raggruppa(delGiorno) { it }.single()
        assertEquals(primo.id, gruppo.id)
        assertEquals("3 lavori · per 2 clienti", Giornate.lavoriEClienti(gruppo.voci))
        // L'invio si divide in due: un'email per cliente, ognuna coi suoi lavori.
        assertEquals(listOf(1, 2), Giornate.dividi(gruppo.voci, ana).map { it.lavori.size })

        // Togliere il terzo (da inviare): si può, e diventa annullato.
        val senzaTerzo = p.salvaGiornata(secondo.copy(lavori = secondo.lavori.take(2)))
        assertEquals(2, senzaTerzo.lavori.size)
        assertEquals(2, p.rapportini(ServerDiProva.oggi, ServerDiProva.oggi).count { it.idGiornata == primo.id && it.stato != Stato.ANNULLATO })

        // Il primo inviato: non si toglie, con la frase del server.
        p.stato(listOf(senzaTerzo.lavori[0].id), Stato.INVIATO)
        val no = rifiutato("togliere un lavoro inviato") { p.salvaGiornata(senzaTerzo.copy(lavori = senzaTerzo.lavori.drop(1))) }
        assertTrue(no.message!!, no.message!!.contains("già inviato: non si toglie"))

        // Il no di un lavoro dice quale: il telefono lo mette sulla sua scheda.
        val senzaCliente = Giornata("G2-$unico", data = ServerDiProva.oggi, lavori = listOf(lavoro(4, a, 1.0), lavoro(5, b, 1.0).copy(idCliente = "", cliente = "")))
        val e = rifiutato("lavoro senza cliente") { p.salvaGiornata(senzaCliente) }
        assertEquals(2, Giornate.erroreDelLavoro(e.message!!)?.first)

        // Senza lavori: no.
        val vuoto = rifiutato("rapportino vuoto") { p.salvaGiornata(Giornata("G3-$unico", data = ServerDiProva.oggi)) }
        assertEquals("Aggiungi almeno un lavoro", vuoto.message)
    }
}
