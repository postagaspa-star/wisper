package eu.stgm.wisper.ui

import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Il Mese di prima è diventato la sezione Rapportini (ui/Rapportini.kt): stesso
 * elenco per cliente, in più ricerca, filtri e selezione. Qui resta il nome del
 * mese, che usano anche le altre schermate.
 */

private val IT = Locale.ITALY

/** "Ottobre 2026". */
fun nomeMese(m: YearMonth): String =
    m.format(DateTimeFormatter.ofPattern("LLLL yyyy", IT)).replaceFirstChar { it.uppercase() }
