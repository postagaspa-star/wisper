package eu.stgm.wisper.rapportino

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

/**
 * La fase 2 contro il server di prova vero (architettura.md §13), come
 * ServerDiProvaTest:
 *
 *     node server/src/avvio.js --prova --porta 8401 --dati <cartella temporanea>
 *     WISPER_SERVER_PROVA=http://localhost:8401 ./gradlew :app:testDebugUnitTest
 *
 * Senza la variabile si saltano. Scrivono sul database di prova.
 */
class ServerDiProvaFase2Test {
    private val indirizzo = System.getenv("WISPER_SERVER_PROVA").orEmpty()

    @Before
    fun soloColServer() = assumeTrue("Server di prova spento: prove saltate", indirizzo.isNotBlank())

    private fun ponte(token: String) = PonteServer({ indirizzo }, { token }, { mapOf("disp" to "prova-app-2", "dispNome" to "prove unitarie", "app" to "telefono prove") })

    private fun entra(email: String): Pair<PonteServer.Accesso, PonteServer> = runBlocking {
        val a = ponte("").accedi(email, "prova")
        a to ponte(a.token)
    }

    @Test
    fun `i conti del telefono sono quelli del server su ogni preventivo`() = runBlocking {
        val (_, p) = entra("manuel@esempio.it")
        val elenco = p.preventivi(modelli = true)
        assertTrue(elenco.isNotEmpty())
        for (x in elenco) {
            val completo = p.preventivo(x.id)
            val server = completo.contiServer ?: continue
            val telefono = ContiPreventivo.calcola(completo.copy(contiServer = null), eppiPredefinito = 0.0, ivaPredefinita = 0.0)
            assertEquals("${completo.etichetta}: imponibile", server.imponibile, telefono.imponibile, 0.0)
            assertEquals("${completo.etichetta}: totale", server.totale, telefono.totale, 0.0)
            assertEquals("${completo.etichetta}: resto", server.restoScadenze, telefono.restoScadenze, 0.0)
            completo.sezioni.forEachIndexed { i, s -> assertEquals("${completo.etichetta}: sezione ${i + 1}", s.subtotaleServer!!, telefono.subtotali[i], 0.0) }
            completo.voci.forEachIndexed { i, v -> assertEquals("${completo.etichetta}: conta ${v.descrizione}", v.contaServer, telefono.contano[i]) }
        }
        p.esci()
    }

