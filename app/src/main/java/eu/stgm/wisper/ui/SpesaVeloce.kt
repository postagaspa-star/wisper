package eu.stgm.wisper.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.CategoriaSpesa
import eu.stgm.wisper.rapportino.ContiOreSpese
import eu.stgm.wisper.rapportino.Destinazione
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.Immagini
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Spesa
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDate
import java.time.YearMonth

private val Corallo = TinteAzioni.Corallo
private val SuCorallo = TinteAzioni.CoralloTesto

/** I cinque tipi del prototipo; "Pranzo" è la categoria vitto. */
private val TIPI = listOf("carburante" to "Carburante", "vitto" to "Pranzo", "materiale" to "Materiale", "parcheggio" to "Parcheggio", "altro" to "Altro")

/** "1234,5" diventa "1.234,5" mentre si scrive; senza cifre "0". */
private fun importoMostrato(c: String): String {
    if (c.isEmpty()) return "0"
    val parti = c.split(",")
    val intero = parti[0].ifEmpty { "0" }.reversed().chunked(3).joinToString(".").reversed()
    return intero + if (parti.size > 1) "," + parti[1] else ""
}

/**
 * La spesa a tre passi (docs/gestionale/fai.md §7, prototipo docs/prototipo/Fai-spesa.dc.html): quanto, per quale lavoro,
 * lo scontrino. Oggi come data e la propria persona; va in coda come le altre spese, quindi funziona senza rete. Per
 * cambiare il resto si apre la spesa dall'elenco.
 */
