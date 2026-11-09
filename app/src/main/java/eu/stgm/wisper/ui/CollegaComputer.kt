package eu.stgm.wisper.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.util.Size
import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size as Misura
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.AttesaComputer
import eu.stgm.wisper.rapportino.CodiceCollega
import eu.stgm.wisper.rapportino.CollegaQr
import eu.stgm.wisper.rapportino.LettoreQrZxing
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Collega un computer (docs/gestionale/collega-qr.md §7, prototipo
 * docs/prototipo/Collega-QR.html, lato telefono): come WhatsApp, si inquadra il
 * QR che Wisper Ufficio mostra nella sua pagina di accesso, il telefono chiede
 * conferma col nome del computer, poi autorizzaComputer e statoComputer ogni 1,5
 * secondi finché il computer è entrato (al massimo 30 secondi).
 *
 * La fotocamera si chiede entrando; se la si nega, al posto dell'immagine "Serve
 * la fotocamera" e un pulsante (che apre le impostazioni dell'app quando Android
 * non mostra più la richiesta). Il resto dell'app non si blocca mai.
 *
 * @param testoProva solo nelle build di prova (ui/ProveCollega.kt, mai nella build di
 *        rilascio): un testo da trattare come letto dalla fotocamera, per le schermate
 *        sull'emulatore. [onTestoProvaUsato] lo vuota.
 */
