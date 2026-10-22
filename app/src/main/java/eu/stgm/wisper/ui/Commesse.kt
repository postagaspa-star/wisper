package eu.stgm.wisper.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Vista
import eu.stgm.wisper.conConti
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Cliente
import eu.stgm.wisper.rapportino.Commessa
import eu.stgm.wisper.rapportino.Conti
import eu.stgm.wisper.rapportino.Conti.Cruscotto
import eu.stgm.wisper.rapportino.Conti.Livello
import eu.stgm.wisper.rapportino.DocumentiCommessa
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Prestazione
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Rapportino
import eu.stgm.wisper.rapportino.Stato
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

/*
 * Le commesse (docs/telefono-ufficio.md, prototipo docs/prototipo/TelefonoUfficio.html):
 * l'elenco, la pagina con le cinque schede e il modulo. I conti sono quelli di
 * Wisper Ufficio (pc/ui/conti.js, portati in rapportino/Conti.kt): qui si mostrano soltanto.
 */

private val IT = Locale.ITALY

/** Le schede della pagina di una commessa. */
internal enum class SchedaDiCommessa { PANORAMICA, PRESTAZIONI, RAPPORTINI, DOCUMENTI, COSTI, FATTURARE }

/**
 * Quello che resta scelto mentre si va e si torna, come sul computer: il segmento,
 * il filtro e la ricerca dell'elenco, la scheda di ogni commessa. Le pagine si
 * ricreano a ogni passo della pila, quindi non basta remember.
 */
internal object RicordoCommesse {
    /** "APERTA", "SOSPESA", "CHIUSA", "ARCHIVIO". */
    var segmento by mutableStateOf("APERTA")
    var cerca by mutableStateOf("")

    /** "" tutte, "ritardo" quelle oltre la fine prevista, "responsabile" quelle senza responsabile. */
    var filtro by mutableStateOf("")
    val schede = mutableStateMapOf<String, SchedaDiCommessa>()

    /** Dalla Dashboard: "aperte", "sospese", "chiuse", "archivio", "ritardo", "responsabile". */
    fun mostra(f: String) {
        cerca = ""
        val (s, x) = when (f.lowercase()) {
            "sospese", "sospesa" -> "SOSPESA" to ""
            "chiuse", "chiusa" -> "CHIUSA" to ""
            "archivio", "archiviate" -> "ARCHIVIO" to ""
            "ritardo", "inritardo", "scadute" -> "APERTA" to "ritardo"
            "responsabile", "senzaresponsabile" -> "APERTA" to "responsabile"
            else -> "APERTA" to ""
        }
        segmento = s
        filtro = x
    }
}

/**
 * Per le scritture che devono finire anche se si cambia pagina (l'Annulla di un
 * avviso arriva quando la pagina magari non c'è più).
 */
private val ambitoScritture = MainScope()

/** Tutti i rapportini si rileggono al più ogni cinque minuti: è la lettura lenta. */
private var storicoLettoAlle = 0L

/** Il cruscotto vuole tutti i rapportini, non solo gli ultimi mesi: si chiedono entrando. */
@Composable
private fun ChiediStorico(dati: Dati) {
    LaunchedEffect(Unit) {
        val adesso = System.currentTimeMillis()
        if (adesso - storicoLettoAlle > 5 * 60_000L) {
            storicoLettoAlle = adesso
            dati.aggiornaStorico()
        }
    }
}

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataCommesse(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()
    val segmento = RicordoCommesse.segmento
    val filtro = RicordoCommesse.filtro
    val cruscotti = remember(ana, storico) {
        val tutti = storico.conConti()
        ana.commesse.associate { it.id to Conti.cruscotto(it, tutti, ana, oggi) }
    }
    ChiediStorico(dati)

    // Come sul computer: codice, nome, cliente e indirizzo; i numerini contano dopo la ricerca. I modelli non ci sono.
    val testo = Anagrafiche.normalizza(RicordoCommesse.cerca)
    val trovate = ana.commesse.filter { m ->
        !m.modello && (testo.isEmpty() || Anagrafiche.normalizza(listOf(m.id, m.descrizione, ana.cliente(m.idCliente)?.nome.orEmpty(), m.indirizzo).joinToString(" ")).contains(testo))
    }
    fun nelSegmento(m: Commessa, s: String) = if (s == "ARCHIVIO") m.archiviata else !m.archiviata && m.stato.equals(s, ignoreCase = true)
    fun passaFiltro(m: Commessa) = when (filtro) {
        "ritardo" -> m.finePrevista?.isBefore(oggi) == true
        "responsabile" -> m.idResponsabile.isBlank()
        else -> true
    }
    val mostrate = trovate.filter { nelSegmento(it, segmento) && passaFiltro(it) }.sortedByDescending { it.id }
    val puo = perm.modifica(Moduli.COMMESSE)

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Commesse")
            SegmentiScorrevoli(
                listOf("APERTA" to "Aperte", "SOSPESA" to "Sospese", "CHIUSA" to "Chiuse", "ARCHIVIO" to "Archivio")
                    .map { (s, nome) -> s to "$nome · ${trovate.count { nelSegmento(it, s) }}" },
                segmento, { RicordoCommesse.segmento = it; RicordoCommesse.filtro = "" },
            )
            CampoCerca(RicordoCommesse.cerca, { RicordoCommesse.cerca = it }, "Codice, commessa, cliente")
            if (filtro.isNotBlank()) {
                ChipFiltro(if (filtro == "ritardo") "In ritardo" else "Senza responsabile", { RicordoCommesse.filtro = "" })
            }
            if (mostrate.isEmpty()) {
                TestoVuoto(if (segmento == "ARCHIVIO") "Nessuna commessa archiviata" else "Nessuna commessa")
            } else {
                SchedaElenco {
                    mostrate.forEachIndexed { i, m ->
                        val k = cruscotti[m.id] ?: Conti.cruscotto(m, emptyList(), ana, oggi)
                        RigaCommessa(m, ana.cliente(m.idCliente)?.nome ?: m.idCliente, k, perm.costi) { nav.vai("commessa/${m.id}") }
                        if (i < mostrate.lastIndex) LineaElenco()
                    }
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuova commessa", { nav.vai("commessa-nuova") }, icona = Icone.piu)
            }
        }
    }
}