@Composable
fun SchermataSpesaVeloce(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val spese by dati.spese.collectAsStateWithLifecycle()
    var passo by rememberSaveable { mutableIntStateOf(1) }
    var avanza by rememberSaveable { mutableStateOf(true) }
    var cifre by rememberSaveable { mutableStateOf("") }
    var tipo by rememberSaveable { mutableStateOf("") }
    /** null: da scegliere; "": Nessuna commessa. */
    var idCommessa by rememberSaveable { mutableStateOf<String?>(null) }
    var foto by rememberSaveable { mutableStateOf<String?>(null) }
    var nonCe by rememberSaveable { mutableStateOf(false) }
    var altra by remember { mutableStateOf(false) }
    val recenti = remember(ana, viste, spese) { FilaOreSpese.commesseRecenti(ana, viste.map { it.rapportino }, spese = spese?.spese.orEmpty()) }

    fun vaiA(p: Int) { avanza = p > passo; passo = p }
    val euro = cifre.replace(',', '.').toDoubleOrNull() ?: 0.0
    val sceltaFuori = idCommessa?.takeIf { id -> id.isNotBlank() && recenti.none { it.id == id } }

    var scattoInCorso by rememberSaveable { mutableStateOf<String?>(null) }
    val fotocamera = rememberFotoSistema { riuscito ->
        val percorso = scattoInCorso ?: return@rememberFotoSistema
        scattoInCorso = null
        val scatto = File(percorso)
        if (!riuscito) { scatto.delete(); return@rememberFotoSistema }
        scope.launch {
            runCatching { dati.preparaFoto(Uri.fromFile(scatto)) }.onSuccess { foto = it.path; nonCe = false }
                .onFailure { avvisi.mostra("La foto non si legge: riprova") }
            scatto.delete()
        }
    }
    fun scatta() {
        if (dati.esempio) { foto = File(ctx.cacheDir, "esempio-scontrino.jpg").path; nonCe = false; return }
        val f = Immagini.fileScatto(ctx)
        scattoInCorso = f.path
        fotocamera.launch(FileProvider.getUriForFile(ctx, ctx.packageName + ".foto", f))
    }
    val galleria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { runCatching { dati.preparaFoto(uri) }.onSuccess { foto = it.path; nonCe = false } }
    }

    fun salva() {
        val id = idCommessa.orEmpty()
        dati.salvaSpesa(
            Spesa(
                idLocale = "", data = LocalDate.now(), importo = ContiOreSpese.centesimi(euro), categoria = tipo, idCommessa = id,
                destinazione = Destinazione.diBase(id), anticipazione = false, pagataDaMe = true,
            ),
            foto?.let(::File),
        )
        RicordoSpese.mese = YearMonth.now()
        vaiA(4)
    }
    fun ricomincia() {
        cifre = ""; tipo = ""; idCommessa = null; foto = null; nonCe = false
        avanza = true
        passo = 1
    }

    BackHandler(enabled = passo in 2..3) { vaiA(passo - 1) }

    Column(Modifier.fillMaxSize().background(c.fondo).statusBarsPadding().navigationBarsPadding()) {
        Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp)) {
            Box(Modifier.fillMaxWidth().height(52.dp), contentAlignment = Alignment.Center) {
                PulsanteTondo(Icone.chiudi, "Chiudi e torna a casa", { nav.indietro() }, Modifier.align(Alignment.CenterStart), dimensione = 48.dp)
                Text(if (passo < 4) "Passo $passo di 3" else "Fatto", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo2)
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (i in 1..3) {
                    val colore by animateColorAsState(if (passo >= i) Corallo else c.superficie2, tween(300), label = "passo")
                    Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(50)).background(colore))
                }
            }
        }
        AnimatedContent(
            passo, Modifier.weight(1f).fillMaxWidth(), label = "passi",
            transitionSpec = {
                val verso = if (avanza) 1 else -1
                (slideInHorizontally(tween(320)) { it / 12 * verso } + fadeIn(tween(320))) togetherWith fadeOut(tween(120))
            },
        ) { p ->
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(if (p == 2) 12.dp else if (p == 3) 14.dp else 16.dp),
            ) {
                when (p) {
                    1 -> PassoQuanto(cifre, { cifre = it }, tipo, { tipo = it })
                    2 -> {
                        TitoloPasso("Per quale lavoro?", Modifier.padding(bottom = 4.dp))
                        recenti.forEach { r ->
                            SchedaCommessa(r.id, ana.cliente(r.idCliente)?.nome.orEmpty(), r.nome, idCommessa == r.id) { idCommessa = r.id }
                        }
                        sceltaFuori?.let { id ->
                            val k = ana.commessa(id)
                            SchedaCommessa(id, ana.clienteDi(k)?.nome.orEmpty(), k?.descrizione.orEmpty(), true) { }
                        }
                        SceltaVeloce("Nessuna commessa", idCommessa == "") { idCommessa = "" }
                        if (ana.commesse.count { !it.archiviata && !it.modello && it.stato.equals("APERTA", true) } > recenti.size) {
                            PulsanteTesto("Un'altra commessa", { altra = true }, Modifier.fillMaxWidth())
                        }
                    }
                    3 -> {
                        TitoloPasso("Hai lo scontrino?", Modifier.padding(bottom = 4.dp))
                        val premi = remember { MutableInteractionSource() }
                        Column(
                            Modifier.molla(premi).fillMaxWidth().height(290.dp).clip(RoundedCornerShape(28.dp))
                                .background(Color(if (c.scuro) 0xFF3B2421 else 0xFFFFECE9))
                                .clickable(interactionSource = premi, indication = LocalIndication.current) { scatta() }
                                .semantics { role = Role.Button },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
                        ) {
                            val f = foto
                            if (f == null) {
                                Box(Modifier.size(76.dp).clip(CircleShape).background(Corallo), contentAlignment = Alignment.Center) {
                                    Icon(Icone.fotocamera, null, tint = SuCorallo, modifier = Modifier.size(36.dp))
                                }
                                Text("Fotografa lo scontrino", style = Testi.forteGrande.copy(fontSize = 19.sp), color = c.testo)
                            } else {
                                FotoScontrino(File(f), euro)
                                Text("Rifai la foto", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo2)
                            }
                        }
                        PulsanteBordo(
                            "Scegli dalla galleria",
                            {
                                if (dati.esempio) scatta() else galleria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            Modifier.fillMaxWidth(), icona = Icone.galleria,
                        )
                        SceltaVeloce("Non ce l'ho", nonCe) { nonCe = !nonCe; if (nonCe) foto = null }
                    }
                    else -> PassoFatto(euro, TIPI.firstOrNull { it.first == tipo }?.second ?: CategoriaSpesa.nome(tipo), idCommessa.orEmpty().ifBlank { "Nessuna" }, foto != null)
                }
            }
        }
        Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (passo) {
                1 -> Row { PulsanteCorallo("Avanti", euro > 0 && tipo.isNotBlank(), Modifier.weight(1f)) { vaiA(2) } }
                2 -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteIndietro { vaiA(1) }
                    PulsanteCorallo("Avanti", idCommessa != null, Modifier.weight(1f)) { vaiA(3) }
                }
                3 -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PulsanteIndietro { vaiA(2) }
                    PulsanteCorallo("Salva la spesa", foto != null || nonCe, Modifier.weight(1f)) { salva() }
                }
                else -> {
                    val premi = remember { MutableInteractionSource() }
                    Box(
                        Modifier.molla(premi).fillMaxWidth().height(60.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFF16171B))
                            .clickable(interactionSource = premi, indication = LocalIndication.current) { nav.indietro() }
                            .semantics { role = Role.Button },
                        contentAlignment = Alignment.Center,
                    ) { Text("Torna a casa", style = Testi.pulsante, color = Color.White) }
                    PulsanteBordo("Aggiungi un'altra", { ricomincia() }, Modifier.fillMaxWidth(), altezza = 56.dp, stile = Testi.forteGrande.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
    if (altra) FoglioAltraCommessa(dati, onScelta = { idCommessa = it; altra = false }, onChiudi = { altra = false })
}

