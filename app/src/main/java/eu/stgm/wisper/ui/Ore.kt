@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ContiOreSpese
import eu.stgm.wisper.rapportino.DaApprovare
import eu.stgm.wisper.rapportino.ErroreOre
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.GiornoOre
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.RigaOre
import eu.stgm.wisper.rapportino.RigaStatisticaOre
import eu.stgm.wisper.rapportino.StatoVoce
import eu.stgm.wisper.rapportino.VoceDaApprovare
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/*
 * Ore e rapportini della fase 3 (docs/gestionale/fase3.md §5, prototipo
 * Gestionale-fase3.html, pagRapportini): i segmenti Ore · Rapportini · Da
 * approvare. Ore = il timer, la settimana e le righe del giorno, Registra ore;
 * Rapportini = l'elenco di sempre con la pillola dell'approvazione; Da approvare
 * = per chi approva (titolare e amministrazione, §14.1).
 */

enum class SegmentoOre { ORE, RAPPORTINI, APPROVARE }

/** Quello che resta della voce Ore e rapportini mentre si va e si torna (e che la Dashboard sceglie). */
object RicordoOre {
    var segmento by mutableStateOf(SegmentoOre.ORE)

    /** Il giorno da aprire (una riga della Dashboard, una bozza appena salvata). */
    var giorno: LocalDate? = null

    /** La riga da aprire nel modulo (la bozza del timer, una riga dell'elenco). */
    var riga: RigaOre? = null

    /** Il mese delle statistiche: quello della settimana da cui si aprono. */
    var meseStatistiche: YearMonth = YearMonth.now()
}

@Composable
fun SchermataOreERapportini(dati: Dati, nav: Navigatore, filtro: FiltroRapportini, onFiltro: (FiltroRapportini) -> Unit) {
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    val puoApprovare = sessione.puoApprovare
    val seg = RicordoOre.segmento.let { if (it == SegmentoOre.APPROVARE && !puoApprovare) SegmentoOre.ORE else it }
    val daApprovare = dashboard?.fase3?.approvare?.voci?.takeIf { it > 0 }
    val visita = LocalVisita.current
    val testa: @Composable () -> Unit = {
        TitoloPagina("Ore e rapportini")
        SegmentiScorrevoli(
            listOf(SegmentoOre.ORE to "Ore", SegmentoOre.RAPPORTINI to "Rapportini") +
                if (puoApprovare) listOf(SegmentoOre.APPROVARE to ("Da approvare" + (daApprovare?.let { " · $it" } ?: ""))) else emptyList(),
            seg, {
                RicordoOre.segmento = it
                if (it == SegmentoOre.RAPPORTINI) visita?.azione("segmento-rapportini")
            },
            bersagli = { if (it == SegmentoOre.RAPPORTINI) "segmento-rapportini" else null },
        )
    }
    when (seg) {
        SegmentoOre.RAPPORTINI -> SchermataRapportini(dati, nav, filtro, onFiltro, sopra = testa)
        SegmentoOre.ORE -> PaginaOre(dati, nav, testa)
        SegmentoOre.APPROVARE -> PaginaDaApprovare(dati, testa)
    }
}

// ---------------------------------------------------------------------------------- Ore

