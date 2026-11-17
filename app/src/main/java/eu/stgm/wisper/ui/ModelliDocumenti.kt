package eu.stgm.wisper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import eu.stgm.wisper.BuildConfig
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ModelliDocumenti
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Stampa
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

/*
 * I Modelli dei documenti (1.5.0, 17/11/2026; docs/gestionale/modelli.md, prototipo docs/prototipo/Modelli.html). Andrea:
 * "censisci i modelli che Wisper può creare [...] e ad ognuno dai un codice, che deve apparire nei posti opportuni di Wisper,
 * oltre ad avere anche una sua pagina dove poterli vedere tutti con relativi esempi, senza però poterne creare di nuovi".
 *
 *  - l'elenco (voce Modelli del menu): i modelli divisi per famiglia; ogni scheda ha la prima pagina dell'esempio in
 *    piccolo, il codice, il nome e quando esce. Si guarda e basta: niente "Nuovo", l'elenco è quello di rapportino/ModelliDocumenti.kt;
 *  - il modello ("modelli/<codice>"): l'esempio grande (un tocco lo ingrandisce, con tutte le pagine), quando esce, dove
 *    si crea, e il giallo "Apri l'esempio in PDF";
 *  - la sigla ([ModelliDocumenti.sigla], "Mod. RAP-01") la scrivono le altre schermate dove un documento si prepara.
 *
 * L'esempio non è un'immagine tenuta da parte: è il PDF fatto dal modello vero ([Stampa.esempio], gli stessi dati del
 * computer), con in cima lo studio di chi guarda. La prima pagina in piccolo si tiene nella memoria del telefono
 * (cacheDir/modelli), così l'elenco si riapre subito; cambia con la versione dell'app e con i dati dello studio.
 */

/** Gli esempi già fatti: le prime pagine in piccolo per l'elenco, i PDF di questa volta per la pagina del modello. */
internal object EsempiModelli {
    /** codice -> prima pagina dell'esempio, larga [LARGA_MINI] punti. */
    val miniature = mutableStateMapOf<String, ImageBitmap>()
    private val pdf = mutableMapOf<String, File>()
    private var improntaFatta = ""
    private val uno = Mutex()
    private const val LARGA_MINI = 330

    /** Cambia quando cambia quello che sta sull'esempio: la versione dell'app (il modello) e i dati dello studio. */
    private fun impronta(dati: Dati): String {
        val imp = dati.anagrafichePerStampa().optJSONObject("impostazioni")?.toString().orEmpty()
        return Integer.toHexString((BuildConfig.VERSION_CODE.toString() + "|" + imp).hashCode())
    }

    private fun cartella(ctx: Context) = File(ctx.cacheDir, "modelli")

    /** Il PDF dell'esempio (fatto una volta per ogni apertura dell'app, finché lo studio non cambia). */
    suspend fun pdf(ctx: Context, dati: Dati, codice: String): File = uno.withLock {
        val ora = impronta(dati)
        if (ora != improntaFatta) { pdf.clear(); miniature.clear(); improntaFatta = ora }
        pdf[codice]?.takeIf { it.exists() }?.let { return@withLock it }
        val imp = dati.anagrafichePerStampa().optJSONObject("impostazioni")
        val f = Stampa.esempio(ctx, codice, imp) { dati.file(it) }
        pdf[codice] = f
        f
    }

    /** La prima pagina in piccolo: dalla memoria del telefono se c'è già, altrimenti dal PDF fatto adesso. */
    suspend fun miniatura(ctx: Context, dati: Dati, codice: String): ImageBitmap? {
        val ora = impronta(dati)
        if (ora == improntaFatta) miniature[codice]?.let { return it }
        val file = File(cartella(ctx), "$codice-$ora.png")
        val letta = withContext(Dispatchers.IO) { if (file.exists()) runCatching { BitmapFactory.decodeFile(file.path) }.getOrNull() else null }
        val bitmap = letta ?: run {
            val f = pdf(ctx, dati, codice)
            withContext(Dispatchers.IO) {
                val b = disegnaPagine(f, LARGA_MINI, 1).first.firstOrNull() ?: return@withContext null
                runCatching {
                    val c = cartella(ctx)
                    c.mkdirs()
                    // Via le miniature di prima (un'altra versione, un altro studio) di questo modello.
                    c.listFiles { x -> x.name.startsWith("$codice-") && x.name != file.name }?.forEach { it.delete() }
                    file.outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
                }
                b
            }
        } ?: return null
        if (ora != improntaFatta) { pdf.clear(); miniature.clear(); improntaFatta = ora }
        return bitmap.asImageBitmap().also { miniature[codice] = it }
    }
}

/** Il codice col colore della famiglia (quello della sua voce nel menu): "RAP-01". */
@Composable
internal fun CodiceModello(codice: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val modulo = ModelliDocumenti.trova(codice)?.let { ModelliDocumenti.moduloDi(it.famiglia) } ?: Moduli.DOCUMENTI
    val voce = Sezione.entries.firstOrNull { it.modulo == modulo } ?: Sezione.DOCUMENTI
    val tratto = Color(voce.tratto)
    // Nel tema scuro come le voci del menu: il fondo è il tratto al 30% sulla scheda, il tratto si schiarisce (fai.md §3).
    val fondo = if (c.scuro) lerp(c.scheda, tratto, 0.30f) else Color(voce.fondo)
    val testo = if (c.scuro) lerp(tratto, Color.White, 0.60f) else tratto
    Text(
        codice, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = 0.4.sp), color = testo, maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(8.dp)).background(fondo).padding(horizontal = 9.dp, vertical = 4.dp),
    )
}

