package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.floor

/**
 * I conti dell'ufficio: budget e cruscotto delle commesse, le ore settimana per
 * settimana, chi paga e i totali dei riepiloghi.
 *
 * Sono quelli di Wisper Ufficio (pc/ui/conti.js), portati riga per riga, e
 * ContiTest usa gli stessi casi e gli stessi numeri di pc/prove/conti.test.js:
 * il telefono e il computer devono dire la stessa cosa della stessa commessa.
 * Se cambi qui, cambia anche li'.
 *
 * Dei rapportini contano i conti del foglio ([Rapportino.conto]). Per quelli
 * cambiati sul telefono e non ancora partiti il conto sta nella Vista: le
 * schermate passano `viste.conConti()` (Dati.kt), che lo rimette nel rapportino.
 */
object Conti {

    // ------------------------------------------------------------------ prezzo e costo di un'ora

    /** Il prezzo di un'ora della commessa: la tariffa fissa del cliente (Elettrodinamica) o quello della commessa. */
    fun prezzoOrarioDi(cliente: Cliente?, commessa: Commessa?): Double? =
        cliente?.tariffaFissa ?: commessa?.prezzoOrario

    /** Quanto costa a te un'ora: il costo fisso del cliente, poi quello della commessa, poi le impostazioni. */
    fun costoOrarioDi(cliente: Cliente?, commessa: Commessa?, impostazioni: Map<String, String>): Double? =
        cliente?.costoFisso ?: commessa?.costoOrario ?: Numeri.leggi(impostazioni[Anagrafiche.COSTO_ORARIO])

    // ------------------------------------------------------------------ budget

    /**
     * Il budget di una commessa come lo scrive lo studio. Null dove non si sa.
     * @param ore le ore previste; @param euro il budget in euro;
     * @param margineOrario prezzo - costo di un'ora (30 - 22 = 8 euro).
     */
    data class Budget(
        val ore: Double?,
        val prezzo: Double?,
        val costo: Double?,
        val euro: Double?,
        val margineOrario: Double?,
        val costoPrevisto: Double?,
        val margine: Double?,
    )

    /**
     * Ore previste x prezzo orario = budget in euro; ore x costo orario = costo
     * previsto; la differenza e' il margine. Ne bastano due fra ore, prezzo e
     * budget: il terzo si calcola.
     */
    fun budgetDi(commessa: Commessa, cliente: Cliente?, impostazioni: Map<String, String>): Budget {
        val prezzo = prezzoOrarioDi(cliente, commessa)
        val costo = costoOrarioDi(cliente, commessa, impostazioni)
        var ore = commessa.budgetOre?.takeIf { it > 0 }
        var euro = commessa.budgetEuro?.takeIf { it > 0 }
        val prezzoVero = prezzo?.takeIf { it != 0.0 }
        if (euro == null && ore != null && prezzoVero != null) euro = centesimi(ore * prezzoVero)
        if (ore == null && euro != null && prezzoVero != null) ore = decimi(euro / prezzoVero)
        val margineOrario = if (prezzo != null && costo != null) centesimi(prezzo - costo) else null
        val costoPrevisto = if (ore != null && costo != null) centesimi(ore * costo) else null
        return Budget(
            ore = ore, prezzo = prezzo, costo = costo, euro = euro,
            margineOrario = margineOrario, costoPrevisto = costoPrevisto,
            margine = if (euro != null && costoPrevisto != null) centesimi(euro - costoPrevisto) else null,
        )
    }

    fun budgetDi(commessa: Commessa, ana: Anagrafiche): Budget =
        budgetDi(commessa, ana.clienteDi(commessa), ana.impostazioni)

    // ------------------------------------------------------------------ totali

    data class Totali(
        val n: Int = 0,
        val oreLavoro: Double = 0.0,
        val oreExtra: Double = 0.0,
        val oreViaggio: Double = 0.0,
        /** Tutte le ore, viaggio compreso. */
        val ore: Double = 0.0,
        val km: Double = 0.0,
        val spese: Double = 0.0,
        val compenso: Double = 0.0,
        val rimborso: Double = 0.0,
        val totale: Double = 0.0,
    )