@Composable
fun SchermataCollegaComputer(dati: Dati, testoProva: String?, onTestoProvaUsato: () -> Unit, onChiudi: () -> Unit) {
    val ctx = LocalContext.current
    val view = LocalView.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    var fase by remember { mutableStateOf<FaseCollega>(FaseCollega.Inquadra) }
    // Ogni volta che si torna a inquadrare: l'aiuto dei 10 secondi riparte da capo.
    var giro by remember { mutableIntStateOf(0) }
    var permesso by remember { mutableStateOf(haFotocamera(ctx)) }

    fun inquadra() {
        fase = FaseCollega.Inquadra
        giro++
    }

    val chiedi = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { dato ->
        permesso = dato
        if (!dato) fase = FaseCollega.SenzaFotocamera
        else if (fase == FaseCollega.SenzaFotocamera) inquadra()
    }
    // Il permesso si chiede entrando (guida Android: quando serve, non all'avvio dell'app).
    LaunchedEffect(Unit) { if (!permesso) chiedi.launch(Manifest.permission.CAMERA) }
    // Tornando dalle impostazioni dell'app col permesso dato: si inquadra.
    val ciclo = LocalLifecycleOwner.current
    DisposableEffect(ciclo) {
        val osserva = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME && !permesso && haFotocamera(ctx)) {
                permesso = true
                if (fase == FaseCollega.SenzaFotocamera) inquadra()
            }
        }
        ciclo.lifecycle.addObserver(osserva)
        onDispose { ciclo.lifecycle.removeObserver(osserva) }
    }

    // Un testo letto: valido = vibrazione breve, angoli gialli, analisi ferma, foglio dal basso.
    var rifiutatoAlle by remember { mutableLongStateOf(0L) }
    fun letto(testo: String) {
        if (fase != FaseCollega.Inquadra) return
        val codice = CollegaQr.leggi(testo)
        if (codice == null) {
            rifiutatoAlle = SystemClock.elapsedRealtime()
            return
        }
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS)
        fase = FaseCollega.Conferma(codice)
    }
    LaunchedEffect(testoProva, fase) {
        val t = testoProva ?: return@LaunchedEffect
        if (fase == FaseCollega.Inquadra) {
            onTestoProvaUsato()
            letto(t)
        }
    }

    // Collega: autorizzaComputer, poi statoComputer ogni 1,5 s fino a 30 s.
    val giri = rememberCoroutineScope()
    val inCorso = fase
    LaunchedEffect(inCorso) {
        if (inCorso !is FaseCollega.Collego) return@LaunchedEffect
        val nome = dati.autorizzaComputer(inCorso.codice).getOrElse { e ->
            fase = FaseCollega.Errore(e.message?.takeIf { it.isNotBlank() } ?: "Il server non ha risposto: riprova")
            return@LaunchedEffect
        }
        val inizio = SystemClock.elapsedRealtime()
        while (true) {
            delay(AttesaComputer.OGNI_MS)
            val restante = AttesaComputer.MASSIMO_MS - (SystemClock.elapsedRealtime() - inizio)
            // Una domanda che resta appesa (la rete) non allunga l'attesa oltre i 30 secondi.
            val r = if (restante <= 0) null else withTimeoutOrNull(restante) { giri.async { dati.statoComputer(inCorso.codice.id) }.await() }
            val trascorso = SystemClock.elapsedRealtime() - inizio
            if (r == null) {
                fase = FaseCollega.NonRisposto
                return@LaunchedEffect
            }
            val stato = r.getOrElse { e ->
                fase = FaseCollega.Errore(e.message?.takeIf { it.isNotBlank() } ?: "Il server non ha risposto: riprova")
                return@LaunchedEffect
            }
            when (AttesaComputer.decidi(stato.stato, trascorso)) {
                AttesaComputer.Esito.ENTRATO -> { fase = FaseCollega.Entrato(stato.nome.ifBlank { nome }); return@LaunchedEffect }
                AttesaComputer.Esito.NON_RISPOSTO -> { fase = FaseCollega.NonRisposto; return@LaunchedEffect }
                AttesaComputer.Esito.ASPETTA -> Unit
            }
        }
    }

    val conferma = fase as? FaseCollega.Conferma
    BackHandler {
        if (conferma != null) inquadra() else onChiudi()
    }

    val menoAnimazioni = remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val conFotocamera = fase == FaseCollega.Inquadra || conferma != null
    BarreDiSistema(fotocamera = conFotocamera, foglio = conferma != null)

    if (conFotocamera && permesso) {
        Box(Modifier.fillMaxSize().background(Color(0xFF141416))) {
            AnteprimaQr(
                analizza = fase == FaseCollega.Inquadra,
                onTesto = ::letto,
                onRotta = { fase = FaseCollega.FotocameraRotta },
            )
            VeloFinestra(letto = conferma != null, menoAnimazioni = menoAnimazioni)
            RigheSottoFinestra(
                mostra = conferma == null,
                aiuto = rememberAiuto(attivo = fase == FaseCollega.Inquadra, giro = giro),
                rifiutatoAlle = rifiutatoAlle,
            )
            BarraCollega(chiaro = true, onIndietro = onChiudi)
            AnimatedVisibility(
                visible = conferma != null,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = if (menoAnimazioni) fadeIn(tween(0)) else slideInVertically(tween(300, easing = Morbida)) { it },
                exit = if (menoAnimazioni) fadeOut(tween(0)) else slideOutVertically(tween(220)) { it },
            ) {
                // L'ultimo codice resta mentre il foglio scende.
                var ultimo by remember { mutableStateOf(conferma?.codice) }
                if (conferma != null) ultimo = conferma.codice
                ultimo?.let { c ->
                    FoglioConfermaComputer(
                        codice = c,
                        chi = sessione.utente.nome.ifBlank { "te" },
                        onCollega = { fase = FaseCollega.Collego(c) },
                        onAnnulla = ::inquadra,
                    )
                }
            }
        }
        return
    }
    if (conFotocamera) {
        // In attesa della risposta alla richiesta del permesso: il fondo della fotocamera, senza immagine.
        Box(Modifier.fillMaxSize().background(Color(0xFF141416))) { BarraCollega(chiaro = true, onIndietro = onChiudi) }
        return
    }

    val c = W.colori
    Column(Modifier.fillMaxSize().background(c.fondo).statusBarsPadding().navigationBarsPadding()) {
        BarraCollega(chiaro = false, onIndietro = onChiudi)
        Box(Modifier.weight(1f).fillMaxWidth().padding(26.dp), contentAlignment = Alignment.Center) {
            when (val f = fase) {
                is FaseCollega.Collego -> Pieno(
                    icona = { Rotella(menoAnimazioni) },
                    titolo = "Collego ${f.codice.nome}…",
                    testo = "Il computer entra fra un attimo.",
                )
                is FaseCollega.Entrato -> Pieno(
                    icona = { SpuntaEntrato(menoAnimazioni) },
                    titolo = "${f.nome} è entrato",
                    testo = "Sul computer si apre Wisper con il tuo nome.",
                    pulsante = "Fatto", onPulsante = onChiudi,
                )
                FaseCollega.NonRisposto -> Pieno(
                    icona = { IconaTonda(Icone.reteNo) },
                    titolo = "Il computer non ha risposto",
                    testo = "Deve essere in ufficio, sulla stessa rete del server, con la pagina del codice aperta.",
                    pulsante = "Riprova", onPulsante = ::inquadra,
                )
                is FaseCollega.Errore -> Pieno(
                    icona = { IconaTonda(Icone.avviso) },
                    titolo = "Il computer non è entrato",
                    testo = f.frase,
                    pulsante = "Riprova", onPulsante = ::inquadra,
                )
                FaseCollega.SenzaFotocamera -> Pieno(
                    icona = { IconaTonda(Icone.fotocameraNo) },
                    titolo = "Serve la fotocamera",
                    testo = "Senza fotocamera non posso leggere il codice sul computer.",
                    pulsante = "Consenti la fotocamera",
                    onPulsante = {
                        val attivita = ctx.attivita()
                        // Android mostra ancora la richiesta: la si rifà. Non la mostra più: le impostazioni dell'app.
                        if (attivita != null && ActivityCompat.shouldShowRequestPermissionRationale(attivita, Manifest.permission.CAMERA)) {
                            chiedi.launch(Manifest.permission.CAMERA)
                        } else {
                            apriImpostazioniApp(ctx)
                        }
                    },
                )
                FaseCollega.FotocameraRotta -> Pieno(
                    icona = { IconaTonda(Icone.fotocameraNo) },
                    titolo = "La fotocamera non si apre",
                    testo = "Chiudi le altre app che la usano e riprova. Sul computer si entra anche con email e password.",
                    pulsante = "Riprova", onPulsante = ::inquadra,
                )
                else -> Unit
            }
        }
    }
}

