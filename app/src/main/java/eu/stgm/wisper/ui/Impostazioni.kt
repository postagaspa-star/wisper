package eu.stgm.wisper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Archivio
import eu.stgm.wisper.BuildConfig
import eu.stgm.wisper.NuoveVersioni
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.PonteFoglio
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max

/**
 * Le impostazioni (docs/aspetto.md §7, prototipo SCHERMI.impostazioni): schede a
 * gruppi, ogni voce col suo valore; si cambia in un foglio dal basso. Ci sono le
 * stesse cose della pagina Impostazioni di Wisper Ufficio (pc/ui/app.js): lo
 * studio, la firma, i rimborsi. Quelle del foglio si scrivono sul foglio, quindi
 * valgono anche per il computer; nome, indirizzo e codice restano su questo telefono.
 * Le tariffe non stanno più qui: sono sulle pagine dei clienti.
 */
@Composable
fun SchermataImpostazioni(
    archivio: Archivio,
    tema: String,
    onTema: (String) -> Unit,
    onVisita: () -> Unit,
    onChiudi: () -> Unit,
) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val config = archivio.configurazione
    val ana by archivio.anagrafiche.collectAsStateWithLifecycle()
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    val versioni by NuoveVersioni.stato.collectAsStateWithLifecycle()
    var modifica by remember { mutableStateOf<Modifica?>(null) }
    // "Collega il computer": prima si chiede, poi si dice com'è andata.
    var collegaPc by remember { mutableStateOf<String?>(null) }
    var licenza by remember { mutableStateOf(false) }
    var firmaColDito by remember { mutableStateOf(false) }
    var caricoFirma by remember { mutableStateOf(false) }
    // L'interruttore si sposta subito; se il foglio non risponde torna com'era.
    var ticket by remember { mutableStateOf<Boolean?>(null) }
    val ticketAcceso = ticket ?: ana.ticketAttivo
    LaunchedEffect(ana.ticketAttivo) { if (ticket == ana.ticketAttivo) ticket = null }

    BackHandler { onChiudi() }

    /** Una voce del foglio: si scrive sul foglio e si dice com'è andata. Torna l'errore da mostrare, o null. */
    suspend fun salvaSulFoglio(chiave: String, valore: String, conferma: String): String? =
        archivio.salvaImpostazioni(mapOf(chiave to valore)).fold(
            onSuccess = { avvisi.mostra(conferma); null },
            onFailure = { spiegaErrore(it) },
        )

    fun caricaFirma(png: ByteArray, onFatto: (String?) -> Unit) {
        caricoFirma = true
        scope.launch {
            val errore = archivio.caricaFirmaTecnico(png).fold({ null }, { spiegaErrore(it) })
            caricoFirma = false
            if (errore == null) avvisi.mostra("Firma caricata")
            onFatto(errore)
        }
    }

    val sceltaFoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        caricoFirma = true
        scope.launch {
            val png = runCatching { withContext(Dispatchers.Default) { firmaDaFoto(ctx, uri) } }.getOrNull()
            if (png == null) {
                caricoFirma = false
                avvisi.mostra("Non riesco a leggere la foto: provane un'altra")
            } else {
                caricaFirma(png) { errore -> if (errore != null) avvisi.mostra(errore) }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onChiudi)
            TitoloPagina("Impostazioni")

            // ---- su questo telefono
            TitoloSezione("Tu")
            SchedaElenco {
                RigaVoce("Nome di chi compila", sotto = config.tecnico.ifBlank { ana.tecnico.ifBlank { "—" } }, onClick = {
                    modifica = Modifica("Nome di chi compila", config.tecnico, locale = "tecnico", segnaposto = ana.tecnico)
                })
            }

            TitoloSezione("Il foglio")
            SchedaElenco {
                val collegato = aggiornamento.errore.isBlank() && aggiornamento.ultimo != null
                Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(if (collegato) c.firmatoTesto else c.rossoPieno))
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (collegato) "Collegato" else "Non collegato", style = Testi.forte, color = c.testo)
                        Text(
                            when {
                                aggiornamento.inCorso -> "Leggo il foglio…"
                                aggiornamento.errore.isNotBlank() -> aggiornamento.errore
                                aggiornamento.ultimo != null -> "Letto alle " + aggiornamento.ultimo!!.format(DateTimeFormatter.ofPattern("HH:mm"))
                                else -> ""
                            },
                            style = Testi.secondario, color = c.tenue, maxLines = 2,
                        )
                    }
                    PulsanteTesto(if (collegato) "Aggiorna" else "Riprova", { archivio.aggiorna() })
                }
                LineaElenco()
                RigaVoce("Indirizzo", sotto = config.url.ifBlank { "—" }, onClick = {
                    modifica = Modifica("Indirizzo del foglio", config.url, locale = "url", righe = 3, tastiera = KeyboardType.Uri)
                })
                LineaElenco()
                RigaVoce("Codice", sotto = if (config.codice.isBlank()) "—" else "••••••" + config.codice.takeLast(4), onClick = {
                    modifica = Modifica("Codice", "", locale = "codice", tastiera = KeyboardType.Password)
                })
                LineaElenco()
                RigaVoce("Collega il computer", sotto = "Un'email con il file da aprire sul PC", onClick = { collegaPc = "chiedi" })
            }

            // ---- sul foglio: valgono anche per Wisper Ufficio
            TitoloSezione("Lo studio")
            SchedaElenco {
                VOCI_STUDIO.forEachIndexed { i, v ->
                    if (i > 0) LineaElenco()
                    RigaVoce(v.titolo, sotto = ana.impostazione(v.chiave).ifBlank { "—" }, onClick = {
                        modifica = Modifica(v.titolo, ana.impostazione(v.chiave), chiave = v.chiave, tastiera = v.tastiera)
                    })
                }
            }

            TitoloSezione("La tua firma")
            Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 14.dp) {
                FirmaTecnico(archivio, ana.idFirmaTecnico)
                // Uno sotto l'altro: affiancati, su un telefono da 360 i due testi si taglierebbero.
                PulsanteBordo("Rifai la firma", { if (!caricoFirma) firmaColDito = true }, Modifier.fillMaxWidth(), icona = Icone.firma)
                PulsanteBordo(
                    if (caricoFirma && !firmaColDito) "Carico la firma…" else "Da una foto",
                    { if (!caricoFirma) sceltaFoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    Modifier.fillMaxWidth(), icona = Icone.carica,
                )
            }

            TitoloSezione("Rimborso km e costi")
            SchedaElenco {
                val euroKm = ana.impostazione(Anagrafiche.EURO_KM)
                RigaVoce("Rimborso km", sotto = Numeri.leggi(euroKm)?.let { "${Numeri.scrivi(it)} €/km · tabella ACI" } ?: "—", onClick = {
                    modifica = Modifica(
                        "Rimborso km", preciso(Numeri.leggi(euroKm)), chiave = Anagrafiche.EURO_KM,
                        tastiera = KeyboardType.Decimal, suffisso = "€/km", conferma = CONFERMA_RIMBORSI,
                    )
                })
                LineaElenco()
                RigaVoce("Auto", sotto = ana.impostazione(Anagrafiche.AUTO).ifBlank { "—" }, onClick = {
                    modifica = Modifica("Auto", ana.impostazione(Anagrafiche.AUTO), chiave = Anagrafiche.AUTO, conferma = CONFERMA_RIMBORSI)
                })
                LineaElenco()
                val costo = ana.costoOrario
                RigaVoce("Quanto ti costa un'ora", sotto = costo?.let { "${Numeri.scrivi(it)} €/h" } ?: "—", onClick = {
                    modifica = Modifica(
                        "Quanto ti costa un'ora", preciso(costo), chiave = Anagrafiche.COSTO_ORARIO,
                        tastiera = KeyboardType.Decimal, suffisso = "€/h", conferma = CONFERMA_RIMBORSI,
                    )
                })
                LineaElenco()
                Box(Modifier.padding(vertical = 4.dp)) {
                    RigaInterruttore("Campo ticket nei rapportini", ticketAcceso) { nuovo ->
                        ticket = nuovo
                        scope.launch {
                            val errore = salvaSulFoglio(Anagrafiche.TICKET_ATTIVO, if (nuovo) "SI" else "NO", "Salvato")
                            if (errore != null) {
                                ticket = null
                                avvisi.mostra(errore)
                            }
                        }
                    }
                }
            }

            // ---- l'app
            TitoloSezione("L'app")
            Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 10.dp) {
                Text("Tema", style = Testi.forte, color = c.testo)
                Segmenti(listOf("auto" to "Automatico", "chiaro" to "Chiaro", "scuro" to "Scuro"), tema, onTema)
            }
            SchedaElenco {
                RigaVoce("Rifai la visita guidata", sotto = "Da capo, coi dati di esempio", onClick = onVisita)
                LineaElenco()
                // Si aggiorna da sola ogni ora; qui si vede a che punto è e si può controllare subito.
                RigaVoce(
                    "Versione ${BuildConfig.VERSION_NAME}",
                    sotto = when {
                        versioni.inCorso -> "Controllo…"
                        versioni.pronta != null -> "La ${versioni.nome} è pronta"
                        versioni.messaggio.isNotBlank() -> versioni.messaggio
                        else -> "Si aggiorna da sola"
                    },
                    fine = {
                        if (versioni.pronta != null) PulsanteTesto("Installa", { NuoveVersioni.installa(ctx, chiesto = true) })
                        else if (!versioni.inCorso) PulsanteTesto("Controlla", { scope.launch { NuoveVersioni.controlla(ctx) } })
                    },
                    freccia = false,
                )
                LineaElenco()
                RigaVoce("Licenze", sotto = "Carattere Figtree, SIL OFL 1.1", onClick = { licenza = true })
            }
        }
    }

    modifica?.let { m ->
        FoglioModifica(m, scope, onChiudi = { if (modifica === m) modifica = null }) { valore ->
            when (m.locale) {
                "tecnico" -> { config.tecnico = valore; avvisi.mostra("Salvato"); null }
                "url" -> { config.url = valore; archivio.aggiorna(); null }
                "codice" -> { if (valore.isNotBlank()) { config.codice = valore; archivio.aggiorna() }; null }
                else -> salvaSulFoglio(m.chiave!!, valore, m.conferma)
            }
        }
    }

    if (firmaColDito) {
        FoglioFirma(
            caricando = caricoFirma,
            // Chiuso mentre carica: il caricamento finisce lo stesso, e com'è andata lo dice un avviso.
            onChiudi = { firmaColDito = false },
            onSalva = { png, onErrore ->
                caricaFirma(png) { errore ->
                    when {
                        errore == null -> firmaColDito = false
                        firmaColDito -> onErrore(errore)
                        else -> avvisi.mostra(errore)
                    }
                }
            },
        )
    }

    collegaPc?.let { fase ->
        FoglioDalBasso(onChiudi = { collegaPc = null }) {
            Text(
                when {
                    fase == "chiedi" || fase == "mando" -> "Collega il computer"
                    fase.startsWith("ok:") -> "Email mandata"
                    else -> "Non è partita"
                },
                style = Testi.titoloScheda, color = c.testo,
            )
            Text(
                when {
                    fase == "chiedi" -> "Ti mando un'email con un file. Sul computer dell'ufficio aprilo con un doppio clic: Wisper Ufficio si collega da solo, senza scrivere indirizzo e codice."
                    fase == "mando" -> "Mando l'email…"
                    fase.startsWith("ok:") -> "L'email è andata a ${fase.removePrefix("ok:")}. Aprila sul computer, poi cancellala: dentro c'è il codice."
                    else -> fase.removePrefix("errore:")
                },
                style = Testi.testo, color = c.testo2,
            )
            when (fase) {
                "chiedi" -> {
                    PulsantePrincipale("Manda", {
                        collegaPc = "mando"
                        scope.launch {
                            val esito = archivio.collegaComputer()
                            val errore = esito.exceptionOrNull()?.let { e ->
                                if (e is PonteFoglio.RifiutatoDalFoglio) e.message.orEmpty()
                                else "Senza rete l'email non parte: riprova quando c'è."
                            }
                            // Se il foglio dal basso è stato chiuso intanto, com'è andata lo dice un avviso.
                            if (collegaPc == "mando") collegaPc = if (errore == null) "ok:" + esito.getOrNull() else "errore:$errore"
                            else avvisi.mostra(errore ?: "Email mandata a ${esito.getOrNull()}")
                        }
                    }, icona = Icone.invia)
                    PulsanteTesto("Annulla", { collegaPc = null }, Modifier.fillMaxWidth(), colore = c.testo)
                }
                "mando" -> PulsantePrincipale("Mando…", {}, abilitato = false)
                else -> PulsantePrincipale("Chiudi", { collegaPc = null })
            }
        }
    }

    if (licenza) {
        val testo = remember { runCatching { ctx.assets.open("licenze/figtree-OFL.txt").bufferedReader().use { it.readText() } }.getOrDefault("") }
        AlertDialog(
            onDismissRequest = { licenza = false },
            title = { Text("Figtree", style = Testi.titoloSezione) },
            text = { Text(testo, style = Testi.piccolo, modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) },
            confirmButton = { TextButton(onClick = { licenza = false }) { Text("Chiudi", color = c.testo) } },
        )
    }
}

