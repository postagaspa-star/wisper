package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.RegoleFiscali
import eu.stgm.wisper.rapportino.Ruoli
import eu.stgm.wisper.rapportino.dataIt
import kotlinx.coroutines.launch
import java.time.LocalDate

/*
 * Amministrazione › Impostazioni fiscali (fase4.md §13.6, architettura.md §15.2): la
 * conferma del commercialista (la segna solo il titolare), aliquote, bollo,
 * documento, pagamento e la soglia della cassa. Ogni scheda ha il suo Salva col
 * bordo; cambiare una regola fiscale toglie la conferma (lo fa il server).
 */

@Composable
fun PaginaImpostazioniFiscali(dati: Dati, puoCambiare: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val imp = ana.impostazioni
    val regole = RegoleFiscali.da(imp)
    val titolare = sessione.utente.ruolo == Ruoli.TITOLARE && puoCambiare
    var conferma by remember { mutableStateOf(false) }

    fun v(k: String, base: String) = imp[k]?.trim('"')?.takeIf { it.isNotBlank() && it != "null" } ?: base

    fun salva(valori: Map<String, Any>) {
        val eraConfermata = regole.confermate
        scope.launch {
            dati.fase4.salvaImpostazioniFiscali(valori)
                .onSuccess { nuove ->
                    val ancora = RegoleFiscali.da(nuove).confermate
                    avvisi.mostra(if (eraConfermata && !ancora) "Fatto. La conferma del commercialista va rifatta" else "Fatto")
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "Non si è salvato: riprova")) }
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (titolare && !regole.confermate) 130.dp else 48.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onIndietro)
            TitoloPagina("Impostazioni fiscali")
            Scheda(orizzontale = 18.dp, verticale = 16.dp, spazio = 8.dp) {
                Text("Regole confermate dal commercialista", style = Testi.forteGrande, color = c.testo)
                if (regole.confermate) {
                    Pillolina("Confermate il ${dataIt(regole.confermateIl)}" + if (regole.commercialista.isNotBlank()) " da ${regole.commercialista}" else "", c.firmatoTesto, c.firmatoFondo)
                    if (titolare) PulsanteTesto("Togli la conferma", {
                        scope.launch { dati.fase4.confermaRegoleFiscali(null, "").onSuccess { avvisi.mostra("Conferma tolta") }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non è cambiato: riprova")) } }
                    })
                } else {
                    Pillolina("Non ancora", c.gialloTesto, c.gialloTenue)
                }
            }
            SchedaNumeri(
                "Aliquote", puoCambiare,
                listOf(Triple("IVA", "IVA", v("IVA", "22")), Triple("EPPI_INTEGRATIVO", "Contributo integrativo EPPI", v("EPPI_INTEGRATIVO", "5")), Triple("RITENUTA", "Ritenuta", v("RITENUTA", "20"))),
                "%",
            ) { salva(it) }
            var rivalsa by remember(imp) { mutableStateOf(v("BOLLO_RIVALSA", "true") != "false") }
            SchedaNumeri(
                "Bollo", puoCambiare,
                listOf(Triple("BOLLO_SOGLIA", "Scatta sopra", v("BOLLO_SOGLIA", "77.47")), Triple("BOLLO_IMPORTO", "Importo", v("BOLLO_IMPORTO", "2"))),
                "€", extra = { RigaSiNo("Lo riaddebito al cliente", rivalsa) { rivalsa = it } }, extraValori = { mapOf("BOLLO_RIVALSA" to rivalsa) },
            ) { salva(it) }
            var tipo by remember(imp) { mutableStateOf(v("TIPO_DOCUMENTO", "TD01")) }
            var regime by remember(imp) { mutableStateOf(v("REGIME_FISCALE", "RF01")) }
            Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                Text("Documento", style = Testi.forteGrande, color = c.testo)
                Segmenti(listOf("TD01" to "Fattura TD01", "TD06" to "Parcella TD06"), tipo, { if (puoCambiare) tipo = it })
                Segmenti(listOf("RF01" to "Ordinario", "RF19" to "Forfettario"), regime, { if (puoCambiare) regime = it })
                if (puoCambiare) PulsanteBordo("Salva", { salva(mapOf("TIPO_DOCUMENTO" to tipo, "REGIME_FISCALE" to regime)) }, Modifier.fillMaxWidth())
            }
            var fineMese by remember(imp) { mutableStateOf(v("PAGAMENTO_FINE_MESE", "false") == "true") }
            SchedaNumeri(
                "Pagamento", puoCambiare, listOf(Triple("GIORNI_PAGAMENTO", "Giorni", v("GIORNI_PAGAMENTO", "30"))), "giorni", interi = true,
                extra = {
                    RigaSiNo("Poi a fine mese", fineMese) { fineMese = it }
                    RigaDato("Modo", if (v("MODALITA_PAGAMENTO", "MP05") == "MP05") "Bonifico (MP05)" else v("MODALITA_PAGAMENTO", "MP05"))
                },
                extraValori = { mapOf("PAGAMENTO_FINE_MESE" to fineMese) },
            ) { salva(it) }
            SchedaNumeri("Cassa", puoCambiare, listOf(Triple("SOGLIA_CASSA", "Soglia del saldo previsto", v("SOGLIA_CASSA", "3000"))), "€") { salva(it) }
        }
        if (titolare && !regole.confermate) FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
            PulsantePrincipale("Segna confermate", { conferma = true }, icona = Icone.spunta)
        }
    }
    if (conferma) {
        var data by remember { mutableStateOf(LocalDate.now()) }
        var chi by remember { mutableStateOf("") }
        var errore by remember { mutableStateOf<String?>(null) }
        FoglioDalBasso({ conferma = false }) {
            Text("Regole confermate", style = Testi.titoloScheda, color = c.testo)
            PulsanteData("Il giorno della conferma", data) { data = it }
            CampoTesto(chi, { chi = it; errore = null }, "Commercialista", Modifier.fillMaxWidth(), errore = errore)
            PulsantePrincipale("Segna confermate", {
                if (chi.isBlank()) { errore = "Commercialista: scrivi chi ha controllato le regole"; return@PulsantePrincipale }
                scope.launch {
                    dati.fase4.confermaRegoleFiscali(data, chi).onSuccess { conferma = false; avvisi.mostra("Regole confermate") }.onFailure { errore = spiegaErrore2(it, "Non si è salvato: riprova") }
                }
            }, altezza = 56.dp)
        }
    }
}