@Composable
private fun TitoloPasso(testo: String, modifier: Modifier = Modifier) {
    Text(testo, style = Testi.titoloPagina.copy(fontSize = 26.sp, letterSpacing = (-0.5).sp, lineHeight = 31.sp), color = W.colori.testo, modifier = modifier.semantics { heading() })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.PassoQuanto(cifre: String, onCifre: (String) -> Unit, tipo: String, onTipo: (String) -> Unit) {
    val c = W.colori
    TitoloPasso("Quanto hai speso?")
    Row(Modifier.fillMaxWidth().height(68.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Text(
            importoMostrato(cifre), color = if (cifre.isEmpty()) c.moltoTenue else c.testo, maxLines = 1,
            style = TextStyle(fontFamily = Carattere, fontSize = 48.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1.2).sp, lineHeight = 56.sp),
        )
        Spacer(Modifier.width(8.dp))
        Text("€", color = c.testo2, style = TextStyle(fontFamily = Carattere, fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 36.sp))
    }
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TIPI.forEach { (k, nome) ->
            val su = k == tipo
            val premi = remember { MutableInteractionSource() }
            Box(
                Modifier.molla(premi).height(48.dp).clip(RoundedCornerShape(50)).background(if (su) Corallo else c.scheda)
                    .clickable(interactionSource = premi, indication = LocalIndication.current) { onTipo(k) }
                    .semantics { role = Role.RadioButton; selected = su }.padding(horizontal = 18.dp),
                contentAlignment = Alignment.Center,
            ) { Text(nome, style = Testi.forte.copy(fontWeight = if (su) FontWeight.ExtraBold else FontWeight.Bold), color = if (su) SuCorallo else c.testo, maxLines = 1) }
        }
    }
    val tasti = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "canc")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tasti.chunked(3).forEach { riga ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                riga.forEach { k -> TastoCifra(k, Modifier.weight(1f)) { onCifre(premiTasto(cifre, k)) } }
            }
        }
    }
}

/** Il tasto premuto sulle cifre scritte: una virgola sola, due decimali, massimo 7 cifre intere. */
private fun premiTasto(c: String, k: String): String = when {
    k == "canc" -> c.dropLast(1)
    k == "," -> if (c.contains(',')) c else c.ifEmpty { "0" } + ","
    c.contains(',') -> if (c.substringAfter(',').length >= 2) c else c + k
    c == "0" -> k
    c.length >= 7 -> c
    else -> c + k
}