    @Test
    fun `un preventivo dalla bozza alla commessa`() = runBlocking {
        val (_, p) = entra("manuel@esempio.it")
        val ana = p.anagrafiche()
        val cliente = ana.clienti.first()
        assertNotNull(ana.numerazione("preventivo"))
        val listino = p.listino()
        assertTrue(listino.size >= 8)

        // Una bozza nuova: una sezione, una voce dal listino col prezzo, una facoltativa, due alternative.
        val bozza = p.salvaPreventivo(
            Preventivo(
                idCliente = cliente.id, oggetto = "Prova dell'app ${System.currentTimeMillis()}",
                sezioni = listOf(SezionePreventivo(PonteServer.NUOVO + "s", "Progetto", listOf(
                    VocePreventivo(PonteServer.NUOVO + "1", "Progetto esecutivo", prezzo = 1000.0),
                    VocePreventivo(PonteServer.NUOVO + "2", "Direzione lavori", ModoVoce.ORE, 10.0, "ore", 45.0),
                    VocePreventivo(PonteServer.NUOVO + "3", "DiRi", prezzo = 400.0, facoltativa = true),
                    VocePreventivo(PonteServer.NUOVO + "4", "Collaudo A", prezzo = 300.0, alternativa = "collaudo", scelta = true),
                    VocePreventivo(PonteServer.NUOVO + "5", "Collaudo B", prezzo = 500.0, alternativa = "collaudo"),
                ))),
                scadenzePagamento = listOf(ScadenzaPagamento("", "Metà alla firma", valore = 50.0), ScadenzaPagamento("", "Saldo", valore = 50.0, quando = ScadenzaPagamento.FINE)),
            ),
            costi = true,
        )
        assertTrue(bozza.numero.startsWith("PR/"))
        assertTrue(bozza.bozza)
        assertEquals(1750.0, bozza.conto().imponibile, 0.0)
        assertEquals(ContiPreventivo.calcola(bozza.copy(contiServer = null), 0.0, 0.0).totale, bozza.conto().totale, 0.0)
        assertTrue(bozza.mancanoServer!!.any { it.campo == "complessita" })

        // Cambiata: complessità e oneri; le sezioni intere tornano con i loro id.
        val cambiata = p.salvaPreventivo(bozza.copy(complessita = "media", oneriPrevisti = "Pratiche a carico del cliente"), costi = true)
        assertEquals("media", cambiata.complessita)
        assertEquals(bozza.voci.map { it.id }, cambiata.voci.map { it.id })

        // Segnato inviato: se manca qualcosa per la legge chiede conferma.
        val inviato = try {
            p.segnaInviato(cambiata.id)
        } catch (e: PonteServer.DaConfermare) {
            assertTrue(e.risposta.has("mancano"))
            p.segnaInviato(cambiata.id, conferma = true)
        }
        assertEquals(StatoPreventivo.INVIATO, inviato.stato)
        // Dopo l'invio i prezzi non cambiano.
        assertTrue(runCatching { p.salvaPreventivo(inviato.copy(oggetto = "Altro"), costi = true) }.exceptionOrNull() is PonteServer.Rifiutato)

        // Accettato a voce con la DiRi e il collaudo B: i conti si rifanno con le scelte.
        val voci = inviato.voci
        val scelte = mapOf(voci[2].id to true, voci[4].id to true, voci[3].id to false)
        val accettato = p.accettaPreventivo(inviato.id, "voce", "Prova App", scelte)
        assertEquals(StatoPreventivo.ACCETTATO, accettato.stato)
        assertEquals(1000.0 + 450 + 400 + 500, accettato.conto().imponibile, 0.0)
        assertEquals(ContiPreventivo.calcola(accettato.copy(contiServer = null), 0.0, 0.0).totale, accettato.conto().totale, 0.0)

        // La commessa, una volta sola.
        val nata = p.creaCommessaDaPreventivo(accettato.id)
        assertEquals(accettato.conto().imponibile, nata.commessa.importoContratto!!, 0.0)
        assertEquals(10.0, nata.commessa.budgetOre!!, 0.0)
        assertEquals(4, nata.prestazioni.size)
        assertEquals(nata.commessa.id, nata.preventivo?.idCommessa ?: p.preventivo(accettato.id).idCommessa)
        assertTrue(runCatching { p.creaCommessaDaPreventivo(accettato.id) }.exceptionOrNull() is PonteServer.Rifiutato)

        // Duplicato come modello, e da un modello un preventivo nuovo.
        val modello = p.duplicaPreventivo(accettato.id, comeModello = true)
        assertTrue(modello.modello)
        val daModello = p.duplicaPreventivo(modello.id, comeModello = false)
        assertTrue(daModello.bozza)
        assertFalse(daModello.modello)
        p.esci()
    }

    @Test
    fun `una revisione nuova e un rifiuto`() = runBlocking {
        val (_, p) = entra("manuel@esempio.it")
        val inviato = p.preventivi(stato = StatoPreventivo.INVIATO).firstOrNull() ?: p.preventivi(stato = StatoPreventivo.SCADUTO).first()
        val rev = p.nuovaRevisione(inviato.id)
        assertEquals(inviato.revisione + 1, rev.revisione)
        assertTrue(rev.bozza)
        assertTrue(rev.revisioni.any { it.id == inviato.id && it.stato == StatoPreventivo.SOSTITUITO })
        val inviata = runCatching { p.segnaInviato(rev.id) }.getOrElse { p.segnaInviato(rev.id, conferma = true) }
        val rifiutato = p.rifiutaPreventivo(inviata.id, "Prova: troppo caro")
        assertEquals(StatoPreventivo.RIFIUTATO, rifiutato.stato)
        assertEquals("Prova: troppo caro", rifiutato.motivoRifiuto)
        val riaperto = p.riapriPreventivo(rifiutato.id)
        assertTrue(riaperto.bozza)
        p.esci()
    }