@Composable
private fun PaginaOre(dati: Dati, nav: Navigatore, testa: @Composable () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val perm = LocalPermessi.current
    val scrive = perm.modifica(Moduli.RAPPORTINI)
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ore by dati.ore.collectAsStateWithLifecycle()
    val timer by dati.timer.collectAsStateWithLifecycle()
    val aggiornamento by dati.aggiornamento.collectAsStateWithLifecycle()
    val oggi = LocalDate.now()
    val scope = rememberCoroutineScope()

    var giorno by rememberSaveable { mutableStateOf(RicordoOre.giorno ?: oggi) }
    var lunedi by rememberSaveable { mutableStateOf(FilaOreSpese.lunedi(giorno)) }
    LaunchedEffect(Unit) { RicordoOre.giorno = null; dati.aggiornaTimer() }
    LaunchedEffect(lunedi) { dati.aggiornaOre(lunedi, lunedi.plusDays(6)) }

    val elenco = ore?.takeIf { it.da == lunedi }
    val recenti = remember(ana, viste, ore) { FilaOreSpese.commesseRecenti(ana, viste.map { it.rapportino }, ore?.ore.orEmpty()) }
    var commessaTimer by rememberSaveable { mutableStateOf<String?>(null) }
    val sceltaTimer = commessaTimer ?: recenti.firstOrNull()?.id ?: ""
    var timerInCorso by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val esporta = rememberEsportaPerExcel(dati)

    fun avvia() {
        if (timerInCorso) return
        timerInCorso = true
        scope.launch {
            dati.avviaTimer(sceltaTimer)
                .onSuccess { avvisi.mostra("Timer acceso su " + sceltaTimer.ifBlank { "Studio" }) }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Il timer non si è acceso: riprova")) }
            timerInCorso = false
        }
    }

    fun ferma() {
        if (timerInCorso) return
        timerInCorso = true
        scope.launch {
            dati.fermaTimer()
                .onSuccess { f ->
                    RicordoOre.riga = f.riga
                    avvisi.mostra(f.avviso.ifBlank { "Bozza di ${Numeri.ore(f.riga.ore)}: correggila e salva" })
                    nav.vai("ore-registra/" + f.riga.chiave)
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Il timer non si è fermato: riprova")) }
            timerInCorso = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataMenu { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
            testa()

            // Il timer: acceso, il tempo che scorre; spento, la commessa e Avvia (col bordo: il giallo è di Registra ore).
            val t = timer
            if (t?.acceso == true) {
                SchedaTimerAcceso(t, onFerma = { ferma() }, Modifier.bersaglio("timer"), inCorso = timerInCorso)
            } else if (scrive) {
                Scheda(Modifier.bersaglio("timer"), orizzontale = 18.dp, verticale = 16.dp) {
                    Etichetta("Timer")
                    SceltaCommessa(ana, recenti, sceltaTimer, { commessaTimer = it }, conStudio = true)
                    PulsanteBordo(
                        if (timerInCorso) "Accendo il timer…" else "Avvia il timer", { avvia() }, Modifier.fillMaxWidth(),
                        icona = Icone.avvia, altezza = 56.dp,
                    )
                }
            }

            // La settimana: i giorni con le ore, come Il tuo giorno; il giorno scelto in giallo.
            Scheda(orizzontale = 12.dp, verticale = 12.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Settimana del " + lunedi.format(DateTimeFormatter.ofPattern("d MMMM", ITALIA)),
                        style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f).padding(start = 6.dp),
                    )
                    PulsanteTondo(Icone.frecciaSinistra, "Settimana prima", { lunedi = lunedi.minusWeeks(1); giorno = lunedi })
                    Spacer(Modifier.width(8.dp))
                    PulsanteTondo(Icone.freccia, "Settimana dopo", {
                        if (lunedi.plusWeeks(1).isAfter(oggi)) avvisi.mostra("La settimana dopo non è ancora cominciata")
                        else { lunedi = lunedi.plusWeeks(1); giorno = lunedi }
                    })
                }
                val giorni = FilaOreSpese.giorniSettimana(lunedi, elenco)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    giorni.forEach { g -> GiornoDellaSettimana(g, g.data == giorno, Modifier.weight(1f)) { giorno = g.data } }
                }
            }

            val righe = FilaOreSpese.righeDelGiorno(elenco, giorno)
            val delGiorno = elenco?.giorni?.firstOrNull { it.data == giorno }
            TitoloSezione(
                giornoEsteso(giorno).replaceFirstChar { it.uppercase() },
                delGiorno?.ore?.takeIf { it > 0 }?.let { Numeri.ore(it) },
            )
            when {
                elenco == null && aggiornamento.errore.isNotBlank() && !aggiornamento.inCorso -> Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Text(aggiornamento.errore, style = Testi.testo, color = c.testo2)
                    PulsanteBordo("Riprova", { dati.aggiornaOre(lunedi, lunedi.plusDays(6)) }, Modifier.fillMaxWidth(), icona = Icone.riapri)
                }
                elenco == null -> Segnaposto(120.dp)
                else -> SchedaElenco {
                    if (righe.isEmpty()) RigaCalma("Nessuna ora registrata.")
                    righe.forEachIndexed { i, r ->
                        if (i > 0) LineaElenco()
                        RigaDiOre(r) {
                            if (r.puoScrivere && r.bloccata.isBlank() && scrive) {
                                RicordoOre.riga = r
                                nav.vai("ore-registra/" + r.chiave)
                            } else avvisi.mostra(r.bloccata.ifBlank { "Queste ore non le puoi cambiare" })
                        }
                    }
                }
            }
            delGiorno?.oreRapportini?.takeIf { it > 0 }?.let {
                Text("In più ${Numeri.ore(it)} nei rapportini di questo giorno", style = Testi.secondario, color = c.tenue)
            }
        }
        if (scrive) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Registra ore", { RicordoOre.riga = null; nav.vai("ore-registra/nuova/$giorno") }, icona = Icone.piu)
            }
        }
    }

    // Le cose che servono meno spesso: le statistiche e i file per Excel (come i pulsanti del computer).
    if (menu) {
        val mese = YearMonth.from(giorno)
        val nomeM = nomeMese(mese).substringBefore(' ').lowercase(ITALIA)
        val inizio = lunedi.format(DateTimeFormatter.ofPattern("d MMMM", ITALIA))
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.barre, "Statistiche delle ore", { menu = false; RicordoOre.meseStatistiche = mese; nav.vai("ore-statistiche") })
            VoceMenu(Icone.scarica, "Esporta la settimana del $inizio", {
                menu = false
                esporta("ore", lunedi, lunedi.plusDays(6), "Le ore della settimana del $inizio", utente = dati.sessione.value.utente.id)
            })
            VoceMenu(Icone.scarica, "Esporta le ore di $nomeM", { menu = false; esporta("ore", mese.atDay(1), mese.atEndOfMonth(), "Le ore di $nomeM") })
        }
    }
}

