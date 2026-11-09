package eu.stgm.wisper.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import eu.stgm.wisper.Dati
import eu.stgm.wisper.rapportino.Collegamento
import eu.stgm.wisper.rapportino.Dashboard
import eu.stgm.wisper.rapportino.Moduli
import eu.stgm.wisper.rapportino.Permessi
import eu.stgm.wisper.rapportino.Riquadro8
import eu.stgm.wisper.rapportino.Sessione
import eu.stgm.wisper.rapportino.Sezioni8
import eu.stgm.wisper.rapportino.VoceDashboard
import kotlinx.coroutines.launch

/*
 * La Dashboard con le regole della fase 8 (fase8.md §8, §15.1): le regole le fa il server
 * (una cosa una voce, ordine fisso, tetti, raggruppamenti); il telefono mostra quattro
 * riquadri in due colonne, al massimo 7 · 7 · 5 righe con Altre N, Tutto quello che c'è da
 * fare, Cambia i riquadri, Nascondi per 30 giorni (tocco lungo), Da approvare in un foglio.
 */

// ---------------------------------------------------------------------------------- i riquadri

/** I quattro riquadri della persona (§8.4), in due colonne; il numero rosso solo dove il server lo dice. */
@Composable
internal fun RiquadriFase8(riquadri: List<Riquadro8>, onApri: (Riquadro8) -> Unit) {
    if (riquadri.isEmpty()) return
    Column(Modifier.bersaglio("riquadri"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        riquadri.chunked(2).forEach { riga ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                riga.forEach { r -> RiquadroNumero(r.visto, r.nome, Modifier.weight(1f), rosso = r.rosso, onClick = { onApri(r) }) }
                if (riga.size == 1) Box(Modifier.weight(1f))
            }
        }
    }
}

/**
 * I riquadri tra cui scegliere se il server non li dice (§8.4: ognuno con la regola di
 * permesso della sua fase). Il server resta quello che decide: salvaRiquadri rifiuta gli altri.
 */
internal object RiquadriPossibili {
    fun per(s: Sessione): List<String> {
        val p: Permessi = s.permessi
        val coll = s.collaboratore || s.esterno
        return Riquadro8.NOMI.keys.filter { k ->
            when (k) {
                "commesseAperte", "commesseInRitardo" -> p.vede(Moduli.COMMESSE) && !s.esterno
                "daFatturare", "daIncassare", "scaduto" -> p.costi && p.vede(Moduli.FATTURAZIONE)
                "nelConto" -> p.vede(Moduli.BANCHE)
                "ticketAperti", "interventiOggi" -> p.vede(Moduli.TICKET) && !coll
                "scadenzeVicine" -> (p.vede(Moduli.DOCUMENTI) || p.vede(Moduli.PERSONE)) && !coll
                "assentiOggi" -> p.vede(Moduli.PERSONE) && !coll
                "daApprovare" -> s.puoApprovare
                "tarateScadute" -> p.vede(Moduli.MEZZI) && !coll
                "dalPortale" -> p.vede(Moduli.PORTALE)
                "daMandareOggi" -> p.vede(Moduli.COMUNICAZIONI)
                "preventiviInAttesa" -> p.vede(Moduli.PREVENTIVI) && p.costi && !coll
                "oreSettimana", "attivitaOggi", "mieiTicket" -> coll
                else -> false
            }
        }
    }
}

// ---------------------------------------------------------------------------------- le sezioni

