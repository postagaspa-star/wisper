package eu.stgm.wisper.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/*
 * Le impostazioni si salvano da sole (06/11/2026): niente più "Salva". Un testo o un numero parte 800 ms dopo
 * l'ultimo tasto e quando il campo perde il fuoco, solo se va bene; un interruttore o una scelta subito. Riuscito:
 * "Salvato" con la spunta, piano, per un secondo e mezzo. Un no del server: il testo sotto il campo e nell'avviso,
 * e quello che si è scritto resta. Si manda con le chiamate di sempre; serve la rete come prima. I fogli che creano
 * qualcosa di nuovo tengono il loro pulsante.
 */

/** Quanto si aspetta dopo l'ultimo tasto. */
internal const val ATTESA_SALVA = 800L

/**
 * Il salvataggio da solo di una pagina. L'attesa dopo i tasti gira sulla pagina; l'invio su [ambitoAmm], così finisce
 * anche se si esce subito (uscendo, quello in attesa parte). Gli invii vanno uno alla volta, nell'ordine.
 */
@Stable
internal class SalvaDaSolo(private val avvisi: Avvisi, private val pagina: CoroutineScope) {
    private class InAttesa(val job: Job?, val lavoro: suspend () -> Result<*>, val conferma: String?, val onFallito: () -> Unit)

    private val attese = mutableMapOf<String, InAttesa>()
    private val coda = Mutex()
    private var contatore = 0L
    private val detti = mutableSetOf<String>()

    /** Chiave → l'ultimo salvataggio riuscito (un numero che cresce): fa vedere "Salvato". */
    val salvati = mutableStateMapOf<String, Long>()

    /** Chiave → il no del server, da mostrare sotto il campo finché non si riprova. */
    val errori = mutableStateMapOf<String, String>()

    /** Quanti invii stanno andando. */
    var inCorso by mutableIntStateOf(0)
        private set

    fun inAttesa(chiave: String): Boolean = chiave in attese

    /**
     * Da salvare fra [attesa] ms, se non arriva altro (null = solo quando il campo perde il fuoco o si esce).
     * [conferma] è un avviso da dire una volta sola per pagina ("Vale per i rapportini nuovi…").
     */
    fun piuTardi(chiave: String, conferma: String? = null, attesa: Long? = ATTESA_SALVA, onFallito: () -> Unit = {}, lavoro: suspend () -> Result<*>) {
        attese.remove(chiave)?.job?.cancel()
        val job = attesa?.let { ms ->
            pagina.launch {
                delay(ms)
                adesso(chiave)
            }
        }
        attese[chiave] = InAttesa(job, lavoro, conferma, onFallito)
    }

    /** Il valore non va (o è tornato com'era): quello in attesa non parte. */
    fun annulla(chiave: String) {
        attese.remove(chiave)?.job?.cancel()
    }

    /** Quello in attesa per [chiave] parte adesso (il campo ha perso il fuoco). */
    fun adesso(chiave: String) {
        val a = attese.remove(chiave) ?: return
        a.job?.cancel()
        manda(chiave, a.lavoro, a.conferma, a.onFallito)
    }

    /** Un interruttore o una scelta: parte subito. */
    fun subito(chiave: String, conferma: String? = null, onFallito: () -> Unit = {}, lavoro: suspend () -> Result<*>) {
        attese.remove(chiave)?.job?.cancel()
        manda(chiave, lavoro, conferma, onFallito)
    }

    /** Uscendo dalla pagina: parte tutto quello in attesa. */
    fun tutti() {
        attese.keys.toList().forEach { adesso(it) }
    }

    private fun manda(chiave: String, lavoro: suspend () -> Result<*>, conferma: String?, onFallito: () -> Unit) {
        inCorso++
        ambitoAmm.launch {
            val esito = coda.withLock {
                try {
                    lavoro()
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Result.failure<Unit>(e)
                }
            }
            inCorso--
            esito.fold(
                onSuccess = {
                    errori.remove(chiave)
                    salvati[chiave] = ++contatore
                    if (conferma != null && detti.add(conferma)) avvisi.mostra(conferma)
                },
                onFailure = { e ->
                    val t = spiegaErrore2(e, "Non è stato salvato: riprova")
                    errori[chiave] = t
                    avvisi.mostra(t)
                    onFallito()
                },
            )
        }
    }
}

