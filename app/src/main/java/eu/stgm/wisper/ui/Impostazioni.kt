package eu.stgm.wisper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import android.security.NetworkSecurityPolicy
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.foundation.clickable
import androidx.compose.ui.text.input.ImeAction
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
import eu.stgm.wisper.Dati
import eu.stgm.wisper.NuoveVersioni
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.CampiStudio
import eu.stgm.wisper.rapportino.CampoImpostazione
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Indirizzi
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Strade
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
 * Amministrazione › Dati dello studio (docs/gestionale/fase1-schermate.md §7):
 * l'intestazione dei PDF e la tua firma, come le Impostazioni di prima. Valgono
 * anche per il computer. Chi vede Amministrazione solo in lettura non cambia niente.
 * Dal 06/11/2026 i campi stanno sulla pagina e si salvano da soli (SalvaDaSolo), nell'ordine
 * di CampiStudio: lo studio, poi l'iscrizione all'albo, il logo, i preventivi, la firma.
 */
@Composable
fun PaginaStudio(dati: Dati, puoCambiare: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val salva = rememberSalvaDaSolo()
    var firmaColDito by remember { mutableStateOf(false) }
    var caricoFirma by remember { mutableStateOf(false) }

    fun caricaFirma(png: ByteArray, onFatto: (String?) -> Unit) {
        caricoFirma = true
        scope.launch {
            val errore = dati.caricaFirmaTecnico(png).fold({ null }, { spiegaErrore(it) })
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

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Dati dello studio")
        TitoloSezione("Lo studio")
        CampiSalvati(salva, CampiStudio.STUDIO, ana, puoCambiare) { k, v -> dati.salvaImpostazioni(mapOf(k to v)) }
        TitoloSezione("Iscrizione all'albo")
        CampiSalvati(salva, CampiStudio.ALBO, ana, puoCambiare) { k, v -> dati.salvaImpostazioni(mapOf(k to v)) }
        // Fase 8 (fase8.md §9.3): il logo, sui PDF sì o no, il nome accanto, e l'anteprima dell'intestazione.
        SchedaLogoStudio(dati, puoCambiare, salva)
        TitoloSezione("Per i preventivi")
        CampiSalvati(
            salva, CampiStudio.PREVENTIVI, ana, puoCambiare,
            conferma = { k -> if (k in listOf("IVA", "EPPI_INTEGRATIVO")) CONFERMA_PERCENTUALI else null },
        ) { k, v -> dati.salvaImpostazioni(mapOf(k to v)) }
        TitoloSezione("La tua firma")
        Scheda(Modifier.evidenziabile("FIRMA_TECNICO"), orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 14.dp) {
            FirmaTecnico(dati, ana.idFirmaTecnico)
            if (puoCambiare) {
                // Uno sotto l'altro: affiancati, su un telefono da 360 i due testi si taglierebbero.
                PulsanteBordo("Rifai la firma", { if (!caricoFirma) firmaColDito = true }, Modifier.fillMaxWidth(), icona = Icone.firma)
                PulsanteBordo(
                    if (caricoFirma && !firmaColDito) "Carico la firma…" else "Da una foto",
                    { if (!caricoFirma) sceltaFoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    Modifier.fillMaxWidth(), icona = Icone.carica,
                )
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
}

/**
 * Amministrazione › Tariffe e rimborsi: rimborso km con l'auto, quanto costa
 * un'ora, il campo ticket. Le tariffe dei clienti stanno sulle loro schede.
 * Dal 06/11/2026 si salvano da soli.
 */
@Composable
fun PaginaTariffe(dati: Dati, puoCambiare: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val salva = rememberSalvaDaSolo()
    val numero = { t: String -> if (t.isNotEmpty() && Numeri.leggi(t) == null) "Non è un numero" else null }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Tariffe e rimborsi")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 14.dp) {
            CampoSalvato(
                salva, Anagrafiche.EURO_KM, preciso(Numeri.leggi(ana.impostazione(Anagrafiche.EURO_KM))), "Rimborso km",
                abilitato = puoCambiare, tastiera = KeyboardType.Decimal, suffisso = "€/km", conferma = CONFERMA_RIMBORSI, controlla = numero,
            ) { dati.salvaImpostazioni(mapOf(Anagrafiche.EURO_KM to it)) }
            CampoSalvato(salva, Anagrafiche.AUTO, ana.impostazione(Anagrafiche.AUTO), "Auto", abilitato = puoCambiare, conferma = CONFERMA_RIMBORSI) {
                dati.salvaImpostazioni(mapOf(Anagrafiche.AUTO to it))
            }
            CampoSalvato(
                salva, Anagrafiche.COSTO_ORARIO, preciso(ana.costoOrario), "Quanto ti costa un'ora",
                abilitato = puoCambiare, tastiera = KeyboardType.Decimal, suffisso = "€/h", conferma = CONFERMA_RIMBORSI, controlla = numero,
            ) { dati.salvaImpostazioni(mapOf(Anagrafiche.COSTO_ORARIO to it)) }
            RigaInterruttoreSalvata(salva, Anagrafiche.TICKET_ATTIVO, "Campo ticket nei rapportini", ana.ticketAttivo, abilitato = puoCambiare) { nuovo ->
                dati.salvaImpostazioni(mapOf(Anagrafiche.TICKET_ATTIVO to if (nuovo) "SI" else "NO"))
            }
        }
    }
}

/**
 * La versione di Wisper su questo telefono, a che punto è l'aggiornamento e il suo pulsante: "Controlla aggiornamenti",
 * oppure "Installa la 1.4.2" (giallo) quando una versione nuova è già scaricata. Sta in cima alla prima pagina delle
 * Impostazioni e ad Aspetto (13/11/2026).
 */
@Composable
fun SchedaVersione(modifier: Modifier = Modifier) {
    val c = W.colori
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val versioni by NuoveVersioni.stato.collectAsStateWithLifecycle()
    val pronta = versioni.pronta != null
    Scheda(modifier.bersaglio("scheda-versione"), orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 12.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Versione ${BuildConfig.VERSION_NAME}", style = Testi.forte, color = c.testo)
            val quando = NuoveVersioni.quandoControllato(versioni.controllato)
            Text(
                when {
                    versioni.inCorso -> if (versioni.messaggio.startsWith("Scarico")) versioni.messaggio + "…" else "Controllo…"
                    pronta -> "La ${versioni.nome} è scaricata: manca solo installarla"
                    versioni.messaggio.startsWith("Hai") -> listOf(versioni.messaggio, quando).filter { it.isNotBlank() }.joinToString(" · ")
                    versioni.messaggio.isNotBlank() -> versioni.messaggio
                    quando.isNotBlank() -> quando.replaceFirstChar { it.uppercase() }
                    else -> "Si aggiorna da sola quando esce una versione nuova"
                },
                style = Testi.secondario, color = c.tenue,
            )
        }
        if (pronta) PulsantePrincipale("Installa la ${versioni.nome}", { NuoveVersioni.installa(ctx, chiesto = true) }, Modifier.bersaglio("installa-versione"), altezza = 52.dp)
        else PulsanteBordo(
            if (versioni.inCorso) "Controllo…" else "Controlla aggiornamenti",
            { if (!versioni.inCorso) scope.launch { NuoveVersioni.controlla(ctx) } },
            Modifier.fillMaxWidth().bersaglio("controlla-aggiornamenti"),
        )
    }
}

/**
 * Amministrazione › Aspetto: la versione col suo pulsante, il tema, la visita guidata e il collegamento col server. È
 * di tutti: si apre anche dal foglio "Tu", per chi non vede Amministrazione.
 */
@Composable
fun PaginaApp(
    archivio: Archivio,
    tema: String,
    onTema: (String) -> Unit,
    onVisita: () -> Unit,
    onIndietro: () -> Unit,
    titolo: String = "L'app",
) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val config = archivio.configurazione
    val ana by archivio.anagrafiche.collectAsStateWithLifecycle()
    val aggiornamento by archivio.aggiornamento.collectAsStateWithLifecycle()
    val dove by archivio.dove.collectAsStateWithLifecycle()
    val versioni by NuoveVersioni.stato.collectAsStateWithLifecycle()
    var modifica by remember { mutableStateOf<Modifica?>(null) }
    var licenza by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina(titolo)
        // 13/11/2026 (Andrea: "non c'è un tasto semplice e veloce nelle impostazioni per controllare se ci sono dei nuovi
        // aggiornamenti"): la versione e il suo pulsante in cima, qui e nella prima pagina delle Impostazioni.
        SchedaVersione()
        Scheda(orizzontale = 20.dp, verticale = 18.dp, raggio = 24.dp, spazio = 10.dp) {
            Text("Tema", style = Testi.forte, color = c.testo)
            Segmenti(listOf("auto" to "Automatico", "chiaro" to "Chiaro", "scuro" to "Scuro"), tema, onTema)
        }
        SchedaElenco {
            RigaVoce("Rifai la visita guidata", sotto = "Da capo, coi dati di esempio", onClick = onVisita)
            LineaElenco()
            RigaVoce("Licenze", sotto = "Caratteri Plus Jakarta Sans e Figtree, SIL OFL 1.1", onClick = { licenza = true })
        }

        TitoloSezione("Il collegamento")
        SchedaElenco {
            val collegato = aggiornamento.errore.isBlank() && aggiornamento.ultimo != null
            Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(if (collegato) c.firmatoTesto else c.moltoTenue))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (collegato) "Collegato" else "Non collegato", style = Testi.forte, color = c.testo)
                    Text(
                        when {
                            aggiornamento.inCorso -> "Leggo…"
                            aggiornamento.errore.isNotBlank() -> aggiornamento.errore
                            aggiornamento.ultimo != null -> "Letto alle " + aggiornamento.ultimo!!.format(DateTimeFormatter.ofPattern("HH:mm")) +
                                // Dove si è (porta-google.md §8.6): le due strade danno le stesse risposte.
                                when (dove) {
                                    Strade.Dove.CASA -> " · in ufficio"
                                    Strade.Dove.GOOGLE -> " · attraverso Google"
                                    null -> ""
                                }
                            else -> ""
                        },
                        style = Testi.secondario, color = c.tenue, maxLines = 2,
                    )
                }
                PulsanteTesto(if (collegato) "Aggiorna" else "Riprova", { archivio.aggiorna() })
            }
            LineaElenco()
            // Le due strade verso lo stesso server: da fuori lo script Google, in casa il NAS.
            RigaVoce("Da fuori", sotto = if (config.google.isBlank()) "Non impostato" else "Google", onClick = {
                modifica = Modifica(
                    "Da fuori, l'indirizzo Google", config.google, locale = "google", righe = 3, tastiera = KeyboardType.Uri,
                    segnaposto = "https://script.google.com/…/exec",
                )
            })
            LineaElenco()
            // Cambiare il server di casa vuol dire entrare di nuovo: il token di un server non vale sull'altro.
            RigaVoce("In casa", sotto = if (config.server.isBlank()) "Non impostato" else Indirizzi.breve(config.server), onClick = {
                modifica = Modifica(
                    "In casa", config.server, locale = "server", righe = 2, tastiera = KeyboardType.Uri,
                    segnaposto = Indirizzi.CASA_DI_BASE,
                )
            })
        }
    }

    modifica?.let { m ->
        FoglioModifica(m, scope, onChiudi = { if (modifica === m) modifica = null }) { valore ->
            when (m.locale) {
                "server" -> Indirizzi.controlla(valore, config.google, ::inChiaro) ?: run {
                    if (valore.trim() != config.server) archivio.cambiaServer(valore)
                    null
                }
                "google" -> Indirizzi.controlla(config.server, valore, ::inChiaro) ?: run {
                    if (valore.trim() != config.google) archivio.cambiaGoogle(valore)
                    null
                }
                else -> null
            }
        }
    }



    if (licenza) {
        val testo = remember {
            listOf("plus-jakarta-sans-OFL.txt" to "Plus Jakarta Sans (le schermate)", "figtree-OFL.txt" to "Figtree (i PDF)").joinToString("\n\n") { (file, nome) ->
                nome + "\n\n" + runCatching { ctx.assets.open("licenze/" + file).bufferedReader().use { it.readText() } }.getOrDefault("")
            }
        }
        AlertDialog(
            onDismissRequest = { licenza = false },
            title = { Text("Licenze dei caratteri", style = Testi.titoloSezione) },
            text = { Text(testo, style = Testi.piccolo, modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) },
            confirmButton = { TextButton(onClick = { licenza = false }) { Text("Chiudi", color = c.testo) } },
        )
    }
}