/** La conferma del computer: il rimborso di un rapportino si fissa quando nasce. */
private const val CONFERMA_RIMBORSI = "Salvato. Vale per i rapportini nuovi: quelli già scritti tengono il rimborso con cui sono nati"

/** Una voce dei dati dello studio, come le chiama il computer. */
private class VoceStudio(val titolo: String, val chiave: String, val tastiera: KeyboardType = KeyboardType.Text)

private val VOCI_STUDIO = listOf(
    VoceStudio("Ragione sociale", Anagrafiche.RAGIONE_SOCIALE),
    VoceStudio("Chi compila", Anagrafiche.TECNICO),
    VoceStudio("Indirizzo", Anagrafiche.INDIRIZZO),
    VoceStudio("Partita IVA", Anagrafiche.PARTITA_IVA, KeyboardType.Number),
    VoceStudio("Email per le risposte", Anagrafiche.EMAIL, KeyboardType.Email),
    VoceStudio("Telefono", Anagrafiche.TELEFONO, KeyboardType.Phone),
    VoceStudio("PEC", Anagrafiche.PEC, KeyboardType.Email),
)

/**
 * Quello che si sta cambiando. [locale] = una voce di questo telefono ("tecnico",
 * "url", "codice"); altrimenti [chiave] è la chiave della scheda Impostazioni.
 */