/** Una commessa nell'elenco: codice, nome e cliente, la parola che serve, le ore sul budget. */
@Composable
private fun RigaCommessa(m: Commessa, cliente: String, k: Cruscotto, costi: Boolean, onClick: () -> Unit) {
    val c = W.colori
    val budgetOre = k.budgetOre ?: 0.0
    Column(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CodiceCommessa(m.id)
            Column(Modifier.weight(1f)) {
                Text(m.descrizione, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(cliente, style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (!m.aperta) ParolaStatoCommessa(m.stato) else GiudizioBudget(k)
        }
        if (budgetOre > 0) BarraBudget(k.ore, budgetOre, alta = false)
        Row(Modifier.fillMaxWidth()) {
            Text(
                if (budgetOre > 0) "${Testo.ore(k.ore)} di ${Testo.ore(budgetOre)}" else "${Testo.ore(k.ore)}, senza budget",
                style = Testi.piccolo, color = c.tenue, modifier = Modifier.weight(1f),
            )
            if (costi && k.costo.lavoroNoto) Text("margine ${Testo.euroTondi(k.margine)}", style = Testi.piccolo, color = c.tenue)
        }
    }
}

/** "Vicina al budget" dall'85%, "Oltre il budget" dal 100%, come il cruscotto del computer. */
@Composable
private fun GiudizioBudget(k: Cruscotto) {
    when (k.livelloOre) {
        Livello.OLTRE -> ParolaAvviso("Oltre il budget", grave = true)
        Livello.VICINA -> ParolaAvviso("Vicina al budget", grave = false)
        else -> {}
    }
}

// ---------------------------------------------------------------------------------- pagina

@Composable
fun SchermataCommessa(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val perm = LocalPermessi.current
    val costi = perm.costi
    val puo = perm.modifica(Moduli.COMMESSE)
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val storico by dati.storico.collectAsStateWithLifecycle()
    val avvisi = LocalAvvisi.current
    val m = ana.commessa(id)
    if (m == null) {
        PaginaSenzaCommessa(id, nav)
        return
    }
    val cliente = ana.cliente(m.idCliente)
    val oggi = LocalDate.now()
    val k = remember(m, ana, storico) { Conti.cruscotto(m, storico.conConti(), ana, oggi) }
    ChiediStorico(dati)
    // Le righe dei rapportini vogliono la Vista: il conto rifatto sul telefono e la nuvola se non è ancora partito.
    val viste = remember(storico) { storico.associateBy { it.rapportino.idLocale } }
    val prestazioni = ana.prestazioniDi(m.id)
    var menu by remember { mutableStateOf(false) }
    var daConfermare by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }

    // Si apre su Prestazioni se ce ne sono, altrimenti su Panoramica; Costi e Da fatturare solo con i soldi.
    val schede = buildList {
        add(SchedaDiCommessa.PANORAMICA to "Panoramica")
        add(SchedaDiCommessa.PRESTAZIONI to "Prestazioni · ${prestazioni.size}")
        add(SchedaDiCommessa.RAPPORTINI to "Rapportini · ${k.rapportini.size}")
        add(SchedaDiCommessa.DOCUMENTI to "Documenti")
        if (costi) {
            add(SchedaDiCommessa.COSTI to "Costi")
            add(SchedaDiCommessa.FATTURARE to "Da fatturare")
        }
    }
    val scheda = (RicordoCommesse.schede[m.id] ?: if (prestazioni.isNotEmpty()) SchedaDiCommessa.PRESTAZIONI else SchedaDiCommessa.PANORAMICA)
        .let { s -> if (schede.any { it.first == s }) s else SchedaDiCommessa.PANORAMICA }

    fun cambiaStato(st: String) {
        val prima = m
        inCorso = true
        // Va al server in diretta: intanto si dice che si sta facendo.
        avvisi.mostra("Aggiorno la commessa…")
        ambitoScritture.launch {
            dati.salvaCommessa(m.copy(stato = st), false)
                .onSuccess {
                    avvisi.mostra(
                        when (st) { "SOSPESA" -> "Commessa sospesa"; "CHIUSA" -> "Commessa chiusa"; else -> "Commessa riaperta" },
                    ) {
                        ambitoScritture.launch {
                            dati.salvaCommessa(prima, false).onFailure { avvisi.mostra(messaggioErrore(it, "Non sono riuscito a rimetterla com'era: riprova")) }
                        }
                    }
                }
                .onFailure { avvisi.mostra(messaggioErrore(it, "La commessa non è cambiata: riprova")) }
            inCorso = false
        }
    }

    fun archivia(si: Boolean) {
        inCorso = true
        ambitoScritture.launch {
            dati.archiviaCommessa(m.id, si)
                .onSuccess {
                    if (si) avvisi.mostra("Commessa archiviata") {
                        ambitoScritture.launch { dati.archiviaCommessa(m.id, false).onFailure { avvisi.mostra(messaggioErrore(it, "Non sono riuscito a ripristinarla: riprova")) } }
                    } else avvisi.mostra("Commessa ripristinata")
                }
                .onFailure { avvisi.mostra(messaggioErrore(it, "La commessa non è cambiata: riprova")) }
            inCorso = false
        }
    }

    fun duplica(comeModello: Boolean) {
        inCorso = true
        avvisi.mostra(if (comeModello) "Preparo il modello…" else "Duplico la commessa…")
        ambitoScritture.launch {
            dati.duplicaCommessa(m.id, comeModello)
                .onSuccess { nuova ->
                    if (comeModello) avvisi.mostra("Modello ${nuova.id} pronto: lo trovi in Nuova commessa")
                    else {
                        avvisi.mostra("Creata ${nuova.id}")
                        nav.vai("commessa/${nuova.id}")
                    }
                }
                .onFailure { avvisi.mostra(messaggioErrore(it, "La commessa non è stata duplicata: riprova")) }
            inCorso = false
        }
    }

    val scrivi = m.aperta && perm.modifica(Moduli.RAPPORTINI)
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (scrivi) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }) {
                if (puo) PulsanteTondo(Icone.altro, "Altre azioni", { if (!inCorso) menu = true })
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CodiceCommessa(m.id)
                    ParolaStatoCommessa(m.stato)
                    if (m.archiviata) ParolaGrigia("Archiviata")
                    if (m.modello) ParolaGrigia("Modello")
                    // Fase 5 (§12.5): la commessa di un contratto di assistenza, col contratto linkato.
                    if (m.idContratto.isNotBlank()) Box(Modifier.clickable { nav.vai("contratto-ca/${m.idContratto}") }) { Parola5("Assistenza", colore = eu.stgm.wisper.rapportino.ColoreFase5.BLU) }
                }
                Text(m.descrizione, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
                val sotto = listOfNotNull(
                    cliente?.nome ?: m.idCliente.takeIf { it.isNotBlank() },
                    ana.sede(m.idSede)?.nome ?: m.indirizzo.takeIf { it.isNotBlank() },
                )
                if (sotto.isNotEmpty()) Text(sotto.joinToString(" · "), style = Testi.secondarioGrande, color = c.tenue)
            }
            SchedaPersone(m, ana)
            SegmentiScorrevoli(schede, scheda, { RicordoCommesse.schede[m.id] = it })
            when (scheda) {
                SchedaDiCommessa.PANORAMICA -> PanoramicaCommessa(m, k, costi)
                SchedaDiCommessa.PRESTAZIONI -> PrestazioniCommessa(dati, m, prestazioni, costi, puo)
                SchedaDiCommessa.RAPPORTINI -> RapportiniCommessa(k, viste, nav, costi)
                SchedaDiCommessa.COSTI -> CostiCommessa(m, k, cliente, ana, nav)
                SchedaDiCommessa.FATTURARE -> {
                    // Fase 4 (§15.12): contratto, fatturato, incassato, le scadenze di pagamento col loro stato.
                    if (perm.vede(Moduli.FATTURAZIONE)) FatturazioneDellaCommessa(dati, m.id, nav)
                    DaFatturareCommessa(dati, k, viste, nav)
                }
                // Fase 5 (§12.5): l'archivio filtrato (cartella in cima, documenti, "Da Wisper"); senza il modulo Documenti come prima.
                SchedaDiCommessa.DOCUMENTI -> if (LocalPermessi.current.vede(Moduli.DOCUMENTI)) ArchivioFiltrato(dati, nav, eu.stgm.wisper.rapportino.FiltroArchivio(idCommessa = m.id)) else DocumentiCommessa(dati, m)
            }
        }
        // Solo le aperte si propongono nei rapportini nuovi: dalle altre non se ne scrive uno.
        if (scrivi) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Scrivi un rapportino", { nav.nuovoRapportino(idCliente = m.idCliente, idCommessa = m.id) }, icona = Icone.piu)
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.matita, "Modifica", { menu = false; nav.vai("commessa-modifica/${m.id}") })
            VoceMenu(Icone.copia, "Duplica", { menu = false; duplica(false) })
            if (!m.modello) VoceMenu(Icone.copia, "Duplica come modello", { menu = false; duplica(true) })
            if (!m.archiviata && !m.modello) {
                if (m.stato.equals("APERTA", ignoreCase = true)) {
                    VoceMenu(Icone.pausa, "Sospendi", { menu = false; daConfermare = "SOSPESA" })
                    VoceMenu(Icone.lucchetto, "Chiudi la commessa", { menu = false; daConfermare = "CHIUSA" })
                } else {
                    VoceMenu(Icone.riapri, "Riapri", { menu = false; daConfermare = "APERTA" })
                }
            }
            if (m.archiviata) VoceMenu(Icone.riapri, "Ripristina", { menu = false; archivia(false) })
            else VoceMenu(Icone.cartella, "Archivia", { menu = false; daConfermare = "ARCHIVIA" })
        }
    }
    daConfermare?.let { st ->
        // Le frasi del computer (statoCommessa in pc/ui/app.js).
        val (titolo, testo, azione) = when (st) {
            "SOSPESA" -> Triple("Sospendere la commessa?", "Non si propone più nei rapportini nuovi finché non la riapri.", "Sospendi")
            "CHIUSA" -> Triple(
                "Chiudere la commessa?",
                "Il lavoro è finito: non si propone più nei rapportini nuovi. Ore, costi e rapportini restano, e si può riaprire.",
                "Chiudi",
            )
            "ARCHIVIA" -> Triple(
                "Archiviare ${m.id}?",
                "Non compare più fra le commesse e nei rapportini nuovi. Ore, costi e rapportini restano; si ripristina dall'Archivio.",
                "Archivia",
            )
            else -> Triple("Riaprire la commessa?", "Torna fra quelle proposte nei rapportini.", "Riapri")
        }
        FoglioConferma(titolo, testo, azione, onConferma = {
            daConfermare = null
            if (st == "ARCHIVIA") archivia(true) else cambiaStato(st)
        }, onAnnulla = { daConfermare = null })
    }
}

/** Una parola grigia in pillola: "Archiviata", "Modello", "Disattivato". */
@Composable
internal fun ParolaGrigia(testo: String, modifier: Modifier = Modifier) {
    val c = W.colori
    Text(testo, style = Testi.pillola, color = c.testo2, modifier = modifier.clip(RoundedCornerShape(50)).background(c.superficie2).padding(horizontal = 9.dp, vertical = 3.dp))
}

/** Responsabile, persone e fine prevista: chi se ne occupa e per quando. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SchedaPersone(m: Commessa, ana: Anagrafiche) {
    val c = W.colori
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Responsabile", style = Testi.piccolo, color = c.tenue)
                val resp = ana.utente(m.idResponsabile)
                if (resp != null) Text(resp.nome, style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                else Text("da scegliere", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Persone", style = Testi.piccolo, color = c.tenue)
                val persone = m.persone.mapNotNull { ana.utente(it) }
                if (persone.isEmpty()) Text("—", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
                else Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.semantics(mergeDescendants = true) {
                    contentDescription = "Persone: " + persone.joinToString(", ") { it.nome }
                }) { persone.forEach { CerchioPersona(it.iniziali, 32.dp) } }
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Fine prevista", style = Testi.piccolo, color = c.tenue)
                Text(m.finePrevista?.let { giornoLungo(it) } ?: "—", style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.testo)
            }
        }
    }
}

/** "venerdì 24 ottobre", con l'anno se non è quest'anno. */
private fun giornoLungo(d: LocalDate): String =
    d.format(DateTimeFormatter.ofPattern(if (d.year == LocalDate.now().year) "EEEE d MMMM" else "d MMMM yyyy", IT))

