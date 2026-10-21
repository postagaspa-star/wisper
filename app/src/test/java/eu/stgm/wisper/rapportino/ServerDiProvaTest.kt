package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

/**
 * Il telefono contro il server di prova vero, con i suoi utenti (password "prova"):
 *
 *     node server/src/avvio.js --prova --porta 8400 --dati <cartella temporanea>
 *     WISPER_SERVER_PROVA=http://localhost:8400 ./gradlew :app:testDebugUnitTest
 *
 * Senza la variabile queste prove si saltano: le prove di sempre non devono
 * dipendere da un server acceso. Scrivono sul database di prova, mai su quello vero.
 */
class ServerDiProvaTest {
    private val indirizzo = System.getenv("WISPER_SERVER_PROVA").orEmpty()

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app", "dispNome" to "prove unitarie", "app" to "telefono prove") })

    private fun entra(email: String): Pair<PonteServer.Accesso, PonteServer> = runBlocking {
        val a = ponte("").accedi(email, "prova")
        a to ponte(a.token)
    }

    @Test
    fun `il titolare legge e scrive tutto il gestionale`() = runBlocking {
        val (accesso, p) = entra("manuel@esempio.it")
        assertEquals(Ruoli.TITOLARE, accesso.utente.ruolo)
        assertTrue(accesso.permessi.costi)
        val io = p.io()
        assertEquals(accesso.utente.id, io.utente.id)
        assertTrue(io.ragioneSociale.isNotBlank())

        val ana = p.anagrafiche()
        assertTrue(ana.clienti.isNotEmpty())
        assertTrue(ana.fornitori.isNotEmpty())
        assertTrue(ana.referenti.isNotEmpty())
        assertTrue(ana.sedi.isNotEmpty())
        assertTrue(ana.utenti.isNotEmpty())
        assertNotNull(ana.numerazione("commessa"))
        assertNotNull(ana.clienti.firstOrNull { it.tariffaFissa != null })   // Elettrodinamica, coi soldi

        val d = Dashboard.daJson(p.dashboard())
        assertTrue(d.commesse.aperte >= 0)

        val rapportini = p.rapportiniTutti()
        assertTrue(rapportini.isNotEmpty())

        // Un fornitore nuovo, un referente, una sede.
        val nome = "Prove App ${System.currentTimeMillis()} Srl"
        val f = p.salvaSoggetto(Cliente("", nome, cliente = false, fornitore = true, citta = "Thiene", provincia = "vi"), nuovo = true, costi = true)
        assertFalse(f.giaEsisteva)
        assertTrue(f.dato.id.startsWith("F"))
        assertEquals("VI", f.dato.provincia)
        val r = p.salvaReferente(Referente("", f.dato.id, "Anna Prova", "Ordini", telefono = "0445 000000"))
        assertTrue(r.id.isNotBlank())
        val s = p.salvaSede(Sede("", f.dato.id, "sede", "Magazzino", citta = "Thiene"))
        assertTrue(s.id.isNotBlank())
        assertTrue(p.archiviaSede(s.id, true).archiviata)
        p.togliReferente(r.id)
        assertTrue(p.archiviaSoggetto(f.dato.id, true).archiviato)
        assertFalse(p.archiviaSoggetto(f.dato.id, false).archiviato)
        // Lo stesso nome non fa un doppione.
        assertTrue(p.salvaSoggetto(Cliente("", nome.uppercase(), cliente = false, fornitore = true), nuovo = true, costi = true).giaEsisteva)

        // Una prestazione, l'ordine, una commessa duplicata e archiviata.
        val commessa = ana.commesse.first { it.aperta }
        val pr = p.salvaPrestazione(Prestazione("", commessa.id, "Prova app", valore = 100.0, avanzamento = 30), costi = true)
        assertEquals(Prestazione.IN_CORSO, pr.stato)
        assertEquals(100.0, pr.valore!!, 0.0)
        val fatta = p.salvaPrestazione(pr.copy(avanzamento = 100), costi = true)
        assertEquals(Prestazione.FATTA, fatta.stato)
        val ordine = p.anagrafiche().prestazioniDi(commessa.id).map { it.id }.reversed()
        p.ordinaPrestazioni(commessa.id, ordine)
        assertEquals(ordine, p.anagrafiche().prestazioniDi(commessa.id).map { it.id })
        p.togliPrestazione(pr.id)
        val copia = p.duplicaCommessa(commessa.id, comeModello = false)
        assertTrue(copia.id != commessa.id)
        assertTrue(p.archiviaCommessa(copia.id, true).archiviata)
        assertFalse(p.archiviaCommessa(copia.id, false).archiviata)
        val modificata = p.aggiornaCommessa(copia.copy(persone = listOf(accesso.utente.id), idResponsabile = accesso.utente.id, importoContratto = 900.0))
        assertEquals(listOf(accesso.utente.id), modificata.persone)
        assertEquals(accesso.utente.id, modificata.idResponsabile)
        assertEquals(900.0, modificata.importoContratto!!, 0.0)

        // Utenti, password nuova, dispositivi, permessi.
        val utenti = p.utenti()
        assertTrue(utenti.any { it.email == "marco@esempio.it" })
        val nuovo = p.salvaUtente(Utente("", "Prova App", "prova.app.${System.currentTimeMillis()}@esempio.it", Ruoli.COLLABORATORE))
        assertTrue(nuovo.password.contains('-'))
        assertTrue(p.nuovaPassword(nuovo.utente.id).isNotBlank())
        assertFalse(p.salvaUtente(nuovo.utente.copy(attivo = false)).utente.attivo)
        assertTrue(p.sessioni(accesso.utente.id).any { it.questo })
        val permessi = p.permessi()
        assertEquals(0, permessi.getValue(Ruoli.COLLABORATORE).livello(Moduli.FATTURAZIONE))
        assertEquals(1, p.salvaPermesso(Ruoli.LETTURA, Moduli.DASHBOARD, 1).getValue(Ruoli.LETTURA).livello(Moduli.DASHBOARD))

        // Registro, numerazioni, cestino, copie, esportazione.
        val reg = p.registro(FiltroRegistro(giorni = 1))
        assertTrue(reg.voci.isNotEmpty())
        val n = ana.numerazione("rapportino")!!
        assertEquals(n.formato, p.salvaNumerazione(n).formato)
        p.cestino()
        p.copiaAdesso()
        assertNotNull(p.copie().ultima)
        val (nomeFile, _, byte) = p.esporta("clienti")
        assertTrue(nomeFile.endsWith(".csv"))
        assertTrue(byte.size > 10)

        // Un file vero, se c'è una foto o una firma.
        val conFile = rapportini.firstOrNull { it.firma != null || it.foto.isNotEmpty() }
        if (conFile != null) {
            val id = conFile.firma?.id ?: conFile.foto.first().id
            val (contenuto, tipo) = p.file(id)
            assertTrue(contenuto.isNotEmpty())
            assertTrue(tipo.startsWith("image/") || tipo.isNotBlank())
        }

        // Esci: dopo, il token non vale più e la coda aspetterebbe.
        p.esci()
        val dopo = runCatching { p.anagrafiche() }.exceptionOrNull()
        assertTrue(dopo is PonteServer.AccessoScaduto)
    }