private class Modifica(
    val titolo: String,
    val valore: String,
    val chiave: String? = null,
    val locale: String? = null,
    val tastiera: KeyboardType = KeyboardType.Text,
    val suffisso: String? = null,
    val righe: Int = 1,
    val segnaposto: String = "",
    val conferma: String = "Salvato",
) {
    val numero: Boolean get() = chiave != null && chiave in Anagrafiche.IMPOSTAZIONI_NUMERICHE
}

/**
 * Il foglio dal basso con un campo e Salva. [onSalva] torna l'errore da mostrare
 * sotto il campo, o null se è andata. Il salvataggio gira su [scope], quello della
 * pagina: se il foglio dal basso si chiude prima della risposta, il salvataggio
 * finisce lo stesso e un errore arriva come avviso.
 */
@Composable
private fun FoglioModifica(m: Modifica, scope: CoroutineScope, onChiudi: () -> Unit, onSalva: suspend (String) -> String?) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var valore by remember(m) { mutableStateOf(m.valore) }
    var errore by remember(m) { mutableStateOf<String?>(null) }
    var salvo by remember(m) { mutableStateOf(false) }
    val chiuso = remember(m) { booleanArrayOf(false) }
    val fuoco = remember { FocusRequester() }
    // Il campo è già pronto per scrivere: si apre il foglio per cambiare quel valore.
    LaunchedEffect(m) {
        delay(250)
        runCatching { fuoco.requestFocus() }
    }

    fun chiudi() {
        if (chiuso[0]) return
        chiuso[0] = true
        onChiudi()
    }

    fun salva() {
        if (salvo) return
        // Il numero com'è scritto ("0,7634"): lo converte Dati, che lo manda al foglio come numero.
        val v = valore.trim()
        if (m.numero && v.isNotEmpty() && Numeri.leggi(v) == null) {
            errore = "Non è un numero"
            return
        }
        salvo = true
        errore = null
        scope.launch {
            val e = onSalva(v)
            salvo = false
            when {
                e == null -> chiudi()
                chiuso[0] -> avvisi.mostra(e)
                else -> errore = e
            }
        }
    }

    FoglioDalBasso(onChiudi = { chiudi() }) {
        Text(m.titolo, style = Testi.titoloScheda, color = c.testo)
        CampoTesto(
            valore, { valore = it; errore = null }, null, Modifier.fillMaxWidth().focusRequester(fuoco),
            segnaposto = m.segnaposto, errore = errore, righe = m.righe, tastiera = m.tastiera, suffisso = m.suffisso,
        )
        PulsantePrincipale(if (salvo) "Salvo…" else "Salva", { salva() }, altezza = 52.dp, abilitato = !salvo)
        PulsanteTesto("Annulla", { chiudi() }, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/**
 * Il valore da cambiare con tutte le sue cifre: la tabella ACI ha i millesimi
 * (0,7634), e salvare senza toccare niente non deve arrotondarlo a 0,76.
 */
private fun preciso(n: Double?): String =
    if (n == null) "" else DecimalFormat("0.######", DecimalFormatSymbols(Locale.ITALY)).format(n)

/** Cosa è successo e cosa fare: Dati lo dice già in italiano; una frase di riserva se manca. */
private fun spiegaErrore(e: Throwable): String =
    e.message?.takeIf { it.isNotBlank() } ?: "Il foglio non risponde: controlla la rete e riprova."

// ---------------------------------------------------------------------------------- la firma del tecnico

/**
 * La firma che va sui rapportini, presa dal foglio. Su un riquadro bianco anche
 * nel tema scuro: è un'immagine scura su bianco, come sul PDF.
 */
@Composable
private fun FirmaTecnico(archivio: Archivio, idFirma: String) {
    val c = W.colori
    val immagine by produceState<Pair<String, ImageBitmap?>?>(null, idFirma) {
        if (idFirma.isBlank()) return@produceState
        val bmp = runCatching { archivio.file(idFirma) }.getOrNull()?.let { (byte, _) ->
            withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(byte, 0, byte.size)?.asImageBitmap() }
        }
        value = idFirma to bmp
    }
    if (idFirma.isBlank()) {
        Text("Non ancora caricata: sui rapportini resta lo spazio vuoto", style = Testi.testo, color = c.tenue)
        return
    }
    Box(
        Modifier.fillMaxWidth().height(96.dp).clip(RoundedCornerShape(14.dp)).background(Color.White)
            .border(1.dp, c.bordoScheda, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        val img = immagine?.takeIf { it.first == idFirma }
        when {
            img == null -> Text("Carico la firma…", style = Testi.secondario, color = Chiaro.tenue)
            img.second == null -> Text("Non riesco a mostrarla adesso: riprova quando c'è rete", style = Testi.secondario, color = Chiaro.tenue)
            else -> Image(img.second!!, "La tua firma", Modifier.fillMaxSize(), contentScale = ContentScale.Fit, alignment = Alignment.CenterStart)
        }
    }
}

/**
 * Rifare la firma col dito, come quella del cliente (ui/Firma.kt): il dito si
 * segue da quando tocca, e l'immagine si ritaglia attorno ai tratti.
 */
@Composable
private fun FoglioFirma(caricando: Boolean, onChiudi: () -> Unit, onSalva: (ByteArray, (String) -> Unit) -> Unit) {
    val c = W.colori
    val tratti = remember { mutableStateListOf<List<Offset>>() }
    var tratto by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var dimensione by remember { mutableStateOf(IntSize.Zero) }
    var errore by remember { mutableStateOf<String?>(null) }
    val spessore = with(LocalDensity.current) { 3.dp.toPx() }
    val pronta = tratti.isNotEmpty() && dimensione != IntSize.Zero

    FoglioDalBasso(onChiudi) {
        Text("La tua firma", style = Testi.titoloScheda, color = c.testo)
        Box(
            Modifier.fillMaxWidth().height(240.dp).clip(RoundedCornerShape(22.dp)).background(Color.White)
                .border(1.5.dp, c.bordoCampo, RoundedCornerShape(22.dp))
                .onSizeChanged { dimensione = it }
                .pointerInput(Unit) {
                    awaitEachGesture {
                        // Consumato anche il primo tocco: il foglio dal basso non deve scendere mentre si firma.
                        val giu = awaitFirstDown()
                        giu.consume()
                        var punti = listOf(giu.position)
                        tratto = punti
                        while (true) {
                            val dito = awaitPointerEvent().changes.firstOrNull { it.id == giu.id } ?: break
                            if (!dito.pressed) break
                            punti = punti + dito.position
                            tratto = punti
                            dito.consume()
                        }
                        // Un tocco solo è un punto: le "i" della firma.
                        tratti.add(if (punti.size == 1) listOf(punti[0], punti[0] + Offset(0.5f, 0.5f)) else punti)
                        tratto = emptyList()
                        errore = null
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
            Box(Modifier.align(Alignment.BottomCenter).padding(start = 24.dp, end = 24.dp, bottom = 48.dp).fillMaxWidth().height(1.5.dp).background(Chiaro.superficie2))
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PulsanteBordo("Cancella", { if (!caricando) tratti.clear() }, Modifier.weight(1f), altezza = 64.dp)
            PulsantePrincipale(
                if (caricando) "Carico…" else "Salva la firma",
                {
                    if (pronta && !caricando) {
                        errore = null
                        onSalva(pngDaTratti(tratti, dimensione, spessore)) { errore = it }
                    }
                },
                Modifier.weight(1.6f), icona = Icone.spunta, abilitato = pronta && !caricando,
            )
        }
    }
}

/** I tratti come PNG: scuri su bianco, ritagliati attorno alla firma (come in ui/Firma.kt). */
private fun pngDaTratti(tratti: List<List<Offset>>, dimensione: IntSize, spessore: Float): ByteArray {
    val punti = tratti.flatten()
    val margine = spessore * 4
    val sinistra = ((punti.minOfOrNull { it.x } ?: 0f) - margine).coerceAtLeast(0f)
    val alto = ((punti.minOfOrNull { it.y } ?: 0f) - margine).coerceAtLeast(0f)
    val destra = ((punti.maxOfOrNull { it.x } ?: dimensione.width.toFloat()) + margine).coerceAtMost(dimensione.width.toFloat())
    val basso = ((punti.maxOfOrNull { it.y } ?: dimensione.height.toFloat()) + margine).coerceAtMost(dimensione.height.toFloat())
    val bmp = Bitmap.createBitmap((destra - sinistra).toInt().coerceAtLeast(1), (basso - alto).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
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
    tratti.filter { it.size >= 2 }.forEach { t ->
        val p = android.graphics.Path().apply {
            moveTo(t.first().x, t.first().y)
            t.drop(1).forEach { lineTo(it.x, it.y) }
        }
        tela.drawPath(p, pennello)
    }
    return png(bmp).also { bmp.recycle() }
}

private fun png(bmp: Bitmap): ByteArray = ByteArrayOutputStream().use { out ->
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    out.toByteArray()
}

/**
 * La firma fotografata su carta, pronta per il PDF: dritta, ridotta, con la carta
 * resa bianca e ritagliata attorno all'inchiostro. Così non arriva sul rapportino
 * la foto di mezzo foglio grigio con un segnetto in mezzo.
 */
private fun firmaDaFoto(ctx: Context, sorgente: Uri): ByteArray {
    val lato = 1200
    val limiti = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(sorgente)?.use { BitmapFactory.decodeStream(it, null, limiti) }
    val grande = max(limiti.outWidth, limiti.outHeight)
    require(grande > 0) { "foto illeggibile" }
    var campione = 1
    while (grande / (campione * 2) >= lato) campione *= 2
    val letta = ctx.contentResolver.openInputStream(sorgente)?.use {
        BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = campione })
    } ?: error("foto illeggibile")
    // Le foto fatte in verticale arrivano coricate, con l'orientamento scritto a parte.
    val gradi = runCatching {
        ctx.contentResolver.openInputStream(sorgente)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        }
    }.getOrNull() ?: 0f
    val scala = lato.toFloat() / max(letta.width, letta.height)
    val m = Matrix().apply {
        if (scala < 1f) postScale(scala, scala)
        if (gradi != 0f) postRotate(gradi)
    }
    val bmp = (if (m.isIdentity) letta else Bitmap.createBitmap(letta, 0, 0, letta.width, letta.height, m, true))
        .copy(Bitmap.Config.ARGB_8888, true)
    letta.recycle()

    val w = bmp.width
    val h = bmp.height
    val px = IntArray(w * h)
    bmp.getPixels(px, 0, w, 0, 0, w, h)
    // La soglia viene dalla luce della foto: la carta è quasi tutto, l'inchiostro è molto più scuro.
    fun luce(p: Int): Int =
        if ((p ushr 24) < 128) 255 else (((p shr 16) and 0xFF) * 299 + ((p shr 8) and 0xFF) * 587 + (p and 0xFF) * 114) / 1000
    val media = px.sumOf { luce(it).toLong() } / px.size.coerceAtLeast(1)
    val soglia = (media * 0.72).toInt()
    var x0 = w
    var y0 = h
    var x1 = -1
    var y1 = -1
    for (i in px.indices) {
        val l = luce(px[i])
        if (l >= soglia) {
            px[i] = android.graphics.Color.WHITE
        } else {
            // L'inchiostro un po' più scuro, così si legge anche se la penna era chiara.
            val g = (l * 0.6).toInt()
            px[i] = android.graphics.Color.rgb(g, g, g)
            val x = i % w
            val y = i / w
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
        }
    }
    bmp.setPixels(px, 0, w, 0, 0, w, h)
    val margine = 16
    val ritagliata = if (x1 > x0 && y1 > y0) {
        val l = (x0 - margine).coerceAtLeast(0)
        val t = (y0 - margine).coerceAtLeast(0)
        Bitmap.createBitmap(bmp, l, t, ((x1 + margine).coerceAtMost(w - 1) - l + 1), ((y1 + margine).coerceAtMost(h - 1) - t + 1))
    } else bmp
    return png(ritagliata).also {
        if (ritagliata !== bmp) ritagliata.recycle()
        bmp.recycle()
    }
}

/** Il primo avvio: collegare l'app al foglio, con due campi grandi e un pulsante. */
@Composable
fun SchermataCollega(archivio: Archivio, onCollegato: () -> Unit) {
    val c = W.colori
    val config = archivio.configurazione
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    var url by remember { mutableStateOf(config.url) }
    var codice by remember { mutableStateOf(config.codice) }
    var provato by remember { mutableStateOf(false) }

    if (provato && !aggiornamento.inCorso && aggiornamento.errore.isBlank() && aggiornamento.ultimo != null) {
        LaunchedEffect(Unit) { onCollegato() }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 64.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Simbolo(dimensione = 72.dp)
            Text("Collega Wisper al tuo foglio", style = Testi.titoloPagina, color = c.testo, textAlign = TextAlign.Center)
            CampoTesto(url, { url = it }, "Indirizzo", Modifier.fillMaxWidth(), segnaposto = "https://script.google.com/…", righe = 2)
            CampoTesto(codice, { codice = it }, "Codice", Modifier.fillMaxWidth())
            if (provato && aggiornamento.errore.isNotBlank()) {
                Text(aggiornamento.errore, style = Testi.secondario, color = c.rossoTesto, modifier = Modifier.fillMaxWidth())
            }
        }
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(20.dp)) {
            PulsantePrincipale(
                if (provato && aggiornamento.inCorso) "Collego…" else "Collega",
                {
                    config.url = url
                    config.codice = codice
                    provato = true
                    archivio.aggiorna()
                },
                abilitato = url.isNotBlank() && codice.isNotBlank(),
            )
        }
    }
}
