package eu.stgm.wisper.rapportino

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Le voci della Dashboard della fase 2 calcolate sul telefono (architettura.md
 * §13.8): servono alla visita guidata, che gira sui dati di esempio. Col server
 * vince la dashboard del server, che ha gia' queste voci.
 *
 * Urgenti: attivita' scadute (una per una fino a 3, poi una sola), preventivi
 * inviati da piu' di 15 giorni senza risposta. Questa settimana: appuntamenti e
 * sopralluoghi di oggi, attivita' di oggi e dei prossimi 7 giorni, preventivi in
 * scadenza entro 7 giorni, accettati senza commessa. Da pianificare: preventivi
 * in bozza, attivita' non assegnate.
 */
object CosaFareFase2 {
    private val IT = Locale.ITALY
    private val ORA = DateTimeFormatter.ofPattern("H:mm")

    data class Voci(
        val urgenti: List<VoceDashboard> = emptyList(),
        val settimana: List<VoceDashboard> = emptyList(),
        val pianificare: List<VoceDashboard> = emptyList(),
    )

    fun calcola(
        preventivi: List<Preventivo>,
        attivita: List<Attivita>,
        ana: Anagrafiche,
        oggi: LocalDate = LocalDate.now(),
        costi: Boolean = true,
        vedePreventivi: Boolean = true,
        /** Il collaboratore vede solo le sue attivita'. */
        soloDi: String? = null,
        conti: (Preventivo) -> Double? = { null },
    ): Voci {
        val urgenti = mutableListOf<VoceDashboard>()
        val settimana = mutableListOf<VoceDashboard>()
        val pianificare = mutableListOf<VoceDashboard>()
        val aperte = attivita.filter { !it.fatta && !it.annullata && (soloDi == null || it.assegnataA == soloDi) }
        fun commessaDi(a: Attivita) = a.idCommessa.ifBlank { a.nomeCommessa }
        fun chi(a: Attivita) = ana.utente(a.assegnataA)?.nome?.substringBefore(' ') ?: a.nomeAssegnata.substringBefore(' ')

        // ---------------------------------------------------------------- attivita'
        val scadute = aperte.filter { a -> a.giorno?.isBefore(oggi) == true }.sortedBy { it.giorno }
        if (scadute.size <= 3) {
            scadute.forEach { a ->
                urgenti += VoceDashboard(
                    tipo = "attivita", gravita = "urgente",
                    titolo = "${a.titolo} è scaduta",
                    dettaglio = listOf("Attività " + quando(a.giorno!!, oggi), commessaDi(a)).filter { it.isNotBlank() }.joinToString(" · "),
                    collegamento = Collegamento("attivita", id = a.id), unita = "",
                )
            }
        } else {
            urgenti += VoceDashboard(
                tipo = "attivita", gravita = "urgente", titolo = "${scadute.size} attività scadute",
                dettaglio = scadute.take(2).joinToString(", ") { it.titolo }, quanto = scadute.size.toDouble(), unita = "attivita",
                collegamento = Collegamento("attivita", parametri = mapOf("gruppo" to "scadute")),
            )
        }
        aperte.filter { it.conOra && it.giorno == oggi }.sortedBy { it.inizio }.forEach { a ->
            settimana += VoceDashboard(
                tipo = a.tipo, gravita = "attenzione",
                titolo = "${a.titolo} oggi alle ${a.inizio!!.format(ORA)}",
                dettaglio = listOf(chi(a), a.luogo).filter { it.isNotBlank() }.joinToString(" · "),
                collegamento = Collegamento("calendario", parametri = mapOf("giorno" to oggi.toString())), unita = "",
            )
        }
        val diOggi = aperte.filter { !it.conOra && it.giorno == oggi }
        if (diOggi.isNotEmpty()) settimana += VoceDashboard(
            tipo = "attivita", gravita = "attenzione",
            titolo = if (diOggi.size == 1) "1 attività da fare oggi" else "${diOggi.size} attività da fare oggi",
            dettaglio = diOggi.take(2).joinToString(", ") { it.titolo }, unita = "",
            collegamento = Collegamento("attivita", parametri = mapOf("gruppo" to "oggi")),
        )
        val prossime = aperte.filter { a -> a.giorno?.let { it.isAfter(oggi) && !it.isAfter(oggi.plusDays(7)) } == true }
        if (prossime.isNotEmpty()) settimana += VoceDashboard(
            tipo = "attivita", gravita = "info",
            titolo = if (prossime.size == 1) "1 attività nei prossimi 7 giorni" else "${prossime.size} attività nei prossimi 7 giorni",
            dettaglio = prossime.sortedBy { it.giorno }.take(2).joinToString(", ") { it.titolo }, unita = "",
            collegamento = Collegamento("attivita", parametri = mapOf("gruppo" to "prossimi")),
        )
        val libere = aperte.filter { it.assegnataA.isBlank() }
        if (soloDi == null && libere.isNotEmpty()) pianificare += VoceDashboard(
            tipo = "attivita", gravita = "info",
            titolo = if (libere.size == 1) "1 attività non assegnata" else "${libere.size} attività non assegnate",
            dettaglio = libere.take(2).joinToString(", ") { it.titolo },
            quanto = libere.size.toDouble(), unita = "attivita",
            collegamento = Collegamento("attivita", parametri = mapOf("nonAssegnate" to "true")),
        )

        // ---------------------------------------------------------------- preventivi
        if (vedePreventivi) {
            val vivi = preventivi.filter { !it.modello }
            // Inviati (anche scaduti) da più di 15 giorni senza risposta, come il server (§13.8).
            vivi.filter { it.statoVisto(oggi) == StatoPreventivo.INVIATO || it.statoVisto(oggi) == StatoPreventivo.SCADUTO }.forEach { p ->
                val inviato = istanteLocale(p.inviatoIl)?.toLocalDate() ?: p.data
                if (inviato != null && inviato.isBefore(oggi.minusDays(15))) {
                    val giorni = java.time.temporal.ChronoUnit.DAYS.between(inviato, oggi)
                    urgenti += VoceDashboard(
                        tipo = "preventivo", gravita = "attenzione",
                        titolo = "${etichetta(p)}: nessuna risposta da $giorni giorni",
                        dettaglio = listOfNotNull(p.oggetto, nomeCliente(p, ana), p.scadenza?.takeIf { it.isBefore(oggi) }?.let { "scaduto il " + it.format(DateTimeFormatter.ofPattern("dd/MM")) })
                            .filter { it.isNotBlank() }.joinToString(" · "),
                        quanto = giorni.toDouble(), unita = "giorni",
                        collegamento = Collegamento("preventivo", id = p.id),
                    )
                }
            }
            vivi.filter { p ->
                p.statoVisto(oggi) == StatoPreventivo.INVIATO && p.scadenza != null && !p.scadenza.isAfter(oggi.plusDays(7))
            }.sortedBy { it.scadenza }.forEach { p ->
                val giorni = java.time.temporal.ChronoUnit.DAYS.between(oggi, p.scadenza).toInt()
                settimana += VoceDashboard(
                    tipo = "preventivo", gravita = "attenzione",
                    titolo = etichetta(p) + when (giorni) { 0 -> " scade oggi"; 1 -> " scade domani"; else -> " scade fra $giorni giorni" },
                    dettaglio = nomeCliente(p, ana) + (istanteLocale(p.inviatoIl)?.toLocalDate()?.let { " · inviato il " + it.format(DateTimeFormatter.ofPattern("d MMMM", IT)) } ?: ""),
                    quanto = if (costi) conti(p) else null, unita = if (costi) "euro" else "",
                    collegamento = Collegamento("preventivo", id = p.id),
                )
            }
            vivi.filter { it.statoVisto(oggi) == StatoPreventivo.ACCETTATO && it.idCommessa.isBlank() }.forEach { p ->
                settimana += VoceDashboard(
                    tipo = "preventivo", gravita = "attenzione",
                    titolo = "${etichetta(p)}: accettato, manca la commessa",
                    dettaglio = nomeCliente(p, ana) + " · " + p.oggetto, unita = "",
                    collegamento = Collegamento("preventivo", id = p.id),
                )
            }
            val bozze = vivi.filter { it.statoVisto(oggi) == StatoPreventivo.BOZZA }
            if (bozze.isNotEmpty()) pianificare += VoceDashboard(
                tipo = "preventivo", gravita = "info",
                titolo = if (bozze.size == 1) "1 preventivo in bozza" else "${bozze.size} preventivi in bozza",
                dettaglio = bozze.take(2).joinToString(", ") { etichetta(it) + " " + it.oggetto },
                quanto = bozze.size.toDouble(), unita = "preventivi",
                collegamento = Collegamento("preventivi", parametri = mapOf("stato" to "BOZZA")),
            )
        }
        return Voci(urgenti, settimana, pianificare)
    }

