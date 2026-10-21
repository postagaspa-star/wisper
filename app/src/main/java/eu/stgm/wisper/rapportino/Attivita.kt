package eu.stgm.wisper.rapportino

import org.json.JSONArray
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/*
 * Le attivita' e il calendario della fase 2 (docs/gestionale/fase2.md §3, §5):
 * attivita' da fare con una scadenza, appuntamenti e sopralluoghi con l'ora,
 * priorita', promemoria, checklist, ricorrenze. Qui i dati e le regole per
 * metterle in fila (Scadute, Oggi, Prossimi giorni, Senza data) e per trovare i
 * buchi liberi della giornata.
 */

object TipoAttivita {
    const val ATTIVITA = "attivita"
    const val APPUNTAMENTO = "appuntamento"
    const val SOPRALLUOGO = "sopralluogo"

    val ELENCO = listOf(ATTIVITA, APPUNTAMENTO, SOPRALLUOGO)

    fun nome(tipo: String): String = when (tipo) {
        APPUNTAMENTO -> "Appuntamento"
        SOPRALLUOGO -> "Sopralluogo"
        else -> "Attività"
    }

    fun da(testo: String?): String = when (testo?.trim()?.lowercase()) {
        APPUNTAMENTO -> APPUNTAMENTO
        SOPRALLUOGO -> SOPRALLUOGO
        else -> ATTIVITA
    }
}

object StatoAttivita {
    const val DA_FARE = "da_fare"
    const val IN_CORSO = "in_corso"
    const val FATTA = "fatta"
    const val ANNULLATA = "annullata"
}

object Priorita {
    const val ALTA = "alta"
    const val NORMALE = "normale"
    const val BASSA = "bassa"

    fun nome(p: String): String = when (p) {
        ALTA -> "Alta"
        BASSA -> "Bassa"
        else -> "Normale"
    }
}

/** Una voce della checklist di un'attivita'. */
data class VoceChecklist(val id: String = "", val testo: String, val fatta: Boolean = false, val ordine: Int = 0) {
    fun aJson(): JSONObject = JSONObject().put("id", if (id.isBlank()) JSONObject.NULL else PonteServer.idJson(id))
        .put("testo", testo).put("fatta", fatta).put("ordine", ordine)

    companion object {
        fun daJson(o: JSONObject) = VoceChecklist(o.testo("id"), o.testo("testo"), o.vero("fatta"), o.optInt("ordine", 0))
    }
}

/**
 * Come si ripete un'attivita': ogni [ogni] giorni, settimane, mesi o anni; per le
 * settimane anche in quali giorni (1 = lunedi'); fino a [fine] o per sempre.
 */
data class Ricorrenza(
    /** "giorni", "settimane", "mesi", "anni". */
    val regola: String,
    val ogni: Int = 1,
    val giorniSettimana: List<Int> = emptyList(),
    val fine: LocalDate? = null,
) {
    /** "ogni anno", "ogni 2 settimane il lunedì e il giovedì", "ogni mese fino al 31/12/2026". */
    val aParole: String
        get() {
            val unita = when (regola) {
                GIORNI -> if (ogni == 1) "giorno" else "giorni"
                SETTIMANE -> if (ogni == 1) "settimana" else "settimane"
                MESI -> if (ogni == 1) "mese" else "mesi"
                else -> if (ogni == 1) "anno" else "anni"
            }
            val base = if (ogni == 1) "ogni $unita" else "ogni $ogni $unita"
            val giorni = if (regola == SETTIMANE && giorniSettimana.isNotEmpty()) {
                val nomi = giorniSettimana.sorted().map { DayOfWeek.of(it.coerceIn(1, 7)).getDisplayName(TextStyle.FULL, Locale.ITALY) }
                " il " + if (nomi.size == 1) nomi[0] else nomi.dropLast(1).joinToString(", ") + " e il " + nomi.last()
            } else ""
            val fino = fine?.let { " fino al " + it.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) } ?: ""
            return base + giorni + fino
        }

    fun aJson(): JSONObject = JSONObject().put("regola", regola).put("ogni", ogni)
        .put("giorniSettimana", JSONArray(giorniSettimana)).put("fine", fine?.toString() ?: "")

    companion object {
        const val GIORNI = "giorni"
        const val SETTIMANE = "settimane"
        const val MESI = "mesi"
        const val ANNI = "anni"

        fun daJson(o: JSONObject?): Ricorrenza? {
            if (o == null) return null
            val regola = o.testo("regola").lowercase()
            if (regola.isBlank()) return null
            val giorni = (o.optJSONArray("giorniSettimana") ?: o.optJSONArray("giorni_settimana"))?.let { a -> (0 until a.length()).map { a.optInt(it) }.filter { it in 1..7 } }
                ?: o.primoTesto("giorniSettimana", "giorni_settimana").split(',', ' ').mapNotNull { it.trim().toIntOrNull() }.filter { it in 1..7 }
            return Ricorrenza(regola, o.optInt("ogni", 1).coerceAtLeast(1), giorni, o.data("fine"))
        }
    }
}

