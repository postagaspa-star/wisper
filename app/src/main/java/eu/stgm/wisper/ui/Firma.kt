package eu.stgm.wisper.ui

import android.graphics.Bitmap
import android.graphics.Paint
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Il cliente firma col dito sul telefono del tecnico.
 *
 * Niente QR code: in Pleya per far firmare il cliente dal suo telefono bisogna
 * inquadrare un codice, e la risposta di chi lo deve usare e' stata "questa
 * roba e' ancora piu' complicata". Il cliente e' li' davanti: gli si passa il
 * telefono, scrive il suo nome e firma.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchermataFirma(
    titolo: String,
    onConferma: (Bitmap, String) -> Unit,
    onAnnulla: () -> Unit,
) {
    val tratti = remember { mutableStateListOf<List<Offset>>() }
    var tratto by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var nome by remember { mutableStateOf("") }
    var dimensione by remember { mutableStateOf(IntSize.Zero) }
    val spessore = with(LocalDensity.current) { 3.dp.toPx() }

    BackHandler { onAnnulla() }

    Scaffold(
        containerColor = Nero,
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = onAnnulla) { Icon(Icons.Default.ArrowBack, "Indietro") } },
                title = {
                    Column {
                        Text("Firma del cliente", style = MaterialTheme.typography.titleMedium)
                        Text(titolo, color = Smorzato, fontSize = 12.sp)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Nero),
            )
        },
    ) { margini ->
        Column(
            Modifier.fillMaxSize().padding(margini).padding(horizontal = 16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CampoTesto(nome, { nome = it }, "Nome e cognome di chi firma")
            Text(
                "Firmando confermi il lavoro e le ore scritte nel rapportino.",
                color = Smorzato, fontSize = 14.sp,
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.White)
                    .onSizeChanged { dimensione = it }
                    .pointerInput(Unit) {
                        detectDragGestures(
                            onDragStart = { tratto = listOf(it) },
                            onDrag = { cambio, _ -> tratto = tratto + cambio.position },
                            onDragEnd = { tratti.add(tratto); tratto = emptyList() },
                            onDragCancel = { tratti.add(tratto); tratto = emptyList() },
                        )
                    }
                    .pointerInput(Unit) {
                        // Un tocco solo e' un punto: le "i" della firma.
                        detectTapGestures(onTap = { tratti.add(listOf(it, it + Offset(0.5f, 0.5f))) })
                    },
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    (tratti + listOf(tratto)).forEach { punti ->
                        if (punti.size < 2) return@forEach
                        val p = Path().apply {
                            moveTo(punti.first().x, punti.first().y)
                            punti.drop(1).forEach { lineTo(it.x, it.y) }
                        }
                        drawPath(p, Color(0xFF101418), style = Stroke(spessore, cap = StrokeCap.Round, join = StrokeJoin.Round))
                    }
                }
                if (tratti.isEmpty() && tratto.isEmpty()) {
                    Text("Firma qui col dito", color = Color(0xFF9AA3B2), modifier = Modifier.align(Alignment.Center))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 10.dp)) {
                OutlinedButton(onClick = { tratti.clear() }, modifier = Modifier.weight(1f).height(52.dp)) { Text("Cancella") }
                Button(
                    onClick = { onConferma(disegna(tratti, dimensione, spessore), nome.trim()) },
                    enabled = tratti.isNotEmpty() && nome.isNotBlank() && dimensione != IntSize.Zero,
                    modifier = Modifier.weight(1.4f).height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Giallo, contentColor = Nero),
                ) { Text("Conferma firma") }
            }
            Spacer(Modifier.height(4.dp))
        }
    }
}

/** La firma come immagine: tratti scuri su bianco, pronta per il PDF. */
private fun disegna(tratti: List<List<Offset>>, dimensione: IntSize, spessore: Float): Bitmap {
    val bmp = Bitmap.createBitmap(dimensione.width, dimensione.height, Bitmap.Config.ARGB_8888)
    val tela = android.graphics.Canvas(bmp)
    tela.drawColor(android.graphics.Color.WHITE)
    val pennello = Paint().apply {
        color = 0xFF101418.toInt()
        strokeWidth = spessore
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }
    tratti.filter { it.size >= 2 }.forEach { punti ->
        val p = android.graphics.Path().apply {
            moveTo(punti.first().x, punti.first().y)
            punti.drop(1).forEach { lineTo(it.x, it.y) }
        }
        tela.drawPath(p, pennello)
    }
    return bmp
}
