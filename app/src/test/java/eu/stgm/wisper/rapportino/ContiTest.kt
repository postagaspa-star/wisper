package eu.stgm.wisper.rapportino

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * I conti dell'ufficio devono dire sul telefono quello che dicono sul computer:
 * qui ci sono gli stessi casi, con gli stessi numeri, di pc/prove/conti.test.js.
 * Se una prova cambia li', cambia anche qui.
 */
class ContiTest {

    private fun conto(oreTotali: Double, compenso: Double, rimborso: Double, totale: Double, euroKm: Double = 0.76) =
        Conto(oreTotali = oreTotali, tariffa = 0.0, compensoOre = compenso, rimborsoKm = rimborso, totale = totale, euroKm = euroKm)

    private val d = { s: String -> LocalDate.parse(s) }

    // Gli stessi quattro rapportini di conti.test.js.
    private val rapportini = listOf(
        Rapportino(
            idLocale = "L1", id = "RAP/2026/0001", idCliente = "C001", cliente = "Batokyo", gruppo = "Elettrodinamica",
            idCommessa = "P2601", commessa = "Magazzino", data = d("2026-07-02"), stato = Stato.FATTURATO,
            oreLavoro = 8.0, oreExtra = 0.0, oreViaggio = 1.0, km = 120.0, spese = 10.0,
            conto = conto(9.0, 240.0, 91.2, 341.2), costoOrario = 15.0, descrizione = "Collaudo quadro",
        ),
        Rapportino(
            idLocale = "L2", id = "RAP/2026/0002", idCliente = "C001", cliente = "Batokyo", gruppo = "Elettrodinamica",
            idCommessa = "P2601", commessa = "Magazzino", data = d("2026-07-15"), stato = Stato.FIRMATO,
            oreLavoro = 6.0, oreExtra = 2.0, oreViaggio = 0.0, km = 0.0, spese = 0.0,
            conto = conto(8.0, 240.0, 0.0, 240.0), costoOrario = 15.0, descrizione = "Programmazione PLC",
        ),
        Rapportino(
            idLocale = "L3", id = "RAP/2026/0003", idCliente = "C002", cliente = "Rossi", gruppo = "Privato",
            data = d("2026-08-01"), stato = Stato.BOZZA, oreLavoro = 3.0, km = 20.0,
            conto = conto(3.0, 126.0, 15.2, 141.2), costoOrario = null, tariffa = 42.0, descrizione = "Sopralluogo",
        ),
        Rapportino(
            idLocale = "L4", id = "RAP/2026/0004", idCliente = "C002", cliente = "Rossi", data = d("2026-08-02"),
            stato = Stato.ANNULLATO, conto = conto(5.0, 0.0, 0.0, 100.0, euroKm = 0.0),
        ),
    )

    private val luglio = rapportini.filter { it.data.monthValue == 7 }

    @Test
    fun `totali del mese`() {
        val t = Conti.totali(luglio)
        assertEquals(2, t.n)
        assertEquals(17.0, t.ore, 0.0)
        assertEquals(120.0, t.km, 0.0)
        assertEquals(581.2, t.totale, 0.0)
    }

    @Test
    fun `tariffa proposta, prima quella che ricorda il foglio, poi l'ultimo rapportino`() {
        assertEquals(45.0, Conti.tariffaProposta(Cliente("C002", "Rossi", ultimaTariffa = 45.0), rapportini)!!, 0.0)
        assertEquals(42.0, Conti.tariffaProposta(Cliente("C002", "Rossi"), rapportini)!!, 0.0)
        assertNull(Conti.tariffaProposta(Cliente("C009", "Nessuno"), rapportini))
    }

    @Test
    fun `la tariffa proposta e' il prezzo della commessa, se ce l'ha`() {
        val rossi = Cliente("C002", "Rossi", ultimaTariffa = 42.0)
        assertEquals(48.0, Conti.tariffaProposta(rossi, rapportini, Commessa("X", "C002", "x", prezzoOrario = 48.0))!!, 0.0)
        assertEquals(42.0, Conti.tariffaProposta(rossi, rapportini, Commessa("X", "C002", "x"))!!, 0.0)
    }

