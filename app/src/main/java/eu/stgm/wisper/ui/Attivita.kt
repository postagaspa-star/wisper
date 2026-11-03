package eu.stgm.wisper.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
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
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.Promemoria
import eu.stgm.wisper.rapportino.Agenda
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Attivita
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.PonteServer
import eu.stgm.wisper.rapportino.Priorita
import eu.stgm.wisper.rapportino.Ricorrenza
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.TipoAttivita
import eu.stgm.wisper.rapportino.Utente
import eu.stgm.wisper.rapportino.VoceChecklist
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.TextStyle

/*
 * Attività e calendario (docs/gestionale/fase2.md §5, prototipo
 * Gestionale-fase2.html, vista Telefono): l'elenco Mie · Squadra · Non assegnate
 * con i gruppi Scadute · Oggi · Prossimi giorni · Senza data, il cerchio per
 * segnarla fatta (con Annulla), la pagina dell'attività e il modulo. Il
 * calendario sta in Calendario.kt.
 */

internal enum class QualiAttivita(val nome: String) { MIE("Mie"), SQUADRA("Squadra"), LIBERE("Non assegnate") }

/** Il segmento scelto resta andando e tornando. */
internal object RicordoAttivita {
    var segmento by mutableStateOf(QualiAttivita.MIE)
}

/** Le scritture che devono finire anche se si cambia pagina (l'Annulla dell'avviso). */
internal val ambitoAttivita = MainScope()

/** "Sopralluogo · 26ST046 · 14:30", "Studio · lunedì 27", "ogni anno". */
internal fun dettaglioAttivita(a: Attivita, oggi: LocalDate = LocalDate.now()): String {
    val quando = a.giorno?.let { g ->
        val ora = if (a.conOra) ora(a.inizio!!.toLocalTime()) else ""
        when {
            g == oggi -> ora
            g == oggi.minusDays(1) -> "ieri" + if (ora.isNotBlank()) " $ora" else ""
            g == oggi.plusDays(1) -> "domani" + if (ora.isNotBlank()) " $ora" else ""
            g.isAfter(oggi) && g.isBefore(oggi.plusDays(7)) -> g.format(java.time.format.DateTimeFormatter.ofPattern("EEEE d", ITALIA)) + if (ora.isNotBlank()) " $ora" else ""
            else -> giornoBreve(g) + if (ora.isNotBlank()) " $ora" else ""
        }
    }.orEmpty()
    return listOfNotNull(
        TipoAttivita.nome(a.tipo).takeIf { a.tipo != TipoAttivita.ATTIVITA },
        a.idCommessa.ifBlank { a.nomeCommessa }.ifBlank { null } ?: if (a.idCliente.isBlank()) "Studio" else null,
        quando.ifBlank { null },
        a.ricorrenza?.aParole,
    ).joinToString(" · ")
}

internal fun inizialiDi(a: Attivita, ana: Anagrafiche): String? =
    if (a.assegnataA.isBlank()) null else (ana.utente(a.assegnataA)?.iniziali ?: a.nomeAssegnata.takeIf { it.isNotBlank() }?.let { Utente("", it).iniziali } ?: "?")

// ---------------------------------------------------------------------------------- elenco

@Composable
fun SchermataAttivita(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val perm = LocalPermessi.current
    val avvisi = LocalAvvisi.current
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutte by dati.attivita.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    val io = sessione.utente.id
    val puo = perm.modifica(Moduli.ATTIVITA)
    val oggi = LocalDate.now()
    LaunchedEffect(Unit) { dati.aggiornaAttivita() }

    val seg = RicordoAttivita.segmento
    val lista = tutte.filter { a ->
        when (seg) {
            QualiAttivita.MIE -> a.assegnataA == io
            QualiAttivita.LIBERE -> a.assegnataA.isBlank()
            QualiAttivita.SQUADRA -> true
        }
    }
    val gruppi = Agenda.gruppi(lista, oggi)

    fun segna(a: Attivita, fatta: Boolean) {
        ambitoAttivita.launch {
            dati.faiAttivita(a.id, fatta).onSuccess {
                if (fatta) avvisi.mostra("Fatta: ${a.titolo}") {
                    ambitoAttivita.launch { dati.faiAttivita(a.id, false).onFailure { avvisi.mostra(spiegaErrore2(it, "Non è tornata da fare: riprova")) } }
                }
            }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiata: riprova")) }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (puo) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Attività")
            Segmenti(QualiAttivita.entries.map { it to it.nome }, seg, { RicordoAttivita.segmento = it })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PulsanteBordo("Calendario", { nav.vai("calendario") }, icona = Icone.calendario, altezza = 48.dp, stile = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold))
            }
            when {
                tutte.isEmpty() && aggiornamento.inCorso -> { Segnaposto(72.dp); Segnaposto(72.dp) }
                gruppi.isEmpty() -> Scheda(orizzontale = 18.dp, verticale = 4.dp) { RigaCalma("Niente da fare qui.") }
                else -> gruppi.forEach { (g, l) ->
                    // "Più avanti" parte chiuso: l'elenco dice cosa fare a breve, il resto si apre con un tocco.
                    val chiudibile = g == Agenda.Gruppo.PIU_AVANTI
                    var aperto by rememberSaveable(g) { mutableStateOf(!chiudibile) }
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (chiudibile) {
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { aperto = !aperto },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                EtichettaColorata("${g.nome} · ${l.size}", c.tenue)
                                Text(if (aperto) "Chiudi" else "Mostra", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
                            }
                        } else {
                            EtichettaColorata("${g.nome} · ${l.size}", if (g == Agenda.Gruppo.SCADUTE) c.rossoTesto else c.tenue)
                        }
                        if (aperto) SchedaElenco {
                            l.forEachIndexed { i, a ->
                                if (i > 0) LineaElenco()
                                RigaAttivita(a, ana, oggi, puo && a.puoScrivere, onFatta = { segna(a, !a.fatta) }) { nav.vai("attivita/${a.id}") }
                            }
                        }
                    }
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuova attività", { nav.vai("attivita-nuova") }, icona = Icone.piu)
            }
        }
    }
}

