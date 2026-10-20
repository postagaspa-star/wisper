package eu.stgm.wisper.ui

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateRectAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/**
 * La visita guidata (docs/aspetto.md §9): si impara sulle schermate vere, coi
 * dati di esempio, facendo le cose. Niente istruzioni scritte in piccolo nelle
 * schermate: quello che c'è da sapere lo dice la visita, una volta.
 */
class Visita {

    /** Un passo: l'elemento da illuminare, cosa dire, e se si va avanti leggendo o facendo. */
    data class Passo(
        val bersaglio: String?,
        val titolo: String,
        val frase: String,
        val fai: Boolean,
        val schermata: String,
    )

    val passi = listOf(
        Passo("giorno", "Il tuo giorno", "Qui vedi subito se il rapportino di oggi è scritto.", false, "oggi"),
        Passo("scrivi", "Scrivi il rapportino", "Tocca il pulsante giallo.", true, "oggi"),
        Passo("recente-0", "Per chi", "I clienti di questi giorni sono già qui. Tocca Elettrodinamica.", true, "rapportino"),
        Passo("ore-6", "Le ore", "Tocca 6 h, poi aggiusti con più e meno.", true, "rapportino"),
        Passo("km-ultimi", "I chilometri", "Wisper ricorda i km dell'ultima volta. Toccali.", true, "rapportino"),
        Passo("totale", "Il conto", "Il totale si aggiorna mentre scrivi.", false, "rapportino"),
        Passo("avanti", "Il lavoro", "Tocca Avanti per scrivere cosa hai fatto.", true, "rapportino"),
        Passo("scontrino", "Gli scontrini", "Fotografa lo scontrino subito, o aggiungilo dopo.", false, "rapportino"),
        Passo("avanti", "Il riepilogo", "Tocca Avanti per vedere tutto prima di salvare.", true, "rapportino"),
        Passo("firma", "La firma", "Il cliente firma col dito sul tuo telefono.", false, "rapportino"),
        Passo("manca", "I giorni che mancano", "Un giorno senza rapportino si vede subito: toccalo per scriverlo.", false, "oggi"),
        Passo(null, "Ecco fatto", "Adesso Wisper lavora con i tuoi rapportini veri.", false, "oggi"),
    )

    var attiva by mutableStateOf(false)
        private set
    var indice by mutableIntStateOf(0)
        private set

    /** Il fumetto fa un piccolo scatto quando si tocca fuori dal riflettore. */
    var scatto by mutableIntStateOf(0)

    /** Dove sono gli elementi delle schermate, in coordinate della finestra. */
    val bersagli = mutableStateMapOf<String, Rect>()

    /** Chi apre le schermate: lo imposta MainActivity. */
    var vaiA: (String) -> Unit = {}
    var allaFine: () -> Unit = {}

    val corrente: Passo get() = passi[indice.coerceIn(0, passi.lastIndex)]
    val ultimo: Boolean get() = indice == passi.lastIndex

    fun inizia() {
        bersagli.clear()
        indice = 0
        attiva = true
        vaiA("oggi")
    }

    fun avanti() {
        if (ultimo) { fine(); return }
        val prima = corrente
        indice++
        // Dal riepilogo si torna a Oggi per l'ultimo passo: la schermata la cambia la visita.
        if (corrente.schermata != prima.schermata && !prima.fai) vaiA(corrente.schermata)
    }

    fun indietro() {
        if (indice > 0 && passi[indice - 1].schermata == corrente.schermata && !passi[indice - 1].fai) indice--
    }

    val puoTornare: Boolean get() = indice > 0 && passi[indice - 1].schermata == corrente.schermata && !passi[indice - 1].fai

    /** Le schermate lo chiamano quando si fa un'azione: se è quella che il passo chiede, si va avanti. */
    fun azione(id: String) {
        if (attiva && corrente.fai && corrente.bersaglio == id) avanti()
    }

    fun salta() = fine()

    private fun fine() {
        attiva = false
        indice = 0
        allaFine()
    }
}

val LocalVisita = staticCompositionLocalOf<Visita?> { null }

/** Segna un elemento come possibile bersaglio del riflettore. */
fun Modifier.bersaglio(id: String): Modifier = composed {
    val v = LocalVisita.current
    if (v == null || !v.attiva) this
    else this.onGloballyPositioned { v.bersagli[id] = it.boundsInRoot() }
}