    /** Le somme di un elenco, arrotondate al centesimo come in conti.js. */
    fun totali(lista: List<Rapportino>): Totali {
        var t = Totali()
        lista.forEach { r ->
            t = t.copy(
                n = t.n + 1,
                oreLavoro = t.oreLavoro + r.oreLavoro,
                oreExtra = t.oreExtra + r.oreExtra,
                oreViaggio = t.oreViaggio + r.oreViaggio,
                ore = t.ore + oreTotali(r),
                km = t.km + r.km,
                spese = t.spese + r.spese,
                compenso = t.compenso + (r.conto?.compensoOre ?: 0.0),
                rimborso = t.rimborso + (r.conto?.rimborsoKm ?: 0.0),
                totale = t.totale + totale(r),
            )
        }
        return t.copy(
            oreLavoro = centesimi(t.oreLavoro), oreExtra = centesimi(t.oreExtra), oreViaggio = centesimi(t.oreViaggio),
            ore = centesimi(t.ore), km = centesimi(t.km), spese = centesimi(t.spese),
            compenso = centesimi(t.compenso), rimborso = centesimi(t.rimborso), totale = centesimi(t.totale),
        )
    }

    /** Firmati o inviati, non ancora fatturati: quello che si mette nella fattura. */
    fun daFatturare(r: Rapportino): Boolean = r.stato == Stato.FIRMATO || r.stato == Stato.INVIATO

    // ------------------------------------------------------------------ cruscotto della commessa

    /** Le ore di lavoro rispetto al budget: dall'85% si avvisa, dal 100% e' oltre (come conti.js). */
    enum class Livello { NESSUNO, OK, VICINA, OLTRE }

    /**
     * I costi finora: [lavoro] le ore (con le extra) al costo orario, [auto] i km
     * al costo ACI, [spese] come sono. [lavoroNoto] e' falso se manca il costo
     * orario: allora il margine non si inventa.
     */
    data class Costi(
        val lavoro: Double,
        val lavoroNoto: Boolean,
        val auto: Double,
        val spese: Double,
        val totale: Double,
    )

    /** Le ore di una settimana, da lunedi'. */
    data class Settimana(val inizio: LocalDate, val ore: Double)

    data class Cruscotto(
        /** I rapportini della commessa, senza gli annullati. */
        val rapportini: List<Rapportino>,
        val totali: Totali,
        /** Le ore di lavoro, extra comprese: il viaggio no. Sono quelle che si confrontano col budget. */
        val ore: Double,
        val oreViaggio: Double,
        val budgetOre: Double?,
        val previsto: Budget,
        /** ore / budgetOre: 0,8 = 80%. Null senza budget di ore. */
        val percOre: Double?,
        val livelloOre: Livello,
        /** Quanto tempo e' passato fra inizio e fine prevista, da 0 a 1. Null se mancano le date. */
        val percTempo: Double?,
        /** Giorni alla fine prevista (negativi se e' passata). Null se mancano le date. */
        val giorniMancanti: Int?,
        /** La fine prevista e' passata e la commessa non e' chiusa. */
        val scaduta: Boolean,
        /** Quello che i rapportini hanno maturato finora. */
        val valoreMaturato: Double,
        /** Il budget in euro, o il maturato se e' di piu'. */
        val valoreAtteso: Double,
        val costo: Costi,
        /** Il lavoro costa almeno quanto previsto dal budget anche prima di farlo; se si e' speso di piu', conta quello. */
        val costoAtteso: Double,
        /** Vero quando nel margine c'e' anche il costo previsto dal budget, non ancora speso. */
        val margineDaBudget: Boolean,
        /** I soldi che restano: valore atteso meno costi attesi. */
        val margine: Double,
        val percMargine: Double?,
        val fatturato: Double,
        /** Firmati e inviati, non ancora fatturati. */
        val prontoDaFatturare: Double,
        val inBozza: Double,
        /** Le ultime 12 settimane, la piu' vecchia prima. */
        val settimane: List<Settimana>,
    )