/** Un giorno della settimana delle ore: il nome, il cerchio col numero, le ore sotto. */
@Composable
private fun GiornoDellaSettimana(g: GiornoOre, scelto: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = W.colori
    val conOre = g.tutte > 0
    Column(
        modifier.widthIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick)
            .semantics { role = Role.Tab; selected = scelto; contentDescription = giornoEsteso(g.data) + if (conOre) ", " + Numeri.ore(g.tutte) else ", nessuna ora" }
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(FilaOreSpese.nomeGiorno(g.data), style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = if (scelto) c.testo else c.tenue)
        val (fondo, testo) = when {
            scelto -> c.giallo to c.suGiallo
            conOre -> c.testo to c.scheda
            else -> c.superficie2 to c.moltoTenue
        }
        Box(Modifier.size(40.dp).clip(CircleShape).background(fondo), contentAlignment = Alignment.Center) {
            Text(g.data.dayOfMonth.toString(), style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = testo)
        }
        Text(if (conOre) Numeri.ore(g.tutte) else " ", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.testo2, maxLines = 1)
    }
}

/** Una riga di ore: la commessa (o Studio), cosa, quando, le ore e lo stato se non è approvata. */
@Composable
private fun RigaDiOre(r: RigaOre, onClick: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CodiceOStudio(r.idCommessa)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    r.descrizione.ifBlank { r.commessa.ifBlank { if (r.studio) "Attività dello studio" else "Ore senza descrizione" } },
                    style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
                if (r.inCoda) NuvolaInCoda()
            }
            val sotto = listOfNotNull(
                if (r.conOrari) r.inizio.removePrefix("0") + "–" + r.fine.removePrefix("0") + (if (r.pausaMinuti > 0) " · pausa ${r.pausaMinuti} min" else "") else null,
                if (!r.fatturabile) "non fatturabile" else null,
                if (r.straordinaria) "straordinarie" else null,
                r.prestazione.ifBlank { null },
                if (r.dalTimer && r.stato == StatoVoce.BOZZA) "dal timer" else null,
            ).joinToString(" · ")
            if (sotto.isNotBlank()) Text(sotto, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (r.stato == StatoVoce.RESPINTA) PillolaStatoVoce(r.stato, r.motivoRifiuto, Modifier.padding(top = 2.dp))
            if (r.errore.isNotBlank()) Text(r.errore, style = Testi.secondario, color = c.rossoTesto)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(Numeri.ore(r.ore), style = Testi.forte, color = c.testo)
            if (r.stato != StatoVoce.RESPINTA) PillolaStatoVoce(r.stato)
        }
    }
}

// ---------------------------------------------------------------------------------- Registra ore

/**
 * Il modulo corto delle ore (fase3.md §5): commessa fra le recenti, durata con
 * gli stepper a mezz'ore oppure inizio-fine-pausa, Fatturabile, Straordinarie,
 * prestazione, attività, cosa hai fatto. [arg]: "nuova/<giorno>" o la chiave di
 * una riga ("ore:12", o "O-..." se è ancora sul telefono).
 */
