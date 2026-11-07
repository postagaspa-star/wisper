package eu.stgm.wisper.rapportino

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * La dashboard calcolata sul telefono, con le regole della guida
 * (docs/gestionale/fase1-schermate.md §3): serve alla visita guidata, che gira
 * sui dati di esempio, e quando il server non l'ha ancora mandata. Quando c'e'
 * la dashboard del server, vince quella.
 *
 * Prima i problemi: oltre il budget, scadute, lavori da inviare da piu' di una
 * settimana, da fatturare dei mesi prima (la cosa piu' urgente, con i soldi).
 * Poi la settimana: giorni senza rapportino, commesse che finiscono, da fatturare
 * del mese. Poi da pianificare: commesse senza budget o senza responsabile,
 * clienti senza SDI e PEC.
 */
object CosaFare {
    private val IT = Locale.ITALY

    /**
     * @param rapportini quelli che chi e' entrato vede (col conto, per i soldi).
     * @param costi se chi e' entrato vede i soldi: senza, niente importi e niente voci di soldi.
     * @param scriveRapportini se chi e' entrato scrive rapportini: solo allora i suoi giorni senza rapportino.
     */
    fun calcola(
        ana: Anagrafiche,
        rapportini: List<Rapportino>,
        oggi: LocalDate = LocalDate.now(),
        costi: Boolean = true,
        scriveRapportini: Boolean = true,
    ): Dashboard {
        val vivi = rapportini.filter { it.stato != Stato.ANNULLATO }
        val aperte = ana.commesse.filter { it.aperta }
        val cruscotti = aperte.associateWith { Conti.cruscotto(it, vivi, ana.impostazioni, oggi, ana.clienteDi(it)) }
        fun nomeCliente(m: Commessa) = ana.cliente(m.idCliente)?.nome ?: m.idCliente
        fun dove(m: Commessa) = listOfNotNull(nomeCliente(m).takeIf { it.isNotBlank() }, ana.sede(m.idSede)?.nome).joinToString(" · ")

        // ---------------------------------------------------------------- urgenti
        val urgenti = mutableListOf<VoceDashboard>()
        if (costi) {
            // I mesi prima con qualcosa ancora da fatturare: la cosa piu' urgente, coi soldi.
            val meseOggi = YearMonth.from(oggi)
            val vecchi = vivi.filter { Conti.daFatturare(it) && YearMonth.from(it.data).isBefore(meseOggi) }
            if (vecchi.isNotEmpty()) {
                val mesi = vecchi.map { YearMonth.from(it.data) }.distinct().sorted()
                val clienti = vecchi.map { it.cliente.ifBlank { "Senza cliente" } }.distinct()
                urgenti += VoceDashboard(
                    tipo = "fatturare",
                    titolo = quanti(vecchi.size, "rapportino", "rapportini") + " " +
                        (if (mesi.size == 1) "di " + nomeMese(mesi.first()) else "dei mesi prima") +
                        (if (vecchi.size == 1) " ancora da fatturare" else " ancora da fatturare"),
                    dettaglio = clienti.take(2).joinToString(", ") + (if (clienti.size > 2) " e altri" else "") + " · " + Numeri.euro(Conti.totali(vecchi).totale),
                    quanto = null,
                    gravita = "soldi",
                    collegamento = Collegamento("fatturazione", filtro = mesi.last().toString()),
                )
            }
        }
        cruscotti.filter { (_, k) -> k.livelloOre == Conti.Livello.OLTRE }.forEach { (m, k) ->
            urgenti += VoceDashboard(
                tipo = "budget",
                titolo = "${m.descrizione.ifBlank { m.id }} è oltre il budget",
                dettaglio = "${Numeri.scrivi(k.ore)} ore su ${Numeri.scrivi(k.budgetOre ?: 0.0)} · ${nomeCliente(m)}",
                gravita = "urgente",
                collegamento = Collegamento("commessa", m.id),
            )
        }
        aperte.filter { it.finePrevista != null && it.finePrevista.isBefore(oggi) }.forEach { m ->
            val giorni = ChronoUnit.DAYS.between(m.finePrevista, oggi)
            urgenti += VoceDashboard(
                tipo = "scadenza",
                titolo = "${m.descrizione.ifBlank { m.id }} è scaduta da " + (if (giorni == 1L) "1 giorno" else "$giorni giorni"),
                dettaglio = dove(m),
                gravita = "urgente",
                collegamento = Collegamento("commessa", m.id),
            )
        }
        // 06/11/2026 (rapportino-lavori.md): niente firma. Come il server (dashboard.js): i lavori da inviare di prima di
        // sette giorni fa, non quelli che aspettano l'approvazione.
        val settimanaFa = oggi.minusDays(7)
        val vecchi = vivi.filter {
            it.daInviare && it.data.isBefore(settimanaFa) && it.statoApprovazione != "da_approvare" && it.statoApprovazione != "respinto"
        }
        if (vecchi.isNotEmpty()) {
            urgenti += VoceDashboard(
                tipo = "rapportini",
                titolo = (if (vecchi.size == 1) "1 lavoro da inviare" else "${vecchi.size} lavori da inviare") + " da più di una settimana",
                dettaglio = vecchi.map { it.cliente.substringBefore(" Srl").substringBefore(" S.r.l.").ifBlank { "Senza cliente" } }.distinct().joinToString(", "),
                gravita = "urgente",
                collegamento = Collegamento("rapportini", parametri = mapOf("quali" to "inviare", "a" to settimanaFa.toString())),
            )
        }

        // ---------------------------------------------------------------- questa settimana
        val settimana = mutableListOf<VoceDashboard>()
        if (scriveRapportini) {
            val lunedi = oggi.with(DayOfWeek.MONDAY)
            val giorniFatti = vivi.map { it.data }.toSet()
            (0L until 5L).map { lunedi.plusDays(it) }.filter { it.isBefore(oggi) && it !in giorniFatti }.forEach { d ->
                settimana += VoceDashboard(
                    tipo = "giorno",
                    titolo = d.format(DateTimeFormatter.ofPattern("EEEE d", IT)).replaceFirstChar { it.uppercase() } + " senza rapportino",
                    dettaglio = "Tocca per scriverlo",
                    gravita = "attenzione",
                    collegamento = Collegamento("nuovoRapportino", d.toString()),
                )
            }
        }
        val domenica = oggi.with(DayOfWeek.SUNDAY)
        aperte.filter { it.finePrevista != null && !it.finePrevista.isBefore(oggi) && !it.finePrevista.isAfter(domenica) }.forEach { m ->
            val k = cruscotti[m]
            val quando = if (m.finePrevista == oggi) "oggi" else m.finePrevista!!.dayOfWeek.getDisplayName(TextStyle.FULL, IT)
            settimana += VoceDashboard(
                tipo = "fine",
                titolo = "${m.descrizione.ifBlank { m.id }} finisce $quando",
                dettaglio = m.id + (k?.budgetOre?.let { " · ${Numeri.scrivi(k.ore)} ore su ${Numeri.scrivi(it)}" } ?: ""),
                gravita = "info",
                collegamento = Collegamento("commessa", m.id),
            )
        }
        if (costi) {
            val delMese = vivi.filter { Conti.daFatturare(it) && YearMonth.from(it.data) == YearMonth.from(oggi) }
            if (delMese.isNotEmpty()) {
                val clienti = delMese.map { it.idCliente.ifBlank { Anagrafiche.normalizza(it.cliente) } }.distinct().size
                settimana += VoceDashboard(
                    tipo = "fatturare",
                    titolo = "Da fatturare a " + nomeMese(YearMonth.from(oggi)),
                    dettaglio = quanti(clienti, "cliente", "clienti") + " · " + quanti(delMese.size, "rapportino", "rapportini"),
                    quanto = Conti.totali(delMese).totale,
                    gravita = "soldi",
                    collegamento = Collegamento("fatturazione"),
                )
            }
        }

        // ---------------------------------------------------------------- da pianificare
        val pianificare = mutableListOf<VoceDashboard>()
        cruscotti.filter { (m, k) -> k.budgetOre == null && m.budgetEuro == null }.forEach { (m, _) ->
            pianificare += VoceDashboard(
                tipo = "budget",
                titolo = "${m.descrizione.ifBlank { m.id }} non ha un budget",
                dettaglio = "${m.id} · ${nomeCliente(m)}",
                gravita = "info",
                collegamento = Collegamento("commessa", m.id),
            )
        }
        // Solo se ci sono utenti (il server): col foglio di prima il responsabile non esiste.
        if (ana.utenti.isNotEmpty()) {
            val senza = aperte.filter { it.idResponsabile.isBlank() }
            if (senza.isNotEmpty()) {
                pianificare += VoceDashboard(
                    tipo = "responsabile",
                    titolo = if (senza.size == 1) "1 commessa senza responsabile" else "${senza.size} commesse senza responsabile",
                    dettaglio = senza.joinToString(", ") { it.id },
                    gravita = "info",
                    collegamento = if (senza.size == 1) Collegamento("commessa", senza.first().id) else Collegamento("commesse", filtro = "responsabile"),
                )
            }
        }
        if (costi) {
            // I clienti con la partita IVA e una commessa aperta: a loro servirà la fattura elettronica.
            val conCommesse = aperte.map { it.idCliente }.toSet()
            ana.clienti.filter { it.id in conCommesse && it.partitaIva.isNotBlank() && it.codiceSdi.isBlank() && it.pec.isBlank() && ana.utenti.isNotEmpty() }
                .forEach { cl ->
                    pianificare += VoceDashboard(
                        tipo = "sdi",
                        titolo = "${cl.nome.substringBefore(" Srl").substringBefore(" S.r.l.")}: mancano codice SDI e PEC",
                        dettaglio = "Serviranno per le fatture",
                        gravita = "info",
                        collegamento = Collegamento("cliente", cl.id),
                    )
                }
        }

        val tutte = ana.commesse.filter { !it.archiviata && !it.modello }
        return Dashboard(
            urgenti = urgenti,
            settimana = settimana,
            pianificare = pianificare,
            commesse = NumeriCommesse(
                aperte = aperte.size,
                sospese = tutte.count { it.sospesa },
                inRitardo = aperte.count { it.finePrevista != null && it.finePrevista.isBefore(oggi) },
                chiuse = tutte.count { it.chiusa },
            ),
        )
    }

    private fun nomeMese(m: YearMonth): String = m.month.getDisplayName(TextStyle.FULL_STANDALONE, IT).lowercase(IT)

    private fun quanti(n: Int, uno: String, tanti: String) = if (n == 1) "1 $uno" else "$n $tanti"
}