    /**
     * Il cruscotto di una commessa, come in Wisper Ufficio:
     *  - valore atteso: il budget in euro, o quello che i rapportini hanno gia'
     *    maturato se e' di piu';
     *  - costo sostenuto: le ore di lavoro al costo orario (quello scritto nel
     *    rapportino quando e' nato, altrimenti quello di oggi), l'auto al costo
     *    ACI, le spese. Le ore di viaggio no: il costo orario le comprende gia';
     *  - margine atteso: il valore atteso meno i costi attesi;
     *  - fatturazione: fatturato / pronto da fatturare (firmati e inviati) / in bozza.
     */
    fun cruscotto(
        commessa: Commessa,
        rapportini: List<Rapportino>,
        impostazioni: Map<String, String>,
        oggi: LocalDate = LocalDate.now(),
        cliente: Cliente? = null,
    ): Cruscotto {
        val suoi = rapportini.filter { suaCommessa(it, commessa) && it.stato != Stato.ANNULLATO }
        val t = totali(suoi)
        val oreLavoro = centesimi(suoi.sumOf { it.oreLavoro + it.oreExtra })
        val costoDiOggi = costoOrarioDi(cliente, commessa, impostazioni)
        val euroKmDiOggi = Numeri.leggi(impostazioni[Anagrafiche.EURO_KM]) ?: 0.0
        var costoLavoro = 0.0
        var lavoroNoto = true
        var costoAuto = 0.0
        suoi.forEach { r ->
            val co = r.costoOrario ?: costoDiOggi
            if (co == null) lavoroNoto = false else costoLavoro += (r.oreLavoro + r.oreExtra) * co
            costoAuto += r.km * (r.conto?.euroKm?.takeIf { it != 0.0 } ?: euroKmDiOggi)
        }
        costoLavoro = centesimi(costoLavoro)
        costoAuto = centesimi(costoAuto)
        val costo = centesimi(costoLavoro + costoAuto + t.spese)
        val previsto = budgetDi(commessa, cliente, impostazioni)
        val budgetEuro = commessa.budgetEuro?.takeIf { it != 0.0 } ?: previsto.euro ?: 0.0
        val valoreAtteso = maxOf(budgetEuro, t.totale)
        val lavoroAtteso = if (previsto.costoPrevisto != null && lavoroNoto) maxOf(costoLavoro, previsto.costoPrevisto) else costoLavoro
        val costoAtteso = centesimi(lavoroAtteso + costoAuto + t.spese)
        val margine = centesimi(valoreAtteso - costoAtteso)

        val budgetOre = previsto.ore?.takeIf { it != 0.0 } ?: 0.0
        val percOre = if (budgetOre > 0) oreLavoro / budgetOre else null
        val livello = when {
            percOre == null -> Livello.NESSUNO
            percOre >= 1 -> Livello.OLTRE
            percOre >= 0.85 -> Livello.VICINA
            else -> Livello.OK
        }

        var percTempo: Double? = null
        var giorniMancanti: Int? = null
        val inizio = commessa.inizio
        val fine = commessa.finePrevista
        if (inizio != null && fine != null && fine.isAfter(inizio)) {
            val durata = ChronoUnit.DAYS.between(inizio, fine).toDouble()
            percTempo = (ChronoUnit.DAYS.between(inizio, oggi) / durata).coerceIn(0.0, 1.0)
            giorniMancanti = ChronoUnit.DAYS.between(oggi, fine).toInt()
        }

        fun somma(vararg stati: Stato) = centesimi(suoi.filter { it.stato in stati }.sumOf { totale(it) })

        return Cruscotto(
            rapportini = suoi,
            totali = t,
            ore = oreLavoro,
            oreViaggio = centesimi(t.ore - oreLavoro),
            budgetOre = budgetOre.takeIf { it != 0.0 },
            previsto = previsto,
            percOre = percOre,
            livelloOre = livello,
            percTempo = percTempo,
            giorniMancanti = giorniMancanti,
            scaduta = fine != null && oggi.isAfter(fine) && !commessa.chiusa,
            valoreMaturato = t.totale,
            valoreAtteso = valoreAtteso,
            costo = Costi(costoLavoro, lavoroNoto, costoAuto, t.spese, costo),
            costoAtteso = costoAtteso,
            margineDaBudget = lavoroAtteso > costoLavoro,
            margine = margine,
            percMargine = if (valoreAtteso > 0) margine / valoreAtteso else null,
            fatturato = somma(Stato.FATTURATO),
            prontoDaFatturare = somma(Stato.FIRMATO, Stato.INVIATO),
            inBozza = somma(Stato.BOZZA),
            settimane = settimane(suoi, 12, oggi),
        )
    }