/** Le fasi della schermata, come le situazioni del prototipo. */
private sealed interface FaseCollega {
    data object Inquadra : FaseCollega
    data class Conferma(val codice: CodiceCollega) : FaseCollega
    data class Collego(val codice: CodiceCollega) : FaseCollega
    data class Entrato(val nome: String) : FaseCollega
    data object NonRisposto : FaseCollega
    data class Errore(val frase: String) : FaseCollega
    data object SenzaFotocamera : FaseCollega
    data object FotocameraRotta : FaseCollega
}

/** La curva morbida del prototipo (cubic-bezier(.2,.8,.2,1)). */
private val Morbida = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

/** Il lato della finestra quadrata in cui si inquadra il codice. */
private val LATO_FINESTRA = 250.dp

/** La finestra sta al 40% dell'altezza dello schermo, come nel prototipo. */
private const val ALTEZZA_FINESTRA = 0.40f

private fun haFotocamera(ctx: Context): Boolean =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

private fun Context.attivita(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

private fun apriImpostazioniApp(ctx: Context) {
    runCatching {
        ctx.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/**
 * Sulla fotocamera le icone della barra di stato sono chiare (il fondo è scuro);
 * la barra in basso torna scura sopra il foglio bianco. Uscendo, com'erano.
 */
@Composable
private fun BarreDiSistema(fotocamera: Boolean, foglio: Boolean) {
    val view = LocalView.current
    val scuro = W.colori.scuro
    DisposableEffect(fotocamera, foglio, scuro) {
        val finestra = view.context.attivita()?.window
        val barre = finestra?.let { WindowCompat.getInsetsController(it, view) }
        val primaSopra = barre?.isAppearanceLightStatusBars
        val primaSotto = barre?.isAppearanceLightNavigationBars
        if (barre != null && fotocamera) {
            barre.isAppearanceLightStatusBars = false
            barre.isAppearanceLightNavigationBars = foglio && !scuro
        }
        onDispose {
            if (barre != null && primaSopra != null && primaSotto != null) {
                barre.isAppearanceLightStatusBars = primaSopra
                barre.isAppearanceLightNavigationBars = primaSotto
            }
        }
    }
}

/** La barra in alto: indietro (tondo da 48, senza fondo) e il titolo. Bianca sulla fotocamera. */
@Composable
private fun BarraCollega(chiaro: Boolean, onIndietro: () -> Unit) {
    val colore = if (chiaro) Color.White else W.colori.testo
    Row(
        Modifier.fillMaxWidth().let { if (chiaro) it.statusBarsPadding() else it }.height(60.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier.size(48.dp).clip(CircleShape).clickable(onClick = onIndietro)
                .semantics { contentDescription = "Indietro"; role = Role.Button },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.indietro, null, tint = colore, modifier = Modifier.size(24.dp)) }
        Text(
            "Collega un computer", style = Testi.titoloSezione.copy(fontSize = 20.sp, lineHeight = 25.sp), color = colore,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() },
        )
    }
}

// ---------------------------------------------------------------------------------- la fotocamera

/**
 * L'anteprima della fotocamera di dietro (CameraX, PreviewView) e l'analisi delle
 * immagini 1280×720 con ZXing, solo QR, tenendo solo l'ultima immagine. Con
 * [analizza] falso le immagini si buttano (il foglio di conferma è aperto).
 * Uscendo dalla composizione la fotocamera si spegne.
 */
@Composable
private fun AnteprimaQr(analizza: Boolean, onTesto: (String) -> Unit, onRotta: () -> Unit) {
    val ctx = LocalContext.current
    val ciclo = LocalLifecycleOwner.current
    val aTesto by rememberUpdatedState(onTesto)
    val aRotta by rememberUpdatedState(onRotta)
    val acceso = remember { AtomicBoolean(analizza) }
    SideEffect { acceso.set(analizza) }
    val anteprima = remember {
        PreviewView(ctx).apply {
            // TextureView: la pagina entra e esce con una dissolvenza, e la SurfaceView non la segue.
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    DisposableEffect(ciclo) {
        val esecutore: ExecutorService = Executors.newSingleThreadExecutor()
        val principale = ContextCompat.getMainExecutor(ctx)
        val futuro = ProcessCameraProvider.getInstance(ctx)
        var fornitore: ProcessCameraProvider? = null
        var spento = false
        futuro.addListener({
            if (spento) return@addListener
            try {
                val p = futuro.get()
                fornitore = p
                val selettore = when {
                    p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
                    p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
                    else -> { aRotta(); return@addListener }
                }
                val preview = Preview.Builder().build().also { it.surfaceProvider = anteprima.surfaceProvider }
                val analisi = ImageAnalysis.Builder()
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                            .build(),
                    )
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analisi.setAnalyzer(esecutore, LettoreQr(acceso) { t -> principale.execute { aTesto(t) } })
                p.unbindAll()
                p.bindToLifecycle(ciclo, selettore, preview, analisi)
            } catch (e: Exception) {
                aRotta()
            }
        }, principale)
        onDispose {
            spento = true
            runCatching { fornitore?.unbindAll() }
            esecutore.shutdown()
        }
    }
    AndroidView(factory = { anteprima }, modifier = Modifier.fillMaxSize())
}

/**
 * L'analizzatore: il piano Y (la luminanza) dell'immagine al lettore di ZXing,
 * solo QR (LettoreQrZxing). Il QR si legge girato in ogni verso, quindi la
 * rotazione del telefono non conta.
 */
private class LettoreQr(private val acceso: AtomicBoolean, private val onTesto: (String) -> Unit) : ImageAnalysis.Analyzer {
    private val lettore = LettoreQrZxing()
    private var dati = ByteArray(0)

    override fun analyze(immagine: ImageProxy) {
        try {
            if (!acceso.get()) return
            val piano = immagine.planes[0]
            val larghezza = immagine.width
            val altezza = immagine.height
            if (dati.size != larghezza * altezza) dati = ByteArray(larghezza * altezza)
            val buffer = piano.buffer
            buffer.rewind()
            val passo = piano.rowStride
            if (passo == larghezza) {
                buffer.get(dati, 0, larghezza * altezza)
            } else {
                for (riga in 0 until altezza) {
                    buffer.position(riga * passo)
                    buffer.get(dati, riga * larghezza, larghezza)
                }
            }
            lettore.leggi(dati, larghezza, altezza)?.let(onTesto)
        } catch (_: Exception) {
            // Un'immagine strana non ferma la fotocamera: si passa alla prossima.
        } finally {
            immagine.close()
        }
    }
}

/**
 * Il velo scuro (nero al 55%) con la finestra quadrata di 250 dp ad angoli
 * arrotondati e i quattro angoli bianchi; letto il codice, gli angoli diventano
 * gialli e la finestra si stringe un poco (0,94).
 */
@Composable
private fun VeloFinestra(letto: Boolean, menoAnimazioni: Boolean) {
    val giallo = W.colori.giallo
    val scala by animateFloatAsState(if (letto) 0.94f else 1f, tween(if (menoAnimazioni) 0 else 250, easing = Morbida), label = "finestra")
    Canvas(Modifier.fillMaxSize()) {
        val lato = LATO_FINESTRA.toPx() * scala
        val centro = Offset(size.width / 2f, size.height * ALTEZZA_FINESTRA)
        val finestra = androidx.compose.ui.geometry.Rect(centro.x - lato / 2, centro.y - lato / 2, centro.x + lato / 2, centro.y + lato / 2)
        val buco = Path().apply {
            fillType = PathFillType.EvenOdd
            addRect(androidx.compose.ui.geometry.Rect(Offset.Zero, size))
            addRoundRect(RoundRect(finestra, CornerRadius(26.dp.toPx() * scala)))
        }
        drawPath(buco, Color.Black.copy(alpha = 0.55f))
        // Gli angoli: un bordo di 4 dp appena fuori dalla finestra (3 dp), visibile solo nei quadrati di 54 dp agli angoli.
        val fuori = 3.dp.toPx() * scala
        val spessore = 4.dp.toPx() * scala
        val esterno = finestra.inflate(fuori)
        val lineaCentro = esterno.deflate(spessore / 2)
        val raggio = 28.dp.toPx() * scala - spessore / 2
        val pezzo = 54.dp.toPx() * scala
        val colore = if (letto) giallo else Color.White.copy(alpha = 0.9f)
        listOf(
            Offset(esterno.left, esterno.top), Offset(esterno.right - pezzo, esterno.top),
            Offset(esterno.left, esterno.bottom - pezzo), Offset(esterno.right - pezzo, esterno.bottom - pezzo),
        ).forEach { angolo ->
            clipRect(angolo.x, angolo.y, angolo.x + pezzo, angolo.y + pezzo) {
                drawRoundRect(
                    colore, topLeft = lineaCentro.topLeft, size = lineaCentro.size,
                    cornerRadius = CornerRadius(raggio), style = Stroke(spessore),
                )
            }
        }
    }
}

/** Dopo 10 secondi a inquadrare senza un codice: vero (si azzera a ogni [giro]). */
@Composable
private fun rememberAiuto(attivo: Boolean, giro: Int): Boolean {
    var aiuto by remember(giro) { mutableStateOf(false) }
    LaunchedEffect(attivo, giro) {
        if (!attivo) return@LaunchedEffect
        delay(10_000)
        aiuto = true
    }
    return aiuto && attivo
}

/**
 * Sotto la finestra: "Inquadra il codice sul computer" e, quando serve, una riga
 * scura: "Questo non è un codice di Wisper Ufficio" (per 3 secondi dall'ultimo QR
 * sbagliato) o l'aiuto dei 10 secondi.
 */
@Composable
private fun RigheSottoFinestra(mostra: Boolean, aiuto: Boolean, rifiutatoAlle: Long) {
    if (!mostra) return
    var rifiutato by remember { mutableStateOf(false) }
    LaunchedEffect(rifiutatoAlle) {
        if (rifiutatoAlle == 0L) return@LaunchedEffect
        rifiutato = true
        delay(3_000)
        rifiutato = false
    }
    val riga = when {
        rifiutato -> CollegaQr.NON_E_WISPER
        aiuto -> "Avvicina il telefono o alza la luminosità dello schermo"
        else -> null
    }
    val densita = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val centro = with(densita) { (constraints.maxHeight * ALTEZZA_FINESTRA).toDp() }
        Text(
            "Inquadra il codice sul computer",
            style = TextStyle(
                fontFamily = Carattere, fontSize = 17.sp, fontWeight = FontWeight.Bold, lineHeight = 22.sp,
                shadow = Shadow(Color.Black.copy(alpha = 0.6f), Offset(0f, with(densita) { 1.dp.toPx() }), with(densita) { 6.dp.toPx() }),
            ),
            color = Color.White, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().offset(y = centro + 150.dp).padding(horizontal = 20.dp),
        )
        AnimatedVisibility(
            visible = riga != null,
            enter = fadeIn(tween(300)), exit = fadeOut(tween(200)),
            modifier = Modifier.align(Alignment.TopCenter).offset(y = centro + 186.dp),
        ) {
            var ultima by remember { mutableStateOf(riga.orEmpty()) }
            if (riga != null) ultima = riga
            Box(
                Modifier.widthIn(max = 320.dp).width(320.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xDB1B1B1F))
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .semantics { liveRegion = LiveRegionMode.Polite },
                contentAlignment = Alignment.Center,
            ) {
                Text(ultima, style = Testi.secondarioGrande, color = Color.White, textAlign = TextAlign.Center)
            }
        }
    }
}