/** La conferma del computer: il rimborso di un rapportino si fissa quando nasce (detta una volta per pagina). */
private const val CONFERMA_RIMBORSI = "Vale per i rapportini nuovi: quelli già scritti tengono il rimborso con cui sono nati"

/** Come sopra, per le percentuali dei preventivi. */
private const val CONFERMA_PERCENTUALI = "Vale per i preventivi nuovi: quelli già scritti tengono la percentuale con cui sono nati"

/** La tastiera di un campo di CampiStudio. */
internal fun tastieraDi(tipo: String): KeyboardType = when (tipo) {
    "cifre" -> KeyboardType.Number
    "decimale" -> KeyboardType.Decimal
    "email" -> KeyboardType.Email
    "telefono" -> KeyboardType.Phone
    "sito" -> KeyboardType.Uri
    else -> KeyboardType.Text
}

/**
 * I campi di una scheda di Dati dello studio, che si salvano da soli: il codice SDI in maiuscolo e da 7 lettere o
 * cifre, i numeri (IVA, EPPI, giorni) come numeri. Chi non può cambiare li legge.
 */
@Composable
private fun CampiSalvati(
    salva: SalvaDaSolo,
    campi: List<CampoImpostazione>,
    ana: Anagrafiche,
    puo: Boolean,
    conferma: (String) -> String? = { null },
    onSalva: suspend (String, String) -> Result<*>,
) {
    if (!puo) {
        SchedaElenco {
            campi.forEachIndexed { i, v ->
                if (i > 0) LineaElenco()
                val valore = ana.impostazione(v.chiave)
                RigaVoce(
                    v.titolo, Modifier.evidenziabile(v.chiave),
                    sotto = valore.ifBlank { "—" }.let { if (v.suffisso != null && valore.isNotBlank()) "$it ${v.suffisso}" else it }, freccia = false,
                )
            }
        }
        return
    }
    Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 14.dp) {
        campi.forEach { v ->
            val numero = v.chiave in Anagrafiche.IMPOSTAZIONI_NUMERICHE
            val sdi = v.chiave == CampiStudio.STUDIO_SDI
            val valore = ana.impostazione(v.chiave).let { t -> if (numero) Numeri.leggi(t)?.let { preciso(it) } ?: t else t }
            CampoSalvato(
                salva, v.chiave, valore, v.titolo,
                tastiera = tastieraDi(v.tipo), righe = v.righe, suffisso = v.suffisso, conferma = conferma(v.chiave),
                cambia = if (sdi) CampiStudio::sdi else { t -> t },
                controlla = { t ->
                    when {
                        sdi -> CampiStudio.erroreSdi(t)
                        numero && t.isNotEmpty() && Numeri.leggi(t) == null -> "Non è un numero"
                        else -> null
                    }
                },
            ) { t -> onSalva(v.chiave, t) }
        }
    }
}

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
    e.message?.takeIf { it.isNotBlank() } ?: "Il server non risponde: controlla la rete e riprova."

