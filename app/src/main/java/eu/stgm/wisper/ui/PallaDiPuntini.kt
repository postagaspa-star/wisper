package eu.stgm.wisper.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * La palla di puntini: l'unica cosa a schermo mentre Wisper ascolta o parla.
 *
 * Non e' composta da componenti: e' DISEGNATA punto per punto su una tela.
 * E' il motivo per cui non somiglia a un'app Android qualunque — i componenti
 * standard di Material (barre, pulsanti tondi, schede) sono esattamente cio'
 * che rende anonime tutte le app uguali.
 *
 * I punti stanno su una sfera vera, distribuiti con la spirale di Fibonacci
 * (l'unico modo semplice per spargerli in modo uniforme: a griglia si
 * ammasserebbero ai poli). La sfera ruota piano, e la profondita' decide
 * dimensione e trasparenza di ogni punto: e' cosi' che si legge come una
 * palla e non come un cerchio piatto.
 */
enum class StatoPalla {
    /** App aperta, non sta succedendo niente. Bianca, respira piano. */
    RIPOSO,

    /** Sta ascoltando il tecnico. Gialla, pulsa con la voce. */
    ASCOLTO,

    /** Sta ragionando. Si stringe e gira piu' in fretta: si vede che lavora. */
    PENSA,

    /** Sta parlando Wisper. Blu, onde che corrono dal polo verso l'equatore. */
    PARLA,
}

