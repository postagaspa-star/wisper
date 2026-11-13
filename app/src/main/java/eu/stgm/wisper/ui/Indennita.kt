@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Indennita
import eu.stgm.wisper.rapportino.Servizi
import kotlinx.coroutines.launch

/*
 * Le indennità di un lavoro (1.4.0, docs/gestionale/servizi.md §2). "+ Indennità", l'ultima pillola di "Altro", apre
 * questa schermata sopra la pagina del rapportino: in cima si sceglie un servizio (prima quelli che si chiamano
 * "Indennità…"), i campi si riempiono e restano correggibili; sotto gli stessi campi della scheda di un servizio, più la
 * Quantità. Il servizio nei Servizi non cambia: l'indennità è una copia di quel giorno, come le regole del rapportino.
 *
 * Senza il permesso dei soldi i prezzi non si vedono e l'indennità vuole un servizio scelto: il prezzo lo mette il
 * server dal servizio.
 */

/** Le indennità del lavoro come righe: codice · descrizione, sotto quantità × prezzo = importo (i prezzi coi soldi). */
@Composable
internal fun RigheIndennita(lista: List<Indennita>, costi: Boolean, onApri: ((Int) -> Unit)?, onTogli: ((Int) -> Unit)?) {
    if (lista.isEmpty()) return
    val c = W.colori
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Indennità", style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
        SchedaElenco {
            lista.forEachIndexed { n, i ->
                if (n > 0) LineaElenco()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp)
                        .let { m -> if (onApri != null) m.clickable { onApri(n) } else m }
                        .padding(vertical = 8.dp).bersaglio("indennita-$n"),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(i.titolo.ifBlank { "Indennità" }, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(i.dettaglio(costi), style = Testi.secondario, color = c.tenue)
                    }
                    if (onTogli != null) PulsanteTondo(Icone.chiudi, "Togli ${i.descrizione.ifBlank { "l'indennità" }}", { onTogli(n) }, dimensione = 48.dp)
                }
            }
        }
    }
}

/**
 * La schermata di un'indennità, sopra tutta la pagina del rapportino. Si chiude con la X, con Indietro o salvando;
 * quello che c'è nel lavoro cambia solo con il pulsante giallo.
 */