/** Una commessa che non c'è (cancellata, o un indirizzo vecchio). */
@Composable
private fun PaginaSenzaCommessa(id: String, nav: Navigatore) {
    Column(Modifier.fillMaxSize().background(W.colori.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Commessa")
        TestoVuoto("Commessa $id non trovata")
    }
}

// ---------------------------------------------------------------------------------- Prestazioni

/**
 * Le prestazioni della commessa (§5): quanto è fatto in euro, poi una riga per
 * prestazione col valore, la barra, la percentuale e la parola. Con il permesso
 * di scrittura +10% e Segna fatta; un tocco apre la modifica.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PrestazioniCommessa(dati: Dati, m: Commessa, prestazioni: List<Prestazione>, costi: Boolean, puo: Boolean) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var modifica by remember { mutableStateOf<Prestazione?>(null) }

    fun avanza(p: Prestazione, nuovo: Int, annullabile: Boolean) {
        ambitoScritture.launch {
            dati.salvaPrestazione(p.copy(avanzamento = nuovo.coerceIn(0, 100)))
                .onSuccess {
                    if (annullabile) avvisi.mostra("${p.nome}: fatta") {
                        ambitoScritture.launch { dati.salvaPrestazione(p).onFailure { avvisi.mostra(messaggioErrore(it, "Non sono riuscito a rimetterla com'era")) } }
                    }
                }
                .onFailure { avvisi.mostra(messaggioErrore(it, "La prestazione non è cambiata: riprova")) }
        }
    }

    if (prestazioni.isNotEmpty()) {
        if (costi) {
            val totale = prestazioni.sumOf { it.valore ?: 0.0 }
            val fatto = prestazioni.sumOf { (it.valore ?: 0.0) * it.avanzamento / 100.0 }
            Scheda(orizzontale = 18.dp, verticale = 18.dp, spazio = 10.dp) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(Testo.euro(fatto), style = Testi.numeroGrande.copy(letterSpacing = (-0.5).sp), color = c.testo, modifier = Modifier.alignByBaseline())
                    Text(
                        "fatto su ${Testo.euro(totale)}" + (m.importoContratto?.takeIf { it > 0 }?.let { " · contratto ${Testo.euro(it)}" } ?: ""),
                        style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.alignByBaseline(),
                    )
                }
                BarraAvanzamento(if (totale > 0) (fatto / totale).toFloat() else 0f)
            }
        }
        Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
            prestazioni.forEachIndexed { i, p ->
                if (i > 0) LineaElenco()
                RigaPrestazione(
                    p, costi, puo,
                    onTocca = { modifica = p },
                    onPiuDieci = { avanza(p, p.avanzamento + 10, annullabile = p.avanzamento + 10 >= 100) },
                    onFatta = { avanza(p, 100, annullabile = true) },
                )
            }
        }
    } else {
        Scheda(orizzontale = 18.dp, verticale = 16.dp) {
            Text(
                "Nessuna prestazione. Dividi la commessa in prestazioni (sopralluogo, progetto, direzione lavori…) per seguirne valore e avanzamento.",
                style = Testi.secondarioGrande, color = c.tenue,
            )
        }
    }
    if (puo) {
        PulsanteBordo("Aggiungi una prestazione", { modifica = Prestazione("", m.id, "") }, icona = Icone.piu, altezza = 48.dp)
    }

    modifica?.let { p ->
        FoglioPrestazione(
            p, prestazioni, costi,
            onSalva = { nuova, chiudi ->
                ambitoScritture.launch {
                    dati.salvaPrestazione(nuova)
                        .onSuccess { chiudi(null); if (p.id.isBlank()) avvisi.mostra("Aggiunta ${nuova.nome}") }
                        .onFailure { chiudi(messaggioErrore(it, "La prestazione non è stata salvata: riprova")) }
                }
            },
            onTogli = {
                modifica = null
                ambitoScritture.launch {
                    dati.togliPrestazione(p.id)
                        .onSuccess { avvisi.mostra("Tolta ${p.nome}") }
                        .onFailure { avvisi.mostra(messaggioErrore(it, "La prestazione non è stata tolta: riprova")) }
                }
            },
            onSposta = { verso ->
                val ids = prestazioni.map { it.id }.toMutableList()
                val i = ids.indexOf(p.id)
                val j = i + verso
                if (i >= 0 && j in ids.indices) {
                    ids.add(j, ids.removeAt(i))
                    ambitoScritture.launch { dati.ordinaPrestazioni(m.id, ids).onFailure { avvisi.mostra(messaggioErrore(it, "L'ordine non è cambiato: riprova")) } }
                }
            },
            onChiudi = { modifica = null },
        )
    }
}

@Composable
private fun RigaPrestazione(p: Prestazione, costi: Boolean, puo: Boolean, onTocca: () -> Unit, onPiuDieci: () -> Unit, onFatta: () -> Unit) {
    val c = W.colori
    Column(
        Modifier.fillMaxWidth().let { if (puo) it.clickable(onClick = onTocca) else it }.padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(p.nome, style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
            if (costi && p.valore != null) Text(Testo.euro(p.valore), style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BarraAvanzamento(p.avanzamento / 100f, Modifier.weight(1f))
            Text("${p.avanzamento}%", style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, textAlign = TextAlign.End, modifier = Modifier.width(42.dp))
            ParolaPrestazione(p.stato)
        }
        if (puo && !p.fatta) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PulsanteBordo("+10%", onPiuDieci, altezza = 40.dp, stile = Testi.secondario.copy(fontWeight = FontWeight.Bold))
                PulsanteBordo("Segna fatta", onFatta, altezza = 40.dp, stile = Testi.secondario.copy(fontWeight = FontWeight.Bold))
            }
        }
    }
}

/** Da fare (grigia), In corso (giallo tenue), Fatta (verde). */
@Composable
private fun ParolaPrestazione(stato: String) {
    val c = W.colori
    val (parola, testo, fondo) = when (stato) {
        Prestazione.FATTA -> Triple("Fatta", c.firmatoTesto, c.firmatoFondo)
        Prestazione.IN_CORSO -> Triple("In corso", c.gialloTesto, c.gialloTenue)
        else -> Triple("Da fare", c.testo2, c.superficie2)
    }
    Text(parola, style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = testo, maxLines = 1,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 10.dp, vertical = 4.dp))
}

/** La barra nera dell'avanzamento, alta 8, che si riempie piano. */
@Composable
private fun BarraAvanzamento(quota: Float, modifier: Modifier = Modifier) {
    val c = W.colori
    val q by animateFloatAsState(quota.coerceIn(0f, 1f), tween(400), label = "avanzamento")
    Box(
        modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(if (c.scuro) c.bordoScheda else Color(0xFFE2E1DD))
            .semantics { contentDescription = "${(quota * 100).roundToInt()}% fatto" },
    ) {
        Box(Modifier.fillMaxWidth(q).fillMaxHeight().clip(RoundedCornerShape(4.dp)).background(c.testo))
    }
}

/**
 * Il foglio di una prestazione: nome, descrizione, valore, avanzamento a passi di
 * 5 (lo stato segue), Sposta su/giù per l'ordine, Togli.
 */
@Composable
private fun FoglioPrestazione(
    p: Prestazione,
    tutte: List<Prestazione>,
    costi: Boolean,
    onSalva: (Prestazione, (String?) -> Unit) -> Unit,
    onTogli: () -> Unit,
    onSposta: (Int) -> Unit,
    onChiudi: () -> Unit,
) {
    val c = W.colori
    val nuova = p.id.isBlank()
    var nome by remember(p.id) { mutableStateOf(p.nome) }
    var descrizione by remember(p.id) { mutableStateOf(p.descrizione) }
    var valore by remember(p.id) { mutableStateOf(Numeri.scrivi(p.valore)) }
    var avanzamento by remember(p.id) { mutableIntStateOf(p.avanzamento) }
    var errore by remember(p.id) { mutableStateOf<String?>(null) }
    var salvo by remember(p.id) { mutableStateOf(false) }
    var togliere by remember(p.id) { mutableStateOf(false) }
    val posizione = tutte.indexOfFirst { it.id == p.id }
    val errNome = if (errore == "nome") "Scrivi il nome della prestazione" else null
    val errValore = erroreNumero(valore)

    FoglioDalBasso(onChiudi) {
        Text(if (nuova) "Nuova prestazione" else "Modifica la prestazione", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(nome, { nome = it; if (errore == "nome") errore = null }, "Nome", Modifier.fillMaxWidth(), segnaposto = "Progetto esecutivo", errore = errNome)
        CampoTesto(descrizione, { descrizione = it }, "Descrizione", Modifier.fillMaxWidth(), righe = 2)
        if (costi) CampoTesto(valore, { valore = it }, "Valore", Modifier.fillMaxWidth(), segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€", errore = errValore)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Avanzamento", style = Testi.forte, color = c.testo)
                ParolaPrestazione(Prestazione.statoDi(avanzamento))
            }
            Box(
                Modifier.size(52.dp).clip(CircleShape).background(c.superficie2).clickable { avanzamento = (avanzamento - 5).coerceAtLeast(0) }
                    .semantics { contentDescription = "Meno 5 per cento" },
                contentAlignment = Alignment.Center,
            ) { Icon(Icone.meno, null, tint = c.testo, modifier = Modifier.size(24.dp)) }
            Text("$avanzamento%", style = Testi.numeroGrande, color = c.testo, textAlign = TextAlign.Center, modifier = Modifier.width(84.dp))
            Box(
                Modifier.size(52.dp).clip(CircleShape).background(c.superficie2).clickable { avanzamento = (avanzamento + 5).coerceAtMost(100) }
                    .semantics { contentDescription = "Più 5 per cento" },
                contentAlignment = Alignment.Center,
            ) { Icon(Icone.piu, null, tint = c.testo, modifier = Modifier.size(24.dp)) }
        }
        if (!nuova && tutte.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (posizione > 0) PulsanteBordo("Sposta su", { onSposta(-1) }, Modifier.weight(1f), icona = Icone.su, altezza = 48.dp)
                if (posizione in 0 until tutte.lastIndex) PulsanteBordo("Sposta giù", { onSposta(1) }, Modifier.weight(1f), icona = Icone.giu, altezza = 48.dp)
            }
        }
        if (errore != null && errore != "nome") Text(errore!!, style = Testi.secondario, color = c.rossoTesto)
        if (togliere) {
            Text("Togliere ${p.nome}? Il suo valore esce dalla commessa.", style = Testi.testo, color = c.testo2)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PulsanteBordo("Annulla", { togliere = false }, Modifier.weight(1f), altezza = 52.dp)
                Box(
                    Modifier.weight(1f).height(52.dp).clip(RoundedCornerShape(16.dp)).background(c.rossoPieno).clickable(onClick = onTogli),
                    contentAlignment = Alignment.Center,
                ) { Text("Togli", style = Testi.pulsanteSecondario.copy(fontWeight = FontWeight.ExtraBold), color = Color.White) }
            }
        } else {
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva", {
                if (salvo) return@PulsantePrincipale
                if (nome.isBlank()) { errore = "nome"; return@PulsantePrincipale }
                if (errValore != null) return@PulsantePrincipale
                salvo = true
                errore = null
                onSalva(
                    p.copy(nome = nome.trim(), descrizione = descrizione.trim(), valore = if (costi) leggiNumero(valore) else p.valore, avanzamento = avanzamento),
                ) { e -> salvo = false; if (e == null) onChiudi() else errore = e }
            }, altezza = 56.dp, abilitato = !salvo)
            if (!nuova) PulsanteTesto("Togli", { togliere = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
        }
    }
}

