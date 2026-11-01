package eu.stgm.wisper.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.ElencoIntegrazioni
import eu.stgm.wisper.rapportino.Integrazione
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Numeri
import eu.stgm.wisper.rapportino.Parole8
import eu.stgm.wisper.rapportino.SegmentoIntegrazioni
import eu.stgm.wisper.rapportino.VoceImpostazione
import kotlinx.coroutines.launch
import org.json.JSONObject

/*
 * 17 Integrazioni sul telefono (fase8.md §4.3, §15.1): l'elenco unico coi segmenti Tutti ·
 * Collegati · Da sistemare · Non collegati e i tre gruppi; la pagina di un collegamento con lo
 * stato vero, la storia dei controlli e Prova adesso. Nessun giallo nell'elenco; nella pagina
 * il giallo è Prova adesso solo se il collegamento è in Errore.
 */

@Composable
fun SchermataIntegrazioni(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val puo = scriveIntegrazioni()
    val vedeAmm = LocalPermessi.current.vede(Moduli.AMMINISTRAZIONE)
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.integrazioni * 1000) { dati.fase8.integrazioni() }
    var provo by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Integrazioni")
        when (lettura) {
            is Lettura.Pronta -> {
                val e = lettura.dato
                val segmento = RicordoIntegrazioni.segmento ?: e.segmentoIniziale
                // In cima, solo se c'è: la fascia rossa tenue del primo in Errore, con Prova adesso (§4.3).
                (e.errori.firstOrNull { it.chiave == "postino" } ?: e.errori.firstOrNull())?.let { x ->
                    Column(
                        Modifier.fillMaxWidth().background(c.rossoTenue, androidx.compose.foundation.shape.RoundedCornerShape(18.dp)).padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(e.fascia.takeIf { it.isNotBlank() && x.chiave == "postino" } ?: (x.nome + " · " + x.esito.ifBlank { "gli ultimi due controlli non sono riusciti" }),
                            style = Testi.forte.copy(fontWeight = FontWeight.Bold), color = c.rossoTesto)
                        if (puo && x.provaAdesso) PulsanteBordo(if (provo) "Provo…" else "Prova adesso", {
                            if (provo) return@PulsanteBordo
                            provo = true
                            scope.launch {
                                dati.fase8.provaIntegrazione(x.chiave)
                                    .onSuccess { n -> avvisi.mostra(n.nome + ": " + n.parola.lowercase()); giro++ }
                                    .onFailure { avvisi.mostra(spiegaErrore2(it, "La prova non è partita: riprova")) }
                                provo = false
                            }
                        })
                    }
                }
                SegmentiScorrevoli(
                    SegmentoIntegrazioni.entries.map { it to "${it.nome} · ${e.di(it).size}" }, segmento, { RicordoIntegrazioni.segmento = it },
                    bersagli = { "segmento-integrazioni-" + it.name.lowercase() },
                )
                val qui = e.di(segmento)
                if (qui.isEmpty()) RigaCalma("Niente qui.")
                ElencoIntegrazioni.GRUPPI.forEach { (g, nome) ->
                    val l = qui.filter { it.gruppo == g }
                    if (l.isNotEmpty()) Sezione5(nome, l.size) {
                        SchedaElenco {
                            l.forEachIndexed { i, x ->
                                if (i > 0) LineaElenco()
                                RigaIntegrazione(x) { nav.vai("integrazione/${x.chiave}") }
                            }
                        }
                    }
                }
                if (vedeAmm) SchedaElenco {
                    RigaVoce("Importa ed esporta", sotto = "File CSV ed Excel: in Amministrazione", icona = Icone.importa, onClick = { nav.vai("amm/importa") })
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
}

/** La pagina di un collegamento (§4.3): Cosa fa, Account, Cosa esce dal NAS, Costo, Regole del servizio, Ultimi controlli, Prova adesso. */
@Composable
fun SchermataIntegrazione(dati: Dati, nav: Navigatore, chiave: String) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val puo = scriveIntegrazioni()
    val amm2 = scriveAmministrazione()
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(chiave, giro + Giri8.integrazioni * 1000) { dati.fase8.integrazione(chiave) }
    var dopoProva by remember(chiave) { mutableStateOf<Integrazione?>(null) }
    var provo by remember { mutableStateOf(false) }
    val i = dopoProva ?: (lettura as? Lettura.Pronta)?.dato

    fun prova() {
        if (provo) return
        provo = true
        scope.launch {
            dati.fase8.provaIntegrazione(chiave)
                .onSuccess { n ->
                    // La risposta ha lo stato nuovo; i controlli si rileggono.
                    dopoProva = null
                    giro++
                    avvisi.mostra(if (n.inErrore) "Ancora in Errore: " + n.esito.ifBlank { "il controllo non è riuscito" } else n.parola + if (n.esito.isNotBlank()) " · " + n.esito else "")
                }
                .onFailure { avvisi.mostra(spiegaErrore2(it, "La prova non è partita: riprova")) }
            provo = false
        }
    }

    Box(Modifier.fillMaxSize().background(c.fondo)) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(MarginePagina)
                .padding(bottom = if (i?.inErrore == true && puo && i.provaAdesso) SpazioSottoBarra else 40.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Testata(onIndietro = { nav.indietro() })
            if (i == null) {
                TitoloPagina("Integrazioni")
                StatoLettura(lettura) { giro++ }
                return@Column
            }
            TitoloPagina(i.nome)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PillolaStato8(i.stato, i.gruppo)
                val q = if (i.senzaControlli) "" else listOf(Parole8.controllato(i.controllato), Parole8.tempo(i.millisecondi)).filter { it.isNotBlank() }.joinToString(" · ")
                if (q.isNotBlank()) Text(q, style = Testi.secondario, color = c.tenue)
            }
            if (!i.senzaControlli && i.vecchio) Text("da allora nessun controllo", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)
            if (i.ultimoFallito) Text("l'ultimo controllo non è riuscito", style = Testi.secondario.copy(fontWeight = FontWeight.Bold), color = c.gialloTesto)

            if (i.senzaControlli) {
                // Non collegato o in attesa di una scelta: niente che finga di collegare (§4.3).
                Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Text("Perché non è collegato", style = Testi.titoloSezione, color = c.testo)
                    if (i.perche.isNotBlank()) Text(i.perche, style = Testi.testo, color = c.testo)
                    Coppia("Cosa servirebbe", i.servirebbe.ifBlank { null })
                    Coppia("Costo se si volesse", i.costo.ifBlank { null })
                    Coppia("Cosa uscirebbe dal NAS", i.esce.ifBlank { null })
                    Coppia("Regole del servizio", i.regole.ifBlank { null })
                    if (i.gruppo == Parole8.G_SCELTA) Text(i.dipende.ifBlank { "Dipende da una scelta: è nelle domande della fase 8" }, style = Testi.secondario, color = c.tenue)
                }
            } else {
                Scheda(orizzontale = 18.dp, verticale = 16.dp) {
                    Text("Cosa fa", style = Testi.titoloSezione, color = c.testo)
                    if (i.cosa.isNotBlank()) Text(i.cosa, style = Testi.testo, color = c.testo)
                    // Due per riga, come nel prototipo: Ultimo controllo e Account, Cosa esce dal NAS e Costo, poi le Regole.
                    listOf("Ultimo controllo" to i.esito, "Account" to i.account, "Cosa esce dal NAS" to i.esce, "Costo" to i.costo, "Regole del servizio" to i.regole)
                        .filter { it.second.isNotBlank() }.chunked(2).forEach { coppie ->
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                coppie.forEach { (k, v) -> Box(Modifier.weight(1f)) { Coppia(k, v) } }
                                if (coppie.size == 1) Box(Modifier.weight(1f))
                            }
                        }
                }
                if (i.impostazioni.isNotEmpty() || i.chiave == "calendario" || i.chiave == "calendariofile" || i.chiave == "ricerca") {
                    ImpostazioniCollegamento(dati, i, puo, amm2, nav) { giro++ }
                }
                if (i.controlli.isNotEmpty()) Sezione5("Ultimi controlli") {
                    SchedaElenco {
                        i.controlli.take(20).forEachIndexed { n, x ->
                            if (n > 0) LineaElenco()
                            RigaVoce(
                                Parole8.quando(x.quando, sempreOra = true).replaceFirstChar { it.uppercase() },
                                sotto = listOf(x.testo.ifBlank { if (x.ok) "Riuscito" else "Non riuscito" }, Parole8.tempo(x.millisecondi).removePrefix("in ")).filter { it.isNotBlank() }.joinToString(" · "),
                                inizio = { IconaTinta(if (x.ok) Icone.spunta else Icone.allarme, if (x.ok) "verde" else "rosso") },
                            )
                        }
                    }
                }
                if (puo && i.provaAdesso && !i.inErrore) PulsanteBordo(if (provo) "Provo…" else "Prova adesso", { prova() }, Modifier.fillMaxWidth().bersaglio("prova-adesso"))
            }
        }
        if (i != null && puo && i.provaAdesso && i.inErrore && !i.senzaControlli) {
            FondoConPulsante(Modifier.align(Alignment.BottomCenter)) {
                PulsantePrincipale(if (provo) "Provo…" else "Prova adesso", { prova() }, Modifier.bersaglio("prova-adesso"), abilitato = !provo)
            }
        }
    }
}

