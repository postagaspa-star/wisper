package eu.stgm.wisper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.conConti
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Giornate
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.time.YearMonth
import kotlin.math.roundToInt

/** Cosa si manda, dalla rotta invio/<cosa> (docs/telefono-ufficio.md, tabella "Rotte"). */
private sealed interface CosaInvio {
    /** Il riepilogo del mese di un cliente: i suoi lavori da fatturare. */
    data class DelCliente(val chiave: String, val mese: YearMonth?) : CosaInvio
    /** Un lavoro solo, al suo cliente. */
    data class Uno(val idLocale: String) : CosaInvio
    /** I lavori scelti (nella sezione Rapportini, o quelli da inviare di un rapportino). */
    data class Scelti(val idLocali: List<String>) : CosaInvio
}

private fun leggiCosa(cosa: String): CosaInvio? = when {
    cosa.startsWith("cliente/") -> {
        val resto = cosa.removePrefix("cliente/")
        CosaInvio.DelCliente(
            Uri.decode(resto.substringBeforeLast('/')).removePrefix("c:"),
            runCatching { YearMonth.parse(resto.substringAfterLast('/')) }.getOrNull(),
        )
    }
    cosa.startsWith("rapportino/") -> CosaInvio.Uno(Uri.decode(cosa.removePrefix("rapportino/")))
    cosa.startsWith("scelti/") -> CosaInvio.Scelti(cosa.removePrefix("scelti/").split(',').map { Uri.decode(it.trim()) }.filter { it.isNotBlank() })
    else -> null
}

/** I lavori da mandare, il più vecchio prima (come preparaInvio del computer). */
private fun lavoriDa(cosa: CosaInvio?, tutti: List<Rapportino>, ana: Anagrafiche): List<Rapportino> = when (cosa) {
    is CosaInvio.DelCliente -> tutti.filter { r ->
        Conti.daFatturare(r) && (cosa.mese == null || YearMonth.from(r.data) == cosa.mese) &&
            (chiaveRotta(r, ana) == cosa.chiave || (r.idCliente.isNotBlank() && r.idCliente == cosa.chiave))
    }
    is CosaInvio.Uno -> tutti.filter { it.idLocale == cosa.idLocale }.take(1)
    is CosaInvio.Scelti -> tutti.filter { it.idLocale in cosa.idLocali }
    null -> emptyList()
}.filter { it.stato != Stato.ANNULLATO }.sortedWith(compareBy<Rapportino> { it.data }.thenBy { Giornate.chiaveDi(it) }.thenBy { it.posizione })

/** L'esito dell'ultimo PDF fatto, legato alle scelte con cui lo si è fatto. */
internal class EsitoPdf(val chiave: String, val file: File?, val errore: String?)