/** Un'attivita', un appuntamento o un sopralluogo. */
data class Attivita(
    val id: String = "",
    val titolo: String,
    val descrizione: String = "",
    val tipo: String = TipoAttivita.ATTIVITA,
    val idCliente: String = "",
    val idCommessa: String = "",
    val idPrestazione: String = "",
    /** L'utente a cui tocca; vuoto = non assegnata. */
    val assegnataA: String = "",
    val creataDa: String = "",
    val priorita: String = Priorita.NORMALE,
    val stato: String = StatoAttivita.DA_FARE,
    /** Per le attivita': il giorno entro cui farla. */
    val scadenza: LocalDate? = null,
    /** Per appuntamenti e sopralluoghi. */
    val inizio: LocalDateTime? = null,
    val fine: LocalDateTime? = null,
    val tuttoIlGiorno: Boolean = false,
    val luogo: String = "",
    /** Minuti prima dell'ora (o della scadenza, alle 9) per il promemoria; null = niente. */
    val promemoriaMinuti: Int? = null,
    val idRicorrenza: String = "",
    val ricorrenza: Ricorrenza? = null,
    /** Il giorno di questa ripetizione, per le ricorrenti. */
    val occorrenza: LocalDate? = null,
    val fattaIl: String = "",
    val checklist: List<VoceChecklist> = emptyList(),
    /** I file allegati (foto, documenti): nome e indirizzo /file/<id>. */
    val allegati: List<Documento> = emptyList(),
    val creato: String = "",
    val modificato: String = "",
    // ---- i nomi che il server mette accanto agli id (§13.6), per chi non vede le anagrafiche ----
    val nomeAssegnata: String = "",
    val nomeCliente: String = "",
    val nomeCommessa: String = "",
    /** Se chi e' entrato puo' cambiarla (un collaboratore solo le sue). */
    val puoScrivere: Boolean = true,
) {
    val fatta: Boolean get() = stato == StatoAttivita.FATTA
    val annullata: Boolean get() = stato == StatoAttivita.ANNULLATA
    val conOra: Boolean get() = tipo != TipoAttivita.ATTIVITA && inizio != null && !tuttoIlGiorno
    val ricorrente: Boolean get() = idRicorrenza.isNotBlank() || ricorrenza != null

    /** Il giorno in cui sta in calendario: quello dell'inizio, o la scadenza. */
    val giorno: LocalDate? get() = inizio?.toLocalDate() ?: scadenza ?: occorrenza

    /** Il momento del promemoria, o null. Un'attivita' senza ora ricorda alle 9 del giorno. */
    fun momentoPromemoria(): LocalDateTime? {
        val minuti = promemoriaMinuti ?: return null
        val base = when {
            conOra -> inizio
            else -> giorno?.atTime(9, 0)
        } ?: return null
        return base.minusMinutes(minuti.toLong())
    }

    fun aJson(): JSONObject = JSONObject()
        .put("id", if (id.isBlank()) JSONObject.NULL else PonteServer.idJson(id))
        .put("titolo", titolo).put("descrizione", descrizione).put("tipo", tipo)
        .put("idCliente", idCliente).put("idCommessa", idCommessa)
        .put("idPrestazione", if (idPrestazione.isBlank()) JSONObject.NULL else PonteServer.idJson(idPrestazione))
        .put("assegnataA", if (assegnataA.isBlank()) JSONObject.NULL else PonteServer.idJson(assegnataA))
        .put("priorita", priorita).put("stato", stato)
        .put("scadenza", scadenza?.toString() ?: "")
        .put("inizio", inizio?.format(ISTANTE) ?: "").put("fine", fine?.format(ISTANTE) ?: "")
        .put("tuttoIlGiorno", tuttoIlGiorno).put("luogo", luogo)
        .put("promemoriaMinuti", promemoriaMinuti ?: JSONObject.NULL)
        .put("ricorrenza", ricorrenza?.aJson() ?: JSONObject.NULL)
        .put("idRicorrenza", idRicorrenza).put("occorrenza", occorrenza?.toString() ?: "")
        .put("checklist", JSONArray().apply { checklist.forEachIndexed { i, v -> put(v.copy(ordine = i + 1).aJson()) } })
        .put("assegnata", nomeAssegnata).put("cliente", nomeCliente).put("commessa", nomeCommessa).put("puoScrivere", puoScrivere)

    /** Quello che salvaAttivita accetta (§13.7): niente nomi, niente occorrenza. [conRicorrenza] solo se la regola e' cambiata. */
    fun perSalvare(conRicorrenza: Boolean): JSONObject {
        val o = aJson()
        listOf("assegnata", "cliente", "commessa", "puoScrivere", "idRicorrenza", "occorrenza").forEach { o.remove(it) }
        if (id.isBlank()) o.remove("id")
        if (!conRicorrenza) o.remove("ricorrenza")
        o.put("checklist", JSONArray().apply {
            checklist.forEach { v ->
                val x = JSONObject().put("testo", v.testo).put("fatta", v.fatta)
                if (v.id.isNotBlank() && !v.id.startsWith(PonteServer.NUOVO)) x.put("id", PonteServer.idJson(v.id))
                put(x)
            }
        })
        return o
    }

    companion object {
        val ISTANTE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")

        private fun istante(o: JSONObject, vararg campi: String): LocalDateTime? {
            val t = o.primoTesto(*campi)
            if (t.isBlank()) return null
            return istanteLocale(t)
        }

        fun daJson(o: JSONObject): Attivita {
            val a = o.optJSONObject("attivita")?.takeIf { it.has("titolo") } ?: o
            return Attivita(
                id = a.testo("id"),
                titolo = a.testo("titolo"),
                descrizione = a.primoTesto("descrizione", "note"),
                tipo = TipoAttivita.da(a.testo("tipo")),
                idCliente = a.primoTesto("idCliente", "clienteId", "cliente_id"),
                idCommessa = a.primoTesto("idCommessa", "commessaId", "commessa_id"),
                idPrestazione = a.primoTesto("idPrestazione", "prestazioneId", "prestazione_id"),
                assegnataA = a.primoTesto("assegnataA", "assegnata_a", "idAssegnata"),
                creataDa = a.primoTesto("creataDa", "creata_da"),
                priorita = a.testo("priorita").lowercase().ifBlank { Priorita.NORMALE },
                stato = a.testo("stato").lowercase().ifBlank { StatoAttivita.DA_FARE },
                scadenza = a.data("scadenza"),
                inizio = istante(a, "inizio"),
                fine = istante(a, "fine"),
                tuttoIlGiorno = a.vero("tuttoIlGiorno") || a.vero("tutto_il_giorno"),
                luogo = a.testo("luogo"),
                promemoriaMinuti = (a.primoNumero("promemoriaMinuti", "promemoria_minuti"))?.toInt(),
                idRicorrenza = a.primoTesto("idRicorrenza", "ricorrenzaId", "ricorrenza_id"),
                ricorrenza = Ricorrenza.daJson(a.optJSONObject("ricorrenza")),
                occorrenza = a.data("occorrenza"),
                fattaIl = a.primoTesto("fattaIl", "fatta_il"),
                checklist = a.optJSONArray("checklist").oggetti().map(VoceChecklist::daJson).sortedBy { it.ordine },
                allegati = (a.optJSONArray("allegati") ?: a.optJSONArray("file")).oggetti().map { f ->
                    Documento(f.testo("id"), f.testo("nome").ifBlank { "Allegato" }, f.testo("url").ifBlank { "/file/" + f.testo("id") }, f.testo("mime"), istanteLocale(f.testo("creato")))
                },
                creato = a.testo("creato"),
                modificato = a.testo("modificato"),
                nomeAssegnata = a.testo("assegnata"),
                nomeCliente = a.testo("cliente").takeUnless { it == a.primoTesto("idCliente") }.orEmpty(),
                nomeCommessa = a.testo("commessa").takeUnless { it == a.primoTesto("idCommessa") }.orEmpty(),
                puoScrivere = if (a.has("puoScrivere")) a.vero("puoScrivere") else true,
            )
        }
    }
}