/**
 * Le impostazioni di un collegamento (§4.3, §6.3): calendario (giorni, mesi, fuori casa),
 * ricerca (Cerca anche dentro i file, i MB, Rileggi tutto), portale. Salva col bordo.
 */
@Composable
private fun ImpostazioniCollegamento(dati: Dati, i: Integrazione, puo: Boolean, amm2: Boolean, nav: Navigatore, onSalvato: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val modifica = remember(i.chiave, i.impostazioni) { ModificaImpostazioni(i.impostazioni) }
    var salvo by remember { mutableStateOf(false) }
    var rileggo by remember { mutableStateOf(false) }
    Scheda(orizzontale = 18.dp, verticale = 16.dp) {
        Text("Impostazioni", style = Testi.titoloSezione, color = c.testo)
        // Quelle che toccano internet (il calendario fuori casa) vogliono anche Amministrazione: Modifica (§13.1).
        modifica.Campi(abilitato = { v -> puo && (v.chiave != "CALENDARIO_PUBBLICO" || amm2) })
        val errori = modifica.errori()
        errori.firstOrNull()?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        if (puo && i.impostazioni.isNotEmpty()) PulsanteBordo(if (salvo) "Salvo…" else "Salva", {
            if (salvo || errori.isNotEmpty()) return@PulsanteBordo
            salvo = true
            scope.launch {
                val valori = modifica.valori()
                if (valori.isEmpty()) { avvisi.mostra("Non hai cambiato niente"); salvo = false; return@launch }
                dati.fase8.salvaIntegrazione(i.chiave, impostazioni = valori)
                    .onSuccess { avvisi.mostra("Salvato"); onSalvato() }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stato salvato: riprova")) }
                salvo = false
            }
        }, Modifier.fillMaxWidth())
        if (i.chiave == "ricerca" && amm2) PulsanteBordo(if (rileggo) "Un momento…" else "Rileggi tutto", {
            if (rileggo) return@PulsanteBordo
            rileggo = true
            scope.launch {
                dati.fase8.rileggiFile(null)
                    .onSuccess { n -> avvisi.mostra(Numeri.scrivi(n.toDouble()) + " file da rileggere stanotte") }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è partito: riprova")) }
                rileggo = false
            }
        }, Modifier.fillMaxWidth())
        if (i.chiave == "calendario" || i.chiave == "calendariofile") PulsanteBordo("Apri Il calendario in altre app", { nav.vai("calendario-altre") }, Modifier.fillMaxWidth())
    }
}

