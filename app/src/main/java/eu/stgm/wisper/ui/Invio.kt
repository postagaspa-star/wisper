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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val IT = Locale.ITALY
private val DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy")

/** Cosa si manda, dalla rotta invio/<cosa> (docs/telefono-ufficio.md, tabella "Rotte"). */
private sealed interface CosaInvio {
    /** Il riepilogo del mese di un cliente: i suoi rapportini firmati e inviati. */
    data class DelCliente(val chiave: String, val mese: YearMonth?) : CosaInvio
    /** Un rapportino solo, al suo cliente. */
    data class Uno(val idLocale: String) : CosaInvio
    /** Il riepilogo dei rapportini scelti nella sezione Rapportini. */
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

/** I rapportini da mettere nel PDF, il più vecchio prima (come preparaInvio del computer). */
private fun rapportiniDa(cosa: CosaInvio?, tutti: List<Rapportino>, ana: Anagrafiche): List<Rapportino> = when (cosa) {
    is CosaInvio.DelCliente -> tutti.filter { r ->
        Conti.daFatturare(r) && (cosa.mese == null || YearMonth.from(r.data) == cosa.mese) &&
            (chiaveRotta(r, ana) == cosa.chiave || (r.idCliente.isNotBlank() && r.idCliente == cosa.chiave))
    }
    is CosaInvio.Uno -> tutti.filter { it.idLocale == cosa.idLocale }.take(1)
    is CosaInvio.Scelti -> tutti.filter { it.idLocale in cosa.idLocali }
    null -> emptyList()
}.sortedWith(compareBy<Rapportino> { it.data }.thenBy { it.id })

/**
 * "di ottobre" nel titolo: il mese senza l'anno se è quest'anno, come si dice a voce.
 * Più mesi: "di settembre – ottobre".
 */
private fun titoloPeriodo(lista: List<Rapportino>): String {
    val mesi = lista.map { YearMonth.from(it.data) }.distinct().sorted()
    fun nome(m: YearMonth): String {
        val n = Conti.nomeMese(m).lowercase()
        return if (m.year == YearMonth.now().year) n.substringBefore(' ') else n
    }
    return when (mesi.size) {
        0 -> ""
        1 -> nome(mesi[0])
        else -> nome(mesi.first()) + " – " + nome(mesi.last())
    }
}

/** L'esito dell'ultimo PDF fatto, legato alle scelte con cui lo si è fatto. */
private class EsitoPdf(val chiave: String, val file: File?, val errore: String?)

/**
 * Prepara il riepilogo, o invia un rapportino solo (docs/telefono-ufficio.md,
 * prototipo SCHERMI.riepilogo, preparaInvio di pc/ui/app.js): la pagina vera del
 * PDF, a chi va, cosa contiene, poi Invia per email. È un compito: niente barra in
 * basso, si esce con la ×.
 *
 * Gli importi ci sono nel riepilogo (serve per la fattura), non nel rapportino
 * singolo (al cliente di solito serve il lavoro, non il conto). L'email parte una
 * volta sola per tocco: due tentativi sarebbero due email.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataInvio(dati: Dati, nav: Navigatore, cosa: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()

    val richiesta = remember(cosa) { leggiCosa(cosa) }
    val singolo = richiesta is CosaInvio.Uno
    val lista = remember(storico, ana, richiesta) { rapportiniDa(richiesta, storico.conConti(), ana) }
    val r0 = lista.firstOrNull()
    val intest = when {
        r0 == null -> Conti.Intestatario("")
        singolo -> Conti.intestatarioRapportino(r0, ana)
        else -> Conti.intestatarioRiepilogo(lista, ana)
    }
    val periodo = Conti.periodoDi(lista)
    val totale = Conti.totali(lista).totale

    // Le scelte: null = quella proposta, che segue i dati quando arrivano dal foglio.
    var conImporti by rememberSaveable(cosa) { mutableStateOf(!singolo) }
    var conFoto by rememberSaveable(cosa) { mutableStateOf(false) }
    var aScritto by rememberSaveable(cosa) { mutableStateOf<String?>(null) }
    var ccScritto by rememberSaveable(cosa) { mutableStateOf("") }
    var oggettoScritto by rememberSaveable(cosa) { mutableStateOf<String?>(null) }
    var messaggioScritto by rememberSaveable(cosa) { mutableStateOf<String?>(null) }

    val a = aScritto ?: intest.email
    val oggetto = oggettoScritto ?: when {
        r0 == null -> ""
        singolo -> "Rapportino " + (if (r0.id.isNotBlank()) r0.id + " " else "") + "del " + r0.data.format(DATA)
        else -> "Rapportini $periodo" + if (intest.nome != Conti.VARI_CLIENTI) " · ${intest.nome}" else ""
    }
    val firmaEmail = ana.impostazione(Anagrafiche.TECNICO).ifBlank { ana.ragioneSociale }
    val messaggio = messaggioScritto ?: when {
        r0 == null -> ""
        singolo -> "Buongiorno,\nin allegato il rapportino del ${r0.data.format(DATA)}."
        else -> "Buongiorno,\nin allegato il riepilogo dei rapportini di ${periodo.lowercase()}."
    } + "\n\nCordiali saluti\n" + firmaEmail

    var erroreA by remember { mutableStateOf<String?>(null) }
    var erroreInvio by remember { mutableStateOf<String?>(null) }
    var foglioMessaggio by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var grande by remember { mutableStateOf(false) }
    val campoA = remember { FocusRequester() }

    // "invio", "copia", "apri", "condividi": cosa si sta aspettando. Un tocco alla volta.
    var occupato by remember { mutableStateOf<String?>(null) }
    // Vero solo mentre l'email è in viaggio: allora non si esce, o non si saprebbe se è partita.
    var inRete by remember { mutableStateOf(false) }

    // ---- il PDF: si rifà quando cambiano i rapportini o le scelte, e si guarda com'è davvero
    var tentativo by remember { mutableIntStateOf(0) }
    val chiave = "${lista.hashCode()}|$conImporti|$conFoto|$tentativo"
    val chiaveAttuale = rememberUpdatedState(chiave)
    var esito by remember { mutableStateOf<EsitoPdf?>(null) }
    var anteprima by remember { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(chiave) {
        if (lista.isEmpty()) return@LaunchedEffect
        // Due interruttori toccati di fila fanno un PDF solo.
        delay(250)
        esito = try {
            val file = creaPdf(ctx, dati, lista.map { it.idLocale }, singolo, conImporti, conFoto)
            anteprima = withContext(Dispatchers.IO) { disegnaPagine(file, 1080, 1).first.firstOrNull()?.asImageBitmap() }
            EsitoPdf(chiave, file, null)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            EsitoPdf(chiave, null, (e as? Stampa.ErroreStampa)?.message ?: "Il PDF non si è creato. Riprova.")
        }
    }
    val pronto = esito?.takeIf { it.chiave == chiave }

    /** Il PDF delle scelte di adesso: lo aspetta se si sta ancora facendo, mai per sempre. */
    suspend fun pdfPronto(): File? {
        val e = withTimeoutOrNull(200_000L) {
            snapshotFlow { esito to chiaveAttuale.value }.first { (es, k) -> es?.chiave == k }.first
        }
        return when {
            e == null -> { erroreInvio = "Il PDF non è ancora pronto. Riprova fra poco."; null }
            e.file == null -> { erroreInvio = e.errore; null }
            else -> e.file
        }
    }