// ---------------------------------------------------------------------------------- la firma del tecnico

/**
 * La firma che va sui rapportini, presa dal foglio. Su un riquadro bianco anche
 * nel tema scuro: è un'immagine scura su bianco, come sul PDF.
 */
@Composable
private fun FirmaTecnico(dati: Dati, idFirma: String) {
    val c = W.colori
    val immagine by produceState<Pair<String, ImageBitmap?>?>(null, idFirma) {
        if (idFirma.isBlank()) return@produceState
        val bmp = runCatching { dati.file(idFirma) }.getOrNull()?.let { (byte, _) ->
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

/**
 * La schermata di accesso (docs/gestionale/fase1-schermate.md §2): il simbolo,
 * "Entra in Wisper", email e password con l'occhio, Entra. Sotto, in una riga, le
 * due strade ("Da fuori: Google · In casa: 192.168.1.51 · Cambia"); i due
 * indirizzi si scrivono solo se mancano tutti e due, o se si tocca Cambia. Gli
 * errori del server in un riquadro rosso tenue sopra i campi; la rete che manca
 * in grigio, mai in rosso. L'email resta scritta.
 */
@Composable
fun SchermataAccesso(archivio: Archivio, onEntrato: () -> Unit) {
    val c = W.colori
    val config = archivio.configurazione
    val scope = rememberCoroutineScope()
    val sessione by archivio.sessione.collectAsStateWithLifecycle()
    var server by remember { mutableStateOf(config.server) }
    var google by remember { mutableStateOf(config.google) }
    var cambiaServer by remember { mutableStateOf(config.server.isBlank() && config.google.isBlank()) }
    var email by remember { mutableStateOf(config.ultimaEmail) }
    var password by remember { mutableStateOf("") }
    // Il testo dell'errore e se è un no del server (rosso) o la rete (grigio).
    var errore by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var entro by remember { mutableStateOf(false) }
    val fuocoPassword = remember { FocusRequester() }

    fun entra() {
        if (entro) return
        val indirizzi = Indirizzi.controlla(server, google, ::inChiaro)
        when {
            indirizzi != null -> { errore = indirizzi to true; cambiaServer = true; return }
            email.isBlank() || password.isBlank() -> { errore = "Scrivi email e password." to true; return }
        }
        entro = true
        errore = null
        scope.launch {
            archivio.entra(email, password, server, google).fold(
                onSuccess = { password = ""; onEntrato() },
                onFailure = { e ->
                    errore = when (e) {
                        is PonteServer.Rifiutato -> frase(e.message.orEmpty().ifBlank { "Il server ha detto di no" }) to true
                        // La porta Google: "Il server dello studio non risponde dalle 10:42: riprova più tardi".
                        is PonteServer.ServizioNonRaggiunto -> frase(e.message.orEmpty().ifBlank { "Il server dello studio non risponde: riprova più tardi" }) to false
                        else -> "Il server non risponde: controlla la rete e riprova." to false
                    }
                },
            )
            entro = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 70.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Simbolo(dimensione = 64.dp) }
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Entra in Wisper", style = Testi.titoloPagina, color = c.testo, textAlign = TextAlign.Center)
                if (config.ragioneSociale.isNotBlank()) Text(config.ragioneSociale, style = Testi.secondarioGrande, color = c.tenue, textAlign = TextAlign.Center)
            }
            val avviso = errore ?: if (sessione.scaduta) "Sei uscito da questo dispositivo: entra di nuovo." to false else null
            avviso?.let { (testo, grave) ->
                Text(
                    testo, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = if (grave) c.rossoTesto else c.testo2,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (grave) c.rossoTenue else c.superficie2)
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                )
            }
            if (cambiaServer) {
                CampoTesto(
                    server, { server = it.trim() }, "In casa", Modifier.fillMaxWidth(),
                    segnaposto = Indirizzi.CASA_DI_BASE, tastiera = KeyboardType.Uri, azione = ImeAction.Next,
                )
                CampoTesto(
                    google, { google = it.trim() }, "Da fuori, l'indirizzo Google", Modifier.fillMaxWidth(),
                    segnaposto = "https://script.google.com/…/exec", tastiera = KeyboardType.Uri, azione = ImeAction.Next,
                )
                // Con Google l'accesso passa sempre da lì (§14bis). Se Google non funziona, in casa si può
                // entrare dal server di casa: la password viaggia sulla rete di casa senza cifratura.
                if (google.isNotBlank()) PulsanteTesto("Non usare Google", { google = "" }, Modifier.fillMaxWidth().heightIn(min = 48.dp), colore = c.testo)
            }
            CampoTesto(
                email, { email = it.trim() }, "Email", Modifier.fillMaxWidth(), tastiera = KeyboardType.Email,
                azione = ImeAction.Next, onAzione = { runCatching { fuocoPassword.requestFocus() } },
            )
            CampoPassword(
                password, { password = it }, "Password", Modifier.fillMaxWidth().focusRequester(fuocoPassword),
                azione = ImeAction.Done, onAzione = { entra() },
            )
            PulsantePrincipale(if (entro) "Entro…" else "Entra", { entra() }, abilitato = !entro)
            if (!cambiaServer) {
                Box(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable { cambiaServer = true }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        buildAnnotatedString {
                            append(Indirizzi.descrivi(server, google))
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = c.collegamento)) { append(" · Cambia") }
                        },
                        style = Testi.piccolo, color = c.tenue, textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

/**
 * Il telefono può parlare in HTTP senza la S con [host]? Lo decide la configurazione
 * di rete (res/xml): solo il server di casa, e il computer visto dall'emulatore nelle build di prova.
 */
private fun inChiaro(host: String): Boolean = NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted(host)

/** Le frasi del server con il punto in fondo, come le scrive la guida ("Email o password sbagliate."). */
private fun frase(t: String): String = t.trim().let { if (it.endsWith(".") || it.endsWith(":")) it else "$it." }