/** Il salvataggio da solo di questa pagina: uscendo, quello che aspettava parte. */
@Composable
internal fun rememberSalvaDaSolo(): SalvaDaSolo {
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val s = remember { SalvaDaSolo(avvisi, scope) }
    DisposableEffect(s) { onDispose { s.tutti() } }
    return s
}

/** "Salvato" con la spunta, piano, per un secondo e mezzo dopo ogni salvataggio riuscito di [chiave]. */
@Composable
internal fun SegnoSalvato(salva: SalvaDaSolo, chiave: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val segno = salva.salvati[chiave]
    // Quello che c'era quando il campo è comparso non conta (una scheda richiusa e riaperta).
    val gia = remember { segno }
    var visibile by remember { mutableStateOf(false) }
    LaunchedEffect(segno) {
        if (segno != null && segno != gia) {
            visibile = true
            delay(1500)
            visibile = false
        }
    }
    val alfa by animateFloatAsState(if (visibile) 1f else 0f, label = "salvato")
    Row(
        modifier.alpha(alfa).then(
            if (visibile) Modifier.semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "Salvato" }
            else Modifier.clearAndSetSemantics { },
        ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icone.spunta, null, tint = c.tenue, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(4.dp))
        Text("Salvato", style = Testi.secondario, color = c.tenue)
    }
}

/** L'etichetta di un campo, con "Salvato" a destra. */
@Composable
internal fun EtichettaSalvata(etichetta: String, salva: SalvaDaSolo, chiave: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = W.colori.testo, modifier = Modifier.weight(1f))
        SegnoSalvato(salva, chiave, Modifier.padding(start = 8.dp))
    }
}

/**
 * Un campo che si salva da solo. [valore] è quello del server: entra nel campo quando non ci si sta scrivendo e non
 * c'è niente in sospeso. [cambia] sistema quello che si scrive (maiuscole), [controlla] dice cosa non va (null =
 * va bene, e allora si salva). [soloAllUscita]: si salva solo quando il campo perde il fuoco (il formato delle
 * commesse). Il campo si trova anche dalla ricerca delle impostazioni (Modifier.evidenziabile con [chiave]).
 */
@Composable
internal fun CampoSalvato(
    salva: SalvaDaSolo,
    chiave: String,
    valore: String,
    etichetta: String?,
    modifier: Modifier = Modifier,
    abilitato: Boolean = true,
    tastiera: KeyboardType = KeyboardType.Text,
    righe: Int = 1,
    suffisso: String? = null,
    segnaposto: String = "",
    conferma: String? = null,
    soloAllUscita: Boolean = false,
    cambia: (String) -> String = { it },
    controlla: (String) -> String? = { null },
    onScritto: (String) -> Unit = {},
    onSalva: suspend (String) -> Result<*>,
) {
    var testo by rememberSaveable(chiave) { mutableStateOf(valore) }
    var fuoco by remember { mutableStateOf(false) }
    var errore by remember { mutableStateOf<String?>(null) }
    // Cosa non va si dice dopo la pausa o lasciando il campo, non a ogni tasto.
    var dillo by remember { mutableStateOf(false) }
    LaunchedEffect(valore) {
        if (!fuoco && !salva.inAttesa(chiave) && salva.errori[chiave] == null) testo = valore
    }
    LaunchedEffect(testo) {
        dillo = false
        delay(ATTESA_SALVA)
        dillo = true
    }

    fun scritto(t: String) {
        testo = cambia(t)
        onScritto(testo)
        salva.errori.remove(chiave)
        val pulito = testo.trim()
        errore = controlla(pulito)
        when {
            errore != null || pulito == valore.trim() -> salva.annulla(chiave)
            else -> salva.piuTardi(chiave, conferma, attesa = if (soloAllUscita) null else ATTESA_SALVA) { onSalva(pulito) }
        }
    }

    Column(
        modifier.fillMaxWidth().evidenziabile(chiave).onFocusChanged { st ->
            val prima = fuoco
            fuoco = st.hasFocus
            if (prima && !st.hasFocus) {
                dillo = true
                salva.adesso(chiave)
            }
        },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (etichetta != null) EtichettaSalvata(etichetta, salva, chiave)
        CampoTesto(
            testo, { scritto(it) }, null, Modifier.fillMaxWidth(),
            segnaposto = segnaposto, errore = errore?.takeIf { dillo } ?: salva.errori[chiave], righe = righe, tastiera = tastiera,
            suffisso = suffisso, abilitato = abilitato,
        )
        if (etichetta == null) SegnoSalvato(salva, chiave, Modifier.align(Alignment.End))
    }
}