@Composable
fun SchermataRegistraOre(dati: Dati, nav: Navigatore, arg: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val viste by dati.viste.collectAsStateWithLifecycle()
    val ore by dati.ore.collectAsStateWithLifecycle()
    val attivita by dati.attivita.collectAsStateWithLifecycle()
    val nuova = arg.startsWith("nuova")
    val esistente = remember(arg) {
        if (nuova) null else RicordoOre.riga?.takeIf { it.chiave == arg } ?: ore?.ore?.firstOrNull { it.chiave == arg }
    }
    if (!nuova && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            RigaCalma("Queste ore non ci sono più")
        }
        return
    }
    val recenti = remember(ana, viste, ore) { FilaOreSpese.commesseRecenti(ana, viste.map { it.rapportino }, ore?.ore.orEmpty()) }
    val giornoIniziale = remember(arg) { runCatching { LocalDate.parse(arg.removePrefix("nuova/")) }.getOrNull() ?: esistente?.data ?: LocalDate.now() }

    var data by rememberSaveable { mutableStateOf(giornoIniziale) }
    var idCommessa by rememberSaveable { mutableStateOf(esistente?.idCommessa ?: recenti.firstOrNull()?.id ?: "") }
    var conOrari by rememberSaveable { mutableStateOf(esistente?.let { it.inizio.isNotBlank() } ?: false) }
    var quante by rememberSaveable { mutableStateOf(esistente?.ore?.takeIf { it > 0 && !(esistente.inizio.isNotBlank()) } ?: 2.0) }
    var inizio by rememberSaveable { mutableStateOf(esistente?.inizio.orEmpty()) }
    var fine by rememberSaveable { mutableStateOf(esistente?.fine.orEmpty()) }
    var pausa by rememberSaveable { mutableStateOf(esistente?.pausaMinuti ?: 0) }
    var fatturabile by rememberSaveable { mutableStateOf<Boolean?>(esistente?.fatturabile) }
    var straordinarie by rememberSaveable { mutableStateOf(esistente?.straordinaria ?: false) }
    var idPrestazione by rememberSaveable { mutableStateOf(esistente?.idPrestazione.orEmpty()) }
    var idAttivita by rememberSaveable { mutableStateOf(esistente?.idAttivita.orEmpty()) }
    var descrizione by rememberSaveable { mutableStateOf(esistente?.descrizione.orEmpty()) }
    var errore by remember { mutableStateOf<String?>(null) }
    var finestraGiorno by remember { mutableStateOf(false) }
    var finestraOra by remember { mutableStateOf<String?>(null) }

    val fatt = fatturabile ?: idCommessa.isNotBlank()
    val calcolate = if (conOrari && inizio.isNotBlank() && fine.isNotBlank()) runCatching { ContiOreSpese.oreDaOrari(inizio, fine, pausa) } else null
    val prestazioni = if (idCommessa.isBlank()) emptyList() else ana.prestazioniDi(idCommessa)
    val attivitaCommessa = if (idCommessa.isBlank()) emptyList() else attivita.filter { it.idCommessa.equals(idCommessa, ignoreCase = true) && !it.fatta && !it.annullata }.take(6)

    fun salva() {
        errore = null
        val r = (esistente ?: RigaOre(idLocale = "")).copy(
            data = data,
            idCommessa = idCommessa,
            idPrestazione = idPrestazione.takeIf { id -> prestazioni.any { it.id == id } }.orEmpty(),
            idAttivita = idAttivita.takeIf { id -> attivitaCommessa.any { it.id == id } || id == esistente?.idAttivita }.orEmpty(),
            descrizione = descrizione.trim(),
            fatturabile = fatt,
            tipo = if (straordinarie) RigaOre.STRAORDINARIA else RigaOre.ORDINARIA,
        )
        val pronta = if (conOrari) {
            val k = try {
                ContiOreSpese.oreDaOrari(inizio, fine, pausa)
            } catch (e: ErroreOre) {
                errore = if (inizio.isBlank()) "Inizio: scrivi l'ora come 8:30" else if (fine.isBlank()) "Fine: scrivi l'ora come 17:30" else e.message
                return
            }
            r.copy(inizio = k.inizio, fine = k.fine, pausaMinuti = k.pausaMinuti, ore = k.ore)
        } else {
            if (!(quante > 0)) { errore = "Ore: scrivi quante ore hai lavorato"; return }
            r.copy(inizio = "", fine = "", pausaMinuti = 0, ore = quante)
        }
        dati.salvaOre(pronta)
        RicordoOre.riga = null
        RicordoOre.giorno = data
        nav.indietro()
        avvisi.mostra("Ore salvate")
    }

    fun togli() {
        val r = esistente ?: return
        ambitoFase3.launch {
            dati.togliOre(r)
                .onSuccess {
                    nav.indietro()
                    avvisi.mostra("Ore tolte", annulla = { ambitoFase3.launch { dati.togliOre(r, annulla = true).onFailure { e -> avvisi.mostra(spiegaErrore2(e, "Non sono tornate: riprova")) } } })
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non le ho tolte: riprova")) }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true) {
                if (esistente != null && esistente.puoScrivere) PulsanteTesto("Togli", { togli() }, colore = c.rossoTesto)
            }
            Text(
                when {
                    esistente?.dalTimer == true && esistente.stato == StatoVoce.BOZZA -> "Le ore del timer"
                    esistente != null -> "Correggi le ore"
                    else -> "Registra ore"
                },
                style = Testi.titoloPagina, color = c.testo,
            )
            if (esistente?.stato == StatoVoce.RESPINTA) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.rossoTenue).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Respinte" + if (esistente.approvataDaNome.isNotBlank()) " da ${esistente.approvataDaNome}" else "", style = Testi.forte, color = c.rossoTesto)
                    Text(esistente.motivoRifiuto, style = Testi.secondarioGrande, color = c.testo2)
                }
            }
            CampoQuando("Giorno", giornoEsteso(data).replaceFirstChar { it.uppercase() }, { finestraGiorno = true })

            Etichetta("Commessa")
            SceltaCommessa(ana, recenti, idCommessa, { idCommessa = it; idPrestazione = ""; idAttivita = "" }, conStudio = true)

            Segmenti(listOf(false to "Quante ore", true to "Inizio e fine"), conOrari, { conOrari = it; errore = null })
            if (!conOrari) {
                Scheda(orizzontale = 18.dp, verticale = 12.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Ore", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                        Stepper(Numeri.ore(quante), { quante = FilaOreSpese.passo(quante, -0.5) }, { quante = FilaOreSpese.passo(quante, 0.5) }, "lavoro")
                    }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CampoQuando("Inizio", inizio.ifBlank { null }?.removePrefix("0"), { finestraOra = "inizio" }, Modifier.weight(1f), icona = Icone.orologio)
                    CampoQuando("Fine", fine.ifBlank { null }?.removePrefix("0"), { finestraOra = "fine" }, Modifier.weight(1f), icona = Icone.orologio)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Pausa", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                    StepperMinuti(pausa, { pausa = it; errore = null }, "pausa")
                }
                calcolate?.let { k ->
                    k.onSuccess { o ->
                        Text(
                            Numeri.ore(o.ore) + if (o.giornoDopo) " · finisce il giorno dopo" else "",
                            style = Testi.titoloScheda, color = c.testo,
                        )
                    }.onFailure { e -> Text(e.message.orEmpty(), style = Testi.secondarioGrande, color = c.rossoTesto) }
                }
            }

            Segmenti(listOf(true to "Fatturabile", false to "Non fatturabile"), fatt, { fatturabile = it })
            RigaInterruttore("Straordinarie", straordinarie) { straordinarie = it }

            if (prestazioni.isNotEmpty()) {
                Etichetta("Prestazione")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    prestazioni.forEach { p -> Pillola(p.nome, p.id == idPrestazione, { idPrestazione = if (p.id == idPrestazione) "" else p.id }, altezza = 48.dp) }
                }
            }
            if (attivitaCommessa.isNotEmpty()) {
                Etichetta("Attività")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    attivitaCommessa.forEach { a -> Pillola(a.titolo, a.id == idAttivita, { idAttivita = if (a.id == idAttivita) "" else a.id }, altezza = 48.dp) }
                }
            }
            CampoTesto(descrizione, { descrizione = it }, "Cosa hai fatto", righe = 2)
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Salva", { salva() })
        }
    }

    if (finestraGiorno) FinestraGiorno(data, { data = it }, { finestraGiorno = false })
    finestraOra?.let { quale ->
        val attuale = (if (quale == "inizio") inizio else fine).let { ContiOreSpese.minutiDa(it) }?.let { LocalTime.of(it / 60, it % 60) }
            ?: if (quale == "inizio") LocalTime.of(8, 0) else LocalTime.now().withSecond(0).withNano(0)
        FinestraOra(attuale, if (quale == "inizio") "Inizio" else "Fine", { t ->
            val testo = "%02d:%02d".format(t.hour, t.minute)
            if (quale == "inizio") inizio = testo else fine = testo
            errore = null
        }, { finestraOra = null })
    }
}

