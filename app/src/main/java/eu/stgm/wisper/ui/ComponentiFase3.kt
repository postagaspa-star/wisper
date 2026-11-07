@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Anagrafiche
import eu.stgm.wisper.rapportino.Destinazione
import eu.stgm.wisper.rapportino.FilaOreSpese
import eu.stgm.wisper.rapportino.Stampa
import eu.stgm.wisper.rapportino.StatoVoce
import eu.stgm.wisper.rapportino.TimerAcceso
import eu.stgm.wisper.rapportino.TimerLetto
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

/*
 * I pezzi comuni delle schermate della fase 3 (ore, timer, approvazioni, spese),
 * nello stile del prototipo docs/prototipo/Gestionale-fase3.html.
 */

/** Una pillola con una parola, che va a capo in due righe al massimo ("Respinta: motivo"). */
@Composable
internal fun PillolaParola(testo: String, colore: Color, fondo: Color, modifier: Modifier = Modifier, righe: Int = 1) {
    Text(
        testo, style = Testi.pillola.copy(fontWeight = FontWeight.ExtraBold), color = colore, maxLines = righe, overflow = TextOverflow.Ellipsis,
        modifier = modifier.clip(RoundedCornerShape(if (righe > 1) 10.dp else 50.dp)).background(fondo).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** Lo stato di ore, spese e trasferte (§14.1): niente per le approvate; Bozza grigia, Da approvare gialla, Respinta rossa col motivo. */
@Composable
internal fun PillolaStatoVoce(stato: String, motivo: String = "", modifier: Modifier = Modifier) {
    val c = W.colori
    val parola = StatoVoce.parola(stato, motivo)
    if (parola.isBlank()) return
    when (stato) {
        StatoVoce.DA_APPROVARE -> PillolaParola(parola, c.gialloTesto, c.gialloTenue, modifier)
        StatoVoce.RESPINTA -> PillolaParola(parola, c.rossoTesto, c.rossoTenue, modifier, righe = 2)
        else -> PillolaParola(parola, c.testo2, c.superficie2, modifier)
    }
}

/** A chi va una spesa: Al cliente blu, Allo studio grigia, Mia viola. Sempre con la parola. */
@Composable
internal fun PillolaDestinazione(destinazione: String, modifier: Modifier = Modifier) {
    val c = W.colori
    val (testo, fondo) = when (destinazione) {
        Destinazione.CLIENTE -> c.inviatoTesto to c.inviatoFondo
        Destinazione.PERSONALE -> c.violaTesto to c.violaFondo
        else -> c.testo2 to c.superficie2
    }
    PillolaParola(Destinazione.nome(destinazione), testo, fondo, modifier)
}

/** Il quadratino con l'icona a sinistra di una riga (categoria della spesa, trasferta). */
@Composable
internal fun IconaRiga(icona: androidx.compose.ui.graphics.vector.ImageVector, blu: Boolean = false) {
    val c = W.colori
    Box(
        Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(if (blu) c.inviatoFondo else c.superficie2),
        contentAlignment = Alignment.Center,
    ) { Icon(icona, null, tint = if (blu) c.inviatoTesto else c.testo2, modifier = Modifier.size(20.dp)) }
}

/** L'icona della categoria di una spesa. */
internal fun iconaCategoria(categoria: String) = when (categoria) {
    "carburante", "taxi" -> Icone.auto
    else -> Icone.scontrino
}

/** La nuvola piccola: questa cosa è ancora sul telefono e parte appena c'è rete. */
@Composable
internal fun NuvolaInCoda() {
    Icon(Icone.nuvola, null, tint = W.colori.tenue, modifier = Modifier.size(16.dp).semantics { contentDescription = "Ancora sul telefono" })
}

/** Il codice della commessa nella pillola nera; "Studio" grigia per le ore senza commessa. */
@Composable
internal fun CodiceOStudio(idCommessa: String) {
    if (idCommessa.isNotBlank()) CodiceCommessa(idCommessa)
    else {
        val c = W.colori
        Text(
            "Studio", style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.testo2,
            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(c.superficie2).padding(horizontal = 9.dp, vertical = 4.dp),
        )
    }
}

/**
 * La commessa scelta fra le recenti, come schede a tocco (fase3.md §2, punto 3):
 * le pillole con il codice, "Studio" se servono le attività dello studio, e
 * "Altra" che apre l'elenco con la ricerca. [scelta]: il codice, "" = studio,
 * null = nessuna scelta ancora.
 */
@Composable
internal fun SceltaCommessa(
    ana: Anagrafiche,
    recenti: List<FilaOreSpese.CommessaRecente>,
    scelta: String?,
    onScelta: (String) -> Unit,
    conStudio: Boolean,
    etichettaStudio: String = "Studio",
    abilitata: Boolean = true,
) {
    var altra by remember { mutableStateOf(false) }
    // La commessa scelta da "Altra" resta fra le schede, così si vede quale è.
    val mostrate = (recenti.map { it.id } + listOfNotNull(scelta?.takeIf { it.isNotBlank() && recenti.none { r -> r.id.equals(it, ignoreCase = true) } }))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        mostrate.forEach { id ->
            Pillola(id, scelta.equals(id, ignoreCase = true), { if (abilitata) onScelta(id) }, altezza = 48.dp)
        }
        if (conStudio) Pillola(etichettaStudio, scelta == "", { if (abilitata) onScelta("") }, altezza = 48.dp)
        if (abilitata) Pillola("Altra", false, { altra = true }, altezza = 48.dp)
    }
    val nome = scelta?.takeIf { it.isNotBlank() }?.let { ana.commessa(it) }?.let { m -> m.descrizione + (ana.cliente(m.idCliente)?.nome?.let { " · $it" } ?: "") }
    if (nome != null) Text(nome, style = Testi.secondario, color = W.colori.tenue, maxLines = 1, overflow = TextOverflow.Ellipsis)
    if (altra) FoglioSceltaCommessa(ana, scelta.orEmpty(), { onScelta(it); altra = false }, { altra = false })
}

/** Le commesse aperte dal basso, con la ricerca. */
@Composable
internal fun FoglioSceltaCommessa(ana: Anagrafiche, scelta: String, onScelta: (String) -> Unit, onChiudi: () -> Unit) {
    val c = W.colori
    var cerca by remember { mutableStateOf("") }
    val t = Anagrafiche.normalizza(cerca)
    val lista = ana.commesse.filter { it.aperta && !it.archiviata && !it.modello }
        .filter { m -> t.isEmpty() || Anagrafiche.normalizza(listOf(m.id, m.descrizione, ana.cliente(m.idCliente)?.nome.orEmpty()).joinToString(" ")).contains(t) }
        .sortedByDescending { it.id }
    FoglioDalBasso(onChiudi) {
        Text("Commessa", style = Testi.titoloScheda, color = c.testo)
        CampoCerca(cerca, { cerca = it }, "Codice, nome, cliente")
        Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            if (lista.isEmpty()) RigaCalma("Nessuna commessa aperta")
            lista.forEachIndexed { i, m ->
                RigaVoce(
                    m.descrizione, sotto = listOfNotNull(m.id, ana.cliente(m.idCliente)?.nome).joinToString(" · "), freccia = false,
                    fine = if (m.id.equals(scelta, ignoreCase = true)) ({ Icon(Icone.spunta, "Scelta", tint = c.testo, modifier = Modifier.size(20.dp)) }) else null,
                    onClick = { onScelta(m.id) },
                )
                if (i < lista.lastIndex) LineaElenco()
            }
        }
    }
}