// ---------------------------------------------------------------------------------- il foglio di conferma

/**
 * "Collegare questo computer?": il nome del computer in un riquadro, come chi
 * entrerà, Collega (giallo, l'unico della schermata) e Annulla, che riprende a
 * inquadrare. È la difesa contro chi fa inquadrare un codice suo.
 */
@Composable
private fun FoglioConfermaComputer(codice: CodiceCollega, chi: String, onCollega: () -> Unit, onAnnulla: () -> Unit) {
    val c = W.colori
    Column(
        Modifier.fillMaxWidth()
            .shadow(40.dp, RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp), ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.25f))
            .clip(RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp))
            .background(c.scheda)
            .navigationBarsPadding()
            .padding(start = 22.dp, end = 22.dp, top = 12.dp, bottom = 28.dp),
    ) {
        Box(Modifier.align(Alignment.CenterHorizontally).size(width = 40.dp, height = 5.dp).clip(RoundedCornerShape(3.dp)).background(c.bordoCampo))
        Spacer(Modifier.height(16.dp))
        Text("Collegare questo computer?", style = Testi.titoloScheda, color = c.testo, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(14.dp))
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.superficie2).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(c.scheda), contentAlignment = Alignment.Center) {
                Icon(Icone.pc, null, tint = c.testo, modifier = Modifier.size(24.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(codice.nome, style = Testi.forteGrande.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold, lineHeight = 23.sp), color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("Wisper Ufficio su Windows", style = Testi.secondario, color = c.tenue)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            buildAnnotatedString {
                append("Entrerà come ")
                withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold, color = c.testo)) { append(chi) }
                append(", con i tuoi stessi permessi. Lo scolleghi quando vuoi da Amministrazione › Dispositivi.")
            },
            style = Testi.testo, color = c.testo2,
        )
        Spacer(Modifier.height(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PulsanteGialloCollega("Collega", onCollega, Modifier.fillMaxWidth())
            Box(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onAnnulla)
                    .semantics { role = Role.Button },
                contentAlignment = Alignment.Center,
            ) {
                Text("Annulla", style = Testi.pulsanteSecondario.copy(textDecoration = TextDecoration.Underline), color = c.testo2)
            }
        }
    }
}