// ---------------------------------------------------------------------------------- Da approvare

/**
 * Da approvare (fase3.md §5): gruppi per persona, la casella per riga (tutte
 * scelte all'inizio: si tolgono le eccezioni), le anomalie in giallo scuro,
 * Approva (N) giallo e Respingi col motivo obbligatorio, poi l'avviso con Annulla.
 */
@Composable
private fun PaginaDaApprovare(dati: Dati, testa: @Composable () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.daApprovare() }
    var elenco by remember { mutableStateOf<DaApprovare?>(null) }
    var scelte by remember { mutableStateOf(emptySet<String>()) }
    var motivoAperto by remember { mutableStateOf(false) }
    var motivo by remember { mutableStateOf("") }
    var erroreMotivo by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }
    LaunchedEffect(lettura) {
        (lettura as? Lettura.Pronta)?.dato?.let { d -> elenco = d; scelte = d.tutteLeChiavi() }
    }
    val d = elenco
    val voci = d?.scelte(scelte).orEmpty()

    fun dopo(fatte: List<VoceDaApprovare>, testo: String) {
        val chiavi = fatte.map { it.chiave }.toSet()
        elenco = elenco?.senza(chiavi)
        scelte = scelte - chiavi
        avvisi.mostra(testo, annulla = {
            ambitoFase3.launch {
                dati.annullaApprovazione(fatte)
                    .onSuccess { giro++ }
                    .onFailure { e -> avvisi.mostra(spiegaErrore2(e, "Non sono tornate da approvare: riprova")) }
            }
        })
    }

    fun approva() {
        if (voci.isEmpty()) { avvisi.mostra("Scegli cosa approvare"); return }
        if (inCorso) return
        inCorso = true
        val scelteOra = voci
        ambitoFase3.launch {
            dati.approva(scelteOra)
                .onSuccess { dopo(scelteOra, Testo.quanti(scelteOra.size, "approvata", "approvate")) }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non le ho approvate: riprova")) }
            inCorso = false
        }
    }

    fun respingi() {
        if (motivo.isBlank()) { erroreMotivo = "Scrivi il motivo: arriva a chi l'ha scritta"; return }
        val scelteOra = voci
        val perche = motivo
        motivoAperto = false
        inCorso = true
        ambitoFase3.launch {
            dati.respingi(scelteOra, perche)
                .onSuccess { motivo = ""; dopo(scelteOra, Testo.quanti(scelteOra.size, "respinta", "respinte") + ", col motivo") }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non le ho respinte: riprova")) }
            inCorso = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TestataMenu()
            testa()
            when {
                d == null && lettura is Lettura.Errore -> Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Text(lettura.messaggio, style = Testi.testo, color = c.testo2)
                    PulsanteBordo("Riprova", { giro++ }, Modifier.fillMaxWidth(), icona = Icone.riapri)
                }
                d == null -> { Segnaposto(90.dp); Segnaposto(220.dp) }
                d.voci.isEmpty() -> Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icone.spunta, null, tint = c.firmatoTesto, modifier = Modifier.size(20.dp))
                        Text("Niente da approvare.", style = Testi.forte, color = c.testo)
                    }
                }
                else -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            Testo.quanti(d.quante, "cosa", "cose") + if (d.conAnomalie > 0) " · ${d.conAnomalie} con un'anomalia" else "",
                            style = Testi.secondarioGrande, color = c.tenue, modifier = Modifier.weight(1f),
                        )
                        PulsanteTesto(if (d.voci.all { it.chiave in scelte }) "Togli la selezione" else "Seleziona tutto", { scelte = d.selezionaTutto(scelte) })
                    }
                    d.persone.forEach { p ->
                        Etichetta("${p.nome} · ${p.quante}")
                        SchedaElenco {
                            p.voci.forEachIndexed { i, v ->
                                if (i > 0) LineaElenco()
                                RigaDaApprovare(v, v.chiave in scelte) { scelte = if (v.chiave in scelte) scelte - v.chiave else scelte + v.chiave }
                            }
                        }
                    }
                }
            }
        }
        if (d != null && d.voci.isNotEmpty()) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    PulsanteBordo("Respingi", {
                        if (voci.isEmpty()) avvisi.mostra("Scegli cosa respingere") else { erroreMotivo = null; motivoAperto = true }
                    }, Modifier.weight(1f), altezza = 64.dp)
                    PulsantePrincipale("Approva (${voci.size})", { approva() }, Modifier.weight(2f), abilitato = voci.isNotEmpty())
                }
            }
        }
    }

    if (motivoAperto) {
        val chi = voci.map { it.idUtente }.distinct().singleOrNull()?.let { id -> d?.persone?.firstOrNull { it.idUtente == id }?.nome?.substringBefore(' ') }
        FoglioDalBasso({ motivoAperto = false }) {
            Text("Perché le respingi?", style = Testi.titoloScheda, color = c.testo)
            Text(
                "Il motivo arriva a ${chi ?: "chi le ha scritte"}, che può correggere e rimandare.",
                style = Testi.secondarioGrande, color = c.tenue,
            )
            CampoTesto(motivo, { motivo = it; erroreMotivo = null }, "Motivo", righe = 2, errore = erroreMotivo)
            PulsantePrincipale("Respingi", { respingi() })
            PulsanteTesto("Annulla", { motivoAperto = false }, Modifier.fillMaxWidth(), colore = c.testo)
        }
    }
}

