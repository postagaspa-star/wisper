package eu.stgm.wisper

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import eu.stgm.wisper.rapportino.Moduli
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Le notifiche interne sul telefono (fase7.md §3.16): un controllo ogni 15 minuti quando
 * c'è rete (WorkManager), senza servizi esterni. Mostra le notifiche nuove non ancora
 * mostrate e lo dice al server (segnaMostrate), così una non torna due volte. Si spegne
 * con "Avvisami sul telefono" (Comunicazioni › Notifiche).
 */
object ControlloNotifiche {
    const val CANALE = "notifiche"
    const val EXTRA_COLLEGAMENTO = "eu.stgm.wisper.notifica"
    private const val PREF = "notifiche-telefono"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun acceso(ctx: Context): Boolean = prefs(ctx).getBoolean("telefono", true)

    fun metti(ctx: Context, acceso: Boolean) { prefs(ctx).edit().putBoolean("telefono", acceso).apply() }

    /** Gli id già mostrati su questo telefono (se segnaMostrate non è arrivato, non si mostrano di nuovo). */
    fun mostrate(ctx: Context): Set<String> = prefs(ctx).getStringSet("mostrate", emptySet()).orEmpty()

    fun segna(ctx: Context, ids: Collection<String>) {
        val tutte = (mostrate(ctx) + ids).toList().takeLast(300).toSet()
        prefs(ctx).edit().putStringSet("mostrate", tutte).apply()
    }

    fun canale(ctx: Context) {
        ctx.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
            NotificationChannel(CANALE, "Notifiche dello studio", NotificationManager.IMPORTANCE_DEFAULT).apply { setShowBadge(true) },
        )
    }

    /** Il controllo periodico: ogni 15 minuti con la rete (il minimo di Android). */
    fun programma(ctx: Context) {
        val lavoro = PeriodicWorkRequestBuilder<LavoroNotifiche>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("notifiche", ExistingPeriodicWorkPolicy.KEEP, lavoro)
    }

    fun mostra(ctx: Context, id: String, titolo: String, testo: String, collegamento: JSONObject?) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val numero = 4000 + (id.hashCode() and 0xFFF)
        val apri = PendingIntent.getActivity(
            ctx, numero,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_COLLEGAMENTO, (collegamento ?: JSONObject().put("pagina", "comunicazioni").put("filtro", JSONObject().put("segmento", "notifiche"))).toString()),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, CANALE)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setContentIntent(apri)
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(ctx).notify(numero, n) }
    }
}

class LavoroNotifiche(ctx: Context, parametri: WorkerParameters) : CoroutineWorker(ctx, parametri) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!ControlloNotifiche.acceso(ctx)) return Result.success()
        val archivio = (ctx as WisperApp).archivio
        val sessione = archivio.sessione.value
        if (sessione.utente.id.isBlank() || !sessione.permessi.vede(Moduli.COMUNICAZIONI)) return Result.success()
        val nuove = archivio.fase7.nuoveDaMostrare().getOrElse { return Result.success() }
        val gia = ControlloNotifiche.mostrate(ctx)
        val daMostrare = nuove.filter { it.id !in gia }
        if (daMostrare.isEmpty()) return Result.success()
        ControlloNotifiche.canale(ctx)
        daMostrare.take(5).forEach { n ->
            val col = n.collegamento?.let { c ->
                JSONObject().put("pagina", c.pagina).put("id", c.id).apply { if (c.parametri.isNotEmpty()) put("filtro", JSONObject(c.parametri)) else if (c.filtro.isNotBlank()) put("filtro", c.filtro) }
            }
            ControlloNotifiche.mostra(ctx, n.id, n.titolo, n.dettaglio, col)
        }
        ControlloNotifiche.segna(ctx, daMostrare.map { it.id })
        archivio.fase7.segnaMostrate(daMostrare.map { it.id })
        return Result.success()
    }
}