/** Il pulsante giallo del prototipo: alto 54, angoli da 14, 17/700. */
@Composable
private fun PulsanteGialloCollega(testo: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(
        modifier.heightIn(min = 54.dp).clip(RoundedCornerShape(14.dp)).background(c.giallo).clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(testo, style = Testi.pulsanteSecondario.copy(fontSize = 17.sp, lineHeight = 22.sp), color = c.suGiallo, textAlign = TextAlign.Center)
    }
}

// ---------------------------------------------------------------------------------- le pagine piene

/** Un esito a tutta pagina: icona, titolo, una frase e al massimo un pulsante giallo. */
@Composable
private fun Pieno(icona: @Composable () -> Unit, titolo: String, testo: String, pulsante: String? = null, onPulsante: () -> Unit = {}) {
    val c = W.colori
    Column(
        Modifier.semantics(mergeDescendants = false) { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        icona()
        Text(
            titolo, style = Testi.titoloScheda.copy(fontSize = 24.sp, lineHeight = 30.sp, letterSpacing = 0.sp), color = c.testo,
            textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() },
        )
        Text(testo, style = Testi.testo, color = c.testo2, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 300.dp))
        if (pulsante != null) PulsanteGialloCollega(pulsante, onPulsante, Modifier.widthIn(min = 220.dp))
    }
}

