package eu.stgm.wisper

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.ui.FormRapportino
import eu.stgm.wisper.ui.IconaMicrofono
import eu.stgm.wisper.ui.PallaDiPuntini
import eu.stgm.wisper.ui.StatoPalla

class MainActivity : ComponentActivity() {

    private var permessoMicrofono by mutableStateOf(false)

    private val chiediMicrofono =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            permessoMicrofono = it
        }

    private val chiediNotifiche =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Lo schermo resta acceso SOLO mentre c'e' una conversazione in corso
        // (vedi piu' avanti): a riposo si spegne quando decide il telefono,
        // secondo le impostazioni di chi lo usa. Tenerlo acceso sempre era una
        // scorciatoia mia, e nessuna app dovrebbe permettersi di ignorare
        // quell'impostazione.

        permessoMicrofono = ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

        if (!permessoMicrofono) chiediMicrofono.launch(Manifest.permission.RECORD_AUDIO)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            chiediNotifiche.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent {
            MaterialTheme(colorScheme = SchemaWisper) {
                SchermataWisper(permessoMicrofono)
            }
        }
    }
}

@Composable
private fun SchermataWisper(microfono: Boolean) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    // Il giro NON vive piu' qui: vive nel servizio, che resta acceso anche ad
    // app chiusa. La schermata lo guarda e basta, cosi' puo' aprirsi e
    // chiudersi quante volte vuole senza interrompere una conversazione.
    val g by ServizioAscolto.giro.collectAsStateWithLifecycle()

    LaunchedEffect(microfono) {
        if (!microfono) {
            Log.w("Wisper", "manca il permesso del microfono")
            return@LaunchedEffect
        }
        ServizioAscolto.accendi(ctx)
    }

    // Aprire l'app E' un'attivazione: chi la apre vuole dettare, non dire
    // anche la parola magica. Se il giro e' fermo, si parte parlando.
    LaunchedEffect(g) {
        if (g != null && g?.fase?.value == Fase.RIPOSO) g?.apriAMano()
    }

    // Botola di collaudo, solo nelle build di prova: permette di provare tutto
    // il giro dal computer, senza dover parlare.
    //   adb shell am broadcast -a eu.stgm.wisper.DETTA -p eu.stgm.wisper --es testo "'...'"
    DisposableEffect(g) {
        val giro = g
        if (giro == null || !BuildConfig.DEBUG) return@DisposableEffect onDispose { }
        val ricevitore = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                when (i?.action) {
                    "eu.stgm.wisper.DETTA" ->
                        i.getStringExtra("testo")?.takeIf { it.isNotBlank() }
                            ?.let(giro::simulaDetto)
                    "eu.stgm.wisper.CAMPIONA_VOCI" -> giro.campionaVoci()
                    "eu.stgm.wisper.VOCE" ->
                        i.getStringExtra("nome")?.takeIf { it.isNotBlank() }
                            ?.let(giro::imponiVoce)
                }
            }
        }
        ContextCompat.registerReceiver(
            ctx, ricevitore,
            IntentFilter().apply {
                addAction("eu.stgm.wisper.DETTA")
                addAction("eu.stgm.wisper.CAMPIONA_VOCI")
                addAction("eu.stgm.wisper.VOCE")
            },
            ContextCompat.RECEIVER_EXPORTED,
        )
        onDispose { runCatching { ctx.unregisterReceiver(ricevitore) } }
    }
    val fase = g?.fase?.collectAsStateWithLifecycle()?.value ?: Fase.RIPOSO
    val rapportino = g?.rapportino?.collectAsStateWithLifecycle()?.value
    val messaggio = g?.messaggio?.collectAsStateWithLifecycle()?.value.orEmpty()
    val trascrizione = g?.trascrizione?.collectAsStateWithLifecycle()?.value.orEmpty()
    val anagrafiche = g?.anagrafiche?.collectAsStateWithLifecycle()?.value

    // Il form prende il posto della palla appena c'e' qualcosa da mostrare.
    val conDati = rapportino != null && rapportino != eu.stgm.wisper.rapportino.Rapportino()

    // Lo schermo resta acceso finche' si sta parlando — chi detta non tocca il
    // telefono, e Android lo spegnerebbe a meta' rapportino. Appena il giro
    // finisce il vincolo cade, e il telefono torna a spegnersi quando decide
    // il suo proprietario: nessuna app dovrebbe ignorare quell'impostazione.
    val finestra = (ctx as? android.app.Activity)?.window
    LaunchedEffect(fase, finestra) {
        if (fase != Fase.RIPOSO) {
            finestra?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            finestra?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Nero)
            // Tocco ovunque = apre la conversazione. Rete di sicurezza per il
            // collaudo e per quando la parola magica non viene sentita.
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
            ) { g?.apriAMano() },
    ) {

        // ---- la palla: c'e' finche' non ci sono dati ----
        AnimatedVisibility(
            visible = !conDati,
            enter = fadeIn(tween(400)) + scaleIn(tween(400), initialScale = 0.85f),
            exit = fadeOut(tween(320)) + scaleOut(tween(320), targetScale = 0.7f),
            modifier = Modifier.fillMaxSize(),
        ) {
            PallaDiPuntini(
                stato = when (fase) {
                    Fase.RIPOSO -> StatoPalla.RIPOSO
                    Fase.ASCOLTO -> StatoPalla.ASCOLTO
                    Fase.PENSA, Fase.SALVA -> StatoPalla.PENSA
                    Fase.PARLA -> StatoPalla.PARLA
                },
                ampiezza = if (trascrizione.isNotBlank()) 1f else 0f,
                modifier = Modifier.fillMaxSize(),
            )
        }

        // ---- la scheda e le parole dette: un gruppo solo, centrato ----
        //
        // Stavano in due punti diversi dello schermo, e si leggevano come due
        // cose scollegate. Sono la stessa cosa vista da due lati: sopra quello
        // che Wisper ha capito, sotto quello che stai dicendo adesso. Vicini
        // ma staccati, cosi' l'occhio passa dall'uno all'altro senza cercarli.
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Il microfono sopra la scheda: quando i campi si riempiono la
            // palla sparisce, e con lei sparirebbe l'unico segnale che dice
            // "adesso tocca a te".
            if (conDati) {
                IconaMicrofono(
                    visibile = fase == Fase.ASCOLTO,
                    modifier = Modifier
                        .padding(bottom = 20.dp)
                        .size(38.dp),
                )
            }

            AnimatedVisibility(
                visible = conDati,
                enter = fadeIn(tween(420)) + slideInVertically(tween(420)) { it / 6 },
                exit = fadeOut(tween(260)),
            ) {
                rapportino?.let {
                    FormRapportino(
                        rapportino = it,
                        commessaLeggibile = anagrafiche?.descrizioneCommessa(it.commessa),
                        indirizzoCommessa = anagrafiche?.indirizzoCommessa(it.commessa),
                        messaggio = messaggio,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            // Senza scheda a schermo c'e' la palla, che occupa il centro: le
            // parole vanno spinte sotto, altrimenti ci finiscono sopra.
            if (trascrizione.isNotBlank()) {
                Spacer(Modifier.height(if (conDati) 44.dp else 340.dp))
            }

            if (trascrizione.isNotBlank()) {
                Text(
                    text = trascrizione,
                    color = Bianco.copy(alpha = 0.5f),
                    fontSize = 16.sp,
                    lineHeight = 23.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 34.dp),
                )
            }
        }
    }
}

// Colori decisi a mano, NON presi dallo sfondo del telefono: nel video devono
// essere sempre gli stessi su qualunque dispositivo.
val Nero = Color(0xFF07080A)
val Bianco = Color(0xFFF2F4F7)
val Giallo = Color(0xFFFFC53D)
val Blu = Color(0xFF3D8BFF)

val SchemaWisper = darkColorScheme(
    background = Nero,
    surface = Nero,
    primary = Giallo,
    secondary = Blu,
    onBackground = Bianco,
    onSurface = Bianco,
)