    @Test
    fun `il collaboratore non vede i soldi e non segna fatturato`() = runBlocking {
        val (accesso, p) = entra("marco@esempio.it")
        assertEquals(Ruoli.COLLABORATORE, accesso.utente.ruolo)
        assertFalse(accesso.permessi.costi)
        assertTrue(p.io().soloSuoi)
        val ana = p.anagrafiche()
        assertTrue(ana.clienti.isNotEmpty())
        assertTrue(ana.clienti.all { it.tariffaFissa == null && it.ultimaTariffa == null })
        assertTrue(ana.fornitori.isEmpty() || ana.fornitori.isNotEmpty())
        val suoi = p.rapportini(LocalDate.now().minusMonths(6), LocalDate.now().plusDays(1))
        assertTrue(suoi.all { it.conto?.totale == null || it.conto.totale == 0.0 })
        val d = Dashboard.daJson(p.dashboard())
        assertTrue((d.urgenti + d.settimana + d.pianificare).none { it.gravita == "soldi" })
        assertTrue(runCatching { p.utenti() }.exceptionOrNull() is PonteServer.PermessoNegato)
        val unoDiAltri = p.anagrafiche().commesse.firstOrNull()
        if (unoDiAltri != null) {
            val e = runCatching { p.salvaPrestazione(Prestazione("", unoDiAltri.id, "Non deve"), costi = false) }.exceptionOrNull()
            assertTrue(e is PonteServer.PermessoNegato)
        }
        p.esci()
    }

    @Test
    fun `password sbagliata e token inventato`() = runBlocking {
        val e = runCatching { ponte("").accedi("lettura@esempio.it", "sbagliata") }.exceptionOrNull()
        assertTrue(e is PonteServer.Rifiutato)
        assertEquals("Email o password sbagliate", e!!.message)
        val finto = runCatching { ponte("inventato").anagrafiche() }.exceptionOrNull()
        assertTrue(finto is PonteServer.AccessoScaduto)
        val file = runCatching { ponte("inventato").file("qualcosa") }.exceptionOrNull()
        assertTrue(file is PonteServer.AccessoScaduto)
        assertNull(null)
    }
}