/** "Mod. RAP-01" dove un documento si prepara: una scritta piccola e calma accanto al nome del documento. */
@Composable
internal fun SiglaModello(codice: String, modifier: Modifier = Modifier) {
    if (ModelliDocumenti.trova(codice) == null) return
    Text(
        ModelliDocumenti.sigla(codice), style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = 0.3.sp), color = W.colori.tenue, maxLines = 1,
        modifier = modifier.semantics { contentDescription = "Modello $codice" },
    )
}

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataModelliDocumenti(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val ctx = LocalContext.current.applicationContext
    // Le prime pagine arrivano una alla volta, nell'ordine dell'elenco: le schede si riempiono mentre si guarda.
    LaunchedEffect(Unit) {
        for (m in ModelliDocumenti.TUTTI) runCatching { EsempiModelli.miniatura(ctx, dati, m.codice) }
    }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Modelli")
        ModelliDocumenti.FAMIGLIE.forEach { famiglia ->
            Etichetta(famiglia, Modifier.padding(top = 6.dp))
            ModelliDocumenti.TUTTI.filter { it.famiglia == famiglia }.forEach { m ->
                SchedaModello(m, EsempiModelli.miniature[m.codice], Modifier.bersaglio("modello-${m.codice}")) { nav.vai("modelli/${m.codice}") }
            }
        }
    }
}

/** Un modello nell'elenco: la prima pagina dell'esempio, il codice, il nome, quando esce. */
@Composable
private fun SchedaModello(m: ModelliDocumenti.Modello, miniatura: ImageBitmap?, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = W.colori
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.scheda).clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { role = Role.Button }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.width(84.dp).height(112.dp).clip(RoundedCornerShape(6.dp)).background(Color.White)) {
            if (miniatura != null) Image(miniatura, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            CodiceModello(m.codice)
            Text(m.nome, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(m.quando, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---------------------------------------------------------------------------------- un modello

@Composable
fun SchermataModelloDocumento(dati: Dati, nav: Navigatore, codice: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val app = ctx.applicationContext
    val avvisi = LocalAvvisi.current
    val ambito = rememberCoroutineScope()
    val m = ModelliDocumenti.trova(codice)
    if (m == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Modello")
            TestoVuoto("Questo modello non c'è")
        }
        return
    }
    var file by remember(codice) { mutableStateOf<File?>(null) }
    var pagina by remember(codice) { mutableStateOf(EsempiModelli.miniature[codice]) }
    var errore by remember(codice) { mutableStateOf<String?>(null) }
    var occupato by remember { mutableStateOf(false) }
    var grande by remember { mutableStateOf(false) }

    // L'esempio vero: il PDF fatto adesso dal modello, e la sua prima pagina a tutta larghezza.
    LaunchedEffect(codice) {
        try {
            val f = EsempiModelli.pdf(app, dati, codice)
            file = f
            withContext(Dispatchers.IO) { disegnaPagine(f, 1000, 1).first.firstOrNull()?.asImageBitmap() }?.let { pagina = it }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            errore = spiegaErrore2(e, "L'esempio non si è creato. Riprova.")
        }
    }

    fun apriPdf() {
        if (occupato) return
        occupato = true
        ambito.launch {
            try {
                val f = file ?: EsempiModelli.pdf(app, dati, codice).also { file = it }
                if (!Stampa.apri(ctx, f)) avvisi.mostra("Sul telefono non c'è un'app per i PDF")
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                avvisi.mostra(spiegaErrore2(e, "Il PDF non si è creato. Riprova."))
            } finally {
                occupato = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = SpazioSottoBarra),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CodiceModello(m.codice)
                TitoloPagina(m.nome)
            }
            // Il foglio: bianco anche nel tema scuro, come la carta. Un tocco lo ingrandisce (tutte le pagine, con lo zoom).
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(c.scheda)
                    .let { x -> if (file != null) x.clickable { grande = true }.semantics { role = Role.Button; contentDescription = "Ingrandisci l'esempio" } else x }
                    .padding(12.dp),
            ) {
                Box(Modifier.fillMaxWidth().aspectRatio(210f / 297f).clip(RoundedCornerShape(4.dp)).background(Color.White), contentAlignment = Alignment.Center) {
                    val p = pagina
                    if (p != null) Image(p, "Esempio di ${m.nome}", Modifier.fillMaxSize(), contentScale = ContentScale.Fit, alignment = Alignment.TopCenter)
                    else Text(errore ?: "Preparo l'esempio…", style = Testi.secondario, color = Color(0xFF6B6F76), modifier = Modifier.padding(20.dp))
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Etichetta("Quando esce")
                Text(m.quando, style = Testi.testo, color = c.testo)
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Etichetta("Dove si crea")
                Text(m.dove, style = Testi.testo, color = c.testo)
            }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(if (occupato) "Preparo il PDF…" else "Apri l'esempio in PDF", { apriPdf() }, Modifier.bersaglio("esempio-pdf"), icona = Icone.pdf)
        }
    }

    if (grande) file?.let { f -> AnteprimaGrande(f, pagina) { grande = false } }
}
