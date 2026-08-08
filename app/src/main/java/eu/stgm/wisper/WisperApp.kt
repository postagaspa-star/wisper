package eu.stgm.wisper

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class WisperApp : Application() {

    override fun onCreate() {
        super.onCreate()
        // Il canale della notifica persistente del servizio di ascolto.
        // Si crea una volta sola all'avvio: se manca, da Android 8 la notifica
        // non compare e il servizio in primo piano viene ucciso senza spiegazioni.
        val gestore = getSystemService(NotificationManager::class.java)

        gestore.createNotificationChannel(
            NotificationChannel(
                CANALE_ASCOLTO,
                getString(R.string.canale_ascolto),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { setShowBadge(false) }
        )

        // Canale a parte, ad alta importanza: e' l'unico modo per cui Android
        // accetta di aprire la schermata quando scatta la parola magica. Un
        // servizio in sottofondo non puo' farlo da solo, ma una notifica "a
        // schermo intero" si', ed e' lo stesso meccanismo delle chiamate.
        gestore.createNotificationChannel(
            NotificationChannel(
                CANALE_SVEGLIA,
                getString(R.string.canale_sveglia),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                setShowBadge(false)
                setSound(null, null)   // il bip lo fa gia' l'app
                enableVibration(false)
            }
        )
    }

    companion object {
        const val CANALE_ASCOLTO = "ascolto"
        const val CANALE_SVEGLIA = "sveglia"
    }
}
