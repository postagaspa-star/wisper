package eu.stgm.wisper.rapportino

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

/**
 * Oggetto e frase dell'email quando si mandano rapportini (riunione del 06/11/2026): il messaggio capisce se sono
 * dello stesso giorno, della stessa settimana (lunedì-domenica), dello stesso mese o di più mesi. Gli stessi casi del
 * computer e del server, in server/prove/casi-invio.json. Il corpo è "Buongiorno,\nin allegato " + frase + ".\n\n
 * Cordiali saluti\n" + firma; il nome del cliente (" · Rossi Impianti") lo aggiunge chi chiama, come prima.
 */
object PeriodoInvio {

    data class Testo(val oggetto: String, val frase: String)

    private val MESI = listOf(
        "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
        "settembre", "ottobre", "novembre", "dicembre",
    )
    private val DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    /** Come sopra, con le date scritte come nel rapportino ("2026-11-05"); quelle che non si leggono si saltano. */
    @JvmName("daTesti")
    fun periodoInvio(date: List<String>, numero: String = ""): Testo =
        periodoInvio(date.mapNotNull { runCatching { LocalDate.parse(it.trim().take(10)) }.getOrNull() }, numero)

    /**
     * Un rapportino solo resta come prima ("Rapportino 153 del 05/11/2026", "il rapportino del 05/11/2026"); più
     * rapportini: lo stesso giorno, la stessa settimana da lunedì a domenica, lo stesso mese, o dal primo mese all'ultimo.
     */
    fun periodoInvio(date: List<LocalDate>, numero: String = ""): Testo {
        if (date.isEmpty()) return Testo("Rapportini", "i rapportini")
        if (date.size == 1) {
            val d = date[0].format(DATA)
            return Testo("Rapportino " + (if (numero.isNotBlank()) numero.trim() + " " else "") + "del " + d, "il rapportino del $d")
        }
        val primo = date.min()
        val ultimo = date.max()
        val periodo = when {
            primo == ultimo -> conPreposizione("del", primo.dayOfMonth) + " " + MESI[primo.monthValue - 1] + " " + primo.year
            lunedi(primo) == lunedi(ultimo) -> "della settimana " + conPreposizione("dal", primo.dayOfMonth) +
                (if (primo.year != ultimo.year) " " + meseAnno(primo) else if (primo.month != ultimo.month) " " + MESI[primo.monthValue - 1] else "") +
                " " + conPreposizione("al", ultimo.dayOfMonth) + " " + meseAnno(ultimo)
            primo.year == ultimo.year && primo.month == ultimo.month -> "di " + meseAnno(primo)
            primo.year == ultimo.year -> "da " + MESI[primo.monthValue - 1] + " " + a(MESI[ultimo.monthValue - 1]) + " " + ultimo.year
            else -> "da " + meseAnno(primo) + " " + a(MESI[ultimo.monthValue - 1]) + " " + ultimo.year
        }
        return Testo("Rapportini $periodo", "il riepilogo dei rapportini $periodo")
    }

    private fun lunedi(d: LocalDate): LocalDate = d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    private fun meseAnno(d: LocalDate): String = MESI[d.monthValue - 1] + " " + d.year

    /** Il giorno 1 si scrive 1°; davanti a 8 e 11 la preposizione si apostrofa: dell'8, dall'11, all'8. */
    internal fun conPreposizione(preposizione: String, giorno: Int): String = when (giorno) {
        1 -> "$preposizione 1°"
        8, 11 -> preposizione + "l'" + giorno
        else -> "$preposizione $giorno"
    }

    /** "a novembre", ma "ad aprile" e "ad agosto". */
    private fun a(mese: String): String = if (mese.startsWith("a")) "ad $mese" else "a $mese"
}