/**
 * Invio rapportino / Invio rapportini (rapportino-lavori.md §4): i lavori scelti divisi per destinatario (chi paga,
 * [Giornate.dividi]), una scheda per destinatario con la sua email già scritta, l'oggetto (server/prove/casi-invio.json)
 * e il PDF che parte (il rapportino se i suoi lavori sono di un rapportino solo, se no il riepilogo). Poi "Invia N
 * email": una email per destinatario, ognuna con SOLO i suoi lavori (inviaEmail con i loro id). Nessun cliente vede i
 * lavori di un altro. È un compito: niente barra in basso, si esce con la ×.
 *
 * Le email partono una alla volta, una volta sola per tocco (due tentativi sarebbero due email); se una non parte le
 * altre restano inviate e la pagina dice quale riprovare.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataInvio(dati: Dati, nav: Navigatore, cosa: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    // Dal 06/11/2026 si manda con Rapportini in Modifica (non più con la Fatturazione): gli importi solo con i costi.
    val costi = LocalPermessi.current.costi
    // L'email del cliente com'è adesso: se l'ufficio l'ha appena cambiata sul computer, il campo A la prende da solo.
    LaunchedEffect(Unit) { if (!dati.esempio) dati.aggiorna() }

    val richiesta = remember(cosa) { leggiCosa(cosa) }
    val tutti = remember(storico, viste) {
        (storico.associateBy { it.rapportino.idLocale } + viste.associateBy { it.rapportino.idLocale }).values.toList().conConti()
    }
    val lista = remember(tutti, ana, richiesta) { lavoriDa(richiesta, tutti, ana) }
    val destinatari = remember(lista, ana) { Giornate.dividi(lista, ana) }
    val unRapportino = lista.map { Giornate.chiaveDi(it) }.distinct().size == 1
    val firmaEmail = ana.impostazione(Anagrafiche.TECNICO).ifBlank { ana.ragioneSociale }

    // Le scelte: gli importi di solito nel riepilogo (serve per la fattura), non nel rapportino di un giorno.
    // 12/11/2026: gli importi di base sì anche per un rapportino solo (è il foglio per la fattura, come il riepilogo).
    var conImporti by rememberSaveable(cosa) { mutableStateOf(costi) }
    var conFoto by rememberSaveable(cosa) { mutableStateOf(false) }
    // Per destinatario (la chiave di chi paga): quello che si è scritto a mano, e come è andata.
    val aScritto = remember(cosa) { mutableStateMapOf<String, String>() }
    val ccScritto = remember(cosa) { mutableStateMapOf<String, String>() }
    val oggettoScritto = remember(cosa) { mutableStateMapOf<String, String>() }
    val messaggioScritto = remember(cosa) { mutableStateMapOf<String, String>() }
    val inviate = remember(cosa) { mutableStateMapOf<String, String>() }
    val erroriA = remember(cosa) { mutableStateMapOf<String, String>() }
    val erroriInvio = remember(cosa) { mutableStateMapOf<String, String>() }

    fun indirizzo(d: Giornate.Destinatario) = (aScritto[d.chiave] ?: d.email).trim()
    fun email(d: Giornate.Destinatario) = Giornate.email(d, firmaEmail)
    fun oggetto(d: Giornate.Destinatario) = oggettoScritto[d.chiave] ?: email(d).oggetto
    fun messaggio(d: Giornate.Destinatario) = messaggioScritto[d.chiave] ?: email(d).messaggio

    var foglioMessaggio by remember { mutableStateOf<String?>(null) }
    var foglioPdf by remember { mutableStateOf(false) }
    var grande by remember { mutableStateOf<String?>(null) }
    // 13/11/2026 (Andrea): un lavoro con un'indennità e senza ore si manda solo dopo una conferma (un passaggio in più,
    // solo in quel caso). Annulla torna indietro.
    val fraseSenzaOre = remember(lista) { Giornate.fraseSenzaOre(lista) }
    var senzaOreVisto by rememberSaveable(cosa) { mutableStateOf(false) }

    // "invio", "copia", "apri", "condividi": cosa si sta aspettando. Un tocco alla volta.
    var occupato by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf<String?>(null) }
    // Vero solo mentre un'email è in viaggio: allora non si esce, o non si saprebbe se è partita.
    var inRete by remember { mutableStateOf(false) }

    // ---- i PDF, uno per destinatario: si rifanno quando cambiano i lavori o le scelte, uno alla volta
    var tentativo by remember { mutableIntStateOf(0) }
    fun chiavePdf(d: Giornate.Destinatario) =
        "${d.chiave}|${d.lavori.map { it.idLocale to it.stato }.hashCode()}|${d.lavori.hashCode()}|$conImporti|$conFoto|$tentativo"
    val chiaviAttuali = rememberUpdatedState(destinatari.associate { it.chiave to chiavePdf(it) })
    val pdf = remember(cosa) { mutableStateMapOf<String, EsitoPdf>() }
    val miniature = remember(cosa) { mutableStateMapOf<String, ImageBitmap>() }
    LaunchedEffect(chiaviAttuali.value) {
        if (destinatari.isEmpty()) return@LaunchedEffect
        // Due interruttori toccati di fila fanno un giro solo.
        delay(250)
        for (d in destinatari) {
            val k = chiavePdf(d)
            if (pdf[d.chiave]?.chiave == k) continue
            pdf[d.chiave] = try {
                val file = creaPdf(ctx, dati, d, conImporti, conFoto)
                withContext(Dispatchers.IO) { disegnaPagine(file, 540, 1).first.firstOrNull()?.asImageBitmap() }?.let { miniature[d.chiave] = it }
                EsitoPdf(k, file, null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                EsitoPdf(k, null, (e as? Stampa.ErroreStampa)?.message ?: "Il PDF non si è creato. Riprova.")
            }
        }
    }

    /** Il PDF di [d] con le scelte di adesso: lo aspetta se si sta ancora facendo, mai per sempre. */
    suspend fun pdfPronto(d: Giornate.Destinatario): File? {
        val e = withTimeoutOrNull(200_000L) {
            snapshotFlow { pdf[d.chiave] to chiaviAttuali.value[d.chiave] }.first { (es, k) -> es?.chiave == k }.first
        }
        return when {
            e == null -> { erroriInvio[d.chiave] = "Il PDF non è ancora pronto. Riprova fra poco."; null }
            e.file == null -> { erroriInvio[d.chiave] = e.errore ?: "Il PDF non si è creato. Riprova."; null }
            else -> e.file
        }
    }

    val daMandare = destinatari.filter { it.chiave !in inviate }
    val esempio = if (dati.esempio) " (esempio: non è partito niente)" else ""

    fun inviaTutte() {
        if (occupato != null || daMandare.isEmpty()) return
        // Prima tutti gli indirizzi: un'email partita e una ferma per un campo vuoto confondono.
        var manca = false
        daMandare.forEach { d -> if (indirizzo(d).isBlank()) { erroriA[d.chiave] = "Manca l'indirizzo: scrivilo qui"; manca = true } }
        if (manca) return
        val giro = daMandare.toList()
        occupato = "invio"
        scope.launch {
            try {
                for (d in giro) {
                    inCorso = d.chiave
                    erroriInvio.remove(d.chiave)
                    val f = pdfPronto(d) ?: continue
                    inRete = true
                    val ris = dati.inviaEmail(indirizzo(d), ccScritto[d.chiave].orEmpty().trim(), oggetto(d), messaggio(d), f, d.lavori.map { it.idLocale }, false)
                    inRete = false
                    ris.onSuccess { inviate[d.chiave] = indirizzo(d) }
                        .onFailure { erroriInvio[d.chiave] = it.message ?: "L'email non è partita. Riprova." }
                }
            } finally {
                inRete = false
                inCorso = null
                occupato = null
            }
            val partite = giro.count { it.chiave in inviate }
            if (partite == giro.size) {
                nav.indietro()
                avvisi.mostra((if (partite == 1) "Email inviata a ${inviate[giro[0].chiave]}" else "$partite email inviate") + esempio)
            } else if (partite > 0) {
                avvisi.mostra("Inviate $partite su ${giro.size}: riprova quelle con l'errore")
            }
        }
    }

    fun copiaAMe(d: Giornate.Destinatario) {
        if (occupato != null) return
        occupato = "copia"
        erroriInvio.remove(d.chiave)
        scope.launch {
            try {
                val f = pdfPronto(d) ?: return@launch
                inRete = true
                dati.inviaEmail(indirizzo(d), ccScritto[d.chiave].orEmpty().trim(), oggetto(d), messaggio(d), f, d.lavori.map { it.idLocale }, true)
                    .onSuccess { avvisi.mostra("Copia mandata alla tua casella$esempio") }
                    .onFailure { erroriInvio[d.chiave] = it.message ?: "L'email non è partita. Riprova." }
            } finally {
                inRete = false
                occupato = null
            }
        }
    }

    fun conPdf(d: Giornate.Destinatario, cosaFa: String, fai: (File) -> Unit) {
        if (occupato != null) return
        occupato = cosaFa
        scope.launch {
            try {
                pdfPronto(d)?.let(fai)
            } finally {
                occupato = null
            }
        }
    }

    BackHandler(enabled = inRete) { /* un'email è in viaggio: si aspetta la risposta */ }

    val tastiera = WindowInsets.isImeVisible
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(MarginePagina).padding(bottom = 260.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { if (!inRete) nav.indietro() }, chiudi = true)

            if (destinatari.isEmpty()) {
                TitoloPagina(if (richiesta is CosaInvio.Uno) "Invio rapportino" else "Invio rapportini")
                Text(
                    if (richiesta is CosaInvio.Uno) "Il lavoro non c'è più: forse è stato tolto." else "Non c'è niente da mandare.",
                    style = Testi.testo, color = c.tenue,
                )
                return@Column
            }

            val n = destinatari.size
            TitoloPagina(
                if (unRapportino) "Invio rapportino" else "Invio rapportini",
                sopra = Giornate.lavori(lista.size) + " · " + (if (n == 1) "1 email" else "$n email") +
                    if (costi) " · " + Numeri.euro(lista.sumOf { it.conto?.totale ?: 0.0 }) else "",
            )

            Scheda(orizzontale = 18.dp, verticale = 6.dp, spazio = 0.dp) {
                if (costi) {
                    RigaInterruttore("Con gli importi", conImporti) { conImporti = it }
                    LineaElenco()
                }
                RigaInterruttore("Con le foto degli scontrini", conFoto) { conFoto = it }
            }

            destinatari.forEachIndexed { i, d ->
                SchedaDestinatario(
                    d = d,
                    costi = costi,
                    a = aScritto[d.chiave] ?: d.email,
                    onA = { aScritto[d.chiave] = it; erroriA.remove(d.chiave) },
                    erroreA = erroriA[d.chiave],
                    oggetto = oggetto(d),
                    esito = pdf[d.chiave]?.takeIf { it.chiave == chiavePdf(d) },
                    miniatura = miniature[d.chiave],
                    inviata = inviate[d.chiave],
                    inViaggio = inCorso == d.chiave,
                    errore = erroriInvio[d.chiave],
                    onPdf = { if (pdf[d.chiave]?.file != null) grande = d.chiave },
                    onRiprova = { tentativo++ },
                    onMessaggio = { foglioMessaggio = d.chiave },
                    modifier = if (i == 0) Modifier.bersaglio("destinatario-0") else Modifier,
                )
            }
        }

        if (!tastiera) {
            val daSegnare = daMandare.flatMap { it.lavori }.filter { it.daInviare }
            FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
                PulsantePrincipale(
                    when {
                        occupato == "invio" -> "Invio in corso…"
                        occupato == "copia" -> "Mando la copia…"
                        daMandare.size == 1 -> "Invia l'email"
                        else -> "Invia ${daMandare.size} email"
                    },
                    { inviaTutte() },
                    Modifier.bersaglio("invia-email"),
                    icona = if (occupato == "invio" || occupato == "copia") null else Icone.invia,
                    abilitato = occupato == null && daMandare.isNotEmpty(),
                )
                PulsanteBordo("Solo i PDF", { if (occupato == null) foglioPdf = true }, Modifier.fillMaxWidth(), icona = Icone.pdf)
                if (daSegnare.isNotEmpty()) {
                    PulsanteTesto(
                        "Segna inviati senza email",
                        {
                            if (occupato == null) {
                                val cambio = dati.cambiaStato(daSegnare.map { it.idLocale }, Stato.INVIATO)
                                nav.indietro()
                                avvisaCambio(avvisi, dati, cambio)
                            }
                        },
                        Modifier.fillMaxWidth(),
                        colore = c.tenue,
                    )
                }
            }
        }
    }

    if (fraseSenzaOre != null && !senzaOreVisto) {
        FoglioConferma(
            titolo = "Indennità senza ore",
            testo = "$fraseSenzaOre Lo mando lo stesso?",
            azione = "Invia lo stesso",
            onConferma = { senzaOreVisto = true },
            onAnnulla = { nav.indietro() },
        )
    }

    // ---------------------------------------------------------- il messaggio di un destinatario
    foglioMessaggio?.let { k ->
        val d = destinatari.firstOrNull { it.chiave == k }
        if (d != null) FoglioDalBasso({ foglioMessaggio = null }) {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Messaggio per ${d.nome}", style = Testi.titoloScheda, color = c.testo)
                CampoTesto(oggetto(d), { oggettoScritto[k] = it }, "Oggetto")
                CampoTesto(ccScritto[k].orEmpty(), { ccScritto[k] = it }, "Copia anche a", segnaposto = "—", tastiera = KeyboardType.Email)
                CampoTesto(messaggio(d), { messaggioScritto[k] = it }, "Messaggio", righe = 6)
                PulsanteBordo(if (occupato == "copia") "Mando la copia…" else "Mandane una copia a me", { copiaAMe(d) }, Modifier.fillMaxWidth(), icona = Icone.invia)
                PulsantePrincipale("Fatto", { foglioMessaggio = null }, altezza = 52.dp)
            }
        }
    }

    // ---------------------------------------------------------- Solo i PDF: aprirli o condividerli, senza email
    if (foglioPdf) {
        FoglioDalBasso({ foglioPdf = false }) {
            Text(if (destinatari.size == 1) "Il PDF" else "I PDF", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                destinatari.forEach { d ->
                    Text(d.nome, style = Testi.forte, color = c.testo)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PulsanteBordo(
                            if (occupato == "apri" + d.chiave) "Preparo…" else "Apri",
                            {
                                conPdf(d, "apri" + d.chiave) { f ->
                                    if (!Stampa.apri(ctx, f)) avvisi.mostra("Sul telefono non c'è un'app per i PDF: usa Condividi")
                                }
                            },
                            Modifier.weight(1f), icona = Icone.pdf, altezza = 48.dp,
                        )
                        PulsanteBordo(
                            if (occupato == "condividi" + d.chiave) "Preparo…" else "Condividi",
                            { conPdf(d, "condividi" + d.chiave) { f -> Stampa.condividi(ctx, f, oggetto(d)) } },
                            Modifier.weight(1f), icona = Icone.condividi, altezza = 48.dp,
                        )
                    }
                }
            }
        }
    }

    grande?.let { k ->
        val file = pdf[k]?.file
        if (file != null) AnteprimaGrande(file, miniature[k]) { grande = null }
    }
}