// ---------------------------------------------------------------------------------- le impostazioni modificabili

/**
 * Le impostazioni come le manda il server, da cambiare e salvare (§9.4 e le impostazioni di
 * un collegamento): le parole, le unità, i limiti e i tipi sono del server (numero, testo,
 * testo_lungo, scelta, si_no, giorno_mese, ora, elenco, tempi_ticket, documenti_collaboratori,
 * sola_lettura). Si mandano solo quelle cambiate: il server le controlla di nuovo.
 */
internal class ModificaImpostazioni(val voci: List<VoceImpostazione>) {
    private val testi = mutableStateMapOf<String, String>()
    private val accesi = mutableStateMapOf<String, Boolean>()
    private val liste = mutableStateMapOf<String, Set<String>>()
    private val celle = mutableStateMapOf<String, String>()

    private fun tipo(v: VoceImpostazione): String = when (v.tipo) {
        "si", "si_no" -> "si"
        "sola", "sola_lettura" -> "sola"
        "tempi", "tempi_ticket" -> "tempi"
        else -> v.tipo
    }

    private fun righe(v: VoceImpostazione) = v.righe.ifEmpty { PRIORITA }
    private fun colonne(v: VoceImpostazione) = v.colonne.ifEmpty { listOf("presa" to "Presa in carico entro", "intervento" to "Intervento entro") }

