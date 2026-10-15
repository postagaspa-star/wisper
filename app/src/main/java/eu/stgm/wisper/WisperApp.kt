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

    /** Uno solo per tutta l'app: schermate e invio in sottofondo guardano gli stessi dati. */
    val archivio: Archivio by lazy { Archivio(this) }

    override fun onCreate() {
        super.onCreate()

        // Chi sta guardando cosa: con l'app davanti gli avvisi li mostra la
        // schermata, e la notifica sarebbe un doppione.
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

        val gestore = getSystemService(NotificationManager::class.java)
        // I canali della voce, che non c'e' piu': sui telefoni che avevano la
        // versione vecchia resterebbero nelle impostazioni a non servire a niente.
        gestore.deleteNotificationChannel("ascolto")
        gestore.deleteNotificationChannel("sveglia")

        // "Rapportini non ancora sul foglio" e "il foglio ha rifiutato": servono
        // quando l'app e' chiusa e l'invio parte in sottofondo.
        gestore.createNotificationChannel(
            NotificationChannel(
                CANALE_SALVATAGGI,
                getString(R.string.canale_salvataggi),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { setShowBadge(true) }
        )
    }

    companion object {
        const val CANALE_SALVATAGGI = "salvataggi"

        /** Vero se una schermata di Wisper e' quella che l'utente sta guardando. */
        private val _davanti = MutableStateFlow(false)
        val davanti: StateFlow<Boolean> = _davanti.asStateFlow()
    }
}