/**
 * Un interruttore che si salva da solo: si sposta subito, e se il server dice di no torna com'era. Senza
 * [abilitato] si legge "sì" o "no".
 */
@Composable
internal fun RigaInterruttoreSalvata(
    salva: SalvaDaSolo,
    chiave: String,
    testo: String,
    acceso: Boolean,
    abilitato: Boolean = true,
    sotto: String? = null,
    conferma: String? = null,
    onSalva: suspend (Boolean) -> Result<*>,
) {
    val c = W.colori
    var locale by remember(chiave) { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(acceso) { if (locale == acceso) locale = null }
    val mostrato = locale ?: acceso
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).evidenziabile(chiave), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(testo, style = Testi.forte, color = c.testo)
            if (sotto != null) Text(sotto, style = Testi.secondario, color = c.tenue)
            salva.errori[chiave]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        }
        SegnoSalvato(salva, chiave, Modifier.padding(horizontal = 8.dp))
        if (abilitato) {
            Interruttore(mostrato, { nuovo ->
                locale = nuovo
                salva.subito(chiave, conferma, onFallito = { locale = null }) { onSalva(nuovo) }
            }, testo)
        } else {
            Text(if (mostrato) "sì" else "no", style = Testi.forte, color = c.testo2)
        }
    }
}

// ---------------------------------------------------------------------------------- trovato dalla ricerca

/**
 * L'impostazione da far vedere (06/11/2026, "Cerca nelle impostazioni"): la pagina che la contiene la porta
 * sullo schermo e la colora di giallo tenue per un secondo e mezzo.
 */
internal object Evidenzia {
    var chiave by mutableStateOf<String?>(null)
}

/** Il punto della pagina che la ricerca delle impostazioni può far vedere ([Evidenzia]). */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.evidenziabile(chiave: String): Modifier = composed {
    val richiesta = remember { BringIntoViewRequester() }
    val cercata = Evidenzia.chiave
    var acceso by remember { mutableStateOf(false) }
    var grande by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    val margine = with(androidx.compose.ui.platform.LocalDensity.current) { 120.dp.toPx() }
    LaunchedEffect(cercata) {
        if (cercata != null && cercata == chiave) {
            delay(250)
            // Con un po' di spazio sopra e sotto: senza, il campo arrivava proprio sul bordo basso dello schermo.
            runCatching {
                richiesta.bringIntoView(
                    androidx.compose.ui.geometry.Rect(0f, -margine, grande.width.toFloat(), grande.height + margine),
                )
            }
            acceso = true
            delay(1500)
            acceso = false
            if (Evidenzia.chiave == chiave) Evidenzia.chiave = null
        }
    }
    val giallo = W.colori.gialloTenue
    val fondo by animateColorAsState(if (acceso) giallo else Color.Transparent, label = "evidenzia")
    this.onSizeChanged { grande = it }.bringIntoViewRequester(richiesta).drawBehind {
        if (fondo.alpha > 0f) {
            val bordo = 8.dp.toPx()
            drawRoundRect(
                fondo, topLeft = Offset(-bordo, -bordo / 2), size = Size(size.width + bordo * 2, size.height + bordo),
                cornerRadius = CornerRadius(12.dp.toPx()),
            )
        }
    }
}
