package eu.stgm.wisper.rapportino

import kotlin.math.roundToLong

/** Le regole economiche che valgono per un rapportino. */
data class Regole(
    val gruppo: String = "",
    /** Null = tariffa libera, quella scritta nel rapportino. */
    val tariffaFissa: Double? = null,
    val pagaViaggio: Boolean = false,
    val kmRimborsati: Boolean = true,
    val maggExtra: Double = 0.0,
    val euroKm: Double = 0.0,
)

/**
 * Il conto di un rapportino, per l'anteprima mentre si compila.
 *
 * E' la stessa formula di calcola() nello script, e deve restarlo: il numero
 * che il tecnico vede sul telefono e' quello che poi trova sul PDF. Per questo
 * CalcoloTest legge gli stessi casi dei test dello script
 * (apps-script/prove/casi-calcolo.json). Se cambi qui, cambia anche li'.
 *
 * Il conto vero resta quello del foglio: questo serve solo a vederlo prima.
 */
object Calcolo {

    fun calcola(
        oreLavoro: Double,
        oreExtra: Double,
        oreViaggio: Double,
        km: Double,
        spese: Double,
        tariffa: Double?,
        regole: Regole,
    ): Conto {
        val t = regole.tariffaFissa ?: tariffa ?: 0.0
        val compenso = centesimi(
            (oreLavoro + (if (regole.pagaViaggio) oreViaggio else 0.0)) * t +
                oreExtra * t * (1 + regole.maggExtra / 100)
        )
        val rimborso = if (regole.kmRimborsati) centesimi(km * regole.euroKm) else 0.0
        return Conto(
            oreTotali = ((oreLavoro + oreExtra + oreViaggio) * 100).roundHalfUp() / 100.0,
            tariffa = t,
            compensoOre = compenso,
            rimborsoKm = rimborso,
            totale = centesimi(compenso + rimborso + centesimi(spese)),
            euroKm = regole.euroKm,
            pagaViaggio = regole.pagaViaggio,
            kmRimborsati = regole.kmRimborsati,
            maggExtra = regole.maggExtra,
        )
    }

    fun calcola(r: Rapportino, regole: Regole): Conto =
        calcola(r.oreLavoro, r.oreExtra, r.oreViaggio, r.km, r.spese, r.tariffa, regole)

    private fun centesimi(n: Double): Double = (n * 100).roundHalfUp() / 100.0

    /** Come Math.round di JavaScript: il mezzo va sempre verso l'alto. */
    private fun Double.roundHalfUp(): Long = Math.floor(this + 0.5).roundToLong()
}