    fun manda(aMe: Boolean) {
        if (occupato != null) return
        val indirizzo = a.trim()
        if (!aMe && indirizzo.isBlank()) {
            erroreA = "Manca l'indirizzo: scrivilo qui"
            runCatching { campoA.requestFocus() }
            return
        }
        erroreInvio = null
        occupato = if (aMe) "copia" else "invio"
        scope.launch {
            try {
                val pdf = pdfPronto() ?: return@launch
                inRete = true
                val ris = dati.inviaEmail(indirizzo, ccScritto.trim(), oggetto, messaggio, pdf, lista.map { it.idLocale }, aMe)
                inRete = false
                ris.onSuccess {
                    val esempio = if (dati.esempio) " (esempio: non è partito niente)" else ""
                    if (aMe) avvisi.mostra("Copia mandata alla tua casella$esempio")
                    else {
                        nav.indietro()
                        avvisi.mostra((if (singolo) "Rapportino" else "Riepilogo") + " inviato a $indirizzo$esempio")
                    }
                }.onFailure { erroreInvio = it.message ?: "L'email non è partita. Riprova." }
            } finally {
                inRete = false
                occupato = null
            }
        }
    }

    fun conPdf(cosa: String, fai: (File) -> Unit) {
        if (occupato != null) return
        erroreInvio = null
        occupato = cosa
        scope.launch {
            try {
                pdfPronto()?.let(fai)
            } finally {
                occupato = null
            }
        }
    }

    BackHandler(enabled = inRete) { /* l'email è in viaggio: si aspetta la risposta */ }

    val tastiera = WindowInsets.isImeVisible
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(MarginePagina).padding(bottom = 250.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { if (!inRete) nav.indietro() }, chiudi = true) {
                if (r0 != null) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
            }

            if (r0 == null) {
                TitoloPagina(if (singolo) "Rapportino" else "Riepilogo")
                Text(
                    if (singolo) "Il rapportino non c'è più: forse è stato eliminato." else "Non c'è niente da mettere nel riepilogo.",
                    style = Testi.testo, color = c.tenue,
                )
                return@Column
            }

            TitoloPagina(
                if (singolo) "Rapportino " + r0.id.substringAfterLast('/').ifBlank { "del " + r0.data.format(DateTimeFormatter.ofPattern("d MMMM", IT)) }
                else "Riepilogo di ${titoloPeriodo(lista)}",
                sopra = "${intest.nome} · ${Numeri.euro(totale)}",
            )

            CornicePdf(
                immagine = anteprima,
                pronto = pronto,
                onIngrandisci = { if (pronto?.file != null) grande = true },
                onRiprova = { tentativo++ },
            )