    /**
     * Mette le voci nuove nella dashboard di prima: la cosa piu' urgente resta quella
     * che era (la prima), le attivita' scadute subito dopo; gli appuntamenti di oggi
     * in cima a Questa settimana; i preventivi in bozza in cima a Da pianificare.
     */
    fun unisci(d: Dashboard, v: Voci): Dashboard = d.copy(
        urgenti = d.urgenti.take(1) + v.urgenti + d.urgenti.drop(1),
        settimana = v.settimana.filter { it.tipo != "preventivo" } + d.settimana + v.settimana.filter { it.tipo == "preventivo" },
        pianificare = v.pianificare + d.pianificare,
    )

    private fun nomeCliente(p: Preventivo, ana: Anagrafiche) = ana.cliente(p.idCliente)?.nome ?: p.nomeCliente.ifBlank { p.idCliente }

    /** "PR/2026/012 rev. 1", come etichetta del server. */
    private fun etichetta(p: Preventivo) = p.etichetta.ifBlank { p.numero + if (p.revisione > 0) " rev. ${p.revisione}" else "" }

    /** "ieri", "lunedì 27", "il 3 novembre". */
    fun quando(g: LocalDate, oggi: LocalDate): String = when {
        g == oggi -> "di oggi"
        g == oggi.minusDays(1) -> "di ieri"
        g == oggi.plusDays(1) -> "domani"
        g.isAfter(oggi) && g.isBefore(oggi.plusDays(7)) -> g.format(DateTimeFormatter.ofPattern("EEEE d", IT))
        else -> "del " + g.format(DateTimeFormatter.ofPattern("d MMMM", IT))
    }
}