    private fun oggetto(v: VoceImpostazione): JSONObject = (v.valore as? JSONObject) ?: runCatching { JSONObject(v.testo) }.getOrNull() ?: JSONObject()
    private fun elencoDi(x: Any?): Set<String> = when (x) {
        is org.json.JSONArray -> (0 until x.length()).map { x.optString(it) }.toSet()
        is String -> x.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        else -> emptySet()
    }

    init {
        voci.forEach { v ->
            when (tipo(v)) {
                "si" -> accesi[v.chiave] = v.acceso
                "elenco" -> liste[v.chiave] = elencoDi(v.valore)
                "tempi" -> { val o = oggetto(v); righe(v).forEach { (r, _) -> colonne(v).forEach { (k, _) -> celle["${v.chiave}|$r|$k"] = o.optJSONObject(r)?.opt(k)?.let { n -> if (n is Number) Numeri.scrivi(n.toDouble()) else n.toString() }.orEmpty() } } }
                "documenti_collaboratori" -> { val o = oggetto(v); righe(v).forEach { (r, _) -> liste["${v.chiave}|$r"] = elencoDi(o.opt(r)) } }
                else -> testi[v.chiave] = v.testo
            }
        }
    }

    /** Il valore di adesso di una voce, del tipo giusto per il server. */
    private fun valore(v: VoceImpostazione): Any? = when (tipo(v)) {
        "si" -> accesi[v.chiave] == true
        "numero" -> testi[v.chiave].orEmpty().trim().let { t -> if (t.isEmpty()) null else Numeri.leggi(t)?.let { n -> if (n == Math.floor(n) && kotlin.math.abs(n) < 1e9) n.toLong() else n } }
        "elenco" -> org.json.JSONArray(liste[v.chiave].orEmpty().sorted())
        "tempi" -> JSONObject().apply {
            righe(v).forEach { (r, _) -> put(r, JSONObject().apply { colonne(v).forEach { (k, _) -> put(k, Numeri.leggi(celle["${v.chiave}|$r|$k"].orEmpty()) ?: JSONObject.NULL) } }) }
        }
        "documenti_collaboratori" -> JSONObject().apply { righe(v).forEach { (r, _) -> put(r, org.json.JSONArray(liste["${v.chiave}|$r"].orEmpty().sorted())) } }
        else -> testi[v.chiave].orEmpty().trim()
    }