// ---------------------------------------------------------------------------------- Panoramica

@Composable
private fun PanoramicaCommessa(m: Commessa, k: Cruscotto, costi: Boolean) {
    val c = W.colori
    val b = k.previsto
    val budgetOre = k.budgetOre ?: 0.0
    // Senza il permesso dei soldi si vedono solo le ore.
    val conBudget = costi && (b.ore != null || b.euro != null || b.prezzo != null)

    // Budget: le ore fatte su quelle previste, poi budget, costo previsto, margine e i prezzi all'ora.
    Scheda(spazio = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (conBudget) "Budget" else "Ore", style = Testi.titoloSezione, color = c.testo, modifier = Modifier.weight(1f))
            val p = k.percOre
            when {
                k.livelloOre == Livello.OLTRE || k.livelloOre == Livello.VICINA -> GiudizioBudget(k)
                p != null -> Text("${percento(p)} delle ore", style = Testi.secondario, color = c.tenue)
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(Testo.ore(k.ore), style = Testi.numeroGrande, color = c.testo, modifier = Modifier.alignByBaseline())
            if (budgetOre > 0) {
                Text("di ${Testo.ore(budgetOre)} previste", style = Testi.testo.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.alignByBaseline())
            }
        }
        if (budgetOre > 0) BarraBudget(k.ore, budgetOre)
        if (conBudget) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ValoreInColonna("Budget", b.euro?.let { Testo.euroTondi(it) } ?: "—", Modifier.weight(1f))
                ValoreInColonna("Costo previsto", b.costoPrevisto?.let { Testo.euroTondi(it) } ?: "—", Modifier.weight(1f))
                ValoreInColonna(
                    "Margine", b.margine?.let { Testo.euroTondi(it) } ?: "—", Modifier.weight(1f),
                    rosso = (b.margine ?: 0.0) < 0,
                )
            }
            val prezzi = listOfNotNull(
                b.prezzo?.let { "${Numeri.scrivi(it)} €/h" },
                b.costo?.let { "costo ${Numeri.scrivi(it)} €/h" },
                b.margineOrario?.let { "margine ${Numeri.scrivi(it)} €/h" },
            )
            if (prezzi.isNotEmpty()) Text(prezzi.joinToString(" · "), style = Testi.secondario, color = c.tenue)
        }
    }

    // I tre numeri del cruscotto: quanto vale, quanto è costata finora, cosa resta.
    if (costi) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val budgetEuro = m.budgetEuro ?: b.euro ?: 0.0
        RiquadroConti(
            "Valore atteso", Testo.euroTondi(k.valoreAtteso), Modifier.weight(1f),
            nota = if (budgetEuro > 0 && budgetEuro >= k.valoreMaturato) "il budget" else "dai rapportini",
        )
        RiquadroConti(
            "Costo finora", if (k.costo.lavoroNoto) Testo.euroTondi(k.costo.totale) else "—", Modifier.weight(1f),
            nota = if (k.costo.lavoroNoto && k.valoreAtteso > 0) "${percento(k.costo.totale / k.valoreAtteso)} del valore" else null,
        )
        RiquadroConti(
            "Margine", if (k.costo.lavoroNoto) Testo.euroTondi(k.margine) else "—", Modifier.weight(1f),
            nota = if (k.costo.lavoroNoto) k.percMargine?.let { percento(it) } else null,
            rosso = k.costo.lavoroNoto && k.margine < 0,
        )
    }
    if (costi) when {
        !k.costo.lavoroNoto -> Text("Per costo e margine manca il tuo costo orario: scrivilo in Amministrazione › Tariffe e rimborsi", style = Testi.secondario, color = c.tenue)
        k.margine < 0 -> Text("Costa più di quanto vale", style = Testi.secondario, color = c.rossoTesto)
        k.margineDaBudget -> Text("Il margine conta già ${Testo.euroTondi(k.costoAtteso)} di costi previsti", style = Testi.secondario, color = c.tenue)
    }

    // Fatturazione: fatturato, pronto da fatturare, ancora da firmare.
    if (costi) Scheda(spazio = 14.dp) {
        Text("Fatturazione", style = Testi.titoloSezione, color = c.testo)
        BarraFatturazione(k.fatturato, k.prontoDaFatturare, k.inBozza)
        Legenda(
            listOf(
                Triple(c.testo, "Fatturato", k.fatturato),
                Triple(c.budget, "Da fatturare", k.prontoDaFatturare),
                Triple(c.bordoCampo, "Da firmare", k.inBozza),
            ),
        )
    }

    // Il tempo (se ci sono inizio e fine) e le ore delle ultime dodici settimane.
    Scheda(spazio = 12.dp) {
        val tempo = k.percTempo
        Text(if (tempo != null) "Tempo" else "Settimana per settimana", style = Testi.titoloSezione, color = c.testo)
        if (tempo != null) {
            BarraSemplice(tempo)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(m.inizio?.let { "dal ${giornoMese(it)}" }.orEmpty(), style = Testi.piccolo, color = c.tenue, modifier = Modifier.weight(1f))
                val g = k.giorniMancanti
                val fine = m.finePrevista?.let { " · fine ${giornoMese(it)}" }.orEmpty()
                Text(
                    when {
                        g == null -> fine.removePrefix(" · ")
                        g >= 0 -> (if (g == 1) "manca 1 giorno" else "mancano $g giorni") + fine
                        // Una chiusa dopo la data prevista non è scaduta: è finita.
                        !k.scaduta -> fine.removePrefix(" · ")
                        else -> (if (g == -1) "scaduta da 1 giorno" else "scaduta da ${-g} giorni") + fine
                    },
                    style = Testi.piccolo, color = if (k.scaduta) c.rossoTesto else c.tenue, textAlign = TextAlign.End,
                )
            }
            Etichetta("Settimana per settimana", Modifier.padding(top = 6.dp))
        }
        Settimane(k.settimane.map { it.inizio to it.ore })
    }

    if (m.note.isNotBlank()) {
        Scheda {
            Text("Note", style = Testi.titoloSezione, color = c.testo)
            Text(m.note, style = Testi.testo, color = c.testo)
        }
    }
}

