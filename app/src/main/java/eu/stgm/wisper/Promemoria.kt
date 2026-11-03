package eu.stgm.wisper

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.TipoAttivita
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * I promemoria delle proprie attività e dei propri appuntamenti (fase2.md §5):
 * una notifica sul telefono all'ora scelta, anche ad app chiusa e dopo un
 * riavvio. Li fa la sveglia di Android (AlarmManager), non il server: funziona
 * anche senza rete, con l'ultima lettura delle attività.
 *
 * Si riprogrammano tutti ogni volta che le attività si rileggono o cambiano: i
 * vecchi si tolgono, i nuovi si mettono. L'elenco sta in un file, per rimetterli
 * dopo un riavvio del telefono.
 */
object Promemoria {
    const val CANALE = "promemoria"
    const val EXTRA_ATTIVITA = "eu.stgm.wisper.attivita"

    /** Quanto avanti si programmano: oltre, ci pensa una lettura successiva. */
    private const val GIORNI_AVANTI = 45L

    private data class Voce(val id: String, val quando: Long, val titolo: String, val testo: String)

    private fun file(ctx: Context) = File(ctx.filesDir, "promemoria.json")

    /**
     * I promemoria di [idUtente]: le attività assegnate a lui, non fatte né
     * annullate, con un promemoria nel futuro. Con un elenco vuoto si tolgono tutti
     * (chi esce non riceve più i promemoria su questo telefono).
     */
    fun programma(ctx: Context, attivita: List<Attivita>, idUtente: String) {
        val adesso = LocalDateTime.now()
        val limite = adesso.plusDays(GIORNI_AVANTI)
        val volute = if (idUtente.isBlank()) emptyList() else attivita
            .filter { it.assegnataA == idUtente && !it.fatta && !it.annullata && it.id.isNotBlank() }
            .mapNotNull { a ->
                val m = a.momentoPromemoria() ?: return@mapNotNull null
                if (!m.isAfter(adesso) || m.isAfter(limite)) return@mapNotNull null
                Voce(a.id, m.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(), a.titolo, testoDi(a))
            }
        val prima = leggi(ctx)
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        prima.filter { p -> volute.none { it == p } }.forEach { runCatching { am.cancel(intento(ctx, it)) } }
        volute.filter { v -> prima.none { it == v } }.forEach { metti(ctx, am, it) }
        scrivi(ctx, volute)
    }

    /** Dopo un riavvio o un aggiornamento dell'app: le sveglie di Android si perdono, si rimettono dal file. */
    fun riprogramma(ctx: Context) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val adesso = System.currentTimeMillis()
        val rimaste = leggi(ctx).filter { it.quando > adesso }
        rimaste.forEach { metti(ctx, am, it) }
        scrivi(ctx, rimaste)
    }

    /** "Alle 14:30 · Zanè", "Scade oggi", "Domani alle 9:00". */
    internal fun testoDi(a: Attivita, oggi: LocalDate = LocalDate.now()): String {
        val giorno = a.giorno
        val quando = when {
            giorno == null -> ""
            a.conOra -> {
                val ora = a.inizio!!.format(DateTimeFormatter.ofPattern("H:mm"))
                when (giorno) {
                    oggi -> "Alle $ora"
                    oggi.plusDays(1) -> "Domani alle $ora"
                    else -> giorno.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALY)).replaceFirstChar { it.uppercase() } + " alle $ora"
                }
            }
            giorno == oggi -> if (a.tipo == TipoAttivita.ATTIVITA) "Scade oggi" else "Oggi"
            giorno == oggi.plusDays(1) -> if (a.tipo == TipoAttivita.ATTIVITA) "Scade domani" else "Domani"
            else -> "Scade " + giorno.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALY))
        }
        return listOf(quando, a.luogo).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { TipoAttivita.nome(a.tipo) }
    }

    private fun metti(ctx: Context, am: AlarmManager, v: Voce) {
        val pi = intento(ctx, v)
        try {
            // Esatta quando Android la concede (USE_EXACT_ALARM dalla 13, SCHEDULE_EXACT_ALARM prima);
            // altrimenti quasi esatta: può arrivare qualche minuto dopo.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, v.quando, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, v.quando, pi)
            }
        } catch (_: SecurityException) {
            runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, v.quando, pi) }
        }
    }

    private fun intento(ctx: Context, v: Voce): PendingIntent {
        val i = Intent(ctx, AvvisoPromemoria::class.java)
            .setAction("eu.stgm.wisper.PROMEMORIA.${v.id}")
            .putExtra("id", v.id).putExtra("titolo", v.titolo).putExtra("testo", v.testo)
        return PendingIntent.getBroadcast(ctx, v.id.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun leggi(ctx: Context): List<Voce> = try {
        val f = file(ctx)
        if (!f.exists()) emptyList() else JSONArray(f.readText()).let { a ->
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map {
                Voce(it.optString("id"), it.optLong("quando"), it.optString("titolo"), it.optString("testo"))
            }
        }
    } catch (_: Exception) {
        emptyList()
    }

    private fun scrivi(ctx: Context, l: List<Voce>) {
        runCatching {
            file(ctx).writeText(JSONArray().apply {
                l.forEach { put(JSONObject().put("id", it.id).put("quando", it.quando).put("titolo", it.titolo).put("testo", it.testo)) }
            }.toString())
        }
    }

    /** Si possono mostrare le notifiche? Dalla 13 serve il permesso, chiesto quando si sceglie un promemoria. */
    fun notifichePermesse(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
}

/** La sveglia è suonata: la notifica, che apre l'attività. */
class AvvisoPromemoria : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (!Promemoria.notifichePermesse(ctx)) return
        val id = intent.getStringExtra("id") ?: return
        val apri = PendingIntent.getActivity(
            ctx, id.hashCode(),
            Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(Promemoria.EXTRA_ATTIVITA, id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val testo = intent.getStringExtra("testo").orEmpty()
        val n = NotificationCompat.Builder(ctx, Promemoria.CANALE)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(intent.getStringExtra("titolo").orEmpty().ifBlank { "Promemoria" })
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(apri)
            .setAutoCancel(true)
            .build()
        runCatching { ctx.getSystemService(NotificationManager::class.java).notify("promemoria", id.hashCode(), n) }
    }
}

/** Dopo il riavvio del telefono o un aggiornamento di Wisper le sveglie si rimettono. */
class RiavvioPromemoria : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Promemoria.riprogramma(ctx)
        }
    }
}