/** Le regole per mettere in fila le attivita' e leggere la giornata. Solo conti, niente schermate: si provano. */
object Agenda {

    /** I gruppi dell'elenco, in quest'ordine. */
    enum class Gruppo(val nome: String) {
        SCADUTE("Scadute"), OGGI("Oggi"), PROSSIMI("Prossimi giorni"), PIU_AVANTI("Più avanti"), SENZA_DATA("Senza data")
    }

    /** "Prossimi giorni" e' la settimana che viene: oltre, le attivita' vanno in "Più avanti". */
    const val GIORNI_PROSSIMI = 7L

    /**
     * Le attivita' divise nei gruppi. Le annullate no; le fatte solo se fatte oggi
     * (restano barrate, cosi' si vede cosa si e' appena chiuso), e mai fra le scadute.
     * Di una ricorrente si vede solo la prossima ripetizione da fare: la riunione di
     * ogni lunedi' non deve riempire l'elenco con tre mesi di lunedi'.
     */
    fun gruppi(attivita: List<Attivita>, oggi: LocalDate = LocalDate.now()): Map<Gruppo, List<Attivita>> {
        val visibili = attivita.filter { a ->
            !a.annullata && (!a.fatta || fattaOggi(a, oggi))
        }
        val giaVista = mutableSetOf<String>()
        val senzaRipetizioni = visibili.sortedBy { it.giorno ?: LocalDate.MAX }.filter { a ->
            val futura = a.giorno?.isAfter(oggi) == true
            !(futura && a.idRicorrenza.isNotBlank() && !giaVista.add(a.idRicorrenza))
        }
        val divise = senzaRipetizioni.groupBy { a ->
            val g = a.giorno
            when {
                g == null -> Gruppo.SENZA_DATA
                g.isBefore(oggi) && !a.fatta -> Gruppo.SCADUTE
                g.isBefore(oggi) -> Gruppo.OGGI
                g == oggi -> Gruppo.OGGI
                !g.isAfter(oggi.plusDays(GIORNI_PROSSIMI)) -> Gruppo.PROSSIMI
                else -> Gruppo.PIU_AVANTI
            }
        }
        return Gruppo.entries.associateWith { gr ->
            divise[gr].orEmpty().sortedWith(
                compareBy<Attivita> { it.giorno ?: LocalDate.MAX }
                    .thenBy { if (it.priorita == Priorita.ALTA) 0 else if (it.priorita == Priorita.BASSA) 2 else 1 }
                    .thenBy { it.inizio?.toLocalTime() ?: LocalTime.MAX }
                    .thenBy { it.titolo.lowercase() },
            )
        }.filterValues { it.isNotEmpty() }
    }