// 07/11/2026: via la scheda del timer acceso (le Ore non ci sono più).

/** La casella di una riga da scegliere (Da approvare): vuota col bordo, piena e scura con la spunta. */
@Composable
internal fun CasellaScelta(scelta: Boolean, descrizione: String, onCambia: () -> Unit) {
    val c = W.colori
    Box(
        Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onCambia)
            .semantics { role = Role.Checkbox; selected = scelta; contentDescription = descrizione },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(if (scelta) c.testo else Color.Transparent)
                .border(2.dp, if (scelta) c.testo else c.bordoCampo, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) { if (scelta) Icon(Icone.spunta, null, tint = c.scheda, modifier = Modifier.size(16.dp)) }
    }
}

/**
 * Le azioni che finiscono dopo che la pagina se n'è andata (l'Annulla di un
 * avviso, un salvataggio mentre si torna indietro): non si fermano con la pagina.
 */
internal val ambitoFase3 = kotlinx.coroutines.MainScope()

/** Più e meno attorno a un numero di minuti (la pausa), a passi di 15. */
@Composable
internal fun StepperMinuti(minuti: Int, onCambia: (Int) -> Unit, cosa: String) {
    val c = W.colori
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier.size(52.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c.superficie2).clickable { onCambia((minuti - 15).coerceAtLeast(0)) }
                .semantics { contentDescription = "Meno 15 minuti di $cosa"; role = Role.Button },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.meno, null, tint = c.testo, modifier = Modifier.size(24.dp)) }
        Text("$minuti min", style = Testi.forteGrande, color = c.testo, modifier = Modifier.padding(horizontal = 4.dp))
        Box(
            Modifier.size(52.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c.superficie2).clickable { onCambia((minuti + 15).coerceAtMost(600)) }
                .semantics { contentDescription = "Più 15 minuti di $cosa"; role = Role.Button },
            contentAlignment = Alignment.Center,
        ) { Icon(Icone.piu, null, tint = c.testo, modifier = Modifier.size(24.dp)) }
    }
}

/**
 * L'esportazione per Excel di ore, spese, trasferte e rimborsi (§14.14): il server
 * prepara il CSV, il telefono lo passa a Condividi di Android (come i PDF), da dove
 * si manda o si salva. Si chiama dai menu ⋯ delle pagine; un tocco alla volta.
 */
@Composable
fun rememberEsportaPerExcel(dati: Dati): EsportaPerExcel {
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var inCorso by remember { mutableStateOf(false) }
    return EsportaPerExcel { cosa, da, a, nome, utente ->
        if (!inCorso) {
            inCorso = true
            avvisi.mostra("Preparo il file…")
            scope.launch {
                dati.esportaPeriodo(cosa, da, a, utente)
                    .onSuccess { f -> Stampa.condividi(ctx, f, "$nome per Excel", "text/csv") }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Il file non è pronto: riprova")) }
                inCorso = false
            }
        }
    }
}

/** [nome]: come si chiama il file nella condivisione ("Le ore di ottobre" diventa "Le ore di ottobre per Excel"). */
class EsportaPerExcel(private val avvia: (String, LocalDate?, LocalDate?, String, String) -> Unit) {
    operator fun invoke(cosa: String, da: LocalDate?, a: LocalDate?, nome: String, utente: String = "") = avvia(cosa, da, a, nome, utente)
}