    /** Il valore come arrivato dal server, nella stessa forma (per sapere se è cambiato). */
    private fun originale(v: VoceImpostazione): Any? = when (tipo(v)) {
        "si" -> v.acceso
        "numero" -> v.testo.trim().let { t -> if (t.isEmpty()) null else Numeri.leggi(t)?.let { n -> if (n == Math.floor(n) && kotlin.math.abs(n) < 1e9) n.toLong() else n } }
        "elenco" -> org.json.JSONArray(elencoDi(v.valore).sorted())
        "tempi" -> JSONObject().apply { val o = oggetto(v); righe(v).forEach { (r, _) -> put(r, JSONObject().apply { colonne(v).forEach { (k, _) -> put(k, o.optJSONObject(r)?.optDouble(k)?.takeIf { !it.isNaN() } ?: JSONObject.NULL) } }) } }
        "documenti_collaboratori" -> JSONObject().apply { val o = oggetto(v); righe(v).forEach { (r, _) -> put(r, org.json.JSONArray(elencoDi(o.opt(r)).sorted())) } }
        else -> v.testo.trim()
    }

    private fun uguali(a: Any?, b: Any?): Boolean = when {
        a == null || b == null -> a == b
        a is Number && b is Number -> a.toDouble() == b.toDouble()
        else -> a.toString() == b.toString()
    }

    /** Le voci cambiate, coi valori da salvare (le sole da leggere mai). */
    fun valori(): Map<String, Any?> {
        val out = LinkedHashMap<String, Any?>()
        voci.filter { tipo(it) != "sola" }.forEach { v -> val x = valore(v); if (!uguali(x, originale(v))) out[v.chiave] = x }
        return out
    }

    fun cambiata(): Boolean = valori().isNotEmpty()

    /** I problemi, con la parola davanti ("Ore di lavoro al giorno: da 1 a 12"). */
    fun errori(): List<String> = voci.mapNotNull { v ->
        when (tipo(v)) {
            "numero" -> v.errore(testi[v.chiave].orEmpty())
            "tempi" -> righe(v).firstNotNullOfOrNull { (r, nome) ->
                val n = colonne(v).map { (k, _) -> Numeri.leggi(celle["${v.chiave}|$r|$k"].orEmpty()) }
                when {
                    n.any { it == null } -> "${v.etichetta}: scrivi le ore di $nome"
                    n.any { (v.min != null && it!! < v.min) || (v.max != null && it!! > v.max) } -> "${v.etichetta}, $nome: da ${Numeri.scrivi(v.min ?: 0.0)} a ${Numeri.scrivi(v.max ?: 0.0)} ore"
                    n.size >= 2 && n[1]!! < n[0]!! -> "${v.etichetta}: per $nome l'intervento non può venire prima della presa in carico"
                    else -> null
                }
            }
            "elenco" -> if (liste[v.chiave].isNullOrEmpty()) "${v.etichetta}: lascia almeno un tipo" else null
            "ora" -> testi[v.chiave].orEmpty().trim().let { t -> if (t.isNotEmpty() && !Regex("""^([01]?\d|2[0-3]):[0-5]\d$""").matches(t)) "${v.etichetta}: un'ora, per esempio 08:00" else null }
            "giorno_mese" -> testi[v.chiave].orEmpty().trim().let { t -> if (t.isNotEmpty() && !Regex("""^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$""").matches(t)) "${v.etichetta}: mese e giorno, per esempio 07-07" else null }
            else -> null
        }
    }

