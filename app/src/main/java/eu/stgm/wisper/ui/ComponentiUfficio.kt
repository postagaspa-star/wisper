package eu.stgm.wisper.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * I pezzi comuni delle schermate dell'ufficio (docs/telefono-ufficio.md, prototipo
 * docs/prototipo/TelefonoUfficio.html). Stessa famiglia di Componenti.kt: bordi
 * invece di ombre, giallo solo sull'azione principale, una parola per ogni stato.
 */

/** Quanto spazio lasciare in fondo alle pagine che hanno la barra delle sezioni e un pulsante sopra. */
val SpazioSottoBarra = 170.dp

/** Margini di una pagina: 20 ai lati come tutto il telefono. */
val MarginePagina = PaddingValues(start = 20.dp, end = 20.dp, top = 10.dp)

/** La testata delle pagine interne: indietro (o chiudi, nei compiti) a sinistra, le azioni a destra. */
@Composable
fun Testata(onIndietro: () -> Unit, chiudi: Boolean = false, azioni: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        PulsanteTondo(if (chiudi) Icone.chiudi else Icone.indietro, if (chiudi) "Chiudi" else "Indietro", onIndietro)
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = azioni)
    }
}

/** Il titolo grande della pagina, con la riga tenue sopra (data, cliente, "Fine mese"). */
@Composable
fun TitoloPagina(titolo: String, sopra: String? = null, etichettaSopra: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (sopra != null) {
            if (etichettaSopra) Etichetta(sopra) else Text(sopra, style = Testi.secondarioGrande, color = W.colori.tenue)
        }
        Text(titolo, style = Testi.titoloPagina, color = W.colori.testo)
    }
}

/** Tutti | Da fatturare | Da firmare: una scelta fra poche, sempre visibile. */
@Composable
fun <T> Segmenti(opzioni: List<Pair<T, String>>, scelto: T, onScelta: (T) -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.superficie2).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        opzioni.forEach { (valore, nome) ->
            val su = valore == scelto
            Box(
                Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(11.dp))
                    .background(if (su) c.scheda else Color.Transparent)
                    .clickable { onScelta(valore) }
                    .semantics { role = Role.Tab; selected = su },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    nome, style = Testi.secondarioGrande.copy(fontWeight = if (su) FontWeight.ExtraBold else FontWeight.Bold),
                    color = if (su) c.testo else c.testo2, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Le schede di una pagina come pillole che scorrono di lato (Panoramica, Rapportini, Costi…). */
@Composable
fun <T> SchedePillole(opzioni: List<Pair<T, String>>, scelta: T, onScelta: (T) -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        opzioni.forEach { (valore, nome) ->
            val su = valore == scelta
            Box(
                Modifier.height(44.dp).clip(RoundedCornerShape(50))
                    .background(if (su) c.testo else c.scheda)
                    .border(1.5.dp, if (su) c.testo else c.bordoCampo, RoundedCornerShape(50))
                    .clickable { onScelta(valore) }
                    .semantics { role = Role.Tab; selected = su }
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(nome, style = Testi.secondarioGrande.copy(fontWeight = if (su) FontWeight.ExtraBold else FontWeight.Bold), color = if (su) c.scheda else c.testo2)
            }
        }
    }
}