/** Un valore con l'etichetta sopra, per le tre colonne del budget. */
@Composable
private fun ValoreInColonna(etichetta: String, valore: String, modifier: Modifier, rosso: Boolean = false) {
    val c = W.colori
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(etichetta, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(valore, style = Testi.titoloSezione, color = if (rosso) c.rossoTesto else c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Come [Riquadro], ma col valore rosso quando il margine è sotto zero. */
@Composable
private fun RiquadroConti(etichetta: String, valore: String, modifier: Modifier, nota: String? = null, rosso: Boolean = false) {
    val c = W.colori
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(c.scheda).border(1.dp, c.bordoScheda, RoundedCornerShape(18.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(etichetta, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            valore, style = Testi.titoloSezione.copy(fontSize = Testi.titoloSezione.fontSize * 1.1f),
            color = if (rosso) c.rossoTesto else c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (nota != null) Text(nota, style = Testi.pillola.copy(fontWeight = FontWeight.SemiBold), color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** La barra della fatturazione: tre pezzi in fila, ognuno grande quanto vale. */
@Composable
private fun BarraFatturazione(fatturato: Double, pronto: Double, inBozza: Double) {
    val c = W.colori
    val tot = fatturato + pronto + inBozza
    Row(
        Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(c.superficie2)
            .semantics { contentDescription = "Fatturato ${Testo.euro(fatturato)}, da fatturare ${Testo.euro(pronto)}, da firmare ${Testo.euro(inBozza)}" },
    ) {
        if (tot > 0) {
            listOf(fatturato to c.testo, pronto to c.budget, inBozza to c.bordoCampo).forEach { (v, colore) ->
                if (v > 0) Box(Modifier.weight(v.toFloat()).fillMaxHeight().background(colore))
            }
        }
    }
}

/** La legenda della barra: un pallino del colore e la parola, mai solo il colore. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Legenda(voci: List<Triple<Color, String, Double>>) {
    val c = W.colori
    FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        voci.forEach { (colore, nome, valore) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(colore))
                Text("$nome ${Testo.euroTondi(valore)}", style = Testi.piccolo, color = c.tenue)
            }
        }
    }
}

/** Una barra bassa senza lineetta: quanto tempo è passato fra inizio e fine. */
@Composable
private fun BarraSemplice(quota: Double) {
    val c = W.colori
    Box(
        Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(c.superficie2)
            .semantics { contentDescription = "Tempo passato ${percento(quota)}" },
    ) {
        Box(Modifier.fillMaxWidth(quota.coerceIn(0.0, 1.0).toFloat()).fillMaxHeight().clip(RoundedCornerShape(4.dp)).background(c.testo))
    }
}

/** Le ore delle ultime dodici settimane, una colonna per settimana col giorno del lunedì sotto. */
@Composable
private fun Settimane(settimane: List<Pair<LocalDate, Double>>) {
    val c = W.colori
    val massimo = max(1.0, settimane.maxOfOrNull { it.second } ?: 0.0)
    Row(Modifier.fillMaxWidth().height(84.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
        settimane.forEach { (lunedi, ore) ->
            Column(
                Modifier.weight(1f).fillMaxHeight().semantics(mergeDescendants = true) {
                    contentDescription = "Settimana del ${lunedi.dayOfMonth}/${lunedi.monthValue}: ${Testo.ore(ore)}"
                },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.Bottom),
            ) {
                Box(
                    Modifier.fillMaxWidth().height(max(4.0, ore / massimo * 60).dp).clip(RoundedCornerShape(4.dp))
                        .background(if (ore > 0) c.testo else c.superficie2),
                )
                Text("${lunedi.dayOfMonth}", style = Testi.pillola.copy(fontSize = 10.sp, fontWeight = FontWeight.SemiBold), color = c.tenue, maxLines = 1)
            }
        }
    }
}

// ---------------------------------------------------------------------------------- Rapportini

@Composable
private fun RapportiniCommessa(k: Cruscotto, viste: Map<String, Vista>, nav: Navigatore, costi: Boolean) {
    val c = W.colori
    val rr = k.rapportini.sortedWith(compareByDescending<Rapportino> { it.data }.thenByDescending { it.id })
    if (rr.isEmpty()) {
        TestoVuoto("Ancora nessun rapportino")
        return
    }
    Text(Testo.ore(rr.sumOf { it.oreTotali }) + if (costi) " · ${Testo.euro(rr.sumOf { totaleDi(it) })}" else "", style = Testi.secondario, color = c.tenue)
    ElencoRapportini(rr, viste, nav, costi)
}

/** I rapportini in una scheda, come nel Mese: giorno, lavoro, ore e codice, importo e stato. */
@Composable
private fun ElencoRapportini(rr: List<Rapportino>, viste: Map<String, Vista>, nav: Navigatore, costi: Boolean = true) {
    SchedaElenco {
        rr.forEachIndexed { i, r ->
            RigaRapportinoCommessa(r, viste[r.idLocale], costi) { nav.apriRapportino(r.idLocale) }
            if (i < rr.lastIndex) LineaElenco()
        }
    }
}

@Composable
private fun RigaRapportinoCommessa(r: Rapportino, v: Vista?, costi: Boolean, onClick: () -> Unit) {
    val c = W.colori
    val totale = r.conto?.totale?.takeIf { costi }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(r.data.dayOfMonth.toString(), style = Testi.titoloScheda, color = c.testo)
            // Il giorno della settimana nel mese di adesso, il mese per quelli prima.
            val sotto = if (YearMonth.from(r.data) == YearMonth.now()) r.data.dayOfWeek.getDisplayName(TextStyle.SHORT, IT)
            else r.data.month.getDisplayName(TextStyle.SHORT, IT)
            Text(sotto, style = Testi.piccolo.copy(fontSize = Testi.etichetta.fontSize), color = c.tenue, maxLines = 1)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    r.descrizione.ifBlank { r.cliente }, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (v?.inCoda == true) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icone.nuvola, null, tint = c.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
                }
            }
            Text(
                listOfNotNull(Testo.ore(r.oreTotali), r.id.takeIf { it.isNotBlank() }).joinToString(" · "),
                style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(totale?.let { Testo.euro(it) } ?: "", style = Testi.forte, color = c.testo)
            ParolaStato(r.stato)
        }
    }
}

// ---------------------------------------------------------------------------------- Costi

@Composable
private fun CostiCommessa(m: Commessa, k: Cruscotto, cliente: Cliente?, ana: Anagrafiche, nav: Navigatore) {
    val c = W.colori
    // Il costo orario vero di ogni rapportino (quello del giorno, se il foglio l'ha scritto), non
    // sempre quello delle impostazioni: se sono tutti uguali si scrive, se no solo le ore.
    val diOggi = Conti.costoOrarioDi(cliente, m, ana.impostazioni)
    val usati = k.rapportini.filter { it.oreLavoro + it.oreExtra > 0 }.map { it.costoOrario ?: diOggi }.distinct()
    val lavoro = when {
        !k.costo.lavoroNoto -> "Il tuo lavoro · ${Testo.ore(k.ore)} × costo orario da scrivere nelle Impostazioni"
        usati.size == 1 && usati[0] != null -> "Il tuo lavoro · ${Testo.ore(k.ore)} × ${Numeri.scrivi(usati[0])} €"
        else -> "Il tuo lavoro · ${Testo.ore(k.ore)}"
    }
    val conSpese = k.rapportini.filter { it.spese > 0 || it.foto.isNotEmpty() }.sortedByDescending { it.data }

    Scheda(spazio = 8.dp) {
        RigaCosto(lavoro, if (k.costo.lavoroNoto) Testo.euro(k.costo.lavoro) else "—")
        RigaCosto("Auto · ${Numeri.scrivi(k.rapportini.sumOf { it.km })} km × costo ACI", Testo.euro(k.costo.auto))
        RigaCosto("Spese · ${Testo.quanti(conSpese.size, "rapportino", "rapportini")}", Testo.euro(k.costo.spese))
        LineaElenco()
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.Bottom) {
            Text("Costo finora", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f).alignByBaseline())
            Text(if (k.costo.lavoroNoto) Testo.euro(k.costo.totale) else "incompleto", style = Testi.totale.copy(fontSize = 30.sp), color = c.testo, modifier = Modifier.alignByBaseline())
        }
    }
    if (conSpese.isNotEmpty()) {
        TitoloSezione("Spese", valore = Testo.euro(k.costo.spese))
        SchedaElenco {
            conSpese.forEachIndexed { i, r ->
                RigaVoce(
                    r.noteSpese.ifBlank { r.descrizione.ifBlank { "Spese" } },
                    sotto = listOfNotNull(
                        "${r.data.dayOfMonth} ${r.data.month.getDisplayName(TextStyle.SHORT, IT)}",
                        r.id.takeIf { it.isNotBlank() },
                        r.foto.size.takeIf { it > 0 }?.let { Testo.quanti(it, "scontrino", "scontrini") },
                    ).joinToString(" · "),
                    valore = Testo.euro(r.spese),
                    icona = Icone.scontrino,
                    onClick = { nav.apriRapportino(r.idLocale) },
                )
                if (i < conSpese.lastIndex) LineaElenco()
            }
        }
    }
}

/** Una riga del conto che va a capo invece di schiacciare l'importo. */
@Composable
private fun RigaCosto(etichetta: String, valore: String) {
    val c = W.colori
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.SemiBold), color = c.testo2, modifier = Modifier.weight(1f))
        Text(valore, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
    }
}

// ---------------------------------------------------------------------------------- Da fatturare

@Composable
private fun DaFatturareCommessa(dati: Dati, k: Cruscotto, viste: Map<String, Vista>, nav: Navigatore) {
    val avvisi = LocalAvvisi.current
    val da = k.rapportini.filter { it.stato == Stato.FIRMATO || it.stato == Stato.INVIATO }.sortedBy { it.data }
    val inBozza = k.rapportini.filter { it.stato == Stato.BOZZA }
    var conferma by remember { mutableStateOf(false) }

    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RiquadroConti(
            "Pronto", Testo.euroTondi(k.prontoDaFatturare), Modifier.weight(1f),
            nota = if (da.isEmpty()) "niente" else Testo.quanti(da.size, "rapportino", "rapportini"),
        )
        RiquadroConti(
            "Da firmare", Testo.euroTondi(k.inBozza), Modifier.weight(1f),
            nota = if (inBozza.isEmpty()) "nessuno" else Testo.quanti(inBozza.size, "rapportino", "rapportini"),
        )
        RiquadroConti("Fatturato", Testo.euroTondi(k.fatturato), Modifier.weight(1f))
    }
    if (da.isEmpty()) {
        TestoVuoto("Niente da fatturare")
        return
    }
    ElencoRapportini(da, viste, nav)
    if (LocalPermessi.current.modifica(Moduli.FATTURAZIONE)) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PulsanteBordo("Segna fatturati", { conferma = true }, Modifier.weight(1f))
        PulsanteGialloMedio("Prepara riepilogo", { nav.vai("invio/scelti/" + da.joinToString(",") { it.idLocale }) }, Modifier.weight(1f))
    }

    if (conferma) {
        val somma = da.sumOf { totaleDi(it) }
        FoglioConferma(
            titolo = if (da.size == 1) "Segnare 1 rapportino come fatturato?" else "Segnare ${da.size} rapportini come fatturati?",
            testo = "${Testo.euro(somma)}. Spariscono da Da fatturare.",
            azione = "Segna fatturati",
            onConferma = {
                conferma = false
                val cambio = dati.cambiaStato(da.map { it.idLocale }, Stato.FATTURATO)
                if (cambio.quanti > 0) {
                    avvisi.mostra(if (cambio.quanti == 1) "Segnato fatturato" else "${cambio.quanti} rapportini segnati fatturati") {
                        // Ognuno torna com'era dove si può: un firmato già partito come fatturato il foglio non lo rifà firmato.
                        val tornati = dati.annullaCambioStato(cambio)
                        val restano = cambio.quanti - tornati
                        if (restano == 1) avvisi.mostra("1 rapportino resta fatturato: il server non lo riporta a firmato")
                        else if (restano > 1) avvisi.mostra("$restano rapportini restano fatturati: il server non li riporta a firmati")
                    }
                }
            },
            onAnnulla = { conferma = false },
        )
    }
}

/** Il pulsante giallo alto 52 col testo da 16: due stanno in fila senza tagliare le parole. */
@Composable
private fun PulsanteGialloMedio(testo: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = W.colori
    Box(
        modifier.height(52.dp).clip(RoundedCornerShape(16.dp)).background(c.giallo).clickable(onClick = onClick).padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) { Text(testo, style = Testi.pulsanteSecondario.copy(fontWeight = FontWeight.ExtraBold), color = c.suGiallo, maxLines = 1, overflow = TextOverflow.Ellipsis) }
}

// ---------------------------------------------------------------------------------- Documenti

/** Lo stato della cartella su Drive: si legge ogni volta che si apre la scheda. */
private sealed interface CartellaCommessa {
    data object Leggo : CartellaCommessa
    data class Letta(val documenti: DocumentiCommessa) : CartellaCommessa
    data class Errore(val messaggio: String) : CartellaCommessa
}

