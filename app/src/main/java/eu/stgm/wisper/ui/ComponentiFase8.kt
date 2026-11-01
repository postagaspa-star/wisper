package eu.stgm.wisper.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.rapportino.Integrazione
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Parole8
import eu.stgm.wisper.rapportino.SegmentoIntegrazioni
import eu.stgm.wisper.rapportino.TrovatoNelTesto

/*
 * I pezzi comuni della fase 8 (fase8.md §15): le parole fisse coi loro colori (sempre con la
 * parola), le icone dei collegamenti, l'estratto della ricerca col grassetto, ICSx⁵.
 */

// ---------------------------------------------------------------------------------- ricordi e giri

object RicordoIntegrazioni {
    /** null = si apre su Da sistemare se c'è un Errore, altrimenti su Tutti (§4.3). */
    var segmento by mutableStateOf<SegmentoIntegrazioni?>(null)
}

object RicordoTutto {
    /** Il segmento di Tutto quello che c'è da fare (urgenti, settimana, pianificare) e l'area. */
    var sezione by mutableStateOf("urgenti")
    var area by mutableStateOf("")
}

/** I giri delle letture della fase 8: dopo una scrittura si rileggono le pagine aperte. */
internal object Giri8 {
    var integrazioni by mutableIntStateOf(0)
    var feed by mutableIntStateOf(0)
    var amministrazione by mutableIntStateOf(0)
    var tutto by mutableIntStateOf(0)
}

@Composable
internal fun scriveIntegrazioni(): Boolean = LocalPermessi.current.modifica(Moduli.INTEGRAZIONI)

@Composable
internal fun scriveAmministrazione(): Boolean = LocalPermessi.current.modifica(Moduli.AMMINISTRAZIONE)

// ---------------------------------------------------------------------------------- parole e colori (§15)