            CampoTesto(
                a, { aScritto = it; erroreA = null }, "A",
                modifier = Modifier.focusRequester(campoA),
                segnaposto = "email di ${intest.nome}",
                errore = erroreA,
                tastiera = KeyboardType.Email,
            )

            Scheda(orizzontale = 18.dp, verticale = 6.dp, spazio = 0.dp) {
                RigaInterruttore("Con gli importi", conImporti) { conImporti = it }
                LineaElenco()
                RigaInterruttore("Con le foto degli scontrini", conFoto) { conFoto = it }
                LineaElenco()
                RigaVoce("Messaggio", sotto = oggetto, onClick = { foglioMessaggio = true })
            }
        }

        if (r0 != null && !tastiera) {
            val daSegnare = lista.filter { it.stato == Stato.BOZZA || it.stato == Stato.FIRMATO }
            FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
                erroreInvio?.let { Text(it, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.fillMaxWidth()) }
                PulsantePrincipale(
                    when (occupato) {
                        "invio" -> "Invio in corso…"
                        "copia" -> "Mando la copia…"
                        else -> "Invia per email"
                    },
                    { manda(aMe = false) },
                    icona = if (occupato == "invio" || occupato == "copia") null else Icone.invia,
                    abilitato = occupato == null,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteBordo(
                        if (occupato == "apri") "Preparo…" else "Apri il PDF",
                        {
                            conPdf("apri") { f ->
                                if (!Stampa.apri(ctx, f)) avvisi.mostra("Sul telefono non c'è un'app per i PDF: usa Condividi")
                            }
                        },
                        Modifier.weight(1f), icona = Icone.pdf,
                    )
                    PulsanteBordo(
                        if (occupato == "condividi") "Preparo…" else "Condividi",
                        { conPdf("condividi") { f -> Stampa.condividi(ctx, f, oggetto) } },
                        Modifier.weight(1f), icona = Icone.condividi,
                    )
                }
                if (daSegnare.isNotEmpty()) {
                    PulsanteTesto(
                        "Segna come inviato senza email",
                        {
                            if (occupato == null) {
                                val cambio = dati.cambiaStato(daSegnare.map { it.idLocale }, Stato.INVIATO)
                                nav.indietro()
                                avvisi.mostra(
                                    if (cambio.quanti == 1) "Segnato inviato" else "Segnati inviati",
                                    annulla = if (cambio.quanti > 0) ({ dati.annullaCambioStato(cambio) }) else null,
                                )
                            }
                        },
                        Modifier.fillMaxWidth().height(48.dp),
                        colore = c.tenue,
                    )
                }
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            VoceMenu(Icone.invia, "Mandane una copia a me", {
                menu = false
                manda(aMe = true)
            })
        }
    }

    if (foglioMessaggio) {
        FoglioDalBasso({ foglioMessaggio = false }) {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Messaggio", style = Testi.titoloScheda, color = c.testo)
                CampoTesto(oggetto, { oggettoScritto = it }, "Oggetto")
                CampoTesto(ccScritto, { ccScritto = it }, "Copia anche a", segnaposto = "—", tastiera = KeyboardType.Email)
                CampoTesto(messaggio, { messaggioScritto = it }, "Messaggio", righe = 6)
                PulsantePrincipale("Fatto", { foglioMessaggio = false }, altezza = 52.dp)
            }
        }
    }

    val file = pronto?.file
    if (grande && file != null) AnteprimaGrande(file, anteprima) { grande = false }
}

/** Crea il PDF con gli stessi modelli del computer (rapportino/Stampa.kt). */
private suspend fun creaPdf(ctx: Context, dati: Dati, idLocali: List<String>, singolo: Boolean, conImporti: Boolean, conFoto: Boolean): File {
    val d = withContext(Dispatchers.Default) { dati.perStampa(idLocali) }
    if (d.rapportini.isEmpty()) throw Stampa.ErroreStampa("Non c'è niente da mettere nel PDF")
    val immagine: suspend (String) -> Pair<ByteArray, String>? = { dati.file(it) }
    return if (singolo) {
        val r = d.rapportini[0]
        Stampa.rapportino(ctx, r, d.anagrafiche, conImporti, conFoto, Stampa.nomeInvio(r), immagine)
    } else {
        Stampa.riepilogo(ctx, d.rapportiniJson(), d.anagrafiche, conImporti, conFoto, immagine)
    }
}

/**
 * Le pagine del PDF come immagini, larghe [larghezza] pixel, al massimo [massimo].
 * Torna anche quante pagine ha il PDF. Il fondo è bianco: il PDF è trasparente.
 */
private fun disegnaPagine(file: File, larghezza: Int, massimo: Int): Pair<List<Bitmap>, Int> {
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
private fun CornicePdf(immagine: ImageBitmap?, pronto: EsitoPdf?, onIngrandisci: () -> Unit, onRiprova: () -> Unit) {
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
private fun AnteprimaGrande(file: File, prima: ImageBitmap?, onChiudi: () -> Unit) {
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