/** Una riga (prototipo): il cerchio da spuntare, titolo, "commessa · scadenza", Alta, chi la fa. */
@Composable
internal fun RigaAttivita(a: Attivita, ana: Anagrafiche, oggi: LocalDate, puoSegnare: Boolean, onFatta: () -> Unit, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CerchioFatta(a.fatta, puoSegnare, onFatta)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                a.titolo, style = Testi.forte.copy(textDecoration = if (a.fatta) TextDecoration.LineThrough else null),
                color = if (a.fatta) c.tenue else c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            val sotto = dettaglioAttivita(a, oggi)
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (a.priorita == Priorita.ALTA && !a.fatta) Pillolina("Alta", c.rossoTesto, c.rossoTenue)
        ChiFa(inizialiDi(a, ana))
    }
}

/** Il cerchio da toccare: vuoto da fare, verde con la spunta fatta. Il bersaglio è 48 dp anche se il cerchio è 30. */
@Composable
internal fun CerchioFatta(fatta: Boolean, attivo: Boolean, onClick: () -> Unit) {
    val c = W.colori
    val fondo by animateColorAsState(if (fatta) c.firmatoTesto else Color.Transparent, tween(220), label = "fatta")
    Box(
        Modifier.size(48.dp).clip(CircleShape).let { if (attivo) it.clickable(onClick = onClick) else it }
            .semantics { contentDescription = if (fatta) "Segna da fare" else "Segna fatta" },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(30.dp).clip(CircleShape).background(fondo).border(2.dp, if (fatta) c.firmatoTesto else c.bordoCampo, CircleShape),
            contentAlignment = Alignment.Center,
        ) { if (fatta) Icon(Icone.spunta, null, tint = if (c.scuro) c.suGiallo else Color.White, modifier = Modifier.size(16.dp)) }
    }
}