@Composable
private fun DocumentiCommessa(dati: Dati, m: Commessa) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableIntStateOf(0) }
    var stato by remember(m.id) { mutableStateOf<CartellaCommessa>(CartellaCommessa.Leggo) }
    var carico by remember { mutableStateOf(false) }

    LaunchedEffect(m.id, giro) {
        stato = CartellaCommessa.Leggo
        stato = dati.documenti(m.id).fold(
            onSuccess = { CartellaCommessa.Letta(it) },
            onFailure = { CartellaCommessa.Errore(messaggioErrore(it, "Non riesco a leggere la cartella su Drive")) },
        )
    }

    val scegli = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val nome = nomeDelFile(ctx, uri)
        carico = true
        avvisi.mostra("Carico $nome…")
        // Il caricamento finisce anche se intanto si cambia scheda.
        ambitoScritture.launch {
            dati.caricaDocumento(m.id, uri)
                .onSuccess { d -> avvisi.mostra("Caricato ${d.nome.ifBlank { nome }}"); giro++ }
                .onFailure { avvisi.mostra(messaggioErrore(it, "$nome non è stato caricato: riprova")) }
            carico = false
        }
    }

    when (val s = stato) {
        CartellaCommessa.Leggo -> TestoVuoto("Leggo la cartella…")
        is CartellaCommessa.Errore -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(s.messaggio, style = Testi.testo, color = c.testo2)
            PulsanteBordo("Riprova", { giro++ }, Modifier.fillMaxWidth(), icona = Icone.riapri)
        }
        is CartellaCommessa.Letta -> SchedaElenco {
            val dd = s.documenti.documenti
            if (dd.isEmpty()) TestoVuoto("Nessun documento")
            dd.forEachIndexed { i, d ->
                RigaVoce(
                    d.nome,
                    sotto = d.data?.let { it.format(DateTimeFormatter.ofPattern("d MMMM yyyy", IT)) },
                    icona = if (d.mime.startsWith("image/")) Icone.galleria else Icone.pdf,
                    freccia = false,
                    onClick = { apriDocumento(ctx, dati, d, avvisi) },
                )
                if (i < dd.lastIndex) LineaElenco()
            }
        }
    }
    // La cartella su Drive c'è solo per le commesse di prima del server (i documenti vecchi stanno ancora lì).
    val cartella = (stato as? CartellaCommessa.Letta)?.documenti?.cartella?.takeIf { it.isNotBlank() } ?: m.cartella
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (cartella.startsWith("http")) PulsanteBordo("Cartella su Drive", { apriIndirizzo(ctx, cartella, avvisi) }, Modifier.weight(1f), icona = Icone.cartella)
        if (LocalPermessi.current.modifica(Moduli.COMMESSE)) {
            PulsanteBordo(if (carico) "Carico…" else "Carica un documento", { if (!carico) scegli.launch("*/*") }, Modifier.weight(1f), icona = Icone.carica)
        }
    }
}

/**
 * Apre un documento: quelli del server (/file/<id>) vogliono l'accesso, quindi
 * si scaricano nella cartella dei PDF e si aprono con l'app che li sa leggere;
 * quelli di Drive di prima si aprono col loro indirizzo.
 */
private fun apriDocumento(ctx: Context, dati: Dati, d: eu.stgm.wisper.rapportino.Documento, avvisi: Avvisi) {
    if (d.url.startsWith("http")) { apriIndirizzo(ctx, d.url, avvisi); return }
    val id = eu.stgm.wisper.rapportino.FileRemoto.idDaUrl(d.url).ifBlank { d.id }
    avvisi.mostra("Apro ${d.nome}…")
    ambitoScritture.launch {
        val scaricato = runCatching { dati.file(id) }
        val (byte, mime) = scaricato.getOrNull() ?: run {
            avvisi.mostra(scaricato.exceptionOrNull()?.message ?: "Il documento non c'è più")
            return@launch
        }
        val f = runCatching {
            val cartella = java.io.File(ctx.cacheDir, "pdf").apply { mkdirs() }
            java.io.File(cartella, d.nome.replace(Regex("""[^A-Za-z0-9._ -]"""), "_").ifBlank { id }).apply { writeBytes(byte) }
        }.getOrNull() ?: run { avvisi.mostra("Non riesco a salvare il documento sul telefono"); return@launch }
        if (!eu.stgm.wisper.rapportino.Stampa.apri(ctx, f, d.mime.ifBlank { mime })) avvisi.mostra("Nessuna app apre questo file")
    }
}

/** Apre un indirizzo (un documento, la cartella) con l'app che lo sa aprire: Drive o il browser. */
private fun apriIndirizzo(ctx: Context, url: String, avvisi: Avvisi) {
    try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: ActivityNotFoundException) {
        avvisi.mostra("Nessuna app lo apre: installa Google Drive o un browser")
    }
}

/** Il nome del file scelto, per dire cosa si è caricato. */
private fun nomeDelFile(ctx: Context, uri: Uri): String =
    runCatching {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cur ->
            if (cur.moveToFirst()) cur.getString(0) else null
        }
    }.getOrNull().orEmpty().ifBlank { "Il documento" }

// ---------------------------------------------------------------------------------- modulo