@Composable
internal fun SchermataIndennita(dati: Dati, stato: ModuloStato, aperta: IndennitaAperta) {
    val c = W.colori
    val perm = LocalPermessi.current
    val costi = perm.costi
    val avvisi = remember { Avvisi() }
    val listino by dati.listino.collectAsStateWithLifecycle()
    val m = remember(aperta) { ModuloServizio.da(aperta.indennita) }
    // Il servizio da cui viene l'indennità (vuoto = scritta a mano) e i prezzi che aveva: senza i soldi restano quelli.
    var base by remember(aperta) { mutableStateOf(aperta.indennita) }
    var scegli by remember(aperta) { mutableStateOf(aperta.nuova && aperta.indennita.idServizio.isBlank()) }
    var cerca by remember { mutableStateOf("") }
    var chiediTogli by remember { mutableStateOf(false) }
    val scorri = rememberScrollState()
    val scope = rememberCoroutineScope()
    val tastiera = WindowInsets.isImeVisible
    LaunchedEffect(Unit) { dati.aggiornaServizi() }

    fun chiudi() { stato.indennitaAperta = null }
    BackHandler { chiudi() }

    val servizio = base.idServizio.takeIf { it.isNotBlank() }?.let { id -> listino.firstOrNull { it.id == id } }
    val nomeServizio = when {
        servizio != null -> listOf(servizio.codice, servizio.nome).filter { it.isNotBlank() }.joinToString(" · ")
        base.idServizio.isNotBlank() -> base.titolo.ifBlank { "Servizio scelto" }
        !aperta.nuova || m.descrizione.isNotBlank() -> "Scritta a mano"
        else -> "Scegli un servizio"
    }

    fun salva() {
        if (!costi && base.idServizio.isBlank()) {
            avvisi.mostra("Scegli un servizio")
            scegli = true
            return
        }
        m.errori(costi, prezzoObbligatorio = costi, conQuantita = true)?.let { e ->
            avvisi.mostra(e)
            // L'unità di misura sta in fondo (Dettagli): la pagina va lì, non in cima.
            scope.launch { scorri.animateScrollTo(if (e == m.erroreUnita) scorri.maxValue else 0) }
            return
        }
        stato.mettiIndennita(aperta.posizione, m.indennita(base, costi))
    }

    // Gli avvisi di questa schermata (anche quelli dell'immagine) si vedono qui, non nella pagina coperta.
    CompositionLocalProvider(LocalAvvisi provides avvisi) {
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Box(Modifier.weight(1f).fillMaxWidth().imePadding()) {
                Column(
                    Modifier.fillMaxSize().verticalScroll(scorri).padding(MarginePagina).padding(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Testata(onIndietro = { chiudi() }, chiudi = true)
                    TitoloPagina("Indennità", sopra = if (aperta.nuova) "Nuova" else null)
                    CampoScelta("Da Servizi e prodotti", nomeServizio, vuoto = base.idServizio.isBlank() && m.descrizione.isBlank()) { scegli = true }
                    CampiServizio(dati, m, costi, perIndennita = true, conQuantita = true, titoloPrima = null, prezzoObbligatorio = costi)
                    if (!aperta.nuova) PulsanteTesto("Togli l'indennità", { chiediTogli = true }, Modifier.fillMaxWidth(), colore = c.rossoTesto)
                }
                StratoAvvisi(avvisi, Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp))
            }
            // In basso: l'importo (coi soldi) e il pulsante; con la tastiera aperta si nasconde.
            if (!tastiera) Column(
                Modifier.fillMaxWidth().background(c.fondo)
                    .drawBehind { drawLine(c.bordoScheda, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
                    .navigationBarsPadding()
                    .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (costi) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        (Numeri4Indennita.quanto(m) + " × " + (m.prezzoLetto?.let { eu.stgm.wisper.rapportino.Numeri.euro(it) } ?: "—")),
                        style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.weight(1f),
                    )
                    EuroAnimati(m.importo, Testi.titoloScheda, Modifier.bersaglio("indennita-importo"))
                }
                PulsantePrincipale(
                    if (aperta.nuova) "Aggiungi l'indennità" else "Salva l'indennità", { salva() },
                    Modifier.bersaglio("indennita-salva"), icona = Icone.spunta,
                )
            }
        }
    }

    if (scegli) FoglioDalBasso({ scegli = false }) {
        Text("Servizi e prodotti", style = Testi.titoloScheda, color = c.testo)
        CampoCerca(cerca, { cerca = it }, "Descrizione, codice, tag")
        val voci = Servizi.perIndennita(listino, cerca)
        if (voci.isEmpty()) TestoVuoto(if (cerca.isBlank()) "Ancora nessun servizio o prodotto" else "Niente con questo nome")
        else Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            voci.forEachIndexed { n, v ->
                if (n > 0) LineaElenco()
                RigaServizio(v, costi, Modifier.bersaglio("indennita-servizio-$n")) {
                    base = base.copy(idServizio = v.id, prezzo = v.prezzo, prezzoAcquisto = v.prezzoAcquisto)
                    m.riempiDa(v)
                    scegli = false
                    cerca = ""
                }
            }
        }
        // A mano solo con i soldi: senza, il prezzo lo mette il server dal servizio.
        if (costi) PulsanteTesto("Scrivila a mano", {
            base = base.copy(idServizio = "")
            scegli = false
            cerca = ""
        }, Modifier.fillMaxWidth(), colore = c.testo)
    }
    }

    if (chiediTogli) FoglioConferma(
        "Togliere l'indennità?",
        "Esce dal lavoro quando salvi il rapportino.",
        "Togli", pericolo = true,
        onConferma = { chiediTogli = false; stato.togliIndennita(aperta.posizione) },
        onAnnulla = { chiediTogli = false },
    )
}

private object Numeri4Indennita {
    /** "2 Giorni", "1 Nr": la quantità (vuota = 1) con l'unità. */
    fun quanto(m: ModuloServizio): String = (eu.stgm.wisper.rapportino.Numeri.scrivi(m.quantitaLetta ?: 1.0) + " " + m.unita).trim()
}