@Composable
fun PallaDiPuntini(
    stato: StatoPalla,
    modifier: Modifier = Modifier,
    /**
     * Quanto forte sta parlando l'utente, da 0 a 1. Fa pulsare la palla in
     * modo che si veda che sta davvero sentendo, invece di animarsi a vuoto.
     */
    ampiezza: Float = 0f,
    punti: Int = 170,
) {
    // Tempo continuo in secondi. Un LaunchedEffect con withFrameNanos e' il
    // modo giusto: si aggiorna una volta per fotogramma e si ferma da solo
    // quando la schermata esce.
    var t by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val inizio = withFrameNanos { it }
        while (true) {
            withFrameNanos { ora -> t = (ora - inizio) / 1_000_000_000f }
        }
    }

    val colore by animateColorAsState(
        targetValue = when (stato) {
            StatoPalla.RIPOSO -> BiancoPunti
            StatoPalla.ASCOLTO, StatoPalla.PENSA -> GialloPunti
            StatoPalla.PARLA -> BluPunti
        },
        animationSpec = tween(450),
        label = "colore palla",
    )

    // Quanto "eccitata" e' la palla: da ferma (riposo) a mossa (parla).
    val energia by animateFloatAsState(
        targetValue = when (stato) {
            StatoPalla.RIPOSO -> 0f
            StatoPalla.ASCOLTO -> 0.5f
            StatoPalla.PENSA -> 0.25f
            StatoPalla.PARLA -> 1f
        },
        animationSpec = tween(450),
        label = "energia palla",
    )

    // Il microfono compare solo in ASCOLTO, con una dissolvenza: comparire di
    // scatto sembrerebbe un errore, non un invito a parlare.
    val microfono by animateFloatAsState(
        targetValue = if (stato == StatoPalla.ASCOLTO) 1f else 0f,
        animationSpec = tween(320),
        label = "microfono",
    )

    // Mentre ragiona la sfera si stringe e gira piu' in fretta. E' l'unico modo
    // per far capire che sta lavorando a chi guarda: senza, quel secondo di
    // attesa sembra un blocco.
    val stretta by animateFloatAsState(
        targetValue = if (stato == StatoPalla.PENSA) 0.74f else 1f,
        animationSpec = tween(380),
        label = "stretta palla",
    )
    val velocita by animateFloatAsState(
        targetValue = if (stato == StatoPalla.PENSA) 4.5f else 1f,
        animationSpec = tween(380),
        label = "velocita palla",
    )

    // Le posizioni sulla sfera si calcolano UNA volta sola: a ogni fotogramma
    // si ruota e si proietta, che e' molto piu' economico.
    val sfera = remember(punti) { sferaFibonacci(punti) }

    Canvas(modifier = modifier) {
        val cx = size.width / 2f
        val cy = size.height / 2f
        val raggioBase = minOf(size.width, size.height) * 0.34f

        val rotazione = t * ROTAZIONE_RAD_AL_SECONDO * velocita
        val respiro = 1f + sin(t * 1.1f) * 0.018f          // sempre, anche a riposo

        // IL BATTITO. Si allarga e si stringe, asimmetrico: cresce parecchio e
        // rientra appena sotto la misura di partenza.
        //
        // Il problema di una sinusoide sola e' che si sente il metronomo: il
        // cervello ne indovina il prossimo picco dopo due cicli.
        //
        // Prima avevo sommato due onde, e non andava: sommandole si accorciano
        // a vicenda, perche' arrivano al massimo insieme quasi mai. Il risultato
        // era irregolare ma anche piu' piccolo, e l'ingrandimento si perdeva.
        //
        // Qui la seconda onda non si SOMMA: sposta il RITMO della prima,
        // allungando e accorciando i battiti. L'ampiezza resta piena — la
        // palla si allarga per intero — ma il momento del picco cambia di
        // continuo, quindi il metronomo sparisce lo stesso.
        val fase = t * FREQUENZA_BATTITO + sin(t * FREQUENZA_BATTITO * DERIVA) * PROFONDITA_DERIVA
        val misto = sin(fase)

        // Salita svelta, rientro piu' morbido: e' la forma di un battito, non
        // quella di un pendolo. Elevare a potenza <1 sull'espansione anticipa
        // il picco; a potenza >1 sulla contrazione la fa scendere piano.
        val sagoma = if (misto >= 0f) {
            misto.pow(0.72f) * ESPANSIONE
        } else {
            -((-misto).pow(1.35f)) * CONTRAZIONE
        }
        val battito = 1f + energia * sagoma

        val pulsazioneVoce = 1f + ampiezza * 0.10f * energia

        for (p in sfera) {
            // --- rotazione attorno all'asse verticale ---
            val cosR = cos(rotazione)
            val sinR = sin(rotazione)
            val x = p.x * cosR - p.z * sinR
            val z = p.x * sinR + p.z * cosR
            val y = p.y

            // Ogni punto parte con un ritardo piccolissimo e tutto suo, preso
            // dalla sua posizione sulla sfera. Non si vede come sfasamento: si
            // vede che i puntini non scattano tutti insieme come un ingranaggio.
            val ritardo = (p.x + p.z) * SFASAMENTO
            val battitoSuo = 1f + (battito - 1f) * (1f + ritardo)

            val raggio = raggioBase * stretta * respiro * pulsazioneVoce * battitoSuo

            // --- prospettiva: piu' e' lontano, piu' e' piccolo e sbiadito ---
            val profondita = (z + 1f) / 2f                  // 0 dietro, 1 davanti
            val scala = 0.72f + profondita * 0.28f

            val px = cx + x * raggio * scala
            val py = cy + y * raggio * scala

            // Anche i singoli puntini crescono col battito, non solo la sfera:
            // senza, allargandosi si diraderebbero e la palla sembrerebbe
            // svuotarsi invece che gonfiarsi.
            val dimensione = (1.05f + profondita * 1.75f) *
                (size.minDimension / 380f) *
                (1f + (battitoSuo - 1f) * 1.6f)
            val opacita = 0.20f + profondita * 0.80f

            drawCircle(
                color = colore.copy(alpha = colore.alpha * opacita),
                radius = dimensione,
                center = Offset(px, py),
            )
        }

        // Il microfono sopra la palla: c'e' SOLO mentre tocca a te parlare.
        //
        // Il colore da solo non basta a dire di chi e' il turno — giallo e blu
        // si alternano e vanno imparati. Un microfono no: si capisce al primo
        // sguardo, anche da un video, anche senza aver mai visto l'app.
        if (microfono > 0.01f) {
            disegnaMicrofono(
                centro = Offset(cx, cy - raggioBase * 1.42f),
                altezza = raggioBase * 0.30f,
                colore = GialloPunti.copy(alpha = microfono),
                battito = battito,
            )
        }
    }
}

/**
 * Lo stesso microfono, da solo. Serve sopra la scheda: quando i campi si
 * riempiono la palla sparisce, e senza questo tornerebbe l'ambiguita' di
 * prima — non si capirebbe piu' di chi e' il turno di parlare.
 */