/** Il filtro che arriva da un'altra pagina (un cliente, una commessa): pillola gialla tenue con la ×. */
@Composable
fun ChipFiltro(testo: String, onTogli: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Row(
        modifier.height(40.dp).clip(RoundedCornerShape(50)).background(c.gialloTenue)
            .clickable(onClick = onTogli)
            .semantics { contentDescription = "Togli il filtro $testo" }
            .padding(start = 14.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(testo, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Icon(Icone.chiudi, null, tint = c.gialloTesto, modifier = Modifier.size(16.dp))
    }
}

/** La ricerca: lente, testo, niente pulsante (filtra mentre si scrive). */
@Composable
fun CampoCerca(valore: String, onCambia: (String) -> Unit, segnaposto: String, modifier: Modifier = Modifier) {
    val c = W.colori
    BasicTextField(
        value = valore, onValueChange = onCambia, singleLine = true,
        textStyle = Testi.testo.copy(color = c.testo), cursorBrush = SolidColor(c.testo),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
        modifier = modifier.fillMaxWidth(),
        decorationBox = { campo ->
            Row(
                Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
                    .border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icone.cerca, null, tint = c.tenue, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Box(Modifier.weight(1f)) {
                    if (valore.isEmpty()) Text(segnaposto, style = Testi.testo, color = c.moltoTenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    campo()
                }
                if (valore.isNotEmpty()) {
                    Box(Modifier.size(36.dp).clip(CircleShape).clickable { onCambia("") }.semantics { contentDescription = "Cancella la ricerca" }, contentAlignment = Alignment.Center) {
                        Icon(Icone.chiudi, null, tint = c.tenue, modifier = Modifier.size(16.dp))
                    }
                }
            }
        },
    )
}

/**
 * Le ore sul budget su una riga: il valore, una lineetta al 100%, e il colore solo
 * quando conta (ambra dall'85%, rosso oltre). Il resto scala fino al 125% per far
 * vedere anche quanto si è sforato.
 */
@Composable
fun BarraBudget(fatte: Double, previste: Double, modifier: Modifier = Modifier, alta: Boolean = true) {
    val c = W.colori
    val quota = if (previste > 0) fatte / previste else 0.0
    val colore = when {
        quota > 1 -> c.rossoPieno
        quota >= 0.85 -> c.budget
        else -> c.testo
    }
    val altezza = if (alta) 12.dp else 8.dp
    BoxWithConstraints(
        modifier.fillMaxWidth().height(altezza + 8.dp)
            .semantics { contentDescription = "${Testo.ore(fatte)} su ${Testo.ore(previste)}" },
        contentAlignment = Alignment.CenterStart,
    ) {
        val larghezza = maxWidth
        Box(Modifier.fillMaxWidth().height(altezza).clip(RoundedCornerShape(altezza / 2)).background(c.superficie2))
        Box(Modifier.width(larghezza * (quota.coerceIn(0.0, 1.25) / 1.25).toFloat()).height(altezza).clip(RoundedCornerShape(altezza / 2)).background(colore))
        if (previste > 0) Box(Modifier.offset(x = larghezza * (1 / 1.25f) - 1.5.dp).width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(c.testo))
    }
}

/** Il codice della commessa: pillola nera col testo giallo (gialla col testo nero nel tema scuro). */
@Composable
fun CodiceCommessa(codice: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Text(
        codice, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold),
        color = if (c.scuro) c.suGiallo else c.giallo,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).background(if (c.scuro) c.giallo else c.suGiallo).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

/** Lo stato di una commessa con la parola: Aperta, Sospesa, Chiusa. */
@Composable
fun ParolaStatoCommessa(stato: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val (parola, testo, fondo) = when (stato.uppercase()) {
        "SOSPESA" -> Triple("Sospesa", c.gialloTesto, c.gialloTenue)
        "CHIUSA" -> Triple("Chiusa", c.fatturatoTesto, c.fatturatoFondo)
        else -> Triple("Aperta", c.firmatoTesto, c.firmatoFondo)
    }
    Text(parola, style = Testi.pillola, color = testo, modifier = modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 9.dp, vertical = 3.dp))
}

/** "Vicina al budget" / "Oltre il budget" / "Scaduta": solo quando c'è da guardare. */
@Composable
fun ParolaAvviso(testo: String, grave: Boolean, modifier: Modifier = Modifier) {
    val c = W.colori
    Text(
        testo, style = Testi.pillola, color = if (grave) c.rossoTesto else c.gialloTesto,
        modifier = modifier.clip(RoundedCornerShape(50)).background(if (grave) c.rossoTenue else c.gialloTenue).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

/** Un riquadro coi numeri (Da fatturare, Ore, Margine): toccabile se porta a un elenco. */
@Composable
fun Riquadro(etichetta: String, valore: String, modifier: Modifier = Modifier, nota: String? = null, acceso: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = W.colori
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(c.scheda)
            .border(1.dp, if (acceso) c.gialloTesto.copy(alpha = 0.6f) else c.bordoScheda, RoundedCornerShape(18.dp))
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(etichetta, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, maxLines = 1)
        Text(valore, style = Testi.titoloSezione.copy(fontSize = Testi.titoloSezione.fontSize * 1.1f), color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (nota != null) Text(nota, style = Testi.piccolo.copy(fontSize = Testi.pillola.fontSize), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Intestazione di una sezione in maiuscolo, col totale o un'azione a destra. */
@Composable
fun TitoloSezione(testo: String, valore: String? = null, azione: String? = null, onAzione: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(testo.uppercase(), style = Testi.etichetta.copy(fontWeight = FontWeight.ExtraBold), color = W.colori.testo2, modifier = Modifier.weight(1f))
        if (valore != null) Text(valore, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = W.colori.testo)
        if (azione != null && onAzione != null) PulsanteTesto(azione, onAzione)
    }
}

/** Una scheda che contiene righe (un elenco, non una scheda per riga). */
@Composable
fun SchedaElenco(modifier: Modifier = Modifier, contenuto: @Composable ColumnScope.() -> Unit) {
    Scheda(modifier, orizzontale = 14.dp, verticale = 0.dp, spazio = 0.dp, contenuto = contenuto)
}

/** La riga sottile fra le voci di un elenco. */
@Composable
fun LineaElenco() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(W.colori.riga))
}

/** Una voce di un elenco: icona o iniziali, titolo, riga sotto, valore e freccia. */
@Composable
fun RigaVoce(
    titolo: String,
    modifier: Modifier = Modifier,
    sotto: String? = null,
    valore: String? = null,
    icona: ImageVector? = null,
    inizio: (@Composable () -> Unit)? = null,
    fine: (@Composable () -> Unit)? = null,
    freccia: Boolean = true,
    titoloColore: Color = W.colori.testo,
    onClick: (() -> Unit)? = null,
) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().heightIn(min = 64.dp)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (icona != null) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.superficie2), contentAlignment = Alignment.Center) {
                Icon(icona, null, tint = c.testo, modifier = Modifier.size(20.dp))
            }
        }
        inizio?.invoke()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(titolo, style = Testi.forte, color = titoloColore, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (sotto != null) Text(sotto, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (valore != null) Text(valore, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo2)
        fine?.invoke()
        if (freccia && onClick != null) Icon(Icone.freccia, null, tint = c.tenue, modifier = Modifier.size(18.dp))
    }
}

/** L'interruttore grande (Con gli importi, Campo ticket): nero quando è acceso. */
@Composable
fun Interruttore(acceso: Boolean, onCambia: (Boolean) -> Unit, descrizione: String) {
    val c = W.colori
    Box(
        Modifier.size(width = 52.dp, height = 32.dp).clip(RoundedCornerShape(16.dp))
            .background(if (acceso) c.testo else c.bordoCampo)
            .clickable { onCambia(!acceso) }
            .semantics { role = Role.Switch; contentDescription = descrizione; stateDescription = if (acceso) "Sì" else "No" }
            .padding(4.dp),
        contentAlignment = if (acceso) Alignment.CenterEnd else Alignment.CenterStart,
    ) { Box(Modifier.size(24.dp).clip(CircleShape).background(if (acceso && c.scuro) c.suGiallo else Color.White)) }
}

/** Una riga con l'etichetta a sinistra e l'interruttore a destra. */
@Composable
fun RigaInterruttore(testo: String, acceso: Boolean, onCambia: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(testo, style = Testi.forte, color = W.colori.testo, modifier = Modifier.weight(1f))
        Interruttore(acceso, onCambia, testo)
    }
}

