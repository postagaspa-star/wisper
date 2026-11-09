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
 * Rapportini (docs/gestionale/fase3.md §5, prototipo Gestionale-fase3.html, pagRapportini):
 * i segmenti Rapportini · Da approvare. Rapportini = l'elenco con la pillola
 * dell'approvazione; Da approvare = per chi approva (titolare e amministrazione, §14.1).
 * 07/11/2026, richiesta del titolare ("le Ore vanno tolte, non servono, metti solamente
 * i Rapportini"): via il segmento Ore, Registra ore, il timer e le statistiche delle ore.
 * Le ore gia' in coda sul telefono partono lo stesso (CodaInvii e InvioFase3 non cambiano).
 */

enum class SegmentoRapportini { RAPPORTINI, APPROVARE }

/** Il segmento della voce Rapportini mentre si va e si torna (e che la Dashboard sceglie). */
object RicordoRapportini {
    var segmento by mutableStateOf(SegmentoRapportini.RAPPORTINI)
}

@Composable
fun SchermataSezioneRapportini(
    dati: Dati, nav: Navigatore, filtro: FiltroRapportini, onFiltro: (FiltroRapportini) -> Unit,
    onNuovo: (java.time.LocalDate) -> Unit, onComeIeri: (eu.stgm.wisper.rapportino.Rapportino) -> Unit,
) {
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    val puoApprovare = sessione.puoApprovare
    val seg = RicordoRapportini.segmento.let { if (it == SegmentoRapportini.APPROVARE && !puoApprovare) SegmentoRapportini.RAPPORTINI else it }
    // Il numero del segmento: quello dell'elenco appena letto (senza le ore), se no quello della Dashboard.
    var lette by remember { mutableStateOf<Int?>(null) }
    val daApprovare = (lette ?: dashboard?.fase3?.approvare?.voci)?.takeIf { it > 0 }
    val testa: @Composable () -> Unit = {
        TitoloPagina("Rapportini")
        // 09/11/2026 (fai.md §2): la settimana coi giorni che mancano, il rapportino di oggi e Come ieri stanno qui.
        if (LocalPermessi.current.modifica(eu.stgm.wisper.rapportino.Moduli.RAPPORTINI) && seg == SegmentoRapportini.RAPPORTINI) {
            IlTuoGiorno(
                dati = dati, costi = LocalPermessi.current.costi, onNuovo = onNuovo, onComeIeri = onComeIeri,
                onApri = { nav.apriRapportino(it) }, onApriLavoro = { nav.apriRapportino(it, lavoro = true) },
                onMese = { onFiltro(FiltroRapportini()) }, onDaInviare = { }, soloGiorno = true,
            )
        }
        // Chi non approva ha solo i rapportini: niente segmenti da scegliere.
        if (puoApprovare) SegmentiScorrevoli(
            listOf(
                SegmentoRapportini.RAPPORTINI to "Rapportini",
                SegmentoRapportini.APPROVARE to ("Da approvare" + (daApprovare?.let { " · $it" } ?: "")),
            ),
            seg, { RicordoRapportini.segmento = it },
        )
    }
    when (seg) {
        SegmentoRapportini.RAPPORTINI -> SchermataRapportini(dati, nav, filtro, onFiltro, sopra = testa)
        SegmentoRapportini.APPROVARE -> PaginaDaApprovare(dati, testa) { lette = it }
    }
}

// ---------------------------------------------------------------------------------- Da approvare

/**
 * Da approvare (fase3.md §5): gruppi per persona, la casella per riga (tutte
 * scelte all'inizio: si tolgono le eccezioni), le anomalie in giallo scuro,
 * Approva (N) giallo e Respingi col motivo obbligatorio, poi l'avviso con Annulla.
 */
@Composable
private fun PaginaDaApprovare(dati: Dati, testa: @Composable () -> Unit, onQuante: (Int) -> Unit = {}) {
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
        // 07/11/2026: niente piu' ore, anche se il server di prima le manda ancora.
        (lettura as? Lettura.Pronta)?.dato?.senzaOre()?.let { d -> elenco = d; scelte = d.tutteLeChiavi() }
    }
    val d = elenco
    val voci = d?.scelte(scelte).orEmpty()
    LaunchedEffect(d?.quante) { d?.let { onQuante(it.quante) } }

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
                    // 07/11/2026: Respingi largo quanto serve (a un terzo, col carattere grande, diventava "Respi..."), Approva il resto.
                    PulsanteBordo("Respingi", {
                        if (voci.isEmpty()) avvisi.mostra("Scegli cosa respingere") else { erroreMotivo = null; motivoAperto = true }
                    }, altezza = 64.dp)
                    PulsantePrincipale("Approva (${voci.size})", { approva() }, Modifier.weight(1f), abilitato = voci.isNotEmpty())
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
            Text("${v.cosa} · ${v.dettaglio}", style = Testi.forte, color = c.testo)
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
