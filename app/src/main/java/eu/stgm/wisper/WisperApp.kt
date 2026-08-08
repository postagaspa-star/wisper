package eu.stgm.wisper

import android.app.Activity
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class WisperApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // Chi sta guardando cosa. Serve al servizio per decidere se puo'
        // tenersi il microfono: se davanti c'e' un'altra app, Wisper lo molla.
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            private var vive = 0
            override fun onActivityResumed(a: Activity) { vive++; _davanti.value = vive > 0 }
            override fun onActivityPaused(a: Activity) { vive--; _davanti.value = vive > 0 }
            override fun onActivityCreated(a: Activity, b: Bundle?) {}
            override fun onActivityStarted(a: Activity) {}
            override fun onActivityStopped(a: Activity) {}
            override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
            override fun onActivityDestroyed(a: Activity) {}
        })
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

        /** Vero se una schermata di Wisper e' quella che l'utente sta guardando. */
        private val _davanti = MutableStateFlow(false)
        val davanti: StateFlow<Boolean> = _davanti.asStateFlow()
    }
}