@Composable
private fun TastoCifra(k: String, modifier: Modifier, onClick: () -> Unit) {
    val c = W.colori
    val premi = remember { MutableInteractionSource() }
    Box(
        modifier.molla(premi).height(64.dp).clip(RoundedCornerShape(18.dp)).background(c.scheda)
            .clickable(interactionSource = premi, indication = LocalIndication.current, onClick = onClick)
            .semantics { role = Role.Button; contentDescription = when (k) { "canc" -> "Cancella"; "," -> "Virgola"; else -> k } },
        contentAlignment = Alignment.Center,
    ) {
        if (k == "canc") Icon(Icone.cancellaTasto, null, tint = c.testo, modifier = Modifier.size(28.dp))
        else Text(k, style = TextStyle(fontFamily = Carattere, fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 30.sp), color = c.testo)
    }
}

@Composable
private fun SpuntaCorallo() {
    Box(Modifier.size(30.dp).clip(CircleShape).background(Corallo), contentAlignment = Alignment.Center) {
        Icon(Icone.spunta, null, tint = SuCorallo, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun SchedaCommessa(codice: String, cliente: String, cosa: String, scelta: Boolean, onClick: () -> Unit) {
    val c = W.colori
    val premi = remember { MutableInteractionSource() }
    Row(
        Modifier.molla(premi).fillMaxWidth().heightIn(min = 84.dp).clip(RoundedCornerShape(22.dp))
            .background(if (scelta) Color(if (c.scuro) 0xFF3B2421 else 0xFFFFECE9) else c.scheda)
            .then(if (scelta) Modifier.border(2.dp, Corallo, RoundedCornerShape(22.dp)) else Modifier)
            .clickable(interactionSource = premi, indication = LocalIndication.current, onClick = onClick)
            .semantics { role = Role.RadioButton; selected = scelta }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                codice, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = 0.26.sp), color = Color.White,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0xFF16171B)).padding(horizontal = 9.dp, vertical = 3.dp),
            )
            if (cliente.isNotBlank()) Text(cliente, style = Testi.forteGrande, color = c.testo)
            if (cosa.isNotBlank()) Text(cosa, style = Testi.secondarioGrande, color = c.tenue)
        }
        if (scelta) SpuntaCorallo()
    }
}

@Composable
private fun SceltaVeloce(testo: String, scelta: Boolean, onClick: () -> Unit) {
    val c = W.colori
    val premi = remember { MutableInteractionSource() }
    Row(
        Modifier.molla(premi).fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(22.dp))
            .background(if (scelta) Color(if (c.scuro) 0xFF3B2421 else 0xFFFFECE9) else c.scheda)
            .then(if (scelta) Modifier.border(2.dp, Corallo, RoundedCornerShape(22.dp)) else Modifier)
            .clickable(interactionSource = premi, indication = LocalIndication.current, onClick = onClick)
            .semantics { role = Role.Checkbox; selected = scelta }.padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(testo, style = Testi.forteGrande.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.weight(1f))
        if (scelta) SpuntaCorallo()
    }
}