/**
 * Un destinatario: chi è e cosa riceve ("2 lavori del rapportino RAP/2026/0153"), il campo A già scritto, l'oggetto,
 * il PDF che parte (la prima pagina vera, piccola: un tocco la ingrandisce), Cambia il messaggio. Dopo l'invio: a chi è
 * partita.
 */
@Composable
private fun SchedaDestinatario(
    d: Giornate.Destinatario,
    costi: Boolean,
    a: String,
    onA: (String) -> Unit,
    erroreA: String?,
    oggetto: String,
    esito: EsitoPdf?,
    miniatura: ImageBitmap?,
    inviata: String?,
    inViaggio: Boolean,
    errore: String?,
    onPdf: () -> Unit,
    onRiprova: () -> Unit,
    onMessaggio: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = W.colori
    // "2 lavori del rapportino RAP/2026/0153" (o del giorno, se il numero non c'è ancora); "3 lavori di 2 rapportini".
    val primo = d.lavori.first()
    val numero = primo.idGiornata.ifBlank { primo.id }
    val cosaParte = Giornate.lavori(d.lavori.size) + when {
        !d.unSoloRapportino -> " di " + d.rapportini.size + " rapportini"
        numero.isNotBlank() -> " del rapportino $numero"
        else -> " del " + primo.data.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))
    }
    Scheda(modifier, orizzontale = 16.dp, verticale = 16.dp, spazio = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Iniziali(d.nome, dimensione = 40.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(d.nome, style = Testi.forte, color = c.testo)
                RigaAPezzi(listOf(cosaParte, if (costi) Numeri.euro(d.lavori.sumOf { it.conto?.totale ?: 0.0 }) else ""), Testi.secondario, c.tenue)
            }
        }
        if (inviata != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(28.dp).clip(RoundedCornerShape(50)).background(c.inviatoFondo), contentAlignment = Alignment.Center) {
                    Icon(Icone.spunta, null, tint = c.inviatoTesto, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(10.dp))
                Text("Inviata a $inviata", style = Testi.forte, color = c.inviatoTesto, modifier = Modifier.weight(1f))
            }
            return@Scheda
        }
        CampoTesto(a, onA, "A", segnaposto = "email di ${d.nome}", errore = erroreA, tastiera = KeyboardType.Email)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Oggetto", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
            Text(oggetto, style = Testi.testo, color = c.testo2)
        }
        // Il PDF che parte: la prima pagina piccola e il nome del file.
        val file = esito?.file
        Row(
            Modifier.fillMaxWidth().heightIn(min = 72.dp).clip(RoundedCornerShape(14.dp)).background(c.fondo)
                .let { m -> if (file != null) m.clickable(onClick = onPdf).semantics { role = Role.Button } else m }
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.width(44.dp).height(62.dp).clip(RoundedCornerShape(4.dp)).background(Color.White).border(1.dp, c.bordoScheda, RoundedCornerShape(4.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (miniatura != null) Image(miniatura, null, Modifier.fillMaxSize().alpha(if (file != null) 1f else 0.45f), contentScale = ContentScale.Fit)
                else Icon(Icone.pdf, null, tint = c.tenue, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                when {
                    esito?.errore != null -> {
                        Text(esito.errore, style = Testi.secondario, color = c.rossoTesto)
                        PulsanteTesto("Riprova", onRiprova)
                    }
                    file != null -> {
                        Text(file.name, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                        Text(if (d.unSoloRapportino) "Il rapportino" else "Il riepilogo", style = Testi.secondario, color = c.tenue)
                    }
                    else -> Text("Preparo il PDF…", style = Testi.secondario, color = c.tenue)
                }
            }
        }
        if (inViaggio) Text("Invio in corso…", style = Testi.secondario, color = c.tenue)
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsanteTesto("Cambia il messaggio", onMessaggio, colore = c.testo)
    }
}

/**
 * Il PDF di un destinatario con gli stessi modelli del computer (rapportino/Stampa.kt): i lavori di un rapportino solo
 * col modello del rapportino (contratto del 06/11/2026: il primo argomento porta `lavori`), se no il riepilogo, una riga
 * per lavoro. Dal 12/11/2026 i due sono lo stesso foglio (foglioLavori in pc/ui/documenti.js), cambia solo la testa.
 */
private suspend fun creaPdf(ctx: Context, dati: Dati, d: Giornate.Destinatario, conImporti: Boolean, conFoto: Boolean): File {
    val ds = withContext(Dispatchers.Default) { dati.perStampa(d.lavori.map { it.idLocale }) }
    if (ds.rapportini.isEmpty()) throw Stampa.ErroreStampa("Non c'è niente da mettere nel PDF")
    val immagine: suspend (String) -> Pair<ByteArray, String>? = { dati.file(it) }
    return if (d.unSoloRapportino) {
        val g = Giornate.perPdf(ds.rapportini)
        Stampa.rapportino(ctx, g, ds.anagrafiche, conImporti, conFoto, Stampa.nomeInvio(g), immagine)
    } else {
        Stampa.riepilogo(ctx, ds.rapportiniJson(), ds.anagrafiche, conImporti, conFoto, immagine)
    }
}

/**
 * Le pagine del PDF come immagini, larghe [larghezza] pixel, al massimo [massimo].
 * Torna anche quante pagine ha il PDF. Il fondo è bianco: il PDF è trasparente.
 */
internal fun disegnaPagine(file: File, larghezza: Int, massimo: Int): Pair<List<Bitmap>, Int> {
    val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val lettore = try {
        PdfRenderer(fd)
    } catch (e: Exception) {
        fd.close()
        throw e
    }
    try {
        val n = lettore.pageCount
        val pagine = (0 until minOf(n, massimo)).map { i ->
            val p = lettore.openPage(i)
            try {
                val altezza = (larghezza * p.height.toFloat() / p.width).roundToInt().coerceAtLeast(1)
                Bitmap.createBitmap(larghezza, altezza, Bitmap.Config.ARGB_8888).also { b ->
                    b.eraseColor(android.graphics.Color.WHITE)
                    p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                }
            } finally {
                p.close()
            }
        }
        return pagine to n
    } finally {
        lettore.close()
    }
}

/**
 * La cornice grigia con la prima pagina vera del PDF. Mentre si rifà resta quella
 * di prima, velata; la prima volta un segnaposto calmo. Un tocco la ingrandisce.
 */
@Composable
internal fun CornicePdf(immagine: ImageBitmap?, pronto: EsitoPdf?, onIngrandisci: () -> Unit, onRiprova: () -> Unit) {
    val c = W.colori
    val errore = pronto?.errore
    val rapporto = immagine?.let { it.width.toFloat() / it.height } ?: (210f / 297f)
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.superficie2)
            .padding(horizontal = 46.dp, vertical = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        val forma = RoundedCornerShape(6.dp)
        Box(
            // Alta al massimo 300: sotto devono vedersi subito il destinatario e le scelte, non solo il foglio.
            Modifier.height(300.dp).aspectRatio(rapporto, matchHeightConstraintsFirst = true).clip(forma)
                .background(if (errore != null) c.scheda else Color.White)
                .border(1.dp, c.bordoScheda, forma)
                .let { m ->
                    if (pronto?.file != null && immagine != null) {
                        m.clickable(onClick = onIngrandisci).semantics { contentDescription = "Anteprima del PDF, tocca per ingrandirla"; role = Role.Button }
                    } else m
                },
            contentAlignment = Alignment.Center,
        ) {
            when {
                errore != null -> Column(
                    Modifier.padding(14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(errore, style = Testi.secondario, color = c.testo2, textAlign = TextAlign.Center)
                    PulsanteTesto("Riprova", onRiprova)
                }
                immagine != null -> Image(
                    immagine, null, Modifier.fillMaxSize().alpha(if (pronto?.file != null) 1f else 0.45f),
                    contentScale = ContentScale.Fit,
                )
                else -> SegnapostoPagina()
            }
        }
    }
}

/** Le righe grigie di una pagina che si sta facendo: pulsano piano, niente rotelle. */
@Composable
private fun SegnapostoPagina() {
    val pulsa = rememberInfiniteTransition(label = "segnaposto")
    val trasparenza by pulsa.animateFloat(0.35f, 0.75f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "trasparenza")
    val grigio = Color(0xFFE7E6E2)
    Column(
        Modifier.fillMaxSize().padding(14.dp).alpha(trasparenza).semantics { contentDescription = "Preparo il PDF" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Box(Modifier.fillMaxWidth(0.4f).height(10.dp).clip(RoundedCornerShape(3.dp)).background(grigio))
            Box(Modifier.fillMaxWidth(0.4f).height(10.dp).clip(RoundedCornerShape(3.dp)).background(grigio))
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(grigio))
        Box(Modifier.fillMaxWidth(0.55f).height(12.dp).clip(RoundedCornerShape(3.dp)).background(grigio))
        repeat(6) {
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(2.dp)).background(grigio))
        }
        Box(Modifier.weight(1f))
        Box(Modifier.fillMaxWidth(0.35f).height(8.dp).align(Alignment.End).clip(RoundedCornerShape(2.dp)).background(grigio))
    }
}

