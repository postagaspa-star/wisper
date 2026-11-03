package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * Il telefono contro il finto Google con la porta (apps-script/Porta.gs) e un
 * server di prova vero collegato, come apps-script/prove/porta.test.js e
 * server/prove/porta.test.js: il server va a prendere il lavoro dallo script, la
 * risposta torna al telefono. Niente Google vero, niente NAS. Si lanciano in un modo solo, come le altre
 * prove col server (ServerDiProva.kt):
 *
 *     node server/prove/telefono.js            (--giri 2: due giri di fila sullo stesso server)
 *
 * che accende il finto Google col SEGRETO_SERVER e un server nuovo con WISPER_POSTINO_URL verso di lui,
 * e passa a gradle WISPER_SERVER_PROVA (casa) e WISPER_GOOGLE_PROVA (lo script).
 * Senza le due variabili queste prove si saltano.
 */
class ServerDiProvaPortaTest {
    private val casa = ServerDiProva.indirizzo
    private val google = ServerDiProva.google

    /** Un indirizzo di casa che non risponde: il telefono è fuori casa. */
    private val casaLontana = "http://127.0.0.1:9"

    @Before
    fun soloConIServer() = assumeTrue("Finto Google o server di prova spenti: prove saltate", casa.isNotBlank() && google.isNotBlank())

    private val chi = mapOf("disp" to "prova-porta", "dispNome" to "prove della porta Google", "app" to "telefono prove")
    private fun ponte(token: String, casa: String = this.casa, google: String = this.google) =
        PonteServer({ casa }, { token }, { chi }, google = { google })

    private fun entraDaFuori(email: String): String = runBlocking { ponte("", casaLontana).accedi(email, "prova").token }

    @Test
    fun `fuori casa si entra e si lavora attraverso Google, con le risposte di casa`() = runBlocking {
        val token = entraDaFuori("manuel@esempio.it")
        val fuori = ponte(token, casaLontana)
        val io = fuori.io()
        assertEquals("Manuel Gasparotto", io.utente.nome)
        assertEquals(Strade.Dove.GOOGLE, fuori.strade.dove.value)
        // Le stesse anagrafiche che da casa.
        val daGoogle = fuori.anagrafiche()
        val daCasa = ponte(token, casa, "").anagrafiche()
        assertEquals(daCasa.clienti.map { it.id }.sorted(), daGoogle.clienti.map { it.id }.sorted())
        // Marco (collaboratore, senza i soldi): il server toglie i soldi anche da Google.
        val marco = ponte(entraDaFuori("marco@esempio.it"), casaLontana)
        assertTrue(marco.rapportiniTutti().all { it.conto?.totale == null || it.conto.totale == 0.0 })
        // Un rapportino scritto fuori casa: c'è, uno solo, anche visto da casa.
        val cliente = daGoogle.clienti.first { !it.archiviato }
        val idLocale = "W-porta-" + System.currentTimeMillis()
        val oggi = ServerDiProva.oggi
        val r = Rapportino(idLocale, oggi, idCliente = cliente.id, cliente = cliente.nome, descrizione = "Dalla porta Google", oreLavoro = 2.0, tariffa = 40.0)
        val salvato = fuori.salva(r)
        val ancora = fuori.salva(r)
        assertEquals(salvato.id, ancora.id)
        val visti = ponte(token, casa, "").rapportini(oggi.minusDays(1), oggi).filter { it.idLocale == idLocale }
        assertEquals(1, visti.size)
    }

    @Test
    fun `in casa la firma del server vero sceglie casa`() = runBlocking {
        val token = entraDaFuori("laura@esempio.it")
        val p = ponte(token)
        p.io()
        assertEquals("la firma giusta: si parla col server direttamente", Strade.Dove.CASA, p.strade.dove.value)
        // Casa che smette di rispondere (si esce dalla Wi-Fi): la stessa richiesta passa da Google.
        val lontana = ponte(token, casaLontana)
        lontana.io()
        assertEquals(Strade.Dove.GOOGLE, lontana.strade.dove.value)
    }

    @Test
    fun `la stessa scrittura da Google e da casa si fa una volta sola`() = runBlocking {
        val token = entraDaFuori("manuel@esempio.it")
        val cliente = ponte(token, casa, "").anagrafiche().clienti.first { !it.archiviato }
        val nome = "Referente porta ${System.nanoTime()}"
        val ref = Referente("", cliente.id, nome, "Acquisti")
        val op = "op-porta-" + System.nanoTime()
        // Partita da Google, la risposta "persa": la coda riprova, questa volta da casa, con lo stesso id.
        val daGoogle = IdRichiesta.perOperazione(op) { ponte(token, casaLontana).salvaReferente(ref) }
        val daCasa = IdRichiesta.perOperazione(op) { ponte(token, casa, "").salvaReferente(ref) }
        assertEquals(daGoogle.id, daCasa.id)
        assertEquals(1, ponte(token, casa, "").anagrafiche().referenti.count { it.nome == nome })
        // Un'altra operazione con lo stesso contenuto è un'altra scrittura: un secondo referente.
        IdRichiesta.perOperazione(op + "-2") { ponte(token, casaLontana).salvaReferente(ref) }
        assertEquals(2, ponte(token, casa, "").anagrafiche().referenti.count { it.nome == nome })
    }

    @Test
    fun `i file passano da Google, avanti e indietro`() = runBlocking {
        val token = entraDaFuori("manuel@esempio.it")
        val fuori = ponte(token, casaLontana)
        val unico = System.nanoTime().toString()
        // Un PNG piccolo (la firma del compilatore) con caricaFile, nel corpo di exec.
        val png = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10) + ByteArray(2000) { (it % 97).toByte() }
        val f = fuori.caricaFile("firmaTecnico", png, "image/png", idFile = "F-porta-$unico")
        val (indietro, mime) = fuori.file(f.id)
        assertArrayEquals(png, indietro)
        assertEquals("image/png", mime)
        // Un documento con la strada carica (in base64 via Google): lo stesso idFile ridà lo stesso file.
        val pdf = "%PDF-1.4\n% porta google $unico\n".toByteArray() + ByteArray(300_000) { (it % 251).toByte() }
        val a = fuori.carica("Porta $unico.pdf", "application/pdf", "F-porta-doc$unico", "documento", pdf)
        val b = fuori.carica("Porta $unico.pdf", "application/pdf", "F-porta-doc$unico", "documento", pdf)
        assertTrue(a.optBoolean("ok"))
        assertEquals(a.getJSONObject("file").getString("id"), b.getJSONObject("file").getString("id"))
        assertEquals(pdf.size, a.getJSONObject("file").getInt("byte"))
    }
}