    @Test
    fun `attività, sovrapposizioni, checklist, ricorrenze`() = runBlocking {
        val (accesso, p) = entra("manuel@esempio.it")
        val io = accesso.utente.id
        val aperte = p.attivita(null, null)
        assertTrue(aperte.isNotEmpty())
        assertTrue(aperte.none { it.fatta || it.annullata })
        val oggi = LocalDate.now()
        val periodo = p.attivita(oggi.minusDays(30), oggi.plusDays(30))
        assertTrue(periodo.all { it.giorno != null })

        // Un appuntamento fra cinque settimane, poi uno che lo accavalla: chiede conferma.
        val giorno = oggi.plusWeeks(5)
        val primo = p.salvaAttivita(Attivita("", "Prova app: riunione", tipo = TipoAttivita.APPUNTAMENTO, inizio = giorno.atTime(9, 0), fine = giorno.atTime(10, 0), assegnataA = io,
            checklist = listOf(VoceChecklist("", "Portare lo schema"))))
        assertTrue(primo.conOra)
        assertEquals(1, primo.checklist.size)
        val sopra = Attivita("", "Prova app: telefonata", tipo = TipoAttivita.APPUNTAMENTO, inizio = giorno.atTime(9, 30), fine = giorno.atTime(10, 30), assegnataA = io)
        val e = runCatching { p.salvaAttivita(sopra) }.exceptionOrNull()
        assertTrue(e is PonteServer.DaConfermare)
        assertTrue((e as PonteServer.DaConfermare).risposta.has("sovrapposte"))
        val secondo = p.salvaAttivita(sopra, conferma = true)
        assertTrue(secondo.id.isNotBlank())

        // Checklist, fatta, di nuovo da fare, annullata.
        val spuntata = p.spuntaChecklist(primo.checklist.single().id, true)
        assertTrue(spuntata!!.checklist.single().fatta)
        assertTrue(p.faiAttivita(primo.id, true).fatta)
        assertFalse(p.faiAttivita(primo.id, false).fatta)
        p.togliAttivita(secondo.id)
        assertTrue(p.attivita(null, null).none { it.id == secondo.id })

        // Una ricorrente ogni settimana: si salta solo un'occorrenza.
        val serie = p.salvaAttivita(Attivita("", "Prova app: controllo", scadenza = giorno, assegnataA = io, ricorrenza = Ricorrenza(Ricorrenza.SETTIMANE)))
        assertTrue(serie.ricorrente)
        val occorrenze = p.attivita(giorno, giorno.plusWeeks(3)).filter { it.idRicorrenza == serie.idRicorrenza }
        assertTrue(occorrenze.size >= 3)
        p.togliAttivita(occorrenze[1].id, "questa")
        val dopo = p.attivita(giorno, giorno.plusWeeks(3)).filter { it.idRicorrenza == serie.idRicorrenza }
        assertEquals(occorrenze.size - 1, dopo.size)
        // Cambiata da questa in poi: le altre prendono il titolo nuovo.
        p.salvaAttivita(dopo.first().copy(titolo = "Prova app: controllo estintori"), perRicorrenza = "tutte", conRicorrenza = false)
        assertTrue(p.attivita(giorno, giorno.plusWeeks(3)).filter { it.titolo == "Prova app: controllo estintori" }.size >= 2)
        p.togliAttivita(dopo.first().id, "tutte")
        p.togliAttivita(primo.id)
        p.esci()
    }

    @Test
    fun `il collaboratore niente preventivi, le attività solo sue o libere`() = runBlocking {
        val (accesso, p) = entra("marco@esempio.it")
        assertTrue(runCatching { p.preventivi() }.exceptionOrNull() is PonteServer.PermessoNegato)
        val sue = p.attivita(null, null)
        assertTrue(sue.all { it.assegnataA == accesso.utente.id || it.assegnataA.isBlank() || it.creataDa == accesso.utente.id || it.idCommessa.isNotBlank() })
        // Assegnarla a un altro non si può.
        val altro = p.anagrafiche().utenti.firstOrNull { it.id != accesso.utente.id }
        if (altro != null) {
            val e = runCatching { p.salvaAttivita(Attivita("", "Non deve", assegnataA = altro.id)) }.exceptionOrNull()
            assertTrue(e is PonteServer.PermessoNegato)
        }
        val mia = p.salvaAttivita(Attivita("", "Prova app: mia", assegnataA = accesso.utente.id, scadenza = LocalDate.now().plusDays(3)))
        assertEquals(accesso.utente.id, mia.assegnataA)
        p.togliAttivita(mia.id)
        val d = Dashboard.daJson(p.dashboard())
        assertTrue((d.urgenti + d.settimana + d.pianificare).none { it.tipo == "preventivo" })
        p.esci()
    }
}