@Composable
fun IconaMicrofono(
    visibile: Boolean,
    modifier: Modifier = Modifier,
) {
    val alfa by animateFloatAsState(
        targetValue = if (visibile) 1f else 0f,
        animationSpec = tween(320),
        label = "microfono scheda",
    )
    var t by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val inizio = withFrameNanos { it }
        while (true) withFrameNanos { ora -> t = (ora - inizio) / 1_000_000_000f }
    }

    Canvas(modifier = modifier) {
        if (alfa <= 0.01f) return@Canvas
        // Stesso battito della palla, cosi' i due si muovono insieme anche
        // quando non sono a schermo nello stesso momento.
        val fase = t * FREQUENZA_BATTITO +
            sin(t * FREQUENZA_BATTITO * DERIVA) * PROFONDITA_DERIVA
        val onda = sin(fase)
        val battito = 1f + if (onda >= 0f) onda.pow(0.72f) * ESPANSIONE * 0.5f else 0f

        disegnaMicrofono(
            centro = Offset(size.width / 2f, size.height / 2f),
            altezza = size.height * 0.86f,
            colore = GialloPunti.copy(alpha = alfa),
            battito = battito,
        )
    }
}

/** Microfono da radio: capsula, archetto, stelo. Disegnato, non importato. */
private fun DrawScope.disegnaMicrofono(
    centro: Offset,
    altezza: Float,
    colore: Color,
    battito: Float,
) {
    val h = altezza * battito          // respira insieme alla palla
    val larghezzaCapsula = h * 0.42f
    val spessore = h * 0.09f

    // capsula
    drawRoundRect(
        color = colore,
        topLeft = Offset(centro.x - larghezzaCapsula / 2f, centro.y - h * 0.5f),
        size = Size(larghezzaCapsula, h * 0.58f),
        cornerRadius = CornerRadius(larghezzaCapsula / 2f),
    )
    // archetto sotto
    val raggioArco = larghezzaCapsula * 0.86f
    drawArc(
        color = colore,
        startAngle = 0f,
        sweepAngle = 180f,
        useCenter = false,
        topLeft = Offset(centro.x - raggioArco, centro.y - raggioArco * 0.55f),
        size = Size(raggioArco * 2f, raggioArco * 2f * 0.78f),
        style = Stroke(width = spessore, cap = StrokeCap.Round),
    )
    // stelo
    drawLine(
        color = colore,
        start = Offset(centro.x, centro.y + raggioArco * 0.68f),
        end = Offset(centro.x, centro.y + h * 0.62f),
        strokeWidth = spessore,
        cap = StrokeCap.Round,
    )
}

/** Un punto sulla sfera di raggio 1. */
private data class Punto(val x: Float, val y: Float, val z: Float)

/**
 * Spirale di Fibonacci: sparge N punti sulla sfera in modo uniforme.
 * Con una griglia normale (latitudine/longitudine) si ammasserebbero tutti
 * ai poli e la palla sembrerebbe sbilenca.
 */
private fun sferaFibonacci(n: Int): List<Punto> {
    val angoloAureo = PI.toFloat() * (3f - sqrt(5f))
    return List(n) { i ->
        val y = 1f - (i / (n - 1f)) * 2f          // da +1 (polo nord) a -1
        val r = sqrt((1f - y * y).coerceAtLeast(0f))
        val theta = angoloAureo * i
        Punto(cos(theta) * r, y, sin(theta) * r)
    }
}

private const val ROTAZIONE_RAD_AL_SECONDO = 0.22f

/** Poco piu' di un battito al secondo: veloce senza diventare nervoso. */
private const val FREQUENZA_BATTITO = 7.4f

/**
 * L'onda lenta che sposta il ritmo del battito, e di quanto lo sposta.
 * Un quinto della frequenza del battito: nell'arco di cinque battiti li
 * allunga e li accorcia tutti in modo diverso, senza che si senta una
 * seconda pulsazione sovrapposta.
 */
private const val DERIVA = 0.21f
private const val PROFONDITA_DERIVA = 0.85f

/** Di quanto ogni punto ritarda rispetto agli altri: pochissimo, ma basta. */
private const val SFASAMENTO = 0.10f

/**
 * Quanto cresce sull'espansione e quanto rientra sotto la misura di partenza.
 * Entrambi i movimenti partono da 1,0, cioe' dalla dimensione normale della
 * palla: si allarga del 28% e rientra del 7%.
 */
private const val ESPANSIONE = 0.28f
private const val CONTRAZIONE = 0.07f

// Colori dei punti. Restano qui e non nel tema: il tema serve al resto
// dell'app, questi tre sono l'identita' visiva di Wisper e non devono
// cambiare da un telefono all'altro.
private val BiancoPunti = Color(0xFFF2F4F7)
private val GialloPunti = Color(0xFFFFC53D)
private val BluPunti = Color(0xFF3D8BFF)
