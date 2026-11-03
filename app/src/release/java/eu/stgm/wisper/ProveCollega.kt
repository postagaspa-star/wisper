package eu.stgm.wisper

import android.content.Intent

/**
 * Nella build di rilascio non si dà nessun testo alla schermata Collega un
 * computer: il QR lo legge solo la fotocamera. La versione delle prove è in
 * src/debug/.../ProveCollega.kt.
 */
object ProveCollega {
    @Suppress("UNUSED_PARAMETER")
    fun testoDallIntent(intent: Intent?): String? = null
}
