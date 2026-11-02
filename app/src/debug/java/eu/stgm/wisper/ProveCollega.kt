package eu.stgm.wisper

import android.content.Intent

/**
 * SOLO NELLE BUILD DI PROVA (cartella src/debug): un testo da dare alla schermata
 * Collega un computer come se l'avesse letto la fotocamera, per le schermate e il
 * giro completo sull'emulatore senza un QR davanti. La build di rilascio ha al suo
 * posto src/release/.../ProveCollega.kt, che non legge niente.
 *
 *     adb -s emulator-5554 shell am start -n eu.stgm.wisper/.MainActivity --es collegaQr "wisper-collega:1:..."
 *
 * Il testo passa dagli stessi controlli di un QR vero (CollegaQr.leggi).
 */
object ProveCollega {
    private const val EXTRA = "collegaQr"

    fun testoDallIntent(intent: Intent?): String? {
        val testo = intent?.getStringExtra(EXTRA) ?: return null
        intent.removeExtra(EXTRA)
        return testo
    }
}