    private fun fattaOggi(a: Attivita, oggi: LocalDate): Boolean {
        val quando = istanteLocale(a.fattaIl)?.toLocalDate() ?: return a.giorno == oggi
        return quando == oggi
    }

    /** Quelle di un giorno, per il calendario: prima quelle con l'ora, in ordine; poi quelle di tutto il giorno. */
    fun delGiorno(attivita: List<Attivita>, giorno: LocalDate): List<Attivita> =
        attivita.filter { !it.annullata && it.giorno == giorno }
            .sortedWith(compareBy<Attivita> { if (it.conOra) 0 else 1 }.thenBy { it.inizio ?: LocalDateTime.MAX }.thenBy { it.titolo.lowercase() })

    /** Un pezzo della giornata: un impegno con l'ora, o un buco libero fra due. */
    sealed interface Pezzo {
        data class Impegno(val attivita: Attivita) : Pezzo
        data class Libero(val dalle: LocalTime, val alle: LocalTime) : Pezzo
    }

    /**
     * La giornata come la mostra il telefono: gli impegni con l'ora e, fra uno e
     * l'altro, "Libero dalle 10:00 alle 14:30" se c'e' almeno [minimoMinuti] di buco.
     * Impegni che si accavallano non lasciano buchi.
     */
    fun giornata(impegni: List<Attivita>, minimoMinuti: Long = 15): List<Pezzo> {
        val conOra = impegni.filter { it.conOra }.sortedBy { it.inizio }
        val out = mutableListOf<Pezzo>()
        var finoA: LocalDateTime? = null
        for (a in conOra) {
            val inizio = a.inizio!!
            val f = finoA
            if (f != null && Duration.between(f, inizio).toMinutes() >= minimoMinuti && f.toLocalDate() == inizio.toLocalDate()) {
                out += Pezzo.Libero(f.toLocalTime(), inizio.toLocalTime())
            }
            out += Pezzo.Impegno(a)
            val fine = a.fine ?: inizio.plusHours(1)
            if (finoA == null || fine.isAfter(finoA)) finoA = fine
        }
        return out
    }

    /**
     * Gli impegni con l'ora della stessa persona che si accavallano con [nuovo]
     * (fase2.md §5: un appuntamento sovrapposto chiede conferma).
     */
    fun sovrapposti(nuovo: Attivita, altri: List<Attivita>): List<Attivita> {
        if (!nuovo.conOra) return emptyList()
        val i = nuovo.inizio!!
        val f = nuovo.fine ?: i.plusHours(1)
        return altri.filter { a ->
            a.id != nuovo.id && !a.annullata && a.conOra && a.assegnataA == nuovo.assegnataA && nuovo.assegnataA.isNotBlank() &&
                a.inizio!!.isBefore(f) && i.isBefore(a.fine ?: a.inizio.plusHours(1))
        }
    }

    /** I pallini della striscia della settimana: quante attivita' e impegni per giorno (al massimo 3). */
    fun pallini(attivita: List<Attivita>, giorno: LocalDate): Int =
        attivita.count { !it.annullata && it.giorno == giorno }.coerceAtMost(3)
}