    @Test
    fun `cruscotto della commessa, valore, costo, margine, ore sul budget`() {
        val k = Conti.cruscotto(
            Commessa("P2601", "C001", "Magazzino", budgetOre = 20.0, inizio = d("2026-07-01"), finePrevista = d("2026-08-31")),
            rapportini, mapOf("EURO_KM" to "0.76", "COSTO_ORARIO" to ""), d("2026-07-31"),
        )
        assertEquals(16.0, k.ore, 0.0)                  // ore di lavoro ed extra: il viaggio no
        assertEquals(1.0, k.oreViaggio, 0.0)
        assertEquals(Conti.Livello.OK, k.livelloOre)    // 16 di 20 = 80%
        assertEquals(581.2, k.valoreAtteso, 0.0)        // niente budget in euro: quello maturato
        assertEquals(240.0, k.costo.lavoro, 0.0)        // 16 h x 15 euro/h: il viaggio e' gia' nel costo orario
        assertEquals(91.2, k.costo.auto, 0.0)           // 120 km al costo ACI
        assertEquals(10.0, k.costo.spese, 0.0)
        assertEquals(341.2, k.costo.totale, 0.0)
        assertEquals(240.0, k.margine, 0.0)
        assertEquals(341.2, k.fatturato, 0.0)
        assertEquals(240.0, k.prontoDaFatturare, 0.0)
        assertEquals(0.0, k.inBozza, 0.0)
        assertEquals(31, k.giorniMancanti)
        assertFalse(k.scaduta)
    }

    @Test
    fun `cruscotto, senza costo orario il margine non si inventa`() {
        val k = Conti.cruscotto(
            Commessa("X", "C002", "x"), listOf(rapportini[2].copy(idCommessa = "X")), mapOf("COSTO_ORARIO" to ""),
        )
        assertFalse(k.costo.lavoroNoto)
    }

    @Test
    fun `cruscotto, oltre il budget e' sforato, e il budget in euro vince se e' di piu'`() {
        val k = Conti.cruscotto(
            Commessa("P2601", "C001", "Magazzino", budgetOre = 10.0, budgetEuro = 5000.0), rapportini, mapOf("COSTO_ORARIO" to "15"),
        )
        assertEquals(Conti.Livello.OLTRE, k.livelloOre)
        assertEquals(5000.0, k.valoreAtteso, 0.0)
    }

    @Test
    fun `cruscotto, dall'85 per cento e' vicina, e una fine passata e' scaduta`() {
        val m = Commessa("P2601", "C001", "Magazzino", budgetOre = 18.0, inizio = d("2026-06-01"), finePrevista = d("2026-07-20"))
        val k = Conti.cruscotto(m, rapportini, mapOf("COSTO_ORARIO" to "15"), d("2026-07-31"))
        assertEquals(Conti.Livello.VICINA, k.livelloOre)   // 16 di 18 = 89%
        assertTrue(k.scaduta)
        assertEquals(-11, k.giorniMancanti)
        assertEquals(1.0, k.percTempo!!, 0.0)
        assertFalse(Conti.cruscotto(m.copy(stato = "CHIUSA"), rapportini, mapOf(), d("2026-07-31")).scaduta)
    }

    @Test
    fun `codice della prossima commessa, come nello script`() {
        val codici = { l: List<String> -> Anagrafiche(commesse = l.map { Commessa(it, "C1", it) }) }
        assertEquals("26ST121", codici(listOf("P2601", "26ST009", "25ST120", "M001")).prossimoCodiceCommessa(2026))
        assertEquals("27ST047", codici(listOf("26ST046")).prossimoCodiceCommessa(2027))   // il numero non riparte a gennaio
        assertEquals("26ST001", codici(emptyList()).prossimoCodiceCommessa(2026))
    }

    @Test
    fun `regole, tariffa fissa dalla scheda del cliente, km dalla commessa`() {
        val ana = Anagrafiche(impostazioni = mapOf("EURO_KM" to "0.76"))
        val elettro = Cliente("C001", "Elettrodinamica", tariffaFissa = 30.0, pagaViaggio = false, kmRimborsati = true)
        assertEquals(30.0, ana.regoleDi(elettro).tariffaFissa!!, 0.0)
        assertNull(ana.regoleDi(Cliente("C002", "Rossi")).tariffaFissa)
        assertFalse(ana.regoleDi(null).pagaViaggio)
        assertTrue(ana.regoleDi(null).kmRimborsati)
        assertEquals(0.9, ana.regoleDi(elettro, Commessa("X", "C001", "x", euroKm = 0.9)).euroKm, 0.0)
        assertEquals(0.76, ana.regoleDi(elettro, Commessa("X", "C001", "x", euroKm = null)).euroKm, 0.0)
    }

    @Test
    fun `settimane, dodici, la piu' vecchia prima, con le ore giuste`() {
        val s = Conti.settimane(rapportini, 12, d("2026-07-16"))
        assertEquals(12, s.size)
        assertEquals(d("2026-07-13"), s[11].inizio)
        assertEquals(8.0, s[11].ore, 0.0)
        assertEquals(0.0, s[10].ore, 0.0)
        assertEquals(9.0, s[9].ore, 0.0)   // 2 luglio, settimana del 29 giugno
    }