@Composable
private fun PulsanteCorallo(testo: String, abilitato: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = W.colori
    val premi = remember { MutableInteractionSource() }
    Box(
        modifier.molla(premi).height(60.dp).clip(RoundedCornerShape(20.dp)).background(if (abilitato) Corallo else c.superficie2)
            .clickable(interactionSource = premi, indication = LocalIndication.current, enabled = abilitato, onClick = onClick)
            .semantics { role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { Text(testo, style = Testi.pulsante, color = if (abilitato) SuCorallo else c.moltoTenue) }
}

@Composable
private fun PulsanteIndietro(onClick: () -> Unit) {
    PulsanteBordo("Indietro", onClick, altezza = 60.dp, stile = Testi.forteGrande.copy(fontWeight = FontWeight.Bold), modifier = Modifier.width(118.dp))
}

/** La foto vera dello scontrino, un po' storta come un foglietto appoggiato. */
@Composable
private fun FotoScontrino(file: File, euro: Double) {
    val bitmap = produceState<Bitmap?>(null, file.path) {
        value = withContext(Dispatchers.IO) { if (file.exists()) Immagini.miniatura(file, 480) else null }
    }.value
    val c = W.colori
    Box(
        Modifier.rotate(-3f).width(150.dp).height(190.dp).shadow(10.dp, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color.White),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) Image(bitmap.asImageBitmap(), "Lo scontrino", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Text(Numeri.euro(euro), style = Testi.forte, color = Color(0xFF16171B), textAlign = TextAlign.Center)
    }
}

@Composable
private fun ColumnScope.PassoFatto(euro: Double, tipo: String, commessa: String, conFoto: Boolean) {
    val c = W.colori
    Column(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        SpuntaAnimata()
        Text("Spesa salvata", style = Testi.titoloPagina.copy(fontSize = 28.sp, letterSpacing = (-0.5).sp), color = c.testo, modifier = Modifier.semantics { heading() })
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(c.scheda).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(Numeri.euro(euro), style = TextStyle(fontFamily = Carattere, fontSize = 36.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.8).sp, lineHeight = 42.sp), color = c.testo)
            RigaRiepilogo("Tipo", tipo)
            RigaRiepilogo("Lavoro", commessa)
            RigaRiepilogo("Scontrino", if (conFoto) "Fotografato" else "Non c'è")
        }
    }
}

@Composable
private fun RigaRiepilogo(nome: String, valore: String) {
    val c = W.colori
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(nome, style = Testi.forte.copy(fontWeight = FontWeight.SemiBold), color = c.tenue)
        Spacer(Modifier.width(12.dp))
        Text(valore, style = Testi.forte, color = c.testo, textAlign = TextAlign.End)
    }
}

@Composable
private fun SpuntaAnimata() {
    val cerchio = remember { Animatable(0.6f) }
    val segno = remember { Animatable(0f) }
    val tracciato = remember { PathParser().parsePathString("M29 49.5l13 13L68 35").toPath() }
    LaunchedEffect(Unit) {
        launch { cerchio.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = 500f)) }
        delay(180)
        segno.animateTo(1f, tween(450))
    }
    Canvas(Modifier.size(96.dp)) {
        scale(size.minDimension / 96f, pivot = Offset.Zero) {
            drawCircle(Color(0xFF12B76A), 46f * cerchio.value, Offset(48f, 48f))
            val m = PathMeasure().apply { setPath(tracciato, false) }
            val pezzo = Path()
            m.getSegment(0f, m.length * segno.value, pezzo, true)
            drawPath(pezzo, Color(0xFF0A0A0A), style = Stroke(7f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

@Composable
private fun FoglioAltraCommessa(dati: Dati, onScelta: (String) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    var cerca by remember { mutableStateOf("") }
    val aperte = remember(ana) { ana.commesse.filter { !it.archiviata && !it.modello && it.stato.equals("APERTA", true) }.sortedByDescending { it.id } }
    val trovate = aperte.filter { k ->
        val t = cerca.trim().lowercase()
        t.isEmpty() || k.id.lowercase().contains(t) || k.descrizione.lowercase().contains(t) || ana.clienteDi(k)?.nome.orEmpty().lowercase().contains(t)
    }
    FoglioDalBasso(onChiudi) {
        Text("Un'altra commessa", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(cerca, { cerca = it }, null, segnaposto = "Codice, lavoro o cliente", iconaInizio = Icone.cerca)
        Column(Modifier.heightIn(max = 380.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            trovate.take(40).forEach { k ->
                SchedaCommessa(k.id, ana.clienteDi(k)?.nome.orEmpty(), k.descrizione, false) { onScelta(k.id) }
            }
            if (trovate.isEmpty()) Text("Nessuna commessa aperta con queste parole", style = Testi.secondarioGrande, color = c.tenue)
        }
    }
}