/** Sì | No, per le regole dei clienti (viaggio pagato, km rimborsati). */
@Composable
fun SiNo(valore: Boolean, onCambia: (Boolean) -> Unit, descrizione: String) {
    val c = W.colori
    Row(Modifier.clip(RoundedCornerShape(12.dp)).background(c.superficie2).padding(3.dp).semantics { contentDescription = descrizione }) {
        listOf(true to "Sì", false to "No").forEach { (v, nome) ->
            val su = v == valore
            Box(
                Modifier.size(width = 56.dp, height = 40.dp).clip(RoundedCornerShape(10.dp))
                    .background(if (su) c.scheda else Color.Transparent).clickable { onCambia(v) }
                    .semantics { selected = su },
                contentAlignment = Alignment.Center,
            ) { Text(nome, style = Testi.secondarioGrande.copy(fontWeight = if (su) FontWeight.ExtraBold else FontWeight.Bold), color = if (su) c.testo else c.testo2) }
        }
    }
}

/** Una riga con l'etichetta e Sì | No. */
@Composable
fun RigaSiNo(testo: String, valore: Boolean, onCambia: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(testo, style = Testi.forte, color = W.colori.testo, modifier = Modifier.weight(1f))
        SiNo(valore, onCambia, testo)
    }
}

/** Il foglio dal basso: menu ⋯, conferme, scelte. Indietro e un tocco fuori lo chiudono. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoglioDalBasso(onChiudi: () -> Unit, contenuto: @Composable ColumnScope.() -> Unit) {
    val c = W.colori
    ModalBottomSheet(
        onDismissRequest = onChiudi,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = c.scheda,
        scrimColor = c.velo,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { Box(Modifier.padding(top = 10.dp, bottom = 6.dp).size(width = 40.dp, height = 5.dp).clip(RoundedCornerShape(3.dp)).background(c.bordoCampo)) },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 24.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = contenuto,
        )
    }
}

/** Una voce di un menu ⋯ (rossa solo per Elimina). */
@Composable
fun VoceMenu(icona: ImageVector, testo: String, onClick: () -> Unit, pericolo: Boolean = false) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(icona, null, tint = if (pericolo) c.rossoTesto else c.testo, modifier = Modifier.size(20.dp))
        Text(testo, style = Testi.forteGrande, color = if (pericolo) c.rossoTesto else c.testo)
    }
}

