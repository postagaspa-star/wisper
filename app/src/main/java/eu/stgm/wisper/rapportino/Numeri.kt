package eu.stgm.wisper.rapportino

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * Numeri come li scrive una persona: "6,5" e non "6.5".
 *
 * I campi delle ore sono di testo, non numerici: la tastiera numerica di
 * Android, a seconda del telefono, non ha la virgola, e un tecnico che scrive
 * "6,5" e se lo vede rifiutare smette di fidarsi del modulo.
 */
object Numeri {
    private val IT = Locale.ITALY

    /** "6,5", "6.5", " 6 " -> 6.5; "" -> null; "sei" -> null. */
    fun leggi(testo: String?): Double? {
        val t = testo?.trim()?.replace(" ", "") ?: return null
        if (t.isEmpty()) return null
        // "1.250,50" (migliaia col punto) e' raro in un campo ore o km, ma in un
        // campo spese capita: se ci sono tutti e due, il punto e' delle migliaia.
        val normale = if (t.contains(',') && t.contains('.')) t.replace(".", "").replace(',', '.')
        else t.replace(',', '.')
        return normale.toDoubleOrNull()?.takeIf { !it.isNaN() && !it.isInfinite() }
    }

    /** 6.5 -> "6,5"; 4.0 -> "4"; 0.0 -> "" se vuotoSeZero. */
    fun scrivi(n: Double?, vuotoSeZero: Boolean = false): String {
        if (n == null) return ""
        if (vuotoSeZero && n == 0.0) return ""
        return DecimalFormat("0.##", DecimalFormatSymbols(IT)).format(n)
    }

    /** 1234.5 -> "1.234,50 €" */
    fun euro(n: Double): String =
        DecimalFormat("#,##0.00", DecimalFormatSymbols(IT)).format(n) + " €"

    /** 9.5 -> "9,5 h" */
    fun ore(n: Double): String = scrivi(n) + " h"
}