    fun cruscotto(commessa: Commessa, rapportini: List<Rapportino>, ana: Anagrafiche, oggi: LocalDate = LocalDate.now()): Cruscotto =
        cruscotto(commessa, rapportini, ana.impostazioni, oggi, ana.clienteDi(commessa))

    /** Le ore delle ultime [n] settimane (da lunedi'), la piu' vecchia prima. */
    fun settimane(rapportini: List<Rapportino>, n: Int = 12, oggi: LocalDate = LocalDate.now()): List<Settimana> {
        val lunedi = oggi.with(DayOfWeek.MONDAY)
        return (n - 1 downTo 0).map { i ->
            val inizio = lunedi.minusWeeks(i.toLong())
            val fine = inizio.plusDays(6)
            val ore = rapportini.filter { !it.data.isBefore(inizio) && !it.data.isAfter(fine) }.sumOf { oreTotali(it) }
            Settimana(inizio, centesimi(ore))
        }
    }

    // ------------------------------------------------------------------ chi paga e riepiloghi

    /**
     * Chi paga un rapportino, cioe' a chi si fattura: il suo cliente.
     * Elettrodinamica e' un cliente come gli altri (a tariffa fissa); il cliente
     * finale presso cui si lavora per lei non conta. Come chiPaga() in app.js.
     * @param chiave per raggruppare; @param righe indirizzo, partita IVA, email (le vuote no).
     */
    data class ChiPaga(val chiave: String, val nome: String, val email: String, val righe: List<String>)

    fun chiPaga(r: Rapportino, ana: Anagrafiche): ChiPaga {
        // Per codice soltanto, come app.js e Stampa.intestatario(): il riepilogo deve uscire uguale.
        val c = ana.cliente(r.idCliente)
        return ChiPaga(
            chiave = "c:" + r.idCliente.ifBlank { Anagrafiche.normalizza(r.cliente) },
            nome = c?.nome ?: r.cliente,
            email = c?.email.orEmpty(),
            righe = listOf(
                c?.indirizzo.orEmpty(),
                c?.partitaIva?.takeIf { it.isNotBlank() }?.let { "P.IVA $it" }.orEmpty(),
                c?.email.orEmpty(),
            ).filter { it.isNotBlank() },
        )
    }

    /** I rapportini di un cliente che paga, col loro totale. */
    data class PerChiPaga(val chi: ChiPaga, val rapportini: List<Rapportino>, val totale: Double)

    /** Raggruppati per chi paga, quello col totale piu' alto prima. */
    fun perChiPaga(lista: List<Rapportino>, ana: Anagrafiche): List<PerChiPaga> {
        val gruppi = LinkedHashMap<String, Pair<ChiPaga, MutableList<Rapportino>>>()
        lista.forEach { r ->
            val chi = chiPaga(r, ana)
            gruppi.getOrPut(chi.chiave) { chi to mutableListOf() }.second.add(r)
        }
        return gruppi.values.map { (chi, rr) -> PerChiPaga(chi, rr, totali(rr).totale) }.sortedByDescending { it.totale }
    }