/** La conferma di un'azione: titolo col numero, una frase, il pulsante e Annulla. */
@Composable
fun FoglioConferma(titolo: String, testo: String?, azione: String, onConferma: () -> Unit, onAnnulla: () -> Unit, pericolo: Boolean = false) {
    val c = W.colori
    FoglioDalBasso(onAnnulla) {
        Text(titolo, style = Testi.titoloScheda, color = c.testo)
        if (testo != null) Text(testo, style = Testi.testo, color = c.testo2)
        Row(
            Modifier.fillMaxWidth().height(64.dp).clip(RoundedCornerShape(18.dp)).background(if (pericolo) c.rossoPieno else c.giallo).clickable(onClick = onConferma),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) { Text(azione, style = Testi.pulsante, color = if (pericolo) Color.White else c.suGiallo) }
        PulsanteTesto("Annulla", onAnnulla, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/** Il pulsante principale che galleggia sopra la barra delle sezioni, su una sfumatura del fondo. */
@Composable
fun FondoConPulsante(modifier: Modifier = Modifier, sopraBarra: Boolean = true, contenuto: @Composable ColumnScope.() -> Unit) {
    val c = W.colori
    Column(
        modifier.fillMaxWidth()
            .background(Brush.verticalGradient(0f to c.fondo.copy(alpha = 0f), 0.3f to c.fondo))
            .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = if (sopraBarra) 12.dp else 22.dp)
            .let { if (sopraBarra) it else it.navigationBarsPadding() },
        verticalArrangement = Arrangement.spacedBy(8.dp),
        content = contenuto,
    )
}

// ---------------------------------------------------------------------------------- avvisi

/** Un avviso in basso: scuro, 3,5 secondi; con Annulla resta 5 secondi. */
class Avviso(val testo: String, val annulla: (() -> Unit)?, val id: Long = System.nanoTime())

class Avvisi {
    var corrente by mutableStateOf<Avviso?>(null)
        private set

    fun mostra(testo: String, annulla: (() -> Unit)? = null) {
        corrente = Avviso(testo, annulla)
    }

    fun chiudi() {
        corrente = null
    }
}

val LocalAvvisi = staticCompositionLocalOf { Avvisi() }

@Composable
fun StratoAvvisi(avvisi: Avvisi, modifier: Modifier = Modifier) {
    val a = avvisi.corrente
    LaunchedEffect(a?.id) {
        if (a != null) {
            delay(if (a.annulla != null) 5000 else 3500)
            if (avvisi.corrente?.id == a.id) avvisi.chiudi()
        }
    }
    AnimatedVisibility(
        visible = a != null, modifier = modifier,
        enter = fadeIn() + slideInVertically { it / 3 }, exit = fadeOut() + slideOutVertically { it / 3 },
    ) {
        val ultimo = a ?: return@AnimatedVisibility
        val c = W.colori
        Row(
            Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp))
                .background(if (c.scuro) Color(0xFFF2F2F3) else Color(0xFF1B1B1F))
                .padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp)
                .heightIn(min = 44.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(ultimo.testo, style = Testi.secondarioGrande, color = if (c.scuro) Color(0xFF1B1B1F) else Color.White, modifier = Modifier.weight(1f))
            if (ultimo.annulla != null) {
                PulsanteTesto("Annulla", { ultimo.annulla.invoke(); avvisi.chiudi() }, colore = if (c.scuro) Color(0xFF8A5A00) else c.giallo)
            }
        }
    }
}

/** Piccoli aiuti per i testi dei numeri, gli stessi del computer. */
object Testo {
    fun ore(h: Double): String = eu.stgm.wisper.rapportino.Numeri.ore(h)
    fun euro(e: Double): String = eu.stgm.wisper.rapportino.Numeri.euro(e)
    fun euroTondi(e: Double): String = "%,d €".format(java.util.Locale.ITALY, Math.round(e))
    fun quanti(n: Int, uno: String, tanti: String): String = if (n == 1) "1 $uno" else "$n $tanti"
}
