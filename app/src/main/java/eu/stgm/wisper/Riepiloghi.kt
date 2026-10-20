package eu.stgm.wisper

import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

/**
 * Le cose che il sistema ricorda per non fartele riscrivere (docs/aspetto.md,
 * principio 4): le commesse di questi giorni, i km dell'ultima volta, il
 * rapportino di ieri, i giorni della settimana senza rapportino.
 */
object Riepiloghi {

    /** Una commessa (o un cliente senza commessa) usata di recente: una scheda grande al passo "Per chi". */
    data class Recente(
        val idCliente: String,
        val cliente: String,
        val gruppo: String,
        val idCommessa: String,
        val commessa: String,
    )

    /**
     * Le ultime commesse usate, la più recente prima, poi le altre commesse
     * aperte se non bastano. Una commessa chiusa non si propone più.
     */
    fun recenti(viste: List<Vista>, ana: Anagrafiche, quante: Int = 4): List<Recente> {
        val chiuse = ana.commesse.filterNot { it.aperta }.map { it.id }.toSet()
        val usate = viste.map { it.rapportino }
            .filter { it.cliente.isNotBlank() && it.idCommessa !in chiuse }
            .sortedWith(compareByDescending<Rapportino> { it.data }.thenByDescending { it.modificato })
            .distinctBy { if (it.idCommessa.isNotBlank()) it.idCommessa else "cliente:" + Anagrafiche.normalizza(it.cliente) }
            .map { r ->
                val cliente = ana.cliente(r.idCliente, r.cliente)
                Recente(r.idCliente, r.cliente, cliente?.gruppo ?: r.gruppo, r.idCommessa, r.commessa)
            }
        val altre = ana.commesse.filter { it.aperta && usate.none { u -> u.idCommessa == it.id } }
            .mapNotNull { m ->
                val c = ana.clienti.firstOrNull { it.id == m.idCliente } ?: return@mapNotNull null
                Recente(c.id, c.nome, c.gruppo, m.id, m.descrizione)
            }
        return (usate + altre).take(quante)
    }

    /** I km dell'ultimo rapportino di quella commessa, o di quel cliente. */
    fun ultimiKm(viste: List<Vista>, idCommessa: String, idCliente: String, cliente: String): Double? {
        val tutti = viste.map { it.rapportino }.sortedByDescending { it.data }
        val perCommessa = if (idCommessa.isNotBlank()) tutti.firstOrNull { it.idCommessa == idCommessa && it.km > 0 } else null
        val perCliente = tutti.firstOrNull {
            it.km > 0 && ((idCliente.isNotBlank() && it.idCliente == idCliente) ||
                Anagrafiche.normalizza(it.cliente) == Anagrafiche.normalizza(cliente))
        }
        return (perCommessa ?: perCliente)?.km
    }

    /** L'ultimo rapportino prima di oggi: è quello che "Come ieri" ricopia. */
    fun ultimo(viste: List<Vista>, oggi: LocalDate = LocalDate.now()): Rapportino? =
        viste.map { it.rapportino }.filter { it.data < oggi && it.cliente.isNotBlank() }.maxByOrNull { it.data }

    /** Il rapportino da ricopiare: stessi dati, data di oggi, niente numero, firma, foto né stato. */
    fun comeIeri(r: Rapportino, oggi: LocalDate = LocalDate.now()): Rapportino = r.soloCompilato().copy(
        idLocale = Rapportino.nuovoIdLocale(),
        data = oggi,
        gruppo = r.gruppo,
        noteInterne = "",
    )

    enum class TipoGiorno { FATTO, MANCA, OGGI, OGGI_FATTO, FUTURO }

    data class Giorno(val data: LocalDate, val ore: Double, val tipo: TipoGiorno)

    /**
     * La settimana di oggi: lunedì-venerdì, più sabato e domenica solo se hanno
     * un rapportino. Un giorno passato senza rapportino è MANCA: si vede.
     */
    fun settimana(viste: List<Vista>, oggi: LocalDate = LocalDate.now()): List<Giorno> {
        val lunedi = oggi.with(DayOfWeek.MONDAY)
        val orePerGiorno = viste.map { it.rapportino }
            .filter { !it.data.isBefore(lunedi) && it.data.isBefore(lunedi.plusDays(7)) }
            .groupBy { it.data }
            .mapValues { (_, rr) -> rr.sumOf { it.oreTotali } }
        return (0L until 7L).map { lunedi.plusDays(it) }
            .filter { d -> d.dayOfWeek.value <= 5 || orePerGiorno.containsKey(d) }
            .map { d ->
                val ore = orePerGiorno[d] ?: 0.0
                val fatto = orePerGiorno.containsKey(d)
                val tipo = when {
                    d == oggi && fatto -> TipoGiorno.OGGI_FATTO
                    d == oggi -> TipoGiorno.OGGI
                    d.isAfter(oggi) -> TipoGiorno.FUTURO
                    fatto -> TipoGiorno.FATTO
                    else -> TipoGiorno.MANCA
                }
                Giorno(d, ore, tipo)
            }
    }

    /**
     * A chi si fattura: il cliente del rapportino. Elettrodinamica e' un cliente
     * come gli altri (a tariffa fissa); il cliente finale presso cui si lavora
     * per lei non conta. Come in Wisper Ufficio.
     */
    @Suppress("UNUSED_PARAMETER")
    fun chiPaga(r: Rapportino, ana: Anagrafiche): String = r.cliente.ifBlank { "Senza cliente" }

    /** Le bozze: sono i rapportini da far firmare. */
    fun daFirmare(viste: List<Vista>): List<Vista> = viste.filter { it.rapportino.stato == Stato.BOZZA }

    fun saluto(ora: LocalTime = LocalTime.now()): String = when {
        ora.hour < 13 -> "Buongiorno"
        ora.hour < 18 -> "Buon pomeriggio"
        else -> "Buonasera"
    }
}
