package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.TipoQualifica
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/*
 * Amministrazione della fase 6 sul telefono (fase6.md §12.8): le impostazioni di persone,
 * mezzi e collaboratori, ognuna col suo Salva col bordo, e i tipi di formazione.
 */

/** I moduli che a un esterno non si danno (permessi.js VIETATI_ESTERNO): righe bloccate in Ruoli e permessi. */
internal val VIETATI_ESTERNO = setOf(
    "persone", "mezzi", "clienti", "preventivi", "fatturazione", "banche", "comunicazioni", "portale", "integrazioni", "amministrazione", "costi", "riservati",
)

/** I documenti che possono servire per l'idoneità di un collaboratore, coi nomi. */
private val DOCUMENTI_IDONEITA = listOf(
    "durc" to "DURC", "visura" to "Visura", "idoneita" to "Autocertificazione di idoneità", "polizza" to "Polizza", "albo" to "Iscrizione all'albo",
)

private val TIPI_COLLABORATORE = listOf("impresa" to "Impresa", "professionista" to "Professionista", "occasionale" to "Occasionale")

/**
 * Persone, mezzi e collaboratori: santo patrono, conservazione, saldo; tarature (ogni
 * quanto, preavviso, "Con la taratura scaduta: Avviso e conferma · Non si usa"); DURC,
 * visura, accesso degli esterni, documenti che servono; avviso del tagliando.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PaginaImpostazioniFase6(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val ana by dati.anagrafiche.collectAsStateWithLifecycle()
    fun v(k: String) = ana.impostazione(k)
    var patrono by remember { mutableStateOf(v("FESTA_PATRONO")) }
    var conserva by remember { mutableStateOf(v("PERSONE_CONSERVA_ANNI")) }
    var saldo by remember { mutableStateOf(v("SALDO_AVVISO_GIORNI")) }
    var ogni by remember { mutableStateOf(v("TARATURA_OGNI_MESI")) }
    var preavviso by remember { mutableStateOf(v("TARATURA_PREAVVISO_GIORNI")) }
    var blocco by remember { mutableStateOf(if (v("TARATURA_BLOCCO") == "blocco") "blocco" else "avviso") }
    var durc by remember { mutableStateOf(v("DURC_GIORNI")) }
    var visura by remember { mutableStateOf(v("VISURA_MESI")) }
    var esterni by remember { mutableStateOf(v("ACCESSO_ESTERNI_GIORNI")) }
    var tagliando by remember { mutableStateOf(v("KM_TAGLIANDO_AVVISO")) }
    var documenti by remember {
        mutableStateOf<Map<String, List<String>>>(
            runCatching { JSONObject(v("COLLAB_DOCUMENTI").ifBlank { "{}" }) }.getOrDefault(JSONObject()).let { o ->
                TIPI_COLLABORATORE.associate { (t, _) -> t to (o.optJSONArray(t)?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()) }
            },
        )
    }
    val soloCifre = { t: String -> t.all { it.isDigit() } }
    fun salva(valori: Map<String, String>, frase: String) {
        ambitoAmm.launch {
            dati.salvaImpostazioni(valori).fold(onSuccess = { avvisi.mostra(frase) }, onFailure = { avvisi.mostra(spiegaErrore2(it, "Non si è salvato: riprova")) })
        }
    }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Persone, mezzi e collaboratori")

        Etichetta("Persone")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoTesto(patrono, { patrono = it }, "Santo patrono", segnaposto = "mm-gg, per esempio 07-01", abilitato = puo)
            CampoTesto(conserva, { if (soloCifre(it)) conserva = it }, "Conservazione dopo l'uscita", tastiera = KeyboardType.Number, suffisso = "anni", abilitato = puo)
            CampoTesto(saldo, { if (soloCifre(it)) saldo = it }, "Saldo da aggiornare dopo", tastiera = KeyboardType.Number, suffisso = "giorni", abilitato = puo)
            if (puo) PulsanteBordo("Salva", {
                if (patrono.isNotBlank() && !Regex("""\d{2}-\d{2}""").matches(patrono.trim())) avvisi.mostra("Santo patrono: scrivi mese e giorno, per esempio 07-01")
                else salva(mapOf("FESTA_PATRONO" to patrono.trim(), "PERSONE_CONSERVA_ANNI" to conserva, "SALDO_AVVISO_GIORNI" to saldo), "Salvato: vale per i conti di ferie e presenze")
            }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }

        Etichetta("Tarature e verifiche")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoTesto(ogni, { if (soloCifre(it)) ogni = it }, "Ogni, per gli strumenti nuovi", tastiera = KeyboardType.Number, suffisso = "mesi", abilitato = puo)
            CampoTesto(preavviso, { if (soloCifre(it)) preavviso = it }, "Preavviso", tastiera = KeyboardType.Number, suffisso = "giorni", abilitato = puo)
            Etichetta("Con la taratura scaduta")
            Segmenti(listOf("avviso" to "Avviso e conferma", "blocco" to "Non si usa"), blocco, { if (puo) blocco = it })
            if (puo) PulsanteBordo("Salva", {
                salva(
                    mapOf("TARATURA_OGNI_MESI" to ogni, "TARATURA_PREAVVISO_GIORNI" to preavviso, "TARATURA_BLOCCO" to blocco),
                    if (blocco == "blocco") "Salvato: uno strumento scaduto non si sceglie più nei rapportini" else "Salvato: uno strumento scaduto si usa solo confermando",
                )
            }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }

        Etichetta("Collaboratori esterni")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoTesto(durc, { if (soloCifre(it)) durc = it }, "Un DURC vale", tastiera = KeyboardType.Number, suffisso = "giorni", abilitato = puo)
            CampoTesto(visura, { if (soloCifre(it)) visura = it }, "La visura al massimo di", tastiera = KeyboardType.Number, suffisso = "mesi", abilitato = puo)
            CampoTesto(esterni, { if (soloCifre(it)) esterni = it }, "Accesso degli esterni senza incarichi", tastiera = KeyboardType.Number, suffisso = "giorni", abilitato = puo)
            Text("I documenti che servono per l'idoneità", style = Testi.forte, color = c.testo)
            TIPI_COLLABORATORE.forEach { (tipo, nome) ->
                Etichetta(nome)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    DOCUMENTI_IDONEITA.forEach { (k, n) ->
                        val scelto = k in documenti[tipo].orEmpty()
                        Pillola(n, scelto, {
                            if (puo) documenti = documenti + (tipo to (if (scelto) documenti[tipo].orEmpty() - k else documenti[tipo].orEmpty() + k))
                        }, altezza = 48.dp)
                    }
                }
            }
            if (puo) PulsanteBordo("Salva", {
                val o = JSONObject().apply { documenti.forEach { (t, l) -> put(t, JSONArray(l)) } }
                salva(
                    mapOf("DURC_GIORNI" to durc, "VISURA_MESI" to visura, "ACCESSO_ESTERNI_GIORNI" to esterni, "COLLAB_DOCUMENTI" to o.toString()),
                    "Salvato: l'idoneità si rifà coi documenti nuovi",
                )
            }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }

        Etichetta("Mezzi")
        Scheda(orizzontale = 18.dp, verticale = 16.dp, raggio = 22.dp, spazio = 12.dp) {
            CampoTesto(tagliando, { if (soloCifre(it)) tagliando = it }, "Avviso del tagliando a km", tastiera = KeyboardType.Number, suffisso = "km prima", abilitato = puo)
            if (puo) PulsanteBordo("Salva", { salva(mapOf("KM_TAGLIANDO_AVVISO" to tagliando), "Salvato") }, Modifier.fillMaxWidth(), altezza = 48.dp)
        }
    }
}

private val GRUPPI_FORMAZIONE = listOf("elettrico" to "Lavori elettrici", "sicurezza" to "Sicurezza", "emergenza" to "Emergenza", "altro" to "Altro")

/** I tipi di formazione e abilitazione (§5.3): ogni quanto e il preavviso; Nuovo tipo col bordo. */
@Composable
fun PaginaTipiFormazione(dati: Dati, puo: Boolean, onIndietro: () -> Unit) {
    val c = W.colori
    var giro by remember { mutableIntStateOf(0) }
    val lettura = rememberLettura("tipi-formazione", giro) { dati.fase6.qualificheTipi() }
    var aperto by remember { mutableStateOf<TipoQualifica?>(null) }
    var nuovo by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = onIndietro)
        TitoloPagina("Tipi di formazione")
        when (lettura) {
            is Lettura.Pronta -> SchedaElenco {
                if (lettura.dato.isEmpty()) RigaCalma("Nessun tipo di formazione.")
                lettura.dato.forEachIndexed { i, t ->
                    if (i > 0) LineaElenco()
                    RigaVoce(
                        t.nome,
                        sotto = listOfNotNull(
                            GRUPPI_FORMAZIONE.firstOrNull { it.first == t.gruppo }?.second ?: t.gruppo,
                            t.ogniMesi?.let { "ogni $it mesi" } ?: "non scade",
                            t.preavvisoGiorni?.takeIf { it > 0 }?.let { "preavviso $it giorni" },
                        ).joinToString(" · "),
                        icona = Icone.formazione,
                        fine = if (!t.attivo) ({ ParolaGrigia("Non in uso") }) else null,
                        onClick = if (puo) ({ aperto = t }) else null,
                    )
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
        if (puo) PulsanteBordo("Nuovo tipo", { nuovo = true }, Modifier.fillMaxWidth(), icona = Icone.piu, altezza = 48.dp)
    }
    if (nuovo || aperto != null) FoglioTipoFormazione(dati, aperto, { nuovo = false; aperto = null }) { giro++ }
}

@Composable
private fun FoglioTipoFormazione(dati: Dati, t0: TipoQualifica?, onChiudi: () -> Unit, onFatto: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    var nome by remember { mutableStateOf(t0?.nome.orEmpty()) }
    var gruppo by remember { mutableStateOf(t0?.gruppo?.ifBlank { null } ?: "sicurezza") }
    var ogni by remember { mutableStateOf(t0?.ogniMesi?.toString().orEmpty()) }
    var preavviso by remember { mutableStateOf(t0?.preavvisoGiorni?.toString() ?: if (t0 == null) "60" else "") }
    var attivo by remember { mutableStateOf(t0?.attivo ?: true) }
    var errore by remember { mutableStateOf<String?>(null) }
    FoglioDalBasso(onChiudi) {
        Text(t0?.nome ?: "Nuovo tipo", style = Testi.titoloScheda, color = c.testo)
        CampoTesto(nome, { nome = it; errore = null }, "Nome")
        Etichetta("Gruppo")
        SegmentiScorrevoli(GRUPPI_FORMAZIONE, gruppo, { gruppo = it })
        CampoTesto(ogni, { if (it.all { ch -> ch.isDigit() }) ogni = it }, "Ogni", tastiera = KeyboardType.Number, suffisso = "mesi")
        CampoTesto(preavviso, { if (it.all { ch -> ch.isDigit() }) preavviso = it }, "Preavviso", tastiera = KeyboardType.Number, suffisso = "giorni")
        if (t0 != null) SceltaGrande("In uso", attivo, { attivo = !attivo }, casella = true)
        errore?.let { Text(it, style = Testi.secondarioGrande, color = c.rossoTesto) }
        PulsantePrincipale("Salva", {
            if (nome.isBlank()) { errore = "Nome: scrivi il nome della formazione o abilitazione"; return@PulsantePrincipale }
            val tipo = JSONObject().put("nome", nome.trim()).put("gruppo", gruppo)
                .put("ogniMesi", ogni.toIntOrNull() ?: JSONObject.NULL).put("preavvisoGiorni", preavviso.toIntOrNull() ?: JSONObject.NULL).put("attivo", attivo)
            if (t0 != null) tipo.put("chiave", t0.chiave)
            ambitoAmm.launch {
                dati.fase6.salvaQualificaTipo(tipo)
                    .onSuccess { onChiudi(); onFatto(); avvisi.mostra("Salvato: vale per la formazione nuova") }
                    .onFailure { errore = spiegaErrore2(it, "Non si è salvato: riprova") }
            }
        })
    }
}
