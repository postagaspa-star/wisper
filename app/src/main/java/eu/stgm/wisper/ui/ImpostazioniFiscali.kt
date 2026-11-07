package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.LaunchedEffect
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
 * documento, pagamento e la soglia della cassa. Dal 06/11/2026 ogni campo si salva
 * da solo; cambiare una regola fiscale toglie la conferma (lo fa il server, e un
 * avviso lo dice).
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
    val salvaDaSolo = rememberSalvaDaSolo()

    fun v(k: String, base: String) = imp[k]?.trim('"')?.takeIf { it.isNotBlank() && it != "null" } ?: base

    suspend fun salva(valori: Map<String, Any>): Result<*> {
        val eraConfermata = RegoleFiscali.da(dati.anagrafiche.value.impostazioni).confermate
        return dati.fase4.salvaImpostazioniFiscali(valori).onSuccess { nuove ->
            if (eraConfermata && !RegoleFiscali.da(nuove).confermate) avvisi.mostra("La conferma del commercialista va rifatta")
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = if (titolare && !regole.confermate) 130.dp else 48.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = onIndietro)
            TitoloPagina("Impostazioni fiscali")
            Scheda(Modifier.evidenziabile("CONFERMA_FISCALE"), orizzontale = 18.dp, verticale = 16.dp, spazio = 8.dp) {
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
                salvaDaSolo, "Aliquote", puoCambiare,
                listOf(Triple("IVA", "IVA", v("IVA", "22")), Triple("EPPI_INTEGRATIVO", "Contributo integrativo EPPI", v("EPPI_INTEGRATIVO", "5")), Triple("RITENUTA", "Ritenuta", v("RITENUTA", "20"))),
                "%",
            ) { salva(it) }
            val rivalsa = v("BOLLO_RIVALSA", "true") != "false"
            SchedaNumeri(
                salvaDaSolo, "Bollo", puoCambiare,
                listOf(Triple("BOLLO_SOGLIA", "Scatta sopra", v("BOLLO_SOGLIA", "77.47")), Triple("BOLLO_IMPORTO", "Importo", v("BOLLO_IMPORTO", "2"))),
                "€", extra = { SiNoSalvato(salvaDaSolo, "BOLLO_RIVALSA", "Lo riaddebito al cliente", rivalsa, puoCambiare) { salva(mapOf("BOLLO_RIVALSA" to it)) } },
            ) { salva(it) }
            var tipo by remember(imp) { mutableStateOf(v("TIPO_DOCUMENTO", "TD01")) }
            var regime by remember(imp) { mutableStateOf(v("REGIME_FISCALE", "RF01")) }
            Scheda(Modifier.evidenziabile("TIPO_DOCUMENTO"), orizzontale = 18.dp, verticale = 16.dp) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Documento", style = Testi.forteGrande, color = c.testo, modifier = Modifier.weight(1f))
                    SegnoSalvato(salvaDaSolo, "TIPO_DOCUMENTO")
                }
                Segmenti(listOf("TD01" to "Fattura TD01", "TD06" to "Parcella TD06"), tipo, { nuovo ->
                    if (puoCambiare && nuovo != tipo) {
                        val prima = tipo
                        tipo = nuovo
                        salvaDaSolo.subito("TIPO_DOCUMENTO", onFallito = { tipo = prima }) { salva(mapOf("TIPO_DOCUMENTO" to nuovo)) }
                    }
                })
                Segmenti(listOf("RF01" to "Ordinario", "RF19" to "Forfettario"), regime, { nuovo ->
                    if (puoCambiare && nuovo != regime) {
                        val prima = regime
                        regime = nuovo
                        salvaDaSolo.subito("TIPO_DOCUMENTO", onFallito = { regime = prima }) { salva(mapOf("REGIME_FISCALE" to nuovo)) }
                    }
                })
                salvaDaSolo.errori["TIPO_DOCUMENTO"]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
            }
            val fineMese = v("PAGAMENTO_FINE_MESE", "false") == "true"
            SchedaNumeri(
                salvaDaSolo, "Pagamento", puoCambiare, listOf(Triple("GIORNI_PAGAMENTO", "Giorni", v("GIORNI_PAGAMENTO", "30"))), "giorni", interi = true,
                extra = {
                    SiNoSalvato(salvaDaSolo, "PAGAMENTO_FINE_MESE", "Poi a fine mese", fineMese, puoCambiare) { salva(mapOf("PAGAMENTO_FINE_MESE" to it)) }
                    RigaDato("Modo", if (v("MODALITA_PAGAMENTO", "MP05") == "MP05") "Bonifico (MP05)" else v("MODALITA_PAGAMENTO", "MP05"))
                },
            ) { salva(it) }
            SchedaNumeri(salvaDaSolo, "Cassa", puoCambiare, listOf(Triple("SOGLIA_CASSA", "Soglia del saldo previsto", v("SOGLIA_CASSA", "3000"))), "€") { salva(it) }
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

/** Una scheda di numeri che si salvano da soli, uno per uno: i valori partono come numeri veri. */
@Composable
private fun SchedaNumeri(
    salva: SalvaDaSolo,
    titolo: String,
    puoCambiare: Boolean,
    campi: List<Triple<String, String, String>>,
    suffisso: String,
    interi: Boolean = false,
    extra: @Composable () -> Unit = {},
    onSalva: suspend (Map<String, Any>) -> Result<*>,
) {
    val c = W.colori
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        Text(titolo, style = Testi.forteGrande, color = c.testo)
        campi.forEach { (k, nome, valore) ->
            CampoSalvato(
                salva, k, Numeri.scrivi(Numeri.leggi(valore)), nome, abilitato = puoCambiare,
                tastiera = KeyboardType.Decimal, suffisso = suffisso,
                controlla = { t ->
                    val n = Numeri.leggi(t)
                    when {
                        n == null -> "Non è un numero"
                        n < 0 -> "Non può essere negativo"
                        interi && n != Math.floor(n) -> "Senza virgola"
                        else -> null
                    }
                },
            ) { t -> val n = Numeri.leggi(t)!!; onSalva(mapOf(k to if (interi) n.toInt() else n)) }
        }
        extra()
    }
}

/** Sì | No che si salva appena si tocca; se il server dice di no torna com'era. */
@Composable
private fun SiNoSalvato(salva: SalvaDaSolo, chiave: String, testo: String, valore: Boolean, puoCambiare: Boolean, onSalva: suspend (Boolean) -> Result<*>) {
    val c = W.colori
    var locale by remember(chiave) { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(valore) { if (locale == valore) locale = null }
    Column(Modifier.fillMaxWidth().evidenziabile(chiave)) {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(testo, style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
            SegnoSalvato(salva, chiave, Modifier.padding(horizontal = 8.dp))
            SiNo(locale ?: valore, { nuovo ->
                if (!puoCambiare || nuovo == (locale ?: valore)) return@SiNo
                locale = nuovo
                salva.subito(chiave, onFallito = { locale = null }) { onSalva(nuovo) }
            }, testo)
        }
        salva.errori[chiave]?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
    }
}
