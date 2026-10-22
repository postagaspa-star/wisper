@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package eu.stgm.wisper.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Veicolo
import kotlinx.coroutines.launch
import java.time.LocalDate

/*
 * Amministrazione › Veicoli e rimborso km (fase3.md §5, §14.9): il veicolo, il
 * suo euro al km, l'anno delle tabelle ACI e il collegamento alla loro pagina.
 * Cambiare l'euro al km non riscrive le trasferte già scritte.
 */

@Composable
internal fun PaginaVeicoli(dati: Dati, nav: Navigatore, puo: Boolean) {
    val c = W.colori
    val ctx = LocalContext.current
    val avvisi = LocalAvvisi.current
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro) { dati.veicoli(tutti = true) }
    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            TitoloPagina("Veicoli e rimborso km")
            when (lettura) {
                is Lettura.InCorso -> Segnaposto(140.dp)
                is Lettura.Errore -> Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Text(lettura.messaggio, style = Testi.testo, color = c.testo2)
                    PulsanteBordo("Riprova", { giro++ }, Modifier.fillMaxWidth(), icona = Icone.riapri)
                }
                is Lettura.Pronta -> {
                    val e = lettura.dato
                    val (attivi, vecchi) = e.veicoli.partition { it.attivo }
                    SchedaElenco {
                        if (attivi.isEmpty()) RigaCalma("Nessun veicolo")
                        attivi.forEachIndexed { i, v ->
                            if (i > 0) LineaElenco()
                            RigaVeicolo(v) { if (puo) nav.vai("amm/veicolo/${v.id}") }
                        }
                    }
                    if (vecchi.isNotEmpty()) {
                        Etichetta("Non più in uso")
                        SchedaElenco {
                            vecchi.forEachIndexed { i, v ->
                                if (i > 0) LineaElenco()
                                RigaVeicolo(v) { if (puo) nav.vai("amm/veicolo/${v.id}") }
                            }
                        }
                    }
                    if (e.paginaAci.isNotBlank()) {
                        SchedaElenco {
                            RigaVoce(
                                "Tabelle ACI" + (e.aciAnno?.let { " $it" } ?: ""), sotto = "I costi chilometrici sul sito dell'ACI", icona = Icone.auto,
                                onClick = {
                                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(e.paginaAci))) }
                                        .onFailure { avvisi.mostra("Sul telefono non c'è un browser per aprire la pagina") }
                                },
                            )
                        }
                    }
                }
            }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale("Nuovo veicolo", { nav.vai("amm/veicolo-nuovo") }, icona = Icone.piu)
            }
        }
    }
}

@Composable
private fun RigaVeicolo(v: Veicolo, onClick: () -> Unit) {
    RigaVoce(
        v.nome,
        sotto = listOfNotNull(
            v.euroKmTesto,
            v.annoAci?.let { "tabelle ACI $it" },
            v.alimentazione.ifBlank { null },
            if (v.trasferte > 0) Testo.quanti(v.trasferte, "trasferta", "trasferte") else null,
        ).joinToString(" · "),
        icona = Icone.auto,
        onClick = onClick,
    )
}

/** Un veicolo nuovo ([id] vuoto) o da cambiare. */
@Composable
internal fun PaginaVeicolo(dati: Dati, nav: Navigatore, id: String, puo: Boolean) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val lettura = rememberLettura(id, 0) { dati.veicoli(tutti = true) }
    val esistente = (lettura as? Lettura.Pronta)?.dato?.veicoli?.firstOrNull { it.id == id }
    if (id.isNotBlank() && esistente == null) {
        Column(Modifier.fillMaxSize().background(c.fondo).padding(MarginePagina), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            if (lettura is Lettura.InCorso) Segnaposto(200.dp) else RigaCalma((lettura as? Lettura.Errore)?.messaggio ?: "Questo veicolo non c'è più")
        }
        return
    }
    val annoAci = (lettura as? Lettura.Pronta)?.dato?.aciAnno ?: LocalDate.now().year
    var nome by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.nome.orEmpty()) }
    var alimentazione by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.alimentazione.orEmpty()) }
    var euroKm by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.euroKm?.let { java.text.DecimalFormat("0.00##", java.text.DecimalFormatSymbols(ITALIA)).format(it) }.orEmpty()) }
    var anno by rememberSaveable(esistente?.id) { mutableStateOf((esistente?.annoAci ?: annoAci).toString()) }
    var attivo by rememberSaveable(esistente?.id) { mutableStateOf(esistente?.attivo ?: true) }
    var errore by remember { mutableStateOf<String?>(null) }
    var inCorso by remember { mutableStateOf(false) }

    fun salva() {
        errore = null
        if (nome.isBlank()) { errore = "Nome: scrivi il nome del veicolo"; return }
        val e = Numeri.leggi(euroKm)
        if (euroKm.isNotBlank() && e == null) { errore = "Euro al km: scrivi un numero, per esempio 0,76"; return }
        if (e != null && e < 0) { errore = "Euro al km: non può essere negativo"; return }
        val a = anno.trim().toIntOrNull()
        if (a == null || a < 2000 || a > 2100) { errore = "Anno ACI: scrivi l'anno delle tabelle, per esempio 2026"; return }
        if (inCorso) return
        inCorso = true
        val v = (esistente ?: Veicolo()).copy(nome = nome.trim(), alimentazione = alimentazione.trim(), euroKm = e, annoAci = a, attivo = attivo)
        ambitoFase3.launch {
            dati.salvaVeicolo(v)
                .onSuccess {
                    nav.indietro()
                    // Le trasferte già scritte tengono l'euro al km di quando sono nate (§14.9): lo si dice quando conta.
                    val cambiato = esistente != null && esistente.trasferte > 0 && esistente.euroKm != e
                    avvisi.mostra(if (cambiato) "Veicolo salvato: le trasferte già scritte restano come sono" else "Veicolo salvato")
                }
                .onFailure { errore = spiegaErrore2(it, "Il veicolo non si è salvato: riprova") }
            inCorso = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() }, chiudi = true)
            TitoloPagina(if (esistente == null) "Nuovo veicolo" else esistente.nome)
            CampoTesto(nome, { nome = it; errore = null }, "Nome", abilitato = puo)
            CampoTesto(alimentazione, { alimentazione = it }, "Alimentazione", abilitato = puo)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("benzina", "gasolio", "ibrida", "elettrica", "GPL", "metano").forEach { a ->
                    Pillola(a.replaceFirstChar { it.uppercase() }, alimentazione.equals(a, ignoreCase = true), { if (puo) alimentazione = a }, altezza = 48.dp)
                }
            }
            CampoTesto(euroKm, { t -> if (t.all { it.isDigit() || it == ',' || it == '.' }) { euroKm = t; errore = null } }, "Euro al km", tastiera = KeyboardType.Decimal, suffisso = "€/km", abilitato = puo)
            CampoTesto(anno, { t -> if (t.all { it.isDigit() } && t.length <= 4) anno = t }, "Anno delle tabelle ACI", tastiera = KeyboardType.Number, abilitato = puo)
            if (esistente != null) RigaInterruttore("In uso", attivo) { if (puo) attivo = it }
            errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        }
        if (puo) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(if (inCorso) "Salvo…" else "Salva", { salva() })
            }
        }
    }
}