/** Una scheda di numeri con Salva col bordo: i valori partono come numeri veri. */
@Composable
private fun SchedaNumeri(
    titolo: String,
    puoCambiare: Boolean,
    campi: List<Triple<String, String, String>>,
    suffisso: String,
    interi: Boolean = false,
    extra: @Composable () -> Unit = {},
    extraValori: () -> Map<String, Any> = { emptyMap() },
    onSalva: (Map<String, Any>) -> Unit,
) {
    val c = W.colori
    val valori = remember(campi) { mutableStateOf(campi.associate { it.first to Numeri.scrivi(Numeri.leggi(it.third)) }) }
    var errore by remember { mutableStateOf<String?>(null) }
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        Text(titolo, style = Testi.forteGrande, color = c.testo)
        campi.forEach { (k, nome, _) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                CampoTesto(valori.value[k].orEmpty(), { t -> valori.value = valori.value + (k to t); errore = null }, nome, Modifier.fillMaxWidth(),
                    tastiera = KeyboardType.Decimal, suffisso = suffisso, abilitato = puoCambiare)
            }
        }
        extra()
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        if (puoCambiare) PulsanteBordo("Salva", {
            val numeri = HashMap<String, Any>()
            for ((k, nome, _) in campi) {
                val n = Numeri.leggi(valori.value[k]) ?: run { errore = "$nome: non è un numero"; return@PulsanteBordo }
                if (n < 0) { errore = "$nome: non può essere negativo"; return@PulsanteBordo }
                numeri[k] = if (interi) n.toInt() else n
            }
            onSalva(numeri + extraValori())
        }, Modifier.fillMaxWidth())
    }
}