    /**
     * A chi e' intestato il riepilogo: il cliente, se e' uno solo; altrimenti
     * (Stesso risultato di Stampa.intestatario(), che lo calcola dal JSON per il PDF.)
     * "Vari clienti", e nelle righe si vede di chi e' ognuna ([mostraCliente]).
     */
    data class Intestatario(
        val nome: String,
        val righe: List<String> = emptyList(),
        val email: String = "",
        val mostraCliente: Boolean = false,
    ) {
        /** Nella forma che riepilogo() di pc/ui/documenti.js si aspetta. */
        fun aJson(): JSONObject = JSONObject()
            .put("nome", nome).put("righe", JSONArray(righe)).put("email", email).put("mostraCliente", mostraCliente)
    }

    fun intestatarioRiepilogo(lista: List<Rapportino>, ana: Anagrafiche): Intestatario {
        val gruppi = perChiPaga(lista, ana)
        if (gruppi.size == 1) {
            val chi = gruppi[0].chi
            return Intestatario(chi.nome, chi.righe, chi.email, mostraCliente = false)
        }
        return Intestatario(VARI_CLIENTI, emptyList(), "", mostraCliente = true)
    }

    /** Il rapportino singolo va al suo cliente (o, senza la sua email, a chi paga): come preparaInvio() del computer. */
    fun intestatarioRapportino(r: Rapportino, ana: Anagrafiche): Intestatario {
        val c = ana.cliente(r.idCliente)
        return Intestatario(r.cliente, emptyList(), c?.email?.takeIf { it.isNotBlank() } ?: chiPaga(r, ana).email, false)
    }

    const val VARI_CLIENTI = "Vari clienti"

    /** "Luglio 2026", o "Luglio 2026 – Agosto 2026" se i rapportini sono di piu' mesi. */
    fun periodoDi(lista: List<Rapportino>): String {
        val mesi = lista.map { YearMonth.from(it.data) }.distinct().sorted()
        return when (mesi.size) {
            0 -> ""
            1 -> nomeMese(mesi[0])
            else -> nomeMese(mesi.first()) + " – " + nomeMese(mesi.last())
        }
    }

    private val MESI = listOf(
        "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
        "settembre", "ottobre", "novembre", "dicembre",
    )

    /** 2026-07 -> "Luglio 2026" */
    fun nomeMese(m: YearMonth): String = MESI[m.monthValue - 1].replaceFirstChar { it.uppercase() } + " " + m.year

    /**
     * La tariffa da proporre: il prezzo della commessa, se ne ha uno; altrimenti
     * l'ultima usata per il cliente (la ricorda il foglio), o quella del suo
     * ultimo rapportino.
     */
    fun tariffaProposta(cliente: Cliente?, rapportini: List<Rapportino>, commessa: Commessa? = null): Double? {
        commessa?.prezzoOrario?.takeIf { it > 0 }?.let { return it }
        cliente?.ultimaTariffa?.takeIf { it > 0 }?.let { return it }
        if (cliente == null) return null
        return rapportini.filter { it.idCliente == cliente.id && (it.tariffa ?: 0.0) > 0 }.maxByOrNull { it.data }?.tariffa
    }

    // ------------------------------------------------------------------ interno

    private fun suaCommessa(r: Rapportino, m: Commessa): Boolean =
        r.idCommessa.isNotBlank() && (r.idCommessa.equals(m.id, ignoreCase = true) ||
            (m.codicePrecedente.isNotBlank() && r.idCommessa.equals(m.codicePrecedente, ignoreCase = true)))

    private fun oreTotali(r: Rapportino): Double = r.conto?.oreTotali ?: r.oreTotali
    private fun totale(r: Rapportino): Double = r.conto?.totale ?: 0.0

    /** Come Math.round di JavaScript: il mezzo va sempre verso l'alto. */
    private fun centesimi(n: Double): Double = floor(n * 100 + 0.5) / 100
    private fun decimi(n: Double): Double = floor(n * 10 + 0.5) / 10
}