/** Il velo, il riflettore, il fumetto e la mano. Si mette sopra a tutta l'app. */
@Composable
fun StratoVisita(visita: Visita) {
    if (!visita.attiva) return
    val c = W.colori
    val densita = LocalDensity.current
    val ctx = LocalContext.current
    val menoAnimazioni = remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val passo = visita.corrente
    val margine = with(densita) { 8.dp.toPx() }
    val bersaglio = passo.bersaglio?.let { visita.bersagli[it] }?.let {
        Rect(it.left - margine, it.top - margine, it.right + margine, it.bottom + margine)
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val larghezza = with(densita) { maxWidth.toPx() }
        val altezza = with(densita) { maxHeight.toPx() }
        val vuoto = Rect(larghezza / 2, altezza / 2, larghezza / 2, altezza / 2)
        val buco by animateRectAsState(bersaglio ?: vuoto, tween(if (menoAnimazioni) 0 else 320), label = "riflettore")
        val pulsa = rememberInfiniteTransition(label = "anello")
        val alfaAnello by pulsa.animateFloat(
            0.55f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "alfa",
        )

        // Il velo con il buco.
        Canvas(Modifier.fillMaxSize().graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }) {
            drawRect(c.velo)
            if (bersaglio != null) {
                val r = 18.dp.toPx()
                drawRoundRect(Color.Transparent, Offset(buco.left, buco.top), Size(buco.width, buco.height), CornerRadius(r), blendMode = BlendMode.Clear)
                drawRoundRect(
                    c.giallo.copy(alpha = if (menoAnimazioni) 1f else alfaAnello), Offset(buco.left, buco.top), Size(buco.width, buco.height),
                    CornerRadius(r), style = Stroke(3.dp.toPx()),
                )
            }
        }

        // Fuori dal buco i tocchi si fermano qui. Dentro passano all'elemento vero,
        // ma solo nei passi da fare: in quelli da leggere si va avanti col fumetto.
        val blocca = Modifier.pointerInput(visita.indice) { detectTapGestures { visita.scatto++ } }
        if (bersaglio == null || !passo.fai) {
            Box(Modifier.fillMaxSize().then(blocca))
        } else {
            val b = buco
            with(densita) {
                Box(Modifier.offset(0.dp, 0.dp).size(maxWidth, b.top.coerceAtLeast(0f).toDp()).then(blocca))
                Box(Modifier.offset(0.dp, b.bottom.toDp()).size(maxWidth, (altezza - b.bottom).coerceAtLeast(0f).toDp()).then(blocca))
                Box(Modifier.offset(0.dp, b.top.toDp()).size(b.left.coerceAtLeast(0f).toDp(), b.height.toDp()).then(blocca))
                Box(Modifier.offset(b.right.toDp(), b.top.toDp()).size((larghezza - b.right).coerceAtLeast(0f).toDp(), b.height.toDp()).then(blocca))
            }
        }

        // La mano: un dito che tocca, finché non lo fai tu. Un anello vuoto,
        // spostato verso l'angolo, per non coprire la scritta del pulsante.
        if (bersaglio != null && passo.fai) {
            val premi by pulsa.animateFloat(1f, 0.8f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "mano")
            val lato = with(densita) { 40.dp.toPx() }
            val dx = minOf(buco.width * 0.36f, with(densita) { 120.dp.toPx() })
            val dy = buco.height * 0.18f
            Box(
                Modifier
                    .offset { IntOffset((buco.center.x + dx - lato / 2).roundToInt(), (buco.center.y + dy - lato / 2).roundToInt()) }
                    .size(40.dp)
                    .graphicsLayer { val s = if (menoAnimazioni) 1f else premi; scaleX = s; scaleY = s }
                    .border(3.dp, c.suGiallo.copy(alpha = 0.75f), CircleShape)
                    .padding(3.dp)
                    .border(2.dp, Color.White.copy(alpha = 0.9f), CircleShape),
            )
        }

        // In alto: "Salta la visita" (all'ultimo passo non serve più).
        if (!visita.ultimo) Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.height(40.dp).clip(RoundedCornerShape(50)).background(c.scheda).clickable { visita.salta() }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Salta la visita", style = Testi.secondario.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.testo) }
        }

        // Il fumetto: sotto il buco se c'è posto, altrimenti sopra; al centro senza buco.
        val scatto = remember { Animatable(0f) }
        LaunchedEffect(visita.scatto) {
            if (visita.scatto > 0 && !menoAnimazioni) {
                scatto.animateTo(10f, tween(60)); scatto.animateTo(-8f, tween(80)); scatto.animateTo(0f, tween(80))
            }
        }
        var altezzaFumetto by remember { mutableIntStateOf(with(densita) { 170.dp.roundToPx() }) }
        val y = when {
            bersaglio == null -> (altezza - altezzaFumetto) / 2
            buco.bottom + altezzaFumetto + 24 < altezza -> buco.bottom + with(densita) { 14.dp.toPx() }
            else -> (buco.top - altezzaFumetto - with(densita) { 14.dp.toPx() }).coerceAtLeast(with(densita) { 60.dp.toPx() })
        }
        Column(
            Modifier
                .offset { IntOffset(scatto.value.roundToInt(), y.roundToInt()) }
                .onSizeChanged { altezzaFumetto = it.height }
                .padding(horizontal = 20.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(c.scheda)
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // "Esempio": i dati che si vedono non sono i suoi.
            if (!visita.ultimo) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Esempio", style = Testi.pillola, color = c.gialloTesto,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(c.gialloTenue).padding(horizontal = 9.dp, vertical = 3.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text("${visita.indice + 1} di ${visita.passi.size - 1}", style = Testi.piccolo, color = c.tenue)
            }
            Text(passo.titolo, style = Testi.titoloSezione, color = c.testo)
            Text(passo.frase, style = Testi.testo, color = c.testo2)
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (visita.puoTornare) PulsanteTesto("Indietro", { visita.indietro() }, colore = c.testo2)
                Spacer(Modifier.weight(1f))
                if (!passo.fai) {
                    Box(
                        Modifier.height(48.dp).clip(RoundedCornerShape(14.dp)).background(c.giallo)
                            .clickable { visita.avanti() }.padding(horizontal = 20.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (visita.ultimo) "Inizia" else "Avanti", style = Testi.pulsanteSecondario.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold), color = c.suGiallo)
                            if (!visita.ultimo) {
                                Spacer(Modifier.width(6.dp))
                                Icon(Icone.freccia, null, tint = c.suGiallo, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