@Composable
fun SchermataModificaCommessa(dati: Dati, nav: Navigatore, id: String?, idCliente: String?) {
    val c = W.colori
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val scorri = rememberScrollState()
    val nuova = id == null
    val esistente = id?.let { ana.commessa(it) }
    if (!nuova && esistente == null) {
        PaginaSenzaCommessa(id.orEmpty(), nav)
        return
    }
    // Il codice si vede subito, come sul computer: 26ST + il numero dopo l'ultimo.
    val proposto = remember { ana.prossimoCodiceCommessa(LocalDate.now().year) }

    var idCli by rememberSaveable { mutableStateOf(esistente?.idCliente ?: idCliente.orEmpty()) }
    var nome by rememberSaveable { mutableStateOf(esistente?.descrizione.orEmpty()) }
    var codice by rememberSaveable { mutableStateOf(esistente?.id ?: proposto) }
    var indirizzo by rememberSaveable { mutableStateOf(esistente?.indirizzo.orEmpty()) }
    var inizio by rememberSaveable { mutableStateOf(esistente?.inizio?.toString() ?: if (nuova) LocalDate.now().toString() else "") }
    var fine by rememberSaveable { mutableStateOf(esistente?.finePrevista?.toString().orEmpty()) }
    var ore by rememberSaveable { mutableStateOf(Numeri.scrivi(esistente?.budgetOre)) }
    var prezzo by rememberSaveable { mutableStateOf(Numeri.scrivi(esistente?.prezzoOrario)) }
    var budget by rememberSaveable { mutableStateOf(Numeri.scrivi(esistente?.budgetEuro)) }
    var costo by rememberSaveable { mutableStateOf(Numeri.scrivi(esistente?.costoOrario)) }
    var km by rememberSaveable { mutableStateOf(Numeri.scrivi(esistente?.euroKm)) }
    var note by rememberSaveable { mutableStateOf(esistente?.note.orEmpty()) }
    var idSede by rememberSaveable { mutableStateOf(esistente?.idSede.orEmpty()) }
    var idResp by rememberSaveable { mutableStateOf(esistente?.idResponsabile.orEmpty()) }
    // Gli id delle persone separati da virgola: una lista non si salva se si gira il telefono.
    var persone by rememberSaveable { mutableStateOf(esistente?.persone.orEmpty().joinToString(",")) }
    var contratto by rememberSaveable { mutableStateOf(Numeri.scrivi(esistente?.importoContratto)) }
    // Fase 4: null = non toccato e non letto (non si manda); "ore" | "corpo" | "misto".
    var modo by rememberSaveable { mutableStateOf(esistente?.modoFatturazione) }
    val vedeFatture = LocalPermessi.current.vede(Moduli.FATTURAZIONE)
    var sceltaSede by remember { mutableStateOf(false) }
    var sceltaResp by remember { mutableStateOf(false) }
    var sceltaPersone by remember { mutableStateOf(false) }
    var sceltaModello by remember { mutableStateOf(false) }
    val costi = LocalPermessi.current.costi
    val idPersone = persone.split(',').filter { it.isNotBlank() }
    var provato by remember { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    var sceltaCliente by remember { mutableStateOf(false) }
    var calendario by remember { mutableStateOf<String?>(null) }

    val cli = ana.cliente(idCli)
    // Un cliente a tariffa fissa (Elettrodinamica) ha già prezzo e, se scritto, costo:
    // qui si vedono ma non si cambiano, e non si copiano sulla commessa.
    val prezzoFisso = cli?.tariffaFissa
    val costoFisso = cli?.costoFisso
    val prezzoMostrato = prezzoFisso?.let { Numeri.scrivi(it) } ?: prezzo
    val costoMostrato = costoFisso?.let { Numeri.scrivi(it) } ?: costo

    // Ore previste × prezzo orario = budget; ne bastano due, il terzo si calcola (come moduloCommessa del computer).
    fun ricalcola(cambiato: String, pFisso: Double? = prezzoFisso) {
        val o = leggiNumero(ore)
        val p = pFisso ?: leggiNumero(prezzo)
        val e = leggiNumero(budget)
        if (p == null || p <= 0) return
        if ((cambiato == "ore" || cambiato == "prezzo") && o != null && o > 0) budget = Numeri.scrivi(Math.round(o * p * 100) / 100.0)
        if (cambiato == "euro" && e != null && e > 0) ore = Numeri.scrivi(Math.round(e / p * 10) / 10.0)
        if (cambiato == "prezzo" && (o == null || o <= 0) && e != null && e > 0) ore = Numeri.scrivi(Math.round(e / p * 10) / 10.0)
    }

    val dataInizio = inizio.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val dataFine = fine.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val erroreCliente = if (provato && cli == null) "Scegli il cliente" else null
    val erroreNome = if (provato && nome.isBlank()) "Scrivi come si chiama" else null
    val erroreFine = if (dataInizio != null && dataFine != null && dataFine.isBefore(dataInizio)) "Viene prima dell'inizio" else null
    val erroriNumeri = listOf(ore, prezzoMostrato, budget, costoMostrato, km, contratto).map { erroreNumero(it) }

    // Il margine si rifà a ogni tasto, con le stesse regole della pagina della commessa.
    val prova = (esistente ?: Commessa(id = "", idCliente = "", descrizione = "")).copy(
        idCliente = idCli, budgetOre = leggiNumero(ore), budgetEuro = leggiNumero(budget),
        prezzoOrario = leggiNumero(prezzo), costoOrario = leggiNumero(costo),
    )
    val b = Conti.budgetDi(prova, cli, ana.impostazioni)

    fun salva() {
        if (salvo) return
        provato = true
        if (cli == null || nome.isBlank()) {
            scope.launch { scorri.animateScrollTo(0) }
            return
        }
        if (erroreFine != null || erroriNumeri.any { it != null }) return
        val scritto = codice.trim().uppercase()
        val m = (esistente ?: Commessa(id = "", idCliente = "", descrizione = "")).copy(
            // Il codice proposto si lascia scegliere al foglio: se il computer intanto l'ha usato, il foglio dà il primo libero.
            id = esistente?.id ?: if (scritto == proposto) "" else scritto,
            idCliente = cli.id,
            descrizione = nome.trim(),
            indirizzo = indirizzo.trim(),
            inizio = dataInizio,
            finePrevista = dataFine,
            budgetOre = leggiNumero(ore),
            budgetEuro = leggiNumero(budget),
            prezzoOrario = if (prezzoFisso != null) esistente?.prezzoOrario else leggiNumero(prezzo),
            costoOrario = if (costoFisso != null) esistente?.costoOrario else leggiNumero(costo),
            euroKm = leggiNumero(km),
            note = note.trim(),
            idSede = idSede.takeIf { s -> ana.sediDi(cli.id, ancheArchiviate = true).any { it.id == s } }.orEmpty(),
            idResponsabile = idResp,
            persone = idPersone,
            importoContratto = if (costi) leggiNumero(contratto) else esistente?.importoContratto,
        ).let { pronta ->
            // Senza il permesso dei soldi quei campi non si vedono: restano com'erano.
            if (costi) pronta else pronta.copy(
                prezzoOrario = esistente?.prezzoOrario, budgetEuro = esistente?.budgetEuro,
                costoOrario = esistente?.costoOrario, euroKm = esistente?.euroKm,
            )
        }.copy(modoFatturazione = if (costi && vedeFatture) modo else esistente?.modoFatturazione)
        salvo = true
        scope.launch {
            dati.salvaCommessa(m, nuova)
                .onSuccess { s ->
                    val fatta = s.dato.id
                    avvisi.mostra(
                        when {
                            nuova && s.giaEsisteva -> "C'era già: $fatta"
                            nuova -> "Creata $fatta"
                            else -> "Salvata $fatta"
                        },
                    )
                    nav.indietro()
                    // Una commessa nuova si apre: è lì che si guarda il budget e si scrive il primo rapportino.
                    if (nuova) nav.vai("commessa/$fatta")
                }
                .onFailure { avvisi.mostra(messaggioErrore(it, "La commessa non è stata salvata: riprova")) }
            salvo = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(scorri).padding(MarginePagina).padding(bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (nuova) "Nuova commessa" else "Modifica ${esistente?.id}")
            val modelli = ana.commesse.filter { it.modello && !it.archiviata }
            if (nuova && modelli.isNotEmpty()) {
                PulsanteBordo("Da un modello", { sceltaModello = true }, Modifier.fillMaxWidth(), icona = Icone.copia, altezza = 48.dp)
            }

            CampoCliente(cli, erroreCliente) { sceltaCliente = true }
            CampoTesto(nome, { nome = it }, "Come si chiama", segnaposto = "Quadro elettrico capannone", errore = erroreNome)
            if (nuova) {
                CampoTesto(codice, { codice = it.uppercase().trim() }, "Codice", tastiera = KeyboardType.Ascii, segnaposto = proposto)
            } else {
                CampoBloccato("Codice", esistente?.id.orEmpty())
            }
            CampoTesto(indirizzo, { indirizzo = it }, "Indirizzo del cantiere")
            val sediCliente = cli?.let { ana.sediDi(it.id) }.orEmpty()
            if (sediCliente.isNotEmpty()) {
                val sede = sediCliente.firstOrNull { it.id == idSede }
                CampoScelta("Sede o impianto", sede?.nome ?: "Nessuna", sede == null) { sceltaSede = true }
            }
            // Responsabile e persone ci sono quando ci sono gli utenti (il server).
            if (ana.utenti.isNotEmpty()) {
                val resp = ana.utente(idResp)
                CampoScelta("Responsabile", resp?.nome ?: "da scegliere", resp == null, vuotoGiallo = true) { sceltaResp = true }
                val chi = idPersone.mapNotNull { ana.utente(it) }
                CampoScelta("Persone", chi.joinToString(", ") { it.nome }.ifBlank { "Nessuna" }, chi.isEmpty()) { sceltaPersone = true }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CampoData("Inizio", dataInizio, { calendario = "inizio" }, { inizio = "" }, null, Modifier.weight(1f))
                CampoData("Fine prevista", dataFine, { calendario = "fine" }, { fine = "" }, erroreFine, Modifier.weight(1f))
            }

            if (!costi) {
                CampoTesto(ore, { ore = it }, "Ore previste", segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "h", errore = erroriNumeri[0])
            } else Scheda(spazio = 12.dp) {
                Text("Budget", style = Testi.titoloSezione, color = c.testo)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CampoTesto(ore, { ore = it; ricalcola("ore") }, "Ore previste", Modifier.weight(1f), segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "h", errore = erroriNumeri[0])
                    CampoTesto(
                        prezzoMostrato, { prezzo = it; ricalcola("prezzo") }, "Prezzo orario", Modifier.weight(1f), segnaposto = "—",
                        tastiera = KeyboardType.Decimal, suffisso = "€/h", abilitato = prezzoFisso == null, errore = erroriNumeri[1],
                    )
                }
                CampoTesto(budget, { budget = it; ricalcola("euro") }, "Budget", segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€", errore = erroriNumeri[2])
                CampoTesto(contratto, { contratto = it }, "Importo del contratto", segnaposto = "—", tastiera = KeyboardType.Decimal, suffisso = "€", errore = erroriNumeri[5])
                if (vedeFatture) {
                    Text("Come si fattura", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = W.colori.testo)
                    Segmenti(listOf("ore" to "A ore", "corpo" to "A corpo", "misto" to "Misto"), modo ?: "ore", { modo = it })
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    // Vuoti = quelli delle impostazioni, che si vedono in grigio.
                    CampoTesto(
                        costoMostrato, { costo = it }, "Costo orario", Modifier.weight(1f),
                        segnaposto = ana.costoOrario?.let { Numeri.scrivi(it) } ?: "—",
                        tastiera = KeyboardType.Decimal, suffisso = "€/h", abilitato = costoFisso == null, errore = erroriNumeri[3],
                    )
                    CampoTesto(
                        km, { km = it }, "Rimborso km", Modifier.weight(1f),
                        segnaposto = ana.euroKm.takeIf { it > 0 }?.let { Numeri.scrivi(it) } ?: "—",
                        tastiera = KeyboardType.Decimal, suffisso = "€/km", errore = erroriNumeri[4],
                    )
                }
                RigaMarginePrevisto(b.margine, b.margineOrario, b.costoPrevisto)
            }
            CampoTesto(note, { note = it }, "Note", righe = 3)
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva", ::salva, icona = Icone.spunta, abilitato = !salvo)
        }
    }

    if (sceltaCliente) {
        SceltaCliente(ana, idCli, onScelto = { nuovo ->
            if (nuovo.id != idCli) idSede = ""
            idCli = nuovo.id
            sceltaCliente = false
            ricalcola("prezzo", nuovo.tariffaFissa)
        }, onChiudi = { sceltaCliente = false })
    }
    if (sceltaSede) {
        FoglioDalBasso({ sceltaSede = false }) {
            Text("Sede o impianto", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                RigaVoce(
                    "Nessuna", freccia = false,
                    fine = if (idSede.isBlank()) ({ Icon(Icone.spunta, "Scelta", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                    onClick = { idSede = ""; sceltaSede = false },
                )
                cli?.let { ana.sediDi(it.id) }.orEmpty().forEach { s ->
                    LineaElenco()
                    RigaVoce(
                        s.nome, sotto = (if (s.impianto) "Impianto · " else "Sede · ") + s.indirizzoCompleto, icona = Icone.luogo, freccia = false,
                        fine = if (s.id == idSede) ({ Icon(Icone.spunta, "Scelta", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                        onClick = {
                            idSede = s.id
                            if (indirizzo.isBlank()) indirizzo = s.indirizzoCompleto
                            sceltaSede = false
                        },
                    )
                }
            }
        }
    }
    if (sceltaResp) {
        FoglioDalBasso({ sceltaResp = false }) {
            Text("Responsabile", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                ana.utenti.filter { it.attivo }.forEachIndexed { i, u ->
                    if (i > 0) LineaElenco()
                    RigaVoce(
                        u.nome, sotto = Ruoli.nome(u.ruolo), freccia = false,
                        inizio = { CerchioPersona(u.iniziali, 40.dp) },
                        fine = if (u.id == idResp) ({ Icon(Icone.spunta, "Scelto", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                        onClick = { idResp = u.id; sceltaResp = false },
                    )
                }
            }
        }
    }
    if (sceltaPersone) {
        FoglioDalBasso({ sceltaPersone = false }) {
            Text("Persone", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                ana.utenti.filter { it.attivo }.forEachIndexed { i, u ->
                    if (i > 0) LineaElenco()
                    val dentro = u.id in idPersone
                    RigaVoce(
                        u.nome, sotto = Ruoli.nome(u.ruolo), freccia = false,
                        inizio = { CerchioPersona(u.iniziali, 40.dp) },
                        fine = { CasellaScelta(dentro) },
                        onClick = { persone = (if (dentro) idPersone - u.id else idPersone + u.id).joinToString(",") },
                    )
                }
            }
            PulsantePrincipale("Fatto", { sceltaPersone = false }, altezza = 56.dp)
        }
    }
    if (sceltaModello) {
        FoglioDalBasso({ sceltaModello = false }) {
            Text("Da un modello", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                ana.commesse.filter { it.modello && !it.archiviata }.forEachIndexed { i, mod ->
                    if (i > 0) LineaElenco()
                    RigaVoce(
                        mod.descrizione.removePrefix("Modello: "), sotto = ana.cliente(mod.idCliente)?.nome,
                        inizio = { CodiceCommessa(mod.id) },
                        onClick = {
                            sceltaModello = false
                            salvo = true
                            scope.launch {
                                dati.duplicaCommessa(mod.id, comeModello = false)
                                    .onSuccess { nuova ->
                                        avvisi.mostra("Creata ${nuova.id} dal modello: controlla i dati")
                                        nav.indietro()
                                        nav.vai("commessa-modifica/${nuova.id}")
                                    }
                                    .onFailure { avvisi.mostra(messaggioErrore(it, "La commessa non è stata creata: riprova")) }
                                salvo = false
                            }
                        },
                    )
                }
            }
        }
    }
    calendario?.let { quale ->
        ScegliGiorno(
            if (quale == "inizio") dataInizio else dataFine ?: dataInizio,
            onScelto = { g -> if (quale == "inizio") inizio = g.toString() else fine = g.toString() },
            onChiudi = { calendario = null },
        )
    }
}

/** Il margine previsto mentre si scrive: rosso quando si lavora in perdita. */
@Composable
private fun RigaMarginePrevisto(margine: Double?, margineOrario: Double?, costoPrevisto: Double?) {
    val c = W.colori
    val rosso = (margine ?: 0.0) < 0 || (margineOrario ?: 0.0) < 0
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.fondo).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Margine previsto", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.weight(1f).alignByBaseline())
            Text(margine?.let { Testo.euroTondi(it) } ?: "—", style = Testi.titoloSezione.copy(fontSize = 20.sp), color = if (rosso) c.rossoTesto else c.testo, modifier = Modifier.alignByBaseline())
        }
        val pezzi = listOfNotNull(
            margineOrario?.let { "${Numeri.scrivi(it)} €/h di margine" },
            costoPrevisto?.let { "costo previsto ${Testo.euroTondi(it)}" },
        )
        if (pezzi.isNotEmpty()) Text(pezzi.joinToString(" · "), style = Testi.secondario, color = if (rosso) c.rossoTesto else c.tenue)
    }
}

/** Un campo che si sceglie da un elenco (sede, responsabile, persone): il valore e "Cambia". */
@Composable
private fun CampoScelta(etichetta: String, valore: String, vuoto: Boolean, vuotoGiallo: Boolean = false, onClick: () -> Unit) {
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
                .border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp))
                .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp)
                .semantics(mergeDescendants = true) { contentDescription = "$etichetta: $valore" },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                valore, style = Testi.testoGrande,
                color = when { vuoto && vuotoGiallo -> c.gialloTesto; vuoto -> c.moltoTenue; else -> c.testo },
                modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            Text(if (vuoto) "Scegli" else "Cambia", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
        }
    }
}

/** La casella di una scelta multipla: vuota col bordo, piena e scura con la spunta. */
@Composable
internal fun CasellaScelta(scelta: Boolean) {
    val c = W.colori
    Box(
        Modifier.size(26.dp).clip(RoundedCornerShape(8.dp))
            .background(if (scelta) c.testo else c.scheda)
            .border(2.dp, if (scelta) c.testo else c.bordoCampo, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) { if (scelta) Icon(Icone.spunta, null, tint = c.scheda, modifier = Modifier.size(16.dp)) }
}

/** Il cliente della commessa: si tocca e si sceglie dall'elenco, con la sua tariffa sotto il nome. */
@Composable
private fun CampoCliente(cli: Cliente?, errore: String?, onClick: () -> Unit) {
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Cliente", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 64.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
                .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp))
                .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (cli != null) {
                Iniziali(cli.nome, dimensione = 44.dp)
                Column(Modifier.weight(1f)) {
                    Text(cli.nome, style = Testi.forte, color = c.testo, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(tariffaDi(cli), style = Testi.secondario.copy(fontWeight = FontWeight.Medium), color = c.tenue, maxLines = 1)
                }
                Text("Cambia", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            } else {
                Text("Scegli il cliente", style = Testi.testoGrande, color = c.moltoTenue, modifier = Modifier.weight(1f))
                Text("Scegli", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            }
        }
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}

private fun tariffaDi(cli: Cliente): String =
    cli.tariffaFissa?.let { "tariffa fissa ${Numeri.scrivi(it)} €/h" } ?: "tariffa libera"

/** I clienti dal foglio dal basso, con la ricerca: sono pochi, ma i nomi si somigliano. */
@Composable
private fun SceltaCliente(ana: Anagrafiche, scelto: String, onScelto: (Cliente) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    var cerca by remember { mutableStateOf("") }
    val t = Anagrafiche.normalizza(cerca)
    val lista = ana.clienti
        .filter { cl -> t.isEmpty() || Anagrafiche.normalizza((listOf(cl.nome, cl.email, cl.partitaIva) + cl.alias).joinToString(" ")).contains(t) }
        .sortedBy { it.nome.lowercase(IT) }
    FoglioDalBasso(onChiudi) {
        Text("Cliente", style = Testi.titoloScheda, color = c.testo)
        CampoCerca(cerca, { cerca = it }, "Nome, email, partita IVA")
        if (lista.isEmpty()) TestoVuoto("Nessun cliente")
        Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            lista.forEachIndexed { i, cl ->
                RigaVoce(
                    cl.nome, sotto = tariffaDi(cl), freccia = false,
                    inizio = { Iniziali(cl.nome, dimensione = 44.dp) },
                    fine = if (cl.id == scelto) ({ Icon(Icone.spunta, "Scelto", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                    onClick = { onScelto(cl) },
                )
                if (i < lista.lastIndex) LineaElenco()
            }
        }
    }
}

/** Un campo che non si cambia (il codice di una commessa che c'è già): grigio, col lucchetto. */
@Composable
private fun CampoBloccato(etichetta: String, valore: String) {
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(16.dp)).background(c.fondo)
                .border(1.5.dp, c.bordoCampo, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 14.dp)
                .semantics(mergeDescendants = true) { contentDescription = "$etichetta $valore, non si cambia" },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(valore, style = Testi.testoGrande, color = c.tenue, modifier = Modifier.weight(1f))
            Icon(Icone.lucchetto, null, tint = c.tenue, modifier = Modifier.size(18.dp))
        }
    }
}

/** Una data da toccare: si sceglie dal calendario, la × la toglie. */
@Composable
private fun CampoData(etichetta: String, valore: LocalDate?, onClick: () -> Unit, onTogli: () -> Unit, errore: String?, modifier: Modifier) {
    val c = W.colori
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(etichetta, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        Row(
            Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(16.dp)).background(c.scheda)
                .border(1.5.dp, if (errore != null) c.rossoPieno else c.bordoCampo, RoundedCornerShape(16.dp))
                .clickable(onClick = onClick).padding(start = 16.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                valore?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) ?: "—", style = Testi.testoGrande,
                color = if (valore != null) c.testo else c.moltoTenue, modifier = Modifier.weight(1f), maxLines = 1,
            )
            if (valore != null) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onTogli).semantics { contentDescription = "Togli $etichetta" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icone.chiudi, null, tint = c.tenue, modifier = Modifier.size(16.dp)) }
            } else {
                Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) { Icon(Icone.calendario, null, tint = c.tenue, modifier = Modifier.size(18.dp)) }
            }
        }
        if (errore != null) Text(errore, style = Testi.secondario, color = c.rossoTesto)
    }
}

