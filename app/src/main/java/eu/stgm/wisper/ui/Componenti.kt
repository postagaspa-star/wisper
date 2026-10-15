package eu.stgm.wisper.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Stato
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** Una scheda bianca col bordo: niente ombre, che al sole tolgono contrasto. */
@Composable
fun Scheda(
    modifier: Modifier = Modifier,
    orizzontale: Dp = 16.dp,
    verticale: Dp = 14.dp,
    raggio: Dp = 22.dp,
    spazio: Dp = 12.dp,
    contenuto: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(raggio))
            .background(W.colori.scheda)
            .border(1.dp, W.colori.bordoScheda, RoundedCornerShape(raggio))
            .padding(horizontal = orizzontale, vertical = verticale),
        verticalArrangement = Arrangement.spacedBy(spazio),
        content = contenuto,
    )
}

@Composable
fun Etichetta(testo: String, modifier: Modifier = Modifier) {
    Text(testo.uppercase(), style = Testi.etichetta, color = W.colori.tenue, modifier = modifier)
}

/** Il pulsante della cosa da fare adesso: uno per schermata, giallo, in basso, alto 64. */
@Composable
fun PulsantePrincipale(
    testo: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icona: ImageVector? = null,
    abilitato: Boolean = true,
    altezza: Dp = 64.dp,
) {
    val c = W.colori
    Row(
        modifier
            .fillMaxWidth()
            .height(altezza)
            .clip(RoundedCornerShape(18.dp))
            .background(if (abilitato) c.giallo else c.superficie2)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icona != null) {
            Icon(icona, null, tint = if (abilitato) c.suGiallo else c.moltoTenue, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(testo, style = Testi.pulsante, color = if (abilitato) c.suGiallo else c.moltoTenue)
    }
}

/** Il pulsante secondario: bordo ben visibile, fondo della scheda. */
@Composable
fun PulsanteBordo(
    testo: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icona: ImageVector? = null,
    altezza: Dp = 52.dp,
    stile: TextStyle = Testi.pulsanteSecondario,
    tratteggiato: Boolean = false,
) {
    val c = W.colori
    Row(
        modifier
            .height(altezza)
            .clip(RoundedCornerShape(16.dp))
            .background(if (tratteggiato) Color.Transparent else c.scheda)
            .let { if (tratteggiato) it.bordoTratteggiato(c.bordoCampo, 16.dp) else it.border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)) }
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icona != null) {
            Icon(icona, null, tint = c.testo, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(testo, style = stile, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun PulsanteTesto(testo: String, onClick: () -> Unit, modifier: Modifier = Modifier, colore: Color = W.colori.gialloTesto) {
    Box(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) { Text(testo, style = Testi.pulsanteSecondario, color = colore) }
}

/** Il pulsante tondo in alto (chiudi, indietro, mese prima e dopo). */
@Composable
fun PulsanteTondo(icona: ImageVector, descrizione: String, onClick: () -> Unit, modifier: Modifier = Modifier, dimensione: Dp = 44.dp) {
    Box(
        modifier
            .size(dimensione)
            .clip(CircleShape)
            .background(W.colori.superficie2)
            .clickable(onClick = onClick)
            .semantics { contentDescription = descrizione },
        contentAlignment = Alignment.Center,
    ) { Icon(icona, null, tint = W.colori.testo, modifier = Modifier.size(20.dp)) }
}

/**
 * Più e meno attorno al valore, a passi di mezz'ora: per le ore fa meno tocchi
 * della tastiera (un valore vicino a quello di sempre, cambiato di poco).
 */
@Composable
fun Stepper(valore: String, onMeno: () -> Unit, onPiu: () -> Unit, cosa: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier.size(52.dp).clip(CircleShape).background(c.superficie2).clickable(onClick = onMeno)
                .semantics { contentDescription = "Meno mezz'ora di $cosa" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.meno, null, tint = c.testo, modifier = Modifier.size(24.dp)) }
        Text(valore, style = Testi.numeroGrande, color = c.testo, textAlign = TextAlign.Center, modifier = Modifier.widthIn(min = 76.dp))
        Box(
            Modifier.size(52.dp).clip(CircleShape).background(c.superficie2).clickable(onClick = onPiu)
                .semantics { contentDescription = "Più mezz'ora di $cosa" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.piu, null, tint = c.testo, modifier = Modifier.size(24.dp)) }
    }
}

/** Una scelta rapida (4 h, 6 h, "Come l'ultima volta"): nera quando è scelta. */
@Composable
fun Pillola(testo: String, scelta: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, altezza: Dp = 46.dp) {
    val c = W.colori
    Box(
        modifier
            .height(altezza)
            .clip(RoundedCornerShape(50))
            .background(if (scelta) c.testo else c.scheda)
            .border(1.5.dp, if (scelta) c.testo else c.bordoCampo, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(testo, style = Testi.pulsanteSecondario, color = if (scelta) c.scheda else c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** UNA parola di stato, mai solo un colore. */
@Composable
fun ParolaStato(stato: Stato, modifier: Modifier = Modifier) {
    val c = W.colori
    val (parola, testo, fondo) = when (stato) {
        Stato.BOZZA -> Triple("Da firmare", c.gialloTesto, c.gialloTenue)
        Stato.FIRMATO -> Triple("Firmato", c.firmatoTesto, c.firmatoFondo)
        Stato.INVIATO -> Triple("Inviato", c.inviatoTesto, c.inviatoFondo)
        Stato.FATTURATO -> Triple("Fatturato", c.fatturatoTesto, c.fatturatoFondo)
        Stato.ANNULLATO -> Triple("Annullato", c.rossoTesto, c.rossoTenue)
    }
    Text(
        parola, style = Testi.pillola, color = testo,
        modifier = modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

/** Il cerchio con le iniziali del cliente, sempre dello stesso colore per lo stesso nome. */
@Composable
fun Iniziali(nome: String, modifier: Modifier = Modifier, dimensione: Dp = 48.dp) {
    val tinte = listOf(
        Color(0xFFEAF1FD) to Color(0xFF1E4FA8), Color(0xFFEBF7EE) to Color(0xFF1F6A30),
        Color(0xFFF1ECFE) to Color(0xFF5532C9), Color(0xFFFBF3E3) to Color(0xFF8A5A12),
        Color(0xFFEEF0F2) to Color(0xFF343A40), Color(0xFFE6F4F4) to Color(0xFF0B5E61),
    )
    val (fondo, testo) = tinte[abs(nome.lowercase().hashCode()) % tinte.size]
    val scuro = W.colori.scuro
    val parole = nome.split(" ", ".", "-").filter { it.isNotBlank() && it.first().isLetterOrDigit() }
    val sigla = (parole.take(2).joinToString("") { it.take(1) }).uppercase().ifBlank { "?" }
    Box(
        modifier.size(dimensione).clip(CircleShape).background(if (scuro) testo.copy(alpha = 0.28f) else fondo),
        contentAlignment = Alignment.Center,
    ) { Text(sigla, style = Testi.forte, color = if (scuro) Color.White else testo) }
}

/**
 * Un campo con l'etichetta SOPRA (si legge in una sola occhiata e non sparisce
 * mentre si scrive) e il bordo ben visibile anche col riflesso.
 */
@Composable
fun CampoTesto(
    valore: String,
    onCambia: (String) -> Unit,
    etichetta: String?,
    modifier: Modifier = Modifier,
    segnaposto: String = "",
    errore: String? = null,
    righe: Int = 1,
    tastiera: KeyboardType = KeyboardType.Text,
    suffisso: String? = null,
    abilitato: Boolean = true,
    stile: TextStyle = Testi.testoGrande,
    iconaInizio: ImageVector? = null,
) {
    val c = W.colori
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (etichetta != null) Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = c.testo)
        BasicTextField(
            value = valore,
            onValueChange = onCambia,
            enabled = abilitato,
            singleLine = righe == 1,
            minLines = righe,
            textStyle = stile.copy(color = c.testo),
            cursorBrush = SolidColor(c.testo),
            keyboardOptions = KeyboardOptions(
                keyboardType = tastiera,
                capitalization = if (tastiera == KeyboardType.Text) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
            ),
            decorationBox = { campo ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 54.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(c.scheda)
                        .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp))
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = if (righe == 1) Alignment.CenterVertically else Alignment.Top,
                ) {
                    if (iconaInizio != null) {
                        Icon(iconaInizio, null, tint = c.tenue, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                    }
                    Box(Modifier.weight(1f)) {
                        if (valore.isEmpty() && segnaposto.isNotEmpty()) Text(segnaposto, style = stile, color = c.moltoTenue)
                        campo()
                    }
                    if (suffisso != null) Text(" $suffisso", style = stile, color = c.tenue)
                }
            },
        )
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}

/** I quattro passi di vita di un rapportino, con quello di adesso in nero. */
@Composable
fun Passi(stato: Stato, modifier: Modifier = Modifier) {
    val c = W.colori
    val passi = listOf(Stato.BOZZA to "Da firmare", Stato.FIRMATO to "Firmato", Stato.INVIATO to "Inviato", Stato.FATTURATO to "Fatturato")
    val indice = passi.indexOfFirst { it.first == stato }.coerceAtLeast(0)
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        passi.forEachIndexed { i, (_, nome) ->
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= indice) c.testo else c.superficie2))
                Text(
                    nome, style = if (i == indice) Testi.piccolo.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold) else Testi.piccolo,
                    color = if (i == indice) c.testo else c.tenue,
                )
            }
        }
    }
}