    @Test
    fun `budget della commessa, ore per prezzo, costo e margine, come nel foglio dello studio`() {
        val imp = mapOf("COSTO_ORARIO" to "18")
        // 10 h x 45 euro/h = 450 euro; 10 h x 22 euro/h = 220 euro di costo; 23 euro/h di margine.
        var b = Conti.budgetDi(Commessa("X", "C2", "x", budgetOre = 10.0, prezzoOrario = 45.0, costoOrario = 22.0), Cliente("C2", "Rossi"), imp)
        assertEquals(450.0, b.euro!!, 0.0)
        assertEquals(220.0, b.costoPrevisto!!, 0.0)
        assertEquals(23.0, b.margineOrario!!, 0.0)
        assertEquals(230.0, b.margine!!, 0.0)
        // 1300 euro a 30 euro/h (Elettrodinamica, fissa) col suo costo fisso di 22: 43,3 h e 8 euro/h di margine.
        b = Conti.budgetDi(
            Commessa("X", "C1", "x", budgetEuro = 1300.0, prezzoOrario = 50.0, costoOrario = 40.0),
            Cliente("C1", "Elettrodinamica", tariffaFissa = 30.0, costoFisso = 22.0), imp,
        )
        assertEquals("la tariffa fissa del cliente vince sul prezzo della commessa", 30.0, b.prezzo!!, 0.0)
        assertEquals("il costo fisso del cliente vince", 22.0, b.costo!!, 0.0)
        assertEquals(43.3, b.ore!!, 0.0)
        assertEquals(8.0, b.margineOrario!!, 0.0)
        // Senza costo sulla commessa ne' sul cliente: quello delle impostazioni.
        assertEquals(18.0, Conti.costoOrarioDi(Cliente("C2", "Rossi"), Commessa("X", "C2", "x", costoOrario = null), imp)!!, 0.0)
    }

    @Test
    fun `margine atteso, il valore meno i costi previsti, anche prima di cominciare`() {
        val m = Commessa("N1", "C2", "Nuova", budgetOre = 10.0, prezzoOrario = 45.0, costoOrario = 22.0)
        val rossi = Cliente("C2", "Rossi")
        val imp = mapOf("EURO_KM" to "0.76")
        var k = Conti.cruscotto(m, emptyList(), imp, d("2026-10-20"), rossi)
        assertEquals(450.0, k.valoreAtteso, 0.0)
        assertEquals(0.0, k.costo.totale, 0.0)
        assertEquals(230.0, k.margine, 0.0)                             // 450 - 10 h x 22 euro/h
        // A meta' lavoro il lavoro costa ancora quanto previsto; i km si aggiungono.
        val r = Rapportino(
            idLocale = "R1", id = "R1", idCommessa = "N1", data = d("2026-10-20"), stato = Stato.BOZZA,
            oreLavoro = 5.0, oreViaggio = 1.0, km = 50.0, costoOrario = 22.0,
            conto = Conto(oreTotali = 0.0, tariffa = 45.0, compensoOre = 0.0, rimborsoKm = 0.0, totale = 263.0, euroKm = 0.76),
        )
        k = Conti.cruscotto(m, listOf(r), imp, d("2026-10-20"), rossi)
        assertEquals(110.0, k.costo.lavoro, 0.0)
        assertEquals(192.0, k.margine, 0.0)                             // 450 - (220 + 38 di auto)
        assertTrue(k.margineDaBudget)
        // Se si sfora il budget, conta il costo vero.
        val tanti = r.copy(idLocale = "R2", id = "R2", oreLavoro = 15.0, km = 0.0, conto = r.conto!!.copy(totale = 675.0))
        k = Conti.cruscotto(m, listOf(tanti), imp, d("2026-10-20"), rossi)
        assertEquals(675.0 - 330.0, k.margine, 0.0)
    }

    @Test
    fun `riepilogo, intestatario e periodo come sul computer`() {
        val ana = Anagrafiche(
            clienti = listOf(Cliente("C001", "Batokyo", email = "a@b.it", indirizzo = "Via Roma 1", partitaIva = "01234567890")),
        )
        val uno = Conti.intestatarioRiepilogo(luglio, ana)
        assertEquals("Batokyo", uno.nome)
        assertEquals(listOf("Via Roma 1", "P.IVA 01234567890", "a@b.it"), uno.righe)
        assertFalse(uno.mostraCliente)
        val vari = Conti.intestatarioRiepilogo(rapportini.take(3), ana)
        assertEquals(Conti.VARI_CLIENTI, vari.nome)
        assertTrue(vari.mostraCliente)
        assertEquals("Luglio 2026", Conti.periodoDi(luglio))
        assertEquals("Luglio 2026 – Agosto 2026", Conti.periodoDi(rapportini.take(3)))
        assertEquals("", Conti.periodoDi(emptyList()))
        // Chi paga: prima chi ha il totale piu' alto.
        assertEquals(listOf("c:C001", "c:C002"), Conti.perChiPaga(rapportini.take(3), ana).map { it.chi.chiave })
    }
}