/** Una cosa da approvare: la casella, cosa e quando, l'anomalia in giallo scuro, quanto a destra. */
@Composable
private fun RigaDaApprovare(v: VoceDaApprovare, scelta: Boolean, onCambia: () -> Unit) {
    val c = W.colori
    Row(
        Modifier.fillMaxWidth().heightIn(min = 68.dp).clickable(onClick = onCambia).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CasellaScelta(scelta, "${v.cosa} ${v.dettaglio}", onCambia)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("${v.cosa} · ${v.dettaglio}", style = Testi.forte, color = c.testo, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (v.anomalie.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icone.allarme, null, tint = c.gialloTesto, modifier = Modifier.size(14.dp))
                    Text(v.anomalie.joinToString(" · ") { it.testo }, style = Testi.secondario.copy(fontWeight = FontWeight.ExtraBold), color = c.gialloTesto)
                }
            } else if (v.km != null && v.km > 0) {
                Text(Numeri.scrivi(v.km) + " km", style = Testi.secondario, color = c.tenue)
            }
        }
        Text(v.quantoTesto, style = Testi.forte, color = c.testo, textAlign = TextAlign.End)
    }
}

// ---------------------------------------------------------------------------------- statistiche

/**
 * Le statistiche delle ore (§14.11, come pc/ui/ore.js): il mese per persona o per
 * commessa, con ore, fatturabili e percentuale; il costo solo con i soldi. Nella
 * barra la parte scura sono le ore fatturabili, la chiara le altre. Dal menu ⋯ di
 * Ore; il menu ⋯ di qui esporta le ore del mese.
 */
