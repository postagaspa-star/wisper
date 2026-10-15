package eu.stgm.wisper.ui

import android.graphics.Bitmap
import android.graphics.Paint
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Il cliente firma col dito sul telefono del tecnico.
 *
 * Niente QR code: in Pleya per far firmare il cliente dal suo telefono bisogna
 * inquadrare un codice, e la risposta di chi lo deve usare e' stata "questa
 * roba e' ancora piu' complicata". Il cliente e' li' davanti: gli si passa il
 * telefono, scrive il suo nome e firma.
 */
@Composable
fun SchermataFirma(
    rapportino: Rapportino?,
    onConferma: (Bitmap, String) -> Unit,
    onAnnulla: () -> Unit,
) {
    // Il cliente firma su un foglio bianco, anche se il telefono è in tema scuro.
    ConColori(Chiaro) { Firma(rapportino, onConferma, onAnnulla) }
}

@Composable
private fun Firma(r: Rapportino?, onConferma: (Bitmap, String) -> Unit, onAnnulla: () -> Unit) {
    val c = W.colori
    val tratti = remember { mutableStateListOf<List<Offset>>() }
    var tratto by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var nome by remember { mutableStateOf("") }
    var dimensione by remember { mutableStateOf(IntSize.Zero) }
    val spessore = with(LocalDensity.current) { 3.dp.toPx() }
    val pronto = tratti.isNotEmpty() && nome.isNotBlank() && dimensione != IntSize.Zero

    BackHandler { onAnnulla() }

    Column(Modifier.fillMaxSize().background(c.fondo).statusBarsPadding().navigationBarsPadding()) {
        Column(
            Modifier.weight(1f).padding(horizontal = 20.dp).padding(top = 10.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
                PulsanteTondo(Icone.indietro, "Indietro", onAnnulla)
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (r != null) {
                    Text(
                        r.cliente + " · " + r.data.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALY)),
                        style = Testi.secondarioGrande, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
                Text("Firma del cliente", style = Testi.titoloPagina, color = c.testo)
            }
            if (r != null) {
                // Il lavoro e le ore, mai i soldi: il telefono adesso è in mano al cliente.
                Scheda(spazio = 6.dp) {
                    Text(r.descrizione, style = Testi.forte, color = c.testo, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOf("${Numeri.ore(r.oreLavoro + r.oreExtra)} di lavoro", r.oreViaggio.takeIf { it > 0 }?.let { "${Numeri.ore(it)} di viaggio" },
                            "${Numeri.scrivi(r.km)} km").filterNotNull().joinToString(" · "),
                        style = Testi.secondarioGrande, color = c.testo2,
                    )
                }
            }
            CampoTesto(nome, { nome = it }, "Nome di chi firma", stile = Testi.titoloSezione.copy(fontWeight = FontWeight.SemiBold))
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .clip(RoundedCornerShape(22.dp))
                    .background(Color.White)
                    .border(1.5.dp, c.bordoCampo, RoundedCornerShape(22.dp))
                    .onSizeChanged { dimensione = it }
                    .pointerInput(Unit) {
                        // Il dito si segue da quando tocca, non da quando "trascina":
                        // il riconoscimento del trascinamento parte dopo qualche
                        // pixel, e ogni tratto della firma perdeva il suo inizio.
                        awaitEachGesture {
                            val giu = awaitFirstDown()
                            var punti = listOf(giu.position)
                            tratto = punti
                            while (true) {
                                val dito = awaitPointerEvent().changes.firstOrNull { it.id == giu.id } ?: break
                                if (!dito.pressed) break
                                punti = punti + dito.position
                                tratto = punti
                                dito.consume()
                            }
                            // Un tocco solo e' un punto: le "i" della firma.
                            tratti.add(if (punti.size == 1) listOf(punti[0], punti[0] + Offset(0.5f, 0.5f)) else punti)
                            tratto = emptyList()
                        }
                    },
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    (tratti + listOf(tratto)).forEach { punti ->
                        if (punti.size < 2) return@forEach
                        val p = Path().apply {
                            moveTo(punti.first().x, punti.first().y)
                            punti.drop(1).forEach { lineTo(it.x, it.y) }
                        }
                        drawPath(p, Color(0xFF1B1B1F), style = Stroke(spessore, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    }
                }
                Box(Modifier.align(Alignment.BottomCenter).padding(start = 24.dp, end = 24.dp, bottom = 54.dp).fillMaxWidth().height(1.5.dp).background(c.superficie2))
                Text(
                    "Firmando confermi lavoro e ore del rapportino", style = Testi.secondario, color = c.tenue,
                    modifier = Modifier.align(Alignment.BottomStart).padding(start = 24.dp, bottom = 20.dp),
                )
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            PulsanteBordo("Cancella", { tratti.clear() }, Modifier.weight(1f), altezza = 64.dp, stile = Testi.pulsanteSecondario)
            PulsantePrincipale(
                "Conferma firma",
                { if (pronto) onConferma(disegna(tratti, dimensione, spessore), nome.trim()) },
                Modifier.weight(1.6f), icona = Icone.spunta, abilitato = pronto,
            )
        }
    }
}

/**
 * La firma come immagine: tratti scuri su bianco, ritagliata attorno ai tratti.
 *
 * Senza ritaglio l'immagine era grande quanto tutto il riquadro, quasi tutta
 * bianca: nello spazio della firma sul PDF diventava un segnetto illeggibile.
 */
private fun disegna(tratti: List<List<Offset>>, dimensione: IntSize, spessore: Float): Bitmap {
    val punti = tratti.flatten()
    val margine = spessore * 4
    val sinistra = ((punti.minOfOrNull { it.x } ?: 0f) - margine).coerceAtLeast(0f)
    val alto = ((punti.minOfOrNull { it.y } ?: 0f) - margine).coerceAtLeast(0f)
    val destra = ((punti.maxOfOrNull { it.x } ?: dimensione.width.toFloat()) + margine).coerceAtMost(dimensione.width.toFloat())
    val basso = ((punti.maxOfOrNull { it.y } ?: dimensione.height.toFloat()) + margine).coerceAtMost(dimensione.height.toFloat())
    val larghezza = (destra - sinistra).toInt().coerceAtLeast(1)
    val altezza = (basso - alto).toInt().coerceAtLeast(1)

    val bmp = Bitmap.createBitmap(larghezza, altezza, Bitmap.Config.ARGB_8888)
    val tela = android.graphics.Canvas(bmp)
    tela.drawColor(android.graphics.Color.WHITE)
    tela.translate(-sinistra, -alto)
    val pennello = Paint().apply {
        color = 0xFF101418.toInt()
        strokeWidth = spessore
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }
    tratti.filter { it.size >= 2 }.forEach { tratto ->
        val p = android.graphics.Path().apply {
            moveTo(tratto.first().x, tratto.first().y)
            tratto.drop(1).forEach { lineTo(it.x, it.y) }
        }
        tela.drawPath(p, pennello)
    }
    return bmp
}