/** Lo stato di un collegamento: Collegato verde, Da configurare giallo tenue, Errore rosso tenue, In corso blu, Non collegato grigio tratteggiato, Dipende da una scelta grigio. */
@Composable
internal fun PillolaStato8(stato: String, gruppo: String = "", modifier: Modifier = Modifier) {
    val c = W.colori
    when (val parola = Parole8.stato(stato, gruppo)) {
        "Collegato" -> Pillolina(parola, c.firmatoTesto, c.firmatoFondo, modifier)
        "Da configurare" -> Pillolina(parola, c.gialloTesto, c.gialloTenue, modifier)
        "Errore" -> Pillolina(parola, c.rossoTesto, c.rossoTenue, modifier)
        "In corso" -> Pillolina(parola, c.inviatoTesto, c.inviatoFondo, modifier)
        "Non collegato" -> Row(
            modifier.clip(RoundedCornerShape(50)).bordoTratteggiato(c.bordoCampo, 50.dp).padding(horizontal = 9.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(Icone.scollegato, null, tint = c.fatturatoTesto, modifier = Modifier.size(15.dp))
            Text(parola, style = Testi.pillola.copy(fontWeight = FontWeight.ExtraBold), color = c.fatturatoTesto)
        }
        else -> Pillolina(parola, c.fatturatoTesto, c.fatturatoFondo, modifier)
    }
}

/**
 * Una parola fissa della fase 8 col suo colore (§15): verde (Fatto, Tutto torna, Provata,
 * Accesa), giallo tenue (Da fare, Nel testo), rosso tenue (Non va, Non torna), ambra (Da
 * rifare, versione vecchia), blu (In corso), grigio (le altre).
 */
@Composable
internal fun Parola8(parola: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val (testo, fondo) = when (parola) {
        "Fatto", "Tutto torna", "Provata", "Accesa", "Collegato", "Pronto" -> c.firmatoTesto to c.firmatoFondo
        "Da fare", "Nel testo", "Da configurare" -> c.gialloTesto to c.gialloTenue
        "Non va", "Non torna", "Errore" -> c.rossoTesto to c.rossoTenue
        "Da rifare", "Versione vecchia" -> c.ambraTesto to c.ambraFondo
        "In corso" -> c.inviatoTesto to c.inviatoFondo
        else -> c.fatturatoTesto to c.fatturatoFondo
    }
    Pillolina(parola, testo, fondo, modifier)
}

/** L'icona di un collegamento (prototipo, INTEG). */
internal fun iconaIntegrazione(chiave: String): ImageVector = when (chiave) {
    "postino", "posta365", "postams", "workspace" -> Icone.email
    "vies", "ricerca" -> Icone.cerca
    "copiafuori" -> Icone.nuvola
    "aggiornamenti" -> Icone.scarica
    "calendario", "calendariofile", "calendariopubblico", "calpub" -> Icone.calendario
    "porta", "internetinterno" -> Icone.scudo
    "portale" -> Icone.globo
    "link" -> Icone.link
    "ponte", "sync", "duevie" -> Icone.ripeti
    "onedrive", "drive", "durc" -> Icone.documento
    "programma", "programmafatture", "sdi" -> Icone.fatturazione
    "banca", "openbanking", "estratto", "estrattoconto" -> Icone.banca
    "whatsapp", "whatsappapi" -> Icone.whatsapp
    "messaggi", "assistente" -> Icone.fumetto
    "firebase" -> Icone.campanella
    "paghe" -> Icone.persona
    else -> Icone.spina
}

/** Il quadratino dell'icona: verde Collegato, rosso Errore, grigio il resto. */
@Composable
internal fun IconaIntegrazione(i: Integrazione) = IconaTinta(iconaIntegrazione(i.chiave), when { i.inErrore -> "rosso"; i.stato == Parole8.COLLEGATO -> "verde"; else -> "grigio" })

/** La riga di un collegamento (§4.3): icona, nome, cosa fa, la pillola e "controllato oggi alle 10:00". */
@Composable
internal fun RigaIntegrazione(i: Integrazione, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).semantics { role = Role.Button }.padding(vertical = 12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaIntegrazione(i)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(i.nome, style = Testi.forte.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (i.cosa.isNotBlank()) Text(i.cosa, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(Modifier.padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillolaStato8(i.stato, i.gruppo)
                val q = if (i.senzaControlli) "" else Parole8.controllato(i.controllato)
                if (q.isNotBlank()) Text(q, style = Testi.piccolo, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (!i.senzaControlli && i.vecchio) Text("da allora nessun controllo", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            if (i.ultimoFallito) Text("l'ultimo controllo non è riuscito", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
        }
        Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.padding(top = 10.dp).size(18.dp))
    }
}

/** Una scheda verde o rossa tenue con la parola (Sicurezza §9.8, Copie §9.10). */
@Composable
internal fun SchedaEsito(ok: Boolean, titolo: String, dettaglio: String, azione: (@Composable () -> Unit)? = null) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(if (ok) c.scheda else c.rossoTenue)
            .border(1.dp, if (ok) c.bordoScheda else c.rossoTesto.copy(alpha = 0.25f), RoundedCornerShape(20.dp)).padding(16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconaTinta(if (ok) Icone.spunta else Icone.allarme, if (ok) "verde" else "rosso")
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(titolo, style = Testi.forte, color = if (ok) c.testo else c.rossoTesto)
            if (dettaglio.isNotBlank()) Text(dettaglio, style = Testi.secondario, color = if (ok) c.tenue else c.rossoTesto)
            azione?.invoke()
        }
    }
}

/** L'estratto della ricerca (§6.3): 14/600, una riga, le parole trovate in grassetto. */
@Composable
internal fun TestoEstratto(estratto: String, modifier: Modifier = Modifier, righe: Int = 1) {
    val c = W.colori
    val testo = buildAnnotatedString {
        TrovatoNelTesto.pezzi(if (righe == 1) TrovatoNelTesto.vicino(estratto) else estratto).forEach { (pezzo, forte) ->
            if (forte) withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold, color = c.testo)) { append(pezzo) } else append(pezzo)
        }
    }
    Text(testo, style = Testi.secondario.copy(fontWeight = FontWeight.SemiBold), color = c.testo2, maxLines = righe, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

/** Il carattere a larghezza fissa dell'indirizzo del calendario e della chiave della copia. */
@Composable
internal fun TestoFisso(testo: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Text(
        testo, style = Testi.secondarioGrande.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontWeight = FontWeight.SemiBold),
        color = c.testo, modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.superficie2).padding(14.dp),
    )
}

// ---------------------------------------------------------------------------------- ICSx⁵ (§5.6)

object Icsx5 {
    const val PACCHETTO = "at.bitfire.icsdroid"
    private const val FDROID = "org.fdroid.fdroid"

    fun installata(ctx: Context): Boolean = runCatching { ctx.packageManager.getPackageInfo(PACCHETTO, 0); true }.getOrDefault(false)

    /** Apre l'indirizzo in ICSx⁵: prima il webcal://, poi l'indirizzo col tipo del calendario. Falso se non si apre. */
    fun apri(ctx: Context, webcal: String, indirizzo: String): Boolean {
        val prove = listOfNotNull(
            webcal.takeIf { it.isNotBlank() }?.let { Intent(Intent.ACTION_VIEW, Uri.parse(it)) },
            indirizzo.takeIf { it.isNotBlank() }?.let { Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(it), "text/calendar") },
        )
        for (i in prove) {
            try {
                ctx.startActivity(i.setPackage(PACCHETTO).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        return false
    }

    /**
     * Installa ICSx⁵ (§5.6): la strada gratuita è F-Droid (0 €; dal Play Store costa circa 2 €).
     * Con l'app di F-Droid si apre lì, altrimenti la pagina di F-Droid nel browser.
     */
    fun installa(ctx: Context) {
        val fdroid = runCatching { ctx.packageManager.getPackageInfo(FDROID, 0); true }.getOrDefault(false)
        val intent = if (fdroid) Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PACCHETTO")).setPackage(FDROID)
        else Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/$PACCHETTO/"))
        try {
            ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://f-droid.org/packages/$PACCHETTO/")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }
}
