package eu.stgm.wisper

import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Progetto
import eu.stgm.wisper.rapportino.RegoleProgetti
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
        /** Il progetto dell'ultimo rapportino di quella commessa, se e' ancora aperto (progetti.md §4.5). */
        val progetto: Progetto? = null,
    )

    /**
     * Le ultime commesse usate, la più recente prima, poi le altre commesse
     * aperte se non bastano. Una commessa chiusa non si propone più.
     *
     * @param conProgetti la funzione Progetti e' accesa: ogni progetto usato e' un recente a se' (la stessa commessa
     *        puo' tornare con due progetti) e i rapportini senza commessa non si propongono (il progetto la vuole).
     * @param soloClienti la funzione Commesse e' spenta (progetti.md §5): i recenti sono i clienti, uno per cliente,
     *        senza commessa.
     */
    fun recenti(viste: List<Vista>, ana: Anagrafiche, quante: Int = 4, conProgetti: Boolean = false, soloClienti: Boolean = false): List<Recente> {
        if (soloClienti) return recentiClienti(viste, ana, quante)
        val chiuse = ana.commesse.filterNot { it.aperta }.map { it.id }.toSet()
        val tutti = viste.map { it.rapportino }
        val progetti = if (conProgetti) RegoleProgetti.tutti(ana, tutti) else emptyList()
        fun progettoDi(r: Rapportino): Progetto? = if (!conProgetti) null else when {
            r.idProgetto.isNotBlank() -> progetti.firstOrNull { it.id == r.idProgetto }
            r.progettoNuovo != null -> progetti.firstOrNull { it.idLocale.isNotBlank() && it.idLocale == r.progettoNuovo.idLocale }
            else -> null
        }?.takeIf { it.aperto }
        val usate = tutti
            // Coi progetti accesi Elettrodinamica vuole la commessa; gli altri clienti no (06/11/2026).
            .filter { it.cliente.isNotBlank() && it.idCommessa !in chiuse && (!conProgetti || it.idCommessa.isNotBlank() || !RegoleProgetti.progettoObbligatorio(it.cliente)) }
            .sortedWith(compareByDescending<Rapportino> { it.data }.thenByDescending { it.modificato })
            .map { r -> r to progettoDi(r) }
            .distinctBy { (r, p) ->
                (if (r.idCommessa.isNotBlank()) r.idCommessa else "cliente:" + Anagrafiche.normalizza(r.cliente)) +
                    (if (conProgetti) "|" + (p?.id?.ifBlank { p.idLocale } ?: "") else "")
            }
            .map { (r, p) ->
                val cliente = ana.cliente(r.idCliente, r.cliente)
                Recente(r.idCliente, r.cliente, cliente?.gruppo ?: r.gruppo, r.idCommessa, r.commessa, p)
            }
        val altre = ana.commesse.filter { it.aperta && usate.none { u -> u.idCommessa == it.id } }
            .mapNotNull { m ->
                val c = ana.clienti.firstOrNull { it.id == m.idCliente } ?: return@mapNotNull null
                Recente(c.id, c.nome, c.gruppo, m.id, m.descrizione)
            }
        return (usate + altre).take(quante)
    }

    /** Commesse spenta: gli ultimi clienti dei rapportini, poi quelli delle commesse aperte se non bastano. */
    private fun recentiClienti(viste: List<Vista>, ana: Anagrafiche, quante: Int): List<Recente> {
        fun chiave(id: String, nome: String) = id.ifBlank { "nome:" + Anagrafiche.normalizza(nome) }
        val usati = viste.map { it.rapportino }
            .filter { it.cliente.isNotBlank() }
            .sortedWith(compareByDescending<Rapportino> { it.data }.thenByDescending { it.modificato })
            .map { r ->
                val cliente = ana.cliente(r.idCliente, r.cliente)
                Recente(cliente?.id ?: r.idCliente, cliente?.nome ?: r.cliente, cliente?.gruppo ?: r.gruppo, "", "")
            }
            .distinctBy { chiave(it.idCliente, it.cliente) }
        val visti = usati.map { chiave(it.idCliente, it.cliente) }.toSet()
        val altri = ana.commesse.filter { it.aperta }.mapNotNull { m -> ana.clienti.firstOrNull { it.id == m.idCliente } }
            .distinctBy { it.id }.filter { chiave(it.id, it.nome) !in visti }
            .map { Recente(it.id, it.nome, it.gruppo, "", "") }
        return (usati + altri).take(quante)
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

    /** LIBERO (fase 6): un giorno di ferie, festa o chiusura dello studio, in grigio con la parola. */
    enum class TipoGiorno { FATTO, MANCA, OGGI, OGGI_FATTO, FUTURO, LIBERO }

    data class Giorno(val data: LocalDate, val ore: Double, val tipo: TipoGiorno, val parola: String = "")

    /**
     * La settimana di oggi: lunedì-venerdì, più sabato e domenica solo se hanno
     * un rapportino. Un giorno passato senza rapportino è MANCA: si vede.
     */
    fun settimana(viste: List<Vista>, oggi: LocalDate = LocalDate.now(), liberi: Map<LocalDate, String> = emptyMap()): List<Giorno> {
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
                    d.isAfter(oggi) -> if (liberi.containsKey(d)) TipoGiorno.LIBERO else TipoGiorno.FUTURO
                    fatto -> TipoGiorno.FATTO
                    // Fase 6 (§6.5): ferie, festa o studio chiuso non sono giorni che mancano.
                    liberi.containsKey(d) -> TipoGiorno.LIBERO
                    else -> TipoGiorno.MANCA
                }
                Giorno(d, ore, tipo, liberi[d].orEmpty())
            }
    }

    /**
     * A chi si fattura: il cliente del rapportino. Elettrodinamica e' un cliente
     * come gli altri (a tariffa fissa); il cliente finale presso cui si lavora
     * per lei non conta. Come in Wisper Ufficio.
     */
    @Suppress("UNUSED_PARAMETER")
    fun chiPaga(r: Rapportino, ana: Anagrafiche): String = r.cliente.ifBlank { "Senza cliente" }

    /** I lavori da inviare (BOZZA e il FIRMATO di prima; dal 06/11/2026 niente firma). */
    fun daInviare(viste: List<Vista>): List<Vista> = viste.filter { it.rapportino.daInviare }

    fun saluto(ora: LocalTime = LocalTime.now()): String = when {
        ora.hour < 13 -> "Buongiorno"
        ora.hour < 18 -> "Buon pomeriggio"
        else -> "Buonasera"
    }
}