/**
 * Il PDF a tutto schermo: tutte le pagine (fino a sei), da allargare con due dita
 * o con un doppio tocco, da spostare con un dito. Si chiude con la × o con Indietro.
 */
@Composable
internal fun AnteprimaGrande(file: File, prima: ImageBitmap?, onChiudi: () -> Unit) {
    val c = W.colori
    var pagine by remember(file) { mutableStateOf(listOfNotNull(prima)) }
    var quante by remember(file) { mutableIntStateOf(1) }
    LaunchedEffect(file) {
        runCatching { withContext(Dispatchers.IO) { disegnaPagine(file, 1240, 6) } }
            .onSuccess { (bb, n) -> pagine = bb.map { it.asImageBitmap() }; quante = n }
    }
    Dialog(onDismissRequest = onChiudi, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(c.velo)) {
            PagineZoom(pagine, altre = (quante - pagine.size).coerceAtLeast(0))
            Box(Modifier.padding(16.dp)) { PulsanteTondo(Icone.chiudi, "Chiudi l'anteprima", onChiudi) }
        }
    }
}

@Composable
private fun PagineZoom(pagine: List<ImageBitmap>, altre: Int) {
    var scala by remember { mutableFloatStateOf(1f) }
    var spostamento by remember { mutableStateOf(Offset.Zero) }
    var vista by remember { mutableStateOf(IntSize.Zero) }
    var contenuto by remember { mutableStateOf(IntSize.Zero) }

    // Le pagine non escono mai del tutto dallo schermo.
    fun limita(o: Offset, s: Float): Offset {
        val minX = (vista.width - contenuto.width * s).coerceAtMost(0f)
        val minY = (vista.height - contenuto.height * s).coerceAtMost(0f)
        return Offset(o.x.coerceIn(minX, 0f), o.y.coerceIn(minY, 0f))
    }

    // Lo zoom resta sotto le dita: il punto toccato non scappa.
    fun ingrandisci(centro: Offset, nuova: Float, spinta: Offset = Offset.Zero) {
        val s = nuova.coerceIn(1f, 5f)
        val k = s / scala
        spostamento = limita((spostamento - centro) * k + centro + spinta, s)
        scala = s
    }

    Box(
        Modifier.fillMaxSize().clipToBounds().onSizeChanged { vista = it }
            .pointerInput(Unit) {
                detectTransformGestures { centro, spinta, zoom, _ -> ingrandisci(centro, scala * zoom, spinta) }
            }
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = { p -> ingrandisci(p, if (scala > 1.5f) 1f else 2.5f) })
            },
    ) {
        Column(
            Modifier.fillMaxWidth().wrapContentHeight(Alignment.Top, unbounded = true)
                .onSizeChanged { contenuto = it }
                .graphicsLayer {
                    transformOrigin = TransformOrigin(0f, 0f)
                    scaleX = scala
                    scaleY = scala
                    translationX = spostamento.x
                    translationY = spostamento.y
                }
                .padding(start = 16.dp, end = 16.dp, top = 76.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            pagine.forEachIndexed { i, p ->
                Image(
                    p, "Pagina ${i + 1}",
                    Modifier.fillMaxWidth().aspectRatio(p.width.toFloat() / p.height).clip(RoundedCornerShape(4.dp)).background(Color.White),
                    contentScale = ContentScale.Fit,
                )
            }
            if (altre > 0) {
                Text(
                    if (altre == 1) "L'ultima pagina si vede con Apri il PDF" else "Le altre $altre pagine si vedono con Apri il PDF",
                    style = Testi.secondario, color = Color.White, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