    @OptIn(ExperimentalLayoutApi::class)
    @Composable
    fun Campi(abilitato: (VoceImpostazione) -> Boolean = { true }) {
        val c = W.colori
        voci.forEach { v ->
            val si = abilitato(v)
            when (tipo(v)) {
                "si" -> Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(v.etichetta, style = Testi.forte, color = c.testo, modifier = Modifier.weight(1f))
                    Interruttore(accesi[v.chiave] == true, { if (si) accesi[v.chiave] = it }, v.etichetta)
                }
                "scelta" -> Domanda(v.etichetta) { SceltePillole(v.scelte, testi[v.chiave], { if (si) testi[v.chiave] = it }) }
                "sola" -> Coppia(v.etichetta, v.testo)
                "elenco" -> Domanda(v.etichetta) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        v.scelte.forEach { (k, nome) ->
                            val dentro = k in liste[v.chiave].orEmpty()
                            Pillola(nome, dentro, { if (si) liste[v.chiave] = if (dentro) liste[v.chiave].orEmpty() - k else liste[v.chiave].orEmpty() + k }, altezza = 46.dp)
                        }
                    }
                }
                "documenti_collaboratori" -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(v.etichetta, style = Testi.forte, color = c.testo)
                    righe(v).forEach { (r, nomeRiga) ->
                        Text(nomeRiga, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo2)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            v.scelte.forEach { (k, nome) ->
                                val chiave = "${v.chiave}|$r"
                                val dentro = k in liste[chiave].orEmpty()
                                Pillola(nome, dentro, { if (si) liste[chiave] = if (dentro) liste[chiave].orEmpty() - k else liste[chiave].orEmpty() + k }, altezza = 46.dp)
                            }
                        }
                    }
                }
                "tempi" -> Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(v.etichetta + if (v.unita.isNotBlank()) ", in ${v.unita}" else "", style = Testi.forte, color = c.testo)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Priorità", style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.width(78.dp))
                        colonne(v).forEach { (_, nome) -> Text(nome, style = Testi.piccolo.copy(fontWeight = FontWeight.Bold), color = c.tenue, modifier = Modifier.weight(1f)) }
                    }
                    righe(v).forEach { (r, nome) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(nome, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo, modifier = Modifier.width(78.dp))
                            colonne(v).forEach { (k, _) ->
                                val chiave = "${v.chiave}|$r|$k"
                                CampoTesto(celle[chiave].orEmpty(), { celle[chiave] = it }, null, Modifier.weight(1f), tastiera = KeyboardType.Number, suffisso = "h", abilitato = si)
                            }
                        }
                    }
                }
                "numero" -> CampoTesto(
                    testi[v.chiave].orEmpty(), { testi[v.chiave] = it }, v.etichetta, Modifier.fillMaxWidth(),
                    tastiera = KeyboardType.Decimal, suffisso = v.unita.ifBlank { null }, abilitato = si, errore = v.errore(testi[v.chiave].orEmpty()),
                )
                "email" -> CampoTesto(testi[v.chiave].orEmpty(), { testi[v.chiave] = it.trim() }, v.etichetta, Modifier.fillMaxWidth(), tastiera = KeyboardType.Email, abilitato = si)
                "ora", "giorno_mese" -> CampoTesto(testi[v.chiave].orEmpty(), { testi[v.chiave] = it }, v.etichetta, Modifier.fillMaxWidth(), tastiera = KeyboardType.Number, abilitato = si,
                    segnaposto = if (tipo(v) == "ora") "08:00" else "07-07")
                "testo_lungo" -> CampoTesto(testi[v.chiave].orEmpty(), { testi[v.chiave] = it }, v.etichetta, Modifier.fillMaxWidth(), righe = 4, abilitato = si)
                else -> CampoTesto(testi[v.chiave].orEmpty(), { testi[v.chiave] = it }, v.etichetta, Modifier.fillMaxWidth(), abilitato = si)
            }
        }
    }

    companion object {
        val PRIORITA = listOf("urgente" to "Urgente", "alta" to "Alta", "normale" to "Normale", "bassa" to "Bassa")
    }
}

/** Una riga "nome · valore ›" che porta a un'altra pagina (Impostazioni fiscali, Veicoli e rimborso km). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RigaCollegamentoImpostazione(nome: String, valore: String, onClick: () -> Unit) {
    RigaVoce(nome, sotto = valore.ifBlank { null }, onClick = onClick)
}

/** Le pillole Con i dettagli e altre accanto: in fila, a capo se serve. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PilloleInFila(parole: List<String>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { parole.forEach { Parola8(it) } }
}