/** Il cerchio grigio da 64 con l'icona da 30 (fotocamera barrata, rete barrata). */
@Composable
private fun IconaTonda(icona: ImageVector) {
    val c = W.colori
    Box(Modifier.size(64.dp).clip(CircleShape).background(c.superficie2), contentAlignment = Alignment.Center) {
        Icon(icona, null, tint = c.testo, modifier = Modifier.size(30.dp))
    }
}

/** "Collego…": un anello grigio con un quarto giallo che gira (fermo se il sistema chiede meno animazioni). */
@Composable
private fun Rotella(menoAnimazioni: Boolean, dimensione: Dp = 40.dp) {
    val c = W.colori
    val giro = rememberInfiniteTransition(label = "rotella")
    val angolo by giro.animateFloat(0f, 360f, infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Restart), label = "angolo")
    Canvas(Modifier.size(dimensione).graphicsLayer { rotationZ = if (menoAnimazioni) 0f else angolo }) {
        val s = 4.dp.toPx()
        val area = Misura(size.width - s, size.height - s)
        val inizio = Offset(s / 2, s / 2)
        drawArc(c.superficie2, 0f, 360f, false, inizio, area, style = Stroke(s))
        drawArc(c.giallo, -135f, 90f, false, inizio, area, style = Stroke(s))
    }
}