// ---------------------------------------------------------------------------------- pagina dell'attività

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataDettaglioAttivita(dati: Dati, nav: Navigatore, id: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val perm = LocalPermessi.current
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutte by dati.attivita.collectAsStateWithLifecycle()
    val a = tutte.firstOrNull { it.id == id }
    LaunchedEffect(id) { if (a == null) dati.aggiornaAttivita() }
    if (a == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() })
            Scheda(orizzontale = 20.dp, verticale = 18.dp) { Text("Questa attività non c'è più, o non la puoi vedere.", style = Testi.testo, color = c.testo2) }
        }
        return
    }
    val puo = perm.modifica(Moduli.ATTIVITA) && a.puoScrivere
    var menu by remember { mutableStateOf(false) }
    var togli by remember { mutableStateOf(false) }
    var carico by remember { mutableStateOf(false) }
    val prendiFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u ->
        if (u != null) {
            carico = true
            ambitoAttivita.launch {
                dati.caricaAllegatoAttivita(a.id, u).onSuccess { avvisi.mostra("Allegato aggiunto") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non è stato caricato: riprova")) }
                carico = false
            }
        }
    }

    fun fatta(si: Boolean) {
        ambitoAttivita.launch {
            dati.faiAttivita(a.id, si).onSuccess {
                if (si) avvisi.mostra("Fatta: ${a.titolo}") { ambitoAttivita.launch { dati.faiAttivita(a.id, false) } } else avvisi.mostra("Di nuovo da fare")
            }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiata: riprova")) }
        }
    }

    fun annulla(perRicorrenza: String?) {
        togli = false
        ambitoAttivita.launch {
            dati.togliAttivita(a.id, perRicorrenza).onSuccess { nav.indietro(); avvisi.mostra("Attività annullata") }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata annullata: riprova")) }
        }
    }

    val conRapportino = a.tipo != TipoAttivita.ATTIVITA && a.idCliente.isNotBlank() && perm.modifica(Moduli.RAPPORTINI)
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = SpazioSottoBarra),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }) {
                if (puo) PulsanteTondo(Icone.altro, "Altre azioni", { menu = true })
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pillolina(TipoAttivita.nome(a.tipo), c.testo2, c.superficie2)
                    if (a.priorita == Priorita.ALTA) Pillolina("Alta", c.rossoTesto, c.rossoTenue)
                    if (a.fatta) Pillolina("Fatta", c.firmatoTesto, c.firmatoFondo)
                    if (a.giorno?.isBefore(LocalDate.now()) == true && !a.fatta) Pillolina("Scaduta", c.rossoTesto, c.rossoTenue)
                }
                Text(a.titolo, style = Testi.titoloPagina.copy(fontSize = 26.sp, lineHeight = 30.sp), color = c.testo)
                Text(quandoAParole(a), style = Testi.secondarioGrande, color = c.tenue)
            }
            SchedaElenco {
                val chi = ana.utente(a.assegnataA)
                RigaVoce(
                    "Chi", sotto = chi?.nome ?: a.nomeAssegnata.ifBlank { "Nessuno: è libera" }, freccia = false,
                    inizio = { ChiFa(inizialiDi(a, ana)) },
                )
                val cliente = ana.cliente(a.idCliente)?.nome ?: a.nomeCliente
                if (cliente.isNotBlank()) { LineaElenco(); RigaVoce("Cliente", sotto = cliente, icona = Icone.clienti, freccia = false, onClick = if (a.idCliente.isNotBlank() && perm.vede(Moduli.CLIENTI)) ({ nav.vai("cliente/${a.idCliente}") }) else null) }
                if (a.idCommessa.isNotBlank()) {
                    LineaElenco()
                    RigaVoce("Commessa ${a.idCommessa}", sotto = ana.commessa(a.idCommessa)?.descrizione ?: a.nomeCommessa.ifBlank { null }, icona = Icone.commesse,
                        onClick = if (perm.vede(Moduli.COMMESSE)) ({ nav.vai("commessa/${a.idCommessa}") }) else null)
                }
                ana.prestazioni.firstOrNull { it.id == a.idPrestazione && a.idPrestazione.isNotBlank() }?.let { pr ->
                    LineaElenco(); RigaVoce("Prestazione", sotto = pr.nome, icona = Icone.lista, freccia = false)
                }
                if (a.luogo.isNotBlank()) { LineaElenco(); RigaVoce("Luogo", sotto = a.luogo, icona = Icone.luogo, freccia = false) }
                if (a.promemoriaMinuti != null) { LineaElenco(); RigaVoce("Promemoria", sotto = nomePromemoria(a.promemoriaMinuti, a.conOra), icona = Icone.campanella, freccia = false) }
                a.ricorrenza?.let { r -> LineaElenco(); RigaVoce("Si ripete", sotto = r.aParole.replaceFirstChar { it.uppercase() }, icona = Icone.ripeti, freccia = false) }
            }
            if (a.checklist.isNotEmpty()) {
                Etichetta("Checklist · ${a.checklist.count { it.fatta }} di ${a.checklist.size}")
                SchedaElenco {
                    a.checklist.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        Row(
                            Modifier.fillMaxWidth().heightIn(min = 56.dp).let { m ->
                                if (puo && v.id.isNotBlank()) m.clickable {
                                    ambitoAttivita.launch { dati.spuntaChecklist(a.id, v.id, !v.fatta).onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiata: riprova")) } }
                                } else m
                            }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            CasellaScelta(v.fatta)
                            Text(v.testo, style = Testi.testo.copy(textDecoration = if (v.fatta) TextDecoration.LineThrough else null), color = if (v.fatta) c.tenue else c.testo, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            if (a.descrizione.isNotBlank()) {
                Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 6.dp) {
                    Etichetta("Note")
                    Text(a.descrizione, style = Testi.testo, color = c.testo2)
                }
            }
            Etichetta("Allegati")
            SchedaElenco {
                if (a.allegati.isEmpty()) RigaCalma("Nessun allegato")
                a.allegati.forEachIndexed { i, d ->
                    if (i > 0) LineaElenco()
                    RigaVoce(d.nome, icona = Icone.graffetta, onClick = {
                        ambitoAttivita.launch { apriFileDelServer(ctx, dati, d.id, d.nome, d.mime)?.let { avvisi.mostra(it) } }
                    })
                }
            }
            if (puo) PulsanteBordo(if (carico) "Carico il file…" else "Aggiungi un allegato", { if (!carico) prendiFile.launch("*/*") }, Modifier.fillMaxWidth(), icona = Icone.graffetta, altezza = 48.dp)
            if (puo && conRapportino) {
                PulsanteBordo(if (a.fatta) "Di nuovo da fare" else "Segna fatta", { fatta(!a.fatta) }, Modifier.fillMaxWidth(), icona = Icone.spunta, altezza = 48.dp)
            }
        }
        val giallo: Pair<String, () -> Unit>? = when {
            conRapportino -> "Scrivi il rapportino" to { nav.nuovoRapportino(a.giorno ?: LocalDate.now(), a.idCliente.ifBlank { null }, a.idCommessa.ifBlank { null }) }
            puo && !a.fatta -> "Segna fatta" to { fatta(true) }
            else -> null
        }
        if (giallo != null) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale(giallo.first, giallo.second, icona = if (conRapportino) Icone.piu else Icone.spunta)
        }
        if (puo && !conRapportino && a.fatta) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsanteBordo("Di nuovo da fare", { fatta(false) }, Modifier.fillMaxWidth(), icona = Icone.indietroStato)
        }
    }

    if (menu) FoglioDalBasso({ menu = false }) {
        Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
        VoceMenu(Icone.matita, "Modifica", { menu = false; nav.vai("attivita-modifica/${a.id}") })
        VoceMenu(Icone.cestino, "Annulla l'attività", { menu = false; if (a.ricorrente) togli = true else annulla(null) }, pericolo = true)
    }
    if (togli) FoglioDalBasso({ togli = false }) {
        Text("Si ripete: quali annullare?", style = Testi.titoloScheda, color = c.testo)
        VoceMenu(Icone.cestino, "Solo questa", { annulla("questa") })
        VoceMenu(Icone.cestino, "Da questa in poi", { annulla("future") })
        VoceMenu(Icone.cestino, "Tutte", { annulla("tutte") })
        PulsanteTesto("Lascia com'è", { togli = false }, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/** "Oggi, 14:30 – 16:00", "Scade lunedì 27 ottobre", "Senza data". */
internal fun quandoAParole(a: Attivita, oggi: LocalDate = LocalDate.now()): String {
    val g = a.giorno ?: return "Senza data"
    val giorno = when (g) {
        oggi -> "Oggi"
        oggi.plusDays(1) -> "Domani"
        oggi.minusDays(1) -> "Ieri"
        else -> giornoEsteso(g).replaceFirstChar { it.uppercase() }
    }
    return when {
        a.conOra -> giorno + ", " + ora(a.inizio!!.toLocalTime()) + (a.fine?.let { " – " + ora(it.toLocalTime()) } ?: "")
        a.tipo == TipoAttivita.ATTIVITA -> "Scade " + giorno.replaceFirstChar { it.lowercase() }
        else -> "$giorno, tutto il giorno"
    }
}

internal fun nomePromemoria(minuti: Int?, conOra: Boolean): String = when {
    minuti == null -> "Nessuno"
    !conOra -> if (minuti >= 1440) "Il giorno prima alle 9" else "Il giorno stesso alle 9"
    minuti == 0 -> "All'ora giusta"
    minuti < 60 -> "$minuti minuti prima"
    minuti == 60 -> "Un'ora prima"
    minuti < 1440 -> "${minuti / 60} ore prima"
    minuti == 1440 -> "Un giorno prima"
    else -> "${minuti / 1440} giorni prima"
}

// ---------------------------------------------------------------------------------- modulo

private val SalvaAttivita: Saver<Attivita?, String> = Saver(
    save = { it?.aJson()?.put("id", it.id)?.put("creataDa", it.creataDa)?.toString() ?: "" },
    restore = { s -> if (s.isBlank()) null else Attivita.daJson(JSONObject(s)) },
)

/**
 * Il modulo (fase2.md §5): titolo, tipo, quando, chi, cliente/commessa/prestazione,
 * priorità, promemoria, ripeti, checklist, note. Per una ricorrente, salvando si
 * sceglie "solo questa / da questa in poi / tutte". Un appuntamento che si
 * accavalla chiede conferma (lo dice il server).
 *
 * @param rotta "attivita-nuova", "attivita-nuova/<tipo>/<giorno>", "attivita-modifica/<id>".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchermataModificaAttivita(dati: Dati, nav: Navigatore, rotta: String) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val tutte by dati.attivita.collectAsStateWithLifecycle()
    val io = sessione.utente
    val nuova = rotta.startsWith("attivita-nuova")
    val pezzi = rotta.removePrefix(if (nuova) "attivita-nuova" else "attivita-modifica/").trim('/').split('/')
    val originale = if (nuova) null else tutte.firstOrNull { it.id == pezzi[0] }
    if (!nuova && originale == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            Scheda(orizzontale = 20.dp, verticale = 18.dp) { Text("Questa attività non c'è più.", style = Testi.testo, color = c.testo2) }
        }
        return
    }
    val soloIo = io.ruolo == Ruoli.COLLABORATORE
    var a by rememberSaveable(stateSaver = SalvaAttivita) {
        mutableStateOf<Attivita?>(
            originale ?: run {
                val tipo = TipoAttivita.da(pezzi.getOrNull(0))
                val giorno = pezzi.getOrNull(1)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                val inizio = if (tipo != TipoAttivita.ATTIVITA) (giorno ?: LocalDate.now()).atTime(LocalTime.now().plusHours(1).withMinute(0).withSecond(0).withNano(0)) else null
                Attivita(
                    titolo = "", tipo = tipo, assegnataA = io.id, creataDa = io.id,
                    scadenza = if (tipo == TipoAttivita.ATTIVITA) giorno else null, inizio = inizio, fine = inizio?.plusHours(1),
                )
            },
        )
    }
    val x = a ?: return
    var provato by remember { mutableStateOf(false) }
    var salvo by remember { mutableStateOf(false) }
    var scelta by remember { mutableStateOf<String?>(null) }
    var nuovaVoce by remember { mutableStateOf("") }
    var perQuali by remember { mutableStateOf(false) }
    var conferma by remember { mutableStateOf<Pair<String, String?>?>(null) }
    var assente by remember { mutableStateOf(false) }
    val chiediNotifiche = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    fun cambia(n: Attivita) { a = n }
    val scriveComunicazioniOra = scriveComunicazioni()
    val erroreTitolo = if (provato && x.titolo.isBlank()) "Scrivi cosa c'è da fare" else null
    val erroreInizio = if (provato && x.tipo != TipoAttivita.ATTIVITA && x.inizio == null) "Scegli quando comincia" else null
    val erroreFine = if (x.inizio != null && x.fine != null && !x.fine.isAfter(x.inizio)) "Deve venire dopo l'inizio" else null
    val regolaCambiata = nuova || x.ricorrenza != originale?.ricorrenza

    fun salva(perRicorrenza: String?, confermato: Boolean) {
        salvo = true
        scope.launch {
            dati.salvaAttivita(x, perRicorrenza, regolaCambiata, confermato)
                .onSuccess { s ->
                    // Fase 7 (§3.14): "Intervento fissato per giovedì 23" con Avvisa il cliente (non parte niente da solo).
                    val conAvviso = scriveComunicazioniOra && (s.avvisaCliente ?: x.avvisaCliente).let { it == null || it.isNotBlank() } &&
                        avvisoInterventoFissato(dati, s.copy(avvisaCliente = s.avvisaCliente ?: x.avvisaCliente, idReferenteAvviso = s.idReferenteAvviso.ifBlank { x.idReferenteAvviso }), avvisi)
                    if (!conAvviso) avvisi.mostra(if (nuova) "Attività creata" else "Attività salvata")
                    nav.indietro()
                    if (nuova) nav.vai("attivita/${s.id}")
                }
                .onFailure { e ->
                    val dc = daConfermare(e)
                    // Fase 6 (§6.5): per una persona assente il foglio dice chi e quando (Cambia giorno, o Salvala lo stesso).
                    if (dc != null) {
                        assente = dc.risposta.has("assenti")
                        conferma = dc.message.orEmpty() to perRicorrenza
                    }
                    else avvisi.mostra(spiegaErrore2(e, "L'attività non è stata salvata: riprova"))
                }
            salvo = false
        }
    }

    fun provaASalvare() {
        if (salvo) return
        provato = true
        if (x.titolo.isBlank() || erroreInizio != null || erroreFine != null || (x.tipo != TipoAttivita.ATTIVITA && x.inizio == null)) return
        if (x.ricorrenza != null && x.giorno == null) { avvisi.mostra("Per ripeterla serve una data"); return }
        if (!nuova && originale!!.ricorrente) { perQuali = true; return }
        salva(null, false)
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (nuova) "Nuova attività" else "Modifica")
            CampoTesto(x.titolo, { cambia(x.copy(titolo = it)) }, "Titolo", segnaposto = "Chiamare Rossi per il collaudo", errore = erroreTitolo, righe = 2)
            Segmenti(TipoAttivita.ELENCO.map { it to TipoAttivita.nome(it) }, x.tipo, { t ->
                if (t == x.tipo) return@Segmenti
                cambia(
                    if (t == TipoAttivita.ATTIVITA) x.copy(tipo = t, scadenza = x.inizio?.toLocalDate() ?: x.scadenza, inizio = null, fine = null, tuttoIlGiorno = false)
                    else {
                        val i = x.inizio ?: (x.scadenza ?: LocalDate.now()).atTime(LocalTime.now().plusHours(1).withMinute(0).withSecond(0).withNano(0))
                        x.copy(tipo = t, inizio = i, fine = x.fine ?: i.plusHours(1), scadenza = null)
                    },
                )
            })

            // ---- quando
            if (x.tipo == TipoAttivita.ATTIVITA) {
                CampoQuando("Scadenza", x.scadenza?.let { giornoEsteso(it) }, { scelta = "scadenza" }, onTogli = { cambia(x.copy(scadenza = null, ricorrenza = null)) })
            } else {
                CampoQuando("Giorno", x.inizio?.toLocalDate()?.let { giornoEsteso(it) }, { scelta = "giorno" }, errore = erroreInizio)
                Scheda(orizzontale = 16.dp, verticale = 4.dp, spazio = 0.dp) {
                    RigaInterruttore("Tutto il giorno", x.tuttoIlGiorno) { cambia(x.copy(tuttoIlGiorno = it)) }
                }
                if (!x.tuttoIlGiorno) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CampoQuando("Dalle", x.inizio?.toLocalTime()?.let { ora(it) }, { scelta = "inizio" }, Modifier.weight(1f), icona = Icone.orologio)
                    CampoQuando("Alle", x.fine?.toLocalTime()?.let { ora(it) }, { scelta = "fine" }, Modifier.weight(1f), errore = erroreFine, icona = Icone.orologio)
                }
                CampoTesto(x.luogo, { cambia(x.copy(luogo = it)) }, "Luogo", segnaposto = "Zanè")
            }

            // ---- chi, per chi
            val chi = ana.utente(x.assegnataA)
            CampoDaScegliere("Chi", chi?.nome ?: if (x.assegnataA == io.id) io.nome else "Nessuno: non assegnata", x.assegnataA.isBlank(), { scelta = "chi" })
            CampoDaScegliere("Cliente", ana.cliente(x.idCliente)?.nome ?: x.nomeCliente.ifBlank { "Nessuno" }, x.idCliente.isBlank(), { scelta = "cliente" })
            // Fase 7 (§3.14): appuntamento, sopralluogo o intervento con un cliente: Avvisa il cliente.
            RigaAvvisaCliente(dati, x) { cambia(it) }
            val commessa = ana.commessa(x.idCommessa)
            CampoDaScegliere("Commessa", commessa?.let { "${it.id} · ${it.descrizione}" } ?: x.idCommessa.ifBlank { "Nessuna" }, x.idCommessa.isBlank(), { scelta = "commessa" })
            val prestazioni = if (x.idCommessa.isNotBlank()) ana.prestazioniDi(x.idCommessa) else emptyList()
            if (prestazioni.isNotEmpty()) {
                CampoDaScegliere("Prestazione", prestazioni.firstOrNull { it.id == x.idPrestazione }?.nome ?: "Nessuna", x.idPrestazione.isBlank(), { scelta = "prestazione" })
            }

            // ---- priorità, promemoria, ripeti
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Priorità", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                Segmenti(listOf(Priorita.ALTA to "Alta", Priorita.NORMALE to "Normale", Priorita.BASSA to "Bassa"), x.priorita, { cambia(x.copy(priorita = it)) })
            }
            CampoDaScegliere("Promemoria", nomePromemoria(x.promemoriaMinuti, x.conOra), x.promemoriaMinuti == null, { scelta = "promemoria" })
            CampoDaScegliere("Ripeti", x.ricorrenza?.aParole?.replaceFirstChar { it.uppercase() } ?: "Mai", x.ricorrenza == null, { scelta = "ripeti" })

            // ---- checklist
            Etichetta("Checklist")
            SchedaElenco {
                x.checklist.forEachIndexed { i, v ->
                    if (i > 0) LineaElenco()
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(48.dp).clip(CircleShape).clickable { cambia(x.copy(checklist = x.checklist.map { if (it === v) it.copy(fatta = !it.fatta) else it })) }, contentAlignment = Alignment.Center) {
                            CasellaScelta(v.fatta)
                        }
                        Text(v.testo, style = Testi.testo, color = c.testo, modifier = Modifier.weight(1f))
                        Box(
                            Modifier.size(48.dp).clip(CircleShape).clickable { cambia(x.copy(checklist = x.checklist.filterNot { it === v })) }
                                .semantics { contentDescription = "Togli ${v.testo}" },
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icone.chiudi, null, tint = c.tenue, modifier = Modifier.size(16.dp)) }
                    }
                }
                if (x.checklist.isNotEmpty()) LineaElenco()
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CampoTesto(nuovaVoce, { nuovaVoce = it }, null, Modifier.weight(1f), segnaposto = "Una cosa da spuntare")
                    PulsanteTondo(Icone.piu, "Aggiungi alla checklist", {
                        if (nuovaVoce.isNotBlank()) {
                            cambia(x.copy(checklist = x.checklist + VoceChecklist(PonteServer.NUOVO + System.nanoTime().toString(36), nuovaVoce.trim())))
                            nuovaVoce = ""
                        }
                    }, dimensione = 48.dp)
                }
            }
            CampoTesto(x.descrizione, { cambia(x.copy(descrizione = it)) }, "Note", righe = 3)
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter), sopraBarra = false) {
            PulsantePrincipale(if (salvo) "Salvo…" else "Salva", { provaASalvare() }, icona = Icone.spunta, abilitato = !salvo)
        }
    }

    // ---- le scelte
    when (scelta) {
        "scadenza" -> FinestraGiorno(x.scadenza, { cambia(x.copy(scadenza = it)) }, { scelta = null })
        "giorno" -> FinestraGiorno(x.inizio?.toLocalDate(), { g ->
            val i = g.atTime(x.inizio?.toLocalTime() ?: LocalTime.of(9, 0))
            val durata = if (x.inizio != null && x.fine != null) java.time.Duration.between(x.inizio, x.fine) else java.time.Duration.ofHours(1)
            cambia(x.copy(inizio = i, fine = i.plus(durata)))
        }, { scelta = null })
        "inizio" -> FinestraOra(x.inizio?.toLocalTime() ?: LocalTime.of(9, 0), "Dalle", { t ->
            val giorno = x.inizio?.toLocalDate() ?: LocalDate.now()
            val i = giorno.atTime(t)
            val durata = if (x.inizio != null && x.fine != null && x.fine.isAfter(x.inizio)) java.time.Duration.between(x.inizio, x.fine) else java.time.Duration.ofHours(1)
            cambia(x.copy(inizio = i, fine = i.plus(durata)))
        }, { scelta = null })
        "fine" -> FinestraOra(x.fine?.toLocalTime() ?: (x.inizio?.toLocalTime()?.plusHours(1) ?: LocalTime.of(10, 0)), "Alle", { t ->
            cambia(x.copy(fine = (x.inizio?.toLocalDate() ?: LocalDate.now()).atTime(t)))
        }, { scelta = null })
        "chi" -> FoglioDalBasso({ scelta = null }) {
            Text("Chi", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                RigaVoce("Nessuno: non assegnata", freccia = false, inizio = { ChiFa(null) }, onClick = { scelta = null; cambia(x.copy(assegnataA = "")) })
                // Un collaboratore assegna solo a sé o a nessuno (§13.7).
                val persone = if (soloIo) listOf(io) else ana.utenti.filter { it.attivo }.ifEmpty { listOf(io) }
                persone.forEach { u ->
                    LineaElenco()
                    RigaVoce(
                        u.nome, sotto = Ruoli.nome(u.ruolo), freccia = false, inizio = { CerchioPersona(u.iniziali, 40.dp) },
                        fine = if (u.id == x.assegnataA) ({ Icon(Icone.spunta, "Scelto", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                        onClick = { scelta = null; cambia(x.copy(assegnataA = u.id)) },
                    )
                }
            }
        }
        "cliente" -> FoglioSceltaCliente(ana, x.idCliente, onScelto = { cl ->
            scelta = null
            val tieni = cl != null && ana.commessa(x.idCommessa)?.idCliente == cl.id
            cambia(x.copy(idCliente = cl?.id.orEmpty(), nomeCliente = cl?.nome.orEmpty(), idCommessa = if (tieni) x.idCommessa else "", idPrestazione = if (tieni) x.idPrestazione else ""))
        }, onChiudi = { scelta = null }, conNessuno = true)
        "commessa" -> FoglioDalBasso({ scelta = null }) {
            Text("Commessa", style = Testi.titoloScheda, color = c.testo)
            val elenco = ana.commesse.filter { it.aperta && (x.idCliente.isBlank() || it.idCliente == x.idCliente) }.sortedByDescending { it.id }
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                RigaVoce("Nessuna", freccia = false, onClick = { scelta = null; cambia(x.copy(idCommessa = "", idPrestazione = "")) })
                elenco.forEach { m ->
                    LineaElenco()
                    RigaVoce(m.descrizione, sotto = ana.cliente(m.idCliente)?.nome, inizio = { CodiceCommessa(m.id) }, freccia = false, onClick = {
                        scelta = null
                        cambia(x.copy(idCommessa = m.id, idPrestazione = "", idCliente = x.idCliente.ifBlank { m.idCliente }))
                    })
                }
            }
        }
        "prestazione" -> FoglioDalBasso({ scelta = null }) {
            Text("Prestazione", style = Testi.titoloScheda, color = c.testo)
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                RigaVoce("Nessuna", freccia = false, onClick = { scelta = null; cambia(x.copy(idPrestazione = "")) })
                ana.prestazioniDi(x.idCommessa).forEach { pr ->
                    LineaElenco()
                    RigaVoce(pr.nome, freccia = false, onClick = { scelta = null; cambia(x.copy(idPrestazione = pr.id)) })
                }
            }
        }
        "promemoria" -> FoglioDalBasso({ scelta = null }) {
            Text("Promemoria", style = Testi.titoloScheda, color = c.testo)
            val scelte: List<Int?> = if (x.conOra) listOf(null, 0, 15, 30, 60, 1440) else listOf(null, 0, 1440)
            scelte.forEach { m ->
                SceltaGrande(nomePromemoria(m, x.conOra), x.promemoriaMinuti == m, {
                    scelta = null
                    cambia(x.copy(promemoriaMinuti = m))
                    // Il permesso delle notifiche si chiede qui, quando serve davvero (Android 13 e dopo).
                    if (m != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Promemoria.notifichePermesse(ctx)) {
                        chiediNotifiche.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                })
            }
        }
        "ripeti" -> FoglioRipeti(x.ricorrenza, x.giorno, onChiudi = { scelta = null }) { r -> scelta = null; cambia(x.copy(ricorrenza = r)) }
    }

    if (perQuali) FoglioDalBasso({ perQuali = false }) {
        Text("Si ripete: quali cambiare?", style = Testi.titoloScheda, color = c.testo)
        VoceMenu(Icone.spunta, "Solo questa", { perQuali = false; salva("questa", false) })
        VoceMenu(Icone.ripeti, "Da questa in poi", { perQuali = false; salva("future", false) })
        VoceMenu(Icone.ripeti, "Tutte", { perQuali = false; salva("tutte", false) })
        PulsanteTesto("Annulla", { perQuali = false }, Modifier.fillMaxWidth(), colore = c.testo)
    }
    conferma?.let { (testo, perRicorrenza) ->
        if (assente) FoglioDalBasso({ conferma = null }) {
            Text(testo, style = Testi.titoloScheda, color = c.testo)
            PulsantePrincipale("Cambia giorno", { conferma = null })
            PulsanteTesto("Salvala lo stesso", { conferma = null; salva(perRicorrenza, true) }, Modifier.fillMaxWidth(), colore = c.testo)
        } else FoglioConferma(
            "Si sovrappone a un altro impegno", testo, "Salva lo stesso",
            onConferma = { conferma = null; salva(perRicorrenza, true) }, onAnnulla = { conferma = null },
        )
    }
}

/** Ripeti: mai, ogni giorno, settimana, mese, anno, o personalizzato (ogni N, i giorni, fino a quando). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FoglioRipeti(attuale: Ricorrenza?, giorno: LocalDate?, onChiudi: () -> Unit, onScelta: (Ricorrenza?) -> Unit) {
    val c = W.colori
    var personalizzato by remember { mutableStateOf(attuale != null && (attuale.ogni > 1 || attuale.giorniSettimana.isNotEmpty() || attuale.fine != null)) }
    var regola by remember { mutableStateOf(attuale?.regola ?: Ricorrenza.SETTIMANE) }
    var ogni by remember { mutableStateOf(attuale?.ogni ?: 1) }
    var giorni by remember { mutableStateOf(attuale?.giorniSettimana ?: listOfNotNull(giorno?.dayOfWeek?.value)) }
    var fine by remember { mutableStateOf(attuale?.fine) }
    var calendario by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Ripeti", style = Testi.titoloScheda, color = c.testo)
            if (!personalizzato) {
                SceltaGrande("Mai", attuale == null, { onScelta(null) })
                listOf(Ricorrenza.GIORNI to "Ogni giorno", Ricorrenza.SETTIMANE to "Ogni settimana", Ricorrenza.MESI to "Ogni mese", Ricorrenza.ANNI to "Ogni anno").forEach { (r, nome) ->
                    SceltaGrande(nome, attuale?.regola == r && attuale.ogni == 1 && attuale.giorniSettimana.isEmpty() && attuale.fine == null, { onScelta(Ricorrenza(r)) })
                }
                SceltaGrande("Personalizzato", false, { personalizzato = true })
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Ogni", style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                    Stepper("$ogni", { ogni = (ogni - 1).coerceAtLeast(1) }, { ogni = (ogni + 1).coerceAtMost(99) }, "ripetizioni")
                }
                Segmenti(listOf(Ricorrenza.GIORNI to "Giorni", Ricorrenza.SETTIMANE to "Settimane", Ricorrenza.MESI to "Mesi", Ricorrenza.ANNI to "Anni"), regola, { regola = it })
                if (regola == Ricorrenza.SETTIMANE) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        (1..7).forEach { d ->
                            val su = d in giorni
                            Pillola(DayOfWeek.of(d).getDisplayName(TextStyle.SHORT, ITALIA).replaceFirstChar { it.uppercase() }, su, { giorni = if (su) giorni - d else (giorni + d).sorted() }, altezza = 48.dp)
                        }
                    }
                }
                CampoQuando("Fino al", fine?.let { giornoEsteso(it) }, { calendario = true }, onTogli = { fine = null })
                Text(Ricorrenza(regola, ogni, if (regola == Ricorrenza.SETTIMANE) giorni else emptyList(), fine).aParole.replaceFirstChar { it.uppercase() }, style = Testi.secondarioGrande, color = c.tenue)
                PulsantePrincipale("Fatto", { onScelta(Ricorrenza(regola, ogni, if (regola == Ricorrenza.SETTIMANE) giorni else emptyList(), fine)) }, altezza = 56.dp)
            }
        }
    }
    if (calendario) FinestraGiorno(fine ?: giorno?.plusMonths(6), { fine = it }, { calendario = false })
}