/** "URGENTI · 9", le righe (già nei tetti del server) e Altre N che apre Tutto quello che c'è da fare. */
@Composable
internal fun SezioneDashboard8(
    sezione: String, voci: List<VoceDashboard>, quante: Int?, modifier: Modifier = Modifier,
    altreModifier: Modifier = Modifier, contaPrima: Int = 0, onApri: (VoceDashboard) -> Unit, onLungo: (VoceDashboard) -> Unit, onAltre: () -> Unit,
) {
    val c = W.colori
    val tetto = Sezioni8.TETTI[sezione] ?: 7
    val visibili = voci.take(tetto)
    val altre = Sezioni8.altre(quante?.let { it - contaPrima }, visibili.size)
    if (visibili.isEmpty() && altre == 0) return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Etichetta((Sezioni8.NOMI[sezione] ?: sezione) + " · " + ((quante ?: (voci.size + contaPrima))))
        Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
            visibili.forEachIndexed { i, v ->
                if (i > 0) LineaElenco()
                RigaDashboard8(v, onClick = { onApri(v) }, onLungo = if (v.nascondibile) ({ onLungo(v) }) else null)
            }
            if (altre > 0) {
                LineaElenco()
                Row(
                    altreModifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onAltre).semantics { role = Role.Button }.padding(vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Altre $altre", style = Testi.forte, color = c.collegamento, modifier = Modifier.weight(1f))
                    Icon(Icone.freccia, null, tint = c.collegamento, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

/** Una riga della Dashboard: come quella delle fasi 1-7, col tocco lungo per Nascondi per 30 giorni. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun RigaDashboard8(v: VoceDashboard, onClick: () -> Unit, onLungo: (() -> Unit)?) {
    val c = W.colori
    val (fondo, tinta) = when (v.gravita.lowercase()) {
        "urgente" -> c.rossoTenue to c.rossoTesto
        "attenzione" -> c.gialloTenue to c.gialloTesto
        "soldi" -> c.inviatoFondo to c.inviatoTesto
        else -> c.superficie2 to c.testo2
    }
    val apribile = v.collegamento != null || v.pezzi.isNotEmpty() || v.tipo == "approvare"
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp)
            .combinedClickable(enabled = apribile || onLungo != null, onClick = { if (apribile) onClick() }, onLongClick = onLungo, onLongClickLabel = if (onLungo != null) "Nascondi per 30 giorni" else null)
            .semantics { role = Role.Button }
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(fondo), contentAlignment = Alignment.Center) {
            Icon(iconaVoce(v), null, tint = tinta, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(v.titolo, style = Testi.forte, color = c.testo, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (v.dettaglio.isNotBlank()) Text(v.dettaglio, style = Testi.secondario, color = c.tenue, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        quantoVoce(v)?.let { Text(it, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.ExtraBold), color = c.testo, maxLines = 1) }
        if (apribile) Icon(Icone.freccia, null, tint = c.moltoTenue, modifier = Modifier.size(18.dp))
    }
}

/** I due testi gialli scuri in fondo alla Dashboard (§15.1). */
@Composable
internal fun PiedeDashboard8(onTutto: () -> Unit, onRiquadri: () -> Unit) {
    val c = W.colori
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        PulsanteTesto("Tutto quello che c'è da fare", onTutto, Modifier.bersaglio("tutto"), colore = c.collegamento)
        PulsanteTesto("Cambia i riquadri", onRiquadri, colore = c.collegamento)
    }
}

// ---------------------------------------------------------------------------------- i fogli

/** Nascondi per 30 giorni (§8.2 punto 7): solo le voci info di Da pianificare, per la persona. */
@Composable
internal fun FoglioNascondi(dati: Dati, v: VoceDashboard, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    var lavoro by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Nascondi per 30 giorni", style = Testi.titoloScheda, color = c.testo)
        Text(v.titolo, style = Testi.forte, color = c.testo)
        Text("Torna da sola dopo 30 giorni, o da Tutto quello che c'è da fare.", style = Testi.secondario, color = c.tenue)
        PulsanteBordo(if (lavoro) "Un momento…" else "Nascondi per 30 giorni", {
            if (lavoro) return@PulsanteBordo
            lavoro = true
            scope.launch {
                dati.fase8.nascondiVoce(v.oggetto.ifBlank { v.tipo + ":" + v.titolo })
                    .onSuccess { avvisi.mostra("Nascosta per 30 giorni"); Giri8.tutto++; onChiudi() }
                    .onFailure { avvisi.mostra(spiegaErrore2(it, "Non è stata nascosta: riprova")) }
                lavoro = false
            }
        }, Modifier.fillMaxWidth())
        PulsanteTesto("Annulla", onChiudi, Modifier.fillMaxWidth(), colore = c.testo)
    }
}

/** "N cose da approvare" (§8.2 punto 5): le tre righe, ognuna col suo numero, che aprono dove si approva. */
@Composable
internal fun FoglioDaApprovare(v: VoceDashboard?, numero: String, nav: Navigatore, dati: Dati, onChiudi: () -> Unit) {
    val c = W.colori
    val viste by dati.viste.collectAsStateWithLifecycle()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    FoglioDalBasso(onChiudi) {
        Text(v?.titolo ?: "$numero da approvare", style = Testi.titoloScheda, color = c.testo)
        val righe = v?.pezzi.orEmpty().ifEmpty {
            // Il server non ha mandato le righe: le tre strade dell'accordo, quelle che la persona vede.
            buildList {
                if (sessione.puoApprovare) add(eu.stgm.wisper.rapportino.PezzoDaApprovare("Rapportini e spese", "Rapportini › Da approvare", Collegamento("rapportini", parametri = mapOf("segmento" to "daApprovare"))))
                if (sessione.puoApprovareAssenze) add(eu.stgm.wisper.rapportino.PezzoDaApprovare("Ferie e permessi", "Persone › Ferie da approvare", Collegamento("persone", parametri = mapOf("segmento" to "ferie"))))
                if (sessione.puoApprovareDocumenti) add(eu.stgm.wisper.rapportino.PezzoDaApprovare("Documenti", "Documenti › Da approvare", Collegamento("documenti", parametri = mapOf("segmento" to "approvare"))))
            }
        }
        SchedaElenco {
            righe.forEachIndexed { i, r ->
                if (i > 0) LineaElenco()
                RigaVoce(r.titolo, sotto = r.dove.ifBlank { null }, valore = r.numero?.toString(), icona = Icone.spunta, onClick = { onChiudi(); apriCollegamento(r.collegamento, nav, viste.map { it.rapportino }) })
            }
        }
    }
}

/** Cambia i riquadri (§8.4): ne sceglie 4, l'ordine è quello del tocco. Giallo Salva i riquadri nel foglio. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FoglioRiquadri(dati: Dati, d: Dashboard, onChiudi: () -> Unit) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val sessione by dati.sessione.collectAsStateWithLifecycle()
    val possibili = d.riquadriPossibili.ifEmpty { RiquadriPossibili.per(sessione) }
    val scelti = remember { mutableStateListOf<String>().apply { addAll(d.riquadri.orEmpty().map { it.chiave }.filter { it in possibili }) } }
    var errore by remember { mutableStateOf<String?>(null) }
    var lavoro by remember { mutableStateOf(false) }
    FoglioDalBasso(onChiudi) {
        Text("Cambia i riquadri", style = Testi.titoloScheda, color = c.testo)
        Text("Scegline 4 · ${scelti.size} " + if (scelti.size == 1) "scelto" else "scelti", style = Testi.secondario, color = c.tenue)
        Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                possibili.forEach { k ->
                    val n = scelti.indexOf(k)
                    val su = n >= 0
                    Row(
                        Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp)).background(if (su) c.gialloTenue else c.foglio)
                            .border(1.5.dp, if (su) c.gialloTesto else c.bordoCampo, RoundedCornerShape(14.dp))
                            .clickable {
                                errore = null
                                if (su) scelti.remove(k) else if (scelti.size < 4) scelti.add(k) else errore = "Ne hai già scelti 4: togline uno"
                            }
                            .semantics { role = Role.Checkbox; selected = su; contentDescription = (Riquadro8.NOMI[k] ?: k) + if (su) ", ${n + 1}°" else "" }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(Riquadro8.NOMI[k] ?: k, style = Testi.secondarioGrande.copy(fontWeight = FontWeight.Bold), color = c.testo)
                        if (su) Text("${n + 1}°", style = Testi.piccolo.copy(fontWeight = FontWeight.ExtraBold), color = c.gialloTesto)
                    }
                }
            }
        }
        errore?.let { Text(it, style = Testi.secondario, color = c.rossoTesto) }
        PulsantePrincipale(if (lavoro) "Salvo…" else "Salva i riquadri", {
            if (lavoro) return@PulsantePrincipale
            if (scelti.size != 4) { errore = "Scegline 4"; return@PulsantePrincipale }
            lavoro = true
            scope.launch {
                dati.fase8.salvaRiquadri(scelti.toList())
                    .onSuccess { avvisi.mostra("Riquadri cambiati"); onChiudi() }
                    .onFailure { errore = spiegaErrore2(it, "I riquadri non sono stati salvati: riprova") }
                lavoro = false
            }
        }, abilitato = !lavoro)
    }
}

// ---------------------------------------------------------------------------------- Tutto quello che c'è da fare (§8.5)

@Composable
fun SchermataTutto(dati: Dati, nav: Navigatore) {
    val c = W.colori
    val avvisi = LocalAvvisi.current
    val scope = rememberCoroutineScope()
    val viste by dati.viste.collectAsStateWithLifecycle()
    var giro by remember { mutableStateOf(0) }
    val lettura = rememberLettura(Unit, giro + Giri8.tutto * 1000) { dati.fase8.dashboardTutto() }
    var nascondi by remember { mutableStateOf<VoceDashboard?>(null) }
    var approvare by remember { mutableStateOf<VoceDashboard?>(null) }
    var mostro by remember { mutableStateOf(false) }
    val dashboard by dati.dashboard.collectAsStateWithLifecycle()
    var cambiaRiquadri by remember { mutableStateOf(false) }
    var approvareRiquadro by remember { mutableStateOf<Pair<VoceDashboard?, String>?>(null) }
    fun apri(col: Collegamento?) = apriCollegamento(col, nav, viste.map { it.rapportino })

    Column(
        Modifier.fillMaxSize().background(c.fondo).verticalScroll(rememberScrollState()).padding(MarginePagina).padding(bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Testata(onIndietro = { nav.indietro() })
        TitoloPagina("Tutto quello che c'è da fare")
        // 09/11/2026 (fai.md §2): i riquadri dei numeri stanno qui, non più in casa.
        dashboard?.let { dd ->
            RiquadriFase8(dd.riquadri.orEmpty()) { r ->
                if (r.chiave == "daApprovare" && (r.collegamento == null || r.collegamento.pagina == "approvare")) {
                    approvareRiquadro = dd.urgenti.plus(dd.settimana).plus(dd.pianificare).firstOrNull { it.tipo == "approvare" } to r.visto
                } else apri(r.collegamento)
            }
            if (dd.regoleNuove) PulsanteTesto("Cambia i riquadri", { cambiaRiquadri = true }, Modifier.bersaglio("tutto"))
        }
        when (lettura) {
            is Lettura.Pronta -> {
                val d = lettura.dato
                val perSezione = mapOf(Sezioni8.URGENTI to d.urgenti, Sezioni8.SETTIMANA to d.settimana, Sezioni8.PIANIFICARE to d.pianificare)
                SegmentiScorrevoli(perSezione.map { (k, l) -> k to ((Sezioni8.NOMI[k] ?: k) + " · " + l.size) }, RicordoTutto.sezione, { RicordoTutto.sezione = it; RicordoTutto.area = "" })
                val qui = perSezione[RicordoTutto.sezione].orEmpty()
                // Le pillole delle aree: solo quelle con voci (§8.5).
                val aree = Sezioni8.AREE.filter { (k, _) -> k.isEmpty() || qui.any { it.area == k } }
                if (aree.none { it.first == RicordoTutto.area }) RicordoTutto.area = ""
                if (aree.size > 2) Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    aree.forEach { (k, nome) -> Pillola(nome, RicordoTutto.area == k, { RicordoTutto.area = k }, altezza = 44.dp) }
                }
                val elenco = qui.filter { RicordoTutto.area.isEmpty() || it.area == RicordoTutto.area }
                if (elenco.isEmpty()) RigaCalma("Niente qui.")
                else Scheda(orizzontale = 18.dp, verticale = 0.dp, raggio = 22.dp, spazio = 0.dp) {
                    elenco.forEachIndexed { i, v ->
                        if (i > 0) LineaElenco()
                        RigaDashboard8(v, onClick = {
                            if (v.tipo == "approvare") approvare = v else apriCollegamento(v.collegamento, nav, viste.map { it.rapportino })
                        }, onLungo = if (v.nascondibile) ({ nascondi = v }) else null)
                    }
                }
                if (d.nascoste > 0) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Etichetta("Nascoste · ${d.nascoste}")
                    PulsanteBordo(if (mostro) "Un momento…" else "Mostrale", {
                        if (mostro) return@PulsanteBordo
                        mostro = true
                        scope.launch {
                            dati.fase8.mostraNascoste().onSuccess { avvisi.mostra("Le voci nascoste sono tornate"); giro++ }.onFailure { avvisi.mostra(spiegaErrore2(it, "Non sono tornate: riprova")) }
                            mostro = false
                        }
                    }, Modifier.fillMaxWidth())
                }
            }
            else -> StatoLettura(lettura) { giro++ }
        }
    }
    nascondi?.let { v -> FoglioNascondi(dati, v) { nascondi = null; giro++ } }
    approvare?.let { v -> FoglioDaApprovare(v, "", nav, dati) { approvare = null } }
    approvareRiquadro?.let { (v, numero) -> FoglioDaApprovare(v, numero, nav, dati) { approvareRiquadro = null } }
    if (cambiaRiquadri) dashboard?.let { d -> FoglioRiquadri(dati, d) { cambiaRiquadri = false } }
}

// ---------------------------------------------------------------------------------- icone e numeri delle voci

/** L'icona di una voce (le fasi 1-7 e i tipi nuovi della fase 8). */
internal fun iconaVoce(v: VoceDashboard) = when (v.tipo.lowercase()) {
    "sistema", "integrazione" -> if (v.gravita == "urgente") Icone.allarme else Icone.spina
    "ripristino", "copia" -> Icone.disco
    "versione" -> Icone.scarica
    "controlli" -> Icone.controlli
    else -> iconaDashboard(v)
}

/** Il numero a destra di una riga: euro o ore (come la fase 1). */
internal fun quantoVoce(v: VoceDashboard): String? {
    val q = v.quanto ?: return null
    // Con le regole nuove il server scrive sempre l'unità: senza (un gruppo "5 scadenze") il numero è già nel titolo.
    return when (v.unita.lowercase()) {
        "euro" -> eu.stgm.wisper.rapportino.Numeri.euro(q)
        "ore" -> eu.stgm.wisper.rapportino.Numeri.ore(q)
        else -> null
    }
}