@Composable
fun SchermataStatisticheOre(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val soldi = LocalPermessi.current.costi
    var mese by rememberSaveable { mutableStateOf(RicordoOre.meseStatistiche) }
    var per by rememberSaveable { mutableStateOf("persona") }
    var giro by remember { mutableStateOf(0) }
    var menu by remember { mutableStateOf(false) }
    val esporta = rememberEsportaPerExcel(dati)
    val lettura = rememberLettura(mese to per, giro) { dati.statisticheOre(mese, per) }
    val nomeM = nomeMese(mese).substringBefore(' ').lowercase(ITALIA)
    LaunchedEffect(mese) { RicordoOre.meseStatistiche = mese }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 10.dp, bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() }) { PulsanteTondo(Icone.altro, "Altre azioni", { menu = true }) }
        TitoloPagina("Statistiche delle ore")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(nomeMese(mese), style = Testi.titoloScheda, color = c.testo, modifier = Modifier.weight(1f))
            PulsanteTondo(Icone.frecciaSinistra, "Mese prima", { mese = mese.minusMonths(1) })
            Spacer(Modifier.width(8.dp))
            PulsanteTondo(Icone.freccia, "Mese dopo", {
                if (mese.plusMonths(1).isAfter(YearMonth.now())) avvisi.mostra(nomeMese(mese.plusMonths(1)).substringBefore(' ') + " non è ancora cominciato")
                else mese = mese.plusMonths(1)
            })
        }
        Segmenti(listOf("persona" to "Per persona", "commessa" to "Per commessa"), per, { per = it })
        when (lettura) {
            is Lettura.InCorso -> { Segnaposto(96.dp); Segnaposto(96.dp) }
            is Lettura.Errore -> Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                Text(lettura.messaggio, style = Testi.testo, color = c.testo2)
                PulsanteBordo("Riprova", { giro++ }, Modifier.fillMaxWidth(), icona = Icone.riapri)
            }
            is Lettura.Pronta -> {
                val s = lettura.dato.takeIf { it.per == per }
                if (s == null) { Segnaposto(96.dp); Segnaposto(96.dp) }
                else if (s.righe.isEmpty()) SchedaElenco { RigaCalma("Nessuna ora a $nomeM.") }
                else {
                    SchedaElenco {
                        s.righe.forEachIndexed { i, r ->
                            if (i > 0) LineaElenco()
                            RigaStatistica(r, s.massimo, per == "commessa", soldi)
                        }
                    }
                    Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Legenda(c.testo, "Fatturabili")
                        Legenda(c.bordoCampo, "Non fatturabili")
                    }
                    s.totale?.takeIf { it.ore > 0 }?.let { t ->
                        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Totale", style = Testi.forte, color = c.testo)
                                testoStatistica(t, soldi).takeIf { it.isNotBlank() }?.let { Text(it, style = Testi.secondario, color = c.tenue) }
                            }
                            Text(Numeri.ore(t.ore), style = Testi.titoloScheda, color = c.testo)
                        }
                    }
                }
            }
        }
    }

    if (menu) {
        FoglioDalBasso({ menu = false }) {
            Text("Altre azioni", style = Testi.titoloScheda, color = c.testo)
            VoceMenu(Icone.scarica, "Esporta le ore di $nomeM", { menu = false; esporta("ore", mese.atDay(1), mese.atEndOfMonth(), "Le ore di $nomeM") })
        }
    }
}