/** Il calendario di Android in una finestra: il giorno si tocca, non si scrive. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ScegliGiorno(iniziale: LocalDate?, onScelto: (LocalDate) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    val stato = rememberDatePickerState(
        initialSelectedDateMillis = (iniziale ?: LocalDate.now()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )
    DatePickerDialog(
        onDismissRequest = onChiudi,
        confirmButton = {
            PulsanteTesto("Fatto", {
                stato.selectedDateMillis?.let { onScelto(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                onChiudi()
            })
        },
        dismissButton = { PulsanteTesto("Annulla", onChiudi, colore = c.testo) },
    ) {
        DatePicker(
            stato,
            title = { Text("Scegli il giorno", style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.padding(start = 24.dp, top = 16.dp)) },
            showModeToggle = false,
        )
    }
}

// ---------------------------------------------------------------------------------- aiuti

/** Il totale di un rapportino: col conto rifatto sul telefono se è cambiato qui (vedi conConti). */
private fun totaleDi(r: Rapportino): Double = r.conto?.totale ?: 0.0

/** "2 ottobre", con l'anno solo se non è quest'anno. */
private fun giornoMese(d: LocalDate): String =
    d.format(DateTimeFormatter.ofPattern(if (d.year == LocalDate.now().year) "d MMMM" else "d MMMM yyyy", IT))

private fun percento(x: Double): String = "${(x * 100).roundToInt()}%"

/**
 * Un numero come lo scrive una persona. In più di [Numeri.leggi]: "1.250" in un
 * budget sono milleduecentocinquanta euro, non uno virgola venticinque.
 */
private fun leggiNumero(t: String): Double? {
    val s = t.trim().replace(" ", "")
    if (s.isEmpty()) return null
    if (Regex("""^\d{1,3}(\.\d{3})+(,\d+)?$""").matches(s)) return s.replace(".", "").replace(',', '.').toDoubleOrNull()
    return Numeri.leggi(s)
}

/** Il campo numerico che non si legge lo dice subito, invece di perdere il numero al salvataggio. */
private fun erroreNumero(t: String): String? = if (t.isNotBlank() && leggiNumero(t) == null) "Non è un numero" else null

/** Il messaggio di un errore dei dati, già scritto per chi usa l'app; se manca, quello dato. */
private fun messaggioErrore(e: Throwable, altrimenti: String): String = e.message?.takeIf { it.isNotBlank() } ?: altrimenti

/** La riga degli elenchi vuoti e dei caricamenti. */
@Composable
private fun TestoVuoto(testo: String) {
    Text(
        testo, style = Testi.secondarioGrande, color = W.colori.tenue, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 12.dp),
    )
}
