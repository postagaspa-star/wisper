package android.print

import android.os.CancellationSignal
import android.os.ParcelFileDescriptor

/**
 * Scrive in un file il PDF di un PrintDocumentAdapter (quello della WebView) senza
 * aprire la finestra di stampa di Android.
 *
 * Perché sta in android.print: le due risposte (LayoutResultCallback e
 * WriteResultCallback) nell'SDK hanno il costruttore nascosto, quindi si possono
 * creare solo da questo pacchetto. Sul telefono il costruttore è pubblico e Android
 * lo lascia usare alle app (@UnsupportedAppUsage senza limite di versione): è il
 * modo in cui le app fanno PDF da una pagina HTML.
 */
object StampaSilenziosa {

    /** [fatto] arriva una volta sola, sul thread principale: null se è andata, altrimenti il perché. */
    fun scrivi(
        adapter: PrintDocumentAdapter,
        attributi: PrintAttributes,
        destinazione: ParcelFileDescriptor,
        annulla: CancellationSignal,
        fatto: (errore: String?) -> Unit,
    ) {
        var finito = false
        fun fine(errore: String?) {
            if (finito) return
            finito = true
            try { adapter.onFinish() } catch (_: Exception) { }
            fatto(errore)
        }

        adapter.onStart()
        adapter.onLayout(null, attributi, annulla, object : PrintDocumentAdapter.LayoutResultCallback() {
            override fun onLayoutFinished(info: PrintDocumentInfo?, changed: Boolean) {
                adapter.onWrite(arrayOf(PageRange.ALL_PAGES), destinazione, annulla, object : PrintDocumentAdapter.WriteResultCallback() {
                    override fun onWriteFinished(pages: Array<out PageRange>?) = fine(null)
                    override fun onWriteFailed(error: CharSequence?) = fine(error?.toString() ?: "scrittura non riuscita")
                    override fun onWriteCancelled() = fine("scrittura annullata")
                })
            }

            override fun onLayoutFailed(error: CharSequence?) = fine(error?.toString() ?: "impaginazione non riuscita")
            override fun onLayoutCancelled() = fine("impaginazione annullata")
        }, null)
    }
}