/** La pillola grigia e calma della rete: mai rossa, perché niente è perso. */
@Composable
fun PillolaRete(testo: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(50)).background(c.superficie2),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icone.nuvola, null, tint = c.testo2, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(testo, style = Testi.secondario, color = c.testo2)
    }
}

/** Una riga del conto: etichetta a sinistra, importo a destra. */
@Composable
fun RigaConto(etichetta: String, valore: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Medium), color = W.colori.testo2)
        Text(valore, style = Testi.secondarioGrande.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = W.colori.testo)
    }
}

/** Un importo che conta fino al valore nuovo invece di saltare: si vede che è cambiato. */
@Composable
fun EuroAnimati(valore: Double, stile: TextStyle, modifier: Modifier = Modifier, colore: Color = W.colori.testo) {
    val v by animateFloatAsState(valore.toFloat(), tween(300), label = "euro")
    Text(Numeri.euro(Math.round(v * 100) / 100.0), style = stile, color = colore, modifier = modifier)
}

/** Il simbolo di Wisper: il quadrato nero con gli otto puntini gialli. */
@Composable
fun Simbolo(modifier: Modifier = Modifier, dimensione: Dp = 32.dp) {
    Canvas(modifier.size(dimensione)) {
        val s = size.minDimension
        drawRoundRect(Color(0xFF1B1B1F), size = Size(s, s), cornerRadius = CornerRadius(s * 0.28f))
        val centro = Offset(s / 2, s / 2)
        for (i in 0 until 8) {
            val a = Math.toRadians(i * 45.0 - 90)
            drawCircle(Color(0xFFFFC53D), radius = s * 0.069f, center = Offset(centro.x + (s * 0.265f * cos(a)).toFloat(), centro.y + (s * 0.265f * sin(a)).toFloat()))
        }
        drawCircle(Color(0xFFF2F4F7), radius = s * 0.1f, center = centro)
    }
}

/** Il bordo tratteggiato dei pulsanti "aggiungi" (+ Ore extra, Fotografa lo scontrino). */
fun Modifier.bordoTratteggiato(colore: Color, raggio: Dp): Modifier = drawBehind {
    drawRoundRect(
        color = colore,
        cornerRadius = CornerRadius(raggio.toPx()),
        style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))),
    )
}