/** "97% fatturabili · 1.111,00 €": la percentuale e, coi soldi, il costo (incompleto se manca un costo orario). */
private fun testoStatistica(r: RigaStatisticaOre, soldi: Boolean): String = listOfNotNull(
    r.percentuale?.let { "$it% fatturabili" },
    if (soldi) r.costo?.let { Numeri.euro(it) + if (!r.costoNoto) " (incompleto)" else "" } else null,
).joinToString(" · ")

/** Una persona o una commessa: il nome, le ore, la barra delle fatturabili sulle ore della riga più lunga. */
@Composable
private fun RigaStatistica(r: RigaStatisticaOre, massimo: Double, commessa: Boolean, soldi: Boolean) {
    val c = W.colori
    Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (commessa) CodiceOStudio(r.chiave)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    r.nome.ifBlank { if (commessa) (if (r.chiave.isBlank()) "Attività dello studio" else r.chiave) else "Senza nome" },
                    style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                if (commessa && r.cliente.isNotBlank()) Text(r.cliente, style = Testi.secondario, color = c.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
                testoStatistica(r, soldi).takeIf { it.isNotBlank() }?.let { Text(it, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            }
            Text(Numeri.ore(r.ore), style = Testi.forte, color = c.testo)
        }
        val tutte = if (massimo > 0) (r.ore / massimo).toFloat().coerceIn(0f, 1f) else 0f
        val fatt = if (massimo > 0) (r.fatturabili / massimo).toFloat().coerceIn(0f, tutte) else 0f
        Box(
            Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(c.superficie2)
                .semantics { contentDescription = Numeri.ore(r.fatturabili) + " fatturabili su " + Numeri.ore(r.ore) },
        ) {
            if (tutte > 0f) Box(Modifier.fillMaxWidth(tutte).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(c.bordoCampo))
            if (fatt > 0f) Box(Modifier.fillMaxWidth(fatt).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(c.testo))
        }
    }
}

@Composable
private fun Legenda(colore: Color, testo: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(colore))
        Text(testo, style = Testi.secondario, color = W.colori.testo2)
    }
}