/** La spunta verde che entra (0,35 s) e si disegna (0,4 s dopo 0,15 s): "<nome> è entrato". */
@Composable
private fun SpuntaEntrato(menoAnimazioni: Boolean) {
    val c = W.colori
    val entra = remember { Animatable(if (menoAnimazioni) 1f else 0f) }
    val traccia = remember { Animatable(if (menoAnimazioni) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (menoAnimazioni) return@LaunchedEffect
        entra.animateTo(1f, tween(350, easing = Morbida))
    }
    LaunchedEffect(Unit) {
        if (menoAnimazioni) return@LaunchedEffect
        delay(150)
        traccia.animateTo(1f, tween(400, easing = CubicBezierEasing(0f, 0f, 0.58f, 1f)))
    }
    Box(
        Modifier.size(84.dp).graphicsLayer {
            val s = 0.6f + 0.4f * entra.value
            scaleX = s; scaleY = s; alpha = entra.value
        }.clip(CircleShape).background(c.firmatoFondo),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(44.dp)) {
            // Lo stesso tratto di Icone.spunta (M5 12.5l4.5 4.5L19 7.5) nel quadrato da 24, spessore 2,6.
            val k = size.width / 24f
            val tratto = Path().apply {
                moveTo(5f * k, 12.5f * k)
                lineTo(9.5f * k, 17f * k)
                lineTo(19f * k, 7.5f * k)
            }
            val misura = PathMeasure().apply { setPath(tratto, false) }
            val pezzo = Path()
            misura.getSegment(0f, misura.length * traccia.value, pezzo, true)
            drawPath(pezzo, c.firmatoTesto, style = Stroke(2.6f * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}
